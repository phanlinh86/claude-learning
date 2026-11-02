// Bao's Arctic Reel — human-like player models for the headless playtest (tests/sim/run.js).
// Every model has the same interface as PR.Bot:  p = make(kind, PR, world, {seed}); p.step(dt) before world.update(dt).
// They only use world.press()/release() and read the world state a person could see on screen.
//
//   kid     age 5–6: slow reactions (350–600 ms), sloppy holds (over/undershoot), tap σ ≈ 120 ms,
//           double-taps sometimes, ignores half of the puffers, chases the NEAREST gem (where it is now).
//   adult   casual adult: reaction ≈ 250 ms, tap σ ≈ 60 ms, picks a good gem and predicts where it will be,
//           avoids every puffer it has noticed.
//   spam    exploit: hammers the button at 8–10 Hz the whole time, never aims.
//   spamReel exploit variant: plays the hook like `adult` but mashes 8–10 Hz on the reel meter
//           (isolates "can mashing beat the meter?").
//   camper  exploit: parks the hook at one depth forever (opts.depth 0..1 of the hook range; 0 = never press),
//           reels like `adult`, never dodges.
//   bot     the game's own PR.Bot (opts.skill).
'use strict';

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

const PROFILES = {
  kid: {
    react: [0.35, 0.60],      // s   decisions: new target, noticing a puffer, first look at a new reel zone
    motorDelay: 0.22,         // s   visual-motor loop for hold/release (the hook's position lags in the kid's head)
    lead: 0.04,               // s   how much the hook's momentum is anticipated (an adult brakes earlier)
    dead: 12,                 // px  "close enough"
    holdBias: 30,             // px  σ of the release point per hold: holds too long / too short
    tapSd: 0.12,              // s   tap timing σ
    doubleTap: 0.15,          // —   chance a reel tap is followed by an accidental 2nd tap 80–180 ms later
    ignorePuffer: 0.5,        // —   chance a puffer is never noticed
    pufferLook: 0.9,          // s   how far ahead a noticed puffer is "seen coming"
    pufferMargin: 6,          // px
    nearest: true,            // aims at the nearest gem, at its current depth
    idle: 0.03,               // 1/s chance per second to look away for 1–3 s while roaming
  },
  adult: {
    react: [0.22, 0.30], motorDelay: 0.15, lead: 0.11, dead: 6, holdBias: 10,
    tapSd: 0.06, doubleTap: 0.02, ignorePuffer: 0, pufferLook: 1.4, pufferMargin: 12,
    nearest: false, idle: 0,
  },
};

class Human {
  constructor(PR, world, opts) {
    this.PR = PR; this.w = world; this.o = Object.assign({}, PROFILES[opts.kind || 'kid'], opts.profile || {});
    this.kind = opts.kind;
    this.rng = new PR.RNG(opts.seed == null ? 5 : opts.seed);
    this.t = 0;
    this.hist = [];                 // [{t, y, vy}] delayed view of the hook
    this.targetY = null; this.targetId = 0;
    this.pending = null;            // {at, y, id}: decision that becomes active after a reaction delay
    this.nextThink = 0;
    this.bias = 0;                  // release error for the current hold
    this.idleUntil = 0;
    this.puf = new Map();           // puffer id -> {ignored, seenAt}
    this.tapAt = -1; this.extraTapAt = -1; this.tapsSeen = -1; this.mashT = 0; this.mashUp = -1;
    this.stats = { taps: 0, doubleTaps: 0, presses: 0, idles: 0 };
    this.reelMode = opts.reelMode || 'aim';   // 'aim' | 'mash'
    this.campY = opts.campDepth;              // undefined → normal roaming
  }
  react() { return this.rng.range(this.o.react[0], this.o.react[1]); }

  step(dt) {
    const w = this.w;
    this.t += dt;
    this.hist.push({ t: this.t, y: w.hook.y, vy: w.hook.vy });
    while (this.hist.length > 2 && this.hist[1].t <= this.t - this.o.motorDelay) this.hist.shift();
    if (this.extraTapAt >= 0 && this.t >= this.extraTapAt) {   // the accidental 2nd tap goes wherever it goes
      this.extraTapAt = -1; this.stats.doubleTaps++; w.press(); w.release();
    }
    if (w.phase === 'reel') { this.reel(dt); return; }
    this.tapAt = -1; this.tapsSeen = -1;
    if (w.phase !== 'roam') { if (w.hook.holding) w.release(); this.targetY = null; return; }
    this.roam(dt);
  }

