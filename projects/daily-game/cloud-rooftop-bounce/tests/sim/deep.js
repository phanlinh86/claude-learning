#!/usr/bin/env node
// Wisp's Rooftop Bounce — deep high-speed playtest (report-only; never edits game/).
//   node tests/sim/deep.js [--n 40] [--cap 600] [--patch baseline|P1|...] [--models a,b] [--diffs easy,normal]
//                          [--out file.json] [--exp lastbricks|longrun|all] [--quiet]
// Loads game/js into a vm (tests/unit/load.js), optionally monkey-patches CONFIG / LAYOUTS in that vm (see PATCHES),
// and plays bot skills 0.2…1.0 and human-like models (kid4, kid56, adult, spammers) × difficulties.
'use strict';
const fs = require('fs');
const { load } = require('../unit/load');
const { adult: adultModel } = require('./players');

function arg(name, def) { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; }
const N = +arg('n', 40), CAP = +arg('cap', 600), QUIET = process.argv.includes('--quiet');

// ---------------------------------------------------------------- patches (monkey-patched CONFIG / LAYOUTS)
// Code-level idea, tested on the vm copy only: a magnet release keeps the stall clock running (world.js resets
// noBrickT on every release) and a release during a stall is steered like a Wisp bounce (anti-stall).
function releaseSteer(WRB) {
  const W = WRB.World, C = W.CONFIG, orig = W.prototype._release;
  W.prototype._release = function (auto) {
    const keep = this.noBrickT, b = this.ball;
    if (!b || !b.stuck) return;
    orig.call(this, auto);
    this.noBrickT = keep;
    if (keep > C.ANTI_STALL) {
      const tgt = this._nearestBrickAngle(b.x, C.PADDLE_Y + b.r);
      if (tgt !== null) {
        const kk = Math.min(1, 0.5 + 0.5 * (keep - C.ANTI_STALL) / C.ANTI_STALL);
        let ang = Math.atan2(b.vx, b.vy) * 180 / Math.PI;
        ang = Math.max(-C.MAX_ANGLE, Math.min(C.MAX_ANGLE, (1 - kk) * ang + kk * tgt)) * Math.PI / 180;
        b.vx = b.speed * Math.sin(ang); b.vy = b.speed * Math.cos(ang); this._normalize(b);
      }
    }
  };
}
// Code-level idea 2: an AUTO release (the child just waits) aims at the nearest block for them, like a full-strength
// anti-stall bounce; a hand release stays exactly where the child aimed.
function autoAim(WRB) {
  const W = WRB.World, C = W.CONFIG, orig = W.prototype._release;
  W.prototype._release = function (auto) {
    const b = this.ball; if (!b || !b.stuck) return;
    orig.call(this, auto);
    if (!auto) return;
    const tgt = this._nearestBrickAngle(b.x, C.PADDLE_Y + b.r);
    if (tgt === null) return;
    const ang = Math.max(-C.MAX_ANGLE, Math.min(C.MAX_ANGLE, tgt)) * Math.PI / 180;
    b.vx = b.speed * Math.sin(ang); b.vy = b.speed * Math.cos(ang); this._normalize(b);
  };
}
// Each patch gets (CONFIG, LAYOUTS, WRB) of a fresh vm copy; game/js/world.js is never edited.
const PATCHES = {
  baseline: () => {},
  AS3: (C) => { C.ANTI_STALL = 3; },
  NET12: (C) => { C.DIFF.easy.netSaves = 12; },
  NET16: (C) => { C.DIFF.easy.netSaves = 16; },
  W42: (C) => { C.DIFF.easy.paddleW = 4.2; },
  SPD50: (C) => { C.DIFF.easy.ballSpeed = 5.0; },
  STICK25: (C) => { C.STICK_T = 2.5; },
  RS: (C, L, WRB) => { releaseSteer(WRB); },
  AUTOAIM: (C, L, WRB) => { autoAim(WRB); },
  EASYKID: (C) => { C.DIFF.easy.netSaves = 14; C.DIFF.easy.paddleW = 4.2; },
  // LAYOUTS: fewer tough hits in the two slowest walls (Spires 8 t → 4 t and a bottom row with open ends; Lanes 10 t → 6 t)
  LAY: (C, L) => { L[1][0] = '....bb....'; L[1][5] = 'bgbbbbbbgb'; L[1][6] = '.bbbbbbbb.'; L[3][5] = 'bbb.bbb.bb'; },
  MID: (C) => { C.DIFF.easy.netSaves = 12; C.DIFF.easy.paddleW = 4.2; },
  REC_CFG: (C) => { C.DIFF.easy.netSaves = 12; C.DIFF.easy.paddleW = 4.2; C.ANTI_STALL = 3; },
  REC_AA: (C, L, WRB) => { C.DIFF.easy.netSaves = 12; C.DIFF.easy.paddleW = 4.2; C.ANTI_STALL = 3; releaseSteer(WRB); autoAim(WRB); },
  REC: (C, L, WRB) => { C.DIFF.easy.netSaves = 12; C.DIFF.easy.paddleW = 4.2; C.ANTI_STALL = 3; releaseSteer(WRB); }
};
function freshWRB(patch) {
  const WRB = load();
  patch.split('+').forEach(k => { if (!PATCHES[k]) throw new Error('no patch ' + k); PATCHES[k](WRB.World.CONFIG, WRB.World.LAYOUTS, WRB); });
  return WRB;
}

