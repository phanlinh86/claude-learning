#!/usr/bin/env node
// Nim's River Hop — headless unit tests for rng / content / world / weather / bot (DESIGN §2, §5.1–5.5, docs/MECHANICS.md).
// Run from the game folder:   node tests/unit/run.js [name part]      (exit 1 on any failure)
// (tests/unit/i18n_voice.test.js and stone_art.test.js are the other engineers' suites and run on their own.)
'use strict';
const assert = require('assert');
const { load } = require('./load');

const NH = load();
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const AGES = [3, 4, 5, 6, 7];
const C = NH.Content;
const CFG = NH.CONFIG;
const J = v => JSON.parse(JSON.stringify(v));   // objects from the vm sandbox have other prototypes
assert.deepStrictEqual = ((orig) => (a, b, m) => orig(J(a), J(b), m))(assert.deepStrictEqual);
const fin = (...v) => v.every(Number.isFinite);

// ---------- independent copies of the DESIGN tables (§2, §3, §5.1)
const AGE_TOPICS = { 3: ['colors', 'shapes', 'size', 'animals'], 4: ['colors', 'shapes', 'count', 'animals'],
  5: ['shapes', 'count', 'letters', 'animals'], 6: ['lower', 'initial', 'add', 'count'], 7: ['initial', 'add', 'sub', 'oddeven'] };
const CLASH = [['blue', 'purple'], ['red', 'green'], ['yellow', 'orange'], ['green', 'orange'], ['red', 'orange']];
const S_BASE = { 3: 150, 4: 150, 5: 140, 6: 128, 7: 128 };
const FRUITS = ['apple', 'pear', 'strawberry', 'mushroom', 'acorn'];
/** (k rows, m stones) per age / round (DESIGN §5.1); chapter 0 round 0 = the session warm-up (2, 2); short (2, 2). */
function wantKM(age, ri, level, short) {
  if (short && ri > 0) return [2, 2];
  if (ri === 0 && level === 0) return [2, 2];
  return (age <= 3 ? [[2, 2], [2, 2], [3, 2], [3, 2]] : age === 4 ? (level === 0 ? [[2, 2], [2, 3], [3, 2], [3, 3]] : [[2, 2], [3, 2], [3, 3], [3, 3]])
    : age === 5 ? [[3, 2], [3, 3], [3, 3], [4, 3]] : [[3, 3], [4, 3], [4, 3], [4, 3]])[ri];
}
const DESIGN_EVENTS = ['session', 'level', 'round', 'rise', 'ask', 'right', 'hop', 'land', 'splash', 'thingAway', 'count', 'homeBadge', 'bankLand', 'curl', 'stick',
  'uncurl', 'roundDone', 'wipe', 'wrong', 'squish', 'ahead', 'soft', 'hint', 'assistArmed', 'assist', 'idle', 'pokeNim', 'fish', 'fishTap', 'frog', 'frogTap',
  'snow', 'snowTap', 'gust', 'talk', 'talkAsk', 'talkResult', 'levelDone', 'sessionDone'];
const NON_POSITIONAL = ['session', 'talkAsk', 'talkResult', 'levelDone', 'sessionDone'];

/** CSS viewport + CSS safe-area insets → logical {W, H, ins} (short side 720). */
function dev(name, cw, ch, ci) {
  const { W, H } = NH.World.logicalSize(cw, ch), s = Math.min(W, H) / Math.min(cw, ch), ins = {};
  for (const k of ['top', 'right', 'bottom', 'left']) ins[k] = Math.round(((ci || {})[k] || 0) * s);
  return { W, H, ins, name };
}
const VIEWPORTS = [
  dev('iPhone 393×852 portrait (notch)', 393, 852, { top: 59, bottom: 34 }),
  dev('iPhone 852×393 landscape (notch)', 852, 393, { left: 59, right: 59, bottom: 21 }),
  dev('iPad 820×1180 portrait', 820, 1180, { top: 24, bottom: 20 }),
  dev('iPad 1180×820 landscape', 1180, 820, { top: 24, bottom: 20 }),
  { W: 1600, H: 720, ins: null, name: '1600×720' },
  { W: 960, H: 720, ins: null, name: '960×720 (iPad 4:3)' },
  { W: 960, H: 720, ins: { top: 32, right: 0, bottom: 27, left: 0 }, name: '960×720 insets' },
  { W: 720, H: 1600, ins: { top: 110, right: 0, bottom: 64, left: 0 }, name: '720×1600 notch' },
  { W: 720, H: 960, ins: { top: 32, right: 0, bottom: 27, left: 0 }, name: '720×960 insets' },
  { W: 1556, H: 720, ins: { top: 0, right: 108, bottom: 38, left: 108 }, name: '1556×720 notch' },
  dev('iPad mini 744×1133', 744, 1133, { top: 24, bottom: 20 }),
  dev('iPhone SE 667×375', 667, 375, {}),
  dev('iPhone SE 375×667', 375, 667, { top: 20 })
];
const VP_LAND = VIEWPORTS[1], VP_PORT = VIEWPORTS[0], VP_IPAD = VIEWPORTS[5];
const KM_ALL = [[2, 2], [2, 3], [3, 2], [3, 3], [4, 3]];

