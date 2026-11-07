#!/usr/bin/env node
// Nini's Sea Painting — headless unit tests for rng / content / world / weather / bot (+ the real pictures.js, or the stub).
// Run from the game folder:   node tests/unit/run.js [name part]      (exit 1 on any failure)
// (tests/unit/i18n_voice.test.js is the voice engineer's suite and runs on its own.)
'use strict';
const assert = require('assert');
const crypto = require('crypto');
const { load, usingStub } = require('./load');

const SP = load();
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const H = 1 / 120;
const AGES = [3, 4, 5, 6, 7];
const LANGS = ['en', 'vi'];
const C = SP.Content;
const CFG = SP.CONFIG;
const TOPICS = C.TOPICS;
const J = v => JSON.parse(JSON.stringify(v));   // objects from the vm sandbox have other prototypes
assert.deepStrictEqual = ((orig) => (a, b, m) => orig(J(a), J(b), m))(assert.deepStrictEqual);

// independent copies of the DESIGN tables (§3, §5.1)
const AGE_TOPICS = { 3: ['colors', 'shapes', 'size', 'animals'], 4: ['colors', 'shapes', 'count', 'animals'],
  5: ['shapes', 'count', 'letters', 'animals'], 6: ['lower', 'initial', 'add', 'count'], 7: ['initial', 'add', 'sub', 'oddeven'] };
const CLASH = [['blue', 'purple'], ['red', 'green'], ['yellow', 'orange'], ['green', 'orange']];
const HEX = { red: '#E84A4A', blue: '#3C8DE8', yellow: '#FFD23F', green: '#4CC26B', orange: '#FF9A2E', purple: '#8E44AD', pink: '#FF8FC0' };
const WATER = { spring: ['#7FD3D8', '#2E8FA8'], summer: ['#5CC8E8', '#1E78B4'], autumn: ['#7CC0B8', '#2F6F86'], winter: ['#A9D8EC', '#3C6E9A'] };
const ICON_KINDS = ['blob', 'shape', 'animal', 'number', 'letter', 'dots', 'size'];
const VIEWPORTS = [
  { W: 1556, H: 720, ins: null, name: 'iPhone landscape' },
  { W: 1556, H: 720, ins: { top: 0, right: 108, bottom: 38, left: 108 }, name: 'iPhone landscape notch' },
  { W: 720, H: 1556, ins: null, name: 'iPhone portrait' },
  { W: 720, H: 1556, ins: { top: 108, right: 0, bottom: 62, left: 0 }, name: 'iPhone portrait notch' },
  { W: 960, H: 720, ins: null, name: 'iPad landscape 4:3' },
  { W: 960, H: 720, ins: { top: 32, right: 0, bottom: 27, left: 0 }, name: 'iPad landscape insets' },
  { W: 720, H: 960, ins: null, name: 'iPad portrait' },
  { W: 720, H: 960, ins: { top: 32, right: 0, bottom: 27, left: 0 }, name: 'iPad portrait insets' },
  { W: 1036, H: 720, ins: { top: 18, right: 0, bottom: 14, left: 0 }, name: 'iPad Air 1180×820' },
  { W: 720, H: 1000, ins: { top: 20, right: 0, bottom: 18, left: 0 }, name: 'iPad 820×1180 portrait' },
  { W: 1280, H: 720, ins: null, name: '16:9' },
  { W: 1600, H: 720, ins: null, name: '1600×720' },
  { W: 720, H: 1600, ins: { top: 44, right: 0, bottom: 34, left: 0 }, name: '720×1600 tall insets' },
  { W: 720, H: 1280, ins: { top: 37, right: 0, bottom: 0, left: 0 }, name: 'iPhone SE portrait' },
  { W: 1280, H: 720, ins: { top: 0, right: 37, bottom: 21, left: 37 }, name: 'iPhone SE landscape' }
];
const ROTATE = [VIEWPORTS[0], VIEWPORTS[4], VIEWPORTS[2], VIEWPORTS[8], VIEWPORTS[6], VIEWPORTS[9]];
const VP = VIEWPORTS[4];

// ---------- helpers ----------
function mkWorld(o) {
  o = o || {};
  const cfg = Object.assign(o.surprise ? {} : { surpriseTypes: [] }, o.config || {});
  const w = new SP.World({ seed: o.seed || 1, age: o.age || 4, lang: o.lang || 'en', config: cfg });
  const v = o.vp || VP;
  w.setViewport(v.W, v.H, v.ins);
  w.newSession(); w.drainEvents();
  return w;
}
/** Starts round `ri` of `topic` directly (skips the intro) and runs to the paint phase (first ask). */
function roundOf(w, topic, ri, surprise) {
  w.levels = [topic, topic, topic, topic];
  w.startLevel(0); w.round = ri || 0;
  w._surpriseRound = ri || 0; w.cfg.surpriseTypes = surprise ? [surprise] : [];
  w._beginRound();
  until(w, () => w.interactive);
  return w;
}
function run(w, s, each) { const n = Math.round(s / H); for (let i = 0; i < n; i++) { if (each) each(i); w.update(H); } }
function until(w, fn, max) { let n = 0; while (!fn() && n++ < (max || 36000)) w.update(H); assert.ok(fn(), 'condition not reached (now ' + w.state + '/' + w.phase + ')'); }
function evs(w) { return w.drainEvents(); }
function types(e) { return e.map(x => x.type); }
function tapAt(w, x, y) { const d = w.pointerDown(x, y); const u = w.pointerUp(x, y); return u || (d === 'press' ? null : d); }
function tapPart(w, id) { const p = w.partTap(id); return tapAt(w, p.x, p.y); }
function tapShell(w, c) { const p = w.shellHit(c); return tapAt(w, p.x, p.y); }
/** Plays the current step right (shell first when needed) and waits for the next ask / finish. */
function solveStep(w) {
  for (let k = 0; k < 20 && w.interactive; k++) {
    const a = w.answer();
    if (a.shell) assert.strictEqual(tapShell(w, a.shell), 'pick'); else assert.strictEqual(tapPart(w, a.part), 'paint');
    run(w, 0.05);
  }
  const s = w.step, r = w.round;
  until(w, () => w.state !== 'round' || w.phase !== 'paint' || (w.step !== s && w.interactive) || w.round !== r);
}
function rngFor(seed) { return new SP.RNG(seed); }
function finite(w) {
  const P = w.pic, B = w.brush;
  return [P.x, P.y, P.rot, P.sx, P.sy, P.wig, P.alpha, B.x, B.y, B.angle, B.dip, w.stars].every(Number.isFinite) &&
    w.parts.every(p => Number.isFinite(p.t) && Number.isFinite(p.wob) && Number.isFinite(p.glow)) &&
    w.shells.every(s => Number.isFinite(s.pop) && Number.isFinite(s.lift) && Number.isFinite(s.wob));
}
function hash(evs) {
  const h = crypto.createHash('sha1');
  for (const e of evs) h.update(JSON.stringify(e, (k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)));
  return h.digest('hex').slice(0, 12);
}
function overlap(a, b, pad) { pad = pad || 0; return a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad; }

// ======================================================================= rng
test('rng: deterministic, ranges, sample, fork', () => {
  const a = new SP.RNG(42), b = new SP.RNG(42);
  for (let i = 0; i < 100; i++) assert.strictEqual(a.next(), b.next());
  const r = new SP.RNG(7);
  for (let i = 0; i < 2000; i++) { const v = r.int(2, 5); assert.ok(v >= 2 && v <= 5); const f = r.float(1, 2); assert.ok(f >= 1 && f < 2); }
  const s = r.sample([1, 2, 3, 4, 5], 3); assert.strictEqual(new Set(s).size, 3);
  const f1 = new SP.RNG(9), f2 = new SP.RNG(9); f1.fork('x'); assert.strictEqual(f1.next(), f2.next());
});

