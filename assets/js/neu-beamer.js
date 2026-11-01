// Beamer: Folien der sieben neuen Module – im Look der übrigen Spielfolien
// (graue Boxen, Teamfarben als Akzente). Zeigt nur freigegebene Inhalte.

import { h, mediaUrl } from './client.js';

// Punktwerte aus dem Editor (über den Server), sonst Standard.
const pv = (g, k, d = 1) => (g && g.scoring && typeof g.scoring[k] === 'number' ? g.scoring[k] : d);
const plus = (n) => `${n >= 0 ? '+' : '−'}${Math.abs(n)}`;


const pts = (n) => `${n} ${Math.abs(n) === 1 ? 'Punkt' : 'Punkte'}`;
const sub = (text, style = {}) => h('div', { class: 'sub', style: { marginTop: 0, ...style } }, text);
const chip = (t, extra = '', ...rest) => h('span', { class: `chip team-chip ${extra}`, '--chip': t.color }, t.name, ...rest);
const banner = (text, cls = '') => h('div', { class: `q ${cls}` }, text);
const waitTitle = (t, small) => [h('div', { class: 'mega', style: { fontSize: 'clamp(2rem,5.5vw,5.5rem)' } }, t), small ? sub(small, { marginTop: '2vh' }) : null];
const img = (m, cls) => { const el = h('img', { class: cls, alt: '' }); if (m) mediaUrl(m.id).then((u) => { if (u) el.src = u; }); return el; };
const fmtNum = (n) => (n === null || n === undefined ? '–' : Number(n).toLocaleString('de-DE'));
const row = (...c) => h('div', { class: 'row', style: { justifyContent: 'center', gap: '1vw', marginTop: '2vh', flexWrap: 'wrap' } }, ...c);

// Statusleiste: alle Teams als graue Kästen, wer abgegeben hat, leuchtet in Teamfarbe.
function teamStatus(ids, done, teamOf, label = 'abgegeben') {
  if (!ids || !ids.length) return null;
  return h('div', { class: 'nb-status' }, ids.map((id, i) => {
    const t = teamOf(id);
    const ok = done.includes(id);
    return h('div', { class: `nb-st${ok ? ' done' : ''}`, '--team': t.color, style: { animationDelay: `${0.1 * i}s` } },
      h('span', { class: 'nm' }, t.name), h('b', { class: 'ic' }, ok ? '✓' : '…'), h('small', {}, ok ? label : 'überlegt noch'));
  }));
}

// ---------- Blamieren oder Sortieren ----------
function sortieren(v, teamOf) {
  if (v.waiting) return waitTitle('Blamieren oder Sortieren', 'Fünf Karten in die richtige Reihenfolge bringen – jeder richtige Platz zählt.');
  const card = (c, i, extra = '', label = null) => h('div', { class: `nb-sort-card ${extra}`, style: { animationDelay: `${(extra.includes('solved') ? 0.45 : 0.12) * i}s` } },
    label, c.image ? img(c.image, 'nb-sort-img') : null, c.label ? h('span', { class: 'nm' }, c.label) : null, c.info ? h('span', { class: 'info' }, c.info) : null);
  if (!v.evaluated) {
    return [banner(v.category, 'compact slim'),
      h('div', { class: 'nb-sort-row open' }, v.cards.map((c, i) => card(c, i, 'enter', h('b', { class: 'qm' }, '?')))),
      teamStatus(v.teamIds, v.submitted || [], teamOf, 'sortiert') || sub(`${v.submittedCount} von ${v.teamCount} Teams haben sortiert`, { marginTop: '3vh' })];
  }
  const base = 0.45 * v.solution.length + 0.4;
  return [banner(v.category, 'compact slim'),
    h('div', { class: 'nb-sort-row solved' }, v.solution.map((c, i) => card(c, i, 'solved', h('b', { class: 'pos' }, String(i + 1))))),
    h('div', { class: 'nb-sort-results' }, v.results.sort((a, b) => b.points - a.points).map((r, n) => h('div', { class: `nb-sort-res${r.points === 5 ? ' perfect' : ''}`, '--team': teamOf(r.teamId).color, style: { animationDelay: `${base + 0.15 * n}s` } },
      h('span', { class: 'nm' }, teamOf(r.teamId).name),
      h('span', { class: 'marks' }, r.order.map((k, pos) => h('i', { class: k === pos ? 'ok' : 'bad', style: { animationDelay: `${base + 0.15 * n + 0.08 * pos}s` } }, k === pos ? '✓' : '✗'))),
      h('b', { class: 'p' }, plus(r.points)))))];
}

