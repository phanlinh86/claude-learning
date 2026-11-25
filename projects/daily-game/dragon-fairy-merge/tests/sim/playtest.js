#!/usr/bin/env node
// Mossy's Egg Grove — quick headless playtest: N games × skills × difficulties with MEG.Bot (report only).
//   node tests/sim/playtest.js [--n=8] [--pace=2] [--skills=1,0.8,0.5] [--diffs=easy,normal,hard] [--max=900] [--kid]
// --pace = least seconds between drops (2 ≈ a human; 0 = the bot's own tempo ≈ 1.5 s)
// --kid  = also the "6-year-old dropping almost randomly on Easy" check (skill 0.15, drops until the first warning)
'use strict';
const { load } = require('../unit/load');
const MEG = load(['rng.js', 'world.js', 'bot.js']);

const arg = (k, d) => { const a = process.argv.find(s => s.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const N = +arg('n', 8), PACE = +arg('pace', 2), MAX = +arg('max', 900);
const SKILLS = arg('skills', '1,0.8,0.5').split(',').map(Number);
const DIFFS = arg('diffs', 'easy,normal,hard').split(',');
const H = 1 / 60;
const out = s => process.stdout.write(s + '\n');
const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN;
const med = a => { if (!a.length) return NaN; const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1]; };
const f = (v, d) => isNaN(v) ? '—' : v.toFixed(d || 0);
const ZN = ['spring', 'summer', 'autumn', 'winter', 'winter+'];

function play(diff, skill, seed, pace, maxT) {
  const w = new MEG.World({ seed, difficulty: diff });
  const bot = new MEG.Bot(w, { skill, seed: seed * 31 + 7, pace });
  const lv = [0];                // time each season started
  let firstWarn = null, firstRescue = null, bad = 0;
  while (w.phase === 'play' && w.time < maxT) {
    bot.step(H); w.update(H);
    for (const e of w.drainEvents()) {
      if (e.type === 'levelUp') lv.push(w.time);
      else if (e.type === 'warnOn' && firstWarn === null) firstWarn = w.drops;
      else if (e.type === 'rescue' && firstRescue === null) firstRescue = w.drops;
    }
    for (const e of w.eggs) if (!(e.x >= e.r - 1e-6 && e.x <= 9 + 1e-6 - e.r && e.y >= e.r - 1e-6) || e.x !== e.x) bad++;
  }
  const seasons = []; for (let i = 1; i < lv.length; i++) seasons.push(lv[i] - lv[i - 1]);
  return { t: w.time, drops: w.drops, score: w.score, level: w.level, maxKind: w.maxKind, seasons, firstWarn, firstRescue,
    over: w.phase === 'over', bad, hatches: w.stats.hatches, combo: w.stats.maxCombo };
}

const t0 = Date.now();
out(`Mossy's Egg Grove playtest — ${N} games per row, pace ${PACE} s/drop (bot think 0.35–0.8 s + Mossy travel), cap ${MAX} s`);
out('| diff | skill | drops | score | season reached (S/Su/A/W) | s per season: spring / summer / autumn | game length s | max kind | hatches | 1st warn @drop | bad |');
out('|---|---|---|---|---|---|---|---|---|---|---|');
for (const diff of DIFFS) for (const skill of SKILLS) {
  const rs = []; for (let s = 1; s <= N; s++) rs.push(play(diff, skill, 1000 + s, PACE, MAX));
  const reach = [0, 1, 2, 3].map(z => rs.filter(r => r.level >= z).length);
  const per = [0, 1, 2].map(i => med(rs.filter(r => r.seasons.length > i).map(r => r.seasons[i])));
  out(`| ${diff} | ${skill} | ${f(mean(rs.map(r => r.drops)))} | ${f(mean(rs.map(r => r.score)))} | ${reach.join('/')} of ${N} | ${per.map(v => f(v)).join(' / ')} | ` +
    `${f(mean(rs.map(r => r.t)))} (${rs.filter(r => !r.over).length} capped) | ${f(mean(rs.map(r => r.maxKind)), 1)} | ${f(mean(rs.map(r => r.hatches)), 1)} | ` +
    `${f(med(rs.map(r => r.firstWarn === null ? r.drops : r.firstWarn)))} | ${rs.reduce((s, r) => s + r.bad, 0)} |`);
}
if (process.argv.includes('--kid')) {
  const rs = []; for (let s = 1; s <= N * 2; s++) rs.push(play('easy', 0.15, 2000 + s, PACE, MAX));
  const fw = rs.map(r => r.firstWarn === null ? r.drops : r.firstWarn);
  out(`\nKid check (Easy, skill 0.15, ${rs.length} games): drops before the first vine warning: min ${Math.min(...fw)}, median ${med(fw)}; ` +
    `total drops per game: median ${med(rs.map(r => r.drops))}, min ${Math.min(...rs.map(r => r.drops))}; season reached median ${ZN[med(rs.map(r => r.level))]}.`);
}
out(`\n(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
