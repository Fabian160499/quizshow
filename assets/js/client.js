// Gemeinsame Client-Funktionen: WebSocket mit automatischer Wiederverbindung,
// Aktionen mit eindeutiger ID (Idempotenz) und kleine DOM-Helfer.

// Im Browser-Prototyp stellt die umgebende Seite einen lokalen Server bereit
// (window.__quizServer). Dann laufen Verbindung und API-Aufrufe über ihn statt
// über das Netzwerk.
function findLocalServer() {
  let w = window;
  for (let i = 0; i < 5; i++) {
    try {
      if (w.__quizServer) return w.__quizServer;
    } catch {
      return null;
    }
    if (w.parent === w) return null;
    w = w.parent;
  }
  return null;
}

// Ist die umgebende Seite abgeschottet (anderer Ursprung, z. B. in einer
// eingebetteten Vorschau), geht kein direkter Zugriff. Die Prototyp-Seite gibt
// ihren Bildschirmen dann den Fensternamen „quiz-proto“ mit, und Verbindung und
// API laufen über postMessage zur umgebende Seite.
// Der Prototyp-Build setzt PROTOTYPE_BUILD auf true; in der echten Anwendung
// bleibt die Brücke aus.
const PROTOTYPE_BUILD = false;

function messageProxy() {
  if (window.parent === window || !(PROTOTYPE_BUILD || window.name === 'quiz-proto')) return null;
  const conns = new Map();
  const calls = new Map();
  let seq = 0;
  const post = (msg) => window.parent.postMessage({ quiz: true, ...msg }, '*');
  // Verschachtelte Bildschirme (z. B. die Beamer-Vorschau in der Moderation)
  // schicken ihre Nachrichten hierher; sie werden nach oben weitergereicht und
  // die Antworten anhand der IDs zurück nach unten.
  const children = new Map();
  window.addEventListener('message', (ev) => {
    const msg = ev.data;
    if (!msg || msg.quiz !== true) return;
    if (ev.source !== window.parent) {
      const key = msg.cid || msg.callId;
      if (ev.source && key) {
        children.set(key, ev.source);
        window.parent.postMessage(msg, '*');
      }
      return;
    }
    const child = children.get(msg.cid || msg.callId);
    if (child) {
      if (msg.op === 'api' || msg.op === 'media' || msg.op === 'close') children.delete(msg.cid || msg.callId);
      try {
        child.postMessage(msg, '*');
      } catch {
        // Verschachtelter Bildschirm existiert nicht mehr.
      }
      return;
    }
    if (msg.op === 'api' || msg.op === 'media') {
      const done = calls.get(msg.callId);
      calls.delete(msg.callId);
      return done?.(msg.op === 'api' ? [msg.status, msg.data] : msg);
    }
    const c = conns.get(msg.cid);
    if (!c) return;
    if (msg.op === 'open') {
      c.readyState = 1;
      c.onopen?.();
    } else if (msg.op === 'message') {
      c.onmessage?.({ data: msg.data });
    } else if (msg.op === 'close') {
      conns.delete(msg.cid);
      if (c.readyState !== 3) {
        c.readyState = 3;
        c.onclose?.();
      }
    }
  });
  return {
    demoToken: 'demo-token',
    connect() {
      const cid = `c${++seq}_${Math.random().toString(36).slice(2)}`;
      const c = {
        readyState: 0,
        send: (text) => post({ op: 'send', cid, text }),
        close: () => {
          if (c.readyState === 3) return;
          c.readyState = 3;
          conns.delete(cid);
          post({ op: 'close', cid });
        },
      };
      conns.set(cid, c);
      post({ op: 'connect', cid });
      return c;
    },
    api(name, body) {
      const callId = `a${++seq}`;
      return new Promise((resolve) => {
        calls.set(callId, resolve);
        post({ op: 'api', callId, name, body });
      });
    },
    // Videos als Blob über postMessage (strukturiert kopiert, kein Base64).
    uploadMedia(blob) {
      const callId = `m${++seq}`;
      return new Promise((resolve, reject) => {
        calls.set(callId, (m) => (m.error ? reject(new Error(m.error)) : resolve(m.data)));
        post({ op: 'media-put', callId, blob });
      });
    },
    getMedia(id) {
      const callId = `m${++seq}`;
      return new Promise((resolve) => {
        calls.set(callId, (m) => resolve(m.data || null));
        post({ op: 'media-get', callId, id });
      });
    },
  };
}

export const localServer = findLocalServer() || messageProxy();

