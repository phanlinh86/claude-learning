#!/usr/bin/env node
// Pip's Camp Hide & Seek — headless unit tests for rng / content / world / weather / bot.
// Run from projects/education-game/fox-camp-hide-seek:   node tests/unit/run.js   (exit 1 on any failure)
// (tests/unit/i18n_voice.test.js is the voice engineer's suite and runs on its own.)
'use strict';
const assert = require('assert');
const crypto = require('crypto');
const { load } = require('./load');

const FC = load();
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const H = 1 / 120;
const AGES = [3, 4, 5, 6, 7];
const LANGS = ['en', 'vi'];
const TOPICS = FC.Content.TOPICS;
const C = FC.Content;
const CFG = FC.CONFIG;
const J = v => JSON.parse(JSON.stringify(v));   // objects from the vm sandbox have other prototypes
assert.deepStrictEqual = ((orig) => (a, b, m) => orig(J(a), J(b), m))(assert.deepStrictEqual);

const VIEWPORTS = [
  { W: 1556, H: 720, ins: null, name: 'iPhone landscape' },
  { W: 1556, H: 720, ins: { top: 0, right: 108, bottom: 38, left: 108 }, name: 'iPhone landscape notch' },
  { W: 720, H: 1556, ins: null, name: 'iPhone portrait' },
  { W: 720, H: 1556, ins: { top: 108, right: 0, bottom: 62, left: 0 }, name: 'iPhone portrait notch' },
  { W: 960, H: 720, ins: null, name: 'iPad landscape 4:3' },
  { W: 960, H: 720, ins: { top: 32, right: 0, bottom: 27, left: 0 }, name: 'iPad landscape insets' },
  { W: 720, H: 960, ins: null, name: 'iPad portrait' },
  { W: 720, H: 960, ins: { top: 32, right: 0, bottom: 27, left: 0 }, name: 'iPad portrait insets' },
  { W: 1280, H: 720, ins: null, name: '16:9' },
  { W: 1600, H: 720, ins: null, name: '1600×720' },
  { W: 720, H: 1600, ins: { top: 44, right: 0, bottom: 34, left: 0 }, name: '720×1600 tall insets' },
  { W: 1080, H: 720, ins: { top: 24, right: 44, bottom: 20, left: 44 }, name: 'iPad Pro landscape insets' }
];
const VP = VIEWPORTS[8];

// ---------- helpers ----------
function mkWorld(o) {
  o = o || {};
  const cfg = Object.assign(o.surprise ? {} : { surpriseTypes: [] }, o.config || {});
  const w = new FC.World({ seed: o.seed || 1, age: o.age || 4, lang: o.lang || 'en', config: cfg });
  const v = o.vp || VP;
  w.setViewport(v.W, v.H, v.ins);
  if (o.hudKeep) { w.hudKeep = o.hudKeep; w.setViewport(v.W, v.H, v.ins); }
  w.newSession(); w.drainEvents();
  return w;
}
/** Starts round `ri` of `topic` directly (skips the intro) and runs to the first ask. */
function roundOf(w, topic, ri, surprise) {
  w.levels = [topic, topic, topic, topic];
  w.startLevel(0); w.round = ri || 0;
  w.cfg.surpriseRound = ri || 0; w.cfg.surpriseTypes = surprise ? [surprise] : [];
  w._beginRound();
  untilPhase(w, 'ask');
  return w;
}
function run(w, s, each) { const n = Math.round(s / H); for (let i = 0; i < n; i++) { if (each) each(i); w.update(H); } }
function untilPhase(w, ph, max) { let n = 0; while (w.phase !== ph && n++ < (max || 12000)) w.update(H); assert.strictEqual(w.phase, ph, 'phase ' + ph + ' (now ' + w.state + '/' + w.phase + ')'); }
function until(w, fn, max) { let n = 0; while (!fn() && n++ < (max || 24000)) w.update(H); assert.ok(fn(), 'condition not reached'); }
function tapPlace(w, id) { const h = w.placeHit(id); const r = w.pointerDown(h.x, h.y); const u = w.pointerUp(h.x, h.y); return u || r; }
function hiddenWrong(w) { const a = w.answerId(); return w.places.filter(p => !p.found && p.id !== a && w.friendById(p.friendId).state === 'hidden').map(p => p.id); }
function evs(w) { return w.drainEvents(); }
function hashEvents(list) {
  const h = crypto.createHash('sha1');
  for (const e of list) h.update(JSON.stringify(e, (k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)));
  return h.digest('hex').slice(0, 12);
}
function onScreen(w, x, y, pad) { const L = w.layout; pad = pad || 0; return x >= -pad && x <= L.W + pad && y >= -pad && y <= L.H + pad; }
function box(p, w) { return { pk: w._peekBox(p), ob: w._objBox(p) }; }
function ovl(a, b, m) { m = m || 0; return a.l < b.r + m && b.l < a.r + m && a.t < b.b + m && b.t < a.b + m; }
function kbox(K) { return { l: K.x, t: K.y, r: K.x + K.w, b: K.y + K.h }; }
/** Every place-layout invariant of DESIGN §2 for the world's current places. */
function checkLayout(w, tag) {
  const L = w.layout, ps = w.places.filter(p => !p.leaving), keeps = [L.bubble, L.hud].concat(L.hudKeep || []).map(kbox);
  for (const p of ps) {
    const b = box(p, w);
    assert.ok(p.x - p.w / 2 >= L.ins.left - 1 && p.x + p.w / 2 <= L.W - L.ins.right + 1, tag + ': place inside the safe width ' + p.x);
    assert.ok(p.clueTop >= L.ins.top, tag + ': clue below the top inset');
    assert.ok(p.y <= L.groundY + 1, tag + ': place above the ground line');
    for (const K of keeps) assert.ok(!ovl(b.pk, K, CFG.keepMargin - 0.5), tag + ': clue under a keep-out box ' + JSON.stringify(K) + ' ' + JSON.stringify(b.pk));
    assert.ok(Math.abs(p.clueTop - (p.peekY - p.peekRise - w.geo.clueFrac * p.fs)) < 1e-6, 'clue top = peekY − peekRise − clue height');
    assert.ok(Math.abs(p.fs - 0.75 * p.w) < 1e-6 && Math.abs(p.peekRise - 0.42 * p.fs) < 1e-6);
  }
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const a = ps[i], c = ps[j], A = box(a, w), B = box(c, w);
    if (a.row === c.row) assert.ok(Math.abs(a.x - c.x) >= a.w + CFG.sameGap - 1e-6, tag + ': same row too close');
    assert.ok(!ovl(A.pk, B.pk), tag + ': peek boxes overlap');
    assert.ok(!ovl(A.pk, B.ob), tag + ': a clue is covered by another place');
    assert.ok(!ovl(A.ob, B.pk), tag + ': a clue is covered by another place');
  }
  // a tap at the centre of every hit area picks that place; Pip's centre picks Pip
  for (const p of ps) { const h = w.placeHit(p.id); assert.strictEqual(w._hit(h.x, h.y), p, tag + ': placeHit centre picks its place'); }
  const ph = w.pipHit(); assert.strictEqual(w._hit(ph.x, ph.y), 'pip', tag + ': pipHit centre picks Pip');
}
/** Runs a full session with the bot; checks the invariants on the way. */
function botSession(o) {
  const w = mkWorld(Object.assign({ surprise: true }, o));
  const b = new FC.Bot(w, { skill: o.skill !== undefined ? o.skill : 0.8, seed: (o.seed || 1) + 7 });
  const all = [];
  let t = 0, ask = null, askT = 0, maxAsk = 0;
  const dt = o.dt || 1 / 30;
  while (w.state !== 'sessionDone' && t < 1500) {
    b.step(dt); w.update(dt); t += dt;
    for (const f of w.friends) for (const k of ['x', 'y', 'rot', 'sx', 'sy', 'rise', 'size']) assert.ok(isFinite(f[k]), 'friend.' + k + ' NaN');
    assert.ok(w.places.length <= 6, 'too many places ' + w.places.length);
    assert.ok(w.friends.length <= 12, 'too many friends');
    for (const e of w.drainEvents()) {
      all.push(e);
      if (e.type === 'ask') { ask = e; askT = w.time; }
      if (e.type === 'found') { assert.strictEqual(e.friendId, ask.friendId, 'found the wrong friend'); maxAsk = Math.max(maxAsk, w.time - askT); }
      if (e.type === 'wrong') assert.notStrictEqual(e.friendId, ask.friendId);
      if (e.type === 'peek') assert.strictEqual(e.right, e.friendId === ask.friendId);
    }
  }
  return { w, b, all, t, maxAsk };
}

