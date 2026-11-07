// Spielsteuerung der Moderation für alle acht Spiele. Die Moderation sieht den
// vollständigen Spielzustand (Antworten, Gebote, Guthaben), Teams und Beamer nicht.

import { h, mediaUrl } from './client.js';
import { answerContent } from './ink.js';
import { mapView, zoomState } from './map.js';
const modLandZoom = {};
import { MOD_EXTRA } from './mod-extra.js';

const MOVIE_HINTS = [1, 2, 2, 4, 2, 1, 3, 1, 3, 2].map((price, i) => [`Hinweis ${i + 1}`, price]);
const JAUCH_LADDER = [1, 2, 4, 5, 6, 8, 10, 15];

export function buildPlay(ui, g, st, pos) {
  const builders = { leichte5, dummes, land, kassenschlager, trumpf5, musik, jauch, nerd, ...MOD_EXTRA };
  const title = `Spiel ${pos} · ${g.title}`;
  return ui.card(title, ...(builders[g.type] || (() => [h('p', {}, 'Unbekannter Spieltyp.')]))(ui, g, st));
}

const pts = (n) => `${n} ${Math.abs(n) === 1 ? 'Punkt' : 'Punkte'}`;
const badge = (kind, text) => h('span', { class: `badge ${kind}` }, text);
const row = (...c) => h('div', { class: 'row', style: { marginTop: '12px' } }, ...c);
const btn = (cls, label, onclick, disabled = false) => h('button', { class: `btn ${cls}`, onclick, disabled }, label);

// Fortschritt statt Auswahl: Die Reihenfolge ist fest, „Weiter“ (Klicker) schaltet
// zur nächsten Frage. Hier nur anzeigen, wo die Show gerade steht.
function tabs(items, current, onPick, done = () => false) {
  return h('div', { class: 'row prog-chips', 'aria-label': 'Fortschritt' }, items.map((label, i) =>
    h('span', { class: `prog-chip${i === current ? ' cur' : ''}${done(i) ? ' done' : ''}`, 'aria-current': i === current ? 'step' : null }, `${label}${done(i) ? ' ✓' : ''}`)));
}

function teamLine(ui, teamId, ...rest) {
  return h('li', {}, ui.dot(ui.teamColor(teamId)), h('span', { class: 'grow' }, h('b', {}, ui.teamName(teamId)), ...rest.slice(0, 1)), ...rest.slice(1));
}

function optionsList(q, marks = {}) {
  return h('ul', { class: 'list' }, ['A', 'B', 'C', 'D'].map((l) => h('li', { class: l === q.correct ? 'active' : '' },
    h('b', {}, `${l}:`), h('span', { class: 'grow' }, q.options[l] || '–'), l === q.correct ? badge('ok', 'richtig') : null, marks[l] || null)));
}

function buzzList(ui, round, judgeLabel, onJudge) {
  const pending = round.buzzes.find((b) => b.status === 'pending');
  const first = round.buzzes[0]?.at;
  if (!round.buzzes.length) return h('p', { class: 'muted' }, 'Noch kein Buzzer.');
  return h('ol', { class: 'list' }, round.buzzes.map((b) => h('li', { class: b === pending ? 'active' : '' },
    ui.dot(ui.teamColor(b.teamId)), h('span', { class: 'grow' }, h('b', {}, ui.teamName(b.teamId)), h('span', { class: 'muted' }, ` · +${b.at - first} ms${b.hint ? ` · Hinweis ${b.hint}` : ''}`)),
    b.status === 'correct' ? badge('ok', '✓ richtig') : b.status === 'wrong' ? badge('bad', '✗ falsch') : b.status === 'skipped' ? badge('', 'nicht mehr dran') : null,
    b === pending ? [
      btn('small ok', judgeLabel(b), () => onJudge(true)),
      btn('small bad', '✗ Falsch', () => onJudge(false)),
    ] : null)));
}

// ---------- 1 · Die leichten 5 ----------

