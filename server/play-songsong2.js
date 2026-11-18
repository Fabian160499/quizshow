'use strict';

// Spiel „Song Song Song 2.0“: Pro Runde drei Songs (MP3/MP4). Der Beamer spielt sie
// reihum je zwei Sekunden (im Editor je Runde änderbar), mit weichem Übergang ineinander, immer weiter im Song, bis
// von jedem Song 15 Sekunden gelaufen sind (ca. 45 Sekunden). Danach ist Schluss,
// ein Neustart ist nicht möglich. Abgaben stoppen die Musik nicht, Zeit spielt keine Rolle.
//
// Teams schreiben per Hand und schicken per Buzzer verbindlich ab. Die Regie gibt jedem
// Team 0, 1, 2 oder 3 (erkannte Songs) – die Punkte dazu sind im Editor änderbar.
// Auflösung per Klick: je Team Name → Antwort → Punkte, sortiert von den wenigsten zu
// den meisten Punkten (bei Gleichstand zuerst, wer früher abgegeben hat), am Ende die
// drei Songtitel.

const { fail, log, effect, teamName, bookTarget, cleanInk, fxRelease } = require('./core');
const { pv } = require('./scoring');

const SEGMENT = 2; // Standard: Sekunden je Song und Durchgang (im Editor je Runde änderbar; Fabian, 18.11.2026: 2 statt 1)
const PER_SONG = 15; // Sekunden je Song insgesamt
const SONGS = [1, 2, 3];
const CLOSE_GRACE = 4000; // ms: nach „Abgabe schließen“ schicken die iPads noch das Geschriebene ab

function round(st, i) {
  if (!st.rounds[i]) st.rounds[i] = { started: false, playback: { state: 'stopped', seq: 0, at: 0 }, subs: [], grades: {}, rv: 0, revealed: false };
  return st.rounds[i];
}
function current(st) {
  if (st.index < 0) fail('Es läuft gerade keine Runde.');
  return round(st, st.index);
}
const pointsFor = (game, n) => (n > 0 ? pv(game, `n${n}`) : 0);

// Reihenfolge der Auflösung: wenigste Punkte zuerst, bei Gleichstand frühere Abgabe zuerst.
function revealList(game, r) {
  return r.subs.slice().sort((a, b) => (pointsFor(game, r.grades[a.teamId]) - pointsFor(game, r.grades[b.teamId])) || (a.at - b.at));
}
// Klick-Zähler rv → Team und Stufe (je Team 3 Klicks, dann je Song 1 Klick: Titel + Auflösungs-Datei).
function revealState(game, r) {
  if (!r.rv) return null;
  const list = revealList(game, r);
  const k = Math.floor((r.rv - 1) / 3);
  if (k >= list.length) return { list, k: list.length, stage: 'solution', sol: Math.min(3, r.rv - list.length * 3) };
  return { list, k, stage: ['name', 'answer', 'verdict'][(r.rv - 1) % 3] };
}
function verdictShown(game, r, teamId) {
  if (r.revealed) return true;
  const rs = revealState(game, r);
  if (!rs) return false;
  const i = rs.list.findIndex((s) => s.teamId === teamId);
  return i >= 0 && (i < rs.k || (i === rs.k && rs.stage === 'verdict'));
}
const audios = (p) => SONGS.map((n) => p[`audio${n}`]).filter(Boolean);
const titles = (p) => SONGS.map((n) => String(p[`title${n}`] || '').trim());
// Wie viele Songtitel schon aufgedeckt sind (ältere, fertig aufgelöste Runden: alle drei)
const solShown = (r) => (r.revealed ? 3 : r.sol || 0);
const solTitles = (p, r) => (solShown(r) ? titles(p).map((t, i) => (i < solShown(r) ? t : null)) : null);

