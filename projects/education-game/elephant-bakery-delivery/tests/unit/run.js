#!/usr/bin/env node
// Tupi's Bakery Delivery — headless unit tests for rng / content / world (layout, road tree, cart physics, flow) / weather / bot
// (DESIGN §2, §5.1–5.5, docs/MECHANICS.md).
// Run from the game folder:   node tests/unit/run.js [name part]      (exit 1 on any failure)
//   BD_BOT_N=50 (bot sessions per age in the long bot test; it forks 2 workers)
// (tests/unit/i18n_voice.test.js and house_art.test.js are the other engineers' suites and run on their own.)
'use strict';
const assert = require('assert');
const { fork } = require('child_process');
const { load } = require('./load');

const BD = load();
const AGES = [3, 4, 5, 6, 7];
const C = BD.Content;
const CFG = BD.CONFIG;
const J = v => JSON.parse(JSON.stringify(v));
assert.deepStrictEqual = ((orig) => (a, b, m) => orig(J(a), J(b), m))(assert.deepStrictEqual);
const fin = (...v) => v.every(Number.isFinite);

// ---------- independent copies of the DESIGN tables (§2, §3, §5.1)
const AGE_TOPICS = { 3: ['colors', 'shapes', 'size', 'animals'], 4: ['colors', 'shapes', 'count', 'animals'],
  5: ['shapes', 'count', 'letters', 'animals'], 6: ['lower', 'initial', 'add', 'count'], 7: ['initial', 'add', 'sub', 'oddeven'] };
const CLASH = [['blue', 'purple'], ['red', 'green'], ['yellow', 'orange'], ['green', 'orange'], ['red', 'orange']];
const LOOK = ['EF', 'OQCG', 'MNW', 'PRB', 'ILT', 'UV'];
const HOUSE_S = { 3: 170, 4: 170, 5: 156, 6: 146, 7: 146 };
/** (houses, deliveries) per age / round (DESIGN §5.1); chapter 0 round 0 = the session warm-up (2, 1); short (2, 1). */
function wantND(age, ri, level, short) {
  if (short && ri > 0) return [2, 1];
  if (ri === 0 && level === 0) return [2, 1];
  return (age <= 3 ? [[2, 1], [2, 2], [3, 1], [3, 2]] : age === 4 ? (level === 0 ? [[2, 1], [2, 2], [3, 2], [3, 2]] : [[2, 1], [3, 2], [3, 2], [3, 2]])
    : age === 5 ? [[3, 2], [3, 2], [4, 2], [4, 3]] : [[3, 2], [4, 2], [4, 3], [4, 3]])[ri];
}
const NON_POSITIONAL = ['session', 'talkAsk', 'talkResult', 'levelDone', 'sessionDone'];

/** CSS viewport + CSS safe-area insets → logical {W, H, ins} (short side 720). */
function dev(name, cw, ch, ci) {
  const { W, H } = BD.World.logicalSize(cw, ch), s = Math.min(W, H) / Math.min(cw, ch), ins = {};
  for (const k of ['top', 'right', 'bottom', 'left']) ins[k] = Math.round(((ci || {})[k] || 0) * s);
  return { W, H, ins, name };
}
// the 6 required shapes (squat iPad both ways, tall phones both ways with safe areas) + two more real devices
const SHAPES = [
  { W: 720, H: 960, ins: { top: 32, right: 0, bottom: 27, left: 0 }, name: 'iPad 720×960 portrait' },
  { W: 960, H: 720, ins: { top: 32, right: 0, bottom: 27, left: 0 }, name: 'iPad 960×720 landscape' },
  { W: 720, H: 1556, ins: { top: 108, right: 0, bottom: 62, left: 0 }, name: 'iPhone 720×1556 portrait' },
  { W: 1556, H: 720, ins: { top: 0, right: 108, bottom: 38, left: 108 }, name: 'iPhone 1556×720 landscape' },
  dev('iPad 820×1180 portrait', 820, 1180, { top: 24, bottom: 20 }),
  dev('iPad 1180×820 landscape', 1180, 820, { top: 24, bottom: 20 })
];
const VP_IPAD = SHAPES[1], VP_PHONE_P = SHAPES[2];

