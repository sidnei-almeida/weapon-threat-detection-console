window.TabManager = (() => {
  let activeTab = 'live';

  const PANELS = {
    live: 'tabPanelLive',
    queue: 'tabPanelQueue',
    analytics: 'tabPanelAnalytics',
  };

  function showTab(tabId) {
    activeTab = tabId;

    document.querySelectorAll('.nav-tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.tab === tabId);
    });

    Object.entries(PANELS).forEach(([id, panelId]) => {
      const panel = document.getElementById(panelId);
      if (!panel) return;
      const isActive = id === tabId;
      panel.hidden = !isActive;
      panel.classList.toggle('tab-panel--active', isActive);
    });

    if (tabId === 'queue') {
      window.IncidentQueue?.refresh?.();
    } else if (tabId === 'analytics') {
      window.Analytics?.refresh?.();
    }

    window.dispatchEvent(new Event('resize'));
  }

  function init() {
    document.querySelectorAll('.nav-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const tabId = tab.dataset.tab;

        if (tabId === 'upload') {
          document.getElementById('uploadModal').style.display = 'flex';
          return;
        }

        showTab(tabId);
      });
    });

    showTab('live');
  }

  function getActiveTab() {
    return activeTab;
  }

  return { init, showTab, getActiveTab };
})();
