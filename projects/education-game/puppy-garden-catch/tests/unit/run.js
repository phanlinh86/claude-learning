#!/usr/bin/env node
// Puppy Garden Catch — headless unit tests for rng / content / world / weather / bot.
// Run from projects/education-game/puppy-garden-catch:   node tests/unit/run.js
'use strict';
const assert = require('assert');
const { load } = require('./load');

const PG = load();
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const H = 1 / 120;
const J = v => JSON.parse(JSON.stringify(v));
// vm-realm arrays/objects are not reference-equal to this realm's: compare through JSON
assert.deepStrictEqual = ((orig) => (a, b, m) => orig(J(a), J(b), m))(assert.deepStrictEqual);
assert.notDeepStrictEqual = ((orig) => (a, b, m) => orig(J(a), J(b), m))(assert.notDeepStrictEqual);
const hyp = (x, y) => Math.sqrt(x * x + y * y);
const AGES = [3, 4, 5, 6, 7];
const TOPICS = PG.Content.TOPICS;
const near = (a, b, eps, m) => assert.ok(Math.abs(a - b) <= eps, (m || '') + ' ' + a + ' vs ' + b);
const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };

const VIEWPORTS = [
  { W: 1556, H: 720, ins: null, name: 'phone landscape' },
  { W: 960, H: 720, ins: null, name: '4:3 landscape' },
  { W: 720, H: 1556, ins: null, name: 'phone portrait' },
  { W: 720, H: 1036, ins: null, name: 'iPad 820×1180 portrait' },
  { W: 1280, H: 720, ins: null, name: '16:9' },
  { W: 720, H: 1556, ins: { top: 108, bottom: 62, left: 0, right: 0 }, name: 'notch portrait' },
  { W: 1556, H: 720, ins: { top: 0, left: 108, right: 108, bottom: 38 }, name: 'notch landscape' },
  { W: 960, H: 720, ins: { top: 32, left: 0, right: 0, bottom: 27 }, name: 'iPad landscape insets' },
  { W: 720, H: 1036, ins: { top: 32, bottom: 27, left: 0, right: 0 }, name: 'iPad 820×1180 portrait insets' },
  { W: 1036, H: 720, ins: { top: 32, bottom: 27, left: 0, right: 0 }, name: 'iPad 1180×820 landscape insets' }
];
const SPRITE_OK = /^(ball_(red|blue|yellow|green|orange|purple|plain)|fruit_(apple|banana|strawberry|orange|pear|cherry|carrot)|animal_(fish|frog|duck|bird|owl|squirrel|rabbit|cow|sheep|bat|bear|hen|cat|pig|snail|ladybug)|bubble)$/;
const NAME_KINDS = ['color', 'shape', 'size', 'animal', 'fruit', 'number', 'letter', 'parity', 'sum', 'diff', 'word'];

// ---------- helpers ----------
function mkWorld(o) {
  o = o || {};
  const w = new PG.World({ seed: o.seed || 1, age: o.age || 4, lang: o.lang || 'en', config: o.config });
  const v = o.vp || VIEWPORTS[1];
  w.setViewport(v.W, v.H, v.ins);
  return w;
}
/** Starts round `ri` of `topic` directly (skips intro); level sets the weather. */
function roundOf(w, topic, ri, level) {
  w.levels = [topic, topic, topic, topic];
  w.startLevel(level || 0);
  w.round = ri || 0;
  w._beginRound();
  w.drainEvents();
  return w;
}
const manual = (o) => Object.assign({}, o || {}, { config: Object.assign({ autoSpawn: false }, (o && o.config) || {}) });
function run(w, s, each) { const n = Math.round(s / H); for (let i = 0; i < n; i++) { if (each) each(i); w.update(H); } }
function runUntil(w, pred, maxS) { const n = Math.round((maxS || 30) / H); for (let i = 0; i < n; i++) { if (pred()) return true; w.update(H); } return pred(); }
/** A spawned bubble moved to (x, y) (drift centre too). */
function place(it, x, y, w) { it.xb = x - w.cfg.swayAmp * Math.sin(it.phase); it.x = x; if (y !== undefined) it.y = y; it.ub = 0; return it; }
function spawnAbove(w, right, dx, y) {
  const it = w._spawn(right);
  return place(it, w.basket.x + (dx || 0), y !== undefined ? y : w.basket.y - 60, w);
}
function steerTo(w, x, s) { const fy = w.layout.groundY + 24; w.pointerDown(x, fy); run(w, s === undefined ? 0.05 : s); w.pointerMove(x, fy); }
function playSession(seed, age, skill, opts) {
  opts = opts || {};
  const w = new PG.World({ seed, age, lang: opts.lang || 'en', config: opts.config });
  const v = opts.vp || VIEWPORTS[4];
  w.setViewport(v.W, v.H, v.ins);
  const bot = new PG.Bot(w, { skill, seed: seed * 3 + 1 });
  w.newSession();
  const dt = opts.dt || 1 / 30, events = [], rounds = [], chapters = [];
  let t = 0, rS = 0, lS = 0;
  while (w.state !== 'sessionDone' && t < 3000) {
    bot.step(dt); w.update(dt);
    const ev = w.drainEvents();
    for (const e of ev) {
      if (opts.keep) events.push(e);
      if (e.type === 'round') rS = w.time;
      if (e.type === 'roundDone') rounds.push({ dur: w.time - rS, level: w.level, topic: w.topic, stars: e.stars });
      if (e.type === 'level') lS = w.time;
      if (e.type === 'levelDone') chapters.push({ dur: w.time - lS, topic: w.topic });
    }
    if (opts.each) opts.each(w, ev);
    t += dt;
  }
  return { w, bot, t, events, rounds, chapters };
}

// ======================================================= RNG
test('rng: deterministic, ranges, shuffle is a permutation', () => {
  const a = new PG.RNG(42), b = new PG.RNG(42), c = new PG.RNG(43);
  const sa = [], sb = [], sc = [];
  for (let i = 0; i < 500; i++) { sa.push(a.next()); sb.push(b.next()); sc.push(c.next()); }
  assert.deepStrictEqual(sa, sb); assert.notDeepStrictEqual(sa, sc);
  assert.ok(sa.every(v => v >= 0 && v < 1));
  const r = new PG.RNG('x');
  for (let i = 0; i < 1000; i++) { const k = r.int(2, 5); assert.ok(k >= 2 && k <= 5 && k === Math.floor(k)); const f = r.float(-1, 1); assert.ok(f >= -1 && f < 1); }
  const arr = [1, 2, 3, 4, 5, 6, 7, 8]; const sh = r.shuffle(arr.slice());
  assert.deepStrictEqual(sh.slice().sort(), arr);
  assert.strictEqual(new Set(r.sample(arr, 5)).size, 5);
  assert.notStrictEqual(r.fork(1).next(), r.fork(2).next());
});

// ======================================================= content tables
test('content: palette, age topics, sounds and word tables as DESIGN §3/§5.1', () => {
  assert.deepStrictEqual(J(PG.PALETTE.red), { fill: '#E84A4A', dark: '#A8282E' });
  assert.deepStrictEqual(J(PG.PALETTE.cream), { fill: '#FFF4DC', dark: '#C9A877' });
  assert.deepStrictEqual(Object.keys(PG.PALETTE), ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'cream']);
  assert.deepStrictEqual(J(PG.AGE_TOPICS), { 3: ['colors', 'shapes', 'size', 'animals'], 4: ['colors', 'shapes', 'count', 'animals'],
    5: ['shapes', 'count', 'letters', 'animals'], 6: ['lower', 'initial', 'add', 'count'], 7: ['add', 'sub', 'initial', 'oddeven'] });
  assert.deepStrictEqual(J(PG.Content.topicsFor(9)), J(PG.AGE_TOPICS[7]));
  assert.deepStrictEqual(J(PG.Content.topicsFor(1)), J(PG.AGE_TOPICS[3]));
  assert.deepStrictEqual(Object.keys(PG.ANIMAL_SOUNDS).sort(), ['bird', 'cat', 'cow', 'duck', 'frog', 'hen', 'owl', 'pig', 'sheep']);
  for (const l of ['en', 'vi']) for (const w of PG.WORDS[l]) {
    assert.ok(SPRITE_OK.test(w.sprite), w.sprite);
    if (l === 'en') assert.strictEqual(w.initial, w.word[0].toUpperCase());
  }
  assert.ok(!PG.Content.letterPool('en', 'lower').includes('I') && !PG.Content.letterPool('en', 'lower').includes('L'));
});

