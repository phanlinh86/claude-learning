#!/usr/bin/env node
// Gigi's Peekaboo Windows — headless unit tests for rng / content / world / weather / bot.
// Run from projects/education-game/giraffe-city-windows:   node tests/unit/run.js   (or: node tests/unit/run.js shutter)
// (tests/unit/i18n_voice.test.js is the voice engineer's suite and runs on its own.)
'use strict';
const assert = require('assert');
const { load } = require('./load');

const GW = load();
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const H = 1 / 120;
const J = v => JSON.parse(JSON.stringify(v));
assert.deepStrictEqual = ((orig) => (a, b, m) => orig(J(a), J(b), m))(assert.deepStrictEqual);
assert.notDeepStrictEqual = ((orig) => (a, b, m) => orig(J(a), J(b), m))(assert.notDeepStrictEqual);
const hyp = (x, y) => Math.sqrt(x * x + y * y);
const AGES = [3, 4, 5, 6, 7];
const LANGS = ['en', 'vi'];
const TOPICS = GW.Content.TOPICS;
const CFG = GW.CONFIG;

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
  const w = new GW.World({ seed: o.seed || 1, age: o.age || 4, lang: o.lang || 'en', config: cfg });
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
  const w = new GW.World({ seed, age, lang: opts.lang || 'en', config: opts.config });
  const v = opts.vp || VIEWPORTS[8];
  w.setViewport(v.W, v.H, v.ins);
  const bot = new GW.Bot(w, { skill, seed: seed * 3 + 1 });
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
  const rng = new GW.RNG(seed), hist = [], out = [];
  for (let ri = 0; ri < 4; ri++) { const r = GW.Content.makeRound(topic, { age, lang, rng, roundIndex: ri, history: hist }); hist.push(r.sum); out.push(r); }
  return out;
}
/** Gigi's head checks: box on the safe screen, never within 16 px of the window grid (outside the scroll). */
function headOk(w, tag) {
  const L = w.layout, hb = GW.World.gigiHead(w);
  assert.ok(Number.isFinite(hb.x + hb.y), tag + ' head NaN');
  assert.ok(insideR(hb, L.safe), tag + ' head on screen ' + JSON.stringify(hb));
  if (L.grid && !(w.state === 'round' && w.phase === 'scroll')) assert.ok(!rectsOverlap(hb, grow(L.grid.rect, 16)), tag + ' head on the windows ' + JSON.stringify(hb));
  const g = w.gigi; assert.ok(g.neckLen >= L.neckMin - 1e-6 && g.neckLen <= CFG.stretchMaxK * L.neckMax + 1e-6, tag + ' neck ' + g.neckLen);
}

// ======================================================= RNG
test('rng: deterministic, ranges, shuffle is a permutation', () => {
  const a = new GW.RNG(42), b = new GW.RNG(42), c = new GW.RNG(43);
  const sa = [], sb = [], sc = [];
  for (let i = 0; i < 500; i++) { sa.push(a.next()); sb.push(b.next()); sc.push(c.next()); }
  assert.deepStrictEqual(sa, sb); assert.notDeepStrictEqual(sa, sc);
  assert.ok(sa.every(v => v >= 0 && v < 1));
  const r = new GW.RNG('x');
  for (let i = 0; i < 1000; i++) { const k = r.int(2, 5); assert.ok(k >= 2 && k <= 5 && k === Math.floor(k)); const f = r.float(-1, 1); assert.ok(f >= -1 && f < 1); }
  const arr = [1, 2, 3, 4, 5, 6, 7, 8]; const sh = r.shuffle(arr.slice());
  assert.deepStrictEqual(sh.slice().sort(), arr);
  assert.strictEqual(new Set(r.sample(arr, 5)).size, 5);
});

// ======================================================= content
test('content: palette, animals, homes, things, age topics / pools, pairs and peek tables as DESIGN §3 / §6.1', () => {
  assert.strictEqual(GW.PALETTE.red.fill, '#E84A4A'); assert.strictEqual(GW.PALETTE.pink.dark, '#C9558A');
  assert.strictEqual(GW.PALETTE.yellow.fill, '#FFD23F'); assert.strictEqual(GW.PALETTE.purple.dark, '#6840A8');
  assert.deepStrictEqual(GW.ANIMALS, ['dog', 'cat', 'bird', 'fish', 'bee', 'rabbit', 'duck', 'hen', 'spider']);
  assert.deepStrictEqual(GW.HOMES, { dog: 'kennel', cat: 'basket', bird: 'nest', fish: 'bowl', bee: 'hive', rabbit: 'hutch', duck: 'pond', hen: 'coop', spider: 'web' });
  assert.strictEqual(new Set(Object.values(GW.HOMES)).size, 9, 'one home per animal');
  assert.deepStrictEqual(GW.THINGS, ['umbrella', 'balloon', 'car', 'kite', 'cup', 'boot']);
  assert.deepStrictEqual(GW.AGE_TOPICS, { 3: ['colors', 'shapes', 'size', 'animals'], 4: ['colors', 'shapes', 'count', 'homes'], 5: ['shapes', 'count', 'letters', 'homes'],
    6: ['lower', 'initial', 'add', 'count'], 7: ['initial', 'add', 'sub', 'oddeven'] });
  assert.deepStrictEqual(GW.Content.PAIRS, { 3: [2, 2, 3, 3], 4: [2, 3, 4, 4], 5: [3, 4, 5, 5], 6: [3, 4, 5, 6], 7: [3, 4, 5, 6] });
  assert.deepStrictEqual(GW.Content.PEEK, { 3: 3.5, 4: 2.5, 5: 2.0, 6: 1.5, 7: 1.5 });
  assert.deepStrictEqual(GW.Content.topicsFor(2), GW.AGE_TOPICS[3]); assert.deepStrictEqual(GW.Content.topicsFor(9), GW.AGE_TOPICS[7]);
  for (const a of AGES) { assert.ok(GW.AGE_POOLS[a].length >= 5, 'pool ' + a); GW.AGE_TOPICS[a].forEach(t => assert.ok(GW.AGE_POOLS[a].includes(t))); }
  assert.deepStrictEqual(GW.AGE_POOLS[4], ['colors', 'shapes', 'count', 'homes', 'animals', 'size']);
  for (const l of LANGS) for (const w of GW.WORDS[l]) { assert.ok(GW.ANIMALS.includes(w.animal)); assert.strictEqual(w.sprite, 'animal_' + w.animal);
    assert.strictEqual(w.word[0].toUpperCase().normalize('NFD').replace(/[̣̀́̃̉]/g, '').normalize('NFC'), w.initial, w.word); }
  assert.deepStrictEqual(GW.WORDS.en.map(w => w.initial).join(''), 'DCBFBRDHS');
  assert.deepStrictEqual(GW.WORDS.vi.map(w => w.word + w.initial), ['mèoM', 'cáC', 'ongO', 'vịtV', 'gàG']);
  assert.ok(!GW.WORDS.vi.some(w => /^(th|nh|ch)/.test(w.word)), 'vi skips digraph words');
});

test('content: every topic × age 3–7 × en/vi × 200 seeds → valid, solvable chapters within the rules', () => {
  const COLORS = GW.Content.COLORS;
  let rounds = 0;
  for (const topic of TOPICS) for (const age of AGES) for (const lang of LANGS) for (let s = 0; s < 200; s++) {
    const ch = chapter(topic, age, lang, s * 7919 + age * 13 + (lang === 'vi' ? 5 : 0));
    let prevSet = null;
    ch.forEach((r, ri) => {
      rounds++;
      const tag = `${topic}/${age}/${lang}/${s}/${ri}`;
      assert.strictEqual(GW.Content.validate(r), null, tag);
      assert.strictEqual(r.cards.length, 2 * r.pairs, tag);
      assert.ok(r.cards.length <= 12, tag);
      const want = Math.max(2, Math.min(GW.Content.PAIRS[age][ri], GW.Content.maxPairs(topic, age, lang)));
      assert.strictEqual(r.pairs, want, tag + ' pairs');
      assert.strictEqual(r.peek, GW.Content.PEEK[age], tag + ' peek');
      assert.strictEqual(r.promptKey, 'p.' + topic); assert.strictEqual(r.params.n, r.pairs);
      const keys = {}; r.cards.forEach(c => { keys[c.key] = (keys[c.key] || 0) + 1; });
      assert.ok(Object.values(keys).every(v => v === 2), tag + ' every key on exactly 2 windows');
      assert.strictEqual(new Set(r.cards.map(c => c.id)).size, r.cards.length);
      assert.notStrictEqual(r.sum.set, prevSet, tag + ' identical consecutive rounds'); prevSet = r.sum.set;
      const info = r.pairInfo, ks = Object.keys(info);
      const pairs = ks.map(k => r.cards.filter(c => c.key === k));
      switch (topic) {
        case 'colors': {
          const cs = ks.map(k => info[k].nameValue);
          if (age <= 5) { assert.ok(!GW.Content.clash(cs), tag + ' colour clash ' + cs); assert.ok(cs.every(c => COLORS.includes(c)), 'no pink up to 5'); }
          r.cards.forEach(c => { assert.ok(GW.THINGS.includes(c.face.obj), tag + ' thing'); assert.strictEqual(c.obj, c.face.obj); });
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
        case 'homes': pairs.forEach(p => {
          const A = p.find(c => c.face.kind === 'animal'), Hm = p.find(c => c.face.kind === 'home');
          assert.ok(A && Hm, tag); assert.strictEqual(GW.HOMES[A.face.value], Hm.face.value); assert.strictEqual(Hm.face.sprite, 'home_' + Hm.face.value);
          assert.strictEqual(Hm.nameKind, 'home'); assert.strictEqual(A.nameKind, 'animal');
          assert.strictEqual(info[A.key].animal, A.face.value); assert.strictEqual(info[A.key].home, Hm.face.value); assert.strictEqual(A.key, 'h:' + A.face.value);
        }); break;
        case 'count': case 'oddeven': {
          const hi = topic === 'oddeven' ? 12 : GW.Content.COUNT_RANGE[age][1];
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
          assert.ok(L && A); assert.strictEqual(GW.WORDS[lang].find(w => w.word === A.word).initial, L.face.text); }); break;
        case 'add': case 'sub': pairs.forEach(p => { const T = p.find(c => c.face.kind === 'text'), N = p.find(c => c.face.kind === 'number');
          const m = /^(\d+) ([+−]) (\d+)$/.exec(T.face.text); const v = m[2] === '+' ? +m[1] + +m[3] : +m[1] - +m[3];
          assert.strictEqual(v, N.face.n); assert.ok(topic === 'add' ? v <= (age >= 7 ? 20 : 10) : (v >= 0 && +m[1] <= 10)); }); break;
      }
    });
  }
  assert.ok(rounds >= 96000, rounds);
});

