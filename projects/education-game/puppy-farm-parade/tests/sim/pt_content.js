#!/usr/bin/env node
// Bo's Farm Parade — QA content-stream statistics (report-only). Replays the world's content calls exactly (world.js
// newSession / startLevel / _beginRound: topicsFor with lastTopics, makeRound with usedKeys / prevRule / prevRuleRun /
// prevOddSlot carried across chapters, reset per session) for many "Play again" chains, without the physics, so it can run
// 100 000s of rounds. Measures the odd one's slot spread, positional strategies (first-tap success), and variety.
//   node tests/sim/pt_content.js [--chains 2000] [--chain 3] [--ages 3,4,5,6,7] [--patch slots,oddwild,oddcol] [--tag base]
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const L = require('./lib');
const FP = L.FP, C = FP.Content;
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', '..', 'game', 'js', 'i18n.js'), 'utf8'), { filename: 'i18n.js' });
const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const CHAINS = +get('chains', 2000), CHAIN = +get('chain', 3), AGES = get('ages', '3,4,5,6,7').split(',').map(Number), TAG = get('tag', 'base');
const PATCH = (get('patch', '') || '').split(',').filter(Boolean);

// the same sim-only patches as pt_playtest.js
let makeRound = C.makeRound.bind(C);
if (PATCH.length) {
  const orig = C.makeRound.bind(C); let lastOdd = {}, relRun = { rel: '', n: 0 };
  makeRound = (topic, o) => {
    if (o.roundIndex === 0) lastOdd = { animals: new Set(), colors: new Set() };
    let r;
    for (let a = 0; a < 40; a++) {
      r = orig(topic, Object.assign({}, o, PATCH.includes('slots') ? { prevOddSlot: -1 } : {}));
      const odd = r.members.find(m => m.odd).thing;
      if (PATCH.includes('oddwild') && r.rule.kind === 'home' && lastOdd.animals.has(odd.animal) && a < 39) continue;
      if (PATCH.includes('oddcol') && topic === 'colors' && lastOdd.colors.has(odd.color) && a < 39) continue;
      break;
    }
    if (PATCH.includes('slots')) {
      const n = r.members.length, rng = o.rng, rel = x => x;
      let s = rng.int(0, n - 1);
      for (let t = 0; t < 20 && relRun.n >= 2 && rel(s) === relRun.rel; t++) s = rng.int(0, n - 1);
      relRun = rel(s) === relRun.rel ? { rel: rel(s), n: relRun.n + 1 } : { rel: rel(s), n: 1 };
      const oddT = r.members.find(m => m.odd).thing, maj = r.members.map(m => m.thing).filter(t => t !== oddT);
      r.members = []; let j = 0;
      for (let k = 0; k < n; k++) r.members.push({ id: 'm' + k, slot: k, thing: k === s ? oddT : maj[j++], odd: k === s });
      r.oddId = 'm' + s; r.oddSlot = s; r.key = C.roundKey(r);
      const e = C.validate(r); if (e) throw new Error(e);
    }
    const odd = r.members.find(m => m.odd).thing; if (odd.animal) lastOdd.animals.add(odd.animal); if (odd.color) lastOdd.colors.add(odd.color);
    return r;
  };
}

