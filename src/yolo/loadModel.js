const fs = require('fs');
const path = require('path');
const ort = require('onnxruntime-node');

const MODEL_FILES = {
  fp32: 'roadvision_yolo_fp32.onnx',
  int8: 'roadvision_yolo_int8_dynamic.onnx',
};

/**
 * Resolve the ONNX model path relative to the repository root.
 * @param {'fp32' | 'int8'} modelType
 * @returns {string}
 */
function resolveModelPath(modelType = 'fp32') {
  const filename = MODEL_FILES[modelType];

  if (!filename) {
    throw new Error(`Unknown model type "${modelType}". Use "fp32" or "int8".`);
  }

  return path.resolve(__dirname, '../../models', filename);
}

/**
 * Load an ONNX inference session.
 * Defaults to the FP32 model because it is the most reliable baseline.
 *
 * @param {'fp32' | 'int8'} [modelType='fp32']
 * @returns {Promise<import('onnxruntime-node').InferenceSession>}
 */
async function loadModel(modelType = 'fp32') {
  const modelPath = resolveModelPath(modelType);

  if (!fs.existsSync(modelPath)) {
    throw new Error(`Model file not found: ${modelPath}`);
  }

  return ort.InferenceSession.create(modelPath);
}

module.exports = {
  MODEL_FILES,
  resolveModelPath,
  loadModel,
};
