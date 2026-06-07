function formatTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * @param {'INFO' | 'WARN' | 'ERROR' | 'THREAT'} level
 * @param {string} message
 * @param {object} [data]
 */
function log(level, message, data) {
  const suffix = data !== undefined ? ` ${JSON.stringify(data)}` : '';
  console.log(`[${formatTimestamp()}] [${level}] ${message}${suffix}`);
}

function logThreat(eventId, objectClass, confidence, zone) {
  log('THREAT', `Threat detected: ${objectClass}`, {
    eventId,
    confidence,
    zone,
  });
}

module.exports = {
  log,
  logThreat,
};