function leichte5(ui, g, st) {
  const qIndex = st.qIndex ?? -1;
  const rounds = st.rounds || {};
  const round = rounds[qIndex];
  const out = [tabs(g.content.questions.map((_, i) => `Frage ${i + 1}`), qIndex, (i) => ui.act('play.open', { qIndex: i }), (i) => rounds[i]?.solutionRevealed)];
  if (qIndex < 0 || !round) return [...out, h('p', { class: 'muted help' }, 'Frage freigeben, damit sie auf den Team-iPads erscheint.')];
  const q = g.content.questions[qIndex];
  out.push(h('p', { class: 'question', style: { fontSize: '1.4rem' } }, q.question));
  out.push(h('p', {}, h('span', { class: 'muted' }, 'Musterlösung (nur für dich): '), h('b', {}, q.solution)));
  const submitted = Object.values(round.answers);
  out.push(h('p', {}, round.open ? badge('ok', '● Abgabe offen') : badge('', '🔒 Abgabe geschlossen')));
  // Auflösung mit einem Knopf: jedes Team einzeln, erst Antwort, dann Wertung.
  const ungraded = submitted.filter((a) => a.grade === null).length;
  const rv = round.rv;
  let label = null;
  if (!rv) label = 'Auflösung starten ▶ (erstes Team groß zeigen)';
  else if (!rv.done && rv.shown === false) label = `Antwort von ${ui.teamName((rv.groups[rv.g] || [])[0])} zeigen ▶`;
  else if (!rv.done && !rv.verdict) {
    const ids = rv.groups[rv.g] || [];
    const ok = round.answers[ids[0]]?.grade === true;
    label = ok ? (ids.length > 1 ? `✓ Alle ${ids.length} als richtig zeigen` : '✓ Richtig zeigen') : '✗ Falsch zeigen';
  } else if (!rv.done) {
    const nxt = rv.groups[rv.g + 1];
    label = !nxt ? 'Übersicht aller Teams ▶' : nxt.length > 1 ? `Weiter: alle übrigen ${nxt.length} richtigen ▶` : `Weiter: ${ui.teamName(nxt[0])} ▶`;
  }
  if (submitted.length) {
    const cur = rv && !rv.done ? (rv.groups[rv.g] || []).map((id) => ui.teamName(id)).join(', ') : null;
    out.push(h('p', { class: 'row', style: { alignItems: 'center' } },
      label ? btn('pink', label, () => ui.act('play.revealNext'), !rv && ungraded > 0) : badge('ok', 'Alles aufgelöst'),
      !rv && ungraded ? h('span', { class: 'muted' }, `Erst alle bewerten (${ungraded} offen) – die Wertung bleibt bis zur Auflösung verdeckt.`) : null,
      cur ? h('span', { class: 'muted' }, `Auf dem Beamer: ${cur}${rv.shown === false ? ' (nur Teamname)' : rv.verdict ? '' : ' (noch ohne Wertung)'} · ${rv.g + 1} von ${rv.groups.length}`) : null));
  }
  out.push(h('ul', { class: 'list' }, ui.S.project.teams.map((t) => {
    const a = round.answers[t.id];
    if (!a) return h('li', {}, ui.dot(t.color), h('span', { class: 'grow' }, t.name, h('span', { class: 'muted' }, ' – noch nicht abgegeben')));
    const grade = [a.grade === true ? badge('ok', '✓ richtig') : a.grade === false ? badge('bad', '✗ falsch') : badge('warn', 'offen'),
      a.revealed ? badge('', 'aufgelöst') : null];
    return h('li', {}, ui.dot(t.color),
      h('span', { class: 'grow' }, h('b', {}, t.name), ': ', answerContent(a, 'mod')),
      grade,
      btn(`small ${a.onBeamer ? 'cyan' : 'ghost'}`, a.onBeamer ? 'Auf Beamer ✓' : 'Auf Beamer zeigen', () => ui.act('play.showAnswer', { teamId: t.id, visible: !a.onBeamer })),
      btn('small ok', '✓ Richtig', () => ui.act('play.grade', { teamId: t.id, correct: true })),
      btn('small bad', '✗ Falsch', () => ui.act('play.grade', { teamId: t.id, correct: false })));
  })));
  out.push(h('p', { style: { marginTop: '14px' } },
    round.solutionRevealed
      ? badge('ok', 'Lösung wird gezeigt')
      : btn('', 'Lösung auf Beamer zeigen', () => ui.confirmAct('Lösung zeigen und Abgabe für diese Frage schließen?', 'play.revealSolution'))));
  return out;
}

// ---------- 2 · Dumm ist der, der Dummes kriegt ----------

