#!/usr/bin/env node
// Tumi's Flower Farm — headless unit tests for rng / trace / content / world / weather / bot.
// Run from the game folder:   node tests/unit/run.js [name part]      (exit 1 on any failure)
// (tests/unit/i18n_voice.test.js is the voice engineer's suite and runs on its own.)
'use strict';
const assert = require('assert');
const crypto = require('crypto');
const { load } = require('./load');

const FT = load();
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const H = 1 / 120;
const AGES = [3, 4, 5, 6, 7];
const LANGS = ['en', 'vi'];
const C = FT.Content;
const T = FT.Trace;
const CFG = FT.CONFIG;
const TOPICS = C.TOPICS;
const J = v => JSON.parse(JSON.stringify(v));   // objects from the vm sandbox have other prototypes
assert.deepStrictEqual = ((orig) => (a, b, m) => orig(J(a), J(b), m))(assert.deepStrictEqual);

// independent copies of the DESIGN tables (§3, §5.2, §5.3)
const AGE_TOPICS = { 3: ['colors', 'shapes', 'size', 'animals'], 4: ['colors', 'shapes', 'count', 'animals'],
  5: ['shapes', 'count', 'letters', 'animals'], 6: ['lower', 'initial', 'add', 'count'], 7: ['initial', 'add', 'sub', 'oddeven'] };
const CLASH = [['blue', 'purple'], ['red', 'green'], ['yellow', 'orange'], ['green', 'orange']];
const HEX = { red: '#E84A4A', blue: '#3C8DE8', yellow: '#FFD23F', green: '#4CC26B', orange: '#FF9A2E', purple: '#8E44AD', pink: '#FF8FC0' };
const HOME_OF = { dog: 'kennel', bee: 'hive', bird: 'nest', frog: 'pond', duck: 'pond', cow: 'barn', sheep: 'barn', rabbit: 'burrow', hen: 'coop', pig: 'sty' };
const ANIMALS = ['dog', 'bee', 'bird', 'frog', 'duck', 'cow', 'sheep', 'rabbit', 'hen', 'pig'];
const HOMES = ['kennel', 'hive', 'nest', 'pond', 'barn', 'burrow', 'coop', 'sty'];
const TOL = { 3: 66, 4: 58, 5: 50, 6: 46, 7: 42 };
const ICON_KINDS = ['blob', 'shape', 'animal', 'home', 'number', 'letter', 'dots', 'size'];
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
  const w = new FT.World({ seed: o.seed || 1, age: o.age || 4, lang: o.lang || 'en', config: cfg });
  const v = o.vp || VP;
  w.setViewport(v.W, v.H, v.ins);
  w.newSession(); w.drainEvents();
  return w;
}
/** Starts round `ri` of `topic` directly (skips the intro) and runs to the first ask. */
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
function tapAt(w, x, y) { const d = w.pointerDown(x, y); const u = w.pointerUp(x, y); return u || (d === 'press' || d === 'trace' ? null : d); }
function tapChoice(w, id) { const p = w.choiceHit(id); return tapAt(w, p.x, p.y); }
/** A finger along `pts` (logical px): press, moves (one sub-step every 3 moves ≈ 300–500 px/s), lift. → pointerUp result */
function traceAlong(w, pts, o) {
  o = o || {};
  let r = o.seed || 7;
  const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647 - 0.5; }, jit = o.jitter || 0;
  w.pointerDown(pts[0][0], pts[0][1]);
  let x = pts[0][0], y = pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    x = pts[i][0] + jit * 2 * rnd(); y = pts[i][1] + jit * 2 * rnd();
    w.pointerMove(x, y);
    if (i % 3 === 0) w.update(H);
    if (o.stopAt && i >= o.stopAt) break;
  }
  return w.pointerUp(x, y);
}
function traceAll(w, o) {
  let k = 0;
  while (w.interactive && w.stepInfo.mode === 'trace' && k++ < 20) { traceAlong(w, w.pathScreen(), o); run(w, 0.05); }
}
/** Plays the current step right and waits for the next ask / finish. */
function solveStep(w) {
  const a = w.answer(), s = w.step, r = w.round;
  if (a.choice) assert.strictEqual(tapChoice(w, a.choice), 'pick');
  else if (a.trace) traceAll(w);
  else if (a.chip) { let k = 0; while (w.interactive && k++ < 20) { const c = w.chipSpot(); assert.strictEqual(tapAt(w, c.x, c.y), 'chip'); run(w, 0.05); } }
  until(w, () => w.state !== 'round' || w.phase !== 'play' || (w.step !== s && w.interactive) || w.round !== r);
}
function playRound(w) { const r = w.round, l = w.level; while (w.state === 'round' && w.round === r && w.level === l) { if (w.interactive) solveStep(w); else w.update(H); } }
function rngFor(seed) { return new FT.RNG(seed); }
function finite(w) {
  const B = w.bag, items = [w.cookie, w.side, w.home].filter(Boolean);
  return [B.x, B.y, B.angle, B.squeeze, w.stars, w.trayGlow, w.flow].every(Number.isFinite) &&
    items.every(it => [it.x, it.y, it.size, it.rot, it.sx, it.sy].every(Number.isFinite)) &&
    w.choices.every(c => Number.isFinite(c.pop) && Number.isFinite(c.lift) && Number.isFinite(c.wob)) &&
    w.chips.every(c => Number.isFinite(c.x) && Number.isFinite(c.y)) && w.sprinkles.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)) &&
    w.rackCookies.every(r => Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.sy));
}
function hash(evs) {
  const h = crypto.createHash('sha1');
  for (const e of evs) h.update(JSON.stringify(e, (k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)));
  return h.digest('hex').slice(0, 12);
}
function overlap(a, b, pad) { pad = pad || 0; return a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad; }
function polyLen(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; }

// ======================================================================= rng
test('rng: deterministic, ranges, sample, fork', () => {
  const a = new FT.RNG(42), b = new FT.RNG(42);
  for (let i = 0; i < 100; i++) assert.strictEqual(a.next(), b.next());
  const r = new FT.RNG(7);
  for (let i = 0; i < 2000; i++) { const v = r.int(2, 5); assert.ok(v >= 2 && v <= 5); const f = r.float(1, 2); assert.ok(f >= 1 && f < 2); }
  const s = r.sample([1, 2, 3, 4, 5], 3); assert.strictEqual(new Set(s).size, 3);
  const f1 = new FT.RNG(9), f2 = new FT.RNG(9); f1.fork('x'); assert.strictEqual(f1.next(), f2.next());
});

// ======================================================================= trace
const ALL_SPECS = [];
for (const g of T.GLYPHS) ALL_SPECS.push({ kind: 'glyph', text: g, cx: 300, cy: 200, h: 252, maxW: 301 });
for (let n = 10; n <= 20; n++) ALL_SPECS.push({ kind: 'glyph', text: String(n), cx: 300, cy: 200, h: 210, maxW: 301 });
for (const s of T.SHAPES) { ALL_SPECS.push({ kind: 'shape', shape: s, cx: 300, cy: 200, size: 290 }); ALL_SPECS.push({ kind: 'shape', shape: s, cx: 300, cy: 200, size: 166 }); }
for (const s of T.STROKES) ALL_SPECS.push({ kind: 'stroke', id: s, cx: 300, cy: 200, w: 250, h: s === 'swirl' ? 200 : 110 });
for (const b of [0, 1, 2]) ALL_SPECS.push({ kind: 'road', from: { x: 175, y: 268 }, to: { x: 400, y: 270 }, bumps: b });

test('trace: every glyph 0–9 / A–Z / a–z, 10–20, shape, stroke and road exists, stays inside 600×400 (30 px margin), strokes ≥ 60 px', () => {
  assert.strictEqual(T.GLYPHS.length, 10 + 26 + 26);
  for (const c of '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz') assert.ok(T.hasGlyph(c), 'glyph ' + c);
  for (const spec of ALL_SPECS) {
    const p = T.path(spec), b = p.box, tag = JSON.stringify(spec);
    assert.ok(b.x0 >= 30 && b.y0 >= 30 && b.x1 <= 570 && b.y1 <= 370, tag + ' margin ' + [b.x0, b.y0, b.x1, b.y1].map(Math.round));
    for (const s of p.strokes) {
      assert.ok(s.len >= 60, tag + ' stroke ' + s.len.toFixed(0));
      for (let i = 1; i < s.pts.length; i++) { const d = Math.hypot(s.pts[i][0] - s.pts[i - 1][0], s.pts[i][1] - s.pts[i - 1][1]); assert.ok(d <= T.STEP + 1e-6, tag + ' resampled ≤ 4 px'); }
      assert.ok(Math.abs(polyLen(s.pts) - s.len) < 0.02 * s.len + 2, tag + ' len');
    }
    assert.ok(Math.abs(p.len - p.strokes.reduce((a, s) => a + s.len, 0)) < 1e-6);
  }
  // glyph heights ≈ 260 px, two-digit numbers side by side, each digit ≤ 0.48 of the width
  const g8 = T.path({ kind: 'glyph', text: '8', h: 260 }).box; assert.ok(Math.abs(g8.y1 - g8.y0 - 260) < 2);
  const g12 = T.path({ kind: 'glyph', text: '12', h: 210 }), d1 = g12.strokes[0].pts, d2 = g12.strokes[1].pts;
  assert.ok(Math.max(...d1.map(q => q[0])) < Math.min(...d2.map(q => q[0])), '1 left of 2');
  assert.ok(Math.max(...d2.map(q => q[0])) - Math.min(...d2.map(q => q[0])) <= 0.48 * (g12.box.x1 - g12.box.x0) * 1.6);
});

test('trace: a finger following the points completes every path at every age tolerance (also with a wobble of 0.45 tol)', () => {
  for (const spec of ALL_SPECS) for (const age of AGES) {
    const p = T.path(spec), tol = TOL[age], tag = JSON.stringify(spec) + ' tol ' + tol;
    assert.ok(T.follow(p, { tol }).complete, tag);
    assert.ok(T.follow(p, { tol, jitter: 0.45 * tol, seed: age }).complete, tag + ' jitter');
  }
});

test('trace: off the path never advances; forward only; tolerance edge; lift keeps progress; look-ahead window; strokes in order', () => {
  const p = T.path({ kind: 'stroke', id: 'line', cx: 300, cy: 200, w: 260 }), tol = 50;
  let st = T.start(); T.track(p, st, 170, 200, tol, 90); assert.strictEqual(st.done, 0); assert.ok(!st.off);
  T.lift(st); T.track(p, st, 250, 320, tol, 90); assert.strictEqual(st.done, 0, 'far below: nothing'); assert.ok(st.off, 'off');
  T.lift(st); T.track(p, st, 170, 200, tol, 90); T.track(p, st, 260, 200 + tol - 1, tol, 90); assert.ok(Math.abs(st.done - 90) < 1e-6, 'just inside tol advances ' + st.done);
  const d0 = st.done; T.lift(st); T.track(p, st, 300, 200 + tol + 5, tol, 90); assert.strictEqual(st.done, d0, 'just outside tol does not');
  T.lift(st); T.track(p, st, 180, 200, tol, 90); assert.strictEqual(st.done, d0, 'never goes back');
  T.lift(st); T.track(p, st, 420, 200, tol, 90); assert.strictEqual(st.done, d0, 'a press beyond the look-ahead does not jump');
  T.lift(st); T.track(p, st, 262, 200, tol, 90); T.track(p, st, 330, 200, tol, 90); assert.ok(Math.abs(st.done - 160) < 1e-6, 'lift + press near the head goes on');
  T.track(p, st, 410, 200, tol, 90); assert.ok(st.complete, 'completes at len − 0.6 tol'); assert.strictEqual(st.total, 1);
  // a fast swipe (one big move) is walked in sub-steps
  st = T.start(); T.track(p, st, 170, 200, tol, 90); T.track(p, st, 420, 200, tol, 90); assert.ok(st.complete, 'fast swipe');
  // two strokes: the 2nd starts only near its own start; the first stroke must be finished first
  const q = T.path({ kind: 'glyph', text: 'T', cx: 300, cy: 200, h: 260 }), s0 = q.strokes[0].pts, s1 = q.strokes[1].pts;
  st = T.start(); T.track(q, st, s1[0][0], s1[0][1], tol, 90); assert.strictEqual(st.stroke, 0); assert.strictEqual(st.done, 0, 'stroke 2 first: nothing');
  for (const pt of s0) T.track(q, st, pt[0], pt[1], tol, 90);
  assert.strictEqual(st.stroke, 1); assert.strictEqual(st.done, 0);
  T.lift(st); T.track(q, st, s1[s1.length - 1][0], s1[s1.length - 1][1], tol, 90); assert.strictEqual(st.done, 0, 'end of stroke 2 is not its start');
  for (const pt of s1) T.track(q, st, pt[0], pt[1], tol, 90);
  assert.ok(st.complete);
  // drawn + remaining = the whole path at any moment
  const w = T.path({ kind: 'shape', shape: 'star', size: 290 }); st = T.start();
  for (const pt of w.strokes[0].pts.slice(0, 80)) T.track(w, st, pt[0], pt[1], 50, 90);
  const dl = T.drawn(w, st)[0], rm = T.remaining(w, st)[0];
  assert.ok(Math.abs(polyLen(dl) + polyLen(rm) - w.len) < 1, 'drawn + remaining'); assert.ok(Math.abs(polyLen(dl) - st.done) < 1);
  // magic icing
  st = T.start(); T.advance(q, st, 50); assert.strictEqual(st.done, 50); T.advance(q, st, 1e4); assert.ok(st.complete);
});

