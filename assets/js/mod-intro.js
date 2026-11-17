// Show-Editor → „Show-Intro“: Thema, Musik, KI-Stimme, alle Texte, Einlaufsongs, Vorschau.
// Jeder Text, der auf Beamer oder iPads erscheint oder gesprochen wird, ist hier änderbar
// (leer lassen bzw. ↺ = Standard des Themas). Gespeichert wird je Thema.

import { h, uploadMedia, mediaUrl, toast, localServer } from './client.js';
import { musicUrl } from './si-core.js';

const ui = { busy: '', upload: null, voices: null, voiceErr: '', hasKey: null, open: { texts: true } };

// ui-Kontext aus moderator.js: { S, card, act, autosave, token, rerender }
export function buildShowIntro(x) {
  const { S, card } = x;
  const si = S.showIntro;
  if (!si) return [card('Show-Intro', h('p', { class: 'muted' }, 'Wird geladen …'))];
  return [themeCard(x, si), musicCard(x, si), voiceCard(x, si), textCard(x, si), songCard(x, si)];
}

// ---------- Hilfen ----------
const fmtSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.round((b || 0) / 1024)} KB`);
function uploadButton(x, label, accept, onDone, key) {
  const input = h('input', {
    type: 'file', accept, class: 'visually-hidden', 'aria-label': label,
    onchange: async (ev) => {
      const file = ev.target.files && ev.target.files[0];
      ev.target.value = '';
      if (!file) return;
      ui.upload = { key, name: file.name, progress: 0 };
      x.rerender();
      try {
        const m = await uploadMedia(file, x.token, (p) => { ui.upload.progress = p; const bar = document.getElementById(`si-up-${key}`); if (bar) bar.value = p; });
        await onDone({ id: m.id, type: m.type, size: m.size, name: file.name });
      } catch (err) { toast(err.message); } finally { ui.upload = null; x.rerender(); }
    },
  });
  if (ui.upload && ui.upload.key === key) return h('div', {}, h('small', {}, `„${ui.upload.name}“ wird hochgeladen …`), h('progress', { id: `si-up-${key}`, max: '1', value: String(ui.upload.progress), style: { width: '100%' } }));
  return h('label', { class: 'btn small' }, input, label);
}
function player(m, src) {
  const a = h('audio', { controls: true, preload: 'none', style: { width: '100%', marginTop: '6px' } });
  if (src) a.src = src;
  else if (m) mediaUrl(m.id).then((u) => { if (u) a.src = u; });
  return a;
}
async function voiceApi(x, path, body) {
  const res = await fetch(`api/voice${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'x-token': x.token || '' }, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) throw new Error(j.error || `Fehler (${res.status})`);
  return j;
}
const serverOnly = () => !!localServer; // Prototyp ohne Show-Rechner: keine KI-Schnittstelle

// ---------- Thema + Vorschau ----------
function themeCard(x, si) {
  const cur = si.config.theme;
  return x.card('Show-Intro: Thema',
    h('p', { class: 'muted' }, 'Jedes Thema hat eine eigene Regie, eigene Musik, eigene Schriften und eine eigene Lichtshow auf den iPads. Jedes Team wird anders vorgestellt.'),
    h('div', { class: 'si-themes' }, si.themes.map((t) => h('button', {
      class: `si-theme-tile${t.id === cur ? ' on' : ''}`, 'aria-pressed': String(t.id === cur),
      onclick: () => x.act('showIntro.set', { theme: t.id }),
    }, h('b', {}, t.name), h('small', {}, t.desc)))),
    h('div', { class: 'row', style: { marginTop: '10px' } },
      serverOnly() ? null : h('button', { class: 'btn', onclick: () => openPreview(x, si) }, '▶ Vorschau: Beamer + 6 iPads mit Ton'),
      uploadButton(x, si.config.dropImage ? 'Bild beim Höhepunkt austauschen' : '+ Bild beim Höhepunkt (optional)', 'image/png,image/jpeg,image/webp', (m) => x.act('showIntro.set', { dropImage: m }), 'dropimg'),
      si.config.dropImage ? h('button', { class: 'btn ghost small', onclick: () => x.act('showIntro.set', { dropImage: null }) }, 'Bild entfernen') : null,
      h('span', { class: 'muted', style: { fontSize: '.85rem' } }, serverOnly() ? 'Ansehen: im Showablauf den Schritt „Show-Intro“ starten und Beamer + Team-iPads anschauen.' : 'Zeigt eure echten Teams, Namen und Texte. Im Showablauf startet das Intro mit dem Schritt „Show-Intro“.')));
}
function openPreview(x, si) {
  const S = x.S;
  const data = {
    theme: si.config.theme,
    show: { name: S.project.name, subtitle: S.project.subtitle, host: S.project.host, coHost: S.project.coHost, hostAvatar: S.project.hostAvatar || null, coHostAvatar: S.project.coHostAvatar || null },
    teams: S.project.teams.map((t) => ({ id: t.id, name: t.name, color: t.color, avatar: t.avatar || null })),
    texts: si.texts,
  };
  try { localStorage.setItem('si-preview', JSON.stringify(data)); } catch {
    try { data.teams.forEach((t) => { t.avatar = null; }); data.show.hostAvatar = null; data.show.coHostAvatar = null; localStorage.setItem('si-preview', JSON.stringify(data)); } catch { /* ohne eigene Daten */ }
  }
  window.open('intro-vorschau.html?eigene=1', '_blank');
}

