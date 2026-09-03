/*
 * Detection track smoothing.
 *
 * Inference runs at ~6-15 fps while the display refreshes at 60. Drawing raw
 * results makes boxes teleport and blink. This module keeps a short-lived
 * track per detected object, matches new results to existing tracks by class +
 * IoU, and exposes an interpolated pose that the render loop can sample every
 * animation frame.
 *
 * All geometry is normalized (0-1 relative to the analyzed frame), so the
 * tracks survive canvas resizes, zoom and fullscreen changes.
 */
window.DetectionTracks = (() => {
  const MATCH_IOU = 0.2;
  /* Time constant of the exponential position filter, in ms. Lower = snappier,
     higher = smoother but laggier behind fast movement. */
  const POSITION_TAU_MS = 90;
  const CONFIDENCE_TAU_MS = 220;
  const FADE_IN_MS = 120;
  /* Keep drawing a track this long after its last sighting so a single missed
     frame does not blink the box out. */
  const HOLD_MS = 320;
  const FADE_OUT_MS = 220;

  let tracks = [];
  let trackSeq = 0;
  /* Internal clock so aging can be frozen while the feed is paused, instead of
     letting boxes fade out under a stopped video. */
  let clock = 0;

  function toNormalizedRect(boundingBox, imageWidth, imageHeight) {
    const width = boundingBox.width / imageWidth;
    const height = boundingBox.height / imageHeight;
    return {
      x: boundingBox.x / imageWidth - width / 2,
      y: boundingBox.y / imageHeight - height / 2,
      width,
      height,
    };
  }

  function rectIoU(a, b) {
    const x1 = Math.max(a.x, b.x);
    const y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.width, b.x + b.width);
    const y2 = Math.min(a.y + a.height, b.y + b.height);
    const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const union = a.width * a.height + b.width * b.height - intersection;
    return union > 0 ? intersection / union : 0;
  }

  function createTrack(detection, rect, now) {
    trackSeq += 1;
    return {
      id: `TRK-${trackSeq}`,
      detection,
      objectClass: detection.objectClass,
      target: { ...rect },
      current: { ...rect },
      confidence: detection.confidence,
      firstSeen: now,
      lastSeen: now,
      alpha: 0,
    };
  }

  /* Greedy IoU matching: good enough for a handful of boxes and cheap. */
  function update(detections, imageWidth, imageHeight) {
    const now = clock;
    const claimed = new Set();

    detections.forEach((detection) => {
      const rect = toNormalizedRect(detection.boundingBox, imageWidth, imageHeight);

      let best = null;
      let bestScore = MATCH_IOU;

      tracks.forEach((track) => {
        if (claimed.has(track.id)) return;
        if (track.objectClass !== detection.objectClass) return;
        const score = rectIoU(track.target, rect);
        if (score > bestScore) {
          bestScore = score;
          best = track;
        }
      });

      if (best) {
        claimed.add(best.id);
        best.target = rect;
        best.detection = detection;
        best.lastSeen = now;
        return;
      }

      const track = createTrack(detection, rect, now);
      claimed.add(track.id);
      tracks.push(track);
    });
  }

  /* Frame-rate independent exponential smoothing. */
  function smoothingFactor(deltaMs, tauMs) {
    return 1 - Math.exp(-Math.max(0, deltaMs) / tauMs);
  }

  function step(deltaMs, { frozen = false } = {}) {
    if (!frozen) clock += Math.max(0, deltaMs);
    const now = clock;
    const positionK = smoothingFactor(deltaMs, POSITION_TAU_MS);
    const confidenceK = smoothingFactor(deltaMs, CONFIDENCE_TAU_MS);
    let animating = false;

    tracks = tracks.filter((track) => {
      const age = now - track.lastSeen;

      if (age <= HOLD_MS) {
        track.alpha = Math.min(1, (now - track.firstSeen) / FADE_IN_MS);
      } else {
        track.alpha = Math.max(0, 1 - (age - HOLD_MS) / FADE_OUT_MS);
      }

      if (track.alpha <= 0) return false;

      track.current.x += (track.target.x - track.current.x) * positionK;
      track.current.y += (track.target.y - track.current.y) * positionK;
      track.current.width += (track.target.width - track.current.width) * positionK;
      track.current.height += (track.target.height - track.current.height) * positionK;
      track.confidence += (track.detection.confidence - track.confidence) * confidenceK;

      const settled = Math.abs(track.target.x - track.current.x) < 0.0005
        && Math.abs(track.target.y - track.current.y) < 0.0005
        && Math.abs(track.target.width - track.current.width) < 0.0005
        && Math.abs(track.target.height - track.current.height) < 0.0005
        && track.alpha === 1;

      if (!settled) animating = true;
      return true;
    });

    return { tracks, animating };
  }

  function getTracks() {
    return tracks;
  }

  function isEmpty() {
    return tracks.length === 0;
  }

  function clear() {
    tracks = [];
  }

  function now() {
    return clock;
  }

  return {
    update,
    step,
    getTracks,
    isEmpty,
    clear,
    now,
  };
})();
