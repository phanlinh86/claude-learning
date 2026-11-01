// Mầm's Treasure Reef — headless playtest harness (report-only; never edits game code).
//
//   const L = require('./lib');
//   const r = L.runSession({ model: 'typical', age: 4, lagoon: 1, seed: 7, vp: 'land', lang: 'en', config: {} });
//
// Loads rng/content/world into a node vm (tests/unit/load.js) and drives ONE lagoon (newSession → sessionDone)
// through the real input API only: pointerDown / pointerMove / pointerUp at logical coordinates (a dig tap is a
// down + up on the mound, a drag is a down on the treasure, moves along a path, an up) and talkAnswer(choiceId).
// Child models: perfect, typical (4-year-old), slow3 (3-year-old), random (tapper), spammer, idle, high (drops high).
// Everything is deterministic for (model, age, lagoon, seed, vp, lang, config).
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');

// Same files as tests/unit/load.js, but evaluated in THIS context (≈ 30 % faster than a vm sandbox: no cross-context ICs).
// The scripts only touch window.TR; a fake `window` on the global object is all they need.
const JS = path.join(__dirname, '..', '..', 'game', 'js');
if (!global.window) global.window = global;
for (const f of ['rng.js', 'content.js', 'world.js']) vm.runInThisContext(fs.readFileSync(path.join(JS, f), 'utf8'), { filename: f });
const TR = global.TR;
const FRAME = 1 / 30;            // the child acts / is sampled at 30 Hz; the world keeps its own fixed 1/120 s sub-steps
const STUCK_S = 180;             // a round without roundDone within 180 s of sim time is "stuck"
const SESSION_CAP = 900;         // hard cap per lagoon (sim seconds): anything longer is a timeout (a stuck round is flagged at 180 s anyway)

const VIEWPORTS = {
  land: { W: 1280, H: 720, ins: { top: 0, right: 0, bottom: 0, left: 0 } },
  port: { W: 720, H: 1280, ins: { top: 59, right: 0, bottom: 34, left: 0 } }
};

const hyp = (x, y) => Math.sqrt(x * x + y * y);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rangeOf = (r, rng) => (Array.isArray(r) ? rng.float(r[0], r[1]) : +r);

/* ------------------------------------------------------------------ child models
 * pCorrect   chance an attempt goes for the right mound / chest (hint glowing → 0.95)
 * think      seconds between actions                      dropAbove  release height above the chest OPENING (b.y)
 * speed      drag speed px/s                              wobble     finger noise px (random walk per frame)
 * pEarly     chance to let go midway (→ a miss)           pTap       chance to just poke a treasure (down, hold, up)
 * tapHold    hold time of a poke                          pCrab      chance to tap the plain (crab) mound when one is buried
 * talkThink  seconds before the Talk answer               pTalk      chance the Talk answer is right
 * idleStart  seconds of doing nothing at every chapter start and at Talk time (idle model)
 */
const MODELS = {
  perfect: { pCorrect: 1, think: [1.2, 1.2], dropAbove: [20, 60], speed: [600, 900], wobble: 0, pEarly: 0, pTap: 0, tapHold: [0.1, 0.2], pCrab: 0, talkThink: [1.2, 1.2], pTalk: 1 },
  typical: { pCorrect: 0.7, think: [1.5, 3], dropAbove: [40, 90], speed: [300, 600], wobble: 5, pEarly: 0.05, pTap: 0.12, tapHold: [0.1, 0.6], pCrab: 0.5, talkThink: [2, 4], pTalk: 0.7 },
  slow3: { pCorrect: 0.5, think: [3, 5], dropAbove: [30, 110], speed: [200, 400], wobble: 12, pEarly: 0.15, pTap: 0.15, tapHold: [0.15, 0.8], pCrab: 0.6, talkThink: [3, 6], pTalk: 0.5, tapSpread: 1.6 },
  random: { kind: 'random', talkThink: [0.5, 1.5] },
  spammer: { kind: 'spammer', pCorrect: 0.9, think: [0.3, 0.8], dropAbove: [30, 80], speed: [1200, 1800], wobble: 3, pEarly: 0, pTap: 0, tapHold: [0.05, 0.1], pCrab: 0.5, talkThink: [0.5, 1], pTalk: 0.8 },
  idle: { pCorrect: 0.7, think: [1.5, 3], dropAbove: [40, 90], speed: [300, 600], wobble: 5, pEarly: 0.05, pTap: 0.12, tapHold: [0.1, 0.6], pCrab: 0.5, talkThink: [2, 4], pTalk: 0.7, idleStart: 40 },
  high: { pCorrect: 0.85, think: [1.5, 3], dropAbove: [100, 140], speed: [300, 600], wobble: 5, pEarly: 0, pTap: 0, tapHold: [0.1, 0.3], pCrab: 0.5, talkThink: [2, 4], pTalk: 0.7 }
};
const MODEL_NAMES = Object.keys(MODELS);

