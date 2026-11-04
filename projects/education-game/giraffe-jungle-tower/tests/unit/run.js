#!/usr/bin/env node
// Lulu's Jungle Tower — headless unit tests for rng / content / world / weather / bot.
// Run from projects/education-game/giraffe-jungle-tower:   node tests/unit/run.js   (exit 1 on any failure)
// (tests/unit/i18n_voice.test.js is the voice engineer's suite and runs on its own.)
'use strict';
const assert = require('assert');
const crypto = require('crypto');
const { load } = require('./load');

const JT = load();
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const H = 1 / 120;
const AGES = [3, 4, 5, 6, 7];
const LANGS = ['en', 'vi'];
const TOPICS = JT.Content.TOPICS;
const C = JT.Content;
const CFG = JT.CONFIG;
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
  { W: 1556, H: 720, ins: { top: 0, right: 108, bottom: 38, left: 108 }, name: 'iPhone 393×852 landscape' }
];
const VP = VIEWPORTS[8];

// ---------- helpers ----------
function mkWorld(o) {
  o = o || {};
  const cfg = Object.assign(o.surprise ? {} : { surpriseTypes: [] }, o.config || {});
  const w = new JT.World({ seed: o.seed || 1, age: o.age || 4, lang: o.lang || 'en', config: cfg });
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
    const r = C.makeRound(topic, { age, lang, rng: new JT.RNG(s * 97 + ri * 13 + age), roundIndex: ri });
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
    const r = C.makeRound(topic, { age, lang: 'en', rng: new JT.RNG(ri + 1), roundIndex: ri });
    assert.strictEqual(r.n, T[age][ri]); assert.strictEqual(r.asks.length, T[age][ri]);
    const k = topic === 'size' || ri === 0 || age === 3 ? 2 : age >= 6 && ri >= 2 ? 4 : 3;
    for (const a of r.asks) assert.strictEqual(a.choices.length, k, topic + ' age ' + age + ' r' + ri);
    for (const a of r.asks) for (const b of a.choices) assert.ok(C.KIND_OF[topic].includes(b.kind));
  }
});

