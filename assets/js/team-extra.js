// Team-iPad: Ansichten der zusätzlichen Spiele aus der Spiele-Datenbank.
// Die Sicht kommt bereits gefiltert vom Server (keine fremden Antworten, keine
// geheimen Joker); hier wird nur dargestellt und eingegeben.

import { h, run, ask, toast, shield } from './client.js';
import { inkPad, clearInkDraft } from './ink.js';
import { TEAM_NEU } from './neu-team.js';
import { podiumRow } from './studio.js';

// Teamauswahl über die Pulte (wie beim Tausch in Spiel 2), mit Avataren.
// Nicht wählbare Teams sind ausgegraut; Antippen löst sofort aus.
function teamPodiums(ui, ids, onPick, label, marks) {
  const all = (ui.teams || []).length ? ui.teams : ids.map((id) => ({ id, name: ui.teamName(id), color: ui.teamColor(id) }));
  const allowed = new Set(ids);
  return h('div', { class: 'swap-podiums' }, podiumRow(all, {
    onPick, marks,
    pickLabel: (t) => `${t.name}${label ? ` – ${label}` : ''}`,
    disabledIds: all.filter((t) => !allowed.has(t.id)).map((t) => t.id),
  }));
}

// Punktwerte aus dem Editor (über den Server), sonst Standard.
const pv = (g, k, d = 1) => (g && g.scoring && typeof g.scoring[k] === 'number' ? g.scoring[k] : d);
const plus = (n) => `${n >= 0 ? '+' : '−'}${Math.abs(n)}`;


const ABCD = ['A', 'B', 'C', 'D'];
const pts = (n) => `${n} ${Math.abs(n) === 1 ? 'Punkt' : 'Punkte'}`;
const signed = (n) => `${n > 0 ? '+' : ''}${n}`;

function stateBox(kind, sym, text) {
  return h('div', { class: `state ${kind}`, role: 'status' }, h('span', { class: 'sym', 'aria-hidden': 'true' }, sym), text);
}
const wait = (big, small) => [h('div', { class: 'wait' }, h('p', { class: 'big' }, big), small ? h('p', { class: 'muted' }, small) : null)];
const countdown = (deadline) => h('b', { 'data-deadline': deadline }, '');
const muted = (t) => h('p', { class: 'muted' }, t);
const question = (t) => h('p', { class: 'question' }, t);

function abcd(options, { selected = null, correct = null, removed = [], onPick = null, disabled = false } = {}) {
  return h('div', { class: 'abcd' }, ABCD.map((l) => {
    const cls = ['abcd-opt', l === selected ? 'selected' : '', correct && l === correct ? 'correct' : '', correct && l === selected && l !== correct ? 'wrong' : '', removed.includes(l) ? 'removed' : ''].join(' ');
    return h('button', { class: cls, 'data-l': l, disabled: disabled || removed.includes(l) || !onPick, onclick: onPick ? () => onPick(l) : null },
      h('b', {}, l), h('span', {}, removed.includes(l) ? '' : options[l]));
  }));
}

function buzzButton(label, enabled, onclick) {
  return h('button', { class: 'buzzer', disabled: !enabled, 'aria-label': label, onclick }, 'BUZZ');
}

// Schreibfeld + Buzzer: der Buzzer wird erst nach dem ersten Stiftstrich aktiv
// und schickt die Handschrift sofort verbindlich ab (ohne Rückfrage).
function inkBuzzer(ui, { draftKey, label, action, payloadKey = 'ink', hint = 'Buzzer schickt eure Antwort sofort ab.' }) {
  let btn;
  const pad = inkPad({ draftKey, label, button: '', ask, toast, noSubmit: true, onChange: (has) => { btn.disabled = !has; } });
  btn = buzzButton('Antwort abschicken', pad.inkApi.hasInk(), async () => {
    if (!pad.inkApi.hasInk()) return;
    btn.disabled = true;
    if (await run(ui.conn, action, { [payloadKey]: pad.inkApi.png() })) clearInkDraft(draftKey);
    else btn.disabled = false;
  });
  pad.inkApi.autoSubmit = () => { if (pad.inkApi.hasInk() && !btn.disabled) btn.click(); };
  return [pad, muted(hint), btn];
}

export const TEAM_EXTRA = { dumm3, filmab, weissnicht, weissnicht2, konsequenz, songsong, dgf, zocken, fragen, zuweit, brain, ...TEAM_NEU };

