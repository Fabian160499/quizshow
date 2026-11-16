'use strict';

// Baut die Intro-Vorschau als EINE Datei: dist-single/intro-vorschau.html
// Beamer und iPads sind iframes mit srcdoc, Skripte, Styles, Schriften und
// Avatare sind eingebettet. Läuft per Doppelklick in Chrome/Safari ohne Server.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist-single');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const THREE_FILES = ['three.min.js', 'CopyShader.js', 'LuminosityHighPassShader.js', 'EffectComposer.js', 'RenderPass.js', 'ShaderPass.js', 'UnrealBloomPass.js', 'Reflector.js'];
const threeSrc = () => THREE_FILES.map((f) => fs.readFileSync(path.join(ROOT, 'assets', 'vendor', 'three', f), 'utf8')).join('\n;\n');
const FIGURES = ['host-stand', 'host-walk', 'host-mic', 'cohost-stand', 'cohost-walk', 'cohost-mic'].map((n) => `assets/img/${n}.webp`);
const figureImgs = () => Object.fromEntries([...FIGURES, 'assets/img/avatar-host.webp', 'assets/img/avatar-cohost.webp'].map((p) => [p, `data:image/webp;base64,${fs.readFileSync(path.join(ROOT, p)).toString('base64')}`]));
// three.js und Figuren einmal auf der äußeren Seite (die Bildschirme holen sie sich über parent/top)
const threeInject = () => `window.__THREE_SRC = ${JSON.stringify(threeSrc()).replace(/<\/(script)/gi, '<\\/$1')};\nwindow.__SI_IMG = ${JSON.stringify(figureImgs())};`;
const dataUri = (rel, mime) => `data:${mime};base64,${fs.readFileSync(path.join(ROOT, rel)).toString('base64')}`;

function bundle(entryCode) {
  const defs = new Map();
  function addModule(id, code, dir) {
    if (defs.has(id)) return;
    defs.set(id, null);
    const exportsList = [];
    let body = code.replace(/^\s*import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?/gm, (_, names, spec) => {
      const file = path.normalize(path.join(dir, spec));
      const depId = path.relative(ROOT, file).split(path.sep).join('/');
      addModule(depId, fs.readFileSync(file, 'utf8'), path.dirname(file));
      const binding = names.split(',').map((n) => n.trim()).filter(Boolean).map((n) => n.replace(/\s+as\s+/, ': ')).join(', ');
      return `const { ${binding} } = __req(${JSON.stringify(depId)});`;
    });
    body = body.replace(/^(\s*)export\s+(async\s+function|function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm, (_, ws, kind, name) => {
      exportsList.push(name);
      return `${ws}${kind} ${name}`;
    });
    if (/^\s*(import|export)\b/m.test(body)) throw new Error(`Nicht unterstützte Modul-Syntax in ${id}`);
    defs.set(id, `function () {\n${body}\nreturn { ${exportsList.join(', ')} };\n}`);
  }
  addModule('__entry__', entryCode, ROOT);
  const parts = [...defs].map(([id, fn]) => `__defs[${JSON.stringify(id)}] = ${fn};`);
  return `(function () {
const __defs = {}; const __cache = {};
function __req(id) { if (!(id in __cache)) __cache[id] = __defs[id](); return __cache[id]; }
${parts.join('\n')}
__req('__entry__');
})();`.replace(/<\/(script)/gi, '<\\/$1');
}

const css = (read('assets/css/style.css').replace(/^@import url\([^)]*\);\s*/m, '') + '\n' + read('assets/css/show-intro.css'))
  .replace(/url\(['"]?\.\.\/fonts\/([\w.-]+)['"]?\)/g, (_, name) => `url(${dataUri(`assets/fonts/${name}`, `font/${path.extname(name).slice(1)}`)})`);

// --- Bildschirm (Beamer / iPad) ---
let frame = read('intro-frame.html');
const frameScript = frame.match(/<script type="module">([\s\S]*?)<\/script>/)[1]
  .replace(/new URLSearchParams\(location\.search\)/, 'new URLSearchParams(window.__search || "")');
frame = frame
  .replace(/<link rel="stylesheet" href="assets\/css\/style\.css">/, () => `<style>\n${css}\n</style>`)
  .replace(/\s*<link rel="stylesheet" href="assets\/css\/show-intro\.css">/, '')
  .replace(/<script type="module">[\s\S]*?<\/script>/, () => `<script>window.__search = "__QUERY__";\n${bundle(frameScript)}</script>`);

// --- Vorschau-Seite ---
let page = read('intro-vorschau.html')
  .replace(/<link rel="stylesheet" href="assets\/css\/show-intro\.css">/, () => `<style>\n${css}\n</style>`)
  .replace(/'assets\/img\/avatar-host\.webp'/, () => `'${dataUri('assets/img/avatar-host.webp', 'image/webp')}'`)
  .replace(/'assets\/img\/avatar-cohost\.webp'/, () => `'${dataUri('assets/img/avatar-cohost.webp', 'image/webp')}'`)
  .replace(/<iframe id="beamer" title="Beamer" src="intro-frame\.html\?role=beamer">/, '<iframe id="beamer" title="Beamer">')
  .replace(/f\.src = `intro-frame\.html\?role=ipad&i=\$\{i\}`;/, 'f.srcdoc = __frame("role=ipad&i=" + i);');
const music = {};
// Für die Einzeldatei kleiner kodiert (48 kbit/s), damit sie unter 20 MB bleibt.
const { execFileSync } = require('child_process');
for (const f of fs.readdirSync(path.join(ROOT, 'assets', 'music'))) {
  if (!f.endsWith('.mp3')) continue;
  const tmp = path.join(require('os').tmpdir(), `siprev-${f}`);
  try { execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(ROOT, 'assets', 'music', f), '-codec:a', 'libmp3lame', '-b:a', '48k', tmp]); music[f.slice(0, -4)] = `data:audio/mpeg;base64,${fs.readFileSync(tmp).toString('base64')}`; } catch { music[f.slice(0, -4)] = dataUri(`assets/music/${f}`, 'audio/mpeg'); }
}
const inject = `<script>window.__SI_CAT = ${read('assets/data/show-intro.json')};
${threeInject()}
window.__SI_MUSIC = ${JSON.stringify(music)};
window.__FRAME = ${JSON.stringify(frame).replace(/<\/(script)/gi, '<\\/$1')};
window.__frame = (q) => window.__FRAME.replace('__QUERY__', q);</script>\n`;
page = page.replace(/<script type="module">/, (m) => `${inject}${m}\n    document.getElementById('beamer').srcdoc = __frame('role=beamer');`);
if (/src="intro-frame|assets\//.test(page.replace(/data:[^'")]+/g, ''))) console.warn('Warnung: Restverweise auf Dateien gefunden.');

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'intro-vorschau.html'), page);
console.log(`dist-single/intro-vorschau.html (${Math.round(page.length / 1024)} KB)`);
