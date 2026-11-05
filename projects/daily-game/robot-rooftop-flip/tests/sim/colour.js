// Does reading colours pay off? Colour-aware adult vs colour-ignorer vs hazards-only, with today's mixed-colour
// firefly lines and with one-colour lines (results/proposal-mono-lines.patch, applied in memory here).
//   node tests/sim/colour.js [seeds=60] [time=300]   → results/colour.md
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./lib');
const P = require('./players');
const SEEDS = +(process.argv[2] || 60), TIME = +(process.argv[3] || 300);
const PROPOSAL = require('./proposal-config.json');

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'game', 'js', 'world.js'), 'utf8');
function monoSrc() {                                   // the same two edits as results/proposal-mono-lines.patch
  const a1 = "      arcLead: 0.45,        // unit   the arc starts this far before the latest flip point (where a good player flips)\n";
  const a2 = "      for (i = 0; i < n; i++) { var x = x0 + i * CONFIG.ff.spacing * u; this._addFF(x, y, this._ffColor(x, CONFIG.gen.match)); }";
  if (!src.includes(a1) || !src.includes(a2)) throw new Error('world.js changed: update colour.js');
  return src.replace(a1, a1 + "      lineMono: true,\n").replace(a2,
    "      var mono = CONFIG.gen.lineMono, lc = -1;\n      if (mono) {\n        if (this._colorAt(x0) !== this._colorAt(x0 + len)) continue;\n" +
    "        lc = this._ffColor(x0, CONFIG.gen.match);\n      }\n" +
    "      for (i = 0; i < n; i++) { var x = x0 + i * CONFIG.ff.spacing * u; this._addFF(x, y, mono ? lc : this._ffColor(x, CONFIG.gen.match)); }");
}
const worlds = {
  'mixed lines (today)': L.makeRF({ overrides: PROPOSAL.overrides }),
  'one-colour lines': L.makeRF({ worldSrc: monoSrc(), overrides: PROPOSAL.overrides })
};
const who = { 'colour-aware adult': (RF, s) => P.adultPlayer(RF, s), 'colour-ignorer': (RF, s) => P.colourIgnorer(RF, s), 'hazards only': (RF, s) => P.hazardOnly(RF, s), 'bot skill 1': RF => P.botPlayer(RF, 1) };
const C = L.COLS, cols = [C.scoring[1], C.scoring[4], C.scoring[3], C.scoring[5], C.scoring[6], C.survival[2], C.survival[7]];
const parts = ['# Colour reading: does it pay?', '', SEEDS + ' rounds per row, cap ' + TIME + ' s, proposal CONFIG', ''];
for (const d of ['easy', 'normal', 'hard']) {
  const rows = [];
  for (const [wn, RF] of Object.entries(worlds)) for (const [pn, mk] of Object.entries(who)) {
    const ms = []; for (let s = 1; s <= SEEDS; s++) ms.push(L.runGame(RF, mk(RF, s), { diff: d, seed: s, maxTime: TIME }));
    rows.push([wn + ' · ' + pn, L.summarise(ms)]);
  }
  parts.push('## ' + d, '', L.table(rows, 'track · player', cols), '');
}
fs.mkdirSync(path.join(__dirname, 'results'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'results', 'colour.md'), parts.join('\n'));
console.log(parts.join('\n'));
