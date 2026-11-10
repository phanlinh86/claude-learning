#!/usr/bin/env node
// Kiki's Camp Chimes — headless unit tests for rng / content / world / weather / bot.
// Run from the game folder:   node tests/unit/run.js [name part]      (exit 1 on any failure)
// (tests/unit/i18n_voice.test.js and chime_art.test.js are the other engineers' suites and run on their own.)
'use strict';
const assert = require('assert');
const { load } = require('./load');

const CC = load();
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const H = 1 / 120;
const AGES = [3, 4, 5, 6, 7];
const C = CC.Content;
const CFG = CC.CONFIG;
const TOPICS = C.TOPICS;
const J = v => JSON.parse(JSON.stringify(v));   // objects from the vm sandbox have other prototypes
assert.deepStrictEqual = ((orig) => (a, b, m) => orig(J(a), J(b), m))(assert.deepStrictEqual);

// independent copies of the DESIGN tables (§3, §5.1)
const AGE_TOPICS = { 3: ['colors', 'shapes', 'size', 'animals'], 4: ['colors', 'shapes', 'count', 'animals'],
  5: ['shapes', 'count', 'letters', 'animals'], 6: ['lower', 'initial', 'add', 'count'], 7: ['initial', 'add', 'sub', 'oddeven'] };
const CLASH = [['blue', 'purple'], ['red', 'green'], ['yellow', 'orange'], ['green', 'orange'], ['red', 'orange']];
const HEX = { red: '#E84A4A', blue: '#3C8DE8', yellow: '#FFD23F', green: '#4CC26B', orange: '#FF9A2E', purple: '#8E44AD', pink: '#FF8FC0' };
const SKY = { morning: ['#F7D9C4', '#FDF3E1'], noon: ['#7CC4EE', '#D6F0FB'], sunset: ['#F29B6B', '#FBD7A5'], night: ['#1E2A4A', '#3B4C78'] };
const FIRE = { morning: 0.4, noon: 0.25, sunset: 0.7, night: 1 };
// DESIGN §4.3 particle files (particles/<name>.svg)
const SPRITES = ['mist', 'mote', 'sparkle', 'star', 'ember', 'firefly', 'leaf', 'butterfly', 'confetti_a', 'confetti_b', 'dot', 'dust', 'note'];
const KINDS = ['bell', 'plate', 'string', 'dots', 'animal', 'glyph'];
const ICON_KINDS = KINDS.concat(['number', 'color', 'size']);
const ANIMALS = ['bear', 'fox', 'owl', 'deer', 'rabbit', 'squirrel', 'frog', 'duck'];
const ITEM = { 3: 112, 4: 112, 5: 112, 6: 104, 7: 104 };
const MAXC = { 3: 3, 4: 4, 5: 5, 6: 5, 7: 5 };
/** CSS viewport + CSS safe-area insets → logical {W, H, ins} (short side 720). */
function dev(name, cw, ch, ci) {
  const { W, H } = CC.World.logicalSize(cw, ch), s = Math.min(W, H) / Math.min(cw, ch), ins = {};
  for (const k of ['top', 'right', 'bottom', 'left']) ins[k] = Math.round(((ci || {})[k] || 0) * s);
  return { W, H, ins, name };
}
const VIEWPORTS = [
  { W: 1556, H: 720, ins: null, name: '1556×720' },
  { W: 1556, H: 720, ins: { top: 0, right: 108, bottom: 38, left: 108 }, name: '1556×720 notch' },
  { W: 960, H: 720, ins: null, name: '960×720 (iPad 4:3)' },
  { W: 960, H: 720, ins: { top: 32, right: 0, bottom: 27, left: 0 }, name: '960×720 insets' },
  dev('iPad Air 1180×820', 1180, 820, { top: 24, bottom: 20 }),
  dev('iPad Air 820×1180', 820, 1180, { top: 24, bottom: 20 }),
  { W: 720, H: 1556, ins: null, name: '720×1556' },
  { W: 720, H: 1556, ins: { top: 108, right: 0, bottom: 62, left: 0 }, name: '720×1556 notch' },
  dev('iPhone 852×393', 852, 393, { left: 59, right: 59, bottom: 21 }),
  dev('iPhone 393×852', 393, 852, { top: 59, bottom: 34 }),
  dev('iPad mini 744×1133', 744, 1133, { top: 24, bottom: 20 }),
  { W: 720, H: 960, ins: { top: 32, right: 0, bottom: 27, left: 0 }, name: '720×960 insets' },
  { W: 1280, H: 720, ins: null, name: '16:9' },
  { W: 1600, H: 720, ins: null, name: '1600×720' },
  { W: 720, H: 1280, ins: { top: 37, right: 0, bottom: 0, left: 0 }, name: 'iPhone SE portrait' },
  { W: 1280, H: 720, ins: { top: 0, right: 37, bottom: 21, left: 37 }, name: 'iPhone SE landscape' }
];
const VP = VIEWPORTS[2];

// ---------- helpers ----------
function mkWorld(o) {
  o = o || {};
  const cfg = Object.assign(o.surprise ? {} : { surpriseTypes: [] }, o.config || {});
  const w = new CC.World({ seed: o.seed || 1, age: o.age || 4, lang: o.lang || 'en', config: cfg });
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
  if (o.surprise) { w.cfg.surpriseTypes = [o.surprise === 'fireflies' ? 'hedgehog' : o.surprise]; w.cfg.nightSurprise = o.surprise === 'fireflies' ? 'fireflies' : null; w.level = o.surprise === 'fireflies' ? 3 : w.level; }
  else w.cfg.surpriseTypes = [];
  w._beginRound();
  until(w, () => w.interactive);
  return w;
}
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
/** A quick tap on chime `id` (side −1 = left of its centre, +1 = right). → events of the tap */
function tapChime(w, id, side) {
  const h = w.chimeHit(id);
  const r = w.pointerDown(h.x + (side || -1) * 10, h.y);
  run(w, 0.08);
  w.pointerUp();
  return r;
}
/** Press (x0, y0), slide to (x1, y1) with n moves over T s, lift. */
function swipe(w, x0, y0, x1, y1, n, T) {
  n = n || 12; T = T || 0.3;
  const r = w.pointerDown(x0, y0);
  for (let k = 1; k <= n; k++) { run(w, T / n); w.pointerMove(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n); }
  w.pointerUp();
  return r;
}
function asked(w) { const a = w.answer(); return a && a.chime ? w.chimeById(a.chime) : null; }
function rightNow(w) { const c = asked(w); tapChime(w, c.id); return c; }
function solveRound(w) {
  const t0 = w.time;
  while (w.state === 'round' && w.time - t0 < 60) {
    if (w.interactive) rightNow(w);
    w.update(H);
  }
}
function freeSky(w) {
  const L = w.layout;
  for (let y = L.H - 10; y > 0; y -= 7) for (let x = L.W - 20; x > 0; x -= 13) {
    if (w._chimeAt(x, y) || inside(L.kikiBox, x, y, 4) || inside(L.band, x, y)) continue;
    if (L.keep.some(k => inside(k, x, y, 4))) continue;
    return { x, y };
  }
  throw new Error('no free sky point');
}
function inside(b, x, y, pad) { pad = pad || 0; return x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad; }
function circleBox(c, b) { const nx = Math.max(b.x, Math.min(c.x, b.x + b.w)), ny = Math.max(b.y, Math.min(c.y, b.y + b.h)); return Math.hypot(c.x - nx, c.y - ny) < c.r; }
function parity(n) { return n % 2 ? 'odd' : 'even'; }
const VI_INI = { bear: 'G', fox: 'C', owl: 'C', deer: 'H', rabbit: 'T', squirrel: 'S', frog: null, duck: 'V' };
const EN_INI = { bear: 'B', fox: 'F', owl: 'O', deer: 'D', rabbit: 'R', squirrel: 'S', frog: 'F', duck: 'D' };
/** Independent matcher (DESIGN §5.1). */
function myMatch(r, s, t) {
  const p = s.params;
  switch (r.topic) {
    case 'colors': return t.kind === 'bell' && t.color === p.color;
    case 'shapes': return t.kind === 'plate' && t.shape === p.shape && (r.age < 5 || t.color === p.color);
    case 'size': return t.kind === 'bell' && t.size === p.size;
    case 'animals': return t.kind === 'animal' && t.animal === p.animal;
    case 'initial': return t.kind === 'animal' && (r.lang === 'vi' ? VI_INI : EN_INI)[t.animal] === p.letter;
    case 'count': return t.n === p.n && (t.kind === 'string' || t.kind === 'dots');
    case 'letters': return t.kind === 'glyph' && t.text === p.letter;
    case 'lower': return t.kind === 'glyph' && t.text === p.small;
    case 'add': return t.kind === 'glyph' && +t.text === p.a + p.b;
    case 'sub': return t.kind === 'glyph' && +t.text === p.a - p.b;
    case 'oddeven': return t.kind === 'glyph' && parity(+t.text) === p.parity;
  }
  return false;
}

// ================================================================ rng / layout
test('rng: deterministic, ranges, fork', () => {
  const a = new CC.RNG(42), b = new CC.RNG(42);
  for (let i = 0; i < 50; i++) assert.strictEqual(a.next(), b.next());
  const r = new CC.RNG('x');
  for (let i = 0; i < 500; i++) { const v = r.int(2, 5); assert.ok(v >= 2 && v <= 5 && v === Math.floor(v)); }
  assert.strictEqual(new CC.RNG(1).sample([1, 2, 3, 4], 4).sort().join(), '1,2,3,4');
  const f1 = new CC.RNG(9).fork('a'), f2 = new CC.RNG(9).fork('a'); assert.strictEqual(f1.next(), f2.next());
});

test('logical size: short side 720, long side clamped 960–1600', () => {
  const L = CC.World.logicalSize;
  assert.deepStrictEqual(L(1180, 820), { W: 1036, H: 720 });
  assert.deepStrictEqual(L(820, 1180), { W: 720, H: 1036 });
  assert.deepStrictEqual(L(852, 393), { W: 1561, H: 720 });
  assert.deepStrictEqual(L(393, 852), { W: 720, H: 1561 });
  assert.deepStrictEqual(L(1024, 1024), { W: 960, H: 720 });
  assert.deepStrictEqual(L(3000, 600), { W: 1600, H: 720 });
});

