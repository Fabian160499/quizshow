'use strict';

// Baut den Prototyp als EINE eigenständige HTML-Datei: dist-single/quizshow-prototyp.html
// Alle Seiten, Skripte und Styles sind eingebettet, nichts wird nachgeladen.
// So läuft der Prototyp auch dort, wo relative Dateien nicht erreichbar sind
// (z. B. abgeschottete Vorschauen) und per Doppelklick direkt von der Festplatte.
//
// Voraussetzung: vorher `npm run build:prototype` (liefert dist-prototype/).
// Die eingebetteten Bildschirme sind iframes mit srcdoc; Seitenwechsel und
// Verbindungen laufen per postMessage über die Hauptseite.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'dist-prototype');
const OUT = path.join(ROOT, 'dist-single');

if (!fs.existsSync(path.join(SRC, 'prototype.html'))) {
  console.error('dist-prototype fehlt – erst `npm run build:prototype` ausführen.');
  process.exit(1);
}

const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');

// --- Mini-Bundler für die hier verwendeten ES-Modul-Formen -------------------
// Unterstützt: import { a, b as c } from './x.js'; export function/async
// function/const/let/class. Mehr nutzt der Code nicht – alles andere bricht ab.

function bundle(entryCode, entryDir) {
  const defs = new Map();

  function addModule(id, code, dir) {
    if (defs.has(id)) return;
    defs.set(id, null);
    const exportsList = [];
    let body = code.replace(/^\s*import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"];?/gm, (_, names, spec) => {
      const file = path.normalize(path.join(dir, spec));
      const depId = path.relative(SRC, file).split(path.sep).join('/');
      addModule(depId, fs.readFileSync(file, 'utf8'), path.dirname(file));
      const binding = names.split(',').map((n) => n.trim()).filter(Boolean)
        .map((n) => n.replace(/\s+as\s+/, ': ')).join(', ');
      return `const { ${binding} } = __req(${JSON.stringify(depId)});`;
    });
    body = body.replace(/^(\s*)export\s+(async\s+function|function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm, (_, ws, kind, name) => {
      exportsList.push(name);
      return `${ws}${kind} ${name}`;
    });
    if (/^\s*(import|export)\b/m.test(body)) {
      const line = body.split('\n').find((l) => /^\s*(import|export)\b/.test(l));
      throw new Error(`Nicht unterstützte Modul-Syntax in ${id}: ${line.trim()}`);
    }
    defs.set(id, `function () {\n${body}\nreturn { ${exportsList.join(', ')} };\n}`);
  }

  addModule('__entry__', entryCode, entryDir);
  const parts = [...defs].map(([id, fn]) => `__defs[${JSON.stringify(id)}] = ${fn};`);
  const code = `(function () {
const __defs = {};
const __cache = {};
function __req(id) {
  if (!(id in __cache)) __cache[id] = __defs[id]();
  return __cache[id];
}
${parts.join('\n')}
const __start = () => __req('__entry__');
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', __start);
else __start();
})();`;
  // In einem eingebetteten <script> darf kein schließendes Script-Tag vorkommen.
  return code.replace(/<\/(script)/gi, '<\\/$1');
}

// --- Seiten (Bildschirme) als srcdoc-Vorlagen --------------------------------

const css = read('assets/css/style.css');

// Läuft in jedem Bildschirm vor dessen Code: Seitenwechsel, Links und
// verschachtelte Bildschirme (Beamer-Vorschau) gehen über die Hauptseite.
const PRELUDE = `
window.__search = "__QUERY__";
window.__nav = function (url) { parent.postMessage({ quiz: true, op: 'nav', url: String(url) }, '*'); };
window.__replaceState = function () {};
document.addEventListener('click', function (ev) {
  var a = ev.target && ev.target.closest && ev.target.closest('a[href]');
  if (!a) return;
  var href = a.getAttribute('href');
  if (!/\\.html/.test(href)) return;
  ev.preventDefault();
  if (a.target === '_blank') parent.postMessage({ quiz: true, op: 'focus', url: href }, '*');
  else window.__nav(href);
}, true);
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('iframe[data-page]').forEach(function (frame) {
    var reqId = 'p' + Math.random().toString(36).slice(2);
    window.addEventListener('message', function on(ev) {
      var m = ev.data;
      if (ev.source !== parent || !m || m.quiz !== true || m.op !== 'page' || m.reqId !== reqId) return;
      window.removeEventListener('message', on);
      frame.srcdoc = m.html;
    });
    parent.postMessage({ quiz: true, op: 'page', reqId: reqId, url: frame.dataset.page }, '*');
  });
});
`;

