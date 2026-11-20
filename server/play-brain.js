'use strict';

// Spiel „Brain or Dreh'n“: 12 Kategorien mit je einer A–D-Frage. Alle Teams
// antworten (kein Buzzer). Richtige Antwort = Spielpunkt(e). Danach dürfen die
// richtigen Teams buzzern; das schnellste dreht das Glücksrad (12 Felder:
// 6 positive Joker für den Vorrat, 6 negative, die sofort wirken – im Editor
// per Dropdown aus der Joker-Datenbank mit 15 positiven und 15 negativen Jokern gewählt). Jedes Feld
// hat dieselbe Wahrscheinlichkeit (gleichverteilter Zufall über alle Felder).
// Spielpunkte laufen getrennt (nie unter 0) und gehen erst mit „Spiel beenden“
// in den Show-Gesamtstand. Joker gelten nur für das eigene Team, außer der
// Joker nennt ausdrücklich ein anderes Team.
//
// Ablauf je Runde: category (Kategorie groß, Joker einsetzen) → question
// (Frage, Antworten) → evaluated (Auflösung, Punkte) → wheel (Buzzer, Rad) → nächste Runde.

const core = require('./core');

const { fail, log, effect, teamName, teamIds, bookTarget, cleanChoice } = core;
// Zufall über core.randomInt (im Test austauschbar).
const randomInt = (n) => core.randomInt(n);
const { WHEEL, WHEEL_SLOTS } = require('./defaults-extra');

const NEEDS_TARGET = ['raeuber', 'dieb', 'blockade', 'detektiv', 'tausch'];
const SECRET = ['detektiv', 'tausch']; // Auswahl bleibt geheim

// Glücksrad dieses Spiels: Namen, Symbole, Texte und Werte der Joker sind im
// Editor änderbar; die Wirkung (Mechanik) jedes Feldes bleibt gleich.
const JOKER_VALUES = { doppel: 2, streak: 2, raeuber: 2, minus2: 2, minus1: 1, raub: 2, rettung: 1, wette: 3, sauger: 1, pech: 1, radsperre: 2, zeitdruck: 10 };
// Diese Joker setzt man nicht selbst ein – sie wirken von selbst aus dem Vorrat.
const PASSIVE = ['schild', 'umleitung'];
const SHIELDABLE = ['raeuber', 'dieb', 'blockade'];
const RUSH_GRACE_MS = 1500;
function wheelOf(game) {
  const c = (game && game.content) || {};
  return WHEEL.map((w) => {
    const side = c[w.good ? 'good' : 'bad'];
    const pos = WHEEL.filter((x) => x.good === w.good).indexOf(w);
    const o = (side && Array.isArray(side.jokers) && side.jokers[pos]) || (Array.isArray(c.jokers) && c.jokers[WHEEL.indexOf(w)]) || {};
    const val = typeof o.value === 'number' && Number.isFinite(o.value) ? o.value : JOKER_VALUES[w.key];
    return { ...w, name: (o.name || '').trim() || w.name, icon: (o.icon || '').trim() || w.icon, text: (o.text || '').trim() || w.text, value: val ?? null };
  });
}
const fieldByKey = (game, k) => wheelOf(game).find((f) => f.key === k);
const GOOD_KEYS = WHEEL.filter((w) => w.good).map((w) => w.key);
const BAD_KEYS = WHEEL.filter((w) => !w.good).map((w) => w.key);

// Gewählte Joker fürs Rad (6 gute, 6 fiese). Ältere Inhalte ohne Auswahl: die ersten sechs.
function slotKeys(game) {
  const c = (game && game.content) || {};
  const pick = (arr, keys) => Array.from({ length: WHEEL_SLOTS }, (_, i) => {
    const k = Array.isArray(arr) && arr[i] ? arr[i].joker : null;
    return keys.includes(k) ? k : keys[i];
  });
  return { good: pick(c.good ? c.good.slots : c.goodSlots, GOOD_KEYS), bad: pick(c.bad ? c.bad.slots : c.badSlots, BAD_KEYS) };
}
// Fehlermeldung, wenn ein Joker doppelt aufs Rad gelegt wurde (sonst null).
function slotProblem(game) {
  const { good, bad } = slotKeys(game);
  const dup = (keys) => [...new Set(keys.filter((k, i) => keys.indexOf(k) !== i))].map((k) => `„${fieldByKey(game, k).name}“`);
  const d = [...dup(good), ...dup(bad)];
  return d.length ? `Auf dem Glücksrad ist ${d.join(', ')} doppelt gewählt – jeder Joker darf nur einmal aufs Rad.` : null;
}
// Die 12 Felder des Rads in Reihenfolge (abwechselnd gut/fies), Index = Position auf dem Rad.
function wheelFields(game) {
  const { good, bad } = slotKeys(game);
  const out = [];
  for (let i = 0; i < WHEEL_SLOTS; i += 1) out.push(fieldByKey(game, good[i]), fieldByKey(game, bad[i]));
  return out;
}
// Ergebnis eines Drehs (ältere Spielstände kannten nur die Feldnummer n).
const spunField = (game, spin) => (spin.key ? fieldByKey(game, spin.key) : wheelOf(game).find((f) => f.n === spin.n));
const val = (game, k) => fieldByKey(game, k).value ?? JOKER_VALUES[k];

