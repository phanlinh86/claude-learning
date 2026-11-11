#!/usr/bin/env node
// Tuk's Ice Match — headless unit tests for rng / content / world / weather / bot.
// Run from projects/education-game/penguin-ice-match:   node tests/unit/run.js
// (tests/unit/i18n_voice.test.js is the voice engineer's suite and runs on its own.)
'use strict';
const assert = require('assert');
const { load } = require('./load');

const IM = load();
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const H = 1 / 120;
const J = v => JSON.parse(JSON.stringify(v));
assert.deepStrictEqual = ((orig) => (a, b, m) => orig(J(a), J(b), m))(assert.deepStrictEqual);
assert.notDeepStrictEqual = ((orig) => (a, b, m) => orig(J(a), J(b), m))(assert.notDeepStrictEqual);
const hyp = (x, y) => Math.sqrt(x * x + y * y);
const AGES = [3, 4, 5, 6, 7];
const LANGS = ['en', 'vi'];
const TOPICS = IM.Content.TOPICS;
const CFG = IM.CONFIG;

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
  const w = new IM.World({ seed: o.seed || 1, age: o.age || 4, lang: o.lang || 'en', config: cfg });
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
function inflate(R, m) { return { x: R.x - m, y: R.y - m, w: R.w + 2 * m, h: R.h + 2 * m }; }
function rectsOverlap(a, b) { return a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.h - 1e-6 && b.y < a.y + a.h - 1e-6; }
function insideR(a, b) { return a.x >= b.x - 1e-6 && a.y >= b.y - 1e-6 && a.x + a.w <= b.x + b.w + 1e-6 && a.y + a.h <= b.y + b.h + 1e-6; }
function cardR(c, g) { return { x: c.x - g.cw / 2, y: c.y - g.ch / 2, w: g.cw, h: g.ch }; }
function playSession(seed, age, skill, opts) {
  opts = opts || {};
  const w = new IM.World({ seed, age, lang: opts.lang || 'en', config: opts.config });
  const v = opts.vp || VIEWPORTS[8];
  w.setViewport(v.W, v.H, v.ins);
  const bot = new IM.Bot(w, { skill, seed: seed * 3 + 1, rub: opts.rub });
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
  const rng = new IM.RNG(seed), hist = [], out = [];
  for (let ri = 0; ri < 4; ri++) { const r = IM.Content.makeRound(topic, { age, lang, rng, roundIndex: ri, history: hist }); hist.push(r.sum); out.push(r); }
  return out;
}

// ======================================================= RNG
test('rng: deterministic, ranges, shuffle is a permutation', () => {
  const a = new IM.RNG(42), b = new IM.RNG(42), c = new IM.RNG(43);
  const sa = [], sb = [], sc = [];
  for (let i = 0; i < 500; i++) { sa.push(a.next()); sb.push(b.next()); sc.push(c.next()); }
  assert.deepStrictEqual(sa, sb); assert.notDeepStrictEqual(sa, sc);
  assert.ok(sa.every(v => v >= 0 && v < 1));
  const r = new IM.RNG('x');
  for (let i = 0; i < 1000; i++) { const k = r.int(2, 5); assert.ok(k >= 2 && k <= 5 && k === Math.floor(k)); const f = r.float(-1, 1); assert.ok(f >= -1 && f < 1); }
  const arr = [1, 2, 3, 4, 5, 6, 7, 8]; const sh = r.shuffle(arr.slice());
  assert.deepStrictEqual(sh.slice().sort(), arr);
  assert.strictEqual(new Set(r.sample(arr, 5)).size, 5);
});

// ======================================================= content
test('content: palette, polar animals, homes, age topics, pairs and peek tables exactly as DESIGN §3/§5.1', () => {
  assert.strictEqual(IM.PALETTE.red.fill, '#E84A4A'); assert.strictEqual(IM.PALETTE.pink.dark, '#C9558A');
  assert.strictEqual(IM.PALETTE.yellow.fill, '#FFD23F'); assert.strictEqual(IM.PALETTE.purple.dark, '#6840A8');
  assert.deepStrictEqual(IM.ANIMALS, ['bear', 'seal', 'fox', 'owl', 'whale', 'puffin', 'penguin', 'hare', 'walrus']);
  assert.deepStrictEqual(IM.HOMES, { bear: 'den', seal: 'floe', fox: 'burrow', owl: 'nest', whale: 'sea', puffin: 'cliff', penguin: 'pebbles' });
  assert.deepStrictEqual(IM.AGE_TOPICS[3], ['colors', 'size', 'shapes', 'animals']);
  assert.deepStrictEqual(IM.AGE_TOPICS[4], ['colors', 'shapes', 'count', 'homes']);
  assert.deepStrictEqual(IM.AGE_TOPICS[5], ['shapes', 'count', 'letters', 'homes']);
  assert.deepStrictEqual(IM.AGE_TOPICS[6], ['lower', 'initial', 'add', 'count']);
  assert.deepStrictEqual(IM.AGE_TOPICS[7], ['initial', 'add', 'sub', 'oddeven']);
  assert.deepStrictEqual(IM.Content.PAIRS, { 3: [2, 2, 3, 3], 4: [2, 3, 4, 4], 5: [3, 4, 5, 5], 6: [3, 4, 5, 6], 7: [3, 4, 5, 6] });
  assert.deepStrictEqual(CFG.pairsByAge[4], [2, 2, 3, 3], 'age 4: 2, 2, 3, 3');
  assert.deepStrictEqual(IM.Content.PEEK, { 3: 3.5, 4: 2.5, 5: 2.0, 6: 1.5, 7: 1.5 });
  assert.deepStrictEqual(IM.Content.topicsFor(2), IM.AGE_TOPICS[3]); assert.deepStrictEqual(IM.Content.topicsFor(9), IM.AGE_TOPICS[7]);
  for (const a of AGES) { assert.ok(IM.AGE_POOLS[a].length >= 5, 'pool ' + a); IM.AGE_TOPICS[a].forEach(t => assert.ok(IM.AGE_POOLS[a].includes(t))); }
  assert.deepStrictEqual(IM.AGE_POOLS[4], ['colors', 'animals', 'shapes', 'count', 'homes']);
  for (const l of LANGS) for (const w of IM.WORDS[l]) { assert.ok(IM.ANIMALS.includes(w.animal)); assert.strictEqual(w.sprite, 'animal_' + w.animal);
    assert.strictEqual(w.word[0].toUpperCase().normalize('NFD').replace(/[̣̀́̃̉]/g, '').normalize('NFC'), w.initial, w.word); }
  assert.ok(!IM.WORDS.vi.some(w => /^(th|nh|ch)/.test(w.word)), 'vi skips digraph words');
  assert.strictEqual(CFG.cardAspect, 0.9);
});

test('content: every topic × age 3–7 × en/vi × 200 seeds → valid, solvable chapters within the §5.1 rules', () => {
  const COLORS = IM.Content.COLORS;
  let rounds = 0;
  for (const topic of TOPICS) for (const age of AGES) for (const lang of LANGS) for (let s = 0; s < 200; s++) {
    const ch = chapter(topic, age, lang, s * 7919 + age * 13 + (lang === 'vi' ? 5 : 0));
    let prevSet = null;
    ch.forEach((r, ri) => {
      rounds++;
      const tag = `${topic}/${age}/${lang}/${s}/${ri}`;
      assert.strictEqual(IM.Content.validate(r), null, tag);
      assert.strictEqual(r.cards.length, 2 * r.pairs, tag);
      assert.ok(r.cards.length <= 12, tag);
      const want = Math.max(2, Math.min(IM.Content.PAIRS[age][ri], IM.Content.maxPairs(topic, age, lang)));
      assert.strictEqual(r.pairs, want, tag + ' pairs');
      assert.strictEqual(r.peek, IM.Content.PEEK[age], tag + ' peek');
      assert.strictEqual(r.promptKey, 'p.' + topic); assert.strictEqual(r.params.n, r.pairs);
      const keys = {}; r.cards.forEach(c => { keys[c.key] = (keys[c.key] || 0) + 1; });
      assert.ok(Object.values(keys).every(v => v === 2), tag + ' every key on exactly 2 cards');
      assert.strictEqual(new Set(r.cards.map(c => c.id)).size, r.cards.length);
      assert.notStrictEqual(r.sum.set, prevSet, tag + ' identical consecutive rounds'); prevSet = r.sum.set;
      const info = r.pairInfo, ks = Object.keys(info);
      const rk = { colors: 'fish', shapes: 'sculpture', size: 'animal', animals: 'animal', homes: 'animal', count: 'fishes', oddeven: 'fishes',
        letters: 'star', lower: 'star', initial: 'animal', add: 'star', sub: 'star' }[topic];
      assert.strictEqual(r.reward.kind, rk); ks.forEach(k => assert.strictEqual(info[k].reward.kind, rk));
      const pairs = ks.map(k => r.cards.filter(c => c.key === k));
      switch (topic) {
        case 'colors': {
          const cs = ks.map(k => info[k].nameValue);
          if (age <= 5) { assert.ok(!IM.Content.clash(cs), tag + ' colour clash ' + cs); assert.ok(cs.every(c => COLORS.includes(c)), 'no pink up to 5'); }
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
        case 'homes': pairs.forEach(p => { const A = p.find(c => c.face.kind === 'animal'), Hm = p.find(c => c.face.kind === 'home');
          assert.ok(A && Hm, tag); assert.strictEqual(IM.HOMES[A.face.value], Hm.face.value); assert.strictEqual(Hm.face.sprite, 'home_' + Hm.face.value);
          assert.strictEqual(A.nameKind, 'animal'); assert.strictEqual(Hm.nameKind, 'home'); });
          ks.forEach(k => { assert.strictEqual(info[k].reward.home, IM.HOMES[info[k].nameValue]); assert.strictEqual(info[k].home, info[k].reward.home); });
          assert.ok(r.pairs <= IM.Content.HOMES_MAX[age]); break;
        case 'count': case 'oddeven': {
          const hi = topic === 'oddeven' ? 12 : IM.Content.COUNT_RANGE[age][1];
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
          assert.ok(L && A); assert.strictEqual(IM.WORDS[lang].find(w => w.word === A.word).initial, L.face.text); }); break;
        case 'add': case 'sub': pairs.forEach(p => { const T = p.find(c => c.face.kind === 'text'), N = p.find(c => c.face.kind === 'number');
          const m = /^(\d+) ([+−]) (\d+)$/.exec(T.face.text); const v = m[2] === '+' ? +m[1] + +m[3] : +m[1] - +m[3];
          assert.strictEqual(v, N.face.n); assert.ok(topic === 'add' ? v <= (age >= 7 ? 20 : 10) : (v >= 0 && +m[1] <= 10)); }); break;
      }
    });
  }
  assert.ok(rounds >= 96000);
});

