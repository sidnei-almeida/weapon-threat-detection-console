window.VideoFeed = (() => {
  let stream = null;
  let isRecording = false;
  let mediaRecorder = null;
  let recordedChunks = [];
  let currentDetections = [];
  let frameInterval = null;
  const FRAME_INTERVAL_MS = 150;
  const MAX_CAPTURE_WIDTH = 640;
  const JPEG_QUALITY = 0.72;

  let analyzeInFlight = false;
  let analyzePending = false;
  let captureCanvas = null;
  let captureCtx = null;
  let framesAnalyzed = 0;
  let lastAnalyzeMs = 0;

  let cameras = [];
  let selectedCamera = null;
  let isVideoFeedActive = false;
  let isDropdownOpen = false;

  let startCameraBtn;
  let liveVideo;
  let staticFrame;
  let videoPlaceholder;
  let detectionCanvas;
  let detectionTooltip;
  let highRiskBadge;
  let recordBtn;
  let playPauseBtn;
  let frameStepBtn;
  let screenshotBtn;
  let frameFileInput;
  let zoomSelect;
  let zoomSelectWrap;
  let zoomSelectDropdown;
  let isZoomDropdownOpen = false;
  let videoWrapper;
  let cctvFeedLayer;
  let cameraSelector;
  let cameraDropdown;
  let cameraDropdownList;
  let cameraNameEl;
  let isPaused = false;

  let resizeObserver = null;
  let lastDetectionFrame = {
    detections: [],
    imageWidth: 1280,
    imageHeight: 720,
  };

  const ICONS = {
    play: '<svg class="icon-svg btn-start-camera-icon" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
    stop: '<svg class="icon-svg btn-start-camera-icon" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>',
    controlPlay: '<svg class="icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
    controlPause: '<svg class="icon-svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>',
  };

  function updatePlayPauseIcon() {
    if (!playPauseBtn) return;
    playPauseBtn.innerHTML = isPaused ? ICONS.controlPlay : ICONS.controlPause;
    playPauseBtn.classList.toggle('active', isPaused);
  }

  function resetPlayPauseState() {
    isPaused = false;
    if (liveVideo && (stream || isVideoFeedActive)) {
      liveVideo.play().catch(() => {});
    }
    updatePlayPauseIcon();
  }

  function togglePlayPause() {
    if (!stream && !isVideoFeedActive) {
      alert('Inicie o feed antes de usar play/pause.');
      return;
    }

    if (liveVideo.paused) {
      liveVideo.play();
      isPaused = false;
    } else {
      liveVideo.pause();
      isPaused = true;
    }

    updatePlayPauseIcon();
  }

  async function stepFrame() {
    if ((stream || isVideoFeedActive) && liveVideo.videoWidth) {
      if (isVideoFeedActive && !stream) {
        liveVideo.currentTime = Math.min(
          liveVideo.currentTime + 0.5,
          liveVideo.duration || liveVideo.currentTime + 0.5,
        );
        await new Promise((resolve) => {
          liveVideo.addEventListener('seeked', resolve, { once: true });
        });
      }
      await captureAndAnalyzeFrame();
      return;
    }

    frameFileInput.click();
  }

  function setCameraSourceStatus(isLive) {
    const statusEl = document.getElementById('cameraStatus');
    const statusTextEl = document.getElementById('cameraStatusText');
    const signalBarsEl = document.getElementById('cameraSignalBars');

    if (!statusEl || !statusTextEl) return;

    statusEl.classList.toggle('is-live', isLive);
    statusEl.classList.toggle('is-offline', !isLive);
    statusTextEl.textContent = isLive ? 'Live' : 'Offline';
    signalBarsEl?.classList.toggle('is-strong', isLive);
  }

  function setCameraButtonState(isRunning) {
    setCameraSourceStatus(isRunning);

    if (isRunning) {
      startCameraBtn.innerHTML = `${ICONS.stop} Stop Feed`;
      startCameraBtn.classList.add('parar-feed-btn');
      startCameraBtn.classList.remove('iniciar-feed-btn');
      startCameraBtn.dataset.action = 'stop-feed';
      startCameraBtn.onclick = stopCamera;
      return;
    }

    startCameraBtn.innerHTML = `${ICONS.play} Start Feed`;
    startCameraBtn.classList.add('iniciar-feed-btn');
    startCameraBtn.classList.remove('parar-feed-btn');
    startCameraBtn.dataset.action = 'start-feed';
    startCameraBtn.onclick = startCamera;
  }

  function updateCameraUiFields(camera) {
    if (!camera) return;

    if (cameraNameEl) cameraNameEl.textContent = camera.name;

    const camNumberEl = document.getElementById('camNumber');
    if (camNumberEl) camNumberEl.textContent = camera.number;

    const uploadCameraId = document.getElementById('uploadCameraId');
    if (uploadCameraId) uploadCameraId.value = camera.id;

    const uploadZone = document.getElementById('uploadZone');
    if (uploadZone) uploadZone.value = camera.zone;
  }

  function updateCameraCounts() {
    const total = cameras.length;
    const online = isVideoFeedActive || Boolean(stream) ? 1 : 0;

    const camerasOnlineNum = document.getElementById('camerasOnlineNum');
    const camerasOnlineTotal = document.getElementById('camerasOnlineTotal');
    const statusCameraTotal = document.getElementById('statusCameraTotal');

    if (camerasOnlineNum) camerasOnlineNum.textContent = String(online);
    if (camerasOnlineTotal) camerasOnlineTotal.textContent = String(total);
    if (statusCameraTotal) statusCameraTotal.textContent = String(total);

    if (window.Dashboard?.syncStatusIndicator) {
      window.Dashboard.syncStatusIndicator();
    }
  }

  function renderCameraDropdown() {
    if (!cameraDropdownList) return;

    cameraDropdownList.innerHTML = '';

    if (cameras.length === 0) {
      cameraDropdownList.innerHTML = '<li class="camera-dropdown-empty">No videos in /videos</li>';
      if (cameraNameEl) cameraNameEl.textContent = 'No cameras available';
      updateCameraCounts();
      return;
    }

    cameras.forEach((camera) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'camera-dropdown-item';
      button.setAttribute('role', 'option');
      button.dataset.cameraId = camera.id;

      if (selectedCamera?.id === camera.id) {
        button.classList.add('is-active');
        button.setAttribute('aria-selected', 'true');
      }

      button.innerHTML = `
        <span class="camera-dropdown-item-name">${camera.name}</span>
        <span class="camera-dropdown-item-meta">${camera.filename}</span>
      `;

      button.addEventListener('click', (event) => {
        event.stopPropagation();
        selectCamera(camera.id, true);
        closeCameraDropdown();
      });

      item.appendChild(button);
      cameraDropdownList.appendChild(item);
    });

    updateCameraCounts();
  }

  function openCameraDropdown() {
    if (!cameraDropdown || cameras.length === 0) return;
    setZoomDropdownOpen(false);
    isDropdownOpen = true;
    cameraDropdown.hidden = false;
    cameraSelector?.classList.add('is-open');
    cameraSelector?.setAttribute('aria-expanded', 'true');
  }

  function closeCameraDropdown() {
    if (!cameraDropdown) return;
    isDropdownOpen = false;
    cameraDropdown.hidden = true;
    cameraSelector?.classList.remove('is-open');
    cameraSelector?.setAttribute('aria-expanded', 'false');
  }

  function toggleCameraDropdown() {
    if (isDropdownOpen) {
      closeCameraDropdown();
      return;
    }
    openCameraDropdown();
  }

  async function loadCameras() {
    try {
      let data = null;

      const staticResponse = await fetch('/cameras.json', { cache: 'no-store' });
      if (staticResponse.ok) {
        data = await staticResponse.json();
      }

      if (!data?.cameras?.length) {
        const response = await fetch('/api/cameras');
        if (!response.ok) throw new Error('Failed to load cameras');
        data = await response.json();
      }

      cameras = data.cameras || [];
      renderCameraDropdown();

      if (cameras.length > 0) {
        selectCamera(cameras[0].id, false);
      } else if (cameraNameEl) {
        cameraNameEl.textContent = 'No cameras available';
      }
    } catch (error) {
      console.error('Camera load failed:', error.message);
      if (cameraNameEl) cameraNameEl.textContent = 'Error loading cameras';
    }
  }

  async function selectCamera(cameraId, restartFeed) {
    const camera = cameras.find((item) => item.id === cameraId);
    if (!camera) return;

    const wasActive = isVideoFeedActive || Boolean(stream);
    selectedCamera = camera;
    updateCameraUiFields(camera);
    renderCameraDropdown();

    if (restartFeed && wasActive) {
      stopCamera();
      await startCamera();
    }
  }

  function setZoomDropdownOpen(open) {
    if (!zoomSelect || !zoomSelectDropdown) return;
    if (open) closeCameraDropdown();
    isZoomDropdownOpen = open;
    zoomSelectDropdown.hidden = !open;
    zoomSelect.classList.toggle('is-open', open);
    zoomSelect.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function applyZoom(scale) {
    const label = document.getElementById('zoomSelectLabel');
    if (label) label.textContent = `${scale}x`;

    zoomSelectDropdown?.querySelectorAll('.tn-select-option').forEach((btn) => {
      const active = btn.dataset.value === scale;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    if (cctvFeedLayer) {
      cctvFeedLayer.style.transform = `scale(${scale})`;
      cctvFeedLayer.style.transformOrigin = 'center center';
    }
    redrawBoundingBoxes();
  }

  function initZoomSelect() {
    zoomSelect = document.getElementById('zoomSelect');
    zoomSelectWrap = document.getElementById('zoomSelectWrap');
    zoomSelectDropdown = document.getElementById('zoomSelectDropdown');

    zoomSelect?.addEventListener('click', (event) => {
      event.stopPropagation();
      setZoomDropdownOpen(!isZoomDropdownOpen);
    });

    zoomSelect?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setZoomDropdownOpen(!isZoomDropdownOpen);
      }
      if (event.key === 'Escape') {
        setZoomDropdownOpen(false);
      }
    });

    zoomSelectDropdown?.querySelectorAll('.tn-select-option').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        applyZoom(btn.dataset.value);
        setZoomDropdownOpen(false);
      });
    });

    document.addEventListener('click', (event) => {
      if (!event.target.closest('#zoomSelectWrap')) {
        setZoomDropdownOpen(false);
      }
    });
  }

  function initCameraSelector() {
    cameraSelector = document.getElementById('cameraSelector');
    cameraDropdown = document.getElementById('cameraDropdown');
    cameraDropdownList = document.getElementById('cameraDropdownList');
    cameraNameEl = document.getElementById('cameraName');

    cameraSelector?.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleCameraDropdown();
    });

    cameraSelector?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleCameraDropdown();
      }
      if (event.key === 'Escape') {
        closeCameraDropdown();
      }
    });

    document.addEventListener('click', (event) => {
      if (!event.target.closest('.camera-selector-wrap')) {
        closeCameraDropdown();
      }
    });
  }

  function init() {
    startCameraBtn = document.getElementById('startCameraBtn');
    liveVideo = document.getElementById('liveVideo');
    staticFrame = document.getElementById('staticFrame');
    videoPlaceholder = document.getElementById('videoPlaceholder');
    detectionCanvas = document.getElementById('detectionCanvas');
    detectionTooltip = document.getElementById('detectionTooltip');
    highRiskBadge = document.getElementById('highRiskBadge');
    recordBtn = document.getElementById('recordBtn');
    playPauseBtn = document.getElementById('playPauseBtn');
    frameStepBtn = document.getElementById('frameStepBtn');
    screenshotBtn = document.getElementById('screenshotBtn');
    frameFileInput = document.getElementById('frameFileInput');
    zoomSelect = document.getElementById('zoomSelect');
    videoWrapper = document.getElementById('videoWrapper');
    cctvFeedLayer = document.getElementById('cctvFeedLayer');

    initCameraSelector();
    initZoomSelect();
    loadCameras();

    startCameraBtn.onclick = startCamera;
    recordBtn.onclick = toggleRecording;
    playPauseBtn.onclick = togglePlayPause;
    frameStepBtn.onclick = stepFrame;
    screenshotBtn.onclick = takeScreenshot;
    frameFileInput.onchange = handleFileUpload;
    updatePlayPauseIcon();

    initBoundingBoxObservers();
  }

  function getActiveMediaElement() {
    if (liveVideo?.style.display !== 'none' && liveVideo.videoWidth) return liveVideo;
    if (staticFrame?.style.display !== 'none' && staticFrame.naturalWidth) return staticFrame;
    return null;
  }

  function syncCanvasSize() {
    const mediaEl = getActiveMediaElement();
    if (!detectionCanvas || !mediaEl) return false;

    const rect = mediaEl.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);

    if (width === 0 || height === 0) return false;

    if (detectionCanvas.width !== width || detectionCanvas.height !== height) {
      detectionCanvas.width = width;
      detectionCanvas.height = height;
    }

    return true;
  }

  function getContainRenderRect(mediaEl, canvasW, canvasH) {
    const intrinsicW = mediaEl.videoWidth || mediaEl.naturalWidth || canvasW;
    const intrinsicH = mediaEl.videoHeight || mediaEl.naturalHeight || canvasH;
    const videoAspect = intrinsicW / intrinsicH;
    const canvasAspect = canvasW / canvasH;

    let renderW;
    let renderH;
    let offsetX;
    let offsetY;

    if (videoAspect > canvasAspect) {
      renderW = canvasW;
      renderH = canvasW / videoAspect;
      offsetX = 0;
      offsetY = (canvasH - renderH) / 2;
    } else {
      renderH = canvasH;
      renderW = canvasH * videoAspect;
      offsetX = (canvasW - renderW) / 2;
      offsetY = 0;
    }

    return { offsetX, offsetY, renderW, renderH };
  }

  function getScaledBox(box, mediaEl, canvas, imageWidth, imageHeight) {
    const norm = {
      x: (box.x - box.width / 2) / imageWidth,
      y: (box.y - box.height / 2) / imageHeight,
      width: box.width / imageWidth,
      height: box.height / imageHeight,
    };

    const { offsetX, offsetY, renderW, renderH } = getContainRenderRect(
      mediaEl,
      canvas.width,
      canvas.height,
    );

    return {
      x: offsetX + norm.x * renderW,
      y: offsetY + norm.y * renderH,
      w: norm.width * renderW,
      h: norm.height * renderH,
    };
  }

  function getDetectionColor(detection) {
    if (detection.objectClass === 'Person with Mask') return '#a855f7';
    if (detection.objectClass === 'Weapon: Knife') return '#f97316';
    if (detection.objectClass?.startsWith('Weapon:')) return '#dc2626';

    const confidence = detection.confidence ?? 0;
    if (confidence >= 0.7) return '#EF4444';
    if (confidence >= 0.4) return '#F59E0B';
    return '#6B7280';
  }

  function drawCornerAccents(ctx, box, color) {
    const arm = 10;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;

    const corners = [
      [box.x, box.y, arm, 0, 0, arm],
      [box.x + box.w, box.y, -arm, 0, 0, arm],
      [box.x, box.y + box.h, arm, 0, 0, -arm],
      [box.x + box.w, box.y + box.h, -arm, 0, 0, -arm],
    ];

    corners.forEach(([cx, cy, dx1, dy1, dx2, dy2]) => {
      ctx.beginPath();
      ctx.moveTo(cx + dx1, cy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx, cy + dy2);
      ctx.stroke();
    });
  }

  function redrawBoundingBoxes() {
    if (lastDetectionFrame.detections.length === 0) return;

    drawBoundingBoxes(
      lastDetectionFrame.detections,
      lastDetectionFrame.imageWidth,
      lastDetectionFrame.imageHeight,
    );
  }

  function initBoundingBoxObservers() {
    if (typeof ResizeObserver === 'undefined') return;

    resizeObserver = new ResizeObserver(() => {
      redrawBoundingBoxes();
    });

    if (liveVideo) resizeObserver.observe(liveVideo);
    if (staticFrame) resizeObserver.observe(staticFrame);
    if (cctvFeedLayer) resizeObserver.observe(cctvFeedLayer);
    if (videoWrapper) resizeObserver.observe(videoWrapper);

    document.addEventListener('fullscreenchange', () => {
      requestAnimationFrame(() => {
        redrawBoundingBoxes();
      });
    });
  }

  async function startCamera() {
    if (stream || isVideoFeedActive) {
      stopCamera();
      return;
    }

    if (!selectedCamera) {
      alert('Select a camera (video) from the list.');
      return;
    }

    await startVideoFeed(selectedCamera);
  }

  function setCctvMode(active) {
    videoWrapper?.classList.toggle('is-cctv-active', active);

    const overlay = document.getElementById('cctv-overlay');
    if (overlay) overlay.hidden = !active;

    if (active) {
      window.CctvOverlay?.start();
    } else {
      window.CctvOverlay?.stop();
    }
  }

  async function startVideoFeed(camera) {
    try {
      liveVideo.srcObject = null;
      liveVideo.src = camera.videoUrl;
      liveVideo.loop = true;
      liveVideo.muted = true;
      liveVideo.playsInline = true;

      staticFrame.style.display = 'none';
      liveVideo.style.display = 'block';
      videoPlaceholder.style.display = 'none';
      setCctvMode(true);

      applyZoom('1.0');

      await liveVideo.play();

      isVideoFeedActive = true;
      setCameraButtonState(true);
      resetPlayPauseState();
      updateCameraCounts();

      frameInterval = setInterval(captureAndAnalyzeFrame, FRAME_INTERVAL_MS);
      lastAnalyzeMs = 0;
      framesAnalyzed = 0;
      await captureAndAnalyzeFrame();
    } catch (error) {
      isVideoFeedActive = false;
      liveVideo.style.display = 'none';
      videoPlaceholder.style.display = 'flex';
      setCctvMode(false);
      setCameraButtonState(false);
      alert(`Could not play video: ${error.message}`);
    }
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }

    if (frameInterval) {
      clearInterval(frameInterval);
      frameInterval = null;
    }

    if (isVideoFeedActive) {
      liveVideo.pause();
      liveVideo.removeAttribute('src');
      liveVideo.load();
      isVideoFeedActive = false;
    }

    analyzeInFlight = false;
    analyzePending = false;
    lastAnalyzeMs = 0;
    framesAnalyzed = 0;

    liveVideo.style.display = 'none';
    staticFrame.style.display = 'none';
    videoPlaceholder.style.display = 'flex';
    setCctvMode(false);
    setCameraButtonState(false);
    resetPlayPauseState();
    clearDetections();
    updateCameraCounts();
  }

  function ensureCaptureCanvas(width, height) {
    if (!captureCanvas) {
      captureCanvas = document.createElement('canvas');
      captureCtx = captureCanvas.getContext('2d', { alpha: false });
    }

    if (captureCanvas.width !== width || captureCanvas.height !== height) {
      captureCanvas.width = width;
      captureCanvas.height = height;
    }
  }

  function updateInferenceBadge() {
    const badge = document.querySelector('.ai-inference-badge');
    if (!badge || !isVideoFeedActive) return;

    const fps = lastAnalyzeMs > 0 ? Math.min(99, Math.round(1000 / lastAnalyzeMs)) : 0;
    badge.textContent = `● AI Inference ~${fps} fps`;
  }

  async function captureAndAnalyzeFrame() {
    if (!liveVideo.videoWidth) return;

    if (analyzeInFlight) {
      analyzePending = true;
      return;
    }

    analyzeInFlight = true;
    const startedAt = performance.now();

    const sourceWidth = liveVideo.videoWidth;
    const sourceHeight = liveVideo.videoHeight;
    const scale = Math.min(1, MAX_CAPTURE_WIDTH / sourceWidth);
    const targetWidth = Math.round(sourceWidth * scale);
    const targetHeight = Math.round(sourceHeight * scale);

    ensureCaptureCanvas(targetWidth, targetHeight);
    // drawImage lê o frame bruto do vídeo — sem filtros CSS do overlay CCTV
    captureCtx.drawImage(liveVideo, 0, 0, targetWidth, targetHeight);

    try {
      const cameraId = selectedCamera?.id || 'CAM-01';
      const zone = selectedCamera?.zone || 'Unknown Zone';

      if (window.YoloClient?.isActive()) {
        const data = await window.YoloClient.analyzeCanvas(
          captureCanvas,
          targetWidth,
          targetHeight,
          cameraId,
          zone,
        );

        framesAnalyzed += 1;
        lastAnalyzeMs = performance.now() - startedAt;
        updateInferenceBadge();

        if (window.Dashboard) {
          window.Dashboard.handleDetections({
            ...data,
            imageWidth: targetWidth,
            imageHeight: targetHeight,
          });
        }
        return;
      }

      const blob = await new Promise((resolve) => {
        captureCanvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY);
      });

      if (!blob) return;

      const formData = new FormData();
      formData.append('image', blob, 'frame.jpg');
      formData.append('cameraId', cameraId);
      formData.append('zone', zone);

      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Frame analysis failed:', response.status, errorText);
        return;
      }

      const data = await response.json();
      framesAnalyzed += 1;
      lastAnalyzeMs = performance.now() - startedAt;
      updateInferenceBadge();

      if (window.Dashboard) {
        window.Dashboard.handleDetections({
          ...data,
          imageWidth: targetWidth,
          imageHeight: targetHeight,
        });
      }
    } catch (error) {
      console.error('Frame analysis failed:', error.message);
    } finally {
      analyzeInFlight = false;

      if (analyzePending) {
        analyzePending = false;
        captureAndAnalyzeFrame();
      }
    }
  }

  async function handleFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      showStaticFrame(reader.result);

      const cameraId = selectedCamera?.id || document.getElementById('uploadCameraId')?.value || 'CAM-01';
      const zone = selectedCamera?.zone || document.getElementById('uploadZone')?.value || 'Unknown Zone';

      try {
        if (window.YoloClient?.isActive()) {
          const img = new Image();
          img.onload = async () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            canvas.getContext('2d').drawImage(img, 0, 0);
            const data = await window.YoloClient.analyzeCanvas(
              canvas,
              img.naturalWidth,
              img.naturalHeight,
              cameraId,
              zone,
            );
            window.Dashboard?.handleDetections(data);
          };
          img.src = reader.result;
          return;
        }

        const formData = new FormData();
        formData.append('image', file);
        formData.append('cameraId', cameraId);
        formData.append('zone', zone);

        const response = await fetch('/api/analyze', {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();
        if (window.Dashboard) {
          window.Dashboard.handleDetections(data);
        }
      } catch (error) {
        console.error('Upload analysis failed:', error.message);
      }
    };

    reader.readAsDataURL(file);
  }

  function drawBoundingBoxes(detections, imageWidth, imageHeight) {
    currentDetections = detections;
    lastDetectionFrame = {
      detections,
      imageWidth,
      imageHeight,
    };

    if (!detectionCanvas) return;

    const mediaEl = getActiveMediaElement();
    if (!mediaEl || !syncCanvasSize()) return;

    const ctx = detectionCanvas.getContext('2d');
    ctx.clearRect(0, 0, detectionCanvas.width, detectionCanvas.height);

    let topHighRisk = null;

    detections.forEach((detection) => {
      const box = getScaledBox(
        detection.boundingBox,
        mediaEl,
        detectionCanvas,
        imageWidth,
        imageHeight,
      );

      const color = getDetectionColor(detection);

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(box.x, box.y, box.w, box.h);
      drawCornerAccents(ctx, box, color);

      const label = `${detection.objectClass} ${detection.confidencePercent}`;
      const fontSize = 10;
      ctx.font = `600 ${fontSize}px "IBM Plex Mono", JetBrains Mono, monospace`;

      const textW = ctx.measureText(label).width;
      const padX = 6;
      const padY = 3;
      const pillH = fontSize + padY * 2;
      const pillW = textW + padX * 2;
      const pillX = Math.max(0, Math.min(box.x, detectionCanvas.width - pillW));
      const pillY = Math.max(0, box.y - pillH - 2);

      ctx.fillStyle = color;
      ctx.fillRect(pillX, pillY, pillW, pillH);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, pillX + padX, pillY + padY + fontSize - 1);

      if (detection.riskLevel === 'HIGH') {
        topHighRisk = { detection, x: box.x, y: box.y, w: box.w, h: box.h };
      }
    });

    if (topHighRisk) {
      highRiskBadge.style.display = 'block';
      detectionTooltip.style.display = 'block';
      document.getElementById('tooltipClass').textContent = topHighRisk.detection.objectClass;
      document.getElementById('tooltipConfidence').textContent = `Confidence: ${topHighRisk.detection.confidencePercent}`;
      detectionTooltip.style.left = `${topHighRisk.x}px`;
      detectionTooltip.style.top = `${Math.max(0, topHighRisk.y - 48)}px`;
    } else {
      highRiskBadge.style.display = 'none';
      detectionTooltip.style.display = 'none';
    }
  }

  function takeScreenshot() {
    const canvas = document.createElement('canvas');
    const source = liveVideo.style.display !== 'none' ? liveVideo : staticFrame;

    if (!source || (source === liveVideo && !liveVideo.videoWidth)) {
      alert('No frame available for capture.');
      return;
    }

    canvas.width = source.videoWidth || source.naturalWidth || 1280;
    canvas.height = source.videoHeight || source.naturalHeight || 720;
    const ctx = canvas.getContext('2d');
    ctx.filter = videoWrapper?.classList.contains('is-cctv-active')
      ? 'saturate(0.7) contrast(1.08) brightness(0.95)'
      : 'none';
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

    const now = new Date();
    const stamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0'),
    ].join('');

    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/jpeg');
    link.download = `threadvision_screenshot_${stamp}.jpg`;
    link.click();
  }

  function toggleRecording() {
    if (!stream) {
      alert('Recording available for live webcam only.');
      return;
    }

    if (!isRecording) {
      recordedChunks = [];
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunks.push(event.data);
      };
      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `threadvision_recording_${Date.now()}.webm`;
        link.click();
      };
      mediaRecorder.start();
      isRecording = true;
      recordBtn.classList.add('recording', 'active');
      return;
    }

    mediaRecorder.stop();
    isRecording = false;
    recordBtn.classList.remove('recording', 'active');
  }

  function showStaticFrame(dataUrl) {
    staticFrame.src = dataUrl;
    staticFrame.style.display = 'block';
    liveVideo.style.display = 'none';
    videoPlaceholder.style.display = 'none';
    setCctvMode(true);
  }

  function clearDetections() {
    currentDetections = [];
    lastDetectionFrame = {
      detections: [],
      imageWidth: 1280,
      imageHeight: 720,
    };

    if (detectionCanvas) {
      const ctx = detectionCanvas.getContext('2d');
      ctx.clearRect(0, 0, detectionCanvas.width, detectionCanvas.height);
    }

    highRiskBadge.style.display = 'none';
    detectionTooltip.style.display = 'none';
  }

  return {
    init,
    startCamera,
    stopCamera,
    captureAndAnalyzeFrame,
    handleFileUpload,
    drawBoundingBoxes,
    takeScreenshot,
    toggleRecording,
    showStaticFrame,
    clearDetections,
    loadCameras,
  };
})();
