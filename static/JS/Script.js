/* Script.js — Athena client interactions (polished, persisted, mode-aware) */

const STORAGE_KEY = 'athena_ai_v1';
const MODE_KEY = 'athena_mode';
const THEME_KEY = 'athena_theme';

// ---------------- State ----------------
const state = {
  convos: [],
  activeId: null,
  theme: localStorage.getItem(THEME_KEY) || 'dark',
  mode: localStorage.getItem(MODE_KEY) || 'mean'
};

// ---------------- Helpers ----------------
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.keys(props).forEach(k => {
    if (k === 'className') node.className = props[k];
    else if (k === 'dataset') Object.assign(node.dataset, props[k]);
    else if (k.startsWith('aria-')) node.setAttribute(k, props[k]);
    else node[k] = props[k];
  });
  children.forEach(c => node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
  return node;
}

function nowTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function generateId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2, 10);
}

// ---------------- Persistence ----------------
function saveState() {
  try {
    const payload = {
      convos: state.convos,
      activeId: state.activeId
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    localStorage.setItem(MODE_KEY, state.mode);
    localStorage.setItem(THEME_KEY, state.theme);
  } catch (e) {
    console.warn('Failed to save state', e);
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // seed a default convo
      const first = {
        id: generateId(),
        title: 'Welcome',
        messages: [
          { id: generateId(), role: 'Athena', content: 'Hey — what are we building today?', time: nowTime() }
        ]
      };
      state.convos = [first];
      state.activeId = first.id;
      return;
    }
    const data = JSON.parse(raw);
    state.convos = Array.isArray(data.convos) ? data.convos : [];
    state.activeId = data.activeId || (state.convos[0] && state.convos[0].id) || null;
  } catch (e) {
    console.warn('Failed to load state, seeding new convo', e);
    state.convos = [];
    state.activeId = null;
  }
}

// ---------------- UI Render ----------------
function currentConvo() {
  return state.convos.find(c => c.id === state.activeId);
}

function renderConvos() {
  const list = $('#convos');
  if (!list) return;
  list.innerHTML = '';
  state.convos.forEach(c => {
    const btn = el('button', {
      className: 'convo' + (c.id === state.activeId ? ' active' : ''),
      type: 'button',
      onclick: () => setActive(c.id)
    }, [
      el('div', { className: 'dot' }),
      el('div', { className: 'label', textContent: c.title || 'Untitled' }),
      el('span', { textContent: String(c.messages?.length || 0) })
    ]);
    list.appendChild(btn);
  });
}

function bubbleNode(role, content, time) {
  return el('article', { className: `bubble ${role}` }, [
    el('div', { className: 'avatar', 'aria-hidden': 'true', textContent: role === 'Athena' ? '' : '🙂' }),
    el('div', {}, [
      el('div', { className: 'content', textContent: content }),
      el('div', { className: 'meta', textContent: time ? `${role} • ${time}` : role })
    ])
  ]);
}

function renderChat() {
  const feed = $('#chat');
  if (!feed) return;
  feed.innerHTML = '';
  const convo = currentConvo();
  if (!convo || !convo.messages || convo.messages.length === 0) {
    // render a lightweight greeting if none
    const greeting = el('article', { className: 'bubble Athena' }, [
      el('div', { className: 'avatar', 'aria-hidden': 'true', textContent: '' }),
      el('div', {}, [ el('div', { className: 'content', textContent: 'Hey — what are we building today?' }) ])
    ]);
    feed.appendChild(greeting);
    return;
  }
  convo.messages.forEach(m => feed.appendChild(bubbleNode(m.role, m.content, m.time)));
  feed.scrollTop = feed.scrollHeight;
}

// ---------------- Conversation management ----------------
function setActive(id) {
  state.activeId = id;
  renderConvos();
  renderChat();
  saveState();
}

function newConvo(prefillTitle) {
  const convo = { id: generateId(), title: prefillTitle || 'Untitled', messages: [] };
  state.convos.unshift(convo);
  setActive(convo.id);
  saveState();
  return convo;
}

function addMessage(role, content) {
  let convo = currentConvo();
  if (!convo) convo = newConvo();
  const msg = { id: generateId(), role, content, time: nowTime() };
  convo.messages.push(msg);
  // set title if not set
  if (!convo.title || convo.title === 'Untitled') {
    convo.title = (content || '').slice(0, 40) + ((content || '').length > 40 ? '…' : '');
  }
  renderChat();
  renderConvos();
  saveState();
  return msg;
}

// ---------------- Mode handling ----------------
function setMode(m) {
  state.mode = m === 'nice' ? 'nice' : 'mean';
  localStorage.setItem(MODE_KEY, state.mode);
  updateModeUI();
}

function toggleMode() {
  setMode(state.mode === 'mean' ? 'nice' : 'mean');
}

function updateModeUI() {
  const btn = $('#modeBtn');
  if (!btn) return;
  btn.textContent = `Mode: ${state.mode.charAt(0).toUpperCase() + state.mode.slice(1)}`;
  btn.classList.remove('mean', 'nice');
  btn.classList.add(state.mode);
  btn.setAttribute('aria-pressed', state.mode === 'mean' ? 'true' : 'false');
}