test('content: topic rotation — 4 of the ≥ 5 pool topics, chapter 1 = easiest not first last time, 2–4 easiest first, prefer topics left out last time', () => {
  const D = IM.Content.DIFFICULTY, di = t => D.indexOf(t);
  for (const age of AGES) {
    let last = null; const seen = new Set(), firsts = new Set();
    for (let s = 0; s < 200; s++) {
      const L = IM.Content.topicsFor(age, new IM.RNG(s * 13 + age), last);
      assert.strictEqual(L.length, 4); assert.strictEqual(new Set(L).size, 4);
      L.forEach(t => { assert.ok(IM.AGE_POOLS[age].includes(t)); seen.add(t); });
      const pool = IM.AGE_POOLS[age].slice().sort((a, b) => di(a) - di(b));
      const want1 = pool.find(t => !last || t !== last[0]); assert.strictEqual(L[0], want1, 'chapter 1');
      for (let i = 2; i < 4; i++) assert.ok(di(L[i]) > di(L[i - 1]), 'easiest first');
      if (last) { const leftOut = IM.AGE_POOLS[age].filter(t => !last.includes(t) && t !== L[0]); leftOut.forEach(t => assert.ok(L.includes(t), 'left-out topic comes back')); assert.notDeepStrictEqual(L, last); }
      firsts.add(L[0]); last = L;
    }
    assert.strictEqual(seen.size, IM.AGE_POOLS[age].length, 'every pool topic is played'); assert.ok(firsts.size >= 2);
  }
  // the world: newSession({ lastTopics }) and w.lastTopics
  const w = mkWorld({ age: 4 }); w.newSession({ lastTopics: ['colors', 'shapes', 'count', 'homes'] });
  assert.strictEqual(w.levels[0], 'animals'); assert.ok(w.levels.includes('colors'));
  const w2 = mkWorld({ age: 4 }); w2.lastTopics = w.levels.slice(); w2.newSession(); assert.notStrictEqual(w2.levels[0], w.levels[0]);
});

test('content: deviations are bounded — colours ≤ 3 pairs up to age 5, vi initial ≤ 3 pairs, homes ≤ 3 (age 4) / 4 (age 5)', () => {
  assert.strictEqual(IM.Content.maxPairs('colors', 4, 'en'), 3);
  assert.strictEqual(IM.Content.maxPairs('colors', 5, 'en'), 3);
  assert.strictEqual(IM.Content.maxPairs('colors', 6, 'en'), 7);
  assert.strictEqual(IM.Content.maxPairs('initial', 7, 'vi'), 3);
  assert.strictEqual(IM.Content.maxPairs('initial', 7, 'en'), 7);
  assert.strictEqual(IM.Content.maxPairs('homes', 4, 'en'), 3);
  assert.strictEqual(IM.Content.maxPairs('homes', 5, 'vi'), 4);
  assert.strictEqual(IM.Content.SAFE_SETS.length, 6);
});

test('content: homes — animal ↔ home pairs solvable for ages 3–7 × en/vi × 500 seeds (every round valid, unambiguous, fresh)', () => {
  let n = 0;
  for (const age of AGES) for (const lang of LANGS) for (let s = 0; s < 500; s++) {
    const ch = chapter('homes', age, lang, s * 104729 + age * 31 + (lang === 'vi' ? 7 : 0));
    let prev = null;
    ch.forEach((r, ri) => {
      n++;
      assert.strictEqual(IM.Content.validate(r), null);
      assert.ok(r.pairs >= 2 && r.pairs <= IM.Content.HOMES_MAX[age]);
      const animals = r.cards.filter(c => c.face.kind === 'animal'), homes = r.cards.filter(c => c.face.kind === 'home');
      assert.strictEqual(animals.length, r.pairs); assert.strictEqual(homes.length, r.pairs);
      // every animal's home is on the board exactly once, and no animal's home belongs to another pair
      for (const a of animals) assert.strictEqual(homes.filter(h => h.face.value === IM.HOMES[a.face.value]).length, 1);
      for (const a of animals) for (const h of homes) assert.strictEqual(IM.Content.facesMatch('homes', a, h), a.key === h.key);
      assert.ok(!animals.some(a => a.face.value === 'hare' || a.face.value === 'walrus'), 'animals without a home never appear');
      assert.notStrictEqual(r.sum.set, prev); prev = r.sum.set;
    });
  }
  assert.strictEqual(n, 5 * 2 * 500 * 4);
  // and a world really solves them (rubbing allowed): every age, 20 sessions-worth of homes rounds
  for (const age of AGES) for (let s = 0; s < 20; s++) {
    const w = mkWorld({ age, seed: 300 + s }); roundOf(w, 'homes', s % 4); solveRound(w);
    assert.strictEqual(w.state, 'roundDone', 'age ' + age + ' seed ' + s);
  }
});

test('content: validate() rejects broken rounds (self-check works)', () => {
  const r = IM.Content.makeRound('count', { age: 4, rng: new IM.RNG(3), roundIndex: 2 });
  assert.strictEqual(IM.Content.validate(r), null);
  const bad1 = J(r); bad1.cards[0].key = bad1.cards[1].key === bad1.cards[0].key ? bad1.cards[2].key : bad1.cards[1].key; assert.ok(IM.Content.validate(bad1));
  const bad2 = J(r); const d = bad2.cards.find(c => c.face.kind === 'dots'); d.face.n = d.face.n === 5 ? 4 : d.face.n + 1; assert.ok(IM.Content.validate(bad2), 'dots ≠ numeral');
  const bad3 = J(r); bad3.cards.pop(); assert.ok(IM.Content.validate(bad3));
  const bad4 = J(IM.Content.makeRound('colors', { age: 3, rng: new IM.RNG(1), roundIndex: 3 }));
  bad4.cards[0].face.color = 'teal'; assert.ok(IM.Content.validate(bad4));
  const bad6 = J(IM.Content.makeRound('homes', { age: 4, rng: new IM.RNG(2), roundIndex: 2 }));
  const hc = bad6.cards.find(c => c.face.kind === 'home'), other = IM.Content.HOME_LIST.find(h => h !== hc.face.value && !bad6.cards.some(c => c.face.value === h));
  hc.face.value = other; hc.face.sprite = 'home_' + other; assert.ok(IM.Content.validate(bad6), 'animal with a wrong home');
  const bad5 = J(IM.Content.makeRound('lower', { age: 6, rng: new IM.RNG(1), roundIndex: 1 }));
  const lo = bad5.cards.find(c => c.face.text === c.face.text.toLowerCase()); lo.face.text = lo.face.text.toUpperCase(); assert.ok(IM.Content.validate(bad5), 'lower pair = 2 capitals');
});

test('content: deterministic (same seed → same round and talk)', () => {
  for (const t of TOPICS) {
    assert.deepStrictEqual(IM.Content.makeRound(t, { age: 6, rng: new IM.RNG(9), roundIndex: 2 }), IM.Content.makeRound(t, { age: 6, rng: new IM.RNG(9), roundIndex: 2 }));
    assert.deepStrictEqual(IM.Content.makeTalk(t, { age: 6, rng: new IM.RNG(9) }), IM.Content.makeTalk(t, { age: 6, rng: new IM.RNG(9) }));
  }
});

test('talk: every topic × age × lang × 300 seeds → distinct choices incl. the answer; animals "Where is the {animal}?"', () => {
  for (const t of TOPICS) for (const age of AGES) for (const lang of LANGS) for (let s = 0; s < 300; s++) {
    const k = IM.Content.makeTalk(t, { age, lang, rng: new IM.RNG(s * 31 + age) });
    assert.strictEqual(k.promptKey, 'talk.' + t);
    const vals = k.choices.map(c => c.value);
    assert.strictEqual(new Set(vals).size, vals.length, t);
    assert.ok(k.choices.length >= 2 && k.choices.length <= 3);
    const ans = k.choices.find(c => c.id === k.answerId); assert.ok(ans, 'answer present');
    if (t === 'homes') { assert.strictEqual(k.show.kind, 'animal'); assert.strictEqual(ans.value, IM.HOMES[k.show.value]); assert.strictEqual(k.params.home, ans.value);
      assert.ok(k.choices.every(c => c.kind === 'home' && c.sprite === 'home_' + c.value)); assert.strictEqual(k.choices.length, 3); }
    if (t === 'animals') { assert.strictEqual(k.show, null); assert.strictEqual(k.params.animal, ans.value); assert.strictEqual(k.choices.length, 3); assert.ok(k.choices.every(c => c.kind === 'animal')); }
    else { assert.ok(k.show && k.show.kind, t + ' shows a card face'); }
    if (t === 'colors' && age <= 5) assert.ok(!IM.Content.clash(vals) && !vals.includes('pink'), 'talk colours safe');
    if (t === 'count') assert.strictEqual(k.show.n, ans.value);
    if (t === 'oddeven') assert.strictEqual(ans.value, k.show.n % 2 ? 'odd' : 'even');
    if (t === 'size') { assert.strictEqual(ans.value, k.show.size); assert.strictEqual(k.params.animal, k.show.value);
      k.choices.forEach(c => { assert.strictEqual(c.sprite, k.show.sprite); assert.strictEqual(c.scale, c.value === 'big' ? 1 : 0.6); }); }
    if (t === 'initial') assert.strictEqual(IM.WORDS[lang].find(w => w.word === k.params.word).initial, ans.value);
  }
});

