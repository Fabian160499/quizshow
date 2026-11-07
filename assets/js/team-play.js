// Team-iPad: Darstellung und Eingaben für alle acht Spiele. Die Sicht kommt
// bereits gefiltert vom Server; hier wird nichts Geheimes ausgeblendet.

import { h, run, ask, toast, coinImg, mediaUrl, shield } from './client.js';
import { inkPad, answerContent } from './ink.js';
import { mapView, zoomState } from './map.js';
import { podiumRow } from './studio.js';
import { TEAM_EXTRA } from './team-extra.js';
import { ksWall } from './ks-wall.js';

// Punktwerte aus dem Editor (über den Server), sonst Standard.
const pv = (g, k, d = 1) => (g && g.scoring && typeof g.scoring[k] === 'number' ? g.scoring[k] : d);
const plus = (n) => `${n >= 0 ? '+' : '−'}${Math.abs(n)}`;


const ABCD = ['A', 'B', 'C', 'D'];
const pts = (n) => `${n} ${Math.abs(n) === 1 ? 'Punkt' : 'Punkte'}`;

export function stateBox(kind, sym, text) {
  return h('div', { class: `state ${kind}`, role: 'status' }, h('span', { class: 'sym', 'aria-hidden': 'true' }, sym), text);
}

const wait = (big, small) => [h('div', { class: 'wait' }, h('p', { class: 'big' }, big), small ? h('p', { class: 'muted' }, small) : null)];
const countdown = (deadline) => h('b', { 'data-deadline': deadline }, '');

// ui: { conn, team, setDraft(key) }
export function renderPlay(p, ui) {
  const fn = { leichte5, dummes, land, kassenschlager, trumpf5, musik, jauch, nerd, ...TEAM_EXTRA }[p.type];
  return fn ? fn(p, ui) : wait('Gleich geht’s los!');
}

function textForm(ui, { draftKey, label, placeholder, max, button, confirm, action, payload = (text) => ({ text }) }) {
  ui.setDraft(draftKey);
  return h('form', {
    onsubmit: async (ev) => {
      ev.preventDefault();
      const text = document.getElementById('answer').value.trim();
      if (!text) return;
      if (await run(ui.conn, action, payload(text))) ui.clearDraft();
    },
  },
  h('label', { for: 'answer' }, label),
  h('textarea', { id: 'answer', class: 'answer-box', maxlength: String(max), autocomplete: 'off', placeholder }),
  h('p', {}, h('button', { class: 'btn pink huge', type: 'submit', style: { width: '100%' } }, button)));
}

// Großes Schreibfeld für den Apple Pencil statt Tastatur.
function inkForm(ui, { draftKey, label, button, action }) {
  return inkPad({
    draftKey, label, button, ask, toast,
    onSubmit: (ink) => run(ui.conn, action, { ink }),
  });
}

function choiceButtons(options, { selected = null, correct = null, removed = [], onPick = null, disabled = false }) {
  return h('div', { class: 'abcd' }, ABCD.map((l) => {
    const cls = ['abcd-opt', l === selected ? 'selected' : '', correct && l === correct ? 'correct' : '', correct && l === selected && l !== correct ? 'wrong' : '', removed.includes(l) ? 'removed' : ''].join(' ');
    return h('button', { class: cls, disabled: disabled || removed.includes(l) || !onPick, onclick: onPick ? () => onPick(l) : null },
      h('b', {}, l), h('span', {}, removed.includes(l) ? '' : options[l]));
  }));
}

function buzzer(ui, enabled) {
  return h('button', { class: 'buzzer', disabled: !enabled, 'aria-label': 'Buzzer', onclick: () => run(ui.conn, 'play.buzz') }, 'BUZZ');
}

function buzzState(b, { correct = 'Richtig!', locked = 'Falsch – für diese Aufgabe gesperrt', resolved = 'Aufgabe beendet' } = {}) {
  if (b.ownStatus === 'correct') return stateBox('ok', '✓', correct);
  if (b.locked) return stateBox('bad', '✗', locked);
  if (b.answering) return stateBox('', '🎤', 'Ihr seid dran – antwortet laut!');
  if (b.buzzed) return stateBox('', '⏳', 'Gebuzzert – ihr seid in der Warteschlange');
  if (b.resolved) return stateBox('', '■', resolved);
  return null;
}

// ---------- 1 · Die leichten 5 ----------