// ---------- Dumm, dumm, dumm ----------
const dummDraft = {};
function dumm3(g, ui) {
  const out = [muted(`Frage ${g.qIndex + 1} von ${g.count} · ${g.level}`), question(g.question)];
  if (g.evaluated) {
    out.push(abcd(g.options, { selected: g.entry?.choice, correct: g.correct }));
    if (!g.entry) out.push(stateBox('', '–', 'Keine Abgabe'));
    else out.push(g.result > 0 ? stateBox('ok', '✓', `Richtig! ${signed(g.result)}`) : stateBox('bad', '✗', `Falsch – ${signed(g.result)} (richtig ist ${g.correct})`));
    return out;
  }
  if (g.entry) {
    out.push(abcd(g.options, { disabled: true }));
    out.push(shield(stateBox('', '🔒', `Verbindlich abgegeben: ${g.entry.choice} mit Einsatz ${g.entry.stake}`)));
    return out;
  }
  if (!g.open) return [...out, stateBox('', '🔒', 'Abgabe geschlossen')];
  const d = (dummDraft[g.qIndex] ||= { choice: null, stake: null });
  const summary = h('p', { class: 'dumm-summary' });
  const send = h('button', { class: 'btn pink huge', style: { width: '100%' } }, 'Absenden');
  const refresh = () => {
    for (const b of choices.querySelectorAll('.abcd-opt')) b.classList.toggle('selected', b.dataset.l === d.choice);
    for (const b of stakes.querySelectorAll('button')) b.classList.toggle('selected', Number(b.dataset.v) === d.stake);
    summary.textContent = d.choice && d.stake ? `Prüfen: Antwort ${d.choice}, Einsatz ${d.stake}. Erst „Absenden“ macht es verbindlich.` : 'Antwort und Einsatz wählen – beides lässt sich bis zum Absenden ändern.';
    send.disabled = !(d.choice && d.stake);
  };
  const choices = abcd(g.options, { selected: d.choice, onPick: (l) => { d.choice = l; refresh(); } });
  const stakes = h('div', { class: 'stakes', role: 'group', 'aria-label': 'Einsatz' }, [1, 2, 3, 4, 5].map((v) =>
    h('button', { class: 'stake', 'data-v': v, disabled: g.used.includes(v), onclick: () => { d.stake = v; refresh(); } }, String(v))));
  send.onclick = async () => {
    send.disabled = true;
    if (await run(ui.conn, 'play.submit', { choice: d.choice, stake: d.stake })) delete dummDraft[g.qIndex];
    else send.disabled = false;
  };
  out.push(choices, h('p', { class: 'stakes-label' }, 'Euer Einsatz (jeder Wert nur einmal im Spiel):'), stakes, summary, send);
  refresh();
  return out;
}

// ---------- Film ab – Buzzer an! ----------
function filmab(g, ui) {
  const out = [muted(`Film ${g.index + 1} von ${g.count}`)];
  if (g.resolved) {
    out.push(h('p', { class: 'question' }, `🎬 ${g.title}`));
    out.push(g.winner === ui.team.id ? stateBox('ok', '✓', `Richtig! ${plus(pv(g, 'correct'))}`) : stateBox('', '■', g.winner ? `${ui.teamName(g.winner)} hat es erraten.` : 'Niemand hat es erraten.'));
    return out;
  }
  if (!g.started) return [...out, ...wait('Gleich läuft der Film …', 'Schaut auf die Leinwand – wer den Film erkennt, buzzert!')];
  if (g.ownStatus === 'pending') return [...out, stateBox('', '🎤', 'Ihr seid dran – sagt laut den Filmtitel!')];
  if (g.locked) return [...out, stateBox('bad', '✗', 'Falsch – für diesen Film gesperrt')];
  if (g.someoneAnswering) out.push(stateBox('', '⏳', 'Ein anderes Team antwortet gerade …'));
  out.push(buzzButton('Buzzer', g.canBuzz, () => run(ui.conn, 'play.buzz')));
  return out;
}

// ---------- Ich weiß nicht, dass du weißt es doch ----------
function weissnicht(g, ui) {
  const out = [muted(`Runde ${g.index + 1} von ${g.count}`), g.question ? question(g.question) : null];
  if (g.result || g.closed) {
    if (g.solution) out.push(stateBox('', '💡', `Lösung: ${g.solution}`));
    if (g.result) {
      const winner = g.result === 'right' ? g.target : g.buzzer;
      out.push(winner === ui.team.id ? stateBox('ok', '✓', `${plus(pv(g, 'winner'))} für euch!`) : stateBox('', '■', `${plus(pv(g, 'winner'))} für ${ui.teamName(winner)}`));
    }
    return out;
  }
  if (g.isTarget) return [...out, stateBox('', '🎤', h('span', {}, `${ui.teamName(g.buzzer)} glaubt, ihr wisst es nicht. Antwortet laut – noch `, countdown(g.deadline)))];
  if (g.choose) {
    out.push(stateBox('ok', '🔔', 'Ihr wart am schnellsten! Welches Team weiß es eurer Meinung nach NICHT?'));
    out.push(teamPodiums(ui, g.choose, (id) => run(ui.conn, 'play.pick', { teamId: id }), 'weiß es nicht'));
    return out;
  }
  if (g.target) return [...out, stateBox('', '⏳', h('span', {}, `${ui.teamName(g.target)} antwortet – `, countdown(g.deadline)))];
  if (g.buzzer) return [...out, stateBox('', '⏳', g.isBuzzer ? 'Ihr wählt gleich …' : `${ui.teamName(g.buzzer)} war am schnellsten und wählt ein Team.`)];
  out.push(muted('Wer zuerst buzzert, wählt ein Team, das die Antwort angeblich nicht kennt.'));
  out.push(buzzButton('Buzzer', g.canBuzz, () => run(ui.conn, 'play.buzz')));
  return out;
}

