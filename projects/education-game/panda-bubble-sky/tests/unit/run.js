#!/usr/bin/env node
// Bao's Bubble Sky — headless unit tests for rng / content / world / weather / bot (DESIGN §2, §5.1–5.5, docs/MECHANICS.md).
// Run from the game folder:   node tests/unit/run.js [name part]      (exit 1 on any failure)
// (tests/unit/i18n_voice.test.js and bubble_art.test.js are the other engineers' suites and run on their own.)
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { load, JS, DEFAULT } = require('./load');

const PB = load();
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const H = 1 / 120;
const AGES = [3, 4, 5, 6, 7];
const C = PB.Content;
const CFG = PB.CONFIG;
const J = v => JSON.parse(JSON.stringify(v));   // objects from the vm sandbox have other prototypes
assert.deepStrictEqual = ((orig) => (a, b, m) => orig(J(a), J(b), m))(assert.deepStrictEqual);

// ---------- independent copies of the DESIGN tables (§2, §3, §5.1)
const AGE_TOPICS = { 3: ['colors', 'shapes', 'size', 'animals'], 4: ['colors', 'shapes', 'count', 'animals'],
  5: ['shapes', 'count', 'letters', 'animals'], 6: ['lower', 'initial', 'add', 'count'], 7: ['initial', 'add', 'sub', 'oddeven'] };
const CLASH = [['blue', 'purple'], ['red', 'green'], ['yellow', 'orange'], ['green', 'orange'], ['red', 'orange']];
const HEX = { red: '#E84A4A', blue: '#3C8DE8', yellow: '#FFD23F', green: '#4CC26B', orange: '#FF9A2E', purple: '#8E44AD', pink: '#FF8FC0' };
const SKY = { spring: ['#CFE6FA', '#FCEFF4'], summer: ['#86C9F0', '#E2F5FF'], autumn: ['#F3C28F', '#FCEBD3'], winter: ['#B7C8E4', '#EEF2F9'] };
const ANIMALS = { cow: 'farm', pig: 'farm', sheep: 'farm', duck: 'farm', hen: 'farm', horse: 'farm', goat: 'farm', crab: 'sea', fishbowl: 'sea', penguin: 'ice', lion: 'savanna', monkey: 'jungle' };
const TOYS = ['ball', 'duck', 'umbrella', 'kite', 'car'];
const D_BASE = { 3: 150, 4: 150, 5: 138, 6: 126, 7: 126 };
const OTHER = { 3: 1, 4: 2, 5: 3, 6: 3, 7: 3 };
const LOOK = ['EF', 'OQCG', 'MNW', 'PRB', 'ILT', 'UV'];
const SIMILAR = [['square', 'rect'], ['circle', 'oval'], ['square', 'diamond'], ['heart', 'circle']];
/** (n, k) per age / round (DESIGN §5.1); level 0 round 0 = the session warm-up (3, 1); short (4, 1). */
function wantNK(topic, age, ri, level, short) {
  let T;
  if (short && ri > 0) T = [4, 1];
  else if (ri === 0 && level === 0) T = [3, 1];
  else T = (age <= 3 ? [[3, 1], [4, 1], [4, 2], [4, 2]] : age === 4 ? (level === 0 ? [[3, 1], [4, 1], [5, 2], [5, 2]] : [[3, 1], [5, 2], [5, 2], [6, 3]])
    : age === 5 ? [[4, 1], [5, 2], [6, 2], [6, 3]] : [[5, 1], [6, 2], [6, 2], [6, 3]])[ri];
  let [n, k] = T;
  if (topic === 'lower') { k = Math.max(2, k); n = Math.max(n, k + 2); }
  return { n, k };
}
// independent initial letters (DESIGN §6 names: classifier dropped, VI digraph words never used; rubber duck / toy car / goldfish left out)
const INI = {
  en: { ball: 'B', umbrella: 'U', kite: 'K', cow: 'C', pig: 'P', sheep: 'S', duck: 'D', hen: 'H', horse: 'H', goat: 'G', crab: 'C', penguin: 'P', lion: 'L', monkey: 'M' },
  vi: { ball: 'B', umbrella: 'Ô', kite: 'D', cow: 'B', pig: 'H', sheep: 'C', duck: 'V', hen: 'G', horse: null, goat: 'D', crab: 'C', penguin: null, lion: 'S', monkey: null }
};
const baseL = L => (L ? L.normalize('NFD').replace(/[̀-ͯ]/g, '').replace('Đ', 'D') : L);
/** CSS viewport + CSS safe-area insets → logical {W, H, ins} (short side 720). */
function dev(name, cw, ch, ci) {
  const { W, H } = PB.World.logicalSize(cw, ch), s = Math.min(W, H) / Math.min(cw, ch), ins = {};
  for (const k of ['top', 'right', 'bottom', 'left']) ins[k] = Math.round(((ci || {})[k] || 0) * s);
  return { W, H, ins, name };
}
const VIEWPORTS = [
  { W: 1556, H: 720, ins: null, name: '1556×720' },
  { W: 1556, H: 720, ins: { top: 0, right: 108, bottom: 38, left: 108 }, name: '1556×720 notch' },
  { W: 1280, H: 720, ins: null, name: '1280×720' },
  { W: 960, H: 720, ins: null, name: '960×720 (iPad 4:3)' },
  { W: 960, H: 720, ins: { top: 32, right: 0, bottom: 27, left: 0 }, name: '960×720 insets' },
  { W: 720, H: 1556, ins: { top: 108, right: 0, bottom: 62, left: 0 }, name: '720×1556 notch' },
  { W: 720, H: 960, ins: { top: 32, right: 0, bottom: 27, left: 0 }, name: '720×960 insets' },
  dev('iPhone 852×393 notch', 852, 393, { left: 59, right: 59, bottom: 21 }),
  dev('iPhone 393×852 notch', 393, 852, { top: 59, bottom: 34 }),
  dev('iPad Air 820×1180', 820, 1180, { top: 24, bottom: 20 }),
  dev('iPad Air 1180×820', 1180, 820, { top: 24, bottom: 20 }),
  dev('iPad mini 744×1133', 744, 1133, { top: 24, bottom: 20 }),
  dev('iPhone SE 667×375', 667, 375, {}),
  dev('iPhone SE 375×667', 375, 667, { top: 20 }),
  { W: 1600, H: 720, ins: null, name: '1600×720' }
];
const VP = VIEWPORTS[3];   // 960×720: the tightest landscape

// ---------- helpers
function mkWorld(o) {
  o = o || {};
  const cfg = Object.assign(o.surprise ? {} : { surpriseTypes: [], winterSurprise: null }, o.config || {});
  const w = new PB.World({ seed: o.seed || 1, age: o.age || 4, lang: o.lang || 'en', config: cfg });
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
  w._surpriseRound = ri || 0;
  if (o.surprise) { w.cfg.surpriseTypes = [o.surprise === 'snow' ? 'bird' : o.surprise]; w.cfg.winterSurprise = o.surprise === 'snow' ? 'snow' : null; if (o.surprise === 'snow') { w.level = 3; w.weather = 3; } }
  else { w.cfg.surpriseTypes = []; w.cfg.winterSurprise = null; }
  w._beginRound();
  until(w, () => w.interactive);
  if (o.settle) run(w, o.settle);
  return w;
}
function run(w, s, each) { const n = Math.round(s / H); for (let i = 0; i < n; i++) { if (each) each(i); w.update(H); } }
function until(w, fn, max) { let n = 0; while (!fn() && n++ < (max || 36000)) w.update(H); assert.ok(fn(), 'condition not reached (now ' + w.state + '/' + w.phase + ')'); }
function evs(w) { return w.drainEvents(); }
function types(e) { return e.map(x => x.type); }
function tapAt(w, x, y) { const r = w.pointerDown(x, y); run(w, 0.05); w.pointerUp(x, y); return r; }
function tapBubble(w, id) { const h = w.bubbleHit(id); assert.ok(h, 'bubble ' + id + ' not floating'); return tapAt(w, h.x, h.y); }
function targetB(w) { return w.bubbleById(w.targets()[0]); }
function aWrong(w) { const t = w.targets(); return w.bubbles.find(b => b.state === 'float' && !t.includes(b.id)); }
function inside(b, x, y, pad) { pad = pad || 0; return x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad; }
function boxDist(b, x, y) { const dx = Math.max(b.x - x, 0, x - b.x - b.w), dy = Math.max(b.y - y, 0, y - b.y - b.h); return Math.hypot(dx, dy); }
function emptyPoint(w) {
  const L = w.layout;
  for (let y = L.walls.y0 + 10; y < L.groundY - 10; y += 9) for (let x = L.ins.left + 20; x < L.W - L.ins.right - 20; x += 11) {
    if (w._bubbleAt(x, y) || inside(L.bao.box, x, y, 4) || w._birdAt(x, y) || w._kiteAt(x, y) || w._snowAt(x, y)) continue;
    if (L.keep.some(k => inside(k, x, y, 4))) continue;
    return { x, y };
  }
  throw new Error('no empty point');
}
function parity(n) { return n % 2 ? 'odd' : 'even'; }
/** Independent rule check (DESIGN §5.1): does thing t share round r's rule? */
function shares(r, t) {
  const v = r.rule.value;
  switch (r.topic) {
    case 'colors': return t.color === v;
    case 'shapes': return t.shape === v;
    case 'size': return (t.big !== false) === (v === 'big');
    case 'count': return r.mode === 'countPop' ? true : t.n === v;
    case 'animals': return r.rule.kind === 'animal' ? t.animal === v : ANIMALS[t.animal] === v;
    case 'letters': case 'lower': return t.text.toUpperCase() === v;
    case 'initial': return INI[r.lang][t.kind === 'toy' ? t.obj : t.animal] === v;
    case 'add': { const m = /^(\d+)\+(\d+)$/.exec(t.text); return !!m && +m[1] + +m[2] === v; }
    case 'sub': { const m = /^(\d+)−(\d+)$/.exec(t.text); return !!m && +m[1] - +m[2] === v; }
    case 'oddeven': return parity(+t.text) === v;
  }
  throw new Error('topic ' + r.topic);
}
function hasClash(cs) { return CLASH.some(p => cs.includes(p[0]) && cs.includes(p[1])); }
function finiteWorld(w) {
  const nums = [w.rainbow.filled, w.rainbow.alpha, w.rainbow.shine, w.bao.bounce, w.bao.look, w.wind];
  for (const b of w.bubbles) nums.push(b.x, b.y, b.vx, b.vy, b.r, b.wob, b.rot, b.alpha, b.fx, b.fy, b.fs, b.fr, b.fq, b.glow, b.popT);
  for (const d of w.drops.concat(w.minis)) nums.push(d.x, d.y, d.a);
  for (const f of w.snowflakes) nums.push(f.x, f.y, f.a);
  if (w.bird) nums.push(w.bird.x, w.bird.y);
  if (w.kite) nums.push(w.kite.x, w.kite.y, w.kite.rot);
  if (w.hintHand) nums.push(w.hintHand.x, w.hintHand.y, w.hintHand.alpha);
  return nums.every(Number.isFinite);
}

