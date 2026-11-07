// Kartenansicht für „Ich sehe ein Land, das du nicht siehst“: Länderumrisse als
// SVG, Teampunkte und Zielort als Markierungen. Mit onPick wird die Karte
// antippbar und liefert Breiten- und Längengrad zurück.
//
// - kleine Markierungen, damit man präzise tippen kann
// - zoombar (Knöpfe + / −, Zwei-Finger-Zoom, mit einem Finger verschieben), wenn
//   zoom übergeben wird; Markierungen bleiben beim Zoomen gleich groß
// - Beschriftungen weichen einander aus (bei ähnlichen Tipps), mit Verbindungslinie

import { MAPS } from './map-data.js';

const NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}, ...children) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) node.setAttribute(k, v);
  for (const c of children) if (c) node.append(c);
  return node;
}

export function project(m, lat, lng) {
  let lon = lng;
  if (lon < m.lonMin) lon += 360;
  return [((lon - m.lonMin) / (m.lonMax - m.lonMin)) * m.width, ((m.latMax - lat) / (m.latMax - m.latMin)) * m.height];
}

export function unproject(m, x, y) {
  let lng = m.lonMin + (x / m.width) * (m.lonMax - m.lonMin);
  if (lng > 180) lng -= 360;
  const lat = m.latMax - (y / m.height) * (m.latMax - m.latMin);
  return { lat: Math.round(lat * 1000) / 1000, lng: Math.round(lng * 1000) / 1000 };
}

// Zoom-Zustand, der Neuzeichnen übersteht (z. B. nach dem Antippen auf dem iPad).
export function zoomState() {
  return { k: 1, cx: null, cy: null };
}

// Beschriftungen so verteilen, dass sie sich nicht überlappen.
// items: [{ x, y, w, h }] (Pin-Mitte, Textgröße) → [{ lx, ly }] linke Grundlinie
function placeLabels(items, pinR, bounds) {
  const placed = [];
  const pins = items.map((it) => ({ x0: it.x - pinR, y0: it.y - pinR, x1: it.x + pinR, y1: it.y + pinR }));
  const hit = (b) => placed.some((p) => b.x0 < p.x1 && b.x1 > p.x0 && b.y0 < p.y1 && b.y1 > p.y0)
    || pins.some((p) => b.x0 < p.x1 && b.x1 > p.x0 && b.y0 < p.y1 && b.y1 > p.y0);
  const out = [];
  const order = items.map((it, i) => i).sort((a, b) => items[a].y - items[b].y);
  const res = new Array(items.length);
  for (const i of order) {
    const it = items[i];
    let best = null;
    // Kandidaten: rechts, links, oben, unten, schräg – dann immer weiter weg
    for (let ring = 0; ring < 9 && !best; ring++) {
      const d = pinR * 1.6 + ring * it.h * 0.9;
      const cands = [
        [d, -it.h * 0.35], [-d - it.w, -it.h * 0.35], [-it.w / 2, -d - it.h * 0.2], [-it.w / 2, d + it.h * 0.75],
        [d * 0.8, -d * 0.8], [-d * 0.8 - it.w, -d * 0.8], [d * 0.8, d * 0.8 + it.h * 0.4], [-d * 0.8 - it.w, d * 0.8 + it.h * 0.4],
      ];
      for (const [dx, dy] of cands) {
        const lx = it.x + dx, ly = it.y + dy; // ly = Oberkante
        const b = { x0: lx - 3, y0: ly - 3, x1: lx + it.w + 3, y1: ly + it.h + 3 };
        if (b.x0 < bounds.x0 || b.x1 > bounds.x1 || b.y0 < bounds.y0 || b.y1 > bounds.y1) continue;
        if (!hit(b)) { best = { lx, ly, b, far: ring > 0 }; break; }
      }
    }
    if (!best) {
      const lx = Math.min(Math.max(it.x + pinR * 1.6, bounds.x0), bounds.x1 - it.w);
      best = { lx, ly: it.y - it.h * 0.35, b: { x0: lx, y0: it.y, x1: lx + it.w, y1: it.y + it.h }, far: false };
    }
    placed.push(best.b);
    res[i] = best;
  }
  for (let i = 0; i < items.length; i++) out.push(res[i]);
  return out;
}

