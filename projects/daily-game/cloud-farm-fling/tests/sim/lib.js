// Nubi's Farm Fling — playtest simulation library (report-only: never edits game code).
// Ported from the fox game's sim. A "variant" = a fresh CFF namespace (its own vm sandbox) with CONFIG / DIFF /
// LEVELS overrides and optional in-memory source replacements, so before/after runs never leak into each other.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

const DEG = Math.PI / 180;
const JS = path.join(__dirname, '..', '..', 'game', 'js');

/** load rng/world/bot into a fresh sandbox, applying source replacements [[file, from, to], …] in memory */
function loadSrc(src) {
  const sandbox = { console }; sandbox.window = sandbox; vm.createContext(sandbox);
  for (const fname of ['rng.js', 'world.js', 'bot.js']) {
    let code = fs.readFileSync(path.join(JS, fname), 'utf8');
    for (const [file, from, to] of src || []) if (file === fname) {
      if (code.indexOf(from) < 0) throw new Error('patch miss in ' + file + ': ' + from.slice(0, 70));
      code = code.replace(from, to);
    }
    vm.runInContext(code, sandbox, { filename: fname });
  }
  return sandbox.CFF;
}

/** fresh CFF with a patch: { CONFIG, DIFF: {easy: {...}}, LEVELS: [ {...}|null ], src: [...] } */
function variant(patch) {
  patch = patch || {};
  const CFF = loadSrc(patch.src);
  const W = CFF.World;
  if (patch.CONFIG) for (const k in patch.CONFIG) {
    const v = patch.CONFIG[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(W.CONFIG[k], v); else W.CONFIG[k] = v;
  }
  if (patch.DIFF) for (const d in patch.DIFF) Object.assign(W.DIFF[d], patch.DIFF[d]);
  if (patch.LEVELS) patch.LEVELS.forEach((o, i) => { if (o) Object.assign(W.LEVELS[i], o); });
  return CFF;
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function pullAt(ang, L) { return { x: -Math.cos(ang) * L, y: -Math.sin(ang) * L }; }

// ---------- human player models ----------
// A human looks at the dotted preview (the game's own size-aware w.preview(), exactly what is on screen).
//  * if the dots reach the outcome (they stop on the wagon / grass) the human reads the landing x off the last dot;
//  * otherwise they EXTRAPOLATE the visible arc: 'naive' = a plain parabola with g = G (a kid who ignores the size),
//    'fit' = gravity estimated from the curvature of the last dots (an adult reading the arc).
// They pick an angle (random range, or along the firefly arc), choose the pull whose estimated landing hits their
// target (wagon now, partly led toward where it rolls), then add hand error (target σ, power σ, angle σ). Shots 1–3
// are clumsier (learn[]). Flight: random taps, smart rescue puff, or puff spam every frame.
const MODELS = {
  // ≈ 5 years: slow, coarse, often lets go a bit early, rarely puffs, ignores the size (naive extrapolation)
  kid: { think: [2, 4.5], drag: [0.8, 1.6], ang: [25, 62], solAng: 0, sig: 1.0, learn: [1.7, 1.35, 1.1, 1], lead: 0,
    angSig: 6, powSig: 0.07, extrap: 'naive', weak: 0.12, weakK: [0.6, 0.85], tap: 0.12, smart: 0, cancel: 0.05 },
  // a younger / clumsier kid (≈ 4): sensitivity check
  kid4: { think: [2.5, 5.5], drag: [0.9, 1.9], ang: [20, 66], solAng: 0, sig: 1.35, learn: [1.8, 1.4, 1.15, 1], lead: 0,
    angSig: 8, powSig: 0.1, extrap: 'naive', weak: 0.2, weakK: [0.5, 0.85], tap: 0.2, smart: 0, cancel: 0.08 },
  // casual adult: quick, follows the firefly arc half the time, half-leads the rolling wagon, rescues with a puff
  adult: { think: [0.8, 1.8], drag: [0.4, 0.8], ang: [30, 60], solAng: 0.5, sig: 0.45, learn: [1.4, 1.1, 1], lead: 0.5,
    angSig: 2, powSig: 0.025, extrap: 'fit', weak: 0, weakK: [1, 1], tap: 0, smart: 0.6, cancel: 0 },
  // spam exploiter: no thinking, drags fast, releases at once, hammers the screen in every flight
  spam: { think: [0.15, 0.3], drag: [0.12, 0.25], ang: [35, 55], solAng: 0, sig: 0.7, learn: [1, 1], lead: 0.3,
    angSig: 4, powSig: 0.05, extrap: 'fit', weak: 0, weakK: [1, 1], tap: 0, smart: 0, spam: true, cancel: 0 },
  // size farmer: a casual adult who sits in the aim phase until Nubi is ≥ farmTo (Big Shower), then shoots
  farmer: { think: [0.8, 1.8], drag: [0.4, 0.8], ang: [30, 60], solAng: 0.5, sig: 0.45, learn: [1.4, 1.1, 1], lead: 0.5,
    angSig: 2, powSig: 0.025, extrap: 'fit', weak: 0, weakK: [1, 1], tap: 0, smart: 0.6, cancel: 0, farmTo: 1.42 },
  farmerMax: { think: [0.8, 1.8], drag: [0.4, 0.8], ang: [30, 60], solAng: 0.5, sig: 0.45, learn: [1.4, 1.1, 1], lead: 0.5,
    angSig: 2, powSig: 0.025, extrap: 'fit', weak: 0, weakK: [1, 1], tap: 0, smart: 0.6, cancel: 0, farmTo: 1.69 }
};

/** where the human THINKS this pull lands, from what the preview shows. Leaves w.pull as it was. */
function estLanding(CFF, w, pull, mode) {
  const C = CFF.World.CONFIG, keep = w.pull, kp = w._pulled;
  w.pull = { x: pull.x, y: pull.y };
  const n = w.previewCount(), pts = w.preview(n);
  w.pull = keep; w._pulled = kp;
  const every = Math.max(1, Math.round(C.PREVIEW_DT / C.STEP)), dt = every * C.STEP;
  if (!pts.length) return { x: C.SLING.x, seen: true };
  const last = pts[pts.length - 1];
  if (pts.length < n) return { x: last.x, seen: true };                     // dots end at the outcome
  if (pts.length < 3) return { x: last.x, seen: false };
  const a = pts[pts.length - 3], b = pts[pts.length - 2], c = last;
  const vx = (c.x - b.x) / dt, vy = (c.y - b.y) / dt + 0.5 * C.G * dt;
  let g = C.G;
  if (mode === 'fit') g = clamp(-(c.y - 2 * b.y + a.y) / (dt * dt), 4, 14);
  const yc = C.WAGON_TOP + C.FOOT * (last.size || w.nubi.size);              // sprite bottom touches the soil
  const disc = vy * vy + 2 * g * (c.y - yc);
  if (disc < 0) return { x: c.x, seen: false };
  const T = (vy + Math.sqrt(disc)) / g;
  return { x: c.x + vx * T, seen: false, T };
}

/** pull length along ang whose ESTIMATED landing (estLanding) is closest to X (coarse grid + local bisection) */
function pullForTarget(CFF, w, ang, X, mode) {
  const C = CFF.World.CONFIG;
  let best = null;
  for (let L = C.PULL_MIN + 0.02; L <= C.PULL_MAX + 1e-9; L += 0.1) {
    const e = estLanding(CFF, w, pullAt(ang, L), mode), d = Math.abs(e.x - X);
    if (!best || d < best.d) best = { L, d, e };
  }
  let lo = Math.max(C.PULL_MIN, best.L - 0.1), hi = Math.min(C.PULL_MAX, best.L + 0.1);
  for (let i = 0; i < 9; i++) {
    const m = (lo + hi) / 2, e = estLanding(CFF, w, pullAt(ang, m), mode);
    if (Math.abs(e.x - X) < best.d) best = { L: m, d: Math.abs(e.x - X), e };
    if (e.x < X) lo = m; else hi = m;
  }
  return best;
}

class Human {
  constructor(CFF, w, model, seed) {
    this.CFF = CFF; this.w = w; this.m = model; this.r = new CFF.RNG(seed * 13 + 5);
    this.st = 'think'; this.tt = 0; this.shot = 0; this.taps = []; this.flT = 0; this._chk = 0;
    this.lastSeen = []; this.newThink();
  }
  newThink() { const r = this.r, m = this.m; this.think = r.range(m.think[0], m.think[1]); this.drag = r.range(m.drag[0], m.drag[1]); }
  plan(final) {
    const CFF = this.CFF, w = this.w, C = CFF.World.CONFIG, m = this.m, r = this.r;
    if (!final) {                                      // decide angle + personal errors once per shot
      const learn = m.learn[Math.min(this.shot, m.learn.length - 1)];
      this.ang = w.solution && r.chance(m.solAng) ? w.solution.angle + r.gauss() * 4 * DEG : r.range(m.ang[0], m.ang[1]) * DEG;
      this.err = { x: r.gauss() * m.sig * learn, p: r.gauss() * m.powSig * learn, a: r.gauss() * m.angSig * DEG * learn,
        weak: r.chance(m.weak) ? r.range(m.weakK[0], m.weakK[1]) : 1 };
    }
    const wg = w.wagon, future = CFF.World.wagonX(wg, wg.t + 1.7);
    const X = wg.x + (future - wg.x) * m.lead + this.err.x;
    const b = pullForTarget(CFF, w, this.ang, X, m.extrap);
    this.seen = b.e.seen;
    const L = clamp(b.L * (1 + this.err.p) * this.err.weak, 0.05, C.PULL_MAX);
    return pullAt(this.ang + this.err.a, L);
  }
  step(dt) {
    const w = this.w, m = this.m, r = this.r;
    if (w.phase === 'aim') {
      this.tt += dt;
      if (this.st !== 'think' && this.st !== 'drag' && this.st !== 'farm') { this.st = 'think'; this.tt = 0; this.newThink(); }
      if (this.st === 'think' && m.farmTo && w.nubi.size < m.farmTo && w.phaseT <= 130) { this.st = 'farm'; }
      if (this.st === 'farm') { if (w.nubi.size >= m.farmTo || w.phaseT > 130) { this.st = 'think'; this.tt = 0; } else return; }   // gives up after 130 s
      if (this.st === 'think' && this.tt >= this.think) { this.pull = this.plan(false); this.st = 'drag'; this.tt = 0; }
      if (this.st === 'drag') {
        const k = Math.min(1, this.tt / this.drag);
        w.aim(this.pull.x * k, this.pull.y * k);
        if (k >= 1) {
          if (r.chance(m.cancel)) { w.cancelAim(); this.st = 'think'; this.tt = 0; this.newThink(); return; }
          const p = this.plan(true);                   // final adjustment with what the preview shows now
          w.aim(p.x, p.y);
          this.relSize = w.nubi.size; this.relSeen = this.seen;
          if (!w.release()) { this.st = 'think'; this.tt = 0; this.newThink(); return; }
          this.st = 'fly'; this.flT = 0; this._chk = 0;
          this.taps = r.chance(m.tap) ? [r.range(0.2, 1.6)] : [];
        }
      }
    } else if (w.phase === 'fly') {
      this.flT += dt;
      if (m.spam) w.puff();
      for (const t of this.taps) if (this.flT >= t) w.puff();
      if (m.smart > 0 && !w.puffed) {
        this._chk -= dt;
        if (this._chk <= 0) {
          this._chk = 0.15;
          if (w.nubi.vy < 0.5) {
            const now = w.predictShot(null, 0);
            if (now.type !== 'land' && now.off < 0) { const fl = w.predictShot(null, 0, 0); if (fl.type === 'land' && r.chance(m.smart)) w.puff(); }
          }
        }
      }
    } else if (this.st === 'fly') { this.st = 'done'; this.shot++; }
  }
}

/** CFF.Bot wrapped to the same interface */
class BotPlayer {
  constructor(CFF, w, skill, seed) { this.w = w; this.b = new CFF.Bot(w, { skill, seed: seed * 7 + 1 }); }
  step(dt) { if (this.w.phase === 'aim') this.relSize = this.w.nubi.size; this.b.step(dt); }
}

/** flop farmer: a tiny fling that comes down on the hay bale (free retry, Nubi keeps growing), until big */
class FlopFarmer {
  constructor(CFF, w, seed, farmTo) { this.CFF = CFF; this.w = w; this.t = 0; this.farmTo = farmTo || 1.42; this.adult = new Human(CFF, w, MODELS.adult, seed); }
  step(dt) {
    const w = this.w;
    if (w.phase === 'aim' && w.nubi.size < this.farmTo && this.adult.st !== 'drag' && (this.flops = (this.flops || 0)) < 60) {
      this.t += dt; if (this.t < 0.3) return; this.t = 0;
      w.aim(-0.35, -0.3); if (w.release()) this.flops++; return;
    }
    if (w.phase === 'land') this.flops = 0;
    this.adult.step(dt);
  }
}

// ---------- the game runner ----------
/** play one game; opts: diff, seed, maxT, immortal, level, size, mk(CFF, w, seed) → player, untilLevel, hook(w, e) */
function play(CFF, opts) {
  const w = new CFF.World({ seed: opts.seed, difficulty: opts.diff, level: opts.level || 0, size: opts.size || 1 });
  if (opts.immortal) w.hearts = w.maxHearts = 1e6;
  const pl = opts.mk(CFF, w, opts.seed);
  const dt = 1 / 60, maxT = opts.maxT || 900;
  let t = 0, lastLv = 0, firstPoint = null, lvShots = 0, flyStart = 0, aimStart = 0, flopRun = 0, maxFlopRun = 0;
  const shots = [], levels = [], hearts = { lost: 0, gained: 0 }, bad = [];
  let shotFlies = 0, nextCheck = 0;
  while (w.phase !== 'over' && t < maxT) {
    pl.step(dt); w.update(dt); t += dt;
    if (w.phase === 'fly' && w.phaseT > CFF.World.CONFIG.MAX_FLIGHT + 1) bad.push('fly>' + CFF.World.CONFIG.MAX_FLIGHT + 's t=' + t.toFixed(1));
    if (t >= nextCheck) {
      nextCheck = t + 0.5;
      const n = w.nubi;
      if (![n.x, n.y, n.vx, n.vy, n.size, n.goal, w.wagon.x, w.score].every(isFinite)) bad.push('NaN t=' + t.toFixed(1));
      if (n.size < 1 - 1e-9 || n.size > CFF.World.CONFIG.SIZE_MAX + 1e-9) bad.push('size ' + n.size);
    }
    for (const e of w.drainEvents()) {
      if (opts.hook) opts.hook(w, e);
      if ((e.type === 'fly' || e.type === 'land') && firstPoint === null) firstPoint = t;
      if (e.type === 'fly') shotFlies++;
      if (e.type === 'launch') flyStart = t;
      if (e.type === 'land' || e.type === 'plop' || e.type === 'flop') {
        shots.push({ type: e.type, bull: !!e.bull, big: !!e.big, t, level: w.level, zone: w.zone, lvShot: lvShots++, flies: shotFlies,
          size: pl.relSize !== undefined ? pl.relSize : (pl.b ? undefined : undefined), seen: pl.relSeen, idx: shots.length, avail: w._availFlies });
        shotFlies = 0;
        if (e.type === 'flop') { flopRun++; maxFlopRun = Math.max(maxFlopRun, flopRun); } else flopRun = 0;
      }
      if (e.type === 'levelUp') { levels.push({ level: e.level - 1, t: t - lastLv, shots: lvShots }); lastLv = t; lvShots = 0; }
      if (e.type === 'heartLost') hearts.lost++;
      if (e.type === 'heartGain') hearts.gained++;
    }
    if (opts.untilLevel !== undefined && w.level >= opts.untilLevel) break;
  }
  return { t, over: w.phase === 'over', score: w.score, level: w.level, landings: w.stats.landings, stats: w.stats,
    shots, levels, hearts, firstPoint, bad, maxFlopRun, w };
}

// ---------- stats ----------
function q(arr, p) { if (!arr.length) return NaN; const a = arr.slice().sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * (a.length - 1) + 0.5))]; }
function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
function pct(n, d) { return d ? (100 * n / d).toFixed(0) + ' %' : '—'; }
function f(x, d) { return isFinite(x) ? x.toFixed(d === undefined ? 0 : d) : '—'; }
function table(head, rows) {
  return '| ' + head.join(' | ') + ' |\n|' + head.map(() => '---').join('|') + '|\n' + rows.map(r => '| ' + r.join(' | ') + ' |').join('\n') + '\n';
}

module.exports = { variant, loadSrc, play, MODELS, Human, BotPlayer, FlopFarmer, estLanding, pullForTarget, pullAt,
  q, mean, pct, f, table, DEG, clamp };