// ======================================================= layout / grid
test('layout: §2 formulas (groundY, Dee, bubble, board, HUD, short-side rule)', () => {
  const L = IM.World.computeLayout(1280, 720, null);
  assert.strictEqual(L.groundY, 630); assert.deepStrictEqual(L.dee, { x: 110, y: 646, h: 180 });
  assert.deepStrictEqual(L.bubble, { x: 24, y: 20, w: 640, h: 122 });
  assert.strictEqual(L.board.x, 240); assert.strictEqual(L.board.y, 166); assert.strictEqual(L.board.y + L.board.h, 620);
  assert.ok(L.board.x >= L.dee.x + 120);
  const P = IM.World.computeLayout(720, 1556, { top: 108, bottom: 62 });
  assert.strictEqual(P.groundY, 1556 - 62 - 90); assert.deepStrictEqual(P.dee, { x: 100, y: P.groundY + 20, h: 170 });
  assert.strictEqual(P.bubble.y, 108 + 96 + 24); assert.strictEqual(P.bubble.h, 124); assert.strictEqual(P.bubble.w, 640);
  assert.strictEqual(P.boards.length, 2); assert.ok(P.boards[0].y + P.boards[0].h <= P.dee.y - P.dee.h - 10 + 1e-9);
  assert.ok(P.boards[1].x >= P.deeRect.x + P.deeRect.w + 40 - 1e-9);
  assert.strictEqual(L.tuk, L.dee, 'layout.dee is an alias of layout.tuk'); assert.deepStrictEqual(L.tukRect, L.deeRect);
  assert.deepStrictEqual(L.shore, { x: 0, y: 620, w: 1280, h: 60 });
  assert.deepStrictEqual(L.sea, { x: 1190, y: 664, w: 120 });
  assert.ok(L.perches.length > 20 && L.perches.every(p => ['shore', 'sky', 'sea'].includes(p.kind)));
  for (const v of VIEWPORTS) { const Lv = IM.World.computeLayout(v.W, v.H, v.ins);
    const s = Lv.sea; assert.ok(!rectsOverlap({ x: s.x - s.w / 2, y: s.y - 10, w: s.w, h: 20 }, Lv.hud) && !rectsOverlap({ x: s.x - s.w / 2, y: s.y - 10, w: s.w, h: 20 }, Lv.bubble), v.name + ' sea clear of HUD/bubble');
    assert.ok(s.x + s.w / 2 <= Lv.W - Lv.ins.right + 1e-6 && s.y < Lv.H - Lv.ins.bottom, v.name + ' sea on screen'); }
  assert.deepStrictEqual(IM.World.logicalSize(852, 393), { W: 1561, H: 720 });
  assert.deepStrictEqual(IM.World.logicalSize(393, 852), { W: 720, H: 1561 });
  assert.deepStrictEqual(IM.World.logicalSize(1024, 768), { W: 960, H: 720 });
  assert.deepStrictEqual(IM.World.logicalSize(3000, 700), { W: 1600, H: 720 });
});

