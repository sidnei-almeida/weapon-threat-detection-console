const { isRoboflowConfigured } = require('../services/detectionConfig');
const { log } = require('../utils/logger');

async function warmUpModel({ useLocalYolo = true } = {}) {
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

  const localYolo = require('../services/localYolo');
  await localYolo.getSession();
  log('INFO', 'YOLO local pronto para inferência');
  return { backend: 'yolo-local', ready: true };
}

async function analyzeBufferCore(buffer, cameraId, zone, { useLocalYolo = true } = {}) {
  if (isRoboflowConfigured() && process.env.DETECTION_BACKEND === 'roboflow') {
    const roboflow = require('../services/roboflow');
    const resizedBuffer = await roboflow.resizeImageForApi(buffer);
    const [weaponResult, maskResult] = await Promise.all([
      roboflow.analyzeImage(resizedBuffer, 'image/jpeg'),
      roboflow.analyzeMask(resizedBuffer, 'image/jpeg'),
    ]);

    const combinedPredictions = [
      ...(weaponResult.predictions || []),
      ...(maskResult.predictions || []),
    ];

    const imageMeta = weaponResult.image || maskResult.image || { width: 1280, height: 720 };
    const processedDetections = roboflow.processDetections(
      { predictions: combinedPredictions, image: imageMeta },
      cameraId,
      zone,
    );

    return {
      processedDetections,
      imageMeta,
      backend: 'roboflow',
    };
  }

  if (useLocalYolo) {
    const localYolo = require('../services/localYolo');
    const result = await localYolo.analyzeBufferLocal(buffer, cameraId, zone);

    if (result.rawCount > 0) {
      log('INFO', `YOLO local: ${result.rawCount} detecção(ões) em ${cameraId}`);
    }

    return {
      processedDetections: result.processedDetections,
      imageMeta: result.imageMeta,
      backend: result.backend,
    };
  }

  const error = new Error('Inferência disponível no navegador (YOLO client-side).');
  error.code = 'CLIENT_INFERENCE_REQUIRED';
  throw error;
}

module.exports = {
  warmUpModel,
  analyzeBufferCore,
  clientInference: false,
  useLocalYolo: true,
};
