// Beamer: Folien der zusätzlichen Spiele aus der Spiele-Datenbank – im Look der
// übrigen Spielfolien (graue rechteckige Boxen, Teamfarben als Akzente).
// Video und Musik laufen in dauerhaften Elementen außerhalb der Folie, damit
// ein Neuzeichnen die Wiedergabe nicht unterbricht.

import { pooled, playWithSound } from './media-pool.js';
import { h, mediaUrl } from './client.js';
import { BEAMER_NEU } from './neu-beamer.js';

// Punktwerte aus dem Editor (über den Server), sonst Standard.
const pv = (g, k, d = 1) => (g && g.scoring && typeof g.scoring[k] === 'number' ? g.scoring[k] : d);
const plus = (n) => `${n >= 0 ? '+' : '−'}${Math.abs(n)}`;


const ABCD = ['A', 'B', 'C', 'D'];
const pts = (n) => `${n} ${Math.abs(n) === 1 ? 'Punkt' : 'Punkte'}`;
const sub = (text, style = {}) => h('div', { class: 'sub', style: { marginTop: 0, ...style } }, text);
const chip = (t, extra = '', ...rest) => h('span', { class: `chip team-chip ${extra}`, '--chip': t.color }, t.name, ...rest);
const banner = (text, cls = '') => h('div', { class: `q ${cls}` }, text);
const countdown = (deadline) => h('b', { 'data-deadline': deadline }, '');
const fmt = (n) => String(Math.round(n * 100) / 100).replace('.', ',');

function options(v, { correct = null, marks = {}, compact = true } = {}) {
  return h('div', { class: `options ${compact ? 'compact' : ''}` }, ABCD.map((l) => h('div', { class: `opt ${correct === l ? 'correct' : ''} ${correct && correct !== l ? 'dim' : ''}` },
    h('b', {}, l), h('span', { class: 'grow' }, v.options[l]), h('span', { class: 'marks' }, ...(marks[l] || [])))));
}

// ---------- Medien (dauerhaft, außerhalb der Folie) ----------
const env = { soundOn: () => false };
export function setMediaEnv(e) { Object.assign(env, e); }

const media = { film: null, audio: null };
const last = { filmSeq: null, filmId: null, audioSeq: null, audioId: null, stageSeq: null, stageTimer: null };

function filmEl() {
  if (!media.film) {
    media.film = pooled('film');
    media.film.className = 'film-layer';
    document.body.append(media.film);
  }
  return media.film;
}
// „Hits me baby“: Häppchen sample-genau über Web Audio abspielen. Das Lied wird beim
// Auswählen einmal komplett geladen und dekodiert; jede Stufe startet dann ohne
// Lade- oder Anlaufzeit des Audio-Elements (wichtig für die 0,5-s-Stufe).
const konBufs = new Map();
let konSrc = null;
function konBuffer(ctx, id) {
  if (!konBufs.has(id)) {
    konBufs.set(id, (async () => {
      const url = await mediaUrl(id);
      if (!url) return null;
      const data = await (await fetch(url)).arrayBuffer();
      return await new Promise((res, rej) => ctx.decodeAudioData(data, res, rej));
    })().catch(() => null));
  }
  return konBufs.get(id);
}
function konStop() {
  if (!konSrc) return;
  const { src, gain, ctx } = konSrc;
  konSrc = null;
  try {
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.03);
    src.stop(ctx.currentTime + 0.05);
  } catch { /* schon beendet */ }
}
function konPlay(ctx, buf, from, len) {
  konStop();
  if (ctx.state === 'suspended') ctx.resume();
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const gain = ctx.createGain();
  const t = ctx.currentTime + 0.03;
  const end = t + len;
  // 10 ms ein- und ausblenden gegen Knackser
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(1, t + 0.01);
  gain.gain.setValueAtTime(1, Math.max(t + 0.01, end - 0.01));
  gain.gain.linearRampToValueAtTime(0, end);
  src.connect(gain).connect(ctx.destination);
  src.start(t, Math.min(from, Math.max(0, buf.duration - 0.05)), len + 0.02);
  konSrc = { src, gain, ctx };
  src.onended = () => { if (konSrc && konSrc.src === src) konSrc = null; };
}

function audioEl() {
  if (!media.audio) {
    media.audio = pooled('audio');
    media.audio.setAttribute('aria-hidden', 'true');
    document.body.append(media.audio);
  }
  return media.audio;
}
async function setSrc(el, id, key) {
  if (last[key] === id) return true;
  last[key] = id;
  const url = await mediaUrl(id);
  if (!url || last[key] !== id) return false;
  el.src = url;
  return true;
}
export function soundEnabled() {
  if (media.film) media.film.muted = !env.soundOn();
  if (media.audio) media.audio.muted = !env.soundOn();
}

