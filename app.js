// ===== CONFIGURAÇÃO DO WEBHOOK =====
const WEBHOOK_URL = "https://warm-polls-treasury-gay.trycloudflare.com/webhook/corvus";

// ===== SUPABASE =====
const SUPABASE_URL = "https://bjqarrswkxkgfdbxjuuj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqcWFycnN3a3hrZ2ZkYnhqdXVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2OTc4OTQsImV4cCI6MjA4NDI3Mzg5NH0.3nv-46Q-NrxSXLblCmako_4APF5qeKS4L_IjRN2nOjk";
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== ESTADO DO USUÁRIO E TEMA =====
let USER_ID = "web-user";
let USUARIO_PERFIL = null;
let IS_CONVIDADO = false;
let MODO_FENRIR = false;
let CURRENT_THEME = localStorage.getItem('corvus_theme') || 'dark';

// ===== CHATS =====
const STORAGE_KEY = "corvus_conversations_v1";
const ACTIVE_CHAT_KEY = "corvus_active_conversation_id";
let conversations = [];
let activeConversationId = null;

// ===== UTILITÁRIOS =====
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function mostrarNotificacao(mensagem, tipo = 'erro') {
  const container = document.getElementById('notificationContainer') || (() => {
    const div = document.createElement('div');
    div.id = 'notificationContainer';
    div.className = 'notification-container';
    document.body.appendChild(div);
    return div;
  })();

  const notif = document.createElement('div');
  notif.className = `notificacao ${tipo}`;
  notif.textContent = mensagem;
  container.appendChild(notif);

  requestAnimationFrame(() => notif.classList.add('visible'));

  setTimeout(() => {
    notif.classList.remove('visible');
    setTimeout(() => notif.remove(), 300);
  }, 4000);
}

// ===== FUNÇÕES DE TEMA E LOGO =====
function applyTheme() {
  document.body.setAttribute('data-theme', CURRENT_THEME);
  // Logo claro para tema light, escuro para dark e gray
  const logoSrc = CURRENT_THEME === 'light' ? 'corvuslogolight.png' : 'corvuslogo.png';
  const headerLogo = document.getElementById('headerLogo');
  const loginLogo = document.getElementById('loginLogo');
  if (headerLogo) headerLogo.src = logoSrc;
  if (loginLogo) loginLogo.src = logoSrc;
}

function getThemeLabel(theme) {
  if (theme === 'dark') return 'Escuro';
  if (theme === 'light') return 'Claro';
  if (theme === 'gray') return 'Cinza';
  return theme;
}

function getNextTheme(current) {
  const cycle = ['dark', 'light', 'gray'];
  const idx = cycle.indexOf(current);
  return cycle[(idx + 1) % cycle.length];
}

function toggleTheme() {
  CURRENT_THEME = getNextTheme(CURRENT_THEME);
  localStorage.setItem('corvus_theme', CURRENT_THEME);
  applyTheme();
  const themeBtn = document.getElementById('toggleThemeBtn');
  if (themeBtn) {
    themeBtn.textContent = getThemeLabel(CURRENT_THEME);
  }
}

// Aplica tema inicial
applyTheme();

// ===== AUTENTICAÇÃO =====
async function initAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) { await loginComSucesso(session.user); return true; }
  if (sessionStorage.getItem("corvus_convidado")) { entrarComoConvidado(); return true; }
  mostrarTelaLogin();
  return false;
}

function mostrarTelaLogin() {
  document.getElementById("loginScreen").style.display = "flex";
}
function esconderTelaLogin() {
  document.getElementById("loginScreen").style.display = "none";
}

async function loginComSucesso(user) {
  USER_ID = user.id;
  IS_CONVIDADO = false;
  const { data: perfil } = await sb.from("msy_usuarios").select("*").eq("id", user.id).single();
  USUARIO_PERFIL = perfil;
  const nome = perfil?.nome_interno || perfil?.nome || user.email;
  const cargo = perfil?.sigla_cargo || perfil?.cargo || "Membro";
  document.getElementById("suiName").textContent = nome;
  document.getElementById("suiCargo").textContent = cargo;
  document.getElementById("suiAvatar").textContent = nome.charAt(0).toUpperCase();
  document.getElementById("sidebarUserInfo").style.display = "flex";
  const btnContaNome = document.getElementById("btnContaNome");
  if (btnContaNome) btnContaNome.textContent = perfil?.nome_interno || perfil?.nome || user.email;
  esconderTelaLogin();

  if (!localStorage.getItem('tour_visto')) {
    setTimeout(mostrarTour, 1000);
    localStorage.setItem('tour_visto', 'true');
  }
}

function entrarComoConvidado() {
  IS_CONVIDADO = true;
  USER_ID = "convidado_" + Date.now();
  USUARIO_PERFIL = { nome: "Convidado", tipo: "convidado" };
  sessionStorage.setItem("corvus_convidado", "true");
  document.getElementById("suiName").textContent = "Convidado";
  document.getElementById("suiCargo").textContent = "Acesso limitado";
  document.getElementById("suiAvatar").textContent = "C";
  document.getElementById("sidebarUserInfo").style.display = "flex";
  document.getElementById("guestBanner").innerHTML = '<div class="guest-banner">Você está como <span>convidado</span>. Algumas informações são restritas.</div>';
  esconderTelaLogin();

  if (!localStorage.getItem('tour_visto')) {
    setTimeout(mostrarTour, 1000);
    localStorage.setItem('tour_visto', 'true');
  }
}

async function fazerLogout() {
  if (!IS_CONVIDADO) await sb.auth.signOut();
  sessionStorage.removeItem("corvus_convidado");
  location.reload();
}

