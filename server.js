import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { db } from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;

// Inicializa banco de dados com isolamento e fallback para garantir inicialização ininterrupta
try {
  await db.init();
} catch (err) {
  console.error('⚠️ [Database] Erro ao inicializar banco de dados:', err.message);
}

// --- 1. SEGURANÇA E PROTEÇÃO CONTRA FORÇA BRUTA ---
// Rastreamento de tentativas de login por IP
const loginAttempts = new Map(); // ip -> { count: number, lockedUntil: number }
const activeSessions = new Map(); // token -> { createdAt: number, expiresAt: number, ip: string }

function checkBruteForce(ip) {
  const record = loginAttempts.get(ip);
  if (!record) return { allowed: true };

  const now = Date.now();
  if (record.lockedUntil && now < record.lockedUntil) {
    const remainingMinutes = Math.ceil((record.lockedUntil - now) / 60000);
    return { allowed: false, remainingMinutes };
  }

  // Se o tempo de bloqueio expirou, reseta o contador
  if (record.lockedUntil && now >= record.lockedUntil) {
    loginAttempts.delete(ip);
    return { allowed: true };
  }

  return { allowed: true };
}

function recordFailedLogin(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip) || { count: 0, lockedUntil: null };
  record.count++;

  // Bloqueio de 15 minutos após 5 tentativas incorretas
  if (record.count >= 5) {
    record.lockedUntil = now + (15 * 60 * 1000);
  }
  loginAttempts.set(ip, record);
  return record.count;
}

function clearFailedLogin(ip) {
  loginAttempts.delete(ip);
}

// Autenticação Baseada em Sessões Criptográficas Temporárias
function isAuthenticatedAdmin(req) {
  const authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7).trim();
  if (!token) return false;

  const session = activeSessions.get(token);
  if (!session) return false;

  const now = Date.now();
  if (now > session.expiresAt) {
    activeSessions.delete(token); // Sessão expirada
    return false;
  }

  return true;
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

// Rate Limiting Geral por IP
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

