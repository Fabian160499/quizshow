'use strict';

// Spiel „Das Cover ist besser als das Original“: Pro Runde ein großer Hintergrund
// (Farbe oder Bild). Die Moderation blendet per Klick nach und nach bis zu 12 Bilder
// (Elemente) an festen Stellen ein. Die Teams haben auf dem iPad nur den Buzzer:
// Das schnellste Team antwortet mündlich. Richtig = 1 Punkt (im Editor änderbar),
// falsch = für diese Runde gesperrt, dann ist das nächstschnellste Team dran.
// Die Runde endet mit einer richtigen Antwort, wenn alle falsch lagen oder wenn die
// Moderation sie in der Regie beendet. Danach erscheint die Lösung auf dem Beamer.

const { fail, log, effect, teamName, teamIds, bookTarget, buzzIn, currentBuzz, buzzTeamView } = require('./core');
const { pv } = require('./scoring');

const MAX_ELEMENTS = 12;

function round(st, i) {
  if (!st.rounds[i]) st.rounds[i] = { shown: 0, buzzes: [], locked: [], resolved: false, winner: null };
  return st.rounds[i];
}
function current(st) {
  if (st.index < 0) fail('Es läuft gerade keine Runde.');
  return round(st, st.index);
}
const clampNum = (v, min, max, def) => {
  const n = Number(v);
  return v === null || v === undefined || v === '' || !Number.isFinite(n) ? def : Math.max(min, Math.min(max, n));
};
// Elemente mit Bild, in der eingestellten Reihenfolge (= Reihenfolge des Erscheinens).
function elementsOf(rd) {
  return (rd.elements || []).filter((e) => e && e.image).slice(0, MAX_ELEMENTS).map((e, i) => ({
    image: { id: e.image.id, type: e.image.type },
    x: clampNum(e.x, 0, 100, 50), y: clampNum(e.y, 0, 100, 50),
    size: clampNum(e.size, 3, 100, 30), z: clampNum(e.z, 1, 99, i + 1),
  }));
}
function background(rd) {
  const img = String(rd.bgMode || '').startsWith('Bild') && rd.bgImage ? { id: rd.bgImage.id, type: rd.bgImage.type } : null;
  return { color: /^#[0-9a-f]{6}$/i.test(rd.bgColor || '') ? rd.bgColor : '#1b1d3a', image: img };
}
function finish(r) {
  r.resolved = true;
  // Nur der schnellste zählt: übrige Buzzer werden nicht mehr bewertet.
  for (const b of r.buzzes) if (b.status === 'pending') b.status = 'skipped';
}

module.exports = {
  MAX_ELEMENTS,
  elementsOf,
  init: () => ({ index: -1, rounds: {} }),

  team: {
    buzz(db, ctx, game, st) {
      const r = current(st);
      buzzIn(db, ctx, r);
    },
  },

  mod: {
    open(db, ctx, game, st, p) {
      const i = Number(p.index);
      if (!game.content.rounds[i]) fail('Runde nicht gefunden.');
      if (st.index >= 0 && st.index !== i && currentBuzz(round(st, st.index))) fail('Erst die Antwort des Teams bewerten.');
      st.index = i;
      round(st, i);
      log(db, ctx, 'ablauf', `Cover: Runde ${i + 1} gestartet – Buzzer frei`);
    },
    // Nächstes Element auf dem Hintergrund einblenden.
    show(db, ctx, game, st) {
      const r = current(st);
      const n = elementsOf(game.content.rounds[st.index]).length;
      if (r.shown >= n) fail('Alle Elemente sind schon zu sehen.');
      r.shown += 1;
      log(db, ctx, 'ablauf', `Cover: Element ${r.shown} von ${n} gezeigt`);
    },
    judge(db, ctx, game, st, p) {
      const r = current(st);
      if (r.resolved) fail('Diese Runde ist schon beendet.');
      const b = currentBuzz(r);
      if (!b) fail('Gerade antwortet kein Team.');
      if (p.correct) {
        b.status = 'correct';
        r.winner = b.teamId;
        finish(r);
        bookTarget(db, ctx, `cover:${game.id}:${st.index}`, b.teamId, pv(game, 'correct'), `${game.title}, Runde ${st.index + 1}`);
        log(db, ctx, 'bewertung', `Cover: ${teamName(db, b.teamId)} richtig`);
        effect(db, 'correct');
      } else {
        b.status = 'wrong';
        r.locked.push(b.teamId);
        log(db, ctx, 'bewertung', `Cover: ${teamName(db, b.teamId)} falsch – für diese Runde gesperrt`);
        effect(db, 'wrong');
        if (teamIds(db).every((id) => r.locked.includes(id))) {
          finish(r);
          log(db, ctx, 'ablauf', `Cover: Runde ${st.index + 1} – alle Teams falsch`);
        }
      }
    },
    // Runde ohne (weitere) richtige Antwort beenden, Lösung zeigen.
    close(db, ctx, game, st) {
      const r = current(st);
      if (r.resolved) fail('Schon beendet.');
      if (currentBuzz(r)) fail('Erst die Antwort des Teams bewerten.');
      finish(r);
      log(db, ctx, 'ablauf', `Cover: Runde ${st.index + 1} beendet`);
      effect(db, 'reveal');
    },
  },

  // Teams sehen nur den Buzzer (und ob sie dran sind).
  teamView(db, game, st, teamId) {
    if (st.index < 0) return null;
    const r = round(st, st.index);
    const pending = currentBuzz(r);
    const b = buzzTeamView(r, teamId);
    return {
      index: st.index,
      count: game.content.rounds.length,
      ...b,
      resolved: r.resolved,
      canBuzz: !r.resolved && !b.buzzed && !b.locked,
      someoneAnswering: !!pending && pending.teamId !== teamId,
      won: r.resolved ? r.winner === teamId : null,
    };
  },

  beamerView(db, game, st) {
    if (st.index < 0) return { waiting: true };
    const r = round(st, st.index);
    const rd = game.content.rounds[st.index];
    const pending = currentBuzz(r);
    const els = elementsOf(rd);
    return {
      index: st.index,
      count: game.content.rounds.length,
      bg: background(rd),
      // Bei der Auflösung erscheinen auch alle noch nicht gezeigten Elemente.
      elements: r.resolved ? els : els.slice(0, r.shown),
      total: els.length,
      buzzOrder: r.buzzes.map((x) => ({ teamId: x.teamId, status: x.status })),
      answering: pending ? pending.teamId : null,
      resolved: r.resolved,
      winner: r.winner,
      solution: r.resolved ? rd.solution || '' : null,
    };
  },
};