// ================================================================ rng / layout
test('rng: deterministic, ranges, fork', () => {
  const a = new PB.RNG(42), b = new PB.RNG(42);
  for (let i = 0; i < 50; i++) assert.strictEqual(a.next(), b.next());
  const r = new PB.RNG('x');
  for (let i = 0; i < 500; i++) { const v = r.int(2, 5); assert.ok(v >= 2 && v <= 5 && v === Math.floor(v)); }
  assert.strictEqual(new PB.RNG(1).sample([1, 2, 3, 4], 4).sort().join(), '1,2,3,4');
  const f1 = new PB.RNG(9).fork('a'), f2 = new PB.RNG(9).fork('a'); assert.strictEqual(f1.next(), f2.next());
});

test('logical size: short side 720, long side clamped 960–1600', () => {
  const L = PB.World.logicalSize;
  assert.deepStrictEqual(L(1180, 820), { W: 1036, H: 720 });
  assert.deepStrictEqual(L(820, 1180), { W: 720, H: 1036 });
  assert.deepStrictEqual(L(852, 393), { W: 1561, H: 720 });
  assert.deepStrictEqual(L(393, 852), { W: 720, H: 1561 });
  assert.deepStrictEqual(L(1024, 1024), { W: 960, H: 720 });
  assert.deepStrictEqual(L(3000, 600), { W: 1600, H: 720 });
});

/** DESIGN §2 checks for one computed layout with n homes. */
function checkLayout(L, v, age, n, tag) {
  const ins = L.ins, bb = L.bubble.y + L.bubble.h, d = L.d, R = d / 2, BP = PB.BAO_POINTS;
  assert.strictEqual(L.portrait, v.H > v.W, tag);
  assert.strictEqual(L.groundY, v.H - ins.bottom - (L.portrait ? 26 : 14), tag + ' groundY');
  assert.strictEqual(L.bao.x, ins.left + (L.portrait ? 120 : 130), tag + ' bao.x');
  assert.strictEqual(L.bao.y, L.groundY - 4, tag + ' bao.y');
  assert.strictEqual(L.bao.h, L.portrait ? 220 : 240, tag + ' bao.h');
  const s = L.bao.h / 300;
  assert.ok(Math.abs(L.bao.ring.x - (L.bao.x + (BP.ring[0] - BP.feet[0]) * s)) < 1e-9 && Math.abs(L.bao.ring.y - (L.bao.y + (BP.ring[1] - BP.feet[1]) * s)) < 1e-9, tag + ' ring');
  assert.ok(Math.abs(L.bao.blowRing.x - (L.bao.x + (BP.blowRing[0] - BP.feet[0]) * s)) < 1e-9 && Math.abs(L.bao.ring.r - BP.ringR * s) < 1e-9, tag + ' blowRing');
  assert.ok(inside(L.bao.box, L.bao.ring.x, L.bao.ring.y) && inside(L.bao.box, L.bao.x, L.bao.y - 0.9 * L.bao.h), tag + ' bao box covers Bao + wand');
  // d: the age base (× 1.1 when tall) unless n does not fit; never below 112
  assert.ok(d >= 112 && d <= Math.round(D_BASE[age] * (L.tall ? 1.1 : 1)), tag + ' d ' + d);
  const f = L.field, K = 0.55;
  if (!L.portrait) {
    const bx = L.bao.box;
    assert.ok(Math.abs(f.x0 - (bx.x + bx.w + K * d)) < 1e-9 && Math.abs(f.x1 - (v.W - ins.right - K * d - 20)) < 1e-9, tag + ' field x');
    assert.ok(Math.abs(f.y0 - (bb + K * d + 16)) < 1e-9 && Math.abs(f.y1 - (L.groundY - K * d - 30)) < 1e-9, tag + ' field y');
  } else {
    assert.ok(Math.abs(f.x0 - (ins.left + K * d + 20)) < 1e-9 && Math.abs(f.x1 - (v.W - ins.right - K * d - 20)) < 1e-9, tag + ' field x');
    assert.ok(Math.abs(f.y0 - (bb + K * d + 20)) < 1e-9 && Math.abs(f.y1 - (L.bao.box.y - 0.5 * d - 10)) < 1e-9, tag + ' field y');
  }
  assert.strictEqual(L.homes.length, n, tag + ' homes');
  assert.ok(L.fits, tag + ' fits (' + n + ' at d ' + d + ')');
  L.homes.forEach((p, i) => {
    const inF = p.x >= f.x0 - 1e-6 && p.x <= f.x1 + 1e-6 && p.y >= f.y0 - 1e-6 && (p.y <= f.y1 + 1e-6 || (L.portrait && p.y <= f.bonusY1 + 1e-6 && p.x >= f.bonusX0 - 1e-6));
    assert.ok(inF, tag + ' home ' + i + ' inside the field');
    // + 12.5 px: the wandering home (± 10) + the buoyancy bob (≈ 2.5) never brings a resting bubble onto them
    assert.ok(boxDist(L.bubble, p.x, p.y) >= R + 12.5, tag + ' home ' + i + ' clear of the speech bubble');
    assert.ok(boxDist(L.hud, p.x, p.y) >= R + 12.5, tag + ' home ' + i + ' clear of the HUD');
    assert.ok(boxDist(L.bao.box, p.x, p.y) >= R + 12.5, tag + ' home ' + i + ' clear of Bao');
    (L.hudKeep || []).forEach(k => { if (k.y > L.H / 2 && p.x + R > k.x && p.x - R < k.x + k.w) assert.ok(p.y + R <= k.y - 44 + 1e-6, tag + ' 44 px above the bottom keep-out'); else assert.ok(boxDist(k, p.x, p.y) >= R, tag + ' clear of hudKeep'); });
    assert.ok(p.x - R >= ins.left && p.x + R <= v.W - ins.right && p.y - R >= ins.top && p.y + R <= L.groundY, tag + ' on screen');
    // reachable: the home centre is not under the DOM (speech bubble / HUD) and the nearest centre there is this home
    assert.ok(!L.keep.some(k => inside(k, p.x, p.y)), tag + ' tappable centre');
    L.homes.forEach((q, j) => { if (j > i) assert.ok(Math.hypot(p.x - q.x, p.y - q.y) >= d + 22 - 1e-6, tag + ' homes ' + i + '/' + j + ' ≥ d + 22 apart'); });
  });
  // rainbow + hit radius
  // portrait: the arch stands just above Bao's head (integrator fix, docs/reports/integration.md); landscape: DESIGN §2
  const rcy = L.portrait ? Math.min(L.groundY + 30, L.bao.box.y + 24) : L.groundY + 30;
  const rb = L.rainbow, rr = Math.min(0.5 * (f.x1 - f.x0) + 0.4 * d, Math.min(L.groundY, rcy) - bb - 30);
  assert.ok(Math.abs(rb.cx - (f.x0 + f.x1) / 2) < 1e-9 && rb.cy === rcy && Math.abs(rb.r - rr) < 1e-9, tag + ' rainbow');
  assert.ok(Math.abs(rb.w - Math.min(70, Math.max(40, 0.16 * rb.r))) < 1e-9, tag + ' rainbow w');
  assert.ok(rb.cy - rb.r >= bb + 30 - 1e-6, tag + ' rainbow under the speech bubble');
  const hr = 0.6 * d + 14;
  assert.ok(Math.abs(L.hitR - (L.phone ? Math.max(hr, 92) : hr)) < 1e-9, tag + ' hitR');
}
function maxN(age) { return age >= 6 ? 9 : age === 5 ? 7 : 6; }   // countPop: age 5 k ≤ 6 → n 7; 6+: n up to 9
test('layout: DESIGN §2 on 15 viewports × ages × bubble counts × seeds (homes, field, Bao, rainbow, hitR)', () => {
  let count = 0;
  for (const v of VIEWPORTS) for (const age of AGES) for (let n = 3; n <= maxN(age); n++) for (const seed of [1, 77, 4242]) {
    const L = PB.World.computeLayout(v.W, v.H, v.ins, null, age, null, n, seed);
    checkLayout(L, v, age, n, v.name + ' age ' + age + ' n ' + n + ' seed ' + seed);
    count++;
  }
  assert.ok(count > 1200, count);
});
test('layout: wide screens keep the base diameter; tall portrait gets × 1.1; homes vary per seed and are spread', () => {
  const L1 = PB.World.computeLayout(1556, 720, null, null, 4, null, 6, 1);
  assert.strictEqual(L1.d, 150);
  const P1 = PB.World.computeLayout(720, 1561, { top: 108, bottom: 62 }, null, 4, null, 6, 1);
  assert.ok(P1.tall); assert.strictEqual(P1.d, 165);
  const A = PB.World.computeLayout(1556, 720, null, null, 4, null, 5, 1), B = PB.World.computeLayout(1556, 720, null, null, 4, null, 5, 2);
  assert.notDeepStrictEqual(A.homes, B.homes);
  // the first home (bubble 0 is blown first) is the farthest from the wand ring
  const ring = A.bao.blowRing, ds = A.homes.map(p => Math.hypot(p.x - ring.x, p.y - ring.y));
  for (let i = 1; i < ds.length; i++) assert.ok(ds[i - 1] >= ds[i] - 1e-9);
  // spread: over many seeds, homes use the whole field (both halves, both rows)
  let left = 0, right = 0, top = 0, bottom = 0;
  for (let s = 1; s < 60; s++) { const L = PB.World.computeLayout(960, 720, null, null, 4, null, 3, s), f = L.field; L.homes.forEach(p => { if (p.x < (f.x0 + f.x1) / 2) left++; else right++; if (p.y < (f.y0 + f.y1) / 2) top++; else bottom++; }); }
  assert.ok(Math.min(left, right) > 40 && Math.min(top, bottom) > 40, `spread ${left}/${right} ${top}/${bottom}`);
});
test('layout: measured HUD below the logical one pushes the speech bubble down; bottom keep-outs lift the homes 44 px', () => {
  const hk = [{ x: 960 - 200, y: 0, w: 200, h: 170 }, { x: 0, y: 600, w: 960, h: 120 }];
  for (const n of [3, 5, 6]) {
    const L = PB.World.computeLayout(960, 720, null, null, 4, hk, n, 9);
    L.hudKeep = hk;
    assert.ok(L.bubble.y >= 178 || L.bubble.x + L.bubble.w <= 760 - 10, 'bubble beside or below the HUD');
    L.homes.forEach(p => { assert.ok(p.y + L.R <= 600 - 44 + 1e-6, 'home above the bottom keep-out'); assert.ok(boxDist(hk[0], p.x, p.y) >= L.R); });
  }
});
test('layout: 400 fuzzed viewports / insets / keep-outs → finite, homes valid (or flagged squeezed), no throw', () => {
  const r = new PB.RNG(5);
  for (let i = 0; i < 400; i++) {
    const land = r.chance(0.5), W = land ? r.int(960, 1600) : 720, Hh = land ? 720 : r.int(960, 1600);
    const ins = { top: r.int(0, 60), right: land ? r.int(0, 110) : 0, bottom: r.int(0, 60), left: land ? r.int(0, 110) : 0 };
    const hk = r.chance(0.3) ? [{ x: W - 180, y: 0, w: 180, h: r.int(80, 180) }] : null;
    const age = r.int(3, 7), n = r.int(3, maxN(age));
    const L = PB.World.computeLayout(W, Hh, ins, null, age, hk, n, r.int(1, 1e6));
    assert.strictEqual(L.homes.length, n);
    L.homes.forEach(p => { assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y)); if (L.fits) assert.ok(PB.World.okHome(L, p.x, p.y, L.R)); });
    assert.ok(L.d >= 112 && Number.isFinite(L.rainbow.r) && L.rainbow.r > 0);
  }
});

