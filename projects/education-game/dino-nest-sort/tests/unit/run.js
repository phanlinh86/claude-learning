#!/usr/bin/env node
// Dino Nest Sort — headless unit tests for rng / content / world / weather / bot.
// Run from projects/education-game/dino-nest-sort:   node tests/unit/run.js
'use strict';
const assert = require('assert');
const { load } = require('./load');

const DN = load();
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const H = 1 / 120;
const J = v => JSON.parse(JSON.stringify(v));
// vm-realm arrays/objects are not reference-equal to this realm's: compare through JSON
assert.deepStrictEqual = ((orig) => (a, b, m) => orig(J(a), J(b), m))(assert.deepStrictEqual);
assert.notDeepStrictEqual = ((orig) => (a, b, m) => orig(J(a), J(b), m))(assert.notDeepStrictEqual);
const hyp = (x, y) => Math.sqrt(x * x + y * y);
const AGES = [3, 4, 5, 6, 7];
const TOPICS = DN.Content.TOPICS;

const VIEWPORTS = [
  { W: 1556, H: 720, ins: null, name: 'phone landscape' },
  { W: 960, H: 720, ins: null, name: '4:3 landscape' },
  { W: 720, H: 1556, ins: null, name: 'phone portrait' },
  { W: 720, H: 960, ins: null, name: 'iPad portrait' },
  { W: 1280, H: 720, ins: null, name: '16:9' },
  { W: 720, H: 1556, ins: { top: 44, bottom: 30, left: 0, right: 0 }, name: 'notch portrait' },
  { W: 1556, H: 720, ins: { top: 0, left: 44, right: 44, bottom: 20 }, name: 'notch landscape' },
  { W: 960, H: 720, ins: { top: 0, left: 44, right: 44, bottom: 20 }, name: 'narrow notch landscape' },
  { W: 720, H: 960, ins: { top: 44, bottom: 30, left: 0, right: 0 }, name: 'iPad portrait insets' }
];

