#!/usr/bin/env node
// Koko's Cake Tower — headless unit tests for rng / content / world / weather / bot.
// Run from projects/education-game/koala-candy-cake:   node tests/unit/run.js   (exit 1 on any failure)
// (tests/unit/i18n_voice.test.js is the voice engineer's suite and runs on its own.)
'use strict';
const assert = require('assert');
const crypto = require('crypto');
const { load } = require('./load');

const CK = load();
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const H = 1 / 120;
const AGES = [3, 4, 5, 6, 7];
const LANGS = ['en', 'vi'];
const TOPICS = CK.Content.TOPICS;
const C = CK.Content;
const CFG = CK.CONFIG;
const J = v => JSON.parse(JSON.stringify(v));   // objects from the vm sandbox have other prototypes
assert.deepStrictEqual = ((orig) => (a, b, m) => orig(J(a), J(b), m))(assert.deepStrictEqual);

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
  { W: 1600, H: 720, ins: null, name: '1600×720' },
  { W: 720, H: 1600, ins: { top: 44, right: 0, bottom: 34, left: 0 }, name: '720×1600 tall insets' },
  { W: 1080, H: 720, ins: { top: 24, right: 44, bottom: 20, left: 44 }, name: 'iPad Pro landscape insets' },
  { W: 720, H: 1036, ins: { top: 21, right: 0, bottom: 18, left: 0 }, name: 'iPad 820×1180 portrait' },
  { W: 720, H: 1280, ins: { top: 37, right: 0, bottom: 0, left: 0 }, name: 'iPhone SE 375×667 portrait' },
  { W: 1280, H: 720, ins: { top: 0, right: 37, bottom: 21, left: 37 }, name: 'iPhone SE landscape' },
  { W: 1561, H: 720, ins: { top: 0, right: 108, bottom: 38, left: 108 }, name: 'iPhone 393×852 landscape' },
  { W: 720, H: 1561, ins: { top: 108, right: 0, bottom: 62, left: 0 }, name: 'iPhone 393×852 portrait' },
  { W: 1036, H: 720, ins: { top: 21, right: 0, bottom: 18, left: 0 }, name: 'iPad 820×1180 landscape' },
  { W: 720, H: 1036, ins: { top: 21, right: 0, bottom: 18, left: 0 }, name: 'iPad 820×1180 portrait (2)' }
];
const VP = VIEWPORTS[8];

// ---------- helpers ----------
function mkWorld(o) {
  o = o || {};
  const cfg = Object.assign(o.surprise ? {} : { surpriseTypes: [] }, o.config || {});
  const w = new CK.World({ seed: o.seed || 1, age: o.age || 4, lang: o.lang || 'en', config: cfg });
  const v = o.vp || VP;
  w.setViewport(v.W, v.H, v.ins);
  w.newSession(); w.drainEvents();
  return w;
}
/** Starts round `ri` of `topic` directly (skips the intro) and runs to the first ask. */
function roundOf(w, topic, ri, surprise) {
  w.levels = [topic, topic, topic, topic];
  w.startLevel(0); w.round = ri || 0;
  w.cfg.surpriseRound = ri || 0; w.cfg.surpriseTypes = surprise ? [surprise] : [];
  w._beginRound();
  untilPhase(w, 'ask');
  return w;
}
function run(w, s, each) { const n = Math.round(s / H); for (let i = 0; i < n; i++) { if (each) each(i); w.update(H); } }
function untilPhase(w, ph, max) { let n = 0; while (w.phase !== ph && n++ < (max || 12000)) w.update(H); assert.strictEqual(w.phase, ph, 'phase ' + ph + ' (now ' + w.state + '/' + w.phase + ')'); }
function until(w, fn, max) { let n = 0; while (!fn() && n++ < (max || 24000)) w.update(H); assert.ok(fn(), 'condition not reached'); }
function evs(w) { return w.drainEvents(); }
function rightP(w) { return w.pieceById(w.answerId()); }
function wrongP(w) { const a = w.answerId(); return w.pieces.find(p => p.id !== a && p.state === 'rest'); }
/** A real finger drag: press on the piece, move in `steps` moves (dt each), hold, lift. → pointerUp result */
function drag(w, p, x1, y1, o) {
  o = o || {};
  const x0 = p.x + (o.dx || 0), y0 = p.y + (o.dy || 0), steps = o.steps || 8, dt = o.dt || 0.04;
  const r = w.pointerDown(x0, y0);
  assert.strictEqual(r, p.id, 'grab ' + p.id + ' got ' + r);
  for (let i = 1; i <= steps; i++) {
    const u = i / steps;
    w.pointerMove(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u - Math.sin(Math.PI * u) * 40);
    w.update(dt);
  }
  w.update(o.hold !== undefined ? o.hold : 0.15);
  return w.pointerUp(x1, y1);
}
function dragToTower(w, p, o) { const d = w.dropPoint(); return drag(w, p, d.x + (o && o.ox || 0), d.y, o); }
function hashEvents(list) {
  const h = crypto.createHash('sha1');
  for (const e of list) h.update(JSON.stringify(e, (k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)));
  return h.digest('hex').slice(0, 12);
}
function onScreen(w, x, y, pad) { const L = w.layout; pad = pad || 0; return x >= -pad && x <= L.W + pad && y >= -pad && y <= L.H + pad; }
function ovl(a, b, m) { m = m || 0; return a.l < b.r + m && b.l < a.r + m && a.t < b.b + m && b.t < a.b + m; }
function kbox(K) { return { l: K.x, t: K.y, r: K.x + K.w, b: K.y + K.h }; }

// ======================================================================== content
test('content: every topic × age × lang × round over 150 seeds — exactly one matching choice (self-check + independent re-check)', () => {
  let n = 0;
  for (const age of AGES) for (const topic of TOPICS) for (const lang of LANGS) for (let ri = 0; ri < 4; ri++) for (let s = 0; s < 150; s++) {
    const r = C.makeRound(topic, { age, lang, rng: new CK.RNG(s * 97 + ri * 13 + age), roundIndex: ri });
    assert.strictEqual(C.validate(r), null);
    for (const a of r.asks) {
      const hits = a.choices.map((b, i) => i).filter(i => C.matches(a, a.choices[i], lang));
      assert.deepStrictEqual(hits, [a.answer], topic + ' age ' + age + ' ' + a.promptKey);
      assert.strictEqual(a.nameKind, a.choices[a.answer].nameKind);
      assert.strictEqual(a.nameValue, a.choices[a.answer].nameValue);
      const keys = a.choices.map(C.blockKey); assert.strictEqual(new Set(keys).size, keys.length, 'distinct choices');
    }
    n++;
  }
  assert.strictEqual(n, 5 * 11 * 2 * 4 * 150);
});

test('content: blocks per round 3: 2,2,3,3 · 4: 2,3,3,4 · 5: 3,4,4,5 · 6–7: 4,5,5,5; choices 2 / 3 / 3 (6–7: 4 from round 2), warm-up 2, size 2', () => {
  const T = { 3: [2, 2, 3, 3], 4: [2, 3, 3, 4], 5: [3, 4, 4, 5], 6: [4, 5, 5, 5], 7: [4, 5, 5, 5] };
  for (const age of AGES) for (const topic of TOPICS) for (let ri = 0; ri < 4; ri++) {
    const r = C.makeRound(topic, { age, lang: 'en', rng: new CK.RNG(ri + 1), roundIndex: ri });
    assert.strictEqual(r.n, T[age][ri]); assert.strictEqual(r.asks.length, T[age][ri]);
    const k = topic === 'size' || ri === 0 || age === 3 ? 2 : age >= 6 && ri >= 2 ? 4 : 3;
    for (const a of r.asks) assert.strictEqual(a.choices.length, k, topic + ' age ' + age + ' r' + ri);
    for (const a of r.asks) for (const b of a.choices) assert.ok(C.KIND_OF[topic].includes(b.kind));
  }
});

test('content: colour-blind-safe below age 5 — the answer never next to a clashing colour (blue+purple, red+green, yellow+orange, green+orange, red+orange), no pink; yellow not in every set, orange asked', () => {
  let pink5 = false, seen = new Set(), sets3 = 0, yellow3 = 0;
  for (const age of AGES) for (const topic of ['colors', 'shapes', 'size']) for (let ri = 0; ri < 4; ri++) for (let s = 0; s < 300; s++) {
    const r = C.makeRound(topic, { age, lang: 'en', rng: new CK.RNG(s + 1000 * ri), roundIndex: ri });
    for (const a of r.asks) {
      const cs = [...new Set(a.choices.map(b => b.color).filter(Boolean))];
      if (age < 5) {
        const ac = a.choices[a.answer].color;
        assert.ok(!C.clashAns(ac, cs), 'clash ' + ac + ' vs ' + cs.join('+'));
        if (cs.length === 3) { sets3++; if (cs.includes('yellow')) yellow3++; }
        assert.ok(!cs.includes('pink'), 'pink below 5');
        if (topic === 'shapes') assert.strictEqual(cs.length, a.choices.length, 'shapes in different colours ≤ 4');
        if (topic === 'colors') seen.add(a.params.color);
      } else if (cs.includes('pink')) pink5 = true;
    }
  }
  assert.ok(pink5, 'pink is an answer colour from age 5');
  for (const c of ['red', 'blue', 'yellow', 'green', 'purple', 'orange']) assert.ok(seen.has(c), 'colour asked ' + c);
  assert.ok(yellow3 / sets3 < 0.75, 'yellow in ' + (100 * yellow3 / sets3).toFixed(0) + ' % of the 3-colour sets');
});

test('content: no two consecutive asks share an answer; distractors vary every ask; rounds vary (first ask ≠ last ask of the previous)', () => {
  for (const age of AGES) for (const topic of TOPICS) for (let s = 0; s < 60; s++) {
    const rng = new CK.RNG(s + 7);
    let prev = null;
    for (let ri = 0; ri < 4; ri++) {
      const r = C.makeRound(topic, { age, lang: 'vi', rng, roundIndex: ri, avoid: prev });
      for (let q = 1; q < r.asks.length; q++) {
        const A = r.asks[q], B = r.asks[q - 1];
        assert.notStrictEqual(C.blockKey(A.choices[A.answer]), C.blockKey(B.choices[B.answer]));
        if (topic !== 'size') assert.notStrictEqual(A.choices[A.answer].value, B.choices[B.answer].value, topic + ' same value twice');
        const d = x => x.choices.filter((c, j) => j !== x.answer).map(C.blockKey).sort().join();
        assert.notStrictEqual(d(A), d(B), 'distractors repeat');
      }
      if (prev && r.asks[0].promptKey !== 'p.countUp') assert.notStrictEqual(r.asks[0].promptKey + JSON.stringify(r.asks[0].params), prev.promptKey + JSON.stringify(prev.params));
      prev = r.asks[r.asks.length - 1];
    }
  }
});

test('content: count — towers 0–2 count up 1, 2, … (numeral + dots), tower 3 dots in ascending order; age 4 dots 1–5, distractors ≥ 2 from the answer when possible', () => {
  let far = 0, tot = 0;
  for (const age of AGES) for (let s = 0; s < 200; s++) for (let ri = 0; ri < 4; ri++) {
    const r = C.makeRound('count', { age, lang: 'en', rng: new CK.RNG(s * 3 + ri), roundIndex: ri });
    if (ri <= 2) {
      r.asks.forEach((a, q) => {
        assert.strictEqual(a.promptKey, 'p.countUp');
        assert.strictEqual(a.params.first, q === 0);
        const b = a.choices[a.answer]; assert.ok(b.kind === 'number' && b.showDots && b.n === a.params.n);
        assert.ok(a.choices.every(c => c.kind === 'number' && c.showDots && c.n >= 1 && c.n <= 10));
      });
      if (age <= 5) assert.deepStrictEqual(r.asks.map(a => a.params.n), r.asks.map((a, q) => q + 1));
    } else {
      r.asks.forEach(a => {
        assert.strictEqual(a.promptKey, 'p.count');
        assert.ok(a.choices.every(c => c.kind === 'dots' && c.n >= C.COUNT_RANGE[age][0] && c.n <= C.COUNT_RANGE[age][1]));
        if (age === 4) a.choices.forEach((c, j) => { if (j !== a.answer) { tot++; if (Math.abs(c.n - a.params.n) >= 2) far++; } });
      });
      r.asks.forEach((a, q) => { if (q) assert.ok(a.params.n > r.asks[q - 1].params.n, 'ascending dots'); });
    }
  }
  assert.ok(far / tot > 0.7, 'age 4 distractors mostly ≥ 2 apart (' + (far / tot).toFixed(2) + ')');
});