test('content: topic rotation — 4 of the ≥ 5 pool topics, chapter 1 = easiest not first last time, 2–4 easiest first, prefer topics left out last time', () => {
  const D = GW.Content.DIFFICULTY, di = t => D.indexOf(t);
  for (const age of AGES) {
    let last = null; const seen = new Set(), firsts = new Set();
    for (let s = 0; s < 200; s++) {
      const L = GW.Content.topicsFor(age, new GW.RNG(s * 13 + age), last);
      assert.strictEqual(L.length, 4); assert.strictEqual(new Set(L).size, 4);
      L.forEach(t => { assert.ok(GW.AGE_POOLS[age].includes(t)); seen.add(t); });
      const pool = GW.AGE_POOLS[age].slice().sort((a, b) => di(a) - di(b));
      const want1 = pool.find(t => !last || t !== last[0]); assert.strictEqual(L[0], want1, 'chapter 1');
      for (let i = 2; i < 4; i++) assert.ok(di(L[i]) > di(L[i - 1]), 'easiest first');
      if (last && GW.AGE_POOLS[age].length === 5) { const leftOut = GW.AGE_POOLS[age].filter(t => !last.includes(t) && t !== L[0]); leftOut.forEach(t => assert.ok(L.includes(t), 'left-out topic comes back')); }
      if (last) assert.notDeepStrictEqual(L, last);
      firsts.add(L[0]); last = L;
    }
    assert.strictEqual(seen.size, GW.AGE_POOLS[age].length, 'every pool topic is played'); assert.ok(firsts.size >= 2);
  }
  const w = mkWorld({ age: 4 }); w.newSession({ lastTopics: ['colors', 'shapes', 'count', 'homes'] });
  assert.strictEqual(w.levels[0], 'animals'); assert.ok(w.levels.includes('size'));
  const w2 = mkWorld({ age: 4 }); w2.lastTopics = w.levels.slice(); w2.newSession(); assert.notStrictEqual(w2.levels[0], w.levels[0]);
});

test('content: bounded pools — colours ≤ 3 pairs up to age 5, initial en 7 / vi 4 (one word always left out), homes 9', () => {
  assert.strictEqual(GW.Content.maxPairs('colors', 4, 'en'), 3);
  assert.strictEqual(GW.Content.maxPairs('colors', 5, 'en'), 3);
  assert.strictEqual(GW.Content.maxPairs('colors', 6, 'en'), 7);
  assert.strictEqual(GW.Content.maxPairs('initial', 7, 'vi'), 4);
  assert.strictEqual(GW.Content.maxPairs('initial', 7, 'en'), 7);
  assert.strictEqual(GW.Content.maxPairs('homes', 5, 'en'), 9);
  assert.strictEqual(GW.Content.SAFE_SETS.length, 6);
});

test('content: validate() rejects broken rounds (self-check works)', () => {
  const r = GW.Content.makeRound('count', { age: 4, rng: new GW.RNG(3), roundIndex: 2 });
  assert.strictEqual(GW.Content.validate(r), null);
  const bad1 = J(r); bad1.cards[0].key = bad1.cards[1].key === bad1.cards[0].key ? bad1.cards[2].key : bad1.cards[1].key; assert.ok(GW.Content.validate(bad1));
  const bad2 = J(r); const d = bad2.cards.find(c => c.face.kind === 'dots'); d.face.n = d.face.n === 5 ? 4 : d.face.n + 1; assert.ok(GW.Content.validate(bad2), 'dots ≠ numeral');
  const bad3 = J(r); bad3.cards.pop(); assert.ok(GW.Content.validate(bad3));
  const bad4 = J(GW.Content.makeRound('colors', { age: 3, rng: new GW.RNG(1), roundIndex: 3 }));
  bad4.cards[0].face.color = 'teal'; assert.ok(GW.Content.validate(bad4));
  const bad5 = J(GW.Content.makeRound('lower', { age: 6, rng: new GW.RNG(1), roundIndex: 1 }));
  const lo = bad5.cards.find(c => c.face.text === c.face.text.toLowerCase()); lo.face.text = lo.face.text.toUpperCase(); assert.ok(GW.Content.validate(bad5), 'lower pair = 2 capitals');
  const hm = GW.Content.makeRound('homes', { age: 4, rng: new GW.RNG(2), roundIndex: 2 }); assert.strictEqual(GW.Content.validate(hm), null);
  const bad6 = J(hm); const h6 = bad6.cards.find(c => c.face.kind === 'home'); const other = GW.HOME_LIST.find(x => x !== h6.face.value);
  h6.face.value = other; h6.face.sprite = 'home_' + other; assert.ok(GW.Content.validate(bad6), 'wrong home');
  const bad7 = J(GW.Content.makeRound('colors', { age: 4, rng: new GW.RNG(4), roundIndex: 2 })); bad7.cards[0].face.obj = bad7.cards[0].face.obj === 'cup' ? 'kite' : 'cup';
  assert.ok(GW.Content.validate(bad7), 'age 4: a pair shows the same thing');
  const bad8 = J(GW.Content.makeRound('colors', { age: 6, rng: new GW.RNG(4), roundIndex: 2 })); delete bad8.cards[0].face.obj; assert.ok(GW.Content.validate(bad8), 'colour face needs a thing');
});

test('content: deterministic (same seed → same round and talk)', () => {
  for (const t of TOPICS) {
    assert.deepStrictEqual(GW.Content.makeRound(t, { age: 5, rng: new GW.RNG(9), roundIndex: 2 }), GW.Content.makeRound(t, { age: 5, rng: new GW.RNG(9), roundIndex: 2 }));
    assert.deepStrictEqual(GW.Content.makeTalk(t, { age: 5, rng: new GW.RNG(9) }), GW.Content.makeTalk(t, { age: 5, rng: new GW.RNG(9) }));
  }
});

test('talk: every topic × age × lang × 300 seeds → distinct choices incl. the answer; homes "Where does the {animal} live?"', () => {
  for (const t of TOPICS) for (const age of AGES) for (const lang of LANGS) for (let s = 0; s < 300; s++) {
    const k = GW.Content.makeTalk(t, { age, lang, rng: new GW.RNG(s * 31 + age) });
    assert.strictEqual(k.promptKey, 'talk.' + t);
    const vals = k.choices.map(c => c.value);
    assert.strictEqual(new Set(vals).size, vals.length, t);
    assert.ok(k.choices.length >= 2 && k.choices.length <= 3);
    const ans = k.choices.find(c => c.id === k.answerId); assert.ok(ans, 'answer present');
    if (t === 'animals') { assert.strictEqual(k.show, null); assert.strictEqual(k.params.animal, ans.value); assert.strictEqual(k.choices.length, 3); }
    else assert.ok(k.show && k.show.kind, t + ' shows a face');
    if (t === 'homes') { assert.strictEqual(k.show.kind, 'animal'); assert.strictEqual(k.params.animal, k.show.value); assert.strictEqual(ans.value, GW.HOMES[k.show.value]);
      assert.strictEqual(k.choices.length, 3); k.choices.forEach(c => { assert.strictEqual(c.kind, 'home'); assert.strictEqual(c.sprite, 'home_' + c.value); }); }
    if (t === 'colors') { assert.ok(GW.THINGS.includes(k.show.obj)); assert.strictEqual(k.params.obj, k.show.obj); if (age <= 5) assert.ok(!GW.Content.clash(vals) && !vals.includes('pink'), 'talk colours safe'); }
    if (t === 'count') assert.strictEqual(k.show.n, ans.value);
    if (t === 'oddeven') assert.strictEqual(ans.value, k.show.n % 2 ? 'odd' : 'even');
    if (t === 'size') { assert.strictEqual(ans.value, k.show.size); k.choices.forEach(c => { assert.strictEqual(c.sprite, k.show.sprite); }); }
    if (t === 'initial') assert.strictEqual(GW.WORDS[lang].find(w => w.word === k.params.word).initial, ans.value);
  }
});

