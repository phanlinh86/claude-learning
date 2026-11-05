// Player models for the Rooftop Flip playtest sims. Each has step(dt, world, t), called once per frame before
// world.update, and calls world.flip() directly (the real input path: one tap = one flip()).
'use strict';
const M = Math;
const FOOT = 0.18;   // = CONFIG.foot (a gap matters once the back paw passes its edge)
function opp(s) { return s === 'floor' ? 'ceil' : 'floor'; }

/** The stock RF.Bot (MECHANICS §5). */
function botPlayer(RF, skill) {
  let bot = null;
  return {
    name: 'bot' + skill,
    attach(w, seed) { bot = new RF.Bot(w, { skill, seed: seed * 7 + 3 }); },
    step(dt) { bot.step(dt); },
    get stats() { return bot && bot.stats; }
  };
}

/**
 * Generic human. While standing on surface A it watches the next hazard on A once it is on screen (`view` u
 * ahead) and aims to tap when that hazard is `aim` s away (N(aimMu, aimSd)); the finger is off by
 * `bias + N(0, errSd)` s (positive = late). It can only act `react` s after it last had to re-orient
 * (a landing, a drone drop) or after the hazard appeared, plus an occasional distraction. Per hazard it may
 * forget to tap; it may misread a hazard on the OTHER surface as its own (taps toward it); it taps at random
 * (Poisson) and sometimes double-taps. It chases fireflies on the other surface (only its colour unless
 * `confuse`), and `check` is the chance it looks at the landing spot before tapping (waits if unsafe).
 */
function humanPlayer(RF, seed, p) {
  const rng = new RF.RNG(seed * 31 + (p.salt || 1));
  const stats = { taps: 0, planned: 0, forgot: 0, misread: 0, random: 0, doubles: 0, chases: 0, waits: 0, lateNotice: 0 };
  const done = new Map(), seenGroups = new Set();   // done: hazard → landing index it was judged on
  let plan = null, readyT = 0, wasGrounded = true, wasRescue = false, taps = [], landIdx = 0;
  const react = () => rng.range(p.react[0], p.react[1]);
  function tap(w, why) {
    stats.taps++; if (why) stats[why]++;
    stats.lastWhy = why; stats.lastT = w.time;
    w.flip();
    if (rng.chance(p.double || 0)) taps.push({ t: -1, d: rng.range(0.12, 0.45), why: 'doubles' });
  }
  function makePlan(w, t, hz, mine) {
    const h = w.hero, S = M.max(1, w.speed), tte = (hz.x0 - h.x) / S;
    const aim = M.max(0.1, p.aimMu + rng.gauss() * p.aimSd), err = (p.bias || 0) + rng.gauss() * p.errSd;
    let fireT = t + M.max(0, tte - aim + err);
    let ready = M.max(readyT, t + (mine ? 0 : react() * 0.5));
    if (rng.chance(p.distract || 0)) ready += rng.range(p.distractT[0], p.distractT[1]);
    if (ready > fireT) { stats.lateNotice++; fireT = ready; }
    return { hz, side: h.side, fireT, forget: mine && rng.chance(p.forget || 0), check: rng.chance(p.check || 0) };
  }
  return {
    name: p.name, stats,
    step(dt, w, t) {
      const h = w.hero, u = w.layout.unit;
      // queued taps (double taps)
      for (const q of taps) { if (q.t < 0) q.t = t + q.d; }
      taps = taps.filter(q => { if (t >= q.t) { stats.taps++; stats[q.why]++; stats.lastWhy = q.why; stats.lastT = w.time; w.flip(); return false; } return true; });
      if (w.phase !== 'run') return;
      if (p.randomRate && rng.chance(p.randomRate * dt)) tap(w, 'random');
      if (h.state === 'rescue') { wasRescue = true; plan = null; return; }
      if (wasRescue) { wasRescue = false; readyT = t + react(); landIdx++; plan = null; }
      if (h.grounded && !wasGrounded) { landIdx++; plan = null; }
      if (h.grounded && !wasGrounded) readyT = t + react() * (p.landReact === undefined ? 1 : p.landReact);
      wasGrounded = h.grounded;
      const F = w.flightDist(), view = p.view * u;
      // execute the plan
      if (plan && t >= plan.fireT) {
        const stillMine = h.side === plan.side || (!h.grounded && h.coyote > 0);
        if (!stillMine) plan = null;
        else if (plan.forget) { stats.forgot++; stats.lastWhy = 'forgot'; stats.lastT = w.time; plan = null; }
        else if (plan.check && h.grounded && !w.clearRange(opp(h.side), h.x + 0.5 * F, h.x + F + 0.8 * u) && plan.hz.x0 > h.x - FOOT * u) {
          stats.waits++;                                   // looks first: waits for a safe landing spot
        } else { tap(w, plan.misread ? 'misread' : 'planned'); plan = null; }
        if (plan === null) return;
      }
      if (!h.grounded) return;
      const side = h.side;
      if (!plan) {
        const hz = w.hazardAhead(side, h.x - FOOT * u, view);
        if (hz && done.get(hz) !== landIdx) { done.set(hz, landIdx); plan = makePlan(w, t, hz, true); return; }
        if (p.misread) {
          const hz2 = w.hazardAhead(opp(side), h.x, view);
          if (hz2 && done.get(hz2) !== landIdx) {
            done.set(hz2, landIdx);
            if (rng.chance(p.misread)) { plan = makePlan(w, t, hz2, false); plan.misread = true; plan.check = false; return; }
          }
        }
      }
      // chase fireflies on the other surface when nothing is about to happen here
      if (p.chase && t >= readyT && (!plan || plan.fireT > t + 0.9)) {
        const other = opp(side), a = h.x + F, b = h.x + F + 2.5 * u;
        let key = null;
        const value = (sd, x0) => {                        // liked minus disliked fireflies near that surface's line
          const sy = w.standY(sd); let v = 0;
          for (const f of w.fireflies) {
            if (f.state !== 'fly' || f.x < x0 || f.x > b || M.abs(f.y - sy) > 0.5 * u) continue;
            if (sd === other && key === null) key = f.id;
            v += f.color === h.color || p.confuse >= 1 ? 1 : (rng.chance(p.confuse || 0) ? 1 : -(p.dislike === undefined ? 1 : p.dislike));
          }
          return v;
        };
        const v = value(other, a) - (p.dodge ? value(side, h.x) : 0);
        if (key !== null && !seenGroups.has(key)) {
          seenGroups.add(key);
          if (v >= 2 && rng.chance(p.chase)) {
            const safe = !p.chaseSafe || (w.clearRange(other, h.x + 0.5 * F, h.x + F + 0.8 * u) && !w.hazardAhead(other, h.x + 0.5 * F, F + 3 * u));
            if (safe) { plan = null; tap(w, 'chases'); }
          }
        }
      }
    }
  };
}

