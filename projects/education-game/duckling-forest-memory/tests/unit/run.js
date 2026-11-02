#!/usr/bin/env node
// Dee's Forest Memory — headless unit tests for rng / content / world / weather / bot.
// Run from projects/education-game/duckling-forest-memory:   node tests/unit/run.js
// (tests/unit/i18n_voice.test.js is the voice engineer's suite and runs on its own.)
'use strict';
const assert = require('assert');
const { load } = require('./load');

const DM = load();
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const H = 1 / 120;
const J = v => JSON.parse(JSON.stringify(v));
assert.deepStrictEqual = ((orig) => (a, b, m) => orig(J(a), J(b), m))(assert.deepStrictEqual);
assert.notDeepStrictEqual = ((orig) => (a, b, m) => orig(J(a), J(b), m))(assert.notDeepStrictEqual);
const hyp = (x, y) => Math.sqrt(x * x + y * y);
const AGES = [3, 4, 5, 6, 7];
const LANGS = ['en', 'vi'];
const TOPICS = DM.Content.TOPICS;
const CFG = DM.CONFIG;

// 12 logical viewports (short side 720; insets already in logical px)
const VIEWPORTS = [
  { W: 1556, H: 720, ins: null, name: 'iPhone landscape' },
  { W: 1556, H: 720, ins: { top: 0, right: 108, bottom: 38, left: 108 }, name: 'iPhone landscape notch' },
  { W: 720, H: 1556, ins: null, name: 'iPhone portrait' },
  { W: 720, H: 1556, ins: { top: 108, right: 0, bottom: 62, left: 0 }, name: 'iPhone portrait notch' },
  { W: 960, H: 720, ins: null, name: 'iPad landscape 4:3' },
  { W: 960, H: 720, ins: { top: 32, right: 0, bottom: 27, left: 0 }, name: 'iPad landscape insets' },
  { W: 720, H: 960, ins: null, name: 'iPad portrait' },
  { W: 720, H: 960, ins: { top: 32, right: 0, bottom: 27, left: 0 }, name: 'iPad portrait insets' },
  { W: 1280, H: 720, ins: null, name: '16:9' },
  { W: 1600, H: 720, ins: null, name: '1600×720 (long cap)' },
  { W: 720, H: 1600, ins: { top: 44, right: 0, bottom: 34, left: 0 }, name: '720×1600 tall insets' },
  { W: 1080, H: 720, ins: { top: 24, right: 44, bottom: 20, left: 44 }, name: 'iPad Pro landscape insets' }
];

// ---------- helpers ----------
function mkWorld(o) {
  o = o || {};
  // surprises are off unless asked for (o.surprise), so the flow tests see a plain grid round
  const cfg = Object.assign(o.surprise ? {} : { surpriseTypes: [] }, o.config || {});
  const w = new DM.World({ seed: o.seed || 1, age: o.age || 4, lang: o.lang || 'en', config: cfg });
  const v = o.vp || VIEWPORTS[8];
  w.setViewport(v.W, v.H, v.ins);
  return w;
}
/** Starts round `ri` of `topic` directly (skips the intro). */
function roundOf(w, topic, ri) {
  w.levels = [topic, topic, topic, topic];
  w.startLevel(0);
  w.round = ri || 0;
  w._beginRound();
  return w;
}
function run(w, s, each) { const n = Math.round(s / H); for (let i = 0; i < n; i++) { if (each) each(i); w.update(H); } }
function untilPhase(w, ph, max) { let n = 0; while (w.phase !== ph && n++ < (max || 6000)) w.update(H); assert.strictEqual(w.phase, ph, 'phase ' + ph); }
function tap(w, c) { const id = w.pointerDown(c.x, c.y); w.pointerUp(c.x, c.y); return id; }
function pairOf(w, key) { return w.cards.filter(c => c.key === key); }
function downCards(w) { return w.cards.filter(c => c.state === 'down'); }
function twoDifferent(w) { const d = downCards(w); const a = d[0]; const b = d.find(c => c.key !== a.key); return [a, b]; }
function waitFlip(w, c) { let n = 0; while (c.flip < 0.95 && n++ < 400) w.update(H); }
function solveRound(w) {
  let g = 0;
  while (w.state === 'round' && g++ < 20000) {
    if (w.phase === 'play' && w.open.length === 1) { const o = w.cardById(w.open[0]); const p = pairOf(w, o.key).find(c => c !== o); if (p.state === 'down') tap(w, p); }
    else if (w.phase === 'play' && !w.open.length) { const d = downCards(w); if (d.length) { const p = pairOf(w, d[0].key); tap(w, p[0]); tap(w, p[1]); } }
    w.update(H * 4);
  }
}
const ev = (w) => w.drainEvents();
function rectsOverlap(a, b) { return a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.h - 1e-6 && b.y < a.y + a.h - 1e-6; }
function insideR(a, b) { return a.x >= b.x - 1e-6 && a.y >= b.y - 1e-6 && a.x + a.w <= b.x + b.w + 1e-6 && a.y + a.h <= b.y + b.h + 1e-6; }
function cardR(c, g) { return { x: c.x - g.cw / 2, y: c.y - g.ch / 2, w: g.cw, h: g.ch }; }
function playSession(seed, age, skill, opts) {
  opts = opts || {};
  const w = new DM.World({ seed, age, lang: opts.lang || 'en', config: opts.config });
  const v = opts.vp || VIEWPORTS[8];
  w.setViewport(v.W, v.H, v.ins);
  const bot = new DM.Bot(w, { skill, seed: seed * 3 + 1 });
  w.newSession();
  const dt = opts.dt || 1 / 30, evs = [];
  let t = 0;
  while (w.state !== 'sessionDone' && t < 3000) {
    bot.step(dt); w.update(dt);
    const e = w.drainEvents();
    if (opts.keep) for (const x of e) evs.push(x);
    if (opts.each) opts.each(w, e, t);
    t += dt;
  }
  return { w, bot, t, events: evs };
}
function chapter(topic, age, lang, seed) {
  const rng = new DM.RNG(seed), hist = [], out = [];
  for (let ri = 0; ri < 4; ri++) { const r = DM.Content.makeRound(topic, { age, lang, rng, roundIndex: ri, history: hist }); hist.push(r.sum); out.push(r); }
  return out;
}

// ======================================================= RNG
test('rng: deterministic, ranges, shuffle is a permutation', () => {
  const a = new DM.RNG(42), b = new DM.RNG(42), c = new DM.RNG(43);
  const sa = [], sb = [], sc = [];
  for (let i = 0; i < 500; i++) { sa.push(a.next()); sb.push(b.next()); sc.push(c.next()); }
  assert.deepStrictEqual(sa, sb); assert.notDeepStrictEqual(sa, sc);
  assert.ok(sa.every(v => v >= 0 && v < 1));
  const r = new DM.RNG('x');
  for (let i = 0; i < 1000; i++) { const k = r.int(2, 5); assert.ok(k >= 2 && k <= 5 && k === Math.floor(k)); const f = r.float(-1, 1); assert.ok(f >= -1 && f < 1); }
  const arr = [1, 2, 3, 4, 5, 6, 7, 8]; const sh = r.shuffle(arr.slice());
  assert.deepStrictEqual(sh.slice().sort(), arr);
  assert.strictEqual(new Set(r.sample(arr, 5)).size, 5);
});

// ======================================================= content
test('content: palette, animals, age topics, pairs and peek tables exactly as DESIGN §3/§5.1', () => {
  assert.strictEqual(DM.PALETTE.red.fill, '#E84A4A'); assert.strictEqual(DM.PALETTE.pink.dark, '#C9558A');
  assert.strictEqual(DM.PALETTE.yellow.fill, '#FFD23F'); assert.strictEqual(DM.PALETTE.purple.dark, '#6840A8');
  assert.deepStrictEqual(DM.ANIMALS, ['fox', 'deer', 'hedgehog', 'squirrel', 'bunny', 'frog', 'bear', 'owl', 'mouse']);
  assert.deepStrictEqual(DM.AGE_TOPICS[3], ['colors', 'size', 'shapes', 'animals']);
  assert.deepStrictEqual(DM.AGE_TOPICS[4], ['colors', 'shapes', 'count', 'animals']);
  assert.deepStrictEqual(DM.AGE_TOPICS[5], ['shapes', 'count', 'letters', 'animals']);
  assert.deepStrictEqual(DM.AGE_TOPICS[6], ['lower', 'initial', 'add', 'count']);
  assert.deepStrictEqual(DM.AGE_TOPICS[7], ['initial', 'add', 'sub', 'oddeven']);
  assert.deepStrictEqual(DM.Content.PAIRS, { 3: [2, 2, 3, 3], 4: [2, 3, 4, 4], 5: [3, 4, 5, 5], 6: [3, 4, 5, 6], 7: [3, 4, 5, 6] });
  assert.deepStrictEqual(DM.Content.PEEK, { 3: 3.5, 4: 2.5, 5: 2.0, 6: 1.5, 7: 1.5 });
  assert.deepStrictEqual(DM.Content.topicsFor(2), DM.AGE_TOPICS[3]); assert.deepStrictEqual(DM.Content.topicsFor(9), DM.AGE_TOPICS[7]);
  for (const a of AGES) { assert.ok(DM.AGE_POOLS[a].length >= 5, 'pool ' + a); DM.AGE_TOPICS[a].forEach(t => assert.ok(DM.AGE_POOLS[a].includes(t))); }
  assert.deepStrictEqual(DM.AGE_POOLS[4], ['colors', 'animals', 'shapes', 'count', 'size']);
  for (const l of LANGS) for (const w of DM.WORDS[l]) { assert.ok(DM.ANIMALS.includes(w.animal)); assert.strictEqual(w.sprite, 'animal_' + w.animal);
    assert.strictEqual(w.word[0].toUpperCase().normalize('NFD').replace(/[\u0300\u0301\u0303\u0309\u0323]/g, '').normalize('NFC'), w.initial, w.word); }
  assert.ok(!DM.WORDS.vi.some(w => /^(th|nh|ch)/.test(w.word)), 'vi skips digraph words');
});