const out = [];
for (const age of AGES) {
  const st = { rounds: 0, slots: {}, slotByRi: {}, pos: { left: 0, right: 0, mid: 0, second: 0, exploit: 0, notLast: 0, chance: 0 }, pairs: 0, sameRel: 0, sameSlot: 0,
    sameOdd: 0, sameRule: 0, colPairs: 0, sameOddCol: 0, sameMajCol: 0, wildPairs: 0, sameWild: 0, wildChap: [], cross: 0, crossN: 0, firstSame: 0, chainN: 0, overlap: 0,
    topicSeq: {}, chapTopics: {}, sizeThing: 0, sizePairs: 0, shapePairs: {}, countPairs: {}, chapRepOdd: 0, chaps: 0, oddColors: {}, majColors: {} };
  for (let c = 0; c < CHAINS; c++) {
    const rng = new FP.RNG(77 + c * 101 + age * 7); let last = null, prevSess = null;
    for (let si = 0; si < CHAIN; si++) {
      const levels = C.topicsFor(age, rng, last); rng.int(0, 1);   // _surpriseOff
      st.topicSeq[levels.join(',')] = (st.topicSeq[levels.join(',')] || 0) + 1;
      let prevRule = null, run = 0, prevSlot = -1, prevR = null; const sess = [];
      for (let lv = 0; lv < 4; lv++) {
        const topic = levels[lv]; rng.int(0, 1);   // _surpriseRound
        const used = [], chapOdd = [];
        for (let ri = 0; ri < 4; ri++) {
          const rr = new FP.RNG((rng.next() * 4294967296) >>> 0);
          const r = makeRound(topic, { age, lang: c % 2 ? 'vi' : 'en', rng: rr, roundIndex: ri, level: lv, short: false, usedKeys: used, prevRule, prevRuleRun: run, prevOddSlot: prevSlot });
          used.push(r.key); sess.push(r.key); st.rounds++;
          const n = r.members.length, s = r.oddSlot, odd = r.members.find(m => m.odd).thing, maj = r.members.find(m => !m.odd).thing;
          (st.slots[n] = st.slots[n] || Array(n).fill(0))[s]++;
          const kk = ri + ':' + n; (st.slotByRi[kk] = st.slotByRi[kk] || Array(n).fill(0))[s]++;
          st.pos.left += s === 0; st.pos.right += s === n - 1; st.pos.mid += s === Math.floor((n - 1) / 2); st.pos.second += s === 1; st.pos.chance += 1 / n;
          const cand = []; for (let q = 1; q < n - 1; q++) if (q !== prevSlot) cand.push(q);
          const c2 = cand.length ? cand : [0, n - 1].filter(q => q !== prevSlot);
          st.pos.exploit += c2.includes(s) ? 1 / c2.length : 0;
          const nl = []; for (let q = 0; q < n; q++) if (q !== prevSlot) nl.push(q);
          st.pos.notLast += nl.includes(s) ? 1 / nl.length : 0;
          if (topic === 'colors') { st.oddColors[odd.color] = (st.oddColors[odd.color] || 0) + 1; st.majColors[maj.color] = (st.majColors[maj.color] || 0) + 1; }
          if (topic === 'shapes') { const k = r.rule.value + '/' + odd.shape; st.shapePairs[k] = (st.shapePairs[k] || 0) + 1; }
          if (topic === 'count') { const k = r.rule.value + '/' + odd.n; st.countPairs[k] = (st.countPairs[k] || 0) + 1; }
          if (prevR && ri > 0) {
            const rel = (x, m) => (x === 0 ? 'L' : x === m - 1 ? 'R' : 'M');
            st.pairs++; st.sameRel += rel(prevR.oddSlot, prevR.members.length) === rel(s, n); st.sameSlot += prevR.oddSlot === s;
            const po = prevR.members.find(m => m.odd).thing, pm = prevR.members.find(m => !m.odd).thing;
            st.sameOdd += C.thingKey(po) === C.thingKey(odd); st.sameRule += String(prevR.rule.value) === String(r.rule.value) && prevR.rule.kind === r.rule.kind;
            if (topic === 'colors') { st.colPairs++; st.sameOddCol += po.color === odd.color; st.sameMajCol += pm.color === maj.color; }
            if (r.rule.kind === 'home' && prevR.rule.kind === 'home') { st.wildPairs++; st.sameWild += po.animal === odd.animal; }
            if (topic === 'size') { st.sizePairs++; st.sizeThing += (pm.obj || pm.animal) === (maj.obj || maj.animal); }
          }
          chapOdd.push(C.thingKey(odd));
          prevRule = r.rule; run = prevR && String(prevR.rule.value) === String(r.rule.value) ? run + 1 : 1; prevSlot = s; prevR = r;
        }
        st.chaps++; if (new Set(chapOdd).size < chapOdd.length) st.chapRepOdd++;
        prevR = null;   // a new chapter (keep prevRule / prevSlot like the world)
      }
      if (prevSess) { const A = new Set(prevSess.keys); st.crossN += sess.length; st.cross += sess.filter(k => A.has(k)).length; st.chainN++; st.firstSame += prevSess.levels[0] === levels[0]; st.overlap += levels.filter(t => prevSess.levels.includes(t)).length; }
      prevSess = { keys: sess, levels }; last = levels;
    }
  }
  const pc = (a, b) => (a / Math.max(1, b) * 100).toFixed(1), spread = a => { const t = a.reduce((x, y) => x + y, 0); return a.map(v => (v / t * 100).toFixed(0)).join('/'); };
  const top = (o, k) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, k).map(([x, v]) => x + ' ' + v).join(', ');
  out.push({ age, rounds: st.rounds, slots: Object.fromEntries(Object.entries(st.slots).map(([n, a]) => [n, spread(a)])), slotByRi: Object.fromEntries(Object.entries(st.slotByRi).map(([n, a]) => [n, spread(a)])),
    pos: Object.fromEntries(Object.entries(st.pos).map(([k, v]) => [k, pc(v, st.rounds)])),
    sameRel: pc(st.sameRel, st.pairs), sameSlot: pc(st.sameSlot, st.pairs), sameOdd: pc(st.sameOdd, st.pairs), sameRule: pc(st.sameRule, st.pairs),
    sameOddCol: pc(st.sameOddCol, st.colPairs), sameMajCol: pc(st.sameMajCol, st.colPairs), sameWild: pc(st.sameWild, st.wildPairs), sizeSameThing: pc(st.sizeThing, st.sizePairs),
    chapRepOdd: pc(st.chapRepOdd, st.chaps), cross: pc(st.cross, st.crossN), firstSame: pc(st.firstSame, st.chainN), overlap: (st.overlap / Math.max(1, st.chainN)).toFixed(2),
    topicSeqs: top(st.topicSeq, 6), oddColors: top(st.oddColors, 7), majColors: top(st.majColors, 7), shapes: top(st.shapePairs, 8) + ` (${Object.keys(st.shapePairs).length} pairs)`, counts: top(st.countPairs, 8) + ` (${Object.keys(st.countPairs).length} pairs)` });
}
const md = [`# pt_content ${TAG} — ${CHAINS} chains × ${CHAIN} sessions per age, patch [${PATCH.join(',')}]`, '',
  '| age | rounds | odd slot spread n=3 / n=4 / n=5 (% per slot, left→right) | first tap right %: left / 2nd / middle / right / "inside, not last index" / "not last index" / chance | same place L/in/R in a row % | same slot index in a row % |', '|---|---|---|---|---|---|'];
