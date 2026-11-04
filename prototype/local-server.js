// Lokaler Server für den Browser-Prototyp. Er nutzt dieselbe Spiellogik wie
// der Node-Server (server/game.js, beim Build eingebunden) und bildet dessen
// Verhalten nach: Anmeldung, rollenabhängige Sichten, Aktionen mit Rückmeldung.
// Alle Bildschirme der Prototyp-Seite teilen sich diesen einen Zustand.

import { game } from './game-bundle.js';

const PASSWORD = 'fabian';
const DEMO_TOKEN = 'demo-token';
const STORAGE_KEY = 'quiz.prototype.state.v4';
const DEMO_TEAMS = [
  { name: 'Die Füchse', code: '1111' },
  { name: 'Team Blitz', code: '2222' },
  { name: 'Möwenschwarm', code: '3333' },
  { name: 'Quizpiraten', code: '4444' },
  { name: 'Die Schlauberger', code: '5555' },
  { name: 'Team Rakete', code: '6666' },
];

function seed() {
  const db = game.createState();
  const ctx = { role: 'moderator', actor: 'moderator', now: Date.now() };
  // Die sechs voreingestellten Teams bekommen Demo-Namen und feste Codes.
  DEMO_TEAMS.forEach((t, i) => {
    if (!db.project.teams[i]) game.applyAction(db, ctx, 'team.add', { name: t.name });
    db.project.teams[i].name = t.name;
    db.project.teams[i].code = t.code;
  });
  void ctx;
  db.project.subtitle = 'Prototyp · alle Daten bleiben in diesem Browser';
  return db;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const db = game.migrate(JSON.parse(raw));
      // Ältere Demo-Stände hatten drei Teams: fehlende Demo-Teams ergänzen.
      if (!db.prototypeSix) {
        const ctx = { role: 'moderator', actor: 'moderator', now: Date.now() };
        for (const t of DEMO_TEAMS) {
          if (db.project.teams.some((x) => x.code === t.code) || db.project.teams.length >= 6) continue;
          game.applyAction(db, ctx, 'team.add', { name: t.name });
          db.project.teams[db.project.teams.length - 1].code = t.code;
        }
        db.prototypeSix = true;
      }
      // Kurze Demo-Codes (1111 … 6666) statt der alten langen Codes.
      if (!db.prototypeShortCodes) {
        const old = ['FUCHS12345', 'BLITZ12345', 'MOEWE12345', 'PIRAT12345', 'SCHLAU1234', 'RAKETE1234'];
        db.project.teams.forEach((t) => { const k = old.indexOf(t.code); if (k >= 0) t.code = DEMO_TEAMS[k].code; });
        db.prototypeShortCodes = true;
      }
      return db;
    }
  } catch {
    // Kein Speicher verfügbar: Zustand lebt nur bis zum Neuladen.
  }
  return seed();
}

// Medien (Intro-Videos) bleiben im Browser: im Speicher und, wenn möglich, in
// IndexedDB, damit sie ein Neuladen überstehen.
const MEDIA_DB = 'quiz.prototype.media';
function mediaDb() {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(MEDIA_DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('media');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}
async function mediaTx(mode, fn) {
  const db = await mediaDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction('media', mode);
      const req = fn(tx.objectStore('media'));
      tx.oncomplete = () => resolve(req ? req.result : true);
      tx.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}
const mediaMem = new Map();
const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/ogg', 'video/x-m4v',
  'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/flac', 'audio/webm',
  'image/png', 'image/jpeg', 'image/webp'];

