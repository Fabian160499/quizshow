"""Kleiner Offline-Synthesizer für die Intro-Musik (numpy/scipy).

Alles wird in Stereo-Spuren (2 x N) gerendert: Instrumente schreiben in einen
"dry"- und einen "send"-Bus (Hall). Am Ende: Hall, Bus-Kompressor, Limiter.
"""
import numpy as np
from scipy import signal
from scipy.ndimage import maximum_filter1d

SR = 44100
RNG = np.random.default_rng(7)


def mtof(m):
    return 440.0 * 2 ** ((np.asarray(m, dtype=float) - 69) / 12)


NOTE = {n: i for i, n in enumerate(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'])}
NOTE.update({'Db': 1, 'Eb': 3, 'Gb': 6, 'Ab': 8, 'Bb': 10})


def n(name):
    """'C4' -> MIDI 60, 'Bb2' -> 46"""
    if name[1:2] in ('#', 'b'):
        k, o = name[:2], name[2:]
    else:
        k, o = name[:1], name[1:]
    return NOTE[k] + 12 * (int(o) + 1)


def chord(root, kind='maj', inv=0):
    iv = {'maj': [0, 4, 7], 'min': [0, 3, 7], 'maj7': [0, 4, 7, 11], 'min7': [0, 3, 7, 10], '7': [0, 4, 7, 10], '6': [0, 4, 7, 9],
          'min6': [0, 3, 7, 9], 'sus2': [0, 2, 7], 'sus4': [0, 5, 7], 'add9': [0, 4, 7, 14], 'min9': [0, 3, 7, 10, 14], '9': [0, 4, 7, 10, 14],
          'dim7': [0, 3, 6, 9], '13': [0, 4, 10, 14, 21], '5': [0, 7, 12], 'm11': [0, 3, 7, 10, 14, 17]}[kind]
    notes = [root + i for i in iv]
    for _ in range(inv):
        notes = notes[1:] + [notes[0] + 12]
    return notes


class Mix:
    def __init__(self, seconds):
        self.N = int(seconds * SR) + SR * 6
        self.dry = np.zeros((2, self.N))
        self.send = np.zeros((2, self.N))
        self.len = int(seconds * SR)
        self.dyn = None  # [(t, gain), ...] Lautstärke-Verlauf (nach Einsatzzeit)

    def gain(self, t):
        if not self.dyn:
            return 1.0
        ts = [a for a, _ in self.dyn]
        gs = [b for _, b in self.dyn]
        return float(np.interp(t, ts, gs))

    def add(self, x, t, vol=1.0, pan=0.0, rev=0.2):
        """x: mono (N,) oder stereo (2,N); t: Sekunden"""
        if x.ndim == 1:
            l = np.cos((pan + 1) * np.pi / 4)
            r = np.sin((pan + 1) * np.pi / 4)
            x = np.vstack([x * l * 1.414, x * r * 1.414])
        vol = vol * self.gain(t)
        i = int(round(t * SR))
        if i < 0:
            x = x[:, -i:]
            i = 0
        m = min(x.shape[1], self.N - i)
        if m <= 0:
            return
        self.dry[:, i:i + m] += x[:, :m] * vol
        if rev:
            self.send[:, i:i + m] += x[:, :m] * vol * rev

    def render(self, ir_sec=3.2, wet=0.9, damp=5500, master=0.9, comp=True):
        ir = reverb_ir(ir_sec, damp)
        wetsig = np.vstack([signal.fftconvolve(self.send[0], ir[0])[:self.N], signal.fftconvolve(self.send[1], ir[1])[:self.N]])
        out = self.dry + wetsig * wet
        out = hp(out, 28)
        if comp:
            out = compress(out, thr=-12, ratio=2.0, att=0.015, rel=0.2)
        out = limiter(out, ceiling=0.93)
        return out[:, :self.len] * master


# ---------------- Grundbausteine ----------------
def tvec(sec):
    return np.arange(int(sec * SR)) / SR


def env_adsr(n_, a=0.01, d=0.1, s=0.7, r=0.2, hold=None):
    """Hüllkurve über n_ Samples; hold = Dauer bis Release (s), sonst n_ - r"""
    N = n_
    tot = N / SR
    hold = tot - r if hold is None else hold
    t = np.arange(N) / SR
    e = np.where(t < a, t / max(a, 1e-4), 1.0)
    dd = np.clip((t - a) / max(d, 1e-4), 0, 1)
    e = np.where(t >= a, 1 - (1 - s) * dd, e)
    rel = np.clip((t - hold) / max(r, 1e-4), 0, 1)
    e = e * (1 - rel) ** 2
    return e


def exp_dec(N, tau):
    return np.exp(-np.arange(N) / SR / tau)


def polyblep(p, dt):
    out = np.zeros_like(p)
    m = p < dt
    t = p[m] / dt[m] if np.ndim(dt) else p[m] / dt
    out[m] = t + t - t * t - 1
    m2 = p > 1 - (dt if np.ndim(dt) == 0 else dt)
    if np.ndim(dt):
        t2 = (p[m2] - 1) / dt[m2]
    else:
        t2 = (p[m2] - 1) / dt
    out[m2] = t2 * t2 + t2 + t2 + 1
    return out


def saw(freq, N, phase0=None):
    f = np.broadcast_to(np.asarray(freq, dtype=float), (N,)) if np.ndim(freq) == 0 else freq[:N]
    dt = f / SR
    ph = (np.cumsum(dt) + (RNG.random() if phase0 is None else phase0)) % 1.0
    return 2 * ph - 1 - polyblep(ph, dt)


def square(freq, N, pw=0.5):
    f = np.broadcast_to(np.asarray(freq, dtype=float), (N,)) if np.ndim(freq) == 0 else freq[:N]
    dt = f / SR
    p0 = RNG.random()
    ph = (np.cumsum(dt) + p0) % 1.0
    ph2 = (ph + pw) % 1.0
    a = 2 * ph - 1 - polyblep(ph, dt)
    b = 2 * ph2 - 1 - polyblep(ph2, dt)
    return (a - b) * 0.5


def sine(freq, N, phase0=0.0):
    f = np.broadcast_to(np.asarray(freq, dtype=float), (N,)) if np.ndim(freq) == 0 else freq[:N]
    return np.sin(2 * np.pi * (np.cumsum(f) / SR) + phase0)


def noise(N):
    return RNG.standard_normal(N)


def pink(N):
    w = noise(N)
    b = [0.049922035, -0.095993537, 0.050612699, -0.004408786]
    a = [1, -2.494956002, 2.017265875, -0.522189400]
    return signal.lfilter(b, a, w) * 6


def brown(N):
    y = np.cumsum(noise(N)) * 0.02
    return hp_mono(y, 15)


def vib(N, rate=5.5, depth_cents=12, delay=0.25):
    t = np.arange(N) / SR
    ramp = np.clip((t - delay) / 0.4, 0, 1)
    return 2 ** (np.sin(2 * np.pi * rate * t + RNG.random() * 6) * depth_cents * ramp / 1200)


# ---------------- Filter ----------------
def _biquad(kind, fc, q, sr=SR):
    w = 2 * np.pi * min(fc, sr * 0.45) / sr
    c, s = np.cos(w), np.sin(w)
    al = s / (2 * q)
    if kind == 'low':
        b = [(1 - c) / 2, 1 - c, (1 - c) / 2]
    elif kind == 'high':
        b = [(1 + c) / 2, -(1 + c), (1 + c) / 2]
    else:  # band (0 dB Spitze)
        b = [al, 0, -al]
    a = [1 + al, -2 * c, 1 - al]
    return np.array(b) / a[0], np.array(a) / a[0]


def filt(x, kind, fc, q=0.707):
    b, a = _biquad(kind, fc, q)
    return signal.lfilter(b, a, x, axis=-1)


def lp(x, fc, q=0.707):
    return filt(x, 'low', fc, q)


def hp(x, fc, q=0.707):
    return filt(x, 'high', fc, q)


def hp_mono(x, fc):
    return filt(x, 'high', fc)


def bp(x, fc, q=1.0):
    return filt(x, 'band', fc, q)


def sweep(x, kind, fc_arr, q=0.707, block=128):
    """Zeitvariables Filter (blockweise)."""
    y = np.zeros_like(x)
    zi = np.zeros(2)
    N = len(x)
    for i in range(0, N, block):
        fc = float(fc_arr[min(i, len(fc_arr) - 1)])
        b, a = _biquad(kind, max(20, fc), q)
        y[i:i + block], zi = signal.lfilter(b, a, x[i:i + block], zi=zi)
    return y


def lin(N, a, b):
    return np.linspace(a, b, N)


def expo(N, a, b):
    return np.exp(np.linspace(np.log(a), np.log(b), N))


# ---------------- Dynamik / Hall ----------------
def reverb_ir(sec=3.0, damp=6000):
    N = int(sec * SR)
    t = np.arange(N) / SR
    irs = []
    for ch in range(2):
        nz = noise(N)
        nz = lp(nz, damp)
        e = np.exp(-t * 6.9 / sec)
        ir = nz * e
        # frühe Reflexionen
        for k in range(14):
            d = int(RNG.uniform(0.008, 0.07) * SR)
            ir[d] += RNG.uniform(-0.6, 0.6)
        pre = int(0.018 * SR)
        ir = np.concatenate([np.zeros(pre), ir])[:N]
        irs.append(ir / np.sqrt(np.sum(ir ** 2)) * 0.5)
    return irs


def compress(x, thr=-16, ratio=3, att=0.01, rel=0.15):
    m = np.max(np.abs(x), axis=0)
    a_a = np.exp(-1 / (att * SR))
    a_r = np.exp(-1 / (rel * SR))
    # Hüllkurve (schnell genug mit lfilter-Näherung: Release-Glättung)
    env = signal.lfilter([1 - a_r], [1, -a_r], m)
    env = np.maximum(env, m * 0.6)
    db = 20 * np.log10(env + 1e-9)
    over = np.maximum(0, db - thr)
    gain_db = -over * (1 - 1 / ratio)
    g = 10 ** (gain_db / 20)
    g = signal.lfilter([1 - a_a], [1, -a_a], g)
    mk = 1.0
    return x * g * mk


def limiter(x, ceiling=0.95, look=0.004):
    peak = np.max(np.abs(x), axis=0)
    w = int(look * SR) * 2 + 1
    pk = maximum_filter1d(peak, w)
    g = np.minimum(1, ceiling / (pk + 1e-9))
    a = np.exp(-1 / (0.06 * SR))
    # Gain glätten (schnell runter, langsam hoch)
    g2 = np.empty_like(g)
    cur = 1.0
    gs = g
    # vektorisiert näherungsweise: Minimum-Filter + Glättung
    gm = -maximum_filter1d(-gs, w)
    g2 = signal.lfilter([1 - a], [1, -a], gm - 1) + 1
    g2 = np.minimum(g2, gm)
    y = x * g2
    return np.clip(y, -ceiling, ceiling)


def tanh_sat(x, drive=2.0):
    return np.tanh(x * drive) / np.tanh(drive)


def stereo_widen(x_mono, ms=0.012, amt=0.6):
    d = int(ms * SR)
    l = x_mono
    r = np.concatenate([np.zeros(d), x_mono[:-d]]) if d else x_mono
    mid = (l + r) / 2
    side = (l - r) / 2 * amt
    return np.vstack([mid + side, mid - side])


def chorus(x, rate=0.6, depth=0.003, base=0.012):
    N = len(x)
    t = np.arange(N) / SR
    out = []
    for ph in (0, np.pi / 2):
        d = (base + depth * np.sin(2 * np.pi * rate * t + ph)) * SR
        idx = np.arange(N) - d
        idx = np.clip(idx, 0, N - 1)
        i0 = idx.astype(int)
        fr = idx - i0
        i1 = np.minimum(i0 + 1, N - 1)
        out.append(x[i0] * (1 - fr) + x[i1] * fr)
    return np.vstack([x * 0.6 + out[0] * 0.5, x * 0.6 + out[1] * 0.5])


# ---------------- Instrumente ----------------
def kick(vol=1.0, tight=1.0):
    N = int(0.6 * SR)
    t = np.arange(N) / SR
    f = 45 + 120 * np.exp(-t / (0.035 * tight))
    x = sine(f, N) * np.exp(-t / (0.32 * tight))
    cl = hp(noise(int(0.004 * SR)), 2500) * 0.6
    x[:len(cl)] += cl
    return tanh_sat(x * vol, 1.5)


def snare(vol=1.0, tone=185, dec=0.16):
    N = int(0.5 * SR)
    t = np.arange(N) / SR
    body = (sine(tone, N) * 0.6 + sine(tone * 1.6, N) * 0.3) * np.exp(-t / 0.07)
    nz = bp(noise(N), 3500, 0.7) * np.exp(-t / dec) * 1.2
    return (body + nz) * vol


def clap(vol=1.0):
    N = int(0.5 * SR)
    x = np.zeros(N)
    for k, d in enumerate([0, 0.011, 0.023, 0.034]):
        i = int(d * SR)
        m = N - i
        e = np.exp(-np.arange(m) / SR / (0.012 if k < 3 else 0.16))
        x[i:] += noise(m) * e
    return bp(x, 1400, 0.9) * vol * 1.6


def hat(vol=1.0, open_=False):
    N = int((0.35 if open_ else 0.08) * SR)
    t = np.arange(N) / SR
    x = hp(noise(N), 7500) * np.exp(-t / (0.12 if open_ else 0.025))
    return x * vol


def ride(vol=1.0, dec=1.4):
    N = int(dec * 2.5 * SR)
    t = np.arange(N) / SR
    x = hp(noise(N), 6000) * 0.4
    for f in (3150, 4370, 5180, 6620, 7400):
        x += sine(f * RNG.uniform(0.98, 1.02), N) * 0.12
    return x * np.exp(-t / dec) * vol


def crash(vol=1.0, dec=1.8):
    N = int(dec * 3 * SR)
    t = np.arange(N) / SR
    x = hp(noise(N), 3000) * (np.exp(-t / dec) * 0.9 + np.exp(-t / 0.05) * 0.6)
    for f in (2900, 3770, 4610, 5730, 6900, 8200):
        x += sine(f * RNG.uniform(0.97, 1.03), N) * 0.05 * np.exp(-t / (dec * 0.8))
    return stereo_widen(x * vol, 0.008, 0.8)


def reverse_cymbal(sec=2.0, vol=1.0):
    c = crash(1.0, sec * 0.6)
    N = int(sec * SR)
    x = c[:, :N][:, ::-1]
    return x * vol


def tom(f=110, vol=1.0, dec=0.5):
    N = int(dec * 3 * SR)
    t = np.arange(N) / SR
    fr = f * (1 + 0.6 * np.exp(-t / 0.04))
    x = sine(fr, N) * np.exp(-t / dec)
    x += lp(noise(N), 1200) * np.exp(-t / 0.03) * 0.5
    return tanh_sat(x * vol, 1.3)


def taiko(f=62, vol=1.0, dec=0.9):
    N = int(dec * 3 * SR)
    t = np.arange(N) / SR
    fr = f * (1 + 0.5 * np.exp(-t / 0.03))
    x = sine(fr, N) * np.exp(-t / dec) + sine(fr * 2.3, N) * 0.25 * np.exp(-t / (dec * 0.4))
    slap = bp(noise(N), 900, 0.8) * np.exp(-t / 0.02) * 0.9
    return tanh_sat((x + slap) * vol, 1.6)


def timpani(m, vol=1.0, dec=1.6):
    f = mtof(m)
    N = int(dec * 2.5 * SR)
    t = np.arange(N) / SR
    x = sine(f * (1 + 0.02 * np.exp(-t / 0.05)), N) + 0.5 * sine(f * 1.5, N) * np.exp(-t / (dec * 0.5)) + 0.3 * sine(f * 1.98, N) * np.exp(-t / (dec * 0.35))
    x = x * np.exp(-t / dec)
    x += lp(noise(N), 600) * np.exp(-t / 0.02) * 0.6
    return x * vol


def timp_roll(m, sec, vol=1.0, cresc=(0.15, 1.0)):
    N = int((sec + 2) * SR)
    out = np.zeros(N)
    step = 0.055
    k = 0
    tt = 0.0
    while tt < sec:
        v = cresc[0] + (cresc[1] - cresc[0]) * (tt / sec) ** 1.6
        h = timpani(m, v * RNG.uniform(0.85, 1.0), 0.6)
        i = int(tt * SR)
        mm = min(len(h), N - i)
        out[i:i + mm] += h[:mm]
        tt += step + RNG.uniform(-0.006, 0.006)
        k += 1
    return out * vol


def snare_roll(sec, vol=1.0, cresc=(0.1, 1.0), rate=(12, 32)):
    N = int((sec + 1) * SR)
    out = np.zeros(N)
    tt = 0.0
    while tt < sec:
        p = tt / sec
        v = cresc[0] + (cresc[1] - cresc[0]) * p ** 1.5
        h = snare(v, dec=0.09)
        i = int(tt * SR)
        mm = min(len(h), N - i)
        out[i:i + mm] += h[:mm]
        r = rate[0] + (rate[1] - rate[0]) * p ** 2
        tt += 1 / r
    return out * vol


def bass_pluck(m, dur, vol=1.0, bright=900):
    f = mtof(m)
    N = int((dur + 0.3) * SR)
    t = np.arange(N) / SR
    x = sine(f, N) * 0.8 + saw(f, N) * 0.35 + sine(f * 2, N) * 0.15
    fc = bright * np.exp(-t / 0.12) + 180
    x = sweep(x, 'low', fc, 0.9)
    e = np.exp(-t / 0.6) * np.clip((dur + 0.06 - t) / 0.06, 0, 1)
    e[: int(0.004 * SR)] *= np.linspace(0, 1, int(0.004 * SR))
    return x * e * vol


def synth_bass(m, dur, vol=1.0, cut=600, drive=2.0):
    f = mtof(m)
    N = int((dur + 0.15) * SR)
    x = saw(f, N) + saw(f * 1.005, N) * 0.7 + sine(f / 2, N) * 0.6
    x = lp(x, cut, 1.1)
    e = env_adsr(N, 0.005, 0.15, 0.8, 0.12, hold=dur)
    return tanh_sat(x * e, drive) * vol


def sub808(m, dur, vol=1.0):
    f = mtof(m)
    N = int((dur + 0.2) * SR)
    t = np.arange(N) / SR
    fr = f * (1 + 0.8 * np.exp(-t / 0.03))
    x = sine(fr, N) * env_adsr(N, 0.002, 0.3, 0.7, 0.15, hold=dur)
    return tanh_sat(x * vol, 1.8)


def brass(m, dur, vol=1.0, bright=1.0, section=3, kind='trumpet', fall=False, scoop=True):
    """Bläser: Sägezahn-Stapel, Filterhüllkurve, Scoop, Vibrato, Atem."""
    f0 = mtof(m)
    N = int((dur + 0.35) * SR)
    t = np.arange(N) / SR
    sc = 2 ** ((-70 * np.exp(-t / 0.035)) / 1200) if scoop else 1.0
    fl = 2 ** ((-500 * np.clip((t - dur * 0.65) / (dur * 0.35 + 1e-3), 0, 1) ** 2) / 1200) if fall else 1.0
    out = np.zeros(N)
    for k in range(section):
        det = 2 ** (RNG.uniform(-9, 9) / 1200)
        fr = f0 * det * sc * fl * vib(N, RNG.uniform(5, 6), 10 if kind != 'sax' else 14, 0.18)
        osc = saw(fr, N)
        if kind == 'sax':
            osc = osc * 0.6 + square(fr, N, 0.42) * 0.5
        if kind == 'trombone':
            osc = osc * 0.9 + sine(fr, N) * 0.3
        out += osc
    out /= section
    peak = {'trumpet': 4200, 'trombone': 1800, 'sax': 2600, 'horn': 1300}[kind] * bright
    fc = 300 + peak * (1 - np.exp(-t / 0.03)) * (0.65 + 0.35 * np.exp(-t / 0.25))
    x = sweep(out, 'low', fc, 1.2)
    if kind == 'sax':
        x = x * 0.7 + bp(x, 1500, 1.5) * 0.6
    if kind == 'horn':
        x = lp(x, 1600)
    br = bp(noise(N), f0 * 3, 2) * 0.05 * np.exp(-t / 0.05)
    e = env_adsr(N, 0.03 if kind != 'horn' else 0.09, 0.2, 0.82, 0.12, hold=dur)
    return tanh_sat((x + br) * e * vol, 1.6)


def brass_chord(notes, dur, vol=1.0, bright=1.0, kind='trumpet', fall=False, section=2):
    parts = []
    for i, m in enumerate(notes):
        k = kind if kind != 'section' else ('trombone' if i == 0 else ('sax' if i < len(notes) - 1 else 'trumpet'))
        parts.append(brass(m, dur, 1.0, bright, section, k, fall))
    L = max(len(p) for p in parts)
    out = np.zeros(L)
    for p in parts:
        out[:len(p)] += p
    return out / max(1, len(notes)) ** 0.6 * vol


def strings(notes, dur, vol=1.0, att=0.25, cut=3200, trem=0.0):
    N = int((dur + 0.6) * SR)
    t = np.arange(N) / SR
    acc = np.zeros(N)
    for m in notes:
        f = mtof(m)
        for k in range(5):
            fr = f * 2 ** (RNG.uniform(-12, 12) / 1200) * vib(N, RNG.uniform(4.8, 5.8), 9, 0.3)
            acc += saw(fr, N)
    acc = lp(acc, cut, 0.6)
    acc = acc / (len(notes) * 5) ** 0.7
    e = env_adsr(N, att, 0.3, 0.9, 0.5, hold=dur)
    if trem:
        e = e * (0.65 + 0.35 * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * trem * t))))
    return chorus(acc * e * vol)


