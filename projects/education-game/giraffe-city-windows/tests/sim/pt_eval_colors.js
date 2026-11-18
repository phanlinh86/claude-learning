#!/usr/bin/env node
// Colour-round variety: the game's content.js vs an IN-MEMORY patch (sim only; game code untouched) that picks the
// clash-free colour set sharing the fewest colours with the previous round, and a colour thing other than the previous one.
//   node tests/sim/pt_eval_colors.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const JS = path.join(__dirname, '..', '..', 'game', 'js');
function load(patch) {
  const sb = { console, Math, JSON }; sb.window = sb; vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(JS, 'rng.js'), 'utf8'), sb);
  let src = fs.readFileSync(path.join(JS, 'content.js'), 'utf8');
  if (patch) {
    const a = "var pool = age <= COLOR_SAFE_MAX_AGE ? rng.pick(SAFE_SETS).slice() : COLORS5.slice();";
    const b = "var pool = age <= COLOR_SAFE_MAX_AGE ? (function () { var best = 1e9, c = []; SAFE_SETS.forEach(function (s) { var o = s.filter(function (x) { return pv.indexOf(x) >= 0; }).length; if (o < best) { best = o; c = []; } if (o === best) c.push(s); }); return rng.pick(c).slice(); })() : COLORS5.slice();";
    const c = "var things = rng.shuffle(GW.THINGS.slice()), one = things[0];";
    const d = "var things = rng.shuffle(GW.THINGS.slice()), one = things[0]; if (prev && prev.obj === one) one = things[1];";
    if (!src.includes(a) || !src.includes(c)) throw new Error('patch anchor not found');
    src = src.replace(a, b).replace(c, d);
    // remember the round's thing in the summary (sum.obj) so the next round can avoid it
    src = src.replace("sum: { set: set, values: values } };", "sum: { set: set, values: values, obj: (cards[0] && cards[0].obj) || null } };");
  }
  vm.runInContext(src, sb, { filename: 'content.js' });
  return sb.GW;
}
const PAIRS = { 3: [2, 2, 2, 3], 4: [2, 2, 3, 3], 5: [2, 3, 4, 4] };
function measure(GW, age) {
  let cons = 0, shared = 0, pairs = 0, all = 0, obj = 0;
  for (let s = 1; s <= 3000; s++) {
    const rng = new GW.RNG(s * 7 + age), hist = []; let prev = null;
    for (let ri = 0; ri < 4; ri++) {
      const r = GW.Content.makeRound('colors', { age, lang: 'en', rng, roundIndex: ri, history: hist, pairs: PAIRS[age][ri] });
      const cols = [...new Set(r.cards.map(c => c.face.color))], o = r.cards[0].face.obj;
      if (prev) { cons++; pairs += cols.length; const sh = cols.filter(c => prev.cols.includes(c)).length; shared += sh; if (sh === cols.length) all++; if (age <= 4 && o === prev.o) obj++; }
      prev = { cols, o }; hist.push(r.sum);
    }
  }
  return { rep: shared / pairs, all: all / cons, obj: obj / cons };
}
let md = '| age | build | colours repeated from the previous round | every colour repeated | same thing as the previous round (≤ 4) |\n|---|---|---|---|---|\n';
for (const age of [3, 4, 5]) for (const [nm, G] of [['game', load(false)], ['patched (sim only)', load(true)]]) {
  const m = measure(G, age); md += `| ${age} | ${nm} | ${(100 * m.rep).toFixed(0)}% | ${(100 * m.all).toFixed(0)}% | ${age <= 4 ? (100 * m.obj).toFixed(0) + '%' : '–'} |\n`;
}
console.log(md);