/* A gesture = finger down at (x0,y0), optional hold, optional move to (x1,y1) at `speed` with wobble, hold, up.
 * `early` < 1 lets go at that fraction of the path. `meta` tells the metrics what the child meant. */
class Gesture {
  constructor(g, rng) {
    Object.assign(this, { holdBefore: 0, holdAfter: 0.1, speed: 500, wobble: 0, early: 1, x1: g.x0, y1: g.y0 }, g);
    this.rng = rng; this.phase = 'down'; this.t = 0; this.prog = 0; this.wx = 0; this.wy = 0;
    this.len = hyp(this.x1 - this.x0, this.y1 - this.y0) * this.early;
    this.fx = this.x0; this.fy = this.y0; this.evStart = 0; this.maxD = 0;
  }
  track(x, y) { this.maxD = Math.max(this.maxD, hyp(x - this.x0, y - this.y0)); }
  // returns true when finished
  step(w, dt, log) {
    const wob = () => { if (this.wobble) { this.wx = clamp(this.wx + this.rng.float(-this.wobble, this.wobble), -2 * this.wobble, 2 * this.wobble); this.wy = clamp(this.wy + this.rng.float(-this.wobble, this.wobble), -2 * this.wobble, 2 * this.wobble); } };
    switch (this.phase) {
      case 'down':
        this.evStart = log.length;
        this.downT = w.time;
        w.pointerDown(this.x0, this.y0);
        this.phase = 'hold0'; this.t = 0; return false;
      case 'hold0':
        this.t += dt; wob(); w.pointerMove(this.x0 + this.wx, this.y0 + this.wy); this.track(this.x0 + this.wx, this.y0 + this.wy);
        if (this.t >= this.holdBefore) { this.phase = this.len > 0 ? 'move' : 'hold1'; this.t = 0; }
        return false;
      case 'move': {
        this.prog = Math.min(this.len, this.prog + this.speed * dt);
        const u = this.prog / (hyp(this.x1 - this.x0, this.y1 - this.y0) || 1);
        wob();
        this.fx = this.x0 + (this.x1 - this.x0) * u + this.wx; this.fy = this.y0 + (this.y1 - this.y0) * u + this.wy;
        w.pointerMove(this.fx, this.fy); this.track(this.fx, this.fy);
        if (this.prog >= this.len) { this.phase = 'hold1'; this.t = 0; }
        return false;
      }
      case 'hold1':
        this.t += dt; wob();
        if (this.len > 0) { this.fx = this.x0 + (this.x1 - this.x0) * (this.len / (hyp(this.x1 - this.x0, this.y1 - this.y0) || 1)) + this.wx; this.fy = this.y0 + (this.y1 - this.y0) * (this.len / (hyp(this.x1 - this.x0, this.y1 - this.y0) || 1)) + this.wy; }
        else { this.fx = this.x0 + this.wx; this.fy = this.y0 + this.wy; }
        w.pointerMove(this.fx, this.fy); this.track(this.fx, this.fy);
        if (this.t >= this.holdAfter) { w.pointerUp(this.fx, this.fy); this.upT = w.time; this.phase = 'done'; return true; }
        return false;
    }
    return true;
  }
}