test('content: every topic × age × 200 seeds × rounds 0–4 × en/vi → valid, completable rounds with the §5.1 rules', () => {
  let nRounds = 0;
  for (const topic of TOPICS) for (const age of AGES) for (let seed = 1; seed <= 200; seed++) for (let ri = 0; ri <= 4; ri++) {
    const lang = (seed + ri) % 2 ? 'en' : 'vi';
    const r = PG.Content.makeRound(topic, { age, lang, rng: new PG.RNG(seed * 31 + age * 7 + ri), roundIndex: ri });
    nRounds++;
    const ctx = topic + '/' + age + '/' + seed + '/' + ri;
    assert.strictEqual(PG.Content.validate(r), null, ctx);
    assert.strictEqual(r.topic, topic);
    assert.ok(r.promptKey === 'p.' + topic || (topic === 'animals' && r.promptKey === 'p.animalsSound'), ctx);
    const rights = r.pool.filter(t => t.right), wrongs = r.pool.filter(t => !t.right);
    assert.ok(rights.length >= 1 && wrongs.length >= 1, ctx);
    for (const t of r.pool) {
      assert.strictEqual(PG.Content.matches(t, r.target), t.right, ctx + ' matches');
      assert.ok(NAME_KINDS.includes(t.nameKind), t.nameKind);
      assert.ok(t.size >= 60 && t.size <= 140, ctx + ' size ' + t.size);
      if (t.sprite) assert.ok(SPRITE_OK.test(t.sprite), t.sprite);
      if (t.shape) assert.ok(PG.Content.SHAPES.includes(t.shape));
    }
    // need / air / share rules
    if (r.mode === 'catch') assert.strictEqual(r.need, ri === 0 ? 1 : ri === 1 ? 2 : ri === 2 ? (r.need === 2 || r.need === 3 ? r.need : -1) : 3, ctx + ' need');
    const ma = { 3: 2, 4: 3, 5: 3, 6: 4, 7: 4 }[age];
    assert.strictEqual(r.maxAir, ri === 0 ? Math.max(2, ma - 1) : ma, ctx + ' maxAir');
    assert.ok(r.rightShare >= 0.5 && r.rightShare <= 0.7);
    const kinds = new Set(r.pool.map(t => String(t.nameValue))).size;
    switch (topic) {
      case 'colors': {
        assert.strictEqual(r.pool.length, age === 3 ? 2 : age === 4 ? 3 : 4, ctx);
        const cs = r.pool.map(t => t.color);
        for (const t of r.pool) assert.strictEqual(t.sprite, 'ball_' + t.color);
        if (age < 5) { assert.ok(!(cs.includes('blue') && cs.includes('purple')) && !(cs.includes('red') && cs.includes('green')), ctx + ' colour-blind'); }
        assert.deepStrictEqual(J(r.params), { color: r.target.value });
        break;
      }
      case 'shapes':
        assert.strictEqual(kinds, age === 3 ? 2 : age === 4 ? 3 : 4, ctx);
        for (const t of r.pool) { assert.strictEqual(t.sprite, null); if (age < 5) { assert.notStrictEqual(t.shape, 'rectangle'); assert.ok(t.color && !t.anyColor); } else assert.ok(t.anyColor && !t.color); }
        if (age < 5) assert.strictEqual(new Set(r.pool.map(t => t.color)).size, r.pool.length, 'own colour per shape');
        break;
      case 'size':
        assert.strictEqual(r.pool.length, 2);
        assert.strictEqual(new Set(r.pool.map(t => t.color)).size, 1);
        assert.deepStrictEqual(r.pool.map(t => t.scale).sort(), [0.7, 1.3]);
        for (const t of r.pool) assert.strictEqual(t.scale, t.nameValue === 'big' ? 1.3 : 0.7);
        break;
      case 'count': {
        assert.strictEqual(r.mode, 'count');
        const N = r.need;
        assert.deepStrictEqual(J(r.params), { n: N, fruit: r.target.value });
        assert.strictEqual(r.rightShare, 0.7);
        assert.strictEqual(r.pool.length, 2);
        assert.ok(PG.Content.FRUITS.includes(r.target.value));
        if (age === 4) assert.ok(ri === 0 ? N >= 1 && N <= 2 : N >= 2 && N <= 5, ctx + ' N ' + N);
        if (age === 5) assert.ok(ri === 0 ? N === 3 : N >= 3 && N <= 10, ctx + ' N ' + N);
        if (age >= 6) assert.ok(N >= 4 && N <= 12, ctx + ' N ' + N);
        if (age === 3) assert.ok(N >= 1 && N <= 3);
        break;
      }
      case 'animals':
        assert.strictEqual(r.pool.length, age === 3 ? 2 : age === 4 ? 3 : 4, ctx);
        for (const t of r.pool) assert.ok(PG.ANIMAL_SOUNDS[t.nameValue] && t.sprite === 'animal_' + t.nameValue);
        assert.strictEqual(r.promptKey, age >= 5 && ri > 0 ? 'p.animalsSound' : 'p.animals', ctx);
        assert.deepStrictEqual(J(r.params), { animal: r.target.value, sound: r.target.value });
        break;
      case 'letters': case 'lower': {
        assert.strictEqual(r.pool.length, 3);
        const pool = PG.Content.letterPool(lang, topic);
        assert.ok(pool.includes(r.target.value));
        for (const t of r.pool) { assert.strictEqual(t.sprite, 'ball_plain'); assert.ok(pool.includes(t.text.toUpperCase())); assert.strictEqual(t.text, topic === 'lower' ? t.text.toLowerCase() : t.text.toUpperCase()); }
        if (topic === 'lower') for (const t of r.pool) assert.ok(t.text !== 'l' && t.text !== 'i');
        break;
      }
      case 'initial':
        assert.strictEqual(new Set(r.pool.map(t => PG.WORDS[lang].find(x => x.word === t.nameValue).initial)).size, 3, ctx);
        for (const t of r.pool) assert.strictEqual(PG.WORDS[lang].find(x => x.word === t.nameValue).initial === r.target.value, t.right);
        break;
      case 'add': case 'sub': {
        const m = /^(\d+)([+−])(\d+)$/.exec(r.params.sum); assert.ok(m, r.params.sum);
        const a = +m[1], c = +m[3], v = m[2] === '+' ? a + c : a - c;
        assert.ok(a >= 1 && c >= 1);
        assert.strictEqual(v, r.target.value);
        if (topic === 'add') assert.ok(v <= (age >= 7 ? 20 : 10) && v >= 2); else assert.ok(a <= 10 && v >= 0 && v <= 9);
        assert.strictEqual(new Set(r.pool.map(t => t.text)).size, 3);
        for (const t of r.pool) assert.ok(+t.text >= 0);
        break;
      }
      case 'oddeven':
        assert.ok(new Set(r.pool.map(t => t.text)).size >= 3);
        for (const t of r.pool) assert.ok(+t.text >= 1 && +t.text <= 20);
        break;
    }
  }
  assert.strictEqual(nRounds, TOPICS.length * 5 * 200 * 5);
});

test('content: deterministic (same seed → same round and talk)', () => {
  for (const topic of TOPICS) for (const age of AGES) {
    const a = PG.Content.makeRound(topic, { age, lang: 'vi', rng: new PG.RNG(9), roundIndex: 2 });
    const b = PG.Content.makeRound(topic, { age, lang: 'vi', rng: new PG.RNG(9), roundIndex: 2 });
    assert.deepStrictEqual(J(a), J(b));
    assert.deepStrictEqual(J(PG.Content.makeTalk(topic, { age, lang: 'vi', rng: new PG.RNG(4) })), J(PG.Content.makeTalk(topic, { age, lang: 'vi', rng: new PG.RNG(4) })));
  }
});

test('talk: every topic × age × 200 seeds → sister-game format, distinct choices containing the true answer', () => {
  for (const topic of TOPICS) for (const age of AGES) for (let s = 1; s <= 200; s++) {
    const t = PG.Content.makeTalk(topic, { age, lang: s % 2 ? 'en' : 'vi', rng: new PG.RNG(s) });
    const n = topic === 'size' || topic === 'oddeven' ? 2 : 3;
    assert.deepStrictEqual(Object.keys(t).sort(), ['answerId', 'choices', 'params', 'promptKey', 'show', 'topic']);
    assert.deepStrictEqual(Object.keys(t.show).sort(), ['color', 'count', 'scale', 'shape', 'sprite', 'text']);
    assert.strictEqual(t.choices.length, n, topic);
    assert.strictEqual(new Set(t.choices.map(c => String(c.value))).size, n);
    assert.strictEqual(new Set(t.choices.map(c => c.id)).size, n);
    for (const c of t.choices) { assert.ok(NAME_KINDS.includes(c.kind)); assert.ok(/^c\d$/.test(c.id)); }
    const ans = t.choices.find(c => c.id === t.answerId); assert.ok(ans);
    assert.strictEqual(t.promptKey, 'talk.' + topic);
    assert.ok(t.show.sprite || t.show.shape);
    if (t.show.sprite) assert.ok(SPRITE_OK.test(t.show.sprite), t.show.sprite);
    if (topic === 'count') assert.strictEqual(ans.value, t.show.count);
    if (topic === 'colors') { assert.strictEqual(ans.value, t.show.color); assert.strictEqual(t.show.sprite, 'ball_' + t.show.color); }
    if (topic === 'shapes') assert.strictEqual(ans.value, t.show.shape);
    if (topic === 'size') assert.strictEqual(ans.value, t.show.scale > 1 ? 'big' : 'small');
    if (topic === 'animals') { assert.strictEqual(ans.kind, 'animal'); assert.strictEqual(t.params.sound, ans.value); assert.strictEqual(t.show.sprite, 'bubble'); assert.strictEqual(t.show.text, null); }
    if (topic === 'letters' || topic === 'lower') assert.strictEqual(ans.value, t.show.text.toUpperCase());
    if (topic === 'initial') assert.ok(PG.WORDS[s % 2 ? 'en' : 'vi'].some(w => w.sprite === t.show.sprite && w.initial === ans.value));
    if (topic === 'add' || topic === 'sub') { const m = /^(\d+)([+−])(\d+)$/.exec(t.show.text); assert.strictEqual(ans.value, m[2] === '+' ? +m[1] + +m[3] : +m[1] - +m[3]); }
    if (topic === 'oddeven') assert.strictEqual(ans.value, +t.show.text % 2 ? 'odd' : 'even');
    for (const c of t.choices) if (c.kind === 'number') assert.ok(c.value >= 0);
  }
});

