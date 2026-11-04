import { h, connect, run, store, toast, ask, showModal, localServer, uploadMedia, mediaUrl, setShowTitle, coinImg } from './client.js';
import { buildPlay } from './mod-play.js';
import { mapView, zoomState } from './map.js';
import { buildFinaleLive, buildFinaleEditor } from './mod-finale.js';

const token = store('quiz.modToken') || localServer?.demoToken;
if (!token) location.href = 'index.html';

let S = null; // letzter Zustand vom Server
// Ansicht: ?view=live (nur Moderation), ?view=editor (nur Editor), sonst beides.
const VIEW = new URLSearchParams(location.search).get('view');
const LIVE_TABS = ['live'];
const EDITOR_TABS = ['editor', 'library'];
const ALLOWED = VIEW === 'editor' ? EDITOR_TABS : VIEW === 'live' ? LIVE_TABS : [...LIVE_TABS, ...EDITOR_TABS];
const TAB_KEY = `quiz.modTab${VIEW ? `.${VIEW}` : ''}`;
let tab = store(TAB_KEY) === 'teams' ? 'editor' : ALLOWED.includes(store(TAB_KEY)) ? store(TAB_KEY) : ALLOWED[0];
let lastEditorTab = EDITOR_TABS.includes(tab) ? tab : 'editor';
if (VIEW === 'editor') {
  document.getElementById('main-tabs').classList.add('hidden');
  document.querySelector('.beamer-mini')?.remove(); // Beamer-Vorschau nur in der Moderation
}
if (VIEW === 'live') document.querySelector('#main-tabs [data-group="editor"]').remove();
const saveState = { dirty: false, saving: false, timer: null, pending: new Map() };
const deferred = new Set();

const conn = connect({
  hello: () => ({ role: 'moderator', token }),
  onState: (s) => {
    S = s;
    renderAll();
  },
  onAuthFailed: () => {
    store('quiz.modToken', null);
    location.href = 'index.html';
  },
});