// ======================================================================== content
test('content: every topic × age × lang × round is solvable over 200 seeds (self-check + independent re-check)', () => {
  let n = 0;
  for (const age of AGES) for (const topic of TOPICS) for (const lang of LANGS) for (let ri = 0; ri < 4; ri++) for (let s = 0; s < 200; s++) {
    const r = C.makeRound(topic, { age, lang, rng: new FC.RNG(s * 97 + ri * 13 + age), roundIndex: ri, season: s % 4 });
    assert.strictEqual(C.validate(r), null);
    // independent re-check: at every ask exactly one STILL HIDDEN place matches, and it is the answer
    const found = new Set();
    for (const a of r.asks) {
      const hits = r.places.map((p, i) => i).filter(i => !found.has(i) && C.matches(a, r.places[i].clue, lang));
      assert.deepStrictEqual(hits, [a.answer], topic + ' age ' + age + ' ' + a.promptKey);
      found.add(a.answer);
    }
    assert.strictEqual(found.size, r.places.length - 1, 'every friend but one is asked for');
    n++;
  }
  assert.strictEqual(n, 5 * 11 * 2 * 4 * 200);
});

test('content: places per round 3: 2,2,3,3 · 4: 2,3,4,4 · 5: 3,4,5,5 · 6–7: 4,5,6,6; asks = places − 1; colours ≤ 3 below age 5', () => {
  const T = { 3: [2, 2, 3, 3], 4: [2, 3, 4, 4], 5: [3, 4, 5, 5], 6: [4, 5, 6, 6], 7: [4, 5, 6, 6] };
  for (const age of AGES) for (const topic of TOPICS) for (let ri = 0; ri < 4; ri++) {
    const r = C.makeRound(topic, { age, lang: 'en', rng: new FC.RNG(ri + 1), roundIndex: ri });
    const want = topic === 'size' ? 2 : topic === 'colors' && age < 5 ? Math.min(3, T[age][ri]) : T[age][ri];
    assert.strictEqual(r.places.length, want, topic + ' age ' + age + ' r' + ri);
    assert.strictEqual(r.asks.length, want - 1);
    assert.strictEqual(r.places[0].clue.kind, C.CLUE_OF[topic]);
  }
});

test('content: colour-blind pairs never below age 5 (blue+purple, red+green, yellow+orange, green+orange, red+orange), no pink', () => {
  let pinkSeen = false;
  for (const age of AGES) for (let s = 0; s < 400; s++) {
    const r = C.makeRound('colors', { age, lang: 'en', rng: new FC.RNG(s), roundIndex: s % 4 });
    const cs = r.places.map(p => p.clue.color);
    assert.strictEqual(new Set(cs).size, cs.length, 'hat colours are distinct');
    if (age < 5) { assert.ok(!C.clash(cs), cs.join('+')); assert.ok(!cs.includes('pink')); }
    else if (cs.includes('pink')) pinkSeen = true;
    for (const a of r.asks) assert.strictEqual(a.promptKey, 'p.colors');
  }
  assert.ok(pinkSeen, 'pink is an answer colour from age 5');
});

test('content: count — round 1 counts up (numeral + stars, asks 1, 2, … in order), rounds 2–3 stars only, age 4 n ∈ 1–5 spread', () => {
  let gaps = 0, rounds = 0;
  for (const age of AGES) for (let s = 0; s < 120; s++) for (let ri = 0; ri < 4; ri++) {
    const r = C.makeRound('count', { age, lang: 'en', rng: new FC.RNG(s * 5 + ri), roundIndex: ri });
    if (ri === 1) {
      assert.deepStrictEqual(r.asks.map(a => a.params.n), r.asks.map((a, i) => i + 1));
      assert.ok(r.asks.every(a => a.promptKey === 'p.countUp'));
      assert.strictEqual(r.asks[0].params.first, true);
      assert.ok(r.places.every(p => p.clue.kind === 'sign' && p.clue.text === String(p.clue.n) && p.clue.nameKind === 'number'));
      assert.deepStrictEqual(r.places.map(p => p.clue.n).sort((a, b) => a - b), r.places.map((p, i) => i + 1));
    } else {
      assert.ok(r.asks.every(a => a.promptKey === 'p.count'));
      assert.ok(r.places.every(p => p.clue.kind === 'sign' && !p.clue.text && p.clue.nameKind === 'stars'));
      if (age === 4) {
        const v = r.places.map(p => p.clue.n).sort((a, b) => a - b);
        assert.ok(v[0] >= 1 && v[v.length - 1] <= 5);
        rounds++; if (v.every((x, i) => !i || x - v[i - 1] >= 2)) gaps++;
        if (v.length <= 2) assert.ok(v.every((x, i) => !i || x - v[i - 1] >= 2), '≥ 2 apart when possible: ' + v);
      }
    }
  }
  assert.ok(rounds > 0);
});

test('content: size (age 3) — ONE animal per round, big AND small (scale 1 / 0.62)', () => {
  for (let s = 0; s < 300; s++) for (let ri = 0; ri < 4; ri++) {
    const r = C.makeRound('size', { age: 3, lang: s % 2 ? 'vi' : 'en', rng: new FC.RNG(s + 1), roundIndex: ri });
    const ps = r.places;
    assert.strictEqual(ps.length, 2); assert.strictEqual(ps[0].friend, ps[1].friend);
    assert.deepStrictEqual(ps.map(p => p.clue.size).sort(), ['big', 'small']);
    for (const p of ps) { assert.strictEqual(p.clue.scale, p.clue.size === 'big' ? 1 : 0.62); assert.strictEqual(p.clue.animal, p.friend); }
  }
});

test('content: animals — by sound from round 2 at age ≥ 4 (about half), never earlier or at age 3; friends distinct', () => {
  let snd = 0, all = 0;
  for (const age of AGES) for (let s = 0; s < 100; s++) for (let ri = 0; ri < 4; ri++) {
    const r = C.makeRound('animals', { age, lang: 'en', rng: new FC.RNG(s * 3 + ri), roundIndex: ri });
    assert.strictEqual(new Set(r.places.map(p => p.friend)).size, r.places.length);
    for (const a of r.asks) {
      if (age < 4 || ri < 2) assert.strictEqual(a.promptKey, 'p.animals');
      else { all++; if (a.promptKey === 'p.sound') snd++; }
    }
  }
  assert.ok(snd / all > 0.4 && snd / all < 0.6, 'sound share ' + snd / all);
});

test('content: shapes ≤ 4 each flag its own colour; initial: distinct initials while hidden (en leftover sheep / vi chó ok)', () => {
  for (let s = 0; s < 200; s++) {
    const r = C.makeRound('shapes', { age: 4, lang: 'en', rng: new FC.RNG(s), roundIndex: 3 });
    const cs = r.places.map(p => p.clue.color);
    assert.strictEqual(new Set(cs).size, cs.length);
    assert.ok(r.places.every(p => C.SHAPES4.includes(p.clue.shape)));
    for (const lang of LANGS) {
      const q = C.makeRound('initial', { age: 6, lang, rng: new FC.RNG(s), roundIndex: s % 4 });
      for (const a of q.asks) assert.strictEqual(a.promptKey, 'p.initial');
      const left = q.places.findIndex((p, i) => !q.asks.some(a => a.answer === i));
      assert.ok(left >= 0);
    }
  }
});

