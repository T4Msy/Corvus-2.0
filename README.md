<div align="center">

# 🦅 CORVUS 2.0
### Agente Oficial de IA da Ordem Masayoshi

[![Demo ao Vivo](https://img.shields.io/badge/Demo%20ao%20Vivo-GitHub%20Pages-brightgreen?style=for-the-badge&logo=github)](https://t4msy.github.io/Corvus-2.0/)
[![Supabase](https://img.shields.io/badge/Banco%20de%20Dados-Supabase-3ECF8E?style=for-the-badge&logo=supabase)](https://supabase.com/)
[![Automação n8n](https://img.shields.io/badge/Automação-n8n-orange?style=for-the-badge&logo=n8n)](https://n8n.io/)
[![IA](https://img.shields.io/badge/IA-GPT--4o-blueviolet?style=for-the-badge&logo=openai)](https://openai.com/)

**CORVUS** é o agente institucional oficial da Ordem Masayoshi (MSY). Um sistema de chat com IA conectado a uma base de conhecimento vetorial, projetado para representar, orientar e informar membros da organização com precisão e postura institucional.

[🚀 Acessar o projeto](https://t4msy.github.io/Corvus-2.0/) · [🐛 Reportar Bug](https://github.com/T4Msy/Corvus-2.0/issues) · [💡 Sugerir Melhoria](https://github.com/T4Msy/Corvus-2.0/issues)

</div>

---

## ✨ Funcionalidades

- 🔐 **Autenticação via Supabase** — Login com email/senha ou acesso como convidado
- 🧠 **Base de conhecimento vetorial** — Consulta automática à base da MSY antes de cada resposta institucional (pgvector)
- 🤖 **Dois modos de resposta** — Corvus (preciso e institucional) e Fenrir (criativo e expansivo)
- 💬 **Histórico de conversas** — Salvo no Supabase por usuário, agrupado por data
- 🔍 **Busca de conversas** — Filtragem em tempo real no histórico da sidebar
- ✏️ **Renomear e excluir chats** — Gerenciamento completo das conversas
- 🎨 **3 temas visuais** — Escuro, Claro e Cinza, com persistência no localStorage
- 📱 **Design responsivo** — Interface adaptada para mobile com teclado virtual
- ⌨️ **Atalhos de teclado** — `Ctrl+N` novo chat, `Ctrl+K` buscar conversa
- 🔔 **Notificações flutuantes** — Feedback visual para ações do usuário
- 👤 **Modal de conta** — Exibe perfil do usuário, cargo e seletor de tema

---

## 🖼️ Interface

> _O Corvus é uma interface de chat minimalista com sidebar de histórico, autenticação integrada e identidade visual própria da Ordem Masayoshi._

| Área | Descrição |
|------|-----------|
| Tela de Login | Autenticação com email/senha ou entrada como convidado |
| Sidebar | Histórico de conversas agrupado por data, busca e gerenciamento |
| Chat | Área principal de mensagens com suporte a Markdown |
| Input | Seletor de modo (Corvus/Fenrir), textarea expansível e botão de envio |
| Modal de Conta | Perfil do usuário, cargo, tipo de acesso e troca de tema |

---

## 🏗️ Arquitetura

```
Navegador (HTML/CSS/JS)
        │
        │  POST JSON (message, sessionId, userId, userContext, modo)
        ▼
  Webhook n8n
        │
        ▼
  Code Node (Normalize Input)
        │
        ▼
  Switch Node — roteia por modo
        │
        ├──► Modo Corvus
        │         │
        │    Set System Prompt (identidade institucional + protocolo MSY)
        │         │
        │    AI Agent (GPT-4o)
        │         │
        │    Tool: buscar_base_msy ──► Supabase pgvector (embeddings)
        │         │
        │    Format Response
        │
        └──► Modo Fenrir
                  │
             Set System Prompt (modo criativo)
                  │
             AI Agent (GPT-4o)
                  │
             Format Response
                  │
                  ▼
        Webhook Response ──► Navegador renderiza resposta em Markdown
```

---

## 🛠️ Tecnologias

| Camada | Tecnologia |
|--------|-----------|
| Frontend | HTML5, CSS3, JavaScript Vanilla |
| Fontes | Inter (Google Fonts) |
| Autenticação | [Supabase Auth](https://supabase.com/docs/guides/auth) |
| Banco de Dados | [Supabase](https://supabase.com/) (PostgreSQL + pgvector) |
| Automação | [n8n](https://n8n.io/) (self-hosted) |
| Túnel | Cloudflare Tunnel |
| IA | GPT-4o via OpenAI API |
| Renderização | [marked.js](https://marked.js.org/) (Markdown → HTML) |
| Hospedagem | GitHub Pages |

---

## 📁 Estrutura do Projeto

```
Corvus-2.0/
├── index.html                               # Interface principal do chat
├── styles.css                               # Sistema de design — 3 temas visuais
├── app.js                                   # Lógica completa do frontend
├── corvuslogo.png                           # Logo para tema escuro/cinza
├── corvuslogolight.png                      # Logo para tema claro
└── Corvus___Ingestão_via_Formulário.json    # Workflow n8n (importável)
```

---

## ⚙️ Workflow n8n

O arquivo `Corvus___Ingestão_via_Formulário.json` é um workflow n8n totalmente exportável. Importe-o na sua instância para executar o backend do Corvus.

**Nós do workflow:**

1. **Webhook** — Recebe as mensagens do frontend via POST
2. **Normalize Input** — Extrai e valida `message`, `userId`, `sessionId`, `userContext` e `modo`
3. **Switch** — Roteia para o fluxo Corvus ou Fenrir conforme o modo selecionado
4. **Set System Prompt** — Define a identidade e o protocolo institucional do agente
5. **AI Agent** — GPT-4o com memória de sessão e acesso a tools
6. **Tool: buscar_base_msy** — Consulta vetorial no Supabase para perguntas sobre a MSY
7. **Format Response** — Padroniza a resposta final
8. **Webhook Response** — Retorna o JSON com a resposta para o frontend

---

## 🗄️ Banco de Dados (Supabase)

O Corvus utiliza três tabelas principais:

| Tabela | Descrição |
|--------|-----------|
| `msy_usuarios` | Perfis dos membros (nome, cargo, tipo de acesso) |
| `msy_conversas` | Histórico de conversas por usuário |
| `msy_mensagens` | Mensagens individuais vinculadas a cada conversa |

A base de conhecimento institucional é indexada com **pgvector**, permitindo busca semântica antes de cada resposta sobre a MSY.

---

## 🚀 Como Executar

### Frontend (sem configuração necessária)
O frontend é um site estático — basta hospedar no GitHub Pages ou abrir o `index.html` localmente.

### Backend (workflow n8n)

1. Instale o [n8n](https://docs.n8n.io/hosting/) (self-hosted ou cloud)
2. Importe o arquivo `Corvus___Ingestão_via_Formulário.json` na sua instância
3. Configure as credenciais:
   - Chave de API OpenAI (GPT-4o)
   - Credenciais do Supabase
4. Ative o workflow e copie a URL do webhook
5. Substitua o `WEBHOOK_URL` no `app.js` pela URL gerada

```javascript
// app.js — linha 2
const WEBHOOK_URL = 'https://sua-instancia-n8n.com/webhook/corvus';
```

### Supabase

1. Crie um projeto no [Supabase](https://supabase.com/)
2. Crie as tabelas `msy_usuarios`, `msy_conversas` e `msy_mensagens`
3. Ative a extensão **pgvector** para a base de conhecimento
4. Atualize `SUPABASE_URL` e `SUPABASE_ANON_KEY` no `app.js`

---

## 💡 Contexto do Projeto

> O Corvus foi criado para centralizar o conhecimento institucional da Ordem Masayoshi e torná-lo acessível aos membros de forma inteligente. O agente não é um chatbot genérico — ele tem identidade, protocolo e valores definidos, e consulta ativamente a base de dados antes de responder sobre qualquer assunto relacionado à organização.

---

## 🔮 Melhorias Futuras

- [ ] Suporte a upload de documentos diretamente no chat
- [ ] Painel administrativo para ingestão de conteúdo na base vetorial
- [ ] Notificações push para membros
- [ ] Versão mobile nativa (Android/iOS via Capacitor)
- [ ] Integração com calendário e agenda da MSY

---

## 👤 Autor

**Tales — T4 MASAYOSHI**
Fundador da Ordem Masayoshi · Professor de informática · Estudante de Sistemas de Informação · Entusiasta de IA e automação

[![GitHub](https://img.shields.io/badge/GitHub-T4Msy-181717?style=flat-square&logo=github)](https://github.com/T4Msy)

---

<div align="center">
  <sub>Feito com ☕, muito <code>n8n</code> e lealdade institucional · <strong>Ordem Masayoshi © 2026</strong></sub>
</div>
