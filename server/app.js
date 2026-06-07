const { createApp } = require('./createApp');
const localDevBackend = require('./backends/localDevBackend');

const { app, setSocketIO, analyzeBuffer, warmUpModel } = createApp(localDevBackend);

module.exports = {
  app,
  setSocketIO,
  analyzeBuffer,
  warmUpModel,
};
