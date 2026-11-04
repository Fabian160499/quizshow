'use strict';

// Spiel „Wer nix werd, werd Nerd“: geheime Gebote, wie viele gültige Antworten
// ein Team nennen kann. Das höchste Gebot spielt (3 Fehler erlaubt bis zum
// Scheitern), danach höchstens das zweithöchste Team (2. Fehler = Scheitern).

const { fail, log, effect, teamName, teamIds, bookTarget, cleanText, cleanInk, randomInt } = require('./core');
const { pv } = require('./scoring');

const MAX_BID = 99;
const TIE_SECOND = /^Gleich hohes Gebot gilt als zweithöchstes/;

function round(st, c) {
  if (!st.rounds[c]) st.rounds[c] = { phase: 'bidding', bids: {}, choose: null, first: null, second: null, attempt: null, results: [] };
  return st.rounds[c];
}

function current(st) {
  if (st.catIndex < 0) fail('Es läuft gerade keine Kategorie.');
  return round(st, st.catIndex);
}

// Gültige Antworten: eine pro Zeile, Varianten mit „/“ getrennt.
function validAnswers(cat) {
  return cat.answers.split('\n').map((l) => l.trim()).filter(Boolean)
    .map((line) => ({ label: line, forms: line.split('/').map((x) => x.trim().toLowerCase()).filter(Boolean) }));
}

function highestTeams(bids, exclude = []) {
  const entries = Object.entries(bids).filter(([id]) => !exclude.includes(id));
  if (!entries.length) return [];
  const max = Math.max(...entries.map(([, b]) => b));
  return entries.filter(([, b]) => b === max).map(([id]) => id);
}

function startAttempt(db, ctx, r, which, teamId) {
  const target = which === 'first' ? r.bids[teamId] : r.first.bid;
  r[which] = { teamId, bid: r.bids[teamId] };
  // Der zweite Versuch übernimmt die richtigen Antworten des ersten Teams und füllt nur noch auf.
  const kept = which === 'second' && r.attempt ? r.attempt.given.filter((g) => g.ok).map((g) => ({ text: g.text, ok: true, kept: true })) : [];
  r.attempt = { which, teamId, target, maxErrors: which === 'first' ? 3 : 2, given: kept, correct: kept.length, errors: 0, done: null };
  r.phase = which;
  r.choose = null;
  log(db, ctx, 'ablauf', `${teamName(db, teamId)} versucht ${target} Antworten (${which === 'first' ? 'erster' : 'zweiter'} Versuch)`);
}

// Gleichstand um den ersten Versuch: Die Teams wählen auf dem iPad „Starten“ oder
// „Nachziehen“. Wählt genau ein Team „Starten“, beginnt es. Sonst entscheidet ein
// animierter Münzwurf auf dem Beamer (Seiten mit Name und Farbe der Teams).
// Wer nachzieht, bekommt – falls nötig – den zweiten Versuch.
function settleTie(db, ctx, r) {
  const ids = r.choose.teamIds;
  const prefs = r.choose.prefs || {};
  if (!ids.every((id) => prefs[id])) return;
  const starters = ids.filter((id) => prefs[id] === 'start');
  const pool = starters.length === 1 ? starters : starters.length ? starters : ids;
  if (pool.length === 1) {
    r.follow = ids.filter((id) => id !== pool[0]);
    log(db, ctx, 'gebot', `Gleichstand: ${teamName(db, pool[0])} startet, ${r.follow.map((id) => teamName(db, id)).join(', ')} zieht nach`);
    startAttempt(db, ctx, r, 'first', pool[0]);
    return;
  }
  const winner = pool[randomInt(pool.length)];
  r.coin = { teams: pool, winner, done: false };
  log(db, ctx, 'gebot', `Gleichstand: gleiche Wahl – Münzwurf zwischen ${pool.map((id) => teamName(db, id)).join(', ')}`);
  effect(db, 'coin');
}

function startSecond(db, ctx, game, r) {
  // Team, das beim Gleichstand „Nachziehen“ gewählt hat (bzw. die Münze verloren hat).
  const follow = (r.follow || []).filter((id) => id !== r.first.teamId);
  if (follow.length === 1) { startAttempt(db, ctx, r, 'second', follow[0]); return; }
  const tieAsSecond = TIE_SECOND.test(game.content.tieRule);
  // Gleich hohe Höchstgebote zählen nur bei entsprechender Regel als zweithöchstes Team.
  const exclude = [r.first.teamId, ...(tieAsSecond ? [] : Object.keys(r.bids).filter((id) => r.bids[id] === r.first.bid))];
  const candidates = highestTeams(r.bids, exclude);
  if (!candidates.length) {
    r.phase = 'done';
    log(db, ctx, 'ablauf', 'Kein zweithöchstes Gebot, Kategorie beendet');
    return;
  }
  if (candidates.length > 1) {
    r.phase = 'choose';
    r.choose = { which: 'second', teamIds: candidates };
    log(db, ctx, 'ablauf', `Gleichstand um den zweiten Versuch: ${candidates.map((id) => teamName(db, id)).join(', ')}`);
    return;
  }
  startAttempt(db, ctx, r, 'second', candidates[0]);
}

