#!/usr/bin/env node
// Focused QA probes for one config (report-only).   node tests/sim/qa_focus.js [--n 80] [--age 4] [--model typical] [--config '{…}']
//  - settle: time from the ask until every floating bubble moves < 60 px/s (late detached bubbles still flying in)
//  - late taps in the first 1.5 s of play: a finger at the spot a bubble had 0.4 s ago → miss / neighbour %
//  - freed-thing distraction: at each 2nd+ right press of a multi-target round, is an earlier freed thing still hopping / flying,
//    and does it pass within (R + thingSize/2) of the bubble being pressed?
//  - autumn gusts: bubble displacement from home during a gust (px), speed during gusts, late-tap misses during gusts
'use strict';
const L = require('./lib');
const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const N = +get('n', 80), AGE = +get('age', 4), MODEL = get('model', 'typical'), config = JSON.parse(get('config', '{}'));
const VPS = Object.keys(L.VIEWPORTS);
const A = { settle: [], early: { n: 0, miss: 0, nb: 0 }, multi: 0, busy: 0, near: 0, gustDisp: [], calmDisp: [], gustMiss: { n: 0, miss: 0, nb: 0 }, blow: [], round: [], chap: [], sess: [], firstGap: [] };
for (let i = 0; i < N; i++) {
  const w = L.mkWorld({ age: AGE, lang: i % 2 ? 'vi' : 'en', vp: VPS[i % VPS.length], seed: 7000 + i * 31, config });
  const kid = L.makeModel(MODEL, w, AGE, 7001 + i * 31);
  w.newSession();
  const dt = 1 / 30, hist = [];
  let gustT = -1e9, t = 0, askT = -1, settled = true, roundT0 = 0, blowT = 0, chapT0 = 0, lastRightT = -1, pT = 0;
  while (w.state !== 'sessionDone' && t < 1800) {
    kid.step(dt); w.update(dt); t += dt;
    const fl = w.bubbles.filter(b => b.state === 'float');
    const m = new Map(); for (const b of fl) m.set(b.id, { x: b.x, y: b.y }); hist.push(m); if (hist.length > 13) hist.shift();
    if (!settled && w.interactive && fl.every(b => Math.hypot(b.vx, b.vy) < 60)) { settled = true; A.settle.push(w.time - askT); }
    if (w.interactive && (pT += dt) >= 0.2 && hist.length === 13) {
      pT = 0;
      const gust = w.time - gustT < 2.5;
      for (const b of fl) {
        const p = hist[0].get(b.id); if (!p) continue;
        const h = w._bubbleAt(p.x, p.y), bin = w.phaseTime <= 1.5 ? A.early : gust ? A.gustMiss : null;
        if (bin) { bin.n++; if (!h) bin.miss++; else if (h.b.id !== b.id) bin.nb++; }
        if (w.weather === 2 && w.phaseTime > 2) (gust ? A.gustDisp : A.calmDisp).push(Math.hypot(b.x - b.hx, b.y - b.hy));
      }
    }
    for (const e of w.drainEvents()) {
      kid.onEvent(e);
      if (e.type === 'level') chapT0 = w.time;
      if (e.type === 'gust') gustT = w.time;
      if (e.type === 'levelDone') A.chap.push(w.time - chapT0);
      if (e.type === 'round') { roundT0 = w.time; }
      if (e.type === 'ask') { askT = w.time; settled = false; A.blow.push(w.time - roundT0); }
      if (e.type === 'roundDone') A.round.push(w.time - roundT0);
      if (e.type === 'right') {
        if (e.i > 0 && e.mode !== 'countPop') {
          A.multi++; A.firstGap.push(w.time - lastRightT);
          const others = w.bubbles.filter(b => b.id !== e.id && (b.fstate === 'hop' || b.fstate === 'fly' || b.fstate === 'badge' || b.fstate === 'count'));
          if (others.length) A.busy++;
          if (others.some(b => Math.hypot(b.fx - e.x, b.fy - e.y) < w.layout.R + w.layout.thingSize / 2)) A.near++;
        }
        lastRightT = w.time;
      }
    }
  }
  A.sess.push(w.time);
}
const p = L.pct, f = x => (+x).toFixed(1), q = o => `miss ${(o.miss / Math.max(1, o.n) * 100).toFixed(2)} %, neighbour ${(o.nb / Math.max(1, o.n) * 100).toFixed(2)} % (n ${o.n})`;
console.log(JSON.stringify(config));
console.log(`settle after ask: median ${f(p(A.settle, 0.5))} s, p90 ${f(p(A.settle, 0.9))} s, max ${f(Math.max(...A.settle))} s; blow ${f(L.mean(A.blow))} s; round ${f(L.mean(A.round))} s; chapter ${f(L.mean(A.chap))} s (p90 ${f(p(A.chap, 0.9))}); session ${f(L.mean(A.sess) / 60)} min`);
console.log(`0.4 s-late tap, first 1.5 s of play: ${q(A.early)}; during autumn gusts (after 1.5 s): ${q(A.gustMiss)}`);
console.log(`autumn drift from home: calm p50 ${f(p(A.calmDisp, 0.5))} / p99 ${f(p(A.calmDisp, 0.99))} px; gust p50 ${f(p(A.gustDisp, 0.5))} / p99 ${f(p(A.gustDisp, 0.99))} / max ${f(Math.max(0, ...A.gustDisp))} px`);
console.log(`multi-target follow-up pops: ${A.multi}; an earlier freed thing still hopping/flying ${f(A.busy / Math.max(1, A.multi) * 100)} %; it passes within R + thing/2 of the pressed bubble ${f(A.near / Math.max(1, A.multi) * 100)} %; gap between pops median ${f(p(A.firstGap, 0.5))} s`);
