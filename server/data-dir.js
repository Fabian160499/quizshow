'use strict';

// Wo die Show-Daten liegen (Shows, Spiele, hochgeladene Medien, KI-Schlüssel).
// Seit 18.11.2026 AUSSERHALB des Programmordners: im Benutzerordner unter „Quizshow-Daten“.
// So kann ein Update (neuen Quizshow-Ordner entpacken, alten ersetzen) nie mehr Daten löschen.
// Beim ersten Start wird ein vorhandener alter Ordner „data“ im Programmordner dorthin kopiert
// (das Original bleibt liegen). Bei jedem Start entsteht eine Sicherung der Datenbank.

const fs = require('fs');
const os = require('os');
const path = require('path');

const KEEP_BACKUPS = 14;

function resolveDataDir({ root, env = process.env, home = os.homedir(), log = console.log } = {}) {
  if (env.QUIZ_DATA_FILE) return { file: env.QUIZ_DATA_FILE, dir: path.dirname(env.QUIZ_DATA_FILE), moved: false };
  const dir = env.QUIZ_DATA_DIR || path.join(home, 'Quizshow-Daten');
  const file = path.join(dir, 'db.json');
  const old = path.join(root, 'data');
  let moved = false;
  if (!fs.existsSync(file) && fs.existsSync(path.join(old, 'db.json'))) {
    fs.mkdirSync(dir, { recursive: true });
    fs.cpSync(old, dir, { recursive: true, force: false, errorOnExist: false });
    moved = true;
    log(`  Daten aus „${old}“ nach „${dir}“ kopiert (der alte Ordner bleibt als Reserve liegen).`);
  }
  fs.mkdirSync(dir, { recursive: true });
  return { file, dir, moved };
}

// Sicherung beim Start: backups/db-JJJJ-MM-TT_HH-MM.json, die letzten KEEP_BACKUPS bleiben.
function backupDb(file, now = new Date()) {
  if (!fs.existsSync(file)) return null;
  const dir = path.join(path.dirname(file), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const p2 = (n) => String(n).padStart(2, '0');
  const name = `db-${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}_${p2(now.getHours())}-${p2(now.getMinutes())}.json`;
  const target = path.join(dir, name);
  fs.copyFileSync(file, target);
  const all = fs.readdirSync(dir).filter((f) => /^db-.*\.json$/.test(f)).sort();
  for (const f of all.slice(0, Math.max(0, all.length - KEEP_BACKUPS))) fs.rmSync(path.join(dir, f), { force: true });
  return target;
}

module.exports = { resolveDataDir, backupDb, KEEP_BACKUPS };
