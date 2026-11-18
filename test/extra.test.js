'use strict';

// Tests für die zusätzlichen Spielmodule der Spiele-Datenbank.

const test = require('node:test');
const assert = require('node:assert/strict');
const game = require('../server/game');
const { totals } = require('../server/core');

let clock = 1_000_000;
const mod = () => ({ role: 'moderator', actor: 'moderator', now: clock++ });
const team = (teamId, now) => ({ role: 'team', teamId, actor: `team:${teamId}`, now: now ?? clock++ });
const ink = 'data:image/png;base64,iVBORw0KGgo=';

function setup(teamCount = 3) {
  const db = game.createState();
  db.project.teams = [];
  for (let i = 0; i < teamCount; i++) game.applyAction(db, mod(), 'team.add', { name: `Team ${i + 1}` });
  return { db, ids: db.project.teams.map((t) => t.id) };
}

// Spielart aus der Datenbank in die Show setzen (statt des letzten Spiels) und aktivieren.
function use(db, type, patch) {
  const entry = db.library.find((e) => e.type === type);
  game.applyAction(db, mod(), 'game.remove', { gameId: db.project.games[7].id });
  game.applyAction(db, mod(), 'game.add', { libraryId: entry.id });
  const g = db.project.games[7];
  if (patch) game.applyAction(db, mod(), 'game.update', { gameId: g.id, content: { ...structuredClone(g.content), ...patch } });
  game.applyAction(db, mod(), 'show.activate', { gameId: g.id });
  db.live.beamer = { view: 'game', data: {} };
  return g;
}
const act = (db, ctx, name, p = {}) => game.applyAction(db, ctx, `play.${name}`, p);
const pv = (db) => game.beamerView(db).gameView;
const tv = (db, id) => game.teamView(db, id).play;
const media = (type) => ({ id: `media_${'a'.repeat(12)}${Math.floor(Math.random() * 1e6)}`.slice(0, 30), type, name: 'x', size: 1 });

test('Neue Spielarten stehen nur in der Datenbank; Migration ergänzt sie einmalig, ohne Shows zu ändern', () => {
  const db = game.createState();
  const showTypes = db.project.games.map((g) => g.type);
  assert.deepEqual(showTypes, ['leichte5', 'dummes', 'land', 'kassenschlager', 'trumpf5', 'musik', 'jauch', 'nerd']);
  for (const t of ['dgf', 'filmab', 'songsong', 'konsequenz', 'fragen', 'zuweit', 'zocken', 'brain', 'dumm3', 'weissnicht', 'weissnicht2']) {
    assert.ok(db.library.some((e) => e.type === t), t);
  }
  // Alter Speicherstand ohne die neuen Arten: werden ergänzt, Show bleibt gleich.
  const old = structuredClone(db);
  old.library = old.library.filter((e) => !['dgf', 'brain'].includes(e.type));
  delete old.libraryTypesAdded;
  const m = game.migrate(old);
  assert.ok(m.library.some((e) => e.type === 'dgf'));
  assert.deepEqual(m.project.games.map((g) => g.type), showTypes);
  // Vom Nutzer gelöschte Einträge kommen nicht wieder.
  m.library = m.library.filter((e) => e.type !== 'brain');
  assert.ok(!game.migrate(m).library.some((e) => e.type === 'brain'));
});

test('Medienfelder: nur passende Dateitypen, Verweise zählen als benutzt', () => {
  const { db } = setup(2);
  const entry = db.library.find((e) => e.type === 'filmab');
  const content = structuredClone(entry.content);
  content.films[0].clip = { id: 'media_abcdefabcdef12', type: 'audio/mpeg', name: 'x' };
  assert.throws(() => game.applyAction(db, mod(), 'library.update', { libraryId: entry.id, content }), /falscher Dateityp/);
  content.films[0].clip = { id: 'media_abcdefabcdef12', type: 'video/mp4', name: 'clip.mp4', size: 5 };
  game.applyAction(db, mod(), 'library.update', { libraryId: entry.id, content });
  assert.ok(game.referencedMedia(db).has('media_abcdefabcdef12'));
});

test('Dumm, dumm, dumm: Einsätze 1–5 je genau einmal, verbindlich, richtig plus / falsch minus', () => {
  const { db, ids } = setup(2);
  const g = use(db, 'dumm3');
  act(db, mod(), 'open', { qIndex: 0 });
  assert.throws(() => act(db, team(ids[0]), 'submit', { choice: 'C', stake: 7 }), /1 bis 5/);
  act(db, team(ids[0]), 'submit', { choice: 'C', stake: 5 });
  assert.throws(() => act(db, team(ids[0]), 'submit', { choice: 'A', stake: 4 }), /schon verbindlich/);
  act(db, team(ids[1]), 'submit', { choice: 'A', stake: 3 });
  assert.equal(pv(db).results.length, 0); // vor der Auswertung nichts öffentlich
  act(db, mod(), 'evaluate');
  assert.equal(totals(db)[ids[0]], 5);
  assert.equal(totals(db)[ids[1]], -3);
  act(db, mod(), 'open', { qIndex: 1 });
  assert.deepEqual(tv(db, ids[0]).used, [5]);
  assert.throws(() => act(db, team(ids[0]), 'submit', { choice: 'C', stake: 5 }), /schon verwendet/);
  assert.equal(g.type, 'dumm3');
});

test('Film ab: erster Buzzer antwortet, falsch sperrt, alle falsch beendet den Film', () => {
  const { db, ids } = setup(3);
  use(db, 'filmab', { films: [{ title: 'Titanic', aliases: '', clip: { id: 'media_abcdefabcdef12', type: 'video/mp4', name: 'c' } }] });
  act(db, mod(), 'open', { index: 0 });
  assert.throws(() => act(db, team(ids[0]), 'buzz'), /läuft noch nicht/);
  act(db, mod(), 'play', { restart: true });
  const t = clock;
  act(db, team(ids[1], t), 'buzz');
  assert.throws(() => act(db, team(ids[0], t), 'buzz'), /antwortet gerade/); // fast gleichzeitig: nur einer
  assert.equal(pv(db).playback.state, 'paused');
  act(db, mod(), 'judge', { correct: false });
  assert.ok(tv(db, ids[1]).locked);
  assert.equal(pv(db).playback.state, 'playing'); // Clip läuft noch einmal von vorn
  assert.equal(pv(db).playback.restart, true);
  act(db, team(ids[0]), 'buzz');
  act(db, mod(), 'judge', { correct: false });
  act(db, team(ids[2]), 'buzz');
  act(db, mod(), 'judge', { correct: false });
  assert.ok(pv(db).resolved);
  assert.equal(pv(db).title, 'Titanic');
  assert.deepEqual(Object.values(totals(db)), [0, 0, 0]);
});

test('Film ab: richtige Antwort gibt genau einen Punkt', () => {
  const { db, ids } = setup(2);
  use(db, 'filmab', { films: [{ title: 'Titanic', aliases: '', clip: { id: 'media_abcdefabcdef12', type: 'video/mp4', name: 'c' } }] });
  act(db, mod(), 'open', { index: 0 });
  act(db, mod(), 'play', {});
  act(db, team(ids[0]), 'buzz');
  act(db, mod(), 'judge', { correct: true });
  assert.throws(() => act(db, team(ids[1]), 'buzz'), /beendet/);
  assert.equal(totals(db)[ids[0]], 1);
});