test('layout: DESIGN §2 boxes — ground, bubble, Kiki, fire, beam, posts, garland, item per age × chime count, cord ranges (every viewport × age × n)', () => {
  for (const v of VIEWPORTS) for (const age of AGES) for (let nC = 2; nC <= MAXC[age]; nC++) {
    const L = CC.World.computeLayout(v.W, v.H, v.ins, {}, age, null, nC), ins = L.ins, tag = `${v.name} age ${age} n ${nC}`;
    assert.ok(L.fits, tag + ' fits');
    assert.strictEqual(L.portrait, v.H > v.W);
    assert.strictEqual(L.groundY, v.H - ins.bottom - (L.portrait ? 26 : 14), tag);
    assert.strictEqual(L.kiki.x, ins.left + (L.portrait ? 104 : 118)); assert.strictEqual(L.kiki.y, L.groundY - 4);
    assert.strictEqual(L.kiki.h, L.portrait ? (L.tall ? 230 : 200) : 230, 'Kiki × 1.15 on tall portrait');
    assert.strictEqual(L.n, nC);
    const bb = L.bubble.y + L.bubble.h;
    assert.ok(L.beam.y >= bb + 92 - 1e-6, tag + ' beam below bubble + 92');
    if (!L.portrait) { assert.ok(L.beam.y >= ins.top + 210 - 1e-6); assert.strictEqual(L.beam.x0, ins.left + 250); }
    else assert.strictEqual(L.beam.x0, ins.left + 36);
    if (L.portrait && L.tall) assert.ok(L.beam.y >= bb + 120 - 1e-6 && L.beam.y <= bb + 121, tag + ' tall: the beam hangs high (bubble bottom + 120)');
    assert.strictEqual(L.beam.x1, v.W - ins.right - 36); assert.strictEqual(L.beam.r, 15);
    assert.strictEqual(L.posts.length, 2);
    for (const p of L.posts) { assert.strictEqual(p.top, L.beam.y - 70); assert.strictEqual(p.bottom, L.groundY); }
    assert.strictEqual(L.posts[0].x, L.beam.x0); assert.strictEqual(L.posts[1].x, L.beam.x1);
    assert.strictEqual(L.garland.y, L.beam.y - 62); assert.strictEqual(L.garland.sag, 26);
    assert.ok(L.posts[0].top > bb, tag + ' post tops below the bubble');
    // fire: decoration on the ground, landscape right of Kiki and clear of the left post; portrait bottom-right
    assert.strictEqual(L.fire.y, L.groundY - 6);
    if (L.portrait) { assert.strictEqual(L.fire.x, v.W - ins.right - 120); assert.strictEqual(L.fire.s, 0.9); }
    else { assert.ok(L.fire.x >= L.kiki.x + 150 - 1e-6); assert.ok(L.fireBox.x > L.beam.x0 + 16, tag + ' fire clear of the post'); }
    assert.ok(L.fireBox.x + L.fireBox.w < L.posts[1].x - 16 || L.fireBox.x > L.posts[1].x + 16, 'fire clear of the right post');
    // item: sized for THIS round's n — iPad: ≤ the base item (≥ itemMin); phones / tall: up to itemCap 150
    const base = ITEM[age], big = L.tall || L.phone;
    assert.ok(L.item >= CFG.itemMin[age] && L.item <= (big ? 150 : base), tag + ' item ' + L.item);
    if (big) assert.ok(2 * L.hitR >= 184 - 1e-6, tag + ' phone hit diameter ≥ 184 (100 css px)');
    else assert.strictEqual(L.hitR, 0.6 * L.item + 14);
    if (!big && nC <= 3) assert.strictEqual(L.item, base, tag + ' iPad keeps the base item');
    const cr = L.portrait ? (L.tall ? [160, 330] : [110, 190]) : [90, 150];
    assert.ok(L.cord[1] <= cr[1] && L.cord[0] >= CFG.cordFloor && L.cord[1] - L.cord[0] >= 30 - 1e-6, tag + ' cord ' + L.cord);
    if (L.zig) { assert.ok(L.portrait && nC >= 3 && ((nC - 1) * L.spK + 1) * L.item <= L.usable + 1e-6 && L.cord[1] - L.cord[0] >= L.item + 16); }
    else assert.ok(nC * L.spK * L.item <= L.usable + 1e-6 && L.spK >= 1.18);
  }
});

/** Rest geometry of a world's current round (theta = 0, cord = cordRest). */
function restGeo(w) {
  return w.chimes.map(c => ({ c, x: c.hookX, top: w.layout.beam.hookY + c.cordRest, bottom: w.layout.beam.hookY + c.cordRest + c.bh,
    hit: { x: c.hookX, y: w.layout.beam.hookY + c.cordRest + c.bcy, r: w.chimeHit(c.id).r } }));
}
function checkRound(w, tag) {
  const L = w.layout, G = restGeo(w), n = w.chimes.length;
  assert.strictEqual(L.hooks.length, n);
  for (let i = 0; i < n; i++) {
    const g = G[i], c = g.c;
    assert.strictEqual(L.n, n, tag + ' layout sized for this round');
    if (i) {
      const sp = c.hookX - G[i - 1].c.hookX;
      if (L.zig) {   // zig-zag: neighbours ≥ 0.95 × item apart but at different heights — the lower body starts below the upper one
        assert.ok(sp >= 0.95 * L.item - 1e-6 && sp <= 1.3 * L.item + 1e-6, `${tag} zig spacing ${sp.toFixed(1)}`);
        const [up, dn] = G[i - 1].top < g.top ? [G[i - 1], g] : [g, G[i - 1]];
        assert.ok(dn.top >= up.bottom + 16 - 1e-6, `${tag} zig bodies overlap (${up.bottom.toFixed(0)} / ${dn.top.toFixed(0)})`);
        if (i >= 2) assert.ok(c.hookX - G[i - 2].c.hookX >= 1.18 * L.item, tag + ' same-row spacing');
      } else assert.ok(sp >= 1.18 * L.item - 1e-6 && sp >= L.spK * L.item - 1e-6 && sp <= 1.7 * L.item + 1e-6, `${tag} hook spacing ${sp.toFixed(1)} (item ${L.item})`);
      const dc = Math.abs(c.cordRest - G[i - 1].c.cordRest), room = Math.min(30, L.cord[1] - L.cord[0]);
      assert.ok(dc >= room - 1e-6, `${tag} neighbour cords differ ${dc.toFixed(1)}`);
    }
    assert.ok(c.hookX - c.bw / 2 >= L.beam.x0 + 16 - 1e-6 && c.hookX + c.bw / 2 <= L.beam.x1 - 16 + 1e-6, tag + ' chime between the posts');
    assert.ok(c.hookX - c.bw / 2 >= L.ins.left && c.hookX + c.bw / 2 <= L.W - L.ins.right, tag + ' inside the screen (x)');
    assert.ok(g.top > 0 && g.bottom <= L.groundY - 40 + 1e-6, `${tag} inside the screen (y): bottom ${g.bottom.toFixed(0)} ground ${L.groundY}`);
    if (L.portrait) {
      assert.ok(g.bottom <= L.kiki.y - L.kiki.h - 60 + 1e-6, `${tag} chime bottom ${g.bottom.toFixed(0)} ≥ 60 px above Kiki's head ${L.kiki.y - L.kiki.h}`);
      assert.ok(g.bottom <= L.fireBox.y - 40 + 1e-6, tag + ' above the fire');
    } else if (Math.abs(c.hookX - L.fire.x) < L.fire.w / 2 + c.bw / 2) assert.ok(g.bottom <= L.fireBox.y - 40 + 1e-6, tag + ' above the fire');
    for (const k of L.keep) assert.ok(!circleBox(g.hit, k), `${tag} hit circle of ${c.id} overlaps the ${k.kind}`);
    assert.ok(!circleBox(g.hit, L.kikiBox), `${tag} hit circle overlaps Kiki`);
    assert.ok(g.hit.y - g.hit.r > L.bubble.y + L.bubble.h, tag + ' hit circle below the bubble');
  }
  const mid = (L.beam.x0 + L.beam.x1) / 2, cen = (w.chimes[0].hookX + w.chimes[n - 1].hookX) / 2;
  assert.ok(Math.abs(mid - cen) < 1e-6, tag + ' hooks centred');
  for (const l of w.lanterns) { assert.ok(l.x > L.beam.x0 && l.x < L.beam.x1 && l.y >= L.garland.y - 1e-6 && l.y <= L.garland.y + 26 + 1e-6); assert.ok(l.y - 24 > L.bubble.y + L.bubble.h, tag + ' lantern below bubble'); }
}

test('layout: every viewport × age × topic (round 2 + a 5-chime round) — hooks ≥ 1.18 × item apart, chimes inside, above Kiki / fire, hit circles clear of Kiki / bubble / HUD, staggered cords', () => {
  let n = 0;
  for (const v of VIEWPORTS) for (const age of AGES) for (const topic of CC.AGE_POOLS[age]) for (const ri of [0, 2]) {
    const w = mkWorld({ age, vp: v, seed: 5 + n++ });
    roundOf(w, topic, ri);
    checkRound(w, `${v.name} age ${age} ${topic} r${ri} (${w.chimes.length} chimes)`);
  }
  assert.ok(n > 500);
});

test('layout: fuzz 400 random aspects + device-like insets + measured HUD boxes: always fits, sane boxes', () => {
  const r = new CC.RNG(77);
  for (let i = 0; i < 400; i++) {
    const land = r.chance(0.5), cw = land ? r.int(560, 1400) : r.int(320, 1030), ch = land ? r.int(320, Math.min(cw, 1030)) : r.int(cw, 1400);
    const phoneL = land && cw / ch > 1.9;   // notch side insets only on landscape phones (as on every Apple device)
    const v = dev('fuzz', cw, ch, r.chance(0.5) ? { top: land ? r.int(0, 24) : r.int(0, 60), bottom: r.int(0, 34), left: phoneL ? r.int(0, 59) : 0, right: phoneL ? r.int(0, 59) : 0 } : null);
    const age = r.pick(AGES);
    const w = new CC.World({ seed: i, age, config: { surpriseTypes: [] } });
    w.hudKeep = r.chance(0.4) ? [{ x: v.W - v.ins.right - 150, y: v.ins.top + 6, w: 140, h: r.int(60, 110) }] : null;
    w.setViewport(v.W, v.H, v.ins); w.newSession();
    const L = w.layout;
    assert.ok(L.fits, `${v.W}×${v.H} age ${age} fits`);
    for (const k of ['groundY', 'item']) assert.ok(Number.isFinite(L[k]));
    roundOf(w, CC.AGE_POOLS[age][r.int(0, 4)], 2);
    checkRound(w, `fuzz ${v.W}×${v.H} ${JSON.stringify(v.ins)} age ${age}`);
  }
});

test('layout: chime hit test — circle r = 0.6 × size + 14 at the swung body centre, the cord capsule counts, nearest wins; Kiki is not a chime', () => {
  const w = roundOf(mkWorld({ age: 5 }), 'count', 2);
  for (const c of w.chimes) {
    const h = w.chimeHit(c.id);
    assert.strictEqual(h.r, 0.6 * c.size + 14);
    assert.strictEqual(w._chimeAt(h.x, h.y), c);
    assert.strictEqual(w._chimeAt(h.x + h.r * 0.95, h.y) === c || w._chimeAt(h.x + h.r * 0.95, h.y) !== null, true);
    // the cord, half-way up
    const mx = (c.hookX + c.x) / 2, my = (c.hookY + c.y) / 2;
    assert.strictEqual(w._chimeAt(mx + 10, my), c, 'cord capsule');
    assert.strictEqual(w._chimeAt(mx + 40, my - 30) === c, false, 'far beside the cord');
  }
  // swung: the hit circle follows the body
  const c = w.chimes[0]; c.theta = 0.5; w._pose(c);
  const h2 = w.chimeHit(c.id); assert.ok(h2.x > c.hookX + 0.4 * c.L);
  const kb = w.kikiHit(); assert.strictEqual(w._chimeAt(kb.cx, kb.cy), null);
});

test('layout: iPhone (393 css wide portrait / 852×393 landscape) — every hit circle ≥ 100 css px across; ≤ 4 chimes drawn ≥ 80 css px; 5 chimes hang in a zig-zag', () => {
  for (const [cw, ch, ci] of [[393, 852, { top: 59, bottom: 34 }], [852, 393, { left: 59, right: 59, bottom: 21 }]]) {
    const v = dev('iPhone', cw, ch, ci), k = Math.min(cw, ch) / 720;
    for (const age of AGES) for (const topic of CC.AGE_POOLS[age]) for (const ri of [0, 1, 2, 3]) {
      const w = roundOf(mkWorld({ age, vp: v, seed: ri * 7 + age }), topic, ri), n = w.chimes.length, L = w.layout, tag = `${cw}×${ch} age ${age} ${topic} r${ri} n ${n}`;
      for (const c of w.chimes) assert.ok(2 * w.chimeHit(c.id).r * k >= 100 - 0.5 || c.thing.size === 'small', tag + ' hit ' + (2 * w.chimeHit(c.id).r * k).toFixed(0) + ' css');
      if (n <= 4) assert.ok(L.item * k >= 80, `${tag} drawn ${(L.item * k).toFixed(0)} css px`);
      else assert.ok(L.item * k >= 68, tag);
      if (L.portrait && n === 5) assert.ok(L.zig, tag + ' zig-zag');
      checkRound(w, tag);
    }
  }
  // per round: a 2-chime warm-up gets bigger chimes than a 5-chime round on the same phone
  const v = dev('iPhone', 393, 852, { top: 59, bottom: 34 });
  const w2 = roundOf(mkWorld({ age: 6, vp: v }), 'add', 0), i2 = w2.layout.item;
  roundOf(w2, 'add', 2); assert.ok(w2.chimes.length === 5 && w2.layout.item < i2 && w2.layout.zig);
});

