const fs = require('fs');
const path = require('path');

const MANIFEST_PATH = path.resolve(__dirname, '../data/cameras.manifest.json');

function loadManifestCameras() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    return [];
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    return Array.isArray(parsed.cameras) ? parsed.cameras : [];
  } catch {
    return [];
  }
}

function listVideoCameras() {
  return loadManifestCameras();
}

module.exports = {
  MANIFEST_PATH,
  loadManifestCameras,
  listVideoCameras,
};
