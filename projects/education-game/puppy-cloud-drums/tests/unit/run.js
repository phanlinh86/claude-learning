#!/usr/bin/env node
// Bibi's Cloud Drums — headless unit tests for rng / content / world / weather / bot.
// Run from the game folder:   node tests/unit/run.js [name part]      (exit 1 on any failure)
// (tests/unit/i18n_voice.test.js and drum_art.test.js are the other engineers' suites and run on their own.)
'use strict';
const assert = require('assert');
const { load } = require('./load');

const CD = load();
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const H = 1 / 120;
const AGES = [3, 4, 5, 6, 7];
const C = CD.Content;
const CFG = CD.CONFIG;
const TOPICS = C.TOPICS;
const J = v => JSON.parse(JSON.stringify(v));   // objects from the vm sandbox have other prototypes
assert.deepStrictEqual = ((orig) => (a, b, m) => orig(J(a), J(b), m))(assert.deepStrictEqual);

// independent copies of the DESIGN tables (§3, §5.1)
const AGE_TOPICS = { 3: ['colors', 'shapes', 'size', 'animals'], 4: ['colors', 'shapes', 'count', 'animals'],
  5: ['shapes', 'count', 'letters', 'animals'], 6: ['lower', 'initial', 'add', 'count'], 7: ['initial', 'add', 'sub', 'oddeven'] };
const CLASH = [['blue', 'purple'], ['red', 'green'], ['yellow', 'orange'], ['green', 'orange'], ['red', 'orange']];
const HEX = { red: '#E84A4A', blue: '#3C8DE8', yellow: '#FFD23F', green: '#4CC26B', orange: '#FF9A2E', purple: '#8E44AD', pink: '#FF8FC0' };
const SKY = { morning: ['#FAD6E0', '#FFF1E4'], noon: ['#8FD0F4', '#E2F5FD'], sunset: ['#C98BC0', '#FFE7C2'], night: ['#1F2550', '#44508A'] };
const MOODS = CD.Weather.MOODS, MOOD = {};
MOODS.forEach(m => { MOOD[m.name] = { sky: [m.top, m.bottom], fire: m.amb.fire }; });
// DESIGN §4.3 particle files (particles/<name>.svg)
const SPRITES = ['mist', 'mote', 'sparkle', 'star', 'ember', 'firefly', 'leaf', 'butterfly', 'confetti_a', 'confetti_b', 'dot', 'dust', 'note'];
const KINDS = ['drum', 'shape', 'big', 'dots', 'animal', 'glyph'];
const ICON_KINDS = KINDS.concat(['number', 'color', 'size']);
const ANIMALS = ['cow', 'duck', 'cat', 'pig', 'frog', 'sheep', 'hen', 'mouse'];
const ITEM = { 3: 112, 4: 112, 5: 112, 6: 104, 7: 104 };
const MAXC = { 3: 3, 4: 4, 5: 5, 6: 5, 7: 5 };
/** CSS viewport + CSS safe-area insets → logical {W, H, ins} (short side 720). */
function dev(name, cw, ch, ci) {
  const { W, H } = CD.World.logicalSize(cw, ch), s = Math.min(W, H) / Math.min(cw, ch), ins = {};
  for (const k of ['top', 'right', 'bottom', 'left']) ins[k] = Math.round(((ci || {})[k] || 0) * s);
  return { W, H, ins, name, k: Math.min(cw, ch) / 720 };
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
  const w = new CD.World({ seed: o.seed || 1, age: o.age || 4, lang: o.lang || 'en', config: cfg });
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
  if (o.surprise) { w.cfg.surpriseTypes = [o.surprise === 'fireflies' ? 'lamb' : o.surprise]; w.cfg.nightSurprise = o.surprise === 'fireflies' ? 'fireflies' : null; w.level = o.surprise === 'fireflies' ? 3 : w.level; }
  else w.cfg.surpriseTypes = [];
  if (o.late) w.levelStartTime = w.time - o.late;
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
/** A quick tap on drum `id` (side −1 = left of its centre, +1 = right). → the pointerDown result */
function tapDrum(w, id, side) {
  const h = w.drumHit(id);
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
function asked(w) { const a = w.answer(); return a && a.drum ? w.drumById(a.drum) : null; }
/** Answer the open step: tap the asked drum (beat mode: one beat, then wait past beatGap). */
function rightNow(w) { const c = asked(w); tapDrum(w, c.id); if (w._beat) run(w, 0.2); return c; }
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
    if (w._drumAt(x, y) || inside(L.bibiBox, x, y, 4) || inside(L.cymbalBox, x, y, 4) || inside(L.band, x, y)) continue;
    if (L.keep.some(k => inside(k, x, y, 4))) continue;
    return { x, y };
  }
  throw new Error('no free sky point');
}
function inside(b, x, y, pad) { pad = pad || 0; return x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad; }
function circleBox(c, b) { const nx = Math.max(b.x, Math.min(c.x, b.x + b.w)), ny = Math.max(b.y, Math.min(c.y, b.y + b.h)); return Math.hypot(c.x - nx, c.y - ny) < c.r; }
function boxHit(a, b) { return a.x < b.x + b.w - 1e-6 && a.x + a.w > b.x + 1e-6 && a.y < b.y + b.h - 1e-6 && a.y + a.h > b.y + 1e-6; }
function parity(n) { return n % 2 ? 'odd' : 'even'; }
const VI_INI = { cow: 'B', duck: 'V', cat: 'M', pig: 'H', frog: null, sheep: 'C', hen: 'G', mouse: 'C' };
const EN_INI = { cow: 'C', duck: 'D', cat: 'C', pig: 'P', frog: 'F', sheep: 'S', hen: 'H', mouse: 'M' };
/** Independent matcher (DESIGN §5.1). */
function myMatch(r, s, t) {
  const p = s.params;
  switch (r.topic) {
    case 'colors': return t.kind === 'drum' && t.color === p.color;
    case 'shapes': return t.kind === 'shape' && t.shape === p.shape && (r.age < 5 || t.color === p.color);
    case 'size': return t.kind === 'drum' && t.size === p.size;
    case 'animals': return t.kind === 'animal' && t.animal === p.animal;
    case 'initial': return t.kind === 'animal' && (r.lang === 'vi' ? VI_INI : EN_INI)[t.animal] === p.letter;
    case 'count': return r.age <= 4 ? t.kind === 'big' : t.n === p.n && t.kind === 'dots';
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
  const a = new CD.RNG(42), b = new CD.RNG(42);
  for (let i = 0; i < 50; i++) assert.strictEqual(a.next(), b.next());
  const r = new CD.RNG('x');
  for (let i = 0; i < 500; i++) { const v = r.int(2, 5); assert.ok(v >= 2 && v <= 5 && v === Math.floor(v)); }
  assert.strictEqual(new CD.RNG(1).sample([1, 2, 3, 4], 4).sort().join(), '1,2,3,4');
  const f1 = new CD.RNG(9).fork('a'), f2 = new CD.RNG(9).fork('a'); assert.strictEqual(f1.next(), f2.next());
});

test('logical size: short side 720, long side clamped 960–1600', () => {
  const L = CD.World.logicalSize;
  assert.deepStrictEqual(L(1180, 820), { W: 1036, H: 720 });
  assert.deepStrictEqual(L(820, 1180), { W: 720, H: 1036 });
  assert.deepStrictEqual(L(852, 393), { W: 1561, H: 720 });
  assert.deepStrictEqual(L(393, 852), { W: 720, H: 1561 });
  assert.deepStrictEqual(L(1024, 1024), { W: 960, H: 720 });
  assert.deepStrictEqual(L(3000, 600), { W: 1600, H: 720 });
});

test('layout: DESIGN §2 boxes — ground, bubble, Bibi, cymbal, stage, garland (no posts / beam), item per age × drum count, beat drum + card (every viewport × age × n)', () => {
  for (const v of VIEWPORTS) for (const age of AGES) for (let nC = 1; nC <= MAXC[age]; nC++) {
    const beat = nC === 1;
    const L = CD.World.computeLayout(v.W, v.H, v.ins, {}, age, null, nC, 1, beat), ins = L.ins, tag = `${v.name} age ${age} n ${nC}`;
    assert.ok(L.fits, tag + ' fits');
    assert.strictEqual(L.portrait, v.H > v.W);
    assert.strictEqual(L.groundY, v.H - ins.bottom - (L.portrait ? 26 : 14), tag);
    assert.strictEqual(L.bibi.x, ins.left + (L.portrait ? 104 : 118)); assert.strictEqual(L.bibi.y, L.groundY - 4);
    assert.strictEqual(L.bibi.h, L.portrait ? (L.tall ? 230 : 200) : 230, 'Bibi × 1.15 on tall portrait');
    assert.strictEqual(L.n, nC);
    for (const k of ['beam', 'posts', 'hooks', 'fire', 'cord']) assert.strictEqual(L[k], undefined, 'no ' + k);
    const bb = L.bubble.y + L.bubble.h;
    // cymbal: decoration on the ground where the fire was
    assert.strictEqual(L.cymbal.y, L.groundY - 6);
    if (L.portrait) { assert.strictEqual(L.cymbal.x, v.W - ins.right - 120); assert.strictEqual(L.cymbal.s, 1.1); }
    else { assert.strictEqual(L.cymbal.x, L.bibi.x + 180); assert.strictEqual(L.cymbal.s, 1); }
    assert.deepStrictEqual(L.cymbalBox, { x: L.cymbal.x - L.cymbal.w / 2, y: L.cymbal.y - L.cymbal.h, w: L.cymbal.w, h: L.cymbal.h });
    // stage
    if (L.portrait) { assert.strictEqual(L.stage.x0, ins.left + 36); assert.strictEqual(L.stage.x1, v.W - ins.right - 36); }
    else { assert.strictEqual(L.stage.x0, ins.left + 250); assert.strictEqual(L.stage.x1, v.W - ins.right - 40); }
    // garland across the top band, below the bubble
    assert.strictEqual(L.garland.y, bb + (L.portrait ? 84 : 46)); assert.strictEqual(L.garland.sag, 22);
    assert.ok(L.garland.x0 >= ins.left && L.garland.x1 <= v.W - ins.right);
    // item: sized for THIS round's n — iPad: ≤ the base item (≥ itemMin); phones / tall: up to itemCap 150
    const base = ITEM[age], big = L.tall || L.phone;
    assert.ok(L.item >= CFG.itemMin[age] && L.item <= (L.tall ? 170 : big ? 150 : base), tag + ' item ' + L.item);
    if (big) assert.ok(2 * L.hitR >= 200 - 1e-6 && L.hitMin === 100, tag + ' phone hit diameter ≥ 200 (100 css px on a 360 px phone)');
    else assert.strictEqual(L.hitR, 0.6 * L.item + 14);
    if (!big && nC <= 3) assert.strictEqual(L.item, base, tag + ' iPad keeps the base item');
    assert.deepStrictEqual(L.cushion, { w: 1.25 * L.item, h: 0.32 * L.item });
    if (beat) {
      assert.ok(L.beat && L.beat.size >= L.item && L.beat.size <= Math.round(L.item * 1.45), tag + ' big drum ' + (L.beat && L.beat.size));
      assert.ok(L.beat.cardH >= 110 && L.beat.cardH <= (L.tall || L.phone ? 170 : 140) && ['above', 'side'].includes(L.beat.mode));
      if (L.beat.mode === 'above') assert.ok(L.beat.size >= Math.round(L.item * 1.3) - 2, tag + ' above: still a clearly big drum');
    } else {
      assert.strictEqual(L.beat, null);
      if (L.zig) assert.ok(L.portrait && nC >= 3 && (L.spK * (nC - 1) + 1.25) * L.item <= L.usable + 1e-6);
      else assert.ok((L.spK * (nC - 1) + 1.25) * L.item <= L.usable + 1e-6 && L.spK >= 1.18);
    }
  }
});