def choir(notes, dur, vol=1.0, att=0.5, vowel='a'):
    N = int((dur + 0.8) * SR)
    fm = {'a': (730, 1090, 2440), 'o': (570, 840, 2410), 'u': (300, 870, 2240)}[vowel]
    acc = np.zeros(N)
    for m in notes:
        f = mtof(m)
        for k in range(4):
            fr = f * 2 ** (RNG.uniform(-10, 10) / 1200) * vib(N, RNG.uniform(4.5, 5.5), 18, 0.2)
            acc += saw(fr, N)
    y = bp(acc, fm[0], 4) * 1.0 + bp(acc, fm[1], 5) * 0.5 + bp(acc, fm[2], 6) * 0.25
    y = y / (len(notes) * 4) ** 0.7 * 2.2
    e = env_adsr(N, att, 0.3, 0.95, 0.7, hold=dur)
    return chorus(y * e * vol, 0.4, 0.004)


def organ(notes, dur, vol=1.0, att=0.08, draw=(1, 0.8, 0.6, 0.5, 0.3, 0.25, 0.15), pipe=True):
    N = int((dur + 1.0) * SR)
    t = np.arange(N) / SR
    acc = np.zeros(N)
    harm = (1, 2, 3, 4, 6, 8, 10)
    for m in notes:
        f = mtof(m)
        for h_, a in zip(harm, draw):
            if f * h_ < 12000:
                acc += sine(f * h_ * 2 ** (RNG.uniform(-2, 2) / 1200), N, RNG.random() * 6) * a
    acc /= len(notes) ** 0.7 * 2.5
    if pipe:
        acc += lp(noise(N), 3000) * 0.004
    e = env_adsr(N, att, 0.1, 1.0, 0.9, hold=dur)
    return chorus(acc * e * vol, 0.3, 0.002)


