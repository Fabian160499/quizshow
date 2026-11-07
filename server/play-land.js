'use strict';

// Spiel „Ich sehe ein Land, das du nicht siehst“: jedes Team setzt einen Punkt
// auf der Karte. Erst werden alle Tipps gleichzeitig gezeigt, dann der Zielort.
// Gesuchter Punkt: innerer Radius 3 Punkte, äußerer 2 Punkte (jedes Team); liegt kein
// Team im äußeren Radius, bekommt das Team am nächsten dran 1 Punkt.
// Radien je Karte (Wunsch von Fabian): Deutschland 50/100 km, Europa 100/200 km, Welt 250/500 km.
// Gesuchtes Land (Welt-/Europakarte): jedes Team, das im Land tippt, bekommt 1 Punkt.

const { fail, log, effect, teamName, teamIds, bookTarget, distanceKm } = require('./core');
const { pv } = require('./scoring');
const COUNTRIES = require('./countries');

const MODE_COUNTRY = 'Ganzes Land (nur Welt- und Europakarte)';
const BY_NAME = new Map(COUNTRIES.map((c) => [c.name, c]));
// Toleranz an Küsten und bei Kleinstaaten: so genau kann man auf der Karte nicht tippen.
const TOL_KM = { Welt: 80, Europa: 25 };