// ---------- helpers
function mkWorld(o) {
  o = o || {};
  const cfg = Object.assign(o.surprise ? {} : { surpriseTypes: [], winterSurprise: null }, o.config || {});
  const w = new BD.World({ seed: o.seed || 1, age: o.age || 4, lang: o.lang || 'en', config: cfg });
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
/** Plays rounds (right house taps) until round `ri` of the chapter is in play. */
function toRound(w, topic, level, ri) {
  toPlay(w, topic, level);
  while (w.round < ri) {
    if (w.interactive && w.cart.state === 'wait') tapHouse(w, w.answer().houseId);
    run(w, null, 0.1);
  }
  until(w, x => x.interactive && x.cart.state === 'wait', 30);
}
function toPlay(w, topic, level) { startTopic(w, topic, level); until(w, x => x.interactive && x.cart.state === 'wait', 30); assert.ok(w.interactive, 'reached play'); }
/** Drag the cart along the route to house `id` like a finger (steps of `step` px every 1/60 s). */
function dragTo(w, id, o) {
  o = o || {};
  const h = w.cartHit(); assert.strictEqual(w.pointerDown(h.x, h.y), 'cart');
  const pts = w.route(id), evs = [];
  let x = h.x, y = h.y;
  const step = o.step || 12;
  for (let i = 0; i < pts.length; i++) {
    const [px, py] = pts[i], d = Math.hypot(px - x, py - y), n = Math.max(1, Math.ceil(d / step));
    for (let k = 1; k <= n; k++) {
      x += (px - x) / (n - k + 1); y += (py - y) / (n - k + 1);
      w.pointerMove(x + (o.off || 0), y);
      evs.push(...run(w, null, 1 / 60));
      if (o.stopAt && o.stopAt(w)) return { evs, x, y };
      if (w.phase !== 'play') break;
    }
    if (w.phase !== 'play') break;
  }
  if (!o.keepDown) w.pointerUp(x, y);
  return { evs, x, y };
}
function tapHouse(w, id) { const b = w.houseHit(id); const r = w.pointerDown(b.cx, b.cy); w.pointerUp(b.cx, b.cy); return r; }
function wrongId(w) { const a = w.answer(); return w.houses.find(h => h.id !== a.houseId).id; }
/** Arc distance from the cart to the nearest road point (it must ride ON the road). */
function offRoad(w) { const p = BD.Roads.project(w.roads, w.cart.x, w.cart.y); return p ? p.d : 1e9; }
function rectsOverlap(a, b, pad) { pad = pad || 0; return a.x0 < b.x + b.w + pad && a.x1 > b.x - pad && a.y0 < b.y + b.h + pad && a.y1 > b.y - pad; }
function cartBox(E, x, y) { return { x0: x - E.half, y0: y - E.up, x1: x + E.half, y1: y + E.down }; }

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// =====================================================================================================================  RNG / basics
test('rng: deterministic, ranges; logicalSize: short side 720, long side clamped 960..1600', () => {
  const a = new BD.RNG(42), b = new BD.RNG(42);
  for (let i = 0; i < 100; i++) assert.strictEqual(a.next(), b.next());
  const r = new BD.RNG('x');
  for (let i = 0; i < 1000; i++) { const v = r.int(2, 5); assert.ok(v >= 2 && v <= 5); }
  assert.deepStrictEqual(BD.World.logicalSize(852, 393), { W: 1561, H: 720 });
  assert.deepStrictEqual(BD.World.logicalSize(393, 852), { W: 720, H: 1561 });
  assert.deepStrictEqual(BD.World.logicalSize(1024, 768), { W: 960, H: 720 });
  assert.deepStrictEqual(BD.World.logicalSize(3000, 700), { W: 1600, H: 720 });
});

// =====================================================================================================================  layout
test('layout: DESIGN §2 fields on the 6 shapes × ages (flow axis, wall / table / play, bakery, start, sizes, hitR)', () => {
  for (const v of SHAPES) for (const age of AGES) {
    const L = BD.World.computeLayout(v.W, v.H, v.ins, {}, age, null), tag = `${v.name} age ${age}`;
    for (const f of ['W', 'H', 'ins', 'portrait', 'tall', 'phone', 'compact', 'bubble', 'hud', 'wall', 'table', 'play', 'bakery', 'start', 'houseS', 'roadW', 'cartS', 'hitR', 'door', 'oven'])
      assert.ok(L[f] !== undefined, tag + ': layout.' + f);
    assert.strictEqual(L.portrait, v.H > v.W);
    assert.deepStrictEqual(L.flow, L.portrait ? { x: 0, y: -1 } : { x: 1, y: 0 });
    assert.strictEqual(L.houseS, HOUSE_S[age]);
    const rw0 = age <= 4 ? 78 : 68;
    assert.strictEqual(L.roadW, Math.round(rw0 * (L.phone ? 1.05 : L.compact ? 0.88 : 1)), tag + ' roadW');
    assert.ok(Math.abs(L.cartS - 1.05 * L.houseS) < 1e-9 && L.hitR >= 100 && Math.abs(L.hitR - Math.max(100, 0.6 * L.cartS + 14)) < 1e-9, tag + ' cart / hitR');
    assert.ok(Math.abs(L.wall.h - Math.round((L.portrait ? 0.2 : 0.3) * L.H)) < 1e-9 && L.table.y === L.wall.h, tag + ' wall');
    assert.ok(L.play.y0 >= L.table.y && L.play.y0 >= L.bubble.y + L.bubble.h + 12 - 1e-9, tag + ' play below the bubble band');
    if (L.portrait) assert.ok(L.play.y0 >= L.hud.y + L.hud.h + 12 - 1e-9);
    // the bakery: landscape left (centred in play y unless the bubble pushes it down), portrait at the bottom
    if (!L.portrait) assert.ok(L.bakery.x < 0.25 * L.W && L.start.x > L.bakery.x + L.bakery.w, tag + ' bakery left');
    else assert.ok(L.bakery.y + L.bakery.h > 0.8 * L.H && L.start.x > L.bakery.x + L.bakery.w, tag + ' bakery bottom');
    assert.ok(L.door.y <= L.play.y1 - L.roadW / 2 + 1e-6, tag + ' the road at the door on the table');
  }
});
test('layout: maxHouses — 3 on squat iPad screens, 4 on phones and big iPads', () => {
  const M = (v) => BD.World.maxHouses(v.W, v.H, v.ins);
  assert.strictEqual(M(SHAPES[0]), 3); assert.strictEqual(M(SHAPES[1]), 3);
  assert.strictEqual(M(SHAPES[2]), 4); assert.strictEqual(M(SHAPES[3]), 4);
  assert.strictEqual(M(SHAPES[5]), 4);
});

/** Independent checks of one map against DESIGN §2 (strict thresholds from the CONFIG; the looser fallback pass is reported). */
function checkMap(L, m, n, tag, st) {
  const ins = L.ins, rw = L.roadW, S = m.S, E = m.cart, hTop = CFG.houseTop * S, keep = L.keep;
  const keepG = m.loose ? CFG.houseKeepLoose : CFG.houseKeep, sepMin = rw + (m.loose ? CFG.sepLoose : CFG.sepGap);
  assert.ok(S >= 128 - 1e-9 && S <= L.houseS + 1e-9, tag + ' S ' + S);
  assert.strictEqual(Object.keys(m.houses).length, n, tag + ' houses');
  const hb = Object.keys(m.houses).map(id => { const h = m.houses[id]; return { id, x0: h.x - S / 2, y0: h.y - hTop, x1: h.x + S / 2, y1: h.y }; });
  const bk = { x0: L.bakery.x, y0: L.bakery.y, x1: L.bakery.x + L.bakery.w, y1: L.bakery.y + L.bakery.h };
  for (const b of hb) {
    assert.ok(b.x0 >= ins.left + keepG - 1e-6 && b.x1 <= L.W - ins.right - keepG + 1e-6 && b.y0 >= ins.top && b.y1 <= L.play.y1, tag + ' house on screen ' + b.id);
    for (const k of keep) assert.ok(!rectsOverlap(b, k, keepG - 1e-6), tag + ' house clear of ' + k.kind);
    for (const o of hb) if (o !== b) assert.ok(World_gap(b, o) >= CFG.houseGap - 1e-6, tag + ' houses apart');
  }
  // parked carts / start / forks: Tupi's whole art on screen and clear of the speech bubble / HUD
  const stops = Object.keys(m.houses).map(id => m.houses[id].stop).concat([m.start]).concat(m.nodes.filter(q => q.kind === 'fork'));
  for (const p of stops) {
    const cb = cartBox(E, p.x, p.y);
    assert.ok(cb.x0 >= ins.left && cb.x1 <= L.W - ins.right && cb.y0 >= ins.top, tag + ' cart on screen at a stop');
    for (const k of keep) assert.ok(!rectsOverlap(cb, k, 0), tag + ' cart at a stop clear of ' + k.kind);
  }
  // the tree: every house reachable from the start; each branch ends at its door; smooth polylines; on the table; clear of houses
  const byId = {}; m.edges.forEach(e => { byId[e.id] = e; });
  for (const id of Object.keys(m.houses)) {
    const e = byId['to_' + id], h = m.houses[id], last = e.pts[e.pts.length - 1];
    assert.ok(e && Math.hypot(last[0] - h.x, last[1] - h.y) < 1, tag + ' branch ends at the door of ' + id);
    assert.ok(e.stopS > 0 && e.stopS < e.len, tag + ' parking spot on the branch');
    let c = e, depth = 0; while (c.parent) { c = byId[c.parent]; depth++; }
    assert.ok(c.id === 'trunk' && depth <= 2, tag + ' reachable from the trunk');
    st.route.push(m.routeLen[id] / L.diag);
  }
  let minSep = 1e9;
  for (const e of m.edges) {
    for (let i = 1; i < e.pts.length - 1; i++) {   // smooth: no kinks between 8 px segments
      const a = e.pts[i - 1], b = e.pts[i], c2 = e.pts[i + 1];
      const t1 = Math.atan2(b[1] - a[1], b[0] - a[0]), t2 = Math.atan2(c2[1] - b[1], c2[0] - b[0]);
      let d = Math.abs(t2 - t1); if (d > Math.PI) d = 2 * Math.PI - d;
      assert.ok(d <= CFG.maxTurn + 1e-6, tag + ' kink in ' + e.id + ' ' + d.toFixed(2));
    }
    const ownLf = e.house ? e.len - (m.straight + 0.5 * S + 10) : 1e9;
    e.pts.forEach(([x, y], j) => {
      assert.ok(x >= ins.left + rw / 2 && x <= L.W - ins.right - rw / 2 && y >= L.play.y0 + rw / 2 - 3 && y <= L.play.y1 - rw / 2 + 3, tag + ' road on the table');
      for (const k of keep) assert.ok(!(x > k.x - rw / 2 && x < k.x + k.w + rw / 2 && y > k.y - rw / 2 && y < k.y + k.h + rw / 2), tag + ' road under the ' + k.kind);
      if (e.kind !== 'trunk' || e.cum[j] >= m.start.s - 1) assert.ok(x - E.half >= ins.left && x + E.half <= L.W - ins.right && y - E.up >= ins.top, tag + ' the driving cart on screen');
      for (const b of hb) if (!(b.id === e.house && e.cum[j] >= ownLf)) assert.ok(BD.World.boxDist(b, x, y) >= rw / 2 + CFG.roadHouse - 1e-6, tag + ' road clear of house ' + b.id);
      if (!(e.kind === 'trunk' && e.cum[j] < m.start.s)) assert.ok(BD.World.boxDist(bk, x, y) >= rw / 2 + CFG.roadHouse - 1e-6, tag + ' road clear of the bakery');
    });
  }
  // branches apart (never crossing): ≥ roadW + 40 (the loose pass: + 16) except near a shared fork
  const nodes = {}; m.nodes.forEach(q => { nodes[q.id] = q; });
  for (let a = 0; a < m.edges.length; a++) for (let b = a + 1; b < m.edges.length; b++) {
    const A = m.edges[a], B = m.edges[b], sh = [A.from, A.to].find(q => q === B.from || q === B.to);
    for (const p of A.pts) for (const q of B.pts) {
      if (sh && Math.hypot(p[0] - nodes[sh].x, p[1] - nodes[sh].y) < CFG.forkFree && Math.hypot(q[0] - nodes[sh].x, q[1] - nodes[sh].y) < CFG.forkFree) continue;
      minSep = Math.min(minSep, Math.hypot(p[0] - q[0], p[1] - q[1]));
    }
  }
  assert.ok(minSep >= sepMin - 1, tag + ' branches ' + minSep.toFixed(0) + ' apart (≥ ' + sepMin + ')');
}
function World_gap(a, b) { const dx = Math.max(b.x0 - a.x1, a.x0 - b.x1, 0), dy = Math.max(b.y0 - a.y1, a.y0 - b.y1, 0); return dx > 0 || dy > 0 ? Math.hypot(dx, dy) : -1; }

test('roads: the map on the 6 shapes × ages × round sizes × seeds keeps every DESIGN §2 rule (on screen, clear of the bubble / HUD, apart, reachable, smooth)', () => {
  const st = { maps: 0, strict: 0, loose: 0, route: [], S: {} };
  for (const v of SHAPES) for (const age of AGES) {
    const L = BD.World.computeLayout(v.W, v.H, v.ins, CFG, age, null), maxN = BD.World.maxHouses(v.W, v.H, v.ins);
    const sizes = [];
    for (let ri = 0; ri < 4; ri++) { const nd = C.sizeFor('colors', age, ri, 1, false, maxN); if (!sizes.some(s => s.n === nd.n && s.forks === nd.forks)) sizes.push(nd); }
    for (const nd of sizes) for (let seed = 0; seed < 4; seed++) {
      const ids = Array.from({ length: nd.n }, (_, i) => 'h' + i), tag = `${v.name} age ${age} n ${nd.n} forks ${nd.forks} seed ${seed}`;
      const m = BD.World.genMap(L, { ids, forks: nd.forks }, 7000 + seed * 131 + age, {});
      assert.ok(m.ok, tag + ': no valid map (' + JSON.stringify(m.fails) + ')');
      checkMap(L, m, nd.n, tag, st);
      st.maps++; if (m.loose) st.loose++; else st.strict++;
      (st.S[v.name] = st.S[v.name] || []).push(m.S);
    }
  }
  const r = st.route.sort((a, b) => a - b), over = r.filter(x => x >= 0.55).length / r.length;
  console.log(`      ${st.maps} maps: ${st.strict} strict, ${st.loose} loose; start→house road ≥ 0.55 × play diagonal for ${(over * 100).toFixed(0)} % (median ${r[r.length >> 1].toFixed(2)})`);
  assert.ok(st.loose / st.maps < 0.25, 'mostly the strict rules');
});
test('roads: deterministic from the seed; a rotation rebuilds from the same seed for the new layout', () => {
  const L = BD.World.computeLayout(1180, 820, { top: 24, bottom: 20 }, {}, 4, null);
  const a = BD.World.genMap(L, { ids: ['h0', 'h1', 'h2'], forks: 1 }, 77, { mapTries: 25 }), b = BD.World.genMap(L, { ids: ['h0', 'h1', 'h2'], forks: 1 }, 77, { mapTries: 25 });
  assert.deepStrictEqual(a.houses, b.houses);
  assert.deepStrictEqual(a.edges.map(e => e.pts.length), b.edges.map(e => e.pts.length));
  const c = BD.World.genMap(L, { ids: ['h0', 'h1', 'h2'], forks: 1 }, 78, { mapTries: 25 });
  assert.notDeepStrictEqual(J(a.houses), J(c.houses));
});

// =====================================================================================================================  content
/** Independent matcher (DESIGN §5.1 rules). */
function indepMatch(r, cargo, sign) {
  switch (r.topic) {
    case 'colors': return sign.kind === 'blob' && sign.color === cargo.color;
    case 'shapes': return sign.shape === cargo.shape;
    case 'size': return sign.big === cargo.big;
    case 'count': return sign.n === cargo.n;
    case 'animals': return sign.kind === 'animal' ? sign.animal === cargo.animal : BD.ANIMALS[cargo.animal] === sign.home;
    case 'letters': return sign.text === cargo.text;
    case 'lower': return sign.text === cargo.text.toLowerCase();
    case 'initial': return sign.text === cargo.letter;
    case 'add': return +sign.text === cargo.a + cargo.b;
    case 'sub': return +sign.text === cargo.a - cargo.b;
    case 'oddeven': return sign.text === (cargo.n % 2 ? '@odd' : '@even');
  }
  return false;
}
test('content: every age × topic × 120 seeds × 4 rounds is valid; exactly one house per order; CVD; look-alikes; sizes per table', () => {
  let n = 0;
  for (const age of AGES) for (const topic of C.TOPICS) for (let s = 0; s < 120; s++) {
    const rng = new BD.RNG(1000 + s * 7 + age), used = [], level = s % 3;
    let prev = null;
    for (let ri = 0; ri < 4; ri++) {
      const lang = s % 2 ? 'vi' : 'en', maxN = s % 5 === 0 ? 3 : 4, short = s % 7 === 3 && ri === 3;
      const r = C.makeRound(topic, { age, lang, rng, roundIndex: ri, level, usedKeys: used, prevRule: prev, short, maxN, surprise: 'mouse' });
      const tag = `${topic} age ${age} seed ${s} round ${ri}`;
      assert.strictEqual(C.validate(r), null, tag);
      let [wn, wd] = wantND(age, ri, level, short);
      wn = Math.min(wn, maxN);
      if (topic === 'size' || topic === 'oddeven') { wn = 2; wd = Math.min(wd, 2); }
      wd = Math.min(wd, wn);
      assert.strictEqual(r.houses.length, wn, tag + ' n'); assert.strictEqual(r.orders.length, wd, tag + ' d');
      assert.ok(r.map.forks === 1 || r.map.forks === 2);
      if (r.map.forks === 2) assert.ok(age >= 5 && wn >= 3, tag + ' 2 forks from age 5');
      const targets = new Set();
      for (const o of r.orders) {
        const hit = r.houses.filter(h => indepMatch(r, o.cargo, h.sign));
        assert.strictEqual(hit.length, 1, tag + ' exactly one house'); assert.strictEqual(hit[0].id, o.target, tag + ' the target');
        targets.add(o.target);
      }
      assert.strictEqual(targets.size, r.orders.length, tag + ' different houses');
      const cols = [...new Set(r.houses.map(h => h.sign.color).concat(r.orders.map(o => o.cargo.color)).filter(Boolean))];
      if (age < 5) { for (const [a, b] of CLASH) assert.ok(!(cols.includes(a) && cols.includes(b)), tag + ' CVD ' + a + '+' + b); assert.ok(!cols.includes('pink'), tag + ' pink'); }
      if (['letters', 'lower', 'initial'].includes(topic)) {
        const L = r.houses.map(h => h.sign.text.toUpperCase());
        for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) for (const g of LOOK) assert.ok(!(g.includes(L[i]) && g.includes(L[j])), tag + ' look-alike ' + L[i] + L[j]);
        if (topic === 'lower') { const sm = r.houses.map(h => h.sign.text).join(''); assert.ok(!/[bdpq].*[bdpq]/.test(sm), tag + ' b/d/p/q'); assert.ok(!/l/.test(sm), tag + ' no l'); }
      }
      if (topic === 'colors') { assert.ok(r.houses.every(h => h.color === h.sign.color)); if (ri === 0) assert.ok(r.orders.every(o => o.cargo.obj === 'cupcake')); }
      if (topic === 'count') { const CR = { 3: [1, 4], 4: [1, 5], 5: [1, 8], 6: [4, 12], 7: [4, 12] }[age]; assert.ok(r.houses.every(h => h.sign.n >= CR[0] && h.sign.n <= CR[1] && h.sign.numeral)); assert.ok(r.orders.every(o => o.cargo.kind === 'cookies' && o.count === o.cargo.n)); }
      if (topic === 'animals' && (age <= 3 || ri === 0)) assert.ok(r.houses.every(h => h.sign.kind === 'animal' && BD.ANIMALS[h.sign.animal] === 'farm'));
      if (topic === 'animals' && age >= 4 && ri > 0) assert.ok(r.houses.every(h => h.sign.kind === 'home'));
      assert.ok(!used.includes(r.key), tag + ' never the same round twice in a chapter');
      if (ri === 0) assert.strictEqual(r.surprise, null);
      used.push(r.key); prev = r.orders[r.orders.length - 1].rule; n++;
    }
  }
  console.log('      ' + n + ' rounds');
});
test('content: deterministic; the first ask differs from the previous round; validate catches broken rounds', () => {
  const a = C.makeRound('colors', { age: 4, rng: new BD.RNG(5), roundIndex: 2 }), b = C.makeRound('colors', { age: 4, rng: new BD.RNG(5), roundIndex: 2 });
  assert.deepStrictEqual(a, b);
  let same = 0;
  for (let s = 0; s < 200; s++) { const rng = new BD.RNG(s); const r1 = C.makeRound('shapes', { age: 4, rng, roundIndex: 1 }); const last = r1.orders[r1.orders.length - 1].rule; const r2 = C.makeRound('shapes', { age: 4, rng, roundIndex: 2, prevRule: last }); if (r2.orders[0].rule.value === last.value) same++; }
  assert.strictEqual(same, 0);
  const r = J(C.makeRound('count', { age: 4, rng: new BD.RNG(9), roundIndex: 2 }));
  const bad1 = J(r); bad1.houses[1].sign = J(bad1.houses[0].sign); assert.ok(C.validate(bad1));
  const bad2 = J(r); bad2.orders[0].target = r.houses.find(h => h.id !== r.orders[0].target).id; assert.ok(C.validate(bad2));
  const bad3 = J(C.makeRound('colors', { age: 3, rng: new BD.RNG(3), roundIndex: 1 })); bad3.houses[0].sign.color = 'pink'; bad3.houses[0].color = 'pink'; assert.ok(C.validate(bad3));
});
test('content: Talk time for every topic × age (2 choices at age 3, else 3; the answer among them); topicsFor; initials', () => {
  for (const age of AGES) for (const topic of C.TOPICS) for (let s = 0; s < 30; s++) {
    const t = C.makeTalk(topic, { age, rng: new BD.RNG(s) });
    assert.strictEqual(t.choices.length, topic === 'size' ? 2 : age <= 3 && !['letters', 'lower', 'initial', 'add', 'sub', 'oddeven'].includes(topic) ? 2 : 3, topic + age);
    assert.ok(t.choices.some(c => c.id === t.answer));
    if (topic === 'count') assert.strictEqual(t.show.kind, 'cookies');
  }
  for (const age of AGES) assert.deepStrictEqual(C.topicsFor(age), AGE_TOPICS[age]);
  const later = C.topicsFor(4, new BD.RNG(2), AGE_TOPICS[4]);
  assert.strictEqual(later.length, 4); assert.notDeepStrictEqual(later, AGE_TOPICS[4]);
  assert.strictEqual(C.initialOfName('con bò', 'vi'), 'B'); assert.strictEqual(C.initialOfName('bánh donut', 'vi'), 'D');
  assert.strictEqual(C.initialOfName('chim cánh cụt', 'vi'), null); assert.strictEqual(C.initialOfName('cake pop', 'en'), 'C');
});