// ===== SUPABASE: OPERAÇÕES DE CONVERSA =====
async function sbCarregarConversas() {
  const chatList = document.getElementById("chatList");
  if (chatList) {
    chatList.innerHTML = '<div class="skeleton-chat-item"></div><div class="skeleton-chat-item"></div><div class="skeleton-chat-item"></div>';
  }

  try {
    const { data } = await sb
      .from("msy_conversas")
      .select("id, titulo, session_id, updated_at")
      .eq("usuario_id", USER_ID)
      .order("updated_at", { ascending: false })
      .limit(50);
    return (data || []).map(c => ({
      id: c.id,
      title: c.titulo,
      sessionId: c.session_id,
      updatedAt: new Date(c.updated_at).getTime(),
      createdAt: new Date(c.updated_at).getTime(),
      messages: []
    }));
  } catch (error) {
    mostrarNotificacao("Erro ao carregar conversas: " + error.message, "erro");
    return [];
  }
}

async function sbCriarConversa(conv) {
  try {
    await sb.from("msy_conversas").insert({
      id: conv.id,
      usuario_id: USER_ID,
      titulo: conv.title,
      session_id: conv.sessionId,
      updated_at: new Date(conv.updatedAt).toISOString()
    });
  } catch (error) {
    mostrarNotificacao("Erro ao criar conversa: " + error.message, "erro");
  }
}

async function sbAtualizarConversa(chatId, titulo, updatedAt) {
  try {
    await sb.from("msy_conversas").update({
      titulo,
      updated_at: new Date(updatedAt).toISOString()
    }).eq("id", chatId);
  } catch (error) {
    mostrarNotificacao("Erro ao atualizar conversa: " + error.message, "erro");
  }
}

async function sbDeletarConversa(chatId) {
  try {
    // Deletar mensagens primeiro (caso não haja cascade)
    await sb.from("msy_mensagens").delete().eq("conversa_id", chatId);
    const { error } = await sb.from("msy_conversas").delete().eq("id", chatId);
    if (error) mostrarNotificacao("Erro ao deletar: " + error.message, "erro");
  } catch (error) {
    mostrarNotificacao("Erro ao deletar conversa: " + error.message, "erro");
  }
}

async function sbCarregarMensagens(chatId) {
  try {
    const { data } = await sb
      .from("msy_mensagens")
      .select("role, texto, created_at")
      .eq("conversa_id", chatId)
      .order("created_at", { ascending: true });
    return (data || []).map(m => ({
      role: m.role,
      text: m.texto,
      timestamp: new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      createdAt: new Date(m.created_at).getTime()
    }));
  } catch (error) {
    mostrarNotificacao("Erro ao carregar mensagens: " + error.message, "erro");
    return [];
  }
}

async function sbSalvarMensagem(chatId, role, texto) {
  try {
    await sb.from("msy_mensagens").insert({ conversa_id: chatId, role, texto });
  } catch (error) {
    mostrarNotificacao("Erro ao salvar mensagem: " + error.message, "erro");
  }
}

async function gerarTituloSeNecessario(conv) {
  if (!conv || conv.title !== "Nova conversa") return;
  const msgs = await sbCarregarMensagens(conv.id);
  const firstUser = msgs.find(m => m.role === "user");
  if (!firstUser) return;
  const plain = stripHtml(firstUser.text || "").replace(/\s+/g, " ").trim();
  if (!plain) return;
  conv.title = plain.length > 40 ? plain.slice(0, 40).trim() + "…" : plain;
  conv.messages = msgs;
  conv.updatedAt = Date.now();
  await sbAtualizarConversa(conv.id, conv.title, conv.updatedAt);
  renderChatList(document.getElementById("searchInput")?.value?.trim() || "");
}

// ===== INICIALIZAÇÃO =====
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("loginScreen").style.display = "none";

  document.getElementById("loginBtn")?.addEventListener("click", async () => {
    const email = document.getElementById("loginEmail").value.trim();
    const senha = document.getElementById("loginPassword").value;
    const btn = document.getElementById("loginBtn");
    const erro = document.getElementById("loginError");
    erro.style.display = "none";
    if (!email || !senha) { erro.textContent = "Preencha email e senha."; erro.style.display = "block"; return; }
    btn.disabled = true; btn.textContent = "Aguarde...";
    const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
    if (error) { erro.textContent = "Credenciais inválidas."; erro.style.display = "block"; btn.disabled = false; btn.textContent = "Acessar"; return; }
    await loginComSucesso(data.user);
    await inicializarApp();
  });

  document.getElementById("guestBtn")?.addEventListener("click", () => {
    entrarComoConvidado();
    inicializarApp();
  });

  document.getElementById("logoutBtn")?.addEventListener("click", fazerLogout);

  document.getElementById("loginPassword")?.addEventListener("keydown", e => {
    if (e.key === "Enter") document.getElementById("loginBtn")?.click();
  });

  initAuth().then(async (autenticado) => {
    if (autenticado) await inicializarApp();
  });

  // Atalhos de teclado globais
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'k') {
      e.preventDefault();
      document.getElementById('searchInput')?.focus();
    }
    if (e.ctrlKey && e.key === 'n') {
      e.preventDefault();
      createNewConversation(true);
    }
    if (e.key === 'Escape') {
      const modal = document.getElementById('corvusModal');
      if (modal) modal.remove();
      document.getElementById('modelDropdown')?.classList.remove('open');
    }
  });

  // Gestos na sidebar (mobile)
  const sidebar = document.getElementById('sidebar');
  let touchStartX = 0;
  sidebar.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
  }, { passive: true });

  sidebar.addEventListener('touchmove', (e) => {
    if (touchStartX > 20) return;
    const diff = e.touches[0].clientX - touchStartX;
    if (diff < -30) {
      closeMobileMenu();
    }
  }, { passive: true });

  // iOS keyboard fix: ajustar altura do app com visualViewport
  if (window.visualViewport) {
    const appContainer = document.querySelector('.app-container');
    const updateAppHeight = () => {
      if (appContainer) {
        const h = window.visualViewport.height;
        appContainer.style.height = h + 'px';
      }
    };
    window.visualViewport.addEventListener('resize', updateAppHeight);
    // Não precisa de scroll listener — resize é suficiente no iOS
    updateAppHeight();
  }
});

