#!/usr/bin/env node
// Before/after table for pt_kids.js runs:  node tests/sim/pt_compare.js ab_base ab_pairs ab_patch [--out name]
'use strict';
const fs = require('fs'), path = require('path');
const { agg } = require('./pt_summary');
const args = process.argv.slice(2), oi = args.indexOf('--out'), outName = oi >= 0 ? args.splice(oi, 2)[1] : null;
const runs = args.map(n => JSON.parse(fs.readFileSync(path.join(__dirname, 'out', 'pt_' + n + '.json'), 'utf8')));
const f0 = x => (isFinite(x) ? Math.round(x) : '–'), f1 = x => (isFinite(x) ? x.toFixed(1) : '–'), fp = x => (isFinite(x) ? Math.round(100 * x) + '%' : '–');
let md = '## Before / after: ' + args.join(' → ') + '\n\n' + runs.map(r => `- **${r.name}**: config ${JSON.stringify(r.config)} patches ${JSON.stringify(r.patches)}`).join('\n') + '\n\n';
md += '| driver | age | ' + args.map(a => a + ' chapter (p90) · session p90 · mm/round · 3★ · stars% · hint rounds').join(' | ') + ' |\n|---|---|' + args.map(() => '---').join('|') + '|\n';
const drivers = [...new Set(runs[0].sessions.map(s => s.driver))], ages = [...new Set(runs[0].sessions.map(s => s.age))].sort();
for (const d of drivers) for (const a of ages) {
  md += `| ${d} | ${a} | ` + runs.map(r => { const g = agg(r.sessions.filter(s => s.driver === d && s.age === a));
    return `${f0(g.chap)} (${f0(g.chapP90)}) · ${f0(g.sesP90)} · ${f1(g.mm)} · ${fp(g.r3)} · ${fp(g.starPct)} · ${fp(g.hintR)}`; }).join(' | ') + ' |\n';
}
if (outName) fs.writeFileSync(path.join(__dirname, 'out', 'pt_' + outName + '.md'), md);
console.log(md);