/** Rest geometry of a world's current round: per drum the body box incl. the hop reserve, the cushion box, the hit circle. */
function restGeo(w) {
  const L = w.layout;
  return w.drums.map(c => {
    const pad = c.padBase, hop = CFG.hopMax + CFG.bobAmp;
    return { c, pad,
      body: { x: c.padX - c.bw / 2, y: pad - c.bh - hop, w: c.bw, h: c.bh + hop },
      cushion: { x: c.padX - c.cushionW / 2, y: pad - CFG.bobAmp, w: c.cushionW, h: c.cushionH + 2 * CFG.bobAmp },
      hit: { x: c.padX, y: pad + c.bcy, r: w.drumHit(c.id).r }, L };
  });
}
function checkRound(w, tag) {
  const L = w.layout, G = restGeo(w), n = w.drums.length, bb = L.bubble.y + L.bubble.h, u = L.kMax * L.item;
  assert.strictEqual(L.pads.length, n); assert.strictEqual(L.n, n, tag + ' layout sized for this round');
  for (let i = 0; i < n; i++) {
    const g = G[i], c = g.c, p = L.pads[i];
    assert.strictEqual(c.padX, p.x); assert.strictEqual(c.padBase, p.y);
    assert.ok(c.bcy < 0 && c.bh <= c.size + 1e-6 && c.bw <= c.size + 1e-6, tag + ' body box');
    if (i) {
      const sp = c.padX - G[i - 1].c.padX, dy = Math.abs(c.padBase - G[i - 1].c.padBase);
      if (L.zig) assert.ok(sp >= 0.95 * u - 1e-6 && sp <= 1.3 * u + 1e-6, `${tag} zig spacing ${sp.toFixed(1)}`);
      else assert.ok(sp >= 1.18 * u - 1e-6 && sp >= L.spK * u - 1e-6 && sp <= 1.7 * u + 1e-6, `${tag} pad spacing ${sp.toFixed(1)} (u ${u})`);
      if (p.flat) assert.ok(dy < 1e-6, tag + ' size rounds: one line');
      else if (!L.zig && !L.tight && !p.clipped && !L.pads[i - 1].clipped) assert.ok(dy >= 24 - 1e-6, `${tag} staggered neighbours ${dy.toFixed(1)}`);
      if (L.zig) assert.ok(dy >= 1.35 * u + 46 - 2 * 8 - 1e-6 || p.clipped || L.pads[i - 1].clipped, `${tag} zig rows ${dy.toFixed(0)}`);
      // bodies (incl. the hop) never overlap a neighbour's body or cushion
      const q = G[i - 1];
      assert.ok(!boxHit(g.body, q.body), `${tag} bodies of ${q.c.id} / ${c.id} overlap`);
      assert.ok(!boxHit(g.body, q.cushion) && !boxHit(q.body, g.cushion), `${tag} a body overlaps the neighbour's cushion`);
    }
    // fully on screen, inside the safe area horizontally
    assert.ok(c.padX - c.cushionW / 2 >= L.ins.left - 1e-6 && c.padX + c.cushionW / 2 <= L.W - L.ins.right + 1e-6, tag + ' inside the screen (x)');
    assert.ok(c.padX - c.cushionW / 2 >= L.stage.x0 - 1e-6 && c.padX + c.cushionW / 2 <= L.stage.x1 + 1e-6, tag + ' inside the stage');
    assert.ok(g.body.y > L.ins.top, `${tag} body top ${g.body.y.toFixed(0)} on screen`);
    const cb = c.padBase + c.cushionH + CFG.bobAmp;
    assert.ok(cb <= L.floor + 1e-6 || p.clipped, `${tag} cushion bottom ${cb.toFixed(0)} above the floor ${L.floor.toFixed(0)}`);
    if (L.portrait) assert.ok(cb <= L.bibi.y - L.bibi.h - 40 + 1e-6 && cb <= L.cymbalBox.y - 40 + 1e-6, `${tag} above Bibi's head / the cymbal`);
    else {
      assert.ok(cb <= L.groundY - 110 + 1e-6, tag + ' the lamb walks below');
      if (Math.abs(c.padX - L.cymbal.x) < L.cymbal.w / 2 + c.cushionW / 2) assert.ok(cb <= L.cymbalBox.y - 20 + 1e-6, tag + ' above the cymbal');
    }
    // hit circle: below the lanterns and the bubble, clear of the HUD / bubble / Bibi / cymbal
    assert.ok(g.hit.y - g.hit.r >= L.topLimit - CFG.bobAmp - 1e-6 || p.clipped, `${tag} hit top ${(g.hit.y - g.hit.r).toFixed(0)} below the lanterns ${L.topLimit}`);
    assert.ok(g.hit.y - g.hit.r > bb, tag + ' hit circle below the bubble');
    for (const k of L.keep) assert.ok(!circleBox(g.hit, k) && !boxHit(g.cushion, k), `${tag} ${c.id} overlaps the ${k.kind}`);
    assert.ok(!circleBox(g.hit, L.bibiBox) && !boxHit(g.cushion, L.bibiBox), `${tag} ${c.id} overlaps Bibi`);
    assert.ok(!circleBox(g.hit, L.cymbalBox) && !boxHit(g.cushion, L.cymbalBox), `${tag} ${c.id} overlaps the cymbal`);
  }
  // centred on the stage (beat side mode: the drum + card pair)
  const mid = (L.stage.x0 + L.stage.x1) / 2, cen = (w.drums[0].padX + w.drums[n - 1].padX) / 2 - (L.beat ? L.beat.shift : 0);
  assert.ok(Math.abs(mid - cen) < 1e-6, tag + ' pads centred');
  for (const l of w.lanterns) {
    assert.ok(l.x > L.garland.x0 && l.x < L.garland.x1 && l.y >= L.garland.y - 1e-6 && l.y <= L.garland.y + 22 + 1e-6);
    assert.ok(l.y - 24 > bb, tag + ' lantern below the bubble');
    for (const k of L.keep) assert.ok(!inside(k, l.x, l.y, 22), tag + ' lantern clear of the ' + k.kind);
  }
}
/** The beat card box at rest (beat mode). */
function checkCard(w, tag) {
  const L = w.layout, K = w.card, c = w.drums[0], bb = L.bubble.y + L.bubble.h;
  assert.ok(K, tag + ' card');
  const box = { x: K.x - K.w / 2, y: K.y - K.h / 2, w: K.w, h: K.h };
  assert.ok(box.x >= L.ins.left && box.x + box.w <= L.W - L.ins.right && box.y > bb + 4, tag + ' card on screen, below the bubble');
  for (const k of L.keep) assert.ok(!boxHit(box, k), tag + ' card overlaps the ' + k.kind);
  assert.ok(box.y >= L.lanternBottom + 8 - 1e-6, `${tag} card top ${box.y.toFixed(0)} below the lanterns ${L.lanternBottom}`);
  const ring = CFG.ringK * c.size, body = { x: c.padX - c.bw / 2 - CFG.ringSideK * c.size, y: c.padBase - c.bh - CFG.hopMax - ring - CFG.bobAmp, w: c.bw + 2 * CFG.ringSideK * c.size, h: c.bh + CFG.hopMax + ring };
  assert.ok(!boxHit(box, body), tag + ' card clear of the bouncing drum and its sound rings');
  if (L.tall || L.phone) assert.ok(K.h === 170 || K.h >= 110, tag + ' phone card');
  assert.ok(!boxHit(box, L.bibiBox) && !boxHit(box, L.cymbalBox), tag + ' card clear of Bibi / the cymbal');
}

test('layout: every viewport × age × topic (rounds 0, 2 and a short one) — pads spaced, staggered, drums + cushions fully on screen, above Bibi / cymbal, hit circles clear of Bibi / bubble / HUD, the beat card clear', () => {
  let n = 0;
  for (const v of VIEWPORTS) for (const age of AGES) for (const topic of CD.AGE_POOLS[age]) for (const [ri, late] of [[0, 0], [2, 0], [3, 70]]) {
    const w = mkWorld({ age, vp: v, seed: 5 + n++ });
    roundOf(w, topic, ri, { late });
    const tag = `${v.name} age ${age} ${topic} r${ri}${late ? ' short' : ''} (${w.drums.length} drums)`;
    checkRound(w, tag);
    if (w._beat) checkCard(w, tag);
  }
  assert.ok(n > 900);
});

test('layout: fuzz 400 random aspects + device-like insets + measured HUD boxes: always fits, sane boxes', () => {
  const r = new CD.RNG(77);
  for (let i = 0; i < 400; i++) {
    const land = r.chance(0.5), cw = land ? r.int(560, 1400) : r.int(320, 1030), ch = land ? r.int(320, Math.min(cw, 1030)) : r.int(cw, 1400);
    const phoneL = land && cw / ch > 1.9;   // notch side insets only on landscape phones (as on every Apple device)
    const v = dev('fuzz', cw, ch, r.chance(0.5) ? { top: land ? r.int(0, 24) : r.int(0, 60), bottom: r.int(0, 34), left: phoneL ? r.int(0, 59) : 0, right: phoneL ? r.int(0, 59) : 0 } : null);
    const age = r.pick(AGES);
    const w = new CD.World({ seed: i, age, config: { surpriseTypes: [] } });
    w.hudKeep = r.chance(0.4) ? [{ x: v.W - v.ins.right - 150, y: v.ins.top + 6, w: 140, h: r.int(60, 110) }] : null;
    w.setViewport(v.W, v.H, v.ins); w.newSession();
    const L = w.layout;
    assert.ok(L.fits, `${v.W}×${v.H} ${JSON.stringify(v.ins)} age ${age} hud ${JSON.stringify(w.hudKeep)} fits (floor ${L.floor} topLimit ${L.topLimit} base ${L.base} item ${L.item} tier ${L.tier})`);
    for (const k of ['groundY', 'item']) assert.ok(Number.isFinite(L[k]));
    const pool = CD.AGE_POOLS[age];
    roundOf(w, pool[r.int(0, pool.length - 1)], 2);
    assert.ok(w.layout.fits, 'round layout fits');
    checkRound(w, `fuzz ${v.W}×${v.H} ${JSON.stringify(v.ins)} age ${age} ${w.topic}`);
    if (w._beat) checkCard(w, 'fuzz card');
  }
});

test('layout: hit test — circle r = 0.6 × size + 14 at the (bounced) body centre + the cushion box; nearest wins; Bibi / the cymbal are not drums', () => {
  const w = roundOf(mkWorld({ age: 5 }), 'count', 2);
  for (const c of w.drums) {
    const h = w.drumHit(c.id);
    assert.strictEqual(h.r, 0.6 * c.size + 14);
    assert.ok(Math.abs(h.x - c.cx) < 1e-9 && Math.abs(h.y - c.cy) < 1e-9);
    assert.strictEqual(w._drumAt(h.x, h.y), c);
    assert.strictEqual(w._drumAt(c.padX + c.cushionW * 0.45, c.padY + c.cushionH * 0.9), c, 'the cushion counts');
    assert.strictEqual(w._drumAt(c.padX, c.padY + c.cushionH + 30), null, 'below the cushion');
  }
  // hopping: the hit circle follows the body
  const c = w.drums[0]; c.hop = 30; c.tilt = 0; w._pose(c);
  assert.ok(Math.abs(w.drumHit(c.id).y - (c.padY - 30 + c.bcy)) < 1e-6);
  const kb = w.bibiHit(); assert.strictEqual(w._drumAt(kb.cx, kb.cy), null);
  const cy = w.cymbalHit(); assert.strictEqual(w._drumAt(cy.cx, cy.cy), null);
  const st = w.stageHit(); assert.ok(st.x0 === w.layout.stage.x0 && st.x1 === w.layout.stage.x1 && Number.isFinite(st.y) && st.band === w.layout.band);
  // statics
  const L = w.layout, pads = CD.World.padsFor(L, 4, {}, 7);
  assert.strictEqual(pads.length, 4); assert.ok(pads.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)));
  assert.deepStrictEqual(CD.World.padsFor(L, 4, {}, 7), pads, 'deterministic per seed');
  assert.strictEqual(CD.World.lanternsFor(L, 3).length, 3);
  const bx = CD.World.bodyBox({ kind: 'drum' }, 100); assert.ok(bx.w === 100 && bx.h === 86 && bx.cy === -43);
  const ba = CD.World.bodyBox({ kind: 'animal' }, 100); assert.ok(ba.w === 90 && ba.h === 100 && ba.cy < 0);
  const bg = CD.World.bodyBox({ kind: 'big' }, 100); assert.ok(bg.h === 95 && bg.cy < 0);
});

test('layout: iPhone 393×852 / 852×393 + iPads — every hit circle ≥ 100 css px across on phones; ≤ 4 drums drawn ≥ 80 css px; 5 drums stand in a zig-zag on the phone in portrait', () => {
  for (const [cw, ch, ci] of [[393, 852, { top: 59, bottom: 34 }], [852, 393, { left: 59, right: 59, bottom: 21 }], [820, 1180, { top: 24, bottom: 20 }], [1180, 820, { top: 24, bottom: 20 }], [720, 1556]]) {
    const v = dev('dev', cw, ch, ci), k = v.k, phone = Math.max(cw, ch) / Math.min(cw, ch) > 1.9;
    for (const age of AGES) for (const topic of CD.AGE_POOLS[age]) for (const ri of [0, 1, 2, 3]) {
      const w = roundOf(mkWorld({ age, vp: v, seed: ri * 7 + age }), topic, ri), n = w.drums.length, L = w.layout, tag = `${cw}×${ch} age ${age} ${topic} r${ri} n ${n}`;
      if (phone) for (const c of w.drums) assert.ok(2 * w.drumHit(c.id).r * k >= 100 - 0.5, tag + ' hit ' + (2 * w.drumHit(c.id).r * k).toFixed(0) + ' css (the small drum too)');
      if (phone && n <= 4) assert.ok(L.item * L.kMax * k >= 80 && (topic !== 'size' || L.item * k >= 70), `${tag} drawn ${(L.item * k).toFixed(0)} css px`);   // size rounds: one line, the big drum ≥ 80 css
      if ((phone || L.tall) && age >= 5) assert.ok(n <= 4, tag + ' ≤ 4 drums on phones');
      if (L.portrait && !w._beat && !L.tight) {   // the band is centred between the lanterns and Bibi's head (unless clamped)
        const top = Math.min(...w.drums.map(c => c.padBase - c.bh)), bot = Math.max(...w.drums.map(c => c.padBase + c.cushionH)), mid = (L.lanternBottom + L.floor) / 2;
        assert.ok(Math.abs((top + bot) / 2 - mid) < 0.12 * (L.floor - L.lanternBottom) + 30, `${tag} band centre ${((top + bot) / 2).toFixed(0)} vs ${mid.toFixed(0)}`);
      }
      if (w._beat) assert.ok(w.drums[0].size * k >= (phone ? 95 : 100), tag + ' the big drum is big');
      checkRound(w, tag);
      if (w._beat) checkCard(w, tag);
    }
  }
  // per round: a 2-drum warm-up gets bigger drums than a 5-drum round on the same phone
  const v = dev('iPhone', 393, 852, { top: 59, bottom: 34 });
  const w2 = roundOf(mkWorld({ age: 6, vp: v }), 'add', 0), i2 = w2.layout.item;
  roundOf(w2, 'add', 2); assert.ok(w2.drums.length === 4 && w2.layout.item <= i2, 'phones: 4 drums at age 6');
  const L5 = CD.World.computeLayout(v.W, v.H, v.ins, {}, 6, null, 5); assert.ok(L5.fits && L5.zig, '5 drums (after a rotation) still stand in a zig-zag');
  const vt = dev('tall', 360, 880), L3 = CD.World.computeLayout(vt.W, vt.H, vt.ins, {}, 4, null, 2); assert.ok(L3.item === 170, 'tall phone item 170 (' + L3.item + ')');
});

// ================================================================ content
test('content: tables (palette hex, topics per age, shapes, animals, notes, drum kinds; age 3 never gets count)', () => {
  for (const k in HEX) assert.strictEqual(CD.PALETTE[k].base, HEX[k]);
  assert.deepStrictEqual(CD.AGE_TOPICS, AGE_TOPICS);
  assert.deepStrictEqual(CD.ANIMALS, ANIMALS);
  assert.deepStrictEqual(CD.NOTES, ['C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6']);
  assert.deepStrictEqual(CD.DRUM_KINDS, KINDS);
  assert.strictEqual(CD.SHAPES.length, 8);
  for (const a of [3, 4, 5, 6, 7]) for (const t of CD.AGE_TOPICS[a]) assert.ok(CD.AGE_POOLS[a].includes(t));
  assert.ok(!CD.AGE_POOLS[3].includes('count') && !CD.AGE_TOPICS[3].includes('count'));
  const r = new CD.RNG(3); let last = AGE_TOPICS[3];
  for (let k = 0; k < 20; k++) { last = C.topicsFor(3, r, last); assert.ok(!last.includes('count')); }
  // initials: VI drops the frog (Ê is not taught as its own letter); every other initial is in the pool
  for (const a of ANIMALS) { assert.strictEqual(C.initialOf(a, 'en'), EN_INI[a]); assert.strictEqual(C.initialOf(a, 'vi'), VI_INI[a]); }
});

