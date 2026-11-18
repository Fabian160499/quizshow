// Bild zuschneiden (Editor): ein Rahmen im Seitenverhältnis der Kachel, verschieben und in der Größe
// ändern; das Ergebnis wird als neues Bild hochgeladen. Für Bilder, die nicht zum Format der Kachel
// passen (z. B. Hochformat in einer breiten Kachel) – so füllen sie die Kachel statt klein zu wirken.
import { h, showModal, toast } from './client.js';

const MAX_EDGE = 2400; // längste Kante des Ergebnisses (reicht für Beamer in Full HD und mehr)

// src: Bild-URL; ratio: Breite/Höhe des Rahmens; name: Dateiname; onSave(file)
export function openImageCrop({ src, ratio = 2, name = 'Bild', title = '✂ Bild zuschneiden', onSave }) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  const view = h('div', { class: 'imgcrop-view' });
  const frame = h('div', { class: 'imgcrop-frame' });
  const size = h('input', { type: 'range', min: '20', max: '100', value: '100', 'aria-label': 'Größe des Ausschnitts' });
  const info = h('span', { class: 'muted small' });
  const save = h('button', { type: 'button', class: 'btn' }, '✂ Zuschnitt übernehmen');
  let W = 0, H = 0; // Anzeigegröße des Bildes
  let fw = 0, fh = 0, fx = 0, fy = 0; // Rahmen in Anzeige-Pixeln
  const maxFrame = () => (W / H > ratio ? [H * ratio, H] : [W, W / ratio]);
  const place = () => {
    const [mw, mh] = maxFrame();
    const k = Number(size.value) / 100;
    const cx = fx + fw / 2, cy = fy + fh / 2;
    fw = mw * k; fh = mh * k;
    fx = Math.max(0, Math.min(W - fw, (fw ? cx : W / 2) - fw / 2));
    fy = Math.max(0, Math.min(H - fh, (fh ? cy : H / 2) - fh / 2));
    draw();
  };
  const draw = () => {
    Object.assign(frame.style, { left: `${fx}px`, top: `${fy}px`, width: `${fw}px`, height: `${fh}px` });
    const s = img.naturalWidth / W;
    info.textContent = `Ausschnitt: ${Math.round(fw * s)} × ${Math.round(fh * s)} px`;
  };
  frame.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    frame.setPointerCapture(ev.pointerId);
    const sx = ev.clientX, sy = ev.clientY, ox = fx, oy = fy;
    const move = (m) => { fx = Math.max(0, Math.min(W - fw, ox + m.clientX - sx)); fy = Math.max(0, Math.min(H - fh, oy + m.clientY - sy)); draw(); };
    const up = () => { frame.removeEventListener('pointermove', move); frame.removeEventListener('pointerup', up); };
    frame.addEventListener('pointermove', move); frame.addEventListener('pointerup', up);
  });
  size.addEventListener('input', place);
  save.onclick = () => {
    const s = img.naturalWidth / W;
    const sw = fw * s, sh = fh * s;
    const k = Math.min(1, MAX_EDGE / Math.max(sw, sh));
    const c = document.createElement('canvas');
    c.width = Math.round(sw * k); c.height = Math.round(sh * k);
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, fx * s, fy * s, sw, sh, 0, 0, c.width, c.height);
    c.toBlob((blob) => {
      if (!blob) { toast('Zuschneiden hat nicht geklappt.'); return; }
      close();
      onSave(new File([blob], `${String(name).replace(/\.[^.]+$/, '')} (zugeschnitten).jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.9);
  };
  const body = h('div', { class: 'imgcrop' },
    h('p', { class: 'muted small' }, 'Rahmen verschieben und mit dem Regler vergrößern oder verkleinern. Der Rahmen hat das Format der Kachel auf dem Beamer.'),
    h('div', { class: 'imgcrop-stage' }, view),
    h('div', { class: 'row', style: { alignItems: 'center', gap: '10px' } }, h('span', {}, 'Größe'), size, info, h('span', { class: 'grow' }), save));
  const close = showModal(title, body, { wide: true });
  img.onload = () => {
    const maxW = Math.min(820, window.innerWidth - 80), maxH = Math.min(520, window.innerHeight - 260);
    const k = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
    W = Math.round(img.naturalWidth * k); H = Math.round(img.naturalHeight * k);
    img.className = 'imgcrop-img';
    Object.assign(view.style, { width: `${W}px`, height: `${H}px` });
    view.append(img, frame);
    place();
  };
  img.onerror = () => toast('Das Bild lässt sich nicht laden.');
  img.src = src;
}

// Maße eines Bildes (Datei oder URL) – für die Prüfung im Editor
export function imageSize(srcOrFile) {
  return new Promise((resolve) => {
    const im = new Image();
    const url = typeof srcOrFile === 'string' ? srcOrFile : URL.createObjectURL(srcOrFile);
    im.onload = () => { resolve({ w: im.naturalWidth, h: im.naturalHeight }); if (typeof srcOrFile !== 'string') URL.revokeObjectURL(url); };
    im.onerror = () => resolve(null);
    im.src = url;
  });
}