// ---------- Ich weiß nicht, dass du weißt es doch 2.0 ----------
const guessDraft = {};
function weissnicht2(g, ui) {
  const out = [muted(`Runde ${g.index + 1} von ${g.count}`), g.question ? question(g.question) : null];
  if (g.evaluated) {
    if (g.solution) out.push(stateBox('', '💡', `Lösung: ${g.solution}`));
    if (g.ownCorrect !== null) out.push(g.ownCorrect ? stateBox('ok', '✓', g.isBuzzer ? 'Eure Antwort war richtig.' : `Eure Antwort war richtig: ${plus(pv(g, 'other'))}`) : stateBox('bad', '✗', 'Eure Antwort war falsch.'));
    if (g.result) out.push(stateBox(g.result.allRight ? 'ok' : 'bad', '★', g.result.allRight ? `Einschätzung alles richtig: +${g.result.guessPoints} · eigene Antwort +${g.result.ownPoint}` : 'Mindestens eine Einschätzung falsch – 0 Punkte, auch für eure eigene Antwort.'));
    return out;
  }
  if (!g.submitted) {
    if (!g.open) return [...out, stateBox('', '🔒', 'Abgabe geschlossen')];
    out.push(h('div', {}, inkPad({ draftKey: `wn2.${g.index}`, label: 'Eure Antwort', button: 'Abgeben', ask, toast, onSubmit: (ink) => run(ui.conn, 'play.submit', { ink }) })));
    if (g.buzzTaken) out.push(muted('Ein anderes Team hat schon gebuzzert – ihr könnt trotzdem in Ruhe abgeben.'));
    return out;
  }
  if (g.guessTeams) {
    const d = (guessDraft[g.index] ||= {});
    out.push(stateBox('ok', '🔔', 'Ihr wart am schnellsten! Schätzt ein: Wer hat richtig, wer falsch geantwortet? Mindestens ein Team, beliebig viele. Eine falsche Einschätzung = 0 Punkte für alle Einschätzungen!'));
    if (g.pendingTeams && g.pendingTeams.length) out.push(muted('Ihr könnt auch Teams einschätzen, die noch schreiben – ihre Antwort folgt. Teams, die ihr auslasst, zählen nicht.'));
    const rows = h('div', { class: 'guess-list' });
    const pods = h('div', {});
    const send = h('button', { class: 'btn pink huge', style: { width: '100%' } }, 'Einschätzung abschicken');
    const draw = () => {
      rows.replaceChildren(...g.guessTeams.map((id) => h('div', { class: 'guess-row', style: { '--team': ui.teamColor(id) } },
        h('b', {}, ui.teamName(id), (g.pendingTeams || []).includes(id) ? h('small', { class: 'muted', style: { fontWeight: 400, marginLeft: '8px' } }, '✎ schreibt noch') : null),
        ['richtig', 'falsch', 'auslassen'].map((lab) => {
          const val = lab === 'richtig' ? true : lab === 'falsch' ? false : undefined;
          return h('button', { class: `btn small ${d[id] === val ? 'pink' : 'ghost'}`, onclick: () => { if (val === undefined) delete d[id]; else d[id] = val; draw(); } }, lab);
        }))));
      for (const id of Object.keys(d)) if (!g.guessTeams.includes(id)) delete d[id];
      const marks = Object.fromEntries(Object.entries(d).map(([id, v]) => [id, v ? { text: '✓', cls: 'ok' } : { text: '✗', cls: 'bad' }]));
      pods.replaceChildren(teamPodiums(ui, g.guessTeams, (id) => { if (d[id] === true) d[id] = false; else if (d[id] === false) delete d[id]; else d[id] = true; draw(); }, 'antippen: richtig, falsch, auslassen', marks));
      send.disabled = !Object.keys(d).length;
    };
    send.onclick = async () => { send.disabled = true; if (await run(ui.conn, 'play.guess', { guesses: d })) delete guessDraft[g.index]; else send.disabled = false; };
    draw();
    out.push(pods, rows, send);
    return out;
  }
  if (g.guessed) return [...out, stateBox('', '⏳', 'Einschätzung abgegeben – die Moderation bewertet.')];
  out.push(stateBox('', '🔒', 'Abgegeben.'));
  if (!g.buzzTaken) out.push(muted('Wer zuerst buzzert, darf sofort einschätzen, welche Teams richtig liegen.'), buzzButton('Buzzer', g.canBuzz, () => run(ui.conn, 'play.buzz')));
  else if (!g.isBuzzer) out.push(muted('Ein anderes Team war schneller am Buzzer.'));
  return out;
}

