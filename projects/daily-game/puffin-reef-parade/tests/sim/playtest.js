#!/usr/bin/env node
// Dottie's Reef Parade — high-speed playtest harness (QA): pacing, survival, exploits, long-run stability.
//
//   node tests/sim/playtest.js <suite> [N] [maxMin]      suites: pacing | bots | exploits | stability | gold
//   VARIANTS=file.json node tests/sim/playtest.js pacing N   → compares CONFIG override sets {label: {diff: {...}}}
//
// Reuses the player models of players.js (kid, kid-oblivious, casual, spam, circle, orbit, wallhug, edgedart, bot<S>)
// and adds:
//   toddler    age 3–4: 0.6–1.0 s reaction, ±40° aim, never looks at the parade, finger often still for 1.5–3 s,
//              random flip taps every ~10 s, chases the golden star 90 % of the time.
//   neverturn  no input at all (Dottie swims straight and bounces off the coral).
//   flipcircle max-rate circle + flip mashing.
//   cornercamp sits in a corner pointing into it (wall slide + bounces) — can it farm anything or get stuck?
// Writes tests/sim/results/playtest-<suite>[-variants].md (+ .json). Report-only: game/ is never modified.
'use strict';
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const { load } = require('../unit/load');
const { makePlayer, ARENAS } = require('./players');

class Toddler {
  constructor(RP, w, seed) {
    // players.js Kid with toddler parameters: build it via makePlayer('kid') then patch its params
    this.inner = makePlayer(RP, w, 'kid', seed);
    Object.assign(this.inner.p, { delay: [0.6, 1.0], aim: 40, every: [0.3, 0.5], holdEvery: 5, hold: [1.5, 3],
      tailAware: 0, flipOnDanger: 0, randomFlipEvery: 10, goldLove: 0.9 });
  }
  get mode() { return this.inner.mode; }
  step(dt) { this.inner.step(dt); }
}
class NeverTurn { constructor(w) { this.w = w; } step() { this.w.setDir(0, 0); this.w.setTarget(null); } }
class FlipCircle {
  constructor(w) { this.w = w; }
  step() { const s = this.w.hero; this.w.setDir(Math.cos(s.heading + 1.4), Math.sin(s.heading + 1.4)); this.w.action(); }
}
class CornerCamp {
  constructor(w) { this.w = w; }
  step() { const A = this.w.arena; this.w.setDir(0, 0); this.w.setTarget(A.x1 - 2, A.y1 - 2); }
}

function player(RP, w, model, seed) {
  if (model === 'toddler') return new Toddler(RP, w, seed);
  if (model === 'neverturn') return new NeverTurn(w);
  if (model === 'flipcircle') return new FlipCircle(w);
  if (model === 'cornercamp') return new CornerCamp(w);
  return makePlayer(RP, w, model, seed);
}

function runGame(job) {
  const RP = load(['rng.js', 'world.js', 'bot.js']);
  const cfg = Object.assign({}, RP.DIFFICULTY[job.diff], job.over || {});
  const w = new RP.World({ seed: job.seed, config: cfg });
  const AR = ARENAS[job.arena || 'land'];
  w.setArena(AR.a[0], AR.a[1], AR.a[2], AR.a[3], AR.avoid);
  const pl = player(RP, w, job.model, job.seed);
  const dt = job.dt || 1 / 60, maxT = job.maxMin * 60;
  let t = 0, playT = 0, firstPt = null, maxTrail = 0, bad = 0, goldSpawnAt = null, lvGolds = 0, lvGoldStars = 0;
  const lapT = [], goldLat = [], goldShare = [], hearts = [];
  let goldCorner = 0, goldOutT = 0;
  while (w.state !== 'dead' && t < maxT && !(job.stopAfter !== undefined && w.levelsCleared >= job.stopAfter)) {
    pl.step(dt); w.update(dt); t += dt;
    if (w.state === 'playing') playT += dt;
    if (w.trail.length > maxTrail) maxTrail = w.trail.length;
    const s = w.hero;
    if (!isFinite(s.x) || !isFinite(s.y) || !isFinite(w.score) || !isFinite(s.heading)) bad++;
    const g = w.notes.find(n => n._g && n.state === 'flee');
    if (g) {
      goldOutT += dt;
      const A = w.arena, m = 70;
      if ((g.x < A.x0 + m || g.x > A.x1 - m) && (g.y < A.y0 + m || g.y > A.y1 - m)) goldCorner += dt;
    }
    for (const e of w.drainEvents()) {
      if (e.type === 'note' && firstPt === null && !e.regrab) firstPt = w.levelTime;
      if (e.type === 'goldspawn') goldSpawnAt = w.time;
      if (e.type === 'gold') { if (goldSpawnAt !== null) goldLat.push(w.time - goldSpawnAt); lvGolds++; }
      if (e.type === 'note' && !e.regrab) lvGoldStars += e.gold ? 5 : 1;
      if (e.type === 'cleared') {
        lapT[e.level] = w.levelTime; hearts[e.level] = w.hearts;
        goldShare[e.level] = lvGolds;
        lvGolds = 0; lvGoldStars = 0;
      }
    }
  }
  return { t: playT, score: w.score, cleared: w.levelsCleared, dead: w.state === 'dead', level: w.level,
    bonks: w.bonks, flips: w.flips, golds: w.golds, goldMissed: w.goldMissed, firstPt, lapT, goldLat, goldShare,
    maxTrail, bad, pathLen: w._pathLen, goldCorner, goldOutT, regrabs: w.regrabs };
}