// ======================================================= layout / grid / building
test('layout: §2 formulas (groundY, Gigi, her boxes and neck, bubble, board, short-side rule)', () => {
  const L = GW.World.computeLayout(1280, 720, null);
  assert.strictEqual(L.groundY, 630); assert.deepStrictEqual(L.gigi, { x: 110, y: 652, h: 150 });
  assert.deepStrictEqual(L.gigiRect, { x: 20, y: 502, w: 180, h: 150 }); assert.strictEqual(L.deeRect, L.gigiRect);
  assert.ok(Math.abs(L.neckBase.x - (110 + 44 / 256 * 150)) < 1e-9 && Math.abs(L.neckBase.y - (652 - 148 / 256 * 150)) < 1e-9);
  assert.ok(Math.abs(L.headRest.x - L.neckBase.x - 18) < 1e-9 && Math.abs(L.headRest.y - L.neckBase.y + 90) < 1e-9);
  assert.ok(Math.abs(L.headRestBox.w - 93) < 1e-9, 'head box 0.62·h');
  assert.strictEqual(L.neckMax, 240);
  assert.deepStrictEqual(L.bubble, { x: 24, y: 20, w: 640, h: 122 });
  assert.strictEqual(L.board.x, 240); assert.strictEqual(L.board.y, 166); assert.strictEqual(L.board.y + L.board.h, 616);
  assert.ok(L.headRestBox.x + L.headRestBox.w + 16 < L.board.x, 'rest head + keep-out left of the board');
  const P = GW.World.computeLayout(720, 1556, { top: 108, bottom: 62 });
  assert.strictEqual(P.groundY, 1556 - 62 - 90); assert.deepStrictEqual(P.gigi, { x: 100, y: P.groundY + 24, h: 140 });
  assert.strictEqual(P.bubble.y, 108 + 96 + 24); assert.strictEqual(P.bubble.h, 124); assert.strictEqual(P.bubble.w, 640);
  assert.strictEqual(P.boards.length, 2); assert.ok(Math.abs(P.boards[0].y + P.boards[0].h - (P.headRestBox.y - 22)) < 1e-9, 'board A above the rest head');
  assert.ok(P.boards[1].x >= P.gigiRect.x + P.gigiRect.w + 40 - 1e-9);
  assert.deepStrictEqual(GW.World.logicalSize(852, 393), { W: 1561, H: 720 });
  assert.deepStrictEqual(GW.World.logicalSize(393, 852), { W: 720, H: 1561 });
  assert.deepStrictEqual(GW.World.logicalSize(1024, 768), { W: 960, H: 720 });
  assert.deepStrictEqual(GW.World.logicalSize(3000, 700), { W: 1600, H: 720 });
});

test('grid + building: 12 viewports × 2–6 pairs × ages → windows ≥ the age minimum, inside board + screen, clear of HUD/bubble/Gigi, gaps ≥ 18; facade ⊇ grid with ≥ 0.5·gap; door on free facade', () => {
  const rows = []; let doors = 0, n0 = 0;
  for (const v of VIEWPORTS) for (const age of AGES) for (let pairs = 2; pairs <= 6; pairs++) {
    const n = 2 * pairs, L = GW.World.computeLayout(v.W, v.H, v.ins), g = GW.World.chooseGrid(L, n, age);
    const tag = `${v.name} age ${age} ${pairs} pairs`;
    n0++;
    assert.ok(g.cols * g.rows >= n && g.cols * g.rows - n <= 1, tag + ' at most one empty slot');
    assert.ok(Math.abs(g.ch - g.cw / 0.78) < 1e-9);
    assert.ok(g.gap >= 18 - 1e-9 && g.gap >= 0.16 * g.cw - 1e-9, tag + ' gap');
    // the game deals at most CONFIG.pairsByAge[age] pairs: those windows are never below the age minimum
    if (pairs <= Math.max(...CFG.pairsByAge[age])) assert.ok(g.cw >= CFG.cardMin[age] - 1e-9, tag + ' window ' + g.cw.toFixed(1) + ' < ' + CFG.cardMin[age]);
    assert.ok(g.cw <= CFG.cardMax + 1e-9);
    const R = g.slots.map(s => ({ x: s.x - g.cw / 2, y: s.y - g.ch / 2, w: g.cw, h: g.ch }));
    for (const r of R) {
      assert.ok(insideR(r, g.board), tag + ' inside board'); assert.ok(insideR(r, L.safe), tag + ' inside the safe screen');
      assert.ok(!rectsOverlap(r, L.hud) && !rectsOverlap(r, L.bubble) && !rectsOverlap(r, L.gigiRect), tag + ' clear of HUD/bubble/Gigi');
      assert.ok(r.y + r.h <= L.groundY - 14 + 1e-6);
    }
    for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) {
      assert.ok(GW.World.rectGap(R[i], R[j]) >= 18 - 1e-6, tag + ' windows too close');
      const hi = grow(R[i], 10), cj = g.slots[j]; assert.ok(!(cj.x > hi.x && cj.x < hi.x + hi.w && cj.y > hi.y && cj.y < hi.y + hi.h));
    }
    if (g.cols * g.rows > n) { const last = g.slots.slice((g.rows - 1) * g.cols); const mid = last.reduce((s, q) => s + q.x, 0) / last.length; assert.ok(Math.abs(mid - (g.rect.x + g.rect.w / 2)) < 1e-6, tag + ' centred'); }
    // building: facade around the grid (≥ 0.5·gap on every side), down to the pavement, inside the board sideways
    const B = g.building, m = 0.5 * g.gap;
    assert.ok(B.x <= g.rect.x - m + 1e-6 && B.y <= g.rect.y - m + 1e-6 && B.x + B.w >= g.rect.x + g.rect.w + m - 1e-6 && B.y + B.h >= g.rect.y + g.rect.h + m - 1e-6, tag + ' facade pad');
    assert.ok(Math.abs(B.y + B.h - (L.groundY + 4)) < 1e-6, tag + ' down to the pavement');
    assert.ok(B.x >= g.board.x - 1e-6 && B.x + B.w <= g.board.x + g.board.w + 1e-6 && B.y >= g.board.y - 1e-6, tag + ' building in the board');
    assert.ok(Math.abs(B.roofH - 0.32 * g.cw) < 1e-9 && Math.abs(B.pad - Math.max(22, 0.22 * g.cw)) < 1e-9);
    if (!L.portrait || g.boardIndex === 1) assert.ok(B.x >= L.gigiRect.x + L.gigiRect.w, tag + ' Gigi stands beside the building');
    if (B.door) {
      doors++;
      const D = { x: B.door.x - B.door.w / 2, y: B.door.y - B.door.h, w: B.door.w, h: B.door.h };
      assert.ok(D.h > 0.3 * g.ch && D.w > 0.25 * g.cw, tag + ' door size');
      assert.ok(insideR(D, B), tag + ' door on the facade');
      R.forEach(r => assert.ok(!rectsOverlap(D, r), tag + ' door over a window'));
      assert.ok(!rectsOverlap(D, L.gigiRect) || (L.portrait && g.boardIndex === 0 && D.x >= L.gigiRect.x + L.gigiRect.w), tag + ' door behind Gigi');
      assert.strictEqual(B.doorX, B.door.x); assert.strictEqual(B.doorW, B.door.w);
    }
    // Gigi's rest head keeps 16 px from the windows
    assert.ok(!rectsOverlap(L.headRestBox, grow(g.rect, 16)), tag + ' rest head on the windows');
    if (age === 4 && pairs === 3) rows.push(`${v.name}: ${g.cols}×${g.rows} ${g.cw.toFixed(0)} px`);
  }
  console.log('      age 4, 3 pairs: ' + rows.join(' · '));
  console.log('      buildings with a door: ' + doors + ' / ' + n0);
  assert.ok(doors / n0 > 0.6);
});

test('grid: the tuned game never needs a window below the minimum; ties prefer the squarer grid; no single column', () => {
  let smallest = 1e9;
  for (const v of VIEWPORTS) {
    const L = GW.World.computeLayout(v.W, v.H, v.ins);
    for (const age of AGES) for (const p of new Set(CFG.pairsByAge[age])) smallest = Math.min(smallest, GW.World.chooseGrid(L, 2 * p, age).cw);
    for (const n of [4, 6]) { const gv = GW.World.chooseGrid(L, n, 4); assert.ok(gv.cols > 1 && gv.rows < n, v.name + ' no single column'); }
  }
  console.log('      smallest window in a tuned round: ' + smallest.toFixed(0) + ' px');
  const P = GW.World.computeLayout(720, 1600, null), gp = GW.World.chooseGrid(P, 4, 4);
  assert.strictEqual(gp.cw, CFG.cardMax); assert.strictEqual(gp.cols, 2); assert.strictEqual(gp.boardIndex, 0, 'board A, 2×2');
});

test('layout: colour rounds never put a yellow window within 40 px of Gigi (12 viewports × 40 seeds)', () => {
  let swaps = 0;
  for (const v of VIEWPORTS) for (let s = 0; s < 40; s++) for (const age of [3, 4]) {
    const w = mkWorld({ vp: v, seed: s + 1, age });
    roundOf(w, 'colors', s % 4);
    for (const c of w.cards) if (c.face.color === 'yellow') {
      const r = { x: c.hx - c.w / 2, y: c.hy - c.h / 2, w: c.w, h: c.h };
      assert.ok(GW.World.rectGap(r, w.layout.gigiRect) >= 40 - 1e-6, v.name + ' yellow near Gigi');
    }
    if (w.cards.some(c => c.slot !== +c.id.slice(1))) swaps++;
  }
  console.log('      rounds with a yellow swap: ' + swaps);
});