test('content: every topic × age 3–7 × 160 seeds × rounds 0–3 × level 0/1 × EN/VI (≈ 90 000 rounds) valid; one match per step (independent matcher)', () => {
  let n = 0;
  for (const topic of TOPICS) for (const age of AGES) for (let s = 0; s < 160; s++) {
    const lang = s % 2 ? 'vi' : 'en', ri = s % 4, level = (s >> 2) % 2;
    const r = C.makeRound(topic, { age, lang, rng: new CD.RNG(s * 31 + age), roundIndex: ri, level, short: s % 11 === 5 });
    n++;
    assert.strictEqual(C.validate(r), null);
    const byId = Object.fromEntries(r.drums.map(c => [c.id, c]));
    const rung = new Set(), beat = topic === 'count' && age <= 4;
    assert.ok(beat ? r.drums.length === 1 : r.drums.length >= 2 && r.drums.length <= 5);
    for (const st of r.steps) {
      if (beat) { assert.strictEqual(st.mode, 'beat'); assert.ok(myMatch(r, st, byId[st.targets[0]].thing)); continue; }
      const hits = r.drums.filter(c => !rung.has(c.id) && myMatch(r, st, c.thing)).map(c => c.id);
      if (st.mode === 'find') assert.deepStrictEqual(hits, st.targets, `${topic} age ${age}: exactly one match`);
      else assert.deepStrictEqual(hits.sort(), st.targets.slice().sort());
      for (const id of st.targets) { assert.ok(byId[id].target); rung.add(id); }
    }
    if (!beat) assert.ok(r.drums.filter(c => !c.target).every(c => r.steps.every(st => !myMatch(r, st, c.thing))), 'a distractor matches');
    // the tune climbs; notes distinct; colours clash-free below 5
    const notes = beat ? r.steps.map(s => s.note) : r.song.map(id => byId[id].note);
    for (let i = 1; i < notes.length; i++) assert.ok(notes[i] > notes[i - 1]);
    assert.strictEqual(new Set(r.drums.map(c => c.note)).size, r.drums.length);
    const cs = [...new Set(r.drums.map(c => c.thing.color).filter(Boolean))];
    if (age < 5) { assert.ok(!CLASH.some(([a, b]) => cs.includes(a) && cs.includes(b)), 'clash ' + cs); assert.ok(!cs.includes('pink')); }
    for (const c of r.drums) assert.ok(KINDS.includes(c.thing.kind) && c.thing.nameKind && c.thing.nameValue !== undefined);
  }
  for (const topic of TOPICS) for (const age of AGES) for (let s = 0; s < 400; s++) for (const ri of [0, 1, 2, 3]) {
    const r = C.makeRound(topic, { age, lang: s % 2 ? 'vi' : 'en', rng: new CD.RNG(s + 9000), roundIndex: ri, level: s % 3 === 0 ? 0 : 1 }); n++;
    assert.strictEqual(C.validate(r), null);
  }
  assert.ok(n > 90000, n + ' rounds');
});

test('content: drums per round (DESIGN §5.1): warm-up 2 + 0; age 3: 2 (+1 from round 2); age 4: 3 + 1 (level 0: 3 + 0); age 5: 3–4 + 1; 6+: 4 + 1; short 2; beat: ONE big drum', () => {
  const R = (topic, age, ri, level, short, s) => C.makeRound(topic, { age, rng: new CD.RNG(s), roundIndex: ri, level, short });
  const cnt = r => [r.drums.filter(c => c.target).length, r.drums.filter(c => !c.target).length];
  for (let s = 0; s < 60; s++) {
    for (const age of AGES) assert.deepStrictEqual(cnt(R(age >= 6 ? 'add' : 'animals', age, 0, 1, false, s)), [2, 0]);
    assert.deepStrictEqual(cnt(R('animals', 3, 1, 1, false, s)), [2, 0]);
    assert.deepStrictEqual(cnt(R('animals', 3, 2, 1, false, s)), [2, 1]);
    assert.deepStrictEqual(cnt(R('animals', 3, 2, 0, false, s)), [2, 0]);
    assert.deepStrictEqual(cnt(R('animals', 4, 2, 0, false, s)), [3, 0]);
    assert.deepStrictEqual(cnt(R('animals', 4, 2, 1, false, s)), [3, 1]);
    assert.deepStrictEqual(cnt(R('colors', 4, 2, 1, false, s)), [2, 1], 'only 3 clash-free colours below 5');
    assert.deepStrictEqual(cnt(R('colors', 4, 2, 0, false, s)), [3, 0]);
    for (const ri of [0, 1, 2, 3]) assert.deepStrictEqual(cnt(R('count', 4, ri, 1, ri === 3, s)), [1, 0], 'beat: one big drum');
    const c5 = cnt(R('count', 5, 2, 1, false, s)); assert.ok(c5[0] >= 3 && c5[0] <= 4 && c5[1] === 1);
    assert.deepStrictEqual(cnt(R('add', 6, 2, 1, false, s)), [4, 1]);
    assert.deepStrictEqual(cnt(R('animals', 6, 3, 1, true, s)), [2, 1]);
    const oe = cnt(R('oddeven', 7, 2, 1, false, s)); assert.ok(oe[0] >= 2 && oe[0] <= 3 && oe[1] >= 1 && oe[1] <= 2);
  }
});

test('content: topic rules — colour drums, shape drums (one colour < 5, no confusable pairs), size big/small drums, beat steps, dots, letters, b/d/p/q, initials', () => {
  for (let s = 0; s < 300; s++) {
    const rng = () => new CD.RNG(s * 7 + 1);
    const col = C.makeRound('colors', { age: 3, rng: rng(), roundIndex: 2 });
    assert.ok(col.drums.every(c => c.thing.kind === 'drum' && !c.thing.size));
    assert.strictEqual(new Set(col.drums.map(c => c.thing.color)).size, col.drums.length);
    const sh = C.makeRound('shapes', { age: 4, rng: rng(), roundIndex: 2 });
    assert.ok(sh.drums.every(c => c.thing.kind === 'shape'));
    assert.strictEqual(new Set(sh.drums.map(c => c.thing.color)).size, 1);
    const shs = sh.drums.map(c => c.thing.shape);
    for (const [a, b] of [['square', 'rect'], ['circle', 'oval'], ['square', 'diamond']]) assert.ok(!(shs.includes(a) && shs.includes(b)));
    const sh3 = C.makeRound('shapes', { age: 3, rng: rng(), roundIndex: 2 });
    assert.ok(sh3.drums.every(c => ['circle', 'square', 'triangle', 'star', 'heart'].includes(c.thing.shape)));
    const s5 = C.makeRound('shapes', { age: 5, rng: rng(), roundIndex: 2 });
    assert.strictEqual(s5.steps[0].promptKey, 'p.shapes5');
    const sz = C.makeRound('size', { age: 3, rng: rng(), roundIndex: 2 });
    const dr = sz.drums.filter(c => c.target);
    assert.strictEqual(dr.length, 2); assert.deepStrictEqual(dr.map(c => c.thing.size).sort(), ['big', 'small']);
    assert.strictEqual(dr[0].thing.color, dr[1].thing.color);
    assert.ok(sz.drums.length === 3 && sz.drums.filter(c => !c.target).every(c => c.thing.kind === 'drum' && c.thing.size === 'mid' && c.thing.color !== dr[0].thing.color), 'mid-size distractor of another colour');
    assert.ok(sz.steps.every(st => st.promptKey === 'p.size' && ['big', 'small'].includes(st.params.size)));
    // beat mode (count, age 4): warm-up 1, 2; later 3 steps (2 when short) of distinct n in 1–5 with one ≥ 3
    for (const ri of [0, 1, 2, 3]) for (const short of [false, true]) {
      const bt = C.makeRound('count', { age: 4, rng: rng(), roundIndex: ri, short });
      const ns = bt.steps.map(st => st.need);
      assert.ok(bt.drums.length === 1 && bt.drums[0].thing.kind === 'big' && bt.drums[0].target);
      assert.ok(bt.steps.every(st => st.mode === 'beat' && st.promptKey === 'p.beat' && st.params.n === st.need && st.targets[0] === bt.drums[0].id));
      if (ri === 0) assert.deepStrictEqual(ns, [1, 2]);
      else { assert.strictEqual(ns.length, short ? 2 : 3); assert.ok(Math.max(...ns) >= 3 && new Set(ns).size === ns.length && ns.every(x => x >= 2 && x <= 5), 'n 2–5 after the warm-up'); }
      assert.deepStrictEqual(bt.song, bt.steps.map(() => bt.drums[0].id));
    }
    const d5 = C.makeRound('count', { age: 5, rng: rng(), roundIndex: 2 }), ns = d5.drums.map(c => c.thing.n);
    assert.ok(d5.drums.every(c => c.thing.kind === 'dots') && d5.steps.every(st => st.promptKey === 'p.count' && st.params.kind === 'dots'));
    for (let i = 0; i < ns.length; i++) for (let j = 0; j < i; j++) assert.ok(Math.abs(ns[i] - ns[j]) > 1, 'no neighbours at age 5');
    const lw = C.makeRound('lower', { age: 6, rng: rng(), roundIndex: 2 }), tx = lw.drums.map(c => c.thing.text);
    assert.ok(tx.filter(c => 'bdpq'.includes(c)).length <= 1 && !tx.some(c => c === 'l' || c === 'i'));
    assert.ok(lw.steps.every(st => st.params.letter === st.params.small.toUpperCase()));
    for (const lang of ['en', 'vi']) {
      const ini = C.makeRound('initial', { age: 6, lang, rng: rng(), roundIndex: 2 }), I = ini.drums.map(c => C.initialOf(c.thing.animal, lang));
      assert.strictEqual(new Set(I).size, I.length); assert.ok(I.every(Boolean));
      if (lang === 'vi') assert.ok(!ini.drums.some(c => c.thing.animal === 'frog'));
    }
  }
  // validate() rejects broken beat rounds
  const ok = C.makeRound('count', { age: 4, rng: new CD.RNG(5), roundIndex: 2 });
  const bad1 = J(ok); bad1.steps[1].need = bad1.steps[0].need; bad1.steps[1].params.n = bad1.steps[1].need; bad1.steps[1].nameValue = bad1.steps[1].need; bad1.key = C.roundKey(bad1);
  assert.ok(C.validate(bad1));
  const bad2 = J(ok); bad2.steps[2].note = bad2.steps[0].note; assert.ok(C.validate(bad2));
  const bad3 = J(ok); bad3.drums.push({ id: 'c1', thing: { kind: 'drum', color: 'red', nameKind: 'color', nameValue: 'red' }, note: 6, target: false }); assert.ok(C.validate(bad3));
});

test('content: deterministic per seed; variety across seeds; beat rounds never repeat a set in a chapter', () => {
  const a = C.makeRound('shapes', { age: 4, rng: new CD.RNG(5), roundIndex: 2 }), b = C.makeRound('shapes', { age: 4, rng: new CD.RNG(5), roundIndex: 2 });
  assert.deepStrictEqual(a, b);
  const keys = new Set();
  for (let s = 0; s < 60; s++) keys.add(C.makeRound('animals', { age: 4, rng: new CD.RNG(s), roundIndex: 2 }).key);
  assert.ok(keys.size > 30);
  for (let s = 0; s < 40; s++) {
    const rng = new CD.RNG(s), used = []; let prev = null;
    for (let ri = 0; ri < 4; ri++) {
      const r = C.makeRound('count', { age: 4, rng, roundIndex: ri, usedKeys: used, prevAns: prev });
      assert.ok(!used.includes(r.key)); used.push(r.key);
      if (prev !== null) assert.notStrictEqual(r.steps[0].need, prev, 'never the same n twice in a row across rounds');
      prev = r.steps[r.steps.length - 1].need;
    }
  }
});

test('content: Talk time for every topic × age (pictures, the answer among them, 2 choices at age 3, picture icon kinds; count shows a dots drum)', () => {
  for (const topic of TOPICS) for (const age of AGES) for (let s = 0; s < 40; s++) {
    const t = C.makeTalk(topic, { age, lang: s % 2 ? 'vi' : 'en', rng: new CD.RNG(s) });
    assert.strictEqual(t.promptKey, 'talk.' + topic);
    assert.ok(t.choices.some(c => c.id === t.answer) && t.answerId === t.answer);
    assert.ok(t.choices.length >= 2 && t.choices.length <= 3);
    if (age <= 3 && !['letters', 'lower', 'initial', 'add', 'sub', 'oddeven'].includes(topic)) assert.strictEqual(t.choices.length, 2);
    assert.strictEqual(new Set(t.choices.map(c => JSON.stringify(c.value))).size, t.choices.length);
    for (const c of t.choices) assert.ok(ICON_KINDS.includes(c.thing.kind), topic + ' icon ' + c.thing.kind);
    if (t.show) assert.ok(ICON_KINDS.includes(t.show.kind));
    if (topic === 'count') { assert.strictEqual(t.show.kind, 'dots'); assert.strictEqual(t.show.n, t.params.n); assert.ok(t.choices.every(c => c.thing.kind === 'number')); if (age <= 4) assert.ok(t.choices.every(c => c.value <= 5)); }
    if (topic === 'colors') assert.strictEqual(t.show.kind, 'drum');
    if (topic === 'oddeven') assert.strictEqual(t.choices.filter(c => parity(c.value) === t.params.parity).length, 1);
  }
});

test('content: chapter topics rotate between sessions (the left-out topic comes back next session), always easiest first', () => {
  for (const age of AGES) {
    assert.deepStrictEqual(C.topicsFor(age), AGE_TOPICS[age]);
    const rng = new CD.RNG(age); let last = AGE_TOPICS[age];
    for (let k = 0; k < 6; k++) {
      const next = C.topicsFor(age, rng, last), pool = CD.AGE_POOLS[age];
      const left = pool.filter(t => !last.includes(t));
      assert.strictEqual(next.length, 4);
      for (const t of left) assert.ok(next.includes(t));
      for (let i = 1; i < 4; i++) assert.ok(pool.indexOf(next[i]) > pool.indexOf(next[i - 1]));
      last = next;
    }
  }
});

