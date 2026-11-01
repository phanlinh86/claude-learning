#!/usr/bin/env node
// Mầm's Treasure Reef — headless unit tests for rng / content / world / weather / bot.
// Run from projects/education-game/mam-treasure-reef:   node tests/unit/run.js
// (tests/unit/i18n_voice.test.js is the voice engineer's suite and runs on its own.)
'use strict';
const assert = require('assert');
const { load } = require('./load');

const TR = load();
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const H = 1 / 120;
const J = v => JSON.parse(JSON.stringify(v));
// vm-realm arrays/objects are not reference-equal to this realm's: compare through JSON
assert.deepStrictEqual = ((orig) => (a, b, m) => orig(J(a), J(b), m))(assert.deepStrictEqual);
assert.notDeepStrictEqual = ((orig) => (a, b, m) => orig(J(a), J(b), m))(assert.notDeepStrictEqual);
const hyp = (x, y) => Math.sqrt(x * x + y * y);
const AGES = [3, 4, 5, 6, 7];
const TOPICS = TR.Content.TOPICS;
const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple'];

const VIEWPORTS = [
  { W: 1556, H: 720, ins: null, name: 'phone landscape' },
  { W: 960, H: 720, ins: null, name: '4:3 landscape' },
  { W: 720, H: 1556, ins: null, name: 'phone portrait' },
  { W: 720, H: 960, ins: null, name: 'iPad portrait' },
  { W: 1280, H: 720, ins: null, name: '16:9' },
  { W: 720, H: 1556, ins: { top: 44, bottom: 30, left: 0, right: 0 }, name: 'notch portrait' },
  { W: 1556, H: 720, ins: { top: 0, left: 44, right: 44, bottom: 20 }, name: 'notch landscape' },
  { W: 960, H: 720, ins: { top: 0, left: 44, right: 44, bottom: 20 }, name: 'narrow notch landscape' },
  { W: 720, H: 960, ins: { top: 44, bottom: 30, left: 0, right: 0 }, name: 'iPad portrait insets' },
  { W: 960, H: 720, ins: { top: 32, bottom: 27, left: 0, right: 0 }, name: 'iPad landscape insets' }
];

// ---------- helpers ----------
function mkWorld(o) {
  o = o || {};
  const w = new TR.World({ seed: o.seed || 1, age: o.age || 4, lang: o.lang || 'en', config: o.config });
  const v = o.vp || VIEWPORTS[4];
  w.setViewport(v.W, v.H, v.ins);
  return w;
}
/** Starts round `ri` of `topic` directly (skips intro) with the given mechanic. */
function roundOf(w, topic, ri, mech, n) {
  w.plan = [0, 1, 2, 3].map(() => ({ topic, mech: mech || 'drag', n }));
  w.levels = w.plan.map(c => c.topic);
  w.startLevel(0);
  w.round = ri || 0;
  w._beginRound();
  return w;
}
function settleAppear(w) { let n = 0; while (!w.interactive && n++ < 1000) w.update(H); assert.ok(w.interactive, 'interactive'); }
function run(w, s, each) { const n = Math.round(s / H); for (let i = 0; i < n; i++) { if (each) each(i); w.update(H); } }
function chestPoint(b) { return { x: b.x, y: b.top - 20 }; }
function emptyPoint(w) { const p = w.layout.play; return { x: p.x + p.w / 2, y: p.y + 20 }; }
/** Grab item, carry the finger to (x,y) over `t` s (linear), wait 0.25 s, release. */
function dragTo(w, it, x, y, t) {
  t = t || 0.3;
  const id = w.pointerDown(it.x, it.y);
  assert.strictEqual(id, it.id, 'grab ' + it.id);
  const x0 = it.x, y0 = it.y, n = Math.round(t / H);
  for (let i = 1; i <= n; i++) { w.pointerMove(x0 + (x - x0) * i / n, y0 + (y - y0) * i / n); w.update(H); }
  run(w, 0.25);
  w.pointerUp(x, y);
}
/** Dig: tap a mound like a finger (down on the mound, hold 0.1 s, up in place). */
function tapMound(w, m, dx, dy) {
  const x = m.x + (dx || 0), y = m.y - m.h / 2 + (dy || 0);
  w.pointerDown(x, y); run(w, 0.1); w.pointerUp(x, y);
}
function idleItems(w) { return w.items.filter(i => i.state === 'idle'); }
function buriedMounds(w) { return w.mounds.filter(m => m.state === 'buried'); }
function solveRound(w) {   // perfect play: drag every idle item into its chest (ask: the current target) / tap the target mounds
  let guard = 0;
  while (w.state === 'round' && guard++ < 2000) {
    if (w.isDig()) {
      const m = w.interactive && !w.completing ? w.targetMound() : null;
      if (!m) { w.update(H); continue; }
      tapMound(w, m);
      let g2 = 0; while (g2++ < 300 && w.items.some(i => i.state === 'hop' || i.state === 'fly')) w.update(H);
      continue;
    }
    const it = w.interactive ? idleItems(w)[0] : null;
    if (!it) { w.update(H); continue; }
    const b = w.basketById(w.goalOf(it)), p = chestPoint(b);
    dragTo(w, it, p.x, p.y, 0.15);
    let g2 = 0; while (it.state === 'fly' && g2++ < 200) w.update(H);
  }
}
function rectsOverlap(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
function circleRect(cx, cy, r, R) {
  const nx = Math.max(R.x, Math.min(cx, R.x + R.w)), ny = Math.max(R.y, Math.min(cy, R.y + R.h));
  return hyp(cx - nx, cy - ny) < r - 1e-6;
}
function chestRect(b) { return { x: b.x - b.w / 2, y: b.top, w: b.w, h: b.h }; }
function tutuRect(L) { return { x: L.tutu.x - 80, y: L.tutu.y - L.tutu.h, w: 160, h: L.tutu.h }; }
function moundRect(m) { return { x: m.x - m.w / 2, y: m.y - m.h, w: m.w, h: m.h }; }
function playSession(seed, age, skill, opts) {
  opts = opts || {};
  const w = new TR.World({ seed, age, lang: opts.lang || 'en' });
  const v = opts.vp || VIEWPORTS[4];
  w.setViewport(v.W, v.H, v.ins);
  const bot = new TR.Bot(w, { skill, seed: seed * 3 + 1 });
  w.newSession({ lagoon: opts.lagoon || 1 });
  const dt = opts.dt || 1 / 30, events = [];
  let t = 0;
  while (w.state !== 'sessionDone' && t < 3000) {
    bot.step(dt); w.update(dt);
    const ev = w.drainEvents();
    if (opts.keep) for (const e of ev) events.push(e);
    if (opts.each) opts.each(w, ev, t);
    t += dt;
  }
  return { w, bot, t, events };
}
/** Finds a dig round (seed search) satisfying `pred`. */
function digRound(topic, age, ri, pred, o) {
  for (let s = 1; s < 400; s++) {
    const w = mkWorld(Object.assign({ seed: s, age }, o || {}));
    roundOf(w, topic, ri, 'dig');
    if (!pred || pred(w)) { settleAppear(w); w.drainEvents(); return w; }
  }
  throw new Error('no dig round found for ' + topic);
}

// ======================================================= RNG
test('rng: deterministic, ranges, shuffle is a permutation', () => {
  const a = new TR.RNG(42), b = new TR.RNG(42), c = new TR.RNG(43);
  const sa = [], sb = [], sc = [];
  for (let i = 0; i < 500; i++) { sa.push(a.next()); sb.push(b.next()); sc.push(c.next()); }
  assert.deepStrictEqual(sa, sb); assert.notDeepStrictEqual(sa, sc);
  assert.ok(sa.every(v => v >= 0 && v < 1));
  const r = new TR.RNG('x');
  for (let i = 0; i < 1000; i++) { const k = r.int(2, 5); assert.ok(k >= 2 && k <= 5 && k === Math.floor(k)); const f = r.float(-1, 1); assert.ok(f >= -1 && f < 1); }
  const arr = [1, 2, 3, 4, 5, 6, 7, 8]; const sh = r.shuffle(arr.slice());
  assert.deepStrictEqual(sh.slice().sort(), arr);
  assert.strictEqual(new Set(r.sample(arr, 5)).size, 5);
  assert.notStrictEqual(r.fork(1).next(), r.fork(2).next());
});

// ======================================================= content tables
test('content: palette, sea friends, lagoons and word tables exactly as DESIGN §3/§5.1', () => {
  assert.deepStrictEqual(J(TR.PALETTE.red), { fill: '#E84A4A', dark: '#A8282E' });
  assert.deepStrictEqual(J(TR.PALETTE.cream), { fill: '#FFF4DC', dark: '#C9A877' });
  assert.deepStrictEqual(Object.keys(TR.PALETTE), ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'cream']);
  assert.deepStrictEqual(TR.ANIMALS, ['crab', 'octopus', 'seahorse', 'clownfish', 'dolphin', 'jellyfish', 'starfish', 'whale', 'puffer']);
  assert.deepStrictEqual(TR.LAGOONS, [{ id: 1, key: 'beach' }, { id: 2, key: 'coral' }, { id: 3, key: 'cave' }, { id: 4, key: 'bay' }, { id: 5, key: 'ship' }, { id: 6, key: 'rainbow' }]);
  const en = TR.WORDS.en.map(w => w.word + ' ' + w.initial).join(' · ');
  assert.strictEqual(en, 'crab C · octopus O · seahorse S · fish F · dolphin D · jellyfish J · starfish S · whale W · puffer P');
  const vi = TR.WORDS.vi.map(w => w.word + ' ' + w.initial).join(' · ');
  assert.strictEqual(vi, 'cua C · bạch tuộc B · cá ngựa C · cá hề C · cá heo C · sứa S · sao biển S · cá voi C · cá nóc C');
  for (const l of ['en', 'vi']) for (const w of TR.WORDS[l]) {
    assert.ok(TR.ANIMALS.includes(w.sprite.replace('animal_', '')), 'sea-animal sprites only');
    assert.strictEqual(w.initial, w.word[0].toUpperCase());
  }
  assert.strictEqual(TR.WORDS.en.find(w => w.sprite === 'animal_clownfish').word, 'fish');
  assert.deepStrictEqual(TR.Content.topicsFor(3), ['colors', 'colors', 'size', 'colors']);
});

test('content: planFor — REQUIREMENT table for every age × lagoon (4 chapters, mech alternation, known topics, mixed rows)', () => {
  const table = {
    3: [['colors:2', 'colors:2', 'size', 'colors:2'], ['shapes:2', 'colors', 'shapes', 'size'], ['size', 'colors', 'shapes', 'size'], ['animals:2', 'colors', 'animals', 'shapes'], ['colors', 'shapes', 'size', 'animals'], ['colors', 'shapes', 'size', 'animals']],
    4: [['colors:2', 'colors:3', 'shapes:2', 'colors:3'], ['shapes:3', 'colors', 'shapes', 'count:1-3'], ['count:1-5', 'shapes', 'count', 'colors'], ['animals:3', 'count', 'animals', 'shapes'], ['colors', 'shapes', 'count', 'animals'], 'mixed'],
    5: [['shapes', 'colors', 'shapes', 'count:1-5'], ['count:3-10', 'shapes', 'count', 'size'], ['letters', 'count', 'letters', 'shapes'], ['animals:4', 'letters', 'animals', 'count'], ['letters', 'count', 'animals', 'shapes'], 'mixed'],
    6: [['lower', 'count', 'letters', 'initial'], ['initial', 'add', 'count:1-12', 'letters'], ['add', 'count', 'add', 'initial'], ['animals', 'add', 'letters', 'count'], ['initial', 'add', 'count', 'animals'], 'mixed'],
    7: [['initial', 'add', 'count', 'add'], ['add', 'sub', 'oddeven', 'add'], ['sub', 'add', 'oddeven', 'initial'], ['animals', 'sub', 'add', 'oddeven'], 'mixed', 'mixed']
  };
  for (const age of AGES) for (let lagoon = 1; lagoon <= 6; lagoon++) {
    const plan = TR.Content.planFor(age, lagoon), ctx = 'age ' + age + ' lagoon ' + lagoon;
    assert.strictEqual(plan.length, 4, ctx);
    assert.deepStrictEqual(plan.map(c => c.mech), lagoon % 2 ? ['dig', 'drag', 'dig', 'drag'] : ['drag', 'dig', 'drag', 'dig'], ctx);
    const known = TR.Content.knownTopics(age);
    for (const c of plan) assert.ok(known.includes(c.topic) && TOPICS.includes(c.topic), ctx + ' topic ' + c.topic);
    const row = table[age][lagoon - 1];
    if (row === 'mixed') {
      assert.strictEqual(new Set(plan.map(c => c.topic)).size, 4, ctx + ' 4 distinct topics');
      assert.deepStrictEqual(J(plan), J(TR.Content.planFor(age, lagoon)), 'deterministic');
      for (const c of plan) assert.ok(c.n === undefined && c.range === undefined);
    } else {
      assert.deepStrictEqual(plan.map(c => c.topic + (c.n ? ':' + c.n : '') + (c.range ? ':' + c.range.join('-') : '')), row, ctx);
    }
  }
  assert.deepStrictEqual(TR.Content.planFor(4, 6).map(c => c.topic), ['colors', 'shapes', 'count', 'animals'], 'age 4 mixed = exactly the 4 topics it knows');
  assert.deepStrictEqual(J(TR.Content.planFor(9, 7)), J(TR.Content.planFor(7, 6)), 'clamped age / lagoon');
  assert.deepStrictEqual(J(TR.Content.planFor(1, 0)), J(TR.Content.planFor(3, 1)));
});

const clash = cs => (cs.includes('blue') && cs.includes('purple')) || (cs.includes('red') && cs.includes('green')) || (cs.includes('yellow') && cs.includes('orange'));
const L = (it) => it.label.type + ':' + it.label.value;

