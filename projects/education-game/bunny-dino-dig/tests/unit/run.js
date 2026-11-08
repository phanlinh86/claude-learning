#!/usr/bin/env node
// Bun's Dino Dig — headless unit tests for rng / content / world / weather / bot.
// Run from the game folder:   node tests/unit/run.js [name part]      (exit 1 on any failure)
// (tests/unit/i18n_voice.test.js is the voice engineer's suite and runs on its own.)
'use strict';
const assert = require('assert');
const { load } = require('./load');

const DD = load();
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const H = 1 / 120;
const AGES = [3, 4, 5, 6, 7];
const LANGS = ['en', 'vi'];
const C = DD.Content;
const CFG = DD.CONFIG;
const TOPICS = C.TOPICS;
const J = v => JSON.parse(JSON.stringify(v));   // objects from the vm sandbox have other prototypes
assert.deepStrictEqual = ((orig) => (a, b, m) => orig(J(a), J(b), m))(assert.deepStrictEqual);

// independent copies of the DESIGN tables (§3, §5.1)
const AGE_TOPICS = { 3: ['colors', 'shapes', 'size', 'animals'], 4: ['colors', 'shapes', 'count', 'animals'],
  5: ['shapes', 'count', 'letters', 'animals'], 6: ['lower', 'initial', 'add', 'count'], 7: ['initial', 'add', 'sub', 'oddeven'] };
const CLASH = [['blue', 'purple'], ['red', 'green'], ['yellow', 'orange'], ['green', 'orange']];
const HEX = { red: '#E84A4A', blue: '#3C8DE8', yellow: '#FFD23F', green: '#4CC26B', orange: '#FF9A2E', purple: '#8E44AD', pink: '#FF8FC0' };
const SKY = { morning: ['#BFE6F2', '#FBE9C9'], noon: ['#7CC7EE', '#CDEBF6'], night: ['#1F2A55', '#3E4C7E'] };
const ICON_KINDS = ['egg', 'blob', 'stone', 'toy', 'bone', 'number', 'letter', 'dots', 'size', 'dino'];
const SPRITES = ['sand', 'dust', 'leaf_a', 'leaf_b', 'sparkle', 'star', 'firefly', 'mote', 'confetti_a', 'confetti_b', 'dot', 'feather'];
const PEEK = { egg: 0.38, stone: 0.42, toy: 0.48, bone: 0.40, tablet: 0.62 };
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
const VP = VIEWPORTS[4];

