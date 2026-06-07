const { createApp } = require('./createApp');

const { app, warmUpModel } = createApp({
  useLocalYolo: false,
  clientInference: true,
});

module.exports = {
  app,
  warmUpModel,
};
