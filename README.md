# Quizshow

Live-Quizshow als Webanwendung mit vier synchronisierten Oberflächen: Startseite,
Teamansicht (iPad), Moderatorenbereich (Show-Regie) und Beamer-/Publikumsansicht.
Grundlage ist der Masterprompt (Produktspezifikation, Version 1.0).

## Starten per Doppelklick (Show-Abend im eigenen WLAN)

1. Einmal Node.js installieren (kostenlos, LTS-Version): https://nodejs.org
2. Dieses Repository als ZIP herunterladen (GitHub → „Code“ → „Download ZIP“) und entpacken.
3. Doppelklick auf **„Quizshow starten (Windows).bat“** bzw. **„Quizshow starten (Mac).command“**
   (Mac beim ersten Mal: Rechtsklick → „Öffnen“). Beim ersten Start werden die Bausteine installiert.
4. Das Fenster zeigt die Adressen für iPads und Beamer (z. B. `http://192.168.178.23:3000`).
   Passwort für Regie und Editor: `fabian`. Fenster während der Show offen lassen.

Alle Daten (Shows, Spiele, Medien) liegen im Ordner `data` neben den Startdateien.

## Starten

Voraussetzung: Node.js 20 oder neuer.

```bash
npm install
npm start
```

Danach `http://localhost:3000` öffnen. Das Passwort für Moderation/Admin (Regie, Editor)
ist dauerhaft `fabian`. Bei Bedarf überschreibt `QUIZ_ADMIN_PASSWORD=…` es.
Das Finale-iPad der Moderation meldet sich auf der Startseite links an („🎤 Moderation (Finale)“,
Passwort `fabian`) und darf dort nur die eigenen Finalantworten abgeben.
Teams, Beamer und Moderation müssen im selben Netz den Server erreichen können
(z. B. `http://<IP-des-Laptops>:3000`).

Hinweis: Die Anwendung braucht den Node-Server (Echtzeit, Datenbank, Login). Über
GitHub Pages oder als einzelne HTML-Datei ist nur die Startseite sichtbar, spielen
lässt sich so nicht.

| Seite | Zweck |
| --- | --- |
| `index.html` | Startseite: „Als Team teilnehmen“ und „Moderator-Login“ |
| `team.html` | Teamansicht für iPads, nur eigene private Daten |
| `moderator.html` | Live-Regie, Punkte & Protokoll und der Punkt **Editor** mit Teams, Show-Editor, Spiele-Datenbank (`?view=live` bzw. `?view=editor` zeigt nur einen Teil; der Prototyp hat dafür die Reiter „Moderation“ und „Editor“) |
| `beamer.html` | Publikumsansicht, zeigt nur freigegebene Inhalte |

Tests: `npm test`

## Prototyp ohne Server

`npm run build:prototype` erzeugt in `dist-prototype/` einen klickbaren Prototyp.
Die Übersichtsseite `prototype.html` zeigt Moderation, Beamer, drei Team-iPads und
die Startseite nebeneinander. Die Spiellogik läuft dabei im Browser, alles bleibt in
diesem einen Browser gespeichert. Moderator-Passwort im Prototyp: `fabian`.

`npm run build:single` erzeugt zusätzlich `dist-single/quizshow-prototyp.html`: den
kompletten Prototyp als **eine** eigenständige Datei ohne nachgeladene Dateien. Sie läuft
per Doppelklick direkt von der Festplatte und auch in abgeschotteten Vorschauen.

## Ablauf in Kürze

1. Als Moderator anmelden, unter **Teams** die Teams anlegen (Standard: sechs).
   Jedes Team bekommt einen geheimen Zugangscode und einen persönlichen Link.
2. Auf jedem iPad die Startseite öffnen, Team wählen und Code eingeben (oder den Link öffnen).
   Bei Verbindungsabbruch oder Neuladen verbindet sich das Gerät automatisch wieder.
3. Auf dem Gerät an der Leinwand `http://<IP-des-Laptops>:3000/beamer.html` öffnen und „⛶ Vollbild“
   tippen (startet Vollbild und Ton; Taste F oder Doppelklick schaltet um). Bedienelemente und Mauszeiger
   blenden sich aus, der Bildschirm bleibt an. iPhone/iPad: Seite über Teilen → „Zum Home-Bildschirm“
   öffnen, dann läuft sie ohne Browserleisten. Die Adresse steht auch in der Live-Regie beim Beamer.
