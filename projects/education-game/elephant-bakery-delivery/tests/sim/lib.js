// Tupi's Bakery Delivery — headless playtest harness (report-only; never edits game code).
//   const L = require('./lib'); const w = L.mkWorld({ age, lang, vp, seed, config }); const kid = L.makeModel('typical', w, age, seed);
//   each frame: kid.step(dt); w.update(dt); for (const e of w.drainEvents()) kid.onEvent(e);
// Loads rng / content / tupi_points / world / bot into node and drives ONLY the public input API (pointerDown / pointerMove /
// pointerUp, cancelDrag, talkAnswer) like a finger.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { resolve } = require('../unit/load');

function loadBD() {
  // runInThisContext (not a vm sandbox): ≈ 2× faster for long sims; the sim process owns its global scope
  globalThis.window = globalThis;
  for (const f of ['rng.js', 'content.js', 'tupi_points.js', 'world.js', 'bot.js']) { const p = resolve(f); if (fs.existsSync(p)) vm.runInThisContext(fs.readFileSync(p, 'utf8'), { filename: path.basename(p) }); }
  return globalThis.BD;
}
const BD = loadBD();

// Logical viewports (short side 720) with safe-area insets converted from CSS px — the 6 shapes of the unit tests.
const VIEWPORTS = {
  iphoneP: { W: 720, H: 1556, ins: { top: 108, right: 0, bottom: 62, left: 0 } },
  iphoneL: { W: 1556, H: 720, ins: { top: 0, right: 108, bottom: 38, left: 108 } },
  ipadL:   { W: 960, H: 720, ins: { top: 32, right: 0, bottom: 27, left: 0 } },
  ipadP:   { W: 720, H: 960, ins: { top: 32, right: 0, bottom: 27, left: 0 } },
  ipadAirL: { W: 1036, H: 720, ins: { top: 18, right: 0, bottom: 14, left: 0 } },
  ipadAirP: { W: 720, H: 1036, ins: { top: 21, right: 0, bottom: 18, left: 0 } }
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const pct = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const f1 = x => (+x).toFixed(1);

function mkWorld(o) {
  const vp = VIEWPORTS[o.vp || 'ipadL'];
  const w = new BD.World({ seed: o.seed, age: o.age, lang: o.lang || 'en', config: o.config || {} });
  w.setViewport(vp.W, vp.H, vp.ins);
  return w;
}

/** One finger. path(points, speed, hold): presses at points[0], slides along the polyline at `speed` px/s (moves every 1/60 s, ±wobble
 *  across), holds `hold` s at the end and lifts. stopAt (0..1): lifts early at that fraction of the way. */
class Finger {
  constructor(w, rng) { this.w = w; this.r = rng; this.g = null; }
  get busy() { return !!this.g; }
  tap(x, y, hold) { const d = this.w.pointerDown(x, y); this.g = { pts: [[x, y]], i: 0, speed: 1, hold: hold || 0.08, t: 0, mt: 0, x, y, wob: 0, ph: 0, cum: 0, total: 0 }; return d || 'none'; }
  path(pts, speed, hold, wob, stopAt) {
    const d = this.w.pointerDown(pts[0][0], pts[0][1]);
    let total = 0; for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    this.g = { pts, i: 0, speed, hold: hold || 0, t: 0, mt: 0, x: pts[0][0], y: pts[0][1], wob: wob || 0, ph: this.r.float(0, 6.28), cum: 0, total, stop: stopAt || 2, held: 0 };
    return d || 'none';
  }
  cancel() { if (this.g) { this.w.cancelDrag(); this.g = null; } }
  step(dt) {
    const g = this.g;
    if (!g) return null;
    g.t += dt; g.mt += dt;
    if (g.mt >= 1 / 60 - 1e-9 && g.i < g.pts.length - 1 && g.cum < g.stop * g.total) {
      let left = g.speed * g.mt; g.mt = 0;
      while (left > 0 && g.i < g.pts.length - 1) {
        const [ax, ay] = [g.x, g.y], [bx, by] = g.pts[g.i + 1], d = Math.hypot(bx - ax, by - ay);
        if (d <= left) { left -= d; g.cum += d; g.i++; g.x = bx; g.y = by; } else { g.x += (bx - ax) * left / d; g.y += (by - ay) * left / d; g.cum += left; left = 0; }
      }
      const j = Math.min(g.pts.length - 1, g.i + 1), tx = g.pts[j][0] - g.x, ty = g.pts[j][1] - g.y, tl = Math.hypot(tx, ty) || 1, wb = g.wob * Math.sin(g.ph + g.t * 4.7);
      this.w.pointerMove(g.x - ty / tl * wb, g.y + tx / tl * wb);
      return null;
    }
    if (g.i < g.pts.length - 1 && g.cum < g.stop * g.total) return null;
    g.held += dt;
    if (g.held < g.hold) return null;
    this.g = null;
    return this.w.pointerUp(g.x, g.y) || 'none';
  }
}

/* ---------------------------------------------------------------- child models
 * After an `ask` the kid listens to Tupi (≈ 2.6 s; the chapter's first, longer prompt ≈ 3.4 s) and thinks U(think) s; it looks away now
 * and then (pDistract, U(distract) s). It picks the right house with p = skill (a glowing hint / an armed assist: p = followHint), else
 * another house. Then: with p = pTapHouse it taps that house (the auto-drive fallback the youngest use), with p = pHonk it first taps
 * the cart (a honk), else it presses the cart (U(react) s later) and drags along the road at U(speed) px/s, wobbling ± wobble × roadW
 * across it; with p = pStop it lifts somewhere on the way and grabs again after U(0.5, 1.6) s. Curiosity: p = pPoke presses the table.
 * Surprises: taps them with p = pSurprise. Talk: answers after U(talk) s. */
const SKILL = { 3: 0.72, 4: 0.82, 5: 0.86, 6: 0.88, 7: 0.9 };
const THINK = { 3: [1.6, 3.2], 4: [1.3, 2.6], 5: [1.1, 2.3], 6: [1.0, 2.2], 7: [1.0, 2.0] };
const SPEED = { 3: [220, 420], 4: [260, 500], 5: [300, 560], 6: [340, 640], 7: [380, 700] };
const TAPH = { 3: 0.35, 4: 0.2, 5: 0.12, 6: 0.08, 7: 0.06 };
function typicalProfile(age) {
  return { skill: SKILL[age], think: THINK[age], speed: SPEED[age], wobble: age <= 4 ? 0.35 : 0.25, react: [0.15, 0.35], followHint: 0.92,
    pTapHouse: TAPH[age], pHonk: age <= 4 ? 0.08 : 0.04, pStop: age <= 4 ? 0.25 : 0.15, pDistract: age <= 4 ? 0.07 : 0.04, distract: [3, 9],
    pPoke: age <= 4 ? 0.06 : 0.03, pSurprise: 0.7, talk: [3, 6], talkRight: Math.min(0.95, SKILL[age] + 0.05), prompt: 2.6, promptFirst: 3.4,
    wrongTalk: 2.4, between: [0.8, 1.6], offRoad: false };
}
function slowProfile() {
  return Object.assign(typicalProfile(3), { skill: 0.6, think: [2.8, 6], speed: [150, 320], wobble: 0.5, react: [0.25, 0.6], followHint: 0.8, pTapHouse: 0.3,
    pHonk: 0.15, pStop: 0.45, pDistract: 0.15, distract: [4, 12], pPoke: 0.12, talk: [4, 9], talkRight: 0.6 });
}
function perfectProfile(age) {
  return Object.assign(typicalProfile(age), { skill: 1, think: [0.8, 1.2], speed: [700, 900], wobble: 0.05, react: [0.1, 0.15], followHint: 1,
    pTapHouse: 0, pHonk: 0, pStop: 0, pDistract: 0, pPoke: 0, talk: [1, 2], talkRight: 1 });
}

class Kid {
  constructor(w, prof, seed) {
    this.w = w; this.p = prof; this.r = new BD.RNG(seed); this.f = new Finger(w, this.r);
    this.t = -1; this.talkT = -1; this.key = ''; this.surp = {}; this.pending = null;
    this.stats = { drags: 0, houseTaps: 0, honks: 0, stops: 0, pokes: 0, surprise: 0 };
  }
  rf(a) { return this.r.float(a[0], a[1]); }
  onEvent(e) {
    const p = this.p;
    if (e.type === 'ask') this.t = (e.first ? p.promptFirst : p.prompt) + this.rf(p.think);
    if (e.type === 'wrong' || e.type === 'idle' || e.type === 'hint' || e.type === 'honk') this.t = Math.min(this.t < 0 ? 1e9 : this.t, p.wrongTalk * 0.6 + this.rf(p.between));
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
  surprises() {
    const w = this.w, r = this.r, p = this.p, key = w.level + ':' + w.round;
    if (key !== this.key) { this.key = key; this.surp = { mouse: r.chance(p.pSurprise), bird: r.chance(p.pSurprise), snow: r.chance(p.pSurprise) }; }
    for (const [k, fn] of [['mouse', 'mouseHit'], ['bird', 'birdHit'], ['snow', 'snowHit']]) {
      const h = w[fn]();
      if (this.surp[k] && h && r.chance(0.05)) { this.surp[k] = false; this.stats.surprise++; this.f.tap(h.x, h.y, 0.08); return true; }
    }
    return false;
  }
  /** The finger's way from the cart to house `id`: along the road (with wobble), or (offRoad) a straight line to the door. */
  wayTo(id) {
    const w = this.w, ch = w.cartHit(), r = this.r;
    const start = [ch.x + r.float(-0.3, 0.3) * ch.r, ch.y + r.float(-0.3, 0.3) * ch.r];
    if (this.p.offRoad) { const h = w.houseById(id); return [start, [(start[0] + h.x) / 2 + r.float(-120, 120), (start[1] + h.y) / 2 + r.float(-120, 120)], [h.x, h.y - 0.3 * h.S]]; }
    return [start].concat(w.route(id));
  }
  act() {
    const w = this.w, r = this.r, p = this.p, a = w.answer(), L = w.layout;
    if (!a) return;
    const glow = !!w.hintHand || w.hintGlow > 0.3 || !!w.assistId;
    if (!glow && r.chance(p.pPoke)) { this.stats.pokes++; this.f.tap(r.float(L.play.x0 + 10, L.play.x1 - 10), r.float(L.play.y0 + 10, L.play.y1 - 10), 0.1); return; }
    let id = a.houseId;
    if (!r.chance(glow ? p.followHint : p.skill)) { const o = w.houses.filter(h => h.id !== a.houseId); if (o.length) id = r.pick(o).id; }
    if (w.assistId) { const ch = w.cartHit(); this.f.tap(ch.x, ch.y, 0.1); return; }
    if (r.chance(p.pHonk)) { this.stats.honks++; const ch = w.cartHit(); this.pending = { kind: 'tap', x: ch.x, y: ch.y, t: this.rf(p.react) }; return; }
    if (r.chance(p.pTapHouse)) { const b = w.houseHit(id); if (b) { this.stats.houseTaps++; this.pending = { kind: 'tap', x: b.cx + r.float(-0.25, 0.25) * (b.x1 - b.x0), y: b.cy + r.float(-0.25, 0.25) * (b.y1 - b.y0), t: this.rf(p.react) }; return; } }
    this.stats.drags++;
    this.pending = { kind: 'drag', id, t: this.rf(p.react), stop: r.chance(p.pStop) ? r.float(0.3, 0.8) : 2 };
  }
  step(dt) {
    const w = this.w, p = this.p;
    if (w.state === 'talk') { this.f.cancel(); this.pending = null; return this.talk(dt); }
    this.talkT = -1;
    if (w.state !== 'round' && w.state !== 'roundDone') { this.f.cancel(); this.pending = null; return; }
    if (this.f.busy) {
      const res = this.f.step(dt);
      if (res && this.resume) { const id = this.resume; this.resume = null; this.stats.stops++; this.pending = { kind: 'drag', id, t: this.rf([0.5, 1.6]), stop: 2 }; }
      return;
    }
    if (this.pending) {
      this.pending.t -= dt;
      if (this.pending.t > 0) return;
      const q = this.pending; this.pending = null;
      if (q.kind === 'tap') { this.f.tap(q.x, q.y, this.r.float(0.05, 0.2)); return; }
      if (!w.interactive || w.cart.state === 'auto') return;
      const pts = this.wayTo(q.id);
      if (this.f.path(pts, this.rf(p.speed), this.r.float(0.1, 0.5), p.wobble * w.layout.roadW, q.stop) === 'cart' && q.stop < 1) this.resume = q.id;
      return;
    }
    if (this.surprises()) return;
    if (!w.interactive || w.cart.state !== 'wait') return;
    if (this.t < 0) this.t = this.rf(p.between);
    this.t -= dt;
    if (this.t > 0) return;
    if (this.r.chance(p.pDistract)) { this.t = this.rf(p.distract); return; }
    this.t = this.rf(p.between) + 1.2;
    this.act();
  }
}
/** Random tapper: presses random points (a third on houses / the cart, the rest anywhere) every U(0.6, 1.8) s; sometimes a short slide. */
class Tapper extends Kid {
  step(dt) {
    const w = this.w, r = this.r;
    if (w.state === 'talk') return this.talk(dt);
    if (w.state !== 'round' && w.state !== 'roundDone') { this.f.cancel(); return; }
    if (this.f.busy) { this.f.step(dt); return; }
    if (this.t < 0) this.t = r.float(0.6, 1.8);
    this.t -= dt; if (this.t > 0) return;
    this.t = r.float(0.6, 1.8);
    const L = w.layout;
    let x, y;
    if (w.houses.length && r.chance(0.25)) { const b = w.houseHit(r.pick(w.houses).id); if (b) { x = b.cx; y = b.cy; } }
    if (x === undefined && r.chance(0.15)) { const ch = w.cartHit(); x = ch.x; y = ch.y; }
    if (x === undefined) { x = r.float(L.ins.left, L.W - L.ins.right); y = r.float(L.ins.top, L.H - L.ins.bottom); }
    const slide = r.chance(0.3);
    this.f.path([[x, y], [x + (slide ? r.float(-250, 250) : 0), y + (slide ? r.float(-120, 120) : 0)]], 600, r.float(0.03, 0.2), 0);
  }
}
/** Spammer: 6 presses per second on houses / the cart / the road, never waits for Tupi. */
class Spammer extends Kid {
  step(dt) {
    const w = this.w, r = this.r;
    if (w.state === 'talk') return this.talk(dt);
    if (w.state !== 'round' && w.state !== 'roundDone') { this.f.cancel(); return; }
    if (this.f.busy) { this.f.step(dt); return; }
    if (this.t < 0) this.t = r.float(0.14, 0.19);
    this.t -= dt; if (this.t > 0) return;
    this.t = r.float(0.14, 0.19);
    const L = w.layout;
    let x = r.float(L.play.x0, L.play.x1), y = r.float(L.play.y0, L.play.y1);
    const u = r.next();
    if (u < 0.4 && w.houses.length) { const b = w.houseHit(r.pick(w.houses).id); if (b) { x = b.cx + r.float(-20, 20); y = b.cy + r.float(-20, 20); } }
    else if (u < 0.6) { const ch = w.cartHit(); x = ch.x + r.float(-20, 20); y = ch.y + r.float(-20, 20); }
    else if (u < 0.8 && w.roads) { const e = r.pick(w.roads.edges), q = e.pts[r.int(0, e.pts.length - 1)]; x = q[0]; y = q[1]; }
    this.f.path([[x, y], [x + r.float(-8, 8), y + r.float(-8, 8)]], 300, 0, 0);
  }
}
/** Never touches the screen: a round waits for the child (no fail state, no auto-play); idle nudges + hints keep coming. */
class Absent { constructor(w) { this.w = w; this.stats = {}; } step() {} onEvent() {} }
class BotModel {
  constructor(w, skill, seed, pace) { this.b = new BD.Bot(w, { skill, seed, pace }); this.stats = this.b.stats; }
  step(dt) { this.b.step(dt); } onEvent(e) { this.b.onEvent(e); }
}

/** typical · kid<skill> (e.g. kid0.3) · slow3 · perfect · tapper · spammer · offroad (drags straight at the house, off the road) ·
 *  absent · bot<skill> (quick BD.Bot) · botT<skill> (toddler-paced BD.Bot) */
function makeModel(name, w, age, seed) {
  if (name === 'typical') return new Kid(w, typicalProfile(age), seed);
  if (/^kid/.test(name)) return new Kid(w, Object.assign(typicalProfile(age), { skill: +name.slice(3) }), seed);
  if (name === 'slow3') return new Kid(w, slowProfile(), seed);
  if (name === 'perfect') return new Kid(w, perfectProfile(age), seed);
  if (name === 'offroad') return new Kid(w, Object.assign(typicalProfile(age), { offRoad: true, pTapHouse: 0 }), seed);
  if (name === 'tapper') return new Tapper(w, typicalProfile(age), seed);
  if (name === 'spammer') return new Spammer(w, typicalProfile(age), seed);
  if (name === 'absent') return new Absent(w);
  if (/^botT/.test(name)) return new BotModel(w, name.length > 4 && isFinite(+name.slice(4)) ? +name.slice(4) : 0.8, seed, 'toddler');
  if (/^bot/.test(name)) return new BotModel(w, name.length > 3 && isFinite(+name.slice(3)) ? +name.slice(3) : 0.8, seed, 'quick');
  throw new Error('unknown model ' + name);
}

module.exports = { BD, VIEWPORTS, mkWorld, makeModel, Finger, Kid, clamp, mean, pct, f1, typicalProfile, slowProfile, perfectProfile };