test('content: a round never opens with the ask that closed the previous round (count-up "find 1" excepted); less skew', () => {
  for (const age of AGES) for (const topic of FC.AGE_POOLS[age]) for (let s = 0; s < 60; s++) {
    const rng = new FC.RNG(s * 11 + age);
    let prev = null;
    for (let ri = 0; ri < 4; ri++) {
      const r = C.makeRound(topic, { age, lang: 'en', rng, roundIndex: ri, avoid: prev });
      if (prev && r.asks[0].promptKey !== 'p.countUp') assert.notStrictEqual(r.asks[0].promptKey + JSON.stringify(r.asks[0].params), prev.promptKey + JSON.stringify(prev.params), topic);
      prev = r.asks[r.asks.length - 1];
    }
  }
  const share = (topic, age, key) => {
    const c = {}; let n = 0;
    for (let s = 0; s < 400; s++) for (let ri = 0; ri < 4; ri++) {
      const r = C.makeRound(topic, { age, lang: 'en', rng: new FC.RNG(s * 4 + ri), roundIndex: ri });
      for (const a of r.asks) { const v = key(r.places[a.answer].clue); c[v] = (c[v] || 0) + 1; n++; }
    }
    return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v / n]));
  };
  const cnt = share('count', 4, c => c.n), col = share('colors', 4, c => c.color);
  assert.ok(cnt[1] < 0.3, '"1" share of age-4 count answers ' + cnt[1].toFixed(2));
  assert.ok(col.yellow < 0.27, 'yellow share of age-4 colour answers ' + col.yellow.toFixed(2));
  console.log('     (age 4: count "1" ' + (100 * cnt[1]).toFixed(0) + ' %, colour yellow ' + (100 * col.yellow).toFixed(0) + ' %)');
});

test('content: oddeven — exactly one parity ask per round, the others are sums (p.add); hiding kinds alternate per season', () => {
  for (let s = 0; s < 300; s++) {
    const r = C.makeRound('oddeven', { age: 7, lang: 'en', rng: new FC.RNG(s), roundIndex: s % 4, season: s % 4 });
    assert.strictEqual(r.asks.filter(a => a.promptKey === 'p.oddeven').length, 1);
    assert.ok(r.asks.every(a => a.promptKey === 'p.oddeven' || a.promptKey === 'p.add'));
    const ks = FC.SEASON_SPOTS[s % 4];
    r.places.forEach((p, i) => { assert.ok(ks.includes(p.kind)); if (i) assert.notStrictEqual(p.kind, r.places[i - 1].kind); });
  }
});

test('content: deterministic from the rng; Talk time valid for every age × topic', () => {
  const a = C.makeRound('animals', { age: 4, rng: new FC.RNG(42), roundIndex: 2 }), b = C.makeRound('animals', { age: 4, rng: new FC.RNG(42), roundIndex: 2 });
  assert.deepStrictEqual(a, b);
  for (const age of AGES) for (const topic of TOPICS) for (const lang of LANGS) for (let s = 0; s < 30; s++) {
    const t = C.makeTalk(topic, { age, lang, rng: new FC.RNG(s) });
    assert.strictEqual(t.promptKey, 'talk.' + topic);
    assert.ok(t.choices.find(c => c.id === t.answerId));
    assert.strictEqual(new Set(t.choices.map(c => String(c.value))).size, t.choices.length);
    if (topic === 'colors' && age < 5) assert.ok(!C.clash(t.choices.map(c => c.value)));
  }
});

test('content: topic rotation between sessions (newSession lastTopics)', () => {
  for (const age of AGES) {
    const w = new FC.World({ seed: age, age }); w.setViewport(1280, 720);
    w.newSession(); const first = w.levels.slice();
    assert.strictEqual(new Set(first).size, 4);
    assert.ok(first.every(t => FC.AGE_POOLS[age].includes(t)));
    w.newSession({ lastTopics: first });
    assert.notStrictEqual(w.levels[0], first[0], 'chapter 1 rotates');
    assert.ok(w.levels.some(t => !first.includes(t)), 'a topic left out last time comes back');
  }
});

// ======================================================================== layout
test('layout: DESIGN §2 numbers (bubble, groundY, pip, camp, rows, field, spotW, tall scale)', () => {
  const L = FC.World.computeLayout(1280, 720, null, {}, 4);
  assert.deepStrictEqual(L.bubble, { x: 24, y: 20, w: 640, h: 122 });
  assert.strictEqual(L.groundY, 692); assert.deepStrictEqual([L.pip.x, L.pip.y, L.pip.h], [120, 686, 230]);
  assert.deepStrictEqual([L.camp.x, L.camp.y], [1130, 682]);
  assert.strictEqual(L.rows.length, 2); assert.strictEqual(L.rows[0].y, 0.58 * 720); assert.strictEqual(L.rows[0].scale, 0.86);
  assert.strictEqual(L.rows[1].y, 692 - 150); assert.deepStrictEqual([L.field.x0, L.field.x1], [330, 950]);
  assert.strictEqual(L.spotW, 220); assert.strictEqual(FC.World.computeLayout(1280, 720, null, {}, 6).spotW, 200);
  assert.strictEqual(L.bench.length, 6); assert.ok(Math.abs(L.seatSize - 0.55 * 220) < 1e-9);
  const P = FC.World.computeLayout(720, 1556, { top: 108, right: 0, bottom: 62, left: 0 }, {}, 4);
  assert.ok(P.portrait && P.tall && P.scale === 1.15);
  assert.deepStrictEqual(P.bubble, { x: 24, y: 108 + 96 + 24, w: 720 - 48, h: 124 });
  assert.strictEqual(P.groundY, 1556 - 62 - 40); assert.strictEqual(P.pip.h, 250 * 1.15);
  assert.strictEqual(P.rows.length, 3); assert.strictEqual(P.rows[0].y, 0.47 * 1556); assert.strictEqual(P.rows[0].scale, 0.88);
  assert.ok(Math.abs(P.spotW - 220 * 1.15) < 1e-9);
  assert.deepStrictEqual(FC.World.logicalSize(390, 844), { W: 720, H: 1558 }); assert.deepStrictEqual(FC.World.logicalSize(1024, 768), { W: 960, H: 720 });
});

test('layout: every viewport × age × 2–6 places × season — no clue under a keep-out, no overlap, taps pick their place', () => {
  let n = 0, shrunk = 0;
  for (const v of VIEWPORTS) for (const age of [3, 4, 6]) for (let np = 2; np <= 6; np++) for (let season = 0; season < 4; season++) {
    const w = new FC.World({ seed: np * 7 + season, age, config: { surpriseTypes: [] } });
    w.setViewport(v.W, v.H, v.ins);
    // main.js measures the real HUD + bubble boxes: a slightly bigger bubble than the layout's
    const L = w.layout;
    w.hudKeep = [{ x: L.hud.x - 10, y: 0, w: L.hud.w + 10, h: L.hud.h + 8 }, { x: L.bubble.x - 6, y: L.bubble.y - 6, w: L.bubble.w + 12, h: L.bubble.h + 16 }];
    w.setViewport(v.W, v.H, v.ins);
    w.newSession(); w.levels = ['letters', 'letters', 'letters', 'letters']; w.startLevel(season);
    w.cfg.placesByAge = { [age]: [np, np, np, np] };
    w._beginRound();
    assert.strictEqual(w.places.length, np);
    assert.ok(!w.geo.cramped, v.name + ' age ' + age + ' ' + np + ' places: no layout fits');
    checkLayout(w, v.name + ' a' + age + ' n' + np + ' s' + season);
    if (w.geo.k < 1) shrunk++;
    n++;
  }
  assert.ok(n === VIEWPORTS.length * 3 * 5 * 4);
  console.log('     (' + shrunk + '/' + n + ' layouts needed smaller places)');
});