test('trace: shape outlines are one closed stroke, start at the top (heart: the dip), run clockwise', () => {
  for (const s of T.SHAPES) {
    const p = T.path({ kind: 'shape', shape: s, cx: 300, cy: 200, size: 290 }), pts = p.strokes[0].pts;
    assert.strictEqual(p.strokes.length, 1); assert.ok(p.strokes[0].closed);
    assert.ok(Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-6, s + ' closed');
    let area = 0; for (let i = 1; i < pts.length; i++) area += pts[i - 1][0] * pts[i][1] - pts[i][0] * pts[i - 1][1];
    assert.ok(area > 0, s + ' clockwise on screen');
    if (s === 'heart') assert.ok(Math.abs(pts[0][0] - 300) < 2, 'heart starts at the dip');
    else { assert.ok(pts[0][1] <= p.box.y0 + 2, s + ' starts at the top'); if (s !== 'star' && s !== 'triangle' && s !== 'diamond') assert.ok(Math.abs(pts[0][0] - 300) < 3, s + ' top middle'); }
    const u = T.SHAPE_UNIT(s); assert.ok(u.every(q => Math.abs(q[0]) <= 0.5 + 1e-9 && Math.abs(q[1]) <= 0.5 + 1e-9), s + ' unit outline');
  }
});

// ======================================================================= content
test('content: every topic × age × lang × 4 rounds × 12 seeds is valid (independent re-checks)', () => {
  let n = 0;
  for (const age of AGES) for (const lang of LANGS) for (const topic of TOPICS) for (let ri = 0; ri < 4; ri++) for (let seed = 1; seed <= 12; seed++) {
    const r = C.makeRound(topic, { age, lang, rng: rngFor(seed * 977 + ri * 31 + age), roundIndex: ri, prev: seed % 3 ? ['red', 'line', 3] : null });
    n++;
    const tag = `${topic} age ${age} ${lang} r${ri} s${seed}`;
    assert.strictEqual(C.validate(r), null, tag);
    const cols = new Set();
    let tracedValue = null;
    r.steps.forEach((s, i) => {
      assert.ok(s.promptKey && s.params, tag + ' prompt');
      if (s.mode === 'pickBag' || s.mode === 'pickCookie') {
        const right = s.choices.filter(c => c.id === s.answer);
        assert.strictEqual(right.length, 1, tag + ' answer among the choices');
        assert.strictEqual(new Set(s.choices.map(c => c.id)).size, s.choices.length);
        if (topic !== 'oddeven') assert.strictEqual(s.choices.filter(c => String(c.nameValue) === String(s.nameValue)).length, 1, tag + ' one right choice');
        else assert.strictEqual(s.choices.filter(c => (+c.nameValue % 2 ? 'odd' : 'even') === s.params.parity).length, 1, tag + ' one of the parity');
        if (ri === 0) assert.strictEqual(s.choices.length, 2, tag + ' warm-up 2 choices');
        if (s.mode === 'pickBag') s.choices.forEach(c => cols.add(c.color));
        if (topic === 'animals') { const hs = s.choices.map(c => HOME_OF[c.nameValue]); assert.strictEqual(new Set(hs).size, hs.length, tag + ' distinct homes'); assert.strictEqual(r.board.home, HOME_OF[s.nameValue]); }
        if (topic === 'add') assert.strictEqual(s.params.a + s.params.b, +s.nameValue);
        if (topic === 'sub') { assert.strictEqual(s.params.a - s.params.b, +s.nameValue); assert.ok(s.params.a <= 10 && +s.nameValue >= 0); }
        if (topic === 'initial') { assert.strictEqual(C.initialOf(s.params.animal, lang), s.nameValue); assert.ok(r.board.cookie && r.board.cookie.animal === s.params.animal); }
        if (topic === 'lower') { assert.strictEqual(s.params.small, s.nameValue); assert.strictEqual(s.params.letter, s.nameValue.toUpperCase()); assert.ok(!/[il]/.test(s.nameValue)); }
        assert.strictEqual(r.steps[i + 1].mode, 'trace', tag + ' trace after a pick');
        tracedValue = s.mode === 'pickCookie' && s.choices[0].ck.kind === 'glyph' ? String(s.nameValue) : null;
      } else if (s.mode === 'trace') {
        cols.add(s.color);
        assert.ok(HEX[s.color], tag + ' icing colour');
        assert.strictEqual(C.pathCheck(s.path, s.on), null, tag + ' path');
        const p = T.path(s.path);
        assert.ok(T.follow(p, { tol: TOL[age] }).complete, tag + ' follower at the age tolerance');
        if (s.on) p.strokes.forEach(st => st.pts.forEach(q => assert.ok(Math.hypot(q[0] - s.on.x, q[1] - s.on.y) <= s.on.r - 12, tag + ' icing on the cookie')));
        if (tracedValue) assert.strictEqual(String(s.path.text), tracedValue, tag + ' trace the picked glyph');
        if (i > 0 && r.steps[i - 1].mode === 'pickBag') assert.strictEqual(r.steps[i - 1].params.color, s.color, tag + ' icing = picked bag');
      } else if (s.mode === 'chips') {
        assert.strictEqual(s.need, +r.steps[i - 1].nameValue, tag + ' chips N = traced number');
      }
    });
    if (age < 5) { assert.ok(!cols.has('pink'), tag + ' no pink'); for (const [a, b] of CLASH) assert.ok(!(cols.has(a) && cols.has(b)), tag + ` clash ${a}+${b}`); }
    // per-topic shape of the round
    const modes = r.steps.map(s => s.mode).join(',');
    const wantModes = { colors: ri >= 2 && age < 5 ? 'pickBag,trace,pickBag,trace' : 'pickBag,trace',   // one large pair from age 5 (QA playtest)
      count: ri === 0 ? 'trace,chips' : 'pickCookie,trace,chips' }[topic] || 'pickCookie,trace';
    assert.strictEqual(modes, wantModes, tag + ' modes');
    if (topic === 'colors') {
      assert.strictEqual(r.steps[0].choices.length, ri === 0 ? 2 : age <= 3 ? 2 : age === 4 ? 3 : 4, tag + ' bags');
      if (ri === 0) assert.strictEqual(r.steps[1].nameValue, 'line', tag + ' warm-up line');
      r.steps.filter(s => s.mode === 'trace').forEach(s => { if (age <= 3) assert.ok(!['loop', 'swirl'].includes(s.nameValue)); if (age === 4) assert.ok(s.nameValue !== 'swirl'); });
    }
    if (topic === 'shapes') { assert.strictEqual(r.steps[0].choices.length, ri === 0 ? 2 : age <= 3 ? 2 : age === 4 ? 3 : 4); if (age <= 4) assert.ok(r.steps[0].choices.every(c => ['circle', 'square', 'triangle', 'star', 'heart'].includes(c.nameValue))); }
    if (topic === 'size') { assert.deepStrictEqual(r.steps[0].choices.map(c => c.nameValue).sort(), ['big', 'small']); if (ri === 0) assert.strictEqual(r.steps[0].nameValue, 'big'); }
    if (topic === 'count') {
      const N = r.steps[r.steps.length - 1].need;
      if (ri === 0) assert.ok(N >= 1 && N <= 2); else if (ri === 1) assert.ok(N >= 2 && N <= 3);
      else if (age <= 4) assert.ok(N >= 3 && N <= 5, tag + ' N'); else if (age === 5) assert.ok(N >= 4 && N <= 10, tag); else assert.ok(N >= 4 && N <= 12, tag);
      if (ri > 0) assert.strictEqual(r.steps[0].choices.length, 3);
    }
  }
  assert.ok(n >= 5000, n + ' rounds');
});

test('content: short rounds (a long chapter) — colours 1 pair, counting starts on the tray; still valid', () => {
  for (const age of AGES) for (const topic of TOPICS) for (let seed = 1; seed <= 6; seed++) {
    const r = C.makeRound(topic, { age, lang: 'vi', rng: rngFor(seed), roundIndex: 3, short: true });
    assert.strictEqual(C.validate(r), null);
    if (topic === 'colors') assert.strictEqual(r.steps.length, 2);
    if (topic === 'count') { assert.deepStrictEqual(r.steps.map(s => s.mode), ['trace', 'chips']); assert.ok(r.board.cookie.kind === 'glyph'); }
  }
});

test('content: variety — the asked shape / animal / letter / stroke never repeats back to back; deterministic by seed', () => {
  for (const age of AGES) for (const topic of ['shapes', 'animals', 'letters', 'lower', 'initial', 'colors']) for (let c = 0; c < 20; c++) {
    const rng = rngFor(c * 101 + age); let prev = null, prevKey = null;
    for (let ri = 0; ri < 4; ri++) {
      const r = C.makeRound(topic, { age, lang: c % 2 ? 'vi' : 'en', rng, roundIndex: ri, prev });
      const asked = topic === 'colors' ? r.steps[1].nameValue : r.steps[0].nameValue;
      if (prev && ri > 0) assert.ok(!prev.includes(asked) || (topic === 'colors' && ri === 1 && asked === 'line'), `${topic} ${age} c${c} r${ri} repeats ${asked}`);
      assert.notStrictEqual(r.key, prevKey);
      prev = r.answers; prevKey = r.key;
    }
  }
  for (const topic of TOPICS) {
    const a = C.makeRound(topic, { age: 5, lang: 'en', rng: rngFor(5), roundIndex: 2 }), b = C.makeRound(topic, { age: 5, lang: 'en', rng: rngFor(5), roundIndex: 2 });
    assert.deepStrictEqual(a, b, topic + ' deterministic');
  }
});

test('content: Talk time for every topic × age × lang (answer in the choices, icon things, one right answer)', () => {
  for (const age of AGES) for (const lang of LANGS) for (const topic of TOPICS) for (let s = 1; s <= 10; s++) {
    const t = C.makeTalk(topic, { age, lang, rng: rngFor(s * 7 + age) }), tag = `${topic} ${age} ${lang} ${s}`;
    assert.strictEqual(t.promptKey, 'talk.' + topic);
    assert.ok(t.choices.length >= 2 && t.choices.length <= 3, tag);
    assert.strictEqual(t.choices.filter(c => c.id === t.answer).length, 1, tag + ' answer');
    t.choices.forEach(c => assert.ok(ICON_KINDS.includes(c.thing.kind), tag + ' thing ' + c.thing.kind));
    assert.strictEqual(new Set(t.choices.map(c => JSON.stringify(c.thing))).size, t.choices.length, tag + ' distinct');
    if (topic === 'animals') { assert.strictEqual(t.choices.find(c => c.id === t.answer).value, HOME_OF[t.params.animal]); assert.strictEqual(t.show.kind, 'animal'); }
    if (topic === 'oddeven') assert.strictEqual(t.choices.filter(c => (c.value % 2 ? 'odd' : 'even') === t.params.parity).length, 1);
    if (topic === 'add') assert.strictEqual(t.choices.find(c => c.id === t.answer).value, t.params.a + t.params.b);
    if (topic === 'initial') assert.strictEqual(C.initialOf(t.params.animal, lang), t.choices.find(c => c.id === t.answer).value);
  }
});

test('content: topics — AGE_TOPICS first, then the left-out topic opens; 4 distinct pool topics in order', () => {
  for (const age of AGES) {
    assert.deepStrictEqual(C.topicsFor(age), AGE_TOPICS[age]);
    assert.deepStrictEqual(FT.AGE_TOPICS[age], AGE_TOPICS[age]);
    const pool = FT.AGE_POOLS[age], last = AGE_TOPICS[age], nx = C.topicsFor(age, rngFor(age), last);
    assert.strictEqual(new Set(nx).size, 4); nx.forEach(t => assert.ok(pool.includes(t)));
    assert.ok(nx.some(t => !last.includes(t)), 'the left-out topic is played');
    assert.deepStrictEqual(nx, nx.slice().sort((a, b) => pool.indexOf(a) - pool.indexOf(b)), 'pool (difficulty) order (QA P2-8)');
  }
  assert.deepStrictEqual(J(FT.HOME_OF), HOME_OF);
  assert.deepStrictEqual(J(FT.ANIMALS), ANIMALS); assert.deepStrictEqual(J(FT.HOMES), HOMES);
  assert.deepStrictEqual(Object.values(HOME_OF).filter((h, i, a) => a.indexOf(h) === i).sort(), HOMES.slice().sort(), 'every home is used');
  for (const l of LANGS) assert.deepStrictEqual(Object.keys(FT.ANIMAL_WORDS[l]).sort(), ANIMALS.slice().sort(), l + ' words');
  assert.ok(!/\b(cat|fish|bowl|basket)\b/.test(JSON.stringify([FT.ANIMALS, FT.HOMES, FT.HOME_OF, FT.ANIMAL_WORDS])), 'no cat / fish / bowl / basket');
  assert.deepStrictEqual(Object.keys(FT.PALETTE).reduce((o, k) => (o[k] = FT.PALETTE[k].base, o), {}), HEX);
});

