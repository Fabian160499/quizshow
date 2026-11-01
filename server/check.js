'use strict';

// Generalprobe-Check: geht alle Spiele der Show durch und meldet, was vor der Show
// noch fehlt (leere Fragen, fehlende Lösungen, fehlende Videos/Bilder/Lieder).
// level: 'fehlt' (sollte vor der Show behoben werden) oder 'hinweis' (optional).
// Zusätzlich die Liste aller verwendeten Mediendateien, damit die Regie prüfen
// kann, ob die Dateien im data-Ordner wirklich vorhanden sind.

// Felder, die bewusst leer bleiben dürfen.
const OPTIONAL_KEYS = new Set(['aliases', 'note', 'asOf', 'fixes', 'min', 'max', 'start', 'audio', 'target', 'lat', 'lng', 'country', 'unit', 'info', 'label', 'photo']);
const COUNTRY_MODE = /Ganzes Land/;

function isEmpty(v) {
  return v === undefined || v === null || (typeof v === 'string' && !v.trim());
}

function checkFields(fields, obj, where, out, media) {
  for (const f of fields) {
    const v = obj ? obj[f.key] : undefined;
    const label = f.label.replace(/\s*\(.*$/, '').replace(/\s*[–-]\s.*$/, '');
    const optional = OPTIONAL_KEYS.has(f.key) || /optional/i.test(f.label);
    if (f.type === 'media') {
      if (v && v.id) media.push({ id: v.id, type: v.type, where: `${where} · ${label}` });
      else if (!optional) out.push({ level: 'fehlt', where, text: `${label} fehlt` });
    } else if (f.type === 'text' || f.type === 'textarea') {
      if (!optional && isEmpty(v)) out.push({ level: 'fehlt', where, text: `${label} ist leer` });
    } else if (f.type === 'object') {
      checkFields(f.fields, v || {}, where, out, media);
    } else if (f.type === 'list') {
      const arr = Array.isArray(v) ? v : [];
      arr.forEach((item, i) => {
        const w = `${where} · ${f.itemLabels?.[i] || (typeof f.itemLabel === 'function' ? f.itemLabel(i) : `${label} ${i + 1}`)}`;
        if (f.of === 'text') {
          if (isEmpty(item)) out.push({ level: 'fehlt', where: w, text: 'ist leer' });
        } else {
          checkFields(f.fields || [], item || {}, w, out, media);
        }
      });
    }
  }
}

// Besondere Regeln einzelner Spielarten.
function special(type, content, where, out) {
  const each = (list, label, fn) => (list || []).forEach((x, i) => { const err = fn(x); if (err) out.push({ level: 'fehlt', where: `${where} · ${label} ${i + 1}`, text: err }); });
  if (type === 'brain') { const err = require('./play-brain').slotProblem({ type, content }); if (err) out.push({ level: 'fehlt', where: `${where} · Glücksrad`, text: err }); }
  if (type === 'allein') each(content.rounds, 'Kategorie', (rd) => (require('./play-allein').parseList(rd.entries).length < 2 ? 'Liste der richtigen Antworten fehlt' : null));
  if (type === 'star') each(content.puzzles, 'Rätsel', require('./play-star').validate);
  if (type === 'timeline') each(content.rounds, 'Durchgang', require('./play-timeline').validate);
  if (type === 'chat') each(content.chats, 'Chat', require('./play-chat').validate);
  if (type === 'top100') each(content.rounds, 'Runde', (rd) => { const n = require('./play-top100').parseList(rd.entries).length; return n < 100 ? `Liste hat erst ${n} von 100 Einträgen` : null; });
  if (type === 'sortieren') each(content.tasks, 'Aufgabe', (t) => ((t.items || []).some((it) => !(it.label || '').trim() && !it.image) ? 'Ein Element hat weder Begriff noch Bild' : null));
  if (type === 'land') {
    (content.tasks || []).forEach((t, i) => {
      const w = `${where} · Aufgabe ${i + 1}`;
      if (COUNTRY_MODE.test(t.mode || '')) {
        if (!t.country || /bitte wählen/.test(t.country)) out.push({ level: 'fehlt', where: w, text: 'Gesuchtes Land nicht ausgewählt' });
      } else if (typeof t.lat !== 'number' || typeof t.lng !== 'number') {
        out.push({ level: 'fehlt', where: w, text: 'Koordinaten (Breiten-/Längengrad) fehlen' });
      }
    });
  }
}

function checkShow(db, types) {
  const pr = db.project;
  const out = [];
  const media = [];
  if (!pr.name || !pr.name.trim()) out.push({ level: 'hinweis', where: 'Show', text: 'Die Show hat keinen Namen' });
  if (!pr.teams.length) out.push({ level: 'fehlt', where: 'Teams', text: 'Es sind keine Teams angelegt' });
  pr.teams.forEach((t, i) => {
    if (/^Team \d+$/.test(t.name)) out.push({ level: 'hinweis', where: `Teams · ${t.name}`, text: 'heißt noch wie die Vorlage – richtiger Teamname eingetragen?' });
    if (!t.avatar) out.push({ level: 'hinweis', where: `Teams · ${t.name || `Team ${i + 1}`}`, text: 'kein Teamfoto für das Finale hinterlegt' });
  });
  if (!pr.introVideo) out.push({ level: 'hinweis', where: 'Showablauf', text: 'Kein Intro-Video hinterlegt (Schritt wird übersprungen)' });
  else media.push({ id: pr.introVideo.id, type: pr.introVideo.type, where: 'Intro-Video' });
  if (pr.finaleIntro) media.push({ id: pr.finaleIntro.id, type: pr.finaleIntro.type, where: 'Finale · Intro' });
  for (const st of Object.values(pr.stages || {})) if (st && st.intro) media.push({ id: st.intro.id, type: st.intro.type, where: 'Gewinnstufe · Intro' });
  for (const st of pr.rundown || []) for (const m of st.songs || []) media.push({ id: m.id, type: m.type, where: `Pause · ${m.name || 'Lied'}` });

  pr.games.forEach((g, i) => {
    const t = types[g.type];
    const where = `Spiel ${i + 1} · ${g.title}`;
    if (!t) return;
    if (g.intro) media.push({ id: g.intro.id, type: g.intro.type, where: `${where} · Titel-Song` });
    else out.push({ level: 'hinweis', where, text: 'kein eigener Titel-Song hinterlegt' });
    checkFields(t.schema, g.content || {}, where, out, media);
    special(g.type, g.content || {}, where, out);
  });

  // Finale
  const fq = (pr.finale && pr.finale.questions) || [];
  fq.forEach((q, i) => {
    if (isEmpty(q.question)) out.push({ level: 'fehlt', where: `Finale · Frage ${i + 1}`, text: 'Frage ist leer' });
    else if (isEmpty(q.answer)) out.push({ level: 'fehlt', where: `Finale · Frage ${i + 1}`, text: 'Antwort ist leer' });
  });
  if (!fq.length) out.push({ level: 'fehlt', where: 'Finale', text: 'Keine Finalfragen angelegt' });
  return { issues: out, media };
}

module.exports = { checkShow };
