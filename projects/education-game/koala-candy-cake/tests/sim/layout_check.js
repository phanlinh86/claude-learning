#!/usr/bin/env node
// Koko's Cake Tower — layout sanity for a CONFIG override (report-only): slots on screen, no overlap, slot hit boxes clear of
// the drop zone by ≥ 44 px horizontally (landscape) and the drop zone ≥ LW/2 from the screen edge.
//   node tests/sim/layout_check.js '{"dropPad":100}'
'use strict';
const L = require('./lib'), CK = L.CK;
const cfg = JSON.parse(process.argv[2] || '{}');
const VPS = Object.assign({}, L.VIEWPORTS, {
  se: { W: 720, H: 1280, ins: { top: 40, right: 0, bottom: 0, left: 0 } }, seL: { W: 1280, H: 720, ins: { top: 0, right: 0, bottom: 0, left: 0 } },
  ipadMiniL: { W: 1086, H: 720, ins: { top: 18, right: 0, bottom: 18, left: 0 } }, ipad13L: { W: 960, H: 720, ins: { top: 20, right: 0, bottom: 15, left: 0 } } });
let bad = 0, rows = [];
for (const [name, vp] of Object.entries(VPS)) for (const age of [3, 4, 5, 6, 7]) {
  const w = new CK.World({ seed: 1, age, lang: 'en', config: cfg }); w.setViewport(vp.W, vp.H, vp.ins);
  const Lw = w.layout, D = Lw.drop, maxK = age <= 3 ? 2 : age <= 5 ? 3 : 4;
  const slots = CK.World.slotsFor(Lw, w.cfg, maxK) || [];
  const issues = [];
  for (const s of slots) {
    if (s.x - Lw.LW / 2 < 0 || s.x + Lw.LW / 2 > Lw.W) issues.push('off-screen');
    if (!Lw.portrait && s.row === 0 && s.x - Lw.LW / 2 - 16 < D.x1 + 4 && s.x + Lw.LW / 2 + 16 > D.x0 - 4 && s.y < D.y1 + 44) issues.push('slot in drop zone');
  }
  for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) if (Math.abs(slots[i].x - slots[j].x) < Lw.LW && Math.abs(slots[i].y - slots[j].y) < Lw.LH) issues.push('overlap');
  const gap = slots.length && !Lw.portrait ? Math.min(...slots.filter(s => s.row === 0).map(s => s.x - Lw.LW / 2 - D.x1)) : null;
  if (D.x0 < 0) issues.push('zone off-screen');
  if (slots.length < maxK) issues.push('only ' + slots.length + ' slots');
  if (issues.length) bad++;
  rows.push(`${name} age ${age}: S ${Lw.S} slots ${slots.length}/${maxK} rows ${[...new Set(slots.map(s => s.row))].join('')} zone ${D.x0.toFixed(0)}–${D.x1.toFixed(0)} gap→slot ${gap == null ? '–' : gap.toFixed(0)} ${issues.length ? '✗ ' + [...new Set(issues)].join(', ') : '✓'}`);
}
console.log(rows.join('\n')); console.log(bad ? `${bad} viewport×age cases with issues` : 'all ok');
