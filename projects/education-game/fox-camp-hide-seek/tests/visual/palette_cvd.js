// Colour rounds below age 5: which colour sets really appear (2 000 rounds per age), and the weakest pair in each set
// for normal vision, deuteranopia and protanopia (ΔE00 on the cream card front palette).   node tests/visual/palette_cvd.js
const { load } = require('../unit/load');
const { de00, lab, hex } = require('./colour');
const FC = load();
const PAL = { red: '#E84A4A', blue: '#3C8DE8', yellow: '#FFD23F', green: '#4CC26B', orange: '#FF9A2E', purple: '#9B6BE0', pink: '#FF8FC0' };
for (const age of [3, 4, 5]) {
  const sets = {}, worst = { '': [99], deut: [99], prot: [99] };
  for (let i = 0; i < 2000; i++) {
    const rng = new FC.RNG(1000 + i);
    const r = FC.Content.makeRound('colors', { age, lang: 'en', rng, roundIndex: i % 4, history: [] });
    const cols = [...new Set(r.cards.map(c => c.face.color))].sort();
    sets[cols.join('+')] = (sets[cols.join('+')] || 0) + 1;
    for (const s of ['', 'deut', 'prot']) for (let a = 0; a < cols.length; a++) for (let b = a + 1; b < cols.length; b++) {
      const d = de00(lab(hex(PAL[cols[a]]), s || null), lab(hex(PAL[cols[b]]), s || null));
      if (d < worst[s][0]) worst[s] = [d, cols[a] + '-' + cols[b]];
    }
  }
  console.log(`age ${age}: ${Object.keys(sets).length} colour sets; weakest pair normal ${worst[''][0].toFixed(1)} (${worst[''][1]}), deut ${worst.deut[0].toFixed(1)} (${worst.deut[1]}), prot ${worst.prot[0].toFixed(1)} (${worst.prot[1]})`);
  console.log('   colours used:', [...new Set(Object.keys(sets).join('+').split('+'))].join(' '));
}