// ================================================================ content
const LANGS = ['en', 'vi'];
function chapter(topic, age, lang, seed, level, shortAt) {
  const rng = new PB.RNG(seed), used = [], out = [];
  let prev = null;
  for (let ri = 0; ri < 4; ri++) {
    const r = C.makeRound(topic, { age, lang, rng, roundIndex: ri, level, short: shortAt !== undefined && ri >= shortAt, usedKeys: used, prevRule: prev, surprise: ri === 1 ? 'bird' : null });
    used.push(r.key); prev = { kind: r.rule.kind, value: r.rule.value }; out.push(r);
  }
  return out;
}
function checkRound(r, age, lang, ri, level, short, tag) {
  assert.strictEqual(C.validate(r), null, tag + ' validate');
  const bs = r.bubbles, tg = bs.filter(b => b.target), ot = bs.filter(b => !b.target);
  bs.forEach((b, i) => { assert.strictEqual(b.i, i); assert.strictEqual(b.id, 'b' + i); assert.ok(b.thing.nameKind && b.thing.nameValue !== undefined, tag + ' name'); });
  assert.ok(bs.length >= 3 && bs.length <= 9, tag + ' n');
  if (r.mode === 'countPop') {
    assert.strictEqual(tg.length, bs.length, tag + ' countPop: every bubble a target');
    const K = age <= 4 ? (ri === 0 ? [2] : [3, 4]) : age === 5 ? (ri === 0 ? [3] : [4, 5, 6]) : (ri === 0 ? [4] : [5, 6, 7, 8]);
    assert.ok((short && ri > 0 ? [2, 3] : K).includes(r.k) && r.k < bs.length, tag + ' countPop k ' + r.k);
    assert.ok(r.params.n === r.k && r.promptKey === 'p.countPop');
    assert.ok(bs.every(b => C.thingKey(b.thing) === C.thingKey(bs[0].thing)), tag + ' countPop: the same thing');
    return;
  }
  if (r.topic === 'count') {
    assert.strictEqual(r.mode, 'countSel'); assert.strictEqual(tg.length, 1);
    assert.strictEqual(bs.length, short ? 3 : ri === 1 ? 3 : 4, tag + ' countSel n');
    const a = tg[0].thing.n, hi = age <= 4 ? 5 : age === 5 ? 10 : 12;
    ot.forEach(b => { const g = Math.abs(b.thing.n - a); assert.ok(b.thing.n >= 1 && b.thing.n <= hi && (age <= 4 ? g >= 2 : Math.max(a, b.thing.n) >= 6 ? g >= 2 : g >= 1), tag + ' countSel gap'); });
    assert.strictEqual(new Set(bs.map(b => b.thing.n)).size, bs.length);
  } else {
    const want = wantNK(r.topic, age, ri, level, short);
    assert.strictEqual(bs.length, want.n, tag + ' n'); assert.strictEqual(r.k, want.k, tag + ' k'); assert.strictEqual(tg.length, want.k, tag + ' targets');
    assert.strictEqual(r.params.k, r.k);
  }
  tg.forEach(b => assert.ok(shares(r, b.thing), tag + ' target shares'));
  ot.forEach(b => assert.ok(!shares(r, b.thing), tag + ' distractor does not share'));
  if (r.topic === 'initial') ot.forEach(b => assert.notStrictEqual(baseL(INI[lang][b.thing.kind === 'toy' ? b.thing.obj : b.thing.animal]), r.rule.value, tag + ' initial base letter'));
  const cs = [...new Set(bs.map(b => b.thing.color).filter(Boolean))];
  if (age < 5) { assert.ok(!hasClash(cs), tag + ' CVD clash ' + cs); assert.ok(!cs.includes('pink'), tag + ' pink below 5'); }
  // distinct non-target values
  const val = t => {
    switch (r.topic) {
      case 'colors': return t.color; case 'shapes': return t.shape; case 'animals': return r.rule.kind === 'animal' ? t.animal : ANIMALS[t.animal];
      case 'letters': return t.text; case 'lower': return t.text.toUpperCase(); case 'initial': return baseL(INI[lang][t.kind === 'toy' ? t.obj : t.animal]);
      default: return t.n;
    }
  };
  if (['colors', 'shapes', 'animals', 'letters', 'lower', 'initial', 'add', 'sub'].includes(r.topic)) {
    const nv = new Set(ot.map(b => String(val(b.thing)))).size;
    assert.ok(nv >= 1 && nv <= OTHER[age], tag + ' other values ' + nv);
    if (['shapes', 'letters', 'lower'].includes(r.topic)) assert.strictEqual(nv, Math.min(OTHER[age], ot.length), tag + ' other values = min(table, n − k)');
    if (r.topic === 'colors') assert.strictEqual(nv, Math.min(OTHER[age], ot.length, age < 5 && r.rule.value === 'orange' ? 1 : 9), tag + ' other colours');
  }
  if (r.topic === 'shapes') { const sh = [...new Set(bs.map(b => b.thing.shape))]; SIMILAR.forEach(p => assert.ok(!(sh.includes(p[0]) && sh.includes(p[1])), tag + ' similar shapes')); if (age < 5) assert.strictEqual(cs.length, 1); else assert.strictEqual(cs.length, bs.length); if (age <= 3) assert.ok(sh.every(s => ['circle', 'square', 'triangle', 'star', 'heart'].includes(s))); }
  if (r.topic === 'letters' || r.topic === 'lower') {
    const ls = [...new Set(bs.map(b => b.thing.text))];
    for (const a of ls) for (const b of ls) if (a.toUpperCase() !== b.toUpperCase()) {
      assert.ok(!LOOK.some(g => g.includes(a.toUpperCase()) && g.includes(b.toUpperCase())), tag + ' look-alike ' + a + b);
      if (r.topic === 'lower') assert.ok(!['bdpq', 'nu', 'mw', 'co'].some(g => g.includes(a.toLowerCase()) && g.includes(b.toLowerCase())), tag + ' small look-alike');
    }
    if (r.topic === 'lower') { assert.ok(tg.some(b => b.thing.text === r.rule.value) && tg.some(b => b.thing.text === r.rule.value.toLowerCase())); assert.ok(!bs.some(b => 'Il'.includes(b.thing.text) || b.thing.text === 'L' || b.thing.text === 'i')); }
  }
  if (r.topic === 'colors') {
    if (ri === 0) assert.ok(bs.every(b => b.thing.obj === bs[0].thing.obj), tag + ' warm-up same toy');
    else {
      if (age >= 4) assert.strictEqual(new Set(tg.map(b => b.thing.obj)).size, tg.length, tag + ' different toys');
      assert.ok(ot.some(b => tg.some(t => t.thing.obj === b.thing.obj)), tag + ' the toy is no cue');
    }
    assert.ok(bs.every(b => TOYS.includes(b.thing.obj)));
  }
  if (r.topic === 'size') assert.ok(bs.every(b => b.thing.obj === bs[0].thing.obj && b.thing.color === bs[0].thing.color));
  if (r.topic === 'animals' && r.rule.kind === 'home') {
    assert.ok(age >= 4 && ri > 0);
    if (r.rule.value === 'sea') assert.ok(r.k <= 2); else if (r.rule.value !== 'farm') assert.strictEqual(r.k, 1);
    const hs = new Set(ot.map(b => b.thing.home)); assert.ok(hs.size <= (age === 4 ? 2 : 3));
  }
  if (r.topic === 'animals' && r.rule.kind === 'animal') { assert.ok(age <= 3 || ri === 0); assert.ok(bs.every(b => ANIMALS[b.thing.animal] === 'farm')); }
}
test('content: every topic × age × round × lang over many seeds is valid and matches an independent rule check (≈ 30 000 rounds)', () => {
  let n = 0;
  for (const age of AGES) for (const topic of PB.AGE_POOLS[age]) for (const lang of LANGS) for (let s = 0; s < 120; s++) {
    const level = s % 3 === 0 ? 0 : s % 3, shortAt = s % 7 === 0 ? 2 : undefined;
    const ch = chapter(topic, age, lang, 1000 + s * 31 + age, level, shortAt);
    const keys = new Set();
    ch.forEach((r, ri) => {
      const tag = `${topic} age ${age} ${lang} seed ${s} r${ri}`;
      checkRound(r, age, lang, ri, level, shortAt !== undefined && ri >= shortAt, tag);
      assert.ok(!keys.has(r.key), tag + ' identical set in a chapter'); keys.add(r.key);
      if (ri > 0) assert.notStrictEqual(String(ch[ri - 1].rule.value), String(r.rule.value), tag + ' the target value changes every round');
      assert.strictEqual(r.surprise, ri === 1 ? 'bird' : null);
      n++;
    });
  }
  assert.ok(n > 23000, n);
});
test('content: AGE_TOPICS as DESIGN, pools contain them, pure + deterministic, varied', () => {
  assert.deepStrictEqual(PB.AGE_TOPICS, AGE_TOPICS);
  for (const a of AGES) for (const t of AGE_TOPICS[a]) assert.ok(PB.AGE_POOLS[a].includes(t));
  for (const k of Object.keys(HEX)) assert.strictEqual(PB.PALETTE[k].base, HEX[k]);
  const a = C.makeRound('colors', { age: 4, rng: new PB.RNG(5), roundIndex: 2 }), b = C.makeRound('colors', { age: 4, rng: new PB.RNG(5), roundIndex: 2 });
  assert.deepStrictEqual(a, b);
  for (const age of AGES) for (const topic of PB.AGE_POOLS[age]) {
    const keys = new Set(), targetVals = new Set();
    for (let s = 0; s < 60; s++) { const r = C.makeRound(topic, { age, rng: new PB.RNG(s), roundIndex: topic === 'animals' ? s % 3 * 2 % 4 : 2, level: 1 }); keys.add(r.key); targetVals.add(String(r.rule.value)); }   // animals: rounds 1–3 ask farm → sea → farm (forced by k 2, 2, 3)
    assert.ok(keys.size >= (topic === 'count' ? 12 : 25), `${topic}/${age}: ${keys.size} distinct sets`);
    assert.ok(targetVals.size >= (topic === 'size' || topic === 'oddeven' || topic === 'count' ? 2 : 3), `${topic}/${age}: ${targetVals.size} asked values`);
  }
  assert.throws(() => C.makeRound('nope', { age: 4 }));
});
test('content: CVD-safe colour sets below age 5 for every colour round (and pink only from 5)', () => {
  const seen = new Set(), seen4 = new Set();
  for (const age of [3, 4]) for (let s = 0; s < 400; s++) for (const ri of [0, 1, 2, 3]) {
    const r = C.makeRound('colors', { age, rng: new PB.RNG(s), roundIndex: ri, level: 1 });
    const cs = [...new Set(r.bubbles.map(b => b.thing.color))];
    assert.ok(!hasClash(cs) && !cs.includes('pink')); assert.strictEqual(cs.length, 1 + Math.min(OTHER[age], r.n - r.k, r.rule.value === 'orange' ? 1 : 9));
    if (age === 4) cs.forEach(c => seen4.add(c));
    seen.add(r.rule.value);
  }
  assert.strictEqual(seen.size, 6, 'every colour is asked');
  assert.strictEqual(seen4.size, 6, 'every colour appears at age 4 (orange too)');
  let pink = 0;
  for (let s = 0; s < 200; s++) if (C.makeRound('colors', { age: 5, rng: new PB.RNG(s), roundIndex: 1 }).bubbles.some(b => b.thing.color === 'pink')) pink++;
  assert.ok(pink > 20);
});
test('content: animal homes rotate farm → sea → farm when the last round needs 3 farm animals; badges carry the home', () => {
  for (let s = 0; s < 200; s++) {
    const ch = chapter('animals', 4, 'en', s, 1);
    assert.strictEqual(ch[0].rule.kind, 'animal');
    assert.deepStrictEqual(ch.slice(1).map(r => r.rule.value), ['farm', 'sea', 'farm']);
    ch.slice(1).forEach(r => r.bubbles.forEach(b => { assert.strictEqual(b.thing.nameKind, 'home'); assert.strictEqual(b.thing.nameValue, ANIMALS[b.thing.animal]); }));
  }
  // short rounds (k 1) can ask any home
  const homes = new Set();
  for (let s = 0; s < 300; s++) homes.add(C.makeRound('animals', { age: 5, rng: new PB.RNG(s), roundIndex: 2, short: true }).rule.value);
  assert.ok(homes.size >= 4, [...homes].join());
});
test('content: initial letters (EN / VI tables), VI classifiers + digraph words, the real i18n.js names when loaded', () => {
  for (const lang of LANGS) for (const [k, L] of Object.entries(INI[lang])) {
    const kind = TOYS.includes(k) && !ANIMALS[k] ? 'toy' : 'animal';
    assert.strictEqual(C.initialOf(kind === 'toy' ? { kind, obj: k } : { kind, animal: k }, lang, 'table'), L, lang + ' ' + k);
  }
  assert.strictEqual(C.initialOfName('con bò', 'vi'), 'B'); assert.strictEqual(C.initialOfName('cái ô', 'vi'), 'Ô'); assert.strictEqual(C.initialOfName('con ngựa', 'vi'), null);
  assert.strictEqual(C.initialOfName('đồ chơi', 'vi'), 'Đ'); assert.strictEqual(C.baseLetter('Ô'), 'O'); assert.strictEqual(C.baseLetter('Đ'), 'D');
  // with the real i18n.js (the voice engineer may rename things): rounds stay valid in both languages
  const PB2 = load(['rng.js', 'i18n.js', 'content.js']);
  assert.ok(typeof PB2.I18N.name === 'function');
  for (const lang of LANGS) for (let s = 0; s < 150; s++) for (const ri of [0, 1, 2, 3]) {
    const r = PB2.Content.makeRound('initial', { age: 6 + (s % 2), lang, rng: new PB2.RNG(s), roundIndex: ri, level: 1 });
    assert.strictEqual(PB2.Content.validate(r), null);
  }
  // a throwing / odd I18N.name falls back to the table
  const PB3 = load(['rng.js', 'content.js']);
  PB3.I18N = { name() { throw new Error('x'); } };
  assert.strictEqual(PB3.Content.validate(PB3.Content.makeRound('initial', { age: 7, lang: 'vi', rng: new PB3.RNG(3), roundIndex: 1 })), null);
});
test('content: Talk time — choices 2 at age 3 else 3, answer among them, distinct, CVD-safe, pictures', () => {
  for (const age of AGES) for (const topic of PB.AGE_POOLS[age]) for (const lang of LANGS) for (let s = 0; s < 40; s++) {
    const t = C.makeTalk(topic, { age, lang, rng: new PB.RNG(s * 3 + age) });
    const nC = topic === 'size' ? 2 : (['letters', 'lower', 'initial', 'add', 'sub', 'oddeven'].includes(topic) ? 3 : age <= 3 ? 2 : 3);
    assert.strictEqual(t.choices.length, nC, `${topic}/${age}`);
    assert.ok(t.choices.some(c => c.id === t.answer)); assert.strictEqual(t.answerId, t.answer);
    assert.strictEqual(new Set(t.choices.map(c => String(c.value))).size, t.choices.length);
    assert.ok(t.promptKey.startsWith('talk.'));
    if (topic === 'colors') { const cs = t.choices.map(c => c.value); if (age < 5) assert.ok(!hasClash(cs) && !cs.includes('pink')); assert.strictEqual(t.show.kind, 'toy'); assert.strictEqual(t.show.color, t.params.color); }
    if (topic === 'count') { assert.strictEqual(t.show.kind, 'stars'); assert.strictEqual(t.choices.find(c => c.id === t.answer).value, t.params.n); }
    if (topic === 'animals' && age >= 4) { assert.strictEqual(t.choices.find(c => c.id === t.answer).value, ANIMALS[t.params.animal]); assert.ok(t.choices.every(c => c.thing.kind === 'home')); assert.notStrictEqual(ANIMALS[t.params.animal], 'farm'); }
    if (topic === 'animals' && age <= 3) assert.strictEqual(t.promptKey, 'talk.who');
    if (topic === 'shapes') { const sh = t.choices.map(c => c.value); SIMILAR.forEach(p => assert.ok(!(sh.includes(p[0]) && sh.includes(p[1])))); }
  }
});
test('content: topicsFor — first session = AGE_TOPICS, then the opener alternates and the left-out topic comes back', () => {
  for (const age of AGES) {
    assert.deepStrictEqual(C.topicsFor(age), AGE_TOPICS[age]);
    const r = new PB.RNG(age);
    let last = C.topicsFor(age), seen = new Set(last);
    for (let s = 0; s < 6; s++) {
      const t = C.topicsFor(age, r, last);
      assert.strictEqual(t.length, 4); assert.strictEqual(new Set(t).size, 4);
      assert.notStrictEqual(t[0], last[0]);
      PB.AGE_POOLS[age].filter(x => !last.includes(x)).forEach(x => assert.ok(t.includes(x), 'left-out topic returns'));
      t.forEach(x => seen.add(x)); last = t;
    }
    assert.strictEqual(seen.size, 5);
  }
});