// ================================================================ content
test('content: tables (palette hex, topics per age, shapes, animals, notes)', () => {
  for (const k in HEX) assert.strictEqual(CC.PALETTE[k].base, HEX[k]);
  assert.deepStrictEqual(CC.AGE_TOPICS, AGE_TOPICS);
  assert.deepStrictEqual(CC.ANIMALS, ANIMALS);
  assert.deepStrictEqual(CC.NOTES, ['C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6']);
  assert.deepStrictEqual(CC.CHIME_KINDS, KINDS);
  assert.strictEqual(CC.SHAPES.length, 8);
  for (const a of [3, 4, 5, 6, 7]) for (const t of CC.AGE_TOPICS[a]) assert.ok(CC.AGE_POOLS[a].includes(t));
  // initials: VI drops the frog (Ê is not taught as its own letter); every other initial is in the pool
  for (const a of ANIMALS) { assert.strictEqual(C.initialOf(a, 'en'), EN_INI[a]); assert.strictEqual(C.initialOf(a, 'vi'), VI_INI[a]); }
});

test('content: every topic × age 3–7 × 160 seeds × rounds 0–3 × level 0/1 × EN/VI (≈ 35 000 rounds) valid; one match per step (independent matcher)', () => {
  let n = 0;
  for (const topic of TOPICS) for (const age of AGES) for (let s = 0; s < 160; s++) {
    const lang = s % 2 ? 'vi' : 'en', ri = s % 4, level = (s >> 2) % 2;
    const r = C.makeRound(topic, { age, lang, rng: new CC.RNG(s * 31 + age), roundIndex: ri, level, short: s % 11 === 5 });
    n++;
    assert.strictEqual(C.validate(r), null);
    const byId = Object.fromEntries(r.chimes.map(c => [c.id, c]));
    const rung = new Set();
    assert.ok(r.chimes.length >= 2 && r.chimes.length <= 5);
    for (const st of r.steps) {
      const hits = r.chimes.filter(c => !rung.has(c.id) && myMatch(r, st, c.thing)).map(c => c.id);
      if (st.mode === 'find') assert.deepStrictEqual(hits, st.targets, `${topic} age ${age}: exactly one match`);
      else assert.deepStrictEqual(hits.sort(), st.targets.slice().sort());
      for (const id of st.targets) { assert.ok(byId[id].target); rung.add(id); }
    }
    assert.ok(r.chimes.filter(c => !c.target).every(c => r.steps.every(st => !myMatch(r, st, c.thing)) || topic === 'oddeven' && false), 'a distractor matches');
    // the tune climbs; notes distinct; colours clash-free below 5
    const notes = r.song.map(id => byId[id].note);
    for (let i = 1; i < notes.length; i++) assert.ok(notes[i] > notes[i - 1]);
    assert.strictEqual(new Set(r.chimes.map(c => c.note)).size, r.chimes.length);
    const cs = [...new Set(r.chimes.map(c => c.thing.color).filter(Boolean))];
    if (age < 5) { assert.ok(!CLASH.some(([a, b]) => cs.includes(a) && cs.includes(b)), 'clash ' + cs); assert.ok(!cs.includes('pink')); }
    for (const c of r.chimes) assert.ok(KINDS.includes(c.thing.kind) && c.thing.nameKind && c.thing.nameValue !== undefined);
  }
  for (const topic of TOPICS) for (const age of AGES) for (let s = 0; s < 400; s++) for (const ri of [0, 1, 2, 3]) {
    const r = C.makeRound(topic, { age, lang: s % 2 ? 'vi' : 'en', rng: new CC.RNG(s + 9000), roundIndex: ri, level: s % 3 === 0 ? 0 : 1 }); n++;
    assert.strictEqual(C.validate(r), null);
  }
  assert.ok(n > 90000, n + ' rounds');
});

test('content: chimes per round (DESIGN §5.1): warm-up 2 + 0; age 3: 2 (+1 from round 2); age 4: 3 + 1 (level 0: 3 + 0); age 5: 3–4 + 1; 6+: 4 + 1; short 2', () => {
  const R = (topic, age, ri, level, short, s) => C.makeRound(topic, { age, rng: new CC.RNG(s), roundIndex: ri, level, short });
  const cnt = r => [r.chimes.filter(c => c.target).length, r.chimes.filter(c => !c.target).length];
  for (let s = 0; s < 60; s++) {
    for (const age of AGES) assert.deepStrictEqual(cnt(R(age >= 6 ? 'add' : 'animals', age, 0, 1, false, s)), [2, 0]);
    assert.deepStrictEqual(cnt(R('animals', 3, 1, 1, false, s)), [2, 0]);
    assert.deepStrictEqual(cnt(R('animals', 3, 2, 1, false, s)), [2, 1]);
    assert.deepStrictEqual(cnt(R('animals', 3, 2, 0, false, s)), [2, 0]);
    assert.deepStrictEqual(cnt(R('animals', 4, 2, 0, false, s)), [3, 0]);
    assert.deepStrictEqual(cnt(R('animals', 4, 2, 1, false, s)), [3, 1]);
    assert.deepStrictEqual(cnt(R('colors', 4, 2, 1, false, s)), [2, 1], 'only 3 clash-free colours below 5');
    assert.deepStrictEqual(cnt(R('colors', 4, 2, 0, false, s)), [3, 0]);
    const c5 = cnt(R('count', 5, 2, 1, false, s)); assert.ok(c5[0] >= 3 && c5[0] <= 4 && c5[1] === 1);
    assert.deepStrictEqual(cnt(R('add', 6, 2, 1, false, s)), [4, 1]);
    assert.deepStrictEqual(cnt(R('animals', 6, 3, 1, true, s)), [2, 1]);
    const oe = cnt(R('oddeven', 7, 2, 1, false, s)); assert.ok(oe[0] >= 2 && oe[0] <= 3 && oe[1] >= 1 && oe[1] <= 2);
  }
});

test('content: topic rules — colours bells, shapes plates (one colour < 5, no confusable pairs), size big/small bells, strings 1–5, dots, letters, b/d/p/q, initials', () => {
  for (let s = 0; s < 300; s++) {
    const rng = () => new CC.RNG(s * 7 + 1);
    const col = C.makeRound('colors', { age: 3, rng: rng(), roundIndex: 2 });
    assert.ok(col.chimes.every(c => c.thing.kind === 'bell' && !c.thing.size));
    assert.strictEqual(new Set(col.chimes.map(c => c.thing.color)).size, col.chimes.length);
    const sh = C.makeRound('shapes', { age: 4, rng: rng(), roundIndex: 2 });
    assert.ok(sh.chimes.every(c => c.thing.kind === 'plate'));
    assert.strictEqual(new Set(sh.chimes.map(c => c.thing.color)).size, 1);
    const shs = sh.chimes.map(c => c.thing.shape);
    for (const [a, b] of [['square', 'rect'], ['circle', 'oval'], ['square', 'diamond']]) assert.ok(!(shs.includes(a) && shs.includes(b)));
    const sh3 = C.makeRound('shapes', { age: 3, rng: rng(), roundIndex: 2 });
    assert.ok(sh3.chimes.every(c => ['circle', 'square', 'triangle', 'star', 'heart'].includes(c.thing.shape)));
    const s5 = C.makeRound('shapes', { age: 5, rng: rng(), roundIndex: 2 });
    assert.strictEqual(s5.steps[0].promptKey, 'p.shapes5');
    const sz = C.makeRound('size', { age: 3, rng: rng(), roundIndex: 2 });
    const bells = sz.chimes.filter(c => c.thing.kind === 'bell');
    assert.strictEqual(bells.length, 2); assert.deepStrictEqual(bells.map(c => c.thing.size).sort(), ['big', 'small']);
    assert.strictEqual(bells[0].thing.color, bells[1].thing.color);
    assert.ok(sz.steps.every(st => st.promptKey === 'p.size' && ['big', 'small'].includes(st.params.size)));
    const ct = C.makeRound('count', { age: 4, rng: rng(), roundIndex: s % 4 });
    assert.ok(ct.chimes.every(c => c.thing.kind === 'string' && c.thing.n >= 1 && c.thing.n <= (s % 4 === 0 ? 2 : s % 4 === 1 ? 4 : 5)));
    assert.ok(ct.steps.every(st => st.params.kind === 'string'));
    const d5 = C.makeRound('count', { age: 5, rng: rng(), roundIndex: 2 }), ns = d5.chimes.map(c => c.thing.n);
    assert.ok(d5.chimes.every(c => c.thing.kind === 'dots'));
    for (let i = 0; i < ns.length; i++) for (let j = 0; j < i; j++) assert.ok(Math.abs(ns[i] - ns[j]) > 1, 'no neighbours at age 5');
    const lw = C.makeRound('lower', { age: 6, rng: rng(), roundIndex: 2 }), tx = lw.chimes.map(c => c.thing.text);
    assert.ok(tx.filter(c => 'bdpq'.includes(c)).length <= 1 && !tx.some(c => c === 'l' || c === 'i'));
    assert.ok(lw.steps.every(st => st.params.letter === st.params.small.toUpperCase()));
    for (const lang of ['en', 'vi']) {
      const ini = C.makeRound('initial', { age: 6, lang, rng: rng(), roundIndex: 2 }), I = ini.chimes.map(c => C.initialOf(c.thing.animal, lang));
      assert.strictEqual(new Set(I).size, I.length); assert.ok(I.every(Boolean));
      if (lang === 'vi') assert.ok(!ini.chimes.some(c => c.thing.animal === 'frog'));
    }
  }
});

test('content: deterministic per seed; variety across seeds', () => {
  const a = C.makeRound('shapes', { age: 4, rng: new CC.RNG(5), roundIndex: 2 }), b = C.makeRound('shapes', { age: 4, rng: new CC.RNG(5), roundIndex: 2 });
  assert.deepStrictEqual(a, b);
  const keys = new Set();
  for (let s = 0; s < 60; s++) keys.add(C.makeRound('animals', { age: 4, rng: new CC.RNG(s), roundIndex: 2 }).key);
  assert.ok(keys.size > 30);
});

test('content: Talk time for every topic × age (pictures, the answer among them, 2 choices at age 3, picture icon kinds)', () => {
  for (const topic of TOPICS) for (const age of AGES) for (let s = 0; s < 40; s++) {
    const t = C.makeTalk(topic, { age, lang: s % 2 ? 'vi' : 'en', rng: new CC.RNG(s) });
    assert.strictEqual(t.promptKey, 'talk.' + topic);
    assert.ok(t.choices.some(c => c.id === t.answer) && t.answerId === t.answer);
    assert.ok(t.choices.length >= 2 && t.choices.length <= 3);
    if (age <= 3 && !['letters', 'lower', 'initial', 'add', 'sub', 'oddeven'].includes(topic)) assert.strictEqual(t.choices.length, 2);
    assert.strictEqual(new Set(t.choices.map(c => JSON.stringify(c.value))).size, t.choices.length);
    for (const c of t.choices) assert.ok(ICON_KINDS.includes(c.thing.kind), topic + ' icon ' + c.thing.kind);
    if (t.show) assert.ok(ICON_KINDS.includes(t.show.kind));
    if (topic === 'count') assert.strictEqual(t.show.n, t.params.n);
    if (topic === 'oddeven') assert.strictEqual(t.choices.filter(c => parity(c.value) === t.params.parity).length, 1);
  }
});

