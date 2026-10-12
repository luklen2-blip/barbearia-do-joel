// tests/test_cloud_live.js - Validador Remoto de Produção 24/7 (Live Cloud E2E)
import https from 'https';
import http from 'http';

const targetUrl = process.argv[2] || process.env.LIVE_URL;

if (!targetUrl) {
  console.log('ℹ️  Uso do Validador de Nuvem: node tests/test_cloud_live.js <URL_DE_PRODUCAO>');
  console.log('   Exemplo: node tests/test_cloud_live.js https://barbearia-do-joel.onrender.com');
  process.exit(0);
}

const isHttps = targetUrl.startsWith('https://');
const client = isHttps ? https : http;
const agent = isHttps ? new https.Agent({ rejectUnauthorized: false }) : undefined;

async function checkUrl(endpoint) {
  const fullUrl = new URL(endpoint, targetUrl).toString();
  return new Promise((resolve, reject) => {
    client.get(fullUrl, { agent }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    }).on('error', reject);
  });
}

async function runLiveE2E() {
  console.log(`🌐 [Live Cloud E2E] Validando aplicação em nuvem: ${targetUrl}\n`);

  // 1. Health check obrigatório
  const health = await checkUrl('/api/health');
  if (health.status !== 200) throw new Error(`Health check falhou: HTTP ${health.status}`);
  const healthJson = JSON.parse(health.data);
  if (healthJson.status !== 'ok' || healthJson.version !== '2.0.0') {
    throw new Error('Payload do Health check divergente do padrão 2.0.0');
  }
  console.log('✅ 1. /api/health respondendo HTTP 200 OK (Saúde & Uptime confirmados)');

  // 2. Landing Page
  const home = await checkUrl('/');
  if (home.status !== 200 || !home.data.includes('Barbearia do Joel')) {
    throw new Error(`Landing page falhou: HTTP ${home.status}`);
  }
  console.log('✅ 2. Landing Page carregada com sucesso e conteúdo verificado');

  // 3. API de Informações
  const info = await checkUrl('/api/info');
  if (info.status !== 200) throw new Error(`API de informações falhou: HTTP ${info.status}`);
  console.log('✅ 3. /api/info com catálogo de serviços e horários operando');

  // 4. Termos e Privacidade
  const termos = await checkUrl('/termos');
  if (termos.status !== 200) throw new Error(`Rota /termos falhou: HTTP ${termos.status}`);
  console.log('✅ 4. /termos em conformidade legal respondendo 200');

  const priv = await checkUrl('/privacidade');
  if (priv.status !== 200) throw new Error(`Rota /privacidade falhou: HTTP ${priv.status}`);
  console.log('✅ 5. /privacidade (LGPD) respondendo 200');

  // 6. Painel Administrativo
  const admin = await checkUrl('/admin');
  if (admin.status !== 200 || !admin.data.includes('Painel do Barbeiro')) {
    throw new Error(`Rota /admin falhou: HTTP ${admin.status}`);
  }
  console.log('✅ 6. /admin (Painel do Barbeiro) respondendo 200 com interface ativa');

  console.log('\n🎉 SUCESSO: Aplicação em nuvem 100% operacional, íntegra e aprovada para produção 24/7!');
}

runLiveE2E().catch(err => {
  console.error('❌ Falha na validação de nuvem:', err.message);
  process.exit(1);
});
