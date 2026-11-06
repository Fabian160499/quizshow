'use strict';

// Spieltypen der Show mit Beschreibung ihrer Inhalte (Schema) und Beispielinhalten.
// Aus dem Schema bauen Server und Editor die Formulare und prüfen die Eingaben,
// sodass alle Inhalte ohne Programmierung bearbeitet werden können.

const ABCD = ['A', 'B', 'C', 'D'];

const text = (key, label, max = 200, extra = {}) => ({ key, label, type: 'text', max, ...extra });
const area = (key, label, max = 500, extra = {}) => ({ key, label, type: 'textarea', max, ...extra });
const optionsField = { key: 'options', label: 'Antwortmöglichkeiten', type: 'object', fields: ABCD.map((l) => text(l, `Antwort ${l}`, 160)) };
const correctField = { key: 'correct', label: 'Richtige Antwort', type: 'select', options: ABCD };

// Hinweisfelder bei „Das ist ein echter Kassenschlager“ (Kategorie und Preis laut Spielregel).
const MOVIE_HINTS = [
  ['Erscheinungsjahr', 1], ['Genre', 2], ['Regie', 2], ['Hauptdarsteller/in', 4], ['Nebenfigur', 2],
  ['Schauplatz / Ort', 1], ['Filmzitat', 3], ['IMDb-Bewertung', 1], ['Verpixeltes/unscharfes Standbild', 3],
  ['Filmskizze (frühe, grobe Idee, kein Musikhinweis)', 2],
];

// Punkteleiter bei „Ein Hauch von Günther Jauch“.
const JAUCH_LADDER = [1, 2, 4, 5, 6, 8, 10, 15];

