'use strict';

// Spiel „Dumm ist der, der Dummes kriegt“: alle Teams sperren A–D, danach
// darf gebuzzert werden. Bei jeder Frage darf das schnellste Team seine
// Antwort mit einem anderen Team tauschen. Richtige finale Antwort: 1 Punkt.
// Das Buzzern sperrt die anderen Teams nicht: sie können bis zur Auflösung abgeben.

const { fail, log, effect, teamName, teamIds, bookTarget, cleanChoice } = require('./core');
const { pv } = require('./scoring');

const WINDOW_MS = 10000;

function round(st, q) {
  if (!st.rounds[q]) st.rounds[q] = { open: false, answers: {}, buzz: null, windowEnds: null, late: [], swap: null, evaluated: false };
  return st.rounds[q];
}

function current(st) {
  if (st.qIndex < 0) fail('Es läuft gerade keine Frage.');
  return round(st, st.qIndex);
}

// Finale Antworten nach einem eventuellen Tausch.
function finalChoices(r) {
  const out = {};
  for (const [id, a] of Object.entries(r.answers)) out[id] = a.choice;
  if (r.swap) {
    out[r.swap.by] = r.answers[r.swap.with].choice;
    out[r.swap.with] = r.answers[r.swap.by].choice;
  }
  return out;
}

function windowOver(r, now) {
  return r.windowEnds !== null && now > r.windowEnds;
}

// Tauschen ist möglich, sobald alle Teams abgegeben haben oder das 10-Sekunden-Fenster vorbei ist.
function swapReady(db, r, now) {
  const all = teamIds(db).every((id) => r.answers[id]);
  return all || windowOver(r, now);
}

