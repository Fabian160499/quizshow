'use strict';

// Spiel „Host du das Zeug dafür?“: Zuerst gibt jedes Team eine eigene Antwort
// ein (ohne Antwortmöglichkeiten). Erst wenn ALLE Teams eingereicht haben, baut
// das System daraus und aus der vorab festgelegten richtigen Antwort die
// Optionen A, B, C … (zufällig gemischt, ohne Einreicher). Gleiche bzw. eindeutig
// fast gleiche Antworten werden zusammengeführt; unsichere Ähnlichkeiten prüft
// die Moderation (zusammenführen/trennen) vor der Abstimmung. Dann wählt jedes
// Team eine Option – nie die, in der seine eigene Antwort steckt (auch nicht die
// richtige, wenn es sie selbst eingereicht hat). Wertung: richtige Option gewählt
// = 1 Punkt. Wer die richtige Antwort selbst eingereicht hat, bekommt diesen Punkt
// automatisch und stimmt nicht ab. Für jede falsche Option bekommt jedes Team, das sie eingereicht hat,
// 1 Punkt pro gegnerischem Team, das sie wählt. Die richtige Option bringt keine
// Täuschungspunkte. Mehrere Teams dürfen dieselbe Option wählen.

const { fail, log, effect, teamName, teamIds, bookTarget, cleanText } = require('./core');
const { pv } = require('./scoring');
const { core, lev, shuffled } = require('./match');

const tol = (len) => (len >= 10 ? 2 : len >= 5 ? 1 : 0);
const same = (a, b) => { const x = core(a), y = core(b); return x === y || (Math.min(x.length, y.length) >= 5 && lev(x, y) <= tol(Math.min(x.length, y.length))); };
const maybe = (a, b) => {
  const x = core(a), y = core(b);
  if (same(a, b)) return false;
  if (x.length >= 4 && y.length >= 4 && (x.includes(y) || y.includes(x))) return true;
  return Math.min(x.length, y.length) >= 4 && lev(x, y) <= tol(Math.min(x.length, y.length)) + 2;
};
const LETTERS = 'ABCDEFGHIJKLMNOP';

function round(st, i) {
  if (!st.rounds[i]) st.rounds[i] = { phase: 'submit', answers: {}, groups: null, hints: [], votes: {}, results: null };
  return st.rounds[i];
}
function current(st) {
  if (st.index < 0) fail('Es läuft gerade keine Frage.');
  return round(st, st.index);
}
const variantsOf = (q) => [q.answer, ...String(q.aliases || '').split(',')].map((s) => s.trim()).filter(Boolean);
const groupOf = (r, teamId) => r.groups.find((g) => g.teams.includes(teamId));
// Team hat die richtige Antwort selbst eingereicht (stimmt dann nicht ab).
const knewIt = (r, teamId) => !!(r.groups || []).find((g) => g.correct && g.teams.includes(teamId));

// Optionen aus den Einreichungen bilden.
function build(r, q) {
  const groups = [{ id: 'correct', correct: true, text: q.answer, teams: [] }];
  const hints = [];
  for (const [teamId, a] of Object.entries(r.answers)) {
    let g = variantsOf(q).some((v) => same(v, a.text)) ? groups[0] : null;
    if (!g) {
      const hits = groups.filter((x) => !x.correct && x.teams.some((t) => same(r.answers[t].text, a.text)));
      if (hits.length === 1) g = hits[0];
    }
    if (!g) {
      g = { id: `g${groups.length}`, correct: false, text: a.text, teams: [] };
      groups.push(g);
    }
    g.teams.push(teamId);
  }
  // Unsichere Ähnlichkeiten der Moderation zeigen (nicht automatisch zusammenführen).
  for (const [teamId, a] of Object.entries(r.answers)) {
    const own = groups.find((g) => g.teams.includes(teamId));
    for (const g of groups) {
      if (g === own) continue;
      const texts = g.correct ? variantsOf(q) : g.teams.map((t) => r.answers[t].text);
      if (texts.some((t) => maybe(t, a.text))) hints.push({ teamId, groupId: g.id });
    }
  }
  return { groups, hints };
}