function teamState(st, id) {
  if (!st.t[id]) st.t[id] = { points: 0, jokers: [], streak: null, double: false, ban: false, blockedBy: null, jokerLock: false, zero: false, rush: false, wheelBan: 0 };
  return st.t[id];
}

// Teams, denen man einen Joker stehlen kann (haben mindestens einen im Vorrat).
const thievable = (db, st, teamId) => teamIds(db).filter((id) => id !== teamId && teamState(st, id).jokers.length > 0);

function sub(t, n) {
  const taken = Math.min(t.points, n);
  t.points -= taken;
  return taken;
}

function cur(st) {
  if (st.round < 0) fail('Das Spiel hat noch nicht begonnen.');
  return st.r;
}

function note(st, text, pub = true) {
  st.events.push({ seq: st.events.length + 1, text, pub });
  if (st.events.length > 40) st.events.shift();
}

function newRound(db, st, i) {
  st.round = i;
  st.r = { phase: 'category', joker: null, answers: {}, swapped: null, evaluated: false, buzz: null, spin: null, removed: {}, rush: {}, extra: {}, redirect: null };
  // Sperren aus der Vorrunde gelten genau für diese Frage.
  for (const id of teamIds(db)) {
    const t = teamState(st, id);
    t.blockedNow = t.ban || !!t.blockedBy;
    t.ban = false;
    t.blockedBy = null;
    // Joker-Sperre gilt für genau diesen Kategoriewechsel.
    t.lockNow = t.jokerLock;
    t.jokerLock = false;
    // Rad-Sperre läuft eine bestimmte Zahl Runden.
    t.wheelBanNow = (t.wheelBan || 0) > 0;
    if (t.wheelBan > 0) t.wheelBan -= 1;
  }
}

// Schutzschild im Vorrat des Ziels fängt einen Angriff ab (und ist danach verbraucht).
function shielded(db, ctx, game, st, attacker, target, f) {
  const v = teamState(st, target);
  const k = v.jokers.findIndex((j) => j.key === 'schild');
  if (k < 0) return false;
  v.jokers.splice(k, 1);
  st.r.joker.shielded = true;
  const text = `${teamName(db, target)} wehrt „${f.name}“ von ${teamName(db, attacker)} mit „${fieldByKey(game, 'schild').name}“ ab`;
  note(st, text);
  log(db, ctx, 'joker', text);
  return true;
}

// Positiver Joker aus dem Vorrat wirkt auf die anstehende Frage.
function applyJoker(db, ctx, game, st, teamId, joker, target, opts = {}) {
  const t = teamState(st, teamId);
  const r = st.r;
  const f = fieldByKey(game, joker.key);
  r.joker = { teamId, key: joker.key, target: target || null };
  if (SHIELDABLE.includes(joker.key) && shielded(db, ctx, game, st, teamId, target, f)) {
    log(db, ctx, 'joker', `${teamName(db, teamId)}: Joker „${f.name}“ gegen ${teamName(db, target)} – abgewehrt`);
    return;
  }
  switch (joker.key) {
    case 'doppel': t.double = val(game, 'doppel'); note(st, `${teamName(db, teamId)} setzt „${f.name}“ ein`); break;
    case 'streak': t.streak = val(game, 'streak'); note(st, `${teamName(db, teamId)} startet eine Streak`); break;
    case 'fifty': {
      const q = game.content.rounds[st.round];
      const wrong = ['A', 'B', 'C', 'D'].filter((l) => l !== q.correct);
      const keep = wrong[randomInt(wrong.length)];
      r.removed[teamId] = wrong.filter((l) => l !== keep);
      note(st, `${teamName(db, teamId)} setzt einen Joker ein`, true);
      break;
    }
    case 'raeuber': {
      const victim = teamState(st, target);
      const want = val(game, 'raeuber');
      const got = sub(victim, want);
      t.points += got;
      note(st, `${teamName(db, teamId)} stiehlt ${teamName(db, target)} ${got} ${got === 1 ? 'Punkt' : 'Punkte'}${got < want ? ' (mehr war nicht da)' : ''}`);
      break;
    }
    case 'dieb': {
      const victim = teamState(st, target);
      const k = randomInt(victim.jokers.length);
      const [stolen] = victim.jokers.splice(k, 1);
      t.jokers.push(stolen);
      r.joker.stolen = stolen.key;
      note(st, `${teamName(db, teamId)} stiehlt ${teamName(db, target)} einen Joker`);
      log(db, ctx, 'joker', `Joker-Dieb: zufällig gezogen „${fieldByKey(game, stolen.key).name}“ (Nr. ${k + 1} von ${victim.jokers.length + 1})`);
      break;
    }
    case 'blockade': {
      teamState(st, target).blockedNow = true;
      note(st, `${teamName(db, teamId)} blockiert ${teamName(db, target)} für diese Frage`);
      break;
    }
    case 'detektiv':
    case 'tausch':
      note(st, `${teamName(db, teamId)} setzt einen geheimen Joker ein`, true);
      break;
    case 'rettung': r.rescue = teamId; note(st, `${teamName(db, teamId)} setzt „${f.name}“ ein`); break;
    case 'zweikreuze': r.two = teamId; note(st, `${teamName(db, teamId)} setzt „${f.name}“ ein`); break;
    case 'sauger': r.sauger = teamId; note(st, `${teamName(db, teamId)} setzt „${f.name}“ ein`); break;
    case 'vorfahrt': r.priority = teamId; note(st, `${teamName(db, teamId)} setzt „${f.name}“ ein`); break;
    case 'wette':
      r.bet = { teamId, stake: opts.stake };
      r.joker.stake = opts.stake;
      note(st, `${teamName(db, teamId)} wettet ${opts.stake} ${opts.stake === 1 ? 'Spielpunkt' : 'Spielpunkte'}`);
      break;
    default:
      break;
  }
  log(db, ctx, 'joker', `${teamName(db, teamId)}: Joker „${f.name}“${target ? ` gegen ${teamName(db, target)}` : ''}${opts.stake ? ` (Einsatz ${opts.stake})` : ''}`);
}