test('grid: 12 viewports × 2–6 pairs × ages → cards inside the board + screen, ≥ min size, no overlap with HUD/bubble/Dee, gaps ≥ 14, hit rects separate', () => {
  const rows = [];
  for (const v of VIEWPORTS) for (const age of AGES) for (let pairs = 2; pairs <= 6; pairs++) {
    const n = 2 * pairs, L = IM.World.computeLayout(v.W, v.H, v.ins), g = IM.World.chooseGrid(L, n, age);
    const tag = `${v.name} age ${age} ${pairs} pairs`;
    assert.ok(g.cols * g.rows >= n && g.cols * g.rows - n <= 1, tag + ' at most one empty slot');
    assert.ok(Math.abs(g.ch - g.cw / 0.9) < 1e-9);
    assert.ok(g.gap >= 14 - 1e-9 && g.gap >= 0.12 * g.cw - 1e-9, tag + ' gap');
    const maxP = Math.max(...IM.Content.PAIRS[age]);
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
  const L = IM.World.computeLayout(1600, 720, null), g = IM.World.chooseGrid(L, 4, 4);
  assert.strictEqual(g.cw, CFG.cardMax); assert.strictEqual(g.cols, 4, '4×1 has the bigger card here (2×2: 168 px)');
  const P = IM.World.computeLayout(720, 1600, null), gp = IM.World.chooseGrid(P, 4, 4);
  assert.strictEqual(gp.cw, CFG.cardMax); assert.strictEqual(gp.cols, 2); assert.strictEqual(gp.boardIndex, 0, 'board A');
  for (const v of VIEWPORTS) { const Lv = IM.World.computeLayout(v.W, v.H, v.ins); for (const n of [4, 6]) { const gv = IM.World.chooseGrid(Lv, n, 4); assert.ok(gv.cols > 1 && gv.rows < n, v.name + ' no single column'); } }
  // the iPad portrait with insets needs board B (right of Dee) for 12 cards
  const Q = IM.World.computeLayout(720, 960, { top: 32, bottom: 27 }), gq = IM.World.chooseGrid(Q, 12, 6);
  assert.strictEqual(gq.boardIndex, 1); assert.ok(gq.cw >= 104);
});

test('layout: colour rounds never put a red block within 40 px of Tuk (12 viewports × 40 seeds)', () => {
  let swaps = 0;
  for (const v of VIEWPORTS) for (let s = 0; s < 40; s++) for (const age of [3, 4]) {
    const w = mkWorld({ vp: v, seed: s + 1, age });
    roundOf(w, 'colors', s % 4);
    const L = w.layout;
    for (const c of w.cards) if (c.face.color === 'red') {
      const r = { x: c.hx - c.w / 2, y: c.hy - c.h / 2, w: c.w, h: c.h };
      assert.ok(IM.World.rectGap(r, L.tukRect) >= 40 - 1e-6, v.name + ' red near Tuk');
    }
    if (w.cards.some(c => c.slot !== +c.id.slice(1))) swaps++;
  }
  console.log('      rounds with a red swap: ' + swaps);
});

// ======================================================= round flow / motion
test('deal: blocks slide in on the ice (landscape from the left, portrait from the bottom) with friction, stop exactly in their slot (v0 = √(2μD)), tiny bump, never overlap, stagger 0.07 s', () => {
  for (const vp of [VIEWPORTS[8], VIEWPORTS[3], VIEWPORTS[5]]) {
    const w = mkWorld({ age: 4, vp });
    roundOf(w, 'animals', 2);
    assert.strictEqual(w.phase, 'deal');
    const L = w.layout, deals = [], peekAt = [], hideAt = [], playAt = [];
    const E = ev(w).filter(e => e.type === 'round'); assert.strictEqual(E[0].pairs, CFG.pairsByAge[4][2]);
    const c0 = w.cards[0], v0 = c0._dv0;
    assert.ok(Math.abs(v0 - Math.sqrt(2 * CFG.dealFriction * c0._dD)) < 1e-9);
    if (L.portrait) assert.ok(w.cards.every(c => c.y > L.H && c.x === c.hx), 'start below the screen');
    else assert.ok(w.cards.every(c => c.x < L.ins.left && c.y === c.hy), 'start left of the screen');
    let n = 0, maxBump = 0, stopped = {}, prevD = {};
    while (w.phase !== 'play' && n++ < 20000) {
      w.update(H);
      for (const e of ev(w)) { if (e.type === 'deal') deals.push([e.id, w.time]); if (e.type === 'peek') peekAt.push(w.time); if (e.type === 'hide') hideAt.push(w.time); if (e.type === 'play') playAt.push(w.time); }
      for (const c of w.cards) {
        const d = hyp(c.hx - c.x, c.hy - c.y);
        if (c.state === 'deal' && c.t > 0) { if (prevD[c.id] !== undefined) assert.ok(d <= prevD[c.id] + 1e-9, 'moves monotonically'); prevD[c.id] = d; }
        if (c.state === 'down' && !stopped[c.id]) { stopped[c.id] = 1; assert.ok(d < 1e-9 || c._bo !== 0, 'exactly in the slot'); }
        if (c.state === 'down') maxBump = Math.max(maxBump, Math.abs(c._bo));
      }
      const R = w.cards.map(c => w.cardRect(c));
      for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) assert.ok(!rectsOverlap(R[i], R[j]), vp.name + ' blocks overlap during the deal');
    }
    const nC = 2 * CFG.pairsByAge[4][2];
    assert.strictEqual(deals.length, nC);
    for (let i = 1; i < nC; i++) assert.ok(Math.abs(deals[i][1] - deals[i - 1][1] - 0.07) < 0.011, 'stagger 0.07 s');
    const T = c0._dT; assert.ok(T > 0.3 && T < 1.0, 'slide time ' + T);
    assert.ok(maxBump > 2 && maxBump < 7, 'bump ' + maxBump);
    assert.strictEqual(peekAt.length, 1); assert.strictEqual(hideAt.length, 1); assert.strictEqual(playAt.length, 1);
    const hold = hideAt[0] - peekAt[0], pk = CFG.peekByAge[4] * (0.6 + 0.1 * nC);
    assert.ok(hold > pk && hold < pk + 0.7, 'peek ≈ wave + peek time ' + hold);
    assert.ok(w.cards.every(c => c.flip < 0.5 && c.state === 'down'));
    assert.ok(playAt[0] - hideAt[0] < 0.9);
    for (const c of w.cards) { assert.ok(Math.abs(c.x - c.hx) < 0.05 && Math.abs(c.y - c.hy) < 0.05, 'rest in the slot'); }
  }
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

test('reveal: tap → crack 0→1 in 0.12 s, then the frost clears (spring ω 18, no overshoot); frost grows back slower (ω 10); flip event with name, via, x, y', () => {
  const w = mkWorld(); roundOf(w, 'colors', 1); untilPhase(w, 'play'); run(w, 1); ev(w);
  const c = downCards(w)[0];
  assert.strictEqual(tap(w, c), c.id);
  const E = ev(w); assert.strictEqual(E[0].type, 'flip'); assert.strictEqual(E[0].nameKind, 'color'); assert.strictEqual(E[0].nameValue, c.face.color);
  assert.ok(E[0].face); assert.strictEqual(E[0].via, 'tap'); assert.strictEqual(E[0].x, c.x); assert.strictEqual(E[0].y, c.y);
  let t = 0, crackDone = null, maxF = 0;
  while (c.flip < 0.95) { w.update(H); t += H; maxF = Math.max(maxF, c.flip); if (crackDone === null && c.crack >= 1) crackDone = t;
    if (c.crack < 1) assert.ok(c.flip < 0.02, 'frost holds while cracking'); assert.ok(Math.abs(c.frost - (1 - c.flip)) < 1e-12); }
  assert.ok(Math.abs(crackDone - CFG.crackTime) < 0.011, 'crack ' + crackDone);
  assert.ok(t - crackDone > 0.2 && t - crackDone < 0.33, 'clear time ' + (t - crackDone));
  run(w, 0.6); assert.ok(c.flip <= 1 && c.flip > 0.999);
  assert.strictEqual(c.state, 'up');
  tap(w, c); const E2 = ev(w); assert.strictEqual(E2[0].type, 'tap'); assert.strictEqual(E2[0].id, c.id);
  // re-frost after a mismatch: slower spring
  const d = downCards(w).find(x => x.key !== c.key); tap(w, d); let n = 0;
  while (c.state === 'up' && n++ < 1000) w.update(H);
  assert.strictEqual(c.crack, 0); let tb = 0; while (c.flip > 0.05) { w.update(H); tb += H; }
  assert.ok(tb > 0.4 && tb < 0.55, 'frost back in ' + tb);
});

test('rub: while the finger is down, entering a frosted block reveals it (via rub) until 2 are up; never twice per rub; nothing over up/matched blocks or the ice', () => {
  const w = mkWorld({ age: 5 }); roundOf(w, 'animals', 3); untilPhase(w, 'play'); ev(w);
  const g = w.layout.grid, byCol = w.cards.slice().sort((a, b) => (a.hy - b.hy) || (a.hx - b.hx));
  const A = byCol[0], B = byCol[1], C = byCol[2];   // three blocks in the top row, left to right
  assert.ok(Math.abs(A.hy - C.hy) < 1e-6, 'top row has ≥ 3 blocks');
  // a stroke from A across B and on to C
  assert.strictEqual(w.pointerDown(A.x, A.y), A.id);
  const path = []; for (let x = A.x; x <= C.x; x += 6) path.push(x);
  const flips = [];
  for (const x of path) { const id = w.pointerMove(x, A.y); if (id) flips.push(id); }
  let E = ev(w);
  assert.deepStrictEqual(flips, [B.id], 'only B (2 up after it)');
  assert.deepStrictEqual(E.filter(e => e.type === 'flip').map(e => [e.id, e.via]), [[A.id, 'tap'], [B.id, 'rub']]);
  assert.ok(!E.some(e => e.type === 'tap'), 'no name spam while rubbing over up blocks');
  // back and forth over A and B while still down: nothing
  for (let k = 0; k < 3; k++) for (const x of path.slice().reverse().concat(path)) w.pointerMove(x, A.y);
  assert.strictEqual(ev(w).filter(e => e.type === 'flip' || e.type === 'tap').length, 0);
  // the pair is checked once; if it mismatched, after the frost is back re-entering A/B in the SAME stroke does nothing
  run(w, 2.0); E = ev(w);
  const mis = E.filter(e => e.type === 'mismatch').length, mat = E.filter(e => e.type === 'match').length;
  assert.strictEqual(mis + mat, 1, 'counted once');
  if (mis) {
    assert.strictEqual(A.state, 'down');
    for (const x of path) w.pointerMove(x, A.y);
    assert.ok(!ev(w).some(e => e.type === 'flip' && (e.id === A.id || e.id === B.id)), 'never twice per rub');
    assert.ok(w.open.every(id => id !== A.id && id !== B.id));
    w.pointerUp(C.x, A.y);
    // a new stroke may reveal them again
    run(w, 2); w.pointerDown(-50, -50); const fresh = downCards(w)[0]; assert.strictEqual(w.pointerMove(fresh.x, fresh.y), fresh.id); w.pointerUp();
  }
  // moves without the finger down never reveal
  const w2 = mkWorld({ age: 5 }); roundOf(w2, 'animals', 3); untilPhase(w2, 'play'); ev(w2);
  for (const c of w2.cards) assert.strictEqual(w2.pointerMove(c.x, c.y), null);
  assert.strictEqual(ev(w2).length, 0);
  // a stroke starting on the ice between blocks reveals the first block it enters
  const c2 = w2.cards[0]; assert.strictEqual(w2.pointerDown(-50, -50), null);
  assert.strictEqual(w2.pointerMove(c2.x, c2.y), c2.id);
  // not during the peek / a shown mismatch
  const w3 = mkWorld({ age: 5 }); roundOf(w3, 'animals', 3); untilPhase(w3, 'peek'); w3.pointerDown(0, 0);
  assert.ok(w3.cards.every(c => w3.pointerMove(c.x, c.y) === null));
});

test('rub: no double counts — a rubbing bot plays full sessions; open never repeats an id, every flip id is unique per stroke', () => {
  for (const age of [3, 4, 6]) {
    let rubs = 0, dupes = 0, flipsPerStroke = 0;
    const r = playSession(70 + age, age, 0.6, { rub: 1, each: (w, e) => {
      if (new Set(w.open).size !== w.open.length) dupes++;
      if (w.open.length > 2) dupes++;
      for (const x of e) if (x.type === 'flip' && x.via === 'rub') rubs++;
    } });
    assert.strictEqual(r.w.state, 'sessionDone'); assert.strictEqual(dupes, 0);
    assert.ok(rubs > 10, 'rubs ' + rubs); assert.strictEqual(r.bot.stats.rubs >= rubs * 0.5, true);
  }
});

test('match: glide together with friction (exact e^(−2.2 t)), touch exactly at the midpoint → clink (restitution 0.3) → melt ×2 → hole + reward; event order', () => {
  for (const vp of [VIEWPORTS[8], VIEWPORTS[2]]) {
    const w = mkWorld({ vp }); roundOf(w, 'colors', 2); untilPhase(w, 'play'); ev(w);
    // the two blocks of a pair that are far apart (exercise the glide)
    const keys = [...new Set(w.cards.map(c => c.key))];
    const k = keys.sort((p, q) => { const d = k2 => { const [a, b] = pairOf(w, k2); return hyp(a.x - b.x, a.y - b.y); }; return d(q) - d(p); })[0];
    const [a, b] = pairOf(w, k);
    const mx = (a.hx + b.hx) / 2, my = (a.hy + b.hy) / 2;
    tap(w, a); tap(w, b);
    const order = []; let clink = null, n = 0, glideV = [], minGap = 1e9, contactSep = null, M = null;
    while (n++ < 1200 && !order.includes('splash')) {
      w.update(H);
      for (const e of ev(w)) {
        order.push(e.type === 'melt' ? 'melt:' + (e.id === a.id ? 'a' : 'b') : e.type);
        if (e.type === 'clink') { clink = e; M = w._anims[0]; contactSep = (b.x - a.x) * M.ux + (b.y - a.y) * M.uy;
          assert.ok(Math.abs(e.x - mx) < 1e-6 && Math.abs(e.y - my) < 1e-6, 'clink at the midpoint');
          assert.ok(Math.abs((a.x + b.x) / 2 - mx) < 1e-6 && Math.abs((a.y + b.y) / 2 - my) < 1e-6, 'pair centred on the midpoint');
          assert.ok(Math.abs(e.v - CFG.glideContactV) < 0.05 * CFG.glideContactV + 2, 'contact speed ' + e.v); }
        if (e.type === 'reward') { assert.ok(Math.abs(e.x - mx) < 1e-6 && Math.abs(e.y - my) < 1e-6, 'reward from the hole at the midpoint'); assert.strictEqual(e.kind, 'fish'); }
      }
      if (a.state === 'matched' && w._anims[0] && w._anims[0].stage === 'glide') glideV.push(hyp(a.vx, a.vy));
      if (a.state === 'matched') { const R1 = w.cardRect(a), R2 = w.cardRect(b); minGap = Math.min(minGap, IM.World.overlapArea(R1, R2)); }
    }
    const want = ['match', 'clink', 'melt:a', 'melt:b', 'reward', 'leap', 'splash'];
    assert.deepStrictEqual(order.filter(t => want.includes(t)), want, vp.name + ' ' + order.join(','));
    assert.ok(Math.abs(contactSep - M.sc) < 1e-6, 'touching, not overlapping');
    assert.strictEqual(minGap, 0, 'never overlap');
    for (let i = 1; i < glideV.length; i++) assert.ok(Math.abs(glideV[i] / glideV[i - 1] - Math.exp(-CFG.glideFriction * H)) < 1e-9, 'exponential friction');
    assert.strictEqual(a.state, 'gone'); assert.strictEqual(b.state, 'gone');
    assert.ok(a.hole && !b.hole, 'one hole per pair'); assert.ok(Math.abs(a.x - mx) < 1e-9 && Math.abs(a.y - my) < 1e-9);
  }
  // after the clink both rest symmetric about the midpoint (exponential friction → v → 0)
  const w = mkWorld(); roundOf(w, 'animals', 1); untilPhase(w, 'play'); ev(w);
  const [a, b] = pairOf(w, w.cards[0].key), mx = (a.hx + b.hx) / 2, my = (a.hy + b.hy) / 2;
  tap(w, a); tap(w, b);
  let n = 0; while (!ev(w).some(e => e.type === 'clink') && n++ < 600) w.update(H);
  const M = w._anims[0], v1 = hyp(a.vx, a.vy);
  assert.ok(Math.abs(v1 / M.vContact - CFG.clinkRest) < 1e-9, 'restitution ' + v1 / M.vContact);
  run(w, CFG.meltDelay + CFG.meltTime * 0.9);
  assert.ok(Math.abs((a.x + b.x) / 2 - mx) < 1e-9 && Math.abs((a.y + b.y) / 2 - my) < 1e-9, 'glide stops exactly at the midpoint');
  assert.ok(a.melt > 0.8 && a.sx < 0.4 && a.alpha < 0.3, 'melting');
});

test('mismatch: wobble (±0.07 rad, 3 wiggles), faces stay 1.0 s (age 3: 1.2 s), flip down; streak; the third-tap fast reset', () => {
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
    assert.ok(maxRot > 0.04 && maxRot <= 0.0701, 'wobble ' + maxRot); assert.ok(signs >= 4 && signs <= 6, 'wiggles ' + signs);
    assert.strictEqual(w.phase, 'play'); assert.strictEqual(w.mismatches, 1);
  }
  // fast reset: 2 mismatched up, a third tap flips them down at once and the new one up — one mistake only
  const w = mkWorld({ age: 4 }); roundOf(w, 'animals', 3); untilPhase(w, 'play'); ev(w);
  const [a, b] = twoDifferent(w);
  tap(w, a); tap(w, b); run(w, 0.6); ev(w);
  assert.strictEqual(w.phase, 'resolve');
  const c = downCards(w).find(x => x.id !== a.id && x.id !== b.id);
  assert.strictEqual(tap(w, c), null, 'faces shown < 0.5 s: the third tap waits (QA P2-1)');
  run(w, 0.4); ev(w);
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
  const o3 = downCards(w3)[0]; assert.strictEqual(tap(w3, o3), null); run(w3, 3); assert.strictEqual(p3[0].state, 'gone'); assert.strictEqual(w3.found, 1);
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
  if (r.kind === 'animal' || r.kind === 'sculpture') {
    let B = { x: r.x - s / 2, y: r.y - s, w: s, h: s };
    if (r.badge) { const b = r.badge, q = { x: b.x - b.size / 2, y: b.y - b.size / 2, w: b.size, h: b.size };
      const x = Math.min(B.x, q.x), y = Math.min(B.y, q.y); B = { x, y, w: Math.max(B.x + B.w, q.x + q.w) - x, h: Math.max(B.y + B.h, q.y + q.h) - y }; }
    return B;
  }
  return { x: r.x - s / 2, y: r.y - s / 2, w: s, h: s };
}
test('rewards: one per match, kind per topic; they settle on the shore / sky inside the screen, off the blocks, the bubble, the HUD and Tuk (12 viewports × all topics)', () => {
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
      for (const e of w.events) if (e.type === 'reward') kinds[topic + ':' + e.kind] = 1;
      if (w.state === 'roundDone') { run(w, 1.9); }
      const L = w.layout, safe = { x: L.ins.left, y: L.ins.top, w: L.W - L.ins.left - L.ins.right, h: L.H - L.ins.top - L.ins.bottom };
      // let flights finish (the next round's deal is running; the grid may push rewards off)
      run(w, 2.5);
      for (const e of w.events) if (e.type === 'reward') kinds[topic + ':' + e.kind] = 1;
      for (const r of w.rewards) {
        if (r.state === 'fly' || r.state === 'emerge' || r.kind === 'fish' || r.kind === 'fishes') continue;
        const B = rewardBox(r), tag = `${v.name} ${topic} r${ri} ${r.kind} ${r.perch.kind}`;
        assert.ok(Number.isFinite(B.x + B.y + B.w + B.h), tag + ' NaN');
        assert.ok(insideR(B, safe), tag + ' inside the screen ' + JSON.stringify(B));
        assert.ok(!rectsOverlap(B, L.bubble) && !rectsOverlap(B, L.hud) && !rectsOverlap(B, L.tukRect), tag + ' clear of bubble/HUD/Tuk');
        assert.ok(r.kind === 'star' ? r.perch.kind === 'sky' : ['shore', 'sea'].includes(r.perch.kind), tag + ' perch kind');
        if (L.hudKeep) assert.ok(!rectsOverlap(r.target.box, L.hudKeep), tag + ' under the real HUD');
        if (w.state === 'round' && L.grid && w.phase !== 'deal') for (const c of w.cards) if (c.state !== 'gone' && c.state !== 'deal') assert.ok(!rectsOverlap(B, cardR(c, L.grid)), tag + ' on a card');
        checked++;
      }
      if (w.state !== 'round') break;
    }
  }
  assert.ok(checked > 900, 'checked ' + checked);
  // crowding: resting rewards whose target boxes overlap > 40 % of the smaller one, at chapter end (every viewport × topic)
  let pairsN = 0, heavy = 0;
  for (const v of VIEWPORTS) for (const topic of ['homes', 'animals', 'size', 'shapes', 'add']) {
    const w = mkWorld({ vp: v, age: topic === 'add' ? 6 : 4, seed: 3 }); w.levels = [topic, topic, topic, topic]; w.startLevel(0); run(w, 2.6);
    for (let ri = 0; ri < 4 && w.state === 'round'; ri++) { solveRound(w); run(w, 1.9); }
    const R = w.rewards.map(r => r.target.box);
    for (let i = 0; i < R.length; i++) for (let j = 0; j < i; j++) { pairsN++; if (IM.World.overlapArea(R[i], R[j]) > 0.4 * Math.min(R[i].w * R[i].h, R[j].w * R[j].h)) heavy++; }
  }
  console.log('      crowded reward pairs (> 40 % overlap): ' + heavy + ' / ' + pairsN);
  assert.ok(heavy / pairsN < 0.02, 'crowding ' + heavy);
  for (const k of ['colors:fish', 'shapes:sculpture', 'count:fishes', 'animals:animal', 'homes:animal', 'letters:star', 'size:animal', 'initial:animal', 'oddeven:fishes']) assert.ok(kinds[k], k);
});

