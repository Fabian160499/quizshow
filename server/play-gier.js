'use strict';

// Spiel „Riskier die Gier“: Schätzfragen mit eigenem, fiktivem Guthaben.
// Jedes Team startet mit 100 Gier-Punkten (getrennt vom Show-Punktestand).
// Alle Teams tippen gleichzeitig eine Zahl ein (Keypad), Standard 60 Sekunden.
// Danach kann die Moderation eine Nachfrist von 10 Sekunden freigeben – nur für
// Teams, die noch nicht abgegeben haben. Abgerechnet wird die Abweichung
// |Schätzung − Lösung|, sie wird vom Guthaben abgezogen. Genau richtig geschätzt:
// +5 Leben (EXACT_BONUS). Bei 0 oder darunter
// scheidet das Team aus. Jedes Team muss antworten (ausgewertet wird erst, wenn
// alle abgegeben haben; die Nachfrist kann dafür erneut freigegeben werden).
// Ausgeschiedene Teams dürfen aus Spaß weiter tippen (außer Wertung, ohne Einfluss).
// Platzierung → Showpunkte 10 / 6 / 4 / 3 / 2 / 1 (letztes verbleibendes Team
// zuerst), automatisch in der Reihenfolge des Ausscheidens gebucht. Mehrere Ausscheidungen in derselben Runde: das Restguthaben
// entscheidet (stärker negativ = schlechter); gleiches Guthaben teilt sich die
// Platzpunkte, der nächste Platz wird übersprungen.

const { fail, log, effect, teamName, teamIds, bookTarget } = require('./core');
const { pv } = require('./scoring');

const START = 100;
const GRACE_MS = 10000;
const EXACT_BONUS = 5; // genau die richtige Zahl: 5 Leben dazu
const PLACE_POINTS = [10, 6, 4, 3, 2, 1];
const MAX_VALUE = 1e12;

function round(st, i) {
  if (!st.rounds[i]) st.rounds[i] = { open: false, endsAt: null, graceEndsAt: null, answers: {}, evaluated: false, results: null };
  return st.rounds[i];
}
function current(st) {
  if (st.index < 0) fail('Es läuft gerade keine Frage.');
  return round(st, st.index);
}
function ensureTeams(db, st) {
  for (const id of teamIds(db)) if (!st.teams[id]) st.teams[id] = { balance: START, outRound: null, outOrder: null };
}
const active = (db, st) => teamIds(db).filter((id) => st.teams[id] && st.teams[id].outRound === null);

// Darf das Team gerade eine Zahl abgeben?
function canAnswer(st, r, teamId, now) {
  if (!r.open || r.evaluated) return false;
  if (r.answers[teamId] !== undefined) return false;
  if (!st.teams[teamId]) return false; // auch Ausgeschiedene dürfen (außer Wertung) tippen
  if (now <= r.endsAt) return true;
  return r.graceEndsAt !== null && now <= r.graceEndsAt;
}

// Endstand: verbleibende Teams nach Guthaben, dann Ausgeschiedene (später = besser,
// in derselben Runde nach Restguthaben). Gleiches Guthaben in derselben Gruppe = gleicher Platz.
function standings(db, st, game = null) {
  const ids = teamIds(db).filter((id) => st.teams[id]);
  const key = (id) => {
    const t = st.teams[id];
    return t.outRound === null ? [1, Infinity, 1, t.balance] : [0, t.outRound, 1, t.balance];
  };
  const sorted = ids.slice().sort((a, b) => {
    const ka = key(a), kb = key(b);
    for (let i = 0; i < 4; i++) if (ka[i] !== kb[i]) return kb[i] - ka[i];
    return 0;
  });
  const out = [];
  sorted.forEach((id, i) => {
    const prev = out[i - 1];
    const same = prev && key(prev.teamId).every((v, j) => v === key(id)[j]);
    const place = same ? prev.place : i + 1;
    out.push({ teamId: id, place, balance: st.teams[id].balance, out: st.teams[id].outRound !== null, outRound: st.teams[id].outRound });
  });
  const placePts = (pl) => (game ? (pl <= 6 ? pv(game, `place${pl}`) : pv(game, 'place6')) : PLACE_POINTS[pl - 1] ?? 1);
  return out.map((x) => ({ ...x, points: placePts(x.place) }));
}
// Showpunkte automatisch nach Reihenfolge des Ausscheidens: Wer ausscheidet, hat
// seinen Platz sicher (hinter allen, die noch dabei sind) und bekommt die Punkte
// sofort; ist das Spiel entschieden, bekommen auch die Übrigen ihre Platzpunkte.
function bookPlaces(db, ctx, game, st) {
  const done = finished(db, game, st);
  for (const s of standings(db, st, game)) {
    if (!s.out && !done) continue;
    bookTarget(db, ctx, `gier:${game.id}:${s.teamId}`, s.teamId, s.points, `${game.title}, Platz ${s.place}`);
  }
  if (done && !st.awarded) { st.awarded = true; log(db, ctx, 'ablauf', 'Gier: Spiel entschieden – Platzierungspunkte vergeben'); }
}
const finished = (db, game, st) => active(db, st).length <= 1 || game.content.questions.every((_, i) => st.rounds[i] && st.rounds[i].evaluated);