const randomOther = (db, teamId) => {
  const others = teamIds(db).filter((id) => id !== teamId);
  return others.length ? others[randomInt(others.length)] : null;
};

// Negatives Feld wirkt sofort (auf das Team, das gedreht hat – oder das Ziel einer Umleitung).
function applyNegative(db, ctx, game, st, teamId, f) {
  const t = teamState(st, teamId);
  const res = { key: f.key };
  switch (f.key) {
    case 'minus2': res.taken = sub(t, val(game, 'minus2')); break;
    // Punktabzug 1 und Punktraub: die Punkte gehen an ein zufällig ausgelostes anderes Team.
    case 'minus1':
    case 'raub': {
      res.taken = sub(t, val(game, f.key));
      res.to = randomOther(db, teamId);
      if (res.to) teamState(st, res.to).points += res.taken;
      break;
    }
    case 'verlust':
      if (t.jokers.length) res.lost = t.jokers.splice(randomInt(t.jokers.length), 1)[0].key;
      else res.none = true;
      break;
    case 'sperre': t.jokerLock = true; break;
    case 'verbot': t.ban = true; break;
    case 'enteignung': res.lostCount = t.jokers.length; t.jokers = []; break;
    case 'reset': res.taken = t.points; t.points = 0; break;
    case 'halbiert': res.taken = sub(t, t.points - Math.floor(t.points / 2)); break;
    case 'platztausch': {
      const others = teamIds(db).filter((id) => id !== teamId);
      const min = Math.min(...others.map((id) => teamState(st, id).points));
      // Wer selbst schon am wenigsten hat, tauscht nicht (ein fieses Feld soll nicht helfen).
      if (!others.length || t.points <= min) { res.none = true; break; }
      const low = others.filter((id) => teamState(st, id).points === min);
      res.with = low[randomInt(low.length)];
      res.mine = t.points;
      res.theirs = min;
      teamState(st, res.with).points = t.points;
      t.points = min;
      break;
    }
    case 'geschenk': {
      res.to = randomOther(db, teamId);
      if (!t.jokers.length || !res.to) { res.none = true; break; }
      const [j] = t.jokers.splice(randomInt(t.jokers.length), 1);
      teamState(st, res.to).jokers.push(j);
      res.lost = j.key;
      break;
    }
    case 'nullrunde': t.zero = true; break;
    case 'pech':
      res.taken = sub(t, val(game, 'pech'));
      if (t.jokers.length) res.lost = t.jokers.splice(randomInt(t.jokers.length), 1)[0].key;
      break;
    case 'radsperre': t.wheelBan = Math.max(t.wheelBan || 0, val(game, 'radsperre')); res.rounds = val(game, 'radsperre'); break;
    case 'zeitdruck': t.rush = true; res.seconds = val(game, 'zeitdruck'); break;
    default: break;
  }
  return res;
}

// Fieses Feld trifft ein Team – außer es hat einen Schutzschild im Vorrat (der ist dann verbraucht).
function hitNegative(db, ctx, game, st, teamId, f) {
  const t = teamState(st, teamId);
  const k = t.jokers.findIndex((j) => j.key === 'schild');
  if (k >= 0) {
    t.jokers.splice(k, 1);
    return { res: { key: f.key, shielded: true }, text: `${teamName(db, teamId)} wehrt „${f.name}“ mit „${fieldByKey(game, 'schild').name}“ ab` };
  }
  const res = applyNegative(db, ctx, game, st, teamId, f);
  return { res, text: negText(db, teamId, f, res) };
}

