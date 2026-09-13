/*
 * Threat model: turns raw detections into a risk score (0-100) and level.
 *
 * Risk is a business rule layered on top of the model output, so it lives here
 * and not in postprocessing. Key ideas:
 *
 *  - Class severity sets the scale. A gun is dangerous even when the model is
 *    unsure, so every weapon has a floor that keeps it at MEDIUM or above.
 *    Confidence moves the score inside the class band instead of deciding
 *    whether the object matters at all.
 *  - Persistence is evidence. A weapon seen across consecutive frames is far
 *    more credible than a one-frame spike, so the scene tracker accumulates
 *    evidence over time and lets it raise the effective certainty.
 *  - Context escalates. Weapon + masked person, multiple weapons, or a weapon
 *    that stays in view for a long time push the scene towards CRITICAL.
 *
 * Loaded by the page (<script>), the inference worker (importScripts) and the
 * Node server (require), so it must not touch `window` or the DOM.
 */
(function attachThreatModel(scope) {
  const LEVELS = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  const LEVEL_MIN_SCORE = { LOW: 1, MEDIUM: 40, HIGH: 65, CRITICAL: 85 };

  /*
   * severity: score of a fully certain, isolated detection.
   * floor:    score of a barely-above-threshold detection.
   * minConf / fullConf: confidence range mapped to certainty 0..1. minConf
   *   matches the detection threshold used in postprocessing.
   */
  const CLASS_PROFILES = {
    gun: { label: 'Gun', severity: 80, floor: 45, weapon: true, minConf: 0.30, fullConf: 0.75 },
    rifle: { label: 'Rifle', severity: 90, floor: 50, weapon: true, minConf: 0.30, fullConf: 0.75 },
    knife: { label: 'Knife', severity: 68, floor: 40, weapon: true, minConf: 0.12, fullConf: 0.60 },
    person_with_mask: { label: 'Masked person', severity: 35, floor: 15, weapon: false, minConf: 0.10, fullConf: 0.60 },
  };

  const ARMED_AND_MASKED_BONUS = 15;
  const MULTIPLE_WEAPONS_BONUS = 10;
  const SUSTAINED_WEAPON_START_MS = 3000;
  const SUSTAINED_WEAPON_BONUS_PER_S = 1.25;
  const SUSTAINED_WEAPON_MAX_BONUS = 10;

  /* Scene tracker tuning. */
  const EVIDENCE_TAU_MS = 1500;
  const EVIDENCE_GAIN = 0.3;
  const PERSISTENCE_WEIGHT = 0.6;
  const PRESENCE_GAP_MS = 1500;
  const FADE_EVIDENCE = 0.1;
  const DROP_EVIDENCE = 0.02;

  function clamp01(value) {
    return Math.max(0, Math.min(1, value));
  }

  /* Accepts raw model classes ('gun') and display classes ('Weapon: Gun'). */
  function classKey(name) {
    const normalized = String(name || '').toLowerCase().trim();
    if (!normalized) return null;
    if (normalized.includes('rifle') || normalized === 'long-gun') return 'rifle';
    if (normalized.includes('gun') || normalized === 'pistol') return 'gun';
    if (normalized.includes('knife')) return 'knife';
    if (normalized.includes('mask')) return 'person_with_mask';
    return null;
  }

  function certaintyFor(key, confidence) {
    const profile = CLASS_PROFILES[key];
    if (!profile) return 0;
    return clamp01((confidence - profile.minConf) / (profile.fullConf - profile.minConf));
  }

  function classScore(key, certainty) {
    const profile = CLASS_PROFILES[key];
    if (!profile) return 0;
    return Math.max(profile.floor, profile.severity * (0.5 + 0.5 * clamp01(certainty)));
  }

  function levelForScore(score) {
    if (score >= LEVEL_MIN_SCORE.CRITICAL) return 'CRITICAL';
    if (score >= LEVEL_MIN_SCORE.HIGH) return 'HIGH';
    if (score >= LEVEL_MIN_SCORE.MEDIUM) return 'MEDIUM';
    if (score >= LEVEL_MIN_SCORE.LOW) return 'LOW';
    return 'NONE';
  }

  function isAtLeast(level, minLevel) {
    return LEVELS.indexOf(level) >= LEVELS.indexOf(minLevel);
  }

  /* Risk of a single detection, ignoring scene context. */
  function assessDetection(className, confidence) {
    const key = classKey(className);
    if (!key) return { score: 0, level: 'NONE' };
    const score = Math.round(classScore(key, certaintyFor(key, confidence)));
    return { score, level: levelForScore(score) };
  }

  function groupByClass(detections) {
    const groups = {};
    (detections || []).forEach((detection) => {
      const key = classKey(detection.className ?? detection.objectClass);
      if (!key) return;
      const group = groups[key] || (groups[key] = { count: 0, certainty: 0 });
      group.count += 1;
      group.certainty = Math.max(group.certainty, certaintyFor(key, detection.confidence));
    });
    return groups;
  }

  /*
   * classes: { [key]: { certainty, rawCertainty, presence, confirmed, count, visibleMs, fade } }
   *   certainty: 0..1 how sure we are the object is real (model + persistence)
   *   rawCertainty: 0..1 model confidence alone, mapped to the class range
   *   presence:  0..1 how established it is in the scene (drives bonuses)
   *   confirmed: seen consistently across frames
   *   visibleMs: continuous time in view (0 for single frames)
   *   fade:      0..1 multiplier while evidence decays after the object left
   */
  function scoreClasses(classes) {
    const factors = [];
    let topKey = null;
    let base = 0;

    Object.entries(classes).forEach(([key, state]) => {
      const score = classScore(key, state.certainty) * (state.fade ?? 1);
      if (score > base) {
        base = score;
        topKey = key;
      }
    });

    if (!topKey) {
      return { score: 0, level: 'NONE', topClass: null, factors };
    }

    const top = classes[topKey];
    const topProfile = CLASS_PROFILES[topKey];
    factors.push(`${topProfile.label} ${top.confirmed ? 'confirmed' : 'detected'} (${Math.round(top.certainty * 100)}% certainty)`);

    const weaponKeys = Object.keys(classes).filter((key) => CLASS_PROFILES[key].weapon);
    const strongestWeaponPresence = weaponKeys.reduce(
      (max, key) => Math.max(max, classes[key].presence * (classes[key].fade ?? 1)),
      0,
    );

    let bonus = 0;
    const mask = classes.person_with_mask;
    if (mask && strongestWeaponPresence > 0) {
      const maskPresence = mask.presence * (mask.fade ?? 1);
      const armedAndMasked = ARMED_AND_MASKED_BONUS * Math.min(strongestWeaponPresence, maskPresence);
      if (armedAndMasked >= 1) {
        bonus += armedAndMasked;
        factors.push('Weapon alongside masked person');
      }
    }

    const weaponCount = weaponKeys.reduce((sum, key) => sum + (classes[key].count || 0), 0);
    if (weaponCount >= 2 || weaponKeys.length >= 2) {
      bonus += MULTIPLE_WEAPONS_BONUS;
      factors.push('Multiple weapons in scene');
    }

    const longestWeaponKey = weaponKeys.reduce(
      (best, key) => (!best || (classes[key].visibleMs || 0) > (classes[best].visibleMs || 0) ? key : best),
      null,
    );
    const longestWeaponMs = longestWeaponKey ? classes[longestWeaponKey].visibleMs || 0 : 0;
    if (longestWeaponMs > SUSTAINED_WEAPON_START_MS) {
      /* Scaled by raw model certainty so a static low-confidence false
         positive cannot climb just by sitting in the frame. */
      const sustained = Math.min(
        SUSTAINED_WEAPON_MAX_BONUS,
        ((longestWeaponMs - SUSTAINED_WEAPON_START_MS) / 1000) * SUSTAINED_WEAPON_BONUS_PER_S,
      ) * classes[longestWeaponKey].rawCertainty;
      bonus += sustained;
      factors.push(`Weapon in view for ${(longestWeaponMs / 1000).toFixed(1)}s`);
    }

    const score = Math.round(Math.min(100, base + bonus));
    return { score, level: levelForScore(score), topClass: topKey, factors };
  }

  /* Stateless assessment of one frame or still image. */
  function assessFrame(detections) {
    const groups = groupByClass(detections);
    const classes = {};
    Object.entries(groups).forEach(([key, group]) => {
      classes[key] = {
        certainty: group.certainty,
        rawCertainty: group.certainty,
        presence: 0.5 + 0.5 * group.certainty,
        confirmed: false,
        count: group.count,
        visibleMs: 0,
      };
    });
    return scoreClasses(classes);
  }

  /*
   * Stateful assessment of a video stream. Call update() with every inference
   * result, including empty ones, so evidence can decay when objects leave.
   */
  function createSceneTracker() {
    let states = {};
    let lastUpdate = null;

    function update(detections, now) {
      const dt = lastUpdate === null ? 0 : Math.max(0, now - lastUpdate);
      lastUpdate = now;
      const decay = Math.exp(-dt / EVIDENCE_TAU_MS);
      const groups = groupByClass(detections);

      Object.values(states).forEach((state) => {
        state.evidence *= decay;
        state.count = 0;
      });

      Object.entries(groups).forEach(([key, group]) => {
        let state = states[key];
        if (!state) {
          state = { evidence: 0, certainty: group.certainty, firstSeen: now, lastSeen: now, count: 0 };
          states[key] = state;
        }
        if (now - state.lastSeen > PRESENCE_GAP_MS) state.firstSeen = now;

        const frameStrength = 0.5 + 0.5 * group.certainty;
        state.evidence += (1 - state.evidence) * EVIDENCE_GAIN * frameStrength;
        state.certainty += (group.certainty - state.certainty) * 0.3;
        state.lastSeen = now;
        state.count = group.count;
      });

      const classes = {};
      Object.entries(states).forEach(([key, state]) => {
        if (state.evidence < DROP_EVIDENCE) {
          delete states[key];
          return;
        }
        const inView = now - state.lastSeen <= PRESENCE_GAP_MS;
        classes[key] = {
          certainty: state.certainty + (1 - state.certainty) * state.evidence * PERSISTENCE_WEIGHT,
          rawCertainty: state.certainty,
          presence: state.evidence,
          confirmed: state.evidence >= 0.5,
          count: state.count,
          visibleMs: inView ? state.lastSeen - state.firstSeen : 0,
          fade: Math.min(1, state.evidence / FADE_EVIDENCE),
        };
      });

      return scoreClasses(classes);
    }

    function reset() {
      states = {};
      lastUpdate = null;
    }

    return { update, reset };
  }

  const api = {
    LEVELS,
    LEVEL_MIN_SCORE,
    CLASS_PROFILES,
    classKey,
    levelForScore,
    isAtLeast,
    assessDetection,
    assessFrame,
    createSceneTracker,
  };

  scope.ThreatModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof self !== 'undefined' ? self : this));