test('Ich weiß nicht (neue Regeln): alle schreiben, Buzzer wählt geheim, Auflösung Schritt für Schritt, bis +2', () => {
  const { db, ids } = setup(4);
  const [A, B, C, D] = ids;
  use(db, 'weissnicht');
  act(db, mod(), 'open', { index: 0 });
  assert.throws(() => act(db, team(A), 'buzz'), /Erst die eigene Antwort/);
  act(db, team(A), 'submit', { ink });
  act(db, team(A), 'buzz');
  act(db, team(B), 'submit', { ink }); // Buzzer blockiert die Abgabe nicht
  assert.throws(() => act(db, team(B), 'buzz'), /schneller/);
  assert.throws(() => act(db, team(A), 'pick', { teamId: A }), /anderes Team/);
  assert.throws(() => act(db, team(B), 'pick', { teamId: C }), /zuerst gebuzzert/);
  assert.deepEqual(tv(db, A).choose.sort(), [B, C, D].sort());
  act(db, team(A), 'pick', { teamId: C }); // C schreibt noch – trotzdem wählbar
  // Geheim, bis alle abgegeben haben
  assert.equal(pv(db).target, null);
  assert.equal(tv(db, C).isTarget, false);
  assert.equal(tv(db, A).myTarget, C);
  act(db, team(C), 'submit', { ink });
  assert.throws(() => act(db, mod(), 'reveal'), /nicht alle/);
  act(db, team(D), 'submit', { ink });
  assert.equal(pv(db).target, C);
  assert.equal(tv(db, C).isTarget, true);
  for (const [id, ok] of [[A, true], [B, true], [C, false], [D, false]]) act(db, mod(), 'grade', { teamId: id, correct: ok });
  const fx0 = { ...db.live.effect };
  // 1. gewähltes Team, 2. Antwort, 3. Bewertung
  act(db, mod(), 'reveal');
  assert.equal(pv(db).focus.targetShown, false);
  act(db, mod(), 'reveal');
  assert.ok(pv(db).focus.targetInk);
  assert.equal(pv(db).focus.targetCorrect, undefined);
  assert.deepEqual(db.live.effect, fx0); // noch kein Ton
  assert.throws(() => act(db, mod(), 'grade', { teamId: C, correct: true }), /Auflösung/);
  act(db, mod(), 'reveal');
  assert.equal(pv(db).focus.targetCorrect, false);
  assert.equal(pv(db).focus.guessRight, true);
  assert.equal(totals(db)[A], 1);
  // 4. Antwort Buzzer-Team, 5. Bewertung: nochmal +1
  act(db, mod(), 'reveal');
  assert.ok(pv(db).focus.buzzerInk);
  assert.equal(totals(db)[A], 1);
  act(db, mod(), 'reveal');
  assert.equal(pv(db).focus.buzzerCorrect, true);
  assert.equal(totals(db)[A], 2);
  assert.equal(tv(db, A).mine.points, 2);
  assert.equal(totals(db)[B], 0); // B erst in der Schlussauflösung
  // 6. alle übrigen gleichzeitig, ohne Richtig-/Falsch-Ton
  act(db, mod(), 'reveal');
  assert.equal(db.live.effect.kind, 'show');
  assert.deepEqual(pv(db).rest.map((x) => [x.teamId, x.points]).sort(), [[B, 1], [D, 0]].sort());
  assert.equal(totals(db)[B], 1);
  assert.equal(totals(db)[C], 0);
  assert.throws(() => act(db, mod(), 'reveal'), /schon aufgelöst/);
});

test('Ich weiß nicht (neue Regeln): gewähltes Team wusste es → +1 dafür, Buzzer 0 trotz eigener richtiger Antwort; keine Abgabe zählt als nicht gewusst', () => {
  const { db, ids } = setup(3);
  const [A, B, C] = ids;
  use(db, 'weissnicht');
  act(db, mod(), 'open', { index: 0 });
  for (const id of ids) act(db, team(id), 'submit', { ink });
  act(db, team(B), 'buzz');
  act(db, team(B), 'pick', { teamId: A });
  for (const id of ids) act(db, mod(), 'grade', { teamId: id, correct: true });
  for (let k = 0; k < 3; k++) act(db, mod(), 'reveal');
  assert.equal(pv(db).focus.guessRight, false);
  assert.equal(totals(db)[A], 1);
  assert.equal(totals(db)[B], 0);
  act(db, mod(), 'reveal'); // direkt Schlussauflösung (kein Buzzer-Einzelschritt)
  assert.equal(pv(db).revealed, true);
  assert.deepEqual(pv(db).rest.map((x) => [x.teamId, x.points, x.lost]).sort(), [[B, 0, true], [C, 1, false]].sort());
  assert.equal(totals(db)[B], 0);
  assert.equal(totals(db)[C], 1);
  // Runde 2: gewähltes Team gibt nichts ab → wie falsch: Buzzer +1
  act(db, mod(), 'open', { index: 1 });
  act(db, team(A), 'submit', { ink });
  act(db, team(A), 'buzz');
  act(db, team(A), 'pick', { teamId: C });
  act(db, team(B), 'submit', { ink });
  act(db, mod(), 'closeSubmissions');
  act(db, mod(), 'grade', { teamId: A, correct: false });
  act(db, mod(), 'grade', { teamId: B, correct: true });
  for (let k = 0; k < 3; k++) act(db, mod(), 'reveal');
  assert.equal(pv(db).focus.guessRight, true);
  assert.equal(totals(db)[A], 2); // 1 aus Runde 1 + 1 Wahl
  act(db, mod(), 'reveal'); act(db, mod(), 'reveal'); // eigene Antwort falsch: kein Extrapunkt
  assert.equal(totals(db)[A], 2);
  act(db, mod(), 'reveal');
  assert.equal(totals(db)[B], 1);
});

test('Ich weiß nicht (neue Regeln): ohne Buzzer alle gleichzeitig', () => {
  const { db, ids } = setup(2);
  use(db, 'weissnicht');
  act(db, mod(), 'open', { index: 0 });
  for (const id of ids) act(db, team(id), 'submit', { ink });
  act(db, mod(), 'grade', { teamId: ids[0], correct: true });
  act(db, mod(), 'grade', { teamId: ids[1], correct: false });
  act(db, mod(), 'reveal');
  assert.equal(pv(db).revealed, true);
  assert.equal(totals(db)[ids[0]], 1);
  assert.equal(totals(db)[ids[1]], 0);
});

