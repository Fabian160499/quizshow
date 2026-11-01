// Regie-Steuerung der sieben neuen Module. Die Regie sieht den vollständigen
// Zustand (Antworten, Lösungen, Zuordnungen); Beamer und Teams nur gefilterte Sichten.

import { h } from './client.js';

// Punktwerte aus dem Editor, sonst Standard.
const pvc = (g, k, d = 1) => (g && g.content && g.content.scoring && typeof g.content.scoring[k] === 'number' ? g.content.scoring[k] : d);
const plus = (n) => `${n >= 0 ? '+' : '−'}${Math.abs(n)}`;


const pts = (n) => `${n} ${Math.abs(n) === 1 ? 'Punkt' : 'Punkte'}`;
const badge = (kind, text) => h('span', { class: `badge ${kind}` }, text);
const row = (...c) => h('div', { class: 'row', style: { marginTop: '12px' } }, ...c);
const btn = (cls, label, onclick, disabled = false) => h('button', { class: `btn ${cls}`, onclick, disabled }, label);
const muted = (t) => h('p', { class: 'muted' }, t);
const fmtNum = (n) => (n === null || n === undefined ? '–' : Number(n).toLocaleString('de-DE'));
const teamLi = (ui, id, ...rest) => h('li', {}, ui.dot(ui.teamColor(id)), h('span', { class: 'grow' }, h('b', {}, ui.teamName(id)), rest[0] ?? null), ...rest.slice(1));
function tabs(items, current, onPick, done = () => false) {
  return h('div', { class: 'row' }, items.map((label, i) =>
    h('button', { class: `btn small ${i === current ? 'pink' : 'ghost'}`, onclick: () => onPick(i) }, `${label}${done(i) ? ' ✓' : ''}`)));
}
const teamIds = (ui) => ui.S.project.teams.map((t) => t.id);

// ---------- Blamieren oder Sortieren ----------
function sortieren(ui, g, st) {
  const i = st.index ?? -1;
  const r = (st.rounds || {})[i];
  const out = [tabs(g.content.tasks.map((t, k) => t.category ? t.category.slice(0, 24) : `Aufgabe ${k + 1}`), i, (k) => ui.act('play.open', { index: k }), (k) => st.rounds?.[k]?.evaluated)];
  if (i < 0 || !r) return [...out, muted('Aufgabe öffnen: alle Teams sortieren gleichzeitig fünf Karten. Kein Timer. Je Element am richtigen Platz 1 Punkt.')];
  const task = g.content.tasks[i];
  out.push(h('p', {}, h('b', {}, task.category)), h('ol', { class: 'list' }, task.items.map((it) => h('li', {}, h('span', { class: 'grow' }, it.label || '(Bild)'), it.info ? badge('', it.info) : null))));
  const score = (o) => o.reduce((s, k, p) => s + (k === p ? 1 : 0), 0);
  out.push(h('ul', { class: 'list' }, teamIds(ui).map((id) => {
    const a = r.answers[id];
    return teamLi(ui, id, a ? ` – ${a.order.map((k) => task.items[k].label || 'Bild').join(' · ')}` : h('span', { class: 'muted' }, ' – sortiert noch'),
      a ? badge(r.evaluated ? 'ok' : '', r.evaluated ? `+${score(a.order)}` : `${score(a.order)} richtig`) : null);
  })));
  const all = teamIds(ui).every((id) => r.answers[id]);
  if (!r.evaluated) out.push(row(
    !r.closed && !all ? btn('ghost', 'Runde manuell schließen', () => ui.confirmAct('Abgabe schließen? Teams ohne Abgabe bekommen 0 Punkte.', 'play.close')) : null,
    btn('pink', 'Auflösen und Punkte vergeben', () => ui.act('play.evaluate'), !all && !r.closed)));
  else out.push(row(badge('ok', 'Aufgelöst')));
  return out;
}