/* The child: decides what to do next from what it sees in the world (public fields only). */
class Child {
  constructor(name, w, rng) {
    this.name = name; this.p = MODELS[name]; this.w = w; this.rng = rng;
    this.wait = 0.8; this.g = null; this.talkT = -1; this.idleLeft = 0; this.lastLevel = -1; this.lastTalk = null;
    this.spam = null; this.intents = [];   // {kind, ...} per gesture for the metrics
  }
  think() { return rangeOf(this.p.think || [1.5, 3], this.rng); }
  step(dt, log) {
    const w = this.w, r = this.rng;
    if (this.g) { if (this.g.step(w, dt, log)) { this.finished = this.g; this.g = null; } return; }
    if (w.state === 'talk') {
      if (w.talkAnswered) return;
      if (this.lastTalk !== w.talk) { this.lastTalk = w.talk; this.talkT = rangeOf(this.p.talkThink, r) + (this.p.idleStart || 0); }
      this.talkT -= dt;
      if (this.talkT <= 0) {
        const t = w.talk; let pick = t.answerId;
        if (this.p.kind === 'random') pick = r.pick(t.choices).id;
        else if (!r.chance(this.p.pTalk)) { const wr = t.choices.filter(c => c.id !== t.answerId); if (wr.length) pick = r.pick(wr).id; }
        w.talkAnswer(pick); this.talkT = -1;
      }
      return;
    }
    if (w.state !== 'round') { this.wait = Math.max(this.wait, 0.3); return; }
    if (this.p.idleStart && w.level !== this.lastLevel) { this.lastLevel = w.level; this.idleLeft = this.p.idleStart; }
    if (this.idleLeft > 0) { this.idleLeft -= dt; return; }
    if (!w.interactive || w.completing) return;
    this.wait -= dt;
    if (this.wait > 0) return;
    const g = this.p.kind === 'random' ? this.randomAction() : this.p.kind === 'spammer' ? this.spamAction() : (w.isDig() ? this.digAction() : this.dragAction());
    if (!g) { this.wait = 0.25; return; }
    this.g = new Gesture(g, r);
    this.wait = g.wait !== undefined ? g.wait : this.p.kind === 'random' ? r.float(0.5, 1) : this.think();
  }
  /** Called by the harness after the world's events were drained into `log`. */
  finishGesture(log) {
    const g = this.finished; this.finished = null;
    const ev = log.slice(g.evStart).map(e => e.type);
    this.intents.push({ kind: g.kind, meant: g.meant, moundId: g.moundId, itemId: g.itemId, ev, fx: g.fx, fy: g.fy, downT: g.downT, upT: g.upT, above: g.above, chestId: g.chestId, mode: g.mode, hold: g.holdAfter + g.holdBefore, maxD: g.maxD });
  }
  /* --- dig: pick a mound, tap it */
  pickMound() {
    const w = this.w, r = this.rng, lb = w.targetLabel();
    const buried = w.mounds.filter(m => m.state === 'buried');
    const crab = buried.find(m => m.crab);
    if (crab && r.chance(this.p.pCrab)) return { m: crab, meant: 'crab' };
    const tgt = w.targetMound();
    if (!tgt) return null;
    const wrong = buried.filter(m => !m.crab && m.itemId && !TR.Content.sameLabel(w.itemById(m.itemId).label, lb));
    const pc = tgt._glowT > 0 ? Math.max(this.p.pCorrect, 0.95) : this.p.pCorrect;
    if (wrong.length && !r.chance(pc)) return { m: r.pick(wrong), meant: 'wrong' };
    return { m: tgt, meant: 'right' };
  }
  tapOnMound(m, meant) {
    const r = this.rng, sp = this.p.tapSpread || 1;
    const x0 = m.x + r.float(-0.45, 0.45) * m.w * sp, y0 = m.y - m.h * r.float(-0.15 * sp, 1.3 * sp);
    return { kind: 'dig', meant, moundId: m.id, x0, y0, holdBefore: 0, holdAfter: rangeOf(this.p.tapHold, r), wobble: this.p.wobble * 0.5 };
  }
  digAction() { const c = this.pickMound(); return c ? this.tapOnMound(c.m, c.meant) : null; }
  /* --- drag: grab a resting treasure, carry it to a chest */
  dragAction(forceCorrect) {
    const w = this.w, r = this.rng, p = this.p;
    const idle = w.items.filter(it => it.state === 'idle');
    if (!idle.length) return null;
    const it = r.pick(idle), drawn = it.size * (it.scale || 1);
    const x0 = it.x + r.float(-0.3, 0.3) * drawn, y0 = it.y + r.float(-0.3, 0.3) * drawn;
    if (!forceCorrect && r.chance(p.pTap)) return { kind: 'poke', itemId: it.id, x0, y0, holdAfter: rangeOf(p.tapHold, r), wobble: p.wobble * 0.5, mode: w.cur.mode };
    const goal = w.goalOf(it), right = w.basketById(goal);
    let b = right, meant = 'right';
    const glow = right && right._glowT > 0;
    if (!forceCorrect && w.baskets.length > 1 && !r.chance(glow ? 0.95 : p.pCorrect)) { b = r.pick(w.baskets.filter(x => x.id !== goal)); meant = 'wrong'; }
    const above = rangeOf(p.dropAbove, r);
    const x1 = b.x + r.float(-0.3, 0.3) * b.w, y1 = b.y - above;
    const early = !forceCorrect && r.chance(p.pEarly) ? r.float(0.4, 0.85) : 1;
    return { kind: 'drag', meant: early < 1 ? 'early' : meant, itemId: it.id, chestId: b.id, above, mode: w.cur.mode, x0, y0, x1, y1, speed: rangeOf(p.speed, r), wobble: p.wobble, early, holdBefore: r.float(0.05, 0.15), holdAfter: r.float(0.05, 0.15) };
  }
  /* --- random tapper: taps mounds / items / sand, drags at random */
  randomAction() {
    const w = this.w, r = this.rng, L = w.layout, k = r.next();
    const anyPt = () => ({ x: r.float(0, L.W), y: r.float(0, L.H) });
    if (k < 0.3 && w.mounds.length) { const m = r.pick(w.mounds); return { kind: 'rnd-mound', moundId: m.id, meant: m.state, x0: m.x + r.float(-0.5, 0.5) * m.w, y0: m.y - r.float(0, 1.2) * m.h, holdAfter: r.float(0.05, 0.4) }; }
    if (k < 0.55 && w.items.length) { const it = r.pick(w.items); return { kind: 'rnd-item', itemId: it.id, meant: it.state, x0: it.x + r.float(-20, 20), y0: it.y + r.float(-20, 20), holdAfter: r.float(0.05, 0.5) }; }
    if (k < 0.75) { const p = anyPt(); return { kind: 'rnd-sand', x0: p.x, y0: p.y, holdAfter: r.float(0.05, 0.3) }; }
    const from = w.items.length && r.chance(0.7) ? (it => ({ x: it.x, y: it.y }))(r.pick(w.items)) : anyPt();
    const to = r.chance(0.5) ? { x: r.float(0, L.W), y: r.float(L.H * 0.5, L.H) } : anyPt();
    return { kind: 'rnd-drag', x0: from.x, y0: from.y, x1: to.x, y1: to.y, speed: r.float(400, 1200), wobble: 8, holdAfter: r.float(0, 0.2) };
  }
  /* --- spammer: 10 taps/s bursts on one spot, double taps, two quick drags, then a correct action to move on */
  spamAction() {
    const w = this.w, r = this.rng;
    if (!this.spam) {
      const k = r.next();
      if (k < 0.4) {    // burst on one spot: a mound or a treasure or a chest
        const tg = w.isDig() && w.mounds.length ? (m => ({ x: m.x, y: m.y - m.h * 0.5 }))(r.pick(w.mounds)) : w.items.length && r.chance(0.6) ? (it => ({ x: it.x, y: it.y }))(r.pick(w.items)) : (b => ({ x: b.x, y: b.top - 20 }))(r.pick(w.baskets));
        this.spam = { kind: 'burst', n: Math.round(r.float(10, 20)), x: tg.x, y: tg.y };
      } else if (k < 0.6) this.spam = { kind: 'double', n: 2, x: null };
      else if (k < 0.8 && !w.isDig()) this.spam = { kind: 'drags', n: 2 };
      else this.spam = { kind: 'go', n: 1 };
    }
    const s = this.spam; s.n--; if (s.n <= 0) this.spam = null;
    if (s.kind === 'burst') return { kind: 'spam-tap', x0: s.x, y0: s.y, holdAfter: 0.05, wait: 0.05 };   // 10 taps/s
    if (s.kind === 'double') {
      if (s.x == null) { const it = w.items.length ? r.pick(w.items) : null; const m = w.mounds.length ? r.pick(w.mounds) : null; const p = it && (!m || r.chance(0.5)) ? { x: it.x, y: it.y } : m ? { x: m.x, y: m.y - m.h / 2 } : { x: 100, y: 100 }; s.x = p.x; s.y = p.y; }
      return { kind: 'spam-double', x0: s.x, y0: s.y, holdAfter: 0.06, wait: 0.08 };
    }
    if (s.kind === 'drags') { const g = this.dragAction(true); if (g) { g.kind = 'spam-drag'; g.speed = 1500; g.holdBefore = 0; g.holdAfter = 0.02; g.wait = 0.05; } return g; }
    return w.isDig() ? this.digAction() : this.dragAction(true);
  }
}