test('Ich weiß nicht 2.0: Abgabe trotz fremdem Buzzer, Einschätzung schon während andere schreiben, alles oder nichts', () => {
  const { db, ids } = setup(4);
  use(db, 'weissnicht2');
  act(db, mod(), 'open', { index: 0 });
  assert.throws(() => act(db, team(ids[0]), 'buzz'), /Erst die eigene Antwort/);
  act(db, team(ids[0]), 'submit', { ink });
  act(db, team(ids[0]), 'buzz');
  act(db, team(ids[1]), 'submit', { ink }); // nach dem Buzzer weiter abgeben
  assert.throws(() => act(db, team(ids[1]), 'buzz'), /schneller/);
  // Sofort einschätzen: alle anderen Teams, auch die, die noch schreiben.
  assert.deepEqual(tv(db, ids[0]).guessTeams.sort(), [ids[1], ids[2], ids[3]].sort());
  assert.deepEqual(tv(db, ids[0]).pendingTeams.sort(), [ids[2], ids[3]].sort());
  assert.equal(pv(db).answers.length, 0); // nichts öffentlich vor der Auswertung
  assert.throws(() => act(db, team(ids[0]), 'guess', { guesses: {} }), /mindestens ein Team/);
  act(db, team(ids[0]), 'guess', { guesses: { [ids[1]]: true, [ids[2]]: false } }); // ids[2] schreibt noch, ids[3] ausgelassen
  act(db, team(ids[2]), 'submit', { ink }); // Antwort folgt nach der Einschätzung
  assert.throws(() => act(db, mod(), 'evaluate'), /nicht alle/);
  act(db, team(ids[3]), 'submit', { ink }); // schreibt nach der Einschätzung noch fertig
  for (const [i, ok] of [[0, true], [1, true], [2, false], [3, true]]) act(db, mod(), 'grade', { teamId: ids[i], correct: ok });
  act(db, mod(), 'evaluate');
  assert.equal(totals(db)[ids[0]], 3); // 2 richtige Einschätzungen + eigene Antwort
  assert.equal(totals(db)[ids[1]], 1); // richtige Antwort, nicht gebuzzert: +1
  assert.equal(totals(db)[ids[2]], 0);
  assert.equal(totals(db)[ids[3]], 1);
  // Eine falsche Einschätzung → 0 für das Buzzer-Team, auch für die eigene richtige Antwort.
  act(db, mod(), 'open', { index: 1 });
  for (const id of ids) act(db, team(id), 'submit', { ink });
  act(db, team(ids[1]), 'buzz');
  act(db, team(ids[1]), 'guess', { guesses: { [ids[0]]: true, [ids[2]]: true } });
  for (const [i, ok] of [[0, true], [1, true], [2, false], [3, false]]) act(db, mod(), 'grade', { teamId: ids[i], correct: ok });
  act(db, mod(), 'evaluate');
  assert.equal(totals(db)[ids[1]], 1); // unverändert: 1 aus Runde 1, Runde 2 bringt 0
  assert.equal(totals(db)[ids[0]], 4); // +1 für die richtige Antwort ohne Buzzer
});

test('Hits me baby, one more time: Stufe beim Abschicken zählt, andere bleiben frei, Punkte erst nach Bestätigung', () => {
  const { db, ids } = setup(3);
  use(db, 'konsequenz', { points: '5, 4, 3, 2, 1', songs: [{ audio: { id: 'media_abcdefabcdef12', type: 'audio/mpeg', name: 's' }, title: 'Song', start: 0 }] });
  act(db, mod(), 'open', { index: 0 });
  assert.throws(() => act(db, team(ids[0]), 'submit', { ink }), /noch nicht angespielt/);
  act(db, mod(), 'next'); // 0,5 s
  act(db, team(ids[0]), 'submit', { ink });
  act(db, mod(), 'next'); // 1 s
  act(db, mod(), 'next'); // 3 s
  act(db, team(ids[1]), 'submit', { ink });
  assert.throws(() => act(db, team(ids[1]), 'submit', { ink }), /schon/);
  act(db, mod(), 'grade', { teamId: ids[0], correct: true });
  assert.throws(() => act(db, mod(), 'award'), /Noch nicht bewertet/);
  act(db, mod(), 'grade', { teamId: ids[1], correct: true });
  assert.equal(totals(db)[ids[0]], 0); // erst mit Bestätigung
  act(db, mod(), 'award');
  assert.equal(totals(db)[ids[0]], 5);
  assert.equal(totals(db)[ids[1]], 3);
  assert.throws(() => act(db, team(ids[2]), 'submit', { ink }), /geschlossen/);
});

test('Song Song Song: Buzzer sperrt keine anderen Teams, Prüfung in Buzzer-Reihenfolge, Auflösung Schritt für Schritt', () => {
  const { db, ids } = setup(3);
  use(db, 'songsong', { puzzles: [{ audio: { id: 'media_abcdefabcdef12', type: 'audio/mpeg', name: 's' }, melody: 'A', lyrics: 'B' }] });
  act(db, mod(), 'open', { index: 0 });
  act(db, mod(), 'play');
  act(db, team(ids[2]), 'submit', { ink });
  act(db, team(ids[0]), 'submit', { ink }); // andere weiterhin frei
  assert.ok(tv(db, ids[1]).canSubmit);
  assert.deepEqual(pv(db).order.map((o) => o.teamId), [ids[2], ids[0]]);
  act(db, team(ids[1]), 'submit', { ink }); // dritte Abgabe – wird später nicht gezeigt
  act(db, mod(), 'judge', { correct: false }); // ids[2]: nur ein Titel richtig
  act(db, mod(), 'judge', { correct: true }); // ids[0]: beide richtig
  assert.equal(totals(db)[ids[0]], 1);
  // Noch geheim: Beamer zeigt keine Wertung, iPad kein Ergebnis, Musik läuft weiter.
  assert.equal(pv(db).winner, null);
  assert.equal(pv(db).board, null);
  assert.equal(tv(db, ids[0]).won, false);
  assert.equal(tv(db, ids[2]).grade, null);
  assert.equal(pv(db).playback.state, 'playing');
  // 1. Team: Name → Antwort → Bewertung (falsch)
  act(db, mod(), 'reveal');
  assert.deepEqual(pv(db).board.map((b) => [b.teamId, b.hidden, b.grade]), [[ids[2], true, null]]);
  act(db, mod(), 'reveal');
  assert.equal(pv(db).board[0].hidden, false);
  assert.equal(pv(db).board[0].grade, null);
  act(db, mod(), 'reveal');
  assert.equal(pv(db).board[0].grade, false);
  assert.equal(tv(db, ids[2]).grade, false);
  // 2. Team: richtig
  act(db, mod(), 'reveal'); act(db, mod(), 'reveal'); act(db, mod(), 'reveal');
  assert.equal(pv(db).board[1].grade, true);
  assert.equal(tv(db, ids[0]).won, true);
  assert.equal(pv(db).solution, null);
  // Lösung; danach alle Tafeln nebeneinander, auch das dritte Team (ohne Wertung)
  act(db, mod(), 'reveal');
  assert.deepEqual(pv(db).solution, ['A', 'B']);
  assert.deepEqual(pv(db).board.map((b) => [b.teamId, b.grade]), [[ids[2], false], [ids[0], true], [ids[1], null]]);
  assert.equal(pv(db).winner, ids[0]);
  assert.equal(pv(db).playback.state, 'playing'); // ohne Auflösungs-Ton läuft das Mash-up weiter
  assert.throws(() => act(db, mod(), 'reveal'), /schon aufgelöst/);
});