test('content: chapter topics rotate between sessions (the left-out topic comes back next session), always easiest first', () => {
  for (const age of AGES) {
    assert.deepStrictEqual(C.topicsFor(age), AGE_TOPICS[age]);
    const rng = new CC.RNG(age); let last = AGE_TOPICS[age];
    for (let k = 0; k < 6; k++) {
      const next = C.topicsFor(age, rng, last), pool = CC.AGE_POOLS[age];
      const left = pool.filter(t => !last.includes(t));
      assert.strictEqual(next.length, 4);
      for (const t of left) assert.ok(next.includes(t));
      for (let i = 1; i < 4; i++) assert.ok(pool.indexOf(next[i]) > pool.indexOf(next[i - 1]));
      last = next;
    }
  }
});

// ================================================================ world: enter + physics
test('world: enter — chimes drop one by one on unrolling cords (chimeIn 0.14 s apart), a springy bounce (overshoot 10–45 px), settle, then the ask; unlit lanterns = notes of the round', () => {
  const w = mkWorld({ age: 4 });
  w.levels = ['animals', 'animals', 'animals', 'animals']; w.startLevel(1); w.round = 2; w._beginRound();
  const ins = [], maxCord = {}, t0 = w.time, popAt = {};
  let ask = null;
  assert.strictEqual(w.phase, 'enter');
  assert.strictEqual(w.lanterns.length, w.cur.steps.reduce((s, st) => s + st.need, 0));
  assert.ok(w.lanterns.every(l => l.lit === 0));
  while (!ask && w.time - t0 < 5) {
    w.update(H);
    for (const c of w.chimes) { maxCord[c.id] = Math.max(maxCord[c.id] || 0, c.cord); if (c.pop > 0 && popAt[c.id] === undefined) popAt[c.id] = w.time - t0; }
    for (const e of evs(w)) { if (e.type === 'chimeIn') ins.push({ id: e.id, t: w.time - t0, x: e.x, y: e.y }); if (e.type === 'ask') ask = { t: w.time - t0, e }; }
  }
  assert.ok(ask && ask.e.first, 'asked');
  assert.strictEqual(ins.length, w.chimes.length);
  const pa = w.chimes.map(c => popAt[c.id]);
  for (let i = 1; i < pa.length; i++) assert.ok(Math.abs(pa[i] - pa[i - 1] - 0.14) < 0.01, 'drop stagger');
  for (let i = 0; i < ins.length; i++) {   // each catch comes after a free fall of its cord length (t = √(2 L / g))
    const c = w.chimeById(ins[i].id);
    assert.ok(Math.abs(ins[i].t - pa[c.i] - Math.sqrt(2 * c.cordRest / CFG.dropG)) < 0.03, 'fall time');
  }
  for (const c of w.chimes) {
    const over = maxCord[c.id] - c.cordRest;
    assert.ok(over > 10 && over < 45, `bounce ${over.toFixed(1)}`);
    assert.strictEqual(c.state, 'hang');
    assert.ok(Math.abs(c.cord - c.cordRest) < 1);
  }
  assert.ok(ask.t >= CFG.enterMin - 1e-6 && ask.t < 2.2, 'ask at ' + ask.t);
  assert.ok(w.interactive);
});

test('world: a press during enter is soft {kind:"early"} (or a brush on a chime already hanging) — never judged', () => {
  const w = mkWorld({ age: 4 });
  w.levels = ['animals', 'animals', 'animals', 'animals']; w.startLevel(1); w.round = 1; w._beginRound();
  const p = freeSky(w);
  assert.strictEqual(w.pointerDown(p.x, p.y), 'early'); w.pointerUp();
  run(w, 0.7);
  const c = w.chimes.find(q => q.state === 'hang' || q.caught);
  const h = w.chimeHit(c.id);
  assert.strictEqual(w.pointerDown(h.x, h.y), 'brush'); w.pointerUp();
  const e = evs(w);
  assert.ok(!types(e).includes('right') && !types(e).includes('wrong'));
  assert.ok(e.some(x => x.type === 'ring' && x.brush && !x.judged));
});

test('world: pendulum — period 2π√(L/g), a full swing dies down in ≈ 3–4 s, the body twist lags the cord, centre = hook + L(sin θ, cos θ)', () => {
  const w = roundOf(mkWorld({ age: 4, config: { breezeAmp: 0 } }), 'animals', 1);
  const c = w.chimes[0];
  run(w, 3);
  c.theta = 0.35; c.omega = 0; c.spin = 0; c.vspin = 0;
  let last = c.theta, cross = [], maxSpin = 0, amp1 = 0, amp35 = 0;
  for (let i = 0; i < Math.round(4 / H); i++) {
    w.update(H);
    if (last < 0 && c.theta >= 0) cross.push(w.time);
    last = c.theta; maxSpin = Math.max(maxSpin, Math.abs(c.spin));
    const t = i * H;
    if (t < 1) amp1 = Math.max(amp1, Math.abs(c.theta));
    if (t > 3.3) amp35 = Math.max(amp35, Math.abs(c.theta));
  }
  const T = (cross[cross.length - 1] - cross[0]) / (cross.length - 1), T0 = 2 * Math.PI * Math.sqrt(c.L / CFG.g);
  assert.ok(Math.abs(T - T0) / T0 < 0.06, `period ${T.toFixed(3)} vs ${T0.toFixed(3)}`);
  assert.ok(amp35 < 0.08 * 0.35, `still swinging ${amp35.toFixed(3)} after 3.3 s`);
  assert.ok(amp1 > 0.3, 'not over-damped');
  assert.ok(maxSpin > 0.01 && maxSpin < CFG.spinMax, 'secondary twist ' + maxSpin);
  c.theta = 0.3; c.spin = 0; w._pose(c);
  assert.ok(Math.abs(c.cx - (c.hookX + c.L * Math.sin(0.3))) < 1e-6 && Math.abs(c.cy - (c.hookY + c.L * Math.cos(0.3))) < 1e-6);
  assert.ok(Math.abs(c.rot + 0.3) < 1e-9, 'rot = −θ + spin');
});

test('world: idle breeze keeps every chime gently alive (|θ| ≤ ≈ 0.03 rad, never still)', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'colors', 1);
  let maxT = 0; const moved = new Set();
  run(w, 8, () => { for (const c of w.chimes) { maxT = Math.max(maxT, Math.abs(c.theta)); if (Math.abs(c.omega) > 1e-3) moved.add(c.id); } });
  assert.ok(maxT > 0.002 && maxT < 0.05, 'breeze ' + maxT);
  assert.strictEqual(moved.size, w.chimes.length);
});

// ================================================================ world: judging
test('world: a tap pushes the chime AWAY from the finger (left of centre → swings right), rings (strength ≈ 1); the first contact is judged', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'animals', 1);
  const c = asked(w), h = w.chimeHit(c.id);
  w.pointerDown(h.x - 20, h.y);
  const e = evs(w);
  assert.ok(c.omega > 0, 'pushed right');
  const ring = e.find(x => x.type === 'ring');
  assert.ok(ring && ring.judged && !ring.brush && Math.abs(ring.strength - 1) < 0.05);
  assert.ok(types(e).includes('right'));
  w.pointerUp(); run(w, 0.6);
  assert.ok(c.theta > 0.15, 'swung right ' + c.theta);
  // the other side, on a brush: pushed left
  const o = w.chimes.find(q => q !== c), ho = w.chimeHit(o.id);
  run(w, 2);
  const om = o.omega;
  w.pointerDown(ho.x + 20, ho.y); w.pointerUp();
  assert.ok(o.omega < om - 0.5, 'pushed left');
});

test('world: right → ring, right {id, thing, note, lantern}, glow flash, a note flies to the next lantern (0.7 s) → lantern {i} lights; stepDone; next ask 1 s later with the next step', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'animals', 2);
  const c = asked(w);
  tapChime(w, c.id);
  let e = evs(w);
  const r = e.find(x => x.type === 'right');
  assert.ok(r && r.id === c.id && r.lantern === 0 && r.note === c.note && r.thing.animal === c.thing.animal);
  assert.ok(e.find(x => x.type === 'stepDone' && !x.last));
  assert.ok(c.done); assert.strictEqual(w.notes.length, 1);
  const n = w.notes[0]; assert.strictEqual(n.lantern, 0); assert.strictEqual(n.x1, w.lanterns[0].x);
  let minY = 1e9, lt = null, ask = null; const t0 = w.time;
  run(w, 1.3, () => { if (w.notes[0]) minY = Math.min(minY, w.notes[0].y); for (const x of evs(w)) { if (x.type === 'lantern') lt = { t: w.time - t0, e: x }; if (x.type === 'ask') ask = { t: w.time - t0, e: x }; } });
  assert.ok(lt && Math.abs(lt.t - 0.7 + 0.08) < 0.06 && lt.e.i === 0, 'lantern at ' + (lt && lt.t));
  assert.ok(minY < Math.min(n.y0, n.y1) - 20, 'the note arcs up');
  assert.ok(w.lanterns[0].lit > 0.8 && w.lanterns[0].flash < 1 && Math.abs(w.lanterns[0].swing) + Math.abs(w.lanterns[0].vswing) > 0.01);
  assert.ok(ask && !ask.e.first && ask.e.step === 1 && Math.abs(ask.t + 0.08 - CFG.askGap) < 0.03, 'next ask ' + (ask && ask.t));
  assert.ok(c.glow > 0);
});

test('world: wrong → a dull ring + wrong {got, want, streak}, Kiki oops, a miss; stars 3 / 2 / 1', () => {
  for (const nWrong of [0, 1, 2]) {
    const w = roundOf(mkWorld({ age: 4, seed: 3 }), 'animals', 2);
    for (let k = 0; k < nWrong; k++) {
      const a = asked(w), o = w.chimes.find(q => q !== a && !q.done);
      run(w, 0.3); tapChime(w, o.id);
      const e = evs(w), wr = e.find(x => x.type === 'wrong'), ring = e.find(x => x.type === 'ring');
      assert.ok(ring.judged && ring.dull); assert.ok(o.dull > 0 && o.ring <= CFG.wrongRing + 1e-9);
      assert.strictEqual(wr.got.nameValue, o.thing.nameValue); assert.strictEqual(wr.want.nameValue, w.stepInfo.nameValue);
      assert.strictEqual(wr.streak, k + 1); assert.strictEqual(w.kiki.mood, k ? 'point' : 'oops', 'oops (then pointing with the hint)');
      assert.ok(!o.done);
    }
    solveRound(w);
    const e = evs(w).find(x => x.type === 'roundDone');
    assert.ok(e, 'roundDone'); assert.strictEqual(e.stars, [3, 2, 1][nWrong]); assert.strictEqual(e.misses, nWrong);
  }
});

