// Show-Intro – Regie je Thema: Eröffnung (automatisch), Personen-Auftritte, Finale.
// Alle sichtbaren Texte kommen aus si.tx / si.teams / si.host (im Editor änderbar).

import { h, later, atTime, esc, frag, logoEl, avatarOf } from './si-core.js';

export const THEME_LOOK = {
  studio: { a: '#ff4f6d', b: '#6f8cff', c: '#ffd166', d: '#8b5cf6', bg: '#120a1c', metal: 'chrome', font: 'si-anton', parts: 'confetti' },
  buehne: { a: '#ff2d8a', b: '#1fd6f2', c: '#ffd23d', d: '#7c5cff', bg: '#07051a', metal: 'chrome', font: 'si-display', parts: 'confetti' },
  musical: { a: '#e0193a', b: '#f5c542', c: '#fff1c9', d: '#7a0b18', bg: '#1a0306', metal: 'gold', font: 'si-playfair', parts: 'notes' },
  casino: { a: '#e8c35a', b: '#1f9d5b', c: '#d6243a', d: '#0b3d24', bg: '#03140b', metal: 'gold', font: 'si-cinzel', parts: 'cards' },
  wildnis: { a: '#ff7a1a', b: '#ffcc66', c: '#a8d08d', d: '#2d3b22', bg: '#070d06', metal: 'bronze', font: 'si-stencil', parts: 'embers' },
  weltraum: { a: '#ff9f1c', b: '#4cc9ff', c: '#ffffff', d: '#1b2a6b', bg: '#02030a', metal: 'chrome', font: 'si-cond', parts: 'stars' },
};
export const look = (theme) => THEME_LOOK[theme] || THEME_LOOK.studio;
export const FONT = {
  'si-display': '900 100px "SI Display", system-ui, sans-serif', 'si-anton': '400 100px "SI Anton", "SI Display", sans-serif', 'si-playfair': '900 100px "SI Playfair", Georgia, serif',
  'si-cinzel': '800 100px "SI Cinzel", Georgia, serif', 'si-stencil': '900 100px "SI Stencil", "SI Display", sans-serif', 'si-cond': '800 100px "SI Cond", "SI Display", sans-serif',
};

// Reihenfolge der Team-Auftritte je Thema: kein Team wird gleich vorgestellt.
const TEAM_LAYOUTS = {
  studio: ['podium', 'split', 'cube', 'type', 'spot', 'zoom'],
  buehne: ['spot', 'type', 'led', 'split', 'zoom', 'card'],
  musical: ['spot', 'card', 'marquee', 'split', 'type', 'zoom'],
  casino: ['card', 'slot', 'split', 'spot', 'type', 'zoom'],
  wildnis: ['bodycam', 'polaroid', 'split', 'type', 'spot', 'zoom'],
  weltraum: ['reticle', 'patch', 'split', 'type', 'spot', 'zoom'],
};
const HOST_LAYOUT = { studio: 'stairs', buehne: 'stairs', musical: 'stairs', casino: 'card', wildnis: 'bodycam', weltraum: 'patch' };
const COHOST_LAYOUT = { studio: 'split', buehne: 'split', musical: 'marquee', casino: 'split', wildnis: 'polaroid', weltraum: 'reticle' };

// ---------------------------------------------------------------------------------
// Bühnenbilder (bleiben über alle Phasen stehen)
// ---------------------------------------------------------------------------------
function set(c, mode) {
  const { si } = c;
  const th = si.theme;
  if (th === 'studio') return mode === 'muralla' ? murallaSet() : studioSet(c);
  if (th === 'buehne') return h('div', { class: 'si-set si-led-wall' }, h('i', { class: 'si-led-img' }), h('i', { class: 'si-floor' }));
  if (th === 'musical') return h('div', { class: `si-set si-theatre ${mode === 'closed' ? 'closed' : 'open'}` }, h('div', { class: 'si-curtain' }, h('i'), h('i')), h('div', { class: 'si-pros' }), h('div', { class: 'si-foot' }, Array.from({ length: 13 }, () => h('i'))));
  if (th === 'casino') return h('div', { class: 'si-set si-felt' }, h('i', { class: 'si-felt-line' }), h('i', { class: 'si-felt-spot' }));
  if (th === 'wildnis') return wildSet(c, mode);
  if (th === 'weltraum') return spaceSet(c, mode);
  return h('div', { class: 'si-set' });
}

// ---- Studio: Retro-Studio mit XXL-Showtreppe, Videowürfel, Tunnel-Bögen ----
function studioSet(c) {
  const steps = Array.from({ length: 14 }, (_, i) => h('i', { '--i': String(i) }));
  return h('div', { class: 'si-set si-studio-set' },
    h('div', { class: 'si-arches' }, Array.from({ length: 7 }, (_, i) => h('i', { '--i': String(i) }))),
    h('div', { class: 'si-stairs' }, steps),
    h('div', { class: 'si-bulbs-row l' }), h('div', { class: 'si-bulbs-row r' }),
    cube(c, logoEl(c.s.show.name, c.L, 'tiny')));
}
function cube(c, content, cls = '') {
  const faces = ['f', 'r', 'b', 'l'].map((k) => h('div', { class: `si-cube-face ${k}` }, k === 'f' ? content : (k === 'b' ? content.cloneNode(true) : logoEl(c.s.show.name, c.L, 'tiny'))));
  return h('div', { class: `si-cube ${cls}`.trim() }, h('div', { class: 'si-cube-in' }, faces));
}

