'use strict';

// Spiel „Song Song Song“: Mash-up aus Melodie des einen und Text des anderen
// Songs. Jedes Team schreibt beide Titel; der Buzzer schickt die Antwort sofort
// verbindlich ab und sperrt KEINE anderen Teams. Die Moderation prüft in der Regie
// (nur dort sichtbar) in Buzzer-Reihenfolge: das erste Team mit beiden Titeln
// richtig bekommt 1 Punkt. Das Mash-up läuft dabei immer weiter.
//
// Auflösung per Klick, wie bei den leichten 5: in Abgabe-Reihenfolge je Team
// erst der Name, dann die Antwort, dann die Bewertung. Bei falsch kommt das
// nächste Team; nach dem ersten richtigen Team (oder dem letzten falschen) zeigt
// der nächste Klick die Lösung und startet den Auflösungs-Ton. Teams nach dem
// Gewinnerteam werden nicht mehr gezeigt.

const { fail, log, effect, teamName, bookTarget, cleanInk, fxRelease } = require('./core');
const { pv } = require('./scoring');

function round(st, i) {
  if (!st.rounds[i]) st.rounds[i] = { started: false, playback: { state: 'stopped', seq: 0 }, subs: [], grades: {}, winner: null, done: false, rv: null, revealed: false };
  return st.rounds[i];
}

// Aufgelöst (Lösung + Auflösungs-Ton)? Ältere Spielstände ohne Feld: mit „beendet“ gleichsetzen.
const isRevealed = (r) => (r.revealed === undefined ? r.done : r.revealed);

function current(st) {
  if (st.index < 0) fail('Es läuft gerade kein Rätsel.');
  return round(st, st.index);
}

// Nächste noch nicht geprüfte Abgabe in Buzzer-Reihenfolge.
function nextToCheck(r) {
  return r.subs.find((s) => r.grades[s.teamId] === undefined) || null;
}

// Teams, die bei der Auflösung gezeigt werden: in Abgabe-Reihenfolge bis einschließlich Gewinner.
function revealList(r) {
  const k = r.winner ? r.subs.findIndex((s) => s.teamId === r.winner) : r.subs.length - 1;
  return r.subs.slice(0, k + 1);
}

// Stand der Auflösung: Klick-Zähler rv → welches Team in welcher Stufe.
// Je Team 3 Klicks (Name, Antwort, Bewertung), danach 1 Klick für die Lösung.
function revealState(r) {
  if (r.rv === null || r.rv === undefined) return null;
  const list = revealList(r);
  const k = Math.floor((r.rv - 1) / 3);
  if (r.rv < 1 || k >= list.length) return { list, k: list.length, stage: 'solution' };
  return { list, k, stage: ['name', 'answer', 'verdict'][(r.rv - 1) % 3] };
}

// Ist das Ergebnis dieses Teams schon öffentlich?
function verdictShown(r, teamId) {
  if (isRevealed(r)) return revealList(r).some((s) => s.teamId === teamId);
  const rs = revealState(r);
  if (!rs) return false;
  const i = rs.list.findIndex((s) => s.teamId === teamId);
  return i >= 0 && (i < rs.k || (i === rs.k && rs.stage === 'verdict'));
}

