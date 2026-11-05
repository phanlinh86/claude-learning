#!/usr/bin/env node
// Bop's Rainy Band — headless unit tests for rng / content / world / weather / bot.
// Run from projects/education-game/frog-rainy-band:   node tests/unit/run.js   (exit 1 on any failure)
// (tests/unit/i18n_voice.test.js is the voice engineer's suite and runs on its own.)
'use strict';
const assert = require('assert');
const crypto = require('crypto');
const { load } = require('./load');

const RB = load();
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const H = 1 / 120;
const AGES = [3, 4, 5, 6, 7];
const LANGS = ['en', 'vi'];
const C = RB.Content;
const CFG = RB.CONFIG;
const TOPICS = C.TOPICS;
const J = v => JSON.parse(JSON.stringify(v));   // objects from the vm sandbox have other prototypes
assert.deepStrictEqual = ((orig) => (a, b, m) => orig(J(a), J(b), m))(assert.deepStrictEqual);

// independent copies of the DESIGN tables (§5.1)
const NOTES = { 3: [2, 2, 3, 3], 4: [2, 3, 4, 4], 5: [3, 4, 4, 5], 6: [4, 4, 5, 5], 7: [4, 4, 5, 5] };
const COUNT_NOTES = { 3: [2, 2, 2, 2], 4: [2, 3, 3, 3], 5: [2, 3, 3, 3], 6: [3, 3, 3, 3], 7: [3, 3, 3, 3] };   // MECHANICS.md: counting songs are shorter
const CLASH = [['blue', 'purple'], ['red', 'green'], ['yellow', 'orange'], ['green', 'orange']];
function membersWant(topic, age, ri) {
  if (topic === 'count' && ri <= 1) return 0;
  if (topic === 'size' || ri === 0 || age <= 3) return 2;
  if (topic === 'count') return 3;
  return age >= 6 && ri >= 2 ? 4 : 3;
}

const VIEWPORTS = [
  { W: 1556, H: 720, ins: null, name: 'iPhone landscape' },
  { W: 1556, H: 720, ins: { top: 0, right: 108, bottom: 38, left: 108 }, name: 'iPhone landscape notch' },
  { W: 720, H: 1556, ins: null, name: 'iPhone portrait' },
  { W: 720, H: 1556, ins: { top: 108, right: 0, bottom: 62, left: 0 }, name: 'iPhone portrait notch' },
  { W: 960, H: 720, ins: null, name: 'iPad landscape 4:3' },
  { W: 960, H: 720, ins: { top: 32, right: 0, bottom: 27, left: 0 }, name: 'iPad (1366×1024) landscape insets' },
  { W: 720, H: 960, ins: null, name: 'iPad portrait' },
  { W: 720, H: 960, ins: { top: 32, right: 0, bottom: 27, left: 0 }, name: 'iPad (1024×1366) portrait insets' },
  { W: 1280, H: 720, ins: null, name: '16:9' },
  { W: 1600, H: 720, ins: null, name: '1600×720' },
  { W: 720, H: 1600, ins: { top: 44, right: 0, bottom: 34, left: 0 }, name: '720×1600 tall insets' },
  { W: 1080, H: 720, ins: { top: 24, right: 44, bottom: 20, left: 44 }, name: 'iPad Pro landscape insets' },
  { W: 720, H: 1036, ins: { top: 21, right: 0, bottom: 18, left: 0 }, name: 'iPad 820×1180 portrait' },
  { W: 720, H: 1280, ins: { top: 37, right: 0, bottom: 0, left: 0 }, name: 'iPhone SE portrait' },
  { W: 1280, H: 720, ins: { top: 0, right: 37, bottom: 21, left: 37 }, name: 'iPhone SE landscape' }
];
const VP = VIEWPORTS[4];