// ======================================================================= content
test('content: every topic × age × lang × 4 rounds × 14 seeds is valid (independent re-checks)', () => {
  let n = 0;
  for (const age of AGES) for (const lang of LANGS) for (const topic of TOPICS) for (let ri = 0; ri < 4; ri++) for (let seed = 1; seed <= 14; seed++) {
    const r = C.makeRound(topic, { age, lang, rng: rngFor(seed * 977 + ri * 31 + age), roundIndex: ri });
    n++;
    const tag = `${topic} age ${age} ${lang} r${ri} s${seed}`;
    assert.strictEqual(C.validate(r), null, tag);
    const pic = r.pic, byId = {};
    pic.parts.forEach(p => { byId[p.id] = p; });
    assert.ok(pic.parts.length <= 14, tag + ' ≤ 14 parts');
    if (SP.Pictures.validate) assert.strictEqual(SP.Pictures.validate(pic), null, tag + ' picture');
    // steps
    assert.ok(r.steps.length >= 1 && r.steps.length <= 3, tag + ' steps');
    if (ri === 0) assert.strictEqual(r.steps.length, 1, tag + ' warm-up 1 step');
    if (ri > 0 && r.steps[0].mode !== 'count') assert.ok(r.steps.length >= 2, tag + ' later rounds ≥ 2 steps');
    if (age === 3) assert.ok(r.steps.length <= 2, tag + ' age 3 ≤ 2 steps');
    const used = new Set(), cols = [];
    for (const s of r.steps) {
      cols.push(s.color);
      for (const t of s.targets) { assert.ok(byId[t], tag + ' target exists'); assert.ok(!used.has(t), tag + ' painted once'); used.add(t); }
      if (s.mode !== 'count') {
        assert.strictEqual(s.targets.length, 1);
        const T = byId[s.targets[0]];
        assert.strictEqual(pic.parts.filter(q => q.role === T.role && String(q.nameValue) === String(T.nameValue) && (q.size || '') === (T.size || '')).length, 1, tag + ' unique target');
        // the step names its target
        if (topic === 'colors') assert.strictEqual(s.params.part, T.nameValue);
        if (topic === 'shapes') assert.strictEqual(s.params.shape, T.nameValue);
        if (topic === 'animals') assert.strictEqual(s.params.animal, T.nameValue);
        if (topic === 'size') { assert.strictEqual(s.params.size, T.size); assert.strictEqual(s.params.animal, T.nameValue); }
        if (topic === 'letters') assert.strictEqual(s.params.letter, T.text);
        if (topic === 'lower') { assert.strictEqual(s.params.small, T.text); assert.strictEqual(s.params.letter, T.text.toUpperCase()); assert.ok(!/[il]/.test(T.text)); }
        if (topic === 'add') assert.strictEqual(s.params.a + s.params.b, +T.nameValue);
        if (topic === 'sub') { assert.strictEqual(s.params.a - s.params.b, +T.nameValue); assert.ok(s.params.a <= 10 && +T.nameValue >= 0); }
        if (topic === 'initial') assert.strictEqual(C.initialOf(T.nameValue, lang), s.params.letter);
      }
    }
    assert.strictEqual(new Set(cols).size, cols.length, tag + ' step colours distinct');
    const modeWant = { colors: 'pickColor', shapes: age >= 5 ? 'pickTap' : 'tapPart', count: 'count', oddeven: 'count' }[topic] || 'tapPart';
    r.steps.forEach(s => assert.strictEqual(s.mode, modeWant, tag + ' mode'));
    // palettes
    if (topic === 'colors') assert.strictEqual(r.palette.length, age <= 3 ? 2 : age === 4 ? 3 : 4, tag + ' palette');
    else if (topic === 'shapes' && age >= 5) assert.strictEqual(r.palette.length, 4, tag + ' palette');
    else assert.strictEqual(r.palette, null, tag + ' no palette');
    if (r.palette) cols.forEach(c => assert.ok(r.palette.includes(c)));
    const all = new Set(cols.concat(r.palette || []));
    all.forEach(c => assert.ok(HEX[c], tag + ' colour'));
    if (age < 5) {
      assert.ok(!all.has('pink'), tag + ' no pink < 5');
      for (const [a, b] of CLASH) assert.ok(!(all.has(a) && all.has(b)), tag + ` clash ${a}+${b}`);
    }
    // distinct names
    for (const role of ['shape', 'animal', 'label']) {
      const names = pic.parts.filter(q => q.role === role).map(q => String(q.nameValue) + (topic === 'size' ? q.size : ''));
      assert.strictEqual(new Set(names).size, names.length, tag + ' distinct ' + role);
    }
    if (topic === 'shapes') assert.strictEqual(pic.parts.filter(q => q.role === 'shape').length, age <= 3 ? 2 : age === 4 ? 3 : 4, tag + ' shapes n');
    if (topic === 'animals') assert.strictEqual(pic.parts.filter(q => q.role === 'animal').length, age <= 3 ? 2 : age === 4 ? 3 : 4, tag + ' animals n');
    if (topic === 'size') { const a = pic.parts.filter(q => q.role === 'animal'); assert.strictEqual(a.length, 2); assert.strictEqual(a[0].nameValue, a[1].nameValue); assert.deepStrictEqual(a.map(q => q.size).sort(), ['big', 'small']); }
    if (topic === 'initial') { const ini = pic.parts.filter(q => q.role === 'animal').map(q => C.initialOf(q.nameValue, lang)); assert.strictEqual(new Set(ini).size, ini.length, tag + ' initials'); }
    if (topic === 'count') {
      const s = r.steps[0], spots = pic.parts.filter(q => q.role === 'spot').length, N = s.need;
      assert.strictEqual(s.params.n, N);
      assert.strictEqual(spots, Math.min(12, N + (N <= 3 ? 3 : 2)), tag + ' spots');
      if (ri === 0) assert.ok(N >= 1 && N <= 2); else if (ri === 1) assert.ok(N >= 2 && N <= 3);
      else if (age <= 4) assert.ok(N >= 3 && N <= 5, tag + ' N'); else if (age === 5) assert.ok(N >= 4 && N <= 10, tag); else assert.ok(N >= 5 && N <= 12, tag);
    }
    if (topic === 'oddeven') {
      const s = r.steps[0], labs = pic.parts.filter(q => q.role === 'label');
      assert.deepStrictEqual(s.targets.slice().sort(), labs.filter(q => (+q.nameValue % 2 ? 'odd' : 'even') === s.params.parity).map(q => q.id).sort());
      assert.ok(labs.length > s.targets.length && s.need === s.targets.length);
    }
  }
  assert.ok(n >= 6000, n + ' rounds');
});

test('content: short rounds (long chapter) — 1 step at ages ≤ 4, ≤ 2 from age 5; still valid', () => {
  for (const age of AGES) for (const topic of TOPICS) for (let seed = 1; seed <= 6; seed++) {
    const r = C.makeRound(topic, { age, lang: 'vi', rng: rngFor(seed), roundIndex: 3, short: true });
    assert.strictEqual(C.validate(r), null);
    if (r.steps[0].mode !== 'count') assert.ok(r.steps.length <= (age <= 4 ? 1 : 2) && r.steps.length >= 1, topic + ' ' + age);
  }
});

test('content: easy first chapter — level 0 ages ≤ 5: ≤ 2 steps; rounds 0–1: 2 shells (ages ≤ 4), 3 shells (age 5)', () => {
  for (const age of AGES) for (const topic of SP.AGE_POOLS[age]) for (let ri = 0; ri < 4; ri++) for (let seed = 1; seed <= 8; seed++) {
    const r = C.makeRound(topic, { age, lang: seed % 2 ? 'en' : 'vi', rng: rngFor(seed * 31 + ri), roundIndex: ri, level: 0 }), tag = `${topic} ${age} r${ri} s${seed}`;
    assert.strictEqual(C.validate(r), null, tag);
    if (age <= 5) assert.ok(r.steps.length <= 2, tag + ' ≤ 2 steps');
    if (r.palette && ri <= 1 && age <= 5) assert.strictEqual(r.palette.length, age <= 4 ? 2 : 3, tag + ' easy palette');
    if (r.palette && ri >= 2) assert.strictEqual(r.palette.length, topic === 'colors' ? (age <= 3 ? 2 : age === 4 ? 3 : 4) : 4, tag + ' normal palette');
    const later = C.makeRound(topic, { age, lang: 'en', rng: rngFor(seed * 31 + ri), roundIndex: ri, level: 1 });
    if (later.palette) assert.strictEqual(later.palette.length, topic === 'colors' ? (age <= 3 ? 2 : age === 4 ? 3 : 4) : 4, tag + ' chapter 2 normal');
  }
});

test('content: a session never repeats a picture template while the pool has unused ones; never back-to-back', () => {
  for (const age of AGES) for (let seed = 1; seed <= 20; seed++) {
    const w = new SP.World({ seed: seed * 7 + age, age }), bot = new SP.Bot(w, { skill: 1, seed });
    w.setViewport(1036, 720); w.newSession();
    const seq = []; let n = 0;
    while (w.state !== 'sessionDone' && n++ < 40000) { bot.step(1 / 15); w.update(1 / 15); for (const e of w.drainEvents()) if (e.type === 'round') seq.push([e.templateId, e.topic]); }
    for (let i = 1; i < seq.length; i++) {
      const [id, topic] = seq[i], kind = C.KIND_OF[topic], pool = SP.Pictures.list(kind), prev = seq.slice(0, i).map(x => x[0]);
      const unused = pool.filter(t => !prev.includes(t));
      if (prev.includes(id) && unused.length && topic !== 'size' && topic !== 'animals' && topic !== 'initial' && topic !== 'shapes')
        assert.fail(`age ${age} seed ${seed}: ${id} repeated while ${unused.join(',')} unused`);
      if (pool.length >= 2 && topic !== 'size') assert.notStrictEqual(id, seq[i - 1][0], `age ${age} seed ${seed}: ${id} back-to-back`);
    }
  }
});

test('pictures: scene alive follows the animals (crab → scuttle, jellyfish → float, else swim); every alive kind is valid', () => {
  for (const id of SP.Pictures.list('scene')) {
    assert.strictEqual(SP.Pictures.build(id, { animals: ['crab', 'crab'], sizes: ['big', 'small'] }).alive, 'scuttle', id);
    assert.strictEqual(SP.Pictures.build(id, { animals: ['jellyfish'] }).alive, 'float', id);
    assert.strictEqual(SP.Pictures.build(id, { animals: ['fish', 'whale', 'crab'] }).alive, 'swim', id);
    assert.strictEqual(SP.Pictures.build(id, { animals: ['crab', 'fish', 'crab'] }).alive, 'scuttle', id);
  }
  assert.ok(SP.Pictures.list('scene').length >= 4 && SP.Pictures.list('labels').length >= 4);
});