// ======================================================================= layout
test('layout: every viewport × 0–5 choices × sack: 3:2 tray, nothing under HUD / bubble, Mochi + rack clear of tray + choices', () => {
  for (const v of VIEWPORTS) for (let n = 0; n <= 5; n++) for (const sack of [false, true]) {
    const L = FT.World.computeLayout(v.W, v.H, v.ins, {}, { n, sack }), ins = L.ins, tag = `${v.name} n${n}${sack ? ' sack' : ''}`, Tr = L.tray, F = L.frame;
    assert.ok(Math.abs(Tr.w / Tr.h - 1.5) < 1e-6, tag + ' 3:2');
    const outer = { x: Tr.x - F, y: Tr.y - F, w: Tr.w + 2 * F, h: Tr.h + 2 * F };
    assert.ok(outer.x >= ins.left + 4 && outer.x + outer.w <= v.W - ins.right - 4, tag + ' tray x inside');
    assert.ok(outer.y >= ins.top && outer.y + outer.h <= L.groundY, tag + ' tray y inside');
    assert.ok(!overlap(outer, L.bubble) && !overlap(outer, L.hud), tag + ' tray under the bubble / HUD');
    assert.ok(Tr.s >= (v.H > v.W ? 0.85 : 0.78), tag + ' tray scale ' + Tr.s.toFixed(2));
    const N = L.mochi, nb = { x: N.x - N.w / 2, y: N.y - N.h, w: N.w, h: N.h };
    if (N.up) assert.ok(N.y - outer.y <= 20 && N.y <= Tr.y, tag + ' Mochi stands on the rim');
    else assert.ok(!overlap(nb, outer), tag + ' Mochi over the tray');
    assert.ok(nb.x >= ins.left && nb.y + nb.h <= v.H - ins.bottom, tag + ' Mochi on screen');
    assert.ok(N.h >= 170, tag + ' Mochi height');
    const sl = L.choices.slots;
    assert.strictEqual(sl.length, n, tag + ' slots');
    for (let k = 1; k <= Math.max(1, n); k++) assert.strictEqual(L.choices.sets[k].length, k, tag + ' set ' + k);
    const boxes = [];
    for (let i = 0; i < sl.length; i++) {
      const s = sl[i], R = L.choices.hitR, box = { x: s.x - s.r, y: s.y - s.r, w: 2 * s.r, h: 2 * s.r };
      boxes.push(box);
      assert.strictEqual(s.r, L.choices.r); assert.ok(s.r === 58 || (s.r === 72 && v.H > v.W), tag + ' r 58 / 72 portrait');
      assert.strictEqual(L.choices.hitR, s.r + 18);
      if (n <= 4 || v.H < v.W) assert.ok(!overlap(box, nb), tag + ' choice under Mochi');
      if (L.choices.column) assert.ok(s.x - R > Tr.x + Tr.w && s.x - s.r >= outer.x + outer.w + 24 - 1e-6, tag + ' column choice clear of the tray');
      else assert.ok(s.y - s.r > outer.y + outer.h + CFG.trayPad - 1e-6 || s.y - R > Tr.y + Tr.h, tag + ' choice clear of the tray');
      assert.ok(!overlap(box, L.bubble) && !overlap(box, L.hud), tag + ' choice under the bubble / HUD');
      assert.ok(s.y - s.r >= ins.top && s.x + s.r <= v.W - ins.right - 8 && s.y + s.r <= v.H - ins.bottom, tag + ' choice inside the safe area');
      if (i) { const g = Math.hypot(s.x - sl[i - 1].x, s.y - sl[i - 1].y) - 2 * s.r; assert.ok(g >= (n <= 4 && !L.choices.column ? 24 : 12) - 1e-6, tag + ' gap ' + g); }   // a tight column may use 12 (QA visual P1-1)
    }
    if (n <= 4 && v.H < v.W) assert.ok(!sack || L.sack, tag + ' landscape always fits the sack');
    let sb = null;
    if (L.sack) {
      sb = { x: L.sack.x - L.sack.w / 2, y: L.sack.y - L.sack.h, w: L.sack.w, h: L.sack.h };
      assert.ok(sb.x >= ins.left && sb.x + sb.w <= v.W - ins.right, tag + ' sack on screen');
      assert.ok(!overlap(sb, nb) && !overlap(sb, outer), tag + ' sack clear');
      boxes.forEach(b => assert.ok(!overlap(sb, b), tag + ' sack over a choice'));
    }
    assert.ok(L.birdY > L.bubble.y + L.bubble.h + 20 && L.birdY < Tr.y + Tr.h / 2, tag + ' bird lane');
    // the cooling rack: 4 slots of ≥ 50 px, on screen, clear of everything (decoration only)
    const R = L.rack, rb = { x: R.x, y: R.y, w: R.w, h: R.h };
    assert.strictEqual(R.slots.length, 4, tag + ' 4 rack slots');
    assert.ok(R.size >= CFG.rackCookieMin && R.size <= CFG.rackCookie, tag + ' rack cookie ' + R.size);
    assert.ok(rb.x >= ins.left && rb.x + rb.w <= v.W - ins.right && rb.y >= ins.top && rb.y + rb.h <= v.H - ins.bottom, tag + ' rack on screen');
    assert.ok(!overlap(rb, outer), tag + ' rack over the tray');
    assert.ok(!overlap(rb, nb), tag + ' rack over Mochi');
    assert.ok(!overlap(rb, L.bubble) && !overlap(rb, L.hud), tag + ' rack under the bubble / HUD');
    boxes.forEach(b => assert.ok(!overlap(rb, b), tag + ' rack over a choice'));
    if (sb) assert.ok(!overlap(rb, sb), tag + ' rack over the sack');
    R.slots.forEach(q => assert.ok(q.x - R.size / 2 >= rb.x - 1e-6 && q.x + R.size / 2 <= rb.x + rb.w + 1e-6 && q.y - R.size / 2 >= rb.y - 1e-6 && q.y + R.size / 2 <= rb.y + rb.h + 1e-6, tag + ' slot in rack'));
  }
});

test('layout: phone landscape puts the choices in a column right of the tray (bigger tray); iPad 4:3 keeps the row', () => {
  for (const [W, H, ins, want] of [[1561, 720, null, 'column'], [1556, 720, { top: 0, right: 108, bottom: 38, left: 108 }, 'column'],
    [960, 720, null, 'row'], [720, 1556, null, 'row']]) {
    for (let n = 0; n <= 4; n++) for (const sack of [false, true]) {
      const L = FT.World.computeLayout(W, H, ins, {}, { n, sack }), tag = `${W}x${H} n${n}${sack ? ' sack' : ''}`;
      const row = FT.World.computeLayout(W, H, ins, { landColumn: false }, { n, sack });
      assert.ok(L.tray.s >= row.tray.s - 1e-9, tag + ' never smaller than the row');
      if (want === 'row') { assert.strictEqual(L.choices.column, false, tag); continue; }
      if (n <= 3 || !sack) assert.strictEqual(L.choices.column, true, tag + ' column');
      if (L.choices.column) { assert.ok(new Set(L.choices.slots.map(q => q.x)).size <= 1); assert.ok(L.mochi.x < L.tray.x); }
    }
  }
  const p = FT.World.computeLayout(1561, 720, null, {}, { n: 3, sack: true }), q = FT.World.computeLayout(1561, 720, null, { landColumn: false }, { n: 3, sack: true });
  assert.ok(p.tray.s / q.tray.s >= 1.25, 'iPhone landscape tray ' + q.tray.s.toFixed(3) + ' → ' + p.tray.s.toFixed(3));
});

// ======================================================================= world
test('world: full bot sessions finish for every age (4 viewports, EN + VI), no stuck rounds, no NaN; rack per chapter', () => {
  for (const age of AGES) for (const lang of LANGS) for (const v of ROTATE.slice(0, 4)) {
    const w = new FT.World({ seed: age * 13 + v.W, age, lang }), bot = new FT.Bot(w, { skill: 0.75, seed: age });
    w.setViewport(v.W, v.H, v.ins); w.newSession();
    let t = 0, lastSig = '', lastT = 0, rounds = 0, chapRounds = 0;
    while (w.state !== 'sessionDone' && t < 900) {
      bot.step(1 / 30); w.update(1 / 30); t += 1 / 30;
      for (const e of w.drainEvents()) {
        if (e.type === 'roundDone') { rounds++; chapRounds++; assert.ok(e.stars >= 1 && e.stars <= 3); }
        if (e.type === 'rack') assert.strictEqual(e.n, chapRounds + 1, 'rack fills one per round');
        if (e.type === 'level') { chapRounds = 0; assert.strictEqual(w.rackCookies.length, 0, 'fresh rack every chapter'); }
      }
      const sig = w.state + w.phase + w.step + w.level + w.round + (w.traceState ? w.traceState.total.toFixed(2) : '') + w.chips.length;
      if (sig !== lastSig) { lastSig = sig; lastT = t; }
      assert.ok(t - lastT < 60, `age ${age} ${lang} ${v.name} stuck in ${sig}`);
      assert.ok(finite(w), 'NaN');
      assert.ok(w.rackCookies.length <= 4);
    }
    assert.strictEqual(w.state, 'sessionDone', `age ${age} ${lang} ${v.name} did not finish (${w.state}/${w.phase})`);
    assert.ok(rounds >= 12 && rounds <= 16, rounds + ' rounds');
    assert.strictEqual(w.gallery.length, rounds);
  }
});