// ---------- helpers ----------
function mkWorld(o) {
  o = o || {};
  const cfg = Object.assign(o.surprise ? {} : { surpriseTypes: [] }, o.config || {});
  const w = new RB.World({ seed: o.seed || 1, age: o.age || 4, lang: o.lang || 'en', config: cfg });
  const v = o.vp || VP;
  w.setViewport(v.W, v.H, v.ins);
  w.newSession(); w.drainEvents();
  return w;
}
/** Starts round `ri` of `topic` directly (skips the intro) and runs to the first open ask (phase ask or beats). */
function roundOf(w, topic, ri, surprise) {
  w.levels = [topic, topic, topic, topic];
  w.startLevel(0); w.round = ri || 0;
  w.cfg.surpriseRound = ri || 0; w.cfg.surpriseTypes = surprise ? [surprise] : [];
  w._beginRound();
  until(w, () => w.phase === 'ask' || w.phase === 'beats');
  return w;
}
function run(w, s, each) { const n = Math.round(s / H); for (let i = 0; i < n; i++) { if (each) each(i); w.update(H); } }
function until(w, fn, max) { let n = 0; while (!fn() && n++ < (max || 36000)) w.update(H); assert.ok(fn(), 'condition not reached (now ' + w.state + '/' + w.phase + ')'); }
function untilAsk(w) { until(w, () => w.phase === 'ask'); }
function evs(w) { return w.drainEvents(); }
function rightM(w) { return w.memberById(w.answerId()); }
function wrongM(w) { const a = w.answerId(); return w.members.find(m => m.id !== a && m.state === 'rest'); }
function tapBox(w, b, dx, dy) { const x = b.x + (dx || 0), y = b.y + (dy || 0); const d = w.pointerDown(x, y); const u = w.pointerUp(x, y); return u || d; }
function tapM(w, m) { return tapBox(w, w.memberHit(m)); }
function boxesOverlap(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
function centreBox(b) { return { x: b.x - b.w / 2, y: b.y - b.h / 2, w: b.w, h: b.h }; }
function hashEvents(list) {
  const h = crypto.createHash('sha1');
  for (const e of list) h.update(JSON.stringify(e, (k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)));
  return h.digest('hex').slice(0, 16);
}
/** A whole session played by RB.Bot at frame dt; → { w, events } */
function botSession(o) {
  const w = new RB.World({ seed: o.seed, age: o.age, lang: o.lang || 'en', config: o.config || {} });
  const v = o.vp || VP; w.setViewport(v.W, v.H, v.ins);
  const bot = new RB.Bot(w, { skill: o.skill === undefined ? 0.8 : o.skill, seed: o.seed + 7 });
  w.newSession();
  const dt = o.dt || 1 / 30, all = [];
  let t = 0;
  while (w.state !== 'sessionDone' && t < (o.cap || 1500)) { bot.step(dt); w.update(dt); t += dt; for (const e of w.drainEvents()) all.push(e); }
  return { w, events: all, t };
}

// =====================================================================================================================
// RNG
test('rng: deterministic, ranges, string seeds', () => {
  const a = new RB.RNG(42), b = new RB.RNG(42);
  for (let i = 0; i < 100; i++) assert.strictEqual(a.next(), b.next());
  const r = new RB.RNG('hello');
  for (let i = 0; i < 1000; i++) { const v = r.int(2, 5); assert.ok(v >= 2 && v <= 5 && Number.isInteger(v)); const f = r.float(1, 2); assert.ok(f >= 1 && f < 2); }
  assert.strictEqual(new RB.RNG('x').next(), new RB.RNG('x').next());
});

// =====================================================================================================================
// CONTENT
test('content: palette, animals, shapes, notes per DESIGN', () => {
  assert.deepStrictEqual(RB.ANIMALS, ['duck', 'cat', 'dog', 'cow', 'sheep', 'hen', 'bird', 'pig']);
  assert.deepStrictEqual(RB.SHAPES, ['circle', 'square', 'triangle', 'star', 'heart', 'rect', 'diamond', 'oval']);
  assert.deepStrictEqual(RB.NOTE, { red: 60, orange: 62, yellow: 64, green: 65, blue: 67, purple: 69, pink: 71 });
  assert.strictEqual(RB.PALETTE.purple.dark, '#6840A8'); assert.strictEqual(RB.PALETTE.purple.light, '#D2BDF3');
  assert.strictEqual(RB.PALETTE.red.base, '#E84A4A');
  for (const a of RB.ANIMALS) assert.ok(RB.ANIMAL_SOUND[a], 'sound for ' + a);
  assert.deepStrictEqual(RB.AGE_TOPICS[4], ['colors', 'shapes', 'count', 'animals']);
});

test('content: every topic × age 3–7 × 200 seeds × 4 rounds — solvable, one match, no repeats, colour-blind safe, tables', () => {
  let rounds = 0;
  for (const topic of TOPICS) for (const age of AGES) for (let s = 0; s < 200; s++) {
    const lang = s % 2 ? 'vi' : 'en', rng = new RB.RNG(s * 7919 + age * 31 + topic.length);
    let prevAsk = null, prevKey = null;
    for (let ri = 0; ri < 4; ri++) {
      const r = C.makeRound(topic, { age, lang, rng, roundIndex: ri, avoid: prevAsk, prevMembers: prevKey });
      rounds++;
      const where = `${topic} age ${age} seed ${s} round ${ri}`;
      assert.strictEqual(C.validate(r), null, where);
      assert.strictEqual(r.n, (topic === 'count' ? COUNT_NOTES : NOTES)[age][ri], 'notes per round ' + where);
      assert.strictEqual(r.asks.length, r.n, where);
      assert.strictEqual(r.members.length, membersWant(topic, age, ri), 'members ' + where);
      if (topic === 'count' && ri <= 1) {
        assert.strictEqual(r.mode, 'drum');
        assert.ok(r.band.length >= 2 && r.band.length <= 3 && r.band.every(b => b.plain), 'plain band ' + where);
        r.asks.forEach((a, q) => {
          assert.strictEqual(a.mode, 'drum'); assert.strictEqual(a.answer, -1); assert.strictEqual(a.promptKey, 'p.drum');
          assert.strictEqual(a.params.n, a.n);
          const R = C.DRUM_RANGE[age]; assert.ok(a.n >= R[0] && a.n <= R[1], 'drum n ' + a.n + ' ' + where);
          if (q) assert.ok(a.n > r.asks[q - 1].n, 'drum counts ascend ' + where);
        });
        if (ri === 0) assert.strictEqual(r.asks[0].n, C.DRUM_RANGE[age][0], 'round 0 starts at the bottom of the range');
        if (age === 4 && ri === 0) assert.deepStrictEqual(r.asks.map(a => a.n), [1, 2]);
        if (age === 4 && ri === 1) assert.deepStrictEqual(r.asks.map(a => a.n), [2, 3, 4], 'age 4 round 1: 2..4');
      } else {
        const k = r.members.length;
        assert.strictEqual(r.band, r.members);
        // exactly one member matches each ask (independent check for the visual kinds)
        r.asks.forEach((a, q) => {
          const hits = r.members.filter(m => C.matches(a, m, lang)).length;
          assert.strictEqual(hits, 1, `one match ask ${q} ${where}`);
          const A = r.members[a.answer];
          if (a.promptKey === 'p.colors') assert.strictEqual(r.members.filter(m => m.color === a.params.color).length, 1);
          if (a.promptKey === 'p.shapes') assert.strictEqual(r.members.filter(m => m.shape === a.params.shape).length, 1);
          if (a.promptKey === 'p.listen') { assert.strictEqual(a.mode, 'listen'); assert.strictEqual(A.n, a.n); assert.strictEqual(r.members.filter(m => m.n === a.n).length, 1); }
          if (a.promptKey === 'p.add') assert.strictEqual(A.n, a.params.a + a.params.b);
          if (a.promptKey === 'p.sub') assert.strictEqual(A.n, a.params.a - a.params.b);
          if (a.promptKey === 'p.oddeven') assert.strictEqual(r.members.filter(m => m.n % 2 === (a.params.parity === 'odd' ? 1 : 0)).length, 1);
          if (q) assert.notStrictEqual(a.answer, r.asks[q - 1].answer, 'no consecutive repeat ' + where);
          assert.strictEqual(a.nameKind, A.nameKind); assert.strictEqual(a.nameValue, A.nameValue);
        });
        if (r.n >= k) assert.strictEqual(new Set(r.asks.map(a => a.answer)).size, k, 'every member asked ' + where);
        const cs = [...new Set(r.members.filter(m => m.color).map(m => m.color))];
        if (age < 5) {
          for (const [x, y] of CLASH) assert.ok(!(cs.includes(x) && cs.includes(y)), `colour-blind pair ${x}+${y} ${where}`);
          assert.ok(!cs.includes('pink'), 'no pink below 5');
          if (topic === 'shapes') assert.strictEqual(cs.length, k, 'shapes in different colours ≤ 4');
        }
        if (topic === 'size') { assert.strictEqual(r.members[0].color, r.members[1].color); assert.notStrictEqual(r.members[0].size, r.members[1].size);
          const big = r.members.find(m => m.size === 'big'), small = r.members.find(m => m.size === 'small'); assert.ok(big.pitch < small.pitch, 'big = low'); }
        r.members.forEach(m => { assert.ok(Number.isFinite(m.pitch)); if (m.kind === 'color') assert.strictEqual(m.pitch, RB.NOTE[m.color]); });
        if (topic === 'count') r.members.forEach(m => assert.ok(!m.showDots || (age <= 5 && m.n <= 5), 'dots only for small numbers'));
        if (prevKey) assert.notStrictEqual(r.key, prevKey, 'new members every round ' + where);
      }
      if (prevAsk && prevAsk.mode !== 'drum') assert.ok(!(r.asks[0].promptKey === prevAsk.promptKey && JSON.stringify(r.asks[0].params) === JSON.stringify(prevAsk.params)), 'first ask repeats the last ' + where);
      prevAsk = r.asks[r.asks.length - 1]; prevKey = r.key;
    }
  }
  assert.ok(rounds >= 44000);
});

test('content: animals by sound from round 2 at age ≥ 4; initial members have distinct first letters', () => {
  let sound = 0, total = 0;
  for (let s = 0; s < 200; s++) for (const age of [3, 4, 6]) for (let ri = 0; ri < 4; ri++) {
    const r = C.makeRound('animals', { age, lang: 'en', rng: new RB.RNG(s + ri * 1000 + age), roundIndex: ri });
    r.asks.forEach(a => { total++; if (a.promptKey === 'p.sound') { sound++; assert.ok(age >= 4 && ri >= 2); } });
  }
  assert.ok(sound > total * 0.12, 'some sound asks: ' + sound + '/' + total);
  for (const lang of LANGS) for (let s = 0; s < 200; s++) {
    const r = C.makeRound('initial', { age: 7, lang, rng: new RB.RNG(s), roundIndex: 2 });
    const ini = r.members.map(m => m.initial);
    assert.strictEqual(new Set(ini).size, ini.length);
    assert.ok(ini.every(Boolean), 'every initial member has a word in ' + lang);
  }
});

test('content: makeTalk for every topic × age: answer among ≤ 5 distinct choices', () => {
  for (const topic of TOPICS) for (const age of AGES) for (const lang of LANGS) for (let s = 0; s < 40; s++) {
    const t = C.makeTalk(topic, { age, lang, rng: new RB.RNG(s * 13 + age) });
    assert.strictEqual(t.promptKey, 'talk.' + topic);
    assert.ok(t.choices.length >= 2 && t.choices.length <= 5);
    assert.strictEqual(t.choices.filter(c => c.id === t.answerId).length, 1);
    assert.strictEqual(new Set(t.choices.map(c => c.id)).size, t.choices.length);
    assert.strictEqual(new Set(t.choices.map(c => C.itemKey(c))).size, t.choices.length, 'distinct pictures ' + topic);
  }
});

test('content: topicsFor rotates chapter topics between sessions', () => {
  for (const age of AGES) {
    assert.deepStrictEqual(C.topicsFor(age), RB.AGE_TOPICS[age]);
    const rng = new RB.RNG(age);
    let last = null;
    for (let i = 0; i < 6; i++) {
      const t = C.topicsFor(age, rng, last);
      assert.strictEqual(t.length, 4); assert.strictEqual(new Set(t).size, 4);
      t.forEach(x => assert.ok(RB.AGE_POOLS[age].includes(x)));
      if (last) { assert.notStrictEqual(t[0], last[0]); assert.notDeepStrictEqual(J(t), J(last)); }
      last = t;
    }
  }
});

// =====================================================================================================================
// LAYOUT
test('layout: slots, sheet, card, drum, Bop inside the safe area; nothing under the HUD / bubble; spacing ≥ S + 24, S ≥ 112', () => {
  for (const v of VIEWPORTS) for (const k of [2, 3, 4]) for (const n of [2, 3, 4, 5]) for (const count of [false, true]) {
    const L = RB.World.computeLayout(v.W, v.H, v.ins, {}, k, n, count), ins = L.ins, where = `${v.name} k${k} n${n}${count ? ' count' : ''}`;
    const safe = { l: ins.left, t: ins.top, r: v.W - ins.right, b: v.H - ins.bottom };
    assert.ok(L.S >= 112, 'S ≥ 112 ' + where + ' S=' + L.S);
    if (k < 4) assert.ok(L.S >= 132 || v.W <= 960 || L.portrait, 'roomy S ' + where);
    const hud = L.hud, bub = L.bubble;
    assert.ok(hud.x >= v.W - ins.right - 160 - 1e-9);
    L.slots.forEach((s, i) => {
      assert.ok(s.x - L.S / 2 >= safe.l && s.x + L.S / 2 <= safe.r, 'slot x inside ' + where);
      assert.ok(s.y - L.S / 2 >= safe.t && s.y + L.S / 2 <= safe.b, 'slot y inside ' + where);
      if (i) assert.ok(s.x - L.slots[i - 1].x >= L.S + 24 - 1e-6, 'spacing ' + where + ' ' + (s.x - L.slots[i - 1].x));
      const hb = { x: s.x - (0.6 * L.S + 14), y: s.y - (0.6 * L.S + 14), w: 2 * (0.6 * L.S + 14), h: 2 * (0.6 * L.S + 14) };
      assert.ok(!boxesOverlap(hb, hud), 'member under the HUD ' + where);
      assert.ok(!boxesOverlap(hb, bub), 'member under the bubble ' + where);
      assert.ok(Math.abs(s.y - (L.stage.y - 38 - L.S / 2)) < 1e-6, 'members sit on the stools');
      const D = L.bigDrum, drawn = { x: D.x - D.r, y: D.y - 0.75 * D.r, w: 2 * D.r, h: 1.5 * D.r };
      assert.ok(!boxesOverlap({ x: s.x - L.S / 2, y: s.y - L.S / 2, w: L.S, h: L.S }, drawn), 'member over the big drum ' + where);
    });
    assert.strictEqual(L.sheet.slots.length, n);
    L.sheet.slots.forEach((s, i) => {
      const nb = { x: s.x - L.noteR, y: s.y - L.noteR, w: 2 * L.noteR, h: 2 * L.noteR };
      assert.ok(nb.x >= safe.l && nb.x + nb.w <= safe.r && nb.y >= safe.t, 'note inside ' + where);
      assert.ok(!boxesOverlap(nb, hud) && !boxesOverlap(nb, bub), 'note under the HUD / bubble ' + where);
      assert.ok(s.y + L.noteR < L.slots[0].y - L.S / 2 - 20, 'the sheet floats above the band ' + where);
      if (i) assert.ok(s.x - L.sheet.slots[i - 1].x >= 2 * L.noteR + 8, 'notes apart ' + where);
    });
    const cc = L.countCard;
    assert.ok(cc.x >= safe.l && cc.x + cc.w <= safe.r && cc.y >= safe.t, 'card inside ' + where);
    assert.ok(!boxesOverlap(cc, bub) && !boxesOverlap(cc, hud), 'card under the bubble / HUD ' + where);
    if (count) {
      L.slots.forEach(s => assert.ok(!boxesOverlap(cc, { x: s.x - L.S / 2, y: s.y - L.S / 2, w: L.S, h: L.S }), 'card over a member ' + where));
      L.sheet.slots.forEach(s => assert.ok(!boxesOverlap(cc, { x: s.x - L.noteR, y: s.y - L.noteR, w: 2 * L.noteR, h: 2 * L.noteR }), 'card over a note ' + where));
    }
    const D = L.bigDrum;
    assert.ok(D.x - D.r >= safe.l && D.x + D.r <= safe.r && D.y + 0.75 * D.r <= safe.b, 'big drum inside ' + where);
    assert.ok(L.bop.x - 0.3 * L.bop.h >= safe.l - 30 && L.bop.y <= safe.b, 'Bop inside ' + where);
    assert.ok(L.stage.x0 >= safe.l && L.stage.x1 <= safe.r && L.stage.y < L.groundY);
  }
});

test('layout: logicalSize short-side rule', () => {
  assert.deepStrictEqual(RB.World.logicalSize(1366, 1024), { W: 960, H: 720 });
  assert.deepStrictEqual(RB.World.logicalSize(852, 393), { W: 1561 > 1600 ? 1600 : 1561, H: 720 });
  assert.deepStrictEqual(RB.World.logicalSize(393, 852), { W: 720, H: 1561 });
});

// =====================================================================================================================
// WORLD FLOW
test('world: a bot plays every age to sessionDone (en + vi, 3 viewports), no stuck state, stars add up', () => {
  for (const age of AGES) for (const [i, v] of [VIEWPORTS[1], VIEWPORTS[3], VIEWPORTS[5]].entries()) {
    const { w, events, t } = botSession({ seed: 100 + age * 10 + i, age, lang: i % 2 ? 'vi' : 'en', vp: v });
    assert.strictEqual(w.state, 'sessionDone', `age ${age} ${v.name} ended in ${w.state}/${w.phase} after ${t.toFixed(0)} s`);
    const rd = events.filter(e => e.type === 'roundDone'), talks = events.filter(e => e.type === 'talkResult');
    const sum = rd.reduce((a, e) => a + e.stars, 0) + talks.filter(e => e.correct).length;
    assert.strictEqual(w.stars, sum);
    assert.strictEqual(events.filter(e => e.type === 'levelDone').length, 4);
    assert.ok(rd.length >= 12, 'rounds ' + rd.length);
    // every note: play / drumDone → note; every round: songStart, n songNotes, songEnd, roundDone
    assert.strictEqual(events.filter(e => e.type === 'play' || e.type === 'drumDone').length, events.filter(e => e.type === 'note').length);
    assert.strictEqual(events.filter(e => e.type === 'songStart').length, rd.length);
    assert.strictEqual(events.filter(e => e.type === 'songNote').length, events.filter(e => e.type === 'note').length);
    // events main may place an effect on carry x, y
    const XY = ['deal', 'ask', 'beat', 'beatsDone', 'replayBeats', 'play', 'note', 'wrong', 'locked', 'hint', 'idle', 'drumTap', 'drumDone', 'boom',
      'pokeBop', 'songStart', 'songNote', 'songEnd', 'roundDone', 'clearNote', 'snail', 'snailTap', 'snailRing', 'shower', 'raindrop'];
    for (const e of events) if (XY.includes(e.type)) assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y), e.type + ' without x, y');
  }
});