// ======================================================= Gigi
test('gigi: head target per window on 12 viewports × 2–5 pairs — the springy neck stretches towards it, the head never comes within 16 px of the windows, stays on screen, joint y ≥ top + 0.35·h', () => {
  let stretched = 0, total = 0, maxLen = 0;
  for (const v of VIEWPORTS) for (const pairs of [2, 3, 4, 5]) {
    const w = mkWorld({ vp: v, age: 6, config: { pairsByAge: { 6: [pairs, pairs, pairs, pairs] } } });
    roundOf(w, 'add', 0); untilPhase(w, 'play');
    const L = w.layout, rest = L.headRest;
    for (const c of w.cards.slice()) {
      const tag = `${v.name} ${pairs} pairs ${c.id}`;
      const before = hyp(w.gigi.headX - c.x, w.gigi.headY - c.y);
      tap(w, c);
      let minD = 1e9;
      for (let i = 0; i < 160; i++) { w.update(H); if (i % 4 === 0) headOk(w, tag); minD = Math.min(minD, hyp(w.gigi.headX - c.x, w.gigi.headY - c.y)); maxLen = Math.max(maxLen, w.gigi.neckLen / L.gigi.h); }
      assert.ok(w.gigi.headY >= L.ins.top + 0.35 * L.gigi.h - 1e-6);
      total++; if (minD < hyp(rest.x - c.x, rest.y - c.y) - 20) stretched++;
      // close it again (mismatch / reset) so the next window can be opened
      run(w, 1.4); if (w.open.length) { w.open.slice().forEach(id => w._close(w.cardById(id))); w.open = []; w._mis = null; w._setPhase('play'); }
      ev(w); void before;
    }
    // after lookHold Gigi goes back to rest
    run(w, 3.6); assert.ok(hyp(w.gigi.headX - rest.x, w.gigi.headY - rest.y) < 3, v.name + ' back to rest');
  }
  console.log(`      head moved ≥ 20 px towards the window: ${stretched} / ${total} · longest neck ${maxLen.toFixed(2)}·h`);
  assert.ok(stretched / total > 0.5);
  assert.ok(maxLen <= CFG.stretchMaxK * CFG.neckMaxK + 1e-6);
});

test('gigi: spring ω 9 ζ 0.55 overshoots a little; moods hop (happy 14 px, cheer 3 hops); blinks; gigiHead() / tap → "gigi"', () => {
  const w = mkWorld({ vp: VIEWPORTS[8] }); roundOf(w, 'colors', 1); untilPhase(w, 'play'); ev(w);
  // pick the window the head can get closest to and watch the stretch
  const c = w.cards.reduce((a, b) => (b.x < a.x || (b.x === a.x && b.y > a.y) ? b : a));
  tap(w, c);
  const g = w.gigi; const tx0 = g.tx, ty0 = g.ty; w.update(H);
  const sx = g.headX, sy = g.headY, D = hyp(g.tx - sx, g.ty - sy);
  assert.ok(D > 30, 'target moved ' + D);
  let over = 0;
  for (let i = 0; i < 200; i++) { w.update(H); const along = ((g.headX - sx) * (g.tx - sx) + (g.headY - sy) * (g.ty - sy)) / D; over = Math.max(over, along / D); }
  assert.ok(over > 1.01 && over < 1.2, 'overshoot ' + over); void tx0; void ty0;
  // moods
  const hops = []; let mx = 0; const w2 = mkWorld(); roundOf(w2, 'animals', 1); untilPhase(w2, 'play');
  const p = pairOf(w2, w2.cards[0].key); tap(w2, p[0]); tap(w2, p[1]);
  for (let i = 0; i < 160; i++) { w2.update(H); mx = Math.max(mx, w2.gigi.hop); }
  assert.ok(Math.abs(mx - 14) < 0.5, 'happy hop ' + mx); assert.strictEqual(w2.dee, w2.gigi, 'old alias');
  void hops;
  // blink
  let blinks = 0, prev = 0; run(w2, 12, () => { if (w2.gigi.blink && !prev) blinks++; prev = w2.gigi.blink; });
  assert.ok(blinks >= 2 && blinks <= 6, 'blinks ' + blinks);
  // tap Gigi's body or head → 'gigi' (never a mistake)
  const L = w2.layout, hb = GW.World.gigiHead(w2), m0 = w2.mismatches;
  assert.strictEqual(w2.pointerDown(L.gigi.x, L.gigi.y - 20), 'gigi');
  assert.strictEqual(w2.pointerDown(hb.x + hb.w / 2, hb.y + hb.h / 2), 'gigi');
  assert.strictEqual(w2.mismatches, m0);
  assert.ok(hb.jx === w2.gigi.headX && hb.jy === w2.gigi.headY && Math.abs(hb.w - 0.62 * L.gigi.h) < 1e-9);
});

// ======================================================= round flow / motion
test('scroll → peek → hide → play: the street pans W in 1.6 s (smooth-step), old building leaves, Gigi trots (walk events), new style ≠ old; peek wave + hold; hide wave', () => {
  const w = mkWorld({ age: 4 });
  roundOf(w, 'animals', 2);
  assert.strictEqual(w.phase, 'scroll'); assert.strictEqual(w.prevBuilding, null, 'first building of the chapter just slides in');
  const E0 = ev(w).filter(e => e.type !== 'level'); assert.strictEqual(E0[0].type, 'scroll'); assert.strictEqual(E0[0].first, true);
  const r0 = E0.find(e => e.type === 'round'); assert.strictEqual(r0.pairs, CFG.pairsByAge[4][2]); assert.ok(r0.building && r0.building.facade);
  const W = w.layout.W, s0 = w.scroll; let lastT = 0, walks = 0, n = 0, mid = null, dxs = [];
  while (w.phase === 'scroll' && n++ < 1000) {
    w.update(H);
    assert.ok(w.scrollT >= lastT - 1e-12, 'monotonic'); lastT = w.scrollT;
    assert.ok(Math.abs(w.buildingDx - (1 - w.scrollT) * W) < 1e-6);
    if (w.phase === 'scroll' && w.scrollT < 1) { assert.ok(w.gigi.walking); assert.strictEqual(w.pointerDown(w.cards[0].x, w.cards[0].y), null, 'no window taps while scrolling'); }
    for (const e of ev(w)) if (e.type === 'walk') walks++;
    if (mid === null && w.phaseTime >= 0.8) mid = w.scrollT;
    dxs.push(w.scrollT);
  }
  assert.ok(Math.abs(w.scroll - s0 - W) < 1e-6, 'scroll += W'); assert.ok(Math.abs(mid - 0.5) < 0.02, 'smooth-step half way ' + mid);
  assert.ok(dxs[1] - dxs[0] < 0.002, 'eases in');
  assert.ok(walks >= 6 && walks <= 8, 'footsteps ' + walks); assert.strictEqual(w.gigi.walking, false);
  untilPhase(w, 'peek'); ev(w);
  const nC = w.cards.length, peekAt = w.time; let hideAt = null, playAt = null;
  n = 0;
  while (w.phase !== 'play' && n++ < 20000) { w.update(H); for (const e of ev(w)) { if (e.type === 'hide') hideAt = w.time; if (e.type === 'play') playAt = w.time; } }
  const pk = CFG.peekByAge[4] * (0.6 + 0.1 * nC), hold = hideAt - peekAt;
  assert.ok(hold > pk && hold < pk + 0.6, 'peek ≈ wave + peek time ' + hold);
  assert.ok(w.cards.every(c => c.open < 0.5 && c.state === 'down'));
  assert.ok(playAt - hideAt < 0.8);
  // next round: the old (lit) building scrolls out, the new one has another facade + shutter colour
  const old = w.building; solveRound(w); assert.strictEqual(w.state, 'roundDone'); run(w, CFG.roundDoneTime + 0.02);
  assert.strictEqual(w.phase, 'scroll'); assert.ok(w.prevBuilding && w.prevBuilding.building === old);
  assert.ok(w.prevBuilding.cards.every(c => c.state === 'matched' && c.light > 0.99 && c.open > 0.98), 'old windows stay lit');
  assert.notStrictEqual(w.building.facade, old.facade); assert.notStrictEqual(w.building.shutter, old.shutter);
  run(w, 0.8); assert.ok(Math.abs(w.prevDx + w.scrollT * W) < 1e-6);
  run(w, 1); assert.strictEqual(w.prevBuilding, null);
});

