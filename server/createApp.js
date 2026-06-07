require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const morgan = require('morgan');
const multer = require('multer');
const axios = require('axios');

const roboflow = require('./services/roboflow');
const threatEngine = require('./services/threatEngine');
const { listVideoCameras } = require('./services/videoCameras');
const { isRoboflowConfigured } = require('./services/detectionConfig');
const { log, logThreat } = require('./utils/logger');

function createApp(options = {}) {
  const {
    useLocalYolo = false,
    clientInference = false,
  } = options;

  const app = express();

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
  });

  let ioEmitter = {
    emit() {},
    on() {},
  };

  function setSocketIO(io) {
    ioEmitter = io;
  }

  async function warmUpModel() {
    if (clientInference) {
      return {
        backend: 'yolo-client',
        clientInference: true,
        ready: true,
      };
    }

    if (isRoboflowConfigured() && process.env.DETECTION_BACKEND === 'roboflow') {
      return { backend: 'roboflow', ready: true };
    }

    if (!useLocalYolo) {
      return {
        backend: 'yolo-client',
        clientInference: true,
        ready: true,
      };
    }

    const localYolo = require('./services/localYolo');
    await localYolo.getSession();
    log('INFO', 'YOLO local pronto para inferência');
    return { backend: 'yolo-local', ready: true };
  }

  async function analyzeBuffer(buffer, cameraId, zone) {
    let processedDetections;
    let imageMeta;
    let backend;

    if (isRoboflowConfigured() && process.env.DETECTION_BACKEND === 'roboflow') {
      const resizedBuffer = await roboflow.resizeImageForApi(buffer);
      const [weaponResult, maskResult] = await Promise.all([
        roboflow.analyzeImage(resizedBuffer, 'image/jpeg'),
        roboflow.analyzeMask(resizedBuffer, 'image/jpeg'),
      ]);

      const combinedPredictions = [
        ...(weaponResult.predictions || []),
        ...(maskResult.predictions || []),
      ];

      imageMeta = weaponResult.image || maskResult.image || { width: 1280, height: 720 };
      processedDetections = roboflow.processDetections(
        { predictions: combinedPredictions, image: imageMeta },
        cameraId,
        zone,
      );
      backend = 'roboflow';
    } else if (useLocalYolo) {
      const localYolo = require('./services/localYolo');
      const result = await localYolo.analyzeBufferLocal(buffer, cameraId, zone);
      processedDetections = result.processedDetections;
      imageMeta = result.imageMeta;
      backend = result.backend;

      if (result.rawCount > 0) {
        log('INFO', `YOLO local: ${result.rawCount} detecção(ões) em ${cameraId}`);
      }
    } else {
      const error = new Error('Inferência disponível no navegador (YOLO client-side).');
      error.code = 'CLIENT_INFERENCE_REQUIRED';
      throw error;
    }

    for (const detection of processedDetections) {
      threatEngine.addEvent(detection);

      if (detection.riskLevel === 'HIGH') {
        logThreat(detection.id, detection.objectClass, detection.confidence, zone);
        ioEmitter.emit('threat-alert', detection);
      }
    }

    ioEmitter.emit('detections', {
      cameraId,
      zone,
      detections: processedDetections,
      imageWidth: imageMeta.width,
      imageHeight: imageMeta.height,
    });

    return {
      processedDetections,
      imageMeta,
      backend,
    };
  }

  app.use(cors());
  app.use(express.json());

  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    app.use(morgan('dev'));
  }

  if (!process.env.VERCEL) {
    app.use(express.static(path.join(__dirname, '../public')));
  }

  app.post('/api/analyze', upload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Nenhuma imagem enviada' });
      }

      const cameraId = req.body.cameraId || 'CAM-01';
      const zone = req.body.zone || 'Unknown Zone';
      const { processedDetections, imageMeta, backend } = await analyzeBuffer(
        req.file.buffer,
        cameraId,
        zone,
      );

      return res.json({
        success: true,
        detections: processedDetections,
        count: processedDetections.length,
        imageWidth: imageMeta.width,
        imageHeight: imageMeta.height,
        backend,
      });
    } catch (error) {
      if (error.code === 'CLIENT_INFERENCE_REQUIRED') {
        return res.status(501).json({
          error: error.message,
          clientInference: true,
        });
      }

      log('ERROR', 'Analyze failed', { message: error.message });
      return res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/analyze/url', async (req, res) => {
    try {
      const { imageUrl, cameraId = 'CAM-01', zone = 'Unknown Zone' } = req.body;

      if (!imageUrl) {
        return res.status(400).json({ error: 'imageUrl é obrigatório' });
      }

      const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(response.data);
      const { processedDetections, imageMeta } = await analyzeBuffer(buffer, cameraId, zone);

      return res.json({
        success: true,
        detections: processedDetections,
        count: processedDetections.length,
        imageWidth: imageMeta.width,
        imageHeight: imageMeta.height,
      });
    } catch (error) {
      if (error.code === 'CLIENT_INFERENCE_REQUIRED') {
        return res.status(501).json({
          error: error.message,
          clientInference: true,
        });
      }

      return res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/events', (req, res) => {
    const limit = Number(req.query.limit) || 50;
    let events = threatEngine.getRecentEvents(limit);

    if (req.query.riskLevel) {
      events = events.filter((event) => event.riskLevel === req.query.riskLevel);
    }

    return res.json({
      events,
      total: events.length,
    });
  });

  app.get('/api/events/:eventId', (req, res) => {
    const event = threatEngine.getEventById(req.params.eventId);

    if (!event) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }

    return res.json(event);
  });

  app.patch('/api/events/:eventId/review', (req, res) => {
    const updated = threatEngine.markAsReviewed(req.params.eventId);

    if (!updated) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }

    ioEmitter.emit('event-updated', { eventId: req.params.eventId, status: 'Reviewed' });
    return res.json({ success: true });
  });

  app.patch('/api/events/:eventId/false-alarm', (req, res) => {
    const updated = threatEngine.markAsFalseAlarm(req.params.eventId);

    if (!updated) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }

    ioEmitter.emit('event-updated', { eventId: req.params.eventId, status: 'False Alarm' });
    return res.json({ success: true });
  });

  app.get('/api/cameras', (req, res) => {
    const cameras = listVideoCameras();
    return res.json({
      cameras,
      total: cameras.length,
    });
  });

  app.get('/api/stats', (req, res) => {
    return res.json(threatEngine.getStats());
  });

  app.get('/api/confidence-trend', (req, res) => {
    const { cameraId } = req.query;
    const seconds = Number(req.query.seconds) || 30;

    if (!cameraId) {
      return res.status(400).json({ error: 'cameraId é obrigatório' });
    }

    return res.json({
      trend: threatEngine.getConfidenceTrend(cameraId, seconds),
    });
  });

  app.get('/api/health', (req, res) => {
    const roboflowActive = isRoboflowConfigured() && process.env.DETECTION_BACKEND === 'roboflow';

    return res.json({
      ok: true,
      vercel: Boolean(process.env.VERCEL),
      clientInference: clientInference || (!useLocalYolo && !roboflowActive),
      backend: roboflowActive
        ? 'roboflow'
        : (clientInference || !useLocalYolo ? 'yolo-client' : 'yolo-local'),
    });
  });

  app.get('/api/warmup', async (req, res) => {
    try {
      const result = await warmUpModel();
      return res.json({
        ready: true,
        ...result,
      });
    } catch (error) {
      log('ERROR', 'Warmup failed', { message: error.message });
      return res.status(503).json({
        ready: false,
        error: error.message,
      });
    }
  });

  return {
    app,
    setSocketIO,
    analyzeBuffer,
    warmUpModel,
  };
}

module.exports = {
  createApp,
};
