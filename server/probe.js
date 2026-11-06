'use strict';

// Probelauf: Ein Spiel der Show vor dem Showstart mit nur einem iPad ausprobieren.
// Alles läuft auf einer Kopie der Daten – die echte Show bleibt unverändert, nichts
// wird gespeichert. Das echte iPad meldet sich mit dem Code „DEMO“ als erstes Team
// an; die übrigen Teams sind simuliert und geben nach ein paar Sekunden eigene
// Antworten ab (buzzern zurückhaltend, damit das echte iPad meist schneller ist).
// Die Moderation spielt die Regie selbst in einem eigenen Probelauf-Fenster.

const PROBE_CODE = 'DEMO';
// Kleines „handschriftliches“ Kritzelbild für simulierte Antworten.
const BOT_INK = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAUAAAABuCAYAAABWQcpYAAAFN0lEQVR42u3d23LjOgxE0Ykq///LOU9zypXKxLqQAAiu/ZzYVhNoghBF/fkDAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAG/4IMHPfH19ff0v0scHnQAGuI/p/VMwZgi04ZME54zv+98zQhU1VIDbmZ8kHqMt/VCBgwSxxkkf+oEBMjG60h8MsGxv4AUJPNcs6QgGWLj606+aX1UzQWTgLvBDw3NH+JyB/dWI0fUd8xXz4DBwqsAqEwpzXCN3/tW2WHH89AAHGN3uiaudYJy/GyQDXHAQJWf+hKIKfF95ZWh0dZJbZRxVgIOSedfEvTOhmGiea5xphmd/7wo5cUhWSbnyknqHqi9br87joQJUBaZMKCacsaYzI/beGfC7fbIr5AQDlIwmkyYV8EjNzm5rWj1/DkHFME0o4nzXJbQKcKPBrnidqsDrldfsZeeV6m/1SW97A1StYMVYPWOElfKl6mS2hQHOEJ9xjtMlQ8vsfXWz4zSjj+hRONXfFku3yOsb9V3vDK/6mN3ZU3nV3O8sfVdvabQ3wJmiqwLH6TFTyyvnE2Yl6czKy75KFWDrKqn7dT1Zzl3934qPcUVMtCOqvxWrwG0NUPVmTH5L0CrL/LOazKwCO+dKawOMCGJGGqNDhScjuo7BzjcJ0wzwe0O6Y8B2u6bsCWXE9//9/CqPcUU+n17lHMxKeXFUSKRoE1S19a4od3mM66lu3scSfCT+lZMtngZm5MBGNs4rnmgTWSW8ewXBaH2yXnkwc4vW2Xh9+htWOBdwu5sg0cEcubm1y2w+o5f122dmTRyzxuvp0j7iKZMqsXpUHewnAnXsvWW/a7eSpj+1UGb+vhXj6a6J7dYeOjIC9qzgKwVepcCJXv5nfu6opVyl8Rv5W0bt3+uQF+EGeOZAxUgTXHGpE7kJuFtVfLUKipyMK01SWQcrVIjPtB7gd8FHBV+npB9xLVU+I3rCuvu/uy0Bd98RcWQk790Hu6sP9MjvOHMU+SudE/Tq9a18yMXMlsKrlpFxUzk+j4yAnrUMqVz9japiK723ODKwz/bxRvym7ndAd+1XhxngzGqtym72jO/K2MpRaVKpsJXFySqWwCHm0PGF2pmvOOy8R7BLC6B7K2MLA4x6fvLs93Q5NrzaVo7MgI7ofzosd49l8FE5Yc7uaF8pqH57xGt2MjpRhYlhogFmHKtT8dnYzO9e7W63Zds+mla8xqPrha8UUKNNfMRNJFXOeH1oWk+bzxUu4OqpEtXNL6J/ucJJHED7CnCUGZ1tend5prPCS4J2Xv5qKexxrUd2QnUPmBX7kCrH8TrRtKZGn6MT7fUiIjYFZx1YuaPBO0kblsAnl6qS8t5vzH6iQaVybUxWeEbdRBpogKqF6xPDzE29o5LXeK61tKPVybgmucB6bScwwGcajvy/XfWM1ORgDVD91TNNmjFABC6FLdPi2gmoAwOUwKq/SZqo/upPKAxQ0DG/QUs0VWDcxMwA0TYou+tC22sTysyJhQFKYgkakMy4F2uzTZABbhx4nU9Xzq4CGeEiY0kCIK7SM8E803O0fipAIMjImF/exKMCBJpVL7vpOEM/FSAQUA0yv2c6Tnv5FdmBuRUM87uvJ+2ApktiAAAAqOYQjfU1GNbsJNPHYoBPAloAMaytk1T8722AAtR4QHwyQGCxhO8Qv50NlAFCgon/bcdX4AlQhiU+GSD6JgDDQqaBij8ADBQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgB/5D0mwhLeeUBh2AAAAAElFTkSuQmCC';
const pickRandom = (list) => list[Math.floor(Math.random() * list.length)];

