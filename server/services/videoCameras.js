const fs = require('fs');
const path = require('path');

const PUBLIC_VIDEOS_DIR = path.resolve(__dirname, '../../public/videos');
const LEGACY_VIDEOS_DIR = path.resolve(__dirname, '../../videos');
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.avi', '.mkv']);

function resolveVideosDir() {
  for (const dir of [PUBLIC_VIDEOS_DIR, LEGACY_VIDEOS_DIR]) {
    if (!fs.existsSync(dir)) continue;

    const hasVideos = fs.readdirSync(dir)
      .some((name) => VIDEO_EXTENSIONS.has(path.extname(name).toLowerCase()));

    if (hasVideos) return dir;
  }

  return PUBLIC_VIDEOS_DIR;
}

const LABEL_OVERRIDES = {
  'demo-test-dataset': 'Demo Test Dataset',
  'demo-zone-b': 'Demo Zone B',
  'demo-zone-c': 'Demo Zone C',
  'demo-zone-d': 'Demo Zone D',
  'demo-zone-e': 'Demo Zone E',
  'demo-zone-f': 'Demo Zone F',
};

function formatCameraLabel(filename) {
  const base = path.basename(filename, path.extname(filename));
  if (LABEL_OVERRIDES[base]) {
    return LABEL_OVERRIDES[base];
  }

  const cleaned = base
    .replace(/^grok-video-/i, '')
    .replace(/\(\d+\)$/, '')
    .replace(/-/g, ' ')
    .trim();

  return cleaned || base;
}

function listVideoCameras() {
  const videosDir = resolveVideosDir();

  if (!fs.existsSync(videosDir)) {
    return [];
  }

  return fs.readdirSync(videosDir)
    .filter((name) => VIDEO_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((filename, index) => {
      const num = String(index + 1).padStart(2, '0');
      const label = formatCameraLabel(filename);

      return {
        id: `CAM-${num}`,
        number: num,
        name: `CAM ${num} – ${label}`,
        label,
        zone: `Video Zone ${num}`,
        videoUrl: `/videos/${encodeURIComponent(filename)}`,
        filename,
        type: 'video',
      };
    });
}

module.exports = {
  PUBLIC_VIDEOS_DIR,
  LEGACY_VIDEOS_DIR,
  resolveVideosDir,
  listVideoCameras,
};