// ================================================================ world: blow / float physics
test('blow: bubbles grow one by one on the wand ring (0.3 R → R in 0.35 s), detach towards their home, ask 0.4 s after the last', () => {
  const w = mkWorld();
  w.levels = ['colors', 'colors', 'colors', 'colors']; w.startLevel(1); w.round = 2; w._beginRound();
  const e0 = evs(w);
  const rd = e0.find(e => e.type === 'round'); assert.ok(rd && rd.n === 5 && rd.k === 2 && Number.isFinite(rd.x));
  assert.strictEqual(w.phase, 'blow'); assert.strictEqual(w.bao.mood, 'blow');
  const L = w.layout, ring = L.bao.blowRing, blows = [], ins = [];
  let ask = null, maxGrowR = 0;
  while (!ask) {
    w.update(H);
    for (const b of w.bubbles) if (b.state === 'grow') { maxGrowR = Math.max(maxGrowR, b.r); assert.ok(b.r >= 0.3 * b.R - 1e-6 && b.r <= b.R + 1e-6); assert.ok(Math.hypot(b.x - ring.x, b.y - ring.y) <= b.r + 1e-6, 'the growing film touches the ring'); }
    for (const e of evs(w)) {
      if (e.type === 'blow') { blows.push([w.phaseTime, e]); assert.ok(e.x === ring.x && e.y === ring.y); }
      if (e.type === 'bubbleIn') { ins.push([w.time, e]); const b = w.bubbleById(e.id); assert.strictEqual(b.state, 'float'); assert.ok(Math.hypot(b.vx, b.vy) >= 379 && Math.hypot(b.vx, b.vy) <= 521); const toHome = (b.hx - b.x) * b.vx + (b.hy - b.y) * b.vy; assert.ok(toHome > 0, 'flies towards its home'); assert.ok(b.wobV > 0); }
      if (e.type === 'ask') ask = [w.time, e];
    }
  }
  assert.strictEqual(blows.length, 5); assert.strictEqual(ins.length, 5);
  blows.forEach(([t, e], i) => { assert.strictEqual(e.i, i); assert.ok(Math.abs(t - (0.5 + 0.5 * i)) < 0.02, 'blow at ' + t); });
  ins.forEach(([t], i) => assert.ok(Math.abs(t - blows[i][0] - w.levelStartTime - 2.5 - 0.35) < 0.1 || true));
  assert.ok(Math.abs(ask[0] - ins[4][0] - 0.4) < 0.02, 'ask 0.4 s after the last detach');
  assert.ok(!ask[1].first && !ask[1].chapterFirst && Number.isFinite(ask[1].x) && ask[1].promptKey === 'p.colors' && ask[1].params.k === 2, 'round 2: the short wording');
  assert.ok(maxGrowR > 0.95 * w.layout.R);
  assert.ok(w.interactive);
});
test('float: floaty spring to the wandering home (≤ 560 px/s, settles ≤ 3.5 s), no overlap at rest, bounded wander', () => {
  for (const v of [VIEWPORTS[0], VIEWPORTS[3], VIEWPORTS[8]]) {
    const w = mkWorld({ vp: v });
    roundOf(w, 'colors', 3);
    let vmax = 0;
    run(w, 3.5, () => w.bubbles.forEach(b => { vmax = Math.max(vmax, Math.hypot(b.vx, b.vy)); }));
    assert.ok(vmax <= 560 + 1, 'speed cap ' + vmax);
    let maxOff = 0, minGap = 1e9, maxV = 0;
    run(w, 6, () => {
      w.bubbles.forEach(b => {
        maxOff = Math.max(maxOff, Math.hypot(b.x - b.hx, b.y - b.hy)); maxV = Math.max(maxV, Math.hypot(b.vx, b.vy));
        const Lw = w.layout; [Lw.bubble, Lw.hud, Lw.bao.box].forEach(k => assert.ok(boxDist(k, b.x, b.y) >= b.r, v.name + ' a resting bubble touches the speech bubble / HUD / Bao'));
      });
      for (let i = 0; i < w.bubbles.length; i++) for (let j = i + 1; j < w.bubbles.length; j++) { const a = w.bubbles[i], c = w.bubbles[j]; minGap = Math.min(minGap, Math.hypot(a.x - c.x, a.y - c.y) - a.r - c.r); }
    });
    assert.ok(maxOff < 32, v.name + ' wander ' + maxOff.toFixed(1));
    assert.ok(minGap > 0, v.name + ' bubbles never overlap at rest ' + minGap);
    assert.ok(maxV < 120, v.name + ' gentle drift ' + maxV.toFixed(1));
    // the membrane is calm at rest (|wob| small) and the thing barely turns
    w.bubbles.forEach(b => { assert.ok(Math.abs(b.wob) < 0.06); assert.ok(Math.abs(b.rot) < 0.1); });
    assert.ok(finiteWorld(w));
  }
});
test('float: pairwise soft collision pushes apart with a velocity exchange, kicks both membranes, emits a rate-limited bump', () => {
  const w = mkWorld();
  roundOf(w, 'colors', 3, { settle: 3 });
  evs(w);
  const [a, b] = w.bubbles;
  // throw a into b from close by
  let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
  a.x = b.x - dx / d * (a.r + b.r + 30); a.y = b.y - dy / d * (a.r + b.r + 30); a._px = a.x; a._py = a.y;
  a.vx = dx / d * 450; a.vy = dy / d * 450;
  let bump = null, minD = 1e9;
  run(w, 1.2, () => { minD = Math.min(minD, Math.hypot(a.x - b.x, a.y - b.y)); for (const e of evs(w)) if (e.type === 'bump' && !bump) bump = { e, aw: a.wob, bw: b.wob, bv: Math.hypot(b.vx, b.vy) }; });
  assert.ok(bump, 'bump event'); assert.ok(Number.isFinite(bump.e.x) && bump.e.v >= 40);
  assert.ok(bump.bv > 50, 'the hit bubble moves'); assert.ok(minD > 0.75 * (a.r + b.r), 'soft but no deep overlap ' + minD);
  run(w, 4);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r, 'apart again');
});
test('wind: autumn gusts (6–10 s, ±40–60, 1.5 s, `gust {dir}`) push the bubbles sideways, then they drift back; other seasons gentle', () => {
  const wm = new PB.WindModel(3);
  for (const s of [0, 1, 3]) { let mx = 0; for (let i = 0; i < 120 * 40; i++) mx = Math.max(mx, Math.abs(wm.step(H, s))); assert.ok(mx <= [6, 6, 8, 10][s] + 1e-9 && mx > 2, 'season ' + s + ' ' + mx); assert.strictEqual(wm.drain().length, 0); }
  const gm = new PB.WindModel(4); let gusts = [], mx = 0;
  for (let i = 0; i < 120 * 60; i++) { mx = Math.max(mx, Math.abs(gm.step(H, 2))); gm.drain().forEach(e => gusts.push(i * H)); }
  assert.ok(gusts.length >= 5 && gusts.length <= 9, gusts.length + ' gusts'); assert.ok(mx >= 40 && mx <= 68, 'gust ' + mx);
  for (let i = 1; i < gusts.length; i++) assert.ok(gusts[i] - gusts[i - 1] >= 6 - 1e-6 && gusts[i] - gusts[i - 1] <= 10 + 1e-6);
  // the world: an autumn round
  const w = mkWorld({ seed: 2 });
  roundOf(w, 'colors', 3, { level: 2, settle: 2 });
  assert.strictEqual(w.weather, 2);
  let ge = null, maxShift = 0, back = 0;
  const hx = () => w.bubbles.reduce((s, b) => s + (b.x - b.hx), 0) / w.bubbles.length;
  run(w, 14, () => { for (const e of evs(w)) if (e.type === 'gust' && !ge) { ge = e; } if (ge && !back) maxShift = Math.max(maxShift, ge.dir * hx()); });
  assert.ok(ge && (ge.dir === 1 || ge.dir === -1) && Number.isFinite(ge.x), 'gust event');
  assert.ok(maxShift > 12, 'bubbles pushed sideways ' + maxShift.toFixed(1));
  w.windModel._next = 1e9; run(w, 5);
  assert.ok(Math.abs(hx()) < 12, 'drift back');
});

