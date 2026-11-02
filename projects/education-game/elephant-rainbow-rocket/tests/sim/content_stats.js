#!/usr/bin/env node
// Bim's Rainbow Rocket — pedagogy / variety analysis of RR.Content (chapters generated like the World: 4 rounds with the
// tuned hops), plus Talk-time answer balance.   node tests/sim/content_stats.js [chapters=300]
// Prints markdown (stdout + tests/sim/out/content_stats.md).
'use strict';
const fs = require('fs');
const path = require('path');
const { RR, mean, f1 } = require('./lib');
const N = +(process.argv[2] || 300);
const tbl = (head, rows) => '| ' + head.join(' | ') + ' |\n|' + head.map(() => '---').join('|') + '|\n' + rows.map(r => '| ' + r.join(' | ') + ' |').join('\n') + '\n';
function share(c) {
  const e = Object.entries(c).sort((a, b) => b[1] - a[1]), tot = e.reduce((s, x) => s + x[1], 0);
  return { n: e.length, max: e[0] ? e[0][0] + ' ' + (100 * e[0][1] / tot).toFixed(0) + '%' : '–', min: e.length ? e[e.length - 1][0] + ' ' + (100 * e[e.length - 1][1] / tot).toFixed(0) + '%' : '–' };
}

let md = `## Content variety (${N} chapters per age × pool topic × language)\n\n`;
const rows = [];
for (const age of [3, 4, 5, 6, 7]) for (const topic of RR.AGE_POOLS[age]) for (const lang of ['en', 'vi']) {
  const vals = {}, distinct = [], hops = [], isl = [], prompts = {};
  for (let c = 0; c < N; c++) {
    const rng = new RR.RNG(c * 7919 + age * 101 + (lang === 'vi' ? 7 : 0)), seen = new Set();
    let h = 0;
    for (let ri = 0; ri < 4; ri++) {
      const r = RR.Content.makeRound(topic, { age, lang, rng, roundIndex: ri, hopsPerRound: RR.CONFIG.hopsPerRound, islandsByAge: RR.CONFIG.islandsByAge });
      for (const hp of r.hops) {
        const a = hp.tokens[hp.answer], v = a.kind === 'size' ? a.size + ' ' + a.animal : String(a.value);
        vals[v] = (vals[v] || 0) + 1; seen.add(v); isl.push(hp.tokens.length); prompts[hp.promptKey] = (prompts[hp.promptKey] || 0) + 1; h++;
      }
    }
    distinct.push(seen.size); hops.push(h);
  }
  const s = share(vals);
  rows.push([age, topic, lang, s.n, s.max, s.min, f1(mean(distinct)), f1(mean(hops)), f1(mean(isl)), Object.entries(prompts).map(([k, v]) => k + ' ' + v).join(', ')]);
}
md += tbl(['age', 'topic', 'lang', 'answers', 'most', 'least', 'distinct answers / chapter', 'hops / chapter', 'islands / row', 'prompts'], rows);

md += '\n### Talk time answers\n\n';
const trows = [];
for (const age of [3, 4, 5, 6, 7]) for (const topic of RR.AGE_POOLS[age]) for (const lang of ['en', 'vi']) {
  const c = {}, pos = {};
  for (let s = 0; s < N; s++) {
    const t = RR.Content.makeTalk(topic, { age, lang, rng: new RR.RNG(s * 31 + age) });
    const a = t.choices.find(x => x.id === t.answerId).value; c[a] = (c[a] || 0) + 1; pos[t.answerId] = (pos[t.answerId] || 0) + 1;
  }
  const sh = share(c), ps = share(pos);
  trows.push([age, topic, lang, sh.n, sh.max, sh.min, ps.max, ps.min]);
}
md += tbl(['age', 'topic', 'lang', 'answers', 'most', 'least', 'answer slot most', 'least'], trows);
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'out', 'content_stats.md'), md);
console.log(md);