test('content: colour-blind-safe below age 5 — the answer never next to a clashing colour (blue+purple, red+green, yellow+orange, green+orange, red+orange), no pink; yellow not in every set, orange asked', () => {
  let pink5 = false, seen = new Set(), sets3 = 0, yellow3 = 0;
  for (const age of AGES) for (const topic of ['colors', 'shapes', 'size']) for (let ri = 0; ri < 4; ri++) for (let s = 0; s < 300; s++) {
    const r = C.makeRound(topic, { age, lang: 'en', rng: new JT.RNG(s + 1000 * ri), roundIndex: ri });
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
    const rng = new JT.RNG(s + 7);
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
    const r = C.makeRound('count', { age, lang: 'en', rng: new JT.RNG(s * 3 + ri), roundIndex: ri });
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

test('content: animals — by sound from round 2 at age ≥ 4 (about half, never hippo), never earlier or at age 3; size: one colour big + small', () => {
  let snd = 0, all = 0;
  for (const age of AGES) for (let s = 0; s < 200; s++) for (let ri = 0; ri < 4; ri++) {
    const r = C.makeRound('animals', { age, lang: 'en', rng: new JT.RNG(s * 5 + ri), roundIndex: ri });
    for (const a of r.asks) {
      if (a.promptKey === 'p.sound') { assert.ok(age >= 4 && ri >= 2); assert.notStrictEqual(a.params.animal, 'hippo'); assert.ok(JT.ANIMAL_SOUND[a.params.animal]); }
      if (age >= 4 && ri >= 2) { all++; if (a.promptKey === 'p.sound') snd++; }
      for (const b of a.choices) assert.ok(JT.ANIMALS.includes(b.animal) && b.sprite === 'animal_' + b.animal);
    }
  }
  assert.ok(snd / all > 0.4 && snd / all < 0.6, 'about half by sound ' + (snd / all).toFixed(2));
  for (let s = 0; s < 300; s++) {
    const r = C.makeRound('size', { age: 3, lang: 'en', rng: new JT.RNG(s), roundIndex: 3 });
    let run = 1;
    r.asks.forEach((a, q) => {
      assert.strictEqual(a.choices[0].color, a.choices[1].color);
      assert.deepStrictEqual(a.choices.map(b => b.size).sort(), ['big', 'small']);
      assert.strictEqual(a.choices[a.answer].size, a.params.size);
      if (q) { run = a.params.size === r.asks[q - 1].params.size ? run + 1 : 1; assert.ok(run <= 2, 'never 3× the same size'); }
    });
  }
});

test('content: initial (jungle words, vi skips "khỉ"), letters / lower (no I/l), add / sub / oddeven arithmetic', () => {
  for (const lang of LANGS) for (let s = 0; s < 200; s++) {
    const r = C.makeRound('initial', { age: 6, lang, rng: new JT.RNG(s), roundIndex: 2 });
    for (const a of r.asks) {
      const b = a.choices[a.answer]; assert.strictEqual(b.initial, a.params.letter); assert.ok(b.word);
      a.choices.forEach((c, j) => { if (j !== a.answer) assert.ok(!c.initial || c.initial !== a.params.letter); });
      if (lang === 'vi') assert.notStrictEqual(b.animal, 'monkey');
    }
    const lo = C.makeRound('lower', { age: 6, lang, rng: new JT.RNG(s), roundIndex: 1 });
    for (const a of lo.asks) assert.ok(!'IL'.includes(a.params.letter) && a.choices[a.answer].text === a.params.letter.toLowerCase());
    for (const t of ['add', 'sub', 'oddeven']) {
      const m = C.makeRound(t, { age: 7, lang, rng: new JT.RNG(s), roundIndex: 3 });
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
  const a = C.makeRound('shapes', { age: 4, lang: 'en', rng: new JT.RNG(42), roundIndex: 2 });
  const b = C.makeRound('shapes', { age: 4, lang: 'en', rng: new JT.RNG(42), roundIndex: 2 });
  assert.deepStrictEqual(a, b);
  const PIC = ['color', 'shape', 'number', 'dots', 'animal', 'letter', 'size'];
  for (const age of AGES) for (const topic of TOPICS) for (const lang of LANGS) for (let s = 0; s < 40; s++) {
    const t = C.makeTalk(topic, { age, lang, rng: new JT.RNG(s) });
    assert.strictEqual(t.promptKey, 'talk.' + topic);
    assert.ok(t.choices.length >= 2 && t.choices.length <= 3);
    assert.strictEqual(t.choices.filter(c => c.id === t.answerId).length, 1);
    assert.strictEqual(new Set(t.choices.map(c => c.value)).size, t.choices.length);
    if (age <= 5 && JT.AGE_POOLS[age].includes(topic)) assert.ok(t.choices.every(c => PIC.includes(c.kind)), topic + ' picture choices');
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

// ======================================================================== layout
test('layout: DESIGN §2 numbers (groundY, S rule, stump, drop zone, Lulu, bubble, goal)', () => {
  let L = JT.World.computeLayout(1280, 720, null, {}, 4);
  assert.strictEqual(L.groundY, 692); assert.strictEqual(L.S, 112); assert.strictEqual(L.tower.x, 576); assert.strictEqual(L.tower.baseTop, 628);
  assert.strictEqual(L.tower.baseW, 182);
  assert.deepStrictEqual(L.drop, { x0: 576 - 116, x1: 576 + 116, y1: 638 });
  assert.deepStrictEqual(L.lulu, { x: 120, y: 688, h: 420 });
  assert.deepStrictEqual(L.bubble, { x: 24, y: 18, w: Math.min(560, 576 - 116 - 20 - 24), h: 122 });
  assert.strictEqual(L.goalY, 628 - 4 * 112 - 8);
  L = JT.World.computeLayout(960, 720, null, {}, 4); assert.strictEqual(L.lulu.h, 380); assert.strictEqual(L.tower.x, 432);
  L = JT.World.computeLayout(1280, 720, null, {}, 5); assert.ok(L.S < 100 && L.S >= 84 && 5 * L.S <= L.tower.baseTop - 150);
  L = JT.World.computeLayout(720, 1556, { top: 108, right: 0, bottom: 62, left: 0 }, {}, 4);
  assert.ok(L.portrait); assert.strictEqual(L.groundY, 1556 - 62 - 40); assert.strictEqual(L.tower.x, 0.58 * 720);
  assert.strictEqual(L.tower.baseTop, L.groundY - L.S - 150); assert.ok(4 * L.S <= L.tower.baseTop - (108 + 260));
  assert.ok(L.tall, 'iPhone portrait is tall: bubble under the HUD row');
  assert.deepStrictEqual(L.lulu, { x: 115, y: L.tower.baseTop + 70, h: 400 });
  assert.deepStrictEqual(L.bubble, { x: 24, y: 218, w: 720 - 48, h: 124 });
  L = JT.World.computeLayout(720, 1036, { top: 21, right: 0, bottom: 18, left: 0 }, {}, 4);   // iPad 820×1180
  assert.ok(L.portrait && !L.tall); assert.deepStrictEqual(L.bubble, { x: 24, y: 21 + 18, w: 720 - 160 - 14 - 24, h: 124 });
  L = JT.World.computeLayout(1556, 720, { top: 0, right: 108, bottom: 38, left: 108 }, {}, 5);   // iPhone landscape
  assert.ok(L.S >= 97, 'phone landscape S ' + L.S); assert.strictEqual(L.tower.baseTop, L.groundY - 52);
  const lg = JT.World.logicalSize(390, 844); assert.deepStrictEqual(lg, { W: 720, H: 1558 > 1600 ? 1600 : Math.round(720 / (390 / 844)) });
});

test('layout: every viewport × age × 2–4 choices — slots clear of the drop zone (± 44), HUD, bubble, Lulu; on screen; goal + tallest tower fit', () => {
  for (const v of VIEWPORTS) for (const age of AGES) {
    const w = mkWorld({ age, vp: v }), L = w.layout, ins = L.ins, S = L.S;
    assert.ok(S >= 84 && S <= 112, v.name + ' S ' + S);
    const hud = { l: L.W - ins.right - 160, t: -1e9, r: 1e9, b: ins.top + 96 };
    const drop = { l: L.drop.x0 - 44, t: -1e9, r: L.drop.x1 + 44, b: L.drop.y1 + 44 };
    const lb = w._luluBox(), lulu = { l: lb.l, t: lb.t, r: lb.r, b: lb.b };
    for (const k of [2, 3, 4]) {
      const sl = JT.World.slotsFor(L, w.cfg, k);
      assert.strictEqual(sl.length, k, v.name + ' ' + k + ' slots');
      sl.forEach((s, i) => {
        const b = { l: s.x - S / 2, t: s.y - S / 2, r: s.x + S / 2, b: s.y + S / 2 }, tag = v.name + ' age ' + age + ' k' + k + ' slot ' + i;
        assert.ok(b.l >= ins.left && b.r <= L.W - ins.right && b.t >= ins.top && b.b <= L.groundY + 1, tag + ' on screen');
        assert.ok(!ovl(b, drop), tag + ' inside the drop zone');
        assert.ok(!ovl(b, hud), tag + ' under the HUD');
        assert.ok(!ovl(b, kbox(L.bubble)), tag + ' under the bubble');
        if (!L.portrait) assert.ok(!ovl(b, lulu), tag + ' over Lulu');
        sl.forEach((o, j) => { if (j > i) assert.ok(Math.abs(o.x - s.x) >= S + 20 || Math.abs(o.y - s.y) >= S + 20, tag + ' overlaps slot ' + j); });
      });
    }
    // the tallest tower + the bananas fit on screen; the drop point is reachable
    const top = L.tower.baseTop - L.maxN * S;
    assert.ok(top >= ins.top + 110, v.name + ' age ' + age + ' tower top ' + top);
    assert.ok(L.goalY - L.goalH >= ins.top - 2, v.name + ' bananas fit (' + (L.goalY - L.goalH) + ')');
    const ban = { l: L.tower.x - 0.46 * L.goalH, t: L.goalY - L.goalH, r: L.tower.x + 0.46 * L.goalH, b: L.goalY };
    assert.ok(!ovl(ban, kbox(L.bubble)), v.name + ' age ' + age + ' bubble covers the bananas');
    assert.ok(!ovl(ban, hud), v.name + ' HUD covers the bananas');
    assert.ok(L.drop.x0 > lb.r + 20 || L.portrait, 'Lulu left of the drop zone');
    assert.ok(L.drop.x1 < L.W - ins.right && L.drop.x0 > ins.left, 'drop zone on screen');
    assert.ok(L.monkeyFrom.x > L.tower.x && L.monkeyFrom.x <= L.W, 'vine pivot right of the tower');
    // a tap at a slot centre picks that piece
  }
});

test('layout: pieces in a round sit in their slots; the centre of every hit box picks its piece; Lulu hit picks Lulu', () => {
  for (const v of VIEWPORTS) for (const age of [3, 4, 6]) {
    const w = mkWorld({ age, vp: v }); roundOf(w, age >= 6 ? 'add' : 'colors', 3);
    for (const p of w.pieces) {
      const h = w.pieceHit(p.id); assert.strictEqual(w._hit(h.x, h.y), p, v.name + ' hit');
      assert.ok(Math.abs(p.x - p.homeX) < 1e-6 && Math.abs(p.y - p.homeY) < 4);
    }
    const lh = w.luluHit(); assert.strictEqual(w._hit(lh.x, lh.y), 'lulu');
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
        const R = rightP(w), Wp = wrongP(w);
        // 1) a tap on a block: names it (tapPiece), it hops in place, nothing else happens
        if (askN % 3 === 1 && Wp) {
          assert.strictEqual(w.pointerDown(Wp.x, Wp.y), Wp.id); w.update(0.1); assert.strictEqual(w.pointerUp(Wp.x, Wp.y), 'tap');
          drainAll(); assert.strictEqual(all[all.length - 1].type, 'tapPiece');
          until(w, () => Wp.state === 'rest');
        }
        // 2) a drag that ends on the grass → miss (back home, not a mistake)
        if (askN % 4 === 2) {
          const m0 = w.misses, Q = rightP(w);
          assert.strictEqual(drag(w, Q, w.layout.lulu.x + 40, w.layout.groundY - 300), 'miss');
          drainAll(); assert.ok(all.some(e => e.type === 'miss' && e.pieceId === Q.id)); assert.strictEqual(w.misses, m0);
          until(w, () => Q.state === 'rest');
        }
        // 3) a wrong block onto the tower → it bounces off and flies home
        if (askN % 5 === 3 && wrongP(w)) {
          const X = wrongP(w);
          assert.strictEqual(dragToTower(w, X), 'drop');
          until(w, () => X.state === 'bounce' || X.state === 'home');
          drainAll(); assert.ok(all.some(e => e.type === 'wrong' && e.pieceId === X.id));
          until(w, () => w.phase === 'ask' && X.state === 'rest');
          w.update(CFG.wrongLock);
        }
        // 3b) two wrong drops on one ask → the 2nd always hints (ghost hand)
        if (askN % 7 === 5 && wrongP(w)) {
          for (let k = 0; k < 2; k++) { const X = wrongP(w); if (!X) break; dragToTower(w, X); until(w, () => w.phase === 'ask' && X.state === 'rest'); w.update(CFG.wrongLock); }
          drainAll(); assert.ok(w.hintHand || all.some(e => e.type === 'hint'));
        }
        // 4) the right block onto the tower → it lands
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
    // event order inside the first tower: round → deal → ask → grab → drop → land → stack … → towerDone → count … → bloom → monkey → bananas → roundDone → clearBlock
    const seq = all.map(e => e.type), r0 = seq.indexOf('round'), d0 = seq.indexOf('roundDone');
    const want = ['round', 'deal', 'ask', 'grab', 'drop', 'land', 'stack', 'towerDone', 'count', 'bloom', 'monkey', 'bananas', 'roundDone', 'clearBlock'];
    let k = r0; for (const t of want) { k = seq.indexOf(t, k); assert.ok(k >= 0, 'event ' + t + ' in order'); }
    assert.ok(d0 > r0);
    for (const t of ['tapPiece', 'miss', 'wrong', 'hint', 'talk', 'talkResult', 'levelDone', 'sessionDone', 'butterfly'].concat(age >= 4 ? ['gust'] : [])) assert.ok(cnt[t] > 0, 'age ' + age + ' saw ' + t);
    assert.strictEqual(cnt.towerDone, cnt.roundDone);
    assert.strictEqual(cnt.count, all.filter(e => e.type === 'towerDone').reduce((s, e) => s + e.n, 0));
  }
});

test('world: bot sessions at every age — sessionDone, right stacks only, no stuck ask, ≤ 4 pieces, ≤ 5 tower blocks, finite physics', () => {
  for (const age of AGES) for (const v of [VIEWPORTS[4], VIEWPORTS[2]]) for (const skill of [0.5, 1]) {
    const w = mkWorld({ age, vp: v, seed: 3 + age, surprise: true }), b = new JT.Bot(w, { skill, seed: 9 });
    let t = 0, ask = null, askT = 0, maxAsk = 0;
    while (w.state !== 'sessionDone' && t < 1500) {
      b.step(1 / 30); w.update(1 / 30); t += 1 / 30;
      assert.ok(w.pieces.length <= 4 + 4, 'pieces ' + w.pieces.length);
      assert.ok(w.tower.blocks.length <= 5);
      for (const p of w.pieces) for (const k of ['x', 'y', 'rot', 'sx', 'sy', 'scale', 'alpha']) assert.ok(isFinite(p[k]), 'piece.' + k);
      assert.ok(isFinite(w.tower.theta) && Math.abs(w.tower.theta) <= CFG.swayMax + 1e-9, 'theta ' + w.tower.theta);
      for (const e of w.drainEvents()) {
        if (e.type === 'ask') { ask = e; askT = w.time; }
        if (e.type === 'stack') { assert.strictEqual(e.ask, ask.ask); maxAsk = Math.max(maxAsk, w.time - askT); }
        if (e.type === 'land') assert.strictEqual(e.pieceId, ask.answerId, 'only the right block lands');
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
    const w = mkWorld({ age: 4, seed: 100 + s, vp: VIEWPORTS[s % VIEWPORTS.length], surprise: true }), b = new JT.Bot(w, { skill: 0.8, seed: s });
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

test('world: deal — staggered 0.08 s drop from above the screen, landing squash + one small bounce, ask after all rest; no grabs meanwhile', () => {
  const w = mkWorld({ age: 4 });
  w.levels = ['colors', 'colors', 'colors', 'colors']; w.startLevel(0); w.round = 2; w._beginRound();
  const e0 = evs(w); assert.ok(e0.some(e => e.type === 'round' && e.n === 3));
  assert.strictEqual(w.goal.state, 'drop'); assert.ok(w.goal.y + w.goal.h < 0, 'bananas start above the screen');
  until(w, () => w.pieces.length > 0);
  const e1 = evs(w).find(e => e.type === 'deal'); assert.ok(e1 && e1.pieces.length === 3);
  assert.ok(w.pieces.every(p => p.y < 0 && p.state === 'in'));
  assert.strictEqual(w.pointerDown(w.pieces[0].homeX, w.pieces[0].homeY), null, 'no grab during the deal');
  const landT = [], minSy = {}, bounced = {};
  let prevVy = {};
  until(w, () => {
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
  assert.strictEqual(w.goal.state, 'hang', 'the bananas dropped onto their stem');
  run(w, 1); assert.ok(Math.abs(w.goal.dy) < 2, 'bananas settled on their stem');
});

test('world: drag — spring-follow (ω 30, ζ 0.8) at the grab offset, lift 1.08, pendulum tilt ≤ 0.35 rad; one active pointer; grab event once', () => {
  const w = mkWorld({ age: 4 }); roundOf(w, 'colors', 2);
  const p = rightP(w), S = w.layout.S;
  assert.strictEqual(w.pointerDown(p.x + 0.5 * S, p.y - 0.5 * S), p.id);
  assert.strictEqual(w._press.ox, 0.35 * S, 'grab offset clamped to 0.35·S');
  let maxRot = 0;
  for (let i = 0; i < 30; i++) { w.pointerMove(p.homeX + 0.35 * S - i * 12, p.homeY - 0.35 * S - i * 6); w.update(1 / 60); maxRot = Math.max(maxRot, Math.abs(p.rot)); }
  assert.ok(maxRot > 0.03 && maxRot <= 0.35, 'tilt ' + maxRot);
  const g = evs(w).filter(e => e.type === 'grab'); assert.strictEqual(g.length, 1); assert.strictEqual(g[0].pieceId, p.id);
  const fx = w._press.fx - w._press.ox, fy = w._press.fy - w._press.oy;
  w.update(0.4);
  assert.ok(Math.abs(p.x - fx) < 1 && Math.abs(p.y - fy) < 1, 'follows the finger');
  assert.ok(Math.abs(p.scale - CFG.dragLift) < 0.01, 'lift');
  w.update(0.8);
  assert.ok(Math.abs(p.rot) < 0.02, 'the tilt swings back and settles when the finger rests (' + p.rot.toFixed(3) + ')');
  assert.strictEqual(p.z, 4); assert.strictEqual(w.drawOrder().pop(), p, 'the dragged block is drawn last');
  w.cancelDrag(); assert.strictEqual(p.state, 'home'); until(w, () => p.state === 'rest');
  assert.ok(Math.abs(p.x - p.homeX) < 1e-6);
  // a new press while dragging = the old finger was lost: the old drag ends (its block flies home), the new press counts
  const q = wrongP(w); w.pointerDown(p.x, p.y); w.pointerMove(p.x, p.y - 80); w.update(0.2);
  assert.strictEqual(w.pointerDown(q.x, q.y), q.id, 'the new finger takes over');
  assert.strictEqual(p.state, 'home'); assert.strictEqual(w._press.id, q.id); w.cancelDrag();
});

test('world: a still drag (< 10 px for 6 s) — the idle clock keeps running, then the block flies home with stillDrag', () => {
  const w = mkWorld({ age: 4 }); roundOf(w, 'colors', 2); evs(w);
  const p = rightP(w); w.pointerDown(p.x, p.y); w.pointerMove(p.x, p.y - 60); run(w, 0.3);
  const t0 = w.time;
  run(w, 5.5, i => { if (i % 30 === 0) w.pointerMove(p.x + (i % 60 ? 3 : -3), p.y); });   // a resting, trembling finger
  assert.strictEqual(p.state, 'drag', 'not yet'); assert.ok(w._idleT > 4, 'the idle clock runs during a still drag');
  run(w, 1.0);
  const e = evs(w).find(x => x.type === 'stillDrag'); assert.ok(e && e.pieceId === p.id, 'stillDrag');
  assert.ok(p.state === 'home' || p.state === 'rest'); assert.strictEqual(w._press, null); void t0;
  // a moving drag never triggers it
  until(w, () => p.state === 'rest');
  w.pointerDown(p.x, p.y);
  run(w, 8, i => { if (i % 12 === 0) w.pointerMove(p.homeX + 40 * Math.sin(i / 20), p.homeY - 100 - 40 * Math.cos(i / 20)); });
  assert.strictEqual(p.state, 'drag'); assert.ok(!evs(w).some(x => x.type === 'stillDrag'));
  w.cancelDrag();
  // tap threshold: main can raise it (CSS-scale aware)
  until(w, () => p.state === 'rest');
  const tx = p.x, ty = p.y; w.tapMoveMin = 40; w.pointerDown(tx, ty); w.pointerMove(tx + 30, ty); w.update(0.1); assert.strictEqual(w.pointerUp(tx + 30, ty), 'tap', '30 px is a tap with tapMoveMin 40');
  until(w, () => p.state === 'rest'); w.tapMoveMin = 0; w.pointerDown(tx, ty); w.pointerMove(tx + 30, ty); w.update(0.1); assert.strictEqual(w.pointerUp(tx + 30, ty), 'miss', '…and a drag with the default 24');
  w.tapMoveMin = 0;
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

test('world: drop → gravity fall onto the top within ± 0.18·S, landing squash 0.82, the stack sways (max 0.12 rad) and settles; never falls', () => {
  for (const off of [-80, 0, 45, 200]) {
    const w = mkWorld({ age: 5, seed: 4 }); roundOf(w, 'shapes', 3);
    for (let k = 0; k < 4; k++) {
      const p = rightP(w), S = w.layout.S, top = w.towerTop();
      const d = w.dropPoint();
      const r = drag(w, p, Math.min(w.layout.drop.x1 - 2, Math.max(w.layout.drop.x0 + 2, d.x + off)), d.y - 120);
      assert.strictEqual(r, 'drop');
      let y0 = p.y, t0 = w.time, minSy = 1, peak = 0, landed = null, vyMax = 0;
      until(w, () => { vyMax = Math.max(vyMax, p.vy); const e = w.events.find(x => x.type === 'land'); if (e) landed = e; return !!landed; });
      const T = w.time - t0;
      // free fall: time ≈ sqrt(2·h/g) (the release is from rest-ish)
      const hgt = top.y - p.side / 2 - y0;
      assert.ok(T < Math.sqrt(2 * Math.max(0, hgt) / CFG.g) + 0.12, 'falls by gravity (' + T.toFixed(2) + ' s)');
      const b = w.tower.blocks[w._liveCount() - 1], below = w.tower.blocks[w._liveCount() - 2];
      const pose = w.blockPose(w._liveCount() - 1, 1), bp = below ? w.blockPose(w._liveCount() - 2, 1) : { x: w.tower.x };
      assert.ok(Math.abs(b.dx - (below ? below.dx : 0)) <= 0.18 * S + 1e-6, 'within ±0.18·S');
      assert.ok(Math.abs(b.sy - 0.82) < 0.02, 'squash 0.82 at landing');
      assert.ok(landed.impact > 0 && landed.impact <= 1 && landed.n === w._liveCount());
      evs(w);
      for (let i = 0; i < 300; i++) { w.update(H); minSy = Math.min(minSy, b.sy); peak = Math.max(peak, Math.abs(w.tower.theta)); }
      assert.ok(peak > 0.005 && peak <= 0.12 + 1e-9, 'sway peak ' + peak);
      void pose; void bp; void vyMax;
      if (w.phase === 'done') break;
      untilPhase(w, 'ask');
    }
    run(w, 3);
    assert.ok(Math.abs(w.tower.theta) < 0.01, 'settles ' + w.tower.theta);
  }
});

test('world: blockPose — contiguous stack on the stump, block i rotated θ·(i+1)/n, squash keeps the bottom on the block below', () => {
  const w = mkWorld({ age: 4 }); roundOf(w, 'colors', 3);
  for (let k = 0; k < 3; k++) { dragToTower(w, rightP(w)); untilPhase(w, 'ask', 20000); }
  const T = w.tower, n = w._liveCount(), S = w.layout.S;
  assert.strictEqual(n, 3);
  T.theta = T._ptheta = 0; T.blocks.forEach(b => { b.dx = 0; b._q = 0; b.sy = 1; b.sx = 1; });
  let y = T.baseTop;
  for (let i = 0; i < n; i++) { const p = w.blockPose(i, 1); assert.ok(Math.abs(p.x - T.x) < 1e-9 && Math.abs(p.y - (y - S / 2)) < 1e-9 && p.rot === 0); y -= S; }
  assert.ok(Math.abs(w.towerTop().y - y) < 1e-9);
  T.theta = T._ptheta = 0.1;
  for (let i = 0; i < n; i++) assert.ok(Math.abs(w.blockPose(i, 1).rot - 0.1 * (i + 1) / n) < 1e-12);
  assert.ok(w.towerTop().x > T.x, 'positive θ leans the top to the right');
  T.theta = T._ptheta = 0; T.blocks[0].sy = 0.8;
  assert.ok(Math.abs(w.blockPose(0, 1).y - (T.baseTop - 0.4 * S)) < 1e-9, 'squashed about its bottom');
  assert.ok(Math.abs(w.blockPose(1, 1).y - (T.baseTop - 0.8 * S - 0.5 * S)) < 1e-9, 'the next one sits on it');
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
  run(w, 0.5); assert.ok(R.glow > 0.8, 'the right block glows');
  // grabbing the right block hides the hand
  const g = R; w.pointerDown(g.x, g.y); w.pointerMove(g.x, g.y - 40); assert.strictEqual(w.hintHand, null); w.cancelDrag();
});

test('world: stars per tower 3 / 2 / 1 for 0 / 1 / ≥ 2 wrong drops; towers of ≥ 4 blocks forgive one slip', () => {
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
    assert.strictEqual(e.stars, want, 'tower of ' + w.cur.n + ', ' + wrongN + ' wrong');
    assert.strictEqual(e.misses, wrongN);
  }
});

test('world: idle nudges at 12 s, then ×1.5 up to 20 s; every idle hints; a real grab resets; Lulu taps do not (3rd glows); resetNudges', () => {
  const w = mkWorld({ age: 4 }); roundOf(w, 'colors', 2); evs(w);
  run(w, 12.05); let e = evs(w); assert.ok(e.some(x => x.type === 'idle' && x.n === 1)); assert.ok(e.some(x => x.type === 'hint' && x.idle), 'the 1st idle hints');
  run(w, 18); e = evs(w); assert.ok(e.some(x => x.type === 'idle' && x.n === 2)); assert.ok(e.some(x => x.type === 'hint' && x.idle));
  run(w, 20); assert.ok(evs(w).some(x => x.type === 'idle' && x.n === 3), 'gap capped at 20 s');
  w.resetNudges(); run(w, 11); assert.ok(!evs(w).some(x => x.type === 'idle'));
  const p = wrongP(w); w.pointerDown(p.x, p.y); w.pointerMove(p.x, p.y - 50); run(w, 0.2); w.cancelDrag();
  run(w, 11); assert.ok(!evs(w).some(x => x.type === 'idle'), 'the grab reset the clock');
  const w2 = mkWorld({ age: 4 }); roundOf(w2, 'colors', 2); evs(w2);
  const L = w2.luluHit();
  for (let i = 0; i < 3; i++) { w2.pointerDown(L.x, L.y); run(w2, 0.1); assert.strictEqual(w2.pointerUp(L.x, L.y), 'pokeLulu'); run(w2, 2); }
  e = evs(w2); assert.strictEqual(e.filter(x => x.type === 'pokeLulu').length, 3); assert.ok(e.some(x => x.type === 'hint'), '3rd Lulu tap hints');
  assert.strictEqual(e.filter(x => x.type === 'hint').length, 1, 'only the 3rd');
  assert.ok(e.find(x => x.type === 'pokeLulu').promptKey === 'p.colors');
  run(w2, 6.5); assert.ok(evs(w2).some(x => x.type === 'idle'), 'Lulu taps did not reset idle');
  // a long press on Lulu is not a poke
  w2.pointerDown(L.x, L.y); run(w2, 0.5); assert.strictEqual(w2.pointerUp(L.x, L.y), null);
});

test('world: a child who only taps — block taps count as soft taps (3rd hints); a tap on the hinted right block hops it onto the tower', () => {
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
  assert.ok(apex < w.towerTop().y - 0.5 * w.layout.S, 'hops up over the tower');
  assert.ok(evs(w).some(x => x.type === 'stack'));
  // a tap on the tower once the block of the next ask was hinted sends it up too; grass taps are soft taps
  untilPhase(w, 'ask', 20000); evs(w);
  const D = w.layout.drop, gx = (D.x0 + D.x1) / 2, gy = w.towerTop().y - 40;
  for (let i = 0; i < 3; i++) { w.pointerDown(gx, gy); w.update(0.05); assert.strictEqual(w.pointerUp(gx, gy), i < 3 ? null : 'drop'); w.update(0.3); }
  assert.ok(evs(w).some(x => x.type === 'hint'), 'the 3rd tower tap hints');
  const R2 = rightP(w), n2 = w._liveCount();
  w.pointerDown(gx, gy); w.update(0.05); assert.strictEqual(w.pointerUp(gx, gy), 'drop');
  assert.ok(evs(w).some(x => x.type === 'drop' && x.assisted && x.via === 'tower' && x.pieceId === R2.id));
  until(w, () => w._liveCount() === n2 + 1 || w.phase === 'done');
  while (w.phase !== 'done') { untilPhase(w, 'ask', 20000); dragToTower(w, rightP(w)); until(w, () => w.phase === 'deal' || w.phase === 'done'); }
  until(w, () => w.events.some(x => x.type === 'roundDone'), 40000);
  const rd = w.drainEvents().find(x => x.type === 'roundDone'); assert.ok(rd.assists >= 2 && rd.stars === 1, 'assisted stacks count like misses for the stars');
  // grace assist: the hinted right block let go on the grass hops onto the tower anyway
  const w3 = mkWorld({ age: 4 }); roundOf(w3, 'colors', 2); evs(w3);
  const Q3 = rightP(w3), L3 = w3.layout;
  assert.strictEqual(drag(w3, Q3, L3.lulu.x + 40, L3.groundY - 300), 'miss', 'not hinted yet: a plain miss');
  until(w3, () => Q3.state === 'rest'); w3.hint(); evs(w3);
  const n3 = w3._liveCount();
  assert.strictEqual(drag(w3, Q3, L3.lulu.x + 40, L3.groundY - 300), 'drop');
  assert.ok(evs(w3).some(x => x.type === 'drop' && x.assisted && x.via === 'grace'));
  until(w3, () => w3._liveCount() === n3 + 1);
  // a wrong block let go on the grass is still a plain miss
  untilPhase(w3, 'ask', 20000); w3.hint(); const X3 = wrongP(w3); assert.strictEqual(drag(w3, X3, L3.lulu.x + 40, L3.groundY - 300), 'miss');
  // the random tapper and the 6×/s spammer finish a session now
  for (const mode of ['tapper', 'spammer']) {
    const v = mkWorld({ age: 4, seed: 8 }), r = new JT.RNG(3); let t = 0, next = 0;
    while (v.state !== 'sessionDone' && v.time < 2400) {
      if (v.state === 'talk' && !v.talkAnswered && v.stateTime > 2) v.talkAnswer(v.talk.choices[0].id);
      if (v.time >= next) {
        next = v.time + (mode === 'spammer' ? 1 / 6 : r.float(0.3, 1.5));
        let x = r.float(0, v.layout.W), y = r.float(0, v.layout.H);
        if (mode === 'spammer' && v.pieces.length) { const q = r.pick(v.pieces); x = q.x; y = q.y; }
        v.pointerDown(x, y); v.pointerUp(x, y);
      }
      v.update(1 / 30); v.drainEvents(); t++;
    }
    assert.strictEqual(v.state, 'sessionDone', mode + ' finishes (' + v.time.toFixed(0) + ' s)');
  }
});

test('world: tower done — towerDone, count 1…n every 0.35 s bottom → top, bloom, monkey pendulum stops at the bananas, roundDone, clear top first', () => {
  const w = mkWorld({ age: 5 }); roundOf(w, 'colors', 2);
  assert.strictEqual(w.cur.n, 4);
  for (let k = 0; k < 4; k++) { dragToTower(w, rightP(w)); if (k < 3) untilPhase(w, 'ask', 20000); }
  untilPhase(w, 'done'); evs(w);
  assert.ok(w.lulu.mood === 'cheer' || w.lulu.mood === 'happy');
  const log = [];
  let grabV = null, monkeyMinX = 1e9;
  until(w, () => {
    for (const e of w.drainEvents()) log.push([e.type, w.time, e]);
    if (w.monkey) monkeyMinX = Math.min(monkeyMinX, w.monkey.x);
    if (w.monkey && w.monkey.state === 'grab' && grabV === null) grabV = w.monkey.omega;
    return log.some(x => x[0] === 'round');
  }, 60000);
  const ty = log.map(x => x[0]);
  const counts = log.filter(x => x[0] === 'count');
  assert.deepStrictEqual(counts.map(x => x[2].i), [1, 2, 3, 4]);
  for (let i = 1; i < 4; i++) { assert.ok(Math.abs(counts[i][1] - counts[i - 1][1] - CFG.countStep) < 0.02); assert.ok(counts[i][2].y < counts[i - 1][2].y, 'bottom → top'); }
  const ix = t => ty.indexOf(t);
  assert.ok(ix('count') < ix('bloom') && ix('bloom') < ix('monkey') && ix('monkey') < ix('bananas') && ix('bananas') < ix('roundDone') && ix('roundDone') < ix('clearBlock'));
  const mk = log.find(x => x[0] === 'monkey')[2], bn = log.find(x => x[0] === 'bananas')[2];
  assert.ok(mk.x > w.layout.W, 'the monkey swings in from beyond the right edge');
  assert.strictEqual(grabV, 0);
  assert.ok(monkeyMinX < bn.x + 0.4 * w.layout.goalH, 'reaches the bananas');
  const tDone = log.find(x => x[0] === 'roundDone')[1] - log[0][1];
  assert.ok(tDone > 2 && tDone < 5, 'done ≈ 3.5 s (' + tDone.toFixed(2) + ')');
  const cl = log.filter(x => x[0] === 'clearBlock');
  assert.deepStrictEqual(cl.map(x => x[2].i), [4, 3, 2, 1], 'top first');
  assert.ok(ty.includes('round'), 'next tower');
  assert.strictEqual(w.tower.blocks.length, 0);
});

test('world: chapter time limit — after ≥ 2 towers and > 80 s (or a predicted > 100 s) → Talk time; Talk re-asks every 12 s, glow from the 2nd', () => {
  const w = mkWorld({ age: 4 }); w.levels = ['colors', 'shapes', 'count', 'animals']; w.startLevel(0);
  const b = new JT.Bot(w, { skill: 1, seed: 1, think: [7, 8] });
  let towers = 0;
  while (w.state !== 'talk' && w.time < 600) { b.step(1 / 30); w.update(1 / 30); for (const e of w.drainEvents()) if (e.type === 'roundDone') towers++; }
  assert.strictEqual(w.state, 'talk'); assert.ok(towers >= 2 && towers < 4, 'cut after ' + towers); assert.strictEqual(w.roundsPerLevel, towers);
  run(w, 12.05); let e = evs(w).find(x => x.type === 'talkAsk'); assert.ok(e && e.n === 1 && !e.glowAnswer);
  run(w, 12); e = evs(w).find(x => x.type === 'talkAsk'); assert.ok(e && e.n === 2 && e.glowAnswer && w.talk.glowAnswer);
  assert.strictEqual(w.talkAnswer(w.talk.answerId), true); assert.ok(evs(w).some(x => x.type === 'talkResult' && x.correct));
  run(w, 1.7); assert.ok(evs(w).some(x => x.type === 'levelDone'));
});

test('world: breeze surprise — gust after the 2nd stack, Lulu holds (1.5 s), the stack sways ≤ 0.12 rad and settles', () => {
  const w = mkWorld({ age: 4 }); roundOf(w, 'colors', 2, 'breeze');
  assert.strictEqual(w.surprise, 'breeze');
  dragToTower(w, rightP(w)); untilPhase(w, 'ask', 20000);
  dragToTower(w, rightP(w)); until(w, () => w._liveCount() === 2); evs(w);
  run(w, 0.5); w.tower.theta *= 0; w.tower.omega *= 0;   // measure the gust alone (the landing sway is tested elsewhere)
  let gust = null, peak = 0, held = 0;
  run(w, 3.5, () => { for (const e of w.drainEvents()) if (e.type === 'gust') gust = e; peak = Math.max(peak, Math.abs(w.tower.theta)); if (w.lulu.mood === 'hold') held += H; });
  assert.ok(gust, 'gust event'); assert.ok(peak > 0.05 && peak <= 0.12 + 1e-9, 'gust sway ' + peak);
  assert.ok(Math.abs(held - CFG.holdTime) < 0.05, 'Lulu holds ' + held.toFixed(2));
  assert.ok(Math.abs(w.tower.theta) < 0.02 && w.wind === 0, 'calm again');
  // no breeze in other rounds
  const w2 = mkWorld({ age: 4 }); roundOf(w2, 'colors', 1);
  for (let k = 0; k < 3; k++) { dragToTower(w2, rightP(w2)); untilPhase(w2, k < 2 ? 'ask' : 'done', 20000); }
  assert.ok(!evs(w2).some(e => e.type === 'gust'));
});

test('world: butterfly surprise — flutters in once, sits on the tower top 4 s; a tap → butterflyTap (no score); it leaves when a block falls', () => {
  const w = mkWorld({ age: 4 }); roundOf(w, 'colors', 2, 'butterfly');
  dragToTower(w, rightP(w)); untilPhase(w, 'ask', 20000);
  until(w, () => w.butterfly && w.butterfly.state === 'sit', 6000);
  const B = w.butterfly, top = w.towerTop();
  assert.ok(Math.abs(B.x - top.x) < 12 && Math.abs(B.y - (top.y - 10)) < 12, 'on the tower top');
  assert.ok(evs(w).some(e => e.type === 'butterfly'));
  const st = w.stars, m = w.misses;
  assert.strictEqual(w.pointerDown(B.x, B.y), 'butterfly');
  assert.ok(evs(w).some(e => e.type === 'butterflyTap'));
  assert.strictEqual(B.state, 'away'); run(w, 1.3); assert.strictEqual(w.butterfly, null);
  assert.strictEqual(w.stars, st); assert.strictEqual(w.misses, m);
  run(w, 10); assert.strictEqual(w.butterfly, null, 'once per round');
  // a falling block sends it away
  const w2 = mkWorld({ age: 4, seed: 5 }); roundOf(w2, 'colors', 2, 'butterfly');
  dragToTower(w2, rightP(w2)); untilPhase(w2, 'ask', 20000);
  until(w2, () => w2.butterfly && w2.butterfly.state === 'sit', 6000);
  dragToTower(w2, rightP(w2)); assert.strictEqual(w2.butterfly.state, 'away');
});

test('world: rotation / resize mid-drag, mid-fall (right lands, wrong bounces home), mid-deal, mid-done, mid-clear — everything snaps and goes on', () => {
  const flip = w => { const L = w.layout; w.setViewport(L.H, L.W, L.portrait ? { top: 0, right: 44, bottom: 21, left: 44 } : { top: 47, right: 0, bottom: 34, left: 0 }); };
  const check = (w, tag) => {
    for (const p of w.pieces) { assert.ok(onScreen(w, p.x, p.y, 1) && p.state !== 'drag' && p.state !== 'fall', tag + ' piece ' + p.state); if (p.state === 'rest') assert.ok(Math.abs(p.x - p.homeX) < 1e-6); }
    for (let i = 0; i < w.tower.blocks.length; i++) { const q = w.blockPose(i, 1); assert.ok(onScreen(w, q.x, q.y, 1), tag + ' tower block'); }
    assert.strictEqual(w._press, null);
  };
  for (const vp of [VIEWPORTS[8], VIEWPORTS[3]]) {
    let w = mkWorld({ age: 4, vp }); roundOf(w, 'colors', 2);
    // mid-drag
    const p = rightP(w); w.pointerDown(p.x, p.y); w.pointerMove(p.x - 100, p.y - 200); run(w, 0.2);
    flip(w); check(w, 'mid-drag'); assert.strictEqual(w.pointerUp(10, 10), null);
    // mid-fall, right block → lands at once
    let d = w.dropPoint(); drag(w, rightP(w), d.x, d.y - 150); assert.strictEqual(rightP(w).state, 'fall');
    const n0 = w._liveCount(); flip(w); check(w, 'mid-fall');
    assert.strictEqual(w._liveCount(), n0 + 1); assert.ok(evs(w).some(e => e.type === 'land'));
    untilPhase(w, 'ask');
    // mid-fall, wrong block → wrong + home
    const X = wrongP(w); d = w.dropPoint(); drag(w, X, d.x, d.y - 150); flip(w); check(w, 'mid-fall wrong');
    assert.ok(evs(w).some(e => e.type === 'wrong')); assert.strictEqual(X.state, 'rest'); assert.strictEqual(w.phase, 'ask');
    run(w, 1);
    // mid-deal
    dragToTower(w, rightP(w)); until(w, () => w.pieces.some(q => q.state === 'in' && q.alpha > 0)); flip(w); check(w, 'mid-deal'); untilPhase(w, 'ask');
    // finish the tower, rotate in done and in clear
    while (w.phase !== 'done') { dragToTower(w, rightP(w)); until(w, () => w.phase === 'ask' || w.phase === 'done'); }
    until(w, () => w.monkey && w.monkey.state === 'in'); flip(w); check(w, 'mid-done');
    assert.ok(w.monkey === null || w.monkey.state !== 'in'); assert.ok(evs(w).some(e => e.type === 'bananas'));
    until(w, () => w.phase === 'clear' && w.tower.blocks.some(b => b.fly)); flip(w); check(w, 'mid-clear');
    until(w, () => w.state === 'round' && w.phase === 'ask', 30000);
    assert.strictEqual(w.round, 3);
    // a same-size setViewport is a no-op (iOS fires resize often)
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

test('world: determinism — same seed + bot → same events; inputs replayed on sub-steps with other frame sizes → same events', () => {
  const runIt = (dt) => {
    const w = mkWorld({ age: 5, seed: 77, surprise: true }), b = new JT.Bot(w, { skill: 0.7, seed: 3 }), all = [];
    let t = 0; while (w.state !== 'sessionDone' && t < 900) { b.step(dt); w.update(dt); t += dt; all.push(...w.drainEvents()); }
    return hashEvents(all);
  };
  assert.strictEqual(runIt(1 / 30), runIt(1 / 30));
  const record = () => {
    const w = mkWorld({ age: 4, seed: 78, surprise: true }), inputs = [], all = [];
    for (const fn of ['pointerDown', 'pointerMove', 'pointerUp', 'talkAnswer', 'cancelDrag']) {
      const o = w[fn].bind(w); w[fn] = (...a) => { inputs.push({ s: Math.round(w.time / CFG.step), fn, a }); return o(...a); };
    }
    const b = new JT.Bot(w, { skill: 0.7, seed: 4 });
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

test('world: prompt() / answerId() / pieceHit() / luluHit() / dropPoint() / interactive / hint() / event fields', () => {
  const w = mkWorld({ age: 4 });
  assert.strictEqual(w.prompt(), null); assert.strictEqual(w.answerId(), null);
  roundOf(w, 'animals', 2);
  const p = w.prompt(); assert.ok(p && (p.promptKey === 'p.animals' || p.promptKey === 'p.sound') && p.params.animal);
  const R = rightP(w); assert.strictEqual(R.block.animal, p.params.animal);
  const h = w.pieceHit(R.id); assert.ok(h.x === R.x && h.w === 2 * (0.6 * w.layout.S + 14));
  const dp = w.dropPoint(); assert.ok(Math.abs(dp.y - (w.layout.tower.baseTop - 1.2 * w.layout.S)) < 1e-9);
  assert.strictEqual(w.interactive, true);
  assert.strictEqual(w.hint(), R.id); assert.ok(w.drainEvents().some(e => e.type === 'hint' && e.pieceId === R.id));
  // event fields main.js needs
  const w2 = mkWorld({ age: 4, surprise: true }), b = new JT.Bot(w2, { skill: 0.7, seed: 2 }), seen = {};
  const need = { level: ['level', 'topic'], round: ['round', 'n', 'asks'], deal: ['ask', 'n', 'pieces'], ask: ['ask', 'asks', 'promptKey', 'params', 'answerId', 'nameKind', 'nameValue'],
    grab: ['pieceId', 'nameKind', 'nameValue', 'x', 'y'], drop: ['pieceId', 'x', 'y'], land: ['pieceId', 'n', 'impact', 'x', 'y'],
    stack: ['n', 'nameKind', 'nameValue', 'block', 'x', 'y', 'promptKey', 'params'], wrong: ['pieceId', 'nameKind', 'nameValue', 'want', 'streak', 'x', 'y'],
    towerDone: ['n'], count: ['i', 'n', 'x', 'y'], bloom: ['n'], monkey: ['x', 'y'], bananas: ['x', 'y'], roundDone: ['round', 'stars', 'misses'],
    clearBlock: ['i', 'x', 'y'], talk: ['talk'], talkResult: ['correct', 'choiceId', 'answerId'], levelDone: ['level', 'stars'], sessionDone: ['stars', 'towers'] };
  while (w2.state !== 'sessionDone' && w2.time < 900) {
    b.step(1 / 30); w2.update(1 / 30);
    for (const e of w2.drainEvents()) if (need[e.type]) { seen[e.type] = 1; for (const f of need[e.type]) assert.ok(e[f] !== undefined, e.type + '.' + f); }
  }
  for (const t of Object.keys(need)) assert.ok(seen[t], 'saw ' + t);
});

// ======================================================================== bot
test('bot: drags right with p ≈ skill (through pointerDown/Move/Up), taps the butterfly sometimes, talks', () => {
  let right = 0, drops = 0, bf = 0, talks = 0;
  for (let s = 0; s < 4; s++) {
    const w = mkWorld({ age: 4, seed: 30 + s, surprise: true }), b = new JT.Bot(w, { skill: 0.7, seed: s, butterfly: 1 });
    while (w.state !== 'sessionDone' && w.time < 900) { b.step(1 / 30); w.update(1 / 30); w.drainEvents(); }
    right += b.stats.right; drops += b.stats.drops; bf += b.stats.butterfly; talks += b.stats.talks;
    assert.strictEqual(b.stats.misses, 0, 'the bot always reaches the drop zone');
  }
  const fr = right / drops;
  assert.ok(fr > 0.6 && fr < 0.9, 'right fraction ' + fr.toFixed(2));   // hints push it above 0.7
  assert.ok(bf > 0 && talks === 16);
});

// ======================================================================== weather
test('weather: morning/noon/sunset/night, hex ambient, 2.5 s crossfade, mist, fireflies + stars at night, starry party, cap 120, deterministic', () => {
  const wx = new JT.Weather({ width: 1280, height: 720, seed: 3 });
  const sprites = new Set(JT.Weather.SPRITES);
  for (let m = 0; m < 4; m++) {
    wx.setWeather(m);
    for (let k = 0; k < 600; k++) { wx.update(1 / 60); assert.ok(wx.particles.length <= 120); }
    const a = wx.ambient;
    for (const key of ['skyTop', 'skyBottom', 'skyMid']) assert.ok(/^#[0-9A-F]{6}$/.test(a[key]), key);
    for (const key of ['sun', 'sunX', 'sunY', 'moon', 'darkness', 'mist', 'wind', 'gust']) assert.ok(isFinite(a[key]), key);
    assert.strictEqual(a.skyTop, JT.Weather.SKY[m].top); assert.strictEqual(a.mood, JT.Weather.NAMES[m]); assert.strictEqual(a.env, a.mood);
    assert.ok(wx.particles.every(p => sprites.has(p.sprite)), 'known sprites');
    for (const k of ['confetti', 'puff', 'sparkle', 'stars', 'leaves', 'petals', 'pollen', 'rustle']) wx.burst(640, 360, { kind: k, n: 30 });
    assert.ok(wx.particles.length <= 120);
    for (let k = 0; k < 200; k++) wx.update(1 / 60);
  }
  const make = s => { const x = new JT.Weather({ seed: 4, weather: s }); for (let k = 0; k < 300; k++) x.update(1 / 60); return x; };
  const kinds = s => new Set(make(s).particles.map(p => p.sprite));
  assert.ok(kinds(0).has('pollen')); assert.ok(make(0).mist.some(m => m.alpha > 0.2), 'morning mist');
  assert.ok(kinds(1).has('leaf_a') && kinds(1).has('sparkle')); assert.ok(kinds(2).has('petal'));
  const n = make(3); assert.ok(n.particles.some(p => p.sprite === 'firefly' && p.glow > 0) && n.particles.some(p => p.layer === 'sky' && p.sprite === 'star'));
  assert.strictEqual(n.ambient.darkness, 0.45); assert.strictEqual(n.ambient.moon, 1); assert.strictEqual(make(1).ambient.darkness, 0);
  wx.setWeather(1); for (let k = 0; k < 75; k++) wx.update(1 / 60); const mid = wx.ambient.skyTop; for (let k = 0; k < 78; k++) wx.update(1 / 60);
  assert.ok(mid !== JT.Weather.SKY[3].top && mid !== JT.Weather.SKY[1].top); assert.strictEqual(wx.ambient.skyTop, JT.Weather.SKY[1].top);
  wx.setNight(true); for (let k = 0; k < 160; k++) wx.update(1 / 60);
  assert.strictEqual(wx.ambient.darkness, 0.45); assert.ok(wx.particles.some(p => p.sprite === 'firefly'), 'party fireflies at noon');
  const p = new JT.Weather({ seed: 9 }), q = new JT.Weather({ seed: 9 });
  for (let k = 0; k < 300; k++) { p.update(1 / 60); q.update(1 / 60); }
  assert.deepStrictEqual(p.particles, q.particles);
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