test('world: phases enter → play → finish → hop → clear; events in order; colours round with 2 pairs', () => {
  const w = mkWorld({ age: 4 });
  w.levels = ['colors', 'colors', 'colors', 'colors']; w.startLevel(0); w.round = 2; evs(w);
  w._beginRound();
  const seen = [], phases = [];
  let last = '';
  const watch = () => { for (const e of w.drainEvents()) seen.push(e); const ph = w.state + ':' + w.phase; if (ph !== last) { phases.push(ph); last = ph; } };
  for (let k = 0; k < 40000 && w.state === 'round'; k++) { if (w.interactive) solveStep(w); else w.update(H); watch(); }
  run(w, 0.2, watch);
  assert.deepStrictEqual(phases.filter((p, i) => phases.indexOf(p) === i), ['round:enter', 'round:play', 'round:finish', 'round:hop', 'roundDone:clear']);
  const tp = types(seen), at = t => tp.indexOf(t);
  ['round', 'enter', 'choicePop', 'ask', 'pick', 'stepDone', 'traceStart', 'traceProgress', 'traceDone', 'finish', 'hop', 'land', 'rack', 'roundDone'].forEach(t => assert.ok(at(t) >= 0, 'event ' + t));
  assert.ok(at('round') < at('ask') && at('ask') < at('pick') && at('pick') < at('traceStart') && at('traceDone') < at('finish') && at('finish') < at('hop') && at('hop') < at('rack') && at('rack') < at('roundDone'));
  const asks = seen.filter(e => e.type === 'ask');
  assert.deepStrictEqual(asks.map(a => a.mode), ['pickBag', 'trace', 'pickBag', 'trace']);
  assert.deepStrictEqual(asks.map(a => !!a.follow), [false, true, false, true]);
  assert.ok(asks[0].first && asks[1].promptKey === 'p.trace' && asks[1].params.what === 'stroke' && asks[1].x > 0, 'trace ask has the start point');
  assert.deepStrictEqual(seen.filter(e => e.type === 'traceProgress').map(e => e.total), [0.25, 0.5, 0.75, 0.25, 0.5, 0.75]);
  assert.strictEqual(seen.filter(e => e.type === 'hop').length, 2, 'hop in place + the big hop');
  assert.ok(seen.find(e => e.type === 'roundDone').stars === 3);
  assert.strictEqual(w.rackCookies.length, 1);
  const ck = w.rackCookies[0].ck;
  assert.strictEqual(ck.kind, 'round'); assert.strictEqual(ck.icing.length, 2, 'both icing strokes travel with the cookie');
  assert.ok(ck.icing.every(ic => ic.pts.every(q => Math.hypot(q[0], q[1]) <= 0.5) && /^#/.test(ic.hex) && ic.w > 0), 'icing normalised to the cookie');
  assert.ok(ck.sprinkles.length >= 10 && ck.sprinkles.every(p => Math.hypot(p.x, p.y) <= 0.5), 'sprinkles stuck on the cookie');
});

test('world: pick — needPick on the tray (no mistake), wrong (mistake + wobble), hint after 2, right → bag flies to Mochi → follow ask', () => {
  const w = roundOf(mkWorld({ age: 5 }), 'colors', 1), s = w.stepInfo, Tr = w.layout.tray;
  assert.strictEqual(s.mode, 'pickBag');
  assert.strictEqual(tapAt(w, Tr.x + Tr.w / 2, Tr.y + Tr.h / 2), 'needPick'); assert.strictEqual(w.misses, 0);
  let e = evs(w); assert.ok(e.find(x => x.type === 'needPick' && x.kind === 'bag'));
  const wrong = w.choices.find(c => c.id !== s.answer);
  assert.strictEqual(tapChoice(w, wrong.id), 'wrong'); assert.strictEqual(w.misses, 1);
  e = evs(w); const we = e.find(x => x.type === 'wrong');
  assert.deepStrictEqual(we.got, { nameKind: 'color', nameValue: wrong.color }); assert.deepStrictEqual(we.want, { nameKind: 'color', nameValue: s.params.color });
  assert.ok(e.find(x => x.type === 'hint' && x.target === 'choice' && x.id === s.answer), '2nd no-progress tap hints');
  let maxW = 0; run(w, 0.3, () => { maxW = Math.max(maxW, Math.abs(wrong.wob)); }); assert.ok(maxW > 4, 'wobble');
  assert.ok(w.choiceById(s.answer).glow > 0.5 && w.hintHand && w.hintHand.target === 'choice');
  assert.strictEqual(tapChoice(w, s.answer), 'pick');
  assert.strictEqual(w.bag.hex, HEX[s.params.color]); assert.strictEqual(w.bag.state, 'fly');
  let minY = 1e9; until(w, () => { minY = Math.min(minY, w.bag.y); return w.interactive; });
  assert.ok(minY < Math.min(w.layout.bag.y, w.layout.choices.y) - 10, 'the bag flies on an arc');
  e = evs(w); const ask = e.filter(x => x.type === 'ask').pop();
  assert.ok(ask.follow && ask.mode === 'trace' && ask.params.stroke === w.stepInfo.nameValue);
  assert.ok(Math.hypot(w.bag.x - w.layout.bag.x, w.bag.y - w.layout.bag.y) < 8, 'bag in Mochi\'s paw');
  assert.strictEqual(w.misses, 1);
  // shapes: the picked cookie flies onto the tray in an arc and lands with a squash
  const w2 = roundOf(mkWorld({ age: 4 }), 'shapes', 1), s2 = w2.stepInfo;
  tapChoice(w2, s2.answer);
  assert.ok(w2.cookie && w2.cookie.job, 'flying');
  let top = 1e9, minSy = 1, sz0 = w2.cookie.size;
  until(w2, () => { top = Math.min(top, w2.cookie.y); minSy = Math.min(minSy, w2.cookie.sy); return w2.interactive; });
  const land = w2.picToScreen(s2.land.x, s2.land.y);
  assert.ok(top < land.y - 40, 'arc'); assert.ok(minSy < 0.92, 'landing squash ' + minSy.toFixed(3));
  assert.ok(Math.abs(w2.cookie.size - s2.land.size * w2.layout.tray.s) < 1 && w2.cookie.size > sz0 * 2, 'grows onto the tray');
  assert.ok(types(evs(w2)).includes('land'));
});

test('world: trace by finger — icing flows only on the path, progress 25/50/75, offPath while off (rate-limited, no mistake), lift keeps progress', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'colors', 0);
  tapChoice(w, w.stepInfo.answer); until(w, () => w.interactive && w.stepInfo.mode === 'trace'); evs(w);
  const pts = w.pathScreen(), Tr = w.layout.tray;
  assert.ok(pts.length > 20);
  // press far from the start and hold: the bag follows, no icing, and no "follow the dots" until the finger was on the dots (P2-4)
  const fx = Tr.x + 30, fy = Tr.y + Tr.h - 30;
  assert.strictEqual(w.pointerDown(fx, fy), 'trace');
  run(w, 0.4); assert.ok(w.bag.state === 'trace' && Math.hypot(w.bag.x - fx, w.bag.y - fy) < 10, 'bag under the finger');
  assert.strictEqual(w.icing.length, 0); assert.ok(!w.flowing);
  run(w, 1.0); let e = evs(w); assert.strictEqual(e.filter(x => x.type === 'offPath').length, 0, 'never near the dots: no offPath while pressing');
  w.pointerMove(fx + 40, fy); w.pointerUp(fx + 40, fy);   // released after a slide without progress → offPath {slide} (P1-1)
  e = evs(w); assert.ok(e.find(x => x.type === 'offPath' && x.slide), 'slide without progress counts');
  run(w, 3.2);
  // on the dots, then away: offPath after 0.6 s (once per 3 s)
  w.pointerDown(pts[0][0], pts[0][1]); w.pointerMove(pts[0][0], pts[0][1] + 200); evs(w);
  run(w, 0.8); e = evs(w); assert.strictEqual(e.filter(x => x.type === 'offPath').length, 1);
  run(w, 2.0); assert.strictEqual(evs(w).filter(x => x.type === 'offPath').length, 0, 'rate-limited');
  run(w, 1.0); assert.strictEqual(evs(w).filter(x => x.type === 'offPath').length, 1);
  w.pointerUp(pts[0][0], pts[0][1] + 200);
  assert.strictEqual(evs(w).filter(x => x.type === 'offPath').length, 0, 'no double offPath on release');
  assert.strictEqual(w.misses, 0, 'off the path is never a mistake');
  assert.strictEqual(w.traceState.total, 0);
  // trace half, lift, the icing stays
  const half = Math.floor(pts.length * 0.45);
  assert.strictEqual(traceAlong(w, pts, { stopAt: half }), 'tracePause');
  e = evs(w); assert.ok(e.find(x => x.type === 'traceStart')); assert.ok(e.find(x => x.type === 'tracePause'));
  assert.deepStrictEqual(e.filter(x => x.type === 'traceProgress').map(x => x.total), [0.25]);
  const t0 = w.traceState.total; assert.ok(t0 > 0.4 && t0 < 0.5, 'half ' + t0);
  assert.strictEqual(w.icing.length, 1); assert.strictEqual(w.icing[0].hex, HEX[w.stepInfo.color]);
  const iced = polyLen(w.icing[0].pts); assert.ok(Math.abs(iced - w.traceState.done) < 1, 'icing = traced length');
  run(w, 1.0); assert.strictEqual(w.traceState.total, t0, 'lift keeps progress'); assert.ok(w.bag.state === 'rest' || w.bag.state === 'fly', 'bag goes back to Mochi');
  // go on from the head
  const rest = w.pathScreen(); assert.ok(Math.hypot(rest[0][0] - pts[half][0], rest[0][1] - pts[half][1]) < 12);
  let flowSeen = false, sq = 0;
  w.pointerDown(rest[0][0], rest[0][1]);
  for (let i = 1; i < rest.length; i++) { w.pointerMove(rest[i][0], rest[i][1]); if (i % 3 === 0) { w.update(H); if (w.flowing) flowSeen = true; sq = Math.max(sq, w.bag.squeeze); } }
  assert.strictEqual(w.pointerUp(rest[rest.length - 1][0], rest[rest.length - 1][1]), 'traceDone');
  assert.ok(flowSeen && sq > 0.5, 'flowing + squeeze');
  e = evs(w); assert.deepStrictEqual(e.filter(x => x.type === 'traceProgress').map(x => x.total), [0.5, 0.75]);
  const td = e.find(x => x.type === 'traceDone'); assert.ok(td && td.what === 'stroke' && td.value === 'line' && td.color === w.stepInfo.color);
  // a short tap on the tray in a trace step → traceTap (where: tray)
  const w2 = roundOf(mkWorld({ age: 4 }), 'shapes', 1); tapChoice(w2, w2.stepInfo.answer); until(w2, () => w2.interactive); evs(w2);
  const c = w2.cookieScreen(); assert.strictEqual(tapAt(w2, c.x, c.y), 'traceTap');
  assert.ok(evs(w2).find(x => x.type === 'traceTap' && x.where === 'tray' && x.n === 1));
});

test('world: the bag follows the finger with a spring and swings like a pendulum (tilts against the motion)', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'shapes', 1); tapChoice(w, w.stepInfo.answer); until(w, () => w.interactive);
  const Tr = w.layout.tray, y = Tr.y + Tr.h / 2;
  w.pointerDown(Tr.x + 40, y); run(w, 2.0);
  const a0 = w.bag.angle; assert.ok(Math.abs(a0 - CFG.bagTraceAngle) < 0.05, 'rest tilt while tracing');
  let lag = 0, minA = 9, maxA = -9;
  for (let i = 0; i < 120; i++) { const x = Tr.x + 40 + i * 4; w.pointerMove(x, y); w.update(H); lag = Math.max(lag, x - w.bag.x); minA = Math.min(minA, w.bag.angle); }
  assert.ok(lag > 2 && lag < 40, 'spring lag ' + lag.toFixed(1));
  assert.ok(minA < a0 - 0.1, 'moving right tilts the bag back (pendulum) ' + minA.toFixed(2));
  run(w, 0.6, () => { maxA = Math.max(maxA, w.bag.angle); });
  assert.ok(maxA > a0 + 0.02, 'swings past the rest angle when the finger stops (overshoot)');
  w.pointerUp(Tr.x + 520, y);
});

test('world: a child who only taps — 2 traceTaps hint the path, 4 (age 4) / 6 (age 6) turn on magic icing; taps squeeze dollops → done, 3 stars', () => {
  for (const [age, n] of [[4, 4], [6, 6]]) {
    const w = roundOf(mkWorld({ age, seed: 5 }), age <= 4 ? 'shapes' : 'letters', 1); tapChoice(w, w.stepInfo.answer); until(w, () => w.interactive); evs(w);
    const c = w.cookieScreen();
    tapAt(w, c.x, c.y); tapAt(w, c.x + 10, c.y);
    let e = evs(w); assert.ok(e.find(x => x.type === 'hint' && x.target === 'path'), 'path hint');
    assert.ok(w.hintHand && w.hintHand.target === 'path');
    let moved = 0, x0 = w.hintHand.x, y0 = w.hintHand.y; run(w, 1.2, () => { moved = Math.max(moved, Math.hypot(w.hintHand ? w.hintHand.x - x0 : 0, w.hintHand ? w.hintHand.y - y0 : 0)); });
    assert.ok(moved > 60, 'the ghost hand slides along the path'); assert.ok(w.guideGlow > 0.5, 'dots glow');
    for (let k = 2; k < n; k++) tapAt(w, c.x, c.y);
    e = evs(w); assert.ok(e.find(x => x.type === 'assist' && x.target === 'path' && x.magic), 'magic icing after ' + n);
    const len = w.path.len, k0 = Math.ceil(len * (1 - w.traceState.total) / Math.max(CFG.magicDollop, CFG.magicDollopFrac * len));
    let k = 0; while (w.interactive && k++ < 200) { tapAt(w, k % 2 ? c.x : 5, k % 2 ? c.y : 5); w.update(H); }
    assert.ok(k <= k0 + 1, 'dollops ' + k + ' ≤ ' + k0 + ' (taps anywhere count)');
    assert.ok(k < 200 && !w.interactive && w.traceState.complete, 'dollops finish the trace');
    assert.ok(evs(w).find(x => x.type === 'traceDone' && x.magic));
    assert.strictEqual(w.misses, 0); playRound(w); assert.strictEqual(w.roundStars, 3, 'never counts against the stars');
  }
  // magic: finger movement anywhere on the tray advances the path by the moved distance
  const w = roundOf(mkWorld({ age: 3 }), 'size', 1); tapChoice(w, w.stepInfo.answer); until(w, () => w.interactive);
  w._magic = true; const Tr = w.layout.tray, t0 = w.traceState.done;
  w.pointerDown(Tr.x + 20, Tr.y + 20); for (let i = 1; i <= 25; i++) w.pointerMove(Tr.x + 20 + i * 4, Tr.y + 20);
  assert.ok(Math.abs(w.traceState.done - t0 - 100 / Tr.s * CFG.magicGain) < 1, 'advance = moved × gain');
});

/** QA visual P2-2: every carrot (r 26) on the soil of the bed, off the numeral sign, ≥ chipGap apart. */
function checkCarrots(w, s, tag) {
  const A = s.avoid, r = CFG.chipR, pad = r + CFG.chipSignPad;
  assert.ok(A && r >= 26, 'sign box + big carrots');
  for (let i = 0; i < w.chips.length; i++) {
    const a = w.chips[i], x = a.tx, y = a.ty;
    assert.ok(x >= r + CFG.chipEdge - 1e-6 && x <= 600 - r - CFG.chipEdge + 1e-6 && y >= CFG.chipTopK * r - 1e-6 && y <= 400 - r - CFG.chipEdge + 1e-6, (tag || '') + ' inside the bed ' + x + ',' + y);
    assert.ok(!(x > A.x0 - pad && x < A.x1 + pad && y > A.y0 - pad && y < A.y1 + pad), (tag || '') + ' on the soil, not on the sign ' + x + ',' + y);
    for (let j = 0; j < i; j++) assert.ok(Math.hypot(x - w.chips[j].tx, y - w.chips[j].ty) >= CFG.chipGap - 1e-6, (tag || '') + ' spacing');
  }
}

test('world: carrots — N taps pop N carrots UP out of the soil at the tapped spot (grow 0 → 1, counted when they break out), extra taps → already, ≥ chipGap apart, never on the sign', () => {
  for (const age of [4, 6]) {
    const w = roundOf(mkWorld({ age, seed: 3 }), 'count', 2);
    while (w.interactive && w.stepInfo.mode !== 'chips') solveStep(w);
    const s = w.stepInfo, N = s.need, c = w.cookieScreen(); evs(w);
    assert.strictEqual(s.mode, 'chips'); assert.ok(N >= 3);
    for (let i = 0; i < N; i++) { assert.strictEqual(tapAt(w, c.x, c.y), 'chip', 'chip ' + i); w.update(H); }
    assert.ok(!w.interactive, 'N reached');
    const last = w.chips[w.chips.length - 1];
    assert.ok(last.fly && last.grow === 0 && last.x === last.tx && last.y === last.ty, 'starts as a soil bump at its spot (no flight from the hand)');
    const g = [], ys = [], sq = []; run(w, 0.6, () => { g.push(last.grow); ys.push(last.y); sq.push(last.squash); });
    assert.ok(g.every((v, i) => i === 0 || v >= g[i - 1] - 1e-9), 'grow only rises');
    const t1 = g.findIndex(v => v >= 1), t0 = g.findIndex(v => v > 0);
    assert.ok(t0 > 0 && (t1 - t0) * H > CFG.chipGrowTime - 0.05 && (t1 - t0) * H < CFG.chipGrowTime + 0.05, 'grows over ≈ 0.35 s');
    assert.ok(Math.min(...ys) < last.ty - 5 && Math.abs(last.y - last.ty) < 1e-6, 'a short pop UP, back on its mound');
    assert.ok(Math.min(...sq) < -0.05 && Math.max(...sq) > 0.05, 'stretches out of the soil, a little squash on landing');
    assert.ok(w.chips.every(q => q.grow === 1 && !q.fly));
    run(w, 0.3);
    const e = evs(w), ch = e.filter(x => x.type === 'chip');
    assert.deepStrictEqual(ch.map(x => x.i), Array.from({ length: N }, (_, i) => i + 1)); assert.ok(ch.every(x => x.n === N));
    assert.ok(e.find(x => x.type === 'chipsDone' && x.n === N));
    checkCarrots(w, s);
    assert.strictEqual(w.misses, 0);
  }
  const w = roundOf(mkWorld({ age: 4 }), 'count', 0);
  while (w.interactive && w.stepInfo.mode !== 'chips') solveStep(w);
  const N = w.stepInfo.need, c = w.cookieScreen();
  for (let i = 0; i < N; i++) tapAt(w, c.x, c.y);
  assert.strictEqual(tapAt(w, c.x, c.y), null, 'step done: nothing'); assert.strictEqual(w.chips.length, N);
});

