'use strict';

// Stringenter Ablauf: Für jedes Spiel steht hier, was der nächste Druck auf „Weiter“
// (Showablauf, Leertaste, Klicker) im Spiel auslöst. Alles, was ein Mensch entscheiden
// muss (richtig/falsch, Treffer bestätigen), bleibt ein eigener Knopf – solange so eine
// Entscheidung fehlt, ist „Weiter“ gesperrt und nennt den Grund.
//
// flow(db, game, st, now) liefert:
//   { label, action, payload }  → „Weiter“ führt play.<action> aus
//   { wait: 'Grund' }           → „Weiter“ ist gesperrt
//   null                         → Spiel fertig, „Weiter“ geht zur nächsten Folie
//
// collect(st, game) beschreibt bei Schreib-Spielen die aktuelle Abgabe-Runde: Damit
// schließt die Abgabe automatisch, sobald alle Teams abgegeben haben, und einzelne
// Teams bekommen danach per Knopf eine Nachfrist.

const { teamName, teamIds, currentBuzz } = require('./core');

const step = (label, action, payload = {}) => ({ label, action, payload });
const wait = (text) => ({ wait: text });
const names = (db, ids) => ids.map((id) => teamName(db, id)).join(', ');
const count = (db, map, done = (v) => !!v) => teamIds(db).filter((id) => map && done(map[id])).length;
const ofN = (db, map, done) => `${count(db, map, done)} von ${teamIds(db).length}`;

// Nächster Eintrag einer Liste (Frage, Runde …) oder null am Ende.
function nextOf(list, i, noun, action, key = 'index', label = null) {
  if (i + 1 >= (list || []).length) return null;
  return step(label || `${noun} ${i + 2} zeigen`, action, { [key]: i + 1 });
}
function first(list, noun, action, key = 'index', label = null) {
  if (!(list || []).length) return null;
  return step(label || `${noun} 1 zeigen`, action, { [key]: 0 });
}

// Buzzer: offene Antwort zuerst bewerten.
function buzzWait(db, r) {
  const b = r && r.buzzes ? currentBuzz(r) : null;
  return b ? wait(`Erst die Antwort von ${teamName(db, b.teamId)} bewerten (✓ / ✗)`) : null;
}

