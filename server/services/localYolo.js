const ort = require('onnxruntime-node');
const { loadModel } = require('../../src/yolo/loadModel');
const { preprocessBuffer, TARGET_WIDTH, TARGET_HEIGHT } = require('../../src/yolo/preprocessImage');
const { postprocessDetections, DEFAULT_CONFIDENCE_THRESHOLD } = require('../../src/yolo/postprocessDetections');
const { processDetections } = require('./detectionProcessing');
const { log } = require('../utils/logger');

let sessionPromise = null;

function getSession() {
  if (!sessionPromise) {
    const modelType = process.env.YOLO_MODEL || 'fp32';
    sessionPromise = loadModel(modelType).catch((error) => {
      sessionPromise = null;
      throw error;
    });
    log('INFO', `YOLO local carregando modelo ${modelType}`);
  }
  return sessionPromise;
}

function yoloDetectionsToPredictions(detections, originalWidth, originalHeight) {
  const scaleX = originalWidth / TARGET_WIDTH;
  const scaleY = originalHeight / TARGET_HEIGHT;

  return detections.map((detection) => {
    const x1 = detection.x1 * scaleX;
    const y1 = detection.y1 * scaleY;
    const x2 = detection.x2 * scaleX;
    const y2 = detection.y2 * scaleY;

    return {
      class: detection.className,
      confidence: detection.confidence,
      x: (x1 + x2) / 2,
      y: (y1 + y2) / 2,
      width: x2 - x1,
      height: y2 - y1,
    };
  });
}

async function analyzeBufferLocal(imageBuffer, cameraId, zone, confidenceThreshold = DEFAULT_CONFIDENCE_THRESHOLD) {
  const session = await getSession();
  const preprocessed = await preprocessBuffer(imageBuffer);

  const inputName = session.inputNames[0];
  const inputTensor = new ort.Tensor('float32', preprocessed.tensorData, preprocessed.inputShape);
  const results = await session.run({ [inputName]: inputTensor });
  const outputName = session.outputNames[0];
  const rawDetections = postprocessDetections(results[outputName].data, confidenceThreshold);

  const predictions = yoloDetectionsToPredictions(
    rawDetections,
    preprocessed.originalWidth,
    preprocessed.originalHeight,
  );

  const imageMeta = {
    width: preprocessed.originalWidth,
    height: preprocessed.originalHeight,
  };

  const processedDetections = processDetections(
    { predictions, image: imageMeta },
    cameraId,
    zone,
  );

  return {
    processedDetections,
    imageMeta,
    backend: 'yolo-local',
    rawCount: rawDetections.length,
  };
}

module.exports = {
  analyzeBufferLocal,
  getSession,
};
