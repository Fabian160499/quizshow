'use strict';

// Spiel „All About That Bass“: Ein Song in Einzelspuren (z. B. Bass, Schlagzeug,
// Gitarre, Keyboard, Gesang). Die Spuren laufen synchron; alle 10 Sekunden (im
// Editor änderbar) kommt die nächste dazu. Alle Teams dürfen jederzeit buzzern:
// Die Musik hält an, das Team antwortet mündlich. Richtig = Punkte je nachdem, wie
// viele Spuren schon liefen (1 Spur = 5, 2 = 4, 3 = 3, 4 = 2, ab 5 = 1 – änderbar).
// Falsch = Team für diesen Song gesperrt, die Musik läuft an derselben Stelle weiter.
// Auflösung: der ganze Song (komplette Fassung, sonst alle Spuren zusammen).

const { fail, log, effect, teamName, teamIds, bookTarget, buzzIn, currentBuzz, buzzTeamView } = require('./core');
const { pv } = require('./scoring');

const MAX_TRACKS = 6;
const intervalOf = (game) => { const v = Number(game.content.interval); return Number.isFinite(v) && v > 0 ? v : 10; };
const tracksOf = (song) => (song && song.tracks ? song.tracks.filter((t) => t && t.audio && t.audio.id) : []);

function round(st, i) {
  if (!st.rounds[i]) st.rounds[i] = { started: false, playback: { state: 'stopped', seq: 0, pos: 0, at: 0 }, buzzes: [], locked: [], resolved: false, winner: null };
  return st.rounds[i];
}
function current(st) {
  if (st.index < 0) fail('Es läuft gerade kein Song.');
  return round(st, st.index);
}
// Sekunden seit Beginn der Spurfolge (ohne Pausen).
function elapsed(r, now) {
  const pb = r.playback;
  return pb.pos + (pb.state === 'playing' ? Math.max(0, (now - pb.at) / 1000) : 0);
}
const stageAt = (game, song, sec) => Math.max(1, Math.min(tracksOf(song).length, Math.floor(sec / intervalOf(game)) + 1));
function setPlayback(r, state, pos, now) {
  r.playback = { state, seq: r.playback.seq + 1, pos, at: now };
}
const pointsFor = (game, stage) => pv(game, `stage${Math.min(stage, MAX_TRACKS)}`);

