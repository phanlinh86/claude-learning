// Pebble's Oasis Run — human-like player models for the high-speed playtest (tests/sim/playtest.js).
// Every model drives the world ONLY through world.move(dir) / world.jump(); it may *read* world state
// (that's its "eyes"), but each model limits what it perceives (look-ahead, nearest-only, lapses) and
// acts after a reaction delay, like a person would.
'use strict';

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

/**
 * Perceiving player. Parameters:
 *  reaction [a,b] s   delay from seeing something to the finger moving (uniform in [a,b] per action)
 *  look s             how far ahead (time-to-reach) things are noticed
 *  nearestOnly        only the single nearest obstacle (any lane) is considered
 *  predictTumble      predicts where a rolling tumbleweed will be (else uses its current x)
 *  seePillowFly p     chance to notice a pillow while it is still flying (its shadow); else only once it has landed
 *  lapse p            chance an obstacle is never noticed until it is within 0.45 s
 *  wrongSwipe p       chance a dodge swipe goes the wrong way
 *  jumpBias, jumpSd s jump timing error vs. the ideal moment (+ = late)
 *  randomJump /s      Poisson rate of "just because" jumps
 *  middlePull /s      rate of drifting back to the middle lane when nothing is in the way
 *  shellChase p       chance to go for a shell run seen in an adjacent lane
 *  perceiveEvery s    how often the eyes refresh
 */
class Perceiver {
  constructor(world, rng, p) {
    this.w = world; this.r = rng; this.p = p;
    this.t = 0; this.nextLook = 0; this.chased = new Set(); this.queue = []; this.seen = {}; this.jumpPlanned = {}; this.jumps = [];
    this.intentLane = world.hero.lane; this.stats = { moves: 0, jumps: 0, wrong: 0, randomJumps: 0, lapses: 0 };
  }
  _react() { const [a, b] = this.p.reaction; return this.r.range(a, b); }
  _at(t, fn) { this.queue.push({ at: t, fn }); }

  _xAt(o, tReach) {
    if (o.kind === 'pillow' && o.state === 'fly') return o.landX;
    if (o.kind !== 'tumble' || !this.p.predictTumble) return o.x;
    let x = o.x, vx = o.vx, b = o.bounces, t = tReach;
    if (!o.awake) { const v = Math.max(this.w.speed, 1); t = Math.max(0, t - Math.max(0, (o.z - v * o.wake) / v)); }
    for (let k = 0; k < 60 && t > 0; k++) { const dt = Math.min(t, 0.05); x += vx * dt; t -= dt; if (b < 1 && Math.abs(x) > 1.45 && (x > 0) === (vx > 0)) { vx = -vx * 0.9; b++; } }
    return x;
  }

  _perceive() {
    const w = this.w, v = Math.max(w.speed, 1), p = this.p, out = [];
    for (const o of w.objects) {
      if (o.kind === 'shell' || (o.state !== 'live' && o.state !== 'fly')) continue;
      const z = o.state === 'fly' ? o.landS - w.dist : o.z;
      if (z < 0.2) continue;
      const tR = z / v;
      if (tR > p.look) continue;
      if (this.seen[o.id] === undefined) {
        let lapse = this.r.chance(p.lapse);
        if (o.state === 'fly' && !this.r.chance(p.seePillowFly)) lapse = 'fly';
        this.seen[o.id] = lapse; if (lapse === true) this.stats.lapses++;
      }
      const s = this.seen[o.id];
      if (s === true && tR > 0.45) continue;
      if (s === 'fly' && o.state === 'fly') continue;
      out.push({ o, z, tR, x: this._xAt(o, tR), tall: o.h > 1 });
    }
    out.sort((a, b) => a.z - b.z);
    // a kid sees the nearest *row* (everything at about the same distance), nothing behind it
    return p.nearestOnly && out.length ? out.filter(d => d.z <= out[0].z + 0.6) : out;
  }

