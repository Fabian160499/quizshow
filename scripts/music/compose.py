"""Komponiert die Standard-Musik des Show-Intros für alle Themen.

Aufruf:  python3 scripts/music/compose.py [thema ...]
Ergebnis: assets/music/<thema>-intro.mp3   Eröffnung, Höhepunkt genau auf tl.boom
          assets/music/<thema>-bed.mp3     Musikbett (nahtlose Schleife)
          assets/music/<thema>-team1..6.mp3  Team-Jingles (Einschlag bei 1,7 s)
          assets/music/<thema>-cohost.mp3, -host.mp3 (Einschlag bei 1,7 s), -all.mp3 (Einschlag bei 0,1 s)
Die Zeitachsen kommen aus assets/data/show-intro.json – Musik und Bild bleiben synchron.
"""
import json
import os
import subprocess
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
import synth as S  # noqa: E402
from synth import n, chord, SR  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
CAT = json.load(open(os.path.join(ROOT, 'assets', 'data', 'show-intro.json'), encoding='utf8'))
OUT = os.path.join(ROOT, 'assets', 'music')
HIT = 1.7  # Einschlag in den Jingles (passt zu personScene im Browser)


class Grid:
    def __init__(self, bpm, anchor, swing=0.0):
        self.beat = 60.0 / bpm
        self.bar = self.beat * 4
        self.anchor = anchor
        self.swing = swing

    def t(self, bar, beat=0.0):
        b = beat
        fr = b % 1.0
        if self.swing and abs(fr - 0.5) < 1e-6:
            b = b + self.swing
        return self.anchor + bar * self.bar + b * self.beat


def save(name, x):
    os.makedirs(OUT, exist_ok=True)
    wav = os.path.join('/tmp', f'{name}.wav')
    import scipy.io.wavfile as W
    pk = np.max(np.abs(x)) + 1e-9
    y = x / pk * 0.93 if pk > 0.93 else x
    W.write(wav, SR, (y.T * 32767).astype(np.int16))
    mp3 = os.path.join(OUT, f'{name}.mp3')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '112k', mp3], check=True)
    os.remove(wav)
    rms = 20 * np.log10(np.sqrt(np.mean(y ** 2)) + 1e-9)
    print(f'  {name}.mp3  {x.shape[1] / SR:5.1f}s  rms {rms:5.1f} dB')


def fade_out(x, sec):
    N = int(sec * SR)
    x[:, -N:] *= np.linspace(1, 0, N) ** 2
    return x


def loop_render(build, bars, grid_bpm, swing=0.0, ir=2.6, wet=0.8):
    """Rendert 2 Durchläufe und schneidet den zweiten heraus (Hallfahnen laufen über die Naht)."""
    g = S.Mix(0)
    seg = 60 / grid_bpm * 4 * bars
    m = S.Mix(seg * 2 + 0.01)
    grid = Grid(grid_bpm, 0.0, swing)
    build(m, grid, 0, bars)
    build(m, grid, bars, bars)
    y = m.render(ir, wet)
    a = int(seg * SR)
    return y[:, a:a + int(seg * SR)]