test('world: gesture — first contact judged, later contacts brush (never a mistake, never progress); a chime already rung right just rings', () => {
  const w = roundOf(mkWorld({ age: 4, seed: 4 }), 'animals', 2);
  const a = asked(w), others = w.chimes.filter(q => q !== a);
  // press on the asked chime, slide across all the others: 1 right, the rest brushes
  const h = w.chimeHit(a.id), L = w.layout;
  w.pointerDown(h.x, h.y);
  for (let x = h.x; x <= L.beam.x1 + 60; x += 25) { run(w, 1 / 60); w.pointerMove(x, h.y); }
  for (let x = L.beam.x1 + 60; x >= L.beam.x0 - 60; x -= 25) { run(w, 1 / 60); w.pointerMove(x, h.y); }
  w.pointerUp();
  let e = evs(w);
  assert.strictEqual(e.filter(x => x.type === 'right').length, 1);
  assert.strictEqual(e.filter(x => x.type === 'wrong').length, 0);
  assert.ok(e.filter(x => x.type === 'ring' && x.brush).length >= others.length);
  assert.strictEqual(w.misses, 0);
  // the next step: touching the done chime first, then the asked one → still right (the done chime does not use up the judgement)
  until(w, () => w.interactive);
  const b = asked(w), ha = w.chimeHit(a.id), hb = w.chimeHit(b.id);
  w.pointerDown(ha.x, ha.y);
  for (let k = 1; k <= 20; k++) { run(w, 1 / 60); w.pointerMove(ha.x + (hb.x - ha.x) * k / 20, ha.y + (hb.y - ha.y) * k / 20); }
  w.pointerUp();
  e = evs(w);
  assert.ok(e.find(x => x.type === 'ring' && x.id === a.id && x.brush));
  assert.ok(e.find(x => x.type === 'right' && x.id === b.id));
});

test('world: a swipe from empty space — the FIRST chime it crosses is judged (wrong here), every later one brushes; no soft miss counted', () => {
  const w = roundWhere({ age: 4 }, 'animals', 2, (r, w2) => { const a = w2._askedChime(); return a && a.i > 0; });
  const a = asked(w), first = w.chimes[0], L = w.layout, y = first.cy;
  const x0 = first.cx - w.chimeHit(first.id).r - 30;
  assert.strictEqual(w._chimeAt(x0, y), null);
  swipe(w, x0, y, L.beam.x1, y, 24, 0.4);
  const e = evs(w);
  assert.strictEqual(e.filter(x => x.type === 'wrong').length, 1);
  assert.strictEqual(e.find(x => x.type === 'wrong').id, first.id);
  assert.ok(!types(e).includes('right'));
  assert.ok(e.filter(x => x.type === 'ring' && x.brush).length >= w.chimes.length - 1);
  assert.strictEqual(w._noProg, 1, 'the wrong counts, the empty-space press does not');
  void a;
});

test('world: a swipe strikes several chimes in the swipe direction; faster → stronger (clamped 0.6–1.6 × tap); rate-limited per chime (0.18 s)', () => {
  const w = roundOf(mkWorld({ age: 6, seed: 2 }), 'add', 2);
  run(w, 3);
  const L = w.layout, y = w._chimeMidY();
  const kicks = {}, strike = w._strike;
  w._strike = function (c, dw, ring, dull) { (kicks[c.id] = kicks[c.id] || []).push(dw); return strike.call(this, c, dw, ring, dull); };
  w.pointerDown(L.band.x + 2, y);
  for (let k = 1; k <= 30; k++) { run(w, 1 / 60); w.pointerMove(L.band.x + (L.band.w - 4) * k / 30, y); }
  w.pointerUp();
  const e = evs(w).filter(x => x.type === 'ring');
  assert.strictEqual(new Set(e.map(x => x.id)).size, w.chimes.length, 'every chime rang');
  w.chimes.forEach(c => assert.ok(kicks[c.id] && kicks[c.id].every(d => d > 0), 'pushed right (the swipe direction)'));
  delete w._strike;
  for (const x of e) assert.ok(x.strength >= 0.6 - 1e-6 && x.strength <= 1.6 + 1e-6);
  // a very fast swipe is clamped at 1.6, a slow one at least 0.6
  run(w, 3);
  const w2 = roundOf(mkWorld({ age: 6, seed: 2 }), 'add', 2); run(w2, 3); const y2 = w2._chimeMidY();
  w2.pointerDown(w2.layout.band.x + 2, y2); run(w2, 1 / 120); w2.pointerMove(w2.layout.band.x + w2.layout.band.w - 2, y2); w2.pointerUp();
  for (const x of evs(w2).filter(q => q.type === 'ring')) assert.ok(Math.abs(x.strength - 1.6) < 1e-6, 'fast ' + x.strength);
  // rate limit: wiggling in and out of one chime faster than 0.18 s strikes it once
  const w3 = roundOf(mkWorld({ age: 6, seed: 2 }), 'add', 2); run(w3, 3);
  const c = w3.chimes[0], h = w3.chimeHit(c.id), x0 = h.x - h.r - 8;
  w3.pointerDown(x0, h.y);
  for (let k = 0; k < 6; k++) { run(w3, 0.02); w3.pointerMove(h.x, h.y); run(w3, 0.02); w3.pointerMove(x0, h.y); }
  w3.pointerUp();
  assert.strictEqual(evs(w3).filter(q => q.type === 'ring' && q.id === c.id).length, 1);
});

test('world: soft press (sky / beam) → soft {kind}, beam wobble 2 px, every chime nudged; 2 → hint; assist at 3 (age ≤ 4) / 6 (age 6): the next press in the beam band strikes the asked chime', () => {
  for (const [age, topic, need] of [[4, 'animals', 3], [6, 'add', 6]]) {
    const w = roundOf(mkWorld({ age }), topic, 2);
    const p = freeSky(w), a = asked(w);
    run(w, 2);
    const om = w.chimes.map(c => c.omega);
    w.pointerDown(p.x, p.y);
    let e = evs(w); assert.ok(e.find(x => x.type === 'soft' && x.kind === 'sky'));
    let maxW = 0; run(w, 0.2, () => { maxW = Math.max(maxW, Math.abs(w.beam.wob)); });
    assert.ok(maxW > 1.2 && maxW < 2.5, 'beam wobble ' + maxW);
    assert.ok(w.chimes.some((c, i) => Math.abs(c.omega - om[i]) > 0.01));
    w.pointerUp();
    let hint = null, armed = null;
    for (let k = 1; k < need; k++) { w.pointerDown(p.x, p.y); w.pointerUp(); for (const x of evs(w)) { if (x.type === 'hint') hint = hint || { k: k + 1, x }; if (x.type === 'assistArmed') armed = k + 1; } }
    assert.ok(hint && hint.k === 2 && hint.x.id === a.id, 'hint at 2');
    assert.strictEqual(armed, need, 'assist armed at ' + need);
    assert.strictEqual(w.assistId, a.id);
    run(w, 0.2); assert.ok(a.glow > 0.8, 'the asked chime glows big');
    // a press on the beam band but on nothing / on another chime → the asked chime
    const o = w.chimes.find(q => q !== a);
    const ho = w.chimeHit(o.id);
    w.pointerDown(ho.x, ho.y); w.pointerUp();
    e = evs(w);
    assert.ok(e.find(x => x.type === 'assist' && x.id === a.id && x.from === o.id));
    assert.ok(e.find(x => x.type === 'right' && x.id === a.id));
    assert.ok(!e.find(x => x.type === 'wrong'));
    assert.strictEqual(w.assistId, null);
    assert.strictEqual(w.misses, 0, 'soft presses are never mistakes');
  }
});

test('world: 2 misses → hint {id} (the asked chime glows, ghost hand taps it); cooldown 6 s; hint() manual; the hand follows the swinging chime', () => {
  const w = roundOf(mkWorld({ age: 5 }), 'animals', 2);
  const a = asked(w), others = w.chimes.filter(q => q !== a);
  tapChime(w, others[0].id); run(w, 0.3);
  assert.ok(!types(evs(w)).includes('hint'));
  tapChime(w, others[1].id);
  const hint = evs(w).find(x => x.type === 'hint');
  assert.ok(hint && hint.id === a.id && hint.mode === 'tap');
  assert.ok(w.hintHand && w.hintHand.mode === 'tap' && w.hintHand.id === a.id);
  let near = 1e9, maxP = 0;
  run(w, 1.6, () => { const hh = w.hintHand; if (hh) { near = Math.min(near, Math.hypot(hh.x - a.cx, hh.y - a.cy)); maxP = Math.max(maxP, hh.press); } });
  assert.ok(near < 25 && maxP > 0.9, 'the hand taps the chime');
  assert.ok(a.glow > 0.2);
  // cooldown: another miss within 6 s → no new hint
  run(w, 2);
  tapChime(w, others[0].id);
  assert.ok(!types(evs(w)).includes('hint'));
  run(w, 4.5);
  assert.ok(!w.hintHand);
  const h2 = w.hint(); assert.deepStrictEqual(h2, { chime: a.id }); assert.ok(types(evs(w)).includes('hint'));
});

test('world: idle nudges at 12 → 18 → 27 → 30 → 30 s; the 2nd idle also hints; a press resets them', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'colors', 1);
  const t0 = w.time, at = [];
  let hinted = null;
  run(w, 120, () => { for (const e of evs(w)) { if (e.type === 'idle') at.push(+(w.time - t0).toFixed(2)); if (e.type === 'hint' && e.idle && hinted === null) hinted = at.length; } });
  const gaps = at.slice(0, 5).map((t, i) => +(t - (i ? at[i - 1] : 0)).toFixed(1));
  assert.deepStrictEqual(gaps, [12, 18, 27, 30, 30]);
  assert.strictEqual(hinted, 2);
  assert.strictEqual(w.state, 'round', 'no fail state, no auto-play');
});

test('world: pokeKiki repeats the prompt (on release); prompt() during enter / play; answer()', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'colors', 1);
  const k = w.kikiHit();
  assert.strictEqual(w.pointerDown(k.cx, k.cy), 'kiki');
  assert.strictEqual(w.pointerUp(k.cx + 2, k.cy), 'pokeKiki');
  const e = evs(w).find(x => x.type === 'pokeKiki');
  assert.ok(e && e.promptKey === 'p.colors' && Number.isFinite(e.x));
  assert.strictEqual(w.prompt().promptKey, 'p.colors');
  assert.strictEqual(w.answer().chime, w.stepInfo.targets[0]);
});

test('world: counting — a right bell string lights its bells 1..n (count events 0.5 s apart, a little jingle each); right carries count {n}; the next ask waits for the count', () => {
  const w = roundWhere({ age: 4 }, 'count', 2, r => r.chimes.find(c => c.id === r.steps[0].targets[0]).thing.n >= 3);
  const c = asked(w), n = c.thing.n;
  tapChime(w, c.id);
  const e0 = evs(w), r = e0.find(x => x.type === 'right');
  assert.deepStrictEqual(r.count, { n });
  const counts = e0.filter(x => x.type === 'count');
  let ask = null; const t0 = w.time;
  run(w, n * 0.5 + 2, () => { for (const x of evs(w)) { if (x.type === 'count') counts.push(Object.assign({ t: w.time - t0 }, x)); if (x.type === 'ask' && !ask) ask = w.time - t0; } });
  assert.deepStrictEqual(counts.map(x => x.i), Array.from({ length: n }, (_, i) => i + 1));
  for (let i = 2; i < counts.length; i++) assert.ok(Math.abs(counts[i].t - counts[i - 1].t - 0.5) < 0.02);
  assert.ok(ask > CFG.askGap + (n - 1) * 0.5, 'the next ask after the count run');
  assert.strictEqual(c.count, n);
});

