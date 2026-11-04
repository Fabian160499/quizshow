'use strict';

// Spiel „Das ist ein echter Kassenschlager“: vier Filme, jedes Team hat eine
// private Paywall mit zehn Hinweisen und startet mit 20 $. Pro Zug kauft ein
// Team einen Hinweis und rät; richtig gibt 5 $. Am Ende: Punkte = ⌈Guthaben ÷ 2⌉.

const { fail, log, effect, teamName, teamIds, bookTarget, cleanText, cleanInk } = require('./core');
const { pv } = require('./scoring');
const { MOVIE_HINTS } = require('./defaults');
// Name der Hinweis-Kategorie: im Editor umbenennbar, sonst Standard.
const hintName = (game, i) => ((game.content.hintNames && String(game.content.hintNames[i] || '').trim()) || MOVIE_HINTS[i][0]);

const START_MONEY = 20;
const REWARD = 5;
const MAX_BUYS = 4;
const MAX_CYCLES = 4;

function movie(st) {
  if (st.movieIndex < 0) fail('Es läuft gerade kein Film.');
  return st.movies[st.movieIndex];
}

function wallet(db, st, teamId) {
  if (st.wallet[teamId] === undefined) st.wallet[teamId] = START_MONEY;
  return st.wallet[teamId];
}

function teamMovie(m, teamId) {
  if (!m.teams[teamId]) m.teams[teamId] = { bought: [], answers: [], solved: false };
  return m.teams[teamId];
}

function canBuyAny(db, st, m, teamId) {
  const tm = teamMovie(m, teamId);
  if (tm.bought.length >= MAX_BUYS) return false;
  const money = wallet(db, st, teamId);
  return MOVIE_HINTS.some(([, price], i) => !tm.bought.includes(i) && price <= money);
}

// Zug an das nächste Team geben, das den Film noch nicht gelöst hat.
function beginTurn(db, st, m) {
  while (m.cycle <= MAX_CYCLES) {
    while (m.turnPos < m.order.length) {
      const id = m.order[m.turnPos];
      if (!teamMovie(m, id).solved) {
        // Wer sich keinen Hinweis mehr leisten kann, darf direkt raten.
        m.turn = { teamId: id, phase: canBuyAny(db, st, m, id) ? 'buy' : 'answer' };
        return;
      }
      m.turnPos += 1;
    }
    m.cycle += 1;
    m.turnPos = 0;
  }
  m.turn = null;
}

function advance(db, ctx, game, st, m) {
  m.turnPos += 1;
  beginTurn(db, st, m);
  if (!m.turn) finishMovie(db, ctx, game, st, m);
}

