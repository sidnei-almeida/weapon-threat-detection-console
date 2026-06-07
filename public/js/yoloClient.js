window.YoloClient = (() => {
  const CLASS_NAMES = ['gun', 'knife', 'person_with_mask'];
  const TARGET_SIZE = 640;
  const MODEL_URL = '/models/roadvision_yolo_fp32.onnx';
  const CLASS_THRESHOLDS = { gun: 0.30, knife: 0.12, person_with_mask: 0.10 };
  const DEFAULT_THRESHOLD = 0.25;
  const NMS_IOU = 0.45;

  let active = false;
  let sessionPromise = null;
  let preprocessSurface = null;
  let preprocessSurfaceCtx = null;

  function isActive() {
    return active;
  }

  function enable() {
    active = true;
  }

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
    const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);
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
      const x1 = values[i];
      const y1 = values[i + 1];
      const x2 = values[i + 2];
      const y2 = values[i + 3];
      const confidence = values[i + 4];
      const classId = Math.round(values[i + 5]);
      const className = getClassName(classId);

      if (confidence < getThreshold(className)) continue;

      detections.push({ x1, y1, x2, y2, confidence, classId, className });
    }

    return applyNms(detections).sort((a, b) => b.confidence - a.confidence);
  }

  function mapObjectClass(rawClass) {
    const normalized = String(rawClass || '').toLowerCase().trim();
    if (['gun', 'handgun', 'pistol'].includes(normalized)) return 'Weapon: Handgun';
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
    if (objectClass.startsWith('Weapon: Handgun')) base *= 1.0;
    else if (objectClass.startsWith('Weapon: Rifle')) base = Math.min(base * 1.2, 100);
    else if (objectClass.startsWith('Weapon: Knife')) base *= 0.85;
    else if (objectClass === 'Person with Mask') base *= 0.6;
    return Math.round(base);
  }

  function formatDetections(rawDetections, cameraId, zone, imageWidth, imageHeight) {
    const scaleX = imageWidth / TARGET_SIZE;
    const scaleY = imageHeight / TARGET_SIZE;

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
        timestamp: new Date().toISOString(),
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

  function buildInputTensor(source, sourceWidth, sourceHeight) {
    if (!preprocessSurface) {
      preprocessSurface = document.createElement('canvas');
      preprocessSurface.width = TARGET_SIZE;
      preprocessSurface.height = TARGET_SIZE;
      preprocessSurfaceCtx = preprocessSurface.getContext('2d', { willReadFrequently: true });
    }

    preprocessSurfaceCtx.drawImage(source, 0, 0, sourceWidth, sourceHeight, 0, 0, TARGET_SIZE, TARGET_SIZE);

    const { data } = preprocessSurfaceCtx.getImageData(0, 0, TARGET_SIZE, TARGET_SIZE);
    const pixelCount = TARGET_SIZE * TARGET_SIZE;
    const tensorData = new Float32Array(3 * pixelCount);

    for (let i = 0; i < pixelCount; i += 1) {
      const offset = i * 4;
      tensorData[i] = data[offset] / 255;
      tensorData[pixelCount + i] = data[offset + 1] / 255;
      tensorData[2 * pixelCount + i] = data[offset + 2] / 255;
    }

    return {
      tensorData,
      inputShape: [1, 3, TARGET_SIZE, TARGET_SIZE],
      originalWidth: sourceWidth,
      originalHeight: sourceHeight,
    };
  }

  async function getSession() {
    if (typeof ort === 'undefined') {
      throw new Error('onnxruntime-web not loaded');
    }

    if (!sessionPromise) {
      ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
      if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
        ort.env.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency);
      }

      sessionPromise = ort.InferenceSession.create(MODEL_URL, {
        executionProviders: ['webgpu', 'webgl', 'wasm'],
      }).catch((error) => {
        console.warn('GPU inference unavailable, falling back to WASM:', error.message);
        return ort.InferenceSession.create(MODEL_URL, {
          executionProviders: ['wasm'],
        });
      });
    }

    return sessionPromise;
  }

  async function warmUp() {
    await getSession();
    enable();
    return { ready: true, backend: 'yolo-client' };
  }

  async function runInference(source, imageWidth, imageHeight, cameraId, zone) {
    const session = await getSession();
    const preprocessed = buildInputTensor(source, imageWidth, imageHeight);
    const inputName = session.inputNames[0];
    const inputTensor = new ort.Tensor('float32', preprocessed.tensorData, preprocessed.inputShape);
    const results = await session.run({ [inputName]: inputTensor });
    const outputName = session.outputNames[0];
    const rawDetections = postprocessDetections(results[outputName].data);
    const detections = formatDetections(
      rawDetections,
      cameraId,
      zone,
      preprocessed.originalWidth,
      preprocessed.originalHeight,
    );

    return {
      success: true,
      detections,
      count: detections.length,
      imageWidth: preprocessed.originalWidth,
      imageHeight: preprocessed.originalHeight,
      backend: 'yolo-client',
    };
  }

  async function analyzeCanvas(sourceCanvas, imageWidth, imageHeight, cameraId, zone) {
    return runInference(sourceCanvas, imageWidth, imageHeight, cameraId, zone);
  }

  async function analyzeImageBitmap(imageBitmap, imageWidth, imageHeight, cameraId, zone) {
    try {
      return await runInference(imageBitmap, imageWidth, imageHeight, cameraId, zone);
    } finally {
      imageBitmap.close();
    }
  }

  return {
    isActive,
    enable,
    warmUp,
    analyzeCanvas,
    analyzeImageBitmap,
  };
})();