// ---------- helpers ----------
function mkWorld(o) {
  o = o || {};
  const cfg = Object.assign(o.surprise ? {} : { surpriseTypes: [] }, o.config || {});
  const w = new DD.World({ seed: o.seed || 1, age: o.age || 4, lang: o.lang || 'en', config: cfg });
  const v = o.vp || VP;
  w.setViewport(v.W, v.H, v.ins);
  w.newSession(); w.drainEvents();
  return w;
}
/** Starts round `ri` of `topic` in chapter `level` directly (skips the intro) and runs to the first ask. */
function roundOf(w, topic, ri, o) {
  o = o || {};
  w.levels = [topic, topic, topic, topic];
  w.startLevel(o.level === undefined ? 1 : o.level); w.round = ri || 0;
  w._surpriseRound = ri || 0; w.cfg.surpriseTypes = o.surprise ? [o.surprise] : [];
  w._beginRound();
  until(w, () => w.interactive);
  return w;
}
/** Starts a round whose content passes `pred(round)` (tries seeds). */
function roundWhere(o, topic, ri, pred, ro) {
  for (let s = 1; s < 400; s++) {
    const w = mkWorld(Object.assign({}, o, { seed: s }));
    roundOf(w, topic, ri, ro);
    if (pred(w.cur, w)) return w;
  }
  throw new Error('no round found for ' + topic);
}
function run(w, s, each) { const n = Math.round(s / H); for (let i = 0; i < n; i++) { if (each) each(i); w.update(H); } }
function until(w, fn, max) { let n = 0; while (!fn() && n++ < (max || 36000)) w.update(H); assert.ok(fn(), 'condition not reached (now ' + w.state + '/' + w.phase + ')'); }
function evs(w) { return w.drainEvents(); }
function types(e) { return e.map(x => x.type); }
function tapAt(w, x, y) { const d = w.pointerDown(x, y); if (d !== 'press') return d; return w.pointerUp(x, y); }
function tapMound(w, id) { const p = w.moundTap(id); return tapAt(w, p.x, p.y); }
/** Taps the right mound and waits until the dig is judged. → events */
function digRight(w) {
  const a = w.answer(); assert.ok(a && !a.digging, 'an answer');
  assert.strictEqual(tapMound(w, a.mound), 'dig');
  const out = [];
  until(w, () => { out.push(...evs(w)); return !w.dig; });
  out.push(...evs(w));
  return out;
}
function wrongMound(w) { const s = w.stepInfo; return w.mounds.find(m => m.state === 'buried' && !s.targets.includes(m.id)); }
function solveRound(w) {
  for (let k = 0; k < 40 && w.state === 'round'; k++) {
    if (w.interactive) digRight(w); else w.update(H);
    until(w, () => w.interactive || w.state !== 'round');
  }
}
function box(m, L) {   // a mound's visible box: mound body + the peeking thing
  const top = Math.min(m.y - m.h0, m.thingY - m.size);
  return { x: m.x - m.w / 2, y: top, w: m.w, h: m.y - top };
}
function overlap(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
function circleBox(c, b) { const nx = Math.max(b.x, Math.min(c.x, b.x + b.w)), ny = Math.max(b.y, Math.min(c.y, b.y + b.h)); return Math.hypot(c.x - nx, c.y - ny) < c.r; }
/** Independent matcher (DESIGN §5.1): does `t` answer step `s` of round r? */
function myMatch(r, s, t) {
  const p = s.params;
  switch (r.topic) {
    case 'colors': return t.kind === 'egg' && t.color === p.color;
    case 'shapes': return t.kind === 'stone' && t.shape === p.shape && (r.age < 5 || t.color === p.color);
    case 'size': return t.size === p.size;
    case 'animals': return t.animal === p.animal;
    case 'initial': return C.initialOf(t.animal, r.lang) === p.letter;
    case 'count': return t.kind === 'bone';
    case 'letters': return t.text === p.letter;
    case 'lower': return t.text === p.small && p.letter === p.small.toUpperCase();
    case 'add': return +t.text === p.a + p.b;
    case 'sub': return +t.text === p.a - p.b;
    case 'oddeven': return (+t.text % 2 ? 'odd' : 'even') === p.parity;
  }
}

// =====================================================================================================================
test('rng: deterministic, ranges, fork', () => {
  const a = new DD.RNG(42), b = new DD.RNG(42);
  for (let i = 0; i < 100; i++) assert.strictEqual(a.next(), b.next());
  const r = new DD.RNG('x');
  for (let i = 0; i < 1000; i++) { const v = r.int(2, 5); assert.ok(v >= 2 && v <= 5); const f = r.float(1, 2); assert.ok(f >= 1 && f < 2); }
  assert.strictEqual(new DD.RNG(1).sample([1, 2, 3, 4], 3).length, 3);
  assert.notStrictEqual(new DD.RNG(7).fork(1).next(), new DD.RNG(7).fork(2).next());
});

test('logical size: short side 720, long side clamped 960–1600', () => {
  const L = DD.World.logicalSize;
  assert.deepStrictEqual(L(1024, 768), { W: 960, H: 720 });
  assert.deepStrictEqual(L(852, 393), { W: 1561, H: 720 });
  assert.deepStrictEqual(L(393, 852), { W: 720, H: 1561 });
  assert.deepStrictEqual(L(3000, 500), { W: 1600, H: 720 });
  assert.deepStrictEqual(L(768, 1024), { W: 720, H: 960 });
});

test('layout: DESIGN §2 boxes (bubble, hud, shelf + 12 slots, Bun, item size)', () => {
  for (const v of VIEWPORTS) for (const age of AGES) {
    const L = DD.World.computeLayout(v.W, v.H, v.ins, null, age), ins = L.ins, P = v.H > v.W;
    assert.strictEqual(L.portrait, P);
    assert.strictEqual(L.groundY, v.H - ins.bottom - (P ? 26 : 14));
    assert.strictEqual(L.bubble.x, ins.left + 24);
    if (P) { assert.strictEqual(L.bubble.y, ins.top + 110); assert.strictEqual(L.bubble.h, 124); assert.strictEqual(L.shelf.y, L.bubble.y + L.bubble.h + 14); }
    else { assert.strictEqual(L.bubble.y, ins.top + 18); assert.strictEqual(L.bubble.h, 122); assert.ok(L.bubble.w <= 560); assert.strictEqual(L.shelf.y, ins.top + 152); }
    assert.strictEqual(L.shelf.x, ins.left + 24); assert.strictEqual(L.shelf.w, v.W - ins.left - ins.right - 48); assert.strictEqual(L.shelf.h, 92);
    assert.strictEqual(L.shelf.slots.length, 12); assert.strictEqual(L.shelf.size, 64);
    for (const s of L.shelf.slots) { assert.ok(s.x - 32 >= L.shelf.x - 1e-6 && s.x + 32 <= L.shelf.x + L.shelf.w + 1e-6, 'slot on the plank ' + v.name); assert.strictEqual(s.y, L.shelf.y + 92 - 30); }
    assert.ok(L.shelf.slots[1].x - L.shelf.slots[0].x <= 76 + 1e-9);
    assert.strictEqual(L.hud.x, v.W - ins.right - 160);
    assert.strictEqual(L.bun.x, ins.left + (P ? 104 : 118)); assert.strictEqual(L.bun.y, L.groundY - 4); assert.strictEqual(L.bun.h, P ? 200 : 230);
    const base = age <= 4 ? 112 : age === 5 ? 104 : 96;
    assert.strictEqual(L.item, Math.round(base * (L.tall ? 1.15 : 1)));
    assert.ok(L.item >= 96, 'items ≥ 96 px');
  }
});

test('layout: every viewport × age holds the most mounds a round can have (capacity ≥ MAX_MOUNDS)', () => {
  for (const v of VIEWPORTS) for (const age of AGES) {
    const L = DD.World.computeLayout(v.W, v.H, v.ins, null, age);
    assert.ok(L.capacity >= C.MAX_MOUNDS, `${v.name} age ${age}: capacity ${L.capacity}`);
    for (const r of L.rows) if (r !== L.rows[0]) assert.ok(r.y >= L.shelf.y + L.shelf.h + L.item + 40 - 1e-9, 'back row below the shelf + item + 40');
  }
});

function checkPlacement(L, n, seed, label) {
  const pos = DD.World.placeMounds(L, n, null, seed);
  assert.strictEqual(pos.length, n, label);
  const item = L.item, mw = 1.55 * item, hitR = 0.6 * item + 14;
  const bunBox = { x: L.bun.x - L.bun.w / 2 - 10, y: L.bun.y - L.bun.h - 10, w: L.bun.w + 20, h: L.bun.h + 20 };   // + bunPad
  for (let i = 0; i < n; i++) {
    const p = pos[i];
    assert.ok(p.x - mw / 2 >= L.field.x0 - 1e-6 && p.x + mw / 2 <= L.field.x1 + 1e-6, `${label}: mound ${i} inside the field x (${p.x.toFixed(0)})`);
    assert.ok(p.y <= L.groundY && p.y >= L.field.y0 - 10, `${label}: mound ${i} y`);
    assert.ok(p.x + mw / 2 <= L.W - L.ins.right && p.x - mw / 2 >= L.ins.left, `${label}: on screen`);
    const hc = { x: p.x, y: p.y - 0.45 * item, r: hitR };
    for (const K of L.keep) assert.ok(!circleBox(hc, K), `${label}: mound ${i} hit area under the ${K.kind}`);
    const mb = { x: p.x - mw / 2, y: p.y - 1.25 * item, w: mw, h: 1.25 * item };
    assert.ok(!overlap(mb, bunBox), `${label}: mound ${i} overlaps Bun`);
    assert.ok(!circleBox(hc, bunBox), `${label}: mound ${i} hit area over Bun`);
    for (let j = 0; j < i; j++) assert.ok(Math.hypot(p.x - pos[j].x, p.y - pos[j].y) >= 1.45 * item - 1e-6, `${label}: mounds ${j},${i} ${Math.hypot(p.x - pos[j].x, p.y - pos[j].y).toFixed(0)} < 1.45 item`);
  }
  return pos;
}
test('layout: mound placement for 2–8 mounds on every viewport × age (inside field, apart, clear of keep-outs and Bun, deterministic)', () => {
  for (const v of VIEWPORTS) for (const age of AGES) {
    const L = DD.World.computeLayout(v.W, v.H, v.ins, null, age);
    for (let n = 2; n <= C.MAX_MOUNDS; n++) for (let s = 1; s <= 12; s++) checkPlacement(L, n, s * 977 + n, `${v.name} age ${age} n ${n}`);
    assert.deepStrictEqual(DD.World.placeMounds(L, 5, null, 3), DD.World.placeMounds(L, 5, null, 3));
  }
});

test('layout: fuzz 400 random aspects + safe insets + hudKeep boxes', () => {
  const r = new DD.RNG(5);
  for (let i = 0; i < 400; i++) {
    const land = r.chance(0.5), long = r.int(960, 1600);
    const W = land ? long : 720, H = land ? 720 : long;
    // device-like insets: notches only on phones (portrait long side ≥ 1400), tablets ≤ 40 px
    const ins = land ? (long >= 1400 ? { top: r.int(0, 20), right: r.int(0, 110), bottom: r.int(0, 40), left: r.int(0, 110) } : { top: r.int(0, 32), right: 0, bottom: r.int(0, 27), left: 0 })
      : long >= 1400 ? { top: r.int(0, 110), right: 0, bottom: r.int(0, 62), left: 0 } : { top: r.int(0, 40), right: 0, bottom: r.int(0, 34), left: 0 };
    const age = r.pick(AGES);
    const hk = r.chance(0.3) ? [{ x: W - ins.right - 150, y: ins.top + 4, w: 140, h: 60 }] : null;
    const L = DD.World.computeLayout(W, H, ins, null, age, hk);
    // iPhones (portrait ≥ 1.77) and iPads (≤ 1.45) hold 8; the odd 1.45–1.77 band holds ≥ 6 and squeezes the rest (next test)
    const ar = H / W, device = land || ar <= 1.45 || ar >= 1.77;
    assert.ok(L.capacity >= (device ? C.MAX_MOUNDS : 6), `fuzz ${W}x${H} ${JSON.stringify(ins)} age ${age}: capacity ${L.capacity}`);
    checkPlacement(L, r.int(2, Math.min(L.capacity, C.MAX_MOUNDS)), i, `fuzz ${W}x${H}`);
    if (!device) assert.strictEqual(DD.World.placeMounds(L, C.MAX_MOUNDS, null, i).length, C.MAX_MOUNDS);
  }
});

test('layout: over capacity (an odd viewport) still places every mound inside the field without stacking them', () => {
  const L = DD.World.computeLayout(720, 965, { top: 103, right: 0, bottom: 21, left: 0 }, null, 4);
  assert.ok(L.capacity < 8);
  const pos = DD.World.placeMounds(L, 8, null, 7);
  assert.strictEqual(pos.length, 8);
  for (let i = 0; i < 8; i++) {
    assert.ok(pos[i].x - L.moundW / 2 >= L.field.x0 - 1 && pos[i].x + L.moundW / 2 <= L.field.x1 + 1);
    for (let j = 0; j < i; j++) assert.ok(Math.hypot(pos[i].x - pos[j].x, pos[i].y - pos[j].y) >= 0.6 * L.item - 1e-6);
  }
});

test('layout: the world places its mounds and the safe tap points are inside the hit areas', () => {
  for (const v of VIEWPORTS) for (const topic of ['count', 'colors', 'letters']) {
    const age = topic === 'letters' ? 5 : 4;
    const w = roundOf(mkWorld({ vp: v, age }), topic, 3);
    for (const m of w.mounds) {
      const p = w.moundTap(m.id);
      assert.strictEqual(w._moundAt(p.x, p.y), m, `${v.name}: tap point of ${m.id} hits it`);
      assert.ok(p.x > w.layout.ins.left && p.x < v.W - w.layout.ins.right && p.y > w.layout.ins.top && p.y < v.H - w.layout.ins.bottom);
      for (const K of w.layout.keep) assert.ok(!(p.x >= K.x && p.x <= K.x + K.w && p.y >= K.y && p.y <= K.y + K.h), 'tap point under ' + K.kind);
    }
    const b = w.bunHit();
    assert.strictEqual(w._moundAt(b.x, b.y), null, 'Bun is not a mound');
  }
});

// ---------------------------------------------------------------- content
test('content: tables (palette hex, topics per age, shapes, animals)', () => {
  for (const c in HEX) assert.strictEqual(DD.PALETTE[c].base, HEX[c]);
  assert.deepStrictEqual(DD.COLORS, ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink']);
  assert.deepStrictEqual(DD.SHAPES, ['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'diamond', 'oval']);
  assert.deepStrictEqual(DD.ANIMALS, ['duck', 'cat', 'dog', 'cow', 'pig', 'frog', 'lion', 'elephant']);
  for (const a of AGES) { assert.deepStrictEqual(DD.AGE_TOPICS[a], AGE_TOPICS[a]); assert.deepStrictEqual(C.topicsFor(a), AGE_TOPICS[a]); }
  for (const a of AGES) for (const t of DD.AGE_TOPICS[a]) assert.ok(DD.AGE_POOLS[a].includes(t));
  assert.deepStrictEqual(C.safeSetsOf(4), [], 'no clash-free set of 4 colours');
});

function checkRound(r, label) {
  const err = C.validate(r);
  assert.strictEqual(err, null, label + ': ' + err);
  const age = r.age, nM = r.mounds.length;
  assert.ok(nM >= 2 && nM <= C.MAX_MOUNDS, label + ' mounds');
  assert.strictEqual(r.scoops, age <= 3 ? 2 : 3);
  if (r.roundIndex === 0) { assert.strictEqual(r.steps.length, 1, label + ' warm-up 1 step'); if (r.steps[0].mode === 'find') assert.strictEqual(nM, r.topic === 'size' ? 2 : age <= 4 ? 2 : 3, label + ' warm-up mounds'); }
  if (r.level === 0 && age <= 4) { assert.strictEqual(r.steps.length, 1, label + ' level 0: 1 step'); if (r.steps[0].mode === 'find') assert.ok(nM <= 3, label + ' level 0 ≤ 3 mounds'); }
  if (r.roundIndex === 0) assert.strictEqual(r.surprise, null);
  const cs = [...new Set(r.mounds.map(m => m.thing.color).filter(Boolean))];
  if (age < 5) { for (const [a, b] of CLASH) assert.ok(!(cs.includes(a) && cs.includes(b)), label + ' clash ' + a + '+' + b); assert.ok(!cs.includes('pink'), label + ' pink < 5'); }
  const shapes = [...new Set(r.mounds.map(m => m.thing.shape).filter(Boolean))];
  for (const [a, b] of [['square', 'rect'], ['circle', 'oval'], ['square', 'diamond']]) assert.ok(!(shapes.includes(a) && shapes.includes(b)), label + ' shapes ' + a + '+' + b);
  const used = new Set();
  for (const s of r.steps) {
    const hits = r.mounds.filter(m => myMatch(r, s, m.thing)).map(m => m.id);
    if (s.mode === 'find') {
      assert.deepStrictEqual(hits, s.targets, label + ' exactly one match for ' + s.promptKey + ' ' + JSON.stringify(s.params));
      assert.ok(!used.has(s.targets[0])); used.add(s.targets[0]);
    } else assert.deepStrictEqual(hits.slice().sort(), s.targets.slice().sort(), label + ' ' + s.mode + ' targets');
    if (s.mode === 'count') { assert.ok(s.need < nM, 'a spare stays buried'); if (age <= 4) assert.ok(s.need <= 5); }
    if (s.mode === 'findAll') assert.ok(s.need >= 2 && s.need <= 3 && nM > s.need);
    if (s.promptKey === 'p.shapes5') {
      const t = r.mounds.find(m => m.id === s.targets[0]).thing;
      assert.ok(r.mounds.some(m => m.id !== s.targets[0] && m.thing.color === t.color) && r.mounds.some(m => m.id !== s.targets[0] && m.thing.shape === t.shape), label + ' shapes5 needs both');
    }
  }
  const pk = r.mounds.map(m => m.thing.kind);
  if (r.topic === 'colors') assert.ok(pk.every(k => k === 'egg'));
  if (r.topic === 'shapes') assert.ok(pk.every(k => k === 'stone'));
  if (r.topic === 'count') assert.ok(pk.every(k => k === 'bone'));
  if (['animals', 'initial'].includes(r.topic)) assert.ok(pk.every(k => k === 'toy'));
  if (['letters', 'lower', 'add', 'sub', 'oddeven'].includes(r.topic)) assert.ok(pk.every(k => k === 'tablet'));
  if (r.topic === 'lower') assert.ok(r.mounds.every(m => !/[il]/.test(m.thing.text)));
}
test('content: every topic × age 3–7 × 200 seeds × rounds 0–3 × level 0/1 × EN/VI is valid with exactly one match per find ask', () => {
  let n = 0;
  for (const topic of TOPICS) for (const age of AGES) for (let s = 0; s < 200; s++) {
    const lang = LANGS[s % 2], level = s % 3 === 0 ? 0 : 1, rng = new DD.RNG(s * 31 + age);
    let prevKey = null, prevN = 0;
    for (let ri = 0; ri < 4; ri++) {
      const r = C.makeRound(topic, { age, lang, rng, roundIndex: ri, level, surprise: ri ? 'mole' : null, short: ri === 3 && s % 4 === 0, prevKey, prevN });
      checkRound(r, `${topic} age ${age} seed ${s} r${ri} L${level}`);
      if (prevKey) assert.notStrictEqual(r.key, prevKey, `${topic} age ${age}: the same set twice in a row`);
      if (r.steps[0].mode === 'count') { if (prevN && C.countRange(age, ri, level)[1] > C.countRange(age, ri, level)[0]) assert.notStrictEqual(r.steps[0].need, prevN, 'count N repeats'); prevN = r.steps[0].need; }
      prevKey = r.key; n++;
    }
  }
  assert.ok(n >= 40000);
});

test('content: deterministic per seed; steps / mounds per age as DESIGN §5.1 (later rounds)', () => {
  const a = C.makeRound('colors', { age: 4, rng: new DD.RNG(9), roundIndex: 2, level: 1 }), b = C.makeRound('colors', { age: 4, rng: new DD.RNG(9), roundIndex: 2, level: 1 });
  assert.deepStrictEqual(a, b);
  const span = { 3: [2, 3], 4: [3, 4], 5: [4, 5], 6: [4, 6], 7: [4, 6] };
  for (const age of AGES) {
    const seen = new Set(), steps = new Set();
    for (let s = 0; s < 300; s++) {
      const topic = age <= 4 ? 'animals' : 'initial';
      const r = C.makeRound(age === 5 ? 'animals' : topic, { age, lang: 'en', rng: new DD.RNG(s), roundIndex: 2, level: 1 });
      seen.add(r.mounds.length); steps.add(r.steps.length);
      assert.ok(r.mounds.length >= span[age][0] && r.mounds.length <= span[age][1], `age ${age}: ${r.mounds.length} mounds`);
      if (age >= 5) assert.strictEqual(r.steps.length, 2);
    }
    assert.strictEqual(seen.size, span[age][1] - span[age][0] + 1, 'every mound count appears at age ' + age);
    if (age <= 4) assert.deepStrictEqual([...steps].sort(), [1, 2], '1–2 steps at age ' + age);
  }
  // count N ranges
  const rg = { 3: [3, 5], 4: [3, 5], 5: [4, 7], 6: [5, 7], 7: [5, 7] };
  for (const age of AGES) {
    const Ns = new Set();
    for (let s = 0; s < 300; s++) { const r = C.makeRound('count', { age, rng: new DD.RNG(s), roundIndex: 2, level: 1 }); Ns.add(r.steps[0].need); assert.strictEqual(r.mounds.length, Math.min(8, r.steps[0].need + 2)); }
    assert.deepStrictEqual([...Ns].sort((x, y) => x - y), Array.from({ length: rg[age][1] - rg[age][0] + 1 }, (_, i) => rg[age][0] + i), 'count N at age ' + age);
  }
  for (let s = 0; s < 100; s++) {
    const r0 = C.makeRound('count', { age: 4, rng: new DD.RNG(s), roundIndex: 0, level: 1 }), r1 = C.makeRound('count', { age: 4, rng: new DD.RNG(s), roundIndex: 1, level: 1 });
    assert.ok(r0.steps[0].need >= 1 && r0.steps[0].need <= 2); assert.ok(r1.steps[0].need >= 2 && r1.steps[0].need <= 3);
  }
});

test('content: variety — many different sets per topic and age; shapes5 / size / initial / lower rules', () => {
  for (const topic of TOPICS) for (const age of AGES) {
    const keys = new Set();
    for (let s = 0; s < 120; s++) keys.add(C.makeRound(topic, { age, lang: 'en', rng: new DD.RNG(s + 5), roundIndex: 2, level: 1 }).key);
    const want = topic === 'count' ? 3 : topic === 'size' ? 8 : topic === 'colors' && age === 3 ? 12 : topic === 'colors' && age === 4 ? 6 : topic === 'shapes' && age === 3 ? 15 : 20;
    assert.ok(keys.size >= want, `${topic} age ${age}: only ${keys.size} different sets`);
  }
  for (let s = 0; s < 200; s++) {
    const z = C.makeRound('size', { age: 3, rng: new DD.RNG(s), roundIndex: 2, level: 1 });
    assert.deepStrictEqual(z.mounds.map(m => m.thing.size).sort(), ['big', 'small']);
    assert.strictEqual(z.mounds[0].thing.kind, z.mounds[1].thing.kind);
    for (const lang of LANGS) {
      const r = C.makeRound('initial', { age: 6, lang, rng: new DD.RNG(s), roundIndex: 2, level: 1 });
      const ins = r.mounds.map(m => C.initialOf(m.thing.animal, lang));
      assert.strictEqual(new Set(ins).size, ins.length, 'distinct initials ' + lang);
      if (lang === 'vi') assert.ok(r.mounds.every(m => m.thing.animal !== 'frog'), 'VI: no ếch (Ê)');
    }
  }
  assert.strictEqual(C.initialOf('elephant', 'vi'), 'V'); assert.strictEqual(C.initialOf('lion', 'vi'), 'S'); assert.strictEqual(C.initialOf('frog', 'en'), 'F');
});

test('content: Talk time for every topic × age (picture choices, answer among them, 2 choices at age 3)', () => {
  for (const topic of TOPICS) for (const age of AGES) for (let s = 0; s < 60; s++) {
    const t = C.makeTalk(topic, { age, lang: LANGS[s % 2], rng: new DD.RNG(s) });
    assert.strictEqual(t.promptKey, 'talk.' + topic);
    assert.ok(t.choices.length >= 2 && t.choices.length <= 3);
    if (age <= 3 && ['colors', 'shapes', 'animals', 'size', 'count'].includes(topic)) assert.strictEqual(t.choices.length, 2, topic + ' 2 choices at age 3');
    assert.ok(t.choices.some(c => c.id === t.answer));
    assert.strictEqual(new Set(t.choices.map(c => JSON.stringify(c.value))).size, t.choices.length, 'distinct choices');
    for (const c of t.choices) assert.ok(ICON_KINDS.includes(c.thing.kind), 'icon kind ' + c.thing.kind);
    if (t.show) assert.ok(ICON_KINDS.includes(t.show.kind));
    if (age < 5) { const cs = t.choices.map(c => c.thing.color).filter(Boolean).concat(t.show && t.show.color ? [t.show.color] : []); for (const [a, b] of CLASH) assert.ok(!(cs.includes(a) && cs.includes(b))); }
    const ans = t.choices.find(c => c.id === t.answer);
    if (topic === 'colors') { assert.strictEqual(t.show.kind, 'egg'); assert.strictEqual(ans.value, t.show.color); }
    if (topic === 'count') { assert.strictEqual(t.show.kind, 'dots'); assert.strictEqual(ans.value, t.show.n); }
    if (topic === 'add') assert.strictEqual(ans.value, t.params.a + t.params.b);
    if (topic === 'sub') assert.strictEqual(ans.value, t.params.a - t.params.b);
    if (topic === 'oddeven') assert.strictEqual(t.choices.filter(c => (c.value % 2 ? 'odd' : 'even') === t.params.parity).length, 1);
    if (topic === 'size') assert.ok(t.choices.every(c => c.thing.kind === 'size' && ['bone', 'egg'].includes(c.thing.of)));
  }
});

test('content: chapter topics rotate between sessions (the left-out topic opens the next session)', () => {
  for (const age of AGES) {
    const r = new DD.RNG(age), first = C.topicsFor(age, r, null), second = C.topicsFor(age, r, first);
    const left = DD.AGE_POOLS[age].filter(t => !first.includes(t));
    assert.strictEqual(second[0], left[0]);
    assert.strictEqual(new Set(second).size, 4);
    const pool = DD.AGE_POOLS[age];
    for (let i = 2; i < 4; i++) assert.ok(pool.indexOf(second[i]) > pool.indexOf(second[i - 1]), 'chapters 2–4 in difficulty order');
  }
});

test('content: retarget gives a still-buried, uniquely matching find step', () => {
  for (let s = 0; s < 200; s++) for (const [topic, age] of [['colors', 4], ['shapes', 5], ['animals', 5], ['letters', 5], ['add', 6], ['sub', 7], ['initial', 6], ['lower', 6]]) {
    const r = C.makeRound(topic, { age, rng: new DD.RNG(s), roundIndex: 2, level: 1 });
    if (r.steps.length < 2) continue;
    const buried = r.mounds.map(m => m.id).filter(id => id !== r.steps[0].targets[0] && id !== r.steps[1].targets[0]);
    const ns = C.retarget(r, 1, buried);
    if (!ns) continue;
    assert.ok(buried.includes(ns.targets[0]));
    const hits = r.mounds.filter(m => myMatch(r, ns, m.thing)).map(m => m.id);
    assert.deepStrictEqual(hits, ns.targets, topic + ' retarget unique');
  }
});

// ---------------------------------------------------------------- world flows
test('world: tap → shovel in → scoops (one tap is enough) → reveal → found → hop → shelved; event order + positions', () => {
  for (const age of [3, 4]) {
    const w = roundOf(mkWorld({ age }), 'animals', 1);
    const a = w.answer(), m = w.moundById(a.mound), t0 = w.time;
    assert.strictEqual(m.state, 'buried'); assert.ok(w.interactive);
    assert.strictEqual(tapMound(w, a.mound), 'dig');
    assert.strictEqual(m.state, 'digging'); assert.ok(!w.interactive); assert.strictEqual(w.shovel.state, 'in');
    const out = []; let revealT = 0, judgeT = 0;
    until(w, () => { for (const e of evs(w)) { out.push(e); if (e.type === 'reveal') revealT = w.time; if (e.type === 'found') judgeT = w.time; } return w.shelfItems.length === 1; });
    const ty = types(out).filter(t => ['dig', 'scoop', 'reveal', 'found', 'hop', 'shelved'].includes(t));
    const n = age <= 3 ? 2 : 3;
    assert.deepStrictEqual(ty, ['dig'].concat(Array(n).fill('scoop'), ['reveal', 'found', 'hop', 'shelved']));
    const sc = out.filter(e => e.type === 'scoop');
    sc.forEach((e, i) => { assert.strictEqual(e.i, i + 1); assert.strictEqual(e.n, n); });
    for (const e of out) if (['dig', 'scoop', 'reveal', 'found', 'hop', 'shelved', 'fling', 'puff', 'sandLand'].includes(e.type)) assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y), e.type + ' x,y');
    // dig time without extra taps: shovelIn + scoopTime + (n − 1) × autoScoop
    const exp = CFG.shovelIn + CFG.scoopTime + (n - 1) * CFG.autoScoop;
    assert.ok(Math.abs(revealT - t0 - exp) < 0.03, `dig took ${(revealT - t0).toFixed(3)} s, expected ${exp.toFixed(3)}`);
    assert.ok(Math.abs(judgeT - revealT - CFG.riseTime) < 0.02);
    assert.strictEqual(m.state, 'empty'); assert.ok(m.dig > 0.95);
    assert.strictEqual(w.shelfItems[0].slot, 0);
  }
});

test('world: extra taps on the digging mound queue scoops (max 2) and dig faster; taps elsewhere are busy (no miss)', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'animals', 1), a = w.answer(), t0 = w.time;
  tapMound(w, a.mound); run(w, 0.05);
  const r = [tapMound(w, a.mound), tapMound(w, a.mound), tapMound(w, a.mound)];
  assert.deepStrictEqual(r, ['dig', 'dig', 'dig']);
  assert.strictEqual(w.dig.queued, 2, 'max 2 queued');
  const other = w.mounds.find(m => m.id !== a.mound && m.state === 'buried');
  assert.strictEqual(tapMound(w, other.id), 'busy');
  assert.ok(types(evs(w)).includes('busy'));
  assert.strictEqual(w.misses, 0); assert.strictEqual(other.state, 'buried');
  until(w, () => !w.dig || w.dig.phase === 'rise');
  const fast = w.time - t0, slow = CFG.shovelIn + CFG.scoopTime + 2 * CFG.autoScoop;
  assert.ok(fast < slow - 0.6, `fast dig ${fast.toFixed(2)} s vs ${slow.toFixed(2)} s`);
  assert.ok(Math.abs(fast - (CFG.shovelIn + 3 * CFG.scoopFast)) < 0.03, 'queued scoops run back to back at scoopFast (' + fast.toFixed(3) + ')');
});

