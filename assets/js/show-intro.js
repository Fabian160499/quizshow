// Show-Intro im Browser – Inszenierung auf TV-Niveau für Beamer und Team-iPads.
//
// Jedes Thema hat eine eigene Regie (si-scenes.js): Bielefeld, The Voice, Musical, Casino, Wildnis (Survival-Doku),
// Weltraum (Missionskontrolle mit Go/No-Go über alle iPads, Liftoff).
// Zeitachse je Thema aus dem Katalog (si.tl); die Standard-Musik ist genau darauf komponiert
// (assets/music/<thema>-intro.mp3, Höhepunkt = tl.boom), eigene Musik ersetzt sie.
// Danach per Klick: Teams (6 verschiedene Auftritte + eigener Jingle), Co-Moderation,
// Moderation, alle zusammen. Die iPads sind dabei eine gemeinsame Lichtanlage (si-lights.js).

import { h, run, later, atTime, nowEl, clearTimers, makeSound, playMedia, audioEl, fadeOut, setVol, musicUrl, Fx, SYNTH } from './si-core.js';
import { look, autoScene, personScene, allScene } from './si-scenes.js';
import { siTeam as lightTeam, siTeamStop as lightStop } from './si-lights.js';

export function siTeam(v, me, teams, now, opts) { return lightTeam(v, me, teams, now, opts); }
export function siTeamStop() { lightStop(); }

export function siStop() {
  clearTimers();
  run.seq = null;
  fadeOut(run.music, 1600); fadeOut(run.bed, 1600); fadeOut(run.voice, 600); fadeOut(run.song, 900); fadeOut(run.jingle, 900);
  run.musicKey = null; run.bedKey = null;
  if (run.fx) { run.fx.stop(); run.fx = null; }
  document.body.classList.remove('si-active');
}

const duckTargets = () => [run.music, run.bed].filter(Boolean);
function duck(v, ms = 350) { for (const el of duckTargets()) setVol(el, v * (el === run.bed ? 0.55 : 1), ms); }

