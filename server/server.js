'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { createStore } = require('./store');
const game = require('./game');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;
const DATA_FILE = process.env.QUIZ_DATA_FILE || path.join(ROOT, 'data', 'db.json');
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
// Medien (Intro-Videos) liegen als Dateien neben der Datenbank, nicht im JSON.
const MEDIA_DIR = process.env.QUIZ_MEDIA_DIR || path.join(path.dirname(DATA_FILE), 'media');
const MEDIA_MAX_BYTES = Number(process.env.QUIZ_MEDIA_MAX_MB || 1024) * 1024 * 1024;
const VIDEO_EXT = { 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov', 'video/ogg': '.ogv', 'video/x-m4v': '.m4v' };
// Lieder für die Pausen.
const AUDIO_EXT = { 'audio/mpeg': '.mp3', 'audio/mp3': '.mp3', 'audio/mp4': '.m4a', 'audio/x-m4a': '.m4a', 'audio/aac': '.aac', 'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/ogg': '.ogg', 'audio/flac': '.flac', 'audio/webm': '.weba' };
// Bilder für Spiele (z. B. „Ich weiß nicht, dass du weißt es doch“).
const IMAGE_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };
const MEDIA_EXT = { ...VIDEO_EXT, ...AUDIO_EXT, ...IMAGE_EXT };

// ---------- Speicher und Moderator-Zugang ----------

const store = createStore(DATA_FILE, () => ({ ...game.createState(), auth: { sessions: {} } }));
store.data = game.migrate(store.data);

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

// Moderator-/Admin-Passwort: dauerhaft „fabian“. Eine Umgebungsvariable
// QUIZ_ADMIN_PASSWORD kann es bei Bedarf weiterhin überschreiben.
const DEFAULT_PASSWORD = 'fabian';
function ensureModeratorPassword() {
  const db = store.data;
  db.auth = db.auth || { sessions: {} };
  const pw = process.env.QUIZ_ADMIN_PASSWORD || DEFAULT_PASSWORD;
  if (!db.auth.hash || !checkPassword(pw)) {
    const salt = crypto.randomBytes(16).toString('hex');
    db.auth.salt = salt;
    db.auth.hash = hashPassword(pw, salt);
    db.auth.sessions = {}; // alte Anmeldungen mit dem früheren Passwort ungültig machen
  }
  store.save();
}

function checkPassword(pw) {
  const { salt, hash } = store.data.auth;
  if (typeof pw !== 'string' || !salt) return false;
  const a = Buffer.from(hashPassword(pw, salt), 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Sitzungen der Regie; „host“-Sitzungen (Finale-iPad der Moderation, Passwort „fabian“)
// gelten nur für die Finale-Seite, nie für Regie, Editor oder Uploads.
function validSession(token, allowHost = false) {
  if (typeof token !== 'string') return false;
  const s = store.data.auth.sessions[token];
  if (!s || s.expires <= Date.now()) return false;
  return s.scope === 'host' ? allowHost : true;
}
const HOST_PASSWORD = 'fabian';
// Was das Finale-iPad der Moderation darf: nur die eigene Finalantwort abgeben.
const HOST_ACTIONS = new Set(['finale.modAnswer']);

// Einfache Bremse gegen Passwort-Raten: höchstens 10 Fehlversuche pro 10 Minuten und Adresse.
const failedLogins = new Map();
function loginBlocked(ip) {
  const now = Date.now();
  const list = (failedLogins.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  failedLogins.set(ip, list);
  return list.length >= 10;
}

// ---------- HTTP ----------

const STATIC = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/team.html': 'team.html',
  '/moderator.html': 'moderator.html',
  '/beamer.html': 'beamer.html',
  '/host.html': 'host.html',
};
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 10000) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
  });
}

function mediaPath(id) {
  if (typeof id !== 'string' || !/^media_[a-f0-9]{12,40}$/.test(id)) return null;
  if (!fs.existsSync(MEDIA_DIR)) return null;
  const hit = fs.readdirSync(MEDIA_DIR).find((f) => f.startsWith(`${id}.`));
  return hit ? path.join(MEDIA_DIR, hit) : null;
}