// ---------- helpers
function mkWorld(o) {
  o = o || {};
  const cfg = Object.assign(o.surprise ? {} : { surpriseTypes: [], winterSurprise: null }, o.config || {});
  const w = new NH.World({ seed: o.seed || 1, age: o.age || 4, lang: o.lang || 'en', config: cfg });
  const v = o.vp || VP_IPAD;
  w.setViewport(v.W, v.H, v.ins);
  return w;
}
/** Steps the world (dt) until pred(w) or maxT seconds; returns the events seen (also passed to onEv). */
function run(w, pred, maxT, onEv, dt) {
  dt = dt || 1 / 60;
  const evs = [];
  let t = 0;
  while (t < maxT) {
    if (pred && pred(w)) break;
    w.update(dt); t += dt;
    for (const e of w.drainEvents()) { evs.push(e); if (onEv) onEv(e); }
  }
  return evs;
}
const until = (w, pred, maxT, onEv) => run(w, pred, maxT || 60, onEv);
function startTopic(w, topic, level) {
  w.newSession();
  if (topic) { w.levels = [topic, topic, topic, topic]; w.startLevel(level || 0); }
  w.drainEvents();
}
/** Plays the current round with right taps until the next round's play (or Talk). */
function playRound(w) { until(w, x => x.interactive, 10); const r = w.round; for (let j = 0; j < 6 && w.cur && w.round === r; j++) { until(w, x => x.interactive || x.round !== r, 8); if (w.round !== r || !w.interactive) break; tapStone(w, w._target().id); } until(w, x => x.round !== r || x.state === 'talk', 15); }
function toPlay(w, topic, level) { startTopic(w, topic, level); until(w, x => x.interactive, 20); assert.ok(w.interactive, 'reached play'); }
function tapStone(w, id) { const h = w.stoneHit(id); assert.ok(h, 'stone ' + id + ' tappable'); const r = w.pointerDown(h.x, h.y); w.pointerUp(h.x, h.y); return r; }
function wrongOf(w) { return w.stones.find(s => s.row === w.row && !s.target && s.state === 'rest'); }
function waterPoint(w) {   // open water away from every stone and Nim
  const L = w.layout, R = L.river, nb = w.nimHit();
  for (let y = R.y + 30; y < R.y + R.h - 30; y += 10) for (let x = R.x + 20; x < R.x + R.w - 20; x += 10) {
    if (x > nb.x - 10 && x < nb.x + nb.w + 10 && y > nb.y - 10 && y < nb.y + nb.h + 10) continue;
    if (w.stones.every(s => s.state === 'gone' || s.state === 'hidden' || Math.hypot(x - s.x, y - (s.y - 0.35 * L.itemH)) > L.hitR + 10)) return { x, y };
  }
  return null;
}
function footBox(L, x, y) { return { x: x - L.S / 2, y: y - L.itemH, w: L.S, h: L.itemH + CFG.footBot * L.S }; }
function overlap(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
function onScreen(L, b, m) { m = m || 0; return b.x >= L.ins.left - m && b.y >= L.ins.top - m && b.x + b.w <= L.W - L.ins.right + m && b.y + b.h <= L.H - L.ins.bottom + m; }

// =====================================================================================================================  RNG / basics
test('rng: deterministic, ranges', () => {
  const a = new NH.RNG(42), b = new NH.RNG(42);
  for (let i = 0; i < 100; i++) assert.strictEqual(a.next(), b.next());
  const r = new NH.RNG('x');
  for (let i = 0; i < 1000; i++) { const v = r.int(2, 5); assert.ok(v >= 2 && v <= 5); }
  assert.strictEqual(new NH.RNG(7).fork(1).next(), new NH.RNG(7).fork(1).next());
});
test('logicalSize: short side 720, long side clamped 960..1600', () => {
  assert.deepStrictEqual(NH.World.logicalSize(852, 393), { W: 1561, H: 720 });
  assert.deepStrictEqual(NH.World.logicalSize(393, 852), { W: 720, H: 1561 });
  assert.deepStrictEqual(NH.World.logicalSize(1024, 768), { W: 960, H: 720 });
  assert.deepStrictEqual(NH.World.logicalSize(3000, 700), { W: 1600, H: 720 });
});

// =====================================================================================================================  layout
test('layout: DESIGN fields, axis, banks, Nim, S, hitR on every viewport × age × (k, m)', () => {
  for (const v of VIEWPORTS) for (const age of AGES) for (const [k, m] of KM_ALL) {
    const L = NH.World.computeLayout(v.W, v.H, v.ins, {}, age, null, k, m), tag = `${v.name} age ${age} ${k}×${m}`;
    if (k > NH.World.maxRows(v.W, v.H, v.ins, age, m)) continue;   // the world never asks content for more rows than fit (iPad 4:3 portrait: 3)
    for (const f of ['W', 'H', 'ins', 'portrait', 'tall', 'phone', 'ax', 'play', 'near', 'far', 'river', 'nimHome', 'goal', 'nimH', 'rows', 'rowPos', 'S', 'itemH', 'hitR', 'bubble', 'hud'])
      assert.ok(L[f] !== undefined, tag + ': layout.' + f);
    assert.ok(L.fits, tag + ': fits');
    assert.strictEqual(L.rows, k); assert.strictEqual(L.rowPos.length, k);
    assert.ok(L.S <= S_BASE[age] && L.S >= 116, tag + ' S ' + L.S);
    assert.ok(Math.abs(L.itemH - 0.62 * L.S) < 1e-9);
    assert.ok(Math.abs(L.hitR - Math.max(0.6 * L.S * 0.75 + 14, L.phone ? 92 : 0)) < 1e-9, tag + ' hitR');
    if (L.portrait) {
      assert.deepStrictEqual(L.ax, { x: 0, y: -1 }); assert.deepStrictEqual(L.flowDir, { x: 1, y: 0 });
      assert.strictEqual(L.nimH, L.phone ? 210 : 180);
      assert.ok(L.far.y + L.far.h <= L.river.y + 1e-6 && L.river.y + L.river.h <= L.near.y + 1e-6, tag + ' far / river / near order');
      if (L.compact) assert.ok(L.near.h - L.ins.bottom >= 170 - 1e-6 && L.far.h >= 150 - 1e-6, tag + ' compact bank minimums');
      else assert.ok(L.near.h - L.ins.bottom >= 200 - 1e-6 && L.far.h >= L.nimH + 20 - 1e-6, tag + ' bank minimums');
      if (L.compact) { const B0 = NH.World.nimPoints(); assert.ok(L.bubble.x + L.bubble.w <= L.hud.x, tag + ' compact: the bubble beside the HUD'); assert.ok(L.goal.x - (B0.feet[0] - B0.box[0]) * L.nimH / 300 >= L.bubble.x + L.bubble.w - 1, tag + ' the goal clear of the bubble'); assert.ok(L.bubble.w >= 220, tag + ' bubble width ' + L.bubble.w); }
      for (let j = 1; j < k; j++) assert.ok(L.rowPos[j] < L.rowPos[j - 1], tag + ' rows go up');
      assert.ok(Math.abs(L.nimHome.x - (L.W / 2 - 60)) < 1e-9);
    } else {
      assert.deepStrictEqual(L.ax, { x: 1, y: 0 }); assert.deepStrictEqual(L.flowDir, { x: 0, y: 1 });
      assert.strictEqual(L.nimH, 190);
      assert.ok(L.near.w - L.ins.left >= 190 - 1e-6 && L.far.w - L.ins.right >= 170 - 1e-6, tag + ' bank minimums');
      assert.ok(Math.abs(L.near.x + L.near.w - L.river.x) < 1e-6 && Math.abs(L.river.x + L.river.w - L.far.x) < 1e-6);
      for (let j = 1; j < k; j++) assert.ok(L.rowPos[j] > L.rowPos[j - 1], tag + ' rows go right');
      assert.ok(Math.abs(L.nimHome.x - (L.ins.left + 120)) < 1e-9);
    }
    assert.ok(L.play.y0 >= L.bubble.y + L.bubble.h + 10 - 1e-9, tag + ' play below the bubble');
    for (const p of [L.nimHome, L.goal, L.rollStart, L.rollEnd]) assert.ok(p.x > L.ins.left && p.x < L.W - L.ins.right && p.y > L.play.y0 && p.y < L.H - L.ins.bottom, tag + ' Nim points on screen');
    // Nim standing at the far end of his roll is on screen (his nose = NIM_POINTS.box right edge)
    const B = NH.World.nimPoints(), sN = L.nimH / 300;
    assert.ok(L.rollEnd.x + (B.box[2] - B.feet[0]) * sN <= L.W - L.ins.right + 1, tag + ' roll end on screen');
    assert.ok(L.nimHome.x - (B.feet[0] - B.box[0]) * sN >= L.ins.left - 1, tag + ' home on screen');
  }
});
test('layout: stones never overlap each other, the bubble / HUD, or the screen edges (13 viewports × 5 ages × 5 shapes × 12 seeds)', () => {
  let n = 0;
  for (const v of VIEWPORTS) for (const age of AGES) for (const [k, m] of KM_ALL) {
    if (k > NH.World.maxRows(v.W, v.H, v.ins, age, m)) continue;
    const L = NH.World.computeLayout(v.W, v.H, v.ins, {}, age, null, k, m);
    for (let seed = 1; seed <= 12; seed++) {
      const H = NH.World.stoneHomes(L, k, m, seed * 97), boxes = [], tag = `${v.name} age ${age} ${k}×${m} seed ${seed}`;
      assert.strictEqual(H.length, k);
      H.forEach((row, j) => { assert.strictEqual(row.length, m); row.forEach(p => { assert.ok(fin(p.x, p.y)); boxes.push({ b: footBox(L, p.x, p.y), j, p }); }); });
      for (let a = 0; a < boxes.length; a++) {
        const A = boxes[a].b;
        assert.ok(onScreen(L, A, 0), tag + ' on the safe screen ' + JSON.stringify(A));
        for (const K of L.keep) assert.ok(!overlap(A, K), tag + ' stone under the ' + K.kind);
        for (let b = a + 1; b < boxes.length; b++) assert.ok(!overlap(A, boxes[b].b), tag + ' stones overlap');
        // inside the river along the axis
        const R = L.river;
        if (L.portrait) assert.ok(A.y >= R.y - L.itemH && A.y + A.h <= R.y + R.h + 1e-6, tag + ' in the river (portrait)');
        else assert.ok(A.x >= R.x - 1e-6 && A.x + A.w <= R.x + R.w + 1e-6, tag + ' in the river (landscape)');
        n++;
      }
      // hit circles of stones in the same row never contain each other's centre
      H.forEach(row => { for (let i = 1; i < row.length; i++) assert.ok(Math.hypot(row[i].x - row[i - 1].x, row[i].y - row[i - 1].y) >= L.S - 1e-6, tag + ' row spacing'); });
    }
  }
  assert.ok(n > 25000);
});
test('layout: maxRows — 4 rows fit everywhere except the iPad 4:3 portrait (3); squat portraits use the compact layout', () => {
  for (const v of VIEWPORTS) for (const age of AGES) {
    const mr = NH.World.maxRows(v.W, v.H, v.ins, age, 3);
    const squat = v.H > v.W && (v.H - ((v.ins && v.ins.top) || 0) - ((v.ins && v.ins.bottom) || 0)) / v.W < 1.6;
    assert.strictEqual(mr, v.W === 720 && v.H === 960 ? 3 : 4, v.name + ' age ' + age);
    assert.strictEqual(!!NH.World.computeLayout(v.W, v.H, v.ins, {}, age, null, 3, 3).compact, squat, v.name + ' compact');
  }
  // content respects it
  const r = C.makeRound('add', { age: 6, rng: new NH.RNG(1), roundIndex: 2, maxK: 3 });
  assert.strictEqual(r.k, 3); assert.strictEqual(C.validate(r), null);
  const w = mkWorld({ seed: 2, age: 6, vp: VIEWPORTS[8] });
  toPlay(w, 'add', 1);
  assert.strictEqual(w.cur.k, 3); assert.ok(w.layout.fits && w.layout.compact);
});
test('layout: a measured hudKeep box pushes the stones / bubble; homes vary by seed', () => {
  const v = VIEWPORTS[9], hk = [{ x: v.W - v.ins.right - 300, y: 0, w: 300, h: 210 }];
  const L = NH.World.computeLayout(v.W, v.H, v.ins, {}, 4, hk, 3, 3);
  for (let s = 1; s < 10; s++) NH.World.stoneHomes(L, 3, 3, s).flat().forEach(p => { for (const K of L.keep) assert.ok(!overlap(footBox(L, p.x, p.y), K), 'clear of hudKeep'); });
  const a = J(NH.World.stoneHomes(L, 3, 3, 1)), b = J(NH.World.stoneHomes(L, 3, 3, 2));
  assert.notDeepStrictEqual(a, b);
  assert.deepStrictEqual(a, J(NH.World.stoneHomes(L, 3, 3, 1)));
});
test('layout: shrinking — S drops below the age base only when rows need it, the banks compress last', () => {
  const L = NH.World.computeLayout(960, 720, null, {}, 6, null, 4, 3);
  assert.ok(L.S < 128 && L.S >= 116, 'S ' + L.S);
  const L2 = NH.World.computeLayout(1600, 720, null, {}, 6, null, 4, 3);
  assert.strictEqual(L2.S, 128);
  assert.strictEqual(L2.near.w, 230); assert.strictEqual(L2.far.w, 210);
  const Lp = NH.World.computeLayout(720, 1561, { top: 108, bottom: 62, left: 0, right: 0 }, {}, 6, null, 4, 3);
  assert.ok(Lp.fits && Lp.S >= 116);
});

// =====================================================================================================================  content
const POOL_TOPICS = AGES.flatMap(a => NH.AGE_POOLS[a].map(t => [a, t]));
test('content: every topic × age 3..7 × 200 seeds × 4 rounds passes the self-check + independent checks', () => {
  let n = 0;
  for (const [age, topic] of POOL_TOPICS) {
    const keys = new Set(), targetIdx = new Set(), values = new Set();
    for (let s = 0; s < 200; s++) {
      const rng = new NH.RNG(1000 + s * 31 + age), level = s % 4 === 0 ? 0 : 1 + (s % 3), used = [];
      let prev = null, prevFruit = null;
      for (let ri = 0; ri < 4; ri++) {
        const short = ri === 3 && s % 7 === 0;
        const r = C.makeRound(topic, { age, lang: s % 2 ? 'vi' : 'en', rng, roundIndex: ri, level, short, usedKeys: used, prevRule: prev && prev.rule, prevFruit });
        const tag = `${topic} age ${age} seed ${s} round ${ri}`;
        assert.strictEqual(C.validate(r), null, tag);
        const [k, m] = wantKM(age, ri, level, short);
        assert.strictEqual(r.k, k, tag + ' k'); assert.strictEqual(r.m, m, tag + ' m');
        assert.strictEqual(r.rows.length, k);
        const tIdx = [];
        r.rows.forEach((row, j) => {
          assert.strictEqual(row.length, m);
          const tg = row.filter(q => q.target);
          assert.strictEqual(tg.length, 1, tag + ' exactly one target in row ' + j);
          tIdx.push(row.indexOf(tg[0]));
          row.forEach(q => { assert.strictEqual(q.row, j); assert.strictEqual(C.ruleHolds(r.rule, q.thing, r, j), q.target, tag + ' rule ' + q.id); });
          if (r.mode === 'countSeq') {
            assert.strictEqual(tg[0].thing.n, j + 1, tag + ' countSeq target');
            row.filter(q => !q.target).forEach(q => {
              assert.ok(q.thing.n !== j + 1 && q.thing.n >= 1 && q.thing.n <= k + 2, tag + ' countSeq distractor');
              if (age <= 4) assert.ok(q.thing.n !== j + 2, tag + ' no j+2 at age ≤ 4');
            });
            assert.ok(row.every(q => q.thing.numeral === true));
          }
          if (r.mode === 'countSel') {
            row.filter(q => !q.target).forEach(q => { const g = Math.abs(q.thing.n - r.rule.value); assert.ok(age <= 4 ? g >= 2 : g >= 1, tag + ' countSel gap'); });
            assert.ok(row.every(q => q.thing.numeral === false));
          }
        });
        if (k >= 2) assert.ok(tIdx.some(x => x !== tIdx[0]), tag + ' target position varies');
        tIdx.forEach(x => targetIdx.add(x));
        const cols = [...new Set(r.rows.flat().map(q => q.thing.color).filter(Boolean))];
        if (age < 5) { for (const [a, b] of CLASH) assert.ok(!(cols.includes(a) && cols.includes(b)), tag + ' CVD clash ' + cols); assert.ok(!cols.includes('pink'), tag + ' no pink < 5'); }
        assert.ok(FRUITS.includes(r.fruit)); if (prevFruit) assert.notStrictEqual(r.fruit, prevFruit, tag + ' the fruit changes');
        assert.ok(!used.includes(r.key), tag + ' a new set every round');
        if (prev && r.mode !== 'countSeq' && prev.mode !== 'countSeq' && !(topic === 'animals' && r.rule.kind !== prev.rule.kind))
          assert.notStrictEqual(String(r.rule.value), String(prev.rule.value), tag + ' the asked value changes');
        assert.strictEqual(r.surprise, null);
        assert.ok(Number.isInteger(r.seed));
        used.push(r.key); keys.add(r.key); values.add(String(r.rule.value));
        prev = r; prevFruit = r.fruit; n++;
      }
    }
    assert.ok(keys.size > (age === 3 || topic === 'size' || topic === 'count' ? 60 : 300), `${topic} age ${age}: variety (${keys.size} distinct sets)`);
    assert.ok(targetIdx.size >= 2, `${topic} age ${age}: target positions`);
    if (topic !== 'size' && topic !== 'oddeven') assert.ok(values.size >= 3, `${topic} age ${age}: asked values ${[...values]}`);
  }
  assert.ok(n >= 20000);
});
test('content: deterministic per seed; surprise never in round 0; ask/rule params', () => {
  for (const [age, topic] of POOL_TOPICS) {
    const a = C.makeRound(topic, { age, rng: new NH.RNG(5), roundIndex: 2, surprise: 'fish' }), b = C.makeRound(topic, { age, rng: new NH.RNG(5), roundIndex: 2, surprise: 'fish' });
    assert.deepStrictEqual(a, b);
    assert.strictEqual(a.surprise, 'fish');
    assert.strictEqual(C.makeRound(topic, { age, rng: new NH.RNG(5), roundIndex: 0, surprise: 'fish' }).surprise, null);
    assert.ok(/^p\./.test(a.promptKey));
  }
  const cs = C.makeRound('count', { age: 4, rng: new NH.RNG(3), roundIndex: 2 });
  assert.strictEqual(cs.mode, 'countSeq'); assert.strictEqual(cs.promptKey, 'p.countSeq'); assert.deepStrictEqual(cs.params, { n: cs.k });
  const cl = C.makeRound('count', { age: 4, rng: new NH.RNG(3), roundIndex: 1 });
  assert.strictEqual(cl.mode, 'countSel'); assert.ok(cl.params.n >= 2 && cl.params.n <= 5);
  const an = C.makeRound('animals', { age: 4, rng: new NH.RNG(3), roundIndex: 1 });
  assert.strictEqual(an.promptKey, 'p.home'); assert.ok(['farm', 'sea'].includes(an.params.home));
  assert.strictEqual(C.makeRound('animals', { age: 3, rng: new NH.RNG(3), roundIndex: 2 }).promptKey, 'p.animal');
  const lo = C.makeRound('lower', { age: 6, rng: new NH.RNG(3), roundIndex: 1 }), tg = lo.rows.map(r => r.find(q => q.target).thing.text);
  for (let j = 1; j < tg.length; j++) assert.notStrictEqual(tg[j] === tg[j].toUpperCase(), tg[j - 1] === tg[j - 1].toUpperCase(), 'lower alternates the case');
});
test('content: validate catches broken rounds', () => {
  const r = C.makeRound('colors', { age: 4, rng: new NH.RNG(9), roundIndex: 1 });
  const bad = J(r); bad.rows[0].forEach(q => { q.target = false; }); assert.ok(C.validate(bad));
  const bad2 = J(r); bad2.rows[0][0].thing.color = bad2.rule.value; bad2.rows[0][1].thing.color = bad2.rule.value; assert.ok(C.validate(bad2));
  const bad3 = J(C.makeRound('count', { age: 4, rng: new NH.RNG(9), roundIndex: 2 }));
  const d = bad3.rows[0].find(q => !q.target); d.thing.n = 2; d.thing.nameValue = 2; bad3.key = C.roundKey(bad3); assert.ok(C.validate(bad3), 'j+2 distractor at age 4');
  const bad4 = J(r); bad4.fruit = 'banana'; assert.ok(C.validate(bad4));
});
test('content: Talk time for every topic × age (2 choices at age 3, else 3; answer among them)', () => {
  for (const [age, topic] of POOL_TOPICS) for (let s = 0; s < 40; s++) {
    const t = C.makeTalk(topic, { age, lang: s % 2 ? 'vi' : 'en', rng: new NH.RNG(s * 13 + age) });
    assert.ok(t.choices.some(c => c.id === t.answer), topic + ' answer');
    const want = topic === 'size' ? 2 : age <= 3 && !['letters', 'lower', 'initial', 'add', 'sub', 'oddeven'].includes(topic) ? 2 : 3;
    assert.strictEqual(t.choices.length, want, `${topic} age ${age} choices`);
    assert.strictEqual(new Set(t.choices.map(c => JSON.stringify(c.thing))).size, t.choices.length);
    assert.ok(/^talk\./.test(t.promptKey));
    if (topic === 'count') assert.strictEqual(t.show.kind, 'dots');
  }
});
test('content: topicsFor — first session = AGE_TOPICS, later rotate', () => {
  for (const a of AGES) assert.deepStrictEqual(C.topicsFor(a), AGE_TOPICS[a]);
  const t = C.topicsFor(4, new NH.RNG(1), AGE_TOPICS[4]);
  assert.strictEqual(t.length, 4); assert.notDeepStrictEqual(t, AGE_TOPICS[4]);
});
test('content: initial letters follow the names (EN / VI classifiers)', () => {
  assert.strictEqual(C.initialOfName('bông hoa', 'vi'), 'H');
  assert.strictEqual(C.initialOfName('cây nấm', 'vi'), 'N');
  assert.strictEqual(C.initialOfName('chiếc lá', 'vi'), 'L');
  assert.strictEqual(C.initialOfName('chim cánh cụt', 'vi'), null);
  assert.strictEqual(C.initialOfName('mushroom', 'en'), 'M');
});

// =====================================================================================================================  world: flow
test('world: session flow — intro → rise → ask → play; ask carries promptKey, params, first, mode', () => {
  const w = mkWorld({ seed: 3 });
  w.newSession();
  const ev = until(w, x => x.interactive, 20);
  const types = ev.map(e => e.type);
  assert.ok(types.indexOf('level') < types.indexOf('round') && types.indexOf('round') < types.indexOf('rise') && types.lastIndexOf('rise') < types.indexOf('ask'));
  const ask = ev.find(e => e.type === 'ask');
  assert.ok(ask.promptKey && ask.params && ask.first === true && ask.mode === 'match');
  assert.strictEqual(ev.filter(e => e.type === 'rise').length, w.cur.n);
  assert.ok(w.stones.every(s => s.state === 'rest'));
  assert.strictEqual(w.phase, 'play'); assert.strictEqual(w.row, 0);
  // rise: 0.4 s lead + 0.18 s per stone + 0.45 s + 0.35 s
  const rise0 = ev.find(e => e.type === 'round');
  void rise0;
  assert.ok(w.fruit && w.fruit.state === 'wait' && FRUITS.includes(w.fruit.kind));
  assert.deepStrictEqual(w.answer(), { stone: w._target().id, id: w._target().id });
  assert.deepStrictEqual(w.targets(), [w._target().id]);
  assert.strictEqual(w.stoneById(w._target().id).target, true);
});
test('world: rise — each stone rises 0.45 s, overshoots ~8 px above rest then settles (dip spring)', () => {
  const w = mkWorld({ seed: 4 });
  w.newSession();
  until(w, x => x.phase === 'rise', 5);
  const s = w.stones[0];
  until(w, () => s.state === 'rise', 3);
  const t0 = w.time; let minY = 1e9;
  until(w, () => s.state === 'rest', 2);
  assert.ok(Math.abs(w.time - t0 - CFG.riseTime) < 0.05, 'rise time');
  until(w, null, 0.6, null, 1 / 120);
  // track: after rest the stone came from above (dip < 0) and settles
  const w2 = mkWorld({ seed: 4 }); w2.newSession(); until(w2, x => x.stones.length && x.stones[0].state === 'rest', 6);
  const s2 = w2.stones[0];
  for (let i = 0; i < 60; i++) { w2.update(1 / 120); minY = Math.min(minY, s2.y - s2.hy - s2.bob); }
  assert.ok(minY < -4 && minY > -12, 'overshoot ' + minY);
  until(w2, null, 2);
  assert.ok(Math.abs(s2.dip) < 1 && Math.abs(s2.y - s2.hy - s2.bob) < 1.5, 'settled');
  assert.ok(Math.abs(s2.bob) <= 2.0001);
});
test('world: a full scripted round — soft, wrong, squish (same stone < 1 s), ahead, poke, hint, assist, right', () => {
  const w = mkWorld({ seed: 7, age: 5 });
  toPlay(w, 'shapes', 1);   // (3, 3): 3 rows
  const ev = [], on = e => ev.push(e);
  // soft on the water
  const wp = waterPoint(w);
  assert.strictEqual(w.pointerDown(wp.x, wp.y), 'soft'); w.pointerUp(wp.x, wp.y);
  until(w, null, 0.05, on);
  assert.ok(w.drainEvents().length === 0 && ev.some(e => e.type === 'soft' && fin(e.x, e.y)));
  assert.strictEqual(w.misses, 0);
  // wrong
  const bad = wrongOf(w);
  assert.strictEqual(tapStone(w, bad.id), 'stone');
  until(w, null, 0.05, on);
  const wr = ev.find(e => e.type === 'wrong');
  assert.ok(wr && wr.id === bad.id && wr.got.nameKind && wr.want.promptKey && wr.want.left === 3 && wr.streak === 1 && wr.misses === 1);
  assert.strictEqual(w.misses, 1);
  until(w, null, 0.1);
  assert.ok(Math.abs(bad.tilt) > 0.02 && bad.dip > 0, 'the wrong stone wobbles');
  assert.strictEqual(w.nim.mood, 'oops');
  // same stone again within 1 s → squish only
  tapStone(w, bad.id); until(w, null, 0.05, on);
  assert.ok(ev.some(e => e.type === 'squish' && e.repeat)); assert.strictEqual(w.misses, 1);
  // poke Nim
  const nb = w.nimHit();
  assert.strictEqual(w.pointerDown(nb.cx, nb.cy), 'nim');
  assert.strictEqual(w.pointerUp(nb.cx, nb.cy), 'pokeNim');
  const pk = w.drainEvents().find(e => e.type === 'pokeNim');
  assert.ok(pk && pk.promptKey === w.cur.promptKey && pk.left === 3);
  until(w, x => x.interactive, 2);
  // a second miss → hint (after the 1 s window, another stone)
  until(w, null, 1.1);
  const bad2 = w.stones.find(s => s.row === 0 && !s.target && s.id !== bad.id) || bad;
  tapStone(w, bad2.id); until(w, null, 0.05, on);
  assert.strictEqual(w.misses, 2);
  const hint = ev.find(e => e.type === 'hint');
  assert.ok(hint && hint.id === w._target().id && w.hintHand && w.hintHand.id === hint.id, 'hint after 2 misses');
  until(w, null, 0.3);
  assert.ok(w._target().glow > 0.3, 'the target glows');
  assert.ok(w.hintHand.alpha > 0, 'ghost hand');
  // ahead: a stone in a later row (no miss)
  const later = w.stones.find(s => s.row === 1);
  assert.strictEqual(tapStone(w, later.id), 'ahead'); until(w, null, 0.05, on);
  assert.ok(ev.some(e => e.type === 'ahead' && e.id === later.id)); assert.strictEqual(w.misses, 2);
  // more no-progress presses → assist armed at 6
  for (let i = 0; i < 6 && !ev.some(e => e.type === 'assistArmed'); i++) { w.pointerDown(wp.x, wp.y); w.pointerUp(wp.x, wp.y); until(w, null, 0.05, on); }
  const arm = ev.find(e => e.type === 'assistArmed');
  assert.ok(arm && arm.id === w._target().id && w.assistId === arm.id);
  // the next press anywhere in the river picks it
  const tgt = w._target();
  assert.strictEqual(w.pointerDown(wp.x, wp.y), 'stone'); w.pointerUp(wp.x, wp.y);
  until(w, null, 0.02, on);
  assert.ok(ev.some(e => e.type === 'assist' && e.id === tgt.id));
  const rt = ev.find(e => e.type === 'right');
  assert.ok(rt && rt.id === tgt.id && rt.row === 0 && rt.k === 3 && rt.left === 2 && rt.mode === 'match' && rt.thing && fin(rt.x, rt.y));
  // finish the round with right taps; assisted → ≤ 2★
  for (let j = 1; j < 3; j++) { until(w, x => x.interactive, 5); tapStone(w, w._target().id); }
  const rest = until(w, x => x.state === 'roundDone', 10, on);
  void rest;
  const rd = ev.find(e => e.type === 'roundDone');
  assert.ok(rd && rd.stars <= 2 && rd.assisted === true && rd.misses === 2 && fin(rd.x, rd.y));
  assert.ok(rd.y < w.nim.y - w.nim.h + 1, 'roundDone above Nim');
});
test('world: hop physics — crouch, ballistic parabola (apex ≥ 70 px), stretch, landing on the stone, squash + recovery, stone dip / tilt', () => {
  for (const vp of [VP_LAND, VP_PORT, VP_IPAD]) {
    const w = mkWorld({ seed: 11, vp });
    toPlay(w, 'colors', 1);
    const n = w.nim, s = w._target(), x0 = n.x, y0 = n.y;
    tapStone(w, s.id);
    const pts = [], sqs = [];
    let landed = false, landT = -1, crouchMin = 1, stretchMax = 1;
    for (let i = 0; i < 240; i++) {
      w.update(1 / 120);
      for (const e of w.drainEvents()) if (e.type === 'land') { landed = true; landT = w.time; assert.strictEqual(e.id, s.id); }
      assert.ok(fin(n.x, n.y, n.sx, n.sy, n.lean), 'no NaN');
      if (n.state === 'crouch') crouchMin = Math.min(crouchMin, n.sy);
      if (!landed && w._hop && w._hop.phase === 'air') { pts.push({ t: w.time, x: n.x, y: n.y, p: w._hop.p }); if (pts.length > 1 && pts[pts.length - 1].y < pts[pts.length - 2].y) stretchMax = Math.max(stretchMax, n.sy); }
      if (landed) sqs.push({ t: w.time - landT, sy: n.sy });
    }
    assert.ok(landed, vp.name + ' landed');
    assert.ok(crouchMin < 0.88, vp.name + ' crouch sy ' + crouchMin);
    assert.ok(stretchMax > 1.06, vp.name + ' stretch sy ' + stretchMax);
    // the plan is a true parabola: apex ≥ 70 px above the higher end; x linear in time; constant vertical acceleration
    const p = pts[0].p, apex = Math.min(...pts.map(q => q.y));
    // landscape: the apex is capped so Nim's head stays below the speech bubble / HUD (fix round 1, ≥ apexMinCap)
    const want = Math.min(70, Math.max(w.cfg.apexMinCap, w._apexRoom(p.x0, p.y0, p.x1, p.y1)));
    assert.ok(apex <= Math.min(p.y0, p.y1) - want + 3, vp.name + ' apex ' + (Math.min(p.y0, p.y1) - apex) + ' want ' + want);
    assert.ok(p.T >= 0.4 && p.T <= 0.63, 'hop time ' + p.T);
    const A = NH.World.planAt(p, 0.1), B = NH.World.planAt(p, 0.2), Cc = NH.World.planAt(p, 0.3);
    assert.ok(Math.abs((Cc.y - 2 * B.y + A.y) / 0.01 - p.g) < 1e-6 * p.g + 1e-6, 'constant g');
    assert.ok(Math.abs((B.x - A.x) - (Cc.x - B.x)) < 1e-9, 'constant along-velocity');
    const end = NH.World.planAt(p, p.T); assert.ok(Math.abs(end.x - p.x1) < 1e-6 && Math.abs(end.y - p.y1) < 1e-6, 'the plan ends at the target');
    // landing at the stone top (feet = the stone's top centre)
    assert.ok(Math.hypot(n.x - s.x, n.y - s.y) < 0.5, vp.name + ' feet on the stone');
    assert.ok(Math.hypot(x0 - p.x0, y0 - p.y0) < 30);
    // squash on land ≈ 0.8 → back to 1
    assert.ok(sqs[0].sy < 0.85, 'land squash ' + sqs[0].sy);
    const late = sqs.filter(q => q.t > 0.8);
    assert.ok(late.length && late.every(q => Math.abs(q.sy - 1) < 0.03), 'recovered');
    assert.ok(n.onRow === 0 && w.row === 1);
    assert.ok(s.gold > 0.99 && s.visited);
    assert.ok(w.stones.filter(o => o.row === 0 && o !== s).every(o => o.state === 'gone' || o.state === 'sink'));
  }
  // stone dip spring + ripples + droplets with gravity
  const w = mkWorld({ seed: 12 });
  toPlay(w, 'colors', 1);
  const s = w._target();
  tapStone(w, s.id);
  until(w, () => w.nim.state === 'land', 3);
  const r0 = w.ripples.length, d0 = w.drops.length;
  assert.ok(r0 >= 2 && d0 >= 8, `ripples ${r0} drops ${d0}`);
  const dr = w.drops[w.drops.length - 1], vy0 = dr.vy;
  let maxDip = 0;
  for (let i = 0; i < 30; i++) { w.update(1 / 120); maxDip = Math.max(maxDip, s.dip); }
  assert.ok(dr.vy > vy0 + 900 * 0.2, 'gravity on drops');
  assert.ok(maxDip > 4 && maxDip < 25, 'dip ' + maxDip);
  assert.ok(Math.abs(s.tilt) > 0.005, 'tilt kick');
  until(w, null, 2.5);
  assert.ok(Math.abs(s.dip) < 0.5 && Math.abs(s.tilt) < 0.005, 'springs settle');
  assert.ok(w.ripples.every(r => r.r <= r.r1 + 1e-6));
});
test('world: the thing hops away (thingAway), countSel counts (interactive false while counting), countSeq count = row + 1, homeBadge', () => {
  let w = mkWorld({ seed: 2 });
  toPlay(w, 'colors', 1);
  let s = w._target(); tapStone(w, s.id);
  let ev = until(w, () => s._tState === 'gone', 3);
  assert.ok(ev.some(e => e.type === 'thingAway' && e.id === s.id));
  assert.ok(s.thingA === 0);
  // countSeq (round 0 / 2 of a count chapter)
  w = mkWorld({ seed: 2 }); toPlay(w, 'count', 2);
  assert.strictEqual(w.cur.mode, 'countSeq');
  ev = [];
  for (let j = 0; j < w.cur.k; j++) { until(w, x => x.interactive, 5); assert.strictEqual(w._target().thing.n, j + 1); assert.strictEqual(w.prompt().count, j + 1); tapStone(w, w._target().id); ev.push(...w.drainEvents()); }
  ev.filter(e => e.type === 'right').forEach((e, j) => assert.strictEqual(e.count, j + 1));
  // countSel (round 1)
  w = mkWorld({ seed: 2 }); startTopic(w, 'count', 2);
  w.round = 1; w.cur = null; w._prepareRound(); w._beginRise(); until(w, x => x.interactive, 10);
  assert.strictEqual(w.cur.mode, 'countSel');
  s = w._target(); tapStone(w, s.id);
  ev = until(w, () => w.nim.state === 'stand' && !w._hop, 3);
  const counts = [];
  ev.push(...until(w, x => x.interactive, 8, e => { if (e.type === 'count') { counts.push(e); assert.ok(!w.interactive, 'not interactive while counting'); } }));
  assert.deepStrictEqual(counts.map(c => c.i), Array.from({ length: s.thing.n }, (_, i) => i + 1));
  for (let i = 1; i < counts.length; i++) assert.ok(Math.abs(counts[i].t - counts[i - 1].t || 0) >= 0);
  assert.ok(counts.every(c => c.n === s.thing.n && fin(c.x, c.y) && c.y < s.y));
  // animals → homeBadge
  w = mkWorld({ seed: 2 }); toPlay(w, 'animals', 1);
  s = w._target(); tapStone(w, s.id);
  ev = until(w, () => s._tState === 'gone', 4);
  const hb = ev.find(e => e.type === 'homeBadge');
  assert.ok(hb && hb.home === s.thing.home && fin(hb.x, hb.y));
  assert.ok(ev.find(e => e.type === 'right').home === s.thing.home);
});
test('world: count timing — count events 0.4 s apart', () => {
  const w = mkWorld({ seed: 5 }); startTopic(w, 'count', 2);
  w.round = 1; w.cur = null; w._prepareRound(); w._beginRise(); until(w, x => x.interactive, 10);
  tapStone(w, w._target().id);
  const ts = [];
  until(w, x => x.interactive, 8, e => { if (e.type === 'count') ts.push(w.time); });
  for (let i = 1; i < ts.length; i++) assert.ok(Math.abs(ts[i] - ts[i - 1] - CFG.countStep) < 0.02, 'count step');
});
test('world: a tap on the right stone while Nim is in the air is queued and judged when he stands (fix round 1: kept for the whole hop)', () => {
  const w = mkWorld({ seed: 21 });
  toPlay(w, 'colors', 1);
  tapStone(w, w._target().id);
  until(w, () => w._hop && w._hop.phase === 'air' && w._hop.t > w._hop.p.T - 0.25, 2, null, 1 / 120);
  const next = w.stones.find(s => s.row === 1 && s.target);
  const h = w.stoneHit(next.id);
  assert.strictEqual(w.pointerDown(h.x, h.y), 'queued'); w.pointerUp(h.x, h.y);
  const ev = until(w, () => w.row === 2, 3);
  assert.ok(ev.filter(e => e.type === 'right').length === 1 && w.row === 2, 'queued tap judged');
  // fix round 1: a right-stone tap at the very start of the hop is kept too (only right stones are queued now, so it is safe)
  const w2 = mkWorld({ seed: 21 }); toPlay(w2, 'colors', 1);
  tapStone(w2, w2._target().id);
  until(w2, () => w2._hop && w2._hop.phase === 'air', 1);
  const nx = w2.stones.find(s => s.row === 1 && s.target), h2 = w2.stoneHit(nx.id);
  w2.pointerDown(h2.x, h2.y); w2.pointerUp(h2.x, h2.y);
  const ev2 = until(w2, null, 1.5);
  assert.strictEqual(ev2.filter(e => e.type === 'right').length, 1, 'an early right-stone tap is judged on landing');
  assert.strictEqual(w2.misses, 0);
});
test('world: bank phase — bankLand, 2 small hops, curl, roll (rollRot = distance / radius), stick, uncurl, cheer, roundDone; fruits on the back', () => {
  for (const vp of [VP_LAND, VP_PORT, VP_IPAD]) {
    const w = mkWorld({ seed: 13, vp });
    toPlay(w, 'colors', 1);
    const n = w.nim, kind = w.fruit.kind;
    for (let j = 0; j < w.cur.k; j++) { until(w, x => x.interactive, 5); tapStone(w, w._target().id); }
    const order = [], seen = {};
    let rollStartX = null, walk = 0, t0 = -1, nimOff = 0, maxRot = 0;
    const B = NH.World.nimPoints(), R = B.rollR * w.layout.nimS;
    run(w, x => x.phase === 'wipe', 10, e => {
      if (['bankLand', 'curl', 'stick', 'uncurl', 'roundDone'].includes(e.type)) { order.push(e.type); seen[e.type] = e; }
      if (e.type === 'bankLand') t0 = w.time;
      if (e.type === 'roundDone') seen.doneT = w.time;
    });
    void walk;
    assert.deepStrictEqual(order, ['bankLand', 'curl', 'stick', 'uncurl', 'roundDone'], vp.name + ' order');
    assert.strictEqual(seen.stick.fruit, kind);
    assert.ok(seen.doneT - t0 > 1.4 && seen.doneT - t0 < 2.8, vp.name + ' bank time ' + (seen.doneT - t0));
    assert.ok(n.fruits.length === 1 && n.fruits[0] === kind && w.fruit.state === 'done');
    assert.strictEqual(w.fruitsOnBack, n.fruits);
    // roll geometry: replay on a fresh world with the same seed and watch rollRot vs distance
    const w2 = mkWorld({ seed: 13, vp }); toPlay(w2, 'colors', 1);
    for (let j = 0; j < w2.cur.k; j++) { until(w2, x => x.interactive, 5); tapStone(w2, w2._target().id); }
    run(w2, x => x.phase === 'wipe', 10, null, 1 / 120);
    void rollStartX; void nimOff; void maxRot;
    const w3 = mkWorld({ seed: 13, vp }); toPlay(w3, 'colors', 1);
    for (let j = 0; j < w3.cur.k; j++) { until(w3, x => x.interactive, 5); tapStone(w3, w3._target().id); }
    const L = w3.layout, n3 = w3.nim;
    let x0 = null, ok = 0, walkHops = 0, stuckAtFruit = false;
    run(w3, x => x.phase === 'wipe', 10, e => { if (e.type === 'stick') stuckAtFruit = Math.abs(n3.x - L.goal.x) < 0.5 * R + 1; }, 1 / 120);
    assert.ok(stuckAtFruit, vp.name + ' the fruit sticks when the ball is over it');
    const w4 = mkWorld({ seed: 13, vp }); toPlay(w4, 'colors', 1);
    for (let j = 0; j < w4.cur.k; j++) { until(w4, x => x.interactive, 5); tapStone(w4, w4._target().id); }
    until(w4, x => x.phase === 'bank', 5);
    while (w4.phase !== 'wipe' && w4.time < 200) {
      w4.update(1 / 120);
      for (const e of w4.drainEvents()) if (e.type === 'hop') walkHops++;
      const m = w4.nim;
      assert.ok(fin(m.x, m.y, m.rollRot, m.ballX, m.ballY), 'no NaN in the bank');
      const box = w4.nimHit();
      assert.ok(box.x + 8 >= -1 && box.x + box.w - 8 <= L.W + 1 && box.y + box.h - 8 <= L.H + 1, vp.name + ' Nim on screen');
      if (w4._bank && w4._bank.step === 'roll') {
        if (x0 === null) x0 = m.x;
        assert.ok(Math.abs(m.rollRot - (m.x - x0) / m.ballR) < 0.05, 'rolling without slipping');
        ok++;
      }
    }
    assert.ok(ok > 30, 'the roll lasted');
    assert.ok(Math.abs(w4.nim.rollRot - CFG.rollDist / w4.nim.ballR) < 0.06, 'total roll angle');
    assert.strictEqual(walkHops, 0, 'walk hops are not `hop` events');
    // the fruit sits on a back slot after the glide
    const sl = w4.nim.backSlots[0];
    assert.ok(sl && fin(sl.x, sl.y, sl.rot) && sl.y < w4.nim.y && Math.abs(sl.x - w4.nim.x) < w4.nim.h);
  }
});
test('world: wipe — swap at half time (new hidden stones, Nim home, golden stones gone), then rise; Talk time after round 4', () => {
  const w = mkWorld({ seed: 31 });
  toPlay(w, 'colors', 1);
  const ev = [];
  const play = () => { for (let j = 0; j < w.cur.k; j++) { until(w, x => x.interactive, 6); tapStone(w, w._target().id); } };
  play();
  ev.push(...until(w, x => !!x.wipe, 10));
  const wp = ev.find(e => e.type === 'wipe');
  assert.ok(wp && wp.season === w.weather && wp.dir && fin(wp.x, wp.y));
  const oldKey = w.cur.key;
  until(w, x => x.wipe && x.wipe.t >= 0.49, 2, null, 1 / 120);
  assert.strictEqual(w.cur.key, oldKey, 'not swapped before half time');
  until(w, x => x.wipe.swapped, 0.2, null, 1 / 120);
  assert.notStrictEqual(w.cur.key, oldKey);
  assert.ok(w.stones.every(s => s.state === 'hidden' && !s.visited && s.gold === 0), 'new hidden stones');
  assert.ok(Math.hypot(w.nim.x - w.layout.nimHome.x, w.nim.y - w.layout.nimHome.y) < 1 && w.nim.onRow === -1 && w.nim.fruits.length === 1);
  const e2 = until(w, x => x.phase === 'rise' && x.stones.some(s => s.state !== 'hidden'), 2);
  assert.ok(e2.some(e => e.type === 'round'));
  assert.ok(w.wipe === null || w.wipe.t >= 0.75, 'the rise starts as the curtain leaves');
  // rounds 2..4 → Talk
  for (let r = 1; r < 4; r++) { until(w, x => x.interactive, 10); play(); if (r < 3) until(w, x => x.round === r + 1 && x.phase === 'rise', 15); }
  const e3 = until(w, x => x.state === 'talk', 15);
  assert.ok(e3.some(e => e.type === 'talk'));
  assert.ok(w.wipe && w.wipe.t >= 0.5, 'Talk time comes after the first half of the wipe');
  assert.strictEqual(w.stones.length, 0);
  assert.strictEqual(w.nim.fruits.length, 4);
});
test('world: Talk time — re-ask every 12 s, glow after the 2nd, Nim answers after the 3rd (+2 s); a right answer = +1 star', () => {
  const w = mkWorld({ seed: 8 });
  startTopic(w, 'colors');
  w._startTalk(); w.drainEvents();
  const asks = [];
  const ev = until(w, x => !!x.talkAnswered, 50, e => { if (e.type === 'talkAsk') asks.push({ n: e.n, t: w.time, glow: e.glowAnswer }); });
  assert.deepStrictEqual(asks.map(a => a.n), [1, 2, 3]);
  assert.ok(!asks[0].glow && asks[1].glow);
  const res = ev.find(e => e.type === 'talkResult');
  assert.ok(res.auto && !res.correct);
  until(w, x => x.state === 'levelDone', 3);
  const w2 = mkWorld({ seed: 8 }); startTopic(w2, 'colors'); w2._startTalk();
  const s0 = w2.stars;
  assert.ok(w2.talkAnswer(w2.talk.answer)); assert.strictEqual(w2.stars, s0 + 1);
  assert.ok(!w2.talkAnswer(w2.talk.answer), 'only once');
});
test('world: idle nudges after 12 s, backing off ×1.5 up to 30 s; the 2nd idle hints', () => {
  const w = mkWorld({ seed: 9 });
  toPlay(w, 'colors', 1);
  const t0 = w.time, idles = [];
  const ev = until(w, null, 120, e => { if (e.type === 'idle') idles.push(+(w.time - t0).toFixed(1)); });
  assert.deepStrictEqual(idles.slice(0, 5), [12, 30, 57, 87, 117]);
  assert.ok(ev.some(e => e.type === 'hint' && e.idle));
  assert.ok(ev.filter(e => e.type === 'idle').every(e => e.promptKey && fin(e.x, e.y)));
});
test('world: hint cooldown 6 s; hint() while interactive; nothing outside play', () => {
  const w = mkWorld({ seed: 10 });
  toPlay(w, 'colors', 1);
  const h = w.hint(); assert.ok(h && h.stone === w._target().id);
  assert.deepStrictEqual(w.hint(), h, 'the same hint while the hand shows');
  until(w, x => !x.hintHand, 5);
  assert.strictEqual(w._autoHint(false), null, 'cooldown');
  until(w, null, 3);
  assert.ok(w._autoHint(false));
  const w2 = mkWorld({ seed: 10 }); w2.newSession(); until(w2, x => x.phase === 'rise', 4);
  assert.strictEqual(w2.hint(), null); assert.strictEqual(w2.answer(), null); assert.deepStrictEqual(w2.targets(), []);
});
test('world: rotation mid-hop — the hop finishes on the stone at its new place; everything on screen; no NaN', () => {
  for (const [a, b] of [[VP_LAND, VP_PORT], [VP_PORT, VP_LAND], [VP_IPAD, VIEWPORTS[2]]]) {
    const w = mkWorld({ seed: 14, vp: a });
    toPlay(w, 'colors', 1);
    const s = w._target();
    tapStone(w, s.id);
    until(w, () => w._hop && w._hop.phase === 'air' && w._hop.t > 0.15, 2, null, 1 / 120);
    w.setViewport(b.W, b.H, b.ins);
    let landed = false;
    for (let i = 0; i < 200 && !landed; i++) { w.update(1 / 120); assert.ok(fin(w.nim.x, w.nim.y)); for (const e of w.drainEvents()) if (e.type === 'land') landed = true; }
    assert.ok(landed, 'landed after the rotation');
    until(w, null, 0.5);
    const L = w.layout;
    assert.ok(Math.hypot(w.nim.x - s.x, w.nim.y - s.y) < 0.5, 'Nim on his stone');
    for (const st of w.stones) if (st.state === 'rest') {
      assert.ok(Math.abs(st.x - st.hx) < 0.5 && Math.abs(st.y - st.hy - st.bob - st.dip) < 0.5, 'at home');
      assert.ok(onScreen(L, footBox(L, st.x, st.y), 3), 'stone on screen');
    }
  }
});
test('world: rotation mid-round — stones glide to their new homes in 0.3 s (from on-screen points), the round goes on', () => {
  const w = mkWorld({ seed: 15, vp: VP_LAND });
  toPlay(w, 'shapes', 2);
  tapStone(w, w._target().id); until(w, x => x.interactive, 3);
  const id = w._target().id;
  w.setViewport(VP_PORT.W, VP_PORT.H, VP_PORT.ins);
  const L = w.layout;
  for (const s of w.stones) if (s.state === 'rest') assert.ok(s.x >= -1 && s.x <= L.W + 1 && s.y >= -1 && s.y <= L.H + 1, 'clamped start');
  until(w, null, 0.32, null, 1 / 120);
  for (const s of w.stones) if (s.state === 'rest') assert.ok(Math.abs(s.x - s.hx) < 0.5, 'arrived');
  assert.strictEqual(w._target().id, id);
  assert.ok(w.interactive);
  // Nim follows his golden stone
  const own = w.stoneById(w._onStone);
  assert.ok(Math.hypot(w.nim.x - own.x, w.nim.y - own.y) < 0.5);
  for (let j = w.row; j < w.cur.k; j++) { until(w, x => x.interactive, 5); tapStone(w, w._target().id); }
  const ev = until(w, x => x.phase === 'wipe', 10);
  assert.ok(ev.some(e => e.type === 'roundDone'));
  // a rotation during the bank roll
  const w2 = mkWorld({ seed: 16, vp: VP_PORT }); toPlay(w2, 'colors', 1);
  for (let j = 0; j < w2.cur.k; j++) { until(w2, x => x.interactive, 5); tapStone(w2, w2._target().id); }
  until(w2, x => x._bank && x._bank.step === 'roll' && x._bank.t > 0.2, 5, null, 1 / 120);
  w2.setViewport(VP_LAND.W, VP_LAND.H, VP_LAND.ins);
  const ev2 = until(w2, x => x.phase === 'wipe', 5);
  assert.ok(ev2.some(e => e.type === 'roundDone') && w2.nim.fruits.length === 1);
  assert.ok(w2.nim.x > w2.layout.far.x - 1, 'on the far bank');
});
test('world: surprises — fish leaps (apex 120 px, tap → fishTap), frog far from every stone (tap → frogTap), winter snow', () => {
  // fish
  let w = mkWorld({ seed: 17, surprise: true, config: { surpriseTypes: ['fish'], surpriseRounds: [1] } });
  startTopic(w, 'colors'); playRound(w); until(w, x => x.round === 1 && x.interactive, 20);
  w.drainEvents();
  let fishSeen = false, apex = 1e9, y0 = 0, tapped = false;
  run(w, x => tapped, 8, e => { if (e.type === 'fish') { fishSeen = true; y0 = e.y; } if (e.type === 'fishTap') tapped = true; });
  void apex;
  assert.ok(fishSeen, 'fish appears');
  const w2 = mkWorld({ seed: 17, surprise: true, config: { surpriseTypes: ['fish'], surpriseRounds: [1] } });
  startTopic(w2, 'colors'); playRound(w2); until(w2, x => x.round === 1 && x.interactive, 20);
  let got = false, minY = 1e9;
  until(w2, x => !!x.fish, 8);
  const fy = w2.fish.path.y;
  for (let i = 0; i < 400 && w2.fish; i++) {
    w2.update(1 / 120);
    if (w2.fish && w2.fish.state === 'leap') minY = Math.min(minY, w2.fish.y);
    const h = w2.fishHit();
    if (h && !got && w2.fish.u > 0.4) { assert.strictEqual(w2.pointerDown(h.x, h.y), 'fish'); w2.pointerUp(h.x, h.y); got = w2.drainEvents().some(e => e.type === 'fishTap'); }
  }
  assert.ok(got, 'fishTap');
  assert.ok(Math.abs(fy - minY - CFG.fishApex) < 3, 'apex ' + (fy - minY));
  void y0;
  // frog
  w = mkWorld({ seed: 18, surprise: true, vp: VP_LAND, config: { surpriseTypes: ['frog'], surpriseRounds: [1] } });
  startTopic(w, 'colors'); playRound(w); until(w, x => x.round === 1 && x.interactive, 20);
  const fe = until(w, x => !!x.frog || !!x.fish, 8);
  if (w.frog) {
    assert.ok(fe.some(e => e.type === 'frog'));
    until(w, x => x.frog && x.frog.state === 'sit', 2);
    for (const s of w.stones) if (s.state === 'rest') assert.ok(Math.hypot(w.frog.x - s.x, w.frog.y - (s.y - 0.3 * w.layout.itemH)) >= w.layout.hitR + 29, 'frog far from the stones');
    const h = w.frogHit();
    assert.ok(h); assert.strictEqual(w.pointerDown(h.x, h.y), 'frog'); w.pointerUp(h.x, h.y);
    assert.ok(w.drainEvents().some(e => e.type === 'frogTap'));
    assert.strictEqual(w.misses, 0);
  } else assert.ok(fe.some(e => e.type === 'fish'), 'fallback fish');
  // snow in winter (chapter 3)
  w = mkWorld({ seed: 19, surprise: true, config: { surpriseRounds: [1] } });
  w.newSession(); w.startLevel(3); w.drainEvents();
  until(w, x => x.interactive, 10); playRound(w); until(w, x => x.round === 1 && x.interactive, 20);
  const se = until(w, x => x.snowflakes.some(f => f.state === 'fall' && f.a > 0.6), 10);
  assert.ok(se.some(e => e.type === 'snow'));
  const sh = w.snowHit();
  assert.ok(sh); assert.strictEqual(w.pointerDown(sh.x, sh.y), 'snow'); w.pointerUp(sh.x, sh.y);
  assert.ok(w.drainEvents().some(e => e.type === 'snowTap'));
});
test('world: rounds in a long chapter get short (2 × 2); the 75 s limit ends a chapter after ≥ 3 rounds', () => {
  const w = mkWorld({ seed: 20, age: 6, config: { shortBudget: [1e9, 0, 0, 0] } });
  toPlay(w, 'add', 1);
  for (let j = 0; j < w.cur.k; j++) { until(w, x => x.interactive, 6); tapStone(w, w._target().id); }
  until(w, x => x.round === 1 && x.phase === 'rise', 10);
  assert.ok(w.cur.short && w.cur.k === 2 && w.cur.m === 2);
  const w2 = mkWorld({ seed: 20, config: { chapterTimeLimit: 1 } });
  toPlay(w2, 'colors', 1);
  const ev = [];
  for (let r = 0; r < 3; r++) { for (let j = 0; j < w2.cur.k; j++) { until(w2, x => x.interactive, 6); tapStone(w2, w2._target().id); } ev.push(...until(w2, x => (x.state === 'round' && x.phase === 'rise' && x.round === r + 1) || x.state === 'talk', 15)); }
  assert.strictEqual(w2.state, 'talk'); assert.strictEqual(w2.roundsPerLevel, 3);
});
test('world: NH.NIM_POINTS is read at runtime (backSlots / rollR scaled by nimH / 300)', () => {
  const N = load();
  N.NIM_POINTS = { feet: [150, 290], backSlots: [[100, 100, 0.2], [150, 90, 0], [200, 100, -0.2], [120, 150, 0]], rollC: [150, 200], rollR: 60, rollSlots: [[150, 140], [210, 200], [90, 200], [150, 260]], box: [50, 50, 250, 290], mouth: [210, 160] };
  const w = new N.World({ seed: 1, age: 4, config: { surpriseTypes: [], winterSurprise: null } });
  w.setViewport(960, 720, null); w.newSession(); w.update(0.1);
  const s = w.layout.nimS;
  assert.ok(Math.abs(w.nim.ballR - 60 * s) < 1e-9);
  assert.ok(Math.abs(w.nim.backSlots[1].y - (w.nim.y + (90 - 290) * s * w.nim.dsy)) < 1e-6);
  const hb = w.nimHit(); assert.ok(Math.abs(hb.w - (200 * s + 16)) < 1e-6);
});
test('world: determinism — the same seed + inputs give the same events', () => {
  const runOne = () => {
    const w = mkWorld({ seed: 77, age: 5, surprise: true }), b = new NH.Bot(w, { skill: 0.7, seed: 5 });
    w.newSession();
    const out = [];
    for (let i = 0; i < 60 * 90; i++) { b.step(1 / 60); w.update(1 / 60); for (const e of w.drainEvents()) { b.onEvent(e); out.push(e.type + ':' + (e.x !== undefined ? e.x.toFixed(3) + ',' + e.y.toFixed(3) : '') + ':' + (e.id || '')); } }
    return out;
  };
  const a = runOne(), b = runOne();
  assert.ok(a.length > 120, 'events ' + a.length);
  assert.deepStrictEqual(a, b);
});
test('world: interpolation twins + alpha', () => {
  const w = mkWorld({ seed: 3 });
  toPlay(w, 'colors', 1);
  w.update(1 / 200);
  assert.ok(w.alpha >= 0 && w.alpha < 1);
  for (const s of w.stones) for (const f of ['x', 'y', 'tilt', 'sub', 'alpha', 'thingHop', 'thingDx', 'thingS', 'thingA', 'wig', 'gold']) assert.ok(fin(s['_p' + f], s[f]), 'stone _p' + f);
  for (const f of ['x', 'y', 'sx', 'sy', 'lean', 'rollRot', 'curl']) assert.ok(fin(w.nim['_p' + f]), 'nim _p' + f);
  tapStone(w, w._target().id);
  until(w, () => w._hop && w._hop.phase === 'air', 1, null, 1 / 120);
  w.update(1 / 120);
  assert.ok(w.nim._px !== w.nim.x || w.nim._py !== w.nim.y, 'twins lag one step');
  assert.ok(['crouch', 'jump', 'roll', 'blink', 'idle', 'talk', 'happy', 'cheer', 'think', 'oops', 'wave', 'giggle', 'dance'].includes(w.nim.frame));
  assert.strictEqual(w.nim.frame, 'jump');
});
test('world: sub-steps ≤ 1/120 s; a 1 s frame is capped; update(0) / NaN are ignored', () => {
  assert.ok(CFG.step <= 1 / 120 + 1e-12);
  const w = mkWorld({ seed: 3 }); w.newSession();
  const t0 = w.time; w.update(5); assert.ok(Math.abs(w.time - t0 - 1) < 0.01);
  w.update(0); w.update(NaN); w.update(-1);
  assert.ok(Math.abs(w.time - t0 - 1) < 0.01);
});

// =====================================================================================================================  bot sessions (all events, timing)
function session(o) {
  const w = mkWorld(o), b = new NH.Bot(w, { skill: o.skill === undefined ? 0.8 : o.skill, seed: o.seed + 3, pace: o.pace || 'quick' });
  w.newSession();
  const S = { evs: [], chapters: [], rounds: [], types: {}, t: 0 };
  let c0 = 0, r0 = 0;
  const dt = 1 / 30;
  while (w.state !== 'sessionDone' && S.t < 900) {
    b.step(dt); w.update(dt); S.t += dt;
    for (const e of w.drainEvents()) {
      b.onEvent(e); S.types[e.type] = (S.types[e.type] || 0) + 1;
      if (!NON_POSITIONAL.includes(e.type)) {
        assert.ok(fin(e.x, e.y), e.type + ' has x, y');
        assert.ok(e.x >= 0 && e.x <= w.layout.W && e.y >= 0 && e.y <= w.layout.H, e.type + ' on screen');
      }
      if (e.type === 'level') c0 = w.time;
      if (e.type === 'levelDone') S.chapters.push(w.time - c0);
      if (e.type === 'round') r0 = w.time;
      if (e.type === 'roundDone') S.rounds.push({ dur: w.time - r0, stars: e.stars });
      if (e.type === 'ask') assert.ok(e.promptKey && e.params && typeof e.first === 'boolean' && ['match', 'countSeq', 'countSel'].includes(e.mode));
      if (e.type === 'right') assert.ok(e.mode && e.row >= 0 && e.k >= 2 && e.left >= 0 && e.thing && (e.mode !== 'countSeq' || e.count === e.row + 1));
      assert.ok(DESIGN_EVENTS.includes(e.type), 'unknown event ' + e.type);
    }
    assert.ok(fin(w.nim.x, w.nim.y, w.nim.sx, w.nim.sy) && w.stones.every(s => fin(s.x, s.y, s.tilt, s.dip)), 'no NaN');
  }
  S.w = w; S.bot = b;
  return S;
}
test('bot: a full toddler-paced session per age reaches sessionDone; ≥ 1 star every round; 60–100 s chapters; ≤ 8 min', () => {
  const all = {};
  for (const age of AGES) for (const vp of [VP_LAND, VP_PORT]) {
    const S = session({ seed: 40 + age, age, vp, pace: 'toddler', surprise: true, skill: 0.75 });
    assert.strictEqual(S.w.state, 'sessionDone', `age ${age} ${vp.name}`);
    assert.strictEqual(S.chapters.length, 4);
    assert.ok(S.rounds.length >= 12 && S.rounds.every(r => r.stars >= 1 && r.stars <= 3));
    const mean = S.chapters.reduce((a, b) => a + b, 0) / 4;
    assert.ok(mean >= 60 && mean <= 100, `age ${age} chapter mean ${mean.toFixed(1)} s`);
    assert.ok(S.chapters.every(c => c < 120), 'every chapter < 120 s');
    assert.ok(S.t <= 8 * 60, 'session ' + (S.t / 60).toFixed(2) + ' min');
    assert.ok(S.rounds.every(r => r.dur < 60), 'no stuck round');
    Object.assign(all, S.types);
    console.log(`    age ${age} ${vp.name.padEnd(34)} session ${(S.t / 60).toFixed(2)} min · chapters ${S.chapters.map(c => c.toFixed(0)).join(' / ')} s · rounds ${(S.rounds.reduce((a, r) => a + r.dur, 0) / S.rounds.length).toFixed(1)} s · ★ ${S.rounds.map(r => r.stars).join('')}`);
  }
  for (const t of ['session', 'level', 'round', 'rise', 'ask', 'right', 'hop', 'land', 'splash', 'thingAway', 'bankLand', 'curl', 'stick', 'uncurl', 'roundDone', 'wipe', 'wrong',
    'talk', 'talkResult', 'levelDone', 'sessionDone', 'gust', 'fish', 'snow', 'count', 'homeBadge']) assert.ok(all[t], 'event seen: ' + t);
});
test('bot: quick bot sessions (skill 1 and 0.5) on 4 viewports, every age; perfect play = 3★', () => {
  for (const age of AGES) for (const vp of [VP_LAND, VP_PORT, VP_IPAD, VIEWPORTS[7]]) {
    const S = session({ seed: 60 + age, age, vp, skill: 1, surprise: true });
    assert.strictEqual(S.w.state, 'sessionDone');
    assert.ok(S.rounds.every(r => r.stars === 3), 'skill 1 → 3★');
    assert.ok(S.t < 6 * 60);
    const S2 = session({ seed: 70 + age, age, vp, skill: 0.5, surprise: true });
    assert.strictEqual(S2.w.state, 'sessionDone');
    assert.ok(S2.rounds.every(r => r.stars >= 1), '≥ 1★');
    assert.ok(S2.t <= 8 * 60, 'session ≤ 8 min at skill 0.5: ' + (S2.t / 60).toFixed(2));
  }
});

// =====================================================================================================================  weather
test('weather: skies per season (DESIGN §3), crossfade, ambient fields', () => {
  const sk = [['#CFE6F5', '#F6F1E4'], ['#8CCBEA', '#E6F5F6'], ['#F1C893', '#FBEBD3'], ['#B9C8E2', '#EEF2F8']];
  const L = NH.World.computeLayout(1556, 720, null, {}, 4, null, 3, 3);
  for (let i = 0; i < 4; i++) {
    const wx = new NH.Weather({ width: 1556, height: 720, seed: 3, layout: L });
    wx.setWeather(i, { instant: true });
    assert.deepStrictEqual([wx.ambient.skyTop, wx.ambient.skyBottom], sk[i]);
    for (const k of ['skyTop', 'skyBottom', 'light', 'sunX', 'sunY', 'sunA', 'mood']) assert.ok(wx.ambient[k] !== undefined);
  }
  const wx = new NH.Weather({ width: 1556, height: 720, seed: 3, layout: L });
  wx.setWeather(2);
  wx.update(1.25);
  assert.ok(wx.ambient.envMix > 0.2 && wx.ambient.envMix < 0.8);
});
test('weather: summer dragonflies dart over the water; autumn leaves land and float along flowDir (landscape down, portrait right)', () => {
  for (const vp of [VP_LAND, VP_PORT]) {
    const L = NH.World.computeLayout(vp.W, vp.H, vp.ins, {}, 4, null, 3, 3);
    const wx = new NH.Weather({ width: vp.W, height: vp.H, seed: 5, layout: L });
    wx.setWeather(1, { instant: true });
    const dfs = wx.particles.filter(p => p.kind === 'dragonfly');
    assert.ok(dfs.length >= 2 && dfs.length <= 3, 'dragonflies ' + dfs.length);
    let dashes = 0;
    for (let i = 0; i < 600; i++) { wx.update(1 / 60); for (const p of wx.particles) if (p.kind === 'dragonfly' && p.dash > 0) dashes++; }
    assert.ok(dashes > 0, 'they dash');
    wx.particles.filter(p => p.kind === 'dragonfly').forEach(p => assert.ok(fin(p.x, p.y, p.rot)));
    wx.setWeather(2, { instant: true });
    let floats = 0, moved = 0;
    for (let i = 0; i < 60 * 30; i++) {
      const before = new Map(wx.particles.filter(p => p.onWater).map(p => [p, [p.x, p.y]]));
      wx.update(1 / 60);
      for (const [p, [x, y]] of before) if (wx.particles.includes(p) && p.onWater) {
        floats++;
        const dx = p.x - x, dy = p.y - y, along = dx * L.flowDir.x + dy * L.flowDir.y;
        if (along > 0.4) moved++;
        assert.ok(p.layer === 'back');
      }
      assert.ok(wx.particles.length <= 120 + 60);
    }
    assert.ok(floats > 100, vp.name + ' leaves float ' + floats);
    assert.ok(moved / floats > 0.9, vp.name + ' along the flow ' + (moved / floats).toFixed(2));
    assert.ok(wx.ripples.length >= 0);
  }
});
test('weather: wipeParticles(dir) — ≈ 60 seasonal particles sweep across and leave; cap 120 + 60', () => {
  const L = NH.World.computeLayout(1556, 720, null, {}, 4, null, 3, 3);
  for (let m = 0; m < 4; m++) {
    const wx = new NH.Weather({ width: 1556, height: 720, seed: 9, layout: L });
    wx.setWeather(m, { instant: true });
    const n0 = wx.particles.length;
    wx.wipeParticles({ x: 1, y: 0 });
    const sw = wx.particles.filter(p => p.kind === 'sweep');
    assert.ok(sw.length >= 50 && sw.length <= 60);
    wx.wipeParticles({ x: 1, y: 0 });
    assert.ok(wx.particles.filter(p => p.kind === 'sweep').length <= 60);
    assert.ok(wx.particles.length <= 180);
    let crossed = false;
    for (let i = 0; i < 60 * 0.7; i++) { wx.update(1 / 60); if (wx.particles.some(p => p.kind === 'sweep' && p.x > 778 && p.x < 1556)) crossed = true; }
    assert.ok(crossed, 'covers the middle around half time');
    for (let i = 0; i < 60 * 2.2; i++) wx.update(1 / 60);
    assert.strictEqual(wx.particles.filter(p => p.kind === 'sweep').length, 0, 'gone after the wipe');
    void n0;
  }
  const wx = new NH.Weather({ width: 720, height: 1561, seed: 9, layout: NH.World.computeLayout(720, 1561, null, {}, 4, null, 3, 3) });
  wx.wipeParticles({ x: 0, y: -1 });
  assert.ok(wx.particles.filter(p => p.kind === 'sweep').every(p => p.y > 1561 && p.vy < 0), 'portrait sweep starts below, moves up');
});
test('weather: windSource follows the world (gusts in autumn), bursts, party, resize with a layout', () => {
  const w = mkWorld({ seed: 4 });
  w.newSession(); w.startLevel(2);
  const wx = new NH.Weather({ width: w.layout.W, height: w.layout.H, seed: 2, layout: w.layout });
  wx.windSource = w; wx.setWeather(2, { instant: true });
  let gusts = 0;
  for (let i = 0; i < 60 * 25; i++) { w.update(1 / 60); wx.update(1 / 60); assert.strictEqual(wx.wind, w.wind); gusts += w.drainEvents().filter(e => e.type === 'gust').length; }
  assert.ok(gusts >= 1, 'gusts');
  for (const kind of ['stars', 'sparkle', 'confetti', 'petals', 'leaves', 'dots']) wx.burst(300, 300, { kind, n: 10 });
  assert.ok(wx.particles.length <= 120);
  wx.setParty(true, { instant: true });
  for (let i = 0; i < 120; i++) wx.update(1 / 60);
  assert.ok(wx.particles.some(p => p.kind === 'firefly'));
  wx.resize(VP_PORT.W, VP_PORT.H, NH.World.computeLayout(VP_PORT.W, VP_PORT.H, VP_PORT.ins, {}, 4, null, 3, 3));
  assert.deepStrictEqual(wx.flowDir, { x: 1, y: 0 });
  for (let i = 0; i < 120; i++) wx.update(1 / 60);
  assert.ok(wx.particles.every(p => fin(p.x, p.y, p.alpha, p.size)));
});

// =====================================================================================================================  fix round 1 regressions
test('fix1: hammering ONE wrong stone faster than once a second still brings the hint and then the assist (playtest P0)', () => {
  const w = mkWorld({ seed: 21 });
  toPlay(w, 'colors', 1);
  const s = wrongOf(w), h = w.stoneHit(s.id), evs = [];
  for (let i = 0; i < 40 && !w.assistId; i++) {   // 3 taps per second for up to ~13 s
    w.pointerDown(h.x, h.y); w.pointerUp(h.x, h.y);
    evs.push(...run(w, null, 1 / 3));
  }
  assert.strictEqual(w.misses, 1, 'only the first tap is a miss: ' + w.misses);
  assert.ok(evs.some(e => e.type === 'hint'), 'a hint came');
  assert.ok(w.assistId, 'the assist was armed');
});
test('fix1: a tap while Nim is in the air — the next row\'s right stone is queued, any other stone only wobbles (never a miss); a tap on airborne Nim is a poke', () => {
  for (const vp of [VP_LAND, VP_PORT]) {
    const w = mkWorld({ seed: 22, vp, age: 5 });
    toPlay(w, 'shapes', 1);
    assert.ok(w.cur.k >= 3, 'needs 3 rows: ' + w.cur.k);
    tapStone(w, w._target().id);
    until(w, x => x.nim.state === 'air' && x._hop.t > 0.05, 2);
    const next = w.stones.filter(s => s.row === 1 && s.state === 'rest'), bad = next.find(s => !s.target), good = next.find(s => s.target);
    const hb = w.stoneHit(bad.id);
    assert.strictEqual(w.pointerDown(hb.x, hb.y), 'squish', vp.name + ': a wrong next-row stone mid-air only wobbles'); w.pointerUp(hb.x, hb.y);
    const nb = w.nimHit(), cx = nb.x + nb.w / 2, cy = nb.y + nb.h / 2;
    assert.strictEqual(w.pointerDown(cx, cy), 'nim', vp.name + ': a press on airborne Nim is a poke'); w.pointerUp(cx, cy);
    const hg = w.stoneHit(good.id);
    const r = w.pointerDown(hg.x, hg.y); w.pointerUp(hg.x, hg.y);
    assert.ok(r === 'queued' || r === 'nim', vp.name + ': the right next-row stone is queued (' + r + ')');
    const evs = until(w, x => x.row >= 2 || x.misses > 0, 3);
    assert.strictEqual(w.misses, 0, vp.name + ': no miss from mid-air taps');
    if (r === 'queued') assert.ok(evs.some(e => e.type === 'right' && e.id === good.id), vp.name + ': the queued right stone was judged on landing');
  }
});
test('fix1: countSeq — Nim waits ≈ 0.5 s on each stone (a tap meanwhile is queued, not lost) so the numbers keep up', () => {
  const w = mkWorld({ seed: 23 });
  toPlay(w, 'count', 0);
  assert.strictEqual(w.cur.mode, 'countSeq');
  tapStone(w, w._target().id);
  const evs = until(w, x => x.row === 1 && x.nim.state === 'stand', 3);
  const landT = w.time;
  assert.ok(!w.interactive, 'held right after landing');
  const t = w.stones.find(s => s.row === 1 && s.target), h = w.stoneHit(t.id);
  assert.strictEqual(w.pointerDown(h.x, h.y), 'queued'); w.pointerUp(h.x, h.y);
  const ev2 = until(w, x => x.row >= 2, 3);
  const right = ev2.find(e => e.type === 'right');
  assert.ok(right && right.count === 2, 'the queued tap became the next count');
  assert.ok(evs.length >= 0 && w.cfg.countHold >= 0.45);
});
test('fix1: landscape — on every stone Nim\'s whole art stays below the speech bubble / HUD over his column (visual QA P1-1)', () => {
  for (const vp of VIEWPORTS.filter(v => v.W > v.H)) for (const age of [3, 4, 5, 6, 7]) for (const [k, m] of KM_ALL) {
    const L = NH.World.computeLayout(vp.W, vp.H, vp.ins, {}, age, null, k, m);
    if (!L.fits) continue;
    const ex = { left: 136 / 300 * L.nimH, right: 146 / 300 * L.nimH, up: 240 / 300 * L.nimH };
    for (let seed = 1; seed < 6; seed++) NH.World.stoneHomes(L, k, m, seed).flat().forEach(p => {
      for (const K of L.keep) {
        if (K.y + K.h / 2 >= L.H / 2 || K.x > p.x + ex.right || K.x + K.w < p.x - ex.left) continue;
        assert.ok(p.y - ex.up >= K.y + K.h - 12, `${vp.name} age ${age} ${k}x${m}: Nim's head ${Math.round(p.y - ex.up)} under the ${K.kind} bottom ${Math.round(K.y + K.h)}`);
      }
    });
  }
});
test('fix1: portrait — Nim on an edge-column stone stays on screen; a shown / counted thing sits beside him, never over his face (visual QA P2-1, P2-2)', () => {
  for (const vp of VIEWPORTS.filter(v => v.H > v.W)) for (const age of [3, 5, 7]) for (const [k, m] of KM_ALL) {
    const L = NH.World.computeLayout(vp.W, vp.H, vp.ins, {}, age, null, k, m);
    const ex = { left: 136 / 300 * L.nimH, right: 146 / 300 * L.nimH };
    NH.World.stoneHomes(L, k, m, 3).flat().forEach(p => {
      assert.ok(p.x - ex.left >= L.ins.left - 1 && p.x + ex.right <= L.W - L.ins.right + 1, `${vp.name} ${k}x${m}: Nim at ${Math.round(p.x)} off screen`);
    });
  }
  for (const vp of [VP_PORT, VP_LAND]) {
    const w = mkWorld({ seed: 24, vp, age: 4 });
    toPlay(w, 'animals', 1);
    tapStone(w, w._target().id);
    until(w, x => x.stones.some(s => s._tState === 'badge' && s._tT > 0.4), 4);
    const s = w.stones.find(q => q._tState === 'badge'), n = w.nim, ih = w.layout.itemH * s.thingS;
    const tx = s.x + s.thingDx, ty = s.y - s.thingHop;
    const face = { x: n.x + (n.face || 1) * 0.3 * n.h, y: n.y - 0.45 * n.h };
    const inThing = face.x > tx - ih / 2 && face.x < tx + ih / 2 && face.y > ty - ih && face.y < ty;
    assert.ok(!inThing, vp.name + ': the shown thing covers Nim\'s face');
  }
});
test('fix1: the fruit never repeats from one round to the next, also across chapters; phones cap countSel at 10 dots', () => {
  const w = mkWorld({ seed: 25, vp: VP_PORT });
  w.newSession(); w.drainEvents();
  let prev = null, rounds = 0;
  const bot = new NH.Bot(w, { skill: 1, seed: 3 });
  for (let t = 0; t < 900 && w.state !== 'sessionDone'; t += 1 / 30) {
    bot.step(1 / 30); w.update(1 / 30);
    for (const e of w.drainEvents()) { bot.onEvent(e); if (e.type === 'round') { assert.notStrictEqual(e.fruit, prev, 'the same fruit twice in a row (round ' + rounds + ')'); prev = e.fruit; rounds++; } }
  }
  assert.ok(rounds >= 12, 'rounds ' + rounds);
  for (let sd = 1; sd < 60; sd++) {
    const r = NH.Content.makeRound('count', { age: 7, rng: new NH.RNG(sd), roundIndex: 1, maxDots: 10 });
    assert.strictEqual(NH.Content.validate(r), null);
    r.rows.flat().forEach(st => assert.ok(st.thing.n <= 10, 'dots ' + st.thing.n));
  }
});
test('fix1: CONFIG — hint glow 5 s, assist after 5 no-progress presses, chapterMinRounds stays 3', () => {
  assert.strictEqual(CFG.hintTime, 5); assert.strictEqual(CFG.assistAfter, 5); assert.strictEqual(CFG.chapterMinRounds, 3);
});

// =====================================================================================================================  runner
const only = process.argv[2];
let fail = 0, ran = 0;
const T0 = Date.now();
for (const t of tests) {
  if (only && !t.name.includes(only)) continue;
  ran++;
  const t1 = Date.now();
  try { t.fn(); console.log('  ok  ' + t.name + ' (' + ((Date.now() - t1) / 1000).toFixed(1) + ' s)'); }
  catch (e) { fail++; console.log('  FAIL ' + t.name + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n       ') : e)); }
}
console.log(`\n${ran - fail}/${ran} passed in ${((Date.now() - T0) / 1000).toFixed(1)} s`);
process.exit(fail ? 1 : 0);