/* ------------------------------ suites ------------------------------ */
const P = (a, p) => { a = a.filter(v => v !== undefined && v !== null && isFinite(v)).sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : NaN; };
const f = (v, d) => (isFinite(v) ? v.toFixed(d === undefined ? 0 : d) : '–');
const d3 = a => `${f(P(a, 0.1))} / ${f(P(a, 0.5))} / ${f(P(a, 0.9))}`;

function jobsFor(suite, N, maxMin, variants) {
  const J = [];
  const add = (model, diff, arena, extra) => {
    for (const label in variants) {
      if (label !== 'current' && !(diff in (variants[label] || {}))) continue;     // a variant only re-runs the diffs it changes
      const over = (variants[label] || {})[diff] || {};
      for (let k = 0; k < N; k++) J.push(Object.assign({ model, diff, arena, label, over, seed: (+process.env.SEED0 || 3000) + k * 7919, maxMin }, extra || {}));
    }
  };
  if (suite === 'pacing') {
    // lap 1 + lap 2 (8 levels) per game
    for (const m of ['toddler', 'kid-oblivious', 'kid', 'casual']) add(m, 'easy', 'land', { stopAfter: 8 });
    for (const m of ['kid-oblivious', 'kid', 'casual']) add(m, 'normal', 'land', { stopAfter: 8 });
    add('casual', 'hard', 'land', { stopAfter: 8 });
    add('kid', 'easy', 'port', { stopAfter: 4 }); add('kid', 'normal', 'ipad', { stopAfter: 4 });
  } else if (suite === 'bots') {
    for (const diff of ['easy', 'normal', 'hard']) for (const sk of [0.3, 0.5, 0.7, 1]) add('bot' + sk, diff, 'land');
  } else if (suite === 'exploits') {
    for (const diff of ['easy', 'normal', 'hard'])
      for (const m of ['neverturn', 'circle', 'flipcircle', 'orbit', 'wallhug', 'edgedart', 'cornercamp', 'spam']) add(m, diff, 'land');
    for (const m of ['wallhug', 'edgedart', 'cornercamp']) add(m, 'normal', 'ipad');
  } else if (suite === 'gold') {
    for (const arena of ['land', 'ipad', 'port', 'wide']) for (const m of ['bot1', 'casual', 'kid']) add(m, 'normal', arena, { stopAfter: 8 });
    for (const arena of ['ipad', 'port']) add('toddler', 'easy', arena, { stopAfter: 8 });
  } else if (suite === 'stability') {
    for (const diff of ['easy', 'normal', 'hard']) add('bot1', diff, 'land');
    add('bot1', 'normal', 'land', { dt: 16 / 60 });     // one 60 fps frame at ?speed=16
  }
  return J;
}

function summarize(rs) {
  const mins = rs.reduce((a, r) => a + r.t / 60, 0), sum = k => rs.reduce((a, r) => a + r[k], 0);
  return {
    N: rs.length, dead: rs.filter(r => r.dead).length, surv: rs.map(r => r.t / 60), score: rs.map(r => r.score),
    cleared: rs.map(r => r.cleared), firstPt: rs.map(r => r.firstPt),
    lap: [0, 1, 2, 3, 4, 5, 6, 7].map(z => rs.map(r => r.lapT[z])),
    lapN: [0, 1, 2, 3, 4, 5, 6, 7].map(z => rs.filter(r => r.lapT[z] !== undefined).length),
    bpm: sum('bonks') / Math.max(1e-9, mins), fpm: sum('flips') / Math.max(1e-9, mins), golds: sum('golds'), goldMissed: sum('goldMissed'),
    goldLat: rs.flatMap(r => r.goldLat), goldInS1: rs.filter(r => r.goldShare[0] > 0).length,
    goldCorner: sum('goldCorner'), goldOutT: sum('goldOutT'),
    maxTrail: Math.max(...rs.map(r => r.maxTrail)), bad: sum('bad'), pathLen: Math.max(...rs.map(r => r.pathLen)),
    maxScore: Math.max(...rs.map(r => r.score)), maxLevel: Math.max(...rs.map(r => r.level)), regrabs: sum('regrabs')
  };
}

