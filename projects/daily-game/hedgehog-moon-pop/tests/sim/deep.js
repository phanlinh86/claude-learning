#!/usr/bin/env node
// Bristle's Moon Pop — DEEP HIGH-SPEED PLAYTEST (report-only: never edits game/js).
//
//   node tests/sim/deep.js --set grid|humans|endless [--n 40] [--cap 10] [--tag x] [--overrides file.json]
//                          [--probe 1] [--workers 2] [--models a,b] [--diffs easy,normal] [--lens 0.7,1,1.4]
//
// Extends players.js with:
//   - more player models: kid4w (Easy kid, skates only, slow, wanders), kid6j (skates + occasional jumps),
//     exploits: standMid (never moves), campVent (parks on one vent, dodges, returns), hugEdge (parks at the edge,
//     dodges), campSpam (parks on a vent and mashes Jump), spamJump (from players.js)
//   - per-pop / per-jump / per-level / per-lap / magnet / heal metrics
//   - a pebble-fairness ORACLE: for every bonk, the world is cloned at (pebblewarn + reaction) and 29 pure dodge
//     targets are tried on copies; if none avoids that pebble the bonk was unavoidable for that reaction time.
// Writes tests/sim/results/deep_<tag>.json (+ .md).
'use strict';
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const { load } = require('../unit/load');

/* ------------------------------------------------------------------ deep clone (keeps prototypes) */
function clone(o, seen) {
  if (o === null || typeof o !== 'object') return o;
  seen = seen || new Map();
  if (seen.has(o)) return seen.get(o);
  const c = Array.isArray(o) ? [] : Object.create(Object.getPrototypeOf(o));
  seen.set(o, c);
  for (const k of Object.keys(o)) c[k] = clone(o[k], seen);
  return c;
}

/* ------------------------------------------------------------------ human-like models */
const HUMANS = {
  // Easy-target 4-year-old: slow, imprecise, skates only, drifts off (finger wanders to a random spot)
  kid4w:  { react: [0.6, 0.8], every: [0.25, 0.4], noise: 34, notice: 0.4, jump: 0, lapse: 0.06, lapseDur: [1, 3], wander: 0.6, dodge: 0.3 },
  kid4:   { react: [0.55, 0.7], every: [0.2, 0.35], noise: 30, notice: 0.35, jump: 0, lapse: 0.05, lapseDur: [1, 3], dodge: 0.35 },
  kid6:   { react: [0.5, 0.5], every: [0.15, 0.25], noise: 20, notice: 0.25, jump: 0, lapse: 0.02, lapseDur: [0.5, 1.5], dodge: 0.6 },
  // 6-year-old who discovered the Jump button: jumps for ~25 % of the bubbles that are out of reach
  kid6j:  { react: [0.45, 0.55], every: [0.15, 0.25], noise: 20, notice: 0.25, jump: 0.25, lapse: 0.02, lapseDur: [0.5, 1.5], dodge: 0.6 },
  casual: { react: [0.25, 0.35], every: [0.08, 0.15], noise: 14, notice: 0.15, jump: 0.7, lapse: 0.005, lapseDur: [0.3, 0.8], dodge: 0.85 },
  casualNJ: { react: [0.25, 0.35], every: [0.08, 0.15], noise: 14, notice: 0.15, jump: 0, lapse: 0.005, lapseDur: [0.3, 0.8], dodge: 0.85 },   // casual, never jumps
  spamJump: { react: [0.25, 0.35], every: [0.08, 0.15], noise: 14, notice: 0.15, jump: 0, lapse: 0, lapseDur: [0, 0], dodge: 0.85, spam: true },
  // exploits
  standMid: { park: 'mid', dodge: 0 },
  campVent: { park: 'vent', dodge: 0.85, react: [0.25, 0.35], every: [0.08, 0.15], notice: 0.15 },
  hugEdge:  { park: 'edge', dodge: 0.85, react: [0.25, 0.35], every: [0.08, 0.15], notice: 0.15 },
  campSpam: { park: 'vent', dodge: 0.85, react: [0.25, 0.35], every: [0.08, 0.15], notice: 0.15, spam: true }
};