module.exports = {
  init: () => ({ index: -1, rounds: {}, teams: {}, awarded: false }),
  standings,
  PLACE_POINTS,

  team: {
    answer(db, ctx, game, st, p) {
      const r = current(st);
      ensureTeams(db, st);
      if (r.answers[ctx.teamId] !== undefined) fail('Eure Antwort ist schon abgegeben.');
      if (!canAnswer(st, r, ctx.teamId, ctx.now)) fail(r.endsAt && ctx.now > r.endsAt ? 'Die Zeit ist abgelaufen.' : 'Die Frage ist nicht offen.');
      const v = Number(p.value);
      if (!Number.isFinite(v) || v < 0 || v > MAX_VALUE || String(p.value).trim() === '') fail('Bitte eine Zahl eingeben.');
      const fun = st.teams[ctx.teamId].outRound !== null;
      r.answers[ctx.teamId] = { value: v, at: ctx.now, grace: ctx.now > r.endsAt, ...(fun ? { fun: true } : {}) };
      log(db, ctx, 'antwort', `${teamName(db, ctx.teamId)} hat geschätzt${fun ? ' (außer Wertung)' : ''}`);
    },
  },

  mod: {
    open(db, ctx, game, st, p) {
      const i = Number(p.index);
      const q = game.content.questions[i];
      if (!q) fail('Frage nicht gefunden.');
      if (q.answer === null || q.answer === undefined || q.answer === '') fail('Für diese Frage ist keine Lösung hinterlegt.');
      ensureTeams(db, st);
      if (finished(db, game, st) && !(st.rounds[i] && st.rounds[i].evaluated)) fail('Das Spiel ist schon entschieden – höchstens ein Team ist noch dabei.');
      if (st.index >= 0 && st.index !== i && !round(st, st.index).evaluated) fail('Erst die laufende Frage auswerten.');
      st.index = i;
      const r = round(st, i);
      if (!r.evaluated && !r.open) {
        r.open = true;
        const secs = Number(game.content.seconds) > 0 ? Number(game.content.seconds) : 60;
        r.endsAt = ctx.now + secs * 1000;
        log(db, ctx, 'ablauf', `Gier: Frage ${i + 1} offen (${secs} s)`);
      }
    },
    grace(db, ctx, game, st) {
      const r = current(st);
      if (r.evaluated) fail('Schon ausgewertet.');
      if (ctx.now <= r.endsAt) fail('Die Antwortzeit läuft noch.');
      if (r.graceEndsAt !== null && ctx.now <= r.graceEndsAt) fail('Die Nachfrist läuft noch.');
      // Jedes Team muss antworten: die Nachfrist darf bei Bedarf erneut freigegeben werden.
      r.graceEndsAt = ctx.now + GRACE_MS;
      log(db, ctx, 'ablauf', 'Gier: 10 Sekunden Nachfrist freigegeben');
    },
    evaluate(db, ctx, game, st) {
      const r = current(st);
      if (r.evaluated) fail('Schon ausgewertet.');
      const act = active(db, st);
      const missing = act.filter((id) => r.answers[id] === undefined);
      if (missing.length) fail(`Jedes Team muss antworten – es fehlt noch: ${missing.map((id) => teamName(db, id)).join(', ')}${ctx.now > (r.graceEndsAt ?? r.endsAt) ? ' (Nachfrist freigeben)' : ''}`);
      const answer = Number(game.content.questions[st.index].answer);
      const results = [];
      for (const id of act) {
        const t = st.teams[id];
        const a = r.answers[id];
        const before = t.balance;
        const diff = Math.abs(a.value - answer);
        const bonus = diff === 0 ? EXACT_BONUS : 0;
        t.balance = Math.round((before - diff + bonus) * 100) / 100;
        const out = t.balance <= 0;
        if (out) t.outRound = st.index;
        results.push({ teamId: id, value: a.value, diff, bonus, before, after: t.balance, out, missing: false });
      }
      // Ausgeschiedene, die aus Spaß getippt haben: nur zeigen, nichts verändern.
      for (const id of teamIds(db)) {
        const a = r.answers[id];
        if (!a || act.includes(id) || !st.teams[id]) continue;
        const bal = st.teams[id].balance;
        results.push({ teamId: id, value: a.value, diff: Math.abs(a.value - answer), bonus: 0, before: bal, after: bal, out: false, missing: false, fun: true });
      }
      r.results = results;
      r.open = false;
      r.evaluated = true;
      log(db, ctx, 'ablauf', `Gier: Frage ${st.index + 1} ausgewertet (Lösung ${answer})`);
      bookPlaces(db, ctx, game, st);
      effect(db, 'reveal');
    },
  },

  wakeAt(db, game, st, now) {
    if (st.index < 0) return null;
    const r = round(st, st.index);
    if (!r.open) return null;
    return [r.endsAt, r.graceEndsAt].filter((t) => t && t > now).sort((a, b) => a - b)[0] || null;
  },

  teamView(db, game, st, teamId, now = Date.now()) {
    ensureTeams(db, st);
    const me = st.teams[teamId];
    const base = { balance: me ? me.balance : START, out: !!me && me.outRound !== null, start: START };
    if (st.index < 0) return { waiting: true, ...base };
    const r = round(st, st.index);
    const q = game.content.questions[st.index];
    const own = r.answers[teamId];
    const res = r.results ? r.results.find((x) => x.teamId === teamId) : null;
    return {
      ...base,
      index: st.index,
      count: game.content.questions.length,
      question: q.question,
      unit: q.unit || '',
      canAnswer: canAnswer(st, r, teamId, now),
      endsAt: r.endsAt,
      graceEndsAt: r.graceEndsAt,
      answered: own !== undefined,
      value: own ? own.value : null,
      evaluated: r.evaluated,
      solution: r.evaluated ? Number(q.answer) : null,
      result: res,
      standings: standings(db, st, game).filter((s) => s.teamId === teamId && (s.out || st.awarded)),
    };
  },

  beamerView(db, game, st) {
    ensureTeams(db, st);
    const teams = teamIds(db).map((id) => ({ teamId: id, balance: st.teams[id].balance, out: st.teams[id].outRound !== null }));
    if (st.index < 0) return { waiting: true, teams, start: START };
    const r = round(st, st.index);
    const q = game.content.questions[st.index];
    return {
      index: st.index,
      count: game.content.questions.length,
      question: q.question,
      unit: q.unit || '',
      start: START,
      teams,
      open: r.open,
      endsAt: r.endsAt,
      graceEndsAt: r.graceEndsAt,
      answeredCount: active(db, st).filter((id) => r.answers[id] !== undefined).length,
      activeCount: active(db, st).length + (r.evaluated ? r.results.filter((x) => x.out).length : 0),
      evaluated: r.evaluated,
      solution: r.evaluated ? Number(q.answer) : null,
      results: r.evaluated ? r.results : null,
      standings: st.awarded ? standings(db, st, game) : null,
      // Showpunkte der schon ausgeschiedenen Teams (stehen fest).
      placed: standings(db, st, game).filter((x) => x.out || st.awarded).map((x) => ({ teamId: x.teamId, place: x.place, points: x.points })),
    };
  },
};
