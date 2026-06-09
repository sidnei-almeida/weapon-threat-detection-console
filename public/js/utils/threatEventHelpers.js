/**
 * @typedef {'handgun' | 'knife' | 'masked_person'} ObjectClassKey
 * @typedef {'pending' | 'escalated' | 'reviewed' | 'false_alarm'} EventStatus
 * @typedef {'escalated' | 'reviewed' | 'false_alarm'} EventResolution
 * @typedef {'Low' | 'Medium' | 'High'} ViolenceLevel
 *
 * @typedef {Object} ThreatEvent
 * @property {string} id
 * @property {string} cameraId
 * @property {string} cameraLabel
 * @property {Date} detectedAt
 * @property {ObjectClassKey} objectClass
 * @property {number} confidence
 * @property {string} zone
 * @property {string} motionState
 * @property {string} visibility
 * @property {ViolenceLevel} violenceLevel
 * @property {string} [frameSnapshot]
 * @property {EventStatus} status
 * @property {EventResolution} [resolution]
 * @property {Date} [resolvedAt]
 * @property {string} [resolvedBy]
 * @property {string} [resolutionNote]
 */

window.ThreatEventHelpers = (() => {
  const CLASS_LABELS = {
    handgun: 'Weapon: Handgun',
    knife: 'Weapon: Knife',
    masked_person: 'Masked Person',
  };

  const CLASS_ICONS = {
    handgun: 'shield-alert',
    knife: 'scissors',
    masked_person: 'user-x',
  };

  const STATUS_LABELS = {
    pending: 'Pendente',
    escalated: 'Escalado',
    reviewed: 'Revisado',
    false_alarm: 'Falso alarme',
  };

  function mapDisplayClassToKey(displayClass) {
    const normalized = String(displayClass || '').toLowerCase();
    if (normalized.includes('handgun') || normalized === 'weapon: handgun' || normalized === 'gun') {
      return 'handgun';
    }
    if (normalized.includes('knife')) return 'knife';
    if (normalized.includes('mask')) return 'masked_person';
    return null;
  }

  function isThreatClassKey(key) {
    return key === 'handgun' || key === 'knife' || key === 'masked_person';
  }

  function getClassLabel(key) {
    return CLASS_LABELS[key] || key;
  }

  function getStatusLabel(status) {
    return STATUS_LABELS[status] || status;
  }

  function mapViolenceLevel(riskLevel) {
    if (riskLevel === 'HIGH') return 'High';
    if (riskLevel === 'MEDIUM') return 'Medium';
    return 'Low';
  }

  function formatConfidenceColor(confidence) {
    if (confidence < 60) return '#ff6b6b';
    if (confidence < 80) return '#e0a030';
    return '#4caf50';
  }

  function formatDateTime(date) {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  function formatTimeShort(date) {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  function serializeEvent(event) {
    return {
      ...event,
      detectedAt: event.detectedAt instanceof Date ? event.detectedAt.toISOString() : event.detectedAt,
      resolvedAt: event.resolvedAt instanceof Date ? event.resolvedAt.toISOString() : event.resolvedAt,
    };
  }

  function deserializeEvent(raw) {
    return {
      ...raw,
      detectedAt: new Date(raw.detectedAt),
      resolvedAt: raw.resolvedAt ? new Date(raw.resolvedAt) : undefined,
    };
  }

  function detectionToThreatEvent(detection, options = {}) {
    const objectClass = mapDisplayClassToKey(detection.objectClass);
    if (!objectClass) return null;

    const confidence = typeof detection.confidence === 'number' && detection.confidence <= 1
      ? Math.round(detection.confidence * 100)
      : Math.round(Number(detection.confidence) || 0);

    return {
      id: detection.id || `EVT-${Date.now()}`,
      cameraId: detection.cameraId || 'CAM-01',
      cameraLabel: options.cameraLabel || detection.cameraLabel || detection.cameraId || 'CAM 01',
      detectedAt: new Date(detection.timestamp || Date.now()),
      objectClass,
      confidence,
      zone: detection.zone || 'Video Zone 01',
      motionState: detection.motionState || 'Walking',
      visibility: detection.visibility || 'Clear',
      violenceLevel: mapViolenceLevel(detection.riskLevel),
      frameSnapshot: options.frameSnapshot,
      status: 'pending',
    };
  }

  return {
    CLASS_LABELS,
    CLASS_ICONS,
    STATUS_LABELS,
    mapDisplayClassToKey,
    isThreatClassKey,
    getClassLabel,
    getStatusLabel,
    mapViolenceLevel,
    formatConfidenceColor,
    formatDateTime,
    formatTimeShort,
    serializeEvent,
    deserializeEvent,
    detectionToThreatEvent,
  };
})();