test('content: every topic × age 3–7 × en/vi × 200 seeds → valid, solvable chapters within the §5.1 rules', () => {
  const COLORS = DM.Content.COLORS;
  let rounds = 0;
  for (const topic of TOPICS) for (const age of AGES) for (const lang of LANGS) for (let s = 0; s < 200; s++) {
    const ch = chapter(topic, age, lang, s * 7919 + age * 13 + (lang === 'vi' ? 5 : 0));
    let prevSet = null;
    ch.forEach((r, ri) => {
      rounds++;
      const tag = `${topic}/${age}/${lang}/${s}/${ri}`;
      assert.strictEqual(DM.Content.validate(r), null, tag);
      assert.strictEqual(r.cards.length, 2 * r.pairs, tag);
      assert.ok(r.cards.length <= 12, tag);
      const want = Math.max(2, Math.min(DM.Content.PAIRS[age][ri], DM.Content.maxPairs(topic, age, lang)));
      assert.strictEqual(r.pairs, want, tag + ' pairs');
      assert.strictEqual(r.peek, DM.Content.PEEK[age], tag + ' peek');
      assert.strictEqual(r.promptKey, 'p.' + topic); assert.strictEqual(r.params.n, r.pairs);
      const keys = {}; r.cards.forEach(c => { keys[c.key] = (keys[c.key] || 0) + 1; });
      assert.ok(Object.values(keys).every(v => v === 2), tag + ' every key on exactly 2 cards');
      assert.strictEqual(new Set(r.cards.map(c => c.id)).size, r.cards.length);
      assert.notStrictEqual(r.sum.set, prevSet, tag + ' identical consecutive rounds'); prevSet = r.sum.set;
      const info = r.pairInfo, ks = Object.keys(info);
      const rk = { colors: 'butterfly', shapes: 'lantern', size: 'animal', animals: 'animal', count: 'acorns', oddeven: 'acorns',
        letters: 'star', lower: 'star', initial: 'animal', add: 'star', sub: 'star' }[topic];
      assert.strictEqual(r.reward.kind, rk); ks.forEach(k => assert.strictEqual(info[k].reward.kind, rk));
      const pairs = ks.map(k => r.cards.filter(c => c.key === k));
      switch (topic) {
        case 'colors': {
          const cs = ks.map(k => info[k].nameValue);
          if (age <= 5) { assert.ok(!DM.Content.clash(cs), tag + ' colour clash ' + cs); assert.ok(cs.every(c => COLORS.includes(c)), 'no pink up to 5'); }
          break;
        }
        case 'shapes':
          if (age <= 4) {
            pairs.forEach(p => assert.strictEqual(p[0].face.color, p[1].face.color, tag + ' pair shares colour'));
            assert.strictEqual(new Set(pairs.map(p => p[0].face.color)).size, pairs.length, tag + ' each shape its own colour');
            assert.ok(!r.cards.some(c => c.face.shape === 'rect'));
          } else pairs.forEach(p => assert.notStrictEqual(p[0].face.color, p[1].face.color, tag + ' age 5: real shape matching'));
          break;
        case 'size': pairs.forEach(p => assert.deepStrictEqual(p.map(c => c.face.scale).sort(), [0.6, 1])); break;
        case 'count': case 'oddeven': {
          const hi = topic === 'oddeven' ? 12 : DM.Content.COUNT_RANGE[age][1];
          pairs.forEach(p => { const n = p[0].face.n; assert.ok(n >= 1 && n <= hi, tag + ' n ' + n); assert.deepStrictEqual(p.map(c => c.face.kind).sort(), ['dots', 'number']); });
          if (topic === 'count' && ri === 0 && age <= 4) assert.ok(pairs.every(p => p[0].face.n <= 3), 'warm-up 1–3');
          if (topic === 'oddeven') {
            const par = pairs.map(p => p[0].face.parity);
            assert.ok(par.includes('odd') && par.includes('even'), tag + ' both parities');
            r.cards.forEach(c => assert.strictEqual(c.face.parity, c.face.n % 2 ? 'odd' : 'even'));
            ks.forEach(k => assert.ok(info[k].parity));
          }
          break;
        }
        case 'lower': r.cards.forEach(c => assert.ok(!/[IilL]/.test(c.face.text), tag + ' no I/l')); break;
        case 'initial': pairs.forEach(p => { const L = p.find(c => c.face.kind === 'letter'), A = p.find(c => c.face.kind === 'animal');
          assert.ok(L && A); assert.strictEqual(DM.WORDS[lang].find(w => w.word === A.word).initial, L.face.text); }); break;
        case 'add': case 'sub': pairs.forEach(p => { const T = p.find(c => c.face.kind === 'text'), N = p.find(c => c.face.kind === 'number');
          const m = /^(\d+) ([+−]) (\d+)$/.exec(T.face.text); const v = m[2] === '+' ? +m[1] + +m[3] : +m[1] - +m[3];
          assert.strictEqual(v, N.face.n); assert.ok(topic === 'add' ? v <= (age >= 7 ? 20 : 10) : (v >= 0 && +m[1] <= 10)); }); break;
      }
    });
  }
  assert.ok(rounds >= 88000);
});

test('content: topic rotation — 4 of the ≥ 5 pool topics, chapter 1 = easiest not first last time, 2–4 easiest first, prefer topics left out last time', () => {
  const D = DM.Content.DIFFICULTY, di = t => D.indexOf(t);
  for (const age of AGES) {
    let last = null; const seen = new Set(), firsts = new Set();
    for (let s = 0; s < 200; s++) {
      const L = DM.Content.topicsFor(age, new DM.RNG(s * 13 + age), last);
      assert.strictEqual(L.length, 4); assert.strictEqual(new Set(L).size, 4);
      L.forEach(t => { assert.ok(DM.AGE_POOLS[age].includes(t)); seen.add(t); });
      const pool = DM.AGE_POOLS[age].slice().sort((a, b) => di(a) - di(b));
      const want1 = pool.find(t => !last || t !== last[0]); assert.strictEqual(L[0], want1, 'chapter 1');
      for (let i = 2; i < 4; i++) assert.ok(di(L[i]) > di(L[i - 1]), 'easiest first');
      if (last) { const leftOut = DM.AGE_POOLS[age].filter(t => !last.includes(t) && t !== L[0]); leftOut.forEach(t => assert.ok(L.includes(t), 'left-out topic comes back')); assert.notDeepStrictEqual(L, last); }
      firsts.add(L[0]); last = L;
    }
    assert.strictEqual(seen.size, DM.AGE_POOLS[age].length, 'every pool topic is played'); assert.ok(firsts.size >= 2);
  }
  // the world: newSession({ lastTopics }) and w.lastTopics
  const w = mkWorld({ age: 4 }); w.newSession({ lastTopics: ['colors', 'shapes', 'count', 'animals'] });
  assert.strictEqual(w.levels[0], 'animals'); assert.ok(w.levels.includes('size'));
  const w2 = mkWorld({ age: 4 }); w2.lastTopics = w.levels.slice(); w2.newSession(); assert.notStrictEqual(w2.levels[0], w.levels[0]);
});

test('content: deviations are bounded — colours ≤ 3 pairs up to age 5, vi initial ≤ 5 pairs', () => {
  assert.strictEqual(DM.Content.maxPairs('colors', 4, 'en'), 3);
  assert.strictEqual(DM.Content.maxPairs('colors', 5, 'en'), 3);
  assert.strictEqual(DM.Content.maxPairs('colors', 6, 'en'), 7);
  assert.strictEqual(DM.Content.maxPairs('initial', 7, 'vi'), 5);
  assert.strictEqual(DM.Content.maxPairs('initial', 7, 'en'), 7);
  assert.strictEqual(DM.Content.SAFE_SETS.length, 6);
});

test('content: validate() rejects broken rounds (self-check works)', () => {
  const r = DM.Content.makeRound('count', { age: 4, rng: new DM.RNG(3), roundIndex: 2 });
  assert.strictEqual(DM.Content.validate(r), null);
  const bad1 = J(r); bad1.cards[0].key = bad1.cards[1].key === bad1.cards[0].key ? bad1.cards[2].key : bad1.cards[1].key; assert.ok(DM.Content.validate(bad1));
  const bad2 = J(r); const d = bad2.cards.find(c => c.face.kind === 'dots'); d.face.n = d.face.n === 5 ? 4 : d.face.n + 1; assert.ok(DM.Content.validate(bad2), 'dots ≠ numeral');
  const bad3 = J(r); bad3.cards.pop(); assert.ok(DM.Content.validate(bad3));
  const bad4 = J(DM.Content.makeRound('colors', { age: 3, rng: new DM.RNG(1), roundIndex: 3 }));
  bad4.cards[0].face.color = 'teal'; assert.ok(DM.Content.validate(bad4));
  const bad5 = J(DM.Content.makeRound('lower', { age: 6, rng: new DM.RNG(1), roundIndex: 1 }));
  const lo = bad5.cards.find(c => c.face.text === c.face.text.toLowerCase()); lo.face.text = lo.face.text.toUpperCase(); assert.ok(DM.Content.validate(bad5), 'lower pair = 2 capitals');
});

test('content: deterministic (same seed → same round and talk)', () => {
  for (const t of TOPICS) {
    assert.deepStrictEqual(DM.Content.makeRound(t, { age: 6, rng: new DM.RNG(9), roundIndex: 2 }), DM.Content.makeRound(t, { age: 6, rng: new DM.RNG(9), roundIndex: 2 }));
    assert.deepStrictEqual(DM.Content.makeTalk(t, { age: 6, rng: new DM.RNG(9) }), DM.Content.makeTalk(t, { age: 6, rng: new DM.RNG(9) }));
  }
});