// Bei jedem Neuzeichnen: Medien passend zum Spielzustand steuern.
export function syncMedia(s) {
  last.s = s;
  const v = s.view === 'game' ? s.gameView : null;
  const film = v && v.type === 'filmab' && !v.waiting ? v : null;
  const fl = media.film || (film ? filmEl() : null);
  if (fl) {
    fl.classList.toggle('on', !!film && !!film.clip && film.started && !film.resolved);
    if (!film) { if (!fl.paused) fl.pause(); last.filmSeq = null; } else if (film.clip) {
      fl.muted = !env.soundOn();
      const pb = film.playback;
      setSrc(fl, film.clip.id, 'filmId').then((ok) => {
        if (!ok && last.filmId !== film.clip.id) return;
        if (last.filmSeq === pb.seq) return;
        last.filmSeq = pb.seq;
        if (pb.state === 'playing') { if (pb.restart) fl.currentTime = 0; (fl.muted ? fl.play().catch(() => {}) : playWithSound(fl, { mutedFallback: true })); }
        else { fl.pause(); if (pb.state === 'stopped') fl.currentTime = 0; }
      });
    }
  }
  const song = v && v.type === 'songsong' && !v.waiting ? v : null;
  const kon = v && v.type === 'konsequenz' && !v.waiting ? v : null;
  const mus = v && v.type === 'musik' && v.current && v.current.clip ? v.current : null;
  const au = media.audio || (song || kon || mus ? audioEl() : null);
  if (!au) return;
  au.muted = !env.soundOn();
  if (!kon) konStop();
  if (song && song.audio) {
    setSrc(au, song.audio.id, 'audioId').then(() => {
      if (last.audioSeq === `s${song.playback.seq}`) return;
      last.audioSeq = `s${song.playback.seq}`;
      if (song.playback.state === 'playing') { au.currentTime = 0; (au.muted ? au.play().catch(() => {}) : playWithSound(au)); } else au.pause();
    });
  } else if (kon && kon.audio && last.konFallback !== kon.audio.id && env.soundOn() && env.audioCtx && env.audioCtx()) {
    // Web-Audio-Weg (echter Beamer mit Ton)
    const ctx = env.audioCtx();
    if (!au.paused) au.pause();
    const id = kon.audio.id;
    const bufP = konBuffer(ctx, id); // schon beim Auswählen laden
    if (kon.stage >= 0 && last.audioSeq !== `k${kon.seq}`) {
      last.audioSeq = `k${kon.seq}`;
      const seq = kon.seq;
      const from = kon.start || 0, len = kon.stages[kon.stage];
      bufP.then((buf) => {
        if (last.audioSeq !== `k${seq}`) return;
        if (buf) return konPlay(ctx, buf, from, len);
        // Dekodieren fehlgeschlagen: über das Audio-Element abspielen
        last.audioSeq = null;
        last.konFallback = id;
        syncMedia(last.s);
      });
    }
  } else if (kon && kon.audio) {
    konStop();
    setSrc(au, kon.audio.id, 'audioId').then(() => {
      if (last.audioSeq === `k${kon.seq}` || kon.stage < 0) return;
      last.audioSeq = `k${kon.seq}`;
      // Genau die Länge der Stufe ab dem Startpunkt spielen.
      clearTimeout(last.stageTimer);
      cancelAnimationFrame(last.stageRaf);
      au.pause();
      const from = kon.start || 0;
      const len = kon.stages[kon.stage];
      au.currentTime = from;
      // Sicher stoppen: an der Abspielposition (jedes Bild geprüft) und zusätzlich per Zeitgeber.
      const stopAt = from + len;
      const watch = () => {
        if (au.paused) return;
        if (au.currentTime >= stopAt) { au.pause(); return; }
        last.stageRaf = requestAnimationFrame(watch);
      };
      au.addEventListener('playing', () => {
        clearTimeout(last.stageTimer);
        last.stageTimer = setTimeout(() => au.pause(), len * 1000 + 150);
        last.stageRaf = requestAnimationFrame(watch);
      }, { once: true });
      // Falls „playing“ ausbleibt: spätestens nach Ladezeit + Stufenlänge anhalten.
      last.stageTimer = setTimeout(() => au.pause(), len * 1000 + 4000);
      (au.muted ? au.play().catch(() => {}) : playWithSound(au));
    });
  } else if (mus) {
    // Musikquiz (Jeopardy): Clip startet mit „Aufgabe starten“, pausiert beim Buzzern.
    konStop();
    setSrc(au, mus.clip.id, 'audioId').then(() => {
      const k = `m${mus.key}:${mus.playback.seq}`;
      if (last.audioSeq === k) return;
      last.audioSeq = k;
      const pb = mus.playback;
      if (pb.state === 'playing') { if (pb.restart) au.currentTime = 0; (au.muted ? au.play().catch(() => {}) : playWithSound(au)); }
      else { au.pause(); if (pb.state === 'stopped') au.currentTime = 0; }
    });
  } else if (!au.paused) {
    konStop();
    clearTimeout(last.stageTimer);
    cancelAnimationFrame(last.stageRaf);
    au.pause();
    last.audioSeq = null;
  }
}