test('Song Song Song: niemand richtig – Auflösung zeigt alle, dann Lösung mit Ton (stoppt das Mash-up)', () => {
  const { db, ids } = setup(2);
  use(db, 'songsong', { puzzles: [{ audio: { id: 'media_abcdefabcdef12', type: 'audio/mpeg', name: 's' }, melody: 'A', lyrics: 'B', reveal: { id: 'media_abcdefabcdef13', type: 'video/mp4', name: 'r' } }] });
  act(db, mod(), 'open', { index: 0 });
  act(db, mod(), 'play');
  act(db, team(ids[0]), 'submit', { ink });
  assert.throws(() => act(db, mod(), 'reveal'), /prüfen/);
  act(db, mod(), 'judge', { correct: false });
  for (let i = 0; i < 3; i++) act(db, mod(), 'reveal');
  assert.equal(pv(db).reveal, null);
  act(db, mod(), 'reveal');
  assert.equal(pv(db).reveal.id, 'media_abcdefabcdef13');
  assert.equal(pv(db).playback.state, 'stopped');
  assert.equal(totals(db)[ids[0]], 0);
});

test('DankeGleichFalsch: falscher Begriff bleibt geheim, Timeout scheidet aus, Aussteigen sichert', () => {
  const { db, ids } = setup(3);
  use(db, 'dgf', { seconds: 60 });
  act(db, mod(), 'open', { catIndex: 0 });
  const st = db.live.games[db.live.activeGame];
  const r = st.rounds[0];
  const order = r.order;
  const turnTeam = () => order[r.turn];
  const right = r.board.filter((b) => !b.wrong);
  const wrong = r.board.find((b) => b.wrong);
  // Erstes Team: richtig, dann sichert es.
  let a = turnTeam();
  act(db, team(a), 'pick', { termId: right[0].id });
  act(db, team(a), 'secure');
  assert.equal(totals(db)[a], 1);
  // Zweites Team wählt falsch: ausgeschieden, Begriff bleibt, ist nirgends als falsch erkennbar.
  const b = turnTeam();
  act(db, team(b), 'pick', { termId: wrong.id });
  const beamer = pv(db);
  assert.ok(beamer.board.some((x) => x.id === wrong.id && !x.gone));
  assert.ok(beamer.board.every((x) => x.wrong === undefined));
  assert.ok(tv(db, b).board.some((x) => x.id === wrong.id));
  assert.equal(JSON.stringify(game.teamView(db, a)).includes(wrong.text) && JSON.stringify(game.teamView(db, a)).includes('"wrong":true'), false);
  assert.equal(tv(db, b).out, 'wrong');
  assert.equal(totals(db)[b] || 0, 0);
  // Drittes Team lässt die Zeit ablaufen → ausgeschieden, Kategorie vorbei (niemand mehr im Spiel).
  const c = turnTeam();
  assert.notEqual(c, a);
  game.tick(db, r.deadline + 1);
  assert.equal(tv(db, c).out, 'timeout');
  assert.ok(pv(db).done);
  assert.ok(pv(db).board.some((x) => x.wrong === true)); // erst jetzt aufgedeckt
});

test('DankeGleichFalsch: alle 22 gefunden → Teams im Spiel bekommen ihre Punkte automatisch', () => {
  const { db, ids } = setup(2);
  use(db, 'dgf', { seconds: 60 });
  act(db, mod(), 'open', { catIndex: 0 });
  const r = db.live.games[db.live.activeGame].rounds[0];
  for (const term of r.board.filter((x) => !x.wrong)) act(db, team(r.order[r.turn]), 'pick', { termId: term.id });
  assert.ok(pv(db).done);
  assert.equal(totals(db)[ids[0]] + totals(db)[ids[1]], 22);
});

test('Erst ich, dann du: sichern, zocken, falsch verliert Ungesichertes, Frage bleibt für andere', () => {
  const { db, ids } = setup(3);
  use(db, 'zocken');
  act(db, mod(), 'open', { q: 0 });
  act(db, team(ids[0]), 'buzz');
  assert.throws(() => act(db, team(ids[1]), 'buzz'), /antwortet gerade/);
  act(db, mod(), 'judge', { correct: true });
  assert.equal(tv(db, ids[0]).streak, 1);
  act(db, team(ids[0]), 'decide', { choice: 'zock' });
  act(db, team(ids[0]), 'choose', { q: 5 });
  assert.throws(() => act(db, team(ids[1]), 'buzz'), /allein/);
  act(db, mod(), 'judge', { correct: true });
  act(db, team(ids[0]), 'decide', { choice: 'zock' });
  act(db, team(ids[0]), 'choose', { q: 6 });
  act(db, mod(), 'judge', { correct: false }); // 2 ungesicherte weg
  assert.equal(tv(db, ids[0]).streak, 0);
  assert.equal(totals(db)[ids[0]], 0);
  assert.ok(!pv(db).removed.includes(6));
  assert.throws(() => act(db, team(ids[0]), 'buzz'), /gesperrt/);
  act(db, team(ids[1]), 'buzz');
  act(db, mod(), 'judge', { correct: true });
  act(db, team(ids[1]), 'decide', { choice: 'secure' });
  assert.equal(totals(db)[ids[1]], 1);
  assert.deepEqual(pv(db).removed.sort((x, y) => x - y), [0, 5, 6]);
});

test('Habt ihr noch Fragen?: nur Frage öffentlich, 20 Sekunden, Wertung +1/−1 bzw. +2', () => {
  const { db, ids } = setup(3);
  use(db, 'fragen', { seconds: 20 });
  act(db, mod(), 'open', { catIndex: 0 });
  assert.throws(() => act(db, team(ids[0]), 'propose', { qInk: ink }), /Frage UND/);
  act(db, team(ids[1]), 'propose', { qInk: ink, aInk: 'data:image/png;base64,QUFB' });
  act(db, team(ids[0]), 'propose', { qInk: ink, aInk: 'data:image/png;base64,QUFB' }); // andere bleiben frei
  act(db, mod(), 'reject', { teamId: ids[1], reason: 'privat' });
  act(db, mod(), 'accept', { teamId: ids[0] });
  const t0 = clock;
  game.applyAction(db, { ...mod(), now: t0 }, 'play.publish', {});
  const v = pv(db);
  assert.equal(v.question, ink);
  assert.equal(v.solution, null);
  assert.ok(!JSON.stringify(v).includes('QUFB')); // hinterlegte Antwort nie auf dem Beamer
  assert.equal(v.deadline - t0, 20000);
  assert.throws(() => act(db, team(ids[0]), 'answer', { ink }), /eigene Frage/);
  act(db, team(ids[1], t0 + 5000), 'answer', { ink });
  assert.throws(() => act(db, team(ids[2], t0 + 25000), 'answer', { ink }), /abgelaufen/);
  act(db, mod(), 'grade', { teamId: ids[1], correct: true });
  assert.throws(() => game.applyAction(db, { ...mod(), now: t0 + 1000 }, 'play.evaluate', {}), /läuft noch/);
  game.applyAction(db, { ...mod(), now: t0 + 21000 }, 'play.evaluate', {});
  assert.equal(pv(db).answers.length, 1);
  assert.ok(pv(db).solution.includes('QUFB')); // bei der Auflösung: Antwort des fragenden Teams
  assert.equal(totals(db)[ids[1]], 1);
  assert.equal(totals(db)[ids[0]], -1);
});

