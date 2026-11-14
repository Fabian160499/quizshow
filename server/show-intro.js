'use strict';

// Show-Intro: eine inszenierte Eröffnung vor jeder Show.
// Ablauf (Beamer + alle Team-iPads als Lichtanlage im Raum):
//   1. automatisch: Eröffnung je Thema (Vorspann, Teaser, Countdown, Höhepunkt, Off-Ansage)
//   2. per Klick: jedes Team einzeln, dann Co-Moderation, Moderation, zum Schluss alle zusammen.
// Themen, Zeitachsen und ALLE Texte (Standard) stehen im Katalog assets/data/show-intro.json.
// Jeder Text ist im Editor änderbar (je Thema gespeichert); gesprochene Texte kann die
// KI-Stimme (ElevenLabs) vertonen.

const crypto = require('crypto');
const { fail, log, effect, cleanText } = require('./core');

// Katalog: im Prototyp (Browser) eingebettet, auf dem Show-Rechner aus der Datei.
function loadCatalog() {
  try { return require('./si-catalog-json'); } catch {
    const fs = require('fs');
    const path = require('path');
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets', 'data', 'show-intro.json'), 'utf8'));
  }
}
const CATALOG = loadCatalog();
const THEMES = CATALOG.themes;
const THEME_IDS = CATALOG.order;
const DEFAULT_THEME = THEME_IDS[0];
const FIELDS = CATALOG.fields;
const TEAM_FIELDS = CATALOG.teamFields;
const teamFieldsFor = (theme) => TEAM_FIELDS.filter((f) => !f.only || f.only.includes(theme));
const LINES_MAX = 8;

const fieldsFor = (theme) => FIELDS.filter((f) => !f.only || f.only.includes(theme));
const NUM = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf'];
const word = (n) => NUM[n] || String(n);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// KI-Soundeffekte (ElevenLabs „Sound Effects“): Schlüssel → Beschreibung und Länge.
const SFX = {
  boom: { sec: 3, p: 'deep cinematic sub bass boom, dark trailer opening hit, huge hall reverb' },
  hit: { sec: 3, p: 'massive cinematic impact hit, trailer slam with sub drop and metallic shimmer, epic reverb tail' },
  braam: { sec: 4, p: 'epic cinematic braam, distorted low brass blast like a blockbuster movie trailer' },
  riser: { sec: 5, p: 'tense cinematic riser building up to a drop, rising shepard tone and white noise swell, ends abruptly' },
  whoosh: { sec: 1, p: 'fast cinematic whoosh transition, swish passing by from left to right' },
  tick: { sec: 1, p: 'dramatic game show countdown clock tick, deep pulse with reverb' },
  roll: { sec: 2, p: 'orchestral timpani drum roll crescendo building tension for an announcement' },
  stab: { sec: 3, p: 'bright orchestral brass stab hit, tv show sting, big hall' },
  fanfare: { sec: 4, p: 'triumphant big band brass fanfare for a tv show host entrance, short and powerful' },
};
const SFX_STYLE = {
  studio: 'retro Saturday night TV show with a live big band',
  buehne: 'modern Saturday night TV game show style',
  musical: 'Broadway musical theatre style with orchestra',
  casino: 'Las Vegas casino glamour style, jazzy and luxurious',
  wildnis: 'survival documentary style, tribal drums, primal and raw',
  weltraum: 'sci-fi space epic style, synthesizers and huge spaces',
};
function sfxPrompts(theme) {
  const style = SFX_STYLE[theme] || SFX_STYLE.buehne;
  return Object.fromEntries(Object.entries(SFX).map(([k, v]) => [`sfx:${k}`, { text: `${v.p}, ${style}`, sec: v.sec }]));
}

function cfg(project) {
  const c = project.showIntro || {};
  return {
    theme: THEMES[c.theme] ? c.theme : DEFAULT_THEME,
    music: c.music || null,
    dropSec: Number.isFinite(c.dropSec) ? c.dropSec : 0,
    texts: c.texts && typeof c.texts === 'object' ? c.texts : {},
    voiceId: typeof c.voiceId === 'string' ? c.voiceId : '',
    clips: c.clips && typeof c.clips === 'object' ? c.clips : {},
    songs: c.songs && typeof c.songs === 'object' ? c.songs : {},
  };
}