// ---------------------------------------------------------------- player models
function eyes() {
  const buf = [];
  return {
    push(t, w) { const b = w.ball; buf.push({ t, x: b ? b.x : null, y: b ? b.y : null, vx: b ? b.vx : 0, vy: b ? b.vy : 0, stuck: !!(b && b.stuck) }); if (buf.length > 300) buf.shift(); },
    at(t) { for (let i = buf.length - 1; i >= 0; i--) if (buf[i].t <= t) return buf[i]; return buf[0]; }
  };
}
/**
 * A young child: sees the ball `delay` s late, puts the finger where the ball IS (no prediction), overshoots,
 * hand noise, refreshes the finger every `refresh` s, small jitter wiggles, and "stops moving" (looks away)
 * on average every `lapseEvery` s for `lapse` s. Taps serve after `serveT` s (pNoServe: never, auto-serve does it),
 * taps release after `relT` (pNoRel: waits for auto-release). Chases a falling item when the ball goes up (pChase).
 */
function child(WRB, o) {
  return (w, seed) => {
    const R = new WRB.RNG(seed * 31 + o.salt), E = eyes();
    let t = 0, next = 0, finger = 8, lapseUntil = -1, serveAt = -1, plan = null;
    return dt => {
      t += dt; E.push(t, w);
      const stuck = w.ball && w.ball.stuck;
      if (w.phase === 'serve' || stuck) {
        if (serveAt < 0) serveAt = R.chance(stuck ? o.pNoRel : o.pNoServe) ? 1e9 : t + (stuck ? R.range(o.relT[0], o.relT[1]) : R.range(o.serveT[0], o.serveT[1]));
        if (t >= serveAt) { w.serve(); serveAt = -1; }
      } else serveAt = -1;
      if (t < lapseUntil) return;
      if (R.chance(dt / o.lapseEvery)) { lapseUntil = t + R.range(o.lapse[0], o.lapse[1]); return; }
      if (t < next) return;
      next = t + R.range(o.refresh[0], o.refresh[1]);
      const seen = E.at(t - Math.max(0.15, o.delay + 0.12 * R.gauss()));
      let goal = seen.x === null ? 8 : seen.x;
      const it = w.gems[0] || w.powerups[0];
      if (seen.vy > 0 && it && !it.pulled) {
        if (Math.abs(plan) !== it.id) plan = R.chance(o.pChase) ? it.id : -it.id;
        if (plan === it.id) goal = it.x;
      }
      const jump = goal - finger;
      finger = goal + o.over * jump * (Math.abs(jump) > 0.6 ? 1 : 0) + o.noise * R.gauss() + (R.chance(0.3) ? o.jit * R.gauss() : 0);
      w.setPaddleTarget(finger);
    };
  };
}
const KID4 = { salt: 41, delay: 0.75, over: 0.5, noise: 0.7, jit: 0.4, refresh: [0.2, 0.45], lapseEvery: 12, lapse: [1.5, 4],
  serveT: [1.2, 3.5], pNoServe: 0.4, relT: [0.6, 1.6], pNoRel: 0.6, pChase: 0.25 };