// ---------- Riskier die Gier ----------
function gier(ui, g, st) {
  const i = st.index ?? -1;
  const r = (st.rounds || {})[i];
  const T = st.teams || {};
  const out = [tabs(g.content.questions.map((_, k) => `Frage ${k + 1}`), i, (k) => ui.act('play.open', { index: k }), (k) => st.rounds?.[k]?.evaluated)];
  out.push(h('ul', { class: 'list' }, teamIds(ui).map((id) => teamLi(ui, id, ` – Gier-Guthaben ${fmtNum(T[id] ? T[id].balance : 100)}`,
    T[id] && T[id].outRound !== null && T[id].outRound !== undefined ? badge('bad', `raus nach Frage ${T[id].outRound + 1}`) : badge('ok', 'dabei'),
    r && r.answers[id] !== undefined ? badge('', `Schätzung ${fmtNum(r.answers[id].value)}${r.answers[id].grace ? ' (Nachfrist)' : ''}`) : null))));
  if (i < 0 || !r) return [...out, muted('Frage öffnen: der 60-Sekunden-Countdown startet sofort. Danach kannst du 10 Sekunden Nachfrist für offene Teams freigeben.')];
  const q = g.content.questions[i];
  out.push(h('p', {}, q.question, ' · Lösung: ', h('b', {}, `${fmtNum(q.answer)} ${q.unit || ''}`)));
  const isOut = (id) => T[id] && T[id].outRound !== null && T[id].outRound !== undefined;
  if (!r.evaluated) {
    const now = Date.now();
    const over = now > r.endsAt;
    const graceRunning = r.graceEndsAt !== null && now <= r.graceEndsAt;
    const missing = teamIds(ui).filter((id) => !isOut(id) && r.answers[id] === undefined);
    out.push(row(
      h('span', {}, !over ? ['Läuft: ', h('b', { 'data-deadline': String(r.endsAt) }, '')] : graceRunning ? ['Nachfrist: ', h('b', { 'data-deadline': String(r.graceEndsAt) }, '')] : 'Zeit abgelaufen'),
      over && !graceRunning && missing.length ? btn('ghost', '+10 s Nachfrist für offene Teams', () => ui.act('play.grace')) : null,
      btn('pink', missing.length ? `Warten auf ${missing.map((id) => ui.teamName(id)).join(', ')}` : 'Auswerten', () => ui.act('play.evaluate'), missing.length > 0)));
    if (missing.length && over) out.push(muted('Jedes Team muss antworten – gib bei Bedarf noch einmal 10 Sekunden Nachfrist.'));
  } else {
    out.push(h('ul', { class: 'list' }, r.results.map((x) => teamLi(ui, x.teamId, ` – ${fmtNum(x.value)} (−${fmtNum(x.diff)}) · ${fmtNum(x.before)} → ${fmtNum(x.after)}`, x.out ? badge('bad', 'raus') : null))));
  }
  out.push(row(st.awarded ? badge('ok', `Spiel entschieden – Showpunkte ${[1, 2, 3, 4, 5, 6].map((n) => pvc(g, `place${n}`, [10, 6, 4, 3, 2, 1][n - 1])).join('/')} automatisch vergeben`)
    : badge('', 'Showpunkte werden automatisch vergeben: wer ausscheidet, sofort – das letzte Team am Ende')));
  return out;
}

