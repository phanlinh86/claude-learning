// Player models for the playtest sims. Each has step(dt, world, t) and is called once per frame before world.update.
'use strict';

/** The stock EG.Bot (MECHANICS §7). */
function botPlayer(EG, skill, seed) {
  let bot = null;
  return {
    name: 'bot' + skill,
    attach(w) { bot = new EG.Bot(w, { skill, seed: seed * 7 + 3 }); },
    step(dt) { bot.step(dt); },
    get stats() { return bot && bot.stats; }
  };
}

/** Columns where the held light visibly "matches": the top light, or a side neighbour of the landing cell, has its colour. */
function matchCols(w) {
  const held = w.held, st = w._tiers(), out = [];
  if (!held || held.kind !== 'light') return out;
  for (let c = 0; c < w.cols; c++) {
    if (!w.canDrop(c)) continue;
    const h = st[c].length;
    if (h && st[c][h - 1] === held.tier) { out.push(c); continue; }
    if ((c > 0 && st[c - 1][h] === held.tier) || (c < w.cols - 1 && st[c + 1][h] === held.tier)) out.push(c);
  }
  return out;
}

/**
 * A 5-year-old: slow (≈12–20 drops/min), taps the column under Ember (= where she tapped last) or a random one,
 * sometimes a column where the same colour is visible. Ignores pumpkins, height, the "next" bubble. Sometimes
 * gets distracted, sometimes double-taps (the second tap is buffered while the board is busy). A refused tap →
 * tries another random column a moment later. `see` = how often she aims for a visible match.
 */
function kidPlayer(EG, seed, opts) {
  opts = opts || {};
  const rng = new EG.RNG(seed * 13 + 5);
  const see = opts.see === undefined ? 0.3 : opts.see;
  const delay = opts.delay || [1.7, 3.3];
  let wait = -1, dbl = -1, lastCol = -1;
  const stats = { taps: 0, buffered: 0, double: 0, matchTaps: 0, refusedTaps: 0 };
  function pick(w) {
    const x = rng.next();
    if (x < see) { const m = matchCols(w); if (m.length) { stats.matchTaps++; return rng.pick(m); } }
    if (x < see + 0.35) return w.ember.targetCol;
    return rng.int(w.cols);
  }
  return {
    name: 'kid5', stats,
    step(dt, w) {
      if (dbl >= 0) { dbl -= dt; if (dbl < 0 && w.phase !== 'over') { stats.double++; if (w.isBusy()) stats.buffered++; w.drop(lastCol); } }
      if (w.phase !== 'aim') { wait = -1; return; }
      if (wait < 0) {
        wait = rng.range(delay[0], delay[1]);
        if (rng.next() < 0.1) wait += rng.range(5, 12);           // distracted (looks at Boo / the fireflies / mum)
      }
      wait -= dt;
      if (wait > 0) return;
      wait = -1;
      const col = pick(w);
      lastCol = col;
      stats.taps++;
      w.aim(col);
      const ok = w.drop(col);
      if (!ok && w.phase === 'aim') { stats.refusedTaps++; wait = rng.range(0.8, 1.5); lastCol = rng.int(w.cols); w.aim(lastCol); return; }
      if (ok && rng.next() < 0.1 && !opts.noDouble) dbl = rng.range(0.15, 0.35);   // excited double tap → buffered drop in the same column
    }
  };
}

/** Casual adult: greedy one-step merge seeker (no lookahead, no pumpkin plan), ~25 drops/min, 15 % sloppy picks. */
function adultPlayer(EG, seed, opts) {
  opts = opts || {};
  const rng = new EG.RNG(seed * 17 + 11);
  const mistake = opts.mistake === undefined ? 0.15 : opts.mistake;
  const delay = opts.delay || [0.7, 1.4];
  let wait = -1;
  const stats = { taps: 0, mistakes: 0 };
  function choose(w) {
    const ok = [];
    for (let c = 0; c < w.cols; c++) if (w.canDrop(c)) ok.push(c);
    if (!ok.length) return w.ember.targetCol;
    if (rng.next() < mistake) { stats.mistakes++; return rng.pick(ok); }
    let best = -1e18, bc = ok[0];
    for (const c of ok) {
      const r = w.simulate(c);
      let s = r.merges * 100 + r.points + (r.goal ? 500 : 0) - (r.gameOver ? 1e5 : 0);
      s -= r.heights[c] * 3 + (r.heights[c] >= w.rows - 1 ? 40 : 0);   // a little "don't stack high"
      s += rng.next() * 2;                                               // ties broken randomly
      if (s > best) { best = s; bc = c; }
    }
    return bc;
  }
  return {
    name: 'adult', stats,
    step(dt, w) {
      if (w.phase !== 'aim') { wait = -1; return; }
      if (wait < 0) wait = rng.range(delay[0], delay[1]);
      wait -= dt;
      if (wait > 0) return;
      wait = -1;
      const c = choose(w);
      stats.taps++;
      w.aim(c); w.drop(c);
    }
  };
}

/**
 * Spam-input exploit: taps at `rate` per second regardless of phase.
 *  mode 'same'  : always column `col`
 *  mode 'alt'   : alternates two columns
 *  mode 'sweep' : 0,1,2,3,4,0,…
 *  mode 'rand'  : random column every tap
 *  mode 'aimdrop': drop() with no column (current aim) while aim() jitters every frame
 */
function spamPlayer(EG, seed, mode, rate, col) {
  const rng = new EG.RNG(seed * 19 + 1);
  let acc = 0, k = 0;
  const stats = { taps: 0, busyTaps: 0, accepted: 0 };
  col = col === undefined ? 2 : col;
  return {
    name: 'spam-' + mode + '@' + rate, stats,
    step(dt, w) {
      if (mode === 'aimdrop') w.aim(rng.int(w.cols));
      acc += dt;
      const period = 1 / rate;
      while (acc >= period) {
        acc -= period;
        let c;
        if (mode === 'same') c = col;
        else if (mode === 'alt') c = (k++ & 1) ? col : (col + 1) % w.cols;
        else if (mode === 'sweep') c = (k++) % w.cols;
        else if (mode === 'rand') c = rng.int(w.cols);
        else c = undefined;
        stats.taps++;
        if (w.isBusy()) stats.busyTaps++;
        if (w.drop(c)) stats.accepted++;
      }
    }
  };
}

module.exports = { botPlayer, kidPlayer, adultPlayer, spamPlayer, matchCols };
