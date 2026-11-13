// Bao's Bubble Sky — headless playtest harness (report-only; never edits game code).
//   const L = require('./lib'); const w = L.mkWorld({ age, lang, vp, seed, config }); const kid = L.makeModel('typical', w, age, seed);
//   each frame: kid.step(dt); w.update(dt); for (const e of w.drainEvents()) kid.onEvent(e);
// Loads rng / content / bao_points / world / bot into node and drives ONLY the public input API (pointerDown / pointerMove /
// pointerUp, cancelDrag, talkAnswer) like a finger: a tap = press + lift.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { resolve } = require('../unit/load');

function loadPB() {
  // runInThisContext (not a vm sandbox): ≈ 2× faster for long sims; the sim process owns its global scope
  globalThis.window = globalThis;
  for (const f of ['rng.js', 'content.js', 'bao_points.js', 'world.js', 'bot.js']) { const p = resolve(f); if (fs.existsSync(p)) vm.runInThisContext(fs.readFileSync(p, 'utf8'), { filename: path.basename(p) }); }
  return globalThis.PB;
}
const PB = loadPB();

// Logical viewports (short side 720) with safe-area insets converted from CSS px.
const VIEWPORTS = {
  iphoneP: { W: 720, H: 1561, ins: { top: 108, right: 0, bottom: 62, left: 0 } },
  iphoneL: { W: 1561, H: 720, ins: { top: 0, right: 108, bottom: 38, left: 108 } },
  ipadL:   { W: 960, H: 720, ins: { top: 32, right: 0, bottom: 27, left: 0 } },
  ipadP:   { W: 720, H: 1036, ins: { top: 21, right: 0, bottom: 18, left: 0 } },
  ipadAir: { W: 1036, H: 720, ins: { top: 18, right: 0, bottom: 14, left: 0 } }
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const pct = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const f1 = x => (+x).toFixed(1);

function mkWorld(o) {
  const vp = VIEWPORTS[o.vp || 'ipadL'];
  const w = new PB.World({ seed: o.seed, age: o.age, lang: o.lang || 'en', config: o.config || {} });
  w.setViewport(vp.W, vp.H, vp.ins);
  return w;
}

/** One finger: gesture(x0, y0, x1, y1, T, hold) presses at once, slides for T s (≈ 60 Hz moves), holds `hold` s and lifts. */
class Finger {
  constructor(w, r) { this.w = w; this.r = r; this.g = null; }
  get busy() { return !!this.g; }
  gesture(x0, y0, x1, y1, T, hold) {
    const d = this.w.pointerDown(x0, y0);
    this.g = { x0, y0, x1, y1, T: Math.max(0, T), hold: hold || 0, t: 0, mt: 0, x: x0, y: y0 };
    return d || 'none';
  }
  cancel() { if (this.g) { this.w.cancelDrag(); this.g = null; } }
  step(dt) {
    const g = this.g;
    if (!g) return null;
    g.t += dt; g.mt += dt;
    if (g.T > 0 && g.mt >= 1 / 60 - 1e-9 && g.t <= g.T + 1 / 60) {
      const u = clamp(g.t / g.T, 0, 1); g.mt = 0; g.x = g.x0 + (g.x1 - g.x0) * u; g.y = g.y0 + (g.y1 - g.y0) * u; this.w.pointerMove(g.x, g.y);
    }
    if (g.t < g.T + g.hold) return null;
    this.g = null;
    return this.w.pointerUp(g.x, g.y) || 'none';
  }
}

/* ---------------------------------------------------------------- child models
 * After an `ask` the kid listens to Bao (prompt ≈ 2.6 s; the long chapter-first prompt ≈ 3.4 s) and thinks U(think) s; after a right
 * pop with more to go U(between) s; after a miss Bao talks again (≈ 2.4 s). Sometimes looks away U(distract) s (p = pDistract).
 * Picks a remaining target with p = skill (a glowing hint / assist: p = followHint), else a random other floating bubble.
 * Touch: the kid decides on the bubble's position NOW and the finger lands U(react) s later at that spot ± aim × r (bubbles drift:
 * a late tap can miss into the sky = a soft press). Curiosity: p = pPoke presses Bao / the empty sky. Surprises: taps them with
 * p = pSurprise. Talk: answers after U(talk) s. */
const SKILL = { 3: 0.72, 4: 0.82, 5: 0.86, 6: 0.88, 7: 0.9 };
const THINK = { 3: [1.6, 3.2], 4: [1.3, 2.6], 5: [1.1, 2.3], 6: [1.0, 2.2], 7: [1.0, 2.0] };
const BETWEEN = { 3: [0.9, 1.9], 4: [0.8, 1.6], 5: [0.7, 1.4], 6: [0.6, 1.2], 7: [0.5, 1.1] };
const AIM = { 3: 0.75, 4: 0.6, 5: 0.5, 6: 0.4, 7: 0.35 };   // × bubble radius
function typicalProfile(age) {
  return { skill: SKILL[age], think: THINK[age], between: BETWEEN[age], aim: AIM[age], react: [0.15, 0.35], hold: [0.04, 0.3],
    followHint: 0.92, pDistract: age <= 4 ? 0.07 : 0.04, distract: [3, 9], pPoke: age <= 4 ? 0.06 : 0.03,
    pSurprise: 0.7, talk: [3, 6], talkRight: Math.min(0.95, SKILL[age] + 0.05), prompt: 2.6, promptFirst: 3.4, wrongTalk: 2.4 };
}
function slowProfile() {
  return Object.assign(typicalProfile(3), { skill: 0.6, think: [2.8, 6], between: [1.6, 3.4], aim: 1.0, react: [0.25, 0.6], hold: [0.1, 0.8], followHint: 0.8,
    pDistract: 0.15, distract: [4, 12], pPoke: 0.12, talk: [4, 9], talkRight: 0.6 });
}
function perfectProfile(age) {
  return Object.assign(typicalProfile(age), { skill: 1, think: [0.8, 1.2], between: [0.4, 0.7], aim: 0.1, react: [0.1, 0.15], hold: [0.04, 0.08], followHint: 1,
    pDistract: 0, pPoke: 0, talk: [1, 2], talkRight: 1 });
}

class Kid {
  constructor(w, prof, seed) {
    this.w = w; this.p = prof; this.r = new PB.RNG(seed); this.f = new Finger(w, this.r);
    this.t = -1; this.talkT = -1; this.key = ''; this.surp = {}; this.pending = null;
    this.stats = { taps: 0, pokes: 0, surprise: 0, lateMiss: 0 };
  }
  rf(a) { return this.r.float(a[0], a[1]); }
  onEvent(e) {
    const p = this.p;
    if (e.type === 'ask') this.t = (e.chapterFirst ? p.promptFirst : p.prompt) + this.rf(p.think);
    if (e.type === 'right' && e.left > 0) this.t = this.rf(p.between);
    if (e.type === 'wrong' || e.type === 'idle' || e.type === 'hint') this.t = Math.min(this.t < 0 ? 1e9 : this.t, p.wrongTalk * 0.6 + this.rf(p.between));
  }
  talk(dt) {
    const w = this.w, r = this.r, p = this.p;
    if (w.talkAnswered || !w.talk) return;
    if (this.talkT < 0) this.talkT = this.rf(p.talk);
    this.talkT -= dt;
    if (this.talkT <= 0) {
      this.talkT = -1; const t = w.talk; let pick = t.answer;
      if (!r.chance(t.glowAnswer ? 0.95 : p.talkRight)) { const wr = t.choices.filter(c => c.id !== t.answer); if (wr.length) pick = r.pick(wr).id; }
      w.talkAnswer(pick);
    }
  }
  floating() { return this.w.bubbles.filter(b => b.state === 'float'); }
  tap(x, y) { this.stats.taps++; return this.f.gesture(x, y, x, y, 0, this.rf(this.p.hold)); }
  /** Decide on bubble b now; the finger lands after the reaction time where b WAS (± aim). */
  aimAt(b) {
    const r = this.r, a = this.p.aim * b.r, ang = r.float(0, Math.PI * 2), d = a * Math.sqrt(r.next());
    this.pending = { x: b.x + Math.cos(ang) * d, y: b.y + Math.sin(ang) * d, t: this.rf(this.p.react), id: b.id };
  }
  surprises() {
    const w = this.w, r = this.r, p = this.p, key = w.level + ':' + w.round;
    if (key !== this.key) { this.key = key; this.surp = { bird: r.chance(p.pSurprise), kite: r.chance(p.pSurprise), snow: r.chance(p.pSurprise) }; }
    for (const [k, fn] of [['bird', 'birdHit'], ['kite', 'kiteHit'], ['snow', 'snowHit']]) {
      const h = w[fn]();
      if (this.surp[k] && h && r.chance(0.04)) { this.surp[k] = false; this.stats.surprise++; this.tap(h.x, h.y); return true; }
    }
    return false;
  }
  act() {
    const w = this.w, r = this.r, p = this.p, a = w.answer();
    if (!a) return;
    const glow = !!w.hintHand || !!w.assistId;
    if (!glow && r.chance(p.pPoke)) {   // presses Bao or the empty sky
      this.stats.pokes++;
      const L = w.layout;
      if (r.chance(0.5)) { const b = w.baoHit(); this.tap(b.cx, b.cy); }
      else this.tap(r.float(L.ins.left + 30, L.W - L.ins.right - 30), r.float(L.walls.y0 + 10, L.groundY - 10));
      return;
    }
    let b = w.bubbleById(a.bubble);
    if (!r.chance(glow ? p.followHint : p.skill)) { const tg = w.targets(), o = this.floating().filter(q => !tg.includes(q.id)); if (o.length) b = r.pick(o); }
    if (b && b.state === 'float') this.aimAt(b);
  }
  step(dt) {
    const w = this.w, p = this.p;
    if (w.state === 'talk') { this.f.cancel(); this.pending = null; return this.talk(dt); }
    this.talkT = -1;
    if (w.state !== 'round' && w.state !== 'roundDone') { this.f.cancel(); this.pending = null; return; }
    if (this.f.busy) { this.f.step(dt); return; }
    if (this.pending) {
      this.pending.t -= dt;
      if (this.pending.t <= 0) { const q = this.pending; this.pending = null; const d = this.tap(q.x, q.y); if (d === 'soft') this.stats.lateMiss++; }
      return;
    }
    if (this.surprises()) return;
    if (!w.interactive) return;
    if (this.t < 0) this.t = this.rf(p.between);
    this.t -= dt;
    if (this.t > 0) return;
    if (this.r.chance(p.pDistract)) { this.t = this.rf(p.distract); return; }
    this.t = this.rf(p.between) + 1.2;   // if nothing else happens (a soft miss), look again a bit later
    this.act();
  }
}

/** Random tapper: presses random points (a third on bubbles, the rest anywhere) every U(0.6, 1.8) s; sometimes a short slide. */
class Tapper extends Kid {
  step(dt) {
    const w = this.w, r = this.r;
    if (w.state === 'talk') return this.talk(dt);
    if (w.state !== 'round' && w.state !== 'roundDone') { this.f.cancel(); return; }
    if (this.f.busy) { this.f.step(dt); return; }
    if (this.t < 0) this.t = r.float(0.6, 1.8);
    this.t -= dt; if (this.t > 0) return;
    this.t = r.float(0.6, 1.8);
    const L = w.layout, fl = this.floating();
    let x, y;
    if (fl.length && r.chance(0.35)) { const b = r.pick(fl); x = b.x + r.float(-1, 1) * b.r; y = b.y + r.float(-1, 1) * b.r; }
    else { x = r.float(L.ins.left, L.W - L.ins.right); y = r.float(L.ins.top, L.H - L.ins.bottom); }
    const slide = r.chance(0.4);
    this.stats.taps++;
    this.f.gesture(x, y, x + (slide ? r.float(-250, 250) : 0), y + (slide ? r.float(-120, 120) : 0), slide ? r.float(0.1, 0.6) : 0, r.float(0.03, 0.2));
  }
}
/** Spammer: 6 presses per second on random bubbles / the field, never waits for Bao. */
class Spammer extends Kid {
  step(dt) {
    const w = this.w, r = this.r;
    if (w.state === 'talk') return this.talk(dt);
    if (w.state !== 'round' && w.state !== 'roundDone') { this.f.cancel(); return; }
    if (this.f.busy) { this.f.step(dt); return; }
    if (this.t < 0) this.t = r.float(0.14, 0.19);
    this.t -= dt; if (this.t > 0) return;
    this.t = r.float(0.14, 0.19);
    const fl = this.floating(), F = w.layout.field;
    let x, y;
    if (fl.length && r.chance(0.7)) { const b = r.pick(fl); x = b.x + r.float(-20, 20); y = b.y + r.float(-20, 20); }
    else { x = r.float(F.x0, F.x1); y = r.float(F.y0, F.y1); }
    this.stats.taps++;
    this.f.gesture(x, y, x + r.float(-8, 8), y + r.float(-8, 8), r.float(0.02, 0.06), 0);
  }
}
/** Never touches the screen: a round waits for the child (no fail state, no auto-play in play); idle nudges + hints keep coming. */
class Absent { constructor(w) { this.w = w; this.stats = {}; } step() {} onEvent() {} }
class BotModel {
  constructor(w, skill, seed) { this.b = new PB.Bot(w, { skill, seed }); this.stats = this.b.stats; }
  step(dt) { this.b.step(dt); } onEvent(e) { this.b.onEvent(e); }
}

/** typical (age profile) · kid<skill> (age profile, that skill, e.g. kid0.3) · slow3 · perfect · tapper · spammer · absent · bot<skill> */
function makeModel(name, w, age, seed) {
  if (name === 'typical') return new Kid(w, typicalProfile(age), seed);
  if (/^kid/.test(name)) return new Kid(w, Object.assign(typicalProfile(age), { skill: +name.slice(3) }), seed);
  if (name === 'slow3') return new Kid(w, slowProfile(), seed);
  if (name === 'perfect') return new Kid(w, perfectProfile(age), seed);
  if (name === 'tapper') return new Tapper(w, typicalProfile(age), seed);
  if (name === 'spammer') return new Spammer(w, typicalProfile(age), seed);
  if (name === 'absent') return new Absent(w);
  if (/^bot/.test(name)) return new BotModel(w, name.length > 3 && isFinite(+name.slice(3)) ? +name.slice(3) : 0.8, seed);
  throw new Error('unknown model ' + name);
}

module.exports = { PB, VIEWPORTS, mkWorld, makeModel, Finger, Kid, clamp, mean, pct, f1, typicalProfile, slowProfile, perfectProfile };
