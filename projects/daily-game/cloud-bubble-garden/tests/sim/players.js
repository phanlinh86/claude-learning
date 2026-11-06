// Nimbus's Bubble Garden — player models for the playtest sims. Each is { attach(w, NB, seed), step(dt, w, t) }.
// Human-like models steer through world.setTarget (touch: the target is the finger minus CONFIG.touchLift, as
// main.js does) or world.setMove (keyboard), with their own reaction delays, aim noise and attention lapses.
'use strict';

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

/** NB.Bot at a given skill. */
function bot(skill) {
  let b;
  return {
    name: 'bot' + skill,
    attach(w, NB, seed) { b = new NB.Bot(w, { skill, seed: seed * 31 + 7 }); },
    step(dt) { b.step(dt); }
  };
}

// --------------------------------------------------------------------------- shared helpers
function live(w) { return w.bubbles.filter(b => b.state === 'rise'); }
/** A "finger" that moves toward a goal at a capped speed (a child drags slowly) and sets the touch target. */
function Finger(speedU) {
  this.x = null; this.y = null; this.gx = null; this.gy = null; this.speedU = speedU; this.down = true;
}
Finger.prototype.go = function (x, y) { this.gx = x; this.gy = y; };
Finger.prototype.step = function (dt, w) {
  const u = w.layout.unit, C = w.constructor.CONFIG;
  if (this.x === null) { this.x = w.hero.x; this.y = w.hero.y + C.touchLift * u; }
  if (!this.down || this.gx === null) return;
  const dx = this.gx - this.x, dy = this.gy - this.y, d = Math.hypot(dx, dy), s = this.speedU * u * dt;
  if (d <= s) { this.x = this.gx; this.y = this.gy; } else { this.x += dx * s / d; this.y += dy * s / d; }
  this.y = clamp(this.y, 0, w.layout.height);
  w.setTarget(this.x, this.y - C.touchLift * u);
};

/** Falling burrs that threaten point (x, y) within `horizon` s (simple ballistic check, no drag). */
function threats(w, x, y, rPad, horizon, hangLook) {
  const u = w.layout.unit, C = w.constructor.CONFIG, g = C.g * u, out = [];
  for (const c of w.burrs) {
    if (c.hit) continue;
    let t0 = 0;
    if (c.state === 'hang' && hangLook && w.D.hangTime - c.t < hangLook) t0 = w.D.hangTime - c.t;
    else if (c.state !== 'fall') continue;
    if (c.y > y + w.hero.r) continue;
    for (let tau = 0; tau <= horizon + t0; tau += 0.05) {
      const tf = Math.max(0, tau - t0);
      const bx = c.x + c.vx * tf, by = c.y + c.vy * tf + 0.5 * g * tf * tf;
      if (Math.hypot(bx - x, by - y) < w.hero.r * 0.9 + c.r + rPad) { out.push({ c, tau }); break; }
    }
  }
  return out;
}

// --------------------------------------------------------------------------- 4-year-old kid
/**
 * Slow reactions (0.8–1.2 s between seeing and moving), aims at the NEAREST bubble as it was seen (no lead),
 * big aim noise, drags the finger slowly (3 u/s), half the time puts the finger ON the bubble (so Nimbus floats
 * 0.7 u above it) and half the time tries to put Nimbus on it. Ignores hanging burrs; notices a falling one only
 * when it is very close above (and only 40 % of the time), then pulls away after a 0.6 s delay. Every decision has
 * a 15 % chance of a 1.5–4 s idle (finger lifted, Nimbus stays put).
 */