/* ------------------------------------------------------------------ geometry checks */
function rectsOverlap(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
function overlapPx(a, b) { return Math.min(Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)); }
function itemRect(it) { const d = it.size * (it.scale || 1); return { x: it.x - d / 2, y: it.y - d / 2, w: d, h: d }; }
function moundRect(m) { return { x: m.x - m.w / 2, y: m.y - m.h, w: m.w, h: m.h }; }
function chestRect(b) { return { x: b.x - b.w / 2, y: b.top, w: b.w, h: b.h }; }

/* Optional CONTENT experiments (sim-side monkeypatch of TR.Content.makeRound, restored after the session):
 *   patch.digExtraTargets = k → later dig rounds (not warm-up, not count) ask for k more targets (emulates content.js
 *   buildDig `T = warm ? 1 : rng.int(2, 3)` → `rng.int(2 + k, 3 + k)`); consecutive targets still differ in label. */
function withPatch(patch, fn) {
  if (!patch) return fn();
  const orig = TR.Content.makeRound;
  TR.Content.makeRound = function (topic, o) {
    const r = orig.call(TR.Content, topic, o);
    if (patch.digExtraTargets && r.mode === 'dig' && !r.need && (o.roundIndex || 0) > 0) {
      const have = {}; r.queue.forEach(id => { have[id] = true; });
      let last = r.items.find(it => it.id === r.queue[r.queue.length - 1]);
      for (let k = 0; k < patch.digExtraTargets; k++) {
        const cand = r.items.find(it => !have[it.id] && !TR.Content.sameLabel(it.label, last.label));
        if (!cand) break;
        r.queue.push(cand.id); have[cand.id] = true; last = cand;
      }
    }
    return r;
  };
  try { return fn(); } finally { TR.Content.makeRound = orig; }
}

