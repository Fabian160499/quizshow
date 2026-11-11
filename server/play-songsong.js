'use strict';

// Spiel „Song Song Song“: Mash-up aus Melodie des einen und Text des anderen
// Songs. Jedes Team schreibt beide Titel; der Buzzer schickt die Antwort sofort
// verbindlich ab und sperrt KEINE anderen Teams. Die Moderation prüft in
// Buzzer-Reihenfolge: das erste Team mit beiden Titeln richtig bekommt 1 Punkt.

const { fail, log, effect, teamName, bookTarget, cleanInk } = require('./core');
const { pv } = require('./scoring');

function round(st, i) {
  if (!st.rounds[i]) st.rounds[i] = { started: false, playback: { state: 'stopped', seq: 0 }, subs: [], grades: {}, winner: null, done: false, revealed: false };
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

module.exports = {
  init: () => ({ index: -1, rounds: {} }),
  nextToCheck,
  isRevealed,

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
        log(db, ctx, 'bewertung', `${teamName(db, s.teamId)}: beide Titel richtig`);
        effect(db, 'correct');
      } else {
        log(db, ctx, 'bewertung', `${teamName(db, s.teamId)}: nicht beide Titel richtig`);
        effect(db, 'wrong');
      }
    },

    // Auflösung per Klick der Moderation: Lösung zeigen und (falls hochgeladen) den
    // Auflösungs-Ton starten – dann stoppt das Mash-up. Ohne Auflösungs-Ton läuft es weiter.
    // Ist das Rätsel noch offen, wird es dabei ohne Punkt beendet.
    reveal(db, ctx, game, st) {
      const r = current(st);
      if (isRevealed(r)) fail('Dieses Rätsel ist schon aufgelöst.');
      if (!r.done && r.subs.some((s) => r.grades[s.teamId] === undefined)) fail('Erst alle Abgaben prüfen.');
      r.done = true;
      r.revealed = true;
      if (game.content.puzzles[st.index].reveal && r.playback.state === 'playing') r.playback = { state: 'stopped', seq: r.playback.seq + 1 };
      log(db, ctx, 'ablauf', `Rätsel ${st.index + 1} aufgelöst${r.winner ? '' : ' – kein Punkt'}`);
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
      grade: own ? r.grades[teamId] ?? null : null,
      done: r.done,
      won: r.winner === teamId,
      solution: isRevealed(r) ? [p.melody, p.lyrics] : null,
    };
  },

  beamerView(db, game, st) {
    if (st.index < 0) return { waiting: true };
    const r = round(st, st.index);
    const p = game.content.puzzles[st.index];
    return {
      index: st.index,
      audio: p.audio ? { id: p.audio.id, type: p.audio.type } : null,
      playback: r.playback,
      started: r.started,
      // Reihenfolge der Abgaben ist öffentlich, die Antworten selbst nicht.
      order: r.subs.map((s) => ({ teamId: s.teamId, grade: r.grades[s.teamId] ?? null })),
      done: r.done,
      winner: r.winner,
      revealed: isRevealed(r),
      solution: isRevealed(r) ? [p.melody, p.lyrics] : null,
      // Auflösung mit Ton (optional): startet per Klick, läuft auf dem Beamer ca. 12 Sekunden, nur Ton.
      reveal: isRevealed(r) && p.reveal ? { id: p.reveal.id, type: p.reveal.type } : null,
    };
  },
};
