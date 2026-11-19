// Player models for the Ziggy's Apple Castle playtest sims. Each has step(dt, world, t), called once per frame before
// world.update, and calls world.drop() directly (the real input path: a tap = one drop()).
'use strict';
const M = Math;

/** The stock AC.Bot (MECHANICS §4). */
function botPlayer(AC, skill) {
  let bot = null;
  return {
    name: 'bot' + skill,
    attach(w, seed) { bot = new AC.Bot(w, { skill, seed: seed * 7 + 3 }); },
    step(dt) { bot.step(dt); },
    get stats() { return bot && bot.stats; }
  };
}

/**
 * Where would the held crate land (x, world px) if it were released `lead` seconds from now? Analytic saucer
 * swing + the same ballistic drift as the world (no sway). This is what a person "sees coming".
 */
function landXAfter(w, lead) {
  const c = w.held, L = w.layout, P = w.planet, s = w.saucer;
  const ph = s.phase + P.swingW * lead;
  const sx = L.cx + L.swingA * M.sin(ph), vx = L.swingA * P.swingW * M.cos(ph);
  const g = P.g * L.unit / 100, dist = M.max(1, w.tower.topY - (c.y + c.h / 2));
  const T = M.sqrt(2 * dist / g), v0 = P.inherit * vx, d = P.drag;
  return sx + (c.x - s.x) + (d > 0 ? v0 * (1 - M.exp(-d * T)) / d : v0 * T);
}
function targetX(w) { return w.tower.topX + w.swayOffset(w.tower.topY); }

/**
 * Generic "timing" person. Per crate: look → (maybe pass a swing) → when the crate it pictures `lead` s ahead
 * crosses its aim point it decides, and the finger lands `react` s after deciding. lead = k·react, so the
 * timing error is (1 − k)·react (k < 1 late, k > 1 early). Random taps and double-taps on top.
 */
function timingPlayer(AC, seed, p) {
  const rng = new AC.RNG(seed * 31 + p.salt);
  const stats = { taps: 0, random: 0, late: 0, doubles: 0, passes: 0, guideTaps: 0 };
  let crate = null, plan = null, pending = -1, dbl = -1, lastMode = null, snap = 0;
  stats.byMode = {};
  function newPlan(w) {
    const c = w.held, x = rng.next();
    const bad = w.stats.misses, perf = w.stats.perfect;
    if (lastMode) { const b = stats.byMode[lastMode] || (stats.byMode[lastMode] = { n: 0, miss: 0 }); b.n++; b.miss += bad - snap; }
    snap = bad;
    // darkness: a dim tower top is harder to judge (same law as AC.Bot, own constant so CONFIG proposals can't tune the model)
    const pl = w.predictLanding(), lit = pl && typeof pl.lit === 'number' ? pl.lit : 1;
    const dk = 1 + (p.darkK === undefined ? 0.7 : p.darkK) * (1 - M.max(0, M.min(1, lit)));
    stats.litSum = (stats.litSum || 0) + lit; stats.plans = (stats.plans || 0) + 1;
    plan = {
      look: rng.range(p.look[0], p.look[1]) + (rng.chance(p.distract || 0) ? rng.range(2, 6) : 0),
      react: rng.range(p.react[0], p.react[1]),
      k: M.max(0.3, M.min(1.25, p.k + rng.gauss() * p.kSd * dk)),
      aim: rng.gauss() * p.aimSd * c.w * dk,
      mode: x < (p.random || 0) ? 'random' : x < (p.random || 0) + (p.late || 0) ? 'late' : 'time',
      pass: rng.chance(p.pass || 0) ? 1 : 0, prev: null, randT: 0
    };
    if (plan.mode === 'late') plan.k = rng.range(0.2, 0.55);          // reacts to the drop guide, barely anticipates
    if (plan.mode === 'random') plan.randT = rng.range(0, 2 * M.PI / w.planet.swingW);
    if (plan.mode !== 'time') stats[plan.mode]++;
  }
  return {
    name: p.name, stats,
    step(dt, w) {
      if (dbl >= 0) { dbl -= dt; if (dbl < 0) { stats.doubles++; w.drop(); } }
      if (pending >= 0) {
        pending -= dt;
        if (pending < 0) { stats.taps++; lastMode = plan ? plan.mode : null; w.drop(); pending = -1; if (rng.chance(p.double || 0)) dbl = rng.range(0.12, 0.45); }
        return;
      }
      if (w.phase !== 'swing' || !w.held) { crate = null; return; }
      if (crate !== w.held) { crate = w.held; newPlan(w); }
      if (plan.look > 0) { plan.look -= dt; return; }
      if (plan.mode === 'random') { plan.randT -= dt; if (plan.randT <= 0) pending = plan.react * 0.3; return; }
      const e = landXAfter(w, plan.k * plan.react) - (targetX(w) + plan.aim);
      if (plan.prev !== null && M.sign(e) !== M.sign(plan.prev)) {
        if (plan.pass > 0) { plan.pass--; stats.passes++; }
        else { pending = plan.react; }
      }
      plan.prev = e;
    }
  };
}

/** (a) a 4–6-year-old: slow reaction 0.4–0.9 s, rough aim, partial anticipation, random/late/double taps. */
function kidPlayer(AC, seed, o) {
  return timingPlayer(AC, seed, Object.assign({
    name: 'kid', salt: 11, look: [0.8, 2.2], distract: 0.08, react: [0.4, 0.9], k: 0.82, kSd: 0.12,
    aimSd: 0.22, random: 0.08, late: 0.12, pass: 0.25, double: 0.12
  }, o || {}));
}
/** (b) casual adult: reaction 0.2–0.35 s, anticipates well, aims at the centre with noise. */
function adultPlayer(AC, seed, o) {
  return timingPlayer(AC, seed, Object.assign({
    name: 'adult', salt: 23, look: [0.5, 1.3], distract: 0.02, react: [0.2, 0.35], k: 0.92, kSd: 0.1,
    aimSd: 0.07, random: 0, late: 0.02, pass: 0.15, double: 0.03
  }, o || {}));
}

