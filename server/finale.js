'use strict';

// Finale gegen die Moderation.
//
// Das Team mit den meisten Punkten spielt gegen die Moderation. Beide bekommen
// jede Frage gleichzeitig und ohne Zeitdruck und schreiben ihre Antwort auf.
// - Das Team bekommt einen Punkt für jede richtige Antwort.
// - Die Moderation bekommt bei jeder Frage einen Punkt, egal ob ihre Antwort
//   stimmt, und muss sie nicht zeigen.
// - Ablauf je Frage: beide antworten → die Frage wird aufgelöst und das Team bekommt
//   seinen Punkt (oder nicht) → erst dann entscheidet das Team, ob es eine Münze setzt.
// - Mit einer Münze zwingt das Team die Moderation, ihre Antwort aufzudecken:
//   Ist sie richtig, ist die Münze weg und die Moderation behält ihren Punkt.
//   Ist sie falsch, bekommt die Moderation keinen Punkt und das Team die Münze zurück.
// Wer zuerst das Ziel erreicht, gewinnt. Erreichen beide es in derselben Frage,
// folgt Sudden Death: Es entscheidet der erste Fehler (falsche Teamantwort oder
// aufgedeckte falsche Moderationsantwort); liegen beide in derselben Frage falsch,
// geht es mit der nächsten Frage weiter. Verliert das Team seine letzte Münze,
// hat es sofort verloren.
// Das Siegerteam erhält ein Ticket für die große Finalshow.

const { fail, log, effect, teamName, totals, cleanText, cleanInk } = require('./core');

const TARGET_MIN = 1, TARGET_MAX = 20, QUESTIONS_MAX = 60;

const EXAMPLE = {
  target: 5,
  questions: [
    { question: 'Wie viele Herzen hat ein Oktopus?', answer: '3' },
    { question: 'In welchem Jahr fiel die Berliner Mauer?', answer: '1989' },
    { question: 'Wie heißt die Hauptstadt von Australien?', answer: 'Canberra' },
    { question: 'Welches chemische Element hat das Symbol „Au“?', answer: 'Gold' },
    { question: 'Wie viele Spieler stehen bei einem Fußballteam auf dem Platz?', answer: '11' },
    { question: 'Welcher Planet ist der Sonne am nächsten?', answer: 'Merkur' },
    { question: 'Wer malte die „Mona Lisa“?', answer: 'Leonardo da Vinci' },
    { question: 'Wie viele Saiten hat eine klassische Gitarre?', answer: '6' },
    { question: 'Aus welchem Land stammt die Band ABBA?', answer: 'Schweden' },
    { question: 'Wie heißt der längste Fluss Deutschlands?', answer: 'Rhein' },
    { question: 'Wie viele Minuten hat ein Tag?', answer: '1440' },
    { question: 'Welches Tier ist das Wappentier von Berlin?', answer: 'Bär' },
  ],
};

function cleanConfig(p) {
  const target = Number(p.target);
  if (!Number.isInteger(target) || target < TARGET_MIN || target > TARGET_MAX) fail(`Das Ziel muss zwischen ${TARGET_MIN} und ${TARGET_MAX} Punkten liegen.`);
  if (!Array.isArray(p.questions)) fail('Ungültige Fragenliste.');
  if (p.questions.length > QUESTIONS_MAX) fail(`Höchstens ${QUESTIONS_MAX} Finalfragen.`);
  const questions = p.questions.map((q) => ({ question: cleanText(String(q?.question ?? ''), 300), answer: cleanText(String(q?.answer ?? ''), 160) }));
  return { target, questions };
}

function config(db) {
  if (!db.project.finale) db.project.finale = JSON.parse(JSON.stringify(EXAMPLE));
  return db.project.finale;
}

function state(db) {
  const f = db.live.finale;
  if (!f) fail('Das Finale hat noch nicht begonnen.');
  return f;
}

function current(f) {
  const r = f.rounds[f.qIndex];
  if (!r) fail('Es läuft gerade keine Finalfrage.');
  return r;
}

function coinsOf(db, teamId) {
  return db.live.coins.filter((c) => c.teamId === teamId).length;
}

function coinsLeft(db, f) {
  return Math.max(0, coinsOf(db, f.teamId) - f.coinsLost);
}

// Finalteam: der Sieger nach allen acht Spielen. Das ist das Team mit der Münze der
// letzten Gewinnstufe (bei Punktgleichstand per Schätzfrage entschieden), sonst das
// Team mit den meisten Punkten.
function topTeam(db) {
  const last = [...db.live.coins].sort((a, b) => b.position - a.position)[0];
  if (last && last.position === 8) {
    const t = db.project.teams.find((x) => x.id === last.teamId);
    if (t) return t;
  }
  const sums = totals(db);
  const teams = [...db.project.teams].sort((a, b) => (sums[b.id] || 0) - (sums[a.id] || 0) || coinsOf(db, b.id) - coinsOf(db, a.id));
  return teams[0] || null;
}