async function inicializarApp() {
  initializeApp();
  initializeMobileMenu();
  ensureHistoryContainer();
  await loadConversationsFromStorage();
  ensureActiveConversation();
  renderChatList();
  if (!IS_CONVIDADO) {
    const conv = getActiveConversation();
    if (conv) {
      const msgs = await sbCarregarMensagens(conv.id);
      conv.messages = msgs;
    }
  }
  loadActiveConversationMessages();
  showWelcomeMessage();
}

function initializeApp() {
  const sendBtn = document.getElementById("sendBtn");
  const messageInput = document.getElementById("messageInput");
  const newChatBtn = document.getElementById("newChatBtn");
  const clearAllBtn = document.getElementById("clearAllChatsBtn");

  // Model Selector
  const modelSelectorBtn = document.getElementById("modelSelectorBtn");
  const modelDropdown = document.getElementById("modelDropdown");
  const modelOptions = document.querySelectorAll(".model-option");

  modelSelectorBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = modelDropdown.classList.contains("open");
    modelDropdown.classList.toggle("open", !isOpen);
    modelSelectorBtn.setAttribute("aria-expanded", String(!isOpen));
  });

  document.addEventListener("click", () => {
    modelDropdown?.classList.remove("open");
    modelSelectorBtn?.setAttribute("aria-expanded", "false");
  });

  modelOptions.forEach((option) => {
    option.addEventListener("click", (e) => {
      e.stopPropagation();
      const mode = option.getAttribute("data-mode");
      const isFenrir = mode === "fenrir";

      MODO_FENRIR = isFenrir;

      modelOptions.forEach((o) => {
        o.classList.toggle("active", o.getAttribute("data-mode") === mode);
        o.setAttribute("aria-selected", String(o.getAttribute("data-mode") === mode));
      });

      const modelName = document.getElementById("modelName");
      const modelIcon = document.getElementById("modelIcon");
      if (modelName) modelName.textContent = isFenrir ? "Fenrir" : "Corvus";
      if (modelIcon) {
        modelIcon.className = isFenrir ? "model-selector-icon fenrir-icon" : "model-selector-icon corvus-icon";
        modelIcon.innerHTML = isFenrir
          ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>'
          : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>';
      }
      if (modelSelectorBtn) modelSelectorBtn.classList.toggle("fenrir-active", isFenrir);

      const input = document.getElementById("messageInput");
      if (input) input.placeholder = isFenrir ? "Modo Fenrir — criatividade da MSY..." : "Faça sua pergunta ao Corvus...";

      modelDropdown.classList.remove("open");
      modelSelectorBtn?.setAttribute("aria-expanded", "false");
    });
  });

  sendBtn?.addEventListener("click", () => sendMessage());
  messageInput?.addEventListener("keydown", handleKeyDown);

  const btnConta = document.getElementById("btnConta");
  btnConta?.addEventListener("click", () => {
    if (!IS_CONVIDADO) mostrarModalConta();
  });

  newChatBtn?.addEventListener("click", async () => createNewConversation(true));

  clearAllBtn?.addEventListener("click", async () => {
    const ok = await mostrarModal("Limpar todo o histórico?", "Todas as conversas serão apagadas. Isso não pode ser desfeito.", "Limpar tudo", "danger");
    if (!ok) return;

    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(ACTIVE_CHAT_KEY);

    conversations = [];
    activeConversationId = null;

    ensureActiveConversation();

    const chatMessages = document.getElementById("chatMessages");
    if (chatMessages) chatMessages.innerHTML = "";

    renderChatList();
    showWelcomeMessage();
    closeMobileMenu();
  });

  messageInput?.addEventListener("input", () => {
    messageInput.style.height = "auto";
    messageInput.style.height = Math.min(messageInput.scrollHeight, 150) + "px";
  });

  const chatList = document.getElementById("chatList");
  chatList?.addEventListener("click", (e) => {
    const target = e.target;
    const item = target.closest?.(".chat-item");
    if (!item) return;

    const chatId = item.getAttribute("data-chat-id");
    if (!chatId) return;

    if (target.closest(".chat-action-btn.rename")) {
      e.preventDefault();
      e.stopPropagation();
      renameConversation(chatId);
      return;
    }
    if (target.closest(".chat-action-btn.delete")) {
      e.preventDefault();
      e.stopPropagation();
      deleteConversation(chatId);
      return;
    }

    setActiveConversation(chatId, true);
  });

  const searchInput = document.getElementById("searchInput");
  const debouncedRender = debounce((term) => renderChatList(term), 200);
  searchInput?.addEventListener("input", (e) => {
    debouncedRender(e.target.value.trim());
  });

  const suggestionCards = document.querySelectorAll(".suggestion-card");
  suggestionCards.forEach((card) => {
    card.addEventListener("click", () => {
      const prompt = card.getAttribute("data-prompt");
      if (prompt && messageInput) {
        messageInput.value = prompt;
        messageInput.focus();
        closeMobileMenu();
        sendMessage();
      }
    });
  });
}