function Human(world, prm, seed, MP) {
  this.w = world; this.p = prm; this.rng = new MP.RNG(seed);
  this.queue = []; this.nextLook = 0; this.lapseUntil = -1; this.wanderX = null;
  this.curId = null; this.off = 0; this.seen = {}; this.lastTarget = null;
}
Human.prototype.roll = function (r) { return r[0] + (r[1] - r[0]) * this.rng.next(); };
Human.prototype.info = function (it) {
  let i = this.seen[it.id];
  if (!i) i = this.seen[it.id] = { dodge: this.rng.chance(this.p.dodge || 0), jump: this.rng.chance(this.p.jump || 0) };
  return i;
};
Human.prototype.parkX = function () {
  const w = this.w, c = w.cfg, P = this.p;
  if (P.park === 'mid') return (c.xMin + c.xMax) / 2;
  if (P.park === 'edge') return c.xMin;
  // vent nearest the middle
  let best = null;
  for (const v of w.vents) if (best === null || Math.abs(v.x - 480) < Math.abs(best - 480)) best = v.x;
  return best === null ? 480 : best;
};
Human.prototype.dodge = function (tgt, jump) {
  const w = this.w, c = w.cfg, s = w.hog, P = this.p;
  for (const it of w.items) {
    if (it.kind !== 'pebble' || it.state !== 'fall' || it.harmless || it.t < (P.notice || 0)) continue;
    if (!this.info(it).dodge || it.lt - w.time > 1.8) continue;
    const at = tgt === null ? s.x : tgt, lim = c.pebbleR + c.hogR + 14;
    if (Math.abs(it.lx - at) < lim || Math.abs(it.lx - s.x) < lim) {
      const side = at >= it.lx ? 1 : -1;
      let nx = it.lx + side * (lim + 30);
      if (nx < c.xMin + 5 || nx > c.xMax - 5) nx = it.lx - side * (lim + 30);
      tgt = nx; jump = jump && !!P.spam;
    }
  }
  return { target: tgt, jump };
};
Human.prototype.decide = function () {
  const w = this.w, c = w.cfg, s = w.hog, P = this.p, low = c.hogRestY - (c.bubbleR + c.hogR) + 8;
  if (P.park) return this.dodge(this.parkX(), false);
  let best = null, jumpFor = null;
  for (const it of w.items) {
    if (it.kind === 'pebble') continue;
    const age = it.state === 'puff' ? it.t : it.state === 'rise' ? it._puff + it.t : -1;
    if (age < P.notice) continue;
    const dx = Math.abs(it.x - s.x);
    if (it.state === 'puff' || (it.state === 'rise' && it.y > low)) {
      if (!best || dx < best.d) best = { it, d: dx, x: it.x };
    } else if (it.state === 'rise' && P.jump > 0 && it.y > 230 && it.y < low && this.info(it).jump) {
      if (!jumpFor || dx < jumpFor.d) jumpFor = { it, d: dx, x: it.x };
    }
  }
  let tgt = this.lastTarget, jump = false;
  const pick = (best && jumpFor) ? (jumpFor.d < best.d ? jumpFor : best) : (best || jumpFor);
  const jumping = pick && pick === jumpFor;
  if (pick) {
    if (pick.it.id !== this.curId) { this.curId = pick.it.id; this.off = (this.rng.next() * 2 - 1) * P.noise; }
    tgt = pick.x + this.off;
    if (jumping && Math.abs(jumpFor.x - s.x) < 45 && jumpFor.it.y < c.hogRestY - 90 && jumpFor.it.y > c.hogRestY - 230) jump = true;
  }
  const d = this.dodge(tgt, jump);
  if (d.target !== null) this.lastTarget = d.target;
  return d;
};
Human.prototype.step = function (dt) {
  const w = this.w, t = w.time, P = this.p;
  if (w.state === 'dead') { w.setTarget(null); w.setMove(0); return; }
  if (P.park === 'mid' && !P.react) { w.setTarget(this.parkX()); w.setMove(0); if (P.spam) w.action(); return; }
  if (P.lapse > 0 && t > this.lapseUntil && this.rng.chance(P.lapse * dt)) {
    this.lapseUntil = t + this.roll(P.lapseDur);
    this.wanderX = P.wander && this.rng.chance(P.wander) ? w.cfg.xMin + this.rng.next() * (w.cfg.xMax - w.cfg.xMin) : null;
  }
  if (t >= this.nextLook) {
    this.nextLook = t + this.roll(P.every);
    if (t > this.lapseUntil) { const d = this.decide(); d.at = t + this.roll(P.react); this.queue.push(d); }
  }
  while (this.queue.length && this.queue[0].at <= t) {
    const d = this.queue.shift();
    if (t > this.lapseUntil) { w.setTarget(d.target); if (d.jump) w.action(); }
  }
  if (P.spam) w.action();
  if (t <= this.lapseUntil) w.setTarget(this.wanderX);   // finger lifted (coast) or wandering off
  w.setMove(0);
};