test('content: animal cookies — by sound from round 2 at age ≥ 4 (about half, never bunny / bear), never earlier or at age 3; size: one colour big + small', () => {
  let snd = 0, all = 0;
  for (const age of AGES) for (let s = 0; s < 200; s++) for (let ri = 0; ri < 4; ri++) {
    const r = C.makeRound('animals', { age, lang: 'en', rng: new CK.RNG(s * 5 + ri), roundIndex: ri });
    for (const a of r.asks) {
      if (a.promptKey === 'p.sound') { assert.ok(age >= 4 && ri >= 2); assert.ok(!['bunny', 'bear'].includes(a.params.animal)); assert.ok(CK.ANIMAL_SOUND[a.params.animal]); }
      if (age >= 4 && ri >= 2) { all++; if (a.promptKey === 'p.sound') snd++; }
      for (const b of a.choices) assert.ok(CK.ANIMALS.includes(b.animal) && b.sprite === 'animal_' + b.animal);
    }
  }
  assert.ok(snd / all > 0.4 && snd / all < 0.6, 'about half by sound ' + (snd / all).toFixed(2));
  for (let s = 0; s < 300; s++) {
    const r = C.makeRound('size', { age: 3, lang: 'en', rng: new CK.RNG(s), roundIndex: 3 });
    let run = 1;
    r.asks.forEach((a, q) => {
      assert.strictEqual(a.choices[0].color, a.choices[1].color);
      assert.deepStrictEqual(a.choices.map(b => b.size).sort(), ['big', 'small']);
      assert.strictEqual(a.choices[a.answer].size, a.params.size);
      if (q) { run = a.params.size === r.asks[q - 1].params.size ? run + 1 : 1; assert.ok(run <= 2, 'never 3× the same size'); }
    });
  }
});

test('content: initial (animal-cookie words, vi skips "thỏ"), letters / lower (no I/l), add / sub / oddeven arithmetic', () => {
  for (const lang of LANGS) for (let s = 0; s < 200; s++) {
    const r = C.makeRound('initial', { age: 6, lang, rng: new CK.RNG(s), roundIndex: 2 });
    for (const a of r.asks) {
      const b = a.choices[a.answer]; assert.strictEqual(b.initial, a.params.letter); assert.ok(b.word);
      a.choices.forEach((c, j) => { if (j !== a.answer) assert.ok(!c.initial || c.initial !== a.params.letter); });
      if (lang === 'vi') assert.notStrictEqual(b.animal, 'bunny');
    }
    r.asks.forEach((a, q) => { if (q) assert.notStrictEqual(a.params.letter, r.asks[q - 1].params.letter, 'same letter twice in a row'); });
    const lo = C.makeRound('lower', { age: 6, lang, rng: new CK.RNG(s), roundIndex: 1 });
    for (const a of lo.asks) assert.ok(!'IL'.includes(a.params.letter) && a.choices[a.answer].text === a.params.letter.toLowerCase());
    for (const t of ['add', 'sub', 'oddeven']) {
      const m = C.makeRound(t, { age: 7, lang, rng: new CK.RNG(s), roundIndex: 3 });
      for (const a of m.asks) {
        const v = a.choices[a.answer].n;
        if (a.promptKey === 'p.add') assert.strictEqual(v, a.params.a + a.params.b);
        else if (a.promptKey === 'p.sub') assert.strictEqual(v, a.params.a - a.params.b);
        else { assert.strictEqual(a.promptKey, 'p.oddeven'); assert.strictEqual(v % 2 ? 'odd' : 'even', a.params.parity); }
      }
    }
  }
});

test('content: deterministic from the rng; Talk time valid for every age × topic (picture choices ≤ 5)', () => {
  const a = C.makeRound('shapes', { age: 4, lang: 'en', rng: new CK.RNG(42), roundIndex: 2 });
  const b = C.makeRound('shapes', { age: 4, lang: 'en', rng: new CK.RNG(42), roundIndex: 2 });
  assert.deepStrictEqual(a, b);
  const PIC = ['color', 'shape', 'number', 'dots', 'animal', 'letter', 'size'];
  for (const age of AGES) for (const topic of TOPICS) for (const lang of LANGS) for (let s = 0; s < 40; s++) {
    const t = C.makeTalk(topic, { age, lang, rng: new CK.RNG(s) });
    assert.strictEqual(t.promptKey, 'talk.' + topic);
    assert.ok(t.choices.length >= 2 && t.choices.length <= 3);
    assert.strictEqual(t.choices.filter(c => c.id === t.answerId).length, 1);
    assert.strictEqual(new Set(t.choices.map(c => c.value)).size, t.choices.length);
    if (age <= 5 && CK.AGE_POOLS[age].includes(topic)) assert.ok(t.choices.every(c => PIC.includes(c.kind)), topic + ' picture choices');
    if (t.show) assert.ok(t.show.kind && t.show.nameKind);
    if (topic === 'colors' && age < 5) { const an = t.choices.find(c => c.id === t.answerId).value; assert.ok(!C.clashAns(an, t.choices.map(c => c.value))); }
  }
});

test('content: topic rotation between sessions (newSession lastTopics)', () => {
  for (const age of AGES) {
    const w = mkWorld({ age, seed: 9 }), first = w.levels.slice();
    assert.strictEqual(first.length, 4); assert.strictEqual(new Set(first).size, 4);
    w.lastTopics = first; w.newSession();
    assert.notStrictEqual(w.levels[0], first[0], 'chapter 1 changes');
    assert.ok(w.levels.some(t => !first.includes(t)), 'a new topic comes in');
  }
});

test('content: animal cookies + sounds (DESIGN §5.1); every animal has a word in en, all but bunny in vi', () => {
  assert.deepStrictEqual(CK.ANIMALS, ['bunny', 'bear', 'cat', 'dog', 'duck', 'pig', 'cow', 'sheep']);
  assert.deepStrictEqual(CK.ANIMAL_SOUND, { cat: 'meow', dog: 'woof', duck: 'quack', pig: 'oink', cow: 'moo', sheep: 'baa', bunny: null, bear: null });
  assert.deepStrictEqual(C.SOUND_ANIMALS, ['cat', 'dog', 'duck', 'pig', 'cow', 'sheep']);
  assert.deepStrictEqual(CK.WORDS.en.map(w => w.animal), CK.ANIMALS);
  assert.deepStrictEqual(CK.WORDS.vi.map(w => w.animal), CK.ANIMALS.filter(a => a !== 'bunny'));
  assert.strictEqual(C.SMALL_SCALE, 0.72);
});

// ======================================================================== layout
const gbox = L => ({ l: L.tower.x - 90, t: L.goalY - L.goalH, r: L.tower.x + 90, b: L.goalY });   // cherry + the cloud's top (180 wide)

test('layout: DESIGN §2 numbers (S 124/110, LW/LH, stand, drop zone, Koko, bubble, goal)', () => {
  let L = CK.World.computeLayout(1280, 720, null, {}, 4);
  assert.strictEqual(L.groundY, 692); assert.strictEqual(L.S, 124); assert.strictEqual(L.LW, 161); assert.strictEqual(L.LH, 97);
  assert.strictEqual(L.tower.x, 512); assert.strictEqual(L.tower.baseTop, 596); assert.strictEqual(L.tower.baseW, 221);
  assert.deepStrictEqual(L.drop, { x0: 512 - 140.5, x1: 512 + 140.5, y1: 606 });
  assert.deepStrictEqual(L.koko, { x: 120, y: 688, h: 330 });
  assert.deepStrictEqual(L.bubble, { x: 24, y: 18, w: 512 - 140.5 - 20 - 24, h: 122 });
  assert.strictEqual(L.goalY, 596 - 4 * 97 - 8); assert.deepStrictEqual(L.goal, { x: 512, y: L.goalY, cloudY: L.goalY - 18 });
  assert.strictEqual(L.goalH, 110);
  L = CK.World.computeLayout(960, 720, null, {}, 4); assert.strictEqual(L.koko.h, 300); assert.strictEqual(L.tower.x, 400);
  L = CK.World.computeLayout(1280, 720, null, {}, 5); assert.strictEqual(L.S, 110); assert.strictEqual(L.LW, 143); assert.strictEqual(L.LH, 86);
  assert.ok(5 * L.LH <= L.tower.baseTop - 150);
  L = CK.World.computeLayout(720, 1556, { top: 108, right: 0, bottom: 62, left: 0 }, {}, 4);
  assert.ok(L.portrait && L.tall); assert.strictEqual(L.groundY, 1556 - 62 - 40); assert.strictEqual(L.tower.x, 0.58 * 720);
  assert.strictEqual(L.tower.baseTop, L.groundY - L.LH - 150); assert.ok(4 * L.LH <= L.tower.baseTop - (108 + 364));
  assert.deepStrictEqual(L.koko, { x: 110, y: L.tower.baseTop + 70, h: 300 });
  assert.deepStrictEqual(L.bubble, { x: 24, y: 218, w: 720 - 48, h: 124 });
  L = CK.World.computeLayout(720, 1036, { top: 21, right: 0, bottom: 18, left: 0 }, {}, 4);   // iPad 820×1180
  assert.ok(L.portrait && !L.tall); assert.deepStrictEqual(L.bubble, { x: 24, y: 21 + 18, w: 720 - 160 - 14 - 24, h: 124 });
  L = CK.World.computeLayout(1561, 720, { top: 0, right: 108, bottom: 38, left: 108 }, {}, 5);   // iPhone landscape
  assert.strictEqual(L.S, 110, 'phone landscape S ' + L.S); assert.strictEqual(L.tower.baseTop, L.groundY - 96);
  for (const age of AGES) for (const v of VIEWPORTS) { const Q = CK.World.computeLayout(v.W, v.H, v.ins, {}, age); assert.ok(Q.LW === Math.round(1.3 * Q.S) && Q.LH === Math.round(0.78 * Q.S)); }
  const lg = CK.World.logicalSize(390, 844); assert.deepStrictEqual(lg, { W: 720, H: Math.round(720 / (390 / 844)) });
});