test('layout: age-4 rounds on every viewport never shrink below 0.82 (big tap targets for small fingers)', () => {
  for (const v of VIEWPORTS) for (let np = 2; np <= 4; np++) {
    const w = new FC.World({ seed: 3, age: 4, config: { surpriseTypes: [], placesByAge: { 4: [np, np, np, np] } } });
    w.setViewport(v.W, v.H, v.ins); w.newSession(); w.levels = ['animals', 'animals', 'animals', 'animals']; w.startLevel(0); w._beginRound();
    assert.ok(w.geo.k >= 0.82, v.name + ' ' + np + ' places k ' + w.geo.k);
  }
});

// ======================================================================== world: sessions
test('world: full sessions with the bot at every age (sessionDone, right finds only, no stuck ask, ≤ 6 places)', () => {
  for (const age of AGES) for (let s = 0; s < 3; s++) {
    const vp = VIEWPORTS[(age + s * 5) % VIEWPORTS.length];
    const r = botSession({ age, seed: 10 + age * 3 + s, vp, lang: s % 2 ? 'vi' : 'en' });
    assert.strictEqual(r.w.state, 'sessionDone', 'age ' + age + ' ' + vp.name + ' ended in ' + r.w.state + '/' + r.w.phase);
    assert.ok(r.maxAsk < 40, 'an ask took ' + r.maxAsk.toFixed(1) + ' s');
    const types = new Set(r.all.map(e => e.type));
    for (const t of ['level', 'round', 'gather', 'countNum', 'hideIn', 'ready', 'ask', 'peek', 'found', 'seat', 'reveal', 'roundDone', 'talk', 'levelDone', 'sessionDone']) assert.ok(types.has(t), 'event ' + t + ' (age ' + age + ')');
    const sd = r.all.find(e => e.type === 'sessionDone');
    assert.ok(sd.stars >= 4 && sd.friends > 0);
  }
});

test('world: age 4, bot skill 0.8 — sessions ≤ 8 min sim time, chapters 60–100 s', () => {
  const ch = [];
  for (let s = 0; s < 6; s++) {
    const r = botSession({ age: 4, seed: 100 + s, vp: VIEWPORTS[s * 2 % VIEWPORTS.length] });
    assert.strictEqual(r.w.state, 'sessionDone');
    assert.ok(r.w.time <= 480, 'session ' + r.w.time.toFixed(0) + ' s');
  }
  // chapter times from a timed run
  for (let s = 0; s < 4; s++) {
    const w = mkWorld({ age: 4, seed: 200 + s, surprise: true });
    const b = new FC.Bot(w, { skill: 0.8, seed: s });
    let c0 = 0;
    while (w.state !== 'sessionDone') { b.step(1 / 30); w.update(1 / 30); for (const e of w.drainEvents()) { if (e.type === 'level') c0 = w.time; if (e.type === 'levelDone') ch.push(w.time - c0); } }
  }
  const mean = ch.reduce((a, b) => a + b, 0) / ch.length;
  assert.ok(mean >= 60 && mean <= 100, 'chapter mean ' + mean.toFixed(1) + ' s');
  console.log('     (age-4 chapter mean ' + mean.toFixed(1) + ' s, ' + ch.length + ' chapters)');
});

test('world: every round event carries its fields', () => {
  const r = botSession({ age: 5, seed: 31, skill: 0.6 });
  const need = {
    level: ['level', 'topic', 'season'], round: ['round', 'topic', 'places', 'asks', 'surprise'], countNum: ['n'], hideIn: ['placeId', 'friendId'],
    ask: ['ask', 'asks', 'promptKey', 'params', 'answerId', 'friendId'], peek: ['placeId', 'friendId', 'right'],
    found: ['placeId', 'friendId', 'nameKind', 'nameValue', 'n', 'clue'], seat: ['friendId', 'seat', 'x', 'y'],
    wrong: ['placeId', 'friendId', 'nameKind', 'nameValue', 'want', 'streak', 'misses'], hint: ['placeId'],
    roundDone: ['round', 'stars', 'misses'], reveal: ['placeId', 'friendId', 'nameKind', 'nameValue'], levelDone: ['level', 'stars']
  };
  for (const e of r.all) if (need[e.type]) for (const k of need[e.type]) assert.ok(e[k] !== undefined, e.type + '.' + k);
  const counts = r.all.filter(e => e.type === 'countNum').map(e => e.n);
  assert.deepStrictEqual(counts.slice(0, 3), [1, 2, 3]);
  const f = r.all.filter(e => e.type === 'found');
  assert.ok(f.every(e => e.n >= 1));
});

test('world: gather → count timing — staggered hop-in, countNum at 0.3 / 1.0 / 1.7 s, hideIn, ready → ask; taps ignored meanwhile', () => {
  const w = mkWorld({ age: 4, seed: 5 });
  w.levels = ['animals', 'animals', 'animals', 'animals']; w.startLevel(0); w.round = 3; w._beginRound();
  const ev = [], t0 = w.time;
  const xs0 = w.friends.map(f => f.x);
  run(w, 0.3);
  const moved = w.friends.map((f, i) => f.x < xs0[i] - 1);
  assert.ok(moved[0] && !moved[w.friends.length - 1], 'staggered: the first friend moves before the last');
  let countT0 = null, ignored = 0;
  until(w, () => {
    for (const e of w.drainEvents()) { ev.push([e.type, w.time - t0, e.n]); if (e.type === 'countNum' && e.n === 1) countT0 = w.time - CFG.countAt[0]; }
    if (w.phase === 'gather' || w.phase === 'count') {
      for (const p of w.places) { const h = w.placeHit(p.id); if (w.pointerDown(h.x, h.y) !== null) ignored++; w.pointerUp(h.x, h.y); }
      const ph = w.pipHit(); if (w.pointerDown(ph.x, ph.y) !== null) ignored++; w.pointerUp(ph.x, ph.y);
    }
    return w.phase === 'ask';
  });
  assert.strictEqual(ignored, 0, 'taps during gather / count return null');
  const cn = ev.filter(e => e[0] === 'countNum');
  assert.deepStrictEqual(cn.map(e => e[2]), [1, 2, 3]);
  assert.ok(Math.abs((cn[1][1] - cn[0][1]) - 0.7) < 0.02 && Math.abs((cn[2][1] - cn[1][1]) - 0.7) < 0.02);
  assert.strictEqual(ev.filter(e => e[0] === 'hideIn').length, w.places.length);
  const iReady = ev.findIndex(e => e[0] === 'ready'), iAsk = ev.findIndex(e => e[0] === 'ask');
  assert.ok(iReady >= 0 && iAsk === iReady + 1);
  assert.ok(w.time - countT0 >= CFG.countTime - 0.01, 'count lasts ≥ 2.6 s');
  assert.ok(w.friends.every(f => f.state === 'hidden' && f.place === f.home));
  assert.strictEqual(w.pip.mood, 'peek');
});