def fm(m, dur, vol=1.0, ratio=1.0, index=2.5, dec=1.2, trem=0.0, idx_dec=0.4):
    f = mtof(m)
    N = int((dur + dec * 2) * SR)
    t = np.arange(N) / SR
    I = index * np.exp(-t / idx_dec) + 0.2
    mod = np.sin(2 * np.pi * f * ratio * t) * I
    x = np.sin(2 * np.pi * f * t + mod)
    e = np.exp(-t / dec) * np.clip((dur + dec - t) / 0.08, 0, 1)
    e[: int(0.002 * SR)] *= np.linspace(0, 1, int(0.002 * SR))
    if trem:
        e = e * (0.75 + 0.25 * np.sin(2 * np.pi * trem * t))
    return x * e * vol


def vibes(m, dur, vol=1.0):
    return fm(m, dur, vol, ratio=4.0, index=1.2, dec=1.4, trem=5.5, idx_dec=0.08)


def epiano(m, dur, vol=1.0):
    return fm(m, dur, vol, ratio=1.0, index=1.8, dec=1.0, idx_dec=0.25) + fm(m + 12, dur, vol * 0.2, ratio=14, index=0.6, dec=0.2, idx_dec=0.05)


def bell(m, dur, vol=1.0):
    return fm(m, dur, vol, ratio=3.5, index=3, dec=2.5, idx_dec=0.6)