function kid(opts) {
  opts = Object.assign({ react: [0.8, 1.2], noise: 0.55, finger: 3.0, idleP: 0.15, idle: [1.5, 4], notice: 0.4, dodgeDelay: 0.6 }, opts || {});
  let R, F, nextT = 0.5, pending = [], idleUntil = -1, dodgeAt = -1, dodgeGoal = null, seen = new Set();
  return {
    name: 'kid',
    attach(w, NB, seed) { R = new NB.RNG(seed * 977 + 13); F = new Finger(opts.finger); },
    step(dt, w, t) {
      const u = w.layout.unit, H = w.hero, C = w.constructor.CONFIG;
      // apply decisions after the reaction delay
      while (pending.length && pending[0].at <= t) { const p = pending.shift(); if (t >= idleUntil) F.go(p.x, p.y); }
      // late, unreliable burr reaction
      for (const c of w.burrs) {
        if (c.state !== 'fall' || c.hit || seen.has(c.id)) continue;
        if (Math.abs(c.x - H.x) < 1.0 * u && H.y - c.y < 1.6 * u && H.y > c.y) {
          seen.add(c.id);
          if (R.chance(opts.notice)) { dodgeAt = t + opts.dodgeDelay; dodgeGoal = { x: H.x + (H.x >= c.x ? 1 : -1) * 1.5 * u, y: H.y + C.touchLift * u + 0.3 * u }; }
        }
      }
      if (dodgeAt > 0 && t >= dodgeAt) { F.go(dodgeGoal.x, dodgeGoal.y); dodgeAt = -1; idleUntil = -1; }
      if (t >= nextT && t >= idleUntil) {
        nextT = t + R.range(opts.react[0], opts.react[1]);
        if (R.chance(opts.idleP)) { idleUntil = t + R.range(opts.idle[0], opts.idle[1]); pending.length = 0; }
        else {
          let best = null, bd = 1e18;
          for (const b of live(w)) {
            if (b.y > w.layout.groundY) continue;          // still in the puddle: not seen yet
            const d = Math.hypot(b.x - H.x, b.y - H.y);
            if (d < bd) { bd = d; best = b; }
          }
          if (best) {
            const fingerOn = R.chance(0.5);
            const nx = R.gauss() * opts.noise * u, ny = R.gauss() * opts.noise * u;
            const fx = best.x + nx, fy = best.y + ny + (fingerOn ? 0 : C.touchLift * u);
            pending.push({ at: t + R.range(opts.react[0], opts.react[1]) * 0.5, x: fx, y: fy });
          }
        }
      }
      F.down = t >= idleUntil;
      F.step(dt, w);
    }
  };
}

// --------------------------------------------------------------------------- casual adult
/** Reacts ~0.4 s, chases clusters with a little lead, notices 85 % of falling burrs and sidesteps them. */
function casual(opts) {
  opts = Object.assign({ react: 0.4, noise: 0.25, finger: 9, notice: 0.85, hangLook: 0.6 }, opts || {});
  let R, F, nextT = 0.3, noticed = new Map(), dodge = null;
  return {
    name: 'casual',
    attach(w, NB, seed) { R = new NB.RNG(seed * 541 + 3); F = new Finger(opts.finger); },
    step(dt, w, t) {
      const u = w.layout.unit, H = w.hero, C = w.constructor.CONFIG;
      for (const c of w.burrs) if (c.state !== 'gone' && !noticed.has(c.id)) noticed.set(c.id, { at: t + opts.react, ok: R.chance(opts.notice) });
      const th = threats(w, H.x, H.y, 0.25 * u, 0.7, opts.hangLook).filter(o => { const n = noticed.get(o.c.id); return n && n.ok && t >= n.at; });
      if (th.length) {
        const c = th[0].c, side = H.x >= c.x ? 1 : -1;
        let nx = c.x + side * (H.r + c.r + 0.8 * u);
        if (nx < H.r || nx > w.layout.width - H.r) nx = c.x - side * (H.r + c.r + 0.8 * u);
        dodge = c; F.go(nx, H.y + C.touchLift * u);
      } else if (dodge && (dodge.state === 'fall' || dodge.state === 'hang') && dodge.y < H.y + H.r && !dodge.hit) {
        /* hold */
      } else {
        dodge = null;
        if (t >= nextT) {
          nextT = t + opts.react * R.range(0.8, 1.3);
          let best = null, bs = -1;
          const B = live(w).filter(b => b.y < w.layout.groundY);
          for (const b of B) {
            const px = b.x + b.vx * 0.4, py = b.y + b.vy * 0.4;
            if (py < w.layout.minY) continue;
            let nb = 0; for (const o of B) if (o !== b && Math.hypot(o.x - b.x, o.y - b.y) < 1.3 * u) nb++;
            const sc = (1 + 0.6 * nb) / (Math.hypot(px - H.x, py - H.y) / u + 1);
            if (sc > bs) { bs = sc; best = { x: px, y: py }; }
          }
          if (best) F.go(best.x + R.gauss() * opts.noise * u, best.y + R.gauss() * opts.noise * u + C.touchLift * u);
        }
      }
      F.step(dt, w);
    }
  };
}

