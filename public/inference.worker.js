/*
 * YOLO inference worker.
 *
 * Runs preprocessing + ONNX Runtime entirely off the main thread so the
 * dashboard UI never blocks while a frame is being analyzed.
 *
 * Protocol:
 *   in  { type: 'init', modelUrl, ortUrl, wasmPaths }
 *   out { type: 'ready', backend } | { type: 'init-error', message }
 *   in  { type: 'infer', requestId, bitmap, width, height, cameraId, zone }
 *   out { type: 'result', requestId, detections, count, imageWidth, imageHeight, inferenceMs }
 *       | { type: 'infer-error', requestId, message }
 */

const TARGET_SIZE = 640;
const PIXEL_COUNT = TARGET_SIZE * TARGET_SIZE;

let session = null;
let inputName = null;
let outputName = null;
let activeBackend = 'unknown';

let surface = null;
let surfaceCtx = null;
let tensorData = null;
let inputTensor = null;

function ensureSurface() {
  if (surface) return;
  surface = new OffscreenCanvas(TARGET_SIZE, TARGET_SIZE);
  surfaceCtx = surface.getContext('2d', { alpha: false, willReadFrequently: true });
  tensorData = new Float32Array(3 * PIXEL_COUNT);
}

/* HWC uint8 RGBA -> CHW float32 normalized, into the preallocated buffer. */
function fillTensorFromBitmap(bitmap, width, height) {
  ensureSurface();
  surfaceCtx.drawImage(bitmap, 0, 0, width, height, 0, 0, TARGET_SIZE, TARGET_SIZE);

  const { data } = surfaceCtx.getImageData(0, 0, TARGET_SIZE, TARGET_SIZE);
  const green = PIXEL_COUNT;
  const blue = 2 * PIXEL_COUNT;

  for (let i = 0, offset = 0; i < PIXEL_COUNT; i += 1, offset += 4) {
    tensorData[i] = data[offset] / 255;
    tensorData[green + i] = data[offset + 1] / 255;
    tensorData[blue + i] = data[offset + 2] / 255;
  }

  return tensorData;
}

async function createSession(modelUrl) {
  try {
    const gpuSession = await ort.InferenceSession.create(modelUrl, {
      executionProviders: ['webgpu'],
      graphOptimizationLevel: 'all',
    });
    activeBackend = 'webgpu';
    return gpuSession;
  } catch (error) {
    /* WebGPU missing or model unsupported on it — WASM is the portable path. */
    console.warn('[inference-worker] WebGPU unavailable, falling back to WASM:', error.message);
  }

  const wasmSession = await ort.InferenceSession.create(modelUrl, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
  activeBackend = ort.env.wasm.numThreads > 1 ? `wasm-x${ort.env.wasm.numThreads}` : 'wasm';
  return wasmSession;
}

/*
 * First run compiles kernels and allocates arenas — a 1-3s hit. Pay it during
 * boot with a dummy frame instead of on the first live frame.
 */
async function warmUpSession() {
  ensureSurface();
  tensorData.fill(0);
  inputTensor = new ort.Tensor('float32', tensorData, [1, 3, TARGET_SIZE, TARGET_SIZE]);
  const results = await session.run({ [inputName]: inputTensor });
  results[outputName]?.dispose?.();
}

async function init(payload) {
  const {
    modelUrl = '/models/roadvision_yolo_fp32.onnx',
    ortUrl = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/ort.min.js',
    wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/',
    numThreads,
  } = payload || {};

  self.importScripts('/js/yolo/postprocess.js');
  self.importScripts(ortUrl);

  ort.env.wasm.wasmPaths = wasmPaths;
  /* Threads only actually engage when the page is cross-origin isolated
     (COOP/COEP); otherwise ORT silently runs single-threaded. */
  ort.env.wasm.numThreads = Math.max(1, Number(numThreads) || 1);
  ort.env.wasm.simd = true;
  ort.env.logLevel = 'error';

  session = await createSession(modelUrl);
  inputName = session.inputNames[0];
  outputName = session.outputNames[0];

  await warmUpSession();

  self.postMessage({ type: 'ready', backend: activeBackend });
}

async function infer(payload) {
  const { requestId, bitmap, width, height, cameraId, zone } = payload;
  const startedAt = performance.now();

  try {
    fillTensorFromBitmap(bitmap, width, height);
    bitmap.close();

    if (!inputTensor) {
      inputTensor = new ort.Tensor('float32', tensorData, [1, 3, TARGET_SIZE, TARGET_SIZE]);
    }

    const results = await session.run({ [inputName]: inputTensor });
    const output = results[outputName];
    const raw = self.YoloPostprocess.postprocessDetections(output.data);
    output.dispose?.();

    const detections = self.YoloPostprocess.formatDetections(
      raw,
      cameraId,
      zone,
      width,
      height,
    ).sort((a, b) => b.confidence - a.confidence);

    self.postMessage({
      type: 'result',
      requestId,
      success: true,
      detections,
      count: detections.length,
      imageWidth: width,
      imageHeight: height,
      backend: `yolo-client:${activeBackend}`,
      inferenceMs: performance.now() - startedAt,
    });
  } catch (error) {
    try {
      bitmap?.close();
    } catch {
      /* already closed */
    }
    self.postMessage({ type: 'infer-error', requestId, message: error.message });
  }
}

self.onmessage = async (event) => {
  const { type } = event.data;

  if (type === 'init') {
    try {
      await init(event.data);
    } catch (error) {
      self.postMessage({ type: 'init-error', message: error.message });
    }
    return;
  }

  if (type === 'infer') {
    await infer(event.data);
  }
};
