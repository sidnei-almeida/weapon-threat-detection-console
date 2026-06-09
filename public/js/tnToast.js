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

  window.TN.toast = function toast({ message, type = 'info', duration = 3000 }) {
    const el = document.createElement('div');
    el.className = `tn-toast tn-toast--${type}`;
    el.textContent = message;

    ensureStack().appendChild(el);
    requestAnimationFrame(() => el.classList.add('tn-toast--visible'));

    const fadeStart = Math.max(0, duration - 500);
    setTimeout(() => el.classList.add('tn-toast--fading'), fadeStart);

    setTimeout(() => {
      el.classList.remove('tn-toast--visible', 'tn-toast--fading');
      setTimeout(() => el.remove(), 280);
    }, duration);
  };
})();