# ====================================================================================
#   STUDIO – Bigband, Swing, Bb-Dur (Retro-Samstagabendshow)
# ====================================================================================
class Studio:
    bpm = 134.4
    swing = 0.16
    key = n('Bb3')
    prog = [('Bb', '6'), ('G', '7'), ('C', 'min7'), ('F', '7')]
    melody = [  # (Takt-Schlag ab Takt 0, Dauer in Schlägen, Ton)
        (3, .5, 'F5'), (3.5, .5, 'G5'),
        (4, 1, 'Bb5'), (5, .5, 'A5'), (5.5, .5, 'G5'), (6, 1, 'F5'), (7, 1, 'D5'),
        (8, 1.5, 'Eb5'), (9.5, .5, 'F5'), (10, 2, 'G5'),
        (12, .5, 'F5'), (12.5, .5, 'D5'), (13, 1, 'Bb4'), (14, .5, 'C5'), (14.5, 1.5, 'D5'),
        (16, 2.5, 'Eb5'), (19, .5, 'G5'), (19.5, .5, 'A5'),
        (20, 1, 'C6'), (21, .5, 'Bb5'), (21.5, .5, 'A5'), (22, 1, 'G5'), (23, 1, 'F5'),
        (24, 1.5, 'G5'), (25.5, .5, 'A5'), (26, 1, 'Bb5'), (27, 1, 'D6'),
        (28, 3.5, 'Bb5'),
    ]
    theme_chords = [('Bb', '6'), ('G', 'min7'), ('C', 'min7'), ('F', '7'), ('Eb', '6'), ('E', 'dim7'), ('C', 'min7'), ('Bb', '6')]

    def dyn(self, tl, g):
        b = tl['boom']
        pre = tl['count'] if tl.get('count') else b - g.bar
        return [(0, 0.3), (tl['teaser'] - 0.01, 0.3), (tl['teaser'], 0.42), (pre, 0.5), (b - 0.05, 0.72), (b, 1.0), (b + 8 * g.bar - 0.05, 1.0), (b + 8 * g.bar, 0.62)]

    def ch(self, name, kind, base=3):
        return chord(n(f'{name}{base}'), kind)

    # --- Bausteine ---
    def drums(self, m, g, bar, inten=1.0, fill=False):
        for b in range(4):
            m.add(S.ride(0.13 * inten, 0.8), g.t(bar, b), pan=0.35, rev=0.15)
            if b in (1, 3):
                m.add(S.ride(0.09 * inten, 0.5), g.t(bar, b + 0.5), pan=0.35, rev=0.1)
                m.add(S.snare(0.32 * inten, 200, 0.11), g.t(bar, b), pan=-0.05, rev=0.25)
                m.add(S.hat(0.25 * inten), g.t(bar, b), pan=-0.3, rev=0.05)
            if b in (0, 2):
                m.add(S.kick(0.55 * inten), g.t(bar, b), rev=0.05)
        if fill:
            for k, b in enumerate([2.5, 3, 3.25, 3.5, 3.75]):
                m.add(S.tom(160 - k * 18, 0.45 * inten, 0.25), g.t(bar, b), pan=-0.4 + k * 0.2, rev=0.3)

    def walk(self, m, g, bar, name, kind, inten=1.0):
        root = n(f'{name}2')
        if root > n('E2'):
            root -= 12
        tones = chord(root, kind)
        line = [tones[0], tones[1] if len(tones) > 1 else root + 4, tones[2], root + 11 if kind == '7' else tones[2] + 2]
        for b, p in enumerate(line):
            m.add(S.bass_pluck(p, g.beat * 0.92, 0.7 * inten, 700), g.t(bar, b), rev=0.05)

    def comp(self, m, g, bar, name, kind, inten=1.0, riff=True):
        notes = self.ch(name, kind, 4)
        if riff:  # Saxophone: kurze Swing-Akzente auf 2& und 4
            for b, d in ((1.5, 0.45), (3, 0.9)):
                m.add(S.brass_chord(notes, g.beat * d, 0.35 * inten, 0.8, 'sax'), g.t(bar, b), pan=-0.35, rev=0.3)
        else:
            m.add(S.brass_chord(notes, g.bar * 0.95, 0.22 * inten, 0.6, 'sax'), g.t(bar, 0), pan=-0.35, rev=0.35)
        # Posaunen: Stoß auf 4&
        m.add(S.brass_chord(self.ch(name, kind, 3)[:2], g.beat * 0.4, 0.3 * inten, 0.9, 'trombone'), g.t(bar, 3.5), pan=0.3, rev=0.3)

    def lead(self, m, g, mel, bar0=0, vol=0.5, oct_=True):
        for b, d, p in mel:
            bar = bar0 + int(b // 4)
            bt = b % 4
            m.add(S.brass(n(p), g.beat * d * 0.95, vol, 1.1, 3, 'trumpet', fall=(d >= 3)), g.t(bar, bt), pan=0.1, rev=0.35)
            if oct_:
                m.add(S.brass(n(p) - 12, g.beat * d * 0.95, vol * 0.55, 0.9, 2, 'sax'), g.t(bar, bt), pan=-0.2, rev=0.35)

    def tutti(self, m, t, name='Bb', kind='6', vol=1.0, dur=1.6):
        hi = self.ch(name, kind, 4)
        m.add(S.brass_chord(hi + [hi[0] + 12], dur, 0.75 * vol, 1.2, 'trumpet', fall=False), t, rev=0.45)
        m.add(S.brass_chord(self.ch(name, kind, 3), dur, 0.55 * vol, 1.0, 'trombone'), t, pan=0.2, rev=0.4)
        m.add(S.bass_pluck(n(f'{name}1') if n(f'{name}1') >= n('E1') else n(f'{name}1') + 12, dur, 0.9 * vol, 900), t, rev=0.05)
        m.add(S.crash(0.5 * vol), t, rev=0.35)
        m.add(S.kick(0.9 * vol), t)
        m.add(S.timpani(n(f'{name}2'), 0.6 * vol), t, rev=0.4)

    def build(self, m, t0, sec, top='F', vol=1.0):
        m.add(S.snare_roll(sec, 0.38 * vol), t0, pan=-0.05, rev=0.3)
        m.add(S.timp_roll(n(f'{top}2'), sec, 0.5 * vol), t0, rev=0.4)
        m.add(S.riser(sec, 0.22 * vol), t0, rev=0.3)
        # Bläser-Crescendo, chromatisch nach oben
        steps = max(2, int(sec / 0.45))
        for k in range(steps):
            tt = t0 + k * sec / steps
            m.add(S.brass_chord(chord(n(f'{top}3') - steps + k + 1, '7'), sec / steps * 0.9, (0.18 + 0.35 * k / steps) * vol, 0.7 + 0.5 * k / steps, 'section'), tt, rev=0.35)

    # --- Stücke ---
    def intro(self, tl):
        boom = tl['boom']
        g = Grid(self.bpm, boom, self.swing)
        total = boom + 20 * g.bar + 3
        m = S.Mix(total)
        m.dyn = self.dyn(tl, g)
        # Cold Open: tiefes Posaunen-Pedal, Studio-Uhr, Rückwärts-Becken in den Vorspann
        m.add(S.brass_chord([n('Bb1') + 12, n('F2') + 12], 2.9, 0.18, 0.4, 'trombone'), 0.0, rev=0.6)
        for k in range(6):
            m.add(S.hat(0.18), 0.25 + k * 0.45, pan=0.4, rev=0.4)
        m.add(S.reverse_cymbal(2.0, 0.25), tl['teaser'] - 2.0, rev=0.2)
        # Vorspann: 7 Takte Swing bis zum Sprung in den Pool
        prog = [('Bb', '6'), ('G', '7'), ('C', 'min7'), ('F', '7'), ('Bb', '6'), ('Eb', '7')]
        for i, (c, k) in enumerate(prog):
            bar = -7 + i
            self.drums(m, g, bar, 0.85, fill=(i == 3))
            self.walk(m, g, bar, c, k, 0.9)
            self.comp(m, g, bar, c, k, 0.9)
            if i in (0, 2, 4):  # Trompeten-Riff
                for b, d, p in ((0, .5, 'Bb4'), (0.5, .5, 'D5'), (1, .5, 'F5'), (1.5, 1, 'G5'), (3, .5, 'F5'), (3.5, .5, 'D5')):
                    m.add(S.brass(n(p), g.beat * d * 0.8, 0.32, 1.0, 2, 'trumpet'), g.t(bar, b), pan=0.25, rev=0.3)
        # Takt -1: Spannung, Sturz (Lauf abwärts) – dann Einschlag
        self.build(m, g.t(-1, 0), g.bar * 0.72, 'F', 0.9)
        for k in range(8):  # Bläser-Lauf abwärts = der Sturz in den Pool
            m.add(S.brass(n('F5') - k * 2, g.beat * 0.22, 0.28, 1.0, 2, 'trumpet', scoop=False), g.t(-1, 3 + k * 0.125), pan=0.2, rev=0.4)
        m.add(S.splash(0.55), boom - 0.05, rev=0.2)
        m.add(S.impact(0.6), boom, rev=0.4)
        # Höhepunkt: Bigband-Tutti und Hauptthema (8 Takte)
        self.tutti(m, boom, 'Bb', '6', 1.0, 2.2 * g.beat)
        for i, (c, k) in enumerate(self.theme_chords):
            self.drums(m, g, i, 1.0, fill=(i == 7))
            self.walk(m, g, i, c, k, 1.0)
            self.comp(m, g, i, c, k, 0.75, riff=(i % 2 == 1))
            if i == 4:
                m.add(S.crash(0.35), g.t(i, 0), rev=0.3)
        self.lead(m, g, self.melody, 0, 0.42)
        # Danach 12 Takte Bett (für die Off-Ansage), leiser
        for i in range(12):
            c, k = self.prog[i % 4]
            bar = 8 + i
            self.drums(m, g, bar, 0.6, fill=(i % 4 == 3))
            self.walk(m, g, bar, c, k, 0.8)
            self.comp(m, g, bar, c, k, 0.55, riff=True)
        y = m.render(2.8, 0.85)
        return fade_out(y, 0.4)

    def bed(self):
        def b(m, g, start, bars):
            for i in range(bars):
                c, k = self.prog[i % 4]
                self.drums(m, g, start + i, 0.6, fill=(i % 4 == 3))
                self.walk(m, g, start + i, c, k, 0.8)
                self.comp(m, g, start + i, c, k, 0.55, riff=(i % 2 == 0))
        return loop_render(b, 8, self.bpm, self.swing)

    MOTIFS = [
        [(0, .5, 0), (.5, .5, 4), (1, .5, 7), (1.5, 2, 9)],
        [(0, 1, 7), (1, .5, 9), (1.5, .5, 7), (2, 2, 12)],
        [(0, .5, 12), (.5, .5, 11), (1, .5, 9), (1.5, .5, 7), (2, 2, 4)],
        [(0, 1.5, 4), (1.5, .5, 7), (2, 2, 11)],
        [(0, .5, 7), (.5, .5, 4), (1, .5, 7), (1.5, .5, 9), (2, 2, 14)],
        [(0, 1, 0), (1, 1, 7), (2, 2, 12)],
    ]
    KEYS = ['Bb', 'C', 'D', 'Eb', 'F', 'G']

    def stinger(self, i):
        g = Grid(self.bpm, HIT, self.swing)
        m = S.Mix(HIT + 3.6)
        key = self.KEYS[i % 6]
        self.build(m, 0.0, HIT - 0.05, key, 0.8)
        self.tutti(m, HIT, key, '6' if i % 2 == 0 else 'maj7', 0.9, g.beat * 1.5)
        root = n(f'{key}4')
        for b, d, iv in self.MOTIFS[i % 6]:
            m.add(S.brass(root + iv, g.beat * d * 0.9, 0.42, 1.1, 3, 'trumpet', fall=(d >= 2)), g.t(0, 1 + b), rev=0.4)
        self.drums(m, g, 0, 0.7)
        return fade_out(m.render(2.4, 0.8), 0.5)

    def host(self, co=False):
        g = Grid(self.bpm, HIT, self.swing)
        bars = 4 if co else 6
        m = S.Mix(HIT + bars * g.bar + 2.5)
        self.build(m, 0.0, HIT - 0.05, 'F', 1.0)
        self.tutti(m, HIT, 'Bb', '6', 1.0, g.beat * 1.5)
        mel = [x for x in self.melody if x[0] < bars * 4 and x[0] >= 3]
        for i in range(bars):
            c, k = self.theme_chords[i]
            self.drums(m, g, i, 0.95, fill=(i == bars - 1))
            self.walk(m, g, i, c, k)
            self.comp(m, g, i, c, k, 0.75, riff=(i % 2 == 1))
        self.lead(m, g, mel, 0, 0.42 if not co else 0.34)
        self.tutti(m, g.t(bars, 0), 'Bb', '6', 0.95, g.beat * 3)
        return fade_out(m.render(2.6, 0.85), 0.8)

    def all(self):
        g = Grid(self.bpm, 0.1, self.swing)
        m = S.Mix(0.1 + 4 * g.bar + 4)
        self.tutti(m, 0.1, 'Bb', '6', 1.0, g.beat * 1.5)
        for i, (c, k) in enumerate([('Eb', '6'), ('E', 'dim7'), ('F', '7'), ('F', '7')]):
            self.drums(m, g, i, 1.0, fill=(i == 3))
            self.walk(m, g, i, c, k)
            self.comp(m, g, i, c, k, 0.8, riff=True)
        self.lead(m, g, [(1, 1, 'D5'), (2, 1, 'F5'), (3, 1, 'Bb5'), (4, 3, 'C6'), (8, 1, 'A5'), (9, 1, 'C6'), (10, 2, 'Eb6'), (12, 3.5, 'D6')], 0, 0.42)
        self.build(m, g.t(3, 0), g.bar * 0.9, 'F', 0.8)
        self.tutti(m, g.t(4, 0), 'Bb', '6', 1.1, 2.6)
        m.add(S.timp_roll(n('Bb2'), 2.2, 0.5), g.t(4, 0.2), rev=0.4)
        return fade_out(m.render(2.8, 0.85), 1.0)


# ====================================================================================
#   BÜHNE – moderne Show-Hymne (Festival-EDM + Orchester), a-Moll
# ====================================================================================
class Buehne(Studio):
    bpm = 128
    swing = 0.0
    prog = [('A', 'min'), ('F', 'maj'), ('C', 'maj'), ('G', 'maj')]
    theme_chords = prog * 2
    melody = [
        (0, .5, 'E5'), (1, .5, 'E5'), (1.5, .5, 'D5'), (2, 1, 'C5'), (3, .5, 'D5'), (3.5, .5, 'E5'),
        (4, 1, 'F5'), (5, .5, 'E5'), (5.5, .5, 'D5'), (6, 1, 'C5'), (7, 1, 'A4'),
        (8, 1, 'G5'), (9, 1, 'E5'), (10, 1, 'C5'), (11, .5, 'D5'), (11.5, .5, 'E5'),
        (12, 2, 'D5'), (14, 1, 'B4'), (15, 1, 'G4'),
        (16, .5, 'E5'), (17, .5, 'E5'), (17.5, .5, 'D5'), (18, 1, 'C5'), (19, .5, 'D5'), (19.5, .5, 'E5'),
        (20, 1, 'F5'), (21, 1, 'A5'), (22, 1, 'G5'), (23, 1, 'F5'),
        (24, 1, 'E5'), (25, 1, 'G5'), (26, 1, 'C6'), (27, 1, 'B5'),
        (28, 4, 'A5'),
    ]
    KEYS = ['A', 'B', 'C', 'D', 'E', 'F']

    def drums(self, m, g, bar, inten=1.0, fill=False):
        for b in range(4):
            m.add(S.kick(0.8 * inten, 0.9), g.t(bar, b), rev=0.02)
            m.add(S.hat(0.22 * inten, open_=True), g.t(bar, b + 0.5), pan=0.3, rev=0.05)
            m.add(S.hat(0.12 * inten), g.t(bar, b + 0.25), pan=-0.3, rev=0.0)
            m.add(S.hat(0.12 * inten), g.t(bar, b + 0.75), pan=-0.3, rev=0.0)
            if b in (1, 3):
                m.add(S.clap(0.5 * inten), g.t(bar, b), rev=0.3)
        if fill:
            for k in range(8):
                m.add(S.snare(0.15 + 0.05 * k, 210, 0.08), g.t(bar, 2 + k * 0.25), rev=0.3)

    def walk(self, m, g, bar, name, kind, inten=1.0):
        root = n(f'{name}1')
        if root < n('E1'):
            root += 12
        for b in range(4):
            m.add(S.synth_bass(root, g.beat * 0.4, 0.55 * inten, 500, 2.2), g.t(bar, b + 0.5), rev=0.02)
            m.add(S.sub808(root, g.beat * 0.9, 0.35 * inten), g.t(bar, b), rev=0.0)

    def comp(self, m, g, bar, name, kind, inten=1.0, riff=True):
        notes = chord(n(f'{name}3'), kind)
        notes = [x if x >= n('E3') else x + 12 for x in notes] + [notes[0] + 12]
        # Pump: Akkorde auf die Achtel zwischen den Bassdrums
        for b in range(4):
            m.add(S.supersaw(notes, g.beat * 0.42, 0.28 * inten, 0.005, 4200, 0.08), g.t(bar, b + 0.5), rev=0.25)
        if riff:
            m.add(S.brass_chord(chord(n(f'{name}4'), kind), g.beat * 0.35, 0.3 * inten, 1.3, 'trumpet'), g.t(bar, 0), rev=0.4)

    def lead(self, m, g, mel, bar0=0, vol=0.5, oct_=True):
        for b, d, p in mel:
            bar = bar0 + int(b // 4)
            m.add(S.supersaw([n(p)], g.beat * d * 0.9, vol * 0.7, 0.005, 6500, 0.15), g.t(bar, b % 4), rev=0.35)
            m.add(S.pluck_synth(n(p) + 12, g.beat * d, vol * 0.25, 3000), g.t(bar, b % 4), pan=0.2, rev=0.4)

    def tutti(self, m, t, name='A', kind='min', vol=1.0, dur=1.6):
        notes = chord(n(f'{name}3'), kind)
        m.add(S.impact(0.7 * vol), t, rev=0.4)
        m.add(S.braam(n(f'{name}1') if n(f'{name}1') >= n('E1') else n(f'{name}1') + 12, dur * 1.4, 0.35 * vol), t, rev=0.4)
        m.add(S.brass_chord(chord(n(f'{name}4'), kind) + [n(f'{name}5')], dur, 0.6 * vol, 1.3, 'trumpet'), t, rev=0.45)
        m.add(S.strings(notes + [notes[0] + 12], dur * 1.5, 0.5 * vol, 0.02, 4500), t, rev=0.4)
        m.add(S.crash(0.5 * vol), t, rev=0.35)

    def build(self, m, t0, sec, top='E', vol=1.0):
        m.add(S.snare_roll(sec, 0.35 * vol, rate=(4, 32)), t0, rev=0.35)
        m.add(S.riser(sec, 0.35 * vol), t0, rev=0.3)
        m.add(S.timp_roll(n(f'{top}2'), sec, 0.4 * vol), t0, rev=0.4)

    def intro(self, tl):
        boom = tl['boom']
        g = Grid(self.bpm, boom)
        total = boom + 20 * g.bar + 3
        m = S.Mix(total)
        m.dyn = self.dyn(tl, g)
        # Cold Open: dunkle Fläche, Sub-Pulse
        m.add(S.pad(chord(n('A2'), '5'), tl['teaser'] + 1.5, 0.35, 900, 1.5), 0.0, rev=0.6)
        for k in range(3):
            m.add(S.impact(0.25, True), 0.3 + k * 1.1, rev=0.5)
        # Teaser: Arpeggio-Puls + gefilterte Kick, Takte vor dem Countdown
        cnt = tl['count']
        bars_pre = int((boom - tl['teaser']) / g.bar)
        for i in range(bars_pre, 0, -1):
            bar = -i
            tt = g.t(bar, 0)
            c, k = self.prog[(bars_pre - i) % 4]
            for s16 in range(16):
                m.add(S.pluck_synth(chord(n(f'{c}4'), k)[s16 % 3] + (12 if s16 % 4 == 3 else 0), g.beat / 4, 0.16 + 0.14 * (1 - i / bars_pre), 1500 + 2500 * (1 - i / bars_pre)), g.t(bar, s16 / 4), pan=(s16 % 2) * 0.6 - 0.3, rev=0.35)
            if tt < cnt:
                for b in range(4):
                    m.add(S.kick(0.45, 0.8), g.t(bar, b), rev=0.05)
            m.add(S.pad(chord(n(f'{c}3'), k), g.bar, 0.18, 1400, 0.3), tt, rev=0.5)
        # Countdown: Snare-Wirbel, Riser, Herzschlag-Kick wird schneller
        self.build(m, cnt, boom - cnt - 0.08, 'E', 1.0)
        m.add(S.reverse_cymbal(2.0, 0.6), boom - 2.0, rev=0.2)
        # DROP
        self.tutti(m, boom, 'A', 'min', 1.2, 2.0)
        for i, (c, k) in enumerate(self.theme_chords):
            self.drums(m, g, i, 1.0, fill=(i == 7))
            self.walk(m, g, i, c, k)
            self.comp(m, g, i, c, k, 1.0, riff=(i % 2 == 0))
        self.lead(m, g, self.melody, 0, 0.5)
        for i in range(12):
            c, k = self.prog[i % 4]
            self.drums(m, g, 8 + i, 0.65, fill=(i % 4 == 3))
            self.walk(m, g, 8 + i, c, k, 0.8)
            self.comp(m, g, 8 + i, c, k, 0.6, riff=False)
        return fade_out(m.render(2.6, 0.8), 0.4)

    def bed(self):
        def b(m, g, start, bars):
            for i in range(bars):
                c, k = self.prog[i % 4]
                self.drums(m, g, start + i, 0.6, fill=(i % 4 == 3))
                self.walk(m, g, start + i, c, k, 0.8)
                self.comp(m, g, start + i, c, k, 0.55, riff=False)
        return loop_render(b, 8, self.bpm)

    def stinger(self, i):
        g = Grid(self.bpm, HIT)
        m = S.Mix(HIT + 3.6)
        key = self.KEYS[i % 6]
        kind = 'min' if i % 2 == 0 else 'maj'
        self.build(m, 0.0, HIT - 0.05, key, 0.9)
        self.tutti(m, HIT, key, kind, 0.9, 1.4)
        root = n(f'{key}4')
        for b, d, iv in self.MOTIFS[i % 6]:
            m.add(S.supersaw([root + iv], g.beat * d * 0.9, 0.35, 0.005, 6000, 0.2), g.t(0, 1 + b), rev=0.4)
        self.drums(m, g, 0, 0.7)
        self.walk(m, g, 0, key, kind, 0.8)
        return fade_out(m.render(2.4, 0.8), 0.5)

    def host(self, co=False):
        g = Grid(self.bpm, HIT)
        bars = 4 if co else 6
        m = S.Mix(HIT + bars * g.bar + 2.5)
        self.build(m, 0.0, HIT - 0.05, 'E', 1.0)
        self.tutti(m, HIT, 'A', 'min', 1.1, 1.6)
        for i in range(bars):
            c, k = self.theme_chords[i]
            self.drums(m, g, i, 0.95, fill=(i == bars - 1))
            self.walk(m, g, i, c, k)
            self.comp(m, g, i, c, k, 0.9, riff=(i % 2 == 0))
        self.lead(m, g, [x for x in self.melody if x[0] < bars * 4], 0, 0.45 if not co else 0.36)
        self.tutti(m, g.t(bars, 0), 'A', 'min', 1.0, 2.5)
        return fade_out(m.render(2.6, 0.85), 0.8)

    def all(self):
        g = Grid(self.bpm, 0.1)
        m = S.Mix(0.1 + 4 * g.bar + 4)
        self.tutti(m, 0.1, 'C', 'maj', 1.1, 1.6)
        for i, (c, k) in enumerate([('F', 'maj'), ('G', 'maj'), ('E', 'min'), ('A', 'min')]):
            self.drums(m, g, i, 1.0, fill=(i == 3))
            self.walk(m, g, i, c, k)
            self.comp(m, g, i, c, k, 1.0, riff=True)
        self.lead(m, g, [(0, 1, 'A5'), (1, 1, 'G5'), (2, 2, 'C6'), (4, 1, 'B5'), (5, 1, 'A5'), (6, 2, 'D6'), (8, 2, 'E6'), (10, 2, 'D6'), (12, 4, 'C6')], 0, 0.45)
        self.build(m, g.t(3, 0), g.bar * 0.9, 'E', 0.9)
        self.tutti(m, g.t(4, 0), 'A', 'maj', 1.2, 2.8)
        return fade_out(m.render(2.8, 0.85), 1.0)


# ====================================================================================
#   MUSICAL – Broadway-Ouvertüre, D-Dur
# ====================================================================================
class Musical(Studio):
    bpm = 132
    swing = 0.0
    prog = [('D', 'maj'), ('B', 'min7'), ('G', 'maj7'), ('A', '7')]
    theme_chords = [('D', 'maj'), ('B', 'min'), ('G', 'maj'), ('A', '7'), ('D', 'maj'), ('B', '7'), ('E', 'min7'), ('A', '7')]
    melody = [
        (2, .66, 'A4'), (2.66, .67, 'B4'), (3.33, .67, 'C#5'),
        (4, 2, 'D5'), (6, 1, 'F#5'), (7, 1, 'E5'),
        (8, 1, 'D5'), (9, 1, 'B4'), (10, 1, 'G4'), (11, 1, 'B4'),
        (12, 3, 'A4'), (15, .33, 'A4'), (15.33, .33, 'B4'), (15.66, .34, 'C#5'),
        (16, 1, 'D5'), (17, 1, 'F#5'), (18, 2, 'A5'),
        (20, 1, 'A5'), (21, 1, 'G5'), (22, 1, 'F#5'), (23, 1, 'D#5'),
        (24, 1, 'E5'), (25, 1, 'G5'), (26, 1, 'C#5'), (27, 1, 'E5'),
        (28, 4, 'D5'),
    ]
    KEYS = ['D', 'E', 'F', 'G', 'A', 'Bb']

    def drums(self, m, g, bar, inten=1.0, fill=False):
        # Show-Orchester: Bassdrum 1+3, Becken auf 2+4, leichte Snare-Akzente
        for b in range(4):
            if b in (0, 2):
                m.add(S.kick(0.4 * inten, 1.3), g.t(bar, b), rev=0.2)
            else:
                m.add(S.ride(0.18 * inten, 0.7), g.t(bar, b), pan=0.3, rev=0.2)
                m.add(S.snare(0.18 * inten, 220, 0.1), g.t(bar, b), rev=0.35)
            m.add(S.hat(0.1 * inten), g.t(bar, b + 0.5), pan=-0.3, rev=0.1)
        if fill:
            m.add(S.snare_roll(g.beat * 2, 0.3 * inten), g.t(bar, 2), rev=0.35)

    def walk(self, m, g, bar, name, kind, inten=1.0):
        tones = chord(n(f'{name}2') if n(f'{name}2') <= n('G2') else n(f'{name}1'), kind)
        for b, p in zip((0, 2), (tones[0], tones[2] - 12 if tones[2] - 12 >= n('E1') else tones[2])):
            m.add(S.bass_pluck(p, g.beat * 1.8, 0.65 * inten, 600), g.t(bar, b), rev=0.15)
            m.add(S.timpani(p + 12, 0.15 * inten, 0.8), g.t(bar, b), rev=0.4)

    def comp(self, m, g, bar, name, kind, inten=1.0, riff=True):
        notes = chord(n(f'{name}4'), kind)
        m.add(S.strings(notes, g.bar * 0.95, 0.32 * inten, 0.05, 4000), g.t(bar, 0), rev=0.45)
        for b in (1, 3):  # Klavier „Oom-Pah“
            for p in notes[:3]:
                m.add(S.piano(p, g.beat * 0.5, 0.18 * inten), g.t(bar, b), pan=-0.3, rev=0.3)
        if riff:
            m.add(S.brass_chord(chord(n(f'{name}3'), kind)[:3], g.beat * 0.6, 0.25 * inten, 0.9, 'horn'), g.t(bar, 1.5), pan=0.3, rev=0.4)

    def lead(self, m, g, mel, bar0=0, vol=0.5, oct_=True):
        for b, d, p in mel:
            bar = bar0 + int(b // 4)
            m.add(S.brass(n(p), g.beat * d * 0.95, vol, 1.0, 3, 'trumpet'), g.t(bar, b % 4), pan=0.1, rev=0.45)
            m.add(S.strings([n(p) + 12], g.beat * d, vol * 0.45, 0.04, 6000), g.t(bar, b % 4), rev=0.45)

    def tutti(self, m, t, name='D', kind='maj', vol=1.0, dur=1.6):
        hi = chord(n(f'{name}4'), kind)
        m.add(S.brass_chord(hi + [hi[0] + 12], dur, 0.7 * vol, 1.2, 'trumpet'), t, rev=0.5)
        m.add(S.brass_chord(chord(n(f'{name}3'), kind), dur, 0.5 * vol, 1.0, 'horn'), t, rev=0.5)
        m.add(S.strings(hi + [hi[0] + 12, hi[0] + 24], dur * 1.4, 0.45 * vol, 0.02, 6000), t, rev=0.5)
        m.add(S.timpani(n(f'{name}2'), 0.8 * vol), t, rev=0.4)
        m.add(S.crash(0.55 * vol, 2.2), t, rev=0.4)
        m.add(S.bass_pluck(n(f'{name}1') if n(f'{name}1') >= n('E1') else n(f'{name}1') + 12, dur, 0.8 * vol), t, rev=0.1)

    def build(self, m, t0, sec, top='A', vol=1.0):
        m.add(S.timp_roll(n(f'{top}2'), sec, 0.65 * vol), t0, rev=0.45)
        m.add(S.snare_roll(sec, 0.25 * vol), t0, rev=0.4)
        m.add(S.strings(chord(n(f'{top}3'), '7'), sec, 0.35 * vol, sec * 0.8, 3500, trem=12), t0, rev=0.45)
        steps = max(2, int(sec / 0.5))
        for k in range(steps):
            m.add(S.brass_chord(chord(n(f'{top}3') - steps + k + 1, 'maj'), sec / steps * 0.85, (0.15 + 0.3 * k / steps) * vol, 0.8 + 0.4 * k / steps, 'horn'), t0 + k * sec / steps, rev=0.45)

    def intro(self, tl):
        boom = tl['boom']
        g = Grid(self.bpm, boom)
        total = boom + 20 * g.bar + 3
        m = S.Mix(total)
        m.dyn = self.dyn(tl, g)
        # Saal: Orchester stimmt (Oboe A, Streicher), dann Stille, dann Ouvertüre
        m.add(S.tuning_a(tl['teaser'] + 0.3, 0.55), 0.0, rev=0.6)
        # Programmheft: Ouvertüren-Motiv in Bruchstücken (Hörner + Pauke)
        tz = tl['teaser']
        cnt = tl['count']
        bars_pre = int((boom - tz) / g.bar)
        frag = [(0, 1, 'A4'), (1, 1, 'D5'), (2, 2, 'F#5')]
        for i in range(bars_pre, 0, -1):
            bar = -i
            if g.t(bar, 0) >= cnt:
                continue
            c, k = self.prog[(bars_pre - i) % 4]
            m.add(S.strings(chord(n(f'{c}3'), k), g.bar * 0.98, 0.22, 0.2, 2600, trem=8), g.t(bar, 0), rev=0.5)
            m.add(S.timpani(n(f'{c}2') if n(f'{c}2') <= n('G2') else n(f'{c}1') + 12, 0.35), g.t(bar, 0), rev=0.45)
            if i % 2 == 0:
                for b, d, p in frag:
                    m.add(S.brass(n(p) - 12, g.beat * d * 0.9, 0.3, 0.8, 2, 'horn'), g.t(bar, b), rev=0.5)
        self.build(m, cnt, boom - cnt - 0.08, 'A', 1.0)
        # Vorhang auf!
        self.tutti(m, boom, 'D', 'maj', 1.15, 2.2)
        for i, (c, k) in enumerate(self.theme_chords):
            self.drums(m, g, i, 1.0, fill=(i == 7))
            self.walk(m, g, i, c, k)
            self.comp(m, g, i, c, k, 0.9, riff=(i % 2 == 1))
        self.lead(m, g, self.melody, 0, 0.45)
        for i in range(12):
            c, k = self.prog[i % 4]
            self.drums(m, g, 8 + i, 0.6, fill=(i % 4 == 3))
            self.walk(m, g, 8 + i, c, k, 0.8)
            self.comp(m, g, 8 + i, c, k, 0.6, riff=True)
        return fade_out(m.render(3.2, 0.9), 0.4)


# ====================================================================================
#   CASINO – Spy-Jazz in e-Moll
# ====================================================================================
class Casino(Studio):
    bpm = 112
    swing = 0.14
    prog = [('E', 'min'), ('E', 'min6'), ('C', '7'), ('B', '7')]
    theme_chords = [('E', 'min'), ('E', 'min6'), ('E', 'min'), ('E', 'min6'), ('C', '7'), ('C', '7'), ('B', '7'), ('E', 'min')]
    melody = [
        (4, 1.5, 'B4'), (5.5, .5, 'C5'), (6, 1, 'B4'), (7, 1, 'G4'),
        (8, 3, 'E5'), (11, 1, 'D#5'),
        (12, 1, 'E5'), (13, 1, 'B4'), (14, 1, 'G4'), (15, 1, 'E4'),
        (16, 1, 'G4'), (17, 1, 'A4'), (18, 1, 'B4'), (19, 1, 'D5'),
        (20, 2, 'E5'), (22, 1, 'D5'), (23, 1, 'C5'),
        (24, 3, 'D#5'), (27, 1, 'F#5'),
        (28, 4, 'E5'),
    ]
    KEYS = ['E', 'F', 'G', 'A', 'B', 'C']

    def drums(self, m, g, bar, inten=1.0, fill=False):
        for b in range(4):
            m.add(S.ride(0.2 * inten, 1.1), g.t(bar, b), pan=0.4, rev=0.2)
            if b in (1, 3):
                m.add(S.ride(0.12 * inten, 0.6), g.t(bar, b + 0.5), pan=0.4, rev=0.15)
                m.add(S.hat(0.2 * inten), g.t(bar, b), pan=-0.3, rev=0.05)
            m.add(S.snare(0.06 * inten, 240, 0.25), g.t(bar, b), pan=-0.1, rev=0.2)  # Besen
            if b == 0:
                m.add(S.kick(0.45 * inten), g.t(bar, b), rev=0.05)
        if fill:
            for k, b in enumerate([3, 3.5]):
                m.add(S.tom(140 - k * 30, 0.4 * inten, 0.3), g.t(bar, b), rev=0.3)

    def walk(self, m, g, bar, name, kind, inten=1.0):
        # Spionage-Ostinato
        root = n('E2') if name == 'E' else (n(f'{name}2') if n(f'{name}2') <= n('G2') else n(f'{name}1'))
        for b, iv in ((0, 0), (1.5, 0), (2, 2), (2.5, 2), (3, 3), (3.5, 2)):
            m.add(S.bass_pluck(root + iv, g.beat * 0.45, 0.7 * inten, 800), g.t(bar, b), rev=0.08)

    def comp(self, m, g, bar, name, kind, inten=1.0, riff=True):
        notes = chord(n(f'{name}4'), kind)
        m.add(S.vibes(notes[0] + 12, g.beat, 0.15 * inten), g.t(bar, 0), pan=-0.4, rev=0.4)
        for p in notes:
            m.add(S.vibes(p, g.beat * 0.6, 0.1 * inten), g.t(bar, 2.5), pan=-0.4, rev=0.4)
        m.add(S.organ(chord(n(f'{name}3'), kind), g.bar * 0.9, 0.18 * inten, 0.05, (1, 0.7, 0.5, 0.4, 0.1, 0.1, 0)), g.t(bar, 0), pan=0.3, rev=0.3)
        if riff:
            m.add(S.brass_chord(notes, g.beat * 0.4, 0.3 * inten, 1.0, 'section'), g.t(bar, 3.5), rev=0.35)

    def lead(self, m, g, mel, bar0=0, vol=0.5, oct_=True):
        for b, d, p in mel:
            bar = bar0 + int(b // 4)
            m.add(S.brass(n(p), g.beat * d * 0.95, vol, 0.7, 2, 'trumpet', fall=(d >= 3)), g.t(bar, b % 4), pan=0.15, rev=0.4)
            m.add(S.vibes(n(p) + 12, g.beat * d, vol * 0.3), g.t(bar, b % 4), pan=-0.2, rev=0.4)

    def tutti(self, m, t, name='E', kind='min', vol=1.0, dur=1.6):
        hi = chord(n(f'{name}4'), 'min9' if kind.startswith('min') else '9')
        m.add(S.brass_chord(hi, dur, 0.75 * vol, 1.2, 'section'), t, rev=0.45)
        m.add(S.brass_chord(chord(n(f'{name}3'), kind)[:2], dur, 0.5 * vol, 1.0, 'trombone'), t, rev=0.4)
        m.add(S.crash(0.5 * vol), t, rev=0.35)
        m.add(S.kick(0.9 * vol), t)
        m.add(S.timpani(n(f'{name}2'), 0.6 * vol), t, rev=0.4)
        m.add(S.coins(1.6, 0.5 * vol), t + 0.05, pan=0.0, rev=0.3)

    def intro(self, tl):
        boom = tl['boom']
        g = Grid(self.bpm, boom, self.swing)
        total = boom + 20 * g.bar + 3
        m = S.Mix(total)
        m.dyn = self.dyn(tl, g)
        cnt = tl['count']
        # Cold Open: Chips klackern, Bass-Ostinato setzt ein
        for k in range(10):
            m.add(S.coins(0.15, 0.25), 0.2 + k * 0.28, pan=S.RNG.uniform(-0.6, 0.6), rev=0.3)
        bars_pre = int((boom - 0.5) / g.bar)
        for i in range(bars_pre, 0, -1):
            bar = -i
            tt = g.t(bar, 0)
            if tt < 0:
                continue
            c, k = self.prog[(bars_pre - i) % 4] if tt >= tl['teaser'] else ('E', 'min')
            if tt < cnt:
                self.walk(m, g, bar, 'E', 'min', 0.8)
                if tt >= tl['teaser']:
                    self.drums(m, g, bar, 0.6)
                    self.comp(m, g, bar, 'E', 'min6' if i % 2 else 'min', 0.7, riff=(i % 2 == 0))
        # Roulette: Streicher-Tremolo, Pauke, Spannung
        self.build(m, cnt, boom - cnt - 0.08, 'B', 1.0)
        self.tutti(m, boom, 'E', 'min', 1.15, 2.0)
        for i, (c, k) in enumerate(self.theme_chords):
            self.drums(m, g, i, 1.0, fill=(i == 7))
            self.walk(m, g, i, c, k)
            self.comp(m, g, i, c, k, 0.85, riff=(i % 2 == 1))
        self.lead(m, g, self.melody, 0, 0.45)
        for i in range(12):
            c, k = self.prog[i % 4]
            self.drums(m, g, 8 + i, 0.6, fill=(i % 4 == 3))
            self.walk(m, g, 8 + i, c, k, 0.8)
            self.comp(m, g, 8 + i, c, k, 0.55, riff=(i % 2 == 0))
        return fade_out(m.render(2.6, 0.8), 0.4)


# ====================================================================================
#   WILDNIS – Survival-Doku: Taiko, Cello-Ostinato, Hörner, Chor – d-Moll
# ====================================================================================
class Wildnis(Studio):
    bpm = 96
    swing = 0.0
    prog = [('D', 'min'), ('Bb', 'maj'), ('F', 'maj'), ('C', 'maj')]
    theme_chords = prog * 2
    melody = [
        (4, 2, 'D4'), (6, 2, 'A4'),
        (8, 1.5, 'Bb4'), (9.5, .5, 'A4'), (10, 2, 'G4'),
        (12, 2, 'F4'), (14, 1, 'E4'), (15, 1, 'C4'),
        (16, 4, 'D4'),
        (20, 1, 'D4'), (21, 1, 'A4'), (22, 2, 'D5'),
        (24, 1, 'C5'), (25, 1, 'Bb4'), (26, 1, 'A4'), (27, 1, 'G4'),
        (28, 4, 'A4'),
    ]
    KEYS = ['D', 'E', 'F', 'G', 'A', 'C']

    def drums(self, m, g, bar, inten=1.0, fill=False):
        pat = [(0, 1.0, 58), (0.75, 0.5, 70), (1.5, 0.7, 62), (2, 1.0, 55), (2.5, 0.5, 75), (3, 0.8, 60), (3.5, 0.6, 66)]
        for b, v, f in pat:
            m.add(S.taiko(f, 0.55 * v * inten, 0.7), g.t(bar, b), pan=S.RNG.uniform(-0.4, 0.4), rev=0.35)
        for b in range(8):
            m.add(S.hat(0.06 * inten), g.t(bar, b * 0.5), pan=0.5, rev=0.2)
        if fill:
            for k in range(8):
                m.add(S.taiko(70 + k * 4, 0.3 + 0.07 * k, 0.4), g.t(bar, 2 + k * 0.25), pan=-0.5 + k * 0.14, rev=0.35)

    def walk(self, m, g, bar, name, kind, inten=1.0):
        root = n(f'{name}2') if n(f'{name}2') <= n('G2') else n(f'{name}1')
        notes = chord(root + 12, kind)
        seq = [notes[0], notes[0], notes[1], notes[0], notes[2], notes[0], notes[1], notes[0]] * 2
        for k, p in enumerate(seq):  # Cello-Ostinato (16tel)
            m.add(S.brass(p, g.beat / 4 * 0.8, 0.22 * inten, 0.5, 2, 'trombone', scoop=False), g.t(bar, k / 4), pan=-0.3, rev=0.25)
        m.add(S.strings([root], g.bar, 0.3 * inten, 0.05, 900), g.t(bar, 0), rev=0.3)

    def comp(self, m, g, bar, name, kind, inten=1.0, riff=True):
        notes = chord(n(f'{name}3'), kind)
        m.add(S.choir(notes, g.bar * 0.98, 0.35 * inten, 0.4, 'a' if riff else 'o'), g.t(bar, 0), rev=0.5)
        m.add(S.strings(notes + [notes[0] + 12], g.bar * 0.98, 0.25 * inten, 0.3, 2800), g.t(bar, 0), rev=0.45)

    def lead(self, m, g, mel, bar0=0, vol=0.5, oct_=True):
        for b, d, p in mel:
            bar = bar0 + int(b // 4)
            m.add(S.brass(n(p), g.beat * d * 0.95, vol, 1.0, 4, 'horn'), g.t(bar, b % 4), rev=0.5)
            m.add(S.brass(n(p) - 12, g.beat * d * 0.95, vol * 0.6, 0.8, 3, 'horn'), g.t(bar, b % 4), rev=0.5)

    def tutti(self, m, t, name='D', kind='min', vol=1.0, dur=1.6):
        root = n(f'{name}1') if n(f'{name}1') >= n('C1') else n(f'{name}1') + 12
        m.add(S.braam(root + 12, dur * 1.6, 0.45 * vol), t, rev=0.45)
        m.add(S.impact(0.75 * vol), t, rev=0.45)
        for f in (52, 60, 70):
            m.add(S.taiko(f, 0.6 * vol, 1.2), t, pan=S.RNG.uniform(-0.5, 0.5), rev=0.45)
        m.add(S.choir(chord(n(f'{name}3'), kind) + [n(f'{name}4')], dur * 1.5, 0.5 * vol, 0.05), t, rev=0.5)
        m.add(S.crash(0.35 * vol, 2.5), t, rev=0.4)

    def build(self, m, t0, sec, top='A', vol=1.0):
        # Herzschlag wird schneller + Taiko-Wirbel + Riser
        tt = 0.0
        while tt < sec:
            p = tt / sec
            m.add(S.heartbeat(0.5 + 0.5 * p), t0 + tt, rev=0.2)
            tt += 0.95 - 0.55 * p
        k = 0
        tt = sec * 0.4
        while tt < sec:
            m.add(S.taiko(64 + (k % 3) * 6, 0.25 + 0.6 * (tt / sec) ** 2, 0.4), t0 + tt, pan=S.RNG.uniform(-0.5, 0.5), rev=0.35)
            tt += 0.24 - 0.16 * (tt / sec)
            k += 1
        m.add(S.riser(sec, 0.3 * vol, 120, 2500), t0, rev=0.3)

    def intro(self, tl):
        boom = tl['boom']
        g = Grid(self.bpm, boom)
        total = boom + 20 * g.bar + 3
        m = S.Mix(total)
        m.dyn = self.dyn(tl, g)
        # Wind, ferne Taiko, tiefer Bordun
        m.add(S.wind(tl['teaser'] + 4, 0.25), 0.0, rev=0.2)
        m.add(S.strings([n('D2'), n('A2')], tl['count'] + 1, 0.3, 2.5, 700), 0.0, rev=0.5)
        for tt in (0.4, 2.6, 4.3):
            m.add(S.taiko(50, 0.45, 1.4), tt, rev=0.7)
        # Drohnenflug: Cello-Ostinato wächst, Taiko-Muster
        tz = tl['teaser']
        cnt = tl['count']
        bars_pre = int((boom - tz) / g.bar) + 1
        for i in range(bars_pre, 0, -1):
            bar = -i
            tt = g.t(bar, 0)
            if tt < tz - 0.3 or tt >= cnt:
                continue
            c, k = self.prog[(bars_pre - i) % 4]
            self.walk(m, g, bar, c, k, 0.6 + 0.4 * (1 - i / bars_pre))
            if i < bars_pre - 1:
                self.drums(m, g, bar, 0.55)
        self.build(m, cnt, boom - cnt - 0.08, 'A', 1.0)
        self.tutti(m, boom, 'D', 'min', 1.2, 2.2)
        for i, (c, k) in enumerate(self.theme_chords):
            self.drums(m, g, i, 1.0, fill=(i == 7))
            self.walk(m, g, i, c, k)
            self.comp(m, g, i, c, k, 0.9, riff=(i < 4))
        self.lead(m, g, self.melody, 0, 0.5)
        for i in range(12):
            c, k = self.prog[i % 4]
            self.drums(m, g, 8 + i, 0.55, fill=(i % 4 == 3))
            self.walk(m, g, 8 + i, c, k, 0.75)
            if i % 2 == 0:
                self.comp(m, g, 8 + i, c, k, 0.45, riff=False)
        m.add(S.wind(total, 0.08), boom, rev=0.1)
        return fade_out(m.render(3.4, 0.9, 4500), 0.4)

    def stinger(self, i):
        g = Grid(self.bpm, HIT)
        m = S.Mix(HIT + 3.8)
        key = self.KEYS[i % 6]
        self.build(m, 0.0, HIT - 0.05, key, 0.9)
        self.tutti(m, HIT, key, 'min' if i % 2 == 0 else 'maj', 0.9, 1.6)
        root = n(f'{key}3')
        for b, d, iv in self.MOTIFS[i % 6]:
            m.add(S.brass(root + iv, g.beat * d * 0.9, 0.45, 1.0, 4, 'horn'), g.t(0, 1 + b), rev=0.5)
        self.drums(m, g, 0, 0.7)
        return fade_out(m.render(3.0, 0.85, 4500), 0.6)


# ====================================================================================
#   WELTRAUM – Missions-Epos: Orgel-Ostinato, Streicher, Chor, Pauken – a-Moll
# ====================================================================================
class Weltraum(Studio):
    bpm = 84
    swing = 0.0
    prog = [('A', 'min'), ('F', 'maj'), ('C', 'maj'), ('G', 'maj')]
    theme_chords = [('A', 'min'), ('F', 'maj'), ('C', 'maj'), ('G', 'maj'), ('A', 'min'), ('F', 'maj'), ('C', 'maj'), ('E', 'maj')]
    melody = [
        (4, 2, 'A4'), (6, 2, 'E5'),
        (8, 3, 'F5'), (11, 1, 'E5'),
        (12, 2, 'G5'), (14, 2, 'E5'),
        (16, 4, 'D5'),
        (20, 1, 'A4'), (21, 1, 'E5'), (22, 2, 'A5'),
        (24, 2, 'C6'), (26, 1, 'B5'), (27, 1, 'A5'),
        (28, 2, 'G5'), (30, 2, 'G#5'),
    ]
    KEYS = ['A', 'B', 'C', 'D', 'E', 'F']

    def drums(self, m, g, bar, inten=1.0, fill=False):
        # Halbes Tempo: tiefe Trommel auf 1, riesige Snare auf 3
        m.add(S.taiko(48, 0.7 * inten, 1.4), g.t(bar, 0), rev=0.45)
        m.add(S.kick(0.6 * inten, 1.4), g.t(bar, 0), rev=0.05)
        m.add(S.snare(0.5 * inten, 170, 0.3), g.t(bar, 2), rev=0.7)
        m.add(S.taiko(55, 0.3 * inten, 0.9), g.t(bar, 2.75), rev=0.4)
        for b in range(8):
            m.add(S.hat(0.08 * inten), g.t(bar, b * 0.5 + 0.25), pan=0.4, rev=0.3)
        if fill:
            for k in range(6):
                m.add(S.timpani(n('A2') + (k % 2) * 7, 0.25 + 0.1 * k, 0.5), g.t(bar, 2.5 + k * 0.25), rev=0.45)

    def ostinato(self, m, g, bar, name, kind, vol):
        notes = chord(n(f'{name}4'), kind)
        pat = [notes[0], notes[2], notes[1], notes[2], notes[0] + 12, notes[2], notes[1], notes[2]]
        for k, p in enumerate(pat):
            m.add(S.organ([p], g.beat / 2 * 0.9, vol, 0.005, (1, 0.6, 0.4, 0.3, 0.15, 0.1, 0.05)), g.t(bar, k / 2), pan=(-0.3 if k % 2 else 0.3), rev=0.6)

    def walk(self, m, g, bar, name, kind, inten=1.0):
        root = n(f'{name}1') if n(f'{name}1') >= n('C1') else n(f'{name}1') + 12
        m.add(S.organ([root, root + 12], g.bar * 0.98, 0.35 * inten, 0.05, (1, 0.9, 0.5, 0.4, 0.2, 0.1, 0.05)), g.t(bar, 0), rev=0.5)
        m.add(S.sub808(root + 12, g.bar * 0.9, 0.25 * inten), g.t(bar, 0), rev=0.0)

    def comp(self, m, g, bar, name, kind, inten=1.0, riff=True):
        self.ostinato(m, g, bar, name, kind, 0.18 * inten)
        notes = chord(n(f'{name}3'), kind)
        m.add(S.strings(notes + [notes[0] + 12, notes[1] + 12], g.bar * 0.98, 0.3 * inten, 0.4, 3000), g.t(bar, 0), rev=0.6)
        if riff:
            m.add(S.choir(notes, g.bar * 0.98, 0.3 * inten, 0.6), g.t(bar, 0), rev=0.6)

    def lead(self, m, g, mel, bar0=0, vol=0.5, oct_=True):
        for b, d, p in mel:
            bar = bar0 + int(b // 4)
            m.add(S.brass(n(p) - 12, g.beat * d * 0.95, vol, 0.9, 4, 'horn'), g.t(bar, b % 4), rev=0.6)
            m.add(S.strings([n(p)], g.beat * d, vol * 0.6, 0.15, 5000), g.t(bar, b % 4), rev=0.6)

    def tutti(self, m, t, name='A', kind='min', vol=1.0, dur=1.6):
        root = n(f'{name}1') if n(f'{name}1') >= n('C1') else n(f'{name}1') + 12
        m.add(S.impact(0.9 * vol), t, rev=0.5)
        m.add(S.braam(root + 12, dur * 1.8, 0.4 * vol), t, rev=0.5)
        m.add(S.organ(chord(n(f'{name}2'), kind) + chord(n(f'{name}4'), kind), dur * 2.5, 0.6 * vol, 0.01), t, rev=0.6)
        m.add(S.choir(chord(n(f'{name}3'), kind) + [n(f'{name}4')], dur * 2, 0.45 * vol, 0.05), t, rev=0.6)
        m.add(S.crash(0.45 * vol, 3), t, rev=0.5)
        m.add(S.timpani(n(f'{name}2'), 0.9 * vol, 2), t, rev=0.5)

    def build(self, m, t0, sec, top='E', vol=1.0):
        m.add(S.timp_roll(n(f'{top}2'), sec, 0.55 * vol), t0, rev=0.5)
        m.add(S.riser(sec, 0.35 * vol, 100, 3000), t0, rev=0.4)
        m.add(S.strings(chord(n(f'{top}3'), 'maj'), sec, 0.35 * vol, sec * 0.9, 4000, trem=14), t0, rev=0.5)

    def intro(self, tl):
        boom = tl['boom']
        g = Grid(self.bpm, boom)
        total = boom + 16 * g.bar + 3
        m = S.Mix(total)
        m.dyn = self.dyn(tl, g)
        # Funk-Rauschen, tiefer Bordun
        m.add(S.radio_static(0.6, 0.12), 0.1, rev=0.1)
        m.add(S.organ([n('A1'), n('E2')], tl['count'] + 0.5, 0.3, 2.0, (1, 0.8, 0.3, 0.2, 0, 0, 0)), 0.0, rev=0.6)
        m.add(S.pad(chord(n('A2'), '5'), tl['teaser'] + 2, 0.15, 700, 2.5), 0.0, rev=0.6)
        # Go/No-Go: leiser Puls (Achtel) – Flugplan: Orgel-Ostinato setzt ein
        poll = tl.get('poll', 3)
        tz = tl['teaser']
        cnt = tl['count']
        tt = poll
        while tt < tz:
            m.add(S.sub808(n('A2'), 0.18, 0.12), tt, rev=0.2)
            tt += g.beat / 2
        bars_pre = int((boom - tz) / g.bar) + 1
        for i in range(bars_pre, 0, -1):
            bar = -i
            t0 = g.t(bar, 0)
            if t0 < tz - 0.2:
                continue
            c, k = self.prog[(bars_pre - i) % 4]
            p = 1 - (t0 - tz) / (boom - tz)
            self.ostinato(m, g, bar, c, k, 0.12 + 0.18 * (1 - p))
            if t0 >= cnt:
                m.add(S.strings(chord(n(f'{c}3'), k), g.bar, 0.18 + 0.25 * (1 - p), 0.3, 2500 + 2500 * (1 - p)), t0, rev=0.55)
                for b in range(8 if t0 < cnt + 4 else 16):
                    step = 4 / (8 if t0 < cnt + 4 else 16)
                    m.add(S.timpani(n('A2'), 0.12 + 0.35 * (1 - p), 0.4), g.t(bar, b * step), rev=0.5)
        # Zündung: Grollen T–6 → Liftoff
        m.add(S.rumble(boom - cnt + 4 - 4, 0.45), cnt + 4, rev=0.1)
        m.add(S.rumble(8, 0.6, build=False), boom, rev=0.1)
        self.build(m, boom - 4.5, 4.42, 'E', 1.0)
        self.tutti(m, boom, 'A', 'min', 1.25, 2.6)
        for i, (c, k) in enumerate(self.theme_chords):
            self.drums(m, g, i, 1.0, fill=(i == 7))
            self.walk(m, g, i, c, k)
            self.comp(m, g, i, c, k, 0.9, riff=True)
        self.lead(m, g, self.melody, 0, 0.5)
        for i in range(8):
            c, k = self.prog[i % 4]
            self.drums(m, g, 8 + i, 0.5, fill=False)
            self.walk(m, g, 8 + i, c, k, 0.7)
            self.comp(m, g, 8 + i, c, k, 0.55, riff=(i % 2 == 0))
        return fade_out(m.render(4.2, 1.0, 5000), 0.4)

    def stinger(self, i):
        g = Grid(self.bpm, HIT)
        m = S.Mix(HIT + 4.2)
        key = self.KEYS[i % 6]
        m.add(S.quindar(True, 0.25), 0.05, rev=0.3)
        self.build(m, 0.1, HIT - 0.15, key, 0.9)
        self.tutti(m, HIT, key, 'min' if i % 2 == 0 else 'maj', 0.85, 1.4)
        root = n(f'{key}4')
        for b, d, iv in self.MOTIFS[i % 6]:
            m.add(S.strings([root + iv], g.beat * d * 0.8, 0.4, 0.05, 6000), g.t(0, 1 + b * 0.5), rev=0.6)
        return fade_out(m.render(4.0, 1.0, 5000), 0.8)



# ====================================================================================
#   BIELEFELD – Stadion-Hymne: Stampfen-Klatschen, Fan-Chor, Bläser – F-Dur
# ====================================================================================
class Bielefeld(Studio):
    bpm = 120
    swing = 0.0
    prog = [('F', 'maj'), ('C', 'maj'), ('D', 'min'), ('Bb', 'maj')]
    theme_chords = prog * 2
    melody = [  # Fan-Chor „Oh-oh“
        (0, 1, 'C5'), (1, 1, 'C5'), (2, .5, 'A4'), (2.5, .5, 'C5'), (3, 1, 'F5'),
        (4, 1, 'E5'), (5, 1, 'C5'), (6, 2, 'G4'),
        (8, 1, 'D5'), (9, 1, 'D5'), (10, .5, 'C5'), (10.5, .5, 'D5'), (11, 1, 'F5'),
        (12, 2, 'D5'), (14, 2, 'Bb4'),
        (16, 1, 'C5'), (17, 1, 'C5'), (18, .5, 'A4'), (18.5, .5, 'C5'), (19, 1, 'F5'),
        (20, 1, 'G5'), (21, 1, 'E5'), (22, 2, 'C5'),
        (24, 1, 'D5'), (25, 1, 'F5'), (26, 1, 'A5'), (27, 1, 'G5'),
        (28, 4, 'F5'),
    ]
    KEYS = ['F', 'G', 'A', 'Bb', 'C', 'D']

    def drums(self, m, g, bar, inten=1.0, fill=False):
        for b in range(4):
            if b in (0, 2):  # Stampf-Stampf-Klatsch, doppelt gelegt wie eine Tribüne
                m.add(S.kick(0.7 * inten, 1.4), g.t(bar, b), rev=0.25)
                m.add(S.kick(0.6 * inten, 1.4), g.t(bar, b + 0.5), rev=0.25)
            else:
                for k in range(3):
                    m.add(S.clap(0.35 * inten), g.t(bar, b) + k * 0.012, pan=(k - 1) * 0.5, rev=0.5)
            m.add(S.hat(0.08 * inten), g.t(bar, b + 0.5), pan=0.3, rev=0.1)
        if fill:
            for k in range(8):
                m.add(S.tom(150 - k * 10, 0.3 + 0.05 * k, 0.25), g.t(bar, 2 + k * 0.25), rev=0.35)

    def walk(self, m, g, bar, name, kind, inten=1.0):
        root = n(f'{name}1') if n(f'{name}1') >= n('E1') else n(f'{name}1') + 12
        for b in range(4):
            m.add(S.synth_bass(root, g.beat * 0.8, 0.45 * inten, 450, 1.6), g.t(bar, b), rev=0.05)

    def comp(self, m, g, bar, name, kind, inten=1.0, riff=True):
        notes = chord(n(f'{name}3'), kind)
        m.add(S.strings(notes + [notes[0] + 12], g.bar * 0.98, 0.25 * inten, 0.05, 3500), g.t(bar, 0), rev=0.45)
        if riff:
            for b in (0, 1.5, 3):
                m.add(S.brass_chord(chord(n(f'{name}4'), kind), g.beat * 0.45, 0.3 * inten, 1.1, 'section'), g.t(bar, b), rev=0.4)

    def lead(self, m, g, mel, bar0=0, vol=0.5, oct_=True):
        for b, d, p in mel:
            bar = bar0 + int(b // 4)
            m.add(S.choir([n(p), n(p) - 12], g.beat * d * 0.95, vol * 1.1, 0.03, 'o'), g.t(bar, b % 4), rev=0.55)
            m.add(S.brass(n(p), g.beat * d * 0.9, vol * 0.45, 1.0, 3, 'trumpet'), g.t(bar, b % 4), pan=0.2, rev=0.45)

    def tutti(self, m, t, name='F', kind='maj', vol=1.0, dur=1.6):
        hi = chord(n(f'{name}4'), kind)
        m.add(S.impact(0.7 * vol), t, rev=0.5)
        m.add(S.brass_chord(hi + [hi[0] + 12], dur, 0.7 * vol, 1.3, 'trumpet'), t, rev=0.5)
        m.add(S.choir(chord(n(f'{name}3'), kind) + [n(f'{name}4')], dur * 1.4, 0.5 * vol, 0.03, 'a'), t, rev=0.6)
        m.add(S.crash(0.55 * vol, 2.2), t, rev=0.4)
        m.add(S.timpani(n(f'{name}2'), 0.7 * vol), t, rev=0.4)

    def build(self, m, t0, sec, top='C', vol=1.0):
        m.add(S.snare_roll(sec, 0.35 * vol, rate=(4, 30)), t0, rev=0.4)
        m.add(S.riser(sec, 0.3 * vol), t0, rev=0.3)
        m.add(S.timp_roll(n(f'{top}2'), sec, 0.45 * vol), t0, rev=0.45)

    def intro(self, tl):
        boom = tl['boom']
        g = Grid(self.bpm, boom)
        total = boom + 20 * g.bar + 3
        m = S.Mix(total)
        m.dyn = self.dyn(tl, g)
        # Cold Open: Rauschen, ein Fragezeichen-Motiv (Glocken), Stille
        m.add(S.radio_static(1.0, 0.1), 1.8, rev=0.1)
        for k, p in enumerate(['C5', 'A4', 'F4', 'G4']):
            m.add(S.bell(n(p), 0.6, 0.25), 0.4 + k * 0.45, rev=0.6)
        m.add(S.pad(chord(n('F2'), 'sus2'), tl['teaser'], 0.18, 900, 1.5), 0.0, rev=0.6)
        # Stadtflug: Glockenspiel-Motiv (Altstadt), leichter Groove, Klatschen kommt dazu
        tz = tl['teaser']; cnt = tl['count']
        bars_pre = int((boom - tz) / g.bar) + 1
        for i in range(bars_pre, 0, -1):
            bar = -i
            t0 = g.t(bar, 0)
            if t0 < tz - 0.2 or t0 >= cnt:
                continue
            c, k = self.prog[(bars_pre - i) % 4]
            m.add(S.strings(chord(n(f'{c}3'), k), g.bar, 0.18, 0.3, 2600), t0, rev=0.5)
            self.walk(m, g, bar, c, k, 0.6)
            for b, iv in ((0, 0), (0.5, 4), (1, 7), (1.5, 12), (2, 7), (3, 4)):
                m.add(S.bell(chord(n(f'{c}5'), k)[0] + iv - 12, 0.3, 0.12), g.t(bar, b), pan=0.3, rev=0.5)
            for b in (1, 3):
                m.add(S.clap(0.15), g.t(bar, b), rev=0.5)
        # Stadion: Stampfen-Klatschen baut sich auf
        t = cnt
        while t < boom - 0.3:
            p = (t - cnt) / (boom - cnt)
            m.add(S.kick(0.35 + 0.4 * p, 1.4), t, rev=0.3)
            m.add(S.kick(0.3 + 0.4 * p, 1.4), t + 0.25, rev=0.3)
            for k in range(3):
                m.add(S.clap(0.2 + 0.25 * p), t + 0.5 + k * 0.012, pan=(k - 1) * 0.5, rev=0.5)
            t += 1.0
        self.build(m, boom - 2.5, 2.42, 'C', 1.0)
        self.tutti(m, boom, 'F', 'maj', 1.2, 2.0)
        for i, (c, k) in enumerate(self.theme_chords):
            self.drums(m, g, i, 1.0, fill=(i == 7))
            self.walk(m, g, i, c, k)
            self.comp(m, g, i, c, k, 0.9, riff=(i % 2 == 0))
        self.lead(m, g, self.melody, 0, 0.45)
        for i in range(12):
            c, k = self.prog[i % 4]
            self.drums(m, g, 8 + i, 0.6, fill=(i % 4 == 3))
            self.walk(m, g, 8 + i, c, k, 0.8)
            self.comp(m, g, 8 + i, c, k, 0.55, riff=(i % 2 == 0))
        return fade_out(m.render(2.8, 0.85), 0.4)


# ====================================================================================
#   THE VOICE – emotionale Pop-Ballade, die zur Hymne wird (Klavier, Streicher, großer Drop) – a-Moll
# ====================================================================================
class Voice(Studio):
    bpm = 100
    swing = 0.0
    prog = [('A', 'min'), ('F', 'maj'), ('C', 'maj'), ('G', 'maj')]
    theme_chords = prog * 2
    melody = [
        (0, 1.5, 'E5'), (1.5, .5, 'D5'), (2, 1, 'C5'), (3, 1, 'D5'),
        (4, 2, 'C5'), (6, 1, 'A4'), (7, 1, 'C5'),
        (8, 1.5, 'G5'), (9.5, .5, 'E5'), (10, 2, 'E5'),
        (12, 2, 'D5'), (14, 1, 'B4'), (15, 1, 'D5'),
        (16, 1.5, 'E5'), (17.5, .5, 'D5'), (18, 1, 'C5'), (19, 1, 'E5'),
        (20, 2, 'A5'), (22, 1, 'G5'), (23, 1, 'F5'),
        (24, 2, 'E5'), (26, 1, 'G5'), (27, 1, 'D5'),
        (28, 4, 'C5'),
    ]
    KEYS = ['A', 'C', 'D', 'E', 'F', 'G']

    def drums(self, m, g, bar, inten=1.0, fill=False):
        for b in range(4):
            m.add(S.kick(0.7 * inten, 1.1), g.t(bar, b) if b in (0, 2) else g.t(bar, b + 0.5) if b == 1 else g.t(bar, 0) - 9, rev=0.1)
            if b in (1, 3):
                m.add(S.snare(0.4 * inten, 190, 0.2), g.t(bar, b), rev=0.6)
                m.add(S.clap(0.25 * inten), g.t(bar, b), rev=0.6)
            m.add(S.hat(0.1 * inten), g.t(bar, b + 0.5), pan=0.3, rev=0.2)
        if fill:
            m.add(S.snare_roll(g.beat * 2, 0.3 * inten, rate=(8, 24)), g.t(bar, 2), rev=0.5)

    def walk(self, m, g, bar, name, kind, inten=1.0):
        root = n(f'{name}1') if n(f'{name}1') >= n('E1') else n(f'{name}1') + 12
        m.add(S.synth_bass(root, g.bar * 0.95, 0.4 * inten, 380, 1.3), g.t(bar, 0), rev=0.05)

    def comp(self, m, g, bar, name, kind, inten=1.0, riff=True):
        notes = chord(n(f'{name}3'), kind)
        for k in range(8):  # Klavier-Achtel
            m.add(S.piano(notes[k % 3] + (12 if k % 4 == 3 else 0), g.beat * 0.5, 0.22 * inten), g.t(bar, k / 2), pan=-0.2, rev=0.5)
        m.add(S.strings(notes + [notes[0] + 12], g.bar * 0.98, 0.3 * inten, 0.2, 3800), g.t(bar, 0), rev=0.55)
        if riff:
            m.add(S.choir(notes, g.bar * 0.98, 0.22 * inten, 0.3, 'a'), g.t(bar, 0), rev=0.6)

    def lead(self, m, g, mel, bar0=0, vol=0.5, oct_=True):
        for b, d, p in mel:
            bar = bar0 + int(b // 4)
            m.add(S.supersaw([n(p)], g.beat * d * 0.92, vol * 0.5, 0.01, 5000, 0.3), g.t(bar, b % 4), rev=0.5)
            m.add(S.strings([n(p) + 12], g.beat * d, vol * 0.35, 0.05, 6000), g.t(bar, b % 4), rev=0.55)

    def tutti(self, m, t, name='A', kind='min', vol=1.0, dur=1.6):
        m.add(S.impact(0.85 * vol), t, rev=0.5)
        m.add(S.supersaw(chord(n(f'{name}3'), kind) + [n(f'{name}4'), n(f'{name}5')], dur * 1.4, 0.45 * vol, 0.005, 6000, 0.6), t, rev=0.5)
        m.add(S.choir(chord(n(f'{name}3'), kind) + [n(f'{name}4')], dur * 1.4, 0.45 * vol, 0.03), t, rev=0.6)
        m.add(S.crash(0.55 * vol, 2.4), t, rev=0.45)

    def build(self, m, t0, sec, top='E', vol=1.0):
        m.add(S.snare_roll(sec, 0.3 * vol, rate=(4, 28)), t0, rev=0.5)
        m.add(S.riser(sec, 0.32 * vol), t0, rev=0.3)

    def intro(self, tl):
        boom = tl['boom']
        g = Grid(self.bpm, boom)
        total = boom + 20 * g.bar + 3
        m = S.Mix(total)
        m.dyn = self.dyn(tl, g)
        # Klavier allein im Spotlight
        for k, p in enumerate(['A3', 'C4', 'E4', 'A4', 'G4', 'E4', 'C4', 'E4']):
            m.add(S.piano(n(p), 0.5, 0.3), 0.2 + k * 0.45, rev=0.7)
        tz = tl['teaser']; cnt = tl['count']
        bars_pre = int((boom - tz) / g.bar) + 1
        for i in range(bars_pre, 0, -1):
            bar = -i
            t0 = g.t(bar, 0)
            if t0 < tz - 0.2 or t0 >= boom - 0.1:
                continue
            c, k = self.prog[(bars_pre - i) % 4]
            self.comp(m, g, bar, c, k, 0.5 + 0.5 * (1 - i / bars_pre), riff=(t0 >= cnt))
            self.walk(m, g, bar, c, k, 0.6)
            if t0 >= cnt:
                for b in range(4):
                    m.add(S.kick(0.3 + 0.4 * (1 - i / bars_pre), 1.3), g.t(bar, b), rev=0.2)
        # Herzschlag-Stille vor dem Buzzer, dann Drop
        self.build(m, boom - 2.4, 2.32, 'E', 1.0)
        self.tutti(m, boom, 'A', 'min', 1.2, 2.0)
        for i, (c, k) in enumerate(self.theme_chords):
            self.drums(m, g, i, 1.0, fill=(i == 7))
            self.walk(m, g, i, c, k)
            self.comp(m, g, i, c, k, 0.8, riff=True)
        self.lead(m, g, self.melody, 0, 0.5)
        for i in range(12):
            c, k = self.prog[i % 4]
            self.drums(m, g, 8 + i, 0.55, fill=(i % 4 == 3))
            self.walk(m, g, 8 + i, c, k, 0.8)
            self.comp(m, g, 8 + i, c, k, 0.55, riff=(i % 2 == 0))
        return fade_out(m.render(3.0, 0.9), 0.4)


THEMES = {'voice': Voice, 'bielefeld': Bielefeld, 'musical': Musical, 'casino': Casino, 'wildnis': Wildnis, 'weltraum': Weltraum}


def main(ids):
    for tid in ids:
        th = THEMES[tid]()
        tl = CAT['themes'][tid]['tl']
        print(f'== {tid} ==')
        save(f'{tid}-intro', th.intro(tl))
        save(f'{tid}-bed', th.bed())
        for i in range(6):
            save(f'{tid}-team{i + 1}', th.stinger(i))
        save(f'{tid}-cohost', th.host(co=True))
        save(f'{tid}-host', th.host())
        save(f'{tid}-all', th.all())


if __name__ == '__main__':
    main(sys.argv[1:] or CAT['order'])