const KID56 = { salt: 56, delay: 0.45, over: 0.35, noise: 0.45, jit: 0.5, refresh: [0.12, 0.3], lapseEvery: 15, lapse: [1, 3],
  serveT: [0.6, 2.2], pNoServe: 0.25, relT: [0.3, 1.0], pNoRel: 0.3, pChase: 0.45 };

function botPlayer(WRB, skill, o) {
  o = o || {};
  return (w, seed) => {
    const bot = new WRB.Bot(w, { skill, seed: seed * 7 + 1 });
    return dt => { bot.step(dt); if (o.instantRelease && w.ball && w.ball.stuck) w.serve(); };
  };
}
/** spammers: serve()/release every frame */
function spamTrack(WRB) {   // casual-adult tracking + taps every frame (instant serve, instant release, no aim)
  return (w, seed) => { const a = adultModel(WRB)(w, seed); return dt => { a(dt); w.serve(); }; };
}
function parkSpam(x0) { return () => w => dt => { w.setPaddleTarget(x0); w.serve(); }; }
function botSpam(WRB, skill) {   // a good tracker that releases instantly and never aims (stick abuse: never lost while stuck)
  return botPlayer(WRB, skill, { instantRelease: true });
}

function models(WRB) {
  const m = {};
  for (const s of [0.2, 0.4, 0.6, 0.8, 1.0]) m['bot' + s.toFixed(1)] = botPlayer(WRB, s);
  m.kid4 = child(WRB, KID4);
  m.kid56 = child(WRB, KID56);
  m.adult = adultModel(WRB);
  m.spamTrack = spamTrack(WRB);
  m.parkSpam8 = parkSpam(8)(WRB);
  m['botSpam0.8'] = botSpam(WRB, 0.8);
  return m;
}