test('shutter: spring ω 16 ζ 0.42 swings open past 1 to the hinge stop ≤ 1.12 and settles; closing hits 0 with a clack (open clamped, v × −0.25); flip = min(1, open)', () => {
  const w = mkWorld(); roundOf(w, 'colors', 1); untilPhase(w, 'play'); ev(w);
  const c = downCards(w)[0];
  assert.strictEqual(tap(w, c), c.id);
  const E = ev(w); assert.strictEqual(E[0].type, 'flip'); assert.strictEqual(E[0].nameKind, 'color'); assert.strictEqual(E[0].nameValue, c.face.color); assert.strictEqual(E[0].obj, c.face.obj);
  let t = 0, maxO = 0, t95 = null;
  while (t < 0.8) { w.update(H); t += H; maxO = Math.max(maxO, c.open); if (t95 === null && c.open >= 0.95) t95 = t; assert.strictEqual(c.flip, Math.min(1, Math.max(0, c.open))); }
  assert.ok(maxO > 1.08 && maxO <= 1.12 + 1e-9, 'overshoot ' + maxO);
  assert.ok(t95 > 0.08 && t95 < 0.2, 'fast swing ' + t95);
  assert.ok(Math.abs(c.open - 1) < 0.01, 'settles ' + c.open);
  // close it (mismatch) and listen for the clack
  const other = downCards(w).find(x => x.key !== c.key); tap(w, other); ev(w);
  let clacks = [], minO = 1, after = 0, seenZero = false;
  run(w, 2.2, () => { for (const e of w.events) if (e.type === 'clack') clacks.push(e); w.events.length = 0; minO = Math.min(minO, c.open); if (seenZero) after = Math.max(after, c.open); if (c.open === 0 && c._ov >= 0 && clacks.length) seenZero = true; });
  assert.strictEqual(minO, 0, 'never below 0');
  assert.deepStrictEqual(clacks.map(e => e.id).sort(), [c.id, other.id].sort(), 'one clack per window');
  assert.ok(clacks.every(e => e.v >= 4), 'hit speed ' + clacks.map(e => e.v));
  assert.ok(after > 0.001 && after < 0.1, 'small rebound ' + after);
  assert.ok(c.open < 1e-3);
  // tapping an open window says its name again
  const w2 = mkWorld(); roundOf(w2, 'colors', 1); untilPhase(w2, 'play'); const d = downCards(w2)[0]; tap(w2, d); run(w2, 0.3); ev(w2);
  tap(w2, d); const E2 = ev(w2); assert.strictEqual(E2[0].type, 'tap'); assert.strictEqual(E2[0].id, d.id);
});

test('match: check at open ≥ 0.95 → match event; after 0.25 s the lamps light (0.4 s), both flower boxes pop (bloom events, spring peak ≈ 1.2), the faces hop twice (12 px); windows stay open + matched', () => {
  const w = mkWorld(); roundOf(w, 'homes', 2); untilPhase(w, 'play'); ev(w);
  const [a, b] = pairOf(w, w.cards[0].key);
  tap(w, a); tap(w, b);
  let matchT = null, blooms = [], maxB = 0, ups = 0, prevB = 0, maxBo = 0, lit = null, n = 0;
  const t0 = w.time;
  while (n++ < 240) {
    w.update(H);
    for (const e of ev(w)) {
      if (e.type === 'match') { matchT = w.time; assert.strictEqual(e.key, a.key); assert.strictEqual(e.found, 1); assert.strictEqual(e.pairs, w.pairs);
        assert.ok(a.open >= 0.95 && b.open >= 0.95); const an = [a, b].find(x => x.face.kind === 'animal');
        assert.strictEqual(e.animal, an.face.value); assert.strictEqual(e.home, GW.HOMES[an.face.value]); assert.strictEqual(e.nameKind, 'animal'); }
      if (e.type === 'bloom') blooms.push([e.id, w.time - matchT]);
    }
    maxB = Math.max(maxB, a.bloom, b.bloom); maxBo = Math.max(maxBo, a.bounce);
    if (a.bounce < prevB && prevB > 6 && a._pbounce <= prevB && !a._wasDown) { ups++; a._wasDown = true; } if (a.bounce > prevB) a._wasDown = false; prevB = a.bounce;
    if (lit === null && a.light >= 0.999) lit = w.time - matchT;
  }
  assert.ok(matchT !== null && matchT - t0 < 0.25);
  assert.strictEqual(w.phase, 'play');
  assert.ok(Math.abs(lit - (0.25 + 0.4)) < 0.03, 'lamp ' + lit);
  assert.deepStrictEqual(blooms.map(x => x[0]).sort(), [a.id, b.id].sort()); assert.ok(blooms.every(x => x[1] >= 0.29 && x[1] <= 0.47), 'pops ' + blooms);
  assert.ok(maxB > 1.15 && maxB <= 1.21, 'bloom peak ' + maxB); assert.ok(Math.abs(a.bloom - 1) < 0.03);
  assert.strictEqual(ups, 2, 'two hops'); assert.ok(Math.abs(maxBo - 12) < 0.5, 'hop ' + maxBo); assert.strictEqual(a.bounce, 0);
  assert.strictEqual(a.state, 'matched'); assert.strictEqual(b.state, 'matched'); assert.ok(a.open > 0.98 && a.light === 1);
  assert.strictEqual(w.cards.length, 2 * w.pairs, 'matched windows stay'); assert.strictEqual(w.rewards.length, 0, 'no rewards');
});