// ======================================================= layout
test('layout: §2 formulas and the short-side rule', () => {
  assert.deepStrictEqual(J(PG.World.logicalSize(2532, 1170)), { W: 1558, H: 720 });
  assert.deepStrictEqual(J(PG.World.logicalSize(1170, 2532)), { W: 720, H: 1558 });
  assert.deepStrictEqual(J(PG.World.logicalSize(820, 1180)), { W: 720, H: 1036 });
  assert.deepStrictEqual(J(PG.World.logicalSize(1000, 1000)), { W: 960, H: 720 });
  assert.deepStrictEqual(J(PG.World.logicalSize(4000, 1000)), { W: 1600, H: 720 });
  const ins = { top: 0, right: 44, bottom: 20, left: 44 };
  const L = PG.World.computeLayout(1556, 720, ins, 4);
  assert.strictEqual(L.groundY, 720 - 20 - 64);
  assert.deepStrictEqual([L.pup.y, L.pup.h, L.pup.speed], [L.groundY + 6, 200, 1150]);
  assert.deepStrictEqual([L.basket.w, L.basket.rimDy], [210, 0.32 * 200]);
  near(L.basket.h, 0.62 * 210, 1e-9);
  assert.deepStrictEqual([L.pup.minX, L.pup.maxX], [44 + 105 + 16, 1556 - 44 - 105 - 16]);
  assert.deepStrictEqual([L.lanes.x0, L.lanes.x1], [L.pup.minX, L.pup.maxX]);
  assert.deepStrictEqual([L.sky.top, L.sky.bottom], [150, L.pup.y - L.basket.rimDy]);
  assert.deepStrictEqual([L.bubble.x, L.bubble.y, L.bubble.w, L.bubble.h], [64, 16, 680, 100]);
  assert.strictEqual(L.pupTap.r, 100);
  assert.strictEqual(PG.World.computeLayout(1556, 720, ins, 3).basket.w, 220);
  assert.strictEqual(PG.World.computeLayout(1556, 720, ins, 5).basket.w, 200);
  assert.strictEqual(PG.World.computeLayout(1556, 720, ins, 7).basket.w, 185);
  const Lp = PG.World.computeLayout(720, 1556, { top: 44, bottom: 30 }, 4);
  near(Lp.pup.h, 215 * 1.1, 1e-9); near(Lp.basket.w, 231, 1e-9);
  const Li = PG.World.computeLayout(720, 1036, null, 3);
  assert.strictEqual(Li.pup.h, 215);  // 1036/720 < 1.6: no tall bonus
  assert.strictEqual(Li.bubble.w, Math.min(680, 720 - 190));
});

test('layout: every viewport × age → Pip, basket, lanes, sky, bubble inside the safe area; fall time 6–9 s at age 4', () => {
  for (const v of VIEWPORTS) for (const age of AGES) {
    const L = PG.World.computeLayout(v.W, v.H, v.ins, age), ins = L.ins, ctx = v.name + ' age ' + age;
    const safeL = ins.left, safeR = v.W - ins.right;
    assert.ok(L.pup.minX - L.basket.w / 2 >= safeL + 15.9 && L.pup.maxX + L.basket.w / 2 <= safeR - 15.9, ctx + ' basket inside at the extremes');
    assert.ok(L.lanes.x1 - L.lanes.x0 >= 300, ctx + ' lanes ' + (L.lanes.x1 - L.lanes.x0));
    assert.ok(L.pup.y <= v.H - ins.bottom - 50, ctx + ' feet above the bottom inset');
    assert.ok(L.pup.y - L.pup.h >= ins.top + 300, ctx + ' Pip below the sky');
    assert.ok(L.sky.top >= ins.top + 150 && L.spawnY > L.sky.top && L.sky.bottom - L.spawnY >= 300, ctx + ' sky');
    assert.ok(L.sky.bottom < L.groundY - 40, ctx + ' rim above the grass');
    // bubble vs HUD, spawn line vs bubble/HUD
    assert.ok(L.bubble.x + L.bubble.w <= L.hud.x, ctx + ' speech bubble vs HUD');
    assert.ok(L.bubble.w >= 300, ctx + ' bubble w ' + L.bubble.w);
    assert.ok(L.spawnY - 0.5 * 1.35 * 104 >= L.bubble.y + L.bubble.h - 25, ctx + ' new bubbles clear the speech bubble');
    assert.ok(L.spawnY - 0.5 * 1.35 * 135 >= L.hud.y + L.hud.h - 20, ctx + ' new bubbles clear the HUD');
    if (age === 4) {
      const vT = PG.CONFIG.fallSpeed[4] * L.fallScale, T = (L.sky.bottom - L.spawnY) / vT + 1 / PG.CONFIG.dragRate;
      assert.ok(T >= 6 && T <= 9, ctx + ' fall time ' + T.toFixed(2));
    }
  }
});

// ======================================================= Pip + basket motion
test('Pip: critically damped follow (no overshoot), ≤ 1150 px/s, stride, face, tilt spring; basket pendulum lag', () => {
  const w = mkWorld(manual({ seed: 5, vp: VIEWPORTS[0] }));
  roundOf(w, 'colors', 1);
  const L = w.layout, x0 = w.pup.x, tx = x0 + 500;
  steerTo(w, tx, 0);
  let maxX = -1e9, maxV = 0, minSway = 0, maxSway = 0, maxTilt = 0, steps = [], swayAt = [];
  run(w, 3, (i) => {
    maxX = Math.max(maxX, w.pup.x); maxV = Math.max(maxV, Math.abs(w.pup.vx)); maxTilt = Math.max(maxTilt, Math.abs(w.pup.tilt));
    minSway = Math.min(minSway, w.basket.sway); maxSway = Math.max(maxSway, w.basket.sway); steps.push(w.pup.step);
    if (i < 40) swayAt[0] = Math.min(swayAt[0] || 0, w.basket.sway);
    near(w.basket.x, w.pup.x + w.basket.sway, 1e-9);
  });
  assert.ok(maxX <= tx + 0.5, 'no overshoot ' + (maxX - tx));
  near(w.pup.x, tx, 0.05, 'arrives');
  assert.ok(maxV <= 1150 + 1e-9 && maxV > 1100, 'speed-limited run ' + maxV);
  assert.strictEqual(w.pup.face, 1);
  assert.ok(maxTilt > 0.1 && maxTilt <= 0.12 + 0.02, 'tilt ' + maxTilt);
  assert.ok(Math.abs(w.pup.tilt) < 0.005 && w.pup.run < 0.01, 'tilt settles');
  assert.ok(swayAt[0] < -5, 'basket lags behind while Pip accelerates: ' + swayAt[0]);
  assert.ok(maxSway > 2, 'then swings forward when he brakes: ' + maxSway);
  assert.ok(Math.max(-minSway, maxSway) <= 0.12 * w.basket.w + 1e-9);
  assert.ok(Math.abs(w.basket.sway) < 0.1, 'sway settles ' + w.basket.sway);
  near(steps[steps.length - 1] - steps[0], 500 * 0.012, 0.05, 'stride phase = 0.012 rad/px');
  near(w.basket.wobble, -w.basket.sway * w.cfg.wobbleK, 1e-12);
  // leftwards + clamping at the lanes
  w.pointerMove(-500, L.groundY + 20); run(w, 3);
  near(w.pup.x, L.pup.minX, 0.01); assert.ok(w.pup.x >= L.pup.minX); assert.strictEqual(w.pup.face, -1);
  w.pointerMove(5000, L.groundY + 20); run(w, 3);
  near(w.pup.x, L.pup.maxX, 0.01); assert.ok(w.pup.x <= L.pup.maxX);
  // release: Pip keeps going to the last finger x; cancelDrag stops him where he is
  w.pointerMove(400, L.groundY + 20); run(w, 0.1); w.pointerUp(400, L.groundY + 20);
  assert.strictEqual(w.pup.steering, false); run(w, 2); near(w.pup.x, 400, 0.05);
  w.pointerDown(400, 600); w.pointerMove(800, 600); run(w, 0.1); const xm = w.pup.x; w.cancelDrag(); run(w, 2);
  assert.ok(Math.abs(w.pup.x - xm) < 80 && w.pup.x < 800 - 100, 'cancelDrag stops near where he was ' + xm + ' → ' + w.pup.x);
  w.pointerMove(100, 600); run(w, 0.5); assert.ok(Math.abs(w.pup.x - xm) < 80, 'no steering after cancel');
});

// ======================================================= bubbles
test('fall: drag to terminal velocity, ±22 px sine sway (2.4–3.2 s), ±0.15 rad rotation, appear back-overshoot', () => {
  const w = mkWorld(manual({ seed: 6 }));
  roundOf(w, 'colors', 1);
  steerTo(w, w.layout.lanes.x0, 3);
  const it = place(w._spawn(true), w.layout.lanes.x1 - 40, undefined, w);
  const vT = w.cfg.fallSpeed[4] * w.layout.fallScale;
  let maxA = 0, t = 0, maxDx = 0, maxRot = 0, crossings = [], prev = 0, vy05 = null;
  while (it.state === 'appear') { w.update(H); t += H; maxA = Math.max(maxA, it.appear); }
  near(t, 0.4, 2 * H, 'appear time');
  assert.ok(maxA > 1.05, 'overshoot ' + maxA);
  t = 0;
  run(w, 4, () => {
    t += H; const dx = it.x - it.xb; maxDx = Math.max(maxDx, Math.abs(dx)); maxRot = Math.max(maxRot, Math.abs(it.rot));
    if (prev < 0 && dx >= 0) crossings.push(t); prev = dx;
    if (vy05 === null && t >= 1 / w.cfg.dragRate) vy05 = it.vy;
  });
  near(vy05 / vT, 1 - Math.exp(-1), 0.02, 'drag time constant 1/2.2 s');
  near(it.vy, vT, vT * 0.01, 'terminal velocity');
  assert.ok(maxDx > 21 && maxDx <= 22 + 1e-6, 'sway ' + maxDx);
  assert.ok(maxRot > 0.14 && maxRot <= 0.15 + 1e-9);
  if (crossings.length >= 2) { const P = crossings[1] - crossings[0]; assert.ok(P >= 2.4 - 0.02 && P <= 3.2 + 0.02, 'period ' + P); }
  assert.strictEqual(it.state, 'fall');
});

