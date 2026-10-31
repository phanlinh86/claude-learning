#!/usr/bin/env node
// Checks every spoken line the rounds and Talk time can produce (both languages): prompt / item names / Talk question
// and choices resolve to real text (no key echo, no "{param}", no "undefined"), and the Talk answer matches the picture.
//   node tests/sim/pt_speech_check.js [seedsPerCell=400]
'use strict';
const L = require('./lib');
const { talkCheck } = require('./playtest');
const PG = L.PG, I = PG.I18N, C = PG.Content;
const N = +(process.argv[2] || 400);
const bad = (s, k) => !s || s === k || /\{|\}|undefined|NaN/.test(s);
const res = { rounds: 0, talks: 0, promptBad: {}, nameBad: {}, talkErr: {}, samples: {} };
const inc = (o, k) => { o[k] = (o[k] || 0) + 1; };
for (const lang of ['en', 'vi']) for (let age = 3; age <= 7; age++) for (const topic of C.topicsFor(age)) for (let s = 1; s <= N; s++) {
  const rng = new PG.RNG(s * 977 + age * 13 + topic.length);
  const r = C.makeRound(topic, { age, lang, rng, roundIndex: s % 4 }); res.rounds++;
  const p = I.t(lang, r.promptKey, r.params);
  if (bad(p, r.promptKey)) inc(res.promptBad, `${lang} ${age} ${topic}: ${p}`);
  if (s === 1) res.samples[`${lang} ${age} ${topic}`] = p;
  for (const t of r.pool) { const n = I.name(lang, t.nameKind, t.nameValue); if (bad(n, t.nameKind)) inc(res.nameBad, `${lang} ${t.nameKind}:${t.nameValue} → ${n}`); }
  const tk = C.makeTalk(topic, { age, lang, rng }); res.talks++;
  for (const e of talkCheck(PG, tk, age, lang)) inc(res.talkErr, `${lang} age ${age} ${topic}: ${e}`);
}
console.log(JSON.stringify({ rounds: res.rounds, talks: res.talks, promptBad: res.promptBad, nameBad: res.nameBad, talkErr: res.talkErr }, null, 1));
console.log('samples:'); for (const [k, v] of Object.entries(res.samples)) console.log('  ' + k + ' → ' + v);