/** (c) spam-tapper: taps every 50–150 ms, never looks. */
function spamPlayer(AC, seed) {
  const rng = new AC.RNG(seed * 17 + 5); let next = 0; const stats = { taps: 0 };
  return {
    name: 'spam', stats,
    step(dt, w) { next -= dt; if (next <= 0) { next = rng.range(0.05, 0.15); stats.taps++; w.drop(); } }
  };
}

/** (c2) metronome: taps every `iv` s exactly (never looks). */
function intervalPlayer(AC, seed, iv, off) {
  let next = off === undefined ? 0.37 * iv : off; const stats = { taps: 0 };
  return { name: 'every' + iv, stats, step(dt, w, t) { if (t >= next) { next += iv; stats.taps++; w.drop(); } } };
}
/** (c3) rhythm after spawn: taps exactly `d` s after each new crate appears (tries to phase-lock to the swing). */
function delayPlayer(AC, seed, d) {
  let crate = null, tw = 0; const stats = { taps: 0 };
  return { name: 'delay' + d, stats, step(dt, w) {
    if (w.phase !== 'swing' || !w.held) { crate = null; return; }
    if (crate !== w.held) { crate = w.held; tw = 0; }
    tw += dt; if (tw >= d) { stats.taps++; w.drop(); crate = null; tw = -1e9; }
  } };
}
/** (c4) "tap when Ziggy is in the middle": taps as soon as the rocket crosses cx (no anticipation, no aim). */
function centrePlayer(AC, seed, react) {
  let prev = null, pend = -1, crate = null; const stats = { taps: 0 };
  return { name: 'centre', stats, step(dt, w) {
    if (pend >= 0) { pend -= dt; if (pend < 0) { stats.taps++; w.drop(); pend = -1; } return; }
    if (w.phase !== 'swing' || !w.held) { prev = null; crate = null; return; }
    if (crate !== w.held) { crate = w.held; prev = null; }
    const e = w.saucer.x - w.layout.cx;
    if (prev !== null && M.sign(e) !== M.sign(prev)) pend = react || 0;
    prev = e;
  } };
}

/** (d) "wait for perfect": frame-perfect, drops the first frame predictLanding().perfect is true. */
function perfectWaiter(AC, seed, o) {
  o = o || {}; const stats = { taps: 0 };
  return {
    name: 'waitPerfect', stats,
    step(dt, w) {
      if (w.phase !== 'swing' || !w.held) return;
      const p = w.predictLanding();
      if (p && p.perfect) { stats.taps++; w.drop(); }
    }
  };
}

/** Replay a release now (same integrator as predictLanding) and count apples the crate box would touch. */
function predictWithApples(w) {
  const c = w.held; if (!c) return null;
  const top = w._top(), P = w.planet, h = w.constructor.CONFIG.step, K = w.constructor.CONFIG.apples, u = w.layout.unit;
  const b = { x: c.x, y: c.y, vx: P.inherit * w.saucer.vx, vy: 0 };
  const apples = w.appleList.filter(k => k.state === 'float');
  const hit = new Set(); let tt = 0;
  for (let n = 0; n < 4000; n++) {
    const prevBottom = b.y + c.h / 2;
    w._ballistic(b, h); tt += h;
    for (const k of apples) {
      if (hit.has(k)) continue;
      const ky = k.baseY + K.bob * u * M.sin(k.ph + (k.t + tt) * K.bobW);
      const nx = M.max(b.x - c.w / 2, M.min(k.x, b.x + c.w / 2)), ny = M.max(b.y - c.h / 2, M.min(ky, b.y + c.h / 2));
      if ((k.x - nx) ** 2 + (ky - ny) ** 2 <= k.r * k.r) hit.add(k);
    }
    if (prevBottom <= top.y + 1e-9 && b.y + c.h / 2 >= top.y) break;
  }
  return hit.size;
}

/**
 * (e) apple greed: waits (frame-perfect) for a release that collects an apple AND stays (ok); prefers
 * apple + perfect; gives up after `patience` s and takes the next perfect. Ignores tower lean.
 */
function appleGreed(AC, seed, o) {
  o = o || {}; const patience = o.patience === undefined ? 6 : o.patience;
  const stats = { taps: 0, appleTaps: 0, fallback: 0 }; let crate = null, tw = 0;
  return {
    name: 'appleGreed', stats,
    step(dt, w) {
      if (w.phase !== 'swing' || !w.held) { crate = null; return; }
      if (crate !== w.held) { crate = w.held; tw = 0; }
      tw += dt;
      const p = w.predictLanding(); if (!p) return;
      const anyApple = w.appleList.some(k => k.state === 'float');
      if (anyApple && tw < patience && p.ok) {
        const n = predictWithApples(w);
        if (n > 0 && (p.perfect || tw > patience / 2 || o.edgeOk)) { stats.taps++; stats.appleTaps++; w.drop(); return; }
      }
      if ((!anyApple || tw >= patience) && p.perfect) { stats.taps++; if (anyApple) stats.fallback++; w.drop(); }
    }
  };
}

module.exports = { botPlayer, kidPlayer, adultPlayer, spamPlayer, intervalPlayer, delayPlayer, centrePlayer, perfectWaiter, appleGreed, landXAfter };