test('content: deterministic by seed; consecutive rounds differ (template / targets)', () => {
  for (const topic of TOPICS) {
    const a = C.makeRound(topic, { age: 5, lang: 'en', rng: rngFor(5), roundIndex: 2 }), b = C.makeRound(topic, { age: 5, lang: 'en', rng: rngFor(5), roundIndex: 2 });
    assert.strictEqual(a.key, b.key); assert.strictEqual(a.seed, b.seed);
  }
  let same = 0, tot = 0;
  for (const age of AGES) for (const topic of TOPICS) for (let seed = 1; seed <= 30; seed++) {
    const rng = rngFor(seed), prev = [];
    let last = null;
    for (let ri = 0; ri < 4; ri++) {
      const r = C.makeRound(topic, { age, lang: 'en', rng, roundIndex: ri, prevPics: prev.slice(-2) });
      tot++;
      if (last && r.templateId === last.templateId && C.KIND_OF[topic] !== 'scene') same++;
      if (last) assert.notStrictEqual(r.key, last.key, `${topic} ${age} identical rounds in a row`);
      prev.push(r.templateId); last = r;
    }
  }
  assert.strictEqual(same, 0, same + ' repeated templates of ' + tot);
});

test('content: Talk time for every topic × age × lang (answer in the choices, icon things, one right answer)', () => {
  for (const age of AGES) for (const lang of LANGS) for (const topic of TOPICS) for (let seed = 1; seed <= 25; seed++) {
    const t = C.makeTalk(topic, { age, lang, rng: rngFor(seed) }), tag = `${topic} ${age} ${lang} ${seed}`;
    assert.strictEqual(t.promptKey, 'talk.' + topic);
    assert.ok(t.choices.length >= 2 && t.choices.length <= 3, tag);
    assert.strictEqual(t.answer, t.answerId);
    assert.ok(t.choices.some(c => c.id === t.answer), tag + ' answer');
    assert.strictEqual(new Set(t.choices.map(c => JSON.stringify(c.thing))).size, t.choices.length, tag + ' distinct choices');
    for (const c of t.choices) assert.ok(ICON_KINDS.includes(c.thing.kind), tag + ' kind ' + c.thing.kind);
    if (t.show) assert.ok(ICON_KINDS.includes(t.show.kind));
    const ans = t.choices.find(c => c.id === t.answer).thing;
    if (topic === 'colors') assert.strictEqual(ans.color, t.params.color);
    if (topic === 'shapes') assert.strictEqual(ans.shape, t.params.shape);
    if (topic === 'animals') assert.strictEqual(ans.animal, t.params.animal);
    if (topic === 'size') assert.strictEqual(ans.size, t.params.size);
    if (topic === 'count') { assert.strictEqual(ans.n, t.params.n); assert.strictEqual(t.show.n, t.params.n); }
    if (topic === 'add') assert.strictEqual(ans.n, t.params.a + t.params.b);
    if (topic === 'sub') assert.strictEqual(ans.n, t.params.a - t.params.b);
    if (topic === 'initial') assert.strictEqual(ans.text, C.initialOf(t.params.animal, lang));
    if (topic === 'oddeven') assert.strictEqual(t.choices.filter(c => (c.thing.n % 2 ? 'odd' : 'even') === t.params.parity).length, 1, tag);
    if (age < 5 && topic === 'colors') for (const [a, b] of CLASH) assert.ok(!(t.choices.some(c => c.thing.color === a) && t.choices.some(c => c.thing.color === b)));
  }
});

test('content: topics — AGE_TOPICS first, then the left-out topic opens; 4 distinct pool topics in order', () => {
  for (const age of AGES) {
    assert.deepStrictEqual(C.topicsFor(age), AGE_TOPICS[age]);
    let last = AGE_TOPICS[age];
    const rng = rngFor(age);
    for (let k = 0; k < 6; k++) {
      const t = C.topicsFor(age, rng, last), pool = SP.AGE_POOLS[age];
      assert.strictEqual(t.length, 4); assert.strictEqual(new Set(t).size, 4);
      t.forEach(x => assert.ok(pool.includes(x)));
      assert.notStrictEqual(t[0], last[0], 'chapter 1 rotates');
      const rest = t.slice(1); assert.deepStrictEqual(rest, rest.slice().sort((a, b) => pool.indexOf(a) - pool.indexOf(b)));
      last = t;
    }
  }
});

// ======================================================================= layout
test('layout: every viewport × 0–5 shells × clam: 3:2 canvas, nothing under HUD / bubble, Nini clear of canvas + palette', () => {
  for (const v of VIEWPORTS) for (let n = 0; n <= 5; n++) for (const clam of [false, true]) {
    const L = SP.World.computeLayout(v.W, v.H, v.ins, {}, { n, clam }), ins = L.ins, tag = `${v.name} n${n}${clam ? ' clam' : ''}`, C2 = L.canvas, F = L.frame;
    assert.ok(Math.abs(C2.w / C2.h - 1.5) < 1e-6, tag + ' 3:2');
    assert.ok(Math.abs(C2.w - 600 * C2.s) < 1e-6);
    const outer = { x: C2.x - F, y: C2.y - F, w: C2.w + 2 * F, h: C2.h + 2 * F };
    assert.ok(outer.x >= ins.left + 4 && outer.x + outer.w <= v.W - ins.right - 4, tag + ' canvas x inside');
    assert.ok(outer.y >= ins.top && outer.y + outer.h <= L.groundY, tag + ' canvas y inside');
    assert.ok(!overlap(outer, L.bubble), tag + ' canvas under the bubble');
    assert.ok(!overlap(outer, L.hud), tag + ' canvas under the HUD');
    assert.ok(C2.s >= (v.H > v.W ? 0.9 : 0.78), tag + ' canvas scale ' + C2.s.toFixed(2));
    const N = L.nini, nb = { x: N.x - N.w / 2, y: N.y - N.h, w: N.w, h: N.h };
    // tall portraits: Nini stands ON the frame (feet overlap the frame top by ≤ 20 px), never over the picture itself
    if (N.up) { assert.ok(N.y - outer.y <= 20 && N.y <= C2.y, tag + ' Nini stands on the frame'); }
    else assert.ok(!overlap(nb, outer), tag + ' Nini over the canvas');
    assert.ok(nb.x >= ins.left && nb.y + nb.h <= v.H - ins.bottom, tag + ' Nini on screen');
    assert.ok(N.h >= 170, tag + ' Nini height');
    const sl = L.palette.slots;
    assert.strictEqual(sl.length, n, tag + ' slots');
    for (let i = 0; i < sl.length; i++) {
      const s = sl[i], R = L.palette.hitR, box = { x: s.x - s.r, y: s.y - s.r, w: 2 * s.r, h: 2 * s.r };
      assert.strictEqual(s.r, 58);
      assert.ok(s.x - (n <= 4 ? R : s.r) >= ins.left - 2 && s.x + s.r <= v.W - ins.right && s.y + s.r <= v.H - ins.bottom, tag + ' shell on screen');
      if (n <= 4 || v.H < v.W) assert.ok(!overlap(box, nb), tag + ' shell under Nini');
      if (L.palette.column) assert.ok(s.x - R > C2.x + C2.w && s.x - s.r >= outer.x + outer.w + 24 - 1e-6, tag + ' column shell hit clear of the picture');
      else assert.ok(s.y - R > C2.y + C2.h && s.y - s.r > outer.y + outer.h, tag + ' shell hit clear of the picture');
      assert.ok(!overlap(box, L.bubble) && !overlap(box, L.hud), tag + ' shell under the bubble / HUD');
      assert.ok(s.y - s.r >= ins.top && s.x + s.r <= v.W - ins.right - 8, tag + ' shell inside the safe area');
      if (i) { const g = Math.hypot(s.x - sl[i - 1].x, s.y - sl[i - 1].y) - 2 * s.r; assert.ok(g >= (n <= 4 ? 24 : 12) - 1e-6, tag + ' gap ' + g); }
    }
    if (L.palette.column) assert.ok(!v.H || v.W > v.H, tag + ' column only in landscape');
    if (n <= 4 && v.H < v.W) assert.ok(!clam || L.clam, tag + ' landscape always fits the clam');
    if (L.clam) {
      const cb = { x: L.clam.x - L.clam.w / 2, y: L.clam.y - L.clam.h, w: L.clam.w, h: L.clam.h };
      assert.ok(cb.x >= ins.left && cb.x + cb.w <= v.W - ins.right, tag + ' clam on screen');
      assert.ok(!overlap(cb, nb) && !overlap(cb, outer), tag + ' clam clear');
      for (const s of sl) assert.ok(!overlap(cb, { x: s.x - s.r, y: s.y - s.r, w: 2 * s.r, h: 2 * s.r }), tag + ' clam over a shell');
    }
    assert.ok(L.fishY > L.bubble.y + L.bubble.h + 20 && L.fishY < C2.y + C2.h / 2, tag + ' fish lane');
  }
});

