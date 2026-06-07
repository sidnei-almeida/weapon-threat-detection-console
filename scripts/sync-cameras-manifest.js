#!/usr/bin/env node

const { writeManifestFromDisk } = require('../server/services/videoCameras');

const result = writeManifestFromDisk();

console.log(` cameras.manifest.json atualizado (${result.total} câmera(s))`);

if (result.total === 0) {
  console.warn(' Nenhum vídeo encontrado em public/videos/ — adicione .mp4 e rode de novo.');
  process.exit(1);
}
