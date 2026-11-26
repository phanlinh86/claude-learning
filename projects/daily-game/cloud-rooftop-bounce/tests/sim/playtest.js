#!/usr/bin/env node
// Wisp's Rooftop Bounce — high-speed headless playtest.
//   node tests/sim/playtest.js [--n 40] [--cap 600] [--models a,b] [--diffs easy,normal] [--out file.json] [--runs]
// Runs every player model × difficulty × n seeds for up to `cap` simulated seconds each and prints the tables.
// Starts with the quick report: zone-clear rates of the shipped bot at skills 0.3 / 0.6 / 0.9 per difficulty.
'use strict';
const fs = require('fs');
const { load } = require('../unit/load');
const { models } = require('./players');

function arg(name, def) { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : def; }
const N = +arg('n', 40), CAP = +arg('cap', 600);
const WRB = load();
const ALL = models(WRB);
const MODELS = (arg('models', '') || Object.keys(ALL).join(',')).split(',');
const DIFFS = (arg('diffs', 'easy,normal,hard')).split(',');

function playOne(model, diff, seed) {
  const w = new WRB.World({ seed, difficulty: diff });
  const step = ALL[model](w, seed);
  const dt = 1 / 60;
  let t = 0, firstBrick = null, longestNoBrick = 0, playT = 0, noBrick = 0, magnetT = 0;
  let above = 0, longestAbove = 0, at5 = 0, heartsMaxed = false, z1 = null;
  let gainsGems = 0, gainsZone = 0, autoRel = 0, manualRel = 0, gemSpawn = 0, magSpawn = 0;
  while (w.phase !== 'over' && t < CAP) {
    step(dt); w.update(dt); t += dt;
    if (w.phase === 'play') {
      playT += dt;
      if (!(w.ball && w.ball.stuck)) noBrick += dt;
      // the pearl is "above the blocks" when its bottom is over the top of the highest live block
      let top = -1; for (const k of w.bricks) if (k.alive && k.y + k.h / 2 > top) top = k.y + k.h / 2;
      if (w.ball && top > 0 && w.ball.y - w.ball.r > top) { above += dt; if (above > longestAbove) longestAbove = above; } else above = 0;
    } else above = 0;
    if (w.magnet.t > 0) magnetT += dt;
    if (w.hearts >= 5) at5 += dt;
    for (const e of w.drainEvents()) {
      if (e.type === 'brick') { if (firstBrick === null) firstBrick = t; if (noBrick > longestNoBrick) longestNoBrick = noBrick; noBrick = 0; }
      else if (e.type === 'ballLost' || e.type === 'levelClear') noBrick = 0;
      else if (e.type === 'gemSpawn') gemSpawn++;
      else if (e.type === 'magnetSpawn') magSpawn++;
      else if (e.type === 'release') { if (e.auto) autoRel++; else manualRel++; }
      else if (e.type === 'heartGain') { if (e.why === 'gems') gainsGems++; else gainsZone++; if (e.hearts >= 5) heartsMaxed = true; }
      if (e.type === 'levelClear' && z1 === null) z1 = t;
    }
    if (noBrick > longestNoBrick) longestNoBrick = noBrick;
  }
  const st = w.stats;
  return {
    model, diff, seed, survived: t, over: w.phase === 'over', zones: w.level, score: w.score,
    firstBrick, z1, longestNoBrick, longestAbove, zoneTimes: st.zoneTimes, gemSpawn, gems: st.gems, gemsMissed: st.gemsMissed,
    magSpawn, magnets: st.magnets, magnetsMissed: st.magnetsMissed, catches: st.catches, autoRel, manualRel, magnetT,
    lost: st.lost, gainsGems, gainsZone, at5, heartsMaxed, netSaves: st.netSaves, maxCombo: st.maxCombo,
    finalHearts: w.hearts, playT
  };
}

// ---------- stats helpers ----------
const q = (a, p) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const f0 = v => Number.isFinite(v) ? v.toFixed(0) : '-';
const f1 = v => Number.isFinite(v) ? v.toFixed(1) : '-';
const pc = v => Number.isFinite(v) ? (100 * v).toFixed(0) + '%' : '-';

function summarize(rs) {
  const sum = k => rs.reduce((a, r) => a + r[k], 0);
  const zones = rs.map(r => r.zones), surv = rs.map(r => r.survived), sc = rs.map(r => r.score);
  const zt = [].concat(...rs.map(r => r.zoneTimes));
  const fb = rs.map(r => r.firstBrick).filter(v => v !== null);
  return {
    n: rs.length,
    survP50: q(surv, 0.5), survP10: q(surv, 0.1), alivePct: rs.filter(r => !r.over).length / rs.length,
    zP10: q(zones, 0.1), zP50: q(zones, 0.5), zP90: q(zones, 0.9), zMax: Math.max(...zones),
    clear1: rs.filter(r => r.zones >= 1).length / rs.length, clear4: rs.filter(r => r.zones >= 4).length / rs.length,
    z1P50: q(rs.map(r => r.z1).filter(v => v !== null), 0.5),
    scoreP10: q(sc, 0.1), scoreP50: q(sc, 0.5), scoreP90: q(sc, 0.9),
    firstBrickP50: q(fb, 0.5), firstBrickP90: q(fb, 0.9),
    zoneP50: q(zt, 0.5), zoneP10: q(zt, 0.1), zoneP90: q(zt, 0.9), zoneIn45_90: zt.length ? zt.filter(v => v >= 45 && v <= 90).length / zt.length : NaN,
    noBrickP50: q(rs.map(r => r.longestNoBrick), 0.5), noBrickMax: Math.max(...rs.map(r => r.longestNoBrick)),
    aboveMax: Math.max(...rs.map(r => r.longestAbove)), aboveP50: q(rs.map(r => r.longestAbove), 0.5),
    gemRate: sum('gemSpawn') ? sum('gems') / sum('gemSpawn') : NaN, magRate: sum('magSpawn') ? sum('magnets') / sum('magSpawn') : NaN,
    magnetFrac: sum('magnetT') / sum('survived'), sticksPerMin: sum('catches') / (sum('playT') / 60),
    manualPct: (sum('manualRel') + sum('autoRel')) ? sum('manualRel') / (sum('manualRel') + sum('autoRel')) : NaN,
    lostPerMin: sum('lost') / (sum('survived') / 60), gainPerMin: (sum('gainsGems') + sum('gainsZone')) / (sum('survived') / 60),
    at5Frac: sum('at5') / sum('survived'), maxedPct: rs.filter(r => r.heartsMaxed).length / rs.length
  };
}

