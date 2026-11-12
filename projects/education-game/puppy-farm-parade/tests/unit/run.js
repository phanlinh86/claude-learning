#!/usr/bin/env node
// Bo's Farm Parade — headless unit tests for rng / content / world / weather / bot.
// Run from the game folder:   node tests/unit/run.js [name part]      (exit 1 on any failure)
// (tests/unit/i18n_voice.test.js and parade_art.test.js are the other engineers' suites and run on their own.)
'use strict';
const assert = require('assert');
const fs = require('fs');
const { load, JS } = require('./load');

const FP = load();
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const H = 1 / 120;
const AGES = [3, 4, 5, 6, 7];
const C = FP.Content;
const CFG = FP.CONFIG;
const J = v => JSON.parse(JSON.stringify(v));   // objects from the vm sandbox have other prototypes
assert.deepStrictEqual = ((orig) => (a, b, m) => orig(J(a), J(b), m))(assert.deepStrictEqual);

// independent copies of the DESIGN tables (§3, §5.1)
const AGE_TOPICS = { 3: ['colors', 'shapes', 'size', 'animals'], 4: ['colors', 'shapes', 'count', 'animals'],
  5: ['shapes', 'count', 'letters', 'animals'], 6: ['lower', 'initial', 'add', 'count'], 7: ['initial', 'add', 'sub', 'oddeven'] };
const CLASH = [['blue', 'purple'], ['red', 'green'], ['yellow', 'orange'], ['green', 'orange'], ['red', 'orange']];
const HEX = { red: '#E84A4A', blue: '#3C8DE8', yellow: '#FFD23F', green: '#4CC26B', orange: '#FF9A2E', purple: '#8E44AD', pink: '#FF8FC0' };
const SKY = { morning: ['#F8DCC6', '#FDF4E3'], noon: ['#7CC4EE', '#D6F0FB'], sunset: ['#F29B6B', '#FBD7A5'], night: ['#1E2A4A', '#3B4C78'] };
const GLOW = { morning: 0.1, noon: 0, sunset: 0.4, night: 1 };
const SPRITES = ['mist', 'mote', 'sparkle', 'star', 'firefly', 'petal', 'butterfly', 'leaf', 'confetti_a', 'confetti_b', 'dot', 'dust', 'feather'];
const ANIMALS = { cow: 'farm', pig: 'farm', sheep: 'farm', duck: 'farm', hen: 'farm', horse: 'farm', goat: 'farm', crab: 'sea', fishbowl: 'sea', penguin: 'ice', lion: 'savanna', monkey: 'jungle' };
const OBJECTS = ['bucket', 'boot', 'can', 'tractor', 'flower'];
const ITEM = { 3: 120, 4: 120, 5: 112, 6: 104, 7: 104 };
// members per round (DESIGN §5.1): [age][level 0?][round]
function wantN(age, ri, level, short, topic) {
  const T = age <= 3 ? [3, 3, 3, 4] : age === 4 ? (level === 0 || topic === 'count' ? [3, 3, 4, 4] : [3, 4, 4, 5]) : age === 5 ? [3, 4, 5, 5] : [4, 5, 5, 5];
  let n = T[ri];
  if (short && ri > 0) n = Math.min(n, age <= 4 ? 3 : 4);
  return n;
}
// independent initial letters (DESIGN §6 names: classifier dropped, VI digraph words never used)
const INI = {
  en: { bucket: 'B', boot: 'B', can: 'W', tractor: 'T', flower: 'F', cow: 'C', pig: 'P', sheep: 'S', duck: 'D', hen: 'H', horse: 'H', goat: 'G', crab: 'C', fishbowl: 'G', penguin: 'P', lion: 'L', monkey: 'M' },
  vi: { bucket: 'X', boot: 'U', can: 'B', tractor: 'X', flower: null, cow: 'B', pig: 'H', sheep: 'C', duck: 'V', hen: 'G', horse: null, goat: 'D', crab: 'C', fishbowl: 'B', penguin: null, lion: 'S', monkey: null }
};
/** CSS viewport + CSS safe-area insets → logical {W, H, ins} (short side 720). */
function dev(name, cw, ch, ci) {
  const { W, H } = FP.World.logicalSize(cw, ch), s = Math.min(W, H) / Math.min(cw, ch), ins = {};
  for (const k of ['top', 'right', 'bottom', 'left']) ins[k] = Math.round(((ci || {})[k] || 0) * s);
  return { W, H, ins, name };
}
const VIEWPORTS = [
  { W: 1556, H: 720, ins: null, name: '1556×720' },
  { W: 1556, H: 720, ins: { top: 0, right: 108, bottom: 38, left: 108 }, name: '1556×720 notch' },
  { W: 1280, H: 720, ins: null, name: '1280×720' },
  { W: 1280, H: 720, ins: { top: 0, right: 37, bottom: 21, left: 37 }, name: '1280×720 insets' },
  { W: 960, H: 720, ins: null, name: '960×720 (iPad 4:3)' },
  { W: 960, H: 720, ins: { top: 32, right: 0, bottom: 27, left: 0 }, name: '960×720 insets' },
  { W: 720, H: 1556, ins: null, name: '720×1556' },
  { W: 720, H: 1556, ins: { top: 108, right: 0, bottom: 62, left: 0 }, name: '720×1556 notch' },
  { W: 720, H: 960, ins: null, name: '720×960' },
  { W: 720, H: 960, ins: { top: 32, right: 0, bottom: 27, left: 0 }, name: '720×960 insets' },
  { W: 720, H: 1600, ins: { top: 110, right: 0, bottom: 64, left: 0 }, name: '720×1600 insets' },
  dev('iPad Air 1180×820', 1180, 820, { top: 24, bottom: 20 }),
  dev('iPad Air 820×1180', 820, 1180, { top: 24, bottom: 20 }),
  dev('iPhone 852×393', 852, 393, { left: 59, right: 59, bottom: 21 }),
  dev('iPhone 393×852', 393, 852, { top: 59, bottom: 34 }),
  dev('iPad mini 744×1133', 744, 1133, { top: 24, bottom: 20 }),
  { W: 1600, H: 720, ins: null, name: '1600×720' },
  { W: 720, H: 1280, ins: { top: 37, right: 0, bottom: 0, left: 0 }, name: 'iPhone SE portrait' }
];
const VP = VIEWPORTS[2];

// ---------- helpers ----------
function mkWorld(o) {
  o = o || {};
  const cfg = Object.assign(o.surprise ? {} : { surpriseTypes: [], nightSurprise: null }, o.config || {});
  const w = new FP.World({ seed: o.seed || 1, age: o.age || 4, lang: o.lang || 'en', config: cfg });
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
  if (o.surprise) { w.cfg.surpriseTypes = [o.surprise === 'fireflies' ? 'chick' : o.surprise]; w.cfg.nightSurprise = o.surprise === 'fireflies' ? 'fireflies' : null; w.level = o.surprise === 'fireflies' ? 3 : w.level; }
  else { w.cfg.surpriseTypes = []; w.cfg.nightSurprise = null; }
  w._beginRound();
  until(w, () => w.interactive);
  return w;
}
function run(w, s, each) { const n = Math.round(s / H); for (let i = 0; i < n; i++) { if (each) each(i); w.update(H); } }
function until(w, fn, max) { let n = 0; while (!fn() && n++ < (max || 36000)) w.update(H); assert.ok(fn(), 'condition not reached (now ' + w.state + '/' + w.phase + ')'); }
function evs(w) { return w.drainEvents(); }
function types(e) { return e.map(x => x.type); }
function tapAt(w, x, y) { const r = w.pointerDown(x, y); run(w, 0.06); w.pointerUp(x, y); return r; }
function tapMember(w, id) { const h = w.memberHit(id); return tapAt(w, h.x, h.y); }
function oddM(w) { return w.memberById(w.cur.oddId); }
function aWrong(w) { return w.members.find(m => !m.odd && m.state === 'stand'); }
function inside(b, x, y, pad) { pad = pad || 0; return x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad; }
function circleBox(c, b) { const nx = Math.max(b.x, Math.min(c.x, b.x + b.w)), ny = Math.max(b.y, Math.min(c.y, b.y + b.h)); return Math.hypot(c.x - nx, c.y - ny) < c.r; }
function emptyPoint(w) {
  const L = w.layout;
  for (let y = L.line.y + 60; y < L.groundY; y += 7) for (let x = L.W / 2; x < L.W - L.ins.right - 20; x += 11) {
    if (w._memberAt(x, y, true) || inside(L.boBox, x, y, 4) || inside(L.barn.box, x, y, 4) || inside(L.barn.door.box, x, y, 4)) continue;
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
    case 'size': return t.big === (v === 'big');   // rule 'big' (one little) or 'small' (one big)
    case 'count': return t.n === v;
    case 'animals': return r.rule.kind === 'animal' ? t.animal === v : ANIMALS[t.animal] === 'farm';
    case 'letters': case 'lower': return t.text.toUpperCase() === v;
    case 'initial': return INI[r.lang][t.obj || t.animal] === v;
    case 'add': { const m = /^(\d+)\+(\d+)$/.exec(t.text); return !!m && +m[1] + +m[2] === v; }
    case 'sub': { const m = /^(\d+)−(\d+)$/.exec(t.text); return !!m && +m[1] - +m[2] === v; }
    case 'oddeven': return parity(+t.text) === v;
  }
  throw new Error('topic ' + r.topic);
}
function hasClash(cs) { return CLASH.some(p => cs.includes(p[0]) && cs.includes(p[1])); }

// ================================================================ rng / layout
test('rng: deterministic, ranges, fork', () => {
  const a = new FP.RNG(42), b = new FP.RNG(42);
  for (let i = 0; i < 50; i++) assert.strictEqual(a.next(), b.next());
  const r = new FP.RNG('x');
  for (let i = 0; i < 500; i++) { const v = r.int(2, 5); assert.ok(v >= 2 && v <= 5 && v === Math.floor(v)); }
  assert.strictEqual(new FP.RNG(1).sample([1, 2, 3, 4], 4).sort().join(), '1,2,3,4');
  const f1 = new FP.RNG(9).fork('a'), f2 = new FP.RNG(9).fork('a'); assert.strictEqual(f1.next(), f2.next());
});