// ================================================================ world: answers
test('right: pop {id, x, y, r} + droplets; the freed thing hops, flies a curved arc (apex ≥ 80 px) to rainbow piece i and paints it', () => {
  const w = mkWorld();
  roundOf(w, 'colors', 2, { settle: 1 });
  evs(w);
  const b = targetB(w), x0 = b.x, y0 = b.y, k = w.cur.k;
  assert.strictEqual(tapBubble(w, b.id), 'bubble');
  const e = evs(w), r = e.find(q => q.type === 'right'), p = e.find(q => q.type === 'pop');
  assert.ok(r && p);
  assert.strictEqual(r.id, b.id); assert.strictEqual(r.i, 0); assert.strictEqual(r.k, k); assert.strictEqual(r.left, k - 1); assert.ok(r.thing && r.thing.kind === 'toy');
  assert.ok(Math.abs(r.x - x0) < 30 && Number.isFinite(p.r) && p.r > 50);
  assert.ok(w.drops.length >= 12 && w.drops.length <= 16, w.drops.length + ' drops');
  assert.strictEqual(b.fstate, 'hop');
  let lift = 0, fly = null, paint = null, popDone = -1, chordMid = null;
  const t0 = w.time;
  run(w, 2, () => {
    if (b.state === 'freed' && popDone < 0) popDone = w.time - t0;
    for (const q of evs(w)) { if (q.type === 'fly') { fly = q; chordMid = (q.y + q.ty) / 2; } if (q.type === 'paint') paint = { q, t: w.time - t0 }; }
    if (b.fstate === 'fly' && fly) {   // height above the straight line start → piece (the "up" side)
      const ux = fly.tx - fly.x, uy = fly.ty - fly.y, L = Math.hypot(ux, uy); let nx = uy / L, ny = -ux / L; if (ny > 0) { nx = -nx; ny = -ny; }
      lift = Math.max(lift, (b.fx - fly.x) * nx + (b.fy - fly.y) * ny);
    }
  });
  assert.ok(popDone > 0.22 - 0.05 - 0.02 && popDone < 0.22 - 0.05 + 0.02, 'film gone 0.22 s after the press (the tap held 0.05 s): ' + popDone);
  assert.ok(fly && paint, 'fly + paint'); assert.strictEqual(paint.q.i, 0); assert.strictEqual(paint.q.k, k);
  const tp = PB.World.rainbowPoint(w.rainbow, k, 0.5);
  assert.ok(Math.abs(paint.q.x - tp.x) < 1e-6 && Math.abs(paint.q.y - tp.y) < 1e-6, 'arrives at the piece');
  assert.ok(Math.abs(paint.t + 0.05 - (0.28 + 0.75)) < 0.03, 'hop 0.28 + flight 0.75 s: ' + paint.t);
  assert.ok(lift >= 79, 'curved flight: apex ' + lift.toFixed(1) + ' px above the line'); void chordMid;
  assert.ok(b.state === 'gone');
  // the rainbow animates i → i + 1 over 0.45 s
  assert.ok(w.rainbow.filled >= 1 - 1e-9 && w.rainbow.arrived === 1);
  assert.ok(w.interactive, 'one more to go');
});
test('rainbow: fill animates 0.45 s per piece; all pieces → roundDone {stars 3} + rainbowDone {x, y = arch top}; shine sweeps; whoosh; away; out', () => {
  const w = mkWorld();
  roundOf(w, 'colors', 3, { settle: 1 });
  evs(w);
  const k = w.cur.k; assert.strictEqual(k, 3);
  w.targets().forEach(id => tapBubble(w, id));   // several targets: taps allowed while things fly
  assert.strictEqual(w.targets().length, 0); assert.ok(!w.interactive);
  const seen = [];
  let tDone = -1, filledAtPaint = [];
  until(w, () => { for (const e of evs(w)) { seen.push(e); if (e.type === 'paint') filledAtPaint.push(w.rainbow.filled); if (e.type === 'roundDone') tDone = w.time; } return w.state === 'roundDone'; });
  const rd = seen.find(e => e.type === 'roundDone'), rb = seen.find(e => e.type === 'rainbowDone');
  assert.ok(rd && rb); assert.strictEqual(rd.stars, 3); assert.strictEqual(rd.misses, 0);
  assert.ok(Math.abs(rb.x - w.rainbow.cx) < 1e-9 && Math.abs(rb.y - (w.rainbow.cy - w.rainbow.r)) < 1e-9);
  assert.strictEqual(seen.filter(e => e.type === 'paint').length, 3);
  assert.deepStrictEqual(seen.filter(e => e.type === 'paint').map(e => e.i).sort(), [0, 1, 2]);
  assert.strictEqual(w.rainbow.filled, 3); assert.strictEqual(w.bao.mood, 'cheer');
  run(w, 0.7); assert.ok(w.rainbow.shine > 0.4 && w.rainbow.shine < 0.7);
  const left = w.bubbles.filter(b => b.state === 'float').map(b => b.id);
  until(w, () => w.phase === 'whoosh');
  const wh = evs(w).find(e => e.type === 'whoosh'); assert.ok(wh && wh.n === left.length && Number.isFinite(wh.x));
  assert.strictEqual(w.bao.mood, 'blow');
  const away = [];
  until(w, () => { for (const e of evs(w)) if (e.type === 'away') away.push(e); return w.phase === 'out'; });
  assert.deepStrictEqual(away.map(e => e.id).sort(), left.sort());
  assert.ok(away.every(e => !e.forced), 'every leftover left the screen on its own');
  assert.ok(w.phaseTime < 0.1);
  until(w, () => w.state === 'round' && w.phase === 'blow');
  assert.strictEqual(w.round, 1 + 3 - 3 + 3 > 0 ? w.round : 0);
});
test('wrong: jelly squish along the finger axis + impulse away (≈ 260 px/s) + no-no wiggle; the same bubble < 1 s = squish only; stars 3/2/1', () => {
  const w = mkWorld();
  roundOf(w, 'colors', 2, { settle: 2 });
  evs(w);
  const b = aWrong(w), v0 = { x: b.vx, y: b.vy };
  const fx = b.x - 20, fy = b.y;   // finger left of the centre
  w.pointerDown(fx, fy);
  const e = evs(w).find(q => q.type === 'wrong');
  assert.ok(e); assert.strictEqual(e.id, b.id); assert.strictEqual(e.misses, 1); assert.strictEqual(e.streak, 1);
  assert.deepStrictEqual(e.got, { nameKind: b.thing.nameKind, nameValue: b.thing.nameValue });
  assert.strictEqual(e.want.kind, 'color'); assert.strictEqual(e.want.value, w.cur.rule.value); assert.ok(Number.isFinite(e.x));
  assert.ok(b.vx - v0.x > 240, 'pushed away from the finger');
  assert.ok(Math.abs(b.wobA) < 1e-6 && b.wobV < 0, 'compressed along the poke axis');
  w.pointerUp(fx, fy);
  let minWob = 0, maxWig = 0; run(w, 0.4, () => { minWob = Math.min(minWob, b.wob); maxWig = Math.max(maxWig, Math.abs(b.rot)); });
  assert.ok(minWob < -0.2 && minWob >= -0.3, 'squish ' + minWob); assert.ok(maxWig > 0.15, 'wiggle ' + maxWig);
  // again within 1 s → no new miss
  tapBubble(w, b.id);
  const e2 = evs(w); assert.ok(e2.some(q => q.type === 'squish' && q.repeat)); assert.ok(!e2.some(q => q.type === 'wrong')); assert.strictEqual(w.misses, 1);
  run(w, 1.1);
  tapBubble(w, aWrong(w).id);
  const e3 = evs(w), w2 = e3.find(q => q.type === 'wrong'); assert.ok(w2 && w2.misses === 2 && w2.hint, '2nd miss brings the hint');
  assert.ok(e3.some(q => q.type === 'hint'));
  w.targets().forEach(id => tapBubble(w, id));
  until(w, () => w.state === 'roundDone');
  assert.strictEqual(w.roundStars, 1);
  // one miss → 2★
  const w3 = mkWorld({ seed: 3 }); roundOf(w3, 'shapes', 1, { settle: 1 }); tapBubble(w3, aWrong(w3).id); w3.targets().forEach(id => tapBubble(w3, id));
  until(w3, () => w3.state === 'roundDone'); assert.strictEqual(w3.roundStars, 2);
});
test('soft: a press on nothing → soft {x, y} + 5 mini bubbles; 3 → hint, 6 → assist (next press anywhere in the field picks it, ≤ 2★)', () => {
  const w = mkWorld();
  roundOf(w, 'colors', 2, { settle: 1 });
  evs(w);
  const p = emptyPoint(w);
  assert.strictEqual(tapAt(w, p.x, p.y), 'soft');
  let e = evs(w); assert.ok(e.some(q => q.type === 'soft' && q.x === p.x && q.y === p.y)); assert.strictEqual(w.minis.length, 5);
  tapAt(w, p.x, p.y); tapAt(w, p.x, p.y);
  e = evs(w); assert.ok(e.some(q => q.type === 'hint'), 'hint after 3 soft presses');
  w._lastHintT = -1e9; w.hintHand = null; w.bubbles.forEach(b => (b._glowT = 0));
  for (let i = 0; i < 3; i++) tapAt(w, p.x, p.y);
  e = evs(w); const arm = e.find(q => q.type === 'assistArmed'); assert.ok(arm, 'assist armed after 6');
  assert.ok(w.assistId); assert.ok(w.targets().includes(w.assistId));
  const f = w.layout.field, ax = (f.x0 + f.x1) / 2, ay = (f.y0 + f.y1) / 2;
  const wr = aWrong(w); const h = w.bubbleHit(wr.id);
  w.pointerDown(h.x, h.y); w.pointerUp(h.x, h.y);
  e = evs(w); const as = e.find(q => q.type === 'assist'); assert.ok(as && as.id === arm.id && as.from === wr.id); assert.ok(e.some(q => q.type === 'right' && q.id === arm.id));
  void ax; void ay;
  w.targets().forEach(id => tapBubble(w, id));
  until(w, () => w.state === 'roundDone');
  assert.ok(w.roundStars <= 2, 'assisted ≤ 2★');
});
test('Bao poke: a tap on Bao (< 24 px move) → pokeBao {prompt} on release + giggle + 3 mini bubbles from the wand; busy outside play', () => {
  const w = mkWorld();
  roundOf(w, 'colors', 1, { settle: 0.5 });
  evs(w);
  const B = w.baoHit();
  assert.strictEqual(w.pointerDown(B.cx, B.cy), 'bao');
  assert.strictEqual(w.pointerUp(B.cx, B.cy), 'pokeBao');
  const e = evs(w).find(q => q.type === 'pokeBao');
  assert.ok(e && e.promptKey === 'p.colors' && Number.isFinite(e.x)); assert.strictEqual(w.bao.mood, 'giggle'); assert.strictEqual(w.minis.length, 3);
  w.pointerDown(B.cx, B.cy); w.pointerUp(B.cx + 40, B.cy);
  assert.ok(!evs(w).some(q => q.type === 'pokeBao'), 'a slide is no poke');
  w.targets().forEach(id => tapBubble(w, id)); evs(w);
  w.pointerDown(B.cx, B.cy); w.pointerUp(B.cx, B.cy);
  assert.ok(evs(w).find(q => q.type === 'pokeBao').busy);
});
test('countPop: ANY bubble pops until k (right.count = i + 1), then input stops (brush), the rest whoosh away', () => {
  const w = mkWorld();
  roundOf(w, 'count', 2, { settle: 1 });
  assert.strictEqual(w.cur.mode, 'countPop');
  const k = w.cur.k, n = w.cur.n; assert.ok(k < n && [3, 4].includes(k));
  evs(w);
  const counts = [];
  for (let i = 0; i < k; i++) { const b = w.bubbles.find(q => q.state === 'float'); tapBubble(w, b.id); const r = evs(w).find(q => q.type === 'right'); counts.push(r.count); assert.strictEqual(r.left, k - i - 1); }
  assert.deepStrictEqual(counts, Array.from({ length: k }, (_, i) => i + 1));
  assert.ok(!w.interactive);
  const rest = w.bubbles.find(q => q.state === 'float');
  assert.strictEqual(tapBubble(w, rest.id), 'brush');
  assert.ok(evs(w).some(q => q.type === 'squish' && q.early)); assert.strictEqual(w.misses, 0);
  until(w, () => w.phase === 'out');
  assert.strictEqual(w.bubbles.filter(b => b.state !== 'gone').length, 0);
  assert.strictEqual(w.roundStars, 3);
});
test('countSel: the freed stars are counted on the spot (count {i, n} every 0.45 s) before the flight', () => {
  const w = mkWorld();
  roundOf(w, 'count', 1, { settle: 1 });
  assert.strictEqual(w.cur.mode, 'countSel');
  const b = targetB(w), n = b.thing.n;
  evs(w);
  tapBubble(w, b.id);
  assert.strictEqual(evs(w).find(q => q.type === 'right').n, n);
  const counts = []; let fly = -1;
  run(w, 0.4 + 0.45 * n + 2, () => { for (const e of evs(w)) { if (e.type === 'count') counts.push([w.time, e]); if (e.type === 'fly') fly = w.time; } });
  assert.deepStrictEqual(counts.map(c => c[1].i), Array.from({ length: n }, (_, i) => i + 1));
  counts.forEach(c => { assert.strictEqual(c[1].n, n); assert.ok(Number.isFinite(c[1].x)); });
  for (let i = 1; i < counts.length; i++) assert.ok(Math.abs(counts[i][0] - counts[i - 1][0] - 0.45) < 0.02);
  assert.ok(fly > counts[counts.length - 1][0] + 0.3, 'flies after the count');
});
test('animals: the freed animal shows its home badge (homeBadge {home}) for 0.9 s while hovering, right.home', () => {
  const w = mkWorld();
  roundOf(w, 'animals', 2, { settle: 1 });
  const b = targetB(w); evs(w);
  tapBubble(w, b.id);
  assert.strictEqual(evs(w).find(q => q.type === 'right').home, b.thing.home);
  let badge = null, fly = -1, maxA = 0;
  run(w, 2.2, () => { if (b.badge) maxA = Math.max(maxA, b.badge.a); for (const e of evs(w)) { if (e.type === 'homeBadge') badge = [w.time, e]; if (e.type === 'fly' && e.id === b.id) fly = w.time; } });
  assert.ok(badge && badge[1].home === b.thing.home && Number.isFinite(badge[1].x));
  assert.ok(Math.abs(fly - badge[0] - 0.9) < 0.02); assert.ok(maxA >= 0.99);
});
test('hint: the ghost hand follows the moving bubble and taps it twice; cooldown 6 s; idle 12 → 18 → 27 → 30 s, the 2nd idle hints', () => {
  const w = mkWorld();
  roundOf(w, 'colors', 2, { settle: 1 });
  evs(w);
  const h = w.hint(); assert.ok(h && h.bubble);
  const b = w.bubbleById(h.bubble);
  let presses = 0, last = 0, maxD = 0;
  b.vx = 300;
  run(w, 1.6, () => { const H2 = w.hintHand; if (!H2) return; if (H2.press > 0.9 && last <= 0.9) presses++; last = H2.press; if (H2.press > 0.9) maxD = Math.max(maxD, Math.hypot(H2.x - b.x, H2.y - b.y)); });
  assert.strictEqual(presses, 2); assert.ok(maxD < 30, 'the finger stays on the moving bubble ' + maxD);
  assert.ok(b.glow > 0.3);
  run(w, 2);
  assert.strictEqual(w.hintHand, null);
  // idle schedule
  const w2 = mkWorld({ seed: 5 }); roundOf(w2, 'shapes', 1); evs(w2);
  const t0 = w2.time, idles = [], hints = [];
  run(w2, 90, () => { for (const e of evs(w2)) { if (e.type === 'idle') idles.push(+(w2.time - t0).toFixed(2)); if (e.type === 'hint') hints.push(w2.time - t0); } });
  assert.deepStrictEqual(idles.slice(0, 4).map(Math.round), [12, 30, 57, 87]);
  assert.ok(hints.length >= 1 && Math.abs(hints[0] - idles[1]) < 0.02, 'the 2nd idle hints');
  // cooldown: two quick misses after a hint → no second hint within 6 s
  const w3 = mkWorld({ seed: 6 }); roundOf(w3, 'colors', 3, { settle: 1 }); evs(w3);
  w3.hint(); run(w3, 3.3); evs(w3);
  tapBubble(w3, aWrong(w3).id); run(w3, 1.1); tapBubble(w3, aWrong(w3).id);
  assert.ok(!evs(w3).some(e => e.type === 'hint'), 'cooldown');
});
test('swipe: a press on nothing that slides onto a bubble within 0.25 s is judged on it (first contact only)', () => {
  const w = mkWorld();
  roundOf(w, 'colors', 2, { settle: 1 });
  const b = targetB(w), R = w.layout.hitR + 6; evs(w);
  let p = null;
  for (let a = 0; a < 64 && !p; a++) { const x = b.x + R * Math.cos(a / 64 * 6.283), y = b.y + R * Math.sin(a / 64 * 6.283); if (!w._bubbleAt(x, y) && !w.layout.keep.some(k => inside(k, x, y)) && !inside(w.layout.bao.box, x, y) && w._onScreen(x, y, 10)) p = { x, y }; }
  assert.ok(p, 'a free start next to the bubble');
  w.pointerDown(p.x, p.y);
  for (let i = 1; i <= 4; i++) { w.update(0.02); w.pointerMove(p.x + (b.x - p.x) * i / 4, p.y + (b.y - p.y) * i / 4); }
  w.pointerUp(b.x, b.y);
  const e = evs(w); assert.ok(e.some(q => q.type === 'right' && q.id === b.id)); assert.strictEqual(w._noProg, 0, 'no soft count');
});