4. In der **Live-Regie** ein Spiel aktivieren, den Beamer steuern, Fragen freigeben und bewerten.

## Zusätzliche Spiele in der Spiele-Datenbank

Elf weitere Spielarten liegen nur in der **Spiele-Datenbank** (Editor → Spiele-Datenbank) und
kommen nie automatisch in eine Show. Einsetzen: im Show-Editor unter „2. Spiele“ einen Platz
freimachen und „In Show einsetzen“ bzw. „⇄ Ersetzen“ wählen.

| Spiel | Kurz | Medien |
|---|---|---|
| Dumm, dumm, dumm | 5 Fragen A–D, Einsatz 1–5 je einmal, richtig + / falsch − | – |
| Film ab – Buzzer an! | Filmausschnitt, Buzzer, falsch sperrt | Video je Film |
| Ich weiß nicht, dass du weißt es doch | Bild, Buzzer wählt ein Team, 10 s | Bild je Runde |
| … 2.0 | alle schreiben, schnellster Buzzer schätzt ein (alles oder nichts, auch die eigene Antwort); alle anderen richtigen Teams +1 | Bild je Runde |
| Hits me baby, one more time | Lied in Stufen 0,5/1/3/5/10 s, Punkte je Stufe (Vorschlag 5–1, bestätigen) | Lied je Runde |
| Song Song Song | Mash-up, beide Titel schreiben, Buzzer sperrt niemanden | Mash-up je Rätsel |
| Danke, gleichfalsch! | 25 Begriffe, 3 falsch, reihum mit 60 s, Aussteigen sichert | – |
| Erst ich, dann du, dann du, dann du | 24 Felder, sichern oder zocken | – |
| Habt ihr noch Fragen? | Teams stellen Fragen, 20 s, +1/−1 bzw. +2 | – |
| Das geht mir zu weit | zwei Einträge aus einer Datenbank, Differenz entscheidet | – |
| Brain or Dreh'n | 12 Kategorien A–D, Glücksrad mit 16 Feldern, Spielpunkte am Ende | – |

Die Vergleichs-Datenbanken (`server/datasets.js`) nennen Quelle, Datenstand und Rechenweg; im
Editor lassen sie sich je Runde korrigieren. Die Bundesliga-Tabelle ist kein Live-Abruf und muss
vor der Show aktualisiert werden.

## Stand der Umsetzung (erste Phase)

Umgesetzt:

- Node-Server mit WebSockets, alle Zustandsänderungen werden serverseitig geprüft
  und als JSON-Datei gespeichert (`data/db.json`, atomar geschrieben).
- Moderator-Login mit scrypt-Passwort-Hash, Sitzungstoken und Bremse gegen Passwort-Raten.
- Teams mit schwer erratbaren Zugangscodes (erneuerbar, alter Code wird ungültig),
  Wiederverbindung ohne Doppel-Teams.
- Privatsphäre: Teams erhalten nur ihre eigenen Daten, der Beamer nur freigegebene Inhalte.
  Das wird serverseitig gefiltert, nicht nur in der Oberfläche versteckt.
- Idempotente Aktionen (eindeutige Aktions-IDs), daher keine doppelten Punkte bei Doppelsendungen.
- Punktebuch mit Begründung, „Rückgängig“ als Gegenbuchung, Änderungsprotokoll.
- Showablauf mit acht Positionen, „Die leichten 5“ fest auf Position 1,
  Münzen nach Position 4, 6 und 8 inkl. Gleichstandswarnung und Schätzfrage-Entscheid.
- Teampulte auf dem Beamer in Originaloptik und -anordnung (Show-Bild, Bögen leer, erzeugt mit
  `scripts/build-podiums.py`); je Team lässt sich unter **Teams** ein 3D-Avatar (am besten
  freigestelltes PNG) hochladen, der im Bogen hinter dem Pult steht. Ohne Avatar bleibt das Pult leer.
