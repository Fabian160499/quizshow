// Beamer: Spielansichten für alle acht Spiele. Es kommen nur freigegebene Daten an.

import { h, mediaUrl } from './client.js';
import { answerContent } from './ink.js';
import { mapView } from './map.js';
import { BEAMER_EXTRA } from './beamer-extra.js';
import { ksWall } from './ks-wall.js';

const pv = (v, k, d = 1) => (v && v.scoring && typeof v.scoring[k] === 'number' ? v.scoring[k] : d);

const ABCD = ['A', 'B', 'C', 'D'];
const pts = (n) => `${n} ${Math.abs(n) === 1 ? 'Punkt' : 'Punkte'}`;
const sub = (text, style = {}) => h('div', { class: 'sub', style: { marginTop: 0, ...style } }, text);
const chip = (t, extra = '', ...rest) => h('span', { class: `chip team-chip ${extra}`, '--chip': t.color }, t.name, ...rest);

export function renderGame(v, s, teamOf) {
  const fn = { leichte5, dummes, land, kassenschlager, trumpf5, musik, jauch, nerd }[v.type];
  if (v.type === 'jauch') return jauch(v, teamOf, s); // eigenes, bildschirmfüllendes Design
  if (BEAMER_EXTRA[v.type]) return BEAMER_EXTRA[v.type](v, teamOf, s).filter(Boolean);
  // Schlank: keine Spielnummer, kein Spielname, kein Fragezähler – nur Frage und Antworten.
  return fn ? fn(v, teamOf).filter(Boolean) : [h('div', { class: 'mega' }, s.game.title)];
}

function options(v, { correct = null, marks = {}, compact = false } = {}) {
  return h('div', { class: `options ${compact ? 'compact' : ''}` }, ABCD.map((l) => h('div', { class: `opt ${correct === l ? 'correct' : ''} ${correct && correct !== l ? 'dim' : ''}` },
    h('b', {}, l), h('span', { class: 'grow' }, v.options[l]), h('span', { class: 'marks' }, ...(marks[l] || [])))));
}

function buzzRow(v, teamOf, order, answering) {
  if (!order.length) return null;
  return h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '3vh' } }, order.map((b) => {
    const sym = b.status === 'correct' ? ' ✓' : b.status === 'wrong' ? ' ✗' : '';
    return chip(teamOf(b.teamId), `${b.teamId === answering ? 'answering' : ''} ${b.status === 'wrong' ? 'wrong' : ''}`, sym);
  }));
}

// Team immer mit Namen zeigen (nie nur ein Farbpunkt).
const dot = (t) => h('span', { class: 'dm-name', '--team': t.color }, t.name);

// ---------- 1 ----------
function leichte5(v, teamOf) {
  // Mit Bild: Frage schmaler oben, Bild groß darunter; sobald Antworten gezeigt werden, kleiner daneben.
  const out = [h('div', { class: `q${v.image ? ' compact slim' : ''}` }, v.question || '…')];
  if (v.image) {
    const img = h('img', { class: 'l5-image', alt: '' });
    mediaUrl(v.image.id).then((url) => { if (url) img.src = url; });
    out.push(h('div', { class: `l5-image-box${v.answers.length || v.solution ? ' small' : ''}` }, img));
  }
  if (!v.answers.length && v.question && !v.solution) out.push(sub(`${v.submittedCount} von ${v.teamCount} Teams haben abgegeben`, { marginTop: '2vh' }));
  // Jedes Team groß in einer eigenen Karte, alle nebeneinander; richtig/falsch als großer Stempel.
  out.push(h('div', { class: `answers l5-answers n${Math.min(v.answers.length, 6)}${v.reveal && !v.reveal.done ? ' l5-solo' : ''}` }, v.answers.map((a) => {
    const t = teamOf(a.teamId);
    const mark = a.grade === true ? h('span', { class: 'l5-stamp ok', 'aria-label': 'richtig' }, '✓') : a.grade === false ? h('span', { class: 'l5-stamp bad', 'aria-label': 'falsch' }, '✗') : null;
    // Wie im Finale: schwarze Antwortfläche, darunter die graue Namensleiste, Teamfarbe als seitliche Balken.
    return h('div', { class: `answer fx-card l5-card${a.ink ? ' has-ink' : ''}${a.grade === true ? ' ok' : a.grade === false ? ' bad' : ''}`, '--team': t.color },
      h('div', { class: 'ans-name l5-name' }, t.name),
      a.hidden ? h('div', { class: 'ans-body l5-hidden' }, h('span', { class: 'l5-q' }, '?')) : h('div', { class: 'ans-body' }, answerContent(a, 'beamer'), mark));
  })));
  if (v.solution) out.push(h('div', { class: 'solution' }, `Lösung: ${v.solution}`));
  return out;
}

