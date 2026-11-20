#!/usr/bin/env node
// Pip's Reef Tower — headless unit tests for rng / content / world / weather / bot.
// Run from projects/education-game/octopus-reef-tower:   node tests/unit/run.js [name part]   (exit 1 on any failure)
// (tests/unit/i18n_voice.test.js is the voice engineer's suite and runs on its own.)
'use strict';
const assert = require('assert');
const crypto = require('crypto');
const { load } = require('./load');

const RT = load();
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const H = 1 / 120;
const AGES = [3, 4, 5, 6, 7];
const LANGS = ['en', 'vi'];
const TOPICS = RT.Content.TOPICS;
const C = RT.Content;
const CFG = RT.CONFIG;
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
  const w = new RT.World({ seed: o.seed || 1, age: o.age || 4, lang: o.lang || 'en', config: cfg });
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
/** A quick finger tap on a piece (tap to send) → pointerUp result. */
function tapPiece(w, p, o) { o = o || {}; const x = p.x + (o.dx || 0), y = p.y + (o.dy || 0); const r = w.pointerDown(x, y); assert.strictEqual(r, p.id, 'tap ' + p.id + ' got ' + r); w.update(o.dt || 0.05); return w.pointerUp(x, y); }
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
    const r = C.makeRound(topic, { age, lang, rng: new RT.RNG(s * 97 + ri * 13 + age), roundIndex: ri });
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

test('content: layers per cake 3: 2,2,3,3 · 4: 2,2,3,4 · 5: 3,3,4,5 · 6–7: 3,4,4,5; choices 2 / 3 / 3 (6–7: 4 from round 2), warm-up 2, size 2', () => {
  const T = { 3: [2, 2, 3, 3], 4: [2, 2, 3, 4], 5: [3, 3, 4, 5], 6: [3, 4, 4, 5], 7: [3, 4, 4, 5] };
  for (const age of AGES) for (const topic of TOPICS) for (let ri = 0; ri < 4; ri++) {
    const r = C.makeRound(topic, { age, lang: 'en', rng: new RT.RNG(ri + 1), roundIndex: ri });
    assert.strictEqual(r.n, T[age][ri]); assert.strictEqual(r.asks.length, T[age][ri]);
    const k = topic === 'size' || ri === 0 || age === 3 ? 2 : age >= 6 && ri >= 2 ? 4 : 3;
    for (const a of r.asks) assert.strictEqual(a.choices.length, k, topic + ' age ' + age + ' r' + ri);
    for (const a of r.asks) for (const b of a.choices) assert.ok(C.KIND_OF[topic].includes(b.kind));
  }
});