function leichte5(g, ui) {
  if (!g.question) return wait(`Frage ${g.qIndex + 1} kommt gleich …`);
  const out = [h('p', { class: 'muted' }, `Frage ${g.qIndex + 1} von ${g.count}`), h('p', { class: 'question' }, g.question)];
  if (g.image) {
    const img = h('img', { class: 'land-image ipad', alt: 'Bild zur Frage' });
    mediaUrl(g.image.id).then((url) => { if (url) img.src = url; });
    out.push(img);
  }
  if (g.answer) {
    const card = h('div', { class: 'card' }, h('p', { class: 'muted' }, 'Eure Antwort'), h('div', { style: { fontSize: '1.6rem', margin: 0 } }, answerContent(g.answer)));
    if (g.answer.grade === true) out.push(card, stateBox('ok', '✓', `Richtig! ${plus(pv(g, 'correct'))} ${Math.abs(pv(g, 'correct')) === 1 ? 'Punkt' : 'Punkte'}`));
    else if (g.answer.grade === false) out.push(card, stateBox('bad', '✗', 'Leider falsch'));
    else out.push(shield(card), stateBox('', '🔒', 'Abgegeben und gesperrt – wartet auf die Bewertung'));
    return out;
  }
  if (!g.open) return [...out, stateBox('', '🔒', 'Gesperrt – keine Abgabe mehr möglich')];
  out.push(inkForm(ui, {
    draftKey: `g1.${g.qIndex}`, label: 'Eure Antwort', button: 'Abgeben', action: 'play.submit',
  }));
  return out;
}

// ---------- 2 · Dumm ist der, der Dummes kriegt ----------

function dummes(g, ui) {
  const out = [h('p', { class: 'muted' }, `Frage ${g.qIndex + 1} von ${g.count}`), h('p', { class: 'question' }, g.question)];
  if (g.evaluated) {
    out.push(choiceButtons(g.options, { selected: g.final, correct: g.correct }));
    if (g.swappedWith) out.push(stateBox('', '🔁', `Getauscht mit ${g.swappedWith}: eure Antwort war ${g.choice}, jetzt zählt ${g.final}.`));
    if (!g.final) out.push(stateBox('', '–', 'Keine Antwort abgegeben'));
    else out.push(g.final === g.correct ? stateBox('ok', '✓', `Richtig! ${plus(pv(g, 'correct'))}`) : stateBox('bad', '✗', `Leider falsch – richtig ist ${g.correct}`));
    return out;
  }
  const canAnswer = g.open && !g.choice && !g.tooLate;
  out.push(choiceButtons(g.options, {
    selected: null, // Blickschutz: die gesperrte Antwort steht verdeckt darunter
    disabled: !canAnswer,
    onPick: canAnswer ? async (l) => {
      run(ui.conn, 'play.answer', { choice: l }); // sofort absenden, ohne Rückfrage
    } : null,
  }));
  if (!g.choice) {
    if (g.tooLate) out.push(stateBox('bad', '⏱', 'Die 10 Sekunden sind vorbei. Die Moderation kann euch noch einmal freigeben.'));
    else if (g.buzzTaken && g.open) out.push(stateBox('', '🔔', 'Ein Team hat gebuzzert – ihr könnt trotzdem noch abgeben.'));
    else if (!g.open) out.push(stateBox('', '🔒', 'Abgabe geschlossen'));
    return out;
  }
  if (g.swapTargets) {
    out.push(stateBox('ok', '🔔', 'Ihr wart am schnellsten! Tippt auf das Pult des Teams, mit dem ihr eure Antwort tauscht.'));
    // Teampulte wie auf dem Beamer; das eigene Team (und nicht wählbare) sind ausgegraut.
    const allowed = new Set(g.swapTargets.map((t) => t.id));
    const teams = (ui.teams || []).length ? ui.teams : g.swapTargets;
    out.push(h('div', { class: 'swap-podiums' }, podiumRow(teams, {
      onPick: (id) => run(ui.conn, 'play.swap', { teamId: id }), // sofort, ohne Rückfrage
      disabledIds: teams.filter((t) => !allowed.has(t.id)).map((t) => t.id),
    })));
    return out;
  }
  if (g.swapDone) return [...out, stateBox('ok', '🔁', 'Tausch erledigt – gleich wird aufgelöst.')];
  if (g.swapWaiting) return [...out, stateBox('ok', '🔔', h('span', {}, 'Ihr wart am schnellsten! Gleich dürft ihr tauschen … ', g.windowEnds ? countdown(g.windowEnds) : null))];
  out.push(shield(stateBox('', '🔒', `Antwort ${g.choice} gesperrt`)));
  if (!g.buzzTaken) out.push(h('p', { class: 'muted', style: { textAlign: 'center' } }, 'Wer zuerst buzzert, darf seine Antwort mit einem anderen Team tauschen.'), buzzer(ui, g.canBuzz));
  else if (g.buzzTaken && !g.isBuzzer) out.push(h('p', { class: 'muted' }, 'Ein anderes Team war schneller am Buzzer.'));
  return out;
}