// ---------- 2 ----------
function dummes(v, teamOf) {
  const marks = {};
  // Bei der Auflösung: Teamnamen an der Antwort (getauschte Teams mit 🔁).
  const swapped = new Set((v.swapDetail || []).map((x) => x.teamId));
  for (const f of v.finals) {
    const t = teamOf(f.teamId);
    (marks[f.choice] ||= []).push(h('span', { class: `dm-name${swapped.has(f.teamId) ? ' swapped' : ''}`, '--team': t.color }, swapped.has(f.teamId) ? `🔁 ${t.name}` : t.name));
  }
  const out = [h('div', { class: 'q compact' }, v.question), options(v, { correct: v.correct, marks, compact: v.evaluated })];
  if (!v.evaluated) out.push(sub(`${v.submittedCount} von ${v.teamCount} Teams haben gesperrt`, { marginTop: '2vh' }));
  if (v.buzz && !v.evaluated) out.push(h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '2vh' } }, chip(teamOf(v.buzz), 'answering', ' 🔔 war am schnellsten'), v.windowEnds ? h('span', { class: 'chip' }, '⏱ ', h('b', { 'data-deadline': v.windowEnds }, '')) : null));
  if (v.swapDetail) {
    // Wer mit wem getauscht hat und was es gebracht hat.
    const eff = (x) => {
      const was = x.before === v.correct, now = x.after === v.correct;
      if (was === now) return now ? ['same ok', 'bleibt richtig'] : ['same', 'bleibt falsch'];
      return now ? ['win', 'Punkt gewonnen 🎉'] : ['lose', 'Punkt verloren 😱'];
    };
    const card = (x) => {
      const t = teamOf(x.teamId);
      const [cls, txt] = eff(x);
      return h('div', { class: `dm-swap-card ${cls}`, '--team': t.color },
        h('div', { class: 'dm-swap-name' }, t.name),
        h('div', { class: 'dm-swap-move' }, h('span', { class: x.before === v.correct ? 'ok' : 'bad' }, x.before), ' → ', h('span', { class: x.after === v.correct ? 'ok' : 'bad' }, x.after)),
        h('div', { class: 'dm-swap-eff' }, txt));
    };
    const [a, b] = v.swapDetail;
    out.push(h('div', { class: 'dm-swap' }, card(a), h('div', { class: 'dm-swap-icon', title: `${teamOf(a.teamId).name} hat mit ${teamOf(b.teamId).name} getauscht` }, '🔁', h('small', {}, 'getauscht')), card(b)));
  } else if (v.evaluated && v.buzz) out.push(sub(`${teamOf(v.buzz).name} war am schnellsten und hat nicht getauscht`, { marginTop: '1.5vh' }));
  return out;
}

