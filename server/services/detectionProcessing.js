const ThreatModel = require('../../public/js/yolo/threatModel');

function generateEventId() {
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `EVT-${digits}`;
}

function mapObjectClass(rawClass) {
  const normalized = String(rawClass || '').toLowerCase().trim();

  if (['gun', 'handgun', 'pistol'].includes(normalized)) {
    return 'Weapon: Gun';
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

function processDetections(roboflowResponse, cameraId, zone) {
  const predictions = roboflowResponse?.predictions || [];

  return predictions.map((prediction) => {
    const confidence = Number(Number(prediction.confidence).toFixed(2));
    const objectClass = mapObjectClass(prediction.class);
    const { score: threatScore, level: riskLevel } = ThreatModel.assessDetection(prediction.class, confidence);

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
      escalationStatus: ThreatModel.isAtLeast(riskLevel, 'HIGH') ? 'Needs Review' : 'Monitoring',
      motionState: 'Walking',
      visibility: 'Clear',
    };
  });
}

module.exports = {
  processDetections,
  mapObjectClass,
};