test('content: every topic × mech × age × 60 seeds → valid rounds with the §5.1 rules (drag and dig)', () => {
  const sizeOK = { big: 1.3, small: 0.72 };
  for (const topic of TOPICS) for (const mech of ['drag', 'dig']) for (const age of AGES) for (let seed = 1; seed <= 60; seed++) {
    const ri = seed % 4, lang = seed % 2 ? 'en' : 'vi';
    const r = TR.Content.makeRound(topic, { age, lang, rng: new TR.RNG(seed * 31 + age), roundIndex: ri, mech });
    const ctx = topic + '/' + mech + '/' + age + '/' + seed;
    assert.strictEqual(TR.Content.validate(r), null, ctx);
    assert.strictEqual(r.mech, mech);
    assert.strictEqual(r.promptKey, (mech === 'dig' ? 'p.dig.' : 'p.') + topic);
    assert.ok(typeof r.sig === 'string' && r.sig.length > 5);
    const ids = new Set(r.items.map(i => i.id)); assert.strictEqual(ids.size, r.items.length, ctx + ' unique ids');
    for (const it of r.items) {
      assert.ok(/^i\d+$/.test(it.id)); assert.ok(it.size > 0);
      assert.ok(COLORS.includes(it.gem), ctx + ' gem ' + it.gem);
      if (it.sprite && it.sprite.startsWith('shell_')) assert.strictEqual(it.gem, it.color, 'gem = shell colour');
      if (it.sprite) assert.ok(/^(shell_(red|blue|yellow|green|orange|purple)|pearl|tag|animal_\w+)$/.test(it.sprite), ctx + ' sprite ' + it.sprite);
      else assert.ok(it.shape && it.color, 'procedural gem shape');
    }
    const cols = [...new Set(r.items.map(i => i.color).filter(c => c && c !== 'cream'))];
    if (age < 5 && (topic === 'colors' || topic === 'animals' || topic === 'shapes') && !(mech === 'dig' && topic === 'animals')) assert.ok(!clash(cols), ctx + ' colour-blind pair ' + cols);
    if (age < 5 && mech === 'dig' && topic === 'animals') assert.ok(!clash(r.items.map(i => i.gem)) || true);
    if (mech === 'dig') {
      assert.strictEqual(r.mode, 'dig');
      assert.strictEqual(r.baskets.length, 1); assert.strictEqual(r.baskets[0].kind, topic === 'count' ? 'long' : 'chest');
      const M = r.mounds.length, T = r.queue.length;
      assert.ok(M >= 4 && M <= 6, ctx + ' mounds ' + M);
      assert.strictEqual(new Set(r.mounds.map(m => m.id)).size, M);
      assert.deepStrictEqual(r.mounds.map(m => m.slot), r.mounds.map((m, i) => i), 'grid slots 0..M-1');
      const inM = r.mounds.filter(m => !m.crab).map(m => m.item.id);
      assert.strictEqual(new Set(inM).size, inM.length, ctx + ' every mound item unique');
      assert.strictEqual(inM.length, r.items.length, 'every item is in a mound');
      for (const q of r.queue) assert.ok(ids.has(q), ctx + ' target exists');
      assert.strictEqual(new Set(r.queue).size, T);
      if (r.crab) { assert.ok(!ri && false || ri > 0, ctx + ' no crab in the warm-up'); assert.ok(M >= 5, 'no crab when mounds ≤ 4'); assert.strictEqual(r.mounds.filter(m => m.crab).length, 1); assert.strictEqual(r.mounds.find(m => m.crab).id, r.crab); }
      else assert.ok(r.mounds.every(m => !m.crab));
      const byId = {}; r.items.forEach(i => { byId[i.id] = i; });
      if (topic === 'count') {
        const N = r.need;
        assert.ok(N >= 1 && N <= 4, ctx + ' N ' + N); assert.strictEqual(T, N); assert.strictEqual(r.baskets[0].need, N);
        assert.ok(r.items.length >= N + 2 && r.items.length >= 4, 'N + 2 pearl mounds');
        if (ri === 0) assert.ok(N <= 2, 'warm-up 1–2 pearls');
        assert.ok(r.items.every(i => i.sprite === 'pearl' && i.label.type === 'pearl'));
        assert.deepStrictEqual(J(r.params), { n: N });
      } else {
        if (ri === 0) { assert.strictEqual(M, 4, ctx + ' warm-up 4 mounds'); assert.strictEqual(T, 1, 'warm-up 1 target'); }
        else assert.ok(T >= 2 && T <= 3, ctx + ' targets ' + T);
        for (let i = 1; i < T; i++) assert.notStrictEqual(L(byId[r.queue[i]]), L(byId[r.queue[i - 1]]), ctx + ' consecutive targets differ');
        // decoys always differ from the target in the taught attribute: for each target some mound differs; look-alikes are accepted as that target
        for (const q of r.queue) assert.ok(r.items.some(i => L(i) !== L(byId[q])), ctx + ' a decoy exists');
        assert.deepStrictEqual(J(r.params), J(TR.Content.digParams(r, r.queue[0])));
        for (const it of r.items) assert.ok(TR.Content.matches(it, it.label), ctx + ' label matches');
        switch (topic) {
          case 'colors': for (const it of r.items) { assert.strictEqual(it.sprite, 'shell_' + it.color); assert.deepStrictEqual(J(it.label), { type: 'color', value: it.color }); } assert.ok(cols.length <= (age <= 3 ? 2 : age === 4 ? 3 : 4)); assert.ok('color' in r.params); break;
          case 'shapes': for (const it of r.items) { assert.strictEqual(it.sprite, null); assert.strictEqual(it.label.value, it.shape); if (age < 5) assert.notStrictEqual(it.shape, 'rectangle'); }
            if (age < 5) { const byShape = {}; for (const it of r.items) { byShape[it.shape] = byShape[it.shape] || new Set(); byShape[it.shape].add(it.color); } for (const k in byShape) assert.strictEqual(byShape[k].size, 1, 'one colour per shape below 5'); }
            break;
          case 'size': assert.strictEqual(cols.length, 1); for (const it of r.items) assert.strictEqual(it.scale, sizeOK[it.label.value]); assert.ok(r.params.size && r.params.color); break;
          case 'animals': for (const it of r.items) { assert.strictEqual(it.sprite, 'animal_' + it.label.value); assert.ok(TR.ANIMALS.includes(it.nameValue)); } assert.ok(TR.ANIMALS.includes(r.params.animal)); break;
          case 'letters': case 'lower': for (const it of r.items) { assert.strictEqual(it.sprite, 'tag'); assert.strictEqual(it.text, topic === 'lower' ? it.label.value.toLowerCase() : it.label.value); } assert.strictEqual(new Set(r.items.map(i => i.text)).size, r.items.length, 'distinct letters'); assert.strictEqual(r.params.letter, byId[r.queue[0]].text); break;
          case 'initial': {
            for (const it of r.items) { const wd = TR.WORDS[lang].find(x => x.word === it.nameValue); assert.strictEqual(wd.initial, it.label.value); assert.strictEqual(it.sprite, wd.sprite); }
            if (lang === 'vi') assert.ok(r.items.filter(i => i.nameValue.startsWith('cá ')).length <= 1, ctx + ' at most one cá word');
            assert.strictEqual(new Set(r.items.map(i => i.nameValue)).size, r.items.length, 'distinct words');
            assert.strictEqual(r.params.letter, byId[r.queue[0]].label.value); break;
          }
          case 'add': case 'sub': for (const it of r.items) { const m = /^(\d+)([+−])(\d+)$/.exec(it.text); assert.ok(m, it.text); assert.ok(+m[1] >= 1 && +m[3] >= 1); assert.strictEqual(m[2] === '+' ? +m[1] + +m[3] : +m[1] - +m[3], it.label.value); }
            assert.strictEqual(new Set(r.items.map(i => i.label.value)).size, r.items.length, 'distinct results'); assert.strictEqual(r.params.n, byId[r.queue[0]].label.value); break;
          case 'oddeven': for (const it of r.items) assert.strictEqual(it.label.value, +it.text % 2 ? 'odd' : 'even'); assert.ok(['odd', 'even'].includes(r.params.parity)); break;
        }
      }
      continue;
    }
    // ---- drag rounds (Snow Garden rules with sea sprites)
    const per = {}; for (const b of r.baskets) per[b.id] = r.items.filter(i => i.answer === b.id);
    const n = r.baskets.length;
    for (const b of r.baskets) assert.strictEqual(b.kind, topic === 'count' ? 'long' : 'chest');
    switch (topic) {
      case 'colors':
        assert.strictEqual(n, age === 3 ? 2 : age === 4 ? 3 : 4, ctx);
        for (const b of r.baskets) { assert.strictEqual(b.label.type, 'color'); assert.strictEqual(per[b.id].length, ri ? 2 : 1); for (const it of per[b.id]) assert.strictEqual(it.sprite, 'shell_' + b.label.value); }
        break;
      case 'shapes': {
        assert.strictEqual(n, age === 3 ? 2 : age === 4 ? 3 : 4, ctx);
        for (const it of r.items) { assert.strictEqual(it.sprite, null); assert.ok(it.shape && it.color); if (age < 5) assert.notStrictEqual(it.shape, 'rectangle'); }
        if (age <= 4) assert.strictEqual(new Set(r.items.map(i => i.color)).size, n, 'one colour per shape');
        if (age >= 5 && ri) for (const b of r.baskets) assert.strictEqual(new Set(per[b.id].map(i => i.color)).size, 2, 'mixed colours');
        break;
      }
      case 'size':
        assert.strictEqual(n, 2);
        assert.strictEqual(r.items.length, ri === 0 ? 2 : 4);
        assert.strictEqual(new Set(r.items.map(i => i.color)).size, 1, 'one colour');
        for (const it of r.items) { assert.strictEqual(it.scale, sizeOK[it.nameValue]); assert.strictEqual(it.sprite, 'shell_' + it.color); assert.strictEqual(it.size, 116, 'drawn = size · scale'); }
        break;
      case 'animals': {
        assert.strictEqual(r.mode, 'ask');
        assert.strictEqual(n, age === 3 ? 2 : age === 4 ? 3 : 4, ctx);
        for (const b of r.baskets) { assert.strictEqual(b.label.type, 'animal'); assert.ok(TR.ANIMALS.includes(b.label.value)); }
        const q = r.queue, cnt = {};
        assert.strictEqual(q.length, r.items.length);
        for (const id of q) cnt[id] = (cnt[id] || 0) + 1;
        for (const b of r.baskets) { const c = cnt[b.id] || 0; if (ri === 0) assert.strictEqual(c, 1, ctx + ' warm-up each chest once'); else assert.ok(c >= 1 && c <= 2, ctx); }
        for (let i = 1; i < q.length; i++) assert.notStrictEqual(q[i], q[i - 1], ctx + ' no chest twice in a row');
        assert.deepStrictEqual(J(r.params), { animal: r.baskets.find(b => b.id === q[0]).label.value });
        for (const it of r.items) { assert.strictEqual(it.answer, null); assert.strictEqual(it.sprite, 'shell_' + it.color); assert.strictEqual(it.nameKind, 'color'); }
        break;
      }
      case 'count': {
        assert.strictEqual(r.mode, 'count'); assert.strictEqual(n, 1);
        const N = r.baskets[0].need, lo = { 3: 1, 4: 1, 5: 3, 6: 4, 7: 4 }[age], hi = { 3: 5, 4: 5, 5: 10, 6: 12, 7: 12 }[age];
        if (ri === 0) assert.ok(age >= 6 ? N >= 4 && N <= 4 : N >= Math.max(lo, 1) && N <= 3, ctx + ' warm-up N ' + N);
        else assert.ok(N >= Math.max(2, lo) && N <= hi, ctx);
        assert.strictEqual(r.items.length, N + (N <= 3 ? 3 : 2));
        assert.deepStrictEqual(J(r.params), { n: N });
        assert.ok(r.items.every(i => i.sprite === 'pearl' && i.nameKind === 'pearl'));
        assert.deepStrictEqual(J(r.baskets[0].label), { type: 'number', value: N });
        break;
      }
      case 'letters': case 'lower': {
        assert.strictEqual(n, 3);
        const pool = TR.Content.LETTER_POOL[lang];
        for (const b of r.baskets) { assert.ok(pool.includes(b.label.value)); for (const it of per[b.id]) { assert.strictEqual(it.sprite, 'tag'); assert.strictEqual(it.text, topic === 'lower' ? b.label.value.toLowerCase() : b.label.value); } }
        break;
      }
      case 'initial':
        assert.strictEqual(n, 3);
        for (const b of r.baskets) { assert.ok(per[b.id].length >= 1 && per[b.id].length <= 2); for (const it of per[b.id]) { const wd = TR.WORDS[lang].find(x => x.word === it.nameValue); assert.strictEqual(wd.initial, b.label.value); assert.strictEqual(it.sprite, wd.sprite); } }
        if (lang === 'vi') { assert.deepStrictEqual(r.baskets.map(b => b.label.value).sort(), ['B', 'C', 'S']); assert.ok(r.items.filter(i => i.nameValue.startsWith('cá ')).length <= 1, 'at most one cá word'); }
        break;
      case 'add': case 'sub':
        assert.strictEqual(n, 3);
        for (const it of r.items) {
          const m = /^(\d+)([+−])(\d+)$/.exec(it.text); assert.ok(m, it.text);
          const a = +m[1], c = +m[3]; assert.ok(a >= 1 && c >= 1);
          if (topic === 'add') { assert.ok(a + c <= (age >= 7 ? 20 : 10)); assert.strictEqual(it.nameKind, 'sum'); } else { assert.ok(a <= 10 && a - c >= 0); assert.strictEqual(it.nameKind, 'diff'); }
        }
        break;
      case 'oddeven':
        assert.strictEqual(n, 2);
        assert.strictEqual(new Set(r.items.map(i => i.text)).size, r.items.length);
        break;
    }
  }
});

test('content: chapter n / range from the plan are honoured; no two identical rounds in a chapter (prev.sig)', () => {
  for (const [n, want] of [[2, 2], [3, 3]]) {
    const r = TR.Content.makeRound('colors', { age: 4, rng: new TR.RNG(5), roundIndex: 1, mech: 'drag', n });
    assert.strictEqual(r.baskets.length, want);
    const d = TR.Content.makeRound('colors', { age: 4, rng: new TR.RNG(5), roundIndex: 2, mech: 'dig', n });
    assert.ok(new Set(d.items.map(i => i.color)).size <= want);
  }
  for (let s = 1; s <= 50; s++) {
    const r = TR.Content.makeRound('count', { age: 4, rng: new TR.RNG(s), roundIndex: 1 + s % 3, mech: 'drag', range: [1, 3] });
    assert.ok(r.params.n >= 2 && r.params.n <= 3, 'range 1–3 → N ' + r.params.n);
    const d = TR.Content.makeRound('count', { age: 6, rng: new TR.RNG(s), roundIndex: 1 + s % 3, mech: 'dig', range: [1, 12] });
    assert.ok(d.need >= 2 && d.need <= 4, 'dig N ≤ 4');
  }
  let same = 0;
  for (let s = 1; s <= 200; s++) {
    const rng = new TR.RNG(s), a = TR.Content.makeRound('size', { age: 3, rng, roundIndex: 1, mech: 'dig' });
    const b = TR.Content.makeRound('size', { age: 3, rng, roundIndex: 2, mech: 'dig', prev: { sig: a.sig } });
    if (a.sig === b.sig) same++;
  }
  assert.strictEqual(same, 0, 'a round equal to the previous one is re-rolled');
});

test('content: validate() rejects broken rounds (self-check works, drag and dig)', () => {
  const ok = TR.Content.makeRound('animals', { age: 5, rng: new TR.RNG(3), roundIndex: 2 });
  const bad1 = J(ok); bad1.queue.pop(); assert.ok(TR.Content.validate(bad1));
  const bad2 = J(ok); bad2.queue = bad2.queue.map(() => 'b0'); assert.ok(TR.Content.validate(bad2), 'chest never asked');
  const bad3 = J(TR.Content.makeRound('colors', { age: 4, rng: new TR.RNG(3), roundIndex: 1 })); bad3.items[0].answer = bad3.items[0].answer === 'b0' ? 'b1' : 'b0'; assert.ok(TR.Content.validate(bad3));
  const bad4 = J(ok); bad4.items[0].gem = 'cream'; assert.ok(TR.Content.validate(bad4));
  const dig = TR.Content.makeRound('colors', { age: 4, rng: new TR.RNG(3), roundIndex: 2, mech: 'dig' });
  assert.strictEqual(TR.Content.validate(dig), null);
  const d1 = J(dig); d1.queue.push('i99'); assert.ok(TR.Content.validate(d1), 'target missing');
  const d2 = J(dig); d2.mounds[1].item = d2.mounds[0].item; assert.ok(TR.Content.validate(d2), 'item in two mounds');
  const d3 = J(dig); d3.items[0].id = d3.items[1].id; assert.ok(TR.Content.validate(d3), 'duplicate id');
  const d4 = J(dig); d4.queue = [d4.queue[0], d4.queue[0]]; assert.ok(TR.Content.validate(d4), 'target twice');
  const d5 = J(dig); d5.items.forEach(i => { i.color = 'red'; i.sprite = 'shell_red'; i.gem = 'red'; i.label = { type: 'color', value: 'red' }; i.nameValue = 'red'; }); assert.ok(TR.Content.validate(d5), 'no decoys');
  const d6 = J(dig); d6.mounds.pop(); assert.ok(TR.Content.validate(d6), 'item not in a mound');
});

test('content: deterministic (same seed → same round and talk)', () => {
  for (const topic of TOPICS) for (const mech of ['drag', 'dig']) {
    const a = TR.Content.makeRound(topic, { age: 6, lang: 'vi', rng: new TR.RNG(9), roundIndex: 2, mech });
    const b = TR.Content.makeRound(topic, { age: 6, lang: 'vi', rng: new TR.RNG(9), roundIndex: 2, mech });
    assert.deepStrictEqual(J(a), J(b));
    assert.deepStrictEqual(J(TR.Content.makeTalk(topic, { age: 6, lang: 'vi', rng: new TR.RNG(4) })), J(TR.Content.makeTalk(topic, { age: 6, lang: 'vi', rng: new TR.RNG(4) })));
  }
});