const FLOW = {
  leichte5(db, game, st) {
    const qs = game.content.questions;
    if (st.qIndex < 0) return first(qs, 'Frage', 'open', 'qIndex');
    const r = st.rounds[st.qIndex];
    if (!r) return step(`Frage ${st.qIndex + 1} zeigen`, 'open', { qIndex: st.qIndex });
    const answers = Object.values(r.answers);
    if (r.open && !r.solutionRevealed) return step(`Abgabe schließen (${ofN(db, r.answers)} abgegeben)`, 'close');
    const open = answers.filter((a) => a.grade === null).length;
    if (open && !r.rv) return wait(`Erst alle Antworten bewerten (${open} offen)`);
    if (answers.length && (!r.rv || !r.rv.done)) {
      const rv = r.rv;
      if (!rv) return step(`Auflösung: ${(() => { const w = Object.entries(r.answers).filter(([, a]) => a.grade === false); const first = w.length ? w : Object.entries(r.answers); return first.length ? `Team ${teamName(db, first[0][0])} zeigen` : 'erstes Team zeigen'; })()}`, 'revealNext');
      const ids = rv.groups[rv.g] || [];
      if (rv.shown === false) return step(`Antwort von ${teamName(db, ids[0])} zeigen`, 'revealNext');
      const ok = r.answers[ids[0]]?.grade === true;
      if (!rv.verdict) return step(ok ? (ids.length > 1 ? `✓ Alle ${ids.length} richtig zeigen` : '✓ Richtig zeigen') : '✗ Falsch zeigen', 'revealNext');
      const nxt = rv.groups[rv.g + 1];
      return step(!nxt ? 'Übersicht aller Teams' : nxt.length > 1 ? `Übrige ${nxt.length} richtige zeigen` : `Nächstes Team: ${teamName(db, nxt[0])}`, 'revealNext');
    }
    if (!r.solutionRevealed) return step('Lösung zeigen', 'revealSolution');
    return nextOf(qs, st.qIndex, 'Frage', 'open', 'qIndex');
  },

  dummes(db, game, st, now) {
    const qs = game.content.questions;
    if (st.qIndex < 0) return first(qs, 'Frage', 'open', 'qIndex');
    const r = st.rounds[st.qIndex];
    if (!r) return step(`Frage ${st.qIndex + 1} zeigen`, 'open', { qIndex: st.qIndex });
    if (!r.evaluated) {
      // Das schnellste Team entscheidet in seinem 10-Sekunden-Fenster über den Tausch.
      if (r.buzz && !r.swap && r.windowEnds && now <= r.windowEnds) return wait(`${teamName(db, r.buzz.teamId)} entscheidet über den Tausch …`);
      return step(`Auflösen (${ofN(db, r.answers)} gesperrt)`, 'evaluate');
    }
    return nextOf(qs, st.qIndex, 'Frage', 'open', 'qIndex');
  },

  dumm3(db, game, st) {
    const qs = game.content.questions;
    if (st.qIndex < 0) return first(qs, 'Frage', 'open', 'qIndex');
    const r = st.rounds[st.qIndex];
    if (!r) return step(`Frage ${st.qIndex + 1} zeigen`, 'open', { qIndex: st.qIndex });
    if (r.open) return step(`Abgabe schließen (${ofN(db, r.entries)} abgegeben)`, 'close');
    if (!r.evaluated) return step('Auflösen', 'evaluate');
    return nextOf(qs, st.qIndex, 'Frage', 'open', 'qIndex');
  },

  land(db, game, st) {
    const ts = game.content.tasks;
    if (st.taskIndex < 0) return first(ts, 'Aufgabe', 'open', 'taskIndex');
    const r = st.rounds[st.taskIndex];
    if (!r) return step(`Aufgabe ${st.taskIndex + 1} zeigen`, 'open', { taskIndex: st.taskIndex });
    if (!r.showGuesses) return Object.keys(r.guesses).length ? step(`Tipps auf der Karte zeigen (${ofN(db, r.guesses)})`, 'revealGuesses') : wait('Noch hat kein Team einen Punkt gesetzt');
    if (!r.showTarget) return step('Zielort zeigen', 'revealTarget');
    return nextOf(ts, st.taskIndex, 'Aufgabe', 'open', 'taskIndex');
  },

  kassenschlager(db, game, st) {
    const ms = game.content.movies;
    const m = st.movieIndex >= 0 ? st.movies[st.movieIndex] : null;
    if (m && !m.finished) {
      const ph = (id) => (m.teams[id] && m.teams[id].phase) || 'done';
      const grading = m.order.filter((id) => ph(id) === 'grading');
      if (grading.length) return wait(`Erst die Antworten bewerten: ${names(db, grading)}`);
      const open = m.order.filter((id) => ph(id) === 'buy' || ph(id) === 'answer');
      if (open.length) return wait(`Durchgang ${m.cycle} von 4 – es kaufen/raten noch: ${names(db, open)}`);
      if (m.cycle < 4) return step(`Durchgang ${m.cycle + 1} starten`, 'nextCycle');
      return step('Film beenden', 'endMovie');
    }
    const next = ms.findIndex((_, i) => !st.movies[i]);
    if (next >= 0 && teamIds(db).some((id) => !st.out.includes(id))) return step(`Film ${next + 1} starten`, 'startMovie', { movieIndex: next });
    if (!st.converted && Object.keys(st.movies).length) return step('Guthaben in Punkte umrechnen', 'convert');
    return null;
  },

  trumpf5(db, game, st) {
    const ts = game.content.terms;
    if (st.termIndex < 0) return first(ts, 'Begriff', 'start', 'termIndex', 'Begriff 1 starten');
    const r = st.rounds[st.termIndex];
    if (!r) return step(`Begriff ${st.termIndex + 1} starten`, 'start', { termIndex: st.termIndex });
    if (!r.resolved) {
      const w = buzzWait(db, r);
      if (w) return w;
      if (teamIds(db).every((id) => r.locked.includes(id))) return step('Auflösen (niemand richtig)', 'close');
      if (r.hintLevel < 5) return step(`Hinweis ${r.hintLevel + 1} zeigen`, 'nextHint');
      return step('Auflösen (niemand richtig)', 'close');
    }
    return nextOf(ts, st.termIndex, 'Begriff', 'start', 'termIndex', `Begriff ${st.termIndex + 2} starten`);
  },

  musik(db, game, st) {
    const total = game.content.categories.reduce((n, c) => n + (c.fields || []).length, 0);
    const r = st.current ? st.rounds[st.current] : null;
    if (r && !r.resolved) {
      const w = buzzWait(db, r);
      if (w) return w;
      if (!r.started) return step('Frage freigeben (Buzzer frei)', 'start');
      return step('Feld beenden (niemand richtig)', 'close');
    }
    if (Object.keys(st.played).length >= total) return null;
    if (!st.started) return step('Spiel starten (Team auslosen)', 'begin');
    return wait(`${teamName(db, st.picker)} wählt ein Feld auf dem iPad`);
  },

  jauch(db, game, st) {
    const qs = game.content.questions;
    const r = st.qIndex >= 0 ? st.rounds[st.qIndex] : null;
    const active = teamIds(db).filter((id) => !st.teams[id] || st.teams[id].status === 'active');
    if (r && !r.revealed) {
      const missing = active.filter((id) => !r.answers[id]);
      return step(`Auflösen${missing.length ? ` (${active.length - missing.length} von ${active.length} gesperrt)` : ''}`, 'reveal', { force: true });
    }
    if (st.qIndex + 1 >= qs.length || (st.qIndex >= 0 && !active.length)) return null;
    return step(`Frage ${st.qIndex + 2} zeigen`, 'next');
  },

  nerd(db, game, st) {
    const cs = game.content.categories;
    if (st.catIndex < 0) return first(cs, 'Kategorie', 'open', 'catIndex', 'Kategorie 1: Gebote öffnen');
    const r = st.rounds[st.catIndex];
    if (!r) return step(`Kategorie ${st.catIndex + 1}: Gebote öffnen`, 'open', { catIndex: st.catIndex });
    if (r.phase === 'bidding') return Object.keys(r.bids).length ? step(`Gebote aufdecken (${ofN(db, r.bids, (v) => v !== undefined)})`, 'revealBids', { force: true }) : wait('Noch hat kein Team geboten');
    if (r.phase === 'choose') {
      if (r.coin && !r.coin.done) return step('Münzwurf: Ergebnis übernehmen', 'coinDone');
      return wait(`Gleichstand: ${names(db, r.choose.teamIds)} wählen auf dem iPad „Starten“ oder „Nachziehen“`);
    }
    if (r.phase === 'first' || r.phase === 'second') return wait(`${teamName(db, r.attempt.teamId)} nennt Antworten – jede Antwort mit ✓ / ✗ werten`);
    return nextOf(cs, st.catIndex, 'Kategorie', 'open', 'catIndex', `Kategorie ${st.catIndex + 2}: Gebote öffnen`);
  },

  dgf(db, game, st) {
    const cs = game.content.categories;
    const r = st.catIndex >= 0 ? st.rounds[st.catIndex] : null;
    if (st.catIndex < 0) return first(cs, 'Kategorie', 'open', 'catIndex', 'Kategorie 1 starten');
    if (!r) return step(`Kategorie ${st.catIndex + 1} starten`, 'open', { catIndex: st.catIndex });
    if (!r.done) return wait('Die Teams spielen reihum … (notfalls „Kategorie beenden“)');
    return nextOf(cs, st.catIndex, 'Kategorie', 'open', 'catIndex', `Kategorie ${st.catIndex + 2} starten`);
  },

  zocken(db, game, st) {
    if (st.removed.length >= 24) return null;
    if (st.decide) return wait(`${teamName(db, st.decide)} entscheidet: sichern oder zocken`);
    if (st.choose) return wait(`${teamName(db, st.choose)} wählt ein Feld zum Zocken`);
    const c = st.current;
    if (c && !c.resolved) {
      if (c.mode === 'zock') return wait(`${teamName(db, c.zockTeam)} antwortet – bewerten (✓ / ✗)`);
      const w = buzzWait(db, c);
      if (w) return w;
      return step('Frage zurück aufs Brett (niemand weiß es)', 'release');
    }
    // Ohne besondere Wahl: das nächste freie Feld (die Regie kann auch ein anderes antippen).
    const free = Array.from({ length: 24 }, (_, k) => k).find((k) => !st.removed.includes(k));
    return step(`Feld ${free + 1} öffnen`, 'open', { q: free });
  },

  brain(db, game, st) {
    if (st.round < 0) return step('Spiel starten: Runde 1', 'start');
    if (st.finished) return null;
    const r = st.r;
    if (r.phase === 'category') return step('Frage zeigen', 'showQuestion');
    if (r.phase === 'question') return step('Auflösen', 'evaluate');
    const last = st.round + 1 >= game.content.rounds.length;
    const nextStep = last ? step('Spiel beenden (Punkte gutschreiben)', 'finish') : step(`Runde ${st.round + 2}`, 'next');
    if (r.phase === 'evaluated') {
      const allowed = (r.correct || []).filter((id) => !(st.t[id] && st.t[id].wheelBanNow));
      return allowed.length ? step('Glücksrad öffnen (schnellstes Team dreht)', 'openWheel') : nextStep;
    }
    if (r.phase === 'wheel') {
      if (!r.buzz) return wait('Die richtigen Teams buzzern – das schnellste dreht am Rad');
      if (!r.spin) return wait(`${teamName(db, r.buzz)} dreht am Glücksrad`);
      if (r.redirect && r.redirect.pending) return wait('Ziel der Umleitung wählen');
    }
    return nextStep;
  },

  weissnicht(db, game, st) {
    const rs = game.content.rounds;
    if (st.index < 0) return first(rs, 'Runde', 'open');
    const r = st.rounds[st.index];
    if (!r) return step(`Runde ${st.index + 1} zeigen`, 'open', { index: st.index });
    if (!r.closed) {
      if (r.target && !r.result) return wait(`Antwort von ${teamName(db, r.target)} bewerten (✓ / ✗)`);
      if (r.buzz && !r.target) return wait(`${teamName(db, r.buzz.teamId || r.buzz)} wählt ein Team …`);
      return step('Runde beenden (niemand buzzert)', 'close');
    }
    return nextOf(rs, st.index, 'Runde', 'open');
  },

  weissnicht2(db, game, st) {
    const rs = game.content.rounds;
    if (st.index < 0) return first(rs, 'Runde', 'open');
    const r = st.rounds[st.index];
    if (!r) return step(`Runde ${st.index + 1} zeigen`, 'open', { index: st.index });
    if (r.evaluated) return nextOf(rs, st.index, 'Runde', 'open');
    if (!r.closedSubmissions && !teamIds(db).every((id) => r.answers[id])) return step(`Abgabe schließen (${ofN(db, r.answers)} abgegeben)`, 'closeSubmissions');
    const ungraded = Object.keys(r.answers).filter((id) => r.grades[id] === undefined).length;
    if (ungraded) return wait(`Erst alle Antworten bewerten (${ungraded} offen)`);
    if (r.buzz && !r.guesses) return wait(`${teamName(db, r.buzz.teamId)} schätzt die anderen Teams ein …`);
    return step('Auflösen', 'evaluate');
  },

  konsequenz(db, game, st) {
    const ss = game.content.songs;
    if (st.index < 0) return first(ss, 'Lied', 'open', 'index', 'Lied 1 vorbereiten');
    const r = st.rounds[st.index];
    if (!r) return step(`Lied ${st.index + 1} vorbereiten`, 'open', { index: st.index });
    if (!r.closed && r.stage < 4) return step(`Stufe ${r.stage + 2} abspielen`, 'next');
    if (!r.closed) return step('Abgabe schließen und bewerten', 'close');
    if (!r.awarded) {
      const missing = Object.keys(r.answers).filter((id) => r.grades[id] === undefined).length;
      if (missing) return wait(`Erst alle Abgaben bewerten (${missing} offen)`);
      return step('Punkte vergeben (Auflösung)', 'award');
    }
    return nextOf(ss, st.index, 'Lied', 'open', 'index', `Lied ${st.index + 2} vorbereiten`);
  },

  songsong(db, game, st) {
    const ps = game.content.puzzles;
    if (st.index < 0) return first(ps, 'Rätsel', 'open');
    const r = st.rounds[st.index];
    if (!r) return step(`Rätsel ${st.index + 1} zeigen`, 'open', { index: st.index });
    if (!r.done) {
      if (!r.started) return step('Musik abspielen', 'play');
      const pending = r.subs.filter((x) => r.grades[x.teamId] === undefined).sort((a, b) => a.at - b.at)[0];
      if (pending) return wait(`Erst die Abgabe von ${teamName(db, pending.teamId)} prüfen (✓ / ✗)`);
      return step('Auflösen (niemand hatte beide Titel)', 'close');
    }
    return nextOf(ps, st.index, 'Rätsel', 'open');
  },

  filmab(db, game, st) {
    const fs = game.content.films;
    if (st.index < 0) return first(fs, 'Film', 'open', 'index', 'Film 1 vorbereiten');
    const r = st.rounds[st.index];
    if (!r) return step(`Film ${st.index + 1} vorbereiten`, 'open', { index: st.index });
    if (!r.resolved) {
      const w = buzzWait(db, r);
      if (w) return w;
      if (!r.started) return step('Film abspielen', 'play');
      return step('Auflösen (niemand richtig)', 'close');
    }
    return nextOf(fs, st.index, 'Film', 'open', 'index', `Film ${st.index + 2} vorbereiten`);
  },

  lippen(db, game, st) {
    const it = game.content.items;
    if (st.index < 0) return first(it, 'Aufgabe', 'open');
    const r = st.rounds[st.index];
    if (!r) return step(`Aufgabe ${st.index + 1} zeigen`, 'open', { index: st.index });
    if (!r.resolved) return buzzWait(db, r) || step('Auflösen (niemand richtig)', 'close');
    return nextOf(it, st.index, 'Aufgabe', 'open');
  },

  cover(db, game, st) {
    const rs = game.content.rounds;
    if (st.index < 0) return first(rs, 'Runde', 'open', 'index', 'Runde 1 starten (Buzzer frei)');
    const r = st.rounds[st.index];
    if (!r) return step(`Runde ${st.index + 1} starten`, 'open', { index: st.index });
    if (!r.resolved) {
      const w = buzzWait(db, r);
      if (w) return w;
      const n = require('./play-cover').elementsOf(rs[st.index]).length;
      if (r.shown < n) return step(`Element ${r.shown + 1} von ${n} zeigen`, 'show');
      return step('Runde beenden (Lösung zeigen)', 'close');
    }
    return nextOf(rs, st.index, 'Runde', 'open', 'index', `Runde ${st.index + 2} starten`);
  },

  chat(db, game, st) {
    const cs = game.content.chats;
    if (st.index < 0) return first(cs, 'Chat', 'open', 'index', 'Chat 1 starten');
    const r = st.rounds[st.index];
    if (!r) return step(`Chat ${st.index + 1} starten`, 'open', { index: st.index });
    if (!r.resolved) {
      const w = buzzWait(db, r);
      if (w) return w;
      if (r.shown < 8 && !teamIds(db).every((id) => r.locked.includes(id))) return step(`Nachricht ${r.shown + 1} zeigen`, 'next');
      return step('Auflösen (niemand richtig)', 'close');
    }
    return nextOf(cs, st.index, 'Chat', 'open', 'index', `Chat ${st.index + 2} starten`);
  },

  star(db, game, st) {
    const ps = game.content.puzzles;
    if (st.index < 0) return first(ps, 'Rätsel', 'open');
    const r = st.rounds[st.index];
    if (!r) return step(`Rätsel ${st.index + 1} zeigen`, 'open', { index: st.index });
    if (!r.resolved) return step(`Auflösen (${r.buzzes.length} von ${teamIds(db).length} gebuzzert)`, 'resolve');
    return nextOf(ps, st.index, 'Rätsel', 'open');
  },

  jeopardy(db, game, st) {
    if (!st.started) return step('Spiel starten (Team auslosen)', 'start');
    if (st.done) return null;
    const q = st.q;
    if (q && !q.resolved) return buzzWait(db, q) || step('Frage beenden (niemand richtig)', 'close');
    return wait(`${teamName(db, st.picker)} wählt eine Kategorie und Punkte`);
  },

  sortieren: listRound('tasks', 'Aufgabe'),
  lecker: listRound('rounds', 'Runde'),
  top100: listRound('rounds', 'Runde', (db, r) => pendingWait(db, r)),
  allein: listRound('rounds', 'Kategorie', (db, r) => pendingWait(db, r), (r) => (!r.showList ? step('Alle richtigen Antworten zeigen', 'showList', { show: true }) : null)),

  gier(db, game, st, now) {
    const qs = game.content.questions;
    const active = teamIds(db).filter((id) => !st.teams[id] || st.teams[id].outRound === null);
    const finished = active.length <= 1 || qs.every((_, i) => st.rounds[i] && st.rounds[i].evaluated);
    if (st.index < 0) return first(qs, 'Frage', 'open');
    const r = st.rounds[st.index];
    if (!r) return step(`Frage ${st.index + 1} zeigen`, 'open', { index: st.index });
    if (!r.evaluated) {
      const missing = active.filter((id) => r.answers[id] === undefined);
      if (!missing.length) return step('Auflösen', 'evaluate');
      const until = r.graceEndsAt ?? r.endsAt;
      if (until && now <= until) return wait(`Antwortzeit läuft – es fehlen: ${names(db, missing)}`);
      return step(`10 s Nachfrist für ${names(db, missing)}`, 'grace');
    }
    if (finished) return null;
    return nextOf(qs, st.index, 'Frage', 'open');
  },

  zuweit(db, game, st) {
    const rs = game.content.rounds;
    if (st.index < 0) return first(rs, 'Runde', 'open');
    const r = st.rounds[st.index];
    if (!r) return step(`Runde ${st.index + 1} zeigen`, 'open', { index: st.index });
    if (!r.evaluated) return Object.keys(r.picks).length ? step(`Auflösen (${ofN(db, r.picks)} abgegeben)`, 'evaluate', { force: true }) : wait('Noch hat kein Team abgegeben');
    if (r.tie) return wait('Gleichstand – bitte unten entscheiden, wer die Punkte bekommt');
    return nextOf(rs, st.index, 'Runde', 'open');
  },

  hostdu(db, game, st) {
    const qs = game.content.questions;
    if (st.index < 0) return first(qs, 'Frage', 'open');
    const r = st.rounds[st.index];
    if (!r) return step(`Frage ${st.index + 1} zeigen`, 'open', { index: st.index });
    if (r.phase === 'submit') return wait(`Jedes Team reicht eine Antwort ein (${ofN(db, r.answers)})`);
    if (r.phase === 'review') return step('Abstimmung starten', 'startVote');
    if (r.phase === 'vote') return step(`Auflösen (${Object.keys(r.votes).length} Stimmen)`, 'reveal', { force: true });
    return nextOf(qs, st.index, 'Frage', 'open');
  },

  telepa2(db, game, st) {
    const ts = game.content.tasks;
    if (st.index < 0) return first(ts, 'Aufgabe', 'open');
    const r = st.rounds[st.index];
    if (!r) return step(`Aufgabe ${st.index + 1} zeigen`, 'open', { index: st.index });
    const both = (a) => a && a.p1 && a.p2;
    if (r.open) return step(`Abgabe schließen (${ofN(db, r.answers, both)} fertig)`, 'close');
    if (r.cur && !r.overview && r.judged[r.cur] === undefined) return wait(`Erst „passt“ / „passt nicht“ für ${teamName(db, r.cur)}`);
    if (!r.overview) {
      const ready = teamIds(db).filter((id) => both(r.answers[id]));
      const nxt = ready.find((id) => !(r.shown || []).includes(id));
      if (ready.length) return step(nxt ? `Auflösen: ${teamName(db, nxt)}` : 'Übersicht aller Teams', 'next');
    }
    return nextOf(ts, st.index, 'Aufgabe', 'open');
  },

  fragen(db, game, st, now) {
    const cs = game.content.categories;
    if (st.catIndex < 0) return first(cs, 'Kategorie', 'open', 'catIndex', 'Kategorie 1 öffnen');
    const r = st.rounds[st.catIndex];
    if (!r) return step(`Kategorie ${st.catIndex + 1} öffnen`, 'open', { catIndex: st.catIndex });
    if (!r.published) {
      if (!r.accepted) return wait(r.subs.length ? `Einen der ${r.subs.length} Vorschläge annehmen` : 'Die Teams schlagen Fragen vor …');
      return step('Frage veröffentlichen', 'publish');
    }
    if (!r.evaluated) {
      if (r.deadline && now < r.deadline) return wait('Die Antwortzeit läuft …');
      const open = Object.keys(r.answers).filter((id) => r.grades[id] === undefined).length;
      if (open) return wait(`Erst alle Antworten bewerten (${open} offen)`);
      return step('Auflösen', 'evaluate');
    }
    return nextOf(cs, st.catIndex, 'Kategorie', 'open', 'catIndex', `Kategorie ${st.catIndex + 2} öffnen`);
  },

  timeline(db, game, st) {
    const rs = game.content.rounds;
    if (st.index < 0) return first(rs, 'Durchgang', 'open', 'index', 'Durchgang 1 starten');
    const r = st.rounds[st.index];
    if (!r) return step(`Durchgang ${st.index + 1} starten`, 'open', { index: st.index });
    if (!r.done) return wait('Die Teams legen reihum … (notfalls „Durchgang beenden“)');
    return nextOf(rs, st.index, 'Durchgang', 'open', 'index', `Durchgang ${st.index + 2} starten`);
  },

  sekunden(db, game, st) {
    const rs = game.content.rounds;
    if (st.index < 0) return first(rs, 'Durchgang', 'open', 'index', 'Durchgang 1 starten');
    const r = st.rounds[st.index];
    if (!r || !r.order.length) return step(`Durchgang ${st.index + 1} starten`, 'open', { index: st.index });
    if (!r.done) {
      const id = r.order[r.turn];
      const t = r.turns[id];
      const phase = t ? t.phase : 'ready';
      if (phase === 'ready') return wait(`${teamName(db, id)} startet mit dem Buzzer`);
      if (phase === 'running') return wait(`${teamName(db, id)} spielt – Antworten mit ✓ / ✗ werten`);
      const nxt = r.order[r.turn + 1];
      return step(nxt ? `Nächstes Team: ${teamName(db, nxt)}` : 'Durchgang beenden', 'next');
    }
    return nextOf(rs, st.index, 'Durchgang', 'open', 'index', `Durchgang ${st.index + 2} starten`);
  },
};