function pageCode(code) {
  return code
    .replace(/location\.href\s*=\s*([^;\n]+);/g, '__nav($1);')
    .replace(/location\.search/g, '__search')
    .replace(/history\.replaceState\(/g, '__replaceState(');
}

function buildPage(file) {
  let html = read(file);
  html = html.replace(/<link rel="stylesheet" href="assets\/css\/style\.css">/, () => `<style>\n${css}\n</style>`);
  html = html.replace(/<iframe([^>]*?)\ssrc="([^"]+\.html[^"]*)"/g, '<iframe$1 data-page="$2"');
  let entry;
  const inline = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  const external = html.match(/<script type="module" src="([^"]+)"><\/script>/);
  if (inline) entry = { code: inline[1], dir: SRC, tag: inline[0] };
  else if (external) {
    const file = path.join(SRC, external[1]);
    entry = { code: fs.readFileSync(file, 'utf8'), dir: path.dirname(file), tag: external[0] };
  } else throw new Error(`Kein Skript in ${file}`);
  const js = pageCode(bundle(entry.code, entry.dir));
  html = html.replace(entry.tag, () => `<script>${PRELUDE.replace(/<\/(script)/gi, '<\\/$1')}</script>\n<script>${js}</script>`);
  html = inlineImages(html);
  if (/(src|href)="(assets|demo)\//.test(html)) throw new Error(`Externe Datei in ${file} übrig`);
  return html;
}

// Bilder aus assets/img als data:-URIs einbetten.
const MIME = { '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml' };
const imageCache = {};
function inlineImages(text) {
  return text.replace(/assets\/img\/([\w.-]+)/g, (_, name) => {
    if (!imageCache[name]) {
      const file = path.join(SRC, 'assets', 'img', name);
      const mime = MIME[path.extname(name).toLowerCase()] || 'application/octet-stream';
      imageCache[name] = `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
    }
    return imageCache[name];
  });
}

const pages = {};
for (const f of ['start.html', 'team.html', 'moderator.html', 'beamer.html', 'host.html']) pages[f] = buildPage(f);

// --- Hauptseite ---------------------------------------------------------------

let main = read('prototype.html');
// Die Datei-Warnung gilt hier nicht: die Einzeldatei läuft auch per Doppelklick.
main = main.replace(/<script>\s*\/\/ Direkt per Doppelklick[\s\S]*?<\/script>\s*/, '');
const mainScript = main.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!mainScript) throw new Error('Skript der Hauptseite nicht gefunden');
let mainCode = mainScript[1]
  .replaceAll('iframe.src = s.src;', '__setPage(iframe, s.src);')
  .replace('for (const f of frames) f.iframe.src = f.s.src;', 'for (const f of frames) __setPage(f.iframe, f.s.src);');
if (/\.src\s*=/.test(mainCode)) throw new Error('Unbehandelte iframe-Adresse in der Hauptseite');

const MAIN_PRELUDE = `
const __PAGES = ${JSON.stringify(pages).replace(/<\/(script)/gi, '<\\/$1')};
function __pageHtml(url) {
  const [file, query] = String(url).split('?');
  let name = file.replace(/^.*\\//, '');
  if (name === 'index.html') name = 'start.html';
  const tpl = __PAGES[name] || __PAGES['start.html'];
  return tpl.replace('"__QUERY__"', JSON.stringify(query ? '?' + query : ''));
}
function __setPage(iframe, url) {
  iframe.srcdoc = __pageHtml(url);
}
window.addEventListener('message', (ev) => {
  const msg = ev.data;
  if (!msg || msg.quiz !== true || !ev.source) return;
  const frame = [...document.querySelectorAll('#stage iframe')].find((f) => f.contentWindow === ev.source);
  if (msg.op === 'nav' && frame) __setPage(frame, msg.url);
  else if (msg.op === 'page') {
    try { ev.source.postMessage({ quiz: true, op: 'page', reqId: msg.reqId, html: __pageHtml(msg.url) }, '*'); } catch {}
  } else if (msg.op === 'focus') {
    const name = String(msg.url).split('?')[0].replace(/^.*\\//, '').replace('.html', '');
    const tab = document.querySelector('#tabs button[data-id="' + name + '"]');
    if (tab) tab.click();
  }
});
`;

const mainJs = bundle(MAIN_PRELUDE + mainCode, SRC);
main = main.replace(mainScript[0], () => `<script>${mainJs}</script>`);
if (/(src|href)="(assets|demo)\//.test(main) || /import\s*\{/.test(main.replace(/<script>[\s\S]*<\/script>/, ''))) {
  throw new Error('Externe Datei in der Hauptseite übrig');
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const outFile = path.join(OUT, 'quizshow-prototyp.html');
fs.writeFileSync(outFile, main);
console.log(`Einzeldatei gebaut: ${path.relative(ROOT, outFile)} (${Math.round(fs.statSync(outFile).size / 1024)} KB)`);
