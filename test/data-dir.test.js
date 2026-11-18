'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveDataDir, backupDb, KEEP_BACKUPS } = require('../server/data-dir');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'qs-data-'));

test('Daten außerhalb des Programmordners; alter Ordner „data“ wird einmalig kopiert, nicht gelöscht', () => {
  const root = tmp(), home = tmp();
  fs.mkdirSync(path.join(root, 'data', 'media'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data', 'db.json'), '{"alt":1}');
  fs.writeFileSync(path.join(root, 'data', 'media', 'm.mp3'), 'x');
  const r = resolveDataDir({ root, env: {}, home, log: () => {} });
  assert.equal(r.dir, path.join(home, 'Quizshow-Daten'));
  assert.equal(r.moved, true);
  assert.equal(fs.readFileSync(r.file, 'utf8'), '{"alt":1}');
  assert.ok(fs.existsSync(path.join(r.dir, 'media', 'm.mp3')));
  assert.ok(fs.existsSync(path.join(root, 'data', 'db.json')), 'Original bleibt liegen');
  // zweiter Start: nichts wird überschrieben
  fs.writeFileSync(r.file, '{"neu":1}');
  const r2 = resolveDataDir({ root, env: {}, home, log: () => {} });
  assert.equal(r2.moved, false);
  assert.equal(fs.readFileSync(r2.file, 'utf8'), '{"neu":1}');
  // Programmordner ersetzt (Update): Daten bleiben
  fs.rmSync(root, { recursive: true });
  assert.equal(fs.readFileSync(resolveDataDir({ root, env: {}, home, log: () => {} }).file, 'utf8'), '{"neu":1}');
});

test('Sicherung beim Start, höchstens 14 bleiben', () => {
  const dir = tmp(); const file = path.join(dir, 'db.json');
  fs.writeFileSync(file, '{}');
  for (let i = 0; i < KEEP_BACKUPS + 3; i++) backupDb(file, new Date(2026, 10, 1 + i, 12, 0));
  const list = fs.readdirSync(path.join(dir, 'backups'));
  assert.equal(list.length, KEEP_BACKUPS);
  assert.ok(list.includes('db-2026-11-17_12-00.json'));
  assert.ok(!list.includes('db-2026-11-01_12-00.json'));
});