test('layout: every viewport (iPhone 393×852 / iPad 820×1180 both ways, insets) × age × 2–4 choices — slots clear of drop zone, HUD, bubble, Koko; the tallest cake + cherry fit below the bubble / HUD', () => {
  for (const v of VIEWPORTS) for (const age of AGES) {
    const w = mkWorld({ age, vp: v }), L = w.layout, ins = L.ins, LW = L.LW, LH = L.LH;
    assert.ok(L.S >= 92 && L.S <= 124, v.name + ' S ' + L.S);
    assert.ok(L.S === (age <= 4 ? 124 : 110) || L.S >= 92, 'S rule');
    const hud = { l: L.W - ins.right - 160, t: -1e9, r: 1e9, b: ins.top + 96 };
    const drop = { l: L.drop.x0 - 44, t: -1e9, r: L.drop.x1 + 44, b: L.drop.y1 + 44 };
    const kb = w._kokoBox(), koko = { l: kb.l, t: kb.t, r: kb.r, b: kb.b };
    for (const k of age === 3 ? [2] : age <= 5 ? [2, 3] : [2, 3, 4]) {   // the most choices an age gets (content: 2 / 3 / 4)
      const sl = CK.World.slotsFor(L, w.cfg, k);
      assert.strictEqual(sl.length, k, v.name + ' ' + k + ' slots');
      sl.forEach((s, i) => {
        const b = { l: s.x - LW / 2, t: s.y - LH / 2, r: s.x + LW / 2, b: s.y + LH / 2 }, tag = v.name + ' age ' + age + ' k' + k + ' slot ' + i;
        assert.ok(b.l >= ins.left && b.r <= L.W - ins.right && b.t >= ins.top && b.b <= L.groundY + 1, tag + ' on screen');
        assert.ok(!ovl(b, drop), tag + ' inside the drop zone');
        assert.ok(!ovl(b, hud), tag + ' under the HUD');
        assert.ok(!ovl(b, kbox(L.bubble)), tag + ' under the bubble');
        if (!L.portrait) assert.ok(!ovl(b, koko), tag + ' over Koko');
        sl.forEach((o, j) => { if (j > i) assert.ok(Math.abs(o.x - s.x) >= LW + 20 || Math.abs(o.y - s.y) >= LH + 20, tag + ' overlaps slot ' + j); });
      });
    }
    // the tallest cake + the cherry on its cloud fit on screen, never under the bubble or the HUD
    const top = L.tower.baseTop - L.maxN * LH;
    assert.ok(top >= ins.top + 110, v.name + ' age ' + age + ' cake top ' + top);
    const cake = { l: L.tower.x - LW / 2, t: top, r: L.tower.x + LW / 2, b: L.tower.baseTop };
    assert.ok(!ovl(cake, kbox(L.bubble)) && !ovl(cake, hud), v.name + ' age ' + age + ' bubble / HUD over the cake');
    assert.ok(L.goalY - L.goalH >= ins.top - 2, v.name + ' cherry fits (' + (L.goalY - L.goalH) + ')');
    assert.ok(!ovl(gbox(L), kbox(L.bubble)), v.name + ' age ' + age + ' bubble covers the cherry');
    assert.ok(!ovl(gbox(L), hud), v.name + ' HUD covers the cherry');
    if (!L.portrait) assert.ok(L.drop.x0 > kb.r + 20, v.name + ' Koko left of the drop zone');
    assert.ok(L.drop.x1 < L.W - ins.right && L.drop.x0 > ins.left, 'drop zone on screen');
    assert.ok(L.tower.baseW === LW + 60);
  }
});

test('layout: pieces in a round sit in their slots; the centre of every hit box picks its piece (nearest wins); Koko hit picks Koko', () => {
  for (const v of VIEWPORTS) for (const age of [3, 4, 6]) {
    const w = mkWorld({ age, vp: v }); roundOf(w, age >= 6 ? 'add' : 'colors', 3);
    for (const p of w.pieces) {
      const h = w.pieceHit(p.id); assert.strictEqual(w._hit(h.x, h.y), p, v.name + ' hit');
      assert.strictEqual(h.w, w.layout.LW + 32); assert.strictEqual(h.h, 2 * (0.6 * w.layout.S + 14));
      assert.ok(Math.abs(p.x - p.homeX) < 1e-6 && Math.abs(p.y - p.homeY) < 4);
      assert.strictEqual(w._hit(p.x + w.layout.LW / 2 + 15, p.y), p, 'wide hit box');
    }
    const kh = w.kokoHit(); assert.strictEqual(w._hit(kh.x, kh.y), 'koko');
    assert.strictEqual(w.lulu, w.koko, 'alias');
  }
});

// ======================================================================== world
test('world: full scripted session per age through the pointer — taps, misses, wrong bounces, right drags; every event in order', () => {
  for (const age of AGES) for (const vp of [VIEWPORTS[8], VIEWPORTS[3]]) {
    const w = mkWorld({ age, vp, seed: 11 + age, surprise: true });
    const all = [], cnt = {};
    let guard = 0, askN = 0;
    const drainAll = () => { for (const e of w.drainEvents()) { all.push(e); cnt[e.type] = (cnt[e.type] || 0) + 1; } };
    while (w.state !== 'sessionDone' && guard++ < 400000) {
      if (w.state === 'talk' && !w.talkAnswered && w.stateTime > 1) w.talkAnswer(w.talk.answerId);
      if (w.state === 'round' && w.phase === 'ask' && w.phaseTime > 0.3) {
        askN++;
        const R = rightP(w), Wp = wrongP(w); void R;
        if (askN % 3 === 1 && Wp) {
          assert.strictEqual(w.pointerDown(Wp.x, Wp.y), Wp.id); w.update(0.1); assert.strictEqual(w.pointerUp(Wp.x, Wp.y), 'tap');
          drainAll(); assert.strictEqual(all[all.length - 1].type, 'tapPiece');
          until(w, () => Wp.state === 'rest');
        }
        if (askN % 4 === 2) {
          const m0 = w.misses, Q = rightP(w);
          assert.strictEqual(drag(w, Q, w.layout.koko.x + 40, w.layout.groundY - 300), 'miss');
          drainAll(); assert.ok(all.some(e => e.type === 'miss' && e.pieceId === Q.id)); assert.strictEqual(w.misses, m0);
          until(w, () => Q.state === 'rest');
        }
        if (askN % 5 === 3 && wrongP(w)) {
          const X = wrongP(w);
          assert.strictEqual(dragToTower(w, X), 'drop');
          until(w, () => X.state === 'bounce' || X.state === 'home');
          drainAll(); assert.ok(all.some(e => e.type === 'wrong' && e.pieceId === X.id));
          until(w, () => w.phase === 'ask' && X.state === 'rest');
          w.update(CFG.wrongLock);
        }
        if (askN % 7 === 5 && wrongP(w)) {
          for (let k = 0; k < 2; k++) { const X = wrongP(w); if (!X) break; dragToTower(w, X); until(w, () => w.phase === 'ask' && X.state === 'rest'); w.update(CFG.wrongLock); }
          drainAll(); assert.ok(w.hintHand || all.some(e => e.type === 'hint'));
        }
        const Rp = rightP(w), n0 = w._liveCount();
        assert.strictEqual(dragToTower(w, Rp, { ox: (askN % 3 - 1) * 15 }), 'drop');
        until(w, () => w._liveCount() === n0 + 1 || w.phase === 'done' || w.state !== 'round');
        drainAll();
        const st = all.filter(e => e.type === 'stack').pop();
        assert.strictEqual(st.n, n0 + 1);
        continue;
      }
      w.update(1 / 30); drainAll();
    }
    assert.strictEqual(w.state, 'sessionDone', 'age ' + age + ' session ends');
    const seq = all.map(e => e.type), r0 = seq.indexOf('round');
    const want = ['round', 'deal', 'ask', 'grab', 'drop', 'land', 'stack', 'towerDone', 'cherry', 'cherryOn', 'count', 'blow', 'candlesOut', 'sprinkles', 'roundDone', 'clearBlock'];
    let k = r0; for (const t of want) { k = seq.indexOf(t, k); assert.ok(k >= 0, 'event ' + t + ' in order'); }
    for (const t of ['tapPiece', 'miss', 'wrong', 'hint', 'talk', 'talkResult', 'levelDone', 'sessionDone', 'bee'].concat(age >= 4 ? ['gust'] : [])) assert.ok(cnt[t] > 0, 'age ' + age + ' saw ' + t);
    for (const t of ['cherry', 'cherryOn', 'blow', 'candlesOut', 'sprinkles']) assert.strictEqual(cnt[t], cnt.towerDone, t + ' once per cake');
    assert.strictEqual(cnt.towerDone, cnt.roundDone);
    assert.strictEqual(cnt.count, all.filter(e => e.type === 'towerDone').reduce((s, e) => s + e.n, 0));
    for (const t of ['monkey', 'bananas', 'bloom', 'butterfly', 'pokeLulu']) assert.ok(!cnt[t], 'no old event ' + t);
  }
});

test('world: bot sessions at every age (breeze on in breezy chapters) — sessionDone, right stacks only, no stuck ask, ≤ 4 pieces, ≤ 5 layers, finite physics', () => {
  for (const age of AGES) for (const v of [VIEWPORTS[4], VIEWPORTS[2]]) for (const skill of [0.5, 1]) {
    const w = mkWorld({ age, vp: v, seed: 3 + age, surprise: true }), b = new CK.Bot(w, { skill, seed: 9 });
    let t = 0, ask = null, askT = 0, maxAsk = 0;
    while (w.state !== 'sessionDone' && t < 1500) {
      w.setBreeze(w.weather === 1 ? 0.85 : 0.1);
      b.step(1 / 30); w.update(1 / 30); t += 1 / 30;
      assert.ok(w.pieces.length <= 4 + 4, 'pieces ' + w.pieces.length);
      assert.ok(w.tower.blocks.length <= 5);
      for (const p of w.pieces) for (const k of ['x', 'y', 'rot', 'sx', 'sy', 'scale', 'alpha']) assert.ok(isFinite(p[k]), 'piece.' + k);
      assert.ok(isFinite(w.tower.theta) && Math.abs(w.tower.theta) <= CFG.swayMax + 1e-9, 'theta ' + w.tower.theta);
      const cp = w.cherryPose(); if (cp) assert.ok(isFinite(cp.x + cp.y + cp.rot + cp.sy), 'cherry');
      for (let j = 0; j < w.candles.length; j++) { const q = w.candlePose(j); if (q) assert.ok(isFinite(q.x + q.y + q.s + q.lit + q.out)); }
      for (const e of w.drainEvents()) {
        if (e.type === 'ask') { ask = e; askT = w.time; }
        if (e.type === 'stack') { assert.strictEqual(e.ask, ask.ask); maxAsk = Math.max(maxAsk, w.time - askT); }
        if (e.type === 'land') assert.strictEqual(e.pieceId, ask.answerId, 'only the right layer lands');
        if (e.type === 'wrong') assert.notStrictEqual(e.pieceId, ask.answerId);
      }
    }
    assert.strictEqual(w.state, 'sessionDone', 'age ' + age + ' ' + v.name + ' skill ' + skill);
    assert.ok(maxAsk < 60, 'stuck ask ' + maxAsk);
  }
});

test('world: age 4 bot 0.8 — sessions ≤ 8 min, chapters 60–100 s on average', () => {
  const ch = [];
  for (let s = 0; s < 8; s++) {
    const w = mkWorld({ age: 4, seed: 100 + s, vp: VIEWPORTS[s % VIEWPORTS.length], surprise: true }), b = new CK.Bot(w, { skill: 0.8, seed: s });
    let t0 = 0;
    while (w.state !== 'sessionDone' && w.time < 1500) {
      b.step(1 / 30); w.update(1 / 30);
      for (const e of w.drainEvents()) { if (e.type === 'level') t0 = w.time; if (e.type === 'levelDone') ch.push(w.time - t0); }
    }
    assert.ok(w.time <= 480, 'session ' + w.time.toFixed(0) + ' s');
  }
  const m = ch.reduce((a, b) => a + b, 0) / ch.length;
  assert.ok(m >= 60 && m <= 100, 'chapter mean ' + m.toFixed(1));
});