if (localServer) {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    // Ohne new URL(): In eingebetteten Einzeldatei-Seiten (srcdoc) gibt es keine
    // auflösbare Seitenadresse.
    const raw = typeof input === 'string' ? input : input.url;
    const m = raw.split(/[?#]/)[0].match(/(?:^|\/)api\/(teams|login|logout|probe)$/);
    if (!m) return realFetch(input, init);
    const body = init?.body ? JSON.parse(init.body) : {};
    const [status, data] = await localServer.api(m[1], body);
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  };
}

// ---------- Medien (Intro-Video) ----------

// Video hochladen. onProgress(0…1) meldet den Fortschritt (echter Server).
export function uploadMedia(file, token, onProgress) {
  if (localServer) return localServer.uploadMedia(file);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'api/media');
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.setRequestHeader('X-Token', token);
    xhr.upload.onprogress = (ev) => ev.lengthComputable && onProgress?.(ev.loaded / ev.total);
    xhr.onload = () => {
      let body = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* leer */ }
      xhr.status === 200 ? resolve(body) : reject(new Error(body.error || 'Upload fehlgeschlagen.'));
    };
    xhr.onerror = () => reject(new Error('Upload fehlgeschlagen. Ist der Server erreichbar?'));
    xhr.send(file);
  });
}

// Abspielbare Adresse eines Videos (oder null, wenn es nicht mehr da ist).
const mediaUrls = new Map();
export async function mediaUrl(id) {
  if (!id) return null;
  if (!localServer) return `media/${id}`;
  if (mediaUrls.has(id)) return mediaUrls.get(id);
  const blob = await localServer.getMedia(id);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  mediaUrls.set(id, url);
  return url;
}

// Show-Titel in der Logo-Schrift; das Wort „uns“ wird hervorgehoben.
export function showTitle(name, tag = 'span', cls = '') {
  const words = String(name || '').trim().split(/(\s+)/);
  return h(tag, { class: `show-title ${cls}`.trim() }, words.map((w) => (/^uns$/i.test(w) ? h('span', { class: 'hot' }, w) : w)));
}
export function setShowTitle(el, name) {
  if (!el) return;
  el.classList.add('show-title');
  el.replaceChildren(...showTitle(name).childNodes);
}

// Münze der Show (Bild), z. B. in Listen und Bannern.
export function coinImg(cls = '') {
  return h('img', { class: `coin-img ${cls}`.trim(), src: 'assets/img/muenze.webp', alt: 'Münze', draggable: 'false' });
}

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k.startsWith('--')) el.style.setProperty(k, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// Bestätigungsdialog im Seiten-Design. Mit requireText muss ein Wort
// abgetippt werden, bevor die Aktion freigegeben wird.
// Mit fields (z. B. [{ name: 'name', label: 'Name', value: '' }]) fragt der Dialog
// Werte ab und liefert sie als Objekt statt true.
export function ask(message, { confirmLabel = 'Ja', cancelLabel = 'Abbrechen', requireText = null, danger = false, fields = null } = {}) {
  return new Promise((resolve) => {
    const input = requireText ? h('input', { id: 'ask-input', autocomplete: 'off', 'aria-label': `${requireText} eingeben` }) : null;
    const inputs = (fields || []).map((f, i) => {
      const attrs = { id: `ask-f${i}`, name: f.name, autocomplete: 'off', type: f.type || 'text', value: f.value ?? '' };
      if (f.type === 'checkbox') Object.assign(attrs, { value: null, checked: !!f.value, style: { width: 'auto', marginRight: '8px' } });
      if (f.maxlength) attrs.maxlength = String(f.maxlength);
      // Auswahlliste: f.options = [{ value, label }]
      const el = f.type === 'select'
        ? h('select', { id: attrs.id, name: f.name }, (f.options || []).map((o) => h('option', { value: o.value, selected: o.value === f.value }, o.label)))
        : h('input', attrs);
      return { f, el, node: f.type === 'checkbox' ? h('label', { style: { fontWeight: 400, display: 'block', marginTop: '10px' } }, el, f.label) : [h('label', { for: attrs.id }, f.label), el] };
    });
    const ok = h('button', { class: `btn ${danger ? 'bad' : 'pink'}`, type: 'submit', disabled: !!requireText }, confirmLabel);
    const close = (result) => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };
    const onKey = (ev) => ev.key === 'Escape' && close(false);
    const overlay = h('div', { class: 'modal-backdrop' },
      h('form', {
        class: 'modal card', role: 'dialog', 'aria-modal': 'true',
        onsubmit: (ev) => {
          ev.preventDefault();
          if (requireText && input.value.trim() !== requireText) return;
          if (!fields) return close(true);
          const values = {};
          for (const { f, el } of inputs) values[f.name] = f.type === 'checkbox' ? el.checked : el.value.trim();
          close(values);
        },
      },
      h('p', { class: 'modal-text' }, message),
      requireText ? [h('label', { for: 'ask-input' }, `Zum Bestätigen „${requireText}“ eingeben`), input] : null,
      inputs.flatMap((x) => x.node),
      h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '16px' } },
        h('button', { class: 'btn ghost', type: 'button', onclick: () => close(false) }, cancelLabel), ok)));
    if (input) input.addEventListener('input', () => (ok.disabled = input.value.trim() !== requireText));
    document.addEventListener('keydown', onKey);
    document.body.append(overlay);
    (input || inputs[0]?.el || ok).focus();
  });
}

