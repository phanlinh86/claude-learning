#!/usr/bin/env node
// Headless distribution for the browser comparison: bot 0.8 (the ?bot=1 default), age 4, the browser's logical
// viewports (out/browser_age4.json), N seeds each.   node tests/sim/headless_twin.js [N=30]
'use strict';
const L = require('./lib'), { run } = require('./playtest');
const B = require('./out/browser_age4.json'), N = +(process.argv[2] || 30);
const med = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
for (const dev of [...new Set(B.map(r => r.device))]) {
  const r0 = B.find(r => r.device === dev), [W, H] = r0.logical.split('×').map(Number);
  L.VIEWPORTS.__t = { W, H, ins: { top: 0, right: 0, bottom: 0, left: 0 } };
  // insets from a live run are not stored per row; use the harness preset with the same orientation/size class
  const preset = { iphoneL: 'iphoneL', iphoneP: 'iphoneP', ipadL: 'ipadL', ipadP: 'ipadP' }[dev];
  const S = []; for (let k = 0; k < N; k++) S.push(run(L, { age: 4, vp: preset, driver: 'bot0.8', seed: 700 + k, lang: k % 2 ? 'vi' : 'en', config: {} }));
  const T = S.map(s => s.T), st = S.map(s => s.stars), mi = S.map(s => s.misses), wr = S.map(s => s.wrongs);
  const br = B.filter(r => r.device === dev).map(r => r.browser);
  console.log(`| ${dev} | ${br.map(b => b.session.toFixed(0)).join(', ')} | ${br.map(b => b.stars).join(', ')} | ${br.map(b => b.misses).join(', ')} | ${med(T).toFixed(0)} (p10–p90 ${q(T, 0.1).toFixed(0)}–${q(T, 0.9).toFixed(0)}) | ${med(st)} (${q(st, 0.1)}–${q(st, 0.9)}) | ${med(mi)} (max ${Math.max(...mi)}) | ${med(wr)} |`);
}
