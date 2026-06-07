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

module.exports = {
  processDetections,
  mapObjectClass,
  calculateRiskLevel,
  calculateThreatScore,
};