// ---------- Musik ----------
function musicCard(x, si) {
  const c = si.config;
  const own = c.music;
  const tl = si.tl || {};
  return x.card('Musik',
    own
      ? h('div', {}, h('p', {}, '♪ ', h('b', {}, own.name || 'Eigene Musik'), own.size ? h('span', { class: 'muted' }, ` · ${fmtSize(own.size)}`) : null), player(own),
        h('label', { for: 'si-drop', style: { marginTop: '10px' } }, 'Sekunde des Höhepunkts in deiner Datei (der „Drop“)'),
        h('input', { id: 'si-drop', type: 'number', min: '0', max: '600', step: '0.1', value: c.dropSec, onchange: (ev) => x.act('showIntro.set', { dropSec: Number(ev.target.value) }) }),
        h('p', { class: 'muted', style: { fontSize: '.85rem' } }, `Die Musik startet so, dass diese Stelle genau auf den Höhepunkt der Eröffnung fällt (nach ${tl.boom ?? '?'} Sekunden).`))
      : h('div', {}, h('p', {}, '♪ Standard-Musik des Themas – eigens komponiert, Höhepunkt sekundengenau auf dem Ablauf. Jedes Team hat einen eigenen Jingle.'), player(null, musicUrl(`${c.theme}-intro`))),
    h('div', { class: 'row', style: { marginTop: '8px' } },
      uploadButton(x, own ? 'Andere Musik hochladen' : '+ Eigene Musik hochladen', 'audio/*,video/mp4,.mp3,.m4a,.wav', (m) => x.act('showIntro.set', { music: m, dropSec: c.dropSec || 0 }), 'music'),
      own ? h('button', { class: 'btn ghost small', onclick: () => x.act('showIntro.set', { music: null }) }, '↺ Zurück zur Standard-Musik') : null,
      serverOnly() ? null : h('button', {
        class: 'btn ghost small', disabled: !!ui.busy,
        onclick: async () => { ui.busy = 'music'; x.rerender(); try { await voiceApi(x, '/music', {}); toast('KI-Musik erzeugt und eingesetzt.'); } catch (e) { toast(e.message); } finally { ui.busy = ''; x.rerender(); } },
      }, ui.busy === 'music' ? '… KI-Musik wird komponiert' : '🎼 KI-Musik erzeugen (ElevenLabs)')),
    serverOnly() ? null : h('p', { class: 'muted', style: { fontSize: '.85rem' } }, 'KI-Musik wird passend zur Zeitachse des Themas bestellt (Ruhe – Aufbau – Höhepunkt – Musikbett). Braucht meist einen bezahlten ElevenLabs-Tarif.'));
}

