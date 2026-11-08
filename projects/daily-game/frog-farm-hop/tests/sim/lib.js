// Clover's Farm Hop — headless playtest library (report-only: never edits game/).
// Loads game/js/{rng,world,weather,bot}.js into a node vm (tests/unit/load.js), runs rounds with the
// FH.Bot or with human-like player models that only use world.steer(-1|0|1) and read what is on screen.
'use strict';
const path = require('path');
const { load } = require(path.join(__dirname, '..', 'unit', 'load.js'));

function freshFH(patch) {
  const FH = load();
  if (patch) applyPatch(FH.World.CONFIG, patch);
  return FH;
}
// patch: {"difficulty.easy.windK": 0.5, "zones.0.wind.ax": 4, "goal.easy": 110, ...}
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
 *  that gets Clover onto a platform (rescue mats excluded) before she falls? Returns {ok, tried}. */
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
const G = FH => FH.World.CONFIG;

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

/** Kid (age 4–6): slow reaction, aims at the NEAREST higher platform's current centre (no cart lead),
 *  no drift prediction (overshoots), keeps holding a bit too long, sometimes lets go, ignores the wind warning. */
function Kid(FH, w, seed, age, opts) {
  age = age || 5;
  const C = G(FH), r = new FH.RNG(seed * 7919 + 13);
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

/** Casual adult: 250 ms reaction, picks the highest platform she can reach (a simple reach estimate),
 *  leads carts from their visible motion, release-point steering, reacts to gusts ~0.6 s late. */
function Casual(FH, w, seed, opts) {
  opts = opts || {};
  const C = G(FH), r = new FH.RNG(seed * 104729 + 7);
  const delay = opts.delay || 0.25, late = opts.late === undefined ? 0.6 : opts.late, sd = opts.noise || 0.25;
  const f = new Finger();
  let t = 0, nextDec = 0, target = null, noise = 0, lastAir = 9, lastBounceY = 0, nextX = null, repeat = 0, lastPlat = 0;
  return {
    name: opts.name || 'casual',
    step(dt) {
      t += dt;
      const h = w.hero, W = w.wind;
      if (h.airT < lastAir) { repeat = h.lastPlat === lastPlat ? repeat + 1 : 0; lastPlat = h.lastPlat; lastBounceY = h.y; }
      lastAir = h.airT;
      if (t >= nextDec) {
        nextDec = t + 0.1;
        const floor = w.camY - C.fallLine + 0.3;
        let best = null, bs = -1e9;
        for (const p of w.platforms) {
          if (!liveSolid(p) || p.y < floor) continue;
          const T = timeTo(C, h, p.y); if (T === null || T < 0.05) continue;
          const px = p.kind === 'cart' ? Math.max(p.x0, Math.min(p.x1, p.x + p.vx * T * 0.7)) : p.x;
          const need = Math.max(0, Math.abs(px - h.x) - p.w / 2);
          const toward = Math.sign(px - h.x) === Math.sign(h.vx) && Math.abs(h.vx) > 3;   // already on the way: no new reaction needed
          const can = C.maxVx * Math.max(0, T - (toward ? 0.05 : delay + 0.1));
          if (need > can) continue;
          let s = p.y - 0.15 * Math.abs(px - h.x) + (p.spring ? 1.5 : 0) - (p.kind === 'puff' ? 0.4 : 0);
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
              if (Math.abs(q.x - target.x) <= 0.9 * FH.World.reachX(dy) + (q.w + target.w) / 2 - 0.3 && dy > nb) { nb = dy; nextX = q.x; }
            }
          }
        }
        let dir = 0;
        if (target) {
          const T = timeTo(C, h, target.y) || 0.3;
          let px = target.kind === 'cart' ? Math.max(target.x0, Math.min(target.x1, target.x + target.vx * T * 0.7)) : target.x;
          if (nextX !== null && target.kind !== 'cart') { const room = Math.max(0, target.w / 2 - 0.35); px = Math.max(px - room, Math.min(px + room, nextX)); }
          let drift = 0;
          if (W.state === 'blow' && W.t > late) drift = W.dir * (W.ax || 0) * W.strength / C.drag * Math.min(T, Math.max(0, W.dur - W.t));
          const err = px + noise - (h.x + h.vx * (1 / C.drag + 0.8 * delay) + drift);   // an adult anticipates most of the own latency
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

function BotPlayer(FH, w, seed, skill) {
  const b = new FH.Bot(w, { skill, seed });
  return { name: 'bot' + skill, step(dt) { b.step(dt); } };
}
/** the FH.Bot's planning (skill 1: no noise, no bad picks) but with a fixed hand latency of `lag` s: isolates
 *  how much of the difficulty is pure reaction time */
function LagBot(FH, w, seed, lag) {
  const real = w.steer.bind(w), f = new Finger(); let t = 0, want = 0;
  const proxy = Object.create(w); proxy.steer = d => { want = d; };
  const b = new FH.Bot(proxy, { skill: 1, seed });
  return { name: 'lagBot' + lag, step(dt) { t += dt; b.step(dt); f.push(t, want, lag); real(f.get(t)); } };
}
function Idle(FH, w) { return { name: 'idle', step() { w.steer(0); } }; }
function Hold(FH, w, seed, d) { return { name: d < 0 ? 'holdLeft' : 'holdRight', step() { w.steer(d); } }; }
function Alt(FH, w, seed, period) {
  let t = 0;
  return { name: 'alt' + period, step(dt) { t += dt; w.steer(Math.floor(t / period) % 2 ? 1 : -1); } };
}
function Mash(FH, w, seed) {                       // a toddler mashing the screen at random
  const r = new FH.RNG(seed * 31 + 5); let t = 0, next = 0, d = 0;
  return { name: 'mash', step(dt) { t += dt; if (t >= next) { next = t + r.range(0.2, 0.7); d = r.int(-1, 1); } w.steer(d); } };
}
/** wall hugger: plays like a casual adult, but during every warning/gust runs into the wall the wind blows to */
function WallHug(FH, w, seed) {
  const c = Casual(FH, w, seed, { name: 'wallHug' });
  return { name: 'wallHug', step(dt) {
    const W = w.wind;
    if (W.state === 'warn' || W.state === 'blow') w.steer(W.dir); else c.step(dt);
  } };
}
/** fall farmer: plays casual but deliberately drops off whenever it has ≥ 3 hearts (rescue throws 6.2 u up) */
function FallFarm(FH, w, seed) {
  const c = Casual(FH, w, seed, { name: 'fallFarm' });
  return { name: 'fallFarm', step(dt) {
    if (w.hearts >= 3 && w.hero.rescueT <= 0 && w.hero.vy < 0) { w.steer(w.hero.x < 6 ? -1 : 1); return; }
    c.step(dt);
  } };
}

const PLAYERS = {
  bot: (FH, w, s, a) => BotPlayer(FH, w, s, a),
  kid: (FH, w, s, a) => Kid(FH, w, s, a),
  casual: (FH, w, s, a) => Casual(FH, w, s, a),
  lagBot: (FH, w, s, a) => LagBot(FH, w, s, a),
  idle: Idle, holdLeft: (FH, w, s) => Hold(FH, w, s, -1), holdRight: (FH, w, s) => Hold(FH, w, s, 1),
  altFast: (FH, w, s) => Alt(FH, w, s, 0.1), altSlow: (FH, w, s) => Alt(FH, w, s, 0.5),
  mash: Mash, wallHug: WallHug, fallFarm: FallFarm
};

// ---------------------------------------------------------------- one round
/** opts: {diff, seed, player:'kid', arg:5, maxT:600, unlimited:false, oracle:false|'sample', dt:1/60} */
function runRound(FH, opts) {
  const C = FH.World.CONFIG;
  const dt = opts.dt || 1 / 60, maxT = opts.maxT || 600;
  const w = new FH.World({ seed: opts.seed, difficulty: opts.diff });
  if (opts.unlimited) { w.hearts = 1e6; }
  const pl = PLAYERS[opts.player](FH, w, opts.seed, opts.arg);
  const m = { player: pl.name, diff: opts.diff, seed: opts.seed, time: 0, over: false, score: 0, maxY: 0, levels: 0,
    levelT: [], falls: [], firstPoint: null, firstPlat: null, firstFly: null, fireflies: 0, lanterns: 0, gustsByZone: [0, 0, 0, 0],
    timeByZone: [0, 0, 0, 0], stall: 0, heartsGained: 0, springs: 0, unfair: [] };
  let lastLevelT = 0, airMaxWind = 0, lastKind = 'ground', lastSpring = false, sinceRescue = false, snap = null, snapInfo = null;
  let lastBounceT = 0, lastCartAway = false, snapPrev = null, stallY = 0, stallT = 0;
  while (w.time < maxT) {
    pl.step(dt);
    w.update(dt);
    const W = w.wind;
    if (W.state === 'blow') airMaxWind = Math.max(airMaxWind, W.strength * (W.ax || 0));
    m.timeByZone[w.zone] += dt;
    if (w.maxY >= stallY + 1) { stallY = w.maxY; stallT = w.time; } else if (w.time - stallT > m.stall) m.stall = w.time - stallT;
    if (m.firstPoint === null && w.score > 0) m.firstPoint = w.time;
    for (const e of w.drainEvents()) {
      if (e.type === 'bounce') {
        if (e.kind !== 'ground' && e.kind !== 'rescue' && m.firstPlat === null) m.firstPlat = w.time;
        if (e.kind !== 'rescue') sinceRescue = false;
        lastKind = e.kind; lastSpring = !!e.spring; airMaxWind = 0; lastBounceT = w.time;
        if (e.spring) m.springs++;
        if (opts.oracle && w.phase === 'play') { snapPrev = snap; snap = cloneWorld(w); snapInfo = { kind: e.kind, spring: !!e.spring, t: w.time, y: e.y }; }
      } else if (e.type === 'firefly') { if (m.firstFly === null) m.firstFly = w.time; }
      else if (e.type === 'lantern') m.lanterns++;
      else if (e.type === 'heartGain') m.heartsGained++;
      else if (e.type === 'windStart') m.gustsByZone[w.zone]++;
      else if (e.type === 'levelUp') { m.levelT.push({ zone: (e.level - 1) % 4, level: e.level - 1, dt: w.time - lastLevelT }); lastLevelT = w.time; }
      else if (e.type === 'fall') {
        const f = { t: w.time, level: w.level, zone: w.zone, wind: airMaxWind, gust: airMaxWind > 1.0, lastKind, lastSpring,
          postRescue: sinceRescue, air: w.time - lastBounceT };
        if (opts.oracle && snap && (opts.oracle === true || opts.oracle(f))) {
          const o = oracle(snap);
          f.doomed = !o.ok;                            // nothing could be done after the LAST bounce
          f.avoidable = o.ok || (snapPrev ? oracle2(snapPrev).ok : false);
          if (!f.avoidable) m.unfair.push(Object.assign({ seed: opts.seed, diff: opts.diff, at: snapInfo }, f));
        }
        m.falls.push(f);
        sinceRescue = true; airMaxWind = 0;
        if (opts.unlimited) w.hearts = 1e6;
      } else if (e.type === 'gameOver') { m.over = true; }
    }
    void lastCartAway;
    if (w.phase !== 'play') break;
  }
  m.time = w.time; m.score = w.score; m.maxY = w.maxY; m.levels = w.level; m.fireflies = w.fireflyCount;
  return m;
}

module.exports = { Casual, Kid, freshFH, applyPatch, runRound, cloneWorld, oracle, oracle2, quant, mean, PLAYERS };
