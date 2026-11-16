'use strict';

// Spiel „Quizzen, wo man steht“: Ranglisten-Spiel mit Top-100-Listen. Pro Runde
// gibt jedes Team genau einen Eintrag ab. Das System gleicht ihn tolerant mit der
// Liste ab (Groß-/Kleinschreibung, Satzzeichen, Bindestriche, Tippfehler,
// fehlende Anfangsartikel, im Editor hinterlegte Varianten/Abkürzungen).
// Unsichere Treffer werden nur vorgeschlagen – die Moderation entscheidet.
// Wertung: Rang 1–20 = 1 Punkt, 21–40 = 2, 41–60 = 3, 61–80 = 4, 81–100 = 5,
// nicht in der Liste = 0.

const { fail, log, effect, teamName, teamIds, bookTarget, cleanText } = require('./core');
const { pv } = require('./scoring');
const { matchEntry } = require('./match');

const pointsFor = (rank, game = null) => (rank >= 1 && rank <= 100 ? (game ? pv(game, `group${Math.ceil(rank / 20)}`) : Math.ceil(rank / 20)) : 0);

// Liste aus dem Editor: eine Zeile pro Rang (Zeile 1 = Rang 1), Varianten mit „/“.
// Ein vorangestelltes „12.“ oder „12)“ wird ignoriert.
function parseList(text) {
  return String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 100)
    .map((l, i) => {
      const name = l.replace(/^\d{1,3}\s*[.):-]\s*/, '');
      const variants = name.split('/').map((v) => v.trim()).filter(Boolean);
      return { rank: i + 1, name: variants[0] || name, variants };
    });
}

function round(st, i) {
  if (!st.rounds[i]) st.rounds[i] = { open: false, closed: false, answers: {}, evaluated: false };
  return st.rounds[i];
}
function current(st) {
  if (st.index < 0) fail('Es läuft gerade keine Runde.');
  return round(st, st.index);
}

