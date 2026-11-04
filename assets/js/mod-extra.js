// Regie-Steuerung der zusätzlichen Spiele aus der Spiele-Datenbank. Die Regie
// sieht den vollständigen Zustand (Antworten, Joker, Lösungen); Beamer und
// Teams bekommen nur ihre gefilterten Sichten.

import { h } from './client.js';
import { answerContent } from './ink.js';
import { MOD_NEU } from './neu-mod.js';

// Punktwerte aus dem Editor, sonst Standard.
const pvc = (g, k, d = 1) => (g && g.content && g.content.scoring && typeof g.content.scoring[k] === 'number' ? g.content.scoring[k] : d);
const plus = (n) => `${n >= 0 ? '+' : '−'}${Math.abs(n)}`;


const ABCD = ['A', 'B', 'C', 'D'];
const pts = (n) => `${n} ${Math.abs(n) === 1 ? 'Punkt' : 'Punkte'}`;
const badge = (kind, text) => h('span', { class: `badge ${kind}` }, text);
const row = (...c) => h('div', { class: 'row', style: { marginTop: '12px' } }, ...c);
const btn = (cls, label, onclick, disabled = false) => h('button', { class: `btn ${cls}`, onclick, disabled }, label);
const muted = (t) => h('p', { class: 'muted' }, t);
// Bedienhinweis: in der Regie standardmäßig eingeklappt („?“ blendet ihn ein).
const help = (t) => h('p', { class: 'muted help' }, t);
const lines = (t) => String(t || '').split('\n').map((x) => x.trim()).filter(Boolean);
const ink = (src) => h('img', { class: 'ink-answer mod', src, alt: 'Handschrift' });

function tabs(items, current, onPick, done = () => false) {
  return h('div', { class: 'row' }, items.map((label, i) =>
    h('button', { class: `btn small ${i === current ? 'pink' : 'ghost'}`, onclick: () => onPick(i) }, `${label}${done(i) ? ' ✓' : ''}`)));
}

function optionsList(q) {
  return h('ul', { class: 'list' }, ABCD.map((l) => h('li', { class: l === q.correct ? 'active' : '' },
    h('b', {}, `${l}:`), h('span', { class: 'grow' }, q.options[l] || '–'), l === q.correct ? badge('ok', 'richtig') : null)));
}

const teamLi = (ui, id, ...rest) => h('li', {}, ui.dot(ui.teamColor(id)), h('span', { class: 'grow' }, h('b', {}, ui.teamName(id)), rest[0] ?? null), ...rest.slice(1));
const gradeBtns = (ui, onGrade, current) => [
  btn(`small ${current === true ? 'ok' : 'ghost'}`, '✓ Richtig', () => onGrade(true)),
  btn(`small ${current === false ? 'bad' : 'ghost'}`, '✗ Falsch', () => onGrade(false)),
];

const JOKER_NAMES = { doppel: 'Doppelpunkt', streak: 'Streak', fifty: '50-50', raeuber: 'Punkteräuber', dieb: 'Joker-Dieb', blockade: 'Team-Blockade', detektiv: 'Detektiv-Joker', tausch: 'Antworttausch',
  rettung: 'Rettungsring', zweikreuze: 'Zwei Kreuze', wette: 'Wette', sauger: 'Punktesauger', vorfahrt: 'Vorfahrt', schild: 'Schutzschild', umleitung: 'Umleitung' };
const jn = (k) => JOKER_NAMES[k] || k;

export const MOD_EXTRA = { dumm3, filmab, weissnicht, weissnicht2, konsequenz, songsong, dgf, zocken, fragen, zuweit, brain, ...MOD_NEU };

// ---------- Dumm, dumm, dumm ----------
function dumm3(ui, g, st) {
  const q = st.qIndex ?? -1;
  const r = (st.rounds || {})[q];
  const out = [tabs(g.content.questions.map((x, i) => `Frage ${i + 1} (${x.level})`), q, (i) => ui.act('play.open', { qIndex: i }), (i) => st.rounds?.[i]?.evaluated),
    help('Jedes Team setzt 1–5 Punkte, jeden Wert genau einmal. Richtig: +Einsatz, falsch: −Einsatz.')];
  if (q < 0 || !r) return [...out, help('Frage freigeben.')];
  const qq = g.content.questions[q];
  out.push(h('p', { class: 'question', style: { fontSize: '1.3rem' } }, qq.question), optionsList(qq));
  out.push(h('ul', { class: 'list' }, ui.S.project.teams.map((t) => {
    const e = r.entries[t.id];
    if (!e) return teamLi(ui, t.id, h('span', { class: 'muted' }, ' – noch nicht abgegeben'));
    const ok = e.override !== undefined ? e.override : e.choice === qq.correct;
    return teamLi(ui, t.id, `: ${e.choice} · Einsatz ${e.stake}`,
      r.evaluated ? [badge(ok ? 'ok' : 'bad', ok ? `+${e.stake}` : `−${e.stake}`), btn('small ghost', 'Korrigieren', () => ui.confirmAct(`Bewertung für ${t.name} umdrehen?`, 'play.grade', { teamId: t.id, correct: !ok }))] : badge('', '🔒'));
  })));
  out.push(row(r.evaluated ? badge('ok', 'Ausgewertet') : [
    r.open ? btn('ghost', 'Abgabe schließen', () => ui.act('play.close')) : badge('', 'Abgabe geschlossen'),
    btn('pink', 'Auswerten und Punkte buchen', () => ui.confirmAct('Frage auswerten? Einsätze werden addiert bzw. abgezogen.', 'play.evaluate')),
  ]));
  return out;
}