test('QA visual P2-2 carrots: a tap on the soil plants it right there, a tap on the sign beside it; 12 always fit; the rosette shows them; they stay in the soil until the clear', () => {
  // a tap on the soil left of the sign → exactly there
  const w = roundOf(mkWorld({ age: 6, seed: 3 }), 'count', 2);
  while (w.interactive && w.stepInfo.mode !== 'chips') solveStep(w);
  const s = w.stepInfo, at = w.picToScreen(70, 300);
  assert.strictEqual(tapAt(w, at.x, at.y), 'chip');
  assert.ok(Math.abs(w.chips[0].tx - 70) < 1e-6 && Math.abs(w.chips[0].ty - 300) < 1e-6, 'planted at the tapped soil spot');
  // a tap on the middle of the sign → the nearest free soil beside the sign
  const c = w.cookieScreen(); tapAt(w, c.x, c.y);
  const b = w.chips[1]; assert.ok(b.tx < s.avoid.x0 || b.tx > s.avoid.x1, 'beside the sign ' + b.tx);
  assert.ok(Math.abs(b.ty - 200) < 40, 'level with the tap');
  // a tap far outside (on the rim / the meadow just below the bed) is clamped into the bed
  const T = w.layout.tray; if (w.interactive) tapAt(w, T.x + 5, T.y + T.h + 10);
  checkCarrots(w, s, 'mixed taps');
  // chipSpot() / answer() point at free soil
  if (w.interactive) { const q = w.chipSpot(), p = w.screenToPic(q.x, q.y), A = s.avoid; assert.ok(p.x < A.x0 || p.x > A.x1, 'chipSpot on the soil'); assert.deepStrictEqual(w.answer().chip, q); }
  // 12 carrots always fit (age 7 max), whatever is tapped
  for (const seed of [1, 2, 3, 4, 5]) {
    const w2 = roundOf(mkWorld({ age: 7, seed }), 'count', 2);
    while (w2.interactive && w2.stepInfo.mode !== 'chips') solveStep(w2);
    w2.stepInfo.need = 12; w2.cur.steps[w2.step].need = 12;
    const cs = w2.cookieScreen();
    for (let i = 0; i < 12; i++) assert.strictEqual(seed % 2 ? tapAt(w2, cs.x, cs.y) : (() => { const q = w2.chipSpot(); return tapAt(w2, q.x, q.y); })(), 'chip', 'carrot ' + i + ' seed ' + seed);
    checkCarrots(w2, w2.stepInfo, '12 carrots');
  }
  // the rosette: carrots as a neat row on the sign (cookie units); the real carrots stay on the bed through the hop, then fade
  while (w.interactive) { const q = w.chipSpot(); tapAt(w, q.x, q.y); w.update(H); }
  const n = w.chips.length;
  until(w, () => w.phase === 'hop');
  assert.strictEqual(w.chips.length, n, 'carrots stay in the soil while the sign hops');
  const ck = w.cookie.ck; assert.strictEqual(ck.chips.length, n);
  ck.chips.forEach(q => assert.ok(Math.abs(q.x) <= 0.45 && Math.abs(q.y) <= 0.42 && q.r > 0 && q.r <= 0.08, 'rosette carrot on the sign'));
  until(w, () => w.state === 'roundDone'); run(w, 0.2); assert.ok(w.chips.every(q => q.alpha < 0.8), 'fade at the clear');
  until(w, () => w.state !== 'roundDone'); assert.strictEqual(w.chips.length, 0);
  // countN: ages 6–7 can ask 4 (QA playtest)
  const seen = new Set(); for (let sd = 1; sd < 400; sd++) seen.add(C.countN(new FT.RNG(sd), 6, 2));
  assert.ok(seen.has(4) && !seen.has(3) && seen.has(12), [...seen].sort((a, b) => a - b).join(','));
});

test('QA visual P2-3/5/6 + P3-13: petals in the row colours, the butterfly turns before the choice column, the hay bale fits in portrait, Tumi\'s tap box off the bed', () => {
  // petals: the row colours (+ white / pale pink accents), 16 of them
  const w = roundOf(mkWorld({ age: 4, seed: 5 }), 'shapes', 1);
  while (w.state === 'round' && w.phase === 'play') { if (w.interactive) solveStep(w); else w.update(H); }
  const rows = new Set(w.icing.map(ic => ic.hex));
  assert.strictEqual(w.sprinkles.length, CFG.sprinkleN); assert.ok(CFG.sprinkleN <= 18);
  assert.ok(w.sprinkles.every(p => rows.has(p.hex) || ['#FFFFFF', '#FFD3E2'].includes(p.hex)), 'petal colours');
  assert.ok(w.sprinkles.filter(p => rows.has(p.hex)).length >= 8, 'mostly the row colour');
  // the butterfly in a choice-column layout (iPhone landscape 852×393): turns back before the column, never over a choice
  for (const [W, Hh] of [[1561, 720], [1556, 720]]) {
    const wb = roundOf(mkWorld({ age: 4, seed: 2, vp: { W, H: Hh, ins: null }, surprise: true }), 'animals', 1, 'bird');
    const L = wb.layout; if (!L.choices.column) continue;
    assert.ok(L.birdMaxX != null);
    let turned = false, maxX = -1e9;
    run(wb, 30, () => {
      const f = wb.bird; if (!f) return;
      maxX = Math.max(maxX, f.x); if (f.dir < 0) turned = true;
      wb.choices.forEach(c => assert.ok(Math.hypot(f.x - c.x, f.y - c.y) >= L.choices.hitR + CFG.birdR + CFG.birdLaneClear - 1e-6, 'butterfly clear of choice ' + c.id));
    });
    assert.ok(turned && maxX <= L.birdMaxX + 1e-6, 'turned at ' + maxX.toFixed(0));
  }
  // portrait: the hay bale fits with 4–5 choices on phones and iPads (not over choices / Tumi / bed / HUD)
  for (const [W, Hh, ins] of [[720, 1556, null], [720, 1556, { top: 108, right: 0, bottom: 62, left: 0 }], [720, 960, null], [720, 1036, { top: 24, right: 0, bottom: 20, left: 0 }]]) for (const n of [2, 3, 4, 5]) {
    const L = FT.World.computeLayout(W, Hh, ins, {}, { n, sack: true }), tag = `${W}x${Hh} n${n}`;
    assert.ok(L.sack, tag + ' hay bale fits');
    const sb = { x: L.sack.x - L.sack.w / 2, y: L.sack.y - L.sack.h, w: L.sack.w, h: L.sack.h };
    L.choices.slots.forEach(q => { const dx = Math.max(sb.x - q.x, 0, q.x - sb.x - sb.w), dy = Math.max(sb.y - q.y, 0, q.y - sb.y - sb.h); assert.ok(Math.hypot(dx, dy) >= L.choices.hitR - 1e-6, tag + ' hay clear of the choice hit circles'); });
    const F = L.frame; assert.ok(sb.y >= L.tray.y + L.tray.h + F + (L.sack.above ? CFG.sackPeekRoom : 0) - 1e-6 || sb.x >= L.tray.x + L.tray.w + F, tag + ' hay clear of the bed (+ room for the chick)');
  }
  // Tumi's tap box never covers the bed
  for (const v of VIEWPORTS) {
    const wm = mkWorld({ age: 4, vp: v });
    const b = wm.mochiHit(), T = wm.layout.tray, F = wm.layout.frame;
    const ox = Math.max(0, Math.min(b.x + b.w / 2, T.x + T.w + F) - Math.max(b.x - b.w / 2, T.x - F)), oy = Math.max(0, Math.min(b.y + b.h / 2, T.y + T.h + F) - Math.max(b.y - b.h / 2, T.y - F));
    assert.strictEqual(ox * oy, 0, v.name + ' Tumi tap box over the bed');
    assert.ok(b.w >= 60 && b.h >= 100, v.name + ' still a big tap box');
  }
});

test('world: stars 3 / 2 / 1 by wrong picks only (offPath / traceTap / needPick never count)', () => {
  for (const [m, want] of [[0, 3], [1, 2], [2, 1], [3, 1]]) {
    const w = roundOf(mkWorld({ age: 5, seed: m + 2 }), 'letters', 1), s = w.stepInfo, wr = w.choices.filter(c => c.id !== s.answer);
    for (let k = 0; k < m; k++) tapChoice(w, wr[k % wr.length].id);
    const Tr = w.layout.tray; tapAt(w, Tr.x + 10, Tr.y + 10);
    tapChoice(w, s.answer); until(w, () => w.interactive);
    const c = w.cookieScreen(); tapAt(w, c.x, c.y);
    w.pointerDown(Tr.x + 5, Tr.y + 5); run(w, 1.0); w.pointerUp(Tr.x + 5, Tr.y + 5);
    playRound(w);
    assert.strictEqual(w.roundStars, want, m + ' misses');
  }
});

test('world: rotation / resize mid-trace, mid-flight and mid-hop keep progress and stay playable (6 viewports)', () => {
  for (let i = 0; i < ROTATE.length; i++) {
    const v = ROTATE[i], v2 = ROTATE[(i + 1) % ROTATE.length];
    const w = roundOf(mkWorld({ age: 5, vp: v, seed: i + 1 }), 'letters', 1);
    tapChoice(w, w.stepInfo.answer); w.update(H * 6);
    w.setViewport(v2.W, v2.H, v2.ins);   // mid-flight: the cookie lands at once
    assert.ok(!w.cookie.job, 'landed'); const L2 = w.picToScreen(w.stepInfo.land.x, w.stepInfo.land.y);
    assert.ok(Math.hypot(w.cookie.x - L2.x, w.cookie.y - L2.y) < 1);
    until(w, () => w.interactive);
    const pts = w.pathScreen();
    traceAlong(w, pts, { stopAt: Math.floor(pts.length * 0.6) });
    w.pointerDown(pts[Math.floor(pts.length * 0.6)][0], pts[Math.floor(pts.length * 0.6)][1]);
    const t0 = w.traceState.total, st0 = w.traceState.stroke;
    w.setViewport(v.W, v.H, v.ins);   // mid-press
    assert.strictEqual(w.traceState.total, t0, 'progress kept'); assert.strictEqual(w.traceState.stroke, st0);
    assert.strictEqual(w._press, null, 'press cancelled');
    assert.ok(w.icing.length >= 1 && w.icing.every(ic => ic.pts.every(q => q[0] >= 0 && q[0] <= 600)), 'icing in picture px');
    traceAll(w); assert.ok(w.traceState.complete, 'finishes after the rotation');
    until(w, () => w.phase === 'hop' && w._hop && w._hop.stage === 2 && w._hop.t > 0.1);
    w.setViewport(v2.W, v2.H, v2.ins);   // mid-hop: lands on the rack now
    assert.strictEqual(w.rackCookies.length, 1); const sl = w.layout.rack.slots[0];
    assert.ok(Math.abs(w.rackCookies[0].x - sl.x) < 1 && Math.abs(w.rackCookies[0].y - sl.y) < 1);
    until(w, () => w.state !== 'round');
    assert.ok(finite(w));
  }
});

test('world: hop — ballistic arcs with apex, squash on landing, one flip, lands on the next rack slot; the rack persists in the chapter', () => {
  const w = mkWorld({ age: 4, seed: 9 }); w.levels = ['shapes', 'shapes', 'colors', 'colors']; w.startLevel(0);
  const marks = [];
  for (let r = 0; r < 3; r++) {
    until(w, () => w.state === 'round' && w.interactive);
    while (w.state === 'round' && w.phase === 'play') { if (w.interactive) solveStep(w); else w.update(H); }
    until(w, () => w.phase === 'hop');
    const tr = [];
    while (w.state === 'round' && w.phase === 'hop') { if (w.cookie) tr.push({ x: w.cookie.x, y: w.cookie.y, sy: w.cookie.sy, rot: w.cookie.rot, size: w.cookie.size, st: w._hop && w._hop.stage }); w.update(H); }
    const sl = w.layout.rack.slots[r], y0 = tr[0].y;
    assert.ok(Math.min(...tr.map(p => p.y)) < Math.min(y0, sl.y) - 60, 'apex above both ends');
    assert.ok(Math.min(...tr.filter(p => p.st === 0).map(p => p.sy)) < 0.86, 'crouch');
    assert.ok(Math.max(...tr.map(p => Math.abs(p.rot))) > 6, 'one flip');
    assert.ok(tr.every(p => [p.x, p.y, p.sy, p.size].every(Number.isFinite)));
    assert.strictEqual(w.rackCookies.length, r + 1); const rc = w.rackCookies[r];
    assert.strictEqual(rc.slot, r); assert.ok(Math.abs(rc.x - sl.x) < 1e-6);
    marks.push(rc);
    until(w, () => w.state !== 'roundDone');
  }
  assert.strictEqual(w.rackCookies.length, 3, 'persists across the chapter');
  while (w.state !== 'intro') { if (w.state === 'talk' && !w.talkAnswered) w.talkAnswer(w.talk.answer); if (w.interactive) solveStep(w); else w.update(H); }
  assert.strictEqual(w.rackCookies.length, 0, 'cleared at the new chapter'); assert.strictEqual(w.gallery.length, 4);
});