def piano(m, dur, vol=1.0):
    f = mtof(m)
    N = int((dur + 1.5) * SR)
    t = np.arange(N) / SR
    x = np.zeros(N)
    for h_ in range(1, 9):
        fh = f * h_ * np.sqrt(1 + 0.0004 * h_ * h_)
        if fh > 15000:
            break
        x += np.sin(2 * np.pi * fh * t) * (0.8 ** h_) * np.exp(-t / (1.6 / h_ ** 0.5))
    e = np.clip((dur + 0.15 - t) / 0.15, 0.0, 1) * 0.85 + 0.15
    x = x * e
    x[: int(0.002 * SR)] *= np.linspace(0, 1, int(0.002 * SR))
    return x * vol * 0.6


def pluck_synth(m, dur, vol=1.0, cut=2400):
    f = mtof(m)
    N = int((dur + 0.5) * SR)
    t = np.arange(N) / SR
    x = saw(f, N) + saw(f * 1.007, N) * 0.6 + square(f * 0.5, N) * 0.3
    x = sweep(x, 'low', cut * np.exp(-t / 0.12) + 250, 1.4)
    return x * np.exp(-t / 0.35) * vol


def supersaw(notes, dur, vol=1.0, att=0.01, cut=5000, rel=0.25):
    N = int((dur + rel + 0.1) * SR)
    L = np.zeros(N)
    R = np.zeros(N)
    for m in notes:
        f = mtof(m)
        for k in range(7):
            d = (k - 3) / 3
            x = saw(f * 2 ** (d * 18 / 1200), N)
            pan = d * 0.8
            L += x * np.cos((pan + 1) * np.pi / 4)
            R += x * np.sin((pan + 1) * np.pi / 4)
    e = env_adsr(N, att, 0.2, 0.85, rel, hold=dur)
    sc = (len(notes) * 7) ** 0.65
    return np.vstack([lp(L, cut) * e, lp(R, cut) * e]) / sc * vol


