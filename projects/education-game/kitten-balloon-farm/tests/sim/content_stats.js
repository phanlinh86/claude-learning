#!/usr/bin/env node
// Pedagogy / variety analysis of KB.Content (chapters generated exactly like the World does: 4 rounds with history),
// plus Talk-time answer balance.   node tests/sim/content_stats.js [chapters=400]
// Prints markdown (stdout + tests/sim/out/content_stats.md).
'use strict';
const fs = require('fs');
const path = require('path');
const { KB, mean, f1 } = require('./lib');
const N = +(process.argv[2] || 400);
const tbl = (head, rows) => '| ' + head.join(' | ') + ' |\n|' + head.map(() => '---').join('|') + '|\n' + rows.map(r => '| ' + r.join(' | ') + ' |').join('\n') + '\n';
function share(c) {
  const e = Object.entries(c).sort((a, b) => b[1] - a[1]), tot = e.reduce((s, x) => s + x[1], 0);
  return { n: e.length, max: e[0] ? e[0][0] + ' ' + (100 * e[0][1] / tot).toFixed(0) + '%' : '–', min: e.length ? e[e.length - 1][0] + ' ' + (100 * e[e.length - 1][1] / tot).toFixed(0) + '%' : '–' };
}

let md = `## Content variety (${N} chapters per age × topic × language)\n\n`;
const rows = [];
for (const age of [3, 4, 5, 6, 7]) for (const topic of KB.AGE_TOPICS[age]) for (const lang of ['en', 'vi']) {
  const targets = {}, distinct = [], sizes = [], answers = [], repeats = [];
  for (let c = 0; c < N; c++) {
    const rng = new KB.RNG(c * 7919 + age * 101 + (lang === 'vi' ? 7 : 0)), hist = [], seen = new Set();
    let prevKey = null, rep = 0;
    for (let ri = 0; ri < 4; ri++) {
      const r = KB.Content.makeRound(topic, { age, lang, rng, roundIndex: ri, history: hist });
      hist.push(r.sum);
      const t = topic === 'animals' ? r.params.animal : String(r.sum.target);
      targets[t] = (targets[t] || 0) + 1; seen.add(t);
      sizes.push(r.balloons.length); answers.push(r.mode === 'count' ? r.sign.need : r.balloons.filter(b => b.answer).length);
      if (prevKey === r.sum.key) rep++; prevKey = r.sum.key;
    }
    distinct.push(seen.size); repeats.push(rep);
  }
  const s = share(targets);
  rows.push([age, topic, lang, s.n, s.max, s.min, f1(mean(distinct)), f1(mean(sizes)), f1(mean(answers)), repeats.reduce((a, b) => a + b, 0)]);
}
md += tbl(['age', 'topic', 'lang', 'targets', 'most', 'least', 'distinct/chapter', 'balloons', 'targets/round (count: N)', 'identical consecutive'], rows);

md += '\n### Talk time answers\n\n';
const trows = [];
for (const age of [3, 4, 5, 6, 7]) for (const topic of KB.AGE_TOPICS[age]) for (const lang of ['en', 'vi']) {
  const c = {}, pos = {};
  for (let s = 0; s < N; s++) {
    const t = KB.Content.makeTalk(topic, { age, lang, rng: new KB.RNG(s * 31 + age) });
    const a = t.choices.find(x => x.id === t.answerId).value; c[a] = (c[a] || 0) + 1; pos[t.answerId] = (pos[t.answerId] || 0) + 1;
  }
  const sh = share(c), ps = share(pos);
  trows.push([age, topic, lang, sh.n, sh.max, sh.min, ps.max, ps.min]);
}
md += tbl(['age', 'topic', 'lang', 'answers', 'most', 'least', 'answer slot most', 'least'], trows);
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'out', 'content_stats.md'), md);
console.log(md);
