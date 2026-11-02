// Bim's Rainbow Rocket — colour rows that really appear (2 000 rounds per age) and the weakest pair in one row for normal
// vision, deuteranopia and protanopia (ΔE00 of the island base colours) + shape-gem colours on a white cloud (age ≤ 4).
//   node tests/visual/rr_palette_cvd.js
const { load } = require('../unit/load');
const { de00, lab, hex } = require('./colour');
const RR = load();
const PAL = { red: '#E84A4A', blue: '#3C8DE8', yellow: '#FFD23F', green: '#4CC26B', orange: '#FF9A2E', purple: '#9B6BE0', pink: '#FF8FC0' };
const out = {};
for (const topic of ['colors', 'shapes']) for (const age of [3, 4, 5, 6]) {
  if (topic === 'colors' && age > 5) continue;
  const sets = {}, worst = { '': [99], deut: [99], prot: [99] };
  for (let i = 0; i < 2000; i++) {
    const rng = new RR.RNG(1000 + i);
    let r; try { r = RR.Content.makeRound(topic, { age, lang: 'en', rng, roundIndex: i % 4 }); } catch (e) { continue; }
    for (const h of r.hops) {
      const cols = [...new Set(h.tokens.map(t => t.kind === 'color' ? t.value : t.color).filter(Boolean))].sort();
      if (cols.length < 2) continue;
      sets[cols.join('+')] = (sets[cols.join('+')] || 0) + 1;
      for (const s of ['', 'deut', 'prot']) for (let a = 0; a < cols.length; a++) for (let b = a + 1; b < cols.length; b++) {
        const d = de00(lab(hex(PAL[cols[a]]), s || null), lab(hex(PAL[cols[b]]), s || null));
        if (d < worst[s][0]) worst[s] = [d, cols[a] + '-' + cols[b]];
      }
    }
  }
  const line = `${topic} age ${age}: ${Object.keys(sets).length} colour rows; weakest pair normal ${worst[''][0].toFixed(1)} (${worst[''][1]}), deut ${worst.deut[0].toFixed(1)} (${worst.deut[1]}), prot ${worst.prot[0].toFixed(1)} (${worst.prot[1]})`;
  console.log(line);
  console.log('   colours used:', [...new Set(Object.keys(sets).join('+').split('+'))].join(' '));
  out[topic + age] = { sets, worst };
}
// every pair matrix (for the report)
const C = Object.keys(PAL);
for (const s of ['', 'deut', 'prot']) {
  const low = [];
  for (let a = 0; a < C.length; a++) for (let b = a + 1; b < C.length; b++) {
    const d = de00(lab(hex(PAL[C[a]]), s || null), lab(hex(PAL[C[b]]), s || null));
    if (d < 20) low.push(C[a] + '-' + C[b] + ' ' + d.toFixed(1));
  }
  console.log(`pairs ΔE00 < 20 (${s || 'normal'}):`, low.join(', '));
}