// Video oder Lied hochladen: roher Dateiinhalt im Body, nur mit gültiger Moderator-Sitzung.
function uploadMedia(req, res) {
  if (!validSession(req.headers['x-token'])) return sendJson(res, 401, { error: 'Bitte als Moderation anmelden.' });
  const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  const ext = MEDIA_EXT[type];
  if (!ext) return sendJson(res, 415, { error: 'Bitte ein Video (MP4, WebM, MOV), ein Lied (MP3, M4A, WAV, OGG) oder ein Bild (PNG, JPEG, WebP) hochladen.' });
  const length = Number(req.headers['content-length'] || 0);
  if (length > MEDIA_MAX_BYTES) return sendJson(res, 413, { error: 'Die Datei ist zu groß.' });
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  const id = `media_${crypto.randomBytes(12).toString('hex')}`;
  const file = path.join(MEDIA_DIR, `${id}${ext}`);
  const tmp = `${file}.part`;
  const out = fs.createWriteStream(tmp);
  let size = 0;
  let failed = false;
  const abort = (status, error) => {
    if (failed) return;
    failed = true;
    out.destroy();
    fs.rm(tmp, { force: true }, () => {});
    sendJson(res, status, { error });
  };
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MEDIA_MAX_BYTES) { abort(413, 'Die Datei ist zu groß.'); req.destroy(); }
  });
  req.on('aborted', () => abort(400, 'Upload abgebrochen.'));
  req.pipe(out);
  out.on('error', () => abort(500, 'Die Datei konnte nicht gespeichert werden.'));
  out.on('finish', () => {
    if (failed) return;
    if (!size) return abort(400, 'Die Datei ist leer.');
    fs.renameSync(tmp, file);
    sendJson(res, 200, { id, type, size });
  });
}

// Video ausliefern, mit Range-Anfragen (Spulen, Safari/iPad).
function serveMedia(req, res, id) {
  const file = mediaPath(id);
  if (!file) return false;
  const type = Object.entries(MEDIA_EXT).find(([, e]) => file.endsWith(e))?.[0] || 'application/octet-stream';
  const { size } = fs.statSync(file);
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` });
      res.end();
      return true;
    }
    res.writeHead(206, { 'Content-Type': type, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600' });
    fs.createReadStream(file, { start, end }).pipe(res);
    return true;
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600' });
  fs.createReadStream(file).pipe(res);
  return true;
}

// Nicht mehr verwendete Videos löschen.
function releaseMedia(id) {
  if (!id || game.referencedMedia(store.data).has(id)) return;
  const file = mediaPath(id);
  if (file) fs.rm(file, { force: true }, () => {});
}

function serveStatic(req, res, urlPath) {
  let rel = STATIC[urlPath];
  if (!rel && urlPath.startsWith('/assets/')) rel = urlPath.slice(1);
  if (!rel) return false;
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(path.join(ROOT, path.sep)) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return false;
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/api/health') return sendJson(res, 200, { ok: true });

    // Adresse für den QR-Code auf dem Beamer: die aktuelle WLAN-Adresse dieses Rechners
    // (wechselt mit dem Netz, deshalb bei jedem Aufruf neu ermittelt).
    if (req.method === 'GET' && url.pathname === '/api/join') {
      return sendJson(res, 200, { urls: lanAddresses().map((a) => `http://${a}:${PORT}/`) });
    }

    // Teamliste für die Startseite: nur Namen und Farben, niemals Zugangscodes.
    if (req.method === 'GET' && url.pathname === '/api/teams') {
      return sendJson(res, 200, store.data.project.teams.map((t) => ({ id: t.id, name: t.name, color: t.color })));
    }

    if (req.method === 'POST' && url.pathname === '/api/login') {
      const ip = req.socket.remoteAddress;
      if (loginBlocked(ip)) return sendJson(res, 429, { error: 'Zu viele Fehlversuche. Bitte später erneut versuchen.' });
      const body = await readBody(req);
      if (!checkPassword(body.password)) {
        failedLogins.get(ip).push(Date.now());
        return sendJson(res, 401, { error: 'Passwort ist falsch.' });
      }
      const token = crypto.randomBytes(24).toString('hex');
      const sessions = store.data.auth.sessions;
      for (const [k, s] of Object.entries(sessions)) if (s.expires < Date.now()) delete sessions[k];
      sessions[token] = { expires: Date.now() + SESSION_TTL_MS };
      store.save();
      return sendJson(res, 200, { token });
    }

    // Finale-iPad der Moderation: eigenes, einfaches Passwort, nur für host.html.
    if (req.method === 'POST' && url.pathname === '/api/host-login') {
      const ip = req.socket.remoteAddress;
      if (loginBlocked(ip)) return sendJson(res, 429, { error: 'Zu viele Fehlversuche. Bitte später erneut versuchen.' });
      const body = await readBody(req);
      if (String(body.password || '').trim().toLowerCase() !== HOST_PASSWORD) {
        failedLogins.get(ip).push(Date.now());
        return sendJson(res, 401, { error: 'Passwort ist falsch.' });
      }
      const token = crypto.randomBytes(24).toString('hex');
      const sessions = store.data.auth.sessions;
      for (const [k, s] of Object.entries(sessions)) if (s.expires < Date.now()) delete sessions[k];
      sessions[token] = { expires: Date.now() + SESSION_TTL_MS, scope: 'host' };
      store.save();
      return sendJson(res, 200, { token });
    }

    if (req.method === 'POST' && url.pathname === '/api/logout') {
      const body = await readBody(req);
      if (typeof body.token === 'string') delete store.data.auth.sessions[body.token];
      store.save();
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'POST' && url.pathname === '/api/media') return uploadMedia(req, res);
    if ((req.method === 'GET' || req.method === 'HEAD') && url.pathname.startsWith('/media/') && serveMedia(req, res, url.pathname.slice(7))) return;

    if (req.method === 'GET' && serveStatic(req, res, url.pathname)) return;
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Nicht gefunden');
  } catch (err) {
    sendJson(res, 400, { error: 'Ungültige Anfrage.' });
  }
});

