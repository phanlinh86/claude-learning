// Finn's Island Fling — playtest simulation library (report-only: never edits game code).
// A "variant" = a fresh FIF namespace (own vm sandbox) with CONFIG / DIFF / LEVELS overrides and optional
// prototype overrides, so before/after comparisons never leak into each other.
'use strict';
const { load } = require('../unit/load.js');

const DEG = Math.PI / 180;

/** load the game scripts into a fresh vm sandbox, applying source replacements [[file, from, to], …]
 *  (prototype code changes in memory only — the game files on disk are never touched) */
function loadSrc(src) {
  if (!src || !src.length) return load();
  const fs = require('fs'), path = require('path'), vm = require('vm');
  const JS = path.join(__dirname, '..', '..', 'game', 'js');
  const sandbox = { console }; sandbox.window = sandbox; vm.createContext(sandbox);
  for (const fname of ['rng.js', 'world.js', 'weather.js', 'bot.js']) {
    let code = fs.readFileSync(path.join(JS, fname), 'utf8');
    for (const [file, from, to] of src) if (file === fname) {
      if (code.indexOf(from) < 0) throw new Error('patch miss in ' + file + ': ' + from.slice(0, 60));
      code = code.replace(from, to);
    }
    vm.runInContext(code, sandbox, { filename: fname });
  }
  return sandbox.FIF;
}

/** fresh FIF with a patch: { CONFIG: {...}, DIFF: { easy: {...} }, LEVELS: [ {...}|null, ... ], src: [...], code(FIF) } */
function variant(patch) {
  patch = patch || {};
  const FIF = loadSrc(patch.src);
  const W = FIF.World;
  if (patch.CONFIG) Object.assign(W.CONFIG, patch.CONFIG);
  if (patch.DIFF) for (const d in patch.DIFF) Object.assign(W.DIFF[d], patch.DIFF[d]);
  if (patch.LEVELS) patch.LEVELS.forEach((o, i) => { if (o) Object.assign(W.LEVELS[i], o); });
  if (patch.code) patch.code(FIF);
  return FIF;
}