// ---------- Film ab – Buzzer an! ----------
function filmab(ui, g, st) {
  const i = st.index ?? -1;
  const r = (st.rounds || {})[i];
  const out = [tabs(g.content.films.map((f, k) => f.title || `Film ${k + 1}`), i, (k) => ui.act('play.open', { index: k }), (k) => st.rounds?.[k]?.resolved)];
  if (i < 0 || !r) return [...out, help('Film wählen, dann „Abspielen“. Alle Teams dürfen buzzern; falsch sperrt das Team für diesen Film.')];
  const f = g.content.films[i];
  out.push(h('p', {}, 'Lösung: ', h('b', {}, f.title), f.aliases ? h('span', { class: 'muted' }, ` (auch: ${f.aliases})`) : null));
  if (!f.clip) out.push(h('p', { class: 'notice warn' }, 'Für diesen Film ist noch kein Ausschnitt hochgeladen (Editor → Spiel bearbeiten).'));
  const pb = r.playback.state;
  if (!r.resolved) {
    out.push(row(
      btn('pink', pb === 'playing' ? '▶ Läuft …' : r.started ? '▶ Weiter abspielen' : '▶ Abspielen', () => ui.act('play.play', {}), !f.clip || pb === 'playing'),
      btn('ghost', '⟲ Von vorn', () => ui.act('play.play', { restart: true }), !f.clip),
      btn('ghost', '⏸ Pause', () => ui.act('play.pause'), pb !== 'playing'),
      btn('ghost', 'Film beenden (Lösung zeigen)', () => ui.confirmAct('Film ohne weitere Antworten beenden und die Lösung zeigen?', 'play.close'))));
  }
  const pending = r.buzzes.find((b) => b.status === 'pending');
  out.push(h('ol', { class: 'list' }, r.buzzes.length ? r.buzzes.map((b) => h('li', { class: b === pending ? 'active' : '' }, ui.dot(ui.teamColor(b.teamId)), h('span', { class: 'grow' }, h('b', {}, ui.teamName(b.teamId))),
    b.status === 'correct' ? badge('ok', '✓ richtig') : b.status === 'wrong' ? badge('bad', '✗ falsch') : null,
    b === pending ? gradeBtns(ui, (c) => ui.act('play.judge', { correct: c })) : null)) : h('li', { class: 'muted' }, 'Noch kein Buzzer.')));
  if (r.resolved) out.push(row(badge('ok', r.winner ? `${ui.teamName(r.winner)} ${plus(pvc(g, 'correct'))}` : 'Kein Punkt'), badge('', 'Film beendet')));
  return out;
}

// ---------- Ich weiß nicht, dass du weißt es doch ----------
function weissnicht(ui, g, st) {
  const i = st.index ?? -1;
  const r = (st.rounds || {})[i];
  const out = [tabs(g.content.rounds.map((_, k) => `Runde ${k + 1}`), i, (k) => ui.act('play.open', { index: k }), (k) => st.rounds?.[k]?.closed)];
  if (i < 0 || !r) return [...out, help('Runde öffnen: Bild erscheint, Buzzer sind frei. Wer zuerst buzzert, wählt ein Team, das es angeblich nicht weiß.')];
  const item = g.content.rounds[i];
  out.push(h('p', {}, item.question || '', ' · Lösung: ', h('b', {}, item.solution || '–')));
  if (!item.image) out.push(h('p', { class: 'notice warn' }, 'Für diese Runde ist noch kein Bild hochgeladen.'));
  if (!r.buzz) out.push(muted(r.closed ? 'Runde beendet.' : 'Warten auf den ersten Buzzer …'));
  else out.push(h('p', {}, '🔔 ', h('b', {}, ui.teamName(r.buzz.teamId)), ' war am schnellsten', r.target ? [' und wählt ', h('b', {}, ui.teamName(r.target)), r.deadline && !r.result ? [' · ', h('b', { 'data-deadline': r.deadline }, '')] : ''] : ' – wählt gerade …'));
  if (r.buzz && !r.target) out.push(row(h('span', { class: 'muted' }, 'Für das Team wählen:'), ui.S.project.teams.filter((t) => t.id !== r.buzz.teamId).map((t) => btn('small ghost', t.name, () => ui.act('play.pick', { teamId: t.id })))));
  if (r.target && !r.result) out.push(row(h('span', {}, `Antwort von ${ui.teamName(r.target)}:`), ...gradeBtns(ui, (c) => ui.act('play.judge', { correct: c }))));
  if (r.result) out.push(row(badge('ok', r.result === 'right' ? `${ui.teamName(r.target)} wusste es: ${plus(pvc(g, 'winner'))}` : `${ui.teamName(r.buzz.teamId)} lag richtig: ${plus(pvc(g, 'winner'))}`),
    btn('small ghost', 'Bewertung umdrehen', () => ui.confirmAct('Bewertung umdrehen?', 'play.regrade', { correct: r.result !== 'right' }))));
  if (!r.closed) out.push(row(btn('ghost', 'Frage beenden', () => ui.act('play.close'), !!r.target && !r.result)));
  return out;
}

