'use strict';

// Spiellogik und rollenabhängige Sichten. Diese Datei kennt weder HTTP noch
// WebSockets, damit sie direkt getestet werden kann.

const crypto = require('crypto');
const { DATASETS } = require('./datasets');
const { migrateBrainContent } = require('./defaults-extra');
const { TYPES, DEFAULT_ORDER, LIBRARY_ORDER, EXTRA_ORDER, COIN_POSITIONS, SHOW_SIZE, TEAM_COLORS, publicTypes } = require('./defaults');
const { checkShow } = require('./check');
const { scoringOf } = require('./scoring');
const { QuizError, fail, newId, log, effect, teamName, totals, cleanText, cleanImage, TIMER } = require('./core');

// Ablauf der einzelnen Spiele. Jedes Modul liefert init, Team- und
// Moderationsaktionen sowie die Sichten für Teams und Beamer.
const FINALE = require('./finale');

const PLAY = {
  leichte5: require('./play-leichte5'),
  dummes: require('./play-dummes'),
  land: require('./play-land'),
  kassenschlager: require('./play-kassenschlager'),
  trumpf5: require('./play-trumpf5'),
  musik: require('./play-musik'),
  jauch: require('./play-jauch'),
  nerd: require('./play-nerd'),
  dumm3: require('./play-dumm3'),
  filmab: require('./play-filmab'),
  weissnicht: require('./play-weissnicht'),
  weissnicht2: require('./play-weissnicht2'),
  sortieren: require('./play-sortieren'),
  gier: require('./play-gier'),
  top100: require('./play-top100'),
  allein: require('./play-allein'),
  sekunden: require('./play-sekunden'),
  star: require('./play-star'),
  timeline: require('./play-timeline'),
  chat: require('./play-chat'),
  hostdu: require('./play-hostdu'),
  konsequenz: require('./play-konsequenz'),
  songsong: require('./play-songsong'),
  dgf: require('./play-dgf'),
  zocken: require('./play-zocken'),
  fragen: require('./play-fragen'),
  zuweit: require('./play-zuweit'),
  brain: require('./play-brain'),
};

const STATE_VERSION = 2;
const BEAMER_VIEWS = ['start', 'video', 'intro', 'pyramid', 'title', 'game', 'ranking', 'coin', 'pause', 'stageTitle', 'hosts', 'finaleTitle', 'finale', 'blank'];
const MAX_PROCESSED = 5000;

// Kurze Zugangscodes: vierstellige Zahl (1000–9999), in der Show eindeutig –
// schnell abgetippt, z. B. am iPad über den Ziffernblock.
function newTeamCode(taken = []) {
  const used = new Set(taken);
  for (let i = 0; i < 200; i++) {
    const code = String(1000 + crypto.randomInt(9000));
    if (!used.has(code)) return code;
  }
  return String(10000 + crypto.randomInt(90000));
}

// Das Finale bestreitet immer das Team mit der 3. Münze (Gewinnstufe 3, nach Position 8).
// Steht dort schon ein anderes Team (z. B. nach Korrekturen), wird das Finale neu geladen.
function syncFinaleTeam(db, ctx) {
  const c8 = db.live.coins.find((c) => c.position === 8);
  if (!c8 || !db.project.teams.some((t) => t.id === c8.teamId)) return;
  if (db.live.finale && db.live.finale.teamId !== c8.teamId) {
    FINALE.start(db, ctx, c8.teamId);
    log(db, ctx, 'finale', `Finale neu geladen: ${teamName(db, c8.teamId)} hat die 3. Münze`);
  }
}

function freshLive() {
  return {
    activeGame: null, // ID der aktiven Spielinstanz in der Show
    games: {}, // Spielzustand je Spielinstanz
    beamer: { view: 'start', data: {} },
    coins: [],
    warning: null,
    effect: { seq: 0, kind: null },
    run: -1, // aktueller Schritt im Showablauf (-1 = noch nicht gestartet)
    finale: null, // Finale gegen die Moderation (server/finale.js)
  };
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function libraryEntry(type, now) {
  return { id: newId('lib'), type, title: TYPES[type].title, content: clone(TYPES[type].example), version: 1, updatedAt: now };
}

// Eine Spielinstanz in der Show ist eine unabhängige Kopie eines Datenbank-Eintrags.
function instanceFrom(entry) {
  const game = { id: newId('game'), type: entry.type, title: entry.title, content: clone(entry.content), libraryId: entry.id, libraryVersion: entry.version, locked: false };
  // Spieltitel-Lied aus der Datenbank übernehmen.
  if (entry.intro) game.intro = clone(entry.intro);
  return game;
}

const DEFAULT_TEAM_COUNT = 6;
function defaultTeams() {
  const codes = [];
  return Array.from({ length: DEFAULT_TEAM_COUNT }, (_, i) => {
    const code = newTeamCode(codes);
    codes.push(code);
    return { id: newId('team'), name: `Team ${i + 1}`, color: TEAM_COLORS[i % TEAM_COLORS.length], code };
  });
}

// Eine neue Show mit der Standardreihenfolge, je Spieltyp der erste Eintrag der Datenbank.
function newProject(library, name = 'Wer stiehlt uns die Show') {
  const games = DEFAULT_ORDER.map((type) => library.find((e) => e.type === type)).filter(Boolean).map(instanceFrom);
  if (games[0]?.type === 'leichte5') games[0].locked = true; // „Die leichten 5“ als festes Eröffnungsspiel
  return {
    id: newId('proj'),
    hostsStepAdded: true,
    hostsStage1Added: true,
    name,
    date: '',
    subtitle: 'Die Live-Show mit acht Spielen',
    host: 'Fabian',
    coHost: 'Alexia',
    // Teams sehen standardmäßig keine fremden Punktestände (Abschnitt 4.1).
    settings: { publicScores: false, reducedMotion: false, sound: true, titleDurationSec: 7 },
    // Standardmäßig sechs Teams; im Editor lassen sich Teams hinzufügen und löschen.
    teams: defaultTeams(),
    games,
    finale: clone(FINALE.EXAMPLE),
  };
}

function createState(now = Date.now()) {
  // Die Datenbank enthält alle Spielarten; die neue Show nur die acht Standardspiele.
  const library = LIBRARY_ORDER.map((type) => libraryEntry(type, now));
  return {
    version: STATE_VERSION,
    library,
    libraryTypesAdded: [...EXTRA_ORDER],
    project: newProject(library),
    live: freshLive(),
    ledger: [],
    // Weitere, gerade nicht geöffnete Shows mit eigenem Spielstand und Punktebuch.
    shows: [],
    log: [],
    processed: [],
  };
}

// Ältere Speicherstände (vor der Spiele-Datenbank) übernehmen Teams, Showdaten und Protokoll.
function migrate(db) {
  if (db.version === STATE_VERSION) {
    if (!db.shows) db.shows = [];
    if (db.project.date === undefined) db.project.date = '';
    if (db.live.run === undefined) db.live.run = -1;
    if (db.live.finale === undefined) db.live.finale = null;
    if (db.project.host === 'Moderation') db.project.host = 'Fabian';
    if (!db.project.coHostDefaulted) { if (!db.project.coHost) db.project.coHost = 'Alexia'; db.project.coHostDefaulted = true; }
    if (!db.project.finale) db.project.finale = clone(FINALE.EXAMPLE);
    // Spielname korrigiert: „DankeGleichFalsch“ → „Danke, gleichfalsch!“ (nur unveränderte Namen).
    for (const e of [...db.library, ...db.project.games, ...db.shows.flatMap((x) => x.project.games)]) {
      if (e.type === 'dgf' && e.title === 'DankeGleichFalsch') e.title = 'Danke, gleichfalsch!';
      // „Keine Kon-Sequenz“ heißt jetzt „Hits me baby, one more time“ (Wunsch von Fabian).
      if (e.type === 'konsequenz' && e.title === 'Keine Kon-Sequenz') e.title = 'Hits me baby, one more time';
      // „Allein, allein“ heißt jetzt „Wir sind ein Telepa-Team“ (Wunsch von Fabian).
      if (e.type === 'allein' && ['Allein, allein', 'Wir sind ein Telepathie-Team'].includes(e.title)) e.title = 'Wir sind ein Telepa-Team';
      // Brain or Dreh'n: Joker getrennt nach positiv/negativ (6 + 6 aufs Rad).
      if (e.type === 'brain') migrateBrainContent(e.content);
    }
    // Neue Spielarten einmalig in die Datenbank aufnehmen – nur ergänzen, nichts ändern.
    db.libraryTypesAdded = db.libraryTypesAdded || [];
    for (const type of EXTRA_ORDER) {
      if (db.libraryTypesAdded.includes(type)) continue;
      if (!db.library.some((e) => e.type === type)) db.library.push(libraryEntry(type, Date.now()));
      db.libraryTypesAdded.push(type);
    }
    // Neue Folie „Moderation am Pult“ nach den Gewinnstufen 2 und 3 – einmalig auch in eigene Abläufe.
    for (const pr of [db.project, ...db.shows.map((x) => x.project)]) addHostsSteps(pr);
    for (const sh of db.shows) {
      if (!sh.project.finale) sh.project.finale = clone(FINALE.EXAMPLE);
      if (sh.live.finale === undefined) sh.live.finale = null;
    }
    return db;
  }
  const fresh = createState();
  if (db.project) {
    for (const k of ['name', 'subtitle', 'host', 'coHost', 'settings', 'teams']) if (k in db.project) fresh.project[k] = db.project[k];
  }
  fresh.log = db.log || [];
  if (db.auth) fresh.auth = db.auth;
  return fresh;
}

// Folie „Moderation am Pult“ einmalig in eigene Abläufe einfügen – zuerst nach den
// Gewinnstufen 2 und 3, später auch nach Gewinnstufe 1 (vor dem ersten Spiel).
// Jede Ergänzung passiert nur einmal: Wer die Folie danach löscht, behält das so.
function addHostsSteps(pr) {
  const add = (flag, want) => {
    if (pr[flag]) return;
    pr[flag] = true;
    if (!Array.isArray(pr.rundown) || !pr.rundown.length) return;
    for (let i = pr.rundown.length - 1; i >= 0; i -= 1) {
      const st = pr.rundown[i];
      if (st.kind === 'stageTitle' && want(st.stage || 1) && !(pr.rundown[i + 1] && pr.rundown[i + 1].kind === 'hosts')) {
        pr.rundown.splice(i + 1, 0, { id: newId('step'), kind: 'hosts', stage: st.stage || 1 });
      }
    }
  };
  add('hostsStepAdded', (n) => n > 1);
  add('hostsStage1Added', (n) => n === 1);
}

// ---------- Hilfsfunktionen ----------

function findTeam(db, teamId) {
  const team = db.project.teams.find((t) => t.id === teamId);
  if (!team) fail('Team nicht gefunden.');
  return team;
}

function findGame(db, gameId) {
  const game = db.project.games.find((g) => g.id === gameId);
  if (!game) fail('Spiel nicht in der Show gefunden.');
  return game;
}

// Show für Team-Aktionen: ohne showId die geöffnete Show.
function showFor(db, showId) {
  if (!showId || showId === db.project.id) {
    const sh = { project: db.project, ledger: db.ledger, current: true };
    Object.defineProperty(sh, 'project', { get: () => db.project, set: (v) => { db.project = v; } });
    return sh;
  }
  const s = db.shows.find((x) => x.project.id === showId);
  if (!s) fail('Show nicht gefunden.');
  return { get project() { return s.project; }, ledger: s.ledger, current: false };
}

function teamIn(sh, teamId) {
  const team = sh.project.teams.find((t) => t.id === teamId);
  if (!team) fail('Team nicht gefunden.');
  return team;
}

function findEntry(db, libraryId) {
  const entry = db.library.find((e) => e.id === libraryId);
  if (!entry) fail('Spiel nicht in der Datenbank gefunden.');
  return entry;
}

function position(db, game) {
  return db.project.games.indexOf(game) + 1;
}

function activeGame(db) {
  const id = db.live.activeGame;
  return id ? db.project.games.find((g) => g.id === id) || null : null;
}

function gameState(db, game) {
  const s = db.live.games;
  if (!s[game.id]) s[game.id] = PLAY[game.type].init(db, game);
  return s[game.id];
}

// Spielaktionen heißen „play.<name>“ und gehen an das gerade aktive Spiel.
function playAction(db, ctx, name, payload) {
  const game = activeGame(db);
  if (!game) fail('Gerade ist kein Spiel aktiv.');
  const mod = PLAY[game.type];
  const table = ctx.role === 'moderator' ? mod.mod : ctx.role === 'team' ? mod.team : null;
  const fn = table && Object.prototype.hasOwnProperty.call(table, name) ? table[name] : null;
  if (!fn) fail('Diese Aktion passt nicht zum aktiven Spiel.');
  return fn(db, ctx, game, gameState(db, game), payload);
}

function cleanColor(v) {
  if (typeof v !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v)) fail('Ungültige Farbe.');
  return v;
}