// ---- Studio-Vorspann: Treppenwelt in Rot, Rosa, Blau, Violett ----
const MR = { sky1: '#8fc3ff', sky2: '#e9f4ff', red: '#d9433f', redD: '#a92f37', redL: '#ef6a5e', pink: '#f6a9bb', pinkD: '#d98199', blue: '#3a5fd9', blueL: '#7393f2', blueD: '#2a45a8', vio: '#6b4bb8', vioD: '#4c3391', vioL: '#8b6fd6' };
function stairPoly(x0, y0, x1, y1, n, thick = 60) {
  // Treppe von (x0,y0) unten nach (x1,y1) oben, n Stufen, Unterseite als schräge Wange
  const dx = (x1 - x0) / n; const dy = (y1 - y0) / n;
  let d = `M${x0},${y0 + thick}`;
  d += ` L${x0},${y0}`;
  for (let i = 0; i < n; i++) { d += ` L${x0 + dx * i},${y0 + dy * (i + 1)} L${x0 + dx * (i + 1)},${y0 + dy * (i + 1)}`; }
  d += ` L${x1},${y1 + thick} Z`;
  return d;
}
function crenel(x0, x1, y, h_ = 40, w = 70) {
  let d = `M${x0},${y + h_}`;
  for (let x = x0; x < x1; x += w * 2) d += ` L${x},${y} L${Math.min(x + w, x1)},${y} L${Math.min(x + w, x1)},${y + h_} L${Math.min(x + 2 * w, x1)},${y + h_}`;
  return `${d} L${x1},${y + h_} Z`;
}
function murallaShots() {
  const sky = `<defs><linearGradient id="mrsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${MR.sky1}"/><stop offset="1" stop-color="${MR.sky2}"/></linearGradient><linearGradient id="mrpool" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#35c6e8"/><stop offset="1" stop-color="#1679b8"/></linearGradient></defs><rect width="1600" height="900" fill="url(#mrsky)"/>`;
  const slits = (x, y, n, col, gap = 70) => Array.from({ length: n }, (_, i) => `<rect x="${x + i * gap}" y="${y}" width="16" height="120" rx="8" fill="${col}"/>`).join('');
  const s1 = `${sky}<rect x="1180" y="180" width="420" height="720" fill="${MR.blue}"/><rect x="1180" y="180" width="60" height="720" fill="${MR.blueD}"/>
    <path d="${crenel(260, 1220, 210, 50, 60)}" fill="${MR.red}"/><rect x="260" y="258" width="960" height="642" fill="${MR.red}"/><rect x="260" y="258" width="960" height="30" fill="${MR.redD}"/>
    ${slits(340, 340, 4, MR.pink)}${slits(860, 340, 4, MR.pink)}
    <path d="${stairPoly(260, 900, 900, 420, 12, 90)}" fill="${MR.pink}"/><path d="${stairPoly(260, 900, 900, 420, 12, 90)}" fill="none" stroke="${MR.pinkD}" stroke-width="3"/>
    <path d="${stairPoly(1600, 900, 1250, 560, 7, 70).replace(/M1600/, 'M1600')}" fill="${MR.vio}"/>`;
  const s2 = `${sky}<rect x="0" y="120" width="1600" height="780" fill="${MR.pink}"/><path d="${crenel(0, 1600, 80, 50, 80)}" fill="${MR.pink}"/>
    <rect x="1120" y="250" width="120" height="420" rx="60" fill="${MR.blue}"/><rect x="1300" y="250" width="40" height="300" rx="20" fill="${MR.blueD}"/>
    <path d="${stairPoly(-40, 960, 1100, 160, 14, 160)}" fill="${MR.vio}"/><path d="${stairPoly(-40, 960, 1100, 160, 14, 160)}" fill="none" stroke="${MR.vioD}" stroke-width="5"/>`;
  const s3 = `${sky}<rect x="0" y="0" width="1600" height="900" fill="${MR.blue}"/><rect x="0" y="0" width="1600" height="900" fill="url(#mrsky)" opacity=".25"/>
    ${slits(120, 120, 3, MR.blueD, 90)}${slits(1250, 120, 3, MR.blueD, 90)}
    <rect x="0" y="330" width="1600" height="70" fill="${MR.red}"/><rect x="0" y="400" width="1600" height="16" fill="${MR.redD}"/>
    <path d="${stairPoly(150, 900, 820, 400, 10, 80)}" fill="${MR.pink}"/><path d="${stairPoly(1500, 900, 780, 400, 10, 80)}" fill="${MR.vio}"/>
    <rect x="700" y="160" width="200" height="170" fill="${MR.blueL}"/><path d="${crenel(700, 900, 120, 40, 40)}" fill="${MR.blueL}"/>`;
  const s4 = `${sky}<path d="${crenel(0, 1600, 330, 60, 90)}" fill="${MR.red}"/><rect x="0" y="388" width="1600" height="512" fill="${MR.red}"/>
    <path d="M300,560 L1300,560 L1500,900 L100,900 Z" fill="${MR.pink}"/><path d="M420,600 L1180,600 L1320,880 L280,880 Z" fill="url(#mrpool)"/>
    <path d="M420,600 L1180,600 L1190,625 L410,625 Z" fill="#9ee7f7" opacity=".7"/>
    <path d="${stairPoly(0, 900, 320, 560, 6, 60)}" fill="${MR.vio}"/>`;
  return [s1, s2, s3, s4];
}
function murallaSet() {
  const shots = murallaShots().map((svg, i) => frag(`<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${svg}</svg>`, `si-mr-shot s${i + 1}`));
  return h('div', { class: 'si-set si-muralla' }, shots, h('div', { class: 'si-mr-sun' }));
}
function ninja(cls = '') {
  return frag('<svg viewBox="0 0 100 160" aria-hidden="true"><circle cx="50" cy="28" r="20" fill="#0d0d12"/><rect x="30" y="22" width="40" height="9" rx="4" fill="#e23b3b"/><rect x="38" y="24" width="24" height="5" rx="2" fill="#f5e6d0"/><path d="M28 52 Q50 44 72 52 L66 112 L34 112 Z" fill="#0d0d12"/><path d="M34 110 L24 156 L40 156 L48 116 Z M66 110 L76 156 L60 156 L52 116 Z" fill="#0d0d12"/><path d="M30 58 L4 84 L12 90 L36 70 Z M70 58 L96 40 L90 32 L66 50 Z" fill="#0d0d12"/></svg>', `si-ninja ${cls}`.trim());
}

