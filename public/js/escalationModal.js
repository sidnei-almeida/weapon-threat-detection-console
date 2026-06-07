/**
 * Full-screen emergency escalation protocol modal (TN.modal custom implementation).
 */
(function () {
  const OVERLAY_ID = 'escalation-overlay';

  function playAlertTone() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();

    [880, 660, 440].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      const start = ctx.currentTime + i * 0.18;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.15, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.15);

      osc.start(start);
      osc.stop(start + 0.15);
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function buildEscalationHtml(eventId, zone) {
    const evtLabel = escapeHtml(eventId);
    const zoneLabel = escapeHtml(zone);
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);

    return `
      <div id="escalation-modal">
        <div class="esc-corner esc-tl"></div>
        <div class="esc-corner esc-tr"></div>
        <div class="esc-corner esc-bl"></div>
        <div class="esc-corner esc-br"></div>

        <div class="esc-scan"></div>

        <div class="esc-header">
          <div class="esc-alert-dot"></div>
          <span class="esc-title">ESCALATION PROTOCOL</span>
          <span class="esc-id">EVT-${evtLabel}</span>
        </div>

        <div class="esc-steps">
          <div class="esc-step" id="escStep1">
            <div class="esc-step-icon">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.8 19.79 19.79 0 01.1 1.2 2 2 0 012.11 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.09a16 16 0 006 6l.46-.46a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92v2z"/>
              </svg>
            </div>
            <div class="esc-step-info">
              <span class="esc-step-label">NOTIFYING 911 DISPATCH</span>
              <span class="esc-step-sub">Emergency Services · HIGH Priority</span>
            </div>
            <div class="esc-step-status" id="escStatus1">
              <span class="esc-spinner"></span>
            </div>
          </div>

          <div class="esc-step" id="escStep2">
            <div class="esc-step-icon">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
              </svg>
            </div>
            <div class="esc-step-info">
              <span class="esc-step-label">ALERTING LOCAL SECURITY</span>
              <span class="esc-step-sub">Response team · Sector ${zoneLabel}</span>
            </div>
            <div class="esc-step-status" id="escStatus2">
              <span class="esc-dot-wait">—</span>
            </div>
          </div>

          <div class="esc-step" id="escStep3">
            <div class="esc-step-icon">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
              </svg>
            </div>
            <div class="esc-step-info">
              <span class="esc-step-label">LOGGING INCIDENT</span>
              <span class="esc-step-sub">Forensic log · UTC timestamp</span>
            </div>
            <div class="esc-step-status" id="escStatus3">
              <span class="esc-dot-wait">—</span>
            </div>
          </div>
        </div>

        <div class="esc-log" id="escLog"></div>

        <button class="esc-dismiss hidden" id="escDismiss" type="button">
          CLOSE · INCIDENT LOGGED
        </button>

        <div class="esc-ticker">
          <span>THREAT.VISION · ESCALATION ACTIVE · SYS://PROTOCOL_7 · ${timestamp} · </span>
        </div>
      </div>
    `;
  }

  function addLog(text, type = '') {
    const log = document.getElementById('escLog');
    if (!log) return;

    const line = document.createElement('div');
    line.className = `esc-log-line ${type}`.trim();
    line.textContent = text;
    log.appendChild(line);

    if (log.children.length > 4) {
      log.removeChild(log.firstChild);
    }
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function runEscalationSequence() {
    const steps = [
      {
        stepId: 'escStep1',
        statusId: 'escStatus1',
        logs: [
          '> CONNECTING 911... DIALING...',
          '> LINE ESTABLISHED · OPERATOR ON HOLD',
          '> [OK] CALL CONFIRMED · REF: EMS-2026-0607',
        ],
        duration: 2200,
      },
      {
        stepId: 'escStep2',
        statusId: 'escStatus2',
        logs: [
          '> NOTIFYING SECURITY RADIO...',
          '> DELTA TEAM · SECTOR 01 · EN ROUTE',
          '> [OK] ACK RECEIVED · ETA 4min',
        ],
        duration: 1800,
      },
      {
        stepId: 'escStep3',
        statusId: 'escStatus3',
        logs: [
          '> LOGGING INCIDENT TO SERVER...',
          `> HASH: 3f2a9d1c · TIMESTAMP: ${new Date().toISOString()}`,
          `> [OK] FORENSIC LOG SAVED · INCIDENT #${Math.floor(Math.random() * 9000 + 1000)}`,
        ],
        duration: 1400,
      },
    ];

    for (const s of steps) {
      const step = document.getElementById(s.stepId);
      const stat = document.getElementById(s.statusId);
      if (!step || !stat) continue;

      step.classList.add('active');
      stat.innerHTML = '<span class="esc-spinner"></span>';

      for (const logLine of s.logs) {
        addLog(logLine, logLine.startsWith('> [OK]') ? 'ok' : '');
        await delay(s.duration / s.logs.length);
      }

      step.classList.remove('active');
      step.classList.add('done');
      stat.innerHTML = '<span class="esc-check">✓</span>';
    }

    const dismiss = document.getElementById('escDismiss');
    if (dismiss) dismiss.classList.remove('hidden');

    await delay(3500);
    if (window.TN?.modal?.isOpen(OVERLAY_ID)) {
      close();
    }
  }

  function close() {
    window.TN?.modal?.close(OVERLAY_ID);
  }

  function readZoneFromDom() {
    const zoneEl = document.getElementById('eventZone');
    if (!zoneEl) return '01';

    const text = zoneEl.textContent.replace(/\s+/g, ' ').trim();
    if (!text || text === '— —' || text === '--') return '01';

    return text;
  }

  function readEventIdFromDom() {
    const valueEl = document.querySelector('#eventId .event-id-value');
    if (valueEl?.textContent?.trim()) return valueEl.textContent.trim();

    return 'PENDING';
  }

  function open(options = {}) {
    if (window.TN?.modal?.isOpen(OVERLAY_ID)) return;

    const eventId = options.eventId ?? readEventIdFromDom();
    const zone = options.zone ?? readZoneFromDom();

    playAlertTone();

    window.TN.modal.mount({
      id: OVERLAY_ID,
      className: 'escalation-overlay',
      html: buildEscalationHtml(eventId, zone),
      zIndex: 99998,
    });

    const dismiss = document.getElementById('escDismiss');
    dismiss?.addEventListener('click', close);

    runEscalationSequence();
  }

  function bindEscalateButtons() {
    document.querySelectorAll('.escalate-btn, #escalateBtn').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        if (event.currentTarget.disabled) return;
        open();
      });
    });
  }

  window.EscalationModal = { open, close };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindEscalateButtons);
  } else {
    bindEscalateButtons();
  }
})();
