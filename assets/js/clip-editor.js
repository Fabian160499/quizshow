// Ausschnitt schneiden: eine (auch lange) Aufnahme wählen, anhören, Anfang und Ende setzen,
// nur das Stück wird als WAV hochgeladen. Die zuletzt gewählte Aufnahme bleibt gemerkt, so kann
// man aus EINER langen Aufnahme nacheinander viele Lieder herausschneiden.
import { h, showModal, toast } from './client.js';

let lastSource = null; // { url, name, file? } – bleibt für das nächste Feld gewählt
const FAST_MAX = 250 * 1024 * 1024; // bis zu dieser Größe: Wellenform + Schnitt sofort; darüber in Echtzeit

const fmt = (t) => {
  if (!Number.isFinite(t)) return '–';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
};

// Ganze Datei dekodieren (rate: Abtastrate; klein = wenig Speicher, nur für die Wellenform)
async function decode(src, rate) {
  const data = src.file ? await src.file.arrayBuffer() : await (await fetch(src.url)).arrayBuffer();
  const ctx = new OfflineAudioContext(1, 1, rate);
  return new Promise((res, rej) => ctx.decodeAudioData(data, res, rej));
}

function wavFile(channels, rate, name) {
  const n = channels[0].length, nc = channels.length;
  const buf = new ArrayBuffer(44 + n * nc * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + n * nc * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nc, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * nc * 2, true); v.setUint16(32, nc * 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, n * nc * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) { const x = Math.max(-1, Math.min(1, channels[c][i])); v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true); o += 2; }
  return new File([buf], name, { type: 'audio/wav' });
}

