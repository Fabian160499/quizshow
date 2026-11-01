'use strict';

// Punktwerte je Spiel („wie viele Punkte wofür“) – im Editor bei jedem Spiel
// änderbar, die Spielregeln selbst bleiben gleich. Leere Felder = Standardwert.
// Spiele, deren Punkte sich aus Einsätzen/Geboten ergeben (Dumm, dumm, dumm;
// Nerd; Zocken; Brain), haben keine festen Werte; „Hits me baby“ hat seine
// Staffelung schon im eigenen Feld.

const JAUCH_LADDER = [1, 2, 4, 5, 6, 8, 10, 15];

const S = (key, label, def) => ({ key, label, def });
const SCORING = {
  leichte5: [S('correct', 'Richtige Antwort', 1)],
  dummes: [S('correct', 'Richtige Antwort', 1)],
  land: [S('winner', 'Am nächsten dran / im gesuchten Land', 1)],
  kassenschlager: [S('divisor', 'Umrechnung am Ende: so viele $ ergeben 1 Punkt (aufgerundet)', 2)],
  trumpf5: [1, 2, 3, 4, 5].map((n) => S(`hint${n}`, `Richtig nach Hinweis ${n}`, 6 - n)),
  musik: [1, 2, 3].map((n) => S(`field${n}`, `Feld ${n} (Zeile ${n} im Spielbrett)`, n)),
  jauch: JAUCH_LADDER.map((v, i) => S(`q${i + 1}`, `Gewinnstufe Frage ${i + 1}`, v)),
  filmab: [S('correct', 'Richtig erkannter Film', 1)],
  weissnicht: [S('winner', 'Gewinner der Runde', 1)],
  weissnicht2: [S('guess', 'Buzzer-Team: je richtige Einschätzung', 1), S('own', 'Buzzer-Team: eigene richtige Antwort', 1), S('other', 'Alle anderen Teams: richtige Antwort', 1)],
  songsong: [S('correct', 'Beide Songs erkannt', 1)],
  dgf: [S('term', 'Je richtig ausgewählter Begriff', 1)],
  fragen: [S('correct', 'Richtige Antwort auf die Frage', 1), S('askerNobody', 'Fragesteller, wenn niemand richtig liegt', 2), S('askerSomeone', 'Fragesteller, wenn jemand richtig liegt', -1)],
  nerd: [S('maxPenalty', 'Höchststrafe beim gescheiterten zweiten Versuch', 3)],
  zuweit: [S('best', 'Bestes Ergebnis der Runde', 2), S('worst', 'Schlechtestes Ergebnis der Runde', -1)],
  sortieren: [S('position', 'Je Element auf dem richtigen Platz', 1)],
  gier: [1, 2, 3, 4, 5, 6].map((n, i) => S(`place${n}`, `Platz ${n}`, [10, 6, 4, 3, 2, 1][i])),
  top100: [['1–20', 1], ['21–40', 2], ['41–60', 3], ['61–80', 4], ['81–100', 5]].map(([r, d], i) => S(`group${i + 1}`, `Rang ${r}`, d)),
  sekunden: [S('correct', 'Je richtige Antwort (nur bei Stopp im Zeitfenster)', 1)],
  allein: [S('correct', 'Richtige Antwort, die kein anderes Team genannt hat', 1)],
  star: [S('correct', 'Schnellstes Team mit richtiger Wahl', 1)],
  timeline: [S('correct', 'Je richtig eingeordneter Begriff', 1)],
  chat: [S('correct', 'Richtig erkannte Person', 1)],
  hostdu: [S('correct', 'Richtige Antwort gewählt', 1), S('deceive', 'Täuschung: je Team, das auf die eigene falsche Antwort hereinfällt', 1)],
};

// Punktwert eines Spiels (Editor-Wert, sonst Standard).
function pv(game, key) {
  const v = game && game.content && game.content.scoring ? game.content.scoring[key] : null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const d = (SCORING[game && game.type] || []).find((x) => x.key === key);
  return d ? d.def : 0;
}
// Alle Werte eines Spiels (für die Anzeigen auf iPad, Beamer und in der Regie).
function scoringOf(game) {
  const list = SCORING[game && game.type];
  if (!list) return null;
  return Object.fromEntries(list.map((x) => [x.key, pv(game, x.key)]));
}
// Schema-Block für den Editor.
function scoringField(type) {
  const list = SCORING[type];
  if (!list) return null;
  return {
    key: 'scoring',
    label: 'Punkte – wie viele wofür (die Regeln bleiben gleich; leer = Standard)',
    type: 'object',
    fields: list.map((x) => ({ key: x.key, label: x.label, type: 'number', min: -100, max: 1000, step: 1, placeholder: String(x.def) })),
  };
}

module.exports = { SCORING, pv, scoringOf, scoringField };
