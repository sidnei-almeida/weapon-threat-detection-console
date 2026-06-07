const fs = require('fs');
const path = require('path');
const ort = require('onnxruntime-node');
const { loadModel } = require('../src/yolo/loadModel');
const { preprocessImage } = require('../src/yolo/preprocessImage');
const { postprocessDetections, DEFAULT_CONFIDENCE_THRESHOLD } = require('../src/yolo/postprocessDetections');
const { assessThreat } = require('../src/yolo/assessThreat');

function printUsage() {
  console.log('Usage:');
  console.log('  node scripts/test-image-inference.js <image-path> [fp32|int8]');
  console.log('');
  console.log('Examples:');
  console.log('  node scripts/test-image-inference.js ./images/gun_01.jpg');
  console.log('  node scripts/test-image-inference.js ./images/knife_01.jpg int8');
}

function formatDetection(detection) {
  return {
    classId: detection.classId,
    className: detection.className,
    confidence: Number(detection.confidence.toFixed(4)),
    box: {
      x1: Number(detection.x1.toFixed(2)),
      y1: Number(detection.y1.toFixed(2)),
      x2: Number(detection.x2.toFixed(2)),
      y2: Number(detection.y2.toFixed(2)),
    },
  };
}

async function main() {
  const imagePathArg = process.argv[2];
  const modelTypeArg = (process.argv[3] || 'fp32').toLowerCase();

  if (!imagePathArg) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (!['fp32', 'int8'].includes(modelTypeArg)) {
    console.error(`Unknown model type "${modelTypeArg}". Use "fp32" or "int8".`);
    process.exitCode = 1;
    return;
  }

  const imagePath = path.resolve(process.cwd(), imagePathArg);

  if (!fs.existsSync(imagePath)) {
    console.error(`Image file not found: ${imagePath}`);
    process.exitCode = 1;
    return;
  }

  const session = await loadModel(modelTypeArg);
  const preprocessed = await preprocessImage(imagePath);

  const inputName = session.inputNames[0];
  const inputTensor = new ort.Tensor('float32', preprocessed.tensorData, preprocessed.inputShape);
  const results = await session.run({ [inputName]: inputTensor });

  const outputName = session.outputNames[0];
  const outputTensor = results[outputName];
  const detections = postprocessDetections(outputTensor.data, DEFAULT_CONFIDENCE_THRESHOLD);
  const threat = assessThreat(detections);
  const formattedDetections = detections.map(formatDetection);

  console.log(`Model: ${modelTypeArg}`);
  console.log(`Image: ${imagePathArg}`);
  console.log(`Original size: ${preprocessed.originalWidth}x${preprocessed.originalHeight}`);
  console.log(`Detections: ${formattedDetections.length}`);
  console.log(`Threat level: ${threat.threatLevel}`);
  console.log(`Threat score: ${threat.threatScore}`);
  console.log(`Class counts: ${JSON.stringify(threat.classCounts)}`);
  console.log('');
  console.log(JSON.stringify(formattedDetections, null, 2));
}

main().catch((error) => {
  console.error(`Inference failed: ${error.message}`);
  process.exitCode = 1;
});