// ---------- helpers ----------
function mkWorld(o) {
  o = o || {};
  const w = new DN.World({ seed: o.seed || 1, age: o.age || 4, lang: o.lang || 'en', config: o.config });
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
function nestPoint(b, cfg) { return { x: b.x, y: b.y - cfg.nestTopFrac * b.h - 20 }; }
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
function solveRound(w) {   // perfect play: every idle item into its nest
  let guard = 0;
  while (w.state === 'round' && guard++ < 100) {
    const it = idleItems(w)[0];
    if (!it) { w.update(H); continue; }
    const b = w.basketById(it.answer), p = nestPoint(b, w.cfg);
    dragTo(w, it, p.x, p.y, 0.15);
    let g2 = 0; while (it.state === 'fly' && g2++ < 200) w.update(H);
  }
}
function rectsOverlap(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
function circleRect(cx, cy, r, R) {
  const nx = Math.max(R.x, Math.min(cx, R.x + R.w)), ny = Math.max(R.y, Math.min(cy, R.y + R.h));
  return hyp(cx - nx, cy - ny) < r - 1e-6;
}
function nestRect(b, cfg) { return { x: b.x - b.w / 2, y: b.y - cfg.nestTopFrac * b.h, w: b.w, h: b.h }; }
function playSession(seed, age, skill, opts) {
  opts = opts || {};
  const w = new DN.World({ seed, age, lang: opts.lang || 'en' });
  const v = opts.vp || VIEWPORTS[4];
  w.setViewport(v.W, v.H, v.ins);
  const bot = new DN.Bot(w, { skill, seed: seed * 3 + 1 });
  w.newSession();
  const dt = opts.dt || 1 / 30, events = [];
  let t = 0;
  while (w.state !== 'sessionDone' && t < 3000) {
    bot.step(dt); w.update(dt);
    const ev = w.drainEvents();
    if (opts.keep) for (const e of ev) events.push(e);
    if (opts.each) opts.each(w, ev);
    t += dt;
  }
  return { w, bot, t, events };
}

// ======================================================= RNG
test('rng: deterministic, ranges, shuffle is a permutation', () => {
  const a = new DN.RNG(42), b = new DN.RNG(42), c = new DN.RNG(43);
  const sa = [], sb = [], sc = [];
  for (let i = 0; i < 500; i++) { sa.push(a.next()); sb.push(b.next()); sc.push(c.next()); }
  assert.deepStrictEqual(sa, sb); assert.notDeepStrictEqual(sa, sc);
  assert.ok(sa.every(v => v >= 0 && v < 1));
  const r = new DN.RNG('x');
  for (let i = 0; i < 1000; i++) { const k = r.int(2, 5); assert.ok(k >= 2 && k <= 5 && k === Math.floor(k)); const f = r.float(-1, 1); assert.ok(f >= -1 && f < 1); }
  const arr = [1, 2, 3, 4, 5, 6, 7, 8]; const sh = r.shuffle(arr.slice());
  assert.deepStrictEqual(sh.slice().sort(), arr);
  assert.strictEqual(new Set(r.sample(arr, 5)).size, 5);
  assert.notStrictEqual(r.fork(1).next(), r.fork(2).next());
});

// ======================================================= content tables
test('content: palette, age topics and word tables exactly as DESIGN §3/§5.1', () => {
  assert.deepStrictEqual(J(DN.PALETTE.red), { fill: '#E84A4A', dark: '#A8282E' });
  assert.deepStrictEqual(J(DN.PALETTE.cream), { fill: '#FFF4DC', dark: '#C9A877' });
  assert.deepStrictEqual(Object.keys(DN.PALETTE), ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'cream']);
  assert.deepStrictEqual(J(DN.AGE_TOPICS), { 3: ['colors', 'shapes', 'size', 'homes'], 4: ['colors', 'shapes', 'count', 'homes'],
    5: ['shapes', 'count', 'letters', 'homes'], 6: ['lower', 'initial', 'add', 'count'], 7: ['add', 'sub', 'initial', 'oddeven'] });
  assert.deepStrictEqual(J(DN.Content.topicsFor(9)), J(DN.AGE_TOPICS[7]));
  const en = DN.WORDS.en.map(w => w.word + ' ' + w.initial).join(' · ');
  assert.strictEqual(en, 'apple A · bear B · bat B · bird B · banana B · cat C · cow C · duck D · fish F · frog F · hen H · owl O · orange O · rabbit R · sheep S · squirrel S · strawberry S');
  const vi = DN.WORDS.vi.map(w => w.word + ' ' + w.initial).join(' · ');
  assert.strictEqual(vi, 'bò B · cá C · cú C · cừu C · cam C · dơi D · dâu D · gấu G · gà G · mèo M · sóc S · táo T · vịt V · ếch Ê');
  assert.deepStrictEqual(DN.WORDS.vi.map(w => w.sprite.split('_')[1]),
    ['cow', 'fish', 'owl', 'sheep', 'orange', 'bat', 'strawberry', 'bear', 'hen', 'cat', 'squirrel', 'apple', 'duck', 'frog']);
  for (const l of ['en', 'vi']) for (const w of DN.WORDS[l]) {
    assert.ok(/^(animal|fruit)_/.test(w.sprite));
    if (l === 'en') assert.strictEqual(w.initial, w.word[0].toUpperCase());
  }
});

test('content: every topic × age × 1000 seeds → valid, completable rounds with the §5.1 rules', () => {
  const sizeOK = { big: 1.3, small: 0.72 };
  for (const topic of TOPICS) for (const age of AGES) for (let seed = 1; seed <= 1000; seed++) {
    const ri = seed % 5, lang = seed % 2 ? 'en' : 'vi';
    const r = DN.Content.makeRound(topic, { age, lang, rng: new DN.RNG(seed * 31 + age), roundIndex: ri });
    assert.strictEqual(DN.Content.validate(r), null);
    assert.strictEqual(r.promptKey, 'p.' + topic);
    const per = {}; for (const b of r.baskets) per[b.id] = r.items.filter(i => i.answer === b.id);
    const n = r.baskets.length;
    const ctx = topic + '/' + age + '/' + seed;
    for (const it of r.items) { assert.ok(/^i\d+$/.test(it.id)); assert.ok(it.size > 0); }
    switch (topic) {
      case 'colors':
        assert.strictEqual(n, age === 3 ? 2 : age === 4 ? 3 : 4, ctx);
        for (const b of r.baskets) { assert.strictEqual(b.label.type, 'color'); assert.strictEqual(per[b.id].length, ri ? 2 : 1); for (const it of per[b.id]) assert.strictEqual(it.sprite, 'egg_' + b.label.value); }
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
        assert.strictEqual(n, 2); assert.strictEqual(r.items.length, 4);
        assert.strictEqual(new Set(r.items.map(i => i.color)).size, 1);
        for (const it of r.items) assert.strictEqual(it.scale, sizeOK[it.nameValue]);
        break;
      case 'homes': {
        assert.strictEqual(n, age === 3 ? 2 : age === 4 ? 3 : 4, ctx);
        const H2 = { pond: ['fish', 'frog', 'duck'], tree: ['bird', 'owl', 'squirrel'], field: ['rabbit', 'cow', 'sheep', 'hen'], cave: ['bat', 'bear'] };
        for (const b of r.baskets) for (const it of per[b.id]) { assert.ok(H2[b.label.value].includes(it.nameValue)); assert.notStrictEqual(it.nameValue, 'cat'); }
        assert.strictEqual(new Set(r.items.map(i => i.nameValue)).size, r.items.length);
        break;
      }
      case 'count': {
        assert.strictEqual(r.mode, 'count'); assert.strictEqual(n, 1);
        const N = r.baskets[0].need, hi = { 3: 5, 4: 5, 5: 10, 6: 12, 7: 12 }[age];
        assert.ok(N >= 1 && N <= hi, ctx);
        if (ri === 0) assert.ok(N <= 3);
        assert.strictEqual(r.items.length, N + (N <= 3 ? 3 : 2));
        assert.deepStrictEqual(J(r.params), { n: N, fruit: r.params.fruit });
        assert.strictEqual(new Set(r.items.map(i => i.sprite)).size, 1);
        assert.deepStrictEqual(J(r.baskets[0].label), { type: 'number', value: N });
        break;
      }
      case 'letters': case 'lower': {
        assert.strictEqual(n, 3);
        const pool = DN.Content.LETTER_POOL[lang];
        for (const b of r.baskets) { assert.ok(pool.includes(b.label.value)); for (const it of per[b.id]) { assert.strictEqual(it.sprite, 'egg_plain'); assert.strictEqual(it.text, topic === 'lower' ? b.label.value.toLowerCase() : b.label.value); } }
        break;
      }
      case 'initial':
        assert.strictEqual(n, 3);
        for (const b of r.baskets) { assert.ok(per[b.id].length >= 1 && per[b.id].length <= 2); for (const it of per[b.id]) assert.strictEqual(DN.WORDS[lang].find(x => x.word === it.nameValue).initial, b.label.value); }
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

test('content: deterministic (same seed → same round and talk)', () => {
  for (const topic of TOPICS) {
    const a = DN.Content.makeRound(topic, { age: 6, lang: 'vi', rng: new DN.RNG(9), roundIndex: 2 });
    const b = DN.Content.makeRound(topic, { age: 6, lang: 'vi', rng: new DN.RNG(9), roundIndex: 2 });
    assert.deepStrictEqual(J(a), J(b));
    assert.deepStrictEqual(J(DN.Content.makeTalk(topic, { age: 6, lang: 'vi', rng: new DN.RNG(4) })), J(DN.Content.makeTalk(topic, { age: 6, lang: 'vi', rng: new DN.RNG(4) })));
  }
});

test('talk: every topic × age × 1000 seeds → distinct choices containing the answer (3, or 2 for size/oddeven)', () => {
  for (const topic of TOPICS) for (const age of AGES) for (let s = 1; s <= 1000; s++) {
    const t = DN.Content.makeTalk(topic, { age, lang: s % 2 ? 'en' : 'vi', rng: new DN.RNG(s) });
    const n = topic === 'size' || topic === 'oddeven' ? 2 : 3;
    assert.strictEqual(t.choices.length, n, topic);
    assert.strictEqual(new Set(t.choices.map(c => String(c.value))).size, n);
    assert.strictEqual(new Set(t.choices.map(c => c.id)).size, n);
    const ans = t.choices.find(c => c.id === t.answerId); assert.ok(ans);
    assert.strictEqual(t.promptKey, 'talk.' + topic);
    assert.ok(t.show.sprite || t.show.shape);
    // the answer is truly right
    if (topic === 'count') assert.strictEqual(ans.value, t.show.count);
    if (topic === 'colors') assert.strictEqual(ans.value, t.show.color);
    if (topic === 'shapes') assert.strictEqual(ans.value, t.show.shape);
    if (topic === 'size') assert.strictEqual(ans.value, t.show.scale > 1 ? 'big' : 'small');
    if (topic === 'letters' || topic === 'lower') assert.strictEqual(ans.value, t.show.text.toUpperCase());
    if (topic === 'add' || topic === 'sub') { const m = /^(\d+)([+−])(\d+)$/.exec(t.show.text); assert.strictEqual(ans.value, m[2] === '+' ? +m[1] + +m[3] : +m[1] - +m[3]); }
    if (topic === 'oddeven') assert.strictEqual(ans.value, +t.show.text % 2 ? 'odd' : 'even');
    if (topic === 'homes') assert.ok(DN.Content.HOMES[ans.value].includes(t.show.sprite.replace('animal_', '')));
    for (const c of t.choices) if (c.kind === 'number') assert.ok(c.value >= 0);
  }
});

// ======================================================= layout
test('layout: §2 formulas, short-side rule', () => {
  assert.deepStrictEqual(J(DN.World.logicalSize(2532, 1170)), { W: 1558, H: 720 });
  assert.deepStrictEqual(J(DN.World.logicalSize(1170, 2532)), { W: 720, H: 1558 });
  assert.deepStrictEqual(J(DN.World.logicalSize(1024, 1366)), { W: 720, H: 960 });
  assert.deepStrictEqual(J(DN.World.logicalSize(1000, 1000)), { W: 960, H: 720 });
  assert.deepStrictEqual(J(DN.World.logicalSize(4000, 1000)), { W: 1600, H: 720 });
  const L = DN.World.computeLayout(1280, 720, { top: 0, right: 0, bottom: 20, left: 44 }, 3);
  assert.strictEqual(L.groundY, 720 - 20 - 70);
  assert.strictEqual(L.nest.w, Math.min(240, (1280 - 44 - 40) / 3 - 24));
  assert.ok(Math.abs(L.nest.h - 0.62 * L.nest.w) < 1e-9);
  assert.ok(Math.abs(L.nest.y - (L.groundY - 0.45 * L.nest.h)) < 1e-9);
  assert.deepStrictEqual([L.bo.x, L.bo.y, L.bo.h], [44 + 105, 225, 175]);
  assert.deepStrictEqual([L.bubble.x, L.bubble.y, L.bubble.h], [L.bo.x + 85, 24, 104]);
  assert.strictEqual(L.bubble.w, Math.min(620, 1280 - L.bubble.x - 0 - 150));
  assert.deepStrictEqual([L.play.x, L.play.y, L.play.x + L.play.w], [44 + 40, 225 + 10, 1280 - 40]);
  assert.ok(Math.abs(L.play.y + L.play.h - (L.nest.y - 0.39 * L.nest.h - 24)) < 1e-9);
  const Lp = DN.World.computeLayout(720, 1556, { top: 44, bottom: 30, left: 0, right: 0 }, 2);
  assert.deepStrictEqual([Lp.bo.y, Lp.bo.h], [44 + 245, 190]);
});

test('layout: every viewport × nest count → nests/play/Bo/bubble/HUD inside the safe area and apart', () => {
  const cfg = DN.CONFIG;
  for (const v of VIEWPORTS) for (let n = 1; n <= 4; n++) {
    const L = DN.World.computeLayout(v.W, v.H, v.ins, n), ins = L.ins, ctx = v.name + ' n=' + n;
    const safe = { x: ins.left, y: ins.top, w: v.W - ins.left - ins.right, h: v.H - ins.top - ins.bottom };
    const inside = (R) => R.x >= safe.x - 1e-6 && R.y >= safe.y - 1e-6 && R.x + R.w <= safe.x + safe.w + 1e-6 && R.y + R.h <= safe.y + safe.h + 1e-6;
    assert.ok(inside(L.play), ctx + ' play');
    assert.ok(L.play.w > 300 && L.play.h > 200, ctx + ' play big enough ' + L.play.w + 'x' + L.play.h);
    assert.ok(L.bubble.w > 200, ctx + ' bubble w');
    const boR = { x: L.bo.x - 80, y: L.bo.y - L.bo.h, w: 160, h: L.bo.h };
    const hud = { x: v.W - ins.right - 140, y: 0, w: 140 + ins.right, h: ins.top + 90 };
    for (const R of [boR, L.bubble, hud]) assert.ok(!rectsOverlap(R, L.play), ctx + ' play vs ' + JSON.stringify(R));
    assert.ok(!rectsOverlap(L.bubble, hud), ctx + ' bubble vs hud');
    const nests = L.nest.xs.map(x => ({ x: x - L.nest.w / 2, y: L.nest.y - cfg.nestTopFrac * L.nest.h, w: L.nest.w, h: L.nest.h * 0.85 }));
    for (let i = 0; i < n; i++) {
      assert.ok(nests[i].x >= ins.left && nests[i].x + nests[i].w <= v.W - ins.right, ctx + ' nest inside');
      assert.ok(!rectsOverlap(nests[i], L.play), ctx + ' nest vs play');
      for (let j = i + 1; j < n; j++) assert.ok(nests[i].x + nests[i].w + 20 <= nests[j].x, ctx + ' nests apart');
    }
  }
});

test('layout: every topic × age × viewport (40 seeds) → items packed in play, no overlaps, ≥ 0.75× size', () => {
  let worst = 1;
  for (const v of VIEWPORTS) for (const age of AGES) for (const topic of TOPICS) for (let s = 1; s <= 40; s++) {
    const w = mkWorld({ seed: s * 13 + age, age, vp: v, lang: s % 2 ? 'en' : 'vi' });
    roundOf(w, topic, s % 5);
    const ctx = v.name + ' ' + topic + ' age ' + age + ' seed ' + s;
    assert.ok(w.packOk, ctx + ' shrink ' + w.packShrink);
    worst = Math.min(worst, w.packShrink);
    checkPacking(w, ctx);
  }
  assert.ok(worst >= 0.75);
});
function checkPacking(w, ctx) {
  const L = w.layout, P = L.play, cfg = w.cfg;
  const hud = { x: L.W - L.ins.right - 140, y: 0, w: 140 + L.ins.right, h: L.ins.top + 90 };
  const boR = { x: L.bo.x - 80, y: L.bo.y - L.bo.h, w: 160, h: L.bo.h };
  const rest = w.items.filter(i => i.state !== 'in' && i.state !== 'fly');
  for (const it of rest) {
    const r = it.size / 2;
    assert.ok(it.homeX - r >= P.x - 1e-6 && it.homeX + r <= P.x + P.w + 1e-6 && it.homeY - r >= P.y - 1e-6 && it.homeY + r <= P.y + P.h + 1e-6, ctx + ' inside play');
    assert.ok(it.size >= it.baseSize * 0.75 - 1e-9, ctx + ' size');
    for (const R of [hud, boR, L.bubble]) assert.ok(!circleRect(it.homeX, it.homeY, r, R), ctx + ' vs ui');
    for (const b of w.baskets) assert.ok(!circleRect(it.homeX, it.homeY, r, nestRect(b, cfg)), ctx + ' vs nest');
  }
  for (let i = 0; i < rest.length; i++) for (let j = i + 1; j < rest.length; j++) {
    const a = rest[i], b = rest[j];
    assert.ok(hyp(a.homeX - b.homeX, a.homeY - b.homeY) >= 1.1 * Math.max(a.size, b.size) - 1e-6, ctx + ' overlap');
  }
}

test('layout: setViewport mid-round re-packs resting items and moves nests + in-nest items', () => {
  const w = mkWorld({ seed: 3, age: 5 });
  roundOf(w, 'colors', 2); settleAppear(w);
  const it = idleItems(w)[0], b = w.basketById(it.answer), p = nestPoint(b, w.cfg);
  dragTo(w, it, p.x, p.y); run(w, 0.6);
  assert.strictEqual(it.state, 'in');
  const other = idleItems(w)[0], p2 = { x: other.x, y: other.y };
  w.pointerDown(other.x, other.y); w.pointerMove(p2.x + 50, p2.y); run(w, 0.1);
  for (const v of VIEWPORTS) {
    w.setViewport(v.W, v.H, v.ins);
    checkPacking(w, 'resize ' + v.name);
    const nb = w.basketById(b.id);
    assert.strictEqual(nb.x, w.layout.nest.xs[w.baskets.indexOf(nb)]);
    assert.strictEqual(nb.y, w.layout.nest.y);
    const sl = nb.slots[it.slot];
    assert.deepStrictEqual([it.x, it.y, it.size], [sl.x, sl.y, nb.slotSize]);
    for (const o of idleItems(w)) assert.deepStrictEqual([o.x, o.y], [o.homeX, o.homeY]);
    run(w, 0.05);
  }
  // the held item still gets a valid home and returns there
  w.pointerUp(emptyPoint(w).x, emptyPoint(w).y); run(w, 0.8);
  assert.strictEqual(other.state, 'idle');
  assert.ok(hyp(other.x - other.homeX, other.y - other.homeY) <= 3.01);
  checkPacking(w, 'after');
});

test('layout: viewport change during a flight re-targets the new slot', () => {
  const w = mkWorld({ seed: 4, age: 4 });
  roundOf(w, 'colors', 1); settleAppear(w);
  const it = idleItems(w)[0], b = w.basketById(it.answer), p = nestPoint(b, w.cfg);
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
  const n = 30; let maxX = -1e9, rots = [];
  for (let i = 1; i <= n; i++) { w.pointerMove(fx0 + 400 * i / n, fy0); w.update(H); }
  const tx = fx0 + 400 + it._offX;
  run(w, 3, () => { maxX = Math.max(maxX, it.x); rots.push(it.rot); });
  assert.ok(maxX <= tx + 0.5, 'no positional overshoot ' + (maxX - tx));
  assert.ok(Math.abs(it.x - tx) < 0.1);
  const minRot = Math.min(...rots), maxRot = Math.max(...rots);
  assert.ok(minRot < -0.2 && minRot >= -0.45 - 0.2, 'tilts back while moving right: ' + minRot);
  assert.ok(maxRot > 0.03, 'swings past vertical (pendulum): ' + maxRot);
  let crossings = 0; for (let i = 1; i < rots.length; i++) if (Math.sign(rots[i]) !== Math.sign(rots[i - 1]) && Math.abs(rots[i] - rots[i - 1]) > 1e-6) crossings++;
  assert.ok(crossings >= 2, 'swings at least twice: ' + crossings);
  assert.ok(Math.abs(it.rot) < 0.005, 'settles: ' + it.rot);
});

test('flight: correct drop → parabola with apex ≥ 60 px, lands in the slot, squash + nest squash, land event', () => {
  const w = mkWorld({ seed: 6, age: 4 });
  roundOf(w, 'colors', 1); settleAppear(w);
  const it = idleItems(w)[0], b = w.basketById(it.answer), p = nestPoint(b, w.cfg);
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
  assert.ok(minSq < 0, 'nest squash oscillates (damped spring)');
  assert.ok(Math.abs(b.squash) < 0.003 && Math.abs(it.sx - 1) < 0.003 && Math.abs(it.sy - 1) < 0.003);
  assert.strictEqual(it.size, b.slotSize);
  // x0 unused but kept for clarity
  assert.ok(isFinite(x0));
});

test('flight: inherits release velocity (upward fling → higher apex)', () => {
  function fling(flick) {
    const w = mkWorld({ seed: 7, age: 4 });
    roundOf(w, 'colors', 1); settleAppear(w);
    const it = idleItems(w)[0], b = w.basketById(it.answer), p = nestPoint(b, w.cfg);
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

test('wrong drop: nest shakes (3 wiggles, 0.5 s), item hops home in 0.55 s with a wobble', () => {
  const w = mkWorld({ seed: 8, age: 5 });
  roundOf(w, 'colors', 1); settleAppear(w);
  const it = idleItems(w)[0], wrongB = w.baskets.find(b => b.id !== it.answer), p = nestPoint(wrongB, w.cfg);
  const hx = it.homeX, hy = it.homeY;
  dragTo(w, it, p.x, p.y); const ev = w.drainEvents();
  const we = ev.find(e => e.type === 'wrong');
  assert.ok(we && we.basketId === wrongB.id && we.misses === 1);
  assert.strictEqual(w.roundMistakes, 1);
  assert.strictEqual(it.state, 'return');
  assert.strictEqual(w.bo.mood, 'oops');
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
  const b = w.basketById(it.answer), p = nestPoint(b, w.cfg);
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

test('nest drop zone: +30 px sides, +90 px up; overlapping zones pick the nearest nest', () => {
  const w = mkWorld({ seed: 11, age: 5, vp: VIEWPORTS[1] });   // 960 wide: 4 nests 24 px apart → zones overlap
  roundOf(w, 'colors', 1); settleAppear(w);
  const b = w.baskets[0], top = b.y - 0.39 * b.h;
  assert.strictEqual(w.nestAt(b.x, top - 89), b);
  assert.strictEqual(w.nestAt(b.x, top - 91), null);
  assert.strictEqual(w.nestAt(b.x - b.w / 2 - 29, b.y), b);
  assert.strictEqual(w.nestAt(b.x - b.w / 2 - 31, b.y), null);
  const b1 = w.baskets[1], mid = (b.x + b1.x) / 2;
  assert.strictEqual(w.nestAt(mid - 1, b.y), b); assert.strictEqual(w.nestAt(mid + 1, b.y), b1);
});

test('idle life: bob ≤ 3 px around home, egg wiggles ±0.12 rad every 4–8 s', () => {
  const w = mkWorld({ seed: 12, age: 4 });
  roundOf(w, 'colors', 1); settleAppear(w);
  const it = w.items[0]; let maxB = 0, maxR = 0, wig = 0, prev = 0;
  run(w, 20, () => { maxB = Math.max(maxB, Math.abs(it.y - it.homeY)); maxR = Math.max(maxR, Math.abs(it.rot)); if (Math.abs(it.rot) > 0.02 && prev <= 0.02) wig++; prev = Math.abs(it.rot); assert.strictEqual(it.x, it.homeX); });
  assert.ok(maxB > 2 && maxB <= 3 + 1e-9, 'bob ' + maxB);
  assert.ok(maxR > 0.08 && maxR <= 0.12 + 1e-9, 'wiggle ' + maxR);
  assert.ok(wig >= 2, 'wiggles ' + wig);
});

test('appear: staggered 70 ms pop-ins with back overshoot, appear events; nests pop in', () => {
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

// ======================================================= rules
test('count mode: pyramid slots for 12, land reports count/need, round ends exactly at need', () => {
  for (const age of [4, 5, 6]) for (let s = 1; s <= 30; s++) {
    const w = mkWorld({ seed: s, age });
    roundOf(w, 'count', 1 + (s % 4)); settleAppear(w);
    const b = w.baskets[0], N = b.need;
    assert.strictEqual(b.slots.length, N);
    assert.ok(w.items.length >= N + 2);
    for (const sl of b.slots) assert.ok(sl.x - b.slotSize / 2 >= b.x - b.w / 2 - 1e-6 && sl.x + b.slotSize / 2 <= b.x + b.w / 2 + 1e-6, 'slot inside nest');
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) assert.ok(hyp(b.slots[i].x - b.slots[j].x, b.slots[i].y - b.slots[j].y) >= b.slotSize * 0.55, 'slots visible');
    let landed = 0;
    for (let k = 0; k < N; k++) {
      assert.strictEqual(w.state, 'round');
      const it = idleItems(w)[0], p = nestPoint(b, w.cfg);
      dragTo(w, it, p.x, p.y);
      let done = false;
      while (!done) { w.update(H); for (const e of w.drainEvents()) if (e.type === 'land') { landed++; assert.deepStrictEqual([e.count, e.need], [landed, N]); done = true; if (landed < N) assert.strictEqual(w.state, 'round'); else assert.strictEqual(w.state, 'roundDone'); } }
    }
    assert.strictEqual(b.count, N);
    assert.strictEqual(w.items.filter(i => i.state === 'in').length, N);
  }
  // 12 fruit: max pyramid stays within 3 rows
  const w = mkWorld({ seed: 1, age: 6 });
  w.levels = ['count']; w.startLevel(0); w.round = 1;
  let r; do { w._beginRound(); r = w.baskets[0].need; } while (r !== 12);
  const ys = new Set(w.baskets[0].slots.map(sl => Math.round(sl.y)));
  assert.strictEqual(ys.size, 3);
});

test('stars: 0 mistakes → 3, 1 → 2, ≥ 2 → 1; talk right → +1', () => {
  for (const mistakes of [0, 1, 2, 3]) {
    const w = mkWorld({ seed: 20 + mistakes, age: 5 });
    roundOf(w, 'colors', 1); settleAppear(w);
    for (let m = 0; m < mistakes; m++) {
      const it = idleItems(w)[0], wb = w.baskets.find(b => b.id !== it.answer), p = nestPoint(wb, w.cfg);
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

test('help: 2 misses on the same item → auto hint (glow 3 s); hint() for held item', () => {
  const w = mkWorld({ seed: 40, age: 5 });
  roundOf(w, 'colors', 1); settleAppear(w);
  const it = idleItems(w)[0], wb = w.baskets.find(b => b.id !== it.answer);
  let p = nestPoint(wb, w.cfg);
  dragTo(w, it, p.x, p.y); run(w, 0.7);
  assert.ok(!w.drainEvents().some(e => e.type === 'hint'));
  const e = emptyPoint(w);
  dragTo(w, it, e.x, e.y);
  const h = w.drainEvents().find(x => x.type === 'hint');
  assert.ok(h && h.basketId === it.answer, 'auto hint after 2 misses');
  const rb = w.basketById(it.answer);
  w.update(H);
  assert.strictEqual(rb.glow, 1); assert.strictEqual(w.bo.mood, 'think');
  run(w, 2.5); assert.ok(rb.glow > 0); run(w, 0.6); assert.strictEqual(rb.glow, 0);
  run(w, 0.5);
  const o = idleItems(w)[1]; w.pointerDown(o.x, o.y);
  assert.strictEqual(w.hint(), o.answer);
  assert.strictEqual(w.drainEvents().filter(x => x.type === 'hint')[0].basketId, o.answer);
});

test('idle: event every 12 s without a grab (with promptKey/params), reset by a grab', () => {
  const w = mkWorld({ seed: 41, age: 4 });
  roundOf(w, 'count', 2); settleAppear(w); w.drainEvents();
  const times = []; let t = 0;
  run(w, 30, () => { t += H; for (const e of w.drainEvents()) if (e.type === 'idle') { times.push(t); assert.strictEqual(e.promptKey, 'p.count'); assert.deepStrictEqual(J(e.params), J(w.cur.params)); } });
  assert.strictEqual(times.length, 2);
  assert.ok(Math.abs(times[0] - 12) < 3 * H && Math.abs(times[1] - 24) < 3 * H);
  const it = idleItems(w)[0]; w.pointerDown(it.x, it.y); run(w, 20);
  assert.ok(!w.drainEvents().some(e => e.type === 'idle'), 'no idle while holding');
  w.cancelDrag(); run(w, 11);
  assert.ok(!w.drainEvents().some(e => e.type === 'idle'));
  run(w, 1.2);
  assert.ok(w.drainEvents().some(e => e.type === 'idle'));
});

test('state machine: timings intro 1.8 / roundDone 2.0 / talk +1.6 / levelDone 2.4 → sessionDone', () => {
  const w = mkWorld({ seed: 50, age: 3 });
  w.newSession();
  const ev0 = w.drainEvents();
  assert.deepStrictEqual(J(ev0[0]), { type: 'session', levels: ['colors', 'shapes', 'size', 'homes'] });
  assert.deepStrictEqual(J(ev0[1]), { type: 'level', level: 0, topic: 'colors' });
  assert.strictEqual(w.state, 'intro');
  let t = 0; while (w.state === 'intro') { w.update(H); t += H; }
  assert.ok(Math.abs(t - 1.8) < 2 * H);
  const re = w.drainEvents().find(e => e.type === 'round');
  assert.deepStrictEqual(J(re), { type: 'round', round: 0, topic: 'colors', mode: 'sort', promptKey: 'p.colors', params: {} });
  for (let lvl = 0; lvl < 4; lvl++) {
    if (lvl > 0) { while (w.state === 'intro') w.update(H); }
    for (let r = 0; r < 5; r++) {
      assert.strictEqual(w.state, 'round'); assert.strictEqual(w.round, r);
      settleAppear(w); solveRound(w);
      assert.strictEqual(w.state, 'roundDone');
      t = 0; let left = null;
      while (w.state === 'roundDone') { w.update(H); t += H; if (left === null && w.items.length && w.items.every(i => i.state === 'leave')) left = t; }
      assert.ok(Math.abs(t - 2.0) < 2 * H, 'roundDone ' + t);
      assert.ok(Math.abs(left - 1.2) < 2 * H, 'leave at 1.2 s');
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
    assert.deepStrictEqual(J(ld), { type: 'levelDone', level: lvl, stars: lvl === 2 ? 15 : 16 });
    t = 0; while (w.state === 'levelDone') { w.update(H); t += H; }
    assert.ok(Math.abs(t - 2.4) < 2 * H);
    assert.strictEqual(w.weather, lvl === 3 ? 3 : lvl + 1);
  }
  assert.strictEqual(w.state, 'sessionDone');
  assert.deepStrictEqual(J(w.drainEvents().find(e => e.type === 'sessionDone')), { type: 'sessionDone', stars: 63 });
  run(w, 5); assert.strictEqual(w.state, 'sessionDone');
  w.setAge(7); w.setLang('vi'); assert.strictEqual(w.age, 3, 'age applies at newSession');
  w.newSession(); assert.deepStrictEqual([w.age, w.lang, w.stars, w.state], [7, 'vi', 0, 'intro']);
  w.startLevel(2); assert.deepStrictEqual([w.level, w.topic, w.weather, w.state], [2, 'initial', 2, 'intro']);
});

test('Bo: moods on events, cheer hops, looks at the held item', () => {
  const w = mkWorld({ seed: 51, age: 4 });
  roundOf(w, 'colors', 1); settleAppear(w);
  const it = idleItems(w)[0];
  w.pointerDown(it.x, it.y); w.pointerMove(it.x + 200, it.y); run(w, 1);
  assert.ok(hyp(w.bo.lookX - it.x, w.bo.lookY - it.y) < 5);
  const b = w.basketById(it.answer), p = nestPoint(b, w.cfg);
  w.pointerMove(p.x, p.y); run(w, 0.4); w.pointerUp();
  assert.strictEqual(w.bo.mood, 'happy'); run(w, 0.95); assert.strictEqual(w.bo.mood, 'idle');
  solveRound(w);
  assert.strictEqual(w.bo.mood, 'cheer'); let maxHop = 0;
  run(w, 1.3, () => { maxHop = Math.max(maxHop, w.bo.hop); assert.ok(w.bo.hop >= 0); });
  assert.ok(maxHop > 20);
});

// ======================================================= sessions / bot / determinism
test('determinism: same seed + same inputs → identical event stream and state', () => {
  const a = playSession(77, 5, 0.6, { keep: true }), b = playSession(77, 5, 0.6, { keep: true });
  assert.strictEqual(JSON.stringify(a.events), JSON.stringify(b.events));
  assert.strictEqual(a.w.stars, b.w.stars); assert.strictEqual(a.t, b.t);
  const c = playSession(78, 5, 0.6, { keep: true });
  assert.notStrictEqual(JSON.stringify(a.events), JSON.stringify(c.events));
});

const SESSION_LEN = {};
test('bot: full session reaches sessionDone for every age, both languages, several viewports', () => {
  for (const age of AGES) for (const skill of [0.6, 1]) {
    const lens = [];
    for (let s = 1; s <= 3; s++) {
      const vp = VIEWPORTS[(s + age) % VIEWPORTS.length];
      const r = playSession(s * 100 + age, age, skill, { lang: s % 2 ? 'en' : 'vi', vp });
      assert.strictEqual(r.w.state, 'sessionDone', 'age ' + age + ' skill ' + skill);
      assert.ok(r.w.stars >= 20 && r.w.stars <= 64);
      lens.push(r.t);
      if (skill === 1) {
        assert.strictEqual(r.bot.stats.wrong, 0); assert.strictEqual(r.bot.stats.misses, 0);
        assert.strictEqual(r.w.stars, 64, 'perfect bot gets every star');
        assert.strictEqual(r.bot.stats.talkRight, 4);
      } else assert.ok(r.bot.stats.wrong + r.bot.stats.misses > 0);
      assert.strictEqual(r.bot.stats.talks, 4);
    }
    SESSION_LEN[age + '@' + skill] = lens.reduce((x, y) => x + y) / lens.length;
  }
});

test('bot: drives pointer like a finger (human speed, events consistent)', () => {
  const w = mkWorld({ seed: 90, age: 4 });
  const bot = new DN.Bot(w, { skill: 0.6, seed: 2 });
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

// ======================================================= weather
const AMB = [
  { skyTop: '#8FD3FF', skyBottom: '#E6F7FF', tint: null, darkness: 0, rainbow: 0 },
  { skyTop: '#7EC8F0', skyBottom: '#DDF3E8', tint: null, darkness: 0, rainbow: 0, sway: 0.8 },
  { skyTop: '#8C9BB0', skyBottom: '#C9D3DC', tint: null, darkness: 0.25, rainbow: 0 },
  { skyTop: '#FFB38A', skyBottom: '#FFE7B8', tint: 'rgba(255,170,90,0.120)', darkness: 0, rainbow: 1 }
];
test('weather: ambient values per mood, 2 s crossfade interpolates colours', () => {
  const wx = new DN.Weather({ width: 1280, height: 720, seed: 1 });
  for (let m = 0; m < 4; m++) {
    wx.setWeather(m, { instant: true });
    const a = wx.ambient, e = AMB[m];
    assert.deepStrictEqual([a.skyTop, a.skyBottom, a.tint, a.darkness, a.rainbow], [e.skyTop, e.skyBottom, e.tint, e.darkness, e.rainbow]);
    if (e.sway) assert.ok(Math.abs(wx.ambient.sway - 0.8) < 0.3);
    for (const k of ['wind', 'sway', 'sun']) assert.ok(a[k] >= -1 && a[k] <= 1 + 1e-9);
  }
  wx.setWeather(0, { instant: true });
  wx.setWeather(2);
  wx.update(1.0, { groundY: 650 });
  const mid = wx.ambient.skyTop;
  assert.notStrictEqual(mid, AMB[0].skyTop); assert.notStrictEqual(mid, AMB[2].skyTop);
  const ch = c => [1, 3, 5].map(i => parseInt(c.substr(i, 2), 16));
  const A = ch(AMB[0].skyTop), B = ch(AMB[2].skyTop), M = ch(mid);
  for (let i = 0; i < 3; i++) assert.ok((M[i] - A[i]) * (M[i] - B[i]) <= 0, 'between');
  assert.ok(wx.ambient.darkness > 0.05 && wx.ambient.darkness < 0.2);
  wx.update(1.05, { groundY: 650 });
  assert.strictEqual(wx.ambient.skyTop, AMB[2].skyTop);
  assert.strictEqual(wx.ambient.darkness, 0.25);
  wx.setWeather(3); wx.update(1, { groundY: 650 });
  assert.ok(/^rgba\(255,170,90,0\.0[5-7]\d\)$/.test(wx.ambient.tint), wx.ambient.tint);
});

test('weather: particle cap 140 (scaled by area), sprites from §4.3, deterministic, resize', () => {
  const SPR = new Set(DN.Weather.SPRITES), CL = new Set(DN.Weather.CLOUD_SPRITES);
  const counts = {};
  for (const [W, Hh] of [[1600, 720], [1280, 720], [960, 720], [720, 1600], [720, 960]]) {
    const wx = new DN.Weather({ width: W, height: Hh, seed: 3 });
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
        }
        for (const c of wx.clouds) { assert.ok(CL.has(c.sprite)); assert.ok(c.alpha >= 0 && c.alpha <= 1); }
      }
      counts[W + 'x' + Hh + ':' + m] = wx.particles.length;
    }
  }
  assert.ok(counts['960x720:2'] < counts['1600x720:2'], 'scales with area');
  const a = new DN.Weather({ width: 1280, height: 720, seed: 9 }), b = new DN.Weather({ width: 1280, height: 720, seed: 9 });
  a.setWeather(1); b.setWeather(1);
  for (let i = 0; i < 300; i++) { a.update(1 / 60, { groundY: 650 }); }
  for (let i = 0; i < 100; i++) { b.update(3 / 60, { groundY: 650 }); }
  assert.strictEqual(JSON.stringify(a.particles), JSON.stringify(b.particles), 'dt-split independent');
  const x0 = a.particles[0].x;
  a.resize(640, 720); assert.ok(Math.abs(a.particles[0].x - x0 / 2) < 1e-9); assert.strictEqual(a.width, 640);
});

test('weather: motion — butterflies flap & wander on screen, leaves flutter + spin, rain angled with splashes', () => {
  const wx = new DN.Weather({ width: 1280, height: 720, seed: 5 });
  wx.setWeather(0, { instant: true });
  const bf = wx.particles.filter(p => p.kind === 'butterfly');
  assert.ok(bf.length >= 3);
  const b0 = bf[0]; const sprites = new Set(); let onScreen = 0, n = 0, turns = [];
  for (let i = 0; i < 60 * 20; i++) {
    wx.update(1 / 60, { groundY: 650 }); sprites.add(b0.sprite); n++;
    if (b0.x > -40 && b0.x < 1320 && b0.y > 0 && b0.y < 650) onScreen++;
    turns.push(b0.hd);
  }
  assert.ok(sprites.has('butterfly1') && sprites.has('butterfly2'));
  assert.ok(onScreen / n > 0.95, 'stays around');
  let maxJump = 0; for (let i = 1; i < turns.length; i++) maxJump = Math.max(maxJump, Math.abs(turns[i] - turns[i - 1]));
  assert.ok(maxJump < 0.15, 'smooth heading');

  wx.setWeather(1, { instant: true });
  const leaf = wx.particles.find(p => p.kind === 'leaf' && p.layer === 'back');
  let rots = [], vxs = [];
  for (let i = 0; i < 120; i++) { wx.update(1 / 60, { groundY: 650 }); if (leaf.rest < 0) { rots.push(leaf.rot); vxs.push(leaf.vx); } }
  assert.ok(Math.max(...rots) - Math.min(...rots) > 0.5, 'leaf swings/spins');
  assert.ok(Math.min(...vxs) < Math.max(...vxs) - 40, 'pendulum flutter');
  let gusts = 0, prev = 0;
  for (let i = 0; i < 60 * 30; i++) { wx.update(1 / 60, { groundY: 650 }); if (wx.gust > 0.3 && prev <= 0.3) gusts++; prev = wx.gust; }
  assert.ok(gusts >= 4 && gusts <= 8, 'gusts every 4–7 s: ' + gusts);

  wx.setWeather(2, { instant: true });
  let splashes = 0;
  for (let i = 0; i < 120; i++) {
    wx.update(1 / 60, { groundY: 650 });
    for (const p of wx.particles) {
      if (p.kind === 'rain') { assert.ok(p.rot < 0 && p.rot > -0.4, 'angled by wind'); assert.ok(p.alpha <= 0.5 + 1e-9); }
      if (p.kind === 'splash') { splashes++; assert.ok(p.y >= 650 && p.y <= 650 + 40 + 1e-9); }
    }
  }
  assert.ok(splashes > 50);
  assert.ok(wx.clouds.every(c => c.sprite === 'cloud_rain'));
  wx.setWeather(3); for (let i = 0; i < 180; i++) wx.update(1 / 60, { groundY: 650 });
  assert.ok(wx.particles.some(p => p.kind === 'sparkle'));
  assert.ok(!wx.particles.some(p => p.kind === 'rain' && !p.dying));
  assert.ok(wx.clouds.every(c => c.sprite !== 'cloud_rain'), 'old clouds faded out');
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
  console.log('\nSimulated session length (game seconds, avg of 3):');
  for (const k of Object.keys(SESSION_LEN)) console.log('  age ' + k.replace('@', ' skill ') + ': ' + SESSION_LEN[k].toFixed(0) + ' s');
}
console.log('\n' + pass + ' passed, ' + fail + ' failed (' + (Date.now() - t0) + ' ms)');
process.exit(fail ? 1 : 0);
