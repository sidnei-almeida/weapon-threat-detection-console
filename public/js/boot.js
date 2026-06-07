window.ThreatVisionBoot = (() => {
  let clientInference = false;

  const STEPS = [
    {
      id: 'connect',
      label: 'Inicializando console...',
      progress: 18,
      run: async () => {
        const response = await fetch('/api/health');
        if (!response.ok) throw new Error('Servidor indisponível');
        const data = await response.json();
        clientInference = Boolean(data.clientInference);
        window.__THREATVISION_CLIENT_INFERENCE__ = clientInference;
        return data;
      },
    },
    {
      id: 'model',
      label: 'Carregando modelo YOLO...',
      progress: 62,
      run: async () => {
        if (clientInference) {
          if (!window.YoloClient) throw new Error('Cliente YOLO indisponível');
          return window.YoloClient.warmUp();
        }

        const response = await fetch('/api/warmup');
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || 'Falha ao carregar modelo');
        }
        return data;
      },
    },
    {
      id: 'cameras',
      label: 'Sincronizando câmeras...',
      progress: 88,
      run: async () => {
        const staticResponse = await fetch('/cameras.json', { cache: 'no-store' });
        if (staticResponse.ok) {
          const data = await staticResponse.json();
          if (data.cameras?.length) return data;
        }

        const response = await fetch('/api/cameras');
        if (!response.ok) throw new Error('Falha ao listar câmeras');
        return response.json();
      },
    },
    {
      id: 'ready',
      label: 'Sistema operacional',
      progress: 100,
      run: async () => {},
    },
  ];

  function getElements() {
    return {
      loader: document.getElementById('bootLoader'),
      status: document.getElementById('bootStatus'),
      progress: document.getElementById('bootProgressBar'),
      stepList: document.getElementById('bootSteps'),
    };
  }

  function setProgress(elements, value) {
    if (elements.progress) {
      elements.progress.style.width = `${Math.min(100, value)}%`;
    }
  }

  function setStatus(elements, text) {
    if (elements.status) elements.status.textContent = text;
  }

  function markStep(elements, stepId, state) {
    if (!elements.stepList) return;

    elements.stepList.querySelectorAll('[data-step]').forEach((item) => {
      if (item.dataset.step !== stepId) return;
      item.classList.remove('is-active', 'is-done', 'is-error');
      if (state) item.classList.add(state);
    });
  }

  function finishLoader(elements, hasError) {
    if (!elements.loader) return;

    elements.loader.classList.add(hasError ? 'is-error' : 'is-done');
    document.body.classList.remove('is-booting');

    window.setTimeout(() => {
      elements.loader?.classList.add('is-hidden');
    }, hasError ? 2400 : 700);
  }

  async function run() {
    const elements = getElements();
    document.body.classList.add('is-booting');
    setProgress(elements, 4);
    setStatus(elements, STEPS[0].label);

    let failed = false;

    for (const step of STEPS) {
      markStep(elements, step.id, 'is-active');
      setStatus(elements, step.label.toUpperCase());
      setProgress(elements, step.progress - 8);

      try {
        await step.run();
        markStep(elements, step.id, 'is-done');
        setProgress(elements, step.progress);
        if (elements.progress?.parentElement) {
          elements.progress.parentElement.setAttribute('aria-valuenow', String(step.progress));
        }
        await new Promise((resolve) => window.setTimeout(resolve, step.id === 'ready' ? 320 : 180));
      } catch (error) {
        failed = true;
        markStep(elements, step.id, 'is-error');
        setStatus(elements, `ERRO: ${error.message}`);
        setProgress(elements, step.progress);
        break;
      }
    }

    if (!failed) {
      setStatus(elements, 'SISTEMA OPERACIONAL');
    }

    finishLoader(elements, failed);
    return !failed;
  }

  return { run };
})();

document.addEventListener('DOMContentLoaded', async () => {
  await window.ThreatVisionBoot.run();
  window.Dashboard.init();
});
