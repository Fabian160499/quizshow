'use strict';

// Musikquiz im Jeopardy-Stil: fünf Kategorien mit Feldern zu 1, 2 und 3 Punkten.
// Ein Team wählt auf dem iPad ein Feld (zu Beginn ausgelost, danach das Team mit der
// richtigen Antwort, ohne richtige Antwort neu ausgelost), die Moderation startet den
// Clip, alle Teams buzzern.

const core = require('./core');
const { fail, log, effect, teamName, teamIds, bookTarget, buzzIn, currentBuzz, buzzTeamView } = core;
const { pv } = require('./scoring');

const key = (c, f) => `${c}-${f}`;
const SONG_SONG_SONG = /^Song Song Song/;

function round(st, k) {
  if (!st.rounds[k]) st.rounds[k] = { started: false, buzzes: [], locked: [], resolved: false };
  return st.rounds[k];
}

function active(st) {
  if (!st.current) fail('Es ist gerade kein Feld gewählt.');
  return round(st, st.current);
}

function field(game, k) {
  const [c, f] = k.split('-').map(Number);
  const cat = game.content.categories[c];
  return { c, f, cat, field: cat.fields[f], value: pv(game, `field${f + 1}`), mashup: SONG_SONG_SONG.test(cat.mode) };
}

function board(game, st) {
  return game.content.categories.map((cat, c) => ({
    name: cat.name,
    mashup: SONG_SONG_SONG.test(cat.mode),
    fields: cat.fields.map((_, f) => {
      const p = st.played[key(c, f)];
      return { value: pv(game, `field${f + 1}`), played: !!p, winner: p ? p.winner : null };
    }),
  }));
}

function drawPicker(db, st) {
  const ids = teamIds(db);
  st.picker = ids.length ? ids[core.randomInt(ids.length)] : null;
}

function resolve(db, ctx, st, winner) {
  const r = active(st);
  r.resolved = true;
  st.played[st.current] = { winner };
  // Wer richtig lag, wählt das nächste Feld – sonst wird neu ausgelost.
  if (winner) st.picker = winner;
  else drawPicker(db, st);
}

function choose(db, ctx, game, st, c, f, by) {
  if (!game.content.categories[c]?.fields[f]) fail('Feld nicht gefunden.');
  if (st.current && !round(st, st.current).resolved) fail('Erst das laufende Feld beenden.');
  const k = key(c, f);
  if (st.played[k]) fail('Dieses Feld wurde schon gespielt.');
  st.current = k;
  round(st, k);
  log(db, ctx, 'ablauf', `${by ? `${teamName(db, by)} wählt` : 'Gewählt:'} „${game.content.categories[c].name || `Kategorie ${c + 1}`}“ für ${pv(game, `field${f + 1}`)}`);
}

