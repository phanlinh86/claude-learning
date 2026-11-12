// Bo's Farm Parade — headless playtest harness (report-only; never edits game code).
//   const L = require('./lib'); const w = L.mkWorld({ age, lang, vp, seed, config }); const kid = L.makeModel('typical', w, age, seed);
//   each frame: kid.step(dt); w.update(dt); for (const e of w.drainEvents()) kid.onEvent(e);
// Loads rng / content / world / bot into node and drives ONLY the public input API (pointerDown / pointerMove / pointerUp,
// cancelDrag, talkAnswer) like a finger: a tap = press + lift; a flick = press on the path, a short slide onto a member, lift.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { resolve } = require('../unit/load');

function loadFP() {
  // runInThisContext (not a vm sandbox): ≈ 2× faster for long sims; the sim process owns its global scope
  globalThis.window = globalThis;
  for (const f of ['rng.js', 'content.js', 'world.js', 'bot.js']) { const p = resolve(f); vm.runInThisContext(fs.readFileSync(p, 'utf8'), { filename: path.basename(p) }); }
  return globalThis.FP;
}
const FP = loadFP();

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
  const w = new FP.World({ seed: o.seed, age: o.age, lang: o.lang || 'en', config: o.config || {} });
  w.setViewport(vp.W, vp.H, vp.ins);
  return w;
}

/** One finger. gesture(x0, y0, x1, y1, T, hold) presses at once (→ the pointerDown result), slides for T s (≈ 60 Hz moves with a
 *  little tremor), holds `hold` s and lifts. T = 0 → a tap. */
class Finger {
  constructor(w, r) { this.w = w; this.r = r; this.g = null; }
  get busy() { return !!this.g; }
  gesture(x0, y0, x1, y1, T, hold, o) {
    o = o || {};
    const d = this.w.pointerDown(x0, y0);
    this.g = { x0, y0, x1, y1, T: Math.max(0, T), hold: hold || 0, t: 0, mt: 0, trem: o.tremor || 0, slipAt: o.slip ? this.r.float(0.02, 0.1) : -1, x: x0, y: y0 };
    return d || 'none';
  }
  cancel() { if (this.g) { this.w.cancelDrag(); this.g = null; } }
  step(dt) {
    const g = this.g;
    if (!g) return null;
    g.t += dt; g.mt += dt;
    if (g.T > 0) {
      const u = clamp(g.t / g.T, 0, 1);
      const x = g.x0 + (g.x1 - g.x0) * u + this.r.float(-g.trem, g.trem), y = g.y0 + (g.y1 - g.y0) * u + this.r.float(-g.trem, g.trem);
      if (g.mt >= 1 / 60 - 1e-9 && g.t <= g.T + 1 / 60) { g.mt = 0; g.x = x; g.y = y; this.w.pointerMove(x, y); }
    }
    if (g.slipAt >= 0 && g.t >= g.slipAt) { this.cancel(); return 'slip'; }
    if (g.t < g.T + g.hold) return null;
    this.g = null;
    return this.w.pointerUp(g.x, g.y) || 'none';
  }
}

/* ---------------------------------------------------------------- child models
 * After an `ask` the kid listens to Bo (prompt ≈ 2.6 s) and thinks U(think) s; between tries U(between) s; sometimes looks away
 * U(distract) s (p = pDistract). Picks the odd one with p = skill (a glowing hint: p = followHint), else another standing member.
 * Touch: a tap at the centre ± aim × r, held U(hold) s; with p = pFlick a flick from the path below. Curiosity: p = pPoke presses
 * Bo / empty ground. Gate: after U(gateT) s taps the doors (p = pGateTap; sometimes a member, which opens them too), else waits
 * for the auto-open. Surprises: taps them with p = pSurprise. Talk: answers after U(talk) s. */
const SKILL = { 3: 0.72, 4: 0.82, 5: 0.86, 6: 0.88, 7: 0.9 };
const THINK = { 3: [1.6, 3.2], 4: [1.3, 2.6], 5: [1.1, 2.3], 6: [1.0, 2.2], 7: [1.0, 2.0] };
const BETWEEN = { 3: [0.9, 1.9], 4: [0.8, 1.6], 5: [0.7, 1.4], 6: [0.6, 1.2], 7: [0.5, 1.1] };
const AIM = { 3: 0.75, 4: 0.6, 5: 0.5, 6: 0.4, 7: 0.35 };   // × hit radius
function typicalProfile(age) {
  return { skill: SKILL[age], think: THINK[age], between: BETWEEN[age], aim: AIM[age], hold: [0.04, 0.3], tremor: age <= 3 ? 3 : 1.5,
    followHint: 0.92, pDistract: age <= 4 ? 0.07 : 0.04, distract: [3, 9], pFlick: 0.15, pPoke: age <= 4 ? 0.06 : 0.03, pSlip: age <= 3 ? 0.03 : 0.015,
    pSurprise: 0.7, talk: [3, 6], talkRight: Math.min(0.95, SKILL[age] + 0.05), prompt: 2.6, pGateTap: 0.8, gateT: [1.2, 3.2] };
}
function slowProfile() {
  return Object.assign(typicalProfile(3), { skill: 0.6, think: [2.8, 6], between: [1.6, 3.4], aim: 1.0, hold: [0.1, 0.8], tremor: 5, followHint: 0.8,
    pDistract: 0.15, distract: [4, 12], pFlick: 0.05, pPoke: 0.12, pSlip: 0.06, talk: [4, 9], talkRight: 0.6, pGateTap: 0.5, gateT: [2, 4.5] });
}
function perfectProfile(age) {
  return Object.assign(typicalProfile(age), { skill: 1, think: [0.8, 1.2], between: [0.4, 0.7], aim: 0.1, hold: [0.04, 0.08], tremor: 0, followHint: 1,
    pDistract: 0, pFlick: 0, pPoke: 0, pSlip: 0, talk: [1, 2], talkRight: 1, pGateTap: 1, gateT: [0.5, 0.9] });
}