test('world: wrong dig — wiggle, stays open, dims to 0.35, a miss; tapping it again is "already" (no miss); stars 3/2/1', () => {
  const w = roundWhere({ age: 4 }, 'colors', 2, r => r.steps.length === 1 && r.mounds.length >= 3);
  const m = wrongMound(w);
  tapMound(w, m.id);
  const out = [];
  until(w, () => { out.push(...evs(w)); return !w.dig; });
  out.push(...evs(w));
  const e = out.find(x => x.type === 'wrong');
  assert.ok(e, 'wrong event');
  assert.strictEqual(e.got.nameKind, 'color'); assert.strictEqual(e.got.nameValue, m.thing.color);
  assert.strictEqual(e.want.nameValue, w.stepInfo.nameValue); assert.strictEqual(e.streak, 1);
  assert.strictEqual(m.state, 'open'); assert.strictEqual(w.misses, 1);
  let maxWob = 0; run(w, 0.4, () => { maxWob = Math.max(maxWob, Math.abs(m.twob)); });
  assert.ok(maxWob > 5 && maxWob <= 8.5, 'wiggle ±8 px (' + maxWob.toFixed(1) + ')');
  run(w, 2.5);
  assert.ok(Math.abs(m.dim - 0.35) < 0.02, 'dim ' + m.dim);
  assert.ok(Math.abs(m.twob) < 0.5, 'wiggle damped');
  assert.strictEqual(tapMound(w, m.id), 'already');
  assert.strictEqual(w.misses, 1);
  digRight(w);
  until(w, () => w.state === 'roundDone');
  assert.strictEqual(w.roundStars, 2);
  assert.strictEqual(w._starsFor(0), 3); assert.strictEqual(w._starsFor(2), 1); assert.strictEqual(w._starsFor(5), 1);
});