function report(suite, N, maxMin, jobs, out, wall, vname) {
  const G = new Map();
  jobs.forEach((j, i) => { const k = [j.label, j.model, j.diff, j.arena].join('|'); if (!G.has(k)) G.set(k, []); G.get(k).push(out[i]); });
  const S = {}; for (const [k, rs] of G) S[k] = summarize(rs);
  let md = `# Playtest — suite \`${suite}\`${vname ? ' (variants ' + vname + ')' : ''}, ${N} rounds per cell, cap ${maxMin} min of play\n\n`;
  if (suite === 'pacing' || suite === 'gold') {
    md += '| Variant | Model | Diff | Arena | Died | First star s (p50/p90) | Clear S1/S2/S3/S4 | s per season lap 1 (median) | S1 s p10/p50/p90 | s per season lap 2 (median) | Gold in S1 | Bonks/min | Gold caught | Gold catch s (p50/p90) | Score (med) |\n|' + '---|'.repeat(15) + '\n';
    for (const [k, s] of Object.entries(S)) {
      md += `| ${k.split('|').join(' | ')} | ${s.dead}/${s.N} | ${f(P(s.firstPt, 0.5), 1)} / ${f(P(s.firstPt, 0.9), 1)} | ${s.lapN.slice(0, 4).map(n => f(100 * n / s.N) + '%').join(' / ')} | ` +
        `${s.lap.slice(0, 4).map(a => f(P(a, 0.5))).join(' / ')} | ${d3(s.lap[0])} | ${s.lap.slice(4).map(a => f(P(a, 0.5))).join(' / ')} | ${f(100 * s.goldInS1 / s.N)}% | ${f(s.bpm, 2)} | ` +
        `${f(100 * s.golds / Math.max(1, s.golds + s.goldMissed))}% of ${s.golds + s.goldMissed} | ${f(P(s.goldLat, 0.5), 1)} / ${f(P(s.goldLat, 0.9), 1)} | ${f(P(s.score, 0.5))} |\n`;
    }
    if (suite === 'gold') {
      md += '\n| Variant | Model | Diff | Arena | Gold time in a corner (share of time out) |\n|---|---|---|---|---|\n';
      for (const [k, s] of Object.entries(S)) md += `| ${k.split('|').join(' | ')} | ${f(100 * s.goldCorner / Math.max(1e-9, s.goldOutT), 1)}% |\n`;
    }
  } else {
    md += '| Variant | Model | Diff | Arena | Died ≤ cap | Survival min p10/p50/p90 | Levels p10/p50/p90 | Max level | Bonks/min | Flips/min | Gold caught | Score p10/p50/p90 | Max score | Max parade | NaN steps | Path pts |\n|' + '---|'.repeat(16) + '\n';
    for (const [k, s] of Object.entries(S)) {
      md += `| ${k.split('|').join(' | ')} | ${s.dead}/${s.N} | ${d3(s.surv)} | ${d3(s.cleared)} | ${s.maxLevel} | ${f(s.bpm, 2)} | ${f(s.fpm, 1)} | ` +
        `${f(100 * s.golds / Math.max(1, s.golds + s.goldMissed))}% of ${s.golds + s.goldMissed} | ${d3(s.score)} | ${s.maxScore} | ${s.maxTrail} | ${s.bad} | ${s.pathLen} |\n`;
    }
  }
  md += `\n(${jobs.length} games, ${(wall / 1000).toFixed(0)} s wall time)\n`;
  const dir = path.join(__dirname, 'results');
  fs.mkdirSync(dir, { recursive: true });
  const base = `playtest-${suite}${vname ? '-' + vname : ''}`;
  fs.writeFileSync(path.join(dir, base + '.md'), md);
  fs.writeFileSync(path.join(dir, base + '.json'), JSON.stringify(Object.fromEntries(Object.entries(S).map(([k, s]) => [k, {
    N: s.N, dead: s.dead, lapMed: s.lap.map(a => P(a, 0.5)), lapN: s.lapN, firstPt: P(s.firstPt, 0.5), bpm: s.bpm, score: P(s.score, 0.5) }]))));
  console.log(md);
}

if (process.argv[2] === '--worker') {
  process.on('message', (m) => { if (m === 'exit') process.exit(0); process.send({ i: m.i, r: runGame(m.job) }); });
} else {
  const suite = process.argv[2] || 'pacing', N = +process.argv[3] || 30, maxMin = +process.argv[4] || 12;
  const vfile = process.env.VARIANTS;
  const variants = vfile ? JSON.parse(fs.readFileSync(vfile, 'utf8')) : { current: {} };
  const jobs = jobsFor(suite, N, maxMin, variants), out = new Array(jobs.length), t0 = Date.now();
  let next = 0, done = 0;
  const nW = Math.max(1, Math.min(require('os').cpus().length, 4));
  for (let k = 0; k < nW; k++) {
    const ch = fork(__filename, ['--worker']);
    const feed = () => { if (next < jobs.length) { ch.send({ i: next, job: jobs[next] }); next++; } else ch.send('exit'); };
    ch.on('message', (m) => {
      out[m.i] = m.r;
      if (++done % 100 === 0) process.stderr.write(`${done}/${jobs.length}\n`);
      if (done === jobs.length) report(suite, N, maxMin, jobs, out, Date.now() - t0, vfile ? path.basename(vfile, '.json') : '');
      feed();
    });
    feed();
  }
}
module.exports = { runGame };
