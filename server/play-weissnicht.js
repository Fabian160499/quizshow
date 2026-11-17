'use strict';

// Spiel „Ich weiß nicht, dass du weißt es doch“ (neue Regeln, Fabian 17.11.2026):
// Bild und Frage auf dem Beamer. Alle Teams schreiben ihre Antwort per Hand und geben ab.
// Wer abgegeben hat, darf buzzern – nur der schnellste zählt. Buzzern sperrt nur die
// Buzzer der anderen, nicht deren Abgabe. Das Buzzer-Team wählt auf seinem iPad ein Team,
// das die Antwort seiner Meinung nach NICHT weiß (jedes andere Team, auch wenn es noch
// schreibt). Welches Team gewählt wurde, zeigt der Beamer erst, wenn alle abgegeben haben.
//
// Auflösung per Klick:
//   1. gewähltes Team → 2. seine Antwort → 3. Bewertung der Regie
//      falsch (oder keine Abgabe): Buzzer-Team +1, dann
//        4. Antwort des Buzzer-Teams → 5. Bewertung: richtig nochmal +1 (also bis +2)
//      richtig: gewähltes Team +1, Buzzer-Team 0 – auch bei eigener richtiger Antwort
//   6. alle übrigen Teams gleichzeitig: richtig +1, falsch 0 (ohne Richtig-/Falsch-Ton)
// Ohne Buzzer werden alle Teams gleichzeitig aufgelöst.
// Je Team und Punktart eine eigene Buchung: so bleibt alles eindeutig.

const { fail, log, effect, teamName, teamIds, bookTarget, cleanInk, timerClosed, fxRelease } = require('./core');
const { pv } = require('./scoring');

function round(st, i) {
  if (!st.rounds[i]) st.rounds[i] = { open: false, answers: {}, buzz: null, target: null, closedSubmissions: false, grades: {}, rv: 0, revealed: false };
  return st.rounds[i];
}

function current(st) {
  if (st.index < 0) fail('Es läuft gerade keine Runde.');
  return round(st, st.index);
}

// Alle haben abgegeben – oder die Regie hat die Abgabe geschlossen bzw. der 10-Sekunden-Timer ist abgelaufen.
function allIn(db, r) {
  return r.closedSubmissions || timerClosed(db) || teamIds(db).every((id) => r.answers[id]);
}

// Lag das Buzzer-Team richtig? (gewähltes Team falsch oder ohne Abgabe)
const guessRight = (r) => !r.answers[r.target] || r.grades[r.target] === false;

// Schritte der Auflösung
function stages(r) {
  const list = [];
  if (r.buzz && r.target) {
    list.push('target', 'targetAnswer', 'targetVerdict');
    if (guessRight(r)) list.push('buzzerAnswer', 'buzzerVerdict');
  }
  list.push('rest');
  return list;
}
const stageNow = (r) => (r.rv ? stages(r)[r.rv - 1] : null);
const reached = (r, s) => !!r.rv && stages(r).indexOf(s) >= 0 && stages(r).indexOf(s) < r.rv;

// Teams der gemeinsamen Schlussauflösung: alle außer gewähltem Team, und außer dem Buzzer-Team,
// wenn es richtig lag (dessen Antwort lief vorher einzeln).
function restIds(db, r) {
  return teamIds(db).filter((id) => id !== r.target && !(r.buzz && r.target && id === r.buzz.teamId && guessRight(r)));
}

function points(db, game, r) {
  const P = (k) => pv(game, k);
  const out = {};
  const buzzer = r.buzz && r.target ? r.buzz.teamId : null;
  for (const id of teamIds(db)) out[id] = 0;
  if (buzzer) {
    if (guessRight(r)) {
      out[buzzer] = P('guess') + (r.grades[buzzer] === true ? P('own') : 0);
    } else {
      out[r.target] = P('other');
      out[buzzer] = 0; // falsch eingeschätzt: auch die eigene richtige Antwort zählt nicht
    }
  }
  for (const id of teamIds(db)) {
    if (id === buzzer || id === r.target && buzzer) continue;
    if (r.grades[id] === true) out[id] = P('other');
  }
  return out;
}

