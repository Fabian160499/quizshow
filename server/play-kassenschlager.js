'use strict';

// Spiel „Das ist ein echter Kassenschlager“: vier Filme, jedes Team hat eine
// private Paywall mit zehn Hinweisen und startet mit 20 $. Pro Durchgang kaufen
// alle Teams gleichzeitig je einen Hinweis und raten; richtig gibt 5 $. Ein Film
// endet nach 4 Durchgängen oder sobald alle richtig geraten haben.
// Am Ende: Punkte = ⌈Guthaben ÷ 2⌉.

const { fail, log, effect, teamName, teamIds, bookTarget, cleanText, cleanInk } = require('./core');
const { pv } = require('./scoring');
const { MOVIE_HINTS } = require('./defaults');
// Name der Hinweis-Kategorie: im Editor umbenennbar, sonst Standard.
const cat = (game, i) => (game.content.hintCats && game.content.hintCats[i]) || {};
const hintName = (game, i) => String(cat(game, i).name || '').trim() || (game.content.hintNames && String(game.content.hintNames[i] || '').trim()) || MOVIE_HINTS[i][0];
// Preis der Hinweis-Kategorie: im Editor änderbar, sonst Standard.
const hintPrice = (game, i) => { const v = cat(game, i).price; return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : MOVIE_HINTS[i][1]; };

const START_MONEY = 20;
const REWARD = 5;
const MAX_BUYS = 4;
const MAX_CYCLES = 4;

function movie(st) {
  if (st.movieIndex < 0) fail('Es läuft gerade kein Film.');
  return upgrade(st.movies[st.movieIndex]);
}

// Ältere Spielstände (ein Team nach dem anderen) in Durchgänge umwandeln.
function upgrade(m) {
  if (m && 'turn' in m) {
    for (const id of m.order) {
      const tm = teamMovie(m, id);
      tm.phase = m.turn && m.turn.teamId === id ? m.turn.phase : 'done';
    }
    delete m.turn;
    delete m.turnPos;
  }
  return m;
}

function wallet(db, st, teamId) {
  if (st.wallet[teamId] === undefined) st.wallet[teamId] = START_MONEY;
  return st.wallet[teamId];
}

function teamMovie(m, teamId) {
  if (!m.teams[teamId]) m.teams[teamId] = { bought: [], answers: [], solved: false, phase: 'done' };
  return m.teams[teamId];
}

function canBuyAny(db, st, m, teamId, game) {
  const tm = teamMovie(m, teamId);
  if (tm.bought.length >= MAX_BUYS) return false;
  const money = wallet(db, st, teamId);
  return MOVIE_HINTS.some((_, i) => !tm.bought.includes(i) && (game ? hintPrice(game, i) : MOVIE_HINTS[i][1]) <= money);
}

// Neuer Durchgang: alle Teams, die noch nicht gelöst haben, kaufen gleichzeitig.
// Wer sich keinen Hinweis mehr leisten kann, darf direkt raten.
function startCycle(db, st, m, game) {
  for (const id of m.order) {
    const tm = teamMovie(m, id);
    tm.phase = tm.solved ? 'done' : canBuyAny(db, st, m, id, game) ? 'buy' : 'answer';
  }
}
const cycleDone = (m) => m.order.every((id) => teamMovie(m, id).phase === 'done');
const allSolved = (m) => m.order.every((id) => teamMovie(m, id).solved);

// Nach jeder Bewertung/jedem Auslassen: Film automatisch beenden, wenn alle gelöst
// haben oder der letzte Durchgang komplett ist.
function afterChange(db, ctx, game, st, m) {
  if (!cycleDone(m)) return;
  if (allSolved(m) || m.cycle >= MAX_CYCLES) finishMovie(db, ctx, game, st, m);
}

