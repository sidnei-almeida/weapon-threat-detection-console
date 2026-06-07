const { createApp } = require('./createApp');

const { app, setSocketIO, analyzeBuffer, warmUpModel } = createApp({
  useLocalYolo: true,
  clientInference: false,
});

module.exports = {
  app,
  setSocketIO,
  analyzeBuffer,
  warmUpModel,
};