test('world: reveal spring overshoots (> 1) then settles at 1, with stretch going up and squash at the turn', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'animals', 1), a = w.answer(), m = w.moundById(a.mound);
  tapMound(w, a.mound);
  until(w, () => w.dig && w.dig.phase === 'rise');
  let maxR = 0, maxS = 1, minS = 1;
  until(w, () => { maxR = Math.max(maxR, m.rise); if (m.state !== 'found') { maxS = Math.max(maxS, m.tsy); minS = Math.min(minS, m.tsy); } return m.state === 'found'; });
  assert.ok(maxR > 1.05 && maxR < 1.3, 'overshoot ' + maxR.toFixed(3));
  assert.ok(maxS > 1.08, 'stretch ' + maxS.toFixed(3)); assert.ok(minS < 0.97, 'squash ' + minS.toFixed(3));
  const w2 = roundOf(mkWorld({ age: 4, seed: 3 }), 'animals', 1), a2 = w2.answer(), m2 = w2.moundById(a2.mound);
  w2.mounds.forEach(q => { if (q !== m2) q.state = 'open'; });
  tapMound(w2, a2.mound);
  until(w2, () => w2.dig && w2.dig.phase === 'rise');
  m2.after = 'x';   // keep it in the hole: watch the spring settle
  w2.dig.t = -99; run(w2, 2);
  assert.ok(Math.abs(m2.rise - 1) < 0.01);
  assert.ok(Math.abs(m2.thingY - (m2.y - 0.12 * m2.h0)) < 1.5, 'stands on the hole rim');
  assert.ok(Math.abs(m2.clipY - (m2.y + 2)) < 1e-6);
});

