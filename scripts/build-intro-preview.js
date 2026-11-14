'use strict';

// Baut die Intro-Vorschau als EINE Datei: dist-single/intro-vorschau.html
// Beamer und iPads sind iframes mit srcdoc, Skripte, Styles, Schriften und
// Avatare sind eingebettet. Läuft per Doppelklick in Chrome/Safari ohne Server.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist-single');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
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
for (const f of fs.readdirSync(path.join(ROOT, 'assets', 'music'))) if (f.endsWith('.mp3')) music[f.slice(0, -4)] = dataUri(`assets/music/${f}`, 'audio/mpeg');
const inject = `<script>window.__SI_CAT = ${read('assets/data/show-intro.json')};
window.__SI_MUSIC = ${JSON.stringify(music)};
window.__FRAME = ${JSON.stringify(frame).replace(/<\/(script)/gi, '<\\/$1')};
window.__frame = (q) => window.__FRAME.replace('__QUERY__', q);</script>\n`;
page = page.replace(/<script type="module">/, (m) => `${inject}${m}\n    document.getElementById('beamer').srcdoc = __frame('role=beamer');`);
if (/src="intro-frame|assets\//.test(page.replace(/data:[^'")]+/g, ''))) console.warn('Warnung: Restverweise auf Dateien gefunden.');

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'intro-vorschau.html'), page);
console.log(`dist-single/intro-vorschau.html (${Math.round(page.length / 1024)} KB)`);