// ---------- Quizzen, wo man steht ----------
function parseList(text) {
  return String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 100)
    .map((l, i) => { const name = l.replace(/^\d{1,3}\s*[.):-]\s*/, ''); return { rank: i + 1, name: name.split('/')[0].trim() }; });
}
const t100Points = (rank, g) => (rank >= 1 && rank <= 100 ? pvc(g, `group${Math.ceil(rank / 20)}`, Math.ceil(rank / 20)) : 0);
function top100(ui, g, st) {
  const i = st.index ?? -1;
  const r = (st.rounds || {})[i];
  const out = [tabs(g.content.rounds.map((rd, k) => rd.category ? rd.category.slice(0, 24) : `Runde ${k + 1}`), i, (k) => ui.act('play.open', { index: k }), (k) => st.rounds?.[k]?.evaluated)];
  if (i < 0 || !r) return [...out, muted('Runde öffnen: jedes Team nennt einen Eintrag. Rang 1–20 = 1, 21–40 = 2, 41–60 = 3, 61–80 = 4, 81–100 = 5 Punkte.')];
  const rd = g.content.rounds[i];
  const list = parseList(rd.entries);
  out.push(h('p', {}, h('b', {}, rd.category), h('br'), h('span', { class: 'muted' }, `Quelle: ${rd.source || '–'} · ${rd.period || ''} ${rd.asOf || ''} · ${list.length} Einträge`)));
  const rankSel = (id, a) => {
    const sel = h('select', { onchange: (ev) => ui.act('play.setRank', { teamId: id, rank: ev.target.value === '' ? null : Number(ev.target.value) }) },
      h('option', { value: '' }, '– nicht in der Top 100 –'), list.map((e) => h('option', { value: String(e.rank) }, `${e.rank}. ${e.name}`)));
    sel.value = a.rank ? String(a.rank) : '';
    return sel;
  };
  out.push(h('ul', { class: 'list' }, teamIds(ui).map((id) => {
    const a = r.answers[id];
    if (!a) return teamLi(ui, id, h('span', { class: 'muted' }, ' – noch keine Abgabe'));
    const sug = a.status === 'pending' && a.suggest ? list[a.suggest - 1] : null;
    return teamLi(ui, id, [' – „', h('b', {}, a.text), '“ '],
      a.status === 'pending' ? badge('warn', sug ? `unsicher: ${sug.rank}. ${sug.name}?` : 'unsicher') : a.rank ? badge('ok', `Rang ${a.rank} · ${pts(t100Points(a.rank, g))}`) : badge('bad', 'nicht gefunden · 0'),
      a.status === 'manual' ? badge('', 'manuell') : null,
      sug ? btn('small ok', '✓ Vorschlag übernehmen', () => ui.act('play.setRank', { teamId: id, rank: sug.rank })) : null,
      sug ? btn('small ghost', '✗ kein Treffer', () => ui.act('play.setRank', { teamId: id, rank: null })) : null,
      rankSel(id, a));
  })));
  const all = teamIds(ui).every((id) => r.answers[id]);
  if (!r.evaluated) out.push(row(
    !r.closed && !all ? btn('ghost', 'Abgabe schließen', () => ui.confirmAct('Abgabe schließen? Teams ohne Eintrag bekommen 0 Punkte.', 'play.close')) : null,
    btn('pink', 'Auswerten und Punkte vergeben', () => ui.act('play.evaluate'), !all && !r.closed)));
  else out.push(row(badge('ok', 'Ausgewertet – Korrekturen über die Auswahl oben wirken sofort')));
  return out;
}

