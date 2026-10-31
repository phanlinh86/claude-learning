#!/usr/bin/env node
// Determinism: (1) same seed + same driver + same frame dt → identical event stream;
// (2) inputs recorded at 1/30 s frames and replayed at 1/120 s (and 1/60 s) frames → identical event stream
//     (inputs land on the same fixed sub-step, so the world must not depend on how dt is split).
'use strict';
const crypto = require('crypto');
const L = require('./lib');
const SG = L.SG;

function hashEvents(evs) {
  const h = crypto.createHash('sha1');
  for (const e of evs) h.update(JSON.stringify(e, (k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)));
  return h.digest('hex').slice(0, 12);
}

function record(age, lang, vpName, seed, driver) {
  const vp = L.VIEWPORTS[vpName];
  const w = new SG.World({ seed, age, lang }); w.setViewport(vp.W, vp.H, vp.ins);
  const inputs = [], evs = [];
  for (const fn of ['pointerDown', 'pointerMove', 'pointerUp', 'talkAnswer', 'cancelDrag']) {
    const orig = w[fn].bind(w);
    w[fn] = function (...a) { inputs.push({ step: Math.round(w.time / w.cfg.step), fn, a }); return orig(...a); };
  }
  const d = L.makeDriver(driver, w, age, seed + 1);
  w.newSession(); evs.push(...w.drainEvents());
  let t = 0;
  while (w.state !== 'sessionDone' && t < 1500) { d.step(1 / 30); w.update(1 / 30); t += 1 / 30; evs.push(...w.drainEvents()); }
  return { inputs, evs, hash: hashEvents(evs), time: w.time };
}

function replay(age, lang, vpName, seed, inputs, frame) {
  const vp = L.VIEWPORTS[vpName];
  const w = new SG.World({ seed, age, lang }); w.setViewport(vp.W, vp.H, vp.ins);
  const evs = []; w.newSession(); evs.push(...w.drainEvents());
  let k = 0, guard = 0;
  const stepsPerFrame = Math.round(frame / w.cfg.step);
  while (w.state !== 'sessionDone' && guard++ < 1e7) {
    const s = Math.round(w.time / w.cfg.step);
    while (k < inputs.length && inputs[k].step <= s) { w[inputs[k].fn](...inputs[k].a); k++; }
    // advance to the next input step or by one frame, whichever comes first, never crossing an input step
    const nextIn = k < inputs.length ? inputs[k].step : Infinity;
    const n = Math.max(1, Math.min(stepsPerFrame, nextIn - s));
    w.update(n * w.cfg.step); evs.push(...w.drainEvents());
    if (w.time > 1600) break;
  }
  return { hash: hashEvents(evs), time: w.time };
}

const rows = [];
let fails = 0;
const cases = [];
for (const age of [3, 4, 5, 6, 7]) for (const lang of ['en', 'vi']) cases.push([age, lang, ['iphoneP', 'iphoneL', 'ipadL', 'ipadP'][age % 4], 40 + age, ['bot0.6', 'toddler', 'spammer'][age % 3]]);
for (const c of cases) {
  const a = record(...c), b = record(...c);
  const r120 = replay(c[0], c[1], c[2], c[3], a.inputs, 1 / 120);
  const r60 = replay(c[0], c[1], c[2], c[3], a.inputs, 1 / 60);
  const ok1 = a.hash === b.hash, ok2 = a.hash === r120.hash && a.hash === r60.hash;
  if (!ok1 || !ok2) fails++;
  rows.push(`| ${c.join(' / ')} | ${a.evs.length} | ${a.hash} | ${ok1 ? 'same' : 'DIFF ' + b.hash} | ${r120.hash === a.hash ? 'same' : 'DIFF'} | ${r60.hash === a.hash ? 'same' : 'DIFF'} |`);
}
console.log('| age / lang / viewport / seed / driver | events | hash | rerun | replay 1/120 | replay 1/60 |\n|---|---|---|---|---|---|');
console.log(rows.join('\n'));
console.log(fails ? `\n${fails} NON-DETERMINISTIC case(s)` : '\nall deterministic');