const pkt = (n) => `${n} ${n === 1 ? 'Punkt' : 'Punkte'}`;
function negText(db, teamId, f, res) {
  const n = teamName(db, teamId);
  switch (f.key) {
    case 'minus2': return `${n} verliert ${pkt(res.taken)}`;
    case 'minus1':
    case 'raub': return res.to ? `${n} verliert ${pkt(res.taken)} – ausgelost bekommt sie ${teamName(db, res.to)}` : `${n} verliert ${pkt(res.taken)}`;
    case 'verlust': return res.none ? `${n} hat keinen Joker – keine Wirkung` : `${n} verliert einen Joker`;
    case 'sperre': return `${n} darf beim nächsten Kategoriewechsel keinen Joker einsetzen`;
    case 'verbot': return `${n} darf die nächste Frage nicht beantworten`;
    case 'enteignung': return `${n} verliert alle Joker (${res.lostCount})`;
    case 'reset': return `${n}: Spielpunkte auf 0`;
    case 'halbiert': return `${n}: Spielpunkte halbiert (−${res.taken})`;
    case 'platztausch': return res.none ? `${n} hat schon die wenigsten Spielpunkte – kein Tausch` : `${n} tauscht mit ${teamName(db, res.with)}: ${res.mine} ↔ ${res.theirs}`;
    case 'geschenk': return res.none ? `${n} hat keinen Joker – keine Wirkung` : `${n} schenkt ${teamName(db, res.to)} einen Joker`;
    case 'nullrunde': return `${n}: die nächste richtige Antwort bringt 0 Punkte`;
    case 'pech': return `${n} verliert ${pkt(res.taken)}${res.lost ? ' und einen Joker' : ''}`;
    case 'radsperre': return `${n} darf ${res.rounds === 1 ? 'in der nächsten Runde' : `in den nächsten ${res.rounds} Runden`} nicht ans Glücksrad`;
    case 'zeitdruck': return `${n} hat bei der nächsten Frage nur ${res.seconds} Sekunden`;
    default: return n;
  }
}

function doRedirect(db, ctx, game, st, target) {
  const r = cur(st);
  if (!r.redirect || !r.redirect.pending) fail('Gerade gibt es nichts umzuleiten.');
  if (!teamIds(db).includes(target) || target === r.redirect.from) fail('Bitte ein anderes Team wählen.');
  const f = fieldByKey(game, r.redirect.key);
  const { res, text } = hitNegative(db, ctx, game, st, target, f);
  r.redirect.pending = false;
  r.redirect.to = target;
  r.spin.res = res;
  r.spin.target = target;
  r.spin.text = `${teamName(db, r.redirect.from)} leitet „${f.name}“ um: ${text}`;
  note(st, r.spin.text);
  log(db, ctx, 'joker', r.spin.text);
  effect(db, 'reveal');
}

// Antwort, die für ein Team gewertet wird (Antworttausch des Joker-Teams separat protokolliert).
function effective(r, id) {
  if (r.swapped && r.swapped.teamId === id) return r.answers[r.swapped.with]?.choice ?? null;
  return r.answers[id]?.choice ?? null;
}