function dummes(ui, g, st) {
  const qIndex = st.qIndex ?? -1;
  const rounds = st.rounds || {};
  const r = rounds[qIndex];
  const out = [
    tabs(g.content.questions.map((_, i) => `Frage ${i + 1}`), qIndex, (i) => ui.act('play.open', { qIndex: i }), (i) => rounds[i]?.evaluated),
    h('p', { class: 'muted help' }, 'Bei jeder Frage darf das Team, das zuerst buzzert, seine Antwort mit einem anderen Team tauschen.'),
  ];
  if (qIndex < 0 || !r) return [...out, h('p', { class: 'muted help' }, 'Frage freigeben: alle Teams wählen A–D und sperren.')];
  const q = g.content.questions[qIndex];
  out.push(h('p', { class: 'question', style: { fontSize: '1.3rem' } }, q.question), optionsList(q));
  const running = r.windowEnds && r.windowEnds > Date.now() && !r.evaluated;
  if (r.buzz) out.push(h('p', {}, '🔔 Schnellstes Team: ', h('b', {}, ui.teamName(r.buzz.teamId)), running ? [' · noch ', h('b', { 'data-deadline': r.windowEnds }, ''), ' für die anderen'] : ''));
  const finals = {};
  for (const [id, a] of Object.entries(r.answers)) finals[id] = a.choice;
  if (r.swap) {
    finals[r.swap.by] = r.answers[r.swap.with].choice;
    finals[r.swap.with] = r.answers[r.swap.by].choice;
    out.push(h('p', {}, '🔁 ', h('b', {}, ui.teamName(r.swap.by)), ' tauscht mit ', h('b', {}, ui.teamName(r.swap.with))));
  }
  out.push(h('ul', { class: 'list' }, ui.S.project.teams.map((t) => {
    const a = r.answers[t.id];
    if (!a) {
      return h('li', {}, ui.dot(t.color), h('span', { class: 'grow' }, t.name, h('span', { class: 'muted' }, ' – noch nicht abgegeben')));
    }
    const fin = finals[t.id];
    return h('li', {}, ui.dot(t.color), h('span', { class: 'grow' }, h('b', {}, t.name), `: ${a.choice}`, fin !== a.choice ? ` → nach Tausch ${fin}` : ''),
      r.evaluated ? [
        fin === q.correct ? badge('ok', '✓ 1 Punkt') : badge('bad', '✗ 0'),
        btn('small ghost', 'Korrigieren', () => ui.confirmAct(`Bewertung für ${t.name} auf ${fin === q.correct ? 'falsch' : 'richtig'} ändern?`, 'play.grade', { teamId: t.id, correct: fin !== q.correct })),
      ] : null);
  })));
  out.push(row(r.evaluated ? badge('ok', 'Ausgewertet') : btn('', 'Frage auswerten', () => ui.confirmAct(r.buzz && !r.swap ? 'Das schnellste Team hat noch nicht getauscht. Trotzdem auswerten? Der Tausch verfällt dann für diese Frage.' : 'Frage jetzt auswerten und Punkte vergeben?', 'play.evaluate'))));
  return out;
}

// ---------- 3 · Ich sehe ein Land, das du nicht siehst ----------