// ---------- 3 · Ich sehe ein Land, das du nicht siehst ----------

let landPending = null;
let landZoom = { key: null, z: zoomState() };
// Abstand für die Beschriftung bei der Auflösung
export function landLabel(name, x) {
  if (x.km === null || x.km === undefined) return name;
  if (x.hit === true) return `${name} · ✓ im Land`;
  if (x.hit === false) return `${name} · ${x.km.toLocaleString('de-DE')} km daneben`;
  return `${name} · ${x.km.toLocaleString('de-DE')} km`;
}

function land(g, ui) {
  if (g.taskIndex < 0) return wait('Gleich geht’s los!', `Karte: ${g.map}`);
  const out = [h('p', { class: 'muted' }, `Aufgabe ${g.taskIndex + 1} von ${g.count} · Karte: ${g.map}${g.mode === 'country' ? ' · gesucht: ein ganzes Land' : ''}`), h('p', { class: 'question' }, g.question)];
  if (g.image) {
    // Bild auch auf dem iPad, damit jedes Team es aus der Nähe sieht.
    const img = h('img', { class: 'land-image ipad', alt: 'Bild zur Aufgabe' });
    mediaUrl(g.image.id).then((url) => { if (url) img.src = url; });
    out.push(img);
  }
  const key = `${g.taskIndex}`;
  if (landPending?.key !== key || g.own) landPending = null;
  const markers = [];
  if (g.guesses) {
    for (const x of g.guesses) markers.push({ lat: x.lat, lng: x.lng, color: ui.teamColor(x.teamId), label: landLabel(ui.teamName(x.teamId), x), showLabel: true });
  } else if (g.own) {
    markers.push({ lat: g.own.lat, lng: g.own.lng, color: ui.team.color, label: 'Euer Punkt' });
  }
  if (g.target && !g.target.country) markers.push({ lat: g.target.lat, lng: g.target.lng, kind: 'target', label: g.target.name, radii: [{ km: 100, pts: pv(g, 'r100', 2) }, { km: 50, pts: pv(g, 'r50', 3) }] });
  const canPick = g.open && !g.own;
  const box = h('div', { class: 'map-box' });
  const zk = `${key}:${g.map}:${g.target ? "aufgel" : "offen"}`; // bei der Auflösung neu: auf alle Tipps heranzoomen
  if (landZoom.key !== zk) landZoom = { key: zk, z: zoomState() };
  const draw = () => box.replaceChildren(mapView(g.map, {
    zoom: landZoom.z,
    fit: !!g.target,
    area: g.target && g.target.country ? g.target.shape : null,
    markers: [...markers, ...(landPending ? [{ ...landPending, color: ui.team.color, kind: 'pending', label: 'Euer Tipp' }] : [])],
    onPick: canPick ? (pt) => {
      landPending = { ...pt, key };
      draw();
      send.disabled = false;
    } : null,
    label: `Karte ${g.map}`,
  }));
  const send = h('button', {
    class: 'btn pink huge', style: { width: '100%' }, disabled: !landPending,
    onclick: async () => {
      if (!landPending) return;
      if (await run(ui.conn, 'play.guess', { lat: landPending.lat, lng: landPending.lng })) landPending = null;
    },
  }, 'Punkt sperren');
  draw();
  // Blickschutz: gesperrter Punkt bleibt bis zum Aufdecken verdeckt.
  out.push(g.own && !g.guesses ? shield(box) : box);
  if (canPick) out.push(h('p', { class: 'muted' }, 'Tippt auf die Karte, um euren Punkt zu setzen. Zum genauen Treffen mit zwei Fingern oder mit + / − zoomen und mit einem Finger verschieben. Ihr könnt den Punkt verschieben, bis ihr sperrt.'), send);
  else if (g.target) {
    const own = g.guesses?.find((x) => x.teamId === ui.team.id);
    if (g.target.country) {
      out.push(g.winners.includes(ui.team.id) ? stateBox('ok', '✓', `Im richtigen Land – ${g.target.name}! ${plus(pv(g, 'winner'))}`)
        : stateBox('', '🗺', `${g.target.name}${own ? ` – ihr lagt ${own.km.toLocaleString('de-DE')} km daneben` : ''}`));
    } else {
      const mine = (g.awards || {})[ui.team.id];
      const why = own && own.km <= 50 ? 'Innerhalb von 50 km!' : own && own.km <= 100 ? 'Innerhalb von 100 km!' : 'Am nächsten dran!';
      out.push(mine ? stateBox('ok', '✓', `${why} ${plus(mine)}${own ? ` (${own.km.toLocaleString('de-DE')} km)` : ''}`)
        : stateBox('', '📍', `${g.target.name}${own ? ` – ihr wart ${own.km.toLocaleString('de-DE')} km entfernt` : ''}`));
    }
  } else if (g.own) out.push(stateBox('', '🔒', 'Punkt gesperrt – wartet auf die Auflösung'));
  else out.push(stateBox('', '🔒', 'Abgabe geschlossen'));
  return out;
}