document.getElementById('logout').onclick = async () => {
  await fetch('api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) }).catch(() => {});
  store('quiz.modToken', null);
  location.href = 'index.html';
};

for (const b of document.querySelectorAll('[role=tab]')) {
  b.onclick = () => {
    tab = b.dataset.group === 'editor' ? lastEditorTab : b.dataset.tab;
    if (EDITOR_TABS.includes(tab)) lastEditorTab = tab;
    store(TAB_KEY, tab);
    renderAll(true);
  };
}

// ---------- Rendering-Grundgerüst ----------

// „↶ Rückgängig“ oben in der Kopfzeile: macht die letzte Aktion der Moderation rückgängig.
// „Rückgängig“ sitzt in der Live-Regie direkt bei der Spielsteuerung (Auswertung der Fragen).
function renderUndo() {}
async function undoLast() {
  const u = S && S.undo;
  if (!u) return;
  const warn = u.teamSince ? ` Achtung: Seitdem haben Teams ${u.teamSince}× etwas abgegeben – das geht dabei ebenfalls verloren.` : '';
  if (await ask(`Letzten Schritt rückgängig machen?\n„${u.label}“${warn}`, { confirmLabel: 'Rückgängig machen' })) act('undo.last');
}
function undoButton() {
  const u = S.undo;
  return h('span', { class: 'undo-wrap' },
    h('button', { class: 'btn ghost', id: 'undo-btn', type: 'button', disabled: !u, title: u ? `Rückgängig: ${u.label}` : 'Nichts zum Rückgängigmachen', onclick: undoLast }, '↶ Rückgängig'),
    u ? h('small', { class: 'muted undo-label' }, `zuletzt: ${u.label}`) : null);
}

function renderAll(force = false) {
  if (!S) return;
  renderUndo();
  setShowTitle(document.getElementById('show-name'), S.project.name);
  const inEditor = EDITOR_TABS.includes(tab);
  for (const b of document.querySelectorAll('[role=tab]')) {
    b.setAttribute('aria-selected', String(b.dataset.group === 'editor' ? inEditor : b.dataset.tab === tab));
  }
  document.getElementById('editor-tabs').classList.toggle('hidden', !inEditor);
  for (const id of ['live', 'teams', 'editor', 'library', 'points']) document.getElementById(`tab-${id}`).classList.toggle('hidden', id !== tab);
  renderWarning();
  if (tab === 'live') return renderLive();
  const builders = { editor: buildEditor, library: buildLibrary };
  renderPanel(tab, builders[tab], force);
}

// Ein Panel nicht neu aufbauen, solange darin getippt wird; danach nachholen.
function renderPanel(id, build, force) {
  const panel = document.getElementById(`tab-${id}`);
  const active = document.activeElement;
  const typing = active && panel.contains(active) && /INPUT|TEXTAREA|SELECT/.test(active.tagName);
  if (!force && (typing || ((id === 'editor' || id === 'library') && saveState.dirty))) {
    if (!deferred.has(id)) {
      deferred.add(id);
      panel.addEventListener('focusout', () => setTimeout(() => {
        deferred.delete(id);
        if (!saveState.dirty) renderAll();
      }, 0), { once: true });
    }
    return;
  }
  const scroll = window.scrollY;
  panel.replaceChildren(...build().filter(Boolean));
  window.scrollTo(0, scroll);
}

function renderWarning() {
  const box = document.getElementById('warning');
  const w = S.live.warning;
  if (!w) return box.replaceChildren();
  if (w.kind === 'coinTie') {
    box.replaceChildren(h('div', { class: 'notice warn', role: 'alert' },
      h('b', {}, `Gleichstand um Münze ${w.position}: `),
      w.teamIds.map(teamName).join(', '), ` (je ${w.points} Punkte). Bitte eine Schätzfrage stellen und das Gewinnerteam unten bei „Münzen“ bestätigen.`));
  }
}

const teamName = (id) => S.project.teams.find((t) => t.id === id)?.name || '?';
const teamColor = (id) => S.project.teams.find((t) => t.id === id)?.color || '#888';
const dot = (color) => h('span', { class: 'dot', style: { background: color } });
const card = (title, ...body) => h('section', { class: 'card' }, h('h3', {}, title), ...body);
const act = (name, payload) => run(conn, name, payload);

// Countdowns (10-Sekunden-Fenster) live mitzählen.
setInterval(() => {
  for (const el of document.querySelectorAll('[data-deadline]')) el.textContent = `${Math.max(0, Math.ceil((Number(el.dataset.deadline) - Date.now()) / 1000))} s`;
}, 250);

async function confirmAct(message, name, payload) {
  if (await ask(message)) act(name, payload);
}

// ---------- Live-Regie ----------

// Die Beamer-Vorschau steht fest im HTML, damit sie bei Updates nicht neu lädt.
function renderLive() {
  const scroll = window.scrollY;
  document.getElementById('run-panel').replaceChildren(buildRun());
  const step = (S.rundown || [])[S.live.run ?? -1];
  const finaleOn = !S.live.activeGame && (S.live.finale || step?.kind === 'finale');
  document.getElementById('live-left').replaceChildren(finaleOn ? buildFinaleLive(finaleUi()) : buildGameControl());
  document.getElementById('live-bottom').replaceChildren(
    h('div', { class: 'live-restart' },
      h('button', { class: 'btn ghost bad-text', onclick: restartShow, title: 'Punkte und Münzen auf 0, alle Fragen unbeantwortet, zurück zur ersten Folie. Editor-Inhalte bleiben.' }, '⟲ Show neu starten …')));
  // Lautstärkeregler nicht unter dem Finger neu aufbauen.
  const bc = document.getElementById('beamer-controls');
  if (!(document.activeElement && document.activeElement.type === 'range' && bc.contains(document.activeElement))) bc.replaceChildren(...buildBeamerControls());
  document.getElementById('live-right').replaceChildren(buildTeamsLive(), buildCoins());
  window.scrollTo(0, scroll);
}

function finaleUi() {
  return { S, card, act, confirmAct, autosave, rerender: () => renderAll(true) };
}

// ---------- Showablauf wie eine Präsentation ----------

const RUN_ICON = { start: '★', video: '🎞', intro: '👥', pyramid: '▲', title: '🎬', game: '🎮', coin: '🪙', pause: '☕', ranking: '🏆', stageTitle: '🎬', hosts: '🎙', finaleTitle: '🎬', finale: '★', end: '🏁' };
const RUN_KIND_LABEL = { start: 'Startbild', video: 'Intro-Video', intro: 'Vorstellung der Teams', pyramid: 'Übersicht Kategorien', title: 'Spieltitel', game: 'Spiel spielen', coin: 'Münzvergabe', pause: 'Pause', ranking: 'Zwischenstand / Rangliste', stageTitle: 'Gewinnstufe – Spieltitel', hosts: 'Moderation am Pult', finaleTitle: 'Finale – Spieltitel', finale: 'Finale gegen die Moderation', end: 'Abschluss' };

// Symbol eines Schritts; die Münzvergabe zeigt die Münze der Show.
const runIcon = (kind) => (kind === 'coin' ? coinImg('run-coin') : RUN_ICON[kind]);

function runNext() { return act('run.next'); }

// Neustart: Punkte, Münzen, Antworten und Finale weg, zurück zur ersten Folie.
// Teams, Editor, Spieledatenbank, Ablauf und Medien bleiben erhalten.
// Generalprobe-Check: Inhalte aller Spiele prüfen und ob jede Mediendatei wirklich da ist.
async function mediaExists(id) {
  if (localServer) return !!(await mediaUrl(id).catch(() => null));
  try { return (await fetch(`media/${id}`, { method: 'HEAD', cache: 'no-store' })).ok; } catch { return false; }
}
async function runCheck() {
  const res = await act('check.show');
  if (!res || !res.data) return;
  const { issues, media } = res.data;
  const body = h('div', {}, h('p', { class: 'muted' }, `Prüfe ${media.length} Mediendateien …`));
  showModal('✅ Generalprobe-Check', body);
  const missing = [];
  await Promise.all(media.map(async (m) => { if (!(await mediaExists(m.id))) missing.push(m); }));
  const all = [...missing.map((m) => ({ level: 'fehlt', where: m.where, text: 'Datei fehlt im data-Ordner (neu hochladen)' })), ...issues];
  const errors = all.filter((x) => x.level === 'fehlt');
  const hints = all.filter((x) => x.level === 'hinweis');
  const list = (arr, cls) => h('ul', { class: 'check-list' }, arr.map((x) => h('li', { class: cls }, h('b', {}, x.text), h('small', {}, x.where))));
  body.replaceChildren(...[
    h('div', { class: 'check-sum' },
      h('span', { class: `badge ${errors.length ? 'bad' : 'ok'}` }, errors.length ? `${errors.length} × fehlt` : '✓ Nichts fehlt'),
      h('span', { class: 'badge' }, `${hints.length} Hinweise`),
      media.length ? h('span', { class: `badge ${missing.length ? 'bad' : 'ok'}` }, `${media.length - missing.length} von ${media.length} Mediendateien vorhanden`) : null),
    errors.length ? [h('p', { class: 'check-group' }, 'Sollte vor der Show behoben werden'), list(errors, 'fehlt')]
      : h('ul', { class: 'check-list' }, h('li', { class: 'ok' }, h('b', {}, 'Alle Fragen, Lösungen und Dateien sind da.'), h('small', {}, 'Die Show kann starten.'))),
    hints.length ? [h('p', { class: 'check-group' }, 'Hinweise (optional)'), list(hints, 'hinweis')] : null,
  ].flat().filter(Boolean));
}

// Vor der echten Show: alles aus Proben und Tests verwerfen und mit Schritt 1 beginnen.
async function startShowNow() {
  const ok = await ask('Show jetzt starten? Alles, was du vorher zum Testen geklickt hast, wird verworfen: Punkte, Münzen, Antworten, Spielstände und Entwürfe auf den iPads. Der Beamer beginnt mit Schritt 1. Deine Inhalte im Editor bleiben erhalten.', { confirmLabel: '🎬 Show jetzt starten' });
  if (ok) act('live.startShow');
}

async function restartShow() {
  const ok = await ask('Show wirklich neu starten? Alle Punkte und Münzen gehen auf 0, alle Fragen sind wieder unbeantwortet, der Beamer springt zurück auf die erste Folie. Deine Inhalte im Editor bleiben erhalten.', { requireText: 'NEUSTART', confirmLabel: 'Show neu starten', danger: true });
  if (ok) act('live.reset', { confirm: 'NEUSTART' });
}
function runPrev() { return act('run.prev'); }

function buildRun() {
  const steps = S.rundown || [];
  const cur = S.live.run ?? -1;
  const now = steps[cur];
  const next = steps[cur + 1];
  const started = cur >= 0;
  const head = h('div', { class: 'run-head' },
    h('div', { class: 'run-now' },
      h('span', { class: 'run-count' }, started ? `Schritt ${cur + 1} von ${steps.length}` : `${steps.length} Schritte`),
      h('div', { class: 'run-title' }, started ? [h('span', { class: 'run-ico' }, runIcon(now.kind)), now.text] : 'Show noch nicht gestartet'),
      h('div', { class: 'run-next muted' }, next ? ['Als Nächstes: ', h('b', {}, runIcon(next.kind), ' ', next.text)] : 'Letzter Schritt erreicht')),
    h('div', { class: 'run-buttons' },
      now && now.kind === 'video' && S.project.introVideo ? h('button', { class: 'btn ghost', onclick: () => act('run.goto', { index: cur }) }, '⟲ Video von vorn') : null,
      h('button', { class: 'btn ghost', disabled: cur <= 0, onclick: runPrev, title: 'Zurück (Pfeil links)' }, '◀ Zurück'),
      h('button', { class: 'btn pink run-go', disabled: cur >= steps.length - 1, onclick: runNext, title: 'Weiter (Pfeil rechts, Leertaste)' }, started ? 'Weiter ▶' : 'Erster Schritt ▶')));
  const strip = h('ol', { class: 'run-strip', 'aria-label': 'Alle Schritte' }, steps.map((st, i) => h('li', {},
    h('button', {
      class: `run-step k-${st.kind} ${i === cur ? 'current' : ''} ${i < cur ? 'done' : ''}`,
      'aria-current': i === cur ? 'step' : null,
      title: `${i + 1}. ${st.text}`,
      onclick: () => act('run.goto', { index: i }),
    }, h('span', { class: 'n' }, String(i + 1)), h('span', { class: 'i' }, runIcon(st.kind)), h('span', { class: 't' }, st.text)))));
  const title = h('div', { class: 'row', style: { justifyContent: 'space-between', alignItems: 'center' } },
    h('h3', { style: { margin: 0 } }, 'Showablauf'),
    h('div', { class: 'row', style: { gap: '8px' } },
      h('button', { class: 'btn ghost', onclick: runCheck, title: 'Prüft alle Spiele: leere Fragen, fehlende Lösungen, fehlende Videos, Bilder und Lieder' }, '✅ Generalprobe-Check'),
      h('button', { class: 'btn ok', onclick: startShowNow, title: 'Proben und Tests verwerfen, Punkte auf 0 und mit Schritt 1 beginnen' }, '🎬 Show jetzt starten')));
  const panel = h('section', { class: 'card run-card' }, title, head, strip,
    h('p', { class: 'muted run-hint' }, 'Tipp: Pfeil rechts, Leertaste oder ein Presenter-Klicker schalten weiter, Pfeil links zurück. Den Ablauf änderst du im Editor unter „Show-Editor“.'));
  // Aktuellen Schritt in der Leiste sichtbar halten – nur die Leiste waagerecht scrollen,
  // nie die ganze Seite (sonst sprang die Regie bei jeder Abgabe nach oben).
  requestAnimationFrame(() => {
    const cur = strip.querySelector('.run-step.current');
    if (!cur) return;
    const sr = strip.getBoundingClientRect(), cr = cur.getBoundingClientRect();
    strip.scrollLeft += (cr.left + cr.width / 2) - (sr.left + sr.width / 2);
  });
  return panel;
}

// Tastatur und Presenter-Klicker (senden meist Bild↓/Bild↑ oder Pfeiltasten).
document.addEventListener('keydown', (ev) => {
  if (tab !== 'live' || !S || ev.altKey || ev.ctrlKey || ev.metaKey) return;
  const t = ev.target;
  if (t && (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable)) return;
  if (document.querySelector('.modal-backdrop, dialog[open]')) return;
  if (['ArrowRight', 'PageDown', ' '].includes(ev.key)) { ev.preventDefault(); runNext(); }
  else if (['ArrowLeft', 'PageUp'].includes(ev.key)) { ev.preventDefault(); runPrev(); }
});

// Intro-Video je Show: läuft im Showablauf direkt nach dem Startbild.
let introUpload = null; // { name, progress } während des Hochladens
function buildIntroVideo() {
  const v = S.project.introVideo;
  const fmtSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
  const input = h('input', {
    type: 'file', accept: 'video/mp4,video/webm,video/quicktime,video/x-m4v', class: 'visually-hidden', 'aria-label': 'Intro-Video wählen',
    onchange: async (ev) => {
      const file = ev.target.files && ev.target.files[0];
      ev.target.value = '';
      if (!file) return;
      introUpload = { name: file.name, progress: 0 };
      renderAll(true);
      try {
        const m = await uploadMedia(file, token, (p) => {
          introUpload.progress = p;
          const bar = document.getElementById('intro-progress');
          if (bar) bar.value = p;
        });
        await act('intro.set', { media: { id: m.id, type: m.type, size: m.size, name: file.name } });
      } catch (err) {
        toast(err.message);
      } finally {
        introUpload = null;
        renderAll(true);
      }
    },
  });
  const preview = h('video', { class: 'intro-preview', controls: true, preload: 'metadata', playsinline: true });
  if (v) mediaUrl(v.id).then((url) => {
    if (url) preview.src = url;
    else preview.replaceWith(h('p', { class: 'notice warn' }, 'Das Video ist auf diesem Gerät nicht mehr vorhanden – bitte neu hochladen.'));
  });
  return card('Intro-Video',
    h('p', { class: 'muted' }, 'Läuft im Showablauf direkt nach dem Startbild. Jede Show hat ihr eigenes Video – einfach austauschen.'),
    introUpload
      ? h('div', {}, h('p', {}, `„${introUpload.name}“ wird hochgeladen …`), h('progress', { id: 'intro-progress', max: '1', value: String(introUpload.progress), style: { width: '100%' } }))
      : v
        ? h('div', { class: 'intro-box' }, preview, h('p', {}, h('b', {}, v.name), v.size ? h('span', { class: 'muted' }, ` · ${fmtSize(v.size)}`) : null))
        : h('p', { class: 'muted' }, 'Noch kein Video hinterlegt. Ohne Video zeigt der Beamer an dieser Stelle das Show-Logo.'),
    introUpload ? null : h('div', { class: 'row' },
      h('label', { class: 'btn' }, input, v ? 'Video austauschen' : '+ Video hochladen'),
      v ? h('button', { class: 'btn ghost', onclick: () => confirmAct('Intro-Video aus dieser Show entfernen?', 'intro.set', { media: null }) }, 'Entfernen') : null),
    h('p', { class: 'muted', style: { fontSize: '0.85rem' } }, 'Formate: MP4 (empfohlen), WebM oder MOV. Ton läuft auf dem Beamer, sobald dort „Ton aktivieren“ geklickt wurde.'));
}

// Intro-Lied je Spiel (Kategorie): läuft auf der Spieltitel-Folie dieses Spiels.
let gameIntroUpload = null; // { gameId, name, progress }
function buildGameIntro(g, pos, set = (media) => act('game.setIntro', { gameId: g.id, media })) {
  const m = g.intro;
  const fmtSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
  const input = h('input', {
    type: 'file', accept: 'audio/*,video/mp4,video/webm,video/quicktime,video/x-m4v,.mp3,.m4a,.mp4', class: 'visually-hidden', 'aria-label': `Intro-Lied für ${typeof pos === 'number' ? `Spiel ${pos}` : pos} wählen`,
    onchange: async (ev) => {
      const file = ev.target.files && ev.target.files[0];
      ev.target.value = '';
      if (!file) return;
      gameIntroUpload = { gameId: g.id, name: file.name, progress: 0 };
      renderAll(true);
      try {
        const up = await uploadMedia(file, token, (p) => {
          gameIntroUpload.progress = p;
          const bar = document.getElementById('game-intro-progress');
          if (bar) bar.value = p;
        });
        await set({ id: up.id, type: up.type, size: up.size, name: file.name });
      } catch (err) {
        toast(err.message);
      } finally {
        gameIntroUpload = null;
        renderAll(true);
      }
    },
  });
  const busy = gameIntroUpload && gameIntroUpload.gameId === g.id;
  const player = m ? h(m.type.startsWith('video') ? 'video' : 'audio', { controls: true, preload: 'metadata', class: 'game-intro-preview' }) : null;
  if (m) mediaUrl(m.id).then((url) => {
    if (url) player.src = url;
    else player.replaceWith(h('p', { class: 'notice warn' }, 'Die Datei ist auf diesem Gerät nicht mehr vorhanden – bitte neu hochladen.'));
  });
  return h('div', { class: 'game-intro-box' },
    h('b', {}, '♪ Intro-Lied für die Spieltitel-Folie'),
    busy
      ? h('div', {}, h('p', {}, `„${gameIntroUpload.name}“ wird hochgeladen …`), h('progress', { id: 'game-intro-progress', max: '1', value: String(gameIntroUpload.progress), style: { width: '100%' } }))
      : m ? h('div', {}, h('p', { style: { margin: '6px 0' } }, m.name, m.size ? h('span', { class: 'muted' }, ` · ${fmtSize(m.size)}`) : null), player)
        : h('p', { class: 'muted', style: { margin: '6px 0' } }, 'Noch kein Intro-Lied. MP3 oder MP4 hochladen – es läuft, solange der Spieltitel auf dem Beamer steht.'),
    busy ? null : h('div', { class: 'row' },
      h('label', { class: 'btn small' }, input, m ? 'Austauschen' : '+ MP3/MP4 hochladen'),
      m ? h('button', { class: 'btn small ghost', onclick: () => set(null) }, 'Entfernen') : null));
}

// Farbe einer Spieltitel-Folie wählen. Vorschau: Farbe in der Mitte, Rahmen in dunklerer Abstufung.
const GAME_COLORS = ['#ff8a7a', '#3fd3ea', '#ff63b1', '#f4b740', '#ab8dff', '#4fdca4', '#ff9d45', '#7fb0ff'];
const STAGE_COLOR = '#1d9bf5';
function titleColorPicker(label, current, fallback, sample, set) {
  const color = current || fallback;
  let timer = null;
  const input = h('input', {
    type: 'color', value: color, 'aria-label': label,
    oninput: (ev) => { const v = ev.target.value; ev.target.closest('.title-color').style.setProperty('--c', v); clearTimeout(timer); timer = setTimeout(() => set(v), 250); },
  });
  return h('div', { class: 'title-color', '--c': color },
    h('div', { class: 'title-swatch', 'aria-hidden': 'true' }, h('span', {}, sample)),
    h('label', { class: 'btn small ghost' }, input, '🎨 Farbe ändern'),
    current ? h('button', { class: 'btn small ghost', onclick: () => set(null) }, 'Standardfarbe') : h('span', { class: 'muted' }, 'Standardfarbe'));
}

// „Das geht mir zu weit“: Datenbanken mit Quelle, Datenstand und allen Einträgen zum Prüfen.
function buildDatasetInfo() {
  const val = (d, e) => (d.kind === 'birth' ? `geb. ${e.born.split('-').reverse().join('.')}` : d.kind === 'geo' ? `${e.lat}, ${e.lng}` : `${String(e.value).replace('.', ',')} ${d.unit}`);
  return h('div', { class: 'card', style: { margin: '10px 0' } },
    h('b', {}, 'Vergleichs-Datenbanken'),
    h('p', { class: 'muted' }, 'Jede Runde nutzt eine Datenbank. Die Teams sehen beim Abgeben alle Einträge (auch außerhalb der Grenzen). Fehler korrigierst du je Runde im Feld „Korrekturen / eigene Einträge“ – eine Zeile pro Eintrag im angegebenen Format.'),
    (S.datasets || []).map((d) => h('details', { class: 'item' },
      h('summary', {}, h('b', {}, d.name), h('span', { class: 'muted' }, ` · ${d.entries.length} Einträge · Datenstand ${d.asOf}`)),
      h('div', { class: 'item-body' },
        h('p', {}, h('b', {}, 'Quelle: '), d.source), h('p', {}, h('b', {}, 'Rechenweg: '), d.method), h('p', {}, h('b', {}, 'Format für Korrekturen: '), h('code', {}, d.fixHelp)),
        h('div', { class: 'ds-list' }, d.entries.map((e) => h('span', {}, h('b', {}, e.name), ` · ${val(d, e)}`)))))));
}

// Spieltitel der Gewinnstufen: je Stufe ein Lied und eine Farbe.
function buildStageTitles() {
  const stages = S.project.stages || {};
  return card('Spieltitel der Gewinnstufen',
    h('p', { class: 'muted' }, 'Zu Beginn jeder Gewinnstufe (vor Spiel 1, nach der Münzvergabe von Spiel 4 und 6) kündigt der Beamer die Stufe an. Ist das Lied zu Ende, geht es automatisch weiter.'),
    h('div', { class: 'stage-grid' }, [1, 2, 3].map((n) => {
      const st = stages[n] || {};
      return h('div', { class: 'stage-cell' },
        h('b', {}, `Gewinnstufe ${n}`),
        titleColorPicker(`Farbe Gewinnstufe ${n}`, st.color, STAGE_COLOR, String(n), (color) => act('stage.set', { stage: n, color })),
        buildGameIntro({ id: `stage${n}`, intro: st.intro }, `Gewinnstufe ${n}`, (media) => act('stage.set', { stage: n, intro: media })));
    })));
}

// Eigene Lieder je Pause: Playlist hochladen, sortieren, entfernen.
let openPause = null;
let songUpload = null; // { done, total, name }
function buildPauseSongs(st) {
  const songs = st.songs || [];
  const setSongs = (list) => act('rundown.setSongs', { stepId: st.id, songs: list });
  const move = (i, d) => { const l = [...songs]; const [x] = l.splice(i, 1); l.splice(i + d, 0, x); setSongs(l); };
  const fmtSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
  const input = h('input', {
    type: 'file', multiple: true, accept: 'audio/*,video/mp4,video/quicktime,video/x-m4v,.mp3,.m4a,.mp4,.m4v,.mov,.wav,.ogg,.flac,.aac',
    class: 'visually-hidden', 'aria-label': 'Lieder hinzufügen',
    onchange: async (ev) => {
      const files = [...(ev.target.files || [])];
      ev.target.value = '';
      if (!files.length) return;
      const added = [];
      songUpload = { done: 0, total: files.length, name: files[0].name };
      renderAll(true);
      try {
        for (const file of files) {
          songUpload.name = file.name;
          const label = document.getElementById('song-progress');
          if (label) label.textContent = `Lied ${songUpload.done + 1} von ${songUpload.total}: „${file.name}“ wird hochgeladen …`;
          const type = file.type || (/\.mp3$/i.test(file.name) ? 'audio/mpeg' : /\.m4a$/i.test(file.name) ? 'audio/mp4' : /\.(mp4|m4v)$/i.test(file.name) ? 'video/mp4' : /\.mov$/i.test(file.name) ? 'video/quicktime' : '');
          const blob = type && type !== file.type ? new File([file], file.name, { type }) : file;
          const m = await uploadMedia(blob, token);
          added.push({ id: m.id, type: m.type, size: m.size, name: file.name });
          songUpload.done += 1;
        }
      } catch (err) {
        toast(err.message);
      } finally {
        songUpload = null;
        if (added.length) await act('rundown.setSongs', { stepId: st.id, songs: [...songs, ...added] });
        renderAll(true);
      }
    },
  });
  return h('div', { class: 'pause-songs' },
    h('p', { class: 'muted' }, songs.length
      ? 'Diese Lieder laufen in dieser Pause nacheinander (danach wieder von vorn). Die Band spielt im Takt der Musik.'
      : 'Noch keine eigenen Lieder – es läuft der eingebaute Pausensong.'),
    songs.length ? h('ol', { class: 'song-list' }, songs.map((m, i) => h('li', {},
      h('span', { class: 'grow' }, `♪ ${m.name}`, m.size ? h('span', { class: 'muted' }, ` · ${fmtSize(m.size)}`) : null),
      h('button', { class: 'btn small ghost', 'aria-label': 'Nach oben', disabled: i === 0, onclick: () => move(i, -1) }, '↑'),
      h('button', { class: 'btn small ghost', 'aria-label': 'Nach unten', disabled: i === songs.length - 1, onclick: () => move(i, 1) }, '↓'),
      h('button', { class: 'btn small bad', 'aria-label': `${m.name} entfernen`, onclick: () => setSongs(songs.filter((_, k) => k !== i)) }, '✕')))) : null,
    songUpload
      ? h('p', { id: 'song-progress' }, `Lied ${songUpload.done + 1} von ${songUpload.total}: „${songUpload.name}“ wird hochgeladen …`)
      : h('div', { class: 'row' },
        h('label', { class: 'btn small' }, input, '+ Lieder hinzufügen'),
        songs.length ? h('button', { class: 'btn small ghost', onclick: () => confirmAct('Alle eigenen Lieder dieser Pause entfernen? Dann läuft wieder der eingebaute Pausensong.', 'rundown.setSongs', { stepId: st.id, songs: [] }) }, 'Alle entfernen') : null),
    h('p', { class: 'muted', style: { fontSize: '0.85rem', margin: '6px 0 0' } }, 'Formate: MP3, M4A, MP4, MOV, WAV, OGG, FLAC (bei Videos wird nur der Ton gespielt). Mehrere Dateien auf einmal möglich.'));
}

// Bearbeiten im Show-Editor: Schritte verschieben, löschen, Pausen einfügen.
function buildRundownEditor() {
  const steps = (S.rundown || []).map(({ id, kind, pos, stage, label, songs }) => ({ id, kind, pos, stage, label, songs }));
  const save = (list) => act('rundown.set', { steps: list });
  const move = (i, d) => { const l = [...steps]; const [x] = l.splice(i, 1); l.splice(i + d, 0, x); save(l); };
  const insertAt = (i, st) => { const l = [...steps]; l.splice(i, 0, st); save(l); };
  const kindSel = h('select', { 'aria-label': 'Art des Schritts' },
    Object.entries(RUN_KIND_LABEL).map(([k, label]) => h('option', { value: k }, k === 'coin' ? label : `${RUN_ICON[k]} ${label}`)));
  const posSel = h('select', { 'aria-label': 'Spiel' }, S.project.games.map((g, i) => h('option', { value: String(i + 1) }, `Spiel ${i + 1} · ${g.title}`)));
  const stageSel = h('select', { 'aria-label': 'Gewinnstufe' }, [1, 2, 3].map((n) => h('option', { value: String(n) }, `Gewinnstufe ${n}`)));
  const afterSel = h('select', { 'aria-label': 'Einfügen nach' },
    h('option', { value: '0' }, 'ganz am Anfang'),
    steps.map((st, i) => h('option', { value: String(i + 1), selected: i === steps.length - 1 }, `nach ${i + 1}. ${S.rundown[i].text}`)));
  const updatePos = () => { posSel.hidden = !['title', 'game', 'coin', 'pyramid'].includes(kindSel.value); stageSel.hidden = !['stageTitle', 'hosts'].includes(kindSel.value); };
  kindSel.onchange = updatePos;
  kindSel.value = 'pause';
  updatePos();
  return card('Showablauf (Reihenfolge der Show)',
    h('p', { class: 'muted' }, 'So läuft die Show in der Live-Regie ab – Schritt für Schritt mit „Weiter“, wie eine Präsentation.',
      S.rundownCustom ? ' Du hast den Ablauf angepasst.' : ' Das ist der Standardablauf aus deinen Spielen.'),
    h('ol', { class: 'list rundown-list' }, S.rundown.map((st, i) => h('li', { class: `rd k-${st.kind}` },
      h('b', { class: 'rd-n' }, `${i + 1}.`),
      h('span', { class: 'rd-i', 'aria-hidden': 'true' }, runIcon(st.kind)),
      h('span', { class: 'grow' }, st.text),
      st.kind === 'pause' ? h('button', {
        class: `btn small ${openPause === st.id ? 'pink' : 'ghost'}`, 'aria-expanded': String(openPause === st.id),
        onclick: () => { openPause = openPause === st.id ? null : st.id; renderAll(true); },
      }, `♪ Lieder (${(st.songs || []).length})`) : null,
      h('button', { class: 'btn small ghost', title: 'Pause danach einfügen', onclick: () => insertAt(i + 1, { kind: 'pause' }) }, '+ ☕'),
      h('button', { class: 'btn small ghost', 'aria-label': 'Nach oben', disabled: i === 0, onclick: () => move(i, -1) }, '↑'),
      h('button', { class: 'btn small ghost', 'aria-label': 'Nach unten', disabled: i === steps.length - 1, onclick: () => move(i, 1) }, '↓'),
      h('button', { class: 'btn small bad', 'aria-label': 'Schritt entfernen', onclick: () => save(steps.filter((_, k) => k !== i)) }, '✕'),
      st.kind === 'pause' && openPause === st.id ? buildPauseSongs(st) : null))),
    h('div', { class: 'row', style: { marginTop: '12px' } },
      kindSel, posSel, stageSel, afterSel,
      h('button', { class: 'btn', onclick: () => {
        const st = { kind: kindSel.value };
        if (!posSel.hidden) st.pos = Number(posSel.value);
        if (st.kind === 'pyramid' && st.pos === undefined) delete st.pos;
        if (st.kind === 'stageTitle' || st.kind === 'hosts') st.stage = Number(stageSel.value);
        insertAt(Number(afterSel.value), st);
      } }, '+ Schritt einfügen'),
      S.rundownCustom ? h('button', { class: 'btn ghost', onclick: () => confirmAct('Eigene Änderungen am Ablauf verwerfen und den Standardablauf wiederherstellen?', 'rundown.reset') }, 'Standardablauf wiederherstellen') : null));
}

function activeGameOf() {
  return S.project.games.find((g) => g.id === S.live.activeGame) || null;
}

function buildGameControl() {
  const g = activeGameOf();
  if (!g) return card('Spielsteuerung', h('p', { class: 'muted' }, 'Kein Spiel aktiv. Der Showablauf aktiviert die Spiele; Ausnahmen ganz unten unter „Spiele (direkt aktivieren)“.'), h('div', { class: 'row' }, undoButton()));
  const st = S.live.games[g.id] || {};
  const pos = S.project.games.indexOf(g) + 1;
  return h('div', {}, timerBar(), buildPlay({ S, card, dot, act, confirmAct, teamName, teamColor, ask }, g, st, pos));
}

// 10-Sekunden-Timer: Beamer kündigt groß an, dann läuft er auf der Fragenfolie ab.
// Danach sind alle Antworten gesperrt; Schreibfelder werden automatisch abgeschickt.
function timerBar() {
  const t = S.timer;
  const now = Date.now();
  let status;
  if (!t) status = h('span', { class: 'muted' }, 'Für die aktuelle Frage: groß ankündigen, 10 s Countdown, danach gesperrt.');
  else if (t.phase === 'over') status = h('b', { style: { color: 'var(--bad)' } }, 'Zeit abgelaufen – Antworten gesperrt');
  else status = h('span', {}, t.phase === 'announce' ? 'Wird angekündigt … ' : 'Läuft: ', h('b', { 'data-deadline': String(now + t.remainingMs) }, `${Math.ceil(t.remainingMs / 1000)} s`));
  return h('section', { class: 'card timer-bar' },
    h('div', { class: 'row', style: { alignItems: 'center', gap: '12px', flexWrap: 'nowrap' } },
      h('button', { class: 'btn pink', style: { whiteSpace: 'nowrap', flexShrink: 0 }, onclick: () => act('timer.start'), disabled: !!t && t.phase !== 'over' }, t ? '⏱ Timer neu starten' : '⏱ 10-Sekunden-Timer'),
      t ? h('button', { class: 'btn ghost', onclick: () => act('timer.stop') }, t.phase === 'over' ? 'Sperre aufheben' : 'Abbrechen') : null,
      h('span', { class: 'grow', style: { minWidth: 0, fontSize: '0.9rem' } }, status),
      undoButton()));
}

// Beamer: Umschalten übernimmt der Showablauf – hier nur, was gerade läuft.
const BEAMER_VIEW_LABEL = { start: 'Startbild', video: 'Intro-Video', intro: 'Vorstellung der Teams', pyramid: 'Übersicht Kategorien', pause: 'Pause', title: 'Spieltitel', game: 'Spiel', ranking: 'Rangliste', coin: 'Münzvergabe', stageTitle: 'Gewinnstufe', hosts: 'Moderation am Pult', finaleTitle: 'Finale – Spieltitel', finale: 'Finale', blank: 'Schwarz' };
function buildBeamerControls() {
  const current = S.live.beamer.view;
  const status = h('p', { class: 'muted' }, 'Zeigt jetzt: ', h('b', {}, BEAMER_VIEW_LABEL[current] || current),
    ` · ${S.connections.beamers || 0} Beamer verbunden`);
  // Adresse für das zweite Gerät an der Leinwand.
  const url = `${location.origin}${location.pathname.replace(/moderator\.html$/, '')}beamer.html`;
  const local = /^(localhost|127\.|\[::1\])/.test(location.hostname);
  const second = localServer
    ? h('p', { class: 'muted beamer-url' }, 'Im Prototyp läuft alles in diesem Browser: Vollbild über „⛶ Beamer im Vollbild“ oben auf der Seite. Für ein zweites Gerät an der Leinwand den Show-Server starten.')
    : h('div', { class: 'beamer-url' },
      h('p', { class: 'muted' }, 'Auf dem Gerät an der Leinwand öffnen, „⛶ Vollbild“ tippen:'),
      h('div', { class: 'row' }, h('code', {}, url),
        h('button', { class: 'btn small ghost', onclick: () => Promise.resolve(navigator.clipboard?.writeText(url)).then(() => toast('Adresse kopiert', 'info'), () => toast(`Adresse: ${url}`, 'info')) }, 'Kopieren')),
      local ? h('p', { class: 'notice warn' }, 'Diese Adresse zeigt auf diesen Rechner selbst. Auf dem zweiten Gerät statt „localhost“ die IP-Adresse dieses Rechners im WLAN verwenden, z. B. http://192.168.1.20:3000/beamer.html') : null);
  return [status, second];
}

// Rangliste in der Regie: Punkte nachträglich von Hand anpassen (wird protokolliert).
function buildTeamsLive() {
  const sorted = [...S.project.teams].sort((a, b) => S.totals[b.id] - S.totals[a.id]);
  const adjust = (t, points, reason = 'Manuell in der Regie') => act('points.adjust', { teamId: t.id, points, reason });
  const custom = async (t) => {
    const v = await ask(`Punkte für ${t.name} anpassen`, {
      confirmLabel: 'Buchen',
      fields: [{ name: 'points', label: 'Punkte (z. B. 3 oder -2)', type: 'number', value: '' }, { name: 'reason', label: 'Grund (optional)', value: '' }],
    });
    if (!v) return;
    const n = Number(v.points);
    if (!Number.isInteger(n) || n === 0) return toast('Bitte eine ganze Zahl ungleich 0 eingeben.');
    adjust(t, n, v.reason ? `Regie: ${v.reason}` : undefined);
  };
  return card('Rangliste (nur für dich sichtbar)',
    sorted.length ? h('ul', { class: 'list leader' }, sorted.map((t, i) => {
      const online = S.connections.teams?.[t.id];
      return h('li', {}, h('b', { class: 'rank-n' }, `${i + 1}.`), dot(t.color), h('span', { class: 'grow' }, t.name),
        h('span', { class: `badge ${online ? 'ok' : 'warn'}`, title: online ? 'iPad verbunden' : 'iPad nicht verbunden' }, online ? '●' : '○'),
        h('button', { class: 'btn small ghost pt-btn', 'aria-label': `${t.name}: 1 Punkt abziehen`, onclick: () => adjust(t, -1) }, '−1'),
        h('b', { class: 'pts' }, `${S.totals[t.id]} P.`),
        h('button', { class: 'btn small ghost pt-btn', 'aria-label': `${t.name}: 1 Punkt dazu`, onclick: () => adjust(t, 1) }, '+1'),
        h('button', { class: 'btn small ghost pt-btn', title: 'Andere Punktzahl', 'aria-label': `${t.name}: Punkte anpassen`, onclick: () => custom(t) }, '±'));
    })) : h('p', { class: 'muted' }, 'Noch keine Teams angelegt.'),
    lastManual());
}

// Letzte Handbuchung mit Rückgängig-Knopf (Gegenbuchung).
function lastManual() {
  const e = [...(S.ledger || [])].reverse().find((x) => x.ref && x.ref.startsWith('manual:') && !x.reversedBy && !x.reverses);
  if (!e) return null;
  return h('p', { class: 'muted', style: { fontSize: '0.85rem', marginTop: '8px' } }, `Zuletzt: ${teamName(e.teamId)} ${e.points > 0 ? '+' : ''}${e.points} `,
    h('button', { class: 'btn small ghost', onclick: () => act('points.undo', { entryId: e.id }) }, '↶ rückgängig'));
}

function buildCoins() {
  const w = S.live.warning;
  return card('Münzen',
    h('ul', { class: 'list' }, S.coinPositions.map((pos) => {
      const c = S.live.coins.find((x) => x.position === pos);
      if (c) return h('li', {}, coinImg(), h('span', { class: 'grow' }, `Nach Position ${pos}`), dot(teamColor(c.teamId)), h('b', {}, teamName(c.teamId)), h('span', { class: 'muted' }, `(${c.method})`));
      const tie = w?.kind === 'coinTie' && w.position === pos;
      return h('li', {}, coinImg('coin-open'), h('span', { class: 'grow' }, `Nach Position ${pos}`),
        tie
          ? w.teamIds.map((id) => h('button', { class: 'btn small', onclick: () => confirmAct(`${teamName(id)} hat die Schätzfrage gewonnen und bekommt die Münze?`, 'coin.awardTie', { teamId: id }) }, `${teamName(id)} gewinnt Schätzfrage`))
          : h('button', { class: 'btn small', onclick: () => confirmAct(`Münzgewinner nach Position ${pos} aus dem kumulierten Punktestand ermitteln?`, 'coin.determine', { position: pos }) }, 'Gewinner ermitteln'));
    })),
    h('p', { class: 'muted' }, 'Die Münze erscheint auf dem Beamer beim Schritt „Münzvergabe“ im Showablauf.'));
}

// ---------- Teams ----------

// 3D-Avatar eines Teams: steht auf dem Beamer im Bogen hinter dem Pult.
// Das Bild wird vor dem Speichern verkleinert (max. 480 px hoch).
// Hintergrund-Entfernung für Avatare: Alles Helle, das vom Bildrand aus zusammenhängt
// (Flutfüllung), wird durchsichtig; am Übergang zur Figur weich ausgeblendet. Helle Stellen
// innerhalb der Figur (z. B. weißes Hemd) bleiben, weil sie nicht mit dem Rand verbunden sind.
// Bilder, die schon transparent sind oder keinen hellen Rand haben, bleiben unverändert.
function removeLightBackground(ctx, w, h) {
  const im = ctx.getImageData(0, 0, w, h);
  const d = im.data;
  const n = w * h;
  // Heller Hintergrund: weiß – oder das grau-weiße Schachbrett, das manche
  // Bildgeneratoren als „Transparenz“ fest ins Bild malen.
  let minLight = 228;
  const light = (i) => {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    return d[i * 4 + 3] > 200 && min >= minLight && max - min <= 28;
  };
  const edgeIdx = [];
  for (let x = 0; x < w; x++) edgeIdx.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) edgeIdx.push(y * w, y * w + w - 1);
  const edge = edgeIdx.length;
  let transparent = 0;
  for (const i of edgeIdx) if (d[i * 4 + 3] < 200) transparent++;
  if (transparent > edge * 0.2) return false;
  const count = () => edgeIdx.reduce((c, i) => c + (light(i) ? 1 : 0), 0);
  if (count() < edge * 0.6) {
    // Schachbrett? Rand fast nur neutral hell, mit deutlichem Anteil grauer Felder.
    minLight = 180;
    let grey = 0;
    for (const i of edgeIdx) if (light(i) && Math.min(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]) < 228) grey++;
    if (count() < edge * 0.6 || grey < edge * 0.12) return false;
  }
  const bg = new Uint8Array(n);
  const stack = [];
  const push = (i) => { if (!bg[i] && light(i)) { bg[i] = 1; stack.push(i); } };
  // Start nur am oberen, linken und rechten Rand: Figuren sind unten oft angeschnitten
  // (z. B. weißes Hemd am unteren Bildrand) – das soll stehen bleiben.
  for (let x = 0; x < w; x++) push(x);
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop();
    const x = i % w, y = (i - x) / w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }
  // Schachbrett: auch eingeschlossene Flächen (z. B. zwischen Arm und Körper) entfernen,
  // wenn sie das typische Grau-Weiß-Muster haben. Unten mit starten.
  if (minLight < 228) {
    for (let x = 0; x < w; x++) push((h - 1) * w + x);
    const seen = new Uint8Array(n);
    for (let s0 = 0; s0 < n; s0++) {
      if (bg[s0] || seen[s0] || !light(s0)) continue;
      const comp = [s0];
      seen[s0] = 1;
      let grey = 0, white = 0;
      for (let k = 0; k < comp.length; k++) {
        const i = comp[k];
        if (Math.min(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]) < 228) grey++; else white++;
        const x = i % w;
        for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
          if (j >= 0 && j < n && !seen[j] && !bg[j] && light(j)) { seen[j] = 1; comp.push(j); }
        }
      }
      if (comp.length > n * 0.002 && grey > comp.length * 0.2 && white > comp.length * 0.2) for (const i of comp) push(i);
    }
    while (stack.length) {
      const i = stack.pop();
      const x = i % w, y = (i - x) / w;
      if (x > 0) push(i - 1);
      if (x < w - 1) push(i + 1);
      if (y > 0) push(i - w);
      if (y < h - 1) push(i + w);
    }
  }
  // Randzone (bis 2 Pixel neben dem Hintergrund): helle Säume weich ausblenden und den
  // Weißanteil aus der Farbe herausrechnen, damit kein heller Rand um die Figur bleibt.
  const ring = new Uint8Array(n);
  for (let pass = 1; pass <= 2; pass++) {
    for (let i = 0; i < n; i++) {
      if (bg[i] || ring[i]) continue;
      const x = i % w, y = (i - x) / w;
      const near = (j) => bg[j] || (pass === 2 && ring[j] === 1);
      if ((x > 0 && near(i - 1)) || (x < w - 1 && near(i + 1)) || (y > 0 && near(i - w)) || (y < h - 1 && near(i + w))) ring[i] = pass;
    }
  }
  for (let i = 0; i < n; i++) {
    if (bg[i]) { d[i * 4 + 3] = 0; continue; }
    if (!ring[i]) continue;
    const lum = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3;
    const a = Math.min(1, Math.max(0, (255 - lum) / 125));
    if (a >= 1) continue;
    if (a <= 0.04) { d[i * 4 + 3] = 0; continue; }
    for (let k = 0; k < 3; k++) d[i * 4 + k] = Math.max(0, Math.min(255, Math.round((d[i * 4 + k] - 255 * (1 - a)) / a)));
    d[i * 4 + 3] = Math.round(d[i * 4 + 3] * a);
  }
  ctx.putImageData(im, 0, 0);
  return true;
}