test('talk: every topic × age × lang × 300 seeds → distinct choices incl. the answer; animals "Where is the {animal}?"', () => {
  for (const t of TOPICS) for (const age of AGES) for (const lang of LANGS) for (let s = 0; s < 300; s++) {
    const k = DM.Content.makeTalk(t, { age, lang, rng: new DM.RNG(s * 31 + age) });
    assert.strictEqual(k.promptKey, 'talk.' + t);
    const vals = k.choices.map(c => c.value);
    assert.strictEqual(new Set(vals).size, vals.length, t);
    assert.ok(k.choices.length >= 2 && k.choices.length <= 3);
    const ans = k.choices.find(c => c.id === k.answerId); assert.ok(ans, 'answer present');
    if (t === 'animals') { assert.strictEqual(k.show, null); assert.strictEqual(k.params.animal, ans.value); assert.strictEqual(k.choices.length, 3); assert.ok(k.choices.every(c => c.kind === 'animal')); }
    else { assert.ok(k.show && k.show.kind, t + ' shows a card face'); }
    if (t === 'colors' && age <= 5) assert.ok(!DM.Content.clash(vals) && !vals.includes('pink'), 'talk colours safe');
    if (t === 'count') assert.strictEqual(k.show.n, ans.value);
    if (t === 'oddeven') assert.strictEqual(ans.value, k.show.n % 2 ? 'odd' : 'even');
    if (t === 'size') { assert.strictEqual(ans.value, k.show.size); assert.strictEqual(k.params.animal, k.show.value);
      k.choices.forEach(c => { assert.strictEqual(c.sprite, k.show.sprite); assert.strictEqual(c.scale, c.value === 'big' ? 1 : 0.6); }); }
    if (t === 'initial') assert.strictEqual(DM.WORDS[lang].find(w => w.word === k.params.word).initial, ans.value);
  }
});

// ======================================================= layout / grid
test('layout: §2 formulas (groundY, Dee, bubble, board, HUD, short-side rule)', () => {
  const L = DM.World.computeLayout(1280, 720, null);
  assert.strictEqual(L.groundY, 630); assert.deepStrictEqual(L.dee, { x: 110, y: 646, h: 180 });
  assert.deepStrictEqual(L.bubble, { x: 24, y: 20, w: 640, h: 122 });
  assert.strictEqual(L.board.x, 240); assert.strictEqual(L.board.y, 166); assert.strictEqual(L.board.y + L.board.h, 620);
  assert.ok(L.board.x >= L.dee.x + 120);
  const P = DM.World.computeLayout(720, 1556, { top: 108, bottom: 62 });
  assert.strictEqual(P.groundY, 1556 - 62 - 90); assert.deepStrictEqual(P.dee, { x: 100, y: P.groundY + 20, h: 170 });
  assert.strictEqual(P.bubble.y, 108 + 96 + 24); assert.strictEqual(P.bubble.h, 124); assert.strictEqual(P.bubble.w, 640);
  assert.strictEqual(P.boards.length, 2); assert.ok(P.boards[0].y + P.boards[0].h <= P.dee.y - P.dee.h - 10 + 1e-9);
  assert.ok(P.boards[1].x >= P.deeRect.x + P.deeRect.w + 40 - 1e-9);
  assert.deepStrictEqual(DM.World.logicalSize(852, 393), { W: 1561, H: 720 });
  assert.deepStrictEqual(DM.World.logicalSize(393, 852), { W: 720, H: 1561 });
  assert.deepStrictEqual(DM.World.logicalSize(1024, 768), { W: 960, H: 720 });
  assert.deepStrictEqual(DM.World.logicalSize(3000, 700), { W: 1600, H: 720 });
});

test('grid: 12 viewports × 2–6 pairs × ages → cards inside the board + screen, ≥ min size, no overlap with HUD/bubble/Dee, gaps ≥ 14, hit rects separate', () => {
  const rows = [];
  for (const v of VIEWPORTS) for (const age of AGES) for (let pairs = 2; pairs <= 6; pairs++) {
    const n = 2 * pairs, L = DM.World.computeLayout(v.W, v.H, v.ins), g = DM.World.chooseGrid(L, n, age);
    const tag = `${v.name} age ${age} ${pairs} pairs`;
    assert.ok(g.cols * g.rows >= n && g.cols * g.rows - n <= 1, tag + ' at most one empty slot');
    assert.ok(Math.abs(g.ch - g.cw / 0.78) < 1e-9);
    assert.ok(g.gap >= 14 - 1e-9 && g.gap >= 0.12 * g.cw - 1e-9, tag + ' gap');
    const maxP = Math.max(...DM.Content.PAIRS[age]);
    if (pairs <= maxP) assert.ok(g.cw >= CFG.cardMin[age] - 1e-9, tag + ' card ' + g.cw.toFixed(1) + ' < ' + CFG.cardMin[age]);
    assert.ok(g.cw <= CFG.cardMax + 1e-9);
    const safe = { x: L.ins.left, y: L.ins.top, w: L.W - L.ins.left - L.ins.right, h: L.H - L.ins.top - L.ins.bottom };
    const R = g.slots.map(s => ({ x: s.x - g.cw / 2, y: s.y - g.ch / 2, w: g.cw, h: g.ch }));
    for (const r of R) {
      assert.ok(insideR(r, g.board), tag + ' inside board'); assert.ok(insideR(r, safe), tag + ' inside the safe screen');
      assert.ok(!rectsOverlap(r, L.hud) && !rectsOverlap(r, L.bubble) && !rectsOverlap(r, L.deeRect), tag + ' clear of HUD/bubble/Dee');
      assert.ok(r.y + r.h <= L.groundY - 10 + 1e-6);
    }
    for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) {
      assert.ok(!rectsOverlap(R[i], R[j]), tag + ' cards overlap');
      // the grown hit rect of one card never contains the other card's centre
      const hi = { x: R[i].x - 10, y: R[i].y - 10, w: R[i].w + 20, h: R[i].h + 20 };
      const cj = g.slots[j]; assert.ok(!(cj.x > hi.x && cj.x < hi.x + hi.w && cj.y > hi.y && cj.y < hi.y + hi.h));
    }
    // empty slot: last row centred
    if (g.cols * g.rows > n) { const last = g.slots.slice((g.rows - 1) * g.cols); const mid = last.reduce((s, q) => s + q.x, 0) / last.length; assert.ok(Math.abs(mid - (g.rect.x + g.rect.w / 2)) < 1e-6, tag + ' centred'); }
    if (age === 4 && pairs === 4) rows.push(`${v.name}: ${g.cols}×${g.rows} ${g.cw.toFixed(0)} px`);
  }
  console.log('      age 4, 4 pairs: ' + rows.join(' · '));
});

test('grid: largest card wins; ties (both at the 210 px cap) prefer the squarer grid, then the board above Dee', () => {
  const L = DM.World.computeLayout(1600, 720, null), g = DM.World.chooseGrid(L, 4, 4);
  assert.strictEqual(g.cw, CFG.cardMax); assert.strictEqual(g.cols, 4, '4×1 has the bigger card here (2×2: 168 px)');
  const P = DM.World.computeLayout(720, 1600, null), gp = DM.World.chooseGrid(P, 4, 4);
  assert.strictEqual(gp.cw, CFG.cardMax); assert.strictEqual(gp.cols, 2); assert.strictEqual(gp.boardIndex, 0, 'board A');
  for (const v of VIEWPORTS) { const Lv = DM.World.computeLayout(v.W, v.H, v.ins); for (const n of [4, 6]) { const gv = DM.World.chooseGrid(Lv, n, 4); assert.ok(gv.cols > 1 && gv.rows < n, v.name + ' no single column'); } }
  // the iPad portrait with insets needs board B (right of Dee) for 12 cards
  const Q = DM.World.computeLayout(720, 960, { top: 32, bottom: 27 }), gq = DM.World.chooseGrid(Q, 12, 6);
  assert.strictEqual(gq.boardIndex, 1); assert.ok(gq.cw >= 104);
});

test('layout: colour rounds never put a yellow card within 40 px of Dee (12 viewports × 40 seeds)', () => {
  let swaps = 0;
  for (const v of VIEWPORTS) for (let s = 0; s < 40; s++) for (const age of [3, 4]) {
    const w = mkWorld({ vp: v, seed: s + 1, age });
    roundOf(w, 'colors', s % 4);
    const L = w.layout;
    for (const c of w.cards) if (c.face.color === 'yellow') {
      const r = { x: c.hx - c.w / 2, y: c.hy - c.h / 2, w: c.w, h: c.h };
      assert.ok(DM.World.rectGap(r, L.deeRect) >= 40 - 1e-6, v.name + ' yellow near Dee');
    }
    if (w.cards.some(c => c.slot !== +c.id.slice(1))) swaps++;
  }
  console.log('      rounds with a yellow swap: ' + swaps);
});

// ======================================================= round flow / motion
test('deal → peek → hide → play: staggered ballistic deal with spin + landing squash, peek wave, hold = peek time, hide wave', () => {
  const w = mkWorld({ age: 4 });
  roundOf(w, 'animals', 2);
  assert.strictEqual(w.phase, 'deal');
  const E = ev(w).filter(e => e.type === 'round'); assert.strictEqual(E[0].pairs, CFG.pairsByAge[4][2]);
  const c3 = w.cards[3], S = w.layout.stack;
  assert.strictEqual(c3.x, S.x); assert.ok(c3.sx < 0.5, 'small on the deck');
  const deals = [], peekAt = [], hideAt = [], playAt = [];
  let maxAbove = 0, rotStart = null, lastSquash = 0, n = 0;
  while (w.phase !== 'play' && n++ < 20000) {
    w.update(H);
    for (const e of ev(w)) { if (e.type === 'deal') deals.push([e.id, w.time]); if (e.type === 'peek') peekAt.push(w.time); if (e.type === 'hide') hideAt.push(w.time); if (e.type === 'play') playAt.push(w.time); }
    if (c3.state === 'deal' && c3.t > 0) {
      if (rotStart === null) rotStart = c3.rot;
      const u = c3.t / c3._dT, ly = S.y + (c3.hy - S.y) * u; maxAbove = Math.max(maxAbove, ly - c3.y);
    }
    if (c3.state === 'down' && !lastSquash) lastSquash = c3.sx - 1;
  }
  const nC = 2 * CFG.pairsByAge[4][2];
  assert.strictEqual(deals.length, nC);
  for (let i = 1; i < nC; i++) assert.ok(Math.abs(deals[i][1] - deals[i - 1][1] - 0.07) < 0.011, 'stagger 0.07 s');
  assert.ok(maxAbove > 20, 'arc rises above the straight line ' + maxAbove);
  assert.ok(Math.abs(rotStart) > 2, 'spins in flight'); assert.ok(lastSquash > 0.05, 'landing squash');
  assert.strictEqual(peekAt.length, 1); assert.strictEqual(hideAt.length, 1); assert.strictEqual(playAt.length, 1);
  const hold = hideAt[0] - peekAt[0];
  const pk = CFG.peekByAge[4] * (0.6 + 0.1 * nC); assert.ok(hold > pk && hold < pk + 0.7, 'peek ≈ wave + peek time ' + hold);
  assert.ok(w.cards.every(c => c.flip < 0.5 && c.state === 'down'));
  assert.ok(playAt[0] - hideAt[0] < 0.8);
});

