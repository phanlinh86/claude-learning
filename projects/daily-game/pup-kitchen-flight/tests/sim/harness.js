// Biscuit's Kitchen Flight — high-speed playtest harness (node, no deps, report-only: never edits game/).
// Loads game/js/{rng,world,bot}.js into a vm with a fake window (like tests/unit/run.js), then plays
// headless rounds with bots and with human-like player models that ONLY call world.flap().
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS = path.join(__dirname, '..', '..', 'game', 'js');
function load() {
  const sandbox = { console, Math, JSON };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const f of ['rng.js', 'world.js', 'bot.js']) vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), sandbox, { filename: f });
  return sandbox.BKF;
}
const BKF = load();
const W = BKF.World;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/* ------------------------------------------------------------------ player models
 * Every model has step(dt, w), called once per 60 Hz frame BEFORE w.update(dt), and may only call w.flap().
 * HumanModel = a predictive player with human limits:
 *   - it commits a tap now that will actually land after `latency` s (reaction + motor time, U(lo,hi));
 *     it plans as if the latency were its mean (so the spread is its timing error: "coarse timing");
 *   - it looks again only every `think` s, sees y with Gaussian noise `noise` px and vy with noise `vnoise`;
 *   - it knows the taps it has already committed (that is how people pipeline taps);
 *   - impulsive bursts: a committed tap becomes 2–3 taps `burstGap` s apart with probability `burst`;
 *   - attention lapses: Poisson rate `pauseRate` /s, each lasting U(pause) s, with no new taps.
 * The cost function is the same idea as BKF.Bot (touch = big cost, sooner worse; soft margin; leaf reward). */
const PLAYERS = {
  kid4: { kind: 'human', label: '4-year-old', latency: [0.45, 0.70], think: 0.15, noise: 18, vnoise: 60, burst: 0.22, burstN: [1, 2], burstGap: [0.12, 0.2],
    pauseRate: 1 / 12, pause: [1.0, 2.0], margin: 25, marginW: 20, leaf: 20, targets: [130, 230, 330, 410], startDelay: 1.2 },
  kid6: { kind: 'human', label: '6-year-old', latency: [0.30, 0.45], think: 0.10, noise: 12, vnoise: 40, burst: 0.10, burstN: [1, 1], burstGap: [0.12, 0.2],
    pauseRate: 1 / 25, pause: [0.6, 1.2], margin: 22, marginW: 20, leaf: 20, targets: [110, 180, 250, 320, 390], startDelay: 0.8 },
  adult: { kind: 'human', label: 'casual adult', latency: [0.20, 0.30], think: 0.06, noise: 6, vnoise: 20, burst: 0.03, burstN: [1, 1], burstGap: [0.1, 0.15],
    pauseRate: 1 / 60, pause: [0.3, 0.6], margin: 18, marginW: 20, leaf: 20, targets: [100, 165, 230, 295, 360, 425], startDelay: 0.6 },
  spam: { kind: 'spam', label: 'spam-tapper (80–150 ms)', every: [0.08, 0.15] },
  ceiling: { kind: 'ceiling', label: 'ceiling-hugger (holds the top)' },
  reckless: { kind: 'human', label: 'reckless leaf-chaser (ignores obstacles)', latency: [0.20, 0.30], think: 0.06, noise: 6, vnoise: 20, burst: 0, burstN: [1, 1], burstGap: [0.1, 0.1],
    pauseRate: 0, pause: [0, 0], margin: 0, marginW: 0, leaf: 60, targets: [100, 165, 230, 295, 360, 425], startDelay: 0.6, blind: true },
  idle: { kind: 'idle', label: 'do-nothing (one tap to start)' }
};
for (const s of [0.3, 0.5, 0.7, 0.85, 1]) PLAYERS['bot' + s] = { kind: 'bot', label: 'bot skill ' + s, skill: s };

const SOLID = { head: 1, handle: 1, chain: 1, stack: 1, kettle: 1 };