// Wer am Ende eines Films 0 $ hat und nicht richtig geraten hat, scheidet aus.
function finishMovie(db, ctx, game, st, m) {
  if (m.finished) return;
  m.finished = true;
  m.turn = null;
  for (const id of m.order) {
    if (!teamMovie(m, id).solved && wallet(db, st, id) <= 0 && !st.out.includes(id)) {
      st.out.push(id);
      log(db, ctx, 'ablauf', `${teamName(db, id)} hat 0 $ und scheidet aus den weiteren Filmen aus`);
    }
  }
  log(db, ctx, 'ablauf', `Film ${st.movieIndex + 1} beendet`);
  effect(db, 'reveal');
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
      if (!m.turn || m.turn.teamId !== ctx.teamId) fail('Ihr seid gerade nicht am Zug.');
      if (m.turn.phase !== 'buy') fail('Gebt jetzt eure Antwort ab.');
      const i = Number(p.hint);
      if (!MOVIE_HINTS[i]) fail('Hinweis nicht gefunden.');
      const tm = teamMovie(m, ctx.teamId);
      if (tm.bought.includes(i)) fail('Diesen Hinweis habt ihr schon gekauft.');
      if (tm.bought.length >= MAX_BUYS) fail(`Pro Film höchstens ${MAX_BUYS} Hinweise.`);
      const price = MOVIE_HINTS[i][1];
      if (price > wallet(db, st, ctx.teamId)) fail('Dafür reicht euer Guthaben nicht.');
      st.wallet[ctx.teamId] -= price;
      tm.bought.push(i);
      m.turn.phase = 'answer';
      log(db, ctx, 'kauf', `${teamName(db, ctx.teamId)} kauft Hinweis ${i + 1} (${hintName(game, i)}) für ${price} $`);
    },

    answer(db, ctx, game, st, p) {
      const m = movie(st);
      if (!m.turn || m.turn.teamId !== ctx.teamId) fail('Ihr seid gerade nicht am Zug.');
      if (m.turn.phase !== 'answer') fail(m.turn.phase === 'buy' ? 'Erst einen Hinweis kaufen.' : 'Eure Antwort wird gerade bewertet.');
      // Filmtitel handschriftlich (Apple Pencil) oder als Text.
      const ink = cleanInk(p.ink);
      const text = ink ? '' : cleanText(p.text ?? '', 120);
      if (!ink && !text) fail('Bitte zuerst den Filmtitel aufschreiben.');
      teamMovie(m, ctx.teamId).answers.push({ text, ink, at: ctx.now, grade: null, cycle: m.cycle });
      m.turn.phase = 'grading';
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
      const m = { order, cycle: 1, turnPos: 0, turn: null, teams: {}, finished: false };
      st.movies[i] = m;
      beginTurn(db, st, m);
      log(db, ctx, 'ablauf', `Film ${i + 1} gestartet`);
    },

    // Antwort bewerten. Das Ergebnis sieht nur das betroffene Team.
    grade(db, ctx, game, st, p) {
      const m = movie(st);
      if (!m.turn || m.turn.phase !== 'grading') fail('Gerade wartet keine Antwort auf eine Bewertung.');
      const id = m.turn.teamId;
      const tm = teamMovie(m, id);
      const a = lastAnswer(tm);
      a.grade = !!p.correct;
      if (a.grade) {
        tm.solved = true;
        st.wallet[id] += REWARD;
      }
      log(db, ctx, 'bewertung', `${teamName(db, id)}: ${a.ink ? 'handschriftliche Antwort' : `„${a.text}“`} ${a.grade ? `richtig (+${REWARD} $)` : 'falsch'}`);
      advance(db, ctx, game, st, m);
    },

    // Team lässt seinen Zug aus (z. B. will nichts kaufen).
    skip(db, ctx, game, st) {
      const m = movie(st);
      if (!m.turn) fail('Gerade ist kein Team am Zug.');
      if (m.turn.phase === 'grading') fail('Erst die Antwort bewerten.');
      log(db, ctx, 'ablauf', `Zug von ${teamName(db, m.turn.teamId)} übersprungen`);
      advance(db, ctx, game, st, m);
    },

    endMovie(db, ctx, game, st) {
      const m = movie(st);
      if (m.finished) fail('Der Film ist bereits beendet.');
      if (m.turn?.phase === 'grading') fail('Erst die Antwort bewerten.');
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
    const m = st.movies[st.movieIndex];
    const content = game.content.movies[st.movieIndex];
    const tm = m.teams[teamId] || { bought: [], answers: [], solved: false };
    const myTurn = m.turn?.teamId === teamId;
    const answer = lastAnswer(tm);
    return {
      ...base,
      movieIndex: st.movieIndex,
      cycle: Math.min(m.cycle, MAX_CYCLES),
      playing: m.order.includes(teamId),
      finished: m.finished,
      title: m.finished ? content.title : null,
      turnTeam: m.turn ? teamName(db, m.turn.teamId) : null,
      myTurn,
      phase: myTurn ? m.turn.phase : null,
      maxBuys: MAX_BUYS,
      boughtCount: tm.bought.length,
      hints: MOVIE_HINTS.map(([, price], i) => {
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
    const m = st.movies[st.movieIndex];
    return {
      movieIndex: st.movieIndex,
      movieCount: game.content.movies.length,
      cycle: Math.min(m.cycle, MAX_CYCLES),
      maxCycles: MAX_CYCLES,
      turn: m.turn ? { teamId: m.turn.teamId, phase: m.turn.phase } : null,
      order: m.order,
      finished: m.finished,
      title: m.finished ? game.content.movies[st.movieIndex].title : null,
      out: st.out,
      converted: st.converted,
    };
  },
};