const KID = {
  name: 'kid', salt: 11, view: 7, react: [0.6, 1.1], aimMu: 0.6, aimSd: 0.15, bias: 0.08, errSd: 0.18,
  forget: 0.05, distract: 0.08, distractT: [0.5, 2.0], randomRate: 0.08, double: 0.10, misread: 0.06,
  chase: 0.35, confuse: 0.35, check: 0, chaseSafe: false
};
const ADULT = {
  name: 'adult', salt: 23, view: 7, react: [0.3, 0.5], aimMu: 0.38, aimSd: 0.08, bias: 0.03, errSd: 0.07,
  forget: 0.005, distract: 0.02, distractT: [0.3, 1.0], randomRate: 0, double: 0.02, misread: 0.01,
  chase: 0.6, confuse: 0, check: 0.9, chaseSafe: true, dodge: true
};
/** (a) 4–6-year-old: slow reactions 0.6–1.1 s, rough timing, forgets, misreads, random/double taps, chases any firefly. */
function kidPlayer(RF, seed, o) { return humanPlayer(RF, seed, Object.assign({}, KID, o || {})); }
/** (b) casual adult: 0.3–0.5 s reactions, good timing, checks the landing spot, chases its colour. */
function adultPlayer(RF, seed, o) { return humanPlayer(RF, seed, Object.assign({}, ADULT, o || {})); }
/** (e) colour-ignorer: adult timing, chases every firefly group whatever its colour. */
function colourIgnorer(RF, seed) { return adultPlayer(RF, seed, { name: 'colourIgnorer', confuse: 1, dodge: false }); }
/** (e') hazards only: adult timing, never flips for fireflies. */
function hazardOnly(RF, seed) { return adultPlayer(RF, seed, { name: 'hazardOnly', chase: 0 }); }

/** (c) spam-tapper: a tap every `ms` (±15 %), never looks. */
function spamPlayer(RF, seed, ms) {
  const rng = new RF.RNG(seed * 17 + 5); let next = 0; const stats = { taps: 0 };
  return {
    name: 'spam' + ms, stats,
    step(dt, w) { next -= dt; if (next <= 0) { next = (ms / 1000) * rng.range(0.85, 1.15); stats.taps++; w.flip(); } }
  };
}
/** (c') "flip on every landing": taps the frame Bolt lands (perfect ping-pong, no looking). */
function pingPong() {
  const stats = { taps: 0 };
  return { name: 'pingPong', stats, step(dt, w) { if (w.hero.grounded) { stats.taps++; w.flip(); } } };
}
/** (d) never taps. */
function neverTap() { return { name: 'never', stats: {}, step() {} }; }

module.exports = { botPlayer, humanPlayer, kidPlayer, adultPlayer, colourIgnorer, hazardOnly, spamPlayer, pingPong, neverTap, KID, ADULT };