/* ------------------------------------------------------------------ one lagoon */
function runSession(o) { return withPatch(o.patch, () => runSessionInner(o)); }
function runSessionInner(o) {
  const vp = VIEWPORTS[o.vp || 'land'], model = o.model || 'typical', age = o.age || 4, lagoon = o.lagoon || 1, seed = o.seed || 1, lang = o.lang || 'en';
  const w = new TR.World({ seed, age, lang, width: vp.W, height: vp.H, ins: vp.ins, config: o.config || {} });
  w.setViewport(vp.W, vp.H, vp.ins);
  const rng = new TR.RNG('kid:' + model + ':' + seed + ':' + age + ':' + lagoon + ':' + (o.vp || 'land'));
  const kid = new Child(model, w, rng);
  const plan = TR.Content.planFor(age, lagoon);
  w.newSession({ lagoon, plan, startLevel: 0 });

  const log = [];        // {t, type, ...}
  const R = {            // metrics
    model, age, lagoon, seed, vp: o.vp || 'land', lang, done: false, timeout: false, total: 0,
    chapters: [], rounds: [], stuck: 0, stuckDig: 0, stuckDrag: 0, hints: 0, idles: 0, idleMaxRound: 0, talkAskMax: 0, talkAsks: 0, crabs: 0, crabMounds: 0, photobombs: 0, pearls: 0, stars: 0,
    tapAsDrop: 0, pokes: 0, longPokes: 0, pokeWrong: 0, pokeCorrect: 0, nearMiss: 0, highDrops: 0, highMissed: 0, drops: 0, misses: 0, wrongs: 0, corrects: 0,
    ignoredDigTaps: 0, wobbleIgnored: 0, digTaps: 0, peekOverlapChest: 0, peekOverlapMound: 0, peekOverlapMax: 0, peeks: 0,
    packOutside: 0, packOverlap: 0, dragRounds: 0, digRounds: 0, countRounds: 0, countDone: 0, lookalike: 0, lookalikeRounds: 0,
    nextBad: 0, nexts: 0, anomalies: [], shortChapters: 0, variety: [], sameRuns: 0, sameLabels: 0
  };
  let cur = null, chap = null, lastRoundDone = true, pendingNext = false, headAtTap = null, roundT0 = 0, lastPearl = 0, lastEv = null;
  const peeked = {};

  function onEvent(e) {
    e.t = w.time; log.push(e);
    switch (e.type) {
      case 'level': chap = { level: e.level, topic: e.topic, mech: e.mech, t0: w.time, rounds: 0, idles: 0, kinds: [] }; R.chapters.push(chap); break;
      case 'round': {
        if (!lastRoundDone) R.anomalies.push('round before roundDone @' + w.time.toFixed(1));
        lastRoundDone = false; roundT0 = w.time;
        const mode = e.mode, M = w.mounds.length, T = w.queue.length, nB = w.baskets.length, nI = w.items.length;
        const need = e.need || (w.baskets[0] && w.baskets[0].need) || null;
        const kind = e.topic + '|' + mode + '|' + (mode === 'dig' ? (need ? 'N' + need : 'M' + M + 'T' + T) : (mode === 'count' ? 'N' + need : 'B' + nB + 'I' + nI));
        const labels = (mode === 'dig' ? w.queue.map(id => { const l = w.itemById(id).label; return l.type + ':' + l.value; }) : w.baskets.map(b => b.label.type + ':' + b.label.value)).sort().join(',');
        cur = { round: e.round, topic: e.topic, mode, mech: e.mech, t0: w.time, hints: 0, idles: 0, kind, labels, need, done: false, lookalike: false };
        if (chap.lastLabels === labels && mode !== 'count' && !need) R.sameLabels++;
        chap.lastLabels = labels;
        R.rounds.push(cur); chap.rounds++; chap.kinds.push(kind);
        if (mode === 'dig') { R.digRounds++; if (w.mounds.some(m => m.crab)) R.crabMounds++; const labels = w.items.map(i => i.label.type + ':' + i.label.value); if (new Set(labels).size < labels.length) R.lookalikeRounds++; }
        else { R.dragRounds++; checkPack(); }
        if (mode === 'count' || e.need) R.countRounds++;
        for (const k in peeked) delete peeked[k];
        break;
      }
      case 'next': {
        R.nexts++;
        const it = w.itemById(e.itemId), m = it && w.moundById(it.moundId);
        if (!it || !m || (m.state !== 'buried' && m.state !== 'peek') || w.queue[0] !== e.itemId) { R.nextBad++; R.anomalies.push('next names a bad item ' + e.itemId + ' @' + w.time.toFixed(1)); }
        break;
      }
      case 'dig': if (e.correct && headAtTap && e.itemId !== headAtTap) { R.lookalike++; cur.lookalike = true; } break;
      case 'correct': R.corrects++; if (lastRoundDone) R.anomalies.push('correct after roundDone @' + w.time.toFixed(1)); break;
      case 'wrong': R.wrongs++; if (lastRoundDone) R.anomalies.push('wrong after roundDone @' + w.time.toFixed(1)); break;
      case 'drop': R.drops++; if (lastRoundDone) R.anomalies.push('drop after roundDone @' + w.time.toFixed(1)); break;
      case 'miss': R.misses++; break;
      case 'land': if (lastRoundDone) R.anomalies.push('land after roundDone @' + w.time.toFixed(1)); break;
      case 'hint': R.hints++; cur.hints++; break;
      case 'idle': R.idles++; cur.idles++; chap.idles++; R.idleMaxRound = Math.max(R.idleMaxRound, cur.idles); break;
      case 'crab': R.crabs++; break;
      case 'photobomb': R.photobombs++; break;
      case 'talkAsk': R.talkAsks++; R.talkAskMax = Math.max(R.talkAskMax, e.n); break;
      case 'pearl': if (e.total !== lastPearl + e.n || e.total !== w.pearls) R.anomalies.push('pearl total mismatch @' + w.time.toFixed(1)); lastPearl = e.total; break;
      case 'roundDone': {
        if (lastRoundDone) R.anomalies.push('double roundDone @' + w.time.toFixed(1));
        lastRoundDone = true; cur.done = true; cur.dur = w.time - cur.t0; cur.stars = e.stars; cur.mistakes = e.mistakes;
        if (!(e.stars >= 1 && e.stars <= 3)) R.anomalies.push('stars ' + e.stars);
        if (cur.mode === 'count' || cur.need) { if (w.baskets[0].count === w.baskets[0].need) R.countDone++; else R.anomalies.push('count round done with ' + w.baskets[0].count + '/' + w.baskets[0].need); }
        if (w.items.some(i => i.state === 'fly' || i.state === 'hop')) R.anomalies.push('roundDone with items in the air @' + w.time.toFixed(1));
        break;
      }
      case 'talk': if (!lastRoundDone) R.anomalies.push('talk before roundDone'); chap.talkT0 = w.time; break;
      case 'talkResult': chap.talkRight = e.correct; chap.talkDur = w.time - chap.talkT0; break;
      case 'levelDone': chap.dur = w.time - chap.t0; chap.stars = e.stars; if (chap.rounds < w.cfg.roundsPerLevel) R.shortChapters++; break;
      case 'sessionDone': R.done = true; R.total = w.time; R.pearls = e.pearls; R.stars = e.stars; break;
    }
    lastEv = e;
  }
  function checkPack() {
    const pr = w.playRect, its = w.items;
    for (let i = 0; i < its.length; i++) {
      const a = its[i], da = a.size * (a.scale || 1);
      if (a.homeX - da / 2 < pr.x - 2 || a.homeX + da / 2 > pr.x + pr.w + 2 || a.homeY - da / 2 < pr.y - 2 || a.homeY + da / 2 > pr.y + pr.h + 2) R.packOutside++;
      for (let j = i + 1; j < its.length; j++) {
        const b = its[j], db = b.size * (b.scale || 1);
        if (hyp(a.homeX - b.homeX, a.homeY - b.homeY) < 0.9 * Math.max(da, db)) R.packOverlap++;
      }
    }
  }
  function samplePeeks() {
    for (const it of w.items) {
      if (it.state !== 'peek' || it.peek < 0.97 || peeked[it.id]) continue;
      peeked[it.id] = true; R.peeks++;
      const r = itemRect(it), b = w.baskets[0];
      if (b && rectsOverlap(r, chestRect(b))) R.peekOverlapChest++;
      for (const m of w.mounds) {
        if (m.id === it.moundId) continue;
        const o1 = rectsOverlap(r, moundRect(m)) ? overlapPx(r, moundRect(m)) : 0;
        const oi = m.itemId && w.itemById(m.itemId).state === 'buried' ? (rectsOverlap(r, itemRect(w.itemById(m.itemId))) ? overlapPx(r, itemRect(w.itemById(m.itemId))) : 0) : 0;
        const ov = Math.max(o1, oi);
        if (ov > 0) { R.peekOverlapMound++; R.peekOverlapMax = Math.max(R.peekOverlapMax, ov); }
      }
    }
  }
  function judgeIntents() {
    for (const g of kid.intents) {
      if (g.kind === 'dig') {
        R.digTaps++;
        if (!g.ev.includes('dig') && !g.ev.includes('crab')) {
          const m = w.moundById(g.moundId);
          if (m && m.state === 'buried') { if (g.maxD >= w.cfg.tapMovePx) R.wobbleIgnored++; else R.ignoredDigTaps++; }   // finger wobbled ≥ 24 px / landed outside the tap pad
        }
      } else if (g.kind === 'poke') {
        R.pokes++;
        if (g.ev.includes('drop')) { R.tapAsDrop++; if (g.hold >= w.cfg.tapTime) R.longPokes++; if (g.ev.includes('wrong')) R.pokeWrong++; if (g.ev.includes('correct')) R.pokeCorrect++; }
      } else if (g.kind === 'drag' || g.kind === 'spam-drag') {
        if (g.meant === 'early') continue;
        if (g.ev.includes('miss')) {
          const b = w.basketById(g.chestId);
          if (b) { const dy = b.top - g.fy; if (g.fx > b.x - b.w / 2 - 80 && g.fx < b.x + b.w / 2 + 80 && dy > -80 && dy < 220) R.nearMiss++; }
          if (g.above >= 100) R.highMissed++;
        }
        if (g.above >= 100) R.highDrops++;
      }
    }
    kid.intents.length = 0;
  }
  function trackHead() { headAtTap = w.isDig() && w.cur && !w.cur.need ? w.queue[0] : null; }

  // main loop
  let t = 0, stuckFlagged = false;
  for (const e of w.drainEvents()) onEvent(e);
  while (!R.done && w.time < SESSION_CAP) {
    trackHead();
    kid.step(FRAME, log);
    for (const e of w.drainEvents()) onEvent(e);      // events of the pointer calls made in this frame
    if (kid.finished) kid.finishGesture(log);
    w.update(FRAME);
    for (const e of w.drainEvents()) onEvent(e);
    samplePeeks(); judgeIntents();
    if (cur && !cur.done && !stuckFlagged && w.time - cur.t0 > STUCK_S) { R.stuck++; if (cur.mech === 'dig') R.stuckDig++; else R.stuckDrag++; stuckFlagged = true; cur.stuck = true; }
    if (cur && cur.done) stuckFlagged = false;
    t += FRAME;
  }
  if (!R.done) { R.timeout = true; R.total = w.time; }
  // variety: runs of ≥ 3 identical kinds within a chapter
  for (const c of R.chapters) {
    let run = 1;
    for (let i = 1; i < c.kinds.length; i++) { run = c.kinds[i] === c.kinds[i - 1] ? run + 1 : 1; if (run === 3) { R.sameRuns++; R.variety.push(c.topic + '/' + c.mech + ': ' + c.kinds[i]); } }
  }
  R.log = o.keepLog ? log : null;
  return R;
}

