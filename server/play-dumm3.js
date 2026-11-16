'use strict';

// Spiel „Dumm, dumm, dumm“: fünf Fragen A–D. Jedes Team wählt Antwort und
// Einsatz (1–5, jeden Wert genau einmal im Spiel) und schickt beides mit
// „Absenden“ verbindlich ab. Richtig: +Einsatz, falsch: −Einsatz.

const { fail, log, effect, teamName, bookTarget, cleanChoice } = require('./core');

const STAKES = [1, 2, 3, 4, 5];

function round(st, q) {
  if (!st.rounds[q]) st.rounds[q] = { open: false, entries: {}, evaluated: false };
  return st.rounds[q];
}

function current(st) {
  if (st.qIndex < 0) fail('Es läuft gerade keine Frage.');
  return round(st, st.qIndex);
}

// Einsätze, die ein Team bei anderen Fragen schon verbraucht hat.
function usedStakes(st, teamId, exceptQ = -1) {
  const out = [];
  for (const [q, r] of Object.entries(st.rounds)) {
    if (Number(q) === exceptQ) continue;
    const e = r.entries[teamId];
    if (e) out.push(e.stake);
  }
  return out;
}

const ref = (game, q, teamId) => `dumm3:${game.id}:${q}:${teamId}`;

module.exports = {
  STAKES,
  init: () => ({ qIndex: -1, rounds: {} }),

  team: {
    submit(db, ctx, game, st, p) {
      const r = current(st);
      if (!r.open) fail('Die Frage ist nicht (mehr) offen.');
      if (r.entries[ctx.teamId]) fail('Ihr habt bei dieser Frage schon verbindlich abgegeben.');
      const choice = cleanChoice(p.choice);
      const stake = Number(p.stake);
      if (!STAKES.includes(stake)) fail('Bitte einen Einsatz von 1 bis 5 wählen.');
      if (usedStakes(st, ctx.teamId, st.qIndex).includes(stake)) fail(`Den Einsatz ${stake} habt ihr schon verwendet.`);
      r.entries[ctx.teamId] = { choice, stake, at: ctx.now };
      log(db, ctx, 'antwort', `${teamName(db, ctx.teamId)} hat Frage ${st.qIndex + 1} abgegeben`);
    },
  },

  mod: {
    open(db, ctx, game, st, p) {
      const q = Number(p.qIndex);
      if (!game.content.questions[q]) fail('Frage nicht gefunden.');
      if (st.qIndex >= 0 && st.qIndex !== q) round(st, st.qIndex).open = false;
      st.qIndex = q;
      const r = round(st, q);
      if (!r.evaluated) r.open = true;
      log(db, ctx, 'ablauf', `Frage ${q + 1} freigegeben`);
    },

    close(db, ctx, game, st) {
      const r = current(st);
      r.open = false;
      log(db, ctx, 'ablauf', `Abgabe für Frage ${st.qIndex + 1} geschlossen`);
    },

    evaluate(db, ctx, game, st) {
      const r = current(st);
      if (r.evaluated) fail('Diese Frage ist bereits ausgewertet.');
      const q = game.content.questions[st.qIndex];
      r.open = false;
      r.evaluated = true;
      for (const [teamId, e] of Object.entries(r.entries)) {
        const ok = e.choice === q.correct;
        bookTarget(db, ctx, ref(game, st.qIndex, teamId), teamId, ok ? e.stake : -e.stake, `${game.title}, Frage ${st.qIndex + 1} (Einsatz ${e.stake})`);
      }
      log(db, ctx, 'ablauf', `Frage ${st.qIndex + 1} ausgewertet (richtig: ${q.correct})`);
      effect(db, 'show'); // alle zugleich aufgelöst: kein Richtig-/Falsch-Ton
    },

    // Korrektur durch die Moderation (z. B. fehlerhafte Lösung im Editor).
    grade(db, ctx, game, st, p) {
      const r = current(st);
      if (!r.evaluated) fail('Erst auswerten, dann korrigieren.');
      const e = r.entries[p.teamId];
      if (!e) fail('Dieses Team hat nicht abgegeben.');
      e.override = !!p.correct;
      bookTarget(db, ctx, ref(game, st.qIndex, p.teamId), p.teamId, p.correct ? e.stake : -e.stake, `${game.title}, Frage ${st.qIndex + 1}, Bewertung korrigiert`);
    },
  },

  teamView(db, game, st, teamId) {
    if (st.qIndex < 0) return null;
    const r = round(st, st.qIndex);
    const q = game.content.questions[st.qIndex];
    const own = r.entries[teamId] || null;
    const ok = own ? (own.override !== undefined ? own.override : own.choice === q.correct) : null;
    return {
      qIndex: st.qIndex,
      count: game.content.questions.length,
      level: q.level,
      question: q.question,
      options: q.options,
      open: r.open,
      entry: own ? { choice: own.choice, stake: own.stake } : null,
      used: usedStakes(st, teamId, st.qIndex),
      evaluated: r.evaluated,
      correct: r.evaluated ? q.correct : null,
      result: r.evaluated && own ? (ok ? own.stake : -own.stake) : null,
    };
  },

  beamerView(db, game, st) {
    if (st.qIndex < 0) return { waiting: true };
    const r = round(st, st.qIndex);
    const q = game.content.questions[st.qIndex];
    return {
      qIndex: st.qIndex,
      level: q.level,
      question: q.question,
      options: q.options,
      submittedCount: Object.keys(r.entries).length,
      teamCount: db.project.teams.length,
      evaluated: r.evaluated,
      correct: r.evaluated ? q.correct : null,
      // Antworten und Einsätze erst nach der Auswertung öffentlich.
      results: r.evaluated ? Object.entries(r.entries).map(([teamId, e]) => {
        const ok = e.override !== undefined ? e.override : e.choice === q.correct;
        return { teamId, choice: e.choice, stake: e.stake, ok };
      }) : [],
    };
  },
};
