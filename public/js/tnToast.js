/**
 * TN.toast — lightweight toast notifications.
 */
(function () {
  window.TN = window.TN || {};

  let stack = null;

  function ensureStack() {
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'tn-toast-stack';
      stack.className = 'tn-toast-stack';
      stack.setAttribute('aria-live', 'polite');
      document.body.appendChild(stack);
    }
    return stack;
  }

  window.TN.toast = function toast({ message, type = 'info', duration = 3200 }) {
    const el = document.createElement('div');
    el.className = `tn-toast tn-toast--${type}`;
    el.textContent = message;

    ensureStack().appendChild(el);
    requestAnimationFrame(() => el.classList.add('tn-toast--visible'));

    setTimeout(() => {
      el.classList.remove('tn-toast--visible');
      setTimeout(() => el.remove(), 280);
    }, duration);
  };
})();