// ---------- Ich weiß nicht, dass du weißt es doch 2.0 ----------
function weissnicht2(ui, g, st) {
  const i = st.index ?? -1;
  const r = (st.rounds || {})[i];
  const out = [tabs(g.content.rounds.map((_, k) => `Runde ${k + 1}`), i, (k) => ui.act('play.open', { index: k }), (k) => st.rounds?.[k]?.evaluated)];
  if (i < 0 || !r) return [...out, help('Runde öffnen: alle schreiben; wer abgegeben hat, darf buzzern. Der schnellste schätzt sofort ein – jedes Team, sobald es abgegeben hat.')];
  const item = g.content.rounds[i];
  out.push(h('p', {}, item.question || '', ' · Lösung: ', h('b', {}, item.solution || '–')));
  const ids = ui.S.project.teams.map((t) => t.id);
  const allIn = r.closedSubmissions || ids.every((id) => r.answers[id]);
  out.push(h('p', {}, r.buzz ? ['🔔 Schnellster Buzzer: ', h('b', {}, ui.teamName(r.buzz.teamId))] : 'Noch kein Buzzer.',
    r.buzz ? (r.guesses ? ' · Einschätzung abgegeben' : ' · schätzt gerade ein …') : ''));
  out.push(h('ul', { class: 'list' }, ui.S.project.teams.map((t) => {
    const a = r.answers[t.id];
    const guess = r.guesses ? r.guesses[t.id] : undefined;
    return teamLi(ui, t.id, a ? [': ', answerContent(a, 'mod')] : h('span', { class: 'muted' }, ' – noch nicht abgegeben'),
      guess !== undefined ? badge('', `Einschätzung: ${guess ? 'richtig' : 'falsch'}`) : null,
      a && !r.evaluated ? gradeBtns(ui, (c) => ui.act('play.grade', { teamId: t.id, correct: c }), r.grades[t.id]) : null,
      r.evaluated && a ? badge(r.grades[t.id] ? 'ok' : 'bad', r.grades[t.id] ? '✓' : '✗') : null);
  })));
  if (!r.evaluated) out.push(row(
    !allIn ? btn('ghost', 'Abgabe schließen (fehlende Teams auslassen)', () => ui.confirmAct('Abgabe schließen? Teams ohne Antwort werden ausgelassen.', 'play.closeSubmissions')) : null,
    btn('pink', 'Auswerten', () => ui.confirmAct(`Runde auswerten? Buzzer-Team: alles oder nichts (bei einer falschen Einschätzung auch kein Punkt für die eigene Antwort). Alle anderen richtigen Teams ${plus(pvc(g, 'other'))}.`, 'play.evaluate'))));
  else out.push(row(badge('ok', 'Ausgewertet')));
  return out;
}