async function shrinkImage(file) {
  if (!/^image\/(png|webp|jpeg)$/.test(file.type)) throw new Error('Bitte ein PNG-, WebP- oder JPEG-Bild wählen.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Bild konnte nicht gelesen werden.'));
      i.src = url;
    });
    // Möglichst groß (scharf auf dem Beamer), aber unter der Größengrenze des Servers.
    let data = '';
    for (const max of [760, 600, 480, 360]) {
      const scale = Math.min(1, max / img.naturalHeight, max / img.naturalWidth);
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, c.width, c.height);
      // Weißen (oder sehr hellen, einfarbigen) Hintergrund automatisch entfernen.
      removeLightBackground(ctx, c.width, c.height);
      // WebP behält Transparenz und ist klein; Safari kann es nicht erzeugen → PNG.
      data = c.toDataURL('image/webp', 0.86);
      if (!data.startsWith('data:image/webp')) data = c.toDataURL('image/png');
      if (data.length < 850000) break;
    }
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function avatarCell(t, showId) {
  const input = h('input', {
    type: 'file', accept: 'image/png,image/webp,image/jpeg', class: 'visually-hidden', 'aria-label': `3D-Avatar für ${t.name} wählen`,
    onchange: async (ev) => {
      const file = ev.target.files && ev.target.files[0];
      ev.target.value = '';
      if (!file) return;
      try {
        act('team.update', { showId, teamId: t.id, avatar: await shrinkImage(file) });
      } catch (err) {
        toast(err.message);
      }
    },
  });
  return h('div', { class: 'avatar-cell' },
    t.avatar ? h('img', { class: 'avatar-thumb', src: t.avatar, alt: `Avatar von ${t.name}` }) : t.hasAvatar ? h('span', { class: 'badge ok' }, '✓ Avatar') : h('span', { class: 'avatar-empty', title: 'Kein Avatar – das Pult bleibt leer' }, '–'),
    h('label', { class: 'btn small ghost' }, input, t.avatar || t.hasAvatar ? 'Ändern' : 'Avatar wählen'),
    t.avatar || t.hasAvatar ? h('button', { class: 'btn small ghost', onclick: () => act('team.update', { showId, teamId: t.id, avatar: null }) }, 'Entfernen') : null);
}

