async function warmUpModel() {
  return {
    backend: 'yolo-client',
    clientInference: true,
    ready: true,
  };
}

async function analyzeBufferCore() {
  const error = new Error('Inferência disponível no navegador (YOLO client-side).');
  error.code = 'CLIENT_INFERENCE_REQUIRED';
  throw error;
}

module.exports = {
  warmUpModel,
  analyzeBufferCore,
  clientInference: true,
  useLocalYolo: false,
};