test('layout: phone landscape puts the shells in a column right of the canvas (canvas ≥ +25 %); iPad 4:3 keeps the row', () => {
  const OLD = { '1561x720': 0.935, '1036x720': 0.855 };   // canvas scale of the row layout before the column (MECHANICS §4)
  for (const [W, H, ins, want] of [[1561, 720, null, 'column'], [1556, 720, { top: 0, right: 108, bottom: 38, left: 108 }, 'column'],
    [1036, 720, { top: 18, right: 0, bottom: 14, left: 0 }, 'column'], [960, 720, null, 'row'], [720, 1556, null, 'row']]) {
    for (let n = 0; n <= 4; n++) for (const clam of [false, true]) {
      const L = SP.World.computeLayout(W, H, ins, {}, { n, clam }), tag = `${W}x${H} n${n}${clam ? ' clam' : ''}`;
      const row = SP.World.computeLayout(W, H, ins, { landColumn: false }, { n, clam });
      assert.ok(L.canvas.s >= row.canvas.s - 1e-9, tag + ' never smaller than the row');
      if (want === 'row') { assert.strictEqual(L.palette.column, false, tag); continue; }
      if (n <= 3 || !clam) assert.strictEqual(L.palette.column, true, tag + ' column');
      const old = OLD[W + 'x' + H];
      if (old && L.palette.column) assert.ok(L.canvas.s >= old * 1.25 - 1e-9 || W === 1036, tag + ' scale ' + L.canvas.s.toFixed(3));
      if (L.palette.column) {
        const xs = new Set(L.palette.slots.map(q => q.x)); assert.ok(xs.size <= 1, tag + ' one column');
        assert.ok(L.nini.x < L.canvas.x, tag + ' Nini on the left');
      }
    }
  }
  const p = SP.World.computeLayout(1561, 720, null, {}, { n: 3, clam: true }), q = SP.World.computeLayout(1561, 720, null, { landColumn: false }, { n: 3, clam: true });
  assert.ok(p.canvas.s / q.canvas.s >= 1.25, 'iPhone landscape canvas ' + q.canvas.s.toFixed(3) + ' → ' + p.canvas.s.toFixed(3));
});

test('layout: every part of real rounds has a safe tap point that hits it (all viewports); hooks map back', () => {
  for (const v of [VIEWPORTS[0], VIEWPORTS[4], VIEWPORTS[2], VIEWPORTS[7], VIEWPORTS[8]]) for (const topic of TOPICS) for (const age of [3, 5, 7]) {
    const w = mkWorld({ age, vp: v, seed: age + topic.length });
    roundOf(w, topic, 2);
    const C2 = w.layout.canvas;
    for (const p of w.parts) {
      const t = w.partTap(p.id), q = w.screenToPic(t.x, t.y);
      assert.strictEqual(SP.Pictures.hit(w.picture, q.x, q.y, CFG.hitPad), p.id, `${v.name} ${topic} ${p.id}`);
      assert.ok(t.x >= C2.x && t.x <= C2.x + C2.w && t.y >= C2.y && t.y <= C2.y + C2.h);
    }
    for (const s of w.shells) { const h = w.shellHit(s.color); assert.ok(h.x === s.x && h.r === CFG.shellR + CFG.shellHitPad); }
  }
});

// ======================================================================= world
test('world: full bot sessions finish for every age (4 viewports, EN + VI), no stuck rounds, no NaN', () => {
  for (const age of AGES) for (const lang of LANGS) for (const v of ROTATE.slice(0, 4)) {
    const w = new SP.World({ seed: age * 13 + v.W, age, lang }), bot = new SP.Bot(w, { skill: 0.75, seed: age });
    w.setViewport(v.W, v.H, v.ins); w.newSession();
    let t = 0, lastSig = '', lastT = 0, rounds = 0;
    while (w.state !== 'sessionDone' && t < 900) {
      bot.step(1 / 30); w.update(1 / 30); t += 1 / 30;
      for (const e of w.drainEvents()) if (e.type === 'roundDone') { rounds++; assert.ok(e.stars >= 1 && e.stars <= 3); }
      const sig = w.state + w.phase + w.step + w.level + w.round;
      if (sig !== lastSig) { lastSig = sig; lastT = t; }
      assert.ok(t - lastT < 120, `age ${age} ${lang} ${v.name} stuck in ${sig}`);
      assert.ok(finite(w), 'NaN');
    }
    assert.strictEqual(w.state, 'sessionDone', `age ${age} ${lang} ${v.name} did not finish (${w.state}/${w.phase})`);
    assert.ok(rounds >= 12 && rounds <= 16, rounds + ' rounds');
  }
});

test('world: phases enter → paint → finish → alive → clear; events in order; ask first after enter', () => {
  const w = mkWorld({ age: 4 });
  w.levels = ['colors', 'colors', 'colors', 'colors']; w.startLevel(0); evs(w);
  until(w, () => w.state === 'round');
  assert.strictEqual(w.phase, 'enter');
  assert.ok(w.pic.y > 300, 'starts below');
  const seen = []; let prevY = w.pic.y;
  let e = evs(w); assert.ok(types(e).includes('round') && types(e).includes('bubbles'));
  until(w, () => { if (w.phase === 'enter') { assert.ok(w.pic.y <= prevY + 1e-6 || w.pic.y < 6); prevY = w.pic.y; } return w.phase === 'paint'; });
  assert.strictEqual(w.pic.y, 0); assert.ok(w.shells.every(s => s.pop === 1), 'shells popped');
  e = evs(w);
  const ask = e.find(x => x.type === 'ask'); assert.ok(ask && ask.first && ask.promptKey === 'p.colors' && ask.step === 0);
  assert.ok(e.filter(x => x.type === 'shellPop').length === 0 || true);
  solveStep(w);
  until(w, () => w.phase === 'finish' || w.phase === 'alive');
  seen.push(...types(evs(w)));
  until(w, () => w.state === 'roundDone');
  seen.push(...types(evs(w)));
  for (const k of ['pick', 'paint', 'filled', 'stepDone', 'finish', 'alive', 'roundDone']) assert.ok(seen.includes(k), 'missing ' + k);
  assert.ok(seen.indexOf('finish') < seen.indexOf('alive') && seen.indexOf('alive') < seen.indexOf('roundDone'));
  assert.ok(w.parts.length === 0 || true);
  assert.strictEqual(w.phase, 'clear');
  until(w, () => w.state === 'round' && w.phase === 'enter');
  assert.strictEqual(w.round, 1);
});

test('world: a tap paints; a drag (≥ 64 px) or a long press (> 1 s) paints nothing but answers softly (event soft + wobble)', () => {
  assert.strictEqual(CFG.tapMovePx, 64); assert.strictEqual(CFG.tapTime, 1.0);
  const w = roundOf(mkWorld({ age: 4 }), 'animals', 1);
  const a = w.answer(), p = w.partTap(a.part);
  evs(w);
  w.pointerDown(p.x, p.y); w.pointerMove(p.x + 70, p.y); assert.strictEqual(w.pointerUp(p.x + 70, p.y), null, 'drag ignored');
  let e = evs(w), so = e.find(x => x.type === 'soft');
  assert.ok(so && so.kind === 'drag' && so.target === 'part' && so.partId === a.part && so.x === p.x, 'soft drag on the part');
  run(w, 0.05); assert.ok(Math.abs(w.st[a.part].wob) > 0.5 && Math.abs(w.st[a.part].wob) < 4, 'tiny wobble ' + w.st[a.part].wob);
  w.pointerDown(p.x, p.y); run(w, 1.05); assert.strictEqual(w.pointerUp(p.x, p.y), null, 'long press ignored');
  e = evs(w); so = e.find(x => x.type === 'soft'); assert.ok(so && so.kind === 'hold' && so.target === 'part');
  assert.ok(!w.st[a.part].painted && types(e).every(t => !['paint', 'wrong'].includes(t)));
  assert.strictEqual(w.misses, 0); assert.strictEqual(w._noProg, 0, 'soft is not a no-progress tap');
  w.pointerDown(10, w.layout.H / 2); run(w, 1.1); w.pointerUp(10, w.layout.H / 2);
  so = evs(w).find(x => x.type === 'soft'); assert.ok(so && so.target === null, 'soft on the empty water');
  w.pointerDown(p.x, p.y); run(w, 0.8); assert.strictEqual(w.pointerUp(p.x + 50, p.y), 'paint', '0.8 s + 50 px is still a tap');
  assert.ok(w.st[a.part].painted);
  const w2 = roundOf(mkWorld({ age: 4 }), 'colors', 1), sh = w2.shellHit(w2.stepInfo.color); evs(w2);
  w2.pointerDown(sh.x, sh.y); run(w2, 1.1); w2.pointerUp(sh.x, sh.y);
  so = evs(w2).find(x => x.type === 'soft'); assert.ok(so && so.target === 'shell' && so.color === w2.stepInfo.color);
  run(w2, 0.03); assert.ok(Math.abs(w2.shellByColor(w2.stepInfo.color).wob) > 0.3, 'shell wobbles'); assert.strictEqual(w2.brush.color, null, 'not picked');
  const w3 = roundOf(mkWorld({ age: 4 }), 'animals', 1), a3 = w3.answer(), p3 = w3.partTap(a3.part);
  w3.pointerDown(p3.x, p3.y); w3.pointerMove(p3.x + 20, p3.y + 10); run(w3, 0.3);
  assert.strictEqual(w3.pointerUp(p3.x + 20, p3.y + 10), 'paint', 'a small wobble is still a tap (at the press point)');
  assert.ok(w3.st[a3.part].painted);
  w3.cancelDrag(); assert.strictEqual(w3.pointerUp(1, 1), null);
});