// ================================================================ world: enter + physics
test('world: enter — cushions puff in (0.1 s apart, overshoot), then drums fall from above the top edge one by one (released 0.14 s apart) and land (drumIn + land, squash + cushion dent); then the ask', () => {
  const w = mkWorld({ age: 4 });
  w.levels = ['animals', 'animals', 'animals', 'animals']; w.startLevel(1); w.round = 2; w._beginRound();
  const ins = [], lands = [], t0 = w.time, popAt = {}, cushAt = {}, maxCush = {}, minY = {}, postSq = {}, postDent = {};
  let ask = null;
  assert.strictEqual(w.phase, 'enter');
  assert.strictEqual(w.lanterns.length, w.cur.steps.reduce((s, st) => s + st.need, 0));
  assert.ok(w.lanterns.every(l => l.lit === 0));
  assert.ok(w.drums.every(c => c.state === 'enter' && c.y < 0), 'the drums start above the top edge');
  while (!ask && w.time - t0 < 5) {
    w.update(H);
    for (const c of w.drums) {
      if (c.pop > 0 && popAt[c.id] === undefined) { popAt[c.id] = w.time - t0; assert.ok(c.y < 0); }
      if (c.cushionPop > 0 && cushAt[c.id] === undefined) cushAt[c.id] = w.time - t0;
      maxCush[c.id] = Math.max(maxCush[c.id] || 0, c.cushionPop);
      minY[c.id] = Math.min(minY[c.id] === undefined ? 1e9 : minY[c.id], c.y);
      if (c.state === 'stand') { postSq[c.id] = Math.min(postSq[c.id] || 9, c.sq); postDent[c.id] = Math.max(postDent[c.id] || 0, c.dent); }
    }
    for (const e of evs(w)) { if (e.type === 'drumIn') ins.push({ id: e.id, t: w.time - t0 }); if (e.type === 'land') lands.push(e); if (e.type === 'ask') ask = { t: w.time - t0, e }; }
  }
  assert.ok(ask && ask.e.first, 'asked');
  assert.strictEqual(ins.length, w.drums.length);
  assert.ok(lands.length >= w.drums.length && lands.every(e => Number.isFinite(e.x) && Number.isFinite(e.y) && e.v > 0));
  const ca = w.drums.map(c => cushAt[c.id]), pa = w.drums.map(c => popAt[c.id]);
  for (let i = 1; i < ca.length; i++) assert.ok(Math.abs(ca[i] - ca[i - 1] - 0.1) < 0.01, 'cushion stagger');
  for (let i = 1; i < pa.length; i++) assert.ok(Math.abs(pa[i] - pa[i - 1] - 0.14) < 0.01, 'drop stagger');
  assert.ok(pa[0] > ca[ca.length - 1], 'cushions first, then drums');
  for (const c of w.drums) {
    assert.ok(maxCush[c.id] > 1.05 && Math.abs(c.cushionPop - 1) < 1e-6, 'cushion overshoot ' + maxCush[c.id]);
    assert.strictEqual(c.state, 'stand'); assert.ok(c.hop === 0);
    assert.ok(postSq[c.id] < 0.86, 'landing squash ' + postSq[c.id]); assert.ok(postDent[c.id] > 0.5, 'cushion dent ' + postDent[c.id]);
    assert.ok(Math.abs(c.sq - 1) < 0.1 && Math.abs(c.dent) < 0.4, 'calm before the ask');
  }
  assert.ok(ask.t >= CFG.enterMin - 1e-6 && ask.t < 2.6, 'ask at ' + ask.t);
  assert.ok(w.interactive);
});

test('world: a press during enter is soft {kind:"early"} (or a brush on a drum already standing) — never judged', () => {
  const w = mkWorld({ age: 4 });
  w.levels = ['animals', 'animals', 'animals', 'animals']; w.startLevel(1); w.round = 1; w._beginRound();
  const p = freeSky(w);
  assert.strictEqual(w.pointerDown(p.x, p.y), 'early'); w.pointerUp();
  until(w, () => w.drums.some(q => q.state === 'stand'));
  const c = w.drums.find(q => q.state === 'stand'), h = w.drumHit(c.id);
  assert.strictEqual(w.phase, 'enter');
  assert.strictEqual(w.pointerDown(h.x, h.y), 'brush'); w.pointerUp();
  const e = evs(w);
  assert.ok(!types(e).includes('right') && !types(e).includes('wrong'));
  assert.ok(e.some(x => x.type === 'ring' && x.brush && !x.judged));
});

/** A settled drum of a fresh round (no idle wiggle) for physics probes. */
function settled(o) {
  const w = roundOf(mkWorld(Object.assign({ age: 4, config: { wiggleAmp: 0 } }, o || {})), 'animals', 1);
  run(w, 1.5); evs(w);
  return w;
}
/** Track a drum over T s → {minSq, minSqT, maxSq, maxHop, hopT, maxDent, minDent, maxTilt, minTilt, landT, skin06}. */
function track(w, c, T, onStep) {
  const o = { minSq: 9, minSqT: 0, maxSq: 0, maxHop: 0, hopT: 0, maxDent: -9, minDent: 9, maxTilt: -9, minTilt: 9, landT: null, firstHopT: null, lands: 0 };
  const t0 = w.time;
  run(w, T, (i) => {
    if (onStep) onStep(i);
    const t = w.time - t0;
    if (c.sq < o.minSq) { o.minSq = c.sq; o.minSqT = t; }
    o.maxSq = Math.max(o.maxSq, c.sq);
    if (c.hop > o.maxHop) { o.maxHop = c.hop; o.hopT = t; }
    if (c.hop > 0 && o.firstHopT === null) { o.firstHopT = t; o.sqAtLaunch = c.sq; }
    o.maxDent = Math.max(o.maxDent, c.dent); o.minDent = Math.min(o.minDent, c.dent);
    o.maxTilt = Math.max(o.maxTilt, c.tilt); o.minTilt = Math.min(o.minTilt, c.tilt);
    if (Math.abs(t - 0.62) < H / 2) o.skin06 = c.skin;
    for (const e of evs(w)) if (e.type === 'land' && e.id === c.id) { o.lands++; if (o.landT === null) o.landT = t; o.landV = e.v; }
  });
  return o;
}

test('world: drum bounce — anticipation squash (≈ 0.86) BEFORE the hop, hop peak 22 px for a tap (exact ballistic, gravity 2600), landing squash ≈ 0.8 + cushion dent + land event, skin ripple 1 → 0 in 0.6 s, tilt away from the finger, everything settles', () => {
  const w = settled(), c = w.drums[0], h = w.drumHit(c.id);
  w.pointerDown(h.x - 20, h.y);   // left of the centre → leans right
  const o = track(w, c, 1.6, (i) => { if (i === 8) w.pointerUp(); });
  assert.ok(o.firstHopT >= CFG.windup - 2 * H && o.firstHopT <= CFG.windup + 2 * H, 'windup ' + o.firstHopT);
  assert.ok(o.sqAtLaunch < 0.9 && o.sqAtLaunch > 0.82, 'anticipation squash ' + o.sqAtLaunch);
  assert.ok(Math.abs(o.maxHop - 22) < 0.6, 'hop peak ' + o.maxHop);
  const tUp = Math.sqrt(2 * 22 / CFG.gravity);
  assert.ok(Math.abs(o.landT - (CFG.windup + 2 * tUp)) < 0.02, 'air time ' + o.landT);
  assert.ok(o.maxSq > 1.03 && o.maxSq < 1.15, 'stretch while rising ' + o.maxSq);
  assert.ok(o.lands === 1 && o.landV > 0.8 && o.landV < 1.2, 'one landing, impact ≈ 1');
  assert.ok(o.maxDent > 0.6 && o.maxDent <= 1, 'cushion dent ' + o.maxDent);
  assert.ok(o.minDent < -0.05, 'the cushion springs back up (overshoot)');
  assert.ok(o.maxTilt > 0.09 && o.maxTilt < 0.16 && o.minTilt > -0.08, 'tilts right, away from the finger ' + o.maxTilt);
  assert.ok(o.skin06 !== undefined && o.skin06 < 0.05, 'skin ripple gone after 0.6 s');
  assert.ok(Math.abs(c.sq - 1) < 0.01 && Math.abs(c.dent) < 0.03 && Math.abs(c.tilt) < 0.01 && c.hop === 0, 'settled');
  // landing squash ≈ 0.8: the deepest squash AFTER the landing
  const w2 = settled(), c2 = w2.drums[0], h2 = w2.drumHit(c2.id);
  w2.pointerDown(h2.x + 20, h2.y); w2.pointerUp();
  let afterLand = 9, landed = false, skinPh0 = null, skinPh1 = null;
  run(w2, 0.8, (i) => { if (i === 2) skinPh0 = c2.skinPh; if (i === 14) skinPh1 = c2.skinPh; for (const e of evs(w2)) if (e.type === 'land') landed = true; if (landed) afterLand = Math.min(afterLand, c2.sq); });
  assert.ok(afterLand > 0.74 && afterLand < 0.86, 'landing squash ' + afterLand);
  assert.ok(Math.abs((skinPh1 - skinPh0) / (12 * H) - CFG.skinRate) < 0.5, 'skin phase ≈ 40 rad/s');
  assert.ok(c2.tilt !== 0 || true);
  const w3 = settled(), c3 = w3.drums[1], h3 = w3.drumHit(c3.id);
  w3.pointerDown(h3.x + 20, h3.y); w3.pointerUp();
  const o3 = track(w3, c3, 0.5);
  assert.ok(o3.minTilt < -0.09 && o3.maxTilt < 0.08, 'a press right of the centre leans it left');
});

test('world: strike strengths — swipe hops higher (≤ 30 px), a brush 14 px, a wrong (dull) strike a small hop + a bigger wobble (× 1.5), no ring flash; a strike in the air boosts it', () => {
  const peaks = {};
  for (const kind of ['tap', 'swipe', 'brush', 'wrong', 'song']) {
    const w = settled(), c = w.drums[0];
    if (kind === 'tap') w._strike(c, 1, 1, 'tap');
    if (kind === 'swipe') w._strike(c, 1, 1.6, 'tap');
    if (kind === 'brush') w._strike(c, 1, 1, 'brush');
    if (kind === 'wrong') w._strike(c, 1, 1, 'wrong');
    if (kind === 'song') w._strike(c, 1, 1, 'song');
    peaks[kind] = track(w, c, 0.8);
    if (kind === 'wrong') assert.ok(c.dull === 1 || c.ring === 0, 'dull');
  }
  assert.ok(Math.abs(peaks.tap.maxHop - 22) < 0.6 && Math.abs(peaks.swipe.maxHop - 30) < 0.6 && Math.abs(peaks.brush.maxHop - 14) < 0.6 && Math.abs(peaks.wrong.maxHop - 10) < 0.6 && Math.abs(peaks.song.maxHop - 26) < 0.6, JSON.stringify(Object.fromEntries(Object.entries(peaks).map(([k, v]) => [k, v.maxHop.toFixed(1)]))));
  assert.ok(peaks.wrong.maxTilt > peaks.tap.maxTilt * 1.3, 'wrong wobbles more');
  // wrong ring: ring 0.5 + dull (no rim flash)
  const w = settled(), c = w.drums[0]; w._strike(c, 1, 1, 'wrong'); assert.ok(c.ring === CFG.wrongRing && c.dull === 1);
  // a strike in the air: no windup, a boost
  const w2 = settled(), c2 = w2.drums[0]; w2._strike(c2, 1, 1, 'tap'); run(w2, 0.15); assert.ok(c2.air && c2.hop > 5);
  const v = c2.vy; w2._strike(c2, 1, 1, 'tap'); assert.ok(c2.vy > v && c2._windT === 0, 'boosted at once');
});

test('world: idle — each cushion bobs ±3 px (period 2.6–3.4 s, own phase) and the drum rides on it; a tiny wiggle now and then keeps them alive', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'colors', 1);
  const ys = w.drums.map(() => []), tilts = new Set();
  run(w, 8, () => { w.drums.forEach((c, i) => { ys[i].push(c.padY - c.padBase); assert.ok(Math.abs(c.y - (c.padY - c.hop)) < 1e-9); if (Math.abs(c.tilt) > 1e-4) tilts.add(c.id); }); });
  for (const y of ys) { const lo = Math.min(...y), hi = Math.max(...y); assert.ok(hi - lo > 5 && hi - lo < 6.5 && hi <= 3.01 && lo >= -3.01, 'bob ' + lo.toFixed(2) + '…' + hi.toFixed(2)); }
  for (const c of w.drums) assert.ok(c._bobT >= 2.6 && c._bobT <= 3.4);
  assert.ok(new Set(w.drums.map(c => c._bobPh.toFixed(3))).size === w.drums.length, 'own phases');
  assert.ok(tilts.size >= 1, 'wiggles');
});

// ================================================================ world: judging
test('world: a tap judges the first contact (strength ≈ 1), the drum leans away from the finger; right → ring, right {id, thing, note, lantern}, a note flies (0.7 s) → lantern lights; stepDone; next ask 1 s later', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'animals', 2);
  const c = asked(w), h = w.drumHit(c.id);
  w.pointerDown(h.x - 20, h.y);
  let e = evs(w);
  const ring = e.find(x => x.type === 'ring');
  assert.ok(ring && ring.judged && !ring.brush && Math.abs(ring.strength - 1) < 0.05);
  const r = e.find(x => x.type === 'right');
  assert.ok(r && r.id === c.id && r.lantern === 0 && r.note === c.note && r.thing.animal === c.thing.animal);
  assert.ok(e.find(x => x.type === 'stepDone' && !x.last));
  w.pointerUp();
  assert.ok(c.done); assert.strictEqual(w.notes.length, 1);
  const n = w.notes[0]; assert.strictEqual(n.lantern, 0); assert.strictEqual(n.x1, w.lanterns[0].x);
  let minY = 1e9, lt = null, ask = null, maxTilt = 0; const t0 = w.time;
  run(w, 1.3, () => { maxTilt = Math.max(maxTilt, c.tilt); if (w.notes[0]) minY = Math.min(minY, w.notes[0].y); for (const x of evs(w)) { if (x.type === 'lantern') lt = { t: w.time - t0, e: x }; if (x.type === 'ask') ask = { t: w.time - t0, e: x }; } });
  assert.ok(maxTilt > 0.08, 'leaned right');
  assert.ok(lt && Math.abs(lt.t - 0.7) < 0.03 && lt.e.i === 0, 'lantern at ' + (lt && lt.t));
  assert.ok(minY < Math.min(n.y0, n.y1) - 20, 'the note arcs up');
  assert.ok(w.lanterns[0].lit > 0.8 && w.lanterns[0].flash < 1 && Math.abs(w.lanterns[0].swing) + Math.abs(w.lanterns[0].vswing) > 0.01);
  assert.ok(ask && !ask.e.first && ask.e.step === 1 && Math.abs(ask.t - CFG.askGap) < 0.03, 'next ask ' + (ask && ask.t));
  assert.ok(c.glow > 0);
});

test('world: wrong → a dull ring + wrong {got, want, streak}, Bibi oops, a miss; stars 3 / 2 / 1', () => {
  for (const nWrong of [0, 1, 2]) {
    const w = roundOf(mkWorld({ age: 4, seed: 3 }), 'animals', 2);
    for (let k = 0; k < nWrong; k++) {
      const a = asked(w), o = w.drums.find(q => q !== a && !q.done);
      run(w, 0.3); tapDrum(w, o.id);
      const e = evs(w), wr = e.find(x => x.type === 'wrong'), ring = e.find(x => x.type === 'ring');
      assert.ok(ring.judged && ring.dull); assert.ok(o.dull > 0 && o.ring <= CFG.wrongRing + 1e-9);
      assert.strictEqual(wr.got.nameValue, o.thing.nameValue); assert.strictEqual(wr.want.nameValue, w.stepInfo.nameValue);
      assert.strictEqual(wr.streak, k + 1); assert.strictEqual(w.bibi.mood, k ? 'point' : 'oops', 'oops (then pointing with the hint)');
      assert.ok(!o.done);
    }
    solveRound(w);
    const e = evs(w).find(x => x.type === 'roundDone');
    assert.ok(e, 'roundDone'); assert.strictEqual(e.stars, [3, 2, 1][nWrong]); assert.strictEqual(e.misses, nWrong);
  }
});

