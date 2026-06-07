window.CctvOverlay = (() => {
  let grainFrameId = null;
  let tearTimeoutId = null;
  let tearFadeTimeoutId = null;
  let grainTick = 0;

  function animateGrain() {
    const turbulence = document.querySelector('#noise-filter feTurbulence');
    if (!turbulence) return;

    grainTick += 1;
    const frequency = 0.73 + Math.sin(grainTick * 0.03) * 0.04;
    turbulence.setAttribute('baseFrequency', frequency.toFixed(3));
    grainFrameId = requestAnimationFrame(animateGrain);
  }

  function triggerTear() {
    const tear = document.getElementById('cctvTear');
    if (!tear) {
      scheduleTear();
      return;
    }

    const y = 10 + Math.random() * 70;
    tear.style.top = `${y}%`;
    tear.style.height = `${1 + Math.random() * 2}px`;
    tear.style.opacity = (0.05 + Math.random() * 0.08).toString();
    tear.style.transition = 'none';

    tearFadeTimeoutId = setTimeout(() => {
      tear.style.transition = 'opacity 0.15s ease';
      tear.style.opacity = '0';
    }, 60 + Math.random() * 80);

    scheduleTear();
  }

  function scheduleTear() {
    tearTimeoutId = setTimeout(triggerTear, 4000 + Math.random() * 8000);
  }

  function start() {
    stop();
    grainFrameId = requestAnimationFrame(animateGrain);
    tearTimeoutId = setTimeout(triggerTear, 2000);
  }

  function stop() {
    if (grainFrameId !== null) {
      cancelAnimationFrame(grainFrameId);
      grainFrameId = null;
    }

    if (tearTimeoutId !== null) {
      clearTimeout(tearTimeoutId);
      tearTimeoutId = null;
    }

    if (tearFadeTimeoutId !== null) {
      clearTimeout(tearFadeTimeoutId);
      tearFadeTimeoutId = null;
    }

    grainTick = 0;

    const tear = document.getElementById('cctvTear');
    if (tear) {
      tear.style.opacity = '0';
    }
  }

  return { start, stop };
})();
