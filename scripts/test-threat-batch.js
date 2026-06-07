const fs = require('fs');
const path = require('path');
const ort = require('onnxruntime-node');
const { loadModel } = require('../src/yolo/loadModel');
const { preprocessImage } = require('../src/yolo/preprocessImage');
const { postprocessDetections, DEFAULT_CONFIDENCE_THRESHOLD } = require('../src/yolo/postprocessDetections');
const { assessThreat } = require('../src/yolo/assessThreat');

const IMAGES_DIR = path.resolve(__dirname, '../images');

async function runImageInference(session, imagePath, modelType) {
  const preprocessed = await preprocessImage(imagePath);
  const inputName = session.inputNames[0];
  const inputTensor = new ort.Tensor('float32', preprocessed.tensorData, preprocessed.inputShape);
  const results = await session.run({ [inputName]: inputTensor });
  const outputName = session.outputNames[0];
  const detections = postprocessDetections(results[outputName].data, DEFAULT_CONFIDENCE_THRESHOLD);
  const threat = assessThreat(detections);

  return {
    image: path.basename(imagePath),
    model: modelType,
    detections: detections.length,
    threatLevel: threat.threatLevel,
    threatScore: threat.threatScore,
    classCounts: threat.classCounts,
  };
}

async function main() {
  const modelType = (process.argv[2] || 'fp32').toLowerCase();

  if (!['fp32', 'int8'].includes(modelType)) {
    console.error(`Unknown model type "${modelType}". Use "fp32" or "int8".`);
    process.exitCode = 1;
    return;
  }

  if (!fs.existsSync(IMAGES_DIR)) {
    console.error(`Images folder not found: ${IMAGES_DIR}`);
    process.exitCode = 1;
    return;
  }

  const imageFiles = fs
    .readdirSync(IMAGES_DIR)
    .filter((file) => /\.(jpg|jpeg|png|webp)$/i.test(file))
    .sort();

  if (imageFiles.length === 0) {
    console.error('No images found in images/');
    process.exitCode = 1;
    return;
  }

  console.log(`Running threat assessment on ${imageFiles.length} images (${modelType})...\n`);

  const session = await loadModel(modelType);
  const results = [];

  for (const file of imageFiles) {
    const imagePath = path.join(IMAGES_DIR, file);
    const result = await runImageInference(session, imagePath, modelType);
    results.push(result);

    console.log(`${result.image}`);
    console.log(`  detections: ${result.detections}`);
    console.log(`  threat: ${result.threatLevel} (score ${result.threatScore})`);
    console.log(`  classes: ${JSON.stringify(result.classCounts)}`);
    console.log('');
  }

  const levelOrder = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };
  const highest = results.reduce((best, current) => {
    const levelDiff = levelOrder[current.threatLevel] - levelOrder[best.threatLevel];
    if (levelDiff > 0) return current;
    if (levelDiff < 0) return best;
    return current.threatScore > best.threatScore ? current : best;
  }, results[0]);

  console.log('--- Summary ---');
  console.log(`Highest threat: ${highest.image} -> ${highest.threatLevel} (${highest.threatScore})`);
}

main().catch((error) => {
  console.error(`Threat batch test failed: ${error.message}`);
  process.exitCode = 1;
});