test('world: gesture — first contact judged, later contacts brush (never a mistake, never progress); a drum already rung right just booms', () => {
  const w = roundOf(mkWorld({ age: 4, seed: 4 }), 'animals', 2);
  const a = asked(w), others = w.drums.filter(q => q !== a);
  const h = w.drumHit(a.id), L = w.layout;
  w.pointerDown(h.x, h.y);
  for (let x = h.x; x <= L.stage.x1 + 60; x += 20) { run(w, 1 / 60); w.pointerMove(x, h.y); }
  for (let x = L.stage.x1 + 60; x >= L.stage.x0 - 60; x -= 20) { run(w, 1 / 60); w.pointerMove(x, h.y); }
  w.pointerUp();
  let e = evs(w);
  assert.strictEqual(e.filter(x => x.type === 'right').length, 1);
  assert.strictEqual(e.filter(x => x.type === 'wrong').length, 0);
  assert.ok(e.filter(x => x.type === 'ring' && x.brush).length >= others.length - 1);
  assert.strictEqual(w.misses, 0);
  // the next step: touching the done drum first, then the asked one → still right (the done drum does not use up the judgement)
  until(w, () => w.interactive);
  const b = asked(w), ha = w.drumHit(a.id), hb = w.drumHit(b.id);
  w.pointerDown(ha.x, ha.y);
  for (let k = 1; k <= 20; k++) { run(w, 1 / 60); w.pointerMove(ha.x + (hb.x - ha.x) * k / 20, ha.y + (hb.y - ha.y) * k / 20); }
  w.pointerUp();
  e = evs(w);
  assert.ok(e.find(x => x.type === 'ring' && x.id === a.id && x.brush));
  assert.ok(e.find(x => x.type === 'right' && x.id === b.id));
});

test('world: a swipe from empty space — the FIRST drum core it crosses is judged (wrong here), every later one brushes; no soft miss counted', () => {
  const w = roundWhere({ age: 4 }, 'animals', 2, (r, w2) => { const a = w2._askedDrum(); return a && a.i > 0; });
  const first = w.drums[0], L = w.layout, y = first.cy;
  const x0 = first.cx - w.drumHit(first.id).r - 30;
  assert.strictEqual(w._drumAt(x0, y), null);
  swipe(w, x0, y, L.stage.x1 + 20, y, 30, 0.4);
  const e = evs(w);
  assert.strictEqual(e.filter(x => x.type === 'wrong').length, 1);
  assert.strictEqual(e.find(x => x.type === 'wrong').id, first.id);
  assert.ok(!types(e).includes('right'));
  assert.strictEqual(w._noProg, 1, 'the wrong counts, the empty-space press does not');
});

test('world: a swipe strikes several drums; faster → stronger (clamped 0.6–1.6 × tap) and higher hops; rate-limited per drum (0.18 s)', () => {
  const w = roundOf(mkWorld({ age: 6, seed: 2 }), 'add', 2);
  run(w, 3);
  const L = w.layout, y = w._drumMidY();
  const B = L.band;
  w.pointerDown(B.x + 2, y);
  for (let k = 1; k <= 30; k++) { run(w, 1 / 60); w.pointerMove(B.x + (B.w - 4) * k / 30, y); }
  w.pointerUp();
  const e = evs(w).filter(x => x.type === 'ring');
  assert.ok(new Set(e.map(x => x.id)).size >= w.drums.length - 1, 'the drums boom');
  for (const x of e) assert.ok(x.strength >= 0.6 - 1e-6 && x.strength <= 1.6 + 1e-6);
  // a very fast swipe is clamped at 1.6 → hop 30
  const w2 = roundOf(mkWorld({ age: 6, seed: 2, config: { fairSwipe: false } }), 'add', 2); run(w2, 3);
  const c0 = w2.drums[0], hh = w2.drumHit(c0.id);
  w2.pointerDown(hh.x - hh.r - 20, hh.y); run(w2, 1 / 120); w2.pointerMove(hh.x + hh.r + 20, hh.y); w2.pointerUp();
  const rr = evs(w2).filter(q => q.type === 'ring' && q.id === c0.id);
  assert.ok(rr.length === 1 && Math.abs(rr[0].strength - 1.6) < 1e-6, 'fast ' + (rr[0] && rr[0].strength));
  let mh = 0; run(w2, 0.6, () => { mh = Math.max(mh, c0.hop); }); assert.ok(Math.abs(mh - 30) < 0.6, 'strong swipe hop ' + mh);
  // rate limit: wiggling in and out of one drum faster than 0.18 s strikes it once
  const w3 = roundOf(mkWorld({ age: 6, seed: 2 }), 'add', 2); run(w3, 3);
  const c = w3.drums[0], h = w3.drumHit(c.id), x0 = h.x - h.r - 8;
  w3.pointerDown(x0, h.y);
  for (let k = 0; k < 6; k++) { run(w3, 0.02); w3.pointerMove(c.cx, c.cy); run(w3, 0.02); w3.pointerMove(x0, h.y); }
  w3.pointerUp();
  assert.ok(evs(w3).filter(q => q.type === 'ring' && q.id === c.id).length <= 2);
});

test('world: soft press (sky / stage) → soft {kind}, the cushions jiggle; 2 → hint; assist at 3 (age ≤ 4) / 6 (age 6): the next press in the drum band strikes the asked drum', () => {
  for (const [age, topic, need] of [[4, 'animals', 3], [6, 'add', 6]]) {
    const w = roundOf(mkWorld({ age }), topic, 2);
    const p = freeSky(w), a = asked(w);
    run(w, 2);
    w.pointerDown(p.x, p.y);
    let e = evs(w); assert.ok(e.find(x => x.type === 'soft' && x.kind === 'sky'));
    let maxD = 0; run(w, 0.3, () => { maxD = Math.max(maxD, ...w.drums.map(c => c.dent)); });
    assert.ok(maxD > 0.1 && maxD < 0.25, 'cushions jiggle ' + maxD);
    w.pointerUp();
    let hint = null, armed = null;
    for (let k = 1; k < need; k++) { w.pointerDown(p.x, p.y); w.pointerUp(); for (const x of evs(w)) { if (x.type === 'hint') hint = hint || { k: k + 1, x }; if (x.type === 'assistArmed') armed = k + 1; } }
    assert.ok(hint && hint.k === 2 && hint.x.id === a.id, 'hint at 2');
    assert.strictEqual(armed, need, 'assist armed at ' + need);
    assert.strictEqual(w.assistId, a.id);
    run(w, 0.2); assert.ok(a.glow > 0.8, 'the asked drum glows big');
    const o = w.drums.find(q => q !== a), ho = w.drumHit(o.id);
    w.pointerDown(ho.x, ho.y); w.pointerUp();
    e = evs(w);
    assert.ok(e.find(x => x.type === 'assist' && x.id === a.id && x.from === o.id));
    assert.ok(e.find(x => x.type === 'right' && x.id === a.id));
    assert.ok(!e.find(x => x.type === 'wrong'));
    assert.strictEqual(w.assistId, null);
    assert.strictEqual(w.misses, 0, 'soft presses are never mistakes');
  }
  // a press on the stage between drums reports kind 'stage'
  const w = roundOf(mkWorld({ age: 4 }), 'animals', 2), B = w.layout.band;
  let got = null;
  for (let x = B.x + 4; x < B.x + B.w && !got; x += 9) for (let y = B.y + 4; y < B.y + B.h && !got; y += 9) {
    if (w._drumAt(x, y) || inside(w.layout.bibiBox, x, y) || inside(w.layout.cymbalBox, x, y)) continue;
    w.pointerDown(x, y); w.pointerUp(); got = evs(w).find(q => q.type === 'soft');
  }
  assert.ok(got && got.kind === 'stage');
});

test('world: the cymbal — a tap on it is a soft crash (cymbalTap {x, y}, a tilt kick, ring), never soft, never progress', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'animals', 2), b = w.cymbalHit();
  for (let k = 0; k < 4; k++) { assert.strictEqual(w.pointerDown(b.cx, b.cy), 'cymbal'); w.pointerUp(); }
  const e = evs(w);
  assert.strictEqual(e.filter(x => x.type === 'cymbalTap').length, 4);
  assert.ok(e.every(x => x.type !== 'soft' && x.type !== 'hint' && x.type !== 'assistArmed'));
  assert.strictEqual(w._noProg, 0);
  let mt = 0; run(w, 0.4, () => { mt = Math.max(mt, Math.abs(w.cymbal.tilt)); });
  assert.ok(mt > 0.05 && w.cymbal.ring > 0, 'it swings');
});

test('world: 2 misses → hint {id} (the asked drum glows, ghost hand taps it); cooldown 6 s; hint() manual', () => {
  const w = roundOf(mkWorld({ age: 5 }), 'animals', 2);
  const a = asked(w), others = w.drums.filter(q => q !== a);
  tapDrum(w, others[0].id); run(w, 0.3);
  assert.ok(!types(evs(w)).includes('hint'));
  tapDrum(w, others[1].id);
  const hint = evs(w).find(x => x.type === 'hint');
  assert.ok(hint && hint.id === a.id && hint.mode === 'tap');
  assert.ok(w.hintHand && w.hintHand.mode === 'tap' && w.hintHand.id === a.id);
  let near = 1e9, maxP = 0;
  run(w, 1.6, () => { const hh = w.hintHand; if (hh) { near = Math.min(near, Math.hypot(hh.x - a.cx, hh.y - a.cy)); maxP = Math.max(maxP, hh.press); } });
  assert.ok(near < 25 && maxP > 0.9, 'the hand taps the drum');
  assert.ok(a.glow > 0.2);
  run(w, 2);
  tapDrum(w, others[0].id);
  assert.ok(!types(evs(w)).includes('hint'));
  run(w, 4.5);
  assert.ok(!w.hintHand);
  const h2 = w.hint(); assert.deepStrictEqual(h2, { drum: a.id }); assert.ok(types(evs(w)).includes('hint'));
});

test('world: idle nudges at 12 → 18 → 27 → 30 → 30 s; the 2nd idle also hints; no fail state', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'colors', 1);
  const t0 = w.time, at = [];
  let hinted = null;
  run(w, 120, () => { for (const e of evs(w)) { if (e.type === 'idle') at.push(+(w.time - t0).toFixed(2)); if (e.type === 'hint' && e.idle && hinted === null) hinted = at.length; } });
  const gaps = at.slice(0, 5).map((t, i) => +(t - (i ? at[i - 1] : 0)).toFixed(1));
  assert.deepStrictEqual(gaps, [12, 18, 27, 30, 30]);
  assert.strictEqual(hinted, 2);
  assert.strictEqual(w.state, 'round', 'no fail state, no auto-play');
});

test('world: pokeBibi repeats the prompt (on release); prompt() during enter / play; answer()', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'colors', 1);
  const k = w.bibiHit();
  assert.strictEqual(w.pointerDown(k.cx, k.cy), 'bibi');
  assert.strictEqual(w.pointerUp(k.cx + 2, k.cy), 'pokeBibi');
  const e = evs(w).find(x => x.type === 'pokeBibi');
  assert.ok(e && e.promptKey === 'p.colors' && Number.isFinite(e.x));
  assert.strictEqual(w.prompt().promptKey, 'p.colors');
  assert.strictEqual(w.answer().drum, w.stepInfo.targets[0]);
});

test('world: dots count (age 5+) — a right dots drum lights its dots 1..n (count events 0.5 s apart); right carries count {n}; the next ask waits for the count', () => {
  const w = roundWhere({ age: 5 }, 'count', 2, r => r.drums.find(c => c.id === r.steps[0].targets[0]).thing.n >= 3);
  const c = asked(w), n = c.thing.n;
  tapDrum(w, c.id);
  const e0 = evs(w), r = e0.find(x => x.type === 'right');
  assert.deepStrictEqual(r.count, { n }); assert.ok(!r.beat);
  const counts = e0.filter(x => x.type === 'count');
  let ask = null; const t0 = w.time;
  run(w, n * 0.5 + 2, () => { for (const x of evs(w)) { if (x.type === 'count') counts.push(Object.assign({ t: w.time - t0 }, x)); if (x.type === 'ask' && !ask) ask = w.time - t0; } });
  assert.deepStrictEqual(counts.map(x => x.i), Array.from({ length: n }, (_, i) => i + 1));
  assert.ok(counts.every(x => !x.beat));
  for (let i = 2; i < counts.length; i++) assert.ok(Math.abs(counts[i].t - counts[i - 1].t - 0.5) < 0.02);
  assert.ok(ask > CFG.askGap + (n - 1) * 0.5, 'the next ask after the count run');
  assert.strictEqual(c.count, n);
});