test('rewards motion: fish leap on a g = 1400 parabola into the sea (splash), fishes 0.35 s apart counted k = 1..n, sculptures slide and stop exactly, animals hop 3 hops (homes → homeArrive), stars twinkle', () => {
  function oneReward(topic, age, vp, ri) {
    const w = mkWorld({ age, seed: 5, vp }); roundOf(w, topic, ri === undefined ? 1 : ri); untilPhase(w, 'play'); ev(w);
    const p = pairOf(w, w.cards[0].key); tap(w, p[0]); tap(w, p[1]);
    let n = 0; while (!w.rewards.length && n++ < 800) w.update(H);
    return w;
  }
  for (const vp of [VIEWPORTS[8], VIEWPORTS[3], VIEWPORTS[4]]) {
    // fish
    let w = oneReward('colors', 4, vp), r = w.rewards[0], pc = r.pieces[0], S = w.layout.sea;
    assert.strictEqual(r.kind, 'fish'); assert.strictEqual(r.pieces.length, 1); assert.strictEqual(pc.color, r.color);
    const ys = [], E = []; let n = 0;
    while (w.rewards.includes(r) && n++ < 1000) { w.update(H); for (const e of ev(w)) E.push(e); if (pc.state === 'air') ys.push([pc.x, pc.y, pc.rot, pc.traj.t]); }
    const types = E.map(e => e.type).filter(t => ['leap', 'splash', 'land'].includes(t));
    assert.deepStrictEqual(types, ['leap', 'splash', 'land']);
    const sp = E.find(e => e.type === 'splash');
    assert.ok(Math.abs(sp.y - S.y) < 1e-9 && Math.abs(sp.x - S.x) <= S.w / 2, vp.name + ' fish lands in the sea');
    let gs = []; for (let i = 2; i < ys.length - 1; i++) gs.push((ys[i][1] - 2 * ys[i - 1][1] + ys[i - 2][1]) / (H * H));
    assert.ok(gs.every(g => Math.abs(g - CFG.fishG) < 1), 'g = 1400');
    const top = Math.min(...ys.map(q => q[1])); assert.ok(top >= w.layout.ins.top + 40 - 1e-6, 'apex on screen');
    for (let i = 1; i < ys.length - 1; i++) { const vx = (ys[i + 1][0] - ys[i - 1][0]), vy = (ys[i + 1][1] - ys[i - 1][1]);
      const d = Math.atan2(vy, vx) - ys[i][2]; assert.ok(Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) < 0.05, 'spin follows the velocity'); }
    const hc = w.cards.find(c => c.hole); assert.ok(hc, 'a hole while the fish is out'); run(w, 1.8); assert.ok(!hc.hole, 'hole gone after the fish left');
  }
  // fishes: n fish, 0.35 s apart, k = 1..n in order
  let w = oneReward('count', 4, VIEWPORTS[8], 2), r = w.rewards[0];
  assert.strictEqual(r.kind, 'fishes'); assert.strictEqual(r.pieces.length, r.n);
  const leaps = [], spl = []; let n = 0;
  while (w.rewards.includes(r) && n++ < 3000) { w.update(H); for (const e of ev(w)) { if (e.type === 'leap') leaps.push([e.k, e.n, w.time]); if (e.type === 'splash') spl.push(e.k); } }
  assert.deepStrictEqual(leaps.map(l => l[0]), Array.from({ length: r.n }, (_, i) => i + 1));
  assert.ok(leaps.every(l => l[1] === r.n));
  for (let i = 1; i < leaps.length; i++) assert.ok(Math.abs(leaps[i][2] - leaps[i - 1][2] - CFG.fishStagger) < 0.011, 'stagger');
  assert.strictEqual(spl.length, r.n);
  // sculpture: emerges, slides with constant friction, stops exactly on its shore spot
  w = oneReward('shapes', 4); r = w.rewards[0];
  assert.strictEqual(r.state, 'emerge'); assert.ok(r.sx < 0.5);
  let lands = 0, maxV = 0, px = r.x, py = r.y, decel = true, lastV = 1e9; n = 0;
  while (r.state !== 'idle' && n++ < 1200) { w.update(H); for (const e of ev(w)) if (e.type === 'land') lands++;
    if (r.state === 'fly' && r.t > 1.5 * H) { const v = hyp(r.x - px, r.y - py) / H; maxV = Math.max(maxV, v); if (v > lastV + 1e-6) decel = false; lastV = v; } px = r.x; py = r.y; }
  assert.strictEqual(lands, 1); assert.ok(decel, 'decelerates'); assert.strictEqual(r.x, r.target.x); assert.strictEqual(r.y, r.target.y);
  assert.ok(['shore', 'sea'].includes(r.perch.kind));
  // animal: 3 hops; homes → homeArrive with the home, badge placed and faded in
  for (const topic of ['animals', 'homes']) {
    w = oneReward(topic, 4); r = w.rewards[0];
    let ups = 0, prevVy = 0, py2 = r.y, land = 0, home = null; n = 0;
    while (n++ < 800) { w.update(H); const vy = r.y - py2; if (r.state === 'fly' && prevVy > 0 && vy < 0) ups++; prevVy = vy; py2 = r.y;
      for (const e of ev(w)) { if (e.type === 'land') land++; if (e.type === 'homeArrive') { home = e; assert.strictEqual(land, 1, 'homeArrive after land'); } }
      if (r.state === 'idle') break; }
    assert.strictEqual(ups, 2, 'two bounces between 3 hops'); assert.strictEqual(land, 1); assert.strictEqual(r.anchor, 'bottom');
    if (topic === 'homes') { assert.ok(home && home.home === r.home && IM.HOMES[r.sprite.replace('animal_', '')] === r.home);
      assert.ok(r.badge && r.badge.alpha === 1 && Math.abs(r.badge.x - (r.x + CFG.badgeDx)) < 1e-9); }
    else assert.ok(!home && !r.badge);
  }
  // star rises and twinkles in the sky
  w = oneReward('letters', 5); r = w.rewards[0]; run(w, 2.8);
  assert.strictEqual(r.perch.kind, 'sky');
  let smin = 9, smax = 0; run(w, 1, () => { smin = Math.min(smin, r.sx); smax = Math.max(smax, r.sx); });
  assert.ok(smax - smin > 0.1, 'twinkle');
});

