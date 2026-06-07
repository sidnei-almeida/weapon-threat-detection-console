require('dotenv').config();

const axios = require('axios');
const sharp = require('sharp');
const { log } = require('../utils/logger');
const { processDetections } = require('./detectionProcessing');

async function callRoboflow(project, imageBuffer) {
  const base64 = imageBuffer.toString('base64');
  const url = `https://detect.roboflow.com/${project}/${process.env.ROBOFLOW_VERSION}`;

  const response = await axios.post(
    url,
    base64,
    {
      params: {
        api_key: process.env.ROBOFLOW_API_KEY,
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  );

  return response.data;
}

async function analyzeImage(imageBuffer, mimeType) {
  try {
    return await callRoboflow(process.env.ROBOFLOW_PROJECT_WEAPON, imageBuffer);
  } catch (error) {
    log('ERROR', 'Roboflow weapon analysis failed', { message: error.message });
    return {
      error: true,
      message: error.message,
      predictions: [],
    };
  }
}

async function analyzeMask(imageBuffer, mimeType) {
  try {
    return await callRoboflow(process.env.ROBOFLOW_PROJECT_MASK, imageBuffer);
  } catch (error) {
    log('ERROR', 'Roboflow mask analysis failed', { message: error.message });
    return {
      error: true,
      message: error.message,
      predictions: [],
    };
  }
}

async function resizeImageForApi(imageBuffer) {
  return sharp(imageBuffer)
    .resize({
      width: 1280,
      height: 1280,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 85 })
    .toBuffer();
}

module.exports = {
  analyzeImage,
  analyzeMask,
  processDetections,
  resizeImageForApi,
};