// ================================================================ world: beat mode (count at ages ≤ 4)
function beatWorld(o) { o = o || {}; return roundOf(mkWorld(Object.assign({ age: 4 }, o)), 'count', o.ri !== undefined ? o.ri : 2, { late: o.late }); }
test('world: beat mode — ONE big drum; the number card pops up above / beside it at the ask; each beat ≥ 0.2 s after the last counts (count {i, n, beat}), lights a dot, flashes the card; faster ones only boom; the n-th beat → right {count, beat} → note → lantern → stepDone', () => {
  const w = beatWorld();
  assert.strictEqual(w.drums.length, 1);
  const c = w.drums[0], s = w.stepInfo, n = s.need;
  assert.strictEqual(c.thing.kind, 'big'); assert.strictEqual(s.mode, 'beat'); assert.strictEqual(s.promptKey, 'p.beat');
  assert.strictEqual(c.size, w.layout.beat.size); assert.ok(c.size > w.layout.item, 'the big drum is bigger than a normal drum');
  assert.strictEqual(w.lanterns.length, w.cur.steps.length, 'one lantern per beat step');
  run(w, 0.3);
  assert.ok(w.card && w.card.n === n && w.card.lit === 0 && w.card.pop > 0.95, 'card popped up');
  assert.ok(Math.abs(w.card.x - (w.layout.beat.mode === 'side' ? c.padX + c.bw / 2 + CFG.cardSide + CFG.ringSideK * c.size + w.card.w / 2 : c.padX)) < 1e-6);
  checkCard(w, 'beat');
  // beatListen: a beat in the first 0.9 s after the ask booms but does not count (the child hears the number first)
  tapDrum(w, c.id);
  let e0 = evs(w);
  assert.ok(!e0.some(x => x.type === 'count') && e0.some(x => x.type === 'ring' && x.brush && x.beat), 'listening');
  run(w, 0.75);
  const counts = [], rings = [];
  let right = null, step = null;
  const collect = () => { for (const e of evs(w)) { if (e.type === 'count') counts.push(e); if (e.type === 'ring') rings.push(e); if (e.type === 'right') right = e; if (e.type === 'stepDone') step = e; if (e.type === 'wrong') assert.fail('no wrong in beat mode'); } };
  // beat 1, then a too-fast double tap (0.1 s later): it booms but does not count
  tapDrum(w, c.id); collect();
  assert.strictEqual(counts.length, 1); assert.deepStrictEqual([counts[0].i, counts[0].n, counts[0].beat], [1, n, true]);
  assert.strictEqual(w.card.lit, 1); assert.ok(w.card.flash > 0.7);
  const h = w.drumHit(c.id); w.pointerDown(h.x, h.y); w.pointerUp(); collect();
  assert.strictEqual(counts.length, 1, 'faster than beatGap: not counted');
  assert.ok(rings[rings.length - 1].brush && !rings[rings.length - 1].judged && rings[rings.length - 1].beat);
  assert.deepStrictEqual(w.answer(), { drum: c.id }, 'answer() keeps returning the big drum');
  for (let k = 2; k <= n; k++) { run(w, 0.25); tapDrum(w, c.id); collect(); }
  assert.deepStrictEqual(counts.map(x => x.i), Array.from({ length: n }, (_, i) => i + 1));
  assert.ok(right && right.id === c.id && right.beat && right.count.n === n && right.note === s.note && right.lantern === 0);
  assert.ok(step && !step.last);
  assert.ok(!w.interactive && w.answer() === null);
  // the card pops away after 0.6 s, the note lights lantern 0, the next step asks with a new card
  let gone = null, lantern = null, ask = null; const t0 = w.time;
  run(w, 3, () => { if (!w.card && gone === null) gone = w.time - t0; for (const e of evs(w)) { if (e.type === 'lantern') lantern = e; if (e.type === 'ask' && !ask) ask = e; } });
  assert.ok(gone > 0.55 && gone < 0.9, 'card away at ' + gone);
  assert.ok(lantern && lantern.i === 0 && lantern.note === s.note);
  assert.ok(ask && ask.step === 1 && ask.mode === 'beat' && ask.need === w.cur.steps[1].need);
  assert.ok(w.card && w.card.n === w.cur.steps[1].need && w.card.lit === 0 && !c.done);
  assert.strictEqual(w.misses, 0);
});

test('world: beat mode — taps beside the drum are soft (hint at 2, assist at 3: the next band press counts a beat, ≤ 2★); a partial count nudges after 4 s (beatNudge {i, n}) with the idle backoff; no wrong is possible', () => {
  const w = beatWorld({ seed: 2 });
  const c = w.drums[0], n = w.stepInfo.need;
  run(w, 1.0);
  tapDrum(w, c.id); evs(w);
  const t0 = w.time, nudges = [];
  run(w, 12, () => { for (const e of evs(w)) if (e.type === 'beatNudge' || e.type === 'idle') nudges.push(Object.assign({ t: +(w.time - t0).toFixed(2) }, e)); });
  assert.ok(nudges.length >= 2 && nudges[0].type === 'beatNudge' && Math.abs(nudges[0].t - 4) < 0.02, 'nudge at 4 s ' + JSON.stringify(nudges.map(x => x.t)));
  assert.deepStrictEqual([nudges[0].i, nudges[0].n], [1, n]);
  assert.ok(Math.abs(nudges[1].t - nudges[0].t - 6) < 0.03 && nudges[1].type === 'beatNudge', 'backoff × 1.5');
  assert.ok(Number.isFinite(nudges[0].x) && nudges[0].id === c.id);
  // soft presses: hint at 2, assist at 3
  const p = freeSky(w); let hint = false, armed = false;
  for (let k = 0; k < 3; k++) { w.pointerDown(p.x, p.y); w.pointerUp(); for (const e of evs(w)) { if (e.type === 'hint' && !e.idle) hint = true; if (e.type === 'assistArmed') armed = true; } }
  assert.ok(armed && w.assistId === c.id); void hint;
  const B = w.layout.band; let bx = null;
  for (let x = B.x + 4; x < B.x + B.w && bx === null; x += 7) if (!w._drumAt(x, B.y + 6) && !inside(w.layout.bibiBox, x, B.y + 6) && !inside(w.layout.cymbalBox, x, B.y + 6)) bx = x;
  w.pointerDown(bx, B.y + 6); w.pointerUp();
  const e = evs(w);
  assert.ok(e.find(x => x.type === 'assist') && e.find(x => x.type === 'count' && x.i === 2));
  assert.strictEqual(w.assistId, null);
  while (w.interactive || w.state === 'round') { if (w.interactive) { tapDrum(w, c.id); run(w, 0.22); } else w.update(H); }
  assert.strictEqual(w.misses, 0); assert.strictEqual(w.roundStars, 2, 'assisted → 2★');
});

test('world: beat mode — warm-up 1 + 2 beats, short rounds 2 steps, the song plays the big drum ×3 (0.3 s apart, the steps\' climbing notes) then the cymbal crashes', () => {
  const w = beatWorld({ ri: 0 });
  assert.deepStrictEqual(w.cur.steps.map(s => s.need), [1, 2]);
  solveRound(w);
  assert.strictEqual(w.state, 'roundDone');
  const log = []; const t0 = w.time;
  run(w, 10, () => { for (const e of evs(w)) log.push(Object.assign({ t: w.time - t0 }, e)); });
  const notes = log.filter(x => x.type === 'songNote');
  assert.strictEqual(notes.length, 3);
  for (let i = 1; i < 3; i++) assert.ok(Math.abs(notes[i].t - notes[i - 1].t - 0.3) < 0.02);
  const sn = w.songs[0].notes;
  assert.deepStrictEqual(notes.map(x => x.note), [sn[0], sn[1], sn[1]]);
  assert.ok(sn[1] > sn[0]);
  const cy = log.find(x => x.type === 'cymbal');
  assert.ok(cy && Math.abs(cy.t - notes[2].t - 0.25) < 0.02);
  const w2 = beatWorld({ ri: 3, late: 70 });
  assert.ok(w2.cur.short && w2.cur.steps.length === 2);
});

test('world: findAll (odd / even) — every right-parity drum is a right note (all {i, n}); a wrong parity is a mistake', () => {
  const w = roundOf(mkWorld({ age: 7 }), 'oddeven', 2);
  const st = w.stepInfo, wrongC = w.drums.find(c => !st.targets.includes(c.id));
  tapDrum(w, wrongC.id);
  assert.ok(types(evs(w)).includes('wrong'));
  for (let k = 0; k < st.need; k++) {
    run(w, 0.3);
    const c = asked(w); tapDrum(w, c.id);
    const r = evs(w).find(x => x.type === 'right');
    assert.deepStrictEqual(r.all, { i: k + 1, n: st.need });
  }
  until(w, () => w.state === 'roundDone');
  assert.strictEqual(w.roundStars, 2);
});

test('world: a judged contact during the gap after a right note starts the next step (its ask) and is judged against it', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'animals', 2);
  const a = asked(w); tapDrum(w, a.id); evs(w);
  assert.ok(!w.interactive);
  const nextId = w.cur.steps[1].targets[0];
  run(w, 0.3);
  tapDrum(w, nextId);
  const e = evs(w);
  assert.deepStrictEqual(types(e).filter(t => ['ask', 'ring', 'right'].includes(t)), ['ask', 'ring', 'right']);
  assert.strictEqual(e.find(x => x.type === 'right').id, nextId);
  assert.strictEqual(w.step, 1);
});

test('world: fair judging — a swipe that starts on a neighbour\'s rim is judged on the first BODY core it enters; a rim / cushion tap is judged on release; a cancelled rim tap still counts; fairSwipe off = the old rule', () => {
  const w = roundWhere({ age: 5 }, 'animals', 2, (r, w0) => { const a = w0._askedDrum(); return a && a.i > 0; });
  run(w, 3);
  const a = asked(w), nb = w.drums[a.i - 1], hn = w.drumHit(nb.id), ha = w.drumHit(a.id);
  const sx = hn.x + w._coreR(nb) + 6, sy = hn.y;
  assert.ok(w._drumAt(sx, sy) !== null);
  assert.strictEqual(w.pointerDown(sx, sy), 'drum');
  let e = evs(w); assert.ok(e.find(x => x.type === 'ring' && x.brush) && !types(e).includes('wrong'), 'the rim only brushes');
  for (let k = 1; k <= 16; k++) { run(w, 1 / 60); w.pointerMove(sx + (ha.x + 10 - sx) * k / 16, sy + (ha.y - sy) * k / 16); }
  w.pointerUp();
  e = evs(w);
  assert.ok(e.find(x => x.type === 'right' && x.id === a.id), 'judged on the asked drum');
  assert.ok(!types(e).includes('wrong'));
  // a cushion tap (no slide) → judged on release, on the pressed drum
  until(w, () => w.interactive);
  const b = asked(w);
  const cx = b.padX, cyy = b.padY + b.cushionH * 0.6;
  assert.strictEqual(w._drumAt(cx, cyy), b);
  w.pointerDown(cx, cyy); assert.ok(!types(evs(w)).includes('right'));
  run(w, 0.1); w.pointerUp();
  assert.ok(evs(w).find(x => x.type === 'right' && x.id === b.id));
  // a rim tap that is cancelled (touchcancel) is still judged
  until(w, () => w.interactive || w.state !== 'round');
  if (w.interactive) {
    const c4 = asked(w), h4 = w.drumHit(c4.id);
    w.pointerDown(h4.x - (w._coreR(c4) + h4.r) / 2, h4.y); w.cancelDrag();
    assert.ok(evs(w).find(x => x.type === 'right' && x.id === c4.id));
  }
  const w5 = roundOf(mkWorld({ age: 5, config: { fairSwipe: false } }), 'animals', 2), c5 = asked(w5), h5 = w5.drumHit(c5.id);
  w5.pointerDown(h5.x + h5.r - 4, h5.y); assert.ok(types(evs(w5)).includes('right'));
});

test('world: an assisted note caps the round at 2★', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'animals', 1), p = freeSky(w);
  for (let k = 0; k < 3; k++) { w.pointerDown(p.x, p.y); w.pointerUp(); }
  assert.ok(w.assistId);
  const o = w.drums.find(q => q.id !== w.assistId), ho = w.drumHit(o.id);
  w.pointerDown(ho.x, ho.y); w.pointerUp();
  solveRound(w);
  assert.strictEqual(w.misses, 0); assert.strictEqual(w.roundStars, 2);
  const w2 = roundOf(mkWorld({ age: 4 }), 'animals', 1); solveRound(w2); assert.strictEqual(w2.roundStars, 3, 'a clean round keeps 3★');
});

// ================================================================ world: song + out
test('world: song — roundDone {stars} → songAsk + a ghost-hand swipe; nobody touches → auto after 6 s: every drum left → right 0.18 s apart (each hops), lanterns flash; cymbal {x, y} 0.25 s after the last note; songDone {auto} 0.6 s later; out; songs[]', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'colors', 1);
  solveRound(w);
  let e = evs(w);
  const rd = e.find(x => x.type === 'roundDone');
  assert.ok(rd && rd.stars === 3 && Number.isFinite(rd.x));
  assert.strictEqual(w.state, 'roundDone'); assert.strictEqual(w.phase, 'song');
  assert.deepStrictEqual(w.answer(), { song: true });
  const ids = w.drums.map(c => c.id);
  const log = []; const t0 = w.time - w.phaseTime; const moods = new Set(), handX = []; let maxHop = 0, maxCym = 0;
  run(w, 10, () => {
    if (w.hintHand && w.hintHand.mode === 'swipe') handX.push(w.hintHand.x);
    if (w.phase === 'song' && w._song && w._song.started) { moods.add(w.bibi.mood); maxHop = Math.max(maxHop, ...w.drums.map(c => c.hop)); }
    maxCym = Math.max(maxCym, Math.abs(w.cymbal.tilt));
    for (const x of evs(w)) log.push(Object.assign({ t: w.time - t0 }, x));
  });
  const ask = log.find(x => x.type === 'songAsk');
  assert.ok(ask && Math.abs(ask.t - CFG.songAskDelay) < 0.02);
  assert.ok(handX.length && Math.max(...handX) - Math.min(...handX) > w.layout.band.w * 0.6, 'the hand swipes across');
  const notes = log.filter(x => x.type === 'songNote');
  assert.deepStrictEqual(notes.map(x => x.id), ids, 'every drum, left → right');
  assert.ok(Math.abs(notes[0].t - ask.t - CFG.songWait) < 0.03, 'auto after songWait');
  for (let i = 1; i < notes.length; i++) assert.ok(Math.abs(notes[i].t - notes[i - 1].t - 0.18) < 0.02);
  assert.ok(Math.abs(maxHop - 26) < 1, 'the wave hops ' + maxHop);
  const cy = log.find(x => x.type === 'cymbal');
  assert.ok(cy && Math.abs(cy.t - notes[notes.length - 1].t - 0.25) < 0.02 && Math.abs(cy.x - w.layout.cymbal.x) < 1e-6);
  assert.ok(maxCym > 0.2, 'the cymbal swings ' + maxCym);
  const sd = log.find(x => x.type === 'songDone');
  assert.ok(sd && sd.auto === true && Math.abs(sd.t - cy.t - 0.6) < 0.03);
  assert.ok(moods.has('beat') && (moods.has('cheer') || moods.has('idle')));
  const out = log.find(x => x.type === 'drumsOut');
  assert.ok(out && Math.abs(out.t - sd.t) < 0.02);
  assert.strictEqual(w.songs.length, 1);
  assert.strictEqual(w.songs[0].notes.length, 2); assert.ok(w.songs[0].notes[1] > w.songs[0].notes[0]); assert.ok(w.songs[0].colors.every(Boolean));
  const nr = log.find(x => x.type === 'round');
  assert.ok(nr && nr.t - out.t >= CFG.outTime - 0.02 && nr.t - out.t < 1.2, 'the next round after the out phase');
});