// ---------- 30 Seconds to Spaß ----------
// Große Knöpfe „Richtig“/„Falsch“ (auch Tasten J/N bzw. 1/2): ein Tipp wertet die
// Frage und zeigt sofort die nächste – das Team verliert keine Zeit.
let sekKeys = null;
function sekunden(ui, g, st) {
  const d = st.index ?? -1;
  const r = (st.rounds || {})[d];
  const out = [tabs(['Durchgang 1', 'Durchgang 2'], d, (k) => ui.act('play.open', { index: k }), (k) => st.rounds?.[k]?.done)];
  if (d < 0 || !r) return [...out, muted('Durchgang öffnen: Das Startteam wird ausgelost, dann reihum. Das Team startet mit dem Buzzer, du wertest jede Antwort mit einem Tipp, das Team stoppt selbst nach gefühlt 30 Sekunden.')];
  const id = r.done ? null : r.order[r.turn];
  const t = id ? r.turns[id] || { phase: 'ready', marks: [] } : null;
  const tol = Number(d === 0 ? g.content.tol1 : g.content.tol2) || (d === 0 ? 4 : 2);
  const seconds = Number(g.content.seconds) || 30;
  out.push(h('ol', { class: 'list' }, r.order.map((x, i) => {
    const tt = r.turns[x];
    return h('li', {}, ui.dot(ui.teamColor(x)), h('span', { class: 'grow' }, h('b', {}, ui.teamName(x)), i === r.turn && !r.done ? ' ← dran' : ''),
      tt && tt.phase === 'stopped' ? badge(tt.ok ? 'ok' : 'bad', `${tt.late ? 'nicht gestoppt' : `${tt.elapsed.toFixed(1).replace('.', ',')} s`} · ${tt.correct} richtig · ${plus(tt.points)}`) : tt && tt.phase === 'running' ? badge('warn', 'läuft') : null);
  })));
  if (r.done) { sekKeys = null; return [...out, row(badge('ok', `Durchgang ${d + 1} beendet`))]; }
  const p = r.order.indexOf(id);
  const blocks = g.content.rounds[d].blocks || [];
  const qOf = (q) => { const b = blocks[q]; const items = b ? (b.items || []).filter((it) => String(it.question || '').trim()) : []; return items.length ? { topic: b.topic, ...items[p % items.length] } : null; };
  if (t.phase === 'ready') {
    sekKeys = null;
    out.push(h('p', { class: 'notice' }, `🔔 ${ui.teamName(id)} startet mit dem Buzzer. Ziel ${seconds} s, Toleranz ± ${String(tol).replace('.', ',')} s.`),
      row(btn('ghost', 'Für das Team starten (iPad ausgefallen)', () => ui.act('play.buzzFor'))));
    return out;
  }
  if (t.phase === 'running') {
    const q = qOf(t.marks.length);
    const right = t.marks.filter(Boolean).length;
    const mark = (ok) => ui.act('play.mark', { correct: ok });
    sekKeys = (ev) => {
      if (/INPUT|TEXTAREA|SELECT/.test(ev.target.tagName)) return;
      if (['j', 'J', '1'].includes(ev.key)) { ev.preventDefault(); mark(true); }
      else if (['n', 'N', '2'].includes(ev.key)) { ev.preventDefault(); mark(false); }
    };
    out.push(h('div', { class: 'sek-live' },
      h('div', { class: 'sek-q' }, q ? [h('small', {}, `Frage ${t.marks.length + 1}${q.topic ? ` · ${q.topic}` : ''}`), h('b', {}, q.question), h('span', { class: 'ans' }, `Antwort: ${q.answer || '–'}`)]
        : h('b', {}, 'Keine Fragen mehr in diesem Durchgang – das Team muss nur noch stoppen.')),
      h('div', { class: 'sek-btns' },
        h('button', { class: 'sek-btn ok', disabled: !q, onpointerdown: (ev) => { ev.preventDefault(); mark(true); } }, '✓', h('small', {}, 'Richtig (J)')),
        h('button', { class: 'sek-btn bad', disabled: !q, onpointerdown: (ev) => { ev.preventDefault(); mark(false); } }, '✗', h('small', {}, 'Falsch / weiter (N)'))),
      h('div', { class: 'row' }, h('span', {}, `${right} richtig von ${t.marks.length}`),
        btn('small ghost', '↶ letzte Wertung zurück', () => ui.act('play.unmark'), !t.marks.length),
        btn('small ghost', 'Für das Team stoppen (iPad ausgefallen)', () => ui.confirmAct('Wirklich für das Team stoppen? Die Zeit zählt ab jetzt.', 'play.buzzFor')))));
    return out;
  }
  sekKeys = null;
  out.push(row(btn('pink', r.turn + 1 >= r.order.length ? 'Durchgang beenden' : `Weiter: ${ui.teamName(r.order[r.turn + 1])} ist dran`, () => ui.act('play.next'))));
  return out;
}
document.addEventListener('keydown', (ev) => { if (sekKeys && !ev.altKey && !ev.ctrlKey && !ev.metaKey) sekKeys(ev); });

// ---------- Wir sind ein Telepa-Team ----------
const alleinList = (text) => String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 500)
  .map((l, i) => { const v = l.split('/').map((x) => x.trim()).filter(Boolean); return { key: i + 1, name: v[0] || l }; });
