'use strict';

// Spiel „Ich weiß nicht, dass du weißt es doch 2.0“: Alle Teams schreiben ihre
// Antwort. Wer abgegeben hat, darf buzzern – nur der erste Buzzer zählt und
// sperrt nur die Buzzer der anderen, nicht deren Abgabe. Das Buzzer-Team kann
// sofort einschätzen, welche Teams richtig liegen (mindestens ein Team) – auch
// Teams, die noch schreiben; deren Antwort folgt. Jede richtige Einschätzung +1, aber eine falsche macht
// alle Punkte des Buzzer-Teams zunichte – auch den für die eigene richtige
// Antwort. Alle anderen Teams bekommen für ihre richtige Antwort +1.

const { fail, log, effect, teamName, teamIds, bookTarget, cleanInk, timerClosed } = require('./core');
const { pv } = require('./scoring');

function round(st, i) {
  if (!st.rounds[i]) st.rounds[i] = { open: false, answers: {}, buzz: null, guesses: null, grades: {}, closedSubmissions: false, evaluated: false };
  return st.rounds[i];
}

function current(st) {
  if (st.index < 0) fail('Es läuft gerade keine Runde.');
  return round(st, st.index);
}

// Einschätzen ist erst möglich, wenn alle Teams abgegeben haben (oder die Moderation die Abgabe schließt).
function allIn(db, r) {
  // Nach Ablauf des 10-Sekunden-Timers gilt die Abgabe als geschlossen.
  return r.closedSubmissions || timerClosed(db) || teamIds(db).every((id) => r.answers[id]);
}

// Alle Teams außer dem Buzzer-Team, die richtig geantwortet haben (+1 je Team).
function othersCorrect(r) {
  return Object.keys(r.answers).filter((id) => id !== r.buzz?.teamId && r.grades[id] === true);
}

function score(db, r, game = null) {
  const P = (k) => (game ? pv(game, k) : 1);
  if (!r.buzz) return { buzzer: null, guessPoints: 0, ownPoint: 0, allRight: null };
  // (Punkte der übrigen Teams: siehe othersCorrect)
  const g = r.guesses || {};
  // Nur Teams mit Antwort zählen (wer nie abgibt, fällt aus der Einschätzung heraus).
  const ids = Object.keys(g).filter((id) => r.answers[id]);
  const allRight = ids.length > 0 && ids.every((id) => r.grades[id] === g[id]);
  return {
    buzzer: r.buzz.teamId,
    guessPoints: allRight ? ids.length * P('guess') : 0,
    // Eine falsche Einschätzung kostet auch den Punkt für die eigene Antwort.
    ownPoint: allRight && r.grades[r.buzz.teamId] === true ? P('own') : 0,
    allRight,
  };
}