// ---------- Echtzeit ----------

// Nachrichten bis 3 MB: Avatare (bis ca. 900 KB) und Handschrift (bis 2 × 400 KB) passen sicher hinein.
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 3 * 1024 * 1024 });
const clients = new Set();

function connections() {
  const teams = {};
  let beamers = 0;
  let moderators = 0;
  for (const c of clients) {
    if (c.role === 'team') teams[c.teamId] = (teams[c.teamId] || 0) + 1;
    if (c.role === 'beamer' && !c.preview) beamers++;
    if (c.role === 'moderator') moderators++;
  }
  return { teams, beamers, moderators };
}

function viewFor(c) {
  const db = store.data;
  if (c.role === 'moderator' || c.role === 'host') return game.moderatorView(db, connections());
  if (c.role === 'team') return game.teamView(db, c.teamId);
  return game.beamerView(db);
}

function send(c, msg) {
  if (c.ws.readyState === c.ws.OPEN) c.ws.send(JSON.stringify(msg));
}

function broadcast() {
  for (const c of clients) {
    if (!c.role) continue;
    try {
      send(c, { type: 'state', state: viewFor(c), serverTime: Date.now() });
    } catch (err) {
      // z. B. Team wurde gelöscht: Verbindung beenden statt fremde Daten zu senden.
      send(c, { type: 'kicked', message: 'Euer Zugang ist nicht mehr gültig.' });
      c.ws.close();
    }
  }
}

// Zeitabhängige Spielregeln (z. B. 10-Sekunden-Fenster) ändern die Sichten
// ohne neue Aktion: zum richtigen Zeitpunkt noch einmal senden.
let wakeTimer = null;
function scheduleWake() {
  clearTimeout(wakeTimer);
  const at = game.nextWake(store.data);
  if (at) wakeTimer = setTimeout(() => {
    // Abgelaufene Countdowns übernehmen (z. B. Zeit vorbei = ausgeschieden), dann neu senden.
    if (game.tick(store.data)) store.save();
    broadcast();
    scheduleWake();
  }, Math.max(0, at - Date.now() + 50));
}

function kickTeam(teamId) {
  for (const c of clients) {
    if (c.role === 'team' && c.teamId === teamId) {
      send(c, { type: 'kicked', message: 'Euer Zugangscode wurde erneuert oder das Team entfernt.' });
      c.ws.close();
    }
  }
}

function handleHello(c, msg) {
  if (msg.role === 'moderator') {
    if (!validSession(msg.token)) return send(c, { type: 'auth-failed', message: 'Bitte erneut anmelden.' });
    c.role = 'moderator';
  } else if (msg.role === 'host') {
    if (!validSession(msg.token, true)) return send(c, { type: 'auth-failed', message: 'Bitte erneut anmelden.' });
    c.role = 'host';
  } else if (msg.role === 'team') {
    const team = game.findTeamByCode(store.data, msg.code);
    if (!team) return send(c, { type: 'auth-failed', message: 'Zugangscode unbekannt.' });
    c.role = 'team';
    c.teamId = team.id;
  } else if (msg.role === 'beamer') {
    c.role = 'beamer';
    c.preview = !!msg.preview;
  } else {
    return send(c, { type: 'auth-failed', message: 'Unbekannte Rolle.' });
  }
  send(c, { type: 'welcome', role: c.role });
  broadcast();
}