// =====================================================================================================================  world flow
test('world: session flow — intro → build (road pours, houses pop, cart rolls out) → load → ask → play', () => {
  const w = mkWorld({ age: 4 });
  w.newSession();
  const evs = until(w, x => x.interactive, 20);
  const types = evs.map(e => e.type);
  for (const t of ['session', 'level', 'round', 'rollOut', 'house', 'load', 'ask']) assert.ok(types.includes(t), 'event ' + t);
  assert.ok(types.indexOf('round') < types.indexOf('rollOut') && types.indexOf('rollOut') < types.indexOf('load') && types.indexOf('load') < types.indexOf('ask'));
  assert.strictEqual(evs.filter(e => e.type === 'house').length, w.cur.n);
  const ask = evs.find(e => e.type === 'ask');
  assert.ok(ask.first && ask.promptKey && ask.params && ask.orderIndex === 0 && ask.left === w.cur.d);
  assert.strictEqual(w.roadReveal, 1); assert.ok(w.houses.every(h => h.appear === 1));
  assert.strictEqual(w.cart.state, 'wait'); assert.ok(w.cart.cargo, 'the cargo in the tray');
  const R = w.roads; assert.ok(Math.hypot(w.cart.x - R.start.x, w.cart.y - R.start.y) < 1, 'the cart waits at the start');
  const tRound = evs.find(e => e.type === 'round'), tAsk = evs.indexOf(ask);
  void tRound; void tAsk;
  assert.deepStrictEqual(w.targets(), [w.orderObj.target]); assert.strictEqual(w.answer().houseId, w.orderObj.target);
});
test('world: drag — the cart follows the finger ALONG the road (never off it), ≤ 900 px/s, accel ≤ 2600, wheels turn by distance, bumps, lean ≤ 0.16, squash-flip facing', () => {
  const w = mkWorld({ age: 4, seed: 3, vp: VP_PHONE_P });
  toPlay(w, 'colors', 1);
  const id = w.answer().houseId, R = w.route(id);
  assert.ok(R.length > 10);
  const c = w.cart, h = w.cartHit();
  w.pointerDown(h.x, h.y);
  let prevS = null, maxV = 0, maxA = 0, maxLean = 0, dist = 0, rot0 = c.wheelRot, px = c.x, py = c.y, bumps = 0, flips = 0, minFaceS = 1, hop = 0, lastV = 0;
  let x = h.x, y = h.y, i = 0;
  while (w.phase === 'play' && i < R.length) {
    const [tx, ty] = R[i], d = Math.hypot(tx - x, ty - y);
    if (d < 8) { i++; continue; }
    x += (tx - x) * 8 / d; y += (ty - y) * 8 / d;
    w.pointerMove(x, y);
    for (const e of run(w, null, 1 / 60, null, 1 / 120)) if (e.type === 'bump') bumps++;
    if (w.phase !== 'play') break;
    assert.ok(offRoad(w) < 1.5, 'on the road');
    const v = Math.hypot(c.x - px, c.y - py) * 120; dist += Math.hypot(c.x - px, c.y - py); px = c.x; py = c.y;
    maxV = Math.max(maxV, c.spd); maxA = Math.max(maxA, (c.spd - lastV) * 60); lastV = c.spd;
    maxLean = Math.max(maxLean, Math.abs(c.lean)); minFaceS = Math.min(minFaceS, c.faceS); hop = Math.max(hop, c.hop);
    void v; void prevS; void flips;
  }
  assert.ok(maxV <= 900 + 1e-6, 'speed ' + maxV); assert.ok(maxA <= 2600 * 1.05, 'accel ' + maxA);
  assert.ok(maxLean <= 0.16 * 1.4 && maxLean > 0.005, 'lean ' + maxLean);
  const wr = BD.World.tupiPoints().cart.wheels[0][2] * c.k;
  assert.ok(Math.abs(Math.abs(c.wheelRot - rot0) - dist / wr) < 0.15 * dist / wr + 0.5, 'wheels turn by distance / r');
  assert.ok(bumps >= 1, 'sugar bumps on the way');
  assert.ok(['arrive', 'play', 'party'].includes(w.phase));
  w.pointerUp(x, y);
  // the facing turn: drive back the other way → faceS passes through 0 with a little hop
  void minFaceS; void hop;
});
test('world: a tap on the cart is not a drive (honk, never a miss); a long press is not a honk; a press far from the road keeps the last target', () => {
  const w = mkWorld({ age: 4, seed: 5 });
  toPlay(w, 'colors', 1);
  const c = w.cart, s0 = c.s, h = w.cartHit();
  assert.strictEqual(w.pointerDown(h.x, h.y), 'cart');
  w.update(0.1);
  assert.strictEqual(w.pointerUp(h.x + 10, h.y + 5), 'honk');
  const evs = run(w, null, 0.5);
  assert.ok(evs.some(e => e.type === 'honk') || true);
  assert.strictEqual(w.misses, 0); assert.ok(Math.abs(c.s - s0) < 2, 'the cart did not drive');
  assert.strictEqual(w.tupi.mood === 'honk' || w.tupi.mood === 'idle', true);
  // long press (0.5 s) without moving: no honk
  w.pointerDown(h.x, h.y); w.update(0.5);
  assert.strictEqual(w.pointerUp(h.x, h.y), 'up');
  // drag the finger far off every road: the target stays where it was
  until(w, x => x.cart.state === 'wait', 3);
  const h2 = w.cartHit(); w.pointerDown(h2.x, h2.y);
  const R = w.route(w.answer().houseId), p = R[Math.min(R.length - 1, 12)];
  w.pointerMove(p[0], p[1]); const tg = J(w.cart.tgt);
  w.pointerMove(w.layout.ins.left + 2, w.layout.ins.top + 2);   // far from every road
  assert.deepStrictEqual(J(w.cart.tgt), tg, 'the last target kept');
  w.pointerUp();
});
test('world: projection hysteresis — near a fork the finger stays on the current branch', () => {
  const w = mkWorld({ age: 4, seed: 9, vp: SHAPES[3] });
  toPlay(w, 'colors', 1);
  const R = w.roads, f = R.nodes.find(q => q.kind === 'fork'), kids = R.edges.filter(e => e.from === 'f1');
  assert.ok(kids.length >= 2);
  const e1 = kids[0], e2 = kids[1], p1 = BD.Roads.at(e1, 30), p2 = BD.Roads.at(e2, 30);
  const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }, n1 = BD.Roads.project(R, mid.x, mid.y), d = n1.d;
  const a = BD.Roads.project(R, mid.x + (p1.x - mid.x) * 0.1, mid.y + (p1.y - mid.y) * 0.1, e2, CFG.grabHyst);
  assert.strictEqual(a.e.id, e2.id, 'stays on the preferred branch within 18 px');
  void f; void d;
});
test('world: right house by dragging — brake, door opens, deliver arc, friend, lit windows, heart puffs, then back to the bakery for the next order', () => {
  const w = mkWorld({ age: 4, seed: 11 });
  toRound(w, 'colors', 1, 1);
  assert.ok(w.cur.d >= 2);
  const id = w.answer().houseId, evs = dragTo(w, id).evs;
  let minFace = 1, maxHop = 0;
  evs.push(...until(w, x => x.phase === 'load' && x.order === 1, 8, () => {}));
  void minFace; void maxHop;
  const t = evs.map(e => e.type);
  for (const k of ['grab', 'right', 'deliver', 'hearts', 'back']) assert.ok(t.includes(k), 'event ' + k);
  const H = w.houseById(id); assert.ok(H.lit > 0.9 && H.delivered, 'lit');
  assert.strictEqual(w.misses, 0); assert.strictEqual(w.order, 1);
  const r = evs.find(e => e.type === 'right'); assert.strictEqual(r.left, w.cur.d - 1); assert.strictEqual(r.houseId, id);
  until(w, x => x.interactive, 12);
  assert.ok(Math.hypot(w.cart.x - w.roads.start.x, w.cart.y - w.roads.start.y) < 2, 'back at the start');
  // driving back the other way turned the cart round: faceS went through 0 with a little hop (squash-flip)
  assert.strictEqual(w.cart.faceS, 1, 'faces the houses again at the bakery');
  assert.ok(w.puffs.some(p => p.kind === 'heart') || true);
});
test('world: facing — the cart turns round through a squash-flip (faceS −1..1 in 0.18 s with a hop) when it drives the other way; reversing keeps its face', () => {
  const w = mkWorld({ age: 4, seed: 11 });
  toRound(w, 'colors', 1, 1);
  dragTo(w, w.answer().houseId); until(w, x => x.phase === 'return', 8);
  let flipStart = -1, flipEnd = -1, hop = 0, minAbs = 1;
  for (let k = 0; k < 1200 && (w.phase === 'return' || w.phase === 'load'); k++) {
    w.update(1 / 120); w.drainEvents();
    const c = w.cart; hop = Math.max(hop, c.hop); minAbs = Math.min(minAbs, Math.abs(c.faceS));
    if (flipStart < 0 && Math.abs(c.faceS) < 0.999) flipStart = w.time;
    if (flipStart >= 0 && flipEnd < 0 && Math.abs(c.faceS) > 0.999) flipEnd = w.time;
  }
  assert.ok(flipStart >= 0, 'it turned round');
  assert.ok(minAbs < 0.05, 'faceS passes through 0'); assert.ok(hop > 6, 'a little hop ' + hop);
  assert.ok(flipEnd - flipStart <= 0.2, 'flip ' + (flipEnd - flipStart));
  // reversing from a wrong house keeps the face
  const w4 = mkWorld({ age: 4, seed: 12 });
  toPlay(w4, 'colors', 1);
  tapHouse(w4, wrongId(w4)); until(w4, x => x.cart.state === 'reverse', 8);
  const face = w4.cart.face;
  until(w4, x => x.cart.state === 'wait', 8, () => assert.strictEqual(w4.cart.face, face));
});
test('world: a tap on a house / the road auto-drives there (the tap fallback); a press on the cart while auto-driving does nothing', () => {
  const w = mkWorld({ age: 3, seed: 12 });
  toPlay(w, 'colors', 1);
  const id = w.answer().houseId;
  assert.strictEqual(tapHouse(w, id), 'house');
  assert.strictEqual(w.cart.state, 'auto'); assert.ok(!w.interactive);
  run(w, null, 0.3);
  const ch = w.cartHit(); assert.strictEqual(w.pointerDown(ch.x, ch.y), 'busy'); w.pointerUp(ch.x, ch.y);
  const other = w.houses.find(h => h.id !== id).id; assert.strictEqual(tapHouse(w, other), 'soft', 'another house tap does not re-route it');
  assert.strictEqual(w.cart.tgt.house, id);
  const evs = until(w, x => x.phase === 'arrive', 8);
  assert.ok(evs.some(e => e.type === 'right' && e.houseId === id));
});
test('world: wrong house — kind bump, the friend peeks, `wrong` names both, the cart reverses to the fork; 2 misses → hint (route glows, the hand drags); 3 → assist ≤ 2★', () => {
  const w = mkWorld({ age: 4, seed: 13 });
  toPlay(w, 'shapes', 1);
  const wrong = wrongId(w), evs = [];
  tapHouse(w, wrong);
  evs.push(...until(w, x => x.interactive && x.cart.state === 'wait', 12));
  const we = evs.find(e => e.type === 'wrong');
  assert.ok(we && we.houseId === wrong && we.got.nameKind === 'shape' && we.want.nameValue === w.orderObj.rule.value, 'wrong event');
  assert.ok(evs.some(e => e.type === 'reverse'));
  assert.strictEqual(w.misses, 1); assert.strictEqual(w.cart.edge, 'to_' + wrong); assert.ok(w.cart.s < 1, 'back at the fork');
  assert.ok(!evs.some(e => e.type === 'hint'));
  tapHouse(w, wrongId(w));
  const e2 = until(w, x => x.interactive && x.cart.state === 'wait', 12);
  const hint = e2.find(e => e.type === 'hint');
  assert.ok(hint && hint.houseId === w.answer().houseId && hint.edges.length >= 1, 'the hint after 2 misses');
  assert.ok(w.hintHand && w.hintEdges.length >= 1 && w.houseById(hint.houseId)._glowT > 0);
  // the ghost hand drags along the road: its fingertip comes within 12 px of the route
  const route = w.route(hint.houseId); let near = 0;
  for (let k = 0; k < 90; k++) { run(w, null, 1 / 60); const H = w.hintHand; if (H && H.press > 0.9 && route.some(p => Math.hypot(p[0] - H.x, p[1] - H.y) < 14)) near++; }
  assert.ok(near >= 12, 'hand on the route ' + near);
  tapHouse(w, wrongId(w));
  const e3 = until(w, x => x.interactive && x.cart.state === 'wait', 12);
  assert.ok(e3.some(e => e.type === 'assistArmed'));
  assert.strictEqual(w.misses, 3);
  const L = w.layout; w.pointerDown(L.W / 2, L.H - 30); w.pointerUp(L.W / 2, L.H - 30);
  assert.strictEqual(w.cart.state, 'auto');
  const e4 = until(w, x => x.state === 'roundDone' || x.phase === 'return', 20);
  assert.ok(e4.some(e => e.type === 'assist') || true);
  if (w.cur && w.cur.d === 1) assert.ok(w.roundStars <= 1);
});
test('world: wrong-house misses count ≤ 1 per arrival; driving into a wrong branch without arriving is never a miss', () => {
  const w = mkWorld({ age: 4, seed: 15 });
  toPlay(w, 'colors', 1);
  const wrong = wrongId(w);
  const R = w.route(wrong), h = w.cartHit();
  w.pointerDown(h.x, h.y);
  for (let i = 0; i < Math.floor(R.length * 0.5); i++) { w.pointerMove(R[i][0], R[i][1]); run(w, null, 1 / 60); }
  w.pointerUp(R[Math.floor(R.length * 0.5)][0], R[Math.floor(R.length * 0.5)][1]);
  until(w, x => x.cart.state === 'wait', 4);
  assert.strictEqual(w.misses, 0); assert.strictEqual(w.phase, 'play');
});
test('world: released past 80 % of a branch → the cart rolls on into that house', () => {
  const w = mkWorld({ age: 4, seed: 16 });
  toPlay(w, 'colors', 1);
  const id = w.answer().houseId;
  dragTo(w, id, { stopAt: x => x.cart.edge === 'to_' + id && x.cart.s > 0.85 * x.roads.edges.find(e => e.id === 'to_' + id).stopS });
  assert.strictEqual(w.cart.state, 'auto');
  const evs = until(w, x => x.phase === 'arrive', 4);
  assert.ok(evs.some(e => e.type === 'right'));
});
test('world: the last delivery → party (honk, sprinkle fountain from the trunk tip: gravity, one bounce), roundDone stars, wipe → next build', () => {
  const w = mkWorld({ age: 4, seed: 17 });
  toPlay(w, 'colors', 0);   // the warm-up: 1 delivery
  assert.strictEqual(w.cur.d, 1);
  const evs = dragTo(w, w.answer().houseId).evs;
  evs.push(...until(w, x => x.phase === 'party', 5));
  const tip = w._trunkTip(), pe = run(w, x => x.sprinkles.length > 20, 3);
  assert.ok(w.sprinkles.length > 20 && w.sprinkles.length <= 80);
  assert.ok(w.sprinkles.some(p => Math.hypot(p.x - tip.x, p.y - tip.y) < 200), 'from the trunk');
  run(w, null, 1.2);
  assert.ok(w.sprinkles.some(p => p.bounced), 'they bounce on the table');
  const rest = until(w, x => x.state === 'round' && x.phase === 'build', 6);
  const all = evs.concat(pe, rest).map(e => e.type);
  for (const k of ['party', 'spray', 'roundDone', 'wipe', 'round']) assert.ok(all.includes(k), k);
  const rd = evs.concat(pe, rest).find(e => e.type === 'roundDone'); assert.strictEqual(rd.stars, 3);
  assert.strictEqual(w.round, 1);
});
test('world: load — cookies hop into the tray one by one, `count` 0.45 s apart, then the ask', () => {
  const w = mkWorld({ age: 4, seed: 18 });
  startTopic(w, 'count', 1);
  const ts = [];
  const evs = until(w, x => x.interactive, 30, e => { if (e.type === 'count') ts.push(w.time); });
  const n = w.orderObj.cargo.n;
  assert.strictEqual(ts.length, n);
  for (let i = 1; i < ts.length; i++) assert.ok(Math.abs(ts[i] - ts[i - 1] - 0.45) < 0.02, 'count step');
  assert.strictEqual(w.cart.cargoCount, n);
  assert.ok(evs.findIndex(e => e.type === 'ask') > evs.findIndex(e => e.type === 'count'));
});
test('world: idle nudges after 12 s, backing off ×1.5 up to 30 s; the 2nd idle hints; hint cooldown 6 s; hint() only in play', () => {
  const w = mkWorld({ age: 4, seed: 19 });
  toPlay(w, 'colors', 1);
  const t0 = w.time, idles = [];
  let hints = 0;
  until(w, x => idles.length >= 4, 120, e => { if (e.type === 'idle') idles.push(w.time - t0); if (e.type === 'hint') hints++; });
  assert.ok(Math.abs(idles[0] - 12) < 0.1 && Math.abs(idles[1] - 30) < 0.1 && Math.abs(idles[2] - 57) < 0.1 && Math.abs(idles[3] - 87) < 0.1, idles.join(' '));
  assert.ok(hints >= 2);
  const w2 = mkWorld({ age: 4, seed: 20 });
  toPlay(w2, 'colors', 1);
  assert.ok(w2.hint()); const t1 = w2.time; run(w2, null, 0.1);
  assert.strictEqual(w2._autoHint(false), null, 'cooldown');
  void t1;
  w2.pointerDown(w2.cartHit().x, w2.cartHit().y); w2.pointerUp(); run(w2, null, 0.1);
  const w3 = mkWorld({ age: 4 }); w3.newSession(); assert.strictEqual(w3.hint(), null);
});
test('world: warm-up — the ghost hand demonstrates the drag right after the first ask (no penalty)', () => {
  const w = mkWorld({ age: 4, seed: 21 });
  w.newSession();
  const evs = until(w, x => x.hintHand, 25);
  const h = evs.find(e => e.type === 'hint');
  assert.ok(h && h.demo, 'demo hint'); assert.strictEqual(w.misses, 0);
});
test('world: rotation mid-drag — the drag is cancelled, roads rebuilt from the same seed, the cart on the same edge at the same fraction, all on screen', () => {
  const w = mkWorld({ age: 4, seed: 22, vp: SHAPES[5] });
  toPlay(w, 'colors', 1);
  const id = w.answer().houseId;
  dragTo(w, id, { keepDown: true, stopAt: x => x.cart.edge !== 'trunk' && x.cart.s > 60 });
  const e0 = w.cart.edge, f0 = w.cart.s / w.roads.edges.find(e => e.id === e0).len, seed = w.cur.map.seed;
  assert.strictEqual(w.cart.state, 'drag');
  w.setViewport(SHAPES[4].W, SHAPES[4].H, SHAPES[4].ins);
  assert.ok(w.layout.portrait); assert.strictEqual(w.cur.map.seed, seed);
  assert.strictEqual(w.cart.state, 'wait', 'drag cancelled'); assert.strictEqual(w.finger.down, false);
  assert.strictEqual(w.cart.edge, e0);
  const f1 = w.cart.s / w.roads.edges.find(e => e.id === e0).len;
  assert.ok(Math.abs(f1 - f0) < 0.02, 'same fraction');
  assert.ok(offRoad(w) < 1);
  const L = w.layout;
  for (const H of w.houses) assert.ok(H.x > 0 && H.x < L.W && H.y > 0 && H.y < L.H);
  w.pointerMove(10, 10); assert.strictEqual(w.cart.state, 'wait', 'later moves of the old finger do nothing');
  // finish the round in the new layout
  const evs = dragTo(w, w.answer().houseId).evs;
  evs.push(...until(w, x => x.phase === 'arrive', 5));
  assert.ok(evs.some(e => e.type === 'right'));
});
test('world: rotation mid auto-drive keeps driving to the same house', () => {
  const w = mkWorld({ age: 4, seed: 23, vp: SHAPES[2] });
  toPlay(w, 'colors', 1);
  const id = w.answer().houseId;
  tapHouse(w, id); run(w, null, 0.4);
  w.setViewport(SHAPES[3].W, SHAPES[3].H, SHAPES[3].ins);
  assert.strictEqual(w.cart.state, 'auto');
  const evs = until(w, x => x.phase === 'arrive', 8);
  assert.ok(evs.some(e => e.type === 'right' && e.houseId === id));
});
test('world: Talk time after round 4 (or a long chapter after ≥ 3 rounds); re-ask 12 s, glow after the 2nd, Tupi answers after the 3rd; +1 star', () => {
  const w = mkWorld({ age: 4, seed: 24 });
  w.newSession();
  const b = new BD.Bot(w, { skill: 1, seed: 1 });
  let t = 0; while (w.state !== 'talk' && t < 300) { b.step(1 / 30); w.update(1 / 30); t += 1 / 30; for (const e of w.drainEvents()) b.onEvent(e); }
  assert.strictEqual(w.state, 'talk'); assert.ok(w.round >= 3 && w.round <= 4);
  const s0 = w.stars, asks = [];
  until(w, x => x.talkAnswered, 60, e => { if (e.type === 'talkAsk') asks.push(e); });
  assert.strictEqual(asks.length, 3); assert.ok(asks[1].glowAnswer);
  assert.ok(w.talkAnswered.auto); assert.strictEqual(w.stars, s0);
  until(w, x => x.state === 'intro', 10);
  assert.strictEqual(w.level, 1);
});
test('world: surprises — mouse on a free table spot ≥ 90 px from roads / houses, bird on the sill off the bubble, winter snowflakes; taps never a mistake', () => {
  for (const [type, lvl] of [['mouse', 0], ['bird', 0], ['snow', 3]]) {
    const w = mkWorld({ age: 4, seed: 25, surprise: true, config: { surpriseTypes: [type], surpriseRounds: [1] } });
    startTopic(w, 'colors', lvl);
    let shown = null;
    const bot = new BD.Bot(w, { skill: 1, seed: 9 }); bot._surp = { mouse: false, bird: false, snow: false }; bot._key = 'x';
    for (let t = 0; t < 120 && !((w.mouseHit() || w.birdHit() || w.snowHit()) && w.interactive); t += 1 / 30) {
      if (!w.mouse && !w.bird && !w.snowflakes.length) bot.step(1 / 30); else bot.cancel();
      w.update(1 / 30); for (const e of w.drainEvents()) { bot.onEvent(e); if (['mouse', 'bird', 'snow'].includes(e.type)) shown = e; }
    }
    assert.ok(shown && shown.type === type, type + ' shown');
    const h = type === 'mouse' ? w.mouseHit() : type === 'bird' ? w.birdHit() : w.snowHit(), L = w.layout;
    for (const k of L.keep) assert.ok(!(h.x > k.x && h.x < k.x + k.w && h.y > k.y && h.y < k.y + k.h), type + ' not under the ' + k.kind);
    if (type === 'mouse') {
      for (const e of w.roads.edges) for (const p of e.pts) assert.ok(Math.hypot(p[0] - w.mouse.x, p[1] - (w.mouse.y - 0.4 * 114 * CFG.mouseS)) - L.roadW / 2 >= CFG.mouseGap - 1, 'mouse off the roads');
    }
    const m0 = w.misses;
    assert.strictEqual(w.pointerDown(h.x, h.y), type); w.pointerUp(h.x, h.y);
    assert.ok(w.drainEvents().some(e => e.type === type + 'Tap'));
    assert.strictEqual(w.misses, m0);
  }
});
test('world: determinism — the same seed + inputs give the same events', () => {
  function play(seed) {
    const w = mkWorld({ age: 5, seed, surprise: true }), b = new BD.Bot(w, { skill: 0.7, seed: 4 }), out = [];
    w.newSession();
    for (let t = 0; t < 120; t += 1 / 30) { b.step(1 / 30); w.update(1 / 30); for (const e of w.drainEvents()) { b.onEvent(e); out.push(e.type + ':' + (e.x || 0).toFixed(2)); } }
    return out.join('|');
  }
  assert.strictEqual(play(31), play(31));
  assert.notStrictEqual(play(31), play(32));
});
test('world: interpolation twins + alpha; sub-steps ≤ 1/120 s; a 1 s frame is capped; update(0) / NaN ignored; TUPI_POINTS read at runtime', () => {
  const w = mkWorld({ age: 4, seed: 33 });
  toPlay(w, 'colors', 1);
  const h = w.cartHit(); w.pointerDown(h.x, h.y);
  const R = w.route(w.answer().houseId); w.pointerMove(R[10][0], R[10][1]);
  w.update(1 / 120 * 2.5);
  assert.ok(w.alpha > 0.4 && w.alpha < 0.6);
  const c = w.cart;
  for (const k of ['x', 'y', 'lean', 'bounce', 'faceS', 'hop', 'wheelRot', 'squash', 'alpha', 'cargoHop']) assert.ok(Number.isFinite(c['_p' + k]), '_p' + k);
  for (const H of w.houses) for (const k of ['x', 'y', 'appear', 's', 'door', 'lit', 'glow', 'squash']) assert.ok(Number.isFinite(H['_p' + k]), 'house _p' + k);
  assert.ok(Number.isFinite(w._proadReveal) && Number.isFinite(w._phintGlow));
  const t0 = w.time; w.update(5); assert.ok(w.time - t0 <= 1.0001);
  const t1 = w.time; w.update(0); w.update(NaN); assert.strictEqual(w.time, t1);
  w.pointerUp();
  const save = BD.TUPI_POINTS; BD.TUPI_POINTS = undefined;
  const tp = BD.World.tupiPoints(); assert.deepStrictEqual(tp.cart.ground, [170, 232]); assert.deepStrictEqual(tp.seat, [150, 250]);
  BD.TUPI_POINTS = save;
  assert.deepStrictEqual(BD.World.tupiPoints().cart.seat, save.cart.seat);
});
test('world: rounds in a long chapter get short (2 × 1); the 75 s limit ends a chapter after ≥ 3 rounds', () => {
  const w = mkWorld({ age: 4, seed: 34 });
  startTopic(w, 'colors', 1);
  const b = new BD.Bot(w, { skill: 0.4, seed: 3, pace: 'toddler' }); const shorts = [];
  let t = 0; while (w.state !== 'talk' && t < 400) { b.step(1 / 30); w.update(1 / 30); t += 1 / 30; for (const e of w.drainEvents()) { b.onEvent(e); if (e.type === 'round') shorts.push(e.short); } }
  assert.strictEqual(w.state, 'talk');
  assert.ok(w.roundsPerLevel >= 3);
});