module.exports = {
  init: () => ({ current: null, played: {}, rounds: {}, picker: null, started: false }),

  team: {
    // Das Team am Zug wählt das Feld auf seinem iPad (sofort, ohne Rückfrage).
    pick(db, ctx, game, st, p) {
      if (!st.started) fail('Das Spiel hat noch nicht begonnen.');
      if (st.picker !== ctx.teamId) fail('Ein anderes Team wählt gerade.');
      choose(db, ctx, game, st, Number(p.cat), Number(p.field), ctx.teamId);
    },
    buzz(db, ctx, game, st) {
      const r = active(st);
      if (!r.started) fail('Die Aufgabe läuft noch nicht.');
      buzzIn(db, ctx, r);
      // Musik pausiert, sobald gebuzzert wird.
      if (r.playback && r.playback.state === 'playing') r.playback = { state: 'paused', seq: r.playback.seq + 1, restart: false };
    },
  },

  mod: {
    // Spielbeginn: ein Team auslosen, das das erste Feld wählt.
    begin(db, ctx, game, st) {
      if (st.started) fail('Das Spiel läuft schon.');
      st.started = true;
      drawPicker(db, st);
      log(db, ctx, 'ablauf', `Musikquiz: ausgelost – ${teamName(db, st.picker)} wählt`);
      effect(db, 'title');
    },
    // Notfall (iPad fällt aus): Regie wählt das Feld für das Team am Zug.
    pick(db, ctx, game, st, p) {
      if (!st.started) { st.started = true; if (!st.picker) drawPicker(db, st); }
      choose(db, ctx, game, st, Number(p.cat), Number(p.field), null);
    },
    start(db, ctx, game, st) {
      const r = active(st);
      if (r.resolved) fail('Dieses Feld ist bereits beendet.');
      r.started = true;
      r.playback = { state: 'playing', seq: (r.playback?.seq || 0) + 1, restart: true };
      log(db, ctx, 'ablauf', 'Aufgabe gestartet, Buzzer frei');
    },
    // Clip steuern: { restart } spielt (von vorn), sonst Pause.
    playAudio(db, ctx, game, st, p) {
      const r = active(st);
      if (r.resolved) fail('Dieses Feld ist bereits beendet.');
      r.playback = { state: 'playing', seq: (r.playback?.seq || 0) + 1, restart: !!p.restart };
    },
    pauseAudio(db, ctx, game, st) {
      const r = active(st);
      r.playback = { state: 'paused', seq: (r.playback?.seq || 0) + 1, restart: false };
    },
    judge(db, ctx, game, st, p) {
      const r = active(st);
      const buzz = currentBuzz(r);
      if (!buzz) fail('Kein Team hat gerade das Antwortrecht.');
      const info = field(game, st.current);
      if (p.correct) {
        buzz.status = 'correct';
        bookTarget(db, ctx, `musik:${game.id}:${st.current}`, buzz.teamId, info.value, `${game.title}, ${info.cat.name || `Kategorie ${info.c + 1}`} ${info.value}`);
        resolve(db, ctx, st, buzz.teamId);
        effect(db, 'correct');
      } else {
        buzz.status = 'wrong';
        r.locked.push(buzz.teamId);
        effect(db, 'wrong');
      }
      log(db, ctx, 'bewertung', `${teamName(db, buzz.teamId)}: ${p.correct ? 'richtig' : 'falsch'}`);
    },
    close(db, ctx, game, st) {
      const r = active(st);
      if (r.resolved) fail('Dieses Feld ist bereits beendet.');
      if (currentBuzz(r)) fail('Erst die Antwort des buzzernden Teams bewerten.');
      resolve(db, ctx, st, null);
      log(db, ctx, 'ablauf', 'Feld ohne Punkte beendet');
    },
  },

  teamView(db, game, st, teamId) {
    const cur = st.current ? round(st, st.current) : null;
    const choosing = st.started && (!cur || cur.resolved);
    const out = { board: board(game, st), current: null, started: !!st.started, picker: st.picker, myPick: choosing && st.picker === teamId };
    if (!st.current) return out;
    const r = round(st, st.current);
    const info = field(game, st.current);
    const b = buzzTeamView(r, teamId);
    out.current = {
      category: info.cat.name, value: info.value, mashup: info.mashup, task: info.field.task,
      started: r.started, resolved: r.resolved, ...b,
      canBuzz: r.started && !r.resolved && !b.buzzed && !b.locked,
    };
    return out;
  },

  beamerView(db, game, st) {
    const cur = st.current ? round(st, st.current) : null;
    const out = { board: board(game, st), current: null, picker: st.started && (!cur || cur.resolved) ? st.picker : null };
    if (!st.current) return out;
    const r = round(st, st.current);
    const info = field(game, st.current);
    const current = currentBuzz(r);
    out.current = {
      category: info.cat.name, value: info.value, mashup: info.mashup, task: info.field.task,
      started: r.started, resolved: r.resolved,
      buzzOrder: r.buzzes.map((x) => ({ teamId: x.teamId, status: x.status })),
      answering: current ? current.teamId : null,
      answer: r.resolved ? info.field.answer : null,
      key: st.current,
      clip: info.field.clip ? { id: info.field.clip.id, type: info.field.clip.type } : null,
      // Auflösung mit Ton: erst, wenn das Feld beendet ist (richtig oder ohne Punkte).
      reveal: r.resolved && info.field.reveal ? { id: info.field.reveal.id, type: info.field.reveal.type } : null,
      playback: r.resolved ? { state: 'stopped', seq: (r.playback?.seq || 0) + 1 } : r.playback || { state: 'stopped', seq: 0 },
      winner: st.played[st.current]?.winner || null,
    };
    return out;
  },
};