function allein(ui, g, st) {
  const i = st.index ?? -1;
  const r = (st.rounds || {})[i];
  const out = [tabs(g.content.rounds.map((rd, k) => rd.category ? rd.category.slice(0, 24) : `Kategorie ${k + 1}`), i, (k) => ui.act('play.open', { index: k }), (k) => st.rounds?.[k]?.evaluated)];
  if (i < 0 || !r) return [...out, muted(`Kategorie öffnen: jedes Team nennt eine Antwort. Nur richtige Antworten, die kein anderes Team genannt hat, bringen ${plus(pvc(g, 'correct'))}.`)];
  const rd = g.content.rounds[i];
  const list = alleinList(rd.entries);
  out.push(h('p', {}, h('b', {}, rd.category), h('span', { class: 'muted' }, ` · ${list.length} richtige Antworten`)));
  // Wie oft wurde jeder Eintrag genannt? (für „doppelt“)
  const count = {};
  for (const a of Object.values(r.answers)) if (a.entry) count[a.entry] = (count[a.entry] || 0) + 1;
  const entrySel = (id, a) => {
    const sel = h('select', { onchange: (ev) => ui.act('play.setEntry', { teamId: id, entry: ev.target.value === '' ? null : Number(ev.target.value) }) },
      h('option', { value: '' }, '– falsch / nicht in der Liste –'), list.map((e) => h('option', { value: String(e.key) }, e.name)));
    sel.value = a.entry ? String(a.entry) : '';
    return sel;
  };
  out.push(h('ul', { class: 'list' }, teamIds(ui).map((id) => {
    const a = r.answers[id];
    if (!a) return teamLi(ui, id, h('span', { class: 'muted' }, ' – noch keine Abgabe'));
    const sug = a.status === 'pending' && a.suggest ? list[a.suggest - 1] : null;
    return teamLi(ui, id, [' – „', h('b', {}, a.text), '“ '],
      a.status === 'pending' ? badge('warn', sug ? `unsicher: ${sug.name}?` : 'unsicher')
        : !a.entry ? badge('bad', 'falsch · 0') : count[a.entry] > 1 ? badge('warn', `${list[a.entry - 1].name} · doppelt (${count[a.entry]}×) · 0`) : badge('ok', `${list[a.entry - 1].name} · allein · ${plus(pvc(g, 'correct'))}`),
      a.status === 'manual' ? badge('', 'manuell') : null,
      sug ? btn('small ok', '✓ Vorschlag übernehmen', () => ui.act('play.setEntry', { teamId: id, entry: sug.key })) : null,
      sug ? btn('small ghost', '✗ falsch', () => ui.act('play.setEntry', { teamId: id, entry: null })) : null,
      entrySel(id, a));
  })));
  const all = teamIds(ui).every((id) => r.answers[id]);
  if (!r.evaluated) out.push(row(
    !r.closed && !all ? btn('ghost', 'Abgabe schließen', () => ui.confirmAct('Abgabe schließen? Teams ohne Antwort bekommen 0 Punkte.', 'play.close')) : null,
    btn('pink', 'Auswerten und Punkte vergeben', () => ui.act('play.evaluate'), !all && !r.closed)));
  else out.push(row(badge('ok', 'Ausgewertet – Korrekturen über die Auswahl oben wirken sofort'),
    btn(r.showList ? 'ghost' : 'pink', r.showList ? 'Lösungsliste ausblenden' : 'Alle richtigen Antworten auf dem Beamer zeigen', () => ui.act('play.showList', { show: !r.showList }))));
  return out;
}

// ---------- Ich bin ein Star, lüg mich nicht an ----------
function star(ui, g, st) {
  const i = st.index ?? -1;
  const r = (st.rounds || {})[i];
  const out = [tabs(g.content.puzzles.map((p, k) => p.center ? p.center.slice(0, 20) : `Rätsel ${k + 1}`), i, (k) => ui.act('play.open', { index: k }), (k) => st.rounds?.[k]?.resolved)];
  if (i < 0 || !r) return [...out, muted(`Rätsel öffnen: Teams wählen den falschen Begriff und buzzern. Schnellstes Team mit richtiger Wahl ${plus(pvc(g, 'correct'))}.`)];
  const pz = g.content.puzzles[i];
  const w = Number(String(pz.wrong).replace(/\D/g, '')) - 1;
  out.push(h('p', {}, h('b', {}, pz.center), ' · falsch ist: ', h('b', {}, pz.terms[w] || '–')));
  const ordered = r.buzzes.slice().sort((a, b) => a.at - b.at);
  out.push(ordered.length ? h('ol', { class: 'list' }, ordered.map((b) => h('li', {}, ui.dot(ui.teamColor(b.teamId)), h('span', { class: 'grow' }, h('b', {}, ui.teamName(b.teamId)), ` – „${pz.terms[b.pick]}“`), badge(b.pick === w ? 'ok' : 'bad', b.pick === w ? 'richtig' : 'falsch'))))
    : muted('Noch kein Buzzer.'));
  out.push(row(r.resolved ? badge('ok', r.winner ? `${ui.teamName(r.winner)} ${plus(pvc(g, 'correct'))}` : 'Kein Team richtig') : btn('pink', 'Auflösen (in Buzzer-Reihenfolge prüfen)', () => ui.act('play.resolve'))));
  return out;
}