test('mismatch: faces wiggle (±0.08 rad, 3 wiggles), stay 1.0 s (age 3: 1.2 s), close; streak; the third-tap fast reset', () => {
  for (const [age, show] of [[4, CFG.mismatchShow], [3, CFG.mismatchShowByAge[3]]]) {
    const w = mkWorld({ age }); roundOf(w, 'animals', 3); untilPhase(w, 'play'); ev(w);
    const [a, b] = twoDifferent(w);
    tap(w, a); tap(w, b);
    let misT = null, downT = null, maxRot = 0, signs = 0, prev = 0, n = 0;
    while (n++ < 600 && downT === null) {
      w.update(H);
      for (const e of ev(w)) if (e.type === 'mismatch') { misT = w.time; assert.strictEqual(e.streak, 1); assert.strictEqual(e.nameValueA, a.nameValue); assert.strictEqual(e.nameValueB, b.nameValue); assert.strictEqual(w.phase, 'resolve'); }
      if (misT !== null) { maxRot = Math.max(maxRot, Math.abs(a.wiggle)); if (a.wiggle * prev < 0) signs++; prev = a.wiggle || prev; assert.strictEqual(a.rot, 0, 'the window itself stays'); }
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
  const o3 = downCards(w3)[0]; assert.strictEqual(tap(w3, o3), null); run(w3, 1.6); assert.strictEqual(p3[0].state, 'matched'); assert.strictEqual(w3.found, 1);
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
  assert.strictEqual(tap(w, a), a.id, 'tap on a matched window speaks'); assert.strictEqual(ev(w)[0].type, 'tap');
  run(w, 0.5); assert.strictEqual(w.phase, 'play'); assert.strictEqual(tap(w, other), other.id);
});

test('hints: 3 mismatches in a row → hint {a, b} (glow 2.5 s + the closed window opens a crack ≈ 0.3); cooldown 6 s; manual hint(); idle nudges 12/30/57/87 s, hint from the 2nd', () => {
  const w = mkWorld({ age: 5 }); roundOf(w, 'animals', 3); untilPhase(w, 'play'); ev(w);
  const hints = [];
  for (let k = 0; k < 3; k++) {
    const [a, b] = twoDifferent(w); tap(w, a); tap(w, b); run(w, 1.5);
    for (const e of ev(w)) if (e.type === 'hint') hints.push(e);
  }
  assert.strictEqual(hints.length, 1);
  const A = w.cardById(hints[0].a), B = w.cardById(hints[0].b);
  assert.strictEqual(A.key, B.key); assert.strictEqual(w.streak, 0);
  const w2 = mkWorld({ age: 5 }); roundOf(w2, 'animals', 3); untilPhase(w2, 'play'); ev(w2);
  assert.ok(w2.hint()); const he = ev(w2).find(e => e.type === 'hint'); const HA = w2.cardById(he.a);
  let maxO = 0, glowSeen = 0, t = 0;
  while (t < 3) { w2.update(H); t += H; maxO = Math.max(maxO, HA.open); glowSeen = Math.max(glowSeen, HA.glow); }
  assert.ok(maxO > 0.28 && maxO < 0.45, 'crack ' + maxO); assert.ok(glowSeen > 0.99); assert.strictEqual(HA.glow, 0); assert.ok(HA.open < 0.01);
  assert.strictEqual(HA.state, 'down');
  const w3 = mkWorld({ age: 5 }); roundOf(w3, 'animals', 3); untilPhase(w3, 'play'); ev(w3);
  const hs = [];
  for (let k = 0; k < 8; k++) { const [a, b] = twoDifferent(w3); tap(w3, a); tap(w3, b); run(w3, 1.4); for (const e of ev(w3)) if (e.type === 'hint') hs.push(k); }
  assert.deepStrictEqual(hs, [2, 7], 'cooldown ' + hs);
  const w4 = mkWorld({ age: 4 }); roundOf(w4, 'colors', 2); untilPhase(w4, 'play'); ev(w4);
  const t0 = w4.time, idles = [], ih = [];
  run(w4, 90, () => { for (const e of w4.events) { if (e.type === 'idle') idles.push(+(w4.time - t0).toFixed(2)); if (e.type === 'hint' && e.idle) ih.push(w4.time - t0); } w4.events.length = 0; });
  assert.deepStrictEqual(idles.slice(0, 4).map(Math.round), [12, 30, 57, 87]);
  assert.ok(ih.length >= 2 && Math.round(ih[0]) === 30, 'idle hint from the 2nd nudge');
  const w5 = mkWorld({ age: 4 }); roundOf(w5, 'colors', 2); untilPhase(w5, 'play'); ev(w5);
  run(w5, 10); w5.pointerDown(w5.layout.W / 2, 2); run(w5, 10); assert.ok(!ev(w5).some(e => e.type === 'idle'));
});

test('stars: mismatches ≤ max(1, pairs − 1) → 3, ≤ 2·pairs → 2, else 1; Talk right → +1', () => {
  for (const [m, want] of [[0, 3], [3, 3], [4, 2], [8, 2], [9, 1]]) {
    const w = mkWorld({ age: 5 }); roundOf(w, 'animals', 3); untilPhase(w, 'play'); ev(w);
    assert.strictEqual(w.pairs, 4);
    for (let k = 0; k < m; k++) { const [a, b] = twoDifferent(w); tap(w, a); tap(w, b); run(w, 1.5); }
    solveRound(w);
    const rd = ev(w).find(e => e.type === 'roundDone');
    assert.strictEqual(rd.mismatches, m); assert.strictEqual(rd.stars, want, m + ' mismatches');
  }
  const w = mkWorld({ age: 3 }); roundOf(w, 'animals', 0); untilPhase(w, 'play');
  const [a, b] = twoDifferent(w); tap(w, a); tap(w, b); run(w, 2); solveRound(w);
  assert.strictEqual(w.roundStars, 3);
});

test('cheer: 0.7 s after the last pair the building cheers 1.2 s (cheer {x, y} at the roof centre, windows hop in a wave, Gigi cheers) → roundDone 0.8 s → the next scroll', () => {
  const w = mkWorld({ age: 4 }); roundOf(w, 'colors', 2); untilPhase(w, 'play'); ev(w);
  const keys = [...new Set(w.cards.map(c => c.key))];
  let lastMatch = null, cheerE = null, cheerT = null, doneT = null, hopStart = {}, n = 0;
  for (const k of keys) { const p = pairOf(w, k); tap(w, p[0]); tap(w, p[1]); run(w, 0.6); }
  while (w.state !== 'roundDone' && n++ < 2000) {
    w.update(H);
    for (const e of ev(w)) { if (e.type === 'match') lastMatch = w.time; if (e.type === 'cheer') { cheerE = e; cheerT = w.time; } if (e.type === 'roundDone') doneT = w.time; }
    if (cheerT !== null) for (const c of w.cards) if (c.bounce > 0 && hopStart[c.id] === undefined) hopStart[c.id] = w.time;
    if (w.phase === 'cheer') assert.ok(w.cheer >= 0 && w.cheer <= 1);
  }
  // the last match may have come earlier (in the 0.6 s waits): measure from the event log instead
  const B = w.layout.grid.building;
  assert.ok(cheerE && Math.abs(cheerE.x - (B.x + B.w / 2)) < 1e-6 && Math.abs(cheerE.y - (B.y - B.roofH)) < 1e-6, 'roof centre');
  assert.ok(Math.abs(doneT - cheerT - CFG.cheerTime) < 0.02, 'cheer 1.2 s');
  const order = w.cards.slice().sort((a, b) => a.slot - b.slot).map(c => hopStart[c.id]);
  for (let i = 1; i < order.length; i++) assert.ok(order[i] - order[i - 1] > 0.04 && order[i] - order[i - 1] < 0.08, 'wave');
  void lastMatch;
  const w2 = mkWorld({ age: 4 }); roundOf(w2, 'colors', 2); untilPhase(w2, 'play'); ev(w2);
  const ks = [...new Set(w2.cards.map(c => c.key))];
  for (let i = 0; i < ks.length - 1; i++) { const p = pairOf(w2, ks[i]); tap(w2, p[0]); tap(w2, p[1]); run(w2, 0.6); }
  const pl = pairOf(w2, ks[ks.length - 1]); tap(w2, pl[0]); tap(w2, pl[1]); let mT = null, cT = null; n = 0;
  while (cT === null && n++ < 400) { w2.update(H); for (const e of ev(w2)) { if (e.type === 'match') mT = w2.time; if (e.type === 'cheer') cT = w2.time; } }
  assert.ok(Math.abs(cT - mT - CFG.matchCelebrate) < 0.02, 'celebrate ' + (cT - mT)); assert.strictEqual(w2.gigi.mood, 'cheer');
  run(w2, CFG.cheerTime + CFG.roundDoneTime + 0.03); assert.strictEqual(w2.phase, 'scroll'); assert.strictEqual(w2.round, 3);
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
  assert.ok(w2.lastBuilding && w2.lastBuilding.cards.length, 'the lit building stays behind the Talk panel');
  const w3 = mkWorld({ age: 4 }); w3.newSession(); const pairs = []; n = 0;
  while (w3.level === 0 && w3.state !== 'talk' && n++ < 400000) {
    if (w3.state === 'round' && w3.phase === 'play' && !w3.open.length && w3.phaseTime > (w3.round === 2 ? 42 : 1)) { const d = downCards(w3); const p = pairOf(w3, d[0].key); tap(w3, p[0]); tap(w3, p[1]); w3.pointerDown(w3.layout.W / 2, 2); }
    w3.update(H * 4);
    for (const e of ev(w3)) if (e.type === 'round') pairs.push([e.pairs, e.held]);
  }
  assert.deepStrictEqual(pairs.map(p => p[0]), [2, 2, 3, 3].slice(0, pairs.length));
  const w4 = mkWorld({ age: 5 }); w4.newSession(); w4.levels = ['shapes', 'count', 'letters', 'homes']; w4.startLevel(0); const pairs4 = []; n = 0;
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
  assert.strictEqual(sc[0], true); assert.ok(sc.slice(1).every(f => f === false), 'only the very first building slides in alone'); assert.ok(w5.prevBuilding);
});

test('talk: re-ask every 12 s without an answer; glowAnswer from the 2nd re-ask; answer → +1 star, levelDone after 2 s', () => {
  const w = mkWorld(); w.levels = ['animals', 'colors', 'shapes', 'homes']; w.startLevel(0); w._startTalk(); ev(w);
  const asks = []; run(w, 37, () => { for (const e of w.events) if (e.type === 'talkAsk') asks.push([e.n, e.glowAnswer]); w.events.length = 0; });
  assert.deepStrictEqual(asks, [[1, false], [2, true], [3, true]]);
  const s0 = w.stars; assert.strictEqual(w.talkAnswer(w.talk.answerId), true); assert.strictEqual(w.stars, s0 + 1);
  assert.strictEqual(w.talkAnswer(w.talk.answerId), false, 'only once');
  run(w, 2.05); assert.strictEqual(w.state, 'levelDone');
});

test('resize mid-round: windows move to the new grid + building, open windows stay open, Gigi\'s head stays valid', () => {
  const w = mkWorld({ age: 4 }); roundOf(w, 'animals', 3); untilPhase(w, 'play');
  const p = pairOf(w, w.cards[0].key); tap(w, p[0]); tap(w, p[1]); run(w, 1.5);
  const up = downCards(w)[0]; tap(w, up); run(w, 0.3);
  for (const v of [VIEWPORTS[3], VIEWPORTS[5], VIEWPORTS[7], VIEWPORTS[0]]) {
    w.setViewport(v.W, v.H, v.ins);
    const g = w.layout.grid;
    assert.ok(g && g.cw >= 120 && g.building);
    for (const c of w.cards) { assert.ok(insideR({ x: c.x - c.w / 2, y: c.y - c.h / 2, w: c.w, h: c.h }, g.board)); assert.strictEqual(c.w, g.cw); }
    assert.strictEqual(up.state, 'up'); assert.strictEqual(p[0].state, 'matched');
    for (let i = 0; i < 40; i++) { w.update(H); headOk(w, v.name); }
  }
  run(w, 1); solveRound(w); assert.strictEqual(w.state, 'roundDone');
});

test('interpolation: _px/_py/_popen/_pflip/_pbloom/_phx/_pscroll are the previous sub-step; alpha in [0,1)', () => {
  const w = mkWorld(); roundOf(w, 'colors', 1); run(w, 0.2);
  const s0 = w.scroll; w.update(H); assert.strictEqual(w._pscroll, s0);
  w.update(H * 0.4); assert.ok(w.alpha > 0.35 && w.alpha < 0.45);
  untilPhase(w, 'play'); const c = w.cards[0]; tap(w, c); const o0 = c.open, f0 = c.flip, hx = w.gigi.headX; w.update(H);
  assert.strictEqual(c._popen, o0); assert.strictEqual(c._pflip, f0); assert.strictEqual(w.gigi._phx, hx);
  const hb = GW.World.gigiHead(w, 0); assert.strictEqual(hb.jx, w.gigi._phx);
});

test('same window again and again: taps on the one open window do not reset idle; 3 of them → auto hint on its partner', () => {
  const w = mkWorld({ age: 4 }); roundOf(w, 'animals', 3); untilPhase(w, 'play'); ev(w);
  const c = downCards(w)[0]; tap(w, c); run(w, 0.4); ev(w);
  run(w, 5); tap(w, c); run(w, 1); tap(w, c);
  assert.ok(w._idleT > 5.9, 'idle timer keeps running ' + w._idleT);
  assert.ok(!ev(w).some(e => e.type === 'hint'));
  tap(w, c); const E = ev(w), h = E.find(e => e.type === 'hint');
  assert.ok(h, '3rd same tap → hint'); assert.ok([w.cardById(h.a), w.cardById(h.b)].every(x => x.key === c.key));
  assert.ok(E.filter(e => e.type === 'tap').length === 1, 'still says the name');
});

// ======================================================= surprises + traffic
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
test('surprise round: round index 2 of every chapter, pigeon / bus / balloon rotate per chapter from a session-random start', () => {
  const offs = new Set();
  for (let s = 1; s < 30; s++) {
    const w = new GW.World({ seed: s, age: 4 }); w.setViewport(1280, 720, null);
    const bot = new GW.Bot(w, { skill: 1, seed: s }); w.newSession();
    const seen = [];
    while (w.state !== 'sessionDone') { bot.step(1 / 30); w.update(1 / 30); for (const e of w.drainEvents()) if (e.type === 'round') { if (e.round === 2) seen.push(e.surprise); else assert.strictEqual(e.surprise, null); } }
    assert.strictEqual(seen.length, 4);
    const T = CFG.surpriseTypes, o = T.indexOf(seen[0]); offs.add(o);
    seen.forEach((t, L) => assert.strictEqual(t, T[(o + L) % 3]));
  }
  assert.strictEqual(offs.size, 3);
});

test('surprise pigeon: flies in on an arc, lands on a sill (window bottom edge), pecks; tap → "critter", flies off; never a mistake; leaves at the cheer', () => {
  const w = surpriseRound('pigeon');
  const k = w.critter; assert.strictEqual(k.state, 'fly');
  let landed = null, n = 0, minY = 1e9;
  while (k.state === 'fly' && n++ < 400) { w.update(H); minY = Math.min(minY, k.y); for (const e of ev(w)) if (e.type === 'critter' && e.action === 'land') landed = e; }
  assert.ok(landed && k.state === 'sit');
  const c = w.cardById(k.sillId); assert.ok(Math.abs(k.y - (c.hy + c.h / 2)) < 1e-6 && Math.abs(k.x - c.hx) <= 0.25 * c.w + 1e-6, 'on the sill');
  assert.ok(minY < Math.min(k._bz.y0, k.y) - 10, 'an arc');
  let pecks = 0, pv = 0; run(w, 4, () => { if (k.peck > 0 && pv === 0) pecks++; pv = k.peck; }); assert.ok(pecks >= 1, 'pecks');
  const R = w.critterRect(), m0 = w.mismatches, op = w.open.length;
  assert.strictEqual(w.pointerDown(R.x + R.w / 2, R.y + R.h / 2), 'critter');
  const E = ev(w); assert.ok(E.some(e => e.type === 'critter' && e.critter === 'pigeon' && e.action === 'tap'));
  assert.ok(!E.some(e => e.type === 'flip')); assert.strictEqual(w.mismatches, m0); assert.strictEqual(w.open.length, op);
  assert.strictEqual(k.state, 'away'); run(w, 1.4); assert.strictEqual(w.critter, null, 'gone');
  // untapped: leaves when the building cheers
  const w2 = surpriseRound('pigeon', { seed: 3 }); run(w2, 2); solveRound(w2);
  const w3 = surpriseRound('pigeon', { seed: 5 }); run(w3, 2);
  const ks = [...new Set(w3.cards.map(q => q.key))]; let left = false;
  for (const kk of ks) { const p = pairOf(w3, kk); tap(w3, p[0]); tap(w3, p[1]); run(w3, 0.7, () => { for (const e of w3.events) if (e.type === 'critter' && e.action === 'leave') left = true; }); }
  run(w3, 1.5, () => { for (const e of w3.events) if (e.type === 'critter' && e.action === 'leave') left = true; });
  assert.ok(left || !w3.critter, 'flies off at the cheer');
});

test('surprise bus: rolls in from the left at 120 px/s, stops ≈ 2 s mid-screen, drives off right; tap → honk + wave; window taps still work', () => {
  const w = surpriseRound('bus');
  const k = w.critter, L = w.layout; assert.ok(k.x < 0 && Math.abs(k.y - (L.groundY + CFG.busDy)) < 1e-6);
  let vmax = 0, stopT = null, outT = null, n = 0;
  while (k.state !== 'out' && n++ < 12000) { w.update(H); vmax = Math.max(vmax, k.vx); if (stopT === null && k.state === 'stop') stopT = w.time; }
  outT = w.time;
  assert.ok(Math.abs(vmax - 120) < 1, 'cruise ' + vmax); assert.ok(Math.abs(k.x - L.W / 2) < 2, 'stops mid-screen'); assert.ok(Math.abs(outT - stopT - 2) < 0.05, 'stop 2 s');
  const w2 = surpriseRound('bus', { seed: 7 }); const k2 = w2.critter; n = 0; while (k2.state !== 'stop' && n++ < 12000) w2.update(H);
  const R = w2.critterRect(); assert.strictEqual(w2.pointerDown(R.x + R.w / 2, R.y + R.h / 2), 'critter');
  assert.ok(ev(w2).some(e => e.type === 'critter' && e.critter === 'bus' && e.action === 'tap')); assert.ok(k2.honk > 0.9 && k2.wave > 0.9);
  let t0 = w2.time; n = 0; while (k2.state === 'stop' && n++ < 2000) w2.update(H); assert.ok(w2.time - t0 > 2.5, 'honk keeps it a moment longer');
  n = 0; while (w2.critter && n++ < 20000) w2.update(H); assert.strictEqual(w2.critter, null, 'drove off');
  const d = downCards(w2)[0]; assert.strictEqual(tap(w2, d), d.id);
});

test('surprise balloon: rises from the pavement at 40 px/s past the windows, swaying on a pendulum string; tap → twirls up fast; gone off the top', () => {
  const w = surpriseRound('balloon');
  const k = w.critter, g = w.layout.grid.rect;
  assert.ok(k.x >= g.x && k.x <= g.x + g.w, 'in front of the windows'); assert.ok(GW.PALETTE[k.color]);
  assert.ok(!w.cards.some(c => c.face.color === k.color), 'not a colour of the round');
  const y0 = k.y; run(w, 2); assert.ok(Math.abs((y0 - k.y) / 2 - 40) < 1, 'rise 40 px/s');
  let lo = 1, hi = -1; run(w, 4, () => { lo = Math.min(lo, k.swing); hi = Math.max(hi, k.swing); }); assert.ok(hi - lo > 0.002 && hi < 0.8, 'string swings ' + lo + ' ' + hi);
  const R = w.critterRect(); assert.strictEqual(w.pointerDown(R.x + R.w / 2, R.y + R.h / 2), 'critter'); assert.strictEqual(k.state, 'away');
  const y1 = k.y; run(w, 0.5); assert.ok(y1 - k.y > 100, 'fast'); assert.ok(Math.abs(k.rot) > 1, 'twirls');
  run(w, 4); assert.strictEqual(w.critter, null);
});

test('traffic: 0–2 cars on the road lanes (6–14 s apart), never overlap in a lane, none spawn during Talk; deterministic', () => {
  const w = mkWorld({ age: 4 }); w.newSession();
  let maxN = 0, seen = 0, ids = new Set(), n = 0;
  while (w.state !== 'talk' && n++ < 100000) {
    if (w.state === 'round' && w.phase === 'play' && !w.open.length && w.phaseTime > 3) { const d = downCards(w); if (d.length) { const p = pairOf(w, d[0].key); tap(w, p[0]); tap(w, p[1]); } }
    w.update(H * 2);
    maxN = Math.max(maxN, w.traffic.length);
    for (const c of w.traffic) { ids.add(c.id); assert.ok(Math.abs(c.y - (w.layout.groundY + CFG.carLaneDy[c.lane])) < 1e-6); assert.strictEqual(Math.sign(c.vx) || c.face, c.face); }
    for (const a of w.traffic) for (const b of w.traffic) if (a !== b && a.lane === b.lane) assert.ok(Math.abs(a.x - b.x) >= (a.w + b.w) / 2, 'cars overlap');
  }
  seen = ids.size; assert.ok(maxN <= 2 && seen >= 3, 'cars ' + seen + ' max ' + maxN);
  const before = ids.size; let spawned = 0; run(w, 20, () => { for (const c of w.traffic) if (!ids.has(c.id)) { spawned++; ids.add(c.id); } }); assert.strictEqual(spawned, 0, 'no new cars during Talk'); void before;
  const a = mkWorld({ seed: 5 }), b = mkWorld({ seed: 5 }); a.newSession(); b.newSession();
  run(a, 30); for (let i = 0; i < 1800; i++) b.update(1 / 60);
  assert.deepStrictEqual(a.traffic.map(c => [c.id, Math.round(c.x)]), b.traffic.map(c => [c.id, Math.round(c.x)]));
});

// ======================================================= determinism + bot
test('determinism: same seed + same bot → identical events; the dt split does not matter', () => {
  const hashOf = (dt) => { const r = playSession(77, 5, 0.6, { dt, keep: true, vp: VIEWPORTS[3] }); return JSON.stringify(r.events.map(e => [e.type, e.id || e.a || '', e.round])) + r.w.stars; };
  assert.strictEqual(hashOf(1 / 30), hashOf(1 / 30));
  const w1 = mkWorld({ seed: 4, age: 4, surprise: true }), rec = [], evA = [];
  const bot = new GW.Bot(w1, { skill: 0.5, seed: 9, critterTaps: 1 });
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

test('bot: full sessions for every age × lang × 4 viewports × 3 skills reach sessionDone; no stuck round, no NaN; Gigi\'s head never on the windows', () => {
  const vps = [VIEWPORTS[1], VIEWPORTS[3], VIEWPORTS[5], VIEWPORTS[7]];
  let k = 0, maxRound = 0, checks = 0;
  for (const age of AGES) for (const lang of LANGS) for (const vp of vps) for (const skill of [0, 0.5, 0.9]) {
    k++;
    let rs = 0;
    const r = playSession(100 + k, age, skill, { lang, vp, each: (w, e) => {
      for (const x of e) { if (x.type === 'round') rs = w.time; if (x.type === 'roundDone') maxRound = Math.max(maxRound, w.time - rs); }
      if ((Math.round(w.time * 30) & 7) === 0) {
        for (const c of w.cards) assert.ok(Number.isFinite(c.x + c.y + c.open + c.flip + c.light + c.bloom + c.bounce + c.wiggle), 'window NaN');
        if (w.critter) assert.ok(Number.isFinite(w.critter.x + w.critter.y + w.critter.rot), 'critter NaN');
        for (const car of w.traffic) assert.ok(Number.isFinite(car.x + car.vx), 'car NaN');
        assert.ok(Number.isFinite(w.scroll + w.scrollT), 'scroll NaN');
        headOk(w, `age ${age} ${vp.name}`); checks++;
      }
    } });
    assert.strictEqual(r.w.state, 'sessionDone', `age ${age} ${lang} skill ${skill}`);
    assert.ok(r.t < 1200, 'session ' + r.t);
  }
  assert.ok(maxRound < 300, 'longest round ' + maxRound);
  console.log('      longest round (skill 0 = no memory at all): ' + maxRound.toFixed(0) + ' s · head checks ' + checks);
});

test('bot: perfect memory (skill 1) never mismatches → 3 stars every round; taps hit the window it aims at', () => {
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

// ======================================================= weather (city moods)
const AMB = [
  { skyTop: '#8CCBF2', mood: 0, darkness: 0, sun: 1, rain: 0, rainbow: 0, wet: 0 },
  { skyTop: '#9FD0EE', mood: 1, darkness: 0, rain: 0, rainbow: 0 },
  { skyTop: '#8E9FB3', mood: 2, darkness: 0.18, sun: 0, rain: 1, rainbow: 0, wet: 1 },
  { skyTop: '#A7D3EE', mood: 3, darkness: 0, rain: 0, rainbow: 1, wet: 0.4 }
];
const AMB_KEYS = ['skyTop', 'skyBottom', 'horizon', 'tint', 'wind', 'gust', 'windBase', 'sway', 'sun', 'sunX', 'sunY', 'darkness', 'rain', 'rainbow', 'wet', 'cloudSpeed', 'mood', 'season'];
test('weather: ambient per mood (sunny, breezy, rain, rainbow), 2.5 s crossfade, gusty wind within ±40 px/s (breezy the windiest)', () => {
  const wx = new GW.Weather({ width: 1280, height: 720, seed: 1 });
  for (let m = 0; m < 4; m++) {
    wx.setWeather(m, { instant: true });
    const a = wx.ambient, e = AMB[m];
    for (const k of AMB_KEYS) assert.ok(k in a, 'ambient.' + k);
    for (const k in e) assert.strictEqual(a[k], e[k], 'mood ' + m + ' ' + k);
    assert.ok(/^#[0-9A-F]{6}$/.test(a.horizon));
  }
  assert.strictEqual(GW.Weather.FADE_TIME, 2.5);
  wx.setWeather(0, { instant: true }); wx.setWeather(2);
  wx.update(0.6, { groundY: 630 }); wx.update(0.65, { groundY: 630 });
  assert.notStrictEqual(wx.ambient.skyTop, '#8CCBF2'); assert.notStrictEqual(wx.ambient.skyTop, '#8E9FB3'); assert.ok(wx.ambient.rain > 0.3 && wx.ambient.rain < 0.7);
  wx.update(0.65, { groundY: 630 }); wx.update(0.65, { groundY: 630 }); assert.strictEqual(wx.ambient.skyTop, '#8E9FB3'); assert.strictEqual(wx.ambient.mood, 2);
  for (let m = 0; m < 4; m++) {
    const w2 = new GW.Weather({ width: 1280, height: 720, seed: 5 + m }); w2.setWeather(m, { instant: true });
    let lo = 1e9, hi = -1e9;
    for (let i = 0; i < 1800; i++) { w2.update(1 / 30, { groundY: 630 }); lo = Math.min(lo, w2.ambient.wind); hi = Math.max(hi, w2.ambient.wind); }
    assert.ok(lo >= -40 && hi <= 40);
    if (m === 1) assert.ok(hi > 30 && lo > 10, 'breezy gusts ' + lo + ' ' + hi); else assert.ok(hi < 30, 'calmer mood ' + m + ' ' + hi);
  }
});

test('weather: rain → rainbow: the rain fades out over 6 s, the rainbow fades in (2 → 8 s), wet decays towards 0.4, darkness follows the rain', () => {
  const wx = new GW.Weather({ width: 1280, height: 720, seed: 2 }); wx.setWeather(2, { instant: true });
  for (let i = 0; i < 60; i++) wx.update(1 / 30, { groundY: 630 });
  wx.setWeather(3);
  const at = {};
  for (let i = 0; i <= 600; i++) { if (i % 30 === 0) at[i / 30] = { rain: wx.ambient.rain, rb: wx.ambient.rainbow, wet: wx.ambient.wet, dk: wx.ambient.darkness, drops: wx.particles.filter(p => p.kind === 'drop').length }; wx.update(1 / 30, { groundY: 630 }); }
  assert.ok(Math.abs(at[3].rain - 0.5) < 0.03 && at[6].rain < 1e-6 && at[2].rb < 0.01 && at[5].rb > 0.4 && at[8].rb > 0.99, JSON.stringify(at[3]) + JSON.stringify(at[5]));
  assert.ok(at[1].drops > at[4].drops && at[7].drops === 0, 'drops thin out');
  assert.ok(at[20].wet < 0.6 && at[20].wet > 0.4, 'wet ' + at[20].wet); assert.ok(Math.abs(at[3].dk - 0.09) < 0.02, 'darkness ' + at[3].dk);
});

test('weather: particles per mood (sparkles; leaves + paper + kites; rain streaks + splashes; sparkles), cap 140, deterministic, resize', () => {
  const kinds = [];
  for (let m = 0; m < 4; m++) {
    const wx = new GW.Weather({ width: 1600, height: 720, seed: 3 }); wx.setWeather(m, { instant: true });
    const seen = {}; let maxN = 0, kites = 0;
    for (let i = 0; i < 900; i++) {
      wx.update(1 / 30, { groundY: 630 });
      if (i % 50 === 0) wx.burst(800, 300, { kind: 'confetti', n: 40, color: 'red' });
      maxN = Math.max(maxN, wx.particles.length); kites = Math.max(kites, wx.kites.length);
      for (const p of wx.particles) {
        seen[p.kind] = 1;
        assert.ok(Number.isFinite(p.x + p.y + p.alpha + p.size + p.rot + p.flipX), 'finite');
        assert.ok(['sky', 'back', 'front'].includes(p.layer));
        assert.ok(GW.Weather.SPRITES.includes(p.sprite), p.sprite);
        if (p.kind === 'drop') { assert.ok(Math.abs(p.rot + Math.atan2(p.vx, p.vy)) < 1e-9, 'slanted along its velocity'); assert.ok(p.vy > 600); }
        if (['leaf', 'paper', 'drop'].includes(p.kind)) assert.ok(p.y < 630 + 81);
      }
      for (const k of wx.kites) { assert.ok(Number.isFinite(k.x + k.y + k.rot + k.ax + k.ay)); assert.ok(k.ay > 720, 'string from off-screen'); assert.ok(k.y > 0 && k.y < 630 * 0.4); }
    }
    assert.ok(maxN <= GW.Weather.CAP, 'cap ' + maxN);
    kinds.push(Object.assign(seen, { kites }));
  }
  assert.strictEqual(GW.Weather.CAP, 140);
  assert.ok(kinds[0].sparkle && !kinds[0].leaf && !kinds[0].drop && !kinds[0].kites, 'sunny');
  assert.ok(kinds[1].leaf && kinds[1].paper && kinds[1].kites === 2 && !kinds[1].drop, 'breezy');
  assert.ok(kinds[2].drop && kinds[2].splash && !kinds[2].leaf && !kinds[2].kites, 'rain');
  assert.ok(kinds[3].sparkle && !kinds[3].drop && !kinds[3].leaf, 'rainbow');
  const wr = new GW.Weather({ width: 1280, height: 720, seed: 2 }); wr.setWeather(2, { instant: true });
  let drops = 0; for (let i = 0; i < 300; i++) { wr.update(1 / 30, { groundY: 630 }); drops = Math.max(drops, wr.particles.filter(p => p.kind === 'drop').length); }
  assert.ok(drops >= 85 && drops <= 95, 'about 90 streaks ' + drops);
  const wb = new GW.Weather({ width: 1280, height: 720, seed: 2 }); wb.setWeather(1, { instant: true });
  let vxMax = 0; for (let i = 0; i < 900; i++) { wb.update(1 / 30, { groundY: 630 }); for (const p of wb.particles) if (p.kind === 'leaf') vxMax = Math.max(vxMax, p.vx); }
  assert.ok(vxMax > 50, 'wind-blown leaves ' + vxMax);
  const a = new GW.Weather({ width: 1280, height: 720, seed: 4 }), b = new GW.Weather({ width: 1280, height: 720, seed: 4 });
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