  // ------------------------------------------------------------- reel meter
  reel(dt) {
    const w = this.w, r = w.reel;
    if (w.hook.holding) w.release();
    if (this.reelMode === 'mash') { this.mash(dt); return; }
    if (r.taps !== this.tapsSeen) {          // new zone: look, then time the tap on the needle's next pass
      this.tapsSeen = r.taps;
      const tc = nextCross(w, this.react());
      this.tapAt = this.t + tc + this.rng.gauss() * this.o.tapSd;
      if (this.tapAt < this.t + 0.06) this.tapAt = this.t + 0.06;
    }
    if (this.tapAt >= 0 && this.t >= this.tapAt) {
      this.tapAt = -1; this.stats.taps++;
      w.press(); w.release();
      if (this.rng.chance(this.o.doubleTap)) this.extraTapAt = this.t + this.rng.range(0.08, 0.18);
    }
  }
  mash(dt) {   // 8–10 Hz: press ~50 ms, release, repeat
    const w = this.w;
    this.mashT -= dt;
    if (this.mashUp >= 0 && this.t >= this.mashUp) { w.release(); this.mashUp = -1; }
    if (this.mashT <= 0) { this.mashT = 1 / this.rng.range(8, 10); w.press(); this.stats.taps++; this.mashUp = this.t + this.rng.range(0.04, 0.06); }
  }

  // ------------------------------------------------------------- roaming
  roam(dt) {
    const w = this.w, L = w.layout;
    if (this.campY !== undefined) {           // camper: one depth forever, no dodging
      this.targetY = L.minHookY + this.campY * (L.maxHookY - L.minHookY);
      if (this.campY <= 0) { if (w.hook.holding) w.release(); return; }
      if (this.campY >= 1) { if (!w.hook.holding) w.press(); return; }
      this.motor(); return;
    }
    if (this.o.idle && this.t >= this.idleUntil && this.rng.chance(this.o.idle * dt)) {
      this.idleUntil = this.t + this.rng.range(1, 3); this.stats.idles++;
    }
    if (this.t < this.idleUntil) { if (w.hook.holding) w.release(); return; }
    if (this.t >= this.nextThink) { this.think(); this.nextThink = this.t + this.react() * 0.6; }
    if (this.pending && this.t >= this.pending.at) {
      if (this.pending.id !== this.targetId || this.targetY === null || Math.abs(this.pending.y - this.targetY) > 2) this.bias = this.rng.gauss() * this.o.holdBias;
      this.targetY = this.pending.y; this.targetId = this.pending.id; this.pending = null;
    }
    this.motor();
  }

  think() {
    const w = this.w, L = w.layout, hk = w.hook, d = w.diff, C = this.PR.CONFIG;
    // notice puffers (each puffer: ignored for good with p = ignorePuffer, else seen after a reaction time)
    for (const p of w.items) if (p.kind === 'puffer' && !this.puf.has(p.id)) this.puf.set(p.id, { ignored: this.rng.chance(this.o.ignorePuffer), seenAt: this.t + this.react() });
    let best = null, bestV = -1, bestY = 0;
    for (const it of w.items) {
      if (it.kind !== 'gem' || it.state !== 'swim') continue;
      const dx = L.holeX - it.x, approaching = (dx > 0) === (it.vx > 0), reach = it.r + hk.r;
      if (!approaching && Math.abs(dx) > reach) continue;
      if (this.o.nearest) {                                      // kid: nearest gem, where it is now
        const v = 1 / (1 + Math.hypot(dx, it.y - hk.y));
        if (v > bestV) { bestV = v; best = it; bestY = it.y; }
      } else {                                                   // adult: predict, skip hopeless ones, value / time
        const tMid = Math.abs(dx) / Math.abs(it.vx);
        const gy = it.by + Math.sin(it.phase + it.bobRate * tMid) * it.bobAmp;
        const dist = gy - hk.y, travel = Math.abs(dist) / (dist > 0 ? d.sinkTerm : d.riseTerm) + 0.3 + this.o.react[1];
        const tWin = (Math.abs(dx) + reach) / Math.abs(it.vx);
        if (travel > tWin) continue;
        const depthFrac = (gy - L.waterTop) / (L.maxHookY - L.waterTop);
        let v = (C.points[it.type] || 10) / (Math.max(tMid, travel) + depthFrac * d.stepsFull * 1.6 + 1);
        if (it.id === this.targetId) v *= 1.2;
        if (v > bestV) { bestV = v; best = it; bestY = gy; }
      }
    }
    let y = best ? bestY : (this.o.nearest ? (this.targetY == null ? L.minHookY + 40 : this.targetY) : (L.bands[0] + L.bands[1]) / 2);
    y = clamp(y, L.minHookY, L.maxHookY);
    y = this.avoid(y);
    const id = best ? best.id : 0;
    if (id === this.targetId && this.targetY !== null && Math.abs(y - this.targetY) < 25) { this.targetY = y; return; }  // same plan: keep going
    if (!this.pending || this.pending.id !== id) this.pending = { at: this.t + this.react() * (best && this.targetId === 0 ? 1 : 0.5), y, id };
    else this.pending.y = y;
  }