test('world: findAll (odd / even) — every right-parity chime is a right note (all {i, n}); a wrong parity is a mistake', () => {
  const w = roundOf(mkWorld({ age: 7 }), 'oddeven', 2);
  const st = w.stepInfo, wrongC = w.chimes.find(c => !st.targets.includes(c.id));
  tapChime(w, wrongC.id);
  assert.ok(types(evs(w)).includes('wrong'));
  for (let k = 0; k < st.need; k++) {
    run(w, 0.3);
    const c = asked(w); tapChime(w, c.id);
    const r = evs(w).find(x => x.type === 'right');
    assert.deepStrictEqual(r.all, { i: k + 1, n: st.need });
  }
  until(w, () => w.state === 'roundDone');
  assert.strictEqual(w.roundStars, 2);
});

test('world: a judged contact during the gap after a right note starts the next step (its ask) and is judged against it', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'animals', 2);
  const a = asked(w); tapChime(w, a.id); evs(w);
  assert.ok(!w.interactive);
  const nextId = w.cur.steps[1].targets[0];
  run(w, 0.3);
  tapChime(w, nextId);
  const e = evs(w);
  assert.deepStrictEqual(types(e).filter(t => ['ask', 'ring', 'right'].includes(t)), ['ask', 'ring', 'right']);
  assert.strictEqual(e.find(x => x.type === 'right').id, nextId);
  assert.strictEqual(w.step, 1);
});

test('world: fair judging — a swipe that starts in the gap (on a neighbour\'s rim) is judged on the first BODY core it enters; a rim tap is judged on release; a strum is judged on its first core; a cancelled rim tap still counts', () => {
  // (1) start on the rim of the left neighbour, slide through the asked chime → right
  const w = roundWhere({ age: 5 }, 'animals', 2, (r, w0) => { const a = w0._askedChime(); return a && a.i > 0; });
  run(w, 3);
  const a = asked(w), nb = w.chimes[a.i - 1], hn = w.chimeHit(nb.id), ha = w.chimeHit(a.id);
  const sx = hn.x + w._coreR(nb) + 6, sy = ha.y;
  assert.strictEqual(w._chimeAt(sx, sy) !== null, true);
  assert.strictEqual(w.pointerDown(sx, sy), 'chime');
  let e = evs(w); assert.ok(e.find(x => x.type === 'ring' && x.brush) && !types(e).includes('wrong'), 'the rim only brushes');
  for (let k = 1; k <= 12; k++) { run(w, 1 / 60); w.pointerMove(sx + (ha.x + 10 - sx) * k / 12, sy); }
  w.pointerUp();
  e = evs(w);
  assert.ok(e.find(x => x.type === 'right' && x.id === a.id), 'judged on the asked chime');
  assert.ok(!types(e).includes('wrong'));
  // (2) a rim tap (no slide) → judged on release, on the pressed chime
  until(w, () => w.interactive);
  const b = asked(w), hb = w.chimeHit(b.id), rx = hb.x + (w._coreR(b) + hb.r) / 2;
  assert.strictEqual(w._chimeAt(rx, hb.y), b);
  w.pointerDown(rx, hb.y); assert.ok(!types(evs(w)).includes('right'));
  run(w, 0.1); w.pointerUp();
  assert.ok(evs(w).find(x => x.type === 'right' && x.id === b.id));
  // (3) a strum across the whole row from outside: judged on the first core, never on the asked one for free
  const w3 = roundWhere({ age: 5 }, 'animals', 2, (r, w0) => { const q = w0._askedChime(); return q && q.i > 0; });
  run(w3, 3);
  const y3 = w3.chimes[0].cy, B = w3.layout.band;
  swipe(w3, B.x - 30, y3, B.x + B.w + 30, y3, 30, 0.5);
  const e3 = evs(w3);
  assert.strictEqual(e3.filter(x => x.type === 'wrong').length, 1); assert.strictEqual(e3.find(x => x.type === 'wrong').id, w3.chimes[0].id);
  // (4) a rim tap that is cancelled (touchcancel) is still judged
  until(w3, () => w3.interactive);
  const c4 = asked(w3), h4 = w3.chimeHit(c4.id);
  w3.pointerDown(h4.x - (w3._coreR(c4) + h4.r) / 2, h4.y); w3.cancelDrag();
  assert.ok(evs(w3).find(x => x.type === 'right' && x.id === c4.id));
  // (5) fairSwipe off → the rim is judged at once (the old behaviour, for sims)
  const w5 = roundOf(mkWorld({ age: 5, config: { fairSwipe: false } }), 'animals', 2), c5 = asked(w5), h5 = w5.chimeHit(c5.id);
  w5.pointerDown(h5.x + h5.r - 4, h5.y); assert.ok(types(evs(w5)).includes('right'));
});

test('world: an assisted note caps the round at 2★', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'animals', 1), p = freeSky(w);
  for (let k = 0; k < 3; k++) { w.pointerDown(p.x, p.y); w.pointerUp(); }
  assert.ok(w.assistId);
  const o = w.chimes.find(q => q.id !== w.assistId), ho = w.chimeHit(o.id);
  w.pointerDown(ho.x, ho.y); w.pointerUp();
  solveRound(w);
  assert.strictEqual(w.misses, 0); assert.strictEqual(w.roundStars, 2);
  const w2 = roundOf(mkWorld({ age: 4 }), 'animals', 1); solveRound(w2); assert.strictEqual(w2.roundStars, 3, 'a clean round keeps 3★');
});

test('world: a press on the beam band (not on a chime) during song time starts the cascade from the nearest chime', () => {
  const w = roundOf(mkWorld({ age: 6, seed: 3 }), 'add', 2);
  solveRound(w); evs(w); run(w, 1);
  const c = w.chimes[3], L = w.layout, x = c.hookX + 4, y = L.beam.y + 2;
  assert.strictEqual(w._chimeAt(x, y), null);
  assert.strictEqual(w.pointerDown(x, y), 'song'); w.pointerUp();
  const order = []; run(w, 1.5, () => { for (const e of evs(w)) if (e.type === 'songNote') order.push(w.chimeById(e.id).i); });
  assert.strictEqual(order[0], 3); assert.strictEqual(order.length, 5);
});

// ================================================================ world: song + out
test('world: song — roundDone {stars} → songAsk + a ghost-hand swipe; nobody swipes → auto after 4 s: every chime left → right 0.16 s apart, lanterns flash, Kiki dances; songDone {auto} 0.6 s later; out: chimes pulled up, songs[]', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'colors', 1);
  solveRound(w);
  let e = evs(w);
  const rd = e.find(x => x.type === 'roundDone');
  assert.ok(rd && rd.stars === 3 && Number.isFinite(rd.x));
  assert.strictEqual(w.state, 'roundDone'); assert.strictEqual(w.phase, 'song');
  assert.deepStrictEqual(w.answer(), { song: true });
  const ids = w.chimes.map(c => c.id);
  const log = []; const t0 = w.time - w.phaseTime; let moods = new Set(), handX = [];
  run(w, 8, () => {
    if (w.hintHand && w.hintHand.mode === 'swipe') handX.push(w.hintHand.x);
    if (w.phase === 'song' && w._song && w._song.started) moods.add(w.kiki.mood);
    for (const x of evs(w)) log.push(Object.assign({ t: w.time - t0 }, x));
  });
  const ask = log.find(x => x.type === 'songAsk');
  assert.ok(ask && Math.abs(ask.t - CFG.songAskDelay) < 0.02);
  assert.ok(handX.length && Math.max(...handX) - Math.min(...handX) > w.layout.band.w * 0.6, 'the hand swipes across');
  const notes = log.filter(x => x.type === 'songNote');
  assert.deepStrictEqual(notes.map(x => x.id), ids, 'every chime, left → right');
  assert.ok(Math.abs(notes[0].t - ask.t - CFG.songWait) < 0.03, 'auto after songWait');
  for (let i = 1; i < notes.length; i++) assert.ok(Math.abs(notes[i].t - notes[i - 1].t - 0.16) < 0.02);
  const sd = log.find(x => x.type === 'songDone');
  assert.ok(sd && sd.auto === true && Math.abs(sd.t - notes[notes.length - 1].t - 0.6) < 0.03);
  assert.ok(moods.has('dance') || moods.has('cheer'));
  const out = log.find(x => x.type === 'chimesOut');
  assert.ok(out && Math.abs(out.t - sd.t) < 0.02);
  assert.strictEqual(w.songs.length, 1);
  assert.strictEqual(w.songs[0].notes.length, 2); assert.ok(w.songs[0].notes[1] > w.songs[0].notes[0]); assert.ok(w.songs[0].colors.every(Boolean));
  const nr = log.find(x => x.type === 'round');
  assert.ok(nr && nr.t - out.t >= CFG.outTime - 0.02 && nr.t - out.t < 1.1, 'the next round after the out phase');
});

test('world: song started by a swipe (cascade left → right, auto false) or a tap (from the touched chime outwards); touches during the cascade brush; the chimes swing up and out, distractors first', () => {
  // swipe
  let w = roundOf(mkWorld({ age: 6, seed: 3 }), 'add', 2);
  solveRound(w); evs(w);
  run(w, 1);
  const y = w._chimeMidY(), B = w.layout.band;
  swipe(w, B.x + 2, y, B.x + B.w - 2, y, 20, 0.3);
  const log = [];
  run(w, 3, () => { for (const x of evs(w)) log.push(x); });
  const ids = w.chimes.length ? w.chimes.map(c => c.id) : null;
  const notes = log.filter(x => x.type === 'songNote');
  assert.strictEqual(notes.length, 5);
  assert.deepStrictEqual(notes.map(x => x.i), [0, 1, 2, 3, 4]);
  assert.ok(notes.every((x, i) => !i || x.x > notes[i - 1].x - 30), 'left → right');
  assert.strictEqual(log.find(x => x.type === 'songDone').auto, false);
  void ids;
  // tap on the middle chime
  w = roundOf(mkWorld({ age: 6, seed: 3 }), 'add', 2);
  solveRound(w); evs(w); run(w, 1);
  const mid = w.chimes[2];
  tapChime(w, mid.id);
  const order = []; let outs = [], distractorFirst = null;
  run(w, 3, () => {
    for (const x of evs(w)) if (x.type === 'songNote') order.push(w.chimeById(x.id).i);
    for (const c of w.chimes) if (c.state === 'out' && !outs.includes(c.id)) { outs.push(c.id); if (distractorFirst === null) distractorFirst = !c.target; }
  });
  assert.deepStrictEqual(order, [2, 1, 3, 0, 4]);
  assert.strictEqual(distractorFirst, true, 'the distractor leaves first');
  run(w, 2);
});

test('world: out — cords pull up with an ease-in, then the chime pops away (pop 1 → 0, state gone); lanterns stay lit until the next round resets them', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'colors', 1);
  solveRound(w);
  until(w, () => w.phase === 'out');
  const c = w.chimes[0], c0 = c.cord, lit = w.lanterns.map(l => l.lit);
  assert.ok(lit.every(v => v > 0.9));
  let half = null;
  run(w, 0.8, () => { if (c.state === 'out' && half === null && c._outT >= CFG.outPull / 2) half = c.cord; });
  assert.ok(half > c0 * 0.7, 'ease-in: slow at first');
  assert.strictEqual(c.state, 'gone'); assert.strictEqual(c.pop, 0);
  until(w, () => w.phase === 'enter');
  assert.ok(w.lanterns.every(l => l.lit === 0));
});