test('Das geht mir zu weit: Differenzen, Grenzen, +2/−1 und Gleichstand durch die Moderation', () => {
  const { db, ids } = setup(3);
  use(db, 'zuweit', { rounds: [
    { task: 'Elemente', dataset: 'Chemische Elemente (Ordnungszahl)', mode: 'Kleinste Differenz', min: null, max: null, asOf: '', fixes: '', tie: 'Moderation entscheidet' },
    { task: 'Präsidenten', dataset: 'US-Präsidenten (Alter beim ersten Amtsantritt)', mode: 'Größte Differenz', min: null, max: null, asOf: '', fixes: '', tie: 'Alle Gleichplatzierten bekommen die Punkte' },
    { task: 'Schauspieler', dataset: 'Schauspieler/innen (Alter)', mode: 'Kleinste Differenz', min: 20, max: 60, asOf: '2026-10-26', fixes: '', tie: 'Moderation entscheidet' },
  ] });
  act(db, mod(), 'open', { index: 0 });
  assert.throws(() => act(db, team(ids[0]), 'submit', { a: 'Gold', b: 'Gold' }), /unterschiedliche/);
  assert.throws(() => act(db, team(ids[0]), 'submit', { a: 'Gold', b: 'Kryptonitxx' }), /Liste/);
  act(db, team(ids[0]), 'submit', { a: 'Gold', b: 'Quecksilber' }); // 79/80 → 1
  act(db, team(ids[1]), 'submit', { a: 'Wasserstoff', b: 'Helium' }); // 1
  act(db, team(ids[2]), 'submit', { a: 'Eisen', b: 'Gold' }); // 53
  const res = act(db, mod(), 'evaluate', {});
  assert.ok(res.notice); // Gleichstand auf Platz 1
  act(db, mod(), 'resolveTie', { best: [ids[0], ids[1]] });
  assert.deepEqual([totals(db)[ids[0]], totals(db)[ids[1]], totals(db)[ids[2]]], [2, 2, -1]);
  // Trump zählt mit seinem ersten Amtsantritt 2017 (70 Jahre), nicht 2025.
  act(db, mod(), 'open', { index: 1 });
  act(db, team(ids[0]), 'submit', { a: 'Donald Trump', b: 'Theodore Roosevelt' });
  act(db, team(ids[1]), 'submit', { a: 'John F. Kennedy', b: 'Barack Obama' });
  act(db, team(ids[2]), 'submit', { a: 'Joe Biden', b: 'Ronald Reagan' });
  act(db, mod(), 'evaluate', {});
  const rows = pv(db).rows;
  const trump = rows.find((x) => x.teamId === ids[0]);
  assert.ok(Math.abs(trump.va - 70.6) < 0.1, String(trump.va));
  assert.ok(trump.best);
  // Außerhalb der Grenzen (Clint Eastwood > 60) ist ungültig und zählt als schlechtestes Ergebnis.
  act(db, mod(), 'open', { index: 2 });
  act(db, team(ids[0]), 'submit', { a: 'Clint Eastwood', b: 'Judi Dench' });
  act(db, team(ids[1]), 'submit', { a: 'Emma Watson', b: 'Jennifer Lawrence' });
  act(db, team(ids[2]), 'submit', { a: 'Ryan Gosling', b: 'Natalie Portman' });
  const res3 = act(db, mod(), 'evaluate', {});
  const r3 = pv(db).rows;
  assert.equal(res3.notice, undefined, JSON.stringify(db.live.games[db.live.activeGame].rounds[2]));
  assert.equal(r3.at(-1).teamId, ids[0]);
  assert.equal(r3.at(-1).valid, false);
  assert.ok(r3.find((x) => x.teamId === ids[1]).best);
});

test('Das geht mir zu weit: Korrekturen im Editor überschreiben die Datenbank', () => {
  const { datasetByName, entriesFor } = require('../server/datasets');
  const ds = datasetByName('Bundesliga-Tabelle (Platz)');
  const list = entriesFor(ds, 'FC Bayern München; 3\nNeuer Verein; 19');
  assert.equal(list.find((e) => e.name === 'FC Bayern München').value, 3);
  assert.equal(list.find((e) => e.name === 'Neuer Verein').value, 19);
});

test('Brain or Dreh\'n: Joker, Glücksrad, Sperren, Reset nur Spielpunkte, Geheimnisse bleiben geheim', () => {
  const { db, ids } = setup(3);
  const [A, B, C] = ids;
  ids.forEach((id, i) => game.applyAction(db, mod(), 'points.adjust', { teamId: id, points: 10 + i, reason: 'Vorher' }));
  const g = use(db, 'brain');
  const st = () => db.live.games[g.id];
  act(db, mod(), 'start');
  act(db, mod(), 'showQuestion');
  const q0 = g.content.rounds[0].correct;
  const wrong0 = ['A', 'B', 'C', 'D'].find((l) => l !== q0);
  act(db, team(A), 'answer', { choice: q0 });
  act(db, team(B), 'answer', { choice: q0 });
  act(db, team(C), 'answer', { choice: wrong0 });
  act(db, mod(), 'evaluate');
  assert.equal(tv(db, A).points, 1);
  assert.equal(pv(db).points.find((x) => x.teamId === A).points, 1); // Spielpunkte aller Teams dauerhaft sichtbar
  act(db, mod(), 'openWheel');
  assert.throws(() => act(db, team(C), 'wheelBuzz'), /richtiger Antwort/);
  act(db, team(B), 'wheelBuzz');
  assert.throws(() => act(db, team(A), 'wheelBuzz'), /schneller/);
  // Rad fest auf „Doppelpunkt“ (Index 0), damit der Test nicht vom Zufall abhängt.
  const coreMod = require('../server/core');
  const realRandom = coreMod.randomInt;
  coreMod.randomInt = () => 0;
  try { act(db, team(B), 'spin'); } finally { coreMod.randomInt = realRandom; }
  assert.ok(pv(db).wheel.spin.field);
  // Joker gezielt in den Vorrat legen, um die Wirkungen zu prüfen.
  const s = st();
  s.t[A].jokers = [{ id: 'jd', key: 'detektiv' }, { id: 'jr', key: 'raeuber' }];
  s.t[B].jokers = [{ id: 'jt', key: 'tausch' }];
  s.t[C].jokers = [];
  act(db, mod(), 'next');
  // Detektiv: A beobachtet B heimlich.
  act(db, team(A), 'useJoker', { jokerId: 'jd', target: B });
  assert.throws(() => act(db, team(B), 'useJoker', { jokerId: 'jt', target: A }), /schon ein Joker/);
  assert.equal(pv(db).joker.secret, true);
  assert.ok(!JSON.stringify(game.teamView(db, B)).includes('detektiv'));
  act(db, mod(), 'showQuestion');
  assert.throws(() => act(db, team(A), 'answer', { choice: 'A' }), /beobachtete Team/);
  assert.equal(tv(db, A).detective.answer, null);
  act(db, team(B), 'answer', { choice: 'C' });
  assert.equal(tv(db, A).detective.answer, 'C');
  assert.equal(tv(db, C).detective, null);
  act(db, team(A), 'answer', { choice: 'C' });
  act(db, mod(), 'evaluate');
  // Punkteräuber mit weniger als 2 beim Opfer: nur was da ist, nie unter 0.
  s.t[C].points = 1;
  act(db, mod(), 'next');
  act(db, team(A), 'useJoker', { jokerId: 'jr', target: C });
  assert.equal(s.t[C].points, 0);
  // Reset betrifft nur die Spielpunkte, nicht den Show-Gesamtstand.
  const before = totals(db)[A];
  s.t[A].points = 5;
  require('../server/play-brain'); // Wirkung direkt über das Rad simulieren:
  s.r.phase = 'wheel'; s.r.correct = [A]; s.r.buzz = A; s.r.spin = null;
  const orig = Math.random;
  const core = require('../server/core');
  const ri = core.randomInt;
  // „Reset“ als 6. fieses Feld aufs Rad legen (Index 11) und das Rad deterministisch darauf stellen.
  g.content.bad.slots[5] = { joker: 'reset' };
  core.randomInt = () => 11;
  try { act(db, team(A), 'spin'); } finally { core.randomInt = ri; Math.random = orig; }
  assert.equal(s.t[A].points, 0);
  assert.equal(totals(db)[A], before);
  // Spiel beenden: Spielpunkte gehen einmalig in den Gesamtstand.
  s.t[B].points = 4;
  act(db, mod(), 'finish');
  assert.equal(totals(db)[B], 11 + 4);
  act(db, mod(), 'finish'); // doppelt: keine doppelten Punkte
  assert.equal(totals(db)[B], 11 + 4);
});