test('world: states and phases follow intro → round(deal, ask, play, song) → roundDone(clear) → … → talk → levelDone', () => {
  const w = mkWorld({ seed: 3, age: 4 });
  assert.strictEqual(w.state, 'intro');
  until(w, () => w.state === 'round');
  assert.strictEqual(w.phase, 'deal');
  const ev = evs(w);
  assert.ok(ev.find(e => e.type === 'round'));
  untilAsk(w);
  const ask = evs(w).find(e => e.type === 'ask');
  assert.ok(ask && ask.first && ask.mode === 'pick');
  assert.ok(w.members.every(m => m.state === 'rest'));
  assert.deepStrictEqual(w.prompt().promptKey, ask.promptKey);
  assert.strictEqual(tapM(w, rightM(w)), 'play');
  assert.strictEqual(w.phase, 'play');
  assert.strictEqual(w.prompt(), null);
  assert.strictEqual(w.flyNotes.length, 1);
  until(w, () => w.phase === 'ask' || w.phase === 'song');
  assert.ok(w.sheet.notes[0] && w.sheet.notes[0].color);
});

test('world: tap vs slide vs hold; tapMoveMin widens the slop', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'colors', 1);
  const m = rightM(w), b = w.memberHit(m);
  // a slide (60 px) does nothing
  assert.strictEqual(w.pointerDown(b.x, b.y), m.id);
  w.update(0.05); w.pointerMove(b.x + 60, b.y); w.update(0.05);
  assert.strictEqual(w.pointerUp(b.x + 60, b.y), null);
  // a long hold (0.7 s) does nothing
  w.pointerDown(b.x, b.y); run(w, 0.7); assert.strictEqual(w.pointerUp(b.x, b.y), null);
  // a press shows a tiny squash, then a short wobbly tap (30 px) plays
  w.pointerDown(b.x, b.y); run(w, 0.15);
  assert.ok(m.q > 0.03, 'press squash ' + m.q);
  w.pointerMove(b.x + 30, b.y); run(w, 0.1);
  assert.strictEqual(w.pointerUp(b.x + 30, b.y), 'play');
  // tapMoveMin from main: 45 px still a tap when the slop is 50
  const w2 = roundOf(mkWorld({ age: 4 }), 'colors', 1);
  w2.tapMoveMin = 50;
  const b2 = w2.memberHit(rightM(w2));
  w2.pointerDown(b2.x, b2.y); w2.pointerMove(b2.x + 45, b2.y);
  assert.strictEqual(w2.pointerUp(b2.x + 45, b2.y), 'play');
  // cancelDrag drops the press
  const w3 = roundOf(mkWorld({ age: 4 }), 'colors', 1), b3 = w3.memberHit(rightM(w3));
  w3.pointerDown(b3.x, b3.y); w3.cancelDrag();
  assert.strictEqual(w3.pointerUp(b3.x, b3.y), null);
});

