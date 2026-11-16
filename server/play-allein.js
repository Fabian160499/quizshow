'use strict';

// Spiel „Wir sind ein Telepa-Team“: Eine klar abgegrenzte Kategorie mit einer begrenzten
// Zahl richtiger Antworten (z. B. „Bärenarten“, „Länder mit B“, „Bisherige
// Bundeskanzler“). Jedes Team gibt genau eine Antwort ab. Punkte gibt es nur für
// eine richtige Antwort, die kein anderes Team genannt hat – nennen zwei oder
// mehr Teams denselben Eintrag, gehen alle leer aus, auch wenn er richtig ist.
// Abgleich tolerant wie bei „Quizzen, wo man steht“ (Tippfehler, Artikel,
// Varianten mit „/“). Unsichere Treffer entscheidet die Moderation.

const { fail, log, effect, teamName, teamIds, bookTarget, cleanText } = require('./core');
const { pv } = require('./scoring');
const { matchEntry } = require('./match');

// Lösungsliste aus dem Editor: eine Zeile pro richtiger Antwort, Varianten mit „/“.
function parseList(text) {
  return String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 500)
    .map((l, i) => {
      const variants = l.split('/').map((v) => v.trim()).filter(Boolean);
      return { key: i + 1, name: variants[0] || l, variants };
    });
}

function round(st, i) {
  if (!st.rounds[i]) st.rounds[i] = { open: false, closed: false, answers: {}, evaluated: false, showList: false };
  return st.rounds[i];
}
function current(st) {
  if (st.index < 0) fail('Es läuft gerade keine Kategorie.');
  return round(st, st.index);
}

// Ergebnis je Team: richtig + allein = Punkte, richtig + doppelt = 0, falsch = 0.
function results(r, game) {
  const count = {};
  for (const a of Object.values(r.answers)) if (a.entry) count[a.entry] = (count[a.entry] || 0) + 1;
  const out = {};
  for (const [teamId, a] of Object.entries(r.answers)) {
    const status = !a.entry ? 'wrong' : count[a.entry] > 1 ? 'double' : 'alone';
    out[teamId] = { status, entry: a.entry, shared: a.entry ? count[a.entry] : 0, points: status === 'alone' ? pv(game, 'correct') : 0 };
  }
  return out;
}

module.exports = {
  init: () => ({ index: -1, rounds: {} }),
  parseList,
  results,

  team: {
    submit(db, ctx, game, st, p) {
      const r = current(st);
      if (!r.open || r.closed) fail('Die Abgabe ist geschlossen.');
      if (r.answers[ctx.teamId]) fail('Ihr habt schon abgegeben.');
      const text = cleanText(p.text || '', 120);
      if (!text) fail('Bitte eine Antwort eingeben.');
      const list = parseList(game.content.rounds[st.index].entries);
      const m = matchEntry(text, list);
      r.answers[ctx.teamId] = { text, at: ctx.now, entry: m.sure ?? null, suggest: m.sure ? null : m.suggest ?? null, status: m.sure ? 'auto' : m.suggest ? 'pending' : 'none' };
      log(db, ctx, 'antwort', `${teamName(db, ctx.teamId)}: „${text}“`);
    },
  },

  mod: {
    open(db, ctx, game, st, p) {
      const i = Number(p.index);
      const rd = game.content.rounds[i];
      if (!rd) fail('Kategorie nicht gefunden.');
      if (parseList(rd.entries).length < 2) fail('Für diese Kategorie fehlt die Liste der richtigen Antworten.');
      if (st.index >= 0 && st.index !== i) round(st, st.index).open = false;
      st.index = i;
      const r = round(st, i);
      if (!r.evaluated) r.open = true;
      log(db, ctx, 'ablauf', `Wir sind ein Telepa-Team: Kategorie ${i + 1} offen`);
    },
    close(db, ctx, game, st) {
      current(st).closed = true;
      log(db, ctx, 'ablauf', `Wir sind ein Telepa-Team: Abgabe von Kategorie ${st.index + 1} geschlossen`);
    },
    // Treffer setzen/korrigieren: { teamId, entry: Nummer in der Liste | null (falsch) }
    setEntry(db, ctx, game, st, p) {
      const r = current(st);
      const a = r.answers[p.teamId];
      if (!a) fail('Dieses Team hat nicht abgegeben.');
      const list = parseList(game.content.rounds[st.index].entries);
      const e = p.entry === null || p.entry === '' || p.entry === undefined ? null : Number(p.entry);
      if (e !== null && !list.some((x) => x.key === e)) fail('Diesen Eintrag gibt es nicht.');
      a.entry = e;
      a.status = 'manual';
      a.suggest = null;
      log(db, ctx, 'bewertung', `Wir sind ein Telepa-Team: ${teamName(db, p.teamId)} → ${e ? list[e - 1].name : 'falsch'} (manuell)`);
      // Nach der Auswertung: Punkte aller Teams neu berechnen (Doppelte können sich ändern).
      if (r.evaluated) {
        for (const [teamId, x] of Object.entries(results(r, game))) bookTarget(db, ctx, `allein:${game.id}:${st.index}:${teamId}`, teamId, x.points, `${game.title}, Kategorie ${st.index + 1} (Korrektur)`);
      }
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
      for (const [teamId, x] of Object.entries(results(r, game))) {
        bookTarget(db, ctx, `allein:${game.id}:${st.index}:${teamId}`, teamId, x.points, `${game.title}, Kategorie ${st.index + 1}`);
      }
      log(db, ctx, 'ablauf', `Wir sind ein Telepa-Team: Kategorie ${st.index + 1} ausgewertet`);
      effect(db, 'show'); // alle zugleich aufgelöst: kein Richtig-/Falsch-Ton
    },
    // Alle richtigen Antworten auf dem Beamer zeigen (genannte hervorgehoben).
    showList(db, ctx, game, st, p) {
      const r = current(st);
      if (!r.evaluated) fail('Erst auswerten.');
      r.showList = p.show !== false;
    },
  },

  teamView(db, game, st, teamId) {
    if (st.index < 0) return null;
    const r = round(st, st.index);
    const rd = game.content.rounds[st.index];
    const a = r.answers[teamId];
    const list = parseList(rd.entries);
    const res = r.evaluated && a ? results(r, game)[teamId] : null;
    return {
      index: st.index,
      count: game.content.rounds.length,
      category: rd.category,
      total: list.length,
      open: r.open && !r.closed,
      submitted: !!a,
      text: a ? a.text : null,
      evaluated: r.evaluated,
      status: res ? res.status : null,
      shared: res ? res.shared : null,
      points: res ? res.points : null,
      entry: res && res.entry ? list[res.entry - 1].name : null,
    };
  },

  beamerView(db, game, st) {
    if (st.index < 0) return { waiting: true };
    const r = round(st, st.index);
    const rd = game.content.rounds[st.index];
    const list = parseList(rd.entries);
    const res = r.evaluated ? results(r, game) : null;
    return {
      index: st.index,
      category: rd.category,
      total: list.length,
      teamIds: db.project.teams.map((t) => t.id),
      submitted: Object.keys(r.answers),
      evaluated: r.evaluated,
      results: res ? Object.entries(r.answers).map(([teamId, a]) => ({ ...res[teamId], teamId, text: a.text, entry: a.entry ? list[a.entry - 1].name : null, key: a.entry })) : [],
      list: r.evaluated && r.showList ? list.map((e) => ({ name: e.name, named: Object.values(r.answers).filter((a) => a.entry === e.key).length })) : null,
    };
  },
};
