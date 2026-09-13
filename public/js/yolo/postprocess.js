/*
 * Shared YOLO post-processing helpers.
 *
 * Loaded both by the page (<script>) and by the inference worker
 * (importScripts), so it must not touch `window` or the DOM.
 */
(function attachYoloPostprocess(scope) {
  const CLASS_NAMES = ['gun', 'knife', 'person_with_mask'];
  const TARGET_SIZE = 640;
  const CLASS_THRESHOLDS = { gun: 0.30, knife: 0.12, person_with_mask: 0.10 };
  const DEFAULT_THRESHOLD = 0.25;
  const NMS_IOU = 0.45;

  function getClassName(classId) {
    return CLASS_NAMES[classId] ?? `class_${classId}`;
  }

  function getThreshold(className) {
    return CLASS_THRESHOLDS[className] ?? DEFAULT_THRESHOLD;
  }

  function computeIoU(a, b) {
    const x1 = Math.max(a.x1, b.x1);
    const y1 = Math.max(a.y1, b.y1);
    const x2 = Math.min(a.x2, b.x2);
    const y2 = Math.min(a.y2, b.y2);
    const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
    const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
    const union = areaA + areaB - intersection;
    return union > 0 ? intersection / union : 0;
  }

  function applyNms(detections) {
    const sorted = detections.sort((a, b) => b.confidence - a.confidence);
    const kept = [];

    sorted.forEach((detection) => {
      const overlaps = kept.some(
        (existing) => existing.className === detection.className
          && computeIoU(existing, detection) > NMS_IOU,
      );
      if (!overlaps) kept.push(detection);
    });

    return kept;
  }

  function postprocessDetections(rawOutput) {
    const values = rawOutput instanceof Float32Array ? rawOutput : Float32Array.from(rawOutput);
    const detections = [];

    for (let i = 0; i + 5 < values.length; i += 6) {
      const confidence = values[i + 4];
      const className = getClassName(Math.round(values[i + 5]));

      if (confidence < getThreshold(className)) continue;

      detections.push({
        x1: values[i],
        y1: values[i + 1],
        x2: values[i + 2],
        y2: values[i + 3],
        confidence,
        classId: Math.round(values[i + 5]),
        className,
      });
    }

    return applyNms(detections);
  }

  function mapObjectClass(rawClass) {
    const normalized = String(rawClass || '').toLowerCase().trim();
    if (['gun', 'handgun', 'pistol'].includes(normalized)) return 'Weapon: Gun';
    if (['rifle', 'long-gun'].includes(normalized)) return 'Weapon: Rifle';
    if (normalized === 'knife') return 'Weapon: Knife';
    if (['person-with-mask', 'masked-person', 'mask', 'person_with_mask'].includes(normalized)) {
      return 'Person with Mask';
    }
    if (!normalized) return 'Unknown';
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  function calculateRiskLevel(confidence, objectClass) {
    if (confidence >= 0.85 && objectClass.startsWith('Weapon')) return 'HIGH';
    if (confidence >= 0.7) return 'MEDIUM';
    return 'LOW';
  }

  function calculateThreatScore(confidence, objectClass) {
    let base = confidence * 100;
    if (objectClass.startsWith('Weapon: Gun')) base *= 1.0;
    else if (objectClass.startsWith('Weapon: Rifle')) base = Math.min(base * 1.2, 100);
    else if (objectClass.startsWith('Weapon: Knife')) base *= 0.85;
    else if (objectClass === 'Person with Mask') base *= 0.6;
    return Math.round(base);
  }

  function formatDetections(rawDetections, cameraId, zone, imageWidth, imageHeight) {
    const scaleX = imageWidth / TARGET_SIZE;
    const scaleY = imageHeight / TARGET_SIZE;
    const timestamp = new Date().toISOString();

    return rawDetections.map((detection) => {
      const x1 = detection.x1 * scaleX;
      const y1 = detection.y1 * scaleY;
      const x2 = detection.x2 * scaleX;
      const y2 = detection.y2 * scaleY;
      const confidence = Number(detection.confidence.toFixed(2));
      const objectClass = mapObjectClass(detection.className);
      const riskLevel = calculateRiskLevel(confidence, objectClass);
      const threatScore = calculateThreatScore(confidence, objectClass);

      return {
        id: `EVT-${Math.floor(1000 + Math.random() * 9000)}`,
        timestamp,
        cameraId,
        zone,
        objectClass,
        confidence,
        confidencePercent: `${Math.round(confidence * 100)}%`,
        boundingBox: {
          x: (x1 + x2) / 2,
          y: (y1 + y2) / 2,
          width: x2 - x1,
          height: y2 - y1,
        },
        riskLevel,
        threatScore,
        escalationStatus: riskLevel === 'HIGH' ? 'Needs Review' : 'Monitoring',
        motionState: 'Walking',
        visibility: 'Clear',
      };
    });
  }

  scope.YoloPostprocess = {
    TARGET_SIZE,
    CLASS_NAMES,
    computeIoU,
    postprocessDetections,
    formatDetections,
    mapObjectClass,
  };
}(typeof self !== 'undefined' ? self : this));