module.exports = {
  init: () => ({ index: -1, rounds: {} }),
  pointsFor,
  parseList,

  team: {
    submit(db, ctx, game, st, p) {
      const r = current(st);
      if (!r.open || r.closed) fail('Die Abgabe ist geschlossen.');
      if (r.answers[ctx.teamId]) fail('Ihr habt schon abgegeben.');
      const text = cleanText(p.text || '', 120);
      if (!text) fail('Bitte einen Eintrag eingeben.');
      const list = parseList(game.content.rounds[st.index].entries);
      const m = matchEntry(text, list.map((e) => ({ key: e.rank, variants: e.variants })));
      // sure → sofort gültig; suggest → Moderation bestätigt; sonst nicht gefunden (0, korrigierbar)
      r.answers[ctx.teamId] = { text, at: ctx.now, rank: m.sure ?? null, suggest: m.sure ? null : m.suggest ?? null, status: m.sure ? 'auto' : m.suggest ? 'pending' : 'none' };
      log(db, ctx, 'antwort', `${teamName(db, ctx.teamId)}: „${text}“`);
    },
  },

  mod: {
    open(db, ctx, game, st, p) {
      const i = Number(p.index);
      const rd = game.content.rounds[i];
      if (!rd) fail('Runde nicht gefunden.');
      if (parseList(rd.entries).length < 100) fail(`Die Liste dieser Runde hat erst ${parseList(rd.entries).length} von 100 Einträgen.`);
      if (st.index >= 0 && st.index !== i) round(st, st.index).open = false;
      st.index = i;
      const r = round(st, i);
      if (!r.evaluated) r.open = true;
      log(db, ctx, 'ablauf', `Top 100: Runde ${i + 1} offen`);
    },
    close(db, ctx, game, st) {
      const r = current(st);
      r.closed = true;
      log(db, ctx, 'ablauf', `Top 100: Abgabe von Runde ${st.index + 1} geschlossen`);
    },
    // Treffer setzen/korrigieren: { teamId, rank: 1–100 | null (nicht in der Liste) }
    setRank(db, ctx, game, st, p) {
      const r = current(st);
      const a = r.answers[p.teamId];
      if (!a) fail('Dieses Team hat nicht abgegeben.');
      const rank = p.rank === null || p.rank === '' || p.rank === undefined ? null : Number(p.rank);
      if (rank !== null && !(Number.isInteger(rank) && rank >= 1 && rank <= 100)) fail('Rang muss zwischen 1 und 100 liegen.');
      a.rank = rank;
      a.status = 'manual';
      a.suggest = null;
      log(db, ctx, 'bewertung', `Top 100: ${teamName(db, p.teamId)} → ${rank ? `Rang ${rank}` : 'nicht in der Liste'} (manuell)`);
      if (r.evaluated) bookTarget(db, ctx, `top100:${game.id}:${st.index}:${p.teamId}`, p.teamId, pointsFor(rank, game), `${game.title}, Runde ${st.index + 1} (Korrektur)`);
    },
    evaluate(db, ctx, game, st) {
      const r = current(st);
      if (r.evaluated) fail('Schon ausgewertet.');
      const all = teamIds(db).every((id) => r.answers[id]);
      if (!all && !r.closed) fail('Noch haben nicht alle Teams abgegeben – oder Abgabe schließen.');
      const pending = Object.entries(r.answers).filter(([, a]) => a.status === 'pending');
      if (pending.length) fail(`Bitte erst die unsicheren Treffer prüfen: ${pending.map(([id]) => teamName(db, id)).join(', ')}`);
      r.open = false;
      r.closed = true;
      r.evaluated = true;
      for (const [teamId, a] of Object.entries(r.answers)) {
        bookTarget(db, ctx, `top100:${game.id}:${st.index}:${teamId}`, teamId, pointsFor(a.rank, game), `${game.title}, Runde ${st.index + 1}`);
      }
      log(db, ctx, 'ablauf', `Top 100: Runde ${st.index + 1} ausgewertet`);
      effect(db, 'show'); // alle zugleich aufgelöst: kein Richtig-/Falsch-Ton
    },
  },

  teamView(db, game, st, teamId) {
    if (st.index < 0) return null;
    const r = round(st, st.index);
    const rd = game.content.rounds[st.index];
    const a = r.answers[teamId];
    return {
      index: st.index,
      count: game.content.rounds.length,
      category: rd.category,
      source: rd.source || '',
      period: rd.period || '',
      open: r.open && !r.closed,
      submitted: !!a,
      text: a ? a.text : null,
      evaluated: r.evaluated,
      rank: r.evaluated && a ? a.rank : null,
      points: r.evaluated && a ? pointsFor(a.rank, game) : null,
      entry: r.evaluated && a && a.rank ? parseList(rd.entries)[a.rank - 1].name : null,
    };
  },

  beamerView(db, game, st) {
    if (st.index < 0) return { waiting: true };
    const r = round(st, st.index);
    const rd = game.content.rounds[st.index];
    const list = parseList(rd.entries);
    return {
      index: st.index,
      category: rd.category,
      source: rd.source || '',
      period: rd.period || '',
      asOf: rd.asOf || '',
      scale: [1, 2, 3, 4, 5].map((n) => pv(game, `group${n}`)),
      submittedCount: Object.keys(r.answers).length,
      teamCount: db.project.teams.length,
      teamIds: db.project.teams.map((t) => t.id),
      submitted: Object.keys(r.answers),
      evaluated: r.evaluated,
      results: r.evaluated ? Object.entries(r.answers).map(([teamId, a]) => ({ teamId, text: a.text, rank: a.rank, entry: a.rank ? list[a.rank - 1].name : null, points: pointsFor(a.rank, game) }))
        .sort((x, y) => (y.rank || 0) - (x.rank || 0)) : [],
    };
  },
};