test('world: wrong → wobble + lock (locked event), right after the lock plays', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'colors', 1);
  evs(w);
  const bad = wrongM(w), good = rightM(w);
  assert.strictEqual(tapM(w, bad), 'wrong');
  const e = evs(w).find(x => x.type === 'wrong');
  assert.ok(e && e.memberId === bad.id && e.want.kind === 'color' && e.want.value === good.item.color && e.streak === 1 && Number.isFinite(e.pitch));
  assert.strictEqual(tapM(w, good), 'locked');
  assert.ok(evs(w).find(x => x.type === 'locked' && x.memberId === good.id));
  run(w, CFG.wrongLock + 0.02);
  assert.strictEqual(tapM(w, good), 'play');
  assert.strictEqual(w.misses, 1);
});

test('world: the 2nd miss on an ask hints (glow + ghost hand); hint cooldown for later ones', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'colors', 2);
  evs(w);
  const good = rightM(w), bads = w.members.filter(m => m !== good);
  tapM(w, bads[0]); run(w, 0.7);
  assert.ok(!evs(w).some(e => e.type === 'hint'));
  tapM(w, bads[1]);
  const h = evs(w).find(e => e.type === 'hint');
  assert.ok(h && h.memberId === good.id && Number.isFinite(h.x));
  assert.ok(w.hintHand && w.hintHand.target === good.id);
  run(w, 0.6);
  assert.ok(good.glow > 0.8, 'glow ' + good.glow);
  assert.ok(w.hintHand.alpha > 0.5);
  run(w, 0.2); tapM(w, bads[0]);   // a 3rd miss within the cooldown: no new hint
  assert.ok(!evs(w).some(e => e.type === 'hint'));
  run(w, 0.7);
  assert.strictEqual(tapM(w, good), 'play');
  assert.strictEqual(w.hintHand, null);
});

