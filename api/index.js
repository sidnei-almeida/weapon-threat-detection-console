const { app, warmUpModel } = require('../server/app');

let warmUpPromise = null;

function ensureWarmUp() {
  if (!warmUpPromise) {
    warmUpPromise = warmUpModel().catch((error) => {
      warmUpPromise = null;
      throw error;
    });
  }
  return warmUpPromise;
}

app.use(async (req, res, next) => {
  if (req.path === '/api/analyze' || req.path === '/api/analyze/url') {
    try {
      await ensureWarmUp();
    } catch (error) {
      return res.status(503).json({
        error: 'Modelo YOLO indisponível no servidor.',
        details: error.message,
      });
    }
  }
  return next();
});

module.exports = app;