test('world: geometry — buried thingY / clipY follow pileTop and peek (DESIGN §5.2)', () => {
  for (const [topic, age] of [['colors', 4], ['shapes', 4], ['animals', 4], ['count', 4], ['letters', 5]]) {
    const w = roundOf(mkWorld({ age }), topic, 1);
    for (const m of w.mounds) {
      const pk = PEEK[m.thing.kind] * (age >= 5 ? 0.85 : 1);
      assert.ok(Math.abs(m.peek - pk) < 1e-9, 'peek ' + m.thing.kind);
      const top = m.y - m.h0;
      assert.ok(Math.abs(m.thingY - (top + m.size * (1 - pk))) < 1e-6, 'thingY');
      assert.ok(Math.abs(m.clipY - (top + 4)) < 1e-6, 'clipY');
      assert.ok(Math.abs(m.w - 1.55 * w.layout.item) < 1e-6 && Math.abs(m.h0 - 0.62 * w.layout.item) < 1e-6);
      assert.strictEqual(m.pop, 1);
    }
  }
});

test('world: egg hatch — wobble ×3, crack 0 → 1, hatch event, shell halves, the baby dino hops to the shelf', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'colors', 1), a = w.answer(), m = w.moundById(a.mound);
  tapMound(w, a.mound);
  const out = []; let maxTilt = 0, signCh = 0, lastS = 0;
  until(w, () => { out.push(...evs(w)); if (m.state === 'found' && !m.hatched) { maxTilt = Math.max(maxTilt, Math.abs(m.trot)); const s = Math.sign(m.trot); if (s && s !== lastS) { signCh++; lastS = s; } } return m.hatched; });
  out.push(...evs(w));
  const h = out.find(e => e.type === 'hatch');
  assert.ok(h); assert.strictEqual(h.color, m.thing.color); assert.strictEqual(m.crack, 1);
  assert.ok(maxTilt > 0.08 && signCh >= 5, 'wobbles (' + signCh + ' sign changes)');
  assert.strictEqual(w.eggBits.length, 2); assert.deepStrictEqual(w.eggBits.map(b => b.kind).sort(), ['eggBottom', 'eggTop']);
  until(w, () => w.flying.length === 1);
  assert.strictEqual(w.flying[0].dino, m.thing.color);
  assert.strictEqual(w.flying[0].spin, 0, 'eggs / dinos do not spin');
  until(w, () => w.shelfItems.length === 1);
  assert.strictEqual(w.shelfItems[0].dino, m.thing.color);
  run(w, 1.2); assert.strictEqual(w.eggBits.length, 0, 'shell halves fade');
});