test('world: idle nudges 12 s, ×1.5 backoff up to 30 s; the 2nd idle hints (idle: true)', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'colors', 1);
  evs(w);
  const times = [], t0 = w.time;
  let hint = null;
  run(w, 100, () => { for (const e of w.drainEvents()) { if (e.type === 'idle') times.push(+(w.time - t0).toFixed(2)); if (e.type === 'hint') hint = hint || e; } });
  assert.ok(Math.abs(times[0] - 12) < 0.05 && Math.abs(times[1] - 30) < 0.05 && Math.abs(times[2] - 57) < 0.05 && Math.abs(times[3] - 87) < 0.05, times.join(','));
  assert.ok(hint && hint.idle, 'the 2nd idle hints');
});

test('world: drum mode — tap the big drum n times, count card, drumDone + note; band drums boom and hint', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'count', 1);
  assert.strictEqual(w.phase, 'ask');
  const a = w.prompt();
  assert.strictEqual(a.mode, 'drum'); assert.strictEqual(a.promptKey, 'p.drum');
  assert.strictEqual(w.answerId(), null);
  assert.ok(w.members.length >= 2 && w.members.every(m => m.item.plain));
  assert.ok(w.countCard && w.countCard.n === a.n && w.countCard.lit === 0);
  evs(w);
  // two band-drum taps: boom + hint on the big drum
  assert.strictEqual(tapM(w, w.members[0]), 'boom');
  assert.strictEqual(tapM(w, w.members[1]), 'boom');
  const ev = evs(w);
  assert.strictEqual(ev.filter(e => e.type === 'boom' && e.member).length, 2);
  const hh = ev.find(e => e.type === 'hint');
  assert.ok(hh && hh.target === 'bigDrum' && hh.memberId === null);
  for (let i = 1; i <= a.n; i++) {
    run(w, 0.4);
    assert.strictEqual(tapBox(w, w.bigDrumHit()), 'drum');
    const e = evs(w);
    const dt = e.find(x => x.type === 'drumTap');
    assert.ok(dt && dt.i === i && dt.n === a.n && Number.isFinite(dt.x));
    assert.strictEqual(w.countCard.lit, i);
    assert.ok(w.bigDrum.hit > 0.9);
    if (i < a.n) assert.strictEqual(w.phase, 'ask'); else { assert.ok(e.find(x => x.type === 'drumDone' && x.n === a.n)); assert.strictEqual(w.phase, 'play'); }
  }
  assert.strictEqual(tapBox(w, w.bigDrumHit()), 'boom');   // extra taps after n: a boom only
  run(w, 0.6);
  assert.ok(evs(w).find(e => e.type === 'note' && e.i === 0));
  assert.ok(w.sheet.notes[0] && w.sheet.notes[0].memberId === null);
  run(w, 0.2);
  assert.strictEqual(w.ask, 1);
  assert.strictEqual(w.bigDrum.count, 0);
  assert.strictEqual(w.countCard.lit, 0);
});