function finishAttempt(db, ctx, game, st, r, success) {
  const a = r.attempt;
  a.done = success ? 'success' : 'fail';
  let points;
  if (a.which === 'first') points = success ? a.target : -a.target;
  else points = success ? a.target : -Math.min(pv(game, 'maxPenalty'), r.second.bid);
  bookTarget(db, ctx, `nerd:${game.id}:${st.catIndex}:${a.teamId}`, a.teamId, points,
    `${game.title}, Kategorie ${st.catIndex + 1}, ${a.which === 'first' ? 'erster' : 'zweiter'} Versuch ${success ? 'geschafft' : 'gescheitert'}`);
  r.results.push({ teamId: a.teamId, which: a.which, success, points });
  effect(db, success ? 'correct' : 'wrong');
  if (success || a.which === 'second') r.phase = 'done';
  else startSecond(db, ctx, game, r);
}

function attemptView(r) {
  if (!r.attempt) return null;
  const a = r.attempt;
  return { which: a.which, teamId: a.teamId, target: a.target, maxErrors: a.maxErrors, correct: a.correct, errors: a.errors, done: a.done, named: a.given.filter((g) => g.ok).map((g) => g.text), kept: a.given.filter((g) => g.kept).length };
}

function publicRound(db, game, st, r) {
  const cat = game.content.categories[st.catIndex];
  return {
    catIndex: st.catIndex,
    count: game.content.categories.length,
    finale: st.catIndex === game.content.categories.length - 1,
    category: cat.name,
    possible: validAnswers(cat).length,
    phase: r.phase,
    bidCount: Object.keys(r.bids).length,
    teamCount: db.project.teams.length,
    bids: r.phase === 'bidding' ? null : Object.entries(r.bids).map(([teamId, bid]) => ({ teamId, bid })).sort((x, y) => y.bid - x.bid),
    // Wer schon gewählt hat (nicht was), damit niemand nachziehen kann.
    choose: r.choose ? { which: r.choose.which, teamIds: r.choose.teamIds, picked: Object.keys(r.choose.prefs || {}) } : null,
    coin: r.coin ? { teams: r.coin.teams, winner: r.coin.winner, done: r.coin.done } : null,
    attempt: attemptView(r),
    results: r.results,
  };
}