// ---------- Hits me baby, one more time ----------
function konsequenz(g, ui) {
  const label = (i) => `${String(g.stages[i]).replace('.', ',')} s`;
  const out = [muted(`Lied ${g.index + 1} von ${g.count}`), h('div', { class: 'stage-strip' }, g.stages.map((s, i) => h('span', { class: `st${i === g.stage ? ' now' : i < g.stage ? ' past' : ''}` }, label(i), h('small', {}, pts(g.points[i])))))];
  if (g.awarded) {
    if (g.title) out.push(question(`🎵 ${g.title}`));
    if (g.submitted) out.push(g.correct ? stateBox('ok', '✓', `Richtig bei ${label(g.submitted.stage)}: +${g.gained}`) : stateBox('bad', '✗', 'Leider falsch'));
    return out;
  }
  if (g.submitted) return [...out, stateBox('', '🔒', `Abgeschickt bei Stufe ${label(g.submitted.stage)} – wartet auf die Auflösung.`)];
  if (g.stage < 0) return [...out, ...wait('Gleich gibt’s den ersten Ton …', 'Schreibt den Songtitel, sobald ihr ihn erkennt.')];
  if (!g.canSubmit) return [...out, stateBox('', '🔒', 'Abgabe geschlossen')];
  out.push(...inkBuzzer(ui, { draftKey: `ks.${g.index}`, label: 'Songtitel', action: 'play.submit', hint: `Jetzt abschicken = ${pts(g.points[g.stage])} bei richtiger Antwort. Andere Teams bleiben frei.` }));
  return out;
}

// ---------- Song Song Song ----------
function songsong(g, ui) {
  const out = [muted(`Rätsel ${g.index + 1} von ${g.count}`)];
  if (g.done) {
    if (g.solution) out.push(question(`🎵 ${g.solution.filter(Boolean).join(' + ')}`));
    out.push(g.won ? stateBox('ok', '✓', `Beide Titel richtig! ${plus(pv(g, 'correct'))}`) : g.submitted ? stateBox('bad', '✗', 'Leider nicht beide Titel richtig') : stateBox('', '■', 'Rätsel beendet'));
    return out;
  }
  if (g.submitted) {
    out.push(stateBox('', '🔒', `Abgeschickt als ${g.place}. – wird in Buzzer-Reihenfolge geprüft.`));
    if (g.grade === false) out.push(stateBox('bad', '✗', 'Nicht beide Titel richtig'));
    return out;
  }
  if (!g.started) return [...out, ...wait('Gleich läuft das Mash-up …', 'Schreibt BEIDE Songtitel. Interpreten braucht ihr nicht.')];
  out.push(...inkBuzzer(ui, { draftKey: `ss.${g.index}`, label: 'Beide Songtitel', action: 'play.submit', hint: 'Der Buzzer wird nach dem ersten Strich aktiv und schickt sofort verbindlich ab. Die anderen Teams bleiben frei.' }));
  return out;
}

// ---------- DankeGleichFalsch ----------
function dgf(g, ui) {
  if (g.waiting) return wait('Gleich geht’s los …');
  const out = [h('p', { class: 'question' }, g.name), muted(`${g.found} von 22 gefunden · eure ungesicherten Punkte: ${g.points}`)];
  if (g.done) {
    if (g.wrongTerms) out.push(stateBox('', '💡', `Die drei falschen: ${g.wrongTerms.join(', ')}`));
    return out;
  }
  if (g.out) {
    const txt = { wrong: `Falsch – ausgeschieden, ${pts(g.lost)} verloren.`, timeout: `Zeit abgelaufen – ausgeschieden, ${pts(g.lost)} verloren.`, secured: 'Ausgestiegen – eure Punkte sind gesichert.', finished: 'Kategorie geschafft – Punkte gutgeschrieben.' }[g.out];
    return [...out, stateBox(g.out === 'secured' || g.out === 'finished' ? 'ok' : 'bad', g.out === 'secured' ? '✓' : '✗', txt)];
  }
  if (g.flash?.kind === 'right') out.push(stateBox('ok', '✓', `„${g.flash.term}“ ist richtig! ${plus(pv(g, 'term'))}`));
  if (g.myTurn) out.push(h('div', { class: 'dgf-clock', style: { '--team': ui.team.color } }, '⏱ ', countdown(g.deadline)));
  else out.push(stateBox('', '⏳', h('span', {}, `${ui.teamName(g.turn)} ist dran – `, countdown(g.deadline))));
  out.push(h('div', { class: 'dgf-board' }, g.board.map((b) => h('button', {
    class: 'dgf-term', disabled: !g.myTurn,
    onclick: async () => {
      // Erst antippen, dann bestätigen – abbrechen ist erlaubt.
      if (await ask(`„${b.text}“ – diesen Begriff wirklich nehmen?`, { confirmLabel: 'Ja, nehmen', cancelLabel: 'Abbrechen' })) run(ui.conn, 'play.pick', { termId: b.id });
    },
  }, b.text))));
  out.push(h('button', { class: 'btn ok huge', style: { width: '100%', marginTop: '14px' }, onclick: () => run(ui.conn, 'play.secure') }, `Aussteigen und ${pts(g.points)} sichern`));
  return out;
}