// Größeres Info-Fenster (z. B. Generalprobe-Check, Beamer-Vorschau). Gibt close() zurück.
export function showModal(title, content, { wide = false } = {}) {
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (ev) => ev.key === 'Escape' && close();
  const overlay = h('div', { class: 'modal-backdrop', onclick: (ev) => { if (ev.target === overlay) close(); } },
    h('div', { class: `modal card info-modal${wide ? ' wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'row', style: { justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' } },
        h('h3', { style: { margin: 0 } }, title),
        h('button', { class: 'btn ghost small', type: 'button', onclick: close }, 'Schließen')),
      h('div', { class: 'info-modal-body' }, content)));
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  return close;
}

export function toast(message, kind = 'error') {
  const el = h('div', { class: `toast ${kind === 'info' ? 'info' : ''}`, role: 'status' }, message);
  document.body.append(el);
  setTimeout(() => el.remove(), 3500);
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    return null;
  }
  return value;
}

// Verbindet sich mit dem Server und hält die Verbindung. hello liefert die
// Anmeldedaten; onState wird bei jedem neuen Zustand aufgerufen.
export function connect({ hello, onState, onAuthFailed, onKicked, quiet = false }) {
  const pending = new Map();
  let ws;
  let retry = 0;
  let stopped = false;
  const badge = h('span', { class: 'badge conn', 'aria-live': 'polite' }, 'Verbinde …');
  if (!quiet) document.body.append(badge);

  function setStatus(ok, text) {
    badge.className = `badge conn ${ok ? 'ok' : 'warn'}`;
    badge.textContent = `${ok ? '●' : '○'} ${text}`;
  }

  function open() {
    if (localServer) {
      ws = localServer.connect();
    } else {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/ws`);
    }
    ws.onopen = () => {
      retry = 0;
      ws.send(JSON.stringify({ type: 'hello', ...hello() }));
    };
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'welcome') setStatus(true, 'Verbunden');
      if (msg.type === 'state') onState(msg.state, msg.serverTime);
      if (msg.type === 'ack') {
        const p = pending.get(msg.id);
        if (p) {
          pending.delete(msg.id);
          msg.ok ? p.resolve(msg) : p.reject(new Error(msg.error));
        }
      }
      if (msg.type === 'auth-failed') {
        stopped = true;
        setStatus(false, 'Nicht angemeldet');
        onAuthFailed?.(msg.message);
      }
      if (msg.type === 'kicked') {
        stopped = true;
        setStatus(false, 'Getrennt');
        onKicked?.(msg.message);
      }
    };
    ws.onclose = () => {
      if (stopped) return;
      setStatus(false, 'Verbindung unterbrochen – verbinde neu …');
      // Offene Aktionen werden mit derselben ID erneut gesendet; der Server
      // verarbeitet jede ID nur einmal.
      setTimeout(open, Math.min(5000, 500 * 2 ** retry++));
    };
  }

  function send(id, name, payload) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: 'action', id, name, payload }));
  }

  // Aktion senden; wiederholt sich bei Verbindungsabbruch, bis eine Antwort kommt.
  function action(name, payload = {}) {
    const id = uuid();
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      send(id, name, payload);
      const timer = setInterval(() => {
        if (!pending.has(id)) return clearInterval(timer);
        send(id, name, payload);
      }, 3000);
    });
  }

  // Im Prototyp beim Verlassen der Seite abmelden, damit der Verbindungsstatus stimmt.
  if (localServer) window.addEventListener('pagehide', () => {
    stopped = true;
    ws?.close();
  });

  open();
  return { action };
}

// Aktion ausführen und Fehler verständlich anzeigen.
export async function run(conn, name, payload) {
  try {
    const res = await conn.action(name, payload);
    if (res && res.notice) toast(res.notice, 'info');
    return res;
  } catch (err) {
    toast(err.message || 'Aktion fehlgeschlagen.');
    return null;
  }
}

// Blickschutz auf den Team-iPads: Nach dem Abgeben bleibt die eigene Antwort verdeckt,
// damit Nachbarteams nicht mitlesen. Gedrückt halten zeigt sie kurz an.
export function shield(...children) {
  const box = h('div', { class: 'shield' },
    h('div', { class: 'shield-content' }, ...children),
    h('div', { class: 'shield-cover' },
      h('b', {}, '🔒 Abgegeben'),
      h('small', {}, 'Blickschutz aktiv – zum Ansehen gedrückt halten')));
  const on = (ev) => { ev.preventDefault(); box.classList.add('peek'); };
  const off = () => box.classList.remove('peek');
  box.addEventListener('pointerdown', on);
  for (const t of ['pointerup', 'pointerleave', 'pointercancel']) box.addEventListener(t, off);
  box.addEventListener('contextmenu', (ev) => ev.preventDefault());
  return box;
}