test('world: drum assist — once hinted, a near miss beside the big drum counts', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'count', 0);
  const D = w.layout.bigDrum, x = D.x, y = D.y - 0.75 * D.r - 20 - 40;
  assert.strictEqual(tapBox(w, { x, y }), null);
  assert.strictEqual(w.bigDrum.count, 0);
  w.hint();
  assert.strictEqual(tapBox(w, { x, y }), 'drum');
  assert.strictEqual(w.bigDrum.count, 1);
});

test('world: listen mode — beats every 0.6 s, then pick the number; Bop replays; card lights after the right answer', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'count', 2);
  assert.strictEqual(w.phase, 'beats');
  const a = w.prompt();
  assert.strictEqual(a.mode, 'listen');
  assert.strictEqual(w.answerId(), null, 'no answer while Bop drums');
  assert.ok(w.members.length === 3 && w.members.every(m => m.item.kind === 'number'));
  { const hb = w.memberHit(w.members[0]); w.pointerDown(hb.x, hb.y); assert.strictEqual(w.pointerUp(hb.x, hb.y), null, 'member taps during the beats are ignored'); }
  const beats = [];
  until(w, () => { for (const e of w.drainEvents()) if (e.type === 'beat') beats.push({ i: e.i, t: w.time }); return w.phase === 'ask'; });
  assert.strictEqual(beats.length, a.n);
  for (let i = 1; i < beats.length; i++) assert.ok(Math.abs(beats[i].t - beats[i - 1].t - CFG.beatGap) < 0.02);
  assert.ok(!w.countCard || w.countCard.show < 0.01, 'card hidden while listening');
  // Bop replays the beats
  assert.strictEqual(tapBox(w, w.bopHit()), 'pokeBop');
  const pe = evs(w);
  assert.ok(pe.find(e => e.type === 'replayBeats' && e.n === a.n) && pe.find(e => e.type === 'pokeBop' && e.replay));
  assert.strictEqual(w.phase, 'beats');
  untilAsk(w);
  const good = rightM(w);
  assert.strictEqual(good.item.n, a.n);
  assert.strictEqual(tapM(w, good), 'play');
  run(w, 0.3);
  assert.ok(w.countCard && w.countCard.lit === a.n && w.countCard.show > 0.9);
});

test('world: song playback → songStart, a songNote every 0.45 s (members play), songEnd, roundDone stars 3/2/1', () => {
  for (const misses of [0, 1, 2]) {
    const w = roundOf(mkWorld({ age: 4, seed: 9 }), 'colors', 1);
    let left = misses;
    const all = [];
    until(w, () => {
      for (const e of w.drainEvents()) all.push(e);
      if (w.phase === 'ask' && !w._locked()) {
        if (left > 0) { left--; tapM(w, wrongM(w)); } else tapM(w, rightM(w));
      }
      return w.state === 'roundDone';
    });
    for (const e of w.drainEvents()) all.push(e);
    const ss = all.find(e => e.type === 'songStart'), notes = all.filter(e => e.type === 'songNote'), rd = all.find(e => e.type === 'roundDone');
    assert.ok(ss && ss.n === 3 && notes.length === 3 && all.find(e => e.type === 'songEnd'));
    notes.forEach((e, i) => { assert.strictEqual(e.i, i); assert.ok(e.memberId && Number.isFinite(e.pitch)); });
    assert.strictEqual(rd.stars, [3, 2, 1][misses]);
    // clear: members hop off, notes sparkle away, then the next round
    assert.strictEqual(w.phase, 'clear');
    const t0 = w.time;
    until(w, () => { for (const e of w.drainEvents()) all.push(e); return w.state === 'round'; });
    const cl = all.filter(e => e.type === 'clearNote');
    assert.deepStrictEqual(cl.map(e => e.i), [0, 1, 2]);
    assert.ok(w.time - t0 >= CFG.clearTime - 1e-6 && w.time - t0 < CFG.clearTime + 0.5, 'clear ≈ 0.9 s: ' + (w.time - t0));
    assert.strictEqual(w.round, 2);
    assert.ok(w.sheet.notes.every(x => x === null));
  }
});

test('world: motion — squash with visible overshoot ≈ 0.3 s, damped wobble, ballistic note, hop landing squash', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'colors', 1);
  const m = rightM(w), slot = w.layout.sheet.slots[0];
  tapM(w, m);
  let minSy = 9, maxSy = 0, tMin = 0, settle = null, apex = 1e9;
  const t0 = w.time;
  run(w, 0.6, () => {
    if (m.sy < minSy) { minSy = m.sy; tMin = w.time - t0; }
    if (w.time - t0 > tMin + 0.02) maxSy = Math.max(maxSy, m.sy);
    if (settle === null && w.time - t0 > 0.15 && Math.abs(m.q) < 0.012 && Math.abs(m.qv) < 0.4) settle = w.time - t0;
    if (w.flyNotes[0]) apex = Math.min(apex, w.flyNotes[0].y);
  });
  assert.ok(Math.abs(minSy - 0.82) < 0.03, 'squash sy ' + minSy);
  assert.ok(tMin > 0.03 && tMin < 0.12, 'squash peak time ' + tMin);
  assert.ok(maxSy > 1.02, 'visible overshoot ' + maxSy);
  assert.ok(settle !== null && settle < 0.45, 'settles ' + settle);
  assert.ok(Math.abs(apex - (slot.y - CFG.noteApex)) < 4, 'note apex ' + apex + ' vs ' + (slot.y - CFG.noteApex));
  assert.ok(w.sheet.notes[0], 'note landed by 0.6 s');
  // a wrong member wobbles to ≈ ±0.25 rad and calms down within ≈ 0.6 s
  const w2 = roundOf(mkWorld({ age: 4 }), 'colors', 1), bad = wrongM(w2);
  tapM(w2, bad);
  let peak = 0, after = 0;
  const s0 = w2.time;
  run(w2, 0.8, () => { const wob = Math.abs(bad.wob); if (w2.time - s0 < 0.3) peak = Math.max(peak, wob); if (w2.time - s0 > 0.6) after = Math.max(after, wob); });
  assert.ok(Math.abs(peak - 0.25) < 0.02, 'wobble peak ' + peak);
  assert.ok(after < 0.05, 'wobble decays ' + after);
  // hop-in landing squash ≈ sy 0.8
  const w3 = mkWorld({ age: 4 });
  until(w3, () => w3.state === 'round');
  let ls = 9;
  until(w3, () => { for (const q of w3.members) if (q.state === 'rest' || q.state === 'in') ls = Math.min(ls, q.sy / (1 + 0.02)); return w3.phase === 'ask'; });
  assert.ok(ls > 0.74 && ls < 0.84, 'landing squash ' + ls);
});

