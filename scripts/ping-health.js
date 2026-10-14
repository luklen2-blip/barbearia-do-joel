#!/usr/bin/env node
// scripts/ping-health.js - Utilitário Keep-Alive e Health Check para Prevenção de Cold Start
import https from 'https';
import http from 'http';

const targetUrl = process.argv[2] || process.env.SELF_PING_URL || 'https://barbearia-do-joel.onrender.com/api/health';
console.log(`📡 [Keep-Alive] Disparando ping de saúde para: ${targetUrl}...`);

const start = Date.now();
const client = targetUrl.startsWith('https') ? https : http;

const req = client.get(targetUrl, {
  rejectUnauthorized: false,
  headers: {
    'User-Agent': 'BarbeariaDoJoel-KeepAlive/2.0'
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    const elapsed = Date.now() - start;
    console.log(`⏱️ Tempo de resposta: ${elapsed}ms`);
    console.log(`📊 Status HTTP: ${res.statusCode} ${res.statusMessage}`);

    try {
      const json = JSON.parse(body);
      console.log('✅ Payload recebido com sucesso:');
      console.log(`   - Status: ${json.status}`);
      console.log(`   - Aplicação: ${json.app}`);
      console.log(`   - Versão: ${json.version}`);
      console.log(`   - Uptime: ${json.uptime_seconds || json.uptime}s`);
      console.log(`   - Banco: ${json.database}`);
      console.log(`   - Timestamp: ${json.timestamp}`);
      process.exit(res.statusCode === 200 ? 0 : 1);
    } catch {
      console.log('📄 Resposta bruta:', body.slice(0, 200));
      process.exit(res.statusCode === 200 ? 0 : 1);
    }
  });
});

const timeoutSec = parseInt(process.env.PING_TIMEOUT_SECONDS || '60', 10);
req.setTimeout(timeoutSec * 1000, () => {
  req.destroy(new Error(`Timeout de ${timeoutSec}s aguardando resposta da instância`));
});

req.on('error', (err) => {
  console.error(`❌ Falha de conexão: ${err.message}`);
  process.exit(1);
});