function land(ui, g, st) {
  const t = st.taskIndex ?? -1;
  const rounds = st.rounds || {};
  const r = rounds[t];
  const out = [
    tabs(g.content.tasks.map((_, i) => `Aufgabe ${i + 1}`), t, (i) => ui.act('play.open', { taskIndex: i }), (i) => rounds[i]?.showTarget),
    h('p', { class: 'muted' }, `Standard-Karte: ${g.content.map}`),
  ];
  if (t < 0 || !r) return [...out, h('p', { class: 'muted help' }, 'Aufgabe freigeben: Teams setzen einen Punkt auf ihrer Karte.')];
  const task = g.content.tasks[t];
  const mapName = ['Welt', 'Europa', 'Deutschland'].includes(task.map) ? task.map : g.content.map;
  out.push(h('p', { class: 'question', style: { fontSize: '1.3rem' } }, task.question), h('p', { class: 'muted' }, `Karte dieser Aufgabe: ${mapName}`));
  if (task.image) {
    const img = h('img', { class: 'media-preview img', alt: 'Bild zur Aufgabe', style: { width: '220px', height: '140px' } });
    mediaUrl(task.image.id).then((url) => { if (url) img.src = url; });
    out.push(img);
  }
  const country = task.mode === 'Ganzes Land (nur Welt- und Europakarte)' && mapName !== 'Deutschland';
  out.push(country
    ? h('p', {}, h('span', { class: 'muted' }, 'Gesucht (nur für dich): '), h('b', {}, `ganzes Land – ${task.country || '–'}`), h('span', { class: 'muted' }, ' · jedes Team im Land bekommt 1 Punkt'))
    : h('p', {}, h('span', { class: 'muted' }, 'Ziel (nur für dich): '), h('b', {}, task.target || '–'), h('span', { class: 'muted' }, ` · ${task.lat}, ${task.lng}`)));
  const dist = (gs) => (country ? gs.km ?? 0 : Math.round(haversine(gs, task)));
  const list = Object.entries(r.guesses).map(([id, gs]) => ({ id, ...gs, km: dist(gs) })).sort((a, b) => a.km - b.km);
  const zk = `${g.id}:${t}:${mapName}`;
  modLandZoom[zk] = modLandZoom[zk] || zoomState();
  out.push(h('div', { class: 'map-box' }, mapView(mapName, {
    zoom: modLandZoom[zk],
    markers: [...list.map((x) => ({ lat: x.lat, lng: x.lng, color: ui.teamColor(x.id), label: `${ui.teamName(x.id)} · ${country ? (x.hit ? '✓' : `${x.km.toLocaleString('de-DE')} km daneben`) : `${x.km.toLocaleString('de-DE')} km`}`, showLabel: true })), ...(country ? [] : [{ lat: task.lat, lng: task.lng, kind: 'target', label: task.target, radii: r.showTarget ? ({ Europa: [200, 100], Welt: [500, 250] }[mapName] || [100, 50]) : null }])],
  })));
  out.push(h('ul', { class: 'list' }, ui.S.project.teams.map((tm) => {
    const x = list.find((y) => y.id === tm.id);
    const win = r.winners.includes(tm.id);
    const info = !x ? h('span', { class: 'muted' }, ' – noch kein Punkt')
      : country ? (x.hit ? ' · im Land ✓' : ` · nicht im Land (${x.km.toLocaleString('de-DE')} km daneben)`)
        : ` · ${x.km.toLocaleString('de-DE')} km`;
    return h('li', {}, ui.dot(tm.color), h('span', { class: 'grow' }, h('b', {}, tm.name), info),
      win ? badge('ok', `✓ ${(r.awards && r.awards[tm.id]) || 1} ${((r.awards && r.awards[tm.id]) || 1) === 1 ? 'Punkt' : 'Punkte'}`) : null,
      r.showTarget && country ? btn('small ghost', win ? 'Punkt wegnehmen' : 'Punkt geben', () => ui.act('play.toggleWinner', { teamId: tm.id })) : null,
      r.showTarget && !country && !win ? btn('small ghost', 'Punkt geben', () => ui.confirmAct(`Korrektur: Den Punkt dieser Aufgabe an ${tm.name} geben (statt bisher)?`, 'play.setWinner', { teamId: tm.id })) : null);
  })));
  out.push(row(
    btn('', '1. Tipps der Teams zeigen', () => ui.confirmAct('Abgabe schließen und alle Teampunkte gleichzeitig zeigen?', 'play.revealGuesses'), r.showGuesses),
    btn('pink', country ? '2. Land enthüllen' : '2. Zielort enthüllen', () => ui.act('play.revealTarget'), !r.showGuesses || r.showTarget),
    r.open ? badge('ok', '● Abgabe offen') : null));
  return out;
}

function haversine(a, b) {
  const rad = Math.PI / 180;
  const x = Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(x)));
}

// ---------- 4 · Das ist ein echter Kassenschlager ----------

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