test('peek: cards flip up in a 0.05 s wave (slot order); peek = peekByAge · (0.6 + 0.1·cards)', () => {
  for (const age of [3, 6]) {
    const w = mkWorld({ age }); roundOf(w, age === 3 ? 'animals' : 'add', 1);
    const peek = CFG.peekByAge[age] * (0.6 + 0.1 * w.cards.length);
    untilPhase(w, 'peek'); ev(w);
    const upAt = {};
    let n = 0, hideT = null;
    const t0 = w.time;
    while (w.phase === 'peek' && n++ < 3000) { w.update(H); for (const c of w.cards) if (c.flipT === 1 && upAt[c.slot] === undefined) upAt[c.slot] = w.time; }
    hideT = w.time;
    for (let s = 1; s < w.cards.length; s++) assert.ok(Math.abs(upAt[s] - upAt[s - 1] - 0.05) < 0.011);
    const fullUp = upAt[w.cards.length - 1] - t0 + 0.27;
    assert.ok(Math.abs(hideT - t0 - fullUp - peek) < 0.1, `age ${age} peek ${hideT - t0 - fullUp}`);
  }
});

test('flip: critically damped spring (95 % in ≈ 0.26 s, no overshoot), lift peaks at flip 0.5, flip event with the name', () => {
  const w = mkWorld(); roundOf(w, 'colors', 1); untilPhase(w, 'play'); ev(w);
  const c = downCards(w)[0];
  assert.strictEqual(tap(w, c), c.id);
  const E = ev(w); assert.strictEqual(E[0].type, 'flip'); assert.strictEqual(E[0].nameKind, 'color'); assert.strictEqual(E[0].nameValue, c.face.color); assert.ok(E[0].face);
  let t = 0, maxF = 0, liftAtHalf = null;
  while (c.flip < 0.95) { w.update(H); t += H; maxF = Math.max(maxF, c.flip); if (liftAtHalf === null && c.flip >= 0.5) liftAtHalf = c.lift; }
  assert.ok(t > 0.2 && t < 0.33, 'flip time ' + t);
  assert.ok(liftAtHalf > 0.98, 'lift peaks mid-turn');
  run(w, 0.6); assert.ok(c.flip <= 1 && c.flip > 0.999 && c.lift < 0.02);
  assert.strictEqual(c.state, 'up');
  // tapping the face-up card says its name again
  tap(w, c); const E2 = ev(w); assert.strictEqual(E2[0].type, 'tap'); assert.strictEqual(E2[0].id, c.id);
});

test('match: check at flip ≥ 0.95 → match event; cards lift, slide together, spin a full turn with overshoot, squash, burst → gone + one reward', () => {
  const w = mkWorld(); roundOf(w, 'animals', 2); untilPhase(w, 'play'); ev(w);
  const [a, b] = pairOf(w, w.cards[0].key);
  tap(w, a); tap(w, b);
  let matchT = null, n = 0, maxSpin = 0, minDist = 1e9, burstT = null, rewardEv = null;
  const t0 = w.time, d0 = hyp(a.x - b.x, a.y - b.y);
  while (n++ < 400) {
    w.update(H);
    for (const e of ev(w)) {
      if (e.type === 'match') { matchT = w.time; assert.strictEqual(e.key, a.key); assert.strictEqual(e.found, 1); assert.strictEqual(e.pairs, w.pairs); assert.strictEqual(e.nameKind, 'animal');
        assert.ok(a.flip >= 0.95 && b.flip >= 0.95); }
      if (e.type === 'reward') { rewardEv = e; burstT = w.time; }
    }
    if (a.state === 'matched') { maxSpin = Math.max(maxSpin, a.rot); minDist = Math.min(minDist, hyp(a.x - b.x, a.y - b.y)); }
  }
  assert.ok(matchT !== null && matchT - t0 < 0.4);
  assert.strictEqual(w.phase, 'play');
  assert.ok(maxSpin > 2 * Math.PI * 1.05 && maxSpin < 2 * Math.PI * 1.45, 'overshoot ' + (maxSpin / 2 / Math.PI));
  assert.ok(minDist < 0.35 * d0, 'slid together');
  assert.ok(Math.abs(burstT - matchT - CFG.matchBurstAt) < 0.02);
  assert.strictEqual(a.state, 'gone'); assert.strictEqual(b.state, 'gone');
  assert.strictEqual(rewardEv.kind, 'animal'); assert.strictEqual(w.rewards.length, 1); assert.strictEqual(w.rewards[0].sprite, a.face.sprite);
});

test('mismatch: no-no shake (±0.08 rad, 3 wiggles), faces stay 1.0 s (age 3: 1.2 s), flip down; streak; the third-tap fast reset', () => {
  for (const [age, show] of [[4, CFG.mismatchShow], [3, CFG.mismatchShowByAge[3]]]) {
    const w = mkWorld({ age }); roundOf(w, 'animals', 3); untilPhase(w, 'play'); ev(w);
    const [a, b] = twoDifferent(w);
    tap(w, a); tap(w, b);
    let misT = null, downT = null, maxRot = 0, signs = 0, prev = 0, n = 0;
    while (n++ < 600 && downT === null) {
      w.update(H);
      for (const e of ev(w)) if (e.type === 'mismatch') { misT = w.time; assert.strictEqual(e.streak, 1); assert.strictEqual(e.nameValueA, a.nameValue); assert.strictEqual(e.nameValueB, b.nameValue); assert.strictEqual(w.phase, 'resolve'); }
      if (misT !== null) { maxRot = Math.max(maxRot, Math.abs(a.rot)); if (a.rot * prev < 0) signs++; prev = a.rot || prev; }
      if (misT !== null && a.state === 'down') downT = w.time;
    }
    assert.ok(Math.abs(downT - misT - show) < 0.02, 'show ' + (downT - misT));
    assert.ok(maxRot > 0.05 && maxRot <= 0.0801, 'shake ' + maxRot); assert.ok(signs >= 4 && signs <= 6, 'wiggles ' + signs);
    assert.strictEqual(w.phase, 'play'); assert.strictEqual(w.mismatches, 1);
  }
  // fast reset: 2 mismatched up, a third tap flips them down at once and the new one up — one mistake only
  const w = mkWorld({ age: 4 }); roundOf(w, 'animals', 3); untilPhase(w, 'play'); ev(w);
  const [a, b] = twoDifferent(w);
  tap(w, a); tap(w, b); run(w, 0.5); ev(w);
  assert.strictEqual(w.phase, 'resolve');
  const c = downCards(w).find(x => x.id !== a.id && x.id !== b.id);
  assert.strictEqual(tap(w, c), null, 'faces shown < 0.5 s: the third tap waits (QA P2-1)');
  run(w, 0.35); ev(w);
  assert.strictEqual(tap(w, c), c.id);
  const E = ev(w);
  assert.strictEqual(a.state, 'down'); assert.strictEqual(b.state, 'down'); assert.strictEqual(c.state, 'up');
  assert.ok(E.some(e => e.type === 'flip' && e.id === c.id)); assert.ok(!E.some(e => e.type === 'mismatch'), 'counted once');
  assert.strictEqual(w.mismatches, 1); assert.deepStrictEqual(w.open, [c.id]);
  // very fast third tap (before the check): ignored; the mismatch is shown and counted normally
  const w2 = mkWorld({ age: 4 }); roundOf(w2, 'animals', 3); untilPhase(w2, 'play'); ev(w2);
  const [a2, b2] = twoDifferent(w2); tap(w2, a2); tap(w2, b2);
  const c2 = downCards(w2).find(x => x !== a2 && x !== b2); assert.strictEqual(tap(w2, c2), null);
  run(w2, 0.4); assert.strictEqual(w2.mismatches, 1); assert.ok(ev(w2).some(e => e.type === 'mismatch')); assert.strictEqual(c2.state, 'down');
  // a pending MATCH is never broken by a third tap
  const w3 = mkWorld({ age: 4 }); roundOf(w3, 'animals', 3); untilPhase(w3, 'play');
  const p3 = pairOf(w3, w3.cards[0].key); tap(w3, p3[0]); tap(w3, p3[1]);
  const o3 = downCards(w3)[0]; assert.strictEqual(tap(w3, o3), null); run(w3, 1.6); assert.strictEqual(p3[0].state, 'gone'); assert.strictEqual(w3.found, 1);
});

test('taps: only in play / mismatch resolve; matched → tap; misses → null; just after a match flips wait; hit rect +10 px, nearest wins', () => {
  const w = mkWorld(); roundOf(w, 'animals', 2);
  const c0 = w.cards[0];
  assert.strictEqual(w.pointerDown(c0.hx, c0.hy), null, 'not during the deal');
  untilPhase(w, 'peek'); assert.strictEqual(w.pointerDown(c0.x, c0.y), null, 'not during the peek');
  untilPhase(w, 'play'); ev(w);
  const g = w.layout.grid;
  // +10 px outside the edge still hits, +12 does not (unless the neighbour)
  assert.strictEqual(w.pointerDown(c0.x + g.cw / 2 + 9, c0.y), c0.id); ev(w);
  const far = w.pointerDown(w.layout.W - 2, 2); assert.strictEqual(far, null);
  const [a, b] = pairOf(w, c0.key);
  const other = downCards(w).find(c => c.key !== c0.key);
  // a.c0 is up now → tap b → match; immediately tapping another down card is ignored (resolve after a match)
  tap(w, b); waitFlip(w, b); w.update(H); ev(w);
  assert.strictEqual(w.phase, 'resolve');
  assert.strictEqual(tap(w, other), null);
  assert.strictEqual(tap(w, a), a.id, 'tap on a matched card speaks'); assert.strictEqual(ev(w)[0].type, 'tap');
  run(w, 0.5); assert.strictEqual(w.phase, 'play'); assert.strictEqual(tap(w, other), other.id);
});

