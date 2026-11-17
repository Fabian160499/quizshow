// Pult-Leiste auf den Team-iPads (Fabian, 17.11.2026): ein Pult je Team im Studio-Look
// (Bogen mit Neonringen in Teamfarbe, Pult mit Punkteanzeige und Teamname), sortiert von
// links nach rechts nach Punkten (meiste zuerst). Bei Plus- oder Minuspunkten rutschen die
// Pulte animiert an ihren neuen Platz. Das eigene Pult ist immer hervorgehoben.
// Spiele, in denen ein anderes Team gewählt wird, nutzen direkt diese Pulte (Antippen).
// Die Punkte sind der öffentliche Stand: geheime Bewertungen zählen erst nach der Auflösung.

import { h } from './client.js';

let mounted = null;
let data = { teams: [], pults: null, me: null, hidden: true };
let pick = null;
let prev = null;

// Auswahl über die Pulte: { ids, onPick, label, marks } – oder null.
// sticky: bleibt über Neuaufbauten der Seite bestehen (z. B. Joker-Ziel), bis es aufgehoben wird.
let sticky = null;
export function setPultPick(cfg, opts = {}) {
  if (opts.sticky) sticky = cfg;
  else pick = cfg;
  if (mounted) draw();
}
export function clearStickyPick() { sticky = null; if (mounted) draw(); }
export function resetPultPick() { pick = null; }
const activePick = () => sticky || pick;

export function updatePults(el, next) {
  mounted = el;
  data = next;
  draw();
}

const reduce = () => document.documentElement.classList.contains('reduced-motion');

function draw() {
  const el = mounted;
  const pick = activePick();
  const { teams, pults, me, hidden } = data;
  el.hidden = !!hidden || !teams.length;
  if (el.hidden) return;
  el.classList.toggle('picking', !!pick);
  const pts = pults ? Object.fromEntries(pults.map((p) => [p.id, p.points])) : null;
  const order = pts ? [...teams].sort((a, b) => (pts[b.id] - pts[a.id]) || (teams.indexOf(a) - teams.indexOf(b))) : teams;
  // FLIP: alte Positionen merken, Knoten wiederverwenden, dann von alt nach neu gleiten
  const old = {};
  const nodes = {};
  for (const c of el.querySelectorAll('.pult')) { old[c.dataset.id] = c.getBoundingClientRect().left; nodes[c.dataset.id] = c; }
  const row = el.querySelector('.pult-row') || el.appendChild(h('div', { class: 'pult-row' }));
  for (const id of Object.keys(nodes)) if (!teams.some((t) => t.id === id)) nodes[id].remove();
  const allowed = pick ? new Set(pick.ids) : null;
  order.forEach((t, i) => {
    let n = nodes[t.id];
    if (!n) {
      n = h('div', { class: 'pult', 'data-id': t.id },
        h('div', { class: 'pult-arch' }, h('i', { class: 'pult-rings' }), h('span', { class: 'pult-mark' })),
        h('div', { class: 'pult-desk' }, h('div', { class: 'pult-panel' }, h('span', { class: 'pult-names', 'aria-hidden': 'true' }), h('b', { class: 'pult-score' }))),
        h('span', { class: 'pult-name' }),
        h('span', { class: 'pult-delta', 'aria-hidden': 'true' }));
      n.addEventListener('click', () => { if (n._pick) n._pick(); });
      n.addEventListener('keydown', (ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && n._pick) { ev.preventDefault(); n._pick(); } });
    }
    n.style.setProperty('--team', t.color);
    n.classList.toggle('me', t.id === me);
    n.querySelector('.pult-name').textContent = t.id === me ? `${t.name} · ihr` : t.name;
    n.querySelector('.pult-names').textContent = Array.from({ length: 8 }, () => t.name.toUpperCase()).join(' ');
    const sc = n.querySelector('.pult-score');
    sc.textContent = pts ? String(pts[t.id]) : '';
    n.classList.toggle('no-score', !pts);
    n.querySelector('.pult-rank')?.remove();
    // Auswahl
    const can = !!allowed && allowed.has(t.id);
    n.classList.toggle('pick', can);
    n.classList.toggle('pick-off', !!allowed && !can);
    n._pick = can ? () => pick.onPick(t.id) : null;
    if (can) { n.setAttribute('role', 'button'); n.setAttribute('tabindex', '0'); n.setAttribute('aria-label', `${t.name}${pick.label ? ` – ${pick.label}` : ''}`); }
    else { n.removeAttribute('role'); n.removeAttribute('tabindex'); n.setAttribute('aria-label', `${t.name}${pts ? `: ${pts[t.id]} Punkte, Platz ${i + 1}` : ''}`); }
    const mk = pick && pick.marks ? pick.marks[t.id] : null;
    const me2 = n.querySelector('.pult-mark');
    me2.textContent = mk ? mk.text : '';
    me2.className = `pult-mark${mk ? ` on ${mk.cls || ''}` : ''}`;
    row.append(n);
  });
  // Gleiten und Punkte-Änderung
  for (const t of order) {
    const n = row.querySelector(`.pult[data-id="${t.id}"]`);
    const was = old[t.id];
    if (was !== undefined && !reduce()) {
      const dx = was - n.getBoundingClientRect().left;
      if (Math.abs(dx) > 1) n.animate([{ transform: `translateX(${dx}px)` }, { transform: 'translateX(0)' }], { duration: 900, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
    if (prev && pts && prev[t.id] !== undefined && prev[t.id] !== pts[t.id]) {
      const d = pts[t.id] - prev[t.id];
      const b = n.querySelector('.pult-delta');
      b.textContent = d > 0 ? `+${d}` : `−${Math.abs(d)}`;
      b.className = `pult-delta ${d > 0 ? 'up' : 'down'}`;
      void b.offsetWidth; // Animation neu starten
      b.classList.add('go');
      n.classList.remove('bump'); void n.offsetWidth; n.classList.add('bump', d > 0 ? 'bump-up' : 'bump-down');
      setTimeout(() => n.classList.remove('bump', 'bump-up', 'bump-down'), 1600);
    }
  }
  prev = pts;
}