test('world: deal — the cloud + cherry float in from the top (soft overshoot), layers drop staggered 0.08 s with squash + one small bounce; ask after all rest', () => {
  const w = mkWorld({ age: 4 });
  w.levels = ['colors', 'colors', 'colors', 'colors']; w.startLevel(0); w.round = 2; w._beginRound();
  const e0 = evs(w); assert.ok(e0.some(e => e.type === 'round' && e.n === 3));
  const G = w.goal; assert.strictEqual(G.state, 'float'); assert.ok(G.cloudY < 0 && G.cherryY < 0, 'starts above the screen');
  let maxDown = -1e9;
  until(w, () => w.pieces.length > 0);
  const e1 = evs(w).find(e => e.type === 'deal'); assert.ok(e1 && e1.pieces.length === 3);
  assert.ok(w.pieces.every(p => p.y < 0 && p.state === 'in'));
  assert.strictEqual(w.pointerDown(w.pieces[0].homeX, w.pieces[0].homeY), null, 'no grab during the deal');
  const landT = [], minSy = {}, bounced = {};
  const prevVy = {};
  until(w, () => {
    maxDown = Math.max(maxDown, G.dy);
    for (const p of w.pieces) {
      minSy[p.id] = Math.min(minSy[p.id] || 1, p.sy);
      if (prevVy[p.id] > 0 && p.vy < 0) bounced[p.id] = true;
      prevVy[p.id] = p.vy;
      if (p.state === 'rest' && landT[p.slot] === undefined) landT[p.slot] = w.time;
    }
    return w.phase === 'ask';
  });
  assert.ok(Math.abs(landT[1] - landT[0] - 0.08) < 0.03 && Math.abs(landT[2] - landT[1] - 0.08) < 0.03, 'stagger ' + landT);
  for (const id in minSy) { assert.ok(minSy[id] < 0.9, 'landing squash'); assert.ok(bounced[id], 'a small bounce'); }
  const a = evs(w).find(e => e.type === 'ask'); assert.ok(a && a.answerId === w.answerId());
  run(w, 1.5, () => { maxDown = Math.max(maxDown, G.dy); });
  assert.ok(maxDown > 2 && maxDown < 40, 'soft overshoot ' + maxDown.toFixed(1));
  assert.ok(Math.abs(G.dy) < 2, 'the cloud settled');
  // bob ± 4 px at 1.1 Hz
  let lo = 1e9, hi = -1e9; run(w, 1, () => { lo = Math.min(lo, G.cloudY); hi = Math.max(hi, G.cloudY); });
  assert.ok(hi - lo > 6 && hi - lo < 9.5, 'bob ' + (hi - lo).toFixed(1));
  assert.ok(Math.abs(G.cherryY - G.cloudY - CFG.cloudLift) < 1e-6, 'the cherry sits on the cloud');
  const cp = w.cloudPose(1); assert.ok(cp && cp.alpha === 1 && cp.x === w.layout.tower.x);
});

test('world: drag — spring-follow (ω 30, ζ 0.8) at the grab offset (± 0.35·LW / LH), lift 1.08, pendulum tilt ≤ 0.35 rad; one active pointer; grab event once', () => {
  const w = mkWorld({ age: 4 }); roundOf(w, 'colors', 2);
  const p = rightP(w), L = w.layout;
  assert.strictEqual(w.pointerDown(p.x + 0.45 * L.LW, p.y - 0.45 * L.LH), p.id);
  assert.strictEqual(w._press.ox, 0.35 * L.LW, 'grab offset clamped to 0.35·LW'); assert.strictEqual(w._press.oy, -0.35 * L.LH);
  let maxRot = 0;
  for (let i = 0; i < 30; i++) { w.pointerMove(p.homeX + 0.35 * L.LW - i * 12, p.homeY - 0.35 * L.LH - i * 6); w.update(1 / 60); maxRot = Math.max(maxRot, Math.abs(p.rot)); }
  assert.ok(maxRot > 0.03 && maxRot <= 0.35, 'tilt ' + maxRot);
  const g = evs(w).filter(e => e.type === 'grab'); assert.strictEqual(g.length, 1); assert.strictEqual(g[0].pieceId, p.id);
  const fx = w._press.fx - w._press.ox, fy = w._press.fy - w._press.oy;
  w.update(0.4);
  assert.ok(Math.abs(p.x - fx) < 1 && Math.abs(p.y - fy) < 1, 'follows the finger');
  assert.ok(Math.abs(p.scale - CFG.dragLift) < 0.01, 'lift');
  w.update(0.8);
  assert.ok(Math.abs(p.rot) < 0.02, 'the tilt settles (' + p.rot.toFixed(3) + ')');
  assert.strictEqual(p.z, 4); assert.strictEqual(w.drawOrder().pop(), p, 'the dragged layer is drawn last');
  w.cancelDrag(); assert.strictEqual(p.state, 'home'); until(w, () => p.state === 'rest');
  assert.ok(Math.abs(p.x - p.homeX) < 1e-6);
  const q = wrongP(w); w.pointerDown(p.x, p.y); w.pointerMove(p.x, p.y - 80); w.update(0.2);
  assert.strictEqual(w.pointerDown(q.x, q.y), q.id, 'the new finger takes over');
  assert.strictEqual(p.state, 'home'); assert.strictEqual(w._press.id, q.id); w.cancelDrag();
});

test('world: a still drag (< 10 px for 6 s) — the idle clock keeps running, then the layer flies home with stillDrag', () => {
  const w = mkWorld({ age: 4 }); roundOf(w, 'colors', 2); evs(w);
  const p = rightP(w); w.pointerDown(p.x, p.y); w.pointerMove(p.x, p.y - 60); run(w, 0.3);
  run(w, 5.5, i => { if (i % 30 === 0) w.pointerMove(p.x + (i % 60 ? 3 : -3), p.y); });
  assert.strictEqual(p.state, 'drag', 'not yet'); assert.ok(w._idleT > 4, 'the idle clock runs during a still drag');
  run(w, 1.0);
  const e = evs(w).find(x => x.type === 'stillDrag'); assert.ok(e && e.pieceId === p.id, 'stillDrag');
  assert.ok(p.state === 'home' || p.state === 'rest'); assert.strictEqual(w._press, null);
  until(w, () => p.state === 'rest');
  w.pointerDown(p.x, p.y);
  run(w, 8, i => { if (i % 12 === 0) w.pointerMove(p.homeX + 40 * Math.sin(i / 20), p.homeY - 100 - 40 * Math.cos(i / 20)); });
  assert.strictEqual(p.state, 'drag'); assert.ok(!evs(w).some(x => x.type === 'stillDrag'));
  w.cancelDrag();
  until(w, () => p.state === 'rest');
  const tx = p.x, ty = p.y; w.tapMoveMin = 40; w.pointerDown(tx, ty); w.pointerMove(tx + 30, ty); w.update(0.1); assert.strictEqual(w.pointerUp(tx + 30, ty), 'tap', '30 px is a tap with tapMoveMin 40');
  until(w, () => p.state === 'rest'); w.tapMoveMin = 0; w.pointerDown(tx, ty); w.pointerMove(tx + 30, ty); w.update(0.1); assert.strictEqual(w.pointerUp(tx + 30, ty), 'miss', '…and a drag with the default 24');
});

test('world: tap vs drag — < 24 px and < 0.35 s is a tap (tapPiece, hop in place); longer or farther is a drag (miss / drop)', () => {
  const w = mkWorld({ age: 4 }); roundOf(w, 'colors', 2);
  const p = wrongP(w), x0 = p.x, y0 = p.y;
  w.pointerDown(x0, y0); w.pointerMove(x0 + 20, y0); w.update(0.2);
  assert.strictEqual(w.pointerUp(x0 + 20, y0), 'tap');
  let e = evs(w); assert.ok(e.some(x => x.type === 'tapPiece' && x.pieceId === p.id && x.nameKind === 'color'));
  assert.ok(!e.some(x => x.type === 'grab'), 'a tap is not a grab');
  let maxUp = 0; until(w, () => { maxUp = Math.max(maxUp, p.homeY - p.y); return p.state === 'rest'; });
  assert.ok(maxUp > 15 && maxUp < 40, 'hop ' + maxUp);
  w.pointerDown(p.x, p.y); w.update(0.4); assert.strictEqual(w.pointerUp(p.x, p.y), 'miss', 'a long press is not a tap');
  e = evs(w); assert.ok(e.some(x => x.type === 'grab') && e.some(x => x.type === 'miss'));
  until(w, () => p.state === 'rest');
  const x1 = p.x, y1 = p.y; w.pointerDown(x1, y1); w.pointerMove(x1, y1 - 30); w.update(0.1); assert.strictEqual(w.pointerUp(x1, y1 - 30), 'miss', 'moved 30 px');
  assert.strictEqual(w.misses, 0, 'misses are not mistakes');
});

test('world: drop → gravity fall onto the top within ± 0.18·LW, jelly squash 0.75 → stretch → settle, the sponge below compresses 0.08, the cake sways (≤ 0.12 rad) and settles', () => {
  for (const off of [-80, 0, 45, 200]) {
    const w = mkWorld({ age: 5, seed: 4 }); roundOf(w, 'shapes', 3);
    for (let k = 0; k < 4; k++) {
      const p = rightP(w), LW = w.layout.LW, top = w.towerTop();
      const d = w.dropPoint();
      const r = drag(w, p, Math.min(w.layout.drop.x1 - 2, Math.max(w.layout.drop.x0 + 2, d.x + off)), d.y - 120);
      assert.strictEqual(r, 'drop');
      const y0 = p.y, t0 = w.time; let landed = null;
      const n0 = w._liveCount(), below0 = n0 ? w.tower.blocks[n0 - 1].sy : 1;
      until(w, () => { const e = w.events.find(x => x.type === 'land'); if (e) landed = e; return !!landed; });
      const T = w.time - t0;
      const hgt = top.y - p.bh / 2 - y0;
      assert.ok(T < Math.sqrt(2 * Math.max(0, hgt) / CFG.g) + 0.12, 'falls by gravity (' + T.toFixed(2) + ' s)');
      const b = w.tower.blocks[w._liveCount() - 1], below = w.tower.blocks[w._liveCount() - 2];
      assert.ok(Math.abs(b.dx - (below ? below.dx : 0)) <= 0.18 * LW + 1e-6, 'within ±0.18·LW');
      assert.ok(Math.abs(b.sy - 0.75) < 0.02, 'squash 0.75 at landing (' + b.sy.toFixed(3) + ')');
      if (below) assert.ok(below._q > 0.03 && below._q <= 0.08 + 0.05 + 1e-9 || below0 < 1, 'the layer below compresses');
      assert.ok(landed.impact > 0 && landed.impact <= 1 && landed.n === w._liveCount());
      evs(w);
      let maxSy = 0, peak = 0;
      for (let i = 0; i < 300; i++) { w.update(H); maxSy = Math.max(maxSy, b.sy); peak = Math.max(peak, Math.abs(w.tower.theta)); }
      assert.ok(maxSy > 1.05 && maxSy < 1.2, 'jelly stretch ' + maxSy.toFixed(3));
      assert.ok(Math.abs(b.sy - 1) < 0.01, 'settled (' + b.sy.toFixed(3) + ')');
      assert.ok(peak > 0.005 && peak <= 0.12 + 1e-9, 'sway peak ' + peak);
      if (w.phase === 'done') break;
      untilPhase(w, 'ask');
    }
    run(w, 1.2);
    assert.ok(Math.abs(w.tower.theta) < 0.01, 'settles ' + w.tower.theta);
  }
});

test('world: blockPose — contiguous cake on the stand (LH per layer), layer i rotated θ·(i+1)/n, squash keeps the bottom on the layer below', () => {
  const w = mkWorld({ age: 4 }); roundOf(w, 'colors', 3);
  for (let k = 0; k < 3; k++) { dragToTower(w, rightP(w)); untilPhase(w, 'ask', 20000); }
  const T = w.tower, n = w._liveCount(), LH = w.layout.LH;
  assert.strictEqual(n, 3);
  T.theta = T._ptheta = 0; T.blocks.forEach(b => { b.dx = 0; b._q = 0; b.sy = 1; b.sx = 1; });
  let y = T.baseTop;
  for (let i = 0; i < n; i++) { const p = w.blockPose(i, 1); assert.ok(Math.abs(p.x - T.x) < 1e-9 && Math.abs(p.y - (y - LH / 2)) < 1e-9 && p.rot === 0); y -= LH; }
  assert.ok(Math.abs(w.towerTop().y - y) < 1e-9);
  assert.ok(Math.abs(w.dropPoint().y - (y - 1.5 * LH)) < 1e-9, 'dropPoint 1.5·LH above the top');
  T.theta = T._ptheta = 0.1;
  for (let i = 0; i < n; i++) assert.ok(Math.abs(w.blockPose(i, 1).rot - 0.1 * (i + 1) / n) < 1e-12);
  assert.ok(w.towerTop().x > T.x, 'positive θ leans the top to the right');
  T.theta = T._ptheta = 0; T.blocks[0].sy = 0.8;
  assert.ok(Math.abs(w.blockPose(0, 1).y - (T.baseTop - 0.4 * LH)) < 1e-9, 'squashed about its bottom');
  assert.ok(Math.abs(w.blockPose(1, 1).y - (T.baseTop - 0.8 * LH - 0.5 * LH)) < 1e-9, 'the next one sits on it');
  assert.strictEqual(T.blocks[0].bw, w.layout.LW); assert.strictEqual(T.blocks[0].bh, LH);
});