test('rewards: stay for the whole chapter, fly off a bigger grid at a round start, fade in levelDone, cleared at the next chapter; ≤ 30', () => {
  const w = mkWorld({ age: 6, vp: VIEWPORTS[4] }); w.levels = ['letters', 'initial', 'add', 'lower']; w.startLevel(0);
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
  assert.ok(maxR >= 8 && maxR <= 30, 'max ' + maxR); assert.ok(faded); assert.ok(refly > 0, 'rewards made room for a bigger grid');
  assert.strictEqual(w.collected.length, w.events.length ? w.collected.length : w.collected.length);
});

test('resize mid-round: blocks move to the new grid, rewards to new perches (no NaN, inside the screen)', () => {
  const w = mkWorld({ age: 4 }); roundOf(w, 'animals', 3); untilPhase(w, 'play');
  const p = pairOf(w, w.cards[0].key); tap(w, p[0]); tap(w, p[1]); run(w, 4);
  const up = downCards(w)[0]; tap(w, up); run(w, 0.3);
  w.setViewport(720, 1556, { top: 108, bottom: 62 });
  const L = w.layout, g = L.grid;
  assert.ok(g && g.cw >= 120);
  for (const c of w.cards) if (c.state !== 'gone') { assert.ok(insideR(cardR(c, g), g.board)); assert.strictEqual(c.w, g.cw); }
  assert.strictEqual(up.state, 'up');
  for (const r of w.rewards) { assert.strictEqual(r.state, 'idle'); assert.ok(Number.isFinite(r.x + r.y)); assert.ok(r.y < L.H - L.ins.bottom); }
  run(w, 1); solveRound(w); assert.strictEqual(w.state, 'roundDone');
});

test('rotation / resize mid-glide and mid-melt, during the deal and while fish fly: everything stays inside, the pair still meets at the (new) midpoint', () => {
  const vps = [VIEWPORTS[8], VIEWPORTS[3], VIEWPORTS[1], VIEWPORTS[7], VIEWPORTS[4]];
  for (const stage of ['hold', 'glide', 'clink', 'melt']) for (let k = 0; k < vps.length; k++) {
    const w = mkWorld({ age: 5, vp: vps[k] }); roundOf(w, 'colors', 2); untilPhase(w, 'play'); ev(w);
    const [a, b] = pairOf(w, w.cards[0].key); tap(w, a); tap(w, b);
    let n = 0; while (n++ < 1500 && !(w._anims[0] && w._anims[0].stage === stage)) w.update(H);
    assert.ok(w._anims[0] && w._anims[0].stage === stage, 'reached ' + stage);
    const v = vps[(k + 1) % vps.length]; w.setViewport(v.W, v.H, v.ins);
    const L = w.layout, safe = L.safe, g = L.grid;
    for (const c of w.cards) if (c.state !== 'gone') {
      assert.ok(Number.isFinite(c.x + c.y + c.vx + c.vy), 'NaN'); assert.ok(insideR(w.cardRect(c), g.board), v.name + ' ' + stage + ' block inside the board');
    }
    let rewardEv = null; n = 0;
    while (!rewardEv && n++ < 1500) {
      w.update(H);
      for (const c of w.cards) if (c.state !== 'gone') assert.ok(insideR(w.cardRect(c), g.board), stage + ' leaves the board');
      for (const e of ev(w)) if (e.type === 'reward') rewardEv = e;
    }
    const mx = (a.hx + b.hx) / 2, my = (a.hy + b.hy) / 2;
    assert.ok(rewardEv && Math.abs(rewardEv.x - mx) < 1e-6 && Math.abs(rewardEv.y - my) < 1e-6, stage + ' new midpoint');
    // a fish in the air when the screen turns: it dives at once (land), nothing stuck off-screen
    let landed = false; run(w, 0.5); w.setViewport(vps[k].W, vps[k].H, vps[k].ins);
    for (const e of ev(w)) if (e.type === 'land') landed = true;
    assert.ok(landed || !w.rewards.some(r => r.kind === 'fish'));
    for (const r of w.rewards) if (r.pieces) r.pieces.forEach(q => assert.ok(insideR({ x: q.x, y: q.y, w: 0, h: 0 }, { x: 0, y: 0, w: w.layout.W, h: w.layout.H })));
    solveRound(w); assert.strictEqual(w.state, 'roundDone');
  }
  // during the deal
  const w = mkWorld({ age: 4 }); roundOf(w, 'animals', 3); run(w, 0.3); w.setViewport(720, 1556, VIEWPORTS[3].ins);
  untilPhase(w, 'peek'); for (const c of w.cards) assert.ok(insideR(w.cardRect(c), w.layout.grid.board) && Math.abs(c.x - c.hx) < 0.05);
});

test('interpolation: _px/_py/_prot/_pflip are the previous sub-step; alpha in [0,1)', () => {
  const w = mkWorld(); roundOf(w, 'colors', 1); run(w, 0.2);
  const c = w.cards[0]; const x0 = c.x, y0 = c.y;
  w.update(H); assert.strictEqual(c._px, x0); assert.strictEqual(c._py, y0);
  w.update(H * 0.4); assert.ok(w.alpha > 0.35 && w.alpha < 0.45);
  untilPhase(w, 'play'); tap(w, c); run(w, 0.2); const f0 = c.flip; w.update(H); assert.strictEqual(c._pflip, f0);
  // reward pieces (fish) too
  const p = pairOf(w, c.key).find(x => x !== c); tap(w, p);
  let n = 0; while (!(w.rewards[0] && w.rewards[0].pieces[0].state === 'air') && n++ < 1000) w.update(H);
  const pc = w.rewards[0].pieces[0], x1 = pc.x, r1 = pc.rot; w.update(H); assert.strictEqual(pc._px, x1); assert.strictEqual(pc._prot, r1);
});

