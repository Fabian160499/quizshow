'use strict';

// KI-Stimme für das Show-Intro (ElevenLabs). Der API-Schlüssel liegt nur auf dem
// Show-Rechner in data/secrets.json – nie in der Datenbank, nie an Beamer oder iPads.
// Erzeugt werden MP3-Dateien, die wie hochgeladene Medien gespeichert werden;
// während der Show braucht es danach kein Internet mehr.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const API = 'https://api.elevenlabs.io/v1';
const MODEL = 'eleven_multilingual_v2'; // spricht Deutsch

function createVoice({ secretsFile, mediaDir, fetchImpl = globalThis.fetch }) {
  const readSecrets = () => {
    try { return JSON.parse(fs.readFileSync(secretsFile, 'utf8')); } catch { return {}; }
  };
  const writeSecrets = (s) => {
    fs.mkdirSync(path.dirname(secretsFile), { recursive: true });
    fs.writeFileSync(secretsFile, JSON.stringify(s, null, 2), { mode: 0o600 });
  };
  const key = () => readSecrets().elevenlabsKey || '';

  async function call(pathname, opts = {}, k = key()) {
    if (!k) throw new Error('Noch kein ElevenLabs-Schlüssel hinterlegt.');
    let res;
    try {
      res = await fetchImpl(`${API}${pathname}`, { ...opts, headers: { 'xi-api-key': k, ...(opts.headers || {}) } });
    } catch {
      throw new Error('ElevenLabs ist nicht erreichbar – ist der Show-Rechner mit dem Internet verbunden?');
    }
    if (res.status === 401) throw new Error('Der ElevenLabs-Schlüssel ist ungültig oder hat keine Berechtigung dafür.');
    if (res.status === 402 || res.status === 403) throw new Error('Diese Funktion ist in deinem ElevenLabs-Tarif nicht enthalten (KI-Musik braucht meist einen bezahlten Tarif).');
    if (res.status === 429) throw new Error('ElevenLabs: zu viele Anfragen oder Zeichenkontingent aufgebraucht.');
    if (!res.ok) {
      let msg = '';
      try { const j = await res.json(); msg = (j.detail && (j.detail.message || j.detail.status)) || ''; } catch { /* egal */ }
      throw new Error(`ElevenLabs-Fehler (${res.status})${msg ? `: ${msg}` : ''}`);
    }
    return res;
  }

  // Stimmen des Kontos (deutschsprachige und mehrsprachige zuerst).
  async function voices(k) {
    const res = await call('/voices', {}, k);
    const j = await res.json();
    return (j.voices || []).map((v) => ({
      id: v.voice_id, name: v.name,
      info: [v.labels && v.labels.gender, v.labels && v.labels.age, v.labels && (v.labels.accent || v.labels.language), v.labels && v.labels.description].filter(Boolean).join(' · '),
      preview: v.preview_url || null,
    }));
  }

  async function setKey(k) {
    const clean = String(k || '').trim();
    if (!clean) { const s = readSecrets(); delete s.elevenlabsKey; writeSecrets(s); return { hasKey: false, voices: [] }; }
    if (!/^[\w-]{20,200}$/.test(clean)) throw new Error('Das sieht nicht wie ein ElevenLabs-Schlüssel aus.');
    const list = await voices(clean); // prüft den Schlüssel
    writeSecrets({ ...readSecrets(), elevenlabsKey: clean });
    return { hasKey: true, voices: list };
  }

  // Einen Text sprechen lassen und als MP3 speichern → { id, type, size }.
  async function speak(text, voiceId) {
    const res = await call(`/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      // Etwas mehr Ausdruck als normal: das soll nach Showansager klingen.
      body: JSON.stringify({ text, model_id: MODEL, voice_settings: { stability: 0.35, similarity_boost: 0.8, style: 0.55, use_speaker_boost: true } }),
    });
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) throw new Error('ElevenLabs hat eine leere Datei geliefert.');
    fs.mkdirSync(mediaDir, { recursive: true });
    const id = `media_${crypto.randomBytes(12).toString('hex')}`;
    fs.writeFileSync(path.join(mediaDir, `${id}.mp3`), buf);
    return { id, type: 'audio/mpeg', size: buf.length, name: 'KI-Stimme' };
  }

  // KI-Soundeffekt erzeugen (ElevenLabs Sound Effects) → { id, type, size }.
  async function soundEffect(text, sec) {
    const res = await call('/sound-generation?output_format=mp3_44100_128', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, duration_seconds: sec, prompt_influence: 0.55 }),
    });
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) throw new Error('ElevenLabs hat eine leere Datei geliefert.');
    fs.mkdirSync(mediaDir, { recursive: true });
    const id = `media_${crypto.randomBytes(12).toString('hex')}`;
    fs.writeFileSync(path.join(mediaDir, `${id}.mp3`), buf);
    return { id, type: 'audio/mpeg', size: buf.length, name: 'KI-Effekt' };
  }

  // KI-Musik (ElevenLabs Music) nach Kompositionsplan → { id, type, size }.
  async function music(plan) {
    const res = await call('/music?output_format=mp3_44100_128', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ composition_plan: plan, model_id: 'music_v1', respect_sections_durations: true }),
    });
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) throw new Error('ElevenLabs hat eine leere Datei geliefert.');
    fs.mkdirSync(mediaDir, { recursive: true });
    const id = `media_${crypto.randomBytes(12).toString('hex')}`;
    fs.writeFileSync(path.join(mediaDir, `${id}.mp3`), buf);
    return { id, type: 'audio/mpeg', size: buf.length, name: 'KI-Musik' };
  }

  return { hasKey: () => !!key(), voices, setKey, speak, soundEffect, music };
}

module.exports = { createVoice };
