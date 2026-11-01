#!/usr/bin/env node
// Before/after table from two pt_run outputs:  node tests/sim/pt_compare.js before after [metric,metric…] [--drivers a,b] [--ages 3,4]
'use strict';
const fs = require('fs'), path = require('path');
const { agg } = require('./pt_run');
const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const [A, B] = args;
const load = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'out', 'pt_' + n + '.json'), 'utf8'));
const DA = load(A), DB = load(B);
const metrics = (args[2] && !args[2].startsWith('--') ? args[2] : 'ses,chap,round,wrong,hintR,stars,starsPerMin,missRate,riseIgn,cut,promptCut,wrongPerMin,countD,friendOverlap').split(',');
const drivers = get('drivers', [...new Set(DB.sessions.map(s => s.driver))].join(',')).split(','), ages = get('ages', '3,4,5,6,7').split(',').map(Number);
const fmt = (k, v) => (!isFinite(v) ? '–' : /hintR|missRate|riseIgn|cut|promptCut|s3|s1|cut3/.test(k) ? Math.round(100 * v) + '%' : v >= 20 ? v.toFixed(0) : v.toFixed(2));
let md = `| driver | age | ${metrics.join(' | ')} |\n|${'---|'.repeat(metrics.length + 2)}\n`;
for (const d of drivers) for (const a of ages) {
  const sa = DA.sessions.filter(s => s.driver === d && s.age === a), sb = DB.sessions.filter(s => s.driver === d && s.age === a);
  if (!sa.length || !sb.length) continue;
  const ga = agg(sa), gb = agg(sb);
  md += `| ${d} | ${a} | ` + metrics.map(k => `${fmt(k, ga[k])} → **${fmt(k, gb[k])}**`).join(' | ') + ' |\n';
}
console.log(md);
