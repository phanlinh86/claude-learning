#!/usr/bin/env node
// Family Flappy — headless high-speed play-test runner.
//   node tests/sim/run.js [--variant baseline] [--rounds 150] [--cap 300] [--jobs 2] [--players a,b,...] [--presets easy,normal,hard]
// Writes tests/sim/results/<variant>.json (per-round data + summaries) and prints tables.
'use strict';
const path = require('path');
const fs = require('fs');
const { fork } = require('child_process');
const lib = require('./lib');
const variants = require('./variants');

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith('--')) { const k = a.slice(2); const v = process.argv[i + 1]; if (v && !v.startsWith('--')) { args[k] = v; i++; } else args[k] = true; }
}
const variantName = args.variant || 'baseline';
const ROUNDS = parseInt(args.rounds || '150', 10);
const CAP = parseFloat(args.cap || '300');
const JOBS = parseInt(args.jobs || '2', 10);
const PLAYERS = (args.players || 'bot:0.2,bot:0.4,bot:0.6,bot:0.8,bot:1,kid:young,kid,adult,spam:3,spam:5,spam:8,hugger,hoverspam').split(',');
const PRESETS = (args.presets || 'easy,normal,hard').split(',');
const OUT = path.join(__dirname, 'results');

function jobsList() {
  const list = [];
  for (const preset of PRESETS) for (const player of PLAYERS) list.push({ preset, player });
  return list;
}

function runJob(job) {
  const FF = lib.load();
  const v = variants[variantName];
  if (!v) throw new Error('unknown variant ' + variantName);
  if (v.globalPatch) v.globalPatch(FF);
  const diff = lib.extractDifficultyOverrides(FF);
  const config = Object.assign({ pointsPerSeason: 10 }, v.config ? v.config(job.preset, FF) : {}, diff(job.preset),
    v.configAfter ? v.configAfter(job.preset, FF) : {});
  const rounds = [];
  // fewer rounds for players that survive the cap (they are expensive and low-variance)
  const n = /^(bot:1|bot:0.8|spam|hugger|hoverspam)/.test(job.player) ? Math.max(20, Math.round(ROUNDS / 3)) : ROUNDS;
  for (let i = 0; i < n; i++) {
    rounds.push(lib.playRound({ FF, config, player: job.player, preset: job.preset, seed: 1000 + i * 17, cap: CAP, patch: v.patch }));
  }
  return { preset: job.preset, player: job.player, summary: lib.summarize(rounds), rounds };
}

if (args.shard !== undefined) {
  const [k, n] = args.shard.split('/').map(Number);
  const mine = jobsList().filter((_, i) => i % n === k);
  const res = mine.map(runJob);
  process.send(res, () => process.exit(0));
} else {
  const t0 = Date.now();
  const children = [];
  for (let k = 0; k < JOBS; k++) {
    children.push(new Promise((resolve, reject) => {
      const ch = fork(__filename, process.argv.slice(2).concat(['--shard', k + '/' + JOBS]));
      ch.on('message', resolve);
      ch.on('error', reject);
    }));
  }
  Promise.all(children).then(parts => {
    const all = [].concat(...parts);
    const order = jobsList().map(j => j.preset + '|' + j.player);
    all.sort((a, b) => order.indexOf(a.preset + '|' + a.player) - order.indexOf(b.preset + '|' + b.player));
    fs.mkdirSync(OUT, { recursive: true });
    const totalRounds = all.reduce((a, r) => a + r.rounds.length, 0);
    const simTime = all.reduce((a, r) => a + r.rounds.reduce((x, y) => x + y.playTime, 0), 0);
    const doc = { variant: variantName, cap: CAP, totalRounds, simHours: +(simTime / 3600).toFixed(2),
      wallSeconds: (Date.now() - t0) / 1000, results: all.map(r => ({ preset: r.preset, player: r.player, summary: r.summary })) };
    fs.writeFileSync(path.join(OUT, variantName + '.json'), JSON.stringify(doc, null, 1));
    fs.writeFileSync(path.join(OUT, variantName + '.rounds.json'), JSON.stringify(all.map(r => ({ preset: r.preset, player: r.player, rounds: r.rounds }))));
    printTable(doc);
  }).catch(e => { console.error(e); process.exit(1); });
}

function f(v, d) { return v === null || v === undefined ? '-' : (typeof v === 'number' ? v.toFixed(d === undefined ? 1 : d) : String(v)); }
function printTable(doc) {
  console.log(`variant=${doc.variant} rounds=${doc.totalRounds} simulated=${doc.simHours} h of play in ${doc.wallSeconds.toFixed(0)} s wall`);
  console.log('preset  player      n  cap%  tMed  tP10  scMed scP90  ppm  acc%  drop/m combo% szn≥1% szn≥3% 1stPt  noPt% s0len sLen empty% opp% imposs% ceil/m causes');
  for (const r of doc.results) {
    const s = r.summary;
    console.log([r.preset.padEnd(7), r.player.padEnd(10), String(s.n).padStart(3), f(s.survivedCapPct, 0).padStart(4),
      f(s.timeMed).padStart(5), f(s.timeP10).padStart(5), f(s.scoreMed, 0).padStart(5), f(s.scoreP90, 0).padStart(5), f(s.ppm).padStart(5),
      f(100 * s.accuracy).padStart(5), f(s.dropsPerMin, 0).padStart(6), f(100 * s.comboShare, 0).padStart(6),
      f(s.reachSummerPct, 0).padStart(6), f(s.reachWinterPct, 0).padStart(6), f(s.firstPointMed).padStart(5), f(s.noPointPct, 0).padStart(5),
      f(s.firstSeasonLenMed, 0).padStart(5), f(s.seasonLenMed, 0).padStart(4), f(100 * s.emptyFrac).padStart(6), f(100 * s.oppFrac).padStart(5),
      f(100 * s.impossibleFrac).padStart(7), f(s.ceilingPerMin).padStart(6), JSON.stringify(s.causes)].join(' '));
  }
}
