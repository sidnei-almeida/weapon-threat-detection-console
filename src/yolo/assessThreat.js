/**
 * Frame-level threat assessment for the Node inference scripts.
 *
 * The scoring rules live in public/js/yolo/threatModel.js so the dashboard,
 * the inference worker, the server and these scripts all agree on risk.
 */

const ThreatModel = require('../../public/js/yolo/threatModel');

const THREAT_LEVELS = ThreatModel.LEVELS.map((level) => level.toLowerCase());

/**
 * Count detections grouped by class name.
 *
 * @param {Array<{ className: string }>} detections
 * @returns {Record<string, number>}
 */
function countByClass(detections) {
  const classCounts = {};

  for (const detection of detections) {
    classCounts[detection.className] = (classCounts[detection.className] || 0) + 1;
  }

  return classCounts;
}

/**
 * Assess threat level from filtered YOLO detections.
 *
 * @param {Array<{ className: string, confidence: number }>} detections
 * @returns {{
 *   threatScore: number,
 *   threatLevel: 'none' | 'low' | 'medium' | 'high' | 'critical',
 *   detectionCount: number,
 *   classCounts: Record<string, number>,
 *   weaponCount: number,
 *   factors: string[]
 * }}
 */
function assessThreat(detections) {
  const list = detections || [];
  const assessment = ThreatModel.assessFrame(list);
  const classCounts = countByClass(list);

  return {
    threatScore: Number((assessment.score / 100).toFixed(2)),
    threatLevel: assessment.level.toLowerCase(),
    detectionCount: list.length,
    classCounts,
    weaponCount: (classCounts.gun || 0) + (classCounts.knife || 0),
    factors: assessment.factors,
  };
}

module.exports = {
  THREAT_LEVELS,
  assessThreat,
  countByClass,
};
