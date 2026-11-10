#!/usr/bin/env node
// Mochi's Fairy Bounce — high-speed headless playtest.
//   node tests/sim/playtest.js [--patch none|proposed] [--n 40] [--cap 600] [--models a,b] [--diffs easy,normal] [--out file.json]
// Runs every player model × difficulty × n seeds for up to `cap` simulated seconds each and prints the tables.
'use strict';
const path = require('path');
const fs = require('fs');
const { load } = require('../unit/load');
const { apply } = require('./patch');
const { models } = require('./players');

function arg(name, def) { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; }
const PATCH = arg('patch', 'none'), N = +arg('n', 40), CAP = +arg('cap', 600);
const MFB = load();
apply(MFB, PATCH);
const C = MFB.World.CONFIG;
const ALL = models(MFB);
const MODELS = (arg('models', '') || Object.keys(ALL).join(',')).split(',');
const DIFFS = (arg('diffs', 'easy,normal,hard')).split(',');

function playOne(model, diff, seed) {
  const w = new MFB.World({ seed, difficulty: diff });
  const step = ALL[model](w, seed);
  const dt = 1 / 60;
  let t = 0, firstBrick = null, lastBrick = 0, longestNoBrick = 0, playT = 0, noBrick = 0;
  let above = 0, longestAbove = 0, thrown = 0, spawned = 0, at5 = 0, heartsMaxed = false, s1 = null;
  let gainsStars = 0, gainsSeason = 0, gainsLostAtMax = 0, stuckFlag = false;
  const heartsSamples = [];
  while (w.phase !== 'over' && t < CAP) {
    step(dt); w.update(dt); t += dt;
    if (w.phase === 'play') {
      playT += dt; noBrick += dt;
      // the ball is "above the bricks" when its bottom is over the top of the highest live block
      let top = -1; for (const k of w.bricks) if (k.alive && k.y + k.h / 2 > top) top = k.y + k.h / 2;
      if (w.ball && top > 0 && w.ball.y - w.ball.r > top) { above += dt; if (above > longestAbove) longestAbove = above; } else above = 0;
    } else above = 0;
    if (w.hearts >= 5) at5 += dt;
    for (const e of w.drainEvents()) {
      if (e.type === 'brick') { if (firstBrick === null) firstBrick = t; if (noBrick > longestNoBrick) longestNoBrick = noBrick; noBrick = 0; }
      else if (e.type === 'ballLost' || e.type === 'levelClear') noBrick = 0;
      else if (e.type === 'bossThrow') thrown++;
      else if (e.type === 'starSpawn') spawned++;
      else if (e.type === 'heartGain') { if (e.why === 'stars') gainsStars++; else gainsSeason++; if (e.hearts >= 5) heartsMaxed = true; }
      if (e.type === 'levelClear' && s1 === null) s1 = t;
    }
    if (noBrick > longestNoBrick) longestNoBrick = noBrick;
  }
  const st = w.stats;
  return {
    model, diff, seed, survived: t, over: w.phase === 'over', seasons: w.level, score: w.score,
    firstBrick, s1, longestNoBrick, longestAbove, seasonTimes: st.seasonTimes, thrown, pillowHits: st.pillowHits,
    pillowsPopped: st.pillowsPopped, spawned, stars: st.stars, starsMissed: st.starsMissed, lost: st.lost,
    gainsStars, gainsSeason, at5, heartsMaxed, bossHits: st.bossHits, netSaves: st.netSaves, maxCombo: st.maxCombo,
    finalHearts: w.hearts, playT
  };
}

// ---------- stats helpers ----------
const q = (a, p) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
const f0 = v => Number.isFinite(v) ? v.toFixed(0) : '-';
const f1 = v => Number.isFinite(v) ? v.toFixed(1) : '-';
const pc = v => Number.isFinite(v) ? (100 * v).toFixed(0) + '%' : '-';