// ---------- 3 ----------
function land(v, teamOf) {
  if (v.waiting) return [h('div', { class: 'mega', style: { fontSize: 'clamp(2rem,5vw,5rem)' } }, 'Ich sehe ein Land …'), h('div', { class: 'map-box beamer-map' }, mapView(v.map))];
  const tag = (g) => {
    const n = teamOf(g.teamId).name;
    if (g.km === null || g.km === undefined) return n;
    if (g.hit === true) return `${n} · ✓ im Land`;
    if (g.hit === false) return `${n} · ${g.km.toLocaleString('de-DE')} km daneben`;
    return `${n} · ${g.km.toLocaleString('de-DE')} km`;
  };
  const markers = (v.guesses || []).map((g) => ({ lat: g.lat, lng: g.lng, color: teamOf(g.teamId).color, label: tag(g), showLabel: true }));
  if (v.target && !v.target.country) markers.push({ lat: v.target.lat, lng: v.target.lng, kind: 'target', label: v.target.name, radii: [{ km: (v.target.radii || {}).outer || 100, pts: pv(v, 'r100', 2) }, { km: (v.target.radii || {}).inner || 50, pts: pv(v, 'r50', 3) }] });
  const map = h('div', { class: 'map-box beamer-map' }, mapView(v.map, { markers, area: v.target && v.target.country ? v.target.shape : null, fit: !!v.target }));
  let out;
  if (v.image) {
    // Bildfrage (z. B. Wahrzeichen): Bild links, Karte rechts.
    const img = h('img', { class: 'land-image', alt: '' });
    mediaUrl(v.image.id).then((url) => { if (url) img.src = url; });
    out = [v.question ? h('div', { class: 'q compact slim' }, v.question) : null, h('div', { class: 'land-split' }, h('div', { class: 'land-image-box' }, img), map)];
  } else {
    out = [h('div', { class: 'q compact' }, v.question), map];
  }
  if (!v.guesses) out.push(sub(`${v.submittedCount} von ${v.teamCount} Teams haben ihren Punkt gesetzt`, { marginTop: '2vh' }));
  if (v.target) {
    const w = v.winners.map((id) => teamOf(id).name).join(', ');
    const aw = v.awards || {};
    const pointText = () => {
      const ids = Object.keys(aw).sort((a, b) => aw[b] - aw[a]);
      if (!ids.length) return '';
      const outer = (v.target.radii && v.target.radii.outer) || 100;
      const near = (v.guesses || []).every((g) => !ids.includes(g.teamId) || g.km <= outer);
      return near ? ` – ${ids.map((id) => `${teamOf(id).name} +${aw[id]}`).join(' · ')}` : ` – keiner im ${outer}-km-Radius, am nächsten: ${ids.map((id) => `${teamOf(id).name} +${aw[id]}`).join(' · ')}`;
    };
    out.push(h('div', { class: 'solution' }, v.target.country
      ? `🗺 ${v.target.name}${w ? ` – im Land: ${w}` : ' – kein Team im Land'}`
      : `📍 ${v.target.name}${pointText()}`));
  } else if (v.mode === 'country' && !v.guesses) {
    out.push(sub('Gesucht ist ein ganzes Land – jedes Team, das darin landet, bekommt einen Punkt.', { marginTop: '1vh' }));
  }
  return out;
}

