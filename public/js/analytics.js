window.Analytics = (() => {
  const {
    getClassLabel,
    getStatusLabel,
    formatConfidenceColor,
    formatTimeShort,
  } = window.ThreatEventHelpers;

  let container = null;
  let period = '7d';

  const HOUR_BUCKETS = [
    { label: '00–04h', start: 0, end: 4 },
    { label: '04–08h', start: 4, end: 8 },
    { label: '08–12h', start: 8, end: 12 },
    { label: '12–16h', start: 12, end: 16 },
    { label: '16–20h', start: 16, end: 20 },
    { label: '20–24h', start: 20, end: 24 },
  ];

  function getPeriodCutoff(p) {
    const now = new Date();
    if (p === 'today') {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }
    if (p === '7d') return now.getTime() - 7 * 24 * 60 * 60 * 1000;
    if (p === '30d') return now.getTime() - 30 * 24 * 60 * 60 * 1000;
    return 0;
  }

  function filterByPeriod(events) {
    const cutoff = getPeriodCutoff(period);
    if (!cutoff) return events;
    return events.filter((e) => e.detectedAt.getTime() >= cutoff);
  }

  function computeMetrics(events) {
    const total = events.length;
    const escalated = events.filter((e) => e.status === 'escalated').length;
    const falseAlarms = events.filter((e) => e.status === 'false_alarm').length;
    const falseAlarmRate = total > 0 ? (falseAlarms / total) * 100 : 0;
    const avgConfidence = total > 0
      ? events.reduce((sum, e) => sum + e.confidence, 0) / total
      : 0;

    const classCounts = { handgun: 0, knife: 0, masked_person: 0 };
    events.forEach((e) => {
      if (classCounts[e.objectClass] != null) classCounts[e.objectClass] += 1;
    });

    const resolutionCounts = {
      escalated: events.filter((e) => e.status === 'escalated').length,
      reviewed: events.filter((e) => e.status === 'reviewed').length,
      false_alarm: falseAlarms,
      pending: events.filter((e) => e.status === 'pending').length,
    };

    const hourCounts = HOUR_BUCKETS.map(() => 0);
    events.forEach((e) => {
      const h = e.detectedAt.getHours();
      const idx = HOUR_BUCKETS.findIndex((b) => h >= b.start && h < b.end);
      if (idx >= 0) hourCounts[idx] += 1;
    });

    const zoneMap = new Map();
    events.forEach((e) => {
      zoneMap.set(e.zone, (zoneMap.get(e.zone) || 0) + 1);
    });
    const zones = [...zoneMap.entries()].sort((a, b) => b[1] - a[1]);

    return {
      total,
      escalated,
      falseAlarmRate,
      avgConfidence,
      classCounts,
      resolutionCounts,
      hourCounts,
      zones,
    };
  }

  function computeClassTable(events) {
    const classes = ['handgun', 'knife', 'masked_person'];
    return classes.map((cls) => {
      const subset = events.filter((e) => e.objectClass === cls);
      const total = subset.length;
      const avgConf = total > 0 ? subset.reduce((s, e) => s + e.confidence, 0) / total : 0;
      const falseCount = subset.filter((e) => e.status === 'false_alarm').length;
      const falseRate = total > 0 ? (falseCount / total) * 100 : 0;
      const escalated = subset.filter((e) => e.status === 'escalated').length;
      const reviewed = subset.filter((e) => e.status === 'reviewed').length;

      return { cls, total, avgConf, falseRate, escalated, reviewed };
    });
  }

  function renderHorizontalBars(items, maxVal) {
    const max = maxVal || Math.max(...items.map((i) => i.value), 1);
    return items.map((item) => {
      const pct = max > 0 ? (item.value / max) * 100 : 0;
      return `
        <div class="an-bar-row">
          <span class="an-bar-label">${item.label}</span>
          <div class="an-bar-track">
            <div class="an-bar-fill" style="width:${pct}%;background:${item.color}"></div>
          </div>
          <span class="an-bar-count">${item.value}</span>
        </div>
      `;
    }).join('');
  }

  function renderVerticalHeatmap(hourCounts) {
    const max = Math.max(...hourCounts, 1);
    return HOUR_BUCKETS.map((bucket, i) => {
      const count = hourCounts[i];
      const pct = max > 0 ? (count / max) * 100 : 0;
      const title = `${count} eventos entre ${bucket.start}h e ${bucket.end}h`;
      return `
        <div class="an-heat-col">
          <div class="an-heat-bar-wrap" title="${title}">
            <div class="an-heat-bar" style="height:${Math.max(pct, count > 0 ? 8 : 0)}%"></div>
          </div>
          <span class="an-heat-label">${bucket.label}</span>
        </div>
      `;
    }).join('');
  }

  function renderStatusBadge(status) {
    return `<span class="iq-status-badge iq-status-badge--${status}">${getStatusLabel(status)}</span>`;
  }

  function renderTimelineItem(event) {
    const desc = `${getClassLabel(event.objectClass)} detectado em ${event.zone} com ${event.confidence}% de confiança (${event.cameraId.replace('CAM-', 'CAM ')})`;
    return `
      <div class="an-timeline-item">
        <span class="an-timeline-dot an-timeline-dot--${event.status}"></span>
        <span class="an-timeline-time">${formatTimeShort(event.detectedAt)}</span>
        <span class="an-timeline-desc">${desc}</span>
        ${renderStatusBadge(event.status)}
      </div>
    `;
  }

  function render(events) {
    if (!container) return;

    const periodEvents = filterByPeriod(events);
    const metrics = computeMetrics(periodEvents);
    const classTable = computeClassTable(periodEvents);
    const recent10 = [...events].sort((a, b) => b.detectedAt - a.detectedAt).slice(0, 10);

    const escalatedPct = metrics.total > 0
      ? ((metrics.escalated / metrics.total) * 100).toFixed(1)
      : '0.0';

    const falseAlarmWarn = metrics.falseAlarmRate > 30
      ? '<span class="an-warn-icon">⚠</span>'
      : '';

    const avgConfSub = metrics.avgConfidence < 60
      ? '<span class="an-kpi-warn">⚠ Abaixo do recomendado</span>'
      : '<span class="an-kpi-ok">Dentro do esperado</span>';

    const classBars = renderHorizontalBars([
      { label: 'Handgun', value: metrics.classCounts.handgun, color: '#E24B4A' },
      { label: 'Knife', value: metrics.classCounts.knife, color: '#EF9F27' },
      { label: 'Masked', value: metrics.classCounts.masked_person, color: '#7F77DD' },
    ]);

    const resolutionBars = renderHorizontalBars([
      { label: 'Escalados', value: metrics.resolutionCounts.escalated, color: '#ff3b3b' },
      { label: 'Revisados', value: metrics.resolutionCounts.reviewed, color: '#4caf50' },
      { label: 'Falsos', value: metrics.resolutionCounts.false_alarm, color: '#888' },
      { label: 'Pendentes', value: metrics.resolutionCounts.pending, color: '#e0a030' },
    ]);

    const zoneMax = metrics.zones.length > 0 ? metrics.zones[0][1] : 1;
    const zoneBars = renderHorizontalBars(
      metrics.zones.map(([zone, count]) => ({ label: zone, value: count, color: '#378ADD' })),
      zoneMax,
    );

    const tableRows = classTable.map((row, i) => {
      const isLast = i === classTable.length - 1;
      const confColor = formatConfidenceColor(Math.round(row.avgConf));
      const falseColor = row.falseRate > 30 ? '#e0a030' : '#ccc';
      return `
        <tr class="${isLast ? 'an-table-row--last' : ''}">
          <td>${getClassLabel(row.cls)}</td>
          <td>${row.total}</td>
          <td style="color:${confColor}">${Math.round(row.avgConf)}%</td>
          <td style="color:${falseColor}">${Math.round(row.falseRate)}%</td>
          <td>${row.escalated}</td>
          <td>${row.reviewed}</td>
        </tr>
      `;
    }).join('');

    const periods = [
      { id: 'today', label: 'Hoje' },
      { id: '7d', label: 'Últimos 7 dias' },
      { id: '30d', label: 'Últimos 30 dias' },
      { id: 'all', label: 'Todo o histórico' },
    ];

    container.innerHTML = `
      <div class="an-root tn-scroll">
        <div class="an-period-tabs">
          ${periods.map((p) => `
            <button type="button" class="an-period-btn ${period === p.id ? 'an-period-btn--active' : ''}" data-period="${p.id}">${p.label}</button>
          `).join('')}
        </div>

        <div class="an-kpi-grid">
          <div class="an-kpi-card">
            <span class="an-kpi-label">Total de eventos</span>
            <span class="an-kpi-value">${metrics.total}</span>
            <span class="an-kpi-sub">no período selecionado</span>
          </div>
          <div class="an-kpi-card">
            <span class="an-kpi-label">Escalados</span>
            <span class="an-kpi-value an-kpi-value--escalated">${metrics.escalated}</span>
            <span class="an-kpi-sub">${escalatedPct}% do total</span>
          </div>
          <div class="an-kpi-card">
            <span class="an-kpi-label">Taxa de falso alarme</span>
            <span class="an-kpi-value an-kpi-value--false">${metrics.falseAlarmRate.toFixed(1)}%${falseAlarmWarn}</span>
            <span class="an-kpi-sub">Meta: abaixo de 30%</span>
          </div>
          <div class="an-kpi-card">
            <span class="an-kpi-label">Confiança média</span>
            <span class="an-kpi-value an-kpi-value--conf">${Math.round(metrics.avgConfidence)}%</span>
            <span class="an-kpi-sub">${avgConfSub}</span>
          </div>
        </div>

        <div class="an-charts-grid">
          <div class="an-chart-card">
            <h3 class="an-chart-title">Detecções por classe</h3>
            <div class="an-bars">${classBars || '<p class="an-no-data">Sem dados</p>'}</div>
          </div>
          <div class="an-chart-card">
            <h3 class="an-chart-title">Como os eventos foram resolvidos</h3>
            <div class="an-bars">${resolutionBars}</div>
          </div>
          <div class="an-chart-card">
            <h3 class="an-chart-title">Pico de detecções por horário</h3>
            <div class="an-heatmap">${renderVerticalHeatmap(metrics.hourCounts)}</div>
          </div>
          <div class="an-chart-card">
            <h3 class="an-chart-title">Eventos por zona de monitoramento</h3>
            <div class="an-bars">${zoneBars || '<p class="an-no-data">Sem dados</p>'}</div>
          </div>
        </div>

        <section class="an-table-section">
          <h3 class="an-section-title">Performance do modelo por classe</h3>
          <table class="an-table">
            <thead>
              <tr>
                <th>Classe</th>
                <th>Total</th>
                <th>Confiança média</th>
                <th>Taxa falso alarme</th>
                <th>Escalados</th>
                <th>Revisados</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </section>

        <section class="an-timeline-section">
          <h3 class="an-section-title">Últimos 10 eventos</h3>
          <div class="an-timeline">
            ${recent10.map(renderTimelineItem).join('') || '<p class="an-no-data">Nenhum evento registrado</p>'}
          </div>
        </section>
      </div>
    `;

    container.querySelectorAll('[data-period]').forEach((btn) => {
      btn.addEventListener('click', () => {
        period = btn.dataset.period;
        render(events);
      });
    });
  }

  function init(panelEl) {
    container = panelEl;
    window.EventsStore.subscribe((events) => render(events));
    render(window.EventsStore.getEvents());
  }

  function refresh() {
    render(window.EventsStore.getEvents());
  }

  return { init, refresh };
})();
