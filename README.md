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

## 📍 Localizações Físicas
- **Matriz:** Rua Francisco Mota, 93 - Campo Grande, Rio de Janeiro - RJ (CEP 23013-630)
- **Filial:** Rua Alfredo Mariano, 24 - Campo Grande, Rio de Janeiro - RJ
- **WhatsApp:** (21) 98215-6025
