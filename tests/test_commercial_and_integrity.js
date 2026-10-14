// tests/test_commercial_and_integrity.js - Suíte de Homologação Comercial, Consulta e Integridade
import http from 'http';
import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const PORT = 3998;
const BASE_URL = `http://localhost:${PORT}`;

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({ ...options, port: PORT, host: 'localhost' }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runCommercialTests() {
  console.log('💼 ========================================================');
  console.log('🧪 [Barbearia do Joel] Testes Comerciais, Consulta & Kiwify');
  console.log('💼 ========================================================\n');

  let passed = 0;
  let total = 0;
  const agendamentosPath = path.join(ROOT_DIR, 'data', 'agendamentos.json');
  let originalAgendamentos = null;
  if (fs.existsSync(agendamentosPath)) {
    originalAgendamentos = fs.readFileSync(agendamentosPath, 'utf8');
  }

  // 1. Inicia Servidor de Testes
  const serverProcess = spawn('node', ['server.js'], {
    cwd: ROOT_DIR,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test', ENABLE_SELF_PING: 'false' },
    stdio: 'pipe'
  });

  serverProcess.stderr.on('data', (d) => {
    const msg = d.toString();
    if (!msg.includes('ExperimentalWarning')) console.error(`[Server Err] ${msg}`);
  });

  // Aguarda boot do servidor
  let isReady = false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await makeRequest({ path: '/api/health', method: 'GET' });
      if (res.status === 200) {
        isReady = true;
        break;
      }
    } catch {
      await sleep(250);
    }
  }

  if (!isReady) {
    serverProcess.kill();
    throw new Error('Falha ao inicializar servidor de teste na porta ' + PORT);
  }

  try {
    // TESTE 1: Validação do Link Oficial da Kiwify e Atributos de Segurança
    total++;
    console.log('▶ Teste 1: Validação do Checkout Kiwify e Atributos de Segurança');
    const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'public', 'index.html'), 'utf-8');
    
    assert.ok(indexHtml.includes('https://kiwify.app/oYFh6Tz'), 'O link exato https://kiwify.app/oYFh6Tz deve estar presente');
    assert.ok(indexHtml.includes('rel="noopener noreferrer"'), 'Links externos da Kiwify devem ter rel="noopener noreferrer"');
    assert.ok(indexHtml.includes('target="_blank"'), 'Links externos da Kiwify devem abrir em nova aba target="_blank"');
    assert.ok(indexHtml.includes('data-open-commercial-modal'), 'Gatilho do modal comercial deve existir no menu e rodapé');
    console.log('  ✅ Link oficial Kiwify validado com rel="noopener noreferrer" e target="_blank"');
    passed++;

    // TESTE 2: Diferenciação Rigorosa entre Licença do Software e Agendamento do Cliente
    total++;
    console.log('▶ Teste 2: Diferenciação entre Licença do Software e Agendamento');
    assert.ok(indexHtml.includes('Posse Total & Vitalícia'), 'Pilar 1 da licença presente');
    assert.ok(indexHtml.includes('Zero Mensalidades'), 'Pilar 2 da licença presente');
    assert.ok(indexHtml.includes('Personalização Completa'), 'Pilar 3 da licença presente');
    assert.ok(indexHtml.includes('Suporte Inicial'), 'Pilar 4 da licença presente');
    console.log('  ✅ 4 Pilares da licença comercial comunicados com clareza cristalina');
    passed++;

    // TESTE 3: Criação de Agendamento Legítimo para Testes de Consulta
    total++;
    console.log('▶ Teste 3: Criação de Reserva para Teste de Consulta e Cancelamento');
    const createRes = await makeRequest({
      path: '/api/agendamentos',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({
      clienteNome: 'Mariana Medeiros da Silva',
      clienteTelefone: '21988887777',
      servico: 'Corte Tradicional / Social',
      unidade: 'matriz',
      profissional: 'Joel (Fundador & Barbeiro Titular)',
      data: '2099-05-13', // Quarta-feira útil futura
      horario: '10:00'
    }));

    assert.strictEqual(createRes.status, 201, 'Agendamento deve retornar HTTP 201');
    const createdJson = JSON.parse(createRes.body);
    assert.ok(createdJson.success, 'Criação deve indicar success: true');
    const bookingId = createdJson.agendamento.id;
    assert.ok(bookingId.startsWith('JOEL-'), 'ID deve iniciar com prefixo JOEL-');
    console.log(`  ✅ Reserva de teste criada com sucesso: #${bookingId}`);
    passed++;

    // TESTE 4: Consulta Segura de Agendamento com Proteção de Identidade
    total++;
    console.log('▶ Teste 4: Consulta Segura de Agendamento (/api/agendamentos/consultar)');
    
    // 4a. Consulta com protocolo inexistente -> 404
    const queryNotFound = await makeRequest({
      path: '/api/agendamentos/consultar',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({ id: 'JOEL-NONEXISTENT', telefone: '21988887777' }));
    assert.strictEqual(queryNotFound.status, 404, 'Protocolo inexistente deve retornar 404');

    // 4b. Consulta com telefone incorreto -> 403 Forbidden
    const queryWrongPhone = await makeRequest({
      path: '/api/agendamentos/consultar',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({ id: bookingId, telefone: '21911111111' }));
    assert.strictEqual(queryWrongPhone.status, 403, 'Telefone não correspondente deve retornar 403 Forbidden');

    // 4c. Consulta legítima com dados corretos -> 200 OK
    const querySuccess = await makeRequest({
      path: '/api/agendamentos/consultar',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({ id: bookingId, telefone: '21988887777' }));
    assert.strictEqual(querySuccess.status, 200, 'Consulta legítima deve retornar 200 OK');
    const queryJson = JSON.parse(querySuccess.body);
    assert.ok(queryJson.success, 'Consulta deve ter sucesso');
    assert.strictEqual(queryJson.agendamento.id, bookingId);
    assert.strictEqual(queryJson.agendamento.servico, 'Corte Tradicional / Social');
    // Validação de mascaramento de privacidade para conformidade LGPD
    assert.ok(queryJson.agendamento.clienteNome.includes('M***'), 'Sobrenome deve estar mascarado para privacidade');
    console.log('  ✅ Consulta segura validada com mascaramento de dados sensíveis');
    passed++;

    // TESTE 5: Cancelamento Legítimo e Liberação Efetiva do Horário
    total++;
    console.log('▶ Teste 5: Cancelamento Efetivo e Liberação do Horário');
    const cancelRes = await makeRequest({
      path: '/api/agendamentos/cancelar',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({ id: bookingId, telefone: '21988887777' }));
    assert.strictEqual(cancelRes.status, 200, 'Cancelamento deve retornar HTTP 200');
    
    // Verifica se horário foi liberado criando nova reserva no mesmo slot
    const rebookRes = await makeRequest({
      path: '/api/agendamentos',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({
      clienteNome: 'Novo Cliente Liberado',
      clienteTelefone: '21977776666',
      servico: 'Corte Tradicional / Social',
      unidade: 'matriz',
      profissional: 'Joel (Fundador & Barbeiro Titular)',
      data: '2099-05-13',
      horario: '10:00'
    }));
    assert.strictEqual(rebookRes.status, 201, 'Horário liberado deve permitir novo agendamento com HTTP 201');
    const rebookJson = JSON.parse(rebookRes.body);
    const newBookingId = rebookJson.agendamento.id;

    // Limpa a reserva liberada para não sujar base
    await makeRequest({
      path: '/api/agendamentos/cancelar',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({ id: newBookingId, telefone: '21977776666' }));
    console.log('  ✅ Cancelamento liberou o horário com sucesso para novo cliente');
    passed++;

    // TESTE 6: Verificação de Todas as Formas de Pagamento e Badges
    total++;
    console.log('▶ Teste 6: Formas de Pagamento Aceitas no Rodapé e Modal');
    const styleCss = fs.readFileSync(path.join(ROOT_DIR, 'public', 'css', 'style.css'), 'utf-8');
    assert.ok(indexHtml.includes('pay-badge-pix'), 'Badge PIX presente');
    assert.ok(indexHtml.includes('Cartão de Crédito'), 'Crédito informado');
    assert.ok(indexHtml.includes('Cartão de Débito'), 'Débito informado');
    assert.ok(indexHtml.includes('Dinheiro'), 'Dinheiro informado');
    assert.ok(indexHtml.includes('Aproximação'), 'Aproximação NFC informada');
    assert.ok(styleCss.includes('.pay-badge'), 'Estilo do badge presente no CSS');
    assert.ok(styleCss.includes('.btn-kiwify'), 'Estilo do botão Kiwify presente no CSS');
    console.log('  ✅ Todas as 5 modalidades de pagamento e estilos validados');
    passed++;

    // TESTE 7: Catálogo Oficial e Imutabilidade de Preços/Durações
    total++;
    console.log('▶ Teste 7: Integridade do Catálogo Oficial (/api/info)');
    const infoRes = await makeRequest({ path: '/api/info', method: 'GET' });
    assert.strictEqual(infoRes.status, 200);
    const infoJson = JSON.parse(infoRes.body);
    assert.strictEqual(infoJson.whatsapp, '5521982156025', 'WhatsApp canônico correto');
    assert.strictEqual(infoJson.chavePix, '21982156025', 'Chave PIX canônica correta');

    const expectedServices = [
      { id: 'corte-social', preco: 30.00, duracaoMin: 30 },
      { id: 'corte-degrade', preco: 35.00, duracaoMin: 40 },
      { id: 'barba-terapia', preco: 25.00, duracaoMin: 30 },
      { id: 'combo-completo', preco: 55.00, duracaoMin: 60 },
      { id: 'corte-infantil', preco: 30.00, duracaoMin: 30 },
      { id: 'sobrancelha', preco: 15.00, duracaoMin: 20 },
      { id: 'pigmentacao', preco: 25.00, duracaoMin: 30 }
    ];

    expectedServices.forEach(exp => {
      const found = infoJson.servicos.find(s => s.id === exp.id);
      assert.ok(found, `Serviço ${exp.id} deve constar no catálogo`);
      assert.strictEqual(found.preco, exp.preco, `Preço de ${exp.id} deve ser R$ ${exp.preco}`);
      assert.strictEqual(found.duracaoMin, exp.duracaoMin, `Duração de ${exp.id} deve ser ${exp.duracaoMin}min`);
    });
    console.log('  ✅ Todos os 7 serviços do catálogo validados com preços e durações oficiais');
    passed++;

  } finally {
    serverProcess.kill();
    if (originalAgendamentos !== null) {
      fs.writeFileSync(agendamentosPath, originalAgendamentos, 'utf8');
    }
  }

  console.log('\n========================================================');
  console.log(`📊 RESUMO DA SUÍTE COMERCIAL E INTEGRIDADE:`);
  console.log(`   Total Executados: ${total}`);
  console.log(`   Total Aprovados:  ${passed}`);
  console.log(`   Total Reprovados: ${total - passed}`);
  console.log('========================================================\n');
  assert.strictEqual(passed, total, 'Todos os testes comerciais devem passar com sucesso');
}

runCommercialTests().catch(err => {
  console.error('❌ Falha na suíte comercial:', err);
  process.exit(1);
});