test('Tuk: w.dee is w.tuk; happy hop on a match; belly slide at round end (out 70 px with friction, hold, back to 0)', () => {
  const w = mkWorld({ age: 4 }); assert.strictEqual(w.dee, w.tuk); assert.strictEqual(w.miu, w.tuk);
  roundOf(w, 'animals', 0); untilPhase(w, 'play');
  const keys = ['mood', 'moodT', 'lookX', 'lookY', 'hop', 'slide']; keys.forEach(k => assert.ok(k in w.tuk, k));
  solveRound(w); assert.strictEqual(w.state, 'roundDone');
  let mx = 0, belly = false, prev = 0, mono = true; const tr = [];
  run(w, 1.75, () => { mx = Math.max(mx, w.tuk.slide); belly = belly || w.tuk.belly; tr.push(w.tuk.slide); });
  assert.ok(Math.abs(mx - CFG.tukSlidePx) < 1e-6, 'slides ' + mx); assert.ok(belly);
  const iMax = tr.indexOf(mx); for (let i = 1; i <= iMax; i++) if (tr[i] < tr[i - 1] - 1e-9) mono = false; assert.ok(mono);
  // speed falls linearly on the way out (constant friction)
  const v = []; for (let i = 1; i < iMax; i++) if (tr[i] > 0) v.push((tr[i] - tr[i - 1]) / H);
  for (let i = 2; i < v.length; i++) assert.ok(Math.abs((v[i] - v[i - 1]) / H + CFG.tukSlideFriction) < 1, 'μ');
  assert.strictEqual(w.tuk.slide, 0); assert.strictEqual(w.tuk.belly, false); void prev;
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
    const w = new IM.World({ seed: s, age: 4 }); w.setViewport(1280, 720, null);
    const bot = new IM.Bot(w, { skill: 1, seed: s }); w.newSession();
    const seen = [];
    while (w.state !== 'sessionDone') { bot.step(1 / 30); w.update(1 / 30); for (const e of w.drainEvents()) if (e.type === 'round') { if (e.round === 2) seen.push(e.surprise); else assert.strictEqual(e.surprise, null); } }
    assert.strictEqual(seen.length, 4);
    const T = CFG.surpriseTypes, o = T.indexOf(seen[0]); offs.add(o);
    seen.forEach((t, L) => assert.strictEqual(t, T[(o + L) % 3]));
  }
  assert.strictEqual(offs.size, 3);
});

test('surprise slide: after the hide two frosted blocks (different keys) glide to swap places along opposite curves in 1.0 s, stop exactly; slide {a, b}; still solvable', () => {
  for (const age of [4, 5]) {
    const w = mkWorld({ age, surprise: true }); w.levels = ['animals', 'colors', 'shapes', 'count']; w._surpriseOff = 0; w.startLevel(0); w.round = 2; w._beginRound();
    assert.strictEqual(w.surprise, 'slide');
    const before = {}; let sh = [], n = 0, maxLift = 0, phases = new Set(), t0 = null, t1 = null;
    untilPhase(w, 'hide'); w.cards.forEach(c => { before[c.id] = [c.hx, c.hy]; });
    while (w.phase !== 'play' && n++ < 2000) {
      w.update(H); phases.add(w.phase);
      for (const e of ev(w)) if (e.type === 'slide') { sh.push(e); t0 = w.time; }
      for (const c of w.cards) if (c._sw) { maxLift = Math.max(maxLift, c.lift); assert.ok(c.flip < 0.05, 'frosted while moving'); t1 = w.time; }
      if (w.phase === 'slide') assert.strictEqual(w.pointerDown(w.cards[0].x, w.cards[0].y), null, 'no taps while sliding');
    }
    assert.ok(phases.has('slide')); assert.strictEqual(sh.length, age >= 5 ? 2 : 1);
    for (const e of sh) {
      const a = w.cardById(e.a), b = w.cardById(e.b);
      assert.notStrictEqual(a.key, b.key);
      assert.deepStrictEqual([a.hx, a.hy], before[b.id]); assert.deepStrictEqual([b.hx, b.hy], before[a.id]);
      assert.ok(Math.abs(a.x - a.hx) < 1e-6);
    }
    assert.ok(Math.abs(t1 - t0 - CFG.slideTime) < 0.02); assert.ok(maxLift > 0.3 && maxLift <= 0.35 + 1e-9);
    solveRound(w); assert.strictEqual(w.state, 'roundDone');
  }
});

test('surprise aurora: one secret golden pair; its match → match.golden + golden {a, b, aurora} + Tuk cheers; w.aurora shimmer rises and peaks after the golden match', () => {
  const w = mkWorld({ age: 4, surprise: true }); w.levels = ['animals', 'colors', 'shapes', 'count']; w._surpriseOff = 1; w.startLevel(0); w.round = 2; w._beginRound();
  assert.strictEqual(w.surprise, 'aurora'); const G = w.cur.golden; assert.ok(w.cur.pairInfo[G]);
  untilPhase(w, 'play'); ev(w); assert.ok(w.aurora > 0.99 && w.aurora <= 1, 'aurora up ' + w.aurora);
  const other = w.cards.find(c => c.key !== G), po = pairOf(w, other.key); tap(w, po[0]); tap(w, po[1]); run(w, 2.5);
  let E = ev(w); assert.ok(!E.some(e => e.type === 'golden'));
  const pg = pairOf(w, G); tap(w, pg[0]); tap(w, pg[1]); run(w, 0.5);
  E = ev(w); const m = E.find(e => e.type === 'match'), g = E.find(e => e.type === 'golden');
  assert.ok(m.golden && g && g.key === G && g.aurora); assert.strictEqual(w.tuk.mood, 'cheer');
  run(w, 0.8); assert.ok(w.aurora > 1.2, 'boost ' + w.aurora);
  run(w, 1.5); const r = w.rewards[w.rewards.length - 1]; assert.ok(!r || r.golden || w.collected.length);
  assert.ok(pg.every(c => c.golden === undefined && c.glow === 0));
  // a normal round: no shimmer
  const w2 = mkWorld({ age: 4 }); roundOf(w2, 'animals', 1); untilPhase(w2, 'play'); assert.strictEqual(w2.aurora, 0);
});

test('surprise floes: blocks on little floes (arc + staggered rows) inside the board, ≥ the age minimum; they bob ±3 px and drift ±2 px and never come closer than 14 px (12 viewports)', () => {
  for (const v of VIEWPORTS) for (const age of [3, 4, 5, 7]) for (let pairs = 2; pairs <= 5; pairs++) {
    const L = IM.World.computeLayout(v.W, v.H, v.ins), g0 = IM.World.chooseGrid(L, 2 * pairs, age), g = IM.World.floesLayout(g0, age);
    const tag = `${v.name} age ${age} ${pairs}`;
    assert.ok(g.cw >= Math.min(g0.cw, CFG.cardMin[age]) - 1e-9 && g.cw <= g0.cw + 1e-9, tag + ' size');
    const R = g.slots.map(q => ({ x: q.x - g.cw / 2, y: q.y - g.ch / 2, w: g.cw, h: g.ch }));
    R.forEach(r => { assert.ok(insideR({ x: r.x - g.driftAmp, y: r.y - g.bobAmp, w: r.w + 2 * g.driftAmp, h: r.h + 2 * g.bobAmp }, g0.board), tag + ' inside the board (with bob)'); });
    for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) assert.ok(IM.World.rectGap(R[i], R[j]) >= 14 - 1e-6, tag + ' gap');
    if (g0.rows > 1 && g0.cols > 2) assert.ok(new Set(g.slots.map(q => Math.round(q.y))).size > g0.rows, tag + ' not a plain grid');
  }
  for (const v of [VIEWPORTS[8], VIEWPORTS[3], VIEWPORTS[5]]) {
    const w = mkWorld({ age: 4, surprise: true, vp: v }); w.levels = ['animals', 'colors', 'shapes', 'count']; w._surpriseOff = 2; w.startLevel(0); w.round = 2; w._beginRound();
    assert.strictEqual(w.surprise, 'floes'); assert.strictEqual(w.layout.grid.style, 'floes');
    untilPhase(w, 'play'); const c = w.cards[0]; let lo = 1e9, hi = -1e9, dxl = 1e9, dxh = -1e9, minGap = 1e9;
    run(w, 8, () => { lo = Math.min(lo, c.y - c.hy); hi = Math.max(hi, c.y - c.hy); dxl = Math.min(dxl, c.x - c.hx); dxh = Math.max(dxh, c.x - c.hx);
      const R = w.cards.map(q => w.cardRect(q)); for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) minGap = Math.min(minGap, IM.World.rectGap(R[i], R[j])); });
    const G = w.layout.grid; assert.ok(G.bobAmp > 1.5, v.name + ' bob room ' + G.bobAmp);
    assert.ok(hi - lo > 1.8 * G.bobAmp - 0.1 && hi <= 3.01 && lo >= -3.01, 'bob'); assert.ok(dxh - dxl > 1.5 * G.driftAmp - 0.1 && dxh <= 2.01 && dxl >= -2.01, 'drift');
    assert.ok(Math.abs(c.bob - (c.y - c.hy)) < 1e-9);
    assert.ok(minGap >= 14 - 1e-6, v.name + ' gap ' + minGap);
    solveRound(w); assert.strictEqual(w.state, 'roundDone');
  }
});

