import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const AGENDAMENTOS_FILE = path.join(DATA_DIR, 'agendamentos.json');

// Credenciais Administrativas
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Joel@1992';
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'joel_admin_token_secure_1992';

// Garante que o diretório e arquivo de dados existam com persistência atômica
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(AGENDAMENTOS_FILE)) {
  const tempPath = `${AGENDAMENTOS_FILE}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify([], null, 2), 'utf-8');
  fs.renameSync(tempPath, AGENDAMENTOS_FILE);
}

// Persistência Atômica Resiliente (JsonDB ACID: .tmp -> renameSync)
function saveAgendamentosAtomic(agendamentos) {
  const tempPath = `${AGENDAMENTOS_FILE}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(agendamentos, null, 2), 'utf-8');
  fs.renameSync(tempPath, AGENDAMENTOS_FILE);
}

function loadAgendamentos() {
  try {
    const raw = fs.readFileSync(AGENDAMENTOS_FILE, 'utf-8');
    return JSON.parse(raw || '[]');
  } catch (err) {
    console.error('Erro ao ler agendamentos.json:', err);
    return [];
  }
}

// Sanitização de entradas contra injeção e XSS
function sanitizeText(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .trim();
}

// Cabeçalhos de Segurança Padrão OWASP
function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
}

// Rate Limiting em Memória
const ipRequests = new Map();
function checkRateLimit(ip, limit = 80, windowMs = 60000) {
  const now = Date.now();
  const record = ipRequests.get(ip) || { count: 0, resetTime: now + windowMs };
  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + windowMs;
  } else {
    record.count++;
  }
  ipRequests.set(ip, record);
  return record.count <= limit;
}

// Autenticação de Administrador
function isAuthenticatedAdmin(req) {
  const authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7).trim();
  return token === ADMIN_SECRET;
}

// Helper para cálculo do CRC-16 / CCITT-FALSE (Padrão Oficial EMV Banco Central)
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

// Gerador oficial do payload PIX EMV Copia-e-Cola
function generatePixPayload({ pixKey, name = 'BARBEARIA DO JOEL', city = 'RIO DE JANEIRO', amount, txId = '***' }) {
  const formatField = (id, value) => {
    const len = String(value.length).padStart(2, '0');
    return `${id}${len}${value}`;
  };

  const merchantAccountInfo = [
    formatField('00', 'br.gov.bcb.pix'),
    formatField('01', pixKey)
  ].join('');

  const additionalDataField = formatField('05', txId);

  let payload = [
    formatField('00', '01'),
    formatField('26', merchantAccountInfo),
    formatField('52', '0000'),
    formatField('53', '986'), // BRL
    amount ? formatField('54', Number(amount).toFixed(2)) : '',
    formatField('58', 'BR'),
    formatField('59', name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 25)),
    formatField('60', city.normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 15)),
    formatField('62', additionalDataField),
    '6304'
  ].join('');

  const crcHex = calculateCRC16(payload);
  return payload + crcHex;
}

// Cálculo de slots de 30 minutos ocupados por um serviço (considerando duração)
function getOccupiedSlots(startTime, durationMinutes = 30) {
  const [h, m] = startTime.split(':').map(Number);
  const slots = [startTime];
  if (durationMinutes > 30) {
    const totalMin = h * 60 + m + 30;
    const nextH = Math.floor(totalMin / 60);
    const nextM = totalMin % 60;
    slots.push(`${String(nextH).padStart(2, '0')}:${String(nextM).padStart(2, '0')}`);
  }
  return slots;
}

// MIME types suportados
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp'
};

