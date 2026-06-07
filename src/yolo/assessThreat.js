/**
 * Threat assessment logic ported from yolo26-weapon-threat-detection/app/detector.py
 * with small contextual improvements for compound threat scenes.
 */

const THREAT_WEIGHTS = {
  gun: 1.0,
  knife: 0.85,
  person_with_mask: 0.6,
};

const DEFAULT_UNKNOWN_CLASS_WEIGHT = 0.5;

/** Bonus per extra detection beyond the first (max +0.30). */
const QUANTITY_BONUS_PER_DETECTION = 0.05;
const MAX_QUANTITY_BONUS = 0.30;

/**
 * Extra score when weapons appear together with a masked person.
 * Represents a more suspicious/concealed scene.
 */
const CONCEALED_CONTEXT_BONUS = 0.07;

/** Extra score when both gun and knife are present in the same frame. */
const MIXED_WEAPON_BONUS = 0.05;

const THREAT_LEVELS = ['none', 'low', 'medium', 'high', 'critical'];

/**
 * Map score and detection counts to a categorical threat level.
 * Checks are evaluated from most to least severe.
 *
 * @param {number} threatScore
 * @param {number} detectionCount
 * @param {Record<string, number>} classCounts
 * @returns {'none' | 'low' | 'medium' | 'high' | 'critical'}
 */
function resolveThreatLevel(threatScore, detectionCount, classCounts) {
  const gunCount = classCounts.gun || 0;
  const knifeCount = classCounts.knife || 0;
  const weaponCount = gunCount + knifeCount;

  // Improvement: multiple firearms in one frame is treated as critical
  // even when total detections are below the original threshold of 4.
  if (gunCount >= 2 && threatScore >= 0.75) {
    return 'critical';
  }

  if (threatScore >= 0.85 && detectionCount >= 4) {
    return 'critical';
  }

  if (threatScore >= 0.75 || (weaponCount >= 3 && threatScore >= 0.55)) {
    return 'high';
  }

  if (threatScore >= 0.45 || (detectionCount >= 3 && threatScore >= 0.35)) {
    return 'medium';
  }

  return 'low';
}

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
 * Each detection should include at least:
 * - className
 * - confidence
 *
 * @param {Array<{ className: string, confidence: number }>} detections
 * @returns {{
 *   threatScore: number,
 *   threatLevel: 'none' | 'low' | 'medium' | 'high' | 'critical',
 *   detectionCount: number,
 *   classCounts: Record<string, number>,
 *   weaponCount: number,
 *   peakScore: number,
 *   quantityBonus: number,
 *   contextBonus: number
 * }}
 */
function assessThreat(detections) {
  if (!detections || detections.length === 0) {
    return {
      threatScore: 0,
      threatLevel: 'none',
      detectionCount: 0,
      classCounts: {},
      weaponCount: 0,
      peakScore: 0,
      quantityBonus: 0,
      contextBonus: 0,
    };
  }

  const classCounts = countByClass(detections);
  const detectionCount = detections.length;

  const individualScores = detections.map(
    (detection) => detection.confidence * (THREAT_WEIGHTS[detection.className] ?? DEFAULT_UNKNOWN_CLASS_WEIGHT),
  );

  const peakScore = Math.max(...individualScores);
  const quantityBonus = Math.min(
    (detectionCount - 1) * QUANTITY_BONUS_PER_DETECTION,
    MAX_QUANTITY_BONUS,
  );

  const gunCount = classCounts.gun || 0;
  const knifeCount = classCounts.knife || 0;
  const maskCount = classCounts.person_with_mask || 0;
  const weaponCount = gunCount + knifeCount;

  let contextBonus = 0;

  if (weaponCount >= 1 && maskCount >= 1) {
    contextBonus += CONCEALED_CONTEXT_BONUS;
  }

  if (gunCount >= 1 && knifeCount >= 1) {
    contextBonus += MIXED_WEAPON_BONUS;
  }

  const threatScore = Math.min(peakScore + quantityBonus + contextBonus, 1.0);
  const threatLevel = resolveThreatLevel(threatScore, detectionCount, classCounts);

  return {
    threatScore: Number(threatScore.toFixed(4)),
    threatLevel,
    detectionCount,
    classCounts,
    weaponCount,
    peakScore: Number(peakScore.toFixed(4)),
    quantityBonus: Number(quantityBonus.toFixed(4)),
    contextBonus: Number(contextBonus.toFixed(4)),
  };
}

module.exports = {
  THREAT_WEIGHTS,
  THREAT_LEVELS,
  assessThreat,
  resolveThreatLevel,
  countByClass,
};