export const BEAMER_EXTRA = { dumm3, filmab, weissnicht, weissnicht2, konsequenz, songsong, dgf, zocken, fragen, zuweit, brain, ...BEAMER_NEU };

const waitTitle = (t, small) => [h('div', { class: 'mega', style: { fontSize: 'clamp(2rem,5.5vw,5.5rem)' } }, t), small ? sub(small, { marginTop: '2vh' }) : null];

// ---------- Dumm, dumm, dumm ----------
function dumm3(v, teamOf) {
  if (v.waiting) return waitTitle('Dumm, dumm, dumm', 'Antwort wählen, Einsatz von 1 bis 5 setzen – jeden nur einmal!');
  const marks = {};
  for (const r of v.results) (marks[r.choice] ||= []).push(h('span', { class: 'stake-dot', '--chip': teamOf(r.teamId).color, title: teamOf(r.teamId).name }, String(r.stake)));
  const out = [h('div', { class: 'level-tag' }, v.level), banner(v.question, 'compact'), options(v, { correct: v.correct, marks })];
  if (!v.evaluated) out.push(sub(`${v.submittedCount} von ${v.teamCount} Teams haben verbindlich abgegeben`, { marginTop: '2vh' }));
  else out.push(h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '2vh' } }, v.results.map((r) => chip(teamOf(r.teamId), r.ok ? '' : 'wrong-soft', h('b', {}, ` ${r.ok ? '+' : '−'}${r.stake}`)))));
  return out;
}

// ---------- Film ab – Buzzer an! ----------
function filmab(v, teamOf) {
  if (v.waiting) return waitTitle('🎬 Film ab – Buzzer an!', 'Wer den Film erkennt, buzzert!');
  if (v.resolved) {
    return [banner(`🎬 ${v.title}`), v.winner ? h('div', { class: 'solution' }, `${teamOf(v.winner).name} ${plus(pv(v, 'correct'))}`) : h('div', { class: 'solution' }, 'Niemand hat es erraten'),
      buzzOrder(v, teamOf)];
  }
  if (!v.clip) return waitTitle('🎬', 'Kein Filmausschnitt hinterlegt');
  if (!v.started) return waitTitle('🎬 Gleich geht’s los …');
  // Das Video liegt als eigene Ebene darüber; hier nur die Leiste mit den Buzzern.
  return [h('div', { class: 'film-bar' }, v.answering ? chip(teamOf(v.answering), 'answering', ' 🔔 antwortet') : sub('Buzzer frei!'), buzzOrder(v, teamOf, true))];
}
function buzzOrder(v, teamOf, onlyDone = false) {
  const list = v.buzzOrder.filter((b) => !onlyDone || b.status !== 'pending');
  if (!list.length) return null;
  return h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '1.5vh' } }, list.map((b) => chip(teamOf(b.teamId), b.status === 'wrong' ? 'wrong' : '', b.status === 'correct' ? ' ✓' : b.status === 'wrong' ? ' ✗' : '')));
}

// Großes Bild aus dem Medienspeicher (asynchron geladen).
function bigImage(m, cls = 'big-image') {
  const img = h('img', { class: cls, alt: '' });
  if (m) mediaUrl(m.id).then((url) => { if (url) img.src = url; });
  return h('div', { class: `${cls}-box` }, m ? img : h('div', { class: 'no-image' }, 'Kein Bild hinterlegt'));
}

// ---------- Ich weiß nicht, dass du weißt es doch ----------
function weissnicht(v, teamOf) {
  if (v.waiting) return waitTitle('Ich weiß nicht, dass du weißt es doch', 'Wer zuerst buzzert, wählt ein Team, das es angeblich nicht weiß.');
  const out = [v.question ? banner(v.question, 'compact slim') : null, bigImage(v.image)];
  const foot = [];
  if (v.result) {
    const winner = v.result === 'right' ? v.target : v.buzzer;
    foot.push(h('div', { class: 'solution' }, `${v.solution ? `${v.solution} – ` : ''}${plus(pv(v, 'winner'))} für ${teamOf(winner).name}`));
  } else if (v.target) {
    foot.push(chip(teamOf(v.buzzer), '', ' wählt '), chip(teamOf(v.target), 'answering', ' antwortet'), h('span', { class: 'big-count' }, countdown(v.deadline)));
  } else if (v.buzzer) {
    foot.push(chip(teamOf(v.buzzer), 'answering', ' 🔔 war am schnellsten und wählt …'));
  } else if (v.closed) {
    foot.push(h('div', { class: 'solution' }, v.solution ? `Lösung: ${v.solution}` : 'Frage beendet'));
  }
  if (foot.length) out.push(h('div', { class: 'row img-foot' }, foot));
  return out;
}

