# 💈 Barbearia do Joel - Website Oficial & Sistema de Agendamento (Desde 1992)

Aplicação web completa, moderna e responsiva da tradicional **Barbearia do Joel**, localizada em Campo Grande, Rio de Janeiro (RJ).

---

## 🌟 Principais Funcionalidades

1. **Apresentação de Alta Conversão:**
   - Foto real da fachada em pastilhas e blindex.
   - Mais de 30 anos de história (fundada em 1992).
   - Selo de avaliação 4.9 estrelas no Google.
   - Indicador dinâmico de "Aberto Agora" / "Fechado" em tempo real conforme horário de Brasília (Fechado aos sábados, domingos, segundas e feriados nacionais/RJ).
2. **Sistema de Agendamento Online:**
   - Catálogo com 7 serviços oficiais com preços e durações autorizadas exclusivamente pelo backend.
   - Seleção de profissional (Joel ou Equipe) e unidade (Matriz ou Filial).
   - Bloqueio automático de dias não úteis e detecção astronômica de feriados móveis.
   - Prevenção estrita de double-booking com locks transacionais pessimistas (`FOR UPDATE` no Postgres e mutex serializado no JsonDB).
   - Confirmação com protocolo canônico `#JOEL-XXXX` e envio direto para o WhatsApp oficial com dados pré-formatados.
3. **Consulta e Cancelamento Seguro pelo Cliente:**
   - Endpoints dedicados `/api/agendamentos/consultar` e `/api/agendamentos/cancelar`.
   - Validação estrita de identidade (protocolo + telefone completo com DDD).
   - Proteção de dados e mascaramento de privacidade conforme a LGPD.
   - Liberação automática imediata do horário reservado após cancelamento.
4. **Fintech Brasileira & Meios de Pagamento:**
   - PIX Oficial Banco Central com cálculo de CRC-16 e QR Code dinâmico para sinal opcional.
   - Aceitação informada no balcão de Cartões de Crédito (com parcelamento), Cartões de Débito, Dinheiro e Carteiras Digitais por Aproximação (Apple Pay, Google Pay).
5. **Licenciamento Comercial via Kiwify:**
   - Checkout oficial para venda definitiva do sistema a proprietários de barbearias: `https://pay.kiwify.com.br/VFLRa1z`.
   - Seção e modal dedicados com destaque para posse vitalícia, zero mensalidades, customização e suporte de implantação.
6. **Conformidade Legal & LGPD:**
   - Rotas `/termos` e `/privacidade` em conformidade com o Código Civil, ECA e Art. 14 da LGPD.
7. **Infraestrutura em Nuvem 24/7:**
   - Endpoint `/api/health` para monitoramento contínuo de saúde e uptime.
   - Blueprint `render.yaml` pronto para deploy automático com 1 clique.
   - `Dockerfile` universal baseado em `node:20-alpine`.

---

## ⚙️ Variáveis de Ambiente

Crie um arquivo `.env` para execução local ou configure as variáveis no painel da sua hospedagem (Render / Railway / Docker):

| Variável | Obrigatória | Padrão | Descrição |
| :--- | :---: | :---: | :--- |
| `PORT` | Não | `3000` | Porta TCP do servidor HTTP. |
| `NODE_ENV` | Não | `development` | Ambiente de execução (`production` ou `development`). |
| `ADMIN_PASSWORD` | **Sim (Produção)** | *Nenhum* | Senha forte para acesso ao painel administrativo `/admin`. Se ausente, o painel é desativado por segurança com HTTP 503. |
| `DATABASE_URL` | Não | *Nenhum* | String de conexão PostgreSQL (ex: Supabase, Neon, Render Postgres). Se ausente, opera em modo JsonDB atômico. |
| `SUPABASE_URL` | Não | *Nenhum* | Alternativa para credencial PostgreSQL. |
| `ENABLE_SELF_PING` | Não | `false` | Se `'true'`, ativa rotina interna de auto-aquecimento unref'd para prevenção de cold start. |
| `SELF_PING_URL` | Não | *URL Oficial* | URL alvo para o auto-ping (ex: `https://barbearia-do-joel.onrender.com/api/health`). |
| `PING_INTERVAL_MINUTES`| Não | `10` | Intervalo em minutos entre pings de saúde. |

---

## 🚀 Como Instalar e Executar Localmente

### Requisitos Prévios
- Node.js 18.x ou 20.x instalado.
- NPM 9.x ou superior.