// ---------- 4 · Das ist ein echter Kassenschlager ----------

// Foto-Hinweis groß anzeigen, mit × oben rechts wieder schließen.
function photoZoom(src, label) {
  if (!src) return;
  const box = h('div', { class: 'photo-zoom', role: 'dialog', 'aria-modal': 'true', 'aria-label': label, onclick: (ev) => { if (ev.target === box) box.remove(); } },
    h('div', { class: 'photo-zoom-in' },
      h('button', { class: 'photo-zoom-x', 'aria-label': 'Schließen', onclick: () => box.remove() }, '×'),
      h('img', { src, alt: label })));
  document.body.append(box);
}

let busyBuy = false; // kein zweiter Kauf-Dialog, solange einer offen ist
function kassenschlager(g, ui) {
  const money = h('span', { class: 'wallet' }, `${g.wallet} $`);
  const head = h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('span', { class: 'muted' }, g.movieIndex >= 0 ? `Film ${g.movieIndex + 1} von ${g.movieCount} · Durchgang ${g.cycle} von 4` : 'Kassenschlager'), h('span', {}, 'Guthaben ', money));
  if (g.converted) return [head, stateBox('ok', '💰', `${g.converted.money} $ wurden zu ${pts(g.converted.points)}.`)];
  if (g.out) return [head, stateBox('bad', '✗', 'Ihr habt 0 $ und seid für die restlichen Filme ausgeschieden.')];
  if (g.movieIndex < 0) return [head, ...wait('Gleich geht’s los!', 'Ihr startet mit 20 $. Pro Film könnt ihr bis zu 4 Hinweise kaufen.')];
  if (!g.playing) return [head, ...wait('Dieser Film läuft ohne euch.')];
  const out = [head];
  if (g.finished) out.push(h('p', { class: 'question' }, `Der Film war: ${g.title}`));
  if (g.solved) out.push(stateBox('ok', '✓', 'Richtig! +5 $ – für diesen Film seid ihr fertig.'));
  else if (g.lastAnswer?.grade === false) {
    out.push(stateBox('bad', '✗', g.lastAnswer.ink ? 'Eure Antwort war leider falsch.' : `„${g.lastAnswer.text}“ war leider falsch.`));
    if (g.lastAnswer.ink) out.push(answerContent(g.lastAnswer, 'small'));
  }
  const buying = g.myTurn && g.phase === 'buy';
  const left = g.maxBuys - g.boughtCount;
  // Paywall oben, Aufgabe/Schreibfeld darunter (siehe .ks-split).
  const wall = [];
  wall.push(h('p', { class: 'muted' }, `Paywall · ${g.boughtCount} von ${g.maxBuys} Hinweisen gekauft`));
  // Hinweis-Wand wie auf dem Beamer: verdeckte Kacheln zeigen Namen und Preis,
  // gekaufte sind aufgedeckt. Kauf nur mit Rückfrage (bewusste Ausnahme).
  wall.push(ksWall(g.hints.map((x, i) => {
    const affordable = x.price <= g.wallet && left > 0;
    return {
      label: x.label, price: x.price, text: x.text, photo: x.photo, open: x.bought, mine: x.bought,
      onZoom: photoZoom,
      disabled: !buying || !affordable,
      onBuy: x.bought ? null : async () => {
        if (busyBuy) return;
        const msg = `Möchtest du diesen Hinweis kaufen?\n${x.label} kostet ${x.price} $. Danach habt ihr noch ${g.wallet - x.price} $.`;
        busyBuy = true;
        try { if (await ask(msg, { confirmLabel: 'Ja, kaufen', cancelLabel: 'Abbrechen' })) await run(ui.conn, 'play.buy', { hint: i }); } finally { busyBuy = false; }
      },
    };
  }), { cls: 'ipad-wall', layout: g.layout }));
  if (g.finished || g.solved) return [...out, ...wall];
  const side = [];
  if (!g.myTurn) side.push(stateBox('', '⏳', g.othersOpen ? 'Fertig für diesen Durchgang – die anderen Teams sind noch dran.' : 'Gleich startet der nächste Durchgang.'));
  else if (g.phase === 'buy') side.push(stateBox('ok', '👉', `Durchgang ${g.cycle}: Kauft einen Hinweis.`));
  else if (g.phase === 'grading') side.push(stateBox('', '🔒', 'Antwort abgegeben – die Moderation prüft.'));
  else {
    side.push(stateBox('ok', '✍', 'Schreibt jetzt den Filmtitel.'));
    side.push(inkForm(ui, {
      draftKey: `kassen.${g.movieIndex}.${g.cycle}`, label: 'Filmtitel', button: 'Antwort abgeben', action: 'play.answer',
    }));
  }
  out.push(h('div', { class: 'ks-split' }, h('div', {}, ...wall), h('div', {}, ...side)));
  return out;
}

