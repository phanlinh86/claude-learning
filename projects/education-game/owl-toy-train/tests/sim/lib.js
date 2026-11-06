// Momo's Toy Train — headless playtest harness (report-only; never edits game code).
//   const L = require('./lib'); const w = L.mkWorld({ age, lang, vp, seed, config }); const kid = L.makeModel('typical', w, age, seed);
// Loads rng/content/world/bot into node and drives ONLY the public input API (pointerDown/Move/Up, talkAnswer) like a finger:
// every drag is a press, a pointerMove per frame along a path and a lift.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS = path.join(__dirname, '..', '..', 'game', 'js');
function loadTT() {
  // runInThisContext (not a vm sandbox): ≈ 2× faster for long sims; the sim process owns its global scope
  globalThis.window = globalThis;
  for (const f of ['rng.js', 'content.js', 'world.js', 'bot.js']) vm.runInThisContext(fs.readFileSync(path.join(JS, f), 'utf8'), { filename: f });
  return globalThis.TT;
}
const TT = loadTT();

// Logical viewports (short side 720) with safe-area insets converted from CSS px.
const VIEWPORTS = {
  iphoneP: { W: 720, H: 1556, ins: { top: 108, right: 0, bottom: 62, left: 0 } },
  iphoneL: { W: 1556, H: 720, ins: { top: 0, right: 108, bottom: 38, left: 108 } },
  ipadL:   { W: 960, H: 720, ins: { top: 32, right: 0, bottom: 27, left: 0 } },
  ipadP:   { W: 720, H: 960, ins: { top: 32, right: 0, bottom: 27, left: 0 } },
  ipadAir: { W: 1036, H: 720, ins: { top: 18, right: 0, bottom: 14, left: 0 } }
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const pct = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const f1 = x => (+x).toFixed(1);

function mkWorld(o) {
  const vp = VIEWPORTS[o.vp || 'ipadL'];
  const w = new TT.World({ seed: o.seed, age: o.age, lang: o.lang || 'en', config: o.config || {} });
  w.setViewport(vp.W, vp.H, vp.ins);
  return w;
}
function tapAt(w, x, y) { const id = w.pointerDown(x, y); const up = w.pointerUp(x, y); return up || id; }
const centre = b => ({ x: b.x, y: b.y });

/** A finger that carries out one gesture over several frames: press at (x0, y0), follow a smooth path to (x1, y1) over
 *  `dur` s (+ a sag `arc` px), hold `hold` s, lift. → the pointerUp result when done, else null. */
class Finger {
  constructor(w, r) { this.w = w; this.r = r; this.g = null; }
  get busy() { return !!this.g; }
  start(x0, y0, x1, y1, dur, hold, arc) {
    const res = this.w.pointerDown(x0, y0);
    this.g = { x0, y0, x1, y1, dur: Math.max(1e-3, dur), hold: hold || 0, arc: arc || 0, t: 0, res };
    return res;
  }
  cancel() { if (this.g) { this.w.cancelDrag(); this.g = null; } }
  step(dt) {
    const g = this.g;
    if (!g) return null;
    g.t += dt;
    const u = clamp(g.t / g.dur, 0, 1), s = u * u * (3 - 2 * u);
    const x = g.x0 + (g.x1 - g.x0) * s, y = g.y0 + (g.y1 - g.y0) * s - g.arc * Math.sin(Math.PI * s);
    this.w.pointerMove(x, y);
    if (g.t < g.dur + g.hold) return null;
    this.g = null;
    return this.w.pointerUp(x, y) || 'none';
  }
}

/* ---------------------------------------------------------------- child models
 * Kid: after the `ask` (Momo's prompt ≈ 2.5 s) it listens + thinks U(think) s, between cargo U(between) s, sometimes looks away
 * U(distract) s (p = pDistract). Picks a resting cargo (p = pTapFirst: first a quick tap to hear its name), drags it at
 * U(speed) px/s with a sag, to the right car with p = skill (a glowing hint: p = followHint), else a random other car (count:
 * a full car if any, else the right one). Release point: around the car's middle, U(dropUp) px above the car floor; with p =
 * pHigh it lets go U(high) px above the car top (> 90 px is outside the zone: a miss, the cargo floats home); with p = pSlip
 * it lets go half-way (a miss). Whistle: taps it U(whistle) s after `loaded` (p = pWhistleLate: waits for the nudge).
 * Surprises: taps the bunny / balloon with p = pSurprise. Talk: answers after U(talk), right with p = talkRight. */
const SKILL = { 3: 0.7, 4: 0.8, 5: 0.86, 6: 0.9, 7: 0.92 };
const THINK = { 3: [2.0, 3.6], 4: [1.7, 3.0], 5: [1.5, 2.7], 6: [1.3, 2.4], 7: [1.2, 2.2] };
const BETWEEN = { 3: [1.0, 2.2], 4: [0.8, 1.8], 5: [0.7, 1.5], 6: [0.6, 1.3], 7: [0.5, 1.2] };
const SPEED = { 3: [380, 650], 4: [450, 750], 5: [500, 850], 6: [550, 900], 7: [600, 950] };
function typicalProfile(age) {
  return { skill: SKILL[age], think: THINK[age], between: BETWEEN[age], speed: SPEED[age], hold: [0.05, 0.3], dropUp: [0, 60],
    followHint: 0.9, pDistract: age <= 4 ? 0.08 : 0.04, distract: [3, 9], pTapFirst: age <= 4 ? 0.12 : 0.05, pHigh: age <= 4 ? 0.1 : 0.05,
    high: [40, 130], pSlip: age <= 3 ? 0.06 : 0.03, whistle: [1.6, 3.6], pWhistleLate: age <= 4 ? 0.12 : 0.05, pSurprise: 0.7,
    talk: [3, 6], talkRight: Math.min(0.95, SKILL[age] + 0.05) };
}
function slowProfile() {
  return Object.assign(typicalProfile(3), { skill: 0.6, think: [3, 6.5], between: [1.8, 3.8], speed: [250, 480], hold: [0.1, 0.6], followHint: 0.8,
    pDistract: 0.15, distract: [4, 12], pTapFirst: 0.25, pHigh: 0.18, pSlip: 0.12, whistle: [2.5, 6], pWhistleLate: 0.3, talk: [4, 9], talkRight: 0.6 });
}
function highProfile(age) { return Object.assign(typicalProfile(age), { pHigh: 0.7, high: [50, 160], dropUp: [40, 120] }); }
function perfectProfile(age) {
  return Object.assign(typicalProfile(age), { skill: 1, think: [0.9, 1.4], between: [0.5, 0.9], speed: [800, 1000], pDistract: 0, pTapFirst: 0,
    pHigh: 0, pSlip: 0, whistle: [0.8, 1.2], pWhistleLate: 0, talk: [1, 2], talkRight: 1 });
}

class Kid {
  constructor(w, prof, seed) {
    this.w = w; this.p = prof; this.r = new TT.RNG(seed); this.f = new Finger(w, this.r);
    this.t = -1; this.talkT = -1; this.wT = -1; this.key = ''; this.surp = {}; this.pend = null;
    this.stats = { drags: 0, taps: 0, high: 0, slips: 0, surprise: 0, whistleTaps: 0 };
  }
  rf(a) { return this.r.float(a[0], a[1]); }
  onEvent(e) {
    if (e.type === 'ask') this.t = this.rf(this.p.think) + 2.5;
    if (e.type === 'loaded') this.wT = this.r.chance(this.p.pWhistleLate) ? this.p.whistle[1] + 6 + this.r.float(0, 2) : this.rf(this.p.whistle) + 1.5;
    if (e.type === 'whistleHint' && this.wT > 2.5) this.wT = this.r.float(1, 2.5);
  }
  talk(dt) {
    const w = this.w, r = this.r, p = this.p;
    if (w.talkAnswered || !w.talk) return;
    if (this.talkT < 0) this.talkT = this.rf(p.talk);
    this.talkT -= dt;
    if (this.talkT <= 0) {
      this.talkT = -1; const t = w.talk; let pick = t.answerId;
      if (!r.chance(t.glowAnswer ? 0.95 : p.talkRight)) { const wr = t.choices.filter(c => c.id !== t.answerId); if (wr.length) pick = r.pick(wr).id; }
      w.talkAnswer(pick);
    }
  }
  /** Where the finger lets go for this cargo (or null: nothing to do). */
  plan(it) {
    const w = this.w, r = this.r, p = this.p;
    const glow = w.hintHand && w.hintHand.itemId === it.id;
    const right = w.answerCarId(it.id);
    let car = right;
    if (!r.chance(glow ? p.followHint : p.skill)) {
      const others = w.cars.filter(c => c.id !== right && (w.cur.mode !== 'count' || c.reserved >= c.need));
      if (others.length) car = r.pick(others).id;
    }
    if (!car) return null;
    const b = w.carBox(car), x = b.x + r.float(-0.3, 0.3) * b.w;
    if (r.chance(p.pSlip)) { this.stats.slips++; return { x: (it.x + x) / 2, y: Math.min(it.y, b.y0) - 60 }; }
    if (r.chance(p.pHigh)) { this.stats.high++; return { x, y: b.y0 - this.rf(p.high) }; }
    return { x, y: b.floorY - this.rf(p.dropUp) };
  }
  step(dt) {
    const w = this.w, r = this.r, p = this.p;
    if (w.state === 'talk') { this.f.cancel(); return this.talk(dt); }
    this.talkT = -1;
    if (w.state !== 'round') { this.f.cancel(); return; }
    const key = w.level + ':' + w.round;
    if (key !== this.key) { this.key = key; this.surp = { hitch: r.chance(p.pSurprise), balloon: r.chance(p.pSurprise) }; }
    if (this.f.busy) { this.f.step(dt); return; }
    if (this.surp.hitch && w.hitch && w.hitch.state === 'ride') { this.surp.hitch = false; this.stats.surprise++; tapAt(w, w.hitchHit().x, w.hitchHit().y); return; }
    if (this.surp.balloon && w.balloon && w.phase === 'load' && r.chance(0.02)) { this.surp.balloon = false; this.stats.surprise++; tapAt(w, w.balloonHit().x, w.balloonHit().y); return; }
    if (w.phase === 'whistle' || (w.phase === 'depart' && this.wT > 0)) {
      if (this.wT < 0) return;
      this.wT -= dt;
      if (this.wT <= 0) { this.wT = -1; this.stats.whistleTaps++; const b = w.whistleHit(); tapAt(w, b.x + r.float(-20, 20), b.y + r.float(-20, 20)); }
      return;
    }
    if (w.phase !== 'load') return;
    if (this.t < 0) this.t = this.rf(p.between);
    this.t -= dt;
    if (this.t > 0) return;
    if (r.chance(p.pDistract)) { this.t = this.rf(p.distract); return; }
    const its = w.items.filter(i => i.state === 'rest' && !i._bye);
    if (!its.length) { this.t = 0.3; return; }
    const glowing = its.find(i => w.hintHand && w.hintHand.itemId === i.id);
    const it = glowing && r.chance(0.8) ? glowing : r.pick(its);
    if (r.chance(p.pTapFirst)) { this.stats.taps++; this.f.start(it.x, it.y, it.x + r.float(-6, 6), it.y + r.float(-6, 6), r.float(0.08, 0.2), 0); this.t = r.float(0.6, 1.4); return; }
    const tg = this.plan(it);
    if (!tg) { this.t = 0.3; return; }
    const d = Math.hypot(tg.x - it.x, tg.y - it.y);
    this.stats.drags++;
    this.f.start(it.x + r.float(-20, 20), it.y + r.float(-20, 20), tg.x, tg.y, Math.max(0.35, d / this.rf(p.speed)), this.rf(p.hold), r.float(10, 50));
    this.t = this.rf(p.between);
  }
}

/** Random tapper: taps anywhere 2×/s (cargo, whistle, Momo, empty space); 35 % of the time drags a random cargo to a random car. */
class Tapper {
  constructor(w, seed) { this.w = w; this.r = new TT.RNG(seed); this.f = new Finger(w, this.r); this.t = 0.5; this.talkT = 3; this.stats = { taps: 0, drags: 0 }; }
  step(dt) {
    const w = this.w, r = this.r, L = w.layout;
    if (w.state === 'talk') { this.talkT -= dt; if (this.talkT <= 0 && !w.talkAnswered && w.talk) { this.talkT = r.float(3, 8); w.talkAnswer(r.pick(w.talk.choices).id); } return; }
    if (this.f.busy) { this.f.step(dt); return; }
    this.t -= dt;
    if (this.t > 0) return;
    this.t = r.float(0.3, 0.7);
    if (w.state !== 'round') return;
    const its = w.items.filter(i => i.state === 'rest');
    if (its.length && w.cars.length && r.chance(0.35)) {
      const it = r.pick(its), b = w.carBox(r.pick(w.cars).id);
      this.stats.drags++;
      this.f.start(it.x, it.y, b.x + r.float(-60, 60), b.floorY - r.float(0, 140), r.float(0.3, 0.9), r.float(0, 0.3), 30);
      return;
    }
    this.stats.taps++;
    const pick = r.int(0, 3);
    let pt;
    if (pick === 0 && its.length) pt = centre(w.itemHit(r.pick(its).id));
    else if (pick === 1) pt = centre(w.whistleHit());
    else if (pick === 2) pt = centre(w.momoHit());
    else pt = { x: r.float(0, L.W), y: r.float(0, L.H) };
    this.f.start(pt.x, pt.y, pt.x + r.float(-8, 8), pt.y + r.float(-8, 8), r.float(0.05, 0.25), 0);
  }
}

/** Spammer: grabs and flings cargo 3–4×/s (2–4 frames, released anywhere near the cars), hammers the whistle during the
 *  departure, taps Momo / the bunny / the balloon. */
class Spammer {
  constructor(w, seed) { this.w = w; this.r = new TT.RNG(seed); this.f = new Finger(w, this.r); this.t = 0; this.talkT = 1; this.stats = { flings: 0, taps: 0 }; }
  step(dt) {
    const w = this.w, r = this.r;
    if (w.state === 'talk') { this.talkT -= dt; if (this.talkT <= 0 && !w.talkAnswered && w.talk) { this.talkT = 1; w.talkAnswer(r.pick(w.talk.choices).id); } return; }
    if (this.f.busy) { this.f.step(dt); return; }
    this.t -= dt;
    if (this.t > 0 || w.state !== 'round') return;
    this.t = r.float(0.2, 0.35);
    if (w.phase === 'load') {
      const its = w.items.filter(i => i.state === 'rest' || i.state === 'home');
      if (its.length && r.chance(0.8)) {
        const it = r.pick(its), b = w.carBox(r.pick(w.cars).id);
        this.stats.flings++;
        this.f.start(it.x, it.y, b.x + r.float(-150, 150), b.y0 - r.float(-40, 160), r.float(0.05, 0.12), 0, 0);
        return;
      }
    }
    this.stats.taps++;
    const opts = [w.whistleHit(), w.momoHit(), w.hitchHit(), w.balloonHit()].filter(Boolean);
    const b = r.pick(opts);
    tapAt(w, b.x, b.y);
  }
}

/** Absent: never touches the screen (main auto-pauses on the 5th idle nudge; here we just record the nudges). */
class Absent { constructor() { this.stats = {}; } step() {} }

class BotModel {
  constructor(w, skill, seed) { this.b = new TT.Bot(w, { skill, seed }); this.stats = this.b.stats; }
  step(dt) { this.b.step(dt); }
}

function makeModel(name, w, age, seed) {
  if (name === 'typical') return new Kid(w, typicalProfile(age), seed);
  if (name === 'slow3') return new Kid(w, slowProfile(), seed);
  if (name === 'perfect') return new Kid(w, perfectProfile(age), seed);
  if (name === 'high') return new Kid(w, highProfile(age), seed);
  if (name === 'tapper') return new Tapper(w, seed);
  if (name === 'spammer') return new Spammer(w, seed);
  if (name === 'absent') return new Absent();
  if (/^bot/.test(name)) return new BotModel(w, +name.slice(3) || 0.8, seed);
  throw new Error('unknown model ' + name);
}

module.exports = { TT, VIEWPORTS, mkWorld, makeModel, Finger, Kid, tapAt, mean, pct, f1, clamp, typicalProfile, slowProfile, perfectProfile, highProfile };
