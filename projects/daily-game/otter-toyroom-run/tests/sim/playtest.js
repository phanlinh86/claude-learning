// Otto's Playroom Dash — high-speed playtest: thousands of headless rounds with bots and human-like player models.
//   node tests/sim/playtest.js [--seeds N] [--maxT S] [--patch tests/sim/patches/x.json] [--out name] [--jobs 2]
// Writes tests/sim/results/<name>.json (aggregates + every hit with seed/time/position) and prints a summary.
// A patch is a JSON object deep-merged into a *copy* of OD.World.CONFIG (each load() gets its own vm, so
// game/js/world.js is never touched).
'use strict';
const path = require('path');
const fs = require('fs');
const { fork } = require('child_process');
const { load } = require('../unit/load');
const { makePlayer } = require('./players');

function deepMerge(dst, src) {
  if (Array.isArray(src) && Array.isArray(dst)) {          // arrays merge element-wise (e.g. zones: [{gapK: 1.5}])
    src.forEach((v, i) => { if (v && typeof v === 'object' && dst[i] && typeof dst[i] === 'object') deepMerge(dst[i], v); else if (v !== null) dst[i] = v; });
    return dst;
  }
  for (const k of Object.keys(src)) {
    if (src[k] && typeof src[k] === 'object' && dst[k] && typeof dst[k] === 'object') deepMerge(dst[k], src[k]);
    else dst[k] = src[k];
  }
  return dst;
}
const cache = {};
function loadPatched(patch) {
  const key = JSON.stringify(patch || {});
  if (!cache[key]) { const OD = load(); if (patch) deepMerge(OD.World.CONFIG, patch); cache[key] = OD; }
  return cache[key];
}

/** play one round; returns a compact record */
function playRound(job, patch) {
  const OD = loadPatched(patch);
  const { model, skill, diff, seed, maxT } = job;
  const w = new OD.World({ seed, difficulty: diff });
  const pl = makePlayer(model, w, OD, seed, { skill });
  const dt = 1 / 60;
  let t = 0, chStart = 0, chJumps = 0, chAcorns = 0;
  const rec = { model, skill, diff, seed, chapters: [], hits: [], firstAcornT: null, firstHitT: null };
  const zeroHits = () => ({ tower: 0, blocks: 0, ball: 0 });
  let chHits = zeroHits();
  while (w.phase === 'play' && t < maxT) {
    pl.step(dt); w.update(dt); t += dt;
    for (const e of w.drainEvents()) {
      switch (e.type) {
        case 'acorn': chAcorns++; if (rec.firstAcornT === null) rec.firstAcornT = +t.toFixed(2); break;
        case 'jump': chJumps++; break;
        case 'bump':
          if (rec.firstHitT === null) rec.firstHitT = +t.toFixed(2);
          chHits[e.kind]++;
          rec.hits.push({ t: +t.toFixed(2), kind: e.kind, level: w.level, lane: w.hero.lane, heroX: +w.hero.x.toFixed(2),
            heroY: +w.hero.y.toFixed(2), objX: +e.o.x.toFixed(2), objY: +e.o.y.toFixed(2), dist: +w.dist.toFixed(1), gk: +w.gk.toFixed(3) });
          break;
        case 'levelUp':
          rec.chapters.push({ t: +(t - chStart).toFixed(2), hits: chHits, jumps: chJumps, acorns: chAcorns, zone: (e.zone + 3) % 4 });
          chStart = t; chHits = zeroHits(); chJumps = 0; chAcorns = 0; break;
      }
    }
  }
  rec.partial = { t: +(t - chStart).toFixed(2), hits: chHits, jumps: chJumps, acorns: chAcorns, zone: w.zone };
  rec.survival = +t.toFixed(2); rec.over = w.phase === 'over';
  rec.score = w.score; rec.acorns = w.acorns; rec.reached = w.level + 1;
  rec.jumps = w.stats.jumps; rec.lanes = w.stats.lanes; rec.maxAir = +w.stats.maxAir.toFixed(3); rec.maxApex = +w.stats.maxApex.toFixed(3);
  return rec;
}

// ---------------------------------------------------------------- aggregation
const q = (a, p) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); const i = (s.length - 1) * p, lo = Math.floor(i); return +(s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo)).toFixed(2); };
const mean = a => a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(3) : null;
const pct = (a, b) => b ? +(100 * a / b).toFixed(1) : null;

function aggregate(recs, maxT) {
  const n = recs.length;
  const surv = recs.map(r => r.survival), score = recs.map(r => r.score);
  const out = { n, maxT, survived: recs.filter(r => !r.over).length,
    survival: { p10: q(surv, 0.1), p50: q(surv, 0.5), p90: q(surv, 0.9) },
    score: { p10: q(score, 0.1), p50: q(score, 0.5), p90: q(score, 0.9) },
    reached: {}, firstAcorn: null, firstHit: null, chapters: [], maxAir: q(recs.map(r => r.maxAir), 0.9), maxApex: q(recs.map(r => r.maxApex), 0.9) };
  for (const k of [2, 3, 4, 5]) out.reached['ch' + k] = pct(recs.filter(r => r.reached >= k).length, n);
  const fs_ = recs.map(r => r.firstAcornT).filter(x => x !== null), fh = recs.map(r => r.firstHitT).filter(x => x !== null);
  out.firstAcorn = { p50: q(fs_, 0.5), never: pct(n - fs_.length, n) };
  out.firstHit = { p10: q(fh, 0.1), p50: q(fh, 0.5), p90: q(fh, 0.9), never: pct(n - fh.length, n) };
  for (let i = 0; i < 6; i++) {
    const done = recs.filter(r => r.chapters.length > i).map(r => r.chapters[i]);
    const entered = recs.filter(r => r.reached > i);
    const all = entered.map(r => r.chapters[i] || r.partial);
    const hk = {}; let tot = 0;
    for (const k of ['tower', 'blocks', 'ball']) { hk[k] = mean(all.map(c => c.hits[k])); tot += hk[k] || 0; }
    out.chapters.push({ ch: i + 1, entered: entered.length, completed: done.length,
      dur: { p10: q(done.map(c => c.t), 0.1), p50: q(done.map(c => c.t), 0.5), p90: q(done.map(c => c.t), 0.9) },
      hitsPerEntered: hk, hitsTotal: +tot.toFixed(3), jumps: mean(done.map(c => c.jumps)), acorns: mean(done.map(c => c.acorns)),
      deaths: pct(entered.filter(r => r.over && r.reached === i + 1).length, entered.length) });
  }
  const cause = { tower: 0, blocks: 0, ball: 0 }; recs.forEach(r => r.hits.forEach(h => cause[h.kind]++));
  out.hitsByCause = cause;
  return out;
}

