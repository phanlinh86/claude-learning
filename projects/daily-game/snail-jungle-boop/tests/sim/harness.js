// Zippy's Jungle Boop — high-speed playtest harness (node, no deps). REPORT-ONLY: never edits game/js.
// Loads the browser scripts into a node vm with a fake window (same approach as tests/unit/run.js) and lets a
// scenario monkey-patch World.CONFIG before play (the world reads CONFIG through a shared object reference).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS = path.join(__dirname, '..', '..', 'game', 'js');
const SRC = ['rng.js', 'world.js', 'bot.js'].map(f => [f, fs.readFileSync(path.join(JS, f), 'utf8')]);

/** fresh sandbox; `patch` = { KEY: value, DIFFICULTY: { easy: { matchP: 0.7 } } } deep-merged into CONFIG */
function load(patch) {
  const sb = { console };
  sb.window = sb;
  vm.createContext(sb);
  for (const [f, s] of SRC) vm.runInContext(s, sb, { filename: f });
  const C = sb.ZJB.World.CONFIG;
  if (patch) merge(C, patch);
  return sb.ZJB;
}
function merge(dst, src) {
  for (const k of Object.keys(src)) {
    const v = src[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object') merge(dst[k], v);
    else dst[k] = Array.isArray(v) ? v.slice() : v;
  }
}

// ------------------------------------------------------------------ player models
// Every player: step(dt) is called before world.update(dt) each 1/60 s frame; it may call w.tapHole().
const live = c => c && (c.state === 'rise' || c.state === 'up');

/** generic human: gaze, reaction, impulse taps on decoys near the gaze, stale colour belief, pauses */
class Human {
  constructor(w, rng, p) {
    this.w = w; this.r = rng; this.p = p; this.t = 0;
    this.seen = {}; this.belief = w.colour; this.seenColour = w.colour; this.switchAt = -1;
    this.gaze = { x: 480, y: 400 }; this.pauseUntil = 0; this.nextTapT = 0; this.pauses = 0;
    this.lastPopId = 0;
  }
  rr(a) { return this.r.range(a[0], a[1]); }
  step(dt) {
    const w = this.w, p = this.p; this.t += dt;
    if (w.phase !== 'play') return;
    // colour belief: the kid notices the new colour one reaction later (voice/antenna help is in the reaction)
    if (w.colour !== this.seenColour) { this.seenColour = w.colour; this.switchAt = this.t + this.rr(p.colourLag || p.react); }
    if (this.switchAt >= 0 && this.t >= this.switchAt) { this.belief = this.seenColour; this.switchAt = -1; }
    // pauses (looks away / talks / stops)
    if (this.t < this.pauseUntil) { this.seen = {}; return; }
    if (p.pauseRate && this.r.chance(p.pauseRate * dt)) { this.pauseUntil = this.t + this.rr(p.pauseDur); this.pauses++; this.seen = {}; return; }
    const min = 0.25; let best = -1, bestAt = Infinity; const alive = {};
    for (let i = 0; i < w.holes.length; i++) {
      const h = w.holes[i], c = h.critter;
      if (!live(c) || c.h < min) continue;
      alive[c.id] = true;
      let m = this.seen[c.id];
      if (!m) {
        // motion draws the eye: a fresh pop may pull the gaze
        if (c.id > this.lastPopId) { this.lastPopId = c.id; if (this.r.chance(p.gazeJump || 0)) this.gaze = { x: h.x, y: h.y }; }
        const d = Math.hypot(h.x - this.gaze.x, h.y - this.gaze.y), near = d <= p.gazeR;
        m = this.seen[c.id] = { at: this.t + this.rr(p.react) + (near ? 0 : this.rr(p.farExtra)), near, colour: this.belief, plan: 'wait' };
      }
      if (m.plan === 'wait' && m.colour !== this.belief) { m.colour = this.belief; }
      if (m.plan === 'wait' && this.t >= m.at) {
        if (c.colour === this.belief) {
          if (this.r.chance(p.focus)) m.plan = 'tap'; else m.at = this.t + this.rr(p.react);
        } else {
          m.plan = this.r.chance(m.near ? p.impulse : p.farImpulse) ? 'tap' : 'skip';
        }
      }
      if (m.plan === 'tap' && m.at < bestAt) { bestAt = m.at; best = i; }
    }
    for (const id in this.seen) if (!alive[id]) delete this.seen[id];
    if (best >= 0 && this.t >= this.nextTapT) {
      const c = w.holes[best].critter, r = w.tapHole(best);
      if (r === 'busy') { this.nextTapT = this.t + this.rr(p.gap); return; }
      this.seen[c.id].plan = 'done';
      this.gaze = { x: w.holes[best].x, y: w.holes[best].y };
      this.nextTapT = this.t + this.rr(p.gap);
    }
  }
}

const KID4 = {           // a 4-year-old
  react: [0.9, 1.6], farExtra: [0.4, 1.0], gazeR: 260, gazeJump: 0.6,
  focus: 0.85, impulse: 0.55, farImpulse: 0.15,
  pauseRate: 1 / 25, pauseDur: [2.5, 3.5], gap: [0.6, 1.0]
};
const PARENT = {         // casual parent: relaxed, rarely wrong, checks the phone now and then
  react: [0.5, 0.9], farExtra: [0.15, 0.4], gazeR: 320, gazeJump: 0.5,
  focus: 0.95, impulse: 0.06, farImpulse: 0.02,
  pauseRate: 1 / 60, pauseDur: [2, 5], gap: [0.35, 0.6]
};

/** (c1) mash: round-robin every burrow at `hz` taps per second, colour-blind */
class MashAll {
  constructor(w, rng, o) { this.w = w; this.r = rng; this.hz = (o && o.hz) || 8; this.acc = 0; this.i = 0; }
  step(dt) {
    const w = this.w; if (w.phase !== 'play') return;
    this.acc += dt; const per = 1 / this.hz;
    while (this.acc >= per) { this.acc -= per; w.tapHole(this.i % w.holes.length); this.i++; }
  }
}
/** (c2) tap everything that appears, the moment it is tappable, regardless of colour */
class TapEverything {
  constructor(w, rng, o) { this.w = w; this.r = rng; this.done = {}; this.react = (o && o.react) || 0.15; this.pending = {}; this.t = 0; }
  step(dt) {
    const w = this.w; this.t += dt; if (w.phase !== 'play') return;
    for (let i = 0; i < w.holes.length; i++) {
      const c = w.holes[i].critter;
      if (!live(c) || c.h < 0.25 || this.done[c.id]) continue;
      if (this.pending[c.id] === undefined) this.pending[c.id] = this.t + this.react;
      if (this.t >= this.pending[c.id]) { const r = w.tapHole(i); if (r !== 'busy') this.done[c.id] = true; }
    }
  }
}
/** (c3) pre-tap: hammer burrows that look EMPTY right now (hoping to catch the next pop as it rises) */
class PreTapEmpty {
  constructor(w, rng, o) { this.w = w; this.r = rng; this.hz = (o && o.hz) || 8; this.acc = 0; }
  step(dt) {
    const w = this.w; if (w.phase !== 'play') return;
    this.acc += dt; const per = 1 / this.hz;
    while (this.acc >= per) {
      this.acc -= per;
      const free = []; for (let i = 0; i < w.holes.length; i++) { const c = w.holes[i].critter; if (!c || c.state === 'rise') free.push(i); }
      if (free.length) w.tapHole(this.r.pick(free));
    }
  }
}
/** (c4) "smart spam": taps every matching critter at once (honest colour check, instant) AND mashes empty burrows */
class SmartSpam {
  constructor(w, rng) { this.w = w; this.r = rng; this.acc = 0; }
  step(dt) {
    const w = this.w; if (w.phase !== 'play') return;
    for (let i = 0; i < w.holes.length; i++) { const c = w.holes[i].critter; if (live(c) && c.h >= 0.25 && c.colour === w.colour) w.tapHole(i); }
    this.acc += dt; while (this.acc >= 0.1) { this.acc -= 0.1; const free = []; for (let i = 0; i < w.holes.length; i++) if (!w.holes[i].critter) free.push(i); if (free.length) w.tapHole(this.r.pick(free)); }
  }
}
class Idle { constructor() {} step() {} }
class BotP { constructor(w, rng, o, Z, seed) { this.b = new Z.Bot(w, { skill: o.skill, seed }); } step(dt) { this.b.step(dt); } }

const MODELS = {
  kid4: (w, r) => new Human(w, r, KID4),
  parent: (w, r) => new Human(w, r, PARENT),
  mash: (w, r) => new MashAll(w, r, { hz: 8 }),
  mash4: (w, r) => new MashAll(w, r, { hz: 4 }),
  tapAll: (w, r) => new TapEverything(w, r),
  preTap: (w, r) => new PreTapEmpty(w, r, { hz: 8 }),
  smartSpam: (w, r) => new SmartSpam(w, r),
  kidSpam: (w, r) => new Human(w, r, Object.assign({}, KID4, { impulse: 1, farImpulse: 1, focus: 1 })),   // a 4-year-old who ignores colour
  idle: () => new Idle(),
};

// ------------------------------------------------------------------ one run
/**
 * opts: { model, skill (bot), diff, seed, cap (s), stopAtLevel (stop once level ≥ n), patch-loaded Z }
 * returns metrics
 */
function run(Z, opts) {
  const w = new Z.World({ seed: opts.seed, difficulty: opts.diff });
  const prng = new Z.RNG('player-' + opts.seed);
  const pl = opts.model === 'bot' ? new BotP(w, prng, { skill: opts.skill }, Z, opts.seed * 7 + 1) : MODELS[opts.model](w, prng);
  const dt = 1 / 60, cap = opts.cap || 300;
  let t = 0, firstBoop = -1, lastPop = 0, maxPopGap = 0, maxNoMatch = 0, colourT = -1e9, prevColour = -1, nan = false;
  const taps = { match: 0, wrong: 0, empty: 0, busy: 0, none: 0 };
  const wrongAfter = { lt1: 0, b1_2: 0, b2_3: 0, gt3: 0, stale: 0 };
  let colourChanges = 0, timeoutChanges = 0, firstLeafLostT = -1, overT = -1, clearT0 = -1, leafHist = [];
  // wrap tapHole to count answers + colour-change fairness
  const orig = w.tapHole.bind(w);
  // opts.guard = PROTOTYPE of a code-side "mash guard" (not CONFIG): `n` empty taps within `win` s → Zippy naps for
  // `nap` s (taps answer 'busy'; no leaf lost). Lets the report show what such a rule would do.
  const G = opts.guard, empties = []; let napUntil = -1;
  w.tapHole = function (i) {
    if (G && t < napUntil) { taps.busy++; return 'busy'; }
    const c = w.holes[i] && w.holes[i].critter, col = c ? c.colour : -1;
    const r = orig(i); taps[r] = (taps[r] || 0) + 1;
    if (G && r === 'empty') { empties.push(t); while (empties.length && t - empties[0] > G.win) empties.shift(); if (empties.length >= G.n) { napUntil = t + G.nap; empties.length = 0; } }
    if (r === 'wrong') {
      const since = t - colourT;
      if (since < 1) wrongAfter.lt1++; else if (since < 2) wrongAfter.b1_2++; else if (since < 3) wrongAfter.b2_3++; else wrongAfter.gt3++;
      if (col === prevColour && since < 4) wrongAfter.stale++;
    }
    return r;
  };
  let lastBoopsT = 0, lastBoops = 0;
  while (w.phase !== 'over' && t < cap) {
    pl.step(dt); w.update(dt); t += dt;
    for (const e of w.drainEvents()) {
      if (e.type === 'pop') { if (!w.clearing) maxPopGap = Math.max(maxPopGap, t - lastPop); lastPop = t; }
      else if (e.type === 'levelUp') lastPop = t;
      else if (e.type === 'boop' && firstBoop < 0) firstBoop = t;
      else if (e.type === 'colour') { colourChanges++; colourT = t; prevColour = e.from; if (w.sinceBoop === 0 && t - lastBoopsT > 10) timeoutChanges++; }
      else if (e.type === 'leafLost' && firstLeafLostT < 0) firstLeafLostT = t;
      else if (e.type === 'gameOver') overT = t;
    }
    if (w.boops !== lastBoops) { lastBoops = w.boops; lastBoopsT = t; }
    if (w.phase === 'play' && !w.clearing) maxNoMatch = Math.max(maxNoMatch, w.noMatchT);
    if (!isFinite(w.zippy.x) || !isFinite(w.zippy.y)) nan = true;
    if (opts.stopAtLevel !== undefined && w.level >= opts.stopAtLevel) break;
  }
  return {
    t, over: w.phase === 'over', score: w.score, level: w.level, boops: w.boops, leaves: w.leaves,
    levelTimes: w.stats.levelTimes.slice(), firstBoop, firstLeafLostT, bestCombo: w.stats.bestCombo,
    taps, wrongAfter, colourChanges, timeoutChanges, maxPopGap, maxNoMatch, nan, missed: w.stats.missed,
    pauses: pl.pauses || 0
  };
}

// ------------------------------------------------------------------ stats helpers
const sorted = a => [...a].sort((x, y) => x - y);
function pct(a, q) { if (!a.length) return NaN; const b = sorted(a); return b[Math.min(b.length - 1, Math.floor(q * b.length))]; }
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
const f0 = x => isFinite(x) ? x.toFixed(0) : '–';
const f1 = x => isFinite(x) ? x.toFixed(1) : '–';

module.exports = { load, run, MODELS, KID4, PARENT, pct, mean, f0, f1 };
