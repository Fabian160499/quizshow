// Live-Regie und Editor für das Finale gegen die Moderation.

import { h, coinImg } from './client.js';
import { answerContent } from './ink.js';

const badge = (kind, text) => h('span', { class: `badge ${kind}` }, text);
const row = (...c) => h('div', { class: 'row', style: { marginTop: '12px' } }, ...c);
const btn = (cls, label, onclick, disabled = false) => h('button', { class: `btn ${cls}`, onclick, disabled }, label);

let showSolution = false;

export function buildFinaleLive(ui) {
  const { S, card, act, confirmAct } = ui;
  const F = S.finale || {};
  const st = F.state;
  const teamName = (id) => S.project.teams.find((t) => t.id === id)?.name || '?';

  if (!st) {
    const sel = h('select', { 'aria-label': 'Finalteam' }, S.project.teams.map((t) => h('option', { value: t.id, selected: t.id === F.suggestion }, `${t.name} · ${S.totals[t.id] || 0} Punkte · ${F.coinsByTeam?.[t.id] || 0} Münzen`)));
    return card('★ Finale gegen die Moderation',
      h('p', { class: 'muted' }, `Es spielt das Team mit den meisten Punkten. Ziel: ${F.config?.target ?? 5} Punkte. Der Schritt „Finale“ im Showablauf startet es automatisch.`),
      row(sel, btn('pink', 'Finale starten', () => act('finale.start', { teamId: sel.value }))));
  }

  const r = st.round;
  // Verklickt? Letzten Schritt im Finale zurücknehmen.
  const undoRow = F.undoLabel ? h('div', { class: 'row fin-undo' }, btn('small', `↶ Rückgängig: ${F.undoLabel}`, () => act('finale.undo'))) : null;
  const coins = h('span', { class: 'fin-coins' }, Array.from({ length: st.coinsTotal }, (_, i) => coinImg(`fin-coin${i < st.coins ? '' : ' lost'}`)));
  const head = h('div', { class: 'fin-head' },
    h('div', { class: 'fin-side', style: { '--team': st.team.color } }, h('b', {}, st.team.name), h('span', { class: 'fin-score' }, `${st.score.team}`), coins),
    h('div', { class: 'fin-vs' }, st.sudden ? badge('warn', 'SUDDEN DEATH') : `Ziel ${st.target}`),
    h('div', { class: 'fin-side mod' }, h('b', {}, st.host || 'Moderation'), h('span', { class: 'fin-score' }, `${st.score.mod}`)));

  const out = [head, undoRow];

  if (st.result) {
    out.push(h('div', { class: `state ${st.result === 'team' ? 'ok' : ''}`, role: 'status' }, h('span', { class: 'sym' }, st.result === 'team' ? '🎟' : '🎤'),
      st.result === 'team' ? `${st.team.name} stiehlt die Show – Ticket für die große Finalshow!` : 'Die Moderation behält die Show.'));
    out.push(row(btn('small ghost', 'Entscheidung zurücknehmen', () => confirmAct('Entscheidung zurücknehmen und das Finale fortsetzen?', 'finale.decide', { winner: null })),
      btn('small ghost', 'Finale neu starten', () => confirmAct('Finale komplett neu starten? Alle Finalpunkte gehen verloren.', 'finale.reset'))));
    return card('★ Finale gegen die Moderation', ...out);
  }

  if (!r || r.resolved) {
    if (r && r.resolved) {
      out.push(h('p', { class: 'muted' }, `Frage ${st.qIndex + 1}: Team ${r.teamPoint ? '+1' : '±0'}, Moderation ${r.modPoint ? '+1' : '±0'}${r.coinLost ? ' · Münze verloren' : r.challenged ? ' · Münze zurück' : ''}`));
    }
    out.push(st.next
      ? row(btn('pink', `${st.qIndex < 0 ? 'Erste' : 'Nächste'} Finalfrage stellen`, () => act('finale.next')), h('span', { class: 'muted' }, `noch ${st.questionsLeft} im Vorrat`))
      : h('p', { class: 'notice warn' }, 'Keine Finalfragen mehr. Bitte im Editor (Show-Editor → Finale) weitere anlegen.'));
  } else {
    out.push(h('p', { class: 'question', style: { fontSize: '1.3rem' } }, `Frage ${st.qIndex + 1}: ${r.question}`));
    out.push(h('details', { class: 'fin-solution', open: showSolution, ontoggle: (ev) => (showSolution = ev.target.open) },
      h('summary', {}, 'Lösung (nur für die Regie)'), h('b', {}, r.answer || '–')));

    // Antwort der Moderation: kommt verdeckt vom iPad der Moderation
    out.push(h('div', { class: 'fin-answer' }, h('span', { class: 'muted' }, 'Moderation: '),
      !r.mod ? badge('', '… schreibt auf dem iPad Moderation') : r.challenged ? answerContent(r.mod) : badge('', '🤫 verdeckt abgegeben'),
      r.mod && r.challenged ? (r.modGrade === null
        ? h('span', { class: 'row' }, badge('warn', 'Münze eingesetzt – aufdecken!'), btn('small ok', '✓ Richtig (Münze weg)', () => act('finale.gradeMod', { correct: true })), btn('small bad', '✗ Falsch (kein Punkt)', () => act('finale.gradeMod', { correct: false })))
        : badge(r.modGrade ? 'ok' : 'bad', r.modGrade ? '✓ richtig' : '✗ falsch')) : null));

    // Antwort des Teams
    out.push(h('div', { class: 'fin-answer' }, h('span', { class: 'muted' }, `${st.team.name}: `),
      r.team ? answerContent(r.team) : badge('', '… schreibt noch'),
      r.team && !r.revealed ? h('span', { class: 'row' },
        btn(`small ${r.teamGrade === true ? 'ok' : 'ghost'}`, '✓ Richtig', () => act('finale.gradeTeam', { correct: true })),
        btn(`small ${r.teamGrade === false ? 'bad' : 'ghost'}`, '✗ Falsch', () => act('finale.gradeTeam', { correct: false })))
        : r.revealed ? badge(r.teamGrade ? 'ok' : 'bad', r.teamGrade ? '✓ richtig · +1 Punkt' : '✗ falsch · kein Punkt') : null));

    // 1. Auflösen (Team bekommt seinen Punkt) → 2. Team entscheidet über die Münze
    if (!r.revealed) {
      const ready = r.team && r.mod && r.teamGrade !== null;
      out.push(row(btn('pink', 'Frage auflösen (Lösung + Teampunkt)', () => act('finale.reveal'), !ready),
        !ready ? h('span', { class: 'muted' }, 'Erst müssen beide antworten und die Teamantwort bewertet sein.') : null));
    } else if (!r.decided) {
      out.push(row(badge('warn', `${st.team.name} entscheidet: Münze einsetzen? (${st.coins} übrig)`),
        btn('small ghost', 'Ohne Münze weiter', () => act('finale.resolve'))));
    }
  }
  out.push(h('details', { style: { marginTop: '12px' } }, h('summary', { class: 'muted' }, 'Notfall'),
    row(btn('small ghost', `Sieg für ${st.team.name}`, () => confirmAct(`${st.team.name} zum Sieger erklären?`, 'finale.decide', { winner: 'team' })),
      btn('small ghost', 'Sieg für die Moderation', () => confirmAct('Die Moderation zum Sieger erklären?', 'finale.decide', { winner: 'mod' })),
      btn('small ghost', 'Finale neu starten', () => confirmAct('Finale komplett neu starten?', 'finale.reset')))));
  return card('★ Finale gegen die Moderation', ...out);
}

