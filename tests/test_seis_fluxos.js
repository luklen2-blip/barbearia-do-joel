// tests/test_seis_fluxos.js
// Suíte de Testes Automatizados Rigorosos para os Seis Fluxos Funcionais

import assert from 'assert';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, '..');

console.log('💈 ========================================================');
console.log('🧪 [Barbearia do Joel] Testando os 6 Fluxos Funcionais Chave');
console.log('💈 ========================================================\n');

let testPort = 3995;

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: '127.0.0.1',
      port: testPort,
      path: options.path,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runSixFlowTests() {
  const testResults = [];

  // Leitura de arquivos do frontend
  const indexHtml = fs.readFileSync(path.join(ROOT_DIR, 'public', 'index.html'), 'utf-8');
  const styleCss = fs.readFileSync(path.join(ROOT_DIR, 'public', 'css', 'style.css'), 'utf-8');
  const appJs = fs.readFileSync(path.join(ROOT_DIR, 'public', 'js', 'app.js'), 'utf-8');

  // Inicializa servidor para testes de API
  process.env.PORT = String(testPort);
  process.env.ADMIN_PASSWORD = 'teste_admin_pass_seis_fluxos_123';

  // Limpa agendamentos de teste prévios (datas 2099) para garantir idempotência dos testes
  const dbPath = path.join(ROOT_DIR, 'data', 'agendamentos.json');
  if (fs.existsSync(dbPath)) {
    try {
      const dbRaw = fs.readFileSync(dbPath, 'utf-8');
      const dbData = JSON.parse(dbRaw || '[]');
      const sanitizedData = dbData.filter(a => !a.data?.startsWith('2099-'));
      fs.writeFileSync(dbPath, JSON.stringify(sanitizedData, null, 2), 'utf-8');
    } catch {}
  }

  const { db } = await import(`../database.js?t=${Date.now()}`);
  await db.init();

  // Inicia servidor HTTP
  await import(`../server.js?t=${Date.now()}`);
  await new Promise(r => setTimeout(r, 600));

  // ----------------------------------------------------
  // TESTE 1: Agendar Horário (Navegação & Scroll Offset)
  // ----------------------------------------------------
  console.log('▶ TESTE 1: Fluxo "Agendar Horário"');
  try {
    // 1. O botão principal do Hero aponta para #agendamento
    assert.ok(indexHtml.includes('href="#agendamento" class="btn btn-primary"'), 'Hero deve ter botão primário para #agendamento');
    assert.ok(indexHtml.includes('<span>📅 Agendar Horário</span>'), 'Texto do botão primário do Hero deve ser "📅 Agendar Horário"');

    // 2. A seção #agendamento existe
    assert.ok(indexHtml.includes('id="agendamento" class="booking-section"'), 'A seção #agendamento deve existir no DOM');

    // 3. O cabeçalho é sticky e o CSS compensa o cabeçalho fixo com scroll-margin e scroll-padding
    assert.ok(styleCss.includes('.navbar {') && styleCss.includes('position: sticky;'), 'Navbar deve ser sticky');
    assert.ok(styleCss.includes('scroll-padding-top:'), 'HTML deve ter scroll-padding-top para não cobrir o formulário');
    assert.ok(styleCss.includes('scroll-margin-top:'), 'Section deve ter scroll-margin-top para telas desktop e mobile');
    assert.ok(styleCss.includes('scroll-behavior: smooth;'), 'Rolagem deve ser suave');

    // 4. Não há botões concorrentes confusos
    assert.ok(!indexHtml.includes('Agendar Corte Online'), 'Não deve existir botão duplicado "Agendar Corte Online"');

    console.log('  ✅ [TESTE 1 APROVADO] Botão "Agendar Horário" direciona com clareza e visibilidade compensada para telas desktop/mobile.');
    testResults.push({ id: 1, name: 'Agendar Horário', status: 'APROVADO' });
  } catch (err) {
    console.error('  ❌ [TESTE 1 REPROVADO]:', err.message);
    testResults.push({ id: 1, name: 'Agendar Horário', status: 'REPROVADO', error: err.message });
  }

  // ----------------------------------------------------
  // TESTE 2: Ver Serviços & Preços
  // ----------------------------------------------------
  console.log('\n▶ TESTE 2: Fluxo "Ver Serviços & Preços"');
  try {
    // 1. Botão secundário do Hero leva para #servicos
    assert.ok(indexHtml.includes('href="#servicos" class="btn btn-outline"'), 'Hero deve conter botão secundário apontando para #servicos');
    assert.ok(indexHtml.includes('<span>✂️ Ver Serviços & Preços</span>'), 'Texto do botão deve ser "✂️ Ver Serviços & Preços"');

    // 2. A seção #servicos existe e contém o catálogo
    assert.ok(indexHtml.includes('id="servicos" class="services-section"'), 'A seção #servicos deve existir no DOM');
    assert.ok(indexHtml.includes('Nossos Serviços & Valores'), 'A seção #servicos deve conter a tabela de valores');

    // 3. Scroll margin de compensação presente
    assert.ok(styleCss.includes('section {') && styleCss.includes('scroll-margin-top:'), 'Seção de serviços compensada contra o cabeçalho');

    console.log('  ✅ [TESTE 2 APROVADO] Botão "Ver Serviços & Preços" navega perfeitamente para o catálogo de serviços.');
    testResults.push({ id: 2, name: 'Ver Serviços & Preços', status: 'APROVADO' });
  } catch (err) {
    console.error('  ❌ [TESTE 2 REPROVADO]:', err.message);
    testResults.push({ id: 2, name: 'Ver Serviços & Preços', status: 'REPROVADO', error: err.message });
  }

  // ----------------------------------------------------
  // TESTE 3: Seleção Automática dos Seis Serviços
  // ----------------------------------------------------
  console.log('\n▶ TESTE 3: Fluxo de Seleção Automática dos 6 Serviços');
  try {
    const servicosObrigatorios = [
      'corte-social',
      'corte-degrade',
      'barba-terapia',
      'combo-completo',
      'corte-infantil',
      'pigmentacao'
    ];

    // 1. Todos os 6 serviços estão nos cards com atributo data-service e classe btn-choose-service
    for (const sId of servicosObrigatorios) {
      assert.ok(indexHtml.includes(`data-service="${sId}"`), `Card de serviço com data-service="${sId}" não encontrado`);
      assert.ok(indexHtml.includes(`class="btn btn-outline btn-choose-service" data-service="${sId}"`) ||
                indexHtml.includes(`class="btn btn-primary btn-choose-service" data-service="${sId}"`),
                `Botão de escolha direta para ${sId} ausente`);
    }

    // 2. Todos os 6 serviços estão no select do formulário
    for (const sId of servicosObrigatorios) {
      assert.ok(indexHtml.includes(`value="${sId}"`), `Opção no formulário para ${sId} não encontrada`);
    }

    // 3. Verificação do listener e idempotência em app.js
    assert.ok(appJs.includes('document.querySelectorAll(\'.btn-choose-service\')'), 'Listener de clique nos cards de serviço presente');
    assert.ok(appJs.includes('serviceSelect.value = sId'), 'Atualização automática do valor do select presente');
    assert.ok(appJs.includes('form.dataset.initialized'), 'Idempotência com guard flag implementada para evitar listeners duplicados');

    console.log('  ✅ [TESTE 3 APROVADO] Todos os 6 serviços possuem acoplamento dinâmico e proteção contra listeners duplicados.');
    testResults.push({ id: 3, name: 'Seleção automática', status: 'APROVADO' });
  } catch (err) {
    console.error('  ❌ [TESTE 3 REPROVADO]:', err.message);
    testResults.push({ id: 3, name: 'Seleção automática', status: 'REPROVADO', error: err.message });
  }

  // ----------------------------------------------------
  // TESTE 4: Preço e Duração (Fonte Única da Verdade)
  // ----------------------------------------------------
  console.log('\n▶ TESTE 4: Fluxo de Preço e Duração (Single Source of Truth & Backend Validation)');
  try {
    // 1. A rota /api/info retorna catálogo oficial com id, preco e duracaoMin
    const infoRes = await makeRequest({ path: '/api/info', method: 'GET' });
    assert.strictEqual(infoRes.status, 200);
    const infoData = JSON.parse(infoRes.body);
    assert.ok(Array.isArray(infoData.servicos) && infoData.servicos.length >= 6);

    const servicoDegrade = infoData.servicos.find(s => s.id === 'corte-degrade');
    assert.ok(servicoDegrade, 'Corte degradê deve existir no catálogo oficial');
    assert.strictEqual(servicoDegrade.preco, 35.00, 'Preço oficial do corte degradê deve ser R$ 35,00');
    assert.strictEqual(servicoDegrade.duracaoMin, 40, 'Duração oficial do corte degradê deve ser 40 min');

    // 2. O servidor rejeita qualquer serviço inválido ou fraudulento (HTTP 400)
    const invalidServiceRes = await makeRequest({
      path: '/api/agendamentos',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({
      clienteNome: 'Teste Invalido',
      clienteTelefone: '21988887777',
      servicoId: 'servico_inexistente_fake',
      servico: 'Serviço Hacker Fake',
      data: '2099-10-20',
      horario: '10:00'
    }));
    assert.strictEqual(invalidServiceRes.status, 400, 'Serviço inexistente deve ser rejeitado com HTTP 400');
    const invalidJson = JSON.parse(invalidServiceRes.body);
    assert.strictEqual(invalidJson.success, false);

    // 3. Tentativa de manipulação de preço: mesmo enviando preco = 1.00, o servidor utiliza a fonte oficial (R$ 35,00)
    const testTamperRes = await makeRequest({
      path: '/api/agendamentos',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({
      clienteNome: 'Teste Auditoria Preco',
      clienteTelefone: '21988887777',
      servicoId: 'corte-degrade',
      servico: 'Corte Degradê / Fade Moderno',
      preco: 1.00, // Tentativa de fraude de preço
      duracaoMin: 10, // Tentativa de fraude de duração
      unidade: 'matriz',
      data: '2099-10-20',
      horario: '10:00'
    }));
    assert.strictEqual(testTamperRes.status, 201, 'Agendamento legítimo com corte degradê deve ser criado');
    const tamperJson = JSON.parse(testTamperRes.body);
    assert.strictEqual(tamperJson.agendamento.preco, 35.00, 'O servidor deve ignorar o preço do cliente e aplicar estritamente R$ 35,00');
    assert.strictEqual(tamperJson.agendamento.duracaoMin, 40, 'O servidor deve ignorar a duração do cliente e aplicar estritamente 40 min');

    // Limpeza imediata do registro de auditoria
    await db.deleteById(tamperJson.agendamento.id);

    console.log('  ✅ [TESTE 4 APROVADO] Preço e duração são validados exclusivamente pelo backend; manipulação no cliente é impossível.');
    testResults.push({ id: 4, name: 'Preço e duração', status: 'APROVADO' });
  } catch (err) {
    console.error('  ❌ [TESTE 4 REPROVADO]:', err.message);
    testResults.push({ id: 4, name: 'Preço e duração', status: 'REPROVADO', error: err.message });
  }

  // ----------------------------------------------------
  // TESTE 5: WhatsApp Comercial Oficial
  // ----------------------------------------------------
  console.log('\n▶ TESTE 5: Fluxo de Contato WhatsApp Oficial');
  try {
    const officialPhoneFormatted = '(21) 98215-6025';
    const officialPhoneIntl = '5521982156025';
    const officialWaLink = 'https://wa.me/5521982156025';

    // 1. Telefone exibido no rodapé da página
    assert.ok(indexHtml.includes(officialPhoneFormatted), `Telefone ${officialPhoneFormatted} deve estar no rodapé`);

    // 2. Link do WhatsApp no Header
    assert.ok(indexHtml.includes(`href="${officialWaLink}"`) && indexHtml.includes('btn-whatsapp'), 'Link WhatsApp do Header deve usar wa.me canônico');

    // 3. Botão Flutuante do WhatsApp
    assert.ok(indexHtml.includes(`href="${officialWaLink}"`) && indexHtml.includes('floating-whatsapp'), 'Botão flutuante deve apontar para o WhatsApp oficial');

    // 4. Configuração no backend (BARBEARIA_INFO)
    const infoRes = await makeRequest({ path: '/api/info', method: 'GET' });
    const infoData = JSON.parse(infoRes.body);
    assert.strictEqual(infoData.telefone, officialPhoneFormatted);
    assert.strictEqual(infoData.whatsapp, officialPhoneIntl);

    // 5. O link usa formato canônico internacional sem símbolos ou caracteres especiais
    assert.ok(!indexHtml.includes('wa.me/+55'), 'Link wa.me não deve conter caractere "+"');
    assert.ok(!indexHtml.includes('wa.me/55-21'), 'Link wa.me não deve conter hífen');
    assert.ok(!indexHtml.includes('wa.me/(21)'), 'Link wa.me não deve conter parênteses');

    console.log('  ✅ [TESTE 5 APROVADO] Número comercial (21) 98215-6025 e links wa.me/5521982156025 100% canônicos e válidos.');
    testResults.push({ id: 5, name: 'WhatsApp', status: 'APROVADO' });
  } catch (err) {
    console.error('  ❌ [TESTE 5 REPROVADO]:', err.message);
    testResults.push({ id: 5, name: 'WhatsApp', status: 'REPROVADO', error: err.message });
  }

  // ----------------------------------------------------
  // TESTE 6: Agendamento Completo, Regras Comerciais, Persistência e Limpeza
  // ----------------------------------------------------
  console.log('\n▶ TESTE 6: Fluxo de Agendamento Completo, Conflitos, Persistência e Limpeza');
  try {
    // 6a. Validação de Bloqueio de Dias Fechados: Sábado
    const sabadoRes = await makeRequest({
      path: '/api/agendamentos',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({
      clienteNome: 'Cliente Sabado Teste',
      clienteTelefone: '21988887777',
      servicoId: 'corte-social',
      data: '2099-10-24', // Sábado
      horario: '10:00'
    }));
    assert.strictEqual(sabadoRes.status, 422, 'Sábado deve ser bloqueado com HTTP 422');

    // 6b. Validação de Bloqueio de Dias Fechados: Domingo
    const domingoRes = await makeRequest({
      path: '/api/agendamentos',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({
      clienteNome: 'Cliente Domingo Teste',
      clienteTelefone: '21988887777',
      servicoId: 'corte-social',
      data: '2099-10-25', // Domingo
      horario: '10:00'
    }));
    assert.strictEqual(domingoRes.status, 422, 'Domingo deve ser bloqueado com HTTP 422');

    // 6c. Validação de Bloqueio de Dias Fechados: Segunda-feira
    const segundaRes = await makeRequest({
      path: '/api/agendamentos',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({
      clienteNome: 'Cliente Segunda Teste',
      clienteTelefone: '21988887777',
      servicoId: 'corte-social',
      data: '2099-10-26', // Segunda-feira
      horario: '10:00'
    }));
    assert.strictEqual(segundaRes.status, 422, 'Segunda-feira deve ser bloqueada com HTTP 422');

    // 6d. Validação de Bloqueio de Feriado Nacional: Tiradentes (21/04)
    const feriadoRes = await makeRequest({
      path: '/api/agendamentos',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({
      clienteNome: 'Cliente Feriado Teste',
      clienteTelefone: '21988887777',
      servicoId: 'corte-social',
      data: '2099-04-21', // Tiradentes
      horario: '10:00'
    }));
    assert.strictEqual(feriadoRes.status, 422, 'Feriado de Tiradentes deve ser bloqueado com HTTP 422');

    // 6e. Agendamento Legítimo Completo (Terça-feira útil: 2099-10-27)
    const validBookingRes = await makeRequest({
      path: '/api/agendamentos',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({
      clienteNome: 'Cliente Teste Auditoria',
      clienteTelefone: '21999990000',
      servicoId: 'combo-completo',
      servico: 'Combo Cabelo + Barba Completa',
      unidade: 'matriz',
      profissional: 'Joel (Fundador & Barbeiro Titular)',
      data: '2099-10-27',
      horario: '11:00',
      observacoes: 'Teste de auditoria sem dados reais de clientes'
    }));
    assert.strictEqual(validBookingRes.status, 201, 'Agendamento legítimo deve retornar HTTP 201');
    const validBookingJson = JSON.parse(validBookingRes.body);
    assert.strictEqual(validBookingJson.success, true);
    assert.ok(validBookingJson.agendamento.id.startsWith('JOEL-'), 'Protocolo oficial no formato JOEL-XXXX');
    const createdProtocolId = validBookingJson.agendamento.id;

    // Validação da Mensagem Canônica e Rica do WhatsApp
    assert.ok(validBookingJson.whatsappUrl.startsWith('https://wa.me/5521982156025?text='), 'URL canônica wa.me oficial com DDD e código internacional');
    const decodedWaText = decodeURIComponent(validBookingJson.whatsappUrl.split('?text=')[1]);
    assert.ok(decodedWaText.includes(`*Protocolo:* #${createdProtocolId}`), 'WhatsApp deve conter o protocolo');
    assert.ok(decodedWaText.includes('*Cliente:* Cliente Teste Auditoria'), 'WhatsApp deve conter o nome do cliente');
    assert.ok(decodedWaText.includes('*Serviço:* Combo Cabelo + Barba Completa'), 'WhatsApp deve conter o serviço selecionado');
    assert.ok(decodedWaText.includes('*Data:* 2099-10-27'), 'WhatsApp deve conter a data');
    assert.ok(decodedWaText.includes('*Horário:* 11:00'), 'WhatsApp deve conter o horário');
    assert.ok(decodedWaText.includes('*Valor Confirmado:* R$ 55.00'), 'WhatsApp deve conter o valor');
    assert.ok(decodedWaText.includes('*Endereço:* Unidade Matriz'), 'WhatsApp deve conter o endereço');

    // Validação da Camada de Abstração de Persistência Híbrida (Aliases canônicos)
    const dbFoundById = await db.findById(createdProtocolId);
    assert.ok(dbFoundById, 'db.findById() deve localizar o agendamento');
    assert.strictEqual(dbFoundById.id, createdProtocolId);

    const dbFindAll = await db.findAll({ data: '2099-10-27' });
    assert.ok(Array.isArray(dbFindAll) && dbFindAll.length > 0, 'db.findAll() deve retornar array de agendamentos');

    const dbUpdated = await db.update(createdProtocolId, 'confirmado');
    assert.ok(dbUpdated, 'db.update() deve atualizar o status com sucesso');

    // 6f. Prevenção de conflito de horário concorrente (Zero Double-Booking)
    const conflictBookingRes = await makeRequest({
      path: '/api/agendamentos',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({
      clienteNome: 'Segundo Cliente Mesmo Horario',
      clienteTelefone: '21988881111',
      servicoId: 'corte-social',
      unidade: 'matriz',
      data: '2099-10-27',
      horario: '11:00' // Horário exatamente igual na mesma unidade
    }));
    assert.strictEqual(conflictBookingRes.status, 409, 'Mesmo horário na mesma unidade deve ser rejeitado com HTTP 409 (Conflito)');
    const conflictJson = JSON.parse(conflictBookingRes.body);
    assert.strictEqual(conflictJson.conflict, true);

    // 6g. Confirmação que o agendamento aparece na consulta administrativa
    // Faz login administrativo
    const loginRes = await makeRequest({
      path: '/api/admin/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({ password: 'teste_admin_pass_seis_fluxos_123' }));
    assert.strictEqual(loginRes.status, 200);
    const { token } = JSON.parse(loginRes.body);

    const adminQueryRes = await makeRequest({
      path: `/api/admin/agendamentos?data=2099-10-27`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    assert.strictEqual(adminQueryRes.status, 200);
    const adminData = JSON.parse(adminQueryRes.body);
    const found = adminData.agendamentos.find(a => a.id === createdProtocolId);
    assert.ok(found, `O agendamento #${createdProtocolId} deve constar na consulta administrativa`);
    assert.strictEqual(found.clienteNome, 'Cliente Teste Auditoria');

    // 6h. Limpeza dos registros de teste sem afetar agendamentos legítimos
    const deleted = await db.deleteById(createdProtocolId);
    assert.strictEqual(deleted, true, 'Registro de teste deve ser removido com sucesso via deleteById');

    // Confirma que não está mais no banco
    const targetAfterDelete = await db.getById(createdProtocolId);
    assert.strictEqual(targetAfterDelete, null, 'O agendamento de teste não deve mais existir na base');

    console.log('  ✅ [TESTE 6 APROVADO] Agendamento completo, regras comerciais, prevenção de duplicidade, persistência e limpeza validados com excelência.');
    testResults.push({ id: 6, name: 'Agendamento completo', status: 'APROVADO' });
  } catch (err) {
    console.error('  ❌ [TESTE 6 REPROVADO]:', err.message);
    testResults.push({ id: 6, name: 'Agendamento completo', status: 'REPROVADO', error: err.message });
  }

  // Resumo final
  console.log('\n========================================================');
  console.log('📊 RESUMO DOS 6 FLUXOS AUDITADOS E HOMOLOGADOS:');
  console.log('========================================================');
  testResults.forEach(r => {
    console.log(`[Fluxo ${r.id}] ${r.name.padEnd(25)} : ${r.status}`);
  });
  console.log('========================================================\n');

  const allPassed = testResults.every(r => r.status === 'APROVADO');
  if (allPassed) {
    console.log('🎉 TODOS OS 6 FLUXOS FUNCIONAIS FORAM APROVADOS COM EVIDÊNCIA REPRODUZÍVEL!\n');
    process.exit(0);
  } else {
    console.error('❌ HOUVE FALHAS NA HOMOLOGAÇÃO DOS FLUXOS.');
    process.exit(1);
  }
}

runSixFlowTests().catch(err => {
  console.error('Erro catastrófico nos testes:', err);
  process.exit(1);
});
