const events = [];
const MAX_EVENTS = 500;

function addEvent(detectionObject) {
  events.unshift(detectionObject);

  if (events.length > MAX_EVENTS) {
    events.pop();
  }

  return detectionObject;
}

function getRecentEvents(limit = 50) {
  return events.slice(0, limit);
}

function getEventById(eventId) {
  return events.find((event) => event.id === eventId) || null;
}

function getConfidenceTrend(cameraId, seconds = 30) {
  const cutoff = Date.now() - seconds * 1000;

  return events
    .filter((event) => event.cameraId === cameraId && new Date(event.timestamp).getTime() >= cutoff)
    .map((event) => ({
      timestamp: event.timestamp,
      confidence: event.confidence,
    }))
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

function getThreatTrend(cameraId) {
  const seconds = 60;
  const cutoff = Date.now() - seconds * 1000;

  return events
    .filter((event) => event.cameraId === cameraId && new Date(event.timestamp).getTime() >= cutoff)
    .map((event) => ({
      timestamp: event.timestamp,
      threatScore: event.threatScore,
    }))
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
}

function getStats() {
  return {
    totalEvents: events.length,
    highRiskCount: events.filter((event) => event.riskLevel === 'HIGH').length,
    mediumRiskCount: events.filter((event) => event.riskLevel === 'MEDIUM').length,
    lowRiskCount: events.filter((event) => event.riskLevel === 'LOW').length,
    lastEventTime: events.length > 0 ? events[0].timestamp : null,
  };
}

function markAsReviewed(eventId) {
  const event = getEventById(eventId);

  if (!event) {
    return false;
  }

  event.escalationStatus = 'Reviewed';
  return true;
}

function markAsFalseAlarm(eventId) {
  const event = getEventById(eventId);

  if (!event) {
    return false;
  }

  event.escalationStatus = 'False Alarm';
  event.riskLevel = 'LOW';
  return true;
}

module.exports = {
  addEvent,
  getRecentEvents,
  getEventById,
  getConfidenceTrend,
  getThreatTrend,
  getStats,
  markAsReviewed,
  markAsFalseAlarm,
};
