'use strict';

// Spiel „Guck mal, wer da spricht“: Ein Chat im Stil eines Smartphone-Messengers
// mit genau acht Nachrichten (vier je Seite). Jede Nachricht ist ein weiterer
// Hinweis auf eine berühmte Persönlichkeit. Die Moderation deckt Nachricht für
// Nachricht auf; ab der ersten Nachricht ist der Buzzer frei. Das schnellste
// Team antwortet mündlich: richtig = 1 Punkt, Runde beendet; falsch = dieses Team
// ist für die Runde gesperrt, die übrigen dürfen weiter buzzern. Kein Timer;
// die Moderation kann die Runde jederzeit ohne Punkte beenden. Die Lösung wird
// erst bei der Auflösung oben als Kontakt gezeigt.

const { fail, log, effect, teamName, bookTarget, buzzIn, currentBuzz, buzzTeamView } = require('./core');
const { pv } = require('./scoring');

const N = 8;

function round(st, i) {
  if (!st.rounds[i]) st.rounds[i] = { shown: 0, buzzes: [], locked: [], resolved: false, winner: null };
  return st.rounds[i];
}
function current(st) {
  if (st.index < 0) fail('Es läuft gerade kein Chat.');
  return round(st, st.index);
}
function validate(chat) {
  const msgs = chat.messages || [];
  if (msgs.length !== N || msgs.some((m) => !String(m.text || '').trim())) return 'Ein Chat braucht genau acht Nachrichten mit Text.';
  const left = msgs.filter((m) => m.from !== 'Rechts (blau)').length;
  if (left !== 4) return `Es müssen je vier Nachrichten links und rechts sein (jetzt ${left} links, ${N - left} rechts).`;
  if (!String(chat.person || '').trim()) return 'Die gesuchte Persönlichkeit fehlt.';
  return null;
}
const bubbles = (chat, n) => (chat.messages || []).slice(0, n).map((m) => ({ text: m.text, right: m.from === 'Rechts (blau)' }));

module.exports = {
  init: () => ({ index: -1, rounds: {} }),
  validate,

  team: {
    buzz(db, ctx, game, st) {
      const r = current(st);
      if (r.shown < 1) fail('Der Buzzer ist erst nach der ersten Nachricht frei.');
      buzzIn(db, ctx, r);
    },
  },

  mod: {
    open(db, ctx, game, st, p) {
      const i = Number(p.index);
      const chat = game.content.chats[i];
      if (!chat) fail('Chat nicht gefunden.');
      const err = validate(chat);
      if (err) fail(`Chat ${i + 1} kann nicht starten: ${err}`);
      st.index = i;
      round(st, i);
      log(db, ctx, 'ablauf', `Chat ${i + 1} geöffnet`);
    },
    next(db, ctx, game, st) {
      const r = current(st);
      if (r.resolved) fail('Dieser Chat ist beendet.');
      if (r.shown >= N) fail('Alle acht Nachrichten sind aufgedeckt.');
      r.shown += 1;
      log(db, ctx, 'ablauf', `Chat ${st.index + 1}: Nachricht ${r.shown} aufgedeckt`);
    },
    judge(db, ctx, game, st, p) {
      const r = current(st);
      const b = currentBuzz(r);
      if (!b) fail('Kein Team hat gerade das Antwortrecht.');
      if (p.correct) {
        b.status = 'correct';
        r.resolved = true;
        r.winner = b.teamId;
        for (const x of r.buzzes) if (x.status === 'pending') x.status = 'skipped';
        bookTarget(db, ctx, `chat:${game.id}:${st.index}`, b.teamId, pv(game, 'correct'), `${game.title}, Chat ${st.index + 1}`);
        effect(db, 'correct');
      } else {
        b.status = 'wrong';
        r.locked.push(b.teamId);
        effect(db, 'wrong');
      }
      log(db, ctx, 'bewertung', `Chat ${st.index + 1}: ${teamName(db, b.teamId)} ${p.correct ? 'richtig' : 'falsch'}`);
    },
    close(db, ctx, game, st) {
      const r = current(st);
      if (currentBuzz(r)) fail('Erst die Antwort des buzzernden Teams bewerten.');
      if (r.resolved) fail('Schon beendet.');
      r.resolved = true;
      log(db, ctx, 'ablauf', `Chat ${st.index + 1} ohne Punkte beendet`);
      effect(db, 'reveal');
    },
  },

  teamView(db, game, st, teamId) {
    if (st.index < 0) return null;
    const r = round(st, st.index);
    const chat = game.content.chats[st.index];
    const b = buzzTeamView(r, teamId);
    return {
      index: st.index,
      count: game.content.chats.length,
      messages: bubbles(chat, r.resolved ? N : r.shown), // Bei der Auflösung alle Nachrichten zeigen
      shown: r.shown,
      resolved: r.resolved,
      person: r.resolved ? chat.person : null,
      ...b,
      canBuzz: !r.resolved && r.shown >= 1 && !b.buzzed && !b.locked,
    };
  },

  beamerView(db, game, st) {
    if (st.index < 0) return { waiting: true };
    const r = round(st, st.index);
    const chat = game.content.chats[st.index];
    const cur = currentBuzz(r);
    return {
      index: st.index,
      messages: bubbles(chat, r.resolved ? N : r.shown), // Bei der Auflösung alle Nachrichten zeigen
      shown: r.shown,
      total: N,
      buzzOrder: r.buzzes.map((b) => ({ teamId: b.teamId, status: b.status })),
      answering: cur ? cur.teamId : null,
      resolved: r.resolved,
      person: r.resolved ? chat.person : null,
      photo: r.resolved && chat.photo ? { id: chat.photo.id, type: chat.photo.type } : null,
      winner: r.winner,
    };
  },
};
