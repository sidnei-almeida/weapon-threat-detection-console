/**
 * TN.modal — overlay base + confirm dialogs.
 * Callable: TN.modal({ title, message, type, onConfirm, ... })
 * API:      TN.modal.mount({ id, className, html })
 */
(function () {
  window.TN = window.TN || {};

  const CONFIRM_OVERLAY_ID = 'tn-confirm-overlay';

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const modalImpl = {
    active: null,

    mount({ id, className, html, zIndex = 99998 }) {
      this.close(id);

      const overlay = document.createElement('div');
      overlay.id = id;
      overlay.className = className;
      overlay.dataset.tnModal = 'true';
      if (zIndex) overlay.style.zIndex = String(zIndex);
      overlay.innerHTML = html;

      document.body.appendChild(overlay);
      this.active = id;
      document.body.classList.add('tn-modal-open');

      return overlay;
    },

    close(id) {
      const targetId = id || this.active;
      if (!targetId) return;

      const el = document.getElementById(targetId);
      if (el) el.remove();

      if (this.active === targetId) this.active = null;

      if (!document.querySelector('[data-tn-modal]')) {
        document.body.classList.remove('tn-modal-open');
      }
    },

    isOpen(id) {
      return Boolean(document.getElementById(id || this.active || ''));
    },

    showConfirm(options = {}) {
      const {
        title = '',
        message = '',
        type = 'info',
        showCancel = true,
        confirmLabel = 'CONFIRM',
        cancelLabel = 'CANCEL',
        onConfirm,
        onCancel,
      } = options;

      const html = `
        <div class="tn-confirm-modal tn-confirm-modal--${escapeHtml(type)}" role="dialog" aria-modal="true">
          <div class="tn-confirm-corner tn-confirm-corner--tl"></div>
          <div class="tn-confirm-corner tn-confirm-corner--tr"></div>
          <div class="tn-confirm-corner tn-confirm-corner--bl"></div>
          <div class="tn-confirm-corner tn-confirm-corner--br"></div>
          <div class="tn-confirm-header">
            <span class="tn-confirm-dot" aria-hidden="true"></span>
            <span class="tn-confirm-title">${escapeHtml(title)}</span>
          </div>
          <p class="tn-confirm-message">${escapeHtml(message)}</p>
          <div class="tn-confirm-actions">
            ${showCancel ? `<button type="button" class="tn-confirm-btn tn-confirm-btn--cancel" data-action="cancel">${escapeHtml(cancelLabel)}</button>` : ''}
            <button type="button" class="tn-confirm-btn tn-confirm-btn--confirm" data-action="confirm">${escapeHtml(confirmLabel)}</button>
          </div>
        </div>
      `;

      const overlay = this.mount({
        id: CONFIRM_OVERLAY_ID,
        className: 'tn-confirm-overlay',
        html,
        zIndex: 99990,
      });

      const closeConfirm = (callback) => {
        this.close(CONFIRM_OVERLAY_ID);
        callback?.();
      };

      overlay.querySelector('[data-action="confirm"]')?.addEventListener('click', () => {
        closeConfirm(onConfirm);
      });

      overlay.querySelector('[data-action="cancel"]')?.addEventListener('click', () => {
        closeConfirm(onCancel);
      });

      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) closeConfirm(onCancel);
      });

      return overlay;
    },
  };

  function modal(options) {
    if (options && typeof options === 'object' && ('title' in options || 'message' in options)) {
      return modalImpl.showConfirm(options);
    }
    return modalImpl;
  }

  Object.assign(modal, modalImpl);
  window.TN.modal = modal;
})();
