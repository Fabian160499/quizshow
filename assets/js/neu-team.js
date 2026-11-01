// Team-iPad: Ansichten der sieben neuen Module (Master-Prompt „7 neue Module“).
// Große Touchflächen; Eingabe, Ändern, verbindliches Absenden und Sperre sind
// klar getrennt. Die Sichten kommen gefiltert vom Server.

import { h, run, mediaUrl } from './client.js';
import { hpBar } from './neu-beamer.js';

// Punktwerte aus dem Editor (über den Server), sonst Standard.
const pv = (g, k, d = 1) => (g && g.scoring && typeof g.scoring[k] === 'number' ? g.scoring[k] : d);
const plus = (n) => `${n >= 0 ? '+' : '−'}${Math.abs(n)}`;


const pts = (n) => `${n} ${Math.abs(n) === 1 ? 'Punkt' : 'Punkte'}`;
function stateBox(kind, sym, text) {
  return h('div', { class: `state ${kind}`, role: 'status' }, h('span', { class: 'sym', 'aria-hidden': 'true' }, sym), text);
}
const wait = (big, small) => [h('div', { class: 'wait' }, h('p', { class: 'big' }, big), small ? h('p', { class: 'muted' }, small) : null)];
const muted = (t) => h('p', { class: 'muted' }, t);
const question = (t) => h('p', { class: 'question' }, t);
const img = (m, cls) => { const el = h('img', { class: cls, alt: '' }); if (m) mediaUrl(m.id).then((u) => { if (u) el.src = u; }); return el; };
const buzzButton = (label, enabled, onclick) => h('button', { class: 'buzzer', disabled: !enabled, 'aria-label': label, onclick }, 'BUZZ');
const fmtNum = (n) => (n === null || n === undefined ? '–' : Number(n).toLocaleString('de-DE'));

// Ziehen mit dem Finger (Pointer-Events, funktioniert auf dem iPad) + Antippen als
// Alternative. Ziele tragen data-drop; onDrop(key, dropValue) entscheidet.
function draggable(el, key, onDrop, onTap) {
  let start = null, ghost = null;
  el.addEventListener('pointerdown', (ev) => {
    if (ev.button > 0) return;
    start = { x: ev.clientX, y: ev.clientY, id: ev.pointerId };
    el.setPointerCapture?.(ev.pointerId);
  });
  el.addEventListener('pointermove', (ev) => {
    if (!start || ev.pointerId !== start.id) return;
    if (!ghost && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 10) {
      const r = el.getBoundingClientRect();
      ghost = el.cloneNode(true);
      ghost.classList.add('drag-ghost');
      Object.assign(ghost.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, pointerEvents: 'none', zIndex: 999 });
      ghost.dataset.dx = String(ev.clientX - r.left);
      ghost.dataset.dy = String(ev.clientY - r.top);
      document.body.append(ghost);
      document.body.classList.add('dragging-any');
      el.classList.add('dragging');
    }
    if (ghost) {
      ev.preventDefault();
      ghost.style.left = `${ev.clientX - Number(ghost.dataset.dx)}px`;
      ghost.style.top = `${ev.clientY - Number(ghost.dataset.dy)}px`;
      for (const t of document.querySelectorAll('[data-drop].over')) t.classList.remove('over');
      document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-drop]')?.classList.add('over');
    }
  });
  const end = (ev) => {
    if (!start || ev.pointerId !== start.id) return;
    const wasDrag = !!ghost;
    if (ghost) {
      ghost.remove();
      ghost = null;
      document.body.classList.remove('dragging-any');
      el.classList.remove('dragging');
      for (const t of document.querySelectorAll('[data-drop].over')) t.classList.remove('over');
      const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('[data-drop]');
      if (target) onDrop(key, target.dataset.drop);
    }
    start = null;
    if (!wasDrag && ev.type === 'pointerup') onTap?.(key);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.style.touchAction = 'none';
  el.addEventListener('click', (ev) => ev.stopPropagation());
}