function kassenschlager(ui, g, st) {
  const i = st.movieIndex ?? -1;
  const movies = st.movies || {};
  const m = movies[i];
  const out = [tabs(g.content.movies.map((_, k) => `Film ${k + 1}`), i, null, (k) => !!movies[k]?.finished)];
  out.push(h('h4', {}, 'Guthaben (privat)'));
  out.push(h('ul', { class: 'list' }, ui.S.project.teams.map((t) => {
    const money = st.wallet?.[t.id] ?? 20;
    const tm = m?.teams[t.id];
    return h('li', {}, ui.dot(t.color), h('span', { class: 'grow' }, h('b', {}, t.name), tm ? h('span', { class: 'muted' }, ` · ${tm.bought.length} Hinweise gekauft`) : null),
      st.out?.includes(t.id) ? badge('bad', 'ausgeschieden') : tm?.solved ? badge('ok', '✓ gelöst') : null,
      h('b', {}, `${money} $`), st.converted?.[t.id] ? badge('ok', `= ${pts(st.converted[t.id].points)}`) : null);
  })));
  if (!m) return [...out, h('p', { class: 'muted help' }, 'Film starten: Alle Teams kaufen pro Durchgang gleichzeitig einen Hinweis und raten den Titel.')];
  const movie = g.content.movies[i];
  out.push(h('p', {}, h('span', { class: 'muted' }, 'Lösung: '), h('b', {}, movie.title), movie.aliases ? h('span', { class: 'muted' }, ` (auch: ${movie.aliases})`) : null));
  if (!m.finished) {
    // Alle Teams gleichzeitig: pro Team Stand im Durchgang, offene Antworten zum Bewerten.
    const PH = { buy: 'kauft einen Hinweis …', answer: 'schreibt eine Antwort …', grading: 'hat geantwortet', done: 'fertig' };
    out.push(h('p', { class: 'question', style: { fontSize: '1.2rem' } }, `Durchgang ${m.cycle} von 4 – alle Teams gleichzeitig`));
    out.push(h('ul', { class: 'list' }, m.order.map((id) => {
      const tm = m.teams[id] || { bought: [], answers: [], phase: 'done' };
      return h('li', {}, ui.dot(ui.teamColor(id)), h('span', { class: 'grow' }, h('b', {}, ui.teamName(id)), h('span', { class: 'muted' }, ` · ${tm.solved ? 'gelöst' : PH[tm.phase] || ''}`),
        tm.bought.length ? h('span', { class: 'muted' }, ` · gekauft: ${tm.bought.map((b) => (g.content.hintCats && g.content.hintCats[b] && g.content.hintCats[b].name) || MOVIE_HINTS[b][0]).join(', ')}`) : null),
        ['buy', 'answer'].includes(tm.phase) ? btn('small ghost', 'Aussetzen', () => ui.confirmAct(`${ui.teamName(id)} setzt in diesem Durchgang aus?`, 'play.skip', { teamId: id })) : null);
    })));
    const forms = [movie.title, ...(movie.aliases || '').split(',')].map(norm).filter(Boolean);
    for (const id of m.order.filter((x) => (m.teams[x] || {}).phase === 'grading')) {
      const tm = m.teams[id];
      const a = tm.answers[tm.answers.length - 1];
      const suggest = !a.ink && forms.includes(norm(a.text));
      out.push(h('div', { class: 'card', style: { background: 'rgba(255,255,255,.05)' } },
        h('p', { style: { margin: '0 0 6px' } }, ui.dot(ui.teamColor(id)), ' ', h('b', {}, ui.teamName(id))),
        a.ink ? answerContent(a, 'mod-large') : h('p', { style: { fontSize: '1.4rem', margin: 0 } }, `„${a.text}“`),
        h('p', { class: 'muted' }, a.ink ? `Handschrift – bitte selbst prüfen. Lösung: ${movie.title}` : suggest ? 'Vorschlag: stimmt mit Titel/Alias überein' : 'Vorschlag: kein exakter Treffer – bitte selbst prüfen'),
        row(btn('ok', '✓ Richtig (+5 $)', () => ui.act('play.grade', { teamId: id, correct: true })), btn('bad', '✗ Falsch', () => ui.act('play.grade', { teamId: id, correct: false })))));
    }
  }
  out.push(row(
    m.finished ? badge('ok', 'Film beendet') : btn('ghost', 'Film beenden', () => ui.confirmAct('Film jetzt beenden? Teams mit 0 $, die nicht gelöst haben, scheiden aus.', 'play.endMovie')),
    st.converted ? badge('ok', 'Guthaben umgerechnet') : btn('pink', 'Guthaben in Punkte umrechnen', () => ui.confirmAct('Guthaben jetzt einmalig in Hauptpunkte umrechnen (aufgerundet ÷ 2)?', 'play.convert'), !m.finished)));
  return out;
}

// ---------- 5 · 5 ist Trümpf ----------

function trumpf5(ui, g, st) {
  const termIndex = st.termIndex ?? -1;
  const rounds = st.rounds || {};
  const round = rounds[termIndex];
  const out = [tabs(g.content.terms.map((_, i) => `Begriff ${i + 1}`), termIndex, (i) => ui.act('play.start', { termIndex: i }), (i) => rounds[i]?.resolved)];
  if (termIndex < 0 || !round) return [...out, h('p', { class: 'muted help' }, 'Begriff starten: Teams sehen zuerst nur die Kategorie.')];
  const term = g.content.terms[termIndex];
  out.push(h('p', {}, h('span', { class: 'muted' }, 'Kategorie: '), h('b', {}, term.category), h('span', { class: 'muted' }, ' · Lösung: '), h('b', {}, term.term)));
  out.push(h('ol', { class: 'list' }, term.hints.map((hint, i) => h('li', { style: { opacity: i < round.hintLevel ? 1 : 0.5 } },
    h('b', {}, `${i + 1}.`), h('span', { class: 'grow' }, hint), i < round.hintLevel ? badge('ok', 'freigegeben') : badge('', `${5 - i} P.`)))));
  const pending = round.buzzes.find((b) => b.status === 'pending');
  out.push(row(
    btn('', `Hinweis ${Math.min(round.hintLevel + 1, 5)} freigeben`, () => ui.act('play.nextHint'), round.resolved || round.hintLevel >= 5 || !!pending),
    btn('small ghost', 'Ohne Punkte beenden', () => ui.confirmAct('Begriff ohne Punkte beenden?', 'play.close'), round.resolved || !!pending),
    round.resolved ? badge('ok', 'Begriff beendet') : null));
  out.push(h('h4', {}, 'Buzzer-Reihenfolge (Server-Zeit)'));
  out.push(buzzList(ui, round, (b) => `✓ Richtig (+${6 - b.hint})`, (correct) => ui.act('play.judge', { correct })));
  return out;
}