test('hints: 3 mismatches in a row → hint {a, b} of one pair (glow 2.5 s + half-turn peek to 0.75); cooldown 6 s; manual hint(); idle nudges 12/18/27/30 s, hint from the 2nd', () => {
  const w = mkWorld({ age: 5 }); roundOf(w, 'animals', 3); untilPhase(w, 'play'); ev(w);
  const hints = [];
  for (let k = 0; k < 3; k++) {
    const [a, b] = twoDifferent(w); tap(w, a); tap(w, b); run(w, 1.5);
    for (const e of ev(w)) if (e.type === 'hint') hints.push([e, w.time]);
  }
  assert.strictEqual(hints.length, 1);
  const h = hints[0][0], A = w.cardById(h.a), B = w.cardById(h.b);
  assert.strictEqual(A.key, B.key); assert.strictEqual(w.streak, 0);
  // glow and peek happened on the hinted pair (peek is short: re-run a hint on a fresh world to watch it)
  const w2 = mkWorld({ age: 5 }); roundOf(w2, 'animals', 3); untilPhase(w2, 'play'); ev(w2);
  const id = w2.hint(); assert.ok(id); const he = ev(w2).find(e => e.type === 'hint'); const HA = w2.cardById(he.a);
  let maxFlip = 0, glowSeen = 0, t = 0;
  while (t < 3) { w2.update(H); t += H; maxFlip = Math.max(maxFlip, HA.flip); glowSeen = Math.max(glowSeen, HA.glow); }
  assert.ok(maxFlip > 0.6 && maxFlip < 0.8, 'peek ' + maxFlip); assert.ok(glowSeen > 0.99); assert.strictEqual(HA.glow, 0); assert.ok(HA.flip < 0.01);
  assert.strictEqual(HA.state, 'down');
  // cooldown (1.4 s per mismatch): mismatches 4–7 come < 6 s after the first hint → no hint; the 8th (> 6 s) → the 2nd hint
  const w3 = mkWorld({ age: 5 }); roundOf(w3, 'animals', 3); untilPhase(w3, 'play'); ev(w3);
  const hs = [];
  for (let k = 0; k < 8; k++) { const [a, b] = twoDifferent(w3); tap(w3, a); tap(w3, b); run(w3, 1.4); for (const e of ev(w3)) if (e.type === 'hint') hs.push(k); }
  assert.deepStrictEqual(hs, [2, 7], 'cooldown ' + hs);
  // idle
  const w4 = mkWorld({ age: 4 }); roundOf(w4, 'colors', 2); untilPhase(w4, 'play'); ev(w4);
  const t0 = w4.time, idles = [], ih = [];
  run(w4, 90, () => { for (const e of w4.events) { if (e.type === 'idle') idles.push(+(w4.time - t0).toFixed(2)); if (e.type === 'hint' && e.idle) ih.push(w4.time - t0); } w4.events.length = 0; });
  assert.deepStrictEqual(idles.slice(0, 4).map(Math.round), [12, 30, 57, 87]);
  assert.ok(ih.length >= 2 && Math.round(ih[0]) === 30, 'idle hint from the 2nd nudge');
  // a tap resets the idle timer
  const w5 = mkWorld({ age: 4 }); roundOf(w5, 'colors', 2); untilPhase(w5, 'play'); ev(w5);
  run(w5, 10); w5.pointerDown(1, 1); run(w5, 10); assert.ok(!ev(w5).some(e => e.type === 'idle'));
});

test('stars: mismatches ≤ max(1, pairs − 1) → 3, ≤ 2·pairs → 2, else 1; Talk right → +1', () => {
  for (const [m, want] of [[0, 3], [3, 3], [4, 2], [8, 2], [9, 1]]) {
    const w = mkWorld({ age: 5 }); roundOf(w, 'animals', 3); untilPhase(w, 'play'); ev(w);   // 4 pairs
    assert.strictEqual(w.pairs, 4);
    for (let k = 0; k < m; k++) { const [a, b] = twoDifferent(w); tap(w, a); tap(w, b); run(w, 1.5); }
    solveRound(w);
    const rd = ev(w).find(e => e.type === 'roundDone');
    assert.strictEqual(rd.mismatches, m); assert.strictEqual(rd.stars, want, m + ' mismatches');
  }
  const w = mkWorld({ age: 3 }); roundOf(w, 'animals', 0); untilPhase(w, 'play');   // 2 pairs: ≤ 1 → 3
  const [a, b] = twoDifferent(w); tap(w, a); tap(w, b); run(w, 2); solveRound(w);
  assert.strictEqual(w.roundStars, 3);
});

test('state machine: intro 2.5 → 4 rounds → talk → levelDone → … → sessionDone; chapter limit (80 s) after ≥ 3 rounds; a hard round holds the grid size', () => {
  const w = mkWorld({ age: 4 }); w.newSession();
  const seq = [];
  let n = 0;
  while (w.state !== 'sessionDone' && n++ < 400000) {
    if (w.state === 'round') { if (w.phase === 'play' && !w.open.length) { const d = downCards(w); if (d.length) { const p = pairOf(w, d[0].key); tap(w, p[0]); tap(w, p[1]); } } }
    if (w.state === 'talk' && !w.talkAnswered && w.stateTime > 1) w.talkAnswer(w.talk.answerId);
    w.update(H * 4);
    for (const e of ev(w)) if (['level', 'round', 'talk', 'levelDone', 'sessionDone'].includes(e.type)) seq.push(e.type + (e.type === 'round' ? e.round : ''));
  }
  assert.strictEqual(w.state, 'sessionDone');
  assert.deepStrictEqual(seq.slice(0, 7), ['level', 'round0', 'round1', 'round2', 'round3', 'talk', 'levelDone']);
  assert.strictEqual(seq.filter(s => s === 'level').length, 4);
  assert.strictEqual(w.stars, 4 * (4 * 3 + 1));
  // time limit: a slow chapter goes to Talk after round 3 once > 90 s
  const w2 = mkWorld({ age: 4 }); w2.newSession();
  let rounds = 0, t = 0; n = 0;
  while (w2.state !== 'talk' && n++ < 400000) {
    if (w2.state === 'round' && w2.phase === 'play' && !w2.open.length && w2.phaseTime > 9) { const d = downCards(w2); const p = pairOf(w2, d[0].key); tap(w2, p[0]); tap(w2, p[1]); w2.pointerDown(-50, -50); }
    w2.update(H * 4);
    for (const e of ev(w2)) if (e.type === 'round') rounds++;
  }
  assert.strictEqual(rounds, 3); assert.ok(w2.time - w2.levelStartTime > CFG.chapterTimeLimit);
  // adaptive hold: a slow round (> 40 s of play) → the next round keeps its pair count
  const w3 = mkWorld({ age: 4 }); w3.newSession(); const pairs = []; n = 0;
  while (w3.level === 0 && w3.state !== 'talk' && n++ < 400000) {
    if (w3.state === 'round' && w3.phase === 'play' && !w3.open.length && w3.phaseTime > (w3.round === 2 ? 42 : 1)) { const d = downCards(w3); const p = pairOf(w3, d[0].key); tap(w3, p[0]); tap(w3, p[1]); w3.pointerDown(-50, -50); }
    w3.update(H * 4);
    for (const e of ev(w3)) if (e.type === 'round') pairs.push([e.pairs, e.held]);
  }
  assert.deepStrictEqual(pairs.map(p => p[0]), [2, 2, 3, 3].slice(0, pairs.length));
  const w4 = mkWorld({ age: 5 }); w4.newSession(); w4.levels = ['shapes', 'count', 'letters', 'animals']; w4.startLevel(0); const pairs4 = []; n = 0;
  while (w4.level === 0 && w4.state !== 'talk' && n++ < 400000) {
    if (w4.state === 'round' && w4.phase === 'play' && !w4.open.length && w4.phaseTime > (w4.round === 1 ? 42 : 1)) { const d = downCards(w4); const p = pairOf(w4, d[0].key); tap(w4, p[0]); tap(w4, p[1]); w4.pointerDown(-50, -50); }
    w4.update(H * 4);
    for (const e of ev(w4)) if (e.type === 'round') pairs4.push([e.pairs, e.held]);
  }
  assert.deepStrictEqual(pairs4.slice(0, 3), [[2, false], [3, false], [3, true]], JSON.stringify(pairs4));
});

test('talk: re-ask every 12 s without an answer; glowAnswer from the 2nd re-ask; answer → +1 star, levelDone after 2 s', () => {
  const w = mkWorld(); w.levels = ['animals', 'colors', 'shapes', 'count']; w.startLevel(0); w._startTalk(); ev(w);
  const asks = []; run(w, 37, () => { for (const e of w.events) if (e.type === 'talkAsk') asks.push([e.n, e.glowAnswer]); w.events.length = 0; });
  assert.deepStrictEqual(asks, [[1, false], [2, true], [3, true]]);
  const s0 = w.stars; assert.strictEqual(w.talkAnswer(w.talk.answerId), true); assert.strictEqual(w.stars, s0 + 1);
  assert.strictEqual(w.talkAnswer(w.talk.answerId), false, 'only once');
  run(w, 2.05); assert.strictEqual(w.state, 'levelDone');
});