// ================================================================ world: surprises
test('world: hedgehog — 3–5 s (≤ the round length) after the ask it trundles in from the right along the ground, stops near the middle (clear of Kiki and the fire), sniffs, leaves after ≈ 7 s; tap → curls into a ball, rolls 40 px, uncurls', () => {
  for (const v of [VIEWPORTS[0], VIEWPORTS[7], VIEWPORTS[2]]) {
    const w = roundOf(mkWorld({ age: 4, surprise: true, vp: v }), 'colors', 1, { surprise: 'hedgehog' });
    const t0 = w.time; let ev = null;
    until(w, () => { for (const e of evs(w)) if (e.type === 'hedgehog') ev = w.time - t0; return !!w.hedgehog; });
    const late = Math.max(2, w.cur.steps.reduce((a, s2) => a + s2.need, 0) * 1.8 - 1);
    assert.ok(ev >= Math.min(3, late) - 0.02 && ev <= Math.min(5, late) + 0.05, 'at ' + ev + ' (≤ ' + late + ')');
    const g = w.hedgehog, L = w.layout;
    assert.ok(g.x > L.W - L.ins.right && g.dir === -1 && Math.abs(g.y - (L.groundY - 8)) < 1e-6);
    until(w, () => g.state === 'sniff');
    assert.ok(g.x > L.kikiBox.x + L.kikiBox.w + 60 && Math.abs(g.x - L.fire.x) > L.fire.w / 2 + 60, 'stop spot');
    assert.ok(Math.abs(g.x - L.W / 2) < L.W * 0.3);
    const hh = w.hedgehogHit(); assert.ok(hh);
    assert.ok(!circleBox(hh, L.kikiBox));
    const x0 = g.x;
    assert.strictEqual(w.pointerDown(hh.x, hh.y), 'hedgehog'); w.pointerUp();
    assert.ok(types(evs(w)).includes('hedgehogTap'));
    let maxBall = 0; run(w, 0.2, () => { maxBall = Math.max(maxBall, g.ball); });
    run(w, 1.2, () => { maxBall = Math.max(maxBall, g.ball); });
    assert.ok(maxBall > 0.99 && g.ball === 0 && Math.abs(Math.abs(g.x - x0) - 40) < 1, 'rolled ' + (g.x - x0));
    assert.ok(Math.abs(g.roll) > 1, 'it rolled (angle)');
    assert.strictEqual(w.misses, 0);
    until(w, () => g.state === 'leave', 12 / H);
    run(w, 14); assert.strictEqual(w.hedgehog, null);
  }
});

test('world: bird — lands on the beam between hooks (never on a cord), hops, tap → birdTap {note = the last note rung}, leaves after ≈ 7 s; a chime under the finger wins', () => {
  const w = roundOf(mkWorld({ age: 4, surprise: true, vp: VIEWPORTS[6] }), 'colors', 2, { surprise: 'bird' });
  const a = asked(w); tapChime(w, a.id); evs(w);
  until(w, () => w.bird && w.bird.state === 'perch');
  const b = w.bird, L = w.layout;
  assert.ok(Math.abs(b.y - (L.beam.y - L.beam.r)) < CFG.birdHopH + 1);
  for (const c of w.chimes) assert.ok(Math.abs(b.x - c.hookX) > 30, 'not on a cord');
  assert.ok(b.x > L.beam.x0 && b.x < L.beam.x1);
  let hops = 0, last = 0; run(w, 3, () => { if (b.hop > 0.5 && last <= 0.5) hops++; last = b.hop; });
  assert.ok(hops >= 1, 'hops');
  const hb = w.birdHit(); assert.ok(hb);
  assert.strictEqual(w.pointerDown(hb.x, hb.y), 'bird'); w.pointerUp();
  const e = evs(w).find(x => x.type === 'birdTap');
  assert.ok(e && e.note === a.note, 'sings the last note');
  assert.ok(b.sing > 0.9);
  until(w, () => !w.bird || w.bird.state === 'leave', 8 / H);
  run(w, 2); assert.strictEqual(w.bird, null);
  // a chime wins over a surprise: the hit test returns the chime even if a firefly / bird circle covers it
  const c = w.chimes[0], h = w.chimeHit(c.id);
  assert.ok(['chime', 'brush'].includes(w.pointerDown(h.x, h.y))); w.pointerUp();
});

test('world: fireflies (the night chapter) — 5 drift down into the gaps between chimes, glow; tap → fireflyTap (flare + zip off); they leave at the song', () => {
  const w = roundOf(mkWorld({ age: 4, surprise: true, vp: VIEWPORTS[0] }), 'colors', 2, { surprise: 'fireflies' });
  assert.strictEqual(w.surprise, 'fireflies');
  until(w, () => w.fireflies.length && w.fireflies.every(f => f.state === 'drift'));
  assert.strictEqual(w.fireflies.length, 5);
  for (const f of w.fireflies) assert.strictEqual(w._chimeAt(f.x, f.y), null, 'between the chimes');
  const fh = w.fireflyHit(); assert.ok(fh);
  assert.strictEqual(w.pointerDown(fh.x, fh.y), 'firefly'); w.pointerUp();
  assert.ok(types(evs(w)).includes('fireflyTap'));
  assert.strictEqual(w.fireflies[fh.i].state, 'zip'); assert.ok(w.fireflies[fh.i].glow > 1);
  solveRound(w);
  assert.ok(w.fireflies.every(f => f.state === 'zip'));
});

test('world: surprises — one round per chapter (round 1 or 2, never the warm-up); chapters 0–2 rotate hedgehog / bird, the night chapter has fireflies', () => {
  for (let s = 1; s < 12; s++) {
    const w = new CC.World({ seed: s, age: 4 }); w.setViewport(VP.W, VP.H, VP.ins);
    const b = new CC.Bot(w, { skill: 1, seed: s }); w.newSession();
    const per = {};
    let t = 0;
    while (w.state !== 'sessionDone' && t < 900) { b.step(1 / 30); w.update(1 / 30); t += 1 / 30; for (const e of w.drainEvents()) if (e.type === 'round' && e.surprise) (per[w.level] = per[w.level] || []).push([e.round, e.surprise]); }
    for (let l = 0; l < 4; l++) {
      assert.strictEqual((per[l] || []).length, 1, 'one surprise round in chapter ' + l);
      assert.ok([1, 2].includes(per[l][0][0]));
    }
    assert.strictEqual(per[3][0][1], 'fireflies');
    assert.notStrictEqual(per[0][0][1], per[1][0][1]); assert.strictEqual(per[0][0][1], per[2][0][1]);
    assert.ok(['hedgehog', 'bird'].includes(per[0][0][1]));
  }
});

// ================================================================ world: flow
test('world: rotation mid-round — the gesture is cancelled, hooks + cords re-placed, chimes keep θ / ω, notes in flight retarget, everything inside the new screen', () => {
  const w = roundOf(mkWorld({ age: 5, vp: VIEWPORTS[0] }), 'count', 2);
  const a = asked(w), h = w.chimeHit(a.id);
  w.pointerDown(h.x, h.y); evs(w);
  run(w, 0.2);
  const th = w.chimes.map(c => [c.theta, c.omega]);
  assert.strictEqual(w.notes.length, 1);
  const v = VIEWPORTS[7];
  w.setViewport(v.W, v.H, v.ins);
  assert.strictEqual(w._g, null, 'gesture cancelled');
  w.chimes.forEach((c, i) => { assert.strictEqual(c.theta, th[i][0]); assert.strictEqual(c.omega, th[i][1]); assert.strictEqual(c.hookX, w.layout.hooks[i].x); });
  checkRound(w, 'after rotation');
  const n = w.notes[0]; assert.strictEqual(n.x1, w.layout.lanterns[n.lantern].x);
  let lantern = null; run(w, 1, () => { for (const e of evs(w)) if (e.type === 'lantern') lantern = e; });
  assert.ok(lantern && Math.abs(lantern.x - w.lanterns[0].x) < 1e-6);
  for (const c of w.chimes) assert.ok(c.cx > 0 && c.cx < v.W && c.cy > 0 && c.cy < v.H);
  w.pointerUp();
  solveRound(w);
  assert.strictEqual(w.state, 'roundDone');
});

test('world: chapter time limit — Talk time after round CONFIG.chapterMinRounds once the chapter passed 75 s; Talk re-asks every 12 s, glows after the 2nd, Kiki answers after the 3rd', () => {
  const w = mkWorld({ age: 4 });
  until(w, () => w.state === 'round');
  w.levelStartTime = w.time - 200;   // a slow chapter
  let talk = false;
  for (let r = 0; r < 4 && !talk; r++) {
    until(w, () => w.interactive || w.state === 'talk');
    if (w.state === 'talk') break;
    solveRound(w);
    until(w, () => w.state === 'round' || w.state === 'talk');
    talk = w.state === 'talk';
  }
  assert.strictEqual(w.state, 'talk');
  assert.strictEqual(w.roundsPerLevel, CC.CONFIG.chapterMinRounds);
  const asks = []; let res = null;
  run(w, 50, () => { for (const e of evs(w)) { if (e.type === 'talkAsk') asks.push(e); if (e.type === 'talkResult') res = e; } });
  assert.deepStrictEqual(asks.map(x => x.n), [1, 2, 3]);
  assert.ok(!asks[0].glowAnswer && asks[1].glowAnswer);
  assert.ok(res && res.auto && !res.correct);
});

test('world: short rounds — a round starting late in the chapter has 2 targets', () => {
  const w = mkWorld({ age: 6 });
  w.levels = ['add', 'add', 'add', 'add']; w.startLevel(1); w.round = 2; w.levelStartTime = w.time - 60;
  w._beginRound();
  assert.strictEqual(w.cur.short, true);
  assert.strictEqual(w.chimes.filter(c => c.target).length, 2);
});

test('world: Talk answer right → +1 star; levels → sessionDone {stars, songs}', () => {
  const w = new CC.World({ seed: 3, age: 3 }); w.setViewport(VP.W, VP.H, VP.ins);
  const b = new CC.Bot(w, { skill: 1, seed: 3 }); w.newSession();
  let t = 0, done = null, talkR = 0;
  while (w.state !== 'sessionDone' && t < 900) { b.step(1 / 30); w.update(1 / 30); t += 1 / 30; for (const e of w.drainEvents()) { if (e.type === 'sessionDone') done = e; if (e.type === 'talkResult' && e.correct) talkR++; } }
  assert.ok(done); assert.strictEqual(done.stars, w.stars);
  assert.ok(done.songs.length >= 12 && done.songs.every(s => s.notes.length >= 2));
  assert.strictEqual(talkR, 4);
});

test('world: interpolation twins + fixed sub-steps ≤ 1/120 s; alpha in [0, 1); render fields finite', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'count', 2);
  tapChime(w, asked(w).id);
  w.update(0.0123);
  assert.ok(w.alpha >= 0 && w.alpha < 1);
  for (const c of w.chimes) for (const k of ['x', 'y', 'cx', 'cy', 'theta', 'spin', 'cord', 'rot', 'pop', '_px', '_py', '_pcx', '_pcy', '_ptheta', '_pspin', '_pcord', '_prot', '_ppop', 'ring', 'glow', 'clap', 'count', 'hookX', 'hookY', 'size', 'bcy'])
    assert.ok(Number.isFinite(c[k]), k);
  for (const l of w.lanterns) for (const k of ['x', 'y', 'lit', 'swing', 'flash', '_pswing', '_plit']) assert.ok(Number.isFinite(l[k]), k);
  for (const n of w.notes) for (const k of ['x', 'y', '_px', '_py', 'alpha', 'rot', 't']) assert.ok(Number.isFinite(n[k]), k);
  for (const k of ['wob', '_pwob']) assert.ok(Number.isFinite(w.beam[k]));
  for (const k of ['hop', '_phop', 'look']) assert.ok(Number.isFinite(w.kiki[k]));
  assert.ok(['idle', 'talk', 'happy', 'cheer', 'think', 'oops', 'wave', 'point', 'dance'].includes(w.kiki.mood));
  const c = w.chimes[0]; c.theta = 0.2; w.update(H); assert.ok(c._ptheta !== undefined && Math.abs(c._ptheta - c.theta) < 0.05);
});