test('world: hop to the shelf — ballistic arc, apex 140 px above the higher end, ≤ 1 spin, scales to 64, landing squash', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'shapes', 1), a = w.answer();
  tapMound(w, a.mound);
  until(w, () => w.flying.length === 1);
  const f = w.flying[0], y0 = f.path.y0, y1 = f.path.y1, x0 = f.path.x0;
  let minY = 1e9, maxRot = 0, last = null, acc = [];
  until(w, () => {
    if (w.flying.length) { minY = Math.min(minY, f.y); maxRot = Math.max(maxRot, Math.abs(f.rot)); if (last) acc.push(f.y - last); last = f.y; }
    return w.shelfItems.length === 1;
  });
  assert.ok(Math.abs(minY - (Math.min(y0, y1) - 140)) < 2, 'apex ' + minY.toFixed(1));
  assert.ok(maxRot <= 2 * Math.PI + 1e-6 && maxRot > 5, 'one turn for a stone');
  const d2 = acc.slice(1).map((v, i) => v - acc[i]).filter(Number.isFinite);
  const g = d2.reduce((s, v) => s + v, 0) / d2.length / (H * H);
  assert.ok(Math.abs(g - CFG.hopG) / CFG.hopG < 0.05, 'constant gravity ' + g.toFixed(0));
  const it = w.shelfItems[0];
  assert.strictEqual(it.s, 64); assert.ok(it.sy < 0.85, 'landing squash'); assert.ok(x0 !== it.x);
  run(w, 0.6); assert.ok(Math.abs(it.sy - 1) < 0.03, 'squash settles');
});

test('world: sand clumps — ballistic (gravity 1400), both sides, land, fade, ≤ 80', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'count', 2), a = w.answer();
  tapMound(w, a.mound);
  until(w, () => w.sand.length >= 10);
  const c = w.sand[0], v0 = c.vy; w.update(H); const v1 = c.vy;
  assert.ok(Math.abs((v1 - v0) / H - 1400) < 1, 'gravity');
  const m = w.moundById(a.mound);
  until(w, () => w.dig && w.dig.phase === 'rise');
  const all = w.sand.slice();
  assert.ok(all.some(q => q.x < m.x) && all.some(q => q.x > m.x), 'both sides');
  run(w, 1.5);
  assert.ok(all.every(q => q.landed || !w.sand.includes(q)), 'all landed');
  for (let k = 0; k < 30; k++) w._fling(m, m.x, m.y - 50, 1);
  assert.ok(w.sand.length <= 80);
});

test('world: count to N — every bone counts (i of N), the step ends at N, the spares stay buried', () => {
  const w = roundWhere({ age: 4 }, 'count', 2, r => r.steps[0].need >= 4);
  const N = w.stepInfo.need, counts = [];
  for (let i = 0; i < N; i++) {
    assert.ok(w.interactive, 'interactive before bone ' + (i + 1));
    const e = digRight(w).find(x => x.type === 'found');
    counts.push(e.count);
    if (i < N - 1) until(w, () => w.interactive);
  }
  assert.deepStrictEqual(counts, Array.from({ length: N }, (_, i) => ({ i: i + 1, n: N })));
  assert.ok(!w.interactive);
  assert.strictEqual(w.mounds.filter(m => m.state === 'buried').length, w.mounds.length - N);
  until(w, () => w.state === 'roundDone');
  assert.strictEqual(w.roundStars, 3);
});

test('world: findAll odd/even — the wrong parity is a mistake, done after all right ones', () => {
  const w = roundOf(mkWorld({ age: 7 }), 'oddeven', 2), s = w.stepInfo;
  assert.strictEqual(s.mode, 'findAll');
  const bad = wrongMound(w); tapMound(w, bad.id); until(w, () => !w.dig);
  assert.ok(types(evs(w)).includes('wrong')); assert.strictEqual(w.misses, 1);
  for (let i = 0; i < s.need; i++) { until(w, () => w.interactive); digRight(w); }
  until(w, () => w.state === 'roundDone');
  assert.strictEqual(w.roundStars, 2);
});

test('world: a 2-step round — stepDone, "Now…" ask after 0.6 s; a step whose mound was dug open earlier is re-targeted', () => {
  const w = roundWhere({ age: 5 }, 'animals', 2, r => r.steps.length === 2);
  digRight(w);
  const out = []; let stepT = 0, askT = 0;
  until(w, () => { for (const e of evs(w)) { out.push(e); if (e.type === 'stepDone') stepT = w.time; if (e.type === 'ask') askT = w.time; } return w.interactive; });
  assert.ok(Math.abs(askT - stepT - CFG.askGap) < 0.02);
  const ask = out.find(e => e.type === 'ask'); assert.strictEqual(ask.step, 1); assert.strictEqual(ask.first, false);
  // re-target: dig step 2's target as a wrong answer in step 1
  const w2 = roundWhere({ age: 5 }, 'animals', 2, r => r.steps.length === 2 && r.mounds.length >= 4, null);
  const t2 = w2.cur.steps[1].targets[0];
  tapMound(w2, t2); until(w2, () => !w2.dig); evs(w2);
  assert.strictEqual(w2.moundById(t2).state, 'open');
  digRight(w2);
  until(w2, () => w2.interactive || w2.state !== 'round');
  if (w2.state === 'round') {
    const s2 = w2.stepInfo;
    assert.notStrictEqual(s2.targets[0], t2, 're-targeted');
    assert.strictEqual(w2.moundById(s2.targets[0]).state, 'buried');
    assert.strictEqual(w2.mounds.filter(m => myMatch(w2.cur, s2, m.thing)).length, 1);
    digRight(w2);
  }
  until(w2, () => w2.state === 'roundDone');
});

test('world: empty sand taps — dust (sandTap), the 2nd shows a hint; hint cooldown 6 s; assist after 6 (age ≤ 4) / 5 (age 5+)', () => {
  for (const age of [4, 6]) {
    const w = roundOf(mkWorld({ age }), age <= 4 ? 'animals' : 'initial', 2), L = w.layout;
    const sx = L.field.x0 + 10, sy = L.groundY - 4;   // a sand point with no mound
    assert.strictEqual(w._moundAt(sx, sy), null);
    assert.strictEqual(tapAt(w, sx, sy), 'sand');
    assert.ok(types(evs(w)).includes('sandTap'));
    assert.strictEqual(tapAt(w, sx, sy), 'sand');
    let e = evs(w); assert.ok(types(e).includes('hint'), 'hint after 2');
    const hId = e.find(x => x.type === 'hint').id;
    assert.strictEqual(hId, w.answer().mound);
    assert.ok(w.hintHand && w.hintHand.id === hId);
    run(w, 0.3); assert.ok(w.moundById(hId).glow > 0.5);
    tapAt(w, sx, sy); tapAt(w, sx, sy);
    assert.ok(!types(evs(w)).includes('hint'), 'cooldown');
    const need = age <= 4 ? 6 : 5;
    while (w._noProg < need) tapAt(w, sx, sy);
    evs(w);
    const wrong = wrongMound(w);
    assert.strictEqual(tapMound(w, wrong.id), 'dig');
    e = evs(w);
    const as = e.find(x => x.type === 'assist');
    assert.ok(as, 'assist'); assert.strictEqual(w.dig.id, w.stepInfo.targets[0], 'the shovel digs the right one');
    assert.strictEqual(wrong.state, 'buried');
    assert.strictEqual(w.misses, 0, 'sand taps are no mistakes');
  }
});

test('world: idle nudges at 12 → 18 → 27 → 30 s; the 2nd idle also hints; a dig resets them', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'animals', 1), t0 = w.time, at = [];
  let hintIdle = 0;
  run(w, 100, () => { for (const e of evs(w)) { if (e.type === 'idle') at.push(+(w.time - t0).toFixed(1)); if (e.type === 'hint' && e.idle) hintIdle++; } });
  const gaps = at.map((t, i) => i ? +(t - at[i - 1]).toFixed(1) : t);
  assert.deepStrictEqual(gaps.slice(0, 4), [12, 18, 27, 30]);
  assert.ok(hintIdle >= 1);
  assert.strictEqual(w.state, 'round', 'no fail state, still waiting');
});