// env: { now(), ctx() (AudioContext|null), audible(), sound (bool), speak?(text), audioEl?(key) }
export function siBeamer(s, env) {
  const si = s.showIntro;
  const L = look(si.theme);
  const el = (env.now() - si.at) / 1000;
  document.body.classList.add('si-active');
  const fresh = run.seq !== si.seq;
  run.seq = si.seq;
  clearTimers();
  run.t0 = performance.now() - el * 1000;
  const sound = makeSound(env, si, fresh, false);
  const tl = si.tl || { teaser: 3, boom: 15, lines: 21, line: 2.7 };

  // ---- Musik ----
  const startBed = (vol = 0.55) => {
    if (si.music) return;
    const key = `${si.theme}-bed`;
    if (run.bed && !run.bed.paused && run.bedKey === key) return;
    run.bed = audioEl('si-bed', env); run.bedKey = key;
    playMedia(run.bed, musicUrl(key), 0, env, vol, true);
  };
  if (env.sound) {
    if (si.music) {
      run.music = audioEl('si-music', env);
      if (si.phase === 'auto' && run.musicKey !== `${si.music.id}@${si.at}`) {
        run.musicKey = `${si.music.id}@${si.at}`;
        const wait = tl.boom - (si.dropSec || 0) - el;
        if (wait > 0) later(wait, () => playMedia(run.music, si.music, 0, env, 1));
        else playMedia(run.music, si.music, -wait, env, 1);
      } else if (!run.musicKey) { run.musicKey = `${si.music.id}@late`; playMedia(run.music, si.music, 0, env, 0.7); }
    } else if (si.phase === 'auto') {
      const key = `${si.theme}@${si.at}`;
      if (run.musicKey !== key) {
        run.musicKey = key;
        if (run.bed) fadeOut(run.bed, 400);
        run.music = audioEl('si-music', env);
        run.music.onended = () => { if (run.musicKey === key) startBed(); };
        playMedia(run.music, musicUrl(`${si.theme}-intro`), Math.max(0, el), env, 1);
      }
    } else if (!run.music || run.music.paused) startBed();
  }

  const voice = (clip, text, at = 0) => {
    if (!fresh || !text) return;
    const dt = at - nowEl(el);
    if (dt < -1) return;
    if (clip && env.sound) {
      run.voice = audioEl('si-voice', env);
      later(Math.max(0, dt), () => {
        duck(0.3); setVol(run.song, 0.35); setVol(run.jingle, 0.45);
        run.voice.onended = () => { duck(run.jingle && !run.jingle.paused ? 0.2 : 1, 900); setVol(run.song, 1); setVol(run.jingle, 1); };
        playMedia(run.voice, clip, 0, env, 1);
      });
    } else if (env.speak) later(Math.max(0, dt), () => env.speak(text));
  };
  // Jingle zum Auftritt: eigener Einlaufsong (ab dem Einschlag) oder Standard-Jingle (Einschlag bei 1,7 s)
  const jingle = (name, song, hitAt) => {
    if (!env.sound || !fresh || el > 0.6) return;
    if (run.song && !run.song.paused) fadeOut(run.song, 400);
    if (run.jingle && !run.jingle.paused) fadeOut(run.jingle, 300);
    if (song) {
      const a = env.ctx && env.ctx();
      if (a && hitAt > 0.5) { if (a.state === 'suspended') a.resume(); SYNTH.roll(a, a.currentTime + 0.05, hitAt - 0.05); }
      later(Math.max(0, hitAt - nowEl(el)), () => {
        run.song = audioEl('si-song', env); duck(0.12); playMedia(run.song, song, 0, env, 1);
        later(15, () => { fadeOut(run.song, 1500); duck(1, 1500); });
      });
      return;
    }
    if (si.music) return; // eigene Hintergrundmusik: keine Standard-Jingles darüber
    run.jingle = audioEl('si-jingle', env);
    duck(0.18, 250);
    run.jingle.onended = () => duck(1, 1400);
    playMedia(run.jingle, musicUrl(`${si.theme}-${name}`), Math.max(0, el), env, 1);
  };

  const fxCanvas = h('canvas', { class: 'si-fx', 'aria-hidden': 'true' });
  const root = h('div', { class: `si si-${si.theme} ${L.font} ph-${si.phase.replace(':', '-')}`, '--a': L.a, '--b': L.b, '--c': L.c, '--d': L.d, '--bg': L.bg },
    h('div', { class: 'si-bg' }), h('div', { class: 'si-haze', 'aria-hidden': 'true' }), fxCanvas,
    h('div', { class: 'si-grain', 'aria-hidden': 'true' }), h('div', { class: 'si-vignette', 'aria-hidden': 'true' }));
  const c = { root, si: { ...si, tl, tx: si.tx || {}, games: si.games || [], teams: si.teams || [], clips: si.clips || {}, lines: si.lines || [] }, s, L, el, sound, voice, jingle, env, ready: [] };
  c.sound = sound;
  c.fx = (f) => (run.fx && !run.fx.stopped && run.fx.c === fxCanvas ? f(run.fx) : c.ready.push(f));
  c.shake = (at, strong) => atTime(el, at, () => { root.classList.remove('si-shake', 'si-shake-big'); void root.offsetWidth; root.classList.add(strong ? 'si-shake-big' : 'si-shake'); });
  if (run.fx) { run.fx.stop(); run.fx = null; }
  requestAnimationFrame(() => {
    if (!fxCanvas.isConnected) return;
    run.fx = new Fx(fxCanvas, L);
    c.ready.forEach((f) => f(run.fx));
    c.ready = [];
  });

  if (si.phase === 'auto') autoScene(c);
  else if (si.phase.startsWith('team:')) personScene(c, 'team');
  else if (si.phase === 'coHost' || si.phase === 'host') personScene(c, si.phase);
  else allScene(c);
  return root;
}