test('logical size: short side 720, long side clamped 960–1600', () => {
  const L = FP.World.logicalSize;
  assert.deepStrictEqual(L(1180, 820), { W: 1036, H: 720 });
  assert.deepStrictEqual(L(820, 1180), { W: 720, H: 1036 });
  assert.deepStrictEqual(L(852, 393), { W: 1561, H: 720 });
  assert.deepStrictEqual(L(393, 852), { W: 720, H: 1561 });
  assert.deepStrictEqual(L(1024, 1024), { W: 960, H: 720 });
  assert.deepStrictEqual(L(3000, 600), { W: 1600, H: 720 });
});

function checkLayout(L, v, age, n, tag) {
  const ins = L.ins, bb = L.bubble.y + L.bubble.h;
  assert.ok(L.fits, tag + ' fits');
  assert.strictEqual(L.portrait, v.H > v.W);
  assert.strictEqual(L.groundY, v.H - ins.bottom - (L.portrait ? 26 : 14), tag + ' groundY');
  assert.strictEqual(L.bo.x, ins.left + (L.portrait ? 100 : 112)); assert.strictEqual(L.bo.y, L.groundY - 4); assert.strictEqual(L.bo.h, L.portrait ? 200 : 220);
  if (!L.portrait) {
    assert.strictEqual(L.line.y, L.groundY - 96, tag + ' line.y');
    // the first member's body stays clear of Bo's box (visual QA P1-2)
    assert.strictEqual(L.line.x0, Math.max(L.bo.x + 120, L.boBox.x + L.boBox.w + 0.62 * L.item));
    assert.ok(L.slots[0].x - 0.5 * L.item >= L.boBox.x + L.boBox.w + 0.12 * L.item - 1e-6, tag + ' first member clear of Bo');
    assert.strictEqual(L.barn.x, v.W - ins.right - (L.compact ? 105 : 130)); assert.strictEqual(L.barn.y, L.line.y + 12);
    assert.strictEqual(L.barn.w, L.compact ? 200 : 250); assert.strictEqual(L.barn.h, L.compact ? 216 : 270);
    assert.strictEqual(L.line.x1, L.barn.x - L.barn.w / 2 - 30);
    assert.strictEqual(L.stage.x, (L.line.x0 + L.line.x1) / 2); assert.strictEqual(L.stage.s, 0.9);
    assert.ok(L.stage.y >= L.line.y - 200 - 1e-6);
  } else {
    assert.strictEqual(L.line.y, L.bo.y - L.bo.h - 70, tag + ' portrait line.y');
    assert.strictEqual(L.line.x0, ins.left + 64);
    assert.strictEqual(L.barn.x, v.W - ins.right - 105); assert.strictEqual(L.barn.y, L.line.y - 6);
    assert.strictEqual(L.barn.w, 200); assert.strictEqual(L.barn.h, 216);
    assert.strictEqual(L.line.x1, L.barn.door.x + 40);   // 5 members may stand in front of the barn (≈ 120 px items)
    // fewer members that fit left of the doorway stand there (the doors stay visible for the gate)
    if ((n - 1) * L.spK * L.item <= L.x1Clear - L.line.x0) assert.ok(L.slots[n - 1].x + 0.5 * L.item <= L.barn.door.l - 3.9, tag + ' doors clear');
    assert.strictEqual(L.stage.x, v.W / 2); assert.strictEqual(L.stage.s, 0.95);
    assert.ok(L.stage.y >= L.line.y - 230 - 1e-6);
  }
  // item per age (× 1.12 on tall screens when it fits); shrinks to 100 then spacing 1.12 × only when 5 do not fit
  const base = ITEM[age];
  assert.ok(L.item >= Math.min(100, base) && L.item <= Math.round(base * (L.tall ? 1.12 : 1)), tag + ' item ' + L.item);
  if (n <= 3) assert.ok(L.item >= base, tag + ' 3 members keep the base item');
  // slots: centred in [x0, x1], spacing 1.12–1.6 × item, inside the screen
  assert.strictEqual(L.slots.length, n);
  for (let i = 0; i < n; i++) {
    const s = L.slots[i];
    assert.ok(s.x >= L.line.x0 - 1e-6 && s.x <= L.line.x1 + 1e-6, tag + ' slot in [x0, x1]');
    assert.ok(s.x - L.item / 2 >= ins.left && s.x + L.item / 2 <= v.W - ins.right, tag + ' member inside the screen');
    if (i) { const sp = s.x - L.slots[i - 1].x; assert.ok(sp >= 1.12 * L.item - 1e-6 && sp <= 1.6 * L.item + 1e-6, `${tag} spacing ${sp.toFixed(1)}`); }
  }
  // the hop's apex: the body top stays ≥ 16 px below the bubble (visual QA P1-1); portrait keeps ≥ 40 px of arc room when it can
  assert.ok(L.hopMinY - 1.02 * L.item >= bb + 16 - 1e-6, tag + ' hop body below the bubble');
  if (L.portrait) assert.ok(L.stage.y >= Math.min(L.hopMinY + 40, L.line.y - L.item - 92 * L.stage.s - 8) - 1e-6, tag + ' hop arc room');
  // stage ≥ 30 px below the bubble, its member below the bubble; members' tops below the bubble too
  assert.ok(L.stage.y >= bb + 30 - 1e-6, tag + ' stage below the bubble');
  assert.ok(L.stage.y - L.item * L.stage.s >= bb, tag + ' the stage member below the bubble');
  assert.ok(L.stage.y < L.line.y - L.item - 20, tag + ' the stage stands behind the line, above the members\' heads');
  assert.ok(L.line.y - L.item > bb + 10, tag + ' members below the bubble');
  // hit circles: never on the HUD / bubble; the bottom keep-out (home indicator): resting feet ≥ 44 px above it
  for (const s of L.slots) {
    const c = { x: s.x, y: L.line.y - L.item / 2, r: L.hitR };
    for (const k of L.keep) assert.ok(!circleBox(c, k), `${tag} hit circle on the ${k.kind}`);
    assert.ok(c.y + c.r <= v.H - ins.bottom, tag + ' hit circle above the home indicator');
  }
  assert.ok(v.H - ins.bottom - L.line.y >= 44, tag + ' feet ≥ 44 px above the bottom keep-out');
  assert.ok(Math.abs(L.hitR - (0.6 * L.item + L.hitPad)) < 1e-9 && L.hitPad >= 14);
  // door box on screen; door inside the barn; badge on screen
  const D = L.barn.door, db = D.box;
  assert.ok(db.x >= 0 && db.x + db.w <= v.W && db.y >= 0 && db.y + db.h <= v.H, tag + ' door box on screen');
  assert.ok(D.x - D.w / 2 >= ins.left && D.x + D.w / 2 <= v.W - ins.right && D.top > bb, tag + ' doorway on the safe screen');
  assert.ok(Math.abs(D.w - 140 / 300 * L.barn.w) < 1e-9 && Math.abs(D.h - 150 / 320 * L.barn.h) < 1e-9 && D.y === L.barn.y);
  assert.ok(D.l < D.x && D.r > D.x && Math.abs(db.w - D.w - 60) < 1e-9, tag + ' door box = doorway + 30 px');
  for (const k of L.keep) assert.ok(!inside(k, D.x, D.top + D.h / 2), tag + ' door under the ' + k.kind);
  const hb = L.homeBadge;
  assert.ok(hb.x - hb.r >= ins.left && hb.x + hb.r <= v.W - ins.right && hb.y - hb.r > bb - 40, tag + ' home badge on screen');
  // Bo: on screen, in front / left of the line
  assert.ok(L.boBox.x >= ins.left - 30 && L.bo.y <= v.H - ins.bottom, tag + ' Bo on screen');
}
test('layout: DESIGN §2 numbers at 1556×720, 1280×720, 960×720, 720×1556, 720×960, 720×1600 (+ insets, devices) × age × n', () => {
  let k = 0;
  for (const v of VIEWPORTS) for (const age of AGES) for (let n = 3; n <= 5; n++) {
    const L = FP.World.computeLayout(v.W, v.H, v.ins, {}, age, null, n);
    checkLayout(L, v, age, n, `${v.name} age ${age} n ${n}`); k++;
  }
  // 960×720 with 5 members needs the smaller barn (or itemMin); 1280×720 keeps the big barn
  assert.ok(FP.World.computeLayout(960, 720, null, {}, 4, null, 5).compact || FP.World.computeLayout(960, 720, null, {}, 4, null, 5).item === 100);
  assert.ok(!FP.World.computeLayout(1280, 720, null, {}, 4, null, 5).compact);
  assert.strictEqual(FP.World.computeLayout(1280, 720, null, {}, 4, null, 5).item, 120);
  assert.strictEqual(FP.World.computeLayout(720, 1600, null, {}, 4, null, 3).item, Math.round(120 * 1.12), 'tall: × 1.12');
  assert.ok(k >= 250);
});

test('layout: fuzz 400 aspects + insets + measured HUD / bottom toolbar boxes: fits (or squeezed on odd sizes), sane boxes', () => {
  const r = new FP.RNG(77);
  let squeezed = 0;
  for (let i = 0; i < 400; i++) {
    const land = r.chance(0.5), long = r.int(960, 1600), W = land ? long : 720, Hh = land ? 720 : long;
    const ins = { top: land ? 0 : r.int(0, 110), bottom: r.int(0, 64), left: land ? r.int(0, 110) : 0, right: land ? r.int(0, 110) : 0 };
    const hk = [{ x: W - ins.right - 150, y: ins.top + 8, w: 140, h: 80 }];
    if (r.chance(0.3)) hk.push({ x: W / 2 - 60, y: Hh - ins.bottom - 70, w: 120, h: 60 });   // a bottom toolbar keep-out
    const age = r.pick(AGES), n = r.int(3, 5);
    const L = FP.World.computeLayout(W, Hh, ins, {}, age, hk, n), tag = `fuzz ${W}×${Hh} ${JSON.stringify(ins)} age ${age} n ${n}`;
    if (!L.fits) { squeezed++; assert.ok(L.squeezed && L.item >= 72, tag); continue; }
    for (const b of hk) if (b.y > Hh / 2) assert.ok(b.y - L.line.y >= 44 - 1e-6, tag + ' feet ≥ 44 px above the toolbar');
    for (const s of L.slots) {
      assert.ok(s.x - L.item / 2 >= ins.left - 1e-6 && s.x + L.item / 2 <= W - ins.right + 1e-6, tag + ' slot on screen');
      for (const k of L.keep) if (k.kind !== 'hudKeep' || k.y < Hh / 2) assert.ok(!circleBox({ x: s.x, y: L.line.y - L.item / 2, r: L.hitR }, k), tag + ' hit circle vs ' + k.kind);
    }
    assert.ok(L.stage.y >= L.bubble.y + L.bubble.h + 30 - 1e-6, tag + ' stage');
    const db = L.barn.door.box;
    assert.ok(db.x >= 0 && db.x + db.w <= W && db.y >= 0 && db.y + db.h <= Hh, tag + ' door box');
  }
  assert.ok(squeezed <= 4, 'squeezed ' + squeezed);
});

