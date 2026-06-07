const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { loadModel } = require('../src/yolo/loadModel');
const { inferImage } = require('../src/yolo/inferImage');
const { DEFAULT_CONFIDENCE_THRESHOLD } = require('../src/yolo/postprocessDetections');

const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.avi', '.mkv']);
const DEFAULT_VIDEOS_DIR = path.resolve(__dirname, '../videos');

function printUsage() {
  console.log('Usage:');
  console.log('  node scripts/test-video-inference.js [video-or-dir] [fp32|int8] [fps]');
  console.log('');
  console.log('Arguments:');
  console.log('  video-or-dir  Path to a video file or folder (default: ./videos)');
  console.log('  model         fp32 or int8 (default: fp32)');
  console.log('  fps           Frames sampled per second (default: 2)');
  console.log('');
  console.log('Examples:');
  console.log('  node scripts/test-video-inference.js');
  console.log('  node scripts/test-video-inference.js ./videos/sample.mp4');
  console.log('  node scripts/test-video-inference.js ./videos fp32 4');
}

function ensureFfmpeg() {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  } catch {
    throw new Error('ffmpeg não encontrado. Instale com: sudo pacman -S ffmpeg');
  }
}

function resolveVideoPaths(inputArg) {
  const target = inputArg
    ? path.resolve(process.cwd(), inputArg)
    : DEFAULT_VIDEOS_DIR;

  if (!fs.existsSync(target)) {
    throw new Error(`Caminho não encontrado: ${target}`);
  }

  const stat = fs.statSync(target);
  if (stat.isFile()) {
    return [target];
  }

  return fs.readdirSync(target)
    .filter((name) => VIDEO_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .map((name) => path.join(target, name))
    .sort();
}

function getVideoDurationSeconds(videoPath) {
  try {
    const output = execFileSync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      videoPath,
    ], { encoding: 'utf8' }).trim();

    return Number.parseFloat(output) || 0;
  } catch {
    return 0;
  }
}

function extractFrames(videoPath, fps, outputDir) {
  execFileSync('ffmpeg', [
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-i', videoPath,
    '-vf', `fps=${fps}`,
    path.join(outputDir, 'frame_%04d.jpg'),
  ]);
}

function formatDetectionSummary(detections) {
  if (detections.length === 0) {
    return '—';
  }

  return detections
    .map((det) => `${det.className} ${(det.confidence * 100).toFixed(1)}%`)
    .join(', ');
}

function summarizeFrameResults(frameResults) {
  const framesWithDetections = frameResults.filter((frame) => frame.detections.length > 0);
  const peakThreat = frameResults.reduce(
    (best, frame) => (frame.threat.threatScore > best.threatScore ? frame.threat : best),
    { threatScore: 0, threatLevel: 'none', classCounts: {} },
  );

  const classTotals = {};
  for (const frame of frameResults) {
    for (const [className, count] of Object.entries(frame.threat.classCounts)) {
      classTotals[className] = (classTotals[className] || 0) + count;
    }
  }

  return {
    totalFrames: frameResults.length,
    framesWithDetections: framesWithDetections.length,
    detectionRate: frameResults.length
      ? ((framesWithDetections.length / frameResults.length) * 100).toFixed(1)
      : '0.0',
    peakThreatLevel: peakThreat.threatLevel,
    peakThreatScore: Number(peakThreat.threatScore.toFixed(4)),
    classTotals,
    firstDetectionAt: framesWithDetections[0]?.timestampSec ?? null,
  };
}