function pick(db, ctx, r, teamId) {
  if (!r.buzz) fail('Noch hat niemand gebuzzert.');
  if (r.target) fail('Das Team ist schon gewählt.');
  if (r.rv) fail('Die Auflösung läuft schon.');
  if (teamId === r.buzz.teamId || !teamIds(db).includes(teamId)) fail('Bitte ein anderes Team wählen.');
  r.target = teamId;
  log(db, ctx, 'ablauf', `${teamName(db, r.buzz.teamId)} wählt ${teamName(db, teamId)} (noch geheim)`);
}

module.exports = {
  fxManual: true, // Ergebnisse (Ton, iPad) erst bei der Auflösung
  init: () => ({ index: -1, rounds: {} }),
  stages,
  stageNow,

  team: {
    submit(db, ctx, game, st, p) {
      const r = current(st);
      if (!r.open || r.closedSubmissions || r.rv) fail('Die Abgabe ist geschlossen.');
      if (r.answers[ctx.teamId]) fail('Ihr habt schon abgegeben.');
      const ink = cleanInk(p.ink);
      if (!ink) fail('Bitte zuerst eure Antwort aufschreiben.');
      r.answers[ctx.teamId] = { ink, at: ctx.now };
      log(db, ctx, 'antwort', `${teamName(db, ctx.teamId)} hat abgegeben`);
    },

    buzz(db, ctx, game, st) {
      const r = current(st);
      if (!r.open || r.rv) fail('Die Runde ist nicht offen.');
      if (!r.answers[ctx.teamId]) fail('Erst die eigene Antwort abgeben, dann buzzern.');
      if (r.buzz) fail(`${teamName(db, r.buzz.teamId)} war schneller.`);
      r.buzz = { teamId: ctx.teamId, at: ctx.now };
      log(db, ctx, 'buzzer', `${teamName(db, ctx.teamId)} buzzert als erstes Team`);
      effect(db, 'buzz');
    },

    pick(db, ctx, game, st, p) {
      const r = current(st);
      if (!r.buzz || r.buzz.teamId !== ctx.teamId) fail('Nur das Team, das zuerst gebuzzert hat, wählt.');
      pick(db, ctx, r, p.teamId);
    },
  },

  mod: {
    open(db, ctx, game, st, p) {
      const i = Number(p.index);
      if (!game.content.rounds[i]) fail('Runde nicht gefunden.');
      if (st.index >= 0 && st.index !== i) round(st, st.index).open = false;
      st.index = i;
      const r = round(st, i);
      if (!r.revealed) r.open = true;
      log(db, ctx, 'ablauf', `Runde ${i + 1} offen`);
    },

    // Falls das Buzzer-Team nicht selbst wählen kann (z. B. iPad weg).
    pick(db, ctx, game, st, p) {
      pick(db, ctx, current(st), p.teamId);
    },

    // Abgabe schließen, falls ein Team nicht abgibt.
    closeSubmissions(db, ctx, game, st) {
      const r = current(st);
      r.closedSubmissions = true;
      log(db, ctx, 'ablauf', `Runde ${st.index + 1}: Abgabe geschlossen`);
    },

    // Bewertung je Antwort (geheim, bis zur Auflösung änderbar).
    grade(db, ctx, game, st, p) {
      const r = current(st);
      if (!r.answers[p.teamId]) fail('Dieses Team hat nicht abgegeben.');
      if (r.rv || r.revealed) fail('Die Auflösung läuft schon – Bewertung nicht mehr änderbar.');
      r.grades[p.teamId] = !!p.correct;
    },

    // Auflösung Schritt für Schritt.
    reveal(db, ctx, game, st) {
      const r = current(st);
      if (r.revealed) fail('Diese Runde ist schon aufgelöst.');
      if (!r.rv) {
        if (!allIn(db, r)) fail('Noch haben nicht alle Teams abgegeben.');
        if (r.buzz && !r.target) fail(`${teamName(db, r.buzz.teamId)} hat noch kein Team gewählt.`);
        const missing = Object.keys(r.answers).filter((id) => r.grades[id] === undefined);
        if (missing.length) fail(`Noch nicht bewertet: ${missing.map((id) => teamName(db, id)).join(', ')}`);
        r.open = false;
      }
      r.rv += 1;
      const s = stageNow(r);
      const pts = points(db, game, r);
      const tag = `weissnicht:${game.id}:${st.index}`;
      const label = `${game.title}, Runde ${st.index + 1}`;
      const buzzer = r.buzz ? r.buzz.teamId : null;
      if (s === 'targetVerdict') {
        const right = guessRight(r);
        // Gewähltes Team richtig: +1 für das gewählte Team, Buzzer-Team 0. Sonst +1 fürs Buzzer-Team.
        bookTarget(db, ctx, `${tag}:target:${r.target}`, r.target, right ? 0 : pts[r.target], label);
        bookTarget(db, ctx, `${tag}:guess:${buzzer}`, buzzer, right ? pv(game, 'guess') : 0, `${label}, Wahl`);
        if (!right) bookTarget(db, ctx, `${tag}:own:${buzzer}`, buzzer, 0, `${label}, eigene Antwort`);
        effect(db, right ? 'wrong' : 'correct'); // Ton zur Antwort des gewählten Teams
        fxRelease(db, [r.target, buzzer], undefined, ctx.now);
        log(db, ctx, 'beamer', `Auflösung: ${teamName(db, r.target)} ${right ? 'wusste es nicht' : 'wusste es'}`);
      } else if (s === 'buzzerVerdict') {
        const own = r.grades[buzzer] === true;
        bookTarget(db, ctx, `${tag}:own:${buzzer}`, buzzer, own ? pv(game, 'own') : 0, `${label}, eigene Antwort`);
        effect(db, own ? 'correct' : 'wrong');
        fxRelease(db, [buzzer], own, ctx.now);
        log(db, ctx, 'beamer', `Auflösung: Antwort von ${teamName(db, buzzer)} ${own ? 'richtig' : 'falsch'}`);
      } else if (s === 'rest') {
        const ids = restIds(db, r);
        for (const id of ids) bookTarget(db, ctx, `${tag}:rest:${id}`, id, pts[id] || 0, label);
        r.revealed = true;
        effect(db, 'show'); // alle zugleich: kein Richtig-/Falsch-Ton
        fxRelease(db, ids.filter((id) => r.answers[id]), undefined, ctx.now);
        log(db, ctx, 'ablauf', `Runde ${st.index + 1} aufgelöst`);
      }
    },
  },

  teamView(db, game, st, teamId) {
    if (st.index < 0) return null;
    const r = round(st, st.index);
    const isBuzzer = r.buzz?.teamId === teamId;
    const ready = allIn(db, r);
    const pts = r.rv ? points(db, game, r) : null;
    // Eigenes Ergebnis erst, wenn es auf dem Beamer aufgelöst ist.
    let mine = null;
    if (r.rv) {
      if (r.target === teamId && r.buzz && reached(r, 'targetVerdict')) mine = { correct: r.grades[teamId] ?? null, points: pts[teamId], role: 'target' };
      else if (isBuzzer && r.target && reached(r, 'targetVerdict')) {
        const right = guessRight(r);
        mine = { role: 'buzzer', guessRight: right, correct: right && reached(r, 'buzzerVerdict') ? r.grades[teamId] ?? null : null, points: right ? pv(game, 'guess') + (reached(r, 'buzzerVerdict') && r.grades[teamId] === true ? pv(game, 'own') : 0) : 0 };
      } else if (r.revealed) mine = { correct: r.answers[teamId] ? r.grades[teamId] ?? null : null, points: pts[teamId], role: 'rest' };
    }
    return {
      index: st.index,
      count: game.content.rounds.length,
      question: game.content.rounds[st.index].question,
      open: r.open && !r.closedSubmissions && !r.rv,
      submitted: !!r.answers[teamId],
      canBuzz: r.open && !r.rv && !!r.answers[teamId] && !r.buzz,
      buzzTaken: !!r.buzz,
      buzzer: r.buzz ? r.buzz.teamId : null,
      isBuzzer,
      // Wählen: jedes andere Team, auch wenn es noch schreibt.
      choose: isBuzzer && !r.target && !r.rv ? teamIds(db).filter((id) => id !== teamId) : null,
      pendingTeams: isBuzzer && !r.target ? teamIds(db).filter((id) => id !== teamId && !r.answers[id]) : null,
      myTarget: isBuzzer ? r.target : null,
      // Für alle anderen erst sichtbar, wenn alle abgegeben haben.
      target: ready || r.rv ? r.target : null,
      isTarget: (ready || !!r.rv) && r.target === teamId,
      revealing: !!r.rv && !r.revealed,
      revealed: r.revealed,
      mine,
      solution: r.revealed ? game.content.rounds[st.index].solution : null,
    };
  },

  beamerView(db, game, st) {
    if (st.index < 0) return { waiting: true };
    const r = round(st, st.index);
    const item = game.content.rounds[st.index];
    const ready = allIn(db, r);
    const pts = r.rv ? points(db, game, r) : null;
    const buzzer = r.buzz ? r.buzz.teamId : null;
    const focus = r.rv && r.target && buzzer ? {
      target: r.target,
      buzzer,
      targetShown: reached(r, 'targetAnswer'),
      targetInk: reached(r, 'targetAnswer') ? r.answers[r.target]?.ink || null : null,
      targetCorrect: reached(r, 'targetVerdict') ? (r.answers[r.target] ? r.grades[r.target] : null) : undefined,
      guessRight: reached(r, 'targetVerdict') ? guessRight(r) : null,
      buzzerInk: reached(r, 'buzzerAnswer') ? r.answers[buzzer]?.ink || null : null,
      buzzerCorrect: reached(r, 'buzzerVerdict') ? r.grades[buzzer] ?? null : undefined,
      buzzerPoints: reached(r, 'targetVerdict') ? pts[buzzer] - (reached(r, 'buzzerVerdict') ? 0 : guessRight(r) && r.grades[buzzer] === true ? pv(game, 'own') : 0) : null,
      targetPoints: reached(r, 'targetVerdict') ? pts[r.target] : null,
    } : null;
    return {
      index: st.index,
      image: item.image ? { id: item.image.id, type: item.image.type } : null,
      question: item.question,
      submittedCount: Object.keys(r.answers).length,
      teamCount: db.project.teams.length,
      buzzer,
      choosing: !!buzzer && !r.target,
      // Gewähltes Team erst, wenn alle abgegeben haben.
      target: ready || r.rv ? r.target : null,
      stage: stageNow(r),
      focus,
      // Schluss: alle übrigen Teams zugleich (Buzzer-Team dabei, wenn es falsch gewählt hat – mit 0).
      rest: r.revealed ? restIds(db, r).filter((id) => r.answers[id]).map((id) => ({ teamId: id, ink: r.answers[id].ink, correct: r.grades[id] ?? null, points: pts[id] || 0, lost: id === buzzer && !!r.target })) : null,
      missing: r.revealed ? restIds(db, r).filter((id) => !r.answers[id]) : null,
      revealed: r.revealed,
      solution: r.revealed ? item.solution : null,
    };
  },
};