// ---------- Ich weiß nicht, dass du weißt es doch 2.0 ----------
function weissnicht2(v, teamOf) {
  if (v.waiting) return waitTitle('Ich weiß nicht, dass du weißt es doch 2.0', 'Alle schreiben – der schnellste Buzzer schätzt danach ein, wer richtig liegt.');
  if (v.evaluated) {
    const s = v.score;
    const buzzer = s && s.buzzer;
    // Eine Karte je Team: Antwort, richtig/falsch, Tipp des Buzzer-Teams und die Punkte des Teams.
    const card = (a, tag, points, extra = '') => {
      const t = teamOf(a.teamId);
      return h('div', { class: `answer fx-card has-ink ${extra}`.trim(), '--team': t.color },
        h('div', { class: 'ans-body' }, h('img', { class: 'ink-answer beamer', src: a.ink, alt: '' }),
          a.correct === null ? null : h('span', { class: `mark ${a.correct ? 'ok' : 'bad'}` }, a.correct ? '✓' : '✗'), tag,
          h('span', { class: `pts-tag${points > 0 ? ' plus' : ''}` }, points > 0 ? `+${points}` : '0')),
        h('div', { class: 'ans-name' }, t.name));
    };
    const group = (kind, title, note, cards) => (cards.length ? h('section', { class: `wn2-group ${kind}`, style: { flexGrow: cards.length }, '--cols': Math.min(cards.length, 3) },
      h('header', {}, h('b', {}, title), note ? h('span', {}, note) : null),
      h('div', { class: 'answers small' }, cards)) : null);
    const own = (a) => (a.correct ? 1 : 0);
    let groups;
    if (!buzzer) {
      groups = [group('rest', 'Alle Antworten', `kein Buzzer – jede richtige Antwort ${plus(pv(v, 'other'))}`, v.answers.map((a) => card(a, null, own(a))))];
    } else {
      const b = v.answers.find((a) => a.teamId === buzzer);
      const rated = v.answers.filter((a) => a.teamId !== buzzer && a.guess !== null);
      const skipped = v.answers.filter((a) => a.teamId !== buzzer && a.guess === null);
      const bPts = s.guessPoints + s.ownPoint;
      // Das Ergebnis des Buzzer-Teams groß und eindeutig: grün mit Punkten oder rot mit 0.
      const verdict = h('div', { class: `wn2-verdict ${s.allRight ? 'win' : 'lose'}` },
        h('div', { class: 'big' }, s.allRight ? `+${bPts}` : '0'),
        h('div', { class: 'what' }, s.allRight ? (bPts === 1 ? 'PUNKT' : 'PUNKTE') : 'PUNKTE'),
        h('div', { class: 'why' }, s.allRight
          ? `✓ Alle ${s.guessPoints} Einschätzung${s.guessPoints === 1 ? '' : 'en'} richtig${s.ownPoint ? ' + eigene Antwort' : ''}`
          : '✗ Eine Einschätzung falsch – alles verloren'));
      const bGroup = b ? h('section', { class: `wn2-group buzz ${s.allRight ? 'win' : 'lose'}`, style: { flexGrow: 1 }, '--cols': 1 },
        h('header', {}, h('b', {}, '🔔 Gebuzzert')), verdict, h('div', { class: 'answers small' }, card(b, null, bPts))) : null;
      groups = [
        bGroup,
        group('rated', 'Eingeschätzt', 'Tipp vom Buzzer-Team', rated.map((a) => card(a,
          h('span', { class: `guess-tag ${a.guess === a.correct ? 'ok' : 'bad'}` }, `Tipp: ${a.guess ? 'richtig' : 'falsch'} ${a.guess === a.correct ? '✓' : '✗'}`), own(a),
          a.guess === a.correct ? 'tip-ok' : 'tip-bad'))),
        group('skip', 'Ausgelassen', 'nicht eingeschätzt', skipped.map((a) => card(a, null, own(a)))),
      ];
    }
    return [v.question ? banner(v.question, 'compact slim') : null,
      v.solution ? h('div', { class: 'solution', style: { marginTop: 0 } }, `Lösung: ${v.solution}`) : null,
      h('div', { class: 'wn2-groups' }, groups)];
  }
  const out = [v.question ? banner(v.question, 'compact slim') : null, bigImage(v.image)];
  out.push(h('div', { class: 'row img-foot' }, sub(`${v.submittedCount} von ${v.teamCount} Teams haben abgegeben`),
    v.buzzer ? chip(teamOf(v.buzzer), 'answering', v.guessing ? ' 🔔 schätzt jetzt ein …' : ' 🔔 war am schnellsten') : null));
  return out;
}