test('world: right peek → found, the friend jumps out and hops to the next bench seat (seat event); taps ignored during peek/found', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'animals', 3);
  evs(w);
  const a = w.answerId(), f = w.friendById(w.placeById(a).friendId);
  assert.strictEqual(tapPlace(w, a), a);
  assert.strictEqual(w.phase, 'peek');
  const e1 = evs(w); assert.strictEqual(e1[0].type, 'peek'); assert.strictEqual(e1[0].right, true);
  // taps during peek → null
  for (const p of w.places) { const h = w.placeHit(p.id); assert.strictEqual(w.pointerDown(h.x, h.y), null); }
  let rmax = 0; until(w, () => { rmax = Math.max(rmax, f.rise); return w.phase === 'found'; });
  const rm = w.placeById(a).riseMax; assert.ok(rm > 0.4 && rmax > rm * 1.05, 'the pop overshoots (' + rmax.toFixed(3) + ' vs ' + rm.toFixed(3) + ')');
  const e2 = evs(w); const fe = e2.find(e => e.type === 'found');
  assert.ok(fe && fe.friendId === f.id && fe.n === 1);
  assert.strictEqual(w.fire.power, 1);
  for (const p of w.places) { const h = w.placeHit(p.id); assert.strictEqual(w.pointerDown(h.x, h.y), null, 'taps during found → null'); }
  until(w, () => f.state === 'seated', 2000);
  const S = w.layout.bench[0];
  assert.ok(Math.abs(f.x - S.x) < 0.5 && Math.abs(f.y - S.y) < 0.5, 'on bench seat 0');
  assert.ok(Math.abs(f.size - w.layout.seatSize * f.scale) < 1e-6, 'seated size 0.55·spotW');
  assert.ok(w.placeById(a).found && w.placeById(a).open === 1, 'the place stays open (empty)');
});

test('world: wrong → boo (wiggle, look at Pip) → duck → closed; tap lock 0.8 s, 1.6 s after the 2nd miss; 2nd miss → hint', () => {
  const w = roundOf(mkWorld({ age: 4, seed: 3 }), 'colors', 2);
  evs(w);
  const wr = hiddenWrong(w); assert.ok(wr.length >= 2);
  assert.strictEqual(tapPlace(w, wr[0]), wr[0]);
  const fw = w.friendById(w.placeById(wr[0]).friendId);
  until(w, () => w.phase === 'ask');
  let wig = 0;
  let e = evs(w); const we = e.find(x => x.type === 'wrong');
  assert.ok(we && we.placeId === wr[0] && we.misses === 1 && we.want && we.want.kind === 'color');
  const f = w.friendById(w.placeById(wr[0]).friendId);
  assert.strictEqual(f.state, 'boo'); assert.ok(f.look === -1 || f.look === 1);
  // locked: a tap on another place during the lock
  run(w, 0.3, () => { wig = Math.max(wig, Math.abs(fw.rot)); });
  assert.strictEqual(tapPlace(w, wr[1]), 'locked');
  assert.ok(evs(w).some(x => x.type === 'locked' && x.placeId === wr[1]));
  run(w, 0.4, () => { wig = Math.max(wig, Math.abs(fw.rot)); });
  assert.ok(wig > 0.05, 'the wrong friend wiggles');
  run(w, 0.2);   // lock over (0.8 s after the wrong event)
  until(w, () => f.state === 'hidden', 400);
  assert.ok(w.placeById(wr[0]).open < 0.01 || w.placeById(wr[0])._openT === 0, 'closes');
  assert.strictEqual(tapPlace(w, wr[1]), wr[1], 'after the lock the next tap peeks');
  until(w, () => w.phase === 'ask');
  e = evs(w);
  assert.ok(e.some(x => x.type === 'wrong' && x.misses === 2));
  const h = e.find(x => x.type === 'hint'); assert.ok(h && h.placeId === w.answerId(), '2nd miss → hint on the right place');
  // 1.6 s lock after the 2nd miss
  run(w, 1.2); assert.strictEqual(tapPlace(w, w.answerId()), 'locked');
  run(w, 0.5); const a = w.answerId(); assert.strictEqual(tapPlace(w, a), a);
  run(w, 0.4); assert.ok(w.placeById(a).glow > 0.3 || w.placeById(a).found);
});

test('world: stars per round 3 / 2 / 1 for 0 / 1 / ≥ 2 misses', () => {
  for (const [nw, want] of [[0, 3], [1, 2], [2, 1]]) {
    const w = roundOf(mkWorld({ age: 5, seed: 9 + nw }), 'letters', 3);
    let left = nw, st = null;
    until(w, () => {
      if (w.phase === 'ask' && !w._locked() && w.friends.every(f => f.found || f.state === 'hidden')) {
        const wr = hiddenWrong(w);
        if (left > 0 && wr.length) { tapPlace(w, wr[0]); left--; } else tapPlace(w, w.answerId());
      }
      for (const e of w.drainEvents()) if (e.type === 'roundDone') st = e.stars;
      return st !== null;
    }, 60000);
    assert.strictEqual(st, want);
  }
});

test('world: tap on an already found (empty) place → empty event, no miss; tap on Pip → pokePip (< 24 px, < 0.35 s)', () => {
  const w = roundOf(mkWorld({ age: 4, seed: 4 }), 'shapes', 3);
  const a = w.answerId(); tapPlace(w, a);
  until(w, () => w.phase === 'ask'); evs(w);
  const m0 = w.misses;
  assert.strictEqual(tapPlace(w, a), 'empty');
  const e = evs(w); assert.ok(e.some(x => x.type === 'empty' && x.placeId === a)); assert.strictEqual(w.misses, m0);
  const ph = w.pipHit();
  assert.strictEqual(w.pointerDown(ph.x, ph.y), 'pip'); assert.strictEqual(w.pointerUp(ph.x + 5, ph.y), 'pokePip');
  const pe = evs(w).find(x => x.type === 'pokePip'); assert.ok(pe && pe.promptKey === w.prompt().promptKey);
  w.pointerDown(ph.x, ph.y); assert.strictEqual(w.pointerUp(ph.x + 40, ph.y), null, 'a drag is not a poke');
  w.pointerDown(ph.x, ph.y); run(w, 0.5); assert.strictEqual(w.pointerUp(ph.x, ph.y), null, 'a long press is not a poke');
  w.pointerDown(ph.x, ph.y); w.cancelDrag(); assert.strictEqual(w.pointerUp(ph.x, ph.y), null);
  // grass taps hit nothing and keep the idle help counting
  assert.strictEqual(w.pointerDown(w.layout.W / 2, w.layout.groundY + 10), null);
});

test('world: idle nudges at 12 s, then ×1.5 (18 s); the 2nd idle also hints; grass taps do not reset; resetNudges restarts', () => {
  const w = roundOf(mkWorld({ age: 4, seed: 6 }), 'animals', 2);
  evs(w);
  const got = [];
  run(w, 31, i => { if (i % 120 === 0) w.pointerDown(5, w.layout.groundY + 15); for (const e of w.drainEvents()) got.push([e.type, +w.time.toFixed(2), e.idle]); });
  const idles = got.filter(e => e[0] === 'idle');
  assert.strictEqual(idles.length, 2);
  assert.ok(Math.abs(idles[1][1] - idles[0][1] - 18) < 0.05);
  const hints = got.filter(e => e[0] === 'hint');
  assert.strictEqual(hints.length, 1); assert.strictEqual(hints[0][2], true);
  w.resetNudges(); assert.strictEqual(w._idleN, 0);
  const got2 = []; run(w, 12.1, () => { for (const e of w.drainEvents()) got2.push(e.type); });
  assert.ok(got2.includes('idle'));
});

test('world: the 2nd miss always glows (even inside the hint cooldown)', () => {
  const w = roundOf(mkWorld({ age: 6, seed: 8 }), 'add', 3);
  w.hint(); evs(w);   // a manual hint just now → cooldown running
  w.placeById(w.answerId())._glowT = 0;
  const wr = hiddenWrong(w);
  tapPlace(w, wr[0]); until(w, () => w.phase === 'ask'); run(w, 0.85);
  tapPlace(w, wr[1]); until(w, () => w.phase === 'ask');
  assert.ok(evs(w).some(e => e.type === 'hint'), 'glow on the 2nd miss');
});

