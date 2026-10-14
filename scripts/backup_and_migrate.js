// scripts/backup_and_migrate.js - Backup Local e Migração Idempotente para PostgreSQL
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pg from 'pg';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const DATA_DIR = path.join(ROOT_DIR, 'data');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const AGENDAMENTOS_FILE = path.join(DATA_DIR, 'agendamentos.json');

function calculateHash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function runBackupAndMigrate() {
  console.log('🛡️ ========================================================');
  console.log('📦 [Barbearia do Joel] Procedimento de Backup e Migração');
  console.log('🛡️ ========================================================\n');

  // 1. Identificação da Origem dos Dados
  if (!fs.existsSync(AGENDAMENTOS_FILE)) {
    console.error('❌ Arquivo data/agendamentos.json não encontrado!');
    process.exit(1);
  }

  const rawJson = fs.readFileSync(AGENDAMENTOS_FILE, 'utf8');
  const agendamentos = JSON.parse(rawJson || '[]');
  console.log(`📁 Origem dos Dados: ${AGENDAMENTOS_FILE}`);
  console.log(`📊 Total de Registros Existentes: ${agendamentos.length}`);

  // 2. Backup Byte a Byte com Verificação SHA-256
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `agendamentos_backup_${timestamp}.json`;
  const backupFilePath = path.join(BACKUPS_DIR, backupFileName);

  fs.copyFileSync(AGENDAMENTOS_FILE, backupFilePath);

  const hashOriginal = calculateHash(AGENDAMENTOS_FILE);
  const hashBackup = calculateHash(backupFilePath);

  if (hashOriginal !== hashBackup) {
    console.error('❌ Falha de integridade: Hash SHA-256 do backup não confere com o original!');
    process.exit(1);
  }

  console.log(`✅ Backup seguro gerado com sucesso:`);
  console.log(`   Arquivo: data/backups/${backupFileName}`);
  console.log(`   Integridade SHA-256: ${hashBackup}\n`);

  // 3. Verificação de DATABASE_URL
  const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_URL;

  if (!connectionString) {
    console.log('⚠️ [Aviso de Persistência]:');
    console.log('   Variável DATABASE_URL não encontrada no ambiente atual.');
    console.log('   O backup local está garantido e intacto.');
    console.log('   Para executar a migração para a nuvem permanente:');
    console.log('   1. Configure DATABASE_URL no Render (ou passe via terminal).');
    console.log('   2. Execute: node scripts/backup_and_migrate.js');
    console.log('\n🏁 Procedimento de backup finalizado com sucesso.');
    return;
  }

  // 4. Conexão ao PostgreSQL e Migração Idempotente
  console.log('🐘 Conectando ao PostgreSQL para migração idempotente...');
  const isLocalhost = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
  const pool = new pg.Pool({
    connectionString,
    ssl: isLocalhost ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 7000
  });

  const client = await pool.connect();
  try {
    console.log('🛠️ Verificando e criando estrutura de tabelas se necessário...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS agendamentos (
        id VARCHAR(30) PRIMARY KEY,
        cliente_nome VARCHAR(150) NOT NULL,
        cliente_telefone VARCHAR(30) NOT NULL,
        servico VARCHAR(100) NOT NULL,
        preco NUMERIC(10,2) NOT NULL,
        duracao_min INT NOT NULL DEFAULT 30,
        unidade VARCHAR(50) NOT NULL,
        unidade_titulo VARCHAR(100),
        unidade_endereco VARCHAR(200),
        profissional VARCHAR(100) NOT NULL,
        data VARCHAR(20) NOT NULL,
        horario VARCHAR(10) NOT NULL,
        observacoes TEXT,
        forma_pagamento VARCHAR(50) DEFAULT 'No Local / PIX',
        status VARCHAR(30) NOT NULL DEFAULT 'confirmado',
        criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        atualizado_em TIMESTAMPTZ,
        cancelado_em TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_agendamentos_data_horario ON agendamentos (data, horario);
      CREATE INDEX IF NOT EXISTS idx_agendamentos_status ON agendamentos (status);
    `);

    // Contagem antes da inserção
    const beforeCountRes = await client.query('SELECT COUNT(*) AS total FROM agendamentos');
    const totalAntes = parseInt(beforeCountRes.rows[0].total, 10);
    console.log(`📊 Total de registros no PostgreSQL antes da sincronização: ${totalAntes}`);

    let processados = 0;
    for (const item of agendamentos) {
      const query = `
        INSERT INTO agendamentos (
          id, cliente_nome, cliente_telefone, servico, preco, duracao_min,
          unidade, unidade_titulo, unidade_endereco, profissional,
          data, horario, observacoes, forma_pagamento, status, criado_em, atualizado_em, cancelado_em
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          atualizado_em = COALESCE(EXCLUDED.atualizado_em, NOW()),
          cancelado_em = EXCLUDED.cancelado_em;
      `;
      await client.query(query, [
        item.id,
        item.clienteNome,
        item.clienteTelefone,
        item.servico,
        item.preco || 30.00,
        item.duracaoMin || 30,
        item.unidade || 'matriz',
        item.unidadeTitulo || '',
        item.unidadeEndereco || '',
        item.profissional,
        item.data,
        item.horario,
        item.observacoes || '',
        item.formaPagamento || 'No Local / PIX',
        item.status || 'confirmado',
        item.criadoEm || new Date().toISOString(),
        item.atualizadoEm || null,
        item.canceladoEm || null
      ]);
      processados++;
    }

    // Contagem após a sincronização
    const afterCountRes = await client.query('SELECT COUNT(*) AS total FROM agendamentos');
    const totalDepois = parseInt(afterCountRes.rows[0].total, 10);
    console.log(`📊 Total de registros no PostgreSQL após sincronização: ${totalDepois}`);

    console.log('\n🎉 SUCESSO: Migração idempotente concluída!');
    console.log(`   Registros lidos da origem: ${processados}`);
    console.log(`   Nenhum registro antigo foi apagado ou duplicado.`);
  } finally {
    client.release();
    await pool.end();
  }
}

runBackupAndMigrate().catch(err => {
  console.error('❌ Falha no procedimento:', err.message);
  process.exit(1);
});