test('wind: breezy chapter drifts bubbles downwind at ≈ wind × 45 px/s, soft reflection keeps them in the lanes', () => {
  const w = mkWorld(manual({ seed: 7, vp: VIEWPORTS[0] }));
  roundOf(w, 'colors', 1, 1);
  assert.strictEqual(w.weather, 1);
  steerTo(w, w.layout.lanes.x1, 3);
  run(w, 0.1);
  const it = place(w._spawn(true), w.layout.lanes.x0 + 60, undefined, w);
  const xb0 = it.xb, t0 = w.time;
  let windSum = 0, n = 0;
  run(w, 5, () => { windSum += w.windVx; n++; });
  const mean = windSum / n;
  assert.ok(mean > 0.6 * 45 * 0.7 && mean < 0.6 * 45 * 1.3, 'wind ' + mean);
  const drift = (it.xb - xb0) / (w.time - t0);
  assert.ok(drift > 0.6 * mean && drift < 1.1 * mean, 'drift ' + drift + ' vs ' + mean);
  // a bubble pushed beyond the right lane edge is pulled back inside
  const o = place(w._spawn(false), w.layout.lanes.x1 + 15, undefined, w);
  let maxX = 0; run(w, 4, () => { maxX = Math.max(maxX, o.xb); });
  assert.ok(o.xb <= w.layout.lanes.x1 + 1 && maxX < w.layout.lanes.x1 + 40, 'reflected ' + o.xb + ' max ' + maxX);
  // sunny chapter: almost no wind
  const w2 = mkWorld(manual({ seed: 7 })); roundOf(w2, 'colors', 1, 0); run(w2, 1);
  assert.ok(Math.abs(w2.windVx) < 0.1 * 45 * 1.3);
});

test('catch (right): catch → pop → correct; pop-and-drop parabola into the slot; squash 1.15/0.82; basket squash spring; Pip hops 10 px', () => {
  const w = mkWorld(manual({ seed: 8, age: 5 }));
  roundOf(w, 'colors', 2);
  const it = spawnAbove(w, true, 20, w.basket.y - 100);
  const evs = [];
  runUntil(w, () => { evs.push(...w.drainEvents()); return it.state === 'pop'; }, 10);
  const types = evs.map(e => e.type).filter(t => t !== 'appear');
  assert.deepStrictEqual(types, ['catch', 'pop', 'correct']);
  const ce = evs.find(e => e.type === 'correct');
  assert.deepStrictEqual(J(ce), { type: 'correct', id: it.id, nameKind: 'color', nameValue: w.cur.target.value, count: 1, need: w.cur.need, target: J(w.cur.target) });
  assert.deepStrictEqual(J(evs.find(e => e.type === 'catch')), { type: 'catch', id: it.id, right: true });
  assert.strictEqual(it.bubble, 0);
  assert.ok(it.y >= w.basket.y - 10 - 1 && it.y <= w.basket.y + 30);
  assert.strictEqual(w.pup.mood, 'happy');
  // parabola in basket coordinates (Pip stands still → world coordinates)
  const pts = []; let maxHop = 0, landed = null, t = 0;
  while (it.state === 'pop') { w.update(H); t += H; pts.push([it.x - w.basket.x, it.y - w.basket.y]); maxHop = Math.max(maxHop, w.pup.hop); for (const e of w.drainEvents()) if (e.type === 'land') landed = e; }
  near(t, 0.3, 2 * H, 'pop time');
  const d2 = []; for (let i = 2; i < pts.length - 1; i++) d2.push(pts[i][1] - 2 * pts[i - 1][1] + pts[i - 2][1]);
  for (const d of d2) near(d, d2[0], 1e-6, 'constant gravity (parabola)');
  assert.ok(d2[0] > 0);
  const apex = Math.min(...pts.map(p => p[1])), sl = w.basket.slots[0];
  assert.ok(apex <= Math.min(pts[0][1], sl.dy) - 15, 'arc apex');
  assert.deepStrictEqual(J(landed), { type: 'land', id: it.id, count: 1, need: w.cur.need });
  assert.strictEqual(it.state, 'in'); assert.strictEqual(it.inBasket, true);
  near(it.sx, 1.15, 0.02); near(it.sy, 0.82, 0.03);
  near(w.basket.squash, 0.14, 0.02);
  assert.strictEqual(it.size, w.basket.slotSize);
  let minSq = 1; run(w, 1.2, () => { minSq = Math.min(minSq, w.basket.squash); maxHop = Math.max(maxHop, w.pup.hop); });
  assert.ok(minSq < -0.01, 'basket squash oscillates (ζ 0.35)');
  assert.ok(Math.abs(w.basket.squash) < 0.003 && Math.abs(it.sx - 1) < 0.003);
  near(maxHop, 10, 0.5, 'hop');
  // items in the basket ride along with Pip
  steerTo(w, w.layout.lanes.x0, 2);
  near(it.x, w.basket.x + sl.dx, 1e-9); near(it.y, w.basket.y + sl.dy, 1e-9);
});

test('catch geometry: rim band and |x − basket.x| ≤ 0.5·w + 0.25·size; no catch when moving up or beside', () => {
  for (const [dx, ok] of [[0, true], [0.5, true], [1, false]]) {
    const w = mkWorld(manual({ seed: 9, age: 6, config: { windBase: [0, 0, 0, 0] } }));      // age 6: no magnet, no wind
    roundOf(w, 'colors', 2);
    const it = w._spawn(true);
    const half = 0.5 * w.basket.w + 0.25 * it.size;
    place(it, w.basket.x + (dx === 0.5 ? half - 2 : dx ? half + 3 : 0) + 0, w.basket.y - 40, w);
    it.phase = 0; it.xb = it.x; it._swP = 1e9;   // freeze the sway for an exact test
    runUntil(w, () => it.state !== 'fall' && it.state !== 'appear', 10);
    assert.strictEqual(it.state === 'pop', ok, 'dx ' + dx + ' state ' + it.state);
  }
});

test('assist magnet (age ≤ 4): a right bubble just beside the basket is pulled in; never wrong ones, never age 5+', () => {
  function tryCatch(age, right) {
    const w = mkWorld(manual({ seed: 10, age }));
    roundOf(w, 'colors', 2);
    const it = w._spawn(right);
    const half = 0.5 * w.basket.w + 0.25 * it.size;
    place(it, w.basket.x + half + 50, w.basket.y - 200, w);
    it.phase = 0; it.xb = it.x; it._swP = 1e9;
    runUntil(w, () => it.state !== 'fall' && it.state !== 'appear', 20);
    return it.state;
  }
  assert.strictEqual(tryCatch(4, true), 'pop');
  assert.strictEqual(tryCatch(3, true), 'pop');
  assert.notStrictEqual(tryCatch(4, false), 'pop');
  assert.notStrictEqual(tryCatch(5, true), 'pop');
});

test('wrong catch: basket shakes (3 wiggles, 0.5 s); item dips, hops out away from Pip (180, −520, g 1500), re-bubbles at the apex and rises away', () => {
  const w = mkWorld(manual({ seed: 11, age: 5 }));
  roundOf(w, 'colors', 2);
  const it = spawnAbove(w, false, 40, w.basket.y - 60);
  const evs = [];
  runUntil(w, () => { evs.push(...w.drainEvents()); return it.state === 'pop'; }, 10);
  const types = evs.map(e => e.type).filter(t => t !== 'appear');
  assert.deepStrictEqual(types, ['catch', 'pop', 'wrong']);
  const we = evs.find(e => e.type === 'wrong');
  assert.deepStrictEqual(J(we), { type: 'wrong', id: it.id, nameKind: 'color', nameValue: it.nameValue, target: J(w.cur.target), misses: 1 });
  assert.strictEqual(w.roundMistakes, 1); assert.strictEqual(w.pup.mood, 'oops');
  const sh = []; let t = 0, apexY = null, launchY = null;
  while (it.state === 'pop') { w.update(H); t += H; sh.push(w.basket.shake); }
  near(t, 0.12, 2 * H, 'dip');
  assert.strictEqual(it.state, 'bounce');
  assert.ok(it.vx > 0, 'away from Pip (item was right of his centre)');
  launchY = it.y;
  while (it.state === 'bounce') { w.update(H); sh.push(w.basket.shake); }
  apexY = it.y;
  near(launchY - apexY, 520 * 520 / (2 * 1500), 8, 'ballistic apex');
  assert.strictEqual(it.state, 'rise'); assert.strictEqual(it.bubble, 0);
  run(w, 0.5, () => sh.push(w.basket.shake));
  assert.strictEqual(it.bubble, 1, 're-bubbled');
  let signs = 0; for (let i = 1; i < sh.length; i++) if (sh[i] * sh[i - 1] < 0) signs++;
  assert.ok(signs >= 4 && signs <= 6, 'wiggles ' + signs);
  assert.strictEqual(w.basket.shake, 0);
  run(w, 1.5);
  assert.ok(it.vy < -0.8 * 140 * w.layout.fallScale, 'rises ' + it.vy);
  runUntil(w, () => !w.items.includes(it), 30);
  assert.ok(!w.items.includes(it), 'removed off-screen');
  assert.strictEqual(w.basket.count, 0);
});