// Platzhalter ersetzen.
function filler(project) {
  const n = project.teams.length;
  const g = (project.games || []).length;
  const hosts = [project.host, project.coHost].filter(Boolean).join(' & ');
  const base = {
    show: project.name || '', subtitle: project.subtitle || '', host: project.host || 'die Moderation', cohost: project.coHost || '', hosts: hosts || project.name || '',
    n, nWort: cap(word(n)), nwort: word(n), games: g, gamesWort: cap(word(g)), gameswort: word(g),
  };
  return (tpl, extra = {}) => String(tpl ?? '').replace(/\{(\w+)\}/g, (m, k) => {
    if (k in extra) return extra[k];
    return k in base ? base[k] : m;
  });
}

// Eigener Text (falls gesetzt) oder Standard des Themas.
function rawText(project, key) {
  const c = cfg(project);
  const own = (c.texts[c.theme] || {})[key];
  if (own !== undefined && own !== null) return own;
  return THEMES[c.theme].t[key] ?? '';
}
function rawTeam(project, team, idx, field) {
  const c = cfg(project);
  const own = (c.texts[c.theme] || {})[`team.${team.id}.${field}`];
  if (own !== undefined && own !== null) return own;
  const list = THEMES[c.theme].team[field] || [];
  return list.length ? list[idx % list.length] : '';
}

// Alle fertigen Texte (Platzhalter ersetzt).
function texts(project) {
  const fill = filler(project);
  const c = cfg(project);
  const tx = {};
  for (const f of fieldsFor(c.theme)) {
    const v = rawText(project, f.key);
    tx[f.key] = f.multi ? (Array.isArray(v) ? v : String(v).split('\n')).map((l) => fill(l)).filter((l) => l.trim()) : fill(v);
  }
  const teams = project.teams.map((t, i) => {
    const ex = { team: t.name, nr: i + 1 };
    return {
      teamId: t.id,
      call: fill(rawTeam(project, t, i, 'call'), ex),
      tag: fill(rawTeam(project, t, i, 'tag'), ex),
      extra: fill(rawTeam(project, t, i, 'extra'), ex),
      kicker: fill(rawText(project, 'team.kicker'), ex),
      ...Object.fromEntries(teamFieldsFor(c.theme).filter((f) => !['call', 'tag', 'extra'].includes(f.key)).map((f) => [f.key, fill(rawTeam(project, t, i, f.key), ex)])),
      other: fill(rawText(project, 'ipad.other'), ex),
      row: fill(rawText(project, 'poll.row'), ex),
    };
  });
  const person = (k, name) => (name ? { name, call: fill(rawText(project, `${k}.call`), { name }), kicker: fill(rawText(project, `${k}.kicker`), { name }), tag: fill(rawText(project, `${k}.tag`), { name }), ipad: fill(rawText(project, 'ipad.host'), { name }) } : null);
  return {
    tx,
    teams,
    host: person('host', project.host || 'Moderation'),
    coHost: person('coHost', project.coHost || ''),
    games: (project.games || []).map((g, i) => ({ position: i + 1, title: g.title, label: fill(rawText(project, 'teaser.item'), { nr: i + 1, title: g.title }) })),
    lines: tx.lines || [],
    greeting: tx.greeting || '',
  };
}

// Alle Sprachclips, die die KI-Stimme erzeugen kann: Schlüssel → Text.
function clipTexts(project) {
  const t = texts(project);
  const out = {};
  const put = (k, s) => { if (String(s || '').trim()) out[k] = s; };
  put('cold', t.tx['voice.cold']);
  put('count', t.tx['voice.count']);
  put('drop', t.tx['voice.drop']);
  put('lines', t.lines.join(' … '));
  for (const x of t.teams) put(`team:${x.teamId}`, x.call);
  if (t.coHost) put('coHost', t.coHost.call);
  put('host', t.host.call);
  put('all', t.tx['voice.all']);
  return out;
}
const hashOf = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 16);

// Gültige Clips (passen noch zum aktuellen Text; eigene Uploads gelten immer).
function validClips(project) {
  const c = cfg(project);
  const want = clipTexts(project);
  const out = {};
  for (const [k, text] of Object.entries(want)) {
    const clip = c.clips[k];
    if (clip && clip.id && (clip.own || clip.hash === hashOf(text))) out[k] = { id: clip.id, type: clip.type };
  }
  return out;
}
// KI-Soundeffekte, die zum aktuellen Thema passen.
function validSfx(project) {
  const c = cfg(project);
  const want = sfxPrompts(c.theme);
  const out = {};
  for (const [k, w] of Object.entries(want)) {
    const clip = c.clips[k];
    if (clip && clip.id && clip.hash === hashOf(w.text)) out[k.slice(4)] = { id: clip.id, type: clip.type };
  }
  return out;
}