// ===== MOBILE MENU =====
function initializeMobileMenu() {
  const menuToggle = document.getElementById("menuToggle");
  const sidebarOverlay = document.getElementById("sidebarOverlay");

  menuToggle?.addEventListener("click", toggleMobileMenu);
  sidebarOverlay?.addEventListener("click", closeMobileMenu);

  document.addEventListener("keydown", (e) => {
    const sidebar = document.getElementById("sidebar");
    if (e.key === "Escape" && sidebar?.classList.contains("active")) {
      closeMobileMenu();
    }
  });
}

function toggleMobileMenu() {
  const menuToggle = document.getElementById("menuToggle");
  const sidebar = document.getElementById("sidebar");
  const sidebarOverlay = document.getElementById("sidebarOverlay");

  menuToggle?.classList.toggle("active");
  sidebar?.classList.toggle("active");
  sidebarOverlay?.classList.toggle("active");

  document.body.style.overflow = sidebar?.classList.contains("active") ? "hidden" : "";
}

function closeMobileMenu() {
  const menuToggle = document.getElementById("menuToggle");
  const sidebar = document.getElementById("sidebar");
  const sidebarOverlay = document.getElementById("sidebarOverlay");

  menuToggle?.classList.remove("active");
  sidebar?.classList.remove("active");
  sidebarOverlay?.classList.remove("active");
  document.body.style.overflow = "";
}

// ===== MENSAGENS / UI =====
function handleKeyDown(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function getSugestoesPorCargo() {
  const sigla = USUARIO_PERFIL?.sigla_cargo || "";
  const tipo = IS_CONVIDADO ? "convidado" : (USUARIO_PERFIL?.tipo || "membro");
  const nome = USUARIO_PERFIL?.nome_interno || USUARIO_PERFIL?.nome || "membro";

  if (tipo === "convidado") return [
    { prompt: "O que é a Ordem Masayoshi?", label: "O que é a MSY?" },
    { prompt: "Quais são os valores da Ordem Masayoshi?", label: "Valores da MSY" },
    { prompt: "Como funciona a estrutura da MSY?", label: "Estrutura da MSY" }
  ];

  if (!sigla || tipo === "admin") return [
    { prompt: "Me dê um panorama geral do estado atual da Ordem.", label: "Panorama da Ordem" },
    { prompt: "Quais membros estão ativos na MSY?", label: "Membros ativos" },
    { prompt: "Quais são os valores e pilares da MSY?", label: "Valores e pilares" }
  ];

  const sugestoesPorSigla = {
    "C.G.": [
      { prompt: "Como está a dinâmica atual dos membros da Ordem?", label: "Dinâmica dos membros" },
      { prompt: "Quais são os principais desafios de gestão da MSY?", label: "Desafios de gestão" },
      { prompt: "Me ajude a pensar em como fortalecer a coesão da Ordem.", label: "Coesão da Ordem" }
    ],
    "C.E.": [
      { prompt: "Como está a estrutura organizacional atual da MSY?", label: "Estrutura organizacional" },
      { prompt: "Me ajude a pensar em processos internos para a Ordem.", label: "Processos internos" },
      { prompt: "Quais são os pilares formais da MSY?", label: "Pilares formais" }
    ],
    "S.G.": [
      { prompt: "Como a MSY se comunica e se posiciona internamente?", label: "Comunicação interna" },
      { prompt: "Me ajude a pensar na identidade e narrativa da Ordem.", label: "Identidade da Ordem" },
      { prompt: "Quais são os valores que definem a MSY?", label: "Valores da MSY" }
    ],
    "S.E.I.": [
      { prompt: "O que precisa ser executado na Ordem atualmente?", label: "Execução atual" },
      { prompt: "Me ajude a transformar uma ideia em ação concreta.", label: "Ideia em ação" },
      { prompt: "Como posso contribuir melhor com a MSY?", label: "Minha contribuição" }
    ],
    "A.I.": [
      { prompt: "Como posso ajudar novos membros a se integrar melhor?", label: "Integração de membros" },
      { prompt: "Quais são os valores que todo membro deve conhecer?", label: "Valores essenciais" },
      { prompt: "Como está o clima interno da Ordem?", label: "Clima interno" }
    ],
    "D.O.": [
      { prompt: "Como a identidade visual representa os valores da MSY?", label: "Identidade visual" },
      { prompt: "Me inspire com a essência e simbolismo da Ordem.", label: "Essência da Ordem" },
      { prompt: "Quais elementos visuais representam melhor a MSY?", label: "Elementos da MSY" }
    ]
  };

  return sugestoesPorSigla[sigla] || [
    { prompt: "Quais são os valores da Ordem Masayoshi?", label: "Valores da MSY" },
    { prompt: "Explique a estrutura e cargos da Ordem Masayoshi.", label: "Estrutura da MSY" },
    { prompt: "Como posso contribuir melhor com a Ordem?", label: "Minha contribuição" }
  ];
}

function showWelcomeMessage() {
  const conv = getActiveConversation();
  if (!conv) return;

  if ((conv.messages || []).length === 0) {
    const chatMessages = document.getElementById("chatMessages");
    if (!chatMessages) return;

    const nome = USUARIO_PERFIL?.nome_interno || USUARIO_PERFIL?.nome || "visitante";
    const saudacao = IS_CONVIDADO ? "Olá! Sou Corvus" : `Olá, ${nome}`;
    const sugestoes = getSugestoesPorCargo();

    const icones = [
      `<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>`,
      `<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>`,
      `<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>`
    ];

    const cardsHTML = sugestoes.map((s, i) => `
      <div class="suggestion-card welcome-card" data-prompt="${s.prompt}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          ${icones[i % icones.length]}
        </svg>
        <p>${s.label}</p>
      </div>
    `).join("");

    const welcomeHTML = `
      <div class="welcome-section" id="welcomeSection">
        <h2 class="welcome-title">${saudacao}</h2>
        <p class="welcome-subtitle">
          Agente oficial da MSY. Posso te ajudar com informações sobre
          a Ordem Masayoshi, estrutura, valores e muito mais.
        </p>
        <div class="suggestions-grid">${cardsHTML}</div>
      </div>
    `;

    chatMessages.innerHTML = welcomeHTML;

    document.querySelectorAll(".welcome-card").forEach((card) => {
      card.addEventListener("click", () => {
        const prompt = card.getAttribute("data-prompt");
        const input = document.getElementById("messageInput");
        if (!prompt || !input) return;
        input.value = prompt;
        input.focus();
        sendMessage();
      });
    });
  }
}

async function sendMessage() {
  const messageInput = document.getElementById("messageInput");
  const message = (messageInput?.value || "").trim();

  if (!message) return;
  if (!WEBHOOK_URL || WEBHOOK_URL === "COLOQUE_AQUI_A_URL_DO_WEBHOOK_DO_N8N") {
    mostrarNotificacao("Erro: URL do webhook não configurada.", "erro");
    return;
  }

  ensureActiveConversation();
  const conv = getActiveConversation();
  if (!conv) return;

  messageInput.value = "";
  messageInput.style.height = "auto";
  setLoading(true);

  removeWelcomeIfPresent();

  await appendMessage("user", message);

  autoTitleConversationIfNeeded(conv.id);

  showTypingIndicator();

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: message,
        userId: USER_ID,
        sessionId: conv.sessionId,
        conversationId: conv.id,
        modo: MODO_FENRIR ? "fenrir" : "corvus",
        userContext: {
          nome: USUARIO_PERFIL?.nome_interno || USUARIO_PERFIL?.nome || "Convidado",
          cargo: USUARIO_PERFIL?.cargo || "",
          sigla: USUARIO_PERFIL?.sigla_cargo || "",
          tipo: IS_CONVIDADO ? "convidado" : (USUARIO_PERFIL?.tipo || "membro")
        }
      }),
    });

    if (!response.ok) throw new Error("Falha na comunicação com o servidor");

    const rawData = await response.text();

    let data;
    try {
      data = JSON.parse(rawData);
    } catch (e) {
      throw new Error("Resposta inválida do servidor");
    }

    removeTypingIndicator();

    if (Array.isArray(data)) data = data[0] || {};

    const reply =
      data.reply ||
      data.output ||
      data.response ||
      data.text ||
      data.message ||
      (data.choices && data.choices[0]?.message?.content) ||
      "Resposta não disponível";

    await appendMessage("corvus", reply);
  } catch (error) {
    removeTypingIndicator();
    mostrarNotificacao("Corvus está indisponível: " + error.message, "erro");
  } finally {
    setLoading(false);
  }
}

