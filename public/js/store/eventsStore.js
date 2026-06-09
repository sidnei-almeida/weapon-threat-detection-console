window.EventsStore = (() => {
  const STORAGE_KEY = 'threatvision_events';
  const THROTTLE_MS = 15000;

  const { deserializeEvent, serializeEvent, detectionToThreatEvent, isThreatClassKey } = window.ThreatEventHelpers;

  /** @type {import('../utils/threatEventHelpers').ThreatEvent[]} */
  let threatEvents = [];
  const listeners = new Set();
  const recentKeys = new Map();
  let escalations = [];

  function notify() {
    listeners.forEach((fn) => fn(threatEvents));
    updatePendingBadge();
  }

  function updatePendingBadge() {
    const count = threatEvents.filter((e) => e.status === 'pending').length;
    const incidentEl = document.getElementById('incidentCount');
    if (incidentEl) incidentEl.textContent = String(count);
    if (window.Dashboard?.syncStatusIndicator) {
      window.Dashboard.syncStatusIndicator();
    }
  }

  function persist() {
    try {
      const serialized = threatEvents.map(serializeEvent);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
    } catch (err) {
      console.warn('[EventsStore] Failed to persist:', err.message);
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          threatEvents = parsed.map(deserializeEvent);
          return;
        }
      }
    } catch (err) {
      console.warn('[EventsStore] Failed to load:', err.message);
    }

    if (window.ThreatDemoData?.DEMO_MODE) {
      threatEvents = window.ThreatDemoData.buildDemoEvents();
      persist();
    }
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function getEvents() {
    return [...threatEvents];
  }

  function getPendingCount() {
    return threatEvents.filter((e) => e.status === 'pending').length;
  }

  function getEscalations() {
    return [...escalations];
  }

  function updateEvent(eventId, updates) {
    const index = threatEvents.findIndex((e) => e.id === eventId);
    if (index === -1) return null;

    threatEvents[index] = { ...threatEvents[index], ...updates };
    persist();
    notify();
    return threatEvents[index];
  }

  function addEvent(event) {
    if (!event || !isThreatClassKey(event.objectClass)) return null;

    const exists = threatEvents.some((e) => e.id === event.id);
    if (exists) return null;

    threatEvents.unshift(event);
    if (threatEvents.length > 500) threatEvents.pop();
    persist();
    notify();
    return event;
  }

  function shouldThrottle(cameraId, objectClass) {
    const key = `${cameraId}:${objectClass}`;
    const last = recentKeys.get(key);
    const now = Date.now();
    if (last && now - last < THROTTLE_MS) return true;
    recentKeys.set(key, now);
    return false;
  }

  function addEventFromDetection(detection, options = {}) {
    const event = detectionToThreatEvent(detection, options);
    if (!event) return null;

    if (!options.force && shouldThrottle(event.cameraId, event.objectClass)) {
      return null;
    }

    return addEvent(event);
  }

  function resolveEvent(eventId, resolution, note, operatorName = 'Operator') {
    const event = updateEvent(eventId, {
      status: resolution,
      resolution,
      resolvedAt: new Date(),
      resolvedBy: operatorName,
      resolutionNote: note || '',
    });

    if (!event) return null;

    if (resolution === 'escalated') {
      escalations.unshift({ eventId, resolvedAt: new Date() });
      window.TN?.toast?.({
        message: `🚨 Evento ${eventId} escalado com sucesso`,
        type: 'escalated',
      });
    } else if (resolution === 'reviewed') {
      window.TN?.toast?.({
        message: `✓ Evento ${eventId} marcado como revisado`,
        type: 'success',
      });
    } else if (resolution === 'false_alarm') {
      window.TN?.toast?.({
        message: `Evento ${eventId} marcado como falso alarme`,
        type: 'muted',
      });
    }

    return event;
  }

  function init() {
    load();
    updatePendingBadge();
  }

  return {
    init,
    subscribe,
    getEvents,
    getPendingCount,
    getEscalations,
    addEvent,
    addEventFromDetection,
    updateEvent,
    resolveEvent,
    persist,
  };
})();