// ---------- 5 · 5 ist Trümpf ----------

function trumpf5(g, ui) {
  const out = [
    h('p', { class: 'muted' }, `Begriff ${g.termIndex + 1} von 5 · Kategorie`),
    h('p', { class: 'question' }, g.category),
    g.hints.length ? h('ol', { class: 'hint-list' }, g.hints.map((t, i) => h('li', { style: g.resolved && i >= g.shown ? { opacity: 0.6, fontStyle: 'italic' } : null }, h('b', {}, `${i + 1}. `), t))) : h('p', { class: 'muted' }, 'Noch kein Hinweis freigegeben.'),
    g.term ? stateBox('', '💡', `Lösung: ${g.term}`) : null,
    g.resolved ? null : buzzer(ui, g.canBuzz),
  ];
  const s = buzzState(g, { locked: 'Falsch – für diesen Begriff gesperrt', resolved: 'Begriff beendet' });
  if (s) out.push(s);
  return out;
}

// ---------- 6 · Musikquiz ----------

function board(b, ui, current) {
  return h('div', { class: 'jeopardy small' }, b.map((cat, c) => h('div', { class: 'col' },
    h('div', { class: 'cat' }, cat.name || `Kategorie ${c + 1}`),
    cat.fields.map((f, i) => h('div', { class: `cell ${f.played ? 'played' : ''} ${current === `${c}-${i}` ? 'current' : ''}`, style: f.winner ? { borderColor: ui.teamColor(f.winner) } : null }, f.played ? '' : String(f.value))))));
}

function musik(g, ui) {
  const c = g.current;
  if (!c || c.resolved) {
    if (!g.started) return wait('Gleich geht’s los!', 'Ein Team wird ausgelost und wählt das erste Feld.');
    const res = c?.ownStatus === 'correct' ? stateBox('ok', '✓', 'Richtig!') : null;
    if (g.myPick) {
      // Ihr seid dran: Feld antippen – sofort gewählt, ohne Rückfrage.
      return [res, stateBox('ok', '👉', 'Ihr wählt! Tippt auf eine Kategorie und Punktzahl.'), h('div', { class: 'jp-board' }, g.board.map((cat, ci) => h('div', { class: 'jp-col' },
        h('div', { class: 'jp-cat' }, cat.name || `Kategorie ${ci + 1}`),
        cat.fields.map((f, fi) => h('button', { class: `jp-cell${f.played ? ' played' : ''}`, disabled: f.played,
          onclick: (ev) => { ev.currentTarget.disabled = true; run(ui.conn, 'play.pick', { cat: ci, field: fi }); } }, f.played ? '' : String(f.value))))))];
    }
    return [res, h('p', { class: 'muted' }, `Musikquiz · ${g.picker ? ui.teamName(g.picker) : 'Das nächste Team'} wählt ein Feld`), board(g.board, ui, null)];
  }
  const out = [h('p', { class: 'muted' }, `${c.category} · ${pts(c.value)}`)];
  if (c.mashup) out.push(h('p', {}, h('span', { class: 'badge warn' }, 'Song Song Song: beide Titel nennen')));
  if (c.task) out.push(h('p', { class: 'question' }, c.task));
  out.push(buzzer(ui, c.canBuzz));
  if (!c.started) out.push(stateBox('', '⏳', 'Gleich startet die Aufgabe …'));
  const s = buzzState(c);
  if (s) out.push(s);
  return out;
}

// ---------- 7 · Ein Hauch von Günther Jauch ----------

function ladder(g) {
  return h('div', { class: 'ladder' }, g.ladder.map((v, i) => h('span', { class: `step ${i === g.qIndex ? 'current' : ''} ${i === 3 ? 'safe' : ''}` }, `${i + 1}: ${v} P`)));
}