test('hit test: the nearest member centre wins; a press near a centre (± 0.3 r) always picks that member; Bo loses to a member', () => {
  for (const v of VIEWPORTS) for (const age of [3, 5, 7]) {
    const w = mkWorld({ age, vp: v, seed: 3 });
    roundOf(w, age >= 6 ? 'count' : 'colors', 3);
    const ms = w.members.filter(m => m.state === 'stand'), rr = new FP.RNG(5);
    for (const m of ms) for (let k = 0; k < 20; k++) {
      const h = w.memberHit(m.id), a = rr.float(0, 6.283), d = rr.float(0, 0.3) * h.r;
      assert.strictEqual(w._memberAt(h.x + Math.cos(a) * d, h.y + Math.sin(a) * d), m, v.name + ' own centre');
    }
    for (let k = 0; k < 400; k++) {
      const x = rr.float(0, w.layout.W), y = rr.float(w.layout.line.y - 250, w.layout.line.y + 60), got = w._memberAt(x, y);
      const inC = ms.filter(m => { const h = w.memberHit(m.id); return Math.hypot(x - h.x, y - h.y) <= h.r; });
      if (!inC.length) { assert.strictEqual(got, null); continue; }
      inC.sort((a, b) => Math.hypot(x - a.cx, y - a.cy) - Math.hypot(x - b.cx, y - b.cy));
      assert.strictEqual(got, inC[0], 'nearest centre wins');
    }
    // a press in the overlap of Bo's box and the first member's circle is the member
    const B = w.layout.boBox, m0 = ms.reduce((a, b) => (a.x < b.x ? a : b)), h0 = w.memberHit(m0.id);
    for (let x = B.x; x <= B.x + B.w; x += 4) for (let y = B.y; y <= B.y + B.h; y += 4) if (Math.hypot(x - h0.x, y - h0.y) < h0.r * 0.95) {
      const r2 = w.pointerDown(x, y); w.pointerUp(x, y); assert.strictEqual(r2, 'member'); return;
    }
  }
});

// ================================================================ content
test('content: every age × pool topic × round × lang over many seeds — exactly one odd, the rest share the rule, counts, CVD, no repeats', () => {
  let n = 0, ends = 0, inner = 0;
  for (const age of AGES) for (const topic of FP.AGE_POOLS[age]) for (const lang of ['en', 'vi']) for (let s = 0; s < 160; s++) {
    const rng = new FP.RNG(1000 + s * 31 + age), level = s % 4 === 0 ? 0 : 1, used = [], usedOdd = [];
    let prev = null, slots = [];
    for (let ri = 0; ri < 4; ri++) {
      const short = ri >= 2 && s % 5 === 0;
      const r = C.makeRound(topic, { age, lang, rng, roundIndex: ri, level, short, usedKeys: used, prevKey: prev && prev.key,
        prevRule: prev && prev.rule, prevRuleRun: 1, prevOddSlots: slots.slice(), usedOdd, surprise: 'chick' });
      const tag = `${topic} age ${age} ${lang} s${s} r${ri}`;
      assert.strictEqual(C.validate(r), null, tag);
      assert.strictEqual(r.members.length, wantN(age, ri, level, short, topic), tag + ' members');
      const odds = r.members.filter(m => m.odd);
      assert.strictEqual(odds.length, 1, tag + ' one odd');
      assert.strictEqual(r.oddId, odds[0].id); assert.strictEqual(r.members[r.oddSlot], odds[0]);
      for (const m of r.members) assert.strictEqual(shares(r, m.thing), !m.odd, `${tag} ${m.id} ${JSON.stringify(m.thing)} rule ${JSON.stringify(r.rule)}`);
      assert.strictEqual(r.surprise, ri === 0 ? null : 'chick');
      const cs = [...new Set(r.members.map(m => m.thing.color).filter(Boolean))];
      if (age < 5) { assert.ok(!hasClash(cs), tag + ' CVD pair ' + cs); assert.ok(!cs.includes('pink'), tag + ' pink below 5'); }
      if (prev) {
        assert.notStrictEqual(r.key, prev.key, tag + ' identical consecutive rounds');
        assert.ok(!(slots.length >= 2 && r.oddSlot === slots[0] && r.oddSlot === slots[1]), tag + ' the same odd slot 3 rounds in a row');
      }
      assert.ok(!used.includes(r.key), tag + ' the same set twice in a chapter');
      used.push(r.key);
      // no wild animal / odd colour twice in a chapter (playtest P2-3)
      if (r.oddValue != null) { assert.ok(!usedOdd.includes(r.oddValue), tag + ' odd value again: ' + r.oddValue); usedOdd.push(r.oddValue); }
      slots = [r.oddSlot].concat(slots).slice(0, 2);
      if (r.oddSlot === 0 || r.oddSlot === r.members.length - 1) ends++; else inner++;
      // topic specifics (independent)
      const O = odds[0].thing, T = r.members.filter(m => !m.odd).map(m => m.thing);
      if (topic === 'count') {
        const a = r.rule.value, b = O.n, g = Math.abs(a - b), hi = { 3: 5, 4: 5, 5: 10, 6: 12, 7: 12 }[age];
        assert.ok(a >= 1 && b >= 1 && a <= hi && b <= hi, tag + ' count range');
        if (age <= 4) assert.ok(g >= 2, tag + ' |a − b| ≥ 2 (age ≤ 4)'); else assert.ok(g >= (Math.max(a, b) >= 6 ? 2 : 1), tag + ' count gap');
        assert.deepStrictEqual(r.params, { n: a });
      }
      if (topic === 'colors') {
        assert.strictEqual(cs.length, 2, tag);
        if (ri === 0 || age <= 3) assert.ok(r.members.every(m => m.thing.obj === r.members[0].thing.obj), tag + ' warm-up: the same object');
        if (age >= 5 && ri >= 1) assert.strictEqual(new Set(T.map(t => t.obj)).size, T.length, tag + ' mixed objects');
      }
      if (topic === 'shapes') {
        const sim = [['square', 'rect'], ['circle', 'oval'], ['square', 'diamond']];
        assert.ok(!sim.some(p => [r.rule.value, O.shape].sort().join() === p.slice().sort().join()), tag + ' similar shapes');
        if (age <= 3) assert.ok(r.members.every(m => ['circle', 'square', 'triangle', 'star', 'heart'].includes(m.thing.shape)), tag);
        if (age === 4) assert.ok(r.members.every(m => !['oval', 'diamond'].includes(m.thing.shape)), tag + ' no oval / diamond at 4');
        if (age <= 4) assert.strictEqual(cs.length, 1, tag + ' one colour'); else assert.ok(T.map(t => t.color).includes(O.color), tag + ' the odd colour is shared');
      }
      if (topic === 'animals') {
        if (age <= 3 || ri === 0) { assert.strictEqual(r.promptKey, 'p.animal'); assert.ok(r.members.every(m => ANIMALS[m.thing.animal] === 'farm')); }
        else { assert.strictEqual(r.promptKey, 'p.farm'); assert.notStrictEqual(ANIMALS[O.animal], 'farm'); assert.strictEqual(O.home, ANIMALS[O.animal]); assert.strictEqual(new Set(T.map(t => t.animal)).size, T.length); }
      }
      if (topic === 'size') {   // rounds 0 / 2: one little among big ones; rounds 1 / 3: one BIG among little ones
        const bigOdd = ri % 2 === 1;
        assert.strictEqual(r.promptKey, bigOdd ? 'p.sizeBig' : 'p.size', tag);
        assert.ok(O.big === bigOdd && T.every(t => t.big === !bigOdd), tag);
      }
      if (topic === 'letters' || topic === 'lower') {
        const groups = ['EF', 'OQCG', 'MNW', 'PRB', 'ILT', 'UV'];
        assert.ok(!groups.some(g => g.includes(r.rule.value) && g.includes(O.text.toUpperCase())), tag + ' lookalike');
        if (topic === 'lower') { assert.ok(T.some(t => t.text === r.rule.value) && T.some(t => t.text === r.rule.value.toLowerCase()), tag + ' both cases'); assert.ok(!'IL'.includes(r.rule.value)); }
      }
      if (topic === 'initial') { assert.ok(r.members.every(m => INI[lang][m.thing.obj || m.thing.animal]), tag + ' no digraph words'); assert.strictEqual(r.params.letter, r.rule.value); }
      if (topic === 'oddeven') assert.strictEqual(new Set(r.members.map(m => m.thing.text)).size, r.members.length);
      prev = r; n++;
    }
  }
  assert.ok(n > 15000, 'rounds ' + n);
  assert.ok(inner / (ends + inner) > 0.3, 'the odd one is not always at an end (' + inner + ' / ' + (ends + inner) + ')');
});