// ---------- 6 · Musikquiz ----------

function musik(ui, g, st) {
  const played = st.played || {};
  const cur = st.current;
  const round = cur ? st.rounds[cur] : null;
  const busy = round && !round.resolved;
  const board = h('div', { class: 'jeopardy' }, g.content.categories.map((cat, c) => h('div', { class: 'col' },
    h('div', { class: 'cat' }, cat.name || `Kategorie ${c + 1}`),
    cat.fields.map((_, f) => {
      const k = `${c}-${f}`;
      const p = played[k];
      return h('button', {
        class: `cell ${p ? 'played' : ''} ${k === cur ? 'current' : ''}`,
        style: p?.winner ? { borderColor: ui.teamColor(p.winner) } : null,
        disabled: !!p || busy,
        onclick: () => ui.act('play.pick', { cat: c, field: f }),
      }, p ? (p.winner ? ui.teamName(p.winner) : '–') : String(f + 1));
    }))));
  const out = [board];
  const picking = !round || round.resolved;
  if (picking) out.unshift(h('p', {}, st.started ? [badge('ok', `${ui.teamName(st.picker)} wählt auf dem iPad`), h('span', { class: 'muted' }, ' · Notfall: Feld hier antippen')] : h('span', { class: 'muted' }, '„Weiter“ lost das Team aus, das das erste Feld wählt.')));
  if (!cur) return out;
  const [c, f] = cur.split('-').map(Number);
  const cat = g.content.categories[c];
  const field = cat.fields[f];
  out.push(h('p', { class: 'question', style: { fontSize: '1.2rem' } }, `${cat.name} · ${pts(g.content.scoring && typeof g.content.scoring[`field${f + 1}`] === 'number' ? g.content.scoring[`field${f + 1}`] : f + 1)}`));
  if (/^Song Song Song/.test(cat.mode)) out.push(h('p', {}, badge('warn', 'Song Song Song: beide Titel nötig, keine Teilpunkte')));
  out.push(h('p', {}, field.task || h('span', { class: 'muted' }, '(keine Aufgabe eingetragen)')));
  out.push(h('p', {}, h('span', { class: 'muted' }, 'Lösung: '), h('b', {}, field.answer || '–'), field.audio ? h('span', { class: 'muted' }, ` · Clip: ${field.audio}`) : null));
  out.push(row(
    round.started ? badge('ok', '● Buzzer frei') : btn('pink', '▶ Frage freigeben, Buzzer frei', () => ui.act('play.start'), round.resolved),
    btn('small ghost', 'Ohne Punkte beenden', () => ui.confirmAct('Feld ohne Punkte beenden?', 'play.close'), round.resolved || round.buzzes.some((b) => b.status === 'pending')),
    round.resolved ? badge('ok', 'Feld beendet') : null));
  // Musik-Clip: startet mit „Aufgabe starten“, pausiert beim Buzzern.
  if (field.clip && !round.resolved) {
    const pb = round.playback || { state: 'stopped' };
    out.push(row(badge(pb.state === 'playing' ? 'ok' : '', pb.state === 'playing' ? '♪ Clip läuft' : pb.state === 'paused' ? '⏸ Clip pausiert' : `♪ Clip: ${field.clip.name || 'Musik'}`),
      round.started ? btn('small', pb.state === 'playing' ? '⏸ Pause' : '▶ Weiter', () => ui.act(pb.state === 'playing' ? 'play.pauseAudio' : 'play.playAudio', {})) : null,
      round.started ? btn('small ghost', '⟲ Von vorn', () => ui.act('play.playAudio', { restart: true })) : null));
  } else if (!field.clip && !round.resolved) out.push(h('p', { class: 'muted' }, 'Kein Musik-Clip hinterlegt – im Editor beim Feld „Musik-Clip (MP3 oder MP4)“ hochladen.'));
  out.push(h('h4', {}, 'Buzzer-Reihenfolge (Server-Zeit)'));
  out.push(buzzList(ui, round, () => `✓ Richtig (+${f + 1})`, (correct) => ui.act('play.judge', { correct })));
  return out;
}