// ---------- Riskier die Gier ----------
// Gier-Punkte als Lebensenergie wie im Videospiel: Nach der Auswertung schrumpft
// der Balken (weißer „Schaden“ läuft hinterher), Schadenszahl fliegt hoch, der
// Balken wackelt und wechselt von Grün über Gelb und Orange zu Rot; bei 0 kommt „K.O.“.
const hpPct = (val, start) => Math.max(0, Math.min(100, (val / (start || 100)) * 100));
// Vier Stufen in 25er-Schritten: über 75 grün, 51–75 gelb, 26–50 orange, bis 25 rot.
const hpColor = (pct) => (pct > 75 ? 'var(--ok, #2bd96b)' : pct > 50 ? '#ffd23f' : pct > 25 ? '#ff8a1f' : 'var(--bad, #ff4a4a)');
export function hpBar({ name = null, color = '#888', before, after, start = 100, diff = null, out = false, delay = 0, points = null, animate = true }) {
  const from = hpPct(before, start), to = hpPct(after, start);
  const num = h('b', { class: 'hp-num' }, fmtNum(animate ? before : after));
  // Farbe wechselt mit dem Treffer (Grün → Gelb → Orange → Rot).
  const fill = h('i', { class: 'hp-fill', style: { backgroundColor: animate ? hpColor(from) : hpColor(to) } });
  const bar = h('div', { class: `hp${animate && diff ? ' hit' : ''}${out ? ' ko' : ''}`, '--team': color, '--from': `${from}%`, '--to': `${to}%`, '--hpc': hpColor(to), '--hpc0': hpColor(from), '--d': `${delay}s` },
    name ? h('span', { class: 'hp-name' }, name) : null,
    h('span', { class: 'hp-track' },
      h('i', { class: 'hp-ghost' }), fill, h('i', { class: 'hp-ticks' }),
      animate && diff ? h('em', { class: 'hp-dmg' }, `−${fmtNum(diff)}`) : null),
    num,
    out ? h('span', { class: 'hp-ko' }, 'K.O.') : null,
    points !== null ? h('span', { class: 'hp-pts' }, `+${points}`) : null);
  if (animate && before !== after && !document.documentElement.classList.contains('reduced-motion')) {
    setTimeout(() => {
      fill.style.backgroundColor = hpColor(to);
      const t0 = performance.now(), dur = 1100;
      const step = (t) => { const k = Math.min(1, (t - t0) / dur); num.textContent = fmtNum(Math.round((before + (after - before) * (1 - (1 - k) ** 3)) * 100) / 100); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }, (delay + 0.25) * 1000);
  } else num.textContent = fmtNum(after);
  return bar;
}

function gier(v, teamOf) {
  const placed = Object.fromEntries((v.placed || []).map((p) => [p.teamId, p]));
  const bars = h('div', { class: 'nb-gier-bars' }, v.teams.map((t, i) => {
    const team = teamOf(t.teamId);
    const res = v.results ? v.results.find((x) => x.teamId === t.teamId) : null;
    return hpBar({ name: team.name, color: team.color, before: res ? res.before : t.balance, after: t.balance, start: v.start, diff: res ? res.diff : null,
      out: t.out, delay: 0.8 + i * 0.7, points: placed[t.teamId] ? placed[t.teamId].points : null, animate: !!res });
  }));
  if (v.waiting) return [...waitTitle('Riskier die Gier', 'Jedes Team startet mit 100 Lebenspunkten – jede Abweichung kostet Energie.'), bars];
  const out = [banner(v.question, 'compact slim')];
  if (v.evaluated) out.push(h('div', { class: 'solution', style: { marginTop: 0 } }, `Lösung: ${fmtNum(v.solution)} ${v.unit}`.trim()));
  else if (v.open) {
    const grace = v.graceEndsAt && Date.now() > v.endsAt;
    out.push(h('div', { class: `nb-gier-time${grace ? ' grace' : ''}` }, grace ? 'Nachfrist ' : '', h('b', { 'data-deadline': String(grace ? v.graceEndsAt : v.endsAt) }, '')),
      sub(`${v.answeredCount} Teams haben geschätzt`));
  }
  out.push(bars);
  // Spiel entschieden: Endstand erscheint, nachdem alle Balken gelaufen sind.
  if (v.standings) {
    const delay = 1.2 + v.teams.length * 0.7 + 1.4;
    out.push(h('div', { class: 'nb-gier-final', style: { animationDelay: `${delay}s` } }, h('div', { class: 'nb-gier-final-title' }, 'Endstand'),
      v.standings.map((s, k) => h('div', { class: 'nb-gier-place', '--team': teamOf(s.teamId).color, style: { animationDelay: `${delay + 0.3 + k * 0.25}s` } },
        h('b', { class: 'pl' }, `${s.place}.`), h('span', { class: 'nm' }, teamOf(s.teamId).name), h('b', { class: 'p' }, `+${s.points}`)))));
  }
  return out;
}

// ---------- Quizzen, wo man steht ----------
function top100(v, teamOf) {
  if (v.waiting) return waitTitle('Quizzen, wo man steht', 'Top-100-Listen: je weiter hinten euer Eintrag steht, desto mehr Punkte.');
  const src = [v.source && `Quelle: ${v.source}`, v.period, v.asOf].filter(Boolean).join(' · ');
  // Punkteleiter: je weiter hinten in der Liste, desto höher die Stufe.
  const scale = [['1–20', 1], ['21–40', 2], ['41–60', 3], ['61–80', 4], ['81–100', 5]].map(([r, d], i) => [r, v.scale ? v.scale[i] : d]);
  const head = [banner(v.category, 'compact slim'), src ? sub(src, { fontSize: '2vh', opacity: 0.8 }) : null];
  if (!v.evaluated) {
    const ladder = h('div', { class: 'nb-t100-ladder' }, scale.map(([r, p], i) => h('div', { class: 'step', '--h': `${50 + i * 12.5}%`, style: { animationDelay: `${0.12 * i}s` } },
      h('b', {}, plus(p)), h('small', {}, `Rang ${r}`))));
    return [...head, ladder, teamStatus(v.teamIds, v.submitted || [], teamOf) || sub(`${v.submittedCount} von ${v.teamCount} Teams haben abgegeben`, { marginTop: '3vh' })];
  }
  // Auflösung: jede Antwort steht unter der Stufe, in die ihr Rang fällt; eigene Spalte für „nicht in der Liste“.
  const cols = [...scale.map(([r, p], i) => ({ head: h('div', { class: 'step', '--h': `${50 + i * 12.5}%` }, h('b', {}, plus(p)), h('small', {}, `Rang ${r}`)), items: [] })),
    { head: h('div', { class: 'step miss', '--h': '50%' }, h('b', {}, '✗'), h('small', {}, 'nicht in der Liste')), items: [] }];
  for (const r of v.results) cols[r.rank ? Math.min(4, Math.ceil(r.rank / 20) - 1) : 5].items.push(r);
  let n = 0;
  const board = h('div', { class: 'nb-t100-board' }, cols.map((c, ci) => h('div', { class: `col${ci === 5 ? ' miss' : ''}` },
    h('div', { class: 'top' }, c.head),
    h('div', { class: 'ans-list' }, c.items.sort((x, y) => (x.rank || 0) - (y.rank || 0)).map((r) => {
      const t = teamOf(r.teamId);
      return h('div', { class: 'acard', '--team': t.color, style: { animationDelay: `${0.25 * n++ + 0.3}s` } },
        h('span', { class: 'nm' }, t.name), h('b', { class: 'tx' }, r.entry || r.text),
        r.entry && r.entry.toLowerCase() !== String(r.text).toLowerCase() ? h('small', { class: 'orig' }, `„${r.text}“`) : null,
        h('span', { class: 'rk' }, r.rank ? `Rang ${r.rank}` : `„${r.text}“`), h('b', { class: 'p' }, plus(r.points)));
    })))));
  return [...head, board];
}

// ---------- 30 Seconds to Spaß ----------
function sekunden(v, teamOf) {
  if (v.waiting) return waitTitle('30 Seconds to Spaß', `${v.seconds || 30} Sekunden – ohne Uhr. Wer zu früh oder zu spät stoppt, verliert alles.`);
  const tolTxt = `± ${String(v.tol).replace('.', ',')} s`;
  const strip = h('div', { class: 'sek-order' }, v.order.map((o) => {
    const t = teamOf(o.teamId);
    return h('div', { class: `sek-o ${o.state}${o.teamId === v.turn ? ' turn' : ''}${o.ok === false ? ' fail' : ''}`, '--team': t.color },
      h('span', { class: 'nm' }, t.name), h('b', {}, o.points === null ? (o.teamId === v.turn ? '▶' : '·') : plus(o.points)));
  }));
  const head = h('div', { class: 'sek-head' }, h('span', {}, `Durchgang ${v.index + 1}`), h('b', {}, `Ziel ${v.seconds} s`), h('span', {}, `Toleranz ${tolTxt}`));
  if (v.done) return [head, h('div', { class: 'solution', style: { marginTop: '3vh' } }, `Durchgang ${v.index + 1} beendet`), strip];
  const t = teamOf(v.turn);
  if (v.phase === 'ready') {
    return [head, h('div', { class: 'sek-ready', '--team': t.color }, h('small', {}, 'Jetzt dran'), h('b', {}, t.name), h('span', {}, 'startet mit dem Buzzer …')), strip];
  }
  const marks = h('div', { class: 'sek-marks' }, v.marks.map((m, i) => h('i', { class: m ? 'ok' : 'bad', style: { animationDelay: '0s' } }, m ? '✓' : '✗')), h('b', {}, `${v.marks.filter(Boolean).length}`));
  if (v.phase === 'running') {
    return [head, h('div', { class: 'sek-run', '--team': t.color }, h('span', { class: 'who' }, t.name), h('span', { class: 'clock' }, '⏱ ?? s')),
      v.question ? h('div', { class: 'sek-qbox', key: v.question.n }, h('small', {}, `Frage ${v.question.n}${v.question.topic ? ` · ${v.question.topic}` : ''}`), h('b', {}, v.question.text))
        : h('div', { class: 'sek-qbox' }, h('b', {}, 'Keine Fragen mehr – jetzt stoppen!')),
      marks, strip];
  }
  // Gestoppt: Zeit enthüllen, Fenster zeigen, Punkte.
  const res = v.result;
  const span = Math.max(v.tol * 3, 8);
  const pos = (x) => `${Math.max(0, Math.min(100, ((x - (v.seconds - span)) / (2 * span)) * 100))}%`;
  const scale = h('div', { class: 'sek-scale' },
    h('div', { class: 'win', style: { left: pos(v.seconds - v.tol), width: `calc(${pos(v.seconds + v.tol)} - ${pos(v.seconds - v.tol)})` } }),
    h('div', { class: 'tgt', style: { left: pos(v.seconds) } }, h('span', {}, `${v.seconds} s`)),
    res.late ? null : h('div', { class: `pin ${res.ok ? 'ok' : 'bad'}`, '--x': pos(res.elapsed) }, h('span', {}, `${res.elapsed.toFixed(1).replace('.', ',')} s`)));
  return [head,
    h('div', { class: `sek-res ${res.ok ? 'ok' : 'bad'}`, '--team': t.color },
      h('span', { class: 'who' }, t.name),
      h('b', { class: 'big' }, res.late ? 'NICHT GESTOPPT' : `${res.elapsed.toFixed(1).replace('.', ',')} s`),
      h('span', { class: 'verdict' }, res.ok ? `Im Zeitfenster! ${res.correct} richtig = ${plus(res.points)}` : `${res.late ? '' : 'Außerhalb des Zeitfensters – '}${res.correct} richtig, aber 0 Punkte`)),
    scale, marks, strip];
}

// ---------- Wir sind ein Telepa-Team ----------
// Auflösung in drei Spalten: „Allein richtig“ (Punkte), „Doppelt“ (gleiche Antworten
// gruppiert, durchgestrichen) und „Falsch“.
function allein(v, teamOf) {
  if (v.waiting) return waitTitle('Wir sind ein Telepa-Team', 'Nennt eine richtige Antwort – aber nur, wenn sonst keiner drauf kommt!');
  const head = [banner(v.category, 'compact slim'), h('div', { class: 'nb-al-count' }, h('b', {}, String(v.total)), h('span', {}, 'richtige Antworten gibt es'))];
  if (!v.evaluated) return [...head, teamStatus(v.teamIds, v.submitted || [], teamOf)];
  let n = 0;
  const card = (r) => {
    const t = teamOf(r.teamId);
    return h('div', { class: `acard ${r.status}`, '--team': t.color, style: { animationDelay: `${0.25 * n++ + 0.3}s` } },
      h('span', { class: 'nm' }, t.name), h('b', { class: 'tx' }, r.entry || r.text),
      r.entry && r.entry.toLowerCase() !== String(r.text).toLowerCase() ? h('small', { class: 'orig' }, `„${r.text}“`) : null,
      h('b', { class: 'p' }, plus(r.points)));
  };
  const alone = v.results.filter((r) => r.status === 'alone');
  const groups = {};
  for (const r of v.results.filter((x) => x.status === 'double')) (groups[r.key] = groups[r.key] || []).push(r);
  const wrong = v.results.filter((r) => r.status === 'wrong');
  const col = (cls, icon, title, body) => h('div', { class: `nb-al-col ${cls}` }, h('div', { class: 'hd' }, h('b', {}, icon), h('span', {}, title)), h('div', { class: 'bd' }, body));
  const board = h('div', { class: 'nb-al-board' },
    col('alone', '★', 'Allein richtig', alone.length ? alone.map(card) : h('p', { class: 'none' }, 'niemand')),
    col('double', '👥', 'Doppelt – 0 Punkte', Object.values(groups).length ? Object.values(groups).map((g) => h('div', { class: 'grp' }, h('div', { class: 'gl' }, `${g[0].entry} · ${g.length}×`), g.map(card))) : h('p', { class: 'none' }, 'keine')),
    col('wrong', '✗', 'Falsch', wrong.length ? wrong.map(card) : h('p', { class: 'none' }, 'keine')));
  const out = [...head, board];
  // Lösungsliste: alle richtigen Antworten, genannte hervorgehoben.
  if (v.list) out.splice(1, 1, h('div', { class: 'nb-al-list' }, v.list.map((e, i) => h('span', { class: e.named ? (e.named > 1 ? 'dbl' : 'hit') : '', style: { animationDelay: `${0.05 * i}s` } }, e.name))));
  return out;
}

// ---------- Ich bin ein Star, lüg mich nicht an ----------
function star(v, teamOf) {
  if (v.waiting) return waitTitle('Ich bin ein Star, lüg mich nicht an', 'Acht Begriffe – einer davon ist gelogen.');
  const pos = (i) => { const a = (i / 8) * 2 * Math.PI - Math.PI / 2; return [50 + 40 * Math.cos(a), 50 + 40 * Math.sin(a)]; }; // im Uhrzeigersinn ab oben
  const spokes = h('div', { class: 'nb-star-spokes' });
  spokes.innerHTML = `<svg viewBox="0 0 155 100" preserveAspectRatio="none">${v.terms.map((_, i) => { const [x, y] = pos(i); return `<line x1="77.5" y1="50" x2="${x * 1.55}" y2="${y}" class="${v.resolved && i === v.wrong ? 'hot' : ''}"/>`; }).join('')}</svg>`;
  const ring = h('div', { class: `nb-star${v.resolved ? ' resolved' : ''}` }, spokes,
    h('div', { class: 'nb-star-center' }, v.centerImage ? img(v.centerImage, 'nb-star-img') : null, h('b', {}, v.center)),
    v.terms.map((t, i) => {
      const [x, y] = pos(i);
      return h('div', { class: `nb-star-term${v.resolved ? (i === v.wrong ? ' wrong' : ' right') : ''}`, style: { left: `${x}%`, top: `${y}%`, animationDelay: `${0.08 * i}s` } },
        h('small', { class: 'n' }, String(i + 1)), h('span', {}, t), v.resolved && i === v.wrong ? h('em', { class: 'stamp' }, 'GELOGEN!') : null);
    }));
  const order = v.buzzOrder.length ? h('div', { class: 'nb-buzzline' }, h('span', { class: 'lbl' }, '🔔 Buzzer'), v.buzzOrder.map((b, k) => {
    const t = teamOf(b.teamId);
    return h('div', { class: `nb-bz${b.correct === true ? ' ok' : b.correct === false ? ' bad' : ''}${v.winner === b.teamId ? ' win' : ''}`, '--team': t.color },
      h('b', { class: 'k' }, `${k + 1}.`), h('span', {}, t.name), b.pick !== undefined ? h('small', {}, `tippt ${b.pick + 1} ${b.correct ? '✓' : '✗'}`) : null);
  })) : (!v.resolved ? sub('Welcher Begriff ist gelogen? Wählen und buzzern!', { marginTop: '1vh' }) : null);
  return [ring, order, v.resolved ? h('div', { class: 'solution', style: { marginTop: '1.5vh' } }, v.winner ? `${teamOf(v.winner).name} ${plus(pv(v, 'correct'))}` : 'Kein Team lag richtig') : null];
}

// ---------- Remember the Timeline ----------
function timeline(v, teamOf) {
  if (v.waiting) return waitTitle('Remember the Timeline', 'Reihum einordnen – ein Fehler kostet alle Punkte dieses Durchgangs.');
  if (v.notStarted) return [banner(v.category, 'compact slim'), sub('Gleich wird das Startteam ausgelost …', { marginTop: '4vh' })];
  // Zeitstrahl im Mittelpunkt: links früher, rechts später; Karten abwechselnd über und unter der Linie.
  const n = v.line.length;
  const axis = h('div', { class: `nb-tl2${n > 8 ? ' dense' : ''}` },
    h('span', { class: 'end l' }, '◀ FRÜHER'), h('span', { class: 'end r' }, 'SPÄTER ▶'),
    h('div', { class: 'rail' }),
    h('div', { class: 'stops' }, v.line.map((e, i) => h('div', {
      class: `stop ${i % 2 ? 'down' : 'up'}${e.ref ? ' ref' : ''}${e.last ? (v.last.ok ? ' last ok' : ' last bad') : ''}`, style: { animationDelay: `${0.08 * i}s` } },
      h('div', { class: 'lbl' }, e.label), h('i', { class: 'stem' }), h('b', { class: 'yr' }, e.value)))));
  const teams = h('div', { class: 'nb-tl-teams small' }, v.teams.map((t) => {
    const tm = teamOf(t.teamId);
    return h('div', { class: `nb-tl-team ${t.state}${t.teamId === v.turn && !v.done ? ' turn' : ''}`, '--team': tm.color },
      h('span', { class: 'nm' }, tm.name), h('b', {}, String(t.points)), h('small', {}, t.state === 'out' ? 'raus ✗' : t.state === 'quit' ? 'ausgestiegen' : t.teamId === v.turn && !v.done ? 'am Zug' : ''));
  }));
  const info = v.done ? h('div', { class: 'solution', style: { marginTop: '1vh' } }, 'Durchgang beendet – Punkte gutgeschrieben')
    : h('div', { class: 'nb-tl-info' },
      v.last ? h('div', { class: `nb-tl-last ${v.last.ok ? 'ok' : 'bad'}`, '--team': teamOf(v.last.teamId).color }, `${teamOf(v.last.teamId).name}: „${v.last.label}“ `, h('b', {}, v.last.ok ? '✓ richtig' : '✗ falsch – Punkte weg')) : null,
      v.turn ? h('div', { class: 'nb-tl-turn', '--team': teamOf(v.turn).color }, h('small', {}, v.last ? 'Am Zug' : 'Ausgelost – es beginnt'), h('b', {}, teamOf(v.turn).name)) : null,
      h('div', { class: 'nb-tl-pool' }, h('b', {}, String(v.pool.length)), h('small', {}, v.pool.length === 1 ? 'Begriff übrig' : 'Begriffe übrig')));
  return [banner(v.category, 'compact slim'), axis, info, teams];
}

// ---------- Guck mal, wer da spricht ----------
function chat(v, teamOf) {
  if (v.waiting) return waitTitle('Guck mal, wer da spricht', 'Wer schreibt hier? Buzzern, sobald ihr es wisst.');
  const phone = h('div', { class: 'phone-chat' },
    h('div', { class: `pc-head${v.resolved ? ' known' : ''}` }, v.photo ? img(v.photo, 'pc-photo') : h('span', { class: 'pc-avatar' }, v.person ? v.person.slice(0, 1) : '?'),
      h('b', {}, v.person || 'Unbekannt')),
    h('div', { class: 'pc-body' }, v.messages.map((m, i) => h('div', { class: `pc-msg ${m.right ? 'right' : 'left'}${i === v.messages.length - 1 && !v.resolved ? ' new' : ''}` }, m.text))));
  const buzz = v.buzzOrder.length ? row(...v.buzzOrder.map((b) => chip(teamOf(b.teamId), `${b.teamId === v.answering ? 'answering' : ''} ${b.status === 'wrong' ? 'wrong' : ''}`, b.status === 'correct' ? ' ✓' : b.status === 'wrong' ? ' ✗' : ''))) : null;
  return [h('div', { class: 'nb-chat' }, phone, h('div', { class: 'nb-chat-side' }, h('div', { class: 'nb-chat-count' }, `${v.shown} / ${v.total}`), buzz,
    v.resolved ? h('div', { class: 'solution' }, v.winner ? `${teamOf(v.winner).name} ${plus(pv(v, 'correct'))}` : v.person) : null))];
}

// ---------- Host du das Zeug dafür? ----------
function hostdu(v, teamOf) {
  if (v.waiting) return waitTitle('Host du das Zeug dafür?', 'Erfindet Antworten, die andere Teams für richtig halten!');
  const out = [banner(v.question, 'compact slim')];
  if (v.phase === 'submit') return [...out, sub(`${v.submittedCount} von ${v.teamCount} Teams haben eingereicht`, { marginTop: '4vh' })];
  if (v.phase === 'review') return [...out, sub('Alle haben eingereicht – gleich geht die Abstimmung los …', { marginTop: '4vh' })];
  const revealed = v.phase === 'revealed';
  out.push(h('div', { class: 'nb-hd-opts' }, v.options.map((o) => h('div', { class: `nb-hd-opt${revealed ? (o.correct ? ' correct' : ' fake') : ''}` },
    h('b', { class: 'l' }, o.letter), h('span', { class: 'tx' }, o.text),
    revealed ? h('span', { class: 'meta' },
      o.correct ? h('em', {}, '✓ richtig') : o.by.length ? h('em', {}, 'erfunden von ', o.by.map((id) => teamOf(id).name).join(', ')) : null,
      o.chosenBy.length ? h('span', { class: 'votes' }, o.chosenBy.map((id) => h('i', { style: { background: teamOf(id).color }, title: teamOf(id).name }))) : null) : null))));
  if (!revealed) out.push(sub(`${v.votedCount} Teams haben gewählt`, { marginTop: '2vh' }));
  else out.push(row(...Object.entries(v.results).filter(([, r]) => r.regular + r.deceive > 0).map(([id, r]) => chip(teamOf(id), '', h('b', {}, ` +${r.regular + r.deceive}`)))));
  return out;
}

export const BEAMER_NEU = { sortieren, gier, top100, star, timeline, chat, hostdu, allein, sekunden };
