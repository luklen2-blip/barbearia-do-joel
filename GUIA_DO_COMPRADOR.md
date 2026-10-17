# 📖 GUIA DEFINITIVO DO PROPRIETÁRIO & MANUAL DE CUSTOMIZAÇÃO
## Sistema de Agendamento Online & Gestão de Barbearia 2.0

Parabéns pela aquisição do **Sistema de Agendamento da Barbearia**!  
Você acaba de adquirir uma solução moderna, rápida, 100% brasileira e de sua posse exclusiva: **sem mensalidades obrigatórias**, sem taxas por corte e com **acesso total ao código-fonte**.

Este manual foi elaborado para que você ou seu desenvolvedor consiga personalizar e colocar a barbearia no ar em menos de 10 minutos.

---

## 1. O Que Está Incluso no Pacote

1. **Website Completo do Cliente (Frontend):**
   * Interface moderna em Dark Mode com detalhes dourados (padrão barber shop de alto padrão).
   * Catálogo interativo de serviços, preços e durações.
   * Agendamento online dinâmico com prevenção automática de conflito de horários (zero double-booking).
   * Geração automática de protocolo oficial (ex: `#JOEL-1234`).
   * Botão direto para confirmação no WhatsApp do cliente com mensagem pré-formatada.
   * Suporte a PIX oficial do Banco Central (payload EMV com QR Code e Copia-e-Cola).
   * Consulta segura e cancelamento de reservas pelo próprio cliente com proteção LGPD.
2. **Painel de Gestão do Barbeiro (`/admin`):**
   * Acesso protegido por senha mestre (padrão inicial: `joel`).
   * Dashboard com métricas em tempo real (Total, Hoje, Confirmados, Concluídos, Cancelados).
   * Tabela de clientes com filtros por data, unidade e status.
   * **Lançamento Manual de Agendamentos de Balcão e Telefone**.
   * Link direto para conversar no WhatsApp com cada cliente agendado.
   * Botão para **Exportar Backup (.json)** de todos os dados em 1 clique.
3. **Infraestrutura Pronta para Nuvem 24/7:**
   * Receitas automatizadas para deploy gratuito ou profissional no **Render**, **Railway**, **Docker** ou qualquer VPS.
   * Suporte híbrido automático: opera em **PostgreSQL permanente** quando vinculado ou em **JsonDB atômico local**.

---

## 2. Como Personalizar a Barbearia em 3 Passos

Todas as informações da barbearia estão concentradas em um único arquivo de configuração clara no topo do `server.js`:

### Passo 1: Informações da Sua Barbearia
Abra o arquivo `server.js` e altere a constante `BARBEARIA_INFO`:

- Nome da sua barbearia
- Seu número de WhatsApp com DDD
- Sua Chave PIX (celular, CPF, CNPJ ou aleatória)
- Seus endereços e horários de atendimento

### Passo 2: Catálogo de Serviços e Preços
No mesmo arquivo `server.js`, dentro de `BARBEARIA_INFO.servicos`, você pode alterar, adicionar ou remover os serviços oferecidos e seus valores.

### Passo 3: Foto da Fachada e Logotipo
Para trocar a foto da barbearia exibida no site:
1. Renomeie a sua foto favorita para `fachada.jpg`.
2. Cole a imagem dentro da pasta `public/assets/`, substituindo o arquivo existente.

Pronto! O site já estará com a cara e os dados da sua barbearia.

---

## 3. Como Usar o Painel Administrativo (`/admin`)

- Link de Acesso: `https://barbearia-do-joel.onrender.com/admin`
- Senha Padrão Inicial: `joel` *(ou a senha que você configurar na variável `ADMIN_PASSWORD` no Render)*.

### Recursos do Painel:
1. **Lançar Agendamento de Balcão:**
   - Se um cliente chegar presencialmente ou ligar no seu WhatsApp, clique no botão azul `➕ Novo Agendamento (Balcão)` no topo do painel.
   - Preencha o nome, WhatsApp, escolha o serviço e horário e confirme. A vaga será bloqueada na hora no site para nenhum outro cliente marcar por cima!
2. **Alterar Status:**
   - Na tabela de clientes, você pode marcar um agendamento como `Concluído` ou `Cancelar`.
3. **Chamar o Cliente no WhatsApp:**
   - Clique no número de telefone do cliente na tabela para abrir o chat do WhatsApp diretamente no seu celular ou computador.
4. **Baixar Cópia de Segurança (Backup):**
   - Clique em `📥 Exportar Backup (.json)` para salvar uma cópia completa de todos os clientes no seu computador.

---

## 4. Como Colocar o Site no Ar na Nuvem (Deploy em 5 Minutos)

O projeto já vem com as receitas oficiais para a nuvem gratuita do Render.com:

1. Crie uma conta gratuita em [render.com](https://render.com).
2. Clique em **New +** -> **Web Service**.
3. Conecte o repositório do GitHub (ou faça upload dos arquivos).
4. O Render detectará automaticamente o arquivo `render.yaml` e configurará tudo:
   - Runtime: Node.js 20
   - Build Command: `npm install && npm test`
   - Start Command: `node server.js`
5. Clique em **Create Web Service**. Em menos de 2 minutos seu site estará no ar com link seguro `https://...` e certificado SSL gratuito!

---

## 5. Suporte ao Proprietário

Se você comprou este sistema diretamente com **Luciano**, você conta com suporte inicial para dúvidas e apoio na implantação:

- 📱 WhatsApp Oficial de Suporte: [(21) 98215-6025](https://wa.me/5521982156025)
- 💻 Repositório Oficial: [github.com/luklen2-blip/barbearia-do-joel](https://github.com/luklen2-blip/barbearia-do-joel)

Aproveite o seu novo sistema e bons negócios! 💈✂️