// ---------------------------------------------------------------- one game with full instrumentation
function finite(v) { return typeof v === 'number' && Number.isFinite(v); }
function playOne(WRB, M, model, diff, seed, cap) {
  const w = new WRB.World({ seed, difficulty: diff });
  const step = M[model](w, seed), dt = 1 / 60;
  let t = 0, firstPt = null, noBrick = 0, longestNoBrick = 0, nan = 0, above = 0, longestAbove = 0;
  let lastScore = 0, scoreStuckT = 0, maxScoreStill = 0, minHearts = w.hearts, at5 = 0;
  let gemSpawn = 0, magSpawn = 0, autoRel = 0, manualRel = 0, releases = [];
  let zoneStart = 0, lastN = {}, zoneRecs = [], curZone = { zone: w.zone, level: w.level, t3: null, t2: null, t1: null, mag3: false, sticksLast3: 0, n0: w.bricksLeft() };
  let ceilRun = 0, maxCeilRun = 0, gapWall = 0, maxGapWall = 0;
  while (w.phase !== 'over' && t < cap) {
    step(dt); w.update(dt); t += dt;
    const b = w.ball, p = w.paddle;
    if (!finite(p.x) || !finite(w.score) || (b && !(finite(b.x) && finite(b.y) && finite(b.vx) && finite(b.vy) && finite(b.speed)))) nan++;
    for (const g of w.gems) if (!finite(g.x) || !finite(g.y)) nan++;
    if (w.phase === 'play') {
      if (!(b && b.stuck)) noBrick += dt;
      gapWall += dt; if (gapWall > maxGapWall) maxGapWall = gapWall;
      if (noBrick > longestNoBrick) longestNoBrick = noBrick;
      let top = -1; for (const k of w.bricks) if (k.alive && k.y + k.h / 2 > top) top = k.y + k.h / 2;
      if (b && top > 0 && b.y - b.r > top) { above += dt; if (above > longestAbove) longestAbove = above; } else above = 0;
      const n = w.bricksLeft();
      if (n <= 3 && curZone.t3 === null) { curZone.t3 = w.zoneT; curZone.mag3 = w.magnet.t > 0; }
      if (n <= 2 && curZone.t2 === null) curZone.t2 = w.zoneT;
      if (n <= 1 && curZone.t1 === null) curZone.t1 = w.zoneT;
    } else above = 0;
    if (w.score === lastScore && w.phase !== 'clear') { scoreStuckT += dt; if (scoreStuckT > maxScoreStill) maxScoreStill = scoreStuckT; } else { scoreStuckT = 0; lastScore = w.score; }
    if (w.hearts < minHearts) minHearts = w.hearts;
    if (w.hearts >= 5) at5 += dt;
    for (const e of w.drainEvents()) {
      if (e.type === 'brick') { if (firstPt === null) firstPt = t; noBrick = 0; gapWall = 0; }
      else if (e.type === 'gemCatch' && firstPt === null) firstPt = t;
      else if (e.type === 'ballLost') { noBrick = 0; gapWall = 0; }
      else if (e.type === 'gemSpawn') gemSpawn++;
      else if (e.type === 'magnetSpawn') magSpawn++;
      else if (e.type === 'stick') { if (curZone.t3 !== null) curZone.sticksLast3++; }
      else if (e.type === 'release') { if (e.auto) autoRel++; else manualRel++; }
      else if (e.type === 'wall' && e.side === 'top') { ceilRun++; if (ceilRun > maxCeilRun) maxCeilRun = ceilRun; }
      else if (e.type === 'paddle' || e.type === 'stick') ceilRun = 0;
      if (e.type === 'levelClear') {
        curZone.time = e.time; noBrick = 0; gapWall = 0;
        for (const k of ['t3', 't2', 't1']) if (curZone[k] === null) curZone[k] = e.time;   // several broke at once
        zoneRecs.push(curZone);
      }
      if (e.type === 'levelUp') curZone = { zone: e.zone, level: e.level, t3: null, t2: null, t1: null, mag3: false, sticksLast3: 0, n0: w.bricksLeft() };
    }
  }
  const st = w.stats;
  return {
    model, diff, seed, survived: t, over: w.phase === 'over', zones: w.level, score: w.score, firstPt,
    zoneRecs, longestNoBrick, maxGapWall, longestAbove, maxCeilRun, maxScoreStill, nan,
    gemSpawn, gems: st.gems, magSpawn, magnets: st.magnets, catches: st.catches, autoRel, manualRel,
    lost: st.lost, netSaves: st.netSaves, minHearts, at5, finalHearts: w.hearts, paddleHits: st.paddleHits
  };
}