function score(db, r, game = null) {
  const P = (k) => (game ? pv(game, k) : 1);
  const pts = Object.fromEntries(teamIds(db).map((id) => [id, { regular: 0, deceive: 0, knew: false }]));
  // Richtige Antwort selbst eingereicht: Punkt für „richtig“ ohne Abstimmung.
  const right = r.groups.find((g) => g.correct);
  for (const t of right ? right.teams : []) if (pts[t]) { pts[t].regular += P('correct'); pts[t].knew = true; }
  for (const [voter, gid] of Object.entries(r.votes)) {
    const g = r.groups.find((x) => x.id === gid);
    if (!g || g.teams.includes(voter)) continue; // eigene Option zählt nie
    if (g.correct) pts[voter].regular += P('correct');
    else for (const t of g.teams) if (pts[t]) pts[t].deceive += P('deceive');
  }
  return pts;
}

module.exports = {
  init: () => ({ index: -1, rounds: {} }),
  score,

  team: {
    submit(db, ctx, game, st, p) {
      const r = current(st);
      if (r.phase !== 'submit') fail('Die Einreichung ist geschlossen.');
      if (r.answers[ctx.teamId]) fail('Ihr habt schon eingereicht.');
      const text = cleanText(p.text || '', 120);
      if (!text) fail('Bitte eine Antwort eingeben.');
      r.answers[ctx.teamId] = { text, at: ctx.now };
      log(db, ctx, 'antwort', `${teamName(db, ctx.teamId)} hat eingereicht`);
    },
    vote(db, ctx, game, st, p) {
      const r = current(st);
      if (r.phase !== 'vote') fail('Die Abstimmung ist nicht offen.');
      if (r.votes[ctx.teamId]) fail('Eure Wahl ist schon abgegeben.');
      const g = r.groups.find((x) => x.letter === p.letter);
      if (!g) fail('Diese Option gibt es nicht.');
      if (knewIt(r, ctx.teamId)) fail('Ihr hattet die richtige Antwort – der Punkt ist euch sicher, ihr stimmt nicht ab.');
      if (g.teams.includes(ctx.teamId)) fail('Eure eigene Antwort könnt ihr nicht wählen.');
      r.votes[ctx.teamId] = g.id;
      log(db, ctx, 'antwort', `${teamName(db, ctx.teamId)} hat abgestimmt`);
    },
  },

  mod: {
    open(db, ctx, game, st, p) {
      const i = Number(p.index);
      const q = game.content.questions[i];
      if (!q) fail('Frage nicht gefunden.');
      if (!String(q.question || '').trim() || !String(q.answer || '').trim()) fail('Frage und richtige Antwort müssen vorher eingetragen sein.');
      st.index = i;
      round(st, i);
      log(db, ctx, 'ablauf', `Host du: Frage ${i + 1} offen`);
    },
    // Einreichung schließen (erst wenn jedes Team eingereicht hat) und Optionen bilden.
    close(db, ctx, game, st) {
      const r = current(st);
      if (r.phase !== 'submit') fail('Die Einreichung ist schon geschlossen.');
      const missing = teamIds(db).filter((id) => !r.answers[id]);
      if (missing.length) fail(`Jedes Team muss einreichen – es fehlen noch: ${missing.map((id) => teamName(db, id)).join(', ')}`);
      Object.assign(r, build(r, game.content.questions[st.index]), { phase: 'review' });
      log(db, ctx, 'ablauf', `Host du: ${r.groups.length} Optionen gebildet – Moderation prüft`);
    },
    // Antwort eines Teams einer anderen Option zuordnen ({ teamId, groupId }) oder abtrennen ({ teamId }).
    regroup(db, ctx, game, st, p) {
      const r = current(st);
      if (r.phase !== 'review') fail('Zusammenführen geht nur vor der Abstimmung.');
      const from = groupOf(r, p.teamId);
      if (!from) fail('Antwort nicht gefunden.');
      let to;
      if (p.groupId) {
        to = r.groups.find((g) => g.id === p.groupId);
        if (!to) fail('Option nicht gefunden.');
      } else {
        if (!from.correct && from.teams.length === 1) return;
        to = { id: `g${Date.now().toString(36)}${r.groups.length}`, correct: false, text: r.answers[p.teamId].text, teams: [] };
        r.groups.push(to);
      }
      if (to === from) return;
      from.teams = from.teams.filter((t) => t !== p.teamId);
      to.teams.push(p.teamId);
      if (!from.correct && !from.teams.length) r.groups = r.groups.filter((g) => g !== from);
      else if (!from.correct && from.text === r.answers[p.teamId].text) from.text = r.answers[from.teams[0]].text;
      r.hints = r.hints.filter((h) => h.teamId !== p.teamId);
      log(db, ctx, 'bewertung', `Host du: Antwort von ${teamName(db, p.teamId)} ${p.groupId ? 'zusammengeführt' : 'abgetrennt'}`);
    },
    startVote(db, ctx, game, st) {
      const r = current(st);
      if (r.phase !== 'review') fail('Erst die Einreichung schließen.');
      const order = shuffled(r.groups.map((g) => g.id), `${game.id}:hd:${st.index}:${r.groups.length}`);
      order.forEach((id, k) => { r.groups.find((g) => g.id === id).letter = LETTERS[k]; });
      r.groups.sort((a, b) => a.letter.localeCompare(b.letter));
      r.phase = 'vote';
      log(db, ctx, 'ablauf', 'Host du: Abstimmung offen');
    },
    reveal(db, ctx, game, st, p) {
      const r = current(st);
      if (r.phase !== 'vote') fail('Die Abstimmung läuft nicht.');
      const can = teamIds(db).filter((id) => !knewIt(r, id) && r.groups.some((g) => !g.teams.includes(id)));
      const missing = can.filter((id) => !r.votes[id]);
      if (missing.length && !p.force) fail(`Noch nicht abgestimmt: ${missing.map((id) => teamName(db, id)).join(', ')}`);
      r.phase = 'revealed';
      r.results = score(db, r, game);
      for (const [id, x] of Object.entries(r.results)) bookTarget(db, ctx, `hostdu:${game.id}:${st.index}:${id}`, id, x.regular + x.deceive, `${game.title}, Frage ${st.index + 1}`);
      log(db, ctx, 'ablauf', `Host du: Frage ${st.index + 1} aufgelöst`);
      effect(db, 'show'); // alle zugleich aufgelöst: kein Richtig-/Falsch-Ton
    },
  },

  teamView(db, game, st, teamId) {
    if (st.index < 0) return null;
    const r = round(st, st.index);
    const q = game.content.questions[st.index];
    const own = r.answers[teamId];
    const base = { index: st.index, count: game.content.questions.length, question: q.question, phase: r.phase, submitted: !!own, text: own ? own.text : null };
    if (r.phase === 'submit' || r.phase === 'review') return base;
    const voted = r.votes[teamId];
    return {
      ...base,
      options: r.groups.map((g) => ({ letter: g.letter, text: g.text, own: g.teams.includes(teamId) })),
      voted: voted ? r.groups.find((g) => g.id === voted).letter : null,
      knew: knewIt(r, teamId),
      correct: r.phase === 'revealed' ? r.groups.find((g) => g.correct).letter : null,
      result: r.phase === 'revealed' ? r.results[teamId] : null,
    };
  },

  beamerView(db, game, st) {
    if (st.index < 0) return { waiting: true };
    const r = round(st, st.index);
    const q = game.content.questions[st.index];
    const out = { index: st.index, question: q.question, phase: r.phase, submittedCount: Object.keys(r.answers).length, teamCount: db.project.teams.length };
    if (r.groups) out.voterCount = teamIds(db).filter((id) => !knewIt(r, id)).length;
    if (r.phase === 'vote') {
      out.options = r.groups.map((g) => ({ letter: g.letter, text: g.text }));
      out.votedCount = Object.keys(r.votes).length;
    }
    if (r.phase === 'revealed') {
      out.options = r.groups.map((g) => ({
        letter: g.letter, text: g.text, correct: g.correct, by: g.teams,
        chosenBy: Object.entries(r.votes).filter(([, gid]) => gid === g.id).map(([id]) => id),
      }));
      out.results = r.results;
    }
    return out;
  },
};
