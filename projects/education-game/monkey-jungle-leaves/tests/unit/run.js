#!/usr/bin/env node
// Lolo's Jungle Leaf Match — headless unit tests for rng / content / world / weather / bot.
// Run from projects/education-game/monkey-jungle-leaves:   node tests/unit/run.js   (or: node tests/unit/run.js swing)
// (tests/unit/i18n_voice.test.js is the voice engineer's suite and runs on its own.)
'use strict';
const assert = require('assert');
const { load } = require('./load');

const LL = load();
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const H = 1 / 120;
const J = v => JSON.parse(JSON.stringify(v));
assert.deepStrictEqual = ((orig) => (a, b, m) => orig(J(a), J(b), m))(assert.deepStrictEqual);
assert.notDeepStrictEqual = ((orig) => (a, b, m) => orig(J(a), J(b), m))(assert.notDeepStrictEqual);
const hyp = (x, y) => Math.sqrt(x * x + y * y);
const AGES = [3, 4, 5, 6, 7];
const LANGS = ['en', 'vi'];
const TOPICS = LL.Content.TOPICS;
const CFG = LL.CONFIG;

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
  // surprises are off unless asked for (o.surprise), so the flow tests see a plain round
  const cfg = Object.assign(o.surprise ? {} : { surpriseTypes: [] }, o.config || {});
  const w = new LL.World({ seed: o.seed || 1, age: o.age || 4, lang: o.lang || 'en', config: cfg });
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
function waitOpen(w, c) { let n = 0; while (c.open < 0.95 && n++ < 400) w.update(H); }
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
function grow(R, m) { return { x: R.x - m, y: R.y - m, w: R.w + 2 * m, h: R.h + 2 * m }; }
function playSession(seed, age, skill, opts) {
  opts = opts || {};
  const w = new LL.World({ seed, age, lang: opts.lang || 'en', config: opts.config });
  const v = opts.vp || VIEWPORTS[8];
  w.setViewport(v.W, v.H, v.ins);
  const bot = new LL.Bot(w, { skill, seed: seed * 3 + 1 });
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
  const rng = new LL.RNG(seed), hist = [], out = [];
  for (let ri = 0; ri < 4; ri++) { const r = LL.Content.makeRound(topic, { age, lang, rng, roundIndex: ri, history: hist }); hist.push(r.sum); out.push(r); }
  return out;
}
const smooth = u => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
/** Lolo checks: no leaf within 16 px of loloRect (outside the scroll), her hop / flip stays off the leaves, the head box on
 * screen, the hand never in a leaf; while she swings on the vine: on screen, under the HUD, above the floor. */
function loloOk(w, tag) {
  const L = w.layout, g = w.lolo, hb = LL.World.loloHead(w);
  assert.ok(Number.isFinite(hb.x + hb.y + g.lean + g.armA + g.armLen + g.hop + g.squash + g.flipRot + g.dx), tag + ' Lolo NaN');
  assert.ok(insideR(hb, L.safe), tag + ' head on screen ' + JSON.stringify(hb));
  if (L.grid && !(w.state === 'round' && w.phase === 'scroll')) {
    const R = L.loloRect, up = { x: R.x, y: R.y - g.hop, w: R.w, h: R.h };
    for (const c of w.cards) {
      assert.ok(!rectsOverlap(w.cardRect(c), grow(R, 16)), tag + ' leaf within 16 px of Lolo');
      assert.ok(!rectsOverlap(LL.World.leafBounds(c), up), tag + ' swung leaf / hop on Lolo');
      const hx = g.shX + Math.cos(g.armA) * g.armLen, hy = g.shY + Math.sin(g.armA) * g.armLen;
      assert.ok(!(Math.abs(hx - c.x) < c.w / 2 && Math.abs(hy - c.y) < c.h / 2), tag + ' hand in a leaf');
    }
  }
  if (g.hang && g.vine) {
    const V = g.vine, Hh = L.lolo.h;
    assert.ok(V.hy >= L.ins.top + CFG.hudH - 1e-6 && V.hy + CFG.hangBottomK * Hh <= L.groundY + 24 + 1e-6, tag + ' swing y ' + V.hy);
    assert.ok(V.hx - 0.36 * Hh >= L.ins.left - 1e-6 && V.hx + 0.36 * Hh <= L.W - L.ins.right + 1e-6, tag + ' swing x ' + V.hx);
  }
}
/** Finds every pair and runs until the cheer phase starts. */
function solveUntilCheer(w) {
  const keys = [...new Set(w.cards.map(c => c.key))];
  for (const k of keys) { const p = pairOf(w, k); tap(w, p[0]); tap(w, p[1]); run(w, 0.7); }
  let n = 0; while (w.phase !== 'cheer' && n++ < 2000) w.update(H);
  assert.strictEqual(w.phase, 'cheer');
}

// ======================================================= RNG
test('rng: deterministic, ranges, shuffle is a permutation', () => {
  const a = new LL.RNG(42), b = new LL.RNG(42), c = new LL.RNG(43);
  const sa = [], sb = [], sc = [];
  for (let i = 0; i < 500; i++) { sa.push(a.next()); sb.push(b.next()); sc.push(c.next()); }
  assert.deepStrictEqual(sa, sb); assert.notDeepStrictEqual(sa, sc);
  assert.ok(sa.every(v => v >= 0 && v < 1));
  const r = new LL.RNG('x');
  for (let i = 0; i < 1000; i++) { const k = r.int(2, 5); assert.ok(k >= 2 && k <= 5 && k === Math.floor(k)); const f = r.float(-1, 1); assert.ok(f >= -1 && f < 1); }
  const arr = [1, 2, 3, 4, 5, 6, 7, 8]; const sh = r.shuffle(arr.slice());
  assert.deepStrictEqual(sh.slice().sort(), arr);
  assert.strictEqual(new Set(r.sample(arr, 5)).size, 5);
});