  _laneCost(lane, ds, fromLane) {
    const n = Math.abs(lane - fromLane), arrive = n ? (this.p.reaction[0] + this.p.reaction[1]) / 2 + 0.15 * n : 0;
    let c = n * 1.5;
    for (const d of ds) {
      // a two-lane move crosses the middle lane: something tall there while crossing blocks it
      if (n === 2 && d.tall && Math.abs(d.x - (lane + fromLane) / 2) < 0.5 + d.o.w && d.tR > arrive - 0.45 && d.tR < arrive + 0.1) c += 1000;
      if (Math.abs(d.x - lane) >= 0.5 + d.o.w) continue;
      if (n && d.tR + 0.7 / Math.max(this.w.speed, 1) < this.p.reaction[0]) continue;   // fully behind me before I even start moving
      c += d.tall ? 100 + 20 / (0.2 + d.tR) : (d.tR < 0.5 ? 6 : 2);
    }
    return c;
  }

  _schedMove(dir, delay) {
    this._at(this.t + delay, () => { if (this.w.move(dir)) this.stats.moves++; });
  }

  step(dt) {
    const w = this.w, h = w.hero, p = this.p;
    this.t += dt;
    if (w.phase !== 'play') return;
    for (let i = 0; i < this.queue.length; i++) {
      const a = this.queue[i];
      if (a.at <= this.t) { a.fn(); this.queue.splice(i, 1); i--; }
    }
    for (let i = 0; i < this.jumps.length; i++) {
      const j = this.jumps[i], o = j.o, z = o.state === 'fly' ? o.landS - w.dist : o.z;
      if (z < -1 || o.state === 'hit' || o.state === 'gone') { this.jumps.splice(i--, 1); continue; }
      if (this.t >= j.notBefore && z / Math.max(w.speed, 1) <= j.lead) { w.jump(); this.stats.jumps++; this.jumps.splice(i--, 1); }
    }
    if (p.randomJump && this.r.chance(p.randomJump * dt)) { this.stats.randomJumps++; this._at(this.t + 0.05, () => { w.jump(); this.stats.jumps++; }); }
    if (this.t < this.nextLook) return;
    this.nextLook = this.t + p.perceiveEvery;
    const ds = this._perceive(), v = Math.max(w.speed, 1);

    // --- lanes: dodge a tall thing in my (intended) lane
    const busy = this.queue.some(q => q.move);
    const lane = this.intentLane;
    const threat = ds.find(d => d.tall && Math.abs(d.x - lane) < 0.5 + d.o.w);
    if (threat && !busy) {
      let best = lane, bestC = 1e9;
      for (let l = -1; l <= 1; l++) {
        if (l === lane) continue;
        if (p.nearestOnly && Math.abs(l - lane) > 1) continue;          // a kid swipes once
        let c = this._laneCost(l, ds, lane) + (p.middleBias && l === 0 ? -0.5 : 0);
        if (c < bestC) { bestC = c; best = l; }
      }
      if (bestC >= this._laneCost(lane, ds, lane) - 0.5) best = lane;    // nowhere better right now: wait and look again
      let dir = Math.sign(best - lane), n = Math.abs(best - lane);
      if (n && p.wrongSwipe && this.r.chance(p.wrongSwipe)) { dir = -dir || (this.r.chance(0.5) ? 1 : -1); n = 1; this.stats.wrong++; }
      const delay = this._react();
      if (dir) for (let k = 0; k < n; k++) { const q = { at: this.t + delay + k * 0.12, fn: () => { if (w.move(dir)) this.stats.moves++; }, move: true }; this.queue.push(q); }
      this.intentLane = clamp(lane + dir * n, -1, 1);
    } else if (!threat && !busy) {
      // shells / drift to the middle when nothing is coming
      if (p.shellChase && !ds.some(d => d.tR < 1.2)) {
        const sh = w.objects.find(o => o.kind === 'shell' && o.state === 'live' && !o.arc && o.z > 1 && o.z / v < p.look && Math.abs(o.x - lane) === 1);
        if (sh && !this.chased.has(sh.grp)) {
          const go = this.r.chance(p.shellChase); this.chased.add(sh.grp);
          // don't go into a lane with something tall soon
          if (go && !ds.some(d => d.tall && Math.abs(d.x - sh.x) < 0.8)) {
            const dir = Math.sign(sh.x - lane);
            this.queue.push({ at: this.t + this._react(), fn: () => { if (w.move(dir)) this.stats.moves++; }, move: true });
            this.intentLane = lane + dir;
          }
        }
      }
      if (p.middlePull && this.intentLane !== 0 && !ds.some(d => d.tR < 1.5) && this._laneCost(0, ds, this.intentLane) < 50 && this.r.chance(p.middlePull * p.perceiveEvery)) {
        const dir = -Math.sign(this.intentLane);
        this.queue.push({ at: this.t + this._react(), fn: () => { if (w.move(dir)) this.stats.moves++; }, move: true });
        this.intentLane = 0;
      }
    }
    // keep the belief in sync if the world clamped a move
    if (!this.queue.some(q => q.move)) this.intentLane = h.lane;

    // --- jumps: a low thing in my lane
    for (const d of ds) {
      if (d.tall || this.jumpPlanned[d.o.id]) continue;
      if (Math.abs(d.x - this.intentLane) >= 0.5 + d.o.w) continue;
      if (d.o.state === 'fly' && d.o.T - d.o.t > d.tR) continue;      // still in the air when I get there
      this.jumpPlanned[d.o.id] = true;
      // visual timing: take off when it *looks* ≈ 0.33 s away (± the player's timing error), but never before the
      // reaction delay has passed. Re-checked every frame against the real distance, so a speed change is followed.
      this.jumps.push({ o: d.o, notBefore: this.t + this._react(), lead: (0.3 + 0.3 / v) - p.jumpBias - this.r.gauss() * p.jumpSd });
    }
  }
}