test('world: party — roundDone, the leftover friend reveals itself and sits, everybody dances, then hops off to the right', () => {
  const w = roundOf(mkWorld({ age: 4, seed: 11 }), 'colors', 1);
  const all = [];
  until(w, () => {
    if (w.phase === 'ask') tapPlace(w, w.answerId());
    for (const e of w.drainEvents()) all.push(e);
    return w.phase === 'party';
  });
  const iRd = all.findIndex(e => e.type === 'roundDone'); assert.ok(iRd >= 0);
  assert.strictEqual(w.pip.mood, 'cheer');
  let danced = 0;
  until(w, () => { for (const e of w.drainEvents()) all.push(e); if (w.friends.some(f => f.state === 'dance' && f._dance > 4)) danced++; return w.state === 'roundDone'; });
  assert.ok(all.some(e => e.type === 'reveal')); assert.ok(danced > 0, 'seated friends hop in place');
  assert.ok(w.friends.every(f => f.seat >= 0), 'everybody sat at the fire');
  until(w, () => w.state === 'round' && w.phase === 'gather');
  assert.ok(w.round === 2);
});

test('world: chapter time limit — after ≥ 3 rounds and > 80 s → Talk time; Talk re-asks every 12 s, glow from the 2nd', () => {
  const w = mkWorld({ age: 4, seed: 12 });
  let rounds = 0;
  until(w, () => {
    if (w.state === 'round' && w.phase === 'ask' && w.phaseTime > 14) tapPlace(w, w.answerId());   // a slow child
    for (const e of w.drainEvents()) if (e.type === 'roundDone') rounds++;
    return w.state === 'talk';
  }, 400000);
  assert.ok(rounds >= CFG.chapterMinRounds && rounds < 4, 'rounds ' + rounds);
  assert.strictEqual(w.roundsPerLevel, rounds, 'a cut chapter: roundsPerLevel = rounds played (HUD dots fill)');
  const asks = [];
  run(w, 25, () => { for (const e of w.drainEvents()) if (e.type === 'talkAsk') asks.push(e); });
  assert.deepStrictEqual(asks.map(a => a.n), [1, 2]); assert.strictEqual(asks[0].glowAnswer, false); assert.strictEqual(asks[1].glowAnswer, true);
  w.resetNudges(); assert.strictEqual(w.talk.glowAnswer, false);
  assert.ok(w.talkAnswer(w.talk.answerId)); until(w, () => w.state === 'intro'); assert.strictEqual(w.level, 1); assert.strictEqual(w.season, 1);
  assert.strictEqual(w.roundsPerLevel, CFG.roundsPerLevel, 'reset at the next chapter');
});

test('world: swap surprise — after the 1st find two hidden friends trade places (crossing arcs) and every ask stays solvable', () => {
  let swaps = 0;
  for (let s = 0; s < 12; s++) {
    const w = roundOf(mkWorld({ age: 6, seed: 40 + s, surprise: true }), 'letters', 2, 'swap');
    assert.strictEqual(w.surprise, 'swap');
    const all = [];
    let sawSwapPhase = false, apexes = {};
    until(w, () => {
      if (w.phase === 'ask' && !w._locked()) {
        // check: the answer place really holds the friend whose clue matches the ask
        const a = w._askObj(), pl = w.placeById(w.answerId()), f = w.friendById(pl.friendId);
        assert.ok(C.matches(a, f.clue, w.lang), 'answer place holds the matching friend');
        const hidden = w.friends.filter(x => !x.found && C.matches(a, x.clue, w.lang));
        assert.strictEqual(hidden.length, 1);
        tapPlace(w, pl.id);
      }
      if (w.phase === 'swap') { sawSwapPhase = true; for (const id of w._swapping) { const f = w.friendById(id); apexes[id] = Math.min(apexes[id] || 1e9, f.y); } }
      for (const e of w.drainEvents()) all.push(e);
      return w.phase === 'party';
    }, 40000);
    const sw = all.find(e => e.type === 'swap');
    assert.ok(sw && sawSwapPhase, 'swap happens');
    assert.ok(all.findIndex(e => e.type === 'swap') > all.findIndex(e => e.type === 'found'), 'after the first find');
    const A = w.friendById(sw.a), B = w.friendById(sw.b);
    assert.strictEqual(A.home, sw.placeB); assert.strictEqual(B.home, sw.placeA);
    assert.ok(Math.abs(apexes[sw.a] - apexes[sw.b]) > 20, 'crossing arcs of different heights');
    swaps++;
  }
  assert.strictEqual(swaps, 12);
});

test('world: critter surprise — pops up once between asks (3 s); a tap → critterTap; it is never under a keep-out or a clue', () => {
  let tapped = 0, seen = 0;
  for (let s = 0; s < 10; s++) {
    const v = VIEWPORTS[s % VIEWPORTS.length];
    const w = roundOf(mkWorld({ age: 4, seed: 70 + s, surprise: true, vp: v }), 'animals', 2, 'critter');
    let c = null, life = 0, ev = [];
    until(w, () => {
      if (w.phase === 'ask' && w.ask === 0) tapPlace(w, w.answerId());
      for (const e of w.drainEvents()) ev.push(e);
      if (w.critter) { c = w.critter; life += H; }
      return (c && !w.critter) || w.phase === 'party';
    }, 20000);
    if (!c) continue;
    seen++;
    assert.ok(ev.some(e => e.type === 'critter'));
    assert.ok(life > 2.9 && life < 3.1, 'about 3 s: ' + life.toFixed(2));
    const keeps = [w.layout.bubble, w.layout.hud].map(kbox), cb = { l: c.x - c.size / 2, t: c.y - c.size, r: c.x + c.size / 2, b: c.y };
    for (const K of keeps) assert.ok(!ovl(cb, K), v.name + ': squirrel under the HUD / bubble');
    for (const p of w.places) assert.ok(!ovl(cb, w._peekBox(p)), 'squirrel over a clue');
    // a second world: tap it
    const w2 = roundOf(mkWorld({ age: 4, seed: 70 + s, surprise: true, vp: v }), 'animals', 2, 'critter');
    until(w2, () => { if (w2.phase === 'ask' && w2.ask === 0) tapPlace(w2, w2.answerId()); return w2.critter && w2.critter.state === 'up'; }, 20000);
    const k = w2.critter;
    assert.strictEqual(w2.pointerDown(k.x, k.y - k.size / 2), 'critter');
    assert.ok(w2.drainEvents().some(e => e.type === 'critterTap'));
    tapped++;
  }
  assert.ok(seen >= 8 && tapped === seen, 'seen ' + seen);
});

test('world: resize mid-count / mid-peek / mid-hop / mid-party — every object snaps on screen and the round goes on', () => {
  const sizes = [[720, 1556, { top: 108, right: 0, bottom: 62, left: 0 }], [960, 720, null], [1556, 720, { top: 0, right: 108, bottom: 38, left: 108 }], [720, 960, null]];
  for (let s = 0; s < 8; s++) {
    const w = mkWorld({ age: 6, seed: 90 + s, surprise: true });
    const b = new FC.Bot(w, { skill: 0.7, seed: s });
    const triggers = ['count', 'peek', 'found', 'party', 'gather', 'swap'];
    let k = 0, done = 0, t = 0;
    const seen = new Set();
    while (w.state !== 'sessionDone' && t < 900) {
      b.step(1 / 30); w.update(1 / 30); t += 1 / 30;
      for (const e of w.drainEvents()) seen.add(e.type);
      if (w.state === 'round' && w.phase === triggers[k % triggers.length] && w.phaseTime > 0.1) {
        const z = sizes[(k + s) % sizes.length]; k++;
        const hopping = w.friends.some(f => f._seg && f._seg.type === 'hop');
        w.setViewport(z[0], z[1], z[2]);
        for (const f of w.friends) {
          assert.ok(!f._seg && !f._queue.length, 'all animations finished');
          assert.ok(onScreen(w, f.x, f.y - f.size / 2, 20) || f.state === 'gone', 'friend on screen ' + f.state + ' ' + f.x + ',' + f.y);
          if (f.at && f.at.kind === 'place') { const p = w.placeById(f.at.id); assert.ok(Math.abs(f.x - p.x) < 1e-6); }
          if (f.state === 'seated') { const S = w.layout.bench[f.seat]; assert.ok(Math.abs(f.x - S.x) < 1e-6 && Math.abs(f.y - S.y) < 1e-6); }
        }
        if (w.places.length) checkLayout(w, 'resize ' + z[0] + '×' + z[1]);
        if (hopping) done++;
      }
    }
    assert.strictEqual(w.state, 'sessionDone', 'session completes after resizes');
    assert.ok(k >= 6, 'resized ' + k + ' times');
    assert.ok(done >= 1, 'a resize while a friend was mid-hop');
  }
});