// ---------- Erst ich, dann du, dann du, dann du ----------
function zocken(g, ui) {
  const out = [muted(`Ungesichert: ${g.streak} · gesichert: ${g.secured}`)];
  if (g.done) return [...out, ...wait('Alle 24 Felder sind gespielt!')];
  if (g.decide) {
    out.push(stateBox('ok', '✓', `Richtig! In eurer Serie: ${pts(g.streak)} ungesichert.`));
    out.push(h('div', { class: 'row', style: { gap: '12px' } },
      h('button', { class: 'btn ok huge', style: { flex: 1 }, onclick: () => run(ui.conn, 'play.decide', { choice: 'secure' }) }, `Sichern (${g.streak})`),
      h('button', { class: 'btn pink huge', style: { flex: 1 }, onclick: () => run(ui.conn, 'play.decide', { choice: 'zock' }) }, 'Zocken!')));
    return out;
  }
  if (g.choose) {
    out.push(stateBox('ok', '🎲', 'Wählt das nächste Feld – die Frage beantwortet ihr allein.'));
    out.push(h('div', { class: 'zock-board' }, Array.from({ length: 24 }, (_, i) => h('button', { class: 'zock-cell', disabled: g.removed.includes(i), onclick: () => run(ui.conn, 'play.choose', { q: i }) }, String(i + 1)))));
    return out;
  }
  const c = g.current;
  if (!c || c.resolved) return [...out, ...wait('Gleich kommt die nächste Frage …')];
  out.push(muted(`Feld ${c.q + 1}`), question(c.question));
  if (c.mode === 'zock') return [...out, g.zocking ? stateBox('', '🎤', 'Ihr zockt – antwortet laut!') : stateBox('', '⏳', `${ui.teamName(c.zockTeam)} zockt …`)];
  if (g.ownStatus === 'pending') return [...out, stateBox('', '🎤', 'Ihr seid dran – antwortet laut!')];
  if (g.locked) return [...out, stateBox('bad', '✗', 'Falsch – bei dieser Frage gesperrt')];
  out.push(buzzButton('Buzzer', g.canBuzz, () => run(ui.conn, 'play.buzz')));
  return out;
}

// ---------- Habt ihr noch Fragen? ----------
function fragen(g, ui) {
  const out = [h('p', { class: 'question' }, `Kategorie: ${g.name}`), g.note ? muted(g.note) : null];
  if (g.evaluated) {
    if (g.gained !== null) out.push(stateBox(g.gained > 0 ? 'ok' : g.gained < 0 ? 'bad' : '', '★', `${signed(g.gained)} für euch`));
    return out;
  }
  if (g.published) {
    if (g.asker) return [...out, stateBox('ok', '❓', h('span', {}, 'Eure Frage läuft! Die anderen haben noch ', countdown(g.deadline)))];
    if (g.answered) return [...out, stateBox('', '🔒', 'Antwort abgegeben – wartet auf die Auflösung.')];
    if (g.tooLate) return [...out, stateBox('bad', '⏱', 'Zeit abgelaufen')];
    out.push(h('div', { class: 'card' }, muted('Die Frage'), h('img', { class: 'ink-answer', src: g.question, alt: 'Handgeschriebene Frage' })));
    out.push(stateBox('', '⏱', h('span', {}, 'Noch ', countdown(g.deadline))));
    out.push(inkPad({ draftKey: `fr.a.${g.catIndex}`, label: 'Eure Antwort', button: 'Antwort abgeben', ask, toast, onSubmit: (ink) => run(ui.conn, 'play.answer', { ink }) }));
    return out;
  }
  if (g.proposal) {
    const txt = { pending: 'Vorschlag abgeschickt – die Moderation prüft in Buzzer-Reihenfolge.', rejected: `Vorschlag abgelehnt${g.proposal.reason ? ` (${g.proposal.reason})` : ''}.`, accepted: 'Euer Vorschlag ist angenommen! Gleich wird er gestellt.' }[g.proposal.status];
    return [...out, stateBox(g.proposal.status === 'rejected' ? 'bad' : g.proposal.status === 'accepted' ? 'ok' : '', '🔒', txt)];
  }
  if (!g.canPropose) return [...out, ...wait('Wartet auf die Moderation …')];
  // Zwei Schreibfelder; Buzzer erst aktiv, wenn in beiden etwas steht.
  let btn;
  const check = () => { btn.disabled = !(qPad.inkApi.hasInk() && aPad.inkApi.hasInk()); };
  const qPad = inkPad({ draftKey: `fr.q.${g.catIndex}`, label: 'Frage', button: '', ask, toast, noSubmit: true, small: true, onChange: () => check() });
  const aPad = inkPad({ draftKey: `fr.s.${g.catIndex}`, label: 'Richtige Antwort', button: '', ask, toast, noSubmit: true, small: true, onChange: () => check() });
  btn = buzzButton('Vorschlag abschicken', false, async () => {
    btn.disabled = true;
    if (await run(ui.conn, 'play.propose', { qInk: qPad.inkApi.png(), aInk: aPad.inkApi.png() })) { qPad.inkApi.clear(); aPad.inkApi.clear(); } else check();
  });
  check();
  out.push(muted('Eine allgemeingültige, sachlich beantwortbare Frage – nichts Privates.'), qPad, aPad, muted('Buzzer wird aktiv, sobald in beiden Feldern geschrieben wurde, und schickt sofort ab.'), btn);
  return out;
}

