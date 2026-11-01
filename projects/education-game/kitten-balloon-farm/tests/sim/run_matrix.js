#!/usr/bin/env node
// Runs the playtest matrix (driver × age × lang × viewport × n seeds) on all CPU cores and writes compact
// per-session summaries to tests/sim/out/<name>.json.
//   node tests/sim/run_matrix.js --n 8 --name baseline
//   node tests/sim/run_matrix.js --n 8 --name prop --config '{"roundDoneTime":2}' --drivers typical,slow3 --ages 3,4
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Worker, isMainThread, parentPort } = require('worker_threads');

const ALL_DRIVERS = ['bot0.3', 'bot0.6', 'bot0.9', 'bot1', 'typical', 'toddler', 'slow3', 'tapper', 'spammer'];

function compact(m) {
  return {
    age: m.age, lang: m.lang, vp: m.vp, driver: m.driver, seed: m.seed, done: m.done, endState: m.endState,
    sessionTime: m.sessionTime, simTime: m.simTime, stars: m.stars,
    chapters: m.chapters.map(c => ({ topic: c.topic, dur: c.end !== null ? c.end - c.start : null, stars: c.stars, rounds: c.rounds })),
    rounds: m.rounds.map(r => ({ l: r.level, r: r.round, topic: r.topic, dur: r.end !== null ? r.end - r.start : null, ia: r.interactiveAt,
      n: r.balloons, wrong: r.wrong, hints: r.hints, idles: r.idles, stars: r.stars })),
    hints: m.hints, idles: m.idles, idleGaps: m.idleGaps, wrongs: m.wrongs, corrects: m.corrects, talkAsks: m.talkAsks,
    stuck: m.stuck.length, stuckKinds: m.stuck.slice(0, 3), invariant: m.invariant.length, errors: m.errors.slice(0, 2),
    offscreen: m.offscreen, homesSeen: m.homesSeen, packShrinkMin: m.packShrinkMin, packFail: m.packFail,
    content: m.content.length ? m.content : undefined
  };
}

/** Runs jobs on worker threads; resolves with the compact results sorted by seed. */
function runJobs(jobs, nWorkers) {
  return new Promise((resolve, reject) => {
    const nw = Math.max(1, Math.min(os.cpus().length, nWorkers || os.cpus().length, jobs.length));
    const res = []; let left = nw, next = 0;
    for (let k = 0; k < nw; k++) {             // workers pull jobs one at a time (sessions differ 10× in length)
      const wk = new Worker(__filename);
      const feed = () => { if (next < jobs.length) wk.postMessage(jobs[next++]); else wk.postMessage(null); };
      wk.on('message', (r) => { if (r === 'bye') { if (--left === 0) resolve(res.sort((a, b) => a.seed - b.seed)); return; } res.push(r); feed(); });
      wk.on('error', reject);
      feed();
    }
  });
}

function matrixJobs(o) {
  const jobs = []; let seed = o.seed0 || 1000;
  for (const driver of o.drivers) for (const age of o.ages) for (const lang of o.langs) for (const vp of o.vps)
    for (let k = 0; k < o.n; k++) jobs.push({ age, lang, vp, driver, seed: seed++, config: o.config || {}, keepContent: driver === 'bot1' });
  return jobs;
}

if (isMainThread && require.main === module) {
  const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
  const o = { n: +get('n', 8), config: JSON.parse(get('config', '{}')), drivers: get('drivers', ALL_DRIVERS.join(',')).split(','),
    ages: get('ages', '3,4,5,6,7').split(',').map(Number), langs: get('langs', 'en,vi').split(','),
    vps: get('vps', 'iphoneP,iphoneL,ipadL,ipadP').split(','), seed0: +get('seed0', 1000) };
  const name = get('name', 'baseline'), jobs = matrixJobs(o), t0 = Date.now();
  runJobs(jobs, +get('workers', 0)).then((res) => {
    const out = path.join(__dirname, 'out'); fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify({ name, config: o.config, n: o.n, sessions: res }));
    console.log(`${res.length} sessions in ${((Date.now() - t0) / 1000).toFixed(1)} s → tests/sim/out/${name}.json`);
  });
} else if (!isMainThread) {
  const L = require('./lib');
  parentPort.on('message', (j) => {
    if (j === null) { parentPort.postMessage('bye'); parentPort.close(); return; }
    parentPort.postMessage(compact(L.runSession(j)));
  });
}
module.exports = { ALL_DRIVERS, compact, runJobs, matrixJobs };
