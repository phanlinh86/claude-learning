#!/usr/bin/env node
// Momo's Toy Train — determinism: (1) same seed + same child model + same frame dt → identical event stream (all ages, models);
// (2) inputs recorded at 1/30 s frames and replayed at 1/120 s and 1/60 s frames → identical event stream (an input lands on
//     the same fixed sub-step, so the world must not depend on how dt is split).
//   node tests/sim/determinism.js        (exit 1 on any difference)
'use strict';
const crypto = require('crypto');
const L = require('./lib');

function hashEvents(evs) {
  const h = crypto.createHash('sha1');
  for (const e of evs) h.update(JSON.stringify(e, (k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)));
  return h.digest('hex').slice(0, 12);
}
/** Plays a session with a model; records every input call with the world time it happened at. */
function record(age, model, seed, vp) {
  const w = L.mkWorld({ age, seed, vp, lang: seed % 2 ? 'vi' : 'en' }), d = L.makeModel(model, w, age, seed + 1), log = [], evs = [];
  for (const k of ['pointerDown', 'pointerMove', 'pointerUp', 'talkAnswer']) {
    const f = w[k].bind(w);
    w[k] = (...a) => { log.push({ t: w.time, k, a }); return f(...a); };
  }
  w.newSession();
  for (let t = 0; t < 1800 && w.state !== 'sessionDone'; t += 1 / 30) { d.step(1 / 30); w.update(1 / 30); for (const e of w.drainEvents()) { evs.push(e); if (d.onEvent) d.onEvent(e); } }
  return { log, hash: hashEvents(evs), state: w.state, end: w.time };
}
/** Replays the recorded inputs at another frame dt (frames are cut so every input lands at its recorded world time). */
function replay(age, seed, vp, log, dt, end) {
  const w = L.mkWorld({ age, seed, vp, lang: seed % 2 ? 'vi' : 'en' }), evs = [];
  w.newSession();
  let i = 0;
  const h = w.cfg.step;
  while (w.time < end - 1e-9) {
    while (i < log.length && log[i].t <= w.time + 1e-9) { const c = log[i++]; w[c.k](...c.a); }
    const next = i < log.length ? log[i].t : end, step = Math.min(dt, Math.max(h, Math.round((next - w.time) / h) * h));
    w.update(step + 1e-12);
    for (const e of w.drainEvents()) evs.push(e);
  }
  while (i < log.length) { const c = log[i++]; w[c.k](...c.a); }
  for (const e of w.drainEvents()) evs.push(e);
  return hashEvents(evs);
}

let bad = 0, n = 0;
const VPS = Object.keys(L.VIEWPORTS);
for (const age of [3, 4, 5, 6, 7]) for (const model of ['typical', 'slow3', 'spammer', 'tapper', 'bot0.8']) {
  const seed = 300 + age * 11 + model.length, vp = VPS[(age + model.length) % VPS.length];
  const a = record(age, model, seed, vp), b = record(age, model, seed, vp);
  n++;
  if (a.hash !== b.hash) { bad++; console.log(`✗ age ${age} ${model}: two runs differ ${a.hash} ${b.hash}`); continue; }
  if (model === 'typical' || model === 'spammer' || model === 'tapper') {
    const r120 = replay(age, seed, vp, a.log, 1 / 120, a.end), r60 = replay(age, seed, vp, a.log, 1 / 60, a.end);
    if (r120 !== a.hash || r60 !== a.hash) { bad++; console.log(`✗ age ${age} ${model}: replay differs 30:${a.hash} 120:${r120} 60:${r60}`); continue; }
  }
  console.log(`✓ age ${age} ${model} ${a.state} ${a.hash} (${a.log.length} inputs)`);
}
console.log(bad ? `\n${bad}/${n} FAILED` : `\nall ${n} deterministic`);
process.exit(bad ? 1 : 0);
