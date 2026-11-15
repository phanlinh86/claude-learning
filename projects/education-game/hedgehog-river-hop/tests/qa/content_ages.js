// QA (functional): every age's topic pool generates valid rounds + Talk questions (node, no browser).
//   node tests/qa/content_ages.js [seeds=60]
const fs = require('fs'), path = require('path'), vm = require('vm');
const G = path.join(__dirname, '..', '..', 'game', 'js');
const sb = { window: {}, console, Math, Date, JSON };
sb.window.NH = {}; sb.NH = sb.window.NH; vm.createContext(sb);
for (const f of ['rng.js', 'i18n.js', 'content.js']) vm.runInContext(fs.readFileSync(path.join(G, f), 'utf8'), sb, { filename: f });
const NH = sb.window.NH, C = NH.Content;
const seeds = +process.argv[2] || 60;
let ok = 0, bad = [], talks = 0, talkBad = [];
for (const age of [3, 4, 5, 6, 7]) {
  const pool = new Set([...(NH.AGE_POOLS[age] || []), ...(NH.AGE_TOPICS[age] || [])]);
  for (const topic of pool) for (const lang of ['en', 'vi']) for (let s = 1; s <= seeds; s++) {
    const rng = new NH.RNG(s * 7919 + age);
    let used = [], prevRule = null, prevFruit = null;
    for (let ri = 0; ri < 4; ri++) for (const maxK of [4, 3]) {
      try {
        const r = C.makeRound(topic, { age, lang, rng, roundIndex: ri, level: 0, surprise: null, usedKeys: used, prevRule, prevFruit, maxK });
        const v = C.validate(r);
        if (v) bad.push(`${age} ${topic} ${lang} s${s} r${ri} maxK${maxK}: ${v}`);
        else ok++;
        // one target per row, independent of validate()
        r.rows.forEach((row, j) => { const n = row.filter(x => x.target).length; if (n !== 1) bad.push(`${age} ${topic} row ${j} has ${n} targets`); });
        if (r.k > maxK) bad.push(`${age} ${topic} k ${r.k} > maxK ${maxK}`);
        const pr = NH.I18N.ask(lang, r.promptKey, r.params, { first: ri === 0 });
        if (!pr || /\{|undefined|NaN/.test(pr)) bad.push(`${age} ${topic} ${lang} bad prompt "${pr}"`);
        if (maxK === 4) { used.push(r.key); prevRule = { kind: r.rule.kind, value: r.rule.value }; prevFruit = r.fruit; }
      } catch (e) { bad.push(`${age} ${topic} ${lang} s${s} r${ri}: THROW ${e.message}`); }
    }
    try {
      const t = C.makeTalk(topic, { age, lang, rng, level: 0 });
      talks++;
      if (!t.choices || !t.choices.some(c => c.id === t.answer)) talkBad.push(`${age} ${topic} ${lang}: answer not in choices`);
      const ids = t.choices.map(c => c.id); if (new Set(ids).size !== ids.length) talkBad.push(`${age} ${topic}: duplicate choice ids`);
    } catch (e) { talkBad.push(`${age} ${topic} ${lang}: THROW ${e.message}`); }
  }
}
console.log(`rounds valid ${ok}, invalid ${bad.length}; talks ${talks}, bad ${talkBad.length}`);
[...bad.slice(0, 20), ...talkBad.slice(0, 20)].forEach(l => console.log('  ' + l));
process.exit(bad.length || talkBad.length ? 1 : 0);
