const { getClassName } = require('./classNames');

const DEFAULT_CONFIDENCE_THRESHOLD = 0.25;

/** Per-class thresholds — knife/mask need lower scores than gun. */
const CLASS_CONFIDENCE_THRESHOLDS = {
  gun: 0.30,
  knife: 0.12,
  person_with_mask: 0.10,
};

const VALUES_PER_DETECTION = 6;
const DEFAULT_NMS_IOU = 0.45;

function getThresholdForClass(className, fallback = DEFAULT_CONFIDENCE_THRESHOLD) {
  return CLASS_CONFIDENCE_THRESHOLDS[className] ?? fallback;
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

function applyNms(detections, iouThreshold = DEFAULT_NMS_IOU) {
  const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);
  const kept = [];

  for (const detection of sorted) {
    const hasOverlap = kept.some(
      (existing) => existing.className === detection.className
        && computeIoU(existing, detection) > iouThreshold,
    );

    if (!hasOverlap) {
      kept.push(detection);
    }
  }

  return kept;
}

/**
 * Convert raw YOLO output into filtered detection objects.
 * Each detection uses 6 values: [x1, y1, x2, y2, confidence, class_id]
 */
function postprocessDetections(
  rawOutput,
  confidenceThreshold = DEFAULT_CONFIDENCE_THRESHOLD,
  nmsIou = DEFAULT_NMS_IOU,
) {
  const values = rawOutput instanceof Float32Array ? rawOutput : Float32Array.from(rawOutput);
  const detections = [];

  for (let i = 0; i + (VALUES_PER_DETECTION - 1) < values.length; i += VALUES_PER_DETECTION) {
    const x1 = values[i];
    const y1 = values[i + 1];
    const x2 = values[i + 2];
    const y2 = values[i + 3];
    const confidence = values[i + 4];
    const classId = Math.round(values[i + 5]);
    const className = getClassName(classId);
    const threshold = getThresholdForClass(className, confidenceThreshold);

    if (confidence < threshold) {
      continue;
    }

    detections.push({
      x1,
      y1,
      x2,
      y2,
      confidence,
      classId,
      className,
    });
  }

  return applyNms(detections, nmsIou).sort((a, b) => b.confidence - a.confidence);
}

module.exports = {
  DEFAULT_CONFIDENCE_THRESHOLD,
  CLASS_CONFIDENCE_THRESHOLDS,
  DEFAULT_NMS_IOU,
  postprocessDetections,
  applyNms,
};