test('content: the same ask is not repeated in consecutive rounds; prompt keys + params per topic', () => {
  const PK = { colors: 'p.colors', shapes: null, size: null, count: 'p.count', letters: 'p.letters', lower: 'p.lower', initial: 'p.initial', add: 'p.add', sub: 'p.sub', oddeven: 'p.oddeven' };
  for (const age of AGES) for (const topic of FP.AGE_POOLS[age]) {
    const rng = new FP.RNG(age * 11);
    let prev = null, run = 0;
    for (let ri = 0; ri < 4; ri++) {
      const r = C.makeRound(topic, { age, lang: 'en', rng, roundIndex: ri, level: 1, prevRule: prev, prevRuleRun: run });
      if (PK[topic]) assert.strictEqual(r.promptKey, PK[topic]);
      if (topic === 'shapes') assert.strictEqual(r.promptKey, age >= 5 ? 'p.shapes5' : 'p.shapes');
      if (topic === 'size') assert.strictEqual(r.promptKey, ri % 2 ? 'p.sizeBig' : 'p.size');
      if (prev && !['home', 'size', 'parity'].includes(r.rule.kind)) assert.ok(String(prev.value) !== String(r.rule.value), topic + ' same ask twice');
      run = prev && prev.value === r.rule.value ? run + 1 : 1;
      prev = r.rule;
      for (const k of Object.keys(r.params)) assert.ok(r.params[k] !== undefined && r.params[k] !== null);
      assert.ok(r.rule.nameKind && ['color', 'shape', 'size', 'number', 'animal', 'home', 'letter', 'sum', 'diff', 'parity'].includes(r.rule.nameKind));
      for (const m of r.members) assert.ok(['color', 'shape', 'size', 'number', 'animal', 'home', 'letter', 'sum', 'diff', 'parity'].includes(m.thing.nameKind), topic + ' nameKind');
    }
  }
});

test('content: initial letters in en + vi (classifier dropped, tone marks dropped, digraph words skipped)', () => {
  assert.strictEqual(C.initialOfName('con bò', 'vi'), 'B');
  assert.strictEqual(C.initialOfName('chiếc ủng', 'vi'), 'U');
  assert.strictEqual(C.initialOfName('cái xô', 'vi'), 'X');
  assert.strictEqual(C.initialOfName('con ngựa', 'vi'), null);
  assert.strictEqual(C.initialOfName('chim cánh cụt', 'vi'), null);
  assert.strictEqual(C.initialOfName('đồng', 'vi'), 'Đ');
  assert.strictEqual(C.initialOfName('ước', 'vi'), 'Ư');
  assert.strictEqual(C.initialOfName('the watering can', 'en'), 'W');
  for (const lang of ['en', 'vi']) for (const k of Object.keys(INI[lang])) {
    const t = OBJECTS.includes(k) ? { kind: 'obj', obj: k } : { kind: 'animal', animal: k };
    assert.strictEqual(C.initialOf(t, lang, 'table'), INI[lang][k], lang + ' ' + k);
  }
});

test('content: with the real FP.I18N loaded (if its name() exists) every initial round is still valid', () => {
  if (!fs.existsSync(JS + '/i18n.js')) return;
  let FP2;
  try { FP2 = load(['rng.js', 'i18n.js', 'content.js']); } catch (e) { console.log('    (i18n.js does not load headless: ' + e.message + ')'); return; }
  if (!FP2.I18N || typeof FP2.I18N.name !== 'function') return;
  for (const lang of ['en', 'vi']) for (let s = 0; s < 120; s++) for (const age of [6, 7]) {
    const r = FP2.Content.makeRound('initial', { age, lang, rng: new FP2.RNG(s), roundIndex: s % 4, level: 1 });
    assert.strictEqual(FP2.Content.validate(r), null);
  }
});

test('content: Talk time — every pool topic × age: 2 choices at 3, 3 from 4, the answer is one of them, pictures for ages ≤ 5, CVD', () => {
  const PIC = ['color', 'number', 'home', 'size', 'obj', 'block', 'crate', 'animal', 'tile'];
  for (const age of AGES) for (const topic of FP.AGE_POOLS[age]) for (let s = 0; s < 60; s++) {
    const t = C.makeTalk(topic, { age, lang: s % 2 ? 'vi' : 'en', rng: new FP.RNG(s * 7 + age) }), tag = topic + ' age ' + age;
    const want = topic === 'size' ? 2 : age <= 3 ? 2 : 3;
    assert.strictEqual(t.choices.length, want, tag + ' choices');
    assert.ok(t.choices.some(c => c.id === t.answer), tag + ' answer');
    assert.strictEqual(new Set(t.choices.map(c => JSON.stringify(c.value))).size, want, tag + ' distinct');
    for (const c of t.choices) assert.ok(PIC.includes(c.thing.kind), tag + ' kind ' + c.thing.kind);
    if (age <= 5) assert.ok(t.choices.every(c => c.thing.kind !== 'tile' || topic === 'letters'), tag + ' pictures for ≤ 5');
    if (topic === 'colors' && age < 5) assert.ok(!hasClash(t.choices.map(c => c.thing.color)), tag + ' CVD');
    if (topic === 'animals') assert.strictEqual(t.promptKey, age <= 3 ? 'talk.who' : 'talk.animals');
    else assert.strictEqual(t.promptKey, 'talk.' + topic);
    if (topic === 'animals' && age >= 4) assert.strictEqual(t.choices.find(c => c.id === t.answer).thing.home, ANIMALS[t.params.animal]);
    if (topic === 'count') assert.strictEqual(t.choices.find(c => c.id === t.answer).thing.n, t.show.n);
  }
});

test('content: topic rotation between sessions (pool of 5, the left-out topic opens next time, easiest first)', () => {
  for (const age of AGES) {
    assert.deepStrictEqual(C.topicsFor(age), AGE_TOPICS[age]);
    const rng = new FP.RNG(age), a = C.topicsFor(age, rng, AGE_TOPICS[age]), P = FP.AGE_POOLS[age];
    const left = P.filter(t => !AGE_TOPICS[age].includes(t))[0];
    assert.ok(a.includes(left) && a.length === 4 && new Set(a).size === 4);
    // chapter 1 rotates between the pool's two easiest topics (never the one that opened last time); 2–4 easiest first
    assert.ok(P.slice(0, 2).includes(a[0]) && a[0] !== AGE_TOPICS[age][0], 'age ' + age + ' opening ' + a[0]);
    const b = C.topicsFor(age, rng, a);
    assert.ok(P.slice(0, 2).includes(b[0]) && b[0] !== a[0], 'the opening alternates');
    for (const x of [a, b]) assert.deepStrictEqual(x.slice(1), x.slice(1).sort((p, q) => P.indexOf(p) - P.indexOf(q)));
  }
  assert.deepStrictEqual(J(FP.PALETTE.red), { base: HEX.red, dark: '#A8282E', light: '#F7A0A0', fill: HEX.red });
  for (const c of Object.keys(HEX)) assert.strictEqual(FP.PALETTE[c].base, HEX[c]);
});

// ================================================================ world: enter / walking physics
test('enter: members walk in from entryX (leader first, 0.28 s apart), spring into their slots with step bobs, then ask', () => {
  const w = mkWorld({ age: 4, seed: 4 });
  w.levels = ['colors', 'colors', 'colors', 'colors']; w.startLevel(1); w.round = 3;
  w._beginRound();
  const L = w.layout, n = w.members.length, arrivals = [], steps = {};
  let maxBob = 0, maxTilt = 0, minSy = 1, maxSx = 1, sawWheel = false;
  assert.ok(w.members.every(m => m.x === L.entryX && m.state === 'enter'));
  let t = 0, askT = -1;
  while (askT < 0 && t < 8) {
    w.update(H); t += H;
    for (const m of w.members) { maxBob = Math.max(maxBob, m._stepBob); maxTilt = Math.max(maxTilt, Math.abs(m.tilt)); maxSx = Math.max(maxSx, m.sx); minSy = Math.min(minSy, m.sy); if (Math.abs(m.wheel) > 1) sawWheel = true; }
    for (const e of evs(w)) {
      if (e.type === 'memberIn') arrivals.push({ id: e.id, t });
      if (e.type === 'step') steps[e.id] = (steps[e.id] || 0) + 1;
      if (e.type === 'ask') { askT = t; assert.ok(e.first); assert.strictEqual(e.promptKey, 'p.colors'); }
    }
  }
  assert.strictEqual(arrivals.length, n);
  assert.ok(askT >= 1.4 && askT <= 3.2, 'enter ≈ 1.6–2.4 s: ' + askT.toFixed(2));
  assert.strictEqual(arrivals[0].id, w.members[n - 1].id, 'the leader (rightmost) arrives first');
  for (const m of w.members) { assert.ok(Math.abs(m.x - L.slots[m.slot].x) < 3, 'in its slot'); assert.ok(steps[m.id] >= 2, 'steps while walking'); }
  assert.ok(sawWheel, 'wagon wheels roll');
  assert.ok(maxBob <= 9 + 1e-6 && maxBob >= 2, 'step bob ' + maxBob);
  assert.ok(maxTilt <= 0.12 + 0.02, 'tilt ≤ 0.12 rad: ' + maxTilt);
  assert.ok(maxSx >= 1.02 && maxSx <= 1.1 && minSy < 0.99, 'landing squash ' + maxSx.toFixed(3));
  // standing: breathing ±1.5 px only
  run(w, 2);
  for (const m of w.members) assert.ok(m.bob <= CFG.breathAmp + CFG.lookHopH + 1e-6);
});

test('walking animals: step frame flips, bob 6–9 px parabolic per step, tilt forward with speed', () => {
  const w = roundWhereTopic(4, 'animals', 2);
  const m = w.members[0], L = w.layout;
  m.tx = m.x + 400; m.vmax = 520;
  let flips = 0, last = m.step, maxB = 0, maxT = 0;
  run(w, 1.2, () => { if (m.step !== last) { flips++; last = m.step; } maxB = Math.max(maxB, m._stepBob); maxT = Math.max(maxT, m.tilt); });
  assert.ok(flips >= 3, 'step flips ' + flips);
  assert.ok(maxB >= 6 && maxB <= 9 + 1e-6, 'bob ' + maxB);
  assert.ok(maxT > 0.05 && maxT <= 0.12 + 0.02, 'forward tilt ' + maxT);
  void L;
});
function roundWhereTopic(age, topic, ri, o) { const w = mkWorld(Object.assign({ age, seed: 9 }, o || {})); roundOf(w, topic, ri); return w; }