// ---------- Das geht mir zu weit ----------
const zuDraft = {};
function zuweit(g, ui) {
  const out = [muted(`Runde ${g.index + 1} von ${g.count} · ${g.dataset} · ${g.mode} gewinnt`), question(g.task)];
  if (g.result) {
    const r = g.result;
    out.push(stateBox(r.best ? 'ok' : r.worst ? 'bad' : '', r.best ? '🏆' : r.worst ? '✗' : '■',
      `${r.a} & ${r.b}: ${r.valid ? `${String(r.diff).replace('.', ',')} ${g.unit}` : 'ungültig (außerhalb der Grenzen)'}${r.best ? ` – bestes Ergebnis, ${plus(pv(g, 'best', 2))}` : r.worst ? ` – schlechtestes Ergebnis, ${plus(pv(g, 'worst', -1))}` : ''}`));
    return out;
  }
  if (g.pick) return [...out, shield(stateBox('', '🔒', `Abgegeben: ${g.pick.a} & ${g.pick.b}`))];
  if (!g.open || !g.optionsKey) return [...out, stateBox('', '🔒', 'Abgabe geschlossen')];
  const d = (zuDraft[g.index] ||= { a: '', b: '' });
  const box = h('div', { class: 'zu-form' }, muted('Liste wird geladen …'));
  loadZuOptions(ui, g.optionsKey).then((names) => {
    if (!names) { box.replaceChildren(stateBox('bad', '⚠', 'Die Liste konnte nicht geladen werden. Bitte Seite neu laden.')); return; }
    const index = names.map((n) => ({ n, k: zuNorm(n) }));
    const send = h('button', { class: 'btn pink huge', style: { width: '100%' } }, 'Abgeben');
    const field = (k, label) => suggestField(index, d, k, label, () => {});
    send.onclick = async () => {
      if (await run(ui.conn, 'play.submit', { a: d.a, b: d.b })) delete zuDraft[g.index];
    };
    box.replaceChildren(field('a', 'Erster Eintrag'), field('b', 'Zweiter Eintrag'),
      muted(`${names.length.toLocaleString('de-DE')} Einträge in der Liste · Groß-/Kleinschreibung und kleine Tippfehler sind egal`), send);
  });
  out.push(box);
  return out;
}

// Namensliste einer Runde nur einmal laden (große Datenbanken!).
const zuCache = new Map();
function loadZuOptions(ui, key) {
  if (!zuCache.has(key)) {
    zuCache.set(key, ui.conn.action('play.options', {}).then((res) => (res && Array.isArray(res.data) ? res.data : null)).catch(() => null));
  }
  return zuCache.get(key).then((v) => { if (!v) zuCache.delete(key); return v; });
}
const zuNorm = (s) => String(s || '').toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
function zuLev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
// Passende Vorschläge: Anfang > Wortanfang > enthalten > kleiner Tippfehler.
function zuSuggest(index, q, limit = 8) {
  const n = zuNorm(q);
  if (!n) return [];
  const scored = [];
  for (const it of index) {
    let sc = -1;
    if (it.k === n) sc = 0;
    else if (it.k.startsWith(n)) sc = 1;
    else if (it.k.includes(` ${n}`)) sc = 2;
    else if (it.k.includes(n)) sc = 3;
    else if (n.length >= 3) {
      const tol = n.length < 6 ? 1 : 2;
      // Tippfehler: mit dem Anfang gleicher Länge bzw. dem ganzen Namen vergleichen
      if (zuLev(it.k.slice(0, n.length), n, tol) <= tol || zuLev(it.k, n, tol) <= tol) sc = 4;
    }
    if (sc >= 0) scored.push({ n: it.n, sc });
  }
  scored.sort((a, b) => a.sc - b.sc || a.n.length - b.n.length || a.n.localeCompare(b.n, 'de'));
  return scored.slice(0, limit).map((x) => x.n);
}
// Eingabefeld mit gut sichtbaren Vorschlägen zum Antippen.
function suggestField(index, d, k, label, onChange) {
  const list = h('div', { class: 'zu-suggest' });
  const chosen = h('div', { class: 'zu-chosen' });
  const input = h('input', { id: `zu-${k}`, value: d[k], autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'Tippen – Vorschläge erscheinen darunter …' });
  // Grüne Bestätigung, sobald die Eingabe eindeutig einem Eintrag der Datenbank entspricht
  // (wie bei der Prüfung auf dem Server: Groß/klein, Akzente, ein Tippfehler egal).
  const resolveName = (q) => {
    const n = zuNorm(q);
    if (!n) return null;
    const exact = index.find((it) => it.k === n);
    if (exact) return exact.n;
    const close = index.map((it) => ({ n: it.n, dd: zuLev(it.k, n, 1) })).filter((x) => x.dd <= 1);
    return close.length === 1 ? close[0].n : null;
  };
  const showChosen = () => {
    const hit = resolveName(d[k]);
    chosen.replaceChildren(hit ? h('span', {}, '✓ in der Datenbank: ', h('b', {}, hit)) : d[k] && d[k].trim() ? h('span', { class: 'zu-miss' }, 'Noch kein passender Eintrag – Vorschlag antippen') : '');
  };
  const update = () => {
    const sug = zuSuggest(index, input.value);
    list.replaceChildren(...sug.map((name) => h('button', { type: 'button', class: `zu-opt${name === d[k] ? ' on' : ''}`,
      onclick: () => { d[k] = name; input.value = name; list.replaceChildren(); showChosen(); onChange(); } }, name)));
    if (input.value.trim() && !sug.length) list.replaceChildren(h('p', { class: 'muted', style: { margin: '6px 2px' } }, 'Kein passender Eintrag – anders schreiben?'));
  };
  input.addEventListener('input', () => { d[k] = input.value; showChosen(); update(); onChange(); });
  input.addEventListener('focus', update);
  showChosen();
  return h('div', { class: 'field zu-field' }, h('label', { for: `zu-${k}` }, label), input, chosen, list);
}