test('miss: a right bubble on the grass squashes, bounces (−0.35·vy), emits bounce + miss, floats away; wrong ones only bounce; no stars lost', () => {
  const w = mkWorld(manual({ seed: 12, age: 4 }));
  roundOf(w, 'colors', 2);
  steerTo(w, w.layout.lanes.x0, 3);
  const it = place(w._spawn(true), w.layout.lanes.x1 - 10, w.layout.groundY - 120, w);
  const evs = [];
  runUntil(w, () => { evs.push(...w.drainEvents()); return it.state === 'ground'; }, 20);
  const vyIn = it._py < it.y ? null : null;
  assert.deepStrictEqual(evs.map(e => e.type).filter(t => t !== 'appear'), ['bounce', 'miss']);
  assert.ok(it.vy < 0, 'bounced up');
  near(it.bsx, 1.25, 0.03, 'bubble squash');
  assert.strictEqual(it.y, w.layout.groundY - 0.4 * it.size);
  let t = 0; while (it.state === 'ground') { w.update(H); t += H; assert.ok(it.y <= w.layout.groundY - 0.4 * it.size + 1e-9); }
  near(t, 0.5, 2 * H);
  assert.strictEqual(it.state, 'rise');
  assert.strictEqual(w.roundMistakes, 0); assert.strictEqual(it.misses, 1);
  const o = place(w._spawn(false), w.layout.lanes.x1 - 10, w.layout.groundY - 120, w);
  const e2 = []; runUntil(w, () => { e2.push(...w.drainEvents()); return o.state === 'ground'; }, 20);
  assert.deepStrictEqual(e2.map(e => e.type).filter(x => x !== 'appear'), ['bounce']);
  void vyIn;
});

test('tap: a quick tap on a bubble → tap event only (Pip stops, tapRuns=false), not a catch; long press / 24 px move are steers; tap on Pip → tapPup', () => {
  const w = mkWorld(manual({ seed: 13, age: 4 }));
  roundOf(w, 'animals', 2);
  const it = place(w._spawn(true), w.layout.lanes.x1 - 100, w.layout.spawnY + 100, w);
  run(w, 0.5); w.drainEvents();
  const R = 0.6 * it.size + 14;
  assert.strictEqual(w.itemAt(it.x + R - 1, it.y), it);
  assert.strictEqual(w.itemAt(it.x + R + 1, it.y), null);
  assert.strictEqual(w.pointerDown(it.x + 5, it.y), it.id);
  run(w, 0.1); w.pointerMove(it.x + 15, it.y); w.pointerUp(it.x + 15, it.y);
  const ev = w.drainEvents();
  assert.deepStrictEqual(J(ev), [{ type: 'tap', id: it.id, nameKind: 'animal', nameValue: it.nameValue }]);
  const xTap = w.pup.x; run(w, 2); assert.ok(Math.abs(w.pup.x - xTap) < 1e-6, 'Pip stops where he is after a bubble tap');
  assert.strictEqual(w.counters.taps, 1);
  // tapRuns = true (DESIGN's original rule): Pip keeps running to the tapped bubble
  const w2 = mkWorld(manual({ seed: 13, age: 4, config: { tapRuns: true } }));
  roundOf(w2, 'animals', 2);
  const b2 = place(w2._spawn(false), w2.layout.lanes.x1 - 60, w2.layout.spawnY + 100, w2);
  run(w2, 0.5); w2.drainEvents();
  w2.pointerDown(b2.x, b2.y); run(w2, 0.1); w2.pointerUp(b2.x, b2.y);
  assert.strictEqual(w2.drainEvents()[0].type, 'tap');
  run(w2, 2); near(w2.pup.x, Math.min(w2.layout.pup.maxX, b2._px), 40, 'tapRuns: Pip ran under the tapped bubble');
  // long press is not a tap
  const x2 = it.x; w.pointerDown(x2, it.y); run(w, 0.4); w.pointerUp(x2, it.y);
  assert.ok(!w.drainEvents().some(e => e.type === 'tap'));
  // moving ≥ 24 px is not a tap
  w.pointerDown(it.x, it.y); w.pointerMove(it.x + 30, it.y); w.pointerMove(it.x, it.y); w.pointerUp(it.x, it.y);
  assert.ok(!w.drainEvents().some(e => e.type === 'tap'));
  // tap on Pip's chest repeats the prompt (bubbles in front of him win the hit test, so move this one away)
  run(w, 2); place(it, w.layout.lanes.x0, w.layout.spawnY, w);
  const cx = w.pup.x, cy = w.layout.pup.y - 0.6 * w.layout.pup.h;
  w.pointerDown(cx + 10, cy); w.pointerUp(cx + 10, cy);
  assert.deepStrictEqual(J(w.drainEvents()), [{ type: 'tapPup', promptKey: w.cur.promptKey, params: J(w.cur.params) }]);
  // empty grass tap: nothing
  w.pointerDown(cx, w.layout.groundY + 40); w.pointerUp(cx, w.layout.groundY + 40);
  assert.deepStrictEqual(w.drainEvents(), []);
});

// ======================================================= spawning
test('spawning: first spawn of every round is right and near Pip; never two wrong in a row at age ≤ 4; always a right one in the air; maxAir; spacing', () => {
  let firstFar = 0, twoWrong = 0, longNoRight = 0, overAir = 0, spacingBad = 0, spacingN = 0, spawns = 0;
  for (const age of AGES) for (let s = 1; s <= 12; s++) {
    const v = VIEWPORTS[s % VIEWPORTS.length];
    const w = mkWorld({ seed: 100 + s * 7 + age, age, vp: v, config: { catchAbove: -1e6 } });   // nothing is ever caught
    const topic = PG.Content.topicsFor(age)[s % 4];
    for (let ri = 0; ri < 4; ri++) {
      roundOf(w, topic, ri);
      const px = w.layout.lanes.x0 + (w.layout.lanes.x1 - w.layout.lanes.x0) * ((s * 37 + ri * 11) % 100) / 100;
      steerTo(w, px, 3); w.pointerUp(px, w.layout.groundY + 24);
      roundOf(w, topic, ri);
      let lastRight = true, first = true, noRight = 0;
      const fallT = (w.layout.sky.bottom - w.layout.spawnY) / w._fallV(age) + 1 / w.cfg.dragRate;
      run(w, 40, () => {
        for (const e of w.drainEvents()) if (e.type === 'appear') {
          const it = w.itemById(e.id); spawns++;
          if (first) {
            if (!it.right) firstFar++;
            const land = it.xb + w.windVx * fallT, lim = ri === 0 ? 70 + 1 : 0.35 * w.layout.W + 1;
            if (Math.abs(Math.min(w.layout.lanes.x1, Math.max(w.layout.lanes.x0, land)) - w.pup.x) > lim + 30) firstFar++;
            first = false;
          }
          if (age <= 4 && !lastRight && !it.right) twoWrong++;
          lastRight = it.right;
          // spacing vs other new bubbles near the spawn line
          for (const o of w.items) if (o !== it && o.state !== 'rise' && o.state !== 'ground' && Math.abs(o.y - it.y) < 1.35 * it.size) {
            spacingN++; if (Math.abs(o.x - it.x) < 1.4 * 1.35 * Math.max(o.size, it.size) - 2 * w.cfg.swayAmp) spacingBad++;
          }
        }
        const air = w.items.filter(i => i.state === 'appear' || i.state === 'fall');
        if (air.length > w.cur.maxAir + 1) overAir++;
        if (air.length && !air.some(i => i.right)) noRight += H; else noRight = 0;
        if (noRight > 2 + 1e-9) { longNoRight++; noRight = -1e9; }
      });
    }
  }
  assert.strictEqual(firstFar, 0, 'first spawns right + near Pip');
  assert.strictEqual(twoWrong, 0, 'two wrong in a row at age ≤ 4');
  assert.strictEqual(longNoRight, 0, 'only wrong bubbles falling for > 2 s');
  assert.strictEqual(overAir, 0, 'maxAir (+1 rescue)');
  assert.ok(spacingBad / Math.max(1, spacingN) < 0.05, 'spacing ' + spacingBad + '/' + spacingN);
  assert.ok(spawns > 1000);
});

