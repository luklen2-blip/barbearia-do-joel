# 💈 Barbearia do Joel - Website Oficial & Sistema de Agendamento (Desde 1992)

Aplicação web completa, moderna e responsiva da tradicional **Barbearia do Joel**, localizada em Campo Grande, Rio de Janeiro (RJ).

---

## 🌟 Principais Funcionalidades

1. **Apresentação de Alta Conversão:**
   - Foto real da fachada em pastilhas e blindex.
   - Mais de 30 anos de história (fundada em 1992).
   - Selo de avaliação 4.9 estrelas no Google.
   - Indicador dinâmico de "Aberto Agora" / "Fechado" em tempo real conforme horário de Brasília.
2. **Sistema de Agendamento Online:**
   - Escolha de serviços com preços e duração média.
   - Seleção de barbeiro preferido.
   - Bloqueio automático de dias fechados (Segundas e Domingos).
   - Bloqueio de horários já reservados.
   - Envio automático com 1 clique para o WhatsApp oficial com dados pré-formatados.
3. **Fintech Brasileira (PIX EMV Oficial):**
   - Geração dinâmica de QR Code e Copia-e-Cola no padrão EMV do Banco Central com cálculo de redundância cíclica CRC-16.
4. **Conformidade Legal & LGPD:**
   - Rotas `/termos` e `/privacidade` em conformidade com o Código Civil, ECA e Art. 14 da LGPD.
5. **Infraestrutura em Nuvem 24/7:**
   - Endpoint `/api/health` para monitoramento de saúde ininterrupto.
   - Blueprint `render.yaml` pronto para deploy com 1 clique.
   - `Dockerfile` universal `node:20-alpine`.

---

## 🚀 Como Executar Localmente

```bash
# Iniciar o servidor
npm start

# Ou diretamente:
node server.js
```
Acesse: [http://localhost:3000](http://localhost:3000)

---

## 🧪 Suíte de Testes Automatizados

```bash
# Executar testes de integridade local
npm test
```

### Validador de Produção na Nuvem
```bash
node tests/test_cloud_live.js https://sua-url-na-nuvem.onrender.com
```

---

## 🗄️ Persistência Híbrida Resiliente (Render Free / Supabase / Local)

O sistema conta com um adaptador de banco de dados híbrido (`database.js`):
- **Ambiente de Produção em Nuvem:** Se a variável `DATABASE_URL` ou `SUPABASE_URL` estiver configurada, conecta-se a um pool PostgreSQL com criação e migração automática das tabelas (`agendamentos`, `bloqueios`, `tokens`).
- **Ambiente Local / Fallback Gracioso:** Se nenhuma variável de banco estiver definida, opera em modo `JsonDB` atômico transacional em `data/agendamentos.json`, garantindo que os testes rodem 100% offline e sem dependências externas.

---

## ⏱️ Prevenção de Cold Start (Keep-Alive 24/7)

Para evitar que a instância gratuita do Render entre em suspensão após 15 minutos de inatividade:

### Opção A: Monitor Gratuito UptimeRobot (Recomendado - 2 minutos)
1. Acesse [UptimeRobot.com](https://uptimerobot.com) e crie uma conta gratuita.
2. Clique em **Add New Monitor**.
3. Selecione o tipo **HTTP(s)**.
4. Preencha os campos:
   - **Friendly Name:** `Barbearia do Joel - Health Check`
   - **URL (or IP):** `https://barbearia-do-joel.onrender.com/api/health`
   - **Monitoring Interval:** `5 minutes` ou `10 minutes`
5. Clique em **Create Monitor**. O Render permanecerá ativo 24/7 com resposta instantânea.

### Opção B: Cron-Job.org (Alternativa 100% Gratuita)
1. Acesse [cron-job.org](https://cron-job.org) e faça login.
2. Clique em **Create Cronjob**.
3. Configure a URL: `https://barbearia-do-joel.onrender.com/api/health`
4. Defina a periodicidade para cada **10 minutos** e salve.

### Opção C: Self-Ping Interno no Render
Defina as seguintes variáveis de ambiente no dashboard do Render:
```env
ENABLE_SELF_PING=true
SELF_PING_URL=https://barbearia-do-joel.onrender.com/api/health
PING_INTERVAL_MINUTES=10
```

### Script Utilitário de Verificação:
```bash
node scripts/ping-health.js
```

---

## 📍 Localizações Físicas
- **Matriz:** Rua Francisco Mota, 93 - Campo Grande, Rio de Janeiro - RJ (CEP 23013-630)
- **Filial:** Rua Alfredo Mariano, 24 - Campo Grande, Rio de Janeiro - RJ
- **WhatsApp Oficial:** (21) 98215-6025