// 3D-Avatar für Moderation bzw. Co-Moderation (steht hinter dem Moderationspult; ohne Bild der Standard-Avatar)
function hostAvatarCell(label, key) {
  const cur = S.project[key];
  const input = h('input', {
    type: 'file', accept: 'image/png,image/webp,image/jpeg', class: 'visually-hidden', 'aria-label': `${label} wählen`,
    onchange: async (ev) => {
      const file = ev.target.files && ev.target.files[0];
      ev.target.value = '';
      if (!file) return;
      try { act('project.update', { [key]: await shrinkImage(file) }); } catch (err) { toast(err.message); }
    },
  });
  const def = key === 'hostAvatar' ? 'assets/img/avatar-host.webp' : 'assets/img/avatar-cohost.webp';
  return h('div', {}, h('label', {}, label), h('div', { class: 'avatar-cell' },
    h('img', { class: 'avatar-thumb', src: cur || def, alt: label }),
    h('label', { class: 'btn small ghost' }, input, cur ? 'Ändern' : 'Eigenes Bild wählen'),
    cur ? h('button', { class: 'btn small ghost', onclick: () => act('project.update', { [key]: null }) }, 'Standard-Avatar') : h('span', { class: 'muted' }, 'Standard-Avatar')));
}

// Teams je Show: Die Auswahl oben legt fest, für welche Show die Teams bearbeitet werden –
// so lassen sich mehrere Shows mit wechselnden Teams im Voraus vorbereiten.
let teamsShow = null;
function buildTeams() {
  const base = `${location.origin}${location.pathname.replace(/moderator\.html$/, '')}team.html?code=`;
  const others = S.showTeams || [];
  if (teamsShow && !others.some((x) => x.id === teamsShow)) teamsShow = null;
  const other = teamsShow ? others.find((x) => x.id === teamsShow) : null;
  const showId = other ? other.id : undefined;
  const teams = other ? other.teams : S.project.teams;
  const showName = other ? other.name : S.project.name;
  const sel = h('select', { id: 'teams-show', onchange: (ev) => { teamsShow = ev.target.value === 'current' ? null : ev.target.value; renderAll(true); } },
    h('option', { value: 'current', selected: !other }, `${S.project.name} (geöffnet)`),
    others.map((x) => h('option', { value: x.id, selected: other && other.id === x.id }, `${x.name}${x.date ? ` · ${fmtDate(x.date)}` : ''}`)));
  const allShows = [{ id: S.project.id, name: S.project.name }, ...others].filter((x) => x.id !== (other ? other.id : S.project.id));
  const copySel = h('select', { 'aria-label': 'Teams übernehmen aus' }, allShows.map((x) => h('option', { value: x.id }, x.name)));
  const hasPoints = other ? other.hasPoints : (S.ledger || []).length > 0;
  return [
    card('Teams für Show',
      h('div', { class: 'row' }, h('label', { for: 'teams-show', style: { margin: 0 } }, 'Show:'), sel),
      h('p', { class: 'muted' }, 'Jede Show hat ihre eigenen Teams mit eigenen Zugangscodes. Wähle eine Show, um ihre Teams schon vorab einzutragen – auch ohne sie zu öffnen.'),
      allShows.length ? h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Teams übernehmen aus:'), copySel,
        h('button', { class: 'btn small ghost', disabled: hasPoints, title: hasPoints ? 'Diese Show hat schon Punkte.' : '',
          onclick: () => confirmAct(`Die Teams von „${showName}“ durch die Teams der gewählten Show ersetzen? (neue Zugangscodes)`, 'teams.copyFrom', { showId: other ? other.id : S.project.id, fromShowId: copySel.value }) }, 'Übernehmen')) : null),
    card('Team anlegen',
      h('form', {
        class: 'row', onsubmit: (ev) => {
          ev.preventDefault();
          const name = ev.target.elements.name.value;
          act('team.add', { showId, name });
          ev.target.reset();
        },
      }, h('input', { name: 'name', placeholder: 'Teamname', maxlength: '40', style: { flex: '1 1 220px', width: 'auto' } }),
      h('button', { class: 'btn', type: 'submit' }, '+ Team hinzufügen')),
      h('p', { class: 'muted' }, 'Standard sind sechs Teams. Jedes Team bekommt einen kurzen Zugangscode (4 Ziffern) und einen persönlichen Link.'),
      h('p', { class: 'muted' }, '3D-Avatar: am besten ein freigestelltes PNG (transparenter Hintergrund), hochkant. Ein weißer Hintergrund wird beim Hochladen automatisch entfernt. Er steht auf dem Beamer im Bogen hinter dem Pult; ohne Avatar bleibt das Pult leer.')),
    card(`Teams von „${showName}“ (${teams.length})`,
      teams.length ? h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Farbe'), h('th', {}, 'Name'), h('th', {}, '3D-Avatar'), h('th', {}, 'Zugangscode / Link'), h('th', {}, ''))),
        h('tbody', {}, teams.map((t) => h('tr', {},
          h('td', {}, h('input', { type: 'color', value: t.color, 'aria-label': `Farbe ${t.name}`, style: { width: '56px', padding: '2px' }, onchange: (ev) => act('team.update', { showId, teamId: t.id, color: ev.target.value }) })),
          h('td', {}, h('input', { value: t.name, maxlength: '40', 'aria-label': 'Teamname', onchange: (ev) => act('team.update', { showId, teamId: t.id, name: ev.target.value }) })),
          h('td', {}, avatarCell(t, showId)),
          h('td', {}, h('div', { class: 'code' }, t.code),
            other ? h('span', { class: 'muted', style: { fontSize: '0.8rem' } }, 'gilt, sobald die Show geöffnet ist')
              : h('button', { class: 'btn small ghost', onclick: () => Promise.resolve(navigator.clipboard?.writeText(base + t.code)).then(() => toast('Link kopiert', 'info'), () => toast(`Kopieren nicht möglich. Link: ${base + t.code}`, 'info')) }, 'Link kopieren')),
          h('td', {}, h('div', { class: 'row' },
            h('button', { class: 'btn small ghost', onclick: () => confirmAct(`Neuen Code für ${t.name} erzeugen? Der alte Code und verbundene Geräte werden ungültig.`, 'team.regenCode', { showId, teamId: t.id }) }, 'Neuer Code'),
            h('button', { class: 'btn small bad', onclick: () => confirmAct(`Team ${t.name} löschen?`, 'team.remove', { showId, teamId: t.id }) }, 'Löschen'))))))) : h('p', { class: 'muted' }, 'Noch keine Teams.')),
  ];
}