  avoid(want) {
    const w = this.w, L = w.layout, hk = w.hook, bands = [];
    for (const p of w.items) {
      if (p.kind !== 'puffer' || p.state !== 'swim' || p.leaving) continue;
      const s = this.puf.get(p.id);
      if (!s || s.ignored || this.t < s.seenAt) continue;
      const dx = L.holeX - p.x, R = p.r + hk.r + this.o.pufferMargin;
      const approaching = (dx > 0) === (p.vx > 0);
      if (!approaching && Math.abs(dx) > R) continue;
      if (Math.max(0, (Math.abs(dx) - R) / Math.abs(p.vx)) > this.o.pufferLook) continue;
      bands.push({ top: p.by - p.bobAmp - R, bot: p.by + p.bobAmp + R });
    }
    if (!bands.length) return want;
    const free = y => bands.every(b => y <= b.top || y >= b.bot);
    const pathFree = (a, b) => { const lo = Math.min(a, b), hi = Math.max(a, b); return bands.every(k => hi <= k.top || lo >= k.bot); };
    if (pathFree(hk.y, want)) return want;
    const c = [hk.y, L.minHookY, L.maxHookY]; for (const b of bands) c.push(b.top - 3, b.bot + 3);
    let best = null, sc = 1e9;
    for (let y of c) { y = clamp(y, L.minHookY, L.maxHookY); if (!free(y)) continue;
      const s = pathFree(hk.y, y) ? Math.abs(y - want) * 0.25 + Math.abs(y - hk.y) : 1e4 + Math.abs(y - hk.y);
      if (s < sc) { sc = s; best = y; } }
    if (best === null) best = hk.y < (L.minHookY + L.maxHookY) / 2 ? L.minHookY : L.maxHookY;
    this.targetId = -1;       // forces a fresh bias next time a gem is chosen
    return best;
  }

  motor() {   // bang-bang hold/release on a delayed view of the hook, with a per-hold release error
    const w = this.w, hk = w.hook;
    if (this.targetY === null || hk.lost) { if (hk.holding) w.release(); return; }
    const seen = this.hist[0];
    const lead = seen.y + seen.vy * this.o.lead;
    const tgt = this.targetY + this.bias;
    if (lead < tgt - this.o.dead) { if (!hk.holding) { w.press(); this.stats.presses++; } }
    else if (lead > tgt + this.o.dead) { if (hk.holding) { w.release(); this.bias = this.rng.gauss() * this.o.holdBias * 0.5; } }
  }
}

/** Seconds (≥ from) until the needle next crosses the zone centre (what a person "aims" at). */
function nextCross(w, from) {
  const z = w.reel.zone, h = 1 / 480; let prev = w.needleAfter(from) - z;
  const end = from + 2.2 / Math.max(0.1, w.reel.speed);
  for (let t = from + h; t < end; t += h) {
    const cur = w.needleAfter(t) - z;
    if (cur === 0 || (cur > 0) !== (prev > 0)) return t;
    prev = cur;
  }
  return from;
}

class Spam {   // 8–10 Hz the whole game, no aiming at all
  constructor(PR, world, opts) { this.w = world; this.rng = new PR.RNG(opts.seed == null ? 5 : opts.seed); this.t = 0; this.next = 0; this.up = -1; this.stats = { taps: 0 }; }
  step() {
    const w = this.w; this.t += 1 / 60;
    if (this.up >= 0 && this.t >= this.up) { w.release(); this.up = -1; }
    if (this.t >= this.next) { this.next = this.t + 1 / this.rng.range(8, 10); w.press(); this.stats.taps++; this.up = this.t + this.rng.range(0.04, 0.06); }
  }
}
// Spam uses a fixed 1/60 clock; run.js always steps at 1/60.

function make(kind, PR, world, opts) {
  opts = opts || {};
  switch (kind) {
    case 'bot': return new PR.Bot(world, { skill: opts.skill, seed: opts.seed });
    case 'kid': return new Human(PR, world, Object.assign({}, opts, { kind: 'kid' }));
    case 'adult': return new Human(PR, world, Object.assign({}, opts, { kind: 'adult' }));
    case 'spamReel': return new Human(PR, world, Object.assign({}, opts, { kind: 'adult', reelMode: 'mash' }));
    case 'kidMash': return new Human(PR, world, Object.assign({}, opts, { kind: 'kid', reelMode: 'mash' }));
    case 'camper': return new Human(PR, world, Object.assign({}, opts, { kind: 'adult', campDepth: opts.depth == null ? 0.3 : opts.depth }));
    case 'spam': return new Spam(PR, world, opts);
    default: throw new Error('unknown player ' + kind);
  }
}
module.exports = { make, PROFILES, nextCross };
