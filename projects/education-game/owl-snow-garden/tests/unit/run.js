#!/usr/bin/env node
// Owlet's Snow Garden — headless unit tests for rng / content / world / weather / bot.
// Run from projects/education-game/owl-snow-garden:   node tests/unit/run.js
// (tests/unit/i18n_voice.test.js is the voice engineer's suite and runs on its own.)
'use strict';
const assert = require('assert');
const { load } = require('./load');

const SG = load();
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const H = 1 / 120;
const J = v => JSON.parse(JSON.stringify(v));
// vm-realm arrays/objects are not reference-equal to this realm's: compare through JSON
assert.deepStrictEqual = ((orig) => (a, b, m) => orig(J(a), J(b), m))(assert.deepStrictEqual);
assert.notDeepStrictEqual = ((orig) => (a, b, m) => orig(J(a), J(b), m))(assert.notDeepStrictEqual);
const hyp = (x, y) => Math.sqrt(x * x + y * y);
const AGES = [3, 4, 5, 6, 7];
const TOPICS = SG.Content.TOPICS;
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
  const w = new SG.World({ seed: o.seed || 1, age: o.age || 4, lang: o.lang || 'en', config: o.config });
  const v = o.vp || VIEWPORTS[4];
  w.setViewport(v.W, v.H, v.ins);
  return w;
}
/** Starts round `ri` of `topic` directly (skips intro). */
function roundOf(w, topic, ri) {
  w.levels = [topic, topic, topic, topic];
  w.startLevel(0);
  w.round = ri || 0;
  w._beginRound();
  return w;
}
function settleAppear(w) { let n = 0; while (!w.interactive && n++ < 1000) w.update(H); assert.ok(w.interactive, 'interactive'); }
function run(w, s, each) { const n = Math.round(s / H); for (let i = 0; i < n; i++) { if (each) each(i); w.update(H); } }
function potPoint(b) { return { x: b.x, y: b.top - 20 }; }
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
function idleItems(w) { return w.items.filter(i => i.state === 'idle'); }
function solveRound(w) {   // perfect play: every idle item into its pot (ask mode: the current target)
  let guard = 0;
  while (w.state === 'round' && guard++ < 2000) {
    const it = w.interactive ? idleItems(w)[0] : null;
    if (!it) { w.update(H); continue; }
    const b = w.basketById(w.goalOf(it)), p = potPoint(b);
    dragTo(w, it, p.x, p.y, 0.15);
    let g2 = 0; while (it.state === 'fly' && g2++ < 200) w.update(H);
  }
}
function rectsOverlap(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
function circleRect(cx, cy, r, R) {
  const nx = Math.max(R.x, Math.min(cx, R.x + R.w)), ny = Math.max(R.y, Math.min(cy, R.y + R.h));
  return hyp(cx - nx, cy - ny) < r - 1e-6;
}
function potRect(b) { return { x: b.x - b.w / 2, y: b.top, w: b.w, h: b.h }; }
function lumiRect(L) { return { x: L.lumi.x - 80, y: L.lumi.y - L.lumi.h, w: 160, h: L.lumi.h }; }
function playSession(seed, age, skill, opts) {
  opts = opts || {};
  const w = new SG.World({ seed, age, lang: opts.lang || 'en' });
  const v = opts.vp || VIEWPORTS[4];
  w.setViewport(v.W, v.H, v.ins);
  const bot = new SG.Bot(w, { skill, seed: seed * 3 + 1 });
  w.newSession();
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

// ======================================================= RNG
test('rng: deterministic, ranges, shuffle is a permutation', () => {
  const a = new SG.RNG(42), b = new SG.RNG(42), c = new SG.RNG(43);
  const sa = [], sb = [], sc = [];
  for (let i = 0; i < 500; i++) { sa.push(a.next()); sb.push(b.next()); sc.push(c.next()); }
  assert.deepStrictEqual(sa, sb); assert.notDeepStrictEqual(sa, sc);
  assert.ok(sa.every(v => v >= 0 && v < 1));
  const r = new SG.RNG('x');
  for (let i = 0; i < 1000; i++) { const k = r.int(2, 5); assert.ok(k >= 2 && k <= 5 && k === Math.floor(k)); const f = r.float(-1, 1); assert.ok(f >= -1 && f < 1); }
  const arr = [1, 2, 3, 4, 5, 6, 7, 8]; const sh = r.shuffle(arr.slice());
  assert.deepStrictEqual(sh.slice().sort(), arr);
  assert.strictEqual(new Set(r.sample(arr, 5)).size, 5);
  assert.notStrictEqual(r.fork(1).next(), r.fork(2).next());
});

// ======================================================= content tables
test('content: palette, animals, age topics and word tables exactly as DESIGN §3/§5.1', () => {
  assert.deepStrictEqual(J(SG.PALETTE.red), { fill: '#E84A4A', dark: '#A8282E' });
  assert.deepStrictEqual(J(SG.PALETTE.cream), { fill: '#FFF4DC', dark: '#C9A877' });
  assert.deepStrictEqual(Object.keys(SG.PALETTE), ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'cream']);
  assert.deepStrictEqual(SG.ANIMALS, ['bear', 'seal', 'fox', 'hare', 'reindeer', 'walrus', 'penguin', 'puffin', 'whale']);
  assert.deepStrictEqual(J(SG.AGE_TOPICS), { 3: ['colors', 'size', 'shapes', 'animals'], 4: ['colors', 'shapes', 'count', 'animals'],
    5: ['shapes', 'count', 'letters', 'animals'], 6: ['lower', 'initial', 'add', 'count'], 7: ['initial', 'add', 'sub', 'oddeven'] });
  assert.deepStrictEqual(J(SG.Content.topicsFor(9)), J(SG.AGE_TOPICS[7]));
  assert.deepStrictEqual(J(SG.Content.topicsFor(1)), J(SG.AGE_TOPICS[3]));
  const en = SG.WORDS.en.map(w => w.word + ' ' + w.initial).join(' · ');
  assert.strictEqual(en, 'bear B · fox F · hare H · penguin P · puffin P · reindeer R · seal S · walrus W · whale W');
  const vi = SG.WORDS.vi.map(w => w.word + ' ' + w.initial).join(' · ');
  assert.strictEqual(vi, 'gấu G · cáo C · cá voi C · tuần lộc T · hải cẩu H · hải mã H');
  assert.deepStrictEqual(SG.WORDS.vi.map(w => w.sprite), ['bear', 'fox', 'whale', 'reindeer', 'seal', 'walrus'].map(a => 'animal_' + a));
  for (const l of ['en', 'vi']) for (const w of SG.WORDS[l]) {
    assert.ok(SG.ANIMALS.includes(w.sprite.replace('animal_', '')), 'arctic sprites only');
    if (l === 'en') assert.strictEqual(w.initial, w.word[0].toUpperCase());
  }
  assert.ok(!SG.WORDS.vi.some(w => w.sprite === 'animal_puffin'), 'no puffin in vi words');
  assert.ok(!TOPICS.includes('homes') && TOPICS.includes('animals'));
});

const clash = cs => (cs.includes('blue') && cs.includes('purple')) || (cs.includes('red') && cs.includes('green'));

test('content: every topic × age × 600 seeds → valid, completable rounds with the §5.1 rules', () => {
  const sizeOK = { big: 1.3, small: 0.72 };
  for (const topic of TOPICS) for (const age of AGES) for (let seed = 1; seed <= 600; seed++) {
    const ri = seed % 5, lang = seed % 2 ? 'en' : 'vi';
    const r = SG.Content.makeRound(topic, { age, lang, rng: new SG.RNG(seed * 31 + age), roundIndex: ri });
    const ctx = topic + '/' + age + '/' + seed;
    assert.strictEqual(SG.Content.validate(r), null, ctx);
    assert.strictEqual(r.promptKey, 'p.' + topic);
    const per = {}; for (const b of r.baskets) per[b.id] = r.items.filter(i => i.answer === b.id);
    const n = r.baskets.length;
    for (const it of r.items) {
      assert.ok(/^i\d+$/.test(it.id)); assert.ok(it.size > 0);
      assert.ok(COLORS.includes(it.flower), ctx + ' flower colour ' + it.flower);
      if (it.sprite && it.sprite.startsWith('seed_') && it.sprite !== 'seed_plain') assert.strictEqual(it.flower, it.color, 'flower = seed colour');
    }
    for (const b of r.baskets) assert.strictEqual(b.kind, topic === 'count' ? 'planter' : 'pot');
    const cols = [...new Set(r.items.map(i => i.color).filter(c => c !== 'cream'))];
    if (age < 5 && (topic === 'colors' || topic === 'animals' || topic === 'shapes')) assert.ok(!clash(cols), ctx + ' colour-blind pair ' + cols);
    switch (topic) {
      case 'colors':
        assert.strictEqual(n, age === 3 ? 2 : age === 4 ? 3 : 4, ctx);
        for (const b of r.baskets) { assert.strictEqual(b.label.type, 'color'); assert.strictEqual(per[b.id].length, ri ? 2 : 1); for (const it of per[b.id]) assert.strictEqual(it.sprite, 'seed_' + b.label.value); }
        break;
      case 'shapes': {
        assert.strictEqual(n, age === 3 ? 2 : age === 4 ? 3 : 4, ctx);
        for (const it of r.items) { assert.strictEqual(it.sprite, null); assert.ok(it.shape && it.color); if (age < 5) assert.notStrictEqual(it.shape, 'rectangle'); }
        if (age <= 4) for (const b of r.baskets) assert.strictEqual(new Set(per[b.id].map(i => i.color)).size, 1, ctx);
        if (age <= 4) assert.strictEqual(new Set(r.items.map(i => i.color)).size, n, 'one colour per shape');
        if (age >= 5 && ri) for (const b of r.baskets) assert.strictEqual(new Set(per[b.id].map(i => i.color)).size, 2, 'mixed colours');
        break;
      }
      case 'size':
        assert.strictEqual(n, 2);
        if (ri === 0) assert.strictEqual(r.items.length, 2);
        else { assert.ok(r.items.length >= 4 && r.items.length <= 5); for (const b of r.baskets) assert.ok(per[b.id].length >= 2 && per[b.id].length <= 3); }
        assert.strictEqual(new Set(r.items.map(i => i.color)).size, 1, 'one colour');
        for (const it of r.items) { assert.strictEqual(it.scale, sizeOK[it.nameValue]); assert.strictEqual(it.sprite, 'seed_' + it.color); }
        break;
      case 'animals': {
        assert.strictEqual(r.mode, 'ask');
        assert.strictEqual(n, age === 3 ? 2 : age === 4 ? 3 : 4, ctx);
        assert.strictEqual(new Set(r.baskets.map(b => b.label.value)).size, n);
        for (const b of r.baskets) { assert.strictEqual(b.label.type, 'animal'); assert.ok(SG.ANIMALS.includes(b.label.value)); }
        const q = r.queue, cnt = {};
        assert.strictEqual(q.length, r.items.length);
        for (const id of q) cnt[id] = (cnt[id] || 0) + 1;
        for (const b of r.baskets) { const c = cnt[b.id] || 0; if (ri === 0) assert.strictEqual(c, 1, ctx + ' warm-up each pot once'); else assert.ok(c >= 1 && c <= 2, ctx); }
        for (let i = 1; i < q.length; i++) assert.notStrictEqual(q[i], q[i - 1], ctx + ' no pot twice in a row');
        assert.deepStrictEqual(J(r.params), { animal: r.baskets.find(b => b.id === q[0]).label.value });
        for (const it of r.items) { assert.strictEqual(it.answer, null); assert.strictEqual(it.sprite, 'seed_' + it.color); assert.strictEqual(it.nameKind, 'seed'); }
        break;
      }
      case 'count': {
        assert.strictEqual(r.mode, 'count'); assert.strictEqual(n, 1);
        const N = r.baskets[0].need, lo = { 3: 1, 4: 1, 5: 3, 6: 4, 7: 4 }[age], hi = { 3: 5, 4: 5, 5: 10, 6: 12, 7: 12 }[age];
        if (ri === 0) assert.ok(age >= 6 ? N >= 2 && N <= 4 : N >= 1 && N <= 3, ctx);
        else assert.ok(N >= Math.max(2, lo) && N <= hi, ctx);
        assert.strictEqual(r.items.length, N + (N <= 3 ? 3 : 2));
        assert.deepStrictEqual(J(r.params), { n: N, color: r.items[0].color });
        assert.strictEqual(new Set(r.items.map(i => i.sprite)).size, 1);
        assert.deepStrictEqual(J(r.baskets[0].label), { type: 'number', value: N });
        break;
      }
      case 'letters': case 'lower': {
        assert.strictEqual(n, 3);
        const pool = SG.Content.LETTER_POOL[lang];
        for (const b of r.baskets) { assert.ok(pool.includes(b.label.value)); for (const it of per[b.id]) { assert.strictEqual(it.sprite, 'seed_plain'); assert.strictEqual(it.text, topic === 'lower' ? b.label.value.toLowerCase() : b.label.value); } }
        break;
      }
      case 'initial':
        assert.strictEqual(n, 3);
        for (const b of r.baskets) { assert.ok(per[b.id].length >= 1 && per[b.id].length <= 2); for (const it of per[b.id]) { const wd = SG.WORDS[lang].find(x => x.word === it.nameValue); assert.strictEqual(wd.initial, b.label.value); assert.strictEqual(it.sprite, wd.sprite); } }
        break;
      case 'add': case 'sub':
        assert.strictEqual(n, 3);
        assert.strictEqual(new Set(r.baskets.map(b => b.label.value)).size, 3);
        for (const it of r.items) {
          const m = /^(\d+)([+−])(\d+)$/.exec(it.text); assert.ok(m, it.text);
          const a = +m[1], c = +m[3];
          assert.ok(a >= 1 && c >= 1, 'no 0 operands ' + it.text);
          if (topic === 'add') { assert.strictEqual(m[2], '+'); assert.ok(a + c <= (age >= 7 ? 20 : 10)); assert.strictEqual(it.nameKind, 'sum'); }
          else { assert.strictEqual(m[2], '−'); assert.ok(a <= 10 && a - c >= 0 && a - c <= 9); assert.strictEqual(it.nameKind, 'diff'); }
        }
        break;
      case 'oddeven':
        assert.strictEqual(n, 2);
        for (const it of r.items) { assert.ok(+it.text >= 1 && +it.text <= 20); }
        assert.strictEqual(new Set(r.items.map(i => i.text)).size, r.items.length);
        break;
    }
  }
});

test('content: validate() rejects broken rounds (self-check works)', () => {
  const ok = SG.Content.makeRound('animals', { age: 5, rng: new SG.RNG(3), roundIndex: 2 });
  const bad1 = J(ok); bad1.queue.pop(); assert.ok(SG.Content.validate(bad1));
  const bad2 = J(ok); bad2.queue = bad2.queue.map(() => 'b0'); assert.ok(SG.Content.validate(bad2), 'pot never asked');
  const bad3 = J(SG.Content.makeRound('colors', { age: 4, rng: new SG.RNG(3), roundIndex: 1 })); bad3.items[0].answer = bad3.items[0].answer === 'b0' ? 'b1' : 'b0'; assert.ok(SG.Content.validate(bad3));
  const bad4 = J(ok); bad4.items[0].flower = 'cream'; assert.ok(SG.Content.validate(bad4));
});

test('content: deterministic (same seed → same round and talk)', () => {
  for (const topic of TOPICS) {
    const a = SG.Content.makeRound(topic, { age: 6, lang: 'vi', rng: new SG.RNG(9), roundIndex: 2 });
    const b = SG.Content.makeRound(topic, { age: 6, lang: 'vi', rng: new SG.RNG(9), roundIndex: 2 });
    assert.deepStrictEqual(J(a), J(b));
    assert.deepStrictEqual(J(SG.Content.makeTalk(topic, { age: 6, lang: 'vi', rng: new SG.RNG(4) })), J(SG.Content.makeTalk(topic, { age: 6, lang: 'vi', rng: new SG.RNG(4) })));
  }
});

test('talk: every topic × age × 600 seeds → distinct choices containing the answer (3, or 2 for size/oddeven)', () => {
  for (const topic of TOPICS) for (const age of AGES) for (let s = 1; s <= 600; s++) {
    const t = SG.Content.makeTalk(topic, { age, lang: s % 2 ? 'en' : 'vi', rng: new SG.RNG(s) });
    const n = topic === 'size' || topic === 'oddeven' ? 2 : 3;
    assert.strictEqual(t.choices.length, n, topic);
    assert.strictEqual(new Set(t.choices.map(c => String(c.value))).size, n);
    assert.strictEqual(new Set(t.choices.map(c => c.id)).size, n);
    const ans = t.choices.find(c => c.id === t.answerId); assert.ok(ans);
    assert.strictEqual(t.promptKey, 'talk.' + topic);
    if (topic === 'animals') { assert.ok(!t.show.sprite && !t.show.flower && !t.show.shape, 'shows nothing'); assert.strictEqual(t.params.animal, ans.value); assert.strictEqual(ans.kind, 'animal'); }
    else assert.ok(t.show.sprite || t.show.shape || t.show.flower);
    if (topic === 'count') { assert.strictEqual(ans.value, t.show.count); assert.ok(COLORS.includes(t.show.flower)); }
    if (topic === 'colors') { assert.strictEqual(ans.value, t.show.flower); if (age < 5) assert.ok(!clash(t.choices.map(c => c.value)), 'no clash pair among colour choices'); }
    if (topic === 'shapes') assert.strictEqual(ans.value, t.show.shape);
    if (topic === 'size') assert.strictEqual(ans.value, t.show.scale > 1 ? 'big' : 'small');
    if (topic === 'letters' || topic === 'lower') assert.strictEqual(ans.value, t.show.text.toUpperCase());
    if (topic === 'initial') assert.strictEqual(SG.WORDS[s % 2 ? 'en' : 'vi'].find(w => w.word === t.params.word).initial, ans.value);
    if (topic === 'add' || topic === 'sub') { const m = /^(\d+)([+−])(\d+)$/.exec(t.show.text); assert.strictEqual(ans.value, m[2] === '+' ? +m[1] + +m[3] : +m[1] - +m[3]); }
    if (topic === 'oddeven') assert.strictEqual(ans.value, +t.show.text % 2 ? 'odd' : 'even');
    for (const c of t.choices) if (c.kind === 'number') assert.ok(c.value >= 0);
  }
});

// ======================================================= layout
test('layout: §2 formulas (pots, Lumi, bubble, play), short-side rule', () => {
  assert.deepStrictEqual(J(SG.World.logicalSize(2532, 1170)), { W: 1558, H: 720 });
  assert.deepStrictEqual(J(SG.World.logicalSize(1170, 2532)), { W: 720, H: 1558 });
  assert.deepStrictEqual(J(SG.World.logicalSize(1024, 1366)), { W: 720, H: 960 });
  assert.deepStrictEqual(J(SG.World.logicalSize(1000, 1000)), { W: 960, H: 720 });
  assert.deepStrictEqual(J(SG.World.logicalSize(4000, 1000)), { W: 1600, H: 720 });
  const L = SG.World.computeLayout(1280, 720, { top: 0, right: 0, bottom: 20, left: 44 }, 3);
  assert.strictEqual(L.groundY, 720 - 20 - 70);
  assert.strictEqual(L.pot.w, Math.min(230, (1280 - 44 - 40) / 3 - 24));
  assert.ok(Math.abs(L.pot.h - 0.78 * L.pot.w) < 1e-9);
  assert.strictEqual(L.pot.bottom, L.groundY + 8);
  assert.ok(Math.abs(L.pot.top - (L.pot.bottom - L.pot.h)) < 1e-9);
  assert.ok(Math.abs(L.pot.y - (L.pot.top + 0.24 * L.pot.h)) < 1e-9, 'y = soil centre');
  assert.strictEqual(L.nest, L.pot, 'old alias');
  assert.deepStrictEqual([L.lumi.x, L.lumi.y, L.lumi.h], [44 + 105, 225, 175]);
  assert.deepStrictEqual([L.bubble.x, L.bubble.y, L.bubble.h], [L.lumi.x + 85, 24, 104]);
  assert.strictEqual(L.bubble.w, Math.min(620, 1280 - L.bubble.x - 0 - 150));
  assert.deepStrictEqual([L.play.x, L.play.y, L.play.x + L.play.w], [44 + 40, 225 + 10, 1280 - 40]);
  assert.ok(Math.abs(L.play.y + L.play.h - (L.pot.top - 44)) < 1e-9);
  assert.ok(L.playAlt && L.playAlt.y === L.bubble.y + L.bubble.h + 16 && L.playAlt.ex, 'landscape alt band');
  const Lp = SG.World.computeLayout(720, 1556, { top: 44, bottom: 30, left: 0, right: 0 }, 2);
  assert.deepStrictEqual([Lp.lumi.y, Lp.lumi.h], [44 + 245, 190]);
  assert.strictEqual(Lp.playAlt, null);
  assert.ok(Lp.tall && Lp.play.itemScale === 1.2 && Lp.play.h <= 0.85 * 720 + 1e-9, 'tall portrait band');
  assert.ok(Math.abs(Lp.play.y + Lp.play.h - (Lp.pot.top - 44)) < 1e-9, 'band just above the pots');
  const Lq = SG.World.computeLayout(720, 960, null, 2);
  assert.ok(!Lq.tall && Lq.play.itemScale === 1);
  // planter (count): w = min(safe − 80, 120 + 96 N), h = min(0.42 w, 170), same bottom line, centred
  for (const N of [1, 3, 5, 10, 12]) {
    const pr = SG.Content.planterRect(L, N);
    assert.strictEqual(pr.w, Math.min(1280 - 44 - 80, 120 + 96 * N));
    assert.strictEqual(pr.h, Math.min(0.42 * pr.w, 170));
    assert.strictEqual(pr.bottom, L.pot.bottom);
    assert.strictEqual(pr.x, 44 + (1280 - 44) / 2);
    assert.ok(Math.abs(pr.y - (pr.top + 0.27 * pr.h)) < 1e-9);
  }
});

test('layout: every viewport × pot count → pots/play/Lumi/bubble/HUD inside the safe area and apart', () => {
  for (const v of VIEWPORTS) for (let n = 1; n <= 4; n++) {
    const L = SG.World.computeLayout(v.W, v.H, v.ins, n), ins = L.ins, ctx = v.name + ' n=' + n;
    const safe = { x: ins.left, y: ins.top, w: v.W - ins.left - ins.right, h: v.H - ins.top - ins.bottom };
    const inside = (R) => R.x >= safe.x - 1e-6 && R.y >= safe.y - 1e-6 && R.x + R.w <= safe.x + safe.w + 1e-6 && R.y + R.h <= safe.y + safe.h + 1e-6;
    for (const P of [L.play, L.playAlt].filter(Boolean)) {
      assert.ok(inside(P), ctx + ' play');
      assert.ok(P.w > 300 && P.h > 120, ctx + ' play big enough ' + P.w + 'x' + P.h);
      const hud = { x: v.W - ins.right - 140, y: 0, w: 140 + ins.right, h: ins.top + 90 };
      for (const R of [L.bubble, hud]) assert.ok(!rectsOverlap(R, P), ctx + ' play vs ' + JSON.stringify(R));
      if (P === L.play) assert.ok(!rectsOverlap(lumiRect(L), P), ctx + ' play vs Lumi');
    }
    assert.ok(L.bubble.w > 200, ctx + ' bubble w');
    const hud = { x: v.W - ins.right - 140, y: 0, w: 140 + ins.right, h: ins.top + 90 };
    assert.ok(!rectsOverlap(L.bubble, hud), ctx + ' bubble vs hud');
    const pots = L.pot.xs.map(x => ({ x: x - L.pot.w / 2, y: L.pot.top, w: L.pot.w, h: L.pot.h }));
    for (let i = 0; i < n; i++) {
      assert.ok(inside(pots[i]), ctx + ' pot inside');
      assert.ok(!rectsOverlap(pots[i], L.play), ctx + ' pot vs play');
      for (let j = i + 1; j < n; j++) assert.ok(pots[i].x + pots[i].w + 20 <= pots[j].x, ctx + ' pots apart');
    }
    const pr = SG.Content.planterRect(L, 12);
    assert.ok(inside({ x: pr.x - pr.w / 2, y: pr.top, w: pr.w, h: pr.h }), ctx + ' planter inside');
    assert.ok(pr.top >= L.pot.top - 1e-9 || n > 1, ctx + ' planter no taller than the n=1 pot');
  }
});

test('layout: every topic × age × viewport (30 seeds) → seeds packed in the band, no overlaps, ≥ 0.75× size', () => {
  let worst = 1, alt = 0, total = 0;
  for (const v of VIEWPORTS) for (const age of AGES) for (const topic of TOPICS) for (let s = 1; s <= 30; s++) {
    const w = mkWorld({ seed: s * 13 + age, age, vp: v, lang: s % 2 ? 'en' : 'vi' });
    roundOf(w, topic, s % 5);
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
    for (const R of [hud, lumiRect(L), L.bubble]) assert.ok(!circleRect(it.homeX, it.homeY, r, R), ctx + ' vs ui');
    for (const b of w.baskets) {
      assert.ok(!circleRect(it.homeX, it.homeY, r, potRect(b)), ctx + ' vs pot');
      assert.ok(w.potAt(it.homeX, it.homeY) === null || it.size < it.baseSize, ctx + ' resting centre outside drop zones');
    }
  }
  for (let i = 0; i < rest.length; i++) for (let j = i + 1; j < rest.length; j++) {
    const a = rest[i], b = rest[j];
    assert.ok(hyp(a.homeX - b.homeX, a.homeY - b.homeY) >= 1.1 * Math.max(a.size, b.size) - 1e-6, ctx + ' overlap');
  }
}

test('slots: pots 1–3 slots on the soil line (centre-out), planter N holes left → right inside the box', () => {
  for (const v of VIEWPORTS) for (const topic of ['colors', 'size', 'animals', 'count', 'oddeven']) for (let s = 1; s <= 8; s++) {
    const w = mkWorld({ seed: s, age: topic === 'count' ? 6 : 5, vp: v });
    roundOf(w, topic, 1 + (s % 4));
    for (const b of w.baskets) {
      const ctx = v.name + ' ' + topic + ' ' + b.id;
      assert.strictEqual(b.soilY, b.y);
      assert.ok(b.flowerSize > 20 && b.stemH >= 50 && b.stemH <= 95, ctx);
      const cap = topic === 'count' ? b.need : topic === 'animals' ? w.cur.queue.filter(q => q === b.id).length : w.items.filter(i => i.answer === b.id).length;
      assert.strictEqual(b.slots.length, cap, ctx);
      for (const sl of b.slots) {
        assert.ok(Math.abs(sl.y - (b.y - 0.3 * b.slotSize)) < 1e-9, ctx + ' seed rests on the soil');
        assert.ok(sl.x - b.slotSize / 2 >= b.x - b.w / 2 - 1e-6 && sl.x + b.slotSize / 2 <= b.x + b.w / 2 + 1e-6, ctx + ' inside');
        assert.ok(sl.stem > 0.8 && sl.stem <= 1);
      }
      if (b.kind === 'planter') { for (let i = 1; i < b.slots.length; i++) assert.ok(b.slots[i].x > b.slots[i - 1].x, 'left → right'); }
      else if (b.slots.length === 3) assert.strictEqual(b.slots[0].x, b.x, 'centre first');
      for (let i = 0; i < b.slots.length; i++) for (let j = i + 1; j < b.slots.length; j++) assert.ok(Math.abs(b.slots[i].x - b.slots[j].x) >= b.slotSize * 0.79, ctx + ' apart');
    }
  }
});

test('layout: setViewport mid-round re-packs resting seeds and moves pots + planted seeds', () => {
  const w = mkWorld({ seed: 3, age: 5 });
  roundOf(w, 'colors', 2); settleAppear(w);
  const it = idleItems(w)[0], b = w.basketById(it.answer), p = potPoint(b);
  dragTo(w, it, p.x, p.y); run(w, 0.6);
  assert.strictEqual(it.state, 'in');
  const other = idleItems(w)[0], p2 = { x: other.x, y: other.y };
  w.pointerDown(other.x, other.y); w.pointerMove(p2.x + 50, p2.y); run(w, 0.1);
  for (const v of VIEWPORTS) {
    w.setViewport(v.W, v.H, v.ins);
    checkPacking(w, 'resize ' + v.name);
    const nb = w.basketById(b.id);
    assert.strictEqual(nb.x, w.layout.pot.xs[w.baskets.indexOf(nb)]);
    assert.strictEqual(nb.y, w.layout.pot.y); assert.strictEqual(nb.top, w.layout.pot.top);
    const sl = nb.slots[it.slot];
    assert.deepStrictEqual([it.x, it.y, it.size], [sl.x, sl.y, nb.slotSize]);
    for (const o of idleItems(w)) assert.deepStrictEqual([o.x, o.y], [o.homeX, o.homeY]);
    run(w, 0.05);
  }
  w.pointerUp(emptyPoint(w).x, emptyPoint(w).y); run(w, 0.8);
  assert.strictEqual(other.state, 'idle');
  assert.ok(hyp(other.x - other.homeX, other.y - other.homeY) <= 3.01);
  checkPacking(w, 'after');
  // the planter re-centres too
  const w2 = mkWorld({ seed: 4, age: 6 }); roundOf(w2, 'count', 2); settleAppear(w2);
  w2.setViewport(720, 1556, null);
  const pr = SG.Content.planterRect(w2.layout, w2.baskets[0].need);
  assert.deepStrictEqual([w2.baskets[0].x, w2.baskets[0].w, w2.baskets[0].top], [pr.x, pr.w, pr.top]);
});

test('layout: viewport change during a flight re-targets the new slot', () => {
  const w = mkWorld({ seed: 4, age: 4 });
  roundOf(w, 'colors', 1); settleAppear(w);
  const it = idleItems(w)[0], b = w.basketById(it.answer), p = potPoint(b);
  dragTo(w, it, p.x, p.y);
  assert.strictEqual(it.state, 'fly');
  run(w, 0.1);
  w.setViewport(720, 1556, { top: 44, bottom: 30, left: 0, right: 0 });
  run(w, 0.6);
  assert.strictEqual(it.state, 'in');
  const sl = w.basketById(b.id).slots[it.slot];
  assert.ok(hyp(it.x - sl.x, it.y - sl.y) < 1e-6);
});

// ======================================================= motion
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
  // fast swipe right 400 px in 0.25 s, then stop
  const sg = fx0 < w.layout.W / 2 ? 1 : -1;     // swipe 400 px towards the middle
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

test('flight: correct drop → parabola with apex ≥ 60 px, lands in the slot, squash + pot squash, land event', () => {
  const w = mkWorld({ seed: 6, age: 4 });
  roundOf(w, 'colors', 1); settleAppear(w);
  const it = idleItems(w)[0], b = w.basketById(it.answer), p = potPoint(b, w.cfg);
  dragTo(w, it, p.x, p.y); const ev = w.drainEvents();
  assert.deepStrictEqual(ev.slice(-2).map(e => e.type), ['drop', 'correct']);
  assert.strictEqual(ev[ev.length - 1].basketId, b.id);
  assert.deepStrictEqual(J(ev[ev.length - 1].label), J(b.label));
  assert.strictEqual(it.state, 'fly');
  const f = it._f, x0 = it.x, y0 = it.y, pts = [];
  assert.ok(f.T >= 0.32 - 1e-9 && f.T <= 0.5 + 1e-9);
  let landed = null, t = 0;
  while (it.state === 'fly') { w.update(H); t += H; pts.push([it.x, it.y]); for (const e of w.drainEvents()) if (e.type === 'land') landed = e; }
  assert.ok(Math.abs(t - f.T) < 2 * H, 'duration');
  const sl = b.slots[it.slot];
  assert.deepStrictEqual([it.x, it.y], [sl.x, sl.y]);
  assert.ok(landed && landed.basketId === b.id && landed.count === 1 && landed.need === null);
  // constant second differences (constant acceleration ⇒ parabola) except the snap at the end
  const d2 = [];
  for (let i = 2; i < pts.length - 1; i++) d2.push([pts[i][0] - 2 * pts[i - 1][0] + pts[i - 2][0], pts[i][1] - 2 * pts[i - 1][1] + pts[i - 2][1]]);
  for (const d of d2) { assert.ok(Math.abs(d[0] - d2[0][0]) < 1e-6 && Math.abs(d[1] - d2[0][1]) < 1e-6, 'parabola'); }
  assert.ok(d2[0][1] > 0, 'gravity down');
  const apex = Math.min(...pts.map(q => q[1]));
  assert.ok(apex <= Math.min(y0, sl.y) - 60 + 0.5, 'apex ' + (Math.min(y0, sl.y) - apex));
  assert.ok(Math.abs(it.sx - 1.15) < 0.02 && Math.abs(it.sy - 0.82) < 0.03, 'land squash ' + it.sx + ' ' + it.sy);
  assert.ok(Math.abs(b.squash - 0.12) < 0.02);
  let minSq = 1; run(w, 1.2, () => { minSq = Math.min(minSq, b.squash); });
  assert.ok(minSq < 0, 'pot squash oscillates (damped spring)');
  assert.ok(Math.abs(b.squash) < 0.003 && Math.abs(it.sx - 1) < 0.003 && Math.abs(it.sy - 1) < 0.003);
  assert.strictEqual(it.size, b.slotSize);
  // x0 unused but kept for clarity
  assert.ok(isFinite(x0));
});

test('flight: inherits release velocity (upward fling → higher apex)', () => {
  function fling(flick) {
    const w = mkWorld({ seed: 7, age: 4 });
    roundOf(w, 'colors', 1); settleAppear(w);
    const it = idleItems(w)[0], b = w.basketById(it.answer), p = potPoint(b, w.cfg);
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

test('wrong drop: pot shakes (3 wiggles, 0.5 s), item hops home in 0.55 s with a wobble', () => {
  const w = mkWorld({ seed: 8, age: 5 });
  roundOf(w, 'colors', 1); settleAppear(w);
  const it = idleItems(w)[0], wrongB = w.baskets.find(b => b.id !== it.answer), p = potPoint(wrongB, w.cfg);
  const hx = it.homeX, hy = it.homeY;
  dragTo(w, it, p.x, p.y); const ev = w.drainEvents();
  const we = ev.find(e => e.type === 'wrong');
  assert.ok(we && we.basketId === wrongB.id && we.misses === 1);
  assert.strictEqual(w.roundMistakes, 1);
  assert.strictEqual(it.state, 'return');
  assert.strictEqual(w.lumi.mood, 'oops');
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

test('miss: drop on empty grass → miss event, floats home in 0.5 s, not a mistake', () => {
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
  // pick a direction with no neighbour closer than 2R
  const dir = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]].find(([dx, dy]) =>
    w.items.every(o => o === it || hyp(it.x + dx * (R + 3) - o.x, it.y + dy * (R + 3) - o.y) > 0.6 * o.size + 14 + 1));
  assert.ok(dir);
  assert.strictEqual(w.pointerDown(it.x + dir[0] * (R - 1), it.y + dir[1] * (R - 1)), it.id, 'generous radius');
  const other = w.items.find(o => o !== it && o.state === 'idle');
  assert.strictEqual(w.pointerDown(other.x, other.y), null, 'one held item only');
  w.cancelDrag(); run(w, 0.6);
  assert.strictEqual(w.pointerDown(it.x + dir[0] * (R + 2), it.y + dir[1] * (R + 2)), null, 'outside radius');
  // fly / in
  const b = w.basketById(it.answer), p = potPoint(b, w.cfg);
  dragTo(w, it, p.x, p.y);
  assert.strictEqual(it.state, 'fly');
  assert.strictEqual(w.pointerDown(it.x, it.y), null, 'fly not grabbable'); w.pointerUp();
  run(w, 0.6); assert.strictEqual(it.state, 'in');
  assert.strictEqual(w.pointerDown(it.x, it.y), null, 'in not grabbable'); w.pointerUp();
  // returning items CAN be re-grabbed
  const o2 = idleItems(w)[0], e = emptyPoint(w);
  dragTo(w, o2, e.x, e.y);
  run(w, 0.15);
  assert.strictEqual(o2.state, 'return');
  assert.strictEqual(w.pointerDown(o2.x, o2.y), o2.id);
  assert.strictEqual(o2.state, 'drag');
  assert.strictEqual(w.items[w.items.length - 1], o2, 'held item drawn last');
});

test('pot drop zone: +45 px sides/bottom, +90 px up; overlapping zones pick the nearest nest', () => {
  const w = mkWorld({ seed: 11, age: 5, vp: VIEWPORTS[1] });   // 960 wide: 4 nests 24 px apart → zones overlap
  roundOf(w, 'colors', 1); settleAppear(w);
  const b = w.baskets[0], top = b.top;
  assert.strictEqual(w.potAt(b.x, top - 89), b);
  assert.strictEqual(w.potAt(b.x, top - 91), null);
  assert.strictEqual(w.potAt(b.x - b.w / 2 - 44, b.y), b);
  assert.strictEqual(w.potAt(b.x - b.w / 2 - 46, b.y), null);
  assert.strictEqual(w.potAt(b.x, b.bottom + 44), b);
  assert.strictEqual(w.potAt(b.x, b.bottom + 46), null);
  const b1 = w.baskets[1], mid = (b.x + b1.x) / 2;
  assert.strictEqual(w.potAt(mid - 1, b.y), b); assert.strictEqual(w.potAt(mid + 1, b.y), b1);
});

test('idle life: bob ≤ 3 px around home, seed wiggles ±0.12 rad every 4–8 s', () => {
  const w = mkWorld({ seed: 12, age: 4 });
  roundOf(w, 'colors', 1); settleAppear(w);
  const it = w.items[0]; let maxB = 0, maxR = 0, wig = 0, prev = 0;
  run(w, 20, () => { maxB = Math.max(maxB, Math.abs(it.y - it.homeY)); maxR = Math.max(maxR, Math.abs(it.rot)); if (Math.abs(it.rot) > 0.02 && prev <= 0.02) wig++; prev = Math.abs(it.rot); assert.strictEqual(it.x, it.homeX); });
  assert.ok(maxB > 2 && maxB <= 3 + 1e-9, 'bob ' + maxB);
  assert.ok(maxR > 0.08 && maxR <= 0.12 + 1e-9, 'wiggle ' + maxR);
  assert.ok(wig >= 2, 'wiggles ' + wig);
});

test('appear: staggered 70 ms pop-ins with back overshoot, appear events; pots pop in', () => {
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

// ======================================================= planting / growth
function landOne(w, it, b) {
  b = b || w.basketById(w.goalOf(it));
  const p = potPoint(b);
  dragTo(w, it, p.x, p.y);
  let land = null, g = 0;
  while (!land && g++ < 400) { w.update(H); for (const e of w.drainEvents()) if (e.type === 'land' && e.id === it.id) land = e; }
  assert.ok(land, 'landed');
  return land;
}

test('growth: grow 0→1 in 1.1 s; sink eases in by 0.25; stem critically damped (no overshoot); petals overshoot; bloom event at 0.55', () => {
  const w = mkWorld({ seed: 70, age: 5 });
  roundOf(w, 'colors', 1); settleAppear(w);
  const it = idleItems(w)[0];
  landOne(w, it);
  assert.deepStrictEqual([it.state, it.planted, it.grow, it.stem, it.petals, it.bloomed], ['in', true, 0, 0, 0, false]);
  let t = 0, bloomT = null, bloomEv = null, maxStem = 0, maxPet = 0, sinkAt25 = null, stemAtBloom = null, prevSink = 0, petAt = [];
  while (t < 2.2) {
    w.update(H); t += H;
    for (const e of w.drainEvents()) if (e.type === 'bloom') { bloomT = t; bloomEv = e; stemAtBloom = it.stem; }
    assert.ok(it.sink >= prevSink - 1e-12 && it.sink <= 1, 'sink monotone'); prevSink = it.sink;
    if (sinkAt25 === null && it.grow >= 0.25) sinkAt25 = it.sink;
    if (it.grow < 0.25 - 1e-9) assert.strictEqual(it.stem, 0, 'stem waits for the sink');
    if (it.grow < 0.55 - 1e-9) assert.strictEqual(it.petals, 0, 'petals wait for 0.55');
    maxStem = Math.max(maxStem, it.stem); maxPet = Math.max(maxPet, it.petals); petAt.push(it.petals);
    if (Math.abs(t - 1.1) < H / 2) assert.ok(Math.abs(it.grow - 1) < 1e-9, 'grow = 1 at 1.1 s');
  }
  assert.ok(Math.abs(sinkAt25 - 1) < 0.02, 'sunk by grow 0.25');
  assert.ok(Math.abs(bloomT - 0.55 * 1.1) < 2 * H, 'bloom at 0.605 s: ' + bloomT);
  assert.deepStrictEqual(J(bloomEv), { type: 'bloom', id: it.id, basketId: it.basketId, n: 1, need: null, flower: it.flower });
  assert.ok(stemAtBloom > 0.85, 'stem nearly up at the bloom: ' + stemAtBloom);
  assert.ok(maxStem <= 1 + 1e-9, 'stem never overshoots');
  assert.ok(maxPet > 1.12 && maxPet < 1.3, 'petals overshoot ≈ 1.2: ' + maxPet);
  assert.ok(Math.abs(it.petals - 1) < 0.01 && Math.abs(it.stem - 1) < 0.001, 'settled');
  assert.ok(it.bloomed);
});

test('growth: roundDone waits for the last bloom + 0.4 s; no input while completing', () => {
  const w = mkWorld({ seed: 71, age: 3 });
  roundOf(w, 'colors', 0); settleAppear(w);
  const a = idleItems(w)[0]; landOne(w, a);
  const b = idleItems(w)[0];
  const p = potPoint(w.basketById(b.answer)); dragTo(w, b, p.x, p.y);
  let landT = null, bloomT = null, doneT = null, t = 0;
  while (w.state === 'round' && t < 5) {
    w.update(H); t += H;
    for (const e of w.drainEvents()) { if (e.type === 'land' && e.id === b.id) { landT = t; assert.ok(w.completing && !w.interactive); } if (e.type === 'bloom' && e.id === b.id) bloomT = t; if (e.type === 'roundDone') doneT = t; }
    if (w.completing) { assert.strictEqual(w.hint(), null); assert.strictEqual(w.pointerDown(a.x, a.y), null); w.pointerUp(); }
  }
  assert.ok(Math.abs(bloomT - landT - 0.605) < 2 * H);
  assert.ok(Math.abs(doneT - bloomT - 0.4) < 2 * H, 'roundDone 0.4 s after the last bloom: ' + (doneT - bloomT));
  assert.strictEqual(w.completing, false);
  // flowers fade in place during roundDone
  const x0 = b.x, y0 = b.y; run(w, 1.2);
  assert.ok(b.state === 'leave' && b.alpha < 0.6 && b.x === x0 && b.y === y0, 'fade in place');
});

test('count mode: planter slots, land/bloom count N, extras fade when full, round ends after the last bloom', () => {
  for (const age of [4, 5, 6]) for (let s = 1; s <= 20; s++) {
    const w = mkWorld({ seed: s, age, vp: VIEWPORTS[s % VIEWPORTS.length] });
    roundOf(w, 'count', 1 + (s % 4)); settleAppear(w);
    const b = w.baskets[0], N = b.need;
    assert.strictEqual(b.kind, 'planter'); assert.strictEqual(b.slots.length, N);
    let landed = 0, blooms = 0;
    for (let k = 0; k < N; k++) {
      assert.strictEqual(w.state, 'round');
      const it = idleItems(w)[0], p = potPoint(b);
      dragTo(w, it, p.x, p.y);
      let done = false;
      while (!done) { w.update(H); for (const e of w.drainEvents()) { if (e.type === 'bloom') { blooms++; assert.deepStrictEqual([e.n, e.need], [blooms, N]); } if (e.type === 'land') { landed++; assert.deepStrictEqual([e.count, e.need], [landed, N]); done = true; } } }
    }
    assert.ok(w.completing, 'complete at N');
    const extras = w.items.filter(i => !i.planted);
    assert.ok(extras.length >= 2 && extras.every(i => i.state === 'leave'), 'extras fade');
    let rd = null, g = 0;
    while (!rd && g++ < 400) { w.update(H); for (const e of w.drainEvents()) { if (e.type === 'bloom') blooms++; if (e.type === 'roundDone') rd = e; } }
    assert.strictEqual(blooms, N);
    assert.deepStrictEqual([rd.count, rd.need, rd.stars], [N, N, 3]);
    assert.ok(extras.every(i => i.alpha === 0));
    assert.strictEqual(b.count, N);
  }
  // a drop into a full planter (last seed in the air) floats home without penalty
  const w = mkWorld({ seed: 5, age: 4 }); roundOf(w, 'count', 0); settleAppear(w);
  const b = w.baskets[0];
  for (let k = 0; k < b.need - 1; k++) landOne(w, idleItems(w)[0], b);
  const last = idleItems(w)[0], p = potPoint(b); dragTo(w, last, p.x, p.y); assert.strictEqual(last.state, 'fly');
  const extra = idleItems(w)[0]; dragTo(w, extra, p.x, p.y, 0.05);
  const ev = w.drainEvents();
  assert.ok(!ev.some(e => e.type === 'wrong' || e.type === 'miss') && extra.misses === 0);
});

// ======================================================= ask mode
test('ask mode: ask event at start and on every target change; correct = current target; wrong elsewhere; slots per queue', () => {
  for (const age of [3, 4, 5]) for (let s = 1; s <= 10; s++) {
    const w = mkWorld({ seed: 80 + s, age });
    roundOf(w, 'animals', s % 3);
    const ev0 = w.drainEvents(), q = w.cur.queue.slice();
    const re = ev0.find(e => e.type === 'round'), ask0 = ev0.find(e => e.type === 'ask');
    assert.strictEqual(re.mode, 'ask');
    assert.ok(ev0.indexOf(ask0) > ev0.indexOf(re), 'ask after round');
    const b0 = w.basketById(q[0]);
    assert.deepStrictEqual(J(ask0), { type: 'ask', basketId: q[0], label: b0.label, promptKey: 'p.animals', params: { animal: b0.label.value } });
    assert.strictEqual(w.target, q[0]);
    settleAppear(w); w.drainEvents();
    // one wrong drop first (into a pot that is not the target)
    const it0 = idleItems(w)[0], other = w.baskets.find(b => b.id !== w.target);
    dragTo(w, it0, potPoint(other).x, potPoint(other).y); run(w, 0.7);
    const we = w.drainEvents().find(e => e.type === 'wrong');
    assert.ok(we && we.basketId === other.id && we.target === q[0]); assert.strictEqual(w.roundMistakes, 1);
    assert.strictEqual(w.target, q[0], 'target unchanged after a wrong drop');
    for (let k = 0; k < q.length; k++) {
      assert.strictEqual(w.target, q[k]);
      const it = idleItems(w)[0], b = w.basketById(w.target);
      dragTo(w, it, potPoint(b).x, potPoint(b).y);
      const ev = w.drainEvents(), c = ev.find(e => e.type === 'correct'), a = ev.find(e => e.type === 'ask');
      assert.ok(c && c.basketId === q[k]);
      if (k + 1 < q.length) { assert.ok(a && a.basketId === q[k + 1] && ev.indexOf(a) > ev.indexOf(c)); assert.strictEqual(a.params.animal, w.basketById(q[k + 1]).label.value); }
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
  dragTo(w, it, potPoint(other).x, potPoint(other).y); run(w, 0.7);
  dragTo(w, it, e.x, e.y);
  const h = w.drainEvents().find(x => x.type === 'hint');
  assert.ok(h && h.basketId === w.target, 'auto hint → target');
  run(w, 1);
  // move to the 2nd target, then wait for idle
  const first = w.target, it2 = idleItems(w)[0];
  dragTo(w, it2, potPoint(w.basketById(first)).x, potPoint(w.basketById(first)).y);
  const t2 = w.target; assert.notStrictEqual(t2, first);
  w.drainEvents();
  let idle = null; run(w, 13, () => { for (const x of w.drainEvents()) if (x.type === 'idle') idle = x; });
  assert.ok(idle, 'idle');
  assert.deepStrictEqual(J(idle), { type: 'idle', promptKey: 'p.animals', params: { animal: w.basketById(t2).label.value } });
  assert.deepStrictEqual(J(w.prompt()), { promptKey: 'p.animals', params: { animal: w.basketById(t2).label.value } });
});

test('ask mode: bot carries any seed to w.target (perfect bot never errs, all stars)', () => {
  for (const age of [3, 4, 5]) for (let s = 1; s <= 6; s++) {
    const w = mkWorld({ seed: 300 + s, age });
    const bot = new SG.Bot(w, { skill: 1, seed: s });
    roundOf(w, 'animals', s % 3);
    let rd = null, t = 0;
    while (!rd && t < 120) { bot.step(1 / 60); w.update(1 / 60); t += 1 / 60; rd = w.drainEvents().find(e => e.type === 'roundDone') || null; }
    assert.ok(rd, 'round solved by the bot'); assert.strictEqual(rd.stars, 3);
    assert.strictEqual(bot.stats.wrong, 0);
  }
});

// ======================================================= rules
test('stars: 0 mistakes → 3, 1 → 2, ≥ 2 → 1; talk right → +1', () => {
  for (const mistakes of [0, 1, 2, 3]) {
    const w = mkWorld({ seed: 20 + mistakes, age: 5 });
    roundOf(w, 'colors', 1); settleAppear(w);
    for (let m = 0; m < mistakes; m++) {
      const it = idleItems(w)[0], wb = w.baskets.find(b => b.id !== it.answer), p = potPoint(wb);
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
  const tr = w2.drainEvents().find(e => e.type === 'talkResult');
  assert.deepStrictEqual(J(tr), { type: 'talkResult', correct: false, choiceId: wrong, answerId: w2.talk.answerId });
});

test('help: 2 misses on the same seed → auto hint (glow 3 s); hint() for the held seed', () => {
  const w = mkWorld({ seed: 40, age: 5 });
  roundOf(w, 'colors', 1); settleAppear(w);
  const it = idleItems(w)[0], wb = w.baskets.find(b => b.id !== it.answer);
  const p = potPoint(wb);
  dragTo(w, it, p.x, p.y); run(w, 0.7);
  assert.ok(!w.drainEvents().some(e => e.type === 'hint'));
  const e = emptyPoint(w);
  dragTo(w, it, e.x, e.y);
  const h = w.drainEvents().find(x => x.type === 'hint');
  assert.ok(h && h.basketId === it.answer, 'auto hint after 2 misses');
  const rb = w.basketById(it.answer);
  w.update(H);
  assert.strictEqual(rb.glow, 1); assert.strictEqual(w.lumi.mood, 'think');
  run(w, 2.5); assert.ok(rb.glow > 0); run(w, 0.6); assert.strictEqual(rb.glow, 0);
  run(w, 0.5);
  const o = idleItems(w)[1]; w.pointerDown(o.x, o.y);
  assert.strictEqual(w.hint(), o.answer);
  assert.strictEqual(w.drainEvents().filter(x => x.type === 'hint')[0].basketId, o.answer);
});

test('idle: nudges after 12 s, then back off ×1.5 (18, 27, 30 cap); reset by a grab and by a new round', () => {
  const w = mkWorld({ seed: 41, age: 4 });
  roundOf(w, 'count', 2); settleAppear(w); w.drainEvents();
  const times = []; let t = 0;
  run(w, 130, () => { t += H; for (const e of w.drainEvents()) if (e.type === 'idle') { times.push(t); assert.strictEqual(e.promptKey, 'p.count'); assert.deepStrictEqual(J(e.params), J(w.cur.params)); } });
  const want = [12, 30, 57, 87, 117];
  assert.strictEqual(times.length, want.length, JSON.stringify(times));
  times.forEach((x, i) => assert.ok(Math.abs(x - want[i]) < 4 * H, x + ' vs ' + want[i]));
  const it = idleItems(w)[0]; w.pointerDown(it.x, it.y); run(w, 20);
  assert.ok(!w.drainEvents().some(e => e.type === 'idle'), 'no idle while holding');
  w.cancelDrag(); run(w, 11);
  assert.ok(!w.drainEvents().some(e => e.type === 'idle'));
  run(w, 1.2);
  assert.ok(w.drainEvents().some(e => e.type === 'idle'), 'grab reset the gap to 12 s');
});

test('state machine: timings intro 1.8 / roundDone 1.7 / talk +1.6 / levelDone 2.0 → sessionDone (4 rounds)', () => {
  const w = mkWorld({ seed: 50, age: 3 });
  w.newSession();
  const ev0 = w.drainEvents();
  assert.deepStrictEqual(J(ev0[0]), { type: 'session', levels: ['colors', 'size', 'shapes', 'animals'] });
  assert.deepStrictEqual(J(ev0[1]), { type: 'level', level: 0, topic: 'colors' });
  assert.strictEqual(w.state, 'intro');
  let t = 0; while (w.state === 'intro') { w.update(H); t += H; }
  assert.ok(Math.abs(t - 1.8) < 2 * H);
  const re = w.drainEvents().find(e => e.type === 'round');
  assert.deepStrictEqual(J(re), { type: 'round', round: 0, topic: 'colors', mode: 'sort', promptKey: 'p.colors', params: {} });
  for (let lvl = 0; lvl < 4; lvl++) {
    if (lvl > 0) { while (w.state === 'intro') w.update(H); }
    for (let r = 0; r < 4; r++) {
      assert.strictEqual(w.state, 'round'); assert.strictEqual(w.round, r);
      settleAppear(w); solveRound(w);
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
    else {
      w.talkAnswer(w.talk.answerId); t = 0;
      while (w.state === 'talk') { w.update(H); t += H; }
      assert.ok(Math.abs(t - 1.6) < 2 * H);
    }
    const ld = w.drainEvents().find(e => e.type === 'levelDone');
    assert.deepStrictEqual(J(ld), { type: 'levelDone', level: lvl, stars: lvl === 2 ? 12 : 13 });
    t = 0; while (w.state === 'levelDone') { w.update(H); t += H; }
    assert.ok(Math.abs(t - 2.0) < 2 * H);
    assert.strictEqual(w.weather, lvl === 3 ? 3 : lvl + 1);
  }
  assert.strictEqual(w.state, 'sessionDone');
  assert.deepStrictEqual(J(w.drainEvents().find(e => e.type === 'sessionDone')), { type: 'sessionDone', stars: 51 });
  run(w, 5); assert.strictEqual(w.state, 'sessionDone');
  w.setAge(7); w.setLang('vi'); assert.strictEqual(w.age, 3, 'age applies at newSession');
  w.newSession(); assert.deepStrictEqual([w.age, w.lang, w.stars, w.state], [7, 'vi', 0, 'intro']);
  w.startLevel(2); assert.deepStrictEqual([w.level, w.topic, w.weather, w.state], [2, 'sub', 2, 'intro']);
});

test('Lumi: moods on events, cheer hops, looks at the held seed', () => {
  const w = mkWorld({ seed: 51, age: 4 });
  roundOf(w, 'colors', 1); settleAppear(w);
  assert.ok(!('bo' in w), 'bo renamed to lumi');
  const it = idleItems(w)[0];
  w.pointerDown(it.x, it.y); w.pointerMove(it.x + 200, it.y); run(w, 1);
  assert.ok(hyp(w.lumi.lookX - it.x, w.lumi.lookY - it.y) < 5);
  const b = w.basketById(it.answer), p = potPoint(b);
  w.pointerMove(p.x, p.y); run(w, 0.4); w.pointerUp();
  assert.strictEqual(w.lumi.mood, 'happy'); run(w, 0.95); assert.strictEqual(w.lumi.mood, 'idle');
  solveRound(w);
  assert.strictEqual(w.lumi.mood, 'cheer'); let maxHop = 0;
  run(w, 1.3, () => { maxHop = Math.max(maxHop, w.lumi.hop); assert.ok(w.lumi.hop >= 0); });
  assert.ok(maxHop > 20);
});

test('tap guard: a quick tap is not a drop (tap event, quiet return, no misses/hint); a drag still counts', () => {
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
    assert.ok(w.items.every(i => i.state === 'idle'));
  }
  const w = mkWorld({ seed: 61, age: 5 });
  roundOf(w, 'colors', 1); settleAppear(w); w.drainEvents();
  let it = idleItems(w)[0];
  w.pointerDown(it.x, it.y); run(w, 0.4); w.pointerUp(it.x, it.y);
  assert.ok(w.drainEvents().some(e => e.type === 'miss'), 'long hold in place = miss');
  run(w, 0.6);
  it = idleItems(w)[0];
  const b = w.basketById(it.answer), p = potPoint(b);
  w.pointerDown(it.x, it.y);
  for (let i = 1; i <= 12; i++) { w.pointerMove(it.x + (p.x - it.x) * i / 12, it.y + (p.y - it.y) * i / 12); w.update(H); }   // 0.1 s flick
  w.pointerUp(p.x, p.y);
  assert.ok(w.drainEvents().some(e => e.type === 'correct'), 'quick flick into the pot counts');
  run(w, 0.6); it = idleItems(w)[0];
  w.pointerDown(it.x, it.y); w.pointerMove(it.x + 80, it.y); w.update(H); w.pointerMove(it.x, it.y); w.update(H); w.pointerUp(it.x, it.y);
  assert.ok(!w.drainEvents().some(e => e.type === 'tap'), 'out-and-back is not a tap');
});

test('hint cooldown: no auto-hint while the pot glows or within 6 s of the last hint', () => {
  const w = mkWorld({ seed: 62, age: 5 });
  roundOf(w, 'colors', 1); settleAppear(w);
  const it = idleItems(w)[0], e = emptyPoint(w), hints = [];
  for (let k = 0; k < 14; k++) {
    dragTo(w, it, e.x + 40, e.y);
    run(w, 0.3);
    for (const x of w.drainEvents()) if (x.type === 'hint') hints.push(w.time);
  }
  assert.strictEqual(it.misses, 14);
  assert.ok(hints.length >= 2 && hints.length <= 3, 'hints ' + hints.length);
  for (let i = 1; i < hints.length; i++) assert.ok(hints[i] - hints[i - 1] >= 6 - 1e-6);
});

test('chapter time limit: after ≥ 3 rounds a chapter longer than 75 s goes to Talk time', () => {
  const w = mkWorld({ seed: 63, age: 4 });
  w.newSession();
  while (w.state === 'intro') w.update(H);
  let rounds = 0;
  while (w.state !== 'talk') {
    if (w.state === 'round') { settleAppear(w); run(w, 30); solveRound(w); rounds++; }
    w.update(H);
  }
  assert.strictEqual(rounds, 3, 'slow chapter stops after 3 rounds');
  assert.ok(w.time - w.levelStartTime > 75);
  const w2 = mkWorld({ seed: 63, age: 4 });
  w2.newSession(); while (w2.state === 'intro') w2.update(H);
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
  run(w, 40, () => { t += H; for (const e of w.drainEvents()) if (e.type === 'talkAsk') asks.push({ t, n: e.n, g: e.glowAnswer, talk: e.talk }); });
  assert.deepStrictEqual(asks.map(a => a.n), [1, 2, 3]);
  asks.forEach((a, i) => assert.ok(Math.abs(a.t - 12 * (i + 1)) < 3 * H));
  assert.deepStrictEqual(asks.map(a => a.g), [false, true, true]);
  assert.strictEqual(asks[0].talk, w.talk); assert.strictEqual(w.talk.glowAnswer, true);
  w.talkAnswer(w.talk.answerId); run(w, 1.5);
  assert.ok(!w.drainEvents().some(e => e.type === 'talkAsk'), 'no re-ask after an answer');
});

test('content variety: initial talk answers ~uniform; animal sets vary; size rounds vary', () => {
  for (const lang of ['en', 'vi']) {
    const cnt = {};
    for (let s = 1; s <= 3000; s++) { const t = SG.Content.makeTalk('initial', { age: 7, lang, rng: new SG.RNG(s) }); const a = t.choices.find(c => c.id === t.answerId).value; cnt[a] = (cnt[a] || 0) + 1; }
    const v = Object.values(cnt); assert.strictEqual(v.length, lang === 'en' ? 7 : 4);
    assert.ok(Math.max(...v) / 3000 < (lang === 'en' ? 0.2 : 0.32), lang + ' ' + JSON.stringify(cnt));
  }
  const sets = new Set(), sizes = new Set(), qs = new Set(), seen = {};
  for (let s = 1; s <= 300; s++) {
    const r = SG.Content.makeRound('animals', { age: 4, rng: new SG.RNG(s), roundIndex: 2 });
    sets.add(r.baskets.map(b => b.label.value).sort().join()); qs.add(r.queue.length);
    for (const b of r.baskets) seen[b.label.value] = 1;
    const z = SG.Content.makeRound('size', { age: 3, rng: new SG.RNG(s), roundIndex: 1 + (s % 4) });
    sizes.add(z.items.length);
  }
  assert.strictEqual(Object.keys(seen).length, 9, 'every arctic animal appears');
  assert.ok(sets.size > 40);
  assert.deepStrictEqual([...qs].sort(), [3, 4, 5, 6]);
  assert.deepStrictEqual([...sizes].sort(), [4, 5]);
});

// ======================================================= sessions / bot / determinism
test('determinism: same seed + same inputs → identical event stream and state', () => {
  const a = playSession(77, 5, 0.6, { keep: true }), b = playSession(77, 5, 0.6, { keep: true });
  assert.strictEqual(JSON.stringify(a.events), JSON.stringify(b.events));
  assert.strictEqual(a.w.stars, b.w.stars); assert.strictEqual(a.t, b.t);
  const c = playSession(78, 5, 0.6, { keep: true });
  assert.notStrictEqual(JSON.stringify(a.events), JSON.stringify(c.events));
  // the dt split does not matter (fixed sub-steps): 1/60 vs 1/30 frames with the same bot frame rate give the same game
  const d = playSession(79, 4, 1, { keep: true, dt: 1 / 60 }), e = playSession(79, 4, 1, { keep: true, dt: 1 / 60 });
  assert.strictEqual(JSON.stringify(d.events), JSON.stringify(e.events));
});

const SESSION_LEN = {}, CHAPTER_LEN = {};
test('bot: full session reaches sessionDone for every age, both languages, several viewports; sane chapter durations', () => {
  for (const age of AGES) for (const skill of [0.6, 1]) {
    const lens = [], chs = [];
    for (let s = 1; s <= 3; s++) {
      const vp = VIEWPORTS[(s + age) % VIEWPORTS.length];
      let rounds = 0, chStart = 0, blooms = 0, lands = 0;
      const r = playSession(s * 100 + age, age, skill, { lang: s % 2 ? 'en' : 'vi', vp, each: (w, ev, t) => {
        for (const e of ev) {
          if (e.type === 'roundDone') rounds++;
          if (e.type === 'bloom') blooms++;
          if (e.type === 'land') lands++;
          if (e.type === 'level') chStart = t;
          if (e.type === 'levelDone') chs.push(t - chStart);
        }
      } });
      assert.strictEqual(r.w.state, 'sessionDone', 'age ' + age + ' skill ' + skill);
      assert.ok(rounds >= 12 && rounds <= 16, 'rounds ' + rounds);
      assert.strictEqual(blooms, lands, 'every planted seed blooms');
      assert.ok(r.w.stars >= rounds && r.w.stars <= 3 * rounds + 4);
      lens.push(r.t);
      if (skill === 1) {
        assert.strictEqual(r.bot.stats.wrong, 0); assert.strictEqual(r.bot.stats.misses, 0);
        assert.strictEqual(r.w.stars, 3 * rounds + 4, 'perfect bot gets every star');
        assert.strictEqual(r.bot.stats.talkRight, 4);
      } else assert.ok(r.bot.stats.wrong + r.bot.stats.misses > 0);
      assert.strictEqual(r.bot.stats.talks, 4);
    }
    for (const c of chs) assert.ok(c > 20 && c < 110, 'chapter ' + c.toFixed(0) + ' s (age ' + age + ')');
    SESSION_LEN[age + '@' + skill] = lens.reduce((x, y) => x + y) / lens.length;
    CHAPTER_LEN[age + '@' + skill] = chs.reduce((x, y) => x + y) / chs.length;
  }
});

test('bot: drives pointer like a finger (human speed, events consistent)', () => {
  const w = mkWorld({ seed: 90, age: 4 });
  const bot = new SG.Bot(w, { skill: 0.6, seed: 2 });
  w.newSession();
  let maxV = 0, px = bot.finger.x, py = bot.finger.y, grabs = 0, drops = 0;
  for (let i = 0; i < 60 * 120; i++) {
    bot.step(1 / 60); w.update(1 / 60);
    maxV = Math.max(maxV, hyp(bot.finger.x - px, bot.finger.y - py) * 60); px = bot.finger.x; py = bot.finger.y;
    for (const e of w.drainEvents()) { if (e.type === 'grab') grabs++; if (e.type === 'drop') drops++; }
  }
  assert.ok(maxV < 1100 * 1.6 + 1, 'finger speed ' + maxV);
  assert.ok(grabs > 10); assert.ok(Math.abs(grabs - drops) <= 1);
  assert.strictEqual(grabs, bot.stats.grabs);
});

test('performance: 10 full sessions simulated in < 3 s', () => {
  const t0 = Date.now();
  for (let i = 0; i < 10; i++) { const r = playSession(500 + i, AGES[i % 5], 0.8, { dt: 1 / 30 }); assert.strictEqual(r.w.state, 'sessionDone'); }
  const ms = Date.now() - t0;
  console.log('      10 sessions: ' + ms + ' ms');
  assert.ok(ms < 3000, ms + ' ms');
});

// ======================================================= weather (times of day)
const AMB = [
  { skyTop: '#F3B5C9', skyBottom: '#FFE3C8', sun: 1, moon: 0, stars: 0, aurora: 0, darkness: 0 },
  { skyTop: '#62B4F0', skyBottom: '#D5EEFF', tint: null, sun: 1, moon: 0, stars: 0, aurora: 0, darkness: 0 },
  { skyTop: '#6E58B4', skyBottom: '#FF9F6A', sun: 1, aurora: 0 },
  { skyTop: '#121B45', skyBottom: '#2D3E7C', sun: 0, moon: 1, stars: 1, aurora: 1, darkness: 0.28 }
];
const AMB_KEYS = ['skyTop', 'skyBottom', 'horizon', 'tint', 'wind', 'sway', 'sun', 'sunX', 'sunY', 'moon', 'stars', 'aurora', 'darkness'];
test('weather: ambient per time of day (morning/noon/sunset/night), 2.5 s crossfade, sun travels, darkness ≤ 0.28', () => {
  const wx = new SG.Weather({ width: 1280, height: 720, seed: 1 });
  for (let m = 0; m < 4; m++) {
    wx.setWeather(m, { instant: true });
    const a = wx.ambient, e = AMB[m];
    for (const k of AMB_KEYS) assert.ok(k in a, 'ambient.' + k);
    for (const k in e) assert.strictEqual(a[k], e[k], 'mood ' + m + ' ' + k);
    assert.ok(/^#[0-9A-F]{6}$/.test(a.horizon));
    for (const k of ['wind', 'sway', 'sun', 'sunX', 'sunY', 'moon', 'stars', 'aurora']) assert.ok(a[k] >= 0 && a[k] <= 1 + 1e-9, k);
    assert.ok(a.darkness >= 0 && a.darkness <= 0.28 + 1e-12);
  }
  assert.strictEqual(SG.Weather.FADE_TIME, 2.5);
  wx.setWeather(1, { instant: true }); const sx0 = wx.ambient.sunX;
  wx.setWeather(3);
  wx.update(0.625, { groundY: 650 }); wx.update(0.625, { groundY: 650 });   // update() takes ≤ 1 s per call
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

test('weather: particle cap 140 (scaled by area), sprites from §4.3, star field, deterministic, resize', () => {
  const SPR = new Set(SG.Weather.SPRITES), CL = new Set(SG.Weather.CLOUD_SPRITES);
  const counts = {};
  for (const [W, Hh] of [[1600, 720], [1280, 720], [960, 720], [720, 1600], [720, 960]]) {
    const wx = new SG.Weather({ width: W, height: Hh, seed: 3 });
    assert.ok(wx.stars.length >= 45);
    for (const s of wx.stars) { assert.ok(s.x >= 0 && s.x <= W && s.y >= 0 && s.y < (Hh - 70) * 0.56 && s.r > 0 && isFinite(s.phase) && s.tw > 0); }
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
      }
      counts[W + 'x' + Hh + ':' + m] = wx.particles.length;
    }
  }
  assert.ok(counts['960x720:1'] < counts['1600x720:1'], 'scales with area');
  const a = new SG.Weather({ width: 1280, height: 720, seed: 9 }), b = new SG.Weather({ width: 1280, height: 720, seed: 9 });
  a.setWeather(1); b.setWeather(1);
  for (let i = 0; i < 300; i++) { a.update(1 / 60, { groundY: 650 }); }
  for (let i = 0; i < 100; i++) { b.update(3 / 60, { groundY: 650 }); }
  assert.strictEqual(JSON.stringify(a.particles), JSON.stringify(b.particles), 'dt-split independent');
  const x0 = a.particles[0].x, s0 = a.stars[0].x;
  a.resize(640, 720); assert.ok(Math.abs(a.particles[0].x - x0 / 2) < 1e-9); assert.strictEqual(a.width, 640);
  assert.ok(Math.abs(a.stars[0].x - s0 / 2) < 1e-9);
});

test('weather: motion — noon snow flutters/tumbles and settles, glitter on the snow, night stars twinkle in the sky, morning mist', () => {
  const wx = new SG.Weather({ width: 1280, height: 720, seed: 5 });
  wx.setWeather(1, { instant: true });
  const kinds = new Set(wx.particles.map(p => p.kind));
  assert.ok(kinds.has('snow') && kinds.has('glitter'));
  const f = wx.particles.find(p => p.kind === 'snow' && p.layer === 'back' && p.y < 300);
  const vxs = [], rots = [], flips = new Set(); let rested = false;
  for (let i = 0; i < 60 * 20; i++) {
    wx.update(1 / 60, { groundY: 650 });
    if (wx.particles.includes(f)) { if (f.rest < 0) { vxs.push(f.vx); rots.push(f.rot); flips.add(f.flipX); assert.ok(f.vy > 0, 'falls'); } else rested = true; }
  }
  assert.ok(Math.max(...vxs) - Math.min(...vxs) > 15, 'sideways flutter');
  assert.ok(Math.max(...rots) - Math.min(...rots) > 0.3 && flips.size === 2, 'tumbles');
  assert.ok(rested, 'settles on the snow');
  for (const p of wx.particles) if (p.kind === 'glitter') assert.ok(p.y >= 650 - 6 - 1e-9, 'glitter lies on the snow');
  let gusts = 0, prev = 0;
  for (let i = 0; i < 60 * 30; i++) { wx.update(1 / 60, { groundY: 650 }); if (wx.gust > 0.3 && prev <= 0.3) gusts++; prev = wx.gust; }
  assert.ok(gusts >= 4 && gusts <= 8, 'gusts every 4–7 s: ' + gusts);

  wx.setWeather(3); for (let i = 0; i < 60 * 4; i++) wx.update(1 / 60, { groundY: 650 });
  const stars = wx.particles.filter(p => p.kind === 'star' && !p.dying);
  assert.ok(stars.length >= 10);
  for (const s of stars) assert.ok(s.layer === 'sky' && s.y < 650 * 0.55 && s.sprite === 'star');
  assert.ok(!wx.particles.some(p => p.kind === 'glitter' && !p.dying), 'noon glitter retired');
  assert.ok(wx.particles.some(p => p.kind === 'snow'), 'slow night snow');
  assert.ok(wx.clouds.every(c => c.alpha <= 0.35 + 1e-9), 'faint night clouds');
  const ys = wx.particles.filter(p => p.kind === 'snow' && p.mood === 3).map(p => p.fall);
  assert.ok(Math.max(...ys) <= 48 * 1.3 + 1e-9, 'night snow is slow');

  wx.setWeather(0, { instant: true });
  const mist = wx.particles.filter(p => p.kind === 'mist');
  assert.ok(mist.length >= 3 && mist.every(p => p.sprite === 'puff' && p.alpha < 0.3 && p.y > 650 - 70));
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
  console.log('\nSimulated bot session / chapter length (game seconds, avg of 3 sessions):');
  for (const k of Object.keys(SESSION_LEN)) console.log('  age ' + k.replace('@', ' skill ') + ': session ' + SESSION_LEN[k].toFixed(0) + ' s, chapter ' + CHAPTER_LEN[k].toFixed(0) + ' s');
}
console.log('\n' + pass + ' passed, ' + fail + ' failed (' + (Date.now() - t0) + ' ms)');
process.exit(fail ? 1 : 0);