// Prüft Inhalte gegen das Schema des Spieltyps. Leere Felder sind beim
// Vorbereiten erlaubt; nur Form, Anzahl und Länge werden erzwungen.
function sanitizeFields(fields, value) {
  const src = value && typeof value === 'object' ? value : {};
  const out = {};
  for (const f of fields) out[f.key] = sanitizeField(f, src[f.key]);
  return out;
}

function sanitizeField(f, v) {
  switch (f.type) {
    case 'text':
    case 'textarea':
      if (v === undefined || v === null) return '';
      if (typeof v !== 'string') fail(`„${f.label}“ ist ungültig.`);
      if (v.length > f.max) fail(`„${f.label}“: maximal ${f.max} Zeichen.`);
      return v;
    case 'number': {
      if (v === '' || v === null || v === undefined) return null;
      const n = Number(v);
      if (!Number.isFinite(n) || n < f.min || n > f.max) fail(`„${f.label}“ muss zwischen ${f.min} und ${f.max} liegen.`);
      return n;
    }
    case 'select':
      if (!f.options.includes(v)) return f.options[0];
      return v;
    case 'object':
      return sanitizeFields(f.fields, v);
    case 'media': {
      // Verweis auf eine hochgeladene Datei (Video, Audio oder Bild) im Medienspeicher.
      if (v === undefined || v === null || v === '') return null;
      if (typeof v !== 'object' || typeof v.id !== 'string' || !/^media_[a-f0-9]{12,40}$/.test(v.id)) fail(`„${f.label}“: ungültige Datei.`);
      const ok = { video: /^video\//, audio: /^(audio|video)\//, image: /^image\/(png|jpeg|webp)$/ }[f.accept] || /^$/;
      if (typeof v.type !== 'string' || !ok.test(v.type)) fail(`„${f.label}“: falscher Dateityp.`);
      return { id: v.id, type: v.type, name: String(v.name || 'Datei').slice(0, 100), size: Number(v.size) || 0 };
    }
    case 'list': {
      let arr = Array.isArray(v) ? v : [];
      // Ältere Inhalte ohne diese Liste (z. B. Glücksrad-Felder) bekommen die Standardeinträge.
      if (!arr.length && Array.isArray(f.defaultItems)) arr = clone(f.defaultItems);
      if (arr.length < f.min || arr.length > f.max) {
        fail(f.min === f.max ? `„${f.label}“ braucht genau ${f.min} Einträge.` : `„${f.label}“: ${f.min} bis ${f.max} Einträge.`);
      }
      return arr.map((item) => (f.of === 'text' ? sanitizeField({ type: 'text', label: f.label, max: f.maxLength || 300 }, item) : sanitizeFields(f.fields, item)));
    }
    default:
      fail('Unbekanntes Feld.');
  }
  return null;
}

function sanitizeContent(type, content) {
  if (!TYPES[type]) fail('Unbekannter Spieltyp.');
  if (type === 'brain' && content && typeof content === 'object') content = migrateBrainContent(clone(content));
  return sanitizeFields(TYPES[type].schema, content);
}

function rankingSnapshot(db) {
  const sums = totals(db);
  return db.project.teams
    .map((t) => ({ teamId: t.id, name: t.name, color: t.color, points: sums[t.id] }))
    .sort((a, b) => b.points - a.points);
}

function findStashed(db, showId) {
  const s = db.shows.find((x) => x.project.id === showId);
  if (!s) fail('Show nicht gefunden.');
  return s;
}

function stashCurrent(db) {
  db.shows.push({ project: db.project, live: db.live, ledger: db.ledger });
}

function openShow(db, show) {
  db.project = show.project;
  db.live = show.live;
  db.ledger = show.ledger;
}

function cleanDate(v) {
  if (v === '' || v === null || v === undefined) return '';
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) fail('Ungültiges Datum.');
  return v;
}

function showList(db) {
  const summary = (pr, current) => ({ id: pr.id, name: pr.name, date: pr.date || '', teams: pr.teams.length, games: pr.games.length, current });
  return [summary(db.project, true), ...db.shows.map((s) => summary(s.project, false))]
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.name.localeCompare(b.name, 'de'));
}

function requireEditable(db) {
  if (db.live.activeGame !== null) fail('Während ein Spiel aktiv ist, bleibt der Showablauf fest. Zuerst das Spiel beenden.');
}

// ---------- Showablauf (wie eine Präsentation) ----------
// Jeder Schritt ist eine „Folie“: Beamer-Ansicht plus nötige Spielaktion.
// Ohne eigenen Ablauf gilt der Standardablauf aus den Spielen der Show.

const RUN_KINDS = ['start', 'video', 'intro', 'pyramid', 'title', 'game', 'coin', 'pause', 'ranking', 'stageTitle', 'hosts', 'finaleTitle', 'finale', 'end'];
const RUN_NEEDS_POS = ['title', 'game', 'coin'];
const RUN_MAX = 120;

function defaultRundown(project) {
  const steps = [{ kind: 'start' }, { kind: 'video' }, { kind: 'intro' }, { kind: 'pyramid' }];
  project.games.forEach((g, i) => {
    const pos = i + 1;
    // Zu Beginn jeder Gewinnstufe (Spiel 1, 5 und 7) eine eigene Spieltitel-Folie.
    if (STAGE_START[pos]) steps.push({ kind: 'stageTitle', stage: STAGE_START[pos] });
    // Nach jeder Gewinnstufen-Folie die Moderation am Pult (Überleitung, Erklärungen) – auch vor dem ersten Spiel.
    if (STAGE_START[pos]) steps.push({ kind: 'hosts', stage: STAGE_START[pos] });
    steps.push({ kind: 'title', pos }, { kind: 'game', pos });
    // Nach Spiel 4, 6 und 8 erst eine Pause, dann die Münzvergabe (mehr Spannung).
    if (COIN_POSITIONS.includes(pos)) steps.push({ kind: 'pause' }, { kind: 'coin', pos });
  });
  steps.push({ kind: 'ranking' }, { kind: 'finaleTitle' }, { kind: 'finale' }, { kind: 'end' });
  return steps.map((st, i) => ({ id: `std${i}`, ...st }));
}

function rundown(db) {
  return Array.isArray(db.project.rundown) && db.project.rundown.length ? db.project.rundown : defaultRundown(db.project);
}

