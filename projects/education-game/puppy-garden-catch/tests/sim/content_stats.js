#!/usr/bin/env node
// Pedagogy / variety analysis of the content the World actually served (bot1 sessions of a matrix run)
// plus Talk-time questions straight from PG.Content.makeTalk.
//   node tests/sim/content_stats.js baseline
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./lib');
const PG = L.PG;
const name = process.argv[2] || 'baseline';
const D = JSON.parse(fs.readFileSync(path.join(__dirname, 'out', name + '.json'), 'utf8'));
const S = D.sessions.filter(s => s.content);
let md = `## Content variety (${S.length} bot1 sessions, ${S.reduce((a, s) => a + s.content.length, 0)} rounds)\n\n`;
function shareStr(counts) {
  const tot = Object.values(counts).reduce((a, b) => a + b, 0), e = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return { tot, max: e[0], min: e[e.length - 1], n: e.length, list: e.map(([k, v]) => `${k} ${(100 * v / tot).toFixed(0)}%`).join(', ') };
}
const byKey = {};
for (const s of S) {
  const ch = {};
  for (const c of s.content) (ch[c.level] = ch[c.level] || []).push(c);
  for (const lv in ch) {
    const rs = ch[lv], topic = rs[0].topic, key = s.age + ' ' + s.lang + ' ' + topic;
    const k = byKey[key] = byKey[key] || { age: s.age, lang: s.lang, topic, targets: {}, chapters: 0, sameConsec: 0, pairs: 0, distinct: [], needs: {}, pool: [] };
    k.chapters++;
    const dt = new Set();
    rs.forEach((r, i) => {
      k.targets[r.target] = (k.targets[r.target] || 0) + 1; dt.add(r.target);
      k.needs[r.need] = (k.needs[r.need] || 0) + 1; k.pool.push(r.pool.length);
      if (i > 0) { k.pairs++; if (rs[i - 1].target === r.target) k.sameConsec++; }
    });
    k.distinct.push(dt.size);
  }
}
const rows = [];
for (const k of Object.values(byKey).sort((a, b) => a.age - b.age || a.lang.localeCompare(b.lang))) {
  if (k.lang === 'vi' && !['letters', 'lower', 'initial'].includes(k.topic)) continue;
  const ts = shareStr(k.targets);
  rows.push([k.age, k.topic + (['letters', 'lower', 'initial'].includes(k.topic) ? ' (' + k.lang + ')' : ''), k.chapters, L.f1(L.mean(k.pool)), ts.n,
    L.f1(L.mean(k.distinct)), L.fp(k.pairs ? k.sameConsec / k.pairs : NaN), `${ts.max[0]} ${(100 * ts.max[1] / ts.tot).toFixed(0)}% / ${ts.min[0]} ${(100 * ts.min[1] / ts.tot).toFixed(0)}%`,
    Object.entries(k.needs).sort((a, b) => a[0] - b[0]).map(([n, c]) => n + ':' + c).join(' ')]);
}
md += '| age | topic | chapters | pool templates | target values seen | distinct targets / chapter | same target in consecutive rounds | most / least frequent target | need histogram |\n|---|---|---|---|---|---|---|---|---|\n';
md += rows.map(r => '| ' + r.join(' | ') + ' |').join('\n') + '\n';

md += '\n### Talk time (10 000 questions per age × topic, PG.Content.makeTalk)\n\n| age | topic | choices | answer values (share) |\n|---|---|---|---|\n';
for (const age of [3, 4, 5, 6, 7]) for (const topic of PG.Content.topicsFor(age)) {
  const cnt = {}; let nch = 0;
  const rng = new PG.RNG(age * 1000 + topic.length);
  for (let i = 0; i < 10000; i++) {
    const t = PG.Content.makeTalk(topic, { age, lang: 'en', rng });
    const a = t.choices.find(c => c.id === t.answerId).value; cnt[a] = (cnt[a] || 0) + 1; nch = t.choices.length;
  }
  const sh = shareStr(cnt);
  md += `| ${age} | ${topic} | ${nch} | ${sh.n} values; ${sh.list.length > 90 ? sh.list.slice(0, 90) + '…' : sh.list} |\n`;
}
fs.writeFileSync(path.join(__dirname, 'out', name + '.content.md'), md);
process.stdout.write(md);