// Kleine Dateien: dekodieren und ausschneiden (sofort).
async function cutFast(src, a, b, name) {
  const buf = await decode(src, 44100);
  const i0 = Math.floor(a * buf.sampleRate), i1 = Math.min(buf.length, Math.ceil(b * buf.sampleRate));
  const chans = Array.from({ length: Math.min(2, buf.numberOfChannels) }, (_, c) => buf.getChannelData(c).slice(i0, i1));
  fadeEdges(chans, buf.sampleRate);
  return wavFile(chans, buf.sampleRate, name);
}
// Große Dateien (z. B. lange Bildschirmaufnahme): Stück in Echtzeit abspielen und mitschneiden.
function cutLive(src, a, b, name, onProgress) {
  return new Promise((resolve, reject) => {
    const ctx = new AudioContext();
    const el = new Audio(src.url);
    el.crossOrigin = 'anonymous';
    const node = ctx.createMediaElementSource(el);
    const proc = ctx.createScriptProcessor(4096, 2, 2);
    const mute = ctx.createGain(); mute.gain.value = 0; // leise mitschneiden
    node.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
    const L = [], R = [];
    let on = false, done = false;
    const finish = () => {
      if (done) return; done = true;
      el.pause(); ctx.close();
      const join = (parts) => { const out = new Float32Array(parts.reduce((s, p) => s + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
      const chans = [join(L), join(R)];
      if (!chans[0].length) return reject(new Error('Der Ausschnitt ist leer.'));
      fadeEdges(chans, ctx.sampleRate);
      resolve(wavFile(chans, ctx.sampleRate, name));
    };
    proc.onaudioprocess = (ev) => {
      if (!on || done) return;
      const t = el.currentTime;
      L.push(new Float32Array(ev.inputBuffer.getChannelData(0)));
      R.push(new Float32Array(ev.inputBuffer.getChannelData(ev.inputBuffer.numberOfChannels > 1 ? 1 : 0)));
      onProgress(Math.min(1, (t - a) / (b - a)));
      if (t >= b || el.ended) finish();
    };
    el.addEventListener('seeked', () => { on = true; ctx.resume().then(() => el.play()).catch(reject); }, { once: true });
    el.addEventListener('error', () => reject(new Error('Die Aufnahme lässt sich nicht abspielen.')));
    el.addEventListener('loadedmetadata', () => { el.currentTime = a; }, { once: true });
  });
}
function fadeEdges(chans, rate) {
  const f = Math.min(Math.floor(rate * 0.01), Math.floor(chans[0].length / 2)); // 10 ms gegen Knacken
  for (const ch of chans) for (let i = 0; i < f; i++) { const g = i / f; ch[i] *= g; ch[ch.length - 1 - i] *= g; }
}

// Öffnet den Schnitt-Bereich. current: { url, name } der Datei im Feld (zum Nachschneiden).
// onSave(file) bekommt das fertige Stück als WAV-Datei.
export function openClipEditor({ title = 'Ausschnitt schneiden', current = null, hint = '', onSave }) {
  let src = lastSource || current;
  let a = 0, b = 0, peaks = null, playing = null; // playing: Ende des „Ausschnitt anhören“
  const audio = h('audio', { preload: 'auto' });
  const canvas = h('canvas', { class: 'clip-wave', height: '90' });
  const nameEl = h('b', {});
  const posEl = h('span', { class: 'clip-pos' });
  const aEl = h('span', { class: 'clip-time' }), bEl = h('span', { class: 'clip-time' }), lenEl = h('span', {});
  const status = h('p', { class: 'muted small clip-status' });
  const playBtn = h('button', { type: 'button', class: 'btn small' }, '▶ Abspielen');
  const saveBtn = h('button', { type: 'button', class: 'btn' }, '✂ Ausschnitt übernehmen');
  const pickLabel = h('span', {}, src ? 'Andere Aufnahme wählen' : '+ Aufnahme wählen');
  const fileIn = h('input', { type: 'file', class: 'visually-hidden', accept: 'audio/*,video/*,.mp3,.m4a,.wav,.mp4,.mov,.m4v,.webm,.ogg,.aac,.flac' });

  const dur = () => audio.duration || 0;
  const clampAB = () => {
    const d = dur();
    a = Math.max(0, Math.min(a, d)); b = Math.max(0, Math.min(b, d));
    if (b < a) [a, b] = [b, a];
  };
  const update = () => {
    clampAB();
    aEl.textContent = fmt(a); bEl.textContent = fmt(b);
    lenEl.textContent = `Länge: ${(b - a).toFixed(1)} s`;
    posEl.textContent = `${fmt(audio.currentTime)} / ${fmt(dur())}`;
    playBtn.textContent = audio.paused ? '▶ Abspielen' : '⏸ Pause';
    saveBtn.disabled = !(b - a >= 0.5);
    draw();
  };
  const draw = () => {
    const w = canvas.clientWidth || 600, H = 90;
    if (canvas.width !== w) canvas.width = w;
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, w, H);
    g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(0, 0, w, H);
    const d = dur();
    if (!d) return;
    const x = (t) => (t / d) * w;
    g.fillStyle = 'rgba(31,214,242,.22)'; g.fillRect(x(a), 0, Math.max(1, x(b) - x(a)), H);
    if (peaks) {
      g.fillStyle = 'rgba(255,255,255,.7)';
      for (let i = 0; i < w; i++) { const p = peaks[Math.floor((i / w) * peaks.length)] || 0; const hh = Math.max(1, p * (H - 6)); g.fillRect(i, (H - hh) / 2, 1, hh); }
    } else {
      g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(0, H / 2 - 1, w, 2);
    }
    g.fillStyle = '#1fd6f2'; g.fillRect(x(a) - 1, 0, 2, H); g.fillRect(x(b) - 1, 0, 2, H);
    g.fillStyle = '#ff2d8a'; g.fillRect(x(audio.currentTime) - 1, 0, 2, H);
  };
  const loadSource = async (s) => {
    src = s; peaks = null; a = 0; b = 0;
    nameEl.textContent = s ? s.name : 'Noch keine Aufnahme gewählt';
    pickLabel.textContent = s ? 'Andere Aufnahme wählen' : '+ Aufnahme wählen';
    if (!s) { update(); return; }
    audio.src = s.url;
    status.textContent = 'Aufnahme wird geladen …';
    await new Promise((res) => { audio.addEventListener('loadedmetadata', res, { once: true }); audio.addEventListener('error', res, { once: true }); });
    if (!dur()) { status.textContent = 'Diese Datei lässt sich hier nicht abspielen.'; update(); return; }
    b = Math.min(dur(), 30);
    update();
    const big = s.file && s.file.size > FAST_MAX;
    status.textContent = big ? 'Lange Aufnahme: Wellenform wird nicht angezeigt, Schneiden läuft in Echtzeit mit.' : 'Wellenform wird berechnet …';
    if (big) return;
    try {
      const buf = await decode(s, 8000);
      if (src !== s) return;
      const d = buf.getChannelData(0), n = 2000, step = Math.max(1, Math.floor(d.length / n));
      const out = new Float32Array(n);
      let mx = 0;
      for (let i = 0; i < n; i++) { let m = 0; for (let j = i * step; j < Math.min(d.length, (i + 1) * step); j++) m = Math.max(m, Math.abs(d[j])); out[i] = m; mx = Math.max(mx, m); }
      peaks = out.map((p) => p / (mx || 1));
      status.textContent = '';
      draw();
    } catch { status.textContent = ''; }
  };

  // Klicken: Abspielposition. Ziehen: neuen Ausschnitt aufziehen. Griffe (Anfang/Ende) verschieben.
  canvas.addEventListener('pointerdown', (ev) => {
    const d = dur(); if (!d) return;
    const r = canvas.getBoundingClientRect();
    const t = (cx) => Math.max(0, Math.min(d, ((cx - r.left) / r.width) * d));
    const t0 = t(ev.clientX);
    const near = (u) => Math.abs(((u / d) * r.width) - (ev.clientX - r.left)) < 8;
    const mode = near(a) ? 'a' : near(b) ? 'b' : 'new';
    let moved = false;
    canvas.setPointerCapture(ev.pointerId);
    const move = (m) => {
      const tt = t(m.clientX);
      if (Math.abs(m.clientX - ev.clientX) > 4) moved = true;
      if (!moved) return;
      if (mode === 'a') a = tt; else if (mode === 'b') b = tt; else { a = Math.min(t0, tt); b = Math.max(t0, tt); }
      update();
    };
    const up = () => {
      canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up);
      if (!moved) { audio.currentTime = t0; playing = null; }
      update();
    };
    canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up);
  });

  const seek = (dt) => { audio.currentTime = Math.max(0, Math.min(dur(), audio.currentTime + dt)); update(); };
  const nudge = (which, dt) => { if (which === 'a') a += dt; else b += dt; clampAB(); if (which === 'a') audio.currentTime = a; else audio.currentTime = Math.max(a, b - 2); update(); };
  const toggle = () => { playing = null; if (audio.paused) audio.play().catch(() => {}); else audio.pause(); };
  playBtn.onclick = toggle;
  const nb = (label, fn, title) => h('button', { type: 'button', class: 'btn small ghost', title, onclick: fn }, label);
  const edgeRow = (label, which, el) => h('div', { class: 'clip-edge' },
    h('span', { class: 'clip-edge-label' }, label), el,
    nb('−1', () => nudge(which, -1)), nb('−0,1', () => nudge(which, -0.1)), nb('+0,1', () => nudge(which, 0.1)), nb('+1', () => nudge(which, 1)),
    h('button', { type: 'button', class: 'btn small', onclick: () => { if (which === 'a') a = audio.currentTime; else b = audio.currentTime; update(); } }, '⤓ Hier setzen'));

  fileIn.onchange = () => {
    const f = fileIn.files && fileIn.files[0];
    fileIn.value = '';
    if (!f) return;
    if (lastSource && lastSource.file) URL.revokeObjectURL(lastSource.url);
    lastSource = { url: URL.createObjectURL(f), name: f.name, file: f };
    audio.pause();
    loadSource(lastSource);
  };

  saveBtn.onclick = async () => {
    if (!src || !(b - a >= 0.5)) return;
    audio.pause();
    saveBtn.disabled = true;
    const name = `${(src.name || 'Aufnahme').replace(/\.[^.]+$/, '')} ${fmt(a).replace(':', '-')}.wav`;
    try {
      const big = src.file && src.file.size > FAST_MAX;
      status.textContent = big ? 'Wird mitgeschnitten … 0 %' : 'Wird geschnitten …';
      const file = big
        ? await cutLive(src, a, b, name, (p) => { status.textContent = `Wird mitgeschnitten … ${Math.round(p * 100)} %`; })
        : await cutFast(src, a, b, name);
      close();
      onSave(file);
    } catch (err) {
      status.textContent = '';
      toast(err.message || 'Schneiden hat nicht geklappt.');
      saveBtn.disabled = false;
    }
  };

  const body = h('div', { class: 'clipper' },
    h('div', { class: 'clip-src' },
      h('span', {}, 'Aufnahme: '), nameEl,
      h('label', { class: 'btn small' }, fileIn, pickLabel),
      current && lastSource && current.url !== lastSource.url ? h('button', { type: 'button', class: 'btn small ghost', onclick: () => { audio.pause(); loadSource(current); } }, 'Datei aus dem Feld nehmen') : null),
    hint ? h('p', { class: 'muted small' }, hint) : null,
    canvas,
    h('div', { class: 'clip-transport' },
      nb('−10 s', () => seek(-10)), nb('−1 s', () => seek(-1)), playBtn, nb('+1 s', () => seek(1)), nb('+10 s', () => seek(10)), posEl),
    edgeRow('Anfang', 'a', aEl),
    edgeRow('Ende', 'b', bEl),
    h('div', { class: 'clip-actions' },
      h('button', { type: 'button', class: 'btn small', onclick: () => { audio.currentTime = a; playing = b; audio.play().catch(() => {}); } }, '▶ Ausschnitt anhören'),
      lenEl, saveBtn),
    status,
    h('p', { class: 'muted small' }, 'Tipp: Ziehen auf der Wellenform markiert einen Ausschnitt, Klicken springt dorthin. Leertaste = Abspielen/Pause.'));
  const close = showModal(title, body, { wide: true });
  body.append(audio);
  const onKey = (ev) => { if (ev.code === 'Space' && !/INPUT|TEXTAREA|BUTTON/.test(ev.target.tagName)) { ev.preventDefault(); toggle(); update(); } };
  document.addEventListener('keydown', onKey);
  audio.addEventListener('play', update); audio.addEventListener('pause', update);
  const loop = () => {
    if (!body.isConnected) { audio.pause(); audio.removeAttribute('src'); document.removeEventListener('keydown', onKey); return; }
    if (playing !== null && audio.currentTime >= playing) { audio.pause(); playing = null; }
    if (!audio.paused) update();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  loadSource(src);
}