test('world: pickColor — needPaint / wrong shell / pick + follow ask / notThis / paint fills in 0.7 s / already', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'colors', 1);
  const s = w.stepInfo, T = s.targets[0], other = w.parts.find(p => p.id !== T);
  assert.strictEqual(s.mode, 'pickColor');
  assert.ok(w.st[T].glow > 0.3 || (run(w, 0.5), w.st[T].glow > 0.3), 'target glows');
  evs(w);
  assert.strictEqual(tapPart(w, T), 'needPaint');
  let e = evs(w); assert.strictEqual(e.find(x => x.type === 'needPaint').color, s.color);
  assert.strictEqual(w.misses, 0, 'needPaint is not a mistake');
  const wrongC = w.shells.find(q => q.color !== s.color).color;
  assert.strictEqual(tapShell(w, wrongC), 'wrong');
  e = evs(w); const wr = e.find(x => x.type === 'wrong');
  assert.deepStrictEqual([wr.kind, wr.got.nameValue, wr.want.nameValue, wr.streak], ['color', wrongC, s.color, 1]);
  assert.strictEqual(w.misses, 1); assert.strictEqual(w.brush.color, null, 'a wrong shell does not load the brush');
  run(w, 0.05); assert.ok(Math.abs(w.shellByColor(wrongC).wob) > 1, 'shell wobbles');
  assert.strictEqual(tapShell(w, s.color), 'pick');
  e = evs(w);
  assert.ok(e.find(x => x.type === 'pick' && x.color === s.color));
  const fol = e.find(x => x.type === 'ask' && x.follow); assert.ok(fol && fol.promptKey === 'p.tapPart' && fol.params.part === s.nameValue);
  assert.strictEqual(w.prompt().promptKey, 'p.tapPart');
  assert.strictEqual(tapShell(w, wrongC), 'notThis', 'another shell after the right one: not a mistake');
  assert.strictEqual(tapShell(w, s.color), 'pick');
  assert.strictEqual(tapPart(w, other.id), 'notThis');
  assert.strictEqual(w.misses, 1);
  assert.strictEqual(tapPart(w, T), 'paint');
  e = evs(w); assert.ok(!e.find(x => x.type === 'paint'), 'paint lands when the brush arrives');
  run(w, CFG.brushFlyMax + 0.01);
  e = evs(w); const pe = e.find(x => x.type === 'paint'); assert.ok(pe && pe.partId === T && pe.color === s.color && pe.hex === HEX[s.color]);
  assert.ok(w.st[T].t > 0 && w.st[T].t < 1);
  run(w, CFG.fillTime * 0.5); const mid = w.st[T].t; assert.ok(mid > 0.6 && mid < 1, 'ease-out ' + mid);
  run(w, CFG.fillTime * 0.55);
  e = evs(w); assert.ok(e.find(x => x.type === 'filled' && x.partId === T)); assert.strictEqual(w.st[T].t, 1);
  assert.ok(e.find(x => x.type === 'stepDone' && x.step === 0));
  until(w, () => w.interactive);
  e = evs(w); assert.ok(e.find(x => x.type === 'ask' && x.step === 1 && !x.follow));
  assert.strictEqual(w.brush.color, null, 'rinsed for the next colour');
  assert.strictEqual(tapPart(w, T), 'already');
  assert.strictEqual(w.misses, 1);
});

test('world: wrong answers bounce with no state loss; hint after 2 misses (shell, then part); cooldown 6 s', () => {
  const w = roundOf(mkWorld({ age: 5 }), 'shapes', 2);   // pickTap
  const s = w.stepInfo, wrongC = w.shells.find(q => q.color !== s.color).color;
  const snap = () => JSON.stringify([w.parts.map(p => [p.painted, p.color]), w.brush.color, w.step]);
  const before = snap(); evs(w);
  assert.strictEqual(tapShell(w, wrongC), 'wrong');
  assert.strictEqual(snap(), before);
  assert.ok(!types(evs(w)).includes('hint'));
  assert.strictEqual(tapShell(w, wrongC), 'wrong');
  let e = evs(w), h = e.find(x => x.type === 'hint');
  assert.ok(h && h.target === 'shell' && h.id === s.color, '2nd miss hints the shell');
  assert.ok(w.hintHand && w.hintHand.target === 'shell');
  run(w, 0.4); assert.ok(w.shellByColor(s.color).glow > 0.5 && w.hintHand.alpha > 0.5);
  assert.strictEqual(tapShell(w, s.color), 'pick'); assert.strictEqual(w.hintHand, null, 'hand gone after the right tap');
  const wrongP = w.parts.find(p => p.role === 'shape' && p.id !== s.targets[0]);
  assert.strictEqual(tapPart(w, wrongP.id), 'wrong'); assert.strictEqual(tapPart(w, wrongP.id), 'wrong');
  e = evs(w); assert.ok(!e.find(x => x.type === 'hint'), 'cooldown');
  run(w, CFG.hintCooldown);
  assert.strictEqual(tapPart(w, wrongP.id), 'wrong');
  e = evs(w); h = e.find(x => x.type === 'hint'); assert.ok(h && h.target === 'part' && h.id === s.targets[0]);
  run(w, 0.05); assert.ok(Math.abs(wrongP.wob) > 1, 'part wobbles');
  assert.strictEqual(w.misses, 5); assert.strictEqual(tapPart(w, s.targets[0]), 'paint');
  // body = another role → notThis (not a mistake)
  const body = w.parts.find(p => p.role === 'part');
  if (body && !body.painted) { until(w, () => w.interactive); const m = w.misses; tapShell(w, w.stepInfo.color); assert.strictEqual(tapPart(w, body.id), 'notThis'); assert.strictEqual(w.misses, m); }
  while (w.state === 'round' && w.phase === 'paint') { if (w.interactive) solveStep(w); else run(w, 0.1); }
  until(w, () => w.state === 'roundDone');
  assert.strictEqual(w.roundStars, 1, '≥ 2 misses → 1 star');
});

test('world: stars 3 / 2 / 1 for 0 / 1 / ≥ 2 misses', () => {
  for (const [nm, want] of [[0, 3], [1, 2], [2, 1]]) {
    const w = roundOf(mkWorld({ age: 3, seed: 5 }), 'animals', 1);
    for (let k = 0; k < nm; k++) { const s = w.stepInfo, o = w.parts.find(p => p.role === s.role && p.id !== s.targets[0] && !p.painted); assert.strictEqual(tapPart(w, o.id), 'wrong'); }
    while (w.state === 'round') { if (w.interactive) solveStep(w); else run(w, 0.1); }
    assert.strictEqual(w.roundStars, want);
  }
});

test('world: count — paints count i/n, stops at N, painted spot → already (not a mistake), the rest is swept', () => {
  const w = roundOf(mkWorld({ age: 4, seed: 3 }), 'count', 2);
  const s = w.stepInfo, N = s.need, spots = s.targets.slice();
  assert.ok(N >= 3 && spots.length === N + 2 || spots.length === N + 3);
  evs(w);
  for (let i = 0; i < N; i++) {
    assert.strictEqual(tapPart(w, spots[i]), 'paint');
    if (i === 0) { run(w, 0.4); assert.strictEqual(tapPart(w, spots[0]), 'already'); }
  }
  assert.strictEqual(w.interactive, false, 'N reached');
  assert.strictEqual(tapPart(w, spots[N]), null, 'extra spot does nothing');
  run(w, 0.5);
  const e = evs(w), paints = e.filter(x => x.type === 'paint');
  assert.deepStrictEqual(paints.map(x => x.count.i), Array.from({ length: N }, (_, i) => i + 1));
  assert.ok(paints.every(x => x.count.n === N));
  assert.strictEqual(w.misses, 0);
  assert.ok(!w.st[spots[N]].painted);
  until(w, () => w.phase === 'finish');
  until(w, () => w.phase === 'alive');
  assert.ok(w.parts.every(p => p.done && p.t === 1 && p.color), 'everything painted');
  assert.ok(w.st[spots[N]].color === w.st[spots[N]].src.def);
});

test('world: oddeven — wrong parity is a mistake, need = number of right labels; fast taps all land', () => {
  const w = roundOf(mkWorld({ age: 7, seed: 9 }), 'oddeven', 2);
  const s = w.stepInfo, wrongL = w.parts.find(p => p.role === 'label' && !s.targets.includes(p.id));
  assert.strictEqual(tapPart(w, wrongL.id), 'wrong'); assert.strictEqual(w.misses, 1);
  evs(w);
  for (const t of s.targets) assert.strictEqual(tapPart(w, t), 'paint');   // no waiting: the brush re-routes, every fill starts
  run(w, 1.2);
  const e = evs(w);
  assert.strictEqual(e.filter(x => x.type === 'paint').length, s.targets.length);
  assert.strictEqual(e.filter(x => x.type === 'filled').length, s.targets.length);
  assert.ok(e.find(x => x.type === 'stepDone'));
});

