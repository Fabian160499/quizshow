'use strict';

// Weitere Spieltypen für die Spiele-Datenbank. Sie stehen nur in der Datenbank
// und werden nie automatisch in eine Show gesetzt.

const { DATASETS } = require('./datasets');

const ABCD = ['A', 'B', 'C', 'D'];
const text = (key, label, max = 200, extra = {}) => ({ key, label, type: 'text', max, ...extra });
const area = (key, label, max = 500, extra = {}) => ({ key, label, type: 'textarea', max, ...extra });
const num = (key, label, min, max, step = 1) => ({ key, label, type: 'number', min, max, step });
const media = (key, label, accept) => ({ key, label, type: 'media', accept });
const optionsField = { key: 'options', label: 'Antwortmöglichkeiten', type: 'object', fields: ABCD.map((l) => text(l, `Antwort ${l}`, 160)) };
const correctField = { key: 'correct', label: 'Richtige Antwort', type: 'select', options: ABCD };
const abcd = (question, o, correct, extra = {}) => ({ question, options: { A: o[0], B: o[1], C: o[2], D: o[3] }, correct, ...extra });

// Glücksrad bei „Brain or Dreh'n“: Joker-Datenbank mit 15 positiven (Vorrat) und 15 negativen (wirken sofort).
const WHEEL = [
  { n: 1, key: 'doppel', good: true, icon: '✖️2', name: 'Doppelpunkt', text: 'Eure nächste richtige Antwort zählt 2 Punkte.' },
  { n: 9, key: 'minus2', good: false, icon: '➖', name: 'Punktabzug 2', text: 'Ihr verliert 2 Spielpunkte.' },
  { n: 2, key: 'streak', good: true, icon: '🔥', name: 'Streak', text: 'Nächste richtige Antwort 2 Punkte, dann 3, dann 4 … bis zur ersten falschen.' },
  { n: 10, key: 'raub', good: false, icon: '💸', name: 'Punktraub', text: '2 Spielpunkte gehen an ein zufällig ausgelostes anderes Team.' },
  { n: 3, key: 'fifty', good: true, icon: '½', name: '50-50', text: 'Bei einer Frage seht nur ihr zwei statt vier Antworten.' },
  { n: 11, key: 'verlust', good: false, icon: '🃏', name: 'Jokerverlust', text: 'Ein zufälliger Joker aus eurem Vorrat geht verloren.' },
  { n: 4, key: 'raeuber', good: true, icon: '🦹', name: 'Punkteräuber', text: 'Ihr stehlt einem Team eurer Wahl 2 Spielpunkte.' },
  { n: 12, key: 'sperre', good: false, icon: '🔒', name: 'Joker-Sperre', text: 'Beim nächsten Kategoriewechsel dürft ihr keinen Joker einsetzen.' },
  { n: 5, key: 'dieb', good: true, icon: '🎭', name: 'Joker-Dieb', text: 'Ihr stehlt einen zufälligen Joker aus dem Vorrat eines Teams eurer Wahl.' },
  { n: 13, key: 'minus1', good: false, icon: '⬇️', name: 'Punktabzug 1', text: '1 Spielpunkt geht an ein zufällig ausgelostes anderes Team.' },
  { n: 6, key: 'blockade', good: true, icon: '⛔', name: 'Team-Blockade', text: 'Ein Team eurer Wahl darf die nächste Frage nicht beantworten.' },
  { n: 14, key: 'verbot', good: false, icon: '🤐', name: 'Antwortverbot', text: 'Ihr dürft die nächste Frage nicht beantworten.' },
  { n: 7, key: 'detektiv', good: true, icon: '🕵️', name: 'Detektiv-Joker', text: 'Wählt heimlich ein Team: Sobald es geantwortet hat, seht nur ihr seine Antwort – dann antwortet ihr.' },
  { n: 15, key: 'enteignung', good: false, icon: '🗑️', name: 'Joker-Enteignung', text: 'Alle Joker in eurem Vorrat gehen verloren.' },
  { n: 8, key: 'tausch', good: true, icon: '🔁', name: 'Antworttausch', text: 'Wählt heimlich ein Team: Wenn beide geantwortet haben, dürft ihr eure Antwort gegen seine tauschen.' },
  { n: 16, key: 'reset', good: false, icon: '0️⃣', name: 'Reset', text: 'Eure Spielpunkte in diesem Spiel fallen auf 0.' },
  // Erweiterung der Joker-Datenbank (Oktober 2026): je 7 weitere positive und negative Joker.
  { n: 17, key: 'rettung', good: true, icon: '🛟', name: 'Rettungsring', text: 'Ist eure Antwort bei dieser Frage falsch, bekommt ihr trotzdem 1 Punkt. Eine laufende Streak bleibt erhalten.' },
  { n: 18, key: 'zweikreuze', good: true, icon: '✌️', name: 'Zwei Kreuze', text: 'Ihr dürft bei dieser Frage zwei Antworten abgeben. Ist eine davon richtig, gibt es den Punkt.' },
  { n: 19, key: 'wette', good: true, icon: '🎯', name: 'Wette', text: 'Ihr setzt 1 bis 3 Spielpunkte. Richtig: Ihr bekommt den Einsatz doppelt dazu. Falsch: Der Einsatz ist weg.' },
  { n: 20, key: 'sauger', good: true, icon: '🧲', name: 'Punktesauger', text: 'Liegt ihr richtig, bekommt ihr zusätzlich 1 Punkt für jedes Team, das falsch liegt.' },
  { n: 21, key: 'vorfahrt', good: true, icon: '🎡', name: 'Vorfahrt', text: 'Liegt ihr bei dieser Frage richtig, dreht ihr das Glücksrad – ohne Buzzer-Rennen.' },
  { n: 22, key: 'schild', good: true, icon: '🛡️', name: 'Schutzschild', text: 'Schützt euch einmal vor einem negativen Joker – auch vor Punkteräuber, Joker-Dieb oder Team-Blockade eines anderen Teams. Wirkt von selbst aus dem Vorrat.' },
  { n: 23, key: 'umleitung', good: true, icon: '↪️', name: 'Umleitung', text: 'Das nächste fiese Feld, das ihr erdreht, schickt ihr an ein Team eurer Wahl weiter. Wirkt von selbst aus dem Vorrat.' },
  { n: 24, key: 'halbiert', good: false, icon: '✂️', name: 'Halbiert', text: 'Eure Spielpunkte werden halbiert (abgerundet).' },
  { n: 25, key: 'platztausch', good: false, icon: '🔄', name: 'Platztausch', text: 'Ihr tauscht eure Spielpunkte mit dem Team, das die wenigsten hat.' },
  { n: 26, key: 'geschenk', good: false, icon: '🎁', name: 'Joker-Geschenk', text: 'Ein zufälliger Joker aus eurem Vorrat geht an ein zufällig ausgelostes anderes Team.' },
  { n: 27, key: 'nullrunde', good: false, icon: '🥶', name: 'Nullrunde', text: 'Eure nächste richtige Antwort bringt 0 Punkte.' },
  { n: 28, key: 'pech', good: false, icon: '🐈‍⬛', name: 'Pechsträhne', text: 'Ihr verliert 1 Spielpunkt und einen zufälligen Joker aus eurem Vorrat.' },
  { n: 29, key: 'radsperre', good: false, icon: '🚫', name: 'Rad-Sperre', text: 'In den nächsten 2 Runden dürft ihr nicht ans Glücksrad.' },
  { n: 30, key: 'zeitdruck', good: false, icon: '⏱️', name: 'Zeitdruck', text: 'Bei der nächsten Frage habt ihr nur 10 Sekunden für eure Antwort.' },
];

