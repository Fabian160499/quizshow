// Show-Intro – Kern: Ton (Synthesizer + Medien), Effekt-Leinwand, Zeitsteuerung, Helfer.
// Wird von show-intro.js (Beamer/iPads) und si-scenes.js (Regie je Thema) benutzt.

import { h as hEl, mediaUrl } from './client.js';
import { pooled, playWithSound } from './media-pool.js';

export const h = hEl;

// ======================= Zeit =======================
export const run = { seq: null, timers: [], voice: null, music: null, musicKey: null, bed: null, song: null, jingle: null, fx: null };
export function clearTimers() { run.timers.forEach(clearTimeout); run.timers = []; }
export function later(sec, fn) { run.timers.push(setTimeout(fn, Math.max(0, sec * 1000))); }
// Sekunden seit Phasenstart – auch in verschachtelten Ereignissen richtig (run.t0 setzt siBeamer).
export function nowEl(el) { return run.t0 != null ? (performance.now() - run.t0) / 1000 : el; }
export function atTime(el, sec, fn) { const n = nowEl(el); if (sec <= n) fn(); else later(sec - n, fn); }

// ======================= Helfer =======================
export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const easeOutExpo = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
export const easeInOut = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
export function hexA(hex, a) {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '') || [0, 'ff', 'ff', 'ff'];
  return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${clamp(a).toFixed(3)})`;
}
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// SVG/HTML-Schnipsel als Element (Texte immer mit esc() einsetzen).
export function frag(html, cls = '') {
  const d = document.createElement('div');
  if (cls) d.className = cls;
  d.innerHTML = html;
  return d;
}
export function splitLogo(name) {
  const w = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (w.length <= 2) return [w.join(' ')];
  const mid = Math.ceil(w.length / 2);
  return [w.slice(0, mid).join(' '), w.slice(mid).join(' ')];
}
export function logoEl(name, L, cls = '') {
  return h('div', { class: `si-logo si-metal-${L.metal} ${L.font} ${cls}`.trim(), role: 'heading', 'aria-level': '1', 'aria-label': name },
    splitLogo(name).map((line, i) => h('div', { class: 'si-logo-line', style: { animationDelay: `${0.05 + i * 0.12}s` } },
      line.split(' ').map((w) => h('span', { class: /^uns$/i.test(w) ? 'hot' : '', 'data-t': w }, w)))));
}
export function initials(name) { return String(name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase(); }
export function avatarOf(t, fallbackSrc, cls = '') {
  const src = t.avatar || fallbackSrc;
  if (src) return h('img', { class: `si-avatar ${cls}`.trim(), src, alt: '' });
  return h('div', { class: `si-avatar si-initials ${cls}`.trim(), '--team': t.color }, initials(t.name));
}

// ======================= Ton: Mischpult =======================
const mixers = new WeakMap();
function mixer(a) {
  let m = mixers.get(a);
  if (m) return m;
  const comp = a.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.25;
  const master = a.createGain(); master.gain.value = 0.85;
  master.connect(comp).connect(a.destination);
  const len = Math.floor(a.sampleRate * 3);
  const ir = a.createBuffer(2, len, a.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch); let lp = 0;
    for (let i = 0; i < len; i++) { const n = Math.random() * 2 - 1; lp = lp * 0.6 + n * 0.4; d[i] = lp * Math.pow(1 - i / len, 2.6); }
  }
  const verb = a.createConvolver(); verb.buffer = ir;
  const wet = a.createGain(); wet.gain.value = 0.45;
  verb.connect(wet).connect(master);
  m = { master, verb };
  mixers.set(a, m);
  return m;
}
function out(a, send = 0.3, pan = 0) {
  const m = mixer(a);
  const g = a.createGain();
  const p = a.createStereoPanner ? a.createStereoPanner() : null;
  if (p) { p.pan.value = pan; g.connect(p).connect(m.master); } else g.connect(m.master);
  if (send) { const s = a.createGain(); s.gain.value = send; g.connect(s).connect(m.verb); }
  return g;
}
const noiseCache = new WeakMap();
function noise(a) {
  let b = noiseCache.get(a);
  if (!b) {
    b = a.createBuffer(1, a.sampleRate * 3, a.sampleRate);
    const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(a, b);
  }
  const s = a.createBufferSource(); s.buffer = b; s.loop = true; return s;
}
function env(g, t, peak, att, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + att + dec); }
function tone(a, t, type, f, f2, dur, vol, send = 0.3, pan = 0) {
  const o = a.createOscillator(); const g = a.createGain(); o.type = type;
  o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  env(g, t, vol, 0.004, dur); o.connect(g).connect(out(a, send, pan)); o.start(t); o.stop(t + dur + 0.05);
}
function burst(a, t, kind, f, q, dur, vol, send = 0.3, pan = 0, att = 0.002) {
  const n = noise(a); const fl = a.createBiquadFilter(); fl.type = kind; fl.frequency.value = f; fl.Q.value = q;
  const g = a.createGain(); env(g, t, vol, att, dur); n.connect(fl).connect(g).connect(out(a, send, pan)); n.start(t, Math.random() * 2); n.stop(t + att + dur + 0.05);
}

// Klänge: große Effekte (hit, braam, …) und kleine Details (Ticks, Funk-Pieps, Tasten …).
export const SYNTH = {
  sub(a, t, vol = 1) { tone(a, t, 'sine', 62, 30, 2.4, 0.8 * vol, 0.25); },
  hit(a, t, vol = 1) { SYNTH.sub(a, t, vol); tone(a, t, 'triangle', 140, 45, 0.9, 0.7 * vol, 0.6); burst(a, t, 'lowpass', 2500, 0.7, 1.1, 0.6 * vol, 0.8); burst(a, t, 'bandpass', 4200, 6, 2.2, 0.2 * vol, 1); },
  braam(a, t, dur = 3, root = 55, vol = 1) {
    const g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.45 * vol, t + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 3; lp.frequency.setValueAtTime(180, t); lp.frequency.exponentialRampToValueAtTime(2200, t + 0.25); lp.frequency.exponentialRampToValueAtTime(450, t + dur);
    lp.connect(g).connect(out(a, 0.5));
    for (const mult of [1, 1.5, 2, 3]) for (const det of [-9, 9]) { const o = a.createOscillator(); o.type = 'sawtooth'; o.frequency.value = root * mult; o.detune.value = det; const og = a.createGain(); og.gain.value = 0.2 / mult; o.connect(og).connect(lp); o.start(t); o.stop(t + dur + 0.1); }
  },
  riser(a, t, dur = 4, vol = 1) {
    const n = noise(a); const f = a.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(8000, t + dur);
    const g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35 * vol, t + dur * 0.97); g.gain.linearRampToValueAtTime(0, t + dur);
    n.connect(f).connect(g).connect(out(a, 0.5)); n.start(t); n.stop(t + dur);
  },
  roll(a, t, dur = 1.6) { for (let i = 0; i < dur / 0.05; i++) tone(a, t + i * 0.05, 'sine', 92, 70, 0.18, 0.06 + 0.4 * (i * 0.05 / dur) ** 2, 0.5); SYNTH.riser(a, t, dur, 0.5); },
  stab(a, t) { for (const f of [246.9, 311.1, 370, 493.9]) tone(a, t, 'sawtooth', f, 0, 1.4, 0.06, 0.6); },
  fanfare(a, t) { [[392, 0], [523.3, 0.16], [659.3, 0.32], [784, 0.48]].forEach(([f, d]) => tone(a, t + d, 'sawtooth', f, 0, 0.5, 0.08, 0.6)); },
  boom(a, t) { SYNTH.sub(a, t, 1); },
  // ---- Details ----
  whoosh(a, t, dur = 0.6, vol = 1) {
    const n = noise(a); const f = a.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.3;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(2600, t + dur * 0.5); f.frequency.exponentialRampToValueAtTime(400, t + dur);
    const g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4 * vol, t + dur * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = a.createStereoPanner ? a.createStereoPanner() : null; const o = out(a, 0.3);
    if (p) { p.pan.setValueAtTime(-0.9, t); p.pan.linearRampToValueAtTime(0.9, t + dur); n.connect(f).connect(g).connect(p).connect(o); } else n.connect(f).connect(g).connect(o);
    n.start(t); n.stop(t + dur + 0.05);
  },
  tick(a, t, i = 0) { tone(a, t, 'sine', 95 + i * 6, 48, 0.4, 0.55, 0.4); tone(a, t, 'square', 1900 + i * 80, 0, 0.04, 0.05, 0.6); },
  quindar(a, t, high = true) { const o = a.createOscillator(); const g = a.createGain(); o.frequency.value = high ? 2525 : 2475; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.09, t + 0.005); g.gain.setValueAtTime(0.09, t + 0.245); g.gain.linearRampToValueAtTime(0, t + 0.25); o.connect(g).connect(out(a, 0.05)); o.start(t); o.stop(t + 0.26); },
  static(a, t, dur = 0.5) { burst(a, t, 'bandpass', 2200, 0.8, dur, 0.12, 0.05, 0, 0.01); },
  beep(a, t, f = 1200) { tone(a, t, 'sine', f, 0, 0.09, 0.08, 0.1); },
  type(a, t) { burst(a, t, 'bandpass', 2400 + Math.random() * 1200, 3, 0.03, 0.12, 0.05, (Math.random() - 0.5) * 0.4); tone(a, t, 'square', 140, 60, 0.02, 0.03, 0.05); },
  shutter(a, t) { burst(a, t, 'highpass', 3000, 0.7, 0.03, 0.2, 0.1); burst(a, t + 0.07, 'highpass', 2500, 0.7, 0.04, 0.15, 0.1); },
  flip(a, t) { burst(a, t, 'bandpass', 1800, 1.2, 0.06, 0.25, 0.15, (Math.random() - 0.5) * 0.6); },
  coin(a, t) { for (let k = 0; k < 3; k++) tone(a, t + k * 0.04, 'sine', 3000 + Math.random() * 2500, 0, 0.18, 0.04, 0.4, (Math.random() - 0.5)); },
  ball(a, t) { tone(a, t, 'triangle', 1800 + Math.random() * 600, 0, 0.03, 0.08, 0.2, (Math.random() - 0.5) * 0.8); },
  clunk(a, t) { tone(a, t, 'sine', 70, 40, 0.3, 0.5, 0.6); burst(a, t, 'lowpass', 600, 0.8, 0.12, 0.4, 0.6); },
  heart(a, t, vol = 1) { tone(a, t, 'sine', 55, 38, 0.12, 0.6 * vol, 0.15); tone(a, t + 0.22, 'sine', 50, 36, 0.14, 0.45 * vol, 0.15); },
  strike(a, t) { burst(a, t, 'highpass', 2500, 0.7, 0.25, 0.3, 0.2, 0, 0.01); burst(a, t + 0.1, 'lowpass', 900, 0.7, 0.8, 0.25, 0.3, 0, 0.05); },
  wing(a, t) { burst(a, t, 'bandpass', 700, 1.2, 0.35, 0.18, 0.2, 0.5, 0.06); },
  pop(a, t) { tone(a, t, 'sine', 600, 140, 0.08, 0.15, 0.3); burst(a, t, 'highpass', 3000, 0.7, 0.03, 0.1, 0.3); },
};
// Große Klänge spielen nur als KI-Effekt (oder ohne Musik) – sonst trägt die Musik den Einschlag.
const BIG = new Set(['boom', 'hit', 'braam', 'riser', 'roll', 'stab', 'fanfare']);

export function makeSound(env, si, fresh, bigSynth) {
  const files = (si && si.sfx) || {};
  return (key, atEl, el, ...args) => {
    if (!env.sound || !fresh) return;
    const dt = atEl - nowEl(el);
    if (dt < -0.2) return;
    const file = files[key];
    if (file) { later(Math.max(0, dt), () => playOneShot(file, env, key)); return; }
    if (BIG.has(key) && !bigSynth) return;
    later(Math.max(0, dt - 0.03), () => {
      const a = env.ctx();
      if (!a) return;
      if (a.state === 'suspended') a.resume();
      const fn = SYNTH[key];
      if (fn) fn(a, a.currentTime + 0.03, ...args);
    });
  };
}
const oneShots = {};
function playOneShot(m, env, key) {
  const el = (oneShots[key] ||= Object.assign(document.createElement('audio'), { className: 'si-media', preload: 'auto' }));
  if (!el.isConnected) document.body.append(el);
  playMedia(el, m, 0, env, 1);
}

// ======================= Medien =======================
// Standard-Musik je Thema: assets/music/<name>.mp3 (in Einzeldatei-Builds eingebettet).
export function musicUrl(name) {
  const find = (w) => { try { return w && w.__SI_MUSIC && w.__SI_MUSIC[name]; } catch { return null; } };
  return find(window) || find(window.parent) || find(window.top) || `assets/music/${name}.mp3`;
}
export async function playMedia(el, m, offset, env, vol = 1, loop = false) {
  const url = typeof m === 'string' ? m : await mediaUrl(m.id);
  if (!url) return;
  if (el.getAttribute('src') !== url) el.src = url;
  el.loop = loop;
  const go = () => { try { el.currentTime = Math.max(0, offset); } catch { /* noch nicht bereit */ } clearInterval(el.__fade); el.volume = vol; el.muted = !env.audible(); const p = playWithSound(el); if (p && p.catch) p.catch(() => {}); };
  if (el.readyState >= 1) go(); else el.addEventListener('loadedmetadata', go, { once: true });
}
export function audioEl(key, env) {
  if (env && env.audioEl) return env.audioEl(key);
  const el = pooled(key); el.className = 'si-media'; if (!el.isConnected) document.body.append(el); return el;
}
export function fadeOut(el, ms = 1100) {
  if (!el || el.paused) return;
  const start = el.volume; let k = 0; const steps = 14;
  clearInterval(el.__fade);
  el.__fade = setInterval(() => { k += 1; el.volume = Math.max(0, start * (1 - k / steps)); if (k >= steps) { clearInterval(el.__fade); el.pause(); } }, ms / steps);
}
export function setVol(el, v, ms = 400) {
  if (!el) return;
  clearInterval(el.__fade);
  const start = el.volume; let k = 0; const steps = 8;
  el.__fade = setInterval(() => { k += 1; el.volume = clamp(start + (v - start) * (k / steps)); if (k >= steps) clearInterval(el.__fade); }, ms / steps);
}

// ======================= Effekt-Leinwand =======================
// Eine Leinwand für Partikel, Lichtkegel, Funkenfontänen, Feuer, Raketenstrahl, Lens-Flare.
export class Fx {
  constructor(canvas, L) {
    this.c = canvas; this.g = canvas.getContext('2d'); this.L = L;
    this.p = []; this.beams = 0; this.beamColor = L.b; this.beamFrom = 'top'; this.beamN = 4; this.flares = []; this.logoPts = null; this.ambient = null; this.t0 = performance.now();
    this.emitters = []; this.fire = 0; this.warp = 0;
    this.resize(); this.loop = this.loop.bind(this); this.raf = requestAnimationFrame(this.loop);
  }
  resize() { const r = this.c.getBoundingClientRect(); const d = Math.min(2, devicePixelRatio || 1); this.c.width = Math.max(1, r.width * d); this.c.height = Math.max(1, r.height * d); this.g.setTransform(d, 0, 0, d, 0, 0); this.w = r.width; this.h = r.height; }
  stop() { cancelAnimationFrame(this.raf); this.stopped = true; }
  color(i) { return [this.L.a, this.L.b, this.L.c][i % 3]; }
  burst(n, kind = 'spark', x = this.w / 2, y = this.h / 2, power = 1, cols = null) {
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2; const sp = (2 + Math.random() * 14) * power;
      this.p.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp * 0.75 - 2, life: 1, decay: 0.006 + Math.random() * 0.012, size: 1 + Math.random() * 2.5, kind, col: cols ? cols[i % cols.length] : this.color(i), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, grav: 0.08, drag: 0.985 });
    }
  }
  cannon(side, n = 80, kind = 'confetti', cols = null) {
    const x = side < 0 ? 0 : this.w; const y = this.h;
    for (let i = 0; i < n; i++) {
      const ang = (side < 0 ? -Math.PI / 3 : -Math.PI * 2 / 3) + (Math.random() - 0.5) * 0.5; const sp = 14 + Math.random() * 14;
      this.p.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 1, decay: 0.003 + Math.random() * 0.003, size: 6 + Math.random() * 8, kind, col: cols ? cols[i % cols.length] : this.color(i), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.5, grav: 0.22, drag: 0.985, glyph: kind === 'card' ? ['♠', '♥', '♦', '♣'][i % 4] : null });
    }
  }
  rain(n, kind = 'coin', cols = null) {
    for (let i = 0; i < n; i++) this.p.push({ x: Math.random() * this.w, y: -20 - Math.random() * this.h * 0.6, vx: (Math.random() - 0.5) * 2, vy: 3 + Math.random() * 5, life: 1, decay: 0.0025, size: 8 + Math.random() * 8, kind, col: cols ? cols[i % cols.length] : this.color(i), rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, grav: 0.15, drag: 0.99 });
  }
  // Funkenfontäne (Bühnen-Pyro) an x, für sec Sekunden
  fountain(x, sec = 3, col = '#ffd27a', power = 1) { this.emitters.push({ kind: 'fountain', x, until: performance.now() + sec * 1000, col, power }); }
  plume(getXY, sec = 6) { this.emitters.push({ kind: 'plume', getXY, until: performance.now() + sec * 1000 }); }
  flare(x, y) { this.flares.push({ x, y, t: performance.now() }); }
  assemble(text, font, box) {
    const off = document.createElement('canvas'); const W = Math.max(10, Math.round(box.width)); const H = Math.max(10, Math.round(box.height));
    off.width = W; off.height = H; const og = off.getContext('2d');
    const lines = splitLogo(text); let size = H / (lines.length * 1.05);
    og.fillStyle = '#fff'; og.textAlign = 'center'; og.textBaseline = 'middle';
    const setF = (sz) => { og.font = font.replace(/\d+px/, `${Math.round(sz)}px`); };
    setF(size); while (lines.some((l) => og.measureText(l.toUpperCase()).width > W * 0.98) && size > 10) { size *= 0.94; setF(size); }
    lines.forEach((l, i) => og.fillText(l.toUpperCase(), W / 2, H / 2 + (i - (lines.length - 1) / 2) * size * 1.02));
    const d = og.getImageData(0, 0, W, H).data; const step = Math.max(3, Math.round(Math.sqrt((W * H) / 5200)));
    const pts = [];
    for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) if (d[(y * W + x) * 4 + 3] > 140) pts.push([box.left + x, box.top + y]);
    this.logoPts = { pts: pts.map(([tx, ty], i) => ({ tx, ty, x: this.w / 2 + (Math.random() - 0.5) * 60, y: this.h / 2 + (Math.random() - 0.5) * 60, d: Math.random() * 0.35, col: this.color(i) })), t: performance.now(), step };
  }
  loop(now) {
    if (this.stopped) return;
    const g = this.g; const { w, h: H } = this;
    g.clearRect(0, 0, w, H);
    g.globalCompositeOperation = 'lighter';
    const t = (now - this.t0) / 1000;
    if (this.beams > 0.01) {
      const n = this.beamN;
      for (let i = 0; i < n; i++) {
        const fromBottom = this.beamFrom === 'bottom' || (this.beamFrom === 'both' && i % 2);
        const x = w * (0.1 + (i + 0.5) * (0.8 / n)); const ang = Math.sin(t * (0.5 + i * 0.07) + i * 1.7) * 0.42;
        const len = H * 1.3; const spread = 0.11; const col = i % 2 ? this.L.a : this.beamColor;
        const y0 = fromBottom ? H + 20 : -20; const dir = fromBottom ? -1 : 1;
        const ex = x + Math.sin(ang) * len; const ey = y0 + dir * Math.cos(ang) * len;
        const gr = g.createLinearGradient(x, y0, ex, ey);
        gr.addColorStop(0, hexA(col, 0.45 * this.beams)); gr.addColorStop(1, hexA(col, 0));
        g.fillStyle = gr; g.beginPath(); g.moveTo(x - 5, y0); g.lineTo(x + 5, y0);
        g.lineTo(x + Math.sin(ang + spread) * len, y0 + dir * Math.cos(ang + spread) * len); g.lineTo(x + Math.sin(ang - spread) * len, y0 + dir * Math.cos(ang - spread) * len); g.closePath(); g.fill();
        const hg = g.createRadialGradient(x, y0, 0, x, y0, 40); hg.addColorStop(0, hexA('#ffffff', 0.7 * this.beams)); hg.addColorStop(1, hexA(col, 0)); g.fillStyle = hg; g.fillRect(x - 40, y0 - 40, 80, 80);
      }
    }
    // Emitter
    this.emitters = this.emitters.filter((e) => now < e.until);
    for (const e of this.emitters) {
      if (e.kind === 'fountain') {
        for (let k = 0; k < 6; k++) this.p.push({ x: e.x + (Math.random() - 0.5) * 6, y: H, vx: (Math.random() - 0.5) * 3, vy: -(10 + Math.random() * 9) * e.power, life: 1, decay: 0.012 + Math.random() * 0.01, size: 0.8 + Math.random() * 1.4, kind: 'spark', col: k % 3 ? e.col : '#ffffff', grav: 0.2, drag: 0.99 });
      } else if (e.kind === 'plume') {
        const [px, py] = e.getXY();
        for (let k = 0; k < 10; k++) this.p.push({ x: px + (Math.random() - 0.5) * 18, y: py, vx: (Math.random() - 0.5) * 5, vy: 4 + Math.random() * 7, life: 1, decay: 0.01 + Math.random() * 0.01, size: 3 + Math.random() * 6, kind: k % 4 ? 'flame' : 'smoke', col: k % 2 ? '#ffb347' : '#fff3c4', grav: 0.04, drag: 0.97 });
      }
    }
    if (this.fire > 0.01) {
      for (let k = 0; k < 8 * this.fire; k++) this.p.push({ x: w * (0.15 + Math.random() * 0.7), y: H + 10, vx: (Math.random() - 0.5) * 1.5, vy: -(3 + Math.random() * 5) * this.fire, life: 1, decay: 0.014 + Math.random() * 0.012, size: 6 + Math.random() * 12, kind: 'flame', col: Math.random() < 0.3 ? '#ffd27a' : '#ff6a1a', grav: -0.02, drag: 0.985 });
    }
    if (this.warp > 0.01) {
      for (let k = 0; k < 4 * this.warp; k++) { const a = Math.random() * Math.PI * 2; this.p.push({ x: w / 2 + Math.cos(a) * 10, y: H / 2 + Math.sin(a) * 10, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2, life: 1, decay: 0.006, size: 1, kind: 'streak', col: '#ffffff', drag: 1.07 }); }
    }
    if (this.ambient && Math.random() < this.ambient.rate) this.spawnAmbient();
    for (const q of this.p) {
      q.vy += q.grav || 0; if (q.drag) { q.vx *= q.drag; q.vy *= q.drag; }
      q.x += q.vx; q.y += q.vy; q.rot = (q.rot || 0) + (q.vr || 0); q.life -= q.decay;
      const k = q.kind;
      if (k === 'confetti' || k === 'card' || k === 'note' || k === 'coin' || k === 'chip') {
        g.save(); g.globalCompositeOperation = 'source-over'; g.globalAlpha = clamp(q.life * 1.5); g.translate(q.x, q.y); g.rotate(q.rot);
        if (k === 'note') { g.fillStyle = q.col; g.font = `${q.size * 3}px serif`; g.fillText(q.glyph || '♪', 0, 0); }
        else if (k === 'card') { g.fillStyle = '#f7f3ea'; g.fillRect(-q.size, -q.size * 1.4, q.size * 2, q.size * 2.8); g.fillStyle = /[♥♦]/.test(q.glyph) ? '#c8102e' : '#111'; g.font = `${q.size * 1.6}px serif`; g.textAlign = 'center'; g.fillText(q.glyph || '♠', 0, q.size * 0.5); }
        else if (k === 'coin') { const sx = Math.abs(Math.cos(q.rot * 1.5)) + 0.1; g.scale(sx, 1); const gr = g.createRadialGradient(-q.size * 0.3, -q.size * 0.3, 1, 0, 0, q.size); gr.addColorStop(0, '#fff6c8'); gr.addColorStop(0.5, '#f2c14e'); gr.addColorStop(1, '#8a5a0a'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, q.size, 0, 7); g.fill(); g.strokeStyle = 'rgba(120,70,0,.6)'; g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, q.size * 0.72, 0, 7); g.stroke(); }
        else if (k === 'chip') { g.scale(1, Math.abs(Math.cos(q.rot)) * 0.8 + 0.2); g.fillStyle = q.col; g.beginPath(); g.arc(0, 0, q.size, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.setLineDash([q.size * 0.5, q.size * 0.5]); g.lineWidth = q.size * 0.25; g.beginPath(); g.arc(0, 0, q.size * 0.82, 0, 7); g.stroke(); g.setLineDash([]); }
        else { g.fillStyle = q.col; g.scale(1, Math.abs(Math.cos(q.rot * 2)) + 0.15); g.fillRect(-q.size / 2, -q.size / 4, q.size, q.size / 2); }
        g.restore();
      } else if (k === 'flame' || k === 'smoke') {
        const r = q.size * (k === 'smoke' ? 2.5 + (1 - q.life) * 4 : 1 + (1 - q.life) * 1.5);
        const gr = g.createRadialGradient(q.x, q.y, 0, q.x, q.y, r);
        if (k === 'smoke') { g.globalCompositeOperation = 'source-over'; gr.addColorStop(0, `rgba(170,170,180,${(q.life * 0.18).toFixed(3)})`); gr.addColorStop(1, 'rgba(120,120,130,0)'); }
        else { gr.addColorStop(0, hexA('#fff6d0', q.life * 0.9)); gr.addColorStop(0.35, hexA(q.col, q.life * 0.6)); gr.addColorStop(1, hexA('#ff2a00', 0)); }
        g.fillStyle = gr; g.fillRect(q.x - r, q.y - r, r * 2, r * 2);
        g.globalCompositeOperation = 'lighter';
      } else if (k === 'streak') {
        g.strokeStyle = hexA(q.col, clamp(q.life)); g.lineWidth = 1.2; g.beginPath(); g.moveTo(q.x, q.y); g.lineTo(q.x - q.vx * 3, q.y - q.vy * 3); g.stroke();
      } else {
        const r = q.size * (k === 'star' ? 1 : 2.4);
        const gr = g.createRadialGradient(q.x, q.y, 0, q.x, q.y, r * 3);
        gr.addColorStop(0, hexA('#ffffff', q.life)); gr.addColorStop(0.25, hexA(q.col, q.life * 0.8)); gr.addColorStop(1, hexA(q.col, 0));
        g.fillStyle = gr; g.fillRect(q.x - r * 3, q.y - r * 3, r * 6, r * 6);
      }
    }
    this.p = this.p.filter((q) => q.life > 0 && q.y < H + 120 && q.y > -H && q.x > -150 && q.x < w + 150);
    if (this.p.length > 2200) this.p.splice(0, this.p.length - 2200);
    if (this.logoPts) {
      const k = (now - this.logoPts.t) / 1000;
      const fade = k < 1.6 ? 1 : Math.max(0, 1 - (k - 1.6) / 0.7);
      if (fade <= 0) this.logoPts = null;
      else for (const q of this.logoPts.pts) {
        const e = easeOutExpo(clamp((k - q.d) / 1.1));
        const x = q.x + (q.tx - q.x) * e + (1 - e) * Math.sin(q.ty) * 140; const y = q.y + (q.ty - q.y) * e + (1 - e) * Math.cos(q.tx) * 90;
        g.fillStyle = hexA(e > 0.97 ? '#ffffff' : q.col, fade * (0.5 + 0.5 * e)); const sz = this.logoPts.step * (0.5 + 0.6 * (1 - e));
        g.fillRect(x - sz / 2, y - sz / 2, sz, sz);
      }
    }
    this.flares = this.flares.filter((f) => now - f.t < 1600);
    for (const f of this.flares) {
      const k = (now - f.t) / 1600; const a = (1 - k) ** 2;
      const gr = g.createRadialGradient(f.x, f.y, 0, f.x, f.y, w * 0.35);
      gr.addColorStop(0, hexA('#ffffff', a)); gr.addColorStop(0.1, hexA(this.L.b, a * 0.5)); gr.addColorStop(1, hexA(this.L.a, 0));
      g.fillStyle = gr; g.fillRect(0, 0, w, H);
      const sg = g.createLinearGradient(0, 0, w, 0); sg.addColorStop(0, hexA(this.L.b, 0)); sg.addColorStop(0.5, hexA('#ffffff', a * 0.8)); sg.addColorStop(1, hexA(this.L.b, 0));
      g.fillStyle = sg; g.fillRect(0, f.y - 2, w, 4);
      for (const [m, rr, c] of [[0.6, 40, this.L.b], [1.3, 70, this.L.a], [1.8, 24, '#ffffff']]) {
        const x = f.x + (w / 2 - f.x) * m * 2; const y = f.y + (H / 2 - f.y) * m * 2;
        const gg = g.createRadialGradient(x, y, 0, x, y, rr); gg.addColorStop(0, hexA(c, a * 0.35)); gg.addColorStop(1, hexA(c, 0)); g.fillStyle = gg; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
      }
    }
    g.globalCompositeOperation = 'source-over';
    this.raf = requestAnimationFrame(this.loop);
  }
  spawnAmbient() {
    const k = this.L.parts; const i = (Math.random() * 3) | 0;
    if (k === 'embers') this.p.push({ x: Math.random() * this.w, y: this.h + 10, vx: (Math.random() - 0.5) * 0.8, vy: -1.5 - Math.random() * 2.5, life: 1, decay: 0.004 + Math.random() * 0.004, size: 0.8 + Math.random() * 1.8, kind: 'spark', col: i ? this.L.a : this.L.b, grav: -0.01 });
    else if (k === 'stars') this.p.push({ x: this.w / 2, y: this.h / 2, vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 6, life: 1, decay: 0.008, size: 0.6 + Math.random(), kind: 'star', col: '#ffffff', drag: 1.03 });
    else if (k === 'notes') this.p.push({ x: Math.random() * this.w, y: this.h + 20, vx: (Math.random() - 0.5) * 0.6, vy: -1 - Math.random() * 1.5, life: 1, decay: 0.003, size: 6 + Math.random() * 6, kind: 'note', glyph: ['♪', '♫', '♬'][i], col: this.L.b, rot: (Math.random() - 0.5) * 0.4, vr: 0.004, grav: 0 });
    else if (k === 'cards') this.p.push({ x: Math.random() * this.w, y: -30, vx: (Math.random() - 0.5) * 1.2, vy: 1 + Math.random() * 1.5, life: 1, decay: 0.002, size: 6 + Math.random() * 6, kind: 'card', glyph: ['♠', '♥', '♦', '♣'][(Math.random() * 4) | 0], col: '#111', rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.06, grav: 0.01 });
    else if (k === 'bubbles') this.p.push({ x: Math.random() * this.w, y: this.h + 10, vx: (Math.random() - 0.5) * 0.4, vy: -0.8 - Math.random() * 1.2, life: 1, decay: 0.003, size: 0.8 + Math.random() * 1.6, kind: 'spark', col: ['#ffb3c7', '#8fb3ff', '#ffffff'][i], grav: 0 });
    else this.p.push({ x: Math.random() * this.w, y: this.h + 10, vx: (Math.random() - 0.5) * 0.5, vy: -0.6 - Math.random(), life: 1, decay: 0.003, size: 0.8 + Math.random() * 1.6, kind: 'spark', col: this.color(i), grav: 0 });
  }
}