def pad(notes, dur, vol=1.0, cut=1800, att=1.2):
    return supersaw(notes, dur, vol, att, cut, rel=1.2)


# ---------------- Effekte ----------------
def riser(sec, vol=1.0, f0=200, f1=4000):
    N = int(sec * SR)
    t = np.arange(N) / SR
    nz = sweep(noise(N), 'band', expo(N, f0 * 2, f1 * 2), 1.5)
    tone = saw(expo(N, f0 / 2, f1 / 4), N) * 0.15 + saw(expo(N, f0 / 2 * 1.5, f1 / 4 * 1.5), N) * 0.1
    tone = sweep(tone, 'low', expo(N, 300, 8000), 0.8)
    e = (t / sec) ** 2.2
    return stereo_widen((nz * 0.7 + tone) * e * vol, 0.01, 0.7)


def impact(vol=1.0, sub=True):
    N = int(4 * SR)
    t = np.arange(N) / SR
    x = np.zeros(N)
    if sub:
        x += sine(30 + 45 * np.exp(-t / 0.08), N) * np.exp(-t / 1.4) * 1.2
    x += lp(noise(N), 2500) * np.exp(-t / 0.25) * 0.8
    x += sweep(noise(N), 'low', 6000 * np.exp(-t / 0.15) + 100, 0.7) * np.exp(-t / 0.6) * 0.5
    return tanh_sat(x * vol, 2.0)