const TYPES = {
  leichte5: {
    title: 'Die leichten 5',
    playable: true,
    summary: 'Fünf Alltagsfragen, Freitext auf dem iPad, 1 Punkt pro richtiger Antwort.',
    schema: [
      { key: 'questions', label: 'Fragen', type: 'list', min: 5, max: 5, itemLabel: (i) => `Frage ${i + 1}`,
        fields: [area('question', 'Frage', 300), { key: 'image', label: 'Bild zur Frage (optional)', type: 'media', accept: 'image' }, text('solution', 'Musterlösung')] },
    ],
    example: {
      questions: [
        { question: 'Wie viele Minuten hat ein Tag?', solution: '1440' },
        { question: 'Welche Farbe entsteht, wenn man Blau und Gelb mischt?', solution: 'Grün' },
        { question: 'Wie viele Beine hat eine Spinne?', solution: '8' },
        { question: 'Welcher Wochentag folgt auf den Donnerstag?', solution: 'Freitag' },
        { question: 'Wie heißt die Hauptstadt von Österreich?', solution: 'Wien' },
      ],
    },
  },

  dummes: {
    title: 'Dumm ist der, der Dummes kriegt',
    playable: true,
    summary: 'Fünf Fragen A–D mit Buzzer; bei jeder Frage darf das schnellste Team tauschen.',
    schema: [
      { key: 'questions', label: 'Fragen', type: 'list', min: 5, max: 5, itemLabel: (i) => `Frage ${i + 1}`,
        fields: [area('question', 'Frage', 300), optionsField, correctField] },
    ],
    example: {
      questions: [
        { question: 'Welches Tier ist das größte an Land?', options: { A: 'Giraffe', B: 'Afrikanischer Elefant', C: 'Nashorn', D: 'Flusspferd' }, correct: 'B' },
        { question: 'Wie viele Kontinente gibt es?', options: { A: '5', B: '6', C: '7', D: '8' }, correct: 'C' },
        { question: 'Welches Metall ist bei Zimmertemperatur flüssig?', options: { A: 'Quecksilber', B: 'Blei', C: 'Zinn', D: 'Aluminium' }, correct: 'A' },
        { question: 'Wie viele Saiten hat eine klassische Gitarre?', options: { A: '4', B: '5', C: '6', D: '7' }, correct: 'C' },
        { question: 'Welcher Planet ist der Sonne am nächsten?', options: { A: 'Venus', B: 'Merkur', C: 'Mars', D: 'Erde' }, correct: 'B' },
      ],
    },
  },

  land: {
    title: 'Ich sehe ein Land, das du nicht siehst',
    playable: true,
    summary: 'Teams setzen einen Punkt auf der Karte: beim gesuchten Ort gewinnt der nächste, beim gesuchten Land jedes Team im Land 1 Punkt.',
    schema: [
      { key: 'map', label: 'Standard-Karte (gilt für alle Aufgaben ohne eigene Karte)', type: 'select', options: ['Welt', 'Europa', 'Deutschland'] },
      { key: 'tasks', label: 'Aufgaben', type: 'list', min: 1, max: 15, itemLabel: (i) => `Aufgabe ${i + 1}`, addLabel: 'Aufgabe hinzufügen',
        fields: [
          area('question', 'Aufgabe / Frage', 300),
          { key: 'image', label: 'Bild zur Aufgabe (optional, z. B. Foto eines Wahrzeichens)', type: 'media', accept: 'image' },
          { key: 'map', label: 'Karte für diese Aufgabe', type: 'select', options: ['Standard-Karte des Spiels', 'Welt', 'Europa', 'Deutschland'] },
          // Ganzes Land: jedes Team, das im Land tippt, bekommt den Punkt (nur Welt-/Europakarte).
          { key: 'mode', label: 'Gesucht wird', type: 'select', options: ['Punkt (Koordinaten)', 'Ganzes Land (nur Welt- und Europakarte)'] },
          { key: 'country', label: 'Gesuchtes Land (nur bei „Ganzes Land“)', type: 'select', options: ['– bitte wählen –', ...require('./countries').map((c) => c.name)] },
          text('target', 'Gesuchter Ort (bei „Ganzes Land“ optional, sonst wird der Landesname gezeigt)'),
          { key: 'lat', label: 'Breitengrad (z. B. 48.137) – nur bei „Punkt“', type: 'number', min: -90, max: 90, step: 0.001 },
          { key: 'lng', label: 'Längengrad (z. B. 11.575) – nur bei „Punkt“', type: 'number', min: -180, max: 180, step: 0.001 },
        ] },
    ],
    example: {
      map: 'Europa',
      tasks: [
        { question: 'Wo steht der Eiffelturm?', target: 'Paris', lat: 48.858, lng: 2.294 },
        { question: 'In welcher Stadt steht die Akropolis?', target: 'Athen', lat: 37.972, lng: 23.726 },
      ],
    },
  },

  kassenschlager: {
    title: 'Das ist ein echter Kassenschlager',
    playable: true,
    summary: 'Vier Filme, je zehn kaufbare Hinweise, 20 $ Startguthaben.',
    schema: [
      // Namen der zehn Hinweis-Kategorien – für alle Filme dieses Spiels; Preise bleiben gleich.
      { key: 'hintCats', label: 'Hinweis-Kategorien: Name und Preis (gelten für alle Filme dieses Spiels)', type: 'list', min: 10, max: 10, fixedOrder: true, noPreview: true, noSummary: true,
        itemLabel: (i) => `Kategorie ${i + 1}`, defaultItems: MOVIE_HINTS.map(([name, price]) => ({ name, price })),
        fields: [text('name', 'Name', 60), { key: 'price', label: 'Preis in $', type: 'number', min: 0, max: 100, step: 1 }] },
      { key: 'movies', label: 'Filme und Serien', type: 'list', min: 4, max: 4, itemLabel: (i) => `Film ${i + 1}`,
        fields: [
          text('title', 'Titel (Lösung)'),
          text('aliases', 'Auch richtig (Varianten mit Komma trennen)', 300),
          { key: 'hints', label: 'Hinweise (Text – bei einem Foto unten optional, dann als Bildunterschrift)', type: 'list', min: 10, max: 10, itemLabel: (i) => `Hinweis ${i + 1} (Kategorie ${i + 1})`, of: 'text', maxLength: 300 },
          { key: 'hintPhotos', label: 'Foto als Hinweis (optional – statt oder zusätzlich zum Text)', type: 'list', min: 10, max: 10, fixedOrder: true, noPreview: true,
            itemLabel: (i) => `Foto zu Hinweis ${i + 1}`, defaultItems: MOVIE_HINTS.map(() => ({ photo: null })),
            fields: [{ key: 'photo', label: 'Foto', type: 'media', accept: 'image' }] },
        ] },
    ],
    example: {
      hintCats: MOVIE_HINTS.map(([name, price]) => ({ name, price })),
      movies: [
        { title: 'Titanic', aliases: '', hints: ['1997', 'Drama, Romanze', 'James Cameron', 'Leonardo DiCaprio', 'Rose’ Mutter', 'Nordatlantik', '„Ich bin der König der Welt!“', '7,9', '(Bild ergänzen)', 'Ein Liebespaar auf einem Schiff, das nicht ankommt'] },
        { title: 'Findet Nemo', aliases: 'Finding Nemo', hints: ['2003', 'Animation', 'Andrew Stanton', 'Marlin (Stimme)', 'Dorie', 'Great Barrier Reef / Sydney', '„Einfach schwimmen!“', '8,2', '(Bild ergänzen)', 'Ein Vater sucht sein Kind im Meer'] },
        { title: 'Der König der Löwen', aliases: 'König der Löwen, The Lion King', hints: ['1994', 'Animation', 'Roger Allers, Rob Minkoff', 'Simba (Stimme)', 'Timon', 'Afrikanische Savanne', '„Hakuna Matata“', '8,5', '(Bild ergänzen)', 'Hamlet mit Tieren'] },
        { title: 'Zurück in die Zukunft', aliases: 'Back to the Future', hints: ['1985', 'Science-Fiction, Komödie', 'Robert Zemeckis', 'Michael J. Fox', 'Biff Tannen', 'Hill Valley', '„Wo wir hinfahren, brauchen wir keine Straßen.“', '8,5', '(Bild ergänzen)', 'Ein Teenager trifft seine Eltern als Teenager'] },
      ],
    },
  },

  trumpf5: {
    title: '5 ist Trümpf',
    playable: true,
    summary: 'Fünf Begriffe, bis zu fünf Hinweise, Buzzer: früher raten bringt mehr Punkte.',
    schema: [
      { key: 'terms', label: 'Begriffe', type: 'list', min: 5, max: 5, itemLabel: (i) => `Begriff ${i + 1}`,
        fields: [
          text('category', 'Kategorie (sehen die Teams zuerst)', 80),
          text('term', 'Gesuchter Begriff', 120),
          { key: 'hints', label: 'Hinweise', type: 'list', min: 5, max: 5, itemLabel: (i) => `Hinweis ${i + 1}`, of: 'text', maxLength: 200 },
        ] },
    ],
    example: {
      terms: [
        { category: 'Tier', term: 'Pinguin', hints: ['Ich lebe gern in Kolonien.', 'Ich kann nicht fliegen.', 'Ich bin ein guter Schwimmer.', 'Ich trage scheinbar einen Frack.', 'Ich lebe am Südpol.'] },
        { category: 'Gegenstand', term: 'Regenschirm', hints: ['Ich werde oft vergessen.', 'Ich habe Speichen.', 'Man kann mich aufspannen.', 'Bei Sonne bleibe ich meist zu Hause.', 'Ich schütze vor Regen.'] },
        { category: 'Stadt', term: 'Hamburg', hints: ['Ich habe einen großen Hafen.', 'Ich bin ein Stadtstaat.', 'Bei mir steht die Elbphilharmonie.', 'Mein Fischmarkt ist berühmt.', 'Ich bin Deutschlands zweitgrößte Stadt.'] },
        { category: 'Sportart', term: 'Tennis', hints: ['Ich werde auf verschiedenen Belägen gespielt.', 'Bei mir gibt es Einzel und Doppel.', 'Ich zähle 15, 30, 40.', 'Wimbledon ist mein bekanntestes Turnier.', 'Man spielt mich mit Schläger und gelbem Ball.'] },
        { category: 'Essen', term: 'Pizza', hints: ['Ich werde oft geliefert.', 'Ich bin meist rund.', 'Ich komme aus Italien.', 'Margherita ist eine meiner Sorten.', 'Ich bestehe aus Teig, Tomate und Käse.'] },
      ],
    },
  },

  musik: {
    title: 'Musikquiz im Jeopardy-Stil',
    playable: true,
    summary: 'Fünf Kategorien mit je drei Feldern (1, 2, 3 Punkte), Buzzer.',
    schema: [
      { key: 'categories', label: 'Kategorien', type: 'list', min: 5, max: 5, itemLabel: (i) => `Kategorie ${i + 1}`,
        fields: [
          text('name', 'Name der Kategorie', 80),
          { key: 'mode', label: 'Wertung', type: 'select', options: ['Normal', 'Song Song Song (beide Titel nötig, keine Teilpunkte)'] },
          { key: 'fields', label: 'Felder', type: 'list', min: 3, max: 3, itemLabel: (i) => `Feld ${i + 1}`,
            fields: [area('task', 'Aufgabe', 300), text('answer', 'Lösung'), { key: 'clip', label: 'Musik-Clip (MP3 oder MP4) – läuft auf dem Beamer mit „Aufgabe starten“', type: 'media', accept: 'audio' }, { key: 'reveal', label: 'Auflösung mit Ton (MP3 oder MP4, optional) – läuft auf dem Beamer, sobald das Feld aufgelöst ist', type: 'media', accept: 'audio' }, text('audio', 'Notiz zum Clip (optional)', 200)] },
        ] },
    ],
    example: {
      categories: [
        ['Rückwärts abgespielt', 'Normal', 'Welches Lied läuft hier rückwärts?', [['Alle meine Entchen'], ['Happy Birthday'], ['Jingle Bells']]],
        ['Musik der 80er', 'Normal', 'Welcher Song ist das? (Titel reicht)', [['Take On Me – a-ha'], ['Billie Jean – Michael Jackson'], ['Major Tom – Peter Schilling']]],
        ['Songtexte vervollständigen', 'Normal', '', [['Nacht', '„Atemlos durch die …“'], ['Horizont', '„99 Luftballons auf ihrem Weg zum …“'], ['Sonne', '„Ein bisschen Frieden, ein bisschen …“']]],
        ['Film- und Serienmusik', 'Normal', 'Aus welchem Film stammt diese Musik?', [['Star Wars'], ['Fluch der Karibik'], ['Der Pate']]],
        ['Song Song Song', 'Song Song Song (beide Titel nötig, keine Teilpunkte)', 'Welche zwei Songs stecken in diesem Mash-up?', [['(beide Titel im Editor eintragen)'], ['(beide Titel im Editor eintragen)'], ['(beide Titel im Editor eintragen)']]],
      ].map(([name, mode, task, fields]) => ({ name, mode, fields: fields.map(([answer, own]) => ({ task: own || task, answer, audio: '' })) })),
    },

  },

  jauch: {
    title: 'Ein Hauch von Günther Jauch',
    playable: true,
    summary: 'Acht Fragen A–D mit steigendem Wert, Sicherheitsstufe bei Frage 4, zwei Joker.',
    schema: [
      { key: 'questions', label: 'Fragen', type: 'list', min: 8, max: 8,
        itemLabel: (i) => `Frage ${i + 1}${i === 3 ? ' (Sicherheitsstufe)' : ''}`,
        fields: [area('question', 'Frage', 300), optionsField, correctField] },
    ],
    example: {
      questions: [
        ['Was trinkt man traditionell zum Frühstück in England?', ['Tee', 'Cola', 'Milch', 'Saft'], 'A'],
        ['Wie viele Spieler einer Fußballmannschaft stehen auf dem Platz?', ['9', '10', '11', '12'], 'C'],
        ['Welcher Planet ist der Sonne am nächsten?', ['Venus', 'Merkur', 'Mars', 'Erde'], 'B'],
        ['In welchem Jahr fiel die Berliner Mauer?', ['1987', '1989', '1990', '1991'], 'B'],
        ['Wie heißt die Hauptstadt von Australien?', ['Sydney', 'Melbourne', 'Canberra', 'Perth'], 'C'],
        ['Welches chemische Element hat das Symbol „Fe“?', ['Eisen', 'Fluor', 'Francium', 'Fermium'], 'A'],
        ['Wer malte „Das Mädchen mit dem Perlenohrring“?', ['Rembrandt', 'Rubens', 'Van Gogh', 'Vermeer'], 'D'],
        ['Wie viele Knochen hat ein erwachsener Mensch ungefähr?', ['156', '206', '256', '306'], 'B'],
      ].map(([question, o, correct]) => ({ question, options: { A: o[0], B: o[1], C: o[2], D: o[3] }, correct })),
    },

  },

  nerd: {
    title: 'Wer nix werd, werd Nerd',
    playable: true,
    summary: 'Geheime Gebote, wie viele Antworten ein Team zu einer Kategorie nennen kann.',
    schema: [
      { key: 'tieRule', label: 'Gleich hohe Höchstgebote', type: 'select', options: ['Teams wählen „Starten“ oder „Nachziehen“, bei gleicher Wahl Münzwurf', 'Gleich hohes Gebot gilt als zweithöchstes Team'] },
      { key: 'categories', label: 'Kategorien', type: 'list', min: 5, max: 5, itemLabel: (i) => (i === 4 ? 'Kategorie 5 · großer Höhepunkt' : `Kategorie ${i + 1}`),
        fields: [text('name', 'Kategorie', 120), area('answers', 'Gültige Antworten (eine pro Zeile, Varianten mit / trennen)', 6000, { rows: 6 })] },
    ],
    example: {
      tieRule: 'Teams wählen „Starten“ oder „Nachziehen“, bei gleicher Wahl Münzwurf',
      categories: [
        { name: 'Figuren aus Super Mario', answers: 'Mario\nLuigi\nPeach / Prinzessin Peach\nToad\nYoshi\nBowser\nWario\nWaluigi\nDaisy\nDonkey Kong' },
        { name: 'Länder, die auf „-stan“ enden', answers: 'Afghanistan\nPakistan\nKasachstan\nUsbekistan\nTurkmenistan\nKirgisistan / Kirgistan\nTadschikistan' },
        { name: 'Europäische Hauptstädte', answers: 'Berlin\nParis\nRom\nMadrid\nWien\nLissabon\nAmsterdam\nBrüssel\nPrag\nWarschau' },
        { name: 'Planeten unseres Sonnensystems', answers: 'Merkur\nVenus\nErde\nMars\nJupiter\nSaturn\nUranus\nNeptun' },
        { name: 'Deutsche Bundesländer', answers: 'Baden-Württemberg\nBayern\nBerlin\nBrandenburg\nBremen\nHamburg\nHessen\nMecklenburg-Vorpommern\nNiedersachsen\nNordrhein-Westfalen / NRW\nRheinland-Pfalz\nSaarland\nSachsen\nSachsen-Anhalt\nSchleswig-Holstein\nThüringen' },
      ],
    },
  },
};