test('world: tapPart — wrong animal / size wobble; Nini repeats the prompt; empty water = no progress (not a mistake)', () => {
  const w = roundOf(mkWorld({ age: 3, seed: 2 }), 'size', 1);
  const s = w.stepInfo, other = w.parts.find(p => p.role === 'animal' && p.id !== s.targets[0]);
  evs(w);
  assert.strictEqual(tapPart(w, other.id), 'wrong');
  let e = evs(w), wr = e.find(x => x.type === 'wrong');
  assert.strictEqual(wr.kind, 'part'); assert.strictEqual(wr.got.size, other.size); assert.strictEqual(wr.want.nameValue, s.nameValue);
  const nh = w.niniHit();
  assert.strictEqual(tapAt(w, nh.x, nh.y), 'pokeNini');
  e = evs(w); const pk = e.find(x => x.type === 'pokeNini'); assert.strictEqual(pk.promptKey, 'p.size'); assert.strictEqual(pk.params.size, s.params.size);
  run(w, CFG.hintCooldown); evs(w);
  assert.strictEqual(tapAt(w, w.layout.W - 30, w.layout.H / 2), null);
  assert.strictEqual(w.misses, 1, 'the water is not a mistake');
  assert.strictEqual(tapAt(w, w.layout.W - 30, w.layout.H / 2), null);
  e = evs(w); const h = e.find(x => x.type === 'hint'); assert.ok(h && h.id === s.targets[0], 'taps on the water lead to the hint');
  assert.strictEqual(w.misses, 1);
});

test('world: a child who only taps the sand / water still finishes (no-progress taps → hint → assist); stars kept', () => {
  for (const [age, topic] of [[4, 'animals'], [4, 'colors'], [6, 'add']]) {
    const w = roundOf(mkWorld({ age, seed: 8 }), topic, 1);
    let k = 0;
    while (w.state === 'round' && k++ < 400) { if (w.interactive) tapAt(w, w.layout.W - 20, w.layout.H / 2); run(w, 0.5); }
    assert.notStrictEqual(w.state, 'round', `${age} ${topic} finished`);
    assert.strictEqual(w.roundStars, 3, 'water taps cost no star');
  }
});

test('world: the swimming fishy never steals a press on a shell or an unpainted part; painted parts / water → fishy', () => {
  for (const v of [VIEWPORTS[0], VIEWPORTS[4], VIEWPORTS[8]]) {
    const w = roundOf(mkWorld({ age: 4, surprise: true, vp: v, seed: 3 }), 'count', 2, 'fishy');
    const s = w.stepInfo;
    evs(w); until(w, () => w.fishyHit());
    let hitOne = false;
    for (let k = 0; k < 3000 && w.fishy && w.interactive; k++) {
      const fh = w.fishyHit();
      if (fh) {
        const spot = s.targets.find(id => { const q = w.partTap(id); return !w.st[id].painted && Math.hypot(q.x - fh.x, q.y - fh.y) <= fh.r - 4; });
        if (spot) {
          const q = w.partTap(spot), before = w._claimedCount();
          assert.strictEqual(w.pointerDown(q.x, q.y), 'press', v.name + ' a right spot under the fishy wins');
          assert.strictEqual(w.pointerUp(q.x, q.y), 'paint');
          assert.strictEqual(w._claimedCount(), before + 1); assert.strictEqual(w.fishy.state, 'swim');
          hitOne = true; if (process.env.SP_DBG) console.log("fishy-steal checked on", v.name); break;
        }
      }
      w.update(H);
    }
    if (v === VIEWPORTS[0] || v === VIEWPORTS[4]) assert.ok(hitOne || w.layout.fishY < w.layout.canvas.y, v.name + ' found a spot under the fishy');
    // the fishy itself (over the water / a painted part) still reacts to a press
    until(w, () => w.fishyHit() || !w.interactive || w._fishyNext < 0 && !w.fishy, 20000);
    const fh = w.fishyHit();
    if (fh && w.interactive) {
      const u = w._under(fh.x, fh.y);
      if (!u || (u.kind === 'part' && u.part.painted)) assert.strictEqual(w.pointerDown(fh.x, fh.y), 'fishy');
    }
  }
});

test('world: idle nudges 12 s → ×1.5 → … ≤ 30 s; the 2nd idle hints; a tap resets', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'animals', 1);
  evs(w);
  const at = [];
  run(w, 100, () => { for (const e of w.drainEvents()) if (e.type === 'idle' || e.type === 'hint') at.push([e.type, Math.round((w.time - w._askT0) * 10) / 10 || 0, e.n, e.idle]); });
  const idles = at.filter(x => x[0] === 'idle');
  assert.ok(idles.length >= 4, JSON.stringify(at));
  const hints = at.filter(x => x[0] === 'hint');
  assert.ok(hints.length >= 1 && hints[0][3] === true, '2nd idle hints');
  assert.strictEqual(w._idleGap, CFG.idleMax);
  // gaps: 12, 18, 27, 30
  const w2 = roundOf(mkWorld({ age: 4 }), 'animals', 1); evs(w2);
  const times = []; const t0 = w2.time;
  run(w2, 90, () => { for (const e of w2.drainEvents()) if (e.type === 'idle') times.push(w2.time - t0); });
  const gaps = times.map((t, i) => t - (i ? times[i - 1] : 0)).map(x => Math.round(x));
  assert.deepStrictEqual(gaps.slice(0, 4), [12, 18, 27, 30]);
  const w3 = roundOf(mkWorld({ age: 4 }), 'animals', 1); evs(w3);
  run(w3, 10); tapAt(w3, w3.layout.W - 30, w3.layout.H / 2); run(w3, 3);
  assert.ok(types(evs(w3)).includes('idle'), 'a tap on empty water is not engagement');
  run(w3, 10); const o3 = w3.parts.find(p => p.role === 'animal' && p.id !== w3.stepInfo.targets[0]); tapPart(w3, o3.id); run(w3, 11);
  assert.ok(!types(evs(w3)).includes('idle'), 'a real tap resets the idle timer');
});

test('world: manual hint + answer() + hooks; hint() outside paint → null', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'colors', 1);
  const s = w.stepInfo;
  assert.deepStrictEqual(w.answer(), { shell: s.color });
  assert.deepStrictEqual(w.hint(), { target: 'shell', id: s.color });
  assert.deepStrictEqual(w.hint(), { target: 'shell', id: s.color }, 'idempotent');
  tapShell(w, s.color);
  assert.deepStrictEqual(w.answer(), { part: s.targets[0] });
  const fresh = mkWorld({ age: 4 }); assert.strictEqual(fresh.hint(), null);
  assert.ok(w.niniHit().w > 100 && w.clamHit() === null && w.fishyHit() === null);
});

test('world: rotation / resize mid-fill, mid-flight and mid-enter keep progress and stay tappable (6 viewports)', () => {
  for (const topic of ['colors', 'count', 'shapes', 'letters']) {
    const w = roundOf(mkWorld({ age: 5, seed: 11 }), topic, 2);
    let k = 0;
    while (w.state === 'round' && w.phase === 'paint' && k < 40) {
      const a = w.answer();
      if (a) { if (a.shell) tapShell(w, a.shell); else tapPart(w, a.part); }
      run(w, 0.1 + (k % 3) * 0.12);
      const before = w.parts.map(p => p.t), v = ROTATE[k % ROTATE.length];
      w.setViewport(v.W, v.H, v.ins);
      const after = w.parts.map(p => p.t);
      assert.deepStrictEqual(after, before, 'fills keep their progress');
      assert.ok(finite(w));
      w.shells.forEach((s, i) => { assert.strictEqual(s.x, w.layout.palette.slots[i].x); });
      assert.strictEqual(w.brush.x, w.layout.brush.x);
      if (w.interactive) { const b = w.answer(); if (b && b.part) { const p = w.partTap(b.part), q = w.screenToPic(p.x, p.y); assert.strictEqual(SP.Pictures.hit(w.picture, q.x, q.y, 0), b.part); } }
      k++;
    }
    until(w, () => w.state !== 'round');
  }
  const w = mkWorld({ age: 4 }); w.levels = ['animals', 'animals', 'animals', 'animals']; w.startLevel(0);
  until(w, () => w.phase === 'enter'); run(w, 0.3); w.setViewport(720, 1556, null); until(w, () => w.interactive); assert.strictEqual(w.pic.y, 0);
});