// ---------- KI-Stimme ----------
function voiceCard(x, si) {
  if (serverOnly()) return x.card('Off-Sprecher (KI-Stimme)', h('p', { class: 'muted' }, 'Die KI-Stimme läuft über den Show-Rechner. In diesem Prototyp spricht die Browser-Stimme – du kannst aber eigene Aufnahmen hochladen.'), clipList(x, si));
  if (ui.hasKey === null && !ui.loading) {
    ui.loading = true;
    voiceApi(x, '').then((j) => { ui.hasKey = j.hasKey; ui.voices = j.voices || []; ui.voiceErr = j.error || ''; }).catch((e) => { ui.hasKey = false; ui.voiceErr = e.message; }).finally(() => { ui.loading = false; x.rerender(); });
  }
  const keyInput = h('input', { id: 'si-key', type: 'password', autocomplete: 'off', placeholder: ui.hasKey ? '•••••••• (hinterlegt)' : 'API-Schlüssel von elevenlabs.io' });
  const saveKey = async () => {
    try { const j = await voiceApi(x, '/key', { key: keyInput.value }); ui.hasKey = j.hasKey; ui.voices = j.voices || []; ui.voiceErr = ''; toast(j.hasKey ? 'Schlüssel gespeichert.' : 'Schlüssel entfernt.'); } catch (e) { toast(e.message); }
    x.rerender();
  };
  const v = si.voice;
  const voiceSel = h('select', { id: 'si-voice', onchange: (ev) => x.act('showIntro.set', { voiceId: ev.target.value }) },
    h('option', { value: '' }, '– Stimme wählen –'), (ui.voices || []).map((o) => h('option', { value: o.id, selected: o.id === si.config.voiceId }, `${o.name}${o.info ? ` (${o.info})` : ''}`)));
  const gen = async (path, body, label) => { ui.busy = label; x.rerender(); try { const j = await voiceApi(x, path, body); toast(`${j.made ?? 0} ${label === 'sfx' ? 'Effekte' : 'Ansagen'} erzeugt.`); } catch (e) { toast(e.message); } finally { ui.busy = ''; x.rerender(); } };
  return x.card('Off-Sprecher (KI-Stimme)',
    h('p', { class: 'muted' }, 'Die KI-Stimme spricht alle Ansagen. Konto (kostenlos, nicht-kommerziell) auf elevenlabs.io anlegen → Profil → API-Keys → Schlüssel hier einfügen. Der Schlüssel bleibt nur auf dem Show-Rechner.'),
    h('div', { class: 'row' }, keyInput, h('button', { class: 'btn small', onclick: saveKey }, 'Speichern'), ui.hasKey ? h('button', { class: 'btn ghost small', onclick: () => { keyInput.value = ''; saveKey(); } }, 'Entfernen') : null),
    ui.voiceErr ? h('p', { class: 'notice warn' }, ui.voiceErr) : null,
    ui.hasKey ? h('div', {},
      h('label', { for: 'si-voice' }, 'Stimme'), voiceSel,
      h('p', {}, `Ansagen fertig: ${v.ready} von ${v.total}`, h('span', { class: 'muted' }, ` · zusammen ${v.chars} Zeichen (kostenlos: 10.000 Zeichen pro Monat)`)),
      h('div', { class: 'row' },
        h('button', { class: 'btn', disabled: !!ui.busy || !si.config.voiceId, onclick: () => gen('/generate', { voiceId: si.config.voiceId }, 'voice') }, ui.busy === 'voice' ? '… Stimme wird erzeugt' : '🎙 Fehlende Ansagen erzeugen'),
        h('button', { class: 'btn ghost small', disabled: !!ui.busy || !si.config.voiceId, onclick: () => gen('/generate', { voiceId: si.config.voiceId, all: true }, 'voice') }, 'Alle neu'),
        h('button', { class: 'btn ghost small', disabled: !!ui.busy, onclick: () => gen('/sfx', {}, 'sfx') }, ui.busy === 'sfx' ? '… Effekte werden erzeugt' : `✨ KI-Soundeffekte (${si.sfx.ready}/${si.sfx.total})`))) : null,
    clipList(x, si));
}
function clipList(x, si) {
  const names = { cold: 'Ganz am Anfang', count: 'Vor dem Höhepunkt', drop: 'Beim Höhepunkt', lines: 'Off-Ansage', all: 'Zum Schluss', host: 'Moderation', coHost: 'Co-Moderation' };
  const lineName = (k) => (/^line:\d+$/.test(k) ? `Off-Ansage, Zeile ${Number(k.slice(5)) + 1}` : null);
  const teamName = (k) => { const t = x.S.project.teams.find((tt) => `team:${tt.id}` === k); return t ? `Team ${t.name}` : k; };
  return h('details', { class: 'si-clips' }, h('summary', {}, 'Alle gesprochenen Texte – Status und eigene Aufnahmen'),
    h('ul', {}, Object.entries(si.clips).map(([k, c]) => h('li', {},
      h('span', { class: c.ready ? 'ok' : 'muted' }, c.ready ? (c.own ? '🎤' : '✓') : '○'), ' ', h('b', {}, names[k] || lineName(k) || teamName(k)), ': ', h('span', { class: 'muted' }, c.text),
      h('div', { class: 'row', style: { marginTop: '4px' } },
        uploadButton(x, c.own ? 'Andere Aufnahme' : 'Eigene Aufnahme', 'audio/*,.mp3,.m4a,.wav', (m) => x.act('showIntro.set', { voiceKey: k, voiceUpload: m }), `clip-${k}`),
        c.own ? h('button', { class: 'btn ghost small', onclick: () => x.act('showIntro.set', { voiceKey: k, voiceUpload: null }) }, 'Aufnahme entfernen') : null)))));
}