// ---------- Hits me baby, one more time ----------
function stageStrip(v) {
  return h('div', { class: 'kon-stages' }, v.stages.map((s, i) => h('div', { class: `kon-st${i === v.stage ? ' now' : i < v.stage ? ' past' : ''}` },
    h('b', {}, `${fmt(s)} s`), h('small', {}, pts(v.points[i])))));
}
function konsequenz(v, teamOf) {
  if (v.waiting) return waitTitle('Hits me baby, one more time', '0,5 s · 1 s · 3 s · 5 s · 10 s – je früher, desto mehr Punkte');
  const out = [h('div', { class: `eq${v.stage >= 0 && !v.awarded ? ' live' : ''}`, 'aria-hidden': 'true', key: v.seq }, Array.from({ length: 14 }, (_, i) => h('i', { style: { animationDelay: `${(i % 7) * 0.08}s` } }))), stageStrip(v)];
  if (v.awarded) {
    out.push(h('div', { class: 'solution' }, `🎵 ${v.title || ''}`));
    out.push(h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '1.5vh' } }, v.results.map((r) => chip(teamOf(r.teamId), r.correct ? '' : 'wrong-soft', h('b', {}, ` ${fmt(v.stages[r.stage])} s · ${r.correct ? `+${r.points}` : '0'}`)))));
  } else if (v.submissions.length) {
    out.push(h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '2vh' } }, v.submissions.map((x) => chip(teamOf(x.teamId), '', h('b', {}, ` 🔔 ${fmt(v.stages[x.stage])} s`)))));
  }
  return out;
}

// ---------- Song Song Song ----------
function songsong(v, teamOf) {
  if (v.waiting) return waitTitle('Song Song Song', 'Melodie des einen, Text des anderen Songs – schreibt beide Titel!');
  const playing = v.playback.state === 'playing' && !v.done;
  const out = [h('div', { class: `vinyl${playing ? ' spin' : ''}`, 'aria-hidden': 'true' }, h('div', { class: 'vinyl-label' }, '♪'))];
  if (v.done) out.push(h('div', { class: 'solution' }, v.solution.filter(Boolean).join('  +  ') || 'Aufgelöst'), v.winner ? h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '1vh' } }, chip(teamOf(v.winner), '', ` ${plus(pv(v, 'correct'))}`)) : null);
  else if (!v.started) out.push(sub('Gleich läuft das Mash-up …', { marginTop: '2vh' }));
  if (v.order.length) {
    out.push(h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '2vh' } }, v.order.map((o, i) => chip(teamOf(o.teamId), o.grade === false ? 'wrong' : '', h('b', {}, ` ${i + 1}.`), o.grade === true ? ' ✓' : o.grade === false ? ' ✗' : ''))));
  }
  return out;
}

// ---------- DankeGleichFalsch ----------
let dgfFlashSeq = null;
function dgf(v, teamOf) {
  if (v.waiting) return waitTitle('Danke, gleichfalsch!', '25 Begriffe – 3 passen nicht. Wer aussteigt, sichert seine Punkte.');
  const turn = v.turn ? teamOf(v.turn) : null;
  const head = h('div', { class: 'dgf-head' },
    banner(v.name, 'compact slim'),
    turn ? h('div', { class: 'dgf-clock bm', '--chip': turn.color }, h('span', {}, turn.name), countdown(v.deadline)) : null);
  const board = h('div', { class: 'dgf-grid' }, v.board.map((b) => h('div', {
    class: `dgf-tile${b.gone ? ' gone' : ''}${b.wrong === true ? ' wrong' : ''}`,
    '--chip': b.by ? teamOf(b.by).color : 'transparent',
  }, b.gone ? '' : b.text)));
  const teams = h('div', { class: 'dgf-teams' }, v.teams.map((t) => {
    const team = teamOf(t.teamId);
    const tag = { wrong: '✗', timeout: '⏱', secured: '✓', finished: '✓' }[t.out] || '';
    return chip(team, `${t.out === 'wrong' || t.out === 'timeout' ? 'wrong' : ''}${v.turn === t.teamId ? ' answering' : ''}`, h('b', {}, ` ${tag}`));
  }));
  const out = [head, board, teams];
  // Kurzer Hinweis „FALSCH“ ohne den Begriff zu verraten.
  if (v.flash && v.flash.seq !== dgfFlashSeq && v.flash.kind !== 'right') {
    dgfFlashSeq = v.flash.seq;
    out.push(h('div', { class: `dgf-flash ${v.flash.kind}` }, h('b', {}, { wrong: 'FALSCH!', timeout: 'ZEIT UM!', secured: 'GESICHERT' }[v.flash.kind] || ''), h('span', {}, teamOf(v.flash.teamId).name)));
  } else if (v.flash) dgfFlashSeq = v.flash.seq;
  if (v.done) {
    const wrong = v.board.filter((b) => b.wrong === true).map((b) => b.text);
    out.push(h('div', { class: 'dgf-reveal' }, h('span', {}, `${v.found} von 22 gefunden · Die drei falschen Begriffe:`), h('b', {}, wrong.join('  ·  '))));
  }
  return out;
}