// Wer am Ende eines Films 0 $ hat und nicht richtig geraten hat, scheidet aus.
function finishMovie(db, ctx, game, st, m) {
  if (m.finished) return;
  m.finished = true;
  for (const id of m.order) teamMovie(m, id).phase = 'done';
  for (const id of m.order) {
    if (!teamMovie(m, id).solved && wallet(db, st, id) <= 0 && !st.out.includes(id)) {
      st.out.push(id);
      log(db, ctx, 'ablauf', `${teamName(db, id)} hat 0 $ und scheidet aus den weiteren Filmen aus`);
    }
  }
  log(db, ctx, 'ablauf', `Film ${st.movieIndex + 1} beendet`);
  effect(db, 'reveal');
}

// Nach welchem Hinweis wurde richtig geraten? (ältere Spielstände: zuletzt gekaufter Hinweis)
function solvedHint(tm) {
  if (!tm || !tm.solved) return null;
  const a = (tm.answers || []).find((x) => x.grade === true);
  if (a && a.hint !== undefined) return a.hint;
  return tm.bought.length ? tm.bought[tm.bought.length - 1] : null;
}

function lastAnswer(tm) {
  return tm.answers[tm.answers.length - 1] || null;
}

module.exports = {
  START_MONEY,
  init: () => ({ movieIndex: -1, movies: {}, wallet: {}, out: [], converted: null }),

  team: {
    buy(db, ctx, game, st, p) {
      const m = movie(st);
      const phase = m.order.includes(ctx.teamId) && !m.finished ? teamMovie(m, ctx.teamId).phase : 'done';
      if (phase !== 'buy') fail(phase === 'answer' ? 'Gebt jetzt eure Antwort ab.' : 'In diesem Durchgang habt ihr schon gekauft.');
      const i = Number(p.hint);
      if (!MOVIE_HINTS[i]) fail('Hinweis nicht gefunden.');
      const tm = teamMovie(m, ctx.teamId);
      if (tm.bought.includes(i)) fail('Diesen Hinweis habt ihr schon gekauft.');
      if (tm.bought.length >= MAX_BUYS) fail(`Pro Film höchstens ${MAX_BUYS} Hinweise.`);
      const price = hintPrice(game, i);
      if (price > wallet(db, st, ctx.teamId)) fail('Dafür reicht euer Guthaben nicht.');
      st.wallet[ctx.teamId] -= price;
      tm.bought.push(i);
      tm.phase = 'answer';
      log(db, ctx, 'kauf', `${teamName(db, ctx.teamId)} kauft Hinweis ${i + 1} (${hintName(game, i)}) für ${price} $`);
    },

    answer(db, ctx, game, st, p) {
      const m = movie(st);
      const phase = m.order.includes(ctx.teamId) && !m.finished ? teamMovie(m, ctx.teamId).phase : 'done';
      if (phase !== 'answer') fail(phase === 'buy' ? 'Erst einen Hinweis kaufen.' : phase === 'grading' ? 'Eure Antwort wird gerade bewertet.' : 'In diesem Durchgang habt ihr schon geraten.');
      // Filmtitel handschriftlich (Apple Pencil) oder als Text.
      const ink = cleanInk(p.ink);
      const text = ink ? '' : cleanText(p.text ?? '', 120);
      if (!ink && !text) fail('Bitte zuerst den Filmtitel aufschreiben.');
      const tm = teamMovie(m, ctx.teamId);
      // Merken, nach welchem Hinweis geraten wurde (für die Auflösung auf dem Beamer).
      tm.answers.push({ text, ink, at: ctx.now, grade: null, cycle: m.cycle, hint: tm.bought.length ? tm.bought[tm.bought.length - 1] : null });
      tm.phase = 'grading';
      log(db, ctx, 'antwort', `${teamName(db, ctx.teamId)} hat einen Titel abgegeben`);
    },
  },

  mod: {
    startMovie(db, ctx, game, st, p) {
      const i = Number(p.movieIndex);
      if (!game.content.movies[i]) fail('Film nicht gefunden.');
      if (st.movies[i]) fail('Dieser Film wurde schon gespielt.');
      if (st.movieIndex >= 0 && !st.movies[st.movieIndex].finished) fail('Erst den laufenden Film beenden.');
      for (const id of teamIds(db)) wallet(db, st, id);
      const order = teamIds(db).filter((id) => !st.out.includes(id));
      if (!order.length) fail('Kein Team spielt mehr mit.');
      st.movieIndex = i;
      const m = { order, cycle: 1, teams: {}, finished: false };
      st.movies[i] = m;
      startCycle(db, st, m, game);
      log(db, ctx, 'ablauf', `Film ${i + 1} gestartet`);
    },

    // Antwort bewerten. Das Ergebnis sieht nur das betroffene Team.
    grade(db, ctx, game, st, p) {
      const m = movie(st);
      // Ohne Team-Angabe: die älteste offene Antwort.
      const waiting = m.order.filter((id) => teamMovie(m, id).phase === 'grading')
        .sort((a, b) => lastAnswer(teamMovie(m, a)).at - lastAnswer(teamMovie(m, b)).at);
      const id = p.teamId || waiting[0];
      if (!id || !waiting.includes(id)) fail('Gerade wartet keine Antwort auf eine Bewertung.');
      const tm = teamMovie(m, id);
      const a = lastAnswer(tm);
      a.grade = !!p.correct;
      if (a.grade) {
        tm.solved = true;
        st.wallet[id] += REWARD;
      }
      tm.phase = 'done';
      log(db, ctx, 'bewertung', `${teamName(db, id)}: ${a.ink ? 'handschriftliche Antwort' : `„${a.text}“`} ${a.grade ? `richtig (+${REWARD} $)` : 'falsch'}`);
      afterChange(db, ctx, game, st, m);
    },

    // Team setzt in diesem Durchgang aus (z. B. will nichts kaufen).
    skip(db, ctx, game, st, p) {
      const m = movie(st);
      if (m.finished) fail('Der Film ist bereits beendet.');
      const tm = m.order.includes(p.teamId) ? teamMovie(m, p.teamId) : null;
      if (!tm || !['buy', 'answer'].includes(tm.phase)) fail('Dieses Team hat in diesem Durchgang nichts mehr offen.');
      tm.phase = 'done';
      log(db, ctx, 'ablauf', `${teamName(db, p.teamId)} setzt in Durchgang ${m.cycle} aus`);
      afterChange(db, ctx, game, st, m);
    },

    // Nächster Durchgang, sobald alle Teams gekauft und geraten haben.
    nextCycle(db, ctx, game, st) {
      const m = movie(st);
      if (m.finished) fail('Der Film ist bereits beendet.');
      if (!cycleDone(m)) fail('Noch sind nicht alle Teams mit diesem Durchgang fertig.');
      if (m.cycle >= MAX_CYCLES) fail(`Mehr als ${MAX_CYCLES} Durchgänge gibt es nicht.`);
      m.cycle += 1;
      startCycle(db, st, m, game);
      log(db, ctx, 'ablauf', `Durchgang ${m.cycle} gestartet`);
    },

    endMovie(db, ctx, game, st) {
      const m = movie(st);
      if (m.finished) fail('Der Film ist bereits beendet.');
      if (m.order.some((id) => teamMovie(m, id).phase === 'grading')) fail('Erst die offenen Antworten bewerten.');
      finishMovie(db, ctx, game, st, m);
    },

    // Einmalige Umrechnung des Guthabens in Hauptpunkte: aufgerundet Guthaben ÷ 2.
    convert(db, ctx, game, st) {
      if (st.converted) fail('Das Guthaben wurde bereits umgerechnet.');
      const played = Object.values(st.movies);
      if (!played.length || played.some((m) => !m.finished)) fail('Erst alle gestarteten Filme beenden.');
      st.converted = {};
      for (const id of teamIds(db)) {
        const money = wallet(db, st, id);
        const div = pv(game, 'divisor') > 0 ? pv(game, 'divisor') : 2;
        const points = Math.ceil(money / div);
        st.converted[id] = { money, points };
        bookTarget(db, ctx, `kassen:${game.id}:${id}`, id, points, `${game.title}, ${money} $ umgerechnet`);
      }
      log(db, ctx, 'punkte', 'Guthaben in Hauptpunkte umgerechnet');
      effect(db, 'reveal');
    },
  },

  teamView(db, game, st, teamId) {
    const base = { wallet: wallet(db, st, teamId), out: st.out.includes(teamId), movieCount: game.content.movies.length, converted: st.converted ? st.converted[teamId] || null : null };
    if (st.movieIndex < 0) return { ...base, movieIndex: -1 };
    const m = upgrade(st.movies[st.movieIndex]);
    const content = game.content.movies[st.movieIndex];
    const tm = m.teams[teamId] || { bought: [], answers: [], solved: false, phase: 'done' };
    const myTurn = !m.finished && ['buy', 'answer', 'grading'].includes(tm.phase);
    const answer = lastAnswer(tm);
    return {
      ...base,
      movieIndex: st.movieIndex,
      cycle: Math.min(m.cycle, MAX_CYCLES),
      playing: m.order.includes(teamId),
      finished: m.finished,
      title: m.finished ? content.title : null,
      myTurn,
      phase: m.finished ? null : tm.phase,
      // Wie viele Teams im Durchgang noch kaufen/raten (für „wartet auf die anderen“).
      othersOpen: m.order.filter((id) => id !== teamId && !['done'].includes(teamMovie(m, id).phase)).length,
      maxBuys: MAX_BUYS,
      boughtCount: tm.bought.length,
      hints: MOVIE_HINTS.map((_, i) => {
        const price = hintPrice(game, i);
        const photo = content.hintPhotos && content.hintPhotos[i] && content.hintPhotos[i].photo;
        return {
          label: hintName(game, i), price,
          bought: tm.bought.includes(i),
          text: tm.bought.includes(i) ? content.hints[i] : null,
          // Foto erst nach dem Kauf (vorher nicht einmal der Verweis).
          photo: tm.bought.includes(i) && photo ? { id: photo.id, type: photo.type } : null,
        };
      }),
      solved: tm.solved,
      lastAnswer: answer ? { text: answer.text, ink: answer.ink || null, grade: answer.grade } : null,
    };
  },

  // Guthaben, Hinweise und Antworten bleiben privat; der Beamer zeigt nur den Ablauf.
  beamerView(db, game, st) {
    if (st.movieIndex < 0) return { waiting: !st.converted, converted: st.converted };
    const m = upgrade(st.movies[st.movieIndex]);
    return {
      movieIndex: st.movieIndex,
      movieCount: game.content.movies.length,
      cycle: Math.min(m.cycle, MAX_CYCLES),
      maxCycles: MAX_CYCLES,
      // Nur „kauft/schreibt/fertig“ – ob richtig, bleibt privat.
      status: m.finished ? null : m.order.map((id) => ({ teamId: id, phase: { buy: 'buy', answer: 'answer' }[teamMovie(m, id).phase] || 'done' })),
      order: m.order,
      finished: m.finished,
      title: m.finished ? game.content.movies[st.movieIndex].title : null,
      // Film aufgelöst: die ganze Paywall aufdecken – welche Hinweise es noch gegeben hätte.
      paywall: m.finished ? MOVIE_HINTS.map((_, i) => {
        const content = game.content.movies[st.movieIndex];
        const photo = content.hintPhotos && content.hintPhotos[i] && content.hintPhotos[i].photo;
        return {
          label: hintName(game, i), price: hintPrice(game, i), text: content.hints[i] || '',
          photo: photo ? { id: photo.id, type: photo.type } : null,
          boughtBy: m.order.filter((id) => (m.teams[id]?.bought || []).includes(i)),
          // Teams, die nach genau diesem Hinweis richtig geraten haben.
          solvedBy: m.order.filter((id) => solvedHint(m.teams[id]) === i),
        };
      }) : null,
      // Bilanz dieses Films je Team: ausgegeben, verdient, Guthaben jetzt.
      money: m.finished ? m.order.map((id) => {
        const tm = m.teams[id] || { bought: [], solved: false };
        return { teamId: id, spent: tm.bought.reduce((sum, i) => sum + hintPrice(game, i), 0), earned: tm.solved ? REWARD : 0, total: wallet(db, st, id) };
      }) : null,
      out: st.out,
      converted: st.converted,
    };
  },
};
