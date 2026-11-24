#!/usr/bin/env node
// Quick CONFIG tuning: runs the child models (+ bots) with a candidate config and prints chapter / session numbers per age.
//   node tests/sim/tune.js --n 4 --config '{"pairsByAge":{"4":[2,2,3,3]}}' [--drivers typical,careful4] [--ages 3,4]
'use strict';
const { runJobs, matrixJobs } = require('./run_matrix');
const { agg } = require('./summarize');
const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const o = { n: +get('n', 4), config: JSON.parse(get('config', '{}')), drivers: get('drivers', 'typical,careful4,toddler,slow3,bot0.6').split(','),
  ages: get('ages', '3,4,5,6,7').split(',').map(Number), langs: ['en', 'vi'], vps: ['iphoneP', 'iphoneL', 'ipadL', 'ipadP'], seed0: +get('seed0', 7000) };
runJobs(matrixJobs(o), 0).then((S) => {
  console.log('driver age | chapter mean p10–p90 | session mean p90 max | round | mm/round | hint rounds | stars% | cut | slow');
  for (const d of o.drivers) for (const a of o.ages) {
    const g = agg(S.filter(s => s.driver === d && s.age === a));
    console.log(`${d} ${a} | ${g.chap.toFixed(0)} ${g.chapP10.toFixed(0)}–${g.chapP90.toFixed(0)} | ${g.ses.toFixed(0)} ${g.sesP90.toFixed(0)} ${g.sesMax.toFixed(0)} | ${g.round.toFixed(1)} | ${g.wrongPerRound.toFixed(1)} | ${(100 * g.hintRounds).toFixed(0)}% | ${(100 * g.starPct).toFixed(0)}% | ${(100 * g.cut).toFixed(0)}% | ${g.slow}`);
  }
});