test('world: small layers are 0.72 × LW × LH, resting bottom-aligned in their slot', () => {
  const w = mkWorld({ age: 3 }); roundOf(w, 'size', 2);
  const L = w.layout, sm = w.pieces.find(p => p.block.size === 'small'), bg = w.pieces.find(p => p.block.size === 'big');
  assert.ok(Math.abs(sm.bw - 0.72 * L.LW) < 1e-9 && Math.abs(sm.bh - 0.72 * L.LH) < 1e-9 && bg.bw === L.LW && bg.bh === L.LH);
  assert.ok(Math.abs((sm.homeY + sm.bh / 2) - (bg.homeY + bg.bh / 2)) < 1e-9, 'bottoms aligned');
});

test('world: wrong → bounce off (restitution 0.45, kick towards home, spin), arc home; lock 0.7 s (locked); 2nd miss → hint + ghost hand', () => {
  const w = mkWorld({ age: 4 }); roundOf(w, 'colors', 2);
  const X = wrongP(w), R = rightP(w);
  assert.strictEqual(dragToTower(w, X), 'drop');
  let vIn = 0, vOut = null;
  until(w, () => { if (X.state === 'fall') vIn = X.vy; if (X.state === 'bounce' && vOut === null) vOut = X.vy; return X.state === 'bounce'; });
  assert.ok(Math.abs(vOut / (vIn + CFG.g * H) + 0.45) < 0.06, 'restitution ' + (vOut / vIn).toFixed(2));
  assert.ok(Math.sign(X.vx) === Math.sign(X.homeX - w.tower.x) && Math.abs(X.rv) > 0, 'kick + spin');
  const e = evs(w).find(x => x.type === 'wrong');
  assert.ok(e && e.pieceId === X.id && e.want.kind === 'color' && e.want.value === R.block.color && e.streak === 1 && e.nameValue === X.block.color);
  assert.strictEqual(w.phase, 'bounce');
  assert.strictEqual(w.pointerDown(R.x, R.y), 'locked');
  assert.ok(evs(w).some(x => x.type === 'locked'));
  until(w, () => X.state === 'rest');
  assert.ok(Math.abs(X.x - X.homeX) < 1e-6 && Math.abs(X.rot) < 1e-6, 'home, upright');
  assert.strictEqual(w.phase, 'ask');
  run(w, CFG.wrongLock);
  assert.strictEqual(w.misses, 1); assert.strictEqual(w.hintHand, null);
  const X2 = wrongP(w); dragToTower(w, X2); until(w, () => X2.state === 'rest'); run(w, 0.1);
  const h = evs(w).find(x => x.type === 'hint'); assert.ok(h && h.pieceId === R.id, '2nd miss → hint');
  assert.ok(w.hintHand && w.hintHand.pieceId === R.id && isFinite(w.hintHand.fromX + w.hintHand.toY + w.hintHand.x + w.hintHand.y));
  assert.ok(Math.abs(w.hintHand.toY - w.dropPoint().y) < 1e-6 && w.hintHand.fromX === R.homeX);
  run(w, 0.5); assert.ok(R.glow > 0.8, 'the right layer glows');
  const g = R; w.pointerDown(g.x, g.y); w.pointerMove(g.x, g.y - 40); assert.strictEqual(w.hintHand, null); w.cancelDrag();
});

test('world: stars per cake 3 / 2 / 1 for 0 / 1 / ≥ 2 wrong drops; cakes of ≥ 4 layers forgive one slip', () => {
  for (const [ri, wrongN, want] of [[1, 0, 3], [1, 1, 2], [1, 2, 1], [1, 3, 1], [3, 1, 3], [3, 2, 2], [3, 3, 1]]) {
    const w = mkWorld({ age: 4 }); roundOf(w, 'colors', ri);
    assert.strictEqual(w.cur.n, ri === 3 ? 4 : 3);
    let left = wrongN;
    while (w.phase !== 'done') {
      untilPhase(w, 'ask');
      if (left > 0 && wrongP(w)) { const X = wrongP(w); dragToTower(w, X); until(w, () => X.state === 'rest'); run(w, CFG.wrongLock + 0.05); left--; continue; }
      dragToTower(w, rightP(w)); until(w, () => w.phase === 'deal' || w.phase === 'done');
    }
    until(w, () => w.events.some(e => e.type === 'roundDone'));
    const e = w.drainEvents().find(x => x.type === 'roundDone');
    assert.strictEqual(e.stars, want, 'cake of ' + w.cur.n + ', ' + wrongN + ' wrong');
    assert.strictEqual(e.misses, wrongN);
  }
});

test('world: idle nudges at 12 s, then ×1.5 up to 20 s; every idle hints; a real grab resets; Koko taps do not (3rd glows); resetNudges', () => {
  const w = mkWorld({ age: 4 }); roundOf(w, 'colors', 2); evs(w);
  run(w, 12.05); let e = evs(w); assert.ok(e.some(x => x.type === 'idle' && x.n === 1)); assert.ok(e.some(x => x.type === 'hint' && x.idle), 'the 1st idle hints');
  run(w, 18); e = evs(w); assert.ok(e.some(x => x.type === 'idle' && x.n === 2)); assert.ok(e.some(x => x.type === 'hint' && x.idle));
  run(w, 20); assert.ok(evs(w).some(x => x.type === 'idle' && x.n === 3), 'gap capped at 20 s');
  w.resetNudges(); run(w, 11); assert.ok(!evs(w).some(x => x.type === 'idle'));
  const p = wrongP(w); w.pointerDown(p.x, p.y); w.pointerMove(p.x, p.y - 50); run(w, 0.2); w.cancelDrag();
  run(w, 11); assert.ok(!evs(w).some(x => x.type === 'idle'), 'the grab reset the clock');
  const w2 = mkWorld({ age: 4 }); roundOf(w2, 'colors', 2); evs(w2);
  const K = w2.kokoHit();
  for (let i = 0; i < 3; i++) { assert.strictEqual(w2.pointerDown(K.x, K.y), 'koko'); run(w2, 0.1); assert.strictEqual(w2.pointerUp(K.x, K.y), 'pokeKoko'); run(w2, 2); }
  e = evs(w2); assert.strictEqual(e.filter(x => x.type === 'pokeKoko').length, 3); assert.ok(e.some(x => x.type === 'hint'), '3rd Koko tap hints');
  assert.strictEqual(e.filter(x => x.type === 'hint').length, 1, 'only the 3rd');
  assert.ok(e.find(x => x.type === 'pokeKoko').promptKey === 'p.colors');
  run(w2, 6.5); assert.ok(evs(w2).some(x => x.type === 'idle'), 'Koko taps did not reset idle');
  w2.pointerDown(K.x, K.y); run(w2, 0.5); assert.strictEqual(w2.pointerUp(K.x, K.y), null);
});

test('world: a child who only taps — layer taps are soft taps (3rd hints); a tap on the hinted right layer hops it onto the cake; grace assist', () => {
  const w = mkWorld({ age: 3 }); roundOf(w, 'colors', 3); evs(w);
  const R = rightP(w), X = wrongP(w);
  const tap = p => { const x = p.x, y = p.y; w.pointerDown(x, y); w.update(0.05); const r = w.pointerUp(x, y); until(w, () => p.state === 'rest' || p.state === 'gone' || p.state === 'fall'); return r; };
  assert.strictEqual(tap(R), 'tap', 'no assist before a hint');
  assert.strictEqual(R.state, 'rest');
  tap(X); assert.ok(!evs(w).some(e => e.type === 'hint'));
  tap(X); const e = evs(w); assert.ok(e.some(x => x.type === 'hint' && x.pieceId === R.id), '3rd tap hints');
  const n0 = w._liveCount(), x0 = R.x, y0 = R.y;
  w.pointerDown(x0, y0); w.update(0.05); assert.strictEqual(w.pointerUp(x0, y0), 'drop');
  assert.ok(evs(w).some(x => x.type === 'drop' && x.assisted));
  let apex = 1e9; until(w, () => { apex = Math.min(apex, R.y); return w._liveCount() === n0 + 1; });
  assert.ok(apex < w.towerTop().y - 0.5 * w.layout.LH, 'hops up over the cake');
  assert.ok(evs(w).some(x => x.type === 'stack'));
  untilPhase(w, 'ask', 20000); evs(w);
  const D = w.layout.drop, gx = (D.x0 + D.x1) / 2, gy = w.towerTop().y - 40;
  for (let i = 0; i < 3; i++) { w.pointerDown(gx, gy); w.update(0.05); assert.strictEqual(w.pointerUp(gx, gy), null); w.update(0.3); }
  assert.ok(evs(w).some(x => x.type === 'hint'), 'the 3rd cake tap hints');
  const R2 = rightP(w), n2 = w._liveCount();
  w.pointerDown(gx, gy); w.update(0.05); assert.strictEqual(w.pointerUp(gx, gy), 'drop');
  assert.ok(evs(w).some(x => x.type === 'drop' && x.assisted && x.via === 'tower' && x.pieceId === R2.id));
  until(w, () => w._liveCount() === n2 + 1 || w.phase === 'done');
  while (w.phase !== 'done') { untilPhase(w, 'ask', 20000); dragToTower(w, rightP(w)); until(w, () => w.phase === 'deal' || w.phase === 'done'); }
  until(w, () => w.events.some(x => x.type === 'roundDone'), 40000);
  const rd = w.drainEvents().find(x => x.type === 'roundDone'); assert.ok(rd.assists >= 2 && rd.stars === 1, 'assisted stacks count like misses');
  const w3 = mkWorld({ age: 4 }); roundOf(w3, 'colors', 2); evs(w3);
  const Q3 = rightP(w3), L3 = w3.layout;
  assert.strictEqual(drag(w3, Q3, L3.koko.x + 40, L3.groundY - 300), 'miss', 'not hinted yet: a plain miss');
  until(w3, () => Q3.state === 'rest'); w3.hint(); evs(w3);
  const n3 = w3._liveCount();
  assert.strictEqual(drag(w3, Q3, L3.koko.x + 40, L3.groundY - 300), 'drop');
  assert.ok(evs(w3).some(x => x.type === 'drop' && x.assisted && x.via === 'grace'));
  until(w3, () => w3._liveCount() === n3 + 1);
  untilPhase(w3, 'ask', 20000); w3.hint(); const X3 = wrongP(w3); assert.strictEqual(drag(w3, X3, L3.koko.x + 40, L3.groundY - 300), 'miss');
  for (const mode of ['tapper', 'spammer']) {
    const v = mkWorld({ age: 4, seed: 8 }), r = new CK.RNG(3); let next = 0;
    while (v.state !== 'sessionDone' && v.time < 2400) {
      if (v.state === 'talk' && !v.talkAnswered && v.stateTime > 2) v.talkAnswer(v.talk.choices[0].id);
      if (v.time >= next) {
        next = v.time + (mode === 'spammer' ? 1 / 6 : r.float(0.3, 1.5));
        let x = r.float(0, v.layout.W), y = r.float(0, v.layout.H);
        if (mode === 'spammer' && v.pieces.length) { const q = r.pick(v.pieces); x = q.x; y = q.y; }
        v.pointerDown(x, y); v.pointerUp(x, y);
      }
      v.update(1 / 30); v.drainEvents();
    }
    assert.strictEqual(v.state, 'sessionDone', mode + ' finishes (' + v.time.toFixed(0) + ' s)');
  }
});

