window.Dashboard = (() => {
  const isLocalDev = window.location.hostname === 'localhost'
    || window.location.hostname === '127.0.0.1';
  const socket = isLocalDev && typeof io !== 'undefined'
    ? io()
    : { on() {}, emit() {}, disconnect() {} };
  let currentEventId = null;
  let startTime = Date.now();
  let uptimeInterval = null;
  let clockInterval = null;
  let uploadedFile = null;
  let isEventReviewed = false;
  let reviewInProgress = false;
  let reviewBtnDefaultHtml = '';

  let displayedTargetScore = 0;
  let targetScoreAnimFrame = null;
  let targetScoreEventCount = 0;
  let targetScoreSum = 0;
  let targetScorePeakToday = 0;

  function updateTargetScoreStats(score) {
    targetScoreEventCount += 1;
    targetScoreSum += score;
    targetScorePeakToday = Math.max(targetScorePeakToday, score);

    const avgEl = document.getElementById('targetScoreAvg');
    const peakEl = document.getElementById('targetScorePeak');
    const eventsEl = document.getElementById('targetScoreEvents');

    if (!avgEl || !peakEl || !eventsEl) return;

    avgEl.textContent = String(Math.round(targetScoreSum / targetScoreEventCount));
    peakEl.textContent = String(targetScorePeakToday);
    eventsEl.textContent = String(targetScoreEventCount);
  }

  function resetTargetScoreStats() {
    targetScoreEventCount = 0;
    targetScoreSum = 0;
    targetScorePeakToday = 0;

    const avgEl = document.getElementById('targetScoreAvg');
    const peakEl = document.getElementById('targetScorePeak');
    const eventsEl = document.getElementById('targetScoreEvents');

    if (avgEl) avgEl.textContent = '0';
    if (peakEl) peakEl.textContent = '0';
    if (eventsEl) eventsEl.textContent = '0';
  }

  function formatRelativeTime(date) {
    const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
  }

  function prependDetectionHistory(detection) {
    const list = document.getElementById('detectionHistoryList');
    if (!list) return;

    const isThreat = detection.riskLevel === 'HIGH' || detection.riskLevel === 'MEDIUM';
    const label = isThreat ? `${detection.objectClass} Detected` : 'No Detection';
    const dotClass = isThreat ? 'detection-history-dot--threat' : 'detection-history-dot--clear';

    const row = document.createElement('div');
    row.className = 'detection-history-row';
    row.style.setProperty('--row-opacity', '1');
    row.innerHTML = `
      <span class="detection-history-left">
        <span class="detection-history-dot ${dotClass}" aria-hidden="true"></span>
        <span class="detection-history-label">${label}</span>
      </span>
      <span class="detection-history-time">${formatRelativeTime(new Date(detection.timestamp))}</span>
    `;

    list.prepend(row);

    const opacities = [1, 0.75, 0.55, 0.35];
    const rows = [...list.querySelectorAll('.detection-history-row')];
    rows.forEach((entry, index) => {
      if (index >= 4) {
        entry.remove();
        return;
      }
      entry.style.setProperty('--row-opacity', String(opacities[index]));
      entry.classList.toggle('detection-history-row--last', index === Math.min(rows.length, 4) - 1);
    });
  }

  function applyTargetScoreVisuals(score, tier) {
    const levelEl = document.getElementById('targetScoreLevel');
    const numEl = document.getElementById('targetScoreNum');
    const fillEl = document.getElementById('targetScoreBarFill');
    const clampedScore = Math.max(0, Math.min(100, score));

    if (!levelEl || !numEl || !fillEl) return;

    levelEl.textContent = getTargetScoreLabel(tier);
    levelEl.className = `target-score-badge target-score-badge--${tier}`;

    numEl.textContent = String(clampedScore);
    numEl.className = `target-score-num target-score-num--${tier}`;

    fillEl.style.width = `${clampedScore}%`;
    fillEl.className = `target-score-bar-fill target-score-bar-fill--${tier}`;
  }

  function getTargetScoreTier(score) {
    if (score >= 75) return 'high';
    if (score >= 50) return 'medium';
    return 'low';
  }

  function getTargetScoreLabel(tier) {
    if (tier === 'high') return 'High';
    if (tier === 'medium') return 'Medium';
    return 'Low';
  }

  function animateTargetScoreTo(targetScore) {
    const startScore = displayedTargetScore;
    const tier = getTargetScoreTier(targetScore);
    const startTime = performance.now();
    const duration = 400;

    if (targetScoreAnimFrame) {
      cancelAnimationFrame(targetScoreAnimFrame);
    }

    function frame(now) {
      const progress = Math.min((now - startTime) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      const currentScore = Math.round(startScore + (targetScore - startScore) * eased);

      displayedTargetScore = currentScore;
      applyTargetScoreVisuals(currentScore, tier);

      if (progress < 1) {
        targetScoreAnimFrame = requestAnimationFrame(frame);
        return;
      }

      displayedTargetScore = targetScore;
      applyTargetScoreVisuals(targetScore, tier);
      targetScoreAnimFrame = null;
    }

    targetScoreAnimFrame = requestAnimationFrame(frame);
  }

  function syncStatusIndicator() {
    const alertEl = document.getElementById('statusAlertCount');
    const cameraTotalEl = document.getElementById('statusCameraTotal');
    const incidentEl = document.getElementById('incidentCount');
    const camerasTotalEl = document.getElementById('camerasOnlineTotal');

    if (alertEl && incidentEl) {
      alertEl.textContent = incidentEl.textContent;
    }
    if (cameraTotalEl && camerasTotalEl) {
      cameraTotalEl.textContent = camerasTotalEl.textContent;
    }
  }

  function init() {
    window.ThreatCharts.init();
    window.VideoFeed.init();
    initSocketListeners();
    initUIListeners();
    startClock();
    startUptimeCounter();
    animateTargetScoreTo(0);
    initTimelineTrack();
    renderAiSummaryEmpty();
    syncStatusIndicator();

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  function initSocketListeners() {
    socket.on('connected', (data) => {
      console.log('ThreatVision conectado:', data.message);
    });

    socket.on('detections', (data) => {
      if (!data.detections || data.detections.length === 0) {
        window.VideoFeed.clearDetections();
        return;
      }

      handleDetections({
        detections: data.detections,
        imageWidth: data.imageWidth,
        imageHeight: data.imageHeight,
      });
    });

    socket.on('threat-alert', (detection) => {
      showThreatAlert(detection);
    });

    socket.on('event-updated', (data) => {
      if (data.eventId === currentEventId) {
        setEventValue('escalationStatus', data.status, getEscalationClass(data.status));
        if (data.status === 'Reviewed' && !isEventReviewed && !reviewInProgress) {
          applyReviewedUI();
        }
      }
    });
  }

  function getEscalationClass(status) {
    if (status === 'Reviewed') return 'escalation-reviewed';
    if (status === 'False Alarm') return 'escalation-false-alarm';
    if (status === 'Needs Review') return 'escalation-needs-review';
    return '';
  }

  function handleDetections(data) {
    const detections = data.detections || [];
    if (detections.length === 0) return;

    const topDetection = [...detections].sort((a, b) => b.threatScore - a.threatScore)[0];

    updateThreatContext(topDetection);
    updateEventPanel(topDetection);
    updateAiSummary(topDetection);
    updateTargetScoreStats(topDetection.threatScore);
    prependDetectionHistory(topDetection);
    window.VideoFeed.drawBoundingBoxes(
      detections,
      data.imageWidth || 1280,
      data.imageHeight || 720,
    );

    window.ThreatCharts.addConfidencePoint(topDetection.confidence);

    const highCount = detections.filter((item) => item.riskLevel === 'HIGH').length;
    if (highCount > 0) {
      const incidentEl = document.getElementById('incidentCount');
      incidentEl.textContent = String(Number(incidentEl.textContent || 0) + highCount);
      syncStatusIndicator();
    }
  }

  function getRiskPercentTier(percent) {
    if (percent < 20) return 'danger';
    if (percent <= 60) return 'warn';
    return 'safe';
  }

  function setCtxValue(elementId, value) {
    const el = document.getElementById(elementId);
    if (!el) return;

    const isEmpty = value === null || value === undefined || value === '' || value === '--';
    if (isEmpty) {
      el.innerHTML = '<span class="ctx-empty" aria-hidden="true"></span>';
      return;
    }

    el.textContent = value;
  }

  function setStatValue(elementId, value, tier) {
    const el = document.getElementById(elementId);
    if (!el) return;

    const isEmpty = value === null || value === undefined || value === '' || value === '--';
    el.className = 'stat-card-value';
    if (elementId === 'confidenceValue') {
      el.classList.add('ctx-val--mono');
    }

    if (isEmpty) {
      el.innerHTML = '<span class="ctx-empty" aria-hidden="true"></span>';
      return;
    }

    el.textContent = value;
    if (tier) {
      el.classList.add(`stat-card-value--${tier}`);
    }
  }

  function setTrendPill(trendEl, label, variant) {
    trendEl.className = `trend-pill trend-pill--${variant}`;
    trendEl.innerHTML = `<span class="trend-pill-dot"></span>${label}`;
  }

  function updateThreatContext(detection) {
    const riskPercent = Math.round(detection.confidence * 100);
    const riskTier = getRiskPercentTier(riskPercent);

    setStatValue('riskStatValue', detection.confidencePercent, riskTier);
    setStatValue('confidenceValue', String(riskPercent));

    const trendEl = document.getElementById('trendValue');
    const confidenceData = window.ThreatCharts.getConfidenceData();
    const recent = confidenceData.slice(-5);

    if (recent.length >= 2 && recent[recent.length - 1] > recent[recent.length - 2]) {
      setTrendPill(trendEl, 'RISING', 'rising');
    } else if (recent.length >= 2 && recent[recent.length - 1] < recent[recent.length - 2]) {
      setTrendPill(trendEl, 'FALLING', 'falling');
    } else {
      setTrendPill(trendEl, 'STABLE', 'stable');
    }

    setCtxValue('ctxObjectType', detection.objectClass);
    setCtxValue('ctxMotion', detection.motionState);
    setCtxValue('ctxZone', detection.zone);
    setCtxValue('ctxVisibility', detection.visibility);

    const violenceLabel =
      detection.riskLevel === 'HIGH' ? 'Elevated' :
      detection.riskLevel === 'MEDIUM' ? 'Moderate' : 'Low';
    setCtxValue('ctxViolence', violenceLabel);

    const secondsInFrame = Math.max(0, (Date.now() - new Date(detection.timestamp).getTime()) / 1000);
    setCtxValue('ctxTimeInFrame', `${secondsInFrame.toFixed(1)} sec`);
    setCtxValue('ctxFirstDetected', new Date(detection.timestamp).toLocaleTimeString('en-US'));

    animateTargetScoreTo(detection.threatScore);
  }

  function setEventValue(elementId, value, statusClass) {
    const el = document.getElementById(elementId);
    if (!el) return;

    el.className = 'event-val event-val--mono';
    if (statusClass) {
      el.classList.add(statusClass);
    }

    const isEmpty = value === null || value === undefined || value === '' || value === '--';
    if (isEmpty) {
      el.innerHTML = '<span class="event-empty">— —</span>';
      return;
    }

    el.textContent = value;
  }

  function setEventId(id) {
    const el = document.getElementById('eventId');
    if (!el) return;

    if (!id) {
      el.innerHTML = 'ID: <span class="event-empty">— —</span>';
      return;
    }

    el.innerHTML = `ID: <span class="event-id-value">${id}</span>`;
  }

  function formatDetectionTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  function renderAiSummaryFooterHtml() {
    return `
      <div class="ai-summary-footer">
        <span class="ai-summary-footer-model">Model: YOLOv8-weapons</span>
        <span class="ai-summary-footer-status">v1.3 • Online</span>
      </div>
    `;
  }

  function createSkeletonBlock(label, lineWidths, shimmerDelay) {
    const lines = lineWidths
      .map((width) => `<span class="ai-skeleton-line" style="width:${width}"></span>`)
      .join('');

    return `
      <div class="ai-summary-card" style="--shimmer-delay:${shimmerDelay}s">
        <div class="ai-summary-card-label">${label}</div>
        <div class="ai-summary-card-lines">${lines}</div>
      </div>
    `;
  }

  function createSummaryCard(label, bodyText) {
    return `
      <div class="ai-summary-card">
        <div class="ai-summary-card-label">${label}</div>
        <div class="ai-summary-card-body">${bodyText}</div>
      </div>
    `;
  }

  function renderAiSummaryEmpty() {
    const bodyEl = document.getElementById('aiSummaryBody');
    const timeEl = document.getElementById('aiSummaryTime');
    if (timeEl) timeEl.textContent = '--:-- --';
    if (!bodyEl) return;

    bodyEl.innerHTML = `
      <div class="ai-summary-waiting">
        <span class="ai-summary-waiting-dot" aria-hidden="true"></span>
        <span class="ai-summary-waiting-text">Aguardando detecção...</span>
      </div>
      <div class="ai-summary-skeletons">
        ${createSkeletonBlock('THREAT ASSESSMENT', ['100%', '65%'], 0)}
        ${createSkeletonBlock('OBJECT DETAILS', ['100%', '80%'], 0.3)}
        ${createSkeletonBlock('RECOMMENDED ACTIONS', ['100%', '75%', '45%'], 0.6)}
        ${createSkeletonBlock('CONFIDENCE ANALYSIS', ['100%', '55%'], 0.9)}
      </div>
      ${renderAiSummaryFooterHtml()}
    `;
  }

  function renderAiSummaryPopulated(detection) {
    const bodyEl = document.getElementById('aiSummaryBody');
    if (!bodyEl) return;

    const { recommendedAction } = getActionDetails(detection.riskLevel);
    const threatAssessment =
      `Potential ${detection.riskLevel.toLowerCase()} risk: ${detection.objectClass} detected in ${detection.zone}. ` +
      `Threat score ${detection.threatScore}/100. Subject may still be on premises.`;
    const objectDetails =
      `${detection.objectClass} identified with ${detection.confidencePercent} confidence. ` +
      `Zone: ${detection.zone}. Detection logged at ${formatDetectionTime(detection.timestamp)}.`;
    const confidenceAnalysis =
      `Model confidence ${detection.confidencePercent} (${detection.riskLevel} risk tier). ` +
      `${detection.confidence >= 0.85 ? 'High certainty — prioritize immediate review.' : 'Moderate certainty — verify visually before escalation.'}`;

    bodyEl.innerHTML = `
      <div class="ai-summary-cards">
        ${createSummaryCard('THREAT ASSESSMENT', threatAssessment)}
        ${createSummaryCard('OBJECT DETAILS', objectDetails)}
        ${createSummaryCard('RECOMMENDED ACTIONS', recommendedAction)}
        ${createSummaryCard('CONFIDENCE ANALYSIS', confidenceAnalysis)}
      </div>
      ${renderAiSummaryFooterHtml()}
    `;
  }

  function resetReviewedUI() {
    isEventReviewed = false;
    reviewInProgress = false;

    document.querySelector('.threat-event-panel')?.classList.remove('threat-event-panel--reviewed');
    document.querySelector('.threat-reviewed-badge')?.remove();

    const reviewBtn = document.getElementById('btnReview');
    if (reviewBtn) {
      reviewBtn.disabled = false;
      reviewBtn.classList.remove('btn-review--loading', 'btn-review--done');
      if (reviewBtnDefaultHtml) reviewBtn.innerHTML = reviewBtnDefaultHtml;
    }

    const escalateBtn = document.getElementById('escalateBtn');
    if (escalateBtn) {
      escalateBtn.disabled = false;
      escalateBtn.classList.remove('escalate-btn--muted');
    }
  }

  function setReviewBtnLoading() {
    const reviewBtn = document.getElementById('btnReview');
    if (!reviewBtn) return;

    reviewBtn.disabled = true;
    reviewBtn.classList.add('btn-review--loading');
    reviewBtn.classList.remove('btn-review--done');
    reviewBtn.innerHTML = `
      <span class="btn-review-spinner" aria-hidden="true"></span>
      <span class="btn-review-loading-label">PROCESSANDO...</span>
    `;
  }

  function applyReviewedUI() {
    isEventReviewed = true;

    const reviewBtn = document.getElementById('btnReview');
    if (reviewBtn) {
      reviewBtn.classList.remove('btn-review--loading');
      reviewBtn.classList.add('btn-review--done');
      reviewBtn.innerHTML = '✓ &nbsp;REVISADO';
      reviewBtn.disabled = true;
    }

    document.querySelector('.threat-event-panel')?.classList.add('threat-event-panel--reviewed');

    const header = document.querySelector('.threat-event-header, [data-section="threat-event"]');
    if (header && !header.querySelector('.threat-reviewed-badge')) {
      const badge = document.createElement('span');
      badge.className = 'threat-reviewed-badge';
      badge.textContent = 'REVISADO';
      header.appendChild(badge);
    }

    const escalateBtn = document.getElementById('escalateBtn');
    if (escalateBtn) {
      escalateBtn.disabled = true;
      escalateBtn.classList.add('escalate-btn--muted');
    }
  }

  function resetEventPanel() {
    resetReviewedUI();
    currentEventId = null;
    setEventId(null);
    setEventValue('detectionTime', null);
    setEventValue('objectClass', null);
    setEventValue('eventConfidence', null);
    setEventValue('eventZone', null);
    setEventValue('escalationStatus', null);
    setEventValue('recommendedAction', null);
    renderAiSummaryEmpty();

    const panel = document.querySelector('.threat-event-panel, [data-panel="threat-event"]');
    panel?.classList.add('threat-event-panel--idle');
  }

  function clearIdlePanelState() {
    document.querySelector('.threat-event-panel, [data-panel="threat-event"]')
      ?.classList.remove('threat-event-panel--idle');
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function runFalseAlarmSequence() {
    const eventIdToClear = currentEventId;
    if (!eventIdToClear) return;

    fetch(`/api/events/${eventIdToClear}/false-alarm`, { method: 'PATCH' }).catch(() => {});

    window.TN?.toast?.({ message: 'Evento descartado como falso alarme.', type: 'info' });

    const panel = document.querySelector('.threat-event-panel, [data-panel="threat-event"]');
    if (panel) {
      panel.classList.add('threat-event-panel--false-alarm-flash');
      setTimeout(() => panel.classList.remove('threat-event-panel--false-alarm-flash'), 600);
    }

    await delay(600);

    document.querySelectorAll('.threat-field-value, [data-field]').forEach((el) => {
      el.innerHTML = '<span class="event-empty">— —</span>';
      el.style.opacity = '0.35';
    });

    const eventIdEl = document.querySelector('.threat-event-id, [data-event-id], #eventId');
    if (eventIdEl) {
      eventIdEl.innerHTML = 'ID: <span class="event-empty">— —</span>';
    }

    const rows = document.querySelectorAll('.threat-field-row, .event-row');
    rows.forEach((row, i) => {
      row.style.transition = `opacity 0.3s ease ${i * 40}ms, transform 0.3s ease ${i * 40}ms`;
      row.style.opacity = '0';
      row.style.transform = 'translateX(-4px)';
    });

    await delay(400);

    window.ThreatCharts.reset();
    animateTargetScoreTo(0);
    resetTargetScoreStats();
    resetEventPanel();

    rows.forEach((row) => {
      row.style.transition = '';
      row.style.opacity = '';
      row.style.transform = '';
    });

    document.querySelectorAll('.threat-field-value, [data-field]').forEach((el) => {
      el.style.opacity = '';
    });

    console.log('[ThreatVision] False alarm registered. Panel reset complete.');
  }

  function getActionDetails(riskLevel) {
    if (riskLevel === 'HIGH') {
      return {
        actionType: 'Review Immediately',
        recommendedAction: 'Verify threat and escalate to security personnel. Consider lockdown protocol if threat is confirmed.',
      };
    }
    if (riskLevel === 'MEDIUM') {
      return {
        actionType: 'Monitor Closely',
        recommendedAction: 'Track subject movement and prepare for escalation if confidence increases.',
      };
    }
    return {
      actionType: 'Continue Monitoring',
      recommendedAction: 'Low risk detection. Continue standard monitoring protocols.',
    };
  }

  function updateEventPanel(detection) {
    resetReviewedUI();
    clearIdlePanelState();

    const { recommendedAction } = getActionDetails(detection.riskLevel);

    setEventId(detection.id);
    setEventValue('detectionTime', formatDetectionTime(detection.timestamp));
    setEventValue('objectClass', detection.objectClass);
    setEventValue('eventConfidence', detection.confidencePercent);
    setEventValue('eventZone', detection.zone);
    setEventValue('escalationStatus', detection.escalationStatus, getEscalationClass(detection.escalationStatus));
    setEventValue('recommendedAction', recommendedAction);

    currentEventId = detection.id;

    if (detection.escalationStatus === 'Reviewed') {
      applyReviewedUI();
    }
  }

  function updateAiSummary(detection) {
    const timeEl = document.getElementById('aiSummaryTime');
    if (timeEl) {
      timeEl.textContent = formatTime(new Date(detection.timestamp));
    }
    renderAiSummaryPopulated(detection);
  }

  function setNotificationAlertActive(active) {
    const notifEl = document.getElementById('notifBadge');
    notifEl.classList.toggle('has-alerts', active);
  }

  function showThreatAlert(detection) {
    setNotificationAlertActive(true);

    const incidentEl = document.getElementById('incidentCount');
    incidentEl.textContent = String(Number(incidentEl.textContent || 0) + 1);
    syncStatusIndicator();

    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('⚠️ THREAT DETECTED', {
        body: `${detection.objectClass} - ${detection.zone}`,
        icon: '/favicon.svg',
      });
    }

    addTimelineEvent(detection);
  }

  const WARNING_ICON = '<svg class="icon-svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

  const TIMELINE_WINDOW_MS = 30 * 60 * 1000;

  function formatTimelineTime(date) {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  function getTimelinePercentForDate(date) {
    const elapsed = Date.now() - startTime;
    const windowMs = Math.max(elapsed, TIMELINE_WINDOW_MS);
    const offset = Math.max(0, date.getTime() - startTime);
    return Math.max(0, Math.min(100, (offset / windowMs) * 100));
  }

  function updateTimelinePlayhead(percent) {
    const progressEl = document.getElementById('timelineProgress');
    const playheadEl = document.getElementById('timelineCursor');
    if (!progressEl || !playheadEl) return;

    const clamped = Math.max(0, Math.min(100, percent));
    progressEl.style.width = `${clamped}%`;
    playheadEl.style.left = `${clamped}%`;
  }

  function initTimelineTrack() {
    const bar = document.getElementById('timelineBar');
    const tooltip = document.getElementById('timelineTooltip');
    const toggle = document.getElementById('showDetectionsOnly');
    const switchTrack = document.getElementById('detectionSwitchTrack');

    if (!bar || !tooltip) return;

    updateTimelinePlayhead(0);

    bar.addEventListener('mousemove', (event) => {
      const rect = bar.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const elapsed = Date.now() - startTime;
      const windowMs = Math.max(elapsed, TIMELINE_WINDOW_MS);
      const hoverTime = new Date(startTime + windowMs * ratio);

      tooltip.textContent = formatTimelineTime(hoverTime);
      tooltip.hidden = false;
      tooltip.style.left = `${ratio * 100}%`;
    });

    bar.addEventListener('mouseleave', () => {
      tooltip.hidden = true;
    });

    if (toggle && switchTrack) {
      const syncSwitch = () => {
        switchTrack.classList.toggle('is-on', toggle.checked);
      };
      toggle.addEventListener('change', syncSwitch);
      syncSwitch();
    }
  }

  function addTimelineEvent(detection) {
    const track = document.getElementById('timelineTrack');
    const eventTime = new Date(detection.timestamp);
    const percent = getTimelinePercentForDate(eventTime);

    const marker = document.createElement('div');
    marker.className = 'timeline-marker danger';
    marker.style.left = `${percent}%`;
    marker.title = formatTimelineTime(eventTime);
    track.appendChild(marker);

    updateTimelinePlayhead(percent);

    const thumbnails = document.getElementById('timelineThumbnails');
    const thumb = document.createElement('div');
    thumb.className = 'timeline-thumb active';
    thumb.innerHTML = `<span class="thumb-alert">${WARNING_ICON}</span><small>${formatTime(eventTime)}</small>`;
    thumb.onclick = () => {
      document.querySelectorAll('.timeline-thumb').forEach((item) => item.classList.remove('active'));
      thumb.classList.add('active');
      updateEventPanel(detection);
      updateAiSummary(detection);
      updateThreatContext(detection);
      updateTimelinePlayhead(getTimelinePercentForDate(new Date(detection.timestamp)));
    };
    thumbnails.prepend(thumb);

    while (thumbnails.children.length > 20) {
      thumbnails.removeChild(thumbnails.lastChild);
    }

    while (track.children.length > 20) {
      track.removeChild(track.firstChild);
    }
  }

  function initUIListeners() {
    const reviewBtn = document.getElementById('btnReview');
    if (reviewBtn) {
      reviewBtnDefaultHtml = reviewBtn.innerHTML;
      reviewBtn.onclick = () => {
        if (!currentEventId || reviewInProgress || isEventReviewed) return;

        reviewInProgress = true;
        setReviewBtnLoading();

        fetch(`/api/events/${currentEventId}/review`, { method: 'PATCH' }).catch(() => {});

        setTimeout(() => {
          reviewInProgress = false;
          setEventValue('escalationStatus', 'Reviewed', 'escalation-reviewed');
          applyReviewedUI();
          window.TN?.toast?.({ message: 'Evento marcado como revisado.', type: 'success' });
        }, 900);
      };
    }

    const falseAlarmBtn = document.querySelector('[data-action="false-alarm"], #btnFalseAlarm');
    if (falseAlarmBtn) {
      falseAlarmBtn.addEventListener('click', () => {
        if (!currentEventId) return;

        window.TN.modal({
          title: 'CONFIRMAR FALSO ALARME',
          message: 'Marcar este evento como falso alarme irá encerrar o protocolo de ameaça e redefinir o painel. Esta ação será registrada no log.',
          type: 'warning',
          showCancel: true,
          confirmLabel: 'CONFIRMAR',
          cancelLabel: 'CANCELAR',
          onConfirm: () => runFalseAlarmSequence(),
        });
      });
    }

    document.querySelectorAll('.nav-tab').forEach((tab) => {
      tab.onclick = () => {
        document.querySelectorAll('.nav-tab').forEach((item) => item.classList.remove('active'));
        tab.classList.add('active');

        if (tab.dataset.tab === 'upload') {
          document.getElementById('uploadModal').style.display = 'flex';
        }
      };
    });

    document.getElementById('closeUploadModal').onclick = () => {
      document.getElementById('uploadModal').style.display = 'none';
    };

    document.getElementById('selectFileBtn').onclick = () => {
      document.getElementById('uploadModalInput').click();
    };

    document.getElementById('uploadModalInput').onchange = (event) => {
      uploadedFile = event.target.files?.[0] || null;
      document.getElementById('btnAnalyzeUpload').disabled = !uploadedFile;
      document.getElementById('selectedFileName').textContent = uploadedFile ? uploadedFile.name : '';
    };

    document.getElementById('btnAnalyzeUpload').onclick = analyzeUploadedFile;

    const dropArea = document.getElementById('dropArea');
    dropArea.addEventListener('dragover', (event) => {
      event.preventDefault();
      dropArea.classList.add('drag-over');
    });
    dropArea.addEventListener('dragleave', () => dropArea.classList.remove('drag-over'));
    dropArea.addEventListener('drop', (event) => {
      event.preventDefault();
      dropArea.classList.remove('drag-over');
      uploadedFile = event.dataTransfer.files?.[0] || null;
      document.getElementById('btnAnalyzeUpload').disabled = !uploadedFile;
      document.getElementById('selectedFileName').textContent = uploadedFile ? uploadedFile.name : '';
    });
    dropArea.onclick = () => document.getElementById('uploadModalInput').click();
  }

  async function analyzeUploadedFile() {
    if (!uploadedFile) return;

    const button = document.getElementById('btnAnalyzeUpload');
    const originalText = button.textContent;
    button.textContent = 'Analisando...';
    button.disabled = true;

    const cameraId = document.getElementById('uploadCameraId').value;
    const zone = document.getElementById('uploadZone').value;

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        window.VideoFeed.showStaticFrame(reader.result);

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
            document.getElementById('uploadModal').style.display = 'none';
            handleDetections(data);
          };
          img.src = reader.result;
          return;
        }

        const formData = new FormData();
        formData.append('image', uploadedFile);
        formData.append('cameraId', cameraId);
        formData.append('zone', zone);

        const response = await fetch('/api/analyze', {
          method: 'POST',
          body: formData,
        });
        const data = await response.json();

        document.getElementById('uploadModal').style.display = 'none';
        handleDetections(data);
      };
      reader.readAsDataURL(uploadedFile);
    } catch (error) {
      alert(`Erro ao analisar imagem: ${error.message}`);
    } finally {
      button.textContent = originalText;
      button.disabled = !uploadedFile;
    }
  }

  function startClock() {
    clockInterval = setInterval(() => {
      const now = new Date();
      document.getElementById('videoDatetime').textContent = now.toLocaleString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      document.getElementById('liveTime').textContent = formatTime(now);
    }, 1000);
  }

  function startUptimeCounter() {
    uptimeInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const totalMinutes = Math.floor(elapsed / 60000);
      const days = Math.floor(totalMinutes / (60 * 24));
      const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
      const minutes = totalMinutes % 60;
      document.getElementById('uptime').textContent = `${days}d ${hours}h ${minutes}m`;
    }, 1000);
  }

  function formatTime(date) {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return {
    init,
    handleDetections,
    showThreatAlert,
    updateThreatContext,
    updateEventPanel,
    syncStatusIndicator,
  };
})();