test('world: rotation mid-round re-lays out, snaps members, lands flying notes', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'colors', 1);
  tapM(w, rightM(w));
  run(w, 0.1);
  assert.strictEqual(w.flyNotes.length, 1);
  evs(w);
  w.setViewport(720, 1556, { top: 108, right: 0, bottom: 62, left: 0 });
  assert.strictEqual(w.flyNotes.length, 0);
  assert.ok(evs(w).find(e => e.type === 'note'));
  assert.ok(w.layout.portrait);
  w.members.forEach((m, i) => { assert.strictEqual(m.homeX, w.layout.slots[i].x); assert.strictEqual(m.x, m.homeX); });
  until(w, () => w.state === 'roundDone' || (w.phase === 'ask' && tapM(w, rightM(w)) && false));
  // rotate during the deal: members snap onto the stage
  const w2 = mkWorld({ age: 5 });
  until(w2, () => w2.members.some(m => m.state === 'in' && m.arc));
  w2.setViewport(1556, 720, null);
  assert.ok(w2.members.every(m => m.state === 'rest' || m.state === 'wait'));
  until(w2, () => w2.phase === 'ask' || w2.phase === 'beats');
});

test('world: chapter time limit — after ≥ 3 songs and 80 s → Talk time; Talk re-asks every 12 s, glow after the 2nd', () => {
  const w = mkWorld({ age: 4, seed: 4 });
  w.levels = ['colors', 'colors', 'colors', 'colors']; w.startLevel(0);
  // a slow child: answers each ask after 9 s
  until(w, () => { if (w.phase === 'ask' && w.phaseTime > 9) tapM(w, rightM(w)); return w.state === 'talk'; }, 400 * 120);
  assert.strictEqual(w.round, 3);
  assert.strictEqual(w.roundsPerLevel, 3);
  assert.ok(w.time - w.levelStartTime > 80);
  evs(w);
  const asks = [];
  run(w, 37, () => { for (const e of w.drainEvents()) if (e.type === 'talkAsk') asks.push(e); });
  assert.strictEqual(asks.length, 3);
  assert.ok(!asks[0].glowAnswer && asks[1].glowAnswer && w.talk.glowAnswer);
  assert.ok(w.talkAnswer(w.talk.answerId));
  until(w, () => w.state === 'intro');
  assert.strictEqual(w.level, 1);
});

test('world: surprises — snail after the 1st note (tap: ding, rings in the song); shower after the 2nd (6 raindrops)', () => {
  const w = roundOf(mkWorld({ age: 4, surprise: true }), 'colors', 2, 'snail');
  assert.strictEqual(w.surprise, 'snail');
  tapM(w, rightM(w));
  until(w, () => !!w.snail);
  assert.ok(evs(w).find(e => e.type === 'snail'));
  run(w, 1);
  const sh = w.snailHit();
  assert.strictEqual(tapBox(w, sh), 'snail');
  assert.ok(evs(w).find(e => e.type === 'snailTap'));
  const all = [];
  until(w, () => { for (const e of w.drainEvents()) all.push(e); if (w.phase === 'ask') tapM(w, rightM(w)); return w.state === 'roundDone'; });
  assert.ok(all.filter(e => e.type === 'snailRing').length >= 1);
  until(w, () => w.state === 'round');
  assert.strictEqual(w.snail, null);
  const w2 = roundOf(mkWorld({ age: 4, surprise: true }), 'colors', 2, 'shower');
  const ev2 = [];
  until(w2, () => { for (const e of w2.drainEvents()) ev2.push(e); if (w2.phase === 'ask') tapM(w2, rightM(w2)); return w2.state === 'roundDone' && !w2._shower; });
  const s = ev2.find(e => e.type === 'shower'), notes = ev2.filter(e => e.type === 'note');
  assert.ok(s && ev2.indexOf(s) > ev2.indexOf(notes[1]));
  assert.strictEqual(ev2.filter(e => e.type === 'raindrop').length, 6);
  assert.ok(ev2.filter(e => e.type === 'raindrop').every(e => w2.cur.band.length && Number.isFinite(e.pitch)));
  assert.strictEqual(w2.shower, 0);
});

test('world: Bop poke repeats the prompt; boom on the big drum in a pick ask; hit boxes are centre boxes', () => {
  const w = roundOf(mkWorld({ age: 4 }), 'colors', 1);
  evs(w);
  const b = w.bopHit();
  assert.ok(b.w > 100 && b.h > 200);
  assert.strictEqual(tapBox(w, b), 'pokeBop');
  const p = evs(w).find(e => e.type === 'pokeBop');
  assert.strictEqual(p.promptKey, w.prompt().promptKey);
  assert.strictEqual(tapBox(w, w.bigDrumHit()), 'boom');
  assert.strictEqual(w.misses, 0);
  const mh = w.memberHit(w.members[0]);
  assert.strictEqual(mh.w, 2 * (0.6 * w.layout.S + 14));
  assert.ok(boxesOverlap(centreBox(mh), { x: w.members[0].homeX - 1, y: w.members[0].homeY - 1, w: 2, h: 2 }));
});