// Identificador Oficial de Feriados Nacionais e do Rio de Janeiro
function getFeriado(dataStr) {
  if (!dataStr || typeof dataStr !== 'string') return null;
  const [anoStr, mesStr, diaStr] = dataStr.split('-');
  const ano = parseInt(anoStr, 10);
  const mesDia = `${mesStr}-${diaStr}`;

  // Feriados Nacionais e do RJ de data fixa
  const fixos = {
    '01-01': 'Confraternização Universal (Ano Novo)',
    '01-20': 'São Sebastião (Padroeiro da Cidade do Rio de Janeiro)',
    '04-21': 'Tiradentes',
    '04-23': 'São Jorge (Feriado Estadual RJ)',
    '05-01': 'Dia do Trabalhador',
    '09-07': 'Independência do Brasil',
    '10-12': 'Nossa Senhora Aparecida (Padroeira do Brasil)',
    '11-02': 'Finados',
    '11-15': 'Proclamação da República',
    '11-20': 'Dia Nacional de Zumbi e Consciência Negra',
    '12-25': 'Natal'
  };

  if (fixos[mesDia]) return fixos[mesDia];

  // Cálculo astronômico da Páscoa (Algoritmo de Meeus/Butcher) para feriados móveis
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const pascoaMes = Math.floor((h + l - 7 * m + 114) / 31);
  const pascoaDia = ((h + l - 7 * m + 114) % 31) + 1;

  const dataPascoa = new Date(Date.UTC(ano, pascoaMes - 1, pascoaDia));

  const addDias = (dias) => {
    const d = new Date(dataPascoa.getTime() + (dias * 24 * 60 * 60 * 1000));
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${mm}-${dd}`;
  };

  const carnavalSeg = addDias(-48);
  const carnavalTer = addDias(-47);
  const quartaCinzas = addDias(-46);
  const sextaSanta = addDias(-2);
  const corpusChristi = addDias(60);

  if (mesDia === carnavalTer || mesDia === carnavalSeg) return 'Carnaval';
  if (mesDia === quartaCinzas) return 'Quarta-feira de Cinzas';
  if (mesDia === sextaSanta) return 'Sexta-feira Santa';
  if (mesDia === corpusChristi) return 'Corpus Christi';

  return null;
}

// Cálculo de slots de 30 minutos ocupados por um serviço
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
    sabado: { abre: null, fecha: null, descricao: 'Fechado' },
    domingo: { abre: null, fecha: null, descricao: 'Fechado' },
    segunda: { abre: null, fecha: null, descricao: 'Fechado' },
    feriados: { abre: null, fecha: null, descricao: 'Fechado' }
  },
  servicos: [
    { id: 'corte-social', nome: 'Corte Tradicional / Social', preco: 30.00, duracaoMin: 30, duracao: '30 min', desc: 'Tesoura e máquina, alinhamento clássico' },
    { id: 'corte-degrade', nome: 'Corte Degradê / Fade Moderno', preco: 35.00, duracaoMin: 40, duracao: '40 min', desc: 'Degradê na navalha ou máquina com transição perfeita' },
    { id: 'barba-terapia', nome: 'Barboterapia & Toalha Quente', preco: 25.00, duracaoMin: 30, duracao: '30 min', desc: 'Toalha quente, massagem facial e navalha afiada' },
    { id: 'combo-completo', nome: 'Combo Cabelo + Barba Completa', preco: 55.00, duracaoMin: 60, duracao: '60 min', desc: 'O pacote completo para sair no estilo' },
    { id: 'corte-infantil', nome: 'Corte Infantil (Kids)', preco: 30.00, duracaoMin: 30, duracao: '30 min', desc: 'Atendimento paciente e cuidadoso para os pequenos' },
    { id: 'sobrancelha', nome: 'Acabamento & Sobrancelha', preco: 15.00, duracaoMin: 20, duracao: '20 min', desc: 'Alinhamento na navalha ou pinça' },
    { id: 'pigmentacao', nome: 'Pigmentação / Camuflagem', preco: 25.00, duracaoMin: 30, duracao: '30 min', desc: 'Disfarce de falhas e fios brancos com aspecto natural' }
  ]
};

// Servidor HTTP Principal
const server = http.createServer(async (req, res) => {
  applySecurityHeaders(res);

  const clientIp = (req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'].split(',')[0].trim() : req.socket.remoteAddress) || '127.0.0.1';
  if (!checkRateLimit(clientIp, 120, 60000)) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'Muitas requisições. Aguarde um minuto.' }));
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // 1. Health Check Obrigatório Padrão Luciano 24/7 (Ultra-leve)
  if (pathname === '/api/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      status: 'ok',
      app: process.env.APP_NAME || 'Barbearia do Joel',
      version: '2.0.0',
      commit: process.env.RENDER_GIT_COMMIT || '4e7791e',
      uptime: Math.floor(process.uptime()),
      uptime_seconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      database: db.isPostgres ? 'postgresql' : 'jsondb',
      storage: {
        type: db.isPostgres ? 'postgresql' : 'jsondb',
        persistent: Boolean(db.isPostgres),
        status: db.isPostgres ? 'conectado' : 'fallback_efemero',
        alerta: db.isPostgres 
          ? null 
          : 'Armazenamento em JsonDB local (efêmero no Render Free). Para persistência permanente, configure DATABASE_URL no Render.'
      }
    }));
    return;
  }

  // 2. Informações Gerais do Estabelecimento
  if (pathname === '/api/info' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(BARBEARIA_INFO));
    return;
  }

  // 3. Geração de PIX EMV Oficial
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

  // 4. Listagem Pública de Horários Ocupados (sem dados pessoais - Prevenção Automática de Conflito)
  if (pathname === '/api/agendamentos' && req.method === 'GET') {
    try {
      const dataQuery = parsedUrl.searchParams.get('data');
      const unidadeQuery = parsedUrl.searchParams.get('unidade') || 'matriz';
      const profissionalQuery = parsedUrl.searchParams.get('profissional');
      const duracaoQuery = parseInt(parsedUrl.searchParams.get('duracaoMin') || '30', 10);

      const agendamentos = await db.getAll({ data: dataQuery });

      const slotsOcupados = [];
      agendamentos.forEach(a => {
        if (a.status === 'cancelado') return;

        // Se for na mesma unidade OU se envolver o fundador Joel OU o mesmo profissional
        const isSameUnit = (a.unidade === unidadeQuery);
        const isJoel = (a.profissional.includes('Joel') || (profissionalQuery && profissionalQuery.includes('Joel')));
        const isSameBarber = (profissionalQuery && a.profissional === profissionalQuery);

        if (isSameUnit || isJoel || isSameBarber) {
          const s = getOccupiedSlots(a.horario, a.duracaoMin || 30);
          s.forEach(slot => {
            if (!slotsOcupados.includes(slot)) slotsOcupados.push(slot);
          });
        }
      });

      // Identifica slots que causariam sobreposição caso o serviço solicitado dure mais de 30 min
      const conflitosDuracao = [];
      if (duracaoQuery > 30) {
        slotsOcupados.forEach(slot => {
          const [h, m] = slot.split(':').map(Number);
          const prevTotalMin = h * 60 + m - 30;
          if (prevTotalMin >= 9 * 60) {
            const prevH = Math.floor(prevTotalMin / 60);
            const prevM = prevTotalMin % 60;
            const prevSlot = `${String(prevH).padStart(2, '0')}:${String(prevM).padStart(2, '0')}`;
            if (!slotsOcupados.includes(prevSlot) && !conflitosDuracao.includes(prevSlot)) {
              conflitosDuracao.push(prevSlot);
            }
          }
        });
      }

      // Checa se a data é fim de semana, segunda ou feriado
      let fechado = false;
      let motivoFechado = null;
      if (dataQuery) {
        const [y, m, d] = dataQuery.split('-').map(Number);
        const dayOfWeek = new Date(y, m - 1, d, 12, 0, 0).getDay();
        const feriado = getFeriado(dataQuery);
        if (dayOfWeek === 6) {
          fechado = true;
          motivoFechado = 'Fechado aos sábados. Atendimento de terça a sexta-feira.';
        } else if (dayOfWeek === 0) {
          fechado = true;
          motivoFechado = 'Fechado aos domingos. Atendimento de terça a sexta-feira.';
        } else if (dayOfWeek === 1) {
          fechado = true;
          motivoFechado = 'Fechado às segundas-feiras. Atendimento de terça a sexta-feira.';
        } else if (feriado) {
          fechado = true;
          motivoFechado = `Fechado no feriado: ${feriado}.`;
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: true,
        data: dataQuery,
        unidade: unidadeQuery,
        duracaoMin: duracaoQuery,
        fechado,
        motivoFechado,
        horariosOcupados: slotsOcupados,
        conflitosDuracao: conflitosDuracao,
        totalOcupados: slotsOcupados.length
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 5. Criação de Novo Agendamento
  if (pathname === '/api/agendamentos' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const ag = JSON.parse(body || '{}');

        const nome = sanitizeText(ag.clienteNome);
        const telefone = sanitizeText(ag.clienteTelefone).replace(/\D/g, '');
        const servicoNome = sanitizeText(ag.servico || ag.servicoId);
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

        // Validação de data não retroativa
        const hojeObj = new Date();
        const hojeStr = hojeObj.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
        if (data < hojeStr) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'A data do agendamento não pode ser no passado.' }));
          return;
        }

        // Validação de dia da semana e feriados (Fechado aos Sábados, Domingos, Segundas e Feriados)
        const [ano, mes, dia] = data.split('-').map(Number);
        const dataObj = new Date(ano, mes - 1, dia, 12, 0, 0);
        const diaSemana = dataObj.getDay();

        if (diaSemana === 0 || diaSemana === 1 || diaSemana === 6) {
          res.writeHead(422, { 'Content-Type': 'application/json; charset=utf-8' });
          const diaNome = (diaSemana === 6) ? 'aos sábados' : (diaSemana === 0 ? 'aos domingos' : 'às segundas-feiras');
          res.end(JSON.stringify({
            success: false,
            error: `A barbearia não abre ${diaNome}. Atendimento exclusivo de terça a sexta-feira, das 09:00 às 19:00.`
          }));
          return;
        }

        const feriadoNome = getFeriado(data);
        if (feriadoNome) {
          res.writeHead(422, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            success: false,
            error: `A barbearia não abre em feriados (${feriadoNome}). Atendimento de terça a sexta-feira em dias úteis.`
          }));
          return;
        }

        // Validação de horário comercial (Terça a Sexta: 09:00 às 19:00)
        const [horaNum, minNum] = horario.split(':').map(Number);
        const maxHora = 19;
        if (horaNum < 9 || horaNum > maxHora || (horaNum === maxHora && minNum > 0)) {
          res.writeHead(422, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, error: 'Horário fora do expediente (09:00 às 19:00).' }));
          return;
        }

        // 1. Busca exata prioritária por servicoId ou nome oficial
        let servicoObj = BARBEARIA_INFO.servicos.find(s => 
          (ag.servicoId && s.id === ag.servicoId) ||
          (servicoNome && s.nome.toLowerCase() === servicoNome.toLowerCase()) ||
          (servicoNome && s.id.toLowerCase() === servicoNome.toLowerCase())
        );

        // 2. Fallback semântico desambiguado para nomes legados ou parciais
        if (!servicoObj && servicoNome) {
          const sLower = servicoNome.toLowerCase();
          if (sLower.includes('combo')) {
            servicoObj = BARBEARIA_INFO.servicos.find(s => s.id === 'combo-completo');
          } else if (sLower.includes('barba') || sLower.includes('barboterapia')) {
            servicoObj = BARBEARIA_INFO.servicos.find(s => s.id === 'barba-terapia');
          } else if (sLower.includes('degradê') || sLower.includes('degrade') || sLower.includes('fade')) {
            servicoObj = BARBEARIA_INFO.servicos.find(s => s.id === 'corte-degrade');
          } else if (sLower.includes('infantil') || sLower.includes('kids')) {
            servicoObj = BARBEARIA_INFO.servicos.find(s => s.id === 'corte-infantil');
          } else if (sLower.includes('sobrancelha')) {
            servicoObj = BARBEARIA_INFO.servicos.find(s => s.id === 'sobrancelha');
          } else if (sLower.includes('pigmentação') || sLower.includes('pigmentacao') || sLower.includes('camuflagem')) {
            servicoObj = BARBEARIA_INFO.servicos.find(s => s.id === 'pigmentacao');
          } else if (sLower.includes('social') || sLower.includes('tradicional') || sLower.includes('corte')) {
            servicoObj = BARBEARIA_INFO.servicos.find(s => s.id === 'corte-social');
          }
        }

        if (!servicoObj) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, error: 'Serviço selecionado inválido ou não cadastrado.' }));
          return;
        }

        // Preço e duração são estritamente determinados pelo catálogo do servidor (fonte única da verdade)
        const precoReal = servicoObj.preco;
        const duracaoMinReal = servicoObj.duracaoMin;

        const slotsSolicitados = getOccupiedSlots(horario, duracaoMinReal);

        const novoId = `JOEL-${Date.now().toString().slice(-4)}`;
        const novoAgendamento = {
          id: novoId,
          clienteNome: nome,
          clienteTelefone: telefone,
          servico: servicoObj.nome,
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

        const result = await db.create(novoAgendamento, slotsSolicitados);

        if (result.conflict) {
          res.writeHead(409, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            success: false,
            conflict: true,
            error: 'O horário selecionado já foi reservado por outro cliente nesta unidade. Por favor, escolha outro horário disponível na lista.'
          }));
          return;
        }

        const whatsAppText = 
`💈 *AGENDAMENTO CONFIRMADO - BARBEARIA DO JOEL* 💈
📌 *Protocolo:* #${novoAgendamento.id}
👤 *Cliente:* ${novoAgendamento.clienteNome}
📞 *WhatsApp:* ${novoAgendamento.clienteTelefone}
✂️ *Serviço:* ${novoAgendamento.servico}
📅 *Data:* ${novoAgendamento.data}
⏰ *Horário:* ${novoAgendamento.horario}
💰 *Valor Confirmado:* R$ ${Number(novoAgendamento.preco).toFixed(2)}
📍 *Endereço:* ${novoAgendamento.unidadeTitulo} (${novoAgendamento.unidadeEndereco})
💈 *Profissional:* ${novoAgendamento.profissional}

_Por favor, confirme o recebimento do meu agendamento!_`;

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
    req.on('end', async () => {
      try {
        const { id, telefone } = JSON.parse(body || '{}');
        if (!id || !telefone) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Protocolo e telefone são obrigatórios.' }));
          return;
        }

        const target = await db.getById(id);
        if (!target) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Agendamento não encontrado com o protocolo informado.' }));
          return;
        }

        const limpaTel = telefone.replace(/\D/g, '');
        const targetTel = target.clienteTelefone.replace(/\D/g, '');
        const matchExact = limpaTel === targetTel;
        const matchSuffix = limpaTel.length >= 8 && targetTel.endsWith(limpaTel);
        const matchPrefix = targetTel.length >= 8 && limpaTel.endsWith(targetTel);
        if (!matchExact && !matchSuffix && !matchPrefix) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Telefone informado não corresponde ao cadastro deste agendamento.' }));
          return;
        }

        if (target.status === 'cancelado') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Este agendamento já se encontra cancelado.' }));
          return;
        }

        await db.updateStatus(target.id, 'cancelado', { canceladoEm: new Date().toISOString() });

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: true,
          message: 'Agendamento cancelado com sucesso. O horário foi liberado.',
          protocolo: target.id
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Requisição inválida.' }));
      }
    });
    return;
  }

  // 6b. Consulta Segura de Agendamento pelo Cliente (com Protocolo e Telefone)
  if (pathname === '/api/agendamentos/consultar' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { id, telefone } = JSON.parse(body || '{}');
        if (!id || !telefone) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Protocolo e telefone são obrigatórios.' }));
          return;
        }

        const target = await db.getById(id);
        if (!target) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Agendamento não encontrado com o protocolo informado.' }));
          return;
        }

        const limpaTel = telefone.replace(/\D/g, '');
        const targetTel = target.clienteTelefone.replace(/\D/g, '');
        const matchExact = limpaTel === targetTel;
        const matchSuffix = limpaTel.length >= 8 && targetTel.endsWith(limpaTel);
        const matchPrefix = targetTel.length >= 8 && limpaTel.endsWith(targetTel);
        if (!matchExact && !matchSuffix && !matchPrefix) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Telefone informado não corresponde ao cadastro deste agendamento.' }));
          return;
        }

        // Sanitização de privacidade: protege dados sensíveis de outros clientes
        const partesNome = (target.clienteNome || '').split(' ');
        const nomeMascarado = partesNome.map((p, idx) => idx === 0 ? p : (p[0] ? p[0] + '***' : '')).join(' ');

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: true,
          agendamento: {
            id: target.id,
            clienteNome: nomeMascarado,
            servico: target.servico,
            preco: target.preco,
            duracaoMin: target.duracaoMin,
            unidade: target.unidade,
            unidadeTitulo: target.unidadeTitulo,
            unidadeEndereco: target.unidadeEndereco,
            profissional: target.profissional,
            data: target.data,
            horario: target.horario,
            status: target.status,
            criadoEm: target.criadoEm,
            canceladoEm: target.canceladoEm || null
          }
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Requisição inválida.' }));
      }
    });
    return;
  }

  // 7. Autenticação Administrativa com Proteção contra Força Bruta
  if (pathname === '/api/admin/login' && req.method === 'POST') {
    // 7a. Verifica se a variável de ambiente obrigatória ADMIN_PASSWORD está configurada
    if (!process.env.ADMIN_PASSWORD) {
      console.error('[Segurança] Login administrativo rejeitado: Variável ADMIN_PASSWORD não configurada no ambiente.');
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: 'Acesso administrativo desativado. A variável ADMIN_PASSWORD deve ser configurada no ambiente de produção.'
      }));
      return;
    }

    // 7b. Proteção contra força bruta
    const bruteCheck = checkBruteForce(clientIp);
    if (!bruteCheck.allowed) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        error: `Muitas tentativas incorretas. Acesso bloqueado temporariamente por ${bruteCheck.remainingMinutes} minuto(s).`
      }));
      return;
    }

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { password } = JSON.parse(body || '{}');

        // Comparação segura em tempo constante para mitigar timing attacks (com trim para evitar espaços acidentais)
        const expected = String(process.env.ADMIN_PASSWORD || '').trim();
        const input = String(password || '').trim();
        const expectedBuffer = Buffer.from(expected, 'utf-8');
        const inputBuffer = Buffer.from(input, 'utf-8');

        let isMatch = false;
        if (expectedBuffer.length === inputBuffer.length && expectedBuffer.length > 0) {
          isMatch = crypto.timingSafeEqual(expectedBuffer, inputBuffer);
        }

        if (isMatch) {
          clearFailedLogin(clientIp);

          // Gera token criptográfico aleatório dinâmico para a sessão
          const sessionToken = crypto.randomBytes(32).toString('hex');
          const now = Date.now();
          const expiresAt = now + (8 * 60 * 60 * 1000); // 8 horas de validade

          activeSessions.set(sessionToken, {
            createdAt: now,
            expiresAt,
            ip: clientIp
          });

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            success: true,
            token: sessionToken,
            usuario: 'Administrador Barbearia do Joel',
            expiresIn: 28800
          }));
        } else {
          const attempts = recordFailedLogin(clientIp);
          const remainingAttempts = Math.max(0, 5 - attempts);
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: remainingAttempts > 0 
              ? `Senha incorreta. ${remainingAttempts} tentativa(s) restante(s) antes do bloqueio temporário.` 
              : 'Limite de tentativas excedido. Acesso bloqueado temporariamente por 15 minutos.'
          }));
        }
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Requisição inválida.' }));
      }
    });
    return;
  }

  // 8. Logout Administrativo (Revogação Imediata da Sessão)
  if (pathname === '/api/admin/logout' && req.method === 'POST') {
    const authHeader = req.headers['authorization'] || '';
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      activeSessions.delete(token);
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true, message: 'Sessão administrativa encerrada com sucesso.' }));
    return;
  }

  // 9. Consulta Administrativa de Agendamentos (Protegida por Token de Sessão)
  if (pathname === '/api/admin/agendamentos' && req.method === 'GET') {
    if (!isAuthenticatedAdmin(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Acesso não autorizado. Sessão inválida ou expirada.' }));
      return;
    }

    try {
      const dataQuery = parsedUrl.searchParams.get('data');
      const unidadeQuery = parsedUrl.searchParams.get('unidade');
      const statusQuery = parsedUrl.searchParams.get('status');

      const filtros = {};
      if (dataQuery) filtros.data = dataQuery;
      if (unidadeQuery) filtros.unidade = unidadeQuery;
      if (statusQuery) filtros.status = statusQuery;

      const agendamentos = await db.getAll(filtros);

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

  // 9b. Exportação Segura de Backup da Base de Agendamentos (Protegida)
  if (pathname === '/api/admin/backup' && req.method === 'GET') {
    if (!isAuthenticatedAdmin(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Acesso não autorizado. Sessão administrativa necessária.' }));
      return;
    }
    try {
      const agendamentos = await db.getAll();
      const exportPayload = JSON.stringify({
        geradoEm: new Date().toISOString(),
        sistema: 'Barbearia do Joel',
        versao: '2.0.0',
        total: agendamentos.length,
        armazenamento: db.isPostgres ? 'postgresql' : 'jsondb',
        agendamentos
      }, null, 2);

      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="backup-agendamentos-${new Date().toISOString().slice(0, 10)}.json"`
      });
      res.end(exportPayload);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Falha ao gerar backup.' }));
    }
    return;
  }

  // 10. Atualização de Status Administrativa (Protegida)
  if (pathname.startsWith('/api/admin/agendamentos/') && req.method === 'PATCH') {
    if (!isAuthenticatedAdmin(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Acesso não autorizado.' }));
      return;
    }

    const id = pathname.replace('/api/admin/agendamentos/', '').trim();
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { status } = JSON.parse(body || '{}');
        const statusValidos = ['confirmado', 'concluido', 'cancelado', 'aguardando_confirmacao'];
        if (!statusValidos.includes(status)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: `Status inválido. Permitidos: ${statusValidos.join(', ')}` }));
          return;
        }

        const updated = await db.updateStatus(id, status);
        if (!updated) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Agendamento não encontrado.' }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, agendamento: updated }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 11. Resolução Universal e Resiliente de Arquivos Estáticos (Padrão Luciano)
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

  // Fallback SPA
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
  initSelfPing();
});

