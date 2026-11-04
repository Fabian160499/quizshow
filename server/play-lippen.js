'use strict';

// Spiel „Es liegt mir auf den Lippen“: Stark vergrößertes Foto (nur der Mund) plus
// Frage. Alle Teams dürfen buzzern; das schnellste Team antwortet mündlich, alle
// anderen Buzzer sind solange gesperrt. Richtig = 1 Punkt (im Editor änderbar),
// falsch = Team für diese Frage gesperrt, Buzzer für die übrigen wieder frei.
// Die Lösung sieht nur die Moderation, bis die Frage beendet ist.

const { fail, log, effect, teamName, teamIds, bookTarget, buzzIn, currentBuzz, buzzTeamView } = require('./core');
const { pv } = require('./scoring');

function round(st, i) {
  if (!st.rounds[i]) st.rounds[i] = { buzzes: [], locked: [], resolved: false, winner: null };
  return st.rounds[i];
}
function current(st) {
  if (st.index < 0) fail('Es läuft gerade keine Aufgabe.');
  return round(st, st.index);
}
const crop = (it) => ({
  zoom: Math.max(1, Math.min(10, Number(it.zoom) || 1)),
  x: Math.max(0, Math.min(100, it.fx === null || it.fx === undefined || it.fx === '' ? 50 : Number(it.fx))),
  y: Math.max(0, Math.min(100, it.fy === null || it.fy === undefined || it.fy === '' ? 50 : Number(it.fy))),
});

module.exports = {
  init: () => ({ index: -1, rounds: {} }),

  team: {
    buzz(db, ctx, game, st) {
      const r = current(st);
      if (currentBuzz(r)) fail('Ein anderes Team antwortet gerade.');
      buzzIn(db, ctx, r);
    },
  },

  mod: {
    open(db, ctx, game, st, p) {
      const i = Number(p.index);
      const it = game.content.items[i];
      if (!it) fail('Aufgabe nicht gefunden.');
      if (!it.image) fail('Für diese Aufgabe ist noch kein Foto hochgeladen.');
      st.index = i;
      round(st, i);
      log(db, ctx, 'ablauf', `Lippen: Aufgabe ${i + 1} offen`);
    },
    judge(db, ctx, game, st, p) {
      const r = current(st);
      const b = currentBuzz(r);
      if (!b) fail('Gerade antwortet kein Team.');
      if (p.correct) {
        b.status = 'correct';
        r.resolved = true;
        r.winner = b.teamId;
        bookTarget(db, ctx, `lippen:${game.id}:${st.index}`, b.teamId, pv(game, 'correct'), `${game.title}, Aufgabe ${st.index + 1}`);
        log(db, ctx, 'bewertung', `Lippen: ${teamName(db, b.teamId)} richtig`);
        effect(db, 'correct');
      } else {
        b.status = 'wrong';
        r.locked.push(b.teamId);
        log(db, ctx, 'bewertung', `Lippen: ${teamName(db, b.teamId)} falsch – für diese Aufgabe gesperrt`);
        effect(db, 'wrong');
        if (teamIds(db).every((id) => r.locked.includes(id))) {
          r.resolved = true;
          log(db, ctx, 'ablauf', `Lippen: Aufgabe ${st.index + 1} – alle Teams falsch`);
        }
      }
    },
    // Frage ohne (weitere) richtige Antwort beenden, Lösung zeigen.
    close(db, ctx, game, st) {
      const r = current(st);
      if (currentBuzz(r)) fail('Erst die Antwort des Teams bewerten.');
      if (r.resolved) fail('Schon beendet.');
      r.resolved = true;
      log(db, ctx, 'ablauf', `Lippen: Aufgabe ${st.index + 1} beendet`);
      effect(db, 'reveal');
    },
  },

  teamView(db, game, st, teamId) {
    if (st.index < 0) return null;
    const r = round(st, st.index);
    const it = game.content.items[st.index];
    const pending = currentBuzz(r);
    return {
      index: st.index,
      count: game.content.items.length,
      image: it.image ? { id: it.image.id, type: it.image.type } : null,
      crop: crop(it),
      question: it.question || '',
      ...buzzTeamView(r, teamId),
      resolved: r.resolved,
      canBuzz: !r.resolved && !pending && !r.locked.includes(teamId) && !r.buzzes.some((b) => b.teamId === teamId && b.status === 'pending'),
      someoneAnswering: !!pending && pending.teamId !== teamId,
      won: r.resolved ? r.winner === teamId : null,
      answer: r.resolved ? it.answer || '' : null,
    };
  },

  beamerView(db, game, st) {
    if (st.index < 0) return { waiting: true };
    const r = round(st, st.index);
    const it = game.content.items[st.index];
    const pending = currentBuzz(r);
    return {
      index: st.index,
      count: game.content.items.length,
      image: it.image ? { id: it.image.id, type: it.image.type } : null,
      crop: crop(it),
      question: it.question || '',
      buzzOrder: r.buzzes.map((b) => ({ teamId: b.teamId, status: b.status })),
      answering: pending ? pending.teamId : null,
      resolved: r.resolved,
      winner: r.winner,
      answer: r.resolved ? it.answer || '' : null,
    };
  },
};