/** Builds a full cake of round `ri` and returns the log [type, time, event] from towerDone until the next round starts. */
function doneLog(w, ri, topic, onStep) {
  roundOf(w, topic || 'colors', ri);
  const n = w.cur.n;
  for (let k = 0; k < n; k++) { dragToTower(w, rightP(w)); if (k < n - 1) untilPhase(w, 'ask', 20000); }
  until(w, () => w.events.some(e => e.type === 'towerDone'));
  const pre = w.drainEvents(), log = [];
  pre.slice(pre.findIndex(e => e.type === 'towerDone')).forEach(e => log.push([e.type, w.time, e]));
  until(w, () => {
    for (const e of w.drainEvents()) log.push([e.type, w.time, e]);
    if (onStep) onStep(log);
    return log.some(x => x[0] === 'round') || w.state === 'talk';
  }, 60000);
  return log;
}

test('world: cake done — towerDone → cherry plops on (squash, the cloud puffs away) → count 1…n every 0.45 s with candle i popping + lighting → blow (Koko) → candlesOut → sprinkles → roundDone (≈ 3.6 s) → clear top first, cherry + candles go with the top layer', () => {
  const w = mkWorld({ age: 5 });
  let minCsy = 1, sawBlowMood = false, cloudGone = false, cherryOnTop = 1e9, litAtBlow = null, cherryFlyX = [];
  const st = { blowSeen: false };
  const log = doneLog(w, 2, 'colors', L => {
    const G = w.goal;
    if (G) minCsy = Math.min(minCsy, G.csy);
    if (w.koko.mood === 'blow') sawBlowMood = true;
    if (G && G.state === 'on' && G.cloudA === 0) cloudGone = true;
    if (G && G.state === 'on' && w.phase === 'done') { const c = w.cherryPose(1), t = w.towerTop(); cherryOnTop = Math.min(cherryOnTop, -Math.abs(c.y - t.y) - Math.abs(c.x - t.x)); }
    if (!st.blowSeen && L.some(x => x[0] === 'blow')) { st.blowSeen = true; litAtBlow = w.candles.map(c => c.lit); }
    if (w.phase === 'clear' && G) { const c = w.cherryPose(1); if (c) cherryFlyX.push(c.x); }
  });
  const ty = log.map(x => x[0]), ix = t => ty.indexOf(t), at = t => log.find(x => x[0] === t)[1];
  assert.strictEqual(log[0][0], 'towerDone'); assert.strictEqual(log[0][2].n, 4);
  const order = ['towerDone', 'cherry', 'cherryOn', 'count', 'blow', 'candlesOut', 'sprinkles', 'roundDone', 'clearBlock', 'round'];
  for (let i = 1; i < order.length; i++) assert.ok(ix(order[i - 1]) < ix(order[i]), order[i - 1] + ' before ' + order[i]);
  assert.ok(ix('cherryOn') < ix('count'), 'the cherry is on before counting');
  const counts = log.filter(x => x[0] === 'count');
  assert.deepStrictEqual(counts.map(x => x[2].i), [1, 2, 3, 4]);
  for (let i = 1; i < 4; i++) { assert.ok(Math.abs(counts[i][1] - counts[i - 1][1] - CFG.countStep) < 0.02); assert.ok(counts[i][2].y < counts[i - 1][2].y, 'bottom → top'); }
  assert.ok(counts.every(c => isFinite(c[2].cx + c[2].cy)), 'candle position on the count event');
  assert.ok(ix('blow') > ty.lastIndexOf('count'));
  assert.ok(minCsy < 0.8, 'cherry squash ' + minCsy.toFixed(2)); assert.ok(cloudGone, 'the cloud puffed away');
  assert.ok(cherryOnTop > -1.5, 'the cherry rides the top (' + cherryOnTop.toFixed(2) + ')');
  assert.ok(sawBlowMood, 'Koko blows'); assert.ok(litAtBlow && litAtBlow.length === 4 && litAtBlow.every(l => l > 0.99), 'all candles lit before the blow ' + litAtBlow);
  const bl = log.find(x => x[0] === 'blow')[2]; assert.ok(bl.x < bl.tx, 'Koko blows towards the cake');
  const tDone = at('roundDone') - at('towerDone');
  assert.ok(tDone > 3.3 && tDone < 3.9, 'done ≈ 3.6 s (' + tDone.toFixed(2) + ')');
  assert.ok(at('candlesOut') - at('blow') > 0.3 && at('sprinkles') > at('candlesOut'));
  const cl = log.filter(x => x[0] === 'clearBlock');
  assert.deepStrictEqual(cl.map(x => x[2].i), [4, 3, 2, 1], 'top first');
  assert.ok(cherryFlyX.length > 5 && cherryFlyX[cherryFlyX.length - 1] > cherryFlyX[0] + 50, 'the cherry flies off with the top layer');
  assert.strictEqual(w.goal.state, 'float', 'the next cake has a new cherry'); assert.strictEqual(w.candles.length, 0);
});

test('world: candles — one per layer (n = 2…5), evenly across 0.7·LW, pop with an overshoot, light, go out after the blow', () => {
  for (const [age, ri, n] of [[3, 0, 2], [4, 1, 3], [5, 2, 4], [6, 1, 5]]) {
    const w = mkWorld({ age, seed: 2 + n });
    let maxPop = 0, outEnd = 0, cand = null;
    const log = doneLog(w, ri, age >= 6 ? 'add' : 'colors', () => {
      if (w.phase === 'done' && w.candles.length) { cand = w.candles.map(c => c.x); maxPop = Math.max(maxPop, ...w.candles.map(c => c.pop)); outEnd = Math.min(...w.candles.map(c => c.out)); }
    });
    assert.strictEqual(log[0][2].n, n);
    assert.strictEqual(cand.length, n, 'candles = layers');
    const LW = w.layout.LW, span = 0.7 * LW;
    if (n > 1) { assert.ok(Math.abs(cand[0] + span / 2) < 1e-9 && Math.abs(cand[n - 1] - span / 2) < 1e-9); for (let j = 1; j < n; j++) assert.ok(Math.abs(cand[j] - cand[j - 1] - span / (n - 1)) < 1e-9); }
    assert.ok(maxPop > 1.1 && maxPop < 1.4, 'pop overshoot ' + maxPop.toFixed(2));
    assert.ok(outEnd > 0.5, 'candles going out before the clear (' + outEnd.toFixed(2) + ')');
    assert.strictEqual(log.filter(x => x[0] === 'count').length, n);
  }
});

test('world: chapter time limit — after ≥ 2 cakes and > 80 s (or a predicted > 100 s) → Talk time; Talk re-asks every 12 s, glow from the 2nd', () => {
  const w = mkWorld({ age: 4 }); w.levels = ['colors', 'shapes', 'count', 'animals']; w.startLevel(0);
  const b = new CK.Bot(w, { skill: 1, seed: 1, think: [7, 8] });
  let towers = 0;
  while (w.state !== 'talk' && w.time < 600) { b.step(1 / 30); w.update(1 / 30); for (const e of w.drainEvents()) if (e.type === 'roundDone') towers++; }
  assert.strictEqual(w.state, 'talk'); assert.ok(towers >= 2 && towers < 4, 'cut after ' + towers); assert.strictEqual(w.roundsPerLevel, towers);
  run(w, 12.05); let e = evs(w).find(x => x.type === 'talkAsk'); assert.ok(e && e.n === 1 && !e.glowAnswer);
  run(w, 12); e = evs(w).find(x => x.type === 'talkAsk'); assert.ok(e && e.n === 2 && e.glowAnswer && w.talk.glowAnswer);
  assert.strictEqual(w.talkAnswer(w.talk.answerId), true); assert.ok(evs(w).some(x => x.type === 'talkResult' && x.correct));
  run(w, 1.7); assert.ok(evs(w).some(x => x.type === 'levelDone'));
});

test('world: breeze surprise — gust after the 2nd stack, Koko holds (1.5 s), the cake sways ≤ 0.12 rad and settles', () => {
  const w = mkWorld({ age: 4 }); roundOf(w, 'colors', 2, 'breeze');
  assert.strictEqual(w.surprise, 'breeze');
  dragToTower(w, rightP(w)); untilPhase(w, 'ask', 20000);
  dragToTower(w, rightP(w)); until(w, () => w._liveCount() === 2); evs(w);
  run(w, 0.5); w.tower.theta *= 0; w.tower.omega *= 0;
  let gust = null, peak = 0, held = 0;
  run(w, 3.5, () => { for (const e of w.drainEvents()) if (e.type === 'gust') gust = e; peak = Math.max(peak, Math.abs(w.tower.theta)); if (w.koko.mood === 'hold') held += H; });
  assert.ok(gust, 'gust event'); assert.ok(peak > 0.05 && peak <= 0.12 + 1e-9, 'gust sway ' + peak);
  assert.ok(Math.abs(held - CFG.holdTime) < 0.05, 'Koko holds ' + held.toFixed(2));
  assert.ok(Math.abs(w.tower.theta) < 0.02 && w.wind === 0, 'calm again');
  const w2 = mkWorld({ age: 4 }); roundOf(w2, 'colors', 1);
  for (let k = 0; k < 3; k++) { dragToTower(w2, rightP(w2)); untilPhase(w2, k < 2 ? 'ask' : 'done', 20000); }
  assert.ok(!evs(w2).some(e => e.type === 'gust'));
});

test('world: setBreeze (weather wind 0..1) — a gentle sinusoidal rocking, |θ| from it ≤ 0.02 rad (steady, toggled, with landings it stays ≤ the cap); calms when it stops', () => {
  const w = mkWorld({ age: 5 }); roundOf(w, 'colors', 2);
  for (let k = 0; k < 3; k++) { dragToTower(w, rightP(w)); untilPhase(w, 'ask', 20000); }
  run(w, 3); assert.ok(Math.abs(w.tower.theta) < 0.003, 'still');
  w.setBreeze(1); let peak = 0;
  run(w, 30, () => { peak = Math.max(peak, Math.abs(w.tower.theta)); });
  assert.ok(peak > 0.008 && peak <= 0.02, 'breeze 1 rocks ' + peak.toFixed(4));
  w.setBreeze(0.5); peak = 0; run(w, 20, () => { peak = Math.max(peak, Math.abs(w.tower.theta)); }); assert.ok(peak <= 0.02);
  peak = 0;
  run(w, 30, i => { if (i % 156 === 0) w.setBreeze((i / 156) % 2 ? 1 : 0); peak = Math.max(peak, Math.abs(w.tower.theta)); });
  assert.ok(peak <= 0.02, 'toggled breeze ' + peak.toFixed(4));
  w.setBreeze(0); run(w, 8); assert.ok(Math.abs(w.tower.theta) < 0.002, 'calm ' + w.tower.theta);
  assert.ok(w.breeze < 0.01);
  w.setBreeze(7); assert.strictEqual(w._breezeIn, 1); w.setBreeze(-1); assert.strictEqual(w._breezeIn, 0); w.setBreeze(NaN); assert.strictEqual(w._breezeIn, 0);
});

