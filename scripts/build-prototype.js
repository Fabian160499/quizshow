'use strict';

// Baut den Browser-Prototyp nach dist-prototype/: dieselben Seiten wie die
// echte Anwendung, dazu die Spiellogik als Browser-Modul und ein lokaler Server.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist-prototype');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'demo'), { recursive: true });

// Die Startseite heißt im Prototyp start.html, weil index.html dort die
// Übersichtsseite mit allen Bildschirmen ist.
const rename = (text) => text.replace(/(['"`])index\.html/g, '$1start.html');
for (const f of ['index.html', 'team.html', 'moderator.html', 'beamer.html', 'host.html']) {
  const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
  fs.writeFileSync(path.join(OUT, f === 'index.html' ? 'start.html' : f), rename(text));
}
fs.cpSync(path.join(ROOT, 'assets'), path.join(OUT, 'assets'), { recursive: true });
const clientJs = path.join(OUT, 'assets', 'js', 'client.js');
fs.writeFileSync(clientJs, fs.readFileSync(clientJs, 'utf8').replace('const PROTOTYPE_BUILD = false;', 'const PROTOTYPE_BUILD = true;'));
const modJs = path.join(OUT, 'assets', 'js', 'moderator.js');
fs.writeFileSync(modJs, rename(fs.readFileSync(modJs, 'utf8')));
fs.copyFileSync(path.join(ROOT, 'prototype', 'index.html'), path.join(OUT, 'prototype.html'));
fs.copyFileSync(path.join(ROOT, 'prototype', 'local-server.js'), path.join(OUT, 'demo', 'local-server.js'));
// Starter für den entpackten Prototyp: kleiner Webserver plus Doppelklick-Dateien.
for (const f of fs.readdirSync(path.join(ROOT, 'prototype', 'starter'))) {
  fs.copyFileSync(path.join(ROOT, 'prototype', 'starter', f), path.join(OUT, f));
  if (f.endsWith('.command')) fs.chmodSync(path.join(OUT, f), 0o755);
}

// CommonJS-Module der Spiellogik in ein ES-Modul verpacken (alles aus server/
// außer dem HTTP-Server und der Dateispeicherung).
const modules = fs.readdirSync(path.join(ROOT, 'server'))
  .filter((f) => f.endsWith('.js') && !['server.js', 'store.js'].includes(f))
  .map((f) => f.slice(0, -3))
  .map((name) => {
    const src = fs.readFileSync(path.join(ROOT, 'server', `${name}.js`), 'utf8');
    return `  './${name}': function (module, exports, require) {\n${src}\n  },`;
  })
  .join('\n');

const bundle = `// Automatisch erzeugt von scripts/build-prototype.js – nicht von Hand ändern.
const cryptoShim = {
  randomBytes(n) {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(n));
    return { toString: () => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('') };
  },
  randomInt(max) {
    const buf = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / max) * max;
    do globalThis.crypto.getRandomValues(buf); while (buf[0] >= limit);
    return buf[0] % max;
  },
};
const factories = {
${modules}
};
const cache = {};
function require(name) {
  if (name === 'crypto') return cryptoShim;
  if (!cache[name]) {
    const module = { exports: {} };
    cache[name] = module;
    factories[name](module, module.exports, require);
  }
  return cache[name].exports;
}
export const game = require('./game');
export const probeLib = require('./probe');
`;
fs.writeFileSync(path.join(OUT, 'demo', 'game-bundle.js'), bundle);
console.log(`Prototyp gebaut: ${path.relative(ROOT, OUT)}/prototype.html`);
