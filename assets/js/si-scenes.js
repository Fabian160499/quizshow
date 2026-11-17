// Show-Intro – Regie je Thema: Eröffnung (automatisch), Personen-Auftritte, Finale.
// Alle sichtbaren Texte kommen aus si.tx / si.teams / si.host (im Editor änderbar).

import { h, later, atTime, esc, frag, logoEl, avatarOf, nowEl } from './si-core.js';
import { mediaUrl } from './client.js';
import { MAPS } from './map-data.js';
const nowElSafe = () => nowEl(0);

export const THEME_LOOK = {
  voice: { a: '#ff1f6b', b: '#ff2d55', c: '#ffffff', d: '#3a0012', bg: '#060005', metal: 'chrome', font: 'si-display', parts: 'sparks' },
  bielefeld: { a: '#1565c0', b: '#ffffff', c: '#f5c400', d: '#0a0a0a', bg: '#05070d', metal: 'chrome', font: 'si-anton', parts: 'confetti' },
  musical: { a: '#e0193a', b: '#f5c542', c: '#fff1c9', d: '#7a0b18', bg: '#1a0306', metal: 'gold', font: 'si-playfair', parts: 'notes' },
  casino: { a: '#e8c35a', b: '#1f9d5b', c: '#d6243a', d: '#0b3d24', bg: '#03140b', metal: 'gold', font: 'si-cinzel', parts: 'cards' },
  wildnis: { a: '#c9c42c', b: '#e9e4cf', c: '#6d9a3a', d: '#1d3a1f', bg: '#08110a', metal: 'bronze', font: 'si-stencil', parts: 'embers' },
  weltraum: { a: '#4cc9ff', b: '#7fe3ff', c: '#ffffff', d: '#0b2a4a', bg: '#010307', metal: 'chrome', font: 'si-orbit', parts: 'stars' },
};
export const look = (theme) => THEME_LOOK[theme] || THEME_LOOK.bielefeld;
export const FONT = {
  'si-display': '900 100px "SI Display", system-ui, sans-serif', 'si-anton': '400 100px "SI Anton", "SI Display", sans-serif', 'si-playfair': '900 100px "SI Playfair", Georgia, serif',
  'si-cinzel': '800 100px "SI Cinzel", Georgia, serif', 'si-stencil': '900 100px "SI Stencil", "SI Display", sans-serif', 'si-cond': '800 100px "SI Cond", "SI Display", sans-serif', 'si-orbit': '400 100px "SI Orbit", "SI Display", sans-serif',
};

// Reihenfolge der Team-Auftritte je Thema: kein Team wird gleich vorgestellt.
const TEAM_LAYOUTS = {
  voice: ['teamchair', 'teamchair', 'teamchair', 'teamchair', 'teamchair', 'teamchair'],
  bielefeld: ['sign', 'scarf', 'split', 'type', 'spot', 'zoom'],
  musical: ['spot', 'card', 'marquee', 'split', 'type', 'zoom'],
  casino: ['card', 'slot', 'split', 'spot', 'type', 'zoom'],
  wildnis: ['stats', 'hexteam', 'bodycam', 'statsR', 'polaroid', 'hexteamR'],
  weltraum: ['reticle', 'patch', 'split', 'type', 'spot', 'zoom'],
};
const HOST_LAYOUT = { voice: 'allchairs', bielefeld: 'scarf', musical: 'stairs', casino: 'card', wildnis: 'bodycam', weltraum: 'patch' };
const COHOST_LAYOUT = { voice: 'allchairs', bielefeld: 'sign', musical: 'marquee', casino: 'split', wildnis: 'polaroid', weltraum: 'reticle' };

// ---------------------------------------------------------------------------------
// Bühnenbilder (bleiben über alle Phasen stehen)
// ---------------------------------------------------------------------------------
function set(c, mode) {
  const { si } = c;
  const th = si.theme;
  if (th === 'voice') return voiceSet(mode);
  if (th === 'bielefeld') return mode === 'city' ? cityPanorama() : stadiumSet(mode);
  if (th === 'musical') return h('div', { class: `si-set si-theatre ${mode === 'closed' ? 'closed' : 'open'}` }, h('div', { class: 'si-curtain' }, h('i'), h('i')), h('div', { class: 'si-pros' }), h('div', { class: 'si-foot' }, Array.from({ length: 13 }, () => h('i'))));
  if (th === 'casino') return h('div', { class: 'si-set si-felt' }, h('i', { class: 'si-felt-line' }), h('i', { class: 'si-felt-spot' }));
  if (th === 'wildnis') return wildSet(c, mode);
  if (th === 'weltraum') return spaceSet(c, mode);
  return h('div', { class: 'si-set' });
}

function cube(c, content, cls = '') {
  const faces = ['f', 'r', 'b', 'l'].map((k) => h('div', { class: `si-cube-face ${k}` }, k === 'f' ? content : (k === 'b' ? content.cloneNode(true) : logoEl(c.s.show.name, c.L, 'tiny'))));
  return h('div', { class: `si-cube ${cls}`.trim() }, h('div', { class: 'si-cube-in' }, faces));
}