module.exports = {
  init: () => ({ catIndex: -1, rounds: {} }),
  validAnswers,

  team: {
    bid(db, ctx, game, st, p) {
      const r = current(st);
      if (r.phase !== 'bidding') fail('Die Gebote sind bereits aufgedeckt.');
      if (r.bids[ctx.teamId] !== undefined) fail('Euer Gebot ist bereits gesperrt.');
      const n = Number(p.bid);
      if (!Number.isInteger(n) || n < 1 || n > MAX_BID) fail(`Bitte eine ganze Zahl von 1 bis ${MAX_BID} bieten.`);
      r.bids[ctx.teamId] = n;
      log(db, ctx, 'gebot', `${teamName(db, ctx.teamId)} hat geboten`);
    },
    // Notizen (Apple Pencil) während der Gebotsphase – nur für das eigene Team
    // sichtbar; danach als Hilfe beim Antworten, aber nicht mehr änderbar.
    // Gleichstand: „Starten“ oder „Nachziehen“ wählen (verbindlich).
    tiePick(db, ctx, game, st, p) {
      const r = current(st);
      if (r.phase !== 'choose' || r.choose.which !== 'first' || !r.choose.teamIds.includes(ctx.teamId)) fail('Gerade gibt es nichts zu wählen.');
      if (r.coin) fail('Der Münzwurf läuft schon.');
      r.choose.prefs = r.choose.prefs || {};
      if (r.choose.prefs[ctx.teamId]) fail('Eure Wahl ist schon abgegeben.');
      if (!['start', 'follow'].includes(p.pref)) fail('Bitte „Starten“ oder „Nachziehen“ wählen.');
      r.choose.prefs[ctx.teamId] = p.pref;
      log(db, ctx, 'gebot', `${teamName(db, ctx.teamId)} wählt ${p.pref === 'start' ? '„Starten“' : '„Nachziehen“'}`);
      settleTie(db, ctx, r);
    },
    notes(db, ctx, game, st, p) {
      const r = current(st);
      if (r.phase !== 'bidding') fail('Notizen sind nur während der Gebotsphase möglich.');
      if (!r.notes) r.notes = {};
      r.notes[ctx.teamId] = cleanInk(p.ink);
    },
  },

  mod: {
    open(db, ctx, game, st, p) {
      const c = Number(p.catIndex);
      if (!game.content.categories[c]) fail('Kategorie nicht gefunden.');
      if (st.catIndex >= 0 && st.catIndex !== c) {
        const prev = round(st, st.catIndex);
        if (prev.phase !== 'bidding' && prev.phase !== 'done') fail('Erst die laufende Kategorie beenden.');
      }
      st.catIndex = c;
      round(st, c);
      log(db, ctx, 'ablauf', `Kategorie ${c + 1} „${game.content.categories[c].name}“: geheime Gebote offen`);
    },

    revealBids(db, ctx, game, st, p) {
      const r = current(st);
      if (r.phase !== 'bidding') fail('Die Gebote sind bereits aufgedeckt.');
      if (!Object.keys(r.bids).length) fail('Noch kein Team hat geboten.');
      const missing = teamIds(db).filter((id) => r.bids[id] === undefined);
      if (missing.length && !p.force) fail(`Noch kein Gebot von: ${missing.map((id) => teamName(db, id)).join(', ')}`);
      const top = highestTeams(r.bids);
      log(db, ctx, 'gebot', `Gebote aufgedeckt: ${Object.entries(r.bids).map(([id, b]) => `${teamName(db, id)} ${b}`).join(', ')}`);
      effect(db, 'reveal');
      if (top.length > 1) {
        // Gleichstand: die Teams wählen „Starten“ oder „Nachziehen“ (sonst Münzwurf).
        r.phase = 'choose';
        r.choose = { which: 'first', teamIds: top, prefs: {} };
        return;
      }
      startAttempt(db, ctx, r, 'first', top[0]);
    },

    // Protokollierter Stichentscheid bei gleich hohen Geboten.
    choose(db, ctx, game, st, p) {
      const r = current(st);
      if (r.phase !== 'choose' || !r.choose.teamIds.includes(p.teamId)) fail('Bitte ein Team aus dem Gleichstand wählen.');
      log(db, ctx, 'gebot', `Stichentscheid: ${teamName(db, p.teamId)} bekommt den ${r.choose.which === 'first' ? 'ersten' : 'zweiten'} Versuch`);
      if (r.choose.which === 'first') r.follow = r.choose.teamIds.filter((id) => id !== p.teamId);
      r.coin = null;
      startAttempt(db, ctx, r, r.choose.which, p.teamId);
    },
    // Nach dem Münzwurf auf dem Beamer: Ergebnis übernehmen, das Gewinnerteam beginnt.
    coinDone(db, ctx, game, st) {
      const r = current(st);
      if (r.phase !== 'choose' || !r.coin || r.coin.done) fail('Gerade läuft kein Münzwurf.');
      r.coin.done = true;
      r.follow = r.choose.teamIds.filter((id) => id !== r.coin.winner);
      log(db, ctx, 'gebot', `Münzwurf: ${teamName(db, r.coin.winner)} beginnt`);
      startAttempt(db, ctx, r, 'first', r.coin.winner);
    },

    // Genannte Antwort werten: gültige, neue Antwort zählt, alles andere ist ein Fehler.
    mark(db, ctx, game, st, p) {
      const r = current(st);
      const a = r.attempt;
      if (!a || a.done || r.phase !== a.which) fail('Gerade läuft kein Versuch.');
      let ok = false;
      let text = '';
      if (p.answer !== undefined) {
        const valid = validAnswers(game.content.categories[st.catIndex]);
        const hit = valid.find((v) => v.label === p.answer);
        if (!hit) fail('Unbekannte Antwort.');
        text = hit.label;
        ok = !a.given.some((g) => g.ok && g.text === text);
      } else {
        text = cleanText(p.text || 'Fehler', 120) || 'Fehler';
      }
      a.given.push({ text, ok, duplicate: !ok && p.answer !== undefined });
      if (ok) a.correct += 1;
      else a.errors += 1;
      log(db, ctx, 'bewertung', `${teamName(db, a.teamId)}: ${text} ${ok ? '✓' : '✗'}`);
      if (a.correct >= a.target) finishAttempt(db, ctx, game, st, r, true);
      else if (a.errors >= a.maxErrors) finishAttempt(db, ctx, game, st, r, false);
      else effect(db, ok ? 'correct' : 'wrong');
    },

    // Letzte Wertung des laufenden Versuchs zurücknehmen (Verklicken).
    unmark(db, ctx, game, st) {
      const r = current(st);
      const a = r.attempt;
      if (!a || a.done || !a.given.length || a.given[a.given.length - 1].kept) fail('Nichts zum Zurücknehmen.');
      const g = a.given.pop();
      if (g.ok) a.correct -= 1;
      else a.errors -= 1;
      log(db, ctx, 'bewertung', `Wertung „${g.text}“ zurückgenommen`);
    },
  },

  teamView(db, game, st, teamId) {
    if (st.catIndex < 0) return null;
    const r = round(st, st.catIndex);
    return {
      ...publicRound(db, game, st, r), ownBid: r.bids[teamId] ?? null, ownPref: r.choose && r.choose.prefs ? r.choose.prefs[teamId] || null : null, canBid: r.phase === 'bidding' && r.bids[teamId] === undefined, maxBid: MAX_BID,
      // Während der Gebotsphase nicht mitschicken (sonst würde das Schreibfeld bei jedem Speichern neu aufgebaut).
      notesInk: r.phase !== 'bidding' && r.notes ? r.notes[teamId] || null : null,
    };
  },

  beamerView(db, game, st) {
    if (st.catIndex < 0) return { waiting: true };
    return publicRound(db, game, st, round(st, st.catIndex));
  },
};
