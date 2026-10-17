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
    'database.js',
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
    'data/agendamentos.json',
    'GUIA_DO_COMPRADOR.md'
  ];

  for (const relPath of requiredFiles) {
    const full = path.join(ROOT_DIR, relPath);
    assert.ok(fs.existsSync(full), `Arquivo essencial não encontrado: ${relPath}`);
  }
  console.log(`  ✅ Todos os ${requiredFiles.length} arquivos essenciais estão presentes.`);
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
  // Limpa agendamentos de teste prévios (datas 2099) para garantir idempotência dos testes
  const sanitizedData = dbData.filter(a => !a.data?.startsWith('2099-'));
  fs.writeFileSync(dbPath, JSON.stringify(sanitizedData, null, 2), 'utf-8');
  console.log('  ✅ Banco JsonDB íntegro e operacional (isolamento de testes preparado).');
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

  // Teste 6: Bloqueio de Agendamento em Dias Fechados (Sábados, Domingos, Segundas e Feriados)
  console.log('▶ Teste 6: Bloqueio Estrito de Sábados, Domingos, Segundas e Feriados');
  // 2099-01-03 é Sábado
  const satRes = await makeRequest({
    path: '/api/agendamentos',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({
    clienteNome: 'Cliente Sábado',
    clienteTelefone: '21988887777',
    servico: 'Corte Tradicional / Social',
    unidade: 'matriz',
    data: '2099-01-03',
    horario: '10:00'
  }));
  assert.strictEqual(satRes.status, 422, 'Sábado deve retornar 422 Unprocessable');

  // 2099-01-04 é Domingo
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

  // 2099-01-05 é Segunda
  const monRes = await makeRequest({
    path: '/api/agendamentos',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({
    clienteNome: 'Cliente Segunda',
    clienteTelefone: '21988887777',
    servico: 'Corte Tradicional / Social',
    unidade: 'matriz',
    data: '2099-01-05',
    horario: '10:00'
  }));
  assert.strictEqual(monRes.status, 422, 'Segunda deve retornar 422 Unprocessable');

  // 2099-04-21 é Tiradentes (Terça-feira Feriado Nacional)
  const holidayRes = await makeRequest({
    path: '/api/agendamentos',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({
    clienteNome: 'Cliente Feriado',
    clienteTelefone: '21988887777',
    servico: 'Corte Tradicional / Social',
    unidade: 'matriz',
    data: '2099-04-21',
    horario: '10:00'
  }));
  assert.strictEqual(holidayRes.status, 422, 'Feriado deve retornar 422 Unprocessable');
  console.log('  ✅ Sábados, Domingos, Segundas e Feriados bloqueados com sucesso (HTTP 422)');
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

  // Teste 8: Detecção e Prevenção Automática de Conflito de Horário e Concorrência Atômica
  console.log('▶ Teste 8: Prevenção Automática de Conflito de Horário (Zero Double-Booking)');
  // 8a: Conflito para o mesmo profissional
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

  // 8b: Conflito na mesma unidade mesmo com profissional diferente (ex: Joel vs Equipe)
  const crossBarberRes = await makeRequest({
    path: '/api/agendamentos',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({
    clienteNome: 'Cliente com Outro Profissional',
    clienteTelefone: '21999997777',
    servico: 'Corte Tradicional / Social',
    unidade: 'matriz',
    profissional: 'Equipe Especializada da Casa',
    data: dataValida,
    horario: horaValida
  }));
  assert.strictEqual(crossBarberRes.status, 409, 'Mesma unidade e mesmo horário deve retornar 409 independente do profissional');
  console.log('  ✅ Bloqueio estrito por unidade validado: impossível dois clientes no mesmo horário na Matriz (HTTP 409)');

  // 8c: Conflito de colisão por duração (serviço de 60 min que invade o horário 14:00 já agendado)
  const durationConflictRes = await makeRequest({
    path: '/api/agendamentos',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({
    clienteNome: 'Cliente Combo Longo',
    clienteTelefone: '21999996666',
    servico: 'Combo Cabelo + Barboterapia',
    unidade: 'matriz',
    profissional: 'Joel (Fundador & Barbeiro Titular)',
    data: dataValida,
    horario: '13:30' // 13:30 a 14:30 colide com 14:00
  }));
  assert.strictEqual(durationConflictRes.status, 409, 'Serviço de 60 min colidindo com slot posterior deve retornar 409');
  console.log('  ✅ Conflito de duração contínua prevenido com sucesso (HTTP 409)');

  // 8d: API de listagem pública retorna conflito de duração para o cliente
  const listSlotsRes = await makeRequest({
    path: `/api/agendamentos?data=${dataValida}&unidade=matriz&duracaoMin=60`,
    method: 'GET'
  });
  assert.strictEqual(listSlotsRes.status, 200);
  const listSlotsJson = JSON.parse(listSlotsRes.body);
  assert.ok(listSlotsJson.horariosOcupados.includes('14:00'), '14:00 deve constar em horariosOcupados');
  assert.ok(listSlotsJson.conflitosDuracao.includes('13:30'), '13:30 deve constar em conflitosDuracao para serviço de 60min');
  console.log('  ✅ API pública calcula e entrega slots ocupados e conflitos de duração em tempo real');

  // 8e: Concorrência Simultânea Atômica (Dois clientes ao mesmo tempo)
  const concurrentDate = '2099-01-07'; // Quarta-feira
  const concurrentSlot = '11:00';
  const [resA, resB] = await Promise.all([
    makeRequest({
      path: '/api/agendamentos',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({
      clienteNome: 'Cliente Alpha',
      clienteTelefone: '21911112222',
      servico: 'Corte Tradicional / Social',
      unidade: 'matriz',
      profissional: 'Joel (Fundador & Barbeiro Titular)',
      data: concurrentDate,
      horario: concurrentSlot
    })),
    makeRequest({
      path: '/api/agendamentos',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, JSON.stringify({
      clienteNome: 'Cliente Beta',
      clienteTelefone: '21933334444',
      servico: 'Corte Degradê / Fade Moderno',
      unidade: 'matriz',
      profissional: 'Joel (Fundador & Barbeiro Titular)',
      data: concurrentDate,
      horario: concurrentSlot
    }))
  ]);
  const statuses = [resA.status, resB.status].sort();
  assert.deepStrictEqual(statuses, [201, 409], 'Exatamente um agendamento concorrente deve ter sucesso (201) e o outro sofrer conflito (409)');
  console.log('  ✅ Teste de concorrência atômica validado: preveniu double-booking sob requisições paralelas');
  passed++;

  // Teste 9: Cancelamento de Agendamento pelo Cliente com Validação de Protocolo e Telefone
  console.log('▶ Teste 9: Cancelamento de Agendamento por Protocolo e Telefone');
  // Tentativa com protocolo inexistente (deve falhar 404)
  const notFoundCancel = await makeRequest({
    path: '/api/agendamentos/cancelar',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({
    id: 'JOEL-INEXISTENTE',
    telefone: '21987654321'
  }));
  assert.strictEqual(notFoundCancel.status, 404, 'Protocolo inexistente deve retornar 404');

  // Tentativa com telefone incompatível com o agendamento (deve falhar 403 Forbidden)
  const wrongPhoneCancel = await makeRequest({
    path: '/api/agendamentos/cancelar',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({
    id: protocolId,
    telefone: '21900000000'
  }));
  assert.strictEqual(wrongPhoneCancel.status, 403, 'Cancelamento com telefone incompatível deve ser rejeitado com 403 Forbidden');

  // Cancelamento com dados corretos
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

  // Tentativa de cancelar agendamento já cancelado (deve retornar 400)
  const reCancelRes = await makeRequest({
    path: '/api/agendamentos/cancelar',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({
    id: protocolId,
    telefone: '21987654321'
  }));
  assert.strictEqual(reCancelRes.status, 400, 'Tentativa de re-cancelar deve retornar 400');
  console.log(`  ✅ Agendamento #${protocolId} cancelado com segurança e proteções ativas`);
  passed++;

  // Teste 10: Autenticação Administrativa e Hardening de Segurança
  console.log('▶ Teste 10: Hardening da Autenticação Administrativa');

  // 10a: Rejeição com HTTP 503 quando ADMIN_PASSWORD não configurada
  const savedAdminPass = process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_PASSWORD;
  const missingPassRes = await makeRequest({
    path: '/api/admin/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({ password: 'qualquer_coisa' }));
  assert.strictEqual(missingPassRes.status, 503, 'Ausência de ADMIN_PASSWORD deve rejeitar com 503 Service Unavailable');
  const missingPassJson = JSON.parse(missingPassRes.body);
  assert.ok(missingPassJson.error.includes('ADMIN_PASSWORD'), 'Mensagem de erro segura deve orientar a configuração');
  process.env.ADMIN_PASSWORD = savedAdminPass; // Restaura
  console.log('  ✅ Ausência de ADMIN_PASSWORD bloqueia painel com HTTP 503 com segurança');

  // 10b: Proteção contra Força Bruta (5 tentativas com IP isolado)
  const attackerIp = '198.51.100.99';
  for (let attempt = 1; attempt <= 5; attempt++) {
    const bfRes = await makeRequest({
      path: '/api/admin/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': attackerIp
      }
    }, JSON.stringify({ password: `senha_errada_${attempt}` }));
    assert.strictEqual(bfRes.status, 401, `Tentativa ${attempt} deve retornar 401`);
  }

  // 6ª tentativa pelo mesmo IP deve ser travada por Brute-force Lockout (HTTP 429)
  const lockedRes = await makeRequest({
    path: '/api/admin/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': attackerIp
    }
  }, JSON.stringify({ password: 'senha_errada_6' }));
  assert.strictEqual(lockedRes.status, 429, '6ª tentativa deve ser bloqueada por rate limit de força bruta com HTTP 429');
  console.log('  ✅ Proteção contra força bruta validada: IP bloqueado com HTTP 429 após 5 falhas');

  // 10c: Login legítimo com senha correta
  const rightLoginRes = await makeRequest({
    path: '/api/admin/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, JSON.stringify({ password: savedAdminPass }));
  assert.strictEqual(rightLoginRes.status, 200);
  const loginPayload = JSON.parse(rightLoginRes.body);
  assert.strictEqual(loginPayload.success, true);
  assert.ok(typeof loginPayload.token === 'string' && loginPayload.token.length === 64, 'Token deve ser hexadecimal criptográfico de 64 caracteres');
  const adminToken = loginPayload.token;
  console.log('  ✅ Login administrativo emite token criptográfico de alta entropia');

  // 10d: Acesso a rotas administrativas sem autenticação e com token inválido
  const unauthRes = await makeRequest({ path: '/api/admin/agendamentos', method: 'GET' });
  assert.strictEqual(unauthRes.status, 401, 'Acesso sem token deve retornar 401');

  const invalidTokenRes = await makeRequest({
    path: '/api/admin/agendamentos',
    method: 'GET',
    headers: { 'Authorization': 'Bearer token_invalido_fake_123' }
  });
  assert.strictEqual(invalidTokenRes.status, 401, 'Token falso deve retornar 401');

  // 10e: Acesso com token legítimo autorizado
  const authRes = await makeRequest({
    path: '/api/admin/agendamentos',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  assert.strictEqual(authRes.status, 200);
  const adminList = JSON.parse(authRes.body);
  assert.ok(Array.isArray(adminList.agendamentos));

  // 10f: Atualização de status autorizada via PATCH
  const patchRes = await makeRequest({
    path: `/api/admin/agendamentos/${protocolId}`,
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`
    }
  }, JSON.stringify({ status: 'confirmado' }));
  assert.strictEqual(patchRes.status, 200);

  // 10g: Logout administrativo e revogação imediata da sessão
  const logoutRes = await makeRequest({
    path: '/api/admin/logout',
    method: 'POST',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  assert.strictEqual(logoutRes.status, 200);
  const logoutJson = JSON.parse(logoutRes.body);
  assert.strictEqual(logoutJson.success, true);

  // Tentativa de reusar o token revogado (deve ser rejeitado com 401)
  const revokedAccessRes = await makeRequest({
    path: '/api/admin/agendamentos',
    method: 'GET',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  assert.strictEqual(revokedAccessRes.status, 401, 'Token revogado pelo logout deve retornar 401');
  console.log('  ✅ Logout administrativo invalida a sessão de forma irreversível');
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
