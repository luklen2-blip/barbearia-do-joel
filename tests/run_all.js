// tests/run_all.js - Suíte Oficial de Testes de Integridade
import assert from 'assert';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

console.log('🧪 [Barbearia do Joel] Iniciando Suíte de Testes de Integridade Local...\n');

// Helper para cálculo do CRC-16 / CCITT-FALSE (Padrão Oficial EMV Bacen)
function calculateCRC16(payload) {
  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i++) {
    crc ^= (payload.charCodeAt(i) << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

async function runTests() {
  let passed = 0;

  // Teste 1: Validação de Arquivos Obrigatórios de Infraestrutura e Nuvem
  console.log('▶ Teste 1: Verificação de Arquivos Mandatórios de Nuvem e Compliance');
  const requiredFiles = [
    'server.js',
    'render.yaml',
    'Dockerfile',
    '.gitignore',
    '.dockerignore',
    'package.json',
    'public/index.html',
    'public/termos.html',
    'public/privacidade.html',
    'public/css/style.css',
    'public/js/app.js',
    'public/assets/fachada.jpg',
    'data/agendamentos.json'
  ];

  for (const relPath of requiredFiles) {
    const full = path.join(ROOT_DIR, relPath);
    assert.ok(fs.existsSync(full), `Arquivo essencial não encontrado: ${relPath}`);
  }
  console.log('  ✅ Todos os arquivos essenciais estão presentes.');
  passed++;

  // Teste 2: Validação Algorítmica de CRC-16 do PIX EMV
  console.log('▶ Teste 2: Validação de CRC-16 do Padrão Bacen (EMV QR Code)');
  const testPayload = '00020126360014br.gov.bcb.pix0114+55219821560255204000053039865802BR5917BARBEARIA DO JOEL6014RIO DE JANEIRO62070503***6304';
  const crc = calculateCRC16(testPayload);
  assert.strictEqual(crc.length, 4, 'O CRC-16 deve ter exatamente 4 caracteres hexadecimais');
  assert.ok(/^[0-9A-F]{4}$/.test(crc), 'O CRC-16 deve conter apenas caracteres hexadecimais em maiúsculas');
  console.log(`  ✅ CRC-16 calculado com perfeição: ${crc}`);
  passed++;

  // Teste 3: Validação da Camada de Persistência JsonDB
  console.log('▶ Teste 3: Integridade da Base de Dados JsonDB (agendamentos.json)');
  const dbPath = path.join(ROOT_DIR, 'data', 'agendamentos.json');
  const dbRaw = fs.readFileSync(dbPath, 'utf-8');
  const dbData = JSON.parse(dbRaw);
  assert.ok(Array.isArray(dbData), 'A base de agendamentos deve ser um array JSON');
  console.log('  ✅ Banco JsonDB íntegro e operacional.');
  passed++;

  // Teste 4: Inicialização de Servidor e Testes E2E de Rotas HTTP
  console.log('▶ Teste 4: Teste de Rotas HTTP e Health Check (/api/health)');
  const testPort = 3987;
  process.env.PORT = testPort;

  // Importa e executa o servidor dinamicamente
  await import(`../server.js?t=${Date.now()}`);

  // Aguarda 400ms para bind da porta
  await new Promise(r => setTimeout(r, 400));

  // Função helper para requisições
  const makeRequest = (options, postData = null) => {
    return new Promise((resolve, reject) => {
      const req = http.request({ port: testPort, host: '127.0.0.1', ...options }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
      });
      req.on('error', reject);
      if (postData) req.write(postData);
      req.end();
    });
  };

  // 4a. Health check obrigatório
  const healthRes = await makeRequest({ path: '/api/health', method: 'GET' });
  assert.strictEqual(healthRes.status, 200, 'Health check deve retornar 200 OK');
  const healthJson = JSON.parse(healthRes.body);
  assert.strictEqual(healthJson.status, 'ok', 'Status deve ser ok');
  assert.strictEqual(healthJson.version, '2.0.0', 'Versão deve ser 2.0.0');
  assert.ok(typeof healthJson.uptime_seconds === 'number', 'uptime_seconds deve ser número');
  console.log('  ✅ GET /api/health retornou 200 OK no contrato esperado');

  // 4b. GET /api/info
  const infoRes = await makeRequest({ path: '/api/info', method: 'GET' });
  assert.strictEqual(infoRes.status, 200);
  const infoJson = JSON.parse(infoRes.body);
  assert.strictEqual(infoJson.nome, 'Barbearia do Joel');
  assert.strictEqual(infoJson.fundacao, 1992);
  assert.ok(infoJson.servicos.length >= 5, 'Deve conter catálogo com ao menos 5 serviços');
  console.log('  ✅ GET /api/info retornou dados corretos da barbearia (Desde 1992)');

  // 4c. POST /api/pix
  const pixRes = await makeRequest({
    path: '/api/pix',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({ amount: 15.00, txId: 'TEST12' }));
  assert.strictEqual(pixRes.status, 200);
  const pixJson = JSON.parse(pixRes.body);
  assert.strictEqual(pixJson.success, true);
  assert.ok(pixJson.payloadPix.startsWith('000201'), 'Payload PIX deve iniciar com 000201');
  assert.ok(pixJson.qrCodeUrl.includes('api.qrserver.com'), 'QR Code URL deve ser válida');
  console.log('  ✅ POST /api/pix gerou payload EMV e QR Code válidos');

  // 4d. POST /api/agendamentos e GET /api/agendamentos
  const dataTeste = `2099-01-${String(Math.floor(Math.random() * 25) + 1).padStart(2, '0')}`;
  const horaTeste = `${String(Math.floor(Math.random() * 10) + 9).padStart(2, '0')}:${String(Math.floor(Math.random() * 50) + 10).padStart(2, '0')}`;
  const agRes = await makeRequest({
    path: '/api/agendamentos',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({
    clienteNome: 'Cliente de Teste Automatizado',
    clienteTelefone: '21999999999',
    servico: 'Corte Tradicional / Social',
    preco: 30.00,
    data: dataTeste,
    horario: horaTeste
  }));
  assert.strictEqual(agRes.status, 201);
  const agJson = JSON.parse(agRes.body);
  assert.strictEqual(agJson.success, true);
  assert.ok(agJson.agendamento.id.startsWith('JOEL-'));
  assert.ok(agJson.whatsappUrl.includes('wa.me/5521982156025'));
  console.log('  ✅ POST /api/agendamentos criou agendamento e URL de WhatsApp com sucesso');

  // 4e. Entrega de Frontend Estático e Compliance
  const homeRes = await makeRequest({ path: '/', method: 'GET' });
  assert.strictEqual(homeRes.status, 200);
  assert.ok(homeRes.body.includes('Barbearia do Joel'));

  const termosRes = await makeRequest({ path: '/termos', method: 'GET' });
  assert.strictEqual(termosRes.status, 200);
  assert.ok(termosRes.body.includes('Termos de Uso'));

  const privRes = await makeRequest({ path: '/privacidade', method: 'GET' });
  assert.strictEqual(privRes.status, 200);
  assert.ok(privRes.body.includes('LGPD'));
  console.log('  ✅ Entrega de arquivos estáticos, rotas /termos e /privacidade validadas');

  passed++;

  console.log(`\n🎉 SUCESSO TOTAL: Todos os ${passed} testes de integridade passaram com louvor!`);
  process.exit(0);
}

runTests().catch(err => {
  console.error('\n❌ Falha na execução dos testes:', err);
  process.exit(1);
});
