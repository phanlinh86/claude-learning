// Nini's Sea Painting — headless playtest harness (report-only; never edits game code).
//   const L = require('./lib'); const w = L.mkWorld({ age, lang, vp, seed, config }); const kid = L.makeModel('typical', w, age, seed);
//   each frame: kid.step(dt); w.update(dt); for (const e of w.drainEvents()) kid.onEvent(e);
// Loads rng / pictures / content / world / bot into node and drives ONLY the public input API (pointerDown / pointerMove /
// pointerUp, talkAnswer) like a finger: every tap is a press, a hold of a few frames (with a little finger wobble) and a lift.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { resolve } = require('../unit/load');

function loadSP() {
  // runInThisContext (not a vm sandbox): ≈ 2× faster for long sims; the sim process owns its global scope
  globalThis.window = globalThis;
  for (const f of ['rng.js', 'pictures.js', 'content.js', 'world.js', 'bot.js']) { const p = resolve(f); vm.runInThisContext(fs.readFileSync(p, 'utf8'), { filename: path.basename(p) }); }
  return globalThis.SP;
}
const SP = loadSP();

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
  const w = new SP.World({ seed: o.seed, age: o.age, lang: o.lang || 'en', config: o.config || {} });
  w.setViewport(vp.W, vp.H, vp.ins);
  return w;
}

/** One finger: a tap = press at (x, y), hold `hold` s while drifting `drift` px, lift. → the pointerUp result (or the press result
 *  for the fishy / clam) when done. */
class Finger {
  constructor(w) { this.w = w; this.g = null; }
  get busy() { return !!this.g; }
  tap(x, y, hold, drift, ang) {
    const d = this.w.pointerDown(x, y);
    if (d === 'fishy' || d === 'clam' || d === null) { this.g = null; return d || 'none'; }
    this.g = { x, y, hold: Math.max(1 / 60, hold), drift: drift || 0, ang: ang || 0, t: 0 };
    return null;
  }
  cancel() { if (this.g) { this.w.cancelDrag(); this.g = null; } }
  step(dt) {
    const g = this.g;
    if (!g) return null;
    g.t += dt;
    const u = clamp(g.t / g.hold, 0, 1), x = g.x + Math.cos(g.ang) * g.drift * u, y = g.y + Math.sin(g.ang) * g.drift * u;
    this.w.pointerMove(x, y);
    if (g.t < g.hold) return null;
    this.g = null;
    return this.w.pointerUp(x, y) || 'none';
  }
}

/* ---------------------------------------------------------------- child models
 * After an `ask` the kid listens to Nini (prompt ≈ 2.4 s; the follow-up "now tap the shining tail" ≈ 1.4 s) and thinks
 * U(think) s; between taps of one step U(between) s (counting: U(countGap)). Sometimes looks away U(distract) s
 * (p = pDistract). Taps the right thing with p = skill (a glowing hint: p = followHint), else a plausible wrong one (another
 * shell / another part of the asked kind). Curiosity: p = pPoke taps a part that is not asked for (notThis / needPaint in
 * colour rounds: taps the picture before the paint); p = pAlready re-taps a painted spot. Fingers: hold U(hold) s with a
 * U(0, wobble) px drift; p = pDrag drags > 40 px (ignored by the game), p = pLong holds > 0.6 s (ignored). Tap points: the
 * part's safe point + U(±jitter) px (in picture px it stays inside the part + hitPad). Surprises: taps the fishy / the clam
 * with p = pSurprise. Talk: answers after U(talk) s, right with p = talkRight. */
const SKILL = { 3: 0.72, 4: 0.82, 5: 0.86, 6: 0.9, 7: 0.92 };
const THINK = { 3: [1.6, 3.2], 4: [1.3, 2.6], 5: [1.1, 2.3], 6: [1.0, 2.0], 7: [0.9, 1.8] };
const BETWEEN = { 3: [0.9, 1.9], 4: [0.8, 1.6], 5: [0.7, 1.4], 6: [0.6, 1.2], 7: [0.5, 1.1] };
const COUNTGAP = { 3: [0.9, 1.6], 4: [0.8, 1.4], 5: [0.6, 1.2], 6: [0.5, 1.0], 7: [0.45, 0.9] };
function typicalProfile(age) {
  return { skill: SKILL[age], think: THINK[age], between: BETWEEN[age], countGap: COUNTGAP[age], hold: [0.06, 0.25], wobble: age <= 3 ? 18 : 10,
    jitter: age <= 4 ? 16 : 10, followHint: 0.92, pDistract: age <= 4 ? 0.07 : 0.04, distract: [3, 9], pPoke: age <= 4 ? 0.08 : 0.04, pAlready: 0.05,
    pDrag: age <= 3 ? 0.04 : 0.02, pLong: age <= 3 ? 0.04 : 0.02, pSurprise: 0.7, talk: [3, 6], talkRight: Math.min(0.95, SKILL[age] + 0.05),
    prompt: 2.4, follow: 1.4 };
}
function slowProfile() {
  return Object.assign(typicalProfile(3), { skill: 0.6, think: [2.8, 6], between: [1.6, 3.4], countGap: [1.3, 2.6], hold: [0.1, 0.5], wobble: 26,
    jitter: 20, followHint: 0.8, pDistract: 0.15, distract: [4, 12], pPoke: 0.15, pAlready: 0.1, pDrag: 0.08, pLong: 0.08, talk: [4, 9], talkRight: 0.6 });
}
function perfectProfile(age) {
  return Object.assign(typicalProfile(age), { skill: 1, think: [0.8, 1.2], between: [0.4, 0.7], countGap: [0.35, 0.6], wobble: 0, jitter: 4,
    pDistract: 0, pPoke: 0, pAlready: 0, pDrag: 0, pLong: 0, talk: [1, 2], talkRight: 1 });
}