test('world: hint() manual, pokeBun repeats the prompt, soft drag / long press dig nothing', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'animals', 1);
  const h = w.hint(); assert.ok(h && h.mound === w.answer().mound);
  const b = w.bunHit();
  assert.strictEqual(tapAt(w, b.x, b.y), 'pokeBun');
  const pe = evs(w).find(e => e.type === 'pokeBun'); assert.strictEqual(pe.promptKey, w.stepInfo.promptKey); assert.ok(Number.isFinite(pe.x));
  const m = w.mounds[0], p = w.moundTap(m.id);
  w.pointerDown(p.x, p.y); w.pointerMove(p.x + 80, p.y); assert.strictEqual(w.pointerUp(p.x + 80, p.y), null);
  w.pointerDown(p.x, p.y); run(w, 1.1); assert.strictEqual(w.pointerUp(p.x, p.y), null);
  const s = evs(w).filter(e => e.type === 'soft'); assert.strictEqual(s.length, 2); assert.strictEqual(s[0].id, m.id);
  assert.strictEqual(m.state, 'buried'); assert.ok(!w.dig);
  // a small wobble of the finger is still a tap (released 40 px away: judged at the release point)
  w.pointerDown(p.x, p.y); w.pointerMove(p.x + 20, p.y + 20); assert.strictEqual(w.pointerUp(p.x + 20, p.y + 20), 'dig');
});

test('world: surprises — mole pops 3–8 s after the ask on free sand, tap → moleTap; pterosaur glides, tap → loop-the-loop; a mound always wins', () => {
  const w = roundOf(mkWorld({ age: 3, surprise: true, seed: 4 }), 'colors', 1, { surprise: 'mole' });
  const t0 = w.time;
  until(w, () => !!w.mole);
  const dt = w.time - t0; assert.ok(dt >= 3 - 1e-6 && dt <= 8 + 0.01, 'mole after ' + dt.toFixed(2));
  assert.ok(types(evs(w)).includes('mole'));
  until(w, () => w.moleHit());
  const mh = w.moleHit();
  for (const m of w.mounds) assert.ok(Math.hypot(mh.x - m.x, mh.y - (m.y - 0.45 * w.layout.item)) >= 1.2 * w.layout.item, 'mole clear of mounds');
  assert.strictEqual(w.pointerDown(mh.x, mh.y), 'mole');
  assert.ok(types(evs(w)).includes('moleTap')); assert.strictEqual(w.misses, 0);
  run(w, 2); assert.ok(!w.mole || w.mole.state === 'down');

  const w2 = roundOf(mkWorld({ age: 4, surprise: true, seed: 6 }), 'animals', 1, { surprise: 'ptero' });
  until(w2, () => !!w2.pteroHit());
  const ph = w2.pteroHit();
  assert.ok(ph.y > w2.layout.shelf.y + w2.layout.shelf.h, 'below the shelf');
  assert.strictEqual(w2.pointerDown(ph.x, ph.y), 'ptero');
  assert.ok(types(evs(w2)).includes('pteroTap'));
  let minY = 1e9; const y0 = w2.ptero.y;
  until(w2, () => { minY = Math.min(minY, w2.ptero.y); return w2.ptero.state === 'happy'; });
  assert.ok(y0 - minY > 1.8 * CFG.loopR, 'a full loop');
  // a mound under the finger wins: put the mole right on a mound's hit centre
  const w3 = roundOf(mkWorld({ age: 4 }), 'animals', 1), m3 = w3.mounds[0], c3 = w3.moundTap(m3.id);
  w3.mole = { x: c3.x, y: c3.y + 40, up: 1, _pup: 1, uv: 0, state: 'up', t: 0, spin: 0, q: 0, qv: 0 };
  assert.strictEqual(w3.pointerDown(c3.x, c3.y), 'press');
});

test('world: cheer → clear; shelf items bounce in a wave; they stay across rounds and slide into the satchel at the chapter end', () => {
  const w = mkWorld({ age: 4 });
  w.levels = ['animals', 'animals', 'animals', 'animals']; w.startLevel(1); evs(w);
  until(w, () => w.interactive);
  solveRound(w);
  until(w, () => w.state === 'roundDone' && w.phase === 'cheer');
  assert.ok(types(evs(w)).includes('roundDone'));
  let maxB = 0; until(w, () => { maxB = Math.max(maxB, ...w.shelfItems.map(q => q.bounce)); return w.phase === 'clear'; });
  assert.ok(maxB > 0.9, 'bounce wave');
  const n1 = w.shelfItems.length;
  until(w, () => w.state === 'round' && w.round === 1);
  assert.strictEqual(w.shelfItems.length, n1, 'items stay across rounds');
  for (let r = 1; r < 4; r++) { until(w, () => w.interactive); solveRound(w); until(w, () => w.state !== 'round'); if (r < 3) until(w, () => w.state === 'round'); }
  until(w, () => w.phase === 'clear');
  const e = evs(w); assert.ok(types(e).includes('shelfLeave'));
  let maxLeave = 0; until(w, () => { maxLeave = Math.max(maxLeave, ...w.shelfItems.map(q => q.leave), 0); return w.state === 'talk'; });
  assert.ok(maxLeave > 0.5); assert.strictEqual(w.shelfItems.length, 0);
});

test('world: shelf full — the oldest slides away, everyone shifts left, never more than 12', () => {
  const w = roundOf(mkWorld({ age: 6 }), 'count', 2);
  const mk = k => ({ id: 'x' + k, thing: { kind: 'bone' }, dino: null, slot: k, x: w.layout.shelf.slots[k].x, y: w.layout.shelf.slots[k].y, _px: 0, _py: 0, s: 64, sx: 1, sy: 1, q: 0, qv: 0, bounce: 0, leave: 0, leaving: false, alpha: 1, _bT: -1 });
  for (let k = 0; k < 12; k++) w.shelfItems.push(mk(k));
  digRight(w);
  until(w, () => w.flying.length === 0 && !w.mounds.some(m => m.state === 'found'));
  run(w, 1);
  assert.strictEqual(w.shelfItems.length, 12);
  assert.deepStrictEqual(w.shelfItems.map(q => q.slot).sort((a, b) => a - b), Array.from({ length: 12 }, (_, i) => i));
  assert.ok(!w.shelfItems.some(q => q.id === 'x0'), 'the oldest left');
});

test('world: rotation / resize mid-dig — mounds re-placed (state kept), flights land, the dig continues', () => {
  const w = roundWhere({ age: 4, vp: VIEWPORTS[0] }, 'count', 2, r => r.steps[0].need >= 3);
  digRight(w); until(w, () => w.flying.length === 1);
  const a = w.answer(); tapMound(w, a.mound); run(w, 0.3);
  const st = w.mounds.map(m => m.state), dg = w.mounds.map(m => m.dig);
  for (const v of [VIEWPORTS[2], VIEWPORTS[7], VIEWPORTS[11], VIEWPORTS[3]]) {
    w.setViewport(v.W, v.H, v.ins);
    assert.strictEqual(w.flying.length, 0, 'flights land instantly');
    assert.deepStrictEqual(w.mounds.map(m => m.state), st);
    w.mounds.forEach((m, i) => assert.ok(Math.abs(m.dig - dg[i]) < 0.35));
    const L = w.layout;
    for (let i = 0; i < w.mounds.length; i++) {
      const m = w.mounds[i];
      assert.ok(m.x - m.w / 2 >= L.field.x0 - 1e-6 && m.x + m.w / 2 <= L.field.x1 + 1e-6, v.name + ' inside');
      for (let j = 0; j < i; j++) assert.ok(Math.hypot(m.x - w.mounds[j].x, m.y - w.mounds[j].y) >= 1.45 * L.item - 1e-6);
    }
    for (const it of w.shelfItems) assert.strictEqual(it.x, L.shelf.slots[it.slot].x);
    run(w, 0.05);
  }
  assert.ok(w.dig, 'the dig continues');
  until(w, () => !w.dig);
  assert.ok(types(evs(w)).includes('found'));
});

test('world: chapter time limit — Talk time after round 3 once the chapter passed 75 s; Talk re-asks, glows, answers itself', () => {
  const w = mkWorld({ age: 4 });
  w.levels = ['animals', 'animals', 'animals', 'animals']; w.startLevel(1);
  until(w, () => w.interactive);
  w.levelStartTime -= 100;   // the chapter is "long"
  for (let r = 0; r < 3; r++) { until(w, () => w.interactive); solveRound(w); until(w, () => w.state !== 'round'); if (r < 2) until(w, () => w.state === 'round'); }
  until(w, () => w.state === 'talk' || (w.state === 'round' && w.round === 3));
  assert.strictEqual(w.state, 'talk'); assert.strictEqual(w.roundsPerLevel, 3);
  evs(w);
  const asks = [];
  run(w, 50, () => { for (const e of evs(w)) if (e.type === 'talkAsk' || e.type === 'talkResult') asks.push(e); });
  assert.deepStrictEqual(asks.filter(e => e.type === 'talkAsk').map(e => e.n), [1, 2, 3]);
  assert.ok(asks.find(e => e.n === 2).glowAnswer);
  const res = asks.find(e => e.type === 'talkResult'); assert.ok(res && res.auto && !res.correct);
});