test('world: bee surprise — buzzes in once, sits on the cake top 4 s; a tap → beeTap (no score), one loop-the-loop then away; it leaves when a layer falls', () => {
  const w = mkWorld({ age: 4 }); roundOf(w, 'colors', 2, 'bee');
  assert.strictEqual(w.surprise, 'bee');
  dragToTower(w, rightP(w)); untilPhase(w, 'ask', 20000);
  until(w, () => w.bee && w.bee.state === 'sit', 6000);
  const B = w.bee, top = w.towerTop();
  assert.ok(Math.abs(B.x - top.x) < 12 && Math.abs(B.y - (top.y - 12)) < 12, 'on the cake top');
  assert.ok(evs(w).some(e => e.type === 'bee'));
  const bh = w.beeHit(); assert.ok(bh && bh.r === CFG.beeR); assert.deepStrictEqual(w.beePos(), { x: B.x, y: B.y });
  const st = w.stars, m = w.misses;
  assert.strictEqual(w.pointerDown(bh.x, bh.y), 'bee');
  const tapE = evs(w).find(e => e.type === 'beeTap'); assert.ok(tapE && isFinite(tapE.x + tapE.y));
  assert.strictEqual(B.state, 'loop'); assert.strictEqual(w.beeHit(), null, 'a looping bee is not tappable');
  let maxR = 0, minY = 1e9; const lx = B.lx, ly = B.ly;
  run(w, CFG.beeLoop - 0.02, () => { maxR = Math.max(maxR, Math.abs(Math.hypot(B.x - lx, B.y - (ly - CFG.beeLoopR)) - CFG.beeLoopR)); minY = Math.min(minY, B.y); });
  assert.ok(maxR < 1e-6, 'a circle'); assert.ok(minY < ly - 1.8 * CFG.beeLoopR, 'loops up over its spot');
  run(w, 0.05); assert.strictEqual(B.state, 'away');
  run(w, CFG.beeOut + 0.05); assert.strictEqual(w.bee, null);
  assert.strictEqual(w.stars, st); assert.strictEqual(w.misses, m);
  run(w, 10); assert.strictEqual(w.bee, null, 'once per cake');
  const w2 = mkWorld({ age: 4, seed: 5 }); roundOf(w2, 'colors', 2, 'bee');
  dragToTower(w2, rightP(w2)); untilPhase(w2, 'ask', 20000);
  until(w2, () => w2.bee && w2.bee.state === 'sit', 6000);
  dragToTower(w2, rightP(w2)); assert.strictEqual(w2.bee.state, 'away');
});

test('world: rotation / resize mid-drag, mid-fall, mid-deal, mid-cherry-drop, mid-clear — everything snaps and goes on', () => {
  const flip = w => { const L = w.layout; w.setViewport(L.H, L.W, L.portrait ? { top: 0, right: 44, bottom: 21, left: 44 } : { top: 47, right: 0, bottom: 34, left: 0 }); };
  const check = (w, tag) => {
    for (const p of w.pieces) { assert.ok(onScreen(w, p.x, p.y, 1) && p.state !== 'drag' && p.state !== 'fall', tag + ' piece ' + p.state); if (p.state === 'rest') assert.ok(Math.abs(p.x - p.homeX) < 1e-6); }
    for (let i = 0; i < w.tower.blocks.length; i++) { const q = w.blockPose(i, 1); assert.ok(onScreen(w, q.x, q.y, 1), tag + ' cake layer'); assert.strictEqual(w.tower.blocks[i].bw, w.layout.LW * (w.tower.blocks[i].block.size === 'small' ? 0.72 : 1)); }
    if (w.goal) { const c = w.cherryPose(1); if (c) assert.ok(onScreen(w, c.x, c.y, 1), tag + ' cherry'); }
    assert.strictEqual(w._press, null);
  };
  for (const vp of [VIEWPORTS[8], VIEWPORTS[3]]) {
    const w = mkWorld({ age: 4, vp }); roundOf(w, 'colors', 2);
    const p = rightP(w); w.pointerDown(p.x, p.y); w.pointerMove(p.x - 100, p.y - 200); run(w, 0.2);
    flip(w); check(w, 'mid-drag'); assert.strictEqual(w.pointerUp(10, 10), null);
    assert.strictEqual(w.goal.y, w.layout.goalY, 'the cherry goal follows the layout');
    let d = w.dropPoint(); drag(w, rightP(w), d.x, d.y - 150); assert.strictEqual(rightP(w).state, 'fall');
    const n0 = w._liveCount(); flip(w); check(w, 'mid-fall');
    assert.strictEqual(w._liveCount(), n0 + 1); assert.ok(evs(w).some(e => e.type === 'land'));
    untilPhase(w, 'ask');
    const X = wrongP(w); d = w.dropPoint(); drag(w, X, d.x, d.y - 150); flip(w); check(w, 'mid-fall wrong');
    assert.ok(evs(w).some(e => e.type === 'wrong')); assert.strictEqual(X.state, 'rest'); assert.strictEqual(w.phase, 'ask');
    run(w, 1);
    dragToTower(w, rightP(w)); until(w, () => w.pieces.some(q => q.state === 'in' && q.alpha > 0)); flip(w); check(w, 'mid-deal'); untilPhase(w, 'ask');
    while (w.phase !== 'done') { dragToTower(w, rightP(w)); until(w, () => w.phase === 'ask' || w.phase === 'done'); }
    until(w, () => w.goal.state === 'drop'); evs(w); flip(w); check(w, 'mid-cherry');
    assert.strictEqual(w.goal.state, 'on'); assert.ok(evs(w).some(e => e.type === 'cherryOn'));
    until(w, () => w.phase === 'clear' && w.tower.blocks.some(b => b.fly)); flip(w); check(w, 'mid-clear');
    assert.ok(w.goal === null || w.goal.state === 'on');
    until(w, () => w.state === 'round' && w.phase === 'ask', 30000);
    assert.strictEqual(w.round, 3);
    const pp = rightP(w); w.pointerDown(pp.x, pp.y); const L = w.layout; w.setViewport(L.W, L.H, L.ins); assert.ok(w._press, 'no-op resize keeps the drag'); w.cancelDrag();
  }
});

test('world: physics — sway settles in ≈ 1.5–2.5 s and never exceeds 0.12 rad even under repeated kicks; dx self-centres', () => {
  const w = mkWorld({ age: 4 }); roundOf(w, 'colors', 3);
  for (let k = 0; k < 3; k++) { dragToTower(w, rightP(w), { ox: 40 }); untilPhase(w, 'ask', 20000); }
  const T = w.tower;
  T.theta = 0; T.omega = 0; w._swayKick(0.1);
  let peak = 0, settle = null;
  for (let i = 0; i < 600; i++) { w._stepTower(H); peak = Math.max(peak, Math.abs(T.theta)); if (settle === null && i > 60 && Math.abs(T.theta) < 0.005 && Math.abs(T.omega) < 0.05) settle = i * H; }
  assert.ok(Math.abs(peak - 0.1) < 0.005, 'peak ≈ kick ' + peak);
  assert.ok(settle > 1.0 && settle < 2.6, 'settles ' + settle);
  for (let i = 0; i < 2000; i++) { if (i % 37 === 0) w._swayKick(0.1 * (i % 2 ? 1 : -1)); w._stepTower(H); assert.ok(Math.abs(T.theta) <= 0.12 + 1e-12); }
  T.blocks.forEach(b => { b.dx = 30; });
  for (let i = 0; i < 240; i++) w._stepTower(H);
  assert.ok(T.blocks.every(b => Math.abs(b.dx) < 0.5), 'self-centring');
});

test('world: the cake never falls — 1000 random sessions (random age, viewport, breeze, skill, wild drags / flicks / taps, rotations): |θ| ≤ cap, every stacked layer stays on the cake, offsets ≤ 0.18·LW, nothing NaN', () => {
  const R = new CK.RNG(2026);
  let cakes = 0, layers = 0, maxTh = 0, maxCom = 0;
  for (let s = 0; s < 1000; s++) {
    const age = R.int(3, 7), v = VIEWPORTS[R.int(0, VIEWPORTS.length - 1)];
    const w = mkWorld({ age, vp: v, seed: 7000 + s, surprise: true, config: { step: 1 / 120 } });
    const b = new CK.Bot(w, { skill: R.float(0.3, 1), seed: s, think: [0.1, 0.6], retry: [0.1, 0.4], steps: [2, 6], stepDt: [0.01, 0.04], hold: [0, 0.05], bee: 0.5 });
    const breeze = R.chance(0.5) ? R.float(0, 1) : 0;
    w.setBreeze(breeze);
    let stacks = 0, t = 0;
    const maxT = 60 + R.float(0, 60);
    while (w.state !== 'sessionDone' && t < maxT) {
      if (R.chance(0.04)) { const x = R.float(0, w.layout.W), y = R.float(0, w.layout.H); w.pointerDown(x, y); w.pointerUp(x, y); }
      if (R.chance(0.002)) { const L = w.layout; w.setViewport(L.H, L.W, L.ins); }
      if (w.state === 'talk' && !w.talkAnswered && w.stateTime > 0.5) w.talkAnswer(w.talk.answerId);
      b.step(1 / 20); w.update(1 / 20); t += 1 / 20;
      const T = w.tower, live = w._liveCount();
      assert.ok(isFinite(T.theta) && Math.abs(T.theta) <= CFG.swayMax + 1e-9, 'theta ' + T.theta);
      maxTh = Math.max(maxTh, Math.abs(T.theta));
      for (let i = 0; i < live; i++) {
        const q = w.blockPose(i, 1), bl = T.blocks[i], prev = i ? T.blocks[i - 1].dx : 0;
        assert.ok(isFinite(q.x + q.y + q.rot), 'pose NaN');
        assert.ok(Math.abs(bl.dx - prev) <= 0.18 * w.layout.LW + 1e-6, 'layer slid off');
      }
      if (live) { let cx = 0; for (let i = 0; i < live; i++) cx += w.blockPose(i, 1).x; maxCom = Math.max(maxCom, Math.abs(cx / live - T.x) / w.layout.tower.baseW); assert.ok(Math.abs(cx / live - T.x) < w.layout.tower.baseW / 2, 'the cake\'s centre left the stand'); }
      for (const e of w.drainEvents()) {
        if (e.type === 'stack') { stacks++; layers++; assert.strictEqual(w._liveCount(), e.n, 'stacked layer kept'); }
        if (e.type === 'towerDone') { cakes++; assert.strictEqual(e.n, w.cur.n); }
        if (e.type === 'round') stacks = 0;
      }
    }
  }
  assert.ok(cakes > 1500 && layers > 5000, cakes + ' cakes, ' + layers + ' layers');
  assert.ok(maxTh < 0.12, 'max θ ' + maxTh.toFixed(3));
  console.log('     (' + cakes + ' cakes, ' + layers + ' layers, max |θ| ' + maxTh.toFixed(3) + ' rad, max centre offset ' + maxCom.toFixed(2) + '·baseW)');
});

test('world: determinism — same seed + bot → same events; inputs replayed on sub-steps with other frame sizes → same events', () => {
  const runIt = (dt) => {
    const w = mkWorld({ age: 5, seed: 77, surprise: true }), b = new CK.Bot(w, { skill: 0.7, seed: 3 }), all = [];
    let t = 0; while (w.state !== 'sessionDone' && t < 900) { w.setBreeze(w.weather === 1 ? 0.8 : 0); b.step(dt); w.update(dt); t += dt; all.push(...w.drainEvents()); }
    return hashEvents(all);
  };
  assert.strictEqual(runIt(1 / 30), runIt(1 / 30));
  const record = () => {
    const w = mkWorld({ age: 4, seed: 78, surprise: true }), inputs = [], all = [];
    for (const fn of ['pointerDown', 'pointerMove', 'pointerUp', 'talkAnswer', 'cancelDrag']) {
      const o = w[fn].bind(w); w[fn] = (...a) => { inputs.push({ s: Math.round(w.time / CFG.step), fn, a }); return o(...a); };
    }
    const b = new CK.Bot(w, { skill: 0.7, seed: 4 });
    while (w.state !== 'sessionDone' && w.time < 900) { b.step(1 / 30); w.update(1 / 30); all.push(...w.drainEvents()); }
    return { inputs, h: hashEvents(all) };
  };
  const replay = (inputs, frame) => {
    const w = mkWorld({ age: 4, seed: 78, surprise: true }), all = [], per = Math.round(frame / CFG.step);
    let k = 0;
    while (w.state !== 'sessionDone' && w.time < 900) {
      const s = Math.round(w.time / CFG.step);
      while (k < inputs.length && inputs[k].s <= s) { w[inputs[k].fn](...inputs[k].a); k++; }
      const next = k < inputs.length ? inputs[k].s : Infinity;
      w.update(Math.max(1, Math.min(per, next - s)) * CFG.step); all.push(...w.drainEvents());
    }
    return hashEvents(all);
  };
  const r = record();
  assert.strictEqual(replay(r.inputs, 1 / 120), r.h, '1/120 frames');
  assert.strictEqual(replay(r.inputs, 1 / 60), r.h, '1/60 frames');
});

