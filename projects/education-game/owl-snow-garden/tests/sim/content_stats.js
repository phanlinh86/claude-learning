#!/usr/bin/env node
// Pedagogy / variety analysis of the content the World actually served (bot1 sessions of a matrix run)
// plus Talk-time questions straight from SG.Content.makeTalk.
//   node tests/sim/content_stats.js baseline
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./lib');
const SG = L.SG;
const name = process.argv[2] || 'baseline';
const D = JSON.parse(fs.readFileSync(path.join(__dirname, 'out', name + '.json'), 'utf8'));
const S = D.sessions.filter(s => s.content);
let md = `## Content variety (${S.length} sessions, ${S.reduce((a, s) => a + s.content.length, 0)} rounds)\n\n`;

const POOL = { colors: 6, shapes: 5, size: 2, animals: 9, letters: 20, lower: 20, initial: 9, add: null, sub: null, oddeven: 2, count: null };
function shareStr(counts) {
  const tot = Object.values(counts).reduce((a, b) => a + b, 0), e = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return { tot, max: e[0], min: e[e.length - 1], n: e.length, list: e.map(([k, v]) => `${k} ${(100 * v / tot).toFixed(0)}%`).join(', ') };
}

// per age × topic: label frequency, identical consecutive label sets, distinct values per chapter, item repeats
const rows = [];
const byKey = {};
for (const s of S) {
  const ch = {};
  for (const c of s.content) (ch[c.level] = ch[c.level] || []).push(c);
  for (const lv in ch) {
    const rs = ch[lv], topic = rs[0].topic, key = s.age + ' ' + s.lang + ' ' + topic;
    const k = byKey[key] = byKey[key] || { age: s.age, lang: s.lang, topic, labels: {}, items: {}, chapters: 0, sameConsec: 0, pairs: 0, distinctLabels: [], distinctItems: [], needs: {}, extras: {}, totalItems: [], samePosAnswer: 0 };
    k.chapters++;
    const dl = new Set(), di = new Set();
    rs.forEach((r, i) => {
      for (const v of r.labels) { k.labels[v] = (k.labels[v] || 0) + 1; dl.add(v); }
      for (const v of r.items) { k.items[v] = (k.items[v] || 0) + 1; di.add(v); }
      k.totalItems.push(r.items.length);
      if (r.need) { k.needs[r.need] = (k.needs[r.need] || 0) + 1; const ex = r.items.length - r.need; k.extras[ex] = (k.extras[ex] || 0) + 1; }
      if (i > 0) { k.pairs++; const a = rs[i - 1].labels.slice().sort().join(), b = r.labels.slice().sort().join(); if (a === b) k.sameConsec++; }
    });
    k.distinctLabels.push(dl.size); k.distinctItems.push(di.size);
  }
}
for (const k of Object.values(byKey).sort((a, b) => a.age - b.age || a.lang.localeCompare(b.lang))) {
  if (k.lang === 'vi' && !['letters', 'lower', 'initial'].includes(k.topic)) continue;   // language-neutral topics: en only
  const ls = shareStr(k.labels), is = shareStr(k.items);
  rows.push([k.age, k.topic + (['letters', 'lower', 'initial'].includes(k.topic) ? ' (' + k.lang + ')' : ''), k.chapters, L.f1(L.mean(k.totalItems)),
    ls.n + (POOL[k.topic] ? '/' + POOL[k.topic] : ''), L.f1(L.mean(k.distinctLabels)), L.fp(k.pairs ? k.sameConsec / k.pairs : NaN),
    `${ls.max[0]} ${(100 * ls.max[1] / ls.tot).toFixed(0)}% / ${ls.min[0]} ${(100 * ls.min[1] / ls.tot).toFixed(0)}%`, is.n, L.f1(L.mean(k.distinctItems)),
    `${is.max[0]} ${(100 * is.max[1] / is.tot).toFixed(1)}%`]);
}
md += '| age | topic | chapters | items/round | label values seen | distinct labels / chapter | identical pot set in consecutive rounds | most / least frequent label | item values seen | distinct items / chapter | most frequent item |\n|---|---|---|---|---|---|---|---|---|---|---|\n';
md += rows.map(r => '| ' + r.join(' | ') + ' |').join('\n') + '\n';

// count targets
md += '\n### Count targets (N) and extra seeds\n\n| age | N histogram (round 0 = warm-up included) | extras histogram | mean N |\n|---|---|---|---|\n';
for (const k of Object.values(byKey).filter(k => k.topic === 'count' && k.lang === 'en')) {
  const tot = Object.values(k.needs).reduce((a, b) => a + b, 0);
  const meanN = Object.entries(k.needs).reduce((a, [n, c]) => a + n * c, 0) / tot;
  md += `| ${k.age} | ${Object.entries(k.needs).sort((a, b) => a[0] - b[0]).map(([n, c]) => n + ':' + (100 * c / tot).toFixed(0) + '%').join(' ')} | ${Object.entries(k.extras).map(([n, c]) => '+' + n + ':' + (100 * c / tot).toFixed(0) + '%').join(' ')} | ${meanN.toFixed(1)} |\n`;
}

// talk time questions: answer distribution, number of choices, does the answer need reading?
md += '\n### Talk time (10 000 questions per age × topic, SG.Content.makeTalk)\n\n| age | topic | choices | answer values (share) | choice drawn as (ui.js _choiceVisual) |\n|---|---|---|---|---|\n';
const VISUAL = { color: 'seed picture + word', shape: 'shape picture + word', animal: 'animal badge + word', seed: 'seed picture', size: 'WORD ONLY ("big"/"small")', number: 'DIGIT ONLY', letter: 'letter', parity: 'WORD ONLY' };
for (const age of [3, 4, 5, 6, 7]) for (const topic of SG.Content.topicsFor(age)) {
  const cnt = {}; let nch = 0;
  const rng = new SG.RNG(age * 1000 + topic.length);
  for (let i = 0; i < 10000; i++) {
    const t = SG.Content.makeTalk(topic, { age, lang: 'en', rng });
    const a = t.choices.find(c => c.id === t.answerId).value; cnt[a] = (cnt[a] || 0) + 1; nch = t.choices.length;
  }
  const kind = SG.Content.makeTalk(topic, { age, lang: 'en', rng }).choices[0].kind;
  const sh = shareStr(cnt);
  md += `| ${age} | ${topic} | ${nch} | ${sh.n} values; ${sh.list.length > 90 ? sh.list.slice(0, 90) + '…' : sh.list} | ${VISUAL[kind] || kind} |\n`;
}

// size talk: one seed alone, scale 1.3 vs 0.72 — the judgement needs a reference
md += '\n';
fs.writeFileSync(path.join(__dirname, 'out', name + '.content.md'), md);
process.stdout.write(md);