function jauch(g, ui) {
  const status = `Gesichert: ${pts(g.secured)}`;
  if (g.status === 'out') return [ladder(g), stateBox('bad', '✗', `Ausgeschieden bei Frage ${g.outAt}. Ihr behaltet ${pts(g.secured)}.`)];
  if (g.status === 'quit') return [ladder(g), stateBox('ok', '🏁', `${g.outAt ? `Ausgestiegen nach Frage ${g.outAt}` : 'Ausgestiegen'}. ${status}.`)];
  if (g.status === 'done') return [ladder(g), stateBox('ok', '🏆', `Alle acht Fragen geschafft! ${pts(g.secured)}.`)];
  if (g.qIndex < 0) return [ladder(g), ...wait('Gleich geht’s los!', 'Ihr habt einen 50:50-Joker und einen Telefonjoker.')];
  const out = [ladder(g), h('p', { class: 'muted' }, `Frage ${g.qIndex + 1} · ${pts(g.value)} · ${status}`), h('p', { class: 'question' }, g.question)];
  const phoneWait = g.phone?.waiting;
  const canAnswer = g.open && !g.choice && !phoneWait;
  // Blickschutz: nach dem Sperren bleibt die gewählte Antwort bis zur Auflösung verdeckt.
  const hideChoice = g.choice && !g.revealed;
  out.push(choiceButtons(g.options, {
    selected: hideChoice ? null : g.choice, correct: g.correct, removed: g.removed, disabled: !canAnswer,
    onPick: canAnswer ? async (l) => {
      run(ui.conn, 'play.answer', { choice: l }); // sofort absenden, ohne Rückfrage
    } : null,
  }));
  if (g.revealed) {
    out.push(g.choice === g.correct ? stateBox('ok', '✓', `Richtig! ${status}.`) : stateBox('bad', '✗', `Falsch – richtig ist ${g.correct}.`));
    if (g.canQuit) {
      out.push(h('button', {
        class: 'btn ghost huge', style: { width: '100%' },
        onclick: async () => {
          run(ui.conn, 'play.quit'); // sofort, ohne Rückfrage
        },
      }, `Aussteigen und ${pts(g.secured)} sichern`));
    }
    return out;
  }
  if (phoneWait) out.push(stateBox('', '📞', 'Telefonjoker: Wartet, bis alle anderen Teams gesperrt haben. Dann telefoniert ihr und gebt eure Antwort ab.'));
  else if (g.phone) out.push(stateBox('ok', '📞', 'Alle anderen haben gesperrt – jetzt telefonieren und dann antworten!'));
  else if (g.choice) out.push(shield(stateBox('', '🔒', `Antwort ${g.choice} gesperrt – wartet auf die Auflösung.`)));
  if (g.open && !g.choice) {
    // 50:50 jederzeit (einmal pro Team), Telefonjoker einmal pro Frage.
    const jokerBtn = (kind, label) => h('button', {
      class: 'btn', disabled: !g.jokers[kind] || (kind === 'phone' && (g.phoneTaken || !!g.phone)),
      onclick: async () => {
        run(ui.conn, 'play.joker', { kind }); // sofort, ohne Rückfrage
      },
    }, label);
    out.push(h('div', { class: 'row', style: { marginTop: '12px' } }, jokerBtn('fifty', '50:50-Joker'), jokerBtn('phone', '📞 Telefonjoker'),
      g.phoneTaken && g.jokers.phone ? h('span', { class: 'muted' }, 'In dieser Frage telefoniert schon ein anderes Team.') : null));
    if (g.canQuit) {
      out.push(h('button', {
        class: 'btn ghost huge', style: { width: '100%', marginTop: '12px' },
        onclick: () => run(ui.conn, 'play.quit'), // sofort, ohne Rückfrage
      }, `Nicht antworten – aussteigen und ${pts(g.secured)} sichern`));
    }
  }
  return out;
}

// ---------- 8 · Wer nix werd, werd Nerd ----------

// Notizfeld für den Apple Pencil (nur das eigene Team sieht es). Wird nach jedem
// Strich kurz verzögert auf dem Server gesichert und erscheint nach der Gebotsphase
// als Bild (nicht mehr beschreibbar) als Hilfe beim Antworten.
let nerdNotes = { key: null, el: null };
function nerdNotesPad(g, ui) {
  const key = `nerd.notes.${g.catIndex}`;
  if (nerdNotes.key === key) return nerdNotes.el;
  let t = null;
  const pad = inkPad({ draftKey: key, label: 'Eure Notizen (nur ihr seht sie)', button: '', ask, toast, noSubmit: true,
    onChange: () => { clearTimeout(t); t = setTimeout(() => run(ui.conn, 'play.notes', { ink: pad.inkApi.hasInk() ? pad.inkApi.png() : null }), 700); } });
  pad.classList.add('notes-pad');
  pad.querySelector('canvas')?.classList.add('notes-canvas');
  nerdNotes = { key, el: pad };
  return pad;
}