// ================================================================ world: right / hop / gate / march
test('right: ballistic hop onto the stage (crouch → stretch → apex ≥ 120 px → landing squash), gap closes, roundDone 3★, gate', () => {
  const w = roundWhereTopic(4, 'colors', 3), L = w.layout, o = oddM(w), x0 = o.x;
  assert.strictEqual(tapMember(w, o.id), 'member');
  let e = evs(w);
  assert.ok(types(e).includes('right'));
  const R = e.find(q => q.type === 'right');
  assert.strictEqual(R.id, o.id); assert.deepStrictEqual(R.rule, w.cur.rule);
  assert.strictEqual(w.phase, 'hop'); assert.ok(!w.interactive);
  let minY = 1e9, maxSy = 0, landT = -1, t = 0, hopT = -1, maxSxLand = 0;
  const all = [];
  while (landT < 0 && t < 3) {
    w.update(H); t += H; minY = Math.min(minY, o.y);
    if (o._f) maxSy = Math.max(maxSy, o.sy);
    for (const q of evs(w)) { all.push(q); if (q.type === 'hop') hopT = t; if (q.type === 'land') { landT = t; assert.strictEqual(q.id, o.id); } }
  }
  assert.ok(hopT > 0 && hopT <= CFG.crouch + 0.05, 'take-off after the crouch');
  assert.ok(Math.abs(landT - hopT - CFG.hopTime) < 0.03, 'flight 0.75 s: ' + (landT - hopT).toFixed(3));
  assert.ok(Math.min(L.line.y, L.stage.y) - minY >= 120 - 1, 'apex ≥ 120 px above the higher end: ' + (L.stage.y - minY).toFixed(1));
  assert.ok(maxSy > 1.08, 'stretch at take-off ' + maxSy);
  assert.strictEqual(o.state, 'stage'); assert.strictEqual(o.x, L.stage.x); assert.strictEqual(o.y, L.stage.y); assert.strictEqual(o.scale, L.stage.s);
  run(w, 0.15, () => { maxSxLand = Math.max(maxSxLand, o.sx); });
  assert.ok(maxSxLand > 1.08, 'landing squash ' + maxSxLand);
  assert.ok(w.stage.memberId === o.id && Math.abs(w.stage.pop) > 0.01);
  // the others close the gap: n − 1 slots, walking with steps
  until(w, () => w.state === 'roundDone');
  const rest = w.members.filter(m => m !== o), sl = FP.World.slotsFor(L, rest.length);
  rest.sort((a, b) => a.slot - b.slot).forEach((m, k) => assert.ok(Math.abs(m.x - sl[k].x) < 3, 'gap closed'));
  e = all.concat(evs(w));
  const rd = e.find(q => q.type === 'roundDone');
  assert.strictEqual(rd.stars, 3); assert.strictEqual(rd.misses, 0);
  assert.ok(types(e).includes('gap') && types(e).includes('gateAsk'));
  assert.strictEqual(w.phase, 'gate'); assert.deepStrictEqual(w.answer(), { door: true });
  void x0;
});

test('count: the odd crate counts its apples one by one on the stage (event count i = 1..n, 0.5 s apart) before the gate', () => {
  const w = roundWhereTopic(4, 'count', 2), o = oddM(w), n = o.thing.n;
  tapMember(w, o.id);
  const R = evs(w).find(q => q.type === 'right');
  assert.deepStrictEqual(R.count, { n, others: w.cur.rule.value });
  const counts = [];
  let t = 0;
  while (w.state === 'round' && t < 12) { w.update(H); t += H; for (const q of evs(w)) if (q.type === 'count') counts.push({ i: q.i, t }); }
  assert.deepStrictEqual(counts.map(c => c.i), Array.from({ length: n }, (_, i) => i + 1));
  for (let i = 1; i < counts.length; i++) assert.ok(Math.abs(counts[i].t - counts[i - 1].t - 0.5) < 0.02);
  assert.strictEqual(o.count, n);
  assert.ok(t >= counts[counts.length - 1].t + CFG.countTail - 0.01, 'the gate waits for the count run');
});

test('farm: a non-farm animal lands and shows its home badge', () => {
  const w = roundWhereTopic(4, 'animals', 2), o = oddM(w);
  assert.strictEqual(w.cur.promptKey, 'p.farm');
  tapMember(w, o.id);
  const R = evs(w).find(q => q.type === 'right');
  assert.strictEqual(R.home, ANIMALS[o.thing.animal]);
  until(w, () => o.state === 'stage');
  run(w, 0.5);
  assert.deepStrictEqual(J(w.stage.badge), { home: ANIMALS[o.thing.animal], a: 1 });
});

test('gate: auto-opens after 4 s (doorOpen auto) with the ghost hand at the doors after 2 s; door spring overshoots then settles', () => {
  const w = roundWhereTopic(4, 'shapes', 1);
  tapMember(w, oddM(w).id);
  until(w, () => w.phase === 'gate'); evs(w);
  let t = 0, open = null, hand = -1, maxDoor = 0;
  while (!open && t < 6) { w.update(H); t += H; if (w.hintHand && hand < 0) { hand = t; assert.strictEqual(w.hintHand.mode, 'door'); } for (const q of evs(w)) if (q.type === 'doorOpen') open = q; }
  assert.ok(open && open.auto, 'auto-open'); assert.ok(Math.abs(t - 4) < 0.02, 'after 4 s: ' + t);
  assert.ok(Math.abs(hand - 2.0) < 0.02, 'hand at 2 s: ' + hand);
  run(w, 1.5, () => { maxDoor = Math.max(maxDoor, w.barn.door); });
  assert.ok(maxDoor > 1.05 && maxDoor < 1.5, 'overshoot ' + maxDoor);
});

test('gate: a tap on the door box / any member / the barn opens it; a tap elsewhere does not', () => {
  for (const what of ['door', 'member', 'stage', 'barn', 'elsewhere']) {
    const w = roundWhereTopic(4, 'colors', 2);
    tapMember(w, oddM(w).id);
    until(w, () => w.phase === 'gate'); evs(w);
    const L = w.layout;
    let p;
    if (what === 'door') p = w.doorHit(), p = { x: p.cx, y: p.cy };
    else if (what === 'member') p = w.memberHit(aWrong(w).id);
    else if (what === 'stage') p = w.memberHit(oddM(w).id);
    else if (what === 'barn') p = { x: L.barn.box.x + 12, y: L.barn.box.y + 20 };
    else p = emptyPoint(w);
    const r = tapAt(w, p.x, p.y), e = evs(w).filter(q => q.type === 'doorOpen');
    if (what === 'elsewhere') { assert.strictEqual(e.length, 0); assert.strictEqual(r, 'soft'); }
    else { assert.strictEqual(e.length, 1, what); assert.strictEqual(e[0].auto, false); assert.strictEqual(r, 'door'); }
  }
});

test('march: everyone steps together into the barn (synchronised bob, marchStep), shrinks + hides "in", odd one leaves, vane spins, doors close, next round', () => {
  const w = roundWhereTopic(5, 'count', 2), o = oddM(w), L = w.layout, D = L.barn.door;
  tapMember(w, o.id);
  until(w, () => w.phase === 'gate'); evs(w);
  const d = w.doorHit(); tapAt(w, d.cx, d.cy);
  until(w, () => w.phase === 'march');
  const marchers = w.members.filter(m => m.state === 'march');
  assert.strictEqual(marchers.length, w.cur.members.length - 1);
  const E = [], seenIn = {};
  let sync = true, clipBeforeIn = true, t = 0, minScale = 1;
  while (w.round === 2 && w.state !== 'talk' && t < 10) {
    w.update(H); t += H;
    const ms = w.members.filter(m => m.state === 'march');
    if (ms.length > 1 && ms.some(m => Math.abs(m._stepBob - ms[0]._stepBob) > 1e-9 && m.thing.kind === ms[0].thing.kind)) sync = false;
    for (const m of marchers) { if (m.state === 'in' && !m.clip) clipBeforeIn = false; if (m.state === 'in') minScale = Math.min(minScale, m.scale); if (m.state === 'in') seenIn[m.id] = 1; }
    for (const q of evs(w)) E.push({ t, ...q });
  }
  const ty = E.map(q => q.type);
  assert.ok(sync, 'synchronised march bob'); assert.ok(clipBeforeIn, 'clipped before "in"');
  assert.ok(ty.filter(x => x === 'marchStep').length >= 3, 'marchStep events');
  assert.strictEqual(E.filter(q => q.type === 'inBarn').length, marchers.length);
  assert.ok(minScale < 0.9 && minScale >= 0.85 - 1e-6, 'shrinks 1 → 0.85: ' + minScale);
  const pi = ty.indexOf('parade'), li = ty.indexOf('leave'), ci = ty.indexOf('doorClose');
  assert.ok(pi > ty.lastIndexOf('inBarn') && li > 0 && ci > pi, 'parade after everyone is in, then leave + doorClose');
  const par = E[pi]; assert.strictEqual(par.x, L.barn.roof.x); assert.strictEqual(par.y, L.barn.roof.y);
  const marchDur = E[pi].t - E.find(q => q.type === 'marchStart' || q.type === 'marchStep').t;
  assert.ok(marchDur > 1.5 && marchDur < 3.5, 'march ≈ 2.5 s: ' + marchDur.toFixed(2));
  assert.ok(ty.includes('round') && w.round === 3, 'next round');
  assert.ok(Math.abs(w.barn.vane) > 3, 'vane spun');
  void D;
});