module.exports = {
  WHEEL,
  wheelOf,
  wheelFields,
  slotProblem,
  init: () => ({ round: -1, r: null, t: {}, events: [], finished: false }),

  team: {
    // Joker aus dem Vorrat beim Vorstellen der Kategorie einsetzen (höchstens einer pro Frage).
    useJoker(db, ctx, game, st, p) {
      const r = cur(st);
      if (r.phase !== 'category') fail('Joker nur beim Vorstellen der Kategorie – jetzt ist es zu spät.');
      if (r.joker) fail('Für diese Frage wurde schon ein Joker eingesetzt.');
      const t = teamState(st, ctx.teamId);
      if (t.lockNow) fail('Ihr habt Joker-Sperre für diesen Kategoriewechsel.');
      const k = t.jokers.findIndex((j) => j.id === p.jokerId);
      if (k < 0) fail('Diesen Joker habt ihr nicht.');
      const joker = t.jokers[k];
      if (PASSIVE.includes(joker.key)) fail('Dieser Joker wirkt von selbst – ihr müsst ihn nicht einsetzen.');
      let target = null;
      let stake = null;
      if (joker.key === 'wette') {
        const max = Math.min(val(game, 'wette'), t.points);
        if (max < 1) fail('Für eine Wette braucht ihr mindestens 1 Spielpunkt.');
        stake = Number(p.stake);
        if (!Number.isInteger(stake) || stake < 1 || stake > max) fail(`Einsatz muss zwischen 1 und ${max} liegen.`);
      }
      if (joker.key === 'dieb' && !thievable(db, st, ctx.teamId).length) fail('Kein anderes Team hat einen Joker – der Joker-Dieb bleibt im Vorrat.');
      if (NEEDS_TARGET.includes(joker.key)) {
        if (!teamIds(db).includes(p.target) || p.target === ctx.teamId) fail('Bitte ein anderes Team wählen.');
        if (joker.key === 'dieb' && !teamState(st, p.target).jokers.length) fail('Dieses Team hat keinen Joker.');
        target = p.target;
      }
      t.jokers.splice(k, 1);
      applyJoker(db, ctx, game, st, ctx.teamId, joker, target, { stake });
      effect(db, 'buzz');
    },

    answer(db, ctx, game, st, p) {
      const r = cur(st);
      if (r.phase !== 'question') fail('Gerade wird nicht geantwortet.');
      const t = teamState(st, ctx.teamId);
      if (t.blockedNow) fail('Ihr dürft diese Frage nicht beantworten.');
      // Zeitdruck: nur wenige Sekunden ab Fragebeginn.
      const deadline = r.rush && r.rush[ctx.teamId];
      if (deadline && ctx.now > deadline + RUSH_GRACE_MS) fail('Eure Zeit ist abgelaufen.');
      const prev = r.answers[ctx.teamId];
      // Zwei Kreuze: eine zweite, andere Antwort ist erlaubt.
      if (prev) {
        if (r.two !== ctx.teamId || prev.choice2) fail('Eure Antwort ist schon eingeloggt.');
        const second = cleanChoice(p.choice);
        if (second === prev.choice) fail('Bitte eine andere zweite Antwort wählen.');
        if ((r.removed[ctx.teamId] || []).includes(second)) fail('Diese Antwort ist weggefallen.');
        prev.choice2 = second;
        log(db, ctx, 'antwort', `${teamName(db, ctx.teamId)} hat das zweite Kreuz gesetzt`);
        return;
      }
      const choice = cleanChoice(p.choice);
      if ((r.removed[ctx.teamId] || []).includes(choice)) fail('Diese Antwort ist weggefallen.');
      // Detektiv: Das Joker-Team antwortet erst, wenn das beobachtete Team eingeloggt hat.
      if (r.joker?.key === 'detektiv' && r.joker.teamId === ctx.teamId && teamState(st, r.joker.target).blockedNow !== true && !r.answers[r.joker.target]) {
        fail('Wartet, bis das beobachtete Team geantwortet hat.');
      }
      r.answers[ctx.teamId] = { choice, at: ctx.now };
      log(db, ctx, 'antwort', `${teamName(db, ctx.teamId)} hat eingeloggt`);
    },

    // Antworttausch-Joker: nach beiden Antworten tauschen (oder behalten).
    swap(db, ctx, game, st, p) {
      const r = cur(st);
      if (r.phase !== 'question' || r.joker?.key !== 'tausch' || r.joker.teamId !== ctx.teamId) fail('Kein Antworttausch möglich.');
      if (!r.answers[ctx.teamId] || !r.answers[r.joker.target]) fail('Erst wenn beide Teams eingeloggt haben.');
      if (r.swapDecided) fail('Schon entschieden.');
      r.swapDecided = true;
      if (p.swap) {
        r.swapped = { teamId: ctx.teamId, with: r.joker.target, original: r.answers[ctx.teamId].choice, used: r.answers[r.joker.target].choice };
        log(db, ctx, 'joker', `Antworttausch: ${teamName(db, ctx.teamId)} wertet ${r.swapped.used} statt ${r.swapped.original} (Antwort von ${teamName(db, r.joker.target)} bleibt unverändert)`);
      }
    },

    wheelBuzz(db, ctx, game, st) {
      const r = cur(st);
      if (r.phase !== 'wheel') fail('Das Glücksrad ist gerade nicht frei.');
      if (!r.correct.includes(ctx.teamId)) fail('Nur Teams mit richtiger Antwort dürfen ans Rad.');
      if (teamState(st, ctx.teamId).wheelBanNow) fail('Ihr habt Rad-Sperre.');
      if (r.buzz) fail(`${teamName(db, r.buzz)} war schneller.`);
      r.buzz = ctx.teamId;
      log(db, ctx, 'buzzer', `${teamName(db, ctx.teamId)} darf das Glücksrad drehen`);
      effect(db, 'buzz');
    },

    spin(db, ctx, game, st) {
      const r = cur(st);
      if (r.phase !== 'wheel' || r.buzz !== ctx.teamId) fail('Ihr dürft gerade nicht drehen.');
      if (r.spin) fail('Das Rad hat sich schon gedreht.');
      // Gleichverteilt: jedes der Felder hat dieselbe Chance (1 von 12).
      const fields = wheelFields(game);
      const idx = randomInt(fields.length);
      const f = fields[idx];
      r.spin = { index: idx, key: f.key, n: f.n, teamId: ctx.teamId, at: ctx.now, name: f.name, good: f.good };
      const t = teamState(st, ctx.teamId);
      if (f.good) {
        t.jokers.push({ id: `j${st.events.length}_${idx}_${ctx.now % 100000}`, key: f.key });
        note(st, `${teamName(db, ctx.teamId)} erdreht einen Joker`);
        log(db, ctx, 'joker', `${teamName(db, ctx.teamId)} erdreht „${f.name}“ (Vorrat)`);
      } else if (t.jokers.some((j) => j.key === 'umleitung')) {
        // Umleitung aus dem Vorrat (geht vor dem Schutzschild): Das Team wählt, wen das fiese Feld trifft.
        t.jokers.splice(t.jokers.findIndex((j) => j.key === 'umleitung'), 1);
        r.redirect = { from: ctx.teamId, key: f.key, pending: true, to: null };
        r.spin.redirect = true;
        r.spin.text = `„${fieldByKey(game, 'umleitung').name}“! ${teamName(db, ctx.teamId)} wählt, wen „${f.name}“ trifft …`;
        note(st, r.spin.text);
        log(db, ctx, 'joker', `${teamName(db, ctx.teamId)} erdreht „${f.name}“ – Umleitung aus dem Vorrat`);
      } else {
        const { res, text } = hitNegative(db, ctx, game, st, ctx.teamId, f);
        r.spin.res = res;
        r.spin.text = text;
        note(st, text);
        log(db, ctx, 'joker', `${teamName(db, ctx.teamId)} erdreht „${f.name}“: ${text}`);
      }
      effect(db, 'reveal');
    },

    // Umleitung: Ziel für das fiese Feld wählen.
    redirect(db, ctx, game, st, p) {
      const r = cur(st);
      if (!r.redirect || r.redirect.from !== ctx.teamId) fail('Gerade gibt es nichts umzuleiten.');
      doRedirect(db, ctx, game, st, p.target);
    },
  },

  mod: {
    start(db, ctx, game, st) {
      if (st.round >= 0) fail('Das Spiel läuft schon.');
      const dup = slotProblem(game);
      if (dup) fail(dup);
      for (const id of teamIds(db)) teamState(st, id);
      newRound(db, st, 0);
      log(db, ctx, 'ablauf', `Runde 1: Kategorie „${game.content.rounds[0].category}“`);
      effect(db, 'title');
    },

    showQuestion(db, ctx, game, st) {
      const r = cur(st);
      if (r.phase !== 'category') fail('Die Frage ist schon offen.');
      r.phase = 'question';
      r.rush = r.rush || {};
      // Zeitdruck: Countdown startet mit der Frage (gilt, sobald das Team antworten darf).
      for (const id of teamIds(db)) {
        const t = teamState(st, id);
        if (t.rush && !t.blockedNow) { r.rush[id] = ctx.now + val(game, 'zeitdruck') * 1000; t.rush = false; }
      }
      log(db, ctx, 'ablauf', `Runde ${st.round + 1}: Frage offen`);
    },

    evaluate(db, ctx, game, st) {
      const r = cur(st);
      if (r.phase !== 'question') fail('Gerade läuft keine Frage.');
      const q = game.content.rounds[st.round];
      r.phase = 'evaluated';
      r.correct = [];
      r.gains = {};
      r.extra = r.extra || {};
      const extra = (id, text) => { (r.extra[id] = r.extra[id] || []).push(text); };
      for (const id of teamIds(db)) {
        const t = teamState(st, id);
        const choice = effective(r, id);
        const second = r.two === id ? r.answers[id]?.choice2 ?? null : null;
        if (choice === null) {
          if (t.streak && !t.blockedNow) t.streak = null; // keine Antwort beendet die Streak
          continue;
        }
        if (choice === q.correct || second === q.correct) {
          let gain = 1;
          if (t.zero) {
            // Nullrunde: diese richtige Antwort bringt nichts (eine Streak läuft weiter).
            gain = 0;
            t.zero = false;
            if (t.streak) t.streak += 1;
            extra(id, `${fieldByKey(game, 'nullrunde').name}: 0 Punkte`);
          } else {
            if (t.streak) { gain = t.streak; t.streak += 1; }
            if (t.double) { gain = Math.max(gain, typeof t.double === 'number' ? t.double : 2); t.double = false; }
          }
          t.points += gain;
          r.correct.push(id);
          r.gains[id] = gain;
        } else if (r.rescue === id) {
          // Rettungsring: trotzdem Punkte, Streak bleibt.
          const g = val(game, 'rettung');
          t.points += g;
          r.gains[id] = g;
          extra(id, `${fieldByKey(game, 'rettung').name}: +${g}`);
        } else {
          t.streak = null; // falsche Antwort beendet die Streak
        }
      }
      // Punktesauger: +Wert für jedes andere Team, das falsch oder gar nicht geantwortet hat.
      if (r.sauger && r.correct.includes(r.sauger)) {
        const losers = teamIds(db).filter((id) => id !== r.sauger && !teamState(st, id).blockedNow && !r.correct.includes(id)).length;
        const g = losers * val(game, 'sauger');
        teamState(st, r.sauger).points += g;
        r.gains[r.sauger] += g;
        extra(r.sauger, `${fieldByKey(game, 'sauger').name}: +${g}`);
      }
      // Wette: richtig = Einsatz doppelt dazu, sonst ist der Einsatz weg.
      if (r.bet) {
        const t = teamState(st, r.bet.teamId);
        if (r.correct.includes(r.bet.teamId)) {
          t.points += 2 * r.bet.stake;
          r.gains[r.bet.teamId] = (r.gains[r.bet.teamId] || 0) + 2 * r.bet.stake;
          extra(r.bet.teamId, `Wette gewonnen: +${2 * r.bet.stake}`);
        } else {
          const lost = sub(t, r.bet.stake);
          extra(r.bet.teamId, `Wette verloren: −${lost}`);
        }
      }
      log(db, ctx, 'ablauf', `Runde ${st.round + 1} aufgelöst (richtig: ${q.correct})`);
      effect(db, 'show'); // alle zugleich aufgelöst: kein Richtig-/Falsch-Ton
    },

    openWheel(db, ctx, game, st) {
      const r = cur(st);
      if (r.phase !== 'evaluated') fail('Erst die Frage auflösen.');
      if (!r.correct.length) fail('Niemand lag richtig – das Rad bleibt zu.');
      const allowed = r.correct.filter((id) => !teamState(st, id).wheelBanNow);
      if (!allowed.length) fail('Alle richtigen Teams haben Rad-Sperre – das Rad bleibt zu.');
      r.phase = 'wheel';
      // Vorfahrt: Das Joker-Team dreht ohne Buzzer-Rennen.
      if (r.priority && allowed.includes(r.priority)) {
        r.buzz = r.priority;
        note(st, `${teamName(db, r.priority)} hat Vorfahrt am Glücksrad`);
      }
      log(db, ctx, 'ablauf', 'Glücksrad frei – richtige Teams dürfen buzzern');
    },

    // Falls das Team-iPad ausfällt: für das Buzzer-Team drehen.
    spinFor(db, ctx, game, st) {
      const r = cur(st);
      if (!r.buzz) fail('Noch hat niemand gebuzzert.');
      return module.exports.team.spin(db, { ...ctx, teamId: r.buzz }, game, st);
    },
    // Falls das Team-iPad ausfällt: Ziel der Umleitung für das Team wählen.
    redirectFor(db, ctx, game, st, p) {
      doRedirect(db, ctx, game, st, p.target);
    },

    next(db, ctx, game, st) {
      const r = cur(st);
      if (!['evaluated', 'wheel'].includes(r.phase)) fail('Erst die Frage auflösen.');
      if (r.phase === 'wheel' && r.buzz && !r.spin) fail('Das Rad wurde noch nicht gedreht.');
      if (r.redirect && r.redirect.pending) fail('Erst das Ziel der Umleitung wählen.');
      if (st.round + 1 >= game.content.rounds.length) fail('Das war die letzte Runde – jetzt „Spiel beenden“.');
      newRound(db, st, st.round + 1);
      log(db, ctx, 'ablauf', `Runde ${st.round + 1}: Kategorie „${game.content.rounds[st.round].category}“`);
      effect(db, 'title');
    },

    // Spielpunkte einmalig in den Show-Gesamtstand übernehmen.
    finish(db, ctx, game, st) {
      if (st.round < 0) fail('Das Spiel hat noch nicht begonnen.');
      for (const id of teamIds(db)) {
        bookTarget(db, ctx, `brain:${game.id}:${id}`, id, teamState(st, id).points, `${game.title} (Spielpunkte)`);
      }
      st.finished = true;
      log(db, ctx, 'ablauf', `${game.title} beendet – Spielpunkte gutgeschrieben`);
      effect(db, 'reveal');
    },

    // Spielpunkte korrigieren (bleibt innerhalb dieses Spiels, nie unter 0).
    adjust(db, ctx, game, st, p) {
      const t = teamState(st, p.teamId);
      const d = Number(p.delta);
      if (!Number.isInteger(d) || Math.abs(d) > 20) fail('Ungültige Korrektur.');
      t.points = Math.max(0, t.points + d);
      log(db, ctx, 'punkte', `${teamName(db, p.teamId)}: Spielpunkte ${d > 0 ? '+' : ''}${d} (Korrektur)`);
      if (st.finished) bookTarget(db, ctx, `brain:${game.id}:${p.teamId}`, p.teamId, t.points, `${game.title} (Spielpunkte, Korrektur)`);
    },
  },

  // Neu zeichnen, wenn eine Zeitdruck-Frist abläuft.
  wakeAt(db, game, st, now) {
    if (st.round < 0 || !st.r || st.r.phase !== 'question') return null;
    const next = Object.values(st.r.rush || {}).map((d) => d + RUSH_GRACE_MS).filter((d) => d > now).sort((a, b) => a - b)[0];
    return next || null;
  },

  teamView(db, game, st, teamId, now = Date.now()) {
    if (st.round < 0) return { waiting: true, title: game.title };
    const r = st.r;
    const q = game.content.rounds[st.round];
    const t = teamState(st, teamId);
    const det = r.joker?.key === 'detektiv' && r.joker.teamId === teamId;
    const tau = r.joker?.key === 'tausch' && r.joker.teamId === teamId;
    return {
      round: st.round,
      count: game.content.rounds.length,
      phase: r.phase,
      category: q.category,
      question: r.phase !== 'category' ? q.question : null,
      options: r.phase !== 'category' ? q.options : null,
      removed: r.removed[teamId] || [],
      blocked: t.blockedNow,
      answer: r.answers[teamId]?.choice ?? null,
      // Antworttausch: die übernommene Antwort zählt für dieses Team.
      swappedTo: r.swapped && r.swapped.teamId === teamId ? r.swapped.used : null,
      correct: ['evaluated', 'wheel'].includes(r.phase) ? q.correct : null,
      gained: r.gains ? r.gains[teamId] || 0 : null,
      points: t.points,
      // Eigener Joker-Vorrat (privat).
      jokers: t.jokers.map((j) => ({
        id: j.id, ...fieldByKey(game, j.key), needsTarget: NEEDS_TARGET.includes(j.key),
        passive: PASSIVE.includes(j.key),
        maxStake: j.key === 'wette' ? Math.min(val(game, 'wette'), t.points) : null,
        // Joker-Dieb nur, wenn ein anderes Team Joker hat; Wette nur mit Spielpunkten.
        usable: !PASSIVE.includes(j.key) && (j.key !== 'dieb' || thievable(db, st, teamId).length > 0) && (j.key !== 'wette' || Math.min(val(game, 'wette'), t.points) >= 1),
        targets: j.key === 'dieb' ? thievable(db, st, teamId) : null,
      })),
      // Spielpunkte aller Teams (nur dieses Spiel).
      allPoints: teamIds(db).map((id) => ({ teamId: id, points: teamState(st, id).points })),
      canUseJoker: r.phase === 'category' && !r.joker && !t.lockNow && t.jokers.some((j) => !PASSIVE.includes(j.key)),
      answer2: r.answers[teamId]?.choice2 ?? null,
      two: r.two === teamId,
      rush: r.rush && r.rush[teamId] ? { deadline: r.rush[teamId], over: now > r.rush[teamId] + RUSH_GRACE_MS } : null,
      rushNext: t.rush,
      zero: t.zero,
      wheelBan: t.wheelBanNow ? 'now' : t.wheelBan > 0 ? 'next' : null,
      extra: r.extra && r.extra[teamId] ? r.extra[teamId] : [],
      bet: r.bet && r.bet.teamId === teamId ? r.bet.stake : null,
      redirect: r.redirect && r.redirect.from === teamId && r.redirect.pending ? { field: fieldByKey(game, r.redirect.key) } : null,
      jokerLock: t.lockNow,
      jokerUsed: r.joker ? (r.joker.teamId === teamId ? { key: r.joker.key, target: r.joker.target } : { other: true }) : null,
      double: t.double,
      streak: t.streak,
      // Detektiv: Antwort des beobachteten Teams nur für das Joker-Team, erst nach dessen Abgabe.
      detective: det ? { target: r.joker.target, answer: r.answers[r.joker.target]?.choice ?? null, waiting: !r.answers[r.joker.target] } : null,
      swap: tau && r.phase === 'question' ? { target: r.joker.target, ready: !!r.answers[teamId] && !!r.answers[r.joker.target], decided: !!r.swapDecided, theirs: r.answers[teamId] && r.answers[r.joker.target] ? r.answers[r.joker.target].choice : null } : null,
      wheel: r.phase === 'wheel' ? { canBuzz: r.correct.includes(teamId) && !r.buzz && !t.wheelBanNow, banned: r.correct.includes(teamId) && !!t.wheelBanNow, mine: r.buzz === teamId, taken: r.buzz, spin: r.spin ? { index: r.spin.index, field: spunField(game, r.spin), text: r.spin.text || null } : null } : null,
      targets: teamIds(db).filter((id) => id !== teamId),
      finished: st.finished,
    };
  },

  beamerView(db, game, st) {
    if (st.round < 0) return { waiting: true };
    const r = st.r;
    const q = game.content.rounds[st.round];
    const publicJoker = r.joker && !SECRET.includes(r.joker.key) && r.joker.key !== 'fifty'
      ? { teamId: r.joker.teamId, field: fieldByKey(game, r.joker.key), target: r.joker.target, stake: r.joker.stake || null, shielded: !!r.joker.shielded }
      : r.joker ? { teamId: r.joker.teamId, secret: true } : null;
    return {
      round: st.round,
      count: game.content.rounds.length,
      phase: r.phase,
      category: q.category,
      question: r.phase !== 'category' ? q.question : null,
      options: r.phase !== 'category' ? q.options : null,
      answeredCount: Object.keys(r.answers).length,
      blocked: teamIds(db).filter((id) => teamState(st, id).blockedNow),
      rush: r.phase === 'question' ? Object.entries(r.rush || {}).map(([teamId, deadline]) => ({ teamId, deadline, answered: !!r.answers[teamId] })) : [],
      correct: ['evaluated', 'wheel'].includes(r.phase) ? q.correct : null,
      // Nach der Auflösung: gewertete Antworten (ein Tausch bleibt geheim, nur das Ergebnis zählt).
      results: ['evaluated', 'wheel'].includes(r.phase) ? teamIds(db).map((id) => ({ teamId: id, ok: r.correct.includes(id), answered: effective(r, id) !== null })) : [],
      joker: publicJoker,
      wheel: { fields: wheelFields(game).map((f) => ({ n: f.n, icon: f.icon, good: f.good, name: f.name })), buzz: r.phase === 'wheel' ? r.buzz : null, spin: r.spin ? { index: r.spin.index, field: spunField(game, r.spin), teamId: r.spin.teamId, text: r.spin.text || null, redirect: r.redirect ? { pending: r.redirect.pending, to: r.redirect.to } : null } : null, open: r.phase === 'wheel' },
      // Spielpunkte dieses Spiels (nicht der Show-Gesamtstand) dauerhaft auf dem Beamer.
      points: teamIds(db).map((id) => ({ teamId: id, points: teamState(st, id).points })),
      events: st.events.filter((e) => e.pub).slice(-4),
      finished: st.finished,
    };
  },
};