// KI-Musik (ElevenLabs Music): Kompositionsplan genau auf die Zeitachse des Themas gelegt –
// der Höhepunkt der Musik fällt auf den Höhepunkt der Eröffnung.
function musicPlan(theme) {
  const th = THEMES[theme] || THEMES[DEFAULT_THEME];
  const tl = th.tl;
  const ms = (s) => Math.max(3000, Math.round(s * 1000));
  const st = th.music.styles;
  const sections = [];
  const build = tl.count ?? tl.teaser;
  sections.push({ section_name: 'Cold open', positive_local_styles: ['dark', 'sparse', 'mysterious intro', 'tension'], negative_local_styles: ['drums', 'loud'], duration_ms: ms(build), lines: [] });
  sections.push({ section_name: 'Build-up', positive_local_styles: ['rising tension', 'crescendo', 'drum build', 'riser into a huge drop'], negative_local_styles: ['calm'], duration_ms: ms(tl.boom - build), lines: [] });
  sections.push({ section_name: 'Main theme drop', positive_local_styles: ['huge impact on the first beat', 'full energy', 'main theme', 'triumphant'], negative_local_styles: ['quiet'], duration_ms: ms(28), lines: [] });
  sections.push({ section_name: 'Groove bed', positive_local_styles: ['steady groove', 'loopable', 'background for announcements'], negative_local_styles: ['breakdown'], duration_ms: ms(60), lines: [] });
  return { positive_global_styles: [...st, 'instrumental', 'tv show opener'], negative_global_styles: th.music.negative, sections };
}

// Phasen des Intros nach dem automatischen Teil.
function phases(project) {
  const out = ['auto'];
  project.teams.forEach((_, i) => out.push(`team:${i}`));
  if (project.coHost) out.push('coHost');
  out.push('host', 'all');
  return out;
}

function current(db) {
  const b = db.live.beamer;
  return b && b.view === 'showIntro' && b.data ? b.data : null;
}

function start(db, ctx) {
  db.live.beamer = { view: 'showIntro', data: { phase: 'auto', at: ctx.now, seq: ((current(db) || {}).seq || 0) + 1 } };
}

// Nächster Klick im Intro (null = Intro fertig, weiter im Ablauf).
function flow(db) {
  const d = current(db);
  if (!d) return null;
  const list = phases(db.project);
  const i = list.indexOf(d.phase);
  const next = list[i + 1];
  if (!next) return null;
  const t = texts(db.project);
  if (next.startsWith('team:')) {
    const k = Number(next.slice(5));
    const team = db.project.teams[k];
    return { label: `🎤 Team ${k + 1} von ${db.project.teams.length} vorstellen: ${team ? team.name : ''}`, action: 'showIntro.next', mod: true, cue: t.teams[k] ? t.teams[k].call : '' };
  }
  if (next === 'coHost') return { label: `🎤 Co-Moderation vorstellen: ${db.project.coHost}`, action: 'showIntro.next', mod: true, cue: t.coHost ? t.coHost.call : '' };
  if (next === 'host') return { label: `🌟 Moderation vorstellen: ${db.project.host || 'Moderation'}`, action: 'showIntro.next', mod: true, cue: t.host.call };
  return { label: '🎉 Alle zusammen – Intro abschließen', action: 'showIntro.next', mod: true, cue: `Begrüßung: ${t.greeting}` };
}

function cleanMedia(m, kinds) {
  if (m === null) return null;
  if (!m || typeof m.id !== 'string' || !/^media_[a-f0-9]{12,40}$/.test(m.id)) fail('Ungültige Datei.');
  if (typeof m.type !== 'string' || !new RegExp(`^(${kinds})/[\\w.+-]{1,40}$`).test(m.type)) fail('Bitte eine MP3- oder MP4-Datei wählen.');
  return { id: m.id, type: m.type, name: cleanText(String(m.name || 'Datei'), 100) || 'Datei', size: Number(m.size) || 0 };
}

