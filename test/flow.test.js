'use strict';

// Jedes Spiel einmal komplett nur mit „Weiter“ durchspielen. Wo „Weiter“ wartet
// (Bewertung, Team am Zug …), probiert der Test der Reihe nach typische Team- und
// Regie-Eingaben aus, bis sich etwas bewegt – so wie es im echten Spiel passiert.

const test = require('node:test');
const assert = require('node:assert');
const game = require('../server/game');

let clock = 1_800_000_000_000;
Date.now = () => clock; // gleiche Uhr für Regie-Ansicht und Aktionen
const mod = () => ({ role: 'moderator', actor: 'moderator', now: (clock += 50) });
const team = (id) => ({ role: 'team', teamId: id, actor: `team:${id}`, now: (clock += 50) });
const INK = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const MEDIA = (type) => ({ id: 'media_0123456789abcdef', type, name: 'x', size: 1 });

function setup(type) {
  const db = game.createState();
  game.migrate(db);
  const entry = db.library.find((e) => e.type === type);
  const c = JSON.parse(JSON.stringify(entry.content));
  // Pflicht-Medien und Listen ergänzen, damit jede Runde startbar ist.
  if (type === 'lippen') c.items.forEach((it) => { it.image = MEDIA('image/png'); });
  if (type === 'filmab') c.films.forEach((f) => { f.clip = MEDIA('video/mp4'); });
  if (type === 'songsong') c.puzzles.forEach((p) => { p.audio = MEDIA('audio/mpeg'); });
  if (type === 'konsequenz') c.songs.forEach((s) => { s.audio = MEDIA('audio/mpeg'); });
  if (type === 'top100') c.rounds.forEach((r) => { r.entries = Array.from({ length: 100 }, (_, i) => `Eintrag ${i + 1}`).join('\n'); });
  game.applyAction(db, mod(), 'library.update', { libraryId: entry.id, content: c });
  const slot = db.project.games[7];
  game.applyAction(db, mod(), 'game.replace', { gameId: slot.id, libraryId: entry.id });
  const idx = game.moderatorView(db).rundown.findIndex((x) => x.kind === 'game' && x.pos === 8);
  game.applyAction(db, mod(), 'run.goto', { index: idx });
  return db;
}

const snap = (db) => JSON.stringify({ live: db.live, ledger: db.ledger.length });

function tryAct(db, ctx, name, payload) {
  const before = snap(db);
  try { game.applyAction(db, ctx, name, payload); } catch { return false; }
  return snap(db) !== before;
}