// ---------- Hits me baby, one more time ----------
function konsequenz(ui, g, st) {
  const i = st.index ?? -1;
  const r = (st.rounds || {})[i];
  const stages = [0.5, 1, 3, 5, 10];
  const nums = String(g.content.points || '').split(/[,;\s/]+/).filter(Boolean).map(Number);
  const pv = stages.map((_, k) => (Number.isFinite(nums[k]) ? nums[k] : [5, 4, 3, 2, 1][k]));
  const out = [tabs(g.content.songs.map((s, k) => s.title || `Lied ${k + 1}`), i, (k) => ui.act('play.open', { index: k }), (k) => st.rounds?.[k]?.awarded),
    muted(`Staffelung (Vorschlag, im Editor änderbar): ${stages.map((s, k) => `${String(s).replace('.', ',')} s = ${pv[k]}`).join(' · ')}`)];
  if (i < 0 || !r) return [...out, help('Lied wählen, dann Stufe für Stufe anspielen. Teams schicken per Buzzer ab, ohne andere zu sperren.')];
  const s = g.content.songs[i];
  out.push(h('p', {}, 'Titel: ', h('b', {}, s.title || '–')));
  if (!s.audio) out.push(h('p', { class: 'notice warn' }, 'Für dieses Lied ist noch keine Datei hochgeladen.'));
  out.push(h('div', { class: 'stage-strip' }, stages.map((x, k) => h('span', { class: `st${k === r.stage ? ' now' : k < r.stage ? ' past' : ''}` }, `${String(x).replace('.', ',')} s`, h('small', {}, pts(pv[k]))))));
  if (!r.awarded) out.push(row(
    btn('pink', r.stage < 0 ? '▶ Stufe 1 (0,5 s)' : r.stage < stages.length - 1 ? `▶ Nächste Stufe (${String(stages[r.stage + 1]).replace('.', ',')} s)` : 'Letzte Stufe gespielt', () => ui.act('play.next'), !s.audio || r.stage >= stages.length - 1 || r.closed),
    btn('ghost', '⟲ Stufe wiederholen', () => ui.act('play.replay'), r.stage < 0),
    r.closed ? badge('', 'Abgabe geschlossen') : btn('ghost', 'Abgabe schließen', () => ui.act('play.close'))));
  out.push(h('ul', { class: 'list' }, Object.entries(r.answers).sort((a, b) => a[1].at - b[1].at).map(([id, a]) => teamLi(ui, id,
    [` · Stufe ${String(stages[a.stage]).replace('.', ',')} s (${pts(pv[a.stage])}) `, answerContent(a, 'mod')],
    ...gradeBtns(ui, (c) => ui.act('play.grade', { teamId: id, correct: c }), r.grades[id])))));
  if (!Object.keys(r.answers).length) out.push(muted('Noch keine Abgabe.'));
  out.push(row(r.awarded ? badge('ok', 'Punkte vergeben') : btn('pink', `Staffelung ${pv.join('-')} bestätigen und Punkte vergeben`, () => ui.confirmAct(`Punkte nach Staffelung ${pv.join(' / ')} vergeben?`, 'play.award'))));
  return out;
}

// ---------- Song Song Song ----------
function songsong(ui, g, st) {
  const i = st.index ?? -1;
  const r = (st.rounds || {})[i];
  const out = [tabs(g.content.puzzles.map((_, k) => `Rätsel ${k + 1}`), i, (k) => ui.act('play.open', { index: k }), (k) => st.rounds?.[k]?.done)];
  if (i < 0 || !r) return [...out, help('Rätsel wählen, Musik starten. Teams schicken per Buzzer ab; geprüft wird in Buzzer-Reihenfolge, Punkt nur für beide Titel.')];
  const p = g.content.puzzles[i];
  out.push(h('p', {}, 'Lösung: ', h('b', {}, p.melody || '–'), ' + ', h('b', {}, p.lyrics || '–')));
  if (!p.audio) out.push(h('p', { class: 'notice warn' }, 'Für dieses Rätsel ist noch keine Datei hochgeladen.'));
  if (!r.done) out.push(row(btn('pink', r.playback.state === 'playing' ? '▶ Läuft …' : '▶ Musik abspielen', () => ui.act('play.play'), !p.audio), btn('ghost', '■ Stopp', () => ui.act('play.stop'), r.playback.state !== 'playing'),
    btn('ghost', 'Rätsel beenden (kein Punkt)', () => ui.confirmAct('Rätsel ohne Punkt beenden?', 'play.close'))));
  const next = r.subs.find((s) => r.grades[s.teamId] === undefined);
  out.push(h('ol', { class: 'list' }, r.subs.length ? r.subs.map((s) => h('li', { class: s === next && !r.done ? 'active' : '' }, ui.dot(ui.teamColor(s.teamId)),
    h('span', { class: 'grow' }, h('b', {}, ui.teamName(s.teamId)), ' ', answerContent(s, 'mod')),
    r.grades[s.teamId] === true ? badge('ok', '✓ beide richtig') : r.grades[s.teamId] === false ? badge('bad', '✗') : null,
    s === next && !r.done ? [btn('small ok', '✓ Beide richtig', () => ui.act('play.judge', { correct: true })), btn('small bad', '✗ Nicht beide', () => ui.act('play.judge', { correct: false }))] : null))
    : h('li', { class: 'muted' }, 'Noch keine Abgabe.')));
  if (r.done) out.push(row(badge('ok', r.winner ? `${ui.teamName(r.winner)} ${plus(pvc(g, 'correct'))}` : 'Kein Punkt')));
  return out;
}