// markers: [{ lat, lng, color, label, kind: 'team' | 'target' | 'pending', showLabel }]
// area: Umriss eines gesuchten Landes, Ringe aus [lng, lat] – wird hervorgehoben.
// zoom: Objekt aus zoomState() → Karte wird zoom- und verschiebbar.
export function mapView(name, { markers = [], onPick = null, label = 'Karte', area = null, zoom = null, fit = false } = {}) {
  const m = MAPS[name] || MAPS.Welt;
  const R = m.width / 160; // Grundgröße der Markierungen (klein, für präzises Tippen)
  const svg = el('svg', { viewBox: `0 0 ${m.width} ${m.height}`, width: String(m.width), height: String(m.height), class: `map${onPick ? ' pickable' : ''}`, role: 'img', 'aria-label': label });
  const world = el('g', { class: 'map-world' });
  world.append(el('rect', { x: 0, y: 0, width: m.width, height: m.height, class: 'sea' }));
  world.append(el('g', { class: `land${m.highlight !== undefined ? ' has-hl' : ''}` }, ...m.paths.map((d, i) => el('path', { d, class: i === m.highlight ? 'hl' : null }))));
  if (area && area.length) {
    const d = area.map((ring) => ring.map(([lng, lat], i) => { const [x, y] = project(m, lat, lng); return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`; }).join('') + 'Z').join('');
    world.append(el('path', { d, class: 'target-area' }));
  }
  // Punktradien um den Zielort (z. B. 100 km und 50 km), farbig – echte Kilometer auf der Karte.
  for (const mk of markers) {
    if (mk.kind !== 'target' || !mk.radii) continue;
    const [x, y] = project(m, mk.lat, mk.lng);
    let fs = null; // eine Schriftgröße für alle Radien (nach dem größten Kreis)
    for (const km of [...mk.radii].sort((a, b) => b - a)) {
      const [, yn] = project(m, mk.lat + km / 111.2, mk.lng);
      const [xe] = project(m, mk.lat, mk.lng + km / (111.32 * Math.max(0.05, Math.cos((mk.lat * Math.PI) / 180))));
      const rx = Math.abs(xe - x), ry = Math.abs(yn - y);
      world.append(el('ellipse', { cx: x, cy: y, rx, ry, class: `radius r${km}` }));
      if (fs === null) fs = Math.min(m.width / 60, ry * 0.2);
      // Größter Kreis: Beschriftung oben rechts, kleinerer: unten links (überdecken sich nicht).
      const big = km === Math.max(...mk.radii);
      const t = el('text', { x: big ? x + rx * 0.72 : x - rx * 0.72, y: big ? y - ry * 0.72 : y + ry * 0.72 + fs * 0.8, class: `radius-label r${km}`, 'font-size': fs, 'text-anchor': big ? 'start' : 'end' });
      t.textContent = `${km} km`;
      world.append(t);
    }
  }
  svg.append(world);
  const marks = el('g', { class: 'map-marks' });
  svg.append(marks);

  // Markierungen und Beschriftungen in Abhängigkeit vom Zoom zeichnen (gleiche Bildschirmgröße).
  const fontBase = m.width / 62;
  function drawMarks(vb) {
    const s = vb.w / m.width; // < 1 beim Hineinzoomen
    const r = R * s;
    marks.replaceChildren();
    const labels = [];
    for (const mk of markers) {
      const [x, y] = project(m, mk.lat, mk.lng);
      const title = mk.label ? el('title') : null;
      if (title) title.textContent = mk.label;
      if (mk.kind === 'target') {
        const t = r * 1.1;
        marks.append(el('g', { class: 'target', transform: `translate(${x} ${y})` },
          el('circle', { r: r * 2.3, class: 'ring', 'stroke-width': r * 0.45 }),
          el('path', { d: `M${-t} ${-t}L${t} ${t}M${-t} ${t}L${t} ${-t}`, class: 'cross', 'stroke-width': r * 0.5 }), title));
        continue;
      }
      marks.append(el('g', { class: `pin ${mk.kind || 'team'}`, transform: `translate(${x} ${y})` },
        el('circle', { r, fill: mk.color || '#fff', 'stroke-width': r * 0.35 }), title));
      if (mk.label && mk.showLabel) labels.push({ x, y, text: mk.label, color: mk.color });
    }
    if (!labels.length) return;
    const fs = fontBase * s;
    const items = labels.map((l) => ({ x: l.x, y: l.y, w: l.text.length * fs * 0.6 + fs * 0.6, h: fs * 1.25 }));
    const spots = placeLabels(items, r, { x0: vb.x, y0: vb.y, x1: vb.x + vb.w, y1: vb.y + vb.h });
    labels.forEach((l, i) => {
      const it = items[i], p = spots[i];
      const g = el('g', { class: 'pin-tag' });
      // Verbindungslinie, wenn die Beschriftung weiter weg steht
      const cx = Math.max(p.lx, Math.min(l.x, p.lx + it.w)), cy = Math.max(p.ly, Math.min(l.y, p.ly + it.h));
      if (Math.hypot(cx - l.x, cy - l.y) > r * 2.2) g.append(el('line', { x1: l.x, y1: l.y, x2: cx, y2: cy, class: 'pin-lead', stroke: l.color || '#fff', 'stroke-width': r * 0.3 }));
      g.append(el('rect', { x: p.lx, y: p.ly, width: it.w, height: it.h, rx: it.h * 0.25, class: 'pin-bg', stroke: l.color || '#fff', 'stroke-width': r * 0.25 }));
      const t = el('text', { x: p.lx + fs * 0.3, y: p.ly + it.h * 0.78, class: 'pin-label', 'font-size': fs });
      t.textContent = l.text;
      g.append(t);
      marks.append(g);
    });
  }

  // ---------- Zoom ----------
  const full = { x: 0, y: 0, w: m.width, h: m.height };
  let vb = { ...full };
  const apply = () => {
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    drawMarks(vb);
  };
  const setZoom = (k, cx, cy) => {
    k = Math.max(1, Math.min(12, k));
    const w = m.width / k, hgt = m.height / k;
    const x = Math.max(0, Math.min(m.width - w, cx - w / 2)), y = Math.max(0, Math.min(m.height - hgt, cy - hgt / 2));
    vb = { x, y, w, h: hgt };
    if (zoom) Object.assign(zoom, { k, cx: x + w / 2, cy: y + hgt / 2 });
    apply();
  };
  const toMap = (clientX, clientY) => {
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  };
  // fit: bei der Auflösung auf alle Tipps (und Ziel bzw. Land) heranzoomen.
  const fitBox = () => {
    const pts = markers.map((mk) => project(m, mk.lat, mk.lng));
    if (area && area.length) for (const ring of area) for (const [lng, lat] of ring) pts.push(project(m, lat, lng));
    if (!pts.length) return null;
    let x0 = Math.min(...pts.map((p) => p[0])), x1 = Math.max(...pts.map((p) => p[0]));
    let y0 = Math.min(...pts.map((p) => p[1])), y1 = Math.max(...pts.map((p) => p[1]));
    const w = Math.max((x1 - x0) * 1.6, ((y1 - y0) * 1.6 * m.width) / m.height, m.width / 7);
    return { k: Math.min(12, m.width / w), cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  };
  if (zoom && zoom.k > 1 && zoom.cx !== null) setZoom(zoom.k, zoom.cx, zoom.cy);
  else if (fit && fitBox()) { const f = fitBox(); setZoom(f.k, f.cx, f.cy); }
  else apply();

  let wrap = svg;
  if (zoom) {
    svg.classList.add('zoomable');
    const pointers = new Map();
    let start = null, moved = false, pinch = null;
    svg.addEventListener('pointerdown', (ev) => {
      svg.setPointerCapture?.(ev.pointerId);
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      moved = false;
      if (pointers.size === 1) start = { x: ev.clientX, y: ev.clientY, vb: { ...vb } };
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const mid = toMap((a.x + b.x) / 2, (a.y + b.y) / 2);
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: m.width / vb.w, mid };
      }
    });
    svg.addEventListener('pointermove', (ev) => {
      if (!pointers.has(ev.pointerId)) return;
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pointers.size === 2 && pinch) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        moved = true;
        setZoom(pinch.k * (d / pinch.d), pinch.mid.x, pinch.mid.y);
      } else if (pointers.size === 1 && start && vb.w < m.width) {
        const dxPx = ev.clientX - start.x, dyPx = ev.clientY - start.y;
        if (Math.hypot(dxPx, dyPx) > 8) moved = true;
        if (!moved) return;
        const rect = svg.getBoundingClientRect();
        const sx = start.vb.w / rect.width, sy = start.vb.h / rect.height;
        setZoom(m.width / start.vb.w, start.vb.x + start.vb.w / 2 - dxPx * sx, start.vb.y + start.vb.h / 2 - dyPx * sy);
      }
    });
    const end = (ev) => {
      pointers.delete(ev.pointerId);
      if (pointers.size < 2) pinch = null;
      if (!pointers.size) start = null;
    };
    svg.addEventListener('pointerup', end);
    svg.addEventListener('pointercancel', end);
    svg.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const p = toMap(ev.clientX, ev.clientY);
      setZoom((m.width / vb.w) * (ev.deltaY < 0 ? 1.25 : 0.8), p.x, p.y);
    }, { passive: false });
    // Klick nach dem Verschieben/Zoomen nicht als Tipp werten
    svg.addEventListener('click', (ev) => { if (moved) { ev.stopImmediatePropagation(); moved = false; } }, true);
    const zbtn = (txt, title, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'map-zoom-btn';
      b.title = title;
      b.setAttribute('aria-label', title);
      b.textContent = txt;
      b.addEventListener('click', (ev) => { ev.stopPropagation(); fn(); });
      return b;
    };
    const center = () => ({ x: vb.x + vb.w / 2, y: vb.y + vb.h / 2 });
    const tools = document.createElement('div');
    tools.className = 'map-zoom';
    tools.append(
      zbtn('+', 'Hineinzoomen', () => { const c = center(); setZoom((m.width / vb.w) * 1.6, c.x, c.y); }),
      zbtn('−', 'Herauszoomen', () => { const c = center(); setZoom((m.width / vb.w) / 1.6, c.x, c.y); }),
      zbtn('⟲', 'Ganze Karte', () => setZoom(1, m.width / 2, m.height / 2)));
    wrap = document.createElement('div');
    wrap.className = 'map-zoom-wrap';
    wrap.append(svg, tools);
  }

  if (onPick) {
    svg.addEventListener('click', (ev) => {
      const p = toMap(ev.clientX, ev.clientY);
      if (p.x < 0 || p.y < 0 || p.x > m.width || p.y > m.height) return;
      onPick(unproject(m, p.x, p.y));
    });
  }
  return wrap;
}