class Kid {
  constructor(w, prof, seed) {
    this.w = w; this.p = prof; this.r = new FP.RNG(seed); this.f = new Finger(w, this.r);
    this.t = -1; this.talkT = -1; this.key = ''; this.surp = {}; this.gateKey = ''; this.gateT = -1; this.gateMode = '';
    this.stats = { taps: 0, flicks: 0, pokes: 0, slips: 0, surprise: 0, gateTaps: 0, gateWaits: 0 };
  }
  rf(a) { return this.r.float(a[0], a[1]); }
  onEvent(e) {
    if (e.type === 'ask') this.t = this.p.prompt + this.rf(this.p.think);
    if (e.type === 'idle' || e.type === 'hint' || e.type === 'wrong') this.t = Math.min(this.t, this.p.prompt * 0.6 + this.rf(this.p.between));   // Bo speaks again
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
  standing() { return this.w.members.filter(m => m.state === 'stand'); }
  tap(x, y) { this.stats.taps++; return this.f.gesture(x, y, x, y, 0, this.rf(this.p.hold), { slip: this.r.chance(this.p.pSlip) }); }
  tapMember(m) {
    const h = this.w.memberHit(m.id), r = this.r, a = this.p.aim * h.r, ang = r.float(0, Math.PI * 2), d = a * Math.sqrt(r.next());
    return this.tap(h.x + Math.cos(ang) * d, h.y + Math.sin(ang) * d);
  }
  flickMember(m) {
    const h = this.w.memberHit(m.id), r = this.r, x0 = h.x + r.float(-0.3, 0.3) * h.r, y0 = h.y + h.r + r.float(4, 30);
    this.stats.flicks++;
    return this.f.gesture(x0, y0, h.x + r.float(-0.2, 0.2) * h.r, h.y, r.float(0.06, 0.2), 0, { tremor: this.p.tremor });
  }
  surprises() {
    const w = this.w, r = this.r, p = this.p, key = w.level + ':' + w.round;
    if (key !== this.key) { this.key = key; this.surp = { chick: r.chance(p.pSurprise), rooster: r.chance(p.pSurprise), firefly: r.chance(p.pSurprise) }; }
    for (const [k, fn] of [['chick', 'chickHit'], ['rooster', 'roosterHit'], ['firefly', 'fireflyHit']]) {
      const h = w[fn]();
      if (this.surp[k] && h && r.chance(0.04)) { this.surp[k] = false; this.stats.surprise++; this.tap(h.x + r.float(-0.5, 0.5) * h.r, h.y + r.float(-0.5, 0.5) * h.r); return true; }
    }
    return false;
  }
  gate(dt) {
    const w = this.w, r = this.r, p = this.p, key = w.level + ':' + w.round;
    if (this.gateKey !== key) { this.gateKey = key; this.gateT = this.rf(p.gateT); this.gateMode = r.chance(p.pGateTap) ? 'tap' : 'wait'; if (this.gateMode === 'wait') this.stats.gateWaits++; }
    if (this.gateMode === 'wait') return;
    this.gateT -= dt;
    if (this.gateT > 0) return;
    this.gateMode = 'wait'; this.stats.gateTaps++;
    if (r.chance(0.8)) { const d = w.doorHit(); this.tap(d.cx + r.float(-0.4, 0.4) * d.w, d.cy + r.float(-0.4, 0.4) * d.h); }
    else { const s = this.standing(); if (s.length) this.tapMember(r.pick(s)); }
  }
  act() {
    const w = this.w, r = this.r, p = this.p, a = w.answer();
    if (!a || !a.member) return;
    const glow = !!w.hintHand || !!w.assistId;
    if (!glow && r.chance(p.pPoke)) {   // presses Bo or the empty path
      this.stats.pokes++;
      const L = w.layout;
      if (r.chance(0.5)) { const b = w.boHit(); this.tap(b.cx, b.cy); }
      else this.tap(r.float(L.line.x0, L.line.x1), r.float(L.line.y + 40, L.groundY - 4));
      return;
    }
    let m = w.memberById(a.member);
    if (!r.chance(glow ? p.followHint : p.skill)) { const o = this.standing().filter(q => q.id !== m.id); if (o.length) m = r.pick(o); }
    if (m.state !== 'stand') return;
    if (r.chance(p.pFlick)) this.flickMember(m); else this.tapMember(m);
  }
  step(dt) {
    const w = this.w, p = this.p;
    if (w.state === 'talk') { this.f.cancel(); return this.talk(dt); }
    this.talkT = -1;
    if (w.state !== 'round' && w.state !== 'roundDone') { this.f.cancel(); return; }
    if (this.f.busy) { if (this.f.step(dt) === 'slip') this.stats.slips++; return; }
    const a = w.answer();
    if (a && a.door) return this.gate(dt);
    if (this.surprises()) return;
    if (!w.interactive) return;
    if (this.t < 0) this.t = this.rf(p.between);
    this.t -= dt;
    if (this.t > 0) return;
    if (this.r.chance(p.pDistract)) { this.t = this.rf(p.distract); return; }
    this.t = this.rf(p.between);
    this.act();
  }
}

/** Random tapper: presses random points (half on the line band, half anywhere) every U(0.6, 1.8) s; sometimes a short slide. */
class Tapper extends Kid {
  step(dt) {
    const w = this.w, r = this.r;
    if (w.state === 'talk') return this.talk(dt);
    if (w.state !== 'round' && w.state !== 'roundDone') { this.f.cancel(); return; }
    if (this.f.busy) { this.f.step(dt); return; }
    if (this.t < 0) this.t = r.float(0.6, 1.8);
    this.t -= dt; if (this.t > 0) return;
    this.t = r.float(0.6, 1.8);
    const L = w.layout, B = L.band, hs = this.standing();
    let x, y;
    if (hs.length && r.chance(0.35)) { const h = w.memberHit(r.pick(hs).id); x = h.x + r.float(-1, 1) * h.r; y = h.y + r.float(-1, 1) * h.r; }
    else if (r.chance(0.5)) { x = r.float(B.x, B.x + B.w); y = r.float(B.y, B.y + B.h); }
    else { x = r.float(L.ins.left, L.W - L.ins.right); y = r.float(L.ins.top, L.H - L.ins.bottom); }
    const slide = r.chance(0.4);
    this.stats.taps++;
    this.f.gesture(x, y, x + (slide ? r.float(-250, 250) : 0), y + (slide ? r.float(-120, 120) : 0), slide ? r.float(0.1, 0.6) : 0, r.float(0.03, 0.2), { tremor: 3 });
  }
}
/** Spammer: 6 presses per second on random members / the band, never waits for Bo. */
class Spammer extends Kid {
  step(dt) {
    const w = this.w, r = this.r;
    if (w.state === 'talk') return this.talk(dt);
    if (w.state !== 'round' && w.state !== 'roundDone') { this.f.cancel(); return; }
    if (this.f.busy) { this.f.step(dt); return; }
    if (this.t < 0) this.t = r.float(0.14, 0.19);
    this.t -= dt; if (this.t > 0) return;
    this.t = r.float(0.14, 0.19);
    const hs = this.standing(), B = w.layout.band;
    let x, y;
    if (hs.length && r.chance(0.7)) { const h = w.memberHit(r.pick(hs).id); x = h.x + r.float(-20, 20); y = h.y + r.float(-20, 20); }
    else { x = r.float(B.x, B.x + B.w); y = r.float(B.y, B.y + B.h); }
    this.stats.taps++;
    this.f.gesture(x, y, x + r.float(-8, 8), y + r.float(-8, 8), r.float(0.02, 0.06), 0);
  }
}
/** Never touches the screen: a round waits for the child (no fail state, no auto-play in play); idle nudges + hints must keep
 *  coming at 12 → 18 → 27 → 30 s and nothing may break. */
class Absent { constructor(w) { this.w = w; this.stats = {}; } step() {} onEvent() {} }
class BotModel {
  constructor(w, skill, seed) { this.b = new FP.Bot(w, { skill, seed }); this.stats = this.b.stats; }
  step(dt) { this.b.step(dt); } onEvent(e) { this.b.onEvent(e); }
}

function makeModel(name, w, age, seed) {
  if (name === 'typical') return new Kid(w, typicalProfile(age), seed);
  if (name === 'slow3') return new Kid(w, slowProfile(), seed);
  if (name === 'perfect') return new Kid(w, perfectProfile(age), seed);
  if (name === 'tapper') return new Tapper(w, typicalProfile(age), seed);
  if (name === 'spammer') return new Spammer(w, typicalProfile(age), seed);
  if (name === 'absent') return new Absent(w);
  if (name === 'flicky') return new Kid(w, Object.assign(typicalProfile(age), { pFlick: 0.8 }), seed);   // a typical child who mostly flicks
  if (/^bot/.test(name)) return new BotModel(w, name.length > 3 && isFinite(+name.slice(3)) ? +name.slice(3) : 0.8, seed);
  throw new Error('unknown model ' + name);
}

module.exports = { FP, VIEWPORTS, mkWorld, makeModel, Finger, Kid, clamp, mean, pct, f1, typicalProfile, slowProfile, perfectProfile };
