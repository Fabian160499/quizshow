'use strict';

// Spiel „Hits me baby, one more time“ (früher „Keine Kon-Sequenz“): Ein Lied wird in Stufen angespielt (0,5 s, 1 s,
// 3 s, 5 s, 10 s). Teams schreiben den Titel und schicken ihn per Buzzer ab –
// das sperrt keine anderen Teams. Gewertet wird die Stufe, die beim Abschicken
// lief. Die Punkte je Stufe sind ein Vorschlag aus dem Editor und werden erst
// vergeben, wenn die Moderation die Staffelung bestätigt.

const { fail, log, effect, teamName, bookTarget, cleanInk } = require('./core');

const STAGES = [0.5, 1, 3, 5, 10];
const DEFAULT_POINTS = [5, 4, 3, 2, 1];

// „5, 4, 3, 2, 1“ aus dem Editor; Unlesbares fällt auf den Vorschlag zurück.
function pointsFrom(content) {
  const nums = String(content.points || '').split(/[,;\s/]+/).filter(Boolean).map(Number);
  return STAGES.map((_, i) => (Number.isFinite(nums[i]) && nums[i] >= 0 && nums[i] <= 20 ? Math.round(nums[i]) : DEFAULT_POINTS[i]));
}

function round(st, i) {
  if (!st.rounds[i]) st.rounds[i] = { stage: -1, seq: 0, answers: {}, grades: {}, closed: false, awarded: false };
  return st.rounds[i];
}

function current(st) {
  if (st.index < 0) fail('Es läuft gerade kein Lied.');
  return round(st, st.index);
}

module.exports = {
  STAGES,
  pointsFrom,
  init: () => ({ index: -1, rounds: {} }),

  team: {
    submit(db, ctx, game, st, p) {
      const r = current(st);
      if (r.stage < 0) fail('Das Lied wurde noch nicht angespielt.');
      if (r.closed) fail('Die Abgabe für dieses Lied ist geschlossen.');
      if (r.answers[ctx.teamId]) fail('Ihr habt für dieses Lied schon abgeschickt.');
      const ink = cleanInk(p.ink);
      if (!ink) fail('Bitte zuerst den Titel aufschreiben.');
      r.answers[ctx.teamId] = { ink, at: ctx.now, stage: r.stage };
      log(db, ctx, 'buzzer', `${teamName(db, ctx.teamId)} schickt bei Stufe ${STAGES[r.stage]} s ab`);
      effect(db, 'buzz');
    },
  },

  mod: {
    open(db, ctx, game, st, p) {
      const i = Number(p.index);
      if (!game.content.songs[i]) fail('Lied nicht gefunden.');
      st.index = i;
      round(st, i);
      log(db, ctx, 'ablauf', `Lied ${i + 1} vorbereitet`);
    },

    // Nächste Stufe anspielen. Ab jetzt gilt für neue Abgaben diese Stufe.
    next(db, ctx, game, st) {
      const r = current(st);
      if (!game.content.songs[st.index].audio) fail('Für dieses Lied ist noch keine Datei hochgeladen.');
      if (r.closed) fail('Die Abgabe ist geschlossen.');
      if (r.stage >= STAGES.length - 1) fail('Das war schon die letzte Stufe.');
      r.stage += 1;
      r.seq += 1;
      log(db, ctx, 'ablauf', `Lied ${st.index + 1}: Stufe ${STAGES[r.stage]} s`);
    },

    // Aktuelle Stufe noch einmal abspielen (ändert die Stufe nicht).
    replay(db, ctx, game, st) {
      const r = current(st);
      if (r.stage < 0) fail('Noch keine Stufe gespielt.');
      r.seq += 1;
    },

    close(db, ctx, game, st) {
      const r = current(st);
      r.closed = true;
      log(db, ctx, 'ablauf', `Lied ${st.index + 1}: Abgabe geschlossen`);
    },

    grade(db, ctx, game, st, p) {
      const r = current(st);
      if (!r.answers[p.teamId]) fail('Dieses Team hat nicht abgeschickt.');
      r.grades[p.teamId] = !!p.correct;
      if (r.awarded) award(db, ctx, game, st, r);
    },

    // Punkte nach der (bestätigten) Staffelung vergeben.
    award(db, ctx, game, st) {
      const r = current(st);
      const missing = Object.keys(r.answers).filter((id) => r.grades[id] === undefined);
      if (missing.length) fail(`Noch nicht bewertet: ${missing.map((id) => teamName(db, id)).join(', ')}`);
      r.closed = true;
      r.awarded = true;
      award(db, ctx, game, st, r);
      effect(db, 'show'); // alle zugleich aufgelöst: kein Richtig-/Falsch-Ton
    },
  },

  teamView(db, game, st, teamId) {
    if (st.index < 0) return null;
    const r = round(st, st.index);
    const own = r.answers[teamId];
    const pts = pointsFrom(game.content);
    return {
      index: st.index,
      count: game.content.songs.length,
      stage: r.stage,
      stages: STAGES,
      points: pts,
      canSubmit: r.stage >= 0 && !r.closed && !own,
      submitted: own ? { stage: own.stage } : null,
      closed: r.closed,
      awarded: r.awarded,
      correct: r.awarded && own ? r.grades[teamId] === true : null,
      gained: r.awarded && own && r.grades[teamId] ? pts[own.stage] : null,
      title: r.awarded ? game.content.songs[st.index].title : null,
    };
  },

  beamerView(db, game, st) {
    if (st.index < 0) return { waiting: true };
    const r = round(st, st.index);
    const song = game.content.songs[st.index];
    const pts = pointsFrom(game.content);
    return {
      index: st.index,
      audio: song.audio ? { id: song.audio.id, type: song.audio.type } : null,
      start: Number(song.start) || 0,
      stage: r.stage,
      seq: r.seq,
      stages: STAGES,
      points: pts,
      // Wer bei welcher Stufe abgeschickt hat ist öffentlich, die Antwort selbst nicht.
      submissions: Object.entries(r.answers).sort((a, b) => a[1].at - b[1].at).map(([teamId, a]) => ({ teamId, stage: a.stage })),
      awarded: r.awarded,
      results: r.awarded ? Object.entries(r.answers).map(([teamId, a]) => ({ teamId, stage: a.stage, correct: r.grades[teamId] === true, points: r.grades[teamId] ? pts[a.stage] : 0 })) : [],
      title: r.awarded ? song.title : null,
    };
  },
};

function award(db, ctx, game, st, r) {
  const pts = pointsFrom(game.content);
  for (const [teamId, a] of Object.entries(r.answers)) {
    bookTarget(db, ctx, `konsequenz:${game.id}:${st.index}:${teamId}`, teamId, r.grades[teamId] ? pts[a.stage] : 0, `${game.title}, Lied ${st.index + 1} (Stufe ${STAGES[a.stage]} s)`);
  }
  log(db, ctx, 'punkte', `Lied ${st.index + 1}: Punkte nach Staffelung ${pts.join('-')} vergeben`);
}