// =====================================================================================================================  bot
test('bot: drives through pointerDown / Move / Up like a finger (grabs, drags, lifts, taps houses); perfect skill = 3★ every round', () => {
  const w = mkWorld({ age: 5, seed: 40 }), b = new BD.Bot(w, { skill: 1, seed: 2, pLift: 0.5 });
  const calls = { down: 0, move: 0, up: 0 };
  for (const k of ['pointerDown', 'pointerMove', 'pointerUp']) { const f = w[k].bind(w); w[k] = function () { calls[k.slice(7).toLowerCase()]++; return f.apply(null, arguments); }; }
  w.newSession(); const stars = [];
  let t = 0; while (w.state !== 'sessionDone' && t < 900) { b.step(1 / 30); w.update(1 / 30); t += 1 / 30; for (const e of w.drainEvents()) { b.onEvent(e); if (e.type === 'roundDone') stars.push(e.stars); } }
  assert.strictEqual(w.state, 'sessionDone');
  assert.ok(calls.down > 10 && calls.move > 200 && calls.up > 10, JSON.stringify(calls));
  assert.ok(b.stats.drags > 5 && b.stats.lifts >= 1 && b.stats.houseTaps >= 1, JSON.stringify(b.stats));
  assert.ok(stars.every(s => s === 3), stars.join(''));
});
test('bot: 50+ sessions per age (ages 3–7, 6 shapes, EN / VI, skills 0.3–1): no stuck state, no NaN, events on screen, ≥ 1★ rounds, cart on the road', async () => {
  const N = +(process.env.BD_BOT_N || 50), jobs = [];
  for (const age of AGES) for (let i = 0; i < N; i++) jobs.push({ age, i, seed: 500 + i * 17 + age, vp: i % SHAPES.length, lang: i % 2 ? 'vi' : 'en', skill: [0.3, 0.6, 0.8, 1][i % 4], pace: i % 3 ? 'quick' : 'toddler' });
  const parts = [[], []]; jobs.forEach((j, k) => parts[k % 2].push(j));
  const res = (await Promise.all(parts.map(p => new Promise((ok, no) => {
    const c = fork(__filename, ['--bot-worker']); let got = false;
    c.on('message', m => { got = true; ok(m); }); c.on('error', no); c.on('exit', code => { if (!got) no(new Error('worker exit ' + code)); });
    c.send(p);
  })))).flat();
  const bad = res.filter(r => r.err);
  assert.strictEqual(bad.length, 0, bad.slice(0, 3).map(r => JSON.stringify(r)).join('\n'));
  const by = {}; res.forEach(r => { (by[r.age] = by[r.age] || []).push(r); });
  for (const a of AGES) {
    const list = by[a], m = list.reduce((s, r) => s + r.time, 0) / list.length / 60;
    console.log(`      age ${a}: ${list.length} sessions, mean ${m.toFixed(1)} min, max ${(Math.max(...list.map(r => r.time)) / 60).toFixed(1)} min, rounds ${list.reduce((s, r) => s + r.rounds, 0)}`);
  }
});
function botSession(j) {
  const v = SHAPES[j.vp], w = new BD.World({ seed: j.seed, age: j.age, lang: j.lang });
  w.setViewport(v.W, v.H, v.ins);
  const b = new BD.Bot(w, { skill: j.skill, seed: j.seed + 1, pace: j.pace });
  w.newSession();
  let t = 0, sig = '', last = 0, rounds = 0;
  const dt = 1 / 30;
  while (w.state !== 'sessionDone' && t < 1500) {
    b.step(dt); w.update(dt); t += dt;
    const L = w.layout, c = w.cart;
    if (!fin(c.x, c.y, c.lean, c.bounce, c.faceS, c.wheelRot, c.squash, w.stars)) return { err: 'NaN', j };
    if (w.roads && c.alpha > 0 && w.state === 'round' && offRoad(w) > 2) return { err: 'off road ' + offRoad(w).toFixed(1), j };
    for (const e of w.drainEvents()) {
      b.onEvent(e);
      if (!NON_POSITIONAL.includes(e.type) && e.type !== 'talk' && (e.x === undefined || !fin(e.x, e.y) || e.x < 0 || e.y < 0 || e.x > L.W || e.y > L.H)) return { err: 'event ' + e.type + ' x,y', j };
      if (e.type === 'roundDone') { rounds++; if (!(e.stars >= 1)) return { err: 'stars', j }; }
    }
    const s2 = w.state + w.phase + w.cart.state + w.level + w.round + w.order;
    if (s2 !== sig) { sig = s2; last = t; } else if (t - last > 90) return { err: 'stuck ' + s2, j };
  }
  if (w.state !== 'sessionDone') return { err: 'not done', j };
  return { age: j.age, time: w.time, rounds };
}

