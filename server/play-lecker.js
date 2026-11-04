'use strict';

// Spiel „Lecker Sortierchen“: Begriffe stehen in der Mitte, links und rechts zwei
// frei benannte Zielbereiche. Jedes Team zieht auf seinem iPad jeden Begriff nach
// links oder rechts oder lässt ihn in der Mitte (neutral) – ohne Buzzer, ohne Zeit,
// jedes Team in seinem Tempo, Abgabe per Knopf. Wertung je Begriff: richtig links
// bzw. rechts +1, falsch links bzw. rechts −1, neutral immer 0 (nie ein Fehler).

const { fail, log, effect, teamName, teamIds, bookTarget } = require('./core');
const { pv } = require('./scoring');

const SIDE = { Links: 'L', Rechts: 'R', Neutral: 'N' };
const items = (rd) => (rd.items || []).filter((it) => String(it.term || '').trim());

function round(st, i) {
  if (!st.rounds[i]) st.rounds[i] = { open: true, answers: {}, evaluated: false };
  return st.rounds[i];
}
function current(st) {
  if (st.index < 0) fail('Es läuft gerade keine Runde.');
  return round(st, st.index);
}
// Punkte eines Teams: richtig L/R +Wert, falsch L/R −Wert, N immer 0.
function score(game, rd, choice) {
  let right = 0, wrong = 0;
  items(rd).forEach((it, k) => {
    const c = choice[k] || 'N';
    if (c === 'N') return;
    if (c === (SIDE[it.side] || 'N')) right += 1; else wrong += 1;
  });
  return { right, wrong, points: right * pv(game, 'right') - wrong * pv(game, 'wrong') };
}

module.exports = {
  init: () => ({ index: -1, rounds: {} }),
  score,

  team: {
    // { choice: ['L'|'R'|'N', …] } in der Reihenfolge der Begriffe – verbindlich.
    submit(db, ctx, game, st, p) {
      const r = current(st);
      if (!r.open) fail('Die Abgabe ist geschlossen.');
      if (r.answers[ctx.teamId]) fail('Ihr habt schon abgegeben.');
      const n = items(game.content.rounds[st.index]).length;
      const c = Array.isArray(p.choice) ? p.choice : [];
      if (c.length !== n || c.some((x) => !['L', 'R', 'N'].includes(x))) fail('Ungültige Zuordnung.');
      r.answers[ctx.teamId] = { choice: c.slice(), at: ctx.now };
      log(db, ctx, 'antwort', `${teamName(db, ctx.teamId)} hat sortiert abgegeben`);
    },
  },

  mod: {
    open(db, ctx, game, st, p) {
      const i = Number(p.index);
      const rd = game.content.rounds[i];
      if (!rd) fail('Runde nicht gefunden.');
      if (!items(rd).length) fail('Diese Runde hat noch keine Begriffe.');
      st.index = i;
      round(st, i);
      log(db, ctx, 'ablauf', `Lecker Sortierchen: Runde ${i + 1} offen`);
    },
    close(db, ctx, game, st) {
      current(st).open = false;
      log(db, ctx, 'ablauf', `Lecker Sortierchen: Abgabe von Runde ${st.index + 1} geschlossen`);
    },
    evaluate(db, ctx, game, st) {
      const r = current(st);
      if (r.evaluated) fail('Schon ausgewertet.');
      const all = teamIds(db).every((id) => r.answers[id]);
      if (!all && r.open) fail('Noch haben nicht alle Teams abgegeben – oder Abgabe schließen.');
      r.open = false;
      r.evaluated = true;
      const rd = game.content.rounds[st.index];
      for (const [teamId, a] of Object.entries(r.answers)) {
        bookTarget(db, ctx, `lecker:${game.id}:${st.index}:${teamId}`, teamId, score(game, rd, a.choice).points, `${game.title}, Runde ${st.index + 1}`);
      }
      log(db, ctx, 'ablauf', `Lecker Sortierchen: Runde ${st.index + 1} ausgewertet`);
      effect(db, 'reveal');
    },
  },

  teamView(db, game, st, teamId) {
    if (st.index < 0) return null;
    const r = round(st, st.index);
    const rd = game.content.rounds[st.index];
    const a = r.answers[teamId];
    const list = items(rd);
    return {
      index: st.index,
      count: game.content.rounds.length,
      left: rd.left || 'Links',
      right: rd.right || 'Rechts',
      terms: list.map((it) => it.term),
      open: r.open,
      submitted: !!a,
      choice: a ? a.choice : null,
      evaluated: r.evaluated,
      solution: r.evaluated ? list.map((it) => SIDE[it.side] || 'N') : null,
      result: r.evaluated && a ? score(game, rd, a.choice) : null,
    };
  },

  beamerView(db, game, st) {
    if (st.index < 0) return { waiting: true };
    const r = round(st, st.index);
    const rd = game.content.rounds[st.index];
    const list = items(rd);
    return {
      index: st.index,
      count: game.content.rounds.length,
      left: rd.left || 'Links',
      right: rd.right || 'Rechts',
      terms: list.map((it) => it.term),
      teamIds: db.project.teams.map((t) => t.id),
      submitted: Object.keys(r.answers),
      evaluated: r.evaluated,
      solution: r.evaluated ? list.map((it) => SIDE[it.side] || 'N') : null,
      results: r.evaluated ? Object.entries(r.answers).map(([teamId, a]) => ({ teamId, choice: a.choice, ...score(game, rd, a.choice) })) : [],
    };
  },
};
