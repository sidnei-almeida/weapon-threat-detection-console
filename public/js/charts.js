window.ThreatCharts = (() => {
  let confidenceData = Array(30).fill(0);
  let confidenceSvg = null;
  let confidenceChartArea = null;
  let confidenceTooltip = null;
  let confidenceResizeObserver = null;

  const CONFIDENCE_MIN_HEIGHT = 80;
  const CONFIDENCE_WINDOW_SEC = 60;

  function getChartDimensions() {
    const width = confidenceChartArea?.clientWidth || 280;
    const height = Math.max(confidenceChartArea?.clientHeight || CONFIDENCE_MIN_HEIGHT, CONFIDENCE_MIN_HEIGHT);
    const padding = { top: 8, right: 8, bottom: 8, left: 0 };
    const chartW = Math.max(width - padding.left - padding.right, 1);
    const chartH = Math.max(height - padding.top - padding.bottom, 1);
    return { width, height, padding, chartW, chartH };
  }

  function getConfidencePoints() {
    const { padding, chartW, chartH } = getChartDimensions();
    const lastIndex = Math.max(confidenceData.length - 1, 1);

    return confidenceData.map((value, index) => {
      const percent = Math.max(0, Math.min(100, value * 100));
      const x = padding.left + (index / lastIndex) * chartW;
      const y = padding.top + chartH - (percent / 100) * chartH;
      const seconds = Math.round(((index + 1) / confidenceData.length) * CONFIDENCE_WINDOW_SEC);
      return { x, y, percent, seconds, index };
    });
  }

  function buildReferenceLines(width, height, padding, chartW, chartH) {
    return [100, 50, 0].map((percent) => {
      const y = padding.top + chartH - (percent / 100) * chartH;
      return `<line x1="${padding.left}" y1="${y.toFixed(2)}" x2="${(width - padding.right).toFixed(2)}" y2="${y.toFixed(2)}" stroke="rgba(255,255,255,0.06)" stroke-width="1" stroke-dasharray="3 3"></line>`;
    }).join('');
  }

  function buildConfidenceSvgMarkup(points) {
    const { width, height, padding, chartW, chartH } = getChartDimensions();
    const baselineY = height - padding.bottom;

    if (points.length === 0) {
      return buildReferenceLines(width, height, padding, chartW, chartH);
    }

    const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
    const areaPath = [
      `M ${points[0].x.toFixed(2)} ${baselineY.toFixed(2)}`,
      ...points.map((point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`),
      `L ${points[points.length - 1].x.toFixed(2)} ${baselineY.toFixed(2)}`,
      'Z',
    ].join(' ');

    const lastPoint = points[points.length - 1];
    const hitTargets = points.map((point, index) => (
      `<circle class="confidence-hit" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="8" fill="transparent" data-index="${index}" data-seconds="${point.seconds}" data-percent="${Math.round(point.percent)}"></circle>`
    )).join('');

    return `
      <defs>
        <linearGradient id="confidenceAreaGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(239,68,68,0.15)"></stop>
          <stop offset="100%" stop-color="rgba(239,68,68,0)"></stop>
        </linearGradient>
      </defs>
      ${buildReferenceLines(width, height, padding, chartW, chartH)}
      <path d="${areaPath}" fill="url(#confidenceAreaGradient)" stroke="none"></path>
      <path d="${linePath}" fill="none" stroke="#EF4444" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
      <circle cx="${lastPoint.x.toFixed(2)}" cy="${lastPoint.y.toFixed(2)}" r="3" fill="#EF4444"></circle>
      ${hitTargets}
    `;
  }

  function hideConfidenceTooltip() {
    if (!confidenceTooltip) return;
    confidenceTooltip.hidden = true;
  }

  function showConfidenceTooltip(point) {
    if (!confidenceTooltip || !confidenceChartArea) return;

    confidenceTooltip.textContent = `t=${point.seconds}s: ${Math.round(point.percent)}%`;
    confidenceTooltip.hidden = false;
    confidenceTooltip.style.left = `${point.x}px`;
    confidenceTooltip.style.top = `${point.y}px`;
  }

  function bindConfidenceTooltipEvents() {
    if (!confidenceSvg || !confidenceChartArea) return;

    confidenceSvg.querySelectorAll('.confidence-hit').forEach((node) => {
      node.addEventListener('mouseenter', () => {
        const points = getConfidencePoints();
        const index = Number(node.dataset.index);
        const point = points[index];
        if (point) showConfidenceTooltip(point);
      });

      node.addEventListener('mouseleave', hideConfidenceTooltip);
    });
  }

  function drawConfidenceChart() {
    if (!confidenceSvg || !confidenceChartArea) return;

    const { width, height } = getChartDimensions();
    confidenceSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    confidenceSvg.setAttribute('width', String(width));
    confidenceSvg.setAttribute('height', String(height));

    const points = getConfidencePoints();
    confidenceSvg.innerHTML = buildConfidenceSvgMarkup(points);

    bindConfidenceTooltipEvents();
    hideConfidenceTooltip();
  }

  function initConfidenceChart() {
    confidenceSvg = document.getElementById('confidenceTrendSvg');
    confidenceChartArea = document.getElementById('confidenceChartArea');
    confidenceTooltip = document.getElementById('confidenceChartTooltip');

    if (!confidenceSvg || !confidenceChartArea) return;

    drawConfidenceChart();

    if (typeof ResizeObserver !== 'undefined') {
      confidenceResizeObserver = new ResizeObserver(() => drawConfidenceChart());
      confidenceResizeObserver.observe(confidenceChartArea);
      const trendBlock = confidenceChartArea.closest('.confidence-trend-block');
      if (trendBlock) confidenceResizeObserver.observe(trendBlock);
    } else {
      window.addEventListener('resize', drawConfidenceChart);
    }

    confidenceChartArea.addEventListener('mouseleave', hideConfidenceTooltip);
  }

  function init() {
    initConfidenceChart();
  }

  function addConfidencePoint(confidence) {
    confidenceData.push(confidence);
    confidenceData.shift();
    drawConfidenceChart();
  }

  function getConfidenceData() {
    return [...confidenceData];
  }

  function reset() {
    confidenceData = Array(30).fill(0);
    drawConfidenceChart();
  }

  return {
    init,
    addConfidencePoint,
    getConfidenceData,
    reset,
    drawConfidenceChart,
  };
})();