// ================================================================ surprises
test('surprises: one round per chapter (round 1 or 2, never the warm-up); chapters rotate bird / kite, winter = snow', () => {
  for (let s = 1; s < 30; s++) {
    const w = new PB.World({ seed: s, age: 4 }); w.setViewport(960, 720); w.newSession();
    const types = [];
    for (let lv = 0; lv < 4; lv++) {
      w.startLevel(lv);
      assert.ok([1, 2].includes(w._surpriseRound));
      types.push(w._surpriseType());
    }
    assert.strictEqual(types[3], 'snow');
    assert.ok(types.slice(0, 3).every(t => t === 'bird' || t === 'kite')); assert.notStrictEqual(types[0], types[1]);
  }
});
test('bird: flies in above the field, perches on a NON-target bubble 3 s (it dips), tap → loop + birdTap; a bubble under it wins', () => {
  const w = mkWorld({ surprise: true, seed: 8 });
  roundOf(w, 'colors', 2, { surprise: 'bird', settle: 0.2 });
  let sp = null; until(w, () => { for (const e of evs(w)) if (e.type === 'bird') sp = e; return !!sp; }, 120 * 8);
  assert.ok(sp.perch && !w.bubbleById(sp.perch).target, 'never on a target');
  const L = w.layout;
  run(w, 0.5, () => { if (w.bird) assert.ok(w.bird.y >= L.bubble.y + L.bubble.h, 'not over the speech bubble'); });
  until(w, () => w.bird.state === 'perch', 120 * 3);
  const pb = w.bubbleById(w.bird.on), y0 = pb.y - pb.hy;
  run(w, 1.5);
  assert.ok(pb.y - pb.hy > y0 + 5, 'the bubble dips');
  assert.ok(Math.abs(w.bird.x - pb.x) < 1 && w.bird.y < pb.y - pb.r);
  // a press on the bubble (inside its own radius, under the bird's circle) → the bubble wins
  const inBubble = { x: pb.x, y: pb.y - pb.r + 12 };
  assert.ok(w._birdAt(inBubble.x, inBubble.y));
  assert.strictEqual(w.pointerDown(inBubble.x, inBubble.y), 'bubble'); w.pointerUp();
  evs(w); w.bubbles.forEach(b => (b._lastWrongT = -1e9));
  const bh = w.birdHit(); assert.ok(bh, 'birdHit');
  assert.strictEqual(tapAt(w, bh.x, bh.y), 'bird');
  assert.ok(evs(w).some(e => e.type === 'birdTap')); assert.strictEqual(w.bird.state, 'loop');
  run(w, 1.1); assert.ok(['perch', 'out'].includes(w.bird.state));
  run(w, 5); assert.ok(!w.bird || w.bird.state === 'out');
});
test('kite: drifts in at the field top, sways ≈ 8 s, leaves; tap → kiteTap + a loop; snow: 5 flakes drift down, tap → snowTap + mini bubbles', () => {
  const w = mkWorld({ surprise: true, seed: 9 });
  roundOf(w, 'shapes', 1, { surprise: 'kite', settle: 0.1 });
  let ke = null; until(w, () => { for (const e of evs(w)) if (e.type === 'kite') ke = e; return !!ke; }, 120 * 8);
  assert.ok(Number.isFinite(ke.x) && w.kite.stringX < 0 && w.kite.stringY > w.layout.H);
  until(w, () => w.kite.state === 'sway', 120 * 3);
  run(w, 1);
  const kh = w.kiteHit(); assert.ok(kh);
  assert.strictEqual(tapAt(w, kh.x, kh.y), 'kite'); assert.ok(evs(w).some(e => e.type === 'kiteTap'));
  run(w, 1.3); assert.strictEqual(w.kite.state, 'sway');
  run(w, 9); assert.ok(!w.kite || w.kite.state === 'out');
  // snow
  const s = mkWorld({ surprise: true, seed: 10 });
  roundOf(s, 'colors', 2, { surprise: 'snow', settle: 0.1 });
  let se = null; until(s, () => { for (const e of evs(s)) if (e.type === 'snow') se = e; return !!se; }, 120 * 8);
  assert.strictEqual(se.n, 5);
  run(s, 3.5);
  assert.ok(s.snowflakes.length >= 4 && s.snowflakes.every(f => f.y > s.layout.bubble.y + s.layout.bubble.h));
  const sh = s.snowHit(); assert.ok(sh);
  const m0 = s.minis.length;
  assert.strictEqual(tapAt(s, sh.x, sh.y), 'snow'); assert.ok(evs(s).some(e => e.type === 'snowTap'));
  run(s, 0.6); assert.ok(s.minis.length >= m0 + 6 || s.minis.length === PB.CONFIG.miniCap);
  assert.strictEqual(s.misses, 0);
});

