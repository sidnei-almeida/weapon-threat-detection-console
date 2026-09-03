/*
 * Browser-side YOLO client.
 *
 * Inference runs inside a dedicated worker (`/inference.worker.js`) so the
 * main thread stays free for rendering — that is what keeps the console from
 * freezing on every analyzed frame. If Workers or OffscreenCanvas are not
 * available the module degrades to a main-thread path with the same API.
 */
window.YoloClient = (() => {
  const TARGET_SIZE = 640;
  const MODEL_URL = '/models/roadvision_yolo_fp32.onnx';
  const ORT_URL = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/ort.min.js';
  const WASM_PATHS = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';

  let active = false;
  let worker = null;
  let workerReady = false;
  let readyPromise = null;
  let backend = 'unknown';
  let requestSeq = 0;
  const pending = new Map();

  /* Main-thread fallback state (only touched when the worker is unusable). */
  let ortScriptPromise = null;
  let fallbackSessionPromise = null;
  let fallbackSurface = null;
  let fallbackCtx = null;
  let fallbackTensorData = null;

  function isActive() {
    return active;
  }

  function enable() {
    active = true;
  }

  function getBackend() {
    return backend;
  }

  function resolveThreadCount() {
    if (!self.crossOriginIsolated) return 1;
    const cores = navigator.hardwareConcurrency || 2;
    return Math.max(1, Math.min(4, cores - 1));
  }

  function supportsWorkerInference() {
    return typeof Worker !== 'undefined'
      && typeof OffscreenCanvas !== 'undefined'
      && typeof createImageBitmap === 'function';
  }

  function rejectAllPending(reason) {
    pending.forEach(({ reject }) => reject(new Error(reason)));
    pending.clear();
  }

  function handleWorkerMessage(event) {
    const { type } = event.data;

    if (type === 'result') {
      const entry = pending.get(event.data.requestId);
      if (!entry) return;
      pending.delete(event.data.requestId);
      entry.resolve(event.data);
      return;
    }

    if (type === 'infer-error') {
      const entry = pending.get(event.data.requestId);
      if (!entry) return;
      pending.delete(event.data.requestId);
      entry.reject(new Error(event.data.message));
    }
  }

  function startWorker() {
    return new Promise((resolve, reject) => {
      worker = new Worker('/inference.worker.js');

      const onInit = (event) => {
        if (event.data.type === 'ready') {
          worker.removeEventListener('message', onInit);
          worker.addEventListener('message', handleWorkerMessage);
          workerReady = true;
          backend = event.data.backend;
          resolve({ ready: true, backend: `yolo-worker:${backend}` });
          return;
        }

        if (event.data.type === 'init-error') {
          worker.removeEventListener('message', onInit);
          reject(new Error(event.data.message));
        }
      };

      worker.addEventListener('message', onInit);
      worker.onerror = (error) => {
        reject(new Error(error.message || 'inference worker failed to start'));
      };

      worker.postMessage({
        type: 'init',
        modelUrl: MODEL_URL,
        ortUrl: ORT_URL,
        wasmPaths: WASM_PATHS,
        numThreads: resolveThreadCount(),
      });
    });
  }

  function teardownWorker(reason) {
    rejectAllPending(reason);
    if (worker) {
      worker.terminate();
      worker = null;
    }
    workerReady = false;
  }

  /* ---------------- main-thread fallback ---------------- */

  /* ~1.5 MB of runtime that the fast (worker) path never needs on the main
     thread, so it is only fetched when the fallback actually kicks in. */
  function loadOrtOnMainThread() {
    if (typeof ort !== 'undefined') return Promise.resolve();
    if (ortScriptPromise) return ortScriptPromise;

    ortScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = ORT_URL;
      script.crossOrigin = 'anonymous';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('failed to load onnxruntime-web'));
      document.head.appendChild(script);
    });

    return ortScriptPromise;
  }

  async function getFallbackSession() {
    await loadOrtOnMainThread();

    if (!fallbackSessionPromise) {
      ort.env.wasm.wasmPaths = WASM_PATHS;
      ort.env.wasm.numThreads = resolveThreadCount();
      fallbackSessionPromise = ort.InferenceSession.create(MODEL_URL, {
        executionProviders: ['webgpu', 'wasm'],
      }).catch(() => ort.InferenceSession.create(MODEL_URL, {
        executionProviders: ['wasm'],
      }));
    }

    return fallbackSessionPromise;
  }

  function fallbackBuildTensor(source, sourceWidth, sourceHeight) {
    if (!fallbackSurface) {
      fallbackSurface = document.createElement('canvas');
      fallbackSurface.width = TARGET_SIZE;
      fallbackSurface.height = TARGET_SIZE;
      fallbackCtx = fallbackSurface.getContext('2d', { alpha: false, willReadFrequently: true });
      fallbackTensorData = new Float32Array(3 * TARGET_SIZE * TARGET_SIZE);
    }

    fallbackCtx.drawImage(source, 0, 0, sourceWidth, sourceHeight, 0, 0, TARGET_SIZE, TARGET_SIZE);
    const { data } = fallbackCtx.getImageData(0, 0, TARGET_SIZE, TARGET_SIZE);
    const pixelCount = TARGET_SIZE * TARGET_SIZE;

    for (let i = 0, offset = 0; i < pixelCount; i += 1, offset += 4) {
      fallbackTensorData[i] = data[offset] / 255;
      fallbackTensorData[pixelCount + i] = data[offset + 1] / 255;
      fallbackTensorData[2 * pixelCount + i] = data[offset + 2] / 255;
    }

    return fallbackTensorData;
  }

  async function fallbackInference(source, imageWidth, imageHeight, cameraId, zone) {
    const session = await getFallbackSession();
    const data = fallbackBuildTensor(source, imageWidth, imageHeight);
    const tensor = new ort.Tensor('float32', data, [1, 3, TARGET_SIZE, TARGET_SIZE]);
    const results = await session.run({ [session.inputNames[0]]: tensor });
    const raw = window.YoloPostprocess.postprocessDetections(results[session.outputNames[0]].data);
    const detections = window.YoloPostprocess
      .formatDetections(raw, cameraId, zone, imageWidth, imageHeight)
      .sort((a, b) => b.confidence - a.confidence);

    return {
      success: true,
      detections,
      count: detections.length,
      imageWidth,
      imageHeight,
      backend: 'yolo-client:main-thread',
    };
  }

  /* ---------------- public API ---------------- */

  async function warmUp() {
    if (readyPromise) return readyPromise;

    readyPromise = (async () => {
      if (supportsWorkerInference()) {
        try {
          const result = await startWorker();
          enable();
          return result;
        } catch (error) {
          console.warn('Inference worker unavailable, using main thread:', error.message);
          teardownWorker('worker init failed');
        }
      }

      await getFallbackSession();
      backend = 'main-thread';
      enable();
      return { ready: true, backend: 'yolo-client:main-thread' };
    })();

    return readyPromise;
  }

  function inferInWorker(bitmap, imageWidth, imageHeight, cameraId, zone) {
    return new Promise((resolve, reject) => {
      requestSeq += 1;
      const requestId = requestSeq;
      pending.set(requestId, { resolve, reject });

      worker.postMessage(
        {
          type: 'infer',
          requestId,
          bitmap,
          width: imageWidth,
          height: imageHeight,
          cameraId,
          zone,
        },
        [bitmap],
      );
    });
  }

  async function analyzeImageBitmap(imageBitmap, imageWidth, imageHeight, cameraId, zone) {
    if (workerReady && worker) {
      /* Ownership of the bitmap transfers to the worker, which closes it. */
      return inferInWorker(imageBitmap, imageWidth, imageHeight, cameraId, zone);
    }

    try {
      return await fallbackInference(imageBitmap, imageWidth, imageHeight, cameraId, zone);
    } finally {
      imageBitmap.close();
    }
  }

  async function analyzeCanvas(sourceCanvas, imageWidth, imageHeight, cameraId, zone) {
    if (workerReady && worker) {
      const bitmap = await createImageBitmap(sourceCanvas);
      return inferInWorker(bitmap, imageWidth, imageHeight, cameraId, zone);
    }

    return fallbackInference(sourceCanvas, imageWidth, imageHeight, cameraId, zone);
  }

  function dispose() {
    teardownWorker('client disposed');
    active = false;
    readyPromise = null;
  }

  return {
    isActive,
    enable,
    warmUp,
    analyzeCanvas,
    analyzeImageBitmap,
    getBackend,
    dispose,
  };
})();