// ---------- Blamieren oder Sortieren ----------
const sortDraft = {};
function sortieren(g, ui) {
  const out = [muted(`Aufgabe ${g.index + 1} von ${g.count}`), question(g.category)];
  const cardEl = (c, extra = '') => h('div', { class: `sort-card ${extra}` }, c.image ? img(c.image, 'sort-img') : null, c.label ? h('span', {}, c.label) : null);
  const byK = Object.fromEntries(g.cards.map((c) => [c.k, c]));
  if (g.evaluated) {
    out.push(stateBox(g.hits === 5 ? 'ok' : g.points ? '' : 'bad', '★', g.points === null ? 'Keine Abgabe' : `${pts(g.points)} – ${g.hits ?? g.points} von 5 an der richtigen Stelle`));
    out.push(h('ol', { class: 'sort-solution' }, g.solution.map((c, pos) => h('li', { class: g.order && g.order[pos] === pos ? 'ok' : 'bad' },
      h('b', {}, `${pos + 1}.`), cardEl(c), c.info ? h('small', {}, c.info) : null,
      g.order ? h('span', { class: 'mine' }, g.order[pos] === pos ? '✓' : `ihr: ${byK[g.order[pos]].label || 'Bild'}`) : null))));
    return out;
  }
  if (g.submitted) {
    out.push(stateBox('', '🔒', 'Abgegeben und gesperrt – wartet auf die Auflösung'));
    out.push(h('ol', { class: 'sort-slots done' }, g.order.map((k, pos) => h('li', {}, h('b', {}, `${pos + 1}`), cardEl(byK[k])))));
    return out;
  }
  if (!g.open) return [...out, stateBox('', '🔒', 'Abgabe geschlossen')];
  const d = (sortDraft[g.index] ||= { slots: [null, null, null, null, null], sel: null });
  const box = h('div', {});
  const draw = () => {
    const placed = new Set(d.slots.filter((x) => x !== null));
    const place = (k, target) => {
      const from = d.slots.indexOf(k);
      if (target === 'pool') { if (from >= 0) d.slots[from] = null; }
      else {
        const to = Number(target);
        const prev = d.slots[to];
        if (from >= 0) d.slots[from] = prev; // tauschen
        d.slots[to] = k;
      }
      d.sel = null;
      draw();
    };
    const tap = (k) => { d.sel = d.sel === k ? null : k; draw(); };
    const slots = h('ol', { class: 'sort-slots' }, d.slots.map((k, pos) => {
      const li = h('li', { 'data-drop': String(pos), class: k === null ? 'empty' : '', onclick: () => { if (d.sel !== null) place(d.sel, String(pos)); else if (k !== null) place(k, 'pool'); } },
        h('b', {}, `${pos + 1}`), k === null ? h('span', { class: 'muted' }, d.sel !== null ? 'hier ablegen' : 'leer') : null);
      if (k !== null) { const c = cardEl(byK[k], d.sel === k ? 'sel' : ''); draggable(c, k, place, tap); li.append(c); }
      return li;
    }));
    const pool = h('div', { class: 'sort-pool', 'data-drop': 'pool' }, g.cards.filter((c) => !placed.has(c.k)).map((c) => {
      const el = cardEl(c, d.sel === c.k ? 'sel' : '');
      draggable(el, c.k, place, tap);
      return el;
    }));
    const full = d.slots.every((x) => x !== null);
    const send = h('button', { class: 'btn pink huge', style: { width: '100%' }, disabled: !full, onclick: async () => {
      send.disabled = true;
      if (await run(ui.conn, 'play.submit', { order: d.slots })) delete sortDraft[g.index];
      else send.disabled = false;
    } }, full ? 'Absenden (verbindlich)' : `Noch ${d.slots.filter((x) => x === null).length} Plätze frei`);
    box.replaceChildren(muted('Karten auf die Plätze 1–5 ziehen oder antippen und dann einen Platz antippen. Bis zum Absenden könnt ihr alles ändern.'),
      slots, pool.childElementCount ? pool : null, send);
  };
  draw();
  out.push(box);
  return out;
}