// ---------- Texte ----------
function textInput(x, si, key, f, def, own) {
  const id = `si-t-${key.replace(/[^\w]/g, '-')}`;
  const multi = f && f.multi;
  const long = f && f.long;
  const val = own !== undefined && own !== null ? (Array.isArray(own) ? own.join('\n') : own) : (Array.isArray(def) ? def.join('\n') : (def ?? ''));
  const save = (v) => x.autosave(`si.${key}`, () => x.act('showIntro.text', { key, value: v }));
  const el = multi || long
    ? h('textarea', { id, rows: multi ? '6' : '3', oninput: (ev) => save(ev.target.value) }, val)
    : h('input', { id, value: val, maxlength: '200', oninput: (ev) => save(ev.target.value) });
  const changed = own !== undefined && own !== null;
  return h('div', { class: `si-field${changed ? ' changed' : ''}` },
    h('div', { class: 'si-field-head' }, h('label', { for: id }, f ? f.label : key, f && f.say ? h('span', { class: 'si-say', title: 'wird gesprochen' }, ' 🔊') : null),
      changed ? h('button', { class: 'btn ghost tiny', title: 'Zurück zum Standard des Themas', onclick: () => x.act('showIntro.text', { key, value: null }) }, '↺ Standard') : null),
    el);
}
function textCard(x, si) {
  const own = si.own || {};
  const groups = si.groups.map((g) => {
    const fields = si.fields.filter((f) => f.group === g);
    const extra = g === 'Teams' ? teamTexts(x, si, own) : null;
    if (!fields.length && !extra) return null;
    return h('details', { class: 'si-group', open: g === 'Eröffnung (Beamer)' || g === 'Off-Sprecher (gesprochen)' }, h('summary', {}, g),
      fields.map((f) => textInput(x, si, f.key, f, si.defaults[f.key], own[f.key])), extra);
  });
  return x.card('Alle Texte',
    h('p', { class: 'muted' }, 'Jeder Text auf Beamer und iPads und jede Ansage. Platzhalter: {show}, {host}, {cohost}, {hosts}, {nWort} (Anzahl Teams als Wort), {gamesWort} (Anzahl Spiele), bei Teams {team} und {nr}, bei Moderation {name}. Geänderte Felder sind markiert; ↺ stellt den Standard wieder her. Texte werden je Thema gespeichert.'),
    groups);
}
function teamTexts(x, si, own) {
  return h('div', { class: 'si-teamtexts' }, x.S.project.teams.map((t, i) => h('div', { class: 'si-teamtext', style: { borderLeftColor: t.color } },
    h('b', {}, `${i + 1}. ${t.name}`),
    si.teamFields.map((f) => textInput(x, si, `team.${t.id}.${f.key}`, f, (si.teamDefaults[i] || {})[f.key], own[`team.${t.id}.${f.key}`])))));
}

// ---------- Einlaufsongs ----------
function songCard(x, si) {
  const rows = [
    ...x.S.project.teams.map((t) => ({ key: `team:${t.id}`, label: t.name, color: t.color })),
    ...(x.S.project.coHost ? [{ key: 'coHost', label: `${x.S.project.coHost} (Co-Moderation)` }] : []),
    { key: 'host', label: `${x.S.project.host || 'Moderation'} (Walk-on)` },
  ];
  return x.card('Einlaufsongs (optional)',
    h('p', { class: 'muted' }, 'Ohne eigenen Song spielt der Jingle des Themas. Ein eigener Song startet genau mit dem Namen und läuft 15 Sekunden, die Hintergrundmusik wird leise.'),
    h('ul', { class: 'si-songs' }, rows.map((r) => {
      const m = si.songs[r.key];
      return h('li', { style: r.color ? { borderLeftColor: r.color } : {} }, h('b', {}, r.label), m ? h('span', { class: 'muted' }, ` · ${m.name}`) : h('span', { class: 'muted' }, ' · Jingle des Themas'),
        h('div', { class: 'row' }, uploadButton(x, m ? 'Austauschen' : '+ Song', 'audio/*,video/mp4,.mp3,.m4a', (media) => x.act('showIntro.set', { song: { key: r.key, media } }), `song-${r.key}`),
          m ? h('button', { class: 'btn ghost small', onclick: () => x.act('showIntro.set', { song: { key: r.key, media: null } }) }, 'Entfernen') : null),
        m ? player(m) : null);
    })));
}