function start(db, ctx, teamId) {
  const team = teamId ? db.project.teams.find((t) => t.id === teamId) : topTeam(db);
  if (!team) fail('Für das Finale gibt es kein Team.');
  config(db);
  db.live.finaleHistory = [];
  db.live.finale = {
    teamId: team.id,
    coinsLost: 0,
    score: { team: 0, mod: 0 },
    qIndex: -1,
    rounds: [],
    sudden: false,
    result: null, // 'team' | 'mod'
  };
  log(db, ctx, 'finale', `Finale: ${team.name} gegen die Moderation (Ziel ${config(db).target} Punkte, ${coinsOf(db, team.id)} Münzen)`);
}

function decide(db, ctx, f, winner, why) {
  f.result = winner;
  effect(db, 'reveal');
  log(db, ctx, 'finale', `Finale entschieden: ${winner === 'team' ? `${teamName(db, f.teamId)} stiehlt die Show` : 'Die Moderation behält die Show'} (${why})`);
}

// Runde abschließen, sobald das Team entschieden hat (Münze oder nicht).
function finish(db, ctx, f, r) {
  if (r.resolved) return;
  r.resolved = true;
  r.modPoint = r.challenged && r.modGrade === false ? 0 : 1;
  r.coinLost = r.challenged && r.modGrade === true;
  if (r.coinLost) f.coinsLost += 1;
  f.score.mod += r.modPoint;
  const target = config(db).target;
  log(db, ctx, 'finale', `Finalfrage ${f.qIndex + 1} abgeschlossen: Team ${f.score.team}, Moderation ${f.score.mod}`);
  // Keine Münze mehr: Das Team hat automatisch verloren.
  if (r.coinLost && coinsLeft(db, f) === 0) return decide(db, ctx, f, 'mod', 'letzte Münze verloren');
  if (f.sudden) {
    const teamErr = !r.teamGrade;
    const modErr = r.challenged && r.modGrade === false;
    // Beide falsch (Team daneben, aufgedeckte Moderation auch): niemand punktet – nächste Frage.
    if (teamErr && modErr) { log(db, ctx, 'finale', 'Sudden Death: beide falsch – nächste Frage'); return; }
    if (teamErr) return decide(db, ctx, f, 'mod', 'Fehler des Teams im Sudden Death');
    if (modErr) return decide(db, ctx, f, 'team', 'Fehler der Moderation im Sudden Death');
    return;
  }
  const t = f.score.team >= target, m = f.score.mod >= target;
  if (t && m) {
    f.sudden = true;
    effect(db, 'reveal');
    log(db, ctx, 'finale', 'Gleichstand am Ziel – Sudden Death');
  } else if (t) decide(db, ctx, f, 'team', `${target} Punkte erreicht`);
  else if (m) decide(db, ctx, f, 'mod', `${target} Punkte erreicht`);
}