function handleAction(c, msg) {
  if ((c.role === 'moderator' && !validSession(c.token)) || (c.role === 'host' && !validSession(c.token, true))) {
    return send(c, { type: 'ack', id: msg.id, ok: false, error: 'Sitzung abgelaufen. Bitte neu anmelden.' });
  }
  if (c.role === 'host' && !HOST_ACTIONS.has(msg.name)) return send(c, { type: 'ack', id: msg.id, ok: false, error: 'Diese Aktion ist auf dem Finale-iPad nicht erlaubt.' });
  const ctx = {
    role: c.role === 'host' ? 'moderator' : c.role,
    teamId: c.teamId,
    actor: c.role === 'team' ? `team:${c.teamId}` : c.role,
    now: Date.now(),
  };
  // Auf einer Kopie arbeiten: schlägt eine Aktion fehl, bleibt der Zustand unverändert.
  const draft = structuredClone(store.data);
  const mediaBefore = game.referencedMedia(store.data);
  try {
    const result = game.applyAction(draft, ctx, msg.name, msg.payload, typeof msg.id === 'string' ? msg.id : null);
    store.data = draft;
    store.save();
    send(c, { type: 'ack', id: msg.id, ok: true, duplicate: !!result.duplicate, notice: result.notice || null, data: result.data ?? null });
    if (result.kick) kickTeam(result.kick);
    // Videos, auf die keine Show mehr verweist (ersetzt, entfernt, Show gelöscht), aufräumen.
    for (const id of mediaBefore) releaseMedia(id);
    broadcast();
    scheduleWake();
  } catch (err) {
    const message = err instanceof game.QuizError ? err.message : 'Interner Fehler.';
    if (!(err instanceof game.QuizError)) console.error(err);
    send(c, { type: 'ack', id: msg.id, ok: false, error: message });
  }
}

wss.on('connection', (ws) => {
  const c = { ws, role: null, alive: true };
  clients.add(c);
  ws.on('pong', () => (c.alive = true));
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type === 'hello') {
      c.token = msg.token;
      return handleHello(c, msg);
    }
    if (msg.type === 'action' && (c.role === 'moderator' || c.role === 'host' || c.role === 'team' || (c.role === 'beamer' && !c.preview))) return handleAction(c, msg);
  });
  ws.on('close', () => {
    clients.delete(c);
    broadcast();
  });
});

// Tote Verbindungen erkennen, damit die Moderation den echten Verbindungsstatus sieht.
setInterval(() => {
  for (const c of clients) {
    if (!c.alive) {
      c.ws.terminate();
      continue;
    }
    c.alive = false;
    c.ws.ping();
  }
}, 15000).unref();

ensureModeratorPassword();
// WLAN-Adressen, die beste zuerst: private Netze (192.168…, 10…, 172.16–31…),
// WLAN/Ethernet (en0, en1, wlan, eth) vor virtuellen Adaptern (VPN, Docker, Bridges).
function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(require('os').networkInterfaces())) {
    for (const n of list || []) {
      if (n.family !== 'IPv4' && n.family !== 4) continue;
      if (n.internal || n.address.startsWith('169.254.')) continue;
      const a = n.address;
      const priv = /^192\.168\./.test(a) || /^10\./.test(a) || /^172\.(1[6-9]|2\d|3[01])\./.test(a);
      const real = /^(en|eth|wlan|wl|Wi-?Fi|WLAN|Ethernet)/i.test(name) && !/^(utun|tun|tap|docker|br-|bridge|vbox|vmnet|awdl|llw)/i.test(name);
      out.push({ a, score: (priv ? 2 : 0) + (real ? 1 : 0) });
    }
  }
  return out.sort((x, y) => y.score - x.score).map((x) => x.a);
}

server.listen(PORT, () => {
  console.log(`„Wer stiehlt uns die Show“ läuft auf http://localhost:${PORT}`);
  // Adressen im WLAN für iPads und Beamer anzeigen.
  const nets = lanAddresses();
  if (nets.length) {
    console.log('\n  iPads und Beamer im selben WLAN öffnen (oder QR-Code auf dem Beamer scannen):');
    for (const a of nets) console.log(`    http://${a}:${PORT}`);
  }
  console.log('\n  Passwort für Regie und Editor: fabian');
  console.log('  Dieses Fenster während der Show offen lassen. Beenden mit Strg+C.\n');
});