// ---------- Remember the Timeline ----------
function timeline(ui, g, st) {
  const i = st.index ?? -1;
  const r = (st.rounds || {})[i];
  const out = [tabs(g.content.rounds.map((rd, k) => rd.category ? rd.category.slice(0, 24) : `Durchgang ${k + 1}`), i, (k) => ui.act('play.open', { index: k }), (k) => st.rounds?.[k]?.done)];
  if (i < 0 || !r) return [...out, muted(`Durchgang starten: Startteam wird ausgelost, dann reihum. Richtig ${plus(pvc(g, 'correct'))}, falsch = Durchgangspunkte weg und raus, Aussteigen behält die Punkte.`)];
  const rd = g.content.rounds[i];
  out.push(h('p', {}, h('b', {}, rd.category), ` · Startteam (ausgelost): ${ui.teamName(r.startTeam)}`));
  out.push(h('ul', { class: 'list' }, r.order.map((id) => teamLi(ui, id, ` – ${pts(r.teams[id].points)}`,
    r.turn === id ? badge('warn', 'am Zug') : null,
    badge(r.teams[id].state === 'active' ? 'ok' : r.teams[id].state === 'quit' ? '' : 'bad', { active: 'aktiv', quit: 'ausgestiegen', out: 'raus' }[r.teams[id].state])))));
  out.push(muted(`Noch ${r.pool.length} Begriffe: ${r.pool.map((k) => rd.items[k].label).join(' · ') || '–'}`));
  out.push(row(r.done ? badge('ok', 'Durchgang beendet – Punkte gutgeschrieben') : btn('ghost', 'Durchgang jetzt beenden (Punkte gutschreiben)', () => ui.confirmAct('Durchgang beenden? Alle Teams behalten ihre Punkte aus diesem Durchgang.', 'play.end'))));
  return out;
}

// ---------- Guck mal, wer da spricht ----------
function chat(ui, g, st) {
  const i = st.index ?? -1;
  const r = (st.rounds || {})[i];
  const out = [tabs(g.content.chats.map((c, k) => `Chat ${k + 1}`), i, (k) => ui.act('play.open', { index: k }), (k) => st.rounds?.[k]?.resolved)];
  if (i < 0 || !r) return [...out, muted('Chat öffnen, dann Nachricht für Nachricht aufdecken. Buzzer ab Nachricht 1. Falsch = Team für diesen Chat gesperrt.')];
  const c = g.content.chats[i];
  out.push(h('p', {}, 'Gesucht: ', h('b', {}, c.person), ` · ${r.shown} von 8 Nachrichten aufgedeckt`));
  if (r.shown < 8) out.push(h('p', { class: 'muted' }, `Nächste: „${c.messages[r.shown].text}“`));
  const cur = r.buzzes.find((b) => b.status === 'pending');
  out.push(h('ol', { class: 'list' }, r.buzzes.map((b) => h('li', {}, ui.dot(ui.teamColor(b.teamId)), h('span', { class: 'grow' }, h('b', {}, ui.teamName(b.teamId))),
    badge({ correct: 'ok', wrong: 'bad', pending: 'warn' }[b.status] || '', { correct: 'richtig', wrong: 'falsch', pending: 'antwortet', skipped: '–' }[b.status])))));
  if (!r.resolved) out.push(row(
    btn('pink', r.shown < 8 ? `Nachricht ${r.shown + 1} aufdecken` : 'Alle Nachrichten aufgedeckt', () => ui.act('play.next'), r.shown >= 8),
    cur ? btn('ok', `✓ ${ui.teamName(cur.teamId)} richtig`, () => ui.act('play.judge', { correct: true })) : null,
    cur ? btn('bad', '✗ falsch', () => ui.act('play.judge', { correct: false })) : null,
    !cur ? btn('ghost', 'Chat ohne Punkte beenden', () => ui.confirmAct('Chat ohne Punkte beenden und auflösen?', 'play.close')) : null));
  else out.push(row(badge('ok', r.winner ? `${ui.teamName(r.winner)} ${plus(pvc(g, 'correct'))}` : 'Aufgelöst')));
  return out;
}

