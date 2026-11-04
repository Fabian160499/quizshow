'use strict';

// Spiel „Jeopardy“: 5 Kategorien × 3 Fragen (1, 2, 3 Punkte). Zu Beginn wird ein
// Team ausgelost; es wählt auf seinem iPad Kategorie und Stufe. Alle Teams dürfen
// buzzern; das schnellste antwortet mündlich, die anderen sind solange gesperrt.
// Richtig = Punkte der Frage, dieses Team wählt als Nächstes. Falsch = Team für
// diese Frage gesperrt, die übrigen dürfen wieder buzzern. Niemand richtig (alle
// falsch, kein Buzzer oder Moderation beendet) = neues Team wird ausgelost.
// Gespielte Felder sind gesperrt.

const core = require('./core');
const { fail, log, effect, teamName, teamIds, bookTarget, buzzIn, currentBuzz, buzzTeamView } = core;
const { pv } = require('./scoring');

const randomInt = (n) => core.randomInt(n);
const LEVELS = [1, 2, 3];
const key = (c, l) => `${c}-${l}`;
const qOf = (game, c, l) => { const cat = game.content.categories[c] || {}; return { q: cat[`q${l}`] || '', a: cat[`a${l}`] || '' }; };

function drawPicker(db, st) {
  const ids = teamIds(db);
  st.picker = ids.length ? ids[randomInt(ids.length)] : null;
  st.pickerDrawn = true;
}
function finish(db, ctx, game, st, winner) {
  const q = st.q;
  q.resolved = true;
  q.winner = winner;
  st.played[key(q.c, q.l)] = { winner };
  if (winner) st.picker = winner;
  else drawPicker(db, st);
  if (Object.keys(st.played).length >= game.content.categories.length * LEVELS.length) st.done = true;
}