function HumanModel(w, p, seed) {
  this.w = w; this.p = p; this.rng = new BKF.RNG(seed);
  this.time = 0; this.readyT = 0; this.pending = []; this.thinkT = 0; this.pauseT = 0;
  this.meanLat = (p.latency[0] + p.latency[1]) / 2;
  this.h = 1 / 30;
}
HumanModel.prototype.step = function (dt) {
  const w = this.w, p = this.p;
  this.time += dt;
  if (w.phase === 'ready') { this.readyT += dt; if (this.readyT >= p.startDelay) w.flap(); return; }
  if (w.phase !== 'playing') { this.pending.length = 0; return; }
  // fire committed taps that are due
  while (this.pending.length && this.pending[0] <= this.time + 1e-9) { this.pending.shift(); w.flap(); }
  if (this.pauseT > 0) { this.pauseT -= dt; if (this.pauseT <= 0) this.pauseEnd = this.time; return; }
  if (p.pauseRate > 0 && this.rng.chance(p.pauseRate * dt)) { this.pauseT = this.rng.range(p.pause[0], p.pause[1]); return; }
  this.thinkT -= dt;
  if (this.thinkT > 0) return;
  this.thinkT += p.think * this.rng.range(0.8, 1.2);
  if (this.decide()) {
    let at = this.time + this.rng.range(p.latency[0], p.latency[1]);
    this.add(at);
    if (this.rng.chance(p.burst)) {
      const n = this.rng.int(p.burstN[0], p.burstN[1]);
      for (let i = 0; i < n; i++) { at += this.rng.range(p.burstGap[0], p.burstGap[1]); this.add(at); }
    }
  }
};
/** Perception error: a slowly drifting bias (Ornstein–Uhlenbeck, τ 0.6 s, σ = noise), not white noise. */
HumanModel.prototype.bias = function (dt) {
  const a = Math.exp(-dt / 0.6);
  this.b = (this.b || 0) * a + Math.sqrt(1 - a * a) * this.p.noise * this.rng.gauss();
  return this.b;
};
HumanModel.prototype.add = function (t) { this.pending.push(t); this.pending.sort((a, b) => a - b); };
HumanModel.prototype.decide = function () {
  const w = this.w, c = w.cfg, pu = w.pup, p = this.p, h = this.h;
  const lat = this.p.latency[1], T = lat + 1.1, N = Math.ceil(T / h);
  const speed = Math.max(w.scrollSpeed, 1), reach = speed * T + 120;
  const all = w.hitShapes(), shapes = [], leaves = [], kettles = [];
  for (const s of all) {
    const sx = s.kind === 'seg' ? Math.min(s.x1, s.x2) : s.x, ex = s.kind === 'seg' ? Math.max(s.x1, s.x2) : s.kind === 'rect' ? s.x + s.w : s.x, rad = s.r || 0;
    if (ex + rad < pu.x - 70 || sx - rad > pu.x + reach) continue;
    if (SOLID[s.tag]) { if (!p.blind) { s._x0 = sx - rad; s._x1 = ex + rad; shapes.push(s); } }
    else if (s.tag === 'leaf') leaves.push(s);
  }
  for (const o of w.obstacles) if (o.kind === 'kettle') kettles.push(o);
  const ctx = {
    c, speed, shapes, leaves, kettles, x0: pu.x,
    y0: pu.y + this.bias(p.think), vy0: pu.vy + this.rng.gauss() * p.vnoise, since0: w.sinceFlap,
    r: c.pupR - c.hitForgive, gy: w.wind.gy, damp: Math.exp(-c.steamDrag * h),
    sched: this.pending.map(t => Math.round((t - this.time) / h)), firstAt: Math.round(lat / h),
    contAt: Math.round((lat + p.think) / h), N, T, taken: new Array(leaves.length)
  };
  // robust: a plan is judged by its worse outcome over the player's own latency spread (lo / hi),
  // so "wait, I'll tap later" is not trusted beyond what this player can actually time
  const lats = [p.latency[0], p.latency[1]];
  const judge = (first, yT) => {
    let worst = -1e18;
    for (const L of lats) { ctx.firstAt = Math.round(L / h); ctx.contAt = Math.round((L + p.think) / h); worst = Math.max(worst, this.sim(ctx, first, yT)); }
    return worst;
  };
  let bestNo = 1e18, bestYes = 1e18;
  for (const yT of p.targets) {
    bestNo = Math.min(bestNo, judge(false, yT));
    bestYes = Math.min(bestYes, judge(true, yT));
  }
  return bestYes < bestNo - 0.5;
};
HumanModel.prototype.sim = function (ctx, first, yT) {
  const c = ctx.c, h = this.h, p = this.p, taken = ctx.taken;
  let y = ctx.y0, vy = ctx.vy0, since = ctx.since0, cost = 0, si = 0, hits = 0;
  const base = c.counterY - 120;
  for (let j = 0; j < taken.length; j++) taken[j] = false;
  for (let i = 0; i < ctx.N; i++) {
    const t = i * h;
    let tap = false;
    while (si < ctx.sched.length && ctx.sched[si] <= i) { si++; tap = true; }
    if (first && i === ctx.firstAt) tap = true;
    if (i >= ctx.contAt && y > yT && vy > -80 && since > 0.2) tap = true;
    if (tap && since >= c.flapCooldown) { vy = c.flapVy; since = 0; }
    const X = ctx.x0 + ctx.speed * (t + h);
    let a = c.gravity + ctx.gy;
    for (const o of ctx.kettles) {
      if (Math.abs(X - o.x) > c.steamHalfW + c.pupR * 0.5) continue;
      const hg = base - y;
      if (hg < -c.pupR || hg > o.steamH) continue;
      a -= c.steamLift * Math.pow(1 - clamp(hg, 0, o.steamH) / o.steamH, c.steamFadePow);
      vy *= ctx.damp;
    }
    const vn = clamp(vy + a * h, -c.maxRise, c.maxFall);
    y += 0.5 * (vy + vn) * h; vy = vn; since += h;
    if (y - c.pupR < c.ceilingY) { y = c.ceilingY + c.pupR; if (vy < 0) vy = 0; }
    // the counter: bounce like the world does and keep simulating, so what happens after a touch still counts
    if (y + c.pupR > c.counterY - 2) { cost += 1000 * (2 - t / ctx.T) * (hits ? 0.3 : 1); hits++; y = c.counterY - c.pupR; vy = c.counterBounceVy; continue; }
    const cl = Math.min(clearance(ctx.shapes, X, y, ctx.r), c.counterY - (y + c.pupR));   // the counter is a solid floor too
    if (cl < 0) { cost += 1000 * (2 - t / ctx.T) - cl; break; }
    if (cl < p.margin) cost += (p.margin - cl) * p.marginW;
    for (let j = 0; j < ctx.leaves.length; j++) {
      if (taken[j]) continue;
      const L = ctx.leaves[j], dx = L.x - X, dy = L.y - y, R = c.pupR + c.leafR;
      if (dx > R || dx < -R) continue;
      if (dx * dx + dy * dy < R * R) { taken[j] = true; cost -= p.leaf * (1 - 0.5 * t / ctx.T); }
    }
    cost += 0.01 * Math.abs(y - 285);
  }
  return cost;
};
function clearance(shapes, X, y, r) {
  let best = 1e9;
  for (const s of shapes) {
    if (X + r + 16 < s._x0 || X - r - 16 > s._x1) continue;
    let d;
    if (s.kind === 'circle') d = Math.hypot(X - s.x, y - s.y) - s.r - r;
    else if (s.kind === 'rect') d = Math.hypot(X - clamp(X, s.x, s.x + s.w), y - clamp(y, s.y, s.y + s.h)) - r;
    else {
      const ex = s.x2 - s.x1, ey = s.y2 - s.y1, L2 = ex * ex + ey * ey;
      const u = L2 > 0 ? clamp(((X - s.x1) * ex + (y - s.y1) * ey) / L2, 0, 1) : 0;
      d = Math.hypot(X - (s.x1 + ex * u), y - (s.y1 + ey * u)) - s.r - r;
    }
    if (d < best) best = d;
  }
  return best;
}

