#!/usr/bin/env node
// Pip's Camp Hide & Seek — determinism: (1) same seed + same driver + same frame dt → identical event stream;
// (2) inputs recorded at 1/30 s frames and replayed at 1/120 s and 1/60 s frames → identical event stream
//     (inputs land on the same fixed sub-step, so the world must not depend on how dt is split).
'use strict';
const crypto = require('crypto');
const L = require('./lib');
const FC = L.FC;

function hashEvents(evs) {
  const h = crypto.createHash('sha1');
  for (const e of evs) h.update(JSON.stringify(e, (k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)));
  return h.digest('hex').slice(0, 12);
}
function mk(age, lang, vpName, seed) {
  const vp = L.VIEWPORTS[vpName], w = new FC.World({ seed, age, lang });
  w.setViewport(vp.W, vp.H, vp.ins); return w;
}
function record(age, lang, vpName, seed, driver) {
  const w = mk(age, lang, vpName, seed), inputs = [], evs = [];
  for (const fn of ['pointerDown', 'pointerMove', 'pointerUp', 'talkAnswer', 'cancelDrag']) {
    const orig = w[fn].bind(w);
    w[fn] = function (...a) { inputs.push({ step: Math.round(w.time / w.cfg.step), fn, a }); return orig(...a); };
  }
  const d = L.makeDriver(driver, w, age, seed + 1);
  w.newSession(); evs.push(...w.drainEvents());
  let t = 0;
  while (w.state !== 'sessionDone' && t < 2000) { d.step(1 / 30); w.update(1 / 30); t += 1 / 30; evs.push(...w.drainEvents()); }
  return { inputs, evs, hash: hashEvents(evs) };
}
function replay(age, lang, vpName, seed, inputs, frame) {
  const w = mk(age, lang, vpName, seed), evs = [];
  w.newSession(); evs.push(...w.drainEvents());
  let k = 0, guard = 0;
  const per = Math.round(frame / w.cfg.step);
  while (w.state !== 'sessionDone' && guard++ < 1e7 && w.time < 2100) {
    const s = Math.round(w.time / w.cfg.step);
    while (k < inputs.length && inputs[k].step <= s) { w[inputs[k].fn](...inputs[k].a); k++; }
    const next = k < inputs.length ? inputs[k].step : Infinity;
    w.update(Math.max(1, Math.min(per, next - s)) * w.cfg.step); evs.push(...w.drainEvents());
  }
  return hashEvents(evs);
}

let fails = 0;
const rows = [];
const VPS = Object.keys(L.VIEWPORTS), DRV = ['bot0.5', 'typical', 'tapper', 'bot1', 'typical'];
for (const age of [3, 4, 5, 6, 7]) for (const lang of ['en', 'vi']) {
  const c = [age, lang, VPS[age % 4], 40 + age, DRV[age - 3]];
  const a = record(...c), b = record(...c);
  const r120 = replay(c[0], c[1], c[2], c[3], a.inputs, 1 / 120), r60 = replay(c[0], c[1], c[2], c[3], a.inputs, 1 / 60);
  const ok = a.hash === b.hash && a.hash === r120 && a.hash === r60;
  if (!ok) fails++;
  rows.push(`| ${c.join(' / ')} | ${a.evs.length} | ${a.hash} | ${b.hash === a.hash ? 'same' : 'DIFF'} | ${r120 === a.hash ? 'same' : 'DIFF'} | ${r60 === a.hash ? 'same' : 'DIFF'} |`);
}
console.log('| age / lang / viewport / seed / driver | events | hash | rerun | replay 1/120 | replay 1/60 |\n|---|---|---|---|---|---|');
console.log(rows.join('\n'));
console.log(fails ? `\n${fails} NON-DETERMINISTIC case(s)` : '\nall deterministic');
process.exit(fails ? 1 : 0);