// ================================================================ world: wrong / hint / assist / flick / idle
test('wrong: a "no-no" wiggle (±0.18 rad spring) + a small hop, a miss; the same member again within 1 s is not a new miss', () => {
  const w = roundWhereTopic(4, 'colors', 3), m = aWrong(w);
  tapMember(w, m.id);
  let e = evs(w);
  const W = e.find(q => q.type === 'wrong');
  assert.ok(W); assert.strictEqual(W.id, m.id); assert.deepStrictEqual(W.got, { nameKind: m.thing.nameKind, nameValue: m.thing.nameValue });
  assert.strictEqual(W.want.kind, w.cur.rule.kind); assert.strictEqual(W.want.value, w.cur.rule.value); assert.strictEqual(W.streak, 1);
  let maxRot = 0, maxJump = 0;
  run(w, 0.4, () => { maxRot = Math.max(maxRot, Math.abs(m.wig)); maxJump = Math.max(maxJump, m.jump); });
  assert.ok(maxRot > 0.15 && maxRot < 0.21, 'wiggle ' + maxRot);
  assert.ok(maxJump > 16 && maxJump <= 18 + 1e-6, 'hop ' + maxJump);
  assert.strictEqual(w.misses, 1);
  tapMember(w, m.id);   // < 1 s later
  e = evs(w);
  assert.ok(!types(e).includes('wrong') && types(e).includes('wiggle'));
  assert.strictEqual(w.misses, 1, 'the same wrong member twice = 1 miss');
  run(w, 1.1);
  tapMember(w, m.id);
  assert.strictEqual(w.misses, 2, 'after 1 s it counts again');
  assert.ok(types(evs(w)).includes('hint'), '2 misses → hint');
  assert.ok(w.hintHand && w.hintHand.mode === 'tap' && w.hintHand.id === w.cur.oddId);
});

test('hint: odd glows + the ghost hand taps it twice per 1.6 s cycle; 6 s cooldown; manual hint(); 2nd idle hints', () => {
  const w = roundWhereTopic(4, 'shapes', 2), o = oddM(w);
  const h = w.hint();
  assert.deepStrictEqual(h, { member: o.id });
  let presses = 0, was = false;
  run(w, 1.6, () => { const p = w.hintHand && w.hintHand.press > 0.9; if (p && !was) presses++; was = p; });
  assert.strictEqual(presses, 2, 'taps twice');
  assert.ok(o.glow > 0.3);
  run(w, 2);
  assert.strictEqual(w.hintHand, null);
  // 2 misses inside the 6 s cooldown: no new hint; a miss after it: hint
  const ws = w.members.filter(m => !m.odd);
  evs(w);
  tapMember(w, ws[0].id); run(w, 1.1); tapMember(w, ws[1 % ws.length].id);
  assert.ok(w.time - w._lastHintT < 6 && w.misses === 2);
  assert.ok(!types(evs(w)).includes('hint'), 'cooldown');
  run(w, 6 - (w.time - w._lastHintT) + 0.1);
  tapMember(w, ws[0].id);
  assert.ok(types(evs(w)).includes('hint'), 'after the cooldown');
  // idle: 12, then 18 (backoff ×1.5); the 2nd idle hints
  const w2 = roundWhereTopic(4, 'colors', 1), idles = [];
  let t = 0;
  while (idles.length < 4 && t < 120) { w2.update(H); t += H; for (const q of evs(w2)) { if (q.type === 'idle') idles.push(+t.toFixed(2)); if (q.type === 'hint') assert.ok(q.idle && idles.length >= 2); } }
  assert.deepStrictEqual(idles.map(x => Math.round(x)), [12, 30, 57, 87], 'idle at 12, +18, +27, +30');
});

test('soft presses: dust puff, 3 → hint, 6 → assist (the next press anywhere in the line band picks the odd one, ≤ 2★)', () => {
  const w = roundWhereTopic(3, 'colors', 2), o = oddM(w), p = emptyPoint(w);
  const r = tapAt(w, p.x, p.y);
  assert.strictEqual(r, 'soft'); assert.ok(w.puffs.length >= 1);
  assert.ok(types(evs(w)).includes('soft'));
  tapAt(w, p.x, p.y); tapAt(w, p.x, p.y);
  assert.ok(types(evs(w)).includes('hint'), '3 soft → hint');
  run(w, 4);
  for (let i = 0; i < 3; i++) tapAt(w, p.x, p.y);
  const e = evs(w);
  assert.ok(types(e).includes('assistArmed') && w.assistId === o.id, '6 → assist');
  run(w, 0.2);
  assert.ok(o.glow > 0.8, 'glows big');
  const B = w.layout.band, wr = aWrong(w), hw = w.memberHit(wr.id);
  assert.ok(inside(B, hw.x, hw.y));
  tapAt(w, hw.x, hw.y);   // a press on a wrong member inside the band → the odd one
  const e2 = evs(w);
  assert.ok(types(e2).includes('assist') && types(e2).includes('right'));
  until(w, () => w.state === 'roundDone');
  assert.ok(evs(w).find(q => q.type === 'roundDone').stars <= 2, 'assisted ≤ 2★');
});

test('flick: a press on empty path that slides onto a member within 0.25 s is judged on it; later contacts of the gesture are ignored', () => {
  const w = roundWhereTopic(4, 'colors', 2), o = oddM(w), h = w.memberHit(o.id);
  const sx = h.x, sy = h.y + h.r + 12;
  assert.strictEqual(w.pointerDown(sx, sy), 'soft');
  run(w, 0.05); w.pointerMove(sx, sy - h.r); run(w, 0.05); w.pointerMove(h.x, h.y); w.pointerUp(h.x, h.y);
  assert.ok(types(evs(w)).includes('right'), 'flick judged');
  // too slow: no judgement, counts as a soft press on release
  const w2 = roundWhereTopic(4, 'colors', 2), o2 = oddM(w2), h2 = w2.memberHit(o2.id);
  w2.pointerDown(h2.x, h2.y + h2.r + 12); run(w2, 0.3); w2.pointerMove(h2.x, h2.y); w2.pointerUp(h2.x, h2.y);
  assert.ok(!types(evs(w2)).includes('right'));
  assert.strictEqual(w2._noProg, 1);
  // first contact wins: a press on a wrong member then sliding over the odd one is 1 miss, no right
  const w3 = roundWhereTopic(4, 'colors', 2), m3 = aWrong(w3), h3 = w3.memberHit(m3.id), o3 = w3.memberHit(w3.cur.oddId);
  w3.pointerDown(h3.x, h3.y); for (let k = 1; k <= 8; k++) { run(w3, 0.02); w3.pointerMove(h3.x + (o3.x - h3.x) * k / 8, h3.y); } w3.pointerUp();
  const t3 = types(evs(w3));
  assert.ok(t3.includes('wrong') && !t3.includes('right'));
});

test('Bo: a tap repeats the question (pokeBo); in the gate it says "open the barn" (gate: true)', () => {
  const w = roundWhereTopic(4, 'colors', 1), b = w.boHit();
  const pts = [];
  for (let x = b.x + 4; x < b.x + b.w; x += 6) for (let y = b.y + 4; y < b.y + b.h; y += 6) if (!w._memberAt(x, y)) pts.push({ x, y });
  const p = pts[Math.floor(pts.length / 2)];
  assert.strictEqual(w.pointerDown(p.x, p.y), 'bo');
  assert.strictEqual(w.pointerUp(p.x, p.y), 'pokeBo');
  const e = evs(w).find(q => q.type === 'pokeBo');
  assert.strictEqual(e.promptKey, w.cur.promptKey);
  tapMember(w, w.cur.oddId); until(w, () => w.phase === 'gate'); evs(w);
  w.pointerDown(p.x, p.y); w.pointerUp(p.x, p.y);
  assert.ok(evs(w).find(q => q.type === 'pokeBo').gate);
});

// ================================================================ fixes 2026-11-12 (QA reports)
test('content: the odd slot is uniform (each slot of n = 3/4/5 within ±3 points of 1/n), never the same slot 3 rounds in a row', () => {
  for (const n of [3, 4, 5]) {
    const cnt = new Array(n).fill(0), rng = new FP.RNG(900 + n);
    let slots = [], twice = 0, N = 0;
    const age = n === 3 ? 3 : n === 4 ? 4 : 6, ri = n === 3 ? 0 : n === 4 ? 2 : 1;
    for (let i = 0; i < 6000; i++) {
      const r = C.makeRound('count', { age, lang: 'en', rng, roundIndex: ri, level: 1, prevOddSlots: slots.slice() });
      if (r.members.length !== n) continue;
      N++; cnt[r.oddSlot]++;
      if (slots.length && slots[0] === r.oddSlot) twice++;
      assert.ok(!(slots.length >= 2 && slots[0] === r.oddSlot && slots[1] === r.oddSlot), 'three in a row');
      slots = [r.oddSlot].concat(slots).slice(0, 2);
    }
    for (let k = 0; k < n; k++) assert.ok(Math.abs(cnt[k] / N - 1 / n) <= 0.03, `n ${n} slot ${k}: ${(100 * cnt[k] / N).toFixed(1)} %`);
    assert.ok(twice / N > 0.1, 'the same slot twice in a row is allowed (' + (100 * twice / N).toFixed(1) + ' %)');
  }
});

test('content: age-4 counting crates 3, 3, 4, 4; odd colours balanced below age 5; the opening chapter rotates', () => {
  for (let ri = 0; ri < 4; ri++) assert.strictEqual(C.countFor(4, ri, 2, false, 'count'), [3, 3, 4, 4][ri]);
  assert.strictEqual(C.countFor(4, 3, 2, false, 'colors'), 5);
  const odd = {}, rng = new FP.RNG(4);
  for (let i = 0; i < 3000; i++) { const r = C.makeRound('colors', { age: 4, rng, roundIndex: i % 4, level: 1 }); odd[r.oddValue] = (odd[r.oddValue] || 0) + 1; }
  for (const c of C.COLORS) assert.ok(odd[c] / 3000 > 0.11, 'odd colour ' + c + ' ' + (100 * odd[c] / 3000).toFixed(1) + ' %');
});