// ======================================================= content
test('content: palette, animals, foods, things, age topics / pools, pairs and peek tables as DESIGN §3 / §6.1', () => {
  assert.strictEqual(LL.PALETTE.red.fill, '#E84A4A'); assert.strictEqual(LL.PALETTE.pink.dark, '#C9558A');
  assert.strictEqual(LL.PALETTE.yellow.fill, '#FFD23F'); assert.strictEqual(LL.PALETTE.purple.dark, '#6840A8');
  assert.deepStrictEqual(LL.ANIMALS, ['panda', 'elephant', 'rabbit', 'squirrel', 'bee', 'bird', 'hippo', 'mouse']);
  assert.deepStrictEqual(LL.FOODS, { panda: 'bamboo', elephant: 'peanut', rabbit: 'carrot', squirrel: 'acorn', bee: 'honey', bird: 'worm', hippo: 'watermelon', mouse: 'cheese' });
  assert.deepStrictEqual(LL.FOOD_LIST, ['bamboo', 'peanut', 'carrot', 'acorn', 'honey', 'worm', 'watermelon', 'cheese']);
  assert.strictEqual(new Set(Object.values(LL.FOODS)).size, 8, 'one food per animal');
  assert.strictEqual(LL.HOMES, undefined, 'no HOMES alias'); assert.strictEqual(LL.Content.HOMES, undefined);
  assert.deepStrictEqual(LL.THINGS, ['butterfly', 'balloon', 'flower', 'kite', 'cup', 'boot']);
  assert.deepStrictEqual(LL.AGE_TOPICS, { 3: ['colors', 'shapes', 'size', 'animals'], 4: ['colors', 'shapes', 'count', 'food'], 5: ['shapes', 'count', 'letters', 'food'],
    6: ['lower', 'initial', 'add', 'count'], 7: ['initial', 'add', 'sub', 'oddeven'] });
  assert.ok(TOPICS.includes('food') && !TOPICS.includes('homes'));
  assert.deepStrictEqual(LL.Content.PAIRS, { 3: [2, 2, 3, 3], 4: [2, 3, 4, 4], 5: [3, 4, 5, 5], 6: [3, 4, 5, 6], 7: [3, 4, 5, 6] });
  assert.deepStrictEqual(LL.Content.PEEK, { 3: 3.5, 4: 2.5, 5: 2.0, 6: 1.5, 7: 1.5 });
  assert.deepStrictEqual(LL.Content.topicsFor(2), LL.AGE_TOPICS[3]); assert.deepStrictEqual(LL.Content.topicsFor(9), LL.AGE_TOPICS[7]);
  for (const a of AGES) { assert.ok(LL.AGE_POOLS[a].length >= 5, 'pool ' + a); LL.AGE_TOPICS[a].forEach(t => assert.ok(LL.AGE_POOLS[a].includes(t))); }
  assert.deepStrictEqual(LL.AGE_POOLS[4], ['colors', 'shapes', 'count', 'food', 'animals', 'size']);
  assert.deepStrictEqual(LL.AGE_POOLS[5], ['shapes', 'count', 'letters', 'food', 'animals', 'colors']);
  for (const a of AGES) if (LL.AGE_POOLS[a].includes('food')) assert.strictEqual(CFG.pairsByAge[a][0], 2, 'food warm-up 2 pairs in the game');
  for (const l of LANGS) for (const w of LL.WORDS[l]) { assert.ok(LL.ANIMALS.includes(w.animal)); assert.strictEqual(w.sprite, 'animal_' + w.animal);
    assert.strictEqual(w.word[0].toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC'), w.initial, w.word); }
  assert.deepStrictEqual(LL.WORDS.en.map(w => w.word + w.initial), ['pandaP', 'elephantE', 'rabbitR', 'squirrelS', 'beeB', 'birdB', 'hippoH', 'mouseM']);
  assert.deepStrictEqual(LL.WORDS.vi.map(w => w.word + w.initial), ['gấu trúcG', 'voiV', 'sócS', 'ongO', 'hà mãH']);
  assert.ok(!LL.WORDS.vi.some(w => /^(th|nh|ch)/.test(w.word)), 'vi skips digraph words');
});

test('content: every topic × age 3–7 × en/vi × 200 seeds → valid, solvable chapters within the rules', () => {
  const COLORS = LL.Content.COLORS;
  let rounds = 0;
  for (const topic of TOPICS) for (const age of AGES) for (const lang of LANGS) for (let s = 0; s < 200; s++) {
    const ch = chapter(topic, age, lang, s * 7919 + age * 13 + (lang === 'vi' ? 5 : 0));
    let prevSet = null;
    ch.forEach((r, ri) => {
      rounds++;
      const tag = `${topic}/${age}/${lang}/${s}/${ri}`;
      assert.strictEqual(LL.Content.validate(r), null, tag);
      assert.strictEqual(r.cards.length, 2 * r.pairs, tag);
      assert.ok(r.cards.length <= 12, tag);
      const want = Math.max(2, Math.min(LL.Content.PAIRS[age][ri], LL.Content.maxPairs(topic, age, lang)));
      assert.strictEqual(r.pairs, want, tag + ' pairs');
      assert.strictEqual(r.peek, LL.Content.PEEK[age], tag + ' peek');
      assert.strictEqual(r.promptKey, 'p.' + topic); assert.strictEqual(r.params.n, r.pairs);
      const keys = {}; r.cards.forEach(c => { keys[c.key] = (keys[c.key] || 0) + 1; });
      assert.ok(Object.values(keys).every(v => v === 2), tag + ' every key on exactly 2 leaves');
      assert.strictEqual(new Set(r.cards.map(c => c.id)).size, r.cards.length);
      assert.notStrictEqual(r.sum.set, prevSet, tag + ' identical consecutive rounds'); prevSet = r.sum.set;
      const info = r.pairInfo, ks = Object.keys(info);
      const pairs = ks.map(k => r.cards.filter(c => c.key === k));
      switch (topic) {
        case 'colors': {
          const cs = ks.map(k => info[k].nameValue);
          if (age <= 5) { assert.ok(!LL.Content.clash(cs), tag + ' colour clash ' + cs); assert.ok(cs.every(c => COLORS.includes(c)), 'no pink up to 5'); }
          r.cards.forEach(c => { assert.ok(LL.THINGS.includes(c.face.obj), tag + ' thing'); assert.strictEqual(c.obj, c.face.obj); });
          if (age <= 4) { pairs.forEach(p => assert.strictEqual(p[0].face.obj, p[1].face.obj, tag + ' same thing ≤ 4'));
            assert.strictEqual(new Set(r.cards.map(c => c.face.obj)).size, 1, tag + ' one thing per round: the colour is the only cue');
            ks.forEach(k => assert.ok(info[k].obj)); }
          else pairs.forEach(p => assert.notStrictEqual(p[0].face.obj, p[1].face.obj, tag + ' different things at 5+'));
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
        case 'food': pairs.forEach(p => {
          const A = p.find(c => c.face.kind === 'animal'), F = p.find(c => c.face.kind === 'food');
          assert.ok(A && F, tag); assert.strictEqual(LL.FOODS[A.face.value], F.face.value); assert.strictEqual(F.face.sprite, 'food_' + F.face.value);
          assert.strictEqual(A.face.sprite, 'animal_' + A.face.value); assert.strictEqual(F.face.animal, A.face.value);
          assert.strictEqual(F.nameKind, 'food'); assert.strictEqual(A.nameKind, 'animal'); assert.strictEqual(F.nameValue, F.face.value);
          assert.strictEqual(info[A.key].animal, A.face.value); assert.strictEqual(info[A.key].food, F.face.value); assert.strictEqual(A.key, 'f:' + A.face.value);
        }); break;
        case 'count': case 'oddeven': {
          const hi = topic === 'oddeven' ? 12 : LL.Content.COUNT_RANGE[age][1];
          pairs.forEach(p => { const n = p[0].face.n; assert.ok(n >= 1 && n <= hi, tag + ' n ' + n); assert.deepStrictEqual(p.map(c => c.face.kind).sort(), ['dots', 'number']); });
          if (topic === 'count' && ri === 0 && age <= 4) assert.ok(pairs.every(p => p[0].face.n <= 3), 'warm-up 1–3');
          if (topic === 'oddeven') {
            const par = pairs.map(p => p[0].face.parity);
            assert.ok(par.includes('odd') && par.includes('even'), tag + ' both parities');
            r.cards.forEach(c => assert.strictEqual(c.face.parity, c.face.n % 2 ? 'odd' : 'even'));
          }
          break;
        }
        case 'lower': r.cards.forEach(c => assert.ok(!/[IilL]/.test(c.face.text), tag + ' no I/l')); break;
        case 'initial': pairs.forEach(p => { const L = p.find(c => c.face.kind === 'letter'), A = p.find(c => c.face.kind === 'animal');
          assert.ok(L && A); assert.strictEqual(LL.WORDS[lang].find(w => w.word === A.word).initial, L.face.text); }); break;
        case 'add': case 'sub': pairs.forEach(p => { const T = p.find(c => c.face.kind === 'text'), N = p.find(c => c.face.kind === 'number');
          const m = /^(\d+) ([+−]) (\d+)$/.exec(T.face.text); const v = m[2] === '+' ? +m[1] + +m[3] : +m[1] - +m[3];
          assert.strictEqual(v, N.face.n); assert.ok(topic === 'add' ? v <= (age >= 7 ? 20 : 10) : (v >= 0 && +m[1] <= 10)); }); break;
      }
    });
  }
  assert.ok(rounds >= 96000, rounds);
});

test('content: topic rotation — 4 of the ≥ 5 pool topics, chapter 1 = easiest not first last time, 2–4 easiest first, prefer topics left out last time', () => {
  const D = LL.Content.DIFFICULTY, di = t => D.indexOf(t);
  for (const age of AGES) {
    let last = null; const seen = new Set(), firsts = new Set();
    for (let s = 0; s < 200; s++) {
      const L = LL.Content.topicsFor(age, new LL.RNG(s * 13 + age), last);
      assert.strictEqual(L.length, 4); assert.strictEqual(new Set(L).size, 4);
      L.forEach(t => { assert.ok(LL.AGE_POOLS[age].includes(t)); seen.add(t); });
      const pool = LL.AGE_POOLS[age].slice().sort((a, b) => di(a) - di(b));
      const want1 = pool.find(t => !last || t !== last[0]); assert.strictEqual(L[0], want1, 'chapter 1');
      for (let i = 2; i < 4; i++) assert.ok(di(L[i]) > di(L[i - 1]), 'easiest first');
      if (last && LL.AGE_POOLS[age].length === 5) { const leftOut = LL.AGE_POOLS[age].filter(t => !last.includes(t) && t !== L[0]); leftOut.forEach(t => assert.ok(L.includes(t), 'left-out topic comes back')); }
      if (last) assert.notDeepStrictEqual(L, last);
      firsts.add(L[0]); last = L;
    }
    assert.strictEqual(seen.size, LL.AGE_POOLS[age].length, 'every pool topic is played'); assert.ok(firsts.size >= 2);
  }
  // the session before last is never repeated either (QA: ages 3 / 6 alternated A, B, A, B)
  for (const age of AGES) { let l = null, l2 = null; const r = new LL.RNG(age * 101);
    for (let i = 0; i < 300; i++) { const L = LL.Content.topicsFor(age, r, l, l2); if (l) assert.notDeepStrictEqual(L, l); if (l2) assert.notDeepStrictEqual(L, l2, 'age ' + age + ' repeats 2 sessions ago'); l2 = l; l = L; } }
  const ww = mkWorld({ age: 3 }); const seenL = []; for (let i = 0; i < 6; i++) { ww.newSession(); seenL.push(ww.levels.join()); }
  for (let i = 2; i < 6; i++) assert.notStrictEqual(seenL[i], seenL[i - 2], 'Play again in one world rotates');
  const wl = mkWorld({ age: 3 }); wl.newSession({ lastTopics: seenL[1].split(','), lastTopics2: seenL[0].split(',') }); assert.notStrictEqual(wl.levels.join(), seenL[0]);
  const w = mkWorld({ age: 4 }); w.newSession({ lastTopics: ['colors', 'shapes', 'count', 'food'] });
  assert.strictEqual(w.levels[0], 'animals'); assert.ok(w.levels.includes('size'));
  const w2 = mkWorld({ age: 4 }); w2.lastTopics = w.levels.slice(); w2.newSession(); assert.notStrictEqual(w2.levels[0], w.levels[0]);
});

test('content: bounded pools — colours ≤ 3 pairs up to age 5, initial en 6 (≤ 12 leaves) / vi 4 (one word always left out), food 8', () => {
  assert.strictEqual(LL.Content.maxPairs('colors', 4, 'en'), 3);
  assert.strictEqual(LL.Content.maxPairs('colors', 5, 'en'), 3);
  assert.strictEqual(LL.Content.maxPairs('colors', 6, 'en'), 7);
  assert.strictEqual(LL.Content.maxPairs('initial', 7, 'vi'), 4);
  assert.strictEqual(LL.Content.maxPairs('initial', 7, 'en'), 7);
  assert.strictEqual(LL.Content.pairsFor('initial', 7, 'en', 3), 6);
  assert.strictEqual(LL.Content.maxPairs('food', 5, 'en'), 8);
  assert.strictEqual(LL.Content.SAFE_SETS.length, 6);
});

test('content: validate() rejects broken rounds (self-check works)', () => {
  const r = LL.Content.makeRound('count', { age: 4, rng: new LL.RNG(3), roundIndex: 2 });
  assert.strictEqual(LL.Content.validate(r), null);
  const bad1 = J(r); bad1.cards[0].key = bad1.cards[1].key === bad1.cards[0].key ? bad1.cards[2].key : bad1.cards[1].key; assert.ok(LL.Content.validate(bad1));
  const bad2 = J(r); const d = bad2.cards.find(c => c.face.kind === 'dots'); d.face.n = d.face.n === 5 ? 4 : d.face.n + 1; assert.ok(LL.Content.validate(bad2), 'dots ≠ numeral');
  const bad3 = J(r); bad3.cards.pop(); assert.ok(LL.Content.validate(bad3));
  const bad4 = J(LL.Content.makeRound('colors', { age: 3, rng: new LL.RNG(1), roundIndex: 3 }));
  bad4.cards[0].face.color = 'teal'; assert.ok(LL.Content.validate(bad4));
  const bad5 = J(LL.Content.makeRound('lower', { age: 6, rng: new LL.RNG(1), roundIndex: 1 }));
  const lo = bad5.cards.find(c => c.face.text === c.face.text.toLowerCase()); lo.face.text = lo.face.text.toUpperCase(); assert.ok(LL.Content.validate(bad5), 'lower pair = 2 capitals');
  const hm = LL.Content.makeRound('food', { age: 4, rng: new LL.RNG(2), roundIndex: 2 }); assert.strictEqual(LL.Content.validate(hm), null);
  const bad6 = J(hm); const h6 = bad6.cards.find(c => c.face.kind === 'food'); const other = LL.FOOD_LIST.find(x => x !== h6.face.value);
  h6.face.value = other; h6.face.sprite = 'food_' + other; assert.ok(LL.Content.validate(bad6), 'wrong food');
  const bad6b = J(hm); bad6b.cards.find(c => c.face.kind === 'food').face.animal = 'nobody'; assert.ok(LL.Content.validate(bad6b), 'food belongs to its animal');
  const bad7 = J(LL.Content.makeRound('colors', { age: 4, rng: new LL.RNG(4), roundIndex: 2 })); bad7.cards[0].face.obj = bad7.cards[0].face.obj === 'cup' ? 'kite' : 'cup';
  assert.ok(LL.Content.validate(bad7), 'age 4: a pair shows the same thing');
  const bad8 = J(LL.Content.makeRound('colors', { age: 6, rng: new LL.RNG(4), roundIndex: 2 })); delete bad8.cards[0].face.obj; assert.ok(LL.Content.validate(bad8), 'colour face needs a thing');
});

test('content: deterministic (same seed → same round and talk)', () => {
  for (const t of TOPICS) {
    assert.deepStrictEqual(LL.Content.makeRound(t, { age: 5, rng: new LL.RNG(9), roundIndex: 2 }), LL.Content.makeRound(t, { age: 5, rng: new LL.RNG(9), roundIndex: 2 }));
    assert.deepStrictEqual(LL.Content.makeTalk(t, { age: 5, rng: new LL.RNG(9) }), LL.Content.makeTalk(t, { age: 5, rng: new LL.RNG(9) }));
  }
});

test('talk: every topic × age × lang × 300 seeds → distinct choices incl. the answer; food "What does the {animal} love to eat?" (3 food pictures)', () => {
  for (const t of TOPICS) for (const age of AGES) for (const lang of LANGS) for (let s = 0; s < 300; s++) {
    const k = LL.Content.makeTalk(t, { age, lang, rng: new LL.RNG(s * 31 + age) });
    assert.strictEqual(k.promptKey, 'talk.' + t);
    const vals = k.choices.map(c => c.value);
    assert.strictEqual(new Set(vals).size, vals.length, t);
    assert.ok(k.choices.length >= 2 && k.choices.length <= 3);
    const ans = k.choices.find(c => c.id === k.answerId); assert.ok(ans, 'answer present');
    if (t === 'animals') { assert.strictEqual(k.show, null); assert.strictEqual(k.params.animal, ans.value); assert.strictEqual(k.choices.length, 3); }
    else assert.ok(k.show && k.show.kind, t + ' shows a face');
    if (t === 'food') { assert.strictEqual(k.show.kind, 'animal'); assert.strictEqual(k.show.sprite, 'animal_' + k.show.value); assert.strictEqual(k.params.animal, k.show.value);
      assert.strictEqual(ans.value, LL.FOODS[k.show.value]); assert.strictEqual(k.params.food, ans.value);
      assert.strictEqual(k.choices.length, 3); k.choices.forEach(c => { assert.strictEqual(c.kind, 'food'); assert.strictEqual(c.sprite, 'food_' + c.value); assert.ok(LL.FOOD_LIST.includes(c.value)); }); }
    if (t === 'colors') { assert.ok(LL.THINGS.includes(k.show.obj)); assert.strictEqual(k.params.obj, k.show.obj); if (age <= 5) assert.ok(!LL.Content.clash(vals) && !vals.includes('pink'), 'talk colours safe'); }
    if (t === 'count') assert.strictEqual(k.show.n, ans.value);
    if (t === 'oddeven') assert.strictEqual(ans.value, k.show.n % 2 ? 'odd' : 'even');
    if (t === 'size') { assert.strictEqual(ans.value, k.show.size); k.choices.forEach(c => { assert.strictEqual(c.sprite, k.show.sprite); }); }
    if (t === 'initial') assert.strictEqual(LL.WORDS[lang].find(w => w.word === k.params.word).initial, ans.value);
  }
});

// ======================================================= layout / grid / tree
test('layout: §2 formulas (groundY, Lolo seat, loloRect 1.25h × 1.15h, anchors, bubble, boards, short-side rule)', () => {
  const L = LL.World.computeLayout(1280, 720, null);
  assert.strictEqual(L.groundY, 630); assert.deepStrictEqual(L.lolo, { x: 110, y: 640, h: 150 });
  assert.deepStrictEqual(L.loloRect, { x: 110 - 93.75, y: 640 - 172.5, w: 187.5, h: 172.5 }); assert.strictEqual(L.deeRect, L.loloRect);
  assert.ok(Math.abs(L.loloShoulder.x - (110 + 24 / 256 * 150)) < 1e-9 && Math.abs(L.loloShoulder.y - (640 - 108 / 256 * 150)) < 1e-9, 'shoulder (152, 136)');
  assert.ok(Math.abs(L.loloSocket.x - 110) < 1e-9 && Math.abs(L.loloSocket.y - (640 - 126 / 256 * 150)) < 1e-9, 'socket (128, 118)');
  assert.deepStrictEqual(L.bubble, { x: 24, y: 20, w: 640, h: 122 });
  assert.strictEqual(L.board.x, 240); assert.strictEqual(L.board.y, 166); assert.strictEqual(L.board.y + L.board.h, 616);
  assert.strictEqual(L.floor.frogY, 682);
  assert.strictEqual(L.neckBase, undefined, 'no neck');
  const P = LL.World.computeLayout(720, 1556, { top: 108, bottom: 62 });
  assert.strictEqual(P.groundY, 1556 - 62 - 90); assert.deepStrictEqual(P.lolo, { x: 120, y: P.groundY + 12, h: 170 }, 'tall phone: a bigger Lolo');
  assert.ok(P.loloRect.x >= 12, 'her box on screen');
  const Q = LL.World.computeLayout(720, 960, { top: 32, bottom: 27 }); assert.deepStrictEqual(Q.lolo, { x: 100, y: Q.groundY + 12, h: 140 }, 'iPad portrait');
  assert.strictEqual(Q.boards.length, 3); assert.ok(Q.boards[2].lolo && Q.boards[2].x === Q.boards[0].x && Q.boards[2].y + Q.boards[2].h === Q.groundY - 14, 'board C: full');
  assert.strictEqual(P.bubble.y, 108 + 96 + 24); assert.strictEqual(P.bubble.h, 124); assert.strictEqual(P.bubble.w, 640);
  assert.strictEqual(P.boards.length, 3); assert.ok(Math.abs(P.boards[0].y + P.boards[0].h - (P.loloRect.y - 46)) < 1e-9, 'board A above Lolo (16 keep-out + 30 hop room)');
  assert.ok(P.boards[1].x >= P.loloRect.x + P.loloRect.w + 40 - 1e-9);
  assert.deepStrictEqual(LL.World.logicalSize(852, 393), { W: 1561, H: 720 });
  assert.deepStrictEqual(LL.World.logicalSize(393, 852), { W: 720, H: 1561 });
  assert.deepStrictEqual(LL.World.logicalSize(1024, 768), { W: 960, H: 720 });
  assert.deepStrictEqual(LL.World.logicalSize(3000, 700), { W: 1600, H: 720 });
});

test('grid + tree: 12 viewports × 2–6 pairs × ages → leaves ≥ the age minimum, inside board + screen, clear of HUD/bubble, ≥ 16 px from loloRect (even swung ±0.14), gaps x ≥ 18 / y ≥ 30; tree ⊇ grid, inside the safe area; row vines + stems; no door', () => {
  const rows = []; let n0 = 0;
  for (const v of VIEWPORTS) for (const age of AGES) for (let pairs = 2; pairs <= 6; pairs++) {
    const n = 2 * pairs, L = LL.World.computeLayout(v.W, v.H, v.ins), g = LL.World.chooseGrid(L, n, age);
    const tag = `${v.name} age ${age} ${pairs} pairs`;
    n0++;
    assert.ok(g.cols * g.rows >= n && g.cols * g.rows - n <= 2, tag + ' at most two empty slots');
    const lastN = n - (g.rows - 1) * g.cols; assert.ok(lastN >= 2 || lastN === g.cols || g.board.lolo, tag + ' last row ≥ 2 leaves');
    assert.ok(Math.abs(g.ch - g.cw / 0.78) < 1e-9);
    assert.ok(g.gap >= 18 - 1e-9 && Math.abs(g.gap - Math.max(18, 0.16 * g.cw)) < 1e-9, tag + ' gap x');
    assert.ok(Math.abs(g.gapY - Math.max(30, 0.26 * g.cw)) < 1e-9, tag + ' gap y');
    if (pairs <= Math.max(...CFG.pairsByAge[age])) assert.ok(g.cw >= CFG.cardMin[age] - 1e-9, tag + ' leaf ' + g.cw.toFixed(1) + ' < ' + CFG.cardMin[age]);
    assert.ok(g.cw <= CFG.cardMax + 1e-9);
    const R = g.slots.map(s => ({ x: s.x - g.cw / 2, y: s.y - g.ch / 2, w: g.cw, h: g.ch }));
    const B = g.building;
    R.forEach((r, i) => {
      assert.ok(insideR(r, g.board), tag + ' inside board'); assert.ok(insideR(r, L.safe), tag + ' inside the safe screen');
      assert.ok(!rectsOverlap(r, L.hud) && !rectsOverlap(r, L.bubble), tag + ' clear of HUD/bubble');
      assert.ok(!rectsOverlap(r, grow(L.loloRect, 16)), tag + ' leaf within 16 px of Lolo');
      assert.ok(r.y + r.h <= L.groundY - 14 + 1e-6);
      // stems: the pivot lies on its row vine, above the leaf, the stem ≥ 0.62·gapY
      const s = g.slots[i], row = B.rows[s.row];
      assert.ok(Math.abs(s.py - LL.World.vineY(row, s.x)) < 1e-9 && s.px === s.x, tag + ' pivot on the vine');
      assert.ok(s.stem >= 0.62 * g.gapY - 1e-6 && s.stem <= 0.91 * g.gapY, tag + ' stem ' + s.stem);
      // swung to ±0.14 rad about the pivot, the leaf still keeps clear of Lolo's box
      for (const a of [-CFG.swingMax, CFG.swingMax]) {
        const c = { x: s.x, y: s.y, w: g.cw, h: g.ch, px: s.px, py: s.py };
        assert.ok(!rectsOverlap(LL.World.leafBounds(c, a), L.loloRect), tag + ' swung leaf on Lolo');
      }
    });
    for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) {
      const sameRow = g.slots[i].row === g.slots[j].row;
      assert.ok(LL.World.rectGap(R[i], R[j]) >= (sameRow ? 18 : 30) - 1e-6, tag + ' leaves too close');
      const hi = grow(R[i], 10), cj = g.slots[j]; assert.ok(!(cj.x > hi.x && cj.x < hi.x + hi.w && cj.y > hi.y && cj.y < hi.y + hi.h));
    }
    if (g.cols * g.rows > n) { const last = g.slots.slice((g.rows - 1) * g.cols); const mid = last.reduce((s, q) => s + q.x, 0) / last.length;
      if (g.board.lolo) assert.ok(Math.abs(last[last.length - 1].x + g.cw / 2 - (g.rect.x + g.rect.w)) < 1e-6, tag + ' board C: right-aligned');
      else assert.ok(Math.abs(mid - (g.rect.x + g.rect.w / 2)) < 1e-6, tag + ' centred'); }
    // tree: pad around the grid, down to the floor, inside the board sideways; branch band; vines; no door
    const p = Math.max(36, 0.32 * g.cw);
    assert.ok(Math.abs(B.pad - p) < 1e-9 && Math.abs(B.roofH - 0.34 * g.cw) < 1e-9);
    assert.ok(insideR({ x: B.x, y: B.y, w: B.w, h: L.groundY - B.y }, L.safe) && B.x >= L.safe.x + 24 - 1e-6 && B.x + B.w <= L.safe.x + L.safe.w - 24 + 1e-6, tag + ' tree inside the safe area');
    assert.ok(Math.abs(B.x - (g.rect.x - p)) < 1e-6 && Math.abs(B.y - (g.rect.y - p)) < 1e-6 && Math.abs(B.w - (g.rect.w + 2 * p)) < 1e-6, tag + ' tree pad');
    assert.ok(Math.abs(B.y + B.h - (L.groundY + 4)) < 1e-6, tag + ' down to the floor');
    assert.ok(B.x >= g.board.x - 1e-6 && B.x + B.w <= g.board.x + g.board.w + 1e-6 && B.y >= g.board.y - 1e-6, tag + ' tree in the board');
    assert.strictEqual(B.door, null); assert.strictEqual(B.doorX, null);
    assert.strictEqual(B.rows.length, g.rows);
    B.rows.forEach((row, r) => {
      const top = g.y0 + r * (g.ch + g.gapY);
      assert.ok(Math.abs(row.y - (top - 0.62 * g.gapY)) < 1e-6, tag + ' vineY'); assert.ok(row.sag > 0 && row.sag <= 0.06 * (row.x1 - row.x0) + 1e-9 && row.sag <= 0.28 * g.gapY + 1e-9);
      assert.ok(Math.abs(row.ye - (row.y - row.sag)) < 1e-9 && Math.abs(LL.World.vineY(row, (row.x0 + row.x1) / 2) - row.y) < 1e-9, tag + ' sag shape');
      assert.ok(row.x0 >= B.x - 1e-6 && row.x1 <= B.x + B.w + 1e-6, tag + ' vine on the tree');
      if (g.board.lolo && r === g.rows - 1) assert.ok(row.x0 >= L.loloRect.x + L.loloRect.w - 1e-6, tag + ' no vine over Lolo');
      if (r > 0) assert.ok(row.ye >= top - 0.9 * g.gapY - 1e-6, tag + ' vine ends clear of the row above');
    });
    if (age === 4 && pairs === 3) rows.push(`${v.name}: ${g.cols}×${g.rows} ${g.cw.toFixed(0)} px`);
  }
  console.log('      age 4, 3 pairs: ' + rows.join(' · ')); void n0;
});

test('grid: the tuned game never needs a leaf below the minimum; ties prefer the squarer grid; no single column', () => {
  let smallest = 1e9;
  for (const v of VIEWPORTS) {
    const L = LL.World.computeLayout(v.W, v.H, v.ins);
    for (const age of AGES) for (const p of new Set(CFG.pairsByAge[age])) smallest = Math.min(smallest, LL.World.chooseGrid(L, 2 * p, age).cw);
    for (const n of [4, 6]) { const gv = LL.World.chooseGrid(L, n, 4); assert.ok(gv.cols > 1 && gv.rows < n, v.name + ' no single column'); }
  }
  console.log('      smallest leaf in a tuned round: ' + smallest.toFixed(0) + ' px');
  assert.ok(smallest >= 104 - 1e-9);
  const P = LL.World.computeLayout(720, 1600, null), gp = LL.World.chooseGrid(P, 4, 4);
  assert.strictEqual(gp.cw, CFG.cardMax); assert.strictEqual(gp.cols, 2); assert.strictEqual(gp.boardIndex, 0, 'board A, 2×2');
  // QA: 10 leaves on an iPhone portrait fill the width (board C, empty corner over Lolo), not a 2×5 column right of her;
  // on an iPad portrait they reach down to the floor beside her instead of leaving it empty
  for (const v of [VIEWPORTS[2], VIEWPORTS[3], VIEWPORTS[10], VIEWPORTS[6], VIEWPORTS[7]]) {
    const L = LL.World.computeLayout(v.W, v.H, v.ins), g = LL.World.chooseGrid(L, 10, 6);
    assert.ok(g.board.lolo && g.cols >= 3, v.name + ' 10 leaves on board C: ' + g.cols + '×' + g.rows);
    assert.ok(L.groundY - (g.rect.y + g.rect.h) < 0.6 * g.ch, v.name + ' reaches down beside Lolo');
    assert.ok(Math.abs(g.building.x + g.building.w / 2 - L.W / 2) < 30, v.name + ' balanced');
  }
});

test('layout: colour rounds never put a yellow leaf within 40 px of Lolo (12 viewports × 40 seeds)', () => {
  let swaps = 0;
  for (const v of VIEWPORTS) for (let s = 0; s < 40; s++) for (const age of [3, 4]) {
    const w = mkWorld({ vp: v, seed: s + 1, age });
    roundOf(w, 'colors', s % 4);
    for (const c of w.cards) {
      if (c.face.color === 'yellow') assert.ok(LL.World.rectGap(w.cardRect(c), w.layout.loloRect) >= 40 - 1e-6, v.name + ' yellow near Lolo');
      const s0 = w.layout.grid.slots[c.slot]; assert.ok(c.px === s0.px && c.py === s0.py && c.stem === s0.stem && c.x === s0.x, 'swapped leaves take their slot\'s stem');
    }
    if (w.cards.some(c => c.slot !== +c.id.slice(1))) swaps++;
  }
  console.log('      rounds with a yellow swap: ' + swaps);
});

// ======================================================= Lolo
test('lolo: leans (ω 8, ±0.16) and points (arm angle to the leaf, ω 10) at every leaf that turns on 12 viewports × 2–5 pairs; the hand never enters a leaf; back to rest after 3 s', () => {
  let pointed = 0, total = 0, maxLean = 0;
  for (const v of VIEWPORTS) for (const pairs of [2, 3, 4, 5]) {
    const w = mkWorld({ vp: v, age: 6, config: { pairsByAge: { 6: [pairs, pairs, pairs, pairs] } } });
    roundOf(w, 'add', 0); untilPhase(w, 'play');
    const L = w.layout, g = w.lolo;
    for (const c of w.cards.slice()) {
      const tag = `${v.name} ${pairs} pairs ${c.id}`;
      tap(w, c);
      let best = 9;
      for (let i = 0; i < 160; i++) {
        w.update(H);
        maxLean = Math.max(maxLean, Math.abs(g.lean));
        const want = Math.atan2(c.y - g.shY, c.x - g.shX); best = Math.min(best, Math.abs(g.armA - want));
        // the hand (shoulder + armLen along armA) never inside a leaf rect
        const hx = g.shX + Math.cos(g.armA) * g.armLen, hy = g.shY + Math.sin(g.armA) * g.armLen;
        for (const o of w.cards) assert.ok(!(Math.abs(hx - o.x) < o.w / 2 && Math.abs(hy - o.y) < o.h / 2), tag + ' hand in a leaf');
        assert.ok(g.armLen <= 0.55 * L.lolo.h + 1e-6 && g.armExt >= 0 && g.armExt <= 1);
      }
      assert.ok(Math.sign(g.lean) === Math.sign(c.x - L.lolo.x) || Math.abs(c.x - L.lolo.x) < 1, tag + ' leans towards the leaf');
      total++; if (best < 0.03 && g.armExt > 0.9) pointed++;
      run(w, 1.4); if (w.open.length) { w.open.slice().forEach(id => w._close(w.cardById(id))); w.open = []; w._mis = null; w._setPhase('play'); }
      ev(w);
    }
    run(w, 3.6); assert.ok(Math.abs(g.lean) < 0.005 && Math.abs(g.armA - CFG.armRest) < 0.01 && g.armExt < 0.01, v.name + ' back to rest');
  }
  console.log(`      pointed at the leaf: ${pointed} / ${total} · max lean ${maxLean.toFixed(3)}`);
  assert.strictEqual(pointed, total);
  assert.ok(maxLean <= 0.16 * 1.2 && maxLean > 0.14, 'lean ' + maxLean);
});

test('lolo: moods hop (happy 14 px), tail curls, blinks; the backflip (−2π, 70 px ballistic, landing squash); loloHead() / tap → "lolo"', () => {
  const w2 = mkWorld(); roundOf(w2, 'animals', 1); untilPhase(w2, 'play');
  let mx = 0; const p = pairOf(w2, w2.cards[0].key); tap(w2, p[0]); tap(w2, p[1]);
  const t0 = w2.lolo.tail;
  for (let i = 0; i < 160; i++) { w2.update(H); mx = Math.max(mx, w2.lolo.hop); }
  assert.ok(Math.abs(mx - 14) < 0.5, 'happy hop ' + mx); assert.strictEqual(w2.dee, w2.lolo, 'old alias');
  assert.ok(w2.lolo.tail !== t0 && w2.lolo.tail >= 0 && w2.lolo.tail < 2 * Math.PI, 'tail phase');
  let blinks = 0, prev = 0; run(w2, 12, () => { if (w2.lolo.blink && !prev) blinks++; prev = w2.lolo.blink; });
  assert.ok(blinks >= 2 && blinks <= 6, 'blinks ' + blinks);
  const L = w2.layout, hb = LL.World.loloHead(w2), m0 = w2.mismatches;
  assert.strictEqual(w2.pointerDown(L.lolo.x, L.lolo.y - 20), 'lolo');
  assert.strictEqual(w2.pointerDown(hb.x + hb.w / 2, hb.y + hb.h / 2), 'lolo');
  assert.strictEqual(w2.mismatches, m0);
  assert.ok(Math.abs(hb.w - 0.6 * L.lolo.h) < 1e-9 && insideR(hb, grow(L.loloRect, 1)), 'head box inside loloRect at rest');
  // backflip during the cheer: −2π at constant spin over the airtime, apex 70 px (landscape), lands with a squash
  for (const v of [VIEWPORTS[8], VIEWPORTS[3], VIEWPORTS[7]]) {
    const w = mkWorld({ vp: v }); roundOf(w, 'colors', 1); untilPhase(w, 'play'); solveUntilCheer(w);
    let flipE = null, maxHop = 0, minRot = 0, sq = 0, t1 = null, n = 0;
    while (w.phase === 'cheer' && n++ < 400) {
      w.update(H);
      for (const e of ev(w)) if (e.type === 'backflip') { flipE = e; t1 = w.time; }
      maxHop = Math.max(maxHop, w.lolo.hop); minRot = Math.min(minRot, w.lolo.flipRot); sq = Math.max(sq, w.lolo.squash);
      assert.ok(w.lolo.flipRot <= 0 && w.lolo.flipRot >= -2 * Math.PI);
      const R = w.layout.loloRect, up = { x: R.x, y: R.y - w.lolo.hop, w: R.w, h: R.h };
      for (const c of w.cards) assert.ok(!rectsOverlap(up, w.cardRect(c)), v.name + ' the jump stays off the leaves');
    }
    const J = Math.min(70, w.layout.loloRoom);
    assert.ok(flipE && Math.abs(flipE.jump - J) < 1e-9, v.name + ' backflip event');
    assert.ok(Math.abs(maxHop - J) < 0.5, v.name + ' apex ' + maxHop + ' / ' + J);
    if (!w.layout.portrait) assert.ok(Math.abs(flipE.time - 0.7) < 0.01, 'airtime 0.7 s');
    assert.ok(minRot < -2 * Math.PI + 0.1, 'full turn'); assert.ok(sq > 0.1 && sq <= 0.15, 'landing squash ' + sq);
    assert.strictEqual(w.lolo.flipRot, 0);
  }
});

// ======================================================= round flow / motion
test('scroll → peek → hide → play: the camera pans W in 1.6 s (smooth-step), old tree leaves, Lolo swings across on a vine, new tree colours ≠ old; peek wave + hold; hide wave', () => {
  const w = mkWorld({ age: 4 });
  roundOf(w, 'animals', 2);
  assert.strictEqual(w.phase, 'scroll'); assert.strictEqual(w.prevBuilding, null, 'first tree of the chapter just slides in');
  const E0 = ev(w).filter(e => e.type !== 'level'); assert.strictEqual(E0[0].type, 'scroll'); assert.strictEqual(E0[0].first, true);
  const r0 = E0.find(e => e.type === 'round'); assert.strictEqual(r0.pairs, CFG.pairsByAge[4][2]); assert.ok(r0.building && r0.building.bark && r0.building.leaf);
  assert.strictEqual(w.scrollTime, 1.6); assert.strictEqual(E0[0].time, 1.6);
  const W = w.layout.W, s0 = w.scroll; let lastT = 0, n = 0, mid = null, dxs = [], swings = [];
  while (w.phase === 'scroll' && n++ < 1000) {
    w.update(H);
    assert.ok(w.scrollT >= lastT - 1e-12, 'monotonic'); lastT = w.scrollT;
    assert.ok(Math.abs(w.buildingDx - (1 - w.scrollT) * W) < 1e-6);
    if (w.phase === 'scroll' && w.scrollT < 1) assert.strictEqual(w.pointerDown(w.cards[0].x, w.cards[0].y), null, 'no leaf taps while scrolling');
    for (const e of ev(w)) { assert.notStrictEqual(e.type, 'walk', 'no walk events'); if (e.type === 'swing') swings.push(e.phase); }
    if (mid === null && w.phaseTime >= 0.8) mid = w.scrollT;
    dxs.push(w.scrollT);
  }
  assert.ok(Math.abs(w.scroll - s0 - W) < 1e-6, 'scroll += W'); assert.ok(Math.abs(mid - 0.5) < 0.02, 'smooth-step half way ' + mid);
  assert.ok(dxs[1] - dxs[0] < 0.002, 'eases in');
  assert.deepStrictEqual(swings, ['leap', 'grab', 'release', 'land']);
  assert.strictEqual(w.lolo.hang, false); assert.strictEqual(w.lolo.dx, 0);
  untilPhase(w, 'peek'); ev(w); assert.strictEqual(w.lolo.vine, null);
  const nC = w.cards.length, peekAt = w.time; let hideAt = null, playAt = null;
  n = 0;
  while (w.phase !== 'play' && n++ < 20000) { w.update(H); for (const e of ev(w)) { if (e.type === 'hide') hideAt = w.time; if (e.type === 'play') playAt = w.time; } }
  const pk = CFG.peekByAge[4] * (0.6 + 0.1 * nC), hold = hideAt - peekAt;
  assert.ok(hold > pk && hold < pk + 0.6, 'peek ≈ wave + peek time ' + hold);
  assert.ok(w.cards.every(c => c.open < 0.5 && c.state === 'down'));
  assert.ok(playAt - hideAt < 0.8);
  // next round: the old (lit) tree scrolls out, the new one has another leaf + bark colour
  const old = w.building; solveRound(w); assert.strictEqual(w.state, 'roundDone'); run(w, CFG.roundDoneTime + 0.02);
  assert.strictEqual(w.phase, 'scroll'); assert.ok(w.prevBuilding && w.prevBuilding.building === old);
  assert.ok(w.prevBuilding.cards.every(c => c.state === 'matched' && c.light > 0.99 && c.open > 0.98 && Number.isFinite(c.swing + c.px + c.py + c.stem)), 'old leaves stay lit');
  assert.notStrictEqual(w.building.leaf, old.leaf); assert.notStrictEqual(w.building.bark, old.bark);
  assert.ok(LL.World.LEAVES.some(l => l[0] === w.building.leaf && l[1] === w.building.leafDark) && LL.World.BARKS.some(b => b[0] === w.building.bark));
  assert.ok(LL.World.FLOWERS.includes(w.building.flower) && LL.World.KINDS.includes(w.building.kind) && w.building.vine === '#6E8F3A' && w.building.moss === '#8DBA6A');
  const sw0 = w.prevBuilding.cards.map(c => c.swing); run(w, 0.3); assert.ok(w.prevBuilding.cards.some((c, i) => c.swing !== sw0[i] || c.swing === 0), 'old leaves keep swinging');
  run(w, 0.5); assert.ok(Math.abs(w.prevDx + w.scrollT * W) < 1e-6);
  run(w, 1); assert.strictEqual(w.prevBuilding, null);
});

test('flip: spring ω 14 ζ 0.45 turns the leaf over past 1 to the stop ≤ 1.12 (0.95 in ≤ 0.2 s) and settles; turning back hits 0 with a "fwip" clack (open clamped, v × −0.25); flip = clamp(open)', () => {
  const w = mkWorld(); roundOf(w, 'colors', 1); untilPhase(w, 'play'); ev(w);
  const c = downCards(w)[0];
  assert.strictEqual(tap(w, c), c.id);
  const E = ev(w); assert.strictEqual(E[0].type, 'flip'); assert.strictEqual(E[0].nameKind, 'color'); assert.strictEqual(E[0].nameValue, c.face.color); assert.strictEqual(E[0].obj, c.face.obj);
  let t = 0, maxO = 0, t95 = null;
  while (t < 0.9) { w.update(H); t += H; maxO = Math.max(maxO, c.open); if (t95 === null && c.open >= 0.95) t95 = t; assert.strictEqual(c.flip, Math.min(1, Math.max(0, c.open))); }
  assert.ok(maxO > 1.08 && maxO <= 1.12 + 1e-9, 'overshoot ' + maxO);
  assert.ok(t95 > 0.1 && t95 <= 0.2, 'turn time ' + t95);
  assert.ok(Math.abs(c.open - 1) < 0.01, 'settles ' + c.open);
  const other = downCards(w).find(x => x.key !== c.key); tap(w, other); ev(w);
  let clacks = [], minO = 1, after = 0, seenZero = false;
  run(w, 2.4, () => { for (const e of w.events) if (e.type === 'clack') clacks.push(e); w.events.length = 0; minO = Math.min(minO, c.open); if (seenZero) after = Math.max(after, c.open); if (c.open === 0 && c._ov >= 0 && clacks.length) seenZero = true; });
  assert.strictEqual(minO, 0, 'never below 0');
  assert.deepStrictEqual(clacks.map(e => e.id).sort(), [c.id, other.id].sort(), 'one clack per leaf');
  assert.ok(clacks.every(e => e.v >= 4), 'hit speed ' + clacks.map(e => e.v));
  assert.ok(after > 0.001 && after < 0.1, 'small rebound ' + after);
  assert.ok(c.open < 1e-3);
  const w2 = mkWorld(); roundOf(w2, 'colors', 1); untilPhase(w2, 'play'); const d = downCards(w2)[0]; tap(w2, d); run(w2, 0.3); ev(w2);
  tap(w2, d); const E2 = ev(w2); assert.strictEqual(E2[0].type, 'tap'); assert.strictEqual(E2[0].id, d.id);
});

test('leaf pendulum: a flip kicks ±0.6 rad/s (sign alternating with the slot, opposite when it turns back); ω 4.2 ζ 0.12 → ≈ 0.67 Hz, |swing| ≤ 0.14, decays; wind adds a small torque; hit test on the unrotated rect', () => {
  const w = mkWorld({ config: { hintAfterStreak: 99, idleTime: 999, swingWind: 0 } }); roundOf(w, 'animals', 3); untilPhase(w, 'play'); ev(w);
  w.wind = 0;
  for (const c of w.cards) { c.swing = 0; c.vswing = 0; }
  const [a, b] = twoDifferent(w);
  const sa = a.slot % 2 ? -1 : 1;
  tap(w, a);
  assert.ok(Math.abs(a.vswing - sa * CFG.swingKick) < 1e-9, 'kick ' + a.vswing);
  let peak = 0, zc = [], prev = a.swing, maxAbs = 0;
  run(w, 4, () => { peak = Math.max(peak, Math.abs(a.swing)); maxAbs = Math.max(maxAbs, ...w.cards.map(c => Math.abs(c.swing)));
    if (prev * a.swing < 0) zc.push(w.time); prev = a.swing; });
  assert.ok(peak > 0.1 && peak <= 0.14 + 1e-12, 'peak ' + peak); assert.ok(maxAbs <= 0.14 + 1e-12, 'clamp');
  const period = 2 * (zc[zc.length - 1] - zc[0]) / (zc.length - 1);
  assert.ok(Math.abs(period - 2 * Math.PI / (4.2 * Math.sqrt(1 - 0.12 * 0.12))) < 0.03, 'period ' + period);
  // decays: after a while it is small
  a.swing = 0.12; a.vswing = 0; let amp = 0; run(w, 6, () => { if (w.time > 0) amp = Math.abs(a.swing); });
  let late = 0; run(w, 2, () => { late = Math.max(late, Math.abs(a.swing)); }); assert.ok(late < 0.12 * 0.15, 'decays ' + late); void amp;
  // turning back kicks the other way
  const v0 = b.vswing; tap(w, b); const vb = b.vswing - v0; run(w, 2); ev(w);
  const vClose = (() => { const s = a.vswing; return s; })(); void vClose;
  assert.ok(Math.abs(vb - (b.slot % 2 ? -1 : 1) * CFG.swingKick) < 1e-9);
  // breeze: with the real weather wind (noon / night) every leaf sways visibly (≈ 0.05 rad) and never reaches the clamp by itself
  for (const mood of [1, 3]) {
    const wb = mkWorld({ config: { hintAfterStreak: 99, idleTime: 999 } }); roundOf(wb, 'animals', 3); untilPhase(wb, 'play'); ev(wb);
    const wx = new LL.Weather({ width: 1280, height: 720, seed: 3 + mood }); wx.setWeather(mood, { instant: true });
    for (const c of wb.cards) { c.swing = 0; c.vswing = 0; }
    let mx = 0, lo = 1, hi = -1; const c0 = wb.cards[0];
    run(wb, 20, (i) => { if (i % 2 === 0) wx.update(H * 2, { groundY: 630 }); wb.wind = wx.ambient.wind; if (i > 360) { for (const c of wb.cards) mx = Math.max(mx, Math.abs(c.swing)); lo = Math.min(lo, c0.swing); hi = Math.max(hi, c0.swing); } });
    assert.ok(hi - lo > 0.05 && mx >= 0.03 && mx < 0.1, 'mood ' + mood + ' breeze sway ' + (hi - lo).toFixed(3) + ' max ' + mx.toFixed(3));
  }
  // hit test ignores the swing: the unrotated rect + 10 px
  const c = downCards(w)[0]; c.swing = 0.14; assert.strictEqual(w._hit(c.x + c.w / 2 + 8, c.y), c);
});

test('leaf pendulum at play start: the peek / hide waves kick ±0.3 rad/s only — no leaf reaches the 0.14 clamp from the peek + hide + breeze (12 viewports × 4 seeds × noon wind)', () => {
  let worst = 0;
  for (const v of VIEWPORTS) for (let s = 1; s <= 4; s++) {
    const w = mkWorld({ vp: v, seed: s, age: 6 }); w.wind = 16;
    roundOf(w, 'add', s % 4);
    let n = 0; while (w.phase !== 'play' && n++ < 4000) { w.update(H); for (const c of w.cards) worst = Math.max(worst, Math.abs(c.swing)); }
    run(w, 1, () => { for (const c of w.cards) worst = Math.max(worst, Math.abs(c.swing)); });
  }
  console.log('      largest swing from peek + hide + breeze: ' + worst.toFixed(3) + ' rad');
  assert.ok(worst < CFG.swingMax - 0.005, 'clamp reached ' + worst);
  assert.strictEqual(CFG.swingKickWave, 0.3); assert.strictEqual(CFG.swingKick, 0.6);
});

test('match: check at open ≥ 0.95 → match event (food: animal + food); after 0.25 s the sunbeam lights (0.4 s), both orchids bloom at the stem point (bloom {id, x, y}, spring peak ≈ 1.2), the faces hop twice (12 px); leaves stay turned + matched', () => {
  const w = mkWorld(); roundOf(w, 'food', 2); untilPhase(w, 'play'); ev(w);
  const [a, b] = pairOf(w, w.cards[0].key);
  tap(w, a); tap(w, b);
  let matchT = null, blooms = [], maxB = 0, ups = 0, prevB = 0, maxBo = 0, lit = null, n = 0;
  const t0 = w.time;
  while (n++ < 240) {
    w.update(H);
    for (const e of ev(w)) {
      if (e.type === 'match') { matchT = w.time; assert.strictEqual(e.key, a.key); assert.strictEqual(e.found, 1); assert.strictEqual(e.pairs, w.pairs);
        assert.ok(a.open >= 0.95 && b.open >= 0.95); const an = [a, b].find(x => x.face.kind === 'animal'), fo = [a, b].find(x => x.face.kind === 'food');
        assert.strictEqual(e.animal, an.face.value); assert.strictEqual(e.food, LL.FOODS[an.face.value]); assert.strictEqual(e.nameKind, 'animal');
        assert.strictEqual(e.key, 'f:' + an.face.value); assert.strictEqual(fo.face.animal, an.face.value); assert.strictEqual(e.home, undefined); }
      if (e.type === 'bloom') {
        blooms.push([e.id, w.time - matchT]);
        const c = w.cardById(e.id), r = c.stem * (1 - CFG.bloomStemK);
        assert.ok(Math.abs(e.x - (c.px - Math.sin(c.swing) * r)) < 1e-6 && Math.abs(e.y - (c.py + Math.cos(c.swing) * r)) < 1e-6, 'stem point');
        assert.ok(e.y < c.y - c.h / 2 && e.y > c.py, 'just above the leaf top');
      }
    }
    maxB = Math.max(maxB, a.bloom, b.bloom); maxBo = Math.max(maxBo, a.bounce);
    if (a.bounce < prevB && prevB > 6 && a._pbounce <= prevB && !a._wasDown) { ups++; a._wasDown = true; } if (a.bounce > prevB) a._wasDown = false; prevB = a.bounce;
    if (lit === null && a.light >= 0.999) lit = w.time - matchT;
  }
  assert.ok(matchT !== null && matchT - t0 <= 0.25);
  assert.strictEqual(w.phase, 'play');
  assert.ok(Math.abs(lit - (0.25 + 0.4)) < 0.03, 'sunbeam ' + lit);
  assert.deepStrictEqual(blooms.map(x => x[0]).sort(), [a.id, b.id].sort()); assert.ok(blooms.every(x => x[1] >= 0.29 && x[1] <= 0.47), 'pops ' + blooms);
  assert.ok(maxB > 1.15 && maxB <= 1.21, 'bloom peak ' + maxB); assert.ok(Math.abs(a.bloom - 1) < 0.03);
  assert.strictEqual(ups, 2, 'two hops'); assert.ok(Math.abs(maxBo - 12) < 0.5, 'hop ' + maxBo); assert.strictEqual(a.bounce, 0);
  assert.strictEqual(a.state, 'matched'); assert.strictEqual(b.state, 'matched'); assert.ok(a.open > 0.98 && a.light === 1);
  assert.strictEqual(w.cards.length, 2 * w.pairs, 'matched leaves stay'); assert.strictEqual(w.rewards.length, 0, 'no rewards');
});

test('mismatch: faces wiggle (±0.08 rad, 3 wiggles), stay 1.6 s (age 3: 1.8 s), close; streak; the third-tap fast reset', () => {
  for (const [age, show] of [[4, CFG.mismatchShow], [3, CFG.mismatchShowByAge[3]]]) {
    const w = mkWorld({ age }); roundOf(w, 'animals', 3); untilPhase(w, 'play'); ev(w);
    const [a, b] = twoDifferent(w);
    tap(w, a); tap(w, b);
    let misT = null, downT = null, maxRot = 0, signs = 0, prev = 0, n = 0;
    while (n++ < 600 && downT === null) {
      w.update(H);
      for (const e of ev(w)) if (e.type === 'mismatch') { misT = w.time; assert.strictEqual(e.streak, 1); assert.strictEqual(e.nameValueA, a.nameValue); assert.strictEqual(e.nameValueB, b.nameValue); assert.strictEqual(w.phase, 'resolve'); }
      if (misT !== null) { maxRot = Math.max(maxRot, Math.abs(a.wiggle)); if (a.wiggle * prev < 0) signs++; prev = a.wiggle || prev; assert.strictEqual(a.rot, 0, 'the leaf card itself does not rotate (only the face wiggles; the pendulum swing is c.swing)'); }
      if (misT !== null && a.state === 'down') downT = w.time;
    }
    assert.ok(Math.abs(downT - misT - show) < 0.02, 'show ' + (downT - misT));
    assert.ok(maxRot > 0.05 && maxRot <= 0.0801, 'wiggle ' + maxRot); assert.ok(signs >= 4 && signs <= 6, 'wiggles ' + signs);
    assert.strictEqual(w.phase, 'play'); assert.strictEqual(w.mismatches, 1);
  }
  const w = mkWorld({ age: 4 }); roundOf(w, 'animals', 3); untilPhase(w, 'play'); ev(w);
  const [a, b] = twoDifferent(w);
  tap(w, a); tap(w, b); run(w, 0.4); ev(w);
  assert.strictEqual(w.phase, 'resolve');
  const c = downCards(w).find(x => x.id !== a.id && x.id !== b.id);
  assert.strictEqual(tap(w, c), null, 'faces shown < 0.5 s: the third tap waits');
  run(w, 0.35); ev(w);
  assert.strictEqual(tap(w, c), c.id);
  const E = ev(w);
  assert.strictEqual(a.state, 'down'); assert.strictEqual(b.state, 'down'); assert.strictEqual(c.state, 'up');
  assert.ok(E.some(e => e.type === 'flip' && e.id === c.id)); assert.ok(!E.some(e => e.type === 'mismatch'), 'counted once');
  assert.strictEqual(w.mismatches, 1); assert.deepStrictEqual(w.open, [c.id]);
  const w2 = mkWorld({ age: 4 }); roundOf(w2, 'animals', 3); untilPhase(w2, 'play'); ev(w2);
  const [a2, b2] = twoDifferent(w2); tap(w2, a2); tap(w2, b2);
  const c2 = downCards(w2).find(x => x !== a2 && x !== b2); assert.strictEqual(tap(w2, c2), null);
  run(w2, 0.4); assert.strictEqual(w2.mismatches, 1); assert.ok(ev(w2).some(e => e.type === 'mismatch')); assert.strictEqual(c2.state, 'down');
  const w3 = mkWorld({ age: 4 }); roundOf(w3, 'animals', 3); untilPhase(w3, 'play');
  const p3 = pairOf(w3, w3.cards[0].key); tap(w3, p3[0]); tap(w3, p3[1]);
  const o3 = downCards(w3)[0]; assert.strictEqual(tap(w3, o3), null); run(w3, 2.2); assert.strictEqual(p3[0].state, 'matched'); assert.strictEqual(w3.found, 1);
});

test('taps: only in play / mismatch resolve; matched → tap; misses → null; just after a match opens wait; hit rect +10 px, nearest wins', () => {
  const w = mkWorld(); roundOf(w, 'animals', 2);
  const c0 = w.cards[0];
  assert.strictEqual(w.pointerDown(c0.hx, c0.hy), null, 'not during the scroll');
  untilPhase(w, 'peek'); assert.strictEqual(w.pointerDown(c0.x, c0.y), null, 'not during the peek');
  untilPhase(w, 'play'); ev(w);
  const g = w.layout.grid;
  assert.strictEqual(w.pointerDown(c0.x + g.cw / 2 + 7, c0.y), c0.id); ev(w);
  assert.strictEqual(w.pointerDown(w.layout.W - 2, w.layout.H / 2), null);
  const [a, b] = pairOf(w, c0.key);
  const other = downCards(w).find(c => c.key !== c0.key);
  tap(w, b); waitOpen(w, a); waitOpen(w, b); w.update(H); ev(w);
  assert.strictEqual(w.phase, 'resolve');
  assert.strictEqual(tap(w, other), null);
  assert.strictEqual(tap(w, a), a.id, 'tap on a matched leaf speaks'); assert.strictEqual(ev(w)[0].type, 'tap');
  run(w, 0.5); assert.strictEqual(w.phase, 'play'); assert.strictEqual(tap(w, other), other.id);
});

test('hints (with the old streak 3 / glow 2.5 config; the game uses 2 / 6 s): 3 mismatches in a row → hint {a, b} (glow 2.5 s + the closed leaf lifts to ≈ 0.3); cooldown 6 s; manual hint(); idle nudges 12/30/57/87 s, hint from the 2nd', () => {
  const w = mkWorld({ age: 5, config: { hintAfterStreak: 3, hintGlowTime: 2.5 } }); roundOf(w, 'animals', 3); untilPhase(w, 'play'); ev(w);
  const hints = [];
  for (let k = 0; k < 3; k++) {
    const [a, b] = twoDifferent(w); tap(w, a); tap(w, b); run(w, CFG.mismatchShow + 0.5);
    for (const e of ev(w)) if (e.type === 'hint') hints.push(e);
  }
  assert.strictEqual(hints.length, 1);
  const A = w.cardById(hints[0].a), B = w.cardById(hints[0].b);
  assert.strictEqual(A.key, B.key); assert.strictEqual(w.streak, 0);
  const w2 = mkWorld({ age: 5, config: { hintAfterStreak: 3, hintGlowTime: 2.5 } }); roundOf(w2, 'animals', 3); untilPhase(w2, 'play'); ev(w2);
  assert.ok(w2.hint()); const he = ev(w2).find(e => e.type === 'hint'); const HA = w2.cardById(he.a);
  let maxO = 0, glowSeen = 0, t = 0;
  while (t < 3) { w2.update(H); t += H; maxO = Math.max(maxO, HA.open); glowSeen = Math.max(glowSeen, HA.glow); }
  assert.ok(maxO > 0.28 && maxO < 0.45, 'crack ' + maxO); assert.ok(glowSeen > 0.99); assert.strictEqual(HA.glow, 0); assert.ok(HA.open < 0.01);
  assert.strictEqual(HA.state, 'down');
  const w3 = mkWorld({ age: 5, config: { hintAfterStreak: 3, hintGlowTime: 2.5 } }); roundOf(w3, 'animals', 3); untilPhase(w3, 'play'); ev(w3);
  const hs = [];
  for (let k = 0; k < 8; k++) { const [a, b] = twoDifferent(w3); tap(w3, a); tap(w3, b); run(w3, 1.4 + CFG.mismatchShow - 1); for (const e of ev(w3)) if (e.type === 'hint') hs.push(k); }
  assert.deepStrictEqual(hs, [2, 6], 'cooldown ' + hs);
  const w4 = mkWorld({ age: 4, config: { hintAfterStreak: 3, hintGlowTime: 2.5 } }); roundOf(w4, 'colors', 2); untilPhase(w4, 'play'); ev(w4);
  const t0 = w4.time, idles = [], ih = [];
  run(w4, 90, () => { for (const e of w4.events) { if (e.type === 'idle') idles.push(+(w4.time - t0).toFixed(2)); if (e.type === 'hint' && e.idle) ih.push(w4.time - t0); } w4.events.length = 0; });
  assert.deepStrictEqual(idles.slice(0, 4).map(Math.round), [12, 30, 57, 87]);
  assert.ok(ih.length >= 2 && Math.round(ih[0]) === 30, 'idle hint from the 2nd nudge');
  const w5 = mkWorld({ age: 4, config: { hintAfterStreak: 3, hintGlowTime: 2.5 } }); roundOf(w5, 'colors', 2); untilPhase(w5, 'play'); ev(w5);
  run(w5, 10); w5.pointerDown(w5.layout.W / 2, 2); run(w5, 10); assert.ok(!ev(w5).some(e => e.type === 'idle'));
});

test('stars: mismatches ≤ max(1, pairs − 1) → 3, ≤ 2·pairs → 2, else 1; Talk right → +1', () => {
  for (const [m, want] of [[0, 3], [3, 3], [4, 2], [8, 2], [9, 1]]) {
    const w = mkWorld({ age: 5, config: { hintAfterStreak: 3, hintGlowTime: 2.5 } }); roundOf(w, 'animals', 3); untilPhase(w, 'play'); ev(w);
    assert.strictEqual(w.pairs, 4);
    for (let k = 0; k < m; k++) { const [a, b] = twoDifferent(w); tap(w, a); tap(w, b); run(w, CFG.mismatchShow + 0.5); }
    solveRound(w);
    const rd = ev(w).find(e => e.type === 'roundDone');
    assert.strictEqual(rd.mismatches, m); assert.strictEqual(rd.stars, want, m + ' mismatches');
  }
  const w = mkWorld({ age: 3 }); roundOf(w, 'animals', 0); untilPhase(w, 'play');
  const [a, b] = twoDifferent(w); tap(w, a); tap(w, b); run(w, 2.6); solveRound(w);
  assert.strictEqual(w.roundStars, 3);
});

test('cheer: 0.7 s after the last pair the tree cheers 1.2 s (cheer {x, y} at the branch centre, leaves sway in a wave 0.06 s apart + faces hop, Lolo backflips) → roundDone 0.8 s → the next scroll', () => {
  const w = mkWorld({ age: 4, config: { hintAfterStreak: 3, hintGlowTime: 2.5 } }); roundOf(w, 'colors', 2); untilPhase(w, 'play'); ev(w);
  const keys = [...new Set(w.cards.map(c => c.key))];
  let cheerE = null, cheerT = null, doneT = null, hopStart = {}, kickT = {}, n = 0, flips = 0;
  for (const k of keys) { const p = pairOf(w, k); tap(w, p[0]); tap(w, p[1]); run(w, 0.7); }
  const vs = {};
  while (w.state !== 'roundDone' && n++ < 2000) {
    for (const c of w.cards) vs[c.id] = c.vswing;
    w.update(H);
    for (const e of ev(w)) { if (e.type === 'cheer') { cheerE = e; cheerT = w.time; } if (e.type === 'roundDone') doneT = w.time; if (e.type === 'backflip') flips++; }
    if (cheerT !== null) for (const c of w.cards) {
      if (c.bounce > 0 && hopStart[c.id] === undefined) hopStart[c.id] = w.time;
      if (kickT[c.id] === undefined && c.vswing - vs[c.id] > 0.4) kickT[c.id] = w.time;
    }
    if (w.phase === 'cheer') assert.ok(w.cheer >= 0 && w.cheer <= 1);
  }
  const B = w.layout.grid.building;
  assert.ok(cheerE && Math.abs(cheerE.x - (B.x + B.w / 2)) < 1e-6 && Math.abs(cheerE.y - (B.y - B.roofH / 2)) < 1e-6, 'branch centre');
  assert.ok(Math.abs(doneT - cheerT - CFG.cheerTime) < 0.02, 'cheer 1.2 s');
  assert.strictEqual(flips, 1, 'one backflip');
  const order = w.cards.slice().sort((a, b) => a.slot - b.slot);
  for (let i = 1; i < order.length; i++) {
    const dh = hopStart[order[i].id] - hopStart[order[i - 1].id], dk = kickT[order[i].id] - kickT[order[i - 1].id];
    assert.ok(dh > 0.04 && dh < 0.08, 'hop wave'); assert.ok(dk > 0.04 && dk < 0.08, 'swing wave ' + dk);
  }
  const w2 = mkWorld({ age: 4, config: { hintAfterStreak: 3, hintGlowTime: 2.5 } }); roundOf(w2, 'colors', 2); untilPhase(w2, 'play'); ev(w2);
  const ks = [...new Set(w2.cards.map(c => c.key))];
  for (let i = 0; i < ks.length - 1; i++) { const p = pairOf(w2, ks[i]); tap(w2, p[0]); tap(w2, p[1]); run(w2, 0.7); }
  const pl = pairOf(w2, ks[ks.length - 1]); tap(w2, pl[0]); tap(w2, pl[1]); let mT = null, cT = null; n = 0;
  while (cT === null && n++ < 400) { w2.update(H); for (const e of ev(w2)) { if (e.type === 'match') mT = w2.time; if (e.type === 'cheer') cT = w2.time; } }
  assert.ok(Math.abs(cT - mT - CFG.matchCelebrate) < 0.02, 'celebrate ' + (cT - mT)); assert.strictEqual(w2.lolo.mood, 'cheer');
  run(w2, CFG.cheerTime + CFG.roundDoneTime + 0.03); assert.strictEqual(w2.phase, 'scroll'); assert.strictEqual(w2.round, 3);
});

test('vine swing: on 12 viewports Lolo leaps (apex = the grab: tangential), swings on a real pendulum (|hand − pivot| = len), lets go, flies a ballistic arc (g 980) and lands on the new log at her seat — on screen, under the HUD, above the floor the whole time', () => {
  const rows = [];
  for (const v of VIEWPORTS) {
    const w = mkWorld({ vp: v, age: 4 }); roundOf(w, 'colors', 1); untilPhase(w, 'play'); solveRound(w); run(w, CFG.roundDoneTime + 0.01); ev(w);
    assert.strictEqual(w.phase, 'scroll', v.name);
    const L = w.layout, g = w.lolo, Hh = L.lolo.h, P = w._plan;
    assert.ok(!P.none && w.scrollTime >= 1.6 && w.scrollTime <= 1.9, v.name + ' plan');
    const ph = []; let prevV = null, prevP = null, land = null, maxDev = 0, maxAcc = 0, n = 0, held = 0;
    const vsamples = [];
    while (w.phase === 'scroll' && n++ < 400) {
      w.update(H);
      for (const e of ev(w)) if (e.type === 'swing') { ph.push(e.phase); if (e.phase === 'land') land = e; }
      if (g.hang) {
        const V = g.vine;
        assert.ok(V.hy >= L.ins.top + CFG.hudH - 1e-6, v.name + ' under the HUD ' + V.hy);
        assert.ok(V.hy + CFG.hangBottomK * Hh <= L.groundY + 24 + 1e-6, v.name + ' above the floor');
        assert.ok(V.hx - 0.36 * Hh >= L.ins.left - 1e-6 && V.hx + 0.36 * Hh <= L.W - L.ins.right + 1e-6, v.name + ' on screen x ' + V.hx);
        assert.ok(V.py < 0, 'pivot above the screen top');
        assert.ok(Number.isFinite(V.ang + V.ex + V.ey + V.px));
        if (V.held) { held++; maxDev = Math.max(maxDev, Math.abs(Math.hypot(V.hx - V.px, V.hy - V.py) - V.len)); assert.ok(V.ex === V.hx && V.ey === V.hy); }
        // ballistic in the world frame (screen + camera): constant gravity while flying
        const cam = L.W * smooth(w.phaseTime / w.scrollTime);
        vsamples.push({ x: V.hx + cam, y: V.hy, f: V.phase });
      }
    }
    assert.deepStrictEqual(ph, ['leap', 'grab', 'release', 'land'], v.name);
    assert.ok(held > 5 && maxDev < 1e-6, v.name + ' pendulum length ' + maxDev);
    const fly = vsamples.filter(s => s.f === 'fly').slice(0, -1);   // the last one is the exact touch-down point
    for (let i = 2; i < fly.length; i++) { const ay = (fly[i].y - 2 * fly[i - 1].y + fly[i - 2].y) / (H * H), ax = (fly[i].x - 2 * fly[i - 1].x + fly[i - 2].x) / (H * H);
      maxAcc = Math.max(maxAcc, Math.abs(ay - 980), Math.abs(ax)); }
    assert.ok(fly.length > 20 && maxAcc < 1, v.name + ' ballistic ' + maxAcc);
    const leap = vsamples.filter(s => s.f === 'leap');
    for (let i = 2; i < leap.length; i++) assert.ok(Math.abs((leap[i].y - 2 * leap[i - 1].y + leap[i - 2].y) / (H * H) - 980) < 1, 'leap ballistic');
    assert.ok(Math.abs(leap.length * H - 0.2) < 0.02, 'leap 0.2 s');
    // landing: the seat of the new log, then she rides it in with the camera
    assert.ok(land && Math.abs(land.y - L.lolo.y) < 1e-9);
    assert.strictEqual(g.dx, 0); assert.strictEqual(g.hang, false); assert.strictEqual(g.vine, null);
    rows.push(`${v.name} ${w.scrollTime.toFixed(2)} s θ ${(P.thR * 180 / Math.PI).toFixed(0)}° L ${P.Lv.toFixed(0)}`);
  }
  console.log('      ' + rows.join(' · '));
  // the hand point at the land event = the new seat (world): x = seat + W − camera at landing
  const w = mkWorld({ vp: VIEWPORTS[8] }); roundOf(w, 'colors', 1); untilPhase(w, 'play'); solveRound(w); run(w, CFG.roundDoneTime + 0.01); ev(w);
  let landDx = null, sq = 0, n = 0;
  while (w.phase === 'scroll' && n++ < 400) { w.update(H); for (const e of ev(w)) if (e.type === 'swing' && e.phase === 'land') landDx = w.lolo.dx; sq = Math.max(sq, w.lolo.squash); }
  assert.ok(landDx > 0, 'lands before the scroll ends and rides in on the new log'); assert.ok(sq > 0.1, 'landing squash');
  assert.strictEqual(w.pointerDown(w.layout.lolo.x, w.layout.lolo.y - 30), 'lolo');
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
  assert.strictEqual(w.collected.length, 4 * CFG.pairsByAge[4].reduce((a, b) => a + b, 0) - (w.levels.includes('colors') ? 0 : 0));
  const w2 = mkWorld({ age: 4 }); w2.newSession();
  let rounds = 0; n = 0;
  while (w2.state !== 'talk' && n++ < 400000) {
    if (w2.state === 'round' && w2.phase === 'play' && !w2.open.length && w2.phaseTime > 9) { const d = downCards(w2); const p = pairOf(w2, d[0].key); tap(w2, p[0]); tap(w2, p[1]); w2.pointerDown(w2.layout.W / 2, 2); }
    w2.update(H * 4);
    for (const e of ev(w2)) if (e.type === 'round') rounds++;
  }
  assert.strictEqual(rounds, 3); assert.ok(w2.time - w2.levelStartTime > CFG.chapterTimeLimit);
  assert.ok(w2.lastBuilding && w2.lastBuilding.cards.length, 'the lit tree stays behind the Talk panel');
  const w3 = mkWorld({ age: 4 }); w3.newSession(); const pairs = []; n = 0;
  while (w3.level === 0 && w3.state !== 'talk' && n++ < 400000) {
    if (w3.state === 'round' && w3.phase === 'play' && !w3.open.length && w3.phaseTime > (w3.round === 2 ? 42 : 1)) { const d = downCards(w3); const p = pairOf(w3, d[0].key); tap(w3, p[0]); tap(w3, p[1]); w3.pointerDown(w3.layout.W / 2, 2); }
    w3.update(H * 4);
    for (const e of ev(w3)) if (e.type === 'round') pairs.push([e.pairs, e.held]);
  }
  assert.deepStrictEqual(pairs.map(p => p[0]), [2, 2, 3, 3].slice(0, pairs.length));
  const w4 = mkWorld({ age: 5 }); w4.newSession(); w4.levels = ['shapes', 'count', 'letters', 'food']; w4.startLevel(0); const pairs4 = []; n = 0;
  while (w4.level === 0 && w4.state !== 'talk' && n++ < 400000) {
    if (w4.state === 'round' && w4.phase === 'play' && !w4.open.length && w4.phaseTime > (w4.round === 1 ? 42 : 1)) { const d = downCards(w4); const p = pairOf(w4, d[0].key); tap(w4, p[0]); tap(w4, p[1]); w4.pointerDown(w4.layout.W / 2, 2); }
    w4.update(H * 4);
    for (const e of ev(w4)) if (e.type === 'round') pairs4.push([e.pairs, e.held]);
  }
  assert.deepStrictEqual(pairs4.slice(0, 3), [[2, false], [3, false], [3, true]], JSON.stringify(pairs4));
  // the first round after a Talk: the last building of the chapter scrolls out
  const w5 = mkWorld({ age: 4 }); w5.newSession(); n = 0; let sc = [];
  while (w5.level < 1 || w5.state !== 'round') { if (w5.state === 'round' && w5.phase === 'play' && !w5.open.length) { const d = downCards(w5); if (d.length) { const p = pairOf(w5, d[0].key); tap(w5, p[0]); tap(w5, p[1]); } }
    if (w5.state === 'talk' && !w5.talkAnswered) w5.talkAnswer(w5.talk.answerId); w5.update(H * 4); for (const e of ev(w5)) if (e.type === 'scroll') sc.push(e.first); if (n++ > 200000) break; }
  assert.strictEqual(sc[0], true); assert.ok(sc.slice(1).every(f => f === false), 'only the very first tree slides in alone'); assert.ok(w5.prevBuilding);
});

test('talk: re-ask every 12 s without an answer; glowAnswer from the 2nd re-ask; answer → +1 star, levelDone after 2 s', () => {
  const w = mkWorld(); w.levels = ['animals', 'colors', 'shapes', 'food']; w.startLevel(0); w._startTalk(); ev(w);
  const asks = []; run(w, 37, () => { for (const e of w.events) if (e.type === 'talkAsk') asks.push([e.n, e.glowAnswer]); w.events.length = 0; });
  assert.deepStrictEqual(asks, [[1, false], [2, true], [3, true]]);
  const s0 = w.stars; assert.strictEqual(w.talkAnswer(w.talk.answerId), true); assert.strictEqual(w.stars, s0 + 1);
  assert.strictEqual(w.talkAnswer(w.talk.answerId), false, 'only once');
  run(w, 2.05); assert.strictEqual(w.state, 'levelDone');
});

test('resize mid-round: leaves move to the new grid + tree (stems re-hung), open leaves stay open, Lolo stays clear; a resize mid-swing puts her on her log', () => {
  const w = mkWorld({ age: 4 }); roundOf(w, 'animals', 2); untilPhase(w, 'play');
  const p = pairOf(w, w.cards[0].key); tap(w, p[0]); tap(w, p[1]); run(w, 1.5);
  const up = downCards(w)[0]; tap(w, up); run(w, 0.3);
  for (const v of [VIEWPORTS[3], VIEWPORTS[5], VIEWPORTS[7], VIEWPORTS[0]]) {
    w.setViewport(v.W, v.H, v.ins);
    const g = w.layout.grid;
    assert.ok(g && g.cw >= 120 && g.building && g.building.rows.length === g.rows);
    for (const c of w.cards) { assert.ok(insideR(w.cardRect(c), g.board)); assert.strictEqual(c.w, g.cw); const s = g.slots[c.slot]; assert.ok(c.py === s.py && c.stem === s.stem); }
    assert.strictEqual(up.state, 'up'); assert.strictEqual(p[0].state, 'matched');
    for (let i = 0; i < 40; i++) { w.update(H); loloOk(w, v.name); }
  }
  run(w, 1); w.round = 0; solveRound(w); assert.strictEqual(w.state, 'roundDone');
  // a rotation mid-swing: she is on the NEW log at once and rides in with it; exactly one 'land' per scroll
  for (const [delay, label] of [[0.5, 'in the air'], [0.03, 'before the leap']]) {
    if (w.state === 'roundDone') run(w, CFG.roundDoneTime - w.stateTime + 0.005);
    ev(w); run(w, delay); if (delay > 0.3) assert.ok(w.lolo.hang, 'swinging');
    let lands = ev(w).filter(e => e.type === 'swing' && e.phase === 'land').length;
    const v = w.layout.W === 1280 ? VIEWPORTS[3] : VIEWPORTS[8]; w.setViewport(v.W, v.H, v.ins);
    assert.strictEqual(w.lolo.hang, false, label); assert.strictEqual(w.lolo.vine, null);
    assert.ok(Math.abs(w.lolo.dx - w.buildingDx) < 1e-6, label + ' on the new log');
    let n = 0; while (w.phase === 'scroll' && n++ < 400) { w.update(H); for (const e of ev(w)) if (e.type === 'swing' && e.phase === 'land') lands++; if (w.phase === 'scroll') assert.ok(Math.abs(w.lolo.dx - w.buildingDx) < 1e-6, label + ' rides in'); }
    for (const e of w.events) if (e.type === 'swing' && e.phase === 'land') lands++;
    lands += ev(w).filter(e => e.type === 'swing' && e.phase === 'land').length;
    assert.strictEqual(lands, 1, label + ' one land event'); assert.strictEqual(w.lolo.dx, 0);
    untilPhase(w, 'play'); loloOk(w, 'after'); w.round = 0; solveRound(w);
  }
});

test('interpolation: _px/_py/_popen/_pflip/_pbloom/_pswing, Lolo _plean/_parmA/_phop/_pflipRot/_pdx, vine _phx/_phy/_pang/_ppx, _pscroll are the previous sub-step; alpha in [0,1)', () => {
  const w = mkWorld(); roundOf(w, 'colors', 1); run(w, 0.2);
  const s0 = w.scroll; w.update(H); assert.strictEqual(w._pscroll, s0);
  const V = w.lolo.vine, hx = V.hx, hy = V.hy, an = V.ang, px = V.px; w.update(H);
  assert.strictEqual(V._phx, hx); assert.strictEqual(V._phy, hy); assert.strictEqual(V._pang, an); assert.strictEqual(V._ppx, px);
  w.update(H * 0.4); assert.ok(w.alpha > 0.35 && w.alpha < 0.45);
  untilPhase(w, 'play'); const c = w.cards[0]; tap(w, c);
  const o0 = c.open, f0 = c.flip, sw = c.swing, g = w.lolo, l0 = g.lean, a0 = g.armA, h0 = g.hop, d0 = g.dx; w.update(H);
  assert.strictEqual(c._popen, o0); assert.strictEqual(c._pflip, f0); assert.strictEqual(c._pswing, sw);
  assert.strictEqual(g._plean, l0); assert.strictEqual(g._parmA, a0); assert.strictEqual(g._phop, h0); assert.strictEqual(g._pdx, d0);
  const hb = LL.World.loloHead(w, 0), hb1 = LL.World.loloHead(w, 1); assert.ok(Number.isFinite(hb.jx + hb1.jy));
});

test('same leaf again and again: taps on the one turned leaf do not reset idle; 3 of them → auto hint on its partner', () => {
  const w = mkWorld({ age: 4 }); roundOf(w, 'animals', 3); untilPhase(w, 'play'); ev(w);
  const c = downCards(w)[0]; tap(w, c); run(w, 0.4); ev(w);
  run(w, 5); tap(w, c); run(w, 1); tap(w, c);
  assert.ok(w._idleT > 5.9, 'idle timer keeps running ' + w._idleT);
  assert.ok(!ev(w).some(e => e.type === 'hint'));
  tap(w, c); const E = ev(w), h = E.find(e => e.type === 'hint');
  assert.ok(h, '3rd same tap → hint'); assert.ok([w.cardById(h.a), w.cardById(h.b)].every(x => x.key === c.key));
  assert.ok(E.filter(e => e.type === 'tap').length === 1, 'still says the name');
});

// ======================================================= surprises (toucan / frog / butterfly); no traffic
function surpriseRound(type, o) {
  o = o || {};
  const w = mkWorld({ age: o.age || 4, surprise: true, vp: o.vp, seed: o.seed });
  w.levels = ['animals', 'colors', 'shapes', 'count']; w._surpriseOff = CFG.surpriseTypes.indexOf(type); w.startLevel(0); w.round = 2; w._beginRound();
  assert.strictEqual(w.surprise, type);
  untilPhase(w, 'play'); ev(w);
  let n = 0; while (!w.critter && n++ < 1200) w.update(H);
  assert.ok(w.critter && w.critter.type === type, type + ' appears');
  return w;
}
test('surprise round: round index 2 of every chapter, toucan / frog / butterfly rotate per chapter from a session-random start', () => {
  const offs = new Set();
  for (let s = 1; s < 30; s++) {
    const w = new LL.World({ seed: s, age: 4 }); w.setViewport(1280, 720, null);
    const bot = new LL.Bot(w, { skill: 1, seed: s }); w.newSession();
    const seen = [];
    while (w.state !== 'sessionDone') { bot.step(1 / 30); w.update(1 / 30); for (const e of w.drainEvents()) if (e.type === 'round') { if (e.round === 2) seen.push(e.surprise); else assert.strictEqual(e.surprise, null); } }
    assert.strictEqual(seen.length, 4);
    const T = CFG.surpriseTypes, o = T.indexOf(seen[0]); offs.add(o);
    seen.forEach((t, L) => assert.strictEqual(t, T[(o + L) % 3]));
  }
  assert.deepStrictEqual(CFG.surpriseTypes, ['toucan', 'frog', 'butterfly']);
  assert.strictEqual(offs.size, 3);
});

test('surprise toucan: flies in on an arc, lands ON a row vine between two leaves, bobs, hops along the vine; tap → "critter", flaps off; never a mistake; leaves at the cheer', () => {
  const w = surpriseRound('toucan');
  const k = w.critter; assert.strictEqual(k.state, 'fly');
  let landed = null, n = 0, minY = 1e9;
  while (k.state === 'fly' && n++ < 400) { w.update(H); minY = Math.min(minY, k.y); for (const e of ev(w)) if (e.type === 'critter' && e.action === 'land') landed = e; }
  assert.ok(landed && k.state === 'sit');
  const row = w.layout.grid.building.rows[k.perchRow];
  assert.ok(Math.abs(k.y - LL.World.vineY(row, k.x)) < 1e-6, 'on the vine');
  const inRow = w.cards.filter(c => c.row === k.perchRow);
  assert.ok(!inRow.some(c => Math.abs(k.x - c.x) < c.w / 2 - 1e-6), 'between leaves, not over a stem');
  assert.ok(minY < Math.min(k._bz.y0, k.y) - 10, 'an arc');
  let bobs = 0, pv = 0; run(w, 4, () => { if (k.bob > 0 && pv === 0) bobs++; pv = k.bob; }); assert.ok(bobs >= 1, 'bobs');
  const R = w.critterRect(), m0 = w.mismatches, op = w.open.length;
  assert.strictEqual(w.pointerDown(R.x + R.w / 2, R.y + R.h / 2), 'critter');
  const E = ev(w); assert.ok(E.some(e => e.type === 'critter' && e.critter === 'toucan' && e.action === 'tap'));
  assert.ok(!E.some(e => e.type === 'flip')); assert.strictEqual(w.mismatches, m0); assert.strictEqual(w.open.length, op);
  assert.strictEqual(k.state, 'away'); run(w, 1.4); assert.strictEqual(w.critter, null, 'gone');
  // hops along the vine to another gap every 8–14 s
  const w4 = surpriseRound('toucan', { seed: 11, age: 6 }); let hops = 0; n = 0;
  run(w4, 16, () => { if (w4.critter && w4.critter.state === 'hop' && !w4._h) { hops++; w4._h = 1; } if (w4.critter && w4.critter.state === 'sit') w4._h = 0; });
  assert.ok(hops >= 1, 'hops along'); const k4 = w4.critter; if (k4 && k4.state === 'sit') assert.ok(Math.abs(k4.y - LL.World.vineY(w4.layout.grid.building.rows[k4.perchRow], k4.x)) < 1e-6);
  const w3 = surpriseRound('toucan', { seed: 5 }); run(w3, 2);
  const ks = [...new Set(w3.cards.map(q => q.key))]; let left = false;
  for (const kk of ks) { const p = pairOf(w3, kk); tap(w3, p[0]); tap(w3, p[1]); run(w3, 0.7, () => { for (const e of w3.events) if (e.type === 'critter' && e.action === 'leave') left = true; }); }
  run(w3, 1.5, () => { for (const e of w3.events) if (e.type === 'critter' && e.action === 'leave') left = true; });
  assert.ok(left || !w3.critter, 'flies off at the cheer');
});

test('critter vs leaf: a turnable leaf under the finger wins unless the finger is in the middle 60 % of the toucan / butterfly box', () => {
  for (const type of ['butterfly', 'toucan']) {
    let checked = 0;
    for (let s = 1; s <= 20 && checked < 3; s++) {
      const w = surpriseRound(type, { seed: s, age: 6 }); const k = w.critter;
      let n = 0; while (k.state === 'fly' && n++ < 400) w.update(H);
      const R = w.critterRect(); if (!R) continue;
      const m = 0.2, core = { x: R.x + m * R.w, y: R.y + m * R.h, w: 0.6 * R.w, h: 0.6 * R.h };
      // a point in the box but outside the core, over a face-down leaf
      let pt = null;
      for (const [fx, fy] of [[0.05, 0.5], [0.95, 0.5], [0.5, 0.05], [0.5, 0.95], [0.05, 0.05], [0.95, 0.95]]) {
        const x = R.x + fx * R.w, y = R.y + fy * R.h, c = w._hit(x, y);
        if (c && c.state === 'down' && !(x >= core.x && x <= core.x + core.w && y >= core.y && y <= core.y + core.h)) { pt = [x, y, c]; break; }
      }
      if (!pt) continue;
      assert.strictEqual(w.pointerDown(pt[0], pt[1]), pt[2].id, type + ' edge → the leaf'); w.pointerUp();
      assert.ok(w.critter && w.critter.state !== 'away');
      assert.strictEqual(w.pointerDown(R.x + R.w / 2, R.y + R.h / 2), 'critter', type + ' core → the critter');
      checked++;
    }
    assert.ok(checked >= 1, type + ' found a case');
  }
});

test('surprise frog: hops in from the left along the floor (ballistic hops 60–80 px, apex 34 px, every 0.6–0.9 s, squash), sits mid-screen 2.5 s croaking, hops off right; tap → a big 120 px jump; leaf taps still work', () => {
  const w = surpriseRound('frog');
  const k = w.critter, L = w.layout; assert.ok(k.x < 0 && Math.abs(k.y - (L.groundY + 52)) < 1e-6);
  let hops = [], maxHy = 0, stopT = null, outT = null, n = 0, sq = 0, croaks = 0, pc = 0, lastStart = null, gaps = [];
  while (k.state !== 'out' && n++ < 12000) {
    w.update(H); maxHy = Math.max(maxHy, k.hy); sq = Math.max(sq, k._q);
    assert.ok(Math.abs(k.y - (L.groundY + 52)) < 1e-6, 'feet on the floor line (hy lifts it)');
    for (const e of ev(w)) if (e.type === 'critter' && e.action === 'hop') { hops.push(k.x); if (lastStart !== null) gaps.push(w.time - lastStart); lastStart = w.time; }
      else if (e.type === 'critter' && e.action === 'stop') stopT = w.time;
    if (k.state === 'stop') { if (k.croak > 0 && pc === 0) croaks++; pc = k.croak; }
  }
  outT = w.time;
  assert.ok(Math.abs(maxHy - 34) < 0.5, 'apex ' + maxHy); assert.ok(sq > 0.1, 'landing squash');
  assert.ok(gaps.slice(0, -1).every(g => g >= 0.6 - 0.02 && g <= 0.9 + 0.02), 'every 0.6–0.9 s ' + gaps.map(g => g.toFixed(2)));
  const R0 = L.loloRect; assert.ok(k.x - 0.45 * CFG.frogSize >= R0.x + R0.w + 40 - 1e-6, 'never stops at Lolo\'s feet ' + k.x);
  assert.ok(k.x >= L.W / 2 - 40 - 1e-6 && k.x < Math.max(L.W / 2 - 40, R0.x + R0.w + 40 + 0.45 * CFG.frogSize) + 81, 'stops mid-screen ' + k.x); assert.ok(Math.abs(outT - stopT - 2.5) < 0.05, 'sits 2.5 s');
  for (const vp of [VIEWPORTS[3], VIEWPORTS[7], VIEWPORTS[4]]) { const wf = surpriseRound('frog', { vp, seed: 3 }); const kf = wf.critter, Rf = wf.layout.loloRect; let m = 0;
    while (kf.state === 'in' && m++ < 20000) wf.update(H); assert.ok(kf.x - 0.45 * CFG.frogSize >= Rf.x + Rf.w + 40 - 1e-6, vp.name + ' frog stop clear of Lolo'); }
  assert.ok(croaks >= 2 && croaks <= 4, 'croaks ' + croaks);
  const w2 = surpriseRound('frog', { seed: 7 }); const k2 = w2.critter; n = 0; while (k2.state !== 'stop' && n++ < 12000) w2.update(H);
  const R = w2.critterRect(); assert.strictEqual(w2.pointerDown(R.x + R.w / 2, R.y + R.h / 2), 'critter');
  assert.ok(ev(w2).some(e => e.type === 'critter' && e.critter === 'frog' && e.action === 'tap'));
  let big = 0; run(w2, 1.2, () => { big = Math.max(big, k2.hy); }); assert.ok(Math.abs(big - 120) < 1, 'big jump ' + big);
  n = 0; while (w2.critter && n++ < 40000) w2.update(H); assert.strictEqual(w2.critter, null, 'hopped off');
  const d = downCards(w2)[0]; assert.strictEqual(tap(w2, d), d.id);
});

test('surprise butterfly: rises from the floor at 45 px/s in front of the leaves on a wavy path (±26 px, 0.5 Hz), flaps 9 Hz, a colour not on the round; tap → spirals up fast; gone off the top', () => {
  const w = surpriseRound('butterfly');
  const k = w.critter, g = w.layout.grid.rect;
  assert.ok(k.x >= g.x && k.x <= g.x + g.w, 'in front of the leaves'); assert.ok(LL.PALETTE[k.color]);
  assert.ok(!w.cards.some(c => c.face.color === k.color), 'not a colour of the round');
  w.wind = 0;
  const y0 = k.y; let lo = 1e9, hi = -1e9; run(w, 2, () => { w.wind = 0; lo = Math.min(lo, k.x - k.x0); hi = Math.max(hi, k.x - k.x0); });
  assert.ok(Math.abs((y0 - k.y) / 2 - 45) < 1, 'rise 45 px/s'); assert.ok(hi <= 26 + 1e-6 && lo >= -26 - 1e-6 && hi - lo > 40, 'wavy ' + lo + ' ' + hi);
  const f0 = k.flap; w.update(H); assert.ok(Math.abs(((k.flap - f0 + 2 * Math.PI) % (2 * Math.PI)) - 2 * Math.PI * 9 * H) < 1e-9, 'flap 9 Hz');
  const R = w.critterRect(); assert.strictEqual(w.pointerDown(R.x + R.w / 2, R.y + R.h / 2), 'critter'); assert.strictEqual(k.state, 'away');
  const y1 = k.y; run(w, 0.5); assert.ok(y1 - k.y > 80, 'fast');
  run(w, 4); assert.strictEqual(w.critter, null);
});







test('traffic: removed — w.traffic stays [] for a whole session', () => {
  const r = playSession(31, 4, 0.6, { each: (w) => assert.deepStrictEqual(w.traffic, []) });
  assert.strictEqual(r.w.state, 'sessionDone');
});

// ======================================================= determinism + bot
test('determinism: same seed + same bot → identical events; the dt split does not matter', () => {
  const hashOf = (dt) => { const r = playSession(77, 5, 0.6, { dt, keep: true, vp: VIEWPORTS[3] }); return JSON.stringify(r.events.map(e => [e.type, e.id || e.a || '', e.round])) + r.w.stars; };
  assert.strictEqual(hashOf(1 / 30), hashOf(1 / 30));
  const w1 = mkWorld({ seed: 4, age: 4, surprise: true }), rec = [], evA = [];
  const bot = new LL.Bot(w1, { skill: 0.5, seed: 9, critterTaps: 1 });
  const orig = w1.pointerDown.bind(w1);
  w1.pointerDown = (x, y) => { rec.push([Math.round(w1.time / CFG.step), x, y]); return orig(x, y); };
  const origT = w1.talkAnswer.bind(w1);
  w1.talkAnswer = (id) => { rec.push([Math.round(w1.time / CFG.step), 'talk', id]); return origT(id); };
  w1.newSession();
  for (let i = 0; i < 30 * 200; i++) { bot.step(1 / 30); w1.update(1 / 30); for (const e of w1.drainEvents()) evA.push(e.type + (e.id || e.a || e.critter || '')); }
  const w2 = mkWorld({ seed: 4, age: 4, surprise: true }), evB = []; w2.newSession();
  let k = 0;
  while (w2.time < w1.time - 1e-9) {
    const s = Math.round(w2.time / CFG.step);
    while (k < rec.length && rec[k][0] <= s) { if (rec[k][1] === 'talk') w2.talkAnswer(rec[k][2]); else w2.pointerDown(rec[k][1], rec[k][2]); k++; }
    w2.update(CFG.step); for (const e of w2.drainEvents()) evB.push(e.type + (e.id || e.a || e.critter || ''));
  }
  assert.deepStrictEqual(evB, evA);
  assert.ok(evA.some(e => e.startsWith('critter')), 'the replay includes critter taps');
});

test('bot: full sessions for every age × lang × 4 viewports × 3 skills reach sessionDone; no stuck round, no NaN; no leaf ever within 16 px of Lolo; the vine swing on screen', () => {
  const vps = [VIEWPORTS[1], VIEWPORTS[3], VIEWPORTS[5], VIEWPORTS[7]];
  let k = 0, maxRound = 0, checks = 0;
  for (const age of AGES) for (const lang of LANGS) for (const vp of vps) for (const skill of [0, 0.5, 0.9]) {
    k++;
    let rs = 0;
    const r = playSession(100 + k, age, skill, { lang, vp, each: (w, e) => {
      for (const x of e) { if (x.type === 'round') rs = w.time; if (x.type === 'roundDone') maxRound = Math.max(maxRound, w.time - rs); }
      if ((Math.round(w.time * 30) & 7) === 0) {
        for (const c of w.cards) assert.ok(Number.isFinite(c.x + c.y + c.open + c.flip + c.light + c.bloom + c.bounce + c.wiggle + c.swing + c.px + c.py), 'leaf NaN');
        if (w.critter) assert.ok(Number.isFinite(w.critter.x + w.critter.y + w.critter.rot), 'critter NaN');
        assert.ok(Number.isFinite(w.scroll + w.scrollT), 'scroll NaN');
        loloOk(w, `age ${age} ${vp.name}`); checks++;
      }
    } });
    assert.strictEqual(r.w.state, 'sessionDone', `age ${age} ${lang} skill ${skill}`);
    assert.ok(r.t < 1200, 'session ' + r.t);
  }
  assert.ok(maxRound < 300, 'longest round ' + maxRound);
  console.log('      longest round (skill 0 = no memory at all): ' + maxRound.toFixed(0) + ' s · Lolo checks ' + checks);
});

test('bot: perfect memory (skill 1) never mismatches → 3 stars every round; taps hit the leaf it aims at', () => {
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

// ======================================================= weather (jungle day)
const AMB = [
  { skyTop: '#A9D3EA', mood: 0, darkness: 0, sun: 1, sunX: 0.2, sunY: 0.32, moon: 0, stars: 0, night: 0, mist: 0.7, rain: 0, rainbow: 0, wet: 0 },
  { skyTop: '#6FBDE8', mood: 1, darkness: 0, sun: 1, sunX: 0.75, sunY: 0.12, rays: 1, moon: 0, stars: 0, night: 0 },
  { skyTop: '#9F8CC9', mood: 2, darkness: 0.15, sunX: 0.82, sunY: 0.42, moon: 0, stars: 0 },
  { skyTop: '#1E2A4A', skyBottom: '#3A4F7A', mood: 3, darkness: 0.45, sun: 0, moon: 1, moonX: 0.78, moonY: 0.16, stars: 1, night: 1, rays: 0 }
];
const AMB_KEYS = ['skyTop', 'skyBottom', 'horizon', 'tint', 'wind', 'gust', 'windBase', 'sway', 'sun', 'sunX', 'sunY', 'moon', 'moonX', 'moonY', 'stars', 'darkness', 'night',
  'mist', 'rays', 'rain', 'rainbow', 'wet', 'cloudSpeed', 'mood', 'season'];
test('weather: ambient per mood (morning, noon, sunset, night), 2.5 s crossfade, calm gusty wind within ±40 px/s', () => {
  const wx = new LL.Weather({ width: 1280, height: 720, seed: 1 });
  for (let m = 0; m < 4; m++) {
    wx.setWeather(m, { instant: true });
    const a = wx.ambient, e = AMB[m];
    for (const k of AMB_KEYS) assert.ok(k in a, 'ambient.' + k);
    for (const k in e) assert.strictEqual(a[k], e[k], 'mood ' + m + ' ' + k);
    assert.ok(/^#[0-9A-F]{6}$/.test(a.horizon));
  }
  assert.deepStrictEqual(LL.Weather.NAMES, ['morning', 'noon', 'sunset', 'night']);
  assert.strictEqual(LL.Weather.FADE_TIME, 2.5);
  wx.setWeather(0, { instant: true }); wx.setWeather(3);
  wx.update(0.6, { groundY: 630 }); wx.update(0.65, { groundY: 630 });
  assert.notStrictEqual(wx.ambient.skyTop, '#A9D3EA'); assert.notStrictEqual(wx.ambient.skyTop, '#1E2A4A'); assert.ok(wx.ambient.night > 0.3 && wx.ambient.night < 0.7, 'night ' + wx.ambient.night);
  wx.update(0.65, { groundY: 630 }); wx.update(0.65, { groundY: 630 }); assert.strictEqual(wx.ambient.skyTop, '#1E2A4A'); assert.strictEqual(wx.ambient.mood, 3); assert.strictEqual(wx.ambient.moon, 1);
  for (let m = 0; m < 4; m++) {
    const w2 = new LL.Weather({ width: 1280, height: 720, seed: 5 + m }); w2.setWeather(m, { instant: true });
    let lo = 1e9, hi = -1e9;
    for (let i = 0; i < 1800; i++) { w2.update(1 / 30, { groundY: 630 }); lo = Math.min(lo, w2.ambient.wind); hi = Math.max(hi, w2.ambient.wind); }
    assert.ok(lo >= 0 && hi <= 25 && hi > lo, 'calm jungle ' + m + ' ' + lo + ' ' + hi);
  }
});

test('weather: particles per mood (dew + pollen; falling leaves + darting dragonflies; birds; ≤ 40 fireflies blinking + stars), petals burst, cap 140, deterministic, resize', () => {
  const kinds = [];
  for (let m = 0; m < 4; m++) {
    const wx = new LL.Weather({ width: 1600, height: 720, seed: 3 }); wx.setWeather(m, { instant: true });
    const seen = {}; let maxN = 0, birds = 0, ff = 0, blink = [1, 0];
    for (let i = 0; i < 900; i++) {
      wx.update(1 / 30, { groundY: 630 });
      if (i % 50 === 0) wx.burst(800, 300, { kind: i % 100 ? 'confetti' : 'petals', n: 30, color: 'red', w: 400 });
      maxN = Math.max(maxN, wx.particles.length); birds = Math.max(birds, wx.birds.length);
      let f = 0;
      for (const p of wx.particles) {
        seen[p.kind] = 1;
        assert.ok(Number.isFinite(p.x + p.y + p.alpha + p.size + p.rot + p.flipX), 'finite');
        assert.ok(['sky', 'back', 'front'].includes(p.layer));
        assert.ok(LL.Weather.SPRITES.includes(p.sprite), p.sprite);
        assert.ok(p.alpha >= 0 && p.alpha <= 1 + 1e-9);
        if (p.kind === 'firefly') { f++; blink[0] = Math.min(blink[0], p.alpha / p.a0); blink[1] = Math.max(blink[1], p.alpha / p.a0); }
        if (p.kind === 'petals') { assert.ok(p.sprite === 'petal_a' || p.sprite === 'petal_b'); assert.ok(p.y < 630 + 41); }
        if (p.kind === 'leaf') assert.ok(p.y < 630 + 61);
      }
      ff = Math.max(ff, f);
      for (const b of wx.birds) { assert.ok(Number.isFinite(b.x + b.y + b.flap + b.s + b.alpha)); assert.ok(b.vx < 0, 'flying right → left'); assert.ok(b.y < 720 * 0.4); }
    }
    assert.ok(maxN <= LL.Weather.CAP, 'cap ' + maxN);
    kinds.push(Object.assign(seen, { birds, ff, blink }));
    if (m === 3) { assert.strictEqual(wx.stars.length, 70); wx.stars.forEach(s => assert.ok(s.y <= 0.5 * 720 && s.a >= 0.1 && s.a <= 1)); }
  }
  assert.strictEqual(LL.Weather.CAP, 140);
  assert.ok(kinds[0].sparkle && kinds[0].pollen && !kinds[0].leaf && !kinds[0].firefly && !kinds[0].birds, 'morning');
  assert.ok(kinds[1].leaf && kinds[1].dragonfly && !kinds[1].firefly && !kinds[1].birds, 'noon');
  assert.ok(kinds[2].birds >= 3 && !kinds[2].firefly && !kinds[2].leaf, 'sunset birds ' + kinds[2].birds);
  assert.ok(kinds[3].firefly && kinds[3].ff <= 40 && kinds[3].ff >= 30 && kinds[3].blink[0] < 0.3 && kinds[3].blink[1] > 0.9 && !kinds[3].leaf && !kinds[3].birds, 'night fireflies ' + kinds[3].ff);
  assert.ok(kinds.every(k => k.petals && k.confetti), 'bursts');
  const ws = new LL.Weather({ width: 1280, height: 720, seed: 9 }); ws.setWeather(2, { instant: true });
  const fl = new Set(); for (let i = 0; i < 1200; i++) { ws.update(1 / 30, { groundY: 630 }); for (const b of ws.birds) fl.add(b.flock); }
  assert.ok(fl.size >= 3, 'a flock every 5–9 s: ' + fl.size);
  const a = new LL.Weather({ width: 1280, height: 720, seed: 4 }), b = new LL.Weather({ width: 1280, height: 720, seed: 4 });
  a.setWeather(3, { instant: true }); b.setWeather(3, { instant: true });
  for (let i = 0; i < 120; i++) a.update(1 / 30, { groundY: 630 });
  for (let i = 0; i < 240; i++) b.update(1 / 60, { groundY: 630 });
  assert.deepStrictEqual(a.particles.map(p => [p.kind, Math.round(p.x * 100)]), b.particles.map(p => [p.kind, Math.round(p.x * 100)]));
  a.resize(720, 1556); assert.strictEqual(a.width, 720);
  for (let i = 0; i < 60; i++) a.update(1 / 30, { groundY: 1404 });
  assert.ok(a.particles.every(p => Number.isFinite(p.x))); assert.ok(a.stars.every(s => s.x <= 720));
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