module.exports = {
  WINDOW_MS,
  init: () => ({ qIndex: -1, rounds: {} }),

  team: {
    answer(db, ctx, game, st, p) {
      const r = current(st);
      if (!r.open) fail('Die Frage ist nicht freigegeben.');
      if (r.answers[ctx.teamId]) fail('Eure Antwort ist bereits gesperrt.');
      r.answers[ctx.teamId] = { choice: cleanChoice(p.choice), at: ctx.now };
      log(db, ctx, 'antwort', `${teamName(db, ctx.teamId)} hat Frage ${st.qIndex + 1} gesperrt`);
    },

    buzz(db, ctx, game, st) {
      const r = current(st);
      if (!r.open) fail('Die Frage ist nicht freigegeben.');
      if (!r.answers[ctx.teamId]) fail('Erst die eigene Antwort sperren, dann buzzern.');
      if (r.buzz) fail(`${teamName(db, r.buzz.teamId)} war schneller.`);
      r.buzz = { teamId: ctx.teamId, at: ctx.now };
      r.windowEnds = ctx.now + WINDOW_MS;
      log(db, ctx, 'buzzer', `${teamName(db, ctx.teamId)} buzzert als erstes Team`);
      effect(db, 'buzz');
    },

    swap(db, ctx, game, st, p) {
      const r = current(st);
      if (!r.buzz || r.buzz.teamId !== ctx.teamId) fail('Nur das schnellste Team darf tauschen.');
      if (r.swap) fail('Bei dieser Frage wurde schon getauscht.');
      if (r.evaluated) fail('Die Frage ist bereits ausgewertet.');
      if (!swapReady(db, r, ctx.now)) fail('Erst wenn alle Teams abgegeben haben, wird getauscht.');
      if (p.teamId === ctx.teamId || !r.answers[p.teamId]) fail('Bitte ein anderes Team mit abgegebener Antwort wählen.');
      r.swap = { by: ctx.teamId, with: p.teamId };
      log(db, ctx, 'tausch', `${teamName(db, ctx.teamId)} tauscht die Antwort mit ${teamName(db, p.teamId)}`);
    },
  },

  mod: {
    open(db, ctx, game, st, p) {
      const q = Number(p.qIndex);
      if (!game.content.questions[q]) fail('Frage nicht gefunden.');
      if (st.qIndex >= 0 && st.qIndex !== q && !round(st, st.qIndex).evaluated) round(st, st.qIndex).open = false;
      st.qIndex = q;
      const r = round(st, q);
      if (!r.evaluated) r.open = true;
      log(db, ctx, 'ablauf', `Frage ${q + 1} freigegeben`);
    },

    // Nach Ablauf der 10 Sekunden einem Team noch eine Abgabe erlauben.
    allowLate(db, ctx, game, st, p) {
      const r = current(st);
      if (r.answers[p.teamId]) fail('Dieses Team hat schon abgegeben.');
      if (!r.late.includes(p.teamId)) r.late.push(p.teamId);
      r.open = !r.evaluated;
      log(db, ctx, 'ablauf', `${teamName(db, p.teamId)} darf noch abgeben`);
    },

    evaluate(db, ctx, game, st) {
      const r = current(st);
      if (r.evaluated) fail('Diese Frage ist bereits ausgewertet.');
      const correct = game.content.questions[st.qIndex].correct;
      const finals = finalChoices(r);
      r.open = false;
      r.evaluated = true;
      for (const id of Object.keys(finals)) {
        bookTarget(db, ctx, `dummes:${game.id}:${st.qIndex}:${id}`, id, finals[id] === correct ? pv(game, 'correct') : 0, `${game.title}, Frage ${st.qIndex + 1}`);
      }
      log(db, ctx, 'ablauf', `Frage ${st.qIndex + 1} ausgewertet (richtig: ${correct})${r.buzz && !r.swap ? ', kein Tausch' : ''}`);
      effect(db, 'reveal');
    },

    // Kontrolle der finalen Bewertung durch die Moderation.
    grade(db, ctx, game, st, p) {
      const r = current(st);
      if (!r.evaluated) fail('Erst auswerten, dann korrigieren.');
      bookTarget(db, ctx, `dummes:${game.id}:${st.qIndex}:${p.teamId}`, p.teamId, p.correct ? pv(game, 'correct') : 0, `${game.title}, Frage ${st.qIndex + 1}, Bewertung korrigiert`);
    },
  },

  // Zeitpunkt, zu dem sich die Sichten ohne Aktion ändern (Ende des 10-Sekunden-Fensters).
  wakeAt(db, game, st, now) {
    if (st.qIndex < 0) return null;
    const r = round(st, st.qIndex);
    return r.windowEnds !== null && r.windowEnds > now ? r.windowEnds : null;
  },

  teamView(db, game, st, teamId, now) {
    if (st.qIndex < 0) return null;
    const r = round(st, st.qIndex);
    const q = game.content.questions[st.qIndex];
    const own = r.answers[teamId];
    const isBuzzer = r.buzz?.teamId === teamId;
    const finals = r.evaluated ? finalChoices(r) : null;
    return {
      qIndex: st.qIndex,
      count: game.content.questions.length,
      question: q.question,
      options: q.options,
      open: r.open,
      choice: own ? own.choice : null,
      late: r.late.includes(teamId),
      tooLate: false, // Buzzern sperrt niemanden mehr
      windowEnds: r.windowEnds,
      buzzTaken: !!r.buzz,
      isBuzzer,
      canBuzz: r.open && !!own && !r.buzz,
      swapTargets: isBuzzer && !r.swap && !r.evaluated && swapReady(db, r, now)
        ? teamIds(db).filter((id) => id !== teamId && r.answers[id]).map((id) => ({ id, name: teamName(db, id) }))
        : null,
      swapWaiting: isBuzzer && !r.swap && !r.evaluated && !swapReady(db, r, now),
      swapDone: isBuzzer && !!r.swap,
      evaluated: r.evaluated,
      final: finals ? finals[teamId] || null : null,
      swappedWith: r.evaluated && r.swap && (r.swap.by === teamId || r.swap.with === teamId) ? teamName(db, r.swap.by === teamId ? r.swap.with : r.swap.by) : null,
      correct: r.evaluated ? q.correct : null,
    };
  },

  beamerView(db, game, st) {
    if (st.qIndex < 0) return { waiting: true };
    const r = round(st, st.qIndex);
    const q = game.content.questions[st.qIndex];
    const finals = r.evaluated ? finalChoices(r) : null;
    return {
      qIndex: st.qIndex,
      question: q.question,
      options: q.options,
      submittedCount: Object.keys(r.answers).length,
      teamCount: db.project.teams.length,
      buzz: r.buzz ? r.buzz.teamId : null,
      windowEnds: r.windowEnds,
      evaluated: r.evaluated,
      correct: r.evaluated ? q.correct : null,
      swap: r.evaluated ? r.swap : null,
      // Tausch mit Wirkung: Antwort vorher → nachher je beteiligtem Team.
      swapDetail: r.evaluated && r.swap ? [r.swap.by, r.swap.with].map((id) => ({ teamId: id, before: r.answers[id].choice, after: finals[id] })) : null,
      finals: finals ? Object.entries(finals).map(([teamId, choice]) => ({ teamId, choice })) : [],
    };
  },
};