module.exports = {
  init: () => ({ started: false, picker: null, pickerDrawn: false, played: {}, q: null, done: false }),

  team: {
    // Feld wählen: { c: 0–4, l: 1–3 } – nur das Team, das gerade wählen darf.
    pick(db, ctx, game, st, p) {
      if (!st.started) fail('Das Spiel hat noch nicht begonnen.');
      if (st.picker !== ctx.teamId) fail('Ein anderes Team wählt gerade.');
      return module.exports.mod.pickFor(db, ctx, game, st, p);
    },
    buzz(db, ctx, game, st) {
      if (!st.q || st.q.resolved) fail('Gerade ist keine Frage offen.');
      if (currentBuzz(st.q)) fail('Ein anderes Team antwortet gerade.');
      buzzIn(db, ctx, st.q);
    },
  },

  mod: {
    start(db, ctx, game, st) {
      if (st.started) fail('Das Spiel läuft schon.');
      st.started = true;
      drawPicker(db, st);
      log(db, ctx, 'ablauf', `Jeopardy: ausgelost – ${teamName(db, st.picker)} wählt`);
      effect(db, 'reveal');
    },
    // Feld auswählen (Moderation für das Team oder das Team selbst).
    pickFor(db, ctx, game, st, p) {
      if (!st.started) fail('Erst das Spiel starten.');
      if (st.q && !st.q.resolved) fail('Erst die aktuelle Frage beenden.');
      const c = Number(p.c), l = Number(p.l);
      if (!game.content.categories[c] || !LEVELS.includes(l)) fail('Dieses Feld gibt es nicht.');
      if (st.played[key(c, l)]) fail('Diese Frage wurde schon gespielt.');
      st.q = { c, l, by: st.picker, buzzes: [], locked: [], resolved: false, winner: null };
      log(db, ctx, 'ablauf', `Jeopardy: ${teamName(db, st.picker)} wählt „${game.content.categories[c].name}“ für ${pv(game, `level${l}`)}`);
      effect(db, 'title');
    },
    judge(db, ctx, game, st, p) {
      const q = st.q;
      const b = q && !q.resolved ? currentBuzz(q) : null;
      if (!b) fail('Gerade antwortet kein Team.');
      if (p.correct) {
        b.status = 'correct';
        const pts = pv(game, `level${q.l}`);
        bookTarget(db, ctx, `jeopardy:${game.id}:${key(q.c, q.l)}`, b.teamId, pts, `${game.title}, ${game.content.categories[q.c].name} (${pts})`);
        log(db, ctx, 'bewertung', `Jeopardy: ${teamName(db, b.teamId)} richtig (+${pts}) – wählt als Nächstes`);
        effect(db, 'correct');
        finish(db, ctx, game, st, b.teamId);
      } else {
        b.status = 'wrong';
        q.locked.push(b.teamId);
        log(db, ctx, 'bewertung', `Jeopardy: ${teamName(db, b.teamId)} falsch – für diese Frage gesperrt`);
        effect(db, 'wrong');
        if (teamIds(db).every((id) => q.locked.includes(id))) {
          finish(db, ctx, game, st, null);
          log(db, ctx, 'ablauf', `Jeopardy: alle falsch – ausgelost: ${teamName(db, st.picker)} wählt`);
        }
      }
    },
    // Niemand buzzert bzw. niemand weiß es: Frage beenden, neues Team auslosen.
    close(db, ctx, game, st) {
      const q = st.q;
      if (!q || q.resolved) fail('Gerade ist keine Frage offen.');
      if (currentBuzz(q)) fail('Erst die Antwort des Teams bewerten.');
      finish(db, ctx, game, st, null);
      log(db, ctx, 'ablauf', `Jeopardy: Frage beendet ohne richtige Antwort – ausgelost: ${teamName(db, st.picker)} wählt`);
      effect(db, 'reveal');
    },
  },

  teamView(db, game, st, teamId) {
    if (!st.started) return { waiting: true };
    const q = st.q;
    const pending = q && !q.resolved ? currentBuzz(q) : null;
    return {
      board: game.content.categories.map((cat, c) => ({ name: cat.name, cells: LEVELS.map((l) => ({ l, points: pv(game, `level${l}`), played: !!st.played[key(c, l)] })) })),
      picker: st.picker,
      myPick: st.picker === teamId && (!q || q.resolved) && !st.done,
      question: q ? { c: q.c, l: q.l, cat: game.content.categories[q.c].name, points: pv(game, `level${q.l}`), text: qOf(game, q.c, q.l).q, resolved: q.resolved, answer: q.resolved ? qOf(game, q.c, q.l).a : null, won: q.resolved ? q.winner === teamId : null } : null,
      ...(q ? buzzTeamView(q, teamId) : {}),
      canBuzz: !!q && !q.resolved && !pending && !q.locked.includes(teamId) && !q.buzzes.some((b) => b.teamId === teamId && b.status === 'pending'),
      someoneAnswering: !!pending && pending.teamId !== teamId,
      done: st.done,
    };
  },

  beamerView(db, game, st) {
    if (!st.started) return { waiting: true };
    const q = st.q;
    const pending = q && !q.resolved ? currentBuzz(q) : null;
    return {
      board: game.content.categories.map((cat, c) => ({ name: cat.name, cells: LEVELS.map((l) => ({ l, points: pv(game, `level${l}`), played: !!st.played[key(c, l)], winner: st.played[key(c, l)] ? st.played[key(c, l)].winner : null })) })),
      picker: st.picker,
      // Offene Frage groß; nach dem Ende mit Lösung, bis das nächste Feld gewählt wird.
      question: q ? { c: q.c, l: q.l, cat: game.content.categories[q.c].name, points: pv(game, `level${q.l}`), text: qOf(game, q.c, q.l).q, resolved: q.resolved, winner: q.winner, answer: q.resolved ? qOf(game, q.c, q.l).a : null } : null,
      buzzOrder: q ? q.buzzes.map((b) => ({ teamId: b.teamId, status: b.status })) : [],
      answering: pending ? pending.teamId : null,
      done: st.done,
    };
  },
};