test('Brain or Dreh\'n: Antworttausch wertet die getauschte Antwort, Original des Gegners bleibt', () => {
  const { db, ids } = setup(2);
  const [A, B] = ids;
  const g = use(db, 'brain');
  act(db, mod(), 'start');
  db.live.games[g.id].t[A].jokers = [{ id: 'jt', key: 'tausch' }];
  act(db, team(A), 'useJoker', { jokerId: 'jt', target: B });
  act(db, mod(), 'showQuestion');
  const right = g.content.rounds[0].correct;
  const wrong = ['A', 'B', 'C', 'D'].find((l) => l !== right);
  act(db, team(A), 'answer', { choice: wrong });
  assert.equal(tv(db, A).swap.ready, false);
  act(db, team(B), 'answer', { choice: right });
  assert.equal(tv(db, A).swap.theirs, right);
  assert.equal(tv(db, B).swap, null); // B erfährt nichts
  act(db, team(A), 'swap', { swap: true });
  act(db, mod(), 'evaluate');
  assert.equal(tv(db, A).points, 1);
  assert.equal(tv(db, B).points, 1);
  assert.equal(db.live.games[g.id].r.answers[B].choice, right);
});

test('Brain or Dreh\'n: Joker-Dieb nur einsetzbar, wenn ein anderes Team Joker hat', () => {
  const { db, ids } = setup(3);
  const [A, B, C] = ids;
  const g = use(db, 'brain');
  act(db, mod(), 'start');
  const st = db.live.games[g.id];
  st.t[A].jokers = [{ id: 'jd', key: 'dieb' }];
  assert.equal(tv(db, A).jokers[0].usable, false);
  assert.throws(() => act(db, team(A), 'useJoker', { jokerId: 'jd', target: B }), /Kein anderes Team/);
  st.t[C].jokers = [{ id: 'jx', key: 'fifty' }];
  assert.equal(tv(db, A).jokers[0].usable, true);
  assert.deepEqual(tv(db, A).jokers[0].targets, [C]);
  assert.throws(() => act(db, team(A), 'useJoker', { jokerId: 'jd', target: B }), /keinen Joker/);
  act(db, team(A), 'useJoker', { jokerId: 'jd', target: C });
  assert.equal(st.t[A].jokers[0].key, 'fifty');
});

test('Danke, gleichfalsch!: alter Name wird korrigiert, eigene Namen bleiben', () => {
  const db = game.createState();
  const e = db.library.find((x) => x.type === 'dgf');
  assert.equal(e.title, 'Danke, gleichfalsch!');
  e.title = 'DankeGleichFalsch';
  const other = structuredClone(e); other.id = 'lib_x'; other.title = 'Mein DGF';
  db.library.push(other);
  game.migrate(db);
  assert.equal(e.title, 'Danke, gleichfalsch!');
  assert.equal(other.title, 'Mein DGF');
});

test('Erst ich, dann du: Beamer zeigt, wie viele Punkte gerade auf dem Spiel stehen', () => {
  const { db, ids } = setup(2);
  use(db, 'zocken');
  act(db, mod(), 'open', { q: 0 });
  act(db, team(ids[0]), 'buzz');
  act(db, mod(), 'judge', { correct: true });
  assert.deepEqual(pv(db).series, { teamId: ids[0], v: 1, phase: 'decide' });
  act(db, team(ids[0]), 'decide', { choice: 'zock' });
  act(db, team(ids[0]), 'choose', { q: 1 });
  assert.equal(pv(db).series.phase, 'zock');
  act(db, mod(), 'judge', { correct: true });
  assert.equal(pv(db).series.v, 2);
  act(db, team(ids[0]), 'decide', { choice: 'secure' });
  assert.deepEqual(pv(db).last, { teamId: ids[0], kind: 'secured', v: 2 });
});

test('Ich sehe ein Land: Karte je Aufgabe, sonst Standard-Karte des Spiels', () => {
  const { db, ids } = setup(2);
  const g = db.project.games.find((x) => x.type === 'land');
  const content = structuredClone(g.content);
  content.map = 'Welt';
  content.tasks = [
    { question: 'Wo liegt Kassel?', map: 'Deutschland', target: 'Kassel', lat: 51.316, lng: 9.498 },
    { question: 'Wo liegt Paris?', map: 'Standard-Karte des Spiels', target: 'Paris', lat: 48.857, lng: 2.352 },
  ];
  game.applyAction(db, mod(), 'game.update', { gameId: g.id, content });
  game.applyAction(db, mod(), 'show.activate', { gameId: g.id });
  db.live.beamer = { view: 'game', data: {} };
  act(db, mod(), 'open', { taskIndex: 0 });
  assert.equal(pv(db).map, 'Deutschland');
  assert.equal(tv(db, ids[0]).map, 'Deutschland');
  act(db, mod(), 'open', { taskIndex: 1 });
  assert.equal(pv(db).map, 'Welt');
});

test('Ich sehe ein Land: Bild zur Aufgabe geht an Beamer und Teams', () => {
  const { db, ids } = setup(2);
  const g = db.project.games.find((x) => x.type === 'land');
  const content = structuredClone(g.content);
  content.tasks = [{ question: 'Wo steht dieses Wahrzeichen?', map: 'Welt', image: { id: 'media_abcdefabcdef99', type: 'image/jpeg', name: 'turm.jpg', size: 5 }, target: 'Paris', lat: 48.858, lng: 2.294 }];
  game.applyAction(db, mod(), 'game.update', { gameId: g.id, content });
  assert.ok(game.referencedMedia(db).has('media_abcdefabcdef99'));
  game.applyAction(db, mod(), 'show.activate', { gameId: g.id });
  db.live.beamer = { view: 'game', data: {} };
  act(db, mod(), 'open', { taskIndex: 0 });
  assert.deepEqual(pv(db).image, { id: 'media_abcdefabcdef99', type: 'image/jpeg' });
  assert.deepEqual(tv(db, ids[0]).image, { id: 'media_abcdefabcdef99', type: 'image/jpeg' });
});