function summarize(rs) {
  const sum = k => rs.reduce((a, r) => a + r[k], 0);
  const seasons = rs.map(r => r.seasons), surv = rs.map(r => r.survived), sc = rs.map(r => r.score);
  const st = [].concat(...rs.map(r => r.seasonTimes));
  const fb = rs.map(r => r.firstBrick).filter(v => v !== null);
  return {
    n: rs.length,
    survP50: q(surv, 0.5), survP10: q(surv, 0.1), alivePct: rs.filter(r => !r.over).length / rs.length,
    seaP10: q(seasons, 0.1), seaP50: q(seasons, 0.5), seaP90: q(seasons, 0.9), seaMax: Math.max(...seasons),
    clear1: rs.filter(r => r.seasons >= 1).length / rs.length,
    s1P50: q(rs.map(r => r.s1).filter(v => v !== null), 0.5),
    scoreP10: q(sc, 0.1), scoreP50: q(sc, 0.5), scoreP90: q(sc, 0.9),
    firstBrickP50: q(fb, 0.5), firstBrickP90: q(fb, 0.9),
    seasonP50: q(st, 0.5), seasonP10: q(st, 0.1), seasonP90: q(st, 0.9), seasonIn45_90: st.length ? st.filter(v => v >= 45 && v <= 90).length / st.length : NaN,
    noBrickP50: q(rs.map(r => r.longestNoBrick), 0.5), noBrickMax: Math.max(...rs.map(r => r.longestNoBrick)),
    aboveMax: Math.max(...rs.map(r => r.longestAbove)), aboveP50: q(rs.map(r => r.longestAbove), 0.5),
    pillowHitRate: sum('thrown') ? sum('pillowHits') / sum('thrown') : NaN, popRate: sum('thrown') ? sum('pillowsPopped') / sum('thrown') : NaN,
    starRate: sum('spawned') ? sum('stars') / sum('spawned') : NaN,
    lostPerMin: sum('lost') / (sum('survived') / 60), gainPerMin: (sum('gainsStars') + sum('gainsSeason')) / (sum('survived') / 60),
    at5Frac: sum('at5') / sum('survived'), maxedPct: rs.filter(r => r.heartsMaxed).length / rs.length,
    bossPerMin: sum('bossHits') / (sum('playT') / 60)
  };
}

const t0 = Date.now();
const results = [];
for (const model of MODELS) for (const diff of DIFFS) {
  const rs = [];
  for (let s = 1; s <= N; s++) rs.push(playOne(model, diff, s * 1009 + 7));
  results.push({ model, diff, s: summarize(rs), runs: rs });
  process.stderr.write('.');
}
process.stderr.write(`\n${results.length * N} games, ${((Date.now() - t0) / 1000).toFixed(1)} s wall, patch=${PATCH}, cap=${CAP}s\n`);

function table(title, cols) {
  console.log('\n### ' + title + '\n');
  console.log('| model | diff | ' + cols.map(c => c[0]).join(' | ') + ' |');
  console.log('|---|---|' + cols.map(() => '---:').join('|') + '|');
  for (const r of results) console.log(`| ${r.model} | ${r.diff} | ` + cols.map(c => c[1](r.s)).join(' | ') + ' |');
}
console.log(`\n## patch: ${PATCH} (n=${N} seeds per cell, cap ${CAP} s)`);
table('Survival, seasons, score', [
  ['surv p10/p50 s', s => f0(s.survP10) + ' / ' + f0(s.survP50)], ['alive@cap', s => pc(s.alivePct)],
  ['seasons p10/p50/p90 (max)', s => `${s.seaP10}/${s.seaP50}/${s.seaP90} (${s.seaMax})`],
  ['clears S1', s => pc(s.clear1)], ['S1 time p50', s => f0(s.s1P50)],
  ['score p10/p50/p90', s => `${f0(s.scoreP10)}/${f0(s.scoreP50)}/${f0(s.scoreP90)}`]]);
table('Pacing and stalls', [
  ['1st block p50/p90 s', s => f1(s.firstBrickP50) + ' / ' + f1(s.firstBrickP90)],
  ['season p10/p50/p90 s', s => `${f0(s.seasonP10)}/${f0(s.seasonP50)}/${f0(s.seasonP90)}`], ['in 45–90 s', s => pc(s.seasonIn45_90)],
  ['longest no-block p50 / max s', s => f1(s.noBrickP50) + ' / ' + f1(s.noBrickMax)],
  ['longest above-blocks p50 / max s', s => f1(s.aboveP50) + ' / ' + f1(s.aboveMax)]]);
table('Items and hearts', [
  ['pillow hit', s => pc(s.pillowHitRate)], ['pillow popped', s => pc(s.popRate)], ['stars caught', s => pc(s.starRate)],
  ['Hoot hits/min', s => f1(s.bossPerMin)],
  ['hearts lost/min', s => f1(s.lostPerMin)], ['hearts gained/min', s => f1(s.gainPerMin)],
  ['time at 5 hearts', s => pc(s.at5Frac)], ['ever 5 hearts', s => pc(s.maxedPct)]]);

const out = arg('out', '');
if (out) fs.writeFileSync(out, JSON.stringify(results.map(r => Object.assign({ model: r.model, diff: r.diff, s: r.s }, process.argv.includes("--runs") ? { runs: r.runs } : {})), null, 0));