async function analyzeVideo(session, videoPath, fps) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yolo-video-frames-'));

  try {
    const durationSec = getVideoDurationSeconds(videoPath);
    extractFrames(videoPath, fps, tempDir);

    const frameFiles = fs.readdirSync(tempDir)
      .filter((name) => name.endsWith('.jpg'))
      .sort();

    if (frameFiles.length === 0) {
      throw new Error('Nenhum frame extraído — verifique se o vídeo é válido.');
    }

    const frameResults = [];

    for (let index = 0; index < frameFiles.length; index += 1) {
      const framePath = path.join(tempDir, frameFiles[index]);
      const { detections, threat } = await inferImage(session, framePath);
      const timestampSec = durationSec > 0
        ? Number(((index / Math.max(frameFiles.length - 1, 1)) * durationSec).toFixed(2))
        : Number((index / fps).toFixed(2));

      frameResults.push({
        frame: index + 1,
        file: frameFiles[index],
        timestampSec,
        detections,
        threat,
      });
    }

    return {
      videoPath,
      durationSec,
      fps,
      frameResults,
      summary: summarizeFrameResults(frameResults),
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function printVideoReport(report) {
  const { summary } = report;
  const relPath = path.relative(process.cwd(), report.videoPath);

  console.log('');
  console.log('='.repeat(72));
  console.log(`Vídeo: ${relPath}`);
  console.log(`Duração: ${report.durationSec.toFixed(2)}s | Amostragem: ${report.fps} fps | Frames: ${summary.totalFrames}`);
  console.log(`Frames com detecção: ${summary.framesWithDetections}/${summary.totalFrames} (${summary.detectionRate}%)`);
  console.log(`Pico de ameaça: ${summary.peakThreatLevel.toUpperCase()} (score ${summary.peakThreatScore})`);

  if (summary.firstDetectionAt !== null) {
    console.log(`Primeira detecção: ~${summary.firstDetectionAt}s`);
  }

  if (Object.keys(summary.classTotals).length > 0) {
    console.log(`Classes totais: ${JSON.stringify(summary.classTotals)}`);
  } else {
    console.log('Classes totais: nenhuma arma detectada');
  }

  console.log('-'.repeat(72));

  for (const frame of report.frameResults) {
    const marker = frame.detections.length > 0 ? '⚠' : '·';
    const timeLabel = `${frame.timestampSec.toFixed(2)}s`.padStart(7);
    const threatLabel = frame.threat.threatLevel.toUpperCase().padEnd(8);
    console.log(
      `${marker} frame ${String(frame.frame).padStart(3)} @ ${timeLabel} | ${threatLabel} | ${formatDetectionSummary(frame.detections)}`,
    );
  }
}

async function main() {
  const inputArg = process.argv[2];
  const modelTypeArg = (process.argv[3] || 'fp32').toLowerCase();
  const fpsArg = Number.parseFloat(process.argv[4] || '2');

  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printUsage();
    return;
  }

  if (!['fp32', 'int8'].includes(modelTypeArg)) {
    console.error(`Modelo desconhecido "${modelTypeArg}". Use fp32 ou int8.`);
    process.exitCode = 1;
    return;
  }

  if (!Number.isFinite(fpsArg) || fpsArg <= 0) {
    console.error('fps deve ser um número positivo.');
    process.exitCode = 1;
    return;
  }

  ensureFfmpeg();

  let videoPaths;
  try {
    videoPaths = resolveVideoPaths(inputArg);
  } catch (error) {
    console.error(error.message);
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (videoPaths.length === 0) {
    console.error('Nenhum vídeo encontrado na pasta.');
    process.exitCode = 1;
    return;
  }

  console.log(`Modelo: ${modelTypeArg}`);
  console.log(`Confiança mínima: ${DEFAULT_CONFIDENCE_THRESHOLD}`);
  console.log(`Vídeos: ${videoPaths.length}`);

  const session = await loadModel(modelTypeArg);
  const reports = [];

  for (const videoPath of videoPaths) {
    process.stdout.write(`\nAnalisando ${path.basename(videoPath)}...`);
    const report = await analyzeVideo(session, videoPath, fpsArg);
    reports.push(report);
    process.stdout.write(' ok\n');
    printVideoReport(report);
  }

  const anyDetection = reports.some((report) => report.summary.framesWithDetections > 0);

  console.log('');
  console.log('='.repeat(72));
  console.log('RESUMO GERAL');
  console.log(`Vídeos analisados: ${reports.length}`);
  console.log(`Vídeos com alguma detecção: ${reports.filter((r) => r.summary.framesWithDetections > 0).length}`);
  console.log(anyDetection
    ? 'Resultado: o modelo detectou armas em pelo menos um frame de vídeo.'
    : 'Resultado: nenhuma arma detectada nos vídeos analisados.');
}

main().catch((error) => {
  console.error(`\nFalha na análise de vídeo: ${error.message}`);
  process.exitCode = 1;
});