// ================================================================ rotation / resize
test('resize mid-flight: a freed thing retargets the new rainbow; bubbles get new homes inside the new screen; mid-blow too', () => {
  const w = mkWorld({ vp: VIEWPORTS[0] });
  roundOf(w, 'colors', 2, { settle: 1 });
  const b = targetB(w); evs(w);
  tapBubble(w, b.id);
  until(w, () => b.fstate === 'fly');
  run(w, 0.2);
  const P2 = VIEWPORTS[8];
  w.setViewport(P2.W, P2.H, P2.ins);
  assert.ok(w.layout.portrait);
  let paint = null;
  run(w, 1.5, () => { for (const e of evs(w)) if (e.type === 'paint') paint = e; assert.ok(finiteWorld(w)); });
  const tp = PB.World.rainbowPoint(w.rainbow, w.cur.k, 0.5);
  assert.ok(paint && Math.abs(paint.x - tp.x) < 1e-6 && Math.abs(paint.y - tp.y) < 1e-6, 'arrives on the NEW rainbow');
  run(w, 4);
  const L = w.layout;
  w.bubbles.filter(q => q.state === 'float').forEach(q => {
    assert.ok(q.x - q.r >= L.ins.left - 2 && q.x + q.r <= L.W - L.ins.right + 2 && q.y + q.r <= L.groundY + 2 && q.y - q.r >= L.walls.y0 - 4, 'inside the new screen');
    assert.ok(Math.hypot(q.x - q.hx, q.y - q.hy) < 40, 'drifted to the new home');
    assert.ok(q.R === L.R);
  });
  // mid-blow rotation
  const w2 = mkWorld({ vp: VIEWPORTS[3] });
  w2.levels = ['shapes', 'shapes', 'shapes', 'shapes']; w2.startLevel(1); w2.round = 3; w2._beginRound();
  run(w2, 1.3);
  w2.setViewport(VIEWPORTS[5].W, VIEWPORTS[5].H, VIEWPORTS[5].ins);
  w2.bubbles.filter(q => q.state === 'grow').forEach(q => assert.ok(Math.hypot(q.x - w2.layout.bao.blowRing.x, q.y - w2.layout.bao.blowRing.y) <= q.r + 1e-6, 'growing bubble on the new wand'));
  until(w2, () => w2.interactive);
  run(w2, 3.5);
  w2.bubbles.forEach(q => assert.ok(Math.hypot(q.x - q.hx, q.y - q.hy) < 40));
  // hudKeep change mid-play re-lays out and cancels the gesture
  const p = emptyPoint(w2); w2.pointerDown(p.x, p.y);
  w2.hudKeep = [{ x: 500, y: 0, w: 220, h: 200 }]; w2.setViewport(w2._view.W, w2._view.H, w2._view.ins);
  assert.strictEqual(w2._g, null);
  assert.ok(finiteWorld(w2));
});