const t0 = Date.now();

// ---------- quick report: zone-clear rates of the shipped bot ----------
console.log(`\n## Quick report: WRB.Bot zone-clear rates (n=${N} seeds, cap ${CAP} s)\n`);
console.log('| diff | skill | clears zone 1 | clears all 4 | zones p10/p50/p90 | zone time p50 s | alive@cap |');
console.log('|---|---:|---:|---:|---|---:|---:|');
const quick = {};
for (const diff of DIFFS) for (const skill of [0.3, 0.6, 0.9]) {
  const key = 'bot' + skill.toFixed(1), rs = [];
  for (let s = 1; s <= N; s++) rs.push(playOne(key, diff, s * 1009 + 7));
  const S = summarize(rs); quick[diff + key] = { s: S, runs: rs };
  console.log(`| ${diff} | ${skill} | ${pc(S.clear1)} | ${pc(S.clear4)} | ${S.zP10}/${S.zP50}/${S.zP90} | ${f0(S.zoneP50)} | ${pc(S.alivePct)} |`);
}

const results = [];
for (const model of MODELS) for (const diff of DIFFS) {
  let rs;
  if (quick[diff + model]) rs = quick[diff + model].runs;
  else { rs = []; for (let s = 1; s <= N; s++) rs.push(playOne(model, diff, s * 1009 + 7)); }
  results.push({ model, diff, s: summarize(rs), runs: rs });
  process.stderr.write('.');
}
process.stderr.write(`\n${results.length * N} games, ${((Date.now() - t0) / 1000).toFixed(1)} s wall, cap=${CAP}s\n`);

function table(title, cols) {
  console.log('\n### ' + title + '\n');
  console.log('| model | diff | ' + cols.map(c => c[0]).join(' | ') + ' |');
  console.log('|---|---|' + cols.map(() => '---:').join('|') + '|');
  for (const r of results) console.log(`| ${r.model} | ${r.diff} | ` + cols.map(c => c[1](r.s)).join(' | ') + ' |');
}
console.log(`\n## All models (n=${N} seeds per cell, cap ${CAP} s)`);
table('Survival, zones, score', [
  ['surv p10/p50 s', s => f0(s.survP10) + ' / ' + f0(s.survP50)], ['alive@cap', s => pc(s.alivePct)],
  ['zones p10/p50/p90 (max)', s => `${s.zP10}/${s.zP50}/${s.zP90} (${s.zMax})`],
  ['clears Z1', s => pc(s.clear1)], ['Z1 time p50', s => f0(s.z1P50)],
  ['score p10/p50/p90', s => `${f0(s.scoreP10)}/${f0(s.scoreP50)}/${f0(s.scoreP90)}`]]);
table('Pacing and stalls', [
  ['1st block p50/p90 s', s => f1(s.firstBrickP50) + ' / ' + f1(s.firstBrickP90)],
  ['zone p10/p50/p90 s', s => `${f0(s.zoneP10)}/${f0(s.zoneP50)}/${f0(s.zoneP90)}`], ['in 45–90 s', s => pc(s.zoneIn45_90)],
  ['longest no-block p50 / max s', s => f1(s.noBrickP50) + ' / ' + f1(s.noBrickMax)],
  ['longest above-blocks p50 / max s', s => f1(s.aboveP50) + ' / ' + f1(s.aboveMax)]]);
table('Items, magnet and hearts', [
  ['gems caught', s => pc(s.gemRate)], ['magnets caught', s => pc(s.magRate)], ['magnet on', s => pc(s.magnetFrac)],
  ['sticks/min', s => f1(s.sticksPerMin)], ['released by hand', s => pc(s.manualPct)],
  ['hearts lost/min', s => f1(s.lostPerMin)], ['hearts gained/min', s => f1(s.gainPerMin)],
  ['time at 5 hearts', s => pc(s.at5Frac)], ['ever 5 hearts', s => pc(s.maxedPct)]]);

const out = arg('out', '');
if (out) fs.writeFileSync(out, JSON.stringify(results.map(r => Object.assign({ model: r.model, diff: r.diff, s: r.s }, process.argv.includes('--runs') ? { runs: r.runs } : {})), null, 0));