// ---- Wildnis: Landschaft (Drohnenflug), Breitbild, Kamera-Einblendungen ----
function wildSet(c, mode) {
  const cv = h('canvas', { class: 'si-land', 'aria-hidden': 'true' });
  requestAnimationFrame(() => landscape(cv, c));
  return h('div', { class: `si-set si-wild ${mode || ''}`.trim() }, cv, h('div', { class: 'si-letterbox t' }), h('div', { class: 'si-letterbox b' }));
}
function landscape(cv, c) {
  if (!cv.isConnected) return;
  const g = cv.getContext('2d');
  const fit = () => { const r = cv.getBoundingClientRect(); cv.width = Math.max(1, r.width * 0.6); cv.height = Math.max(1, r.height * 0.6); };
  fit();
  const ridge = (x, k) => Math.sin(x * 0.0021 * k + k * 3) * 60 + Math.sin(x * 0.0057 * k + k) * 28 + Math.sin(x * 0.013 * k + k * 7) * 10;
  const t0 = performance.now();
  const draw = (now) => {
    if (!cv.isConnected) return;
    const W = cv.width; const H = cv.height; const t = (now - t0) / 1000;
    const night = cv.closest('.si-wild') && cv.closest('.si-wild').classList.contains('night');
    const sky = g.createLinearGradient(0, 0, 0, H);
    if (night) { sky.addColorStop(0, '#04070c'); sky.addColorStop(1, '#141a12'); } else { sky.addColorStop(0, '#1b3340'); sky.addColorStop(0.55, '#c9895a'); sky.addColorStop(1, '#f2b26b'); }
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    if (!night) { const sg = g.createRadialGradient(W * 0.68, H * 0.55, 0, W * 0.68, H * 0.55, H * 0.6); sg.addColorStop(0, 'rgba(255,220,160,.9)'); sg.addColorStop(0.15, 'rgba(255,170,90,.35)'); sg.addColorStop(1, 'rgba(255,140,60,0)'); g.fillStyle = sg; g.fillRect(0, 0, W, H); }
    const layers = 6;
    for (let k = 0; k < layers; k++) {
      const depth = (k + 1) / layers; const speed = 30 + depth * depth * 260; const off = t * speed;
      const base = H * (0.45 + depth * 0.42);
      const col = night ? `rgb(${8 + k * 3},${12 + k * 4},${10 + k * 3})` : `rgb(${Math.round(70 - k * 11)},${Math.round(78 - k * 10)},${Math.round(80 - k * 12)})`;
      g.fillStyle = col; g.beginPath(); g.moveTo(0, H);
      for (let x = 0; x <= W; x += 6) g.lineTo(x, base - ridge(x + off, k + 1) * (0.6 + depth) * (H / 600));
      g.lineTo(W, H); g.fill();
      if (k > 2) { // Baumspitzen
        g.fillStyle = col;
        for (let x = -((off * 1.0) % 14); x < W; x += 14) { const y = base - ridge(x + off, k + 1) * (0.6 + depth) * (H / 600); const th = 10 + depth * 26; g.beginPath(); g.moveTo(x - th * 0.25, y + 4); g.lineTo(x, y - th); g.lineTo(x + th * 0.25, y + 4); g.fill(); }
      }
      const fog = g.createLinearGradient(0, base - 60, 0, base + 40);
      fog.addColorStop(0, 'rgba(230,220,210,0)'); fog.addColorStop(1, night ? 'rgba(20,24,20,.25)' : 'rgba(240,215,190,.18)');
      g.fillStyle = fog; g.fillRect(0, base - 60, W, 100);
    }
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}
function camHud(c, label = '') {
  return h('div', { class: 'si-cam' }, h('b', { class: 'rec' }, c.si.tx['cam.rec'] || ''), h('span', { class: 'tc', 'data-tc': '1' }, '00:00:00:00'), h('span', { class: 'bat' }, '▮▮▮▯'), label ? h('span', { class: 'lab' }, label) : null,
    h('i', { class: 'c tl' }), h('i', { class: 'c tr' }), h('i', { class: 'c bl' }), h('i', { class: 'c br' }));
}
function tickTimecode(root, start) {
  const iv = setInterval(() => {
    if (!root.isConnected) { clearInterval(iv); return; }
    const s = (performance.now() - start) / 1000;
    const f = Math.floor((s % 1) * 25); const ss = Math.floor(s) % 60; const mm = Math.floor(s / 60) % 60;
    root.querySelectorAll('[data-tc]').forEach((e) => { e.textContent = `00:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}:${String(f).padStart(2, '0')}`; });
  }, 40);
}

// ---- Weltraum: Sternenfeld, Erde, HUD ----
function spaceSet(c, mode) {
  return h('div', { class: `si-set si-space ${mode || ''}`.trim() }, h('div', { class: 'si-stars' }), h('div', { class: 'si-stars two' }), h('div', { class: 'si-earth' }), h('div', { class: 'si-hud-grid' }));
}
function hudFrame(c) {
  const { si } = c;
  const tel = h('div', { class: 'si-tel' }, String(si.tx['hud.tel'] || '').split(/\s*·\s*/).filter(Boolean).map((k) => h('div', {}, h('small', {}, k), h('b', { 'data-tel': k }, '0000'))));
  const root = h('div', { class: 'si-hud' },
    h('div', { class: 'si-hud-top' }, h('span', {}, si.tx['cold.a']), h('span', { class: 'met' }, 'T–00:00:30'), h('span', {}, si.tx['cold.b'])),
    tel, h('i', { class: 'si-hud-c tl' }), h('i', { class: 'si-hud-c tr' }), h('i', { class: 'si-hud-c bl' }), h('i', { class: 'si-hud-c br' }));
  const start = performance.now();
  const iv = setInterval(() => {
    if (!root.isConnected) { clearInterval(iv); return; }
    const s = (performance.now() - start) / 1000;
    root.querySelectorAll('[data-tel]').forEach((e, i) => { e.textContent = String(Math.floor((Math.sin(s * (1 + i) + i) * 0.5 + 0.5) * 9000 + i * 311)).padStart(4, '0'); });
  }, 90);
  return root;
}
function patchEl(c, top, bottom, center) {
  const id = `pt${Math.random().toString(36).slice(2, 7)}`;
  return frag(`<svg viewBox="0 0 400 400" aria-hidden="true"><defs><path id="${id}a" d="M60,200 A140,140 0 0 1 340,200"/><path id="${id}b" d="M52,200 A148,148 0 0 0 348,200"/>
    <radialGradient id="${id}g" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#1d3d9c"/><stop offset="1" stop-color="#060b25"/></radialGradient></defs>
    <circle cx="200" cy="200" r="192" fill="#e9eef7"/><circle cx="200" cy="200" r="178" fill="#b8121b"/><circle cx="200" cy="200" r="132" fill="url(#${id}g)" stroke="#e9eef7" stroke-width="6"/>
    <text font-family="SI Cond, sans-serif" font-weight="800" font-size="30" letter-spacing="3" fill="#fff"><textPath href="#${id}a" startOffset="50%" text-anchor="middle">${esc(top).toUpperCase()}</textPath></text>
    <text font-family="SI Cond, sans-serif" font-weight="800" font-size="28" letter-spacing="4" fill="#fff"><textPath href="#${id}b" startOffset="50%" text-anchor="middle" dominant-baseline="hanging">${esc(bottom).toUpperCase()}</textPath></text>
    <g fill="#fff">${Array.from({ length: 9 }, (_, i) => { const a = (i / 9) * Math.PI * 2; return `<circle cx="${200 + Math.cos(a) * 100}" cy="${200 + Math.sin(a) * 100}" r="${2 + (i % 3)}"/>`; }).join('')}</g>
    <path d="M110,270 Q200,150 300,120" stroke="#ffb02e" stroke-width="5" fill="none" stroke-dasharray="4 10"/>
    <g transform="translate(300 118) rotate(55)"><path d="M0,-30 C10,-18 10,10 8,22 L-8,22 C-10,10 -10,-18 0,-30 Z" fill="#fff"/><path d="M-8,10 L-18,26 L-8,22 Z M8,10 L18,26 L8,22 Z" fill="#b8121b"/></g>
    <text x="200" y="${center ? 215 : 200}" text-anchor="middle" font-family="SI Cond, sans-serif" font-weight="800" font-size="40" fill="#fff">${esc(center || '')}</text></svg>`, 'si-patch');
}
function rocketEl() {
  return frag('<svg viewBox="0 0 120 400" aria-hidden="true"><defs><linearGradient id="rk" x1="0" x2="1"><stop offset="0" stop-color="#9aa3b2"/><stop offset=".45" stop-color="#ffffff"/><stop offset="1" stop-color="#7d8696"/></linearGradient></defs><path d="M60 0 C82 30 88 70 88 110 L88 330 L32 330 L32 110 C32 70 38 30 60 0 Z" fill="url(#rk)"/><rect x="32" y="150" width="56" height="10" fill="#1d2433"/><rect x="32" y="250" width="56" height="18" fill="#b8121b"/><circle cx="60" cy="95" r="12" fill="#1d3d9c" stroke="#e9eef7" stroke-width="4"/><path d="M32 270 L8 340 L32 330 Z M88 270 L112 340 L88 330 Z" fill="#b8121b"/><path d="M40 330 L80 330 L74 352 L46 352 Z" fill="#2a2f3a"/></svg>', 'si-rocket');
}

// ---------------------------------------------------------------------------------
// Off-Ansage + Halten (gemeinsam, Stil per CSS je Thema)
// ---------------------------------------------------------------------------------
function linesAndHold(c, stage, extra = () => []) {
  const { si, L, el, sound } = c;
  const tl = si.tl;
  c.voice(si.clips.lines, si.lines.join(' … '), tl.lines);
  si.lines.forEach((line, i) => {
    const t0 = tl.lines + i * tl.line;
    const last = i === si.lines.length - 1;
    if (last) { sound('hit', t0, el, 0.8); c.shake(t0, false); } else sound('whoosh', t0 - 0.15, el, 0.5, 0.3);
    atTime(el, t0, () => {
      if (el > t0 + tl.line + 0.5 && !last) return;
      stage.replaceChildren(...extra(), h('div', { class: `si-line ${L.font} si-metal-${L.metal}${last ? ' last' : ''}`, 'data-i': i }, line));
      if (last) c.fx((fx) => { fx.burst(90, 'spark', fx.w / 2, fx.h / 2, 0.9); fx.flare(fx.w / 2, fx.h / 2); });
    });
  });
  atTime(el, tl.lines + si.lines.length * tl.line + 0.6, () => {
    stage.replaceChildren(...extra(true), h('div', { class: 'si-logo-wrap small' }, logoEl(c.s.show.name, L)), h('div', { class: 'si-hold' }, si.tx.hold));
    c.fx((fx) => { fx.beams = 0.55; });
  });
}
function presents(c, kicker, word) {
  return h('div', { class: 'si-present' }, h('small', {}, kicker), h('b', {}, word));
}
function dropLogo(c, stage, extras = []) {
  const { si, s, L, el } = c;
  const boom = si.tl.boom;
  const wrap = h('div', { class: 'si-logo-wrap' }, si.tx['drop.big'] ? h('div', { class: `si-bigword ${L.font}` }, si.tx['drop.big']) : null, logoEl(s.show.name, L), si.tx['drop.sub'] ? h('div', { class: 'si-sub' }, si.tx['drop.sub']) : null);
  const fresh = el < boom + 0.8;
  stage.replaceChildren(...[fresh ? h('div', { class: 'si-flash', 'aria-hidden': 'true' }) : null, h('div', { class: 'si-rays', 'aria-hidden': 'true' }), ...extras, wrap].filter(Boolean));
  if (fresh) wrap.classList.add('from-particles');
  c.fx((fx) => {
    fx.beams = 1;
    if (fresh) {
      fx.burst(160, 'spark', fx.w / 2, fx.h / 2, 1.2);
      fx.flare(fx.w * 0.5, fx.h * 0.45);
      const lg = wrap.querySelector('.si-logo');
      if (lg) fx.assemble(s.show.name, FONT[L.font], lg.getBoundingClientRect());
    }
    fx.ambient = { rate: 0.6 };
  });
  return wrap;
}

// ---------------------------------------------------------------------------------
// ERÖFFNUNG je Thema
// ---------------------------------------------------------------------------------
export function autoScene(c) {
  ({ studio: autoStudio, buehne: autoBuehne, musical: autoMusical, casino: autoCasino, wildnis: autoWild, weltraum: autoSpace })[c.si.theme in THEME_LOOK ? c.si.theme : 'studio'](c);
}

// ---- STUDIO (wie im Fernsehen) ----
function autoStudio(c) {
  const { root, si, s, L, el, sound } = c;
  const tl = si.tl; const boom = tl.boom;
  const stage = h('div', { class: 'si-stage' });
  const bg = h('div', { class: 'si-setslot' });
  root.append(bg, stage);
  const at = (t, fn) => atTime(el, t, fn);
  // Cold Open: Aufnahme-Leuchtschild, dann „präsentieren“
  at(0, () => { if (el < tl.teaser) stage.replaceChildren(h('div', { class: 'si-onair' }, h('i'), h('b', {}, si.tx['cold.a']))); });
  sound('clunk', 0.2, el);
  c.voice(si.clips.cold, si.tx['voice.cold'], 0.3);
  at(1.5, () => { if (el < tl.teaser) stage.replaceChildren(presents(c, si.tx['cold.kicker'], si.tx['cold.present'])); });
  // Vorspann: Treppenwelt, vier Einstellungen, Spieltitel, Ninjas, Sprung in den Pool
  const shotLen = (boom - tl.teaser) / 4;
  at(tl.teaser, () => {
    if (el > boom) return;
    const mr = set(c, 'muralla');
    bg.replaceChildren(mr);
    root.classList.add('si-day');
    const host = h('div', { class: 'si-mr-host' }, h('img', { src: s.show.hostAvatar || 'assets/img/avatar-host.webp', alt: '' }));
    mr.append(host, ninja('n1'), ninja('n2'), ninja('n3'));
    for (let k = 0; k < 4; k++) {
      atTime(el, tl.teaser + k * shotLen, () => { mr.dataset.shot = String(k + 1); if (el < tl.teaser + (k + 1) * shotLen) sound('whoosh', tl.teaser + k * shotLen, el, 0.45, 0.4); });
    }
    atTime(el, boom - 1.15, () => { mr.dataset.fall = '1'; sound('whoosh', boom - 1.15, el, 1.0, 0.5); });
  });
  at(tl.teaser + 0.2, () => { if (el < tl.teaser + 1.3) stage.replaceChildren(h('div', { class: 'si-teaser-head si-retro' }, si.tx['teaser.head'])); });
  const games = si.games.slice(0, 8);
  const slot = games.length ? (boom - 1.4 - (tl.teaser + 1.3)) / games.length : 0;
  games.forEach((g, i) => {
    const t0 = tl.teaser + 1.3 + i * slot;
    sound('pop', t0, el);
    at(t0, () => { if (el > boom - 1.2) return; stage.replaceChildren(h('div', { class: `si-cut si-retro si-cut-${i % 4}` }, h('b', {}, g.label))); });
  });
  at(boom - 1.2, () => { if (el > boom) return; stage.replaceChildren(si.tx['cold.b'] ? h('div', { class: 'si-cut si-retro si-fallline' }, h('b', {}, si.tx['cold.b'])) : ''); });
  // Höhepunkt: Platsch → Studio mit Videowürfel und Showtreppe
  c.shake(boom, true);
  sound('hit', boom, el);
  at(boom, () => {
    root.classList.remove('si-day'); root.classList.add('si-lit');
    bg.replaceChildren(set(c, 'studio'));
    c.voice(si.clips.drop, si.tx['voice.drop'], boom + 0.4);
    dropLogo(c, stage);
    c.fx((fx) => { if (el < boom + 1) { fx.burst(140, 'spark', fx.w / 2, fx.h * 0.6, 1.3, ['#ffffff', '#9ee7f7', '#5bc0ff']); fx.cannon(-1, 70); fx.cannon(1, 70); } fx.beamN = 6; });
  });
  linesAndHold(c, stage);
}

// ---- SHOWBÜHNE ----
function autoBuehne(c) {
  const { root, si, s, L, el, sound } = c;
  const tl = si.tl; const boom = tl.boom;
  const bg = h('div', { class: 'si-setslot' }); const stage = h('div', { class: 'si-stage' });
  root.append(bg, stage);
  const at = (t, fn) => atTime(el, t, fn);
  sound('boom', 0.1, el);
  c.voice(si.clips.cold, si.tx['voice.cold'], 0.3);
  c.fx((fx) => { fx.ambient = { rate: 0.2 }; });
  at(0.3, () => { if (el < 1.0) stage.replaceChildren(h('div', { class: 'si-kicker-big' }, si.tx['cold.a'])); });
  at(1.0, () => { if (el < 1.6 && si.tx['cold.b']) stage.replaceChildren(h('div', { class: 'si-kicker-big' }, si.tx['cold.b'])); });
  at(1.6, () => { if (el < tl.teaser) stage.replaceChildren(presents(c, si.tx['cold.kicker'], si.tx['cold.present'])); c.fx((fx) => { fx.beams = 0.35; fx.beamFrom = 'both'; fx.beamN = 6; }); });
  at(tl.teaser, () => { bg.replaceChildren(set(c)); root.classList.add('si-led-on'); });
  sound('whoosh', tl.teaser, el, 0.8);
  at(tl.teaser, () => { if (el < tl.teaser + 0.9) stage.replaceChildren(h('div', { class: 'si-teaser-head' }, si.tx['teaser.head'])); });
  const games = si.games.slice(0, 8);
  const slot = games.length ? (tl.count - tl.teaser - 0.9) / games.length : 0;
  games.forEach((g, i) => {
    const t0 = tl.teaser + 0.9 + i * slot;
    if (i % 2) sound('whoosh', t0, el, 0.35, 0.5); else sound('tick', t0, el, 0);
    at(t0, () => { if (el > tl.count) return; stage.replaceChildren(h('div', { class: `si-cut si-cut-${i % 4}` }, h('b', {}, g.label))); root.dataset.led = String(i % 4); });
  });
  countdown(c, stage, 5, tl.count, boom, 'neon');
  c.shake(boom, true); sound('hit', boom, el);
  at(boom, () => {
    root.classList.add('si-lit');
    c.voice(si.clips.drop, si.tx['voice.drop'], boom + 0.3);
    dropLogo(c, stage);
    c.fx((fx) => { if (el < boom + 1) { fx.cannon(-1, 80); fx.cannon(1, 80); for (const x of [0.08, 0.25, 0.75, 0.92]) fx.fountain(fx.w * x, 3.2); } });
  });
  linesAndHold(c, stage);
}

// Countdown (Zahlen) – Stil je Thema per CSS
function countdown(c, stage, from, t0, boom, style) {
  const { si, L, el, sound } = c;
  const step = (boom - t0) / from;
  for (let k = 0; k < from; k++) {
    const nr = from - k; const tt = t0 + k * step;
    sound('tick', tt, el, k);
    atTime(el, tt, () => {
      if (el > boom) return;
      const final = nr === 1 && si.tx['count.final'];
      stage.replaceChildren(h('div', { class: `si-count si-count-${style}` }, ...[
        style === 'roulette' ? rouletteEl() : null,
        style === 'marquee' ? h('div', { class: 'si-marquee-box', 'aria-hidden': 'true' }) : null,
        style === 'fire' ? h('div', { class: 'si-flame', 'aria-hidden': 'true' }) : null,
        h('div', { class: 'si-ring', 'aria-hidden': 'true' }),
        h('b', { class: `si-num ${L.font}` }, `${si.tx['count.label'] || ''}${nr}`),
        final ? h('div', { class: 'si-count-final' }, si.tx['count.final']) : null].filter(Boolean)));
      c.fx((fx) => { fx.beams = 0.4 + k * 0.12; });
      c.root.classList.toggle('si-pulse', nr <= 3);
    });
  }
  atTime(el, boom, () => c.root.classList.remove('si-pulse'));
}

// ---- MUSICAL ----
function autoMusical(c) {
  const { root, si, L, el, sound } = c;
  const tl = si.tl; const boom = tl.boom;
  const bg = h('div', { class: 'si-setslot' }); const stage = h('div', { class: 'si-stage' });
  root.append(bg, stage);
  const at = (t, fn) => atTime(el, t, fn);
  const theatre = set(c, 'closed');
  bg.replaceChildren(theatre);
  root.classList.add('si-house');
  c.voice(si.clips.cold, si.tx['voice.cold'], 0.4);
  at(0.2, () => { if (el < tl.teaser) stage.replaceChildren(h('div', { class: 'si-notice' }, si.tx['cold.a'])); });
  sound('clunk', 2.6, el);
  at(2.6, () => { root.classList.remove('si-house'); root.classList.add('si-dimmed'); if (el < tl.teaser) stage.replaceChildren(presents(c, si.tx['cold.kicker'], si.tx['cold.present'])); });
  // Programmheft
  at(tl.teaser, () => {
    if (el > tl.count) return;
    const list = h('ol', { class: 'si-acts' }, si.games.slice(0, 8).map((g) => h('li', {}, h('span', {}, g.label))));
    stage.replaceChildren(h('div', { class: 'si-playbill' }, h('small', {}, si.tx['cold.b']), h('b', { class: 'si-playfair' }, si.tx['teaser.head']), list, h('i', { class: 'si-pb-show' }, c.s.show.name)));
    [...list.children].forEach((li, i) => atTime(el, tl.teaser + 0.5 + i * ((tl.count - tl.teaser - 1) / Math.max(1, list.children.length)), () => li.classList.add('on')));
  });
  sound('flip', tl.teaser, el);
  countdown(c, stage, 5, tl.count, boom, 'marquee');
  c.shake(boom, false); sound('hit', boom, el);
  at(boom, () => {
    root.classList.remove('si-dimmed'); root.classList.add('si-lit');
    theatre.classList.remove('closed'); theatre.classList.add('open');
    c.voice(si.clips.drop, si.tx['voice.drop'], boom + 0.2);
    const lg = dropLogo(c, stage);
    lg.classList.add('si-marquee-logo');
    c.fx((fx) => { fx.beamFrom = 'top'; fx.beamN = 5; if (el < boom + 1) { fx.cannon(-1, 60, 'confetti', ['#f5c542', '#fff1c9', '#e0193a']); fx.cannon(1, 60, 'confetti', ['#f5c542', '#fff1c9', '#e0193a']); } });
  });
  linesAndHold(c, stage);
}

// ---- CASINO ----
function rouletteEl() {
  const nums = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
  const seg = 360 / nums.length;
  const parts = nums.map((nr, i) => {
    const a0 = (i * seg - 90) * Math.PI / 180; const a1 = ((i + 1) * seg - 90) * Math.PI / 180;
    const col = nr === 0 ? '#11823b' : (i % 2 ? '#111111' : '#b81d2f');
    const p = (r, a) => `${200 + Math.cos(a) * r},${200 + Math.sin(a) * r}`;
    const am = (a0 + a1) / 2;
    return `<path d="M${p(120, a0)} L${p(190, a0)} A190,190 0 0 1 ${p(190, a1)} L${p(120, a1)} A120,120 0 0 0 ${p(120, a0)} Z" fill="${col}"/><text x="${200 + Math.cos(am) * 168}" y="${200 + Math.sin(am) * 168}" fill="#fff" font-size="13" font-family="SI Cinzel, serif" text-anchor="middle" dominant-baseline="middle" transform="rotate(${(i + 0.5) * seg} ${200 + Math.cos(am) * 168} ${200 + Math.sin(am) * 168})">${nr}</text>`;
  }).join('');
  return frag(`<svg viewBox="0 0 400 400" aria-hidden="true"><circle cx="200" cy="200" r="198" fill="#5a3410"/><circle cx="200" cy="200" r="192" fill="#e8c35a"/><g class="si-wheel-spin">${parts}<circle cx="200" cy="200" r="120" fill="#6b3d12"/><circle cx="200" cy="200" r="70" fill="#e8c35a"/><circle cx="200" cy="200" r="22" fill="#5a3410"/></g><g class="si-ball-orbit"><circle cx="200" cy="22" r="8" fill="#fff"/></g></svg>`, 'si-roulette');
}
function autoCasino(c) {
  const { root, si, L, el, sound } = c;
  const tl = si.tl; const boom = tl.boom;
  const bg = h('div', { class: 'si-setslot' }); const stage = h('div', { class: 'si-stage' });
  root.append(bg, stage);
  const at = (t, fn) => atTime(el, t, fn);
  bg.replaceChildren(set(c));
  root.classList.add('si-tablelight');
  c.voice(si.clips.cold, si.tx['voice.cold'], 0.3);
  for (let k = 0; k < 6; k++) sound('coin', 0.3 + k * 0.4, el);
  at(0.2, () => { if (el < 1.0) stage.replaceChildren(h('div', { class: 'si-kicker-big si-cinzel' }, si.tx['cold.a'])); });
  at(1.0, () => { if (el < 1.8 && si.tx['cold.b']) stage.replaceChildren(h('div', { class: 'si-kicker-big si-cinzel' }, si.tx['cold.b'])); });
  at(1.8, () => { if (el < tl.teaser) stage.replaceChildren(presents(c, si.tx['cold.kicker'], si.tx['cold.present'])); });
  // Karten werden ausgeteilt
  at(tl.teaser, () => {
    if (el > tl.count) return;
    const games = si.games.slice(0, 8);
    const grid = h('div', { class: `si-deal n${games.length}` }, games.map((g, i) => h('div', { class: 'si-pcard', '--i': String(i) }, h('div', { class: 'back' }), h('div', { class: 'front' }, h('small', {}, ['♠', '♥', '♦', '♣'][i % 4]), h('b', {}, g.label)))));
    stage.replaceChildren(h('div', { class: 'si-teaser-head small si-cinzel' }, si.tx['teaser.head']), grid);
    const step = (tl.count - tl.teaser - 1.2) / Math.max(1, games.length);
    [...grid.children].forEach((card, i) => { atTime(el, tl.teaser + 0.4 + i * step * 0.5, () => card.classList.add('dealt')); atTime(el, tl.teaser + 1 + i * step, () => card.classList.add('flip')); });
  });
  si.games.slice(0, 8).forEach((_, i) => { sound('flip', tl.teaser + 0.4 + i * ((tl.count - tl.teaser - 1.2) / Math.max(1, si.games.length)) * 0.5, el); });
  c.voice(si.clips.count, si.tx['voice.count'], boom - 1.6);
  countdown(c, stage, 5, tl.count, boom, 'roulette');
  for (let k = 0; k < 40; k++) sound('ball', tl.count + 0.2 + (k / 40) ** 0.8 * (boom - tl.count - 0.4), el);
  c.shake(boom, true); sound('hit', boom, el);
  at(boom, () => {
    root.classList.remove('si-tablelight'); root.classList.add('si-lit', 'si-jackpot');
    c.voice(si.clips.drop, si.tx['voice.drop'], boom + 0.3);
    dropLogo(c, stage, [h('div', { class: 'si-bulbframe', 'aria-hidden': 'true' })]);
    c.fx((fx) => { if (el < boom + 1) { fx.rain(140, 'coin'); fx.cannon(-1, 40, 'chip', ['#d6243a', '#111111', '#1f6fd6', '#e8c35a']); fx.cannon(1, 40, 'chip', ['#d6243a', '#111111', '#1f6fd6', '#e8c35a']); } });
  });
  for (let k = 0; k < 10; k++) sound('coin', boom + 0.1 + k * 0.12, el);
  linesAndHold(c, stage);
}

// ---- WILDNIS ----
function autoWild(c) {
  const { root, si, s, L, el, sound } = c;
  const tl = si.tl; const boom = tl.boom;
  const bg = h('div', { class: 'si-setslot' }); const stage = h('div', { class: 'si-stage' });
  const over = h('div', { class: 'si-overlay' });
  root.append(bg, stage, over);
  const at = (t, fn) => atTime(el, t, fn);
  root.classList.add('si-doc');
  over.replaceChildren(h('div', { class: 'si-letterbox t' }), h('div', { class: 'si-letterbox b' }), camHud(c));
  tickTimecode(over, performance.now() - el * 1000);
  c.voice(si.clips.cold, si.tx['voice.cold'], 2.2);
  // GPS tippt sich ein
  const typeIn = (node, text, t0, cps = 22) => {
    [...String(text)].forEach((ch, i) => { const tt = t0 + i / cps; atTime(el, tt, () => { node.textContent = String(text).slice(0, i + 1); }); if (i % 2 === 0) sound('type', tt, el); });
  };
  at(0.4, () => {
    if (el > tl.teaser) return;
    const a = h('div', { class: 'si-gps' }); const b = h('div', { class: 'si-place' });
    stage.replaceChildren(h('div', { class: 'si-coords' }, a, b));
    typeIn(a, si.tx['cold.a'], 0.5);
    typeIn(b, si.tx['cold.b'], 0.6 + String(si.tx['cold.a']).length / 22 + 0.3, 16);
  });
  at(tl.teaser - 1.4, () => { if (el < tl.teaser) stage.replaceChildren(presents(c, si.tx['cold.kicker'], si.tx['cold.present'])); });
  // Drohnenflug + Karte mit Route
  at(tl.teaser, () => { bg.replaceChildren(set(c, 'day')); });
  sound('whoosh', tl.teaser, el, 1.2, 0.5);
  at(tl.teaser + 0.2, () => {
    if (el > tl.count) return;
    stage.replaceChildren(routeMap(c, tl.teaser + 0.2, tl.count - 0.3));
  });
  // Herzschlag + Countdown im Schablonen-Stil
  countdown(c, stage, 5, tl.count, boom, 'fire');
  { let tt = tl.count; while (tt < boom - 0.2) { sound('heart', tt, el, 0.6 + 0.4 * (tt - tl.count) / (boom - tl.count)); tt += 0.95 - 0.55 * (tt - tl.count) / (boom - tl.count); } }
  sound('strike', boom - 0.45, el);
  c.shake(boom, true); sound('hit', boom, el);
  at(boom, () => {
    root.classList.add('si-lit');
    bg.replaceChildren(set(c, 'night'));
    c.voice(si.clips.drop, si.tx['voice.drop'], boom + 0.3);
    dropLogo(c, stage);
    c.fx((fx) => { fx.fire = 1; fx.beams = 0; later(2.5, () => { fx.fire = 0.35; }); });
  });
  linesAndHold(c, stage);
}
function routeMap(c, t0, t1) {
  const { si, el } = c;
  const games = si.games.slice(0, 8);
  const pts = games.map((_, i) => [160 + (i / Math.max(1, games.length - 1)) * 1280, 520 + Math.sin(i * 1.7) * 170 - (i % 2) * 60]);
  const rings = Array.from({ length: 11 }, (_, k) => {
    const cx = 800 + Math.sin(k) * 120; const cy = 450 + Math.cos(k * 1.3) * 60; const r = 60 + k * 55;
    let d = '';
    for (let a = 0; a <= 64; a++) { const ang = (a / 64) * Math.PI * 2; const rr = r * (1 + 0.14 * Math.sin(ang * 3 + k) + 0.07 * Math.sin(ang * 5 + k * 2)); d += `${a ? 'L' : 'M'}${(cx + Math.cos(ang) * rr * 1.5).toFixed(1)},${(cy + Math.sin(ang) * rr * 0.8).toFixed(1)} `; }
    return `<path d="${d}Z" fill="none" stroke="rgba(255,236,200,${k % 5 === 0 ? 0.55 : 0.25})" stroke-width="${k % 5 === 0 ? 2.2 : 1.2}"/>`;
  }).join('');
  const route = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(0)},${p[1].toFixed(0)}`).join(' ');
  const map = frag(`<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${rings}<path class="si-route" d="${route}" fill="none" stroke="#ff7a1a" stroke-width="6" stroke-dasharray="14 10" stroke-linecap="round"/>${pts.map((p, i) => `<g class="si-wp" data-i="${i}"><circle cx="${p[0]}" cy="${p[1]}" r="13" fill="#ff7a1a" stroke="#fff" stroke-width="4"/></g>`).join('')}</svg>`, 'si-map-svg');
  const labels = h('div', { class: 'si-map-labels' }, games.map((g, i) => h('div', { class: 'si-wp-label', style: { left: `${(pts[i][0] / 1600) * 100}%`, top: `${(pts[i][1] / 900) * 100}%` } }, g.label)));
  const box = h('div', { class: 'si-map' }, h('div', { class: 'si-map-head' }, si.tx['teaser.head']), map, labels);
  const step = (t1 - t0 - 0.6) / Math.max(1, games.length);
  games.forEach((_, i) => atTime(el, t0 + 0.5 + i * step, () => { box.style.setProperty('--route', String((i + 1) / games.length)); map.querySelector(`.si-wp[data-i="${i}"]`)?.classList.add('on'); labels.children[i]?.classList.add('on'); }));
  games.forEach((_, i) => c.sound('shutter', t0 + 0.5 + i * step, el));
  return box;
}

// ---- WELTRAUM ----
function autoSpace(c) {
  const { root, si, s, L, el, sound } = c;
  const tl = si.tl; const boom = tl.boom;
  const bg = h('div', { class: 'si-setslot' }); const stage = h('div', { class: 'si-stage' }); const over = h('div', { class: 'si-overlay' });
  root.append(bg, stage, over);
  const at = (t, fn) => atTime(el, t, fn);
  bg.replaceChildren(set(c, 'dark'));
  over.replaceChildren(hudFrame(c));
  sound('static', 0.1, el, 0.6);
  sound('quindar', 0.3, el, true);
  c.voice(si.clips.cold, si.tx['voice.cold'], 0.6);
  at(0.5, () => { if (el < tl.poll) stage.replaceChildren(presents(c, si.tx['cold.kicker'], si.tx['cold.present'])); });
  // Go/No-Go-Abfrage: jedes Team meldet „GO“ (auch auf seinem iPad)
  const teams = si.teams;
  const pollStep = Math.min(0.9, (tl.teaser - tl.poll - 1.4) / Math.max(1, teams.length));
  at(tl.poll, () => {
    if (el > tl.teaser) return;
    const rows = teams.map((t) => h('li', {}, h('span', {}, t.row), h('i', { class: 'dots' }), h('b', {}, si.tx['poll.go'])));
    stage.replaceChildren(h('div', { class: 'si-poll' }, h('div', { class: 'si-poll-head' }, si.tx['poll.title']), h('ol', {}, rows), h('div', { class: 'si-poll-done' }, si.tx['poll.done'])));
    rows.forEach((r, i) => atTime(el, tl.poll + 0.5 + i * pollStep, () => r.classList.add('go')));
    atTime(el, tl.poll + 0.6 + teams.length * pollStep, () => stage.querySelector('.si-poll')?.classList.add('done'));
  });
  teams.forEach((_, i) => { sound('quindar', tl.poll + 0.5 + i * pollStep - 0.02, el, i % 2 === 0); sound('beep', tl.poll + 0.5 + i * pollStep + 0.25, el, 880); });
  // Flugplan
  at(tl.teaser, () => {
    if (el > tl.count) return;
    const games = si.games.slice(0, 8);
    const plan = h('div', { class: 'si-flightplan' }, h('div', { class: 'si-poll-head' }, si.tx['teaser.head']),
      frag('<svg viewBox="0 0 1600 500" aria-hidden="true"><path class="si-orbit" d="M60,440 C420,440 520,80 900,80 S1500,240 1560,120" fill="none" stroke="#4cc9ff" stroke-width="4" stroke-dasharray="10 12"/></svg>', 'si-fp-svg'),
      h('ol', {}, games.map((g, i) => h('li', { '--i': String(i) }, h('b', {}, g.label)))));
    stage.replaceChildren(plan);
  });
  // Countdown T–10 mit Zündung
  c.voice(si.clips.count, si.tx['voice.count'], tl.count + 0.1);
  countdown(c, stage, 10, tl.count, boom, 'tminus');
  at(boom - 6, () => root.classList.add('si-ignite'));
  // LIFTOFF
  c.shake(boom, true); sound('hit', boom, el);
  at(boom, () => {
    root.classList.remove('si-ignite'); root.classList.add('si-lit', 'si-liftoff');
    const rk = rocketEl();
    const pad = h('div', { class: 'si-launch' }, rk, h('div', { class: 'si-tower' }));
    bg.append(pad);
    c.voice(si.clips.drop, si.tx['voice.drop'], boom + 0.2);
    stage.replaceChildren(h('div', { class: 'si-flash short', 'aria-hidden': 'true' }), h('div', { class: `si-bigword ${L.font}` }, si.tx['drop.big']));
    c.fx((fx) => {
      fx.plume(() => { const r = rk.getBoundingClientRect(); const cr = fx.c.getBoundingClientRect(); return [r.left - cr.left + r.width / 2, r.bottom - cr.top - r.height * 0.06]; }, 6);
      fx.beams = 0;
    });
  });
  at(boom + 3.2, () => {
    bg.querySelector('.si-launch')?.remove();
    root.classList.remove('si-liftoff');
    bg.replaceChildren(set(c, 'orbit'));
    const p = patchEl(c, c.s.show.name, si.tx['cold.b'], '');
    stage.replaceChildren(h('div', { class: 'si-patch-wrap' }, p), h('div', { class: 'si-logo-wrap patch' }, logoEl(s.show.name, L), si.tx['drop.sub'] ? h('div', { class: 'si-sub' }, si.tx['drop.sub']) : null));
    c.fx((fx) => { fx.flare(fx.w * 0.8, fx.h * 0.25); fx.warp = 0.6; later(2, () => { fx.warp = 0; }); fx.ambient = { rate: 0.4 }; });
  });
  linesAndHold(c, stage);
}

// ---------------------------------------------------------------------------------
// PERSONEN: Teams (6 verschiedene Auftritte), Co-Moderation, Moderation
// ---------------------------------------------------------------------------------
export const HIT = 1.7;
export function personScene(c, kind) {
  const { root, si, s, L, el } = c;
  let P;
  if (kind === 'team') {
    const k = Number(si.phase.slice(5));
    const t = s.teams[k] || { name: '?', color: '#888' };
    const tt = si.teams[k] || {};
    P = { kind, k, name: t.name, color: t.color, avatar: () => avatarOf({ name: t.name, color: t.color, avatar: t.avatar }), kicker: tt.kicker, tag: tt.tag, extra: tt.extra, call: tt.call, clip: si.clips[`team:${t.id}`], song: si.songs && si.songs[`team:${t.id}`], jingle: `team${(k % 6) + 1}`, layout: (TEAM_LAYOUTS[si.theme] || TEAM_LAYOUTS.studio)[k % 6] };
  } else {
    const co = kind === 'coHost';
    const p = (co ? si.coHost : si.host) || { name: '', call: '', kicker: '', tag: '' };
    const src = co ? (s.show.coHostAvatar || 'assets/img/avatar-cohost.webp') : (s.show.hostAvatar || 'assets/img/avatar-host.webp');
    P = { kind, k: -1, name: p.name, color: L.c, avatar: () => h('img', { class: 'si-avatar host', src, alt: '' }), kicker: p.kicker, tag: p.tag, extra: '', call: p.call, clip: si.clips[kind], song: si.songs && si.songs[kind], jingle: co ? 'cohost' : 'host', layout: (co ? COHOST_LAYOUT : HOST_LAYOUT)[si.theme] || 'spot' };
  }
  P.extraLabel = String(si.extraLabel || '').replace(/\s*\(.*\)\s*/g, '');
  // Schriftgröße nach dem längsten Wort, damit kein Name mitten im Wort umbricht
  P.fit = (vw, maxVh) => `min(${maxVh}vh, ${(vw / (Math.max(5, ...String(P.name).split(/\s+/).map((w) => w.length)) * 0.6)).toFixed(2)}vw)`;
  c.person = P;
  c.voice(P.clip, P.call, 0.08);
  c.jingle(P.jingle, P.song, HIT);
  c.shake(HIT, kind === 'host');
  root.classList.add('si-lit');
  const bg = h('div', { class: 'si-setslot' }, set(c, si.theme === 'wildnis' ? 'night' : (si.theme === 'weltraum' ? 'orbit' : 'open')));
  root.append(bg);
  const node = (LAYOUTS[P.layout] || LAYOUTS.spot)(c, P);
  node.classList.add('si-stage', 'si-person', `lay-${P.layout}`, kind);
  node.style.setProperty('--team', P.color);
  node.style.setProperty('--hit', `${Math.max(0, HIT - el)}s`);
  root.append(node);
  c.fx((fx) => {
    fx.beams = 0.9; fx.beamColor = P.color; fx.ambient = { rate: 0.4 };
    if (si.theme === 'wildnis') { fx.fire = 0.3; fx.beams = 0.2; }
    if (el < HIT + 1) later(Math.max(0, HIT - el), () => {
      fx.burst(kind === 'host' ? 220 : 120, 'spark', fx.w / 2, fx.h * 0.45, 1.1);
      fx.flare(fx.w / 2, fx.h * 0.4);
      if (kind === 'host' || P.layout === 'zoom') { fx.cannon(-1, 90); fx.cannon(1, 90); }
      if (si.theme === 'buehne' || si.theme === 'studio') { fx.fountain(fx.w * 0.1, 2.2); fx.fountain(fx.w * 0.9, 2.2); }
      if (si.theme === 'casino') fx.rain(50, 'coin');
    });
  });
}

const plate = (P, L) => h('div', { class: 'si-plate' }, h('span', { class: 'si-plate-bar' }), h('b', { class: `si-plate-name ${L.font}` }, P.name), h('small', {}, P.tag || P.kicker));
const kickerEl = (P) => h('div', { class: 'si-kicker' }, P.kicker);
const extraEl = (P) => (P.extra ? h('div', { class: 'si-extra' }, P.extraLabel ? h('small', {}, P.extraLabel) : null, h('b', {}, P.extra)) : null);

const LAYOUTS = {
  // 1) Spotlight + Bauchbinde
  spot(c, P) {
    return h('div', {}, kickerEl(P), h('div', { class: 'si-spot-cone' }), h('div', { class: 'si-hero' }, P.avatar()), plate(P, c.L));
  },
  // 2) Geteiltes Bild: Avatar links, riesiger Name rechts
  split(c, P) {
    return h('div', {}, h('div', { class: 'si-split-l' }, P.avatar()), h('div', { class: 'si-split-r' }, kickerEl(P), h('b', { class: `si-split-name ${c.L.font}`, style: { fontSize: P.fit(44, 15) } }, P.name), h('div', { class: 'si-split-tag' }, P.tag), extraEl(P)), h('i', { class: 'si-split-bar' }));
  },
  // 3) Kinetische Typo: Buchstaben knallen einzeln rein
  type(c, P) {
    const letters = [...String(P.name)].map((ch, i) => h('span', { style: { animationDelay: `calc(var(--hit) + ${i * 0.045}s)` } }, ch === ' ' ? ' ' : ch));
    return h('div', {}, h('div', { class: 'si-type-bg' }, P.avatar()), h('b', { class: `si-type-name ${c.L.font}`, style: { fontSize: P.fit(92, 22) } }, letters), h('div', { class: 'si-type-sub' }, h('span', {}, P.kicker), h('i'), h('span', {}, P.tag)), extraEl(P));
  },
  // 4) Anflug aus der Tiefe mit Speed-Lines
  zoom(c, P) {
    return h('div', {}, h('div', { class: 'si-speed' }), h('div', { class: 'si-zoom-av' }, P.avatar()), h('b', { class: `si-zoom-name ${c.L.font}`, style: { fontSize: P.fit(90, 14) } }, P.name), h('div', { class: 'si-zoom-kick' }, P.kicker), h('div', { class: 'si-zoom-tag' }, P.tag));
  },
  // Studio: Kandidatenpult im Retro-Look
  podium(c, P) {
    return h('div', {}, kickerEl(P), h('div', { class: 'si-podium' }, h('div', { class: 'si-pod-av' }, P.avatar()), h('div', { class: 'si-pod-desk' }, h('i', { class: 'si-pod-bulbs' }), h('b', { class: c.L.font }, P.name), h('small', {}, P.tag))));
  },
  // Studio: Videowürfel zeigt das Team
  cube(c, P) {
    const face = h('div', { class: 'si-cube-team' }, P.avatar(), h('b', {}, P.name));
    return h('div', {}, cube(c, face, 'big'), h('div', { class: 'si-cube-plate' }, h('small', {}, P.kicker), h('b', { class: c.L.font }, P.name), h('span', {}, P.tag)), extraEl(P));
  },
  // Showtreppe: Abgang über die XXL-Treppe mit Lauflicht
  stairs(c, P) {
    const steps = Array.from({ length: 12 }, (_, i) => h('i', { '--i': String(i) }));
    return h('div', {}, h('div', { class: 'si-xxl' }, steps), h('div', { class: 'si-walker' }, P.avatar()), kickerEl(P), plate(P, c.L));
  },
  // LED-Wand: Name in Riesen-Pixeln
  led(c, P) {
    return h('div', {}, h('div', { class: 'si-led-name' }, h('b', { class: c.L.font }, P.name)), h('div', { class: 'si-hero small' }, P.avatar()), kickerEl(P), h('div', { class: 'si-split-tag bottom' }, P.tag));
  },
  // Karte: Spielkarte (Casino), Programmheft-Seite (Musical), Sammelkarte (Showbühne)
  card(c, P) {
    const th = c.si.theme;
    const suit = ['♠', '♥', '♦', '♣'][Math.max(0, P.k) % 4];
    const corner = th === 'casino' ? (P.kind === 'host' ? 'K' : 'A') : '';
    return h('div', {}, h('div', { class: `si-bigcard ${th}` }, h('div', { class: 'back' }), h('div', { class: 'front' },
      corner ? h('i', { class: 'cn tl' }, corner, h('br'), suit) : null, corner ? h('i', { class: 'cn br' }, corner, h('br'), suit) : null,
      h('div', { class: 'si-card-av' }, P.avatar()), h('b', { class: c.L.font }, P.name), h('small', {}, P.tag), extraEl(P))), kickerEl(P));
  },
  // Spielautomat: Walzen laufen und landen auf dem Teamnamen
  slot(c, P) {
    const syms = ['7', '★', '♦', 'BAR', '♣', '7', '★'];
    const reel = (d) => h('div', { class: 'si-reel', '--d': String(d) }, h('div', { class: 'si-reel-in' }, [...syms, ...syms].map((x) => h('span', {}, x))));
    return h('div', {}, h('div', { class: 'si-slot' }, h('div', { class: 'si-slot-top' }, c.si.tx['slot.top'] || ''), h('div', { class: 'si-reels' }, reel(0), reel(1), reel(2)), h('div', { class: 'si-slot-win' }, h('b', { class: c.L.font }, P.name))), h('div', { class: 'si-hero small left' }, P.avatar()), kickerEl(P), h('div', { class: 'si-split-tag bottom' }, P.tag));
  },
  // Musical: Leuchtschrift mit Glühbirnen
  marquee(c, P) {
    return h('div', {}, h('div', { class: 'si-marquee' }, h('small', {}, P.kicker), h('b', { class: c.L.font }, P.name), h('span', {}, P.tag)), h('div', { class: 'si-hero small' }, P.avatar()));
  },
  // Wildnis: Bodycam
  bodycam(c, P) {
    const n = h('div', {}, h('div', { class: 'si-body' }, P.avatar()), camHud(c, P.kicker), h('div', { class: 'si-tape' }, h('b', {}, P.name)), extraEl(P), h('div', { class: 'si-quote' }, P.tag));
    tickTimecode(n, performance.now());
    return n;
  },
  // Wildnis: Polaroid mit Klebeband und Gegenständen
  polaroid(c, P) {
    const items = String(P.extra || '').split(/\s*[·,]\s*/).filter(Boolean);
    return h('div', {}, h('div', { class: 'si-polaroid' }, h('div', { class: 'ph' }, P.avatar()), h('b', {}, P.name), h('i', { class: 'tape' })), items.length ? h('div', { class: 'si-items' }, h('small', {}, P.extraLabel || ''), items.map((x) => h('span', {}, x))) : null, kickerEl(P), h('div', { class: 'si-quote' }, P.tag));
  },
  // Weltraum: Zielerfassung mit Telemetrie
  reticle(c, P) {
    return h('div', {}, h('div', { class: 'si-ret' }, h('div', { class: 'si-ret-av' }, P.avatar()), h('i', { class: 'r1' }), h('i', { class: 'r2' }), h('i', { class: 'x' })), h('div', { class: 'si-ret-data' }, h('small', {}, P.kicker), h('b', { class: c.L.font, style: { fontSize: P.fit(40, 10) } }, P.name), h('span', {}, P.tag), P.extra ? h('span', { class: 'call' }, `${P.extraLabel ? `${P.extraLabel}: ` : ''}${P.extra}`) : null, c.si.tx['hud.status'] ? h('em', {}, c.si.tx['hud.status']) : null));
  },
  // Weltraum: Missionsabzeichen
  patch(c, P) {
    return h('div', {}, h('div', { class: 'si-patch-wrap team' }, patchEl(c, P.name, P.extra || c.si.tx['cold.b'], '')), h('div', { class: 'si-patch-av' }, P.avatar()), kickerEl(P), plate(P, c.L));
  },
};

// ---------------------------------------------------------------------------------
// ALLE ZUSAMMEN
// ---------------------------------------------------------------------------------
export function allScene(c) {
  const { root, si, s, L, el } = c;
  c.voice(si.clips.all, si.tx['voice.all'], 0.4);
  c.jingle('all', null, 0.1);
  c.shake(0.1, true);
  root.classList.add('si-lit');
  root.append(h('div', { class: 'si-setslot' }, set(c, si.theme === 'wildnis' ? 'night' : (si.theme === 'weltraum' ? 'orbit' : 'open'))));
  root.append(h('div', { class: 'si-stage si-all' },
    h('div', { class: 'si-rays', 'aria-hidden': 'true' }),
    h('div', { class: 'si-logo-wrap small' }, logoEl(s.show.name, L)),
    h('div', { class: 'si-row' }, s.teams.map((t, i) => h('div', { class: 'si-mini', '--team': t.color, style: { animationDelay: `${0.25 + i * 0.12}s` } }, avatarOf(t), h('b', {}, t.name)))),
    h('div', { class: 'si-hosts' }, [s.show.host, s.show.coHost].filter(Boolean).join(' & ')),
    h('div', { class: `si-tagline ${L.font} si-metal-${L.metal}` }, si.tx.tagline)));
  c.fx((fx) => {
    fx.beams = 1; fx.beamColor = L.b; fx.ambient = { rate: 0.7 }; fx.beamFrom = 'both'; fx.beamN = 6;
    if (el < 1.2) later(0.1, () => {
      fx.cannon(-1, 120); fx.cannon(1, 120); fx.burst(140, 'spark', fx.w / 2, fx.h * 0.25, 1); fx.flare(fx.w / 2, fx.h * 0.2);
      if (si.theme !== 'wildnis') for (const x of [0.06, 0.2, 0.8, 0.94]) fx.fountain(fx.w * x, 3);
      if (si.theme === 'casino') fx.rain(120, 'coin');
      if (si.theme === 'wildnis') fx.fire = 0.8;
      if (si.theme === 'weltraum') { fx.warp = 0.8; later(2.5, () => { fx.warp = 0; }); }
    });
  });
}

