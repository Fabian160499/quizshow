// Kassenschlager: Hinweis-Wand als Mosaik (Beamer und iPad), angelehnt an
// Fabians Vorlage: schwarze Kacheln in goldenem Rahmen, oben klein der
// Hinweisname, darunter groß der Inhalt; Fotos füllen ihre Kachel.
// Feste Anordnung für die zehn Hinweise: große Felder für die Bild-Hinweise
// (9. Standbild, 10. Filmskizze), breite für Regie, Hauptrolle, Zitat, Nebenfigur.

import { h, mediaUrl } from './client.js';

// Rasterfeld je Hinweis (Index 0–9), passend zu grid-template-areas in style.css.
const AREA = ['b', 'f', 'c', 'e', 'j', 'g', 'h', 'd', 'a', 'i'];

// hints: [{ label, price, text, photo, open, by: [Node], solved, onBuy, disabled, onZoom }]
// opts: { reveal: bool (aufdecken mit Animation), cls, layout: [Feld je Hinweis] }
export function ksWall(hints, opts = {}) {
  return h('div', { class: `ksw${opts.cls ? ` ${opts.cls}` : ''}` }, hints.map((x, i) => {
    const placeholder = x.text && /^\(.*\)$/.test(x.text.trim()); // „(Bild ergänzen)“ nicht zeigen
    let body;
    if (x.open && x.photo) {
      const im = h('img', { class: 'ksw-photo', alt: x.label });
      if (x.onZoom) im.addEventListener('click', (ev) => { ev.stopPropagation(); x.onZoom(im.src, x.label); });
      mediaUrl(x.photo.id).then((u) => { if (u) im.src = u; });
      // Foto oben, darunter Bildunterschrift und Käufer – nichts liegt über dem Bild.
      body = [h('div', { class: 'ksw-photo-box' }, im), x.text && !placeholder ? h('div', { class: 'ksw-cap' }, x.text) : null];
    } else if (x.open) {
      body = [h('small', { class: 'ksw-label' }, `${x.label}:`), h('b', { class: `ksw-value${x.text && x.text.length > 90 ? ' long' : x.text && x.text.length > 40 ? ' mid' : ''}` }, x.text && !placeholder ? x.text : '–')];
    } else {
      body = [h('small', { class: 'ksw-label' }, x.label), h('b', { class: 'ksw-price' }, `${x.price} $`)];
    }
    const cls = `ksw-tile${x.open ? ' open' : ' covered'}${x.open && x.photo ? ' photo' : ''}${x.solved ? ' solved' : ''}${x.mine ? ' mine' : ''}${opts.reveal && x.open ? ' flip' : ''}`;
    const attrs = { class: cls, style: { gridArea: (opts.layout && opts.layout[i]) || AREA[i] || 'auto', animationDelay: opts.reveal ? `${0.3 + i * 0.22}s` : null } };
    const tag = x.onBuy && !x.open ? 'button' : 'div';
    if (tag === 'button') { attrs.disabled = !!x.disabled; attrs.onclick = x.onBuy; attrs.type = 'button'; }
    return h(tag, attrs, h('span', { class: 'ksw-no' }, String(i + 1)), x.open ? h('span', { class: 'ksw-pr' }, `${x.price} $`) : null, ...body,
      x.by && x.by.length ? h('div', { class: 'ksw-by' }, x.by) : null);
  }));
}
