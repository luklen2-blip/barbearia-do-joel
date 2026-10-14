import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const AGENDAMENTOS_FILE = path.join(DATA_DIR, 'agendamentos.json');

// Mutex em memória para controle de concorrência em ambiente local/JsonDB
class AsyncMutex {
  constructor() {
    this._queue = Promise.resolve();
  }
  lock(fn) {
    const next = this._queue.then(() => fn());
    this._queue = next.catch(() => {});
    return next;
  }
}

export class DatabaseAdapter {
  constructor() {
    this.connectionString = process.env.DATABASE_URL || process.env.SUPABASE_URL || null;
    this.isPostgres = Boolean(this.connectionString);
    this.pool = null;
    this.mutex = new AsyncMutex();
  }

  async init() {
    // Garante que o diretório data exista
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(AGENDAMENTOS_FILE)) {
      const tmp = `${AGENDAMENTOS_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify([], null, 2), 'utf-8');
      fs.renameSync(tmp, AGENDAMENTOS_FILE);
    }

    if (this.isPostgres) {
      console.log('🐘 [Database] Conectando ao PostgreSQL via DATABASE_URL / SUPABASE_URL...');
      const connectionString = this.connectionString;
      const isLocalhost = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

      this.pool = new pg.Pool({
        connectionString,
        ssl: isLocalhost ? false : { rejectUnauthorized: false }
      });

      // Criação das tabelas essenciais (agendamentos, bloqueios, tokens)
      const createTableSql = `
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

        CREATE TABLE IF NOT EXISTS bloqueios (
          id VARCHAR(50) PRIMARY KEY,
          data VARCHAR(20) NOT NULL,
          horario VARCHAR(10),
          unidade VARCHAR(50),
          motivo VARCHAR(200),
          criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_bloqueios_data ON bloqueios (data);

        CREATE TABLE IF NOT EXISTS tokens (
          token VARCHAR(128) PRIMARY KEY,
          ip VARCHAR(50),
          criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          expira_em TIMESTAMPTZ NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_tokens_expira ON tokens (expira_em);
      `;
      await this.pool.query(createTableSql);

      // Migração automática e idempotente dos dados existentes no JsonDB
      await this._migrateFromJson();
      console.log('✅ [Database] PostgreSQL inicializado e sincronizado com sucesso.');
    } else {
      console.log('📁 [Database] Operando em modo JsonDB atômico resiliente (Fallback local/dev).');
    }
  }

  async _migrateFromJson() {
    try {
      if (!fs.existsSync(AGENDAMENTOS_FILE)) return;
      const raw = fs.readFileSync(AGENDAMENTOS_FILE, 'utf-8');
      const items = JSON.parse(raw || '[]');
      if (items.length === 0) return;

      let migratedCount = 0;
      for (const item of items) {
        const query = `
          INSERT INTO agendamentos (
            id, cliente_nome, cliente_telefone, servico, preco, duracao_min,
            unidade, unidade_titulo, unidade_endereco, profissional,
            data, horario, observacoes, forma_pagamento, status, criado_em, cancelado_em
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
          ON CONFLICT (id) DO NOTHING;
        `;
        const res = await this.pool.query(query, [
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
          item.canceladoEm || null
        ]);
        if (res.rowCount > 0) migratedCount++;
      }
      if (migratedCount > 0) {
        console.log(`📦 [Database] Migrados ${migratedCount} agendamentos legados do JSON para o PostgreSQL.`);
      }
    } catch (err) {
      console.error('⚠️ [Database] Erro na migração dos dados legados:', err.message);
    }
  }

  // Leitura Atômica do JsonDB
  _readJson() {
    try {
      const raw = fs.readFileSync(AGENDAMENTOS_FILE, 'utf-8');
      return JSON.parse(raw || '[]');
    } catch (err) {
      console.error('Erro ao ler JsonDB:', err);
      return [];
    }
  }

  // Escrita Atômica do JsonDB (.tmp -> renameSync)
  _writeJson(items) {
    const tmp = `${AGENDAMENTOS_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(items, null, 2), 'utf-8');
    fs.renameSync(tmp, AGENDAMENTOS_FILE);
  }

  async getAll(filtros = {}) {
    if (this.isPostgres) {
      let query = `
        SELECT 
          id, cliente_nome as "clienteNome", cliente_telefone as "clienteTelefone",
          servico, preco, duracao_min as "duracaoMin", unidade,
          unidade_titulo as "unidadeTitulo", unidade_endereco as "unidadeEndereco",
          profissional, data, horario, observacoes, forma_pagamento as "formaPagamento",
          status, criado_em as "criadoEm", atualizado_em as "atualizadoEm", cancelado_em as "canceladoEm"
        FROM agendamentos WHERE 1=1
      `;
      const values = [];
      let idx = 1;

      if (filtros.data) {
        query += ` AND data = $${idx++}`;
        values.push(filtros.data);
      }
      if (filtros.unidade) {
        query += ` AND unidade = $${idx++}`;
        values.push(filtros.unidade);
      }
      if (filtros.status) {
        query += ` AND status = $${idx++}`;
        values.push(filtros.status);
      }
      if (filtros.profissional) {
        query += ` AND profissional = $${idx++}`;
        values.push(filtros.profissional);
      }

      query += ` ORDER BY data DESC, horario DESC`;
      const res = await this.pool.query(query, values);
      return res.rows;
    } else {
      return this.mutex.lock(() => {
        let items = this._readJson();
        if (filtros.data) items = items.filter(a => a.data === filtros.data);
        if (filtros.unidade) items = items.filter(a => a.unidade === filtros.unidade);
        if (filtros.status) items = items.filter(a => a.status === filtros.status);
        if (filtros.profissional) items = items.filter(a => a.profissional === filtros.profissional);
        items.sort((a, b) => (b.data + b.horario).localeCompare(a.data + a.horario));
        return items;
      });
    }
  }

  async getById(id) {
    if (this.isPostgres) {
      const query = `
        SELECT 
          id, cliente_nome as "clienteNome", cliente_telefone as "clienteTelefone",
          servico, preco, duracao_min as "duracaoMin", unidade,
          unidade_titulo as "unidadeTitulo", unidade_endereco as "unidadeEndereco",
          profissional, data, horario, observacoes, forma_pagamento as "formaPagamento",
          status, criado_em as "criadoEm", atualizado_em as "atualizadoEm", cancelado_em as "canceladoEm"
        FROM agendamentos WHERE UPPER(id) = UPPER($1) LIMIT 1
      `;
      const res = await this.pool.query(query, [id.trim()]);
      return res.rows[0] || null;
    } else {
      return this.mutex.lock(() => {
        const items = this._readJson();
        return items.find(a => a.id.toUpperCase() === id.trim().toUpperCase()) || null;
      });
    }
  }

  // Criação de Agendamento com Proteção Estrita contra Conflitos e Concorrência
  async create(agendamento, slotsSolicitados) {
    if (this.isPostgres) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');

        // Checa conflito com lock transacional
        const checkSql = `
          SELECT id, horario, duracao_min as "duracaoMin", profissional, unidade, status
          FROM agendamentos
          WHERE data = $1 AND status != 'cancelado'
          FOR UPDATE
        `;
        const resCheck = await client.query(checkSql, [agendamento.data]);

        const hasConflict = resCheck.rows.some(item => {
          // Expande os slots do agendamento já existente
          const itemSlots = [];
          const [ih, im] = item.horario.split(':').map(Number);
          itemSlots.push(item.horario);
          if (item.duracaoMin > 30) {
            const nextMin = ih * 60 + im + 30;
            itemSlots.push(`${String(Math.floor(nextMin / 60)).padStart(2, '0')}:${String(nextMin % 60).padStart(2, '0')}`);
          }

          const overlap = slotsSolicitados.some(s => itemSlots.includes(s));
          if (!overlap) return false;

          // Conflito 1: Mesma unidade (1 cliente por cadeira/horário na unidade)
          if (item.unidade === agendamento.unidade) return true;

          // Conflito 2: Com o barbeiro titular Joel (não pode estar em dois lugares ao mesmo tempo)
          if (item.profissional.includes('Joel') || agendamento.profissional.includes('Joel')) return true;

          // Conflito 3: Mesmo profissional
          if (item.profissional === agendamento.profissional) return true;

          return false;
        });

        if (hasConflict) {
          await client.query('ROLLBACK');
          return { conflict: true };
        }

        const insertSql = `
          INSERT INTO agendamentos (
            id, cliente_nome, cliente_telefone, servico, preco, duracao_min,
            unidade, unidade_titulo, unidade_endereco, profissional,
            data, horario, observacoes, forma_pagamento, status, criado_em
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        `;
        await client.query(insertSql, [
          agendamento.id,
          agendamento.clienteNome,
          agendamento.clienteTelefone,
          agendamento.servico,
          agendamento.preco,
          agendamento.duracaoMin,
          agendamento.unidade,
          agendamento.unidadeTitulo,
          agendamento.unidadeEndereco,
          agendamento.profissional,
          agendamento.data,
          agendamento.horario,
          agendamento.observacoes,
          agendamento.formaPagamento,
          agendamento.status,
          agendamento.criadoEm
        ]);

        await client.query('COMMIT');
        return { success: true, agendamento };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } else {
      return this.mutex.lock(() => {
        const items = this._readJson();

        // Checagem de conflito
        const hasConflict = items.some(item => {
          if (item.status === 'cancelado') return false;
          if (item.data !== agendamento.data) return false;

          const itemSlots = [];
          const [ih, im] = item.horario.split(':').map(Number);
          itemSlots.push(item.horario);
          if ((item.duracaoMin || 30) > 30) {
            const nextMin = ih * 60 + im + 30;
            itemSlots.push(`${String(Math.floor(nextMin / 60)).padStart(2, '0')}:${String(nextMin % 60).padStart(2, '0')}`);
          }

          const overlap = slotsSolicitados.some(s => itemSlots.includes(s));
          if (!overlap) return false;

          // Conflito 1: Mesma unidade (1 cliente por cadeira/horário na unidade)
          if (item.unidade === agendamento.unidade) return true;

          // Conflito 2: Com o barbeiro titular Joel (não pode estar em dois lugares ao mesmo tempo)
          if (item.profissional.includes('Joel') || agendamento.profissional.includes('Joel')) return true;

          // Conflito 3: Mesmo profissional
          if (item.profissional === agendamento.profissional) return true;

          return false;
        });

        if (hasConflict) {
          return { conflict: true };
        }

        items.push(agendamento);
        this._writeJson(items);
        return { success: true, agendamento };
      });
    }
  }

  async updateStatus(id, newStatus, extra = {}) {
    if (this.isPostgres) {
      let query = `UPDATE agendamentos SET status = $1, atualizado_em = NOW()`;
      const values = [newStatus];
      let idx = 2;

      if (extra.canceladoEm) {
        query += `, cancelado_em = $${idx++}`;
        values.push(extra.canceladoEm);
      }

      query += ` WHERE UPPER(id) = UPPER($${idx++}) RETURNING *`;
      values.push(id.trim());

      const res = await this.pool.query(query, values);
      return res.rows[0] || null;
    } else {
      return this.mutex.lock(() => {
        const items = this._readJson();
        const target = items.find(a => a.id.toUpperCase() === id.trim().toUpperCase());
        if (!target) return null;

        target.status = newStatus;
        target.atualizadoEm = new Date().toISOString();
        if (extra.canceladoEm) target.canceladoEm = extra.canceladoEm;

        this._writeJson(items);
        return target;
      });
    }
  }

  async deleteById(id) {
    if (!id) return false;
    if (this.isPostgres) {
      const res = await this.pool.query('DELETE FROM agendamentos WHERE UPPER(id) = UPPER($1) RETURNING id', [id.trim()]);
      return res.rowCount > 0;
    } else {
      return this.mutex.lock(() => {
        const items = this._readJson();
        const initialLen = items.length;
        const filtered = items.filter(a => a.id.toUpperCase() !== id.trim().toUpperCase());
        if (filtered.length !== initialLen) {
          this._writeJson(filtered);
          return true;
        }
        return false;
      });
    }
  }

  // Aliases canônicos padronizados
  async findAll(filtros = {}) {
    return this.getAll(filtros);
  }

  async findById(id) {
    return this.getById(id);
  }

  async update(id, newStatus, extra = {}) {
    return this.updateStatus(id, newStatus, extra);
  }

  // Gerenciamento persistente de tokens administrativos
  async saveToken(token, ip, expiraEm) {
    if (this.isPostgres) {
      try {
        await this.pool.query(
          'INSERT INTO tokens (token, ip, expira_em) VALUES ($1, $2, $3) ON CONFLICT (token) DO UPDATE SET expira_em = $3',
          [token, ip, new Date(expiraEm)]
        );
      } catch (err) {
        console.error('⚠️ [Database] Erro ao salvar token:', err.message);
      }
    }
  }

  async isTokenValid(token) {
    if (this.isPostgres) {
      try {
        const res = await this.pool.query(
          'SELECT token FROM tokens WHERE token = $1 AND expira_em > NOW() LIMIT 1',
          [token]
        );
        return res.rows.length > 0;
      } catch {
        return false;
      }
    }
    return true; // No modo JsonDB local, gerenciado em memória
  }

  async revokeToken(token) {
    if (this.isPostgres) {
      try {
        await this.pool.query('DELETE FROM tokens WHERE token = $1', [token]);
      } catch (err) {
        console.error('⚠️ [Database] Erro ao revogar token:', err.message);
      }
    }
  }
}

export const db = new DatabaseAdapter();
