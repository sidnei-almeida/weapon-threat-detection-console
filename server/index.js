const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const express = require('express');
const { app, setSocketIO, warmUpModel } = require('./app');
const { log } = require('./utils/logger');

const PORT = process.env.PORT || 3001;

app.use('/videos', express.static(path.join(__dirname, '../public/videos')));
app.use(express.static(path.join(__dirname, '../public')));

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
  await warmUpModel();
});