// ---------- 4 ----------
function kassenschlager(v, teamOf) {
  if (v.converted) {
    return [h('div', { class: 'mega', style: { fontSize: 'clamp(2rem,5vw,5rem)' } }, 'Kasse gemacht!'),
      h('ol', { class: 'rank' }, Object.entries(v.converted).sort((a, b) => b[1].points - a[1].points).map(([id, c]) => h('li', { '--team': teamOf(id).color },
        h('span', {}, '💰'), h('span', {}, teamOf(id).name), h('span', { class: 'pts' }, `${c.money} $ → ${c.points}`))))];
  }
  if (v.waiting) return [h('div', { class: 'mega', style: { fontSize: 'clamp(2rem,5vw,5rem)' } }, 'Das ist ein echter Kassenschlager'), sub('Jedes Team startet mit 20 $', { marginTop: '3vh' })];
  // Platz sparen: die Lösung steht bei der Auflösung direkt in der Kopfzeile.
  const out = [v.finished
    ? h('div', { class: 'q compact slim ks-head' }, '🎬 Der Film war: ', h('b', { class: 'ks-title' }, v.title))
    : h('div', { class: 'q compact slim' }, `🎬 Welcher Film ist gesucht? · Film ${v.movieIndex + 1} von ${v.movieCount}`)];
  if (v.paywall) {
    // Die Hinweis-Wand: während des Ratens verdeckt (nur Name und Preis),
    // bei der Auflösung Kachel für Kachel aufgedeckt – mit Käufern und ✓ beim gelösten Hinweis.
    out.push(ksWall(v.paywall.map((x) => {
      const solved = x.solvedBy || [];
      return {
        label: x.label, price: x.price, text: x.text, photo: x.photo, open: !!v.finished, solved: solved.length > 0,
        by: (x.boughtBy || []).map((id) => h('span', { class: `dm-name${solved.includes(id) ? ' solved' : ''}`, '--team': teamOf(id).color }, solved.includes(id) ? `✓ ${teamOf(id).name}` : teamOf(id).name)),
      };
    }), { reveal: !!v.finished, layout: v.layout, cls: `beamer-wall${v.finished ? ' done' : ''}` }));
    // Bilanz des Films: ausgegeben, verdient, Guthaben jetzt.
    if (v.money) out.push(h('div', { class: 'ks-money', style: { animationDelay: `${0.6 + v.paywall.length * 0.22}s` } }, v.money.map((x) => h('div', { class: 'ks-money-team', '--team': teamOf(x.teamId).color },
      h('b', { class: 'nm' }, teamOf(x.teamId).name),
      h('span', { class: 'out' }, `−${x.spent} $`), h('span', { class: `in${x.earned ? '' : ' zero'}` }, `+${x.earned} $`),
      h('span', { class: 'sum' }, `${x.total} $`)))),
      h('div', { class: 'ks-money-legend' }, h('span', { class: 'out' }, '− ausgegeben'), h('span', { class: 'in' }, '+ verdient'), h('span', { class: 'sum' }, 'Guthaben jetzt')));
  }
  if (v.status) {
    // Alle Teams gleichzeitig: wer noch kauft/schreibt, wer fertig ist.
    const LBL = { buy: '💸 kauft', answer: '✍ schreibt', done: '✓ fertig' };
    out.push(h('div', { class: 'ks-status' }, h('span', { class: 'ks-cycle' }, `Durchgang ${v.cycle} von ${v.maxCycles}`), v.status.map((x) =>
      h('div', { class: `ks-st ${x.phase}`, '--team': teamOf(x.teamId).color }, h('span', {}, teamOf(x.teamId).name), h('b', {}, LBL[x.phase])))));
  }
  return out;
}

// ---------- 5 ----------
function trumpf5(v, teamOf) {
  if (v.waiting) return [h('div', { class: 'mega', style: { fontSize: 'clamp(2.4rem,6vw,6rem)' } }, '5 ist Trümpf')];
  // Kompakt: alles muss auf einen Beamer-Bildschirm passen. Noch verdeckte
  // Hinweise stehen als Platzhalter da, damit nichts springt.
  const slots = Array.from({ length: 5 }, (_, i) => {
    const text = v.hints[i];
    const value = v.values ? v.values[i] : 5 - i;
    // Nach der Auflösung nachträglich aufgedeckte Hinweise: eigene Optik, nacheinander eingeblendet.
    const late = v.resolved && text !== undefined && i >= (v.shown ?? 5);
    return h('li', { class: text === undefined ? 'empty' : late ? 'late' : '', style: late ? { animationDelay: `${0.5 + (i - v.shown) * 0.45}s` } : null },
      h('span', { class: 'pv', 'aria-label': `${value} ${value === 1 ? 'Punkt' : 'Punkte'}` }, String(value)),
      h('span', { class: 'tx' }, text === undefined ? '' : text));
  });
  const foot = [];
  if (!v.resolved && v.hints.length) foot.push(h('span', { class: 't5-value' }, `Jetzt noch ${pts(v.value)}`));
  const buzz = buzzRow(v, teamOf, v.buzzOrder, v.answering);
  return [h('div', { class: 't5' },
    h('div', { class: 't5-cat' }, h('small', {}, 'Kategorie'), v.category),
    h('ol', { class: 'hints' }, slots),
    foot.length || buzz ? h('div', { class: 't5-foot' }, ...foot, buzz) : null,
    v.term ? h('div', { class: 'solution' }, `${v.term}${v.winner ? ` – ${teamOf(v.winner).name}` : ''}`) : null)];
}