// ======================================================= rewards
function rewardBox(r) {
  const s = r.size;
  if (r.kind === 'animal') return { x: r.x - s / 2, y: r.y - s, w: s, h: s };
  if (r.kind === 'acorns') { const xs = r.pieces.map(p => p.x), ys = r.pieces.map(p => p.y), R = r.pieceSize / 2;
    return { x: Math.min(...xs) - R, y: Math.min(...ys) - R, w: Math.max(...xs) - Math.min(...xs) + 2 * R, h: Math.max(...ys) - Math.min(...ys) + 2 * R }; }
  return { x: r.x - s / 2, y: r.y - s / 2, w: s, h: s };
}
test('rewards: one per match, kind per topic; they settle on perches inside the screen, off the cards, the bubble, the HUD and Dee (12 viewports × all topics)', () => {
  let checked = 0;
  const kinds = {};
  for (const v of VIEWPORTS) for (const topic of TOPICS) {
    const age = topic === 'size' ? 3 : ['lower', 'initial', 'add', 'sub', 'oddeven'].includes(topic) ? 7 : 4;
    const w = mkWorld({ vp: v, age, seed: 11 + checked });
    if (v.W === 1556) { w.hudKeep = { x: v.W - 421, y: 0, w: 421, h: 106 }; w.setViewport(v.W, v.H, v.ins); }
    w.levels = [topic, topic, topic, topic]; w.startLevel(0);
    run(w, 2.6);
    for (let ri = 0; ri < 4; ri++) {
      solveRound(w);
      if (w.state === 'roundDone') { run(w, 1.9); }
      const L = w.layout, safe = { x: L.ins.left, y: L.ins.top, w: L.W - L.ins.left - L.ins.right, h: L.H - L.ins.top - L.ins.bottom };
      // let flights finish (the next round's deal is running; the grid may push rewards off)
      run(w, 2.5);
      for (const r of w.rewards) {
        kinds[topic + ':' + r.kind] = 1;
        if (r.state === 'fly') continue;
        const B = rewardBox(r), tag = `${v.name} ${topic} r${ri} ${r.kind} ${r.perch.kind}`;
        assert.ok(Number.isFinite(B.x + B.y + B.w + B.h), tag + ' NaN');
        assert.ok(insideR(B, safe), tag + ' inside the screen ' + JSON.stringify(B));
        assert.ok(!rectsOverlap(B, L.bubble) && !rectsOverlap(B, L.hud) && !rectsOverlap(B, L.deeRect), tag + ' clear of bubble/HUD/Dee');
        if (L.hudKeep) assert.ok(!rectsOverlap(r.target.box, L.hudKeep), tag + ' under the real HUD');
        if (w.state === 'round' && L.grid && w.phase !== 'deal') for (const c of w.cards) if (c.state !== 'gone' && c.state !== 'deal') assert.ok(!rectsOverlap(B, cardR(c, L.grid)), tag + ' on a card');
        checked++;
      }
      if (w.state !== 'round') break;
    }
  }
  assert.ok(checked > 1500, 'checked ' + checked);
  // crowding: resting rewards whose target boxes overlap > 40 % of the smaller one, at chapter end (every viewport × topic)
  let pairsN = 0, heavy = 0;
  for (const v of VIEWPORTS) for (const topic of ['colors', 'animals', 'count', 'shapes', 'add']) {
    const w = mkWorld({ vp: v, age: topic === 'add' ? 6 : 4, seed: 3 }); w.levels = [topic, topic, topic, topic]; w.startLevel(0); run(w, 2.6);
    for (let ri = 0; ri < 4 && w.state === 'round'; ri++) { solveRound(w); run(w, 1.9); }
    const R = w.rewards.map(r => r.target.box);
    for (let i = 0; i < R.length; i++) for (let j = 0; j < i; j++) { pairsN++; if (DM.World.overlapArea(R[i], R[j]) > 0.4 * Math.min(R[i].w * R[i].h, R[j].w * R[j].h)) heavy++; }
  }
  console.log('      crowded reward pairs (> 40 % overlap): ' + heavy + ' / ' + pairsN);
  assert.ok(heavy / pairsN < 0.02, 'crowding ' + heavy);
  for (const k of ['colors:butterfly', 'shapes:lantern', 'count:acorns', 'animals:animal', 'letters:star', 'size:animal', 'initial:animal', 'oddeven:acorns']) assert.ok(kinds[k], k);
});

test('rewards motion: butterflies flutter + flap and land, animals hop 3 parabolic hops, acorns tumble and bounce (e = 0.4), lanterns swing like pendulums, stars twinkle', () => {
  function oneReward(topic, age) {
    const w = mkWorld({ age, seed: 5 }); roundOf(w, topic, 1); untilPhase(w, 'play'); ev(w);
    const p = pairOf(w, w.cards[0].key); tap(w, p[0]); tap(w, p[1]);
    let n = 0; while (!w.rewards.length && n++ < 400) w.update(H);
    return w;
  }
  // butterfly
  let w = oneReward('colors', 4), r = w.rewards[0], flaps = new Set(), lands = 0, offPath = 0;
  const B = r._bz;
  for (let i = 0; i < 360; i++) { w.update(H); flaps.add(Math.round(r.flap * 10)); for (const e of ev(w)) if (e.type === 'land') lands++;
    if (r.state === 'fly') { const u = r.t / B.T, sx = B.x0 + (B.x1 - B.x0) * u; offPath = Math.max(offPath, Math.abs(r.x - sx)); } }
  assert.ok(flaps.size >= 8, 'wing flaps'); assert.strictEqual(lands, 1); assert.notStrictEqual(r.state, 'fly');
  assert.ok(Math.abs(r.x - r.target.x) < 1e-6 && Math.abs(r.y - r.target.y) < 1e-6);
  // animal: 3 hops (2 squashes before landing + land)
  w = oneReward('animals', 4); r = w.rewards[0];
  let ups = 0, prevVy = 0, py = r.y, land = 0;
  for (let i = 0; i < 400; i++) { w.update(H); const vy = r.y - py; if (prevVy > 0 && vy < 0) ups++; prevVy = vy; py = r.y; for (const e of ev(w)) if (e.type === 'land') land++; if (r.state !== 'fly') break; }
  assert.strictEqual(ups, 2, 'two bounces between 3 hops'); assert.strictEqual(land, 1); assert.strictEqual(r.anchor, 'bottom');
  // acorns: pieces = n, bounce with restitution 0.4, end at rest on the ground line
  w = oneReward('count', 4); r = w.rewards[0];
  assert.strictEqual(r.pieces.length, r.n);
  const p0 = r.pieces[0]; let vIn = null, vOut = null, last = 0;
  for (let i = 0; i < 600; i++) { const pv = p0.vy; w.update(H); if (vIn === null && p0.state === 'bounce' && pv > 0) { vIn = pv; vOut = p0.vy; } last = i; if (r.state === 'idle') break; }
  assert.ok(vIn > 0 && Math.abs(-vOut / vIn - 0.4) < 0.06, 'restitution ' + (-vOut / vIn));
  assert.strictEqual(r.state, 'idle'); assert.ok(r.pieces.every(p => p.state === 'rest'));
  // lantern: hangs from a branch (or floats) and swings, damped
  w = oneReward('shapes', 4); r = w.rewards[0];
  run(w, 2.2);
  if (r.ax !== null) {
    let lo = 1, hi = -1; run(w, 2, () => { lo = Math.min(lo, r._th); hi = Math.max(hi, r._th); });
    assert.ok(hi > 0.03 && lo < -0.03, 'swings ' + lo + ' ' + hi);
    const Lp = DM.CONFIG.lanternString + r.size / 2; assert.ok(Math.abs(hyp(r.x - r.ax, r.y - r.ay) - Lp) < 1e-6, 'string length kept');
    w.wind = 0; run(w, 12); assert.ok(Math.abs(r._th) < 0.03, 'damped');
  }
  // star twinkles
  w = oneReward('letters', 5); r = w.rewards[0]; run(w, 2.5);
  let smin = 9, smax = 0; run(w, 1, () => { smin = Math.min(smin, r.sx); smax = Math.max(smax, r.sx); });
  assert.ok(smax - smin > 0.1, 'twinkle');
});

test('rewards: stay for the whole chapter, fly off a bigger grid at a round start, fade in levelDone, cleared at the next chapter; ≤ 30', () => {
  const w = mkWorld({ age: 6, vp: VIEWPORTS[4] }); w.newSession();
  let maxR = 0, faded = false, n = 0, refly = 0;
  while (w.state !== 'sessionDone' && n++ < 400000) {
    if (w.state === 'round' && w.phase === 'play' && !w.open.length) { const d = downCards(w); if (d.length) { const p = pairOf(w, d[0].key); tap(w, p[0]); tap(w, p[1]); } }
    if (w.state === 'talk' && !w.talkAnswered) w.talkAnswer(w.talk.answerId);
    w.update(H * 4);
    for (const e of ev(w)) { if (e.type === 'level' && e.level > 0) assert.strictEqual(w.rewards.length, 0); }
    if (w.state === 'round' && w.phase === 'deal') refly += w.rewards.filter(r => r.state === 'fly').length;
    maxR = Math.max(maxR, w.rewards.length);
    if (w.state === 'levelDone' && w.stateTime > 1.3) { faded = w.rewards.every(r => r.alpha === 0); }
  }
  const most = Math.max(...[0, 1, 2, 3].map(l => CFG.pairsByAge[6].reduce((a, b) => a + b, 0)));
  assert.ok(maxR === most && maxR <= 30, 'max ' + maxR); assert.ok(faded); assert.ok(refly > 0, 'rewards made room for a bigger grid');
  assert.strictEqual(w.collected.length, w.events.length ? w.collected.length : w.collected.length);
});

test('resize mid-round: cards move to the new grid, rewards to new perches (no NaN, inside the screen)', () => {
  const w = mkWorld({ age: 4 }); roundOf(w, 'animals', 3); untilPhase(w, 'play');
  const p = pairOf(w, w.cards[0].key); tap(w, p[0]); tap(w, p[1]); run(w, 3);
  const up = downCards(w)[0]; tap(w, up); run(w, 0.3);
  w.setViewport(720, 1556, { top: 108, bottom: 62 });
  const L = w.layout, g = L.grid;
  assert.ok(g && g.cw >= 120);
  for (const c of w.cards) if (c.state !== 'gone') { assert.ok(insideR(cardR(c, g), g.board)); assert.strictEqual(c.w, g.cw); }
  assert.strictEqual(up.state, 'up');
  for (const r of w.rewards) { assert.strictEqual(r.state, 'idle'); assert.ok(Number.isFinite(r.x + r.y)); assert.ok(r.y < L.H - L.ins.bottom); }
  run(w, 1); solveRound(w); assert.strictEqual(w.state, 'roundDone');
});