function eventLog(seed, age, frame, secs) {
  const w = new CC.World({ seed, age }); w.setViewport(VP.W, VP.H, VP.ins);
  const b = new CC.Bot(w, { skill: 0.7, seed }); w.newSession();
  const out = []; let t = 0, acc = 0;
  while (t < secs) {
    acc += frame;
    while (acc >= 1 / 30 - 1e-9) { acc -= 1 / 30; b.step(1 / 30); w.update(1 / 30); t += 1 / 30; for (const e of w.drainEvents()) out.push(e.type + ':' + (e.id || '') + ':' + (w.time).toFixed(3)); }
  }
  return out;
}
test('world: deterministic — same seed + same inputs → the same events', () => {
  const a = eventLog(5, 4, 1 / 30, 90), b = eventLog(5, 4, 1 / 30, 90);
  assert.deepStrictEqual(a, b);
  assert.ok(a.length > 100);
  const w1 = new CC.World({ seed: 9, age: 5 }), w2 = new CC.World({ seed: 9, age: 5 });
  for (const w of [w1, w2]) { w.setViewport(VP.W, VP.H, VP.ins); w.newSession(); }
  for (let i = 0; i < 400; i++) w1.update(1 / 60);
  for (let i = 0; i < 100; i++) w2.update(1 / 15);
  assert.deepStrictEqual(types(w1.drainEvents()), types(w2.drainEvents()));
  assert.ok(Math.abs(w1.chimes[0].theta - w2.chimes[0].theta) < 1e-9, 'any frame size');
});

test('world: the next round does not open with the answer asked last; never the same set twice in a chapter', () => {
  for (let s = 1; s < 25; s++) {
    const w = new CC.World({ seed: s, age: 4 }); w.setViewport(VP.W, VP.H, VP.ins);
    const b = new CC.Bot(w, { skill: 1, seed: s }); w.newSession();
    let t = 0, last = null, keys = {};
    while (w.state !== 'sessionDone' && t < 900) {
      b.step(1 / 30); w.update(1 / 30); t += 1 / 30;
      for (const e of w.drainEvents()) {
        if (e.type === 'round') { const k = w.level; keys[k] = keys[k] || []; assert.ok(!keys[k].includes(e.key), 'same set twice'); keys[k].push(e.key); }
        if (e.type === 'ask' && e.first && last !== null && w.topic !== 'size') assert.notStrictEqual(String(e.nameValue), String(last));
        if (e.type === 'level') last = null;
        if (e.type === 'roundDone') last = w.cur.steps[w.cur.steps.length - 1].nameValue;
      }
    }
  }
});

test('world: every topic × age round is completable through the input API; positional events carry x, y', () => {
  const POS = ['ring', 'right', 'wrong', 'soft', 'count', 'lantern', 'chimeIn', 'stepDone', 'hint', 'assist', 'assistArmed', 'pokeKiki', 'roundDone', 'songAsk', 'songNote', 'songDone', 'chimesOut', 'round', 'ask'];
  for (const topic of TOPICS) for (const age of AGES) for (const ri of [0, 2]) {
    const w = roundOf(mkWorld({ age, seed: 3 + age, vp: VIEWPORTS[(age + ri) % VIEWPORTS.length] }), topic, ri);
    solveRound(w);
    assert.strictEqual(w.state, 'roundDone', `${topic} age ${age} round ${ri}`);
    assert.ok(w.chimes.filter(c => c.target).every(c => c.done));
    run(w, 7);
    for (const e of evs(w)) if (POS.includes(e.type)) assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y), e.type + ' x, y');
  }
});

// ================================================================ bot
test('bot: full sessions per age 3–7 × viewport finish (bot-only through the input API), no stuck round, no NaN', () => {
  for (const age of AGES) for (const v of [VIEWPORTS[0], VIEWPORTS[2], VIEWPORTS[5], VIEWPORTS[7], VIEWPORTS[8]]) for (const skill of [0.5, 0.9]) {
    const w = new CC.World({ seed: age * 13 + skill * 10, age, lang: age % 2 ? 'vi' : 'en' });
    w.setViewport(v.W, v.H, v.ins);
    const b = new CC.Bot(w, { skill, seed: age });
    w.newSession();
    let t = 0, rT = 0, maxR = 0, rounds = 0, nan = false, songs = 0;
    while (w.state !== 'sessionDone' && t < 1200) {
      b.step(1 / 30); w.update(1 / 30); t += 1 / 30;
      for (const e of w.drainEvents()) { b.onEvent(e); if (e.type === 'round') rT = w.time; if (e.type === 'roundDone') { rounds++; maxR = Math.max(maxR, w.time - rT); } if (e.type === 'songDone') songs++; }
      if (!w.chimes.every(c => Number.isFinite(c.cx) && Number.isFinite(c.cy) && Number.isFinite(c.theta))) { nan = true; break; }
    }
    assert.ok(!nan, 'NaN');
    assert.strictEqual(w.state, 'sessionDone', `age ${age} ${v.name} skill ${skill}: ${w.state}/${w.phase} after ${t.toFixed(0)} s`);
    assert.ok(maxR < 90, `a round took ${maxR.toFixed(0)} s`);
    assert.ok(rounds >= 12 && rounds <= 16);
    assert.strictEqual(songs, rounds);
    assert.ok(b.stats.right >= 2 * rounds && b.stats.talks === 4 && b.stats.taps + b.stats.swipes > rounds);
    assert.ok(w.stars >= rounds);
    assert.strictEqual(w.songs.length, rounds);
  }
});

test('bot: its swipes really start off a chime and make the aimed chime the first contact', () => {
  const w = roundOf(mkWorld({ age: 6 }), 'add', 2);
  const b = new CC.Bot(w, { skill: 1, seed: 4 });
  let rights = 0, wrongs = 0;
  for (let k = 0; k < 400 && w.state === 'round'; k++) { b.step(1 / 30); w.update(1 / 30); for (const e of w.drainEvents()) { if (e.type === 'right') rights++; if (e.type === 'wrong') wrongs++; } }
  assert.strictEqual(wrongs, 0);
  assert.ok(rights >= 4);
});

// ================================================================ weather
test('weather: morning / noon / sunset / night skies, crossfade, ambient fields (fire, moonA, starsA), star field, clouds, particle sprites (DESIGN §4.3 names), embers from fireAt, bursts, party, cap 120', () => {
  const wx = new CC.Weather({ width: 1280, height: 720, groundY: 706, seed: 3 });
  const a = wx.ambient;
  wx.fireAt(400, 690);
  assert.strictEqual(a.mood, 'morning'); assert.strictEqual(a.skyTop, SKY.morning[0]); assert.strictEqual(a.skyBottom, SKY.morning[1]);
  for (const k of ['skyTop', 'skyBottom', 'tint', 'light', 'sunX', 'sunY', 'sunA', 'moonA', 'starsA', 'fire', 'mood', 'envMix']) assert.ok(a[k] !== undefined, k);
  assert.strictEqual(a.fire, FIRE.morning);
  for (let i = 0; i < 8; i++) wx.update(0.5);   // update() takes ≤ 1 s per call
  assert.ok(wx.particles.some(p => p.sprite === 'mist'), 'morning mist');
  assert.ok(wx.particles.some(p => p.sprite === 'mote'));
  const em = wx.particles.filter(p => p.sprite === 'ember');
  assert.ok(em.length && em.every(p => Math.abs(p.x0 - 400) < 30 && p.y < 700), 'embers rise from the fire');
  const mist = wx.particles.find(p => p.sprite === 'mist'); assert.strictEqual(mist.ar, 2);
  wx.setWeather(3);
  wx.update(1.0); assert.ok(a.envMix > 0.2 && a.envMix < 0.8, 'crossfading'); assert.strictEqual(a.envFrom, 'morning');
  for (let i = 0; i < 8; i++) wx.update(0.5);
  assert.strictEqual(a.skyTop, SKY.night[0]); assert.strictEqual(a.skyBottom, SKY.night[1]);
  assert.strictEqual(a.moonA, 1); assert.strictEqual(a.starsA, 1); assert.strictEqual(a.sunA, 0); assert.strictEqual(a.fire, 1);
  assert.ok(wx.particles.filter(p => p.sprite === 'firefly').length >= 6, 'fireflies');
  assert.ok(wx.stars.length >= 40 && wx.stars.every(s => s.y < 720 * 0.5 && s.r > 0 && s.tw >= 0 && s.tw <= 1));
  wx.setWeather(2, { instant: true }); assert.strictEqual(a.skyTop, SKY.sunset[0]); assert.strictEqual(a.fire, FIRE.sunset); for (let i = 0; i < 6; i++) wx.update(0.5);
  assert.ok(wx.particles.filter(p => p.sprite === 'ember').length >= 5, 'sunset embers');
  assert.ok(a.sunX > 1280 * 0.7, 'the sun low on the right');
  wx.setWeather(1, { instant: true }); assert.strictEqual(a.skyTop, SKY.noon[0]); assert.strictEqual(a.fire, FIRE.noon);
  for (let i = 0; i < 10; i++) wx.update(0.5);
  assert.ok(wx.particles.some(p => p.sprite === 'butterfly') && wx.particles.some(p => p.sprite === 'leaf'), 'noon butterflies + leaves');
  assert.ok(wx.clouds.length === 6 && wx.clouds.filter(c => c.alpha > 0.5).length >= 4, 'puffy noon clouds');
  assert.ok(a.sunY < 120 && a.sunA === 1, 'sun high');
  wx.setParty(true);
  for (let i = 0; i < 20; i++) {
    wx.burst(600, 400, { kind: 'confetti', n: 20 }); wx.addDust(300, 600, 6); wx.burst(400, 300, { kind: 'notes', n: 6, color: 'red' });
    wx.burst(500, 300, { kind: 'stars', n: 6 }); wx.burst(500, 300, { kind: 'sparkle', n: 6 }); wx.burst(400, 690, { kind: 'embers', n: 4 }); wx.burst(500, 300, { kind: 'dots', n: 3 }); wx.update(0.1);
  }
  assert.ok(wx.particles.length <= 120);
  assert.ok(wx.particles.some(p => p.sprite === 'note' && p.color === HEX.red), 'notes tinted');
  for (const p of wx.particles) { assert.ok(SPRITES.includes(p.sprite), 'sprite ' + p.sprite); assert.strictEqual(p.type, p.sprite); for (const k of ['x', 'y', 'r', 'rot', 'alpha', 'size']) assert.ok(Number.isFinite(p[k]), k); assert.ok(['back', 'front'].includes(p.layer)); }
  for (let i = 0; i < 10; i++) wx.update(0.5);
  assert.ok(wx.particles.some(p => p.sprite === 'confetti_a' || p.sprite === 'confetti_b'), 'party confetti keeps falling');
  wx.resize(720, 1556, 1500); wx.update(1);
  for (const p of wx.particles) assert.ok(Number.isFinite(p.x));
  for (let m = 0; m < 4; m++) { wx.setWeather(m, { instant: true }); wx.update(2); assert.strictEqual(wx.ambient.mood, ['morning', 'noon', 'sunset', 'night'][m]); assert.strictEqual(wx.ambient.fire, FIRE[wx.ambient.mood]); }
  assert.deepStrictEqual(CC.Weather.SPRITES.slice().sort(), SPRITES.slice().sort());
  const w2 = new CC.Weather({ seed: 3 }), w3 = new CC.Weather({ seed: 3 });
  w2.update(5); w3.update(5); assert.deepStrictEqual(w2.particles.map(p => p.x), w3.particles.map(p => p.x));
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