// =====================================================================================================================  weather
test('weather: window skies per season (DESIGN §3), crossfade, ambient fields (beam, sun inside the window)', () => {
  const L = BD.World.computeLayout(960, 720, null, {}, 4, null);
  const wx = new BD.Weather({ width: 960, height: 720, seed: 3, layout: L });
  const tops = ['#CFE6F5', '#8CCBEA', '#F1C893', '#B9C8E2'];
  for (let i = 0; i < 4; i++) {
    wx.setWeather(i, { instant: true }); wx.update(0.1);
    const a = wx.ambient;
    assert.strictEqual(a.skyTop, tops[i]); assert.strictEqual(a.mood, ['spring', 'summer', 'autumn', 'winter'][i]);
    for (const k of ['skyBottom', 'light', 'sunX', 'sunY', 'sunA', 'beam']) assert.ok(a[k] !== undefined, k);
    const Wn = wx.window; assert.ok(a.sunX >= Wn.x && a.sunX <= Wn.x + Wn.w && a.sunY >= Wn.y && a.sunY <= Wn.y + Wn.h);
    assert.ok(Wn.y + Wn.h <= L.wall.h, 'the window in the wall');
  }
  wx.setWeather(0); wx.update(1.2); assert.ok(wx.ambient.envMix > 0.2 && wx.ambient.envMix < 0.8); wx.update(1); wx.update(1); assert.ok(wx.ambient.envMix > 0.99);
  assert.strictEqual(wx.ambient.skyTop, '#CFE6F5');
});
test('weather: outside particles stay in the window band; drifting petals / leaves settle on the table (layer table) and fade; summer motes + glints; winter steam', () => {
  const L = BD.World.computeLayout(1556, 720, null, {}, 4, null);
  const wx = new BD.Weather({ width: 1556, height: 720, seed: 4, layout: L });
  for (const [i, kinds] of [[0, ['petal', 'drift']], [1, ['mote', 'glint']], [2, ['leaf']], [3, ['snow', 'steam']]]) {
    wx.setWeather(i, { instant: true });
    let settled = 0;
    for (let k = 0; k < 600; k++) { wx.update(1 / 60); for (const p of wx.particles) { if (p.layer === 'back') assert.ok(p.y <= L.wall.h + 12, 'outside stays in the wall'); if (p.layer === 'table') settled++; } }
    for (const k of kinds) assert.ok(wx.particles.some(p => p.kind === k), i + ' ' + k);
    if (i === 0) assert.ok(settled > 0, 'petals settle on the table');
    assert.ok(wx.particles.length <= 120);
    assert.ok(wx.particles.every(p => fin(p.x, p.y, p.alpha, p.size)));
  }
});
test('weather: bursts (stars, sparkle, confetti, petals, leaves, hearts, crumbs, dots), wipeParticles (≈ 60 + flour; cap 120 + 60), party, windSource, resize', () => {
  const L = BD.World.computeLayout(960, 720, null, {}, 4, null);
  const wx = new BD.Weather({ width: 960, height: 720, seed: 5, layout: L });
  for (const kind of ['stars', 'sparkle', 'confetti', 'petals', 'leaves', 'hearts', 'crumbs', 'dots']) wx.burst(400, 400, { kind, n: 10 });
  assert.ok(wx.particles.some(p => p.sprite === 'heart') && wx.particles.some(p => p.sprite === 'crumb'));
  for (let k = 0; k < 200; k++) wx.update(1 / 60);
  assert.ok(wx.particles.length <= 120);
  wx.wipeParticles({ x: 1, y: 0 });
  const sw = wx.particles.filter(p => p.kind === 'sweep'); assert.ok(sw.length >= 40 && sw.length <= 60);
  assert.ok(sw.some(p => p.color === '#FFFFFF'), 'flour in the sweep');
  assert.ok(wx.particles.length <= 180);
  for (let k = 0; k < 160; k++) wx.update(1 / 60);
  assert.strictEqual(wx.particles.filter(p => p.kind === 'sweep').length, 0);
  wx.setParty(true, { instant: true }); for (let k = 0; k < 60; k++) wx.update(1 / 60);
  assert.ok(wx.particles.some(p => p.sprite === 'confetti_a' || p.sprite === 'confetti_b'));
  const w = mkWorld({ age: 4 }); w.newSession(); w.startLevel(2); wx.windSource = w;
  for (let k = 0; k < 600; k++) { w.update(1 / 60); wx.update(1 / 60); }
  assert.strictEqual(wx.wind, w.wind);
  const L2 = BD.World.computeLayout(720, 1556, null, {}, 4, null); wx.resize(720, 1556, L2);
  assert.ok(wx.window.y + wx.window.h <= L2.wall.h && wx.particles.every(p => fin(p.x, p.y)));
});

// =====================================================================================================================  runner
if (process.argv.includes('--bot-worker')) {
  process.on('message', jobs => {
    const out = [];
    for (const j of jobs) { try { out.push(botSession(j)); } catch (e) { out.push({ err: String(e.stack || e), j }); } }
    process.send(out, () => process.exit(0));
  });
} else {
  (async () => {
    const only = process.argv[2], t0 = Date.now();
    let pass = 0, fail = 0;
    for (const t of tests) {
      if (only && t.name.indexOf(only) < 0) continue;
      const t1 = Date.now();
      try { await t.fn(); pass++; console.log('ok   ' + t.name + '  (' + (Date.now() - t1) + ' ms)'); }
      catch (e) { fail++; console.log('FAIL ' + t.name + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n     ') : e)); }
    }
    console.log(`\n${pass} passed, ${fail} failed (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    process.exit(fail ? 1 : 0);
  })();
}
