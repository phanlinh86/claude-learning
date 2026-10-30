#!/usr/bin/env node
// Tap test: a toddler TAPS falling bubbles (down → 0.06–0.18 s → up at the same point) to hear their names.
// Expected: every tap on a bubble gives a `tap` event (Pip names it), Pip runs under it (DESIGN §5.2), no
// mistake is counted for the tap itself. Measures how often a tap on a WRONG bubble later turns into a wrong catch.
//   node tests/sim/tap_test.js [--config '{"spawnGap":2}'] [--seeds 40]
'use strict';
const L = require('./lib');
const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const config = JSON.parse(get('config', '{}'));
const seeds = +get('seeds', 40);
const res = {};
for (const vp of Object.keys(L.VIEWPORTS)) for (const age of [3, 4, 5, 6, 7]) {
  const r = res[vp] = res[vp] || { taps: 0, tapEv: 0, tapWrong: 0, wrongAfter: 0, tapRight: 0, rightAfter: 0 };
  for (let s = 0; s < seeds; s++) {
    const v = L.VIEWPORTS[vp];
    const w = new L.PG.World({ seed: 500 + s, age, lang: 'en', config });
    w.setViewport(v.W, v.H, v.ins);
    w.newSession(); w.startLevel(s % 4);
    const wantRight = s % 2 === 0;                 // half the taps on a right bubble, half on a wrong one
    let guard = 0;
    const pick = () => w.items.find(i => i.state === 'fall' && i.right === wantRight && i.y < w.basket.y - 200);
    while (!(w.state === 'round' && pick()) && guard++ < 6000) w.update(1 / 60);
    w.drainEvents();
    const it = pick();
    if (!it) continue;
    w.pointerDown(it.x, it.y);
    for (let f = 0; f < 7; f++) w.update(1 / 60);
    w.pointerUp(it.x, it.y);
    r.taps++;
    const ev = [];
    for (let f = 0; f < 60 * 12; f++) { w.update(1 / 60); ev.push(...w.drainEvents()); if (w.state !== 'round') break; }
    const caught = ev.find(e => e.type === 'catch' && e.id === it.id);
    if (it.right) { r.tapRight++; if (caught) r.rightAfter++; } else { r.tapWrong++; if (caught) r.wrongAfter++; }
  }
}
console.log('| viewport | taps | tapped a right bubble → later caught | tapped a WRONG bubble → later caught (Pip ran under it) |\n|---|---|---|---|');
for (const [k, r] of Object.entries(res)) console.log(`| ${k} | ${r.taps} | ${L.fp(r.rightAfter / Math.max(1, r.tapRight))} of ${r.tapRight} | ${L.fp(r.wrongAfter / Math.max(1, r.tapWrong))} of ${r.tapWrong} |`);