// Dados Oficiais da Barbearia
const BARBEARIA_INFO = {
  nome: 'Barbearia do Joel',
  fundacao: 1992,
  slogan: 'Desde 1992 oferecendo o melhor serviço da região',
  telefone: '(21) 98215-6025',
  whatsapp: '5521982156025',
  chavePix: '21982156025',
  enderecos: {
    matriz: {
      id: 'matriz',
      titulo: 'Unidade Matriz',
      logradouro: 'Rua Francisco Mota, 93',
      bairro: 'Campo Grande',
      cidade: 'Rio de Janeiro',
      uf: 'RJ',
      cep: '23013-630',
      mapsUrl: 'https://maps.google.com/?q=R.+Francisco+Mota,+93+-+Campo+Grande,+Rio+de+Janeiro+-+RJ'
    },
    filial: {
      id: 'filial',
      titulo: 'Unidade Filial',
      logradouro: 'Rua Alfredo Mariano, 24',
      bairro: 'Campo Grande',
      cidade: 'Rio de Janeiro',
      uf: 'RJ',
      mapsUrl: 'https://maps.google.com/?q=R.+Alfredo+Mariano,+24+-+Campo+Grande,+Rio+de+Janeiro+-+RJ'
    }
  },
  profissionais: [
    { id: 'joel', nome: 'Joel (Fundador & Barbeiro Titular)', unidades: ['matriz'] },
    { id: 'equipe', nome: 'Equipe Especializada da Casa', unidades: ['matriz', 'filial'] }
  ],
  horarios: {
    terca_a_sexta: { abre: '09:00', fecha: '19:00', descricao: '09:00 às 19:00' },
    sabado: { abre: '09:00', fecha: '18:00', descricao: '09:00 às 18:00' },
    segunda: { abre: null, fecha: null, descricao: 'Fechado' },
    domingo: { abre: null, fecha: null, descricao: 'Fechado' }
  },
  servicos: [
    { id: 'corte-social', nome: 'Corte Tradicional / Social', preco: 30.00, duracaoMin: 30, duracao: '30 min', desc: 'Tesoura e máquina, alinhamento clássico' },
    { id: 'corte-degrade', nome: 'Corte Degradê / Fade Moderno', preco: 35.00, duracaoMin: 40, duracao: '40 min', desc: 'Degradê na navalha ou máquina com transição perfeita' },
    { id: 'barba-terapia', nome: 'Barba Clássica & Barboterapia', preco: 25.00, duracaoMin: 30, duracao: '30 min', desc: 'Toalha quente, massagem facial e navalha afiada' },
    { id: 'combo-completo', nome: 'Combo Cabelo + Barboterapia', preco: 55.00, duracaoMin: 60, duracao: '60 min', desc: 'O pacote completo para sair no estilo' },
    { id: 'corte-infantil', nome: 'Corte Infantil (Kids)', preco: 30.00, duracaoMin: 30, duracao: '30 min', desc: 'Atendimento paciente e cuidadoso para os pequenos' },
    { id: 'sobrancelha', nome: 'Acabamento & Sobrancelha', preco: 15.00, duracaoMin: 15, duracao: '15 min', desc: 'Alinhamento na navalha ou pinça' },
    { id: 'pigmentacao', nome: 'Pigmentação de Barba / Cabelo', preco: 25.00, duracaoMin: 30, duracao: '30 min', desc: 'Disfarce de falhas e fios brancos com aspecto natural' }
  ]
};

