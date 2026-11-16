'use strict';

// Spiel „Blamieren oder Sortieren“: Eine Aufgabe hat genau fünf Elemente (Bild
// oder Begriff). Im Editor stehen sie in der richtigen Reihenfolge (Platz 1
// zuerst). Alle Teams sehen dieselben fünf Karten gemischt und ordnen sie per
// Ziehen den Plätzen 1–5 zu. Kein Timer. Absenden erst, wenn alle fünf Plätze
// belegt sind, danach verbindlich. Wertung: je Element auf exakt richtigem Platz
// 1 Punkt (0–5), kein Bonus, keine Joker. Ausgewertet wird, wenn alle Teams
// abgegeben haben oder die Moderation die Runde schließt.

const { fail, log, effect, teamName, teamIds, bookTarget } = require('./core');
const { pv } = require('./scoring');
const { shuffled } = require('./match');

const N = 5;

function round(st, i) {
  if (!st.rounds[i]) st.rounds[i] = { open: false, closed: false, answers: {}, evaluated: false };
  return st.rounds[i];
}
function current(st) {
  if (st.index < 0) fail('Es läuft gerade keine Aufgabe.');
  return round(st, st.index);
}
// Gemischte Reihenfolge der Karten (für alle Teams gleich, stabil nach Neuladen).
const deck = (game, i) => shuffled([0, 1, 2, 3, 4], `${game.id}:sort:${i}`);
const card = (task, k) => {
  const it = task.items[k] || {};
  return { k, label: it.label || '', image: it.image ? { id: it.image.id, type: it.image.type } : null };
};
const allIn = (db, r) => teamIds(db).every((id) => r.answers[id]);
const score = (order, game = null) => order.reduce((s, k, pos) => s + (k === pos ? (game ? pv(game, 'position') : 1) : 0), 0);

module.exports = {
  init: () => ({ index: -1, rounds: {} }),
  score,

  team: {
    // { order: [k1..k5] } – k = Element-Nummer in der richtigen Reihenfolge (0–4) je Platz 1–5
    submit(db, ctx, game, st, p) {
      const r = current(st);
      if (!r.open || r.closed) fail('Die Abgabe ist geschlossen.');
      if (r.answers[ctx.teamId]) fail('Ihr habt schon abgegeben.');
      const o = Array.isArray(p.order) ? p.order.map(Number) : [];
      if (o.length !== N || o.some((k) => !Number.isInteger(k) || k < 0 || k >= N) || new Set(o).size !== N) fail('Bitte alle fünf Plätze belegen.');
      r.answers[ctx.teamId] = { order: o, at: ctx.now };
      log(db, ctx, 'antwort', `${teamName(db, ctx.teamId)} hat sortiert abgegeben`);
    },
  },

  mod: {
    open(db, ctx, game, st, p) {
      const i = Number(p.index);
      const task = game.content.tasks[i];
      if (!task) fail('Aufgabe nicht gefunden.');
      if ((task.items || []).length !== N || task.items.some((it) => !(it.label || '').trim() && !it.image)) fail('Jede Aufgabe braucht genau fünf Elemente (Begriff oder Bild).');
      if (st.index >= 0 && st.index !== i) round(st, st.index).open = false;
      st.index = i;
      const r = round(st, i);
      if (!r.evaluated) r.open = true;
      log(db, ctx, 'ablauf', `Sortieren: Aufgabe ${i + 1} offen`);
    },
    close(db, ctx, game, st) {
      const r = current(st);
      r.closed = true;
      log(db, ctx, 'ablauf', `Sortieren: Abgabe von Aufgabe ${st.index + 1} geschlossen`);
    },
    evaluate(db, ctx, game, st) {
      const r = current(st);
      if (r.evaluated) fail('Schon ausgewertet.');
      if (!r.closed && !allIn(db, r)) fail('Noch haben nicht alle Teams abgegeben – oder Abgabe schließen.');
      r.open = false;
      r.closed = true;
      r.evaluated = true;
      for (const [teamId, a] of Object.entries(r.answers)) {
        bookTarget(db, ctx, `sortieren:${game.id}:${st.index}:${teamId}`, teamId, score(a.order, game), `${game.title}, Aufgabe ${st.index + 1}`);
      }
      log(db, ctx, 'ablauf', `Sortieren: Aufgabe ${st.index + 1} aufgelöst`);
      effect(db, 'show'); // alle zugleich aufgelöst: kein Richtig-/Falsch-Ton
    },
  },

  teamView(db, game, st, teamId) {
    if (st.index < 0) return null;
    const r = round(st, st.index);
    const task = game.content.tasks[st.index];
    const own = r.answers[teamId];
    return {
      index: st.index,
      count: game.content.tasks.length,
      category: task.category,
      cards: deck(game, st.index).map((k) => card(task, k)),
      open: r.open && !r.closed,
      submitted: !!own,
      order: own ? own.order : null,
      evaluated: r.evaluated,
      points: r.evaluated && own ? score(own.order, game) : null,
      hits: r.evaluated && own ? score(own.order) : null,
      solution: r.evaluated ? task.items.map((it, k) => ({ ...card(task, k), info: it.info || '' })) : null,
    };
  },

  beamerView(db, game, st) {
    if (st.index < 0) return { waiting: true };
    const r = round(st, st.index);
    const task = game.content.tasks[st.index];
    return {
      index: st.index,
      category: task.category,
      cards: deck(game, st.index).map((k) => card(task, k)),
      submittedCount: Object.keys(r.answers).length,
      teamCount: db.project.teams.length,
      // Wer schon abgegeben hat (nur ob, nicht was) – für die Statusleiste auf dem Beamer.
      teamIds: db.project.teams.map((t) => t.id),
      submitted: Object.keys(r.answers),
      evaluated: r.evaluated,
      solution: r.evaluated ? task.items.map((it, k) => ({ ...card(task, k), info: it.info || '' })) : null,
      results: r.evaluated ? Object.entries(r.answers).map(([teamId, a]) => ({ teamId, order: a.order, points: score(a.order, game) })) : [],
    };
  },
};