const mod = {
  'finale.config'(db, ctx, p) {
    db.project.finale = cleanConfig(p);
    log(db, ctx, 'editor', `Finale gespeichert (Ziel ${db.project.finale.target}, ${db.project.finale.questions.length} Fragen)`);
  },

  'finale.start'(db, ctx, p) {
    if (db.live.finale && db.live.finale.qIndex >= 0 && !db.live.finale.result && p.confirm !== 'NEU') fail('Das Finale läuft bereits.');
    start(db, ctx, p.teamId || null);
  },

  'finale.next'(db, ctx) {
    const f = state(db);
    if (f.result) fail('Das Finale ist bereits entschieden.');
    const prev = f.rounds[f.qIndex];
    if (prev && !prev.resolved) fail('Erst die aktuelle Frage auflösen.');
    const qs = config(db).questions.filter((q) => q.question);
    if (f.qIndex + 1 >= qs.length) fail('Keine Finalfragen mehr – bitte im Editor weitere anlegen.');
    f.qIndex += 1;
    f.rounds.push({ team: null, mod: null, teamGrade: null, challenged: false, modGrade: null, revealed: false, decided: false, resolved: false, teamPoint: 0, modPoint: 0, coinLost: false });
    log(db, ctx, 'finale', `Finalfrage ${f.qIndex + 1}${f.sudden ? ' (Sudden Death)' : ''} gestellt`);
  },

  // Verdeckte Antwort der Moderation (Handschrift oder Text).
  'finale.modAnswer'(db, ctx, p) {
    const f = state(db);
    const r = current(f);
    if (r.resolved) fail('Diese Frage ist schon aufgelöst.');
    if (r.mod) fail('Die Antwort der Moderation ist bereits abgegeben.');
    const ink = cleanInk(p.ink);
    const text = ink ? '' : cleanText(p.text ?? '', 160);
    if (!ink && !text) fail('Bitte zuerst die Antwort aufschreiben.');
    r.mod = { ink, text, at: ctx.now };
    log(db, ctx, 'finale', `Moderation hat Finalfrage ${f.qIndex + 1} verdeckt beantwortet`);
  },

  'finale.gradeTeam'(db, ctx, p) {
    const f = state(db);
    const r = current(f);
    if (!r.team) fail('Das Team hat noch nicht geantwortet.');
    if (r.revealed) fail('Die Frage ist schon aufgelöst.');
    r.teamGrade = !!p.correct;
    effect(db, r.teamGrade ? 'correct' : 'wrong');
    log(db, ctx, 'finale', `${teamName(db, f.teamId)} Finalfrage ${f.qIndex + 1}: ${r.teamGrade ? 'richtig' : 'falsch'}`);
  },

  'finale.gradeMod'(db, ctx, p) {
    const f = state(db);
    const r = current(f);
    if (!r.challenged) fail('Die Antwort der Moderation wurde nicht aufgedeckt.');
    if (r.resolved) fail('Diese Frage ist schon aufgelöst.');
    r.modGrade = !!p.correct;
    effect(db, r.modGrade ? 'correct' : 'wrong');
    log(db, ctx, 'finale', `Aufgedeckte Antwort der Moderation: ${r.modGrade ? 'richtig – Münze verloren' : 'falsch – kein Punkt, Münze zurück'}`);
    finish(db, ctx, f, r);
  },

  // Frage auflösen: Lösung zeigen, das Team bekommt sofort seinen Punkt (oder keinen).
  'finale.reveal'(db, ctx) {
    const f = state(db);
    const r = current(f);
    if (r.revealed) fail('Die Frage ist schon aufgelöst.');
    if (!r.team || !r.mod) fail('Erst müssen Team und Moderation antworten.');
    if (r.teamGrade === null) fail('Erst die Antwort des Teams bewerten.');
    r.revealed = true;
    r.teamPoint = r.teamGrade ? 1 : 0;
    f.score.team += r.teamPoint;
    effect(db, 'reveal');
    log(db, ctx, 'finale', `Finalfrage ${f.qIndex + 1} aufgelöst: Team ${r.teamPoint ? '+1' : '±0'} – jetzt entscheidet das Team über die Münze`);
    if (coinsLeft(db, f) < 1) { r.decided = true; finish(db, ctx, f, r); }
  },

  // Ohne Münzeinsatz weiter (falls das Team nicht selbst entscheidet).
  'finale.resolve'(db, ctx) {
    const f = state(db);
    const r = current(f);
    if (r.resolved) fail('Diese Frage ist schon fertig.');
    if (!r.revealed) fail('Erst die Frage auflösen.');
    if (r.challenged && r.modGrade === null) fail('Erst die aufgedeckte Antwort der Moderation bewerten.');
    r.decided = true;
    finish(db, ctx, f, r);
  },

  // Notfall: Sieger von Hand festlegen oder Entscheidung zurücknehmen.
  'finale.decide'(db, ctx, p) {
    const f = state(db);
    if (p.winner === null) { f.result = null; log(db, ctx, 'finale', 'Entscheidung im Finale zurückgenommen'); return; }
    if (!['team', 'mod'].includes(p.winner)) fail('Ungültiger Sieger.');
    decide(db, ctx, f, p.winner, 'von der Regie festgelegt');
  },

  'finale.reset'(db, ctx) {
    db.live.finale = null;
    db.live.finaleHistory = [];
    log(db, ctx, 'finale', 'Finale zurückgesetzt');
  },
};