function Spam(w, p, seed) { this.w = w; this.p = p; this.rng = new BKF.RNG(seed); this.next = 0.5; this.t = 0; }
Spam.prototype.step = function (dt) { this.t += dt; if (this.t >= this.next) { this.w.flap(); this.next = this.t + this.rng.range(this.p.every[0], this.p.every[1]); } };
function Ceiling(w) { this.w = w; this.t = 0; }
Ceiling.prototype.step = function (dt) {
  const w = this.w; this.t += dt;
  if (w.phase === 'ready') { if (this.t > 0.5) w.flap(); return; }
  if (w.pup.y > w.cfg.ceilingY + w.cfg.pupR + 12 || w.pup.vy > 0) w.flap();   // keep pressed against the top
};
function Idle(w) { this.w = w; this.t = 0; this.done = false; }
Idle.prototype.step = function (dt) { this.t += dt; if (!this.done && this.t > 0.5) { this.w.flap(); this.done = true; } };

function makePlayer(name, w, seed) {
  const p = PLAYERS[name];
  if (p.kind === 'bot') return new BKF.Bot(w, { skill: p.skill, seed: seed * 7 + 1 });
  if (p.kind === 'human') return new HumanModel(w, p, seed * 131 + 17);
  if (p.kind === 'spam') return new Spam(w, p, seed * 31 + 3);
  if (p.kind === 'ceiling') return new Ceiling(w);
  return new Idle(w);
}

