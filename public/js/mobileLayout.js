/**
 * Mobile layout — bottom tab bar + panel system (≤768px).
 * Moves existing DOM nodes (no clone) so IDs and live updates keep working.
 */
window.MobileLayout = (() => {
  const MOBILE_MAX = 768;
  let initialized = false;

  function isMobileViewport() {
    return window.innerWidth <= MOBILE_MAX;
  }

  function buildTabBar() {
    const tabBar = document.createElement('div');
    tabBar.id = 'mobile-tab-bar';
    tabBar.setAttribute('role', 'tablist');
    tabBar.setAttribute('aria-label', 'Mobile navigation');
    tabBar.innerHTML = `
      <button class="mob-tab active" type="button" role="tab" aria-selected="true" data-panel="camera">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
        </svg>
        <span>CAM</span>
      </button>
      <button class="mob-tab" type="button" role="tab" aria-selected="false" data-panel="threat">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <path d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
        </svg>
        <span>THREAT</span>
      </button>
      <button class="mob-tab" type="button" role="tab" aria-selected="false" data-panel="ai">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12m11.32 11.32l2.12 2.12M2 12h3m16 0h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"/>
        </svg>
        <span>AI</span>
      </button>
      <button class="mob-tab" type="button" role="tab" aria-selected="false" data-panel="status">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <rect x="3" y="3" width="7" height="7" rx="1"/>
          <rect x="14" y="3" width="7" height="7" rx="1"/>
          <rect x="3" y="14" width="7" height="7" rx="1"/>
          <rect x="14" y="14" width="7" height="7" rx="1"/>
        </svg>
        <span>STATUS</span>
      </button>
    `;
    document.body.appendChild(tabBar);
    return tabBar;
  }

  function createPanel(name) {
    const panel = document.createElement('div');
    panel.className = 'mob-panel';
    panel.dataset.panel = name;
    return panel;
  }

  function switchPanel(panelName) {
    document.querySelectorAll('.mob-tab').forEach((tab) => {
      const active = tab.dataset.panel === panelName;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    document.querySelectorAll('.mob-panel').forEach((panel) => {
      panel.classList.toggle('is-active', panel.dataset.panel === panelName);
    });

    if (panelName === 'camera') {
      window.dispatchEvent(new Event('resize'));
    }
  }

  function buildPanels() {
    const main = document.querySelector('.main-content, [data-component="main-content"]');
    const leftSidebar = document.querySelector('.sidebar-left, [data-sidebar="left"]');
    const rightSidebar = document.querySelector('.sidebar-right, [data-sidebar="right"]');
    const centerPanel = document.querySelector('.center-panel, [data-component="video-area"]');
    const statusFooter = document.querySelector('.sidebar-status-footer, [data-component="system-status"]');
    const cameraBlock = document.querySelector('.camera-source-block');

    if (!main) return;

    const host = document.createElement('div');
    host.className = 'mob-panel-host';
    main.appendChild(host);

    const cameraPanel = createPanel('camera');
    cameraPanel.classList.add('is-active');
    if (cameraBlock) cameraPanel.appendChild(cameraBlock);
    if (centerPanel) cameraPanel.appendChild(centerPanel);
    host.appendChild(cameraPanel);

    const threatPanel = createPanel('threat');
    if (leftSidebar) {
      [...leftSidebar.children].forEach((child) => {
        if (child.classList.contains('camera-source-block')) return;
        if (child.classList.contains('sidebar-status-footer')) return;
        threatPanel.appendChild(child);
      });
      leftSidebar.remove();
    }
    host.appendChild(threatPanel);

    const aiPanel = createPanel('ai');
    if (rightSidebar) {
      aiPanel.appendChild(rightSidebar);
    }
    host.appendChild(aiPanel);

    const statusPanel = createPanel('status');
    statusPanel.classList.add('mob-panel--status');
    if (statusFooter) {
      statusPanel.appendChild(statusFooter);
    } else {
      statusPanel.innerHTML = '<p class="mob-panel-empty">Status unavailable</p>';
    }
    host.appendChild(statusPanel);
  }

  function bindTabs(tabBar) {
    tabBar.querySelectorAll('.mob-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        switchPanel(tab.dataset.panel);
      });
    });
  }

  function init() {
    if (initialized || !isMobileViewport()) return;
    initialized = true;

    document.body.classList.add('is-mobile');
    buildPanels();
    const tabBar = buildTabBar();
    bindTabs(tabBar);
    switchPanel('camera');
  }

  return { init, isMobileViewport };
})();

document.addEventListener('DOMContentLoaded', () => {
  window.MobileLayout.init();
});