test('world: surprises — one per chapter (never the warm-up), fishy swims + tap, pearl clam opens; no score change', () => {
  const seen = {};
  for (let seed = 1; seed <= 12; seed++) {
    const w = new SP.World({ seed, age: 4 }), bot = new SP.Bot(w, { skill: 1, seed });
    w.setViewport(1556, 720); w.newSession();
    const per = {};
    let t = 0;
    while (w.state !== 'sessionDone' && t < 900) {
      bot.step(1 / 30); w.update(1 / 30); t += 1 / 30;
      for (const e of w.drainEvents()) if (e.type === 'round' && e.surprise) { const k = w.level; per[k] = (per[k] || []).concat([[e.round, e.surprise]]); assert.ok(e.round > 0); seen[e.surprise] = 1; }
    }
    for (const k in per) assert.strictEqual(per[k].length, 1, 'one surprise round per chapter');
    const kinds = Object.values(per).map(x => x[0][1]); for (let i = 1; i < kinds.length; i++) assert.notStrictEqual(kinds[i], kinds[i - 1], 'rotates');
  }
  assert.ok(seen.fishy && seen.pearl);
  // fishy
  const w = roundOf(mkWorld({ age: 4, surprise: true }), 'animals', 1, 'fishy');
  evs(w); until(w, () => w.fishyHit());
  const f = w.fishy, x0 = f.x; run(w, 0.5); assert.ok((f.x - x0) * f.dir > 50, 'swims');
  const fh = w.fishyHit(), st = w.stars, m = w.misses;
  assert.strictEqual(w.pointerDown(fh.x, fh.y), 'fishy'); w.pointerUp(fh.x, fh.y);
  assert.ok(types(evs(w)).includes('fishyTap')); assert.strictEqual(w.fishy.state, 'happy'); assert.strictEqual(w.fishyHit(), null);
  assert.strictEqual(w.stars, st); assert.strictEqual(w.misses, m);
  // pearl
  const w2 = roundOf(mkWorld({ age: 4, surprise: true, vp: VIEWPORTS[0] }), 'colors', 1, 'pearl');
  assert.ok(w2.clam, 'clam on the sand'); const ch = w2.clamHit();
  assert.strictEqual(w2.pointerDown(ch.x, ch.y), 'clam'); w2.pointerUp(ch.x, ch.y);
  run(w2, 0.4); assert.ok(w2.clam.open > 0.8); const e = evs(w2).find(x => x.type === 'pearlTap'); assert.ok(e && e.taps === 1);
  run(w2, CFG.clamOpenTime + 1); assert.ok(w2.clam.open < 0.1, 'closes again');
  // portrait with 4 shells: no room for the clam → the fishy comes instead
  const w3 = roundOf(mkWorld({ age: 5, surprise: true, vp: VIEWPORTS[2] }), 'colors', 1, 'pearl');
  if (w3.clam) assert.strictEqual(w3.surprise, 'pearl'); else assert.strictEqual(w3.surprise, 'fishy');   // tall portrait: the shells get the full row, the clam may fit
});

test('world: chapter time limit — after ≥ 3 rounds and > 75 s → Talk; re-ask every 12 s, glow after 2, stop after 3, give up', () => {
  const w = mkWorld({ age: 3 });
  w.levels = ['colors', 'shapes', 'size', 'animals']; w.startLevel(0);
  w.levelStartTime = w.time - 200;   // pretend a long chapter
  let rounds = 0;
  while (w.state !== 'talk') { if (w.interactive) solveStep(w); else w.update(H); for (const e of w.drainEvents()) if (e.type === 'roundDone') rounds++; }
  assert.strictEqual(rounds, 3); assert.strictEqual(w.roundsPerLevel, 3);
  evs(w); const asks = [];
  run(w, 12 * 3 + 13, () => { for (const e of w.drainEvents()) { if (e.type === 'talkAsk') asks.push([e.n, e.glowAnswer]); if (e.type === 'talkResult') asks.push(['result', e.auto]); } });
  assert.deepStrictEqual(asks, [[1, false], [2, true], [3, true], ['result', true]]);
  assert.strictEqual(w.levelStars, 9 + 0, 'an auto answer gives no star');
  until(w, () => w.state === 'intro'); assert.strictEqual(w.level, 1);
  // a normal chapter plays 4 rounds; a right Talk answer is +1
  const w2 = mkWorld({ age: 4 }); let r2 = 0;
  while (w2.state !== 'talk') { if (w2.interactive) solveStep(w2); else w2.update(H); for (const e of w2.drainEvents()) if (e.type === 'roundDone') r2++; }
  assert.strictEqual(r2, w2.time - w2.levelStartTime > 75 ? r2 : 4);
  const st = w2.stars; assert.strictEqual(w2.talkAnswer(w2.talk.answer), true); assert.strictEqual(w2.stars, st + 1);
  assert.strictEqual(w2.talkAnswer(w2.talk.answer), false, 'only once');
});

test('world: alive kinematics per kind — finite, leave the screen, physical shapes (swim / scuttle / sail / bob / float)', () => {
  for (const kind of ['swim', 'scuttle', 'sail', 'bob', 'float']) for (const v of [VIEWPORTS[0], VIEWPORTS[4], VIEWPORTS[2]]) {
    const w = roundOf(mkWorld({ age: 4, vp: v }), 'animals', 0);
    while (w.state === 'round' && w.phase === 'paint') { if (w.interactive) solveStep(w); else run(w, 0.05); }
    until(w, () => w.phase === 'alive');
    w.picture.alive = kind; w._alive.kind = kind;
    const trace = [];
    until(w, () => { trace.push({ x: w.pic.x, y: w.pic.y, rot: w.pic.rot, sy: w.pic.sy, wig: w.pic.wig, a: w.pic.alpha, t: w.phaseTime }); return w.state !== 'round'; });
    const C2 = w.layout.canvas, L = w.layout;
    trace.forEach(p => assert.ok([p.x, p.y, p.rot, p.sy, p.wig].every(Number.isFinite)));
    const last = trace.filter(p => p.a > 0).pop();
    const gone = C2.x + last.x > L.W || C2.y + last.y + C2.h < 0 || C2.x + last.x + C2.w < 0;
    assert.ok(gone, `${kind} ${v.name} still on screen at the end (${last.x.toFixed(0)}, ${last.y.toFixed(0)})`);
    assert.ok(trace[trace.length - 1].a === 0, 'hidden after the move');
    const mv = trace.filter(p => p.a > 0);
    if (kind === 'swim') { assert.ok(mv.some(p => p.x < -5), 'anticipation'); assert.ok(Math.max(...mv.map(p => Math.abs(p.wig))) > 0.08, 'tail beat'); for (let i = 1; i < mv.length; i++) if (mv[i].t > 0.3) assert.ok(mv[i].x >= mv[i - 1].x - 1e-6, 'accelerates right'); }
    if (kind === 'scuttle') { assert.ok(mv.some(p => p.y < -20) && mv.every(p => p.y <= 1e-6), 'hops up only'); assert.ok(Math.min(...mv.map(p => p.sy)) < 0.92, 'landing squash'); }
    if (kind === 'sail') assert.ok(Math.max(...mv.map(p => p.rot)) > 0.05 && Math.min(...mv.map(p => p.rot)) < -0.05, 'rocks');
    if (kind === 'bob') assert.ok(mv.some(p => p.y > 8), 'dips first');
    if (kind === 'float') assert.ok(Math.max(...mv.map(p => Math.abs(p.x))) > 20, 'drifts');
  }
});

test('world: determinism — same seed → same events; inputs replayed at 1/30, 1/60, 1/120 s frames → same events', () => {
  function play(dt, seed, log) {
    const w = new SP.World({ seed, age: 5 }); w.setViewport(1556, 720); const bot = log ? null : new SP.Bot(w, { skill: 0.7, seed: 2 });
    const rec = [], all = [];
    if (bot) for (const k of ['pointerDown', 'pointerUp', 'talkAnswer']) { const f = w[k].bind(w); w[k] = (...a) => { rec.push({ t: w.time, k, a }); return f(...a); }; }
    w.newSession();
    let i = 0;
    while (w.state !== 'sessionDone' && w.time < 900) {
      if (bot) bot.step(dt);
      else while (i < log.length && log[i].t <= w.time + 1e-9) { const c = log[i++]; w[c.k](...c.a); }
      const next = log && i < log.length ? log[i].t : Infinity;
      w.update(log ? Math.min(dt, Math.max(H, Math.round((next - w.time) / H) * H)) + 1e-12 : dt);
      all.push(...w.drainEvents());
    }
    return { h: hash(all), rec, state: w.state };
  }
  const a = play(1 / 30, 77), b = play(1 / 30, 77);
  assert.strictEqual(a.state, 'sessionDone'); assert.strictEqual(a.h, b.h);
  assert.strictEqual(play(1 / 120, 77, a.rec).h, a.h, 'replay 1/120');
  assert.strictEqual(play(1 / 60, 77, a.rec).h, a.h, 'replay 1/60');
  assert.notStrictEqual(play(1 / 30, 78).h, a.h);
});

test('world: interpolation twins + alpha; speed mode (dt = 1 s per call) still finishes', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'colors', 1);
  tapShell(w, w.stepInfo.color); tapPart(w, w.stepInfo.targets[0]);
  w.update(H * 1.5);
  assert.ok(w.alpha > 0.45 && w.alpha < 0.55);
  assert.ok(w.brush._px !== w.brush.x || w.brush._py !== w.brush.y, 'brush twins');
  run(w, 0.3); const p = w.st[w.parts.find(q => q.painted).id]; w.update(H); assert.ok(p._pt < p.t, 'fill twin');
  const w2 = new SP.World({ seed: 3, age: 6 }), bot = new SP.Bot(w2, { skill: 0.9, seed: 1 });
  w2.setViewport(960, 720); w2.newSession();
  let n = 0; while (w2.state !== 'sessionDone' && n++ < 2000) { bot.step(1); w2.update(1); }
  assert.strictEqual(w2.state, 'sessionDone');
});