module.exports = {
  fxManual: true, // Ergebnis aufs iPad erst bei der Auflösung
  init: () => ({ index: -1, rounds: {} }),
  revealState,
  SEGMENT,
  PER_SONG,

  team: {
    submit(db, ctx, game, st, p) {
      const r = current(st);
      if (!r.started) fail('Die Musik läuft noch nicht.');
      if (r.rv || r.revealed) fail('Die Auflösung läuft schon – keine Abgabe mehr.');
      if (r.closeAt && ctx.now > r.closeAt + CLOSE_GRACE) fail('Die Abgabe ist geschlossen.');
      if (r.subs.some((s) => s.teamId === ctx.teamId)) fail('Ihr habt schon abgeschickt.');
      const ink = cleanInk(p.ink);
      if (!ink) fail('Bitte zuerst die Songs aufschreiben.');
      const auto = !!r.closeAt;
      r.subs.push({ teamId: ctx.teamId, ink, at: ctx.now, auto });
      log(db, ctx, 'buzzer', `${teamName(db, ctx.teamId)} ${auto ? 'Abgabe beim Schließen (automatisch)' : 'schickt ab'} (Platz ${r.subs.length})`);
      if (!auto) effect(db, 'buzz');
    },
  },

  mod: {
    open(db, ctx, game, st, p) {
      const i = Number(p.index);
      if (!game.content.rounds[i]) fail('Runde nicht gefunden.');
      if (st.index >= 0 && st.index !== i) {
        const prev = round(st, st.index);
        if (prev.playback.state === 'playing') prev.playback = { state: 'stopped', seq: prev.playback.seq + 1, at: 0 };
      }
      st.index = i;
      round(st, i);
      log(db, ctx, 'ablauf', `Runde ${i + 1} vorbereitet`);
    },

    // Startet die Musik – genau einmal pro Runde, kein Neustart (Wunsch von Fabian).
    play(db, ctx, game, st) {
      const r = current(st);
      if (r.started) fail('Die Musik lief in dieser Runde schon – einmal hören reicht.');
      if (audios(game.content.rounds[st.index]).length < 3) fail('Für diese Runde fehlen noch Songs (drei Dateien nötig).');
      r.started = true;
      r.playback = { state: 'playing', seq: r.playback.seq + 1, at: ctx.now };
      log(db, ctx, 'ablauf', `Runde ${st.index + 1}: Musik läuft`);
    },

    stop(db, ctx, game, st) {
      const r = current(st);
      r.playback = { state: 'stopped', seq: r.playback.seq + 1, at: 0 };
    },

    // Abgabe schließen (nach den Songs): Teams ohne Abgabe schicken automatisch ab, was auf dem iPad steht.
    close(db, ctx, game, st) {
      const r = current(st);
      if (!r.started) fail('Die Musik lief noch nicht.');
      if (r.closeAt) fail('Die Abgabe ist schon geschlossen.');
      const total = 3 * PER_SONG * 1000;
      if (r.playback.state === 'playing' && ctx.now < r.playback.at + total) fail(`Die Songs laufen noch (noch ${Math.ceil((r.playback.at + total - ctx.now) / 1000)} s).`);
      r.closeAt = ctx.now;
      log(db, ctx, 'ablauf', `Runde ${st.index + 1}: Abgabe geschlossen – offene iPads schicken ihr Geschriebenes ab`);
    },

    // Bewertung je Team: 0, 1, 2 oder 3 erkannte Songs. Bis zur Auflösung änderbar, nur in der Regie sichtbar.
    grade(db, ctx, game, st, p) {
      const r = current(st);
      if (r.rv || r.revealed) fail('Die Auflösung läuft schon – Bewertung nicht mehr änderbar.');
      const n = Number(p.n);
      if (![0, 1, 2, 3].includes(n)) fail('Bitte 0, 1, 2 oder 3 wählen.');
      if (!r.subs.some((s) => s.teamId === p.teamId)) fail('Dieses Team hat noch nicht abgegeben.');
      r.grades[p.teamId] = n;
      bookTarget(db, ctx, `songsong2:${game.id}:${st.index}:${p.teamId}`, p.teamId, pointsFor(game, n), `${game.title}, Runde ${st.index + 1}`);
      log(db, ctx, 'bewertung', `${teamName(db, p.teamId)}: ${n} von 3 Songs (noch geheim)`);
    },

    // Auflösung per Klick: je Team Name → Antwort → Punkte, dann die drei Titel.
    reveal(db, ctx, game, st) {
      const r = current(st);
      if (r.revealed) fail('Diese Runde ist schon aufgelöst.');
      if (!r.started) fail('Die Musik lief noch nicht.');
      if (!r.rv && r.subs.some((s) => r.grades[s.teamId] === undefined)) fail('Erst alle Abgaben bewerten.');
      if (!r.closeAt) fail('Erst die Abgabe schließen.');
      r.rv = (r.rv || 0) + 1;
      const rs = revealState(game, r);
      if (rs.stage === 'verdict') {
        const s = rs.list[rs.k];
        const n = r.grades[s.teamId];
        effect(db, n > 0 ? 'correct' : 'wrong');
        fxRelease(db, [s.teamId], n > 0, ctx.now);
        log(db, ctx, 'beamer', `Auflösung: ${teamName(db, s.teamId)} ${n} von 3`);
      } else if (rs.stage === 'solution') {
        // Songtitel einzeln: Titel erscheint, die Auflösungs-Datei des Songs läuft auf dem Beamer
        r.sol = rs.sol;
        log(db, ctx, 'beamer', `Auflösung: Song ${rs.sol}`);
        if (rs.sol >= 3) {
          r.revealed = true;
          log(db, ctx, 'ablauf', `Runde ${st.index + 1} aufgelöst`);
        }
      }
    },
  },

  teamView(db, game, st, teamId) {
    if (st.index < 0) return null;
    const r = round(st, st.index);
    const own = r.subs.find((s) => s.teamId === teamId);
    const shown = own && verdictShown(game, r, teamId);
    return {
      index: st.index,
      count: game.content.rounds.length,
      started: r.started,
      canSubmit: r.started && !r.rv && !r.revealed && !own && !r.closeAt,
      // Abgabe geschlossen: iPad schickt sofort ab, was dort steht (kurze Nachfrist auf dem Server).
      closing: !!r.closeAt && !own && !r.rv && !r.revealed,
      submitted: !!own,
      place: own ? r.subs.indexOf(own) + 1 : null,
      found: shown ? r.grades[teamId] ?? null : null,
      points: shown ? pointsFor(game, r.grades[teamId] || 0) : null,
      revealing: !!r.rv && !r.revealed,
      solution: solTitles(game.content.rounds[st.index], r),
    };
  },

  beamerView(db, game, st) {
    if (st.index < 0) return { waiting: true };
    const r = round(st, st.index);
    const p = game.content.rounds[st.index];
    const rs = r.revealed ? { list: revealList(game, r), k: r.subs.length, stage: 'solution', sol: 3 } : revealState(game, r);
    const sol = solShown(r);
    const rev = sol ? p[`reveal${sol}`] : null;
    const board = rs ? rs.list.slice(0, Math.min(rs.k + 1, rs.list.length)).map((s, i) => {
      const cur = i === rs.k;
      const showAnswer = !cur || rs.stage !== 'name';
      const showGrade = !cur || rs.stage === 'verdict';
      const n = r.grades[s.teamId] ?? 0;
      return { teamId: s.teamId, place: r.subs.indexOf(s) + 1, current: cur, ink: showAnswer ? s.ink : null, hidden: !showAnswer, found: showGrade ? n : null, points: showGrade ? pointsFor(game, n) : null };
    }) : null;
    return {
      index: st.index,
      count: game.content.rounds.length,
      // Beamer spielt reihum: Song 1, 2, 3 je SEGMENT Sekunden, bis jeder PER_SONG Sekunden lief.
      songs: SONGS.map((n) => (p[`audio${n}`] ? { id: p[`audio${n}`].id, type: p[`audio${n}`].type, start: Number(p[`start${n}`]) || 0 } : null)),
      segment: Math.min(10, Math.max(0.5, Number(p.segment) || SEGMENT)),
      perSong: PER_SONG,
      playback: r.playback,
      started: r.started,
      order: r.subs.map((s) => ({ teamId: s.teamId })),
      closed: !!r.closeAt,
      revealing: !!rs,
      board,
      revealed: r.revealed,
      solution: solTitles(p, r),
      sol,
      // Auflösungs-Datei des zuletzt aufgedeckten Songs (läuft einmal)
      solPlay: rev ? { n: sol, id: rev.id, type: rev.type, key: `${st.index}:${sol}` } : null,
    };
  },
};