// --------------------------------------------------------------------------- keyboard
/** Arrow keys only (digital axis), aims like the casual player, steps away from falling burrs it notices. */
function keyboard(opts) {
  opts = Object.assign({ react: 0.35, dead: 0.15, notice: 0.85, hangLook: 0.6 }, opts || {});
  let R, nextT = 0, goal = null, noticed = new Map();
  return {
    name: 'keyboard',
    attach(w, NB, seed) { R = new NB.RNG(seed * 211 + 5); },
    step(dt, w, t) {
      const u = w.layout.unit, H = w.hero;
      for (const c of w.burrs) if (c.state !== 'gone' && !noticed.has(c.id)) noticed.set(c.id, { at: t + opts.react, ok: R.chance(opts.notice) });
      const th = threats(w, H.x, H.y, 0.25 * u, 0.7, opts.hangLook).filter(o => { const n = noticed.get(o.c.id); return n && n.ok && t >= n.at; });
      if (th.length) {
        const c = th[0].c; let side = H.x >= c.x ? 1 : -1;
        if ((side > 0 && H.x > w.layout.width - 1.2 * u) || (side < 0 && H.x < 1.2 * u)) side = -side;
        w.setMove(side, 0); return;
      }
      if (t >= nextT) {
        nextT = t + opts.react;
        let best = null, bs = -1;
        const B = live(w).filter(b => b.y < w.layout.groundY);
        for (const b of B) {
          const px = b.x + b.vx * 0.5, py = b.y + b.vy * 0.5;
          if (py < w.layout.minY) continue;
          let nb = 0; for (const o of B) if (o !== b && Math.hypot(o.x - b.x, o.y - b.y) < 1.3 * u) nb++;
          const sc = (1 + 0.6 * nb) / (Math.hypot(px - H.x, py - H.y) / u + 1);
          if (sc > bs) { bs = sc; best = { x: px, y: py }; }
        }
        goal = best;
      }
      if (!goal) { w.setMove(0, 0); return; }
      const dx = goal.x - H.x, dy = goal.y - H.y, d = opts.dead * u;
      w.setMove(dx > d ? 1 : dx < -d ? -1 : 0, dy > d ? 1 : dy < -d ? -1 : 0);
    }
  };
}

// --------------------------------------------------------------------------- exploits
/** Park on the lawn and slide to whichever puddle is about to blow a bubble (the lowest bubble). dodge: use NB.Bot(0.9)'s dodge. */
function puddleCamp(opts) {
  opts = Object.assign({ dodge: true }, opts || {});
  let bb;
  return {
    name: opts.dodge ? 'puddleCamp' : 'puddleCampNoDodge',
    attach(w, NB) { bb = new NB.Bot(w, { skill: 0.9, seed: 5 }); },
    step(dt, w) {
      if (w.phase !== 'play') return;
      if (opts.dodge && bb._threat(0)) return;
      const L = w.layout, H = w.hero;
      let low = null;
      for (const b of live(w)) if (b.y > L.groundY - 1.2 * L.unit && (!low || b.y > low.y)) low = b;
      w.setTarget(low ? low.x : H.tx, L.maxY);
    }
  };
}
/** Sit still over one puddle (or any spot) and never move. */
function park(x, yFrac, name) {
  return {
    name: name || 'park',
    attach() {},
    step(dt, w) { const L = w.layout; w.setTarget(typeof x === 'function' ? x(w) : x * L.width, L.minY + (L.maxY - L.minY) * yFrac); }
  };
}
/** Fast circles over the lower part of the garden, no aiming, no dodging. */
function circle(opts) {
  opts = Object.assign({ hz: 0.45, ry: 0.3, cy: 0.62 }, opts || {});
  return {
    name: 'circle',
    attach() {},
    step(dt, w, t) {
      const L = w.layout, a = 2 * Math.PI * opts.hz * t;
      w.setTarget(L.width / 2 + Math.cos(a) * (L.width / 2), L.minY + (L.maxY - L.minY) * (opts.cy + opts.ry * Math.sin(a)));
    }
  };
}
/** Horizontal sweep along the bottom (a lazier puddle camp: back and forth, no aim). */
function sweep(opts) {
  opts = Object.assign({ hz: 0.25 }, opts || {});
  return {
    name: 'sweep',
    attach() {},
    step(dt, w, t) { const L = w.layout; w.setTarget(L.width / 2 + Math.sin(2 * Math.PI * opts.hz * t) * L.width / 2, L.maxY); }
  };
}
/** Bot that refuses the shower: at size 5 with 3 gems it avoids bubbles (stays huge), otherwise plays like NB.Bot. */
function stayHuge(skill) {
  let bb;
  return {
    name: 'stayHuge' + skill,
    attach(w, NB, seed) { bb = new NB.Bot(w, { skill, seed: seed * 31 + 7 }); },
    step(dt, w) {
      const H = w.hero;
      if (H.size === 5 && H.gemsInSize >= 3) {
        if (bb._threat(0)) return;
        // stay away from every bubble: go to the top band (bubbles are popped only by touch)
        let near = null, nd = 1e18;
        for (const b of live(w)) { const d = Math.hypot(b.x - H.x, b.y - H.y); if (d < nd) { nd = d; near = b; } }
        if (near && nd < 2.5 * w.layout.unit) w.setTarget(H.x + (H.x - near.x) * 3, H.y + (H.y - near.y) * 3);
        return;
      }
      bb.step(dt);
    }
  };
}
/** No input at all (the child put the phone down). */
function afk() { return { name: 'afk', attach() {}, step() {} }; }

module.exports = { bot, kid, casual, keyboard, puddleCamp, park, circle, sweep, stayHuge, afk };