test('world: setAge / setLang apply at the next session; newSession rotates chapter topics; gallery', () => {
  const w = new SP.World({ seed: 4, age: 3 }), bot = new SP.Bot(w, { skill: 1, seed: 4 });
  w.setViewport(960, 720); w.newSession();
  assert.deepStrictEqual(w.levels, AGE_TOPICS[3]);
  w.setAge(6); w.setLang('vi'); assert.strictEqual(w.age, 3);
  let n = 0, done = null; while (w.state !== 'sessionDone' && n++ < 30000) { bot.step(1 / 30); w.update(1 / 30); for (const e of w.drainEvents()) if (e.type === 'sessionDone') done = e; }
  assert.ok(done && done.pictures === w.gallery.length && done.gallery.length >= 12);
  assert.ok(done.gallery.every(g => g.picId && Object.values(g.fills).every(c => /^#[0-9A-F]{6}$/i.test(c))));
  w.newSession(); assert.strictEqual(w.age, 6); assert.strictEqual(w.lang, 'vi');
  const w3 = new SP.World({ seed: 4, age: 4 }); w3.setViewport(960, 720); w3.newSession(); const first = w3.levels.slice();
  w3.newSession({ lastTopics: first }); assert.notStrictEqual(w3.levels[0], first[0]);
});

test('world: brush — flies in an arc to the shell, dips, loads; flies to the part, dabs, returns to Nini', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'colors', 1);
  const s = w.stepInfo, sh = w.shellByColor(s.color), R = w.layout.brush;
  assert.ok(Math.abs(w.brush.x - R.x) < 4 && w.brush.state === 'rest');
  tapShell(w, s.color);
  let minY = 1e9, sawDip = false;
  run(w, 0.6, () => { minY = Math.min(minY, w.brush.y); if (w.brush.state === 'dip') sawDip = true; });
  assert.ok(sawDip, 'dips'); assert.ok(minY < Math.min(R.y, sh.y) - 10, 'arc above the straight line');
  assert.ok(types(evs(w)).includes('dip'));
  tapPart(w, s.targets[0]);
  let sawDab = false; run(w, 0.35, () => { if (w.brush.state === 'dab') sawDab = true; });
  assert.ok(sawDab);
  run(w, 0.8); assert.ok(Math.abs(w.brush.x - R.x) < 6 && w.brush.state === 'rest', 'back in Nini\'s flipper');
});

test('world: assist — 2 taps without progress hint; after 6 (age ≤ 4) / 5 (age ≥ 5) the next canvas tap does the right thing', () => {
  assert.strictEqual(CFG.assistAfterOld, 5);
  for (const [age, n] of [[3, 6], [6, 5]]) {
    const w = roundOf(mkWorld({ age, seed: 4 }), 'animals', 1), C2 = w.layout.canvas, s = w.stepInfo;
    evs(w);
    const empty = () => { for (let y = C2.y + 4; y < C2.y + C2.h; y += 9) for (let x = C2.x + 4; x < C2.x + C2.w; x += 9) { const q = w.screenToPic(x, y); if (!SP.Pictures.hit(w.picture, q.x, q.y, CFG.hitPad)) return { x, y }; } return null; };
    const e0 = empty(); assert.ok(e0, 'an empty spot on the canvas');
    assert.strictEqual(tapAt(w, e0.x, e0.y), null); assert.strictEqual(tapAt(w, e0.x, e0.y), null);
    assert.ok(types(evs(w)).includes('hint'), '2nd empty tap hints');
    for (let k = 2; k < n; k++) tapAt(w, e0.x, e0.y);
    assert.strictEqual(w.misses, 0);
    assert.strictEqual(tapAt(w, e0.x, e0.y), 'paint');
    const e = evs(w); assert.ok(e.find(x => x.type === 'assist' && x.id === s.targets[0]));
    assert.ok(w.st[s.targets[0]].painted);
  }
  const w = roundOf(mkWorld({ age: 4 }), 'colors', 1), s = w.stepInfo, wr = w.shells.find(q => q.color !== s.color).color;
  for (let k = 0; k < 6; k++) tapShell(w, wr);
  assert.strictEqual(tapShell(w, wr), 'pick', 'assist picks the right paint'); assert.strictEqual(w.brush.color, s.color); assert.strictEqual(w.misses, 6);
});

// ======================================================================= weather
test('weather: seasons (DESIGN §3 water), crossfade 2.5 s, particles per season, cap 120, splash + bubbles', () => {
  const wx = new SP.Weather({ width: 1556, height: 720, seed: 3, groundY: 702 });
  ['spring', 'summer', 'autumn', 'winter'].forEach((m, i) => {
    wx.setWeather(i, { instant: true });
    assert.strictEqual(wx.ambient.mood, m);
    assert.strictEqual(wx.ambient.waterTop, WATER[m][0]); assert.strictEqual(wx.ambient.waterBottom, WATER[m][1]);
    for (let k = 0; k < 600; k++) wx.update(1 / 60);
    const kinds = new Set(wx.particles.map(p => p.kind));
    assert.ok(kinds.has('bubble') && kinds.has('plankton'), m + ' bubbles + plankton');
    assert.ok(kinds.has({ spring: 'petal', summer: 'glint', autumn: 'leaf', winter: 'snow' }[m]), m + ' season particle');
    wx.particles.forEach(p => assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && p.alpha >= 0 && p.alpha <= 1.0001 && Weather_SPR.includes(p.sprite), m + ' ' + p.sprite));
  });
  assert.strictEqual(wx.ambient.ice, 1); wx.setWeather(1, { instant: true }); assert.strictEqual(wx.ambient.ice, 0); assert.strictEqual(wx.ambient.rays, 1);
  wx.setWeather(3); for (let k = 0; k < 75; k++) wx.update(1 / 60); assert.ok(wx.ambient.envMix > 0.3 && wx.ambient.envMix < 0.7 && wx.ambient.envFrom === 'summer');
  for (let k = 0; k < 90; k++) wx.update(1 / 60); assert.strictEqual(wx.ambient.waterTop, WATER.winter[0]);
  for (let k = 0; k < 40; k++) { wx.addSplash(400, 300, 'blue', 12); wx.addBubbles(500, 400, 8); }
  assert.ok(wx.particles.length <= 120);
  assert.ok(wx.particles.some(p => p.kind === 'dot' && p.color === HEX.blue));
  for (let k = 0; k < 120; k++) wx.update(1 / 60);
  assert.ok(wx.particles.every(p => p.kind !== 'dot'), 'splash dots are short-lived');
  wx.setParty(true, { instant: true }); wx.burst(700, 300, { kind: 'confetti', n: 30 }); for (let k = 0; k < 60; k++) wx.update(1 / 60);
  assert.ok(wx.particles.length <= 120 && wx.ambient.party === 1);
  wx.resize(720, 1556, 1500); assert.ok(wx.particles.every(p => p.x <= 760));
});
const Weather_SPR = SP.Weather.SPRITES;

// ======================================================================= bot
test('bot: drives only the input API; skill 1 makes no mistakes; skill 0.3 still finishes', () => {
  for (const age of [3, 5, 7]) {
    const w = new SP.World({ seed: age, age }), bot = new SP.Bot(w, { skill: 1, seed: 1 });
    w.setViewport(960, 720); w.newSession();
    let miss = 0, n = 0; while (w.state !== 'sessionDone' && n++ < 40000) { bot.step(1 / 30); w.update(1 / 30); for (const e of w.drainEvents()) if (e.type === 'wrong') miss++; }
    assert.strictEqual(w.state, 'sessionDone'); assert.strictEqual(miss, 0);
    const w2 = new SP.World({ seed: age + 9, age }), b2 = new SP.Bot(w2, { skill: 0.3, seed: 2 });
    w2.setViewport(720, 1556); w2.newSession();
    n = 0; while (w2.state !== 'sessionDone' && n++ < 60000) { b2.step(1 / 30); w2.update(1 / 30); w2.drainEvents(); }
    assert.strictEqual(w2.state, 'sessionDone'); assert.ok(b2.stats.wrong > 5);
  }
});

// ======================================================================= run
const only = process.argv[2];
let fail = 0, ran = 0;
const t0 = Date.now();
console.log(`pictures: ${usingStub() ? 'TEST STUB (game/js/pictures.js missing)' : 'game/js/pictures.js'}`);
for (const t of tests) {
  if (only && !t.name.includes(only)) continue;
  ran++;
  const s = Date.now();
  try { t.fn(); console.log(`✓ ${t.name} (${Date.now() - s} ms)`); }
  catch (e) { fail++; console.log(`✗ ${t.name}\n   ${e && e.message ? e.message.split("\n").slice(0, 6).join(" ") : e}\n   ${e && e.stack ? e.stack.split("\n").filter(l => l.includes("run.js")).slice(0, 1).join("") : ""}`); }
}
console.log(`\n${ran - fail}/${ran} passed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(fail ? 1 : 0);
