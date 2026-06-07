const DEFAULT_INFERENCE_FPS = 12;
const MIN_INFERENCE_FPS = 1;
const MAX_INFERENCE_FPS = 60;

function getInferenceFps() {
  const parsed = Number.parseFloat(process.env.INFERENCE_FPS);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_INFERENCE_FPS;
  }

  return Math.min(MAX_INFERENCE_FPS, Math.max(MIN_INFERENCE_FPS, Math.round(parsed)));
}

module.exports = {
  DEFAULT_INFERENCE_FPS,
  MIN_INFERENCE_FPS,
  MAX_INFERENCE_FPS,
  getInferenceFps,
};