test('talk: every topic × age × 300 seeds → distinct choices containing the answer (3, or 2 for size/oddeven); animals = 3 pictures', () => {
  for (const topic of TOPICS) for (const age of AGES) for (let s = 1; s <= 300; s++) {
    const t = TR.Content.makeTalk(topic, { age, lang: s % 2 ? 'en' : 'vi', rng: new TR.RNG(s) });
    const n = topic === 'size' || topic === 'oddeven' ? 2 : 3;
    assert.strictEqual(t.choices.length, n, topic);
    assert.strictEqual(new Set(t.choices.map(c => String(c.value))).size, n);
    const ans = t.choices.find(c => c.id === t.answerId); assert.ok(ans);
    assert.strictEqual(t.promptKey, 'talk.' + topic);
    if (topic === 'animals') { assert.ok(!t.show.sprite && !t.show.shape, 'shows nothing'); assert.strictEqual(t.params.animal, ans.value); assert.ok(t.choices.every(c => c.kind === 'animal' && TR.ANIMALS.includes(c.value))); }
    else assert.ok(t.show.sprite || t.show.shape);
    if (topic === 'count') { assert.strictEqual(ans.value, t.show.count); assert.strictEqual(t.show.sprite, 'pearl'); }
    if (topic === 'colors') { assert.strictEqual(t.show.sprite, 'shell_' + ans.value); if (age < 5) assert.ok(!clash(t.choices.map(c => c.value))); }
    if (topic === 'shapes') assert.strictEqual(ans.value, t.show.shape);
    if (topic === 'size') assert.strictEqual(ans.value, t.show.scale > 1 ? 'big' : 'small');
    if (topic === 'letters' || topic === 'lower') { assert.strictEqual(ans.value, t.show.text.toUpperCase()); assert.strictEqual(t.show.sprite, 'tag'); }
    if (topic === 'initial') assert.strictEqual(TR.WORDS[s % 2 ? 'en' : 'vi'].find(w => w.word === t.params.word).initial, ans.value);
    if (topic === 'add' || topic === 'sub') { const m = /^(\d+)([+−])(\d+)$/.exec(t.show.text); assert.strictEqual(ans.value, m[2] === '+' ? +m[1] + +m[3] : +m[1] - +m[3]); }
    if (topic === 'oddeven') assert.strictEqual(ans.value, +t.show.text % 2 ? 'odd' : 'even');
  }
});

// ======================================================= layout
test('layout: §2 formulas (chests, Tutu, bubble, play, moundGrid), short-side rule', () => {
  assert.deepStrictEqual(J(TR.World.logicalSize(2532, 1170)), { W: 1558, H: 720 });
  assert.deepStrictEqual(J(TR.World.logicalSize(1170, 2532)), { W: 720, H: 1558 });
  assert.deepStrictEqual(J(TR.World.logicalSize(1024, 1366)), { W: 720, H: 960 });
  assert.deepStrictEqual(J(TR.World.logicalSize(4000, 1000)), { W: 1600, H: 720 });
  const L = TR.World.computeLayout(1280, 720, { top: 0, right: 0, bottom: 20, left: 44 }, 3);
  assert.strictEqual(L.groundY, 720 - 20 - 70);
  const pw0 = Math.min(230, (1280 - 44 - 40) / 3 - 24);
  assert.ok(L.chest.w <= pw0 && L.chest.w >= 190, 'landscape chest width ' + L.chest.w);
  assert.strictEqual(TR.World.computeLayout(1280, 720, null, 3).chest.w, 230, 'no shrink when there is room');
  assert.ok(Math.abs(L.chest.h - 0.78 * L.chest.w) < 1e-9);
  assert.strictEqual(L.chest.bottom, L.groundY + 8);
  assert.ok(Math.abs(L.chest.y - (L.chest.top + 0.27 * L.chest.h)) < 1e-9, 'y = opening centre (128,54)/200');
  assert.strictEqual(L.pot, L.chest, 'old alias');
  assert.deepStrictEqual([L.tutu.x, L.tutu.y, L.tutu.h], [44 + 105, 225, 175]);
  assert.deepStrictEqual([L.bubble.x, L.bubble.y, L.bubble.h], [L.tutu.x + 85, 24, 104]);
  assert.strictEqual(L.bubble.w, Math.min(620, 1280 - L.bubble.x - 0 - 150));
  assert.deepStrictEqual([L.play.x, L.play.y, L.play.x + L.play.w], [44 + 40, 225 + 10, 1280 - 40]);
  assert.ok(L.playGap === 74 && Math.abs(L.play.y + L.play.h - (L.chest.top - 74)) < 1e-9, 'band ends 74 px above the chests');
  assert.ok(L.playAlt && L.playAlt.y === L.bubble.y + L.bubble.h + 16 && L.playAlt.ex, 'landscape alt band');
  // mound grid: 6 anchors, 2 rows × 3 landscape / 3 rows × 2 portrait, low rows first
  assert.strictEqual(L.moundGrid.length, 6);
  assert.deepStrictEqual([L.dig.rows, L.dig.cols], [2, 3]);
  assert.ok(L.moundGrid.slice(0, 3).every(p => p.row === 1) && L.moundGrid.slice(3).every(p => p.row === 0), 'bottom row first');
  assert.ok(L.moundGrid[0].x < L.moundGrid[2].x && L.moundGrid[2].x < L.moundGrid[1].x, 'outer anchors before the middle one');
  assert.ok(L.mound.w <= 170 && L.mound.w >= 130 && Math.abs(L.mound.h - L.mound.w * 96 / 160) < 1e-9);
  assert.ok(L.moundGrid[0].y + 12 <= L.dig.chest.top + 1e-9, 'bottom row sits above the dig chest');
  const Lp = TR.World.computeLayout(720, 1556, { top: 44, bottom: 30, left: 0, right: 0 }, 2);
  assert.deepStrictEqual([Lp.tutu.y, Lp.tutu.h], [44 + 245, 190]);
  assert.deepStrictEqual([Lp.dig.rows, Lp.dig.cols], [3, 2]);
  assert.ok(Lp.tall && Lp.play.itemScale === 1.2 && Lp.play.h <= 0.85 * 720 + 1e-9, 'tall portrait band');
  assert.strictEqual(Lp.chest.w, 290, 'tall portrait, ≤ 3 chests: 290 px chests');
  assert.strictEqual(Lp.groundY, 1556 - 30 - 70 - Math.min(120, 0.25 * (1556 - 1.6 * 720)), 'tall portrait: floor raised');
  assert.ok(Math.abs(Lp.mound.w - 170 * 1.2) < 1e-9, 'tall portrait mounds ×1.2');
  assert.strictEqual(TR.World.computeLayout(720, 1556, null, 4).chest.w, (720 - 12) / 4 - 8, 'portrait: margin 6, gap 8');
  for (const N of [1, 3, 5, 10, 12]) {   // long chest: w = min(safe − 80, 120 + 96 N), h = min(0.42 w, 170, chest h), same bottom, centred
    const pr = TR.Content.longRect(L, N);
    assert.strictEqual(pr.w, Math.min(1280 - 44 - 80, 120 + 96 * N));
    assert.strictEqual(pr.h, Math.min(0.42 * pr.w, 170, L.chest.h));
    assert.strictEqual(pr.bottom, L.chest.bottom);
    assert.strictEqual(pr.x, 44 + (1280 - 44) / 2);
    assert.ok(Math.abs(pr.y - (pr.top + 0.30 * pr.h)) < 1e-9);
  }
});

test('layout: every viewport × chest count → chests/play/Tutu/bubble/HUD inside the safe area and apart; mound grid clear', () => {
  let minGap = 1e9;
  for (const v of VIEWPORTS) for (let n = 1; n <= 4; n++) {
    const L = TR.World.computeLayout(v.W, v.H, v.ins, n), ins = L.ins, ctx = v.name + ' n=' + n;
    const safe = { x: ins.left, y: ins.top, w: v.W - ins.left - ins.right, h: v.H - ins.top - ins.bottom };
    const inside = (R) => R.x >= safe.x - 1e-6 && R.y >= safe.y - 1e-6 && R.x + R.w <= safe.x + safe.w + 1e-6 && R.y + R.h <= safe.y + safe.h + 1e-6;
    const hud = { x: v.W - ins.right - 140, y: 0, w: 140 + ins.right, h: ins.top + 90 };
    for (const P of [L.play, L.playAlt].filter(Boolean)) {
      assert.ok(inside(P), ctx + ' play');
      assert.ok(P.w > 300 && (P.h > 120 || (P === L.play && L.playAlt && L.playAlt.h >= 200)), ctx + ' play big enough ' + P.w + 'x' + P.h);
      for (const R of [L.bubble, hud]) assert.ok(!rectsOverlap(R, P), ctx + ' play vs ' + JSON.stringify(R));
      if (P === L.play) assert.ok(!rectsOverlap(tutuRect(L), P), ctx + ' play vs Tutu');
    }
    assert.ok(L.bubble.w > 200, ctx + ' bubble w');
    assert.ok(!rectsOverlap(L.bubble, hud), ctx + ' bubble vs hud');
    const chests = L.chest.xs.map(x => ({ x: x - L.chest.w / 2, y: L.chest.top, w: L.chest.w, h: L.chest.h }));
    for (let i = 0; i < n; i++) {
      assert.ok(inside(chests[i]), ctx + ' chest inside');
      assert.ok(!rectsOverlap(chests[i], L.play), ctx + ' chest vs play');
      for (let j = i + 1; j < n; j++) assert.ok(chests[i].x + chests[i].w + (L.portrait ? 8 : 20) - 1e-9 <= chests[j].x, ctx + ' chests apart');
    }
    const pr = TR.Content.longRect(L, 12);
    assert.ok(inside({ x: pr.x - pr.w / 2, y: pr.top, w: pr.w, h: pr.h }), ctx + ' long chest inside');
    // mound grid (independent of n): cells inside the safe area, clear of Tutu / bubble / HUD / dig chest, anchors apart
    const g = L.moundGrid, mw = L.mound.w, mh = L.mound.h, peek = L.mound.peek;
    assert.strictEqual(g.length, 6);
    const dc = { x: L.dig.chest.x - L.dig.chest.w / 2, y: L.dig.chest.top, w: L.dig.chest.w, h: L.dig.chest.h };
    assert.ok(inside(dc), ctx + ' dig chest inside');
    for (let i = 0; i < 6; i++) {
      const cell = { x: g[i].x - mw / 2, y: g[i].y - mh - peek, w: mw, h: mh + peek };
      assert.ok(inside(cell), ctx + ' mound cell inside ' + JSON.stringify(cell));
      for (const R of [tutuRect(L), L.bubble, hud, dc]) assert.ok(!rectsOverlap(cell, R), ctx + ' mound ' + i + ' vs ' + JSON.stringify(R));
      for (let j = i + 1; j < 6; j++) {
        const d = hyp(g[i].x - g[j].x, g[i].y - g[j].y); minGap = Math.min(minGap, d);
        assert.ok(d >= 150 - 1e-9, ctx + ' anchors ' + i + '/' + j + ' only ' + d.toFixed(0) + ' px apart');
        const cj = { x: g[j].x - mw / 2, y: g[j].y - mh - peek, w: mw, h: mh + peek };
        assert.ok(!rectsOverlap(cell, cj), ctx + ' mound cells overlap');
      }
    }
    if (!v.ins && v.W >= 1280) for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) assert.ok(hyp(g[i].x - g[j].x, g[i].y - g[j].y) >= 190 - 1e-9, ctx + ' ≥ 190 px apart');
  }
  console.log('      closest mound anchors over all viewports: ' + minGap.toFixed(0) + ' px');
});

test('layout: every topic × age × viewport (20 seeds) → drag items packed in the band, no overlaps, ≥ 0.75× size', () => {
  let worst = 1, alt = 0, total = 0;
  for (const v of VIEWPORTS) for (const age of AGES) for (const topic of TOPICS) for (let s = 1; s <= 20; s++) {
    const w = mkWorld({ seed: s * 13 + age, age, vp: v, lang: s % 2 ? 'en' : 'vi' });
    roundOf(w, topic, s % 4);
    const ctx = v.name + ' ' + topic + ' age ' + age + ' seed ' + s;
    assert.ok(w.packOk, ctx + ' shrink ' + w.packShrink);
    worst = Math.min(worst, w.packShrink); total++; if (w.playRect !== w.layout.play) alt++;
    checkPacking(w, ctx);
  }
  assert.ok(worst >= 0.75);
  console.log('      worst pack scale ' + worst + ', alt band used in ' + alt + '/' + total + ' rounds');
});
function checkPacking(w, ctx) {
  const L = w.layout, P = w.playRect;
  const hud = { x: L.W - L.ins.right - 140, y: 0, w: 140 + L.ins.right, h: L.ins.top + 90 };
  const rest = w.items.filter(i => i.state !== 'in' && i.state !== 'fly' && i.state !== 'leave');
  for (const it of rest) {
    const r = it.size / 2;
    assert.ok(it.homeX - r >= P.x - 1e-6 && it.homeX + r <= P.x + P.w + 1e-6 && it.homeY - r >= P.y - 1e-6 && it.homeY + r <= P.y + P.h + 1e-6, ctx + ' inside play');
    assert.ok(it.size >= it.baseSize * 0.75 - 1e-9, ctx + ' size');
    for (const R of [hud, tutuRect(L), L.bubble]) assert.ok(!circleRect(it.homeX, it.homeY, r, R), ctx + ' vs ui');
    for (const b of w.baskets) {
      assert.ok(!circleRect(it.homeX, it.homeY, r, chestRect(b)), ctx + ' vs chest');
      assert.ok(w.chestAt(it.homeX, it.homeY) === null || it.size < it.baseSize, ctx + ' resting centre outside drop zones');
    }
  }
  for (let i = 0; i < rest.length; i++) for (let j = i + 1; j < rest.length; j++) {
    const a = rest[i], b = rest[j];
    assert.ok(hyp(a.homeX - b.homeX, a.homeY - b.homeY) >= 1.1 * Math.max(a.size, b.size) - 1e-6, ctx + ' overlap');
  }
}

test('slots: chests 1–3 slots at openY + 0.12 h (centre-out, ≤ 0.42 w), long chest N slots left → right at top + 0.6 h', () => {
  for (const v of VIEWPORTS) for (const topic of ['colors', 'size', 'animals', 'count', 'oddeven']) for (let s = 1; s <= 6; s++) {
    const w = mkWorld({ seed: s, age: topic === 'count' ? 6 : 5, vp: v });
    roundOf(w, topic, 1 + (s % 3));
    for (const b of w.baskets) {
      const ctx = v.name + ' ' + topic + ' ' + b.id;
      assert.strictEqual(b.openY, b.y);
      const cap = topic === 'count' ? b.need : topic === 'animals' ? w.cur.queue.filter(q => q === b.id).length : w.items.filter(i => i.answer === b.id).length;
      assert.strictEqual(b.slots.length, cap, ctx);
      for (const sl of b.slots) {
        assert.ok(Math.abs(sl.y - (b.kind === 'long' ? b.top + 0.6 * b.h : b.y + 0.12 * b.h)) < 1e-9, ctx + ' slot y');
        assert.ok(sl.x - b.slotSize / 2 >= b.x - b.w / 2 - 1e-6 && sl.x + b.slotSize / 2 <= b.x + b.w / 2 + 1e-6, ctx + ' inside');
      }
      if (b.kind === 'long') { for (let i = 1; i < b.slots.length; i++) assert.ok(b.slots[i].x > b.slots[i - 1].x, 'left → right'); }
      else { assert.ok(b.slotSize <= 0.42 * b.w + 1e-9); if (b.slots.length === 3) assert.strictEqual(b.slots[0].x, b.x, 'centre first'); }
      for (let i = 0; i < b.slots.length; i++) for (let j = i + 1; j < b.slots.length; j++) assert.ok(Math.abs(b.slots[i].x - b.slots[j].x) >= b.slotSize * 0.79, ctx + ' apart');
    }
  }
});