test('world: determinism — same seed → same events; flow without input is independent of the frame dt', () => {
  const a = botSession({ seed: 77, age: 4 }), b = botSession({ seed: 77, age: 4 });
  assert.strictEqual(hashEvents(a.events), hashEvents(b.events));
  assert.strictEqual(a.w.stars, b.w.stars);
  const c = botSession({ seed: 78, age: 4 });
  assert.notStrictEqual(hashEvents(a.events), hashEvents(c.events));
  function idleRun(dt) {
    const w = mkWorld({ seed: 5, age: 5 }), out = [];
    for (let t = 0; t < 60; t += dt) { w.update(dt); for (const e of w.drainEvents()) out.push(e); }
    return hashEvents(out);
  }
  assert.strictEqual(idleRun(1 / 30), idleRun(1 / 120));
});

test('world: the bot never sees a stuck state across many seeds (age 3–7, skill 0.3 and 1)', () => {
  for (const age of AGES) for (let s = 0; s < 4; s++) for (const skill of [0.3, 1]) {
    const { w, t } = botSession({ seed: 900 + s * 17 + age, age, skill, vp: VIEWPORTS[s % VIEWPORTS.length] });
    assert.strictEqual(w.state, 'sessionDone', `age ${age} seed ${s} skill ${skill}: ${w.state}/${w.phase} at ${t.toFixed(0)} s`);
  }
});

test('world: setAge / setLang apply at the next session; newSession lastTopics rotates', () => {
  const w = mkWorld({ age: 4 });
  const first = w.levels.slice();
  w.setAge(7); w.setLang('vi');
  assert.strictEqual(w.age, 4);
  w.newSession({ lastTopics: first });
  assert.strictEqual(w.age, 7); assert.strictEqual(w.lang, 'vi');
  w.levels.forEach(t => assert.ok(RB.AGE_POOLS[7].includes(t)));
});

// =====================================================================================================================
// WEATHER
test('weather: seasons, particle types match the sprites, splashes on the lawn, cap 160, shower, rainbow, party', () => {
  const wx = new RB.Weather({ width: 1556, height: 720, seed: 3, groundY: 696 });
  const SPR = RB.Weather.SPRITES;
  for (const want of ['drop', 'splash', 'petal', 'leaf_a', 'leaf_b', 'snow', 'sparkle']) assert.ok(SPR.includes(want));
  const seen = {};
  for (let s = 0; s < 4; s++) {
    wx.setWeather(s);
    let max = 0;
    for (let i = 0; i < 500; i++) {
      if (i === 300) wx.setShower(1);
      if (i === 400) { wx.burst(500, 400, { kind: 'confetti', n: 60 }); wx.burst(600, 300, { kind: 'notes', n: 12 }); wx.burst(600, 300, { kind: 'splash' }); }
      wx.update(1 / 60);
      max = Math.max(max, wx.particles.length);
      for (const p of wx.particles) {
        assert.ok(SPR.includes(p.type), 'type ' + p.type);
        assert.strictEqual(p.sprite, p.type);
        assert.ok([p.x, p.y, p.size, p.rot, p.alpha].every(Number.isFinite), 'finite particle');
        assert.ok(p.layer === 'back' || p.layer === 'front');
        if (i >= 250 && i < 300) (seen[s] = seen[s] || new Set()).add(p.type);   // after the 2.5 s crossfade, before the shower
        if (p.type === 'splash' && p.kind === 'splashRing') assert.ok(p.y <= 696 + 7 && p.y >= 696 - 171, 'splash on the lawn ' + p.y);
      }
    }
    assert.ok(max <= RB.Weather.CAP, 'cap ' + max);
    assert.strictEqual(wx.ambient.season, RB.Weather.NAMES[s]);
    assert.ok(wx.ambient.shower > 0.9);
    wx.setShower(0);
    for (let i = 0; i < 200; i++) wx.update(1 / 60);
    assert.ok(wx.ambient.shower < 0.01);
  }
  assert.ok(seen[0].has('drop') && seen[0].has('splash') && seen[0].has('petal'));
  assert.ok(seen[2].has('leaf_a') && seen[2].has('leaf_b') && seen[2].has('drop'));
  assert.ok(seen[3].has('snow') && !seen[3].has('splash'), 'winter: snow, no rain');
  wx.setWeather(1, { instant: true }); for (let i = 0; i < 30; i++) wx.update(1 / 60);
  assert.strictEqual(wx.ambient.rainbow, 1); assert.ok(wx.ambient.sun > 0.9);
  wx.setWeather(3, { instant: true }); assert.strictEqual(wx.ambient.snow, 1); assert.strictEqual(wx.ambient.rain, 0);
  wx.setParty(true, { instant: true }); assert.strictEqual(wx.ambient.snow, 1);
  wx.resize(720, 1556, 1500); for (let i = 0; i < 60; i++) wx.update(1 / 60);
  assert.strictEqual(wx.splashY, 1500);
  // crossfade 2.5 s
  const w2 = new RB.Weather({ width: 960, height: 720 });
  w2.setWeather(2);
  for (let i = 0; i < 60; i++) w2.update(1 / 60);
  assert.ok(w2.ambient.envMix > 0.05 && w2.ambient.envMix < 0.95);
  for (let i = 0; i < 150; i++) w2.update(1 / 60);
  assert.strictEqual(w2.ambient.envMix, 1);
  assert.strictEqual(w2.ambient.skyTop, RB.Weather.SKY[2].top);
});

// =====================================================================================================================
let fail = 0;
const only = process.argv[2];
for (const t of tests) {
  if (only && !t.name.includes(only)) continue;
  const t0 = Date.now();
  try { t.fn(); console.log('  ✓ ' + t.name + ' (' + (Date.now() - t0) + ' ms)'); }
  catch (e) { fail++; console.log('  ✗ ' + t.name + '\n    ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e)); }
}
console.log(fail ? `\n${fail} FAILED` : `\nall ${tests.length} passed`);
process.exit(fail ? 1 : 0);