test('Umbenennung: „Keine Kon-Sequenz“ heißt jetzt „Hits me baby, one more time“, eigene Namen bleiben', () => {
  const g = require('../server/game');
  const db = g.createState();
  const lib = db.library.find((e) => e.type === 'konsequenz');
  lib.title = 'Keine Kon-Sequenz';
  const other = { ...lib, id: 'lib_x', title: 'Mein eigener Name' };
  db.library.push(other);
  g.migrate(db);
  assert.equal(db.library.find((e) => e.id === lib.id).title, 'Hits me baby, one more time');
  assert.equal(db.library.find((e) => e.id === 'lib_x').title, 'Mein eigener Name');
});

test('Das geht mir zu weit: Liste nur auf Anfrage, Eingabe tolerant (Groß/klein, Akzente, Tippfehler)', () => {
  const { db, ids } = setup(2);
  use(db, 'zuweit');
  act(db, mod(), 'open', { index: 0 });
  const v = tv(db, ids[0]);
  assert.equal(v.options, undefined); // nicht mehr bei jeder Aktualisierung
  assert.ok(v.optionsKey);
  const res = game.applyAction(db, team(ids[0]), 'play.options', {});
  assert.ok(Array.isArray(res.data) && res.data.length > 10);
  const [x, y] = res.data;
  const typo = (s) => s.toUpperCase().replace(/E/, '3'); // GROSS geschrieben und ein Tippfehler
  act(db, team(ids[0]), 'submit', { a: typo(x), b: y.toLowerCase() });
  assert.throws(() => act(db, team(ids[1]), 'submit', { a: 'völlig unbekannt xyz', b: y }), /nicht in der Liste/);
});

test('Ich weiß nicht 2.0: Einschätzung eines Teams ohne Abgabe zählt nicht', () => {
  const { db, ids } = setup(3);
  use(db, 'weissnicht2');
  act(db, mod(), 'open', { index: 0 });
  act(db, team(ids[0]), 'submit', { ink });
  act(db, team(ids[0]), 'buzz');
  act(db, team(ids[0]), 'guess', { guesses: { [ids[1]]: true, [ids[2]]: true } });
  act(db, team(ids[1]), 'submit', { ink });
  act(db, mod(), 'closeSubmissions'); // ids[2] gibt nie ab
  act(db, mod(), 'grade', { teamId: ids[0], correct: true });
  act(db, mod(), 'grade', { teamId: ids[1], correct: true });
  act(db, mod(), 'evaluate');
  assert.equal(totals(db)[ids[0]], 2); // 1 Einschätzung + eigene Antwort
});

test('10-Sekunden-Timer: Ankündigung, Countdown, Nachfrist für Schreibfelder, danach gesperrt; neue Runde setzt zurück', () => {
  const { db, ids } = setup(3);
  use(db, 'weissnicht2');
  act(db, mod(), 'open', { index: 0 });
  const t0 = clock;
  game.applyAction(db, { role: 'moderator', actor: 'moderator', now: t0 }, 'timer.start', {});
  assert.equal(game.teamView(db, ids[0], t0 + 1000).timer.phase, 'announce');
  assert.equal(game.teamView(db, ids[0], t0 + 5000).timer.phase, 'run');
  assert.equal(game.teamView(db, ids[0], t0 + 13000).timer.phase, 'over');
  assert.equal(game.nextWake(db, t0 + 100), t0 + 2500);
  act(db, team(ids[0], t0 + 3000), 'submit', { ink }); // läuft noch
  act(db, team(ids[1], t0 + 14000), 'submit', { ink }); // Nachfrist: automatisch abgeschickt
  assert.throws(() => act(db, team(ids[2], t0 + 17000), 'submit', { ink }), /Zeit ist abgelaufen/);
});

test('10-Sekunden-Timer: neue Runde oder Schritt setzt ihn zurück', () => {
  const { db, ids } = setup(2);
  use(db, 'weissnicht2');
  act(db, mod(), 'open', { index: 0 });
  game.applyAction(db, { role: 'moderator', actor: 'moderator', now: 1 }, 'timer.start', {});
  assert.ok(game.beamerView(db).timer);
  act(db, mod(), 'open', { index: 1 });
  assert.equal(game.beamerView(db).timer, null);
  act(db, team(ids[0]), 'submit', { ink });
});

test('Show jetzt starten: Proben verwerfen, Punkte 0, Schritt 1, neue Sitzung', () => {
  const { db, ids } = setup(2);
  use(db, 'weissnicht2');
  act(db, mod(), 'open', { index: 0 });
  act(db, team(ids[0]), 'submit', { ink });
  game.applyAction(db, mod(), 'points.adjust', { teamId: ids[0], points: 3, reason: 'Test' });
  assert.equal(totals(db)[ids[0]], 3);
  const before = game.teamView(db, ids[0]).session;
  game.applyAction(db, mod(), 'live.startShow', {});
  assert.equal(totals(db)[ids[0]] || 0, 0);
  assert.equal(db.live.run, 0);
  assert.deepEqual(db.live.games, {});
  assert.notEqual(game.teamView(db, ids[0]).session, before);
  assert.equal(game.moderatorView(db).undo, null);
});

test('Abschluss: Team-iPads zeigen Platz und Punkte', () => {
  const { db, ids } = setup(3);
  game.applyAction(db, mod(), 'points.adjust', { teamId: ids[1], points: 5, reason: 'x' });
  game.applyAction(db, mod(), 'points.adjust', { teamId: ids[2], points: 2, reason: 'x' });
  const steps = game.moderatorView(db).rundown;
  game.applyAction(db, mod(), 'run.goto', { index: steps.findIndex((s) => s.kind === 'end') });
  const v = game.teamView(db, ids[2]);
  assert.deepEqual([v.end.place, v.end.of, v.end.points], [2, 3, 2]);
  assert.equal(game.teamView(db, ids[0]).end.place, 3);
});

test('Generalprobe-Check meldet leere Frage und fehlende Koordinaten', () => {
  const { db } = setup(2);
  const g = db.project.games[0];
  const content = structuredClone(g.content);
  content.questions[1].question = '';
  game.applyAction(db, mod(), 'game.update', { gameId: g.id, content });
  const land = db.project.games.find((x) => x.type === 'land');
  const lc = structuredClone(land.content);
  lc.tasks[0].lat = null;
  game.applyAction(db, mod(), 'game.update', { gameId: land.id, content: lc });
  const r = game.applyAction(db, mod(), 'check.show', {}).data;
  assert.ok(r.issues.some((x) => x.level === 'fehlt' && /Frage 2/.test(x.where) && /Frage ist leer/.test(x.text)));
  assert.ok(r.issues.some((x) => /Koordinaten/.test(x.text)));
});

test('Show als Vorlage kopieren mit neuen Teams', () => {
  const { db } = setup(2);
  db.project.teams[0].name = 'Altes Team';
  const r = game.applyAction(db, mod(), 'shows.duplicate', { showId: db.project.id, name: 'Nächste Show', newTeams: true });
  const copy = db.shows.find((x) => x.project.id === r.created).project;
  assert.equal(copy.name, 'Nächste Show');
  assert.ok(!copy.teams.some((t) => t.name === 'Altes Team'));
  assert.equal(copy.games.length, db.project.games.length);
});