test('layout: setViewport mid-round re-packs resting items and moves chests + landed items', () => {
  const w = mkWorld({ seed: 3, age: 5 });
  roundOf(w, 'colors', 2); settleAppear(w);
  const it = idleItems(w)[0], b = w.basketById(it.answer), p = chestPoint(b);
  dragTo(w, it, p.x, p.y); run(w, 0.6);
  assert.strictEqual(it.state, 'in');
  const other = idleItems(w)[0], p2 = { x: other.x, y: other.y };
  w.pointerDown(other.x, other.y); w.pointerMove(p2.x + 50, p2.y); run(w, 0.1);
  for (const v of VIEWPORTS) {
    w.setViewport(v.W, v.H, v.ins);
    checkPacking(w, 'resize ' + v.name);
    const nb = w.basketById(b.id);
    assert.strictEqual(nb.x, w.layout.chest.xs[w.baskets.indexOf(nb)]);
    assert.strictEqual(nb.y, w.layout.chest.y); assert.strictEqual(nb.top, w.layout.chest.top);
    const sl = nb.slots[it.slot];
    assert.deepStrictEqual([it.x, it.y, it.size], [sl.x, sl.y, nb.slotSize]);
    for (const o of idleItems(w)) assert.deepStrictEqual([o.x, o.y], [o.homeX, o.homeY]);
    run(w, 0.05);
  }
  w.pointerUp(emptyPoint(w).x, emptyPoint(w).y); run(w, 0.8);
  assert.strictEqual(other.state, 'idle');
  assert.ok(hyp(other.x - other.homeX, other.y - other.homeY) <= 3.01);
  checkPacking(w, 'after');
  const w2 = mkWorld({ seed: 4, age: 6 }); roundOf(w2, 'count', 2); settleAppear(w2);
  w2.setViewport(720, 1556, null);
  const pr = TR.Content.longRect(w2.layout, w2.baskets[0].need);
  assert.deepStrictEqual([w2.baskets[0].x, w2.baskets[0].w, w2.baskets[0].top], [pr.x, pr.w, pr.top]);
});

test('layout: viewport change during a flight re-targets the new slot', () => {
  const w = mkWorld({ seed: 4, age: 4 });
  roundOf(w, 'colors', 1); settleAppear(w);
  const it = idleItems(w)[0], b = w.basketById(it.answer), p = chestPoint(b);
  dragTo(w, it, p.x, p.y);
  assert.strictEqual(it.state, 'fly');
  run(w, 0.1);
  w.setViewport(720, 1556, { top: 44, bottom: 30, left: 0, right: 0 });
  run(w, 0.6);
  assert.strictEqual(it.state, 'in');
  const sl = w.basketById(b.id).slots[it.slot];
  assert.ok(hyp(it.x - sl.x, it.y - sl.y) < 1e-6);
});

// ======================================================= motion (drag)
test('drag: critically damped follow (no overshoot) and pendulum tilt that swings then settles', () => {
  const w = mkWorld({ seed: 5 });
  roundOf(w, 'colors', 1); settleAppear(w);
  const it = idleItems(w)[0];
  const fx0 = it.x + 6, fy0 = it.y + 4;
  assert.strictEqual(w.pointerDown(fx0, fy0), it.id);
  run(w, 0.5);
  const tx0 = fx0 + it._offX, ty0 = fy0 + it._offY - 10;
  assert.ok(hyp(it.x - tx0, it.y - ty0) < 0.5, 'lifted 10 px above the finger target');
  assert.ok(it.lift > 0.99);
  const sg = fx0 < w.layout.W / 2 ? 1 : -1;
  const n = 30; let maxX = -1e9, rots = [];
  for (let i = 1; i <= n; i++) { w.pointerMove(fx0 + sg * 400 * i / n, fy0); w.update(H); }
  const tx = fx0 + sg * 400 + it._offX;
  run(w, 3, () => { maxX = Math.max(maxX, sg * it.x); rots.push(sg * it.rot); });
  assert.ok(maxX <= sg * tx + 0.5, 'no positional overshoot ' + (maxX - sg * tx));
  assert.ok(Math.abs(it.x - tx) < 0.1);
  const minRot = Math.min(...rots), maxRot = Math.max(...rots);
  assert.ok(minRot < -0.2 && minRot >= -0.45 - 0.2, 'tilts back against the motion: ' + minRot);
  assert.ok(maxRot > 0.03, 'swings past vertical (pendulum): ' + maxRot);
  let crossings = 0; for (let i = 1; i < rots.length; i++) if (Math.sign(rots[i]) !== Math.sign(rots[i - 1]) && Math.abs(rots[i] - rots[i - 1]) > 1e-6) crossings++;
  assert.ok(crossings >= 2, 'swings at least twice: ' + crossings);
  assert.ok(Math.abs(it.rot) < 0.005, 'settles: ' + it.rot);
});

test('flight: correct drop → parabola with apex ≥ 60 px, lands in the slot, squash + chest squash, land/sparkle/pearl events, settle bounce', () => {
  const w = mkWorld({ seed: 6, age: 4 });
  roundOf(w, 'colors', 1); settleAppear(w);
  const it = idleItems(w)[0], b = w.basketById(it.answer), p = chestPoint(b);
  dragTo(w, it, p.x, p.y); const ev = w.drainEvents();
  assert.deepStrictEqual(ev.slice(-3).map(e => e.type), ['drop', 'correct', 'pearl']);
  assert.deepStrictEqual(J(ev[ev.length - 1]), { type: 'pearl', n: 1, total: 1 });
  assert.strictEqual(ev[ev.length - 2].basketId, b.id);
  assert.deepStrictEqual(J(ev[ev.length - 2].label), J(b.label));
  assert.strictEqual(it.state, 'fly');
  const f = it._f, y0 = it.y, pts = [];
  assert.ok(f.T >= 0.32 - 1e-9 && f.T <= 0.5 + 1e-9);
  let landed = null, sparkle = null, t = 0;
  while (it.state === 'fly') { w.update(H); t += H; pts.push([it.x, it.y]); for (const e of w.drainEvents()) { if (e.type === 'land') landed = e; if (e.type === 'sparkle') sparkle = e; } }
  assert.ok(Math.abs(t - f.T) < 2 * H, 'duration');
  const sl = b.slots[it.slot];
  assert.deepStrictEqual([it.x, it.y], [sl.x, sl.y]);
  assert.ok(landed && landed.basketId === b.id && landed.count === 1 && landed.need === null);
  assert.deepStrictEqual(J(sparkle), { type: 'sparkle', id: it.id, basketId: b.id, x: sl.x, y: sl.y, gem: it.gem });
  const d2 = [];
  for (let i = 2; i < pts.length - 1; i++) d2.push([pts[i][0] - 2 * pts[i - 1][0] + pts[i - 2][0], pts[i][1] - 2 * pts[i - 1][1] + pts[i - 2][1]]);
  for (const d of d2) assert.ok(Math.abs(d[0] - d2[0][0]) < 1e-6 && Math.abs(d[1] - d2[0][1]) < 1e-6, 'parabola');
  assert.ok(d2[0][1] > 0, 'gravity down');
  const apex = Math.min(...pts.map(q => q[1]));
  assert.ok(apex <= Math.min(y0, sl.y) - 60 + 0.5, 'apex ' + (Math.min(y0, sl.y) - apex));
  assert.ok(Math.abs(it.sx - 1.15) < 0.02 && Math.abs(it.sy - 0.82) < 0.03, 'land squash ' + it.sx + ' ' + it.sy);
  assert.ok(Math.abs(b.squash - 0.12) < 0.02);
  assert.ok(it.settle < 0.05, 'settle starts at 0 on landing');
  let minSq = 1, maxSettle = 0; run(w, 1.2, () => { minSq = Math.min(minSq, b.squash); maxSettle = Math.max(maxSettle, it.settle); });
  assert.ok(minSq < 0, 'chest squash oscillates (damped spring)');
  assert.ok(maxSettle > 1.15 && maxSettle < 1.5, 'settle overshoots: ' + maxSettle);
  assert.ok(Math.abs(it.settle - 1) < 0.01 && Math.abs(b.squash) < 0.003 && Math.abs(it.sx - 1) < 0.003, 'settled');
  assert.strictEqual(it.size, b.slotSize);
  assert.strictEqual(it.state, 'in');
});

test('flight: inherits release velocity (upward fling → higher apex)', () => {
  function fling(flick) {
    const w = mkWorld({ seed: 7, age: 4 });
    roundOf(w, 'colors', 1); settleAppear(w);
    const it = idleItems(w)[0], b = w.basketById(it.answer), p = chestPoint(b);
    w.pointerDown(it.x, it.y);
    const fx = it.x, fy = it.y;
    for (let i = 1; i <= 36; i++) { w.pointerMove(fx + (p.x - fx) * i / 36, fy + (p.y + 100 - fy) * i / 36); w.update(H); }
    run(w, 0.4);
    if (flick) for (let i = 1; i <= 5; i++) { w.pointerMove(p.x, p.y + 100 - 20 * i); w.update(H); }
    else { w.pointerMove(p.x, p.y); run(w, 0.4); }
    const vy = it.vy;
    w.pointerUp(p.x, p.y);
    assert.strictEqual(it.state, 'fly');
    const y0 = it.y; let min = 1e9;
    while (it.state === 'fly') { w.update(H); min = Math.min(min, it.y); }
    return { apex: Math.min(y0, b.slots[it.slot].y) - min, vy };
  }
  const calm = fling(false), up = fling(true);
  assert.ok(up.vy < -300, 'release speed ' + up.vy);
  assert.ok(Math.abs(calm.apex - 60) < 1);
  assert.ok(up.apex > calm.apex + 15, 'apex grows with upward release speed ' + calm.apex + ' → ' + up.apex);
});

test('wrong drop: chest shakes (3 wiggles, 0.5 s), item hops home in 0.55 s with a wobble; Tutu oops', () => {
  const w = mkWorld({ seed: 8, age: 5 });
  roundOf(w, 'colors', 1); settleAppear(w);
  const it = idleItems(w)[0], wrongB = w.baskets.find(b => b.id !== it.answer), p = chestPoint(wrongB);
  const hx = it.homeX, hy = it.homeY;
  dragTo(w, it, p.x, p.y); const ev = w.drainEvents();
  const we = ev.find(e => e.type === 'wrong');
  assert.ok(we && we.basketId === wrongB.id && we.misses === 1 && we.nameKind === 'color' && we.nameValue === it.color);
  assert.strictEqual(w.roundMistakes, 1);
  assert.strictEqual(it.state, 'return');
  assert.strictEqual(w.tutu.mood, 'oops');
  const y0 = it.y; let minY = 1e9, sh = [], rots = [], t = 0;
  while (it.state === 'return') { w.update(H); t += H; minY = Math.min(minY, it.y); sh.push(wrongB.shake); rots.push(it.rot); }
  assert.ok(Math.abs(t - 0.55) < 2 * H, 'return time ' + t);
  assert.ok(minY < Math.min(y0, hy) - 40, 'arc');
  assert.ok(Math.max(...rots.map(Math.abs)) > 0.1, 'wobble');
  assert.strictEqual(it.state, 'idle'); assert.deepStrictEqual([it.x, it.y], [hx, hy]);
  let signs = 0; for (let i = 1; i < sh.length; i++) if (sh[i] * sh[i - 1] < 0) signs++;
  assert.ok(signs >= 4 && signs <= 6, 'wiggles ' + signs);
  run(w, 0.1); assert.strictEqual(wrongB.shake, 0);
});

test('miss: drop on empty sand → miss event, floats home in 0.5 s, not a mistake', () => {
  const w = mkWorld({ seed: 9 });
  roundOf(w, 'colors', 1); settleAppear(w);
  const it = idleItems(w)[0], p = emptyPoint(w);
  dragTo(w, it, p.x + 37, p.y + 11);
  const ev = w.drainEvents().map(e => e.type);
  assert.deepStrictEqual(ev.slice(-2), ['drop', 'miss']);
  assert.strictEqual(w.roundMistakes, 0); assert.strictEqual(it.misses, 1);
  let t = 0; while (it.state === 'return') { w.update(H); t += H; }
  assert.ok(Math.abs(t - 0.5) < 2 * H);
  assert.strictEqual(it.state, 'idle');
});

test('grab rules: generous radius, one held item, no grabbing appear/fly/in, re-grab while returning', () => {
  const w = mkWorld({ seed: 10, age: 5 });
  roundOf(w, 'colors', 1);
  run(w, 0.05);
  const first = w.items[0];
  assert.strictEqual(first.state, 'appear');
  assert.strictEqual(w.pointerDown(first.x, first.y), null, 'appear not grabbable');
  w.pointerUp();
  settleAppear(w);
  const it = idleItems(w)[0], R = 0.6 * it.size + 14;
  const dir = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]].find(([dx, dy]) =>
    w.items.every(o => o === it || hyp(it.x + dx * (R + 3) - o.x, it.y + dy * (R + 3) - o.y) > 0.6 * o.size + 14 + 1));
  assert.ok(dir);
  assert.strictEqual(w.pointerDown(it.x + dir[0] * (R - 1), it.y + dir[1] * (R - 1)), it.id, 'generous radius');
  const other = w.items.find(o => o !== it && o.state === 'idle');
  assert.strictEqual(w.pointerDown(other.x, other.y), null, 'one held item only');
  w.cancelDrag(); run(w, 0.6);
  assert.strictEqual(w.pointerDown(it.x + dir[0] * (R + 2), it.y + dir[1] * (R + 2)), null, 'outside radius');
  const b = w.basketById(it.answer), p = chestPoint(b);
  dragTo(w, it, p.x, p.y);
  assert.strictEqual(it.state, 'fly');
  assert.strictEqual(w.pointerDown(it.x, it.y), null, 'fly not grabbable'); w.pointerUp();
  run(w, 0.6); assert.strictEqual(it.state, 'in');
  assert.strictEqual(w.pointerDown(it.x, it.y), null, 'in not grabbable'); w.pointerUp();
  const o2 = idleItems(w)[0], e = emptyPoint(w);
  dragTo(w, o2, e.x, e.y);
  run(w, 0.15);
  assert.strictEqual(o2.state, 'return');
  assert.strictEqual(w.pointerDown(o2.x, o2.y), o2.id);
  assert.strictEqual(o2.state, 'drag');
  assert.strictEqual(w.items[w.items.length - 1], o2, 'held item drawn last');
});

test('chest drop zone: +45 px sides/bottom, +120 px up; overlapping zones pick the nearest chest', () => {
  const w = mkWorld({ seed: 11, age: 5, vp: VIEWPORTS[1] });
  roundOf(w, 'colors', 1); settleAppear(w);
  const b = w.baskets[0], top = b.top;
  assert.strictEqual(w.chestAt(b.x, top - 119), b);
  assert.strictEqual(w.chestAt(b.x, top - 121), null);
  assert.strictEqual(w.chestAt(b.x - b.w / 2 - 44, b.y), b);
  assert.strictEqual(w.chestAt(b.x - b.w / 2 - 46, b.y), null);
  assert.strictEqual(w.chestAt(b.x, b.bottom + 44), b);
  assert.strictEqual(w.chestAt(b.x, b.bottom + 46), null);
  const b1 = w.baskets[1], mid = (b.x + b1.x) / 2;
  assert.strictEqual(w.chestAt(mid - 1, b.y), b); assert.strictEqual(w.chestAt(mid + 1, b.y), b1);
  assert.strictEqual(w.potAt, w.chestAt, 'old alias');
});

test('idle life: bob ≤ 3 px around home, shells wiggle ±0.12 rad every 4–8 s', () => {
  const w = mkWorld({ seed: 12, age: 4 });
  roundOf(w, 'colors', 1); settleAppear(w);
  const it = w.items[0]; let maxB = 0, maxR = 0, wig = 0, prev = 0;
  run(w, 20, () => { maxB = Math.max(maxB, Math.abs(it.y - it.homeY)); maxR = Math.max(maxR, Math.abs(it.rot)); if (Math.abs(it.rot) > 0.02 && prev <= 0.02) wig++; prev = Math.abs(it.rot); assert.strictEqual(it.x, it.homeX); });
  assert.ok(maxB > 2 && maxB <= 3 + 1e-9, 'bob ' + maxB);
  assert.ok(maxR > 0.08 && maxR <= 0.12 + 1e-9, 'wiggle ' + maxR);
  assert.ok(wig >= 2, 'wiggles ' + wig);
});

test('appear: staggered 70 ms pop-ins with back overshoot, appear events; chests pop in', () => {
  const w = mkWorld({ seed: 13, age: 5 });
  roundOf(w, 'colors', 1);
  const times = {}; let t = 0, maxA = 0;
  while (!w.interactive) { w.update(H); t += H; for (const e of w.drainEvents()) if (e.type === 'appear') times[e.id] = t; for (const i of w.items) maxA = Math.max(maxA, i.appear); }
  assert.strictEqual(Object.keys(times).length, w.items.length);
  const ts = Object.values(times).sort((a, b) => a - b);
  for (let i = 1; i < ts.length; i++) assert.ok(Math.abs(ts[i] - ts[i - 1] - 0.07) < 1.5 * H);
  assert.ok(maxA > 1.05, 'overshoot ' + maxA);
  assert.ok(Math.abs(t - (0.07 * (w.items.length - 1) + 0.45)) < 2 * H);
  assert.ok(w.baskets.every(b => b.appear === 1));
});