async function appendMessage(role, text, saveToHistory = true) {
  const chatMessages = document.getElementById("chatMessages");
  if (!chatMessages) return;

  const rawText = normalizeForStorage(text);
  const displayText = role === "corvus"
    ? (typeof marked !== "undefined" ? marked.parse(rawText) : sanitizeForDisplay(rawText))
    : sanitizeForDisplay(rawText);

  const messageDiv = document.createElement("div");
  messageDiv.className = `message ${role}`;

  const timestamp = new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const nomeUsuario = USUARIO_PERFIL?.nome_interno || USUARIO_PERFIL?.nome || "U";
  const inicialUsuario = nomeUsuario.charAt(0).toUpperCase();
  const logoSrc = CURRENT_THEME === 'light' ? 'corvuslogolight.png' : 'corvuslogo.png';
  const avatarHTML =
    role === "corvus"
      ? `<img src="${logoSrc}" alt="Corvus" class="avatar-image" loading="lazy" />`
      : `<span>${inicialUsuario}</span>`;

  const fenrirTagHTML = (role === "corvus" && MODO_FENRIR)
    ? `<div class="fenrir-tag">⚡ Fenrir</div>`
    : "";

  messageDiv.innerHTML = `
    <div class="message-avatar">${avatarHTML}</div>
    <div class="message-content">
      ${fenrirTagHTML}
      <div class="message-bubble">${displayText}</div>
      <div class="message-actions">
        <span class="message-timestamp">${timestamp}</span>
        ${
          role === "corvus"
            ? `
          <button class="btn-copy" onclick="copyMessage(this)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            Copiar
          </button>
        `
            : ""
        }
      </div>
    </div>
  `;

  chatMessages.appendChild(messageDiv);
  scrollToBottom();

  if (saveToHistory) {
    await saveMessageToActiveConversation({
      role,
      text: rawText,
      timestamp,
      createdAt: Date.now(),
    });
  }
}

function showTypingIndicator() {
  const chatMessages = document.getElementById("chatMessages");
  if (!chatMessages) return;

  const existing = document.getElementById("typingIndicator");
  if (existing) existing.remove();

  const typingDiv = document.createElement("div");
  typingDiv.className = "typing-indicator";
  typingDiv.id = "typingIndicator";

  const logoSrc = CURRENT_THEME === 'light' ? 'corvuslogolight.png' : 'corvuslogo.png';
  const avatarHTML = `<img src="${logoSrc}" alt="Corvus" class="avatar-image" />`;

  typingDiv.innerHTML = `
    <div class="message-avatar">${avatarHTML}</div>
    <div class="message-content">
      <div class="typing-dots">
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
        <div class="typing-dot"></div>
      </div>
      <div class="typing-text">
        Corvus pensando<span class="typing-ellipsis"></span>
      </div>
    </div>
  `;

  chatMessages.appendChild(typingDiv);
  scrollToBottom();
}

