window.IncidentQueue = (() => {
  const {
    CLASS_ICONS,
    getClassLabel,
    getStatusLabel,
    formatConfidenceColor,
    formatDateTime,
    formatTimeShort,
  } = window.ThreatEventHelpers;

  let container = null;
  let expandedId = null;
  let sortNewest = true;
  const noteDrafts = new Map();

  const filters = {
    search: '',
    status: 'all',
    objectClass: 'all',
    camera: 'all',
    period: '7d',
  };

  const CLASS_ICON_SVG = {
    'shield-alert': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    scissors: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>',
    'user-x': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" y1="8" x2="23" y2="14"/><line x1="23" y1="8" x2="17" y2="14"/></svg>',
  };

  function getPeriodCutoff(period) {
    const now = Date.now();
    if (period === '24h') return now - 24 * 60 * 60 * 1000;
    if (period === '7d') return now - 7 * 24 * 60 * 60 * 1000;
    if (period === '30d') return now - 30 * 24 * 60 * 60 * 1000;
    return 0;
  }

  function filterEvents(events) {
    const cutoff = getPeriodCutoff(filters.period);
    const search = filters.search.toLowerCase().trim();

    return events.filter((event) => {
      if (cutoff && event.detectedAt.getTime() < cutoff) return false;
      if (filters.status !== 'all' && event.status !== filters.status) return false;
      if (filters.objectClass !== 'all' && event.objectClass !== filters.objectClass) return false;
      if (filters.camera !== 'all' && event.cameraId !== filters.camera) return false;

      if (search) {
        const haystack = `${event.id} ${event.cameraLabel} ${event.zone}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }

      return true;
    });
  }

  function sortEvents(events) {
    return [...events].sort((a, b) => {
      const diff = b.detectedAt.getTime() - a.detectedAt.getTime();
      return sortNewest ? diff : -diff;
    });
  }

  function getSummaryCounts(events) {
    return {
      escalated: events.filter((e) => e.status === 'escalated').length,
      pending: events.filter((e) => e.status === 'pending').length,
      reviewed: events.filter((e) => e.status === 'reviewed').length,
      false_alarm: events.filter((e) => e.status === 'false_alarm').length,
    };
  }

  function getUniqueCameras(events) {
    const map = new Map();
    events.forEach((e) => {
      if (!map.has(e.cameraId)) map.set(e.cameraId, e.cameraLabel);
    });
    return [...map.entries()];
  }

  function renderClassIcon(objectClass) {
    const iconKey = CLASS_ICONS[objectClass] || 'shield-alert';
    const iconClass = `iq-class-icon iq-class-icon--${objectClass}`;
    return `<div class="${iconClass}">${CLASS_ICON_SVG[iconKey] || ''}</div>`;
  }

  function renderStatusBadge(status) {
    return `<span class="iq-status-badge iq-status-badge--${status}">${getStatusLabel(status)}</span>`;
  }

  function renderActionButtons(eventId) {
    return `
      <div class="iq-actions" data-event-actions="${eventId}">
        <button type="button" class="iq-btn iq-btn--escalate" data-action="escalated" data-id="${eventId}">Escalate</button>
        <button type="button" class="iq-btn iq-btn--reviewed" data-action="reviewed" data-id="${eventId}">Reviewed</button>
        <button type="button" class="iq-btn iq-btn--false" data-action="false_alarm" data-id="${eventId}">False Alarm</button>
      </div>
    `;
  }

  function renderResolvedMeta(event) {
    return `<span class="iq-resolved-meta">Resolvido por ${event.resolvedBy || 'Operator'} · ${formatDateTime(event.resolvedAt)}</span>`;
  }

  function renderExpandedPanel(event) {
    const isPending = event.status === 'pending';
    const note = noteDrafts.get(event.id) || '';

    const frameHtml = event.frameSnapshot
      ? `<img class="iq-frame-img" src="${event.frameSnapshot}" alt="Frame capturado"/>`
      : `<div class="iq-frame-placeholder">Frame não disponível</div>`;

    const resolutionBlock = isPending
      ? `
        <textarea class="iq-note-input" data-note-for="${event.id}" placeholder="Adicionar nota de resolução (opcional)...">${note}</textarea>
        <div class="iq-actions iq-actions--expanded">
          <button type="button" class="iq-btn iq-btn--escalate iq-btn--lg" data-action="escalated" data-id="${event.id}">Escalate</button>
          <button type="button" class="iq-btn iq-btn--reviewed iq-btn--lg" data-action="reviewed" data-id="${event.id}">Reviewed</button>
          <button type="button" class="iq-btn iq-btn--false iq-btn--lg" data-action="false_alarm" data-id="${event.id}">False Alarm</button>
        </div>
      `
      : `
        <p class="iq-resolution-summary">Marcado como ${getStatusLabel(event.status)} por ${event.resolvedBy || 'Operator'} em ${formatDateTime(event.resolvedAt)}</p>
        ${event.resolutionNote ? `<p class="iq-resolution-note">${event.resolutionNote}</p>` : ''}
      `;

    return `
      <div class="iq-expanded ${expandedId === event.id ? 'iq-expanded--open' : ''}">
        <div class="iq-expanded-grid">
          <div class="iq-details">
            <table class="iq-kv-table">
              <tr><td>Evento ID</td><td>${event.id}</td></tr>
              <tr><td>Câmera</td><td>${event.cameraLabel}</td></tr>
              <tr><td>Classe detectada</td><td>${getClassLabel(event.objectClass)}</td></tr>
              <tr><td>Confiança</td><td style="color:${formatConfidenceColor(event.confidence)}">${event.confidence}%</td></tr>
              <tr><td>Zona</td><td>${event.zone}</td></tr>
              <tr><td>Horário</td><td>${formatDateTime(event.detectedAt)}</td></tr>
              <tr><td>Motion state</td><td>${event.motionState}</td></tr>
              <tr><td>Violence level</td><td>${event.violenceLevel}</td></tr>
              <tr><td>Visibilidade</td><td>${event.visibility}</td></tr>
            </table>
          </div>
          <div class="iq-frame-col">
            ${frameHtml}
            ${resolutionBlock}
          </div>
        </div>
      </div>
    `;
  }

  function renderEventCard(event) {
    const isPending = event.status === 'pending';
    const actionsHtml = isPending ? renderActionButtons(event.id) : renderResolvedMeta(event);

    return `
      <article class="iq-card iq-card--${event.status}" data-event-id="${event.id}">
        <div class="iq-card-row" data-toggle-expand="${event.id}">
          ${renderClassIcon(event.objectClass)}
          <div class="iq-card-body">
            <div class="iq-card-top">
              <span class="iq-event-id">${event.id}</span>
              ${renderStatusBadge(event.status)}
              <span class="iq-class-badge">${getClassLabel(event.objectClass)}</span>
            </div>
            <div class="iq-card-meta">
              ${event.cameraId.replace('CAM-', 'CAM ')} · ${event.zone} · ${formatTimeShort(event.detectedAt)} · Conf: ${event.confidence}%
            </div>
          </div>
          <div class="iq-card-actions-wrap" data-stop-propagation="true">
            ${actionsHtml}
          </div>
        </div>
        ${renderExpandedPanel(event)}
      </article>
    `;
  }

  function renderEmpty() {
    return `
      <div class="iq-empty">
        <svg class="iq-empty-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          <polyline points="9 12 11 14 15 10"/>
        </svg>
        <p class="iq-empty-title">Nenhum evento encontrado</p>
        <p class="iq-empty-sub">Ajuste os filtros ou aguarde novas detecções</p>
      </div>
    `;
  }

  function render(events) {
    if (!container) return;

    const allEvents = events;
    const filtered = sortEvents(filterEvents(allEvents));
    const summary = getSummaryCounts(allEvents);
    const pendingCount = summary.pending;
    const cameras = getUniqueCameras(allEvents);

    const cameraOptions = cameras.map(([id, label]) =>
      `<option value="${id}" ${filters.camera === id ? 'selected' : ''}>${label}</option>`,
    ).join('');

    const listHtml = filtered.length
      ? filtered.map(renderEventCard).join('')
      : renderEmpty();

    container.innerHTML = `
      <div class="iq-root">
        <header class="iq-header">
          <div class="iq-header-left">
            <h1 class="iq-title">Incident Queue</h1>
            <span class="iq-pending-badge">${pendingCount} pendentes</span>
          </div>
          <div class="iq-header-right">
            <button type="button" class="iq-sort-toggle" id="iqSortToggle">${sortNewest ? 'Mais recentes' : 'Mais antigos'}</button>
            <button type="button" class="iq-export-btn" id="iqExportBtn">Export CSV</button>
          </div>
        </header>

        <div class="iq-filters">
          <input type="search" class="iq-filter-input iq-filter-search" id="iqSearch" placeholder="Buscar por ID, câmera ou zona..." value="${filters.search}"/>
          <select class="iq-filter-select" id="iqFilterStatus">
            <option value="all">Todos os status</option>
            <option value="pending" ${filters.status === 'pending' ? 'selected' : ''}>Pendente</option>
            <option value="escalated" ${filters.status === 'escalated' ? 'selected' : ''}>Escalado</option>
            <option value="reviewed" ${filters.status === 'reviewed' ? 'selected' : ''}>Revisado</option>
            <option value="false_alarm" ${filters.status === 'false_alarm' ? 'selected' : ''}>Falso alarme</option>
          </select>
          <select class="iq-filter-select" id="iqFilterClass">
            <option value="all">Todas as classes</option>
            <option value="handgun" ${filters.objectClass === 'handgun' ? 'selected' : ''}>Handgun</option>
            <option value="knife" ${filters.objectClass === 'knife' ? 'selected' : ''}>Knife</option>
            <option value="masked_person" ${filters.objectClass === 'masked_person' ? 'selected' : ''}>Masked Person</option>
          </select>
          <select class="iq-filter-select" id="iqFilterCamera">
            <option value="all">Todas as câmeras</option>
            ${cameraOptions}
          </select>
          <select class="iq-filter-select" id="iqFilterPeriod">
            <option value="24h" ${filters.period === '24h' ? 'selected' : ''}>Últimas 24h</option>
            <option value="7d" ${filters.period === '7d' ? 'selected' : ''}>Últimos 7 dias</option>
            <option value="30d" ${filters.period === '30d' ? 'selected' : ''}>Últimos 30 dias</option>
            <option value="all" ${filters.period === 'all' ? 'selected' : ''}>Todos</option>
          </select>
        </div>

        <div class="iq-summary-chips">
          <span class="iq-chip">🔴 <strong class="iq-chip-num iq-chip-num--escalated">${summary.escalated}</strong> Escalados</span>
          <span class="iq-chip">🟡 <strong class="iq-chip-num iq-chip-num--pending">${summary.pending}</strong> Pendentes</span>
          <span class="iq-chip">🟢 <strong class="iq-chip-num iq-chip-num--reviewed">${summary.reviewed}</strong> Revisados</span>
          <span class="iq-chip">⚫ <strong class="iq-chip-num iq-chip-num--false">${summary.false_alarm}</strong> Falsos alarmes</span>
        </div>

        <div class="iq-list tn-scroll" id="iqEventList">
          ${listHtml}
        </div>
      </div>
    `;

    bindEvents(filtered);
  }

  function bindEvents(filteredForExport) {
    document.getElementById('iqSearch')?.addEventListener('input', (e) => {
      filters.search = e.target.value;
      render(window.EventsStore.getEvents());
    });

    document.getElementById('iqFilterStatus')?.addEventListener('change', (e) => {
      filters.status = e.target.value;
      render(window.EventsStore.getEvents());
    });

    document.getElementById('iqFilterClass')?.addEventListener('change', (e) => {
      filters.objectClass = e.target.value;
      render(window.EventsStore.getEvents());
    });

    document.getElementById('iqFilterCamera')?.addEventListener('change', (e) => {
      filters.camera = e.target.value;
      render(window.EventsStore.getEvents());
    });

    document.getElementById('iqFilterPeriod')?.addEventListener('change', (e) => {
      filters.period = e.target.value;
      render(window.EventsStore.getEvents());
    });

    document.getElementById('iqSortToggle')?.addEventListener('click', () => {
      sortNewest = !sortNewest;
      render(window.EventsStore.getEvents());
    });

    document.getElementById('iqExportBtn')?.addEventListener('click', () => {
      window.ThreatExportCsv.exportEvents(filteredForExport);
    });

    container.querySelectorAll('[data-toggle-expand]').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('[data-stop-propagation]')) return;
        const id = row.dataset.toggleExpand;
        expandedId = expandedId === id ? null : id;
        render(window.EventsStore.getEvents());
      });
    });

    container.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const { action, id } = btn.dataset;
        const note = noteDrafts.get(id) || container.querySelector(`[data-note-for="${id}"]`)?.value || '';
        window.EventsStore.resolveEvent(id, action, note);
        expandedId = null;
      });
    });

    container.querySelectorAll('.iq-note-input').forEach((textarea) => {
      textarea.addEventListener('input', (e) => {
        noteDrafts.set(e.target.dataset.noteFor, e.target.value);
      });
      textarea.addEventListener('click', (e) => e.stopPropagation());
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