const team = {
  'finale.answer'(db, ctx, p) {
    const f = state(db);
    if (ctx.teamId !== f.teamId) fail('Nur das Finalteam antwortet im Finale.');
    const r = current(f);
    if (r.resolved) fail('Diese Frage ist schon aufgelöst.');
    if (r.team) fail('Eure Antwort ist bereits abgegeben und gesperrt.');
    const ink = cleanInk(p.ink);
    const text = ink ? '' : cleanText(p.text ?? '', 160);
    if (!ink && !text) fail('Bitte zuerst eure Antwort aufschreiben.');
    r.team = { ink, text, at: ctx.now };
    log(db, ctx, 'finale', `${teamName(db, f.teamId)} hat Finalfrage ${f.qIndex + 1} abgegeben`);
  },

  // Münze einsetzen: die Moderation muss ihre Antwort aufdecken.
  'finale.challenge'(db, ctx) {
    const f = state(db);
    if (ctx.teamId !== f.teamId) fail('Nur das Finalteam kann eine Münze einsetzen.');
    const r = current(f);
    if (r.resolved) fail('Diese Frage ist schon aufgelöst.');
    if (!r.revealed) fail('Erst wird die Frage aufgelöst, dann entscheidet ihr über die Münze.');
    if (r.challenged || r.decided) fail('Ihr habt für diese Frage schon entschieden.');
    if (coinsLeft(db, f) < 1) fail('Ihr habt keine Münze mehr.');
    r.challenged = true;
    r.decided = true;
    effect(db, 'coin');
    log(db, ctx, 'finale', `${teamName(db, f.teamId)} setzt eine Münze ein – die Moderation muss aufdecken`);
  },
};

// Keine Münze einsetzen: die Moderation behält ihren Punkt, weiter zur nächsten Frage.
team['finale.pass'] = function (db, ctx) {
  const f = state(db);
  if (ctx.teamId !== f.teamId) fail('Nur das Finalteam entscheidet im Finale.');
  const r = current(f);
  if (!r.revealed) fail('Erst wird die Frage aufgelöst.');
  if (r.challenged || r.decided) fail('Ihr habt für diese Frage schon entschieden.');
  r.decided = true;
  log(db, ctx, 'finale', `${teamName(db, f.teamId)} setzt keine Münze ein`);
  finish(db, ctx, f, r);
};

// ---------- Sichten ----------

function roundPublic(r, question, solution) {
  return {
    question,
    teamAnswered: !!r.team,
    modAnswered: !!r.mod,
    teamGrade: r.teamGrade,
    teamAnswer: r.teamGrade !== null || r.revealed ? r.team : null,
    revealed: r.revealed,
    decided: r.decided,
    challenged: r.challenged,
    modAnswer: r.challenged ? r.mod : null,
    modGrade: r.modGrade,
    resolved: r.resolved,
    solution: r.revealed ? solution : null,
    teamPoint: r.teamPoint,
    modPoint: r.modPoint,
    coinLost: r.coinLost,
  };
}

function base(db, f) {
  const t = db.project.teams.find((x) => x.id === f.teamId) || { name: '?', color: '#888' };
  const qs = config(db).questions.filter((q) => q.question);
  const r = f.rounds[f.qIndex];
  return {
    team: { id: f.teamId, name: t.name, color: t.color },
    host: db.project.host,
    coHost: db.project.coHost,
    target: config(db).target,
    score: f.score,
    coins: coinsLeft(db, f),
    coinsTotal: coinsOf(db, f.teamId),
    qIndex: f.qIndex,
    sudden: f.sudden,
    result: f.result,
    round: r ? roundPublic(r, qs[f.qIndex]?.question || '', qs[f.qIndex]?.answer || '') : null,
  };
}

function beamerView(db) {
  const f = db.live.finale;
  if (!f) return null;
  const out = base(db, f);
  const t = db.project.teams.find((x) => x.id === f.teamId);
  if (t && t.avatar) out.team.avatar = t.avatar;
  return out;
}

function teamView(db, teamId) {
  const f = db.live.finale;
  if (!f) return null;
  const out = base(db, f);
  out.player = teamId === f.teamId;
  const r = f.rounds[f.qIndex];
  if (out.player && r) {
    out.round.own = r.team; // eigene Antwort sofort sehen
    out.canChallenge = r.revealed && !r.decided && out.coins > 0;
  }
  // Zuschauende Teams sehen die verdeckte Antwort der Moderation zum Mitfiebern,
  // sobald die Moderation abgegeben hat (Wunsch von Fabian).
  if (!out.player && r && r.mod) out.round.peekMod = r.mod;
  return out;
}

function moderatorView(db) {
  const f = db.live.finale;
  const cfg = config(db);
  const suggestion = topTeam(db);
  const out = { config: cfg, suggestion: suggestion ? suggestion.id : null, coinsByTeam: Object.fromEntries(db.project.teams.map((t) => [t.id, coinsOf(db, t.id)])) };
  if (!f) return out;
  const qs = cfg.questions.filter((q) => q.question);
  const r = f.rounds[f.qIndex];
  out.state = { ...base(db, f), next: qs[f.qIndex + 1] ? qs[f.qIndex + 1].question : null, questionsLeft: qs.length - f.qIndex - 1 };
  if (r) out.state.round = { ...out.state.round, team: r.team, mod: r.mod, answer: qs[f.qIndex]?.answer || '' };
  return out;
}

module.exports = { EXAMPLE, mod, team, start, beamerView, teamView, moderatorView, config };
