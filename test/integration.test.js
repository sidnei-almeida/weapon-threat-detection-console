const http = require('http');

const BASE_URL = 'http://localhost:3001';
let passed = 0;
let failed = 0;

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: {},
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        let parsed = data;
        try {
          parsed = JSON.parse(data);
        } catch {
          // keep raw string
        }
        resolve({ status: res.statusCode, body: parsed });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(body);
    }

    req.end();
  });
}

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`✅ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`❌ ${name}: ${error.message}`);
  }
}

async function runTests() {
  await test('Server está rodando', async () => {
    const response = await request('GET', '/api/stats');
    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }
  });

  await test('Rota de análise existe', async () => {
    const response = await request('POST', '/api/analyze');
    if (response.status !== 400) {
      throw new Error(`Expected 400, got ${response.status}`);
    }
  });

  await test('Busca eventos vazia', async () => {
    const response = await request('GET', '/api/events');
    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }
    if (!Array.isArray(response.body.events)) {
      throw new Error('Expected events array');
    }
  });

  await test('Evento não encontrado', async () => {
    const response = await request('GET', '/api/events/EVT-9999');
    if (response.status !== 404) {
      throw new Error(`Expected 404, got ${response.status}`);
    }
  });

  console.log(`\n✅ ${passed} testes passaram, ❌ ${failed} falharam`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((error) => {
  console.error(`Test runner failed: ${error.message}`);
  process.exit(1);
});