// Typische Eingaben – Reihenfolge: erst Teams und Bewertungen, Notausgänge zuletzt.
function teamMoves(db, st) {
  const out = [];
  const q = st.qIndex ?? st.index ?? 0;
  out.push(['submit', { text: 'Antwort' }], ['submit', { ink: INK, player: 1 }], ['submit', { ink: INK, player: 2 }], ['submit', { ink: INK }]);
  out.push(['answer', { choice: 'A' }], ['answer', { value: 10 }], ['answer', { text: 'Titanic' }]);
  out.push(['submit', { choice: 'A', stake: q + 1 }], ['submit', { order: [0, 1, 2, 3, 4] }]);
  const n = (() => { try { return game.moderatorView(db).project.games[7].content.rounds?.[q]?.items?.length || 0; } catch { return 0; } })();
  if (n) out.push(['submit', { choice: Array(n).fill('N') }]);
  out.push(['propose', { question: 'Frage?', answer: 'Antwort', ink: INK, qInk: INK, aInk: INK }], ['guess', { lat: 50, lng: 10 }], ['bid', { bid: 2 }], ['tiePick', { pref: 'start' }]);
  for (let h = 0; h < 10; h++) out.push(['buy', { hint: h }]);
  out.push(['buzz', {}], ['buzz', { pick: 0 }], ['wheelBuzz', {}], ['spin', {}], ['decide', { choice: 'secure' }]);
  for (let k = 0; k < 24; k++) out.push(['choose', { q: k }]);
  for (let c = 0; c < 5; c++) for (const l of [1, 2, 3]) out.push(['pick', { c, l }]);
  const g = db.live.games[db.live.activeGame] || {};
  const dgf = g.rounds && g.rounds[g.catIndex];
  if (dgf && dgf.board) out.push(...dgf.board.filter((b) => !b.gone && !b.wrong).map((b) => ['pick', { termId: b.id }]), ['secure', {}]);
  const tl = g.rounds && g.rounds[g.index];
  if (tl && tl.pool && tl.line) for (const item of tl.pool.slice(0, 1)) for (let pos = 0; pos <= tl.line.length; pos++) out.push(['place', { item, pos }]);
  out.push(['vote', { letter: 'A' }], ['vote', { letter: 'B' }]);
  const others = db.project.teams.map((t) => t.id);
  out.push(['guess', { guesses: Object.fromEntries(others.map((id) => [id, true])) }]);
  const zw = g.rounds && g.rounds[g.index];
  if (zw && zw.picks !== undefined && zw.names) out.push(['submit', { a: zw.names[0], b: zw.names[1] }]);
  return out;
}
function modMoves(db, ids) {
  const out = [['judge', { correct: true }], ['coinDone', {}]];
  for (const id of ids) out.push(['accept', { teamId: id }]);
  for (const id of ids) out.push(['grade', { teamId: id, correct: true }], ['setRank', { teamId: id, rank: 5 }], ['setEntry', { teamId: id, entry: 1 }], ['judge', { teamId: id, match: true }]);
  out.push(['mark', { text: 'falsch' }], ['resolveTie', { best: ids, worst: ids }], ['decideFor', { choice: 'secure' }]);
  for (let c = 0; c < 5; c++) for (let f = 0; f < 3; f++) out.push(['pick', { cat: c, field: f }]);
  for (let k = 0; k < 24; k++) out.push(['open', { q: k }]);
  for (const id of ids) out.push(['pick', { teamId: id }]);
  out.push(['spinFor', {}], ['end', {}], ['close', {}]);
  return out;
}

function unblock(db, teamsOnly = false) {
  const ids = db.project.teams.map((t) => t.id);
  const st = db.live.games[db.live.activeGame] || {};
  // „Das geht mir zu weit“: Namensliste wie das iPad über „options“ holen.
  const zr = st.rounds && st.rounds[st.index];
  if (zr && zr.picks !== undefined && !zr.names) {
    try { zr.names = game.applyAction(db, team(ids[0]), 'play.options', {}).data; } catch { /* egal */ }
  }
  // Teams handeln (für jedes Team die erste Eingabe, die etwas bewirkt).
  let moved = false;
  for (const id of ids) {
    for (const [name, p] of teamMoves(db, st)) {
      if (tryAct(db, team(id), `play.${name}`, p)) { moved = true; break; }
    }
  }
  if (moved || teamsOnly) return moved;
  for (const [name, p] of modMoves(db, ids)) if (tryAct(db, mod(), `play.${name}`, p)) return true;
  // Zeitabhängiges (Countdowns): Uhr vorstellen.
  clock += 70_000;
  game.tick(db, clock);
  return false;
}

const TYPES = Object.keys(game.moderatorView(game.createState()).types);

for (const type of TYPES) {
  test(`Ablauf nur mit „Weiter“: ${type}`, () => {
    const db = setup(type);
    let weiter = 0;
    let stuck = 0;
    for (let i = 0; i < 1500; i++) {
      const f = game.moderatorView(db).flow;
      if (!f) break;
      if (f.label) {
        // Vor jedem „Weiter“ geben die Teams ab (so schließt die Abgabe auch automatisch).
        unblock(db, true);
        const g = game.moderatorView(db).flow;
        if (!g) break;
        if (g.label) {
          game.applyAction(db, mod(), 'run.next', {});
          weiter += 1;
          stuck = 0;
        }
        continue;
      }
      if (!unblock(db)) stuck += 1;
      assert.ok(stuck < 4, `${type}: hängt bei „${f.wait}“`);
    }
    assert.equal(game.moderatorView(db).flow, null, `${type}: Spiel wurde nicht zu Ende gespielt`);
    assert.ok(weiter > 0);
    // Danach geht „Weiter“ wieder zur nächsten Folie.
    const before = db.live.run;
    game.applyAction(db, mod(), 'run.next', {});
    assert.equal(db.live.run, before + 1);
  });
}
