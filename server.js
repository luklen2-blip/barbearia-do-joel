import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const AGENDAMENTOS_FILE = path.join(DATA_DIR, 'agendamentos.json');

// Garante que o diretório e arquivo de dados existam
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(AGENDAMENTOS_FILE)) {
  fs.writeFileSync(AGENDAMENTOS_FILE, JSON.stringify([], null, 2), 'utf-8');
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

// Dados da Barbearia
const BARBEARIA_INFO = {
  nome: 'Barbearia do Joel',
  fundacao: 1992,
  slogan: 'Desde 1992 oferecendo o melhor serviço da região',
  telefone: '(21) 98215-6025',
  whatsapp: '5521982156025',
  chavePix: '21982156025',
  enderecos: {
    matriz: {
      titulo: 'Unidade Matriz',
      logradouro: 'Rua Francisco Mota, 93',
      bairro: 'Campo Grande',
      cidade: 'Rio de Janeiro',
      uf: 'RJ',
      cep: '23013-630',
      mapsUrl: 'https://maps.google.com/?q=R.+Francisco+Mota,+93+-+Campo+Grande,+Rio+de+Janeiro+-+RJ'
    },
    filial: {
      titulo: 'Unidade Filial',
      logradouro: 'Rua Alfredo Mariano, 24',
      bairro: 'Campo Grande',
      cidade: 'Rio de Janeiro',
      uf: 'RJ',
      mapsUrl: 'https://maps.google.com/?q=R.+Alfredo+Mariano,+24+-+Campo+Grande,+Rio+de+Janeiro+-+RJ'
    }
  },
  horarios: {
    terca_a_sexta: '09:00 às 19:00',
    sabado: '09:00 às 18:00',
    segunda: 'Fechado',
    domingo: 'Fechado'
  },
  servicos: [
    { id: 'corte-social', nome: 'Corte Tradicional / Social', preco: 30.00, duracao: '30 min', desc: 'Tesoura e máquina, alinhamento clássico' },
    { id: 'corte-degrade', nome: 'Corte Degradê / Fade Moderno', preco: 35.00, duracao: '40 min', desc: 'Degradê na navalha ou máquina com transição perfeita' },
    { id: 'barba-terapia', nome: 'Barba Clássica & Barboterapia', preco: 25.00, duracao: '30 min', desc: 'Toalha quente, massagem facial e navalha afiada' },
    { id: 'combo-completo', nome: 'Combo Cabelo + Barboterapia', preco: 55.00, duracao: '60 min', desc: 'O pacote completo para sair no estilo' },
    { id: 'corte-infantil', nome: 'Corte Infantil (Kids)', preco: 30.00, duracao: '30 min', desc: 'Atendimento paciente e cuidadoso para os pequenos' },
    { id: 'sobrancelha', nome: 'Acabamento & Sobrancelha', preco: 15.00, duracao: '15 min', desc: 'Alinhamento na navalha ou pinça' },
    { id: 'pigmentacao', nome: 'Pigmentação de Barba / Cabelo', preco: 25.00, duracao: '30 min', desc: 'Disfarce de falhas e fios brancos com aspecto natural' }
  ]
};

// Servidor HTTP
const server = http.createServer((req, res) => {
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

  // 3. Geração de PIX EMV Oficial
  if (pathname === '/api/pix' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        const amount = Number(data.amount) || 15.00; // Valor padrão de sinal
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
          qrCodeUrl
        }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 4. Listagem de Agendamentos / Horários Ocupados
  if (pathname === '/api/agendamentos' && req.method === 'GET') {
    try {
      const dataQuery = parsedUrl.searchParams.get('data');
      const fileData = fs.readFileSync(AGENDAMENTOS_FILE, 'utf-8');
      let agendamentos = JSON.parse(fileData || '[]');
      if (dataQuery) {
        agendamentos = agendamentos.filter(a => a.data === dataQuery);
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: true,
        total: agendamentos.length,
        agendamentos: agendamentos.map(a => ({
          id: a.id,
          data: a.data,
          horario: a.horario,
          servico: a.servico,
          profissional: a.profissional
        }))
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
    req.on('end', () => {
      try {
        const ag = JSON.parse(body || '{}');
        if (!ag.clienteNome || !ag.clienteTelefone || !ag.servico || !ag.data || !ag.horario) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Campos obrigatórios ausentes.' }));
          return;
        }

        const fileData = fs.readFileSync(AGENDAMENTOS_FILE, 'utf-8');
        const agendamentos = JSON.parse(fileData || '[]');

        // Verifica conflito de horário no mesmo dia
        const conflito = agendamentos.find(item => item.data === ag.data && item.horario === ag.horario && item.status !== 'cancelado');
        if (conflito) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Horário já reservado por outro cliente. Por favor escolha outro horário.' }));
          return;
        }

        const novoId = `JOEL-${Date.now().toString().slice(-4)}`;
        const novoAgendamento = {
          id: novoId,
          clienteNome: ag.clienteNome.trim(),
          clienteTelefone: ag.clienteTelefone.trim(),
          servico: ag.servico,
          preco: ag.preco || 30.00,
          profissional: ag.profissional || 'Joel / Equipe',
          data: ag.data,
          horario: ag.horario,
          observacoes: (ag.observacoes || '').trim(),
          formaPagamento: ag.formaPagamento || 'No Local / PIX',
          status: 'confirmado',
          criadoEm: new Date().toISOString()
        };

        agendamentos.push(novoAgendamento);
        fs.writeFileSync(AGENDAMENTOS_FILE, JSON.stringify(agendamentos, null, 2), 'utf-8');

        // Gera texto formatado para envio direto via WhatsApp
        const whatsAppText = 
`💈 *NOVO AGENDAMENTO - BARBEARIA DO JOEL* 💈
📌 *Protocolo:* #${novoAgendamento.id}
👤 *Cliente:* ${novoAgendamento.clienteNome}
📞 *Telefone:* ${novoAgendamento.clienteTelefone}
✂️ *Serviço:* ${novoAgendamento.servico}
💰 *Valor:* R$ ${Number(novoAgendamento.preco).toFixed(2)}
📅 *Data:* ${novoAgendamento.data}
⏰ *Horário:* ${novoAgendamento.horario}
📍 *Local:* R. Francisco Mota, 93 - Campo Grande, RJ

_Agendamento realizado pelo site oficial!_`;

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
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // 6. Resolução Universal e Resiliente de Arquivos Estáticos (Padrão Luciano)
  let targetFile = pathname;
  if (targetFile === '/' || targetFile === '') {
    targetFile = '/index.html';
  } else if (targetFile === '/termos') {
    targetFile = '/termos.html';
  } else if (targetFile === '/privacidade') {
    targetFile = '/privacidade.html';
  }

  // Remove barra inicial para os caminhos de busca
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