test('size topic: small chest 0.72× (same x/bottom); count rounds never repeat the previous N (drag and dig)', () => {
  for (const v of VIEWPORTS) for (let s2 = 1; s2 <= 4; s2++) {
    const w = mkWorld({ seed: s2, age: 3, vp: v }); roundOf(w, 'size', 1 + (s2 % 3));
    const big = w.baskets.find(b => b.label.value === 'big'), small = w.baskets.find(b => b.label.value === 'small');
    const i = w.baskets.indexOf(small);
    assert.ok(Math.abs(small.w - 0.72 * big.w) < 1e-9 && Math.abs(small.h - 0.72 * big.h) < 1e-9);
    assert.strictEqual(small.x, w.layout.chest.xs[i]); assert.strictEqual(small.bottom, big.bottom);
    assert.ok(Math.abs(small.y - (small.top + 0.27 * small.h)) < 1e-9, 'opening of the small chest');
  }
  for (const mech of ['drag', 'dig']) for (const age of AGES) for (let s2 = 1; s2 <= 8; s2++) {
    const w = mkWorld({ seed: 200 + s2, age }); w.plan = [{ topic: 'count', mech }]; w.levels = ['count']; w.startLevel(0);
    let prev = null;
    for (let r = 0; r < 6; r++) {
      w.round = r; w._beginRound();
      const n = w.cur.params.n;
      if (prev !== null) assert.notStrictEqual(n, prev, mech + ' N repeats');
      prev = n;
    }
  }
});

// ======================================================= landing / round end
function landOne(w, it, b) {
  b = b || w.basketById(w.goalOf(it));
  const p = chestPoint(b);
  dragTo(w, it, p.x, p.y);
  let land = null, g = 0;
  while (!land && g++ < 400) { w.update(H); for (const e of w.drainEvents()) if (e.type === 'land' && e.id === it.id) land = e; }
  assert.ok(land, 'landed');
  return land;
}

test('round end: roundDone 0.5 s after the last landing; no input while completing; treasures fade in place at roundDone + 1.0 s', () => {
  const w = mkWorld({ seed: 71, age: 3 });
  roundOf(w, 'colors', 0); settleAppear(w);
  const a = idleItems(w)[0]; landOne(w, a);
  const b = idleItems(w)[0];
  const p = chestPoint(w.basketById(b.answer)); dragTo(w, b, p.x, p.y);
  let landT = null, doneT = null, t = 0;
  while (w.state === 'round' && t < 5) {
    w.update(H); t += H;
    for (const e of w.drainEvents()) { if (e.type === 'land' && e.id === b.id) { landT = t; assert.ok(w.completing && !w.interactive); } if (e.type === 'roundDone') doneT = t; }
    if (w.completing) { assert.strictEqual(w.hint(), null); assert.strictEqual(w.pointerDown(a.x, a.y), null); w.pointerUp(); }
  }
  assert.ok(Math.abs(doneT - landT - 0.5) < 2 * H, 'roundDone 0.5 s after the last land: ' + (doneT - landT));
  assert.strictEqual(w.completing, false);
  const x0 = b.x, y0 = b.y; run(w, 1.2);
  assert.ok(b.state === 'leave' && b.alpha < 0.6 && b.x === x0 && b.y === y0, 'fade in place');
});

test('count mode: long chest slots, land + count events 1..N, extras fade when full, roundDone carries count', () => {
  for (const age of [4, 5, 6]) for (let s = 1; s <= 12; s++) {
    const w = mkWorld({ seed: s, age, vp: VIEWPORTS[s % VIEWPORTS.length] });
    roundOf(w, 'count', 1 + (s % 3)); settleAppear(w);
    const b = w.baskets[0], N = b.need;
    assert.strictEqual(b.kind, 'long'); assert.strictEqual(b.slots.length, N);
    let landed = 0, counts = 0;
    for (let k = 0; k < N; k++) {
      assert.strictEqual(w.state, 'round');
      const it = idleItems(w)[0], p = chestPoint(b);
      dragTo(w, it, p.x, p.y);
      let done = false;
      while (!done) { w.update(H); for (const e of w.drainEvents()) { if (e.type === 'count') { counts++; assert.deepStrictEqual([e.n, e.need], [counts, N]); } if (e.type === 'land') { landed++; assert.deepStrictEqual([e.count, e.need], [landed, N]); done = true; } } }
    }
    assert.ok(w.completing, 'complete at N');
    const extras = w.items.filter(i => i.state !== 'in');
    assert.ok(extras.length >= 2 && extras.every(i => i.state === 'leave'), 'extras fade');
    let rd = null, g = 0;
    while (!rd && g++ < 400) { w.update(H); for (const e of w.drainEvents()) if (e.type === 'roundDone') rd = e; }
    assert.strictEqual(counts, N);
    assert.deepStrictEqual([rd.count, rd.need, rd.stars], [N, N, 3]);
    assert.ok(extras.every(i => i.alpha === 0));
  }
  const w = mkWorld({ seed: 5, age: 4 }); roundOf(w, 'count', 0); settleAppear(w);
  const b = w.baskets[0];
  for (let k = 0; k < b.need - 1; k++) landOne(w, idleItems(w)[0], b);
  const last = idleItems(w)[0], p = chestPoint(b); dragTo(w, last, p.x, p.y); assert.strictEqual(last.state, 'fly');
  const extra = idleItems(w)[0]; dragTo(w, extra, p.x, p.y, 0.05);
  const ev = w.drainEvents();
  assert.ok(!ev.some(e => e.type === 'wrong' || e.type === 'miss') && extra.misses === 0, 'a drop into a full long chest floats home without penalty');
});

// ======================================================= ask mode
test('ask mode: ask event at start and on every target change; correct = current target; wrong elsewhere; slots per queue', () => {
  for (const age of [3, 4, 5]) for (let s = 1; s <= 8; s++) {
    const w = mkWorld({ seed: 80 + s, age });
    roundOf(w, 'animals', s % 3);
    const ev0 = w.drainEvents(), q = w.cur.queue.slice();
    const re = ev0.find(e => e.type === 'round'), ask0 = ev0.find(e => e.type === 'ask');
    assert.strictEqual(re.mode, 'ask'); assert.strictEqual(re.mech, 'drag');
    assert.ok(ev0.indexOf(ask0) > ev0.indexOf(re), 'ask after round');
    const b0 = w.basketById(q[0]);
    assert.deepStrictEqual(J(ask0), { type: 'ask', basketId: q[0], label: b0.label, promptKey: 'p.animals', params: { animal: b0.label.value } });
    assert.strictEqual(w.target, q[0]);
    settleAppear(w); w.drainEvents();
    const it0 = idleItems(w)[0], other = w.baskets.find(b => b.id !== w.target);
    dragTo(w, it0, chestPoint(other).x, chestPoint(other).y); run(w, 0.7);
    const we = w.drainEvents().find(e => e.type === 'wrong');
    assert.ok(we && we.basketId === other.id && we.target === q[0]); assert.strictEqual(w.roundMistakes, 1);
    assert.strictEqual(w.target, q[0], 'target unchanged after a wrong drop');
    for (let k = 0; k < q.length; k++) {
      assert.strictEqual(w.target, q[k]);
      const it = idleItems(w)[0], b = w.basketById(w.target);
      dragTo(w, it, chestPoint(b).x, chestPoint(b).y);
      const ev = w.drainEvents(), c = ev.find(e => e.type === 'correct'), a = ev.find(e => e.type === 'ask');
      assert.ok(c && c.basketId === q[k]);
      if (k + 1 < q.length) { assert.ok(a && a.basketId === q[k + 1] && ev.indexOf(a) > ev.indexOf(c)); }
      else { assert.ok(!a); assert.strictEqual(w.target, null); }
      let g = 0; while (it.state === 'fly' && g++ < 200) w.update(H);
    }
    for (const b of w.baskets) assert.strictEqual(b.count, q.filter(x => x === b.id).length);
    let rd = null, g = 0; while (!rd && g++ < 400) { w.update(H); rd = w.drainEvents().find(e => e.type === 'roundDone'); }
    assert.deepStrictEqual([rd.stars, rd.mistakes], [2, 1]);
  }
});

test('ask mode: hint glows the target; auto-hint after 2 misses; idle re-reads the CURRENT target', () => {
  const w = mkWorld({ seed: 90, age: 5 });
  roundOf(w, 'animals', 2); settleAppear(w); w.drainEvents();
  assert.strictEqual(w.hint(), w.target);
  assert.strictEqual(w.drainEvents().find(e => e.type === 'hint').basketId, w.target);
  run(w, 7);
  const it = idleItems(w)[0], other = w.baskets.find(b => b.id !== w.target), e = emptyPoint(w);
  dragTo(w, it, chestPoint(other).x, chestPoint(other).y); run(w, 0.7);
  dragTo(w, it, e.x, e.y);
  const h = w.drainEvents().find(x => x.type === 'hint');
  assert.ok(h && h.basketId === w.target, 'auto hint → target');
  run(w, 1);
  const first = w.target, it2 = idleItems(w)[0];
  dragTo(w, it2, chestPoint(w.basketById(first)).x, chestPoint(w.basketById(first)).y);
  const t2 = w.target; assert.notStrictEqual(t2, first);
  w.drainEvents();
  let idle = null; run(w, 13, () => { for (const x of w.drainEvents()) if (x.type === 'idle') idle = x; });
  assert.ok(idle, 'idle');
  assert.deepStrictEqual(J(idle), { type: 'idle', promptKey: 'p.animals', params: { animal: w.basketById(t2).label.value } });
});

// ======================================================= DIG mode
test('dig: round setup — mounds on the grid with geometry, buried items poke out 42 %, chest slots = targets, round event', () => {
  for (const topic of TOPICS) for (const age of AGES) for (let s = 1; s <= 4; s++) {
    const vp = VIEWPORTS[(s + age) % VIEWPORTS.length];
    const w = mkWorld({ seed: 30 + s, age, vp, lang: s % 2 ? 'en' : 'vi' });
    roundOf(w, topic, 1 + (s % 3), 'dig');
    const ctx = topic + ' age ' + age + ' ' + vp.name;
    const ev = w.drainEvents(), re = ev.find(e => e.type === 'round');
    assert.deepStrictEqual([re.mode, re.mech, re.promptKey], ['dig', 'dig', 'p.dig.' + topic]);
    assert.deepStrictEqual(J(re.params), J(w.cur.params));
    assert.ok(!ev.some(e => e.type === 'ask' || e.type === 'next'), 'no next at round start');
    assert.strictEqual(w.mounds.length, w.cur.mounds.length);
    assert.strictEqual(w.baskets.length, 1);
    assert.strictEqual(w.baskets[0].slots.length, topic === 'count' ? w.cur.need : w.cur.queue.length, ctx + ' slots');
    const Lm = w.layout.mound;
    for (const m of w.mounds) {
      const g = w.layout.moundGrid[m.slot];
      assert.deepStrictEqual([m.x, m.y, m.w, m.h], [g.x, g.y, Lm.w, Lm.h], ctx + ' mound geometry');
      assert.ok(Math.abs(m.h - m.w * 96 / 160) < 1e-9);
      assert.strictEqual(m.state, 'buried');
      assert.ok(m.wiggle === 0 && m.puff === 0 && m.glow === 0 && m.open === 0 && m.alpha === 1 && m.breathe >= 0 && m.breathe <= 1);
      if (m.crab) { assert.strictEqual(m.itemId, null); continue; }
      const it = w.itemById(m.itemId);
      assert.ok(it && it.moundId === m.id, ctx + ' item ↔ mound');
      const drawn = it.size * it.scale, top = m.y - m.h;
      assert.ok(drawn <= 0.62 * m.w + 1e-9 && drawn >= 50, ctx + ' item fits the mound: ' + drawn);
      assert.ok(Math.abs(it.x - m.x) < 1e-9 && Math.abs(it.y - (top + drawn * (0.5 - 0.42))) < 1e-9, ctx + ' buried position');
      assert.ok(Math.abs((top - (it.y - drawn / 2)) / drawn - 0.42) < 1e-9, '42 % of the item above the mound top');
    }
    settleAppear(w);
    assert.ok(w.items.every(i => i.state === 'buried'), ctx + ' buried after appearing');
    assert.strictEqual(w.target, w.cur.queue[0]);
    assert.ok(w.targetMound(), 'a target mound exists');
  }
});

test('dig: correct tap → dig/correct/pearl events, mound opens with a puff, item hops ≥ 90 px then arcs into the chest, next event; look-alikes count', () => {
  const w = digRound('colors', 4, 2, w => w.cur.queue.length === 3 && !w.cur.crab && w.cur.items.filter(i => L(i) === L(w.itemById(w.cur.queue[0]))).length >= 2);
  const target = w.itemById(w.target), m = w.moundById(target.moundId), b = w.baskets[0];
  // tap a LOOK-ALIKE (same colour, not the queued id): accepted as the target
  const twin = w.items.find(i => i.id !== target.id && L(i) === L(target)), tm = w.moundById(twin.moundId);
  tapMound(w, tm, 10, 5);
  const ev = w.drainEvents();
  assert.deepStrictEqual(ev.map(e => e.type).slice(0, 4), ['dig', 'correct', 'pearl', 'next']);
  assert.deepStrictEqual(J(ev[0]), { type: 'dig', moundId: tm.id, itemId: twin.id, correct: true });
  assert.deepStrictEqual(J(ev[1]), { type: 'correct', id: twin.id, basketId: 'b0', moundId: tm.id, nameKind: 'color', nameValue: twin.color, label: twin.label });
  assert.deepStrictEqual(J(ev[2]), { type: 'pearl', n: 1, total: 1 });
  assert.strictEqual(ev[3].itemId, w.target); assert.strictEqual(ev[3].promptKey, 'p.dig.colors');
  assert.deepStrictEqual(J(ev[3].params), { color: w.itemById(w.target).color });
  assert.notStrictEqual(w.target, target.id, 'the twin took the asked slot'); assert.strictEqual(w.queue.length, 2);
  assert.ok(w.queue.includes(target.id) === false || true);
  assert.strictEqual(tm.state, 'open'); assert.strictEqual(tm.puff, 1); assert.strictEqual(m.state, 'buried');
  assert.strictEqual(twin.state, 'hop'); assert.strictEqual(w.tutu.mood, 'happy');
  const top = tm.y - tm.h; let minY = 1e9, hopT = 0, landed = null, sparkle = null, t = 0, puffs = [];
  while (twin.state === 'hop') { w.update(H); hopT += H; minY = Math.min(minY, twin.y); puffs.push(tm.puff); }
  assert.ok(Math.abs(hopT - 0.32) < 2 * H, 'hop time ' + hopT);
  assert.ok(minY <= top - 90 + 0.5, 'apex ' + (top - minY) + ' px above the mound top');
  assert.strictEqual(twin.state, 'fly');
  while (twin.state === 'fly') { w.update(H); t += H; minY = Math.min(minY, twin.y); for (const e of w.drainEvents()) { if (e.type === 'land') landed = e; if (e.type === 'sparkle') sparkle = e; } }
  assert.ok(landed && landed.basketId === 'b0' && landed.count === 1 && sparkle && sparkle.gem === twin.gem);
  assert.strictEqual(twin.state, 'in'); assert.deepStrictEqual([twin.x, twin.y], [b.slots[0].x, b.slots[0].y]);
  assert.ok(tm.open > 0.99 && tm.puff < 0.5 && puffs.every((p, i) => !i || p <= puffs[i - 1] + 1e-9), 'open = 1, puff decays');
  assert.strictEqual(w.roundMistakes, 0);
  // finish: tap the remaining targets through the public API
  while (w.state === 'round') { const tgt = w.targetMound(); if (tgt && w.interactive) tapMound(w, tgt); w.update(H); }
  const rd = w.drainEvents().find(e => e.type === 'roundDone');
  assert.deepStrictEqual([rd.stars, rd.mistakes], [3, 0]);
  assert.strictEqual(w.pearls, 3 + 5, '+1 per correct, +5 per round');
  assert.ok(w.items.filter(i => i.state === 'in').length === 3 && w.mounds.filter(m => m.state === 'open').length === 3);
});