const DEFAULT_ORDER = ['leichte5', 'dummes', 'land', 'kassenschlager', 'trumpf5', 'musik', 'jauch', 'nerd'];

// Weitere Spiele nur für die Spiele-Datenbank (nie automatisch in einer Show).
const { EXTRA_TYPES, EXTRA_ORDER, WHEEL } = require('./defaults-extra');
Object.assign(TYPES, EXTRA_TYPES);

// Bei jedem Spiel mit festen Punktwerten: Block „Punkte – wie viele wofür“ im Editor.
const { scoringField } = require('./scoring');
for (const [type, t] of Object.entries(TYPES)) {
  const f = scoringField(type);
  if (f && !t.schema.some((x) => x.key === 'scoring')) t.schema.push(f);
}
const LIBRARY_ORDER = [...DEFAULT_ORDER, ...EXTRA_ORDER];

// Münzzeremonien nach den aktiven Positionen 4, 6 und 8 (Preisstufen 4–2–2).
const COIN_POSITIONS = [4, 6, 8];
const SHOW_SIZE = 8;

const TEAM_COLORS = ['#ff2e88', '#ffd400', '#00d1ff', '#7cff4f', '#ff7a00', '#b16cff'];

// Für den Editor: Schema ohne Funktionen, Beschriftungen werden ausgerechnet.
function publicSchema(fields) {
  return fields.map((f) => {
    const out = { ...f };
    if (f.type === 'list') {
      out.itemLabels = Array.from({ length: f.max }, (_, i) => (f.itemLabel ? f.itemLabel(i) : `${i + 1}`));
      delete out.itemLabel;
      if (f.itemNote) { out.itemNotes = Array.from({ length: f.max }, (_, i) => f.itemNote(i)); delete out.itemNote; }
      if (f.fields) out.fields = publicSchema(f.fields);
    }
    if (f.type === 'object') out.fields = publicSchema(f.fields);
    return out;
  });
}

function publicTypes() {
  const out = {};
  for (const [key, t] of Object.entries(TYPES)) {
    out[key] = { title: t.title, playable: t.playable, summary: t.summary, schema: publicSchema(t.schema) };
  }
  return out;
}

module.exports = { TYPES, DEFAULT_ORDER, LIBRARY_ORDER, EXTRA_ORDER, WHEEL, COIN_POSITIONS, SHOW_SIZE, TEAM_COLORS, JAUCH_LADDER, MOVIE_HINTS, publicTypes };