// ---------- DankeGleichFalsch ----------
function dgf(ui, g, st) {
  const c = st.catIndex ?? -1;
  const r = (st.rounds || {})[c];
  const out = [tabs(g.content.categories.map((x) => x.name || 'Kategorie'), c, (k) => ui.act('play.open', { catIndex: k }), (k) => st.rounds?.[k]?.done),
    help(`Reihum, ${g.content.seconds || 60} s pro Auswahl. Startteam wird je Kategorie ausgelost. Falsch oder Zeit um: raus, Punkte weg. Aussteigen sichert.`)];
  const cat = g.content.categories[Math.max(0, c)];
  if (c < 0 || !r) {
    const n = cat ? [lines(cat.right).length, lines(cat.wrong).length] : [0, 0];
    if (cat && (n[0] !== 22 || n[1] !== 3)) out.push(h('p', { class: 'notice warn' }, `„${cat.name}“: ${n[0]} passende und ${n[1]} falsche Begriffe – nötig sind 22 und 3.`));
    return [...out, help('Kategorie öffnen: das Startteam wird ausgelost.')];
  }
  out.push(h('p', {}, h('b', {}, r.name), ` · ${r.board.filter((b) => b.gone).length} von 22 gefunden`, r.done ? '' : [' · am Zug: ', h('b', {}, ui.teamName(r.order[r.turn])), ' · ', h('b', { 'data-deadline': r.deadline }, '')]));
  out.push(h('div', { class: 'dgf-mod-board' }, r.board.map((b) => h('span', { class: `dgf-chip${b.gone ? ' gone' : ''}${b.wrong ? ' wrong' : ''}`, title: b.wrong ? 'falsch (nur für die Regie)' : '' }, b.text))));
  out.push(h('ul', { class: 'list' }, r.order.map((id) => {
    const t = r.teams[id];
    const label = { wrong: 'falsch – raus', timeout: 'Zeit um – raus', secured: 'ausgestiegen, gesichert', finished: 'bis zum Ende, gutgeschrieben' }[t.out] || 'im Spiel';
    return teamLi(ui, id, ` · ${pts(t.points)} ${t.out ? '' : 'ungesichert'}`, badge(t.out === 'wrong' || t.out === 'timeout' ? 'bad' : t.out ? 'ok' : '', label));
  })));
  if (!r.done) out.push(row(btn('ghost', 'Kategorie beenden', () => ui.confirmAct('Kategorie beenden? Teams, die noch im Spiel sind, bekommen ihre Punkte.', 'play.close'))));
  else out.push(row(badge('ok', 'Kategorie beendet')));
  return out;
}

// ---------- Erst ich, dann du, dann du, dann du ----------
function zocken(ui, g, st) {
  const removed = st.removed || [];
  const c = st.current;
  const out = [help('Feld öffnen → alle buzzern. Richtig: Team sichert oder zockt (wählt selbst ein Feld). Falsch: Ungesichertes weg, Frage bleibt, andere buzzern.')];
  out.push(h('div', { class: 'zock-board mod' }, Array.from({ length: 24 }, (_, i) => h('button', {
    class: `zock-cell${removed.includes(i) ? ' gone' : ''}${c && c.q === i && !c.resolved ? ' now' : ''}`,
    disabled: removed.includes(i) || !!st.decide || !!st.choose,
    title: g.content.questions[i].question,
    onclick: () => ui.act('play.open', { q: i }),
  }, String(i + 1)))));
  const streaks = Object.entries(st.streak || {}).filter(([, v]) => v > 0);
  if (streaks.length) out.push(h('p', {}, 'Ungesichert: ', streaks.map(([id, v]) => h('b', { style: { marginRight: '10px' } }, `${ui.teamName(id)} ${v}`))));
  if (st.decide) out.push(h('p', { class: 'notice' }, `${ui.teamName(st.decide)} entscheidet: sichern oder zocken?`), row(btn('small ghost', 'Für das Team: sichern', () => ui.act('play.decideFor', { choice: 'secure' })), btn('small ghost', 'Für das Team: zocken', () => ui.act('play.decideFor', { choice: 'zock' }))));
  if (st.choose) out.push(h('p', { class: 'notice' }, `${ui.teamName(st.choose)} wählt das nächste Feld …`));
  if (c && !c.resolved) {
    const q = g.content.questions[c.q];
    out.push(h('p', { class: 'question', style: { fontSize: '1.25rem' } }, `Feld ${c.q + 1}: ${q.question}`), h('p', {}, 'Antwort: ', h('b', {}, q.answer)));
    const who = c.mode === 'zock' ? c.zockTeam : c.buzzes.find((b) => b.status === 'pending')?.teamId;
    out.push(h('p', {}, c.mode === 'zock' ? `🎲 ${ui.teamName(c.zockTeam)} zockt (allein)` : who ? ['🔔 ', h('b', {}, ui.teamName(who)), ' antwortet'] : 'Buzzer frei …',
      c.locked.length ? h('span', { class: 'muted' }, ` · gesperrt: ${c.locked.map((id) => ui.teamName(id)).join(', ')}`) : ''));
    if (who) out.push(row(...gradeBtns(ui, (ok) => ui.act('play.judge', { correct: ok }))));
    if (c.mode === 'open' && !who) out.push(row(btn('ghost', 'Frage zurück aufs Brett', () => ui.act('play.release'))));
  }
  if (removed.length === 24) out.push(row(badge('ok', 'Alle 24 Felder gespielt')));
  return out;
}

