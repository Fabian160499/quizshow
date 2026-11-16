'use strict';

// Spiel „Das geht mir zu weit“: Jedes Team wählt zwei verschiedene Einträge aus
// der Datenbank der Runde (Suchfeld mit Vorschlägen, keine Handschrift). Das
// System berechnet die Differenz; je nach Runde gewinnt die kleinste oder die
// größte. Bestes Ergebnis +2, schlechtestes −1. Einträge außerhalb der Grenzen
// der Runde sind ungültig und zählen als schlechtestes Ergebnis. Gleichstände
// entscheidet die Moderation (oder alle bekommen die Punkte, je nach Einstellung).

const { fail, log, effect, teamName, teamIds, bookTarget } = require('./core');
const { pv } = require('./scoring');
const { datasetByName, entriesFor, valueOf, difference } = require('./datasets');

const today = (now) => new Date(now).toISOString().slice(0, 10);

// Vergleich ohne Groß-/Kleinschreibung, Akzente und Satzzeichen; kleine Tippfehler erlaubt.
const norm = (s) => String(s || '').toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[b.length];
}
// Eingabe → Eintrag der Datenbank (genau, sonst eindeutig mit kleinem Tippfehler).
function resolve(entries, input) {
  const n = norm(input);
  if (!n) return null;
  const exact = entries.filter((e) => norm(e.name) === n);
  if (exact.length) return exact[0];
  const tol = 1; // nur ein vertippter Buchstabe – sonst lieber nachfragen
  const close = entries.map((e) => ({ e, d: lev(norm(e.name), n) })).filter((x) => x.d <= tol).sort((x, y) => x.d - y.d);
  if (close.length && (close.length === 1 || close[0].d < close[1].d)) return close[0].e;
  return null;
}

function setup(game, i, now) {
  const rd = game.content.rounds[i];
  const ds = datasetByName(rd.dataset);
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(rd.asOf || '') ? rd.asOf : today(now);
  return { rd, ds, asOf, entries: entriesFor(ds, rd.fixes) };
}

function inRange(rd, v) {
  if (v === null || v === undefined) return true;
  if (rd.min !== null && rd.min !== undefined && v <= rd.min) return false;
  if (rd.max !== null && rd.max !== undefined && v >= rd.max) return false;
  return true;
}

function round(st, i) {
  if (!st.rounds[i]) st.rounds[i] = { open: false, picks: {}, evaluated: false, results: null, tie: null, asOf: null };
  return st.rounds[i];
}

function current(st) {
  if (st.index < 0) fail('Es läuft gerade keine Runde.');
  return round(st, st.index);
}

// Ergebnisse berechnen und Rangfolge bilden (ungültige ans Ende).
function compute(game, st, r, now) {
  const { rd, ds, asOf } = setup(game, st.index, now);
  const all = entriesFor(ds, rd.fixes);
  const find = (n) => all.find((e) => e.name.toLowerCase() === n.toLowerCase());
  const smallest = rd.mode !== 'Größte Differenz';
  const rows = Object.entries(r.picks).map(([teamId, p]) => {
    const a = find(p.a);
    const b = find(p.b);
    const va = a ? valueOf(ds, a, asOf) : null;
    const vb = b ? valueOf(ds, b, asOf) : null;
    const valid = !!a && !!b && inRange(rd, va) && inRange(rd, vb);
    const diff = a && b ? difference(ds, a, b, asOf) : null;
    return { teamId, a: p.a, b: p.b, va, vb, diff: diff === null ? null : Math.round(diff * 100) / 100, valid };
  });
  const score = (x) => (x.valid ? (smallest ? x.diff : -x.diff) : Infinity);
  rows.sort((x, y) => score(x) - score(y));
  return { rows, asOf, smallest };
}

function book(db, ctx, game, st, r) {
  const rows = r.results.rows;
  const pts = Object.fromEntries(rows.map((x) => [x.teamId, 0]));
  for (const id of r.best) pts[id] += pv(game, 'best');
  for (const id of r.worst) pts[id] += pv(game, 'worst');
  for (const [teamId, p] of Object.entries(pts)) {
    bookTarget(db, ctx, `zuweit:${game.id}:${st.index}:${teamId}`, teamId, p, `${game.title}, Runde ${st.index + 1}`);
  }
}

const key = (x) => (x.valid ? x.diff : 'ungültig');