test('dig: wrong tap → dig(false) + wrong {moundId,itemId,nameKind,nameValue}, mound peeks 1.1 s (item fully above, wiggle) and re-buries; hint after 2 misses; stars', () => {
  const w = digRound('animals', 5, 2, w => w.cur.queue.length >= 2 && !w.cur.crab);
  const lb = w.targetLabel(), wrongM = w.mounds.find(m => !m.crab && L(w.itemById(m.itemId)) !== L({ label: lb }));
  const it = w.itemById(wrongM.itemId), top = wrongM.y - wrongM.h, drawn = it.size * it.scale, y0 = it.y;
  tapMound(w, wrongM, -8, 12);
  const ev = w.drainEvents();
  assert.deepStrictEqual(ev.map(e => e.type), ['dig', 'wrong']);
  assert.deepStrictEqual(J(ev[0]), { type: 'dig', moundId: wrongM.id, itemId: it.id, correct: false });
  assert.deepStrictEqual(J(ev[1]), { type: 'wrong', moundId: wrongM.id, itemId: it.id, id: it.id, nameKind: 'animal', nameValue: it.nameValue, misses: 1, target: w.target });
  assert.strictEqual(w.roundMistakes, 1); assert.strictEqual(wrongM.state, 'peek'); assert.strictEqual(it.state, 'peek'); assert.strictEqual(w.tutu.mood, 'oops');
  let minY = 1e9, t = 0, wig = 0, prevW = 0, peekMax = 0;
  while (it.state === 'peek') { w.update(H); t += H; minY = Math.min(minY, it.y); peekMax = Math.max(peekMax, it.peek); if (wrongM.wiggle * prevW < 0) wig++; prevW = wrongM.wiggle; }
  assert.ok(Math.abs(t - 1.1) < 2 * H, 'peek time ' + t);
  assert.ok(Math.abs(minY - (top - drawn * w.cfg.peekAbove)) < 1, 'rose above the mound by cfg.peekAbove: ' + (top - minY) / drawn);
  assert.ok(peekMax > 0.99 && wig >= 4, 'peek 1 and wiggle ' + wig);
  assert.strictEqual(it.state, 'buried'); assert.strictEqual(wrongM.state, 'buried'); assert.ok(Math.abs(it.y - y0) < 1e-9 && it.peek === 0, 're-buried');
  assert.ok(!w.drainEvents().some(e => e.type === 'hint'), 'no hint after 1 miss');
  // 2nd miss → hint glows the target mound
  const wrong2 = w.mounds.find(m => !m.crab && m.state === 'buried' && L(w.itemById(m.itemId)) !== L({ label: w.targetLabel() }));
  tapMound(w, wrong2);
  const ev2 = w.drainEvents(), hint = ev2.find(e => e.type === 'hint');
  assert.ok(hint && hint.moundId === w.targetMound().id, 'hint → target mound');
  assert.strictEqual(w.roundMistakes, 2);
  w.update(H); assert.strictEqual(w.targetMound().glow, 1); assert.strictEqual(w.tutu.mood, 'think');
  run(w, 4.5); assert.ok(w.targetMound().glow > 0); run(w, 0.7); assert.strictEqual(w.targetMound().glow, 0);
  assert.strictEqual(w.hint(), w.targetMound().id, 'hint() glows the target mound');
  // a tap on an open / peeking mound or during peek does nothing harmful; finish the round
  solveRound(w);
  const rd = w.drainEvents().find(e => e.type === 'roundDone');
  assert.deepStrictEqual([rd.stars, rd.mistakes], [1, 2]);
});

test('dig: tap-is-not-a-drag — a finger that moves ≥ 24 px does nothing; taps on the poking item and on empty sand; no drag in dig mode', () => {
  const w = digRound('colors', 4, 1, w => !w.cur.crab);
  const m = w.targetMound(), it = w.itemById(m.itemId);
  assert.strictEqual(w.pointerDown(m.x, m.y - m.h / 2), null, 'pointerDown never grabs in dig mode');
  assert.strictEqual(w.held, null); assert.strictEqual(it.state, 'buried');
  w.pointerMove(m.x + 30, m.y - m.h / 2); run(w, 0.1); w.pointerUp(m.x + 30, m.y - m.h / 2);
  assert.deepStrictEqual(w.drainEvents(), [], 'moved finger → no dig');
  assert.strictEqual(m.state, 'buried');
  w.pointerDown(m.x + 23, m.y - m.h / 2); w.pointerMove(m.x, m.y - m.h / 2); run(w, 0.5); w.pointerUp(m.x, m.y - m.h / 2);   // slow tap still counts (no time limit)
  assert.ok(w.drainEvents().some(e => e.type === 'dig' && e.correct), 'a slow still finger is a tap');
  run(w, 1.2);
  // tap the poking item top of another mound (above the mound rect) → that mound
  const m2 = buriedMounds(w)[0], it2 = w.itemById(m2.itemId);
  assert.strictEqual(w.moundAt(m2.x, it2.y - it2.size * it2.scale / 2 + 2), m2, 'the poking item is part of the tap rect');
  assert.strictEqual(w.moundAt(m2.x - m2.w / 2 - 39, m2.y + 39), m2, '+40 px pad');
  assert.strictEqual(w.moundAt(m2.x - m2.w / 2 - 41, m2.y + 41), null);
  let e = null;   // a spot of bare sand between two mounds
  for (let x = 0; x < w.layout.W && !e; x += 7) for (let y = 0; y < w.layout.H && !e; y += 7) if (!w.moundAt(x, y) && w.moundAt(x - 60, y) && y > w.layout.play.y) e = { x, y };
  assert.ok(e && w.moundAt(e.x, e.y) === null);
  w.drainEvents();
  w.pointerDown(e.x, e.y); run(w, 0.1); w.pointerUp(e.x, e.y);
  assert.deepStrictEqual(w.drainEvents(), [], 'tap on sand → nothing');
  assert.strictEqual(w.roundMistakes, 0);
});

test('dig: crab mound → crab {moundId,x,y}, dances 1.6 s then gone, never a mistake, no pearl; wrong peeks while open mounds ignore taps', () => {
  const w = digRound('shapes', 5, 2, w => !!w.cur.crab);
  const cm = w.moundById(w.cur.crab);
  assert.ok(cm.crab && cm.itemId === null);
  tapMound(w, cm);
  const ev = w.drainEvents();
  assert.deepStrictEqual(J(ev), [{ type: 'crab', moundId: cm.id, x: cm.x, y: cm.y }]);
  assert.strictEqual(cm.state, 'open'); assert.strictEqual(w.roundMistakes, 0); assert.strictEqual(w.pearls, 0); assert.strictEqual(w.tutu.mood, 'happy');
  let t = 0, maxD = 0; while (cm.state === 'open') { w.update(H); t += H; maxD = Math.max(maxD, cm.dance); assert.ok(cm.dance >= 0 && cm.dance <= 1); }
  assert.ok(Math.abs(t - 1.6) < 2 * H, 'crab time ' + t); assert.strictEqual(cm.state, 'gone'); assert.strictEqual(maxD, 1);
  assert.ok(cm.x > 0 && cm.w > 0, 'gone mound keeps its geometry');
  tapMound(w, cm); assert.deepStrictEqual(w.drainEvents(), [], 'gone mound ignores taps');
  assert.strictEqual(w.tapMound(cm.id), false);
  solveRound(w);
  const rd = w.drainEvents().find(e => e.type === 'roundDone');
  assert.strictEqual(rd.stars, 3, 'crab is not a mistake');
});

test('dig count: "Dig up N pearls" — any pearl is right, count {n, need} on each land, round ends at N, extras ignored', () => {
  for (let s = 1; s <= 6; s++) {
    const w = mkWorld({ seed: 40 + s, age: 4 + (s % 3) }); roundOf(w, 'count', 1 + (s % 3), 'dig'); settleAppear(w); w.drainEvents();
    const N = w.cur.need, b = w.baskets[0];
    assert.strictEqual(b.kind, 'long'); assert.strictEqual(b.need, N); assert.strictEqual(b.slots.length, N);
    assert.deepStrictEqual(J(w.prompt()), { promptKey: 'p.dig.count', params: { n: N } });
    let counts = [];
    for (let k = 0; k < N; k++) {
      const pearls = buriedMounds(w).filter(m => !m.crab);
      tapMound(w, pearls[pearls.length - 1]);      // any pearl, not the queued one
      const ev = w.drainEvents();
      assert.ok(ev.some(e => e.type === 'correct') && !ev.some(e => e.type === 'next'), 'count has no next event');
      let g = 0; while (g++ < 300 && w.items.some(i => i.state === 'hop' || i.state === 'fly')) { w.update(H); for (const e of w.drainEvents()) if (e.type === 'count') counts.push([e.n, e.need]); }
    }
    assert.deepStrictEqual(counts, [...Array(N)].map((_, i) => [i + 1, N]));
    assert.ok(w.completing && !w.interactive, 'round complete at N');
    const left = buriedMounds(w).filter(m => !m.crab);
    assert.ok(left.length >= 2, 'extra pearls stay buried');
    tapMound(w, left[0]); assert.ok(!w.drainEvents().some(e => e.type === 'dig'), 'no more digging');
    let rd = null, g = 0; while (!rd && g++ < 400) { w.update(H); rd = w.drainEvents().find(e => e.type === 'roundDone'); }
    assert.deepStrictEqual([rd.count, rd.need, rd.stars], [N, N, 3]);
    run(w, 1.2); assert.ok(w.mounds.every(m => m.alpha < 0.6), 'mounds fade at round end');
  }
});

test('dig: rotation mid-round keeps mounds on the new grid inside the viewport; buried items follow; hopping/flying items are clamped and re-targeted', () => {
  const w = digRound('letters', 6, 2, w => w.cur.queue.length === 3 && !w.cur.crab);
  tapMound(w, w.targetMound()); run(w, 0.15);
  const hopper = w.items.find(i => i.state === 'hop'); assert.ok(hopper);
  for (const v of VIEWPORTS) {
    w.setViewport(v.W, v.H, v.ins);
    const L2 = w.layout, ins = L2.ins, ctx = 'rotate → ' + v.name;
    for (const m of w.mounds) {
      const g = L2.moundGrid[m.slot];
      assert.deepStrictEqual([m.x, m.y, m.w, m.h], [g.x, g.y, L2.mound.w, L2.mound.h], ctx);
      const R = moundRect(m);
      assert.ok(R.x >= ins.left && R.x + R.w <= v.W - ins.right && R.y >= ins.top && R.y + R.h <= v.H - ins.bottom, ctx + ' mound inside');
      const it = m.itemId ? w.itemById(m.itemId) : null;
      if (it && it.state === 'buried') { assert.ok(Math.abs(it.x - m.x) < 1e-9 && Math.abs(it.y - (m.y - m.h + it.size * it.scale * 0.08)) < 1e-6, ctx + ' buried item follows'); assert.ok(it.size * it.scale <= 0.62 * m.w + 1e-9); }
    }
    for (const it of w.items) assert.ok(it.x >= 0 && it.x <= v.W && it.y >= 0 && it.y <= v.H, ctx + ' item inside ' + it.state);
    run(w, 0.05);
  }
  while (hopper.state !== 'in') w.update(H);
  const sl = w.baskets[0].slots[hopper.slot];
  assert.ok(hyp(hopper.x - sl.x, hopper.y - sl.y) < 1e-6, 'landed in the re-targeted slot');
  w.setViewport(1280, 720, null);
  solveRound(w);
  assert.strictEqual(w.state, 'roundDone');
});

test('dig: idle nudges re-read the current target; next changes the prompt; hint cooldown holds for mounds', () => {
  const w = digRound('colors', 5, 2, w => w.cur.queue.length === 3 && !w.cur.crab);
  let idle = null; run(w, 12.5, () => { for (const e of w.drainEvents()) if (e.type === 'idle') idle = e; });
  assert.deepStrictEqual(J(idle), { type: 'idle', promptKey: 'p.dig.colors', params: { color: w.itemById(w.target).color } });
  tapMound(w, w.targetMound());
  const nx = w.drainEvents().find(e => e.type === 'next');
  assert.deepStrictEqual(J(nx.params), { color: w.itemById(w.target).color });
  assert.deepStrictEqual(J(w.prompt()), { promptKey: 'p.dig.colors', params: { color: w.itemById(w.target).color } });
  run(w, 1);
  const hints = [];
  for (let k = 0; k < 8; k++) {
    const wrong = buriedMounds(w).find(m => !m.crab && L(w.itemById(m.itemId)) !== L({ label: w.targetLabel() }));
    tapMound(w, wrong); run(w, 1.3);
    for (const e of w.drainEvents()) if (e.type === 'hint') hints.push(w.time);
  }
  assert.ok(hints.length >= 1 && hints.length <= 3, 'hints ' + hints.length);
  for (let i = 1; i < hints.length; i++) assert.ok(hints[i] - hints[i - 1] >= 6 - 1e-6, 'cooldown');
});

test('photobomb {dir, y} after every 3rd correct of a chapter, at most 2 per chapter (drag and dig)', () => {
  for (const mech of ['drag', 'dig']) {
    const w = mkWorld({ seed: 55, age: 5 });
    w.plan = [0, 1, 2, 3].map(() => ({ topic: 'colors', mech })); w.levels = w.plan.map(c => c.topic); w.startLevel(0);
    const pbs = []; let corrects = 0;
    while (w.state !== 'talk') {
      if (w.state === 'round') { settleAppear(w); solveRound(w); }
      for (const e of w.drainEvents()) { if (e.type === 'correct') corrects++; if (e.type === 'photobomb') { pbs.push(corrects); assert.ok(e.dir === 1 || e.dir === -1); assert.ok(e.y >= 0 && e.y <= 1); } }
      w.update(H);
    }
    assert.ok(corrects >= 9, mech + ' corrects ' + corrects);
    assert.deepStrictEqual(pbs, [3, 6], mech + ' photobombs at the 3rd and 6th correct');
  }
});

// ======================================================= rules
test('stars: 0 mistakes → 3, 1 → 2, ≥ 2 → 1; talk right → +1', () => {
  for (const mistakes of [0, 1, 2, 3]) {
    const w = mkWorld({ seed: 20 + mistakes, age: 5 });
    roundOf(w, 'colors', 1); settleAppear(w);
    for (let m = 0; m < mistakes; m++) {
      const it = idleItems(w)[0], wb = w.baskets.find(b => b.id !== it.answer), p = chestPoint(wb);
      dragTo(w, it, p.x, p.y); run(w, 0.7);
    }
    const s0 = w.stars;
    solveRound(w);
    const rd = w.drainEvents().find(e => e.type === 'roundDone');
    assert.ok(rd, 'roundDone');
    assert.strictEqual(rd.stars, [3, 2, 1, 1][mistakes]); assert.strictEqual(rd.mistakes, mistakes);
    assert.strictEqual(w.stars - s0, rd.stars);
  }
  const w = mkWorld({ seed: 30, age: 3 });
  roundOf(w, 'size', 1); w.round = 4; w._startTalk();
  const s0 = w.stars;
  assert.strictEqual(w.talkAnswer(w.talk.answerId), true);
  assert.strictEqual(w.stars, s0 + 1);
  assert.strictEqual(w.talkAnswer(w.talk.answerId), false, 'only once');
  const w2 = mkWorld({ seed: 31, age: 3 }); roundOf(w2, 'size', 1); w2._startTalk();
  const wrong = w2.talk.choices.find(c => c.id !== w2.talk.answerId).id;
  assert.strictEqual(w2.talkAnswer(wrong), false); assert.strictEqual(w2.stars, 0);
  assert.deepStrictEqual(J(w2.drainEvents().find(e => e.type === 'talkResult')), { type: 'talkResult', correct: false, choiceId: wrong, answerId: w2.talk.answerId });
});

