#!/usr/bin/env node
// Nuka's Snow Dig — how much of the belly-slide is hidden behind front-row snow drifts (render.js draws drifts with
// y ≥ bun.y − 40 AFTER Nuka). Report-only. For every cheer frame with bun.slide > 0.5: the share of Nuka's slide box
// (World.slideBox) covered (also at the far end of the slide, where he pauses) by the heap of a front-row drift (box x ± 0.45 w, y − h0·(1 − 0.8·dig) … y; holes are flat).
//   node tests/sim/slide_cover.js [--n 12] [--ages 3,4,6]
'use strict';
const L = require('./lib');
const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const N = +get('n', 12), AGES = get('ages', '3,4,6').split(',').map(Number);
const inter = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const res = {};
for (const vp of Object.keys(L.VIEWPORTS)) for (const age of AGES) for (let i = 0; i < N; i++) {
  const w = L.mkWorld({ vp, age, seed: 300 + i * 17 + age, lang: 'en' }), b = L.makeModel('bot0.8', w, age, 9 + i);
  w.newSession(); let t = 0;
  const R = res[vp] = res[vp] || { frames: 0, cov: 0, half: 0, slides: 0, hidden: 0, cur: null, endF: 0, endCov: 0, endHalf: 0 };
  while (w.state !== 'sessionDone' && t < 900) {
    b.step(1 / 30); w.update(1 / 30); t += 1 / 30;
    for (const e of w.drainEvents()) { if (b.onEvent) b.onEvent(e); if (e.type === 'slide') { if (R.cur) { R.slides++; if (R.cur.c / Math.max(1, R.cur.n) > 0.5) R.hidden++; } R.cur = { c: 0, n: 0 }; } }
    if (w.bun.slide > 0.5) {
      const sb = w.slideBox(), A = sb.w * sb.h, by = w.layout.bun.y; let c = 0;
      const boxes = w.mounds.filter(m => m.y >= by - 40 && m.pop > 0.3).map(m => ({ x: m.x - 0.45 * m.w * m.pop, y: m.y - m.h0 * m.pop * (1 - 0.8 * m.dig), w: 0.9 * m.w * m.pop, h: m.h0 * m.pop * (1 - 0.8 * m.dig) }));
      for (const bx of boxes) c += inter(sb, bx);
      const f = Math.min(1, c / A); if (w.bun.slideX >= 0.95 * (w.bun._slideD || 1e9)) { R.endF++; R.endCov += f; if (f > 0.5) R.endHalf++; } R.frames++; R.cov += f; if (f > 0.5) R.half++; if (R.cur) { R.cur.c += f; R.cur.n++; }
    }
  }
  if (R.cur) { R.slides++; if (R.cur.c / Math.max(1, R.cur.n) > 0.5) R.hidden++; R.cur = null; }
}
console.log('| viewport | slide frames | mean share of the slide pose behind front drifts | frames > 50 % hidden | slides > 50 % hidden (mean) | at the far end (the pause pose): mean hidden · frames > 50 % hidden |\n|---|---|---|---|---|---|');
for (const [vp, R] of Object.entries(res)) console.log(`| ${vp} | ${R.frames} | ${(R.cov / R.frames * 100).toFixed(1)} % | ${(R.half / R.frames * 100).toFixed(1)} % | ${(R.hidden / R.slides * 100).toFixed(1)} % of ${R.slides} | ${(R.endCov / Math.max(1, R.endF) * 100).toFixed(1)} % · ${(R.endHalf / Math.max(1, R.endF) * 100).toFixed(1)} % |`);