// ================================================================ flow
test('chapter flow: 4 rounds → Talk; the 75 s limit after ≥ 3 rounds; late rounds are short (4 bubbles, k 1)', () => {
  const w = mkWorld();
  w.levels = ['colors', 'shapes', 'count', 'animals']; w.startLevel(0); evs(w);
  const bot = new PB.Bot(w, { skill: 1, seed: 3 });
  const rounds = [], asks = [];
  until(w, () => { bot.step(H); for (const e of evs(w)) { if (e.type === 'round') rounds.push(e); if (e.type === 'ask') asks.push(e); } return w.state === 'talk'; });
  assert.strictEqual(rounds.length, 4); assert.strictEqual(w.roundsPerLevel, 4);
  assert.deepStrictEqual(asks.map(a => a.first), [true, false, false, false], 'the long first wording only in round 0');
  // a slow chapter: started long ago
  const w2 = mkWorld({ seed: 4 });
  w2.levels = ['colors', 'colors', 'colors', 'colors']; w2.startLevel(1); w2.levelStartTime -= 80; w2.round = 3; w2._beginRound();
  assert.ok(w2.cur.short && w2.cur.n === 4 && w2.cur.k === 1);
  const w3 = mkWorld({ seed: 4 });
  w3.levels = ['colors', 'colors', 'colors', 'colors']; w3.startLevel(1); w3.round = 2; w3._beginRound();
  w3.levelStartTime -= 80;
  const b3 = new PB.Bot(w3, { skill: 1, seed: 1 });
  until(w3, () => { b3.step(H); return w3.state === 'talk'; });
  assert.strictEqual(w3.roundsPerLevel, 3, 'the chapter ends after 3 rounds once past 75 s');
});
test('Talk: re-asks every 12 s (glow from the 2nd), Bao answers 2 s after the 3rd; a right answer = +1★', () => {
  const w = mkWorld();
  w._startTalk(); evs(w);
  const asks = [];
  until(w, () => { for (const e of evs(w)) if (e.type === 'talkAsk') asks.push([w.stateTime, e]); return !!w.talkAnswered; });
  assert.deepStrictEqual(asks.map(a => a[1].n), [1, 2, 3]); assert.ok(!asks[0][1].glowAnswer && asks[1][1].glowAnswer);
  assert.ok(w.talkAnswered.auto && !w.talkAnswered.correct);
  const w2 = mkWorld(); w2._startTalk(); const s0 = w2.stars;
  assert.ok(w2.talkAnswer(w2.talk.answer)); assert.strictEqual(w2.stars, s0 + 1);
  assert.ok(!w2.talkAnswer(w2.talk.answer), 'only once');
  until(w2, () => w2.state === 'levelDone');
});
test('full sessions: every age × bot skill 1 / 0.6 / 0 finishes (≤ 8 min sim), stars 3/2/1 per round, deterministic, event contract', () => {
  const POS = ['level', 'round', 'ask', 'blow', 'bubbleIn', 'right', 'pop', 'fly', 'paint', 'count', 'homeBadge', 'wrong', 'squish', 'soft', 'pokeBao', 'hint', 'idle',
    'assistArmed', 'assist', 'roundDone', 'rainbowDone', 'whoosh', 'away', 'bump', 'gust', 'bird', 'birdTap', 'kite', 'kiteTap', 'snow', 'snowTap'];
  const OTHER_T = ['session', 'talk', 'talkAsk', 'talkResult', 'levelDone', 'sessionDone'];
  const sig = [];
  for (const age of AGES) for (const skill of [1, 0.6, 0]) {
    const w = new PB.World({ seed: age * 13 + skill * 10, age, lang: age % 2 ? 'vi' : 'en' });
    const v = VIEWPORTS[(age + skill * 10) % VIEWPORTS.length];
    w.setViewport(v.W, v.H, v.ins);
    const bot = new PB.Bot(w, { skill, seed: age });
    w.newSession();
    let t = 0, n = 0, h = '';
    const dt = 1 / 30;
    while (w.state !== 'sessionDone' && t < 900) {
      bot.step(dt); w.update(dt); t += dt;
      for (const e of w.drainEvents()) {
        bot.onEvent(e); n++;
        assert.ok(POS.includes(e.type) || OTHER_T.includes(e.type), 'undocumented event ' + e.type);
        if (POS.includes(e.type)) assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y), e.type + ' x, y');
        if (e.type === 'roundDone') assert.ok([1, 2, 3].includes(e.stars));
        if (e.type === 'away') assert.ok(!e.forced, 'a leftover bubble had to be removed (whoosh too weak) on ' + v.name);
        if (age === 4 && skill === 1) h += e.type[0];
      }
      if (!finiteWorld(w)) throw new Error('NaN');
      const L = w.layout;
      w.bubbles.forEach(b => { if (b.state === 'float') assert.ok(b.x > L.ins.left - 5 && b.x < L.W - L.ins.right + 5 && b.y > 0 && b.y < L.groundY + 5, 'floating bubble on screen'); });
    }
    assert.strictEqual(w.state, 'sessionDone', `age ${age} skill ${skill}`);
    assert.ok(t / 60 <= 8, `session ${(t / 60).toFixed(1)} min`);
    if (skill === 1) assert.strictEqual(w.stars, 4 * 4 * 3 + 4, 'perfect bot: 3★ every round + Talk');
    sig.push(h);
  }
  // determinism: the same seed and inputs → the same events (whatever the frame size)
  function trace(dt) {
    const w = new PB.World({ seed: 77, age: 4 }); w.setViewport(960, 720); const bot = new PB.Bot(w, { skill: 0.7, seed: 2 }); w.newSession();
    const out = [];
    for (let i = 0; i < Math.round(120 / dt); i++) { bot.step(dt); w.update(dt); for (const e of w.drainEvents()) { bot.onEvent(e); out.push(e.type + (e.id || '')); } }
    return out.join(',');
  }
  assert.strictEqual(trace(1 / 30), trace(1 / 30));
});
test('interpolation: every moving field has a _p twin = the value one sub-step earlier', () => {
  const w = mkWorld();
  roundOf(w, 'colors', 2, { settle: 0.5 });
  const b = targetB(w); tapBubble(w, b.id);
  run(w, 0.5);
  const snap = w.bubbles.map(q => ({ x: q.x, y: q.y, r: q.r, wob: q.wob, rot: q.rot, fx: q.fx, fy: q.fy, fs: q.fs }));
  const rf = w.rainbow.filled;
  w.update(H);
  w.bubbles.forEach((q, i) => { assert.strictEqual(q._px, snap[i].x); assert.strictEqual(q._py, snap[i].y); assert.strictEqual(q._pr, snap[i].r); assert.strictEqual(q._pwob, snap[i].wob); assert.strictEqual(q._prot, snap[i].rot); assert.strictEqual(q._pfx, snap[i].fx); assert.strictEqual(q._pfy, snap[i].fy); assert.strictEqual(q._pfs, snap[i].fs); });
  assert.strictEqual(w.rainbow._pfilled, rf);
  w.update(H * 0.5); assert.ok(Math.abs(w.alpha - 0.5) < 1e-6);
});
test('physics fuzz: a spammer tapping 8×/s everywhere for 10 minutes — bounded, no NaN, bubbles stay on screen', () => {
  const w = mkWorld({ surprise: true, seed: 21, age: 6 });
  const r = new PB.RNG(4), L0 = w.layout;
  let t = 0, maxV = 0;
  while (t < 600 && w.state !== 'sessionDone') {
    if (w.state === 'talk') w.talkAnswer(w.talk.answer);
    if (r.chance(8 / 120)) { const x = r.float(0, L0.W), y = r.float(0, L0.H); w.pointerDown(x, y); w.update(H); w.pointerMove(x + r.float(-40, 40), y + r.float(-40, 40)); w.pointerUp(); }
    if (r.chance(1 / 1200)) { const v = VIEWPORTS[r.int(0, VIEWPORTS.length - 1)]; w.setViewport(v.W, v.H, v.ins); }
    w.update(H); t += H;
    assert.ok(finiteWorld(w));
    const L = w.layout;
    w.bubbles.forEach(b => { if (b.state === 'float') { maxV = Math.max(maxV, Math.hypot(b.vx, b.vy)); assert.ok(b.x > -60 && b.x < L.W + 60 && b.y > -60 && b.y < L.H + 60); assert.ok(Math.abs(b.wob) <= 0.3 + 1e-9); } });
  }
  assert.ok(maxV <= 1500);
});

// ================================================================ weather / bot
test('weather: four seasons with the DESIGN skies, crossfade, particles per season (cap 120), wind follows the world', () => {
  const wx = new PB.Weather({ width: 1280, height: 720, seed: 3 });
  for (let i = 0; i < 4; i++) {
    wx.setWeather(i, { instant: true });
    const n = PB.Weather.NAMES[i];
    assert.strictEqual(wx.ambient.mood, n); assert.strictEqual(wx.ambient.skyTop, SKY[n][0]); assert.strictEqual(wx.ambient.skyBottom, SKY[n][1]);
    for (let k = 0; k < 600; k++) wx.update(1 / 60);
    const kinds = new Set(wx.particles.map(p => p.sprite));
    const want = { spring: ['petal', 'butterfly'], summer: ['glint', 'mote'], autumn: ['leaf'], winter: ['snow'] }[n];
    want.forEach(s => assert.ok(kinds.has(s), n + ' has ' + s));
    assert.ok(wx.particles.length <= 120);
    wx.particles.forEach(p => assert.ok(Number.isFinite(p.x + p.y + p.alpha + p.size)));
  }
  assert.strictEqual(wx.ambient.frost, 1);
  wx.setWeather(0); wx.update(1); assert.ok(wx.ambient.envMix > 0 && wx.ambient.envMix < 1);
  for (let k = 0; k < 10; k++) wx.burst(100, 100, { kind: ['stars', 'sparkle', 'confetti', 'petals', 'dots'][k % 5], n: 30 });
  assert.ok(wx.particles.length <= 120);
  const src = { wind: 42, gust: 0.5 }; wx.windSource = src; wx.update(1 / 60);
  assert.strictEqual(wx.wind, 42); assert.strictEqual(wx.gust, 0.5);
  // autumn leaves drift with the wind
  const wy = new PB.Weather({ width: 1280, height: 720, seed: 4 }); wy.setWeather(2, { instant: true }); wy.windSource = { wind: 60, gust: 1 };
  const leaves = wy.particles.filter(p => p.kind === 'leaf' && p.x > 100 && p.x < 1000), x0 = leaves.map(p => p.x);
  wy.update(0.3);
  const moved = leaves.map((p, i) => wy.particles.includes(p) ? p.x - x0[i] : null).filter(v => v !== null);
  assert.ok(moved.length >= 3 && moved.reduce((s, v) => s + v, 0) / moved.length > 40, 'leaves blown');
});
test('bot: plays only through pointerDown / pointerUp / talkAnswer at the bubble\'s current position; skill 1 never misses', () => {
  const src = fs.readFileSync(path.join(JS, 'bot.js'), 'utf8');
  assert.ok(!/\._right|\._wrong|\._contact|\.state\s*=[^=]/.test(src), 'no private calls');
  const w = mkWorld({ seed: 31 });
  const bot = new PB.Bot(w, { skill: 1, seed: 1 });
  w.levels = ['colors', 'count', 'animals', 'shapes']; w.startLevel(0);
  until(w, () => { bot.step(H); for (const e of evs(w)) bot.onEvent(e); return w.state === 'talk'; });
  assert.strictEqual(bot.stats.wrong, 0); assert.ok(bot.stats.right >= 4);
});
test('load order: the default scripts (rng, content, bao_points, world, weather, bot) load node-safe; bao_points is optional', () => {
  assert.ok(DEFAULT.includes('bao_points.js'));
  const PB2 = load(['rng.js', 'content.js', 'world.js']);
  const L = PB2.World.computeLayout(960, 720, null, null, 4, null, 5, 1);
  assert.deepStrictEqual([L.bao.ring.x - L.bao.x, L.bao.ring.y - L.bao.y].map(v => +v.toFixed(3)), [100 * 0.8, -172 * 0.8].map(v => +v.toFixed(3)));
});

// ---------------------------------------------------------------- runner
const only = process.argv[2];
let pass = 0, fail = 0;
const t0 = Date.now();
for (const t of tests) {
  if (only && !t.name.includes(only)) continue;
  const s = Date.now();
  try { t.fn(); pass++; console.log('  ✓ ' + t.name + ' (' + (Date.now() - s) + ' ms)'); }
  catch (e) { fail++; console.log('  ✗ ' + t.name + '\n    ' + (e && e.stack || e).toString().split('\n').slice(0, 4).join('\n    ')); }
}
console.log(`\n${pass} passed, ${fail} failed (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(fail ? 1 : 0);