function inRing(x, y, ring) {
  let ins = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
function insideCountry(c, lat, lng) {
  const [x0, y0, x1, y1] = c.bbox;
  if (lng < x0 || lng > x1 || lat < y0 || lat > y1) return false;
  return c.polys.some((p) => inRing(lng, lat, p[0]) && !p.slice(1).some((hole) => inRing(lng, lat, hole)));
}
// Kürzester Abstand vom Punkt zur Landesgrenze in km (lokal flach gerechnet, reicht hier).
function borderKm(c, lat, lng) {
  const kx = 111.32 * Math.cos((lat * Math.PI) / 180), ky = 110.57;
  let best = Infinity;
  for (const p of c.polys) for (const ring of p) {
    for (let i = 1; i < ring.length; i++) {
      const ax = (ring[i - 1][0] - lng) * kx, ay = (ring[i - 1][1] - lat) * ky;
      const bx = (ring[i][0] - lng) * kx, by = (ring[i][1] - lat) * ky;
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      const t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
  }
  return best;
}
// Treffer: im Land – oder knapp daneben im Meer bzw. bei sehr kleinen Ländern in der Nähe.
function judgeCountry(c, map, g) {
  if (insideCountry(c, g.lat, g.lng)) return { hit: true, km: 0 };
  const km = Math.round(borderKm(c, g.lat, g.lng));
  const tol = TOL_KM[map] || 25;
  const [x0, y0, x1, y1] = c.bbox;
  const sizeKm = Math.max((x1 - x0) * 111.32 * Math.cos((((y0 + y1) / 2) * Math.PI) / 180), (y1 - y0) * 110.57);
  const tiny = sizeKm < tol * 2;
  const inOther = COUNTRIES.some((o) => o !== c && insideCountry(o, g.lat, g.lng));
  return { hit: km <= tol && (tiny || !inOther), km };
}
// Gesuchtes Land dieser Aufgabe (oder null bei gesuchtem Punkt).
function countryOf(game, task) {
  if (!task || task.mode !== MODE_COUNTRY || mapOf(game, task) === 'Deutschland') return null;
  return BY_NAME.get(task.country) || null;
}

function round(st, t) {
  if (!st.rounds[t]) st.rounds[t] = { open: false, guesses: {}, showGuesses: false, showTarget: false, winners: [] };
  return st.rounds[t];
}

function current(st) {
  if (st.taskIndex < 0) fail('Es läuft gerade keine Aufgabe.');
  return round(st, st.taskIndex);
}

function coord(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) fail('Ungültiger Kartenpunkt.');
  return Math.round(n * 1000) / 1000;
}

function distances(game, task, r) {
  const c = countryOf(game, task);
  return Object.entries(r.guesses).map(([teamId, g]) => {
    if (c) {
      const j = judgeCountry(c, mapOf(game, task), g);
      return { teamId, lat: g.lat, lng: g.lng, km: j.km, hit: j.hit };
    }
    return { teamId, lat: g.lat, lng: g.lng, km: Math.round(distanceKm(g, task)) };
  });
}

// awards: { teamId: Punkte } – ohne Angabe bekommt jeder Gewinner den Punkt „winner“.
function bookWinners(db, ctx, game, st, r, winners, why, awards = null) {
  const before = r.winners || [];
  r.winners = winners;
  r.awards = awards || Object.fromEntries(winners.map((id) => [id, pv(game, 'winner')]));
  for (const id of new Set([...Object.keys(r.guesses), ...before, ...winners])) {
    bookTarget(db, ctx, `land:${game.id}:${st.taskIndex}:${id}`, id, r.awards[id] || 0, `${game.title}, Aufgabe ${st.taskIndex + 1}${why}`);
  }
}
const RADII = { Deutschland: { inner: 50, outer: 100 }, Europa: { inner: 100, outer: 200 }, Welt: { inner: 250, outer: 500 } };
const radiiOf = (map) => RADII[map] || RADII.Deutschland;

// Gesuchter Punkt: innerer / äußerer Radius der Karte, sonst das nächste Team.
function pointAwards(game, d, map) {
  const { inner, outer } = radiiOf(map);
  const awards = {};
  for (const x of d) {
    if (x.km <= inner) awards[x.teamId] = pv(game, 'r50');
    else if (x.km <= outer) awards[x.teamId] = pv(game, 'r100');
  }
  if (!Object.keys(awards).length && d.length) {
    const best = Math.min(...d.map((x) => x.km));
    for (const x of d) if (x.km === best) awards[x.teamId] = pv(game, 'winner');
  }
  return awards;
}

// Karte je Aufgabe: eigene Wahl oder die Standard-Karte des Spiels.
function mapOf(game, task) {
  return task && ['Welt', 'Europa', 'Deutschland'].includes(task.map) ? task.map : game.content.map;
}

function publicView(db, game, st) {
  const r = round(st, st.taskIndex);
  const task = game.content.tasks[st.taskIndex];
  const c = countryOf(game, task);
  return {
    map: mapOf(game, task),
    mode: c ? 'country' : 'point',
    taskIndex: st.taskIndex,
    count: game.content.tasks.length,
    question: task.question,
    image: task.image ? { id: task.image.id, type: task.image.type } : null,
    open: r.open,
    submittedCount: Object.keys(r.guesses).length,
    teamCount: db.project.teams.length,
    guesses: r.showGuesses ? distances(game, task, r).map((d) => ({ teamId: d.teamId, lat: d.lat, lng: d.lng, km: r.showTarget ? d.km : null, hit: r.showTarget && c ? d.hit : null })) : null,
    target: !r.showTarget ? null
      : c ? { name: task.target || c.name, country: true, lat: c.label[1], lng: c.label[0], shape: c.draw }
        : { name: task.target, lat: task.lat, lng: task.lng, radii: radiiOf(mapOf(game, task)) },
    winners: r.showTarget ? r.winners : [],
    awards: r.showTarget ? r.awards || Object.fromEntries((r.winners || []).map((id) => [id, pv(game, 'winner')])) : null,
  };
}

module.exports = {
  MODE_COUNTRY,
  COUNTRY_NAMES: COUNTRIES.map((c) => c.name),
  judgeCountry: (name, map, g) => judgeCountry(BY_NAME.get(name), map, g),
  init: () => ({ taskIndex: -1, rounds: {} }),

  team: {
    guess(db, ctx, game, st, p) {
      const r = current(st);
      if (!r.open) fail('Die Aufgabe ist nicht freigegeben.');
      if (r.guesses[ctx.teamId]) fail('Euer Punkt ist bereits gesperrt.');
      r.guesses[ctx.teamId] = { lat: coord(p.lat, -90, 90), lng: coord(p.lng, -180, 180), at: ctx.now };
      // Ganzes Land: Treffer gleich festhalten (sieht nur die Moderation bis zur Auflösung).
      const task = game.content.tasks[st.taskIndex];
      const c = countryOf(game, task);
      if (c) Object.assign(r.guesses[ctx.teamId], judgeCountry(c, mapOf(game, task), r.guesses[ctx.teamId]));
      log(db, ctx, 'antwort', `${teamName(db, ctx.teamId)} hat einen Punkt gesetzt`);
    },
  },

  mod: {
    open(db, ctx, game, st, p) {
      const t = Number(p.taskIndex);
      const task = game.content.tasks[t];
      if (!task) fail('Aufgabe nicht gefunden.');
      if (task.mode === MODE_COUNTRY && mapOf(game, task) !== 'Deutschland') {
        if (!countryOf(game, task)) fail('Für diese Aufgabe ist noch kein gesuchtes Land gewählt (Editor).');
      } else if (task.lat === null || task.lat === undefined || task.lng === null || task.lng === undefined) {
        fail('Für diese Aufgabe fehlen noch Breiten- und Längengrad im Editor.');
      }
      if (st.taskIndex >= 0 && st.taskIndex !== t) round(st, st.taskIndex).open = false;
      st.taskIndex = t;
      const r = round(st, t);
      if (!r.showGuesses) r.open = true;
      log(db, ctx, 'ablauf', `Aufgabe ${t + 1} freigegeben`);
    },

    revealGuesses(db, ctx, game, st) {
      const r = current(st);
      if (!Object.keys(r.guesses).length) fail('Noch kein Team hat einen Punkt gesetzt.');
      r.open = false;
      r.showGuesses = true;
      log(db, ctx, 'ablauf', 'Alle Tipps auf der Karte gezeigt');
      effect(db, 'reveal');
    },

    revealTarget(db, ctx, game, st) {
      const r = current(st);
      if (!r.showGuesses) fail('Zuerst die Tipps der Teams zeigen.');
      if (r.showTarget) fail('Der Zielort ist bereits enthüllt.');
      const task = game.content.tasks[st.taskIndex];
      const d = distances(game, task, r);
      r.showTarget = true;
      const c = countryOf(game, task);
      if (c) {
        // Ganzes Land: jedes Team mit Treffer bekommt den Punkt.
        bookWinners(db, ctx, game, st, r, d.filter((x) => x.hit).map((x) => x.teamId), '');
        log(db, ctx, 'ablauf', `Land enthüllt (${c.name}), im Land: ${r.winners.map((id) => teamName(db, id)).join(', ') || 'niemand'}`);
      } else {
        const awards = pointAwards(game, d, mapOf(game, task));
        bookWinners(db, ctx, game, st, r, Object.keys(awards), '', awards);
        log(db, ctx, 'ablauf', `Zielort enthüllt: ${r.winners.map((id) => `${teamName(db, id)} +${awards[id]}`).join(', ')}`);
      }
      effect(db, 'correct');
    },

    // Nachvollziehbare manuelle Korrektur bei Karten- oder Geocodierungsfehlern.
    setWinner(db, ctx, game, st, p) {
      const r = current(st);
      if (!r.showTarget) fail('Erst den Zielort enthüllen.');
      if (!teamIds(db).includes(p.teamId)) fail('Team nicht gefunden.');
      bookWinners(db, ctx, game, st, r, [p.teamId], ', manuell korrigiert');
      log(db, ctx, 'bewertung', `Korrektur: Punkt geht an ${teamName(db, p.teamId)}`);
    },

    // Ganzes Land: einzelnes Team nachträglich als Treffer zählen bzw. herausnehmen.
    toggleWinner(db, ctx, game, st, p) {
      const r = current(st);
      if (!r.showTarget) fail('Erst das Land enthüllen.');
      if (!teamIds(db).includes(p.teamId)) fail('Team nicht gefunden.');
      const has = r.winners.includes(p.teamId);
      const next = has ? r.winners.filter((id) => id !== p.teamId) : [...r.winners, p.teamId];
      bookWinners(db, ctx, game, st, r, next, ', manuell korrigiert');
      log(db, ctx, 'bewertung', `Korrektur: ${teamName(db, p.teamId)} ${has ? 'bekommt keinen Punkt' : 'bekommt den Punkt'}`);
    },
  },

  teamView(db, game, st, teamId) {
    if (st.taskIndex < 0) return { map: game.content.map, taskIndex: -1 };
    const r = round(st, st.taskIndex);
    const own = r.guesses[teamId];
    return { ...publicView(db, game, st), own: own ? { lat: own.lat, lng: own.lng } : null };
  },

  beamerView(db, game, st) {
    if (st.taskIndex < 0) return { waiting: true, map: game.content.map };
    return publicView(db, game, st);
  },
};