// ---------- Habt ihr noch Fragen? ----------
function fragen(ui, g, st) {
  const c = st.catIndex ?? -1;
  const r = (st.rounds || {})[c];
  const out = [tabs(g.content.categories.map((x) => x.name || 'Kategorie'), c, (k) => ui.act('play.open', { catIndex: k }), (k) => st.rounds?.[k]?.evaluated)];
  if (c < 0 || !r) return [...out, help('Kategorie öffnen: Teams schreiben Frage + Antwort und schicken per Buzzer ab.')];
  if (!r.published) {
    out.push(h('p', {}, h('b', {}, 'Vorschläge in Buzzer-Reihenfolge'), ' – unzulässig (privat, unklar, falsch) ablehnen, sonst annehmen und veröffentlichen.'));
    out.push(h('ol', { class: 'list' }, r.subs.length ? r.subs.map((s) => h('li', { class: s.status === 'accepted' ? 'active' : '' }, ui.dot(ui.teamColor(s.teamId)),
      h('div', { class: 'grow' }, h('b', {}, ui.teamName(s.teamId)), h('div', {}, h('span', { class: 'muted' }, 'Frage: '), ink(s.qInk)), h('div', {}, h('span', { class: 'muted' }, 'Antwort: '), ink(s.aInk))),
      s.status === 'rejected' ? badge('bad', 'abgelehnt') : [
        s.status === 'accepted' ? badge('ok', 'angenommen') : btn('small ok', 'Annehmen', () => ui.act('play.accept', { teamId: s.teamId })),
        btn('small bad', 'Ablehnen', async () => { const v = await ui.ask('Vorschlag ablehnen?', { confirmLabel: 'Ablehnen', fields: [{ name: 'reason', label: 'Grund (sehen die Teams, optional)', value: '' }] }); if (v) ui.act('play.reject', { teamId: s.teamId, reason: v.reason }); }),
      ])) : h('li', { class: 'muted' }, 'Noch keine Vorschläge.')));
    out.push(row(btn('pink', 'Angenommene Frage veröffentlichen', () => ui.confirmAct(`Frage veröffentlichen? Die anderen Teams haben ${g.content.seconds || 20} Sekunden. Auf dem Beamer steht nur die Frage.`, 'play.publish'), !r.accepted)));
    return out;
  }
  const acc = r.subs.find((s) => s.teamId === r.accepted);
  out.push(h('p', {}, 'Frage von ', h('b', {}, ui.teamName(r.accepted)), ': ', ink(acc.qInk), ' Antwort: ', ink(acc.aInk)));
  if (r.deadline && r.deadline > Date.now() && !r.evaluated) out.push(h('p', {}, '⏱ ', h('b', { 'data-deadline': r.deadline }, '')));
  out.push(h('ul', { class: 'list' }, ui.S.project.teams.filter((t) => t.id !== r.accepted).map((t) => {
    const a = r.answers[t.id];
    return teamLi(ui, t.id, a ? [': ', answerContent(a, 'mod')] : h('span', { class: 'muted' }, ' – keine Antwort'),
      a && !r.evaluated ? gradeBtns(ui, (ok) => ui.act('play.grade', { teamId: t.id, correct: ok }), r.grades[t.id]) : null,
      r.evaluated && a ? badge(r.grades[t.id] ? 'ok' : 'bad', r.grades[t.id] ? plus(pvc(g, 'correct')) : '0') : null);
  })));
  out.push(row(
    btn(`small ${r.showAnswers ? 'cyan' : 'ghost'}`, r.showAnswers ? 'Antworten auf Beamer ✓' : 'Antworten auf Beamer', () => ui.act('play.show', { what: 'answers', on: !r.showAnswers })),
    btn(`small ${r.showSolution ? 'cyan' : 'ghost'}`, r.showSolution ? 'Lösung auf Beamer ✓' : 'Lösung auf Beamer', () => ui.act('play.show', { what: 'solution', on: !r.showSolution })),
    r.evaluated ? badge('ok', 'Ausgewertet') : btn('pink', 'Auswerten', () => ui.confirmAct(`Auswerten? Richtig: ${plus(pvc(g, 'correct'))} je Team und ${plus(pvc(g, 'askerSomeone', -1))} für das fragende Team; niemand richtig: ${plus(pvc(g, 'askerNobody', 2))} für das fragende Team.`, 'play.evaluate'))));
  return out;
}

