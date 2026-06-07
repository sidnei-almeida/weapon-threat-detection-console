const ort = require('onnxruntime-node');
const { preprocessImage } = require('./preprocessImage');
const { postprocessDetections, DEFAULT_CONFIDENCE_THRESHOLD } = require('./postprocessDetections');
const { assessThreat } = require('./assessThreat');

/**
 * Run YOLO ONNX inference on a single image file.
 *
 * @param {import('onnxruntime-node').InferenceSession} session
 * @param {string} imagePath
 * @param {number} [confidenceThreshold]
 * @returns {Promise<{
 *   detections: Array,
 *   threat: ReturnType<typeof assessThreat>,
 *   originalWidth: number,
 *   originalHeight: number
 * }>}
 */
async function inferImage(session, imagePath, confidenceThreshold = DEFAULT_CONFIDENCE_THRESHOLD) {
  const preprocessed = await preprocessImage(imagePath);
  const inputName = session.inputNames[0];
  const inputTensor = new ort.Tensor('float32', preprocessed.tensorData, preprocessed.inputShape);
  const results = await session.run({ [inputName]: inputTensor });
  const outputName = session.outputNames[0];
  const detections = postprocessDetections(results[outputName].data, confidenceThreshold);
  const threat = assessThreat(detections);

  return {
    detections,
    threat,
    originalWidth: preprocessed.originalWidth,
    originalHeight: preprocessed.originalHeight,
  };
}

module.exports = {
  inferImage,
};