function stepLabel(db, st) {
  const g = st.pos ? db.project.games[st.pos - 1] : null;
  const game = g ? `Spiel ${st.pos} · ${g.title}` : st.pos ? `Spiel ${st.pos} (fehlt)` : '';
  const base = {
    start: 'Startbild',
    video: `Intro-Video${db.project.introVideo ? ` (${db.project.introVideo.name})` : ' – noch keins hinterlegt'}`,
    intro: 'Vorstellung der Teams',
    pyramid: st.pos ? `Übersicht Kategorien → ${game}` : 'Übersicht Kategorien',
    title: `${game} – Spieltitel${g && g.intro ? ' ♪' : ''}`,
    game: `${game} – spielen`,
    coin: `Münzvergabe nach Spiel ${st.pos}${STAGE_LABEL[st.pos] ? ` (Gewinnstufe ${STAGE_LABEL[st.pos]})` : ''}`,
    pause: `Pause${st.songs && st.songs.length ? ` · ${st.songs.length} ${st.songs.length === 1 ? 'eigenes Lied' : 'eigene Lieder'}` : ''}`,
    ranking: 'Zwischenstand / Rangliste',
    finaleTitle: `Finale – Spieltitel${db.project.finaleIntro ? ' ♪' : ''}`,
    stageTitle: `Gewinnstufe ${st.stage} – Spieltitel${stageOf(db, st.stage).intro ? ' ♪' : ''}`,
    hosts: `Moderation am Pult${st.stage ? ` (Gewinnstufe ${st.stage})` : ''}`,
    finale: 'Finale gegen die Moderation',
    end: 'Abschluss',
  }[st.kind];
  return st.label ? `${st.label}` : base;
}
const STAGE_LABEL = { 4: 1, 6: 2, 8: 3 };
const STAGE_START = { 1: 1, 5: 2, 7: 3 };
const STAGES = [1, 2, 3];
function cleanColor(c) {
  if (typeof c !== 'string' || !/^#[0-9a-f]{6}$/i.test(c)) fail('Ungültige Farbe.');
  return c.toLowerCase();
}
const stageOf = (db, n) => (db.project.stages && db.project.stages[n]) || {};

function cleanRundown(db, steps) {
  if (!Array.isArray(steps)) fail('Ungültiger Ablauf.');
  if (steps.length > RUN_MAX) fail(`Höchstens ${RUN_MAX} Schritte.`);
  return steps.map((st) => {
    if (!st || !RUN_KINDS.includes(st.kind)) fail('Unbekannter Schritt im Ablauf.');
    const out = { id: typeof st.id === 'string' && /^[\w-]{1,40}$/.test(st.id) ? st.id : newId('step'), kind: st.kind };
    if (st.pos !== undefined && st.pos !== null) {
      const pos = Number(st.pos);
      if (!Number.isInteger(pos) || pos < 1 || pos > SHOW_SIZE) fail('Ungültige Spielposition im Ablauf.');
      if (st.kind === 'coin' && !COIN_POSITIONS.includes(pos)) fail('Münzvergabe gibt es nur nach Spiel 4, 6 und 8.');
      out.pos = pos;
    } else if (RUN_NEEDS_POS.includes(st.kind)) fail('Für diesen Schritt fehlt das Spiel.');
    if (st.kind === 'stageTitle') {
      const n = st.stage === undefined || st.stage === null ? 1 : Number(st.stage);
      if (!STAGES.includes(n)) fail('Gewinnstufe muss 1, 2 oder 3 sein.');
      out.stage = n;
    }
    if (st.kind === 'hosts' && st.stage !== undefined && st.stage !== null && st.stage !== '') {
      const n = Number(st.stage);
      if (!STAGES.includes(n)) fail('Gewinnstufe muss 1, 2 oder 3 sein.');
      out.stage = n;
    }
    if (st.label) out.label = cleanText(st.label, 60);
    if (st.kind === 'pause' && Array.isArray(st.songs) && st.songs.length) out.songs = cleanSongs(st.songs);
    return out;
  });
}

// Playlist einer Pause: nur Verweise auf hochgeladene Lieder.
const SONGS_MAX = 40;
function cleanSongs(songs) {
  if (!Array.isArray(songs)) fail('Ungültige Liederliste.');
  if (songs.length > SONGS_MAX) fail(`Höchstens ${SONGS_MAX} Lieder pro Pause.`);
  return songs.map((m) => {
    if (!m || typeof m.id !== 'string' || !/^media_[a-f0-9]{12,40}$/.test(m.id)) fail('Ungültiges Lied.');
    if (typeof m.type !== 'string' || !/^(audio|video)\/[\w.+-]{1,40}$/.test(m.type)) fail('Bitte MP3-, M4A- oder MP4-Dateien als Lieder wählen.');
    return { id: m.id, type: m.type, name: cleanText(String(m.name || 'Lied'), 100) || 'Lied', size: Number(m.size) || 0 };
  });
}

// Schritt ausführen: Spiel aktivieren, Münze ermitteln, Beamer umschalten.
function runStep(db, ctx, index) {
  const steps = rundown(db);
  if (!Number.isInteger(index) || index < 0 || index >= steps.length) fail('Diesen Schritt gibt es nicht.');
  const st = steps[index];
  const game = st.pos ? db.project.games[st.pos - 1] : null;
  if (st.pos && !game) fail(`Auf Position ${st.pos} steht kein Spiel.`);
  db.live.run = index;
  if (game && db.live.activeGame !== game.id) moderatorActions['show.activate'](db, ctx, { gameId: game.id });
  const view = { start: 'start', end: 'start', video: 'video', intro: 'intro', pyramid: 'pyramid', title: 'title', game: 'game', pause: 'pause', ranking: 'ranking', coin: 'coin', finale: 'finale' }[st.kind];
  if (st.kind === 'finaleTitle' || st.kind === 'finale') syncFinaleTeam(db, ctx);
  if (st.kind === 'finaleTitle') {
    if (db.live.activeGame) moderatorActions['show.activate'](db, ctx, { gameId: null });
    db.live.beamer = { view: 'finaleTitle', data: {} };
    effect(db, 'title');
  } else if (st.kind === 'stageTitle') {
    db.live.beamer = { view: 'stageTitle', data: { stage: st.stage || 1 } };
    effect(db, 'title');
  } else if (st.kind === 'hosts') {
    db.live.beamer = { view: 'hosts', data: { stage: st.stage || null } };
  } else if (st.kind === 'finale') {
    if (db.live.activeGame) moderatorActions['show.activate'](db, ctx, { gameId: null });
    if (!db.live.finale) FINALE.start(db, ctx, null);
    db.live.beamer = { view: 'finale', data: {} };
    effect(db, 'title');
  } else if (st.kind === 'coin') {
    if (!db.live.coins.some((c) => c.position === st.pos)) moderatorActions['coin.determine'](db, ctx, { position: st.pos });
    const coin = db.live.coins.find((c) => c.position === st.pos);
    if (!coin) {
      log(db, ctx, 'ablauf', `Schritt ${index + 1}: ${stepLabel(db, st)} – Gleichstand, Schätzfrage nötig`);
      return { notice: 'Gleichstand: Bitte zuerst die Schätzfrage entscheiden, dann den Schritt erneut auslösen.' };
    }
    // Münze der richtigen Position zeigen (auch beim Zurückblättern).
    db.live.beamer = { view: 'coin', data: { position: coin.position, teamId: coin.teamId } };
    effect(db, 'coin');
  } else {
    moderatorActions['beamer.show'](db, ctx, { view });
    // Pause: Beamer spielt die Lieder dieses Pausenschritts.
    if (st.kind === 'pause') db.live.beamer.data = { stepId: st.id };
  }
  log(db, ctx, 'ablauf', `Schritt ${index + 1}/${steps.length}: ${stepLabel(db, st)}`);
  return {};
}

// Intro-Lied der Spieltitel-Folie ist zu Ende: automatisch weiter zum Spiel.
// Mehrere Beamer melden das evtl. gleichzeitig – nur die erste Meldung schaltet.
function introEnded(db, ctx, p) {
  const steps = rundown(db);
  const cur = steps[db.live.run ?? -1];
  const next = steps[db.live.run + 1];
  if (p.pos === 'stage') {
    if (!cur || cur.kind !== 'stageTitle' || cur.stage !== Number(p.stage) || !next) return {};
    log(db, ctx, 'ablauf', `Lied der Gewinnstufe ${cur.stage} zu Ende – automatisch weiter`);
    return runStep(db, ctx, db.live.run + 1);
  }
  if (p.pos === 'finale') {
    if (!cur || cur.kind !== 'finaleTitle' || !next || next.kind !== 'finale') return {};
    log(db, ctx, 'ablauf', 'Intro-Lied des Finales zu Ende – automatisch weiter zum Finale');
    return runStep(db, ctx, db.live.run + 1);
  }
  const pos = Number(p.pos);
  if (!cur || cur.kind !== 'title' || cur.pos !== pos) return {};
  if (!next || next.kind !== 'game' || next.pos !== pos) return {};
  log(db, ctx, 'ablauf', `Intro-Lied von Spiel ${pos} zu Ende – automatisch weiter zum Spiel`);
  return runStep(db, ctx, db.live.run + 1);
}

// ---------- Aktionen ----------

// Beamer-Vorschau im Editor: so sähe Frage/Runde i auf dem Beamer aus. Läuft auf
// einer Kopie des Spielstands mit den (auch ungespeicherten) Inhalten aus dem Editor –
// der echte Spielstand bleibt unberührt.
const PREVIEW_STEPS = {
  leichte5: (i) => [['open', { qIndex: i }]],
  dummes: (i) => [['open', { qIndex: i }]],
  dumm3: (i) => [['open', { qIndex: i }]],
  land: (i) => [['open', { taskIndex: i }]],
  kassenschlager: (i) => [['startMovie', { movieIndex: i }]],
  trumpf5: (i) => [['start', { termIndex: i }], ['nextHint'], ['nextHint'], ['nextHint'], ['nextHint'], ['nextHint']],
  musik: (i) => [['pick', { cat: i, field: 0 }], ['start']],
  jauch: () => [['next']],
  nerd: (i) => [['open', { catIndex: i }]],
  dgf: (i) => [['open', { catIndex: i }]],
  fragen: (i) => [['open', { catIndex: i }]],
  zocken: (i) => [['open', { q: i }]],
  brain: () => [['start'], ['showQuestion']],
};
function previewBeamer(db, ctx, p) {
  const type = p.type;
  if (!TYPES[type] || !PLAY[type]) fail('Für diese Spielart gibt es keine Vorschau.');
  const copy = clone({ project: db.project, live: db.live, ledger: db.ledger, log: [], library: db.library, shows: [], processed: [] });
  const game = { id: 'game_preview', type, title: cleanText(p.title || '', 80) || TYPES[type].title, content: sanitizeContent(type, p.content), intro: null };
  copy.project.games = [...copy.project.games.filter((g) => g.id !== game.id), game];
  copy.live = freshLive();
  const c = { role: 'moderator', actor: 'preview', now: ctx.now };
  copy.live.activeGame = game.id;
  gameState(copy, game);
  const i = Math.max(0, Number(p.index) || 0);
  const steps = (PREVIEW_STEPS[type] || ((k) => [['open', { index: k }]]))(i);
  let note = null;
  for (const [name, payload] of steps) {
    try { playAction(copy, c, name, payload || {}); } catch (e) { note = e.message; break; }
  }
  if (type === 'jauch' && i > 0 && game.content.questions[i]) {
    // Direkt zur gewünschten Frage springen (ohne vorherige Fragen aufzulösen).
    const st = gameState(copy, game);
    if (st.rounds && st.rounds[0]) { st.rounds[i] = clone(st.rounds[0]); delete st.rounds[0]; }
    st.qIndex = i;
  }
  copy.live.beamer = { view: 'game', data: {} };
  return { data: { state: beamerView(copy), note } };
}

const moderatorActions = {
  'preview.beamer'(db, ctx, p) {
    return previewBeamer(db, ctx, p);
  },
  // Lautstärke auf dem Beamer (0–100), jederzeit live einstellbar.
  'volume.set'(db, ctx, p) {
    const st = db.project.settings;
    for (const k of ['fxVolume', 'musicVolume']) {
      if (!(k in p)) continue;
      const v = Math.round(Number(p[k]));
      if (!(v >= 0 && v <= 100)) fail('Lautstärke muss zwischen 0 und 100 liegen.');
      st[k] = v;
    }
  },
  // Generalprobe-Check (nur lesen): was fehlt noch in dieser Show?
  'check.show'(db) {
    return { data: checkShow(db, TYPES) };
  },
  'timer.start'(db, ctx) {
    const g = activeGame(db);
    if (!g) fail('Gerade läuft kein Spiel.');
    db.live.timer = { gameId: g.id, startedAt: ctx.now };
    log(db, ctx, 'ablauf', `10-Sekunden-Timer gestartet (${g.title})`);
  },
  'timer.stop'(db, ctx) {
    delete db.live.timer;
    log(db, ctx, 'ablauf', 'Timer abgebrochen');
  },
  ...FINALE.mod,

  // Finale: letzten Schritt zurücknehmen (z. B. falsch geklickte Bewertung nach einem Münzeinsatz).
  'finale.undo'(db, ctx) {
    const h = db.live.finaleHistory || [];
    const last = h.pop();
    if (!last || !db.live.finale) fail('Es gibt keinen Schritt zum Zurücknehmen.');
    db.live.finale = last.state;
    effect(db, 'undo');
    log(db, ctx, 'finale', `Rückgängig: ${UNDO_LABEL[last.action] || last.action}`);
  },

  'project.update'(db, ctx, p) {
    const pr = db.project;
    if ('name' in p) pr.name = cleanText(p.name, 80) || 'Wer stiehlt uns die Show';
    if ('subtitle' in p) pr.subtitle = cleanText(p.subtitle, 160);
    if ('host' in p) pr.host = cleanText(p.host, 80);
    if ('coHost' in p) pr.coHost = cleanText(p.coHost, 80);
    // 3D-Avatare der Moderation (null = Standard-Avatar aus dem Pultbild)
    if ('hostAvatar' in p) pr.hostAvatar = p.hostAvatar ? cleanImage(p.hostAvatar) : null;
    if ('coHostAvatar' in p) pr.coHostAvatar = p.coHostAvatar ? cleanImage(p.coHostAvatar) : null;
    if ('date' in p) pr.date = cleanDate(p.date);
    if (p.settings && typeof p.settings === 'object') {
      for (const k of ['publicScores', 'reducedMotion', 'sound']) {
        if (k in p.settings) pr.settings[k] = !!p.settings[k];
      }
      if ('titleDurationSec' in p.settings) {
        const d = Number(p.settings.titleDurationSec);
        if (!(d >= 3 && d <= 20)) fail('Titeldauer muss zwischen 3 und 20 Sekunden liegen.');
        pr.settings.titleDurationSec = d;
      }
    }
    log(db, ctx, 'editor', 'Showdaten gespeichert');
  },

  // Intro-Video der Show (Datei liegt im Medienspeicher, hier nur der Verweis).
  'intro.set'(db, ctx, p) {
    const old = db.project.introVideo || null;
    if (p.media === null) {
      db.project.introVideo = null;
      log(db, ctx, 'editor', 'Intro-Video entfernt');
      return { releasedMedia: old ? old.id : null };
    }
    const m = p.media || {};
    if (typeof m.id !== 'string' || !/^media_[a-f0-9]{12,40}$/.test(m.id)) fail('Ungültiges Video.');
    if (typeof m.type !== 'string' || !/^video\/[\w.+-]{1,40}$/.test(m.type)) fail('Bitte eine Videodatei wählen.');
    db.project.introVideo = { id: m.id, type: m.type, name: cleanText(String(m.name || 'Intro-Video'), 80) || 'Intro-Video', size: Number(m.size) || 0 };
    log(db, ctx, 'editor', `Intro-Video „${db.project.introVideo.name}“ gesetzt`);
    return { releasedMedia: old && old.id !== m.id ? old.id : null };
  },

  // Intro-Lied je Spiel (Kategorie): MP3/Audio oder MP4/Video, läuft auf der Spieltitel-Folie.
  'game.setIntro'(db, ctx, p) {
    const game = findGame(db, p.gameId);
    if (p.media === null) {
      delete game.intro;
      log(db, ctx, 'editor', `Intro-Lied von „${game.title}“ entfernt`);
      return;
    }
    const m = p.media || {};
    if (typeof m.id !== 'string' || !/^media_[a-f0-9]{12,40}$/.test(m.id)) fail('Ungültige Datei.');
    if (typeof m.type !== 'string' || !/^(audio|video)\/[\w.+-]{1,40}$/.test(m.type)) fail('Bitte eine MP3- oder MP4-Datei wählen.');
    game.intro = { id: m.id, type: m.type, name: cleanText(String(m.name || 'Intro'), 100) || 'Intro', size: Number(m.size) || 0 };
    // Auch beim zugehörigen Eintrag in der Spiele-Datenbank speichern: so ist das Lied
    // diesem Spiel zugeordnet und kommt in jeder künftigen Show automatisch mit.
    const entry = (db.library || []).find((e) => e.id === game.libraryId);
    if (entry) entry.intro = clone(game.intro);
    log(db, ctx, 'editor', `Intro-Lied „${game.intro.name}“ für „${game.title}“ gesetzt${entry ? ' (auch in der Datenbank)' : ''}`);
  },

  // Farbe der Spieltitel-Folie dieses Spiels (null = Standardfarbe der Position).
  'game.setColor'(db, ctx, p) {
    const game = findGame(db, p.gameId);
    if (p.color === null) delete game.color;
    else game.color = cleanColor(p.color);
    log(db, ctx, 'editor', `Farbe der Spieltitel-Folie von „${game.title}“ geändert`);
  },

  // Intro-Lied für die Spieltitel-Folie des Finales.
  'finale.setIntro'(db, ctx, p) {
    if (p.media === null) {
      delete db.project.finaleIntro;
      log(db, ctx, 'editor', 'Intro-Lied des Finales entfernt');
      return;
    }
    const m = p.media || {};
    if (typeof m.id !== 'string' || !/^media_[a-f0-9]{12,40}$/.test(m.id)) fail('Ungültige Datei.');
    if (typeof m.type !== 'string' || !/^(audio|video)\/[\w.+-]{1,40}$/.test(m.type)) fail('Bitte eine MP3- oder MP4-Datei wählen.');
    db.project.finaleIntro = { id: m.id, type: m.type, name: cleanText(String(m.name || 'Intro'), 100) || 'Intro', size: Number(m.size) || 0 };
    log(db, ctx, 'editor', `Intro-Lied „${db.project.finaleIntro.name}“ für das Finale gesetzt`);
  },

  // Gewinnstufe ankündigen: Lied (MP3/MP4) und Farbe je Stufe; null entfernt.
  'stage.set'(db, ctx, p) {
    const n = Number(p.stage);
    if (!STAGES.includes(n)) fail('Gewinnstufe muss 1, 2 oder 3 sein.');
    db.project.stages = db.project.stages || {};
    const st = { ...(db.project.stages[n] || {}) };
    if ('intro' in p) {
      if (p.intro === null) delete st.intro;
      else {
        const m = p.intro || {};
        if (typeof m.id !== 'string' || !/^media_[a-f0-9]{12,40}$/.test(m.id)) fail('Ungültige Datei.');
        if (typeof m.type !== 'string' || !/^(audio|video)\/[\w.+-]{1,40}$/.test(m.type)) fail('Bitte eine MP3- oder MP4-Datei wählen.');
        st.intro = { id: m.id, type: m.type, name: cleanText(String(m.name || 'Lied'), 100) || 'Lied', size: Number(m.size) || 0 };
      }
    }
    if ('color' in p) {
      if (p.color === null) delete st.color;
      else st.color = cleanColor(p.color);
    }
    db.project.stages[n] = st;
    log(db, ctx, 'editor', `Spieltitel der Gewinnstufe ${n} geändert`);
  },

  'team.add'(db, ctx, p) {
    const sh = showFor(db, p.showId);
    const teams = sh.project.teams;
    if (teams.length >= 12) fail('Maximal 12 Teams.');
    const name = cleanText(p.name || '', 40) || `Team ${teams.length + 1}`;
    const color = p.color ? cleanColor(p.color) : TEAM_COLORS[teams.length % TEAM_COLORS.length];
    const team = { id: newId('team'), name, color, code: newTeamCode(teams.map((t) => t.code)) };
    teams.push(team);
    log(db, ctx, 'team', `Team „${name}“ angelegt${sh.current ? '' : ` (Show „${sh.project.name}“)`}`);
  },

  'team.update'(db, ctx, p) {
    const sh = showFor(db, p.showId);
    const team = teamIn(sh, p.teamId);
    if ('name' in p) team.name = cleanText(p.name, 40) || team.name;
    if ('color' in p) team.color = cleanColor(p.color);
    // 3D-Avatar hinter dem Pult; null entfernt ihn (Pult bleibt dann leer).
    if ('avatar' in p) team.avatar = p.avatar ? cleanImage(p.avatar) : null;
    log(db, ctx, 'team', `Team „${team.name}“ geändert${'avatar' in p ? (p.avatar ? ' (Avatar gesetzt)' : ' (Avatar entfernt)') : ''}`);
  },

  'team.regenCode'(db, ctx, p) {
    const sh = showFor(db, p.showId);
    const team = teamIn(sh, p.teamId);
    team.code = newTeamCode(sh.project.teams.map((t) => t.code));
    log(db, ctx, 'team', `Neuer Zugangscode für „${team.name}“ (alter Code ungültig)`);
    return sh.current ? { kick: team.id } : {};
  },

  'team.remove'(db, ctx, p) {
    const sh = showFor(db, p.showId);
    const team = teamIn(sh, p.teamId);
    if (sh.ledger.some((e) => e.teamId === team.id)) {
      fail('Team hat bereits Punktebuchungen und kann nicht gelöscht werden.');
    }
    sh.project.teams = sh.project.teams.filter((t) => t.id !== team.id);
    log(db, ctx, 'team', `Team „${team.name}“ gelöscht`);
    return sh.current ? { kick: team.id } : {};
  },

  // Teams einer anderen Show übernehmen (ersetzt die Teams der Zielshow, neue Codes).
  'teams.copyFrom'(db, ctx, p) {
    const target = showFor(db, p.showId);
    const src = showFor(db, p.fromShowId);
    if (target.project === src.project) fail('Bitte eine andere Show wählen.');
    if (target.ledger.length) fail('Diese Show hat schon Punkte – Teams können nicht mehr ersetzt werden.');
    const codes = [];
    target.project.teams = src.project.teams.map((t) => {
      const code = newTeamCode(codes);
      codes.push(code);
      return { ...clone(t), id: newId('team'), code };
    });
    log(db, ctx, 'team', `Teams aus „${src.project.name}“ in „${target.project.name}“ übernommen`);
    return target.current ? { kickAll: true } : {};
  },

  // ----- Spiele-Datenbank -----

  'library.add'(db, ctx, p) {
    if (!TYPES[p.type]) fail('Unbekannter Spieltyp.');
    if (db.library.length >= 200) fail('Die Datenbank ist voll (200 Spiele).');
    const entry = libraryEntry(p.type, ctx.now);
    entry.title = `${TYPES[p.type].title} (neu)`;
    db.library.push(entry);
    log(db, ctx, 'datenbank', `Neues Spiel „${entry.title}“ angelegt`);
    return { created: entry.id };
  },

  'library.duplicate'(db, ctx, p) {
    const src = findEntry(db, p.libraryId);
    if (db.library.length >= 200) fail('Die Datenbank ist voll (200 Spiele).');
    const entry = { ...clone(src), id: newId('lib'), title: `${src.title} (Kopie)`, version: 1, updatedAt: ctx.now };
    db.library.splice(db.library.indexOf(src) + 1, 0, entry);
    log(db, ctx, 'datenbank', `„${src.title}“ dupliziert`);
    return { created: entry.id };
  },

  'library.update'(db, ctx, p) {
    const entry = findEntry(db, p.libraryId);
    if ('title' in p) entry.title = cleanText(p.title, 80) || TYPES[entry.type].title;
    if ('content' in p) entry.content = sanitizeContent(entry.type, p.content);
    entry.version += 1;
    entry.updatedAt = ctx.now;
    log(db, ctx, 'datenbank', `„${entry.title}“ gespeichert (Version ${entry.version})`);
  },

  'library.remove'(db, ctx, p) {
    const entry = findEntry(db, p.libraryId);
    db.library = db.library.filter((e) => e.id !== entry.id);
    log(db, ctx, 'datenbank', `„${entry.title}“ aus der Datenbank gelöscht (Show-Kopien bleiben erhalten)`);
  },

  // Ein in der Show bearbeitetes Spiel als neuen Eintrag in die Datenbank übernehmen.
  // Spieltitel-Lied direkt in der Spiele-Datenbank setzen/entfernen.
  'library.setIntro'(db, ctx, p) {
    const entry = findEntry(db, p.libraryId);
    if (p.media === null) { delete entry.intro; log(db, ctx, 'datenbank', `Intro-Lied von „${entry.title}“ entfernt`); return; }
    const m = p.media || {};
    if (typeof m.id !== 'string' || !/^media_[a-f0-9]{12,40}$/.test(m.id)) fail('Ungültige Datei.');
    if (typeof m.type !== 'string' || !/^(audio|video)\/[\w.+-]{1,40}$/.test(m.type)) fail('Bitte eine MP3- oder MP4-Datei wählen.');
    entry.intro = { id: m.id, type: m.type, name: cleanText(String(m.name || 'Intro'), 100) || 'Intro', size: Number(m.size) || 0 };
    log(db, ctx, 'datenbank', `Intro-Lied „${entry.intro.name}“ für „${entry.title}“ gesetzt`);
  },
  'library.saveFromShow'(db, ctx, p) {
    const game = findGame(db, p.gameId);
    const entry = { id: newId('lib'), type: game.type, title: game.title, content: clone(game.content), version: 1, updatedAt: ctx.now };
    if (game.intro) entry.intro = clone(game.intro);
    db.library.push(entry);
    log(db, ctx, 'datenbank', `„${game.title}“ aus der Show in die Datenbank übernommen`);
    return { created: entry.id };
  },

  // ----- Showablauf -----

  'game.add'(db, ctx, p) {
    requireEditable(db);
    const entry = findEntry(db, p.libraryId);
    const games = db.project.games;
    if (games.length >= SHOW_SIZE) fail(`Die Show hat schon ${SHOW_SIZE} Spiele. Zuerst eines in den Mülleimer ziehen.`);
    const game = instanceFrom(entry);
    let index = Number.isInteger(p.index) ? Math.max(0, Math.min(p.index, games.length)) : games.length;
    if (index === 0 && games[0]?.locked) index = 1;
    games.splice(index, 0, game);
    log(db, ctx, 'editor', `„${game.title}“ auf Position ${index + 1} eingefügt`);
    return { created: game.id };
  },

  // Spiel auf seinem Platz durch ein anderes aus der Datenbank ersetzen.
  'game.replace'(db, ctx, p) {
    requireEditable(db);
    const old = findGame(db, p.gameId);
    const entry = findEntry(db, p.libraryId);
    const game = instanceFrom(entry);
    if (old.locked && entry.type === 'leichte5') game.locked = true;
    const i = db.project.games.indexOf(old);
    db.project.games.splice(i, 1, game);
    log(db, ctx, 'editor', `Platz ${i + 1}: „${old.title}“ durch „${game.title}“ ersetzt`);
    return { created: game.id };
  },

  'game.remove'(db, ctx, p) {
    requireEditable(db);
    const game = findGame(db, p.gameId);
    if (game.locked && p.override !== 'ENTFERNEN') fail('Das feste Eröffnungsspiel lässt sich nur über die Sonderaktion entfernen.');
    db.project.games = db.project.games.filter((g) => g.id !== game.id);
    log(db, ctx, 'editor', `„${game.title}“ aus der Show entfernt${game.locked ? ' (Sonderaktion Eröffnungsspiel)' : ''}`);
  },

  'game.moveTo'(db, ctx, p) {
    requireEditable(db);
    const games = db.project.games;
    const game = findGame(db, p.gameId);
    const from = games.indexOf(game);
    const to = Math.max(0, Math.min(Number(p.index), games.length - 1));
    if (!Number.isInteger(to)) fail('Ungültige Position.');
    if (from === to) return;
    if (game.locked || (games[0]?.locked && to === 0)) {
      fail('„Die leichten 5“ ist das feste Eröffnungsspiel und bleibt auf Position 1.');
    }
    games.splice(from, 1);
    games.splice(to, 0, game);
    log(db, ctx, 'editor', `„${game.title}“ auf Position ${to + 1} verschoben`);
  },

  'game.update'(db, ctx, p) {
    const game = findGame(db, p.gameId);
    if (db.live.activeGame === game.id && 'content' in p) fail('Inhalte eines laufenden Spiels bitte erst nach dem Beenden ändern.');
    if ('title' in p) game.title = cleanText(p.title, 80) || TYPES[game.type].title;
    if ('content' in p) game.content = sanitizeContent(game.type, p.content);
    log(db, ctx, 'editor', `Inhalte von „${game.title}“ gespeichert`);
  },

  'show.activate'(db, ctx, p) {
    if (p.gameId === null) {
      db.live.activeGame = null;
      log(db, ctx, 'ablauf', 'Kein Spiel aktiv');
      return;
    }
    const game = findGame(db, p.gameId);
    if (!TYPES[game.type].playable) fail(`„${game.title}“ ist noch nicht spielbar.`);
    db.live.activeGame = game.id;
    gameState(db, game);
    log(db, ctx, 'ablauf', `Spiel ${position(db, game)} „${game.title}“ aktiviert`);
  },

  'beamer.show'(db, ctx, p) {
    if (!BEAMER_VIEWS.includes(p.view)) fail('Unbekannte Beamer-Ansicht.');
    if (p.view === 'title' && !activeGame(db)) fail('Zuerst ein Spiel aktivieren.');
    if (p.view === 'ranking') {
      db.live.beamer = { view: 'ranking', data: { ranking: rankingSnapshot(db), at: ctx.now } };
      log(db, ctx, 'beamer', 'Rangliste enthüllt');
      effect(db, 'reveal');
      return;
    }
    if (p.view === 'coin') {
      const last = db.live.coins[db.live.coins.length - 1];
      if (!last) fail('Es wurde noch keine Münze vergeben.');
      db.live.beamer = { view: 'coin', data: { position: last.position, teamId: last.teamId } };
      effect(db, 'coin');
      return;
    }
    db.live.beamer = { view: p.view, data: {} };
    if (p.view === 'title') effect(db, 'title');
    if (p.view === 'video') effect(db, 'video'); // Video startet (erneut) von vorn
    log(db, ctx, 'beamer', `Beamer zeigt „${p.view}“`);
  },

  'points.adjust'(db, ctx, p) {
    findTeam(db, p.teamId);
    const points = Number(p.points);
    if (!Number.isInteger(points) || points === 0 || Math.abs(points) > 100) fail('Ungültige Punktzahl.');
    const reason = cleanText(p.reason || '', 160);
    if (!reason) fail('Bitte eine Begründung angeben.');
    db.ledger.push({ id: newId('pt'), teamId: p.teamId, points, ref: `manual:${newId('m')}`, reason: `Korrektur: ${reason}`, at: ctx.now, actor: ctx.actor });
    log(db, ctx, 'punkte', `${teamName(db, p.teamId)}: ${points > 0 ? '+' : ''}${points} (Korrektur: ${reason})`);
  },

  // „Rückgängig“ löscht keine Historie, sondern erzeugt eine Gegenbuchung.
  'points.undo'(db, ctx, p) {
    const entry = db.ledger.find((e) => e.id === p.entryId);
    if (!entry) fail('Buchung nicht gefunden.');
    if (entry.reversedBy || entry.reverses) fail('Diese Buchung wurde bereits rückgängig gemacht.');
    const counter = { id: newId('pt'), teamId: entry.teamId, points: -entry.points, ref: entry.ref, reason: `Rückgängig: ${entry.reason}`, reverses: entry.id, at: ctx.now, actor: ctx.actor };
    entry.reversedBy = counter.id;
    db.ledger.push(counter);
    log(db, ctx, 'punkte', `Buchung rückgängig: ${teamName(db, entry.teamId)} ${-entry.points}`);
  },

  // Münzvergabe nach den aktiven Positionen 4, 6 und 8 auf Basis des kumulierten Stands.
  'coin.determine'(db, ctx, p) {
    const pos = Number(p.position);
    if (!COIN_POSITIONS.includes(pos)) fail('Münzen gibt es nur nach Position 4, 6 und 8.');
    if (db.live.coins.some((c) => c.position === pos)) fail('Für diese Position wurde die Münze bereits vergeben.');
    const ranking = rankingSnapshot(db);
    if (!ranking.length) fail('Keine Teams vorhanden.');
    const top = ranking.filter((r) => r.points === ranking[0].points);
    if (top.length > 1) {
      db.live.warning = { kind: 'coinTie', position: pos, teamIds: top.map((t) => t.teamId), points: top[0].points };
      log(db, ctx, 'muenze', `Gleichstand um Münze ${pos}: ${top.map((t) => t.name).join(', ')} – Schätzfrage nötig`);
      return;
    }
    db.live.coins.push({ position: pos, teamId: top[0].teamId, at: ctx.now, method: 'Punkte', points: top[0].points });
    db.live.warning = null;
    log(db, ctx, 'muenze', `Münze nach Position ${pos} an ${top[0].name} (${top[0].points} Punkte)`);
    syncFinaleTeam(db, ctx);
  },

  // Nach einer Schätzfrage vergibt die Moderation die Münze ausdrücklich und protokolliert.
  'coin.awardTie'(db, ctx, p) {
    const w = db.live.warning;
    if (!w || w.kind !== 'coinTie') fail('Es gibt keinen offenen Gleichstand.');
    if (!w.teamIds.includes(p.teamId)) fail('Nur Teams aus dem Gleichstand können die Münze erhalten.');
    db.live.coins.push({ position: w.position, teamId: p.teamId, at: ctx.now, method: 'Schätzfrage', points: w.points });
    db.live.warning = null;
    log(db, ctx, 'muenze', `Münze nach Position ${w.position} per Schätzfrage an ${teamName(db, p.teamId)}`);
    syncFinaleTeam(db, ctx);
    // Steht der Ablauf gerade auf dieser Münzvergabe, sofort die Münze zeigen.
    const cur = rundown(db)[db.live.run ?? -1];
    if (cur && cur.kind === 'coin' && cur.pos === w.position) {
      db.live.beamer = { view: 'coin', data: { position: w.position, teamId: p.teamId } };
      effect(db, 'coin');
    }
  },

  // ----- Mehrere Shows -----
  // Geöffnet ist immer genau eine Show (db.project mit Spielstand und Punkten),
  // die anderen liegen vollständig in db.shows.

  'shows.create'(db, ctx, p) {
    requireEditable(db);
    if (db.shows.length >= 50) fail('Maximal 50 Shows.');
    const name = cleanText(p.name || '', 80) || 'Neue Show';
    const project = newProject(db.library, name);
    project.date = cleanDate(p.date);
    if (p.copyTeams) project.teams = clone(db.project.teams);
    stashCurrent(db);
    openShow(db, { project, live: freshLive(), ledger: [] });
    log(db, ctx, 'show', `Neue Show „${name}“ angelegt und geöffnet`);
    return { created: project.id };
  },

  'shows.switch'(db, ctx, p) {
    requireEditable(db);
    const i = db.shows.findIndex((x) => x.project.id === p.showId);
    if (i < 0) fail('Show nicht gefunden.');
    const [next] = db.shows.splice(i, 1);
    stashCurrent(db);
    openShow(db, next);
    log(db, ctx, 'show', `Show „${next.project.name}“ geöffnet`);
  },

  'shows.duplicate'(db, ctx, p) {
    if (db.shows.length >= 50) fail('Maximal 50 Shows.');
    const src = p.showId === db.project.id ? db.project : findStashed(db, p.showId).project;
    const project = { ...clone(src), id: newId('proj'), name: (cleanText(p.name || '', 80) || `${src.name} (Kopie)`).slice(0, 80) };
    if ('date' in p) project.date = cleanDate(p.date);
    for (const g of project.games) g.id = newId('game');
    // Als Vorlage für die nächste Show: auf Wunsch neue Teams (neue Namen und Zugangscodes, ohne Fotos).
    if (p.newTeams) project.teams = newProject(db.library, project.name).teams;
    db.shows.push({ project, live: freshLive(), ledger: [] });
    log(db, ctx, 'show', `Show „${src.name}“ dupliziert`);
    return { created: project.id };
  },

  'shows.rename'(db, ctx, p) {
    const project = p.showId === db.project.id ? db.project : findStashed(db, p.showId).project;
    const old = project.name;
    if ('name' in p) project.name = cleanText(p.name, 80) || old;
    if ('date' in p) project.date = cleanDate(p.date);
    log(db, ctx, 'show', `Show „${old}“ umbenannt in „${project.name}“`);
  },

  'shows.remove'(db, ctx, p) {
    if (p.showId === db.project.id) fail('Die geöffnete Show kann nicht gelöscht werden. Zuerst eine andere öffnen.');
    const s = findStashed(db, p.showId);
    db.shows = db.shows.filter((x) => x !== s);
    log(db, ctx, 'show', `Show „${s.project.name}“ gelöscht`);
  },

  // ----- Showablauf -----
  'run.goto'(db, ctx, p) {
    return runStep(db, ctx, Number(p.index));
  },
  'run.next'(db, ctx) {
    const cur = rundown(db)[db.live.run ?? -1];
    // Nichts vergessen: Nach einer Münzvergabe erst weiter, wenn die Münze vergeben ist.
    if (cur && cur.kind === 'coin' && !db.live.coins.some((c) => c.position === cur.pos)) {
      fail(`Die Münze nach Spiel ${cur.pos} ist noch nicht vergeben – erst die Schätzfrage entscheiden.`);
    }
    const next = (db.live.run ?? -1) + 1;
    if (next >= rundown(db).length) fail('Das war der letzte Schritt.');
    return runStep(db, ctx, next);
  },
  'run.prev'(db, ctx) {
    const prev = (db.live.run ?? -1) - 1;
    if (prev < 0) fail('Das ist der erste Schritt.');
    return runStep(db, ctx, prev);
  },
  'rundown.set'(db, ctx, p) {
    db.project.rundown = cleanRundown(db, p.steps);
    if (db.live.run >= db.project.rundown.length) db.live.run = db.project.rundown.length - 1;
    log(db, ctx, 'ablauf', `Showablauf geändert (${db.project.rundown.length} Schritte)`);
  },
  // Lieder einer Pause setzen. Ein noch nicht angepasster Standardablauf wird dabei übernommen.
  'rundown.setSongs'(db, ctx, p) {
    const steps = rundown(db).map((x) => ({ ...x }));
    const st = steps.find((x) => x.id === p.stepId);
    if (!st || st.kind !== 'pause') fail('Pause nicht gefunden.');
    const songs = cleanSongs(p.songs || []);
    if (songs.length) st.songs = songs;
    else delete st.songs;
    db.project.rundown = steps;
    log(db, ctx, 'editor', `Pause: ${songs.length} eigene Lieder hinterlegt`);
  },
  'rundown.reset'(db, ctx) {
    db.project.rundown = null;
    log(db, ctx, 'ablauf', 'Standard-Showablauf wiederhergestellt');
  },

  // Letzte Aktion der Moderation rückgängig machen (Spielstand, Punkte, Münzen, Ablauf).
  'undo.last'(db, ctx) {
    const st = undoStack(db);
    const snap = st[st.length - 1];
    if (!snap) fail('Es gibt nichts zum Rückgängigmachen.');
    if (snap.project !== showKey(db)) { st.length = 0; fail('Inzwischen wurde eine andere Show geöffnet – Rückgängig ist nicht mehr möglich.'); }
    st.pop();
    db.live = snap.live;
    db.ledger = snap.ledger;
    log(db, ctx, 'ablauf', `Rückgängig: ${snap.label}`);
  },

  // „Show jetzt starten“: alles aus Proben und Tests verwerfen (Punkte, Münzen,
  // Antworten, Spielstände, Rückgängig-Verlauf, Entwürfe auf den iPads) und mit
  // Schritt 1 des Showablaufs beginnen. Inhalte im Editor bleiben unverändert.
  'live.startShow'(db, ctx) {
    db.live = freshLive();
    db.live.session = ctx.now;
    db.ledger = [];
    const key = showKey(db);
    for (let i = UNDO_STACK.length - 1; i >= 0; i--) if (UNDO_STACK[i].project === key) UNDO_STACK.splice(i, 1);
    log(db, ctx, 'ablauf', 'Show gestartet – Proben und Tests verworfen');
    if (rundown(db).length) runStep(db, ctx, 0);
    return { reset: true };
  },
  'live.reset'(db, ctx, p) {
    if (p.confirm !== 'NEUSTART') fail('Neustart nicht bestätigt.');
    db.live = freshLive();
    db.live.session = ctx.now;
    db.ledger = [];
    log(db, ctx, 'ablauf', 'Kontrollierter Neustart: Spielstand und Punkte zurückgesetzt');
  },
};

// Führt eine Aktion aus. Eine Aktions-ID wird nur einmal verarbeitet, sodass
// doppelt gesendete Nachrichten keine doppelten Punkte oder Abgaben erzeugen.
// Zeitabläufe (z. B. abgelaufene Countdowns) in den Spielzustand übernehmen.
// Gibt true zurück, wenn sich etwas geändert hat.
function tick(db, now = Date.now()) {
  const g = activeGame(db);
  const fn = g && PLAY[g.type].tick;
  if (!fn) return false;
  return !!fn(db, { role: 'system', actor: 'system', now }, g, gameState(db, g));
}

// ----- Allgemeines „Rückgängig“ für die Moderation -----
// Vor jeder Live-Aktion der Moderation wird der Spielstand (live + Punktebuchungen)
// im Speicher gemerkt; „undo.last“ stellt den Stand vor der letzten Aktion wieder her.
// Nur im Arbeitsspeicher (nicht in der Datei); gilt für die gerade geöffnete Show.
const UNDO_STACK = [];
const UNDO_MAX = 25;
function undoStack() {
  return UNDO_STACK;
}
// ----- 10-Sekunden-Timer (für jedes Spiel von der Moderation startbar) -----
// Erst groß angekündigt, dann 10 Sekunden Countdown. Danach sind alle Antworten
// gesperrt; kurz nach Ablauf nimmt der Server noch die automatisch abgeschickten
// Schreibfelder an (GRACE), danach nichts mehr.
// Diese Moderationsaktionen starten eine neue Frage: der Timer wird zurückgesetzt.
const TIMER_RESET = new Set(['open', 'start', 'next', 'pick', 'showQuestion', 'nextHint', 'play', 'replay', 'startMovie', 'openWheel', 'spinFor', 'allowLate']);
function timerInfo(db, now = Date.now()) {
  const t = db.live.timer;
  const g = activeGame(db);
  if (!t || !g || t.gameId !== g.id) return null;
  const runAt = t.startedAt + TIMER.announce, endsAt = runAt + TIMER.run;
  return {
    phase: now < runAt ? 'announce' : now < endsAt ? 'run' : 'over',
    startsIn: Math.max(0, runAt - now),
    remainingMs: Math.max(0, endsAt - now),
    durationMs: TIMER.run,
    locked: now >= endsAt,
    closed: now > endsAt + TIMER.grace,
    id: t.startedAt,
  };
}
function timerWake(db, now) {
  const t = db.live.timer;
  if (!t) return null;
  const runAt = t.startedAt + TIMER.announce;
  return [runAt, runAt + TIMER.run, runAt + TIMER.run + TIMER.grace + 10].find((x) => x > now) || null;
}

const showKey = (db) => db.project.id || db.project.name;
function isUndoable(ctx, name) {
  if (ctx.role !== 'moderator' || typeof name !== 'string' || name === 'undo.last') return false;
  return /^(play|run|show|points|coin|beamer)\./.test(name) || name === 'live.reset' || name.startsWith('finale.') && !['finale.undo', 'finale.config', 'finale.setIntro'].includes(name);
}

function applyAction(db, ctx, name, payload, actionId) {
  if (actionId && db.processed.includes(actionId)) return { duplicate: true };
  tick(db, ctx.now);
  let result;
  const snap = isUndoable(ctx, name) ? { live: clone(db.live), ledger: clone(db.ledger), project: showKey(db), logLen: db.log.length, name, at: ctx.now, teamSince: 0 } : null;
  // Für „Rückgängig“ im Finale: Zustand vor jeder Finale-Aktion merken.
  const before = typeof name === 'string' && FINALE_UNDOABLE(name) && db.live.finale ? clone(db.live.finale) : null;
  if (ctx.role === 'beamer') {
    // Der Beamer darf nur melden, dass das Intro-Lied eines Spieltitels zu Ende ist.
    if (name !== 'beamer.introEnded') fail('Diese Aktion ist für diese Rolle nicht erlaubt.');
    result = introEnded(db, ctx, payload || {}) || {};
  } else if (typeof name === 'string' && name.startsWith('play.') && (ctx.role === 'moderator' || ctx.role === 'team')) {
    if (ctx.role === 'team' && name !== 'play.options') {
      const ti = timerInfo(db, ctx.now);
      if (ti && ti.closed) fail('Die Zeit ist abgelaufen – Antworten sind gesperrt.');
    }
    result = playAction(db, ctx, name.slice(5), payload || {}) || {};
    if (ctx.role === 'moderator' && TIMER_RESET.has(name.slice(5))) delete db.live.timer;
  } else if (ctx.role === 'team' && Object.prototype.hasOwnProperty.call(FINALE.team, name)) {
    result = FINALE.team[name](db, ctx, payload || {}) || {};
  } else {
    const fn = ctx.role === 'moderator' && Object.prototype.hasOwnProperty.call(moderatorActions, name) ? moderatorActions[name] : null;
    if (!fn) fail('Diese Aktion ist für diese Rolle nicht erlaubt.');
    result = fn(db, ctx, payload || {}) || {};
  }
  if (ctx.role === 'moderator' && typeof name === 'string' && (name.startsWith('run.') || name === 'show.activate')) delete db.live.timer;
  rememberFinale(db, name, before);
  if (snap) {
    const added = db.log.slice(snap.logLen);
    snap.label = (added.length ? added[added.length - 1].detail : name).slice(0, 140);
    delete snap.logLen;
    const st = undoStack(db);
    st.push(snap);
    if (st.length > UNDO_MAX) st.shift();
  } else if ((ctx.role === 'team' || ctx.role === 'host') && name !== 'play.options' && name !== 'play.notes') {
    const st = undoStack(db);
    if (st.length) st[st.length - 1].teamSince += 1;
  }
  if (actionId) {
    db.processed.push(actionId);
    if (db.processed.length > MAX_PROCESSED) db.processed.splice(0, db.processed.length - MAX_PROCESSED);
  }
  return result;
}

const UNDO_LABEL = {
  'finale.next': 'Finalfrage gestellt', 'finale.modAnswer': 'Antwort der Moderation', 'finale.answer': 'Antwort des Teams',
  'finale.gradeTeam': 'Bewertung des Teams', 'finale.reveal': 'Auflösung', 'finale.challenge': 'Münzeinsatz', 'finale.pass': 'kein Münzeinsatz',
  'finale.gradeMod': 'Bewertung der Moderation', 'finale.resolve': 'Weiter ohne Münze', 'finale.decide': 'Entscheidung',
};
const FINALE_UNDOABLE = (name) => name.startsWith('finale.') && !['finale.undo', 'finale.config', 'finale.start', 'finale.reset', 'finale.setIntro'].includes(name);
function rememberFinale(db, name, before) {
  if (!before) return;
  if (!db.live.finaleHistory) db.live.finaleHistory = [];
  db.live.finaleHistory.push({ state: before, action: name });
  if (db.live.finaleHistory.length > 15) db.live.finaleHistory.shift();
}

// Alle Medien, auf die irgendeine Show noch verweist (für das Aufräumen).
// Alle Medienverweise in Spielinhalten (Datenbank und Shows), z. B. Filmclips oder Bilder.
function collectMedia(v, ids) {
  if (!v || typeof v !== 'object') return;
  if (Array.isArray(v)) { v.forEach((x) => collectMedia(x, ids)); return; }
  if (typeof v.id === 'string' && /^media_/.test(v.id) && typeof v.type === 'string') ids.add(v.id);
  for (const x of Object.values(v)) collectMedia(x, ids);
}

function referencedMedia(db) {
  const ids = new Set();
  for (const e of db.library || []) { collectMedia(e.content, ids); if (e.intro) ids.add(e.intro.id); }
  for (const pr of [db.project, ...db.shows.map((x) => x.project)]) {
    if (pr.introVideo) ids.add(pr.introVideo.id);
    for (const g of pr.games) { if (g.intro) ids.add(g.intro.id); collectMedia(g.content, ids); }
    if (pr.finaleIntro) ids.add(pr.finaleIntro.id);
    Object.values(pr.stages || {}).forEach((st) => { if (st && st.intro) ids.add(st.intro.id); });
    for (const st of pr.rundown || []) for (const m of st.songs || []) ids.add(m.id);
  }
  return ids;
}

function findTeamByCode(db, code) {
  if (typeof code !== 'string') return null;
  const c = code.trim().toUpperCase();
  return db.project.teams.find((t) => t.code === c) || null;
}

// ---------- Sichten ----------

function gameHeader(db) {
  const g = activeGame(db);
  return g ? { type: g.type, title: g.title, position: position(db, g), intro: g.intro ? { id: g.intro.id, type: g.intro.type } : null, color: g.color || null } : null;
}

const TEAM_WAIT_VIEWS = ['pause', 'coin', 'stageTitle', 'hosts', 'finaleTitle'];

function teamView(db, teamId, now = Date.now()) {
  const team = findTeam(db, teamId);
  const view = {
    role: 'team',
    show: { name: db.project.name, subtitle: db.project.subtitle },
    team: { id: team.id, name: team.name, color: team.color },
    teams: publicTeams(db),
    // Wechselt bei „Show jetzt starten“/Neustart: iPads verwerfen dann alte Entwürfe.
    session: db.live.session || 0,
    game: gameHeader(db),
    settings: { reducedMotion: db.project.settings.reducedMotion },
  };
  if (db.project.settings.publicScores) view.ranking = rankingSnapshot(db).map(({ name, color, points }) => ({ name, color, points }));
  // Abschluss der Show: jedes Team sieht seinen Platz und ein Dankeschön.
  const step = rundown(db)[db.live.run ?? -1];
  if (step && step.kind === 'end') {
    const ranking = rankingSnapshot(db);
    const me = ranking.find((r) => r.teamId === teamId);
    const place = 1 + ranking.filter((r) => r.points > (me ? me.points : 0)).length;
    const f = db.live.finale;
    view.game = null;
    view.end = {
      place,
      of: ranking.length,
      points: me ? me.points : 0,
      finale: f && f.teamId === teamId ? (f.result === 'team' ? 'won' : f.result === 'mod' ? 'lost' : 'played') : null,
      showName: db.project.name,
    };
    return view;
  }
  // Pause, Münzvergabe, Zwischenstand und Titelfolien: die iPads warten, statt den
  // letzten Stand des vorigen Spiels zu zeigen.
  const away = TEAM_WAIT_VIEWS.includes(db.live.beamer && db.live.beamer.view);
  if (away) {
    view.game = null;
    view.waitKind = db.live.beamer.view === 'pause' ? 'pause' : 'wait';
    return view;
  }
  const g = activeGame(db);
  if (g) {
    const play = PLAY[g.type].teamView(db, g, gameState(db, g), teamId, now);
    if (play) view.play = { type: g.type, ...play, scoring: scoringOf(g) };
    if (play) view.timer = timerInfo(db, now);
  } else if (db.live.finale) {
    view.finale = FINALE.teamView(db, teamId);
  }
  return view;
}

function publicTeams(db) {
  return db.project.teams.map((t) => ({ id: t.id, name: t.name, color: t.color }));
}

// Nächster Zeitpunkt, an dem die Server alle Sichten neu senden sollen.
function nextWake(db, now = Date.now()) {
  const g = activeGame(db);
  const fn = g && PLAY[g.type].wakeAt;
  const own = fn ? fn(db, g, gameState(db, g), now) : null;
  const tw = timerWake(db, now);
  return [own, tw].filter(Boolean).sort((x, y) => x - y)[0] || null;
}

function beamerGameView(db) {
  const g = activeGame(db);
  if (!g) return null;
  return { type: g.type, ...PLAY[g.type].beamerView(db, g, gameState(db, g)), scoring: scoringOf(g) };
}

// Der Beamer bekommt ausschließlich öffentliche, freigegebene Daten.
function beamerView(db) {
  const pr = db.project;
  const b = db.live.beamer;
  // Punktestände zeigt der Beamer nur bei der Münzvergabe auf den Teampulten;
  // sonst bleiben sie geheim (Team-iPads sehen nie fremde Punkte).
  const sums = b.view === 'coin' ? totals(db) : null;
  const view = {
    role: 'beamer',
    show: { name: pr.name, subtitle: pr.subtitle, host: pr.host, coHost: pr.coHost, hostAvatar: pr.hostAvatar || null, coHostAvatar: pr.coHostAvatar || null },
    teams: publicTeams(db).map((t, i) => {
      const out = sums ? { ...t, points: sums[t.id] || 0 } : { ...t };
      // Avatare nur in den Ansichten mit Teampulten mitschicken (große Bilder).
      const avatar = db.project.teams[i].avatar;
      if (avatar && (b.view === 'intro' || b.view === 'coin')) out.avatar = avatar;
      return out;
    }),
    settings: { reducedMotion: pr.settings.reducedMotion, sound: pr.settings.sound, titleDurationSec: pr.settings.titleDurationSec, fxVolume: pr.settings.fxVolume ?? 80, musicVolume: pr.settings.musicVolume ?? 80 },
    view: b.view,
    effect: db.live.effect,
    game: gameHeader(db),
    // Bereits vergebene Münzen: stehen auf den Teampulten, fehlen auf dem Moderationspult.
    coins: db.live.coins.map((c) => ({ position: c.position, teamId: c.teamId })),
  };
  // Erstes Lied jeder Pause: der Beamer lädt es vorab, damit die Musik sofort startet.
  view.preloadSongs = rundown(db).filter((x) => x.kind === 'pause' && x.songs && x.songs.length).map((x) => ({ id: x.songs[0].id, type: x.songs[0].type }));
  if (b.view === 'pause') {
    const st = b.data && b.data.stepId ? rundown(db).find((x) => x.id === b.data.stepId) : null;
    view.pauseSongs = st && st.songs ? st.songs.map((m) => ({ id: m.id, type: m.type, name: m.name })) : [];
    // Münzen auf dem Pult zählen wie vor der nächsten Münzvergabe – auch wenn deren
    // Gewinner schon ermittelt ist, liegt die Münze in der Pause noch auf dem Pult.
    const steps = rundown(db);
    const at = st ? steps.findIndex((x) => x.id === st.id) : -1;
    const nextCoin = at >= 0 ? steps.slice(at + 1).find((x) => x.kind === 'coin') : null;
    view.pauseCoinPos = nextCoin ? nextCoin.pos : null;
  }
  if (b.view === 'video') view.introVideo = pr.introVideo ? { id: pr.introVideo.id, type: pr.introVideo.type } : null;
  if (b.view === 'game') { view.gameView = beamerGameView(db); view.timer = timerInfo(db); }
  if (b.view === 'ranking') view.ranking = b.data.ranking;
  if (b.view === 'coin') view.coin = b.data;
  if (b.view === 'finale') view.finale = FINALE.beamerView(db);
  if (b.view === 'stageTitle') {
    const n = (b.data && b.data.stage) || 1;
    const st = stageOf(db, n);
    view.stage = { n, color: st.color || null, intro: st.intro ? { id: st.intro.id, type: st.intro.type } : null };
  }
  if (b.view === 'hosts') view.hosts = { stage: (b.data && b.data.stage) || null };
  if (b.view === 'finaleTitle') view.finaleIntro = pr.finaleIntro ? { id: pr.finaleIntro.id, type: pr.finaleIntro.type } : null;
  if (b.view === 'pyramid' || b.view === 'intro') {
    view.games = pr.games.map((g, i) => ({ title: g.title, position: i + 1 }));
  }
  return view;
}

function moderatorView(db, connections) {
  return {
    role: 'moderator',
    project: db.project,
    shows: showList(db),
    library: db.library,
    types: publicTypes(),
    // Vergleichs-Datenbanken für „Das geht mir zu weit“ (zum Prüfen im Editor).
    datasets: DATASETS.map((d) => ({ name: d.name, kind: d.kind, unit: d.unit, source: d.source, asOf: d.asOf, method: d.method, fixHelp: d.fixHelp, entries: d.entries })),
    showSize: SHOW_SIZE,
    // „Rückgängig“: was zuletzt passiert ist und ob Teams seitdem etwas abgegeben haben.
    undo: (() => { const st = undoStack(db); const u = st[st.length - 1]; return u && u.project === showKey(db) ? { label: u.label, teamSince: u.teamSince, count: st.length } : null; })(),
    live: { ...db.live, finaleHistory: undefined },
    timer: timerInfo(db),
    totals: totals(db),
    ledger: db.ledger.slice(-100),
    log: db.log.slice(-60),
    coinPositions: COIN_POSITIONS,
    rundown: rundown(db).map((st) => ({ ...st, text: stepLabel(db, st) })),
    rundownCustom: Array.isArray(db.project.rundown) && db.project.rundown.length > 0,
    connections: connections || {},
    beamerPreview: beamerView(db),
    // Teams aller anderen Shows (ohne große Avatar-Bilder) zum Vorbereiten im Editor.
    showTeams: db.shows.map((x) => ({ id: x.project.id, name: x.project.name, date: x.project.date || '', hasPoints: x.ledger.length > 0,
      teams: x.project.teams.map((t) => ({ id: t.id, name: t.name, color: t.color, code: t.code, hasAvatar: !!t.avatar })) })),
    finale: { ...FINALE.moderatorView(db), undoLabel: (() => { const h = db.live.finaleHistory || []; const l = h[h.length - 1]; return l ? UNDO_LABEL[l.action] || l.action : null; })() },
  };
}

module.exports = {
  QuizError,
  referencedMedia,
  tick,
  createState,
  migrate,
  applyAction,
  findTeamByCode,
  sanitizeContent,
  teamView,
  beamerView,
  moderatorView,
  totals,
  nextWake,
  trumpfPoints: PLAY.trumpf5.pointsFor,
};