// ---------- Host du das Zeug dafür? ----------
function hostdu(ui, g, st) {
  const i = st.index ?? -1;
  const r = (st.rounds || {})[i];
  const out = [tabs(g.content.questions.map((_, k) => `Frage ${k + 1}`), i, (k) => ui.act('play.open', { index: k }), (k) => st.rounds?.[k]?.phase === 'revealed')];
  if (i < 0 || !r) return [...out, muted('Frage öffnen: alle Teams reichen eine Antwort ein. Erst wenn alle eingereicht haben, werden die Optionen gebildet.')];
  const q = g.content.questions[i];
  out.push(h('p', {}, q.question, ' · richtig: ', h('b', {}, q.answer)));
  if (r.phase === 'submit') {
    out.push(h('ul', { class: 'list' }, teamIds(ui).map((id) => teamLi(ui, id, r.answers[id] ? ` – „${r.answers[id].text}“` : h('span', { class: 'muted' }, ' – schreibt noch')))));
    const all = teamIds(ui).every((id) => r.answers[id]);
    out.push(row(btn('pink', all ? 'Einreichung schließen und Optionen bilden' : 'Warten, bis alle Teams eingereicht haben', () => ui.act('play.close'), !all)));
    return out;
  }
  const groupName = (gr) => (gr.correct ? `✓ ${gr.text}` : gr.text);
  out.push(h('div', { class: 'hd-groups' }, r.groups.map((gr) => h('div', { class: `hd-group${gr.correct ? ' correct' : ''}` },
    h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('b', {}, `${gr.letter ? `${gr.letter}: ` : ''}${groupName(gr)}`),
      r.phase === 'revealed' ? badge('', `gewählt von ${Object.values(r.votes).filter((x) => x === gr.id).length}`) : null),
    h('ul', { class: 'list' }, gr.teams.map((id) => {
      const hint = r.phase === 'review' ? (r.hints || []).filter((x) => x.teamId === id) : [];
      return teamLi(ui, id, ` – „${r.answers[id].text}“`,
        ...hint.map((x) => { const tg = r.groups.find((y) => y.id === x.groupId); return tg ? btn('small warn', `ähnlich wie „${tg.text}“ – zusammenführen`, () => ui.act('play.regroup', { teamId: id, groupId: tg.id })) : null; }),
        r.phase === 'review' && (gr.teams.length > 1 || gr.correct) ? btn('small ghost', 'abtrennen', () => ui.act('play.regroup', { teamId: id })) : null,
        r.phase === 'review' && !gr.correct ? btn('small ghost', '→ zur richtigen Antwort', () => ui.act('play.regroup', { teamId: id, groupId: 'correct' })) : null);
    }))))));
  if (r.phase === 'review') out.push(muted('Gleiche Antworten sind schon zusammengeführt. Unsichere Ähnlichkeiten bitte prüfen, dann die Abstimmung starten.'),
    row(btn('pink', 'Abstimmung starten', () => ui.act('play.startVote'))));
  if (r.phase === 'vote') {
    const voted = Object.keys(r.votes).length;
    out.push(row(badge('', `${voted} von ${teamIds(ui).length} haben gewählt`),
      btn('pink', 'Auflösen und Punkte vergeben', () => (voted < teamIds(ui).length ? ui.confirmAct('Noch haben nicht alle gewählt. Trotzdem auflösen?', 'play.reveal', { force: true }) : ui.act('play.reveal')))));
  }
  if (r.phase === 'revealed') out.push(h('ul', { class: 'list' }, teamIds(ui).map((id) => teamLi(ui, id, ` – richtig gewählt +${r.results[id].regular} · getäuscht +${r.results[id].deceive}`))));
  return out;
}

export const MOD_NEU = { sortieren, gier, top100, star, timeline, chat, hostdu, allein, sekunden };