// ---------- Erst ich, dann du, dann du, dann du ----------
function zocken(v, teamOf) {
  const c = v.current;
  const board = h('div', { class: 'zock-grid' }, Array.from({ length: 24 }, (_, i) => h('div', { class: `zock-tile${v.removed.includes(i) ? ' gone' : ''}${c && c.q === i && !c.resolved ? ' now' : ''}` }, String(i + 1))));
  if (!c || (c.resolved && !v.decide && !v.choose)) {
    const out = [board];
    if (c && c.resolved) out.unshift(h('div', { class: 'solution', style: { margin: '0 auto 2vh' } }, `Feld ${c.q + 1}: ${c.answer}`));
    out.unshift(seriesBar(v, teamOf));
    if (v.done) out.push(h('div', { class: 'solution' }, 'Alle 24 Felder gespielt!'));
    return out;
  }
  if (v.decide) return [seriesBar(v, teamOf), board, h('div', { class: 'row zock-foot' }, chip(teamOf(v.decide), 'answering', ' ✓ richtig – sichern oder zocken?'))];
  if (v.choose) return [seriesBar(v, teamOf), board, h('div', { class: 'row zock-foot' }, chip(teamOf(v.choose), 'answering', ' 🎲 wählt das nächste Feld …'))];
  const out = [seriesBar(v, teamOf), h('div', { class: 'zock-num' }, `Feld ${c.q + 1}`), banner(c.question)];
  if (c.answering) out.push(h('div', { class: 'row', style: { justifyContent: 'center' } }, chip(teamOf(c.answering), 'answering', c.mode === 'zock' ? ' 🎲 zockt' : ' 🔔 antwortet')));
  else out.push(sub('Buzzer frei!', { marginTop: '1vh' }));
  const wrong = c.buzzOrder.filter((b) => b.status === 'wrong');
  if (wrong.length) out.push(h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '1vh' } }, wrong.map((b) => chip(teamOf(b.teamId), 'wrong', ' ✗'))));
  if (v.streaks.length) out.push(h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '2vh' } }, v.streaks.map((s) => chip(teamOf(s.teamId), '', h('b', {}, ` ungesichert ${s.v}`)))));
  return out;
}

// Laufende Zock-Serie bzw. letztes Ergebnis: wie viele Punkte gerade erspielt sind / auf dem Spiel stehen.
function seriesBar(v, teamOf) {
  if (v.series) {
    const t = teamOf(v.series.teamId);
    const txt = v.series.phase === 'zock' ? `${pts(v.series.v)} stehen auf dem Spiel` : `${pts(v.series.v)} erspielt (ungesichert)`;
    return h('div', { class: 'zock-series', '--chip': t.color }, h('b', {}, t.name), h('span', {}, txt), h('em', {}, String(v.series.v)));
  }
  if (v.last) {
    const t = teamOf(v.last.teamId);
    const txt = { secured: `sichert ${pts(v.last.v)}`, lost: v.last.v ? `verliert ${pts(v.last.v)}` : 'falsch', won: `${pts(v.last.v)} erspielt` }[v.last.kind];
    return h('div', { class: `zock-series ${v.last.kind}`, '--chip': t.color }, h('b', {}, t.name), h('span', {}, txt));
  }
  return null;
}