for (const r of out) md.push(`| ${r.age} | ${r.rounds} | ${r.slots[3] || '–'} · ${r.slots[4] || '–'} · ${r.slots[5] || '–'} | ${r.pos.left} / ${r.pos.second} / ${r.pos.mid} / ${r.pos.right} / **${r.pos.exploit}** / ${r.pos.notLast} / ${r.pos.chance} | ${r.sameRel} | ${r.sameSlot} |`);
md.push('', '| age | same ask value in a row % | same odd thing in a row % | chapter with a repeated odd thing % | colours: same odd colour / same friends colour in a row % | farm: same wild animal in a row % | size: same thing in a row % | sets seen last session % | same 1st topic as last session % | topics shared (of 4) |', '|---|---|---|---|---|---|---|---|---|---|');
for (const r of out) md.push(`| ${r.age} | ${r.sameRule} | ${r.sameOdd} | ${r.chapRepOdd} | ${r.sameOddCol} / ${r.sameMajCol} | ${r.sameWild} | ${r.sizeSameThing} | ${r.cross} | ${r.firstSame} | ${r.overlap} |`);
md.push('', '| age | topic sequences (top 6) | odd colours | friends colours | shape pairs friends/odd (top 8) | count pairs friends/odd (top 8) |', '|---|---|---|---|---|---|');
for (const r of out) md.push(`| ${r.age} | ${r.topicSeqs} | ${r.oddColors} | ${r.majColors} | ${r.shapes} | ${r.counts} |`);
md.push('', 'Slot spread by round index (ri:n → % per slot):', '');
for (const r of out) md.push(`- age ${r.age}: ` + Object.entries(r.slotByRi).sort().map(([k, v]) => `${k} ${v}`).join(' · '));
const text = md.join('\n');
console.log(text);
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'out', 'pt_content_' + TAG + '.md'), text + '\n');