// Servidor HTTP Principal
const server = http.createServer((req, res) => {
  applySecurityHeaders(res);

  const clientIp = req.socket.remoteAddress || '127.0.0.1';
  if (!checkRateLimit(clientIp, 120, 60000)) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Muitas requisições. Aguarde um minuto.' }));
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // 1. Health Check Obrigatório Padrão Luciano 24/7
  if (pathname === '/api/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      app: process.env.APP_NAME || 'Barbearia do Joel',
      version: '2.0.0',
      uptime_seconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // 2. Informações Gerais do Estabelecimento
  if (pathname === '/api/info' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(BARBEARIA_INFO));
    return;
  }

  // 3. Geração de PIX EMV Oficial para Sinal ou Total
  if (pathname === '/api/pix' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const amount = Math.max(1.00, Number(data.amount) || 15.00);
        const txId = (data.txId || `JOEL${Date.now().toString().slice(-6)}`).toUpperCase().replace(/[^A-Z0-9]/g, '');
        const payloadPix = generatePixPayload({
          pixKey: BARBEARIA_INFO.chavePix,
          name: 'BARBEARIA DO JOEL',
          city: 'RIO DE JANEIRO',
          amount: amount,
          txId: txId.slice(0, 25)
        });
        const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(payloadPix)}`;

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: true,
          txId,
          amount,
          chavePix: BARBEARIA_INFO.chavePix,
          beneficiario: 'Barbearia do Joel',
          cidade: 'Rio de Janeiro',
          payloadPix,
          qrCodeUrl,
          avisoComercial: 'Pagamento de sinal opcional. O valor é deduzido do serviço presencialmente.'
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Payload inválido.' }));
      }
    });
    return;
  }

  // 4. Listagem Pública de Horários Ocupados (sem expor dados pessoais dos clientes)
  if (pathname === '/api/agendamentos' && req.method === 'GET') {
    try {
      const dataQuery = parsedUrl.searchParams.get('data');
      const unidadeQuery = parsedUrl.searchParams.get('unidade') || 'matriz';
      const profissionalQuery = parsedUrl.searchParams.get('profissional');

      let agendamentos = loadAgendamentos().filter(a => a.status !== 'cancelado');

      if (dataQuery) {
        agendamentos = agendamentos.filter(a => a.data === dataQuery);
      }
      if (unidadeQuery) {
        agendamentos = agendamentos.filter(a => a.unidade === unidadeQuery);
      }
      if (profissionalQuery) {
        agendamentos = agendamentos.filter(a => a.profissional === profissionalQuery);
      }

      // Retorna apenas horários ocupados e slots expandidos por duração
      const slotsOcupados = [];
      agendamentos.forEach(a => {
        const s = getOccupiedSlots(a.horario, a.duracaoMin || 30);
        s.forEach(slot => {
          if (!slotsOcupados.includes(slot)) slotsOcupados.push(slot);
        });
      });

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: true,
        data: dataQuery,
        unidade: unidadeQuery,
        horariosOcupados: slotsOcupados,
        totalOcupados: slotsOcupados.length
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 5. Criação de Novo Agendamento com Validações Estritas
  if (pathname === '/api/agendamentos' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const ag = JSON.parse(body || '{}');

        // Validação de campos obrigatórios
        const nome = sanitizeText(ag.clienteNome);
        const telefone = sanitizeText(ag.clienteTelefone).replace(/\D/g, '');
        const servicoNome = sanitizeText(ag.servico);
        const data = sanitizeText(ag.data);
        const horario = sanitizeText(ag.horario);
        const unidade = (ag.unidade === 'filial') ? 'filial' : 'matriz';
        const profissional = sanitizeText(ag.profissional || 'Joel (Fundador & Barbeiro Titular)');
        const observacoes = sanitizeText(ag.observacoes || '');

        if (!nome || nome.length < 3) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Nome completo obrigatório (mínimo de 3 caracteres).' }));
          return;
        }

        if (!telefone || telefone.length < 10) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Telefone/WhatsApp válido com DDD obrigatório.' }));
          return;
        }

        if (!servicoNome || !data || !horario) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Serviço, data e horário são campos obrigatórios.' }));
          return;
        }

        // Validação de data não passada (considerando fuso UTC-3)
        const hojeObj = new Date();
        const hojeStr = hojeObj.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); // YYYY-MM-DD
        if (data < hojeStr) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'A data do agendamento não pode ser no passado.' }));
          return;
        }

        // Validação de dia da semana (Fechado aos Domingos e Segundas)
        const [ano, mes, dia] = data.split('-').map(Number);
        const dataObj = new Date(ano, mes - 1, dia, 12, 0, 0);
        const diaSemana = dataObj.getDay(); // 0 = Domingo, 1 = Segunda

        if (diaSemana === 0 || diaSemana === 1) {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'A barbearia não abre aos domingos e segundas-feiras. Atendimento de terça a sábado.' }));
          return;
        }

        // Validação de horário comercial
        const [horaNum, minNum] = horario.split(':').map(Number);
        const maxHora = (diaSemana === 6) ? 18 : 19;
        if (horaNum < 9 || horaNum > maxHora || (horaNum === maxHora && minNum > 0)) {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: `Horário fora do expediente. Terça a sexta: 09h às 19h. Sábado: 09h às 18h.` }));
          return;
        }

        // Busca serviço correspondente para obter preço e duração reais
        const servicoObj = BARBEARIA_INFO.servicos.find(s => s.nome.toLowerCase() === servicoNome.toLowerCase() || s.id === ag.servicoId);
        const precoReal = servicoObj ? servicoObj.preco : (ag.preco || 30.00);
        const duracaoMinReal = servicoObj ? servicoObj.duracaoMin : 30;

        // Calcula slots solicitados
        const slotsSolicitados = getOccupiedSlots(horario, duracaoMinReal);

        const agendamentos = loadAgendamentos();

        // Verificação Robusta de Conflito de Horário:
        // 1. Um mesmo profissional não pode ter dois agendamentos no mesmo horário (mesmo em unidades diferentes).
        // 2. Na mesma unidade e cadeira, não pode haver sobreposição de slots.
        const conflito = agendamentos.find(item => {
          if (item.status === 'cancelado') return false;
          if (item.data !== data) return false;

          const itemSlots = getOccupiedSlots(item.horario, item.duracaoMin || 30);
          const sobrepoe = slotsSolicitados.some(slot => itemSlots.includes(slot));
          if (!sobrepoe) return false;

          // Se for o mesmo profissional reservado
          if (item.profissional === profissional) return true;

          // Se for na mesma unidade com profissional indefinido ou mesmo barbeiro
          if (item.unidade === unidade && (item.profissional === profissional || profissional.includes('Joel'))) return true;

          return false;
        });

        if (conflito) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'O horário selecionado já está ocupado para este profissional. Por favor escolha outro horário.' }));
          return;
        }

        const novoId = `JOEL-${Date.now().toString().slice(-4)}`;
        const novoAgendamento = {
          id: novoId,
          clienteNome: nome,
          clienteTelefone: telefone,
          servico: servicoObj ? servicoObj.nome : servicoNome,
          preco: precoReal,
          duracaoMin: duracaoMinReal,
          unidade: unidade,
          unidadeTitulo: BARBEARIA_INFO.enderecos[unidade].titulo,
          unidadeEndereco: BARBEARIA_INFO.enderecos[unidade].logradouro,
          profissional: profissional,
          data: data,
          horario: horario,
          observacoes: observacoes,
          formaPagamento: ag.formaPagamento || 'No Local / PIX',
          status: 'confirmado',
          criadoEm: new Date().toISOString()
        };

        agendamentos.push(novoAgendamento);
        saveAgendamentosAtomic(agendamentos);

        // Gera texto formatado para envio direto via WhatsApp
        const whatsAppText = 
`💈 *NOVO AGENDAMENTO - BARBEARIA DO JOEL* 💈
📌 *Protocolo:* #${novoAgendamento.id}
👤 *Cliente:* ${novoAgendamento.clienteNome}
📞 *Telefone:* ${novoAgendamento.clienteTelefone}
✂️ *Serviço:* ${novoAgendamento.servico}
💰 *Valor:* R$ ${Number(novoAgendamento.preco).toFixed(2)}
🏢 *Unidade:* ${novoAgendamento.unidadeTitulo} (${novoAgendamento.unidadeEndereco})
💈 *Profissional:* ${novoAgendamento.profissional}
📅 *Data:* ${novoAgendamento.data}
⏰ *Horário:* ${novoAgendamento.horario}

_Agendamento registrado no site oficial!_`;

        const whatsappUrl = `https://wa.me/${BARBEARIA_INFO.whatsapp}?text=${encodeURIComponent(whatsAppText)}`;

        res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: true,
          agendamento: novoAgendamento,
          whatsappUrl,
          whatsappText: whatsAppText
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Erro interno ao processar agendamento.' }));
      }
    });
    return;
  }

  // 6. Cancelamento de Agendamento pelo Cliente (com Protocolo e Telefone)
  if (pathname === '/api/agendamentos/cancelar' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { id, telefone } = JSON.parse(body || '{}');
        if (!id || !telefone) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Protocolo e telefone do agendamento são obrigatórios.' }));
          return;
        }

        const agendamentos = loadAgendamentos();
        const limpaTel = telefone.replace(/\D/g, '');
        const target = agendamentos.find(a => a.id.toUpperCase() === id.trim().toUpperCase());

        if (!target) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Agendamento não encontrado com o protocolo informado.' }));
          return;
        }

        // Validação de segurança: últimos 4 dígitos do telefone devem bater
        const targetTel = target.clienteTelefone.replace(/\D/g, '');
        if (!targetTel.endsWith(limpaTel.slice(-4))) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Telefone informado não corresponde ao cadastro deste agendamento.' }));
          return;
        }

        if (target.status === 'cancelado') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Este agendamento já se encontra cancelado.' }));
          return;
        }

        target.status = 'cancelado';
        target.canceladoEm = new Date().toISOString();
        saveAgendamentosAtomic(agendamentos);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: true,
          message: 'Agendamento cancelado com sucesso. O horário foi liberado.',
          protocolo: target.id
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Erro ao processar cancelamento.' }));
      }
    });
    return;
  }

  // 7. Autenticação Administrativa (Login de Barbeiro/Gestor)
  if (pathname === '/api/admin/login' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { password } = JSON.parse(body || '{}');
        if (password === ADMIN_PASSWORD) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            success: true,
            token: ADMIN_SECRET,
            usuario: 'Administrador Barbearia do Joel'
          }));
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Senha incorreta.' }));
        }
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Requisição inválida.' }));
      }
    });
    return;
  }

  // 8. Consulta de Agendamentos Administrativa (Protegida)
  if (pathname === '/api/admin/agendamentos' && req.method === 'GET') {
    if (!isAuthenticatedAdmin(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Acesso não autorizado. Token ausente ou inválido.' }));
      return;
    }

    try {
      const dataQuery = parsedUrl.searchParams.get('data');
      const unidadeQuery = parsedUrl.searchParams.get('unidade');
      const statusQuery = parsedUrl.searchParams.get('status');

      let agendamentos = loadAgendamentos();

      if (dataQuery) agendamentos = agendamentos.filter(a => a.data === dataQuery);
      if (unidadeQuery) agendamentos = agendamentos.filter(a => a.unidade === unidadeQuery);
      if (statusQuery) agendamentos = agendamentos.filter(a => a.status === statusQuery);

      // Ordena decrescente por data e horário
      agendamentos.sort((a, b) => (b.data + b.horario).localeCompare(a.data + a.horario));

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: true,
        total: agendamentos.length,
        agendamentos
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 9. Atualização de Status Administrativa (Protegida: Concluído / Cancelado / Confirmado)
  if (pathname.startsWith('/api/admin/agendamentos/') && req.method === 'PATCH') {
    if (!isAuthenticatedAdmin(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Acesso não autorizado.' }));
      return;
    }

    const id = pathname.replace('/api/admin/agendamentos/', '').trim();
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { status } = JSON.parse(body || '{}');
        const statusValidos = ['confirmado', 'concluido', 'cancelado', 'aguardando_confirmacao'];
        if (!statusValidos.includes(status)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: `Status inválido. Permitidos: ${statusValidos.join(', ')}` }));
          return;
        }

        const agendamentos = loadAgendamentos();
        const item = agendamentos.find(a => a.id.toUpperCase() === id.toUpperCase());
        if (!item) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Agendamento não encontrado.' }));
          return;
        }

        item.status = status;
        item.atualizadoEm = new Date().toISOString();
        saveAgendamentosAtomic(agendamentos);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, agendamento: item }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 10. Resolução Universal e Resiliente de Arquivos Estáticos (Padrão Luciano)
  let targetFile = pathname;
  if (targetFile === '/' || targetFile === '') {
    targetFile = '/index.html';
  } else if (targetFile === '/admin') {
    targetFile = '/admin.html';
  } else if (targetFile === '/termos') {
    targetFile = '/termos.html';
  } else if (targetFile === '/privacidade') {
    targetFile = '/privacidade.html';
  }

  const cleanTarget = targetFile.startsWith('/') ? targetFile.slice(1) : targetFile;

  const candidatePaths = [
    path.join(__dirname, 'public', cleanTarget),
    path.join(__dirname, cleanTarget),
    path.join(process.cwd(), 'public', cleanTarget),
    path.join(process.cwd(), cleanTarget)
  ];

  const foundPath = candidatePaths.find(p => {
    try {
      return fs.existsSync(p) && fs.statSync(p).isFile();
    } catch {
      return false;
    }
  });

  if (foundPath) {
    const ext = path.extname(foundPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(foundPath).pipe(res);
    return;
  }

  // Fallback SPA para index.html se for navegação de página
  const fallbackCandidates = [
    path.join(__dirname, 'public', 'index.html'),
    path.join(__dirname, 'index.html'),
    path.join(process.cwd(), 'public', 'index.html')
  ];
  const fallbackPath = fallbackCandidates.find(p => fs.existsSync(p) && fs.statSync(p).isFile());

  if (fallbackPath && !pathname.startsWith('/api/')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(fallbackPath).pipe(res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Recurso não encontrado', path: pathname }));
});

server.listen(PORT, () => {
  console.log(`💈 Barbearia do Joel - Servidor rodando na porta ${PORT}`);
  console.log(`📡 Health Check disponível em: http://localhost:${PORT}/api/health`);
});