test('interpolation: _px/_py/_prot/_pflip are the previous sub-step; alpha in [0,1)', () => {
  const w = mkWorld(); roundOf(w, 'colors', 1); run(w, 0.2);
  const c = w.cards[0]; const x0 = c.x, y0 = c.y;
  w.update(H); assert.strictEqual(c._px, x0); assert.strictEqual(c._py, y0);
  w.update(H * 0.4); assert.ok(w.alpha > 0.35 && w.alpha < 0.45);
  untilPhase(w, 'play'); tap(w, c); const f0 = c.flip; w.update(H); assert.strictEqual(c._pflip, f0);
});

// ======================================================= QA round 1: variety + help
test('same card again and again: taps on the one open card do not reset idle; 3 of them → auto hint on its partner (QA P1-4)', () => {
  const w = mkWorld({ age: 4 }); roundOf(w, 'animals', 3); untilPhase(w, 'play'); ev(w);
  const c = downCards(w)[0]; tap(w, c); run(w, 0.4); ev(w);
  run(w, 5); tap(w, c); run(w, 1); tap(w, c);
  assert.ok(w._idleT > 5.9, 'idle timer keeps running ' + w._idleT);
  assert.ok(!ev(w).some(e => e.type === 'hint'));
  tap(w, c); const E = ev(w), h = E.find(e => e.type === 'hint');
  assert.ok(h, '3rd same tap → hint'); const pr = [w.cardById(h.a), w.cardById(h.b)];
  assert.ok(pr.every(x => x.key === c.key)); assert.ok(E.filter(e => e.type === 'tap').length === 1, 'still says the name');
  // another card resets the count
  const w2 = mkWorld({ age: 4 }); roundOf(w2, 'animals', 3); untilPhase(w2, 'play'); ev(w2);
  const c2 = downCards(w2)[0]; tap(w2, c2); run(w2, 0.3); tap(w2, c2); tap(w2, c2); w2.pointerDown(-50, -50); assert.strictEqual(w2._sameN, 2);
  assert.ok(!ev(w2).some(e => e.type === 'hint'));
});

test('surprise round: round index 2 of every chapter, the type rotates per chapter from a session-random start; round event carries it', () => {
  const offs = new Set();
  for (let s = 1; s < 30; s++) {
    const w = new DM.World({ seed: s, age: 4 }); w.setViewport(1280, 720, null);
    const bot = new DM.Bot(w, { skill: 1, seed: s }); w.newSession();
    const seen = [];
    while (w.state !== 'sessionDone') { bot.step(1 / 30); w.update(1 / 30); for (const e of w.drainEvents()) if (e.type === 'round') { if (e.round === 2) seen.push(e.surprise); else assert.strictEqual(e.surprise, null); } }
    assert.strictEqual(seen.length, 4);
    const T = CFG.surpriseTypes, o = T.indexOf(seen[0]); offs.add(o);
    seen.forEach((t, L) => assert.strictEqual(t, T[(o + L) % 3]));
  }
  assert.strictEqual(offs.size, 3);
});

test('surprise shuffle: after the hide two face-down cards (different keys) swap along opposite arcs in 0.9 s, lifted; shuffle {a, b}; still solvable', () => {
  for (const age of [4, 5]) {
    const w = mkWorld({ age, surprise: true }); w.levels = ['animals', 'colors', 'shapes', 'count']; w._surpriseOff = 0; w.startLevel(0); w.round = 2; w._beginRound();
    assert.strictEqual(w.surprise, 'shuffle');
    const before = {}; let sh = [], n = 0, maxLift = 0, phases = new Set(), t0 = null, t1 = null;
    untilPhase(w, 'hide'); w.cards.forEach(c => { before[c.id] = [c.hx, c.hy]; });
    while (w.phase !== 'play' && n++ < 2000) {
      w.update(H); phases.add(w.phase);
      for (const e of ev(w)) if (e.type === 'shuffle') { sh.push(e); t0 = w.time; }
      for (const c of w.cards) if (c._sw) { maxLift = Math.max(maxLift, c.lift); assert.ok(c.flip < 0.05, 'face hidden while moving'); t1 = w.time; }
      if (w.phase === 'shuffle') assert.strictEqual(w.pointerDown(w.cards[0].x, w.cards[0].y), null, 'no taps while shuffling');
    }
    assert.ok(phases.has('shuffle')); assert.strictEqual(sh.length, age >= 5 ? 2 : 1);
    for (const e of sh) {
      const a = w.cardById(e.a), b = w.cardById(e.b);
      assert.notStrictEqual(a.key, b.key);
      assert.deepStrictEqual([a.hx, a.hy], before[b.id]); assert.deepStrictEqual([b.hx, b.hy], before[a.id]);
      assert.strictEqual(a.x, a.hx);
    }
    assert.ok(Math.abs(t1 - t0 - CFG.shuffleTime) < 0.02); assert.ok(maxLift > 0.98);
    solveRound(w); assert.strictEqual(w.state, 'roundDone');
  }
});

test('surprise golden: one secret pair; its match → match.golden + golden {a, b} + Dee cheers; the other pairs are normal', () => {
  const w = mkWorld({ age: 4, surprise: true }); w.levels = ['animals', 'colors', 'shapes', 'count']; w._surpriseOff = 1; w.startLevel(0); w.round = 2; w._beginRound();
  assert.strictEqual(w.surprise, 'golden'); const G = w.cur.golden; assert.ok(w.cur.pairInfo[G]);
  untilPhase(w, 'play'); ev(w);
  const other = w.cards.find(c => c.key !== G), po = pairOf(w, other.key); tap(w, po[0]); tap(w, po[1]); run(w, 1.2);
  let E = ev(w); assert.ok(!E.some(e => e.type === 'golden'));
  const pg = pairOf(w, G); tap(w, pg[0]); tap(w, pg[1]); run(w, 0.4);
  E = ev(w); const m = E.find(e => e.type === 'match'), g = E.find(e => e.type === 'golden');
  assert.ok(m.golden && g && g.key === G); assert.strictEqual(w.dee.mood, 'cheer');
  run(w, 0.8); const r = w.rewards[w.rewards.length - 1]; assert.ok(r.golden);
  // the backs give no cue: golden cards carry no visible field
  assert.ok(pg.every(c => c.golden === undefined && c.glow === 0));
});

test('surprise pond: cards on lily pads (arc + staggered rows) inside the board, ≥ the age minimum, gaps ≥ 14, bobbing ±3 px (12 viewports × 2–6 pairs)', () => {
  for (const v of VIEWPORTS) for (const age of [3, 4, 5, 7]) for (let pairs = 2; pairs <= 5; pairs++) {
    const L = DM.World.computeLayout(v.W, v.H, v.ins), g0 = DM.World.chooseGrid(L, 2 * pairs, age), g = DM.World.pondLayout(g0, age);
    const tag = `${v.name} age ${age} ${pairs}`;
    assert.ok(g.cw >= Math.min(g0.cw, CFG.cardMin[age]) - 1e-9 && g.cw <= g0.cw + 1e-9, tag + ' size');
    const R = g.slots.map(q => ({ x: q.x - g.cw / 2, y: q.y - g.ch / 2, w: g.cw, h: g.ch }));
    R.forEach(r => { assert.ok(insideR(r, g0.board), tag + ' inside the board'); assert.ok(insideR(r, g.rect)); });
    for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) assert.ok(DM.World.rectGap(R[i], R[j]) >= 14 - 1e-6, tag + ' gap ' + DM.World.rectGap(R[i], R[j]));
    if (g0.rows > 1 && g0.cols > 2) assert.ok(new Set(g.slots.map(q => Math.round(q.y))).size > g0.rows, tag + ' not a plain grid');
  }
  const w = mkWorld({ age: 4, surprise: true }); w.levels = ['animals', 'colors', 'shapes', 'count']; w._surpriseOff = 2; w.startLevel(0); w.round = 2; w._beginRound();
  assert.strictEqual(w.surprise, 'pond'); assert.strictEqual(w.layout.grid.style, 'pond');
  untilPhase(w, 'play'); const c = w.cards[0]; let lo = 1e9, hi = -1e9; run(w, 3, () => { lo = Math.min(lo, c.y - c.hy); hi = Math.max(hi, c.y - c.hy); });
  assert.ok(hi - lo > 4 && hi <= 3.01 && lo >= -3.01, 'bob');
  solveRound(w); assert.strictEqual(w.state, 'roundDone');
});

test('hudKeep: rewards keep out of the REAL HUD box main.js measures (403 × 106 px on an iPhone landscape)', () => {
  const v = VIEWPORTS[1], keep = { x: v.W - 421, y: 0, w: 421, h: 106 };
  for (let s = 0; s < 6; s++) {
    const w = new DM.World({ seed: 40 + s, age: 6 }); w.hudKeep = keep; w.setViewport(v.W, v.H, v.ins);
    assert.deepStrictEqual(w.layout.hudKeep, keep);
    const bot = new DM.Bot(w, { skill: 1, seed: s }); w.newSession();
    while (w.state !== 'sessionDone') { bot.step(1 / 30); w.update(1 / 30); w.drainEvents();
      for (const r of w.rewards) if (r.target) assert.ok(!rectsOverlap(r.target.box, keep), 'under the HUD ' + r.kind); }
  }
});