test('world: animals — pick, pipe the road to the home, the animal waddles along it, home event, then onto the rack', () => {
  const w = roundOf(mkWorld({ age: 4, seed: 6 }), 'animals', 1);
  assert.ok(w.home && w.home.home === HOME_OF[w.stepInfo.nameValue]);
  solveStep(w);
  assert.strictEqual(w.stepInfo.mode, 'trace'); assert.strictEqual(w.stepInfo.promptKey, 'p.road');
  const road = w.path.strokes[0].pts; solveStep(w);
  until(w, () => w.walker);
  const tr = []; let homeAt = -1;
  while (w.state === 'round' && w.phase === 'hop') { if (w.walker) tr.push({ x: w.walker.x, y: w.walker.y, rot: w.walker.rot }); for (const e of w.drainEvents()) if (e.type === 'home') homeAt = tr.length; w.update(H); }
  assert.ok(homeAt > 20, 'home after walking');
  const near = p => Math.min(...road.map(q => Math.hypot(q[0] - p.x, q[1] - p.y)));
  assert.ok(tr.slice(Math.floor(homeAt * 0.2), Math.floor(homeAt * 0.9)).every(p => near(p) < 16), 'walks along the road (picture px)');
  assert.ok(Math.max(...tr.map(p => Math.abs(p.rot))) > 0.08, 'waddles');
  assert.ok(tr[homeAt - 1].x > tr[0].x + 150, 'moves to the home on the right');
  assert.strictEqual(w.rackCookies.length, 1); assert.strictEqual(w.rackCookies[0].ck.kind, 'animal');
});

test('world: initial — the animal steps aside, the picked letter cookie lands; the traced glyph is the initial', () => {
  const w = roundOf(mkWorld({ age: 6, seed: 4, lang: 'vi' }), 'initial', 1), s = w.stepInfo;
  assert.strictEqual(w.cookie.ck.kind, 'animal');
  tapChoice(w, s.answer); until(w, () => w.interactive);
  assert.ok(w.side && w.side.ck.kind === 'animal' && w.cookie.ck.kind === 'glyph' && w.cookie.ck.text === s.nameValue);
  assert.strictEqual(w.path.spec.text, s.nameValue);
  const sp = w.picToScreen(s.side.x, s.side.y); assert.ok(Math.hypot(w.side.x - sp.x, w.side.y - sp.y) < 1);
});

test('world: idle nudges 12 s → ×1.5 → … ≤ 30 s; the 2nd idle hints; a press resets; 8 s without trace progress hints the path', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'shapes', 1), at = [];
  run(w, 100, () => { for (const e of w.drainEvents()) if (e.type === 'idle') at.push([+w.stateTime.toFixed(1), e.n]); else if (e.type === 'hint' && e.idle) at.push(['hint']); });
  const t = at.filter(a => a.length === 2).map(a => a[0]);
  assert.ok(t.length >= 4); assert.ok(Math.abs(t[1] - t[0] - 18) < 0.1 && Math.abs(t[2] - t[1] - 27) < 0.1, t.join(','));
  assert.ok(at.findIndex(a => a[0] === 'hint') === 2, 'the 2nd idle hints');
  const w2 = roundOf(mkWorld({ age: 4 }), 'shapes', 1); tapChoice(w2, w2.stepInfo.answer); until(w2, () => w2.interactive); evs(w2);
  const Tr = w2.layout.tray; w2.pointerDown(Tr.x + 6, Tr.y + 6);   // pressing, but nowhere near the path
  run(w2, 8.2); const e = evs(w2);
  assert.ok(e.find(x => x.type === 'hint' && x.target === 'path'), '8 s without progress → path hint');
  assert.ok(!e.find(x => x.type === 'idle'), 'pressing is not idle');
});

test('world: surprises — one per chapter (never the warm-up), bird flutters + tap, mouse peeks + tap; no score change', () => {
  const w = mkWorld({ age: 4, surprise: true, seed: 3 });
  const seen = [];
  const bot = new FT.Bot(w, { skill: 1, seed: 3 });
  while (w.state !== 'sessionDone' && w.time < 900) { bot.step(1 / 30); w.update(1 / 30); for (const e of w.drainEvents()) if (e.type === 'round') seen.push([w.level, e.round, e.surprise]); }
  for (let l = 0; l < 4; l++) {
    const rs = seen.filter(s => s[0] === l), sp = rs.filter(s => s[2]);
    assert.strictEqual(sp.length, 1, 'one surprise in chapter ' + l); assert.ok(sp[0][1] >= 1, 'never the warm-up');
  }
  assert.ok(new Set(seen.filter(s => s[2]).map(s => s[2])).size === 2, 'bird and mouse rotate');
  const w2 = roundOf(mkWorld({ age: 4, surprise: true }), 'shapes', 1, 'bird');
  until(w2, () => w2.birdHit());
  const st = w2.stars, b = w2.birdHit(); let flaps = new Set(), y0 = w2.bird.y;
  run(w2, 0.4, () => flaps.add(w2.bird.flap > 0.5));
  assert.ok(flaps.size === 2, 'wing beats');
  const bh = w2.birdHit();
  if (bh && !w2._choiceAt(bh.x, bh.y) && !w2._onTray(bh.x, bh.y)) {
    assert.strictEqual(w2.pointerDown(bh.x, bh.y), 'bird'); w2.pointerUp(bh.x, bh.y);
    assert.ok(evs(w2).find(x => x.type === 'birdTap')); run(w2, 1.0); assert.ok(!w2.bird || w2.bird.y < y0 - 40, 'flies up and away');
  }
  assert.strictEqual(w2.stars, st); void b;
  const w3 = roundOf(mkWorld({ age: 4, surprise: true, vp: VIEWPORTS[0] }), 'shapes', 1, 'mouse');
  assert.ok(w3.sack); const mh = w3.mouseHit();
  assert.strictEqual(w3.pointerDown(mh.x, mh.y), 'mouse'); w3.pointerUp(mh.x, mh.y);
  run(w3, 0.4); assert.ok(w3.sack.mouse > 0.8 && w3.sack.happy); const me = evs(w3).find(x => x.type === 'mouseTap'); assert.ok(me && me.taps === 1);
  run(w3, CFG.mousePeekTime + 1.5); assert.ok(w3.sack.mouse < 0.3, 'hides again');
  // a choice under the bird wins
  const w4 = roundOf(mkWorld({ age: 4, surprise: true }), 'shapes', 1, 'bird'); const ch = w4.choices[0];
  w4.bird = { x: ch.x, y: ch.y, y0: ch.y, _px: ch.x, _py: ch.y, dir: 1, state: 'fly', t: 0, flap: 0, size: 120 };
  assert.strictEqual(w4.pointerDown(ch.x, ch.y), 'press');
});

test('world: chapter time limit — after ≥ 3 rounds and > 75 s → Talk; re-ask every 12 s, glow after 2, stop after 3, give up', () => {
  const w = mkWorld({ age: 3 });
  w.levels = ['colors', 'shapes', 'size', 'animals']; w.startLevel(0);
  w.levelStartTime = w.time - 200;
  let rounds = 0;
  while (w.state !== 'talk') { if (w.interactive) solveStep(w); else w.update(H); for (const e of w.drainEvents()) if (e.type === 'roundDone') rounds++; }
  assert.strictEqual(rounds, 3); assert.strictEqual(w.roundsPerLevel, 3);
  evs(w); const asks = [];
  run(w, 12 * 3 + 13, () => { for (const e of w.drainEvents()) { if (e.type === 'talkAsk') asks.push([e.n, e.glowAnswer]); if (e.type === 'talkResult') asks.push(['result', e.auto]); } });
  assert.deepStrictEqual(asks, [[1, false], [2, true], [3, true], ['result', true]]);
  assert.strictEqual(w.levelStars, 9, 'an auto answer gives no star');
  assert.strictEqual(w.rackCookies.length, 3, 'the rack stays during Talk time');
  until(w, () => w.state === 'intro'); assert.strictEqual(w.level, 1);
  const st = w.stars; until(w, () => w.state === 'round');
  const w2 = mkWorld({ age: 4 }); while (w2.state !== 'talk') { if (w2.interactive) solveStep(w2); else w2.update(H); }
  const s2 = w2.stars; assert.strictEqual(w2.talkAnswer(w2.talk.answer), true); assert.strictEqual(w2.stars, s2 + 1);
  assert.strictEqual(w2.talkAnswer(w2.talk.answer), false, 'only once'); void st;
});

test('world: determinism — same seed → same events; inputs replayed at 1/30, 1/60, 1/120 s frames → same events', () => {
  function play(dt, seed, log) {
    const w = new FT.World({ seed, age: 4 }); w.setViewport(1556, 720); const bot = log ? null : new FT.Bot(w, { skill: 0.7, seed: 2 });
    const rec = [], all = [];
    if (bot) for (const k of ['pointerDown', 'pointerMove', 'pointerUp', 'talkAnswer']) { const f = w[k].bind(w); w[k] = (...a) => { rec.push({ t: w.time, k, a }); return f(...a); }; }
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
  const w = roundOf(mkWorld({ age: 4 }), 'shapes', 1);
  tapChoice(w, w.stepInfo.answer);
  w.update(H * 1.5);
  assert.ok(w.alpha > 0.45 && w.alpha < 0.55);
  assert.ok(w.cookie._px !== w.cookie.x || w.cookie._py !== w.cookie.y, 'cookie twins');
  assert.ok(w.choices.every(c => c._ppop !== undefined && c._px !== undefined));
  const w2 = new FT.World({ seed: 3, age: 6 }), bot = new FT.Bot(w2, { skill: 0.9, seed: 1 });
  w2.setViewport(960, 720); w2.newSession();
  let n = 0; while (w2.state !== 'sessionDone' && n++ < 3000) { bot.step(1); w2.update(1); }
  assert.strictEqual(w2.state, 'sessionDone');
});

test('world: setAge / setLang apply at the next session; newSession rotates chapter topics; gallery of decorated cookies', () => {
  const w = new FT.World({ seed: 4, age: 3 }), bot = new FT.Bot(w, { skill: 1, seed: 4 });
  w.setViewport(960, 720); w.newSession();
  assert.deepStrictEqual(w.levels, AGE_TOPICS[3]);
  w.setAge(6); w.setLang('vi'); assert.strictEqual(w.age, 3);
  let n = 0, done = null; while (w.state !== 'sessionDone' && n++ < 40000) { bot.step(1 / 30); w.update(1 / 30); for (const e of w.drainEvents()) if (e.type === 'sessionDone') done = e; }
  assert.ok(done && done.cookies === w.gallery.length && done.gallery.length >= 12);
  assert.ok(done.gallery.every(g => g.ck && g.ck.kind && Array.isArray(g.ck.icing) && g.stars >= 1));
  w.newSession(); assert.strictEqual(w.age, 6); assert.strictEqual(w.lang, 'vi');
  const w3 = new FT.World({ seed: 4, age: 4 }); w3.setViewport(960, 720); w3.newSession(); const first = w3.levels.slice();
  w3.newSession({ lastTopics: first }); assert.notStrictEqual(w3.levels[0], first[0]);
});

test('world: hooks — answer() / choiceHit / pathScreen / chipSpot / mochiHit + pokeMochi repeats the prompt; hint() outside play → null', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'count', 1);
  let a = w.answer(); assert.ok(a.choice && w.choiceHit(a.choice).r === CFG.choiceR + CFG.choiceHitPad);
  const m = w.mochiHit(); assert.strictEqual(tapAt(w, m.x, m.y), 'pokeMochi');
  const pe = evs(w).find(x => x.type === 'pokeMochi'); assert.strictEqual(pe.promptKey, 'p.count');
  solveStep(w); a = w.answer(); assert.ok(a.trace);
  const ps = w.pathScreen(); assert.ok(Math.hypot(ps[0][0] - a.x, ps[0][1] - a.y) < 1, 'answer = the start of the path');
  assert.ok(w.pathScreenAll().length >= 1);
  solveStep(w); a = w.answer(); assert.ok(a.chip); const cs = w.chipSpot(); assert.ok(cs && Number.isFinite(cs.x));
  assert.deepStrictEqual(w.hint(), { target: 'chip', id: null });
  while (w.interactive) solveStep(w);
  assert.strictEqual(w.hint(), null);
});