function nerd(g, ui) {
  const out = [h('p', { class: 'muted' }, `${g.finale ? '★ Große Finalkategorie' : `Kategorie ${g.catIndex + 1} von ${g.count}`}`), h('p', { class: 'question' }, g.category), g.possible ? h('p', { class: 'muted' }, `Maximal ${g.possible} richtige Antworten möglich`) : null];
  if (g.phase === 'bidding') {
    if (!g.canBid) return [...out, shield(stateBox('', '🔒', `Euer Gebot: ${g.ownBid} – wartet, bis alle Gebote aufgedeckt werden.`)), nerdNotesPad(g, ui)];
    const input = h('input', { id: 'bid', type: 'number', min: '1', max: String(g.maxBid), inputmode: 'numeric', class: 'bid-input', 'aria-label': 'Gebot' });
    out.push(h('p', {}, 'Wie viele richtige Antworten traut ihr euch zu? Das Gebot bleibt geheim, bis alle aufgedeckt werden.'));
    out.push(h('form', {
      class: 'row',
      onsubmit: async (ev) => {
        ev.preventDefault();
        const bid = Number(input.value);
        if (!Number.isInteger(bid) || bid < 1) return;
        run(ui.conn, 'play.bid', { bid }); // sofort absenden, ohne Rückfrage
      },
    }, input, h('button', { class: 'btn pink huge', type: 'submit' }, 'Gebot abgeben')));
    out.push(nerdNotesPad(g, ui));
    return out;
  }
  // Seid ihr gerade dran, dürft ihr weiter auf euren Notizen schreiben (z. B. Genanntes durchstreichen).
  const myTurn = g.attempt && !g.attempt.done && g.attempt.teamId === ui.team.id;
  if (myTurn) out.push(nerdNotesPad(g, ui));
  // Sonst: Notizen als Hilfe, nur noch zum Ansehen.
  else if (g.notesInk) out.push(h('div', { class: 'card notes-view' }, h('p', { class: 'muted', style: { margin: '0 0 6px' } }, 'Eure Notizen (nicht mehr änderbar)'), h('img', { class: 'ink-answer', src: g.notesInk, alt: 'Eure Notizen' })));
  if (g.bids) out.push(h('ul', { class: 'list' }, g.bids.map((b) => h('li', {}, h('span', { class: 'dot', style: { background: ui.teamColor(b.teamId) } }), h('span', { class: 'grow' }, ui.teamName(b.teamId)), h('b', {}, b.bid)))));
  if (g.phase === 'choose') {
    const mine = g.choose && g.choose.which === 'first' && g.choose.teamIds.includes(ui.team.id);
    if (g.coin) out.push(stateBox('', '🪙', 'Münzwurf auf dem Beamer – wer beginnt?'));
    else if (mine && !g.ownPref) {
      // Gleichstand: selbst wählen, ob ihr startet oder nachzieht – ohne Rückfrage.
      out.push(stateBox('ok', '⚖', 'Gleichstand! Wollt ihr starten oder nachziehen?'));
      out.push(h('div', { class: 'row', style: { gap: '12px', marginTop: '12px' } },
        h('button', { class: 'btn pink huge', style: { flex: '1' }, onclick: () => run(ui.conn, 'play.tiePick', { pref: 'start' }) }, 'Starten'),
        h('button', { class: 'btn cyan huge', style: { flex: '1' }, onclick: () => run(ui.conn, 'play.tiePick', { pref: 'follow' }) }, 'Nachziehen')));
    } else if (mine) out.push(stateBox('', '⏳', `Eure Wahl: ${g.ownPref === 'start' ? 'Starten' : 'Nachziehen'} – wartet auf das andere Team.`));
    else out.push(stateBox('', '⚖', 'Gleichstand – die Teams entscheiden, wer beginnt.'));
  }
  const a = g.attempt;
  if (a) {
    const mine = a.teamId === ui.team.id;
    const who = ui.teamName(a.teamId);
    let text;
    if (a.done === 'success') text = mine ? 'Geschafft!' : `${who} hat es geschafft.`;
    else if (a.done === 'fail') text = mine ? 'Leider gescheitert.' : `${who} ist gescheitert.`;
    else text = `${mine ? 'Ihr seid dran' : `${who} ist dran`} – Ziel ${a.target}: ${a.correct} richtig, ${a.errors} von ${a.maxErrors} Fehlern`;
    out.push(stateBox(mine && !a.done ? 'ok' : '', mine ? '🎤' : '👀', text));
    if (a.named.length) out.push(h('p', { class: 'muted' }, `Genannt: ${a.named.join(', ')}`));
  }
  const res = g.results.find((r) => r.teamId === ui.team.id);
  if (res) out.push(stateBox(res.success ? 'ok' : 'bad', res.success ? '✓' : '✗', `${res.points > 0 ? '+' : ''}${pts(res.points)}`));
  return out;
}