// ---------- 6 ----------
// Bild aus der Mediathek laden (Beamer).
function mediaImg(m, cls) {
  const im = h('img', { class: cls, alt: '' });
  mediaUrl(m.id).then((u) => { if (u) im.src = u; });
  return im;
}

function musik(v, teamOf) {
  const c = v.current;
  const board = h('div', { class: 'jeopardy' }, v.board.map((cat, i) => h('div', { class: 'col' },
    h('div', { class: 'cat' }, cat.name || `Kategorie ${i + 1}`),
    cat.fields.map((f) => h('div', { class: `cell ${f.played ? 'played' : ''}${f.current ? ' current' : ''}`, style: f.winner ? { borderColor: teamOf(f.winner).color, color: teamOf(f.winner).color } : null }, f.played ? (f.winner ? teamOf(f.winner).name : '–') : String(f.value))))));
  if (!c || (c.resolved && !c.answer)) return [board, v.picker ? sub(`${teamOf(v.picker).name} wählt ein Feld`, { marginTop: '2vh' }) : null];
  // Feld gewählt, Frage noch nicht freigegeben: Spielbrett mit dem gewählten Feld zeigen.
  if (!c.started && !c.resolved) {
    return [board, h('div', { class: 'mus-picked' }, c.pickedBy ? h('b', { style: { color: teamOf(c.pickedBy).color } }, teamOf(c.pickedBy).name) : null,
      c.pickedBy ? ' wählt ' : 'Gewählt: ', h('b', {}, c.category || 'Kategorie'), ` für ${pts(c.value)}`)];
  }
  const out = [sub(`${c.category} · ${pts(c.value)}${c.mashup ? ' · beide Songtitel nennen!' : ''}`)];
  out.push(h('div', { class: 'q' }, c.task || (c.kind === 'sound' ? (c.started ? '🎵 Hört genau hin …' : '🎵') : '')));
  if (c.image && !c.resolved) out.push(mediaImg(c.image, 'musik-img'));
  out.push(buzzRow(v, teamOf, c.buzzOrder, c.answering));
  if (c.resolved) out.push(h('div', { class: 'solution' }, `${c.answer}${c.winner ? ` – ${teamOf(c.winner).name}` : ''}`));
  return out;
}

// ---------- 7 ----------
// Im Stil einer klassischen Millionen-Quizshow: blaue Bühne, Joker links, Leiter mit
// Punkten rechts, Frage und Antworten in sechseckigen Leisten.
const PHONE_ICON = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M33 6c-2 0-3 1-4 3l-2 6c-.5 2 0 3 1.5 4l2.5 2c-2 5-6 9-11 11l-2-2.5c-1-1.5-2-2-4-1.5l-6 2c-2 1-3 2-3 4 0 5 5 9 11 9C30 43 43 30 43 16c0-6-4-10-10-10z" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/><path d="M6 14l4 4-4 4 4 4-4 4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function hexBar(cls, ...children) {
  return h('div', { class: `wwm-line ${cls}` }, h('div', { class: 'wwm-hex' }, h('div', { class: 'wwm-hex-in' }, ...children)));
}