/* ------------------------------------------------------------------ aggregation */
function mean(a) { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0; }
function pct(a, q) { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; }

function aggregate(results) {
  const A = { n: results.length, done: 0, timeout: 0, stuck: 0, stuckDig: 0, stuckDrag: 0, lagoonDur: [], chapDur: [], digChapDur: [], dragChapDur: [], chapInBand: 0, chapN: 0, roundDur: [], stars: { 1: 0, 2: 0, 3: 0 }, roundsN: 0,
    hints: 0, pearls: [], crabs: 0, crabMounds: 0, photobombs: 0, chapters: 0, tapAsDrop: 0, pokes: 0, longPokes: 0, pokeWrong: 0, pokeCorrect: 0, nearMiss: 0, highDrops: 0, highMissed: 0, misses: 0, drops: 0,
    ignoredDigTaps: 0, wobbleIgnored: 0, digTaps: 0, peekOverlapChest: 0, peekOverlapMound: 0, peekOverlapMax: 0, peeks: 0, packOutside: 0, packOverlap: 0, dragRounds: 0, digRounds: 0,
    countRounds: 0, countDone: 0, lookalike: 0, lookalikeRounds: 0, nextBad: 0, nexts: 0, anomalies: 0, anomalyList: [], shortChapters: 0, idles: 0, idleMaxRound: 0, talkAskMax: 0, talkAsks: 0, sameRuns: 0, sameLabels: 0, varietyList: [], talkRight: 0, talkDur: [],
    byLagoon: {} };
  for (const r of results) {
    if (r.done) { A.done++; A.lagoonDur.push(r.total); (A.byLagoon[r.lagoon] = A.byLagoon[r.lagoon] || []).push(r.total); }
    if (r.timeout) A.timeout++;
    A.stuck += r.stuck; A.stuckDig += r.stuckDig; A.stuckDrag += r.stuckDrag;
    for (const c of r.chapters) { A.chapters++; if (c.dur != null) { A.chapDur.push(c.dur); (c.mech === 'dig' ? A.digChapDur : A.dragChapDur).push(c.dur); A.chapN++; if (c.dur >= 60 && c.dur <= 100) A.chapInBand++; } if (c.talkRight) A.talkRight++; if (c.talkDur != null) A.talkDur.push(c.talkDur); }
    for (const q of r.rounds) if (q.done) { A.roundDur.push(q.dur); A.stars[q.stars]++; A.roundsN++; }
    for (const k of ['hints', 'crabs', 'crabMounds', 'photobombs', 'tapAsDrop', 'pokes', 'longPokes', 'pokeWrong', 'pokeCorrect', 'nearMiss', 'highDrops', 'highMissed', 'misses', 'drops', 'ignoredDigTaps', 'wobbleIgnored', 'digTaps', 'peekOverlapChest', 'peekOverlapMound', 'peeks', 'packOutside', 'packOverlap', 'dragRounds', 'digRounds', 'countRounds', 'countDone', 'lookalike', 'lookalikeRounds', 'nextBad', 'nexts', 'shortChapters', 'idles', 'talkAsks', 'sameRuns', 'sameLabels']) A[k] += r[k];
    A.peekOverlapMax = Math.max(A.peekOverlapMax, r.peekOverlapMax);
    A.idleMaxRound = Math.max(A.idleMaxRound, r.idleMaxRound); A.talkAskMax = Math.max(A.talkAskMax, r.talkAskMax);
    A.anomalies += r.anomalies.length; if (r.anomalies.length && A.anomalyList.length < 8) A.anomalyList.push(r.model + '/a' + r.age + '/L' + r.lagoon + '/s' + r.seed + ': ' + r.anomalies.slice(0, 3).join('; '));
    if (r.pearls) A.pearls.push(r.pearls);
    for (const v of r.variety) if (A.varietyList.length < 12) A.varietyList.push('a' + r.age + ' L' + r.lagoon + ' ' + v);
  }
  // estimated 6-lagoon total: sum over lagoons of the mean lagoon duration (missing lagoons use the overall mean)
  let total6 = 0; for (let l = 1; l <= 6; l++) total6 += A.byLagoon[l] ? mean(A.byLagoon[l]) : mean(A.lagoonDur);
  A.total6 = total6;
  return A;
}

/* Determinism: run the same session twice, compare the event logs. */
function deterministic(o) {
  const a = runSession(Object.assign({}, o, { keepLog: true })), b = runSession(Object.assign({}, o, { keepLog: true }));
  const ja = JSON.stringify(a.log), jb = JSON.stringify(b.log);
  return { same: ja === jb, events: a.log.length };
}

module.exports = { TR, withPatch, MODELS, MODEL_NAMES, VIEWPORTS, runSession, aggregate, deterministic, mean, pct, FRAME, STUCK_S };