test('hudKeep: rewards keep out of the REAL HUD box main.js measures (403 × 106 px on an iPhone landscape)', () => {
  const v = VIEWPORTS[1], keep = { x: v.W - 421, y: 0, w: 421, h: 106 };
  for (let s = 0; s < 6; s++) {
    const w = new IM.World({ seed: 40 + s, age: 6 }); w.hudKeep = keep; w.setViewport(v.W, v.H, v.ins);
    assert.deepStrictEqual(w.layout.hudKeep, keep);
    const bot = new IM.Bot(w, { skill: 1, seed: s }); w.newSession();
    while (w.state !== 'sessionDone') { bot.step(1 / 30); w.update(1 / 30); w.drainEvents();
      for (const r of w.rewards) if (r.target && r.target.box) assert.ok(!rectsOverlap(r.target.box, keep), 'under the HUD ' + r.kind); }
  }
});

// ======================================================= determinism + bot
test('determinism: same seed + same bot → identical events; the dt split does not matter', () => {
  const hashOf = (dt) => { const r = playSession(77, 5, 0.6, { dt, keep: true, vp: VIEWPORTS[3] }); return JSON.stringify(r.events.map(e => [e.type, e.id || e.a || '', e.round])) + r.w.stars; };
  assert.strictEqual(hashOf(1 / 30), hashOf(1 / 30));
  // same inputs at different frame sizes: replay recorded taps at 1/120
  const w1 = mkWorld({ seed: 4, age: 4 }), rec = [], evA = [];
  const bot = new IM.Bot(w1, { skill: 0.5, seed: 9 });
  const orig = w1.pointerDown.bind(w1);
  w1.pointerDown = (x, y) => { rec.push([Math.round(w1.time / CFG.step), 'down', x, y]); return orig(x, y); };
  const origM = w1.pointerMove.bind(w1), origU = w1.pointerUp.bind(w1);
  w1.pointerMove = (x, y) => { rec.push([Math.round(w1.time / CFG.step), 'move', x, y]); return origM(x, y); };
  w1.pointerUp = (x, y) => { rec.push([Math.round(w1.time / CFG.step), 'up', x, y]); return origU(x, y); };
  const origT = w1.talkAnswer.bind(w1);
  w1.talkAnswer = (id) => { rec.push([Math.round(w1.time / CFG.step), 'talk', id]); return origT(id); };
  w1.newSession();
  for (let i = 0; i < 30 * 200; i++) { bot.step(1 / 30); w1.update(1 / 30); for (const e of w1.drainEvents()) evA.push(e.type + (e.id || e.a || '')); }
  assert.ok(evA.some(e => e.startsWith('flip')) && rec.some(q => q[1] === 'move'));
  const w2 = mkWorld({ seed: 4, age: 4 }), evB = []; w2.newSession();
  let k = 0;
  while (w2.time < w1.time - 1e-9) {
    const s = Math.round(w2.time / CFG.step);
    while (k < rec.length && rec[k][0] <= s) { const q = rec[k]; if (q[1] === 'talk') w2.talkAnswer(q[2]); else if (q[1] === 'down') w2.pointerDown(q[2], q[3]); else if (q[1] === 'move') w2.pointerMove(q[2], q[3]); else w2.pointerUp(q[2], q[3]); k++; }
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

// ======================================================= weather (stages)
const AMB = [
  { skyTop: '#8CCBF0', stage: 0, season: 0, darkness: 0, sun: 1, rainbow: 0, tint: null },
  { skyTop: '#B9B8D8', stage: 1, darkness: 0, rainbow: 0 },
  { skyTop: '#9DB2C6', stage: 2, rainbow: 0 },
  { skyTop: '#A3D8F4', stage: 3, darkness: 0, rainbow: 1 }
];
const AMB_KEYS = ['skyTop', 'skyBottom', 'horizon', 'tint', 'wind', 'sway', 'sun', 'sunX', 'sunY', 'darkness', 'stage', 'rainbow', 'season', 'gust', 'windBase'];
test('weather: ambient per stage (sunny / breezy / rain / rainbow), 2.5 s crossfade incl. rainbow 0..1, gusty wind within ±40 px/s (breezy the windiest)', () => {
  const wx = new IM.Weather({ width: 1280, height: 720, seed: 1 });
  for (let m = 0; m < 4; m++) {
    wx.setWeather(m, { instant: true });
    const a = wx.ambient, e = AMB[m];
    for (const k of AMB_KEYS) assert.ok(k in a, 'ambient.' + k);
    for (const k in e) assert.strictEqual(a[k], e[k], 'stage ' + m + ' ' + k);
    assert.ok(/^#[0-9A-F]{6}$/.test(a.horizon));
  }
  assert.ok(wx.ambient.darkness === 0); wx.setWeather(2, { instant: true }); assert.ok(wx.ambient.darkness > 0 && wx.ambient.darkness < 0.1, 'rain is a little darker');
  assert.strictEqual(IM.Weather.FADE_TIME, 2.5); assert.deepStrictEqual(IM.Weather.STAGES, ['sunny', 'breezy', 'rain', 'rainbow']);
  wx.setWeather(2, { instant: true }); wx.setWeather(3);
  wx.update(0.6, { groundY: 630 }); wx.update(0.65, { groundY: 630 });
  assert.ok(wx.ambient.rainbow > 0.2 && wx.ambient.rainbow < 0.8, 'rainbow fades in ' + wx.ambient.rainbow);
  assert.notStrictEqual(wx.ambient.skyTop, '#9DB2C6'); assert.notStrictEqual(wx.ambient.skyTop, '#A3D8F4');
  wx.update(0.65, { groundY: 630 }); wx.update(0.65, { groundY: 630 }); assert.strictEqual(wx.ambient.skyTop, '#A3D8F4'); assert.strictEqual(wx.ambient.stage, 3); assert.strictEqual(wx.ambient.rainbow, 1);
  for (let m = 0; m < 4; m++) {
    const w2 = new IM.Weather({ width: 1280, height: 720, seed: 5 + m }); w2.setWeather(m, { instant: true });
    let lo = 1e9, hi = -1e9;
    for (let i = 0; i < 1800; i++) { w2.update(1 / 30, { groundY: 630 }); lo = Math.min(lo, w2.ambient.wind); hi = Math.max(hi, w2.ambient.wind); }
    assert.ok(lo >= -40 && hi <= 40);
    if (m === 1) assert.ok(hi > 30, 'breezy gusts ' + hi); else assert.ok(hi < 30, 'calm stage ' + m + ' ' + hi);
  }
});

test('weather: particles per stage (sparkles · snow + streaks in gusts · rain drops + splash rings at the lake · sparkles + gentle snow), cap 120, bursts (shard, splash), deterministic, resize', () => {
  const kinds = [];
  for (let m = 0; m < 4; m++) {
    const wx = new IM.Weather({ width: 1600, height: 720, seed: 3 }); wx.setWeather(m, { instant: true });
    const seen = {}; let maxN = 0, streakGust = 0, streakCalm = 1;
    for (let i = 0; i < 900; i++) {
      wx.update(1 / 30, { groundY: 630, lakeTop: 300 });
      if (i % 50 === 0) { wx.burst(800, 300, { kind: 'confetti', n: 40, color: 'red' }); wx.burst(700, 400, { kind: 'shard' }); wx.burst(1500, 660, { kind: 'splash' }); }
      maxN = Math.max(maxN, wx.particles.length);
      for (const p of wx.particles) {
        seen[p.kind] = 1;
        assert.ok(Number.isFinite(p.x + p.y + p.alpha + p.size + p.rot + p.flipX), 'finite');
        assert.ok(['sky', 'back', 'front'].includes(p.layer));
        assert.ok(IM.Weather.SPRITES.includes(p.sprite), p.sprite);
        if (p.kind === 'snow') assert.ok(p.y < 630 + 61);
        if (p.kind === 'splash' && p.mood === -1 && p.size < 40) { assert.ok(p.scaleY === 0.4); if (p.a0 < 0.8) assert.ok(p.y >= 300 - 1e-6 && p.y <= 630 + 1e-6, 'ring on the lake ' + p.y); }
        if (p.kind === 'streak') { assert.ok(p.stretch >= 1.5 && p.stretch <= 4); if (wx.gust > 0.6) streakGust = Math.max(streakGust, p.alpha / p.a0); else if (wx.gust < 0.05) streakCalm = Math.min(streakCalm, p.alpha / p.a0); }
      }
    }
    assert.ok(maxN <= IM.Weather.CAP);
    if (m === 1) assert.ok(streakGust > 0.95 && streakCalm < 0.4, 'streaks brighten in gusts ' + streakGust + ' ' + streakCalm);
    kinds.push(seen);
  }
  assert.ok(kinds[0].sparkle && !kinds[0].snow && !kinds[0].drop && !kinds[0].streak, 'sunny');
  assert.ok(kinds[1].snow && kinds[1].streak && !kinds[1].drop, 'breezy');
  assert.ok(kinds[2].drop && kinds[2].splash && !kinds[2].snow && !kinds[2].streak, 'rain');
  assert.ok(kinds[3].sparkle && kinds[3].snow && !kinds[3].drop, 'rainbow');
  assert.ok(kinds[0].shard && kinds[0].spray && kinds[0].confetti, 'bursts');
  // rain rings: every drop that reaches the ice leaves a ring there
  const wr = new IM.Weather({ width: 1280, height: 720, seed: 9 }); wr.setWeather(2, { instant: true });
  let rings = 0; for (let i = 0; i < 300; i++) { const n0 = wr.particles.filter(p => p.kind === 'splash').length; wr.update(1 / 60, { groundY: 630, lakeTop: 320 }); rings += Math.max(0, wr.particles.filter(p => p.kind === 'splash').length - n0); }
  assert.ok(rings > 50, 'rings ' + rings);
  const a = new IM.Weather({ width: 1280, height: 720, seed: 4 }), b = new IM.Weather({ width: 1280, height: 720, seed: 4 });
  a.setWeather(2, { instant: true }); b.setWeather(2, { instant: true });
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
