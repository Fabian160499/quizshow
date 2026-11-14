// Show-Intro – die 6 Team-iPads als gemeinsame Lichtanlage im Raum.
// Jedes iPad kennt seine Position im Raum (idx von n) und die Serverzeit; daraus
// entstehen synchrone Lauflichter, Wellen, Stroboskop, Glühbirnen-Ketten usw.

import { h, clamp } from './si-core.js';

const PAL = {
  voice: ['#ff1f6b', '#ff2d55', '#ffffff', '#3a0012'],
  bielefeld: ['#1565c0', '#ffffff', '#0a0a0a', '#f5c400'],
  studio: ['#d9433f', '#f6a9bb', '#3a5fd9', '#6b4bb8'],
  buehne: ['#ff2d8a', '#1fd6f2', '#ffd23d', '#7c5cff'],
  musical: ['#e0193a', '#f5c542', '#fff1c9', '#7a0b18'],
  casino: ['#e8c35a', '#1f9d5b', '#d6243a', '#f7f3ea'],
  wildnis: ['#ff7a1a', '#ffcc66', '#a8d08d', '#3a2a18'],
  weltraum: ['#ff9f1c', '#4cc9ff', '#ffffff', '#1b2a6b'],
};
const HIT = 1.7;
const rgb = (hex) => { const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '') || [0, 'ff', 'ff', 'ff']; return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]; };
const rgba = (hex, a) => { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${clamp(a).toFixed(3)})`; };
const hsl = (hue, a = 1, l = 55) => `hsla(${((hue % 360) + 360) % 360},95%,${l}%,${clamp(a)})`;

const ipad = { iv: 0, key: null, root: null };
export function siTeamStop() { clearInterval(ipad.iv); ipad.key = null; ipad.root = null; document.body.classList.remove('si-ipad-on'); }

// v: { phase, at, theme, tl, idx, n, tx }, me: { name, color, avatar? }, teams: [{ name, color }], now(): Serverzeit
export function siTeam(v, me, teams, now, opts = {}) {
  const st = opts.instance || ipad;
  const key = JSON.stringify([v, me.color, me.name]);
  if (st.key === key && st.root) return st.root;
  st.key = key;
  clearInterval(st.iv);
  if (!opts.instance) document.body.classList.add('si-ipad-on');
  const theme = PAL[v.theme] ? v.theme : 'studio';
  const P = PAL[theme];
  const tl = v.tl || { teaser: 3, boom: 15, lines: 21, line: 2.7 };
  const tx = v.tx || {};
  const cv = h('canvas', { class: 'si-ipad-cv' });
  const big = h('div', { class: `si-ipad-big ip-${theme}` });
  const small = h('div', { class: 'si-ipad-small' });
  const root = h('div', { class: `si-ipad si-${theme}${opts.instance ? ' inline' : ''}`, '--me': me.color }, cv, h('div', { class: 'si-ipad-text' }, big, small));
  let lastTxt = '';
  const say = (b, sm = '', cls = '') => { const k = `${b}|${sm}|${cls}`; if (k === lastTxt) return; lastTxt = k; big.textContent = b; small.textContent = sm; big.dataset.fx = cls; };
  const pos = v.n > 1 ? v.idx / (v.n - 1) : 0.5;
  const N = Math.max(1, v.n);
  let g = null; let W = 0; let H = 0;
  const fit = () => { const r = cv.getBoundingClientRect(); const w = Math.max(2, Math.round(r.width / 2)); const hh = Math.max(2, Math.round(r.height / 2)); if (w !== W || hh !== H) { W = w; H = hh; cv.width = W; cv.height = H; } g = cv.getContext('2d'); };
  // ---- Zeichen-Bausteine ----
  const fill = (col, a = 1) => { g.fillStyle = rgba(col, a); g.fillRect(0, 0, W, H); };
  const black = () => { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); };
  const radial = (col, a, cx = 0.5, cy = 0.5, r = 0.8) => { const gr = g.createRadialGradient(W * cx, H * cy, 0, W * cx, H * cy, Math.max(W, H) * r); gr.addColorStop(0, rgba(col, a)); gr.addColorStop(1, rgba(col, 0)); g.fillStyle = gr; g.fillRect(0, 0, W, H); };
  const vgrad = (c1, c2, a = 1) => { const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, rgba(c1, a)); gr.addColorStop(1, rgba(c2, a)); g.fillStyle = gr; g.fillRect(0, 0, W, H); };
  const stripes = (col, a, off, ang = -0.6, gap = 0.18) => { g.save(); g.translate(W / 2, H / 2); g.rotate(ang); g.fillStyle = rgba(col, a); const s = Math.max(W, H) * gap; const L = Math.max(W, H) * 1.6; for (let x = -L + ((off * s * 2) % (s * 2)); x < L; x += s * 2) g.fillRect(x, -L, s, L * 2); g.restore(); };
  const bulbs = (col, t, speed = 8, a = 1) => {
    const n = 26; const per = [];
    for (let i = 0; i < n; i++) { const u = i / n; let x; let y; if (u < 0.25) { x = u * 4; y = 0; } else if (u < 0.5) { x = 1; y = (u - 0.25) * 4; } else if (u < 0.75) { x = 1 - (u - 0.5) * 4; y = 1; } else { x = 0; y = 1 - (u - 0.75) * 4; } per.push([x, y]); }
    const r = Math.min(W, H) * 0.035;
    per.forEach(([x, y], i) => { const on = ((i + Math.floor(t * speed)) % 3) === 0; const cx = r * 1.6 + x * (W - r * 3.2); const cy = r * 1.6 + y * (H - r * 3.2); const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r * (on ? 3 : 1.4)); gr.addColorStop(0, on ? `rgba(255,250,230,${a})` : rgba(col, 0.35 * a)); gr.addColorStop(0.35, rgba(col, (on ? 0.9 : 0.3) * a)); gr.addColorStop(1, rgba(col, 0)); g.fillStyle = gr; g.fillRect(cx - r * 3, cy - r * 3, r * 6, r * 6); });
  };
  const flicker = (base, a, t) => { const f = 0.6 + 0.25 * Math.sin(t * 23 + pos * 9) + 0.15 * Math.sin(t * 41 + pos * 3) * Math.random(); const gr = g.createLinearGradient(0, H, 0, 0); gr.addColorStop(0, rgba('#fff3c4', a * f)); gr.addColorStop(0.25, rgba(base, a * f)); gr.addColorStop(0.8, rgba('#ff2a00', a * 0.25 * f)); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); };
  const rings = (col, t, a = 1) => { for (let k = 0; k < 4; k++) { const r = ((t * 0.8 + k * 0.25) % 1) * Math.max(W, H) * 0.8; g.strokeStyle = rgba(col, a * (1 - r / (Math.max(W, H) * 0.8))); g.lineWidth = Math.max(2, W * 0.02); g.beginPath(); g.arc(W / 2, H / 2, r, 0, 7); g.stroke(); } };
  const dots = (col, t, n = 30, a = 1) => { for (let i = 0; i < n; i++) { const s = (i * 97.13) % 1; const x = ((i * 0.6180339) % 1) * W; const y = H - (((t * (0.08 + s * 0.15)) + s) % 1) * H; g.fillStyle = rgba(col, a * (0.4 + 0.6 * s)); g.beginPath(); g.arc(x, y, 1 + s * 2.5, 0, 7); g.fill(); } };
  const chase = (x, width = 0.12) => Math.exp(-((pos - x) ** 2) / (2 * width * width)); // Helligkeit eines Lauflichts an Position x
  const strobe = (t, hz) => ((t * hz) % 1) < 0.35;

  // ---- Programme ----
  const autoProgram = (t) => {
    const boom = tl.boom;
    if (t >= boom && t < boom + 0.35) { fill('#ffffff'); say(''); return; }
    if (theme === 'studio') {
      const shotLen = (boom - tl.teaser) / 4;
      if (t < tl.teaser) { black(); radial('#ff2a2a', 0.18 + 0.12 * Math.sin(t * 4), 0.5, 0.5, 0.45); say(''); return; }
      if (t < boom - 1.15) {
        const k = Math.floor((t - tl.teaser) / shotLen);
        const col = P[(v.idx + k) % 4]; fill(col, 1); stripes('#000000', 0.12, t * 0.6, -0.55, 0.12);
        const gStep = (boom - 1.4 - (tl.teaser + 1.3)) / 8; const gi = Math.floor((t - tl.teaser - 1.3) / gStep);
        if (t > tl.teaser + 1.3 && gi % N === v.idx && ((t - tl.teaser - 1.3) % gStep) < 0.25) fill('#ffffff', 0.85);
        say(''); return;
      }
      if (t < boom) { const u = (t - (boom - 1.15)) / 1.15; vgrad('#8fc3ff', '#1679b8'); g.fillStyle = 'rgba(255,255,255,.8)'; g.fillRect(0, 0, W, H * (1 - u)); say(''); return; }
      if (t < boom + 2) { fill('#1679b8'); rings('#ffffff', t, 0.8); say('', tx.start); return; }
      fill(P[(v.idx + Math.floor(t / 2)) % 4], 0.25); bulbs('#ffd166', t, 6, 0.9); say('', t < tl.lines + 2 ? tx.start : tx.wait); return;
    }
    if (theme === 'voice') {
      const neon = (a) => { for (let k = 0; k < 6; k++) { const y = ((k / 6 + t * 0.05 + pos * 0.1) % 1) * H; g.fillStyle = rgba('#ff1f6b', a); g.fillRect(0, y, W, Math.max(2, H * 0.012)); } };
      if (t < tl.teaser) { black(); radial('#ff1f6b', 0.12 + 0.06 * Math.sin(t * 2), 0.5, 0.2, 0.6); say(''); return; }
      if (t < tl.count) { black(); neon(0.85); say(''); return; }
      if (t < boom) { const step = (boom - tl.count) / 5; const k = Math.floor((t - tl.count) / step); const f = ((t - tl.count) % step) / step; black(); radial('#e3122b', Math.max(0, 1 - f * 3) * (0.4 + k * 0.15), 0.5, 0.5, 0.9); say(`${5 - k}`, '', 'count'); return; }
      if (t < boom + 2.5) { fill(strobe(t, 9) ? '#ffffff' : '#ff1f6b'); say(tx.start, ''); return; }
      fill('#1a0010'); neon(0.7); radial('#ff2d55', 0.35 + 0.15 * Math.sin(t * 2 + pos * 4), 0.5, 1, 0.8); say(t < tl.lines ? tx.start : '', t >= tl.lines ? tx.wait : ''); return;
    }
    if (theme === 'bielefeld') {
      if (t < tl.teaser) { black(); if (t > 1.8 && t < 2.7 && Math.random() < 0.5) fill('#9aa0a6', 0.6); else radial('#f5c400', 0.25 + 0.1 * Math.sin(t * 3), 0.5, 0.5, 0.6); say(''); return; }
      if (t < tl.count) { vgrad('#7fb0de', '#f4dfc0'); const x = ((t - tl.teaser) / (tl.count - tl.teaser)); fill('#ffffff', chase(x, 0.15) * 0.6); say(''); return; }
      if (t < boom) { const step = (boom - tl.count) / 5; const k = Math.floor((t - tl.count) / step); black(); fill('#ffffff', strobe(t, 2 + k) ? 0.15 + k * 0.12 : 0.03); say(`${5 - k}`, '', 'count'); return; }
      const off = t * 0.8 + pos; const band = Math.floor(off * 3) % 3; fill(['#0a0a0a', '#ffffff', '#1565c0'][band]); if (t < boom + 2.5 && strobe(t, 8)) fill('#ffffff', 0.5); say(t < tl.lines ? tx.start : '', t >= tl.lines ? tx.wait : '', band === 1 ? 'dark' : ''); return;
    }
    if (theme === 'buehne') {
      if (t < tl.teaser) { black(); radial(P[0], 0.15 * (0.5 + 0.5 * Math.sin(t * 3)), 0.5, 1.1, 0.9); say(''); return; }
      if (t < tl.count) { const slot = (tl.count - tl.teaser - 0.9) / 8; const k = Math.floor((t - tl.teaser - 0.9) / slot); const hit = ((t - tl.teaser - 0.9) % slot) < 0.18 && t > tl.teaser + 0.9; black(); radial(P[(k + v.idx) % 4], hit ? 1 : 0.25, 0.5, 0.5, 0.9); if (hit && (k % N === v.idx || k % 2)) fill('#ffffff', 0.7); say(''); return; }
      if (t < boom) { const step = (boom - tl.count) / 5; const k = Math.floor((t - tl.count) / step); const f = ((t - tl.count) % step) / step; black(); radial(k % 2 ? P[0] : P[1], Math.max(0, 1 - f * 2.2) * (0.4 + k * 0.15), 0.5, 0.5, 0.9); if (k >= 3) { const x = (t * 3) % 1; fill('#ffffff', chase(x, 0.08)); } say(`${tx.label || ''}${5 - k}`, '', 'count'); return; }
      fill('#000'); g.fillStyle = hsl(t * 80 + pos * 140, 0.85); g.fillRect(0, 0, W, H); if (t < boom + 3 && strobe(t, 8)) fill('#ffffff', 0.6); say('', t < tl.lines ? tx.start : tx.wait); return;
    }
    if (theme === 'musical') {
      if (t < 2.6) { fill('#ffb547', 0.55 - 0.2 * (t / 2.6)); radial('#fff1c9', 0.4, 0.5, 0, 0.9); say(''); return; }
      if (t < tl.teaser) { const u = clamp((t - 2.6) / 0.6); fill('#ffb547', 0.35 * (1 - u)); say(''); return; }
      if (t < tl.count) { black(); radial('#fff1c9', 0.35 + 0.1 * Math.sin(t * 2 + pos * 4), 0.5 + 0.2 * Math.sin(t * 0.7 + pos * 3), 0.2, 0.7); say(''); return; }
      if (t < boom) { const step = (boom - tl.count) / 5; const k = Math.floor((t - tl.count) / step); fill('#2a0509'); bulbs('#f5c542', t, 10 + k * 3); say(`${5 - k}`, '', 'count'); return; }
      fill('#7a0b18'); radial('#f5c542', 0.55 + 0.25 * Math.sin(t * 2 + pos * 3), 0.5, 1.1, 1); bulbs('#f5c542', t, 6, 0.7); say('', t < tl.lines ? tx.start : tx.wait); return;
    }
    if (theme === 'casino') {
      if (t < tl.teaser) { fill('#0b3d24'); radial('#e8c35a', 0.25 + 0.05 * Math.sin(t * 2), 0.5, 0.4, 0.7); say(''); return; }
      if (t < tl.count) { fill('#0b3d24'); const step = (tl.count - tl.teaser - 1.2) / 8; const k = Math.floor((t - tl.teaser - 0.4) / (step * 0.5)); const f = ((t - tl.teaser - 0.4) % (step * 0.5)); if (k >= 0 && k < 8 && k % N === v.idx && f < 0.35) { g.fillStyle = '#f7f3ea'; g.fillRect(W * 0.3, H * 0.15, W * 0.4, H * 0.7); } say(''); return; }
      if (t < boom) {
        // Roulette: Licht läuft im Kreis durch den Raum und wird langsamer
        const u = (t - tl.count) / (boom - tl.count); const phase = (1 - (1 - u) ** 2.2) * 5.3 * N; const at = Math.floor(phase) % N;
        fill('#0b3d24'); if (at === v.idx) { fill('#e8c35a', 0.9); radial('#ffffff', 0.6); } say(`${5 - Math.min(4, Math.floor(u * 5))}`, '', 'count'); return;
      }
      fill(strobe(t, 6) && t < boom + 3 ? '#e8c35a' : '#5a3410'); bulbs('#ffe9a3', t, 9); say(t < boom + 3 ? tx.start : '', t >= boom + 3 ? tx.wait : '', 'gold'); return;
    }
    if (theme === 'wildnis') {
      if (t < tl.teaser) { black(); if (Math.floor(t * 1.5) % 2 === 0) { g.fillStyle = '#e02020'; g.beginPath(); g.arc(W * 0.12, H * 0.12, Math.min(W, H) * 0.03, 0, 7); g.fill(); } say(''); return; }
      if (t < tl.count) {
        vgrad('#1b3340', '#f2b26b');
        g.fillStyle = 'rgba(35,40,42,.95)'; g.beginPath(); g.moveTo(0, H);
        for (let x = 0; x <= W; x += 4) { const X = x / W + v.idx + t * 0.15; g.lineTo(x, H * 0.62 - Math.sin(X * 4.1) * H * 0.08 - Math.sin(X * 9.7) * H * 0.04); }
        g.lineTo(W, H); g.fill(); say(''); return;
      }
      if (t < boom) { const u = (t - tl.count) / (boom - tl.count); let tt = 0; let last = 0; while (tt < t - tl.count) { last = tt; tt += 0.95 - 0.55 * (tt / (boom - tl.count)); } const f = t - tl.count - last; black(); radial('#b0101a', Math.max(0, 1 - f * 5) * (0.5 + 0.5 * u), 0.5, 0.5, 0.9); say(`${5 - Math.min(4, Math.floor(u * 5))}`, '', 'count'); return; }
      black(); flicker('#ff7a1a', 1, t); dots('#ffcc66', t, 25); say(t < tl.lines ? tx.start : '', t >= tl.lines ? tx.wait : '', 'stencil'); return;
    }
    // weltraum
    const pollStep = Math.min(0.9, ((tl.teaser || 10) - (tl.poll || 3.6) - 1.4) / N);
    const myGo = (tl.poll || 3.6) + 0.5 + v.idx * pollStep;
    if (t < (tl.poll || 3.6)) { fill('#02030a'); g.strokeStyle = 'rgba(76,201,255,.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke(); say(''); return; }
    if (t < tl.teaser) { fill('#02030a'); if (t >= myGo) { const f = t - myGo; fill('#18c964', f < 0.25 ? 1 : 0.35); say(tx.go || 'GO', '', 'go'); } else say(''); return; }
    if (t < tl.count) { fill('#02030a'); const y = ((t * 0.6 + pos) % 1) * H; const gr = g.createLinearGradient(0, y - 20, 0, y + 20); gr.addColorStop(0, 'rgba(76,201,255,0)'); gr.addColorStop(0.5, 'rgba(76,201,255,.55)'); gr.addColorStop(1, 'rgba(76,201,255,0)'); g.fillStyle = gr; g.fillRect(0, y - 20, W, 40); say(''); return; }
    if (t < boom) { const k = Math.floor(t - tl.count); const left = Math.max(1, 10 - k); fill('#02030a'); if (left <= 6) flicker('#ff9f1c', (7 - left) / 6, t); say(`${tx.label || ''}${left}`, '', 'count'); return; }
    if (t < boom + 3.2) { fill(strobe(t, 11) ? '#ffffff' : '#ff9f1c', 0.9); flicker('#ff9f1c', 1, t); say(tx.start, '', 'go'); return; }
    fill('#02030a'); dots('#ffffff', t * 4, 40, 0.9); radial('#4cc9ff', 0.35, 0.5, 1.3, 1); say('', tx.wait);
  };

  const teamProgram = (t, k) => {
    if (k === v.idx) {
      if (t < HIT) { const hz = 3 + t * 10; fill(strobe(t, hz) ? me.color : '#000000', 1); say(''); return; }
      if (t < HIT + 0.25) { fill('#ffffff'); say(''); return; }
      fill(me.color); radial('#ffffff', 0.55 + 0.25 * Math.sin(t * 5), 0.5, 0.45, 0.6);
      if (theme === 'bielefeld') stripes('#0a0a0a', 0.25, t * 0.5, -0.2, 0.1);
      if (theme === 'musical' || theme === 'casino' || theme === 'studio') bulbs('#fff1c9', t, 8, 0.8);
      if (theme === 'wildnis') flicker('#ff7a1a', 0.35, t);
      say(tx.you, tx.youSub, 'you'); return;
    }
    const other = teams[k] || { color: '#888888' };
    const pk = N > 1 ? k / (N - 1) : 0.5;
    if (t < HIT) { const from = pk < 0.5 ? 1 : 0; const x = from + (pk - from) * clamp(t / HIT); black(); fill(other.color, chase(x, 0.1)); say(''); return; }
    black(); radial(other.color, 0.35 + 0.1 * Math.sin(t * 3 + pos * 4), 0.5, 0.5, 0.9); say('', tx.other);
  };

  const hostProgram = (t) => {
    if (t < 6) {
      // Lauflicht wie eine Treppe herunter (über alle iPads), dann warmes Spotlight
      const x = ((t * 1.4) % 1.2) - 0.1; black(); fill('#fff1c9', chase(x, 0.08)); if (t > HIT && t < HIT + 0.2) fill('#ffffff');
      say('', t > HIT ? tx.host : ''); return;
    }
    black(); radial('#fff4d6', 0.55, 0.5 + 0.3 * Math.sin(t * 1.3 + pos * 4), 0.3, 0.6); say('', tx.host);
  };

  const allProgram = (t) => {
    if (t < 0.35) { fill('#ffffff'); say(''); return; }
    const col = teams[v.idx] ? teams[v.idx].color : me.color;
    if (t < 4) { g.fillStyle = hsl(t * 120 + pos * 240, 1); g.fillRect(0, 0, W, H); if (strobe(t, 7)) fill('#ffffff', 0.4); }
    else { fill(col); radial('#ffffff', 0.3 + 0.25 * Math.sin(t * 4 + pos * 6), 0.5, 0.5, 0.7); }
    say(me.name, tx.all, 'all');
  };

  const tick = () => {
    if (!cv.isConnected) { if (st.root !== root) clearInterval(iv); }
    fit();
    const t = (now() - v.at) / 1000;
    if (v.phase === 'auto') autoProgram(t);
    else if (v.phase.startsWith('team:')) teamProgram(t, Number(v.phase.slice(5)));
    else if (v.phase === 'coHost' || v.phase === 'host') hostProgram(t);
    else allProgram(t);
  };
  const iv = setInterval(tick, 33);
  st.iv = iv;
  requestAnimationFrame(tick);
  st.root = root;
  return root;
}