// ---------- Autosave ----------

function saveIndicator() {
  const el = h('span', { class: 'save-state', id: 'save-state', 'aria-live': 'polite' });
  updateSaveIndicator(el);
  return el;
}

function updateSaveIndicator(el = document.getElementById('save-state')) {
  if (!el) return;
  if (saveState.saving) el.textContent = '… speichert';
  else if (saveState.dirty) el.textContent = '● Ungespeicherte Änderungen';
  else el.textContent = '✓ Gespeichert';
  el.style.color = saveState.dirty || saveState.saving ? 'var(--warn)' : 'var(--ok)';
}

// Änderungen je Bereich sammeln und nach kurzer Pause automatisch speichern.
function autosave(key, fn) {
  saveState.pending.set(key, fn);
  saveState.dirty = true;
  updateSaveIndicator();
  clearTimeout(saveState.timer);
  saveState.timer = setTimeout(async () => {
    const jobs = [...saveState.pending.values()];
    saveState.pending.clear();
    saveState.saving = true;
    updateSaveIndicator();
    const results = await Promise.all(jobs.map((job) => job()));
    saveState.saving = false;
    saveState.dirty = saveState.pending.size > 0 || results.some((r) => !r);
    updateSaveIndicator();
  }, 800);
}

// ---------- Show-Editor ----------

let selectedGame = null;
let editorSection = store('quiz.editorSection') || 'games';
let selectedEntry = null;
const drafts = new Map();

function buildEditor() {
  const p = S.project;
  const field = (label, key, max) => h('div', {}, h('label', { for: `proj-${key}` }, label),
    h('input', { id: `proj-${key}`, value: p[key], maxlength: String(max), oninput: (ev) => autosave(`project.${key}`, () => act('project.update', { [key]: ev.target.value })) }));
  const check = (label, key) => h('label', { style: { fontWeight: 400 } },
    h('input', { type: 'checkbox', checked: p.settings[key], style: { width: 'auto', marginRight: '8px' }, onchange: (ev) => act('project.update', { settings: { [key]: ev.target.checked } }) }), label);

  if (!p.games.some((g) => g.id === selectedGame)) selectedGame = p.games[0]?.id || null;
  const sel = p.games.find((g) => g.id === selectedGame);

  const showCards = h('div', { class: 'grid two', style: { marginTop: '16px' } },
    card('Show', field('Showname', 'name', 80),
      h('div', {}, h('label', { for: 'show-date' }, 'Datum der Show'),
        h('input', { id: 'show-date', type: 'date', value: p.date || '', onchange: (ev) => act('project.update', { date: ev.target.value }) })),
      field('Untertitel', 'subtitle', 160), field('Moderation (Name)', 'host', 80), hostAvatarCell('Avatar Moderation', 'hostAvatar'),
      field('Co-Moderation (Name, leitet das Finale)', 'coHost', 80), hostAvatarCell('Avatar Co-Moderation', 'coHostAvatar')),
    card('Darstellung',
      check('Animationen reduzieren', 'reducedMotion'),
      check('Soundeffekte auf dem Beamer', 'sound'),
      check('Teams dürfen den Punktestand sehen (Standard: aus)', 'publicScores'),
      h('label', { for: 'show-title-dur' }, 'Dauer der Spieltitel-Animation (Sekunden)'),
      h('input', { id: 'show-title-dur', type: 'number', min: '3', max: '20', value: p.settings.titleDurationSec, onchange: (ev) => act('project.update', { settings: { titleDurationSec: Number(ev.target.value) } }) })));

  // Unterpunkte des Show-Editors
  const SECTIONS = [['teams', '1. Teams'], ['games', '2. Spiele'], ['rundown', '3. Showablauf'], ['finale', '4. Finale']];
  if (!SECTIONS.some(([k]) => k === editorSection)) editorSection = 'games';
  const nav = h('nav', { class: 'tabs editor-sections', role: 'tablist', 'aria-label': 'Show-Editor' }, SECTIONS.map(([k, label]) =>
    h('button', { role: 'tab', 'aria-selected': String(k === editorSection), onclick: () => { editorSection = k; store('quiz.editorSection', k); renderAll(true); } }, label)));
  const content = {
    teams: () => buildTeams(),
    games: () => [buildBoard(), sel ? buildGameEditor('game', sel) : null],
    rundown: () => [buildRundownEditor(), buildStageTitles(), buildIntroVideo(), showCards],
    finale: () => [card('Spieltitel des Finales', h('p', { class: 'muted' }, 'Vor dem Finale zeigt der Beamer eine eigene Spieltitel-Folie. Ist das Lied zu Ende, geht es automatisch ins Finale.'), buildGameIntro({ id: 'finale', title: 'Finale', intro: S.project.finaleIntro }, 'das Finale', (media) => act('finale.setIntro', { media }))), buildFinaleEditor({ ...finaleUi(), reset: !saveState.dirty })],
  }[editorSection]();
  return [
    h('div', { class: 'row', style: { justifyContent: 'space-between', marginBottom: '12px' } }, h('h2', { style: { margin: 0 } }, 'Show-Editor'), saveIndicator()),
    buildShows(),
    nav,
    ...[].concat(content).filter(Boolean),
  ];
}

// Mehrere Shows: geöffnet ist immer eine, die anderen behalten Teams, Spiele und Punkte.
const fmtDate = (d) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }) : '');

async function renameShow(s) {
  const v = await ask(`Show „${s.name}“ umbenennen`, {
    confirmLabel: 'Speichern',
    fields: [{ name: 'name', label: 'Name der Show', value: s.name, maxlength: 80 }, { name: 'date', label: 'Datum der Show (optional)', type: 'date', value: s.date }],
  });
  if (v) act('shows.rename', { showId: s.id, name: v.name, date: v.date });
}

async function createShow() {
  const v = await ask('Neue Show anlegen', {
    confirmLabel: 'Anlegen und öffnen',
    fields: [
      { name: 'name', label: 'Name der Show', value: '', maxlength: 80 },
      { name: 'date', label: 'Datum der Show (optional)', type: 'date', value: '' },
      { name: 'copyTeams', label: 'Teams aus der geöffneten Show übernehmen (gleiche Zugangscodes)', type: 'checkbox', value: true },
    ],
  });
  if (!v) return;
  act('shows.create', { name: v.name, date: v.date, copyTeams: v.copyTeams });
}

// Fertige Show als Vorlage für die nächste: Spiele, Fragen, Ablauf, Lieder und Finale
// werden übernommen; Punkte und Spielstände nicht. Teams wahlweise neu.
async function duplicateShow(s) {
  const v = await ask(`„${s.name}“ als Vorlage kopieren`, {
    confirmLabel: 'Kopie anlegen',
    fields: [
      { name: 'name', label: 'Name der neuen Show', value: `${s.name} (Kopie)`.slice(0, 80), maxlength: 80 },
      { name: 'date', label: 'Datum der neuen Show (optional)', type: 'date', value: '' },
      { name: 'newTeams', label: 'Neue Teams anlegen (neue Namen und Zugangscodes) – sonst werden die Teams übernommen', type: 'checkbox', value: true },
    ],
  });
  if (!v) return;
  const r = await act('shows.duplicate', { showId: s.id, name: v.name, date: v.date, newTeams: v.newTeams });
  if (r) toast(`„${v.name || s.name}“ angelegt – unter „Meine Shows“ öffnen`, 'info');
}

function buildShows() {
  const running = S.live.activeGame !== null;
  return card('Meine Shows',
    h('p', { class: 'muted', style: { marginTop: 0 } }, 'Jede Show hat eigene Spiele, Teams und Punkte. Bearbeitet und gespielt wird immer die geöffnete Show.'),
    h('ul', { class: 'list' }, S.shows.map((s) => h('li', { class: s.current ? 'active' : '' },
      h('span', { class: 'grow' }, h('b', {}, s.name), s.date ? h('span', { class: 'muted' }, ` · ${fmtDate(s.date)}`) : null,
        h('span', { class: 'muted' }, ` · ${s.games} Spiele · ${s.teams} Teams`)),
      s.current ? h('span', { class: 'badge ok' }, 'geöffnet')
        : h('button', { class: 'btn small', disabled: running, title: running ? 'Zuerst das laufende Spiel beenden.' : '', onclick: () => act('shows.switch', { showId: s.id }) }, 'Öffnen'),
      h('button', { class: 'btn small ghost', onclick: () => renameShow(s) }, 'Umbenennen'),
      h('button', { class: 'btn small ghost', onclick: () => duplicateShow(s) }, 'Als Vorlage kopieren'),
      s.current ? null : h('button', {
        class: 'btn small ghost icon', 'aria-label': `${s.name} löschen`,
        onclick: async () => { if (await ask(`Show „${s.name}“ mit allen Teams und Punkten löschen?`, { confirmLabel: 'Löschen', danger: true })) act('shows.remove', { showId: s.id }); },
      }, trashIcon())))),
    h('p', { style: { marginBottom: 0 } }, h('button', { class: 'btn', disabled: running, onclick: createShow }, '+ Neue Show')));
}

const trashIcon = () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<path fill="currentColor" d="M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 12H7L6 9Zm4 2v8h2v-8h-2Zm4 0v8h2v-8h-2Z"/>';
  return svg;
};

// Showablauf als Brett: Plätze 1–4 links, 5–8 rechts, Mülleimer in der Mitte.
function buildBoard() {
  const games = S.project.games;
  const running = S.live.activeGame !== null;
  const slots = Array.from({ length: S.showSize }, (_, i) => (games[i] ? buildSlot(games[i], i, running) : buildEmptySlot(i, running)));
  return card('Spiele der Show',
    h('p', { class: 'muted' }, 'Ziehe Spiele, um die Reihenfolge zu ändern. „Ersetzen“ schlägt dir andere Spiele aus der Datenbank vor, das Mülleimer-Symbol entfernt ein Spiel. Freie Plätze füllst du mit Spielen aus der Datenbank, auch mehrfach mit demselben Spiel. Nach Platz 4, 6 und 8 gibt es eine Münze.'),
    running ? h('p', { class: 'notice warn' }, 'Ein Spiel läuft gerade. Der Ablauf lässt sich erst nach dem Beenden ändern.') : null,
    games.length !== S.showSize ? h('p', { class: 'notice warn' }, `Die Show hat ${games.length} von ${S.showSize} Spielen. Vor dem Live-Start müssen alle ${S.showSize} Plätze belegt sein.`) : null,
    h('div', { class: 'board' },
      h('div', { class: 'slots' }, slots.slice(0, 4)),
      h('div', { class: 'slots' }, slots.slice(4))));
}

function slotDrop(index) {
  return {
    ondragover: (ev) => { ev.preventDefault(); ev.currentTarget.classList.add('over'); },
    ondragleave: (ev) => ev.currentTarget.classList.remove('over'),
    ondrop: (ev) => {
      ev.preventDefault();
      ev.currentTarget.classList.remove('over');
      const id = ev.dataTransfer.getData('text/plain');
      if (id && S.project.games.some((g) => g.id === id)) act('game.moveTo', { gameId: id, index: Math.min(index, S.project.games.length - 1) });
    },
  };
}

function buildSlot(g, i, running) {
  const pos = i + 1;
  const type = S.types[g.type];
  return h('article', {
    class: `slot ${g.id === selectedGame ? 'selected' : ''}`, draggable: running || g.locked ? 'false' : 'true',
    ondragstart: (ev) => { ev.dataTransfer.setData('text/plain', g.id); ev.dataTransfer.effectAllowed = 'move'; },
    ...slotDrop(i),
  },
  h('span', { class: 'slot-pos' }, pos),
  h('div', { class: 'slot-body' },
    h('b', { class: 'slot-title' }, g.title),
    h('span', { class: 'muted slot-type' }, g.title === type.title ? type.summary : type.title),
    h('div', { class: 'row', style: { gap: '6px' } },
      g.locked ? h('span', { class: 'badge warn' }, '🔒 Eröffnungsspiel') : null,
      S.coinPositions.includes(pos) ? h('span', { class: 'badge coin-badge' }, coinImg(), ' danach Münze') : null)),
  h('div', { class: 'slot-actions' },
    h('button', { class: `btn small ${g.id === selectedGame ? 'pink' : 'ghost'}`, onclick: () => { selectedGame = g.id; renderAll(true); } }, 'Bearbeiten'),
    h('button', { class: 'btn small ghost', disabled: running || g.locked || i === 0 || (i === 1 && S.project.games[0]?.locked), 'aria-label': `${g.title} nach oben`, onclick: () => act('game.moveTo', { gameId: g.id, index: i - 1 }) }, '↑'),
    h('button', { class: 'btn small ghost', disabled: running || g.locked || i === S.project.games.length - 1, 'aria-label': `${g.title} nach unten`, onclick: () => act('game.moveTo', { gameId: g.id, index: i + 1 }) }, '↓'),
    h('button', { class: 'btn small ghost', disabled: running, title: 'Durch ein anderes Spiel aus der Datenbank ersetzen', onclick: () => pickFromLibrary(i, g) }, '⇄ Ersetzen'),
    h('button', { class: 'btn small ghost icon', disabled: running, 'aria-label': `${g.title} entfernen`, title: 'Aus der Show entfernen', onclick: () => removeGame(g) }, trashIcon())));
}