// ---------- Das geht mir zu weit ----------
function zuweit(ui, g, st) {
  const i = st.index ?? -1;
  const r = (st.rounds || {})[i];
  const ds = ui.S.datasets || [];
  const out = [tabs(g.content.rounds.map((_, k) => `Runde ${k + 1}`), i, (k) => ui.act('play.open', { index: k }), (k) => st.rounds?.[k]?.evaluated && !st.rounds?.[k]?.tie)];
  if (i < 0 || !r) return [...out, help(`Runde öffnen: Teams wählen zwei Einträge über ein Suchfeld. Bestes Ergebnis ${plus(pvc(g, 'best', 2))}, schlechtestes ${plus(pvc(g, 'worst', -1))}.`)];
  const rd = g.content.rounds[i];
  const meta = ds.find((d) => d.name === rd.dataset);
  out.push(h('p', { class: 'question', style: { fontSize: '1.2rem' } }, rd.task), h('p', {}, `${rd.dataset} · ${rd.mode} gewinnt`,
    rd.min !== null || rd.max !== null ? ` · erlaubt: ${rd.min ?? '…'} < Wert < ${rd.max ?? '…'}` : '', rd.tie ? ` · Gleichstand: ${rd.tie}` : ''));
  if (meta) out.push(h('p', { class: 'muted', style: { fontSize: '0.85rem' } }, `Quelle: ${meta.source} · Datenstand ${meta.asOf} · ${meta.method}`));
  out.push(h('ul', { class: 'list' }, ui.S.project.teams.map((t) => {
    const p = r.picks[t.id];
    const res = r.results && !r.tie ? r.results.rows.find((x) => x.teamId === t.id) : r.results ? r.results.rows.find((x) => x.teamId === t.id) : null;
    return teamLi(ui, t.id, p ? `: ${p.a} & ${p.b}` : h('span', { class: 'muted' }, ' – noch nicht abgegeben'),
      res ? badge(res.valid ? '' : 'bad', res.valid ? `Δ ${String(res.diff).replace('.', ',')}` : 'ungültig') : null,
      r.best?.includes(t.id) ? badge('ok', plus(pvc(g, 'best', 2))) : null, r.worst?.includes(t.id) ? badge('bad', plus(pvc(g, 'worst', -1))) : null);
  })));
  if (r.tie) {
    const sel = { best: [], worst: [] };
    const box = (kind, list) => h('div', { class: 'card', style: { marginTop: '10px' } }, h('b', {}, kind === 'best' ? 'Gleichstand um Platz 1: wer bekommt +2?' : 'Gleichstand am Ende: wer bekommt −1?'),
      h('div', { class: 'row' }, list.map((id) => h('label', { style: { fontWeight: 400 } }, h('input', { type: 'checkbox', style: { width: 'auto', marginRight: '6px' }, onchange: (ev) => { sel[kind] = ev.target.checked ? [...sel[kind], id] : sel[kind].filter((x) => x !== id); } }), ui.teamName(id)))));
    if (r.tie.best) out.push(box('best', r.tie.best));
    if (r.tie.worst) out.push(box('worst', r.tie.worst));
    out.push(row(btn('pink', 'Entscheidung buchen', () => ui.act('play.resolveTie', sel))));
  } else if (!r.evaluated) {
    const missing = ui.S.project.teams.filter((t) => !r.picks[t.id]);
    out.push(row(btn('pink', 'Auswerten', () => (missing.length ? ui.confirmAct(`Noch keine Abgabe von ${missing.map((t) => t.name).join(', ')}. Trotzdem auswerten?`, 'play.evaluate', { force: true }) : ui.act('play.evaluate')))));
  } else out.push(row(badge('ok', 'Ausgewertet')));
  return out;
}

