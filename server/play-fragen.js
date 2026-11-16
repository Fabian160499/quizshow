'use strict';

// Spiel „Habt ihr noch Fragen?“: Zur Kategorie schreibt jedes Team eine
// allgemeingültige Frage samt richtiger Antwort (zwei Schreibfelder) und schickt
// beides per Buzzer ab – andere Teams bleiben frei. Die Moderation prüft in
// Buzzer-Reihenfolge, lehnt unzulässige Vorschläge ab und gibt eine Frage frei.
// Auf dem Beamer erscheint nur die Frage. Die anderen Teams haben 20 Sekunden.
// Mindestens ein Team richtig: jedes richtige Team +1, fragendes Team −1.
// Niemand richtig: fragendes Team +2.

const { fail, log, effect, teamName, teamIds, bookTarget, cleanInk } = require('./core');
const { pv } = require('./scoring');

function secondsOf(game) {
  const n = Number(game.content.seconds);
  return Number.isFinite(n) && n >= 5 ? n : 20;
}

function round(st, c) {
  if (!st.rounds[c]) st.rounds[c] = { open: false, subs: [], accepted: null, published: false, deadline: null, answers: {}, grades: {}, showAnswers: false, showSolution: false, evaluated: false };
  return st.rounds[c];
}

function current(st) {
  if (st.catIndex < 0) fail('Es läuft gerade keine Kategorie.');
  return round(st, st.catIndex);
}

const GRACE_MS = 1500; // Netzwerk-Puffer für Abgaben in der letzten Sekunde

function result(r, game) {
  const right = Object.keys(r.answers).filter((id) => r.grades[id] === true);
  return { right, askerPoints: right.length ? pv(game, 'askerSomeone') : pv(game, 'askerNobody') };
}

