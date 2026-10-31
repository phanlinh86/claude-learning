#!/usr/bin/env node
// Tap-in-place test: a toddler TAPS an item (down → 0.12 s → up at the same point, no drag) to hear its name.
// What does the world make of it?  Expected: nothing (item stays home, no mistake, no "oops", no hint).
//   node tests/sim/tap_test.js [--config '{"playNestGap":44}'] [--variant name]
'use strict';
const L = require('./lib');
const V = require('./variants');
const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const config = JSON.parse(get('config', '{}'));
const variant = get('variant', null);
if (variant) V.apply(variant, L.SG);
const cfg = Object.assign({}, variant ? V.VARIANTS[variant].config : {}, config);
const seeds = +get('seeds', 40);

const res = {};
for (const vp of Object.keys(L.VIEWPORTS)) for (const age of [3, 4, 5, 6, 7]) {
  const key = vp; res[key] = res[key] || { taps: 0, correct: 0, wrong: 0, miss: 0, none: 0, hintAfter2: 0 };
  for (let s = 0; s < seeds; s++) {
    const v = L.VIEWPORTS[vp];
    const w = new L.SG.World({ seed: 500 + s, age, lang: 'en', config: cfg });
    w.setViewport(v.W, v.H, v.ins);
    w.newSession();
    w.startLevel(s % 4);
    let guard = 0;
    while (!(w.state === 'round' && w.interactive) && guard++ < 2000) w.update(1 / 60);
    w.drainEvents();
    if (w.round === 0) {   // skip warm-up so rounds have more items: finish it quickly by placing everything
      // tap test runs on the warm-up round as well; that is the very first thing a kid sees
    }
    const ids = w.items.map(i => i.id);
    for (const id of ids) {
      const it = w.itemById(id);
      if (!it || it.state !== 'idle' || w.state !== 'round') continue;
      for (let k = 0; k < 2; k++) {                 // tap the same item twice (kids repeat taps)
        const x = it.x, y = it.y;
        if (it.state !== 'idle') break;
        const got = w.pointerDown(x, y);
        if (got !== id) { if (got) w.pointerUp(x, y); continue; }
        for (let f = 0; f < 7; f++) w.update(1 / 60);
        w.pointerUp(x, y);
        for (let f = 0; f < 60; f++) w.update(1 / 60);
        const ev = w.drainEvents().map(e => e.type);
        const r = res[key]; r.taps++;
        if (ev.includes('correct')) r.correct++; else if (ev.includes('wrong')) r.wrong++; else if (ev.includes('miss')) r.miss++; else r.none++;
        if (ev.includes('hint')) r.hintAfter2++;
        if (w.state !== 'round') break;
      }
    }
  }
}
const rows = Object.entries(res).map(([k, r]) => [k, r.taps, L.fp(r.none / r.taps), L.fp(r.miss / r.taps), L.fp(r.wrong / r.taps), L.fp(r.correct / r.taps), L.fp(r.hintAfter2 / r.taps)]);
console.log('| viewport | taps | nothing | judged "miss" | judged WRONG pot | judged correct | auto-hint fired |\n|---|---|---|---|---|---|---|');
for (const r of rows) console.log('| ' + r.join(' | ') + ' |');