// ---------- Editor ----------
let draft = null;

export function buildFinaleEditor(ui) {
  const { S, card, act, autosave } = ui;
  const cfg = S.finale?.config || { target: 5, questions: [] };
  if (!draft || ui.reset) draft = JSON.parse(JSON.stringify(cfg));
  const save = () => autosave('finale.config', () => act('finale.config', draft));
  const list = h('ol', { class: 'list fin-qlist' }, draft.questions.map((q, i) => h('li', {},
    h('b', {}, `${i + 1}.`),
    h('input', { value: q.question, maxlength: '300', placeholder: 'Frage', 'aria-label': `Frage ${i + 1}`, class: 'grow', oninput: (ev) => { q.question = ev.target.value; save(); } }),
    h('input', { value: q.answer, maxlength: '160', placeholder: 'Lösung', 'aria-label': `Lösung ${i + 1}`, style: { maxWidth: '220px' }, oninput: (ev) => { q.answer = ev.target.value; save(); } }),
    h('button', { class: 'btn small bad', 'aria-label': 'Frage entfernen', onclick: () => { draft.questions.splice(i, 1); save(); ui.rerender(); } }, '✕'))));
  return card('★ Finale gegen die Moderation',
    h('p', { class: 'muted' }, 'Das Team mit den meisten Punkten spielt gegen die Moderation. Beide schreiben ihre Antwort gleichzeitig auf. Die Moderation bekommt jede Frage einen Punkt, ohne ihre Antwort zu zeigen – außer das Team setzt eine Münze ein. Wer zuerst das Ziel erreicht, gewinnt; erreichen es beide gleichzeitig, folgt Sudden Death. Verliert das Team seine letzte Münze, hat es sofort verloren. Der Sieger bekommt ein Ticket für die große Finalshow. Die Moderation schreibt ihre Antwort auf ihrem iPad: Startseite → links „🎤 Moderation (Finale)“ → Passwort „fabian“.'),
    h('div', { class: 'row' }, h('label', { for: 'fin-target' }, 'Ziel (Punkte)'),
      h('input', { id: 'fin-target', type: 'number', min: '1', max: '20', value: draft.target, style: { width: '90px' }, oninput: (ev) => { draft.target = Number(ev.target.value); save(); } })),
    list,
    row(btn('', '+ Frage', () => { draft.questions.push({ question: '', answer: '' }); save(); ui.rerender(); })),
    h('p', { class: 'muted', style: { fontSize: '0.85rem' } }, 'Tipp: Mehr Fragen anlegen als das Ziel – Sudden Death braucht Reserve.'));
}