// --- 11. MECANISMO DE PREVENÇÃO DE COLD START (KEEP-ALIVE) ---
function initSelfPing() {
  if (process.env.ENABLE_SELF_PING !== 'true') return;

  const targetUrl = process.env.SELF_PING_URL || 'https://barbearia-do-joel.onrender.com/api/health';
  const intervalMinutes = Math.max(1, parseInt(process.env.PING_INTERVAL_MINUTES || '10', 10));
  const intervalMs = intervalMinutes * 60 * 1000;

  console.log(`⏱️ [Keep-Alive] Self-ping ativo a cada ${intervalMinutes} min para ${targetUrl}`);

  const pingTimer = setInterval(() => {
    try {
      const client = targetUrl.startsWith('https') ? https : http;
      client.get(targetUrl, (res) => {
        res.on('data', () => {});
        res.on('end', () => {
          if (res.statusCode === 200) {
            console.log(`💓 [Keep-Alive] Ping executado com sucesso (${new Date().toISOString()})`);
          } else {
            console.warn(`⚠️ [Keep-Alive] Ping retornou status HTTP ${res.statusCode}`);
          }
        });
      }).on('error', (err) => {
        console.error(`⚠️ [Keep-Alive] Erro na requisição do ping:`, err.message);
      });
    } catch (err) {
      console.error(`⚠️ [Keep-Alive] Falha ao disparar self-ping:`, err.message);
    }
  }, intervalMs);

  if (pingTimer.unref) pingTimer.unref();
}