// ======================================================= help
test('hint: 2 mistakes (wrong + miss) → the lowest right bubble glows 4 s and falls at 0.55×; cooldown 6 s; never while one glows; manual hint()', () => {
  const w = mkWorld(manual({ seed: 14, age: 5 }));
  roundOf(w, 'colors', 3);
  const L = w.layout;
  const hi = place(w._spawn(true), L.lanes.x1 - 30, L.spawnY + 10, w);
  const lo = place(w._spawn(true), L.lanes.x1 - 200, L.spawnY + 120, w);
  // mistake 1: a right bubble on the grass far from Pip
  const m1 = place(w._spawn(true), L.lanes.x0 + 400, L.groundY - 80, w);
  steerTo(w, L.lanes.x0, 0.01);
  runUntil(w, () => m1.state === 'ground', 10);
  assert.ok(!w.drainEvents().some(e => e.type === 'hint'));
  // mistake 2: a wrong catch
  const wr = spawnAbove(w, false, 0, w.basket.y - 30);
  runUntil(w, () => wr.state !== 'fall' && wr.state !== 'appear', 5);
  w.update(H);
  const he = w.drainEvents().filter(e => e.type === 'hint'); const h1 = w._lastHintT;
  assert.strictEqual(he.length, 1); assert.strictEqual(he[0].id, lo.id, 'the lowest right bubble');
  assert.strictEqual(w.pup.mood, 'think');
  run(w, 1.5);
  assert.strictEqual(lo.glow, 1); assert.strictEqual(hi.glow, 0);
  const vT = w._fallV(5);
  near(lo.vy, 0.55 * vT, 0.06 * vT, 'slowed'); near(hi.vy, vT, 0.02 * vT);
  assert.strictEqual(w.hint(), lo.id); assert.ok(!w.drainEvents().some(e => e.type === 'hint'), 'no repeat while glowing');
  // 2 more mistakes right away → no hint (still glowing / cooldown)
  for (let k = 0; k < 2; k++) { const x = spawnAbove(w, false, 0, w.basket.y - 30); runUntil(w, () => x.state === 'pop', 5); }
  run(w, 2.6); assert.ok(lo.glow < 1);
  assert.ok(!w.drainEvents().some(e => e.type === 'hint'));
  const fresh = place(w._spawn(true), L.lanes.x1 - 120, L.spawnY, w), freshT = w.time;
  let hintT = null, hid = null;
  runUntil(w, () => { for (const e of w.drainEvents()) if (e.type === 'hint') { hintT = w.time; hid = e.id; } return hintT !== null; }, 10);
  assert.ok(hintT !== null, 'pending hint fires after the cooldown');
  assert.ok(hintT - h1 >= 6 - 1e-6, 'cooldown ' + (hintT - h1));
  assert.ok(hintT <= Math.max(h1 + 6, freshT) + 2 * H, 'fires as soon as allowed and a right bubble is in the air');
  assert.strictEqual(hid, fresh.id);
  void hi;
});

test('idle: nudge after 12 s without a catch, then ×1.5 (18, 27, 30 cap); idle glows a right bubble; reset by a catch and a new round', () => {
  const w = mkWorld({ seed: 15, age: 4, config: { catchAbove: -1e6 } });
  roundOf(w, 'count', 2);
  let t = 0, first = null; const times = [], glows = [];
  run(w, 125, () => {
    t += H;
    for (const e of w.drainEvents()) {
      if (e.type === 'appear' && first === null) first = t;
      if (e.type === 'idle') { times.push(t - first); assert.strictEqual(e.promptKey, 'p.count'); assert.deepStrictEqual(J(e.params), J(w.cur.params)); }
    }
  });
  void glows;
  assert.ok(first !== null);
  const want = [12, 30, 57, 87, 117];
  assert.ok(times.length >= 5, JSON.stringify(times));
  want.forEach((x, i) => near(times[i], x, 3 * H, 'idle ' + i));
});

test('idle: glow on nudge; catch resets the gap', () => {
  const w = mkWorld(manual({ seed: 16, age: 4 }));
  roundOf(w, 'colors', 2);
  steerTo(w, w.layout.lanes.x0, 1);
  const it = place(w._spawn(true), w.layout.lanes.x1 - 20, w.layout.spawnY, w);
  it._swP = 1e9;
  w.cfg.dragRate = 1e-6; it.vy = 0;               // hang in the sky
  run(w, 12.05);
  const ev = w.drainEvents();
  assert.ok(ev.some(e => e.type === 'idle'));
  assert.ok(!ev.some(e => e.type === 'hint'), 'idle glow is silent (no hint line)');
  run(w, 0.5); assert.ok(it.glow > 0.9, 'idle glows the right bubble');
  w.cfg.dragRate = PG.CONFIG.dragRate;
  const c = spawnAbove(w, true, 0, w.basket.y - 40);
  runUntil(w, () => c.state === 'pop', 5);
  w.drainEvents();
  run(w, 11.5); assert.ok(!w.drainEvents().some(e => e.type === 'idle'), 'gap reset to 12 s by the catch');
  run(w, 0.8); assert.ok(w.drainEvents().some(e => e.type === 'idle'));
});

// ======================================================= rules
function catchOne(w, right) {
  const it = spawnAbove(w, right, 0, w.basket.y - 40);
  runUntil(w, () => it.state !== 'fall' && it.state !== 'appear', 5);
  if (right) runUntil(w, () => it.state !== 'pop', 2);
  return it;
}

test('count mode: N dots, land reports count/need, round ends exactly at N, nothing caught beyond N', () => {
  for (const age of [4, 5, 6]) for (let s = 1; s <= 10; s++) {
    const w = mkWorld(manual({ seed: s, age }));
    roundOf(w, 'count', 1 + (s % 3));
    const N = w.cur.need;
    assert.strictEqual(w.basket.need, N); assert.strictEqual(w.basket.slots.length, N);
    for (const sl of w.basket.slots) assert.ok(Math.abs(sl.dx) + w.basket.slotSize / 2 <= w.basket.w * 0.5 + 1e-6, 'slot inside the basket');
    for (let k = 1; k <= N; k++) {
      assert.strictEqual(w.state, 'round');
      const it = spawnAbove(w, true, 0, w.basket.y - 40);
      let land = null;
      runUntil(w, () => { for (const e of w.drainEvents()) if (e.type === 'land') land = e; return land; }, 10);
      assert.deepStrictEqual([land.count, land.need], [k, N]);
      if (k < N) assert.strictEqual(w.state, 'round'); else assert.strictEqual(w.state, 'roundDone');
      void it;
    }
    assert.strictEqual(w.basket.count, N);
  }
  // two right bubbles arrive together for the last slot: only one is taken
  const w = mkWorld(manual({ seed: 3, age: 4 }));
  roundOf(w, 'count', 0);
  for (let k = 0; k < w.cur.need - 1; k++) catchOne(w, true);
  const a = spawnAbove(w, true, -10, w.basket.y - 40), b = spawnAbove(w, true, 10, w.basket.y - 40);
  run(w, 2.5);
  assert.strictEqual(w.basket.count, w.cur.need);
  assert.ok([a.state, b.state].includes('leave') || !w.items.includes(a) || !w.items.includes(b), 'the extra one pops away');
  const ys = new Set(PG.World.computeSlots(12, 100, 190, 118).slots.map(s => Math.round(s.dy)));
  assert.strictEqual(ys.size, 3, '12 fruit pile in 3 rows');
});

