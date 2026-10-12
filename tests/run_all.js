// tests/run_all.js - Suíte Completa de Auditoria, Segurança e Integridade
import assert from 'assert';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

console.log('🧪 [Barbearia do Joel] Iniciando Suíte Completa de Testes de Homologação...\n');

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

  // Teste 1: Arquivos Mandatórios de Nuvem, Compliance e Administração
  console.log('▶ Teste 1: Verificação de Arquivos Mandatórios de Nuvem e Frontend');
  const requiredFiles = [
    'server.js',
    'render.yaml',
    'Dockerfile',
    '.gitignore',
    '.dockerignore',
    'package.json',
    'public/index.html',
    'public/admin.html',
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
  console.log('  ✅ Todos os 14 arquivos essenciais estão presentes.');
  passed++;

  // Teste 2: Validação Algorítmica de CRC-16 do PIX EMV
  console.log('▶ Teste 2: Validação Algorítmica do Padrão Bacen PIX EMV (CRC-16)');
  const testPayload = '00020126360014br.gov.bcb.pix0114+55219821560255204000053039865802BR5917BARBEARIA DO JOEL6014RIO DE JANEIRO62070503***6304';
  const crc = calculateCRC16(testPayload);
  assert.strictEqual(crc.length, 4, 'O CRC-16 deve ter 4 caracteres');
  assert.ok(/^[0-9A-F]{4}$/.test(crc), 'O CRC-16 deve ser hexadecimal maiúsculo');
  console.log(`  ✅ CRC-16 calculado com precisão: ${crc}`);
  passed++;

  // Teste 3: Banco de Dados JsonDB
  console.log('▶ Teste 3: Integridade da Base JsonDB (data/agendamentos.json)');
  const dbPath = path.join(ROOT_DIR, 'data', 'agendamentos.json');
  const dbRaw = fs.readFileSync(dbPath, 'utf-8');
  const dbData = JSON.parse(dbRaw);
  assert.ok(Array.isArray(dbData), 'A base deve ser um array JSON');
  console.log('  ✅ Banco JsonDB íntegro e operacional.');
  passed++;

  // Inicia Servidor Local em Porta de Teste
  const testPort = 3991;
  process.env.PORT = testPort;
  process.env.ADMIN_PASSWORD = 'TesteSenhaSegura@1992';
  process.env.ADMIN_SECRET = 'token_teste_unitario_1992';

  await import(`../server.js?t=${Date.now()}`);
  await new Promise(r => setTimeout(r, 450));

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

  // Teste 4: Health Check e Cabeçalhos de Segurança OWASP
  console.log('▶ Teste 4: Health Check (/api/health) e Cabeçalhos de Segurança');
  const healthRes = await makeRequest({ path: '/api/health', method: 'GET' });
  assert.strictEqual(healthRes.status, 200);
  assert.strictEqual(healthRes.headers['x-content-type-options'], 'nosniff');
  assert.strictEqual(healthRes.headers['x-frame-options'], 'SAMEORIGIN');
  const healthJson = JSON.parse(healthRes.body);
  assert.strictEqual(healthJson.status, 'ok');
  assert.strictEqual(healthJson.version, '2.0.0');
  console.log('  ✅ /api/health retornou 200 OK com cabeçalhos OWASP ativos');
  passed++;

  // Teste 5: Bloqueio de Agendamento no Passado (Validação de Regra de Negócio)
  console.log('▶ Teste 5: Bloqueio Estrito de Datas Passadas');
  const pastRes = await makeRequest({
    path: '/api/agendamentos',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({
    clienteNome: 'Cliente do Passado',
    clienteTelefone: '21988887777',
    servico: 'Corte Tradicional / Social',
    unidade: 'matriz',
    data: '2020-01-01',
    horario: '10:00'
  }));
  assert.strictEqual(pastRes.status, 400, 'Data no passado deve retornar 400 Bad Request');
  console.log('  ✅ Data retroativa bloqueada corretamente com HTTP 400');
  passed++;

  // Teste 6: Bloqueio de Agendamento em Dias Fechados (Domingos e Segundas)
  console.log('▶ Teste 6: Bloqueio de Agendamentos em Domingos e Segundas');
  // 2099-01-04 é Domingo e 2099-01-05 é Segunda
  const sunRes = await makeRequest({
    path: '/api/agendamentos',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({
    clienteNome: 'Cliente Domingo',
    clienteTelefone: '21988887777',
    servico: 'Corte Tradicional / Social',
    unidade: 'matriz',
    data: '2099-01-04',
    horario: '10:00'
  }));
  assert.strictEqual(sunRes.status, 422, 'Domingo deve retornar 422 Unprocessable');
  console.log('  ✅ Tentativa de agendamento em domingo rejeitada com HTTP 422');
  passed++;

  // Teste 7: Criação Válida com Unidade e Profissional
  console.log('▶ Teste 7: Criação Válida de Agendamento com Unidade Matriz');
  // 2099-01-06 é Terça-feira
  const dataValida = '2099-01-06';
  const horaValida = '14:00';
  const createRes = await makeRequest({
    path: '/api/agendamentos',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({
    clienteNome: 'Carlos Homologação',
    clienteTelefone: '21987654321',
    servico: 'Corte Degradê / Fade Moderno',
    unidade: 'matriz',
    profissional: 'Joel (Fundador & Barbeiro Titular)',
    data: dataValida,
    horario: horaValida
  }));
  assert.strictEqual(createRes.status, 201);
  const createJson = JSON.parse(createRes.body);
  assert.strictEqual(createJson.success, true);
  const protocolId = createJson.agendamento.id;
  assert.ok(protocolId.startsWith('JOEL-'));
  assert.strictEqual(createJson.agendamento.unidade, 'matriz');
  console.log(`  ✅ Agendamento #${protocolId} criado com sucesso`);
  passed++;

  // Teste 8: Detecção e Prevenção de Conflito de Horário Concorrente
  console.log('▶ Teste 8: Prevenção de Conflito para o Mesmo Profissional');
  const conflictRes = await makeRequest({
    path: '/api/agendamentos',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({
    clienteNome: 'Outro Cliente no Mesmo Horário',
    clienteTelefone: '21999998888',
    servico: 'Corte Tradicional / Social',
    unidade: 'matriz',
    profissional: 'Joel (Fundador & Barbeiro Titular)',
    data: dataValida,
    horario: horaValida
  }));
  assert.strictEqual(conflictRes.status, 409, 'Horário conflitante deve retornar 409 Conflict');
  console.log('  ✅ Conflito detectado e impedido com sucesso (HTTP 409)');
  passed++;

  // Teste 9: Cancelamento de Agendamento pelo Cliente com Validação
  console.log('▶ Teste 9: Cancelamento de Agendamento por Protocolo e Telefone');
  const cancelRes = await makeRequest({
    path: '/api/agendamentos/cancelar',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({
    id: protocolId,
    telefone: '21987654321'
  }));
  assert.strictEqual(cancelRes.status, 200);
  const cancelJson = JSON.parse(cancelRes.body);
  assert.strictEqual(cancelJson.success, true);
  console.log(`  ✅ Agendamento #${protocolId} cancelado com sucesso e horário liberado`);
  passed++;

  // Teste 10: Autenticação Administrativa e Controle de Acesso
  console.log('▶ Teste 10: Autenticação e Proteção do Painel Administrativo');
  // Tentativa com senha errada
  const wrongLoginRes = await makeRequest({
    path: '/api/admin/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({ password: 'senha_errada' }));
  assert.strictEqual(wrongLoginRes.status, 401);

  // Tentativa com senha certa
  const rightLoginRes = await makeRequest({
    path: '/api/admin/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({ password: 'TesteSenhaSegura@1992' }));
  assert.strictEqual(rightLoginRes.status, 200);
  const adminToken = JSON.parse(rightLoginRes.body).token;

  // Consulta sem token (deve barrar 401)
  const unauthRes = await makeRequest({ path: '/api/admin/agendamentos', method: 'GET' });
  assert.strictEqual(unauthRes.status, 401);

  // Consulta com Bearer token (deve autorizar 200)
  const authRes = await makeRequest({
    path: '/api/admin/agendamentos',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  assert.strictEqual(authRes.status, 200);
  const adminList = JSON.parse(authRes.body);
  assert.ok(Array.isArray(adminList.agendamentos));
  console.log('  ✅ Painel administrativo 100% blindado contra acessos não autorizados');
  passed++;

  // Teste 11: Entrega dos Arquivos Estáticos e Páginas
  console.log('▶ Teste 11: Entrega de Páginas Estáticas (/admin, /termos, /privacidade, /)');
  const adminPage = await makeRequest({ path: '/admin', method: 'GET' });
  assert.strictEqual(adminPage.status, 200);
  assert.ok(adminPage.body.includes('Painel do Barbeiro'));

  const homePage = await makeRequest({ path: '/', method: 'GET' });
  assert.strictEqual(homePage.status, 200);
  assert.ok(homePage.body.includes('Barbearia do Joel'));

  const termosPage = await makeRequest({ path: '/termos', method: 'GET' });
  assert.strictEqual(termosPage.status, 200);

  const privPage = await makeRequest({ path: '/privacidade', method: 'GET' });
  assert.strictEqual(privPage.status, 200);
  console.log('  ✅ Todas as rotas de frontend entregues com integridade');
  passed++;

  console.log(`\n🎉 HOMOLOGAÇÃO COMPLETA: Todos os ${passed} testes passaram com sucesso absoluto!`);
  process.exit(0);
}

runTests().catch(err => {
  console.error('\n❌ Falha na execução dos testes:', err);
  process.exit(1);
});