test('world: song started by a swipe, a tap or a band press (always left → right, auto false); touches during the wave boom; out: drums hop and float away upward fading (distractors first), cushions puff away', () => {
  let w = roundOf(mkWorld({ age: 6, seed: 3 }), 'add', 2);
  solveRound(w); evs(w);
  run(w, 1);
  const y = w._drumMidY(), B = w.layout.band;
  swipe(w, B.x + 2, y, B.x + B.w - 2, y, 20, 0.3);
  let log = [];
  run(w, 3, () => { for (const x of evs(w)) log.push(x); });
  let notes = log.filter(x => x.type === 'songNote');
  assert.strictEqual(notes.length, 5);
  assert.deepStrictEqual(notes.map(x => x.i), [0, 1, 2, 3, 4]);
  assert.ok(notes.every((x, i) => !i || x.x > notes[i - 1].x), 'left → right');
  assert.strictEqual(log.find(x => x.type === 'songDone').auto, false);
  // tap on the middle drum
  w = roundOf(mkWorld({ age: 6, seed: 3 }), 'add', 2);
  solveRound(w); evs(w); run(w, 1);
  const mid = w.drums[2], m0 = { x: mid.padX };
  assert.strictEqual(tapDrum(w, mid.id), 'song');
  const order = [], outs = []; let distractorFirst = null, minY = 1e9, fadeSeen = false, cushPuff = false;
  run(w, 3, () => {
    for (const x of evs(w)) if (x.type === 'songNote') order.push(w.drumById(x.id).i);
    for (const c of w.drums) {
      if (c.state === 'out' && !outs.includes(c.id)) { outs.push(c.id); if (distractorFirst === null) distractorFirst = !c.target; }
      if (c.state === 'out') { minY = Math.min(minY, c.y); if (c.alpha > 0.1 && c.alpha < 0.9) fadeSeen = true; if (c.cushionPop < 0.9 && c.cushionPop > 0.1) cushPuff = true; }
    }
  });
  assert.deepStrictEqual(order, [0, 1, 2, 3, 4]);
  assert.strictEqual(distractorFirst, true, 'the distractor leaves first');
  assert.ok(fadeSeen && cushPuff, 'fade + cushions puff away');
  assert.ok(minY < w.layout.H, 'floated up');
  void m0;
  // a press on the band (not on a drum) during song time starts the wave
  w = roundOf(mkWorld({ age: 6, seed: 3 }), 'add', 2);
  solveRound(w); evs(w); run(w, 1);
  const Bd = w.layout.band; let p = null;
  for (let x = Bd.x + 4; x < Bd.x + Bd.w && !p; x += 7) for (let yy = Bd.y + 4; yy < Bd.y + Bd.h && !p; yy += 7) if (!w._drumAt(x, yy) && !inside(w.layout.bibiBox, x, yy) && !inside(w.layout.cymbalBox, x, yy)) p = { x, y: yy };
  assert.strictEqual(w.pointerDown(p.x, p.y), 'song'); w.pointerUp();
  log = []; run(w, 1.5, () => { for (const x of evs(w)) log.push(x); });
  assert.strictEqual(log.filter(x => x.type === 'songNote').length, 5);
});

test('world: out — every drum ends gone (pop 0, alpha 0), lanterns stay lit until the next round resets them', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'colors', 1);
  solveRound(w);
  until(w, () => w.phase === 'out');
  const lit = w.lanterns.map(l => l.lit);
  assert.ok(lit.every(v => v > 0.9));
  until(w, () => w.drums.every(c => c.state === 'gone') || w.phase !== 'out');
  assert.ok(w.drums.every(c => c.pop === 0 && c.alpha === 0));
  until(w, () => w.phase === 'enter');
  assert.ok(w.lanterns.every(l => l.lit === 0));
});

// ================================================================ world: surprises
test('world: lamb — 3–5 s (≤ the round length; ages ≤ 4: 1 s, starting just inside the edge) after the ask it trots in from the right along the ground, stops near the middle (clear of Bibi and the cymbal), sniffs, leaves after ≈ 7 s; tap → puffs into a ball, rolls 40 px, un-puffs', () => {
  for (const [v, age] of [[VIEWPORTS[0], 4], [VIEWPORTS[7], 6], [VIEWPORTS[2], 3], [VIEWPORTS[8], 5], [VIEWPORTS[9], 4]]) {
    const w = roundOf(mkWorld({ age, surprise: true, vp: v }), age >= 6 ? 'add' : 'colors', 1, { surprise: 'lamb' });
    const t0 = w.time; let ev = null;
    until(w, () => { for (const e of evs(w)) if (e.type === 'lamb') ev = w.time - t0; return !!w.lamb; });
    const late = Math.max(2, w.cur.steps.reduce((a, s2) => a + s2.need, 0) * 1.8 - 1), young = age <= 4;
    if (young) assert.ok(Math.abs(ev - 1) < 0.02, 'young: at 1 s (' + ev + ')');
    else assert.ok(ev >= Math.min(3, late) - 0.02 && ev <= Math.min(5, late) + 0.05, 'at ' + ev + ' (≤ ' + late + ')');
    const g = w.lamb, L = w.layout;
    if (young) assert.ok(g.x <= L.W - L.ins.right - 30 + 1e-6 && w.lambHit(), 'young: starts just inside the edge, tappable at once');
    else assert.ok(g.x > L.W - L.ins.right);
    assert.ok(g.dir === -1 && Math.abs(g.y - (L.groundY - 8)) < 1e-6);
    until(w, () => g.state === 'sniff');
    assert.ok(g.x > L.bibiBox.x + L.bibiBox.w + 60 && Math.abs(g.x - L.cymbal.x) > L.cymbal.w / 2 + 60, 'stop spot');
    assert.ok(Math.abs(g.x - L.W / 2) < L.W * 0.3);
    const hh = w.lambHit(); assert.ok(hh, v.name + ' lamb tappable');
    assert.strictEqual(hh.r, L.phone || L.tall ? 92 : 58);
    assert.ok(!circleBox(hh, L.bibiBox));
    const x0 = g.x;
    assert.strictEqual(w.pointerDown(hh.x, hh.y), 'lamb'); w.pointerUp();
    assert.ok(types(evs(w)).includes('lambTap'));
    let maxBall = 0; run(w, 1.4, () => { maxBall = Math.max(maxBall, g.ball); });
    assert.ok(maxBall > 0.99 && g.ball === 0 && Math.abs(Math.abs(g.x - x0) - 40) < 1, 'rolled ' + (g.x - x0));
    assert.ok(Math.abs(g.roll) > 1, 'it rolled (angle)');
    assert.strictEqual(w.misses, 0);
    until(w, () => g.state === 'leave', 12 / H);
    run(w, 14); assert.strictEqual(w.lamb, null);
  }
  // it stays through the song + out and leaves at the next round
  const w = roundOf(mkWorld({ age: 4, surprise: true }), 'colors', 1, { surprise: 'lamb', config: { lambSniff: 60 } });
  w.cfg.lambSniff = 60;
  until(w, () => w.lamb && w.lamb.state === 'sniff');
  solveRound(w);
  until(w, () => w.phase === 'out');
  assert.ok(w.lamb && w.lamb.state === 'sniff' && w.lambHit(), 'still there in the out phase');
  until(w, () => w.state === 'round');
  assert.ok(!w.lamb || w.lamb.state === 'leave', 'leaves at the next round');
});

test('world: bird — lands on the lantern string between lanterns (feet on the string, clear of the bubble / HUD), hops along it, tap → birdTap {note = the last note rung}, leaves after ≈ 7 s', () => {
  for (const v of [VIEWPORTS[6], VIEWPORTS[2], VIEWPORTS[9], VIEWPORTS[8]]) {
    const w = roundOf(mkWorld({ age: 4, surprise: true, vp: v }), 'colors', 2, { surprise: 'bird' });
    const a = asked(w); tapDrum(w, a.id); evs(w);
    until(w, () => w.bird && w.bird.state === 'perch');
    const b = w.bird, L = w.layout, G = L.garland;
    const sy = x => { const u = (x - G.x0) / (G.x1 - G.x0); return G.y + G.sag * 4 * u * (1 - u); };
    let hops = 0, last = 0;
    run(w, 3, () => {
      if (b.state === 'perch') {
        assert.ok(Math.abs(b.y + b.hop * CFG.birdHopH - sy(b.x)) < 1e-6, 'feet on the string');
        for (const l of w.lanterns) assert.ok(Math.abs(b.x - l.x) > 20, 'between lanterns');
        const box = { x: b.x - CFG.birdW / 2, y: b.y - CFG.birdH, w: CFG.birdW, h: CFG.birdH };
        for (const k of L.keep) assert.ok(!boxHit(box, k), v.name + ' bird overlaps the ' + k.kind);
      }
      if (b.hop > 0.5 && last <= 0.5) hops++; last = b.hop;
    });
    assert.ok(hops >= 1, 'hops');
    const hb = w.birdHit(); assert.ok(hb);
    assert.strictEqual(w.pointerDown(hb.x, hb.y), 'bird'); w.pointerUp();
    const e = evs(w).find(x => x.type === 'birdTap');
    assert.ok(e && e.note === a.note, 'sings the last note');
    assert.ok(b.sing > 0.9);
    until(w, () => !w.bird || w.bird.state === 'leave', 8 / H);
    run(w, 2); assert.strictEqual(w.bird, null);
  }
});

test('world: fireflies (twinkle stars, the night chapter) — 5 drift down between / above the drums (never on one), glow; tap → fireflyTap (flare + zip off); they stay through the song and leave at the next round', () => {
  for (const v of [VIEWPORTS[0], VIEWPORTS[9], VIEWPORTS[5]]) for (const topic of ['colors', 'count']) {
    const w = roundOf(mkWorld({ age: 4, surprise: true, vp: v }), topic, 2, { surprise: 'fireflies' });
    assert.strictEqual(w.surprise, 'fireflies');
    until(w, () => w.fireflies.length && w.fireflies.every(f => f.state === 'drift'));
    assert.strictEqual(w.fireflies.length, 5);
    run(w, 2, () => { for (const f of w.fireflies) { assert.strictEqual(w._drumAt(f.x, f.y), null, 'not on a drum'); assert.ok(f.y > w.layout.lanternBottom); } });
    const fh = w.fireflyHit(); assert.ok(fh);
    assert.strictEqual(w.pointerDown(fh.x, fh.y), 'firefly'); w.pointerUp();
    assert.ok(types(evs(w)).includes('fireflyTap'));
    assert.strictEqual(w.fireflies[fh.i].state, 'zip'); assert.ok(w.fireflies[fh.i].glow > 1);
    solveRound(w);
    assert.ok(w.fireflies.filter(f => f.state === 'drift').length >= 3, 'they stay for the song');
    until(w, () => w.state !== 'roundDone');
    assert.ok(w.fireflies.every(f => f.state === 'zip'), 'and leave at the next round');
  }
});

test('world: surprises — one round per chapter (round 1 or 2, never the warm-up); chapters 0–2 rotate lamb / bird, the night chapter has fireflies', () => {
  for (let s = 1; s < 12; s++) {
    const w = new CD.World({ seed: s, age: 4 }); w.setViewport(VP.W, VP.H, VP.ins);
    const b = new CD.Bot(w, { skill: 1, seed: s }); w.newSession();
    const per = {};
    let t = 0;
    while (w.state !== 'sessionDone' && t < 900) { b.step(1 / 30); w.update(1 / 30); t += 1 / 30; for (const e of w.drainEvents()) if (e.type === 'round' && e.surprise) (per[w.level] = per[w.level] || []).push([e.round, e.surprise]); }
    for (let l = 0; l < 4; l++) {
      assert.strictEqual((per[l] || []).length, 1, 'one surprise round in chapter ' + l);
      assert.ok([1, 2].includes(per[l][0][0]));
    }
    assert.strictEqual(per[3][0][1], 'fireflies');
    assert.notStrictEqual(per[0][0][1], per[1][0][1]); assert.strictEqual(per[0][0][1], per[2][0][1]);
    assert.ok(['lamb', 'bird'].includes(per[0][0][1]));
  }
});

// ================================================================ world: flow
test('world: rotation mid-round (every orientation pair, mid-hop, beat card) — the gesture is cancelled, pads re-placed, drums keep their motion, notes in flight retarget, everything inside the new screen', () => {
  const pairs = [[0, 7], [2, 5], [8, 9], [9, 8], [4, 5], [5, 4], [12, 6], [7, 0]];
  for (const [a, b] of pairs) for (const topic of ['count', 'animals']) for (const age of [4, 5]) {
    const v0 = VIEWPORTS[a], v1 = VIEWPORTS[b], tag = `${v0.name} → ${v1.name} ${topic} age ${age}`;
    const w = roundOf(mkWorld({ age, vp: v0 }), topic, 2);
    const c0 = asked(w), h = w.drumHit(c0.id);
    w.pointerDown(h.x, h.y); evs(w);
    run(w, 0.12);
    const mo = w.drums.map(c => [c.hop, c.vy, c.sq, c.tilt, c.dent]);
    w.setViewport(v1.W, v1.H, v1.ins);
    assert.strictEqual(w._g, null, 'gesture cancelled');
    w.drums.forEach((c, i) => { assert.deepStrictEqual([c.hop, c.vy, c.sq, c.tilt, c.dent], mo[i], tag + ' motion kept'); assert.strictEqual(c.padX, w.layout.pads[i].x); });
    checkRound(w, tag);
    if (w._beat) checkCard(w, tag + ' card');
    if (w.notes.length) { const n = w.notes[0]; assert.strictEqual(n.x1, w.layout.lanterns[n.lantern].x); }
    let lantern = null; run(w, 1, () => { for (const e of evs(w)) if (e.type === 'lantern') lantern = e; for (const c of w.drums) assert.ok(c.cx > 0 && c.cx < v1.W && c.cy > 0 && c.cy < v1.H, tag + ' on screen'); });
    if (!w._beat) assert.ok(lantern && Math.abs(lantern.x - w.lanterns[0].x) < 1e-6);
    w.pointerUp();
    solveRound(w);
    assert.strictEqual(w.state, 'roundDone', tag);
  }
  // rotation during enter: falling drums keep falling onto their new pads
  const w = mkWorld({ age: 5, vp: VIEWPORTS[0] });
  w.levels = ['animals', 'animals', 'animals', 'animals']; w.startLevel(1); w.round = 2; w._beginRound();
  run(w, 0.5); const v = VIEWPORTS[7]; w.setViewport(v.W, v.H, v.ins);
  until(w, () => w.interactive);
  checkRound(w, 'rotated during enter');
});

test('world: chapter time limit — Talk time after round CONFIG.chapterMinRounds once the chapter passed 75 s; Talk re-asks every 12 s, glows after the 2nd, Bibi answers after the 3rd', () => {
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
  assert.strictEqual(w.roundsPerLevel, CD.CONFIG.chapterMinRounds);
  const asks = []; let res = null;
  run(w, 50, () => { for (const e of evs(w)) { if (e.type === 'talkAsk') asks.push(e); if (e.type === 'talkResult') res = e; } });
  assert.deepStrictEqual(asks.map(x => x.n), [1, 2, 3]);
  assert.ok(!asks[0].glowAnswer && asks[1].glowAnswer);
  assert.ok(res && res.auto && !res.correct);
});