// ---------------------------------------------------------------- stats
const q = (a, p) => { a = a.filter(Number.isFinite); if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const f0 = v => Number.isFinite(v) ? v.toFixed(0) : '-';
const f1 = v => Number.isFinite(v) ? v.toFixed(1) : '-';
const pc = v => Number.isFinite(v) ? (100 * v).toFixed(0) + '%' : '-';
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;

function summarize(rs) {
  const sum = k => rs.reduce((a, r) => a + r[k], 0);
  const zr = [].concat(...rs.map(r => r.zoneRecs));
  const zt = zr.map(z => z.time), last3 = zr.map(z => z.time - z.t3), last1 = zr.map(z => z.time - z.t1);
  const z1 = rs.map(r => r.zoneRecs[0] ? r.zoneRecs[0].time : NaN);
  return {
    n: rs.length, overPct: rs.filter(r => r.over).length / rs.length,
    survP10: q(rs.map(r => r.survived), 0.1), survP50: q(rs.map(r => r.survived), 0.5),
    zP10: q(rs.map(r => r.zones), 0.1), zP50: q(rs.map(r => r.zones), 0.5), zP90: q(rs.map(r => r.zones), 0.9),
    clear1: rs.filter(r => r.zones >= 1).length / rs.length, z1P50: q(z1, 0.5),
    scoreP10: q(rs.map(r => r.score), 0.1), scoreP50: q(rs.map(r => r.score), 0.5), scoreP90: q(rs.map(r => r.score), 0.9),
    ptsPerMin: sum('score') / (sum('survived') / 60),
    firstPtP50: q(rs.map(r => r.firstPt), 0.5), firstPtP90: q(rs.map(r => r.firstPt), 0.9),
    zoneP10: q(zt, 0.1), zoneP50: q(zt, 0.5), zoneP90: q(zt, 0.9), in45_90: zt.length ? zt.filter(v => v >= 45 && v <= 90).length / zt.length : NaN,
    last3P50: q(last3, 0.5), last3P90: q(last3, 0.9), last3Share: mean(zr.map(z => (z.time - z.t3) / z.time)),
    last1P50: q(last1, 0.5), last1P90: q(last1, 0.9), last1Max: Math.max(-1, ...last1),
    last3Mag: q(zr.filter(z => z.mag3).map(z => z.time - z.t3), 0.5), last3NoMag: q(zr.filter(z => !z.mag3).map(z => z.time - z.t3), 0.5),
    magAtLast3: zr.length ? zr.filter(z => z.mag3).length / zr.length : NaN,
    noBrickP50: q(rs.map(r => r.longestNoBrick), 0.5), noBrickMax: Math.max(...rs.map(r => r.longestNoBrick)), gapWallP90: q(rs.map(r => r.maxGapWall), 0.9), gapWallMax: Math.max(...rs.map(r => r.maxGapWall)),
    aboveMax: Math.max(...rs.map(r => r.longestAbove)), ceilRunMax: Math.max(...rs.map(r => r.maxCeilRun)),
    scoreStillMax: Math.max(...rs.map(r => r.maxScoreStill)), nan: sum('nan'),
    gemRate: sum('gemSpawn') ? sum('gems') / sum('gemSpawn') : NaN, magRate: sum('magSpawn') ? sum('magnets') / sum('magSpawn') : NaN,
    sticksPerMin: sum('catches') / (sum('survived') / 60), manualPct: (sum('manualRel') + sum('autoRel')) ? sum('manualRel') / (sum('manualRel') + sum('autoRel')) : NaN,
    lostPerMin: sum('lost') / (sum('survived') / 60), netPerMin: sum('netSaves') / (sum('survived') / 60),
    minHeartsP10: q(rs.map(r => r.minHearts), 0.1), at5Frac: sum('at5') / sum('survived'),
    hitsPerMin: sum('paddleHits') / (sum('survived') / 60),
    byZone: [0, 1, 2, 3].map(z => q(zr.filter(r => r.zone === z && r.level < 4).map(r => r.time), 0.5))
  };
}

// ---------------------------------------------------------------- experiment: does the magnet (aim + release) help the last bricks?
// Replay a seed with the bot until 3 blocks are left (deterministic), then branch: A no magnet, B magnet + the
// bot's aimed release, C magnet + instant release (no aim), D magnet + a child that never aims (kid56).
function lastBricks(WRB, diff, skill, nSeeds) {
  // A bot, no magnet · B bot + one magnet, aimed release · C bot + one magnet, instant release (no aim)
  // D kid56 + one magnet · E kid56, no magnet. Value = s from "3 left" to clear (cap 120); died = game over first.
  const out = {};
  for (const br of ['A', 'B', 'C', 'D', 'E']) out[br] = { t: [], died: 0 };
  for (let s = 1; s <= nSeeds; s++) {
    for (const br of Object.keys(out)) {
      const seed = s * 7919 + 3, w = new WRB.World({ seed, difficulty: diff });
      const bot = new WRB.Bot(w, { skill, seed: seed * 7 + 1 });
      const kid = child(WRB, KID56)(w, seed);
      let t = 0, branched = false, tb = 0;
      while (w.phase !== 'clear' && w.phase !== 'over' && t < 500) {
        if (!branched && w.phase === 'play' && w.bricksLeft() <= 3 && !(w.ball && w.ball.stuck)) {
          branched = true; tb = t; w.magnet.t = 0;
          if (br === 'B' || br === 'C' || br === 'D') w.debugMagnet();
        }
        if (branched && (br === 'D' || br === 'E')) kid(1 / 60); else bot.step(1 / 60);
        if (branched && br === 'C' && w.ball && w.ball.stuck) w.serve();
        w.update(1 / 60); w.drainEvents(); t += 1 / 60;
        if (branched && t - tb > 120) break;
      }
      if (!branched) continue;
      if (w.phase === 'over') out[br].died++; else out[br].t.push(w.phase === 'clear' ? t - tb : 120);
    }
  }
  return out;
}

// ---------------------------------------------------------------- long run: NaN / loops over an hour of play
function longRun(WRB, M) {
  const rows = [];
  for (const [model, diff] of [['bot1.0', 'easy'], ['bot1.0', 'normal'], ['bot1.0', 'hard'], ['bot0.6', 'easy'], ['botSpam0.8', 'easy'], ['kid56', 'easy']]) {
    const r = playOne(WRB, M, model, diff, 4242, 3600);
    rows.push({ model, diff, surv: r.survived, zones: r.zones, score: r.score, nan: r.nan, noBrickMax: r.longestNoBrick, aboveMax: r.longestAbove, ceilRunMax: r.maxCeilRun, stillMax: r.maxScoreStill });
  }
  return rows;
}

// ---------------------------------------------------------------- main
const patch = arg('patch', 'baseline');
const WRB = freshWRB(patch);
const M = models(WRB);
const MODELS = (arg('models', '') || Object.keys(M).join(',')).split(',');
const DIFFS = arg('diffs', 'easy,normal,hard').split(',');
const EXP = arg('exp', 'main');
const t0 = Date.now();
const log = (...a) => { if (!QUIET) console.log(...a); };
const results = [];
if (EXP === 'main' || EXP === 'all') {
  for (const model of MODELS) for (const diff of DIFFS) {
    const rs = []; for (let s = 1; s <= N; s++) rs.push(playOne(WRB, M, model, diff, s * 1009 + 7, CAP));
    results.push({ model, diff, s: summarize(rs) }); process.stderr.write('.');
  }
  process.stderr.write(`\n[${patch}] ${results.length * N} games, ${((Date.now() - t0) / 1000).toFixed(1)} s wall\n`);
  const table = (title, cols) => {
    log('\n### ' + title + ` (${patch}, n=${N}, cap ${CAP} s)\n`);
    log('| model | diff | ' + cols.map(c => c[0]).join(' | ') + ' |');
    log('|---|---|' + cols.map(() => '---:').join('|') + '|');
    for (const r of results) log(`| ${r.model} | ${r.diff} | ` + cols.map(c => c[1](r.s)).join(' | ') + ' |');
  };
  table('Survival and score', [
    ['game over', s => pc(s.overPct)], ['surv p10/p50 s', s => f0(s.survP10) + '/' + f0(s.survP50)],
    ['zones p10/p50/p90', s => `${s.zP10}/${s.zP50}/${s.zP90}`], ['clears Z1', s => pc(s.clear1)], ['Z1 p50 s', s => f0(s.z1P50)],
    ['score p10/p50/p90', s => `${f0(s.scoreP10)}/${f0(s.scoreP50)}/${f0(s.scoreP90)}`], ['pts/min', s => f0(s.ptsPerMin)],
    ['1st point p50/p90 s', s => f1(s.firstPtP50) + '/' + f1(s.firstPtP90)]]);
  table('Zone pacing and stalls', [
    ['zone p10/p50/p90 s', s => `${f0(s.zoneP10)}/${f0(s.zoneP50)}/${f0(s.zoneP90)}`], ['round-1 p50 by zone s', s => s.byZone.map(f0).join('/')], ['in 45–90 s', s => pc(s.in45_90)],
    ['last 3 p50/p90 s', s => f0(s.last3P50) + '/' + f0(s.last3P90)], ['last-3 share', s => pc(s.last3Share)],
    ['last 1 p50/p90/max s', s => `${f0(s.last1P50)}/${f0(s.last1P90)}/${f0(s.last1Max)}`],
    ['no-block p50/max s', s => f1(s.noBrickP50) + '/' + f1(s.noBrickMax)], ['no-block incl. stuck p90/max s', s => f1(s.gapWallP90) + '/' + f1(s.gapWallMax)], ['above-blocks max s', s => f1(s.aboveMax)],
    ['ceil hits in a row max', s => String(s.ceilRunMax)], ['NaN', s => String(s.nan)]]);
  table('Magnet, items, hearts', [
    ['gems caught', s => pc(s.gemRate)], ['bubbles caught', s => pc(s.magRate)], ['sticks/min', s => f1(s.sticksPerMin)],
    ['hand release', s => pc(s.manualPct)], ['magnet on at last 3', s => pc(s.magAtLast3)],
    ['last 3 p50 mag / no mag s', s => f0(s.last3Mag) + ' / ' + f0(s.last3NoMag)],
    ['lost/min', s => f1(s.lostPerMin)], ['net saves/min', s => f1(s.netPerMin)], ['min hearts p10', s => String(s.minHeartsP10)],
    ['time at 5 hearts', s => pc(s.at5Frac)]]);
}
const extra = {};
if (EXP === 'lastbricks' || EXP === 'all') {
  log(`\n### Last-3-blocks branch experiment (${patch}): seconds from "3 left" to clear, cap 120\n`);
  log('| diff | bot skill | A bot, no magnet p50/p90 | B bot + magnet, aimed release | C bot + magnet, instant release | D kid56 + magnet | E kid56, no magnet |');
  log('|---|---:|---:|---:|---:|---:|---:|');
  extra.lastbricks = [];
  for (const diff of DIFFS) for (const skill of [0.4, 0.8]) {
    const o = lastBricks(WRB, diff, skill, Math.min(N, 40));
    extra.lastbricks.push({ diff, skill, o });
    const cell = a => f0(q(a.t, 0.5)) + '/' + f0(q(a.t, 0.9)) + (a.t.some(v => v >= 120) ? ` (${a.t.filter(v => v >= 120).length}×cap)` : '') + (a.died ? ` [${a.died} died]` : '');
    log(`| ${diff} | ${skill} | ${cell(o.A)} | ${cell(o.B)} | ${cell(o.C)} | ${cell(o.D)} | ${cell(o.E)} |`);
  }
}
if (EXP === 'longrun' || EXP === 'all') {
  log(`\n### Long runs (${patch}): one hour of simulated play, seed 4242\n`);
  log('| model | diff | survived s | zones | score | NaN | longest no-block s | above-blocks max s | ceiling hits in a row | longest no-score s |');
  log('|---|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  extra.longrun = longRun(WRB, M);
  for (const r of extra.longrun) log(`| ${r.model} | ${r.diff} | ${f0(r.surv)} | ${r.zones} | ${r.score} | ${r.nan} | ${f1(r.noBrickMax)} | ${f1(r.aboveMax)} | ${r.ceilRunMax} | ${f1(r.stillMax)} |`);
}
const out = arg('out', '');
if (out) fs.writeFileSync(out, JSON.stringify({ patch, results, extra }));