- **Showablauf wie eine Präsentation**: In der Live-Regie führt „Weiter“ (oder Pfeil rechts,
  Leertaste, Presenter-Klicker) Schritt für Schritt durch die Show – Startbild, Vorstellung der
  Teams, Intro-Video, einmal die Übersicht Kategorien, je Spiel Spieltitel und Spiel, nach Spiel 4, 6 und 8 je eine Pause und erst danach die Münzvergabe (mehr Spannung),
  Rangliste und Abschluss. Jeder Schritt schaltet Spiel und Beamer automatisch. Nach einer offenen
  Münzvergabe (Gleichstand) geht es erst weiter, wenn die Münze vergeben ist. Im Show-Editor lässt
  sich der Ablauf ändern (Pausen einfügen, verschieben, löschen, Standard wiederherstellen).
- **Intro-Video je Show**: im Show-Editor hochladen oder austauschen (MP4, WebM, MOV). Es läuft im
  Showablauf direkt nach dem Startbild bildschirmfüllend, danach erscheint das Logo. Der Server legt
  Videos unter `data/media/` ab (Ordner per `QUIZ_MEDIA_DIR`, Größe per `QUIZ_MEDIA_MAX_MB`, Standard
  1024 MB) und löscht sie, sobald keine Show mehr darauf verweist. Im Prototyp bleiben sie im Browser.
- Die Beamer-Ansicht schaltet der Showablauf; in der Live-Regie steht nur noch die Beamer-Vorschau.
- **Pause**: Moderationspult mit „PAUSE“-Bildschirm, dahinter eine Big-Band auf drei Podeststufen
  (Schlagzeug, zwei Sängerinnen, Bass, Marimba, Saxofone, Gitarre, Trompete, Posaune, Keyboard) im
  Avatar-Stil der Show, die sich im Takt bewegt. **Eigene Lieder je Pause**: im Show-Editor beim
  Pausenschritt „♪ Lieder“ – MP3/M4A/WAV/OGG hochladen, sortieren, entfernen. Sie laufen nacheinander
  in Schleife, die Band reagiert auf Bass, Snare und Hi-Hat der Musik, der Liedtitel steht auf dem
  Bildschirm. Ohne eigene Lieder läuft der eingebaute Pausensong (Ton nach „Ton aktivieren“ am Beamer).
- Beamer: Startbild, Intro mit Teams, Übersicht Kategorien (4–2–2), Spieltitel-Animation, Spielansicht,
  Ranglisten-Enthüllung, Münzanimation (die Münze hebt vom Moderationspult ab und fliegt auf das Pult des Gewinnerteams; vergebene Münzen bleiben dort stehen und fehlen auf dem Moderationspult, auch in der Pause), eigene synthetische Soundeffekte.
- **Mehrere Shows**: anlegen (optional mit den Teams der geöffneten Show), umbenennen,
  mit Datum versehen, öffnen, duplizieren und löschen. Jede Show hat eigene Spiele, Teams und Punkte.
- Show-Editor mit Autosave („Gespeichert“ / „Ungespeicherte Änderungen“).
- **Spiele-Datenbank** mit allen acht Spielen und Beispielinhalten. Einträge lassen sich anlegen,
  duplizieren, bearbeiten und löschen. Die Show wird frei aus der Datenbank zusammengestellt,
  auch mehrfach mit demselben Spiel; jede Show bekommt eine eigene Kopie.