/* ------------------------------------------------------------------ one round */
/** true while a human model is in an attention lapse, or within 0.8 s after it (the fall it caused). */
function lapse(pl) { return pl instanceof HumanModel ? (pl.pauseT > 0 || pl.time - (pl.pauseEnd || -9) < 0.8) : false; }
function playRound(job) {
  const { diff, seed, player } = job, cap = job.cap || 300, config = job.config || {};
  const w = new W({ seed, difficulty: diff, config });
  // optional, clearly-labelled CODE-change emulation (not a config key today): job.patch = ['freeCounter']
  const patch = job.patch || [];
  if (patch.includes('freeCounter')) {
    const lose = w._loseBattery;
    w._loseBattery = function (o, what) { if (what === 'counter') return; return lose.apply(this, arguments); };
  }
  const pl = makePlayer(player, w, seed);
  const dt = 1 / 60;
  const r = {
    diff, seed, player, tag: job.tag || 'base', patch: patch.join(','), died: false, t: 0, score: 0, leaves: 0, passed: 0, bumps: [], counterCost: 0, counterFree: 0,
    batteryGains: 0, firstPoint: null, level: 0, flaps: 0, ceilingT: 0, cleanLevels: 0, gusts: 0, steamExits: 0, gustSecs: 0, zone2Secs: 0,
    levelTimes: []
  };
  let frames = 0, lastGust = -1e9, lastSteamExit = -1e9, inSteam = false, lastLevelT = 0;
  const maxFrames = Math.round((cap + 40) / dt);
  while (w.phase !== 'over' && frames < maxFrames) {
    pl.step(dt, w);
    w.update(dt); frames++;
    if (w.phase === 'playing') {
      if (w.t >= cap) break;
      if (w.pup.y - w.cfg.pupR <= w.cfg.ceilingY + 0.5) r.ceilingT += dt;
      if (w.zone === 2) { r.zone2Secs += dt; if (w.wind.phase === 'gust') r.gustSecs += dt; }
      const st = w.steamAt(w.pup.x, w.pup.y).inside;
      if (inSteam && !st) { lastSteamExit = w.t; r.steamExits++; }
      inSteam = st;
    }
    for (const e of w.drainEvents()) {
      if ((e.type === 'leaf' || e.type === 'pass') && r.firstPoint === null) r.firstPoint = w.t;
      if (e.type === 'gust') { lastGust = w.t; r.gusts++; }
      if (e.type === 'battery') r.batteryGains++;
      if (e.type === 'levelUp') { r.levelTimes.push(w.t - lastLevelT); lastLevelT = w.t; }
      if (e.type === 'bump') {
        const ny = w._hit.ny;
        r.bumps.push({ t: +w.t.toFixed(2), kind: e.kind, part: e.part, paused: lapse(pl), zone: w.zone, rel: ny < -0.3 ? 'top' : ny > 0.3 ? 'under' : 'side',
          sinceGust: +(w.t - lastGust).toFixed(2), gustOn: w.wind.phase === 'gust', sinceSteam: +(w.t - lastSteamExit).toFixed(2), inSteam });
      }
      if (e.type === 'counter') { if (e.cost && !patch.includes('freeCounter')) { r.counterCost++; r.bumps.push({ t: +w.t.toFixed(2), kind: 'counter', part: 'counter', paused: lapse(pl), zone: w.zone, rel: 'top', sinceGust: +(w.t - lastGust).toFixed(2), gustOn: w.wind.phase === 'gust', sinceSteam: +(w.t - lastSteamExit).toFixed(2), inSteam }); } else r.counterFree++; }
      if (e.type === 'down') r.died = true;
    }
  }
  r.t = +Math.min(w.t, cap).toFixed(2);
  r.score = w.score; r.leaves = w.leafCount; r.passed = w.passed; r.level = w.level; r.flaps = w.stats.flaps; r.cleanLevels = w.stats.cleanLevels;
  if (r.died) { const last = r.bumps[r.bumps.length - 1]; r.t = last ? last.t : r.t; }   // w.t keeps running while he floats down
  r.ceilingT = +r.ceilingT.toFixed(2);
  return r;
}

