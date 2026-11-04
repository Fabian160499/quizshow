'use strict';

// Spiel „Wir sind ein Telepa-Team 2.0“: Je Team zwei Personen, ein iPad. Beide
// bekommen dieselbe Aufgabe und schreiben/zeichnen nacheinander mit dem Apple
// Pencil ihre Antwort – Spieler 1 gibt ab, das Feld wird leer, das iPad geht an
// Spieler 2. Keine Antwort wird auf dem iPad wieder angezeigt. Erst wenn beide
// abgegeben haben, sieht die Moderation beide Antworten nebeneinander und
// entscheidet: passt (Punkte der Aufgabe, im Editor je Aufgabe einstellbar) oder
// passt nicht (0). Die Buchung ist pro Team und Aufgabe eindeutig (keine Doppelwertung).

const { fail, log, effect, teamName, teamIds, bookTarget, cleanInk } = require('./core');

function round(st, i) {
  if (!st.rounds[i]) st.rounds[i] = { open: true, answers: {}, judged: {} };
  return st.rounds[i];
}
function current(st) {
  if (st.index < 0) fail('Es läuft gerade keine Aufgabe.');
  return round(st, st.index);
}
const pointsOf = (task) => { const v = Number(task.points); return Number.isFinite(v) ? v : 1; };
const ans = (r, id) => (r.answers[id] ||= { p1: null, p2: null });

module.exports = {
  init: () => ({ index: -1, rounds: {} }),

  team: {
    // Abgabe der aktuellen Person: zuerst Spieler 1, danach Spieler 2.
    submit(db, ctx, game, st, p) {
      const r = current(st);
      if (!r.open) fail('Die Abgabe ist geschlossen.');
      const ink = cleanInk(p.ink);
      if (!ink) fail('Bitte zuerst etwas schreiben oder zeichnen.');
      const a = ans(r, ctx.teamId);
      const who = Number(p.player) === 2 ? 'p2' : 'p1';
      if (who === 'p1' && a.p1) fail('Spieler 1 hat schon abgegeben.');
      if (who === 'p2' && !a.p1) fail('Erst gibt Spieler 1 ab.');
      if (who === 'p2' && a.p2) fail('Spieler 2 hat schon abgegeben.');
      a[who] = ink;
      log(db, ctx, 'antwort', `${teamName(db, ctx.teamId)}: Spieler ${who === 'p1' ? 1 : 2} hat abgegeben`);
    },
  },

  mod: {
    open(db, ctx, game, st, p) {
      const i = Number(p.index);
      if (!game.content.tasks[i]) fail('Aufgabe nicht gefunden.');
      st.index = i;
      round(st, i);
      log(db, ctx, 'ablauf', `Telepa-Team 2.0: Aufgabe ${i + 1} offen`);
    },
    close(db, ctx, game, st) {
      current(st).open = false;
      log(db, ctx, 'ablauf', `Telepa-Team 2.0: Abgabe von Aufgabe ${st.index + 1} geschlossen`);
    },
    // Wertung je Team: { teamId, match: true|false } – nur wenn beide abgegeben haben.
    judge(db, ctx, game, st, p) {
      const r = current(st);
      if (!teamIds(db).includes(p.teamId)) fail('Team nicht gefunden.');
      const a = r.answers[p.teamId];
      if (!a || !a.p1 || !a.p2) fail('Erst wenn beide Spieler abgegeben haben.');
      const pts = p.match ? pointsOf(game.content.tasks[st.index]) : 0;
      r.judged[p.teamId] = !!p.match;
      bookTarget(db, ctx, `telepa2:${game.id}:${st.index}:${p.teamId}`, p.teamId, pts, `${game.title}, Aufgabe ${st.index + 1}`);
      log(db, ctx, 'bewertung', `Telepa-Team 2.0: ${teamName(db, p.teamId)} ${p.match ? `passt (+${pts})` : 'passt nicht (0)'}`);
      effect(db, p.match ? 'correct' : 'wrong');
    },
  },

  teamView(db, game, st, teamId) {
    if (st.index < 0) return null;
    const r = round(st, st.index);
    const task = game.content.tasks[st.index];
    const a = r.answers[teamId] || {};
    const judged = r.judged[teamId];
    return {
      index: st.index,
      count: game.content.tasks.length,
      task: task.task,
      points: pointsOf(task),
      open: r.open,
      // Nie die Antworten selbst – nur, wer schon abgegeben hat.
      p1Done: !!a.p1,
      p2Done: !!a.p2,
      judged: judged === undefined ? null : judged,
    };
  },

  beamerView(db, game, st) {
    if (st.index < 0) return { waiting: true };
    const r = round(st, st.index);
    const task = game.content.tasks[st.index];
    return {
      index: st.index,
      count: game.content.tasks.length,
      task: task.task,
      points: pointsOf(task),
      teams: db.project.teams.map((t) => {
        const a = r.answers[t.id] || {};
        const j = r.judged[t.id];
        // Antworten erst nach der Wertung durch die Moderation.
        return { teamId: t.id, p1: !!a.p1, p2: !!a.p2, judged: j === undefined ? null : j, inks: j === undefined ? null : [a.p1, a.p2] };
      }),
    };
  },
};