module.exports = {
  init: () => ({ index: -1, rounds: {} }),
  compute,

  team: {
    submit(db, ctx, game, st, p) {
      const r = current(st);
      if (!r.open) fail('Die Abgabe ist geschlossen.');
      if (r.picks[ctx.teamId]) fail('Ihr habt schon abgegeben.');
      const { entries } = setup(game, st.index, ctx.now);
      const a = resolve(entries, p.a);
      const b = resolve(entries, p.b);
      if (!a) fail(`„${String(p.a || '').slice(0, 60)}“ steht nicht in der Liste – bitte einen Vorschlag antippen.`);
      if (!b) fail(`„${String(p.b || '').slice(0, 60)}“ steht nicht in der Liste – bitte einen Vorschlag antippen.`);
      if (a.name === b.name) fail('Bitte zwei unterschiedliche Einträge wählen.');
      r.picks[ctx.teamId] = { a: a.name, b: b.name, at: ctx.now };
      log(db, ctx, 'antwort', `${teamName(db, ctx.teamId)} hat abgegeben`);
    },

    // Namensliste der Runde einmalig holen (nicht bei jeder Aktualisierung mitschicken –
    // die großen Listen haben die iPads ausgebremst).
    options(db, ctx, game, st) {
      const r = current(st);
      if (!r.open || r.picks[ctx.teamId]) return { data: [] };
      const { entries } = setup(game, st.index, ctx.now);
      return { data: entries.map((e) => e.name) };
    },
  },

  mod: {
    open(db, ctx, game, st, p) {
      const i = Number(p.index);
      if (!game.content.rounds[i]) fail('Runde nicht gefunden.');
      if (st.index >= 0 && st.index !== i) round(st, st.index).open = false;
      st.index = i;
      const r = round(st, i);
      if (!r.evaluated) r.open = true;
      log(db, ctx, 'ablauf', `Runde ${i + 1} offen`);
      effect(db, 'title');
    },

    evaluate(db, ctx, game, st, p) {
      const r = current(st);
      if (r.evaluated) fail('Schon ausgewertet.');
      if (!Object.keys(r.picks).length) fail('Noch hat kein Team abgegeben.');
      const missing = teamIds(db).filter((id) => !r.picks[id]);
      if (missing.length && !p.force) fail(`Noch keine Abgabe von: ${missing.map((id) => teamName(db, id)).join(', ')}`);
      r.open = false;
      r.results = compute(game, st, r, ctx.now);
      const rows = r.results.rows;
      const tieAll = game.content.rounds[st.index].tie !== 'Moderation entscheidet';
      const best = rows.filter((x) => key(x) === key(rows[0]) && x.valid);
      const worst = rows.filter((x) => key(x) === key(rows[rows.length - 1]));
      r.evaluated = true;
      if (rows.length < 2) {
        r.best = best.map((x) => x.teamId);
        r.worst = [];
      } else if (!tieAll && (best.length > 1 || (worst.length > 1 && worst.length < rows.length))) {
        // Gleichstand: die Moderation entscheidet, keine stille Rangfolge.
        r.tie = { best: best.length > 1 ? best.map((x) => x.teamId) : null, worst: worst.length > 1 ? worst.map((x) => x.teamId) : null };
        r.best = best.length > 1 ? null : best.map((x) => x.teamId);
        r.worst = worst.length > 1 ? null : worst.map((x) => x.teamId);
        log(db, ctx, 'ablauf', 'Gleichstand – die Moderation entscheidet');
        return { notice: 'Gleichstand – bitte entscheiden.' };
      } else {
        r.best = best.map((x) => x.teamId);
        r.worst = worst.length === rows.length ? [] : worst.map((x) => x.teamId);
      }
      book(db, ctx, game, st, r);
      log(db, ctx, 'ablauf', `Runde ${st.index + 1} ausgewertet`);
      effect(db, 'show'); // alle zugleich aufgelöst: kein Richtig-/Falsch-Ton
      return {};
    },

    // Gleichstand auflösen: welche Teams bekommen +2 bzw. −1.
    resolveTie(db, ctx, game, st, p) {
      const r = current(st);
      if (!r.tie) fail('Es gibt keinen offenen Gleichstand.');
      const pickFrom = (list, chosen) => (Array.isArray(chosen) ? chosen.filter((id) => list.includes(id)) : []);
      if (r.tie.best) {
        const chosen = pickFrom(r.tie.best, p.best);
        if (!chosen.length) fail('Bitte mindestens ein Team für +2 wählen.');
        r.best = chosen;
      }
      if (r.tie.worst) {
        const chosen = pickFrom(r.tie.worst, p.worst);
        if (!chosen.length) fail('Bitte mindestens ein Team für −1 wählen.');
        r.worst = chosen;
      }
      r.tie = null;
      book(db, ctx, game, st, r);
      log(db, ctx, 'ablauf', `Gleichstand entschieden: +2 ${r.best.map((id) => teamName(db, id)).join(', ')}; −1 ${r.worst.map((id) => teamName(db, id)).join(', ')}`);
      effect(db, 'show'); // alle zugleich aufgelöst: kein Richtig-/Falsch-Ton
    },
  },

  teamView(db, game, st, teamId, now = Date.now()) {
    if (st.index < 0) return null;
    const r = round(st, st.index);
    const { rd, ds, entries } = setup(game, st.index, now);
    const row = r.results && !r.tie ? r.results.rows.find((x) => x.teamId === teamId) : null;
    return {
      index: st.index,
      count: game.content.rounds.length,
      task: rd.task,
      dataset: ds.name,
      mode: rd.mode,
      // Die Namensliste holt das iPad einmal per „play.options“ (Schlüssel ändert sich je Runde).
      optionsKey: r.open && !r.picks[teamId] ? `${game.id}:${st.index}:${entries.length}` : null,
      optionCount: entries.length,
      open: r.open,
      pick: r.picks[teamId] ? { a: r.picks[teamId].a, b: r.picks[teamId].b } : null,
      evaluated: r.evaluated && !r.tie,
      result: row ? { ...row, best: (r.best || []).includes(teamId), worst: (r.worst || []).includes(teamId) } : null,
      unit: ds.unit,
    };
  },

  beamerView(db, game, st) {
    if (st.index < 0) return { waiting: true };
    const r = round(st, st.index);
    const { rd, ds } = setup(game, st.index, Date.now());
    const done = r.evaluated && !r.tie;
    return {
      index: st.index,
      task: rd.task,
      dataset: ds.name,
      mode: rd.mode,
      unit: ds.unit,
      kind: ds.kind,
      source: ds.source,
      asOfData: ds.asOf,
      method: ds.method,
      submittedCount: Object.keys(r.picks).length,
      teamCount: db.project.teams.length,
      evaluated: done,
      rows: done ? r.results.rows.map((x) => ({ ...x, best: r.best.includes(x.teamId), worst: r.worst.includes(x.teamId) })) : [],
      asOf: done ? r.results.asOf : null,
    };
  },
};