test('world: motion physics — ballistic hops (constant gravity), landing squash then overshoot, place shake ≈ 0.1 rad damped', () => {
  const w = roundOf(mkWorld({ age: 4, seed: 21 }), 'animals', 3);
  const a = w.answerId(), f = w.friendById(w.placeById(a).friendId), p = w.placeById(a);
  tapPlace(w, a);
  // place shake
  let smax = 0, s2 = 0, sgn = 0, flips = 0;
  run(w, 0.6, () => { smax = Math.max(smax, Math.abs(p.shake)); const g = Math.sign(p.shake); if (g && g !== sgn) { if (sgn) flips++; sgn = g; } });
  assert.ok(smax > 0.07 && smax < 0.13, 'shake peak ' + smax.toFixed(3));
  assert.ok(flips >= 2, 'it wobbles back and forth');
  run(w, 1.0, () => { s2 = Math.max(s2, Math.abs(p.shake)); });
  assert.ok(s2 < 0.03, 'damped');
  // a hop to the bench: second differences of y are constant (= g·h²) mid-air
  const w2 = roundOf(mkWorld({ age: 4, seed: 22 }), 'animals', 3);
  const a2 = w2.answerId(), f2 = w2.friendById(w2.placeById(a2).friendId);
  tapPlace(w2, a2);
  until(w2, () => f2.state === 'hop' && f2._seg && f2._seg.hop && f2._seg.hop.t > 0.02);
  const ys = [], sy = [];
  for (let i = 0; i < 14; i++) { w2.update(H); ys.push(f2.y); }
  const d2 = []; for (let i = 2; i < ys.length; i++) d2.push(ys[i] - 2 * ys[i - 1] + ys[i - 2]);
  const g = CFG.hopG * H * H;
  const inAir = d2.filter(d => Math.abs(d - g) < 1e-6).length;
  assert.ok(inAir >= 8, 'ballistic: ' + d2.map(d => (d / g).toFixed(2)).join(' '));
  until(w2, () => f2.state === 'seated', 3000);
  for (let i = 0; i < 40; i++) { w2.update(H); sy.push(f2.sy); }
  // after landing: squash (sy < 1) then an overshoot above 1
  const all = [];
  const w3 = roundOf(mkWorld({ age: 4, seed: 23 }), 'animals', 3);
  const a3 = w3.answerId(), f3 = w3.friendById(w3.placeById(a3).friendId);
  tapPlace(w3, a3);
  until(w3, () => { all.push(f3.sy); return f3.state === 'seated'; }, 3000);
  for (let i = 0; i < 40; i++) { w3.update(H); all.push(f3.sy); }
  const minSy = Math.min(...all), maxSy = Math.max(...all.slice(all.indexOf(minSy)));
  assert.ok(minSy < 0.85 && maxSy > 1.03, 'squash ' + minSy.toFixed(3) + ' → stretch ' + maxSy.toFixed(3));
  void f; void sy;
});

test('world: determinism — same seed + bot → same events; frame size does not matter', () => {
  const runIt = (dt) => {
    const w = mkWorld({ age: 5, seed: 77, surprise: true }), b = new FC.Bot(w, { skill: 0.7, seed: 3 }), all = [];
    let t = 0; while (w.state !== 'sessionDone' && t < 900) { b.step(dt); w.update(dt); t += dt; all.push(...w.drainEvents()); }
    return hashEvents(all);
  };
  const a = runIt(1 / 30), b = runIt(1 / 30);
  assert.strictEqual(a, b);
  // input recorded on sub-steps, replayed with other frame sizes
  const rec = (frame) => {
    const w = mkWorld({ age: 4, seed: 78, surprise: true }), all = [];
    const r = new FC.RNG(5);
    let next = 0;
    while (w.state !== 'sessionDone' && w.time < 900) {
      if (w.phase === 'ask' && w.time >= next) { const id = r.chance(0.7) ? w.answerId() : hiddenWrong(w)[0] || w.answerId(); tapPlace(w, id); next = w.time + 1.5; }
      w.update(frame); all.push(...w.drainEvents());
    }
    return hashEvents(all);
  };
  assert.strictEqual(rec(H), rec(H));
});

test('world: prompt() / answerId() / placeHit() / pipHit() / interactive', () => {
  const w = mkWorld({ age: 4 });
  assert.strictEqual(w.prompt(), null); assert.strictEqual(w.answerId(), null);
  roundOf(w, 'colors', 2);
  const p = w.prompt(); assert.ok(p && p.promptKey === 'p.colors' && p.params.color);
  const a = w.answerId(), pl = w.placeById(a), f = w.friendById(pl.friendId);
  assert.strictEqual(f.clue.color, p.params.color);
  const h = w.placeHit(a); assert.ok(h.x === pl.x && h.h > 0 && h.w === pl.w && Math.abs(h.y + h.h / 2 - pl.y) < 1e-9);
  const ph = w.pipHit(); assert.ok(ph.w > 0 && ph.h === w.layout.pip.h);
  assert.strictEqual(w.interactive, true);
  assert.strictEqual(w.hint(), a); assert.ok(w.drainEvents().some(e => e.type === 'hint' && e.placeId === a));
});

test('world: hidden friends keep the head top peekRise above peekY (clipping contract); hint lifts and bobs the clue', () => {
  const w = roundOf(mkWorld({ age: 4, seed: 13 }), 'animals', 3);
  for (const f of w.friends) {
    const p = w.placeById(f.home);
    const head = f.y - f.size;
    assert.ok(Math.abs((p.peekY - head) - CFG.peekRiseFrac * p.fs) < 1e-6, 'head top 0.42·fs above the line');
    assert.strictEqual(f.place, p.id);
  }
  const a = w.answerId(), f = w.friendById(w.placeById(a).friendId), y0 = f.y;
  w.hint(); run(w, 1.0);
  assert.ok(f.y < y0 - 5, 'a hinted friend peeks a little higher');
});

test('world: a small friend (size round) still shows 0.42·fs of itself above the line (eyes + ears)', () => {
  const w = roundOf(mkWorld({ age: 3, seed: 14 }), 'size', 2);
  const sm = w.friends.find(f => f.clue.size === 'small'), p = w.placeById(sm.home);
  assert.ok(Math.abs(p.peekY - (sm.y - sm.size) - CFG.peekRiseFrac * p.fs) < 1e-6);
  assert.ok((p.peekY - (sm.y - sm.size)) / sm.size >= 0.6, 'most of the small head shows');
});

test('world: Pip / empty-place taps do not reset the idle help; the 3rd one in an ask glows the answer', () => {
  const w = roundOf(mkWorld({ age: 4, seed: 15 }), 'animals', 3);
  const a = w.answerId(); tapPlace(w, a); until(w, () => w.phase === 'ask'); evs(w);
  run(w, 5);
  const t0 = w._idleT, ph = w.pipHit();
  w.pointerDown(ph.x, ph.y); w.pointerUp(ph.x, ph.y);
  assert.ok(w._idleT >= t0, 'Pip tap keeps the idle clock');
  tapPlace(w, a);
  assert.ok(w._idleT >= t0, 'empty tap keeps the idle clock');
  assert.ok(!evs(w).some(e => e.type === 'hint'));
  w.pointerDown(ph.x, ph.y); w.pointerUp(ph.x, ph.y);
  const h = evs(w).find(e => e.type === 'hint'); assert.ok(h && h.placeId === w.answerId(), '3rd soft tap → hint');
  run(w, 7.2); assert.ok(evs(w).some(e => e.type === 'idle'), 'idle at 12 s despite the taps');
});

