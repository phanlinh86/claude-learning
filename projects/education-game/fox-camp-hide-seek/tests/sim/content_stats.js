#!/usr/bin/env node
// Pip's Camp Hide & Seek — pedagogy / variety analysis of FC.Content (chapters generated like the World: 4 rounds per
// topic with the tuned place counts), plus Talk-time answer balance.   node tests/sim/content_stats.js [chapters=300]
// Prints markdown (stdout + tests/sim/out/content_stats.md).
'use strict';
const fs = require('fs');
const path = require('path');
const { FC, mean, f1 } = require('./lib');
const N = +(process.argv[2] || 300);
const tbl = (head, rows) => '| ' + head.join(' | ') + ' |\n|' + head.map(() => '---').join('|') + '|\n' + rows.map(r => '| ' + r.join(' | ') + ' |').join('\n') + '\n';
function share(c) {
  const e = Object.entries(c).sort((a, b) => b[1] - a[1]), tot = e.reduce((s, x) => s + x[1], 0);
  return { n: e.length, max: e[0] ? e[0][0] + ' ' + (100 * e[0][1] / tot).toFixed(0) + '%' : '–', min: e.length ? e[e.length - 1][0] + ' ' + (100 * e[e.length - 1][1] / tot).toFixed(0) + '%' : '–' };
}
const val = c => c.kind === 'size' ? c.size + ' ' + c.animal : String(c.value);

let md = `## Content variety (${N} chapters per age × pool topic × language)\n\n`;
const rows = [];
for (const age of [3, 4, 5, 6, 7]) for (const topic of FC.AGE_POOLS[age]) for (const lang of ['en', 'vi']) {
  const vals = {}, distinct = [], asks = [], places = [], prompts = {}, slot = {}, friends = {};
  for (let c = 0; c < N; c++) {
    const rng = new FC.RNG(c * 7919 + age * 101 + (lang === 'vi' ? 7 : 0)), seen = new Set();
    let n = 0;
    for (let ri = 0; ri < 4; ri++) {
      const r = FC.Content.makeRound(topic, { age, lang, rng, roundIndex: ri, season: c % 4, placesByAge: FC.CONFIG.placesByAge });
      places.push(r.places.length);
      r.places.forEach(p => { friends[p.friend] = (friends[p.friend] || 0) + 1; });
      for (const a of r.asks) {
        const v = val(r.places[a.answer].clue);
        vals[v] = (vals[v] || 0) + 1; seen.add(v); prompts[a.promptKey] = (prompts[a.promptKey] || 0) + 1; n++;
        const k = r.places.length + ':' + a.answer; slot[k] = (slot[k] || 0) + 1;   // left-to-right position of the answer
      }
    }
    distinct.push(seen.size); asks.push(n);
  }
  const s = share(vals), fr = share(friends);
  // answer position balance among 3-place rounds (left / middle / right)
  const s3 = [0, 1, 2].map(i => slot['3:' + i] || 0), t3 = s3.reduce((a, b) => a + b, 0);
  rows.push([age, topic, lang, s.n, s.max, s.min, f1(mean(distinct)), f1(mean(asks)), f1(mean(places)), t3 ? s3.map(x => (100 * x / t3).toFixed(0)).join('/') : '–',
    fr.max + ' … ' + fr.min, Object.entries(prompts).map(([k, v]) => k + ' ' + v).join(', ')]);
}
md += tbl(['age', 'topic', 'lang', 'answers', 'most', 'least', 'distinct answers / chapter', 'asks / chapter', 'places / round', 'answer L/M/R % (3 places)', 'friend animals', 'prompts'], rows);

md += '\n### Talk time answers\n\n';
const trows = [];
for (const age of [3, 4, 5, 6, 7]) for (const topic of FC.AGE_POOLS[age]) for (const lang of ['en', 'vi']) {
  const c = {}, pos = {};
  for (let s = 0; s < N; s++) {
    const t = FC.Content.makeTalk(topic, { age, lang, rng: new FC.RNG(s * 31 + age) });
    const a = t.choices.find(x => x.id === t.answerId).value; c[a] = (c[a] || 0) + 1; pos[t.answerId] = (pos[t.answerId] || 0) + 1;
  }
  const sh = share(c), ps = share(pos);
  trows.push([age, topic, lang, sh.n, sh.max, sh.min, ps.max, ps.min]);
}
md += tbl(['age', 'topic', 'lang', 'answers', 'most', 'least', 'answer slot most', 'least'], trows);
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'out', 'content_stats.md'), md);
console.log(md);