function removeTypingIndicator() {
  const typingIndicator = document.getElementById("typingIndicator");
  if (typingIndicator) typingIndicator.remove();
}

function removeWelcomeIfPresent() {
  const welcome = document.getElementById("welcomeSection");
  if (welcome) welcome.remove();
}

window.copyMessage = function(button) {
  const messageText = button.closest(".message-content").querySelector(".message-bubble").innerText;
  navigator.clipboard.writeText(messageText).then(() => {
    const originalText = button.innerHTML;
    button.innerHTML = '<span style="color: var(--color-primary);">✓ Copiado</span>';
    if (navigator.vibrate) navigator.vibrate(20);
    setTimeout(() => {
      button.innerHTML = originalText;
    }, 2000);
  });
};

// ===== UTILIDADES =====
function sanitizeForDisplay(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML.replace(/\n/g, "<br>");
}

function normalizeForStorage(text) {
  return (text ?? "").toString();
}

function setLoading(isLoading) {
  const sendBtn = document.getElementById("sendBtn");
  const messageInput = document.getElementById("messageInput");
  if (sendBtn) sendBtn.disabled = isLoading;
  if (messageInput) messageInput.disabled = isLoading;
}

function scrollToBottom() {
  const chatMessages = document.getElementById("chatMessages");
  if (!chatMessages) return;
  setTimeout(() => {
    chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: "smooth" });
  }, 100);
}

function generateSessionId() {
  return "session_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
}

// ===== HISTÓRICO / CONVERSAS =====
function ensureHistoryContainer() {
  let chatList = document.getElementById("chatList");
  if (chatList) return;

  const sidebar = document.getElementById("sidebar");
  const sidebarContent = sidebar?.querySelector(".sidebar-content");
  const newChatBtn = document.getElementById("newChatBtn");

  if (!sidebarContent || !newChatBtn) return;

  chatList = document.createElement("div");
  chatList.id = "chatList";
  chatList.className = "chat-list";

  newChatBtn.insertAdjacentElement("afterend", chatList);
}

async function loadConversationsFromStorage() {
  if (!IS_CONVIDADO) {
    conversations = await sbCarregarConversas();
    const active = localStorage.getItem(ACTIVE_CHAT_KEY + "_" + USER_ID);
    activeConversationId = active || null;
    await Promise.all(conversations.map(c => gerarTituloSeNecessario(c)));
  } else {
    const raw = localStorage.getItem(STORAGE_KEY);
    conversations = raw ? safeJsonParse(raw, []) : [];
    const active = localStorage.getItem(ACTIVE_CHAT_KEY);
    activeConversationId = active || null;
  }
}

function persistConversationsToStorage() {
  if (IS_CONVIDADO) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
    if (activeConversationId) localStorage.setItem(ACTIVE_CHAT_KEY, activeConversationId);
  } else {
    if (activeConversationId) localStorage.setItem(ACTIVE_CHAT_KEY + "_" + USER_ID, activeConversationId);
  }
}

