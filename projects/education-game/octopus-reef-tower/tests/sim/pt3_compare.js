#!/usr/bin/env node
// Compare hs_pt3 runs: node tests/sim/pt3_compare.js v0 v1 v2 … [--models typical,slow3] [--ages 3,4]
'use strict';
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const tags = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const MOD = get('models', 'typical,slow3,dragger,spammer,blockTapper,bot0.8').split(','), AGES = get('ages', '3,4,5').split(',').map(Number);
const f = (x, d = 1) => (x == null || isNaN(x) ? '–' : (+x).toFixed(d));
const lh = (r, k) => { const o = r.lines && r.lines[k]; return o && o.n ? f(100 * o.done / o.n, 0) : '–'; };
let md = '| run | age | model | chapter s | cut % | session s (p90) | ask s (p90) | 1st right % | wrong/ask | ≥3 bonks % | ★★★/★ % | prompt heard / cut-own / late % | prompt delay s | wrong line heard % | puffer tapped/seen · tappable s | puffer line heard % |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n';
for (const a of AGES) for (const m of MOD) for (const t of tags) {
  const rows = JSON.parse(fs.readFileSync(path.join(__dirname, 'out', 'pt3_' + t + '.json'), 'utf8'));
  const r = rows.find(x => x.age === a && x.model === m); if (!r) continue;
  md += `| ${t} | ${a} | ${m} | ${f(r.chap)} | ${f(r.cut, 0)} | ${f(r.ses, 0)} (${f(r.sesP90, 0)}) | ${f(r.ask)} (${f(r.askP90)}) | ${f(r.firstRight, 0)} | ${f(r.wrong, 2)} | ${f(r.w3, 0)} | ${f(r.s3, 0)}/${f(r.s1, 0)} | ${f(r.heard, 0)} / ${f(r.cutAns, 0)} / ${f(r.lateAsk, 0)} | ${f(r.delay, 2)} | ${lh(r, 'wrong')} | ${r.pufferTap}/${r.puffer} · ${f(r.pufferVis)} | ${lh(r, 'puffer')} |\n`;
}
console.log(md);