// ---------- Habt ihr noch Fragen? ----------
function fragen(v, teamOf) {
  if (v.waiting) return waitTitle('Habt ihr noch Fragen?', 'Denkt euch eine Frage aus – die anderen haben 20 Sekunden.');
  const out = [h('div', { class: 'level-tag' }, 'Kategorie'), banner(v.name, 'compact')];
  if (!v.published) {
    out.push(sub(v.proposals ? `${v.proposals} ${v.proposals === 1 ? 'Vorschlag' : 'Vorschläge'} eingegangen` : 'Teams schreiben ihre Fragen …', { marginTop: '2vh' }));
    return out;
  }
  // Sobald Antworten eingeblendet sind, rückt die Frage zusammen, damit alles auf eine Folie passt.
  if (v.answers.length || v.solution) out.splice(0, out.length, banner(`${v.name}`, 'compact slim'));
  out.push(h('div', { class: `fragen-q${v.answers.length || v.solution ? ' small' : ''}` }, h('img', { class: 'ink-board', src: v.question, alt: 'Frage' }), h('div', { class: 'ans-name' }, `Frage von ${teamOf(v.asker).name}`)));
  if (!v.evaluated && v.deadline) out.push(h('div', { class: 'big-count center' }, countdown(v.deadline)));
  if (v.answers.length) out.push(h('div', { class: 'answers small' }, v.answers.map((a) => {
    const t = teamOf(a.teamId);
    return h('div', { class: 'answer fx-card has-ink', '--team': t.color }, h('div', { class: 'ans-body' }, h('img', { class: 'ink-answer beamer', src: a.ink, alt: '' }),
      a.correct === null ? null : h('span', { class: `mark ${a.correct ? 'ok' : 'bad'}` }, a.correct ? '✓' : '✗')), h('div', { class: 'ans-name' }, t.name));
  })));
  // Erst die Antworten der anderen Teams, danach die Antwort des fragenden Teams.
  if (v.solution) out.push(h('div', { class: 'fragen-sol', style: { animationDelay: `${0.4 + v.answers.length * 0.35}s` } }, h('span', {}, `Antwort von ${teamOf(v.asker).name}`), h('img', { class: 'ink-board small', src: v.solution, alt: 'Lösung' })));
  if (v.evaluated && v.result) out.push(h('div', { class: 'solution' }, v.result.right.length ? `${v.result.right.map((id) => teamOf(id).name).join(', ')} ${plus(pv(v, 'correct'))} · ${teamOf(v.asker).name} ${plus(pv(v, 'askerSomeone', -1))}` : `Niemand wusste es: ${teamOf(v.asker).name} ${plus(pv(v, 'askerNobody', 2))}`));
  return out;
}

// ---------- Das geht mir zu weit ----------
function zuweit(v, teamOf) {
  if (v.waiting) return waitTitle('Das geht mir zu weit', 'Zwei Einträge wählen – die Differenz entscheidet.');
  const out = [h('div', { class: 'level-tag' }, `${v.dataset} · ${v.mode} gewinnt`), banner(v.task, v.evaluated ? 'compact slim' : 'compact')];
  if (!v.evaluated) {
    out.push(sub(`${v.submittedCount} von ${v.teamCount} Teams haben abgegeben`, { marginTop: '2vh' }));
  } else {
    const unit = v.unit;
    const val = (x) => (x === null || x === undefined ? '' : ` (${fmt(x)}${unit === 'Platz' || unit === 'Ordnungszahl' ? '' : ` ${unit}`})`);
    out.push(h('ol', { class: 'rank rank-board zuweit' }, v.rows.map((r, i) => {
      const t = teamOf(r.teamId);
      return h('li', { '--team': t.color, style: { animationDelay: `${(v.rows.length - 1 - i) * 0.35}s` } },
        h('span', { class: 'pos' }, String(i + 1)),
        h('span', { class: 'nm' }, h('b', {}, t.name), h('small', {}, `${r.a}${v.kind === 'geo' ? '' : val(r.va)} & ${r.b}${v.kind === 'geo' ? '' : val(r.vb)}`)),
        h('span', { class: 'pts' }, r.valid ? `${fmt(r.diff)} ${unit === 'Platz' ? 'Plätze' : unit}` : 'ungültig', r.best ? h('em', { class: 'plus' }, ` ${plus(pv(v, 'best', 2))}`) : r.worst ? h('em', { class: 'minus' }, ` ${plus(pv(v, 'worst', -1))}`) : null));
    })));
    out.push(h('div', { class: 'source-line' }, `Quelle: ${v.source} · Datenstand ${v.asOfData}${v.asOf && v.kind === 'birth' ? ` · Alter am ${v.asOf.split('-').reverse().join('.')}` : ''} · ${v.method}`));
  }
  return out;
}