- Showablauf als Brett mit acht Plätzen und Mülleimer in der Mitte (Ziehen oder Klicken).
- Formular-Editor für die Inhalte aller acht Spiele, ohne Programmierung.
- **Alle acht Spiele live spielbar** mit Team-iPad, Beamer und Moderation:
  - *Die leichten 5*: Freitext, Bewertung pro Antwort.
  - *Dumm ist der, der Dummes kriegt*: A–D, Buzzer nach dem Sperren, 10-Sekunden-Fenster
    (serverseitig), Nachabgabe durch die Moderation, fünf Fragen, bei jeder Frage ein Antworttausch
    für das schnellste Team.
  - *Ich sehe ein Land, das du nicht siehst*: Karte (Welt, Europa, Deutschland) zum Antippen,
    erst Tipps, dann Zielort enthüllen, Entfernung in km, manuelle Korrektur. Je Aufgabe wählbar:
    gesuchter *Punkt* (nächstes Team gewinnt) oder *ganzes Land* (Welt-/Europakarte; jedes Team,
    das im Land tippt, bekommt 1 Punkt – mit kleiner Toleranz an Küsten und bei Kleinstaaten).
    Ländergrenzen: Natural Earth 1:50 Mio., erzeugt mit `node scripts/build-countries.mjs`.
  - *Das ist ein echter Kassenschlager*: private Paywall mit zehn Hinweisen, 20 $ Start,
    höchstens vier Käufe pro Film, Züge in bis zu vier Zyklen, +5 $ bei richtig, Ausscheiden
    mit 0 $, einmalige Umrechnung ⌈Guthaben ÷ 2⌉.
  - *5 ist Trümpf*: Hinweise nacheinander, Buzzer, Punkte nach Hinweisstufe.
  - *Musikquiz*: Brett mit fünf Kategorien × 1/2/3 Punkte, Buzzer, „Song Song Song“-Hinweis.
  - *Ein Hauch von Günther Jauch*: acht Fragen, Leiter, Sicherheitsstufe bei Frage 4,
    Aussteigen, 50:50- und Telefonjoker (ein Joker pro Frage für alle Teams).
  - *Wer nix werd, werd Nerd*: geheime Gebote, Stichentscheid bei Gleichstand, erster Versuch
    (3 Fehler), zweiter Versuch (2 Fehler, Verlust höchstens 3 Punkte).
- Spiellogik je Spiel in `server/play-*.js`, gemeinsame Bausteine in `server/core.js`.
  Kartenumrisse: Natural Earth (gemeinfrei), erzeugt mit `scripts/build-maps.mjs`.

- **Rangliste in der Live-Regie** mit −1/+1/± je Team (wird als Korrektur gebucht, letzte Buchung rückgängig).
- **Teams je Show**: Im Editor unter „Teams“ die Show wählen und ihre Teams vorab eintragen oder aus einer
  anderen Show übernehmen. Zugangscodes sind vierstellige Zahlen; neue Shows starten mit sechs Teams.
- **Finale: Rückgängig** für den letzten Schritt (z. B. verklickte Bewertung nach einem Münzeinsatz).
- **Spiel 2**: Das schnellste Team wählt den Tauschpartner direkt über die Teampulte (eigenes Team ausgegraut).
- **Intro-Lied je Kategorie**: Im Show-Editor beim Spiel MP3 oder MP4 hochladen; es läuft auf dem Beamer,
  solange die Spieltitel-Folie dieses Spiels steht. Ist es zu Ende, schaltet der Showablauf automatisch
  ins Spiel weiter; wer vorher weiterschaltet, blendet es aus.
- **Finale gegen die Moderation** (Showablauf: nach der Rangliste): Das Team mit den meisten Punkten
  spielt gegen die Moderation. Beide schreiben jede Frage gleichzeitig ohne Zeitdruck auf. Das Team
  bekommt pro richtiger Antwort einen Punkt, die Moderation bei jeder Frage, ohne ihre Antwort zu zeigen.
  Mit einer Münze zwingt das Team sie zum Aufdecken: richtig → Münze weg, Punkt bleibt; falsch → kein
  Punkt, Münze zurück. Wer zuerst das Ziel erreicht (Editor, Standard 5), gewinnt; erreichen es beide
  gleichzeitig, folgt Sudden Death bis zum ersten Fehler oder bis die letzte Münze verloren ist. Der
  Sieger bekommt ein Ticket für die große Finalshow. Fragen und Ziel im Editor unter „Show-Editor“.

Noch offen (nächste Phasen laut Masterprompt):

- Versionen und Archiv-Snapshots von Shows.
- QR-Codes, Co-Moderator-Rechte, Test-/Vorschaumodus ohne echte Punkte.
- Medien-Uploads, Musik, editierbare Design-Tokens im Editor, Handschrift-Eingabe mit Stylus.

## Mitspielen per QR-Code

Auf dem Startbild des Beamers erscheint unten rechts ein QR-Code. Er enthält immer die aktuelle WLAN-Adresse des Show-Rechners (z. B. `http://192.168.2.38:3000/`) – an jedem Ort und in jedem WLAN automatisch richtig. Teams scannen ihn mit der Kamera des iPads und landen direkt auf der Startseite zum Beitreten.