/* ------------------------------------------------------------------ static checks on the obstacle timeline
 * The obstacle layout never depends on the player (the RNG is only used by generation/wind), except that a
 * bump swings a hanger. So a "ghost" world with collisions disabled reproduces exactly what a player sees. */
function ghost(diff, seed, config) {
  const w = new W({ seed, difficulty: diff, config: Object.assign({}, config || {}, { batteries: 1e9, maxBatteries: 1e9 }) });
  w._collide = () => false;
  w.flap();
  return w;
}

/** First time anything solid is visible: left edge < 960 (16:9 frame) and < visibleRight (2.2:1 phone). */
function firstVisible(diff, seed, config) {
  const w = ghost(diff, seed, config), c = w.cfg, h = c.step;
  let t960 = null, tWide = null;
  for (let k = 0; k < 15 * 120 && (t960 === null || tWide === null); k++) {
    w.pup.y = 250; w.pup.vy = 0; w.update(h);
    for (const o of w.obstacles) {
      const left = o.x - o.halfW;
      if (t960 === null && left < 960) t960 = w.t;
      if (tWide === null && left < c.visibleRight - 26) tWide = w.t;   // visibleRight includes a margin; 1074 is the true 2.2:1 edge
    }
  }
  return { t960, tWide };
}

/** Exact reachability of a no-hit path (no bumps allowed at all) over the first `secs` seconds.
 * State bins: y 1 px × vy 10 px/s, one exact representative trajectory per bin, a tap decision every 6 steps
 * (50 ms = the world's flapCooldown). Every surviving representative is a real tap sequence, so "alive" is a proof. */