// ---------- Brain or Dreh'n ----------
let wheelShown = null;
function wheel(v, teamOf) {
  const n = v.wheel.fields.length;
  const seg = 360 / n;
  const R = 200;
  const parts = v.wheel.fields.map((f, i) => {
    const a0 = (i * seg - 90 - seg / 2) * Math.PI / 180;
    const a1 = ((i + 1) * seg - 90 - seg / 2) * Math.PI / 180;
    const path = `M0 0 L${R * Math.cos(a0)} ${R * Math.sin(a0)} A${R} ${R} 0 0 1 ${R * Math.cos(a1)} ${R * Math.sin(a1)} Z`;
    const am = (i * seg - 90) * Math.PI / 180;
    return `<path d="${path}" class="${f.good ? 'good' : 'bad'}"/><text x="${R * 0.72 * Math.cos(am)}" y="${R * 0.72 * Math.sin(am)}" class="wi">${f.icon}</text>`;
  }).join('');
  const box = h('div', { class: 'wheel-box' });
  const spin = v.wheel.spin;
  // Landet so, dass das gezogene Feld oben unter dem Zeiger steht.
  const target = spin ? 360 * 6 - spin.index * seg : 0;
  const fresh = spin && wheelShown !== `${v.round}:${spin.index}`;
  box.innerHTML = `<svg viewBox="-215 -215 430 430" class="wheel-svg"><g class="wheel-rot" style="transform: rotate(${fresh ? 0 : target}deg)">${parts}<circle r="34" class="hub"/></g><polygon points="-14,-214 14,-214 0,-180" class="pointer"/></svg>`;
  if (fresh) {
    wheelShown = `${v.round}:${spin.index}`;
    requestAnimationFrame(() => requestAnimationFrame(() => { const g = box.querySelector('.wheel-rot'); if (g) { g.classList.add('spinning'); g.style.transform = `rotate(${target}deg)`; } }));
  }
  const card = spin ? h('div', { class: `wheel-card ${spin.field.good ? 'good' : 'bad'}${fresh ? ' later' : ''}` },
    h('div', { class: 'wc-icon' }, spin.field.icon), h('b', {}, spin.field.name), h('p', {}, spin.text || spin.field.text), h('span', {}, `${teamOf(spin.teamId).name}${spin.field.good ? ' – Joker kommt in den Vorrat' : ''}`)) : null;
  return h('div', { class: 'wheel-stage' }, box, card);
}

function brain(v, teamOf) {
  if (v.waiting) return waitTitle('Brain or Dreh’n', 'Wissen bringt Punkte – das Glücksrad bringt Joker … oder Pech.');
  return [...brainBody(v, teamOf), brainPoints(v, teamOf)].filter(Boolean);
}
// Spielpunkte dieser Runde (nicht der Show-Gesamtstand) für alle Teams, dauerhaft unten.
function brainPoints(v, teamOf) {
  return h('div', { class: 'brain-points' }, (v.points || []).map((p) => {
    const t = teamOf(p.teamId);
    return h('div', { class: 'bp', '--chip': t.color }, h('span', {}, t.name), h('b', {}, String(p.points)));
  }));
}
function brainBody(v, teamOf) {
  const events = v.events.length ? h('div', { class: 'brain-events' }, v.events.map((e) => h('span', {}, e.text))) : null;
  if (v.phase === 'category') {
    return [h('div', { class: 'level-tag' }, `Kategorie ${v.round + 1} von ${v.count}`), h('div', { class: 'brain-cat' }, v.category),
      v.joker ? h('div', { class: 'row', style: { justifyContent: 'center' } }, chip(teamOf(v.joker.teamId), 'answering', v.joker.secret ? ' 🃏 setzt einen geheimen Joker ein' : ` ${v.joker.field.icon} ${v.joker.field.name}${v.joker.stake ? ` (Einsatz ${v.joker.stake})` : ''}${v.joker.target ? ` → ${teamOf(v.joker.target).name}` : ''}${v.joker.shielded ? ' – 🛡️ abgewehrt!' : ''}`)) : sub('Jetzt Joker einsetzen – nach dem Vorlesen ist es zu spät!', { marginTop: '2vh' }),
      events];
  }
  if (v.phase === 'wheel' || (v.phase === 'evaluated' && v.wheel.spin)) {
    return [h('div', { class: 'row', style: { justifyContent: 'center', marginBottom: '1vh' } },
      v.wheel.buzz ? chip(teamOf(v.wheel.buzz), 'answering', ' 🎡 dreht das Glücksrad') : sub('Wer richtig lag, buzzert jetzt ans Glücksrad!')), wheel(v, teamOf)];
  }
  const marks = {};
  const out = [h('div', { class: 'level-tag' }, v.category), banner(v.question, 'compact'), options(v, { correct: v.correct, marks })];
  if (v.phase === 'question') {
    out.push(h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '1.5vh' } }, sub(`${v.answeredCount} Antworten eingeloggt`),
      v.blocked.map((id) => chip(teamOf(id), 'wrong', ' ⛔ gesperrt')),
      (v.rush || []).filter((x) => !x.answered).map((x) => chip(teamOf(x.teamId), 'wrong', ' ⏱ ', countdown(x.deadline)))));
  } else {
    out.push(h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '1.5vh' } }, v.results.filter((r) => r.answered).map((r) => chip(teamOf(r.teamId), r.ok ? '' : 'wrong-soft', r.ok ? ' ✓' : ' ✗'))));
  }
  if (events) out.push(events);
  return out;
}