// Standardwerte der Glücksrad-Felder mit Zahl.
const JOKER_DEFAULT_VALUES = { doppel: 2, streak: 2, raeuber: 2, minus2: 2, minus1: 1, raub: 2, rettung: 1, wette: 3, sauger: 1, pech: 1, radsperre: 2, zeitdruck: 10 };

// Glücksrad: getrennt nach positiven und negativen Jokern. Je Seite eine Joker-Datenbank
// mit 8 Jokern (Name, Symbol, Text, Wert änderbar – die Wirkung bleibt) und eine
// Auswahl von genau 6 Jokern fürs Rad. So hat das Rad immer 6 positive und 6 negative Felder.
const WHEEL_SLOTS = 6;
const jokerItem = (w) => ({ name: w.name, icon: w.icon, text: w.text, value: JOKER_DEFAULT_VALUES[w.key] ?? null });
const sideDefaults = (good) => {
  const pool = WHEEL.filter((w) => w.good === good);
  return { slots: pool.slice(0, WHEEL_SLOTS).map((w) => ({ joker: w.key })), jokers: pool.map(jokerItem) };
};
const jokerSide = (good) => {
  const pool = WHEEL.filter((w) => w.good === good);
  const word = good ? 'Positiver Joker' : 'Negativer Joker';
  return { key: good ? 'good' : 'bad', type: 'object', stack: true, sideClass: good ? 'side-good' : 'side-bad',
    label: good ? '➕ Positive Joker (kommen in den Vorrat)' : '➖ Negative Joker (wirken sofort)',
    fields: [
      { key: 'slots', label: `Auf dem Glücksrad: genau 6 ${good ? 'positive' : 'negative'} Joker`, type: 'list', min: WHEEL_SLOTS, max: WHEEL_SLOTS, fixedOrder: true, noPreview: true,
        itemLabel: (i) => `Radfeld ${i + 1}`,
        defaultItems: sideDefaults(good).slots,
        fields: [{ key: 'joker', label: word, type: 'select', options: pool.map((w) => w.key),
          optionLabels: pool.map((w) => `${w.icon} ${w.name}`),
          // Angezeigt werden die (evtl. umbenannten) Joker aus der Datenbank dieser Seite;
          // schon gewählte Joker sind in den anderen Feldern gesperrt.
          optionSource: { path: [good ? 'good' : 'bad', 'jokers'], unique: [good ? 'good' : 'bad', 'slots'] } }] },
      { key: 'jokers', label: `Joker-Datenbank: ${pool.length} ${good ? 'positive' : 'negative'} Joker (Name, Symbol, Text und Wert änderbar – die Wirkung bleibt)`, type: 'list', min: pool.length, max: pool.length, fixedOrder: true, noPreview: true,
        itemLabel: (i) => `${word} ${i + 1} – Wirkung: ${pool[i].name}`,
        defaultItems: pool.map(jokerItem),
        fields: [text('name', 'Name', 40), text('icon', 'Symbol (Emoji)', 8), area('text', 'Text für Teams und Beamer', 200, { rows: 2 }),
          num('value', 'Wert (nur bei Jokern mit einer Zahl im Text, z. B. Punkte, Runden oder Sekunden)', 0, 60)] },
    ] };
};
// Ältere Inhalte (eine gemischte Liste „jokers“ mit 16 Einträgen, goodSlots/badSlots) umbauen.
function migrateBrainContent(c) {
  if (!c || typeof c !== 'object') return c;
  const old = Array.isArray(c.jokers) ? c.jokers : null;
  for (const good of [true, false]) {
    const k = good ? 'good' : 'bad';
    const def = sideDefaults(good);
    if (c[k] && Array.isArray(c[k].jokers) && c[k].jokers.length) {
      // Datenbank erweitert: fehlende Joker hinten mit Standardwerten ergänzen.
      if (c[k].jokers.length < def.jokers.length) c[k].jokers = [...c[k].jokers, ...def.jokers.slice(c[k].jokers.length)];
      continue;
    }
    const pool = WHEEL.filter((w) => w.good === good);
    const jokers = pool.map((w, i) => (old && old[WHEEL.indexOf(w)] ? { ...def.jokers[i], ...old[WHEEL.indexOf(w)] } : def.jokers[i]));
    const oldSlots = c[good ? 'goodSlots' : 'badSlots'];
    c[k] = { slots: Array.isArray(oldSlots) && oldSlots.length === WHEEL_SLOTS ? oldSlots : def.slots, jokers };
  }
  delete c.jokers; delete c.goodSlots; delete c.badSlots;
  return c;
}

const DATASET_NAMES = DATASETS.map((d) => d.name);