test('world: prompt() / answerId() / pieceHit() / kokoHit() / dropPoint() / interactive / hint() / pose helpers / event fields', () => {
  const w = mkWorld({ age: 4 });
  assert.strictEqual(w.prompt(), null); assert.strictEqual(w.answerId(), null);
  assert.strictEqual(w.cherryPose(), null); assert.strictEqual(w.cloudPose(), null); assert.strictEqual(w.candlePose(0), null); assert.strictEqual(w.beeHit(), null);
  roundOf(w, 'animals', 2);
  const p = w.prompt(); assert.ok(p && (p.promptKey === 'p.animals' || p.promptKey === 'p.sound') && p.params.animal);
  const R = rightP(w); assert.strictEqual(R.block.animal, p.params.animal);
  const h = w.pieceHit(R.id); assert.ok(h.x === R.x && h.w === w.layout.LW + 32 && h.h === 2 * (0.6 * w.layout.S + 14));
  const dp = w.dropPoint(); assert.ok(Math.abs(dp.y - (w.layout.tower.baseTop - 1.5 * w.layout.LH)) < 1e-9);
  assert.strictEqual(w.interactive, true);
  const kh = w.kokoHit(), K = w.layout.koko; assert.ok(Math.abs(kh.w - 0.76 * K.h) < 1e-9 && kh.h === K.h);
  const cp = w.cherryPose(1); assert.ok(cp && cp.x === w.layout.tower.x && Math.abs(cp.y - (w.layout.goalY + w.goal.bob)) < 2 && cp.alpha === 1);
  assert.strictEqual(w.hint(), R.id); assert.ok(w.drainEvents().some(e => e.type === 'hint' && e.pieceId === R.id));
  const w2 = mkWorld({ age: 4, surprise: true }), b = new CK.Bot(w2, { skill: 0.7, seed: 2 }), seen = {};
  const need = { level: ['level', 'topic', 'weather'], round: ['round', 'n', 'asks'], deal: ['ask', 'n', 'pieces'], ask: ['ask', 'asks', 'promptKey', 'params', 'answerId', 'nameKind', 'nameValue'],
    grab: ['pieceId', 'nameKind', 'nameValue', 'x', 'y'], drop: ['pieceId', 'x', 'y'], land: ['pieceId', 'n', 'impact', 'x', 'y'],
    stack: ['n', 'nameKind', 'nameValue', 'block', 'x', 'y', 'promptKey', 'params'], wrong: ['pieceId', 'nameKind', 'nameValue', 'want', 'streak', 'x', 'y'],
    towerDone: ['n'], cherry: ['x', 'y'], cherryOn: ['x', 'y'], count: ['i', 'n', 'x', 'y', 'cx', 'cy'], blow: ['x', 'y', 'tx', 'ty'], candlesOut: ['n', 'x', 'y'],
    sprinkles: ['x', 'y'], roundDone: ['round', 'stars', 'misses'], clearBlock: ['i', 'x', 'y'], talk: ['talk'], talkResult: ['correct', 'choiceId', 'answerId'],
    levelDone: ['level', 'stars'], sessionDone: ['stars', 'towers'] };
  while (w2.state !== 'sessionDone' && w2.time < 900) {
    b.step(1 / 30); w2.update(1 / 30);
    for (const e of w2.drainEvents()) if (need[e.type]) { seen[e.type] = 1; for (const f of need[e.type]) assert.ok(e[f] !== undefined, e.type + '.' + f); }
  }
  for (const t of Object.keys(need)) assert.ok(seen[t], 'saw ' + t);
});

// ======================================================================== bot
test('bot: drags right with p ≈ skill (through pointerDown/Move/Up), taps the bee sometimes, talks', () => {
  let right = 0, drops = 0, bee = 0, talks = 0;
  for (let s = 0; s < 4; s++) {
    const w = mkWorld({ age: 4, seed: 30 + s, surprise: true }), b = new CK.Bot(w, { skill: 0.7, seed: s, bee: 1 });
    while (w.state !== 'sessionDone' && w.time < 900) { b.step(1 / 30); w.update(1 / 30); w.drainEvents(); }
    right += b.stats.right; drops += b.stats.drops; bee += b.stats.bee; talks += b.stats.talks;
    assert.strictEqual(b.stats.misses, 0, 'the bot always reaches the drop zone');
  }
  const fr = right / drops;
  assert.ok(fr > 0.6 && fr < 0.9, 'right fraction ' + fr.toFixed(2));
  assert.ok(bee > 0 && talks === 16, 'bee ' + bee + ' talks ' + talks);
});

// ======================================================================== weather
test('weather: sunny / breezy / rain / rainbow — DESIGN sky hex, ambient fields, 2.5 s crossfade, wind (breezy ≈ 0.8, others ≤ 0.15), rain 0.15 dark + splashes, rainbow, clouds, party, cap 120, deterministic', () => {
  const wx = new CK.Weather({ width: 1280, height: 720, seed: 3 });
  const kinds = new Set(CK.Weather.KINDS);
  assert.deepStrictEqual(CK.Weather.NAMES, ['sunny', 'breezy', 'rain', 'rainbow']);
  assert.deepStrictEqual(CK.Weather.SKY.map(s => s.top + s.bottom), ['#A9DDF5#FFF4DA', '#BFDDEB#F3EEDF', '#8FA0B8#CBD5E0', '#9FD6F0#FFF1D6']);
  for (let m = 0; m < 4; m++) {
    wx.setWeather(m);
    let wmax = 0, wsum = 0, nW = 0;
    for (let k = 0; k < 1200; k++) { wx.update(1 / 60); assert.ok(wx.particles.length <= 120); if (k > 300) { wmax = Math.max(wmax, wx.ambient.wind); wsum += wx.ambient.wind; nW++; } }
    const a = wx.ambient;
    for (const key of ['skyTop', 'skyBottom', 'skyMid']) assert.ok(/^#[0-9A-F]{6}$/.test(a[key]), key);
    for (const key of ['sun', 'sunX', 'sunY', 'darkness', 'wind', 'gust', 'rain', 'rainbow', 'cloudSpeed']) assert.ok(isFinite(a[key]), key);
    assert.strictEqual(a.skyTop, CK.Weather.SKY[m].top); assert.strictEqual(a.skyBottom, CK.Weather.SKY[m].bottom);
    assert.strictEqual(a.mood, CK.Weather.NAMES[m]); assert.strictEqual(a.env, a.mood); assert.strictEqual(a.moodIndex, m);
    assert.strictEqual(a.darkness, m === 2 ? 0.15 : 0); assert.strictEqual(a.rain, m === 2 ? 1 : 0); assert.strictEqual(a.rainbow, m === 3 ? 1 : 0);
    if (m === 1) { assert.ok(wsum / nW > 0.65 && wsum / nW < 0.95 && wmax <= 1, 'breezy wind ' + (wsum / nW).toFixed(2)); assert.ok(a.cloudSpeed > 30, 'fast clouds'); }
    else assert.ok(wmax <= 0.15, CK.Weather.NAMES[m] + ' wind ' + wmax.toFixed(3));
    for (const p of wx.particles) { assert.ok(kinds.has(p.kind), 'kind ' + p.kind); for (const f of ['x', 'y', 'rot', 's', 'a']) assert.ok(isFinite(p[f]), f); assert.ok(p.layer === 'back' || p.layer === 'front'); }
    for (const c of wx.clouds) { assert.ok(['a', 'b', 'c', 'rain'].includes(c.kind)); assert.ok(isFinite(c.x + c.y + c.s + c.alpha)); }
    const vis = wx.clouds.filter(c => c.alpha > 0.3);
    if (m === 2) assert.ok(vis.filter(c => c.kind === 'rain').length >= 3, 'rain clouds'); else assert.ok(vis.every(c => c.kind !== 'rain') && vis.length >= 3, 'white clouds');
    for (const k of ['confetti', 'sprinkles', 'puff', 'dust', 'sparkle', 'stars', 'splash']) wx.burst(640, 360, { kind: k, n: 30 });
    assert.ok(wx.particles.length <= 120);
    assert.ok(wx.particles.every(p => kinds.has(p.kind)));
    for (let k = 0; k < 200; k++) wx.update(1 / 60);
  }
  const make = s => { const x = new CK.Weather({ seed: 4, weather: s }); for (let k = 0; k < 300; k++) x.update(1 / 60); return x; };
  const ks = s => new Set(make(s).particles.map(p => p.kind));
  assert.ok(ks(0).has('sugar') && ks(0).has('blossom')); assert.ok(ks(1).has('wrapper_a') && ks(1).has('wrapper_b') && ks(1).has('blossom'));
  assert.ok(ks(2).has('raindrop') && ks(2).has('splash')); assert.ok(ks(3).has('sparkle'));
  const rn = make(2); assert.ok(rn.particles.filter(p => p.kind === 'splash').every(p => p.y > 0.5 * rn.height), 'splashes on the plaza');
  const fl = make(1); assert.ok(fl.particles.filter(p => p.kind.startsWith('wrapper')).every(p => p.tint), 'tinted wrappers');
  wx.setWeather(1); for (let k = 0; k < 75; k++) wx.update(1 / 60); const mid = wx.ambient.skyTop, mix = wx.ambient.envMix; for (let k = 0; k < 78; k++) wx.update(1 / 60);
  assert.ok(mid !== CK.Weather.SKY[3].top && mid !== CK.Weather.SKY[1].top && mix > 0.2 && mix < 0.8, 'crossfading'); assert.strictEqual(wx.ambient.skyTop, CK.Weather.SKY[1].top);
  assert.strictEqual(wx.ambient.envFrom, 'rainbow'); assert.strictEqual(wx.ambient.envMix, 1);
  const pw = new CK.Weather({ seed: 5 }); pw.party(); let conf = 0;
  for (let k = 0; k < 240; k++) { pw.update(1 / 60); assert.ok(pw.particles.length <= 120); conf = Math.max(conf, pw.particles.filter(p => p.kind.startsWith('confetti')).length); }
  assert.ok(conf > 40, 'party confetti ' + conf); pw.party(false); for (let k = 0; k < 400; k++) pw.update(1 / 60); assert.ok(!pw.particles.some(p => p.kind.startsWith('confetti')), 'party over');
  pw.resize(720, 1556); for (let k = 0; k < 60; k++) pw.update(1 / 60); assert.ok(pw.particles.every(p => isFinite(p.x + p.y)));
  const p = new CK.Weather({ seed: 9, weather: 2 }), q = new CK.Weather({ seed: 9, weather: 2 });
  for (let k = 0; k < 300; k++) { p.update(1 / 60); q.update(1 / 60); }
  assert.deepStrictEqual(p.particles, q.particles); assert.deepStrictEqual(p.clouds, q.clouds);
});

// ======================================================================== run
let pass = 0, fail = 0;
const t0 = Date.now();
const only = process.argv[2];
for (const t of tests) {
  if (only && !t.name.includes(only)) continue;
  const t1 = Date.now();
  try { t.fn(); pass++; console.log('ok   ' + t.name + '  (' + ((Date.now() - t1) / 1000).toFixed(1) + ' s)'); }
  catch (e) { fail++; console.log('FAIL ' + t.name + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n     ') : e)); }
}
console.log(`\n${pass} passed, ${fail} failed (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(fail ? 1 : 0);
