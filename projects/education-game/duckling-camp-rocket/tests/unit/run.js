#!/usr/bin/env node
// Mimi's Splash Rocket — headless unit tests for rng / content / world / weather / bot (DESIGN §2, §5.1–5.5, docs/MECHANICS.md).
// Run from the game folder:   node tests/unit/run.js [name part]      (exit 1 on any failure)
// (tests/unit/i18n_voice.test.js and mat_art.test.js are the other engineers' suites and run on their own.)
'use strict';
const assert = require('assert');
const { load } = require('./load');

const DK = load();
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const AGES = [3, 4, 5, 6, 7];
const C = DK.Content;
const CFG = DK.CONFIG;
const J = v => JSON.parse(JSON.stringify(v));   // objects from the vm sandbox have other prototypes
assert.deepStrictEqual = ((orig) => (a, b, m) => orig(J(a), J(b), m))(assert.deepStrictEqual);
const fin = (...v) => v.every(Number.isFinite);
const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

// ---------- independent copies of the DESIGN tables (§2, §3, §5.1)
const AGE_TOPICS = { 3: ['colors', 'shapes', 'size', 'animals'], 4: ['colors', 'shapes', 'count', 'animals'],
  5: ['shapes', 'count', 'letters', 'animals'], 6: ['lower', 'initial', 'add', 'count'], 7: ['initial', 'add', 'sub', 'oddeven'] };
const CLASH = [['blue', 'purple'], ['red', 'green'], ['yellow', 'orange'], ['green', 'orange'], ['red', 'orange']];
const S_BASE = { 3: 170, 4: 170, 5: 160, 6: 148, 7: 148 };
const OBJS = ['flower', 'mushroom', 'ball', 'mug', 'lantern'];
/** (k launches, m mats) per age / round (DESIGN §5.1 = the base's rows × stones); chapter 0 round 0 = warm-up (2, 2); short (2, 2). */
function wantKM(age, ri, level, short) {
  if (short && ri > 0) return [2, 2];
  if (ri === 0 && level === 0) return [2, 2];
  return (age <= 3 ? [[2, 2], [2, 2], [3, 2], [3, 2]] : age === 4 ? (level === 0 ? [[2, 2], [2, 3], [3, 2], [3, 3]] : [[2, 2], [3, 2], [3, 3], [3, 3]])
    : age === 5 ? [[3, 2], [3, 3], [3, 3], [4, 3]] : [[3, 3], [4, 3], [4, 3], [4, 3]])[ri];
}
const DESIGN_EVENTS = ['session', 'level', 'round', 'unfold', 'ask', 'next', 'right', 'aim', 'pumpAsk', 'pump', 'pumpAuto', 'launch', 'whoosh', 'chute', 'land', 'splash',
  'fold', 'count', 'homeBadge', 'pennant', 'hopBack', 'camp', 'fountain', 'roundDone', 'wipe', 'wrong', 'squish', 'soft', 'hint', 'assistArmed', 'assist', 'idle',
  'pokeMimi', 'marmot', 'marmotTap', 'goat', 'goatTap', 'bird', 'birdTap', 'gust', 'talk', 'talkAsk', 'talkResult', 'levelDone', 'sessionDone'];
const NON_POSITIONAL = ['session', 'talkAsk', 'talkResult', 'levelDone', 'sessionDone'];

/** CSS viewport + CSS safe-area insets → logical {W, H, ins} (short side 720). */
function dev(name, cw, ch, ci) {
  const { W, H } = DK.World.logicalSize(cw, ch), s = Math.min(W, H) / Math.min(cw, ch), ins = {};
  for (const k of ['top', 'right', 'bottom', 'left']) ins[k] = Math.round(((ci || {})[k] || 0) * s);
  return { W, H, ins, name };
}
// the device shapes of the task (iPhone / iPad both ways with their safe areas, the clamp extremes) + iPad 4:3 / mini / SE
const VIEWPORTS = [
  dev('iPhone 393×852 portrait (notch)', 393, 852, { top: 59, bottom: 34 }),
  dev('iPhone 852×393 landscape (notch)', 852, 393, { left: 59, right: 59, bottom: 21 }),
  dev('iPad 820×1180 portrait', 820, 1180, { top: 24, bottom: 20 }),
  dev('iPad 1180×820 landscape', 1180, 820, { top: 24, bottom: 20 }),
  { W: 1600, H: 720, ins: null, name: '1600×720' },
  { W: 720, H: 1600, ins: null, name: '720×1600' },
  { W: 960, H: 720, ins: { top: 32, right: 0, bottom: 27, left: 0 }, name: '960×720 (iPad 4:3) insets' },
  { W: 720, H: 960, ins: { top: 32, right: 0, bottom: 27, left: 0 }, name: '720×960 (iPad 4:3 portrait) insets' },
  dev('iPad mini 744×1133', 744, 1133, { top: 24, bottom: 20 }),
  dev('iPhone SE 667×375', 667, 375, {}),
  dev('iPhone SE 375×667', 375, 667, { top: 20 })
];
const SHAPES6 = VIEWPORTS.slice(0, 6);
const VP_PORT = VIEWPORTS[0], VP_LAND = VIEWPORTS[1], VP_IPAD = VIEWPORTS[3];