test('world: interpolation twins + fixed sub-steps ≤ 1/120 s; alpha in [0, 1)', () => {
  assert.ok(CFG.step <= 1 / 120 + 1e-12);
  const w = roundOf(mkWorld({ age: 4 }), 'colors', 1), a = w.answer();
  tapMound(w, a.mound);
  for (let i = 0; i < 200; i++) {
    w.update(1 / 47);
    assert.ok(w.alpha >= 0 && w.alpha < 1);
    for (const m of w.mounds) for (const k of ['_pdig', '_pthingY', '_pwob', '_ppop', '_prise', '_pclipY']) assert.ok(Number.isFinite(m[k]), k);
    for (const k of ['_px', '_py', '_pangle']) assert.ok(Number.isFinite(w.shovel[k]));
    for (const f of w.flying) for (const k of ['_px', '_py', '_prot']) assert.ok(Number.isFinite(f[k]));
    for (const c of w.sand) for (const k of ['_px', '_py']) assert.ok(Number.isFinite(c[k]));
  }
});

function eventLog(seed, age, frame, secs) {
  const w = new DD.World({ seed, age }); w.setViewport(1280, 720, null);
  const b = new DD.Bot(w, { skill: 0.7, seed: seed + 1 });
  w.newSession();
  const log = []; let t = 0, stepT = 0;
  // the bot acts on a 1/60 s clock whatever the render frame (like main.js at speed 1 with a fixed input step)
  while (t < secs && w.state !== 'sessionDone') {
    w.update(frame); t += frame; stepT += frame;
    while (stepT >= 1 / 60 - 1e-9) { stepT -= 1 / 60; b.step(1 / 60); }
    for (const e of w.drainEvents()) log.push(e.type + ':' + (e.id || '') + ':' + Math.round(w.time * 120));
  }
  return log;
}
test('world: deterministic — same seed + same inputs → the same events at any frame size', () => {
  for (const age of [3, 5, 7]) {
    const a = eventLog(10 + age, age, 1 / 60, 120), b = eventLog(10 + age, age, 1 / 60, 120);
    assert.deepStrictEqual(a, b);
    assert.ok(a.length > 100);
  }
  const w1 = new DD.World({ seed: 5, age: 4 }), w2 = new DD.World({ seed: 5, age: 4 });
  w1.setViewport(960, 720); w2.setViewport(960, 720); w1.newSession(); w2.newSession();
  for (let i = 0; i < 600; i++) w1.update(1 / 30);
  for (let i = 0; i < 2400; i++) w2.update(1 / 120);
  assert.deepStrictEqual(types(w1.drainEvents()), types(w2.drainEvents()));
  assert.strictEqual(w1.cur.key, w2.cur.key);
});

// ---------------------------------------------------------------- bot
test('bot: full sessions per age × viewport finish with zero stuck rounds; bot-only through the input API', () => {
  for (const age of AGES) for (const v of [VIEWPORTS[0], VIEWPORTS[3], VIEWPORTS[4], VIEWPORTS[7]]) for (const skill of [0.5, 0.9]) {
    const w = new DD.World({ seed: age * 13 + skill * 10, age, lang: age % 2 ? 'vi' : 'en' });
    w.setViewport(v.W, v.H, v.ins);
    const b = new DD.Bot(w, { skill, seed: age });
    w.newSession();
    let t = 0, rT = 0, maxR = 0, rounds = 0, nan = false;
    while (w.state !== 'sessionDone' && t < 1200) {
      b.step(1 / 30); w.update(1 / 30); t += 1 / 30;
      for (const e of w.drainEvents()) { b.onEvent(e); if (e.type === 'round') rT = w.time; if (e.type === 'roundDone') { rounds++; maxR = Math.max(maxR, w.time - rT); } }
      if (!w.mounds.every(m => Number.isFinite(m.thingY) && Number.isFinite(m.dig)) || !Number.isFinite(w.shovel.x)) { nan = true; break; }
    }
    assert.ok(!nan, 'NaN');
    assert.strictEqual(w.state, 'sessionDone', `age ${age} ${v.name} skill ${skill}: ${w.state}/${w.phase} after ${t.toFixed(0)} s`);
    assert.ok(maxR < 90, `a round took ${maxR.toFixed(0)} s`);
    assert.ok(rounds >= 12 && rounds <= 16);
    assert.ok(b.stats.found > 12 && b.stats.talks === 4);
    assert.ok(w.stars >= rounds);
  }
});

// ---------------------------------------------------------------- weather
test('weather: moods, crossfade, ambient fields, clouds, particle sprites, cap 120, headless', () => {
  const wx = new DD.Weather({ width: 1280, height: 720, groundY: 706, seed: 3 });
  const a = wx.ambient;
  assert.strictEqual(a.mood, 'morning'); assert.strictEqual(a.skyTop, SKY.morning[0]); assert.strictEqual(a.skyBottom, SKY.morning[1]);
  for (const k of ['skyTop', 'skyBottom', 'light', 'night', 'sunX', 'sunY', 'moonA', 'sunA', 'mood']) assert.ok(a[k] !== undefined, k);
  wx.setWeather(3);
  wx.update(1.0); assert.ok(a.envMix > 0.2 && a.envMix < 0.8, 'crossfading');
  for (let i = 0; i < 6; i++) wx.update(0.5); assert.strictEqual(a.skyTop, SKY.night[0]); assert.strictEqual(a.night, 1); assert.strictEqual(a.moonA, 1); assert.strictEqual(a.sunA, 0);
  assert.ok(wx.particles.some(p => p.sprite === 'firefly') && wx.particles.some(p => p.sprite === 'star'), 'fireflies + stars at night');
  wx.setWeather(1, { instant: true }); assert.strictEqual(a.skyTop, SKY.noon[0]);
  wx.update(5);
  assert.ok(wx.clouds.length === 6 && wx.clouds.filter(c => c.alpha > 0.5).length >= 4, 'puffy noon clouds');
  for (const c of wx.clouds) assert.ok(['cloud_a', 'cloud_b'].includes(c.type) && Number.isFinite(c.x) && Number.isFinite(c.y));
  wx.setParty(true);
  for (let i = 0; i < 20; i++) { wx.burst(600, 400, { kind: 'confetti', n: 20 }); wx.addSand(300, 600, 10); wx.addDust(300, 600, 6); wx.burst(400, 300, { kind: 'feathers', n: 6 }); wx.update(0.1); }
  assert.ok(wx.particles.length <= 120);
  for (const p of wx.particles) { assert.ok(SPRITES.includes(p.sprite), 'sprite ' + p.sprite); assert.strictEqual(p.type, p.sprite); for (const k of ['x', 'y', 'r', 'rot', 'alpha', 'size']) assert.ok(Number.isFinite(p[k]), k); }
  wx.resize(720, 1556, 1500); wx.update(1);
  for (const p of wx.particles) assert.ok(Number.isFinite(p.x));
  for (let m = 0; m < 4; m++) { wx.setWeather(m, { instant: true }); wx.update(2); assert.strictEqual(wx.ambient.mood, ['morning', 'noon', 'sunset', 'night'][m]); }
});

// =====================================================================================================================
const only = process.argv[2];
let pass = 0, fail = 0;
const t0 = Date.now();
for (const t of tests) {
  if (only && !t.name.includes(only)) continue;
  const s = Date.now();
  try { t.fn(); pass++; console.log(`ok    ${t.name} (${Date.now() - s} ms)`); }
  catch (e) { fail++; console.log(`FAIL  ${t.name}\n      ${(e.stack || e).toString().split('\n').slice(0, 4).join('\n      ')}`); }
}
console.log(`\n${pass} passed, ${fail} failed (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(fail ? 1 : 0);
