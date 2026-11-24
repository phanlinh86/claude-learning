#!/usr/bin/env node
// Leaf swing under wind only (nobody taps): constant wind W px/s and the real weather wind per mood; reports the swing
// amplitude once the round is in play (hint lifts from idle nudges excluded by stopping at the first idle).
'use strict';
const L = require('../sim/lib'), LL = L.LL;
const cfg = JSON.parse(process.argv[2] || '{}');
for (const wind of [0, 5, 10, 18, 30]) {
  const w = new LL.World({ seed: 3, age: 4, lang: 'en', config: cfg }); w.setViewport(960, 720, {}); w.newSession();
  while (w.state !== 'round' || !w.interactive) { w.wind = wind; w.update(1 / 60); }
  w.drainEvents(); let mx = 0, mx2 = 0; const t0 = w.time;
  while (w.time - t0 < 11.5) { w.wind = wind; w.update(1 / 60); const m = Math.max(...w.cards.map(c => Math.abs(c.swing))); if (w.time - t0 < 1) mx = Math.max(mx, m); else mx2 = Math.max(mx2, m); }
  console.log(`wind ${wind}: swing max first 1 s of play (peek/hide residue) ${mx.toFixed(3)}, 1–11.5 s ${mx2.toFixed(3)} rad`);
}