// ======================================================================= QA fixes round (functional BUG-1, playtest P1/P2, visual P1/P2)
test('QA BUG-1 trace: tap-hopping along the dots, starting mid-path or tracing backwards never advances; the head must be touched', () => {
  const p = T.path({ kind: 'stroke', id: 'line', cx: 300, cy: 200, w: 260 }), tol = 50, at = u => [170 + 260 * u, 200];
  let st = T.start();
  for (const u of [0.35, 0.65, 0.97]) { T.lift(st); T.track(p, st, ...at(u), tol, 90); }
  assert.strictEqual(st.done, 0, 'tap-hops do nothing'); assert.ok(!st.complete);
  // backwards: from the end towards the start — nothing until the start; past it still nothing
  st = T.start(); for (let u = 1; u >= -0.1; u -= 0.01) T.track(p, st, ...at(u), tol, 90);
  assert.strictEqual(st.done, 0, 'backwards');
  // after a lift the press must land on the icing head (not 80 px ahead of it)
  st = T.start(); for (let u = 0; u <= 0.4; u += 0.01) T.track(p, st, ...at(u), tol, 90);
  const d0 = st.done; T.lift(st); T.track(p, st, 170 + d0 + 80, 200, tol, 90); T.track(p, st, 170 + d0 + 120, 200, tol, 90);
  assert.strictEqual(st.done, d0, 'landing ahead of the head'); T.lift(st); T.track(p, st, 170 + d0 + 5, 200, tol, 90); T.track(p, st, 170 + d0 + 60, 200, tol, 90);
  assert.ok(st.done > d0 + 50, 'landing on the head goes on');
  // a capital letter by taps: nothing
  const E = T.path({ kind: 'glyph', text: 'E', h: 252 }); st = T.start();
  for (const s2 of E.strokes) for (const f of [0.3, 0.6, 0.95]) { const q = s2.pts[Math.floor(f * (s2.pts.length - 1))]; T.lift(st); T.track(E, st, q[0], q[1], tol, 90); }
  assert.strictEqual(st.total, 0, 'letter by taps');
});

test('QA P2-5 trace: closed outlines (shapes, size circle) can be traced either way round; letters keep their direction', () => {
  for (const shape of T.SHAPES) {
    const p = T.path({ kind: 'shape', shape, cx: 300, cy: 200, size: 260 }), start = p.strokes[0].pts[0], rev = p.strokes[0].pts.slice().reverse();
    const st = T.start(); for (const q of rev) T.track(p, st, q[0], q[1], 50, 90);
    assert.ok(st.complete && st.rev, shape + ' backwards round completes');
    assert.ok(Math.hypot(p.strokes[0].pts[0][0] - start[0], p.strokes[0].pts[0][1] - start[1]) < 1e-6, 'same start');
    const q2 = T.path({ kind: 'shape', shape, cx: 300, cy: 200, size: 260 }), s2 = T.start();
    for (const q of q2.strokes[0].pts) T.track(q2, s2, q[0], q[1], 50, 90);
    assert.ok(s2.complete && !s2.rev, shape + ' forward');
  }
  const O = T.path({ kind: 'glyph', text: 'O', h: 252 }), st = T.start();
  for (const q of O.strokes[0].pts.slice().reverse()) T.track(O, st, q[0], q[1], 50, 90);
  assert.ok(!st.complete && st.total < 0.1, 'the letter O keeps its stroke direction');
});

test('QA BUG-1 world: quick taps along the dots are traceTaps (no icing, rolled back); reverse drags do nothing; traceStart on every press that starts', () => {
  const w = roundOf(mkWorld({ age: 6, vp: VIEWPORTS[1] }), 'colors', 0);   // age 6: magic icing only after 6 no-progress actions
  tapChoice(w, w.stepInfo.answer); until(w, () => w.interactive && w.stepInfo.mode === 'trace'); evs(w);
  const pts = w.pathScreen(), at = f => pts[Math.floor(f * (pts.length - 1))];
  for (const f of [0, 0.35, 0.65, 0.97]) { const q = at(f); w.pointerDown(q[0], q[1]); w.update(H * 8); assert.strictEqual(w.pointerUp(q[0] + 6, q[1]), 'traceTap'); }
  let e = evs(w); assert.strictEqual(e.filter(x => x.type === 'traceTap').length, 4); assert.ok(!e.find(x => x.type === 'traceDone'));
  assert.strictEqual(w.traceState.total, 0, 'a tap at the start that nudged the icing is rolled back'); assert.ok(w.icing.every(ic => !ic.pts.length));
  // reverse drag from the end
  const rev = pts.slice().reverse(); traceAlong(w, rev); e = evs(w);
  assert.ok(!w.magic); assert.strictEqual(w.traceState.total, 0, 'reverse drag'); assert.ok(!e.find(x => x.type === 'traceProgress'));
  // a press that starts off the dots and slides onto the start: traceStart when it gets there, then icing
  run(w, 3.2); evs(w);
  w.pointerDown(pts[0][0] - 150, pts[0][1] + 60); w.pointerMove(pts[0][0] - 70, pts[0][1] + 30);
  assert.ok(!evs(w).find(x => x.type === 'traceStart'));
  w.pointerMove(pts[0][0], pts[0][1]); e = evs(w); assert.strictEqual(e.filter(x => x.type === 'traceStart').length, 1, 'traceStart on reaching the start');
  for (let i = 1; i < pts.length / 2; i++) w.pointerMove(pts[i][0], pts[i][1]);
  assert.ok(w.traceState.total > 0.3); assert.strictEqual(w.pointerUp(pts[Math.floor(pts.length / 2)][0], pts[Math.floor(pts.length / 2)][1]), 'tracePause');
  const t0 = w.traceState.total, q = w.pathScreen()[0];
  w.pointerDown(q[0], q[1]); assert.strictEqual(evs(w).filter(x => x.type === 'traceStart' && x.resume).length, 1, 'resume press says traceStart');
  w.pointerUp(q[0], q[1]); assert.strictEqual(w.traceState.total, t0);
});

test('QA P1-1 world: steady slides beside the dots (no progress) count as offPath {slide} → hint → magic icing (age 4: 4th)', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'shapes', 1); tapChoice(w, w.stepInfo.answer); until(w, () => w.interactive); evs(w);
  const pts = w.pathScreen(), off = 2.2 * w.tol * w.layout.tray.s, seen = [];
  for (let k = 0; k < 4; k++) {
    const side = pts.slice(5, 40).map(q => [q[0] + off, q[1] + off]);   // slides beside the dots, < 0.6 s each
    traceAlong(w, side); run(w, 3.1); for (const e of evs(w)) seen.push(e);
  }
  assert.strictEqual(seen.filter(e => e.type === 'offPath' && e.slide).length >= 3, true, 'slides counted');
  assert.ok(seen.find(e => e.type === 'hint' && e.target === 'path'), 'hint'); assert.ok(seen.find(e => e.type === 'assist' && e.magic) && w.magic, 'magic icing');
  assert.strictEqual(w.misses, 0);
});

test('QA P1-2 world: in a trace step a press on the resting bag (or anywhere but Mochi) is a trace press; dragging the bag onto the dots ices', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'shapes', 1); tapChoice(w, w.stepInfo.answer); until(w, () => w.interactive); evs(w);
  const B = w.layout.bag, pts = w.pathScreen();
  assert.strictEqual(w.pointerDown(B.x, B.y - 20), 'trace', 'grabs the bag');
  const n = 30; for (let i = 1; i <= n; i++) { w.pointerMove(B.x + (pts[0][0] - B.x) * i / n, B.y - 20 + (pts[0][1] - B.y + 20) * i / n); w.update(H); }
  for (let i = 1; i < 60; i++) { w.pointerMove(pts[i][0], pts[i][1]); if (i % 3 === 0) w.update(H); }
  assert.ok(w.traceState.total > 0.05, 'icing after dragging the bag onto the start'); run(w, 0.3); assert.ok(Math.hypot(w.bag.x - pts[59][0], w.bag.y - pts[59][1]) < 10, 'the bag rides the finger');
  w.pointerUp(pts[59][0], pts[59][1]);
  const L = w.layout; assert.strictEqual(w.pointerDown(L.W - L.ins.right - 20, L.H / 2), 'trace', 'anywhere else too'); w.pointerUp(L.W - L.ins.right - 20, L.H / 2);
  const M = w.layout.mochi; run(w, 0.5); evs(w);
  assert.strictEqual(tapAt(w, M.x - 0.25 * M.w, M.y - 0.3 * M.h), 'pokeMochi', 'Mochi\'s body still repeats the prompt');
});

test('QA P1-3 world: dragging a choice onto the tray picks it (right → pick, wrong → wrong); other drags count toward the hint', () => {
  const w = roundOf(mkWorld({ age: 4, seed: 3 }), 'shapes', 1), s = w.stepInfo, Tr = w.layout.tray;
  const wr = w.choices.find(c => c.id !== s.answer), cx = Tr.x + Tr.w / 2, cy = Tr.y + Tr.h / 2;
  const drag = (c, x2, y2) => { w.pointerDown(c.x, c.y); for (let i = 1; i <= 10; i++) { w.pointerMove(c.x + (x2 - c.x) * i / 10, c.y + (y2 - c.y) * i / 10); w.update(H); } return w.pointerUp(x2, y2); };
  assert.strictEqual(drag(wr, cx, cy), 'wrong'); assert.strictEqual(w.misses, 1);
  const L = w.layout; assert.strictEqual(drag(w.choiceById(s.answer), L.W - L.ins.right - 10, L.H - 10), 'soft');
  assert.ok(evs(w).find(e => e.type === 'hint' && e.target === 'choice'), 'the soft drag counted toward the hint');
  assert.strictEqual(drag(w.choiceById(s.answer), cx, Tr.y - 60), 'pick', 'released just above the tray (pad 90)');
  until(w, () => w.interactive); assert.strictEqual(w.stepInfo.mode, 'trace');
});

test('QA P2-6/7/8 + P2-2: CONFIG tol / shortBudget / chapterTimeLimit; unpicked choices dim to 0.6 in trace + chips and come back for the next pick', () => {
  assert.deepStrictEqual(CFG.tol, { 3: 72, 4: 64, 5: 60, 6: 54, 7: 48 });   // QA playtest 2026-11-25 (smooth the 4 → 5 cliff)
  assert.deepStrictEqual(CFG.shortBudget.slice(1), [28, 30, 50]); assert.strictEqual(CFG.chapterTimeLimit, 68);
  const w = roundOf(mkWorld({ age: 4 }), 'colors', 2), s = w.stepInfo;
  tapChoice(w, s.answer); until(w, () => w.interactive); run(w, 1.5);
  w.choices.filter(c => !c.gone).forEach(c => assert.ok(Math.abs(c.dim - 0.6) < 0.02, 'dim ' + c.dim));
  traceAll(w); until(w, () => w.interactive && w.stepInfo.mode === 'pickBag'); run(w, 1.5);
  w.choices.forEach(c => assert.ok(c.dim < 0.02 && !c.gone, 'back for the next pick'));
  const w2 = roundOf(mkWorld({ age: 4 }), 'count', 2); solveStep(w2); solveStep(w2); assert.strictEqual(w2.stepInfo.mode, 'chips'); run(w2, 1.5);
  w2.choices.filter(c => !c.gone).forEach(c => assert.ok(c.dim > 0.55, 'dim while counting chips'));
});

test('QA visual P1-1 / P2-1 / P2-4 layout + content: column with notch insets + HUD keep box, iPad keep boxes; r 72 on tall phones; outlines inside the cookie', () => {
  const k = 720 / 393, W = Math.round(720 * 852 / 393), ins = { top: 0, right: 47 * k, bottom: 21 * k, left: 47 * k };
  for (let n = 2; n <= 4; n++) {
    const L = FT.World.computeLayout(W, 720, ins, {}, { n }, [{ x: W - ins.right - 457, y: 0, w: 457, h: 129 }]);
    assert.ok(L.choices.column && L.tray.s >= 1.14, 'iPhone notch landscape n' + n + ' s ' + L.tray.s.toFixed(3));
    const A = FT.World.computeLayout(1036, 720, { top: 18, bottom: 14, left: 0, right: 0 }, {}, { n }, [{ x: 18, y: 18, w: 488, h: 150 }, { x: 876, y: 0, w: 160, h: 110 }]);
    assert.ok(A.choices.column && A.tray.s >= 1.04, 'iPad Air landscape n' + n + ' s ' + A.tray.s.toFixed(3));
  }
  for (const [Wp, Hp] of [[720, 1556], [720, 1280], [720, 1600]]) { const L = FT.World.computeLayout(Wp, Hp, null, {}, { n: 4 }); assert.strictEqual(L.choices.r, 72); assert.strictEqual(L.choices.hitR, 90); }
  const base = FT.World.computeLayout(720, 960, null, {}, { n: 4 }), r58 = FT.World.computeLayout(720, 960, null, { choiceRPort: 0 }, { n: 4 });
  assert.ok(base.tray.s >= r58.tray.s * 0.97, 'r 72 never costs the tray');
  const body = 0.874 * C.PLACE.SHAPE_COOKIE;
  for (const sh of FT.SHAPES) {
    const f = C.SHAPE_FIT[sh], size = C.outlineSize(sh, C.PLACE.SHAPE_COOKIE), p = T.path({ kind: 'shape', shape: sh, cx: 0, cy: 0, size }), b = p.box;
    assert.ok(Math.max(b.x1 - b.x0, b.y1 - b.y0) <= f[0] * body - 2 * 16 + 2, sh + ' inset ≥ 16 px from the cookie edge');
  }
  const r = C.makeRound('shapes', { age: 4, rng: rngFor(4), roundIndex: 1 }); assert.strictEqual(r.steps[1].path.size, C.outlineSize(r.steps[1].nameValue, C.PLACE.SHAPE_COOKIE));
  let waves = 0; for (let sd = 1; sd < 200 && !waves; sd++) { const c = C.makeRound('colors', { age: 4, rng: rngFor(sd), roundIndex: 1 }); if (c.steps[1].nameValue === 'wave') { waves++; assert.ok(c.steps[1].path.h >= 150, 'wave h ' + c.steps[1].path.h); } }
  assert.ok(waves, 'a wave round');
});

