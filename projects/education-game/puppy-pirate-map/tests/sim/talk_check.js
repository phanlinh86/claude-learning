#!/usr/bin/env node
// Talk-time correctness (report-only): makeTalk for every age × topic × lang, N each; an independent matcher checks the
// answer is right and the ONLY right choice.   node tests/sim/talk_check.js [N=2000]
'use strict';
const L = require('./lib'); const TM = L.TM, C = TM.Content; const fs = require('fs'), vm = require('vm');
vm.runInThisContext(fs.readFileSync(require('../unit/load').resolve('i18n.js'), 'utf8'));
const N = +(process.argv[2] || 2000); let bad = 0, n = 0; const ex = [];
const right = (t, c, lang) => { const p = t.params, v = c.value, th = c.thing;
  switch (t.topic) {
    case 'colors': return v === p.color; case 'shapes': return v === p.shape && (!p.color || th.color === p.color); case 'size': return v === p.size;
    case 'animals': return v === p.animal; case 'count': return +v === +p.n; case 'letters': case 'lower': return String(v).toLowerCase() === String(p.letter).toLowerCase();
    case 'initial': return String(v) === String(p.letter) && String(p.letter) === String(TM.I18N.initialOf(lang, p.animal).first);
    case 'add': return +v === p.a + p.b; case 'sub': return +v === p.a - p.b; case 'oddeven': return (v % 2 === 1) === (p.parity === 'odd');
  } return null; };
for (const age of [3, 4, 5, 6, 7]) for (const topic of TM.AGE_POOLS[age]) for (const lang of ['en', 'vi']) {
  const rng = new TM.RNG(77 + age);
  for (let i = 0; i < N; i++) { const t = C.makeTalk(topic, { age, lang, rng }); n++;
    const ok = t.choices.map(c => right(t, c, lang)); const ans = t.choices.findIndex(c => c.id === t.answer);
    if (ok.filter(Boolean).length !== 1 || !ok[ans] || (topic === 'count' && t.show && t.show.n !== t.params.n)) { bad++; if (ex.length < 5) ex.push(JSON.stringify(t).slice(0, 300)); } }
}
console.log(`talks ${n}, wrong/ambiguous ${bad}`); ex.forEach(e => console.log(' ', e));
