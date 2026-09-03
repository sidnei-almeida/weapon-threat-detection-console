const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const express = require('express');
const { app, setSocketIO, warmUpModel } = require('./app');
const { log } = require('./utils/logger');

const PORT = process.env.PORT || 3001;

/*
 * Cross-origin isolation unlocks SharedArrayBuffer, which is what lets
 * onnxruntime-web run WASM inference multi-threaded (roughly 2-3x faster on
 * CPU). Opt-in via CROSS_ORIGIN_ISOLATION=1 because COEP also constrains every
 * cross-origin subresource: `credentialless` keeps CDN scripts working on
 * Chromium/Firefox, while Safari simply stays single-threaded.
 */
if (process.env.CROSS_ORIGIN_ISOLATION === '1') {
  app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    next();
  });
}

const staticOptions = {
  maxAge: '1h',
  setHeaders(res, filePath) {
    /* The model is content-addressed by filename and ~38 MB — never re-fetch. */
    if (filePath.endsWith('.onnx')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  },
};

app.use('/videos', express.static(path.join(__dirname, '../public/videos'), staticOptions));
app.use(express.static(path.join(__dirname, '../public'), staticOptions));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

setSocketIO(io);

io.on('connection', (socket) => {
  log('INFO', `Cliente conectado: ${socket.id}`);
  socket.emit('connected', {
    message: 'ThreatVision Console conectado',
    serverTime: new Date().toISOString(),
  });

  socket.on('disconnect', () => {
    log('INFO', `Cliente desconectado: ${socket.id}`);
  });
});

server.listen(PORT, async () => {
  log('INFO', `ThreatVision Server rodando na porta ${PORT}`);
  try {
    await warmUpModel();
  } catch (error) {
    log('ERROR', 'Falha ao carregar YOLO local', { message: error.message });
  }
});