const actions = {
  // Einstellungen im Editor: Thema, Musik, Drop, Stimme, eigene Aufnahme, Songs.
  'showIntro.set'(db, ctx, p) {
    const pr = db.project;
    const c = { ...(pr.showIntro || {}) };
    if ('theme' in p) {
      if (!THEMES[p.theme]) fail('Unbekanntes Thema.');
      c.theme = p.theme;
    }
    if ('music' in p) c.music = cleanMedia(p.music, 'audio|video');
    if ('dropSec' in p) {
      const n = Number(p.dropSec);
      if (!Number.isFinite(n) || n < 0 || n > 600) fail('Die Drop-Zeit muss zwischen 0 und 600 Sekunden liegen.');
      c.dropSec = Math.round(n * 10) / 10;
    }
    if ('voiceId' in p) c.voiceId = /^[A-Za-z0-9]{0,40}$/.test(String(p.voiceId || '')) ? String(p.voiceId || '') : '';
    // Eigene Aufnahme eines gesprochenen Textes (gilt unabhängig vom Text).
    if ('voiceUpload' in p) {
      const key = String(p.voiceKey || 'lines');
      if (!(key in clipTexts(pr)) && !/^team:/.test(key)) fail('Unbekannter Sprechtext.');
      const m = cleanMedia(p.voiceUpload, 'audio|video');
      c.clips = { ...(c.clips || {}) };
      if (m) c.clips[key] = { ...m, own: true };
      else delete c.clips[key];
    }
    // Einlauf-/Walk-on-Songs: { key: 'team:<id>' | 'host' | 'coHost', media | null }
    if ('song' in p) {
      const key = String((p.song && p.song.key) || '');
      if (!(key === 'host' || key === 'coHost' || (key.startsWith('team:') && pr.teams.some((t) => `team:${t.id}` === key)))) fail('Unbekannter Einlauf.');
      c.songs = { ...(c.songs || {}) };
      const m = cleanMedia(p.song.media ?? null, 'audio|video');
      if (m) c.songs[key] = m; else delete c.songs[key];
    }
    pr.showIntro = c;
    log(db, ctx, 'editor', 'Show-Intro geändert');
  },

  // Einen Text ändern (null = Standard des Themas). Teams: key 'team.<id>.<feld>'.
  'showIntro.text'(db, ctx, p) {
    const pr = db.project;
    const c = { ...(pr.showIntro || {}) };
    const theme = THEMES[c.theme] ? c.theme : DEFAULT_THEME;
    const key = String(p.key || '');
    const f = fieldsFor(theme).find((x) => x.key === key);
    const tm = /^team\.([\w-]+)\.(\w+)$/.exec(key);
    if (!f && !(tm && pr.teams.some((t) => t.id === tm[1]) && teamFieldsFor(theme).some((x) => x.key === tm[2]))) fail('Unbekannter Text.');
    let v = p.value;
    if (v !== null) {
      if (f && f.multi) v = (Array.isArray(v) ? v : String(v || '').split('\n')).slice(0, LINES_MAX).map((l) => cleanText(String(l || ''), 140));
      else v = cleanText(String(v ?? ''), f && f.long ? 700 : 200);
    }
    const all = { ...(c.texts || {}) };
    const mine = { ...(all[theme] || {}) };
    if (v === null) delete mine[key]; else mine[key] = v;
    all[theme] = mine;
    c.texts = all;
    pr.showIntro = c;
    log(db, ctx, 'editor', 'Show-Intro: Text geändert');
  },

  // Von der KI erzeugte Clips eintragen (kommt vom Server nach dem Erzeugen).
  'showIntro.voiceSet'(db, ctx, p) {
    const pr = db.project;
    const c = { ...(pr.showIntro || {}) };
    c.clips = { ...(c.clips || {}) };
    const want = clipTexts(pr);
    const sfx = sfxPrompts(cfg(pr).theme);
    for (const [k, m] of Object.entries(p.clips || {})) {
      if (k in sfx) { c.clips[k] = { ...cleanMedia(m, 'audio'), hash: hashOf(sfx[k].text) }; continue; }
      if (!(k in want)) continue;
      const media = cleanMedia(m, 'audio');
      c.clips[k] = { ...media, hash: hashOf(want[k]) };
    }
    pr.showIntro = c;
    log(db, ctx, 'editor', `Show-Intro: ${Object.keys(p.clips || {}).length} Clips erzeugt`);
  },

  // Nächster Schritt im laufenden Intro.
  'showIntro.next'(db, ctx) {
    const d = current(db);
    if (!d) fail('Das Show-Intro läuft gerade nicht.');
    const list = phases(db.project);
    const i = list.indexOf(d.phase);
    if (i < 0 || i + 1 >= list.length) fail('Das Show-Intro ist schon fertig.');
    db.live.beamer = { view: 'showIntro', data: { phase: list[i + 1], at: ctx.now, seq: (d.seq || 0) + 1 } };
    effect(db, 'reveal');
    log(db, ctx, 'ablauf', `Show-Intro: ${list[i + 1]}`);
  },
};