// „Alle schreiben gleichzeitig“ mit open/closed/evaluated.
function listRound(listKey, noun, gate = null, after = null) {
  return (db, game, st) => {
    const list = game.content[listKey];
    if (st.index < 0) return first(list, noun, 'open');
    const r = st.rounds[st.index];
    if (!r) return step(`${noun} ${st.index + 1} zeigen`, 'open', { index: st.index });
    if (!r.evaluated) {
      if (r.open && !r.closed) return step(`Abgabe schließen (${ofN(db, r.answers)} abgegeben)`, 'close');
      const g = gate && gate(db, r);
      if (g) return g;
      return step('Auflösen', 'evaluate');
    }
    const a = after && after(r);
    if (a) return a;
    return nextOf(list, st.index, noun, 'open');
  };
}
function pendingWait(db, r) {
  const p = Object.entries(r.answers).filter(([, a]) => a.status === 'pending').map(([id]) => id);
  return p.length ? wait(`Erst die unsicheren Treffer prüfen: ${names(db, p)}`) : null;
}

// Abgabe-Runden für automatisches Schließen und Nachfrist.
// open(r) / close(r) / reopen(r) arbeiten mit den Feldern des jeweiligen Spiels.
const plainOpen = { isOpen: (r) => r.open, close: (r) => { r.open = false; }, reopen: (r) => { r.open = true; } };
const closedFlag = { isOpen: (r) => r.open && !r.closed, close: (r) => { r.closed = true; }, reopen: (r) => { r.closed = false; } };
const COLLECT = {
  leichte5: { round: (st) => (st.qIndex >= 0 ? st.rounds[st.qIndex] : null), entries: (r) => r.answers, done: (r) => r.solutionRevealed || !!r.rv, ...plainOpen },
  dumm3: { round: (st) => (st.qIndex >= 0 ? st.rounds[st.qIndex] : null), entries: (r) => r.entries, done: (r) => r.evaluated, ...plainOpen },
  sortieren: { round: (st) => st.rounds[st.index], entries: (r) => r.answers, done: (r) => r.evaluated, ...closedFlag },
  lecker: { round: (st) => st.rounds[st.index], entries: (r) => r.answers, done: (r) => r.evaluated, ...plainOpen },
  top100: { round: (st) => st.rounds[st.index], entries: (r) => r.answers, done: (r) => r.evaluated, ...closedFlag },
  allein: { round: (st) => st.rounds[st.index], entries: (r) => r.answers, done: (r) => r.evaluated, ...closedFlag },
  weissnicht2: { round: (st) => st.rounds[st.index], entries: (r) => r.answers, done: (r) => r.evaluated,
    isOpen: (r) => r.open && !r.closedSubmissions, close: (r) => { r.closedSubmissions = true; }, reopen: (r) => { r.closedSubmissions = false; } },
  land: { round: (st) => (st.taskIndex >= 0 ? st.rounds[st.taskIndex] : null), entries: (r) => r.guesses, done: (r) => r.showGuesses, ...plainOpen },
  zuweit: { round: (st) => st.rounds[st.index], entries: (r) => r.picks, done: (r) => r.evaluated, ...plainOpen },
  telepa2: { round: (st) => st.rounds[st.index], entries: (r) => Object.fromEntries(Object.entries(r.answers).filter(([, a]) => a.p1 && a.p2)), done: (r) => !!r.cur || !!r.overview, ...plainOpen },
};

module.exports = { FLOW, COLLECT };