// ---------- 7 · Ein Hauch von Günther Jauch ----------

function jauch(ui, g, st) {
  const q = st.qIndex ?? -1;
  const r = q >= 0 ? st.rounds[q] : null;
  const teams = ui.S.project.teams;
  const out = [h('div', { class: 'ladder' }, JAUCH_LADDER.map((v, i) => h('span', { class: `step ${i === q ? 'current' : ''} ${i === 3 ? 'safe' : ''}` }, `${i + 1}: ${v} P`)))];
  const canNext = q < JAUCH_LADDER.length - 1 && (q < 0 || r?.revealed);
  if (!r) return [...out, row(btn('pink', 'Frage 1 freigeben', () => ui.act('play.next'), !canNext))];
  const question = g.content.questions[q];
  out.push(h('p', { class: 'question', style: { fontSize: '1.3rem' } }, `Frage ${q + 1} · ${pts(JAUCH_LADDER[q])}: ${question.question}`), optionsList(question));
  const jlog = r.jokerLog || (r.joker ? [r.joker] : []);
  for (const j of jlog) {
    const removed = (r.fifty && r.fifty[j.teamId]) || j.removed || [];
    out.push(h('p', {}, '🃏 ', h('b', {}, ui.teamName(j.teamId)), j.kind === 'fifty' ? ` nutzt 50:50 (weg: ${removed.join(', ')})` : ' nutzt den Telefonjoker – erst wenn alle anderen gesperrt haben, telefonieren lassen.'));
  }
  out.push(h('ul', { class: 'list' }, teams.map((t) => {
    const ts = st.teams[t.id] || { status: 'active', secured: 0 };
    const a = r.answers[t.id];
    const status = { active: null, quit: badge('', ts.outAt ? `ausgestiegen nach Frage ${ts.outAt}` : 'ausgestiegen vor Frage 1'), out: badge('bad', `raus bei Frage ${ts.outAt}`), done: badge('ok', 'alle 8 geschafft') }[ts.status];
    const jokers = [ts.jokers?.fifty ? null : '50:50', ts.jokers?.phone ? null : 'Telefon'].filter(Boolean).join(', ');
    return h('li', {}, ui.dot(t.color), h('span', { class: 'grow' }, h('b', {}, t.name), a ? `: ${a.choice}` : ts.status === 'active' && !r.revealed ? h('span', { class: 'muted' }, ' – wählt noch') : '', h('span', { class: 'muted' }, ` · Joker übrig: ${jokers || 'keine'}`)),
      status, r.revealed && a ? (a.choice === question.correct ? badge('ok', '✓') : badge('bad', '✗')) : null, h('b', {}, pts(ts.secured)));
  })));
  const missing = teams.filter((t) => (st.teams[t.id]?.status || 'active') === 'active' && !r.answers[t.id]);
  out.push(row(
    r.revealed ? badge('ok', 'Aufgelöst') : btn('', 'Antworten auflösen', () => (missing.length
      ? ui.confirmAct(`Noch nicht gesperrt: ${missing.map((t) => t.name).join(', ')}. Trotzdem auflösen? Diese Teams scheiden aus.`, 'play.reveal', { force: true })
      : ui.act('play.reveal'))),
    canNext ? btn('pink', `Frage ${q + 2} freigeben`, () => ui.act('play.next')) : null));
  return out;
}

// ---------- 8 · Wer nix werd, werd Nerd ----------