test('world: bench seats sit left of the flame column and clear of Pip; landscape front row clear of Pip / the camp', () => {
  for (const v of VIEWPORTS) for (const age of [3, 4, 6]) {
    const L = FC.World.computeLayout(v.W, v.H, v.ins, {}, age), fh = CFG.flameHalf * L.camp.w;
    const pr = L.pip.x + L.pip.w / 2;
    for (const S of L.bench) {
      assert.ok(S.x + L.seatSize / 2 <= L.camp.x - fh + 1e-6, v.name + ': seat in the flames');
      assert.ok(S.x - L.seatSize / 2 >= pr - 1e-6, v.name + ': seat over Pip ' + (S.x - L.seatSize / 2) + ' < ' + pr);
    }
    if (!L.portrait) {
      assert.ok(L.field.x0 - CFG.objHalf * L.spotW >= pr - 1, v.name + ': front row over Pip');
      assert.ok(L.field.x1 + CFG.objHalf * L.spotW <= L.camp.x - fh + 1, v.name + ': front row over the flames');
    } else assert.ok(L.gather.x1 <= L.camp.x - 0.6 * L.camp.w + 1e-6, 'portrait gather line ends left of the fire');
  }
});

test('world: a popping / jumping friend never goes under the bubble / HUD (portrait back row)', () => {
  let n = 0;
  for (const v of [VIEWPORTS[3], VIEWPORTS[7], VIEWPORTS[5], VIEWPORTS[10]]) for (let s = 0; s < 6; s++) {
    const w = roundOf(mkWorld({ age: 4, seed: 50 + s, vp: v }), 'animals', 3);
    const keeps = [w.layout.bubble, w.layout.hud];
    for (let k = 0; k < 3; k++) {
      const a = w.answerId(); if (!a) break;
      const f = w.friendById(w.placeById(a).friendId);
      tapPlace(w, a);
      until(w, () => {
        if (f.state === 'jump' || f.state === 'pop') for (const K of keeps) {
          if (f.x + f.size / 2 > K.x && f.x - f.size / 2 < K.x + K.w) assert.ok(f.y - f.size * f.sy >= K.y + K.h, v.name + ': ' + f.state + ' under a keep-out ' + (f.y - f.size * f.sy).toFixed(0) + ' < ' + (K.y + K.h));
        }
        return f.state === 'seated' || f.state === 'dance' || (w.phase === 'ask' && f.state !== 'jump' && f.state !== 'pop');
      }, 4000);
      n++;
      if (w.ask >= w.asks) break;
      until(w, () => w.phase === 'ask', 4000);
    }
  }
  assert.ok(n > 20);
});

test('world: spots.json → CONFIG.peekY (applySpots) moves the clip line', () => {
  const before = Object.assign({}, CFG.peekY);
  const n = FC.World.applySpots({ bush: { peekY: 72, season: 0 }, junk: { nope: 1 } });
  assert.strictEqual(n, 1); assert.strictEqual(CFG.peekY.bush, 72);
  Object.assign(CFG.peekY, before);
});

// ======================================================================== bot / weather
test('bot: answers right with p ≈ skill, taps the squirrel sometimes, talks', () => {
  let right = 0, wrong = 0, talks = 0, crit = 0;
  for (let s = 0; s < 3; s++) {
    const r = botSession({ age: 5, seed: 300 + s, skill: 0.7 });
    right += r.b.stats.right; wrong += r.b.stats.wrong; talks += r.b.stats.talks; crit += r.b.stats.critter;
  }
  const p = right / (right + wrong);
  assert.ok(p > 0.6 && p < 0.85, 'right share ' + p.toFixed(2));
  assert.ok(talks >= 10);
  void crit;
});

test('weather: 4 seasons, hex ambient, 2.5 s crossfade, night party, cap 120, deterministic', () => {
  const wx = new FC.Weather({ width: 1280, height: 720, seed: 3 });
  const sprites = new Set(FC.Weather.SPRITES.concat(['butterfly']));
  for (let m = 0; m < 4; m++) {
    wx.setWeather(m);
    for (let k = 0; k < 600; k++) { wx.update(1 / 60); assert.ok(wx.particles.length <= 120); }
    const a = wx.ambient;
    for (const key of ['skyTop', 'skyBottom']) assert.ok(/^#[0-9A-F]{6}$/.test(a[key]), key);
    for (const key of ['sun', 'sunX', 'sunY', 'darkness', 'wind', 'gust']) assert.ok(isFinite(a[key]), key);
    assert.strictEqual(a.skyTop, FC.Weather.SKY[m].top); assert.strictEqual(a.mountains, FC.Weather.NAMES[m]);
    assert.ok(wx.particles.every(p => sprites.has(p.sprite)), 'known sprites');
    for (let k = 0; k < 6; k++) wx.burst(640, 360, { kind: ['confetti', 'puff', 'sparkle', 'stars', 'rustle', 'embers'][k], n: 30 });
    assert.ok(wx.particles.length <= 120);
    for (let k = 0; k < 200; k++) wx.update(1 / 60);
  }
  const kinds = s => { const x = new FC.Weather({ seed: 4, weather: s }); for (let k = 0; k < 300; k++) x.update(1 / 60); return new Set(x.particles.map(p => p.sprite)); };
  assert.ok(kinds(0).has('petal') && kinds(0).has('butterfly')); assert.ok(kinds(1).has('seed'));
  assert.ok(kinds(2).has('leaf_a') && kinds(2).has('leaf_b')); assert.ok(kinds(3).has('snow'));
  wx.setWeather(1); for (let k = 0; k < 75; k++) wx.update(1 / 60); const mid = wx.ambient.skyTop; for (let k = 0; k < 78; k++) wx.update(1 / 60);
  assert.ok(mid !== FC.Weather.SKY[3].top && mid !== FC.Weather.SKY[1].top); assert.strictEqual(wx.ambient.skyTop, FC.Weather.SKY[1].top);
  wx.setWeather(3, { instant: true }); wx.setNight(true); for (let k = 0; k < 160; k++) wx.update(1 / 60);
  assert.ok(Math.abs(wx.ambient.darkness - 0.25) < 1e-9);
  // autumn leaves are gusty: wind varies
  const au = new FC.Weather({ seed: 2, weather: 2 }); let wmin = 1e9, wmax = -1e9;
  for (let k = 0; k < 60 * 15; k++) { au.update(1 / 60); wmin = Math.min(wmin, au.ambient.wind); wmax = Math.max(wmax, au.ambient.wind); }
  assert.ok(wmax - wmin > 15, 'gusts');
  const p = new FC.Weather({ seed: 9 }), q = new FC.Weather({ seed: 9 });
  for (let k = 0; k < 300; k++) { p.update(1 / 60); q.update(1 / 60); }
  assert.deepStrictEqual(p.particles, q.particles);
});

// ======================================================================== run
let pass = 0, fail = 0;
const t0 = Date.now();
for (const t of tests) {
  const t1 = Date.now();
  try { t.fn(); pass++; console.log('ok   ' + t.name + '  (' + ((Date.now() - t1) / 1000).toFixed(1) + ' s)'); }
  catch (e) { fail++; console.log('FAIL ' + t.name + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n     ') : e)); }
}
console.log(`\n${pass} passed, ${fail} failed (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(fail ? 1 : 0);