function wildSet(c, mode) {
  const cv = h('canvas', { class: 'si-land', 'aria-hidden': 'true' });
  requestAnimationFrame(() => landscape(cv, c));
  return h('div', { class: `si-set si-wild ${mode || ''}`.trim() }, cv, h('div', { class: 'si-fog a' }), h('div', { class: 'si-fog b' }), hexDecor(), h('div', { class: 'si-letterbox t' }), h('div', { class: 'si-letterbox b' }));
}
// Sechsecke in Waldgrün/Oliv/Erdtönen mit Pinselkanten (Survival-Doku-Look)
const HEXES = [[2, 78, 9, 'g'], [9, 86, 6, 'o'], [-2, 60, 7, 'd'], [88, 80, 10, 'g'], [95, 64, 6, 'o'], [80, 90, 7, 'b'], [70, 6, 4, 'o'], [16, 8, 5, 'g'], [45, 92, 8, 'd'], [58, 86, 5, 'o']];
function hexDecor() {
  return h('div', { class: 'si-hexes', 'aria-hidden': 'true' }, HEXES.map(([x, y, w, k], i) => h('i', { class: `hx ${k}`, style: { left: `${x}vw`, top: `${y}vh`, width: `${w}vw`, animationDelay: `${i * 0.08}s` } })));
}
// Unregelmäßige Risskante (Klebeband/Pinsel), stabil je Text
export function tornClip(seed = 1) {
  let r = seed * 9301 + 49297; const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  const pts = [];
  for (let x = 0; x <= 100; x += 4) pts.push(`${x}% ${(rnd() * 9).toFixed(1)}%`);
  for (let y = 10; y <= 90; y += 16) pts.push(`${100 - rnd() * 3}% ${y}%`);
  for (let x = 100; x >= 0; x -= 4) pts.push(`${x}% ${(100 - rnd() * 9).toFixed(1)}%`);
  for (let y = 90; y >= 10; y -= 16) pts.push(`${rnd() * 3}% ${y}%`);
  return `polygon(${pts.join(',')})`;
}
function tornLabel(kicker, name, seed) {
  return h('div', { class: 'si-torn' }, h('div', { class: 'si-torn-hex', 'aria-hidden': 'true' }, h('i', { class: 'g' }), h('i', { class: 'o' }), h('i', { class: 'd' })),
    h('div', { class: 'si-torn-paper', style: { clipPath: tornClip(seed) } }, kicker ? h('small', {}, kicker) : null, h('b', {}, name)));
}
// Steckbrief: drei Werte + Skill-Ranking als Ladebalken (alles im Editor änderbar)
function statsEl(c, P, side = 'l') {
  const tx = c.si.tx; const t = P.stats || {};
  const row = (label, val, i) => (val ? h('div', { class: 'si-stat', style: { animationDelay: `calc(var(--hit) + ${0.5 + i * 0.18}s)` } }, h('small', {}, label), h('b', {}, val)) : null);
  const skill = Math.max(0, Math.min(100, Number(String(t.skill || '').replace(',', '.')) || 0));
  return h('div', { class: `si-stats ${side}` },
    row(tx['stat.1'], t.s1, 0), row(tx['stat.2'], t.s2, 1), row(tx['stat.3'], t.s3, 2),
    t.skill !== undefined && t.skill !== '' ? h('div', { class: 'si-stat skill', style: { animationDelay: 'calc(var(--hit) + 1.04s)' } }, h('small', {}, tx['stat.skill']), h('i', { class: 'si-skill' }, h('b', { '--w': `${skill}%` }))) : null);
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
    const wild = cv.closest('.si-wild');
    const night = wild && wild.classList.contains('night');
    const mist = wild && wild.classList.contains('mist');
    const sky = g.createLinearGradient(0, 0, 0, H);
    if (night) { sky.addColorStop(0, '#04070c'); sky.addColorStop(1, '#141a12'); } else if (mist) { sky.addColorStop(0, '#4e5a61'); sky.addColorStop(0.6, '#8c979a'); sky.addColorStop(1, '#a9b2b1'); } else { sky.addColorStop(0, '#1b3340'); sky.addColorStop(0.55, '#c9895a'); sky.addColorStop(1, '#f2b26b'); }
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    if (!night && !mist) { const sg = g.createRadialGradient(W * 0.68, H * 0.55, 0, W * 0.68, H * 0.55, H * 0.6); sg.addColorStop(0, 'rgba(255,220,160,.9)'); sg.addColorStop(0.15, 'rgba(255,170,90,.35)'); sg.addColorStop(1, 'rgba(255,140,60,0)'); g.fillStyle = sg; g.fillRect(0, 0, W, H); }
    const layers = 6;
    for (let k = 0; k < layers; k++) {
      const depth = (k + 1) / layers; const speed = 30 + depth * depth * 260; const off = t * speed;
      const base = H * (0.45 + depth * 0.42);
      const col = night ? `rgb(${8 + k * 3},${12 + k * 4},${10 + k * 3})` : mist ? `rgb(${Math.round(70 - k * 10)},${Math.round(84 - k * 11)},${Math.round(80 - k * 11)})` : `rgb(${Math.round(70 - k * 11)},${Math.round(78 - k * 10)},${Math.round(80 - k * 12)})`;
      g.fillStyle = col; g.beginPath(); g.moveTo(0, H);
      for (let x = 0; x <= W; x += 6) g.lineTo(x, base - ridge(x + off, k + 1) * (0.6 + depth) * (H / 600));
      g.lineTo(W, H); g.fill();
      if (k > 2) { // Baumspitzen
        g.fillStyle = col;
        for (let x = -((off * 1.0) % 14); x < W; x += 14) { const y = base - ridge(x + off, k + 1) * (0.6 + depth) * (H / 600); const th = 10 + depth * 26; g.beginPath(); g.moveTo(x - th * 0.25, y + 4); g.lineTo(x, y - th); g.lineTo(x + th * 0.25, y + 4); g.fill(); }
      }
      const fog = g.createLinearGradient(0, base - 60, 0, base + 40);
      fog.addColorStop(0, 'rgba(230,220,210,0)'); fog.addColorStop(1, night ? 'rgba(20,24,20,.25)' : mist ? 'rgba(220,226,226,.35)' : 'rgba(240,215,190,.18)');
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

// ---- Weltraum: Missionskontrolle im Dashboard-Look (holografischer Globus, Glas-Panels) ----
function spaceSet(c, mode) {
  const g = globe(c);
  const el = h('div', { class: `si-set si-space ${mode || ''}`.trim() }, h('div', { class: 'si-stars' }), h('div', { class: 'si-stars two' }), g, h('div', { class: 'si-glare l' }), h('div', { class: 'si-glare r' }));
  if (mode === 'orbit') { g.api.zoom = 1.3; g.api.oy = 1.05; }
  el.globe = g.api;
  return el;
}
// Holografischer Globus: echte Kontinente (Natural Earth) aus feinen Lichtpunkten, Stadtlichter,
// leuchtende Atmosphärenkante mit Gegenlicht, Zielringe mit Pulsen und Radarstrahl.
let GLOBE_PTS = null;
function globePoints() {
  if (GLOBE_PTS) return GLOBE_PTS;
  const m = MAPS.Welt;
  const off = document.createElement('canvas'); off.width = m.width; off.height = m.height;
  const og = off.getContext('2d'); og.fillStyle = '#fff';
  for (const d of m.paths) { try { og.fill(new Path2D(d)); } catch { /* alter Browser */ } }
  const img = og.getImageData(0, 0, m.width, m.height).data;
  const isLand = (lat, lon) => {
    let L = lon * 180 / Math.PI; if (L < m.lonMin) L += 360; if (L > m.lonMax) L -= 360;
    const la = lat * 180 / Math.PI; if (la < m.latMin || la > m.latMax) return la < -60; // Antarktis andeuten
    const x = Math.floor((L - m.lonMin) / (m.lonMax - m.lonMin) * m.width); const y = Math.floor((m.latMax - la) / (m.latMax - m.latMin) * m.height);
    return img[(y * m.width + x) * 4 + 3] > 100;
  };
  const N = 26000; const pts = [];
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2; const r = Math.sqrt(1 - y * y); const phi = i * 2.399963;
    const lat = Math.asin(y); const lon = Math.atan2(Math.sin(phi) * r, Math.cos(phi) * r);
    const land = isLand(lat, lon);
    if (!land && i % 3) continue; // Ozean nur angedeutet
    const city = land && Math.random() < 0.035;
    pts.push([lat, lon, land, city]);
  }
  GLOBE_PTS = pts;
  return pts;
}
function globe() {
  const cv = h('canvas', { class: 'si-globe', 'aria-hidden': 'true' });
  const api = { targets: [], radar: -1, zoom: 1, ox: 0.5, oy: 0.56 };
  cv.api = api;
  let pts = null;
  let rot = -0.6; let last = performance.now();
  const draw = (now) => {
    if (!cv.isConnected) { if (cv.__started) return; requestAnimationFrame(draw); return; }
    cv.__started = true;
    if (!pts) pts = globePoints();
    const rect = cv.getBoundingClientRect(); const d = Math.min(2, devicePixelRatio || 1);
    if (cv.width !== Math.round(rect.width * d)) { cv.width = Math.round(rect.width * d); cv.height = Math.round(rect.height * d); }
    const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0);
    const W = rect.width; const H = rect.height; const dt = Math.min(0.1, (now - last) / 1000); last = now; rot += dt * 0.06;
    g.clearRect(0, 0, W, H);
    const cx = W * api.ox; const cy = H * api.oy; const R = H * 0.44 * api.zoom; const tilt = 0.32;
    // Atmosphäre (Halo) + Körper mit Tag/Nacht-Verlauf
    const atm = g.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.28); atm.addColorStop(0, 'rgba(70,180,255,.55)'); atm.addColorStop(0.25, 'rgba(40,140,255,.18)'); atm.addColorStop(1, 'rgba(0,40,120,0)');
    g.fillStyle = atm; g.fillRect(0, 0, W, H);
    const body = g.createRadialGradient(cx - R * 0.45, cy - R * 0.35, R * 0.05, cx, cy, R * 1.02); body.addColorStop(0, '#123a66'); body.addColorStop(0.55, '#061a33'); body.addColorStop(1, '#01060f');
    g.fillStyle = body; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
    const proj = (lat, lon) => { const l2 = lon + rot; const X = Math.cos(lat) * Math.sin(l2); const Z = Math.cos(lat) * Math.cos(l2); const Y = Math.sin(lat); const Y2 = Y * Math.cos(tilt) - Z * Math.sin(tilt); const Z2 = Y * Math.sin(tilt) + Z * Math.cos(tilt); return [cx + X * R, cy - Y2 * R, Z2, X]; };
    g.globalCompositeOperation = 'lighter';
    const dot = Math.max(1, R / 300);
    for (const [lat, lon, land, city] of pts) {
      const [x, y, z, X] = proj(lat, lon); if (z < 0.02) continue;
      const lit = 0.35 + 0.65 * Math.max(0, 0.6 - X * 0.6 + (1 - z) * 0.2); // links heller (Gegenlicht)
      if (land) {
        const a = Math.min(1, (0.25 + 0.75 * z) * lit);
        g.fillStyle = `rgba(${Math.round(120 + 100 * lit)},${Math.round(200 + 50 * lit)},255,${a.toFixed(2)})`;
        g.fillRect(x - dot / 2, y - dot / 2, dot, dot);
        if (city) { g.fillStyle = `rgba(200,245,255,${(0.6 * z).toFixed(2)})`; g.fillRect(x - dot, y - dot, dot * 2, dot * 2); }
      } else {
        g.fillStyle = `rgba(60,130,210,${(0.12 * z).toFixed(2)})`; g.fillRect(x - dot / 2, y - dot / 2, dot * 0.8, dot * 0.8);
      }
    }
    // leuchtende Kante, links stärker
    const rim = g.createLinearGradient(cx - R, cy, cx + R, cy); rim.addColorStop(0, 'rgba(170,235,255,.95)'); rim.addColorStop(0.5, 'rgba(90,190,255,.35)'); rim.addColorStop(1, 'rgba(90,190,255,.15)');
    g.strokeStyle = rim; g.lineWidth = Math.max(1.5, R / 160); g.beginPath(); g.arc(cx, cy, R, 0, 7); g.stroke();
    const inner = g.createRadialGradient(cx, cy, R * 0.82, cx, cy, R); inner.addColorStop(0, 'rgba(80,190,255,0)'); inner.addColorStop(1, 'rgba(80,190,255,.28)');
    g.fillStyle = inner; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
    const t = now / 1000;
    api.targets.forEach((tg, i) => {
      const [x, y, z] = proj(tg.lat, tg.lon); if (z < 0.08) return;
      const age = (now - tg.t0) / 1000; const pop = Math.max(0.01, Math.min(1, age * 3));
      for (let k = 0; k < 3; k++) { const ph = ((t * 0.6 + k / 3) % 1); g.strokeStyle = hexToRgba(tg.col, (1 - ph) * 0.9 * z); g.lineWidth = 1.6; g.beginPath(); g.arc(x, y, (R * 0.03 + ph * R * 0.11) * pop, 0, 7); g.stroke(); }
      g.strokeStyle = hexToRgba(tg.col, 0.9 * z); g.lineWidth = 2; g.beginPath(); g.arc(x, y, R * 0.045 * pop, 0, 7); g.stroke();
      const gl = g.createRadialGradient(x, y, 0, x, y, R * 0.04); gl.addColorStop(0, '#ffffff'); gl.addColorStop(0.35, tg.col); gl.addColorStop(1, hexToRgba(tg.col, 0)); g.fillStyle = gl; g.beginPath(); g.arc(x, y, R * 0.04 * pop, 0, 7); g.fill();
      if (api.radar === i) { const ang = -0.15 + Math.sin(t * 0.6) * 0.35; const len = R * 0.75; const gr = g.createLinearGradient(x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len); gr.addColorStop(0, 'rgba(110,230,255,.65)'); gr.addColorStop(1, 'rgba(110,230,255,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ang - 0.2) * len, y + Math.sin(ang - 0.2) * len); g.lineTo(x + Math.cos(ang + 0.2) * len, y + Math.sin(ang + 0.2) * len); g.closePath(); g.fill(); }
    });
    // Gegenlicht-Blendung an der linken Kante
    const fx = cx - R * 0.93; const fy = cy + R * 0.12;
    const fl = g.createRadialGradient(fx, fy, 0, fx, fy, R * 0.35); fl.addColorStop(0, 'rgba(255,255,255,.95)'); fl.addColorStop(0.08, 'rgba(200,240,255,.6)'); fl.addColorStop(1, 'rgba(80,180,255,0)');
    g.fillStyle = fl; g.fillRect(fx - R * 0.35, fy - R * 0.35, R * 0.7, R * 0.7);
    const st = g.createLinearGradient(fx - R * 0.6, fy, fx + R * 0.6, fy); st.addColorStop(0, 'rgba(160,230,255,0)'); st.addColorStop(0.5, 'rgba(220,250,255,.55)'); st.addColorStop(1, 'rgba(160,230,255,0)');
    g.fillStyle = st; g.fillRect(fx - R * 0.6, fy - 1.5, R * 1.2, 3);
    g.globalCompositeOperation = 'source-over';
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
  return cv;
}
function hexToRgba(hex, a) { const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '') || [0, '66', 'dd', 'ff']; return `rgba(${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)},${Math.max(0, Math.min(1, a)).toFixed(3)})`; }
const DEG = Math.PI / 180;
const GLOBE_SPOTS = [[52 * DEG, 8.5 * DEG], [40 * DEG, -74 * DEG], [-23 * DEG, -46 * DEG], [35 * DEG, 139 * DEG], [-33 * DEG, 18 * DEG], [28 * DEG, 77 * DEG], [55 * DEG, 37 * DEG], [-34 * DEG, 151 * DEG]];
// Dashboard: Kopfleiste mit Menü-Pills, Glas-Panels (Crews, Flugplan, Telemetrie, Go/No-Go)
function dashboard(c) {
  const { si, s } = c;
  const tx = si.tx;
  const navItems = String(tx['hud.nav'] || '').split(/\s*·\s*/).filter(Boolean);
  const nav = h('nav', { class: 'si-dnav' }, navItems.map((x) => h('span', {}, x)));
  const met = h('b', { class: 'met' }, 'T–00:00:00');
  const top = h('div', { class: 'si-dtop' }, h('b', { class: 'si-dlogo' }, s.show.name), nav, h('div', { class: 'si-dmet' }, h('small', {}, tx['cold.b']), met));
  const card = (cls, title, ...body) => h('section', { class: `si-dcard ${cls}` }, h('header', {}, h('span', {}, title), h('i', { class: 'arr' }, '↗')), ...body);
  const bars = si.teams.map((t, i) => h('div', { class: 'si-dbar', '--col': (s.teams[i] || {}).color || '#4cc9ff' }, h('i'), h('small', {}, (s.teams[i] || {}).name || '')));
  const count = h('b', { class: 'si-dbig' }, '0');
  const crews = card('crews', tx['hud.crews'], h('div', { class: 'si-dnum' }, count, h('small', {}, `/ ${si.teams.length}`)), h('div', { class: 'si-dbars' }, bars));
  const chips = si.games.slice(0, 8).map((g, i) => h('li', {}, h('em', {}, `${String(i + 1).padStart(2, '0')}`), h('span', {}, g.title)));
  const plan = card('plan', tx['teaser.head'], h('ol', { class: 'si-dchips' }, chips));
  const telRows = String(tx['hud.tel'] || '').split(/\s*·\s*/).filter(Boolean).map((k) => h('li', {}, h('span', {}, k), h('i', {}, h('b')), h('em', { 'data-tel': k }, '0')));
  const tel = card('tel', tx['hud.telTitle'], h('ul', { class: 'si-dtel' }, telRows));
  const rows = si.teams.map((t) => h('li', {}, h('span', {}, t.row), h('b', {}, tx['poll.go'])));
  const poll = card('poll', tx['poll.title'], h('ol', { class: 'si-dpoll' }, rows), h('p', { class: 'si-ddone' }, tx['poll.done']));
  const root = h('div', { class: 'si-dash boot' }, top, crews, plan, tel, poll);
  const t0 = run_t0();
  const iv = setInterval(() => {
    if (!root.isConnected) { clearInterval(iv); return; }
    const el = (performance.now() - t0) / 1000; const left = si.tl.boom - el;
    const a = Math.abs(left); met.textContent = `T${left >= 0 ? '–' : '+'}00:${String(Math.floor(a / 60)).padStart(2, '0')}:${String(Math.floor(a % 60)).padStart(2, '0')}`;
    telRows.forEach((r, i) => { const v = 0.5 + 0.45 * Math.sin(el * (0.7 + i * 0.3) + i); r.querySelector('i b').style.width = `${(v * 100).toFixed(0)}%`; r.querySelector('em').textContent = String(Math.floor(v * 9000 + i * 137)); });
  }, 120);
  return {
    root,
    nav(i) { [...nav.children].forEach((e, k) => e.classList.toggle('on', k === i)); },
    go(i) { rows[i]?.classList.add('go'); bars[i]?.classList.add('on'); count.textContent = String(i + 1); },
    done() { poll.classList.add('done'); },
    chip(i) { chips[i]?.classList.add('on'); },
  };
}
function run_t0() { return performance.now() - nowElSafe() * 1000; }
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
  // Mit Aufnahme: ein Clip für alle Zeilen. Ohne: Browser-Stimme Zeile für Zeile, im Takt der Anzeige
  // (lange Browser-Ansagen brechen in Chrome mittendrin ab).
  if (si.clips.lines) c.voice(si.clips.lines, si.lines.join(' … '), tl.lines);
  else si.lines.forEach((line, i) => c.voice(null, line, tl.lines + i * tl.line));
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
  const img = si.dropImage ? h('img', { class: 'si-dropimg', alt: '' }) : null;
  if (img) mediaUrl(si.dropImage.id).then((u) => { if (u) img.src = u; });
  const wrap = h('div', { class: 'si-logo-wrap' }, img, si.tx['drop.big'] ? h('div', { class: `si-bigword ${L.font}` }, si.tx['drop.big']) : null, logoEl(s.show.name, L), si.tx['drop.sub'] ? h('div', { class: 'si-sub' }, si.tx['drop.sub']) : null);
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
  ({ voice: autoVoice, bielefeld: autoBielefeld, musical: autoMusical, casino: autoCasino, wildnis: autoWild, weltraum: autoSpace })[c.si.theme in THEME_LOOK ? c.si.theme : 'bielefeld'](c);
}

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
  const sp = set(c, 'dark');
  bg.replaceChildren(sp);
  const D = dashboard(c);
  over.replaceChildren(D.root);
  D.nav(0);
  sound('static', 0.1, el, 0.6);
  sound('quindar', 0.3, el, true);
  c.voice(si.clips.cold, si.tx['voice.cold'], 0.6);
  at(0.6, () => { if (el < tl.poll) stage.replaceChildren(h('div', { class: 'si-dpill' }, h('small', {}, si.tx['cold.kicker']), h('b', {}, si.tx['cold.present']))); });
  // Go/No-Go-Abfrage: jedes Team meldet „GO“ (auch auf seinem iPad), sein Zielpunkt leuchtet auf dem Globus
  const teams = si.teams;
  const pollStep = Math.min(0.9, (tl.teaser - tl.poll - 1.4) / Math.max(1, teams.length));
  at(tl.poll, () => { D.nav(1); if (el < tl.teaser) stage.replaceChildren(); });
  teams.forEach((_, i) => {
    const tt = tl.poll + 0.5 + i * pollStep;
    sound('quindar', tt - 0.02, el, i % 2 === 0); sound('beep', tt + 0.25, el, 880);
    at(tt, () => { D.go(i); const [lat, lon] = GLOBE_SPOTS[i % GLOBE_SPOTS.length]; sp.globe.targets.push({ lat, lon, col: (s.teams[i] || {}).color || '#4cc9ff', t0: performance.now() }); });
  });
  at(tl.poll + 0.6 + teams.length * pollStep, () => D.done());
  // Flugplan
  at(tl.teaser, () => { D.nav(2); sp.globe.radar = 0; });
  si.games.slice(0, 8).forEach((_, i) => { const tt = tl.teaser + 0.4 + i * ((tl.count - tl.teaser - 0.8) / Math.max(1, Math.min(8, si.games.length))); sound('beep', tt, el, 1400); at(tt, () => D.chip(i)); });
  // Countdown T–10 mit Zündung
  c.voice(si.clips.count, si.tx['voice.count'], tl.count + 0.1);
  at(tl.count, () => { D.nav(3); root.classList.add('si-counting'); });
  countdown(c, stage, 10, tl.count, boom, 'tminus');
  at(boom - 6, () => root.classList.add('si-ignite'));
  // LIFTOFF
  c.shake(boom, true); sound('hit', boom, el);
  at(boom, () => {
    D.nav(4);
    root.classList.remove('si-ignite', 'si-counting'); root.classList.add('si-lit', 'si-liftoff');
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
    root.classList.remove('si-liftoff'); root.classList.add('si-orbitview');
    sp.globe.zoom = 1.25; sp.globe.oy = 0.95; sp.globe.radar = -1;
    stage.replaceChildren(h('div', { class: 'si-patch-wrap' }, patchEl(c, s.show.name, si.tx['cold.b'], '')), h('div', { class: 'si-logo-wrap patch' }, logoEl(s.show.name, L), si.tx['drop.sub'] ? h('div', { class: 'si-sub' }, si.tx['drop.sub']) : null));
    c.fx((fx) => { fx.flare(fx.w * 0.8, fx.h * 0.25); fx.warp = 0.6; later(2, () => { fx.warp = 0; }); fx.ambient = { rate: 0.4 }; });
  });
  linesAndHold(c, stage);
}