// ---------- Brain or Dreh'n ----------
function brain(g, ui) {
  if (g.waiting) return wait('Brain or Dreh’n', 'Gleich wird die erste Kategorie vorgestellt.');
  const out = [muted(`Runde ${g.round + 1} von ${g.count} · eure Spielpunkte: ${g.points}${g.streak ? ` · Streak: nächste richtige ${g.streak}` : ''}${g.double ? ' · Doppelpunkt aktiv' : ''}${g.zero ? ' · 🥶 Nullrunde: nächste richtige Antwort 0 Punkte' : ''}${g.wheelBan ? ' · 🚫 Rad-Sperre' : ''}${g.rushNext ? ' · ⏱ Zeitdruck bei der nächsten Frage' : ''}`)];
  out.push(h('p', { class: 'question' }, `Kategorie: ${g.category}`));
  // Joker-Vorrat (nur für euch sichtbar)
  if (g.jokers.length) {
    out.push(h('div', { class: 'joker-stash' }, h('b', {}, 'Euer Joker-Vorrat'), g.jokers.map((j) => h('div', { class: 'joker-card' },
      h('span', { class: 'ji' }, j.icon), h('span', { class: 'grow' }, h('b', {}, j.name), h('small', {}, j.text)),
      j.passive ? h('span', { class: 'chip' }, 'wirkt von selbst')
        : g.canUseJoker ? h('button', { class: 'btn small pink', disabled: !j.usable, title: j.usable ? '' : 'Gerade nicht möglich', onclick: async () => {
          let target = null;
          let stake = null;
          if (j.needsTarget) {
            target = await pickTeam(ui, j.targets || g.targets, `${j.name}: Welches Team?`);
            if (!target) return;
          }
          if (j.key === 'wette') {
            stake = await pickNumber(Array.from({ length: j.maxStake }, (_, i) => i + 1), `${j.name}: Wie viele Spielpunkte setzt ihr?`);
            if (!stake) return;
          }
          run(ui.conn, 'play.useJoker', { jokerId: j.id, target, stake });
        } }, j.usable ? 'Einsetzen' : 'Gerade nicht möglich') : null))));
    if (g.jokerLock) out.push(stateBox('bad', '🔒', 'Joker-Sperre: bei diesem Kategoriewechsel kein Joker.'));
  }
  if (g.jokerUsed && !g.jokerUsed.other) out.push(stateBox('ok', '🃏', g.bet ? `Euer Joker ist eingesetzt – Einsatz: ${pts(g.bet)}.` : 'Euer Joker ist eingesetzt.'));
  // Spielpunkte aller Teams in diesem Spiel
  out.push(h('div', { class: 'brain-points ipad' }, (g.allPoints || []).map((p) => h('div', { class: 'bp', '--chip': ui.teamColor(p.teamId) }, h('span', {}, ui.teamName(p.teamId)), h('b', {}, String(p.points))))));
  if (g.phase === 'category') return [...out, ...wait('Gleich kommt die Frage …', g.canUseJoker ? 'Jetzt ist die Zeit für einen Joker – nach dem Vorlesen ist es zu spät.' : '')];
  out.push(question(g.question));
  if (g.phase === 'question') {
    if (g.blocked) return [...out, stateBox('bad', '⛔', 'Ihr dürft diese Frage nicht beantworten.')];
    if (g.detective) {
      out.push(g.detective.waiting ? stateBox('', '🕵️', `Ihr beobachtet ${ui.teamName(g.detective.target)} – wartet auf deren Antwort …`) : stateBox('ok', '🕵️', `${ui.teamName(g.detective.target)} hat ${g.detective.answer} geantwortet.`));
    }
    if (g.swap && g.swap.ready && !g.swap.decided) {
      out.push(stateBox('ok', '🔁', `${ui.teamName(g.swap.target)} hat ${g.swap.theirs} geantwortet. Tauschen?`),
        h('div', { class: 'row' }, h('button', { class: 'btn pink', onclick: () => run(ui.conn, 'play.swap', { swap: true }) }, `Ja, ${g.swap.theirs} nehmen`), h('button', { class: 'btn ghost', onclick: () => run(ui.conn, 'play.swap', { swap: false }) }, 'Eigene behalten')));
    }
    if (g.rush && !g.answer) {
      if (g.rush.over) return [...out, stateBox('bad', '⏱', 'Zeitdruck: Eure Zeit ist abgelaufen.')];
      out.push(h('div', { class: 'dgf-clock', style: { '--team': ui.team.color } }, '⏱ Zeitdruck – noch ', countdown(g.rush.deadline)));
    }
    // Zwei Kreuze: nach der ersten Antwort eine zweite, andere wählen.
    const second = g.two && g.answer && !g.answer2;
    const canAnswer = (!g.answer || second) && !(g.detective && g.detective.waiting);
    if (g.two && !g.answer2) out.push(stateBox('ok', '✌️', g.answer ? 'Jetzt euer zweites Kreuz setzen.' : 'Zwei Kreuze: Ihr dürft zwei Antworten wählen.'));
    out.push(abcd(g.options, { selected: g.answer, removed: g.removed, disabled: !canAnswer, onPick: canAnswer ? (l) => run(ui.conn, 'play.answer', { choice: l }) : null }));
    if (g.answer && !second) out.push(shield(stateBox('', '🔒', `Eingeloggt: ${g.answer}${g.answer2 ? ` und ${g.answer2}` : ''}`)));
    return out;
  }
  out.push(abcd(g.options, { selected: g.answer, correct: g.correct, removed: g.removed }));
  const right = g.answer && (g.answer === g.correct || g.answer2 === g.correct);
  if (g.answer) out.push(right ? stateBox('ok', '✓', `Richtig! +${g.gained || 0}`) : stateBox('bad', '✗', g.gained ? `Leider falsch – trotzdem +${g.gained}` : 'Leider falsch'));
  for (const x of g.extra || []) out.push(muted(x));
  if (g.wheel) {
    if (g.redirect) {
      out.push(stateBox('ok', '↪️', `Umleitung! Wen soll „${g.redirect.field.name}“ treffen?`),
        teamPodiums(ui, g.targets, (id) => run(ui.conn, 'play.redirect', { target: id }), 'umleiten'));
    } else if (g.wheel.spin) out.push(stateBox(g.wheel.spin.field.good ? 'ok' : 'bad', g.wheel.spin.field.icon, g.wheel.spin.text && !g.wheel.spin.field.good ? `${g.wheel.spin.field.name}: ${g.wheel.spin.text}` : `${g.wheel.spin.field.name}: ${g.wheel.spin.field.text}`));
    else if (g.wheel.mine) out.push(stateBox('ok', '🎡', 'Ihr dürft drehen!'), h('button', { class: 'btn pink huge', style: { width: '100%' }, onclick: () => run(ui.conn, 'play.spin') }, 'Glücksrad drehen'));
    else if (g.wheel.banned) out.push(stateBox('bad', '🚫', 'Rad-Sperre: Diesmal dürft ihr nicht ans Glücksrad.'));
    else if (g.wheel.canBuzz) out.push(muted('Ihr lagt richtig – wer zuerst buzzert, dreht das Glücksrad.'), buzzButton('Buzzer', true, () => run(ui.conn, 'play.wheelBuzz')));
    else if (g.wheel.taken) out.push(stateBox('', '🎡', `${ui.teamName(g.wheel.taken)} dreht das Glücksrad.`));
  }
  if (g.finished) out.push(stateBox('ok', '🏁', `Spiel beendet – ${pts(g.points)} gehen in euren Punktestand.`));
  return out;
}

// Zahl auswählen (Einsatz der Wette).
function pickNumber(nums, title) {
  return new Promise((resolve) => {
    const close = (v) => { overlay.remove(); resolve(v); };
    const overlay = h('div', { class: 'modal-backdrop', role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'modal card' }, h('h3', {}, title),
        h('div', { class: 'team-pick' }, nums.map((n) => h('button', { class: 'btn huge', onclick: () => close(n) }, String(n)))),
        h('p', {}, h('button', { class: 'btn ghost', onclick: () => close(null) }, 'Abbrechen'))));
    document.body.append(overlay);
  });
}

// Team auswählen (für Joker mit Ziel): einfache Auswahl im Dialog.
function pickTeam(ui, ids, title) {
  return new Promise((resolve) => {
    const close = (v) => { overlay.remove(); resolve(v); };
    const overlay = h('div', { class: 'modal-backdrop', role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'modal card modal-podiums' }, h('h3', {}, title),
        teamPodiums(ui, ids, (id) => close(id), 'auswählen'),
        h('p', {}, h('button', { class: 'btn ghost', onclick: () => close(null) }, 'Abbrechen'))));
    document.body.append(overlay);
  });
}