// ---------------- Typing indicator control ----------------
function showTyping(ms = 1200) {
  const t = $('#typingIndicator');
  if (!t) return;
  t.classList.remove('hidden');
  t.setAttribute('aria-hidden', 'false');
  // return cancel handle
  const handle = setTimeout(() => {
    t.classList.add('hidden');
    t.setAttribute('aria-hidden', 'true');
  }, ms);
  return () => {
    clearTimeout(handle);
    t.classList.add('hidden');
    t.setAttribute('aria-hidden', 'true');
  };
}

// ---------------- Local fallback tone ----------------
function applyLocalTone(input) {
  // deterministic and concise responses differing by mode
  if (state.mode === 'mean') {
    if (/deploy|dns|render|cname|domain/i.test(input)) {
      return "Check DNS, add the subdomain's CNAME/A, verify on the host, and inspect logs. Don't skip certs.";
    }
    if (/portfolio|design|hero|mascot/i.test(input)) {
      return "Make a bold hero, reduce sections, add one playful interaction, then ship and iterate.";
    }
    return "Be specific about which part you want fixed and I'll give a short plan.";
  } else {
    if (/deploy|dns|render|cname|domain/i.test(input)) {
      return "Start with your DNS records, add the subdomain CNAME, verify the host, and confirm TLS. I can walk you step-by-step.";
    }
    if (/portfolio|design|hero|mascot/i.test(input)) {
      return "Love that! Try a bold hero, playful micro-interactions, and focused sections. Want a layout sketch?";
    }
    return "Tell me which part you'd like help with and I'll break it down gently.";
  }
}

// ---------------- Send message / backend integration ----------------
async function sendMessageToBackend(messageText) {
  try {
    const res = await fetch('/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: messageText, mode: state.mode })
    });
    if (!res.ok) throw new Error('Network response not OK');
    const json = await res.json();
    return json && json.reply ? json.reply : null;
  } catch (e) {
    return null;
  }
}

let sendInProgress = false;

async function handleSend() {
  if (sendInProgress) return;
  const input = $('#prompt');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  // push user message
  addMessage('user', text);
  input.value = '';
  const cancelTyping = showTyping(10000); // long timeout; we'll cancel when reply arrives
  sendInProgress = true;

  // attempt backend
  const backendReply = await sendMessageToBackend(text);
  if (backendReply) {
    if (typeof cancelTyping === 'function') cancelTyping();
    addMessage('Athena', backendReply);
  } else {
    if (typeof cancelTyping === 'function') cancelTyping();
    const fallback = applyLocalTone(text) + ' (local fallback)';
    addMessage('Athena', fallback);
  }

  sendInProgress = false;
}

// ---------------- UI wiring ----------------
document.addEventListener('DOMContentLoaded', () => {
  // load persisted data
  loadState();                // real loadState (must exist earlier in file)
  // restore mode from localStorage if present
  const savedMode = localStorage.getItem(MODE_KEY);
  if (savedMode) state.mode = savedMode;
  applyTheme(state.theme || 'dark');
  updateModeUI();

  // initial render
  renderConvos();
  renderChat();

  // wire UI
  const sendBtn = $('#sendBtn');
  const promptInput = $('#prompt');
  if (sendBtn) sendBtn.addEventListener('click', handleSend);
  if (promptInput) {
    promptInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    });
  }

  const newChatBtn = $('#newChatBtn');
  if (newChatBtn) newChatBtn.addEventListener('click', () => newConvo('Untitled'));

  const clearBtn = $('#clearBtn');
  if (clearBtn) clearBtn.addEventListener('click', () => {
    const ok = confirm('Clear all conversations? This will remove saved chats locally.');
    if (!ok) return;
    state.convos = [];
    state.activeId = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { console.warn(e); }
    const starter = {
      id: generateId(),
      title: 'Welcome',
      messages: [{ id: generateId(), role: 'Athena', content: 'Hey — what are we building today?', time: nowTime() }]
    };
    state.convos = [starter];
    state.activeId = starter.id;
    saveState();
    renderConvos();
    renderChat();
  });

  const modeBtn = $('#modeBtn');
  if (modeBtn) modeBtn.addEventListener('click', () => toggleMode());
});



// ---------------- Theme helper ----------------
function applyTheme(t) {
  document.body.classList.remove('light', 'dark');
  document.body.classList.add(t === 'light' ? 'light' : 'dark');
  state.theme = t === 'light' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, state.theme);
}

// ---------------- Exports for debugging (optional) ----------------
window.Athena = {
  state,
  setMode,
  toggleMode,
  newConvo,
  addMessage,
  saveState,
  loadState
};

// ---------------- init loader ----------------
function loadState() {} // placeholder so linter doesn't complain if referenced earlier
// actual load executed earlier in DOMContentLoaded, but keep a safe no-op here to avoid runtime errors