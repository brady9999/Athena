// ---------------- STATE ----------------
const state = {
  convos: [],
  activeId: null,
  theme: localStorage.getItem('theme') || 'dark'
};

let mode = "mean"; // default personality

// ---------------- HELPERS ----------------
const $ = sel => document.querySelector(sel);
const el = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);
  Object.assign(node, props);
  children.forEach(c => node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
  return node;
};
const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// ---------------- THEME ----------------
function applyTheme(t) {
  document.body.classList.remove('light', 'dark');
  document.body.classList.add(t);
}
applyTheme(state.theme);

// ---------------- ID GENERATOR ----------------
function generateId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// ---------------- CONVERSATIONS ----------------
function setActive(id) {
  state.activeId = id;
  renderConvos();
  renderChat();
  save();
}

function currentConvo() {
  return state.convos.find(c => c.id === state.activeId);
}

function newConvo() {
  const convo = { id: generateId(), title: "Untitled", messages: [] };
  state.convos.push(convo);
  setActive(convo.id);
  save();
  return convo;
}

function addMessage(role, content) {
  let convo = currentConvo();
  if (!convo) convo = newConvo();
  const msg = { id: generateId(), role, content, time: now() };
  convo.messages.push(msg);

  if (!convo.title || convo.title === 'Untitled') {
    convo.title = content.slice(0, 40) + (content.length > 40 ? '…' : '');
  }

  renderChat();
  renderConvos();
  save();
  return msg;
}

// ---------------- PERSISTENCE ----------------
function save() {
  localStorage.setItem('athena_ai', JSON.stringify({
    convos: state.convos,
    activeId: state.activeId,
    theme: state.theme
  }));
}
function load() {
  const raw = localStorage.getItem('athena_ai');
  if (!raw) return newConvo();
  const data = JSON.parse(raw);
  Object.assign(state, data);
  applyTheme(state.theme);
  renderConvos();
  renderChat();
}

// ---------------- RENDERING ----------------
function renderConvos() {
  const list = $('#convos');
  list.innerHTML = '';
  state.convos.forEach(c => {
    const item = el('button', { 
      className: 'convo' + (c.id === state.activeId ? ' active' : ''), 
      onclick: () => setActive(c.id) 
    }, [
      el('span', { textContent: c.title }),
      el('span', { textContent: c.messages?.length || 0 })
    ]);
    list.appendChild(item);
  });
}

function bubble(role, content, time) {
  return el('article', { className: `bubble ${role}` }, [
    el('div', { className: 'avatar', 'aria-hidden': 'true' }),
    el('div', {}, [
      el('div', { className: 'content', textContent: content }),
      el('div', { className: 'meta', textContent: time ? `${role} • ${time}` : role })
    ])
  ]);
}

function renderChat() {
  const feed = $('#chat');
  feed.innerHTML = '';
  const convo = currentConvo();
  if (!convo || convo.messages.length === 0) {
    const greeting = document.querySelector('article.bubble.assistant');
    if (greeting) feed.appendChild(greeting.cloneNode(true));
    return;
  }
  convo.messages.forEach(m => feed.appendChild(bubble(m.role, m.content, m.time)));
  feed.scrollTop = feed.scrollHeight;
}

// ---------------- CHAT LOGIC ----------------
document.addEventListener("DOMContentLoaded", () => {
  const sendBtn = $("#sendBtn");
  const promptInput = $("#prompt");
  const typingIndicator = $("#typingIndicator");

  async function sendMessage() {
    const message = promptInput.value.trim();
    if (!message) return;

    addMessage("user", message);
    promptInput.value = "";

    // Show typing indicator
    typingIndicator.classList.remove("hidden");

    try {
      const res = await fetch("/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, mode })
      });
      const data = await res.json();

      // Hide typing indicator
      typingIndicator.classList.add("hidden");

      addMessage("assistant", data.reply);
    } catch (err) {
      typingIndicator.classList.add("hidden");
      addMessage("assistant", "⚠️ Error connecting to Athena backend.");
    }
  }

  sendBtn.addEventListener("click", sendMessage);
  promptInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // ---------------- BUTTONS ----------------
  // Mode toggle
  const modeBtn = $("#modeBtn");
  modeBtn.addEventListener("click", () => {
    mode = mode === "mean" ? "nice" : "mean";
    modeBtn.textContent = `Mode: ${mode.charAt(0).toUpperCase() + mode.slice(1)}`;
    modeBtn.className = mode; // apply .mean or .nice class
  });

  // Theme toggle
  $('#themeBtn').addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme(state.theme);
    save();
  });

  // Clear conversations
  $('#clearBtn').addEventListener('click', () => {
    if (!confirm('Clear all conversations?')) return;
    state.convos = [];
    state.activeId = null;
    save();
    newConvo();
  });

  // New chat
  $('#newChatBtn').addEventListener('click', () => newConvo());

  // Suggestions
  document.querySelectorAll('#suggestions .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      $('#prompt').value = chip.textContent;
      sendMessage();
    });
  });

  // Boot
  load();
});