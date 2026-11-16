'use strict';

// Spiel „Ich bin ein Star, lüg mich nicht an“: In der Mitte steht ein Star, Film,
// eine Rolle, ein Franchise oder ein Regisseur; im Uhrzeigersinn acht Begriffe –
// genau sieben richtig, einer falsch. Alle Teams wählen den Begriff, den sie für
// falsch halten; bis zum Buzzern änderbar, beim Buzzern verbindlich. Ein Buzzer
// sperrt die anderen nicht. Ausgewertet wird in Buzzer-Reihenfolge (serverseitig):
// das schnellste Team mit richtiger Wahl bekommt 1 Punkt, höchstens einer je Rätsel.

const { fail, log, effect, teamName, bookTarget } = require('./core');
const { pv } = require('./scoring');

const N = 8;
const wrongIndex = (pz) => Number(String(pz.wrong || '').replace(/\D/g, '')) - 1;

function round(st, i) {
  if (!st.rounds[i]) st.rounds[i] = { open: false, buzzes: [], resolved: false, winner: null };
  return st.rounds[i];
}
function current(st) {
  if (st.index < 0) fail('Es läuft gerade kein Rätsel.');
  return round(st, st.index);
}
// Rätsel ist nur spielbar, wenn alle acht Begriffe da sind und genau einer als falsch markiert ist.
function validate(pz) {
  const terms = (pz.terms || []).map((t) => String(t || '').trim());
  if (terms.length !== N || terms.some((t) => !t)) return 'Es müssen genau acht Begriffe eingetragen sein.';
  const w = wrongIndex(pz);
  if (!(w >= 0 && w < N)) return 'Bitte festlegen, welcher Begriff der falsche ist (genau einer).';
  if (!String(pz.center || '').trim()) return 'In der Mitte fehlt der Star / Film / das Franchise.';
  return null;
}

module.exports = {
  init: () => ({ index: -1, rounds: {} }),
  validate,

  team: {
    // Beim Buzzern wird die aktuelle Auswahl verbindlich: { pick: 0–7 }
    buzz(db, ctx, game, st, p) {
      const r = current(st);
      if (!r.open || r.resolved) fail('Das Rätsel ist nicht offen.');
      if (r.buzzes.some((b) => b.teamId === ctx.teamId)) fail('Ihr habt schon gebuzzert.');
      const pick = Number(p.pick);
      if (!(Number.isInteger(pick) && pick >= 0 && pick < N)) fail('Bitte zuerst einen Begriff auswählen.');
      r.buzzes.push({ teamId: ctx.teamId, pick, at: ctx.now });
      log(db, ctx, 'buzzer', `${teamName(db, ctx.teamId)} buzzert (Wahl ${pick + 1})`);
      if (r.buzzes.length === 1) effect(db, 'buzz');
    },
  },

  mod: {
    open(db, ctx, game, st, p) {
      const i = Number(p.index);
      const pz = game.content.puzzles[i];
      if (!pz) fail('Rätsel nicht gefunden.');
      const err = validate(pz);
      if (err) fail(`Rätsel ${i + 1} kann nicht freigegeben werden: ${err}`);
      if (st.index >= 0 && st.index !== i) round(st, st.index).open = false;
      st.index = i;
      const r = round(st, i);
      if (!r.resolved) r.open = true;
      log(db, ctx, 'ablauf', `Star: Rätsel ${i + 1} offen`);
    },
    // Auflösen: Buzzer schließen, in Buzzer-Reihenfolge prüfen, erster Richtiger +1.
    resolve(db, ctx, game, st) {
      const r = current(st);
      if (r.resolved) fail('Schon aufgelöst.');
      const w = wrongIndex(game.content.puzzles[st.index]);
      const ordered = r.buzzes.slice().sort((a, b) => a.at - b.at);
      const win = ordered.find((b) => b.pick === w) || null;
      r.open = false;
      r.resolved = true;
      r.winner = win ? win.teamId : null;
      if (win) bookTarget(db, ctx, `star:${game.id}:${st.index}`, win.teamId, pv(game, 'correct'), `${game.title}, Rätsel ${st.index + 1}`);
      log(db, ctx, 'ablauf', `Star: Rätsel ${st.index + 1} aufgelöst${win ? ` – ${teamName(db, win.teamId)} +1` : ' – kein Team richtig'}`);
      effect(db, 'show'); // alle zugleich aufgelöst: kein Richtig-/Falsch-Ton
    },
  },

  teamView(db, game, st, teamId) {
    if (st.index < 0) return null;
    const r = round(st, st.index);
    const pz = game.content.puzzles[st.index];
    const own = r.buzzes.find((b) => b.teamId === teamId);
    const w = wrongIndex(pz);
    return {
      index: st.index,
      count: game.content.puzzles.length,
      center: pz.center,
      terms: pz.terms,
      open: r.open && !r.resolved,
      buzzed: !!own,
      pick: own ? own.pick : null,
      place: own ? r.buzzes.slice().sort((a, b) => a.at - b.at).findIndex((b) => b.teamId === teamId) + 1 : null,
      resolved: r.resolved,
      wrong: r.resolved ? w : null,
      won: r.resolved ? r.winner === teamId : null,
    };
  },

  beamerView(db, game, st) {
    if (st.index < 0) return { waiting: true };
    const r = round(st, st.index);
    const pz = game.content.puzzles[st.index];
    const ordered = r.buzzes.slice().sort((a, b) => a.at - b.at);
    const w = wrongIndex(pz);
    return {
      index: st.index,
      center: pz.center,
      centerImage: pz.image ? { id: pz.image.id, type: pz.image.type } : null,
      terms: pz.terms,
      open: r.open,
      // Vor der Auflösung nur die Reihenfolge, nicht die Wahl der Teams.
      buzzOrder: ordered.map((b) => (r.resolved ? { teamId: b.teamId, pick: b.pick, correct: b.pick === w } : { teamId: b.teamId })),
      resolved: r.resolved,
      wrong: r.resolved ? w : null,
      winner: r.winner,
    };
  },
};