function buildEmptySlot(i, running) {
  return h('div', { class: 'slot empty', ...slotDrop(i) },
    h('span', { class: 'slot-pos' }, i + 1),
    h('div', { class: 'slot-body' }, h('span', { class: 'muted' }, 'Freier Platz')),
    h('button', { class: 'btn small', disabled: running, onclick: () => pickFromLibrary(i) }, '+ Spiel aus Datenbank'));
}

async function removeGame(g) {
  if (S.live.activeGame !== null) return toast('Ein Spiel läuft gerade. Zuerst beenden.');
  if (g.locked) {
    const ok = await ask(`„${g.title}“ ist das feste Eröffnungsspiel. Willst du es per Sonderaktion aus der Show entfernen?`, { requireText: 'ENTFERNEN', confirmLabel: 'Entfernen', danger: true });
    if (ok) act('game.remove', { gameId: g.id, override: 'ENTFERNEN' });
    return;
  }
  if (await ask(`„${g.title}“ aus der Show entfernen? In der Spiele-Datenbank bleibt es erhalten.`, { confirmLabel: 'Entfernen', danger: true })) {
    act('game.remove', { gameId: g.id });
  }
}

// Hilfen für Datenbank und Auswahl: alphabetisch (deutsch), Suche, Platz in der Show.
const byTitle = (a, b) => a.title.localeCompare(b.title, 'de', { sensitivity: 'base' });
const norm = (x) => String(x || '').toLocaleLowerCase('de').normalize('NFD').replace(/[̀-ͯ]/g, '');
const matches = (q, ...texts) => !q || texts.some((t) => norm(t).includes(q));
function showPositions(libraryId) {
  return S.project.games.map((g, i) => (g.libraryId === libraryId ? i + 1 : null)).filter(Boolean);
}
// Ordner der Datenbank: Jede Spielart liegt in höchstens einem Ordner.
const folders = () => S.libraryFolders || [];
const folderOfType = (type) => { const id = (S.libraryFolderOf || {})[type]; return folders().some((f) => f.id === id) ? id : null; };
const inFolder = (type, fid) => fid === 'all' || (fid === 'none' ? !folderOfType(type) : folderOfType(type) === fid);
const validFolder = (fid) => fid === 'all' || fid === 'none' || folders().some((f) => f.id === fid);
const DRAG_TYPE = 'application/x-quiz-type';
const DRAG_FOLDER = 'application/x-quiz-folder';
// Ziel zum Ablegen einer Spielart (Drag & Drop) – Ordner-Knopf oder „Ohne Ordner“.
function folderDrop(fid, index) {
  const has = (ev, t) => [...(ev.dataTransfer?.types || [])].includes(t);
  return {
    ondragover: (ev) => { if (has(ev, DRAG_TYPE) || (has(ev, DRAG_FOLDER) && index !== undefined)) { ev.preventDefault(); ev.currentTarget.classList.add('over'); } },
    ondragleave: (ev) => { if (!ev.currentTarget.contains(ev.relatedTarget)) ev.currentTarget.classList.remove('over'); },
    ondrop: (ev) => {
      ev.preventDefault();
      ev.currentTarget.classList.remove('over');
      const type = ev.dataTransfer.getData(DRAG_TYPE);
      const folder = ev.dataTransfer.getData(DRAG_FOLDER);
      if (type) {
        if (fid === 'all') return;
        const target = fid === 'none' ? null : fid;
        if (folderOfType(type) === target) return;
        act('folder.assign', { type, folderId: target }).then((r) => r && toast(`„${S.types[type].title}“ → ${target ? folders().find((f) => f.id === target)?.name : 'Ohne Ordner'}`, 'info'));
      } else if (folder && index !== undefined && folder !== fid) act('folder.move', { folderId: folder, index });
    },
  };
}

// Titel eines Eintrags: Hauptzeile = Name des Eintrags, darunter die Spielart nur, wenn sie anders heißt.
function entryHead(e) {
  const t = S.types[e.type];
  return [h('b', { class: 'ec-title' }, e.title), e.title !== t.title ? h('span', { class: 'ec-kind' }, `Spielart: ${t.title}`) : null];
}