// Daten für den Beamer.
function beamerData(db) {
  const d = current(db);
  if (!d) return null;
  const pr = db.project;
  const c = cfg(pr);
  const t = texts(pr);
  return {
    phase: d.phase, at: d.at, seq: d.seq,
    theme: c.theme,
    tl: THEMES[c.theme].tl,
    music: c.music ? { id: c.music.id, type: c.music.type } : null,
    dropSec: c.dropSec,
    tx: t.tx,
    extraLabel: (THEMES[c.theme].labels || {}).extra || '',
    lines: t.lines,
    teams: t.teams,
    host: t.host,
    coHost: t.coHost,
    games: t.games,
    clips: validClips(pr),
    sfx: validSfx(pr),
    songs: Object.fromEntries(Object.entries(c.songs).map(([k, m]) => [k, { id: m.id, type: m.type }])),
  };
}

// Daten für die Team-iPads (Licht im Raum).
function teamData(db, teamId) {
  const d = current(db);
  if (!d) return null;
  const pr = db.project;
  const c = cfg(pr);
  const t = texts(pr);
  const idx = pr.teams.findIndex((x) => x.id === teamId);
  const k = d.phase.startsWith('team:') ? Number(d.phase.slice(5)) : -1;
  const person = d.phase === 'host' ? t.host : d.phase === 'coHost' ? t.coHost : null;
  return {
    phase: d.phase, at: d.at, seq: d.seq, theme: c.theme, tl: THEMES[c.theme].tl, idx, n: pr.teams.length,
    tx: {
      wait: t.tx['ipad.wait'], start: t.tx['ipad.start'], go: t.tx['ipad.go'] || '', you: t.tx['ipad.you'], youSub: t.tx['ipad.youSub'], all: t.tx['ipad.all'],
      other: k >= 0 && t.teams[k] ? t.teams[k].other : '',
      host: person ? person.ipad : '',
      label: t.tx['count.label'] || '',
    },
  };
}

// Für den Editor und die Regie: Texte, Felder, Einstellungen.
function moderatorData(db) {
  const pr = db.project;
  const c = cfg(pr);
  const want = clipTexts(pr);
  const valid = validClips(pr);
  const th = THEMES[c.theme];
  const mine = c.texts[c.theme] || {};
  return {
    config: { theme: c.theme, music: c.music, dropSec: c.dropSec, voiceId: c.voiceId },
    texts: texts(pr),
    own: mine,
    defaults: th.t,
    teamDefaults: pr.teams.map((t, i) => Object.fromEntries(teamFieldsFor(c.theme).map((f) => [f.key, (th.team[f.key] || [])[i % (th.team[f.key] || ['']).length] || '']))),
    fields: fieldsFor(c.theme).map((f) => ({ ...f, label: (th.labels && th.labels[f.key]) || f.label })),
    teamFields: teamFieldsFor(c.theme).map((f) => ({ ...f, label: (th.labels && th.labels[f.key]) || f.label })),
    groups: CATALOG.groups,
    themes: THEME_IDS.map((id) => ({ id, name: THEMES[id].name, desc: THEMES[id].desc })),
    tl: th.tl,
    clips: Object.fromEntries(Object.keys(want).map((k) => [k, { text: want[k], ready: !!valid[k], own: !!(c.clips[k] && c.clips[k].own) }])),
    voice: { total: Object.keys(want).length, ready: Object.keys(valid).length, chars: Object.values(want).join('').length },
    sfx: { total: Object.keys(SFX).length, ready: Object.keys(validSfx(pr)).length },
    songs: c.songs,
  };
}

function referencedMedia(project, ids) {
  const c = project.showIntro;
  if (!c) return;
  if (c.music) ids.add(c.music.id);
  for (const clip of Object.values(c.clips || {})) if (clip && clip.id) ids.add(clip.id);
  for (const m of Object.values(c.songs || {})) if (m && m.id) ids.add(m.id);
}

module.exports = { sfxPrompts, validSfx, musicPlan, THEMES, THEME_IDS, DEFAULT_THEME, CATALOG, actions, start, flow, phases, beamerData, teamData, moderatorData, clipTexts, validClips, hashOf, texts, referencedMedia, current };