function nerd(ui, g, st) {
  const c = st.catIndex ?? -1;
  const rounds = st.rounds || {};
  const r = rounds[c];
  const out = [
    tabs(g.content.categories.map((cat, i) => (i === 4 ? 'Kategorie 5 ★' : `Kategorie ${i + 1}`)), c, (i) => ui.act('play.open', { catIndex: i }), (i) => rounds[i]?.phase === 'done'),
    h('p', { class: 'muted' }, `Gleichstand-Regel: ${g.content.tieRule}`),
  ];
  if (c < 0 || !r) return [...out, h('p', { class: 'muted help' }, 'Kategorie öffnen: Teams geben geheim ihr Gebot ab.')];
  const cat = g.content.categories[c];
  out.push(h('p', { class: 'question', style: { fontSize: '1.3rem' } }, cat.name || `Kategorie ${c + 1}`));
  const possible = cat.answers.split('\n').map((l) => l.trim()).filter(Boolean).length;
  out.push(h('p', { class: 'muted' }, `Maximal ${possible} richtige Antworten möglich (steht auch auf dem Beamer).`));
  out.push(h('ul', { class: 'list' }, ui.S.project.teams.map((t) => {
    const bid = r.bids[t.id];
    const res = r.results.find((x) => x.teamId === t.id);
    return h('li', {}, ui.dot(t.color), h('span', { class: 'grow' }, h('b', {}, t.name), bid === undefined ? h('span', { class: 'muted' }, ' – noch kein Gebot') : `: Gebot ${bid}`),
      res ? badge(res.success ? 'ok' : 'bad', `${res.points > 0 ? '+' : ''}${res.points}`) : null);
  })));
  if (r.phase === 'bidding') {
    const missing = ui.S.project.teams.filter((t) => r.bids[t.id] === undefined);
    out.push(row(btn('pink', 'Gebote gleichzeitig aufdecken', () => (missing.length
      ? ui.confirmAct(`Noch kein Gebot von ${missing.map((t) => t.name).join(', ')}. Trotzdem aufdecken?`, 'play.revealBids', { force: true })
      : ui.act('play.revealBids')))));
    return out;
  }
  if (r.phase === 'choose') {
    if (r.choose.which === 'first') {
      const prefs = r.choose.prefs || {};
      out.push(h('div', { class: 'notice warn' }, r.coin ? `Münzwurf läuft – ${ui.teamName(r.coin.winner)} beginnt. „Weiter“ übernimmt das Ergebnis.` : 'Gleichstand: Die Teams wählen auf dem iPad „Starten“ oder „Nachziehen“. Bei gleicher Wahl entscheidet ein Münzwurf.'));
      out.push(h('ul', { class: 'list' }, r.choose.teamIds.map((id) => h('li', {}, ui.dot(ui.teamColor(id)), h('span', { class: 'grow' }, ui.teamName(id)),
        prefs[id] ? badge('ok', prefs[id] === 'start' ? 'Starten' : 'Nachziehen') : badge('warn', 'wählt noch')))));
      out.push(h('details', {}, h('summary', { class: 'muted' }, 'Notfall: iPad fällt aus – selbst festlegen, wer beginnt'),
        row(...r.choose.teamIds.map((id) => btn('small ghost', ui.teamName(id), () => ui.confirmAct(`${ui.teamName(id)} beginnt? Wird protokolliert.`, 'play.choose', { teamId: id }))))));
    } else {
      out.push(h('div', { class: 'notice warn' }, 'Gleichstand um den zweiten Versuch. Stichentscheid: Wer bekommt ihn?'));
      out.push(row(...r.choose.teamIds.map((id) => btn('', ui.teamName(id), () => ui.confirmAct(`${ui.teamName(id)} bekommt den Versuch? Der Stichentscheid wird protokolliert.`, 'play.choose', { teamId: id })))));
    }
    return out;
  }
  const a = r.attempt;
  if (a) {
    // Alphabetisch sortiert, damit die Moderation genannte Begriffe schnell findet.
    const valid = cat.answers.split('\n').map((l) => l.trim()).filter(Boolean).sort((x, y) => x.localeCompare(y, 'de', { sensitivity: 'base' }));
    const named = a.given.filter((x) => x.ok).map((x) => x.text);
    out.push(h('p', {}, h('b', { style: { color: ui.teamColor(a.teamId) } }, ui.teamName(a.teamId)), ` · ${a.which === 'first' ? 'erster' : 'zweiter'} Versuch · Ziel ${a.target} · `,
      h('b', {}, `${a.correct} richtig`), ` · ${a.errors} von ${a.maxErrors} Fehlern`, a.done ? ` · ${a.done === 'success' ? 'geschafft ✓' : 'gescheitert ✗'}` : ''));
    const kept = a.given.filter((x) => x.kept).length;
    if (kept) out.push(h('p', { class: 'notice' }, `${kept} richtige Antworten des ersten Teams bleiben stehen – ${ui.teamName(a.teamId)} muss nur noch ${a.target - kept} auffüllen.`));
    if (!a.done) {
      out.push(h('p', { class: 'muted help' }, 'Genannte Antwort antippen. Bereits genannte zählen als Fehler.'));
      out.push(h('div', { class: 'row' }, valid.map((v) => btn(`small ${named.includes(v) ? 'cyan' : 'ghost'}`, named.includes(v) ? `✓ ${v}` : v, () => ui.act('play.mark', { answer: v })))));
      out.push(row(btn('bad', '✗ Falsche Antwort', () => ui.act('play.mark', { text: 'Falsche Antwort' })), btn('small ghost', '↶ Letzte Wertung zurück', () => ui.act('play.unmark'), !a.given.length || a.given[a.given.length - 1].kept)));
    }
  }
  if (r.phase === 'done') out.push(row(badge('ok', 'Kategorie beendet')));
  return out;
}
