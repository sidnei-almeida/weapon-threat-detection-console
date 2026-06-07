const { createApp } = require('./createApp');
const vercelBackend = require('./backends/vercelBackend');

const { app, warmUpModel } = createApp(vercelBackend);

module.exports = {
  app,
  warmUpModel,
};