module.exports = function probeLib(game) {
  // Kopie der Daten anlegen, Spielstand leeren und das gewählte Spiel aufrufen.
  function createProbe(realDb, gameId, now = Date.now()) {
    const db = JSON.parse(JSON.stringify(realDb));
    delete db.auth;
    db.sandbox = `probe-${now}-${Math.random().toString(36).slice(2, 8)}`; // eigener Rückgängig-Verlauf
    const ctx = { role: 'moderator', actor: 'moderator', now };
    const idx = db.project.games.findIndex((g) => g.id === gameId);
    if (idx < 0) throw new game.QuizError('Spiel nicht gefunden.');
    if (db.project.teams.length < 1) throw new game.QuizError('Für den Probelauf braucht die Show mindestens ein Team.');
    game.applyAction(db, ctx, 'live.reset', { keepPoints: false, confirm: 'NEUSTART' });
    db.ledger = [];
    db.log = [];
    const step = game.moderatorView(db).rundown.findIndex((x) => x.kind === 'game' && x.pos === idx + 1);
    if (step >= 0) game.applyAction(db, ctx, 'run.goto', { index: step });
    else game.applyAction(db, ctx, 'show.activate', { gameId });
    const teams = db.project.teams.map((t) => t.id);
    const bots = {};
    for (const id of teams.slice(1)) bots[id] = now + 3000 + Math.random() * 3000;
    return { db, gameId, title: db.project.games[idx].title, teamId: teams[0], code: PROBE_CODE, bots };
  }

  // Typische Eingaben eines Teams; die erste, die passt, wird ausgeführt.
  function botMoves(db, teamId) {
    const st = db.live.games[db.live.activeGame] || {};
    const q = st.qIndex ?? st.index ?? 0;
    const abcd = pickRandom(['A', 'B', 'C', 'D']);
    const out = [];
    out.push(['tiePick', { pref: pickRandom(['start', 'follow']) }]);
    out.push(['submit', { text: pickRandom(['Keine Ahnung', 'Vielleicht das?', 'Ich glaube …', 'Unsere Antwort']) }]);
    out.push(['submit', { ink: BOT_INK, player: 1 }], ['submit', { ink: BOT_INK, player: 2 }], ['submit', { ink: BOT_INK }]);
    out.push(['answer', { choice: abcd }], ['answer', { value: Math.round(Math.random() * 100) }], ['answer', { ink: BOT_INK }]);
    out.push(['submit', { choice: abcd, stake: q + 1 }], ['submit', { order: [0, 1, 2, 3, 4].sort(() => Math.random() - 0.5) }]);
    const g = db.project.games.find((x) => x.id === db.live.activeGame);
    const items = g && g.content.rounds && g.content.rounds[q] && g.content.rounds[q].items;
    if (items && items.length) out.push(['submit', { choice: items.map(() => pickRandom(['L', 'N', 'R'])) }]);
    out.push(['guess', { lat: 35 + Math.random() * 25, lng: -5 + Math.random() * 35 }], ['bid', { bid: 1 + Math.floor(Math.random() * 5) }]);
    for (const k of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].sort(() => Math.random() - 0.5)) out.push(['buy', { hint: k }]);
    out.push(['wheelBuzz', {}], ['spin', {}], ['decide', { choice: 'secure' }]);
    for (let k = 0; k < 24; k++) out.push(['choose', { q: k }]);
    for (let c = 0; c < 6; c++) for (const l of [1, 2, 3]) out.push(['pick', { c, l }], ['pick', { cat: c, field: l - 1 }]);
    const r = st.rounds && (st.rounds[st.catIndex] || st.rounds[st.index]);
    if (r && r.board) out.push(...r.board.filter((b) => !b.gone && !b.wrong).map((b) => ['pick', { termId: b.id }]), ['secure', {}]);
    if (r && r.pool && r.line) for (let pos = 0; pos <= r.line.length; pos++) out.push(['place', { item: r.pool[0], pos }]);
    for (const t of db.project.teams) if (t.id !== teamId) out.push(['pick', { teamId: t.id }]);
    out.push(['vote', { letter: pickRandom(['A', 'B', 'C', 'D', 'E', 'F']) }]);
    out.push(['guess', { guesses: Object.fromEntries(db.project.teams.map((t) => [t.id, Math.random() < 0.5])) }]);
    out.push(['buzz', {}], ['buzz', { pick: 0 }]);
    return out;
  }

  // Simulierte Teams handeln, wenn ihre Wartezeit um ist. Gibt true zurück, wenn
  // sich etwas geändert hat.
  function botTick(probe, now = Date.now()) {
    let changed = false;
    for (const id of Object.keys(probe.bots)) {
      if (now < probe.bots[id]) continue;
      probe.bots[id] = now + 2500 + Math.random() * 4500;
      const ctx = { role: 'team', teamId: id, actor: `team:${id}`, now };
      for (const [name, payload] of botMoves(probe.db, id)) {
        // Buzzern zurückhaltend: das echte iPad soll meist schneller sein.
        if ((name === 'buzz' || name === 'wheelBuzz') && Math.random() > 0.25) continue;
        const before = JSON.stringify(probe.db.live);
        try {
          game.applyAction(probe.db, ctx, `play.${name}`, payload);
        } catch {
          // Aktion passt gerade nicht – Zustand ggf. zurücksetzen.
          if (JSON.stringify(probe.db.live) !== before) probe.db.live = JSON.parse(before);
          continue;
        }
        if (JSON.stringify(probe.db.live) !== before) { changed = true; break; }
      }
    }
    return changed;
  }

  // Team-Code „DEMO“ meldet das echte iPad als erstes Team im Probelauf an.
  const isProbeCode = (code) => String(code || '').trim().toUpperCase() === PROBE_CODE;

  return { createProbe, botTick, isProbeCode, PROBE_CODE };
};