// ---------------------------------------------------------------------------------
// BIELEFELD: Ortsschild, Panorama Teuto → Sparrenburg → Altstadt → Jahnplatz, Stadion
// (eigene Zeichnungen; keine Vereinswappen – nur Farben Schwarz-Weiß-Blau)
// ---------------------------------------------------------------------------------
function ortsschild(name, sub = '') {
  return h('div', { class: 'si-ortsschild' }, sub ? h('small', {}, sub) : null, h('b', {}, name));
}
function streetSign(text) { return h('div', { class: 'si-street' }, h('b', {}, text)); }
function hillPath(x0, x1, base, amp, seed, step = 40) {
  let d = `M${x0},900 L${x0},${base}`;
  for (let x = x0; x <= x1; x += step) d += ` L${x},${(base - amp * (0.55 + 0.45 * Math.sin(x * 0.004 * seed + seed) * Math.cos(x * 0.0017 + seed))).toFixed(1)}`;
  return `${d} L${x1},900 Z`;
}
function trees(x0, x1, yFn, col, size = 26, gap = 18) {
  let out = '';
  for (let x = x0; x < x1; x += gap) { const y = yFn(x); const s = size * (0.7 + ((x * 7) % 10) / 20); out += `<path d="M${x - s * 0.35},${y + 4} L${x},${y - s} L${x + s * 0.35},${y + 4} Z" fill="${col}"/>`; }
  return out;
}
function fachwerk(x, y, w, hgt, roof, wall = '#f3ece0') {
  let beams = '';
  for (let k = 1; k < 4; k++) beams += `<rect x="${x + (w / 4) * k - 3}" y="${y}" width="6" height="${hgt}" fill="#3b2a1e"/>`;
  beams += `<rect x="${x}" y="${y + hgt / 2 - 3}" width="${w}" height="6" fill="#3b2a1e"/><path d="M${x},${y + hgt / 2} L${x + w / 4},${y}" stroke="#3b2a1e" stroke-width="5"/><path d="M${x + w},${y + hgt / 2} L${x + w * 3 / 4},${y}" stroke="#3b2a1e" stroke-width="5"/>`;
  let win = '';
  for (let k = 0; k < 3; k++) win += `<rect x="${x + 14 + k * (w - 28) / 3}" y="${y + hgt * 0.62}" width="${(w - 40) / 4}" height="${hgt * 0.22}" fill="#6f8fb0"/>`;
  return `<rect x="${x}" y="${y}" width="${w}" height="${hgt}" fill="${wall}"/>${beams}${win}<path d="M${x - 8},${y} L${x + w / 2},${y - roof} L${x + w + 8},${y} Z" fill="#8c3b2a"/>`;
}
// Sparrenburg nach Foto: runder Sandsteinturm mit Zinnenkranz, Galerie-Ring, Sparren-Fahne, Haus mit rotem Dach
function sparrenburg() {
  const merlons = Array.from({ length: 7 }, (_, k) => `<rect x="${-56 + k * 17}" y="236" width="11" height="20" fill="url(#bstone)"/>`).join('');
  const corbel = (y, w) => Array.from({ length: Math.round(w / 8) }, (_, k) => `<rect x="${-w / 2 + k * 8 + 1}" y="${y}" width="5" height="7" fill="#9c8a6a"/>`).join('');
  const courses = Array.from({ length: 22 }, (_, k) => `<path d="M-46,${290 + k * 14} L46,${290 + k * 14}" stroke="rgba(120,100,70,.25)" stroke-width="1.5"/>`).join('');
  return `<g transform="translate(1180 0)">
    <path d="M-300,900 L-300,640 Q-60,520 300,620 L300,900 Z" fill="#4e7148"/>
    <path d="M-230,640 L-170,600 L210,600 L250,640 L230,690 L-210,690 Z" fill="#cbb894"/><path d="M-230,640 L250,640" stroke="#a8956f" stroke-width="4"/>
    ${Array.from({ length: 4 }, (_, k) => `<path d="M-215,${652 + k * 9} L235,${652 + k * 9}" stroke="rgba(120,100,70,.25)" stroke-width="1.5"/>`).join('')}
    <rect x="60" y="470" width="150" height="132" fill="#d9c9a6"/><path d="M50,472 L135,400 L220,472 Z" fill="#a8452e"/><path d="M120,436 L150,436 L150,452 L120,452 Z" fill="#e8e1d2"/>
    ${[[78, 500], [120, 500], [162, 500], [78, 548], [162, 548]].map(([x, y]) => `<rect x="${x}" y="${y}" width="22" height="30" fill="#f2efe6" stroke="#8a7656" stroke-width="2"/>`).join('')}
    <rect x="-46" y="262" width="92" height="340" fill="url(#bstone)"/>${courses}
    <rect x="-58" y="516" width="116" height="14" fill="url(#bstone)"/>${corbel(530, 116)}
    <rect x="-56" y="248" width="112" height="16" fill="url(#bstone)"/>${corbel(264, 112)}${merlons}
    ${[330, 395, 455].map((y) => `<path d="M-6,${y + 22} L-6,${y + 6} Q0,${y - 2} 6,${y + 6} L6,${y + 22} Z" fill="#5b4a37"/>`).join('')}
    <path d="M-40,602 Q-20,560 -30,520 Q-10,560 0,602 Z" fill="#4b6b3a" opacity=".85"/>
    <rect x="-1.5" y="150" width="3" height="100" fill="#555"/><circle cx="0" cy="148" r="4" fill="#b8a050"/>
    <g transform="translate(2 158)"><rect width="64" height="40" fill="#fff"/><path d="M0,10 L32,24 L64,10 L64,20 L32,34 L0,20 Z M0,-4 L32,10 L64,-4 L64,6 L32,20 L0,6 Z" fill="#c8323a"/><path d="M0,34 L32,48 L64,34 L64,40 L0,40 Z" fill="#c8323a" opacity=".9"/></g>
  </g>`;
}
// Altes Rathaus nach Foto: Sandstein, zwei Ziergiebel (links mit Uhr), Arkaden, grüner Erker; Theater daneben
function rathaus() {
  const win = (x, y, w, hh) => `<rect x="${x}" y="${y}" width="${w}" height="${hh}" fill="#7f97ad"/><path d="M${x + w / 2},${y} L${x + w / 2},${y + hh} M${x},${y + hh * 0.4} L${x + w},${y + hh * 0.4}" stroke="#efe6d2" stroke-width="3"/>`;
  const gable = (x0, w, top) => { const steps = 4; let d = `M${x0},470`; for (let k = 0; k < steps; k++) { const y = 470 - ((470 - top) / steps) * (k + 1); d += ` L${x0 + (w / 2 / steps) * k + 6},${y + 18} L${x0 + (w / 2 / steps) * k + 6},${y} L${x0 + (w / 2 / steps) * (k + 1)},${y}`; } d += ` L${x0 + w / 2},${top - 20}`; for (let k = steps - 1; k >= 0; k--) { const y = 470 - ((470 - top) / steps) * (k + 1); d += ` L${x0 + w - (w / 2 / steps) * (k + 1)},${y} L${x0 + w - (w / 2 / steps) * k - 6},${y} L${x0 + w - (w / 2 / steps) * k - 6},${y + 18}`; } return `${d} L${x0 + w},470 Z`; };
  return `<g transform="translate(2050 0)">
    <path d="M-170,470 L-20,400 L70,400 L220,470 Z" fill="#a8452e"/>
    <rect x="-180" y="470" width="410" height="430" fill="url(#bsand)"/>
    <path d="${gable(-180, 160, 250)}" fill="url(#bsand)"/><path d="${gable(70, 150, 300)}" fill="url(#bsand)"/>
    <rect x="-102" y="190" width="4" height="40" fill="#8a7656"/><rect x="143" y="242" width="4" height="40" fill="#8a7656"/>
    <circle cx="-100" cy="350" r="22" fill="#efe6d2" stroke="#6e5a3e" stroke-width="5"/><path d="M-100,350 L-100,336 M-100,350 L-90,356" stroke="#3a2f22" stroke-width="3"/>
    ${win(-160, 395, 26, 40)}${win(-114, 395, 26, 40)}${win(-68, 395, 26, 40)}${win(120, 360, 28, 42)}
    ${[-165, -120, -75, 0, 45, 100, 150, 195].map((x) => win(x, 510, 30, 60) + win(x, 610, 30, 60)).join('')}
    ${[-165, -125, -85, -45].map((x) => `<path d="M${x},900 L${x},820 Q${x + 17},790 ${x + 34},820 L${x + 34},900 Z" fill="#4c3d2c"/>`).join('')}
    <rect x="-176" y="790" width="160" height="10" fill="#bfa77c"/><rect x="-180" y="700" width="410" height="8" fill="#bfa77c"/>
    <path d="M12,600 L50,600 L50,680 L31,700 L12,680 Z" fill="#79a596"/><path d="M12,600 Q31,575 50,600 Z" fill="#5f8a7c"/>
    <path d="M170,800 L170,900 L220,900 L220,800 Q195,770 170,800 Z" fill="#4c3d2c"/>
    <rect x="232" y="560" width="70" height="340" fill="url(#bsand)"/><path d="M228,560 L267,500 L306,560 Z" fill="#79a596"/>
  </g>
  <g transform="translate(2420 0)"><rect x="-70" y="520" width="150" height="380" fill="#d9c7a6"/><path d="M-70,520 Q5,430 80,520 Z" fill="#c4b08c"/><path d="M-30,470 Q5,400 40,470 Z" fill="#79a596"/>${Array.from({ length: 3 }, (_, k) => `<rect x="${-50 + k * 45}" y="580" width="26" height="80" rx="13" fill="#7f97ad"/>`).join('')}<rect x="-55" y="720" width="120" height="16" fill="#b39d78"/>${Array.from({ length: 4 }, (_, k) => `<rect x="${-48 + k * 34}" y="736" width="12" height="164" fill="#c4b08c"/>`).join('')}</g>
  <rect x="2302" y="600" width="50" height="34" fill="#c9b38a"/>`;
}
// Alter Markt nach Foto: weißes Giebelhaus, Renaissance-Ziergiebel (Sandstein), gelbes Giebelhaus
function altmarkt() {
  const win = (x, y) => `<rect x="${x}" y="${y}" width="18" height="30" fill="#7f97ad" stroke="#f3eee2" stroke-width="2"/>`;
  const rows = (x0, n, y0, rowsN, gap = 30) => Array.from({ length: rowsN }, (_, r) => Array.from({ length: n }, (_, k) => win(x0 + k * gap, y0 + r * 62)).join('')).join('');
  return `<g>
    <rect x="1560" y="560" width="110" height="340" fill="#f1ede6"/><path d="M1552,560 L1615,440 L1678,560 Z" fill="#b5503a"/><path d="M1575,560 L1615,470 L1655,560 Z" fill="#f1ede6"/>${rows(1575, 3, 590, 4)}
    <rect x="1670" y="520" width="130" height="380" fill="url(#bsand)"/>
    <path d="M1670,520 L1670,480 L1688,480 L1688,450 L1706,450 L1706,420 L1724,420 L1724,390 L1746,390 L1746,420 L1764,420 L1764,450 L1782,450 L1782,480 L1800,480 L1800,520 Z" fill="url(#bsand)"/><path d="M1735,390 L1735,360" stroke="#8a7656" stroke-width="4"/><circle cx="1735" cy="356" r="6" fill="#8a7656"/>
    ${[[1690, 470], [1780, 470], [1708, 440], [1762, 440]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="6" fill="#bfa77c"/>`).join('')}${rows(1684, 4, 545, 5, 27)}
    <rect x="1800" y="540" width="130" height="360" fill="#ecd98f"/><path d="M1792,540 L1865,410 L1938,540 Z" fill="#ecd98f"/><path d="M1792,540 L1865,410 L1938,540" fill="none" stroke="#9c7f45" stroke-width="5"/><path d="M1865,410 L1880,404 L1940,540 L1930,540 Z" fill="#b5503a"/>${win(1856, 470)}${rows(1818, 3, 570, 4, 34)}
  </g>`;
}
function cityPanorama() {
  const W = 3600;
  const far = hillPath(0, W, 520, 120, 1.3);
  const near = hillPath(0, 1500, 640, 150, 2.1);
  const nearY = (x) => 640 - 150 * (0.55 + 0.45 * Math.sin(x * 0.004 * 2.1 + 2.1) * Math.cos(x * 0.0017 + 2.1));
  const tower = `<g transform="translate(420 ${nearY(420) - 4})"><rect x="-7" y="-330" width="14" height="330" fill="#d9dde3"/><rect x="-26" y="-250" width="52" height="34" rx="6" fill="#e9edf2"/><rect x="-22" y="-244" width="44" height="8" fill="#9aa7b4"/><rect x="-2" y="-420" width="4" height="95" fill="#c43c3c"/><circle cx="0" cy="-422" r="5" fill="#ff4a4a"/></g>`;
  const blocks = [[2860, 420, 160], [3030, 360, 130], [3170, 450, 170], [3350, 390, 150], [3510, 470, 120]].map(([x, y, w], i) => `<rect x="${x}" y="${y}" width="${w}" height="${900 - y}" fill="${['#8a96a3', '#9fa9b3', '#7d8a97', '#a7b0b9', '#8f9aa6'][i]}"/>${Array.from({ length: Math.floor((900 - y) / 60) }, (_, r) => `<rect x="${x + 12}" y="${y + 20 + r * 60}" width="${w - 24}" height="26" fill="#c7d6e3" opacity=".7"/>`).join('')}`).join('');
  const stop = `<path d="M2900,700 L3400,690 L3400,705 L2900,716 Z" fill="#e8edf2"/><rect x="2920" y="712" width="8" height="120" fill="#5c6670"/><rect x="3370" y="704" width="8" height="128" fill="#5c6670"/>`;
  const tram = `<g class="si-tram"><rect x="2950" y="760" width="420" height="96" rx="18" fill="#f4f6f8"/><rect x="2950" y="826" width="420" height="20" fill="#1565c0"/>${Array.from({ length: 6 }, (_, k) => `<rect x="${2975 + k * 64}" y="775" width="46" height="38" rx="6" fill="#26394f"/>`).join('')}<rect x="3150" y="740" width="4" height="22" fill="#333"/></g>`;
  const ground = `<rect x="0" y="852" width="${W}" height="48" fill="#5f6a5c"/><rect x="1500" y="852" width="${W - 1500}" height="48" fill="#b9b1a3"/><rect x="0" y="852" width="${W}" height="5" fill="#3f4a3d"/>`;
  const svg = `<svg viewBox="0 0 ${W} 900" preserveAspectRatio="xMinYMid slice" aria-hidden="true"><defs><linearGradient id="bisky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3f86d8"/><stop offset=".65" stop-color="#9cc6ef"/><stop offset="1" stop-color="#e9eef2"/></linearGradient>
    <linearGradient id="bstone" x1="0" x2="1"><stop offset="0" stop-color="#efe5cc"/><stop offset=".45" stop-color="#d9c9a4"/><stop offset="1" stop-color="#a99674"/></linearGradient>
    <linearGradient id="bsand" x1="0" x2="1"><stop offset="0" stop-color="#d8c296"/><stop offset="1" stop-color="#c2a878"/></linearGradient></defs>
    <rect width="${W}" height="900" fill="url(#bisky)"/><path d="${far}" fill="#8aa585"/>${trees(0, W, (x) => 520 - 120 * (0.55 + 0.45 * Math.sin(x * 0.004 * 1.3 + 1.3) * Math.cos(x * 0.0017 + 1.3)), '#7a9875', 18, 14)}
    <path d="${near}" fill="#4f7350"/>${trees(0, 1500, nearY, '#3f6142', 30, 20)}${tower}${sparrenburg()}${altmarkt()}${rathaus()}${blocks}${stop}${tram}${ground}</svg>`;
  return h('div', { class: 'si-set si-city' }, frag(svg, 'si-pano'), h('div', { class: 'si-city-haze' }));
}
// Die Alm von oben (Anflug): weißes Dach rundum, blaue Fassade, grüner Rasen
function almAerial() {
  const svg = `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="1600" height="900" fill="#5f7d4a"/>
    ${Array.from({ length: 40 }, (_, k) => `<circle cx="${(k * 397) % 1600}" cy="${(k * 233) % 900}" r="${30 + (k % 5) * 12}" fill="#3f6334"/>`).join('')}
    ${Array.from({ length: 14 }, (_, k) => `<rect x="${(k * 271) % 1500}" y="${(k * 157) % 850}" width="70" height="44" fill="#b5503a"/>`).join('')}
    <g transform="translate(800 470) rotate(-8)"><rect x="-470" y="-250" width="940" height="560" rx="70" fill="#1e5bb0"/><rect x="-480" y="-290" width="960" height="560" rx="80" fill="#f2f4f6"/>
    <rect x="-440" y="-250" width="880" height="480" rx="50" fill="#e3e8ee"/><rect x="-340" y="-170" width="680" height="320" fill="#2b5fa8"/>
    <rect x="-300" y="-140" width="600" height="260" fill="#3f9a45"/>${Array.from({ length: 8 }, (_, k) => `<rect x="${-300 + k * 75}" y="-140" width="37" height="260" fill="#46a64c"/>`).join('')}
    <rect x="80" y="-288" width="380" height="120" fill="#9fb3c8" opacity=".6"/></g></svg>`;
  return h('div', { class: 'si-set si-alm-air' }, frag(svg, 'si-air'));
}
// Die Alm von innen nach Foto: Dach mit blauen Trägern und hellen Paneelen, Lichtband, Videowand,
// zwei Ränge mit hochgehaltenen Schals, Fahnen in Schwarz-Weiß-Blau, Werbebande ohne Text
function stadiumSet(mode) {
  let scarves = '';
  const tiers = [[430, 560, 7], [600, 700, 5]];
  for (const [y0, y1, rowsN] of tiers) {
    for (let r = 0; r < rowsN; r++) {
      const y = y0 + (r * (y1 - y0)) / rowsN;
      for (let x = (r % 2) * 14; x < 1600; x += 28) {
        scarves += `<rect class="fan" x="${x}" y="${y.toFixed(0)}" width="22" height="7" fill="#1d4fa0" style="animation-delay:${(((x * 13 + r * 7) % 100) / 100).toFixed(2)}s"/><rect x="${x + 7}" y="${y.toFixed(0)}" width="4" height="7" fill="#f4f6f8"/><rect x="${x + 15}" y="${y.toFixed(0)}" width="3" height="7" fill="#f4f6f8"/><circle cx="${x + 11}" cy="${(y + 13).toFixed(0)}" r="5" fill="#141820"/>`;
      }
    }
  }
  const flag = (x, y, cols, rot) => `<g class="flag" style="transform-origin:${x}px ${y}px; animation-delay:${(x % 7) / 10}s"><rect x="${x}" y="${y}" width="3" height="120" fill="#ddd"/><g transform="translate(${x + 3} ${y}) rotate(${rot})">${cols.map((c, i) => `<rect y="${i * 22}" width="110" height="22" fill="${c}"/>`).join('')}</g></g>`;
  const flags = flag(300, 380, ['#0a0a0a', '#ffffff', '#1d4fa0'], 8) + flag(760, 360, ['#1d4fa0', '#ffffff', '#1d4fa0'], -6) + flag(1180, 390, ['#0a0a0a', '#ffffff', '#1d4fa0'], 10) + flag(1440, 400, ['#1d4fa0', '#0a0a0a', '#ffffff'], -10);
  const svg = `<svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="nsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#03050c"/><stop offset="1" stop-color="#14203a"/></linearGradient><radialGradient id="pitch" cx=".5" cy="0" r="1"><stop offset="0" stop-color="#3a9a45"/><stop offset="1" stop-color="#1a5424"/></radialGradient><linearGradient id="panel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9dcae"/><stop offset="1" stop-color="#b9ab83"/></linearGradient></defs>
    <rect width="1600" height="900" fill="#0b0f18"/>
    <path d="M-40,0 L1640,0 L1640,290 L-40,330 Z" fill="url(#panel)"/>
    ${Array.from({ length: 22 }, (_, k) => `<path d="M${k * 78 - 40},0 L${k * 78 + 10},300" stroke="#1d4fa0" stroke-width="10"/>`).join('')}
    ${Array.from({ length: 4 }, (_, k) => `<path d="M-40,${60 + k * 60} L1640,${50 + k * 56}" stroke="#2a5cae" stroke-width="5"/>`).join('')}
    <path d="M-40,290 L1640,270 L1640,330 L-40,350 Z" fill="#1d4fa0"/>${Array.from({ length: 14 }, (_, k) => `<rect x="${360 + k * 88}" y="${296 - k * 1.3}" width="60" height="14" rx="3" fill="#fffbe8"/>`).join('')}
    <rect x="40" y="250" width="250" height="140" fill="#0d1a33" stroke="#0a0f1a" stroke-width="8"/>
    <path d="M-40,350 L1640,330 L1640,720 L-40,720 Z" fill="#141a26"/><rect x="0" y="580" width="1600" height="10" fill="#2a3242"/><path d="M0,590 L1600,590" stroke="#8d97a6" stroke-width="2"/>
    ${scarves}${flags}
    <rect x="0" y="702" width="1600" height="26" fill="#1d4fa0"/>${Array.from({ length: 10 }, (_, k) => `<rect x="${20 + k * 160}" y="707" width="130" height="16" rx="2" fill="${k % 2 ? '#f4f6f8' : '#0a0a0a'}" opacity=".9"/>`).join('')}
    <path d="M0,728 L1600,728 L1600,900 L0,900 Z" fill="url(#pitch)"/>${Array.from({ length: 8 }, (_, k) => `<rect x="${k * 200}" y="728" width="100" height="172" fill="rgba(255,255,255,.05)"/>`).join('')}
    <rect x="0" y="726" width="1600" height="5" fill="#e9eef3"/><rect x="600" y="760" width="400" height="140" fill="none" stroke="#e9eef3" stroke-width="4"/><rect x="700" y="740" width="200" height="40" fill="none" stroke="#f4f6f8" stroke-width="5"/></svg>`;
  return h('div', { class: `si-set si-stadium ${mode || ''}`.trim() }, frag(svg, 'si-stadium-svg'), h('div', { class: 'si-score' }, h('i', {}), h('b', { class: 'si-score-num' }, '')));
}
function autoBielefeld(c) {
  const { root, si, s, L, el, sound } = c;
  const tl = si.tl; const boom = tl.boom;
  const bg = h('div', { class: 'si-setslot' }); const stage = h('div', { class: 'si-stage' });
  root.append(bg, stage);
  const at = (t, fn) => atTime(el, t, fn);
  // Cold Open: Ortsschild im Nebel, Bildstörung, „Gibt es das überhaupt?“
  sound('static', 0.2, el, 0.8);
  c.voice(si.clips.cold, si.tx['voice.cold'], 0.3);
  at(0.3, () => { if (el < tl.teaser) stage.replaceChildren(h('div', { class: 'si-bi-cold' }, ortsschild(si.tx['cold.a']))); });
  at(1.8, () => { if (el < tl.teaser) { stage.querySelector('.si-bi-cold')?.classList.add('glitch'); sound('static', 1.8, el, 0.4); } });
  at(2.3, () => { if (el < tl.teaser && si.tx['cold.b']) stage.querySelector('.si-bi-cold')?.append(h('div', { class: 'si-bi-doubt' }, si.tx['cold.b'])); });
  at(3.3, () => { if (el < tl.teaser) stage.replaceChildren(presents(c, si.tx['cold.kicker'], si.tx['cold.present'])); });
  // Flug über die Stadt: Teuto → Sparrenburg → Altstadt → Jahnplatz, Spiele auf Straßenschildern
  at(tl.teaser, () => { if (el > tl.count + 0.5) return; root.classList.add('si-day'); const pano = set(c, 'city'); pano.style.setProperty('--fly', `${tl.count - tl.teaser}s`); bg.replaceChildren(pano); });
  sound('whoosh', tl.teaser, el, 1.2, 0.5);
  at(tl.teaser + 0.2, () => { if (el < tl.teaser + 1.4) stage.replaceChildren(h('div', { class: 'si-teaser-head si-retro' }, si.tx['teaser.head'])); });
  const games = si.games.slice(0, 8);
  const slot = games.length ? (tl.count - tl.teaser - 1.6) / games.length : 0;
  games.forEach((g, i) => {
    const t0 = tl.teaser + 1.4 + i * slot;
    sound('pop', t0, el);
    at(t0, () => { if (el > tl.count) return; stage.replaceChildren(h('div', { class: `si-street-wrap p${i % 3}` }, streetSign(g.label))); });
  });
  // Countdown auf der Anzeigetafel im Stadion, Klatsch-Rhythmus
  at(tl.count, () => { if (el > tl.count + 1.1) return; root.classList.remove('si-day'); bg.replaceChildren(almAerial()); stage.replaceChildren(); });
  sound('whoosh', tl.count + 0.9, el, 0.6, 0.5);
  at(tl.count + 1.1, () => { root.classList.remove('si-day'); root.classList.add('si-stadion'); bg.replaceChildren(set(c, 'night')); stage.replaceChildren(); c.fx((fx) => { fx.beams = 0.5; fx.beamN = 4; fx.beamColor = '#ffffff'; }); });
  for (let k = 0; k < 5; k++) {
    const tt = tl.count + k * ((boom - tl.count) / 5);
    sound('tick', tt, el, k); sound('clap', tt + 0.5, el);
    at(tt, () => {
      if (el > boom) return;
      const sc = bg.querySelector('.si-score-num'); if (sc && nowEl(el) >= tl.count + 1.1) { sc.textContent = `${si.tx['count.label'] || ''}${5 - k}`; sc.parentElement.classList.remove('hit'); void sc.offsetWidth; sc.parentElement.classList.add('hit'); }
      if (k === 4 && si.tx['count.final']) stage.replaceChildren(h('div', { class: 'si-count-final bi' }, si.tx['count.final']));
    });
  }
  // Höhepunkt: Stadion explodiert in Schwarz-Weiß-Blau
  c.shake(boom, true); sound('hit', boom, el);
  at(boom, () => {
    root.classList.add('si-lit');
    bg.querySelector('.si-stadium')?.classList.add('party');
    const sc = bg.querySelector('.si-score-num'); if (sc) sc.textContent = '';
    c.voice(si.clips.drop, si.tx['voice.drop'], boom + 0.3);
    dropLogo(c, stage, [h('div', { class: 'si-scarves', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'))]);
    c.fx((fx) => { if (el < boom + 1) { const cols = ['#0a0a0a', '#ffffff', '#1565c0']; fx.cannon(-1, 110, 'confetti', cols); fx.cannon(1, 110, 'confetti', cols); fx.burst(140, 'spark', fx.w / 2, fx.h * 0.45, 1.2, ['#ffffff', '#5aa0ff']); } fx.beams = 1; });
  });
  linesAndHold(c, stage);
}


// ---------------------------------------------------------------------------------
// THE VOICE (Blind Audition): rote Coach-Stühle, Mikro im Spotlight, Buzzer, rote Lichtringe
// (eigene Zeichnungen, kein Sendungslogo)
// ---------------------------------------------------------------------------------
// Coach-Stuhl nach Fotos: rotes Leder, schwarzes V-Panel mit weißer LED-Kante, Namensschild, Leuchtring am Boden
const CHAIR_DEFS = '<defs><linearGradient id="chr" x1="0" x2="1"><stop offset="0" stop-color="#7d0614"/><stop offset=".3" stop-color="#e0182c"/><stop offset=".7" stop-color="#ff3346"/><stop offset="1" stop-color="#8a0816"/></linearGradient><linearGradient id="chrv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff4255"/><stop offset="1" stop-color="#a80c1c"/></linearGradient></defs>';
function chairBack(name) {
  return `<svg viewBox="0 0 220 300" aria-hidden="true">${CHAIR_DEFS}
    <path d="M24,262 L16,64 Q16,12 66,8 L154,8 Q204,12 204,64 L196,262 Q110,276 24,262 Z" fill="url(#chr)"/>
    <path d="M40,256 L34,70 M186,256 L180,70" stroke="#5a0410" stroke-width="3" opacity=".7"/>
    <path d="M62,12 L158,12 L118,150 L102,150 Z" fill="#0d0d10"/><path d="M62,12 L158,12 L118,150 L102,150 Z" fill="none" stroke="#ffffff" stroke-width="3.5" filter="drop-shadow(0 0 4px #ff9db0)"/>
    <path d="M30,96 L80,96 M140,96 L190,96" stroke="#ffffff" stroke-width="3" opacity=".9"/>
    <rect x="30" y="160" width="160" height="34" rx="4" fill="#0d0d10"/><text x="110" y="183" text-anchor="middle" font-family="SI Display, sans-serif" font-weight="900" font-size="17" letter-spacing="2" fill="#ffffff">${esc(String(name || '').toUpperCase())}</text>
    <path d="M28,214 Q110,228 192,214" stroke="#5a0410" stroke-width="3" fill="none"/>
    <rect x="98" y="266" width="24" height="16" fill="#1a1a1e"/><ellipse cx="110" cy="290" rx="92" ry="9" fill="none" stroke="#ff4d6d" stroke-width="3" filter="drop-shadow(0 0 5px #ff2d55)"/></svg>`;
}
const CHAIR_FRONT = `<svg viewBox="0 0 220 300" aria-hidden="true">${CHAIR_DEFS}<path d="M24,262 L16,64 Q16,12 66,8 L154,8 Q204,12 204,64 L196,262 Q110,276 24,262 Z" fill="#6e0512"/><path d="M46,176 L42,80 Q42,34 110,32 Q178,34 178,80 L174,176 Z" fill="url(#chrv)"/>${Array.from({ length: 3 }, (_, k) => `<path d="M50,${92 + k * 28} L170,${92 + k * 28}" stroke="#8a0816" stroke-width="2"/>`).join('')}<rect x="30" y="176" width="160" height="50" rx="16" fill="#e0182c"/><rect x="8" y="140" width="32" height="84" rx="12" fill="#4a0410"/><rect x="180" y="140" width="32" height="84" rx="12" fill="#4a0410"/><rect x="98" y="266" width="24" height="16" fill="#1a1a1e"/><ellipse cx="110" cy="290" rx="92" ry="9" fill="none" stroke="#ffffff" stroke-width="3" filter="drop-shadow(0 0 6px #ff2d55)"/></svg>`;
function chairEl(text, i = 0, seat = null, name = '') {
  return h('div', { class: 'si-chair', '--i': String(i) }, h('div', { class: 'si-chair-in' },
    frag(chairBack(name), 'back'), h('div', { class: 'front' }, frag(CHAIR_FRONT, 'fsvg'), seat ? h('div', { class: 'seat' }, seat) : null, h('b', { class: 'si-chair-led' }, text))));
}
// Ein Stuhl pro Team (Name auf der Lehne, Avatar sitzt darin). turned: Indizes, die schon umgedreht sind.
function teamChairs(c, turned = [], cls = '') {
  const { s, si } = c;
  return h('div', { class: `si-chairs six ${cls}`.trim() }, s.teams.map((t, i) => {
    const ch = chairEl(si.tx['chair.text'], i, avatarOf({ name: t.name, color: t.color, avatar: t.avatar }), t.name);
    if (turned.includes(i)) ch.classList.add('turned', 'pre');
    return ch;
  }));
}
function micEl() {
  return frag('<svg viewBox="0 0 80 400" aria-hidden="true"><rect x="38" y="60" width="4" height="320" fill="#2b2b2f"/><path d="M10,396 L40,370 L70,396 Z" fill="#1d1d21"/><rect x="31" y="20" width="18" height="44" rx="9" fill="#3a3a40"/><rect x="31" y="20" width="18" height="22" rx="9" fill="#707078"/></svg>', 'si-mic');
}
function voiceSet(mode, floorText = '') {
  const stripes = Array.from({ length: 7 }, (_, i) => h('i', { '--i': String(i) }));
  return h('div', { class: `si-set si-voice-set ${mode || ''}`.trim() },
    h('div', { class: 'si-vwall' }, stripes), h('div', { class: 'si-vback' }),
    h('div', { class: 'si-vstage' }, h('i'), h('i'), h('i')),
    h('div', { class: 'si-vfloor' }, floorText ? h('b', { class: 'si-vfloortext' }, floorText) : null));
}
function buzzerEl() { return h('div', { class: 'si-buzzer' }, h('i', { class: 'dome' }), h('i', { class: 'base' })); }
function autoVoice(c) {
  const { root, si, s, L, el, sound } = c;
  const tl = si.tl; const boom = tl.boom;
  const bg = h('div', { class: 'si-setslot' }); const stage = h('div', { class: 'si-stage' });
  root.append(bg, stage);
  const at = (t, fn) => atTime(el, t, fn);
  bg.replaceChildren(voiceSet('dark', s.show.name));
  c.voice(si.clips.cold, si.tx['voice.cold'], 0.5);
  sound('clunk', 0.2, el);
  at(0.2, () => { if (el < tl.teaser) stage.replaceChildren(h('div', { class: 'si-vmic' }, h('div', { class: 'si-spot-cone' }), micEl()), h('div', { class: 'si-vtitle' }, si.tx['cold.a'])); });
  at(1.8, () => { if (el < tl.teaser && si.tx['cold.b']) stage.querySelector('.si-vtitle')?.after(h('div', { class: 'si-vsub' }, si.tx['cold.b'])); });
  at(2.8, () => { if (el < tl.teaser) stage.replaceChildren(h('div', { class: 'si-vmic' }, h('div', { class: 'si-spot-cone' }), micEl()), presents(c, si.tx['cold.kicker'], si.tx['cold.present'])); });
  // Teaser: Spieltitel in den roten Lichtringen
  at(tl.teaser, () => { bg.querySelector('.si-voice-set')?.classList.replace('dark', 'on'); });
  sound('whoosh', tl.teaser, el, 0.8);
  at(tl.teaser, () => { if (el < tl.teaser + 0.9) stage.replaceChildren(h('div', { class: 'si-teaser-head' }, si.tx['teaser.head'])); });
  const games = si.games.slice(0, 8);
  const slot = games.length ? (tl.count - tl.teaser - 0.9) / games.length : 0;
  games.forEach((g, i) => {
    const t0 = tl.teaser + 0.9 + i * slot;
    sound('whoosh', t0, el, 0.35, 0.4);
    at(t0, () => { if (el > tl.count) return; stage.replaceChildren(h('div', { class: 'si-cut si-vcut' }, h('b', {}, g.label))); bg.querySelector('.si-vrings')?.classList.toggle('flip', i % 2 === 1); });
  });
  // Countdown: vier Stühle mit dem Rücken zur Bühne, Buzzer glüht, Herzschlag
  const chairs = teamChairs(c);
  const buzz = buzzerEl();
  at(tl.count, () => { stage.replaceChildren(); bg.append(chairs, buzz); });
  for (let k = 0; k < 5; k++) {
    const tt = tl.count + k * ((boom - tl.count) / 5);
    sound('heart', tt, el, 0.5 + k * 0.12);
    at(tt, () => {
      if (el > boom) return;
      stage.replaceChildren(h('div', { class: 'si-count si-count-voice' }, h('b', { class: 'si-num' }, `${si.tx['count.label'] || ''}${5 - k}`), k === 4 && si.tx['count.final'] ? h('div', { class: 'si-count-final' }, si.tx['count.final']) : null));
      root.classList.toggle('si-pulse', k >= 2);
    });
  }
  // BUZZER: Stühle drehen sich, rote Explosion
  c.shake(boom, true); sound('hit', boom, el);
  at(boom, () => {
    root.classList.remove('si-pulse'); root.classList.add('si-lit');
    buzz.classList.add('pressed'); chairs.classList.add('flash');
    c.voice(si.clips.drop, si.tx['voice.drop'], boom + 0.3);
    dropLogo(c, stage);
    c.fx((fx) => { if (el < boom + 1) { fx.burst(160, 'spark', fx.w / 2, fx.h * 0.7, 1.3, ['#ff2a3a', '#ffffff', '#ff8a96']); fx.flare(fx.w / 2, fx.h * 0.4); } fx.beams = 1; fx.beamColor = '#ff2a3a'; fx.beamFrom = 'both'; });
  });
  linesAndHold(c, stage, () => []);
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
    P = { kind, k, name: t.name, color: t.color, avatar: () => avatarOf({ name: t.name, color: t.color, avatar: t.avatar }), kicker: tt.kicker, tag: tt.tag, extra: tt.extra, call: tt.call, clip: si.clips[`team:${t.id}`], song: si.songs && si.songs[`team:${t.id}`], stats: tt, jingle: `team${(k % 6) + 1}`, layout: (TEAM_LAYOUTS[si.theme] || TEAM_LAYOUTS.bielefeld)[k % 6] };
  } else {
    const co = kind === 'coHost';
    const p = (co ? si.coHost : si.host) || { name: '', call: '', kicker: '', tag: '' };
    const src = co ? (s.show.coHostAvatar || 'assets/img/avatar-cohost.webp') : (s.show.hostAvatar || 'assets/img/avatar-host.webp');
    P = { kind, k: -1, name: p.name, color: L.c, avatar: () => h('img', { class: 'si-avatar host', src, alt: '' }), kicker: p.kicker, tag: p.tag, extra: '', call: p.call, clip: si.clips[kind], song: si.songs && si.songs[kind], jingle: co ? 'cohost' : 'host', layout: (co ? COHOST_LAYOUT : HOST_LAYOUT)[si.theme] || 'spot' };
  }
  P.extraLabel = String(si.extraLabel || '').replace(/\s*\(.*\)\s*/g, '');
  // Schriftgröße nach dem längsten Wort, damit kein Name mitten im Wort umbricht
  // Breite Schriften (Weltraum: Orbit) brauchen je Buchstabe fast eine ganze Schrifthöhe.
  const wide = L.font === 'si-orbit' ? 1.05 : 0.6;
  // lines: höchstens so viele Zeilen für den ganzen Namen (lange Namen werden kleiner statt höher)
  P.fit = (vw, maxVh, lines = 0) => {
    const longest = Math.max(5, ...String(P.name).split(/\s+/).map((w) => w.length));
    let size = vw / (longest * wide);
    if (lines) size = Math.min(size, (vw * lines) / (Math.max(5, String(P.name).length) * wide));
    return `min(${maxVh}vh, ${size.toFixed(2)}vw)`;
  };
  c.person = P;
  c.voice(P.clip, P.call, 0.08);
  c.jingle(P.jingle, P.song, HIT);
  c.shake(HIT, kind === 'host');
  root.classList.add('si-lit');
  const bg = h('div', { class: 'si-setslot' }, set(c, si.theme === 'wildnis' ? 'mist' : (si.theme === 'weltraum' ? 'orbit' : (si.theme === 'bielefeld' ? 'night' : (si.theme === 'voice' ? 'on' : 'open')))));
  root.append(bg);
  if (si.theme === 'voice') bg.querySelector('.si-vfloor')?.append(h('b', { class: 'si-vfloortext' }, P.name));
  const node = (LAYOUTS[P.layout] || LAYOUTS.spot)(c, P);
  node.classList.add('si-stage', 'si-person', `lay-${P.layout}`, kind);
  node.style.setProperty('--team', P.color);
  node.style.setProperty('--hit', `${Math.max(0, HIT - el)}s`);
  root.append(node);
  c.fx((fx) => {
    fx.beams = 0.9; fx.beamColor = P.color; fx.ambient = { rate: 0.4 };
    if (si.theme === 'wildnis') { fx.fire = 0; fx.beams = 0.12; }
    if (el < HIT + 1) later(Math.max(0, HIT - el), () => {
      fx.burst(kind === 'host' ? 220 : 120, 'spark', fx.w / 2, fx.h * 0.45, 1.1);
      fx.flare(fx.w / 2, fx.h * 0.4);
      if (kind === 'host' || P.layout === 'zoom') { fx.cannon(-1, 90); fx.cannon(1, 90); }
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
    // Buchstaben je Wort gebündelt: Umbruch nur zwischen Wörtern, nie mitten im Wort
    let n = 0;
    const letters = String(P.name).split(/\s+/).filter(Boolean).flatMap((w, wi) => [wi ? ' ' : null, h('em', { class: 'si-type-word' }, [...w].map((ch) => h('span', { style: { animationDelay: `calc(var(--hit) + ${(n++) * 0.045}s)` } }, ch)))]).filter((x) => x !== null);
    return h('div', {}, h('div', { class: 'si-type-bg' }, P.avatar()), h('b', { class: `si-type-name ${c.L.font}`, style: { fontSize: P.fit(92, 22, 2) } }, letters), h('div', { class: 'si-type-sub' }, h('span', {}, P.kicker), h('i'), h('span', {}, P.tag)), extraEl(P));
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
  // The Voice: der Stuhl dieses Teams dreht sich um – darin sitzt das Team; vorherige bleiben umgedreht
  teamchair(c, P) {
    const before = Array.from({ length: Math.max(0, P.k) }, (_, i) => i);
    const row = teamChairs(c, before);
    const mine = row.children[P.k];
    if (mine) { mine.classList.add('me'); later(Math.max(0, HIT - c.el), () => mine.classList.add('turned')); }
    c.sound('wing', HIT, c.el);
    return h('div', {}, h('div', { class: 'si-buzzer' }, h('i', { class: 'dome' }), h('i', { class: 'base' })), row, kickerEl(P), h('div', { class: 'si-vname' }, h('b', { class: c.L.font }, P.name), h('small', {}, P.tag)), extraEl(P));
  },
  // The Voice: für die Moderation drehen sich alle Stühle gleichzeitig um
  allchairs(c, P) {
    const row = teamChairs(c, [], 'all');
    later(Math.max(0, HIT - c.el), () => [...row.children].forEach((ch) => ch.classList.add('turned')));
    for (let i = 0; i < Math.min(6, c.s.teams.length); i++) c.sound('wing', HIT + i * 0.12, c.el);
    return h('div', {}, h('div', { class: 'si-spot-cone' }), h('div', { class: 'si-hero voice' }, P.avatar()), row, kickerEl(P), plate(P, c.L));
  },
  // The Voice: Talent am Mikro, vier Stühle drehen sich nacheinander um
  chairs(c, P) {
    const ch = teamChairs(c);
    later(Math.max(0, HIT - c.el), () => ch.classList.add('turned'));
    for (let i = 0; i < 4; i++) c.sound('wing', HIT + 0.1 + i * 0.25, c.el);
    return h('div', {}, h('div', { class: 'si-spot-cone' }), h('div', { class: 'si-hero voice' }, P.avatar()), ch, kickerEl(P), plate(P, c.L));
  },
  // The Voice: Riesen-Buzzer wird gedrückt, Name explodiert heraus
  buzzer(c, P) {
    const b = buzzerEl(); b.classList.add('big');
    later(Math.max(0, HIT - c.el - 0.15), () => b.classList.add('pressed'));
    return h('div', {}, b, h('b', { class: `si-zoom-name ${c.L.font}`, style: { fontSize: P.fit(90, 13) } }, P.name), h('div', { class: 'si-hero small left' }, P.avatar()), kickerEl(P), h('div', { class: 'si-split-tag bottom' }, P.tag));
  },
  // The Voice: Coach-Stuhl dreht sich um – darin sitzt die Moderation
  coach(c, P) {
    const ch = chairEl(c.si.tx['chair.text'], 0, P.avatar(), P.name); ch.classList.add('coach');
    const wrap = h('div', { class: 'si-chairs coach' }, ch);
    later(Math.max(0, HIT - c.el), () => wrap.classList.add('turned'));
    c.sound('wing', HIT, c.el);
    return h('div', {}, wrap, kickerEl(P), plate(P, c.L));
  },
  // Bielefeld: Name auf dem Ortsschild
  sign(c, P) {
    return h('div', {}, kickerEl(P), h('div', { class: 'si-sign-wrap' }, ortsschild(P.name)), h('div', { class: 'si-hero small left' }, P.avatar()), h('div', { class: 'si-split-tag bottom' }, P.tag), extraEl(P));
  },
  // Bielefeld: Fanschal in Schwarz-Weiß-Blau mit dem Namen
  scarf(c, P) {
    return h('div', {}, h('div', { class: 'si-hero' }, P.avatar()), h('div', { class: 'si-scarf' }, h('b', {}, P.name)), kickerEl(P), h('div', { class: 'si-split-tag bottom' }, P.tag));
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
  // Wildnis: Steckbrief wie in der Doku – Namensschild mit Rissen, Werte, Skill-Balken
  stats(c, P, side = 'l') {
    return h('div', { class: `si-wstats ${side}` }, h('div', { class: 'si-wav' }, P.avatar()),
      h('div', { class: 'si-wcol' }, tornLabel(P.kicker, P.name, P.k + 3), statsEl(c, P, side)), h('div', { class: 'si-quote' }, P.tag));
  },
  statsR(c, P) { return LAYOUTS.stats(c, P, 'r'); },
  // Wildnis: Team vor großen Sechsecken, Schild unten
  hexteam(c, P, side = 'l') {
    return h('div', { class: `si-whex ${side}` }, h('div', { class: 'si-bighex', 'aria-hidden': 'true' }, h('i', { class: 'g' }), h('i', { class: 'o' }), h('i', { class: 'd' }), h('i', { class: 'b' })),
      h('div', { class: 'si-wav' }, P.avatar()), h('div', { class: 'si-wlabel' }, tornLabel(P.kicker, P.name, P.k + 7)), statsEl(c, P, side === 'l' ? 'r' : 'l'));
  },
  hexteamR(c, P) { return LAYOUTS.hexteam(c, P, 'r'); },
  // Wildnis: Bodycam
  bodycam(c, P) {
    const n = h('div', {}, h('div', { class: 'si-body' }, P.avatar()), camHud(c, P.kicker), h('div', { class: 'si-tape' }, h('b', {}, P.name)), P.stats ? statsEl(c, P, 'r') : extraEl(P), h('div', { class: 'si-quote' }, P.tag));
    tickTimecode(n, performance.now());
    return n;
  },
  // Wildnis: Polaroid mit Klebeband und Gegenständen
  polaroid(c, P) {
    const items = String(P.extra || '').split(/\s*[·,]\s*/).filter(Boolean);
    return h('div', {}, h('div', { class: 'si-polaroid' }, h('div', { class: 'ph' }, P.avatar()), h('b', {}, P.name), h('i', { class: 'tape' })), P.stats ? statsEl(c, P, 'r') : null, !P.stats && items.length ? h('div', { class: 'si-items' }, h('small', {}, P.extraLabel || ''), items.map((x) => h('span', {}, x))) : null, kickerEl(P), h('div', { class: 'si-quote' }, P.tag));
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
  root.append(h('div', { class: 'si-setslot' }, set(c, si.theme === 'wildnis' ? 'mist' : (si.theme === 'weltraum' ? 'orbit' : (si.theme === 'bielefeld' ? 'night' : (si.theme === 'voice' ? 'on' : 'open'))))));
  root.append(h('div', { class: 'si-stage si-all' },
    h('div', { class: 'si-rays', 'aria-hidden': 'true' }),
    h('div', { class: 'si-logo-wrap small' }, logoEl(s.show.name, L)),
    si.theme === 'voice'
      ? teamChairs(c, s.teams.map((_, i) => i), 'final')
      : si.theme === 'wildnis'
      ? h('div', { class: 'si-hexrow' }, s.teams.map((t, i) => h('div', { class: `si-hexcell${i % 2 ? ' low' : ''}`, '--team': t.color, style: { animationDelay: `${0.25 + i * 0.14}s` } }, h('div', { class: 'si-hexframe' }, avatarOf(t)), h('div', { class: 'si-torn-paper mini', style: { clipPath: tornClip(i + 11) } }, h('b', {}, t.name)))))
      : h('div', { class: 'si-row' }, s.teams.map((t, i) => h('div', { class: 'si-mini', '--team': t.color, style: { animationDelay: `${0.25 + i * 0.12}s` } }, avatarOf(t), h('b', {}, t.name)))),
    h('div', { class: 'si-hosts' }, [s.show.host, s.show.coHost].filter(Boolean).join(' & ')),
    h('div', { class: `si-tagline ${L.font} si-metal-${L.metal}` }, si.tx.tagline)));
  c.fx((fx) => {
    fx.beams = 1; fx.beamColor = L.b; fx.ambient = { rate: 0.7 }; fx.beamFrom = 'both'; fx.beamN = 6;
    if (el < 1.2) later(0.1, () => {
      fx.cannon(-1, 120); fx.cannon(1, 120); fx.burst(140, 'spark', fx.w / 2, fx.h * 0.25, 1); fx.flare(fx.w / 2, fx.h * 0.2);
      if (si.theme !== 'wildnis') for (const x of [0.06, 0.2, 0.8, 0.94]) fx.fountain(fx.w * x, 3);
      if (si.theme === 'casino') fx.rain(120, 'coin');
      if (si.theme === 'wildnis') fx.fire = 0;
      if (si.theme === 'weltraum') { fx.warp = 0.8; later(2.5, () => { fx.warp = 0; }); }
    });
  });
}