def braam(root, dur, vol=1.0):
    N = int((dur + 0.5) * SR)
    t = np.arange(N) / SR
    acc = np.zeros(N)
    for mult in (1, 2, 3, 4):
        for d in (-12, 0, 12):
            acc += saw(mtof(root) * mult * 2 ** (d / 1200) * (1 + 0.01 * np.exp(-t / 0.05)), N) / mult
    fc = 150 + 2600 * np.exp(-t / 0.35) + 500
    y = sweep(acc, 'low', fc, 2.0)
    y = tanh_sat(y * 0.6, 3)
    e = env_adsr(N, 0.02, 0.4, 0.7, 0.4, hold=dur)
    return y * e * vol


def whoosh(sec=0.8, vol=1.0):
    N = int(sec * SR)
    t = np.arange(N) / SR
    fc = 400 + 3500 * np.sin(np.pi * t / sec) ** 2
    x = sweep(noise(N), 'band', fc, 1.2)
    e = np.sin(np.pi * t / sec) ** 3
    L = x * e * (1 - t / sec)
    R = x * e * (t / sec)
    return np.vstack([L, R]) * vol * 1.4


def coins(sec=2.0, vol=1.0, rate=40):
    N = int((sec + 1) * SR)
    x = np.zeros(N)
    k = int(sec * rate)
    for _ in range(k):
        i = int(RNG.uniform(0, sec) * SR)
        f = RNG.uniform(2500, 6000)
        h = fm(69, 0.02, RNG.uniform(0.2, 0.6), ratio=2.76, index=2, dec=0.12, idx_dec=0.05)
        # Tonhöhe per Resampling ändern
        L = len(h)
        idx = np.clip(np.arange(int(L * 440 / f * 4)) * f / 440 / 4, 0, L - 1).astype(int)
        h = h[idx]
        m = min(len(h), N - i)
        x[i:i + m] += h[:m]
    return x * vol