export function createLocalServer() {
  let data = load();
  const clients = new Set();

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // ignorieren
    }
  }

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
    if (c.role === 'moderator') return game.trimForConnection(game.moderatorView(data, connections()), (c.cache ||= {}));
    if (c.role === 'host') return game.hostView(data);
    if (c.role === 'team') return game.teamView(data, c.teamId);
    return game.beamerView(data);
  }

  function send(c, msg) {
    if (c.readyState !== 1) return;
    const text = JSON.stringify(msg);
    // Asynchron zustellen wie über ein echtes Netzwerk.
    setTimeout(() => {
      if (c.readyState !== 1) return;
      try {
        c.onmessage?.({ data: text });
      } catch {
        // Seite des Bildschirms existiert nicht mehr.
        c.close();
      }
    }, 0);
  }

  function broadcast() {
    for (const c of clients) {
      if (!c.role) continue;
      try {
        send(c, { type: 'state', state: viewFor(c), serverTime: Date.now() });
      } catch {
        send(c, { type: 'kicked', message: 'Euer Zugang ist nicht mehr gültig.' });
        c.close();
      }
    }
  }

  // Zeitabhängige Spielregeln (z. B. 10-Sekunden-Fenster) ändern die Sichten
  // ohne neue Aktion: zum richtigen Zeitpunkt noch einmal senden.
  let wakeTimer = null;
  function scheduleWake() {
    clearTimeout(wakeTimer);
    const at = game.nextWake(data);
    if (at) wakeTimer = setTimeout(() => {
      if (game.tick(data)) save();
      broadcast();
      scheduleWake();
    }, Math.max(0, at - Date.now() + 50));
  }

  function kickTeam(teamId) {
    for (const c of clients) {
      if (c.role === 'team' && c.teamId === teamId) {
        send(c, { type: 'kicked', message: 'Euer Zugangscode wurde erneuert oder das Team entfernt.' });
        setTimeout(() => c.close(), 10);
      }
    }
  }

  function kickAllTeams() {
    for (const c of clients) {
      if (c.role === 'team') {
        send(c, { type: 'kicked', message: 'Die Moderation hat eine andere Show geöffnet. Bitte mit eurem Code neu anmelden.' });
        setTimeout(() => c.close(), 10);
      }
    }
  }

  function handle(c, msg) {
    if (msg.type === 'hello') {
      if (msg.role === 'moderator') {
        if (msg.token !== DEMO_TOKEN) return send(c, { type: 'auth-failed', message: 'Bitte erneut anmelden.' });
        c.role = 'moderator';
      } else if (msg.role === 'host') {
        if (msg.token !== DEMO_TOKEN) return send(c, { type: 'auth-failed', message: 'Bitte erneut anmelden.' });
        c.role = 'host';
      } else if (msg.role === 'team') {
        const team = game.findTeamByCode(data, msg.code);
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
      return broadcast();
    }
    if (msg.type !== 'action' || !(c.role === 'moderator' || c.role === 'host' || c.role === 'team' || (c.role === 'beamer' && !c.preview))) return;
    if (c.role === 'host' && msg.name !== 'finale.modAnswer') return send(c, { type: 'ack', id: msg.id, ok: false, error: 'Diese Aktion ist auf dem Finale-iPad nicht erlaubt.' });
    const ctx = { role: c.role === 'host' ? 'moderator' : c.role, teamId: c.teamId, actor: c.role === 'team' ? `team:${c.teamId}` : c.role, now: Date.now() };
    const draft = structuredClone(data);
    try {
      const result = game.applyAction(draft, ctx, msg.name, msg.payload, typeof msg.id === 'string' ? msg.id : null);
      data = draft;
      save();
      send(c, { type: 'ack', id: msg.id, ok: true, duplicate: !!result.duplicate, notice: result.notice || null, data: result.data ?? null });
      if (result.kick) kickTeam(result.kick);
      if (result.kickAll) kickAllTeams();
      broadcast();
      scheduleWake();
    } catch (err) {
      const message = err instanceof game.QuizError ? err.message : 'Interner Fehler.';
      if (!(err instanceof game.QuizError)) console.error(err);
      send(c, { type: 'ack', id: msg.id, ok: false, error: message });
    }
  }

  return {
    demoToken: DEMO_TOKEN,
    demoTeams: DEMO_TEAMS,

    // Gibt ein Objekt zurück, das sich wie ein WebSocket verhält.
    connect() {
      const c = {
        readyState: 0,
        send: (text) => handle(c, JSON.parse(text)),
        close: () => {
          if (c.readyState === 3) return;
          c.readyState = 3;
          clients.delete(c);
          broadcast();
        },
      };
      clients.add(c);
      setTimeout(() => {
        c.readyState = 1;
        c.onopen?.();
      }, 0);
      return c;
    },

    api(name, body) {
      if (name === 'teams') return [200, data.project.teams.map((t) => ({ id: t.id, name: t.name, color: t.color }))];
      if (name === 'login') {
        return body.password === PASSWORD ? [200, { token: DEMO_TOKEN }] : [401, { error: 'Passwort ist falsch. Es lautet „fabian“.' }];
      }
      return [200, { ok: true }];
    },

    async uploadMedia(blob) {
      if (!blob || !VIDEO_TYPES.includes(blob.type)) throw new Error('Bitte ein Video (MP4, WebM, MOV), ein Lied (MP3, M4A, WAV, OGG) oder ein Bild (PNG, JPEG, WebP) wählen.');
      if (blob.size > 1024 * 1024 * 1024) throw new Error('Die Datei ist zu groß.');
      const id = `media_${Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('')}`;
      mediaMem.set(id, blob);
      await mediaTx('readwrite', (st) => st.put(blob, id));
      return { id, type: blob.type, size: blob.size };
    },

    async getMedia(id) {
      if (mediaMem.has(id)) return mediaMem.get(id);
      const blob = await mediaTx('readonly', (st) => st.get(id));
      if (blob) mediaMem.set(id, blob);
      return blob || null;
    },

    reset() {
      data = seed();
      save();
      broadcast();
    },
  };
}
