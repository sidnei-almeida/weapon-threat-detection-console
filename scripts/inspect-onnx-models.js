const fs = require('fs');
const path = require('path');
const ort = require('onnxruntime-node');
const { resolveModelPath, MODEL_FILES } = require('../src/yolo/loadModel');

const INPUT_SHAPE = [1, 3, 640, 640];
const MODEL_VARIANTS = ['fp32', 'int8'];

function formatShape(shape) {
  if (!shape || shape.length === 0) {
    return 'unknown';
  }

  return `[${shape.join(', ')}]`;
}

function formatTensorType(type) {
  if (!type) {
    return 'unknown';
  }

  if (String(type).startsWith('tensor(')) {
    return String(type);
  }

  if (type === 'float32') {
    return 'tensor(float)';
  }

  return `tensor(${type})`;
}

function findTensorMetadata(names, metadataList, name) {
  const index = names.indexOf(name);

  if (index >= 0 && metadataList[index]) {
    return metadataList[index];
  }

  return metadataList.find((entry) => entry?.name === name);
}

function createDummyInputTensor() {
  const elementCount = INPUT_SHAPE.reduce((total, dim) => total * dim, 1);
  const data = new Float32Array(elementCount);
  return new ort.Tensor('float32', data, INPUT_SHAPE);
}

function printFirstValues(data, count = 12) {
  const values = Array.from(data).slice(0, count);
  return values.map((value) => Number(value).toFixed(6)).join(', ');
}

async function inspectModel(modelType) {
  const modelName = MODEL_FILES[modelType];
  const modelPath = resolveModelPath(modelType);

  console.log(`\nModel: ${modelName}`);

  if (!fs.existsSync(modelPath)) {
    throw new Error(`Model file not found: ${modelPath}`);
  }

  const session = await ort.InferenceSession.create(modelPath);

  for (const inputName of session.inputNames) {
    const metadata = findTensorMetadata(session.inputNames, session.inputMetadata, inputName);
    const shape = formatShape(metadata?.shape ?? metadata?.dimensions);
    const type = formatTensorType(metadata?.type);
    console.log(`Input: ${inputName} ${shape} ${type}`);
  }

  for (const outputName of session.outputNames) {
    const metadata = findTensorMetadata(session.outputNames, session.outputMetadata, outputName);
    const shape = formatShape(metadata?.shape ?? metadata?.dimensions);
    const type = formatTensorType(metadata?.type);
    console.log(`Output: ${outputName} ${shape} ${type}`);
  }

  const inputName = session.inputNames[0];
  const inputTensor = createDummyInputTensor();
  const results = await session.run({ [inputName]: inputTensor });
  const outputName = session.outputNames[0];
  const outputTensor = results[outputName];

  console.log('Dummy inference: OK');
  console.log(`Returned output: ${outputName}`);
  console.log(`Returned shape: ${formatShape(outputTensor.dims)}`);
  console.log(`Data length: ${outputTensor.data.length}`);
  console.log(`First 12 values: [${printFirstValues(outputTensor.data)}]`);

  return {
    modelType,
    modelName,
    loaded: true,
    inferenceOk: true,
    outputShape: outputTensor.dims,
  };
}

async function main() {
  const repoRoot = path.resolve(__dirname, '..');
  console.log(`Repository root: ${repoRoot}`);
  console.log('Inspecting ONNX models...');

  for (const modelType of MODEL_VARIANTS) {
    try {
      await inspectModel(modelType);
    } catch (error) {
      console.error(`\nModel: ${MODEL_FILES[modelType]}`);
      console.error('Dummy inference: FAILED');
      console.error(`Error: ${error.message}`);
    }
  }
}

main().catch((error) => {
  console.error(`Fatal error: ${error.message}`);
  process.exitCode = 1;
});
