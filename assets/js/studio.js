// Teampulte für den Beamer: Fabians Show-Bild mit den sechs Pulten in
// Originaloptik und -anordnung, die Bögen leer (scripts/build-podiums.py).
// Der 3D-Avatar eines Teams steht im Bogen und verschwindet an der Pultkante
// hinter dem Pult; ohne Avatar bleibt das Pult leer.

import { h } from './client.js';
import { PODIUM_DATA } from './podium-data.js';
import { studioRoom } from './studio-room.js';

const NS = 'http://www.w3.org/2000/svg';
let uid = 0;
// Ablauf der Team-Vorstellung (Sekunden, mal --speed in den Animationen)
export const INTRO_START = 1.2;
export const INTRO_STEP = 2.2;

function el(tag, attrs = {}, text) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) n.setAttribute(k, v);
  if (text !== undefined) n.textContent = text;
  return n;
}

// opts: { points: bool, winnerId, banner: Node }
export function podiumRow(teams, opts = {}) {
  const id = `pod${++uid}`;
  const { width: W, height: H, podiums } = PODIUM_DATA;
  const shown = teams.slice(0, podiums.length);
  const svg = el('svg', { class: 'podiums', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `Teampulte: ${shown.map((t) => t.name).join(', ')}` });
  const defs = el('defs');
  svg.append(defs, el('image', { href: 'assets/img/studio-teams-empty.webp', x: 0, y: 0, width: W, height: H }));
  const flights = [];
  if (opts.intro) {
    svg.classList.add('intro');
    const lg = el('linearGradient', { id: `${id}-spot`, x1: 0, y1: 0, x2: 0, y2: 1 });
    lg.append(el('stop', { offset: 0, 'stop-color': '#fff', 'stop-opacity': 0.75 }), el('stop', { offset: 1, 'stop-color': '#fff', 'stop-opacity': 0 }));
    defs.append(lg);
  }

  podiums.forEach((p, i) => {
    const t = shown[i];
    const [l, top, r, desk] = p.box;
    // Vorstellung (opts.intro): ein Team nach dem anderen, je INTRO_STEP Sekunden.
    const style = !t ? '' : opts.intro ? `--team:${t.color};--d:${INTRO_START + i * INTRO_STEP}s` : `--team:${t.color};animation-delay:${0.2 + i * 0.15}s`;
    const g = el('g', { class: 'podium-slot', style });
    if (t && opts.intro) {
      // Lichtkegel von oben auf das Pult und ein Aufleuchten in Teamfarbe.
      const cx = (l + r) / 2;
      g.append(
        el('polygon', { class: 'podium-spot', points: `${cx - 14},-40 ${cx + 14},-40 ${r + 18},${desk + 30} ${l - 18},${desk + 30}`, fill: `url(#${id}-spot)` }),
        el('rect', { class: 'podium-flash', x: l - 6, y: top - 6, width: r - l + 12, height: desk - top + 60, rx: 40, fill: t.color }));
    }
    // Avatar: im Bogen, unten an der Pultkante abgeschnitten (steht dahinter).
    // Die Maske sitzt auf einer Gruppe, damit der Avatar darin hochfahren kann.
    if (t && t.avatar) {
      const clipId = `${id}-clip-${i}`;
      const clip = el('clipPath', { id: clipId });
      clip.append(el('polygon', { points: p.clip }));
      defs.append(clip);
      const w = r - l, hgt = desk - top;
      const holder = el('g', { 'clip-path': `url(#${clipId})` });
      const av = el('image', {
        href: t.avatar, class: 'podium-avatar',
        x: l - w * 0.04, y: top + hgt * 0.08, width: w * 1.08, height: hgt * 1.3,
        preserveAspectRatio: 'xMidYMin meet',
      });
      holder.append(av);
      // Figur so groß, dass sie den Bogen in der Breite füllt; was unter die
      // Pultkante reicht, verschwindet dahinter. Bei sehr schmalen Bildern
      // begrenzt, damit nicht nur noch der Kopf zu sehen ist.
      const probe = new Image();
      probe.onload = () => {
        const ratio = probe.naturalHeight / Math.max(1, probe.naturalWidth);
        if (!ratio) return;
        const bw = w * 1.08;
        av.setAttribute('height', String(Math.max(hgt * 1.3, Math.min(bw * ratio, hgt * 2.6))));
      };
      probe.src = t.avatar;
      g.append(holder);
    }
    // Punktefeld: im Bild steht „0“ – immer überdecken, Punkte nur bei der Münzvergabe.
    const [sx0, sy0, sx1, sy1] = p.score;
    const winner = t && opts.winnerId === t.id;
    g.append(el('rect', { x: sx0, y: sy0, width: sx1 - sx0 + 1, height: sy1 - sy0 + 1, fill: '#000', class: winner ? 'podium-score winner' : 'podium-score' }));
    // Markierung im Punktefeld (z. B. ✓/✗ bei Einschätzungen auf dem iPad).
    const mark = t && opts.marks ? opts.marks[t.id] : null;
    if (mark) g.append(el('text', { x: (sx0 + sx1 + 1) / 2, y: (sy0 + sy1) / 2 + 19 * 0.36, 'text-anchor': 'middle', class: `podium-points mark ${mark.cls || ''}`, 'font-size': 19 }, mark.text));
    if (t && opts.points) {
      const pts = String(t.points ?? 0);
      const fs = pts.length > 2 ? 11 : pts.length > 1 ? 15 : 19;
      g.append(el('text', { x: (sx0 + sx1 + 1) / 2, y: (sy0 + sy1) / 2 + fs * 0.36, 'text-anchor': 'middle', class: `podium-points${winner ? ' winner' : ''}`, 'font-size': fs }, pts));
    }
    // Gewonnene Münzen stehen vorn auf der Pultkante; die gerade vergebene fliegt ein.
    const won = t ? (opts.coins || []).filter((c) => c.teamId === t.id).sort((a, b) => a.position - b.position) : [];
    won.forEach((c, j) => {
      const cw = 28, ch = cw * 208 / 240, gap = 25;
      const x = (l + r) / 2 + (j - (won.length - 1) / 2) * gap - cw / 2;
      const img = el('image', { href: 'assets/img/muenze.webp', class: 'podium-coin', x, y: desk + 4 - ch, width: cw, height: ch });
      if (opts.flyPosition === c.position) {
        img.classList.add('fly');
        flights.push({ img, dx: W / 2 - (x + cw / 2), dy: -60 - (desk + 4 - ch / 2) });
      }
      g.append(img);
    });
    // Auswahl (z. B. Tausch in Spiel 2): Pult anklickbar, ausgeschlossene Teams ausgegraut.
    if (t && opts.onPick) {
      const off = (opts.disabledIds || []).includes(t.id);
      g.classList.add(off ? 'pick-off' : 'pick');
      if (!off) {
        g.setAttribute('role', 'button');
        g.setAttribute('tabindex', '0');
        g.setAttribute('aria-label', opts.pickLabel ? opts.pickLabel(t) : `Mit ${t.name} tauschen`);
        g.addEventListener('click', () => opts.onPick(t.id));
        g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); opts.onPick(t.id); } });
      }
      // Das Pult selbst ist Teil des Hintergrundbilds: ausgegraute Teams bekommen einen dunklen Schleier.
      if (off) g.append(el('rect', { class: 'pick-veil', x: l - 6, y: top - 6, width: r - l + 12, height: 252 - top, rx: 12 }));
      g.append(el('rect', { class: 'pick-hit', x: l - 8, y: top - 40, width: r - l + 16, height: 250 - top + 40, rx: 14 }));
    }
    // Teamname gebogen über dem Bogen.
    if (t) {
      const cx = (l + r) / 2;
      const rad = 86, cy = top - 7 + rad - 6, a = Math.PI / 2 - (42 * Math.PI) / 180;
      const pathId = `${id}-name-${i}`;
      defs.append(el('path', { id: pathId, d: `M ${cx - rad * Math.cos(a)} ${cy - rad * Math.sin(a)} A ${rad} ${rad} 0 0 1 ${cx + rad * Math.cos(a)} ${cy - rad * Math.sin(a)}` }));
      const label = t.name.toUpperCase();
      const budget = 112;
      const fs = Math.min(17, budget / Math.max(4, label.length * 0.68));
      const text = el('text', { class: `podium-name${winner ? ' winner' : ''}`, 'font-size': fs.toFixed(1) });
      const tp = el('textPath', { href: `#${pathId}`, startOffset: '50%', 'text-anchor': 'middle' }, label);
      if (label.length * fs * 0.68 > budget) { tp.setAttribute('textLength', budget); tp.setAttribute('lengthAdjust', 'spacingAndGlyphs'); }
      text.append(tp);
      g.append(text);
    }
    svg.append(g);
  });

  // Flug der neuen Münze: von oben Mitte groß und drehend auf das Pult, mit Aufprall.
  const speed = Number(getComputedStyle(document.documentElement).getPropertyValue('--speed')) || 1;
  const still = document.documentElement.classList.contains('reduced-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  for (const { img, dx, dy } of flights) {
    if (still || !img.animate) continue;
    img.parentNode.parentNode.append(img.parentNode); // Gewinnerpult nach vorn, damit die Münze über allem fliegt
    img.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(3.2) rotateY(0deg)`, opacity: 0, offset: 0 },
      { transform: `translate(${dx}px, ${dy + 90}px) scale(3.2) rotateY(360deg)`, opacity: 1, offset: 0.2 },
      { transform: 'translate(0, -6px) scale(1.15) rotateY(1080deg)', opacity: 1, offset: 0.8, easing: 'ease-in' },
      { transform: 'translate(0, 0) scale(0.9, 1.08) rotateY(1080deg)', offset: 0.88 },
      { transform: 'translate(0, -5px) scale(1.04) rotateY(1080deg)', offset: 0.94 },
      { transform: 'translate(0, 0) scale(1) rotateY(1080deg)', opacity: 1, offset: 1 },
    ], { duration: 3200 * speed, delay: 900 * speed, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'both' });
  }

  const rest = teams.slice(podiums.length);
  return h('div', { class: 'scene scene-teams' }, svg,
    rest.length ? h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '1.5vh', gap: '1vw' } },
      rest.map((t) => h('span', { class: 'chip', style: { borderBottom: `6px solid ${t.color}` } }, opts.points ? `${t.name} · ${t.points ?? 0}` : t.name))) : '',
    opts.banner || '');
}

// ---------- Moderationspult mit austauschbaren 3D-Avataren ----------
// Grundlage ist das Pultbild ohne Personen (938 × 530). Hinter dem Pult stehen
// Moderation und Co-Moderation; ohne eigenen Avatar die Standardfiguren.
const PW = 938, PH = 530, DESK_Y = 299;
const pc = (v, t) => `${(v / t) * 100}%`;
const DEFAULT_AV = {
  host: { src: 'assets/img/avatar-host.webp', box: [334, 215, 430, DESK_Y] },
  cohost: { src: 'assets/img/avatar-cohost.webp', box: [461, 210, 525, DESK_Y] },
};

function avatarSlot(src, cx, frame = ROOM_FRAME) {
  // Steht hinter dem Pult: Behälter = unsichtbarer Rahmen, endet an der Pultkante.
  const img = h('img', { src, alt: '', style: { position: 'absolute', visibility: 'hidden' } });
  const top = DESK_Y + 2 - frame.h * 1.3;
  const box = h('div', { class: 'pult-av fit', style: { left: pc(cx - frame.w / 2, PW), top: pc(top, PH), width: pc(frame.w, PW), height: pc(DESK_Y + 2 - top, PH) } }, img);
  figureBox(src).then((b) => {
    if (!b) { img.style.visibility = ''; return; }
    const { s, mid, bottom } = computeFrame(b, frame);
    const hh = DESK_Y + 2 - top;
    Object.assign(img.style, {
      left: pc(frame.w / 2 - mid * s, frame.w), top: pc(DESK_Y + 2 - top - bottom * s + 2, hh),
      width: pc(b.W * s, frame.w), height: 'auto', visibility: '',
    });
  });
  return box;
}

// who: 'both' (Moderation + Co-Moderation) oder 'cohost' (nur Co-Moderation in der Mitte, Finale)
export function pultLayers(show, who = 'both') {
  const out = [studioRoom('pult-bg')];
  if (who === 'both') {
    out.push(avatarSlot(show.hostAvatar || DEFAULT_AV.host.src, 385, { w: 112, h: 100 }));
    out.push(avatarSlot(show.coHostAvatar || DEFAULT_AV.cohost.src, 500, { w: 112, h: 100 }));
  } else {
    out.push(avatarSlot(show.coHostAvatar || DEFAULT_AV.cohost.src, 442));
  }
  return out;
}
export const PULT = { W: PW, H: PH, DESK_Y, pc };

// ---------- Avatar füllend hinter ein Pult stellen ----------
// Ermittelt die sichtbare Figur (Alphakanal) und ihre Kopfbreite. Skaliert wird
// über den Kopf, damit Brustbilder und Ganzkörperfiguren gleich groß wirken:
// Kopf ≈ 84 Einheiten, Schultern damit etwa so breit wie die Pultoberseite.
// Über der Pultkante sind Kopf, Schultern und Oberkörper zu sehen.
// Unsichtbarer Rahmen je Pult: Die Figur (Kopf bis Hüfte) wird so groß wie möglich
// hineingesetzt, aber nie breiter oder höher – nichts ragt seitlich über das Pult.
// Seitenpulte (Einheiten des Pult-SVG): Rahmen über dem ganzen Pult (Oberseite und Schräge).
const SIDE_FRAME = { w: 250, h: 240 };
// Oberkante des Finalpult-Bilds (x → y ab Bildoberkante), für die Verdeckung an der Schräge
const PULT_TOP = [[20, 274], [40, 234], [60, 194], [80, 154], [100, 114], [120, 74], [140, 37], [160, 35], [180, 33], [200, 15], [220, 14], [260, 12], [300, 11], [340, 9], [394, 8]];
// Moderationspult in der Mitte (Raumeinheiten 938 × 530)
const ROOM_FRAME = { w: 132, h: 110 };
const boxCache = new Map();
function figureBox(src) {
  if (boxCache.has(src)) return boxCache.get(src);
  const p = new Promise((resolve) => {
    const im = new Image();
    im.onload = () => {
      const W = im.naturalWidth, H = im.naturalHeight;
      let box = { W, H, x0: 0, y0: 0, x1: W, y1: H, head: W * 0.4 };
      try {
        const k = Math.min(1, 240 / Math.max(W, H));
        const w = Math.max(1, Math.round(W * k)), hh = Math.max(1, Math.round(H * k));
        const c = document.createElement('canvas');
        c.width = w; c.height = hh;
        const ctx = c.getContext('2d');
        ctx.drawImage(im, 0, 0, w, hh);
        const d = ctx.getImageData(0, 0, w, hh).data;
        const rows = [];
        let x0 = w, y0 = hh, x1 = -1, y1 = -1;
        for (let y = 0; y < hh; y++) {
          let a = -1, b = -1, run = 0, best = 0;
          for (let x = 0; x < w; x++) {
            if (d[(y * w + x) * 4 + 3] > 60) { if (a < 0) a = x; b = x; run++; if (run > best) best = run; } else run = 0;
          }
          rows.push(a < 0 ? null : [a, b, best]);
          if (a >= 0) { x0 = Math.min(x0, a); x1 = Math.max(x1, b); if (y < y0) y0 = y; y1 = y; }
        }
        if (x1 >= 0) {
          const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
          // Kopf: breiteste Zeile im oberen Bereich (ca. ein Drittel einer Kopf-und-Schulter-Höhe)
          const lim = y0 + Math.max(2, Math.round(Math.min(bh, bw * 1.2) * 0.3));
          let head = 0;
          // längstes zusammenhängendes Stück je Zeile: bei zwei Personen nur ein Kopf
          // Von oben nach unten bis zum Sprung an den Schultern (Breite springt deutlich).
          const minRows = Math.max(3, Math.round(bh * 0.03));
          // Kopf = breiteste Stelle bis zum Hals (Breite fällt deutlich ab) bzw. bis zu
          // einem plötzlichen Sprung (Schultern).
          for (let y = y0, n = 0; y <= Math.min(hh - 1, y0 + Math.round(bh * 0.35)); y++, n++) {
            const wRun = rows[y] ? rows[y][2] : 0;
            if (n >= minRows * 2 && head > 0 && (wRun < head * 0.85 || wRun > head * 1.45)) break;
            if (y <= lim) head = Math.max(head, wRun);
          }
          box = { W, H, x0: x0 / k, y0: y0 / k, x1: (x1 + 1) / k, y1: (y1 + 1) / k, head: Math.max(head, bw * 0.12) / k, rows, k };
        }
      } catch { /* fremde Quelle: ganzes Bild nehmen */ }
      resolve(box);
    };
    im.onerror = () => resolve(null);
    im.src = src;
  });
  boxCache.set(src, p);
  return p;
}

// Sichtbarer Teil: von oben bis etwa zur Hüfte (3,4 Kopfbreiten), bei Brustbildern
// bis knapp über die Bildunterkante. Rückgabe: Maßstab s, Mitte und Unterkante
// des sichtbaren Teils (in Bildpixeln).
function computeFrame(b, frame) {
  const figH = b.y1 - b.y0;
  // Ganzkörperfigur (mehr als sechs Kopfbreiten hoch): höchstens die obere Hälfte bis zur Hüfte
  const visSrc = Math.min(figH * (figH / b.head > 6 ? 0.45 : 0.92), b.head * 3.4);
  let l = b.x0, r = b.x1;
  if (b.rows) {
    l = Infinity; r = -Infinity;
    const y1 = Math.min(b.rows.length - 1, Math.round((b.y0 + visSrc) * b.k));
    for (let yy = Math.round(b.y0 * b.k); yy <= y1; yy++) {
      const row = b.rows[yy];
      if (row) { l = Math.min(l, row[0] / b.k); r = Math.max(r, (row[1] + 1) / b.k); }
    }
    if (!isFinite(l)) { l = b.x0; r = b.x1; }
  }
  const s = Math.min(frame.w / (r - l), frame.h / visSrc);
  return { s, mid: (l + r) / 2, bottom: b.y0 + visSrc };
}

function fitAvatar(img, src, cx, deskY) {
  figureBox(src).then((b) => {
    if (!b) return;
    const { s, mid, bottom } = computeFrame(b, SIDE_FRAME);
    img.setAttribute('preserveAspectRatio', 'none');
    img.setAttribute('width', b.W * s);
    img.setAttribute('height', b.H * s);
    img.setAttribute('x', cx - mid * s);
    img.setAttribute('y', deskY + 4 - bottom * s);
  });
}

// ---------- Einzelnes Finalpult (Vorlage: Fabians Finalbild) ----------
// Das Pult ist ein freigestelltes Bild; rechts wird es gespiegelt. Der Avatar steht
// dahinter, extra (z. B. die Münzen des Teams) liegt oben auf dem Pult.
export function singlePodium({ avatar, color, label, mirror = false, extra = null }) {
  const VW = 394, VH = 560, PY = VH - 342;
  const svg = el('svg', { class: 'single-podium', viewBox: `0 0 ${VW} ${VH}`, role: 'img', 'aria-label': label || '' });
  const cx = mirror ? 100 : 294;
  const fcx = mirror ? 124 : 270; // Mitte des unsichtbaren Rahmens
  // Avatar so breit wie die Pultoberseite, unten bündig hinter der Pultkante (Oberkörper hinter dem Pult).
  if (avatar) {
    // Die Person steht hinter dem Pult: nie breiter als die Pultoberseite und
    // unterhalb der Pultkante komplett verdeckt.
    const clipId = `sp${++uid}`;
    const clip = el('clipPath', { id: clipId });
    const fl = fcx - SIDE_FRAME.w / 2, fr = fcx + SIDE_FRAME.w / 2;
    const prof = PULT_TOP.map(([x, y]) => [mirror ? VW - x : x, PY + y + 2]).filter(([x]) => x >= fl && x <= fr);
    prof.sort((a, b) => a[0] - b[0]);
    const yAt = (x) => { const m = PULT_TOP.map(([px, py]) => [mirror ? VW - px : px, PY + py + 2]).sort((a, b) => Math.abs(a[0] - x) - Math.abs(b[0] - x))[0]; return m[1]; };
    clip.append(el('polygon', { points: [[fl, -800], [fr, -800], [fr, yAt(fr)], ...prof.reverse(), [fl, yAt(fl)]].map((q) => q.join(',')).join(' ') }));
    const fx = el('filter', { id: `${clipId}-l`, 'color-interpolation-filters': 'sRGB' });
    fx.append(el('feColorMatrix', { type: 'matrix', values: '0.9 0 0 0 0  0 0.92 0 0 0.004  0 0 0.98 0 0.015  0 0 0 1 0' }));
    const defs = el('defs');
    defs.append(clip, fx);
    svg.append(defs);
    const img = el('image', { href: avatar, class: 'sp-avatar', x: cx - 92, y: PY - 228, width: 184, height: 240, preserveAspectRatio: 'xMidYMax meet', 'clip-path': `url(#${clipId})`, filter: `url(#${clipId}-l)` });
    svg.append(img);
    fitAvatar(img, avatar, fcx, PY);
  }
  svg.append(el('ellipse', { cx: VW / 2, cy: VH - 8, rx: 180, ry: 12, fill: '#000', opacity: 0.45 }));
  svg.append(el('image', { href: 'assets/img/finale-pult.webp', x: 0, y: PY, width: VW, height: 342, transform: mirror ? `translate(${VW} 0) scale(-1 1)` : null }));
  const top = h('div', { class: 'sp-top', style: { left: `${((mirror ? 6 : 200) / VW) * 100}%`, width: `${(188 / VW) * 100}%`, top: `${((PY - 34) / VH) * 100}%`, height: `${(44 / VH) * 100}%` } }, extra);
  return h('div', { class: 'single-podium-wrap', '--team': color || '#fff' }, svg, extra ? top : null);
}