// ---------- Finale gegen die Moderation ----------

let finalePad = { key: null, el: null };

export function renderFinale(f, ui) {
  const scoreRow = h('div', { class: 'fin-head' },
    h('div', { class: 'fin-side', style: { '--team': f.team.color } }, h('b', {}, f.team.name), h('span', { class: 'fin-score' }, String(f.score.team))),
    h('div', { class: 'fin-vs' }, f.sudden ? 'SUDDEN DEATH' : `Ziel ${f.target}`),
    h('div', { class: 'fin-side mod' }, h('b', {}, f.host || 'Moderation'), h('span', { class: 'fin-score' }, String(f.score.mod))));
  const out = [h('p', { class: 'muted' }, '★ Finale gegen die Moderation'), scoreRow];
  if (f.result) {
    const won = f.result === 'team';
    out.push(stateBox(won ? 'ok' : '', won ? '🎟' : '🎤', won ? `${f.team.name} stiehlt die Show! Ticket für die große Finalshow.` : 'Die Moderation behält die Show.'));
    return out;
  }
  if (!f.player) {
    out.push(...wait(`${f.team.name} spielt das Finale`, 'Drückt die Daumen!'));
    return out;
  }
  out.push(h('div', { class: 'fin-coinrow' }, h('span', { class: 'muted' }, 'Eure Münzen: '),
    f.coinsTotal ? Array.from({ length: f.coinsTotal }, (_, i) => coinImg(`fin-coin${i < f.coins ? '' : ' lost'}`)) : h('span', { class: 'muted' }, 'keine')));
  const r = f.round;
  if (!r) return [...out, ...wait('Gleich kommt die erste Finalfrage …', 'Antwortet in Ruhe – es gibt keinen Zeitdruck.')];
  out.push(h('p', { class: 'muted' }, `Finalfrage ${f.qIndex + 1}`), h('p', { class: 'question' }, r.question));
  if (r.revealed) {
    out.push(stateBox(r.teamPoint ? 'ok' : 'bad', r.teamPoint ? '✓' : '✗', `${r.teamPoint ? 'Richtig! +1 Punkt' : 'Leider falsch – kein Punkt'} · Lösung: ${r.solution}`));
    if (!r.decided) {
      out.push(stateBox('', '🤫', 'Die Moderation hat verdeckt geantwortet und bekommt ihren Punkt – außer ihr setzt eine Münze ein und sie lag falsch. Liegt sie richtig, ist die Münze weg.'));
      out.push(h('p', {}, h('button', { class: 'btn pink huge fin-challenge', style: { width: '100%' }, disabled: !f.canChallenge, onclick: () => run(ui.conn, 'finale.challenge') },
        coinImg('fin-coin big'), ' Münze einsetzen – Moderation muss aufdecken')));
      out.push(h('p', {}, h('button', { class: 'btn ghost huge', style: { width: '100%' }, onclick: () => run(ui.conn, 'finale.pass') }, 'Keine Münze – weiter')));
      return out;
    }
    if (r.challenged) out.push(stateBox(r.modGrade === null ? '' : r.coinLost ? 'bad' : 'ok', '🪙', r.modGrade === null ? 'Münze eingesetzt – die Moderation deckt auf!' : r.coinLost ? 'Die Moderation lag richtig – eure Münze ist weg.' : 'Die Moderation lag falsch – kein Punkt für sie, ihr bekommt die Münze zurück!'));
    if (r.resolved) out.push(...wait('Gleich geht’s weiter …'));
    return out;
  }
  if (!r.own) {
    const key = `finale-team-${f.team.id}-${f.qIndex}`;
    if (finalePad.key !== key) {
      finalePad = { key, el: inkPad({ draftKey: key, label: 'Eure Antwort', button: 'Abgeben', ask, toast, onSubmit: (ink) => run(ui.conn, 'finale.answer', { ink }) }) };
    }
    out.push(finalePad.el);
    return out;
  }
  out.push(h('div', { class: 'card' }, h('p', { class: 'muted' }, 'Eure Antwort'), answerContent(r.own)));
  out.push(stateBox('', '⏳', r.modAnswered ? 'Gleich wird aufgelöst …' : 'Die Moderation schreibt noch …'));
  return out;
}