test('content: colour-blind-safe below age 5 — the answer never next to a clashing colour (blue+purple, red+green, yellow+orange, green+orange, red+orange), no pink; yellow not in every set, orange asked', () => {
  let pink5 = false, seen = new Set(), sets3 = 0, yellow3 = 0;
  for (const age of AGES) for (const topic of ['colors', 'shapes', 'size']) for (let ri = 0; ri < 4; ri++) for (let s = 0; s < 300; s++) {
    const r = C.makeRound(topic, { age, lang: 'en', rng: new RT.RNG(s + 1000 * ri), roundIndex: ri });
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
    const rng = new RT.RNG(s + 7);
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
    const r = C.makeRound('count', { age, lang: 'en', rng: new RT.RNG(s * 3 + ri), roundIndex: ri });
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

test('content: sea animals — clue asks ("Who has big claws?") from round 2 at age ≥ 4 (about half, only crab / turtle / whale / seahorse, never with a look-alike distractor), never earlier or at age 3; size: one colour big + small', () => {
  let snd = 0, all = 0;
  for (const lang of LANGS) for (const age of AGES) for (let s = 0; s < 200; s++) for (let ri = 0; ri < 4; ri++) {
    const r = C.makeRound('animals', { age, lang, rng: new RT.RNG(s * 5 + ri), roundIndex: ri });
    for (const a of r.asks) {
      if (a.promptKey === 'p.sound') {
        assert.ok(age >= 4 && ri >= 2); assert.ok(['crab', 'turtle', 'whale', 'seahorse'].includes(a.params.animal));
        assert.strictEqual(a.params.sound, RT.ANIMAL_SOUND[a.params.animal], 'params.sound = the clue id');
        for (const b of a.choices) assert.ok(!(RT.CLUE_AVOID[a.params.sound] || []).includes(b.animal), 'look-alike ' + b.animal + ' for ' + a.params.sound);
      }
      if (age >= 4 && ri >= 2) { all++; if (a.promptKey === 'p.sound') snd++; }
      for (const b of a.choices) assert.ok(RT.ANIMALS.includes(b.animal) && b.sprite === 'animal_' + b.animal);
    }
  }
  assert.ok(snd / all > 0.4 && snd / all < 0.6, 'about half by clue ' + (snd / all).toFixed(2));
  for (let s = 0; s < 300; s++) {
    const r = C.makeRound('size', { age: 3, lang: 'en', rng: new RT.RNG(s), roundIndex: 3 });
    let run = 1;
    r.asks.forEach((a, q) => {
      assert.strictEqual(a.choices[0].color, a.choices[1].color);
      assert.deepStrictEqual(a.choices.map(b => b.size).sort(), ['big', 'small']);
      assert.strictEqual(a.choices[a.answer].size, a.params.size);
      if (q) { run = a.params.size === r.asks[q - 1].params.size ? run + 1 : 1; assert.ok(run <= 2, 'never 3× the same size'); }
    });
  }
});

test('content: initial (sea-animal words; every initial unique inside a choice set, incl. vi C-words), letters / lower (no I/l), add / sub / oddeven arithmetic', () => {
  for (const lang of LANGS) for (let s = 0; s < 200; s++) for (const ri of [1, 2, 3]) {
    const r = C.makeRound('initial', { age: ri === 3 ? 7 : 6, lang, rng: new RT.RNG(s), roundIndex: ri });
    for (const a of r.asks) {
      const b = a.choices[a.answer]; assert.strictEqual(b.initial, a.params.letter); assert.ok(b.word);
      a.choices.forEach((c, j) => { if (j !== a.answer) assert.ok(c.initial && c.initial !== a.params.letter); });
      const ini = a.choices.map(c => c.initial); assert.strictEqual(new Set(ini).size, ini.length, lang + ' initials repeat ' + ini.join());
    }
  }
  for (const lang of LANGS) for (let s = 0; s < 200; s++) {
    const r = C.makeRound('initial', { age: 6, lang, rng: new RT.RNG(s), roundIndex: 2 });
    r.asks.forEach((a, q) => { if (q) assert.notStrictEqual(a.params.letter, r.asks[q - 1].params.letter, 'same letter twice in a row'); });
    const lo = C.makeRound('lower', { age: 6, lang, rng: new RT.RNG(s), roundIndex: 1 });
    for (const a of lo.asks) assert.ok(!'IL'.includes(a.params.letter) && a.choices[a.answer].text === a.params.letter.toLowerCase());
    for (const t of ['add', 'sub', 'oddeven']) {
      const m = C.makeRound(t, { age: 7, lang, rng: new RT.RNG(s), roundIndex: 3 });
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
  const a = C.makeRound('shapes', { age: 4, lang: 'en', rng: new RT.RNG(42), roundIndex: 2 });
  const b = C.makeRound('shapes', { age: 4, lang: 'en', rng: new RT.RNG(42), roundIndex: 2 });
  assert.deepStrictEqual(a, b);
  const PIC = ['color', 'shape', 'number', 'dots', 'animal', 'letter', 'size'];
  for (const age of AGES) for (const topic of TOPICS) for (const lang of LANGS) for (let s = 0; s < 40; s++) {
    const t = C.makeTalk(topic, { age, lang, rng: new RT.RNG(s) });
    assert.strictEqual(t.promptKey, 'talk.' + topic);
    assert.ok(t.choices.length >= 2 && t.choices.length <= 3);
    assert.strictEqual(t.choices.filter(c => c.id === t.answerId).length, 1);
    assert.strictEqual(new Set(t.choices.map(c => c.value)).size, t.choices.length);
    if (age <= 5 && RT.AGE_POOLS[age].includes(topic)) assert.ok(t.choices.every(c => PIC.includes(c.kind)), topic + ' picture choices');
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

test('content: sea animals + clue ids (DESIGN §5.1); every animal has a word in en and vi (vi: cá, cua, rùa, cá voi, cá ngựa, cá heo, sứa, tôm)', () => {
  assert.deepStrictEqual(RT.ANIMALS, ['fish', 'crab', 'turtle', 'whale', 'seahorse', 'dolphin', 'jellyfish', 'shrimp']);
  assert.deepStrictEqual(RT.ANIMAL_SOUND, { crab: 'claws', turtle: 'shell', whale: 'spout', seahorse: 'tail', fish: null, dolphin: null, jellyfish: null, shrimp: null });
  assert.deepStrictEqual(C.SOUND_ANIMALS, ['crab', 'turtle', 'whale', 'seahorse']);
  assert.deepStrictEqual(RT.WORDS.en.map(w => w.animal), RT.ANIMALS);
  assert.deepStrictEqual(RT.WORDS.vi.map(w => w.animal), RT.ANIMALS);
  assert.deepStrictEqual(RT.WORDS.vi.map(w => w.word), ['cá', 'cua', 'rùa', 'cá voi', 'cá ngựa', 'cá heo', 'sứa', 'tôm']);
  assert.deepStrictEqual(RT.WORDS.en.map(w => w.word), RT.ANIMALS);
  for (const l of LANGS) for (const w of RT.WORDS[l]) assert.strictEqual(w.initial, w.word[0].toUpperCase().normalize('NFD')[0], w.word);
  assert.strictEqual(C.SMALL_SCALE, 0.72);
});

// ======================================================================== layout
const gbox = L => ({ l: L.tower.x - 90, t: L.goalY - L.goalH, r: L.tower.x + 90, b: L.goalY });   // crown + the cloud's top (180 wide)

test('layout: DESIGN §2 numbers (S 124/110, LW/LH, stand, drop zone, Pip, bubble, goal)', () => {
  let L = RT.World.computeLayout(1280, 720, null, {}, 4);
  assert.strictEqual(L.groundY, 692); assert.strictEqual(L.S, 124); assert.strictEqual(L.LW, 139); assert.strictEqual(L.LH, 99);
  assert.strictEqual(L.tower.x, 512); assert.strictEqual(L.tower.baseTop, 596); assert.strictEqual(L.tower.baseW, 199);
  assert.deepStrictEqual(L.drop, { x0: 512 - 129.5, x1: 512 + 129.5, y1: 606 });
  assert.deepStrictEqual(L.pip, { x: 120, y: 688, h: 330 });
  assert.deepStrictEqual(L.bubble, { x: 24, y: 18, w: 512 - 90 - 14 - 24, h: 122 });   // up to the goal box (visual QA P2-4)
  assert.strictEqual(L.goalY, 596 - 4 * 99 - 8); assert.deepStrictEqual(L.goal, { x: 512, y: L.goalY, cloudY: L.goalY - 18 });
  assert.strictEqual(L.goalH, 110);
  L = RT.World.computeLayout(960, 720, null, {}, 4); assert.strictEqual(L.pip.h, 300); assert.strictEqual(L.tower.x, 400);
  L = RT.World.computeLayout(1280, 720, null, {}, 5); assert.strictEqual(L.S, 110); assert.strictEqual(L.LW, 123); assert.strictEqual(L.LH, 88);
  assert.ok(5 * L.LH <= L.tower.baseTop - 150);
  L = RT.World.computeLayout(720, 1556, { top: 108, right: 0, bottom: 62, left: 0 }, {}, 4);
  assert.ok(L.portrait && L.tall); assert.strictEqual(L.groundY, 1556 - 62 - 40); assert.strictEqual(L.tower.x, 0.58 * 720);
  assert.strictEqual(L.tower.baseTop, L.groundY - L.LH - 150); assert.ok(4 * L.LH <= L.tower.baseTop - (108 + 364));
  assert.deepStrictEqual(L.pip, { x: 110, y: L.tower.baseTop + 70, h: 300 });
  assert.strictEqual(RT.World.computeLayout(720, 1036, { top: 21, right: 0, bottom: 18, left: 0 }, {}, 4).pip.y, RT.World.computeLayout(720, 1036, { top: 21, right: 0, bottom: 18, left: 0 }, {}, 4).tower.baseTop + 40, 'short portrait: Pip 30 px higher');
  assert.deepStrictEqual(L.bubble, { x: 24, y: 218, w: 720 - 48, h: 124 });
  L = RT.World.computeLayout(720, 1036, { top: 21, right: 0, bottom: 18, left: 0 }, {}, 4);   // iPad 820×1180
  assert.ok(L.portrait && !L.tall); assert.deepStrictEqual(L.bubble, { x: 24, y: 21 + 18, w: 720 - 160 - 14 - 24, h: 124 });
  L = RT.World.computeLayout(1561, 720, { top: 0, right: 108, bottom: 38, left: 108 }, {}, 5);   // iPhone landscape
  assert.strictEqual(L.S, 110, 'phone landscape S ' + L.S); assert.strictEqual(L.tower.baseTop, L.groundY - 96);
  for (const age of AGES) for (const v of VIEWPORTS) { const Q = RT.World.computeLayout(v.W, v.H, v.ins, {}, age); assert.ok(Q.LW === Math.round(1.12 * Q.S) && Q.LH === Math.round(0.80 * Q.S)); }
  const lg = RT.World.logicalSize(390, 844); assert.deepStrictEqual(lg, { W: 720, H: Math.round(720 / (390 / 844)) });
});

test('layout: every viewport (iPhone 393×852 / iPad 820×1180 both ways, insets) × age × 2–4 choices — slots clear of drop zone, HUD, bubble, Pip; the tallest cake + crown fit below the bubble / HUD', () => {
  for (const v of VIEWPORTS) for (const age of AGES) {
    const w = mkWorld({ age, vp: v }), L = w.layout, ins = L.ins, LW = L.LW, LH = L.LH;
    assert.ok(L.S >= 92 && L.S <= 124, v.name + ' S ' + L.S);
    assert.ok(L.S === (age <= 4 ? 124 : 110) || L.S >= 92, 'S rule');
    const hud = { l: L.W - ins.right - 160, t: -1e9, r: 1e9, b: ins.top + 96 };
    const drop = { l: L.drop.x0 - 44, t: -1e9, r: L.drop.x1 + 44, b: L.drop.y1 + 44 };
    const kb = w._pipBox(), pip = { l: kb.l, t: kb.t, r: kb.r, b: kb.b };
    for (const k of age === 3 ? [2] : age <= 5 ? [2, 3] : [2, 3, 4]) {   // the most choices an age gets (content: 2 / 3 / 4)
      const sl = RT.World.slotsFor(L, w.cfg, k);
      assert.strictEqual(sl.length, k, v.name + ' ' + k + ' slots');
      sl.forEach((s, i) => {
        const b = { l: s.x - LW / 2, t: s.y - LH / 2, r: s.x + LW / 2, b: s.y + LH / 2 }, tag = v.name + ' age ' + age + ' k' + k + ' slot ' + i;
        assert.ok(b.l >= ins.left && b.r <= L.W - ins.right && b.t >= ins.top && b.b <= L.groundY + 1, tag + ' on screen');
        assert.ok(!ovl(b, drop), tag + ' inside the drop zone');
        assert.ok(!ovl(b, hud), tag + ' under the HUD');
        assert.ok(!ovl(b, kbox(L.bubble)), tag + ' under the bubble');
        if (!L.portrait) assert.ok(!ovl(b, pip), tag + ' over Pip');
        sl.forEach((o, j) => { if (j > i) assert.ok(Math.abs(o.x - s.x) >= LW + 20 || Math.abs(o.y - s.y) >= LH + 20, tag + ' overlaps slot ' + j); });
      });
    }
    // the tallest cake + the crown on its cloud fit on screen, never under the bubble or the HUD
    const top = L.tower.baseTop - L.maxN * LH;
    assert.ok(top >= ins.top + 110, v.name + ' age ' + age + ' cake top ' + top);
    const cake = { l: L.tower.x - LW / 2, t: top, r: L.tower.x + LW / 2, b: L.tower.baseTop };
    assert.ok(!ovl(cake, kbox(L.bubble)) && !ovl(cake, hud), v.name + ' age ' + age + ' bubble / HUD over the cake');
    assert.ok(L.goalY - L.goalH >= ins.top - 2, v.name + ' crown fits (' + (L.goalY - L.goalH) + ')');
    assert.ok(!ovl(gbox(L), kbox(L.bubble)), v.name + ' age ' + age + ' bubble covers the crown');
    assert.ok(!ovl(gbox(L), hud), v.name + ' HUD covers the crown');
    if (!L.portrait) assert.ok(L.drop.x0 > kb.r + 20, v.name + ' Pip left of the drop zone');
    else for (const s of RT.World.slotsFor(L, w.cfg, age === 3 ? 2 : age <= 5 ? 3 : 4)) {   // Pip's feet ≥ 16 px above any tray layer under him
      if (s.x + LW / 2 > L.pip.x - 0.38 * L.pip.h && s.x - LW / 2 < L.pip.x + 0.38 * L.pip.h) assert.ok(L.pip.y + 16 <= s.y - LH / 2, v.name + ' age ' + age + ' Pip on the tray (' + (s.y - LH / 2 - L.pip.y).toFixed(0) + ' px)');
    }
    assert.ok(L.drop.x1 < L.W - ins.right && L.drop.x0 > ins.left, 'drop zone on screen');
    assert.ok(L.tower.baseW === LW + 60);
  }
});

test('layout: pieces in a round sit in their slots; the centre of every hit box picks its piece (nearest wins); Pip hit picks Pip', () => {
  for (const v of VIEWPORTS) for (const age of [3, 4, 6]) {
    const w = mkWorld({ age, vp: v }); roundOf(w, age >= 6 ? 'add' : 'colors', 3);
    for (const p of w.pieces) {
      const h = w.pieceHit(p.id); assert.strictEqual(w._hit(h.x, h.y), p, v.name + ' hit');
      assert.strictEqual(h.w, w.layout.LW + 32); assert.strictEqual(h.h, 2 * (0.6 * w.layout.S + 14));
      assert.ok(Math.abs(p.x - p.homeX) < 1e-6 && Math.abs(p.y - p.homeY) < 4);
      assert.strictEqual(w._hit(p.x + w.layout.LW / 2 + 15, p.y), p, 'wide hit box');
    }
    const kh = w.pipHit(); assert.strictEqual(w._hit(kh.x, kh.y), 'pip');
    assert.strictEqual(w.lulu, w.pip, 'alias');
  }
});

// ======================================================================== world
test('world: full scripted session per age through the pointer — wrong taps, misses, wrong bounces, right taps + drags; every event in order', () => {
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
        if (askN % 3 === 1 && Wp) {   // a wrong TAP: bubble lift → sinks → bonks off → drifts home
          const m0 = w.misses;
          assert.strictEqual(w.pointerDown(Wp.x, Wp.y), Wp.id); w.update(0.1); assert.strictEqual(w.pointerUp(Wp.x, Wp.y), 'drop');
          drainAll(); const l2 = all.slice(-2);
          assert.ok(l2[0].type === 'tapPiece' && l2[0].send === true && l2[1].type === 'drop' && l2[1].via === 'tap' && l2[1].right === false);
          until(w, () => w.phase === 'ask' && (Wp.state === 'rest' || !w.pieces.includes(Wp)));
          drainAll(); assert.strictEqual(w.misses, m0 + 1, 'a wrong tap is a miss'); assert.ok(all.some(e => e.type === 'wrong' && e.pieceId === Wp.id));
          w.update(CFG.wrongLock);
        }
        if (askN % 4 === 2) {
          const m0 = w.misses, Q = rightP(w);
          assert.strictEqual(drag(w, Q, w.layout.pip.x + 40, w.layout.groundY - 300), 'miss');
          drainAll(); assert.ok(all.some(e => e.type === 'miss' && e.pieceId === Q.id)); assert.strictEqual(w.misses, m0);
          until(w, () => Q.state === 'rest');
        }
        if (askN % 5 === 3 && wrongP(w)) {
          const X = wrongP(w);
          assert.strictEqual(dragToTower(w, X), 'drop');
          until(w, () => X.state === 'bounce' || X.state === 'home');
          drainAll(); assert.ok(all.some(e => e.type === 'wrong' && e.pieceId === X.id));
          until(w, () => w.phase === 'ask' && (X.state === 'rest' || !w.pieces.includes(X)));
          w.update(CFG.wrongLock);
        }
        if (askN % 7 === 5 && wrongP(w)) {
          for (let k = 0; k < 2; k++) { const X = wrongP(w); if (!X) break; dragToTower(w, X); until(w, () => w.phase === 'ask' && (X.state === 'rest' || !w.pieces.includes(X))); w.update(CFG.wrongLock); }
          drainAll(); assert.ok(w.hintHand || all.some(e => e.type === 'hint'));
        }
        const Rp = rightP(w), n0 = w._liveCount();
        if (askN % 2) assert.strictEqual(tapPiece(w, Rp), 'drop', 'tap to send');
        else assert.strictEqual(dragToTower(w, Rp, { ox: (askN % 3 - 1) * 15 }), 'drop');
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
    const want = ['round', 'deal', 'ask', 'grab', 'drop', 'trail', 'land', 'stack', 'towerDone', 'crown', 'crownOn', 'count', 'blow', 'pearlsOut', 'sprinkles', 'roundDone', 'clearBlock'];
    let k = r0; for (const t of want) { k = seq.indexOf(t, k); assert.ok(k >= 0, 'event ' + t + ' in order'); }
    k = seq.indexOf('tapPiece'); for (const t of ['drop', 'bubblePop', 'trail']) { k = seq.indexOf(t, k); assert.ok(k >= 0, 'tap → ' + t); }
    for (const t of ['tapPiece', 'bubblePop', 'trail', 'miss', 'wrong', 'hint', 'talk', 'talkResult', 'levelDone', 'sessionDone'].concat(age >= 4 ? ['gust'] : [])) assert.ok(cnt[t] > 0, 'age ' + age + ' saw ' + t);
    assert.ok(all.filter(e => e.type === 'land').every(e => e.sand === true), 'land.sand');
    for (const t of ['crown', 'crownOn', 'blow', 'pearlsOut', 'sprinkles']) assert.strictEqual(cnt[t], cnt.towerDone, t + ' once per cake');
    assert.strictEqual(cnt.towerDone, cnt.roundDone);
    assert.strictEqual(cnt.count, all.filter(e => e.type === 'towerDone').reduce((s, e) => s + e.n, 0));
    for (const t of ['monkey', 'bananas', 'bloom', 'butterfly', 'pokeLulu', 'cherry', 'cherryOn', 'candlesOut', 'bee', 'beeTap', 'pokeKoko']) assert.ok(!cnt[t], 'no old event ' + t);
  }
});

test('world: bot sessions at every age (breeze on in breezy chapters) — sessionDone, right stacks only, no stuck ask, ≤ 4 pieces, ≤ 5 layers, finite physics', () => {
  for (const age of AGES) for (const v of [VIEWPORTS[4], VIEWPORTS[2]]) for (const skill of [0.5, 1]) {
    const w = mkWorld({ age, vp: v, seed: 3 + age, surprise: true }), b = new RT.Bot(w, { skill, seed: 9 });
    let t = 0, ask = null, askT = 0, maxAsk = 0;
    while (w.state !== 'sessionDone' && t < 1500) {
      w.setBreeze(w.weather === 1 ? 0.85 : 0.1);
      b.step(1 / 30); w.update(1 / 30); t += 1 / 30;
      assert.ok(w.pieces.length <= 4 + 4, 'pieces ' + w.pieces.length);
      assert.ok(w.tower.blocks.length <= 5);
      for (const p of w.pieces) for (const k of ['x', 'y', 'rot', 'sx', 'sy', 'scale', 'alpha']) assert.ok(isFinite(p[k]), 'piece.' + k);
      assert.ok(isFinite(w.tower.theta) && Math.abs(w.tower.theta) <= CFG.swayMax + 1e-9, 'theta ' + w.tower.theta);
      const cp = w.crownPose(); if (cp) assert.ok(isFinite(cp.x + cp.y + cp.rot + cp.sy), 'crown');
      for (let j = 0; j < w.pearls.length; j++) { const q = w.pearlPose(j); if (q) assert.ok(isFinite(q.x + q.y + q.s + q.lit + q.out)); }
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
    const w = mkWorld({ age: 4, seed: 100 + s, vp: VIEWPORTS[s % VIEWPORTS.length], surprise: true }), b = new RT.Bot(w, { skill: 0.8, seed: s });
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

test('world: deal — the jellyfish + crown swim in from the top (soft overshoot, bob, pulse), blocks drift down 300 px into their slots (fade in, rock, stagger 0.08 s, soft settle); ask after all rest', () => {
  const w = mkWorld({ age: 4 });
  w.levels = ['colors', 'colors', 'colors', 'colors']; w.startLevel(0); w.round = 2; w._beginRound();
  const e0 = evs(w); assert.ok(e0.some(e => e.type === 'round' && e.n === 3));
  const G = w.goal; assert.strictEqual(G.state, 'float'); assert.ok(G.cloudY < 0 && G.crownY < 0, 'starts above the screen');
  let maxDown = -1e9;
  until(w, () => w.pieces.length > 0);
  const e1 = evs(w).find(e => e.type === 'deal'); assert.ok(e1 && e1.pieces.length === 3);
  assert.ok(w.pieces.every(p => p.state === 'in' && Math.abs(p.y - (p.homeY - CFG.dealFrom)) < 12 && p.alpha < 0.1), 'start dealFrom above, invisible');
  assert.strictEqual(w.pointerDown(w.pieces[0].homeX, w.pieces[0].homeY), null, 'no grab during the deal');
  const landT = [], minSy = {}, maxRot = {}, maxVy = {};
  until(w, () => {
    maxDown = Math.max(maxDown, G.dy);
    for (const p of w.pieces) {
      minSy[p.id] = Math.min(minSy[p.id] || 1, p.sy); maxRot[p.id] = Math.max(maxRot[p.id] || 0, Math.abs(p.rot));
      if (p.state === 'in') { maxVy[p.id] = Math.max(maxVy[p.id] || 0, p.vy); assert.ok(p.y <= p.homeY + 1e-6, 'never below its slot'); }
      if (p.state === 'rest' && landT[p.slot] === undefined) landT[p.slot] = w.time;
    }
    return w.phase === 'ask';
  });
  assert.ok(Math.abs(landT[1] - landT[0] - 0.08) < 0.03 && Math.abs(landT[2] - landT[1] - 0.08) < 0.03, 'stagger ' + landT);
  for (const id in minSy) {
    assert.ok(minSy[id] < 0.97 && minSy[id] > 0.9, 'soft settle ' + minSy[id]);
    assert.ok(maxRot[id] > 0.02 && maxRot[id] <= CFG.dealRock + 1e-9, 'rocks ' + maxRot[id]);
    assert.ok(maxVy[id] < 1000, 'drifts (max ' + maxVy[id].toFixed(0) + ' px/s)');
  }
  const a = evs(w).find(e => e.type === 'ask'); assert.ok(a && a.answerId === w.answerId());
  run(w, 1.5, () => { maxDown = Math.max(maxDown, G.dy); });
  assert.ok(maxDown > 2 && maxDown < 40, 'soft overshoot ' + maxDown.toFixed(1));
  assert.ok(Math.abs(G.dy) < 2, 'the jellyfish settled');
  let lo = 1e9, hi = -1e9, plo = 1, phi = 0; run(w, 1.2, () => { lo = Math.min(lo, G.cloudY); hi = Math.max(hi, G.cloudY); plo = Math.min(plo, G.pulse); phi = Math.max(phi, G.pulse); });
  assert.ok(hi - lo > 6 && hi - lo < 9.5, 'bob ' + (hi - lo).toFixed(1));
  assert.ok(plo < 0.05 && phi > 0.95, 'goal.pulse 0..1');
  assert.ok(Math.abs(G.crownY - G.cloudY - CFG.cloudLift) < 1e-6, 'the crown sits on the jellyfish');
  const cp = w.cloudPose(1); assert.ok(cp && cp.alpha === 1 && cp.x === w.layout.tower.x && cp.pulse === G.pulse);
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
  const q = wrongP(w), tx = q.x, ty = q.y; w.tapMoveMin = 40; w.pointerDown(tx, ty); w.pointerMove(tx + 30, ty); w.update(0.1); assert.strictEqual(w.pointerUp(tx + 30, ty), 'drop', '30 px is a tap (send) with tapMoveMin 40');
  until(w, () => w.phase === 'ask' && q.state === 'rest'); run(w, CFG.wrongLock);
  w.tapMoveMin = 0; w.pointerDown(q.x, q.y); w.pointerMove(q.x + 30, q.y); w.update(0.1); assert.strictEqual(w.pointerUp(q.x + 30, q.y), 'miss', '…and a drag with the default 24');
});

test('world: tap vs drag — < 24 px and < 0.35 s is a TAP (tapPiece send:true → drop via tap, the block is sent); longer or farther is a drag (miss / drop)', () => {
  const w = mkWorld({ age: 4 }); roundOf(w, 'colors', 2);
  const p = wrongP(w), x0 = p.x, y0 = p.y;
  w.pointerDown(x0, y0); w.pointerMove(x0 + 20, y0); w.update(0.2);
  assert.strictEqual(w.pointerUp(x0 + 20, y0), 'drop');
  let e = evs(w); assert.ok(e.some(x => x.type === 'tapPiece' && x.pieceId === p.id && x.nameKind === 'color' && x.send === true && x.right === false));
  assert.ok(e.some(x => x.type === 'drop' && x.via === 'tap' && x.pieceId === p.id && !x.assisted));
  assert.ok(!e.some(x => x.type === 'grab'), 'a tap is not a grab');
  assert.strictEqual(p.state, 'lift');
  until(w, () => w.phase === 'ask' && p.state === 'rest'); run(w, CFG.wrongLock);
  assert.strictEqual(w.misses, 1, 'a wrong tap counts as a miss'); evs(w);
  w.pointerDown(p.x, p.y); w.update(0.4); assert.strictEqual(w.pointerUp(p.x, p.y), 'miss', 'a long press is not a tap');
  e = evs(w); assert.ok(e.some(x => x.type === 'grab') && e.some(x => x.type === 'miss'));
  until(w, () => p.state === 'rest');
  const x1 = p.x, y1 = p.y; w.pointerDown(x1, y1); w.pointerMove(x1, y1 - 30); w.update(0.1); assert.strictEqual(w.pointerUp(x1, y1 - 30), 'miss', 'moved 30 px');
  assert.strictEqual(w.misses, 1, 'grass releases are not mistakes');
});

test('world: tap to send — the right block rides a bubble (0.55 s ease-in-out arc, apex above the drop point, not grabbable), bubblePop at dropPoint, sinks (trail every 0.09 s), lands with sand; cancelDrag / taps while lifting are harmless', () => {
  for (const vp of [VIEWPORTS[8], VIEWPORTS[3], VIEWPORTS[4]]) for (const age of [3, 4, 6]) {
    const w = mkWorld({ age, vp }); roundOf(w, age >= 6 ? 'add' : 'colors', 2);
    const R = rightP(w), n0 = w._liveCount(), dp0 = w.dropPoint(), y0 = R.y; evs(w);
    assert.strictEqual(tapPiece(w, R), 'drop');
    let e = evs(w); assert.deepStrictEqual(e.map(x => x.type).filter(t => t !== 'trail'), ['tapPiece', 'drop'], JSON.stringify(e.map(x => x.type))); assert.ok(e[0].right && e[1].right && e[1].via === 'tap');
    assert.strictEqual(R.state, 'lift'); assert.strictEqual(w.phase, 'drop'); assert.strictEqual(w.answerId(), R.id);
    let minY = 1e9, maxB = 0, liftT = 0, popAt = null, trails = [], landE = null, bub0 = null;
    const W2 = w.pieces.find(q => q !== R && q.state === 'rest');
    until(w, () => {
      if (R.state === 'lift') {
        liftT += H; minY = Math.min(minY, R.y); maxB = Math.max(maxB, R.bubble);
        if (bub0 === null) bub0 = R.bubble;
        const h = w.pieceHit(R.id); assert.notStrictEqual(w.pointerDown(h.x, h.y), R.id, 'not grabbable while lifting'); w.cancelDrag();
        if (W2 && W2.state === 'rest') { assert.notStrictEqual(w.pointerDown(W2.x, W2.y), W2.id, 'one block at a time'); w.pointerUp(W2.x, W2.y); }
      }
      for (const x of w.drainEvents()) {
        if (x.type === 'bubblePop') { popAt = { t: w.time, x: x.x, y: x.y }; assert.strictEqual(x.pieceId, R.id); }
        if (x.type === 'trail') trails.push(w.time);
        if (x.type === 'land') landE = x;
      }
      return !!landE;
    });
    assert.ok(Math.abs(liftT - CFG.sendTime) < 0.03, 'lift ' + liftT.toFixed(2));
    assert.ok(bub0 < 0.2 && maxB === 1, 'the bubble wraps it (' + bub0 + ' → ' + maxB + ')');
    const dp = w.dropPoint();
    assert.ok(popAt && Math.abs(popAt.x - dp0.x) < 15 && Math.abs(popAt.y - dp0.y) < 15, 'pops at the drop point');
    assert.ok(minY < Math.min(y0, popAt.y) - 20, 'the arc goes over the drop point (apex ' + (popAt.y - minY).toFixed(0) + ' px above)');
    assert.ok(trails.length >= 6, 'trail events ' + trails.length);
    for (let i = 1; i < trails.length; i++) assert.ok(trails[i] - trails[i - 1] < 0.2, 'trail gaps');
    assert.ok(landE.sand === true && landE.pieceId === R.id); assert.strictEqual(w._liveCount(), n0 + 1); void dp;
    const b = w.tower.blocks[w._liveCount() - 1]; assert.ok(Math.abs(b.sy - (1 - CFG.landSquash)) < 0.02, 'plonk squash ' + b.sy);
  }
  // rotation mid-lift: completes at once (right → lands, wrong → home), no stuck state
  for (const right of [true, false]) {
    const w = mkWorld({ age: 4 }); roundOf(w, 'colors', 2);
    const P0 = right ? rightP(w) : wrongP(w), n0 = w._liveCount();
    tapPiece(w, P0); run(w, 0.2); assert.strictEqual(P0.state, 'lift');
    const L = w.layout; w.setViewport(L.H, L.W, { top: 47, right: 0, bottom: 34, left: 0 });
    const e = evs(w); assert.ok(e.some(x => x.type === 'bubblePop'));
    if (right) { assert.strictEqual(w._liveCount(), n0 + 1); assert.ok(e.some(x => x.type === 'land')); untilPhase(w, 'ask'); }
    else { assert.ok(e.some(x => x.type === 'wrong')); assert.strictEqual(P0.state, 'rest'); assert.strictEqual(w.phase, 'ask'); }
    assert.ok(w.pieces.every(q => q.state !== 'lift' && q.state !== 'fall'));
  }
});

test('world: drop → sinks through water (gWater 900, terminal 420 px/s, leaf rocking ≤ 0.12 rad fading near the top) onto the top within ± 0.18·LW, plonk squash 0.82 → settle, the block below compresses, the tower sways (≤ 0.12 rad) and settles', () => {
  for (const off of [-80, 0, 45, 200]) {
    const w = mkWorld({ age: 5, seed: 4 }); roundOf(w, 'shapes', 3);
    for (let k = 0; k < 4; k++) {
      const p = rightP(w), LW = w.layout.LW, top = w.towerTop();
      const d = w.dropPoint();
      const r = drag(w, p, Math.min(w.layout.drop.x1 - 2, Math.max(w.layout.drop.x0 + 2, d.x + off)), d.y - 120);
      assert.strictEqual(r, 'drop');
      assert.strictEqual(p.state, 'fall');
      const y0 = p.y, t0 = w.time; let landed = null, maxV = 0, maxRot = 0, cx = null;
      const n0 = w._liveCount(), below0 = n0 ? w.tower.blocks[n0 - 1].sy : 1;
      until(w, () => {
        if (p.state === 'fall') { maxV = Math.max(maxV, p.vy); if (p.ft > 0.3) maxRot = Math.max(maxRot, Math.abs(p.rot)); cx = p.x; }
        const e = w.events.find(x => x.type === 'land'); if (e) landed = e; return !!landed;
      });
      const T = w.time - t0, hgt = top.y - p.bh / 2 - y0;
      assert.ok(maxV <= CFG.vTerm + 1 && maxV > 0.6 * CFG.vTerm, 'terminal speed ' + maxV.toFixed(0));
      assert.ok(T >= hgt / CFG.vTerm && T < hgt / CFG.vTerm + 1.5 * CFG.vTerm / CFG.gWater + 0.1, 'sinks slowly (' + T.toFixed(2) + ' s over ' + hgt.toFixed(0) + ' px)');
      assert.ok(maxRot > 0.03 && maxRot <= CFG.rockA + 1e-9, 'leaf rocking ' + maxRot.toFixed(3));
      assert.ok(Math.abs(cx - top.x) <= 0.18 * LW + 2, 'contact within ±0.18·LW (' + (cx - top.x).toFixed(1) + ')');
      const b = w.tower.blocks[w._liveCount() - 1], below = w.tower.blocks[w._liveCount() - 2];
      assert.ok(Math.abs(b.dx - (below ? below.dx : 0)) <= 0.18 * LW + 1e-6, 'within ±0.18·LW');
      assert.ok(Math.abs(b.sy - 0.82) < 0.02, 'squash 0.82 at landing (' + b.sy.toFixed(3) + ')');
      if (below) assert.ok(below._q > 0.02 && below._q <= 0.06 + 0.05 + 1e-9 || below0 < 1, 'the block below compresses');
      assert.ok(landed.impact > 0 && landed.impact <= 1 && landed.n === w._liveCount() && landed.sand);
      evs(w);
      let maxSy = 0, peak = 0;
      for (let i = 0; i < 300; i++) { w.update(H); maxSy = Math.max(maxSy, b.sy); peak = Math.max(peak, Math.abs(w.tower.theta)); }
      assert.ok(maxSy > 1.02 && maxSy < 1.1, 'soft stretch ' + maxSy.toFixed(3));
      assert.ok(Math.abs(b.sy - 1) < 0.01, 'settled (' + b.sy.toFixed(3) + ')');
      assert.ok(peak > 0.005 && peak <= 0.12 + 1e-9, 'sway peak ' + peak);
      if (w.phase === 'done') break;
      untilPhase(w, 'ask');
    }
    run(w, 3);
    assert.ok(Math.abs(w.tower.theta) < 0.01, 'settles ' + w.tower.theta);
  }
});

test('world: water fall lands within tolerance at every age × viewport — taps, drags released anywhere in the drop zone (high, low beside the tower → bubble lift), flicks', () => {
  const R = new RT.RNG(55);
  let n = 0, maxOff = 0;
  for (const v of VIEWPORTS) for (const age of AGES) {
    const w = mkWorld({ age, vp: v, seed: 90 + age }); roundOf(w, age >= 6 ? 'add' : 'colors', 3);
    while (w.phase !== 'done') {
      untilPhase(w, 'ask', 20000);
      const p = rightP(w), L = w.layout, D = L.drop, top = w.towerTop(), mode = R.int(0, 3);
      let res;
      if (mode === 0) res = tapPiece(w, p);
      else if (mode === 1) res = drag(w, p, R.float(D.x0 - 30, D.x1 + 30), R.float(L.ins.top + 20, w.dropPoint().y));
      else if (mode === 2) res = drag(w, p, R.float(D.x0, D.x1), R.float(Math.min(top.y + 20, D.y1 - 30), D.y1 - 5), { hold: 0.05 });   // low, beside the tower
      else res = drag(w, p, R.float(D.x0, D.x1), w.dropPoint().y - 60, { steps: 2, dt: 0.016, hold: 0 });   // a flick
      assert.strictEqual(res, 'drop', v.name + ' age ' + age + ' mode ' + mode);
      let cx = null;
      until(w, () => { if (p.state === 'fall') cx = p.x; for (const q of [p.x, p.y, p.rot, p.vy]) assert.ok(isFinite(q)); return w.events.some(e => e.type === 'land'); });
      const off = Math.abs(cx - w.towerTop().x) / L.LW; maxOff = Math.max(maxOff, off);
      assert.ok(off <= CFG.landWithin + 0.03, v.name + ' age ' + age + ' mode ' + mode + ' contact off ' + off.toFixed(3) + '·LW');
      evs(w); n++;
      until(w, () => w.phase === 'deal' || w.phase === 'done' || w.phase === 'ask');
    }
  }
  console.log('     (' + n + ' landings, max contact offset ' + maxOff.toFixed(3) + '·LW)');
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

test('world: wrong → bounce off (restitution 0.45, kick towards home, spin), drift home; lock 1.3 s (locked); 2nd miss → hint + ghost hand', () => {
  const w = mkWorld({ age: 4 }); roundOf(w, 'colors', 2);
  const X = wrongP(w), R = rightP(w);
  assert.strictEqual(dragToTower(w, X), 'drop');
  let vIn = 0, vOut = null;
  until(w, () => { if (X.state === 'fall') vIn = X.vy; if (X.state === 'bounce' && vOut === null) vOut = X.vy; return X.state === 'bounce'; });
  assert.ok(Math.abs(vOut / vIn + 0.45) < 0.08, 'restitution ' + (vOut / vIn).toFixed(2));
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
  let hy0 = 1e9, hy1 = -1e9, pressed = false;
  run(w, 1.0, () => { const Hh = w.hintHand; assert.ok(Hh.tap === true); assert.ok(Math.abs(Hh.x - R.x) < 0.3 * w.layout.LW, 'the hand is on the piece'); hy0 = Math.min(hy0, Hh.y); hy1 = Math.max(hy1, Hh.y); pressed = pressed || Hh.press; });
  assert.ok(hy1 - hy0 > 20 && pressed, 'the hand taps (bob ' + (hy1 - hy0).toFixed(0) + ' px)');
  assert.ok(R.glow > 0.8, 'the right block glows');
  const g = R; w.pointerDown(g.x, g.y); w.pointerMove(g.x, g.y - 40); assert.strictEqual(w.hintHand, null); w.cancelDrag();
});

test('world: stars per cake 3 / 2 / 1 for 0 / 1 / ≥ 2 wrong drops; cakes of ≥ 3 layers forgive one slip (2-layer cakes do not)', () => {
  for (const [ri, wrongN, want] of [[0, 0, 3], [0, 1, 2], [0, 2, 1], [2, 0, 3], [2, 1, 3], [2, 2, 2], [2, 3, 1], [3, 1, 3], [3, 2, 2], [3, 3, 1]]) {
    const w = mkWorld({ age: 4 }); roundOf(w, 'colors', ri);
    assert.strictEqual(w.cur.n, [2, 2, 3, 4][ri]);
    let left = wrongN;
    while (w.phase !== 'done') {
      untilPhase(w, 'ask');
      if (left > 0 && wrongP(w)) { const X = wrongP(w); dragToTower(w, X); until(w, () => (X.state === 'rest' || !w.pieces.includes(X))); run(w, CFG.wrongLock + 0.05); left--; continue; }
      dragToTower(w, rightP(w)); until(w, () => w.phase === 'deal' || w.phase === 'done');
    }
    until(w, () => w.events.some(e => e.type === 'roundDone'));
    const e = w.drainEvents().find(x => x.type === 'roundDone');
    assert.strictEqual(e.stars, want, 'cake of ' + w.cur.n + ', ' + wrongN + ' wrong');
    assert.strictEqual(e.misses, wrongN);
  }
});

test('world: idle nudges at 12 s, then ×1.5 up to 30 s (12, 18, 27, 30); every idle hints; a real grab resets; Pip taps do not (3rd glows); resetNudges', () => {
  const w = mkWorld({ age: 4 }); roundOf(w, 'colors', 2); evs(w);
  run(w, 12.05); let e = evs(w); assert.ok(e.some(x => x.type === 'idle' && x.n === 1)); assert.ok(e.some(x => x.type === 'hint' && x.idle), 'the 1st idle hints');
  run(w, 18); e = evs(w); assert.ok(e.some(x => x.type === 'idle' && x.n === 2)); assert.ok(e.some(x => x.type === 'hint' && x.idle));
  run(w, 27); assert.ok(evs(w).some(x => x.type === 'idle' && x.n === 3), 'gap 27 s');
  run(w, 29.5); assert.ok(!evs(w).some(x => x.type === 'idle')); run(w, 0.6); assert.ok(evs(w).some(x => x.type === 'idle' && x.n === 4), 'gap capped at 30 s');
  w.resetNudges(); run(w, 11); assert.ok(!evs(w).some(x => x.type === 'idle'));
  const p = wrongP(w); w.pointerDown(p.x, p.y); w.pointerMove(p.x, p.y - 50); run(w, 0.2); w.cancelDrag();
  run(w, 11); assert.ok(!evs(w).some(x => x.type === 'idle'), 'the grab reset the clock');
  const w2 = mkWorld({ age: 4 }); roundOf(w2, 'colors', 2); evs(w2);
  const K = w2.pipHit();
  for (let i = 0; i < 3; i++) { assert.strictEqual(w2.pointerDown(K.x, K.y), 'pip'); run(w2, 0.1); assert.strictEqual(w2.pointerUp(K.x, K.y), 'pokePip'); run(w2, 2); }
  e = evs(w2); assert.strictEqual(e.filter(x => x.type === 'pokePip').length, 3); assert.ok(e.some(x => x.type === 'hint'), '3rd Pip tap hints');
  assert.strictEqual(e.filter(x => x.type === 'hint').length, 1, 'only the 3rd');
  assert.ok(e.find(x => x.type === 'pokePip').promptKey === 'p.colors');
  run(w2, 6.5); assert.ok(evs(w2).some(x => x.type === 'idle'), 'Pip taps did not reset idle');
  w2.pointerDown(K.x, K.y); run(w2, 0.5); assert.strictEqual(w2.pointerUp(K.x, K.y), null);
});

test('world: a child who only taps — wrong taps are gentle misses (2nd hints), a right tap stacks (no assist); 3rd tap on the water hints, a tap on the tower sends the hinted block (assist); grace assist; tapper / spammer finish', () => {
  const w = mkWorld({ age: 3 }); roundOf(w, 'colors', 3); evs(w);
  const R = rightP(w), X = wrongP(w);
  // a wrong tap = an answer: it bonks off and drifts home (a miss: the 2nd one hints); a right tap stacks it (no assist)
  const tapWrong = () => { assert.strictEqual(tapPiece(w, X), 'drop'); until(w, () => w.phase === 'ask' && X.state === 'rest'); run(w, CFG.wrongLock + 0.05); };
  tapWrong(); assert.ok(!evs(w).some(e => e.type === 'hint'), 'no hint after 1 miss');
  tapWrong(); const e = evs(w); assert.ok(e.some(x => x.type === 'hint' && x.pieceId === R.id), '2nd wrong tap hints');
  const n0 = w._liveCount();
  assert.strictEqual(tapPiece(w, R), 'drop');
  assert.ok(evs(w).some(x => x.type === 'drop' && !x.assisted && x.via === 'tap'), 'a tap on the hinted block is a normal answer');
  let apex = 1e9; until(w, () => { apex = Math.min(apex, R.y); return w._liveCount() === n0 + 1; });
  assert.ok(apex < w.towerTop().y - 0.5 * w.layout.LH, 'lifts up over the tower');
  assert.ok(evs(w).some(x => x.type === 'stack'));
  assert.strictEqual(w.assists, 0);
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
  const rd = w.drainEvents().find(x => x.type === 'roundDone'); assert.ok(rd.assists >= 1 && rd.misses === 2 && rd.stars === w._starsFor(rd.misses + rd.assists), 'assisted stacks count like misses');
  const w3 = mkWorld({ age: 4 }); roundOf(w3, 'colors', 2); evs(w3);
  const Q3 = rightP(w3), L3 = w3.layout;
  assert.strictEqual(drag(w3, Q3, L3.pip.x + 40, L3.groundY - 300), 'miss', 'not hinted yet: a plain miss');
  until(w3, () => Q3.state === 'rest'); w3.hint(); evs(w3);
  const n3 = w3._liveCount();
  assert.strictEqual(drag(w3, Q3, L3.pip.x + 40, L3.groundY - 300), 'drop');
  assert.ok(evs(w3).some(x => x.type === 'drop' && x.assisted && x.via === 'grace'));
  until(w3, () => w3._liveCount() === n3 + 1);
  untilPhase(w3, 'ask', 20000); w3.hint(); const X3 = wrongP(w3); assert.strictEqual(drag(w3, X3, L3.pip.x + 40, L3.groundY - 300), 'miss');
  for (const mode of ['tapper', 'spammer']) {
    const v = mkWorld({ age: 4, seed: 8 }), r = new RT.RNG(3); let next = 0;
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

test('world: tower done — towerDone → crown (starfish) plops on (squash, the jellyfish swims up and away) → count 1…n every 0.45 s with pearl i popping + lighting → blow (Pip) → pearlsOut → sprinkles → roundDone (≈ 3.6 s) → clear top first, the blocks float up and away in bubbles, the crown with the top one', () => {
  const w = mkWorld({ age: 5 });
  let minCsy = 1, sawBlowMood = false, cloudGone = false, crownOnTop = 1e9, litAtBlow = null, crownFlyX = [];
  const st = { blowSeen: false };
  const log = doneLog(w, 2, 'colors', L => {
    const G = w.goal;
    if (G) minCsy = Math.min(minCsy, G.csy);
    if (w.pip.mood === 'blow') sawBlowMood = true;
    if (G && G.state === 'on' && G.cloudA === 0 && G.swimY < -CFG.jellyUp + 1) cloudGone = true;
    if (G && G.state === 'on' && w.phase === 'done') { const c = w.crownPose(1), t = w._onTop(w.layout.crownOff, 0, 1); crownOnTop = Math.min(crownOnTop, -Math.abs(c.y - t.y) - Math.abs(c.x - t.x)); }
    if (!st.blowSeen && L.some(x => x[0] === 'blow')) { st.blowSeen = true; litAtBlow = w.pearls.map(c => c.lit); }
    if (w.phase === 'clear' && G) { const c = w.crownPose(1); if (c) crownFlyX.push(c.y); }
  });
  const ty = log.map(x => x[0]), ix = t => ty.indexOf(t), at = t => log.find(x => x[0] === t)[1];
  assert.strictEqual(log[0][0], 'towerDone'); assert.strictEqual(log[0][2].n, 4);
  const order = ['towerDone', 'crown', 'crownOn', 'count', 'blow', 'pearlsOut', 'sprinkles', 'roundDone', 'clearBlock', 'round'];
  for (let i = 1; i < order.length; i++) assert.ok(ix(order[i - 1]) < ix(order[i]), order[i - 1] + ' before ' + order[i]);
  assert.ok(ix('crownOn') < ix('count'), 'the crown is on before counting');
  const counts = log.filter(x => x[0] === 'count');
  assert.deepStrictEqual(counts.map(x => x[2].i), [1, 2, 3, 4]);
  for (let i = 1; i < 4; i++) { assert.ok(Math.abs(counts[i][1] - counts[i - 1][1] - CFG.countStep) < 0.02); assert.ok(counts[i][2].y < counts[i - 1][2].y, 'bottom → top'); }
  assert.ok(counts.every(c => isFinite(c[2].cx + c[2].cy)), 'pearl position on the count event');
  assert.ok(ix('blow') > ty.lastIndexOf('count'));
  assert.ok(minCsy < 0.8, 'crown squash ' + minCsy.toFixed(2)); assert.ok(cloudGone, 'the jellyfish swam up and away');
  assert.ok(crownOnTop > -1.5, 'the crown rides the top (' + crownOnTop.toFixed(2) + ')');
  assert.ok(sawBlowMood, 'Pip blows'); assert.ok(litAtBlow && litAtBlow.length === 4 && litAtBlow.every(l => l > 0.99), 'all pearls lit before the blow ' + litAtBlow);
  const bl = log.find(x => x[0] === 'blow')[2]; assert.ok(bl.x < bl.tx, 'Pip blows towards the cake');
  const tDone = at('roundDone') - at('towerDone');
  assert.ok(tDone > 3.3 && tDone < 3.9, 'done ≈ 3.6 s (' + tDone.toFixed(2) + ')');
  assert.ok(at('pearlsOut') - at('blow') > 0.3 && at('sprinkles') > at('pearlsOut'));
  const cl = log.filter(x => x[0] === 'clearBlock');
  assert.ok(cl.every(x => x[2].y > 0), 'clear events');
  assert.deepStrictEqual(cl.map(x => x[2].i), [4, 3, 2, 1], 'top first');
  assert.ok(crownFlyX.length > 5 && crownFlyX[crownFlyX.length - 1] < crownFlyX[0] - 50, 'the crown floats up and away with the top block');
  assert.strictEqual(w.goal.state, 'float', 'the next cake has a new crown'); assert.strictEqual(w.pearls.length, 0);
});

test('world: pearls — one per layer (n = 2…5) at World.pearlOffsets, pop with an overshoot, light, go out after the blow', () => {
  for (const [age, ri, n] of [[3, 0, 2], [4, 2, 3], [5, 2, 4], [6, 3, 5]]) {
    const w = mkWorld({ age, seed: 2 + n });
    let maxPop = 0, outEnd = 0, cand = null;
    const log = doneLog(w, ri, age >= 6 ? 'add' : 'colors', () => {
      if (w.phase === 'done' && w.pearls.length) { cand = w.pearls.map(c => c.x); maxPop = Math.max(maxPop, ...w.pearls.map(c => c.pop)); outEnd = Math.min(...w.pearls.map(c => c.out)); }
    });
    assert.strictEqual(log[0][2].n, n);
    assert.strictEqual(cand.length, n, 'pearls = blocks');
    assert.deepStrictEqual(cand, RT.World.pearlOffsets(n, w.layout).slice());
    assert.ok(maxPop > 1.1 && maxPop < 1.4, 'pop overshoot ' + maxPop.toFixed(2));
    assert.ok(outEnd > 0.5, 'pearls going out before the clear (' + outEnd.toFixed(2) + ')');
    assert.strictEqual(log.filter(x => x[0] === 'count').length, n);
  }
});

test('world: pearl i hangs on block i’s LEFT side, outside the face (visual P2-1: never over numerals / dots, clear of the crown and of Pip; ball ≥ 14 CSS px on iPhone portrait) — every viewport × age; counting goes bottom → top; n = 1 works', () => {
  for (const v of VIEWPORTS) for (const age of AGES) {
    const L = RT.World.computeLayout(v.W, v.H, v.ins, {}, age), LW = L.LW, cx = L.crownOff;
    assert.ok(cx + 32 <= LW / 2 + 1, v.name + ' crown on the top');
    const xs = RT.World.pearlOffsets(5, L), h = xs.h, r = xs.r, tag = v.name + ' age ' + age;
    const css = Math.min(v.W, v.H) === 720 && v.W < v.H && /iPhone/.test(v.name) ? 393 / 720 : 0;   // iPhone portrait CSS px per logical px
    assert.ok(h === L.pearlH && 2 * r >= 0.28 * L.LH, tag + ' pearl ' + h + ' px, ball ' + (2 * r).toFixed(1));
    if (css) assert.ok(2 * r * css >= 14, tag + ' ball ' + (2 * r * css).toFixed(1) + ' CSS px');
    assert.ok(Math.abs(xs.y - CFG.pearlBallY * h) < 1e-9, tag + ' ball centred on the block height');
    for (const x of xs) {
      assert.ok(x + r <= -0.42 * LW, tag + ' the ball stays off the face (labels / dots reach ±0.42·LW): ' + (x + r).toFixed(0));
      assert.ok(x < -LW / 2 && x + r > -LW / 2, tag + ' touches the left edge');
      assert.ok(r <= 0.45 * L.LH, tag + ' fits the block height');
      const left = L.tower.x + x - 0.2 * h, pipR = L.pip.x + CFG.pipHalfW * L.pip.h;
      assert.ok(left > pipR && left > L.ins.left, tag + ' clear of Pip and the screen edge (' + left.toFixed(0) + ' vs ' + pipR.toFixed(0) + ')');
    }
  }
  const w = mkWorld({ age: 4, config: { blocksByRound: [1, 1, 1, 1] } });
  const log = doneLog(w, 0, 'colors');
  assert.strictEqual(log[0][2].n, 1); assert.ok(log.some(x => x[0] === 'blow'));
  const w2 = mkWorld({ age: 5 }); let ys = null, rel = [];
  doneLog(w2, 2, 'colors', () => {
    if (w2.phase === 'done' && w2.pearls.length === 4 && w2.pearls.every(c => c.pop > 0.5) && !ys) {
      ys = w2.pearls.map((c, j) => w2.pearlPose(j, 1).y);
      rel = w2.pearls.map((c, j) => { const q = w2.pearlPose(j, 1), b = w2.blockPose(j, 1); return [q.x - b.x, q.y - b.y]; });
    }
  });
  for (let j = 1; j < 4; j++) assert.ok(ys[j] < ys[j - 1] - 0.8 * w2.layout.LH, 'pearl j on block j (bottom → top)');
  for (const [dx, dy] of rel) { assert.ok(dx < -w2.layout.LW / 2 && dx > -w2.layout.LW / 2 - w2.layout.pearlH * 0.3, 'just left of the block ' + dx.toFixed(0)); assert.ok(Math.abs(dy - CFG.pearlBallY * w2.layout.pearlH) < 4, 'base below the centre (ball centred)'); }
});

test('world: errorless fade — from the 3rd wrong drop on one ask the wrong layers puff away (fadeWrong), only the right one is left; hints as before; the next ask has all its choices', () => {
  const w = mkWorld({ age: 5 }); roundOf(w, 'colors', 2); evs(w);
  assert.strictEqual(w.pieces.filter(p => p.askIdx === w.ask).length, 3);
  const R = rightP(w); let hints = 0;
  for (let k = 0; k < 3; k++) {
    const X = wrongP(w); assert.ok(X, 'a wrong layer ' + k);
    if (k === 2) { const others = w.pieces.filter(p => p !== X && !p.right && p.askIdx === w.ask); assert.ok(others.length >= 1); }
    dragToTower(w, X); until(w, () => w.phase === 'ask' && (X.state === 'rest' || !w.pieces.includes(X))); run(w, CFG.wrongLock + 0.05);
    const e = evs(w); hints += e.filter(x => x.type === 'hint').length;
    if (k < 2) { assert.ok(X.state === 'rest', 'no fade before the 3rd'); assert.ok(!e.some(x => x.type === 'fadeWrong')); }
    else assert.ok(e.some(x => x.type === 'fadeWrong' && x.ask === w.ask), 'fadeWrong event');
  }
  run(w, 0.5);
  assert.deepStrictEqual(w.pieces.filter(p => p.askIdx === w.ask).map(p => p.id), [R.id], 'only the right layer is left');
  assert.ok(hints >= 1 && R._hinted, 'hinted');
  assert.strictEqual(w.misses, 3);
  dragToTower(w, R); until(w, () => w.phase === 'deal' || w.phase === 'done'); untilPhase(w, 'ask');
  assert.strictEqual(w.pieces.filter(p => p.askIdx === w.ask && p.state === 'rest').length, 3, 'the next ask is complete');
  // a child who always picks a wrong layer still finishes the session
  const v = mkWorld({ age: 3, seed: 21 }); let t = 0;
  while (v.state !== 'sessionDone' && t < 1500) {
    if (v.state === 'talk' && !v.talkAnswered && v.stateTime > 1) v.talkAnswer(v.talk.answerId);
    if (v.state === 'round' && v.phase === 'ask' && v.phaseTime > 0.8 && v.time > v._lockUntil) {
      const ps = v.pieces.filter(p => p.state === 'rest' && p.askIdx === v.ask), X = ps.find(p => !p.right) || ps.find(p => p.right);
      if (X) { const d = v.dropPoint(); drag(v, X, d.x, d.y, { steps: 4, dt: 0.03, hold: 0.05 }); }
    }
    v.update(1 / 30); t += 1 / 30; v.drainEvents();
  }
  assert.strictEqual(v.state, 'sessionDone', 'wrong-always child finishes (' + t.toFixed(0) + ' s)');
});

test('world: dropCatch — a release up to 40 px beside the drop zone still drops; farther is a miss; the layout keeps dropPad 60', () => {
  const w = mkWorld({ age: 4 }); roundOf(w, 'colors', 2);
  const D = w.layout.drop, L = w.layout;
  assert.strictEqual(D.x1 - D.x0, L.LW + 120);
  const X = rightP(w);
  assert.strictEqual(drag(w, X, D.x1 + 30, D.y1 - 200, { hold: 0.4 }), 'drop', '30 px beside');
  until(w, () => w.phase === 'deal' || w.phase === 'done'); untilPhase(w, 'ask');
  const Y = rightP(w);
  assert.strictEqual(drag(w, Y, D.x1 + 75, D.y1 - 200, { hold: 0.4 }), 'miss', '75 px beside');
});

test('world: chapter time limit — after ≥ 2 cakes and > 80 s (or a predicted > 100 s) → Talk time; Talk re-asks every 12 s, glow from the 2nd', () => {
  const w = mkWorld({ age: 4 }); w.levels = ['colors', 'shapes', 'count', 'animals']; w.startLevel(0);
  const b = new RT.Bot(w, { skill: 1, seed: 1, think: [7, 8] });
  let towers = 0;
  while (w.state !== 'talk' && w.time < 600) { b.step(1 / 30); w.update(1 / 30); for (const e of w.drainEvents()) if (e.type === 'roundDone') towers++; }
  assert.strictEqual(w.state, 'talk'); assert.ok(towers >= 2 && towers < 4, 'cut after ' + towers); assert.strictEqual(w.roundsPerLevel, towers);
  run(w, 12.05); let e = evs(w).find(x => x.type === 'talkAsk'); assert.ok(e && e.n === 1 && !e.glowAnswer);
  run(w, 12); e = evs(w).find(x => x.type === 'talkAsk'); assert.ok(e && e.n === 2 && e.glowAnswer && w.talk.glowAnswer);
  assert.strictEqual(w.talkAnswer(w.talk.answerId), true); assert.ok(evs(w).some(x => x.type === 'talkResult' && x.correct));
  run(w, 1.7); assert.ok(evs(w).some(x => x.type === 'levelDone'));
});

test('world: breeze (sea current) surprise — gust after the 2nd stack, Pip holds (1.5 s), the tower sways ≤ 0.12 rad and settles', () => {
  const w = mkWorld({ age: 4 }); roundOf(w, 'colors', 2, 'breeze');
  assert.strictEqual(w.surprise, 'breeze');
  dragToTower(w, rightP(w)); untilPhase(w, 'ask', 20000);
  dragToTower(w, rightP(w)); until(w, () => w._liveCount() === 2); evs(w);
  run(w, 0.5); w.tower.theta *= 0; w.tower.omega *= 0;
  let gust = null, peak = 0, held = 0;
  run(w, 3.5, () => { for (const e of w.drainEvents()) if (e.type === 'gust') gust = e; peak = Math.max(peak, Math.abs(w.tower.theta)); if (w.pip.mood === 'hold') held += H; });
  assert.ok(gust, 'gust event'); assert.ok(peak > 0.05 && peak <= 0.12 + 1e-9, 'gust sway ' + peak);
  assert.ok(Math.abs(held - CFG.holdTime) < 0.05, 'Pip holds ' + held.toFixed(2));
  assert.ok(Math.abs(w.tower.theta) < 0.02 && w.wind === 0, 'calm again');
  const w2 = mkWorld({ age: 4 }); roundOf(w2, 'colors', 2);
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

test('world: puffer surprise — swims in from the right once, hovers beside the tower top 4 s; a tap → pufferTap (no score), puffs up (puff 0 → 1), one spinning loop, deflates, zooms off right; playtest P1-2: it STAYS when a block is sent (lift + sink pass in front of it) and leaves after pufferSit', () => {
  const w = mkWorld({ age: 4 }); roundOf(w, 'colors', 2, 'puffer');
  assert.strictEqual(w.surprise, 'puffer');
  dragToTower(w, rightP(w)); untilPhase(w, 'ask', 20000);
  until(w, () => !!w.puffer, 6000);
  const B = w.puffer; assert.ok(B.x > w.layout.W, 'from the right edge'); assert.strictEqual(B.flip, -1);
  until(w, () => w.puffer && w.puffer.state === 'sit', 6000);
  const top = w.towerTop(), L = w.layout;
  assert.ok(B.x > top.x + L.LW / 2 && B.x < top.x + L.LW / 2 + 120 && Math.abs(B.y - (top.y - CFG.pufferHoverDy)) < 12, 'hovers beside the top (' + (B.x - top.x).toFixed(0) + ', ' + (B.y - top.y).toFixed(0) + ')');
  assert.ok(B.x + 50 < L.W - L.ins.right && B.y - 40 > L.ins.top, 'on screen');
  assert.ok(evs(w).some(e => e.type === 'puffer'));
  const bh = w.pufferHit(); assert.ok(bh && bh.r === CFG.pufferR); assert.deepStrictEqual(w.pufferPos(), { x: B.x, y: B.y });
  const st = w.stars, m = w.misses;
  assert.strictEqual(w.pointerDown(bh.x, bh.y), 'puffer');
  const tapE = evs(w).find(e => e.type === 'pufferTap'); assert.ok(tapE && isFinite(tapE.x + tapE.y));
  assert.strictEqual(B.state, 'loop'); assert.strictEqual(w.pufferHit(), null, 'a looping puffer is not tappable');
  let maxR = 0, minY = 1e9, maxPuff = 0, maxRot = 0; const lx = B.lx, ly = B.ly;
  run(w, CFG.pufferLoop - 0.02, () => {
    maxR = Math.max(maxR, Math.abs(Math.hypot(B.x - lx, B.y - (ly - CFG.pufferLoopR)) - CFG.pufferLoopR)); minY = Math.min(minY, B.y);
    maxPuff = Math.max(maxPuff, B.puff); maxRot = Math.max(maxRot, Math.abs(B.rot));
    if (B.t > CFG.pufferPuffIn && B.t < CFG.pufferLoop - 0.35) assert.strictEqual(B.puff, 1, 'puffed round');
  });
  assert.ok(maxR < 1e-6, 'a circle'); assert.ok(minY < ly - 1.8 * CFG.pufferLoopR, 'loops up over its spot');
  assert.strictEqual(maxPuff, 1); assert.ok(maxRot > 6, 'one spin ' + maxRot.toFixed(2));
  run(w, 0.05); assert.strictEqual(B.state, 'away'); assert.ok(B.puff < 0.01, 'deflated');
  const ax = B.x; run(w, 0.6); assert.ok(B.x > ax + 50 && B.flip === 1, 'zooms off to the right');
  run(w, CFG.pufferOut); assert.strictEqual(w.puffer, null);
  assert.strictEqual(w.stars, st); assert.strictEqual(w.misses, m);
  run(w, 10); assert.strictEqual(w.puffer, null, 'once per tower');
  const w2 = mkWorld({ age: 4, seed: 5 }); roundOf(w2, 'colors', 2, 'puffer');
  dragToTower(w2, rightP(w2)); untilPhase(w2, 'ask', 20000);
  until(w2, () => w2.puffer && w2.puffer.state === 'sit', 6000);
  const sitT = w2.time, R2 = rightP(w2);
  tapPiece(w2, R2); assert.strictEqual(w2.puffer.state, 'sit', 'a send does not chase it away');
  until(w2, () => R2.state !== 'lift' && R2.state !== 'fall');
  assert.ok(w2.puffer && w2.puffer.state === 'sit', 'still there after the block landed');
  until(w2, () => !w2.puffer || w2.puffer.state === 'away');
  assert.ok(w2.time - sitT >= CFG.pufferSit - 0.05, 'leaves only after pufferSit (' + (w2.time - sitT).toFixed(2) + ' s)');
  assert.deepStrictEqual([CFG.pufferDelay[0], CFG.pufferDelay[1], CFG.pufferIn], [0.3, 0.8, 1.2]);
});

test('world: ask gate (playtest P1-1) — ages ≤ 5 the ask opens only once Pip is quiet (world.speechBusy hook), at most askGateMax s; nothing is tappable meanwhile (no boop); age 6 / no hook: no wait', () => {
  assert.strictEqual(CFG.askGateMax, 2.5); assert.strictEqual(CFG.askGateAges, 5);
  const dealt = w => { until(w, () => w.phase === 'deal' && w.pieces.length && w.pieces.every(p => p.state === 'rest' || p.askIdx !== w.ask)); };
  // busy for 1.2 s after the deal settles → the ask waits ≈ 1.2 s
  let busy = true;
  const w = mkWorld({ age: 4 }); w.speechBusy = () => busy;
  w.levels = ['colors', 'colors', 'colors', 'colors']; w.startLevel(0); w._beginRound();
  dealt(w); run(w, CFG.dealSettle + 0.05); evs(w);
  assert.strictEqual(w.phase, 'deal', 'held while Pip talks');
  const p = w.pieces[0];
  assert.strictEqual(w.pointerDown(p.x, p.y), null, 'blocks not tappable yet'); w.pointerUp(p.x, p.y);
  assert.ok(!evs(w).some(e => e.type === 'locked' || e.type === 'ask'), 'no boop, no ask');
  run(w, 1.0); assert.strictEqual(w.phase, 'deal');
  busy = false; w.update(H);
  assert.strictEqual(w.phase, 'ask', 'opens on the first quiet step');
  const ev = evs(w).find(e => e.type === 'ask'); assert.ok(ev && ev.waited > 1.0 && ev.waited < 1.2, 'waited ' + (ev && ev.waited));
  // always busy → opens after askGateMax
  const w2 = mkWorld({ age: 3 }); w2.speechBusy = () => true;
  w2.levels = ['colors', 'colors', 'colors', 'colors']; w2.startLevel(0); w2._beginRound();
  dealt(w2); const t0 = w2.time; untilPhase(w2, 'ask');
  assert.ok(Math.abs(w2.time - t0 - CFG.dealSettle - CFG.askGateMax) < 0.05, 'max wait ' + (w2.time - t0).toFixed(2));
  // ages 6–7, a throwing hook, or no hook: no wait
  for (const [age, hook] of [[6, () => true], [7, () => true], [4, () => { throw new Error('x'); }], [4, null]]) {
    const w3 = mkWorld({ age }); if (hook) w3.speechBusy = hook;
    w3.levels = ['count', 'count', 'count', 'count']; w3.startLevel(0); w3._beginRound();
    dealt(w3); const t3 = w3.time; untilPhase(w3, 'ask');
    assert.ok(w3.time - t3 <= CFG.dealSettle + 0.02, 'age ' + age + ' no wait (' + (w3.time - t3).toFixed(2) + ')');
  }
  // a full bot session with a hook that is busy half of the time still finishes (no hang)
  const w4 = mkWorld({ age: 4, seed: 3 }); let k = 0; w4.speechBusy = () => (k++ % 60) < 30;
  const b = new RT.Bot(w4, { skill: 0.8, seed: 3 }); let n = 0;
  while (w4.state !== 'sessionDone' && n++ < 30 * 900) { b.step(1 / 30); w4.update(1 / 30); }
  assert.strictEqual(w4.state, 'sessionDone');
});

test('world: a wrong block drifts home through the water (functional P3-1) — peak speed ≈ 420 px/s (only the far 3rd slot of a wide landscape needs up to ≈ 850), home ≤ 2.4 s after it was sent, every viewport × age', () => {
  let worst = 0, worstT = 0, over = 0, all = 0;
  for (const v of VIEWPORTS) for (const age of [3, 4, 5, 7]) for (const ri of [0, 2]) {
    const w = mkWorld({ age, vp: v, seed: 7 + ri }); roundOf(w, 'colors', ri);
    for (const X of w.pieces.filter(p => !p.right).slice(0, CFG.fadeWrongAfter - 1)) {
      until(w, () => w.phase === 'ask' && w.time >= w._lockUntil && X.state === 'rest');
      const t0 = w.time; let peak = 0, sawHome = false;
      assert.strictEqual(tapPiece(w, X), 'drop');
      until(w, () => { if (X.state === 'bounce' || X.state === 'home') { peak = Math.max(peak, Math.hypot(X.vx, X.vy)); } if (X.state === 'home') { sawHome = true; assert.ok(X.arc.drift && onScreen(w, X.x, X.y, 1)); } if (w.time - t0 > 8) throw new Error("stuck " + v.name + " age " + age + " ri " + ri + " " + X.state + " " + w.phase); return X.state === "rest"; });
      assert.ok(sawHome && Math.abs(X.x - X.homeX) < 1e-6 && Math.abs(X.y - X.homeY) < 0.1 * w.layout.LH, 'home');
      worst = Math.max(worst, peak); worstT = Math.max(worstT, w.time - t0); all++; if (peak > 1.05 * CFG.homeDriftV) over++;
    }
  }
  assert.ok(worst <= 900, 'peak ' + worst.toFixed(0) + ' px/s'); assert.ok(worstT <= CFG.homeBy + 0.07, 'home in ' + worstT.toFixed(2) + ' s');
  assert.ok(over / all < 0.35, over + '/' + all + ' trips above 420 px/s');
  console.log('     (' + all + ' wrong trips: peak ≤ ' + worst.toFixed(0) + ' px/s, ' + over + ' above 441; home ≤ ' + worstT.toFixed(2) + ' s)');
});

test('content: the very first session (no stored last topics, functional P3-2) plays RT.AGE_TOPICS[age] — age 4: colours, shapes, counting, animals; then it rotates', () => {
  for (const age of AGES) for (const seed of [1, 104, 103, 77]) {
    const w = mkWorld({ age, seed });
    assert.deepStrictEqual(w.levels, RT.AGE_TOPICS[age], 'age ' + age + ' seed ' + seed);
  }
  assert.deepStrictEqual(RT.AGE_TOPICS[4], ['colors', 'shapes', 'count', 'animals']);
  assert.deepStrictEqual(C.topicsFor(4, new RT.RNG(5), []), RT.AGE_TOPICS[4]);
  assert.notDeepStrictEqual(C.topicsFor(4, new RT.RNG(5), RT.AGE_TOPICS[4]), RT.AGE_TOPICS[4]);
});

test('world: rotation / resize mid-drag, mid-fall, mid-deal, mid-crown-drop, mid-clear — everything snaps and goes on', () => {
  const flip = w => { const L = w.layout; w.setViewport(L.H, L.W, L.portrait ? { top: 0, right: 44, bottom: 21, left: 44 } : { top: 47, right: 0, bottom: 34, left: 0 }); };
  const check = (w, tag) => {
    for (const p of w.pieces) { assert.ok(onScreen(w, p.x, p.y, 1) && p.state !== 'drag' && p.state !== 'fall', tag + ' piece ' + p.state); if (p.state === 'rest') assert.ok(Math.abs(p.x - p.homeX) < 1e-6); }
    for (let i = 0; i < w.tower.blocks.length; i++) { const q = w.blockPose(i, 1); assert.ok(onScreen(w, q.x, q.y, 1), tag + ' cake layer'); assert.strictEqual(w.tower.blocks[i].bw, w.layout.LW * (w.tower.blocks[i].block.size === 'small' ? 0.72 : 1)); }
    if (w.goal) { const c = w.crownPose(1); if (c) assert.ok(onScreen(w, c.x, c.y, 1), tag + ' crown'); }
    assert.strictEqual(w._press, null);
  };
  for (const vp of [VIEWPORTS[8], VIEWPORTS[3]]) {
    const w = mkWorld({ age: 4, vp }); roundOf(w, 'colors', 2);
    const p = rightP(w); w.pointerDown(p.x, p.y); w.pointerMove(p.x - 100, p.y - 200); run(w, 0.2);
    flip(w); check(w, 'mid-drag'); assert.strictEqual(w.pointerUp(10, 10), null);
    assert.strictEqual(w.goal.y, w.layout.goalY, 'the crown goal follows the layout');
    let d = w.dropPoint(); drag(w, rightP(w), d.x, d.y - 150); assert.strictEqual(rightP(w).state, 'fall');
    const n0 = w._liveCount(); flip(w); check(w, 'mid-fall');
    assert.strictEqual(w._liveCount(), n0 + 1); assert.ok(evs(w).some(e => e.type === 'land'));
    untilPhase(w, 'ask');
    const X = wrongP(w); d = w.dropPoint(); drag(w, X, d.x, d.y - 150); flip(w); check(w, 'mid-fall wrong');
    assert.ok(evs(w).some(e => e.type === 'wrong')); assert.strictEqual(X.state, 'rest'); assert.strictEqual(w.phase, 'ask');
    run(w, CFG.wrongLock);
    dragToTower(w, rightP(w)); until(w, () => w.pieces.some(q => q.state === 'in' && q.alpha > 0)); flip(w); check(w, 'mid-deal'); untilPhase(w, 'ask');
    while (w.phase !== 'done') { dragToTower(w, rightP(w)); until(w, () => w.phase === 'ask' || w.phase === 'done'); }
    until(w, () => w.goal.state === 'drop'); evs(w); flip(w); check(w, 'mid-crown');
    assert.strictEqual(w.goal.state, 'on'); assert.ok(evs(w).some(e => e.type === 'crownOn'));
    until(w, () => w.phase === 'clear' && w.tower.blocks.some(b => b.fly)); flip(w); check(w, 'mid-clear');
    assert.ok(w.goal === null || w.goal.state === 'on');
    until(w, () => w.state === 'round' && w.phase === 'ask', 30000);
    assert.strictEqual(w.round, 3);
    const pp = rightP(w); w.pointerDown(pp.x, pp.y); const L = w.layout; w.setViewport(L.W, L.H, L.ins); assert.ok(w._press, 'no-op resize keeps the drag'); w.cancelDrag();
  }
});

test('world: physics — watery sway (0.6 Hz, ζ 0.25) settles in ≈ 2–4 s and never exceeds 0.12 rad even under repeated kicks; dx self-centres', () => {
  const w = mkWorld({ age: 4 }); roundOf(w, 'colors', 3);
  for (let k = 0; k < 3; k++) { dragToTower(w, rightP(w), { ox: 40 }); untilPhase(w, 'ask', 20000); }
  const T = w.tower;
  T.theta = 0; T.omega = 0; w._swayKick(0.1);
  let peak = 0, settle = null;
  for (let i = 0; i < 900; i++) { w._stepTower(H); peak = Math.max(peak, Math.abs(T.theta)); if (settle === null && i > 60 && Math.abs(T.theta) < 0.005 && Math.abs(T.omega) < 0.05) settle = i * H; }
  assert.ok(Math.abs(peak - 0.1) < 0.005, 'peak ≈ kick ' + peak);
  assert.ok(settle > 2.0 && settle < 4.0, 'settles slowly in water ' + settle);
  for (let i = 0; i < 2000; i++) { if (i % 37 === 0) w._swayKick(0.1 * (i % 2 ? 1 : -1)); w._stepTower(H); assert.ok(Math.abs(T.theta) <= 0.12 + 1e-12); }
  T.blocks.forEach(b => { b.dx = 30; });
  for (let i = 0; i < 240; i++) w._stepTower(H);
  assert.ok(T.blocks.every(b => Math.abs(b.dx) < 0.5), 'self-centring');
});

test('world: the cake never falls — 1000 random sessions (random age, viewport, breeze, skill, wild drags / flicks / taps, rotations): |θ| ≤ cap, every stacked layer stays on the cake, offsets ≤ 0.18·LW, nothing NaN', () => {
  const R = new RT.RNG(2026);
  let cakes = 0, layers = 0, maxTh = 0, maxCom = 0;
  for (let s = 0; s < 1000; s++) {
    const age = R.int(3, 7), v = VIEWPORTS[R.int(0, VIEWPORTS.length - 1)];
    const w = mkWorld({ age, vp: v, seed: 7000 + s, surprise: true, config: { step: 1 / 120 } });
    const b = new RT.Bot(w, { skill: R.float(0.3, 1), seed: s, think: [0.1, 0.6], retry: [0.1, 0.4], steps: [2, 6], stepDt: [0.01, 0.04], hold: [0, 0.05], puffer: 0.5 });
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
    const w = mkWorld({ age: 5, seed: 77, surprise: true }), b = new RT.Bot(w, { skill: 0.7, seed: 3 }), all = [];
    let t = 0; while (w.state !== 'sessionDone' && t < 900) { w.setBreeze(w.weather === 1 ? 0.8 : 0); b.step(dt); w.update(dt); t += dt; all.push(...w.drainEvents()); }
    return hashEvents(all);
  };
  assert.strictEqual(runIt(1 / 30), runIt(1 / 30));
  const record = () => {
    const w = mkWorld({ age: 4, seed: 78, surprise: true }), inputs = [], all = [];
    for (const fn of ['pointerDown', 'pointerMove', 'pointerUp', 'talkAnswer', 'cancelDrag']) {
      const o = w[fn].bind(w); w[fn] = (...a) => { inputs.push({ s: Math.round(w.time / CFG.step), fn, a }); return o(...a); };
    }
    const b = new RT.Bot(w, { skill: 0.7, seed: 4 });
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

test('world: prompt() / answerId() / pieceHit() / pipHit() / dropPoint() / interactive / hint() / pose helpers / event fields', () => {
  const w = mkWorld({ age: 4 });
  assert.strictEqual(w.prompt(), null); assert.strictEqual(w.answerId(), null);
  assert.strictEqual(w.crownPose(), null); assert.strictEqual(w.cloudPose(), null); assert.strictEqual(w.pearlPose(0), null); assert.strictEqual(w.pufferHit(), null);
  roundOf(w, 'animals', 2);
  const p = w.prompt(); assert.ok(p && (p.promptKey === 'p.animals' || p.promptKey === 'p.sound') && p.params.animal);
  const R = rightP(w); assert.strictEqual(R.block.animal, p.params.animal);
  const h = w.pieceHit(R.id); assert.ok(h.x === R.x && h.w === w.layout.LW + 32 && h.h === 2 * (0.6 * w.layout.S + 14));
  const dp = w.dropPoint(); assert.ok(Math.abs(dp.y - (w.layout.tower.baseTop - 1.5 * w.layout.LH)) < 1e-9);
  assert.strictEqual(w.interactive, true);
  const kh = w.pipHit(), K = w.layout.pip; assert.ok(Math.abs(kh.w - 0.76 * K.h) < 1e-9 && kh.h === K.h);
  const cp = w.crownPose(1); assert.ok(cp && cp.x === w.layout.tower.x && Math.abs(cp.y - (w.layout.goalY + w.goal.bob)) < 2 && cp.alpha === 1);
  assert.strictEqual(w.hint(), R.id); assert.ok(w.drainEvents().some(e => e.type === 'hint' && e.pieceId === R.id));
  const w2 = mkWorld({ age: 4, surprise: true }), b = new RT.Bot(w2, { skill: 0.7, seed: 2 }), seen = {};
  const need = { level: ['level', 'topic', 'weather'], round: ['round', 'n', 'asks'], deal: ['ask', 'n', 'pieces'], ask: ['ask', 'asks', 'promptKey', 'params', 'answerId', 'nameKind', 'nameValue'],
    grab: ['pieceId', 'nameKind', 'nameValue', 'x', 'y'], drop: ['pieceId', 'x', 'y'], land: ['pieceId', 'n', 'impact', 'x', 'y'],
    stack: ['n', 'nameKind', 'nameValue', 'block', 'x', 'y', 'promptKey', 'params'], wrong: ['pieceId', 'nameKind', 'nameValue', 'want', 'streak', 'x', 'y'],
    towerDone: ['n'], crown: ['x', 'y'], crownOn: ['x', 'y'], count: ['i', 'n', 'x', 'y', 'cx', 'cy'], blow: ['x', 'y', 'tx', 'ty'], pearlsOut: ['n', 'x', 'y'],
    sprinkles: ['x', 'y'], roundDone: ['round', 'stars', 'misses'], clearBlock: ['i', 'x', 'y'], talk: ['talk'], talkResult: ['correct', 'choiceId', 'answerId'],
    levelDone: ['level', 'stars'], sessionDone: ['stars', 'towers'] };
  while (w2.state !== 'sessionDone' && w2.time < 900) {
    b.step(1 / 30); w2.update(1 / 30);
    for (const e of w2.drainEvents()) if (need[e.type]) { seen[e.type] = 1; for (const f of need[e.type]) assert.ok(e[f] !== undefined, e.type + '.' + f); }
  }
  for (const t of Object.keys(need)) assert.ok(seen[t], 'saw ' + t);
});

// ======================================================================== bot
test('bot: taps (tap to send) most of the time, drags sometimes, right with p ≈ skill (through pointerDown/Move/Up), taps the puffer sometimes, talks', () => {
  let right = 0, drops = 0, puffer = 0, talks = 0, sends = 0, drags = 0;
  for (let s = 0; s < 4; s++) {
    const w = mkWorld({ age: 4, seed: 30 + s, surprise: true }), b = new RT.Bot(w, { skill: 0.7, seed: s, puffer: 1 });
    while (w.state !== 'sessionDone' && w.time < 900) { b.step(1 / 30); w.update(1 / 30); w.drainEvents(); }
    right += b.stats.right; drops += b.stats.drops; puffer += b.stats.puffer; talks += b.stats.talks; sends += b.stats.sends; drags += b.stats.drags;
    assert.strictEqual(b.stats.misses, 0, 'the bot always reaches the tower');
    assert.strictEqual(w.state, 'sessionDone');
  }
  const fr = right / drops;
  assert.ok(fr > 0.6 && fr < 0.9, 'right fraction ' + fr.toFixed(2));
  assert.ok(sends / (sends + drags) > 0.6 && sends / (sends + drags) < 0.9 && drags > 10, 'taps ' + sends + ' drags ' + drags);
  assert.ok(puffer > 0 && talks === 16, 'puffer ' + puffer + ' talks ' + talks);
});

test('weather (under water): sunny / breezy / rain / rainbow — DESIGN water hex, ambient fields, 2.5 s crossfade, wind (breezy ≈ 0.8, others ≤ 0.15), rain 0.15 dark + splashes, rainbow, clouds, party, cap 120, deterministic', () => {
  const wx = new RT.Weather({ width: 1280, height: 720, seed: 3 });
  const kinds = new Set(RT.Weather.KINDS);
  assert.deepStrictEqual(RT.Weather.NAMES, ['sunny', 'breezy', 'rain', 'rainbow']);
  assert.deepStrictEqual(RT.Weather.SKY.map(s => s.top + s.bottom), ['#7FD0E3#DDF4EC', '#88C7DA#D5EDE4', '#6C93AB#BCD1D6', '#86D2E8#E9F6EA']);
  for (let m = 0; m < 4; m++) {
    wx.setWeather(m);
    let wmax = 0, wsum = 0, nW = 0;
    for (let k = 0; k < 1200; k++) { wx.update(1 / 60); assert.ok(wx.particles.length <= 120); if (k > 300) { wmax = Math.max(wmax, wx.ambient.wind); wsum += wx.ambient.wind; nW++; } }
    const a = wx.ambient;
    for (const key of ['skyTop', 'skyBottom', 'skyMid']) assert.ok(/^#[0-9A-F]{6}$/.test(a[key]), key);
    for (const key of ['sun', 'sunX', 'sunY', 'darkness', 'wind', 'gust', 'rain', 'rainbow', 'cloudSpeed']) assert.ok(isFinite(a[key]), key);
    assert.strictEqual(a.skyTop, RT.Weather.SKY[m].top); assert.strictEqual(a.skyBottom, RT.Weather.SKY[m].bottom);
    assert.strictEqual(a.mood, RT.Weather.NAMES[m]); assert.strictEqual(a.env, a.mood); assert.strictEqual(a.moodIndex, m);
    assert.strictEqual(a.darkness, m === 2 ? 0.15 : 0); assert.strictEqual(a.rain, m === 2 ? 1 : 0); assert.strictEqual(a.rainbow, m === 3 ? 1 : 0);
    if (m === 1) { assert.ok(wsum / nW > 0.65 && wsum / nW < 0.95 && wmax <= 1, 'breezy wind ' + (wsum / nW).toFixed(2)); assert.ok(a.cloudSpeed > 30, 'fast clouds'); }
    else assert.ok(wmax <= 0.15, RT.Weather.NAMES[m] + ' wind ' + wmax.toFixed(3));
    for (const p of wx.particles) { assert.ok(kinds.has(p.kind), 'kind ' + p.kind); for (const f of ['x', 'y', 'rot', 's', 'a']) assert.ok(isFinite(p[f]), f); assert.ok(p.layer === 'back' || p.layer === 'front'); }
    for (const c of wx.clouds) { assert.ok(['a', 'b', 'c', 'rain'].includes(c.kind)); assert.ok(isFinite(c.x + c.y + c.s + c.alpha)); }
    const vis = wx.clouds.filter(c => c.alpha > 0.3);
    if (m === 2) assert.ok(vis.filter(c => c.kind === 'rain').length >= 3, 'rain clouds'); else assert.ok(vis.every(c => c.kind !== 'rain') && vis.length >= 3, 'white clouds');
    assert.ok(wx.particles.some(p => p.kind === 'bubble'), 'always rising bubbles');
    for (const k of ['confetti', 'sprinkles', 'puff', 'dust', 'sparkle', 'stars', 'splash', 'bubbles']) wx.burst(640, 360, { kind: k, n: 30 });
    assert.ok(wx.particles.length <= 120);
    assert.ok(wx.particles.every(p => kinds.has(p.kind)));
    for (let k = 0; k < 200; k++) wx.update(1 / 60);
  }
  const make = s => { const x = new RT.Weather({ seed: 4, weather: s }); for (let k = 0; k < 300; k++) x.update(1 / 60); return x; };
  const ks = s => new Set(make(s).particles.map(p => p.kind));
  for (let m = 0; m < 4; m++) assert.ok(ks(m).has('bubble'), 'bubbles in ' + m);
  assert.ok(ks(0).has('sugar') && ks(0).has('blossom')); assert.ok(ks(1).has('wrapper_a') && ks(1).has('wrapper_b') && ks(1).has('blossom'));
  assert.ok(ks(2).has('raindrop') && ks(2).has('splash') && ks(2).has('blossom')); assert.ok(ks(3).has('sparkle'));
  const rn = make(2); assert.ok(rn.particles.filter(p => p.kind === 'splash').every(p => Math.abs(p.y - rn.surfaceY) <= 21), 'rain ripples on the surface');
  assert.ok(rn.particles.filter(p => p.kind === 'raindrop').every(p => p.y <= rn.surfaceY + 21), 'raindrops only above the surface');
  const fl = make(1); assert.ok(fl.particles.filter(p => p.kind.startsWith('wrapper')).every(p => p.tint), 'tinted seaweed bits');
  // water feel: nothing under the surface moves fast; bubbles rise
  for (let m = 0; m < 4; m++) {
    const x = make(m), before = new Map(x.particles.map(p => [p, [p.x, p.y]])); x.update(0.1);
    for (const p of x.particles) if (before.has(p) && p.kind !== 'raindrop') { const [bx, by] = before.get(p); assert.ok(Math.abs(p.y - by) < 25, p.kind + ' moves ' + (p.y - by).toFixed(1) + ' px in 0.1 s'); if (p.kind === 'bubble') assert.ok(p.y < by || p.y > by + 100, 'bubbles rise'); }
  }
  const bp = new RT.Weather({ seed: 2, weather: 0 }); bp.pip = { x: 200, y: 400 }; bp.groundY = 650;
  for (let k = 0; k < 900; k++) bp.update(1 / 60);
  assert.ok(bp.particles.filter(p => p.kind === 'bubble').every(p => p.y <= 651 && p.y >= bp.surfaceY), 'bubbles between the sand and the surface');
  wx.setWeather(1); for (let k = 0; k < 75; k++) wx.update(1 / 60); const mid = wx.ambient.skyTop, mix = wx.ambient.envMix; for (let k = 0; k < 78; k++) wx.update(1 / 60);
  assert.ok(mid !== RT.Weather.SKY[3].top && mid !== RT.Weather.SKY[1].top && mix > 0.2 && mix < 0.8, 'crossfading'); assert.strictEqual(wx.ambient.skyTop, RT.Weather.SKY[1].top);
  assert.strictEqual(wx.ambient.envFrom, 'rainbow'); assert.strictEqual(wx.ambient.envMix, 1);
  const pw = new RT.Weather({ seed: 5 }); pw.party(); let conf = 0;
  for (let k = 0; k < 240; k++) { pw.update(1 / 60); assert.ok(pw.particles.length <= 120); conf = Math.max(conf, pw.particles.filter(p => p.kind.startsWith('confetti')).length); }
  assert.ok(conf > 40, 'party fish confetti ' + conf);
  assert.ok(pw.particles.some(p => p.kind === 'confetti_a' && p.tint), 'tinted fish'); pw.party(false); for (let k = 0; k < 400; k++) pw.update(1 / 60); assert.ok(!pw.particles.some(p => p.kind.startsWith('confetti')), 'party over');
  pw.resize(720, 1556); for (let k = 0; k < 60; k++) pw.update(1 / 60); assert.ok(pw.particles.every(p => isFinite(p.x + p.y)));
  const p = new RT.Weather({ seed: 9, weather: 2 }), q = new RT.Weather({ seed: 9, weather: 2 });
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
