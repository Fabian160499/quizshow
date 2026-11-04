'use strict';

// Spiel „Die leichten 5“: Freitext-Antworten, Moderation bewertet, 1 Punkt pro richtiger Antwort.
// Ablauf der Auflösung: Die Moderation bewertet jede Abgabe sofort (nur in der Regie
// sichtbar). Alle Antworten erscheinen groß nebeneinander ohne Wertung. Per Knopf
// wird aufgelöst: zuerst alle falschen, dann ein richtiges, dann alle übrigen richtigen.

const { fail, log, effect, teamName, bookTarget, cleanText, cleanInk } = require('./core');
const { pv } = require('./scoring');

function round(st, qIndex) {
  if (!st.rounds[qIndex]) st.rounds[qIndex] = { open: false, solutionRevealed: false, answers: {} };
  return st.rounds[qIndex];
}

module.exports = {
  init: () => ({ qIndex: -1, rounds: {} }),

  team: {
    submit(db, ctx, game, st, p) {
      const r = round(st, st.qIndex);
      if (!r.open) fail('Die Frage ist nicht freigegeben.');
      if (r.answers[ctx.teamId]) fail('Eure Antwort ist bereits abgegeben und gesperrt.');
      // Antwort handschriftlich (Apple Pencil) oder als Text.
      const ink = cleanInk(p.ink);
      const text = ink ? '' : cleanText(p.text ?? '', 200);
      if (!ink && !text) fail('Bitte zuerst eure Antwort aufschreiben.');
      r.answers[ctx.teamId] = { text, ink, at: ctx.now, grade: null, onBeamer: false, revealed: false };
      log(db, ctx, 'antwort', `${teamName(db, ctx.teamId)} hat Frage ${st.qIndex + 1} abgegeben`);
    },
  },

  mod: {
    open(db, ctx, game, st, p) {
      const qIndex = Number(p.qIndex);
      if (!game.content.questions[qIndex]) fail('Frage nicht gefunden.');
      if (st.qIndex >= 0 && st.qIndex !== qIndex) round(st, st.qIndex).open = false;
      st.qIndex = qIndex;
      const r = round(st, qIndex);
      if (!r.solutionRevealed) r.open = true;
      r.wasOpened = true;
      log(db, ctx, 'ablauf', `Frage ${qIndex + 1} freigegeben`);
    },
    showAnswer(db, ctx, game, st, p) {
      const ans = round(st, st.qIndex).answers[p.teamId];
      if (!ans) fail('Dieses Team hat noch nicht abgegeben.');
      ans.onBeamer = !!p.visible;
      log(db, ctx, 'beamer', `Antwort von ${teamName(db, p.teamId)} ${ans.onBeamer ? 'gezeigt' : 'ausgeblendet'}`);
    },
    // Alle abgegebenen Antworten auf einmal groß nebeneinander zeigen (oder alle ausblenden).
    showAll(db, ctx, game, st, p) {
      const r = round(st, st.qIndex);
      const list = Object.values(r.answers);
      if (!list.length) fail('Noch hat kein Team abgegeben.');
      for (const a of list) a.onBeamer = p.visible !== false;
      log(db, ctx, 'beamer', `Alle Antworten ${p.visible !== false ? 'gezeigt' : 'ausgeblendet'}`);
    },
    grade(db, ctx, game, st, p) {
      const ans = round(st, st.qIndex).answers[p.teamId];
      if (!ans) fail('Dieses Team hat noch nicht abgegeben.');
      const correct = !!p.correct;
      const changed = ans.grade !== null && ans.grade !== correct;
      ans.grade = correct;
      bookTarget(db, ctx, `leichte5:${game.id}:${st.qIndex}:${p.teamId}`, p.teamId, correct ? pv(game, 'correct') : 0,
        `${game.title}, Frage ${st.qIndex + 1}${changed ? ', Bewertung korrigiert' : ''}`);
      log(db, ctx, 'bewertung', `${teamName(db, p.teamId)} Frage ${st.qIndex + 1}: ${correct ? 'richtig' : 'falsch'}`);
      // Wertung bleibt verdeckt, bis sie aufgelöst wird; nur eine spätere Korrektur ist sofort sichtbar.
      if (ans.onBeamer && ans.revealed) effect(db, correct ? 'correct' : 'wrong');
    },
    // Auflösen Schritt für Schritt: 1) alle falschen, 2) ein richtiges, 3) alle übrigen richtigen.
    revealNext(db, ctx, game, st) {
      const r = round(st, st.qIndex);
      const order = db.project.teams.map((t) => [t.id, r.answers[t.id]]).filter(([, a]) => a);
      if (!order.length) fail('Noch hat kein Team abgegeben.');
      const ungraded = order.filter(([, a]) => a.grade === null).length;
      if (ungraded) fail(`Erst alle abgegebenen Antworten bewerten (${ungraded} offen).`);
      r.open = false;
      for (const [, a] of order) a.onBeamer = true;
      const wrong = order.filter(([, a]) => a.grade === false && !a.revealed);
      const right = order.filter(([, a]) => a.grade === true && !a.revealed);
      const rightShown = order.some(([, a]) => a.grade === true && a.revealed);
      let step;
      if (wrong.length) { step = wrong; effect(db, 'wrong'); }
      else if (right.length && !rightShown) { step = right.slice(0, 1); effect(db, 'correct'); }
      else if (right.length) { step = right; effect(db, 'correct'); }
      else fail('Alles ist schon aufgelöst.');
      for (const [, a] of step) a.revealed = true;
      log(db, ctx, 'beamer', `Auflösung: ${step.map(([id]) => teamName(db, id)).join(', ')} ${step[0][1].grade ? 'richtig' : 'falsch'}`);
    },
    revealSolution(db, ctx, game, st) {
      const r = round(st, st.qIndex);
      const ungraded = Object.values(r.answers).filter((a) => a.grade === null).length;
      if (ungraded > 0) fail(`Erst alle abgegebenen Antworten bewerten (${ungraded} offen).`);
      r.open = false;
      r.solutionRevealed = true;
      for (const a of Object.values(r.answers)) a.revealed = true;
      log(db, ctx, 'ablauf', `Lösung zu Frage ${st.qIndex + 1} gezeigt, Abgabe geschlossen`);
    },
  },

  teamView(db, game, st, teamId) {
    if (st.qIndex < 0) return null;
    const r = round(st, st.qIndex);
    const own = r.answers[teamId];
    return {
      qIndex: st.qIndex,
      count: game.content.questions.length,
      question: r.open || r.solutionRevealed || r.wasOpened ? game.content.questions[st.qIndex].question : null,
      image: (r.open || r.solutionRevealed || r.wasOpened) && game.content.questions[st.qIndex].image ? { id: game.content.questions[st.qIndex].image.id, type: game.content.questions[st.qIndex].image.type } : null,
      open: r.open,
      // Die Wertung sieht das Team erst, wenn sie auf dem Beamer aufgelöst ist.
      answer: own ? { text: own.text, ink: own.ink || null, grade: own.revealed ? own.grade : null } : null,
    };
  },

  beamerView(db, game, st) {
    if (st.qIndex < 0) return { waiting: true };
    const r = round(st, st.qIndex);
    // Frage bleibt sichtbar, auch wenn die Abgabe zum Auflösen geschlossen wurde.
    const visible = r.open || r.solutionRevealed || r.wasOpened || Object.keys(r.answers).length > 0;
    return {
      qIndex: st.qIndex,
      question: visible ? game.content.questions[st.qIndex].question : null,
      image: visible && game.content.questions[st.qIndex].image ? { id: game.content.questions[st.qIndex].image.id, type: game.content.questions[st.qIndex].image.type } : null,
      submittedCount: Object.keys(r.answers).length,
      teamCount: db.project.teams.length,
      // In Team-Reihenfolge, damit jedes Team seinen festen Platz nebeneinander hat.
      answers: db.project.teams.map((t) => [t.id, r.answers[t.id]]).filter(([, a]) => a && a.onBeamer).map(([teamId, a]) => ({ teamId, text: a.text, ink: a.ink || null, grade: a.revealed ? a.grade : null })),
      solution: r.solutionRevealed ? game.content.questions[st.qIndex].solution : null,
    };
  },
};
