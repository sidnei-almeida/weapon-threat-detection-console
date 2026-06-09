window.ThreatExportCsv = (() => {
  const { getClassLabel, getStatusLabel, formatDateTime } = window.ThreatEventHelpers;

  function escapeCsv(value) {
    const str = value == null ? '' : String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  function eventToRow(event) {
    return [
      event.id,
      event.cameraLabel || event.cameraId,
      event.zone,
      getClassLabel(event.objectClass),
      `${event.confidence}%`,
      formatDateTime(event.detectedAt),
      getStatusLabel(event.status),
      event.resolution ? getStatusLabel(event.resolution) : '',
      event.resolvedAt ? formatDateTime(event.resolvedAt) : '',
      event.resolvedBy || '',
      event.resolutionNote || '',
    ].map(escapeCsv).join(',');
  }

  function exportEvents(events) {
    const header = 'ID, Camera, Zone, Class, Confidence, Detected At, Status, Resolution, Resolved At, Resolved By, Note';
    const rows = events.map(eventToRow);
    const csv = [header, ...rows].join('\n');
    const date = new Date().toISOString().slice(0, 10);
    const filename = `threatvision_events_${date}.csv`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return { exportEvents };
})();