module.exports = {
  init: () => ({ index: -1, rounds: {} }),
  pointsFor,

  team: {
    buzz(db, ctx, game, st) {
      const r = current(st);
      if (!r.started) fail('Die Musik läuft noch nicht.');
      if (currentBuzz(r)) fail('Ein anderes Team antwortet gerade.');
      const song = game.content.songs[st.index];
      const sec = elapsed(r, ctx.now);
      const stage = stageAt(game, song, sec);
      buzzIn(db, ctx, r, { stage, sec });
      // Musik anhalten, damit in Ruhe geantwortet werden kann.
      if (r.playback.state === 'playing') setPlayback(r, 'paused', sec, ctx.now);
    },
  },

  mod: {
    open(db, ctx, game, st, p) {
      const i = Number(p.index);
      const song = game.content.songs[i];
      if (!song) fail('Song nicht gefunden.');
      if (tracksOf(song).length < 2) fail('Für diesen Song fehlen noch Spuren (mindestens zwei).');
      if (st.index >= 0 && st.index !== i) {
        const prev = round(st, st.index);
        if (prev.playback.state === 'playing') setPlayback(prev, 'paused', elapsed(prev, ctx.now), ctx.now);
      }
      st.index = i;
      round(st, i);
      log(db, ctx, 'ablauf', `All About That Bass: Song ${i + 1} vorbereitet`);
    },
    // Abspielen: von vorn oder an der Pausenstelle weiter.
    play(db, ctx, game, st, p) {
      const r = current(st);
      if (r.resolved) fail('Dieser Song ist schon aufgelöst.');
      if (currentBuzz(r)) fail('Erst die Antwort des Teams bewerten.');
      r.started = true;
      const from = p.restart || r.playback.state === 'stopped' ? 0 : elapsed(r, ctx.now);
      setPlayback(r, 'playing', from, ctx.now);
      log(db, ctx, 'ablauf', `Song ${st.index + 1} läuft${from === 0 ? ' (von vorn)' : ''}`);
    },
    pause(db, ctx, game, st) {
      const r = current(st);
      if (r.playback.state === 'playing') setPlayback(r, 'paused', elapsed(r, ctx.now), ctx.now);
    },
    judge(db, ctx, game, st, p) {
      const r = current(st);
      const b = currentBuzz(r);
      if (!b) fail('Gerade antwortet kein Team.');
      const song = game.content.songs[st.index];
      if (p.correct) {
        b.status = 'correct';
        r.resolved = true;
        r.winner = b.teamId;
        r.points = pointsFor(game, b.stage);
        setPlayback(r, 'reveal', 0, ctx.now);
        bookTarget(db, ctx, `spuren:${game.id}:${st.index}`, b.teamId, r.points, `${game.title}, Song ${st.index + 1}`);
        log(db, ctx, 'bewertung', `${teamName(db, b.teamId)}: „${song.title}“ richtig bei ${b.stage} ${b.stage === 1 ? 'Spur' : 'Spuren'} – ${r.points} Punkte`);
        effect(db, 'correct');
      } else {
        b.status = 'wrong';
        r.locked.push(b.teamId);
        log(db, ctx, 'bewertung', `${teamName(db, b.teamId)}: falsch, für diesen Song gesperrt`);
        effect(db, 'wrong');
        if (teamIds(db).every((id) => r.locked.includes(id))) {
          r.resolved = true;
          setPlayback(r, 'reveal', 0, ctx.now);
          log(db, ctx, 'ablauf', `Song ${st.index + 1}: alle Teams falsch, keine Punkte`);
        } else {
          // Musik läuft an derselben Stelle weiter, die übrigen Teams dürfen buzzern.
          setPlayback(r, 'playing', r.playback.pos, ctx.now);
        }
      }
    },
    // Niemand weiß es: Song auflösen und ganz abspielen.
    close(db, ctx, game, st) {
      const r = current(st);
      if (currentBuzz(r)) fail('Erst die Antwort des Teams bewerten.');
      r.resolved = true;
      setPlayback(r, 'reveal', 0, ctx.now);
      log(db, ctx, 'ablauf', `Song ${st.index + 1} aufgelöst`);
      effect(db, 'reveal');
    },
    // Musik der Auflösung anhalten.
    stopReveal(db, ctx, game, st) {
      const r = current(st);
      if (r.playback.state === 'reveal') setPlayback(r, 'stopped', 0, ctx.now);
    },
  },

  teamView(db, game, st, teamId, now = Date.now()) {
    if (st.index < 0) return null;
    const r = round(st, st.index);
    const song = game.content.songs[st.index];
    const pending = currentBuzz(r);
    const own = r.buzzes.find((b) => b.teamId === teamId);
    return {
      index: st.index,
      count: game.content.songs.length,
      tracks: tracksOf(song).length,
      started: r.started,
      ...buzzTeamView(r, teamId),
      resolved: r.resolved,
      canBuzz: r.started && !r.resolved && !pending && !r.locked.includes(teamId) && !own,
      someoneAnswering: !!pending && pending.teamId !== teamId,
      ownStage: own ? own.stage : null,
      title: r.resolved ? song.title : null,
      artist: r.resolved ? song.artist || '' : null,
      won: r.resolved ? r.winner === teamId : null,
      points: r.resolved && r.winner === teamId ? r.points : null,
      stage: r.started && !r.resolved ? stageAt(game, song, elapsed(r, now)) : null,
    };
  },

  beamerView(db, game, st) {
    if (st.index < 0) return { waiting: true };
    const r = round(st, st.index);
    const song = game.content.songs[st.index];
    const pending = currentBuzz(r);
    const tracks = tracksOf(song);
    const now = Date.now();
    return {
      index: st.index,
      count: game.content.songs.length,
      interval: intervalOf(game),
      start: Number(song.start) || 0,
      tracks: tracks.map((t, i) => ({ label: t.label || `Spur ${i + 1}`, audio: { id: t.audio.id, type: t.audio.type }, points: pointsFor(game, i + 1) })),
      full: song.full && song.full.id ? { id: song.full.id, type: song.full.type } : null,
      started: r.started,
      // pos = Sekunden in der Spurfolge zum Zeitpunkt der letzten Änderung; der Beamer rechnet ab Empfang weiter.
      playback: { state: r.playback.state, seq: r.playback.seq, pos: r.playback.state === 'playing' ? elapsed(r, now) : r.playback.pos },
      buzzOrder: r.buzzes.map((b) => ({ teamId: b.teamId, status: b.status, stage: b.stage })),
      answering: pending ? pending.teamId : null,
      resolved: r.resolved,
      winner: r.winner,
      points: r.resolved ? r.points ?? 0 : null,
      title: r.resolved ? song.title : null,
      artist: r.resolved ? song.artist || '' : null,
      cover: r.resolved && song.cover && song.cover.id ? { id: song.cover.id, type: song.cover.type } : null,
    };
  },
};