class Kid {
  constructor(w, prof, seed) {
    this.w = w; this.p = prof; this.r = new SP.RNG(seed); this.f = new Finger(w);
    this.t = -1; this.talkT = -1; this.key = ''; this.surp = {};
    this.stats = { taps: 0, drags: 0, longs: 0, pokes: 0, surprise: 0 };
  }
  rf(a) { return this.r.float(a[0], a[1]); }
  onEvent(e) {
    if (e.type === 'ask') this.t = (e.follow ? this.p.follow : this.p.prompt) + this.rf(e.follow ? this.p.between : this.p.think);
    if (e.type === 'idle' || e.type === 'hint') this.t = Math.min(this.t, this.p.prompt * 0.6 + this.rf(this.p.between));   // Nini speaks again → the child looks back
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
  jit(pt) { const j = this.p.jitter; return { x: pt.x + this.r.float(-j, j), y: pt.y + this.r.float(-j, j) }; }
  /** The point the child taps now (logical px). */
  aim() {
    const w = this.w, r = this.r, p = this.p, a = w.answer(), s = w.stepInfo;
    if (!a) return null;
    const glow = !!w.hintHand;
    if (!glow && r.chance(p.pPoke)) {   // curiosity: a part that is not asked for (or the picture before the paint)
      this.stats.pokes++;
      const others = w.parts.filter(q => !q.painted && (a.shell || q.id !== a.part) && q.role !== s.role);
      const any = others.length ? others : w.parts.filter(q => !q.painted);
      if (any.length) return this.jit(w.partTap(r.pick(any).id));
    }
    if (!glow && s.mode === 'count' && r.chance(p.pAlready)) { const done = w.parts.filter(q => q.painted && q.role === s.role); if (done.length) return this.jit(w.partTap(r.pick(done).id)); }
    if (r.chance(glow ? p.followHint : p.skill)) {
      if (a.shell) { const h = w.shellHit(a.shell); return { x: h.x + r.float(-30, 30), y: h.y + r.float(-30, 30) }; }
      // counting children tap the spots in no particular order
      if (s.mode === 'count') { const free = s.targets.filter(id => !w.st[id].painted); return this.jit(w.partTap(r.pick(free))); }
      return this.jit(w.partTap(a.part));
    }
    if (a.shell) { const o = w.shells.filter(q => q.color !== a.shell); if (o.length) { const h = w.shellHit(r.pick(o).color); return { x: h.x, y: h.y }; } }
    const same = w.parts.filter(q => q.role === s.role && !q.painted && s.targets.indexOf(q.id) < 0);
    if (same.length) return this.jit(w.partTap(r.pick(same).id));
    const any = w.parts.filter(q => !q.painted && q.id !== a.part);
    return any.length ? this.jit(w.partTap(r.pick(any).id)) : this.jit(w.partTap(a.part));
  }
  doTap(pt) {
    const r = this.r, p = this.p;
    this.stats.taps++;
    let hold = this.rf(p.hold), drift = r.float(0, p.wobble);
    if (r.chance(p.pDrag)) { drift = r.float(45, 120); this.stats.drags++; }
    else if (r.chance(p.pLong)) { hold = r.float(0.7, 1.4); this.stats.longs++; }
    this.f.tap(pt.x, pt.y, hold, drift, r.float(0, Math.PI * 2));
  }
  step(dt) {
    const w = this.w, r = this.r, p = this.p;
    if (w.state === 'talk') { this.f.cancel(); return this.talk(dt); }
    this.talkT = -1;
    if (w.state !== 'round') { this.f.cancel(); return; }
    if (this.f.busy) { this.f.step(dt); return; }
    const key = w.level + ':' + w.round;
    if (key !== this.key) { this.key = key; this.surp = { fishy: r.chance(p.pSurprise), clam: r.chance(p.pSurprise) }; }
    const fh = w.fishyHit();
    if (this.surp.fishy && fh && r.chance(0.04)) { this.surp.fishy = false; this.stats.surprise++; this.f.tap(fh.x + r.float(-20, 20), fh.y + r.float(-15, 15), 0.1, 0); return; }
    const ch = w.clamHit();
    if (this.surp.clam && ch && w.interactive && r.chance(0.006)) { this.surp.clam = false; this.stats.surprise++; this.f.tap(ch.x + r.float(-20, 20), ch.y, 0.1, 0); return; }
    if (!w.interactive) return;
    if (this.t < 0) this.t = this.rf(p.between);
    this.t -= dt;
    if (this.t > 0) return;
    if (r.chance(p.pDistract)) { this.t = this.rf(p.distract); return; }
    const pt = this.aim();
    const s = w.stepInfo;
    this.t = s && s.mode === 'count' ? this.rf(p.countGap) : this.rf(p.between);
    if (pt) this.doTap(pt);
  }
}

/** Random tapper: taps random points over the canvas / shells / water every U(0.6, 1.8) s (sometimes a drag). */
class Tapper extends Kid {
  step(dt) {
    const w = this.w, r = this.r;
    if (w.state === 'talk') return this.talk(dt);
    if (w.state !== 'round') return;
    if (this.f.busy) { this.f.step(dt); return; }
    if (this.t < 0) this.t = r.float(0.6, 1.8);
    this.t -= dt; if (this.t > 0) return;
    this.t = r.float(0.6, 1.8);
    const L = w.layout, C = L.canvas, k = r.next();
    let pt;
    if (k < 0.55) pt = { x: C.x + r.float(0, C.w), y: C.y + r.float(0, C.h) };
    else if (k < 0.8 && w.shells.length) { const s = r.pick(w.shells); pt = { x: s.x + r.float(-50, 50), y: s.y + r.float(-50, 50) }; }
    else pt = { x: r.float(L.ins.left, L.W - L.ins.right), y: r.float(L.ins.top, L.H - L.ins.bottom) };
    this.doTap(pt);
  }
}
/** Spammer: 3–4 taps per second on random parts / shells, never waits for Nini. */
class Spammer extends Kid {
  step(dt) {
    const w = this.w, r = this.r;
    if (w.state === 'talk') return this.talk(dt);
    if (w.state !== 'round') return;
    if (this.f.busy) { this.f.step(dt); return; }
    if (this.t < 0) this.t = r.float(0.25, 0.33);
    this.t -= dt; if (this.t > 0) return;
    this.t = r.float(0.25, 0.33);
    let pt = null;
    if (w.shells.length && r.chance(0.35)) { const s = r.pick(w.shells); pt = { x: s.x, y: s.y }; }
    else if (w.parts.length && w.picture && w.phase === 'paint') pt = this.jit(w.partTap(r.pick(w.parts).id));
    else { const C = w.layout.canvas; pt = { x: C.x + r.float(0, C.w), y: C.y + r.float(0, C.h) }; }
    this.f.tap(pt.x, pt.y, r.float(0.04, 0.1), r.float(0, 8), 0);
    this.stats.taps++;
  }
}
/** Never touches the screen: a round waits for the child (no fail state, no auto-play); idle nudges + hints must keep
 *  coming at 12 → 18 → 27 → 30 s and nothing may break. */
class Absent { constructor(w) { this.w = w; this.stats = {}; } step() {} onEvent() {} }
class BotModel {
  constructor(w, skill, seed) { this.b = new SP.Bot(w, { skill, seed }); this.stats = this.b.stats; }
  step(dt) { this.b.step(dt); } onEvent() {}
}

function makeModel(name, w, age, seed) {
  if (name === 'typical') return new Kid(w, typicalProfile(age), seed);
  if (name === 'slow3') return new Kid(w, slowProfile(), seed);
  if (name === 'perfect') return new Kid(w, perfectProfile(age), seed);
  if (name === 'tapper') return new Tapper(w, typicalProfile(age), seed);
  if (name === 'spammer') return new Spammer(w, typicalProfile(age), seed);
  if (name === 'absent') return new Absent(w);
  if (/^bot/.test(name)) return new BotModel(w, +name.slice(3) || 0.8, seed);
  throw new Error('unknown model ' + name);
}

module.exports = { SP, VIEWPORTS, mkWorld, makeModel, Finger, Kid, clamp, mean, pct, f1, typicalProfile, slowProfile, perfectProfile };
