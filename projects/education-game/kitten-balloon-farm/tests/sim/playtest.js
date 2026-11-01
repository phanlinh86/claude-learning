#!/usr/bin/env node
// High-speed playtest (report-only): thousands of headless sessions per age × driver, plus an absent child.
//   node tests/sim/playtest.js                     → default matrix (≈ 2 200 sessions), writes tests/sim/out/pt_base.{json,md}
//   node tests/sim/playtest.js --n 4 --name quick --config '{"roundDoneTime":2}'
// Drivers: bot0.3 bot0.6 bot0.9 bot1 (KB.Bot skills), typical (per-age child), toddler, slow3 (slow 3-year-old),
// tapper (random taps), spammer (hammers the screen). Targets (REQUIREMENT / skill): typical 4-year-old chapter
// 60–100 s, every session ≤ 8 min for typical children, no stuck round, no NaN, every home on screen.
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./lib');
const { runJobs, matrixJobs, ALL_DRIVERS } = require('./run_matrix');
const { agg, report } = require('./summarize');

const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const name = 'pt_' + get('name', 'base'), config = JSON.parse(get('config', '{}'));
// n per (driver × age × lang × viewport): 9 drivers × 5 ages × 2 langs × 4 viewports × 6 = 2 160 sessions
const o = { n: +get('n', 6), config, drivers: get('drivers', ALL_DRIVERS.join(',')).split(','), ages: get('ages', '3,4,5,6,7').split(',').map(Number),
  langs: ['en', 'vi'], vps: ['iphoneP', 'iphoneL', 'ipadL', 'ipadP'], seed0: +get('seed0', 5000) };

function absent() {
  // nobody at the screen: one round for 5 minutes (idle nudges back off to 30 s) and one Talk time for 2 minutes
  const w = new L.KB.World({ seed: 9, age: 3, lang: 'en', config: Object.assign({ strings: false }, config) }); w.setViewport(960, 720, {});
  w.newSession(); const idles = [];
  while (w.state !== 'round' || !w.interactive) w.update(1 / 30);
  const t0 = w.time;
  while (w.time - t0 < 300) { w.update(1 / 30); for (const e of w.drainEvents()) if (e.type === 'idle') idles.push(+(w.time - t0).toFixed(1)); }
  w._startTalk(); w.drainEvents(); const asks = [];
  const t1 = w.time; while (w.time - t1 < 120) { w.update(1 / 30); for (const e of w.drainEvents()) if (e.type === 'talkAsk') asks.push(e.n); }
  return { idles, idleCount5min: idles.length, talkAsks2min: asks.length, glowAt: w.talk.glowAnswer };
}

(async () => {
  const t0 = Date.now(), jobs = matrixJobs(o);
  const sessions = await runJobs(jobs, +get('workers', 0));
  const D = { name, config, n: o.n, sessions };
  const out = path.join(__dirname, 'out'); fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify(D));
  let md = report(D);
  const ab = absent();
  md += `\n### Absent child\n\nidle nudges in 5 min: ${ab.idleCount5min} at ${ab.idles.join(', ')} s · Talk re-asks in 2 min: ${ab.talkAsks2min} (answer glows: ${ab.glowAt})\n`;
  // verdicts against the targets
  const typ4 = agg(sessions.filter(s => s.driver === 'typical' && s.age === 4));
  const kids = agg(sessions.filter(s => ['typical', 'toddler', 'slow3'].includes(s.driver)));
  const all = agg(sessions);
  const typAll = sessions.filter(s => s.driver === 'typical' && s.done);
  const v = [
    ['typical 4-year-old chapter mean in 60–100 s', typ4.chap >= 60 && typ4.chap <= 100, typ4.chap.toFixed(1) + ' s'],
    ['typical child sessions ≤ 8 min (max, all ages)', Math.max(...typAll.map(s => s.sessionTime)) <= 480, Math.max(...typAll.map(s => s.sessionTime)).toFixed(0) + ' s'],
    ['child models (typical/toddler/slow3) session p90 ≤ 8 min', kids.sesP90 <= 480, kids.sesP90.toFixed(0) + ' s'],
    ['every session finished', all.done === all.n, all.done + '/' + all.n],
    ['no stuck round / NaN / error', !all.stuck && !all.invariant && !all.errors, `${all.stuck}/${all.invariant}/${all.errors}`],
    ['every balloon home on screen', !all.offscreen, all.offscreen + '/' + all.homes]
  ];
  md += '\n### Verdict\n\n' + v.map(([k, ok, val]) => `- ${ok ? 'PASS' : 'FAIL'} ${k}: ${val}`).join('\n') + '\n';
  md += `\n_${sessions.length} sessions, ${((Date.now() - t0) / 1000).toFixed(0)} s wall_\n`;
  fs.writeFileSync(path.join(out, name + '.md'), md);
  console.log(md);
  process.exit(v.every(x => x[1]) ? 0 : 1);
})();