module.exports = {
  fxManual: true, // Ergebnis aufs iPad erst bei der Auflösung (Bewertung des Teams)
  init: () => ({ index: -1, rounds: {} }),
  nextToCheck,
  isRevealed,
  revealState,

  team: {
    submit(db, ctx, game, st, p) {
      const r = current(st);
      if (!r.started) fail('Die Musik läuft noch nicht.');
      if (r.done) fail('Dieses Rätsel ist beendet.');
      if (r.subs.some((s) => s.teamId === ctx.teamId)) fail('Ihr habt schon abgeschickt.');
      const ink = cleanInk(p.ink);
      if (!ink) fail('Bitte zuerst die Titel aufschreiben.');
      r.subs.push({ teamId: ctx.teamId, ink, at: ctx.now });
      log(db, ctx, 'buzzer', `${teamName(db, ctx.teamId)} schickt ab (Platz ${r.subs.length})`);
      effect(db, 'buzz');
    },
  },

  mod: {
    open(db, ctx, game, st, p) {
      const i = Number(p.index);
      if (!game.content.puzzles[i]) fail('Rätsel nicht gefunden.');
      if (st.index >= 0 && st.index !== i) {
        const prev = round(st, st.index);
        if (prev.playback.state === 'playing') prev.playback = { state: 'stopped', seq: prev.playback.seq + 1 };
      }
      st.index = i;
      round(st, i);
      log(db, ctx, 'ablauf', `Rätsel ${i + 1} vorbereitet`);
    },

    play(db, ctx, game, st) {
      const r = current(st);
      if (!game.content.puzzles[st.index].audio) fail('Für dieses Rätsel ist noch keine Datei hochgeladen.');
      r.started = true;
      r.playback = { state: 'playing', seq: r.playback.seq + 1 };
      log(db, ctx, 'ablauf', `Rätsel ${st.index + 1}: Musik läuft`);
    },

    stop(db, ctx, game, st) {
      const r = current(st);
      r.playback = { state: 'stopped', seq: r.playback.seq + 1 };
    },

    // Abgaben in Buzzer-Reihenfolge prüfen: Punkt nur bei beiden Titeln richtig.
    judge(db, ctx, game, st, p) {
      const r = current(st);
      if (r.done) fail('Dieses Rätsel ist beendet.');
      const s = nextToCheck(r);
      if (!s) fail('Keine Abgabe zu prüfen.');
      r.grades[s.teamId] = !!p.correct;
      if (p.correct) {
        r.winner = s.teamId;
        r.done = true; // Mash-up läuft bis zum Ende weiter (Wunsch von Fabian)
        bookTarget(db, ctx, `songsong:${game.id}:${st.index}`, s.teamId, pv(game, 'correct'), `${game.title}, Rätsel ${st.index + 1}`);
        log(db, ctx, 'bewertung', `${teamName(db, s.teamId)}: beide Titel richtig (noch geheim)`);
      } else {
        log(db, ctx, 'bewertung', `${teamName(db, s.teamId)}: nicht beide Titel richtig (noch geheim)`);
      }
    },

    // Auflösung per Klick: je Team Name → Antwort → Bewertung, dann Lösung + Auflösungs-Ton.
    reveal(db, ctx, game, st) {
      const r = current(st);
      if (isRevealed(r)) fail('Dieses Rätsel ist schon aufgelöst.');
      if (!r.done) {
        if (r.subs.some((s) => r.grades[s.teamId] === undefined)) fail('Erst alle Abgaben prüfen.');
        r.done = true; // niemand hatte beide Titel
      }
      r.rv = (r.rv || 0) + 1;
      if (!r.subs.length) r.rv = 1; // keine Abgaben: direkt zur Lösung
      const rs = revealState(r);
      if (rs.stage === 'verdict') {
        const s = rs.list[rs.k];
        const ok = r.grades[s.teamId] === true;
        effect(db, ok ? 'correct' : 'wrong');
        fxRelease(db, [s.teamId], ok, ctx.now); // iPad zeigt das Ergebnis erst jetzt
        log(db, ctx, 'beamer', `Auflösung: ${teamName(db, s.teamId)} ${ok ? 'richtig' : 'falsch'}`);
      } else if (rs.stage === 'solution') {
        r.revealed = true;
        if (game.content.puzzles[st.index].reveal && r.playback.state === 'playing') r.playback = { state: 'stopped', seq: r.playback.seq + 1 };
        log(db, ctx, 'ablauf', `Rätsel ${st.index + 1} aufgelöst${r.winner ? '' : ' – kein Punkt'}`);
      }
    },

    // Rätsel ohne Punkt beenden (niemand hatte beide Titel).
    close(db, ctx, game, st) {
      const r = current(st);
      r.done = true; // Mash-up läuft bis zum Ende weiter
      log(db, ctx, 'ablauf', `Rätsel ${st.index + 1} beendet${r.winner ? '' : ' – kein Punkt'}`);
    },
  },

  teamView(db, game, st, teamId) {
    if (st.index < 0) return null;
    const r = round(st, st.index);
    const own = r.subs.find((s) => s.teamId === teamId);
    const p = game.content.puzzles[st.index];
    return {
      index: st.index,
      count: game.content.puzzles.length,
      started: r.started,
      canSubmit: r.started && !r.done && !own,
      submitted: !!own,
      place: own ? r.subs.indexOf(own) + 1 : null,
      grade: own && verdictShown(r, teamId) ? r.grades[teamId] ?? null : null,
      done: r.done,
      won: r.winner === teamId && verdictShown(r, teamId),
      solution: isRevealed(r) ? [p.melody, p.lyrics] : null,
    };
  },

  beamerView(db, game, st) {
    if (st.index < 0) return { waiting: true };
    const r = round(st, st.index);
    const p = game.content.puzzles[st.index];
    // Nach der Lösung: alle Tafeln nebeneinander – auch die der Teams nach dem Gewinner (ohne Wertung).
    const rs = isRevealed(r) ? { list: r.subs, k: r.subs.length, stage: 'solution' } : revealState(r);
    // Auflösung: gezeigte Teams (bis zum aktuellen) mit Antwort/Wertung je nach Stufe.
    const board = rs ? rs.list.slice(0, Math.min(rs.k + 1, rs.list.length)).map((s, i) => {
      const cur = i === rs.k;
      const showAnswer = !cur || rs.stage !== 'name';
      const showGrade = !cur || rs.stage === 'verdict';
      return { teamId: s.teamId, place: r.subs.indexOf(s) + 1, current: cur, ink: showAnswer ? s.ink : null, hidden: !showAnswer, grade: showGrade ? r.grades[s.teamId] ?? null : null };
    }) : null;
    return {
      index: st.index,
      audio: p.audio ? { id: p.audio.id, type: p.audio.type } : null,
      playback: r.playback,
      started: r.started,
      // Live nur die Reihenfolge der Abgaben – Wertungen erst bei der Auflösung.
      order: r.subs.map((s) => ({ teamId: s.teamId })),
      done: r.done,
      revealing: !!rs,
      board,
      winner: isRevealed(r) ? r.winner : null,
      revealed: isRevealed(r),
      solution: isRevealed(r) ? [p.melody, p.lyrics] : null,
      // Auflösung mit Ton (optional): startet mit dem letzten Klick, läuft auf dem Beamer ca. 12 Sekunden, nur Ton.
      reveal: isRevealed(r) && p.reveal ? { id: p.reveal.id, type: p.reveal.type } : null,
    };
  },
};