// ---------- Riskier die Gier ----------
const gierDraft = {};
function gier(g, ui) {
  const r0 = g.evaluated ? g.result : null;
  const bal = h('div', { class: 'gier-balance' }, h('small', {}, 'Eure Lebensenergie (Gier-Punkte)'),
    hpBar({ color: ui.team.color, before: r0 ? r0.before : g.balance, after: g.balance, start: g.start, diff: r0 ? r0.diff : null, out: g.out, delay: 0.4, animate: !!r0 }));
  if (g.waiting) return [bal, ...wait('Gleich geht’s los!', 'Jedes Team startet mit 100 Lebenspunkten. Die Abweichung eurer Schätzung wird abgezogen – bei 0 ist Game Over.')];
  const out = [bal, muted(`Frage ${g.index + 1} von ${g.count}`), question(g.question)];
  if (g.evaluated) {
    const r = g.result;
    out.push(stateBox('', '💡', `Lösung: ${fmtNum(g.solution)} ${g.unit}`.trim()));
    if (r) {
      out.push(stateBox(r.out ? 'bad' : 'ok', r.out ? '✗' : '−', `Eure Schätzung ${fmtNum(r.value)} · Abweichung ${fmtNum(r.diff)} · Guthaben ${fmtNum(r.before)} → ${fmtNum(r.after)}${r.out ? ' – ausgeschieden' : ''}`));
    }
    if (g.standings && g.standings[0]) out.push(stateBox('ok', '🏆', `Platz ${g.standings[0].place}: ${pts(g.standings[0].points)}`));
    return out;
  }
  if (g.out) return [...out, stateBox('bad', '✗', `Game Over – ihr seid ausgeschieden${g.standings && g.standings[0] ? ` (Platz ${g.standings[0].place}, ${pts(g.standings[0].points)})` : ''}. Schaut zu, wie es weitergeht.`)];
  if (g.answered) return [...out, stateBox('', '🔒', `Abgegeben: ${fmtNum(g.value)} ${g.unit} – gesperrt`.trim())];
  if (!g.canAnswer) return [...out, stateBox('', '⏱', 'Zeit abgelaufen – wartet auf die Moderation')];
  const deadline = g.graceEndsAt && Date.now() > g.endsAt ? g.graceEndsAt : g.endsAt;
  out.push(h('p', { class: 'gier-time' }, g.graceEndsAt ? 'Nachfrist: ' : 'Noch ', h('b', { 'data-deadline': deadline }, '')));
  const d = (gierDraft[g.index] ||= { v: '' });
  const disp = h('div', { class: 'keypad-display' }, d.v || '0');
  const sendBtn = h('button', { class: 'key send', disabled: !d.v }, 'Absenden');
  const upd = () => { disp.textContent = d.v ? Number(d.v).toLocaleString('de-DE') : '0'; sendBtn.disabled = !d.v; };
  const key = (n) => h('button', { class: 'key', onclick: () => { if (d.v.length < 12) d.v = (d.v === '0' ? '' : d.v) + n; upd(); } }, n);
  sendBtn.onclick = async () => {
    sendBtn.disabled = true;
    if (await run(ui.conn, 'play.answer', { value: Number(d.v) })) delete gierDraft[g.index];
    else sendBtn.disabled = false;
  };
  upd();
  out.push(h('div', { class: 'keypad' }, disp,
    h('div', { class: 'keys' }, ...['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(key),
      h('button', { class: 'key clear', onclick: () => { d.v = d.v.slice(0, -1); upd(); } }, 'Löschen'), key('0'), sendBtn)),
  muted(g.unit ? `Antwort in ${g.unit}. Nach dem Absenden ist die Zahl verbindlich.` : 'Nach dem Absenden ist die Zahl verbindlich.'));
  return out;
}

// ---------- Quizzen, wo man steht ----------
const t100Draft = {};
function top100(g, ui) {
  const out = [muted(`Runde ${g.index + 1} von ${g.count}${g.period ? ` · ${g.period}` : ''}`), question(g.category),
    muted('Nennt einen Eintrag aus der Top-100-Liste – je weiter hinten er steht, desto mehr Punkte.'),
    h('div', { class: 't100-ladder' }, ['1–20', '21–40', '41–60', '61–80', '81–100'].map((r, i) => h('span', { '--h': `${55 + i * 11}%` }, h('b', {}, plus(pv(g, `group${i + 1}`, i + 1))), h('small', {}, r))))];
  if (g.evaluated) {
    out.push(g.rank ? stateBox('ok', '✓', `„${g.text}“ = Rang ${g.rank} (${g.entry}) – ${pts(g.points)}`) : stateBox('bad', '✗', `„${g.text || '–'}“ ist nicht in der Top 100 – 0 Punkte`));
    return out;
  }
  if (g.submitted) return [...out, stateBox('', '🔒', `Abgegeben: „${g.text}“ – gesperrt`)];
  if (!g.open) return [...out, stateBox('', '🔒', 'Abgabe geschlossen')];
  const input = h('input', { class: 'big-input', value: t100Draft[g.index] || '', maxlength: '120', placeholder: 'Euer Eintrag', autocomplete: 'off', oninput: (ev) => { t100Draft[g.index] = ev.target.value; } });
  out.push(h('form', { onsubmit: async (ev) => {
    ev.preventDefault();
    if (!input.value.trim()) return;
    if (await run(ui.conn, 'play.submit', { text: input.value })) delete t100Draft[g.index];
  } }, input, h('button', { class: 'btn pink huge', style: { width: '100%', marginTop: '12px' } }, 'Absenden (verbindlich)')));
  return out;
}

// ---------- 30 Seconds to Spaß ----------
function sekunden(g, ui) {
  const out = [muted(`Durchgang ${g.index + 1} von ${g.count} · Zielzeit ${g.seconds} Sekunden · Toleranz ± ${String(g.tol).replace('.', ',')} Sekunden`)];
  const sec = (x) => `${x.toFixed(1).replace('.', ',')} s`;
  if (g.result) {
    out.push(g.result.late ? stateBox('bad', '⏱', `Nicht gestoppt – ${g.result.correct} richtig, aber 0 Punkte`)
      : g.result.ok ? stateBox('ok', '★', `Gestoppt nach ${sec(g.result.elapsed)} – im Zeitfenster! ${g.result.correct} richtig = ${plus(g.result.points)}`)
        : stateBox('bad', '⏱', `Gestoppt nach ${sec(g.result.elapsed)} – außerhalb des Zeitfensters. ${g.result.correct} richtig, aber 0 Punkte`));
    return out;
  }
  if (g.myTurn) {
    const running = g.phase === 'running';
    out.push(question(running ? 'Antwortet laut! Stoppt nach genau ' + g.seconds + ' Sekunden.' : 'Ihr seid dran!'),
      muted(running ? 'Es läuft keine sichtbare Uhr – zählt im Kopf mit. Drückt den Buzzer, wenn ihr glaubt, dass die Zeit um ist.' : 'Drückt den Buzzer, sobald ihr bereit seid – dann läuft die Zeit und die erste Frage kommt.'),
      h('button', { class: `buzzer sek-buzzer${running ? ' stop' : ''}`, 'aria-label': running ? 'Stopp' : 'Start', onclick: (ev) => { ev.currentTarget.disabled = true; run(ui.conn, 'play.buzz'); } }, running ? 'STOPP' : 'START'),
      running && g.answered ? muted(`${g.answered} ${g.answered === 1 ? 'Frage' : 'Fragen'} beantwortet`) : null);
    return out;
  }
  if (g.done) return [...out, stateBox('', '■', 'Durchgang beendet')];
  out.push(stateBox('', g.running ? '🎤' : '⏳', g.turnTeam ? `${ui.teamName(g.turnTeam)} ${g.running ? 'spielt gerade' : 'ist als Nächstes dran'}` : 'Gleich geht’s los'));
  return out;
}

// ---------- Wir sind ein Telepa-Team ----------
const alleinDraft = {};
function allein(g, ui) {
  const out = [muted(`Kategorie ${g.index + 1} von ${g.count}`), question(g.category),
    muted(`Es gibt ${g.total} richtige Antworten. Nennt eine, auf die sonst niemand kommt: Nur wer als einziges Team eine richtige Antwort nennt, bekommt ${plus(pv(g, 'correct'))}. Doppelte Antworten gehen leer aus.`)];
  if (g.evaluated) {
    if (!g.submitted) return [...out, stateBox('bad', '–', 'Keine Abgabe – 0 Punkte')];
    out.push(g.status === 'alone' ? stateBox('ok', '★', `„${g.text}“ – richtig und nur ihr! ${plus(g.points)}`)
      : g.status === 'double' ? stateBox('bad', '👥', `„${g.text}“ ist richtig – aber ${g.shared - 1 === 1 ? 'ein anderes Team hatte' : `${g.shared - 1} andere Teams hatten`} das auch. 0 Punkte`)
        : stateBox('bad', '✗', `„${g.text}“ ist nicht richtig – 0 Punkte`));
    return out;
  }
  if (g.submitted) return [...out, stateBox('', '🔒', `Abgegeben: „${g.text}“ – gesperrt`)];
  if (!g.open) return [...out, stateBox('', '🔒', 'Abgabe geschlossen')];
  const input = h('input', { class: 'big-input', value: alleinDraft[g.index] || '', maxlength: '120', placeholder: 'Eure Antwort', autocomplete: 'off', oninput: (ev) => { alleinDraft[g.index] = ev.target.value; } });
  out.push(h('form', { onsubmit: async (ev) => {
    ev.preventDefault();
    if (!input.value.trim()) return;
    if (await run(ui.conn, 'play.submit', { text: input.value })) delete alleinDraft[g.index];
  } }, input, h('button', { class: 'btn pink huge', style: { width: '100%', marginTop: '12px' } }, 'Absenden (verbindlich)')));
  return out;
}

// ---------- Ich bin ein Star, lüg mich nicht an ----------
const starPick = {};
function star(g, ui) {
  const out = [muted(`Rätsel ${g.index + 1} von ${g.count}`), h('p', { class: 'star-center' }, g.center), muted('Welcher Begriff ist falsch? Antippen (änderbar) und dann buzzern – beim Buzzern ist eure Wahl verbindlich.')];
  const sel = g.buzzed ? g.pick : starPick[g.index] ?? null;
  const grid = h('div', { class: 'star-terms' }, g.terms.map((t, i) => h('button', {
    class: `star-term${sel === i ? ' selected' : ''}${g.resolved && g.wrong === i ? ' wrong' : ''}`,
    disabled: !g.open || g.buzzed,
    onclick: () => { starPick[g.index] = i; for (const b of grid.children) b.classList.toggle('selected', b === grid.children[i]); buzz.disabled = false; },
  }, h('small', {}, `${i + 1}`), t)));
  const buzz = buzzButton('Buzzer', g.open && !g.buzzed && sel !== null, async () => {
    buzz.disabled = true;
    if (!(await run(ui.conn, 'play.buzz', { pick: starPick[g.index] }))) buzz.disabled = false;
  });
  out.push(grid);
  if (g.resolved) {
    out.push(g.won ? stateBox('ok', '✓', `Ihr wart die Schnellsten mit der richtigen Antwort: ${plus(pv(g, 'correct'))}!`)
      : g.pick === g.wrong ? stateBox('', '✓', 'Richtig – aber ein anderes Team war schneller.')
        : g.buzzed ? stateBox('bad', '✗', 'Leider daneben.') : stateBox('', '■', 'Rätsel aufgelöst'));
  } else if (g.buzzed) out.push(stateBox('', '🔔', `Gebuzzert als Nr. ${g.place} – eure Wahl: „${g.terms[g.pick]}“`));
  else if (g.open) out.push(buzz);
  return out;
}

// ---------- Remember the Timeline ----------
const tlSel = {};
function timeline(g, ui) {
  if (g.waiting) return wait('Gleich startet der Durchgang …');
  const out = [muted(`Durchgang ${g.index + 1} von ${g.count}`), question(g.category),
    h('div', { class: `tl-me ${g.state}` }, h('span', {}, 'Eure Punkte in diesem Durchgang'), h('b', {}, String(g.points)),
      g.state === 'out' ? h('small', {}, `ausgeschieden${g.lost ? ` – ${pts(g.lost)} verloren` : ''}`) : g.state === 'quit' ? h('small', {}, 'ausgestiegen – Punkte bleiben') : null)];
  if (g.last) out.push(stateBox(g.last.ok ? 'ok' : 'bad', g.last.ok ? '✓' : '✗', `${g.last.teamId === ui.team.id ? 'Ihr habt' : `${ui.teamName(g.last.teamId)} hat`} „${g.last.label}“ ${g.last.ok ? 'richtig eingeordnet' : 'falsch eingeordnet'}`));
  const sel = g.myTurn ? tlSel[g.index] ?? null : null;
  const place = async (k, pos) => { if (await run(ui.conn, 'play.place', { item: Number(k), pos: Number(pos) })) delete tlSel[g.index]; };
  // Senkrechter Zeitstrahl: oben früher, unten später. Ist ein Begriff gewählt, steht zwischen
  // je zwei Einträgen ein großes Feld „zwischen A und B“ – davor/danach ist klar beschriftet.
  const line = h('ol', { class: `tl-line${g.myTurn ? ' turn' : ''}${sel !== null ? ' picking' : ''}` });
  const selLabel = sel !== null ? (g.pool.find((p) => p.k === sel) || {}).label : 'Begriff';
  const gapText = (i) => {
    const before = g.line[i - 1], after = g.line[i];
    if (!before) return h('span', {}, h('b', {}, `„${selLabel}“`), ` früher als ${after.label} (${after.value})`);
    if (!after) return h('span', {}, h('b', {}, `„${selLabel}“`), ` später als ${before.label} (${before.value})`);
    return h('span', {}, h('b', {}, `„${selLabel}“`), ` zwischen ${before.value} und ${after.value}`);
  };
  const gap = (i) => h('li', { class: `tl-gap${sel !== null ? ' ready' : ''}`, 'data-drop': String(i), onclick: () => { if (sel !== null) place(sel, i); } },
    [h('i', { class: 'plus' }, '＋'), gapText(i)]);
  line.append(h('li', { class: 'tl-end' }, '▲ FRÜHER'));
  g.line.forEach((e, i) => {
    if (g.myTurn) line.append(gap(i));
    line.append(h('li', { class: `tl-item${e.ref ? ' ref' : ''}` }, h('span', { class: 'yr' }, e.value), h('b', {}, e.label)));
  });
  if (g.myTurn) line.append(gap(g.line.length));
  line.append(h('li', { class: 'tl-end' }, '▼ SPÄTER'));
  if (g.done) return [...out, stateBox('ok', '■', `Durchgang beendet – ${pts(g.points)} gutgeschrieben`), line];
  if (g.myTurn) {
    out.push(stateBox('ok', '👉', sel === null ? 'Ihr seid dran! 1. Begriff antippen  2. Stelle auf dem Zeitstrahl antippen (oder Begriff hinziehen).' : 'Jetzt die passende Stelle auf dem Zeitstrahl antippen – oben früher, unten später.'));
    const pool = h('div', { class: 'tl-pool' }, g.pool.map((p) => {
      const el = h('div', { class: `tl-card${sel === p.k ? ' sel' : ''}` }, p.label);
      draggable(el, p.k, place, (k) => { tlSel[g.index] = tlSel[g.index] === k ? null : k; redraw(); });
      return el;
    }));
    out.push(pool);
  } else if (g.state === 'active') {
    out.push(stateBox('', '⏳', g.turnTeam ? `${ui.teamName(g.turnTeam)} ist am Zug` : 'Warten …'));
  }
  out.push(line);
  if (g.state === 'active') out.push(h('button', { class: 'btn ghost', style: { marginTop: '12px' }, onclick: () => run(ui.conn, 'play.quit') }, `Aussteigen und ${pts(g.points)} behalten`));
  const wrap = h('div', {}, ...out);
  function redraw() { wrap.replaceWith(...[timeline(g, ui)].flat()); }
  return [wrap];
}

// ---------- Guck mal, wer da spricht ----------
function chat(g, ui) {
  const out = [muted(`Chat ${g.index + 1} von ${g.count} · ${g.shown} von 8 Nachrichten`),
    h('div', { class: 'phone-chat small' }, h('div', { class: 'pc-head' }, g.person || 'Unbekannt'),
      h('div', { class: 'pc-body' }, g.messages.map((m) => h('div', { class: `pc-msg ${m.right ? 'right' : 'left'}` }, m.text))))];
  if (g.ownStatus === 'correct') return [...out, stateBox('ok', '✓', `Richtig! ${plus(pv(g, 'correct'))}`)];
  if (g.resolved) return [...out, stateBox('', '■', g.person ? `Gesucht war: ${g.person}` : 'Chat beendet')];
  if (g.locked) return [...out, stateBox('bad', '✗', 'Falsch – für diesen Chat gesperrt')];
  if (g.answering) return [...out, stateBox('', '🎤', 'Ihr seid dran – antwortet laut!')];
  if (g.buzzed) return [...out, stateBox('', '⏳', 'Gebuzzert – ihr seid in der Warteschlange')];
  out.push(g.shown < 1 ? muted('Der Buzzer ist frei, sobald die erste Nachricht da ist.') : muted('Wisst ihr, wer da schreibt? Dann buzzern!'));
  out.push(buzzButton('Buzzer', g.canBuzz, () => run(ui.conn, 'play.buzz')));
  return out;
}

// ---------- Host du das Zeug dafür? ----------
const hdDraft = {};
function hostdu(g, ui) {
  const out = [muted(`Frage ${g.index + 1} von ${g.count}`), question(g.question)];
  if (g.phase === 'submit') {
    if (g.submitted) return [...out, stateBox('', '🔒', `Eingereicht: „${g.text}“ – sobald alle Teams eingereicht haben, wird abgestimmt.`)];
    const input = h('input', { class: 'big-input', value: hdDraft[g.index] || '', maxlength: '120', placeholder: 'Eure Antwort (gern auch erfunden!)', autocomplete: 'off', oninput: (ev) => { hdDraft[g.index] = ev.target.value; } });
    out.push(muted('Schreibt eine Antwort – richtig oder so überzeugend erfunden, dass andere Teams darauf hereinfallen.'),
      h('form', { onsubmit: async (ev) => { ev.preventDefault(); if (!input.value.trim()) return; if (await run(ui.conn, 'play.submit', { text: input.value })) delete hdDraft[g.index]; } },
        input, h('button', { class: 'btn pink huge', style: { width: '100%', marginTop: '12px' } }, 'Einreichen (verbindlich)')));
    return out;
  }
  if (g.phase === 'review') return [...out, stateBox('', '⏳', 'Alle haben eingereicht – die Moderation bereitet die Antwortmöglichkeiten vor …')];
  const revealed = g.phase === 'revealed';
  out.push(h('div', { class: 'hd-options' }, g.options.map((o) => h('button', {
    class: `hd-opt${o.own ? ' own' : ''}${g.voted === o.letter ? ' selected' : ''}${revealed && g.correct === o.letter ? ' correct' : ''}`,
    disabled: o.own || !!g.voted || revealed,
    onclick: () => run(ui.conn, 'play.vote', { letter: o.letter }),
  }, h('b', {}, o.letter), h('span', {}, o.text), o.own ? h('small', {}, 'eure Antwort – nicht wählbar') : null))));
  if (revealed) {
    const r = g.result || { regular: 0, deceive: 0 };
    out.push(stateBox(r.regular + r.deceive ? 'ok' : '', '★', `${g.voted === g.correct ? `Richtig gewählt: ${plus(r.regular)}` : 'Nicht die richtige Antwort'} · Getäuscht: +${r.deceive} · zusammen ${pts(r.regular + r.deceive)}`));
  } else if (g.voted) out.push(stateBox('', '🔒', `Gewählt: ${g.voted} – gesperrt`));
  else out.push(muted('Wählt die Antwort, die ihr für richtig haltet. Eure eigene ist gesperrt.'));
  return out;
}

export const TEAM_NEU = { sortieren, gier, top100, star, timeline, chat, hostdu, allein, sekunden };