function safeJsonParse(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function ensureActiveConversation() {
  if (!Array.isArray(conversations) || conversations.length === 0) {
    const first = makeConversation("Nova conversa");
    conversations = [first];
    activeConversationId = first.id;
    persistConversationsToStorage();
    return;
  }

  const exists = conversations.some((c) => c.id === activeConversationId);
  if (!activeConversationId || !exists) {
    const mostRecent = [...conversations].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
    activeConversationId = mostRecent?.id || conversations[0].id;
    persistConversationsToStorage();
  }
}

function makeConversation(title) {
  const now = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  return {
    id: "chat_" + now + "_" + rand,
    title: title || "Nova conversa",
    createdAt: now,
    updatedAt: now,
    sessionId: generateSessionId(),
    messages: [],
  };
}

function getActiveConversation() {
  return conversations.find((c) => c.id === activeConversationId) || null;
}

async function setActiveConversation(chatId, closeMenuOnMobile = false) {
  const conv = conversations.find((c) => c.id === chatId);
  if (!conv) return;

  activeConversationId = chatId;
  persistConversationsToStorage();

  if (!IS_CONVIDADO) {
    const msgs = await sbCarregarMensagens(chatId);
    conv.messages = msgs;
  }

  renderChatList(document.getElementById("searchInput")?.value?.trim() || "");
  loadActiveConversationMessages();
  showWelcomeMessage();

  if (closeMenuOnMobile) closeMobileMenu();
}

async function createNewConversation(closeMenuOnMobile = false) {
  const conv = makeConversation("Nova conversa");
  conversations.unshift(conv);
  activeConversationId = conv.id;
  persistConversationsToStorage();

  if (!IS_CONVIDADO) {
    await sbCriarConversa(conv);
  }

  const chatMessages = document.getElementById("chatMessages");
  if (chatMessages) chatMessages.innerHTML = "";

  renderChatList(document.getElementById("searchInput")?.value?.trim() || "");
  showWelcomeMessage();

  if (closeMenuOnMobile) closeMobileMenu();
}

async function deleteConversation(chatId) {
  const conv = conversations.find((c) => c.id === chatId);
  if (!conv) return;

  const ok = await mostrarModal(`Excluir "<strong>${escapeHtml(conv.title)}</strong>"?`, "Essa ação não pode ser desfeita.", "Excluir", "danger");
  if (!ok) return;

  conversations = conversations.filter((c) => c.id !== chatId);

  if (activeConversationId === chatId) {
    if (conversations.length === 0) {
      const fresh = makeConversation("Nova conversa");
      conversations = [fresh];
      activeConversationId = fresh.id;
    } else {
      activeConversationId = conversations[0].id;
    }

    const chatMessages = document.getElementById("chatMessages");
    if (chatMessages) chatMessages.innerHTML = "";
    loadActiveConversationMessages();
    showWelcomeMessage();
  }

  persistConversationsToStorage();
  if (!IS_CONVIDADO) await sbDeletarConversa(chatId);
  renderChatList(document.getElementById("searchInput")?.value?.trim() || "");
}

async function renameConversation(chatId) {
  const conv = conversations.find((c) => c.id === chatId);
  if (!conv) return;

  const next = prompt("Novo nome da conversa:", conv.title);
  if (next === null) return;

  const trimmed = next.trim();
  if (!trimmed) return;

  conv.title = trimmed;
  conv.updatedAt = Date.now();
  persistConversationsToStorage();
  if (!IS_CONVIDADO) await sbAtualizarConversa(conv.id, trimmed, conv.updatedAt);
  renderChatList(document.getElementById("searchInput")?.value?.trim() || "");
}

function autoTitleConversationIfNeeded(chatId) {
  const conv = conversations.find((c) => c.id === chatId);
  if (!conv) return;

  if (conv.title && conv.title !== "Nova conversa") return;

  const firstUser = (conv.messages || []).find((m) => m.role === "user");
  if (!firstUser) return;

  const plain = stripHtml(firstUser.text || "").replace(/\s+/g, " ").trim();
  if (!plain) return;

  conv.title = plain.length > 32 ? plain.slice(0, 32).trim() + "…" : plain;
  conv.updatedAt = Date.now();
  persistConversationsToStorage();
  if (!IS_CONVIDADO) {
    sbAtualizarConversa(conv.id, conv.title, conv.updatedAt).catch(e => mostrarNotificacao("Erro ao atualizar título", "erro"));
  }
  renderChatList(document.getElementById("searchInput")?.value?.trim() || "");
}

function stripHtml(html) {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || div.innerText || "";
}

async function saveMessageToActiveConversation(message) {
  const conv = getActiveConversation();
  if (!conv) return;

  conv.messages = conv.messages || [];
  conv.messages.push(message);
  conv.updatedAt = Date.now();

  persistConversationsToStorage();

  if (!IS_CONVIDADO) {
    await sbSalvarMensagem(conv.id, message.role, message.text);
    await sbAtualizarConversa(conv.id, conv.title, conv.updatedAt);
    if (message.role === "corvus") mostrarFeedbackSalvo();
  }

  renderChatList(document.getElementById("searchInput")?.value?.trim() || "");
}

function loadActiveConversationMessages() {
  const chatMessages = document.getElementById("chatMessages");
  if (!chatMessages) return;

  const conv = getActiveConversation();
  if (!conv) return;

  chatMessages.innerHTML = "";

  (conv.messages || []).forEach((m) => {
    const text =
      typeof m.text === "string" && m.text.includes("<br")
        ? m.text.replace(/<br\s*\/?>/gi, "\n")
        : m.text;

    appendMessage(m.role, text, false);
  });
}

function getDateGroup(ts) {
  const now = new Date();
  const d = new Date(ts);
  const diffDays = Math.floor((now - d) / 86400000);
  const todayStr = now.toDateString();
  const dStr = d.toDateString();

  if (dStr === todayStr) return "Hoje";
  if (diffDays === 1) return "Ontem";
  if (diffDays <= 7) return "Últimos 7 dias";
  if (diffDays <= 30) return "Últimos 30 dias";
  const month = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return month.charAt(0).toUpperCase() + month.slice(1);
}

function renderChatList(filterText = "") {
  const chatList = document.getElementById("chatList");
  if (!chatList) return;

  const q = (filterText || "").toLowerCase().trim();
  const list = [...conversations].sort((a, b) => {
    const aTime = b.updatedAt || b.createdAt || 0;
    const bTime = a.updatedAt || a.createdAt || 0;
    return aTime - bTime;
  });
  const filtered = q
    ? list.filter((c) => (c.title || "").toLowerCase().includes(q))
    : list;

  if (filtered.length === 0) {
    chatList.innerHTML = `<div class="chat-list-empty">${q ? "Nenhuma conversa encontrada." : "Nenhuma conversa ainda."}</div>`;
    return;
  }

  const groups = {};
  const groupOrder = [];
  filtered.forEach(c => {
    const group = getDateGroup(c.updatedAt);
    if (!groups[group]) { groups[group] = []; groupOrder.push(group); }
    groups[group].push(c);
  });

  const renderItem = (c) => {
    const isActive = c.id === activeConversationId;
    const title = escapeHtml(c.title || "Nova conversa");
    const meta = formatChatMeta(c.updatedAt || c.createdAt);
    return `
      <div class="chat-item ${isActive ? "active" : ""}" data-chat-id="${c.id}" title="${title}">
        <div class="chat-item-main">
          <div class="chat-item-title">${title}</div>
          <div class="chat-item-meta">${meta}</div>
        </div>
        <div class="chat-item-actions">
          <button class="chat-action-btn rename" aria-label="Renomear">✎</button>
          <button class="chat-action-btn delete" aria-label="Excluir">🗑</button>
        </div>
      </div>
    `;
  };

  if (q || groupOrder.length === 1) {
    chatList.innerHTML = filtered.map(renderItem).join("");
  } else {
    chatList.innerHTML = groupOrder.map(group => `
      <div class="chat-group">
        <div class="chat-group-label">${group}</div>
        ${groups[group].map(renderItem).join("")}
      </div>
    `).join("");
  }
}

function formatChatMeta(ts) {
  if (!ts || ts <= 0) return "";
  const now = new Date();
  const d = new Date(ts);
  // Verificar se é uma data válida
  if (isNaN(d.getTime())) return "";
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "Agora";
  if (diffMin < 60) return `${diffMin}min atrás`;
  if (diffHrs < 24 && d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  if (diffDays === 1) {
    return "Ontem " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  if (diffDays < 7) {
    return d.toLocaleDateString("pt-BR", { weekday: "short" }) + " " +
           d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ===== MODAL CUSTOMIZADO =====
function mostrarModal(titulo, mensagem, btnConfirmar = "Confirmar", tipo = "default") {
  return new Promise((resolve) => {
    document.getElementById("corvusModal")?.remove();

    const modal = document.createElement("div");
    modal.id = "corvusModal";
    modal.className = "corvus-modal-overlay";
    modal.innerHTML = `
      <div class="corvus-modal">
        <div class="corvus-modal-title">${titulo}</div>
        <div class="corvus-modal-msg">${mensagem}</div>
        <div class="corvus-modal-actions">
          <button class="corvus-modal-btn cancel" id="modalCancel">Cancelar</button>
          <button class="corvus-modal-btn confirm" id="modalConfirm">${btnConfirmar}</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add("visible"));

    const fechar = (resultado) => {
      modal.classList.remove("visible");
      setTimeout(() => modal.remove(), 200);
      resolve(resultado);
    };

    document.getElementById("modalConfirm").addEventListener("click", () => fechar(true));
    document.getElementById("modalCancel").addEventListener("click", () => fechar(false));
    modal.addEventListener("click", (e) => { if (e.target === modal) fechar(false); });
  });
}

// ===== FEEDBACK DE SALVAMENTO =====
function mostrarFeedbackSalvo() {
  const existing = document.getElementById("feedbackSalvo");
  if (existing) { existing.remove(); }

  const el = document.createElement("div");
  el.id = "feedbackSalvo";
  el.className = "feedback-salvo";
  el.textContent = "✓ Conversa salva";
  document.body.appendChild(el);

  requestAnimationFrame(() => el.classList.add("visible"));
  setTimeout(() => {
    el.classList.remove("visible");
    setTimeout(() => el.remove(), 300);
  }, 2000);
}

// ===== MODAL DE CONTA (conforme print) =====
function mostrarModalConta() {
  document.getElementById("corvusModal")?.remove();

  const nome = USUARIO_PERFIL?.nome_interno || USUARIO_PERFIL?.nome || "—";
  const cargo = USUARIO_PERFIL?.cargo || USUARIO_PERFIL?.sigla_cargo || "—";
  const tipo = USUARIO_PERFIL?.tipo || "membro";
  const tipoDisplay = tipo.charAt(0).toUpperCase() + tipo.slice(1);

  const modal = document.createElement("div");
  modal.id = "corvusModal";
  modal.className = "corvus-modal-overlay";
  modal.innerHTML = `
    <div class="corvus-modal conta-modal">
      <div class="conta-modal-header">
        <div class="conta-avatar">${nome.charAt(0).toUpperCase()}</div>
        <div class="conta-info">
          <div class="conta-nome">${escapeHtml(nome)}</div>
          <div class="conta-cargo">${escapeHtml(cargo)}</div>
        </div>
      </div>
      <div class="conta-divider"></div>
      <div class="conta-campo">
        <span class="conta-label">Acesso</span>
        <span class="conta-valor tipo-${tipo}">${tipoDisplay}</span>
      </div>
      <div class="conta-campo">
        <span class="conta-label">Aparência</span>
        <div class="theme-switcher">
          <button class="theme-opt ${CURRENT_THEME === 'dark' ? 'active' : ''}" data-t="dark">Escuro</button>
          <button class="theme-opt ${CURRENT_THEME === 'light' ? 'active' : ''}" data-t="light">Claro</button>
          <button class="theme-opt ${CURRENT_THEME === 'gray' ? 'active' : ''}" data-t="gray">Cinza</button>
        </div>
      </div>
      <div class="conta-divider"></div>
      <div class="corvus-modal-actions" style="justify-content:space-between">
        <button class="corvus-modal-btn cancel" id="modalCancel">Fechar</button>
        <button class="corvus-modal-btn confirm logout-btn" id="modalLogout">Sair da conta</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add("visible"));

  document.querySelectorAll(".theme-opt").forEach(btn => {
    btn.addEventListener("click", () => {
      CURRENT_THEME = btn.getAttribute("data-t");
      localStorage.setItem('corvus_theme', CURRENT_THEME);
      applyTheme();
      // Atualizar botões ativos
      document.querySelectorAll(".theme-opt").forEach(b => {
        b.classList.toggle("active", b.getAttribute("data-t") === CURRENT_THEME);
      });
    });
  });

  document.getElementById("modalCancel").addEventListener("click", () => {
    modal.classList.remove("visible");
    setTimeout(() => modal.remove(), 200);
  });

  document.getElementById("modalLogout").addEventListener("click", () => {
    modal.remove();
    fazerLogout();
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.classList.remove("visible");
      setTimeout(() => modal.remove(), 200);
    }
  });
}

// ===== TOUR INICIAL =====
function mostrarTour() {
  const btnNovo = document.getElementById("newChatBtn");
  if (btnNovo) {
    btnNovo.style.transition = 'box-shadow 0.2s';
    btnNovo.style.boxShadow = '0 0 0 4px rgba(220,38,38,0.3)';
    setTimeout(() => {
      btnNovo.style.boxShadow = '';
    }, 3000);
  }

  mostrarNotificacao("Dica: use Ctrl+N para novo chat, Ctrl+K para buscar", "sucesso");
}