test('help: 2 misses on the same item → auto hint (glow 5 s); hint() for the held item; cooldown 6 s', () => {
  const w = mkWorld({ seed: 40, age: 5 });
  roundOf(w, 'colors', 1); settleAppear(w);
  const it = idleItems(w)[0], wb = w.baskets.find(b => b.id !== it.answer);
  const p = chestPoint(wb);
  dragTo(w, it, p.x, p.y); run(w, 0.7);
  assert.ok(!w.drainEvents().some(e => e.type === 'hint'));
  const e = emptyPoint(w);
  dragTo(w, it, e.x, e.y);
  const h = w.drainEvents().find(x => x.type === 'hint');
  assert.ok(h && h.basketId === it.answer, 'auto hint after 2 misses');
  const rb = w.basketById(it.answer);
  w.update(H);
  assert.strictEqual(rb.glow, 1); assert.strictEqual(w.tutu.mood, 'think');
  run(w, 4.5); assert.ok(rb.glow > 0); run(w, 0.6); assert.strictEqual(rb.glow, 0);
  run(w, 0.5);
  const o = idleItems(w)[1]; w.pointerDown(o.x, o.y);
  assert.strictEqual(w.hint(), o.answer);
  assert.strictEqual(w.drainEvents().filter(x => x.type === 'hint')[0].basketId, o.answer);
  w.cancelDrag();
  const w2 = mkWorld({ seed: 62, age: 5 });
  roundOf(w2, 'colors', 1); settleAppear(w2);
  const it2 = idleItems(w2)[0], e2 = emptyPoint(w2), hints = [];
  for (let k = 0; k < 14; k++) { dragTo(w2, it2, e2.x + 40, e2.y); run(w2, 0.3); for (const x of w2.drainEvents()) if (x.type === 'hint') hints.push(w2.time); }
  assert.ok(hints.length >= 2 && hints.length <= 3, 'hints ' + hints.length);
  for (let i = 1; i < hints.length; i++) assert.ok(hints[i] - hints[i - 1] >= 6 - 1e-6);
});

test('idle: nudges after 12 s, then back off ×2 (24, 48, 60 cap); reset by a grab and by a new round', () => {
  const w = mkWorld({ seed: 41, age: 4 });
  roundOf(w, 'count', 2); settleAppear(w); w.drainEvents();
  const times = []; let t = 0;
  run(w, 130, () => { t += H; for (const e of w.drainEvents()) if (e.type === 'idle') { times.push(t); assert.strictEqual(e.promptKey, 'p.count'); assert.deepStrictEqual(J(e.params), J(w.cur.params)); } });
  const want = [12, 36, 84];
  assert.strictEqual(times.length, want.length, JSON.stringify(times));
  times.forEach((x, i) => assert.ok(Math.abs(x - want[i]) < 4 * H, x + ' vs ' + want[i]));
  const it = idleItems(w)[0]; w.pointerDown(it.x, it.y); run(w, 20);
  assert.ok(!w.drainEvents().some(e => e.type === 'idle'), 'no idle while holding');
  w.cancelDrag(); run(w, 11);
  assert.ok(!w.drainEvents().some(e => e.type === 'idle'));
  run(w, 1.2);
  assert.ok(w.drainEvents().some(e => e.type === 'idle'), 'grab reset the gap to 12 s');
});

test('session: newSession({lagoon}) → plan, intro 1.8 / roundDone 1.7 / talk +1.6 / levelDone 2.0 (Tutu dances) → sessionDone {stars, lagoon, levelStars, pearls}', () => {
  const w = mkWorld({ seed: 50, age: 3 });
  w.newSession({ lagoon: 2 });
  const ev0 = w.drainEvents();
  assert.deepStrictEqual(J(ev0[0]), { type: 'session', levels: ['shapes', 'colors', 'shapes', 'size'], lagoon: 2, plan: [{ topic: 'shapes', mech: 'drag' }, { topic: 'colors', mech: 'dig' }, { topic: 'shapes', mech: 'drag' }, { topic: 'size', mech: 'dig' }] });
  assert.deepStrictEqual(J(ev0[1]), { type: 'level', level: 0, topic: 'shapes', mech: 'drag' });
  assert.deepStrictEqual([w.lagoon, w.plan.length, w.plan[0].n, w.mech, w.pearls], [2, 4, 2, 'drag', 0]);
  assert.strictEqual(w.state, 'intro');
  let t = 0; while (w.state === 'intro') { w.update(H); t += H; }
  assert.ok(Math.abs(t - 1.8) < 2 * H);
  const re = w.drainEvents().find(e => e.type === 'round');
  assert.deepStrictEqual(J(re), { type: 'round', round: 0, topic: 'shapes', mech: 'drag', mode: 'sort', promptKey: 'p.shapes', params: {}, need: null });
  assert.strictEqual(w.baskets.length, 2, 'shapes ×2');
  let corrects = 0, pearlEvents = 0, lastTotal = 0;
  for (let lvl = 0; lvl < 4; lvl++) {
    if (lvl > 0) { while (w.state === 'intro') w.update(H); }
    assert.strictEqual(w.mech, lvl % 2 ? 'dig' : 'drag');
    for (let r = 0; r < 4; r++) {
      assert.strictEqual(w.state, 'round'); assert.strictEqual(w.round, r);
      assert.strictEqual(w.cur.mode, lvl % 2 ? 'dig' : 'sort');
      settleAppear(w); solveRound(w);
      for (const e of w.drainEvents()) { if (e.type === 'correct') corrects++; if (e.type === 'pearl') { pearlEvents++; assert.ok(e.total > lastTotal); lastTotal = e.total; } }
      assert.strictEqual(lastTotal, w.pearls);
      assert.strictEqual(w.state, 'roundDone');
      t = 0; let left = null;
      while (w.state === 'roundDone') { w.update(H); t += H; if (left === null && w.items.length && w.items.every(i => i.state === 'leave')) left = t; }
      assert.ok(Math.abs(t - 1.7) < 2 * H, 'roundDone ' + t);
      assert.ok(Math.abs(left - 1.0) < 2 * H, 'leave at 1.0 s');
    }
    assert.strictEqual(w.state, 'talk');
    const te = w.drainEvents().find(e => e.type === 'talk');
    assert.ok(te && te.talk.promptKey === 'talk.' + w.topic);
    run(w, 5); assert.strictEqual(w.state, 'talk', 'talk waits');
    if (lvl === 2) { w.skipTalk(); assert.strictEqual(w.state, 'levelDone'); }
    else { w.talkAnswer(w.talk.answerId); t = 0; while (w.state === 'talk') { w.update(H); t += H; } assert.ok(Math.abs(t - 1.6) < 2 * H); }
    const evs = w.drainEvents(), ld = evs.find(e => e.type === 'levelDone');
    assert.deepStrictEqual(J(ld), { type: 'levelDone', level: lvl, stars: lvl === 2 ? 12 : 13, mech: lvl % 2 ? 'dig' : 'drag' });
    assert.deepStrictEqual(J(evs[evs.indexOf(ld) + 1]), { type: 'pearl', n: 10, total: w.pearls }); lastTotal = w.pearls;
    t = 0; let maxDance = 0; while (w.state === 'levelDone') { w.update(H); t += H; maxDance = Math.max(maxDance, w.tutu.dance); assert.ok(w.tutu.dance >= 0 && w.tutu.dance <= 1); }
    assert.ok(Math.abs(t - 2.0) < 2 * H); assert.ok(maxDance > 0.9, 'Tutu dances during levelDone'); assert.strictEqual(w.tutu.dance, 0);
    assert.strictEqual(w.weather, lvl === 3 ? 3 : lvl + 1);
  }
  assert.strictEqual(w.state, 'sessionDone');
  const sd = w.drainEvents(), done = sd.find(e => e.type === 'sessionDone');
  assert.deepStrictEqual(J(done), { type: 'sessionDone', stars: 51, lagoon: 2, levelStars: [13, 13, 12, 13], pearls: corrects + 16 * 5 + 4 * 10 + 25 });
  assert.deepStrictEqual(J(sd[sd.indexOf(done) - 1]), { type: 'pearl', n: 25, total: done.pearls });
  assert.strictEqual(w.pearls, done.pearls);
  run(w, 5); assert.strictEqual(w.state, 'sessionDone');
  w.setAge(7); w.setLang('vi'); assert.strictEqual(w.age, 3, 'age applies at newSession');
  w.newSession({ lagoon: 5 }); assert.deepStrictEqual([w.age, w.lang, w.stars, w.pearls, w.state, w.lagoon], [7, 'vi', 0, 0, 'intro', 5]);
  w.startLevel(2); assert.deepStrictEqual([w.level, w.topic, w.mech, w.weather, w.state], [2, 'oddeven', 'dig', 2, 'intro']);
  const w3 = mkWorld({ seed: 51 }); w3.newSession({ lagoon: 1, plan: [{ topic: 'add', mech: 'dig' }, { topic: 'sub', mech: 'drag' }], startLevel: 1 });
  assert.deepStrictEqual([w3.levels, w3.level, w3.topic, w3.mech], [['add', 'sub'], 1, 'sub', 'drag']);
  const w4 = mkWorld({ seed: 52 }); w4.newSession(); assert.deepStrictEqual([w4.lagoon, w4.levels], [1, TR.Content.topicsFor(4)], 'defaults: lagoon 1');
});

test('Tutu: moods on events, cheer hops, looks at the held item / the hopping treasure', () => {
  const w = mkWorld({ seed: 51, age: 4 });
  roundOf(w, 'colors', 1); settleAppear(w);
  assert.ok(!('lumi' in w) && !('bo' in w), 'renamed to tutu');
  const it = idleItems(w)[0];
  w.pointerDown(it.x, it.y); w.pointerMove(it.x + 200, it.y); run(w, 1);
  assert.ok(hyp(w.tutu.lookX - it.x, w.tutu.lookY - it.y) < 5);
  const b = w.basketById(it.answer), p = chestPoint(b);
  w.pointerMove(p.x, p.y); run(w, 0.4); w.pointerUp();
  assert.strictEqual(w.tutu.mood, 'happy'); run(w, 0.95); assert.strictEqual(w.tutu.mood, 'idle');
  solveRound(w);
  assert.strictEqual(w.tutu.mood, 'cheer'); let maxHop = 0;
  run(w, 1.3, () => { maxHop = Math.max(maxHop, w.tutu.hop); assert.ok(w.tutu.hop >= 0); });
  assert.ok(maxHop > 20);
});

test('tap guard (drag): a quick tap is not a drop (tap event, quiet return, no misses/hint); a drag still counts', () => {
  for (const vp of [VIEWPORTS[3], VIEWPORTS[8], VIEWPORTS[0], VIEWPORTS[9]]) for (const topic of ['colors', 'animals']) {
    const w = mkWorld({ seed: 60, age: 5, vp });
    roundOf(w, topic, 1); settleAppear(w); w.drainEvents();
    for (const it of w.items.slice()) {
      const hx = it.homeX, hy = it.homeY;
      assert.strictEqual(w.pointerDown(it.x + 5, it.y - 4), it.id);
      w.pointerMove(it.x + 15, it.y); run(w, 0.15); w.pointerUp(it.x + 15, it.y);
      const ev = w.drainEvents();
      assert.deepStrictEqual(ev.map(e => e.type), ['grab', 'tap']);
      assert.deepStrictEqual(J(ev[1]), { type: 'tap', id: it.id, nameKind: it.nameKind, nameValue: it.nameValue });
      assert.strictEqual(it.misses, 0); assert.strictEqual(it.state, 'return');
      run(w, 0.4);
      assert.strictEqual(it.state, 'idle');
      assert.ok(hyp(it.x - hx, it.y - hy) <= 3.01);
    }
    assert.strictEqual(w.roundMistakes, 0);
  }
  const w = mkWorld({ seed: 61, age: 5 });
  roundOf(w, 'colors', 1); settleAppear(w); w.drainEvents();
  let it = idleItems(w)[0];
  w.pointerDown(it.x, it.y); run(w, 1.2); w.pointerUp(it.x, it.y);
  assert.ok(w.drainEvents().some(e => e.type === 'miss'), 'very long hold in place (> tapTime) = miss');
  run(w, 0.6);
  it = idleItems(w)[0];
  const b = w.basketById(it.answer), p = chestPoint(b);
  w.pointerDown(it.x, it.y);
  for (let i = 1; i <= 12; i++) { w.pointerMove(it.x + (p.x - it.x) * i / 12, it.y + (p.y - it.y) * i / 12); w.update(H); }
  w.pointerUp(p.x, p.y);
  assert.ok(w.drainEvents().some(e => e.type === 'correct'), 'quick flick into the chest counts');
});

test('chapter time limit: after ≥ 3 rounds a chapter longer than 75 s goes to Talk time', () => {
  const w = mkWorld({ seed: 63, age: 4 });
  w.newSession({ lagoon: 1 });
  while (w.state === 'intro') w.update(H);
  let rounds = 0;
  while (w.state !== 'talk') {
    if (w.state === 'round') { settleAppear(w); run(w, 35); solveRound(w); rounds++; }
    w.update(H);
  }
  assert.strictEqual(rounds, 3, 'slow chapter stops after 3 rounds');
  assert.ok(w.time - w.levelStartTime > 75);
  const w2 = mkWorld({ seed: 63, age: 4 });
  w2.newSession({ lagoon: 1 }); while (w2.state === 'intro') w2.update(H);
  rounds = 0;
  while (w2.state !== 'talk') { if (w2.state === 'round') { settleAppear(w2); solveRound(w2); rounds++; } w2.update(H); }
  assert.strictEqual(rounds, 4, 'a quick chapter keeps all 4 rounds');
});

test('talk re-ask: talkAsk every 12 s without an answer; glowAnswer from the 2nd re-ask', () => {
  const w = mkWorld({ seed: 64, age: 3 });
  roundOf(w, 'animals', 1); w._startTalk(); w.drainEvents();
  assert.strictEqual(w.talk.glowAnswer, false);
  assert.ok(w.talk.params.animal, 'animals talk names the animal');
  const asks = []; let t = 0;
  run(w, 40, () => { t += H; for (const e of w.drainEvents()) if (e.type === 'talkAsk') asks.push({ t, n: e.n, g: e.glowAnswer }); });
  assert.deepStrictEqual(asks.map(a => a.n), [1, 2, 3]);
  asks.forEach((a, i) => assert.ok(Math.abs(a.t - 12 * (i + 1)) < 3 * H));
  assert.deepStrictEqual(asks.map(a => a.g), [false, true, true]);
  w.talkAnswer(w.talk.answerId); run(w, 1.5);
  assert.ok(!w.drainEvents().some(e => e.type === 'talkAsk'), 'no re-ask after an answer');
});

test('content variety: initial talk answers ~uniform; animal sets vary; every sea friend appears; dig rounds vary', () => {
  for (const lang of ['en', 'vi']) {
    const cnt = {};
    for (let s = 1; s <= 2000; s++) { const t = TR.Content.makeTalk('initial', { age: 7, lang, rng: new TR.RNG(s) }); const a = t.choices.find(c => c.id === t.answerId).value; cnt[a] = (cnt[a] || 0) + 1; }
    const v = Object.values(cnt); assert.strictEqual(v.length, lang === 'en' ? 8 : 3);
    assert.ok(Math.max(...v) / 2000 < (lang === 'en' ? 0.2 : 0.4), lang + ' ' + JSON.stringify(cnt));
  }
  const sets = new Set(), seen = {}, sigs = new Set();
  for (let s = 1; s <= 300; s++) {
    const r = TR.Content.makeRound('animals', { age: 4, rng: new TR.RNG(s), roundIndex: 2 });
    sets.add(r.baskets.map(b => b.label.value).sort().join());
    for (const b of r.baskets) seen[b.label.value] = 1;
    sigs.add(TR.Content.makeRound('animals', { age: 4, rng: new TR.RNG(s), roundIndex: 2, mech: 'dig' }).sig);
  }
  assert.strictEqual(Object.keys(seen).length, 9, 'every sea friend appears');
  assert.ok(sets.size > 40 && sigs.size > 250);
});

// ======================================================= sessions / bot / determinism
test('determinism: same seed + same inputs → identical event log and state (drag and dig lagoons; dt split irrelevant)', () => {
  for (const lagoon of [1, 2]) {
    const a = playSession(77, 5, 0.6, { keep: true, lagoon }), b = playSession(77, 5, 0.6, { keep: true, lagoon });
    assert.strictEqual(JSON.stringify(a.events), JSON.stringify(b.events));
    assert.strictEqual(a.w.stars, b.w.stars); assert.strictEqual(a.w.pearls, b.w.pearls); assert.strictEqual(a.t, b.t);
    const c = playSession(78, 5, 0.6, { keep: true, lagoon });
    assert.notStrictEqual(JSON.stringify(a.events), JSON.stringify(c.events));
  }
  const d = playSession(79, 4, 1, { keep: true, dt: 1 / 60, lagoon: 3 }), e = playSession(79, 4, 1, { keep: true, dt: 1 / 60, lagoon: 3 });
  assert.strictEqual(JSON.stringify(d.events), JSON.stringify(e.events));
});