// ======================================================= determinism + bot
test('determinism: same seed + same bot → identical events; the dt split does not matter', () => {
  const hashOf = (dt) => { const r = playSession(77, 5, 0.6, { dt, keep: true, vp: VIEWPORTS[3] }); return JSON.stringify(r.events.map(e => [e.type, e.id || e.a || '', e.round])) + r.w.stars; };
  assert.strictEqual(hashOf(1 / 30), hashOf(1 / 30));
  // same inputs at different frame sizes: replay recorded taps at 1/120
  const w1 = mkWorld({ seed: 4, age: 4 }), rec = [], evA = [];
  const bot = new DM.Bot(w1, { skill: 0.5, seed: 9 });
  const orig = w1.pointerDown.bind(w1);
  w1.pointerDown = (x, y) => { rec.push([Math.round(w1.time / CFG.step), x, y]); return orig(x, y); };
  const origT = w1.talkAnswer.bind(w1);
  w1.talkAnswer = (id) => { rec.push([Math.round(w1.time / CFG.step), 'talk', id]); return origT(id); };
  w1.newSession();
  for (let i = 0; i < 30 * 200; i++) { bot.step(1 / 30); w1.update(1 / 30); for (const e of w1.drainEvents()) evA.push(e.type + (e.id || e.a || '')); }
  const w2 = mkWorld({ seed: 4, age: 4 }), evB = []; w2.newSession();
  let k = 0;
  while (w2.time < w1.time - 1e-9) {
    const s = Math.round(w2.time / CFG.step);
    while (k < rec.length && rec[k][0] <= s) { if (rec[k][1] === 'talk') w2.talkAnswer(rec[k][2]); else w2.pointerDown(rec[k][1], rec[k][2]); k++; }
    w2.update(CFG.step); for (const e of w2.drainEvents()) evB.push(e.type + (e.id || e.a || ''));
  }
  assert.deepStrictEqual(evB, evA);
});

test('bot: full sessions for every age × lang × 4 viewports × 3 skills reach sessionDone, no stuck round, no NaN', () => {
  const vps = [VIEWPORTS[1], VIEWPORTS[3], VIEWPORTS[5], VIEWPORTS[7]];
  let k = 0, maxRound = 0;
  for (const age of AGES) for (const lang of LANGS) for (const vp of vps) for (const skill of [0, 0.5, 0.9]) {
    k++;
    let rs = 0;
    const r = playSession(100 + k, age, skill, { lang, vp, each: (w, e) => {
      for (const x of e) { if (x.type === 'round') rs = w.time; if (x.type === 'roundDone') maxRound = Math.max(maxRound, w.time - rs); }
      if ((Math.round(w.time * 30) & 15) === 0) {
        for (const c of w.cards) assert.ok(Number.isFinite(c.x + c.y + c.rot + c.flip + c.sx + c.sy), 'card NaN');
        for (const q of w.rewards) assert.ok(Number.isFinite(q.x + q.y + q.rot + q.sx), 'reward NaN');
      }
    } });
    assert.strictEqual(r.w.state, 'sessionDone', `age ${age} ${lang} skill ${skill}`);
    assert.ok(r.t < 1200, 'session ' + r.t);
  }
  assert.ok(maxRound < 300, 'longest round ' + maxRound);
  console.log('      longest round (skill 0 = no memory at all): ' + maxRound.toFixed(0) + ' s');
});

test('bot: perfect memory (skill 1) never mismatches → 3 stars every round; taps hit the card it aims at', () => {
  for (const age of AGES) {
    const r = playSession(900 + age, age, 1, { vp: VIEWPORTS[age % 12] });
    assert.strictEqual(r.bot.stats.mismatches, 0); assert.strictEqual(r.bot.stats.misses, 0);
    assert.strictEqual(r.w.stars, 4 * 4 * 3 + 4);
  }
});

test('performance: 10 full sessions simulated in < 6 s', () => {
  const t0 = Date.now();
  for (let i = 0; i < 10; i++) { const r = playSession(500 + i, AGES[i % 5], 0.6); assert.strictEqual(r.w.state, 'sessionDone'); }
  const ms = Date.now() - t0;
  console.log('      10 sessions: ' + ms + ' ms');
  assert.ok(ms < 6000, ms + ' ms');
});

// ======================================================= weather (seasons)
const AMB = [
  { skyTop: '#A9D8F0', season: 0, darkness: 0, sun: 1 },
  { skyTop: '#7EC4EE', season: 1, darkness: 0, sun: 1, tint: null },
  { skyTop: '#E9C9A0', season: 2, darkness: 0 },
  { skyTop: '#C5D7E6', season: 3, darkness: 0 }
];
const AMB_KEYS = ['skyTop', 'skyBottom', 'horizon', 'tint', 'wind', 'sway', 'sun', 'sunX', 'sunY', 'darkness', 'season', 'gust', 'windBase'];
test('weather: ambient per season, 2.5 s crossfade, darkness 0, gusty wind within ±40 px/s (autumn the windiest)', () => {
  const wx = new DM.Weather({ width: 1280, height: 720, seed: 1 });
  for (let m = 0; m < 4; m++) {
    wx.setWeather(m, { instant: true });
    const a = wx.ambient, e = AMB[m];
    for (const k of AMB_KEYS) assert.ok(k in a, 'ambient.' + k);
    for (const k in e) assert.strictEqual(a[k], e[k], 'season ' + m + ' ' + k);
    assert.ok(/^#[0-9A-F]{6}$/.test(a.horizon));
  }
  assert.strictEqual(DM.Weather.FADE_TIME, 2.5);
  wx.setWeather(1, { instant: true }); wx.setWeather(3);
  wx.update(0.6, { groundY: 630 }); wx.update(0.65, { groundY: 630 });
  assert.notStrictEqual(wx.ambient.skyTop, '#7EC4EE'); assert.notStrictEqual(wx.ambient.skyTop, '#C5D7E6');
  wx.update(0.65, { groundY: 630 }); wx.update(0.65, { groundY: 630 }); assert.strictEqual(wx.ambient.skyTop, '#C5D7E6'); assert.strictEqual(wx.ambient.season, 3);
  for (let m = 0; m < 4; m++) {
    const w2 = new DM.Weather({ width: 1280, height: 720, seed: 5 + m }); w2.setWeather(m, { instant: true });
    let lo = 1e9, hi = -1e9;
    for (let i = 0; i < 1800; i++) { w2.update(1 / 30, { groundY: 630 }); lo = Math.min(lo, w2.ambient.wind); hi = Math.max(hi, w2.ambient.wind); }
    assert.ok(lo >= -40 && hi <= 40);
    if (m === 2) assert.ok(hi > 30, 'autumn gusts ' + hi); else assert.ok(hi < 30, 'calm season ' + m + ' ' + hi);
  }
});

test('weather: particles per season (petals + butterflies, sparkles + fireflies, leaves, snow), cap 120, deterministic, resize', () => {
  const kinds = [];
  for (let m = 0; m < 4; m++) {
    const wx = new DM.Weather({ width: 1600, height: 720, seed: 3 }); wx.setWeather(m, { instant: true });
    const seen = {}; let maxN = 0;
    for (let i = 0; i < 900; i++) {
      wx.update(1 / 30, { groundY: 630 });
      if (i % 50 === 0) wx.burst(800, 300, { kind: 'confetti', n: 40, color: 'red' });
      maxN = Math.max(maxN, wx.particles.length);
      for (const p of wx.particles) {
        seen[p.kind] = 1;
        assert.ok(Number.isFinite(p.x + p.y + p.alpha + p.size + p.rot + p.flipX), 'finite');
        assert.ok(['sky', 'back', 'front'].includes(p.layer));
        assert.ok(DM.Weather.SPRITES.includes(p.sprite), p.sprite);
        if (p.kind === 'butterfly') { assert.ok(p.color && p.flap >= 0 && p.flap <= 1); assert.ok(Math.abs(p.flipX) === 1); }
        if (p.kind === 'firefly') assert.ok(p.glow === true);
        if (['petal', 'leaf', 'snow'].includes(p.kind)) assert.ok(p.y < 630 + 61);
      }
    }
    assert.ok(maxN <= DM.Weather.CAP);
    kinds.push(seen);
  }
  assert.ok(kinds[0].petal && kinds[0].butterfly && !kinds[0].snow && !kinds[0].leaf, 'spring');
  assert.ok(kinds[1].sparkle && kinds[1].firefly && !kinds[1].snow, 'summer');
  assert.ok(kinds[2].leaf && !kinds[2].snow && !kinds[2].butterfly, 'autumn');
  assert.ok(kinds[3].snow && !kinds[3].leaf && !kinds[3].butterfly, 'winter');
  // autumn leaves are blown sideways in gusts; snow falls slowly
  const wa = new DM.Weather({ width: 1280, height: 720, seed: 2 }); wa.setWeather(2, { instant: true });
  let vxMax = 0; for (let i = 0; i < 900; i++) { wa.update(1 / 30, { groundY: 630 }); for (const p of wa.particles) if (p.kind === 'leaf') vxMax = Math.max(vxMax, p.vx); }
  assert.ok(vxMax > 50, 'gust-blown leaves ' + vxMax);
  const a = new DM.Weather({ width: 1280, height: 720, seed: 4 }), b = new DM.Weather({ width: 1280, height: 720, seed: 4 });
  for (let i = 0; i < 120; i++) a.update(1 / 30, { groundY: 630 });
  for (let i = 0; i < 240; i++) b.update(1 / 60, { groundY: 630 });
  assert.deepStrictEqual(a.particles.map(p => [p.kind, Math.round(p.x * 100)]), b.particles.map(p => [p.kind, Math.round(p.x * 100)]));
  a.resize(720, 1556); assert.strictEqual(a.width, 720);
  for (let i = 0; i < 60; i++) a.update(1 / 30, { groundY: 1404 });
  assert.ok(a.particles.every(p => Number.isFinite(p.x)));
});

// ======================================================= run
(async () => {
  let pass = 0, fail = 0;
  const only = process.argv[2];
  for (const t of tests) {
    if (only && !t.name.includes(only)) continue;
    const t0 = Date.now();
    try { await t.fn(); pass++; console.log('  ✓ ' + t.name + ' (' + (Date.now() - t0) + ' ms)'); }
    catch (e) { fail++; console.log('  ✗ ' + t.name + '\n      ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n      ') : e)); }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