// ---------- helpers ----------
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function pullAt(ang, L) { return { x: -Math.cos(ang) * L, y: -Math.sin(ang) * L }; }
/** analytic flight (no gulls / flutter) of a pull: landing x at the deck height and flight time */
function landAt(FIF, p) {
  const C = FIF.World.CONFIG, W = FIF.World.prototype;
  const v = W.launchVelocity(p.x, p.y);
  // clamp like aim() does
  const q = clampPull(FIF, p.x, p.y);
  const x0 = C.SLING.x + q.x, y0 = C.SLING.y + q.y, yc = C.RAFT_TOP + C.FOOT;
  const disc = v.vy * v.vy + 2 * C.G * (y0 - yc);
  if (disc < 0) return { x: -1e9, T: 0 };
  const T = (v.vy + Math.sqrt(disc)) / C.G;
  return { x: x0 + v.vx * T, T };
}
function clampPull(FIF, dx, dy) {
  const C = FIF.World.CONFIG;
  dx = Math.min(dx, C.PULL_FWD); dy = Math.max(dy, -C.PULL_DOWN);
  const L = Math.hypot(dx, dy);
  if (L > C.PULL_MAX) { dx *= C.PULL_MAX / L; dy *= C.PULL_MAX / L; }
  return { x: dx, y: dy };
}
/** pull length along `ang` whose analytic landing hits X (bisection; clamping included) */
function lenFor(FIF, ang, X) {
  const C = FIF.World.CONFIG;
  let lo = C.PULL_MIN, hi = C.PULL_MAX;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (landAt(FIF, pullAt(ang, m)).x < X) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

// ---------- player models ----------
// A human: think → choose an angle → drag until the visible preview "points at" a target (raft now, or led for
// drift) → hand error (bigger when the preview is too short to show the landing) → release. Flight: random taps,
// smart rescue taps, or flutter spam.
const MODELS = {
  // 4–5-year-old: slow, big errors, often a weak pull (lets go early), uses the preview only partly, random taps
  kid4: { think: [2, 5], drag: [0.8, 1.8], ang: [22, 66], solAng: 0.15, sig: 1.3, learn: [1.6, 1.3, 1.1], lead: 0,
    angSig: 7, powBase: 0.06, powUnseen: 0.14, previewUse: 0.5, weak: 0.22, weakK: [0.45, 0.8],
    tapChance: 0.5, tapsPer: [1, 4], smart: 0, cancelChance: 0.1 },
  // the original tests/unit kid (≈ 6 years): for reference
  kid6: { think: [1.5, 3.5], drag: [0.7, 1.4], ang: [28, 62], solAng: 0, sig: 0.9, learn: [1.7, 1.3, 1], lead: 0,
    angSig: 3, powBase: 0.03, powUnseen: 0.10, previewUse: 1, weak: 0, weakK: [1, 1],
    tapChance: 0.25, tapsPer: [1, 1], smart: 0, cancelChance: 0 },
  // casual adult: quick, uses the full preview, aims along the leaf arc, half-leads the drift, rescues with flutter
  adult: { think: [0.8, 2], drag: [0.5, 0.9], ang: [30, 60], solAng: 0.6, sig: 0.45, learn: [1.4, 1.1, 1], lead: 0.5,
    angSig: 2, powBase: 0.02, powUnseen: 0.06, previewUse: 1, weak: 0, weakK: [1, 1],
    tapChance: 0, tapsPer: [1, 1], smart: 0.6, cancelChance: 0 },
  // spam: casual adult that hammers the screen during every flight (first frame flutter)
  spam: { think: [0.8, 2], drag: [0.5, 0.9], ang: [30, 60], solAng: 0.6, sig: 0.45, learn: [1.4, 1.1, 1], lead: 0.5,
    angSig: 2, powBase: 0.02, powUnseen: 0.06, previewUse: 1, weak: 0, weakK: [1, 1],
    tapChance: 0, tapsPer: [1, 1], smart: 0, spam: true, cancelChance: 0 }
};

class Human {
  constructor(FIF, w, model, seed) {
    this.FIF = FIF; this.w = w; this.m = model; this.r = new FIF.RNG(seed * 13 + 5);
    this.st = 'think'; this.tt = 0; this.shot = 0; this.taps = []; this.flT = 0; this._chk = 0;
    this.newThink();
  }
  newThink() { const r = this.r, m = this.m; this.think = r.range(m.think[0], m.think[1]); this.drag = r.range(m.drag[0], m.drag[1]); }
  plan() {
    const FIF = this.FIF, w = this.w, C = FIF.World.CONFIG, m = this.m, r = this.r;
    const learn = m.learn[Math.min(this.shot, m.learn.length - 1)];
    let ang = w.solution && r.chance(m.solAng) ? w.solution.angle + r.gauss() * 4 * DEG : r.range(m.ang[0], m.ang[1]) * DEG;
    // target: raft now, led part of the way toward where it will be at landing (≈ drag + 1.7 s flight)
    const raft = w.raft, tl = this.drag + 1.7, future = FIF.World.raftX(raft, raft.t + tl);
    const X = raft.x + (future - raft.x) * m.lead + r.gauss() * m.sig * learn;
    let L = lenFor(FIF, ang, X);
    w.aim(pullAt(ang, L).x, pullAt(ang, L).y);
    const seen = Math.min(1, m.previewUse * w.previewCount() * C.PREVIEW_DT / Math.max(0.2, landAt(FIF, pullAt(ang, L)).T));
    w.cancelAim();
    L *= 1 + r.gauss() * (m.powBase + m.powUnseen * (1 - seen)) * learn;
    if (r.chance(m.weak)) L *= r.range(m.weakK[0], m.weakK[1]);
    const a2 = ang + r.gauss() * m.angSig * DEG * learn;
    return pullAt(a2, clamp(L, 0.05, C.PULL_MAX));
  }
  step(dt) {
    const w = this.w, m = this.m, r = this.r;
    if (w.phase === 'aim') {
      this.tt += dt;
      if (this.st !== 'think' && this.st !== 'drag') { this.st = 'think'; this.tt = 0; this.newThink(); }
      if (this.st === 'think' && this.tt >= this.think) { this.pull = this.plan(); this.st = 'drag'; this.tt = 0; }
      if (this.st === 'drag') {
        const k = Math.min(1, this.tt / this.drag);
        w.aim(this.pull.x * k, this.pull.y * k);
        if (k >= 1) {
          if (r.chance(m.cancelChance)) { w.cancelAim(); this.st = 'think'; this.tt = 0; this.newThink(); return; }
          if (!w.release()) { this.st = 'think'; this.tt = 0; this.newThink(); return; }   // too tiny: a cancel
          this.st = 'fly'; this.flT = 0; this._chk = 0;
          this.taps = [];
          if (r.chance(m.tapChance)) { const n = r.int(m.tapsPer[0], m.tapsPer[1]); for (let i = 0; i < n; i++) this.taps.push(r.range(0.15, 1.8)); }
        }
      }
    } else if (w.phase === 'fly') {
      this.flT += dt;
      if (m.spam) w.flutter();
      for (const t of this.taps) if (this.flT >= t) w.flutter();
      if (m.smart > 0 && !w.fluttered) {
        this._chk -= dt;
        if (this._chk <= 0) {
          this._chk = 0.15;
          if (w.fox.vy < 0) {
            const now = w.predictShot(null, 0);
            if (now.type !== 'land' && now.off < 0) { const fl = w.predictShot(null, 0, 0); if (fl.type === 'land' && r.chance(m.smart)) w.flutter(); }
          }
        }
      }
    } else if (this.st === 'fly') { this.st = 'done'; this.shot++; }
  }
}

/** the FIF.Bot wrapped to the same interface */
class BotPlayer {
  constructor(FIF, w, skill, seed) { this.b = new FIF.Bot(w, { skill, seed: seed * 7 + 1 }); }
  step(dt) { this.b.step(dt); }
}

/** fixed pull every time (the "I found the magic pull" player); optional flop-reroll when the raft is "off" */
class FixedPull {
  constructor(FIF, w, pull, opts) {
    this.FIF = FIF; this.w = w; this.pull = pull; this.o = opts || {}; this.t = 0; this.st = 'think';
    this.land = landAt(FIF, pull);
  }
  step(dt) {
    const w = this.w;
    if (w.phase !== 'aim') { this.st = 'think'; this.t = 0; if (this.o.spam && w.phase === 'fly') w.flutter(); return; }
    this.t += dt;
    if (this.t < (this.o.think || 0.6)) return;
    let p = this.pull;
    if (this.o.reroll) {          // eyeball: is the raft roughly in the usual spot? if not, flop on purpose
      if (w.raft.t < this.FIF.World.CONFIG.RAFT_GLIDE + 0.05) return;   // wait until the raft stopped gliding
      const r = w.raft, x = this.FIF.World.raftX(r, r.t + this.land.T);
      if (Math.abs(x - this.land.x) > r.hw * this.o.reroll) p = { x: -0.25, y: -0.25 };
    }
    w.aim(p.x, p.y); w.release();
  }
}

/** flop farmer (oracle): only weak flings that come down on the beach rock; picks the one that grabs most leaves */
class FlopFarmer {
  constructor(FIF, w) { this.FIF = FIF; this.w = w; this.t = 0; }
  step(dt) {
    const w = this.w;
    if (w.phase !== 'aim') { this.t = 0; return; }
    this.t += dt; if (this.t < 0.5) return;
    let best = { x: -0.25, y: -0.25 }, bv = 0;
    for (let a = 0; a <= 80; a += 5) for (let L = 0.32; L <= 1.0; L += 0.04) {
      const p = pullAt(a * DEG, L), pr = w.predictShot(p, 0);
      if (pr.type === 'flop' && pr.value > bv) { bv = pr.value; best = p; }
    }
    w.aim(best.x, best.y); w.release();
  }
}

// ---------- the game runner ----------
/** play one game; returns a rich record. opts: diff, seed, maxT, immortal, level, day, mk(FIF, w) → player */
function play(FIF, opts) {
  const w = new FIF.World({ seed: opts.seed, difficulty: opts.diff, level: opts.level || 0, day: opts.day });
  if (opts.immortal) w.hearts = w.maxHearts = 1e6;
  if (opts.worldHook) opts.worldHook(w);
  const pl = opts.mk(FIF, w, opts.seed);
  const dt = 1 / 60, maxT = opts.maxT || 1200;
  let t = 0, lastLv = 0, firstPoint = null, shotStart = 0;
  const shots = [], levels = [], hearts = { lost: 0, gained: 0, gainT: [] };
  let lvShots = 0;
  while (w.phase !== 'over' && t < maxT) {
    pl.step(dt); w.update(dt); t += dt;
    for (const e of w.drainEvents()) {
      if ((e.type === 'leaf' || e.type === 'land') && firstPoint === null) firstPoint = t;
      if (e.type === 'land' || e.type === 'splash' || e.type === 'flop') {
        shots.push({ type: e.type, bull: !!e.bull, t, light: w.light, night: w.isNight, level: w.level, zone: w.zone, idx: shots.length, lvShot: lvShots++ });
      }
      if (e.type === 'levelUp') { levels.push({ level: e.level - 1, t: t - lastLv, shots: lvShots }); lastLv = t; lvShots = 0; }
      if (e.type === 'heartLost') hearts.lost++;
      if (e.type === 'heartGain') { hearts.gained++; hearts.gainT.push(t); }
    }
  }
  return { t, over: w.phase === 'over', score: w.score, level: w.level, landings: w.stats.landings, stats: w.stats,
    shots, levels, hearts, firstPoint, w };
}

// ---------- stats ----------
function q(arr, p) { if (!arr.length) return NaN; const a = arr.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * (a.length - 1) + 0.5))]; }
function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
function pct(n, d) { return d ? (100 * n / d).toFixed(1) + ' %' : '—'; }
function f(x, d) { return isFinite(x) ? x.toFixed(d === undefined ? 0 : d) : '—'; }
function table(head, rows) {
  return '| ' + head.join(' | ') + ' |\n|' + head.map(() => '---').join('|') + '|\n' + rows.map(r => '| ' + r.join(' | ') + ' |').join('\n') + '\n';
}

module.exports = { variant, play, MODELS, Human, BotPlayer, FixedPull, FlopFarmer, landAt, lenFor, pullAt, clampPull,
  q, mean, pct, f, table, DEG };