def wind(sec, vol=1.0):
    N = int(sec * SR)
    t = np.arange(N) / SR
    fc = 500 + 400 * np.sin(2 * np.pi * 0.13 * t) + 250 * np.sin(2 * np.pi * 0.37 * t + 1)
    x = sweep(pink(N), 'band', fc, 1.5)
    a = 0.6 + 0.4 * np.sin(2 * np.pi * 0.21 * t) ** 2
    return stereo_widen(x * a * vol, 0.02, 0.9)


def rumble(sec, vol=1.0, build=True):
    N = int(sec * SR)
    t = np.arange(N) / SR
    x = lp(brown(N), 180) * 3 + lp(noise(N), 900) * 0.2
    e = (t / sec) ** 1.5 if build else np.ones(N)
    return stereo_widen(tanh_sat(x * e * vol, 1.5), 0.015, 0.8)


def heartbeat(vol=1.0):
    N = int(0.8 * SR)
    t = np.arange(N) / SR
    x = sine(50 * (1 + 0.4 * np.exp(-t / 0.02)), N) * np.exp(-t / 0.09)
    i = int(0.24 * SR)
    x[i:] += sine(46 * (1 + 0.4 * np.exp(-t[:N - i] / 0.02)), N - i) * np.exp(-t[:N - i] / 0.11) * 0.7
    return tanh_sat(x * vol, 1.5)


