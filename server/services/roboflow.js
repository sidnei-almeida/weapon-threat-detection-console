require('dotenv').config();

const axios = require('axios');
const sharp = require('sharp');
const { log } = require('../utils/logger');

function generateEventId() {
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `EVT-${digits}`;
}

function mapObjectClass(rawClass) {
  const normalized = String(rawClass || '').toLowerCase().trim();

  if (['gun', 'handgun', 'pistol'].includes(normalized)) {
    return 'Weapon: Handgun';
  }

  if (['rifle', 'long-gun'].includes(normalized)) {
    return 'Weapon: Rifle';
  }

  if (normalized === 'knife') {
    return 'Weapon: Knife';
  }

  if (['person-with-mask', 'masked-person', 'mask', 'person_with_mask'].includes(normalized)) {
    return 'Person with Mask';
  }

  if (!normalized) {
    return 'Unknown';
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function calculateRiskLevel(confidence, objectClass) {
  if (confidence >= 0.85 && objectClass.startsWith('Weapon')) {
    return 'HIGH';
  }

  if (confidence >= 0.7) {
    return 'MEDIUM';
  }

  return 'LOW';
}

function calculateThreatScore(confidence, objectClass) {
  let base = confidence * 100;

  if (objectClass.startsWith('Weapon: Handgun')) {
    base *= 1.0;
  } else if (objectClass.startsWith('Weapon: Rifle')) {
    base = Math.min(base * 1.2, 100);
  } else if (objectClass.startsWith('Weapon: Knife')) {
    base *= 0.85;
  } else if (objectClass === 'Person with Mask') {
    base *= 0.6;
  }

  return Math.round(base);
}

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

function processDetections(roboflowResponse, cameraId, zone) {
  const predictions = roboflowResponse?.predictions || [];

  return predictions.map((prediction) => {
    const confidence = Number(Number(prediction.confidence).toFixed(2));
    const objectClass = mapObjectClass(prediction.class);
    const riskLevel = calculateRiskLevel(confidence, objectClass);
    const threatScore = calculateThreatScore(confidence, objectClass);

    return {
      id: generateEventId(),
      timestamp: new Date().toISOString(),
      cameraId,
      zone,
      objectClass,
      confidence,
      confidencePercent: `${Math.round(confidence * 100)}%`,
      boundingBox: {
        x: prediction.x,
        y: prediction.y,
        width: prediction.width,
        height: prediction.height,
      },
      riskLevel,
      threatScore,
      escalationStatus: riskLevel === 'HIGH' ? 'Needs Review' : 'Monitoring',
      motionState: 'Walking',
      visibility: 'Clear',
    };
  });
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
