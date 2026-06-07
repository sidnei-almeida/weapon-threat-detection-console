const sharp = require('sharp');

const TARGET_WIDTH = 640;
const TARGET_HEIGHT = 640;
const INPUT_SHAPE = [1, 3, TARGET_WIDTH, TARGET_HEIGHT];

/**
 * Prepare an image file for YOLO inference.
 *
 * Steps:
 * 1. Read the image from disk.
 * 2. Resize it to 640x640 (simple stretch for now; letterbox can come later).
 * 3. Convert to RGB and read raw pixel bytes (HWC layout).
 * 4. Normalize each channel from 0-255 to 0-1.
 * 5. Rearrange pixels from HWC to NCHW for the ONNX model.
 *
 * @param {string} imagePath
 * @returns {Promise<{
 *   tensorData: Float32Array,
 *   inputShape: number[],
 *   originalWidth: number,
 *   originalHeight: number,
 *   resizedWidth: number,
 *   resizedHeight: number
 * }>}
 */
async function preprocessImage(imagePath) {
  const image = sharp(imagePath);
  const metadata = await image.metadata();

  const originalWidth = metadata.width;
  const originalHeight = metadata.height;

  if (!originalWidth || !originalHeight) {
    throw new Error(`Unable to read image dimensions: ${imagePath}`);
  }

  const { data } = await image
    .resize(TARGET_WIDTH, TARGET_HEIGHT, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return buildPreprocessResult(data, originalWidth, originalHeight);
}

/**
 * Prepare an in-memory image buffer for YOLO inference.
 *
 * @param {Buffer} imageBuffer
 * @returns {Promise<ReturnType<typeof buildPreprocessResult>>}
 */
async function preprocessBuffer(imageBuffer) {
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();

  const originalWidth = metadata.width;
  const originalHeight = metadata.height;

  if (!originalWidth || !originalHeight) {
    throw new Error('Unable to read image dimensions from buffer');
  }

  const { data } = await image
    .resize(TARGET_WIDTH, TARGET_HEIGHT, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return buildPreprocessResult(data, originalWidth, originalHeight);
}

function buildPreprocessResult(data, originalWidth, originalHeight) {
  const pixelCount = TARGET_WIDTH * TARGET_HEIGHT;
  const tensorData = new Float32Array(3 * pixelCount);

  for (let i = 0; i < pixelCount; i += 1) {
    const offset = i * 3;
    tensorData[i] = data[offset] / 255;
    tensorData[pixelCount + i] = data[offset + 1] / 255;
    tensorData[2 * pixelCount + i] = data[offset + 2] / 255;
  }

  return {
    tensorData,
    inputShape: INPUT_SHAPE,
    originalWidth,
    originalHeight,
    resizedWidth: TARGET_WIDTH,
    resizedHeight: TARGET_HEIGHT,
  };
}

module.exports = {
  TARGET_WIDTH,
  TARGET_HEIGHT,
  INPUT_SHAPE,
  preprocessImage,
  preprocessBuffer,
};