function jauch(v, teamOf, s) {
  const title = s ? s.game.title : 'Ein Hauch von Günther Jauch';
  const top = null;
  const ladder = h('div', { class: 'wwm-ladder' }, v.ladder.map((p, i) => ({ p, i })).reverse().map(({ p, i }) =>
    h('div', { class: `wwm-step${i === v.qIndex ? ' current' : ''}${i === (v.safeIndex ?? 3) || i === v.ladder.length - 1 ? ' safe' : ''}${v.qIndex !== undefined && i < v.qIndex ? ' done' : ''}` },
      h('span', { class: 'n' }, String(i + 1)), h('span', { class: 'dotsep' }, '◆'), h('span', { class: 'p' }, `${p} P`))));
  if (v.waiting) {
    return [h('div', { class: 'wwm' }, top,
      h('div', { class: 'wwm-mid' }, h('div'), h('div', { class: 'wwm-ring idle' }, h('b', {}, '?')), ladder),
      hexBar('wwm-q', title))];
  }
  const jokers = v.jokers || { fifty: [], phone: [] };
  const live = !v.revealed && v.phoneRunning ? 'phone' : null;
  // Joker dieser Frage: sofort sichtbar, welches Team welchen Joker genommen hat.
  const roundJ = v.roundJokers || [];
  const whoNow = (kind) => roundJ.filter((j) => j.kind === kind).map((j) => teamOf(j.teamId));
  const jokerBtn = (kind, content) => {
    const used = jokers[kind] || [];
    const allUsed = v.teams ? v.teams.filter((t) => t.status === 'active').every((t) => used.includes(t.teamId)) && used.length > 0 : false;
    const now = whoNow(kind).length > 0 || live === kind;
    const btn = h('div', { class: `wwm-joker${now ? ' now' : ''}${allUsed ? ' gone' : ''}`, title: kind === 'fifty' ? '50:50-Joker' : 'Telefonjoker' });
    if (typeof content === 'string' && content.startsWith('<svg')) btn.innerHTML = content; else btn.append(content);
    return h('div', { class: 'wwm-joker-wrap' }, btn,
      used.length ? h('div', { class: 'wwm-joker-teams' }, used.map((id) => dot(teamOf(id)))) : null,
      whoNow(kind).length ? h('div', { class: 'wwm-joker-who' }, whoNow(kind).map((t, i) => h('span', { style: { color: t.color, display: 'block' } }, t.name)), live === kind ? h('em', {}, 'telefoniert …') : null) : null);
  };
  const ring = v.revealed
    ? h('div', { class: 'wwm-ring done' }, h('b', {}, v.correct), h('small', {}, 'richtig'))
    : h('div', { class: 'wwm-ring' }, h('b', {}, `${v.lockedCount}/${v.activeCount}`), h('small', {}, 'gesperrt'));
  const marks = {};
  for (const a of v.answers) (marks[a.choice] ||= []).push(dot(teamOf(a.teamId)));
  const opt = (l) => hexBar(`wwm-a${v.correct === l ? ' correct' : ''}${v.correct && v.correct !== l ? ' dim' : ''}`,
    h('span', { class: 'wwm-diamond' }, '◆'), h('b', {}, `${l}:`), h('span', { class: 'grow' }, v.options[l]), h('span', { class: 'marks' }, ...(marks[l] || [])));
  const out = [top,
    h('div', { class: 'wwm-mid' },
      h('div', { class: 'wwm-jokers' }, jokerBtn('fifty', h('b', {}, '50:50')), jokerBtn('phone', PHONE_ICON)),
      h('div', { class: 'wwm-center' }, ring, h('div', { class: 'wwm-value' }, `${v.ladder[v.qIndex]} P`)),
      ladder),
    hexBar('wwm-q', v.question),
    h('div', { class: 'wwm-answers' }, opt('A'), opt('B'), opt('C'), opt('D'))];
  if (!v.revealed && (v.quitNow || []).length) {
    out.push(h('div', { class: 'wwm-teams' }, v.quitNow.map((id) => chip(teamOf(id), '', ' · steigt aus und sichert'))));
  }
  if (v.revealed && v.teams) {
    const label = { active: 'im Spiel', quit: 'ausgestiegen', out: 'raus', done: 'geschafft' };
    out.push(h('div', { class: 'wwm-teams' }, v.teams.map((t) => chip(teamOf(t.teamId), t.status === 'out' ? 'wrong' : '', ` · ${label[t.status]} · ${t.secured} P`))));
  }
  return [h('div', { class: `wwm${v.revealed ? ' revealed' : ''}` }, ...out)];
}