test('world: prompt() only while answerable; a Bo tap mid-hop is a "busy" poke (no prompt); the hint-triggering miss is flagged', () => {
  const w = roundWhereTopic(4, 'count', 2), b = w.boHit();
  assert.ok(w.prompt());
  tapMember(w, oddM(w).id); run(w, 0.5);
  assert.strictEqual(w.phase, 'hop'); assert.strictEqual(w.prompt(), null);
  const pts = []; for (let x = b.x + 4; x < b.x + b.w; x += 6) for (let y = b.y + 4; y < b.y + b.h; y += 6) if (!w._memberAt(x, y)) pts.push({ x, y });
  const p = pts[Math.floor(pts.length / 2)]; evs(w);
  w.pointerDown(p.x, p.y); w.pointerUp(p.x, p.y);
  const e = evs(w).find(q => q.type === 'pokeBo');
  assert.ok(e && e.busy && !e.promptKey, 'busy poke');
  // enter: no prompt either
  const w2 = mkWorld({ age: 4, seed: 9 }); w2.levels = ['colors', 'colors', 'colors', 'colors']; w2.startLevel(1); w2.round = 1; w2._beginRound();
  assert.strictEqual(w2.phase, 'enter'); assert.strictEqual(w2.prompt(), null);
  // the 2nd miss brings the hint: its wrong event carries hint: true
  const w3 = roundWhereTopic(4, 'colors', 2), ws = w3.members.filter(m => !m.odd); evs(w3);
  tapMember(w3, ws[0].id); run(w3, 1.1); tapMember(w3, ws[1].id);
  const wr = evs(w3).filter(q => q.type === 'wrong');
  assert.ok(!wr[0].hint && wr[1].hint, 'hint flag on the 2nd miss');
});

test('world: after an auto-opened gate the next gate of the chapter opens after 2.5 s; Talk: Bo answers 2 s after the 3rd re-ask', () => {
  const w = roundWhereTopic(4, 'shapes', 0);
  tapMember(w, oddM(w).id); until(w, () => w.phase === 'gate'); evs(w);
  let t = 0; while (!w._doorOpened) { w.update(H); t += H; }
  assert.ok(Math.abs(t - 4) < 0.02, 'first gate 4 s');
  until(w, () => w.state === 'round' && w.interactive);
  tapMember(w, oddM(w).id); until(w, () => w.phase === 'gate');
  t = 0; while (!w._doorOpened) { w.update(H); t += H; }
  assert.ok(Math.abs(t - 2.5) < 0.02, 'after an auto gate: 2.5 s (' + t.toFixed(2) + ')');
  const w2 = mkWorld({ age: 4, seed: 43 }); w2._startTalk(); evs(w2);
  let t2 = 0, last = 0; while (!w2.talkAnswered) { w2.update(H); t2 += H; for (const q of evs(w2)) if (q.type === 'talkAsk') last = t2; }
  assert.ok(Math.abs(t2 - last - 2) < 0.02 && Math.abs(t2 - 38) < 0.05, 'Talk gives up at 38 s: ' + t2.toFixed(2));
});

test('world: the chapter\'s last round is a grand parade (grand flag, Bo dances); wagons never mirror; rooster never on the barn', () => {
  const w = roundWhereTopic(4, 'colors', 3);
  tapMember(w, oddM(w).id); until(w, () => w.phase === 'gate'); w.pointerDown(w.doorHit().cx, w.doorHit().cy); w.pointerUp();
  let par = null; until(w, () => { for (const q of evs(w)) if (q.type === 'parade') par = q; return !!par; });
  assert.ok(par.grand && w.bo.mood === 'dance');
  const w2 = roundWhereTopic(4, 'colors', 1);
  tapMember(w2, oddM(w2).id); until(w2, () => w2.phase === 'gate'); w2.pointerDown(w2.doorHit().cx, w2.doorHit().cy); w2.pointerUp();
  par = null; until(w2, () => { for (const q of evs(w2)) if (q.type === 'parade') par = q; return !!par; });
  assert.ok(!par.grand);
  // wagons keep face 1 while closing the gap leftwards
  const w3 = roundWhereTopic(4, 'colors', 3), o = oddM(w3);
  tapMember(w3, o.id); run(w3, 2, () => { for (const m of w3.members) if (m !== o && m.thing.kind !== 'animal') assert.strictEqual(m.face, 1); });
  // rooster spot: never over the barn incl. roof + vane
  for (const v of VIEWPORTS) { const w4 = mkWorld({ age: 4, vp: v, seed: 5 }); roundOf(w4, 'colors', 1);
    for (let k = 0; k < 20; k++) { const sp = w4._roosterSpot(), bb = w4.layout.barn.box;
      assert.ok(!(sp.x > bb.x - CFG.roosterR && sp.x < bb.x + bb.w + CFG.roosterR && sp.y > bb.y - 120), v.name + ' rooster on the barn'); } }
});

// ================================================================ rotation / resize
test('rotation mid-hop: the hop in flight retargets the new stage and lands on it; members stay on screen', () => {
  const w = roundWhereTopic(4, 'colors', 3), o = oddM(w);
  tapMember(w, o.id);
  run(w, 0.4);
  assert.ok(o.state === 'hop' && o._f);
  w.setViewport(720, 1556, { top: 108, right: 0, bottom: 62, left: 0 });
  until(w, () => o.state === 'stage');
  const L = w.layout;
  assert.strictEqual(o.x, L.stage.x); assert.strictEqual(o.y, L.stage.y);
  until(w, () => w.state === 'roundDone');
  for (const m of w.members) if (m !== o) { assert.ok(m.x - m.size / 2 >= 0 && m.x + m.size / 2 <= L.W); assert.strictEqual(m.y, L.line.y); }
  const sl = FP.World.slotsFor(L, w.members.length - 1);
  w.members.filter(m => m !== o).sort((a, b) => a.slot - b.slot).forEach((m, k) => assert.ok(Math.abs(m.x - sl[k].x) < 3));
});

test('rotation during play / enter / march: gesture cancelled, members re-slot and walk, clamped into the screen; the round still finishes', () => {
  const w = mkWorld({ age: 5, seed: 12 });
  w.levels = ['letters', 'letters', 'letters', 'letters']; w.startLevel(1); w.round = 3; w._beginRound();
  run(w, 0.8);
  w.setViewport(720, 960, { top: 32, bottom: 27 });
  until(w, () => w.interactive);
  const L = w.layout;
  for (const m of w.members) assert.ok(Math.abs(m.x - L.slots[m.slot].x) < 3 && m.y === L.line.y);
  const h = w.memberHit(aWrong(w).id);
  w.pointerDown(h.x, h.y);
  w.setViewport(1556, 720, { left: 108, right: 108, bottom: 38 });
  assert.strictEqual(w._g, null, 'gesture cancelled');
  for (const m of w.members) assert.ok(m.x >= w.layout.ins.left + m.size / 2 - 1e-6 && m.x <= w.layout.W - w.layout.ins.right - m.size / 2 + 1e-6);
  until(w, () => w.members.every(m => !m.walking));
  tapMember(w, w.cur.oddId);
  until(w, () => w.phase === 'march');
  run(w, 0.5);
  w.setViewport(960, 720, null);
  until(w, () => w.round === 4 || w.state === 'talk');
});

// ================================================================ surprises
test('surprises: chick (scurries to the tail, peeps when tapped, marches in last), rooster (fence, ≥ 120 px from the stage, crows), fireflies (tap)', () => {
  // chick
  const w = mkWorld({ age: 4, seed: 21, surprise: true });
  roundOf(w, 'colors', 2, { surprise: 'chick' });
  until(w, () => w.chick && w.chick.state === 'peck', 2000);
  const ch = w.chickHit();
  assert.ok(ch, 'chick tappable');
  assert.ok(!w._memberAt(ch.x, ch.y), 'its centre is not on a member');
  for (const m of w.members) assert.ok(Math.hypot(ch.x - m.cx, ch.y - m.cy) >= w.memberHit(m.id).r, 'not in a slot');
  assert.strictEqual(tapAt(w, ch.x, ch.y), 'chick');
  assert.ok(types(evs(w)).includes('chickTap') && w.chick.flap > 0.5);
  tapMember(w, w.cur.oddId); until(w, () => w.phase === 'gate'); const d = w.doorHit(); tapAt(w, d.cx, d.cy);
  const ins = [];
  until(w, () => { for (const q of evs(w)) if (q.type === 'inBarn') ins.push(q.id); return w.phase === 'out'; });
  assert.strictEqual(ins[ins.length - 1], 'chick', 'the chick marches in last');
  // rooster
  for (const v of [VIEWPORTS[0], VIEWPORTS[4], VIEWPORTS[7], VIEWPORTS[9]]) {
    const w2 = mkWorld({ age: 4, seed: 22, surprise: true, vp: v });
    roundOf(w2, 'shapes', 1, { surprise: 'rooster' });
    until(w2, () => w2.rooster && w2.rooster.state === 'stand', 2000);
    const rh = w2.roosterHit(), L = w2.layout;
    assert.ok(rh, v.name + ' rooster tappable');
    assert.ok(Math.hypot(rh.x - L.stage.x, rh.y - (L.stage.y - L.item * L.stage.s / 2)) >= 120, v.name + ' ≥ 120 px from the stage');
    assert.ok(Math.abs(w2.rooster.y - L.fenceY) < 1e-6);
    for (const k of L.keep) assert.ok(!inside(k, rh.x, rh.y), v.name + ' rooster under the ' + k.kind);
    assert.strictEqual(tapAt(w2, rh.x, rh.y), 'rooster');
    assert.ok(types(evs(w2)).includes('roosterTap') && w2.rooster.crow > 0.5);
    run(w2, 10);
    assert.ok(!w2.rooster || w2.rooster.state === 'leave', 'it leaves after ≈ 8 s');
  }
  // fireflies (night)
  const w3 = mkWorld({ age: 4, seed: 23, surprise: true });
  roundOf(w3, 'count', 1, { surprise: 'fireflies' });
  until(w3, () => w3.fireflyHit(), 3000);
  const fh = w3.fireflyHit();
  assert.ok(!w3._memberAt(fh.x, fh.y));
  assert.strictEqual(tapAt(w3, fh.x, fh.y), 'firefly');
  assert.ok(types(evs(w3)).includes('fireflyTap'));
});

test('surprises: one round per chapter (round 1 or 2, never the warm-up), chapters 0–2 chick / rooster, night fireflies', () => {
  const w = new FP.World({ seed: 31, age: 4 }); w.setViewport(1280, 720); w.newSession();
  const seen = [];
  const bot = new FP.Bot(w, { skill: 1, seed: 3 });
  let t = 0;
  while (w.state !== 'sessionDone' && t < 900) { bot.step(1 / 30); w.update(1 / 30); t += 1 / 30; for (const e of w.drainEvents()) { bot.onEvent(e); if (e.type === 'round' && e.surprise) seen.push([w.level, e.round, e.surprise]); } }
  assert.strictEqual(w.state, 'sessionDone');
  assert.ok(seen.length >= 3, JSON.stringify(seen));
  for (const [lv, ri, s] of seen) { assert.ok(ri === 1 || ri === 2); assert.strictEqual(s, lv === 3 ? 'fireflies' : (s === 'chick' || s === 'rooster') ? s : 'x'); }
  assert.strictEqual(new Set(seen.map(s => s[0])).size, seen.length, 'one per chapter');
});