// ---------- Brain or Dreh'n ----------
function brain(ui, g, st) {
  const out = [];
  const names = { category: 'Kategorie wird vorgestellt (Joker möglich)', question: 'Frage offen – Teams antworten', evaluated: 'Aufgelöst', wheel: 'Glücksrad' };
  if (st.round < 0 || !st.r) return [help('12 Runden. Kategorie vorstellen (Joker einsetzen) → Frage → auflösen → richtige Teams buzzern ans Glücksrad.'), row(btn('pink', 'Spiel starten', () => ui.act('play.start')))];
  const r = st.r;
  const q = g.content.rounds[st.round];
  out.push(h('p', {}, h('b', {}, `Runde ${st.round + 1} von ${g.content.rounds.length}: ${q.category}`), ` · ${names[r.phase]}`));
  if (r.phase !== 'category') out.push(h('p', { class: 'question', style: { fontSize: '1.2rem' } }, q.question), optionsList(q));
  if (r.joker) {
    const extra = `${r.joker.stolen ? ` – gezogen: ${jn(r.joker.stolen)}` : ''}${r.joker.stake ? ` – Einsatz ${r.joker.stake}` : ''}${r.joker.shielded ? ' – vom Schutzschild abgewehrt' : ''}`;
    out.push(h('p', { class: 'notice' }, `🃏 ${ui.teamName(r.joker.teamId)}: ${jn(r.joker.key)}${r.joker.target ? ` → ${ui.teamName(r.joker.target)}` : ''}${extra}`));
  }
  if (r.swapped) out.push(h('p', { class: 'notice' }, `🔁 Antworttausch: ${ui.teamName(r.swapped.teamId)} wertet ${r.swapped.used} statt ${r.swapped.original} (Antwort von ${ui.teamName(r.swapped.with)} bleibt ${r.swapped.used})`));
  out.push(h('ul', { class: 'list' }, ui.S.project.teams.map((t) => {
    const s = st.t[t.id] || { points: 0, jokers: [] };
    const a = r.answers[t.id];
    const flags = [s.blockedNow ? '⛔ gesperrt' : '', s.streak ? `🔥 Streak ${s.streak}` : '', s.double ? '✖️2 Doppelpunkt' : '', s.lockNow ? '🔒 Joker-Sperre' : '', s.ban ? 'Antwortverbot nächste Frage' : '',
      s.zero ? '🥶 Nullrunde' : '', s.wheelBanNow || s.wheelBan > 0 ? '🚫 Rad-Sperre' : '', s.rush ? '⏱ Zeitdruck nächste Frage' : '', r.rush && r.rush[t.id] && !a ? '⏱ Zeitdruck läuft' : ''].filter(Boolean).join(' · ');
    return teamLi(ui, t.id, ` · ${pts(s.points)}${flags ? ` · ${flags}` : ''}`,
      h('span', { class: 'muted' }, `Joker: ${s.jokers.length ? s.jokers.map((j) => jn(j.key)).join(', ') : '–'}`),
      a ? badge(r.phase === 'question' ? '' : a.choice === q.correct || a.choice2 === q.correct ? 'ok' : 'bad', `Antwort ${a.choice}${a.choice2 ? ` + ${a.choice2}` : ''}`) : null,
      (r.extra && r.extra[t.id] || []).map((x) => h('span', { class: 'muted' }, ` ${x}`)),
      btn('small ghost', '−1', () => ui.act('play.adjust', { teamId: t.id, delta: -1 })), btn('small ghost', '+1', () => ui.act('play.adjust', { teamId: t.id, delta: 1 })));
  })));
  const actions = [];
  if (r.phase === 'category') actions.push(btn('pink', 'Frage zeigen', () => ui.act('play.showQuestion')));
  if (r.phase === 'question') actions.push(btn('pink', `Auflösen (${Object.keys(r.answers).length} Antworten)`, () => ui.confirmAct('Frage auflösen und Spielpunkte vergeben?', 'play.evaluate')));
  if (r.phase === 'evaluated') actions.push(btn('pink', 'Glücksrad freigeben', () => ui.act('play.openWheel'), !(r.correct || []).length));
  if (r.phase === 'wheel') {
    if (r.redirect && r.redirect.pending) actions.push(h('span', {}, `↪️ ${ui.teamName(r.redirect.from)} leitet um – Ziel wählen:`), ...ui.S.project.teams.filter((t) => t.id !== r.redirect.from).map((t) => btn('small ghost', t.name, () => ui.act('play.redirectFor', { target: t.id }))));
    if (r.buzz && !r.spin) actions.push(h('span', {}, `🎡 ${ui.teamName(r.buzz)} darf drehen`), btn('ghost', 'Für das Team drehen', () => ui.act('play.spinFor')));
    else if (!r.buzz) actions.push(h('span', { class: 'muted' }, 'Warten auf den Buzzer der richtigen Teams …'));
  }
  if (['evaluated', 'wheel'].includes(r.phase) && st.round + 1 < g.content.rounds.length) actions.push(btn('ghost', 'Nächste Runde', () => ui.act('play.next')));
  actions.push(st.finished ? badge('ok', 'Spielpunkte gutgeschrieben') : btn('ghost', 'Spiel beenden (Spielpunkte gutschreiben)', () => ui.confirmAct('Spiel beenden und die Spielpunkte in den Gesamtstand übernehmen?', 'play.finish')));
  out.push(row(...actions));
  if (r.spin) out.push(h('p', {}, '🎡 Ergebnis für ', h('b', {}, ui.teamName(r.spin.teamId)), ': ', h('b', {}, r.spin.name || `Feld ${r.spin.n}`), r.spin.good ? ' – Joker kommt in den Vorrat' : r.spin.text ? ` – ${r.spin.text}` : ''));
  out.push(h('details', {}, h('summary', {}, 'Ereignisse'), h('ul', { class: 'list' }, (st.events || []).slice(-10).reverse().map((e) => h('li', {}, e.text)))));
  return out;
}