// ---------- 8 ----------
// Animierter Münzwurf: Vorder- und Rückseite mit Name und Farbe der Teams, landet auf dem Gewinner.
function nerdCoin(coin, teamOf) {
  const w = coin.winner;
  const other = coin.teams.find((id) => id !== w) || w;
  const face = (id, cls) => { const t = teamOf(id); return h('div', { class: `coin-face ${cls}`, '--c': t.color }, h('span', {}, t.name)); };
  return h('div', { class: 'nerd-coin-wrap' },
    h('div', { class: 'nerd-coin' }, face(w, 'front'), face(other, 'back')),
    h('div', { class: 'nerd-coin-result' }, `${teamOf(w).name} beginnt!`));
}

function nerd(v, teamOf) {
  if (v.waiting) return [h('div', { class: 'mega', style: { fontSize: 'clamp(2.4rem,6vw,6rem)' } }, 'Wer nix werd, werd Nerd')];
  const out = [v.finale ? sub('★ Die große Finalkategorie ★') : null, h('div', { class: `q ${v.finale ? 'finale' : ''}` }, v.category),
    v.possible ? h('div', { class: 'nerd-possible' }, 'maximal ', h('b', {}, String(v.possible)), ` richtige ${v.possible === 1 ? 'Antwort' : 'Antworten'} möglich`) : null];
  if (v.phase === 'bidding') {
    out.push(sub(`${v.bidCount} von ${v.teamCount} geheimen Geboten abgegeben`, { marginTop: '3vh' }));
    return out;
  }
  out.push(h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '2vh' } }, v.bids.map((b, i) => chip(teamOf(b.teamId), v.attempt?.teamId === b.teamId && !v.attempt.done ? 'answering' : '', h('b', { style: { marginLeft: '.5em', animation: `pop .4s ${i * 0.2}s both` } }, b.bid)))));
  if (v.phase === 'choose' && v.coin) out.push(nerdCoin(v.coin, teamOf));
  else if (v.phase === 'choose') out.push(sub(v.choose && v.choose.which === 'first' ? `Gleichstand! ${v.choose.teamIds.map((id) => teamOf(id).name).join(' und ')} wählen: Starten oder Nachziehen?` : 'Gleichstand! Die Moderation entscheidet.', { marginTop: '3vh' }));
  const a = v.attempt;
  if (a) {
    const t = teamOf(a.teamId);
    out.push(h('div', { class: 'nerd-score' },
      h('span', { style: { color: t.color } }, t.name),
      h('span', { class: 'big-num' }, `${a.correct} / ${a.target}`),
      h('span', { class: 'errors' }, Array.from({ length: a.maxErrors }, (_, i) => h('span', { class: i < a.errors ? 'x on' : 'x' }, '✗')))));
    if (a.which === 'second' && a.kept) out.push(sub(`${a.kept} richtige ${a.kept === 1 ? 'Antwort bleibt' : 'Antworten bleiben'} stehen – ${t.name} füllt auf`, { marginTop: '1vh' }));
    if (a.named.length) out.push(h('div', { class: 'named' }, a.named.map((n, i) => h('span', { class: `chip${i < (a.kept || 0) ? ' kept' : ''}` }, n))));
  }
  for (const r of v.results) {
    out.push(h('div', { class: 'solution' }, `${teamOf(r.teamId).name}: ${r.success ? 'geschafft' : 'gescheitert'} (${r.points > 0 ? '+' : ''}${r.points})`));
  }
  return out;
}