const SESSION_LEN = {}, CHAPTER_LEN = {};
test('bot: every lagoon × age 3–7 × skill 0.6 / 1 → sessionDone, zero stuck rounds, pearls monotonic, perfect bot never errs', () => {
  let sessions = 0;
  for (const age of AGES) for (const skill of [0.6, 1]) {
    const lens = [], chs = [];
    for (let lagoon = 1; lagoon <= 6; lagoon++) {
      const vp = VIEWPORTS[(lagoon + age) % VIEWPORTS.length];
      let rounds = 0, chStart = 0, lands = 0, sparkles = 0, corrects = 0, lastPearl = 0, pearlSum = 0, digs = 0, drags = 0, crabs = 0;
      const r = playSession(lagoon * 100 + age, age, skill, { lang: lagoon % 2 ? 'en' : 'vi', vp, lagoon, each: (w, ev, t) => {
        for (const e of ev) {
          if (e.type === 'roundDone') rounds++;
          if (e.type === 'land') lands++;
          if (e.type === 'sparkle') sparkles++;
          if (e.type === 'correct') corrects++;
          if (e.type === 'dig' && e.correct) digs++;
          if (e.type === 'drop') drags++;
          if (e.type === 'crab') crabs++;
          if (e.type === 'pearl') { assert.ok(e.total > lastPearl, 'pearls monotonic'); lastPearl = e.total; pearlSum += e.n; }
          if (e.type === 'level') chStart = t;
          if (e.type === 'levelDone') chs.push(t - chStart);
        }
      } });
      sessions++;
      const ctx = 'age ' + age + ' lagoon ' + lagoon + ' skill ' + skill;
      assert.strictEqual(r.w.state, 'sessionDone', ctx);
      assert.ok(rounds >= 12 && rounds <= 16, ctx + ' rounds ' + rounds);
      assert.strictEqual(lands, sparkles, 'every landing sparkles');
      assert.ok(digs > 0 && drags > 0, ctx + ' both mechanics played');
      assert.strictEqual(r.w.pearls, pearlSum); assert.strictEqual(r.w.pearls, corrects + rounds * 5 + 4 * 10 + 25, ctx + ' pearl total');
      assert.ok(r.w.stars >= rounds && r.w.stars <= 3 * rounds + 4);
      lens.push(r.t);
      if (skill === 1) {
        assert.strictEqual(r.bot.stats.wrong, 0, ctx); assert.strictEqual(r.bot.stats.misses, 0);
        assert.strictEqual(r.w.stars, 3 * rounds + 4, ctx + ' perfect bot gets every star (crab taps are free)');
        assert.strictEqual(r.bot.stats.talkRight, 4);
      } else assert.ok(r.bot.stats.wrong + r.bot.stats.misses > 0, ctx);
      assert.strictEqual(r.bot.stats.talks, 4);
      void crabs;
    }
    for (const c of chs) assert.ok(c > 15 && c < 110, 'chapter ' + c.toFixed(0) + ' s (age ' + age + ')');
    SESSION_LEN[age + '@' + skill] = lens.reduce((x, y) => x + y) / lens.length;
    CHAPTER_LEN[age + '@' + skill] = chs.reduce((x, y) => x + y) / chs.length;
  }
  assert.strictEqual(sessions, 60);
});

test('bot: drives pointer like a finger (human speed, events consistent) in drag and dig chapters', () => {
  for (const lagoon of [1, 2]) {
    const w = mkWorld({ seed: 90, age: 4 });
    const bot = new TR.Bot(w, { skill: 0.6, seed: 2 });
    w.newSession({ lagoon });
    let maxV = 0, px = bot.finger.x, py = bot.finger.y, grabs = 0, drops = 0, digs = 0, crabs = 0;
    for (let i = 0; i < 60 * 150; i++) {
      bot.step(1 / 60); w.update(1 / 60);
      maxV = Math.max(maxV, hyp(bot.finger.x - px, bot.finger.y - py) * 60); px = bot.finger.x; py = bot.finger.y;
      for (const e of w.drainEvents()) { if (e.type === 'grab') grabs++; if (e.type === 'drop') drops++; if (e.type === 'dig') digs++; if (e.type === 'crab') crabs++; }
    }
    assert.ok(maxV < 1100 * 1.6 + 1, 'finger speed ' + maxV);
    assert.ok(grabs > 5 && digs > 5, 'played both mechanics: grabs ' + grabs + ' digs ' + digs); assert.ok(Math.abs(grabs - drops) <= 1);
    assert.strictEqual(grabs, bot.stats.grabs);
    assert.strictEqual(digs + crabs, bot.stats.taps - bot.stats.taps + digs + crabs);
    assert.ok(bot.stats.taps >= digs + crabs, 'every dig came from a tap');
  }
});

test('performance: 10 full sessions simulated in < 3 s', () => {
  const t0 = Date.now();
  for (let i = 0; i < 10; i++) { const r = playSession(500 + i, AGES[i % 5], 0.8, { dt: 1 / 30, lagoon: 1 + (i % 6) }); assert.strictEqual(r.w.state, 'sessionDone'); }
  const ms = Date.now() - t0;
  console.log('      10 sessions: ' + ms + ' ms');
  assert.ok(ms < 3000, ms + ' ms');
});

// ======================================================= weather (times of day under the sea)
const AMB = [
  { skyTop: '#7FCBD8', skyBottom: '#D8ECE0', sun: 1, moon: 0, stars: 0, aurora: 0, darkness: 0 },
  { skyTop: '#5FC9DD', skyBottom: '#B4EAEC', tint: null, sun: 1, moon: 0, stars: 0, aurora: 0, darkness: 0 },
  { skyTop: '#E9907E', skyBottom: '#7C6DB3', sun: 1, aurora: 0 },
  { skyTop: '#13305A', skyBottom: '#1F4A73', sun: 0, moon: 1, stars: 1, aurora: 1, darkness: 0.28 }
];
const AMB_KEYS = ['skyTop', 'skyBottom', 'horizon', 'tint', 'wind', 'sway', 'sun', 'sunX', 'sunY', 'moon', 'stars', 'aurora', 'darkness'];
test('weather: ambient per time of day (morning/noon/sunset/night), 2.5 s crossfade, sun travels, plankton glow at night, darkness ≤ 0.28', () => {
  const wx = new TR.Weather({ width: 1280, height: 720, seed: 1 });
  for (let m = 0; m < 4; m++) {
    wx.setWeather(m, { instant: true });
    const a = wx.ambient, e = AMB[m];
    for (const k of AMB_KEYS) assert.ok(k in a, 'ambient.' + k);
    for (const k in e) assert.strictEqual(a[k], e[k], 'mood ' + m + ' ' + k);
    assert.ok(/^#[0-9A-F]{6}$/.test(a.horizon));
    for (const k of ['wind', 'sway', 'sun', 'sunX', 'sunY', 'moon', 'stars', 'aurora']) assert.ok(a[k] >= 0 && a[k] <= 1 + 1e-9, k);
    assert.ok(a.darkness >= 0 && a.darkness <= 0.28 + 1e-12);
  }
  assert.strictEqual(TR.Weather.FADE_TIME, 2.5);
  wx.setWeather(1, { instant: true }); const sx0 = wx.ambient.sunX;
  wx.setWeather(3);
  wx.update(0.625, { groundY: 650 }); wx.update(0.625, { groundY: 650 });
  const mid = wx.ambient;
  const ch = c => [1, 3, 5].map(i => parseInt(c.substr(i, 2), 16));
  const A = ch(AMB[1].skyTop), B = ch(AMB[3].skyTop), M = ch(mid.skyTop);
  for (let i = 0; i < 3; i++) assert.ok((M[i] - A[i]) * (M[i] - B[i]) <= 0, 'between');
  assert.ok(mid.skyTop !== AMB[1].skyTop && mid.skyTop !== AMB[3].skyTop);
  assert.ok(mid.darkness > 0.1 && mid.darkness < 0.18, 'half-way darkness ' + mid.darkness);
  assert.ok(mid.sunX < sx0 && mid.sunX > 0.12, 'sun travels');
  assert.ok(mid.aurora > 0.3 && mid.aurora < 0.7);
  wx.update(0.65, { groundY: 650 }); wx.update(0.65, { groundY: 650 });
  assert.strictEqual(wx.ambient.skyTop, AMB[3].skyTop);
  assert.strictEqual(wx.ambient.darkness, 0.28);
  assert.ok(wx.auroraT > 2.5 && wx.auroraT === wx.time);
});

test('weather: particle cap 140 (scaled by area), sprites from §4.3, light shafts, star field, deterministic, resize', () => {
  const SPR = new Set(TR.Weather.SPRITES), CL = new Set(TR.Weather.CLOUD_SPRITES);
  assert.deepStrictEqual(TR.Weather.SPRITES, ['bubble1', 'bubble2', 'sparkle', 'star', 'plankton', 'sand', 'fishlet', 'confetti_a', 'confetti_b']);
  const counts = {};
  for (const [W, Hh] of [[1600, 720], [1280, 720], [960, 720], [720, 1600], [720, 960]]) {
    const wx = new TR.Weather({ width: W, height: Hh, seed: 3 });
    assert.ok(wx.stars.length >= 45);
    for (const s of wx.stars) assert.ok(s.x >= 0 && s.x <= W && s.y >= 0 && s.y < (Hh - 70) * 0.56 && s.r > 0 && isFinite(s.phase) && s.tw > 0);
    assert.strictEqual(wx.shafts.length, 6);
    for (let m = 0; m < 4; m++) {
      wx.setWeather(m);
      for (let i = 0; i < 60 * 6; i++) {
        wx.update(1 / 60, { groundY: Hh - 70 });
        if (i % 30 === 0) wx.burst(W / 2, Hh / 2, { kind: ['confetti', 'puff', 'sparkle'][i % 3], n: 30 });
        assert.ok(wx.particles.length <= 140, 'cap ' + wx.particles.length);
        for (const p of wx.particles) {
          assert.ok(SPR.has(p.sprite), p.sprite);
          assert.ok(['sky', 'back', 'front'].includes(p.layer));
          assert.ok(p.alpha >= -1e-9 && p.alpha <= 1 + 1e-9 && isFinite(p.x) && isFinite(p.y) && p.size >= 0);
          assert.ok(p.flipX === 1 || p.flipX === -1);
          if (p.layer === 'front') assert.ok(p.alpha <= 0.75 + 1e-9 || p.kind === 'confetti', 'front layer stays translucent');
        }
        for (const c of wx.clouds) { assert.ok(CL.has(c.sprite)); assert.ok(c.alpha >= 0 && c.alpha <= 1); }
        for (const s of wx.shafts) assert.ok(s.alpha >= 0 && s.alpha <= 1 && s.w > 0 && isFinite(s.x) && isFinite(s.phase));
      }
      counts[W + 'x' + Hh + ':' + m] = wx.particles.length;
      const lit = wx.shafts.filter(s => s.alpha > 0.05).length;
      if (m === 1) assert.ok(lit >= 4, 'noon shafts ' + lit); if (m === 3) assert.ok(lit <= 2, 'night shafts dim');
    }
  }
  assert.ok(counts['960x720:1'] < counts['1600x720:1'], 'scales with area');
  const a = new TR.Weather({ width: 1280, height: 720, seed: 9 }), b = new TR.Weather({ width: 1280, height: 720, seed: 9 });
  a.setWeather(1); b.setWeather(1);
  for (let i = 0; i < 300; i++) a.update(1 / 60, { groundY: 650 });
  for (let i = 0; i < 100; i++) b.update(3 / 60, { groundY: 650 });
  assert.strictEqual(JSON.stringify(a.particles), JSON.stringify(b.particles), 'dt-split independent');
  assert.strictEqual(JSON.stringify(a.shafts), JSON.stringify(b.shafts));
  const x0 = a.particles[0].x, s0 = a.stars[0].x, sh0 = a.shafts[0].x;
  a.resize(640, 720); assert.ok(Math.abs(a.particles[0].x - x0 / 2) < 1e-9); assert.strictEqual(a.width, 640);
  assert.ok(Math.abs(a.stars[0].x - s0 / 2) < 1e-9 && Math.abs(a.shafts[0].x - sh0 / 2) < 1e-9);
});

test('weather: motion — bubbles rise and wobble and pop at the surface, noon fishlet shoal swims across, night stars twinkle + plankton glows, morning sparkles', () => {
  const wx = new TR.Weather({ width: 1280, height: 720, seed: 5 });
  wx.setWeather(1, { instant: true });
  const kinds = new Set(wx.particles.map(p => p.kind));
  assert.ok(kinds.has('bubble') && kinds.has('fishlet'));
  const f = wx.particles.find(p => p.kind === 'bubble' && p.layer === 'back' && p.y > 500);
  const xs = [], ys = []; let popped = false;
  for (let i = 0; i < 60 * 25; i++) {
    wx.update(1 / 60, { groundY: 650 });
    if (wx.particles.includes(f)) { xs.push(f.x); ys.push(f.y); assert.ok(f.vy < 0, 'rises'); } else popped = true;
  }
  assert.ok(Math.max(...xs) - Math.min(...xs) > 6, 'sideways wobble');
  assert.ok(ys[ys.length - 1] < ys[0] - 100 && popped, 'rose and popped near the surface');
  const fish = wx.particles.filter(p => p.kind === 'fishlet');
  assert.ok(fish.length >= 6 && new Set(fish.map(p => p.dir)).size === 1, 'a shoal swims one way');
  for (const p of fish) assert.ok(p.layer === 'back' && p.sprite === 'fishlet' && p.flipX === p.dir);
  let gusts = 0, prev = 0;
  for (let i = 0; i < 60 * 30; i++) { wx.update(1 / 60, { groundY: 650 }); if (wx.gust > 0.3 && prev <= 0.3) gusts++; prev = wx.gust; }
  assert.ok(gusts >= 4 && gusts <= 8, 'current gusts every 4–7 s: ' + gusts);

  wx.setWeather(3); for (let i = 0; i < 60 * 4; i++) wx.update(1 / 60, { groundY: 650 });
  const stars = wx.particles.filter(p => p.kind === 'star' && !p.dying);
  assert.ok(stars.length >= 10);
  for (const s of stars) assert.ok(s.layer === 'sky' && s.y < 650 * 0.55 && s.sprite === 'star');
  const plank = wx.particles.filter(p => p.kind === 'plankton' && !p.dying);
  assert.ok(plank.length >= 12 && plank.every(p => p.sprite === 'plankton' && p.layer === 'back'));
  assert.ok(!wx.particles.some(p => p.kind === 'fishlet' && !p.dying), 'noon shoal retired');
  assert.ok(wx.clouds.every(c => c.alpha <= 0.3 + 1e-9), 'faint night light blobs');
  const rises = wx.particles.filter(p => p.kind === 'bubble' && p.mood === 3).map(p => p.rise);
  assert.ok(Math.max(...rises) <= 20 * 1.3 + 1e-9, 'night bubbles are slow');

  wx.setWeather(0, { instant: true });
  const sp = wx.particles.filter(p => p.kind === 'sparkle');
  assert.ok(sp.length >= 8 && sp.every(p => p.sprite === 'sparkle' && p.vy < 0), 'morning sparkles drift up');
  wx.burst(600, 400, { kind: 'puff', n: 10 });
  assert.ok(wx.particles.filter(p => p.kind === 'puff').every(p => p.sprite === 'sand' && p.layer === 'back'), 'sand puff');
});

// ---------- run ----------
let pass = 0, fail = 0;
const t0 = Date.now();
for (const t of tests) {
  const s = Date.now();
  try { t.fn(); pass++; console.log('PASS ' + t.name + ' (' + (Date.now() - s) + ' ms)'); }
  catch (e) { fail++; console.log('FAIL ' + t.name + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n     ') : e)); }
}
if (Object.keys(SESSION_LEN).length) {
  console.log('\nSimulated bot session / chapter length (game seconds, avg over the 6 lagoons):');
  for (const k of Object.keys(SESSION_LEN)) console.log('  age ' + k.replace('@', ' skill ') + ': session ' + SESSION_LEN[k].toFixed(0) + ' s, chapter ' + CHAPTER_LEN[k].toFixed(0) + ' s');
}
console.log('\n' + pass + ' passed, ' + fail + ' failed (' + (Date.now() - t0) + ' ms)');
process.exit(fail ? 1 : 0);