test('Song Song Song 2.0: einmal abspielen, Bewertung 0–3 geheim, Auflösung von wenig zu viel Punkten', () => {
  const { db, ids } = setup(4);
  const au = (n) => ({ id: `media_abcdefabcdef2${n}`, type: n === 3 ? 'video/mp4' : 'audio/mpeg', name: `s${n}` });
  use(db, 'songsong2', { rounds: [{ audio1: au(1), title1: 'Eins', start1: 30, reveal1: au(7), audio2: au(2), title2: 'Zwei', start2: 0, audio3: au(3), title3: 'Drei', start3: 12.5 }] });
  act(db, mod(), 'open', { index: 0 });
  assert.throws(() => act(db, team(ids[0]), 'submit', { ink }), /läuft noch nicht/);
  act(db, mod(), 'play');
  assert.deepEqual(pv(db).songs.map((s) => s.start), [30, 0, 12.5]);
  assert.equal(pv(db).playback.state, 'playing');
  assert.throws(() => act(db, mod(), 'play'), /einmal hören/);
  const fxSeq = db.live.effect.seq;
  act(db, team(ids[1]), 'submit', { ink }); // 1. Abgabe
  assert.equal(db.live.effect.seq, fxSeq); // kein Buzzer-Ton bei der Abgabe
  act(db, team(ids[0]), 'submit', { ink }); // 2. Abgabe
  act(db, team(ids[2]), 'submit', { ink }); // 3. Abgabe
  assert.throws(() => act(db, team(ids[0]), 'submit', { ink }), /schon abgeschickt/);
  assert.equal(pv(db).playback.state, 'playing'); // Abgabe stoppt die Musik nicht
  assert.throws(() => act(db, mod(), 'grade', { teamId: ids[3], n: 1 }), /noch nicht abgegeben/);
  assert.throws(() => act(db, mod(), 'grade', { teamId: ids[0], n: 4 }), /0, 1, 2 oder 3/);
  act(db, mod(), 'grade', { teamId: ids[1], n: 3 });
  act(db, mod(), 'grade', { teamId: ids[0], n: 1 });
  assert.throws(() => act(db, mod(), 'reveal'), /bewerten/);
  act(db, mod(), 'grade', { teamId: ids[2], n: 1 });
  act(db, mod(), 'grade', { teamId: ids[0], n: 0 }); // änderbar bis zur Auflösung
  // Auflösung erst nach „Abgabe schließen“, und das erst nach den Songs (3 × 15 s)
  assert.throws(() => act(db, mod(), 'reveal'), /Abgabe schließen/);
  assert.throws(() => act(db, mod(), 'close'), /Songs laufen noch/);
  clock += 46000;
  act(db, mod(), 'close');
  assert.equal(tv(db, ids[3]).closing, true);
  assert.equal(tv(db, ids[3]).canSubmit, false);
  act(db, team(ids[3]), 'submit', { ink }); // iPad schickt das Geschriebene automatisch ab (Nachfrist)
  assert.equal(db.live.games[db.live.activeGame].rounds[0].subs.at(-1).auto, true);
  assert.throws(() => act(db, mod(), 'reveal'), /bewerten/);
  act(db, mod(), 'grade', { teamId: ids[3], n: 2 });
  assert.equal(totals(db)[ids[1]], 3);
  assert.equal(totals(db)[ids[0]], 0);
  assert.equal(totals(db)[ids[2]], 1);
  // geheim: Beamer ohne Board, iPad ohne Ergebnis
  assert.equal(pv(db).board, null);
  assert.equal(tv(db, ids[1]).found, null);
  // Auflösung: 0 Punkte (ids[0]) → 1 Punkt (ids[2]) → 3 Punkte (ids[1])
  act(db, mod(), 'reveal');
  assert.throws(() => act(db, team(ids[3]), 'submit', { ink }), /Auflösung|schon abgeschickt/);
  assert.throws(() => act(db, mod(), 'grade', { teamId: ids[0], n: 2 }), /Auflösung/);
  assert.deepEqual(pv(db).board.map((b) => [b.teamId, b.hidden, b.found]), [[ids[0], true, null]]);
  act(db, mod(), 'reveal'); act(db, mod(), 'reveal');
  assert.deepEqual(pv(db).board.map((b) => [b.teamId, b.hidden, b.found]), [[ids[0], false, 0]]);
  assert.equal(tv(db, ids[0]).found, 0);
  for (let i = 0; i < 9; i++) act(db, mod(), 'reveal');
  assert.deepEqual(pv(db).board.map((b) => [b.teamId, b.found, b.points]), [[ids[0], 0, 0], [ids[2], 1, 1], [ids[3], 2, 2], [ids[1], 3, 3]]);
  assert.equal(pv(db).solution, null);
  // Songtitel einzeln: Titel + Auflösungs-Datei des Songs (falls hochgeladen)
  act(db, mod(), 'reveal');
  assert.deepEqual(pv(db).solution, ['Eins', null, null]);
  assert.equal(pv(db).solPlay.id, au(7).id);
  assert.deepEqual(tv(db, ids[3]).solution, ['Eins', null, null]);
  assert.equal(pv(db).revealed, false);
  act(db, mod(), 'reveal');
  assert.deepEqual(pv(db).solution, ['Eins', 'Zwei', null]);
  assert.equal(pv(db).solPlay, null); // Song 2 ohne Auflösungs-Datei
  act(db, mod(), 'reveal');
  assert.deepEqual(pv(db).solution, ['Eins', 'Zwei', 'Drei']);
  assert.deepEqual(tv(db, ids[3]).solution, ['Eins', 'Zwei', 'Drei']);
  assert.equal(pv(db).revealed, true);
  assert.throws(() => act(db, mod(), 'reveal'), /schon aufgelöst/);
});

test('Song Song Song 2.0: Punkte je erkannte Songs im Editor änderbar, ohne alle drei Dateien kein Start', () => {
  const { db, ids } = setup(2);
  const au = (n) => ({ id: `media_abcdefabcdef3${n}`, type: 'audio/mpeg', name: `s${n}` });
  use(db, 'songsong2', { scoring: { n3: 5 }, rounds: [{ audio1: au(1), audio2: au(2), audio3: null, title1: '', title2: '', title3: '', start1: 0, start2: 0, start3: 0 }, { audio1: au(1), audio2: au(2), audio3: au(3), title1: '', title2: '', title3: '', start1: 0, start2: 0, start3: 0 }] });
  act(db, mod(), 'open', { index: 0 });
  assert.throws(() => act(db, mod(), 'play'), /drei Dateien/);
  act(db, mod(), 'open', { index: 1 });
  act(db, mod(), 'play');
  act(db, team(ids[0]), 'submit', { ink });
  act(db, mod(), 'grade', { teamId: ids[0], n: 3 });
  assert.equal(totals(db)[ids[0]], 5);
  act(db, mod(), 'grade', { teamId: ids[0], n: 2 });
  assert.equal(totals(db)[ids[0]], 2);
  act(db, mod(), 'stop'); // Notstopp: Schließen sofort möglich
  act(db, mod(), 'close');
  clock += 5000; // Nachfrist vorbei
  assert.throws(() => act(db, team(ids[1]), 'submit', { ink }), /geschlossen/);
});