function BotP(MP, w, skill, seed) { this.b = new MP.Bot(w, { skill, seed }); }
BotP.prototype.step = function (dt) { this.b.step(dt); };

/* ------------------------------------------------------------------ fairness oracle */
// From a world copy taken at (pebble warn + reaction), can pure skating (no jump) avoid pebble `id`?
function avoidable(snap, id) {
  const c = snap.cfg, xs = [];
  for (let k = 0; k <= 28; k++) xs.push(c.xMin + (c.xMax - c.xMin) * k / 28);
  xs.push(null);                                   // let go (coast)
  for (const x of xs) {
    const w = clone(snap);
    w.drainEvents();
    let hit = false;
    for (let n = 0; n < 300 && !hit; n++) {          // ≤ 5 s
      w.setTarget(x); w.setMove(0); w.update(1 / 60);
      for (const e of w.drainEvents()) if (e.type === 'bonk' && e.id === id) hit = true;
      const p = w.items.find(it => it.id === id);
      if (!p || p.state !== 'fall' || p.harmless || w.state !== 'playing') break;
    }
    if (!hit) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ one game */
const REACTS = [0.45, 0.8];
function runGame(job) {
  const MP = load(['rng.js', 'world.js', 'bot.js', 'weather.js']);
  const ov = job.overrides || {};
  const config = Object.assign({}, MP.DIFFICULTY[job.diff], ov.all || {}, ov[job.diff] || {}, job.lengthK !== undefined ? { lengthK: job.lengthK } : {});
  const w = new MP.World({ seed: job.seed, config });
  const player = job.model.startsWith('bot') ? new BotP(MP, w, +job.model.slice(3), job.seed * 13 + 5)
    : new Human(w, HUMANS[job.model], job.seed * 31 + 7, MP);
  const wx = job.weather ? new MP.Weather({ width: 960, height: 540, seed: job.seed }) : null;
  const dt = 1 / 60, maxT = job.cap * 60;
  const r = { t: 0, dead: false, score: 0, level: 0, firstPop: null, levels: [], pops: 0, tiers: [0, 0, 0], ground: 0, air: 0,
    magnetPop: 0, bonks: 0, escaped: 0, jumps: 0, chainHist: [0, 0, 0, 0, 0, 0], bestChain: 0, bestCombo: 0,
    magOnT: 0, magOffT: 0, popsOn: 0, popsOff: 0, escOn: 0, escOff: 0, magnetsPopped: 0, magnetsSpawned: 0, magnetsEscaped: 0,
    heals: 0, healUsed: 0, heartsAtClear: [], deathZone: null, deathLap: null, bonkAir: 0,
    ptsOn: 0, ptsOff: 0, probed: 0, unavoid: [0, 0], bonkList: [], maxParticles: 0, playT: 0, ptsAir: 0, ptsGround: 0 };
  let lv = null, go = null, jumpChain = 0, inJump = false;
  const pending = {};          // pebble id → { snaps: [world copy per reaction], warnAt }
  const newLevel = () => { lv = { level: w.level, zone: w.zone, lap: w.lap, t: null, pops: 0, esc: 0, bonks: 0, spawned: 0, playT: 0, target: w.boxTarget }; };
  newLevel();
  let fullHearts = w.heartsMax;
  while (w.state !== 'dead' && w.time < maxT) {
    player.step(dt);
    // oracle snapshots: taken `react` s after each pebble warning
    if (job.probe) for (const id in pending) {
      const P = pending[id];
      for (let k = 0; k < REACTS.length; k++) if (!P.snaps[k] && w.time >= P.warnAt + REACTS[k]) P.snaps[k] = clone(w);
    }
    const magOn = w.magnet.t > 0, playing = w.state === 'playing' && !w._boxFull;
    w.update(dt);
    if (playing) { r.playT += dt; lv.playT += dt; if (magOn) r.magOnT += dt; else r.magOffT += dt; }
    if (wx) { wx.update(dt, { hog: w.hog, world: w }); r.maxParticles = Math.max(r.maxParticles, wx.particles.length); }
    for (const e of w.drainEvents()) {
      if (wx && e.type === 'pop') wx.burst('pop', e.x, e.y, 10);
      switch (e.type) {
        case 'zone': newLevel(); break;
        case 'go': if (go === null) go = w.time; break;
        case 'puff': lv.spawned++; if (e.kind === 'magnet') r.magnetsSpawned++; break;
        case 'jump': inJump = true; jumpChain = 0; r.jumps++; break;
        case 'land': if (inJump) { r.chainHist[Math.min(5, jumpChain)]++; inJump = false; } break;
        case 'pop':
          if (r.firstPop === null) r.firstPop = +(w.time - go).toFixed(2);
          r.pops++; lv.pops++; r.tiers[e.tier - 1]++;
          if (e.air) { r.air++; jumpChain = e.chain; r.ptsAir += e.points; } else { r.ground++; r.ptsGround += e.points; }
          if (e.kind === 'magnet') r.magnetsPopped++;
          if (magOn) { r.popsOn++; r.ptsOn += e.points; } else { r.popsOff++; r.ptsOff += e.points; }
          break;
        case 'escape':
          if (e.kind === 'magnet') { r.magnetsEscaped++; break; }
          r.escaped++; lv.esc++; if (magOn) r.escOn++; else r.escOff++; break;
        case 'pebblewarn': if (job.probe) pending[e.id] = { snaps: [], warnAt: w.time }; break;
        case 'pebbleland': delete pending[e.id]; break;
        case 'bonk': {
          r.bonks++; lv.bonks++; if (w.hog.air || w.hog.y < w.cfg.hogRestY - 1) r.bonkAir++;
          const P = pending[e.id];
          if (P) {
            r.probed++;
            const b = { t: +w.time.toFixed(1), zone: w.zone, lap: w.lap, air: w.hog.y < w.cfg.hogRestY - 1, ok: [] };
            for (let k = 0; k < REACTS.length; k++) {
              const ok = P.snaps[k] ? avoidable(P.snaps[k], e.id) : false;
              b.ok.push(ok); if (!ok) r.unavoid[k]++;
            }
            if (b.ok.indexOf(false) >= 0) r.bonkList.push(b);
            delete pending[e.id];
          }
          break;
        }
        case 'heal': r.heals++; break;
        case 'cleared':
          lv.t = +(w.levelTime).toFixed(1); r.heartsAtClear.push(w.hearts); r.levels.push(lv); break;
        case 'dead': r.deathZone = w.zone; r.deathLap = w.lap; break;
      }
    }
    // drop stale pending entries (bonked earlier / harmless)
    if (job.probe) for (const id in pending) if (!w.items.some(it => it.id === +id && it.state === 'fall')) delete pending[id];
  }
  r.t = +w.time.toFixed(1); r.dead = w.state === 'dead'; r.score = w.score; r.level = w.level;
  r.bestChain = w.bestChain; r.bestCombo = w.bestCombo;
  if (!r.dead && lv.t === null) { lv.partial = true; }
  return r;
}

/* ------------------------------------------------------------------ summary */
const q = (a, p) => { a = a.filter(v => v !== null && v !== undefined && isFinite(v)).sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : NaN; };
const sum = a => a.reduce((x, y) => x + y, 0);
const mean = a => a.length ? sum(a) / a.length : NaN;
const Q3 = a => [q(a, 0.1), q(a, 0.5), q(a, 0.9)];

function summarize(rs) {
  const S = { n: rs.length }, mins = rs.map(r => r.t / 60), M = sum(mins), add = k => sum(rs.map(r => r[k]));
  S.surv = Q3(mins); S.died = mean(rs.map(r => r.dead ? 1 : 0));
  S.score = Q3(rs.map(r => r.score)); S.scoreMin = add('score') / M;
  S.firstPop = Q3(rs.map(r => r.firstPop));
  S.levelReached = Q3(rs.map(r => r.level));
  // pacing: loop 1 per zone, and per lap (all zones)
  S.zone = [0, 1, 2, 3].map(z => Q3(rs.flatMap(r => r.levels.filter(l => l.lap === 0 && l.zone === z).map(l => l.t))));
  S.clearZone = [0, 1, 2, 3].map(z => mean(rs.map(r => r.levels.some(l => l.lap === 0 && l.zone === z) ? 1 : 0)));
  S.lap = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(L => {
    const ls = rs.flatMap(r => r.levels.filter(l => l.lap === L));
    const pt = sum(ls.map(l => l.playT)) / 60;
    return { n: ls.length, t: q(ls.map(l => l.t), 0.5), bonkMin: pt ? sum(ls.map(l => l.bonks)) / pt : NaN,
      popRate: sum(ls.map(l => l.pops)) / Math.max(1, sum(ls.map(l => l.pops + l.esc))), reach: mean(rs.map(r => r.levels.some(l => l.lap === L) ? 1 : 0)) };
  });
  const P = add('pops');
  S.share = { ground: add('ground') / P, air: add('air') / P, t1: sum(rs.map(r => r.tiers[0])) / P, t2: sum(rs.map(r => r.tiers[1])) / P, t3: sum(rs.map(r => r.tiers[2])) / P };
  S.ptsAirShare = add('ptsAir') / Math.max(1, add('ptsAir') + add('ptsGround'));
  S.skyMin = sum(rs.map(r => r.tiers[2])) / M;
  S.popRate = P / Math.max(1, P + add('escaped')); S.escMin = add('escaped') / M;
  S.jumpMin = add('jumps') / M;
  const ch = [0, 1, 2, 3, 4, 5].map(k => sum(rs.map(r => r.chainHist[k]))), J = sum(ch);
  S.chainHist = ch.map(v => J ? v / J : NaN);
  S.popsPerJump = J ? sum(ch.map((v, k) => v * k)) / J : NaN;
  S.bestChain = Q3(rs.map(r => r.bestChain));
  S.bestCombo = Q3(rs.map(r => r.bestCombo));
  S.magnet = { onRate: add('popsOn') / Math.max(1e-9, add('magOnT')) * 60, offRate: add('popsOff') / Math.max(1e-9, add('magOffT')) * 60,
    escOn: add('escOn') / Math.max(1e-9, add('magOnT')) * 60, escOff: add('escOff') / Math.max(1e-9, add('magOffT')) * 60,
    ptsOn: add('ptsOn') / Math.max(1e-9, add('magOnT')) * 60, ptsOff: add('ptsOff') / Math.max(1e-9, add('magOffT')) * 60,
    caught: add('magnetsPopped') / Math.max(1, add('magnetsSpawned')), onShare: add('magOnT') / Math.max(1e-9, add('playT')) };
  S.bonkMin = add('bonks') / M; S.bonkAir = add('bonkAir') / Math.max(1, add('bonks'));
  S.probed = add('probed'); S.unavoid = [0, 1].map(k => sum(rs.map(r => r.unavoid[k])));
  S.unavoidList = rs.flatMap(r => r.bonkList).slice(0, 12);
  S.heals = mean(rs.map(r => r.heals));
  S.healsWasted = 0;
  S.heartsAtClear = Q3(rs.flatMap(r => r.heartsAtClear));
  const dz = [0, 0, 0, 0]; rs.forEach(r => { if (r.dead) dz[r.deathZone]++; }); S.deathZone = dz;
  S.maxParticles = Math.max(0, ...rs.map(r => r.maxParticles));
  return S;
}

/* ------------------------------------------------------------------ parallel runner */
function runAll(jobs, workers, done) {
  const out = new Array(jobs.length);
  let next = 0, fin = 0;
  const nW = Math.max(1, Math.min(workers || require('os').cpus().length, 4, jobs.length));
  for (let k = 0; k < nW; k++) {
    const ch = fork(__filename, ['--worker']);
    const feed = () => { if (next < jobs.length) { ch.send({ i: next, job: jobs[next] }); next++; } else ch.send('exit'); };
    ch.on('message', (m) => { out[m.i] = m.r; if (++fin % 100 === 0) process.stderr.write(fin + '/' + jobs.length + '\n'); if (fin === jobs.length) done(out); feed(); });
    feed();
  }
}

const SETS = {
  grid:    { models: ['bot0.5', 'bot0.8', 'bot1.0'], diffs: ['easy', 'normal', 'hard'], lens: [0.7, 1, 1.4] },
  humans:  { models: ['kid4w', 'kid4', 'kid6', 'kid6j', 'casual', 'spamJump', 'standMid', 'campVent', 'hugEdge', 'campSpam'], diffs: ['easy', 'normal', 'hard'], lens: [1] },
  endless: { models: ['bot0.8', 'bot1.0'], diffs: ['easy', 'normal', 'hard'], lens: [1] },
  jump:    { models: ['casual', 'casualNJ', 'kid6', 'kid6j'], diffs: ['easy', 'normal', 'hard'], lens: [1] },
  kids:    { models: ['kid4w', 'kid4', 'kid6', 'kid6j', 'casual', 'bot0.8'], diffs: ['easy', 'normal'], lens: [1] }
};

if (require.main === module && process.argv[2] === '--worker') {
  process.on('message', (m) => { if (m === 'exit') process.exit(0); process.send({ i: m.i, r: runGame(m.job) }); });
} else if (require.main === module) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
  const set = SETS[arg('set', 'humans')], N = +arg('n', 40), cap = +arg('cap', 10), tag = arg('tag', arg('set', 'humans'));
  const models = arg('models', set.models.join(',')).split(','), diffs = arg('diffs', set.diffs.join(',')).split(',');
  const lens = arg('lens', set.lens.join(',')).split(',').map(Number);
  const ovPath = arg('overrides', null), overrides = ovPath ? JSON.parse(fs.readFileSync(ovPath, 'utf8')) : null;
  const probe = +arg('probe', 1), weather = +arg('weather', 0);
  const jobs = [];
  for (const model of models) for (const diff of diffs) for (const lengthK of lens) for (let k = 0; k < N; k++)
    jobs.push({ model, diff, lengthK, seed: 1000 + k * 7919, cap, overrides, probe, weather });
  const t0 = Date.now();
  runAll(jobs, +arg('workers', 0), (out) => {
    const C = {}, S = {};
    jobs.forEach((j, i) => { const key = j.model + '|' + j.diff + '|' + j.lengthK; (C[key] = C[key] || []).push(out[i]); });
    for (const k in C) S[k] = summarize(C[k]);
    const dir = path.join(__dirname, 'results');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `deep_${tag}.json`), JSON.stringify({ tag, N, cap, overrides, runs: jobs.length, secs: (Date.now() - t0) / 1000, summary: S }, null, 0));
    console.log(`${jobs.length} runs in ${((Date.now() - t0) / 1000).toFixed(0)} s → results/deep_${tag}.json`);
  });
}

module.exports = { runGame, summarize, clone, avoidable, HUMANS };