module.exports = {
  init: () => ({ catIndex: -1, rounds: {} }),
  result,

  team: {
    propose(db, ctx, game, st, p) {
      const r = current(st);
      if (!r.open || r.published) fail('Gerade werden keine Fragen angenommen.');
      if (r.subs.some((s) => s.teamId === ctx.teamId)) fail('Ihr habt schon einen Vorschlag abgeschickt.');
      const q = cleanInk(p.qInk);
      const a = cleanInk(p.aInk);
      if (!q || !a) fail('Bitte Frage UND richtige Antwort aufschreiben.');
      r.subs.push({ teamId: ctx.teamId, qInk: q, aInk: a, at: ctx.now, status: 'pending' });
      log(db, ctx, 'buzzer', `${teamName(db, ctx.teamId)} schickt einen Vorschlag (Platz ${r.subs.length})`);
      effect(db, 'buzz');
    },

    answer(db, ctx, game, st, p) {
      const r = current(st);
      if (!r.published) fail('Noch ist keine Frage freigegeben.');
      if (r.accepted === ctx.teamId) fail('Eure eigene Frage beantwortet ihr nicht.');
      if (r.answers[ctx.teamId]) fail('Ihr habt schon geantwortet.');
      if (r.deadline && ctx.now > r.deadline + GRACE_MS) fail('Die Zeit ist abgelaufen.');
      const ink = cleanInk(p.ink);
      if (!ink) fail('Bitte zuerst die Antwort aufschreiben.');
      r.answers[ctx.teamId] = { ink, at: ctx.now };
      log(db, ctx, 'antwort', `${teamName(db, ctx.teamId)} hat geantwortet`);
    },
  },

  mod: {
    open(db, ctx, game, st, p) {
      const c = Number(p.catIndex);
      if (!game.content.categories[c]) fail('Kategorie nicht gefunden.');
      if (st.catIndex >= 0 && st.catIndex !== c) {
        const prev = round(st, st.catIndex);
        if (prev.published && !prev.evaluated) fail('Erst die laufende Frage auswerten.');
        prev.open = false;
      }
      st.catIndex = c;
      const r = round(st, c);
      if (!r.evaluated) r.open = true;
      log(db, ctx, 'ablauf', `Kategorie „${game.content.categories[c].name}“: Vorschläge offen`);
      effect(db, 'title');
    },

    reject(db, ctx, game, st, p) {
      const r = current(st);
      const s = r.subs.find((x) => x.teamId === p.teamId);
      if (!s || r.published) fail('Diesen Vorschlag gibt es nicht (mehr).');
      s.status = 'rejected';
      s.reason = typeof p.reason === 'string' ? p.reason.slice(0, 80) : '';
      log(db, ctx, 'bewertung', `Vorschlag von ${teamName(db, p.teamId)} abgelehnt${s.reason ? ` (${s.reason})` : ''}`);
    },

    accept(db, ctx, game, st, p) {
      const r = current(st);
      const s = r.subs.find((x) => x.teamId === p.teamId && x.status !== 'rejected');
      if (!s || r.published) fail('Diesen Vorschlag gibt es nicht (mehr).');
      for (const x of r.subs) if (x.status === 'accepted') x.status = 'pending';
      s.status = 'accepted';
      r.accepted = s.teamId;
      log(db, ctx, 'bewertung', `Vorschlag von ${teamName(db, s.teamId)} angenommen`);
    },

    // Frage veröffentlichen: Beamer zeigt NUR die Frage, die Antwortzeit läuft.
    publish(db, ctx, game, st) {
      const r = current(st);
      if (!r.accepted) fail('Erst einen Vorschlag annehmen.');
      if (r.published) fail('Die Frage ist schon veröffentlicht.');
      r.published = true;
      r.open = false;
      r.deadline = ctx.now + secondsOf(game) * 1000;
      log(db, ctx, 'ablauf', `Frage von ${teamName(db, r.accepted)} veröffentlicht – ${secondsOf(game)} Sekunden`);
      effect(db, 'title');
    },

    grade(db, ctx, game, st, p) {
      const r = current(st);
      if (!r.answers[p.teamId]) fail('Dieses Team hat nicht geantwortet.');
      if (r.evaluated) fail('Schon ausgewertet.');
      r.grades[p.teamId] = !!p.correct;
    },

    show(db, ctx, game, st, p) {
      const r = current(st);
      if (!r.published) fail('Erst die Frage veröffentlichen.');
      if (p.what === 'answers') r.showAnswers = !!p.on;
      if (p.what === 'solution') r.showSolution = !!p.on;
    },

    evaluate(db, ctx, game, st) {
      const r = current(st);
      if (!r.published) fail('Erst die Frage veröffentlichen.');
      if (r.evaluated) fail('Schon ausgewertet.');
      if (r.deadline && ctx.now < r.deadline) fail('Die Antwortzeit läuft noch.');
      const missing = Object.keys(r.answers).filter((id) => r.grades[id] === undefined);
      if (missing.length) fail(`Noch nicht bewertet: ${missing.map((id) => teamName(db, id)).join(', ')}`);
      r.evaluated = true;
      // Auflösung: erst die Antworten der anderen Teams, danach die Antwort des fragenden Teams.
      r.showAnswers = true;
      r.showSolution = true;
      const res = result(r, game);
      for (const id of Object.keys(r.answers)) {
        bookTarget(db, ctx, `fragen:${game.id}:${st.catIndex}:${id}`, id, r.grades[id] ? pv(game, 'correct') : 0, `${game.title}, Frage von ${teamName(db, r.accepted)}`);
      }
      bookTarget(db, ctx, `fragen:${game.id}:${st.catIndex}:asker`, r.accepted, res.askerPoints, `${game.title}, eigene Frage`);
      log(db, ctx, 'ablauf', res.right.length ? `${res.right.length} Team(s) richtig – ${teamName(db, r.accepted)} −1` : `Niemand richtig – ${teamName(db, r.accepted)} +2`);
      effect(db, 'show'); // alle zugleich aufgelöst: kein Richtig-/Falsch-Ton
    },
  },

  wakeAt(db, game, st, now) {
    if (st.catIndex < 0) return null;
    const r = round(st, st.catIndex);
    return r.deadline && !r.evaluated && r.deadline > now ? r.deadline : null;
  },

  teamView(db, game, st, teamId, now = Date.now()) {
    if (st.catIndex < 0) return null;
    const r = round(st, st.catIndex);
    const cat = game.content.categories[st.catIndex];
    const own = r.subs.find((s) => s.teamId === teamId);
    const asker = r.accepted === teamId;
    const res = r.evaluated ? result(r, game) : null;
    return {
      catIndex: st.catIndex,
      name: cat.name,
      note: cat.note,
      open: r.open,
      canPropose: r.open && !r.published && !own,
      proposal: own ? { status: own.status, reason: own.reason || '' } : null,
      published: r.published,
      asker,
      // Die anderen Teams sehen die veröffentlichte Frage (Handschrift) – nie die hinterlegte Antwort.
      question: r.published && !asker ? r.subs.find((s) => s.teamId === r.accepted).qInk : null,
      deadline: r.deadline,
      canAnswer: r.published && !asker && !r.answers[teamId] && !r.evaluated && (!r.deadline || now <= r.deadline),
      answered: !!r.answers[teamId],
      tooLate: r.published && !asker && !r.answers[teamId] && r.deadline && now > r.deadline,
      evaluated: r.evaluated,
      gained: res ? (asker ? res.askerPoints : r.grades[teamId] ? pv(game, 'correct') : 0) : null,
    };
  },

  beamerView(db, game, st) {
    if (st.catIndex < 0) return { waiting: true };
    const r = round(st, st.catIndex);
    const cat = game.content.categories[st.catIndex];
    const acc = r.accepted ? r.subs.find((s) => s.teamId === r.accepted) : null;
    const res = r.evaluated ? result(r, game) : null;
    return {
      catIndex: st.catIndex,
      name: cat.name,
      proposals: r.subs.length,
      published: r.published,
      asker: r.published ? r.accepted : null,
      question: r.published && acc ? acc.qInk : null,
      deadline: r.deadline,
      answeredCount: Object.keys(r.answers).length,
      answers: r.showAnswers ? Object.entries(r.answers).map(([teamId, a]) => ({ teamId, ink: a.ink, correct: r.evaluated ? r.grades[teamId] ?? null : null })) : [], // Wertung erst mit der Auswertung
      solution: r.showSolution && acc ? acc.aInk : null,
      evaluated: r.evaluated,
      result: res,
    };
  },
};