function reach(diff, seed, config, secs) {
  const w = ghost(diff, seed, config), c = w.cfg, h = c.step, r = c.pupR - c.hitForgive;
  const yLo = c.ceilingY + c.pupR, yHi = c.counterY - c.pupR;
  const VY0 = -700, NVY = 140, NY = 541;
  let curY = new Float64Array(NY * NVY), curV = new Float64Array(NY * NVY), curOn = new Uint8Array(NY * NVY);
  let nxtY = new Float64Array(NY * NVY), nxtV = new Float64Array(NY * NVY), nxtOn = new Uint8Array(NY * NVY);
  let list = [], nlist = [];
  // the first tap at step 0 (start): vy = flapVy at y = readyY
  const put = (Y, V, on, Ya, Va, L, y, vy) => {
    const b = Math.round(y) * NVY + clamp(Math.round((vy - VY0) / 10), 0, NVY - 1);
    if (!on[b]) { on[b] = 1; Ya[b] = y; Va[b] = vy; L.push(b); }
  };
  put(null, null, curOn, curY, curV, list, c.readyY, c.flapVy);
  const steps = Math.round(secs / h);
  let minAlive = 1e9, minFree = 1e9, minFreeT = 0, deadAt = null;
  const free = new Uint8Array(NY), kets = [];
  for (let k = 0; k < steps; k++) {
    // move the ghost one step and read this step's world (obstacles after their move, wind, steam)
    const gyPrev = w.wind.gy;
    w.pup.y = 250; w.pup.vy = 0; w.update(h);
    const gy = w.wind.gy;   // the world updates wind before Biscuit inside the same step
    kets.length = 0;
    for (const o of w.obstacles) if (o.kind === 'kettle' && Math.abs(c.pupX - o.x) <= c.steamHalfW + c.pupR * 0.5) kets.push(o);
    // free mask at Biscuit's x for this step (centre positions)
    let run = 0, bestRun = 0;
    for (let y = 0; y < NY; y++) {
      const ok = y >= yLo && y <= yHi && !W.prototype._collide.call(w, c.pupX, y, r + 0.5);   // +0.5 px: rounding y can never hide a touch
      free[y] = ok ? 1 : 0;
      run = ok ? run + 1 : 0; if (run > bestRun) bestRun = run;
    }
    if (w.t > 3 && bestRun < minFree) { minFree = bestRun; minFreeT = +w.t.toFixed(2); }
    const decide = k % 6 === 0;
    nlist.length = 0;
    for (const b of list) {
      curOn[b] = 0;
      const y0 = curY[b], v0 = curV[b];
      for (let tap = 0; tap < (decide && k > 0 ? 2 : 1); tap++) {
        let y = y0, vy = tap ? c.flapVy : v0;
        let a = c.gravity + gy;
        const base = c.counterY - 120;
        for (const o of kets) {
          const hg = base - y;
          if (hg < -c.pupR || hg > o.steamH) continue;
          a += -c.steamLift * Math.pow(1 - clamp(hg, 0, o.steamH) / o.steamH, c.steamFadePow);
          vy *= Math.exp(-c.steamDrag * h);
        }
        vy = clamp(vy + a * h, -c.maxRise, c.maxFall);
        y += vy * h;
        if (y - c.pupR < c.ceilingY) { y = c.ceilingY + c.pupR; if (vy < 0) vy = 0; }
        if (y + c.pupR > c.counterY) continue;
        const yi = Math.round(y);
        if (yi < 0 || yi >= NY || !free[yi]) continue;
        put(null, null, nxtOn, nxtY, nxtV, nlist, y, vy);
      }
    }
    [curY, nxtY] = [nxtY, curY]; [curV, nxtV] = [nxtV, curV]; [curOn, nxtOn] = [nxtOn, curOn]; [list, nlist] = [nlist, list];
    if (w.t > 3) minAlive = Math.min(minAlive, list.length);
    if (!list.length) { deadAt = +w.t.toFixed(2); break; }
    void gyPrev;
  }
  return { ok: deadAt === null, deadAt, minAlive, minFree, minFreeT };
}

module.exports = { BKF, W, PLAYERS, playRound, firstVisible, reach, makePlayer };

/* ------------------------------------------------------------------ worker mode (forked by run.js) */
if (require.main === module && process.argv[2] === 'worker') {
  process.on('message', msg => {
    if (msg.cmd === 'jobs') {
      const out = msg.jobs.map(j => j.type === 'reach' ? Object.assign({ type: 'reach', diff: j.diff, seed: j.seed, tag: j.tag || 'base' }, reach(j.diff, j.seed, j.config, j.secs))
        : j.type === 'first' ? Object.assign({ type: 'first', diff: j.diff, seed: j.seed, tag: j.tag || 'base' }, firstVisible(j.diff, j.seed, j.config))
        : Object.assign({ type: 'round' }, playRound(j)));
      process.send({ cmd: 'done', out });
    } else if (msg.cmd === 'exit') process.exit(0);
  });
}