// ---------------------------------------------------------------- jobs
function buildJobs(seeds, maxT) {
  const jobs = [];
  for (const diff of ['easy', 'normal', 'hard']) {
    for (const skill of [0.3, 0.5, 0.7, 0.9, 1.0]) for (let s = 1; s <= seeds; s++) jobs.push({ group: `bot${skill}`, model: 'bot', skill, diff, seed: s, maxT });
    for (const m of ['kid', 'kid5', 'adult', 'jumpSpam', 'zigzag', 'zigJump', 'idleMid', 'idleSide', 'botAlwaysJump', 'botNeverJump'])
      for (let s = 1; s <= seeds; s++) jobs.push({ group: m, model: m, diff, seed: s, maxT, skill: 0.9 });
  }
  return jobs;
}

function main() {
  const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
  const seeds = +arg('seeds', 60), maxT = +arg('maxT', 480), jobsN = +arg('jobs', 2);
  const patchFile = arg('patch', null), name = arg('out', 'baseline');
  const patch = patchFile ? JSON.parse(fs.readFileSync(patchFile, 'utf8')) : null;
  const jobs = buildJobs(seeds, maxT);
  const t0 = Date.now(), recs = new Array(jobs.length);
  let done = 0, workers = 0;
  const finish = () => {
    const groups = {};
    recs.forEach(r => { const g = `${r.diff}/${r.group}`; (groups[g] = groups[g] || []).push(r); });
    const agg = {}; for (const g of Object.keys(groups)) agg[g] = aggregate(groups[g], maxT);
    const hits = recs.filter(r => r.model === 'bot' && r.skill === 1).flatMap(r => r.hits.map(h => Object.assign({ diff: r.diff, seed: r.seed }, h)));
    const res = { name, patch, seeds, maxT, runs: recs.length, secs: (Date.now() - t0) / 1000, agg, skill1Hits: hits,
      kidEasy: groups['easy/kid'].map(r => ({ seed: r.seed, reached: r.reached, survival: r.survival, hits: r.hits.map(h => `${h.t}s ${h.kind} ch${h.level + 1}`) })) };
    const dir = path.join(__dirname, 'results'); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name + '.json'), JSON.stringify(res, null, 1));
    printSummary(res);
  };
  for (let k = 0; k < jobsN; k++) {
    const idx = []; for (let i = k; i < jobs.length; i += jobsN) idx.push(i);
    const c = fork(__filename, ['--worker'], { stdio: 'inherit' }); workers++;
    c.on('message', m => { m.forEach(([i, r]) => { r.group = jobs[i].group; recs[i] = r; done++; }); c.kill(); if (--workers === 0) finish(); });
    c.send({ patch, jobs: idx.map(i => [i, jobs[i]]) });
  }
}

function printSummary(res) {
  console.log(`# ${res.name}: ${res.runs} runs in ${res.secs.toFixed(1)} s (cap ${res.maxT} s)`);
  console.log('group                 | surv p10/p50/p90       | score p50 | ch2%  ch3%  ch5% | 1st hit p50 | ch1 dur | ch1 hits | ch2 hits | ch3 hits | ch4 hits | hits tower/blocks/ball');
  for (const g of Object.keys(res.agg)) {
    const a = res.agg[g], c = a.chapters;
    console.log(`${g.padEnd(21)} | ${[a.survival.p10, a.survival.p50, a.survival.p90].join('/').padEnd(22)} | ${String(a.score.p50).padEnd(9)} | ${String(a.reached.ch2).padEnd(5)} ${String(a.reached.ch3).padEnd(5)} ${String(a.reached.ch5).padEnd(5)}| ${String(a.firstHit.p50).padEnd(11)} | ${String(c[0].dur.p50).padEnd(7)} | ${String(c[0].hitsTotal).padEnd(8)} | ${String(c[1].hitsTotal).padEnd(8)} | ${String(c[2].hitsTotal).padEnd(8)} | ${String(c[3].hitsTotal).padEnd(8)} | ${a.hitsByCause.tower}/${a.hitsByCause.blocks}/${a.hitsByCause.ball}`);
  }
  console.log('skill-1 bot hits:', res.skill1Hits.length);
}

if (process.argv.includes('--worker')) {
  process.on('message', ({ patch, jobs }) => { process.send(jobs.map(([i, j]) => [i, playRound(j, patch)])); });
} else if (require.main === module) main();

module.exports = { playRound, aggregate, loadPatched, deepMerge };
