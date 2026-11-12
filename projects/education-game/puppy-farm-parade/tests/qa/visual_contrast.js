// Visual QA (report-only): WCAG contrast of every answer colour against the path / hay / sky of every mood, CVD-simulated
// distances between colour pairs, and a content sweep for forbidden colour pairs below age 5.
//   node tests/qa/visual_contrast.js  -> stdout + tests/out/qa_visual/contrast.json
const path = require('path'), fs = require('fs');
const { load } = require('../unit/load');
const FP = load();
const PAL = FP.PALETTE;
const BG = {
  'path morning': '#DCC4A0', 'path noon': '#D8BE95', 'path sunset': '#D9B790', 'path night': '#646C86',
  'path edge night': '#485070', 'grass night': '#2C4252', 'hay': '#E9C46A', 'hay light': '#F6E2A6', 'wood wagon': '#B98552',
  'sky night top': '#1E2A4A', 'sky night bottom': '#3B4C78', 'sky morning': '#F8DCC6', 'sky noon': '#7CC4EE', 'sky sunset': '#F29B6B'
};
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const lin = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const lum = h => { const [r, g, b] = hex(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
// Machado 2009 (severity 1) matrices on linear RGB
const M = { deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]] };
function sim(h, k) { const c = hex(h).map(lin); if (!k) return c; return M[k].map(r => Math.max(0, Math.min(1, r[0] * c[0] + r[1] * c[1] + r[2] * c[2]))); }
function lab(c) { // linear sRGB → CIELAB (D65)
  const X = (0.4124 * c[0] + 0.3576 * c[1] + 0.1805 * c[2]) / 0.95047, Y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2], Z = (0.0193 * c[0] + 0.1192 * c[1] + 0.9505 * c[2]) / 1.08883;
  const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
const dE = (a, b, k) => { const A = lab(sim(a, k)), B = lab(sim(b, k)); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };

const out = { contrast: {}, cvd: {}, clashes: {} };
console.log('WCAG contrast base / dark outline vs background');
for (const c of Object.keys(PAL)) {
  out.contrast[c] = {};
  for (const [bn, bh] of Object.entries(BG)) out.contrast[c][bn] = [+cr(PAL[c].base, bh).toFixed(2), +cr(PAL[c].dark, bh).toFixed(2)];
  console.log(c.padEnd(7), Object.entries(out.contrast[c]).map(([b, v]) => `${b}:${v[0]}/${v[1]}`).join('  '));
}
console.log('\nCVD ΔE (Lab) between answer colours: normal / deutan / protan / tritan');
const cs = Object.keys(PAL);
for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
  const a = PAL[cs[i]].base, b = PAL[cs[j]].base, k = cs[i] + '+' + cs[j];
  out.cvd[k] = [dE(a, b), dE(a, b, 'deutan'), dE(a, b, 'protan'), dE(a, b, 'tritan')].map(x => +x.toFixed(1));
  console.log(k.padEnd(14), out.cvd[k].join(' / '));
}
// hay stage vs yellow members
console.log('\nhay vs yellow ΔE', dE('#E9C46A', PAL.yellow.base).toFixed(1), 'deutan', dE('#E9C46A', PAL.yellow.base, 'deutan').toFixed(1), ' contrast', cr('#E9C46A', PAL.yellow.base).toFixed(2));
console.log('path noon vs yellow ΔE', dE('#D8BE95', PAL.yellow.base).toFixed(1), 'deutan', dE('#D8BE95', PAL.yellow.base, 'deutan').toFixed(1));
console.log('path night vs purple ΔE', dE('#646C86', PAL.purple.base).toFixed(1), 'vs blue', dE('#646C86', PAL.blue.base).toFixed(1));
console.log('purple dark outline vs night path ΔE', dE('#646C86', PAL.purple.dark).toFixed(1), 'contrast', cr('#646C86', PAL.purple.dark).toFixed(2));
// content sweep: colours present per round and Talk choices (ages 3–4)
const bad = [['blue', 'purple'], ['red', 'green'], ['yellow', 'orange'], ['green', 'orange'], ['red', 'orange']];
for (const age of [3, 4, 5]) {
  const pairs = {}; let n = 0, viol = 0, talkViol = 0, low = 0;
  for (const topic of FP.AGE_TOPICS[age]) for (let s = 1; s <= 400; s++) for (let ri = 0; ri < 4; ri++) {
    const r = FP.Content.makeRound(topic, { age, lang: 'en', rng: new FP.RNG(s * 7 + ri), roundIndex: ri, level: 1 });
    const col = [...new Set(r.members.map(m => m.thing.color).filter(Boolean))];
    n++;
    if (col.length > 1) { const k = col.slice().sort().join('+'); pairs[k] = (pairs[k] || 0) + 1; }
    if (age < 5 && bad.some(([a, b]) => col.includes(a) && col.includes(b))) viol++;
    // lowest normal ΔE between the odd colour and the rule colour (any age)
    if (topic === 'colors' && col.length === 2 && dE(PAL[col[0]].base, PAL[col[1]].base, 'deutan') < 25) low++;
  }
  for (const topic of FP.AGE_TOPICS[age]) for (let s = 1; s <= 400; s++) {
    const t = FP.Content.makeTalk(topic, { age, lang: 'en', rng: new FP.RNG(s) });
    const col = [...new Set(t.choices.map(c => c.thing && c.thing.color).filter(Boolean))];
    if (age < 5 && bad.some(([a, b]) => col.includes(a) && col.includes(b))) talkViol++;
  }
  out.clashes[age] = { rounds: n, viol, talkViol, deutanLowDE: low, pairs };
  console.log(`\nage ${age}: ${n} rounds, forbidden pairs ${viol}, talk forbidden ${talkViol}, colour rounds with deutan ΔE<25: ${low}`);
  console.log(' pairs', JSON.stringify(pairs));
}
fs.mkdirSync(path.join(__dirname, '..', 'out', 'qa_visual'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'out', 'qa_visual', 'contrast.json'), JSON.stringify(out, null, 1));