// Auswahl aus der Datenbank: für einen freien Platz oder zum Ersetzen eines Spiels.
// Jeder Eintrag erscheint genau einmal. Beim Ersetzen stehen andere Einträge derselben
// Spielart oben; Spiele, die schon in der Show sind, sind markiert.
let pickSearch = '';
let pickHideUsed = false;
let pickFolder = 'all';
function pickFromLibrary(index, replace = null) {
  const overlay = h('div', { class: 'modal-backdrop', onclick: (ev) => ev.target === overlay && overlay.remove() });
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (ev) => { if (ev.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  const choose = async (e) => {
    close();
    const r = replace ? await act('game.replace', { gameId: replace.id, libraryId: e.id }) : await act('game.add', { libraryId: e.id, index });
    if (r) selectedGame = r.created || null;
  };
  const pickCard = (e) => {
    const t = S.types[e.type];
    const isCurrent = replace && e.id === replace.libraryId;
    const pos = showPositions(e.id);
    return h('button', { class: `pick-card${isCurrent ? ' current' : ''}${pos.length && !isCurrent ? ' used' : ''}`, disabled: isCurrent, onclick: () => choose(e), title: t.summary },
      h('span', { class: 'pk-head' }, ...entryHead(e)),
      pickFolder === 'all' || pickSearch.trim() ? h('span', { class: 'pk-folder' }, `📁 ${folders().find((f) => f.id === folderOfType(e.type))?.name || 'Ohne Ordner'}`) : null,
      h('span', { class: 'pk-sum' }, t.summary),
      h('span', { class: 'pk-tags' },
        isCurrent ? h('span', { class: 'tag cur' }, 'Aktuell auf diesem Platz')
          : pos.length ? h('span', { class: 'tag used' }, `Schon in der Show · Platz ${pos.join(', ')}`)
            : h('span', { class: 'tag free' }, 'Noch nicht in der Show')));
  };
  const listBox = h('div', { class: 'pick-list' });
  const chipBox = h('div', { class: 'folder-chips', role: 'tablist', 'aria-label': 'Ordner' });
  // Beim Ersetzen öffnet sich der Ordner des aktuellen Spiels.
  pickFolder = replace ? (folderOfType(replace.type) || 'all') : validFolder(pickFolder) ? pickFolder : 'all';
  const renderChips = () => {
    const count = (fid) => S.library.filter((e) => inFolder(e.type, fid)).length;
    const chip = (fid, label) => h('button', { role: 'tab', class: `fchip${pickFolder === fid ? ' on' : ''}`, 'aria-selected': String(pickFolder === fid),
      onclick: () => { pickFolder = fid; renderChips(); render(); } }, label, h('span', { class: 'n' }, count(fid)));
    const none = count('none');
    chipBox.replaceChildren(...[chip('all', 'Alle'), ...folders().map((f) => chip(f.id, f.name)), none ? chip('none', 'Ohne Ordner') : null].filter(Boolean));
  };
  const render = () => {
    const q = norm(pickSearch.trim());
    // Beim Suchen wird in allen Ordnern gesucht.
    const all = [...S.library].sort(byTitle).filter((e) => (q ? true : inFolder(e.type, pickFolder))).filter((e) => matches(q, e.title, S.types[e.type].title, S.types[e.type].summary))
      .filter((e) => !pickHideUsed || !showPositions(e.id).length || (replace && e.id === replace.libraryId));
    const same = replace ? all.filter((e) => e.type === replace.type && e.id !== replace.libraryId) : [];
    const rest = all.filter((e) => !same.includes(e) && !(replace && e.id === replace.libraryId));
    const sections = [];
    if (same.length) sections.push(h('section', { class: 'pick-group' }, h('h4', {}, 'Gleiche Spielart, andere Inhalte'), h('div', { class: 'pick-grid' }, same.map(pickCard))));
    if (rest.length) sections.push(h('section', { class: 'pick-group' }, same.length ? h('h4', {}, 'Alle anderen Spiele') : null, h('div', { class: 'pick-grid' }, rest.map(pickCard))));
    if (!sections.length) sections.push(h('p', { class: 'muted' }, q ? `Kein Spiel passt zu „${pickSearch.trim()}“.` : 'In diesem Ordner liegt kein passendes Spiel.'));
    listBox.replaceChildren(...sections);
  };
  const search = h('input', { type: 'search', class: 'pick-search', placeholder: 'Spiel suchen …', value: pickSearch, oninput: (ev) => { pickSearch = ev.target.value; render(); } });
  const hide = h('label', { class: 'pick-toggle' }, h('input', { type: 'checkbox', checked: pickHideUsed, onchange: (ev) => { pickHideUsed = ev.target.checked; render(); } }), 'Spiele aus der Show ausblenden');
  overlay.append(h('div', { class: 'modal card wide pick-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Spiel aus Datenbank wählen' },
    h('div', { class: 'row', style: { justifyContent: 'space-between' } },
      h('div', {}, h('h3', { style: { margin: 0 } }, replace ? `Platz ${index + 1} ersetzen` : `Platz ${index + 1} füllen`),
        replace ? h('span', { class: 'muted' }, `Aktuell: „${replace.title}“ – tippe auf ein Spiel, um es zu ersetzen.`) : h('span', { class: 'muted' }, 'Tippe auf ein Spiel, um es einzusetzen.')),
      h('button', { class: 'btn small ghost', onclick: close }, 'Schließen')),
    h('div', { class: 'pick-tools' }, search, hide),
    chipBox,
    listBox));
  renderChips();
  render();
  document.body.append(overlay);
  search.focus();
}

// ---------- Spiele-Datenbank ----------

let libSearch = '';
let libFolder = store('quiz.libFolder') || 'all';
let renamingFolder = null;
function setLibFolder(fid) { libFolder = fid; store('quiz.libFolder', fid); renderAll(true); }

function buildFolderBar(types) {
  const countTypes = (fid) => types.filter((t) => inFolder(t.type, fid)).length;
  const item = (fid, label, extra = {}) => h('li', { class: `fold${libFolder === fid ? ' on' : ''}`, ...folderDrop(fid, extra.index), draggable: extra.folder ? 'true' : null,
    ondragstart: extra.folder ? (ev) => { ev.dataTransfer.setData(DRAG_FOLDER, fid); ev.dataTransfer.effectAllowed = 'move'; } : null },
    renamingFolder === fid
      ? h('input', { class: 'fold-input', value: label, maxlength: 40, 'aria-label': 'Ordnername',
        onkeydown: (ev) => { if (ev.key === 'Enter') ev.target.blur(); if (ev.key === 'Escape') { renamingFolder = null; renderAll(true); } },
        onblur: (ev) => { const v = ev.target.value.trim(); renamingFolder = null; if (v && v !== label) act('folder.rename', { folderId: fid, name: v }); else renderAll(true); } })
      : h('button', { class: 'fold-btn', onclick: () => setLibFolder(fid), ondblclick: extra.folder ? () => { renamingFolder = fid; renderAll(true); } : null, title: extra.folder ? 'Doppelklick zum Umbenennen · Spiele hierher ziehen' : '' },
        h('span', { class: 'fold-ic' }, fid === 'all' ? '🗂' : fid === 'none' ? '📄' : libFolder === fid ? '📂' : '📁'), h('span', { class: 'fold-name' }, label), h('span', { class: 'n' }, countTypes(fid))),
    extra.folder && renamingFolder !== fid ? h('span', { class: 'fold-tools' },
      h('button', { class: 'fold-mini', title: 'Umbenennen', 'aria-label': `${label} umbenennen`, onclick: () => { renamingFolder = fid; renderAll(true); } }, '✎'),
      h('button', { class: 'fold-mini', title: 'Ordner löschen (Spiele bleiben erhalten)', 'aria-label': `${label} löschen`, onclick: async () => {
        if (await ask(`Ordner „${label}“ löschen? Die Spiele darin bleiben erhalten und landen unter „Ohne Ordner“.`, { confirmLabel: 'Ordner löschen', danger: true })) {
          await act('folder.remove', { folderId: fid });
          if (libFolder === fid) setLibFolder('all');
        }
      } }, '🗑')) : null);
  const none = countTypes('none');
  return h('aside', { class: 'card lib-folders' },
    h('div', { class: 'lib-folders-head' }, h('b', {}, 'Ordner'),
      h('button', { class: 'btn small ghost', onclick: async () => { const r = await act('folder.add', { name: 'Neuer Ordner' }); const id = r?.data?.created; if (id) { renamingFolder = id; libFolder = id; store('quiz.libFolder', id); renderAll(true); } } }, '+ Neuer Ordner')),
    h('ul', { class: 'fold-list' },
      item('all', 'Alle Spiele'),
      folders().map((f, i) => item(f.id, f.name, { folder: true, index: i })),
      none || libFolder === 'none' ? item('none', 'Ohne Ordner') : null),
    h('p', { class: 'muted fold-hint' }, 'Spiel an der ⠿-Leiste packen und auf einen Ordner ziehen. Doppelklick auf einen Ordner benennt ihn um, Ordner lassen sich auch untereinander verschieben.'));
}

function buildLibrary() {
  if (!S.library.some((e) => e.id === selectedEntry)) selectedEntry = null;
  if (!validFolder(libFolder)) libFolder = 'all';
  const sel = S.library.find((e) => e.id === selectedEntry);
  const q = norm(libSearch.trim());
  const full = S.project.games.length >= S.showSize;
  // Eine Karte je Spielart, alphabetisch; „… 2.0“ steht so direkt neben dem Original.
  const types = Object.entries(S.types).map(([type, t]) => ({ type, ...t })).sort(byTitle);
  // Beim Suchen wird in allen Ordnern gesucht.
  const visible = types.filter((t) => (q ? true : inFolder(t.type, libFolder)));
  const groups = visible.map((t) => {
    const entries = S.library.filter((e) => e.type === t.type).sort(byTitle);
    const shown = entries.filter((e) => matches(q, e.title, t.title, t.summary));
    if (q && !shown.length && !matches(q, t.title, t.summary)) return null;
    const fname = folders().find((f) => f.id === folderOfType(t.type))?.name;
    return h('section', { class: 'card lib-group', draggable: 'true',
      ondragstart: (ev) => {
        ev.dataTransfer.setData(DRAG_TYPE, t.type); ev.dataTransfer.effectAllowed = 'move'; ev.currentTarget.classList.add('dragging'); document.body.classList.add('dragging-type'); },
      ondragend: (ev) => { ev.currentTarget.classList.remove('dragging'); document.body.classList.remove('dragging-type'); } },
      h('div', { class: 'lib-head' },
        h('span', { class: 'lib-grip', title: 'Ziehen, um in einen Ordner zu legen', 'aria-hidden': 'true' }, '⠿'),
        h('h3', {}, t.title),
        h('button', { class: 'btn small ghost', title: `Neuen Eintrag „${t.title}“ anlegen`, onclick: () => act('library.add', { type: t.type }).then((r) => { if (r) selectedEntry = null; }) }, '+ Variante')),
      libFolder === 'all' || q ? h('span', { class: 'pk-folder' }, `📁 ${fname || 'Ohne Ordner'}`) : null,
      h('p', { class: 'muted lib-sum' }, t.summary),
      shown.length ? h('ul', { class: 'lib-entries' }, shown.map((e) => {
        const pos = showPositions(e.id);
        return h('li', { class: e.id === selectedEntry ? 'active' : '' },
          h('button', { class: 'lib-name', onclick: () => { selectedEntry = e.id; renderAll(true); } },
            h('b', {}, e.title), pos.length ? h('span', { class: 'tag used' }, `in der Show · Platz ${pos.join(', ')}`) : null),
          h('span', { class: 'lib-actions' },
            h('button', { class: `btn small ${e.id === selectedEntry ? 'pink' : 'ghost'}`, onclick: () => { selectedEntry = e.id; renderAll(true); } }, 'Bearbeiten'),
            h('button', { class: 'btn small ghost', title: 'Kopie mit gleichen Inhalten anlegen', onclick: () => act('library.duplicate', { libraryId: e.id }) }, 'Duplizieren'),
            h('button', { class: 'btn small ghost', disabled: full || S.live.activeGame !== null, title: full ? 'Die Show ist voll. Zuerst ein Spiel aus der Show entfernen oder im Show-Editor „Ersetzen“ nutzen.' : 'Auf den nächsten freien Platz der Show setzen', onclick: () => act('game.add', { libraryId: e.id }).then((r) => r && toast(`„${e.title}“ in die Show eingesetzt`, 'info')) }, '+ Show'),
            h('button', { class: 'btn small ghost icon', 'aria-label': `${e.title} löschen`, title: 'Aus der Datenbank löschen', onclick: async () => { if (await ask(`„${e.title}“ aus der Datenbank löschen? Spiele, die schon in der Show sind, bleiben erhalten.`, { confirmLabel: 'Löschen', danger: true })) act('library.remove', { libraryId: e.id }); } }, trashIcon())));
      })) : h('p', { class: 'muted' }, 'Noch kein Eintrag – „+ Variante“ legt einen an.'));
  }).filter(Boolean);
  const search = h('input', { type: 'search', class: 'pick-search', placeholder: 'In allen Ordnern suchen …', value: libSearch,
    oninput: (ev) => { libSearch = ev.target.value; const pos = ev.target.selectionStart; renderAll(true); const n = document.querySelector('.lib-tools .pick-search'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } } });
  const title = q ? `Suche: „${libSearch.trim()}“` : libFolder === 'all' ? 'Alle Spiele' : libFolder === 'none' ? 'Ohne Ordner' : folders().find((f) => f.id === libFolder)?.name;
  const view = [
    h('div', { class: 'row', style: { justifyContent: 'space-between', marginBottom: '12px' } }, h('h2', { style: { margin: 0 } }, 'Spiele-Datenbank'), saveIndicator()),
    sel ? buildGameEditor('library', sel) : null,
    h('div', { class: 'lib-layout' },
      buildFolderBar(types),
      h('div', { class: 'lib-main' },
        h('div', { class: 'lib-tools' }, h('h3', { class: 'lib-title' }, title, h('span', { class: 'muted' }, ` · ${groups.length} ${groups.length === 1 ? 'Spielart' : 'Spielarten'}`)), search),
        groups.length ? h('div', { class: 'grid lib-grid' }, groups)
          : h('p', { class: 'muted lib-empty', ...(q ? {} : folderDrop(libFolder)) }, q ? `Kein Spiel passt zu „${libSearch.trim()}“.` : 'Dieser Ordner ist leer. Ziehe Spiele aus „Alle Spiele“ auf den Ordner links.'))),
  ];
  // Eingabefeld beim Umbenennen direkt fokussieren.
  if (renamingFolder) setTimeout(() => { const n = document.querySelector('.fold-input'); if (n && document.activeElement !== n) { n.focus(); n.select(); } }, 0);
  return view;
}

// ---------- Formular-Editor für Spielinhalte ----------

function buildGameEditor(kind, item) {
  const key = `${kind}.${item.id}`;
  let d = drafts.get(key);
  if (!d || !(saveState.pending.has(key) || saveState.saving)) {
    d = { title: item.title, content: structuredClone(item.content) };
    drafts.set(key, d);
  }
  const type = S.types[item.type];
  editorContent = d.content;
  const save = () => autosave(key, () => (kind === 'game'
    ? act('game.update', { gameId: item.id, title: d.title, content: d.content })
    : act('library.update', { libraryId: item.id, title: d.title, content: d.content })));
  const rerender = () => { save(); renderAll(true); };
  const running = kind === 'game' && S.live.activeGame === item.id;
  const pos = kind === 'game' ? S.project.games.indexOf(item) + 1 : null;

  return h('section', { class: 'card editor', style: { marginTop: '16px' } },
    h('div', { class: 'row', style: { justifyContent: 'space-between' } },
      h('h3', { style: { margin: 0 } }, kind === 'game' ? `Platz ${pos} bearbeiten: ${type.title}` : `Datenbank-Eintrag bearbeiten: ${type.title}`),
      kind === 'game'
        ? h('button', { class: 'btn small ghost', onclick: () => act('library.saveFromShow', { gameId: item.id }).then((r) => r && toast('Als neuer Eintrag in der Datenbank gespeichert', 'info')) }, 'In Datenbank speichern')
        : h('span', { class: 'muted' }, `Version ${item.version}`)),
    h('p', { class: 'muted' }, kind === 'game'
      ? 'Änderungen gelten nur für diese Show. Der Eintrag in der Datenbank bleibt unverändert.'
      : 'Änderungen gelten für künftige Shows. Spiele, die schon in einer Show sind, bleiben unverändert.'),
    running ? h('p', { class: 'notice warn' }, 'Dieses Spiel läuft gerade. Inhalte erst nach dem Beenden ändern.') : null,
    kind === 'game' ? titleColorPicker(`Farbe der Spieltitel-Folie für Spiel ${pos}`, item.color, GAME_COLORS[(pos - 1) % GAME_COLORS.length], String(pos), (color) => act('game.setColor', { gameId: item.id, color })) : null,
    kind === 'game' ? buildGameIntro(item, pos) : buildGameIntro(item, `„${item.title}“`, (media) => act('library.setIntro', { libraryId: item.id, media })),
    item.type === 'zuweit' ? buildDatasetInfo() : null,
    h('fieldset', { disabled: running, class: 'plain' },
      h('label', { for: `${key}-title` }, kind === 'game' ? 'Name des Spiels in dieser Show (erscheint im Spieltitel auf dem Beamer)' : 'Name des Spiels (wird beim Einsetzen in eine Show übernommen)'),
      h('input', { id: `${key}-title`, value: d.title, maxlength: '80', oninput: (ev) => { d.title = ev.target.value; save(); } }),
      (previewTarget = { key, type: item.type, d }, formFields(type.schema, d.content, save, rerender, key))));
}

// Beamer-Vorschau im Editor: zeigt eine Frage/Runde so, wie sie auf dem Beamer
// erscheint – mit den aktuellen (auch noch nicht gespeicherten) Inhalten.
let previewTarget = null;
function previewButton(t, index, label) {
  return h('div', { style: { marginBottom: '8px' } },
    h('button', { type: 'button', class: 'btn small ghost', onclick: () => openPreview(t, index, label) }, '👁 So sieht es auf dem Beamer aus'));
}
function loadPage(frame, url) {
  if (!localServer) { frame.src = url; return; }
  // Prototyp: die Seite kommt von der Hauptseite (wie bei der Live-Vorschau).
  const reqId = `p${Math.random().toString(36).slice(2)}`;
  const on = (ev) => {
    const m = ev.data;
    if (!m || m.quiz !== true || m.op !== 'page' || m.reqId !== reqId) return;
    window.removeEventListener('message', on);
    frame.srcdoc = m.html;
  };
  window.addEventListener('message', on);
  window.parent.postMessage({ quiz: true, op: 'page', reqId, url }, '*');
}
async function openPreview(t, index, label) {
  const res = await act('preview.beamer', { type: t.type, title: t.d.title, content: t.d.content, index });
  if (!res || !res.data) return;
  const frame = h('iframe', { class: 'preview-frame', title: 'Beamer-Vorschau' });
  const note = res.data.note ? h('p', { class: 'muted' }, `Hinweis: ${res.data.note}`) : null;
  const send = () => frame.contentWindow && frame.contentWindow.postMessage({ quizDemo: 'state', state: res.data.state }, '*');
  const onReady = (ev) => { if (ev.source === frame.contentWindow && ev.data && ev.data.quizDemo === 'ready') send(); };
  window.addEventListener('message', onReady);
  const close = showModal(`Beamer-Vorschau · ${label}`, [frame, note, h('p', { class: 'muted', style: { marginBottom: 0 } }, 'So sieht die Frage zu Beginn auf dem Beamer aus (ohne Ton). Änderungen im Editor erscheinen beim nächsten Öffnen der Vorschau.')], { wide: true });
  frame.addEventListener('load', () => setTimeout(send, 300));
  loadPage(frame, 'beamer.html?demo');
  void close;
}

// Welche Fragen/Einträge im Editor aufgeklappt sind (pro Feld gemerkt).
const ITEM_OPEN = new Map();

function formFields(fields, obj, save, rerender, idBase) {
  const out = fields.map((f) => formField(f, obj, f.key, save, rerender, `${idBase}-${f.key}`));
  // Orte mit Breiten- und Längengrad: zusätzlich auf der Karte antippen.
  if (fields.some((f) => f.key === 'lat') && fields.some((f) => f.key === 'lng')) out.push(geoPicker(obj, save, idBase));
  return out;
}

// Karte im Editor: Antippen setzt Breiten- und Längengrad des gesuchten Orts.
let editorContent = null; // Inhalt des gerade bearbeiteten Spiels (für die Standard-Karte)
const MAP_BOUNDS = { Europa: [34, 71.5, -25, 45], Deutschland: [46.8, 55.4, 4.5, 16.5] };
function geoPicker(item, save, idBase) {
  const box = h('div', { class: 'map-box geo-pick' });
  const zoom = zoomState(); // zum genauen Antippen zoomen (+/−, Mausrad)
  const note = h('p', { class: 'muted', style: { margin: '6px 0 0' } });
  const mapName = () => (['Welt', 'Europa', 'Deutschland'].includes(item.map) ? item.map : (editorContent && editorContent.map) || 'Welt');
  const draw = () => {
    const name = mapName();
    const has = Number.isFinite(item.lat) && Number.isFinite(item.lng);
    box.replaceChildren(mapView(name, {
      markers: has ? [{ lat: item.lat, lng: item.lng, kind: 'target', label: item.target || 'Ziel' }] : [],
      label: `Karte ${name} – Ort antippen`,
      zoom,
      onPick: ({ lat, lng }) => {
        item.lat = lat;
        item.lng = lng;
        for (const [k, v] of [['lat', lat], ['lng', lng]]) { const inp = document.getElementById(`${idBase}-${k}`); if (inp) inp.value = v; }
        save();
        draw();
      },
    }));
    const b = MAP_BOUNDS[name];
    const outside = has && b && (item.lat < b[0] || item.lat > b[1] || item.lng < b[2] || item.lng > b[3]);
    note.textContent = outside
      ? `⚠ Der Ort liegt außerhalb der Karte „${name}“ – bitte andere Karte wählen oder neu antippen.`
      : `Karte „${name}“: Ort antippen, um Breiten- und Längengrad zu setzen. Feinkorrektur in den Feldern oben.`;
    note.style.color = outside ? 'var(--bad)' : '';
  };
  draw();
  // Bei Änderung der Karte oder der Zahlen die Vorschau nachziehen.
  setTimeout(() => {
    const sel = document.getElementById(`${idBase}-map`);
    if (sel) sel.addEventListener('change', draw);
    for (const k of ['lat', 'lng']) document.getElementById(`${idBase}-${k}`)?.addEventListener('change', draw);
  }, 0);
  return h('div', { class: 'field geo-field' }, h('label', {}, 'Ort auf der Karte'), box, note);
}

// Beschriftung einer Auswahl-Option. Mit optionSource kommt sie aus einer Liste
// desselben Spiels (z. B. umbenannte Joker aus der Joker-Datenbank).
const atPath = (obj, path) => (path || []).reduce((o, k) => (o == null ? o : o[k]), obj);
function optionLabel(f, j) {
  const src = f.optionSource;
  const item = src && atPath(previewTarget?.d?.content, src.path)?.[j];
  if (item && (item.name || '').trim()) return `${(item.icon || '').trim()} ${item.name.trim()}`.trim();
  return f.optionLabels ? f.optionLabels[j] : f.options[j];
}
function itemPreview(fields, item) {
  for (const sf of fields || []) {
    const v = item[sf.key];
    if (sf.type === 'select' && sf.optionLabels && sf.options.includes(v)) return optionLabel(sf, sf.options.indexOf(v));
    if (typeof v === 'string' && v.trim()) return v;
  }
  return 'noch leer';
}

function formField(f, holder, k, save, rerender, id) {
  const set = (v) => { holder[k] = v; save(); };
  switch (f.type) {
    case 'text':
      return h('div', { class: 'field' }, h('label', { for: id }, f.label), h('input', { id, value: holder[k] ?? '', maxlength: String(f.max), oninput: (ev) => set(ev.target.value) }));
    case 'textarea':
      return h('div', { class: 'field' }, h('label', { for: id }, f.label), h('textarea', { id, rows: String(f.rows || 2), maxlength: String(f.max), oninput: (ev) => set(ev.target.value) }, holder[k] ?? ''));
    case 'number':
      return h('div', { class: 'field' }, h('label', { for: id }, f.label), h('input', { id, type: 'number', min: String(f.min), max: String(f.max), step: String(f.step || 1), value: holder[k] ?? '', placeholder: f.placeholder ?? '', oninput: (ev) => set(ev.target.value === '' ? null : Number(ev.target.value)) }));
    case 'select': {
      // unique: in den anderen Einträgen derselben Liste schon gewählte Optionen sind gesperrt.
      const others = f.optionSource?.unique ? (atPath(previewTarget?.d?.content, f.optionSource.unique) || []).filter((x) => x !== holder).map((x) => x && x[f.key]) : [];
      const sel = h('select', { id, onchange: (ev) => { set(ev.target.value); if (f.optionLabels) rerender(); } },
        f.options.map((o, j) => h('option', { value: o, disabled: others.includes(o) && o !== holder[k] }, `${optionLabel(f, j)}${others.includes(o) ? ' (schon auf dem Rad)' : ''}`)));
      sel.value = holder[k] ?? f.options[0];
      return h('div', { class: 'field' }, h('label', { for: id }, f.label), sel);
    }
    case 'object':
      holder[k] = holder[k] || {};
      return h('fieldset', { class: `group${f.sideClass ? ` ${f.sideClass}` : ''}` }, h('legend', {}, f.label), h('div', { class: f.stack ? 'field-stack' : 'field-grid' }, formFields(f.fields, holder[k], save, rerender, id)));
    case 'list': {
      const arr = (holder[k] = holder[k] && holder[k].length ? holder[k] : structuredClone(f.defaultItems || []));
      const canChange = f.min !== f.max;
      // Reihenfolge per Ziehen (oder ↑/↓) ändern: die gespeicherte Reihenfolge ist die Spielreihenfolge.
      const move = (from, to) => {
        if (to < 0 || to >= arr.length || from === to) return;
        const flags = arr.map((_, j) => ITEM_OPEN.get(`${id}-${j}`));
        const [x] = arr.splice(from, 1);
        arr.splice(to, 0, x);
        const [fl] = flags.splice(from, 1);
        flags.splice(to, 0, fl);
        flags.forEach((v, j) => (v === undefined ? ITEM_OPEN.delete(`${id}-${j}`) : ITEM_OPEN.set(`${id}-${j}`, v)));
        rerender();
      };
      const sortable = f.of !== 'text' && arr.length > 1 && !f.fixedOrder;
      const dragAttrs = (i) => (sortable ? {
        ondragover: (ev) => { if ([...ev.dataTransfer.types].includes('text/x-quiz-item')) { ev.preventDefault(); ev.stopPropagation(); ev.currentTarget.classList.add('drop-here'); } },
        ondragleave: (ev) => ev.currentTarget.classList.remove('drop-here'),
        ondrop: (ev) => {
          ev.currentTarget.classList.remove('drop-here');
          const [lid, from] = (ev.dataTransfer.getData('text/x-quiz-item') || '').split('|');
          if (lid !== id) return;
          ev.preventDefault();
          ev.stopPropagation();
          move(Number(from), i);
        },
      } : {});
      const moveBtns = (i) => (sortable ? h('span', { class: 'item-move' },
        // Nur der Griff ist ziehbar – so bleibt Text in den Feldern normal markierbar.
        h('span', { class: 'drag-handle', title: 'Ziehen zum Umsortieren', draggable: 'true',
          ondragstart: (ev) => { ev.stopPropagation(); ev.dataTransfer.setData('text/x-quiz-item', `${id}|${i}`); ev.dataTransfer.effectAllowed = 'move'; ev.currentTarget.closest('details')?.classList.add('dragging-item'); },
          ondragend: (ev) => ev.currentTarget.closest('details')?.classList.remove('dragging-item') }, '⠿'),
        h('button', { type: 'button', class: 'btn small ghost', title: 'Nach oben', disabled: i === 0, onclick: (ev) => { ev.preventDefault(); ev.stopPropagation(); move(i, i - 1); } }, '↑'),
        h('button', { type: 'button', class: 'btn small ghost', title: 'Nach unten', disabled: i === arr.length - 1, onclick: (ev) => { ev.preventDefault(); ev.stopPropagation(); move(i, i + 1); } }, '↓')) : null);
      const items = arr.map((item, i) => {
        const label = f.itemLabels[i] || `${i + 1}`;
        const remove = canChange && arr.length > f.min
          ? h('button', { type: 'button', class: 'btn small ghost icon', 'aria-label': `${label} entfernen`, onclick: () => { arr.splice(i, 1); rerender(); } }, trashIcon())
          : null;
        if (f.of === 'text') {
          return h('div', { class: 'field list-text' }, h('label', { for: `${id}-${i}` }, label),
            h('div', { class: 'row', style: { flexWrap: 'nowrap' } }, h('input', { id: `${id}-${i}`, value: item ?? '', maxlength: String(f.maxLength || 300), oninput: (ev) => { arr[i] = ev.target.value; save(); } }), remove));
        }
        const preview = itemPreview(f.fields, item);
        // Auf-/Zugeklappt bleibt erhalten, auch wenn der Editor neu gezeichnet wird.
        const openKey = `${id}-${i}`;
        const isOpen = ITEM_OPEN.has(openKey) ? ITEM_OPEN.get(openKey) : arr.length <= 3;
        return h('details', { class: 'item', open: isOpen, ontoggle: (ev) => ITEM_OPEN.set(openKey, ev.target.open), ...dragAttrs(i) },
          h('summary', {}, moveBtns(i), h('b', {}, label), h('span', { class: 'muted' }, ` · ${preview.slice(0, 60)}`)),
          h('div', { class: 'item-body' },
            previewTarget && !f.noPreview && id === `${previewTarget.key}-${f.key}` ? previewButton(previewTarget, i, label) : null,
            formFields(f.fields, item, save, rerender, `${id}-${i}`), remove ? h('div', { style: { marginTop: '8px' } }, remove) : null));
      });
      const add = canChange && arr.length < f.max
        ? h('button', { type: 'button', class: 'btn small', onclick: () => { ITEM_OPEN.set(`${id}-${arr.length}`, true); arr.push(f.of === 'text' ? '' : emptyItem(f.fields)); rerender(); } }, `+ ${f.addLabel || 'Eintrag hinzufügen'}`)
        : null;
      return h('fieldset', { class: 'group' }, h('legend', {}, f.label, canChange ? h('span', { class: 'muted' }, ` (${arr.length} von max. ${f.max})`) : null), h('div', { class: f.of === 'text' ? 'field-grid' : 'items' }, items), add);
    }
    case 'media':
      return mediaField(f, holder, k, save, rerender, id);
    default:
      return null;
  }
}

// Datei-Feld (Video, Audio, Bild): hochladen, Vorschau, austauschen, entfernen.
// Die Datei liegt im Medienspeicher der Anwendung, im Spiel steht nur der Verweis.
const MEDIA_ACCEPT = {
  video: 'video/mp4,video/webm,video/quicktime,video/x-m4v,.mp4,.mov,.webm,.m4v',
  audio: 'audio/*,video/mp4,video/quicktime,video/x-m4v,.mp3,.m4a,.wav,.ogg,.aac,.flac,.mp4,.m4v,.mov',
  image: 'image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp',
};
const mediaUploads = new Map(); // Feld-ID -> { name, progress }
function mediaField(f, holder, k, save, rerender, id) {
  const m = holder[k] || null;
  const fmtSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
  const busy = mediaUploads.get(id);
  const input = h('input', {
    id, type: 'file', accept: MEDIA_ACCEPT[f.accept] || '', class: 'visually-hidden', 'aria-label': `${f.label} wählen`,
    onchange: async (ev) => {
      const file = ev.target.files && ev.target.files[0];
      ev.target.value = '';
      if (!file) return;
      if (f.accept === 'image' && !/^image\/(png|jpeg|webp)$/.test(file.type)) return toast('Bitte ein Bild als PNG, JPEG oder WebP wählen.');
      if (f.accept === 'video' && !/^video\//.test(file.type)) return toast('Bitte ein Video (MP4, MOV, WebM) wählen.');
      if (f.accept === 'audio' && !/^(audio|video)\//.test(file.type)) return toast('Bitte eine MP3- oder MP4-Datei wählen.');
      mediaUploads.set(id, { name: file.name, progress: 0 });
      renderAll(true);
      try {
        const up = await uploadMedia(file, token, (p) => {
          const st = mediaUploads.get(id);
          if (st) st.progress = p;
          const bar = document.getElementById(`${id}-progress`);
          if (bar) bar.value = p;
        });
        holder[k] = { id: up.id, type: up.type, name: file.name, size: up.size };
        save();
      } catch (err) {
        toast(err.message);
      } finally {
        mediaUploads.delete(id);
        renderAll(true);
      }
    },
  });
  let preview = null;
  if (m) {
    const tag = m.type.startsWith('image') ? 'img' : f.accept === 'audio' || m.type.startsWith('audio') ? 'audio' : 'video';
    preview = h(tag, tag === 'img' ? { class: 'media-preview img', alt: f.label } : { class: `media-preview ${tag}`, controls: true, preload: 'metadata' });
    mediaUrl(m.id).then((url) => {
      if (url) preview.src = url;
      else preview.replaceWith(h('p', { class: 'notice warn' }, 'Die Datei ist auf diesem Gerät nicht mehr vorhanden – bitte neu hochladen.'));
    });
  }
  return h('div', { class: 'field media-field' },
    h('label', { for: id }, f.label),
    busy
      ? h('div', {}, h('p', {}, `„${busy.name}“ wird hochgeladen …`), h('progress', { id: `${id}-progress`, max: '1', value: String(busy.progress), style: { width: '100%' } }))
      : h('div', { class: 'media-row' },
        preview,
        h('div', { class: 'media-info' },
          h('span', { class: m ? '' : 'muted' }, m ? `${m.name}${m.size ? ` · ${fmtSize(m.size)}` : ''}` : 'Noch keine Datei'),
          h('div', { class: 'row' },
            h('label', { class: 'btn small' }, input, m ? 'Austauschen' : '+ Datei hochladen'),
            m ? h('button', { type: 'button', class: 'btn small ghost', onclick: () => { holder[k] = null; rerender(); } }, 'Entfernen') : null))));
}

function emptyItem(fields) {
  const out = {};
  for (const f of fields) {
    if (f.type === 'object') out[f.key] = emptyItem(f.fields);
    else if (f.type === 'list') out[f.key] = Array.from({ length: f.min }, () => (f.of === 'text' ? '' : emptyItem(f.fields)));
    else if (f.type === 'select') out[f.key] = f.options[0];
    else if (f.type === 'number') out[f.key] = null;
    else if (f.type === 'media') out[f.key] = null;
    else out[f.key] = '';
  }
  return out;
}

// ---------- Punkte & Protokoll ----------

function buildPoints() {
  const ledger = [...S.ledger].reverse();
  const fmt = (ts) => new Date(ts).toLocaleTimeString('de-DE');
  return [
    h('div', { class: 'grid two' },
      card('Punkte korrigieren',
        h('form', {
          onsubmit: (ev) => {
            ev.preventDefault();
            const f = ev.target.elements;
            act('points.adjust', { teamId: f.team.value, points: Number(f.points.value), reason: f.reason.value }).then((ok) => ok && ev.target.reset());
          },
        },
        h('label', {}, 'Team'), h('select', { name: 'team', required: true }, S.project.teams.map((t) => h('option', { value: t.id }, t.name))),
        h('label', {}, 'Punkte (z. B. 1 oder -1)'), h('input', { name: 'points', type: 'number', step: '1', required: true }),
        h('label', {}, 'Begründung (Pflicht, wird protokolliert)'), h('input', { name: 'reason', maxlength: '160', required: true }),
        h('p', {}, h('button', { class: 'btn', type: 'submit' }, 'Buchen')))),
      card('Show neu starten',
        h('p', { class: 'muted' }, 'Alle Punkte und Münzen auf 0, alle Fragen wieder unbeantwortet und ohne Auflösung, zurück zur ersten Folie. Teams, Editor, Spieledatenbank, Ablauf und Medien bleiben erhalten.'),
        h('button', { class: 'btn bad', onclick: restartShow }, 'Show neu starten …'))),
    card('Punktebuchungen',
      h('p', { class: 'muted' }, '„Rückgängig“ löscht nichts, sondern erzeugt eine Gegenbuchung.'),
      ledger.length ? h('table', {}, h('thead', {}, h('tr', {}, h('th', {}, 'Zeit'), h('th', {}, 'Team'), h('th', {}, 'Punkte'), h('th', {}, 'Grund'), h('th', {}, ''))),
        h('tbody', {}, ledger.map((e) => h('tr', { style: { opacity: e.reversedBy ? 0.5 : 1 } },
          h('td', {}, fmt(e.at)), h('td', {}, teamName(e.teamId)), h('td', {}, h('b', {}, e.points > 0 ? `+${e.points}` : e.points)), h('td', {}, e.reason),
          h('td', {}, e.reversedBy || e.reverses ? null : h('button', { class: 'btn small ghost', onclick: () => confirmAct('Diese Buchung rückgängig machen?', 'points.undo', { entryId: e.id }) }, 'Rückgängig')))))) : h('p', { class: 'muted' }, 'Noch keine Buchungen.')),
    card('Protokoll', h('ul', { class: 'list log' }, [...S.log].reverse().map((l) => h('li', {}, h('span', { class: 'muted' }, fmt(l.at)), h('span', { class: 'grow' }, l.detail))))),
  ];
}