// ======================================================================= weather
test('weather: outdoor seasons (sky gradient ambient), crossfade 2.5 s, seeds + pollen always, no windows / nothing outside, gusts, cap 120, petals + straw', () => {
  const wx = new FT.Weather({ width: 1556, height: 720, seed: 3, groundY: 702 });
  const SKY = { spring: ['#9FD3EC', '#E6F5F2', '#7FAE5E'], summer: ['#86C8EE', '#E2F4F6', '#78A957'], autumn: ['#E9C79A', '#F6E6CF', '#A39A55'], winter: ['#B9CFE3', '#EEF3F7', '#CFDDD8'] };
  const SPRITES = ['petal', 'leaf_a', 'leaf_b', 'snow', 'sparkle', 'star', 'seed', 'pollen', 'drop', 'straw', 'confetti_a', 'confetti_b', 'butterfly_s'];
  assert.deepStrictEqual(J(FT.Weather.SPRITES), SPRITES);
  ['spring', 'summer', 'autumn', 'winter'].forEach((m, i) => {
    wx.setWeather(i, { instant: true });
    const a = wx.ambient;
    assert.strictEqual(a.mood, m); assert.strictEqual(a.env, m);
    assert.deepStrictEqual([a.skyTop, a.skyBottom, a.floor], SKY[m], m + ' ambient');
    assert.strictEqual(a.wall, a.skyBottom, 'wall = skyBottom (legacy)');
    ['tint', 'light', 'lightBars', 'envFrom', 'envMix'].forEach(k => assert.ok(k in a, k));
    let maxG = 0, gusts = 0, prev = 0, xs = null;
    for (let k = 0; k < 60 * 30; k++) {
      wx.update(1 / 60); maxG = Math.max(maxG, wx.gust); if (wx.gust > 0.05 && prev <= 0.05) gusts++; prev = wx.gust;
      if (m === 'autumn' && wx.gust > 0.9 && !xs) xs = wx.particles.filter(p => p.kind === 'leaf').map(p => [p, p.x]);
    }
    assert.ok(wx.gust >= 0 && wx.gust <= 1 && a.gust === wx.gust);
    assert.ok(gusts >= 2 && gusts <= 5, m + ' a gust every 6–10 s (' + gusts + ' in 30 s)');
    if (m === 'autumn') assert.ok(maxG > 0.95, 'autumn gusts at full strength'); else assert.ok(maxG <= 0.31, m + ' soft breeze only');
    const kinds = new Set(wx.particles.map(p => p.kind));
    assert.ok(kinds.has('seed') && kinds.has('pollen'), m + ' dandelion seeds + pollen always');
    assert.ok(kinds.has({ spring: 'petal', summer: 'glint', autumn: 'leaf', winter: 'snow' }[m]), m + ' season particle');
    wx.particles.forEach(p => assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && p.alpha >= 0 && p.alpha <= 1.0001 && SPRITES.includes(p.sprite), m + ' ' + p.sprite));
    assert.ok(wx.particles.every(p => p.outside === false), m + ': nothing outside (no windows)');
    const fall = wx.particles.filter(p => p.kind === { spring: 'petal', autumn: 'leaf', winter: 'snow' }[m]);
    if (fall.length) {
      assert.ok(fall.some(p => p.x < 400) && fall.some(p => p.x > 1150), m + ' fallers spread over the whole width');
      assert.ok(fall.some(p => p.y > 560), m + ' they fall down to the meadow (not stopped at a counter)');
    }
  });
  // the autumn gust pushes the leaves sideways
  wx.setWeather(2, { instant: true });
  let pushed = 0, n = 0;
  for (let k = 0; k < 60 * 25 && !n; k++) {
    wx.update(1 / 60);
    if (wx.gust > 0.6) { const L = wx.particles.filter(p => p.kind === 'leaf'), x0 = L.map(p => p.x); wx.update(0.5); L.forEach((p, q) => { if (wx.particles.includes(p) && p.x - x0[q] > -500) { n++; if (p.x - x0[q] > 30 || p.x < x0[q] - 1000) pushed++; } }); }
  }
  assert.ok(n && pushed / n > 0.6, 'a gust blows the leaves sideways (' + pushed + '/' + n + ')');
  wx.setWeather(3, { instant: true }); wx.setWeather(1, { instant: true }); assert.strictEqual(wx.ambient.lightBars, 1);
  wx.setWeather(3); for (let k = 0; k < 75; k++) wx.update(1 / 60); assert.ok(wx.ambient.envMix > 0.3 && wx.ambient.envMix < 0.7 && wx.ambient.envFrom === 'summer');
  for (let k = 0; k < 90; k++) wx.update(1 / 60); assert.strictEqual(wx.ambient.skyTop, '#B9CFE3');
  for (let k = 0; k < 40; k++) { wx.addSplash(400, 300, 'blue', 12); wx.addPuff(500, 400, 8); }
  assert.ok(wx.particles.length <= 120);
  assert.ok(wx.particles.some(p => p.sprite === 'petal' && p.color === HEX.blue && p.layer === 'front'), 'addSplash → petals');
  assert.ok(wx.particles.some(p => p.sprite === 'straw'), 'addPuff → straw bits');
  for (let k = 0; k < 150; k++) wx.update(1 / 60);
  assert.ok(wx.particles.every(p => p.group >= 0), 'bursts are short-lived');
  const before = wx.particles.length;
  assert.doesNotThrow(() => wx.setWindows([{ x: 100, y: 50, w: 200, h: 200 }]), 'setWindows is a harmless no-op');
  assert.strictEqual(wx.particles.length, before); for (let k = 0; k < 400; k++) wx.update(1 / 60);
  assert.ok(wx.particles.filter(p => p.kind === 'snow').some(p => p.x > 400), 'no window clipping');
  for (const kind of ['confetti', 'sparkle', 'stars', 'petals', 'sprinkles', 'straw', 'flour', 'crumbs', 'drops']) { wx.burst(700, 300, { kind, n: 4 }); }
  assert.ok(wx.particles.every(p => SPRITES.includes(p.sprite)), 'burst sprites');
  wx.setParty(true, { instant: true }); wx.burst(700, 300, { kind: 'confetti', n: 30 }); for (let k = 0; k < 60; k++) wx.update(1 / 60);
  assert.ok(wx.particles.length <= 120 && wx.ambient.party === 1);
  wx.resize(720, 1556, 1500); assert.ok(wx.particles.every(p => p.x <= 760));
});

test('world: farm finish — road flag on the pebble path, rows bloom 0 → 1 over ≈ 0.7 s, 2–3 butterflies fly up and away, cleared at the clear', () => {
  // the animal road is a pebble path; the other rows are not
  const wa = roundOf(mkWorld({ age: 4, seed: 6 }), 'animals', 1);
  solveStep(wa); solveStep(wa);
  assert.ok(wa.icing.length && wa.icing.every(ic => ic.road === true), 'road icing has road = true');
  const w = roundOf(mkWorld({ age: 4, seed: 5 }), 'shapes', 1);
  while (w.state === 'round' && w.phase === 'play') { if (w.interactive) solveStep(w); else w.update(H); }
  assert.ok(w.icing.length && w.icing.every(ic => !ic.road), 'planted rows are not roads');
  assert.strictEqual(w.phase, 'finish');
  const n = w.butterflies.length; assert.ok(n >= 2 && n <= 3, n + ' butterflies');
  const B = w.butterflies.map(b => ({ b, x0: b.x, y0: b.y, tr: [] }));
  // they start on planted points (screen px)
  const pts = w.icing.flatMap(ic => ic.pts.map(q => w.picToScreen(q[0], q[1])));
  B.forEach(o => assert.ok(pts.some(q => Math.hypot(q.x - o.x0, q.y - o.y0) < 1), 'starts on a planted point'));
  const bl = [], fl = [];
  let t = 0;
  while (w.phase === 'finish') { bl.push([t, w.icing[0].bloom]); B.forEach(o => { if (w.butterflies.includes(o.b)) o.tr.push({ x: o.b.x, y: o.b.y, a: o.b.alpha, f: o.b.flap, px: o.b._px }); }); w.update(H); t += H; }
  assert.ok(bl[0][1] < 0.05 && bl.every((v, i) => i === 0 || v[1] >= bl[i - 1][1] - 1e-9), 'bloom rises');
  const full = bl.find(v => v[1] >= 1 - 1e-9); assert.ok(full && Math.abs(full[0] - CFG.bloomTime) < 0.05, 'bloom = 1 at ≈ 0.7 s');
  assert.ok(w.icing.every(ic => ic.bloom === 1));
  run(w, 0.75, () => B.forEach(o => { if (w.butterflies.includes(o.b)) o.tr.push({ x: o.b.x, y: o.b.y, a: o.b.alpha, f: o.b.flap, px: o.b._px }); }));
  for (const o of B) {
    const tr = o.tr.filter(p => p.a > 0);
    assert.ok(tr.length > 100, 'flies for a while');
    assert.ok(tr[tr.length - 1].y < o.y0 - 150 * w.layout.tray.s, 'up and away');
    assert.ok(Math.min(...tr.map(p => p.f)) < 0.1 && Math.max(...tr.map(p => p.f)) > 0.9, 'wings flap');
    assert.ok(tr.every(p => [p.x, p.y, p.a, p.px].every(Number.isFinite) && p.a <= 1));
    // sine wobble: the horizontal velocity changes sign or swings
    const vx = tr.slice(1).map((p, i) => p.x - tr[i].x); assert.ok(Math.max(...vx) - Math.min(...vx) > 0.2, 'wobbles');
  }
  assert.strictEqual(w.butterflies.length, 0, 'gone after ≈ 1.6 s');
  // determinism
  const again = roundOf(mkWorld({ age: 4, seed: 5 }), 'shapes', 1);
  while (again.state === 'round' && again.phase === 'play') { if (again.interactive) solveStep(again); else again.update(H); }
  assert.deepStrictEqual(again.butterflies.map(b => [b.x, b.y, b.hex]), B.map(o => [o.x0, o.y0, o.b.hex]));
  // cleared at the clear even if still flying
  const w3 = roundOf(mkWorld({ age: 4, seed: 5 }), 'shapes', 1);
  while (w3.state === 'round' && w3.phase === 'play') { if (w3.interactive) solveStep(w3); else w3.update(H); }
  w3.butterflies.forEach(b => { b.t = -100; }); until(w3, () => w3.state === 'roundDone'); w3.update(H);
  assert.strictEqual(w3.butterflies.length, 0, 'cleared at round clear');
});

// ======================================================================= bot
test('bot: drives only the input API (incl. tracing); skill 1 makes no mistakes; skill 0.3 still finishes', () => {
  for (const age of [3, 5, 7]) {
    const w = new FT.World({ seed: age, age }), bot = new FT.Bot(w, { skill: 1, seed: 1 });
    w.setViewport(960, 720); w.newSession();
    const direct = ['tap', '_pick', '_advance'].map(k => { let n = 0; const f = w[k].bind(w); w[k] = (...a) => { n++; return f(...a); }; return () => n; });
    let miss = 0, n = 0; while (w.state !== 'sessionDone' && n++ < 40000) { bot.step(1 / 30); w.update(1 / 30); for (const e of w.drainEvents()) if (e.type === 'wrong') miss++; }
    assert.strictEqual(w.state, 'sessionDone'); assert.strictEqual(miss, 0);
    assert.ok(bot.stats.strokes >= 12 && bot.stats.traceDone >= 12, 'traced by finger');
    assert.strictEqual(direct[2](), 0, 'no magic icing needed');
    const w2 = new FT.World({ seed: age + 9, age }), b2 = new FT.Bot(w2, { skill: 0.3, seed: 2 });
    w2.setViewport(720, 1556); w2.newSession();
    n = 0; while (w2.state !== 'sessionDone' && n++ < 60000) { b2.step(1 / 30); w2.update(1 / 30); w2.drainEvents(); }
    assert.strictEqual(w2.state, 'sessionDone'); assert.ok(b2.stats.wrong > 5);
  }
});

// ======================================================================= run
const only = process.argv[2];
let fail = 0, ran = 0;
const t0 = Date.now();
for (const t of tests) {
  if (only && !t.name.includes(only)) continue;
  ran++;
  const s = Date.now();
  try { t.fn(); console.log(`✓ ${t.name} (${Date.now() - s} ms)`); }
  catch (e) { fail++; console.log(`✗ ${t.name}\n   ${e && e.message ? e.message.split('\n').slice(0, 6).join(' ') : e}\n   ${e && e.stack ? e.stack.split('\n').filter(l => l.includes('run.js')).slice(0, 2).join(' | ') : ''}`); }
}
console.log(`\n${ran - fail}/${ran} passed in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(fail ? 1 : 0);