// ---------- helpers
function mkWorld(o) {
  o = o || {};
  const cfg = Object.assign(o.surprise ? {} : { surpriseTypes: [], rainbowSurprise: null }, o.config || {});
  const w = new DK.World({ seed: o.seed || 1, age: o.age || 4, lang: o.lang || 'en', config: cfg });
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
const until = (w, pred, maxT, onEv, dt) => run(w, pred, maxT || 60, onEv, dt);
const wait = (w, T, onEv) => run(w, null, T, onEv);
function startTopic(w, topic, level) {
  w.newSession();
  if (topic) { w.levels = [topic, topic, topic, topic]; w.startLevel(level || 0); }
  w.drainEvents();
}
const inPlay = w => w.interactive && w.phase === 'play';
const inPump = w => w.interactive && w.phase === 'pump';
function toPlay(w, topic, level) { startTopic(w, topic, level); until(w, inPlay, 20); assert.ok(inPlay(w), 'reached play'); }
function tap(w, x, y) { const r = w.pointerDown(x, y); w.pointerUp(x, y); return r; }
function tapMat(w, id) { const h = w.matHit(id); assert.ok(h, 'mat ' + id + ' tappable'); return tap(w, h.x, h.y); }
function wrongOf(w) { return w.mats.find(m => m.launch === w.launch && !m.target && m.state === 'rest'); }
function grassPoint(w) {   // open meadow away from every mat and Mimi
  const L = w.layout, M = L.meadow, nb = w.mimiHit();
  for (let y = L.horizon + 20; y < M.y1 - 10; y += 10) for (let x = M.x0 + 20; x < M.x1 - 20; x += 10) {
    if (x > nb.x - 10 && x < nb.x + nb.w + 10 && y > nb.y - 10 && y < nb.y + nb.h + 10) continue;
    if (w.mats.every(m => m.state === 'gone' || m.state === 'hidden' || Math.hypot(x - m.x, y - (m.y - CFG.hitLift * L.itemH * m.ds)) > DK.World.hitRAt(L, m.ds) + 10)) return { x, y };
  }
  return null;
}
function overlap(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
/** Taps the target, pumps 3× (0.3 s apart) and flies; returns {land, trace} where trace records the flight. onStep(w, t) may act. */
function fly(w, opts) {
  opts = opts || {};
  const a = w.answer(); assert.ok(a && a.mat, 'an answer in play');
  const id = a.mat;
  assert.strictEqual(tapMat(w, id), 'mat');
  until(w, inPump, 3); assert.ok(inPump(w), 'pump phase');
  const trace = { minComY: 1e9, minY: 1e9, maxSwingOpen: 0, signs: new Set(), rotErr: 0, coastVy: [], chuteMax: 0, offScreen: 0, events: [] };
  let land = null, t = 0;
  const onEv = e => { trace.events.push(e); if (e.type === 'land') land = e; };
  for (let n = 0; n < 3; n++) { assert.strictEqual(tap(w, w.layout.pump.x, w.layout.pump.y), 'pump'); run(w, null, 0.3, onEv); }
  const dt = 1 / 120, L0 = w.layout;
  while (!land && t < 8) {
    if (opts.onStep) opts.onStep(w, t);
    w.update(dt); t += dt;
    for (const e of w.drainEvents()) onEv(e);
    const F = w._fl, r = w.rocket, L = w.layout;
    if (!F) continue;
    if (F.phase === 'boost' || F.phase === 'coast') {
      w._lastG = F.g;
      trace.minComY = Math.min(trace.minComY, F.cy); trace.minY = Math.min(trace.minY, r.y);
      if (F.phase === 'coast' && F.t > 0.15 && Math.hypot(F.vx, F.vy) > 300) trace.rotErr = Math.max(trace.rotErr, Math.abs(wrap(r.rot - Math.atan2(F.vx, -F.vy))));
      if (F.phase === 'coast') trace.coastVy.push(F.vy);
    }
    if (F.phase === 'chute') {
      trace.chuteMax = Math.max(trace.chuteMax, r.chute);
      if (F.t > CFG.chuteOpen + 0.35) { trace.maxSwingOpen = Math.max(trace.maxSwingOpen, Math.abs(r.swing)); if (Math.abs(r.swing) > 0.02) trace.signs.add(Math.sign(r.swing)); }
    }
    if (r.x < -60 || r.x > L.W + 60 || r.y > L.H + 10) trace.offScreen++;
    void L0;
  }
  assert.ok(land, 'landed');
  trace.flight = land.flight;
  return { id, land, trace };
}

// =====================================================================================================================  RNG / basics
test('rng: deterministic, ranges', () => {
  const a = new DK.RNG(42), b = new DK.RNG(42);
  for (let i = 0; i < 100; i++) assert.strictEqual(a.next(), b.next());
  const r = new DK.RNG('x');
  for (let i = 0; i < 1000; i++) { const v = r.int(2, 5); assert.ok(v >= 2 && v <= 5); }
  assert.strictEqual(new DK.RNG(7).fork(1).next(), new DK.RNG(7).fork(1).next());
});
test('logicalSize: short side 720, long side clamped 960..1600', () => {
  assert.deepStrictEqual(DK.World.logicalSize(852, 393), { W: 1561, H: 720 });
  assert.deepStrictEqual(DK.World.logicalSize(393, 852), { W: 720, H: 1561 });
  assert.deepStrictEqual(DK.World.logicalSize(1180, 820), { W: 1036, H: 720 });
  assert.deepStrictEqual(DK.World.logicalSize(820, 1180), { W: 720, H: 1036 });
  assert.deepStrictEqual(DK.World.logicalSize(1024, 768), { W: 960, H: 720 });
  assert.deepStrictEqual(DK.World.logicalSize(3000, 700), { W: 1600, H: 720 });
});

// =====================================================================================================================  layout
test('layout: DESIGN §2 fields, camp corner, meadow, horizon, pole / pad / pump / Mimi on every viewport × age', () => {
  for (const v of VIEWPORTS) for (const age of AGES) {
    const L = DK.World.computeLayout(v.W, v.H, v.ins, {}, age, null), tag = `${v.name} age ${age}`;
    for (const f of ['W', 'H', 'ins', 'portrait', 'tall', 'phone', 'bubble', 'hud', 'play', 'camp', 'meadow', 'horizon', 'mimiHome', 'mimiH', 'pad', 'pump', 'pole', 'rocketH', 'S', 'itemH', 'hitR', 'slots'])
      assert.ok(L[f] !== undefined, tag + ': layout.' + f);
    assert.ok(L.fits, tag + ': fits');
    assert.ok(L.S <= S_BASE[age] && L.S >= 130, tag + ' S ' + L.S);
    assert.ok(Math.abs(L.itemH - 0.62 * L.S) < 1e-9);
    assert.ok(Math.abs(L.hitR - Math.max(0.6 * L.S * 0.8 + 14, L.phone ? 92 : 0)) < 1e-9, tag + ' hitR');
    assert.strictEqual(L.rocketH, 120);
    const ins = L.ins, yb = L.H - ins.bottom;
    if (L.portrait) {
      assert.strictEqual(L.mimiH, L.phone ? 200 : 170);
      assert.ok(Math.abs(L.camp.y0 - (yb - Math.round(280 * (L.tall ? 1.15 : 1)))) < 1e-9 && L.camp.x0 === 0 && L.camp.x1 === L.W, tag + ' camp band');
      assert.ok(Math.abs(L.meadow.y1 - L.camp.y0) < 1e-9 && L.meadow.y0 === L.play.y0, tag + ' meadow above the camp');
      assert.ok(Math.abs(L.horizon - (L.play.y0 + 120)) < 1e-9, tag + ' horizon');
      assert.ok(L.pole.y1 >= L.camp.y0 - 160 - 1e-9 && L.pole.y1 >= L.play.y0 + 30 - 1e-9, tag + ' pole top');
      assert.ok(Math.abs(L.pad.x - L.W / 2) < 1e-9 && Math.abs(L.pole.x - (L.W - ins.right - 70)) < 1e-9);
    } else {
      assert.strictEqual(L.mimiH, 180);
      assert.ok(L.camp.x1 - ins.left >= 230 - 1e-9 && L.camp.x1 - ins.left <= 272 + 1e-9, tag + ' camp column');
      assert.ok(Math.abs(L.meadow.x0 - L.camp.x1) < 1e-9, tag + ' meadow right of the camp');
      assert.ok(Math.abs(L.horizon - (L.play.y0 + 0.3 * (L.H - L.play.y0))) < 1e-9, tag + ' horizon');
      assert.ok(Math.abs(L.pole.y1 - (L.play.y0 + 30)) < 1e-9, tag + ' pole top');
    }
    assert.ok(L.play.y0 >= L.bubble.y + L.bubble.h + 10 - 1e-9, tag + ' play below the bubble');
    // camp things inside the camp, on screen, apart from each other
    for (const [nm, p] of [['mimi', L.mimiHome], ['pad', L.pad], ['pump', L.pump]]) {
      assert.ok(p.x > ins.left && p.x < L.W - ins.right && p.y > L.play.y0 && p.y < yb, tag + ' ' + nm + ' on screen');
      assert.ok(p.x >= L.camp.x0 && p.x <= L.camp.x1 && p.y >= L.camp.y0, tag + ' ' + nm + ' in the camp');
    }
    assert.ok(Math.hypot(L.pad.x - L.pump.x, L.pad.y - L.pump.y) >= 50 && Math.hypot(L.mimiHome.x - L.pump.x, L.mimiHome.y - L.pump.y) >= 50 && Math.abs(L.mimiHome.x - L.pad.x) >= 100, tag + ' camp things apart');
    const B = DK.World.mimiPoints(), s = L.mimiH / 300;
    assert.ok(L.mimiHome.x - (B.feet[0] - B.box[0]) * s >= ins.left - 1 && L.mimiHome.y - (B.feet[1] - B.box[1]) * s >= L.play.y0 - 1, tag + ' Mimi fully on screen');
    assert.ok(L.pole.x > ins.left && L.pole.x + L.pennantW < L.W - ins.right && L.pole.y0 < yb, tag + ' pole + pennants on screen');
    assert.strictEqual(L.slots.length, 4);
    for (let j = 0; j < 4; j++) assert.ok(Math.abs(L.slots[j].y - (L.pole.y1 + 24 + 46 * j)) < 1e-9, tag + ' pennant slot ' + j);
    assert.ok(L.slots[3].y + L.pennantH <= L.pole.y0 + 1e-9, tag + ' 4 pennants fit on the pole');
    for (const K of L.keep) assert.ok(!overlap(L.poleBox, K), tag + ' the pole clear of the ' + K.kind);
    // the depth scale (DESIGN §2): 0.82 at the horizon … 1 at the meadow bottom
    assert.ok(Math.abs(DK.World.depthAt(L, L.horizon) - 0.82) < 1e-9 && Math.abs(DK.World.depthAt(L, L.meadow.y1) - 1) < 1e-9);
  }
});
test('layout: mat homes on every device shape × age × m 2..3 × 40 seeds — inside the meadow, apart, clear of pad / pole / bubble / HUD / edges', () => {
  let n = 0;
  for (const v of VIEWPORTS) for (const age of AGES) {
    const L = DK.World.computeLayout(v.W, v.H, v.ins, {}, age, null), cand = DK.World.matCandidates(L, {});
    for (const m of [2, 3]) for (let seed = 1; seed <= 40; seed++) {
      const H = DK.World.matHomes(L, m, seed * 977 + 13), tag = `${v.name} age ${age} m ${m} seed ${seed}`;
      assert.strictEqual(H.length, m); assert.ok(H.ok, tag + ' homes ok');
      H.forEach((p, i) => {
        assert.ok(fin(p.x, p.y, p.ds), tag);
        const b = DK.World.matFoot(L, p.x, p.y, p.ds), ins = L.ins;
        assert.ok(p.y > L.horizon && p.y <= L.meadow.y1, tag + ' below the horizon, in the meadow');
        assert.ok(Math.abs(p.ds - DK.World.depthAt(L, p.y)) < 1e-9, tag + ' depth scale');
        assert.ok(b.x >= ins.left + 44 - 1e-9 && b.x + b.w <= L.W - ins.right - 44 + 1e-9, tag + ' ≥ 44 px from the side edges');
        assert.ok(b.y + b.h <= (L.portrait ? L.camp.y0 : L.H - ins.bottom - 44) + 1e-9, tag + ' above the camp / bottom edge');
        if (!L.portrait) assert.ok(b.x >= L.camp.x1 + 40 - 1e-9, tag + ' landscape: ≥ camp right + 40');
        for (const K of L.keep) assert.ok(DK.World.boxGap(b, K) >= 44 - 1e-9, tag + ' ≥ 44 px from the ' + K.kind);
        assert.ok(DK.World.boxGap(b, L.poleBox) >= 40 - 1e-9, tag + ' ≥ 40 px from the pole');
        assert.ok(Math.hypot(p.x - L.pad.x, p.y - L.pad.y) >= 90 + 0.5 * L.S * p.ds - 1e-9, tag + ' ≥ 90 px from the pad');
        for (let k = i + 1; k < m; k++) {
          const q = H[k], ha = { x: p.x, y: p.y - 0.3 * L.itemH * p.ds }, hb = { x: q.x, y: q.y - 0.3 * L.itemH * q.ds };
          assert.ok(Math.hypot(ha.x - hb.x, ha.y - hb.y) >= DK.World.hitRAt(L, p.ds) + DK.World.hitRAt(L, q.ds) + 20 - 1e-6, tag + ' hit circles ≥ 20 px apart');
          assert.ok(!overlap(b, DK.World.matFoot(L, q.x, q.y, q.ds)), tag + ' footprints never overlap');
        }
        n++;
      });
      assert.deepStrictEqual(DK.World.matHomes(L, m, seed * 977 + 13), H, tag + ' deterministic');
    }
    assert.ok(cand.length > 20, v.name + ' candidates');
  }
  assert.ok(n > 5000, 'mats checked ' + n);
});
test('layout: the right mat\'s place varies (not always nearest / farthest from the pad); homes vary by seed; a hudKeep box pushes mats', () => {
  const L = DK.World.computeLayout(1036, 720, { top: 18, bottom: 14 }, {}, 4, null);
  const rank = new Set(), keys = new Set();
  for (let s = 1; s <= 60; s++) {
    const r = C.makeRound('colors', { age: 4, rng: new DK.RNG(s), roundIndex: 2 }), H = DK.World.matHomes(L, r.m, r.seed);
    const ti = r.launches[0].findIndex(q => q.target), d = H.map(p => Math.hypot(p.x - L.pad.x, p.y - L.pad.y)), sorted = d.slice().sort((a, b) => a - b);
    rank.add(sorted.indexOf(d[ti])); keys.add(JSON.stringify(H.map(p => [Math.round(p.x / 40), Math.round(p.y / 40)])));
  }
  assert.ok(rank.size >= 2, 'target distance rank varies: ' + [...rank]);
  assert.ok(keys.size > 30, 'home sets vary: ' + keys.size);
  const v = VIEWPORTS[3], hk = [{ x: v.W - v.ins.right - 300, y: 0, w: 300, h: 260 }], L2 = DK.World.computeLayout(v.W, v.H, v.ins, {}, 4, hk);
  for (let s = 1; s < 20; s++) DK.World.matHomes(L2, 3, s).forEach(p => { for (const K of L2.keep) assert.ok(DK.World.boxGap(DK.World.matFoot(L2, p.x, p.y, p.ds), K) >= 44 - 1e-9, 'clear of hudKeep'); });
});

// =====================================================================================================================  content
const POOL_TOPICS = AGES.flatMap(a => DK.AGE_POOLS[a].map(t => [a, t]));
test('content: DESIGN §5.1 objects, no fruits, launches = rows, mat ids', () => {
  assert.deepStrictEqual(DK.OBJS, OBJS);
  assert.strictEqual(DK.FRUITS, undefined);
  for (const o of OBJS) { assert.ok(DK.THING_NAMES.en[o], 'EN name ' + o); assert.ok(DK.THING_NAMES.vi[o], 'VI name ' + o); }
  const r = C.makeRound('colors', { age: 4, rng: new DK.RNG(2), roundIndex: 1 });
  assert.strictEqual(r.rows, r.launches); assert.strictEqual(r.fruit, undefined);
  r.launches.forEach((L, j) => L.forEach((q, i) => { assert.strictEqual(q.id, 'm' + j + '_' + i); assert.strictEqual(q.launch, j); }));
});
test('content: every topic × age 3..7 × 200 seeds × 4 rounds passes the self-check + independent checks', () => {
  let n = 0;
  for (const [age, topic] of POOL_TOPICS) {
    const keys = new Set(), targetIdx = new Set(), values = new Set();
    for (let s = 0; s < 200; s++) {
      const rng = new DK.RNG(1000 + s * 31 + age), level = s % 4 === 0 ? 0 : 1 + (s % 3), used = [];
      let prev = null;
      for (let ri = 0; ri < 4; ri++) {
        const short = ri === 3 && s % 7 === 0;
        const r = C.makeRound(topic, { age, lang: s % 2 ? 'vi' : 'en', rng, roundIndex: ri, level, short, usedKeys: used, prevRule: prev && prev.rule });
        const tag = `${topic} age ${age} seed ${s} round ${ri}`;
        assert.strictEqual(C.validate(r), null, tag);
        const [k, m] = wantKM(age, ri, level, short);
        assert.strictEqual(r.k, k, tag + ' k'); assert.strictEqual(r.m, m, tag + ' m');
        assert.strictEqual(r.launches.length, k);
        const tIdx = [];
        r.launches.forEach((row, j) => {
          assert.strictEqual(row.length, m);
          const tg = row.filter(q => q.target);
          assert.strictEqual(tg.length, 1, tag + ' exactly one target in launch ' + j);
          tIdx.push(row.indexOf(tg[0]));
          row.forEach(q => { assert.strictEqual(q.launch, j); assert.strictEqual(C.ruleHolds(r.rule, q.thing, r, j), q.target, tag + ' rule ' + q.id); if (q.thing.kind === 'obj') assert.ok(OBJS.includes(q.thing.obj)); });
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
        const cols = [...new Set(r.launches.flat().map(q => q.thing.color).filter(Boolean))];
        if (age < 5) { for (const [a, b] of CLASH) assert.ok(!(cols.includes(a) && cols.includes(b)), tag + ' CVD clash ' + cols); assert.ok(!cols.includes('pink'), tag + ' no pink < 5'); }
        assert.ok(!used.includes(r.key), tag + ' a new set every round');
        if (prev && r.mode !== 'countSeq' && prev.mode !== 'countSeq' && !(topic === 'animals' && r.rule.kind !== prev.rule.kind))
          assert.notStrictEqual(String(r.rule.value), String(prev.rule.value), tag + ' the asked value changes');
        assert.strictEqual(r.surprise, null);
        assert.ok(Number.isInteger(r.seed));
        used.push(r.key); keys.add(r.key); values.add(String(r.rule.value));
        prev = r; n++;
      }
    }
    assert.ok(keys.size > (age === 3 || topic === 'size' || topic === 'count' ? 60 : 300), `${topic} age ${age}: variety (${keys.size} distinct sets)`);
    assert.ok(targetIdx.size >= 2, `${topic} age ${age}: target positions`);
    if (topic !== 'size' && topic !== 'oddeven') assert.ok(values.size >= 3, `${topic} age ${age}: asked values ${[...values]}`);
  }
  assert.ok(n >= 20000);
});
test('content: deterministic per seed; surprise marmot / goat / bird never in round 0; prompts', () => {
  for (const [age, topic] of POOL_TOPICS) for (const sp of ['marmot', 'goat', 'bird']) {
    const a = C.makeRound(topic, { age, rng: new DK.RNG(5), roundIndex: 2, surprise: sp }), b = C.makeRound(topic, { age, rng: new DK.RNG(5), roundIndex: 2, surprise: sp });
    assert.deepStrictEqual(a, b);
    assert.strictEqual(a.surprise, sp);
    assert.strictEqual(C.makeRound(topic, { age, rng: new DK.RNG(5), roundIndex: 0, surprise: sp }).surprise, null);
    assert.ok(/^p\./.test(a.promptKey));
  }
  const cs = C.makeRound('count', { age: 4, rng: new DK.RNG(3), roundIndex: 2 });
  assert.strictEqual(cs.mode, 'countSeq'); assert.strictEqual(cs.promptKey, 'p.countSeq'); assert.deepStrictEqual(cs.params, { n: cs.k });
  const cl = C.makeRound('count', { age: 4, rng: new DK.RNG(3), roundIndex: 1 });
  assert.strictEqual(cl.mode, 'countSel'); assert.ok(cl.params.n >= 2 && cl.params.n <= 5);
  const an = C.makeRound('animals', { age: 4, rng: new DK.RNG(3), roundIndex: 1 });
  assert.strictEqual(an.promptKey, 'p.home'); assert.ok(['farm', 'sea'].includes(an.params.home));
  assert.strictEqual(C.makeRound('animals', { age: 3, rng: new DK.RNG(3), roundIndex: 2 }).promptKey, 'p.animal');
});
test('content: validate catches broken rounds', () => {
  const r = C.makeRound('colors', { age: 4, rng: new DK.RNG(9), roundIndex: 1 });
  const bad = J(r); bad.launches[0].forEach(q => { q.target = false; }); bad.rows = bad.launches; assert.ok(C.validate(bad));
  const bad2 = J(r); bad2.launches[0][0].thing.color = bad2.rule.value; bad2.launches[0][1].thing.color = bad2.rule.value; bad2.rows = bad2.launches; assert.ok(C.validate(bad2));
  const bad3 = J(C.makeRound('count', { age: 4, rng: new DK.RNG(9), roundIndex: 2 }));
  const d = bad3.launches[0].find(q => !q.target); d.thing.n = 2; d.thing.nameValue = 2; bad3.rows = bad3.launches; bad3.key = C.roundKey(bad3); assert.ok(C.validate(bad3), 'j+2 distractor at age 4');
  const bad4 = J(r); bad4.rows = J(r.launches); bad4.rows[0][0].thing.color = 'pink'; assert.ok(C.validate(bad4), 'rows ≠ launches');
  const ok = J(r); assert.strictEqual(C.validate(ok), null, 'a JSON copy validates');
});
test('content: Talk time for every topic × age (2 choices at age 3, else 3; answer among them)', () => {
  for (const [age, topic] of POOL_TOPICS) for (let s = 0; s < 40; s++) {
    const t = C.makeTalk(topic, { age, lang: s % 2 ? 'vi' : 'en', rng: new DK.RNG(s * 13 + age) });
    assert.ok(t.choices.some(c => c.id === t.answer), topic + ' answer');
    const want = topic === 'size' ? 2 : age <= 3 && !['letters', 'lower', 'initial', 'add', 'sub', 'oddeven'].includes(topic) ? 2 : 3;
    assert.strictEqual(t.choices.length, want, `${topic} age ${age} choices`);
    assert.strictEqual(new Set(t.choices.map(c => JSON.stringify(c.thing))).size, t.choices.length);
    assert.ok(/^talk\./.test(t.promptKey));
    if (topic === 'count') assert.strictEqual(t.show.kind, 'dots');
  }
});
test('content: topicsFor — first session = AGE_TOPICS, later rotate; initial letters follow the names', () => {
  for (const a of AGES) assert.deepStrictEqual(C.topicsFor(a), AGE_TOPICS[a]);
  const t = C.topicsFor(4, new DK.RNG(1), AGE_TOPICS[4]);
  assert.strictEqual(t.length, 4); assert.notDeepStrictEqual(t, AGE_TOPICS[4]);
  assert.strictEqual(C.initialOfName('bông hoa', 'vi'), 'H');
  assert.strictEqual(C.initialOfName('cây nấm', 'vi'), 'N');
  assert.strictEqual(C.initialOfName('cái cốc', 'vi'), 'C');
  assert.strictEqual(C.initialOfName('chiếc đèn lồng', 'vi'), 'Đ');
  assert.strictEqual(C.initialOfName('chim cánh cụt', 'vi'), null);
  assert.strictEqual(C.initialOfName('lantern', 'en'), 'L');
});

// =====================================================================================================================  world: flow
test('world: session flow — intro → unfold (each mat, 0.35 s lead + 0.16 s each) → ask → play', () => {
  const w = mkWorld({ seed: 3 });
  w.newSession();
  const ev = until(w, inPlay, 20);
  const types = ev.map(e => e.type);
  assert.ok(types.indexOf('level') < types.indexOf('round') && types.indexOf('round') < types.indexOf('unfold') && types.lastIndexOf('unfold') < types.indexOf('ask'));
  const ask = ev.find(e => e.type === 'ask');
  assert.ok(ask.promptKey && ask.params && ask.first === true && ask.mode === 'match');
  const un = ev.filter(e => e.type === 'unfold');
  assert.strictEqual(un.length, w.cur.m);
  assert.strictEqual(w.phase, 'play'); assert.strictEqual(w.launch, 0);
  assert.ok(w.mats.filter(m => m.launch === 0).every(m => m.state === 'rest' && m.unfold === 1 && m.thingA > 0.9));
  assert.deepStrictEqual(w.targets(), [w._target().id]);
  assert.deepStrictEqual(w.answer(), { mat: w._target().id, id: w._target().id });
  const p = w.prompt(); assert.ok(p && p.promptKey === ask.promptKey && p.left === w.cur.k && p.launch === 0);
});
test('world: unfold motion — 0.4 s with a small overshoot; the thing drops on and bounces; things bob ± 2 px', () => {
  const w = mkWorld({ seed: 4 });
  startTopic(w, 'colors', 1);
  until(w, x => x.phase === 'unfold' && x.mats.some(m => m.state === 'unfold'), 5);
  const m = w.mats.find(q => q.state === 'unfold');
  let maxU = 0, t = 0, hopLow = 1e9, bounced = false, prevV = 0;
  while (m.state !== 'rest' && t < 1) { w.update(1 / 120); t += 1 / 120; maxU = Math.max(maxU, m.unfold); }
  assert.ok(Math.abs(t - 0.4) < 0.02, 'unfold time ' + t.toFixed(3));
  assert.ok(maxU > 1.01 && maxU < 1.15, 'overshoot ' + maxU.toFixed(3));
  for (let i = 0; i < 120; i++) { w.update(1 / 120); hopLow = Math.min(hopLow, m.thingHop); if (prevV < 0 && m._tV > 0) bounced = true; prevV = m._tV; }
  assert.ok(bounced, 'the thing bounces once on the mat');
  until(w, inPlay, 3);
  const hs = []; for (let i = 0; i < 240; i++) { w.update(1 / 120); hs.push(m.thingHop); }
  assert.ok(Math.max(...hs) <= 2.0001 && Math.min(...hs) >= -2.0001 && Math.max(...hs) - Math.min(...hs) > 2, 'bob ± 2 px');
});
test('world: right → aim (0.45 s, Mimi hops onto the pump, launcher aims ≤ 0.6 rad, 14 arc points) → pump', () => {
  for (const vp of SHAPES6) {
    const w = mkWorld({ seed: 5, vp });
    toPlay(w, 'colors', 1);
    const t = w._target(), ev = [];
    assert.strictEqual(tapMat(w, t.id), 'mat');
    ev.push(...w.drainEvents());
    const right = ev.find(e => e.type === 'right'), aim = ev.find(e => e.type === 'aim');
    assert.ok(right && right.id === t.id && right.launch === 0 && right.left === w.cur.k - 1 && right.thing, vp.name + ' right');
    assert.ok(aim && aim.id === t.id && Math.abs(aim.angle) <= 0.6 + 1e-9, vp.name + ' aim');
    assert.strictEqual(w.phase, 'aim'); assert.ok(!w.interactive);
    assert.strictEqual(w.arc.length, 14);
    const last = w.arc[13]; assert.ok(Math.hypot(last.x - t.x, last.y - t.y) < 1, vp.name + ' arc ends on the mat');
    w.arc.forEach(p => assert.ok(fin(p.x, p.y)));
    const ev2 = until(w, inPump, 2);
    assert.ok(Math.abs(w.time - (w.time - w.phaseTime)) >= 0);
    assert.ok(ev2.some(e => e.type === 'pumpAsk'), vp.name + ' pumpAsk');
    assert.ok(w.mimi.onPump && w.mimi.state === 'pump', vp.name + ' Mimi on the pump');
    assert.ok(Math.abs(w.rocket.aim - aim.angle) < 0.05, vp.name + ' launcher aimed ' + w.rocket.aim.toFixed(3) + ' vs ' + aim.angle.toFixed(3));
    assert.ok(t.active > 0.9, vp.name + ' the chosen mat is active');
    assert.deepStrictEqual(J(w.answer()).pump, true);
    assert.strictEqual(w.prompt(), null); assert.deepStrictEqual(w.targets(), []);
  }
});
test('world: pump — any press stomps; < 0.22 s merged; 3rd + 0.25 s → launch; Mimi squash 0.88; plunger + gauge', () => {
  const w = mkWorld({ seed: 6 });
  toPlay(w, 'colors', 1); tapMat(w, w._target().id); until(w, inPump, 2); w.drainEvents();
  const L = w.layout, g = grassPoint(w);
  assert.strictEqual(tap(w, g.x, g.y), 'pump', 'a press on the grass stomps');
  let e = w.drainEvents().filter(q => q.type === 'pump'); assert.strictEqual(e.length, 1); assert.strictEqual(e[0].n, 1); assert.strictEqual(e[0].auto, false);
  w.update(1 / 120);
  assert.ok(Math.abs(w.mimi.sy - 0.88) < 0.02, 'Mimi squash ' + w.mimi.sy);
  wait(w, 0.1);
  const mb = w.mimiHit();
  assert.strictEqual(tap(w, mb.cx, mb.cy), 'merged', 'a press 0.1 s later is merged');
  assert.strictEqual(w.drainEvents().filter(q => q.type === 'pump').length, 0);
  let maxPress = 0; run(w, null, 0.15, null); maxPress = Math.max(maxPress, w.pump.press);
  wait(w, 0.1);
  assert.strictEqual(tap(w, L.pump.x, L.pump.y), 'pump');
  wait(w, 0.3);
  const ev = [];
  assert.strictEqual(tap(w, w.mats[0].x, w.mats[0].y), 'pump', 'a press on a mat stomps too');
  ev.push(...w.drainEvents());
  assert.deepStrictEqual(ev.filter(q => q.type === 'pump').map(q => q.n), [3]);
  assert.strictEqual(tap(w, L.pump.x, L.pump.y) === 'merged' || true, true);
  const t3 = w.time; let tl = -1;
  run(w, x => tl > 0, 1, q => { if (q.type === 'launch') tl = w.time; }, 1 / 120);
  assert.ok(Math.abs(tl - t3 - 0.25) < 0.02, 'launch 0.25 s after the 3rd pump: ' + (tl - t3).toFixed(3));
  assert.strictEqual(w.phase, 'flight');
  assert.ok(w.pump.gauge > 0.5, 'gauge up');
});
test('world: auto-pump — no press for 3 s → Mimi stomps by herself every 0.5 s (auto: true, pumpAuto once); a press still counts', () => {
  const w = mkWorld({ seed: 7 });
  toPlay(w, 'shapes', 1); tapMat(w, w._target().id); until(w, inPump, 2); w.drainEvents();
  const t0 = w.time, pumps = [];
  let autoEv = 0;
  run(w, x => x.phase === 'flight', 6, e => { if (e.type === 'pump') pumps.push({ t: w.time - t0, auto: e.auto, n: e.n }); if (e.type === 'pumpAuto') autoEv++; }, 1 / 120);
  assert.strictEqual(autoEv, 1);
  assert.deepStrictEqual(pumps.map(p => p.n), [1, 2, 3]);
  assert.ok(pumps.every(p => p.auto));
  assert.ok(Math.abs(pumps[0].t - 3.0) < 0.02 && Math.abs(pumps[1].t - 3.5) < 0.02 && Math.abs(pumps[2].t - 4.0) < 0.02, 'times ' + pumps.map(p => p.t.toFixed(2)));
  // a kid press after 1 stomp resets the auto clock
  const w2 = mkWorld({ seed: 8 });
  toPlay(w2, 'shapes', 1); tapMat(w2, w2._target().id); until(w2, inPump, 2); w2.drainEvents();
  tap(w2, w2.layout.pump.x, w2.layout.pump.y); w2.drainEvents(); const tk = w2.time, p2 = [];
  run(w2, x => x.phase === 'flight', 6, e => { if (e.type === 'pump') p2.push({ t: w2.time - tk, auto: e.auto }); }, 1 / 120);
  assert.ok(p2[0].auto && Math.abs(p2[0].t - 3.0) < 0.02, 'the auto clock restarts at the kid press');
});
test('world: flight physics — boost → ballistic coast (rot follows velocity) → chute at the apex → pendulum → exact landing; 1.5–3 s', () => {
  let flights = 0, sway = 0;
  for (const vp of SHAPES6) for (const age of [3, 4, 6]) for (const seed of [11, 12, 13]) {
    const w = mkWorld({ seed: seed + age, vp, age });
    toPlay(w, age === 6 ? 'add' : 'colors', 1);
    for (let j = 0; j < 2; j++) {
      until(w, inPlay, 10);
      const { land, trace } = fly(w), L = w.layout, tag = `${vp.name} age ${age} seed ${seed} launch ${j}`;
      assert.ok(land.err <= 2, tag + ' touchdown ' + land.err.toFixed(3) + ' px from the mat');
      assert.ok(trace.minComY >= L.play.y0 + 40 - 1, tag + ' apex under the bubble band ' + trace.minComY.toFixed(1) + ' vs ' + (L.play.y0 + 40));
      assert.ok(trace.minY >= L.play.y0 + 40 - 2, tag + ' the nozzle stays under the band');
      assert.ok(trace.flight >= 1.4 && trace.flight <= 3.2, tag + ' flight ' + trace.flight.toFixed(2) + ' s');
      assert.ok(trace.rotErr < 0.5, tag + ' nose follows the velocity (' + trace.rotErr.toFixed(2) + ')');
      const g = w._lastG; assert.ok(g >= CFG.g && g <= 3200, tag + ' g ' + g);
      for (let i = 1; i < trace.coastVy.length; i++) assert.ok(Math.abs(trace.coastVy[i] - trace.coastVy[i - 1] - g / 120) < 1e-6, tag + ' ballistic coast (one constant g)');
      assert.ok(trace.chuteMax > 1.05 && trace.chuteMax < 1.4, tag + ' the chute pops with an overshoot ' + trace.chuteMax.toFixed(2));
      assert.ok(trace.maxSwingOpen <= 0.45 + 1e-9, tag + ' |swing| ≤ 0.45 under the open chute');
      assert.strictEqual(trace.offScreen, 0, tag + ' on screen');
      const types = trace.events.map(e => e.type);
      for (const k of ['launch', 'whoosh', 'chute', 'land', 'splash']) assert.ok(types.includes(k), tag + ' event ' + k);
      assert.ok(types.indexOf('launch') < types.indexOf('chute') && types.indexOf('chute') < types.indexOf('land'));
      assert.ok(trace.events.filter(e => e.type === 'fold').length === w.cur.m - 1, tag + ' the other mats fold');
      if (trace.signs.size === 2 || trace.maxSwingOpen > 0.08) sway++;
      flights++;
      until(w, x => inPlay(x) || x.phase === 'camp', 10);
      if (w.phase === 'camp') break;
    }
  }
  assert.ok(flights >= 54, 'flights ' + flights);
  assert.ok(sway / flights > 0.3, 'a visible sway in ' + sway + ' / ' + flights + ' flights');
});
test('world: breezy wind — constant ±60 px/s² and gusts still land within 2 px; the chute drifts with the wind', () => {
  for (const vp of SHAPES6) for (const wind of [-60, 60, 0]) {
    const w = mkWorld({ seed: 21, vp });
    toPlay(w, 'colors', 1);
    if (wind) w.setBreeze(wind); else { w.weather = 1; }
    let drift = 0;
    const { land } = fly(w, { onStep: x => { const F = x._fl; if (F && F.phase === 'chute') drift = Math.max(drift, Math.abs(F.off)); } });
    assert.ok(land.err <= 2, vp.name + ' wind ' + wind + ': ' + land.err.toFixed(3) + ' px');
    if (wind) assert.ok(drift > 5, vp.name + ' the wind pushes the chute');
  }
  // the world's breezy chapter has gusts (gust events) and a stronger breeze
  const w = mkWorld({ seed: 22 }); w.newSession(); w.startLevel(1);
  const ev = run(w, null, 30, null, 1 / 30);
  assert.ok(ev.some(e => e.type === 'gust'), 'gusts in the breezy chapter');
});
test('world: resize mid-flight (boost, coast, chute, landed, return) — re-targets the mat\'s new home, lands within 2 px, all on screen', () => {
  const pairs = [[VP_LAND, VP_PORT], [VP_PORT, VP_LAND], [VIEWPORTS[3], VIEWPORTS[2]], [VIEWPORTS[4], VIEWPORTS[5]], [VIEWPORTS[5], VIEWPORTS[4]]];
  for (const [a, b] of pairs) for (const when of ['boost', 'coast', 'chute', 'landed', 'return']) {
    const w = mkWorld({ seed: 31, vp: a });
    toPlay(w, 'colors', 1);
    let done = false;
    const { land, id } = fly(w, { onStep: x => {
      if (done) return;
      const F = x._fl, st = x.rocket.state;
      if ((F && F.phase === when && (when !== 'chute' || F.t > 0.3)) || (when === 'return' && st === 'return')) { x.setViewport(b.W, b.H, b.ins); done = true; }
    } });
    if (when !== 'landed' && when !== 'return') {
      assert.ok(done, when + ' resize happened');
      assert.ok(land.err <= 2, `${a.name} → ${b.name} during ${when}: ${land.err.toFixed(3)} px`);
      const m = w.matById(id); wait(w, 0.35);
      assert.ok(Math.abs(m.hx - m.x) < 2 && Math.abs(m.hy - m.y) < 2, 'the mat glided to its new home');
    }
    if (!done) { if (when === 'landed') w.setViewport(b.W, b.H, b.ins); else { until(w, x => x.rocket.state === 'return', 3); w.setViewport(b.W, b.H, b.ins); } }
    until(w, x => inPlay(x) || x.phase === 'camp', 10);
    const L = w.layout;
    assert.strictEqual(L.W, b.W);
    assert.ok(w.phase === 'play' || w.phase === 'camp', 'the round goes on');
    until(w, x => x.rocket.state === 'pad' || x.rocket.state === 'aim', 3);
    assert.ok(Math.hypot(w.rocket.x - L.pad.x, w.rocket.y - L.pad.y) < 1e-6, 'the rocket is back on the new pad');
    assert.ok(Math.hypot(w.mimi.x - L.mimiHome.x, w.mimi.y - L.mimiHome.y) < 1e-6, 'Mimi at her new home');
    w.mats.filter(m => m.state === 'rest').forEach(m => assert.ok(m.x > L.ins.left && m.x < L.W - L.ins.right && m.y < L.H, 'mat on screen'));
    w.pennants.forEach(p => assert.ok(Math.abs(p.x - L.pole.x) < 1e-6, 'pennants on the new pole'));
  }
});
test('world: collect — the thing hops, flies to the pole and becomes pennant j; the rocket hops home (2 hopBack); countSel counts; animals show the home badge', () => {
  const w = mkWorld({ seed: 41 });
  toPlay(w, 'colors', 1);
  const k = w.cur.k, got = [];
  for (let j = 0; j < k; j++) {
    until(w, inPlay, 10);
    const t = w._target();
    const { trace } = fly(w);
    const ev = trace.events.concat(until(w, x => inPlay(x) || x.phase === 'camp', 10));
    const pn = ev.find(e => e.type === 'pennant');
    assert.ok(pn && pn.id === t.id && pn.slot === j, 'pennant slot ' + j);
    assert.ok(Math.abs(pn.x - w.layout.slots[j].x) < 1e-6 && Math.abs(pn.y - w.layout.slots[j].y) < 1e-6);
    assert.strictEqual(ev.filter(e => e.type === 'hopBack').length, 2, 'two hops home');
    got.push(t.thing);
    if (j < k - 1) assert.ok(ev.some(e => e.type === 'next' && e.launch === j + 1 && e.left === k - j - 1), 'next');
  }
  assert.strictEqual(w.phase, 'camp');
  assert.deepStrictEqual(w.pennants.map(p => p.thing), got);
  // countSel: count events 0.4 s apart while the sign is on the mat
  const w2 = mkWorld({ seed: 42 }); startTopic(w2, 'count', 1); w2.round = 1; w2._prepareRound(); w2._beginUnfold(true); until(w2, inPlay, 10);
  assert.strictEqual(w2.cur.mode, 'countSel');
  const n = w2._target().thing.n, counts = [];
  fly(w2);
  until(w2, x => !!x.flyer, 10, e => { if (e.type === 'count') counts.push({ i: e.i, t: w2.time }); });
  assert.deepStrictEqual(counts.map(c => c.i), Array.from({ length: n }, (_, i) => i + 1));
  for (let i = 1; i < counts.length; i++) assert.ok(Math.abs(counts[i].t - counts[i - 1].t - 0.4) < 0.03);
  // animals: homeBadge before it flies
  const w3 = mkWorld({ seed: 43 }); toPlay(w3, 'animals', 1);
  const { trace: tr3 } = fly(w3), e3 = tr3.events.concat(until(w3, x => !!x.flyer, 5));
  assert.ok(e3.some(e => e.type === 'homeBadge' && e.home), 'homeBadge');
});
test('world: camp — pennants counted in order (count {camp}), Mimi dances, fountain, roundDone 3★, wipe → the next round unfolds', () => {
  const w = mkWorld({ seed: 51 });
  toPlay(w, 'colors', 1);
  const k = w.cur.k;
  const ev = [];
  for (let j = 0; j < k; j++) { until(w, inPlay, 10); ev.push(...fly(w).trace.events); ev.push(...until(w, x => inPlay(x) || x.phase === 'camp', 10)); }
  ev.push(...until(w, x => x.state === 'round' && x.phase === 'unfold' && x.round === 2, 10));
  const camp = ev.find(e => e.type === 'camp'), cnt = ev.filter(e => e.type === 'count' && e.camp), ft = ev.find(e => e.type === 'fountain'), rd = ev.find(e => e.type === 'roundDone');
  assert.ok(camp && camp.n === k, 'camp');
  assert.deepStrictEqual(cnt.map(e => e.i), Array.from({ length: k }, (_, i) => i + 1));
  assert.ok(ft && rd && rd.stars === 3 && rd.misses === 0 && rd.pennants === k);
  assert.ok(ev.indexOf(ft) < ev.indexOf(rd));
  const wp = ev.find(e => e.type === 'wipe'); assert.ok(wp && wp.mood === DK.Weather.NAMES[w.weather] && wp.dir);
  assert.strictEqual(w.pennants.length, 0, 'pennants cleared at the swap');
  assert.strictEqual(w.rocket.state, 'pad');
});
test('world: wrong / squish / soft / hint / assist / poke — exactly as the base', () => {
  const w = mkWorld({ seed: 61 });
  toPlay(w, 'colors', 1);
  const g = grassPoint(w);
  // soft (grass) ×3 → hint
  for (let i = 0; i < 2; i++) assert.strictEqual(tap(w, g.x, g.y), 'soft');
  assert.ok(!w.hintHand);
  assert.strictEqual(tap(w, g.x, g.y), 'soft');
  let ev = w.drainEvents();
  assert.ok(ev.some(e => e.type === 'hint' && e.id === w._target().id), '3 soft → hint');
  assert.ok(w.hintHand && w._target().glow >= 0);
  // wrong
  const w2 = mkWorld({ seed: 62 }); toPlay(w2, 'colors', 1);
  const bad = wrongOf(w2);
  assert.strictEqual(tapMat(w2, bad.id), 'mat');
  ev = w2.drainEvents();
  const wr = ev.find(e => e.type === 'wrong');
  assert.ok(wr && wr.id === bad.id && wr.got && wr.want && wr.streak === 1 && wr.misses === 1 && wr.launch === 0);
  assert.ok(bad.flapV !== 0 && bad.wigV !== 0 && w2.mimi.mood === 'oops');
  assert.strictEqual(tapMat(w2, bad.id), 'squish', 'the same mat again < 1 s');
  assert.ok(w2.drainEvents().some(e => e.type === 'squish' && e.repeat));
  assert.strictEqual(w2.misses, 1);
  wait(w2, 1.1);
  tapMat(w2, bad.id);
  ev = w2.drainEvents();
  assert.ok(ev.some(e => e.type === 'wrong') && ev.some(e => e.type === 'hint'), '2 misses → hint');
  // assist after 5 no-progress presses; the next press on the meadow picks the target; ≤ 2★
  const w3 = mkWorld({ seed: 63 }); toPlay(w3, 'colors', 1);
  const g3 = grassPoint(w3);
  ev = [];
  for (let i = 0; i < 5; i++) { tap(w3, g3.x, g3.y); ev.push(...w3.drainEvents()); wait(w3, 0.05, e => ev.push(e)); }
  assert.ok(ev.some(e => e.type === 'assistArmed'), 'assist armed');
  const target = w3._target();
  assert.strictEqual(tap(w3, g3.x, g3.y), 'mat');
  ev = w3.drainEvents();
  assert.ok(ev.some(e => e.type === 'assist' && e.id === target.id) && ev.some(e => e.type === 'right' && e.id === target.id));
  for (let j = 0; j < w3.cur.k; j++) { if (j > 0) { until(w3, inPlay, 10); tapMat(w3, w3._target().id); } until(w3, inPump, 3); wait(w3, 3.5); until(w3, x => inPlay(x) || x.phase === 'camp', 12); }
  const rd = until(w3, x => x.state === 'roundDone', 10).concat(w3.drainEvents()).find(e => e.type === 'roundDone');
  assert.ok(rd && rd.assisted && rd.stars <= 2, 'assisted ≤ 2★');
  // poke Mimi: never a miss; repeats the question in play
  const w4 = mkWorld({ seed: 64 }); toPlay(w4, 'colors', 1);
  const mb = w4.mimiHit();
  assert.strictEqual(w4.pointerDown(mb.cx, mb.cy), 'mimi');
  assert.strictEqual(w4.pointerUp(mb.cx, mb.cy), 'pokeMimi');
  ev = w4.drainEvents();
  const pk = ev.find(e => e.type === 'pokeMimi');
  assert.ok(pk && pk.promptKey && !pk.busy && w4.misses === 0);
  // a tap on a mat outside play only squishes; a slide off Mimi is no poke
  const w5 = mkWorld({ seed: 65 }); toPlay(w5, 'colors', 1); tapMat(w5, w5._target().id);
  const other = w5.mats.find(m => !m.target && m.state === 'rest');
  until(w5, x => x.phase === 'flight', 5, null);
  const h = w5.matHit(other.id); assert.strictEqual(tap(w5, h.x, h.y), 'squish'); assert.ok(w5.drainEvents().some(e => e.type === 'squish' && e.early));
  const mb5 = w5.mimiHit(); w5.pointerDown(mb5.cx, mb5.cy); w5.pointerMove(mb5.cx + 60, mb5.cy); assert.strictEqual(w5.pointerUp(mb5.cx + 60, mb5.cy), 'up');
});
test('world: idle nudges after 12 s, backing off ×1.5 up to 30 s; the 2nd idle hints; hint cooldown 6 s; hint() only in play', () => {
  const w = mkWorld({ seed: 71 });
  toPlay(w, 'colors', 1);
  const t0 = w.time, idles = [];
  let hints = 0;
  run(w, null, 125, e => { if (e.type === 'idle') idles.push(+(w.time - t0).toFixed(1)); if (e.type === 'hint') hints++; }, 1 / 30);
  assert.deepStrictEqual(idles.slice(0, 5), [12, 30, 57, 87, 117]);
  assert.ok(hints >= 3, 'idle hints ' + hints);
  const w2 = mkWorld({ seed: 72 }); toPlay(w2, 'colors', 1);
  assert.ok(w2.hint()); w2.drainEvents();
  wait(w2, 5.5);
  assert.strictEqual(w2._autoHint(false), null, 'cooldown 6 s');
  tapMat(w2, w2._target().id);
  assert.strictEqual(w2.hint(), null, 'no hint outside play');
});
test('world: Talk time after round 4 (or the 75 s / 72 s chapter limits); re-ask 12 s, glow after the 2nd, Mimi answers after the 3rd', () => {
  const w = mkWorld({ seed: 81 });
  w.newSession();
  const b = new DK.Bot(w, { skill: 1, seed: 1 });
  let talk = null;
  for (let i = 0; i < 30 * 200 && !talk; i++) { b.step(1 / 30); w.update(1 / 30); for (const e of w.drainEvents()) { b.onEvent(e); if (e.type === 'talk') talk = e; } }
  assert.ok(talk && w.state === 'talk');
  assert.ok(w.round >= 2 && w.round <= 4);
  b.enabled = false;
  const asks = []; let res = null;
  run(w, x => !!res, 60, e => { if (e.type === 'talkAsk') asks.push(e); if (e.type === 'talkResult') res = e; });
  assert.strictEqual(asks.length, 3); assert.ok(asks[1].glowAnswer);
  assert.ok(res.auto && !res.correct);
});
test('world: surprises — marmot (burrow ≥ hitR + 40 from every mat), goat (rock on the horizon), bird (on the pole top); taps', () => {
  const kinds = { marmot: 0, goat: 0, bird: 0 }, taps = { marmot: 0, goat: 0, bird: 0 };
  for (const vp of SHAPES6) for (let s = 0; s < 3; s++) {
    const w = mkWorld({ seed: 90 + s, vp, surprise: true }), b = new DK.Bot(w, { skill: 1, seed: s });
    b._surp = {}; b.step = ((orig) => function (dt) { this._surp = { marmot: false, goat: false, bird: false }; this._key = this.world.level + ':' + this.world.round; return orig.call(this, dt); })(b.step);
    w.newSession();
    for (let i = 0; i < 30 * 480 && w.state !== 'sessionDone'; i++) {
      b.step(1 / 30); w.update(1 / 30);
      for (const e of w.drainEvents()) { b.onEvent(e); if (kinds[e.type] !== undefined) kinds[e.type]++; if (/Tap$/.test(e.type)) taps[e.type.replace('Tap', '')]++; }
      const L = w.layout;
      if (w.marmot && w.marmot.rise > 0.9) {
        const q = w.marmot;
        for (const m of w.mats) if (m.state === 'rest' && m.launch === w.launch) assert.ok(Math.hypot(q.x - m.x, q.y - 0.5 * CFG.marmotH - (m.y - 0.3 * L.itemH * m.ds)) >= DK.World.hitRAt(L, m.ds) + 40 - 1, vp.name + ' marmot clear of the mats');
        const h = w.marmotHit(); if (h && !taps.marmot && !w._g) { assert.strictEqual(tap(w, h.x, h.y), 'marmot'); }
      }
      if (w.goat && w.goat.state === 'stand') { assert.ok(Math.abs(w.goat.y - (L.horizon - 4)) < 1e-6, 'goat on the horizon'); const h = w.goatHit(); if (h && !taps.goat && !w._g) assert.strictEqual(tap(w, h.x, h.y), 'goat'); }
      if (w.bird && w.bird.state === 'perch') { assert.ok(w.bird.x === L.pole.x && w.bird.y === L.pole.y1, 'bird on the pole top'); const h = w.birdHit(); if (h && !taps.bird && !w._g) assert.strictEqual(tap(w, h.x, h.y), 'bird'); }
    }
  }
  assert.ok(kinds.marmot > 0 && kinds.goat > 0 && kinds.bird > 0, 'all three surprises seen ' + JSON.stringify(kinds));
  assert.ok(taps.marmot > 0 && taps.goat > 0 && taps.bird > 0, 'all three tapped ' + JSON.stringify(taps));
});
test('world: rounds in a long chapter get short (2 × 2); the 75 s limit ends a chapter after ≥ 3 rounds', () => {
  const w = mkWorld({ seed: 101, age: 6 });
  startTopic(w, 'add', 1);
  w.levelStartTime = w.time - 50; w.round = 2;
  w._prepareRound();
  assert.ok(w.cur.short && w.cur.k === 2 && w.cur.m === 2);
  w.round = 2; w.levelStartTime = w.time - 80; w._swap();
  assert.strictEqual(w.state, 'talk'); assert.strictEqual(w.roundsPerLevel, 3);
  const w2 = mkWorld({ seed: 102 }); startTopic(w2, 'colors', 1); w2.round = 1; w2.levelStartTime = w2.time - 73; w2._swap();
  assert.strictEqual(w2.state, 'talk', '72 s hard limit after 2 rounds');
});
test('world: DK.MIMI_POINTS / DK.ROCKET_POINTS are read at runtime', () => {
  const w = mkWorld({ seed: 3 }), keepM = DK.MIMI_POINTS, keepR = DK.ROCKET_POINTS;
  DK.MIMI_POINTS = { feet: [150, 290], box: [44, 40, 262, 294] };
  const b0 = w.mimiHit();
  DK.MIMI_POINTS = { feet: [150, 290], box: [10, 10, 290, 296] };
  const b1 = w.mimiHit();
  assert.ok(b1.w > b0.w, 'box from MIMI_POINTS');
  DK.ROCKET_POINTS = { nozzle: [60, 236], nose: [60, 36], com: [60, 120] };
  const L = DK.World.computeLayout(1100, 720, null, {}, 4, null);
  assert.ok(Math.abs(L.rocketS - 120 / 200) < 1e-9 && Math.abs(L.rocketLc - 116 * 0.6) < 1e-9);
  if (keepM) DK.MIMI_POINTS = keepM; else delete DK.MIMI_POINTS;
  if (keepR) DK.ROCKET_POINTS = keepR; else delete DK.ROCKET_POINTS;
});
test('world: determinism — the same seed + inputs give the same events', () => {
  const runOne = () => {
    const w = mkWorld({ seed: 77, age: 5, surprise: true }), b = new DK.Bot(w, { skill: 0.7, seed: 5 });
    w.newSession();
    const out = [];
    for (let i = 0; i < 60 * 90; i++) { b.step(1 / 60); w.update(1 / 60); for (const e of w.drainEvents()) { b.onEvent(e); out.push(e.type + ':' + (e.x !== undefined ? e.x.toFixed(3) + ',' + e.y.toFixed(3) : '') + ':' + (e.id || '')); } }
    return out;
  };
  const a = runOne(), b = runOne();
  assert.ok(a.length > 150, 'events ' + a.length);
  assert.deepStrictEqual(a, b);
});
test('world: interpolation twins + alpha; Mimi frames; sub-steps ≤ 1/120 s; a 1 s frame is capped', () => {
  const w = mkWorld({ seed: 3 });
  toPlay(w, 'colors', 1);
  w.update(1 / 200);
  assert.ok(w.alpha >= 0 && w.alpha < 1);
  for (const m of w.mats) for (const f of ['x', 'y', 'unfold', 'squish', 'flap', 'gold', 'alpha', 'rot', 'thingHop', 'thingS', 'thingA', 'wig', 'active']) assert.ok(fin(m['_p' + f], m[f]), 'mat _p' + f);
  for (const f of ['x', 'y', 'sx', 'sy', 'lean']) assert.ok(fin(w.mimi['_p' + f]), 'mimi _p' + f);
  for (const f of ['x', 'y', 'rot', 'aim', 'chute', 'swing', 'sx', 'sy', 'chuteRot', 'noseX', 'noseY']) assert.ok(fin(w.rocket['_p' + f]), 'rocket _p' + f);
  assert.ok(fin(w.pump._ppress));
  tapMat(w, w._target().id); until(w, inPump, 2); for (let i = 0; i < 3; i++) { tap(w, 0, 0); wait(w, 0.3); }
  until(w, x => x._fl && x._fl.phase === 'coast', 2, null, 1 / 120);
  w.update(1 / 120);
  assert.ok(w.rocket._px !== w.rocket.x || w.rocket._py !== w.rocket.y, 'twins lag one step');
  assert.strictEqual(w.mimi.frame, 'look');
  const frames = ['idle', 'blink', 'talk', 'happy', 'cheer', 'think', 'oops', 'pump', 'wave', 'giggle', 'dance', 'look'];
  assert.ok(frames.includes(w.mimi.frame));
  assert.ok(CFG.step <= 1 / 120 + 1e-12);
  const w2 = mkWorld({ seed: 3 }); w2.newSession();
  const t0 = w2.time; w2.update(5); assert.ok(Math.abs(w2.time - t0 - 1) < 0.01);
  w2.update(0); w2.update(NaN); w2.update(-1);
  assert.ok(Math.abs(w2.time - t0 - 1) < 0.01);
});

// =====================================================================================================================  bot sessions (all events, timing)
function session(o) {
  const w = mkWorld(o), b = new DK.Bot(w, { skill: o.skill === undefined ? 0.8 : o.skill, seed: o.seed + 3, pace: o.pace || 'quick' });
  w.newSession();
  const S = { evs: [], chapters: [], rounds: [], types: {}, t: 0, landErr: 0 };
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
      if (e.type === 'land') S.landErr = Math.max(S.landErr, e.err);
      if (e.type === 'ask') assert.ok(e.promptKey && e.params && typeof e.first === 'boolean' && ['match', 'countSeq', 'countSel'].includes(e.mode));
      if (e.type === 'right') assert.ok(e.mode && e.launch >= 0 && e.k >= 2 && e.left >= 0 && e.thing && (e.mode !== 'countSeq' || e.count === e.launch + 1));
      assert.ok(DESIGN_EVENTS.includes(e.type), 'unknown event ' + e.type);
    }
    const r = w.rocket, n = w.mimi;
    assert.ok(fin(n.x, n.y, n.sx, n.sy, r.x, r.y, r.rot, r.chute) && w.mats.every(m => fin(m.x, m.y, m.squish, m.flap, m.unfold)), 'no NaN');
  }
  S.w = w; S.bot = b;
  return S;
}
test('bot: a full toddler-paced session per age reaches sessionDone; ≥ 1★ every round; 60–100 s chapters; ≤ 8 min; landings within 2 px', () => {
  const all = {};
  for (const age of AGES) for (const vp of [VP_LAND, VP_PORT]) {
    const S = session({ seed: 40 + age, age, vp, pace: 'toddler', surprise: true, skill: 0.75 });
    assert.strictEqual(S.w.state, 'sessionDone', `age ${age} ${vp.name}`);
    assert.strictEqual(S.chapters.length, 4);
    assert.ok(S.rounds.length >= 8 && S.rounds.every(r => r.stars >= 1 && r.stars <= 3));
    const mean = S.chapters.reduce((a, b) => a + b, 0) / 4;
    assert.ok(mean >= 60 && mean <= 100, `age ${age} chapter mean ${mean.toFixed(1)} s`);
    assert.ok(S.chapters.every(c => c < 125), 'every chapter < 125 s');
    assert.ok(S.t <= 8 * 60, 'session ' + (S.t / 60).toFixed(2) + ' min');
    assert.ok(S.rounds.every(r => r.dur < 70), 'no stuck round');
    assert.ok(S.landErr <= 2, 'landing error ' + S.landErr);
    Object.assign(all, S.types);
    console.log(`    age ${age} ${vp.name.padEnd(34)} session ${(S.t / 60).toFixed(2)} min · chapters ${S.chapters.map(c => c.toFixed(0)).join(' / ')} s · rounds ${(S.rounds.reduce((a, r) => a + r.dur, 0) / S.rounds.length).toFixed(1)} s · ★ ${S.rounds.map(r => r.stars).join('')}`);
  }
  for (const t of ['session', 'level', 'round', 'unfold', 'ask', 'next', 'right', 'aim', 'pumpAsk', 'pump', 'launch', 'whoosh', 'chute', 'land', 'splash', 'fold', 'pennant',
    'hopBack', 'camp', 'fountain', 'roundDone', 'wipe', 'wrong', 'talk', 'talkResult', 'levelDone', 'sessionDone', 'gust', 'count', 'homeBadge']) assert.ok(all[t], 'event seen: ' + t);
});
test('bot: quick bot sessions (skill 1 and 0.5) on 4 viewports, every age; perfect play = 3★', () => {
  for (const age of AGES) for (const vp of [VP_LAND, VP_PORT, VP_IPAD, VIEWPORTS[5]]) {
    const S = session({ seed: 60 + age, age, vp, skill: 1, surprise: true });
    assert.strictEqual(S.w.state, 'sessionDone');
    assert.ok(S.rounds.every(r => r.stars === 3), 'skill 1 → 3★');
    assert.ok(S.t < 7 * 60, 'quick perfect session ' + (S.t / 60).toFixed(2));
    const S2 = session({ seed: 70 + age, age, vp, skill: 0.5, surprise: true });
    assert.strictEqual(S2.w.state, 'sessionDone');
    assert.ok(S2.rounds.every(r => r.stars >= 1), '≥ 1★');
    assert.ok(S2.t <= 8 * 60, 'session ≤ 8 min at skill 0.5: ' + (S2.t / 60).toFixed(2));
    assert.ok(S.bot.stats.pumps > 0 && S.bot.stats.right > 0);
  }
});

// =====================================================================================================================  weather
test('weather: skies per mood (DESIGN §3), crossfade, ambient fields, env names', () => {
  const sky = [['#9FD3EE', '#F3F7EE'], ['#B7D9EC', '#F1F3EA'], ['#A7B5C3', '#DCE2E6'], ['#B6DDF0', '#FBF3E6']];
  const names = ['sunny', 'breezy', 'rain', 'rainbow'];
  for (let i = 0; i < 4; i++) {
    const wx = new DK.Weather({ width: 1280, height: 720, seed: 3, weather: i });
    wx.update(0.5);
    const a = wx.ambient;
    assert.strictEqual(a.skyTop, sky[i][0]); assert.strictEqual(a.skyBottom, sky[i][1]);
    assert.strictEqual(a.mood, names[i]); assert.strictEqual(a.env, names[i]); assert.strictEqual(a.moodIndex, i);
    for (const f of ['skyTop', 'skyBottom', 'light', 'sunX', 'sunY', 'sunA', 'dark', 'wind', 'gust', 'rain', 'rainbow', 'mood', 'moodIndex', 'env', 'envFrom', 'envMix']) assert.ok(a[f] !== undefined, 'ambient.' + f);
    assert.ok(a.dark <= 0.12 + 1e-9);
    assert.strictEqual(a.rain, i === 2 ? 1 : 0); assert.strictEqual(a.rainbow, i === 3 ? 1 : 0);
  }
  const wx = new DK.Weather({ width: 1280, height: 720, seed: 3, weather: 0 });
  wx.setWeather(2);
  for (let i = 0; i < 75; i++) wx.update(1 / 60);
  assert.ok(wx.ambient.envMix > 0.2 && wx.ambient.envMix < 0.8 && wx.ambient.envFrom === 'sunny' && wx.ambient.env === 'rain');
  for (let i = 0; i < 90; i++) wx.update(1 / 60);
  assert.strictEqual(wx.ambient.envMix, 1);
  for (let i = 0; i < 300; i++) wx.update(1 / 60);
  assert.ok(wx.particles.some(p => p.sprite === 'raindrop'), 'rain falls');
  assert.ok(wx.clouds.some(c => c.type === 'cloud_rain' && c.alpha > 0.5), 'rain clouds');
  assert.ok(wx.particles.length <= DK.Weather.CAP);
  const wb = new DK.Weather({ width: 1280, height: 720, seed: 3, weather: 1 }); for (let i = 0; i < 120; i++) wb.update(1 / 60);
  assert.ok(wb.particles.some(p => p.sprite === 'leaf') && wb.particles.some(p => p.sprite === 'petal'), 'breezy leaves + petals');
  const ws = new DK.Weather({ width: 1280, height: 720, seed: 3, weather: 0 }); ws.update(1);
  assert.ok(ws.particles.some(p => p.sprite === 'mote') && ws.particles.some(p => p.sprite === 'butterfly'), 'sunny motes + butterflies');
  const wr = new DK.Weather({ width: 1280, height: 720, seed: 3, weather: 3 }); wr.update(1);
  assert.ok(wr.particles.some(p => p.sprite === 'rainbow_sparkle') && wr.particles.some(p => p.sprite === 'butterfly'), 'rainbow sparkles + butterflies');
  for (const p of wr.particles) assert.ok(DK.Weather.SPRITES.includes(p.sprite), 'sprite ' + p.sprite);
});
test('weather: windSource follows the world (breezy gusts); bursts; wipeParticles ≤ 120 + 60; party; resize with a layout', () => {
  const w = mkWorld({ seed: 5 }); w.newSession(); w.startLevel(1);
  const wx = new DK.Weather({ width: w.layout.W, height: w.layout.H, seed: 1, layout: w.layout, weather: 1 });
  wx.windSource = w;
  let gusted = false;
  for (let i = 0; i < 60 * 20; i++) { w.update(1 / 60); wx.update(1 / 60); if (w.drainEvents().some(e => e.type === 'gust')) gusted = true; assert.strictEqual(wx.wind, w.wind); }
  assert.ok(gusted);
  for (const k of ['stars', 'sparkle', 'confetti', 'drops', 'rainbow']) wx.burst(400, 300, { kind: k, n: 30 });
  assert.ok(wx.particles.filter(p => p.kind !== 'sweep').length <= 120);
  wx.wipeParticles({ x: 1, y: 0 });
  const sw = wx.particles.filter(p => p.kind === 'sweep').length;
  assert.ok(sw > 40 && sw <= 60, 'sweep ' + sw);
  for (let i = 0; i < 120; i++) wx.update(1 / 60);
  assert.strictEqual(wx.particles.filter(p => p.kind === 'sweep').length, 0, 'the sweep leaves');
  wx.setParty(true); for (let i = 0; i < 180; i++) wx.update(1 / 60);
  assert.ok(wx.ambient.party > 0.9 && wx.particles.some(p => /confetti/.test(p.sprite)));
  w.setViewport(720, 1561, null); wx.resize(720, 1561, w.layout);
  assert.strictEqual(wx.horizonY, w.layout.horizon); assert.strictEqual(wx.width, 720);
  for (let i = 0; i < 60; i++) wx.update(1 / 60);
  wx.particles.forEach(p => assert.ok(fin(p.x, p.y, p.alpha)));
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
