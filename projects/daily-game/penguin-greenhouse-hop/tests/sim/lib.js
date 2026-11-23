// Puddle's Greenhouse Hop — headless playtest library (report-only: never edits game/).
// Loads game/js/{rng,world,weather,bot}.js into a node vm (tests/unit/load.js), runs rounds with the
// PH.Bot or with human-like player models that only use world.steer(-1|0|1) and read what is on screen.
'use strict';
const path = require('path');
const { load } = require(path.join(__dirname, '..', 'unit', 'load.js'));

function freshFH(patch) {
  const PH = load();
  if (patch) applyPatch(PH.World.CONFIG, patch);
  return PH;
}
// patch: {"growRate": 0.005, "difficulty.easy.maxSize": 1.4, "goal.easy": 110, ...}
function applyPatch(C, patch) {
  for (const key of Object.keys(patch)) {
    const parts = key.split('.');
    let o = C;
    for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    const v = patch[key];
    o[parts[parts.length - 1]] = Array.isArray(v) ? v.slice() : v;
  }
}

// ---------------------------------------------------------------- stats helpers
function quant(arr, q) {
  if (!arr.length) return NaN;
  const a = arr.slice().sort((x, y) => x - y);
  const i = (a.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return a[lo] + (a[hi] - a[lo]) * (i - lo);
}
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN;

// ---------------------------------------------------------------- world clone (for the fairness oracle)
function cloneWorld(w) {
  const memo = new Map();
  function c(o) {
    if (o === null || typeof o !== 'object') return o;
    if (memo.has(o)) return memo.get(o);
    const out = Array.isArray(o) ? [] : Object.create(Object.getPrototypeOf(o));
    memo.set(o, out);
    for (const k of Object.keys(o)) out[k] = k === 'D' ? o[k] : c(o[k]);
    return out;
  }
  const n = c(w);
  Object.defineProperty(n.fireflies, 'valueOf', { value: () => n.fireflyCount, enumerable: false });
  Object.defineProperty(n.fireflies, 'toString', { value: () => String(n.fireflyCount), enumerable: false });
  return n;
}

/** Perfect-information oracle: from a snapshot, is there ANY two-segment steering (hold d1 for ts, then d2)
 *  that gets Puddle onto a platform (rescue mats excluded) before she falls? Returns {ok, tried}. */
function oracle(snap, maxT) {
  maxT = maxT || 3.2;
  const dirs = [-1, 0, 1];
  let tried = 0;
  for (const d1 of dirs) for (let ts = 0; ts <= 1.8001; ts += 0.1) for (const d2 of dirs) {
    if (ts === 0 && d1 !== 0) continue;            // ts = 0 → just d2
    tried++;
    const w = cloneWorld(snap); w.events = [];
    const dt = 1 / 120;
    let ok = false, dead = false;
    for (let t = 0; t < maxT; t += dt) {
      w.steer(t < ts ? d1 : d2);
      w.update(dt);
      for (const e of w.drainEvents()) {
        if (e.type === 'bounce' && e.kind !== 'rescue' && e.kind !== 'ground') ok = true;
        if (e.type === 'bounce' && e.kind === 'ground') ok = true;
        if (e.type === 'fall' || e.type === 'gameOver') dead = true;
      }
      if (ok || dead) break;
    }
    if (ok) return { ok: true, tried };
  }
  return { ok: false, tried };
}

/** Two-hop oracle: from an earlier take-off, is there a steering that lands on a platform from which the
 *  one-hop oracle can still continue? (A fall is only called UNFAIR when even this fails.) */
function oracle2(snap) {
  const dirs = [-1, 0, 1];
  for (const d1 of dirs) for (let ts = 0; ts <= 1.8001; ts += 0.15) for (const d2 of dirs) {
    if (ts === 0 && d1 !== 0) continue;
    const w = cloneWorld(snap); w.events = [];
    const dt = 1 / 120;
    let res = null;
    for (let t = 0; t < 3.2 && res === null; t += dt) {
      w.steer(t < ts ? d1 : d2);
      w.update(dt);
      for (const e of w.drainEvents()) {
        if (e.type === 'bounce' && e.kind !== 'rescue') { res = oracle(w).ok; break; }
        if (e.type === 'fall' || e.type === 'gameOver') { res = false; break; }
      }
    }
    if (res) return { ok: true };
  }
  return { ok: false };
}

// ---------------------------------------------------------------- player models (public input API only)
const G = PH => PH.World.CONFIG;

function timeTo(C, h, py) {                       // seconds until the feet come down through py (eyeballed arc)
  const vy = h.vy, apex = vy > 0 ? h.y + vy * vy / (2 * C.g) : h.y;
  if (py > apex) return null;
  let t = (vy + Math.sqrt(Math.max(0, vy * vy + 2 * C.g * (h.y - py)))) / C.g;
  if (vy - C.g * t < -C.maxFall) { const tc = (vy + C.maxFall) / C.g, yc = h.y + vy * tc - 0.5 * C.g * tc * tc; t = tc + Math.max(0, (yc - py) / C.maxFall); }
  return t;
}
function liveSolid(p) { return p.state === 'live' && !(p.kind === 'rescue' && p.bounces > 0); }

/** delayed output: what the finger does `delay` s after the brain decided */
class Finger {
  constructor() { this.q = []; this.out = 0; }
  push(t, dir, delay) { const last = this.q.length ? this.q[this.q.length - 1].at : 0; this.q.push({ at: Math.max(last, t + delay), dir }); }
  get(t) { while (this.q.length && this.q[0].at <= t) this.out = this.q.shift().dir; return this.out; }
}

/** Kid (age 4–6): slow reaction, aims at the NEAREST higher platform's current centre (no basket lead),
 *  no drift prediction (overshoots), keeps holding a bit too long, sometimes lets go. */
function Kid(PH, w, seed, age, opts) {
  age = age || 5;
  const C = G(PH), r = new PH.RNG(seed * 7919 + 13);
  const k = Math.max(0, Math.min(1, (age - 4) / 2));   // 0 at 4, 1 at 6
  const reaction = () => r.range(0.4 + 0.1 * (1 - k), 0.5 + 0.1 * (1 - k)); // 4: .5–.6, 5: .45–.55, 6: .4–.5
  const distract = 0.035 - 0.02 * k, tol = 0.45 - 0.15 * k;
  const antic = (opts && opts.antic !== undefined) ? opts.antic : 0.15 + 0.1 * k;  // 4: 0.15 s, 6: 0.25 s   // s of look-ahead (< reaction): overshoots
  const f = new Finger();
  let t = 0, nextDec = 0, target = null, lastBounceY = 0, lastAir = 9, want = 0, holdUntil = 0, held = 0, idleUntil = 0;
  return {
    name: 'kid' + age,
    step(dt) {
      t += dt;
      const h = w.hero;
      if (h.airT < lastAir) { lastBounceY = h.y; target = null; }
      lastAir = h.airT;
      if (t >= nextDec) {
        nextDec = t + 0.15;
        let dir = 0;
        if (t < idleUntil) dir = 0;
        else if (r.chance(distract)) { idleUntil = t + r.range(0.4, 1.0); dir = 0; }
        else {
          if (target && h.vy < 0 && h.y < target.y - 0.1) target = null;   // falling past it: look again
          if (!target || w.platforms.indexOf(target) < 0 || !liveSolid(target)) {
            const apex = h.vy > 0 ? h.y + h.vy * h.vy / (2 * C.g) : h.y;
            const floor = w.camY - C.fallLine + 0.3;
            let best = null, bd = 1e9;
            for (const p of w.platforms) {
              if (!liveSolid(p) || p.y < floor || p.y > apex + 0.3 || p.y < lastBounceY + 0.3) continue;
              const d = Math.abs(p.x - h.x) + 0.5 * Math.abs(p.y - h.y);
              if (d < bd) { bd = d; best = p; }
            }
            if (!best) for (const p of w.platforms) {      // nothing higher: the nearest thing to land on
              if (!liveSolid(p) || p.y < floor || p.y > apex) continue;
              const d = Math.abs(p.x - h.x) + 0.5 * Math.abs(p.y - h.y);
              if (d < bd) { bd = d; best = p; }
            }
            target = best;
          }
          if (target) {
            const err = target.x - (h.x + h.vx * antic);  // platform where it is NOW (no lead); only part of her own drift
            dir = Math.abs(err) > tol ? Math.sign(err) : 0;
          }
        }
        // holds too long: with p = 0.6 a release / reversal comes late (age 4: +0.1–0.3 s, age 6: +0.05–0.15 s)
        if (dir !== held && held !== 0) {
          if (holdUntil === 0 && r.chance(0.6)) holdUntil = t + r.range(0.1 - 0.05 * k, 0.3 - 0.15 * k);
          if (t < holdUntil) dir = held;
        }
        if (dir !== held) { held = dir; holdUntil = 0; }
        f.push(t, dir, reaction());
      }
      w.steer(f.get(t));
    }
  };
}

/** Casual adult: 250 ms reaction, picks the highest platform she can reach (a simple reach estimate that knows
 *  a big Puddle steers slower), leads baskets from their visible motion, release-point steering. */
function Casual(PH, w, seed, opts) {
  opts = opts || {};
  const C = G(PH), r = new PH.RNG(seed * 104729 + 7);
  const delay = opts.delay || 0.25, sd = opts.noise || 0.25;
  const f = new Finger();
  let t = 0, nextDec = 0, target = null, noise = 0, lastAir = 9, lastBounceY = 0, nextX = null, repeat = 0, lastPlat = 0;
  return {
    name: opts.name || 'casual',
    step(dt) {
      t += dt;
      const h = w.hero, kf = PH.World.steerF(h.size), lead = (p, T) => Math.max(p.xm - p.hr, Math.min(p.xm + p.hr, p.x + p.vx * T * 0.7));
      if (h.airT < lastAir) { repeat = h.lastPlat === lastPlat ? repeat + 1 : 0; lastPlat = h.lastPlat; lastBounceY = h.y; }
      lastAir = h.airT;
      if (t >= nextDec) {
        nextDec = t + 0.1;
        const floor = w.camY - C.fallLine + 0.3;
        let best = null, bs = -1e9;
        for (const p of w.platforms) {
          if (!liveSolid(p) || p.y < floor) continue;
          const T = timeTo(C, h, p.y); if (T === null || T < 0.05) continue;
          const px = p.kind === 'basket' ? lead(p, T) : p.x;
          const need = Math.max(0, Math.abs(px - h.x) - p.w / 2);
          const toward = Math.sign(px - h.x) === Math.sign(h.vx) && Math.abs(h.vx) > 3;   // already on the way: no new reaction needed
          const can = C.maxVx * kf * Math.max(0, T - (toward ? 0.05 : delay + 0.1));
          if (need > can) continue;
          let s = p.y - 0.15 * Math.abs(px - h.x) + (p.spring ? 1.5 : 0) + (p.kind === 'leaf' && h.big ? 0.4 : 0);
          if (p === target) s += 0.4;
          if (s > bs) { bs = s; best = p; }
        }
        if (best && repeat >= 2 && best.y < lastBounceY + 0.3) best = null;   // bored of waiting: try the next step anyway
        if (!best) {                                   // nothing looks reachable: head for the nearest higher one anyway
          let bd = 1e9;
          for (const p of w.platforms) {
            if (!liveSolid(p) || p.y < floor || p.y < lastBounceY + 0.3) continue;
            const T = timeTo(C, h, p.y); if (T === null) continue;
            const d = Math.abs(p.x - h.x); if (d < bd) { bd = d; best = p; }
          }
        }
        if (best !== target) {
          target = best; noise = r.gauss() * sd; nextX = null;
          if (target) {                                // look one step ahead: land on the side nearest the next step
            let nb = 0;
            for (const q of w.platforms) {
              if (q === target || !liveSolid(q)) continue;
              const dy = q.y - target.y; if (dy < 0.3 || dy > 2.8) continue;
              if (Math.abs(q.x - target.x) <= 0.9 * PH.World.reachX(dy, C, kf) + (q.w + target.w) / 2 - 0.3 && dy > nb) { nb = dy; nextX = q.x; }
            }
          }
        }
        let dir = 0;
        if (target) {
          const T = timeTo(C, h, target.y) || 0.3;
          let px = target.kind === 'basket' ? lead(target, T) : target.x;
          if (nextX !== null && target.kind !== 'basket') { const room = Math.max(0, target.w / 2 - 0.35); px = Math.max(px - room, Math.min(px + room, nextX)); }
          const err = px + noise - (h.x + h.vx * (1 / (C.drag * kf) + 0.8 * delay));   // an adult anticipates most of the own latency
          const dead = Math.max(0.15, Math.min(0.35, target.w * 0.15));
          dir = err > dead ? 1 : err < -dead ? -1 : 0;
          if (dir && dir !== Math.sign(h.vx) && Math.abs(h.vx) > 2 && Math.abs(err) < 1.0) dir = 0;   // small overshoot: just let go
        }
        f.push(t, dir, delay);
      }
      w.steer(f.get(t));
    }
  };
}

function BotPlayer(PH, w, seed, skill) {
  const b = new PH.Bot(w, { skill, seed });
  return { name: 'bot' + skill, step(dt) { b.step(dt); } };
}
/** the PH.Bot's planning (skill 1: no noise, no bad picks) but with a fixed hand latency of `lag` s: isolates
 *  how much of the difficulty is pure reaction time */
function LagBot(PH, w, seed, lag) {
  const real = w.steer.bind(w), f = new Finger(); let t = 0, want = 0;
  const proxy = Object.create(w); proxy.steer = d => { want = d; };
  const b = new PH.Bot(proxy, { skill: 1, seed });
  return { name: 'lagBot' + lag, step(dt) { t += dt; b.step(dt); f.push(t, want, lag); real(f.get(t)); } };
}
function Idle(PH, w) { return { name: 'idle', step() { w.steer(0); } }; }
function Hold(PH, w, seed, d) { return { name: d < 0 ? 'holdLeft' : 'holdRight', step() { w.steer(d); } }; }
function Alt(PH, w, seed, period) {
  let t = 0;
  return { name: 'alt' + period, step(dt) { t += dt; w.steer(Math.floor(t / period) % 2 ? 1 : -1); } };
}
function Mash(PH, w, seed) {                       // a toddler mashing the screen at random
  const r = new PH.RNG(seed * 31 + 5); let t = 0, next = 0, d = 0;
  return { name: 'mash', step(dt) { t += dt; if (t >= next) { next = t + r.range(0.2, 0.7); d = r.int(-1, 1); } w.steer(d); } };
}
/** fall farmer: plays casual but deliberately drops off whenever it has ≥ 3 hearts (the umbrella throws 6.2 u up) */
function FallFarm(PH, w, seed) {
  const c = Casual(PH, w, seed, { name: 'fallFarm' });
  return { name: 'fallFarm', step(dt) {
    if (w.hearts >= 3 && w.hero.rescueT <= 0 && w.hero.vy < 0) { w.steer(w.hero.x < 6 ? -1 : 1); return; }
    c.step(dt);
  } };
}

const PLAYERS = {
  bot: (PH, w, s, a) => BotPlayer(PH, w, s, a),
  kid: (PH, w, s, a) => Kid(PH, w, s, a),
  casual: (PH, w, s, a) => Casual(PH, w, s, a),
  lagBot: (PH, w, s, a) => LagBot(PH, w, s, a),
  idle: Idle, holdLeft: (PH, w, s) => Hold(PH, w, s, -1), holdRight: (PH, w, s) => Hold(PH, w, s, 1),
  altFast: (PH, w, s) => Alt(PH, w, s, 0.1), altSlow: (PH, w, s) => Alt(PH, w, s, 0.5),
  mash: Mash, fallFarm: FallFarm
};

// ---------------------------------------------------------------- one round
/** opts: {diff, seed, player:'kid', arg:5, maxT:600, unlimited:false, oracle:false|'sample', dt:1/60} */
function runRound(PH, opts) {
  const C = PH.World.CONFIG;
  const dt = opts.dt || 1 / 60, maxT = opts.maxT || 600;
  const w = new PH.World({ seed: opts.seed, difficulty: opts.diff });
  if (opts.unlimited) { w.hearts = 1e6; }
  const pl = PLAYERS[opts.player](PH, w, opts.seed, opts.arg);
  const m = { player: pl.name, diff: opts.diff, seed: opts.seed, time: 0, over: false, score: 0, maxY: 0, levels: 0,
    levelT: [], falls: [], firstPoint: null, firstPlat: null, firstFly: null, fireflies: 0, lanterns: 0,
    timeByZone: [0, 0, 0, 0], stall: 0, heartsGained: 0, springs: 0, leafFlicks: 0, swings: 0, bigTime: 0, unfair: [] };
  let lastLevelT = 0, bigT = null, lastKind = 'ground', lastSpring = false, sinceRescue = false, snap = null, snapInfo = null;
  let lastBounceT = 0, snapPrev = null, stallY = 0, stallT = 0;
  while (w.time < maxT) {
    pl.step(dt);
    w.update(dt);
    m.timeByZone[w.zone] += dt;
    if (w.maxY >= stallY + 1) { stallY = w.maxY; stallT = w.time; } else if (w.time - stallT > m.stall) m.stall = w.time - stallT;
    if (m.firstPoint === null && w.score > 0) m.firstPoint = w.time;
    for (const e of w.drainEvents()) {
      if (e.type === 'bounce') {
        if (e.kind !== 'ground' && e.kind !== 'rescue' && m.firstPlat === null) m.firstPlat = w.time;
        if (e.kind !== 'rescue') sinceRescue = false;
        lastKind = e.kind; lastSpring = !!e.spring; lastBounceT = w.time;
        if (e.spring) m.springs++;
        if (opts.oracle && w.phase === 'play') { snapPrev = snap; snap = cloneWorld(w); snapInfo = { kind: e.kind, spring: !!e.spring, t: w.time, y: e.y }; }
      } else if (e.type === 'firefly') { if (m.firstFly === null) m.firstFly = w.time; }
      else if (e.type === 'lantern') m.lanterns++;
      else if (e.type === 'heartGain') m.heartsGained++;
      else if (e.type === 'big') { if (bigT === null) bigT = w.time - lastLevelT; }
      else if (e.type === 'levelUp') { m.levelT.push({ zone: (e.level - 1) % 4, level: e.level - 1, dt: w.time - lastLevelT, size: e.size, bigAt: bigT, falls: m.falls.filter(f => f.level === e.level - 1).length }); lastLevelT = w.time; bigT = null; }
      else if (e.type === 'fall') {
        const f = { t: w.time, level: w.level, zone: w.zone, size: w.hero.size, lastKind, lastSpring,
          postRescue: sinceRescue, air: w.time - lastBounceT };
        if (opts.oracle && snap && (opts.oracle === true || opts.oracle(f))) {
          const o = oracle(snap);
          f.doomed = !o.ok;                            // nothing could be done after the LAST bounce
          f.avoidable = o.ok || (snapPrev ? oracle2(snapPrev).ok : false);
          if (!f.avoidable) m.unfair.push(Object.assign({ seed: opts.seed, diff: opts.diff, at: snapInfo }, f));
        }
        m.falls.push(f);
        sinceRescue = true;
        if (opts.unlimited) w.hearts = 1e6;
      } else if (e.type === 'gameOver') { m.over = true; }
    }
    if (w.phase !== 'play') break;
  }
  m.time = w.time; m.score = w.score; m.maxY = w.maxY; m.levels = w.level; m.fireflies = w.fireflyCount;
  m.leafFlicks = w.stats.leafFlicks; m.swings = w.stats.swings; m.bigTime = w.stats.bigTime; m.maxSize = w.stats.maxSize;
  m.curLevel = { dt: w.time - lastLevelT, size: w.hero.size, bigAt: bigT };
  return m;
}

module.exports = { Casual, Kid, freshFH, applyPatch, runRound, cloneWorld, oracle, oracle2, quant, mean, PLAYERS };