module.exports = {
  init: () => ({ index: -1, rounds: {} }),
  score,

  team: {
    submit(db, ctx, game, st, p) {
      const r = current(st);
      if (!r.open || r.closedSubmissions) fail('Die Abgabe ist geschlossen.');
      if (r.answers[ctx.teamId]) fail('Ihr habt schon abgegeben.');
      const ink = cleanInk(p.ink);
      if (!ink) fail('Bitte zuerst eure Antwort aufschreiben.');
      r.answers[ctx.teamId] = { ink, at: ctx.now };
      log(db, ctx, 'antwort', `${teamName(db, ctx.teamId)} hat abgegeben`);
    },

    buzz(db, ctx, game, st) {
      const r = current(st);
      if (!r.open) fail('Die Runde ist nicht offen.');
      if (!r.answers[ctx.teamId]) fail('Erst die eigene Antwort abgeben, dann buzzern.');
      if (r.buzz) fail(`${teamName(db, r.buzz.teamId)} war schneller.`);
      r.buzz = { teamId: ctx.teamId, at: ctx.now };
      log(db, ctx, 'buzzer', `${teamName(db, ctx.teamId)} buzzert als erstes Team`);
      effect(db, 'buzz');
    },

    // Einschätzung des Buzzer-Teams: { guesses: { teamId: true|false } }
    guess(db, ctx, game, st, p) {
      const r = current(st);
      if (!r.buzz || r.buzz.teamId !== ctx.teamId) fail('Nur das schnellste Team schätzt ein.');
      if (r.guesses) fail('Eure Einschätzung ist schon abgegeben.');
      const src = p.guesses && typeof p.guesses === 'object' ? p.guesses : {};
      const out = {};
      for (const [id, v] of Object.entries(src)) {
        if (id === ctx.teamId || !teamIds(db).includes(id) || typeof v !== 'boolean') continue;
        out[id] = v;
      }
      if (!Object.keys(out).length) fail('Bitte mindestens ein Team einschätzen.');
      r.guesses = out;
      log(db, ctx, 'einschätzung', `${teamName(db, ctx.teamId)} hat ${Object.keys(out).length} Team(s) eingeschätzt`);
    },
  },

  mod: {
    open(db, ctx, game, st, p) {
      const i = Number(p.index);
      if (!game.content.rounds[i]) fail('Runde nicht gefunden.');
      if (st.index >= 0 && st.index !== i) round(st, st.index).open = false;
      st.index = i;
      const r = round(st, i);
      if (!r.evaluated) r.open = true;
      log(db, ctx, 'ablauf', `Runde ${i + 1} offen`);
    },

    // Abgabe schließen, falls ein Team nicht abgibt – dann darf eingeschätzt werden.
    closeSubmissions(db, ctx, game, st) {
      const r = current(st);
      r.closedSubmissions = true;
      log(db, ctx, 'ablauf', `Runde ${st.index + 1}: Abgabe geschlossen`);
    },

    grade(db, ctx, game, st, p) {
      const r = current(st);
      if (!r.answers[p.teamId]) fail('Dieses Team hat nicht abgegeben.');
      if (r.evaluated) fail('Die Runde ist schon ausgewertet.');
      r.grades[p.teamId] = !!p.correct;
    },

    evaluate(db, ctx, game, st) {
      const r = current(st);
      if (r.evaluated) fail('Schon ausgewertet.');
      if (!allIn(db, r)) fail('Noch haben nicht alle Teams abgegeben.');
      const missing = Object.keys(r.answers).filter((id) => r.grades[id] === undefined);
      if (missing.length) fail(`Noch nicht bewertet: ${missing.map((id) => teamName(db, id)).join(', ')}`);
      if (r.buzz && !r.guesses) fail('Das Buzzer-Team hat noch nicht eingeschätzt.');
      r.evaluated = true;
      r.open = false;
      const s = score(db, r, game);
      if (s.buzzer) {
        bookTarget(db, ctx, `weissnicht2:${game.id}:${st.index}:guess`, s.buzzer, s.guessPoints, `${game.title}, Runde ${st.index + 1}, Einschätzung`);
        bookTarget(db, ctx, `weissnicht2:${game.id}:${st.index}:own`, s.buzzer, s.ownPoint, `${game.title}, Runde ${st.index + 1}, eigene Antwort`);
      }
      for (const id of othersCorrect(r)) {
        bookTarget(db, ctx, `weissnicht2:${game.id}:${st.index}:own:${id}`, id, pv(game, 'other'), `${game.title}, Runde ${st.index + 1}, richtige Antwort`);
      }
      log(db, ctx, 'ablauf', `Runde ${st.index + 1} ausgewertet${s.buzzer ? ` – ${teamName(db, s.buzzer)}: ${s.guessPoints + s.ownPoint} Punkte` : ''}`);
      effect(db, 'show'); // alle zugleich aufgelöst: kein Richtig-/Falsch-Ton
    },
  },

  teamView(db, game, st, teamId) {
    if (st.index < 0) return null;
    const r = round(st, st.index);
    const isBuzzer = r.buzz?.teamId === teamId;
    const ready = allIn(db, r);
    const s = r.evaluated ? score(db, r, game) : null;
    return {
      index: st.index,
      count: game.content.rounds.length,
      question: game.content.rounds[st.index].question,
      open: r.open && !r.closedSubmissions,
      submitted: !!r.answers[teamId],
      canBuzz: r.open && !!r.answers[teamId] && !r.buzz,
      buzzTaken: !!r.buzz,
      isBuzzer,
      // Einschätzen: sofort nach dem Buzzer, für jedes Team, das schon abgegeben hat.
      // Antworten der anderen bleiben geheim.
      guessTeams: isBuzzer && !r.guesses ? teamIds(db).filter((id) => id !== teamId) : null,
      pendingTeams: isBuzzer && !r.guesses ? teamIds(db).filter((id) => id !== teamId && !r.answers[id]) : null,
      stillWriting: isBuzzer && !ready ? teamIds(db).filter((id) => !r.answers[id]).length : 0,
      guessed: isBuzzer && !!r.guesses,
      evaluated: r.evaluated,
      ownCorrect: r.evaluated ? r.grades[teamId] ?? null : null,
      ownPoints: r.evaluated && !isBuzzer && r.grades[teamId] === true ? pv(game, 'other') : 0,
      result: s && isBuzzer ? s : null,
      solution: r.evaluated ? game.content.rounds[st.index].solution : null,
    };
  },

  beamerView(db, game, st) {
    if (st.index < 0) return { waiting: true };
    const r = round(st, st.index);
    const item = game.content.rounds[st.index];
    const s = r.evaluated ? score(db, r, game) : null;
    return {
      index: st.index,
      image: item.image ? { id: item.image.id, type: item.image.type } : null,
      question: item.question,
      submittedCount: Object.keys(r.answers).length,
      teamCount: db.project.teams.length,
      buzzer: r.buzz ? r.buzz.teamId : null,
      guessing: !!r.buzz && !r.guesses,
      evaluated: r.evaluated,
      // Erst nach der Auswertung: Antworten, Bewertungen und Einschätzungen.
      answers: r.evaluated ? Object.entries(r.answers).map(([teamId, a]) => ({ teamId, ink: a.ink, correct: r.grades[teamId] ?? null, guess: r.guesses && teamId !== r.buzz?.teamId ? r.guesses[teamId] ?? null : null })) : [],
      score: s,
      solution: r.evaluated ? item.solution : null,
    };
  },
};
