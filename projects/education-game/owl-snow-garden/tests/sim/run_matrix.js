#!/usr/bin/env node
// Runs the playtest matrix (age × lang × viewport × driver × seeds) on all CPU cores and writes
// compact per-session summaries to tests/sim/out/<name>.json.
//   node tests/sim/run_matrix.js --n 8 --name baseline
//   node tests/sim/run_matrix.js --n 8 --name prop --config '{"growTime":0.8}' --drivers toddler,beside
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Worker, isMainThread, parentPort } = require('worker_threads');

const ALL_DRIVERS = ['bot0.3', 'bot0.6', 'bot0.9', 'bot1', 'toddler', 'typical', 'dropsHigh', 'beside', 'idleKid', 'tapper', 'spammer', 'bruteForce'];

function compact(m) {
  const L = require('./lib');
  const cutsBy = {};
  let early = 0, never = 0;
  for (const c of m.speech.cuts) { const k = c.cut + '<-' + c.by; cutsBy[k] = (cutsBy[k] || 0) + 1; if (c.frac < 0.5) early++; if (c.never) never++; }
  const types = {};
  for (const e of m.speechEvents) types[e.type] = (types[e.type] || 0) + 1;
  return {
    age: m.age, lang: m.lang, vp: m.vp, driver: m.driver, seed: m.seed, done: m.done, endState: m.endState, sessionTime: m.sessionTime, simTime: m.simTime,
    stars: m.stars,
    chapters: m.chapters.map(c => ({ topic: c.topic, dur: c.end !== null ? c.end - c.start : null, stars: c.stars })),
    rounds: m.rounds.map(r => ({ l: r.level, r: r.round, topic: r.topic, dur: r.end !== null ? r.end - r.start : null, fc: r.firstCorrect, ia: r.interactiveAt,
      items: r.items, nests: r.nests, wrong: r.wrong, miss: r.miss, hints: r.hints, idles: r.idles, stars: r.stars })),
    hints: m.hints, idles: m.idles, idleGaps: m.idleGaps, misses: m.misses, wrongs: m.wrongs, corrects: m.corrects, grabs: m.grabs,
    drops: m.drops, nearDrops: m.nearDrops, nearMisses: m.nearMisses, stuck: m.stuck.length, stuckKinds: m.stuck.slice(0, 3), invariant: m.invariant.length,
    errors: m.errors.slice(0, 2), unreachable: m.unreachable, tapHazard: m.tapHazard, itemsSeen: m.itemsSeen, packShrinkMin: m.packShrinkMin, packFail: m.packFail,
    speech: { requests: m.speech.requests, spoken: m.speech.spoken, dropped: m.speech.dropped, cuts: m.speech.cuts.length, early, never, cutsBy },
    speechTypes: types, speechMax1: L.maxRate(m.speechEvents, 1), speechMax3: L.maxRate(m.speechEvents, 3),
    talk: m.talkStates.map(t => t.answered),
    content: m.driver === 'bot1' ? m.content : undefined
  };
}

if (isMainThread) {
  const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
  const variant = get('variant', 'baseline'), V = require('./variants').VARIANTS[variant];
  if (!V) throw new Error('unknown variant ' + variant);
  const n = +get('n', 8), name = get('name', variant), config = Object.assign({}, V.config || {}, JSON.parse(get('config', '{}')));
  const drivers = get('drivers', ALL_DRIVERS.join(',')).split(',');
  const ages = get('ages', '3,4,5,6,7').split(',').map(Number);
  const langs = get('langs', 'en,vi').split(',');
  const vps = get('vps', 'iphoneP,iphoneL,ipadL,ipadP').split(',');
  const jobs = [];
  let seed = +get('seed0', 1000);
  for (const driver of drivers) for (const age of ages) for (const lang of langs) for (const vp of vps) for (let k = 0; k < n; k++) jobs.push({ age, lang, vp, driver, seed: seed++, config, variant, speechPolicy: V.speechPolicy });
  const nw = Math.max(1, Math.min(os.cpus().length, +get('workers', os.cpus().length)));
  const t0 = Date.now(); let res = [], left = nw, next = 0;
  for (let k = 0; k < nw; k++) {             // workers pull jobs one at a time (sessions differ 10× in length)
    const wk = new Worker(__filename);
    const feed = () => { if (next < jobs.length) wk.postMessage(jobs[next++]); else { wk.postMessage(null); } };
    wk.on('message', (r) => { if (r === 'bye') { if (--left === 0) finish(); return; } res.push(r); feed(); });
    wk.on('error', (e) => { console.error(e); process.exit(1); });
    feed();
  }
  function finish() {
    const out = path.join(__dirname, 'out'); fs.mkdirSync(out, { recursive: true });
    res.sort((a, b) => a.seed - b.seed);
    fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify({ name, variant, config, n, sessions: res }));
    console.log(`${res.length} sessions in ${((Date.now() - t0) / 1000).toFixed(1)} s → tests/sim/out/${name}.json`);
  }
} else {
  const L = require('./lib');
  parentPort.on('message', (j) => {
    if (j === null) { parentPort.postMessage('bye'); parentPort.close(); return; }
    const VV = require('./variants'), v = VV.apply(j.variant, L.SG);
    if (v.hooks) j.hooks = VV.HOOKS[v.hooks];
    parentPort.postMessage(compact(L.runSession(j)));
  });
}
module.exports = { ALL_DRIVERS, compact };
