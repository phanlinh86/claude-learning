#!/usr/bin/env node
// Tibo's Dino Lake Fishing — HIGH-SPEED headless session playtest with child models (report-only; never edits game/js).
//   node tests/sim/hs_playtest.js [--n 40] [--ages 3,4,5,6,7] [--models typical,slow3,bot1,bot0.6,bot0.2] [--config '{…}']
// Every session runs at full speed through the real input API (1/30 s frames), over iPhone / iPad portrait + landscape (lib.js
// VIEWPORTS), en / vi alternating. Prints per model × age: session minutes (median / p90 / max), chapter seconds (median
// [p10–p90]), round seconds, misses / round, hints / round, % rounds with a hint, stars 3/2/1 %, stuck rounds (> 120 s), NaN, swimming fish off screen (frames).
// Targets (DESIGN / skill): a toddler chapter ≈ 60–100 s, a session ≤ 8 min, 0 stuck rounds, 0 NaN. Exit 1 when one is missed.
'use strict';
const S = require('./lib');

const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const N = +get('n', 40), config = JSON.parse(get('config', '{}'));
const MODELS = get('models', 'typical,slow3,bot1,bot0.6,bot0.2').split(','), AGES = get('ages', '3,4,5,6,7').split(',').map(Number);
const VPS = Object.keys(S.VIEWPORTS);
const t0 = Date.now();
let bad = 0;
const rows = [];
for (const model of MODELS) for (const age of AGES) {
  if (model === 'slow3' && age > 4) continue;   // the slow-toddler model is for ages 3–4
  const ss = [];
  for (let i = 0; i < N; i++) ss.push(S.runSession({ model, age, seed: 1000 * age + i * 7 + 1, vp: VPS[i % VPS.length], lang: i % 2 ? 'vi' : 'en', config }));
  const mins = ss.map(s => s.min), ch = [].concat(...ss.map(s => s.chapters)), rd = [].concat(...ss.map(s => s.rounds));
  const st = [3, 2, 1].map(k => 100 * rd.filter(r => r.stars === k).length / Math.max(1, rd.length));
  const row = { model, age, n: ss.length, done: ss.filter(s => s.done).length, minMed: S.pct(mins, 0.5), minP90: S.pct(mins, 0.9), minMax: Math.max(...mins),
    chMed: S.pct(ch, 0.5), chP10: S.pct(ch, 0.1), chP90: S.pct(ch, 0.9), rdMed: S.pct(rd.map(r => r.s), 0.5), rdP90: S.pct(rd.map(r => r.s), 0.9),
    miss: S.mean(rd.map(r => r.misses)), hints: S.mean(rd.map(r => r.hint)), hintPct: 100 * rd.filter(r => r.hint > 0).length / Math.max(1, rd.length),
    stars: st, stuck: ss.reduce((a, s) => a + s.stuck, 0), nan: ss.filter(s => s.nan).length, off: ss.reduce((a, s) => a + s.off, 0),
    rounds: S.mean(ss.map(s => s.rounds.length)), talkAuto: S.mean(ss.map(s => s.talkAuto)) };
  rows.push(row);
  const toddler = age <= 4 && (model === 'typical' || model === 'slow3');
  if (row.done < row.n || row.stuck || row.nan || row.off || row.minP90 > 8 || (toddler && (row.chMed < 55 || row.chMed > 100))) { bad++; row.flag = '  <-- check'; }
}
console.log('| model | age | sessions done | session min median (p90, max) | chapter s median [p10–p90] | round s median (p90) | rounds | misses / round | hints / round (% rounds) | stars 3/2/1 % | stuck | NaN | off-screen |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) console.log('| ' + [r.model, r.age, r.done + '/' + r.n, S.f1(r.minMed) + ' (' + S.f1(r.minP90) + ', ' + S.f1(r.minMax) + ')', S.f1(r.chMed) + ' [' + S.f1(r.chP10) + '–' + S.f1(r.chP90) + ']',
  S.f1(r.rdMed) + ' (' + S.f1(r.rdP90) + ')', S.f1(r.rounds), r.miss.toFixed(2), r.hints.toFixed(2) + ' (' + r.hintPct.toFixed(0) + ' %)', r.stars.map(x => x.toFixed(0)).join(' / '), r.stuck, r.nan, r.off].join(' | ') + ' |' + (r.flag || ''));
console.log('\n' + (bad ? bad + ' row(s) miss a target' : 'all targets met') + ' — ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s');
process.exit(bad ? 1 : 0);