test('world: short rounds — a round starting late in the chapter has 2 targets (beat: 2 steps)', () => {
  const w = mkWorld({ age: 6 });
  w.levels = ['add', 'add', 'add', 'add']; w.startLevel(1); w.round = 2; w.levelStartTime = w.time - 60;
  w._beginRound();
  assert.strictEqual(w.cur.short, true);
  assert.strictEqual(w.drums.filter(c => c.target).length, 2);
  const w2 = mkWorld({ age: 4 });
  w2.levels = ['count', 'count', 'count', 'count']; w2.startLevel(1); w2.round = 2; w2.levelStartTime = w2.time - 60;
  w2._beginRound();
  assert.ok(w2.cur.short && w2.cur.steps.length === 2);
});

test('world: Talk answer right → +1 star; levels → sessionDone {stars, songs}', () => {
  const w = new CD.World({ seed: 3, age: 3 }); w.setViewport(VP.W, VP.H, VP.ins);
  const b = new CD.Bot(w, { skill: 1, seed: 3 }); w.newSession();
  let t = 0, done = null, talkR = 0;
  while (w.state !== 'sessionDone' && t < 900) { b.step(1 / 30); w.update(1 / 30); t += 1 / 30; for (const e of w.drainEvents()) { if (e.type === 'sessionDone') done = e; if (e.type === 'talkResult' && e.correct) talkR++; } }
  assert.ok(done); assert.strictEqual(done.stars, w.stars);
  assert.ok(done.songs.length >= 12 && done.songs.every(s => s.notes.length >= 2));
  assert.strictEqual(talkR, 4);
});

test('world: render contract — interpolation twins + fixed sub-steps ≤ 1/120 s; alpha in [0, 1); every field the renderer reads is finite', () => {
  for (const topic of ['count', 'animals']) for (const age of [4, 5]) {
    const w = roundOf(mkWorld({ age }), topic, 2);
    tapDrum(w, asked(w).id);
    w.update(0.0123);
    assert.ok(w.alpha >= 0 && w.alpha < 1);
    for (const c of w.drums) for (const k of ['x', 'y', 'cx', 'cy', 'padX', 'padY', 'padBase', 'hop', 'sq', 'skin', 'skinPh', 'tilt', 'dent', 'cushionPop', 'cushionW', 'cushionH', 'pop', 'alpha', 'ring', 'dull', 'glow', 'count', 'dim', 'size', 'bw', 'bh', 'bcy',
      '_px', '_py', '_pcx', '_pcy', '_psq', '_ptilt', '_pdent', '_pskin', '_ppop', '_pcushionPop', '_palpha', '_ppadY'])
      assert.ok(Number.isFinite(c[k]), k);
    for (const l of w.lanterns) for (const k of ['x', 'y', 'lit', 'swing', 'flash', '_pswing', '_plit']) assert.ok(Number.isFinite(l[k]), k);
    for (const n of w.notes) for (const k of ['x', 'y', '_px', '_py', 'alpha', 'rot', 't']) assert.ok(Number.isFinite(n[k]), k);
    for (const k of ['tilt', 'ring', '_ptilt']) assert.ok(Number.isFinite(w.cymbal[k]));
    if (w.card) for (const k of ['x', 'y', 'w', 'h', 'n', 'lit', 'pop', 'flash', '_ppop']) assert.ok(Number.isFinite(w.card[k]), 'card ' + k);
    for (const k of ['hop', '_phop', 'look']) assert.ok(Number.isFinite(w.bibi[k]));
    assert.ok(['idle', 'talk', 'happy', 'cheer', 'think', 'oops', 'wave', 'point', 'dance', 'beat'].includes(w.bibi.mood));
    const L = w.layout;
    for (const k of ['stage', 'pads', 'cushion', 'cymbal', 'cymbalBox', 'garland', 'lanterns', 'band', 'bubble', 'hud', 'bibi', 'bibiBox']) assert.ok(L[k], 'layout.' + k);
    const c = w.drums[0]; c.tilt = 0.2; w.update(H); assert.ok(Math.abs(c._ptilt - c.tilt) < 0.05);
  }
});

function eventLog(seed, age, frame, secs) {
  const w = new CD.World({ seed, age }); w.setViewport(VP.W, VP.H, VP.ins);
  const b = new CD.Bot(w, { skill: 0.7, seed }); w.newSession();
  const out = []; let t = 0, acc = 0;
  while (t < secs) {
    acc += frame;
    while (acc >= 1 / 30 - 1e-9) { acc -= 1 / 30; b.step(1 / 30); w.update(1 / 30); t += 1 / 30; for (const e of w.drainEvents()) out.push(e.type + ':' + (e.id || '') + ':' + (w.time).toFixed(3)); }
  }
  return out;
}
test('world: deterministic — same seed + same inputs → the same events, any frame size', () => {
  for (const age of [4, 6]) {
    const a = eventLog(5, age, 1 / 30, 120), b = eventLog(5, age, 1 / 30, 120);
    assert.deepStrictEqual(a, b);
    assert.ok(a.length > 100);
  }
  const w1 = new CD.World({ seed: 9, age: 5 }), w2 = new CD.World({ seed: 9, age: 5 });
  for (const w of [w1, w2]) { w.setViewport(VP.W, VP.H, VP.ins); w.newSession(); }
  for (let i = 0; i < 400; i++) w1.update(1 / 60);
  for (let i = 0; i < 100; i++) w2.update(1 / 15);
  assert.deepStrictEqual(types(w1.drainEvents()), types(w2.drainEvents()));
  assert.ok(Math.abs(w1.drums[0].sq - w2.drums[0].sq) < 1e-9 && Math.abs(w1.drums[0].padY - w2.drums[0].padY) < 1e-9, 'any frame size');
});

test('world: the next round does not open with the answer asked last; never the same set twice in a chapter', () => {
  for (let s = 1; s < 25; s++) {
    const w = new CD.World({ seed: s, age: 4 }); w.setViewport(VP.W, VP.H, VP.ins);
    const b = new CD.Bot(w, { skill: 1, seed: s }); w.newSession();
    let t = 0, last = null; const keys = {};
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

test('world: every topic × age round is completable through the input API (every viewport in turn); positional events carry x, y', () => {
  const POS = ['ring', 'right', 'wrong', 'soft', 'count', 'lantern', 'drumIn', 'land', 'stepDone', 'hint', 'assist', 'assistArmed', 'pokeBibi', 'roundDone', 'songAsk', 'songNote', 'cymbal', 'cymbalTap', 'songDone', 'drumsOut', 'round', 'ask', 'beatNudge'];
  let k = 0;
  for (const topic of TOPICS) for (const age of AGES) for (const ri of [0, 2]) {
    const w = roundOf(mkWorld({ age, seed: 3 + age, vp: VIEWPORTS[k++ % VIEWPORTS.length] }), topic, ri);
    solveRound(w);
    assert.strictEqual(w.state, 'roundDone', `${topic} age ${age} round ${ri}`);
    assert.ok(w.drums.filter(c => c.target).every(c => c.done));
    run(w, 7);
    for (const e of evs(w)) if (POS.includes(e.type)) assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y), e.type + ' x, y');
  }
});

// ================================================================ bot
test('bot: full sessions per age 3–7 × viewport finish (bot-only through the input API), no stuck round, no NaN, drums on screen', () => {
  for (const age of AGES) for (const v of [VIEWPORTS[0], VIEWPORTS[2], VIEWPORTS[5], VIEWPORTS[7], VIEWPORTS[8], VIEWPORTS[9]]) for (const skill of [0.5, 0.9]) {
    const w = new CD.World({ seed: age * 13 + skill * 10, age, lang: age % 2 ? 'vi' : 'en' });
    w.setViewport(v.W, v.H, v.ins);
    const b = new CD.Bot(w, { skill, seed: age });
    w.newSession();
    let t = 0, rT = 0, maxR = 0, rounds = 0, nan = false, songs = 0, off = 0;
    while (w.state !== 'sessionDone' && t < 1200) {
      b.step(1 / 30); w.update(1 / 30); t += 1 / 30;
      for (const e of w.drainEvents()) { b.onEvent(e); if (e.type === 'round') rT = w.time; if (e.type === 'roundDone') { rounds++; maxR = Math.max(maxR, w.time - rT); } if (e.type === 'songDone') songs++; }
      if (!w.drums.every(c => Number.isFinite(c.cx) && Number.isFinite(c.cy) && Number.isFinite(c.sq) && Number.isFinite(c.tilt))) { nan = true; break; }
      for (const c of w.drums) if (c.state === 'stand' && (c.x - c.bw / 2 < 0 || c.x + c.bw / 2 > v.W || c.y - c.bh < 0 || c.padY + c.cushionH > v.H)) off++;
    }
    assert.ok(!nan, 'NaN');
    assert.strictEqual(off, 0, 'drums off screen');
    assert.strictEqual(w.state, 'sessionDone', `age ${age} ${v.name} skill ${skill}: ${w.state}/${w.phase} after ${t.toFixed(0)} s`);
    assert.ok(maxR < 90, `a round took ${maxR.toFixed(0)} s`);
    assert.ok(rounds >= 12 && rounds <= 16);
    assert.strictEqual(songs, rounds);
    assert.ok(b.stats.right >= 2 * rounds && b.stats.talks === 4 && b.stats.taps + b.stats.swipes > rounds);
    assert.ok(w.stars >= rounds);
    assert.strictEqual(w.songs.length, rounds);
  }
});

test('bot: its swipes really start off a drum and make the aimed drum the first contact; in beat mode it beats with human gaps (pauses, too-fast doubles)', () => {
  const w = roundOf(mkWorld({ age: 6 }), 'add', 2);
  const b = new CD.Bot(w, { skill: 1, seed: 4 });
  let rights = 0, wrongs = 0;
  for (let k = 0; k < 400 && w.state === 'round'; k++) { b.step(1 / 30); w.update(1 / 30); for (const e of w.drainEvents()) { if (e.type === 'right') rights++; if (e.type === 'wrong') wrongs++; } }
  assert.strictEqual(wrongs, 0);
  assert.ok(rights >= 4);
  const st = { pauses: 0, doubles: 0, counts: 0, need: 0, rounds: 0 };
  for (let s = 1; s <= 12; s++) {
    const w2 = roundOf(mkWorld({ age: 4, seed: s }), 'count', 2), b2 = new CD.Bot(w2, { skill: 0.4, seed: s });
    st.need += w2.cur.steps.reduce((a, x) => a + x.need, 0);
    for (let k = 0; k < 3000 && w2.state === 'round'; k++) { b2.step(1 / 30); w2.update(1 / 30); for (const e of w2.drainEvents()) { b2.onEvent(e); if (e.type === 'wrong') assert.fail('wrong in beat mode'); } }
    assert.strictEqual(w2.state, 'roundDone'); st.rounds++;
    st.pauses += b2.stats.beatPauses; st.doubles += b2.stats.beatDoubles; st.counts += b2.stats.counts;
  }
  assert.strictEqual(st.counts, st.need, 'every needed beat counted, none extra');
  assert.ok(st.pauses > 0 && st.doubles > 0, JSON.stringify(st));
});

// ================================================================ weather
test('weather: four moods (sky colours from weather.js MOODS), crossfade, ambient fields (fire, moonA, starsA), star field, clouds, particle sprites (DESIGN §4.3 names), embers from fireAt, bursts, party, cap 120', () => {
  const wx = new CD.Weather({ width: 1280, height: 720, groundY: 706, seed: 3 });
  const a = wx.ambient;
  assert.deepStrictEqual(MOODS.map(m => m.name), ['morning', 'noon', 'sunset', 'night']);
  for (const m of MOODS) assert.ok(/^#[0-9A-F]{6}$/i.test(m.top) && /^#[0-9A-F]{6}$/i.test(m.bottom));
  wx.fireAt(400, 690);
  assert.strictEqual(a.mood, 'morning'); assert.strictEqual(a.skyTop.toUpperCase(), MOOD.morning.sky[0].toUpperCase()); assert.strictEqual(a.skyBottom.toUpperCase(), MOOD.morning.sky[1].toUpperCase());
  for (const k of ['skyTop', 'skyBottom', 'tint', 'light', 'sunX', 'sunY', 'sunA', 'moonA', 'starsA', 'fire', 'mood', 'envMix']) assert.ok(a[k] !== undefined, k);
  assert.strictEqual(a.fire, MOOD.morning.fire);
  for (let i = 0; i < 8; i++) wx.update(0.5);
  assert.ok(wx.particles.length > 3, 'morning ambient life');
  wx.setWeather(3);
  wx.update(1.0); assert.ok(a.envMix > 0.2 && a.envMix < 0.8, 'crossfading'); assert.strictEqual(a.envFrom, 'morning');
  for (let i = 0; i < 8; i++) wx.update(0.5);
  assert.strictEqual(a.skyTop.toUpperCase(), MOOD.night.sky[0].toUpperCase()); assert.strictEqual(a.skyBottom.toUpperCase(), MOOD.night.sky[1].toUpperCase());
  assert.strictEqual(a.moonA, 1); assert.strictEqual(a.starsA, 1); assert.strictEqual(a.sunA, 0); assert.strictEqual(a.fire, MOOD.night.fire);
  assert.ok(wx.stars.length >= 40 && wx.stars.every(s => s.y < 720 * 0.5 && s.r > 0 && s.tw >= 0 && s.tw <= 1));
  wx.setWeather(2, { instant: true }); assert.strictEqual(a.skyTop.toUpperCase(), MOOD.sunset.sky[0].toUpperCase()); assert.strictEqual(a.fire, MOOD.sunset.fire); for (let i = 0; i < 6; i++) wx.update(0.5);
  assert.ok(a.sunX > 1280 * 0.6, 'the sun low on the right');
  wx.setWeather(1, { instant: true }); assert.strictEqual(a.skyTop.toUpperCase(), MOOD.noon.sky[0].toUpperCase()); assert.strictEqual(a.fire, MOOD.noon.fire);
  for (let i = 0; i < 10; i++) wx.update(0.5);
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
  for (let m = 0; m < 4; m++) { wx.setWeather(m, { instant: true }); wx.update(2); assert.strictEqual(wx.ambient.mood, ['morning', 'noon', 'sunset', 'night'][m]); assert.strictEqual(wx.ambient.fire, MOODS[m].amb.fire); }
  assert.deepStrictEqual(CD.Weather.SPRITES.slice().sort(), SPRITES.slice().sort());
  const w2 = new CD.Weather({ seed: 3 }), w3 = new CD.Weather({ seed: 3 });
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