const EXTRA_TYPES = {
  dgf: {
    title: 'Danke, gleichfalsch!',
    playable: true,
    summary: 'Board mit 25 Begriffen, 3 passen nicht. Reihum wählen, 60 Sekunden, aussteigen sichert die Punkte.',
    schema: [
      num('seconds', 'Sekunden pro Auswahl', 10, 300),
      { key: 'categories', label: 'Kategorien', type: 'list', min: 1, max: 10, itemLabel: (i) => `Kategorie ${i + 1}`, addLabel: 'Kategorie hinzufügen',
        fields: [
          text('name', 'Kategorie', 120),
          area('right', 'Die 22 passenden Begriffe (einer pro Zeile)', 3000, { rows: 8 }),
          area('wrong', 'Die 3 falschen Begriffe (einer pro Zeile)', 600, { rows: 3 }),
        ] },
    ],
    example: {
      seconds: 60,
      categories: [{
        name: 'Hauptstädte in Europa',
        right: ['Berlin', 'Paris', 'Rom', 'Madrid', 'Wien', 'Lissabon', 'Amsterdam', 'Brüssel', 'Prag', 'Warschau', 'Budapest', 'Athen', 'Dublin', 'Oslo', 'Stockholm', 'Helsinki', 'Kopenhagen', 'Bern', 'Bukarest', 'Sofia', 'Riga', 'Vilnius'].join('\n'),
        wrong: ['Mailand', 'Genf', 'Barcelona'].join('\n'),
      }],
    },
  },

  filmab: {
    title: 'Film ab – Buzzer an!',
    playable: true,
    summary: 'Kurzer Filmausschnitt auf dem Beamer, wer zuerst buzzert, rät. Richtig 1 Punkt, falsch gesperrt.',
    schema: [
      { key: 'films', label: 'Filme', type: 'list', min: 1, max: 20, itemLabel: (i) => `Film ${i + 1}`, addLabel: 'Film hinzufügen',
        fields: [text('title', 'Lösung (Filmtitel)', 160), text('aliases', 'Auch richtig (Varianten, mit Komma)', 300), media('clip', 'Filmausschnitt (Video mit Ton, ca. 15–20 Sekunden)', 'video')] },
    ],
    example: { films: [{ title: 'Titanic', aliases: '', clip: null }, { title: 'Der König der Löwen', aliases: 'König der Löwen', clip: null }, { title: 'Zurück in die Zukunft', aliases: 'Back to the Future', clip: null }] },
  },

  songsong: {
    title: 'Song Song Song',
    playable: true,
    summary: 'Acht Mash-ups: Melodie des einen, Text des anderen Songs. Beide Titel schreiben, Buzzer schickt ab.',
    schema: [
      { key: 'puzzles', label: 'Musikrätsel', type: 'list', min: 1, max: 8, itemLabel: (i) => `Rätsel ${i + 1}`, addLabel: 'Rätsel hinzufügen',
        fields: [media('audio', 'Mash-up (MP3 oder MP4, 20–45 Sekunden; MP4 läuft nur als Ton)', 'audio'), text('melody', 'Song 1 (Melodie)', 160), text('lyrics', 'Song 2 (gesungener Text)', 160)] },
    ],
    example: { puzzles: Array.from({ length: 8 }, () => ({ audio: null, melody: '', lyrics: '' })) },
  },

  konsequenz: {
    title: 'Hits me baby, one more time',
    playable: true,
    summary: 'Ein Lied in Häppchen: 0,5 s, 1 s, 3 s, 5 s, 10 s. Früher richtig = mehr Punkte.',
    schema: [
      text('points', 'Punkte je Stufe (0,5 s / 1 s / 3 s / 5 s / 10 s) – Vorschlag, vor der Vergabe bestätigen', 40),
      { key: 'songs', label: 'Lieder', type: 'list', min: 1, max: 15, itemLabel: (i) => `Lied ${i + 1}`, addLabel: 'Lied hinzufügen',
        fields: [media('audio', 'Lied (MP3)', 'audio'), text('title', 'Richtiger Titel', 160), num('start', 'Start im Lied (Sekunden)', 0, 600, 0.1)] },
    ],
    example: { points: '5, 4, 3, 2, 1', songs: [{ audio: null, title: '', start: 0 }, { audio: null, title: '', start: 0 }, { audio: null, title: '', start: 0 }] },
  },

  fragen: {
    title: 'Habt ihr noch Fragen?',
    playable: true,
    summary: 'Teams denken sich Fragen zur Kategorie aus. Die anderen haben 20 Sekunden: richtig +1 (Frager −1), sonst Frager +2.',
    schema: [
      num('seconds', 'Antwortzeit in Sekunden', 5, 120),
      { key: 'categories', label: 'Kategorien', type: 'list', min: 1, max: 12, itemLabel: (i) => `Kategorie ${i + 1}`, addLabel: 'Kategorie hinzufügen',
        fields: [text('name', 'Kategorie', 120), text('note', 'Hinweis für die Teams (optional)', 200)] },
    ],
    example: { seconds: 20, categories: [{ name: 'Tiere', note: '' }, { name: 'Sport', note: '' }, { name: 'Geschichte', note: '' }] },
  },

  zuweit: {
    title: 'Das geht mir zu weit',
    playable: true,
    summary: 'Teams wählen zwei Einträge aus einer Datenbank; die kleinste oder größte Differenz gewinnt (+2), die schlechteste −1.',
    schema: [
      { key: 'rounds', label: 'Runden', type: 'list', min: 1, max: 10, itemLabel: (i) => `Runde ${i + 1}`, addLabel: 'Runde hinzufügen',
        fields: [
          area('task', 'Aufgabe (sehen die Teams)', 300),
          { key: 'dataset', label: 'Datenbank', type: 'select', options: DATASET_NAMES },
          { key: 'mode', label: 'Gewinnt', type: 'select', options: ['Kleinste Differenz', 'Größte Differenz'] },
          num('min', 'Erlaubt ab (Wert, leer = keine Grenze)', -100000, 100000, 0.01),
          num('max', 'Erlaubt bis (Wert, leer = keine Grenze)', -100000, 100000, 0.01),
          text('asOf', 'Stichtag für Alter (JJJJ-MM-TT, leer = Tag der Show)', 10),
          area('fixes', 'Korrekturen / eigene Einträge (eine Zeile pro Eintrag, siehe Hinweis der Datenbank)', 4000, { rows: 3 }),
          { key: 'tie', label: 'Gleichstand', type: 'select', options: ['Moderation entscheidet', 'Alle Gleichplatzierten bekommen die Punkte'] },
        ] },
    ],
    example: {
      rounds: [
        { task: 'Nennt zwei Schauspieler/innen, die beide älter als 20 und jünger als 60 sind. Kleinster Altersunterschied gewinnt.', dataset: 'Schauspieler/innen (Alter)', mode: 'Kleinste Differenz', min: 20, max: 60, asOf: '', fixes: '', tie: 'Moderation entscheidet' },
        { task: 'Nennt zwei europäische Hauptstädte, die möglichst nah beieinander liegen (Luftlinie).', dataset: 'Europäische Hauptstädte (Entfernung)', mode: 'Kleinste Differenz', min: null, max: null, asOf: '', fixes: '', tie: 'Moderation entscheidet' },
        { task: 'Nennt zwei chemische Elemente mit möglichst ähnlicher Ordnungszahl.', dataset: 'Chemische Elemente (Ordnungszahl)', mode: 'Kleinste Differenz', min: null, max: null, asOf: '', fixes: '', tie: 'Moderation entscheidet' },
        { task: 'Nennt zwei Bundesliga-Teams, die in der Tabelle möglichst weit auseinander stehen.', dataset: 'Bundesliga-Tabelle (Platz)', mode: 'Größte Differenz', min: null, max: null, asOf: '', fixes: '', tie: 'Moderation entscheidet' },
        { task: 'Nennt zwei Flüsse der Welt mit möglichst ähnlicher Länge.', dataset: 'Flüsse der Welt (Länge in km)', mode: 'Kleinste Differenz', min: null, max: null, asOf: '', fixes: '', tie: 'Moderation entscheidet' },
        { task: 'Nennt zwei US-Präsidenten mit möglichst großem Altersunterschied beim ersten Amtsantritt.', dataset: 'US-Präsidenten (Alter beim ersten Amtsantritt)', mode: 'Größte Differenz', min: null, max: null, asOf: '', fixes: '', tie: 'Moderation entscheidet' },
      ],
    },
  },

  zocken: {
    title: 'Erst ich, dann du, dann du, dann du',
    playable: true,
    summary: '24 Felder mit schweren Fragen. Richtig: sichern oder zocken – falsch verliert die ungesicherten Punkte.',
    schema: [
      { key: 'questions', label: 'Fragen (Feld 1–24)', type: 'list', min: 24, max: 24, itemLabel: (i) => `Feld ${i + 1}`,
        fields: [area('question', 'Frage', 300), text('answer', 'Antwort', 200)] },
    ],
    example: {
      questions: [
        ['Wie heißt die Hauptstadt von Kanada?', 'Ottawa'], ['Welches Element hat das Symbol „W“?', 'Wolfram'], ['In welchem Jahr endete der Dreißigjährige Krieg?', '1648'],
        ['Wie viele Herzen hat ein Oktopus?', 'Drei'], ['Wer komponierte „Die Moldau“?', 'Bedřich Smetana'], ['Welcher Planet hat die meisten bekannten Monde?', 'Saturn'],
        ['Wie heißt der längste Fluss Europas?', 'Wolga'], ['Aus welchem Land stammt die Band ABBA?', 'Schweden'], ['Wie viele Bundesländer hat Österreich?', 'Neun'],
        ['Welches ist das kleinste Land der Welt?', 'Vatikanstadt'], ['Wer schrieb „Der Steppenwolf“?', 'Hermann Hesse'], ['Wie heißt die Währung Japans?', 'Yen'],
        ['Welcher Ozean ist der größte?', 'Pazifik'], ['In welcher Stadt steht die Hagia Sophia?', 'Istanbul'], ['Wie viele Zähne hat ein erwachsener Mensch normalerweise?', '32'],
        ['Welches Tier ist das Wappentier Australiens neben dem Emu?', 'Känguru'], ['Wie heißt der höchste Berg Afrikas?', 'Kilimandscharo'], ['Wer malte „Die Sternennacht“?', 'Vincent van Gogh'],
        ['Welches Gas macht den größten Teil der Erdatmosphäre aus?', 'Stickstoff'], ['Wie heißt die Hauptstadt von Neuseeland?', 'Wellington'], ['Wie viele Spieler hat eine Handballmannschaft auf dem Feld?', 'Sieben'],
        ['Welcher Physiker formulierte die Relativitätstheorie?', 'Albert Einstein'], ['Wie heißt das größte Organ des Menschen?', 'Die Haut'], ['In welchem Land liegt Machu Picchu?', 'Peru'],
      ].map(([question, answer]) => ({ question, answer })),
    },
  },

  brain: {
    title: 'Brain or Dreh\'n',
    playable: true,
    summary: '12 Kategorien mit A–D-Fragen. Wer richtig liegt, kann ans Glücksrad: 6 positive und 6 negative Joker – gewählt aus einer Datenbank mit je 15.',
    schema: [
      { key: 'rounds', label: 'Runden', type: 'list', min: 12, max: 12, itemLabel: (i) => `Runde ${i + 1}`,
        fields: [text('category', 'Kategorie (wird groß vorgestellt)', 80), area('question', 'Frage', 300), optionsField, correctField] },
      jokerSide(true),
      jokerSide(false),
    ],
    example: {
      rounds: [
        ['Geografie', 'Welcher Fluss fließt durch Wien?', ['Rhein', 'Donau', 'Elbe', 'Inn'], 'B'],
        ['Tiere', 'Welches Tier kann nicht rückwärts laufen?', ['Känguru', 'Pferd', 'Hund', 'Katze'], 'A'],
        ['Musik', 'Wie viele Saiten hat eine Violine?', ['3', '4', '5', '6'], 'B'],
        ['Sport', 'Wie lange dauert ein Basketballviertel in der NBA?', ['10 Minuten', '12 Minuten', '15 Minuten', '20 Minuten'], 'B'],
        ['Geschichte', 'Wer war der erste Bundeskanzler der BRD?', ['Willy Brandt', 'Ludwig Erhard', 'Konrad Adenauer', 'Helmut Schmidt'], 'C'],
        ['Wissenschaft', 'Was misst ein Barometer?', ['Temperatur', 'Luftdruck', 'Luftfeuchte', 'Windstärke'], 'B'],
        ['Film', 'Wie heißt der Hai im Film „Der weiße Hai“ am Set?', ['Bruce', 'Jaws', 'Frank', 'Moby'], 'A'],
        ['Essen', 'Aus welchem Land kommt das Gericht Paella?', ['Italien', 'Portugal', 'Spanien', 'Mexiko'], 'C'],
        ['Literatur', 'Wer schrieb „Faust“?', ['Schiller', 'Goethe', 'Lessing', 'Heine'], 'B'],
        ['Technik', 'Wofür steht „USB“?', ['Universal Serial Bus', 'United System Board', 'Universal Signal Base', 'User Serial Bridge'], 'A'],
        ['Kunst', 'Wer malte die „Mona Lisa“?', ['Michelangelo', 'Raffael', 'Leonardo da Vinci', 'Botticelli'], 'C'],
        ['Allerlei', 'Wie viele Felder hat ein Schachbrett?', ['36', '49', '64', '81'], 'C'],
      ].map(([category, question, o, correct]) => ({ category, ...abcd(question, o, correct) })),
      good: sideDefaults(true),
      bad: sideDefaults(false),
    },
  },

  dumm3: {
    title: 'Dumm, dumm, dumm',
    playable: true,
    summary: 'Fünf Fragen A–D. Jedes Team setzt 1–5 Punkte, jeden Einsatz genau einmal: richtig plus, falsch minus.',
    schema: [
      { key: 'questions', label: 'Fragen', type: 'list', min: 5, max: 5, itemLabel: (i) => `Frage ${i + 1}`,
        fields: [{ key: 'level', label: 'Schwierigkeit', type: 'select', options: ['leicht', 'mittel', 'sehr schwer'] }, area('question', 'Frage', 300), optionsField, correctField] },
    ],
    example: {
      questions: [
        abcd('Welche Farbe hat ein Smaragd?', ['Rot', 'Blau', 'Grün', 'Gelb'], 'C', { level: 'leicht' }),
        abcd('Wie viele Tage hat ein Schaltjahr?', ['364', '365', '366', '367'], 'C', { level: 'leicht' }),
        abcd('Welches Land hat die meisten Zeitzonen?', ['Russland', 'USA', 'Frankreich', 'China'], 'C', { level: 'mittel' }),
        abcd('Wie heißt die Hauptstadt von Burkina Faso?', ['Bamako', 'Ouagadougou', 'Niamey', 'Lomé'], 'B', { level: 'sehr schwer' }),
        abcd('In welchem Jahr wurde die Universität Heidelberg gegründet?', ['1386', '1456', '1502', '1612'], 'A', { level: 'sehr schwer' }),
      ],
    },
  },

  weissnicht: {
    title: 'Ich weiß nicht, dass du weißt es doch',
    playable: true,
    summary: 'Bild auf dem Beamer. Wer zuerst buzzert, wählt ein Team, das es nicht weiß: 10 Sekunden, falsch +1 für den Buzzer.',
    schema: [
      { key: 'rounds', label: 'Runden', type: 'list', min: 1, max: 8, itemLabel: (i) => `Runde ${i + 1}`, addLabel: 'Runde hinzufügen',
        fields: [media('image', 'Großes Bild', 'image'), area('question', 'Frage', 300), text('solution', 'Lösung', 200)] },
    ],
    example: { rounds: Array.from({ length: 8 }, (_, i) => ({ image: null, question: i === 0 ? 'Was ist auf dem Bild zu sehen?' : '', solution: '' })) },
  },

  weissnicht2: {
    title: 'Ich weiß nicht, dass du weißt es doch 2.0',
    playable: true,
    summary: 'Alle schreiben ihre Antwort. Der schnellste Buzzer schätzt danach ein, wer richtig liegt – alles oder nichts, auch für die eigene Antwort. Alle anderen richtigen Teams +1.',
    schema: [
      { key: 'rounds', label: 'Runden', type: 'list', min: 1, max: 8, itemLabel: (i) => `Runde ${i + 1}`, addLabel: 'Runde hinzufügen',
        fields: [media('image', 'Großes Bild', 'image'), area('question', 'Frage', 300), text('solution', 'Lösung', 200)] },
    ],
    example: { rounds: Array.from({ length: 8 }, (_, i) => ({ image: null, question: i === 0 ? 'Was ist auf dem Bild zu sehen?' : '', solution: '' })) },
  },

  // ===== Sieben neue Module (Master-Prompt „7 neue Module“) =====
  sortieren: {
    title: 'Blamieren oder Sortieren',
    playable: true,
    summary: 'Fünf Bilder oder Begriffe in die richtige Reihenfolge ziehen. Je Element auf dem richtigen Platz 1 Punkt (0–5), kein Bonus, kein Timer.',
    schema: [
      { key: 'tasks', label: 'Aufgaben', type: 'list', min: 1, max: 15, itemLabel: (i) => `Aufgabe ${i + 1}`, addLabel: 'Aufgabe hinzufügen',
        fields: [
          text('category', 'Kategorie / Aufgabe (z. B. „Nach Alter sortieren – jüngste zuerst“)', 160),
          { key: 'items', label: 'Die fünf Elemente – in der RICHTIGEN Reihenfolge (Platz 1 zuerst; zum Umsortieren ziehen)', type: 'list', min: 5, max: 5, itemLabel: (i) => `Platz ${i + 1}`,
            fields: [text('label', 'Begriff / Name (bei einem Bild optional)', 80), media('image', 'Bild / Foto (optional)', 'image'), text('info', 'Wert für die Auflösung (optional, z. B. „1879“ oder „8.849 m“)', 60)] },
        ] },
    ],
    example: {
      tasks: [
        { category: 'Sortiert nach Geburtsjahr – der Älteste zuerst', items: [
          { label: 'Albert Einstein', image: null, info: '1879' }, { label: 'Marilyn Monroe', image: null, info: '1926' },
          { label: 'Michael Jackson', image: null, info: '1958' }, { label: 'Lionel Messi', image: null, info: '1987' }, { label: 'Billie Eilish', image: null, info: '2001' }] },
        { category: 'Sortiert nach Einwohnerzahl – die größte Stadt zuerst', items: [
          { label: 'Berlin', image: null, info: '3,7 Mio.' }, { label: 'Hamburg', image: null, info: '1,9 Mio.' },
          { label: 'München', image: null, info: '1,5 Mio.' }, { label: 'Köln', image: null, info: '1,1 Mio.' }, { label: 'Frankfurt am Main', image: null, info: '0,8 Mio.' }] },
      ],
    },
  },

  gier: {
    title: 'Riskier die Gier',
    playable: true,
    summary: 'Schätzfragen mit 100 fiktiven Gier-Punkten je Team: Die Abweichung wird abgezogen, bei 0 oder weniger ist man raus. Platzierung bringt 10/6/4/3/2/1 Showpunkte.',
    schema: [
      num('seconds', 'Antwortzeit pro Frage in Sekunden (Standard 60)', 10, 300),
      { key: 'questions', label: 'Schätzfragen', type: 'list', min: 1, max: 20, itemLabel: (i) => `Frage ${i + 1}`, addLabel: 'Frage hinzufügen',
        fields: [area('question', 'Schätzfrage', 300), num('answer', 'Richtige Antwort (Zahl)', 0, 1000000000000, 0.01), text('unit', 'Einheit (optional, z. B. „km“ oder „Jahre“)', 30)] },
    ],
    example: {
      seconds: 60,
      questions: [
        { question: 'Wie hoch ist die Zugspitze (in Metern)?', answer: 2962, unit: 'm' },
        { question: 'In welchem Jahr wurde die erste SMS verschickt?', answer: 1992, unit: '' },
        { question: 'Wie viele Knochen hat ein erwachsener Mensch?', answer: 206, unit: '' },
        { question: 'Wie lang ist der Rhein (in Kilometern)?', answer: 1233, unit: 'km' },
        { question: 'Wie viele Länder sind Mitglied der Vereinten Nationen?', answer: 193, unit: '' },
      ],
    },
  },

  top100: {
    title: 'Quizzen, wo man steht',
    playable: true,
    summary: 'Top-100-Listen: Jedes Team nennt einen Eintrag. Rang 1–20 = 1 Punkt … Rang 81–100 = 5 Punkte, nicht gelistet = 0. Unsichere Treffer entscheidet die Moderation.',
    schema: [
      { key: 'rounds', label: 'Kategorien / Runden', type: 'list', min: 1, max: 10, itemLabel: (i) => `Runde ${i + 1}`, addLabel: 'Runde hinzufügen',
        fields: [
          text('category', 'Kategorie (z. B. „Größte Städte Europas nach Einwohnern“)', 160),
          text('source', 'Quelle (Name oder Link – vor der Show prüfen!)', 300),
          text('period', 'Jahr / Zeitraum (z. B. „2023“)', 60),
          text('asOf', 'Datenstand (optional, z. B. „Stand 01/2024“)', 60),
          area('entries', 'Top-100-Liste: genau 100 Zeilen, Zeile 1 = Rang 1. Varianten und Abkürzungen mit „/“ trennen (z. B. „Volkswagen / VW“)', 20000, { rows: 12 }),
        ] },
    ],
    example: { rounds: [{ category: '', source: '', period: '', asOf: '', entries: '' }] },
  },

  sekunden: {
    title: '30 Seconds to Spaß',
    playable: true,
    summary: 'Reihum 30 Sekunden Allgemeinwissen, mündlich. Das Team startet und stoppt selbst per Buzzer – ohne sichtbare Uhr. Nur wer nah genug an 30 Sekunden stoppt (Durchgang 1 ± 4 s, Durchgang 2 ± 2 s), behält die Punkte.',
    schema: [
      num('seconds', 'Zielzeit in Sekunden (Standard 30)', 5, 120),
      num('tol1', 'Toleranz Durchgang 1 in Sekunden (± , Standard 4)', 0, 30, 0.5),
      num('tol2', 'Toleranz Durchgang 2 in Sekunden (± , Standard 2)', 0, 30, 0.5),
      { key: 'rounds', label: 'Durchgänge', type: 'list', min: 2, max: 2, fixedOrder: true, noPreview: true, itemLabel: (i) => `Durchgang ${i + 1}`,
        fields: [
          { key: 'blocks', label: 'Frageblöcke – je Block gleichartige, gleich schwere Fragen, eine pro Team-Platz (Platz 1 = Team, das im Durchgang zuerst dran ist)', type: 'list', min: 1, max: 60, itemLabel: (i) => `Block ${i + 1}`, addLabel: 'Block hinzufügen',
            fields: [
              text('topic', 'Thema / Art der Frage (nur für dich und den Beamer)', 80),
              { key: 'items', label: 'Fragen je Team-Platz', type: 'list', min: 1, max: 6, fixedOrder: true, itemLabel: (i) => `Team-Platz ${i + 1}`, addLabel: 'Frage hinzufügen',
                fields: [text('question', 'Frage', 200), text('answer', 'Antwort (nur für die Moderation)', 120)] },
            ] },
        ] },
    ],
    example: { seconds: 30, tol1: 4, tol2: 2, rounds: [
      { blocks: [
        { topic: 'Hauptstädte', items: [{ question: 'Hauptstadt von Frankreich?', answer: 'Paris' }, { question: 'Hauptstadt von Italien?', answer: 'Rom' }, { question: 'Hauptstadt von Spanien?', answer: 'Madrid' }, { question: 'Hauptstadt von Portugal?', answer: 'Lissabon' }, { question: 'Hauptstadt von Österreich?', answer: 'Wien' }, { question: 'Hauptstadt von Polen?', answer: 'Warschau' }] },
        { topic: 'Kopfrechnen', items: [{ question: '7 mal 8?', answer: '56' }, { question: '6 mal 9?', answer: '54' }, { question: '8 mal 8?', answer: '64' }, { question: '7 mal 7?', answer: '49' }, { question: '12 mal 5?', answer: '60' }, { question: '9 mal 9?', answer: '81' }] },
        { topic: 'Tierkinder', items: [{ question: 'Wie heißt das Junge vom Pferd?', answer: 'Fohlen' }, { question: 'Wie heißt das Junge vom Schaf?', answer: 'Lamm' }, { question: 'Wie heißt das Junge von der Ziege?', answer: 'Zicklein' }, { question: 'Wie heißt das Junge von der Kuh?', answer: 'Kalb' }, { question: 'Wie heißt das Junge vom Hund?', answer: 'Welpe' }, { question: 'Wie heißt das Junge vom Reh?', answer: 'Kitz' }] },
        { topic: 'Farben mischen', items: [{ question: 'Blau und Gelb ergibt?', answer: 'Grün' }, { question: 'Rot und Gelb ergibt?', answer: 'Orange' }, { question: 'Rot und Blau ergibt?', answer: 'Lila / Violett' }, { question: 'Schwarz und Weiß ergibt?', answer: 'Grau' }, { question: 'Rot und Weiß ergibt?', answer: 'Rosa' }, { question: 'Blau und Weiß ergibt?', answer: 'Hellblau' }] },
        { topic: 'Beine und Arme', items: [{ question: 'Wie viele Beine hat eine Spinne?', answer: '8' }, { question: 'Wie viele Beine hat eine Ameise?', answer: '6' }, { question: 'Wie viele Beine hat ein Pferd?', answer: '4' }, { question: 'Wie viele Beine hat ein Strauß?', answer: '2' }, { question: 'Wie viele Arme hat ein Oktopus?', answer: '8' }, { question: 'Wie viele Arme hat ein Seestern meistens?', answer: '5' }] },
        { topic: 'Kontinente', items: [{ question: 'Auf welchem Kontinent liegt Ägypten?', answer: 'Afrika' }, { question: 'Auf welchem Kontinent liegt Brasilien?', answer: 'Südamerika' }, { question: 'Auf welchem Kontinent liegt Japan?', answer: 'Asien' }, { question: 'Auf welchem Kontinent liegt Kanada?', answer: 'Nordamerika' }, { question: 'Auf welchem Kontinent liegt Norwegen?', answer: 'Europa' }, { question: 'Auf welchem Kontinent liegt Kenia?', answer: 'Afrika' }] },
        { topic: 'Monate', items: [{ question: 'Welcher Monat kommt nach Juni?', answer: 'Juli' }, { question: 'Welcher Monat kommt nach September?', answer: 'Oktober' }, { question: 'Welcher Monat kommt vor März?', answer: 'Februar' }, { question: 'Welcher Monat kommt vor Dezember?', answer: 'November' }, { question: 'Welcher Monat kommt nach April?', answer: 'Mai' }, { question: 'Welcher Monat kommt vor August?', answer: 'Juli' }] },
        { topic: 'Gegenteile', items: [{ question: 'Gegenteil von heiß?', answer: 'kalt' }, { question: 'Gegenteil von groß?', answer: 'klein' }, { question: 'Gegenteil von hell?', answer: 'dunkel' }, { question: 'Gegenteil von schnell?', answer: 'langsam' }, { question: 'Gegenteil von laut?', answer: 'leise' }, { question: 'Gegenteil von alt?', answer: 'jung / neu' }] },
        { topic: 'Landeshauptstädte', items: [{ question: 'Landeshauptstadt von Bayern?', answer: 'München' }, { question: 'Landeshauptstadt von Sachsen?', answer: 'Dresden' }, { question: 'Landeshauptstadt von Hessen?', answer: 'Wiesbaden' }, { question: 'Landeshauptstadt von Nordrhein-Westfalen?', answer: 'Düsseldorf' }, { question: 'Landeshauptstadt von Niedersachsen?', answer: 'Hannover' }, { question: 'Landeshauptstadt von Baden-Württemberg?', answer: 'Stuttgart' }] },
        { topic: 'Chemische Zeichen', items: [{ question: 'Chemisches Zeichen für Gold?', answer: 'Au' }, { question: 'Chemisches Zeichen für Silber?', answer: 'Ag' }, { question: 'Chemisches Zeichen für Eisen?', answer: 'Fe' }, { question: 'Chemisches Zeichen für Kupfer?', answer: 'Cu' }, { question: 'Chemisches Zeichen für Blei?', answer: 'Pb' }, { question: 'Chemisches Zeichen für Zinn?', answer: 'Sn' }] },
      ] },
      { blocks: [
        { topic: 'Hauptstädte', items: [{ question: 'Hauptstadt der Niederlande?', answer: 'Amsterdam' }, { question: 'Hauptstadt von Belgien?', answer: 'Brüssel' }, { question: 'Hauptstadt von Schweden?', answer: 'Stockholm' }, { question: 'Hauptstadt von Norwegen?', answer: 'Oslo' }, { question: 'Hauptstadt von Dänemark?', answer: 'Kopenhagen' }, { question: 'Hauptstadt von Finnland?', answer: 'Helsinki' }] },
        { topic: 'Kopfrechnen', items: [{ question: '6 mal 7?', answer: '42' }, { question: '8 mal 9?', answer: '72' }, { question: '6 mal 8?', answer: '48' }, { question: '7 mal 9?', answer: '63' }, { question: '4 mal 13?', answer: '52' }, { question: '3 mal 15?', answer: '45' }] },
        { topic: 'Tierlaute', items: [{ question: 'Wie macht der Hund?', answer: 'bellen / wau' }, { question: 'Wie macht die Katze?', answer: 'miauen / miau' }, { question: 'Wie macht die Kuh?', answer: 'muhen / muh' }, { question: 'Wie macht das Pferd?', answer: 'wiehern' }, { question: 'Wie macht das Schaf?', answer: 'blöken / mäh' }, { question: 'Wie macht der Esel?', answer: 'iah / schreien' }] },
        { topic: 'Planeten', items: [{ question: 'Welcher Planet ist der 1. von der Sonne aus?', answer: 'Merkur' }, { question: 'Welcher Planet ist der 2. von der Sonne aus?', answer: 'Venus' }, { question: 'Welcher Planet ist der 3. von der Sonne aus?', answer: 'Erde' }, { question: 'Welcher Planet ist der 4. von der Sonne aus?', answer: 'Mars' }, { question: 'Welcher Planet ist der 5. von der Sonne aus?', answer: 'Jupiter' }, { question: 'Welcher Planet ist der 6. von der Sonne aus?', answer: 'Saturn' }] },
        { topic: 'Spieler auf dem Feld', items: [{ question: 'Wie viele Spieler hat ein Fußballteam auf dem Feld?', answer: '11' }, { question: 'Wie viele Spieler hat ein Basketballteam auf dem Feld?', answer: '5' }, { question: 'Wie viele Spieler hat ein Handballteam auf dem Feld (mit Torwart)?', answer: '7' }, { question: 'Wie viele Spieler hat ein Volleyballteam auf dem Feld?', answer: '6' }, { question: 'Wie viele Spieler hat ein Eishockeyteam auf dem Eis (mit Torwart)?', answer: '6' }, { question: 'Wie viele Spieler hat ein Wasserballteam im Wasser (mit Torwart)?', answer: '7' }] },
        { topic: 'Währungen', items: [{ question: 'Währung von Japan?', answer: 'Yen' }, { question: 'Währung der USA?', answer: 'Dollar' }, { question: 'Währung von Großbritannien?', answer: 'Pfund' }, { question: 'Währung der Schweiz?', answer: 'Franken' }, { question: 'Währung von China?', answer: 'Yuan / Renminbi' }, { question: 'Währung von Indien?', answer: 'Rupie' }] },
        { topic: 'Alphabet', items: [{ question: 'Welcher Buchstabe kommt nach K?', answer: 'L' }, { question: 'Welcher Buchstabe kommt nach P?', answer: 'Q' }, { question: 'Welcher Buchstabe kommt vor G?', answer: 'F' }, { question: 'Welcher Buchstabe kommt vor T?', answer: 'S' }, { question: 'Welcher Buchstabe kommt nach W?', answer: 'X' }, { question: 'Welcher Buchstabe kommt vor N?', answer: 'M' }] },
        { topic: 'Gegenteile', items: [{ question: 'Gegenteil von Tag?', answer: 'Nacht' }, { question: 'Gegenteil von oben?', answer: 'unten' }, { question: 'Gegenteil von voll?', answer: 'leer' }, { question: 'Gegenteil von nass?', answer: 'trocken' }, { question: 'Gegenteil von früh?', answer: 'spät' }, { question: 'Gegenteil von weich?', answer: 'hart' }] },
        { topic: 'Englisch', items: [{ question: 'Was heißt Hund auf Englisch?', answer: 'dog' }, { question: 'Was heißt Katze auf Englisch?', answer: 'cat' }, { question: 'Was heißt Haus auf Englisch?', answer: 'house' }, { question: 'Was heißt Baum auf Englisch?', answer: 'tree' }, { question: 'Was heißt Apfel auf Englisch?', answer: 'apple' }, { question: 'Was heißt Vogel auf Englisch?', answer: 'bird' }] },
        { topic: 'Einheiten', items: [{ question: 'Wie viele Zentimeter hat ein Meter?', answer: '100' }, { question: 'Wie viele Gramm hat ein Kilogramm?', answer: '1000' }, { question: 'Wie viele Meter hat ein Kilometer?', answer: '1000' }, { question: 'Wie viele Minuten hat eine Stunde?', answer: '60' }, { question: 'Wie viele Stunden hat ein Tag?', answer: '24' }, { question: 'Wie viele Tage hat eine Woche?', answer: '7' }] },
      ] },
    ] },
  },

  allein: {
    title: 'Wir sind ein Telepa-Team',
    playable: true,
    summary: 'Klar abgegrenzte Kategorie mit begrenzt vielen richtigen Antworten. Jedes Team nennt eine. Punkte nur für richtige Antworten, die kein anderes Team genannt hat.',
    schema: [
      { key: 'rounds', label: 'Kategorien', type: 'list', min: 1, max: 12, itemLabel: (i) => `Kategorie ${i + 1}`, addLabel: 'Kategorie hinzufügen',
        fields: [
          text('category', 'Kategorie (z. B. „Bärenarten“, „Länder mit B“, „Bisherige Bundeskanzler“)', 160),
          area('entries', 'Alle richtigen Antworten: eine pro Zeile. Varianten und Abkürzungen mit „/“ trennen (z. B. „Großer Panda / Pandabär“)', 20000, { rows: 10 }),
        ] },
    ],
    example: {
      rounds: [
        { category: 'Bisherige Bundeskanzler der Bundesrepublik', entries: ['Konrad Adenauer / Adenauer', 'Ludwig Erhard / Erhard', 'Kurt Georg Kiesinger / Kiesinger', 'Willy Brandt / Brandt', 'Helmut Schmidt / Schmidt', 'Helmut Kohl / Kohl', 'Gerhard Schröder / Schröder', 'Angela Merkel / Merkel', 'Olaf Scholz / Scholz', 'Friedrich Merz / Merz'].join('\n') },
        { category: 'Bärenarten', entries: ['Braunbär / Grizzly / Grizzlybär / Kodiakbär', 'Eisbär / Polarbär', 'Amerikanischer Schwarzbär / Baribal / Schwarzbär', 'Asiatischer Schwarzbär / Kragenbär / Mondbär', 'Malaienbär / Sonnenbär', 'Lippenbär', 'Brillenbär', 'Großer Panda / Pandabär / Panda'].join('\n') },
        { category: 'Länder, die mit B anfangen', entries: ['Bahamas', 'Bahrain', 'Bangladesch / Bangladesh', 'Barbados', 'Belarus / Weißrussland', 'Belgien', 'Belize', 'Benin', 'Bhutan', 'Bolivien', 'Bosnien und Herzegowina / Bosnien-Herzegowina / Bosnien', 'Botswana', 'Brasilien', 'Brunei', 'Bulgarien', 'Burkina Faso', 'Burundi'].join('\n') },
      ],
    },
  },

  star: {
    title: 'Ich bin ein Star, lüg mich nicht an',
    playable: true,
    summary: 'In der Mitte ein Star, Film oder Franchise, rundherum acht Begriffe – genau einer ist falsch. Buzzern macht die Wahl verbindlich; das schnellste Team mit richtiger Wahl bekommt 1 Punkt.',
    schema: [
      { key: 'puzzles', label: 'Rätsel', type: 'list', min: 1, max: 15, itemLabel: (i) => `Rätsel ${i + 1}`, addLabel: 'Rätsel hinzufügen',
        fields: [
          text('center', 'In der Mitte: Schauspieler/in, Film, Rolle, Franchise oder Regisseur', 100),
          media('image', 'Bild für die Mitte (optional)', 'image'),
          { key: 'terms', label: 'Die acht Begriffe im Uhrzeigersinn', type: 'list', min: 8, max: 8, itemLabel: (i) => `Begriff ${i + 1}`, of: 'text', maxLength: 80 },
          { key: 'wrong', label: 'Welcher Begriff ist der FALSCHE? (genau einer)', type: 'select', options: ['– bitte wählen –', ...Array.from({ length: 8 }, (_, i) => `Begriff ${i + 1}`)] },
        ] },
    ],
    example: {
      puzzles: [
        { center: 'Leonardo DiCaprio', image: null, terms: ['Titanic', 'Inception', 'The Revenant', 'Catch Me If You Can', 'Der Pate', 'Shutter Island', 'The Wolf of Wall Street', 'Django Unchained'], wrong: 'Begriff 5' },
        { center: 'Harry Potter (Filmreihe)', image: null, terms: ['Der Stein der Weisen', 'Die Kammer des Schreckens', 'Der Gefangene von Askaban', 'Der Feuerkelch', 'Der Orden des Phönix', 'Der Ring des Zauberers', 'Der Halbblutprinz', 'Die Heiligtümer des Todes'], wrong: 'Begriff 6' },
      ],
    },
  },

  timeline: {
    title: 'Remember the Timeline',
    playable: true,
    summary: 'Reihum Begriffe auf eine Zeitachse legen. Richtig = 1 Punkt, falsch = alle Punkte des Durchgangs weg und raus. Freiwilliger Ausstieg behält die Punkte.',
    schema: [
      { key: 'rounds', label: 'Durchgänge', type: 'list', min: 1, max: 10, itemLabel: (i) => `Durchgang ${i + 1}`, addLabel: 'Durchgang hinzufügen',
        fields: [
          text('category', 'Kategorie (z. B. „Die letzten zehn James-Bond-Filme“)', 160),
          text('reference', 'Referenzbegriff (liegt zu Beginn schon auf der Zeitachse)', 80),
          text('refValue', 'Sortierwert des Referenzbegriffs (Jahr, Datum wie 2001-09-11, oder Zahl)', 30),
          { key: 'items', label: 'Die zehn Begriffe zum Einordnen (Reihenfolge egal; gleiche Sortierwerte sind nicht erlaubt)', type: 'list', min: 10, max: 10, itemLabel: (i) => `Begriff ${i + 1}`,
            fields: [text('label', 'Begriff', 80), text('value', 'Sortierwert (Jahr, Datum oder Zahl)', 30)] },
        ] },
    ],
    example: {
      rounds: [
        { category: 'Erscheinungsjahr der Filme', reference: 'Titanic', refValue: '1997', items: [
          { label: 'Der weiße Hai', value: '1975' }, { label: 'Krieg der Sterne', value: '1977' }, { label: 'E.T. – Der Außerirdische', value: '1982' },
          { label: 'Zurück in die Zukunft', value: '1985' }, { label: 'Jurassic Park', value: '1993' }, { label: 'Matrix', value: '1999' },
          { label: 'Der Herr der Ringe: Die Gefährten', value: '2001' }, { label: 'Avatar', value: '2009' }, { label: 'Inception', value: '2010' }, { label: 'Barbie', value: '2023' }] },
      ],
    },
  },

  chat: {
    title: 'Guck mal, wer da spricht',
    playable: true,
    summary: 'Ein Messenger-Chat mit acht Nachrichten verrät nach und nach eine berühmte Person. Buzzer ab der ersten Nachricht: richtig = 1 Punkt, falsch = für die Runde gesperrt.',
    schema: [
      { key: 'chats', label: 'Chats', type: 'list', min: 1, max: 15, itemLabel: (i) => `Chat ${i + 1}`, addLabel: 'Chat hinzufügen',
        fields: [
          text('person', 'Gesuchte Persönlichkeit (Lösung, erscheint bei der Auflösung oben als Kontakt)', 80),
          media('photo', 'Kontaktbild für die Auflösung (optional)', 'image'),
          { key: 'messages', label: 'Die acht Nachrichten (je vier links und rechts; zum Umsortieren ziehen)', type: 'list', min: 8, max: 8, itemLabel: (i) => `Nachricht ${i + 1}`,
            fields: [{ key: 'from', label: 'Seite', type: 'select', options: ['Links (grau)', 'Rechts (blau)'] }, area('text', 'Text', 300, { rows: 2 })] },
        ] },
    ],
    example: {
      chats: [
        { person: 'Albert Einstein', photo: null, messages: [
          { from: 'Links (grau)', text: 'Na, hast du deine Haare heute schon gekämmt? 😄' }, { from: 'Rechts (blau)', text: 'Wozu? Zeit ist doch relativ.' },
          { from: 'Links (grau)', text: 'Wie war es eigentlich damals beim Patentamt in Bern?' }, { from: 'Rechts (blau)', text: 'Langweilig – da hatte ich Zeit zum Nachdenken.' },
          { from: 'Links (grau)', text: 'Und dann kam 1921 der Anruf aus Stockholm …' }, { from: 'Rechts (blau)', text: 'Ja, aber nicht für das, was alle denken.' },
          { from: 'Links (grau)', text: 'Streckst du auf dem Foto wieder die Zunge raus?' }, { from: 'Rechts (blau)', text: 'E = mc² – das muss reichen!' }] },
      ],
    },
  },

  hostdu: {
    title: 'Host du das Zeug dafür?',
    playable: true,
    summary: 'Teams erfinden Antworten, alle werden mit der richtigen gemischt. Richtige Option gewählt = 1 Punkt; für jede falsche Option bekommt ihr Einreicher 1 Punkt je Team, das darauf hereinfällt.',
    schema: [
      { key: 'questions', label: 'Fragen', type: 'list', min: 1, max: 15, itemLabel: (i) => `Frage ${i + 1}`, addLabel: 'Frage hinzufügen',
        fields: [area('question', 'Frage', 300), text('answer', 'Einzig richtige Antwort', 120), text('aliases', 'Auch als richtig erkennen (optional, Varianten mit Komma)', 300)] },
    ],
    example: {
      questions: [
        { question: 'Was ist ein „Petrichor“?', answer: 'Der Geruch von Regen auf trockener Erde', aliases: '' },
        { question: 'Wofür wurde das Kaugummi ursprünglich erfunden?', answer: 'Als Ersatz für Kautabak', aliases: '' },
      ],
    },
  },
};

// Reihenfolge in der Spiele-Datenbank.
const EXTRA_ORDER = ['dumm3', 'filmab', 'weissnicht', 'weissnicht2', 'konsequenz', 'songsong', 'dgf', 'zocken', 'fragen', 'zuweit', 'brain', 'sortieren', 'gier', 'top100', 'star', 'timeline', 'chat', 'hostdu', 'allein', 'sekunden'];

module.exports = { EXTRA_TYPES, EXTRA_ORDER, WHEEL, WHEEL_SLOTS, migrateBrainContent };