```bash
# 1. Clonar o repositório
git clone https://github.com/luklen2-blip/barbearia-do-joel.git
cd barbearia-do-joel

# 2. Instalar dependências leves (pg para suporte a PostgreSQL)
npm install

# 3. Executar em desenvolvimento
npm start
```
Acesse no seu navegador: [http://localhost:3000](http://localhost:3000)

---

## 🧪 Suíte Completa de Testes Automatizados

O projeto conta com **24 testes automatizados determinísticos** divididos em 3 suítes:

```bash
# Executa todas as 3 suítes simultaneamente
npm test
```

### Suítes Incluídas:
1. `tests/run_all.js` (11 testes core):
   - Verificação de arquivos de nuvem mandatórios.
   - Cálculo algorítmico do Bacen PIX EMV (CRC-16).
   - Integridade e persistência JsonDB.
   - Endpoint `/api/health` e cabeçalhos de segurança OWASP.
   - Bloqueio de datas passadas e bloqueio estrito de fins de semana e feriados.
   - Prevenção de double-booking por unidade, profissional e duração contínua.
   - Concorrência simultânea paralela atômica.
   - Cancelamento seguro com validação de protocolo + telefone.
   - Hardening administrativo: proteção contra força bruta (HTTP 429), bloqueio sem senha (503), token criptográfico e logout.
   - Entrega estática com suporte a SPA fallback.
2. `tests/test_seis_fluxos.js` (6 fluxos funcionais):
   - Fluxo "Agendar Horário" com compensação de cabeçalho fixo.
   - Fluxo "Ver Serviços & Preços" com ancoragem suave.
   - Seleção automática dinâmica dos serviços com listener único.
   - Validação exclusiva de preços e durações pelo backend.
   - Validação canônica do WhatsApp oficial `(21) 98215-6025`.
   - Ciclo de agendamento completo, concorrência e limpeza.
3. `tests/test_commercial_and_integrity.js` (7 testes comerciais):
   - Validação do link do checkout Kiwify (`https://kiwify.app/oYFh6Tz`) com atributos de segurança.
   - Diferenciação clara entre compra da licença e agendamento de cortes.
   - Consulta segura de agendamentos (`/api/agendamentos/consultar`) com mascaramento de dados (LGPD).
   - Cancelamento e liberação real de horário para nova reserva.
   - Validação dos badges das 5 modalidades de pagamento.
   - Validação estrita do catálogo oficial de serviços.

### Validação Remota na Nuvem (Live Cloud E2E)
```bash
node tests/test_cloud_live.js https://barbearia-do-joel.onrender.com
```

---

## 🗄️ Arquitetura de Persistência Híbrida

O motor `database.js` implementa um padrão híbrido resiliente:
* **Modo PostgreSQL (Nuvem):**
  Ativado automaticamente se `DATABASE_URL` ou `SUPABASE_URL` estiver configurado. Utiliza pool de conexões com timeout estrito de 5s, tabelas relacionais (`agendamentos`, `bloqueios`, `tokens`) e locks transacionais (`FOR UPDATE`).
* **Fallback Automático para JsonDB Atômico:**
  Se o PostgreSQL estiver indisponível ou as variáveis ausentes, o sistema realiza fallback transparente para JsonDB em `data/agendamentos.json` com escrita atômica (`.tmp` + `renameSync`) e fila em memória `AsyncMutex`. **O servidor nunca falha ao iniciar**.

---

## 💼 Licenciamento Comercial da Plataforma (Kiwify)

Para proprietários de barbearias e salões interessados em adquirir o sistema:
- **Checkout Oficial:** [https://pay.kiwify.com.br/VFLRa1z](https://pay.kiwify.com.br/VFLRa1z)
- **O que está incluído:**
  - Código-fonte integral em Node.js sem bloqueios ou travas.
  - Painel Administrativo de gestão de agenda e bloqueios.
  - Receitas prontas de nuvem (`render.yaml`, `Dockerfile`).
  - Suporte inicial para implantação e entrega de posse.
- **Custos Externos:** Custos de domínio personalizado (.com.br) ou servidores adicionais pagos são de responsabilidade do comprador.

---

## 💾 Procedimentos de Backup e Recuperação

### Backup do PostgreSQL:
```bash
# Exportar banco de dados completo
pg_dump "$DATABASE_URL" > backup_barbearia_$(date +%Y%m%d).sql

# Restaurar banco de dados
psql "$DATABASE_URL" < backup_barbearia_20261014.sql
```

### Backup do JsonDB:
O arquivo `data/agendamentos.json` é gravado de forma atômica. Para criar uma cópia de segurança:
```bash
cp data/agendamentos.json data/agendamentos_backup_$(date +%Y%m%d).json
```

---

## 📍 Localizações Físicas Oficiais
- **Unidade Matriz:** Rua Francisco Mota, 93 - Campo Grande, Rio de Janeiro - RJ (CEP 23013-630)
- **Unidade Filial:** Rua Alfredo Mariano, 24 - Campo Grande, Rio de Janeiro - RJ
- **WhatsApp Comercial Oficial:** (21) 98215-6025 (`https://wa.me/5521982156025`)