const MODELS = {
  // a 5–6-year-old: slow, nearest thing only, sloppy jumps, likes the middle, sometimes swipes the wrong way
  kid: { reaction: [0.6, 0.9], look: 2.2, nearestOnly: true, predictTumble: false, seePillowFly: 0.5, lapse: 0.08,
    wrongSwipe: 0.12, jumpBias: 0.08, jumpSd: 0.14, randomJump: 0.12, middlePull: 0.5, middleBias: true, shellChase: 0.35, perceiveEvery: 0.15 },
  // a casual adult: quick-ish, sees 2 s ahead and all lanes, decent timing
  adult: { reaction: [0.3, 0.4], look: 2.0, nearestOnly: false, predictTumble: true, seePillowFly: 0.95, lapse: 0.03,
    wrongSwipe: 0.01, jumpBias: 0.02, jumpSd: 0.06, randomJump: 0, middlePull: 0.15, middleBias: false, shellChase: 0.7, perceiveEvery: 0.1 }
};

/** Make a player: returns { step(dt), stats }. kinds: kid, adult, jumpSpam, zigzag, zigJump, idleMid, idleSide,
 *  botAlwaysJump (bot lanes + jump every frame), botNeverJump (bot lanes, jump removed), bot */
function makePlayer(kind, world, PO, seed, opt) {
  opt = opt || {};
  const rng = new PO.RNG('player' + kind + seed);
  if (MODELS[kind]) return new Perceiver(world, rng, Object.assign({}, MODELS[kind], opt.params || {}));
  if (kind === 'bot') return new PO.Bot(world, { skill: opt.skill, seed: seed * 7 + 1 });
  if (kind === 'botAlwaysJump' || kind === 'botNeverJump') {
    const bot = new PO.Bot(world, { skill: opt.skill === undefined ? 0.9 : opt.skill, seed: seed * 7 + 1 });
    if (kind === 'botNeverJump') bot._checkJump = function () {};
    return { stats: bot.stats, step(dt) { bot.step(dt); if (kind === 'botAlwaysJump') world.jump(); } };
  }
  let t = 0, nextZ = 0, dir = 1;
  const period = opt.period || 0.25;
  return {
    stats: {},
    step(dt) {
      t += dt;
      if (kind === 'idleSide' && t < 0.1) world.move(-1);
      if (kind === 'jumpSpam' || kind === 'zigJump') world.jump();
      if ((kind === 'zigzag' || kind === 'zigJump') && t >= nextZ) {
        nextZ = t + period;
        if (world.hero.lane === dir) dir = -dir;
        world.move(dir);
      }
    }
  };
}

module.exports = { makePlayer, MODELS, Perceiver };