def quindar(high=True, vol=0.4):
    N = int(0.25 * SR)
    x = sine(2525 if high else 2475, N)
    e = np.ones(N)
    r = int(0.005 * SR)
    e[:r] = np.linspace(0, 1, r)
    e[-r:] = np.linspace(1, 0, r)
    return x * e * vol


def radio_static(sec, vol=1.0):
    N = int(sec * SR)
    x = bp(noise(N), 2200, 0.8) * (0.5 + 0.5 * (RNG.random(N // 400 + 1).repeat(400)[:N] > 0.3))
    return x * vol


def splash(vol=1.0):
    N = int(2.5 * SR)
    t = np.arange(N) / SR
    x = sweep(noise(N), 'low', 7000 * np.exp(-t / 0.4) + 300, 0.7) * (np.exp(-t / 0.5))
    x += lp(noise(N), 400) * np.exp(-t / 0.15) * 1.2
    # Tropfen/Blubbern
    for _ in range(40):
        i = int(RNG.uniform(0.2, 2.0) * SR)
        f = RNG.uniform(500, 1600)
        L = int(0.04 * SR)
        tt = np.arange(L) / SR
        d = np.sin(2 * np.pi * f * (1 + 2 * tt / 0.04) * tt) * np.exp(-tt / 0.01) * RNG.uniform(0.05, 0.2)
        m = min(L, N - i)
        x[i:i + m] += d[:m]
    return stereo_widen(x * vol, 0.01, 0.9)


def tuning_a(sec, vol=1.0):
    """Orchester stimmt: Oboe A, dann Streicher auf A und E."""
    N = int(sec * SR)
    t = np.arange(N) / SR
    ob = brass(n('A4'), sec * 0.9, 0.5, 0.6, 1, 'sax', scoop=False)[:N]
    out = np.zeros(N)
    out[:len(ob)] += ob * 0.6
    for k, m in enumerate([n('A3'), n('A4'), n('E5'), n('D4'), n('A2'), n('G3')]):
        st = 0.6 + k * 0.35
        s = strings([m + RNG.uniform(-0.15, 0.15)], sec - st, 0.25, att=0.5, cut=2500)
        i = int(st * SR)
        mm = min(s.shape[1], N - i)
        out[i:i + mm] += s[0, :mm]
    return out * vol