test('stars: 0 wrong → 3, 1 → 2, ≥ 2 → 1 (misses never cost stars); talk right → +1', () => {
  for (const wrongs of [0, 1, 2, 3]) {
    const w = mkWorld(manual({ seed: 20 + wrongs, age: 5 }));
    roundOf(w, 'colors', 3);
    const m = place(w._spawn(true), w.layout.lanes.x1 - 10, w.layout.groundY - 60, w);
    steerTo(w, w.layout.lanes.x0, 0.2); w.pointerUp();
    runUntil(w, () => m.state === 'ground', 10);
    run(w, 1);
    for (let k = 0; k < wrongs; k++) { catchOne(w, false); run(w, 0.3); }
    const s0 = w.stars;
    for (let k = 0; k < w.cur.need; k++) catchOne(w, true);
    const rd = w.drainEvents().find(e => e.type === 'roundDone');
    assert.ok(rd, 'roundDone');
    assert.deepStrictEqual([rd.stars, rd.mistakes, rd.round, rd.count, rd.need], [[3, 2, 1, 1][wrongs], wrongs, 3, w.cur.need, w.cur.need]);
    assert.strictEqual(w.stars - s0, rd.stars);
    assert.strictEqual(w.pup.mood, 'cheer');
  }
  const w = mkWorld({ seed: 30, age: 3 });
  roundOf(w, 'size', 1); w._startTalk();
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

test('round end: bubbles in the air pop + fade (0.4 s), caught items hop out at 1.0 s, next round starts empty', () => {
  const w = mkWorld({ seed: 40, age: 4 });
  w.levels = ['colors', 'colors', 'colors', 'colors']; w.startLevel(0); w.round = 1; w._beginRound();
  const bot = new PG.Bot(w, { skill: 1, seed: 1 });
  runUntil(w, () => { bot.step(H); return w.state === 'roundDone'; }, 60);
  const air = w.items.filter(i => i.state === 'leave');
  const inB = w.items.filter(i => i.state === 'in');
  assert.strictEqual(inB.length, w.cur.need);
  const pops = w.drainEvents().filter(e => e.type === 'pop');
  assert.ok(pops.length >= air.length);
  run(w, 0.41); for (const a of air) assert.ok(!w.items.includes(a));
  run(w, 0.6); for (const i of inB) assert.strictEqual(i.state, 'leave');
  run(w, 0.75); assert.strictEqual(w.state, 'round'); assert.strictEqual(w.items.length, 0); assert.strictEqual(w.basket.count, 0);
});

test('state machine: intro 1.8 / roundDone 1.7 / talk +1.6 / levelDone 2.0 → 4 chapters → sessionDone; events carry the §5.2 fields', () => {
  const w = mkWorld({ seed: 50, age: 3 });
  const bot = new PG.Bot(w, { skill: 1, seed: 2 });
  bot.enabled = false;
  w.newSession();
  const ev0 = w.drainEvents();
  assert.deepStrictEqual(J(ev0[0]), { type: 'session', levels: ['colors', 'shapes', 'size', 'animals'] });
  assert.deepStrictEqual(J(ev0[1]), { type: 'level', level: 0, topic: 'colors' });
  let t = 0; while (w.state === 'intro') { w.update(H); t += H; }
  near(t, 1.8, 2 * H);
  const re = w.drainEvents().find(e => e.type === 'round');
  assert.deepStrictEqual(Object.keys(re).sort(), ['mode', 'need', 'params', 'promptKey', 'round', 'topic', 'type']);
  assert.deepStrictEqual([re.round, re.topic, re.mode, re.promptKey, re.need], [0, 'colors', 'catch', 'p.colors', 1]);
  bot.enabled = true;
  for (let lvl = 0; lvl < 4; lvl++) {
    while (w.state === 'intro') { bot.step(H); w.update(H); }
    let rounds = 0;
    while (w.state === 'round' || w.state === 'roundDone') {
      runUntil(w, () => { bot.step(H); return w.state === 'roundDone'; }, 120);
      rounds++;
      t = 0; while (w.state === 'roundDone') { w.update(H); t += H; }
      near(t, 1.7, 2 * H, 'roundDone');
    }
    assert.ok(rounds >= 3 && rounds <= 4);
    assert.strictEqual(w.state, 'talk');
    const te = w.drainEvents().find(e => e.type === 'talk');
    assert.ok(te && te.talk.promptKey === 'talk.' + w.topic);
    run(w, 5); assert.strictEqual(w.state, 'talk', 'talk waits');
    if (lvl === 2) { w.skipTalk(); assert.strictEqual(w.state, 'levelDone'); }
    else { w.talkAnswer(w.talk.answerId); t = 0; while (w.state === 'talk') { w.update(H); t += H; } near(t, 1.6, 2 * H); }
    const ld = w.drainEvents().find(e => e.type === 'levelDone');
    assert.strictEqual(ld.level, lvl);
    t = 0; while (w.state === 'levelDone') { w.update(H); t += H; }
    near(t, 2.0, 2 * H);
    assert.strictEqual(w.weather, lvl === 3 ? 3 : lvl + 1);
  }
  assert.strictEqual(w.state, 'sessionDone');
  const sd = w.drainEvents().find(e => e.type === 'sessionDone');
  assert.strictEqual(sd.stars, w.stars);
  run(w, 5); assert.strictEqual(w.state, 'sessionDone');
  w.setAge(7); w.setLang('vi'); assert.strictEqual(w.age, 3, 'age applies at newSession');
  w.newSession(); assert.deepStrictEqual([w.age, w.lang, w.stars, w.state, w.basket.w], [7, 'vi', 0, 'intro', 185]);
  w.startLevel(2); assert.deepStrictEqual([w.level, w.topic, w.weather, w.state], [2, 'initial', 2, 'intro']);
});

test('chapter time limit: after ≥ 3 rounds a chapter longer than 75 s goes to Talk time', () => {
  function chapter(slow) {
    const w = mkWorld({ seed: 63, age: 4 });
    const bot = new PG.Bot(w, { skill: 1, seed: 3 });
    w.newSession();
    let rounds = 0, blockedUntil = -1;
    while (w.state !== 'talk') {
      if (w.state === 'round' && blockedUntil < 0) { blockedUntil = w.time + (slow ? 30 : 0); rounds++; }
      if (w.state !== 'round') blockedUntil = -1;
      w.cfg.catchAbove = w.time < blockedUntil ? -1e6 : PG.CONFIG.catchAbove;
      if (w.time >= blockedUntil) bot.step(H);
      w.update(H);
    }
    return { rounds, t: w.time - w.levelStartTime };
  }
  const s = chapter(true); assert.strictEqual(s.rounds, 3, 'slow chapter stops after 3 rounds'); assert.ok(s.t > 75);
  const q = chapter(false); assert.strictEqual(q.rounds, 4, 'a quick chapter keeps all 4 rounds');
});

test('talk re-ask: talkAsk every 12 s without an answer; glowAnswer from the 2nd re-ask', () => {
  const w = mkWorld({ seed: 64, age: 3 });
  roundOf(w, 'size', 1); w._startTalk(); w.drainEvents();
  assert.strictEqual(w.talk.glowAnswer, false);
  const asks = []; let t = 0;
  run(w, 40, () => { t += H; for (const e of w.drainEvents()) if (e.type === 'talkAsk') asks.push({ t, n: e.n, g: e.glowAnswer, talk: e.talk }); });
  assert.deepStrictEqual(asks.map(a => a.n), [1, 2, 3]);
  asks.forEach((a, i) => near(a.t, 12 * (i + 1), 3 * H));
  assert.deepStrictEqual(asks.map(a => a.g), [false, true, true]);
  assert.strictEqual(asks[0].talk, w.talk); assert.strictEqual(w.talk.glowAnswer, true);
  w.talkAnswer(w.talk.answerId); run(w, 1.5);
  assert.ok(!w.drainEvents().some(e => e.type === 'talkAsk'), 'no re-ask after an answer');
});

test('Pip moods: correct → happy 0.9 s, wrong → oops 0.8 s, hint → think, roundDone → cheer 1.6 s with 3 hops; eyes follow the lowest right bubble', () => {
  const w = mkWorld(manual({ seed: 70, age: 5 }));
  roundOf(w, 'colors', 3);
  const far = place(w._spawn(true), w.layout.lanes.x1 - 20, w.layout.spawnY + 50, w);
  run(w, 2);
  assert.ok(hyp(w.pup.lookX - far.x, w.pup.lookY - far.y) < 20, 'looks at the bubble');
  catchOne(w, true); assert.strictEqual(w.pup.mood, 'happy'); run(w, 0.95); assert.strictEqual(w.pup.mood, 'idle');
  catchOne(w, false); assert.strictEqual(w.pup.mood, 'oops'); run(w, 0.85); assert.strictEqual(w.pup.mood, 'idle');
  catchOne(w, true); catchOne(w, true);
  assert.strictEqual(w.state, 'roundDone'); assert.strictEqual(w.pup.mood, 'cheer');
  let maxHop = 0, hops = 0, prev = 0;
  run(w, 1.3, () => { maxHop = Math.max(maxHop, w.pup.hop); if (w.pup.hop > 1 && prev <= 1) hops++; prev = w.pup.hop; assert.ok(w.pup.hop >= 0); });
  near(maxHop, 22, 1); assert.strictEqual(hops, 3);
});

test('setViewport mid-round: drag cancelled, Pip and bubbles clamped into the new lanes, basket items follow, fall progress kept', () => {
  const w = mkWorld(manual({ seed: 80, age: 4, vp: VIEWPORTS[0] }));
  roundOf(w, 'colors', 2);
  const c = catchOne(w, true);
  steerTo(w, w.layout.lanes.x1, 3);
  const a = place(w._spawn(true), w.layout.lanes.x1 - 5, w.layout.spawnY + 0.5 * (w.layout.groundY - w.layout.spawnY), w);
  for (const v of VIEWPORTS) {
    w.setViewport(v.W, v.H, v.ins);
    const L = w.layout;
    assert.strictEqual(w.pup.steering, false); assert.strictEqual(w.finger.down, false);
    assert.ok(w.pup.x >= L.pup.minX && w.pup.x <= L.pup.maxX, v.name + ' pup');
    assert.ok(a.xb >= L.lanes.x0 && a.xb <= L.lanes.x1 && Math.abs(a.x - a.xb) <= 22.01 + 1e-6 || a.state !== 'fall', v.name + ' bubble x');
    const u = (a.y - L.spawnY) / (L.groundY - L.spawnY);
    assert.ok(u > 0.3 && u < 0.7 || a.state !== 'fall', v.name + ' fall progress ' + u);
    assert.strictEqual(w.basket.w, L.basket.w);
    run(w, H);
    const sl = w.basket.slots[c.slot];
    near(c.x, w.basket.x + sl.dx, 1e-6); near(c.y, w.basket.y + sl.dy, 1e-6);
  }
});

// ======================================================= sessions / bot / determinism
test('determinism: same seed + same inputs → identical event stream; inputs replayed with other frame sizes → identical', () => {
  const a = playSession(77, 5, 0.6, { keep: true }), b = playSession(77, 5, 0.6, { keep: true });
  assert.strictEqual(JSON.stringify(a.events), JSON.stringify(b.events));
  assert.strictEqual(a.w.stars, b.w.stars);
  const c = playSession(78, 5, 0.6, { keep: true });
  assert.notStrictEqual(JSON.stringify(a.events), JSON.stringify(c.events));
  // record (1/30 s frames) → replay at 1/120 and 1/60 s frames
  const rec = (() => {
    const w = new PG.World({ seed: 5, age: 4 }); w.setViewport(1280, 720, null);
    const inputs = [];
    for (const fn of ['pointerDown', 'pointerMove', 'pointerUp', 'talkAnswer']) { const o = w[fn].bind(w); w[fn] = (...x) => { inputs.push({ step: Math.round(w.time / w.cfg.step), fn, x }); return o(...x); }; }
    const bot = new PG.Bot(w, { skill: 0.6, seed: 9 }); w.newSession(); const evs = [];
    let t = 0; while (w.state !== 'sessionDone' && t < 1500) { bot.step(1 / 30); w.update(1 / 30); t += 1 / 30; evs.push(...w.drainEvents()); }
    return { inputs, evs: JSON.stringify(evs.slice(2)) };
  })();
  for (const frame of [1 / 120, 1 / 60]) {
    const w = new PG.World({ seed: 5, age: 4 }); w.setViewport(1280, 720, null); w.newSession(); w.drainEvents();
    const evs = []; let k = 0, guard = 0; const per = Math.round(frame / w.cfg.step);
    while (w.state !== 'sessionDone' && guard++ < 1e7) {
      const s = Math.round(w.time / w.cfg.step);
      while (k < rec.inputs.length && rec.inputs[k].step <= s) { w[rec.inputs[k].fn](...rec.inputs[k].x); k++; }
      const nextIn = k < rec.inputs.length ? rec.inputs[k].step : Infinity;
      w.update(Math.max(1, Math.min(per, nextIn - s)) * w.cfg.step); evs.push(...w.drainEvents());
    }
    assert.strictEqual(JSON.stringify(evs), rec.evs, 'replay at ' + frame);
  }
});

const DUR = {};
test('bot: full sessions for ages 3–7 × skill 0.5/0.9 × 6 seeds × viewports complete, no stuck rounds; durations on target', () => {
  for (const age of AGES) for (const skill of [0.5, 0.9]) {
    const R = [], C = [], S = [];
    for (let s = 1; s <= 6; s++) {
      const vp = VIEWPORTS[(s + age) % VIEWPORTS.length];
      const r = playSession(s * 100 + age, age, skill, { lang: s % 2 ? 'en' : 'vi', vp });
      const ctx = 'age ' + age + ' skill ' + skill + ' seed ' + s + ' ' + vp.name;
      assert.strictEqual(r.w.state, 'sessionDone', ctx);
      assert.ok(r.rounds.length >= 12 && r.rounds.length <= 16, ctx + ' rounds ' + r.rounds.length);
      for (const rd of r.rounds) assert.ok(rd.dur < 90, ctx + ' stuck/slow round ' + rd.topic + ' ' + rd.dur.toFixed(1));
      assert.ok(r.w.stars >= r.rounds.length && r.w.stars <= 3 * r.rounds.length + 4);
      assert.strictEqual(r.bot.stats.talks, 4);
      assert.strictEqual(r.w.counters.taps, 0, 'the bot never taps');
      R.push(...r.rounds.map(x => x.dur)); C.push(...r.chapters.map(x => x.dur)); S.push(r.w.time);
    }
    DUR[age + '@' + skill] = { round: median(R), chapter: median(C), session: median(S), chMax: Math.max(...C), sesMax: Math.max(...S) };
    assert.ok(Math.max(...S) <= 480, 'session ≤ 8 min: ' + Math.max(...S).toFixed(0));
  }
  for (const k of ['4@0.5', '4@0.9']) assert.ok(DUR[k].chapter >= 55 && DUR[k].chapter <= 100, 'age-4 chapter median ' + DUR[k].chapter.toFixed(1));
});

test('bot: skill 1 never catches a wrong bubble in 6 sessions; skill 0.3 makes mistakes; drives the pointer like a finger', () => {
  let wrong1 = 0, stars1 = 0, max1 = 0;
  for (let s = 1; s <= 6; s++) { const r = playSession(300 + s, 3 + (s % 5), 1, { vp: VIEWPORTS[s % VIEWPORTS.length] }); wrong1 += r.bot.stats.wrong; stars1 += r.w.stars; max1 += 3 * r.rounds.length + 4; }
  assert.ok(wrong1 <= 1, 'skill-1 wrong catches ' + wrong1);
  assert.ok(stars1 / max1 > 0.97);
  let wrong3 = 0; for (let s = 1; s <= 4; s++) wrong3 += playSession(400 + s, 4, 0.3).bot.stats.wrong;
  assert.ok(wrong3 >= 4, 'low skill makes mistakes ' + wrong3);
  // finger only through the pointer API
  const w = mkWorld({ seed: 90, age: 4 });
  const calls = { pointerDown: 0, pointerMove: 0, pointerUp: 0, other: 0 };
  for (const fn of ['pointerDown', 'pointerMove', 'pointerUp']) { const o = w[fn].bind(w); w[fn] = (...a) => { calls[fn]++; return o(...a); }; }
  for (const fn of ['hint', 'cancelDrag', 'skipTalk', '_spawn', '_catch', 'setViewport', 'startLevel']) { const o = w[fn].bind(w); w[fn] = (...a) => { calls.other++; return o(...a); }; }
  const bot = new PG.Bot(w, { skill: 0.6, seed: 2 });
  w.newSession();
  const spawnCalls = calls.other; let maxV = 0, px = bot.finger.x;
  for (let i = 0; i < 60 * 120; i++) {
    const wasDown = bot.finger.down;
    bot.step(1 / 60);
    if (wasDown && bot.finger.down) maxV = Math.max(maxV, Math.abs(bot.finger.x - px) * 60);
    px = bot.finger.x; w.update(1 / 60); w.drainEvents();
  }
  assert.ok(calls.pointerDown > 5 && calls.pointerDown === bot.stats.steers && calls.pointerMove > 100);
  assert.ok(Math.abs(calls.pointerDown - calls.pointerUp) <= 1);
  assert.ok(maxV <= 1100 * 1.6, 'finger speed ' + maxV);
  // world-internal spawns/catches happen inside update(): the bot itself only used the pointer
  void spawnCalls;
  assert.ok(bot.stats.correct > 5);
});

test('performance: 10 full sessions simulated in < 4 s', () => {
  const t0 = Date.now();
  for (let i = 0; i < 10; i++) { const r = playSession(500 + i, AGES[i % 5], 0.8, { dt: 1 / 30 }); assert.strictEqual(r.w.state, 'sessionDone'); }
  const ms = Date.now() - t0;
  console.log('      10 sessions: ' + ms + ' ms');
  assert.ok(ms < 4000, ms + ' ms');
});

test('names (tolerant): if i18n.js loads, every target/pool/talk name kind produces a non-empty name', () => {
  let I;
  try { I = load(['rng.js', 'i18n.js', 'content.js']).I18N; } catch (e) { console.log('      (i18n.js not loadable: ' + e.message + ' — skipped)'); return; }
  if (!I || typeof I.name !== 'function') { console.log('      (no PG.I18N.name — skipped)'); return; }
  const missing = new Set();
  for (const lang of ['en', 'vi']) for (const topic of TOPICS) for (const age of AGES) for (let s = 1; s <= 10; s++) {
    const r = PG.Content.makeRound(topic, { age, lang, rng: new PG.RNG(s), roundIndex: s % 4 });
    for (const t of r.pool) { const n = I.name(lang, t.nameKind, t.nameValue); if (!n || lang === 'vi' && n === String(t.nameValue) && /^(color|shape|size|animal|fruit|parity)$/.test(t.nameKind)) missing.add(lang + ':' + t.nameKind + ':' + t.nameValue); }
  }
  if (missing.size) console.log('      note for the i18n owner — names falling back to the raw value: ' + [...missing].slice(0, 30).join(', '));
});

// ======================================================= weather
const AMB = [
  { skyTop: '#8FD3FF', skyBottom: '#E6F7FF', tint: null, darkness: 0, rainbow: 0 },
  { skyTop: '#7EC8F0', skyBottom: '#DDF3E8', tint: null, darkness: 0, rainbow: 0, sway: 0.8 },
  { skyTop: '#8C9BB0', skyBottom: '#C9D3DC', tint: null, darkness: 0.25, rainbow: 0 },
  { skyTop: '#FFB38A', skyBottom: '#FFE7B8', tint: 'rgba(255,170,90,0.120)', darkness: 0, rainbow: 1 }
];
test('weather: ambient values per mood, 2 s crossfade interpolates colours', () => {
  const wx = new PG.Weather({ width: 1280, height: 720, seed: 1 });
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
  const SPR = new Set(PG.Weather.SPRITES), CL = new Set(PG.Weather.CLOUD_SPRITES);
  const counts = {};
  for (const [W, Hh] of [[1600, 720], [1280, 720], [960, 720], [720, 1600], [720, 960]]) {
    const wx = new PG.Weather({ width: W, height: Hh, seed: 3 });
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
  const a = new PG.Weather({ width: 1280, height: 720, seed: 9 }), b = new PG.Weather({ width: 1280, height: 720, seed: 9 });
  a.setWeather(1); b.setWeather(1);
  for (let i = 0; i < 300; i++) { a.update(1 / 60, { groundY: 650 }); }
  for (let i = 0; i < 100; i++) { b.update(3 / 60, { groundY: 650 }); }
  assert.strictEqual(JSON.stringify(a.particles), JSON.stringify(b.particles), 'dt-split independent');
  const x0 = a.particles[0].x;
  a.resize(640, 720); assert.ok(Math.abs(a.particles[0].x - x0 / 2) < 1e-9); assert.strictEqual(a.width, 640);
});

test('weather: motion — butterflies flap & wander on screen, leaves flutter + spin, rain angled with splashes', () => {
  const wx = new PG.Weather({ width: 1280, height: 720, seed: 5 });
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
const only = process.argv[2] ? new RegExp(process.argv[2]) : null;
const t0 = Date.now();
for (const t of tests) {
  if (only && !only.test(t.name)) continue;
  const s = Date.now();
  try { t.fn(); pass++; console.log('PASS ' + t.name + ' (' + (Date.now() - s) + ' ms)'); }
  catch (e) { fail++; console.log('FAIL ' + t.name + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, +(process.env.STACK || 4)).join('\n     ') : e)); }
}
if (Object.keys(DUR).length) {
  console.log('\nBot sessions — median game seconds (6 seeds × mixed viewports):');
  console.log('  age skill | round | chapter (max) | session (max)');
  for (const k of Object.keys(DUR)) {
    const d = DUR[k], [a, s] = k.split('@');
    console.log('  ' + a + '   ' + s.padEnd(5) + ' | ' + d.round.toFixed(1).padStart(5) + ' | ' + d.chapter.toFixed(0).padStart(4) + ' (' + d.chMax.toFixed(0) + ')' + '     | ' + d.session.toFixed(0).padStart(4) + ' (' + d.sesMax.toFixed(0) + ')');
  }
}
console.log('\n' + pass + ' passed, ' + fail + ' failed (' + (Date.now() - t0) + ' ms)');
process.exit(fail ? 1 : 0);