// ================================================================ flow: time limit, short rounds, talk, sessions, determinism
test('chapter time limit: after ≥ 3 rounds the chapter goes to Talk once it passed 75 s; late rounds are short', () => {
  const w = mkWorld({ age: 4, seed: 41 });
  w.levels = ['colors', 'colors', 'colors', 'colors']; w.startLevel(1); evs(w);
  w.levelStartTime = w.time - 70;   // pretend the chapter already took 70 s
  until(w, () => w.interactive);
  assert.strictEqual(w.round, 0);
  // round 0 done at > 75 s: only 1 round → continues
  const solve = () => { tapMember(w, w.cur.oddId); until(w, () => w.state !== 'round'); };
  solve(); until(w, () => w.interactive || w.state === 'talk');
  assert.strictEqual(w.round, 1); assert.ok(w.cur.short, 'late round is short'); assert.strictEqual(w.members.length, 3);
  solve(); until(w, () => w.interactive || w.state === 'talk');
  assert.strictEqual(w.round, 2);
  solve(); until(w, () => w.interactive || w.state === 'talk');
  assert.strictEqual(w.state, 'talk', 'after 3 rounds past 75 s → Talk'); assert.strictEqual(w.roundsPerLevel, 3);
});

test('talk: answer → +1★ → levelDone; no answer → re-asked 3× (glow from the 2nd) then Bo answers (no star)', () => {
  const w = mkWorld({ age: 4, seed: 42 });
  w._startTalk(); evs(w);
  assert.strictEqual(w.state, 'talk');
  const s0 = w.stars;
  assert.strictEqual(w.talkAnswer(w.talk.answer), true);
  assert.strictEqual(w.stars, s0 + 1);
  until(w, () => w.state === 'levelDone');
  const w2 = mkWorld({ age: 4, seed: 43 }); w2._startTalk(); evs(w2);
  const asks = [];
  until(w2, () => { for (const q of evs(w2)) if (q.type === 'talkAsk') asks.push(q); return !!w2.talkAnswered; }, 20000);
  assert.strictEqual(asks.length, 3); assert.ok(!asks[0].glowAnswer && asks[1].glowAnswer);
  assert.ok(w2.talkAnswered.auto && !w2.talkAnswered.correct);
});

test('full headless session per age × bot skill (1, 0.6, 0): finishes, no stuck phase, stars 3/2/1 per round + talk, topics rotate next session', () => {
  for (const age of AGES) for (const skill of [1, 0.6, 0]) {
    const w = new FP.World({ seed: 50 + age, age, lang: age % 2 ? 'vi' : 'en' });
    w.setViewport(VIEWPORTS[age % VIEWPORTS.length].W, VIEWPORTS[age % VIEWPORTS.length].H, VIEWPORTS[age % VIEWPORTS.length].ins);
    w.newSession();
    const bot = new FP.Bot(w, { skill, seed: age });
    let t = 0, sig = '', since = 0, starsSum = 0, talkStars = 0, rounds = 0;
    const dt = 1 / 30;
    while (w.state !== 'sessionDone' && t < 1500) {
      bot.step(dt); w.update(dt); t += dt;
      for (const e of w.drainEvents()) {
        bot.onEvent(e);
        if (e.type === 'roundDone') { assert.ok([1, 2, 3].includes(e.stars)); assert.strictEqual(e.stars, e.misses === 0 && !e.assisted ? 3 : e.misses === 1 && !e.assisted ? 2 : e.assisted ? Math.min(2, e.misses === 0 ? 3 : e.misses === 1 ? 2 : 1) : 1); starsSum += e.stars; rounds++; }
        if (e.type === 'talkResult' && e.correct) talkStars++;
      }
      const s = w.state + ':' + w.phase + ':' + w.level + ':' + w.round;
      if (s !== sig) { sig = s; since = 0; } else since += dt;
      assert.ok(since < (w.phase === 'play' ? 120 : 30), `age ${age} skill ${skill} stuck in ${s}`);
      for (const m of w.members) assert.ok(Number.isFinite(m.x + m.y + m.rot + m.sx + m.bob), 'NaN');
    }
    assert.strictEqual(w.state, 'sessionDone', `age ${age} skill ${skill}`);
    assert.strictEqual(w.stars, starsSum + talkStars);
    assert.ok(rounds >= 12 && rounds <= 16);
    if (skill === 1) assert.strictEqual(bot.stats.wrong, 0);
    if (skill === 0) assert.ok(bot.stats.wrong > 0 && bot.stats.right === rounds, 'skill 0 still finishes through the hints');
    const last = w.levels.slice(); w.newSession();
    if (skill === 1) assert.notDeepStrictEqual(J(w.levels), J(last), 'topics rotate');
  }
});

test('determinism: the same seed + the same inputs → the same events whatever the frame size', () => {
  function runS(dt) {
    const w = new FP.World({ seed: 77, age: 4 }); w.setViewport(1280, 720); w.newSession();
    const bot = new FP.Bot(w, { skill: 0.7, seed: 5 }), out = [];
    let t = 0;
    while (t < 90) { bot.step(dt); w.update(dt); t += dt; for (const e of w.drainEvents()) { bot.onEvent(e); if (['right', 'wrong', 'round', 'land', 'roundDone', 'doorOpen'].includes(e.type)) out.push(e.type + ':' + (e.id || e.round || '')); } }
    return out.join(',');
  }
  assert.strictEqual(runS(1 / 30), runS(1 / 30));
  const a = new FP.World({ seed: 5, age: 6 }), b = new FP.World({ seed: 5, age: 6 });
  a.setViewport(1280, 720); b.setViewport(1280, 720); a.newSession(); b.newSession();
  for (let i = 0; i < 600; i++) { a.update(1 / 60); b.update(1 / 120); b.update(1 / 120); }
  assert.deepStrictEqual(types(a.drainEvents()), types(b.drainEvents()));
});

test('interpolation twins: _px/_py/_prot/_psx/_psy/_pbob are the values at the start of the last sub-step', () => {
  const w = roundWhereTopic(4, 'animals', 2), o = oddM(w);
  tapMember(w, o.id);
  run(w, 0.3);
  const x = o.x, y = o.y;
  w.update(H);
  assert.strictEqual(o._px, x); assert.strictEqual(o._py, y);
  w.update(H * 0.5);
  assert.ok(w.alpha > 0.49 && w.alpha < 0.51);
  assert.ok(CFG.step <= 1 / 120 + 1e-12);
});

// ================================================================ weather
test('weather: moods (sky colours, barn glow, sun / moon), crossfade, particle kinds per mood, cap 120, bursts, party', () => {
  const W = FP.Weather, wx = new W({ width: 1280, height: 720, seed: 3, groundY: 706 });
  assert.deepStrictEqual(W.NAMES, ['morning', 'noon', 'sunset', 'night']);
  for (let i = 0; i < 4; i++) {
    wx.setWeather(i, { instant: true });
    const a = wx.ambient, nm = W.NAMES[i];
    assert.strictEqual(a.skyTop, SKY[nm][0]); assert.strictEqual(a.skyBottom, SKY[nm][1]);
    assert.strictEqual(a.glow, GLOW[nm]); assert.strictEqual(a.mood, nm);
    for (let k = 0; k < 600; k++) wx.update(1 / 60);
    const kinds = new Set(wx.particles.map(p => p.type));
    for (const p of wx.particles) assert.ok(SPRITES.includes(p.sprite), 'sprite ' + p.sprite);
    if (nm === 'morning') assert.ok(kinds.has('mist') && kinds.has('mote'));
    if (nm === 'noon') assert.ok(kinds.has('butterfly') && kinds.has('petal'));
    if (nm === 'sunset') assert.ok(kinds.has('mote') && kinds.has('leaf'));
    if (nm === 'night') { assert.ok(kinds.has('firefly')); assert.strictEqual(a.starsA, 1); assert.strictEqual(a.moonA, 1); }
  }
  assert.ok(wx.ambient.sunX > 0);
  wx.setWeather(0, { instant: true }); wx.setWeather(3);
  for (let k = 0; k < 75; k++) wx.update(1 / 60);
  assert.ok(wx.ambient.envMix > 0.2 && wx.ambient.envMix < 0.8, 'crossfade 2.5 s');
  for (let k = 0; k < 200; k++) wx.update(1 / 60);
  assert.ok(wx.ambient.envMix === 1);
  for (const kind of ['stars', 'sparkle', 'feathers', 'confetti', 'dust', 'dots']) wx.burst(600, 300, { kind, n: 40 });
  assert.ok(wx.particles.length <= 120, 'cap ' + wx.particles.length);
  wx.addDust(100, 600, 5);
  wx.setParty(true); for (let k = 0; k < 300; k++) wx.update(1 / 60);
  assert.ok(wx.ambient.party > 0.9 && wx.particles.some(p => /confetti/.test(p.sprite)));
  wx.resize(720, 1556, 1530);
  for (let k = 0; k < 60; k++) wx.update(1 / 60);
  for (const p of wx.particles) assert.ok(Number.isFinite(p.x + p.y + p.alpha));
});

// ---------------------------------------------------------------- runner
(async () => {
  const only = process.argv[2];
  let pass = 0, fail = 0;
  const t0 = Date.now();
  for (const t of tests) {
    if (only && !t.name.includes(only)) continue;
    const s = Date.now();
    try { await t.fn(); pass++; console.log(`  ok  ${t.name} (${Date.now() - s} ms)`); }
    catch (e) { fail++; console.log(`FAIL  ${t.name}\n      ${(e && e.stack || e).toString().split('\n').slice(0, 4).join('\n      ')}`); }
  }
  console.log(`\n${pass} passed, ${fail} failed (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  process.exit(fail ? 1 : 0);
})();
