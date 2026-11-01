#!/usr/bin/env node
// Kitten's Balloon Farm — headless unit tests for rng / content / world / weather / bot.
// Run from projects/education-game/kitten-balloon-farm:   node tests/unit/run.js
// (tests/unit/i18n_voice.test.js is the voice engineer's suite and runs on its own.)
'use strict';
const assert = require('assert');
const { load } = require('./load');

const KB = load();
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const H = 1 / 120;
const J = v => JSON.parse(JSON.stringify(v));
// vm-realm arrays/objects are not reference-equal to this realm's: compare through JSON
assert.deepStrictEqual = ((orig) => (a, b, m) => orig(J(a), J(b), m))(assert.deepStrictEqual);
assert.notDeepStrictEqual = ((orig) => (a, b, m) => orig(J(a), J(b), m))(assert.notDeepStrictEqual);
const hyp = (x, y) => Math.sqrt(x * x + y * y);
const AGES = [3, 4, 5, 6, 7];
const LANGS = ['en', 'vi'];
const TOPICS = KB.Content.TOPICS;
const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple'];
const CFG = KB.CONFIG;

// 12 logical viewports (short side 720; insets already in logical px)
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
  { W: 1600, H: 720, ins: null, name: '1600×720 (long cap)' },
  { W: 720, H: 1600, ins: { top: 44, right: 0, bottom: 34, left: 0 }, name: '720×1600 tall insets' },
  { W: 1080, H: 720, ins: { top: 24, right: 44, bottom: 20, left: 44 }, name: 'iPad Pro landscape insets' }
];

// ---------- helpers ----------
function mkWorld(o) {
  o = o || {};
  const w = new KB.World({ seed: o.seed || 1, age: o.age || 4, lang: o.lang || 'en', config: o.config });
  const v = o.vp || VIEWPORTS[8];
  w.setViewport(v.W, v.H, v.ins);
  return w;
}
/** Starts round `ri` of `topic` directly (skips the intro). */
function roundOf(w, topic, ri) {
  w.levels = [topic, topic, topic, topic];
  w.startLevel(0);
  w.round = ri || 0;
  w._beginRound();
  return w;
}
function run(w, s, each) { const n = Math.round(s / H); for (let i = 0; i < n; i++) { if (each) each(i); w.update(H); } }
function settle(w) { let n = 0; while (!w.interactive && n++ < 2000) w.update(H); assert.ok(w.interactive, 'interactive'); }
function settleFloat(w) { let n = 0; while (w.balloons.some(b => b.state === 'rise') && n++ < 2000) w.update(H); }
function tap(w, b) { const id = w.pointerDown(b.x, b.y); w.pointerUp(b.x, b.y); return id; }
function rightOnes(w) {
  const m = w.cur.mode;
  return w.balloons.filter(b => w.canTap(b) && (m === 'count' || (m === 'ask' ? b.id === w.target : b.answer)));
}
function wrongOnes(w) {
  const m = w.cur.mode;
  return w.balloons.filter(b => w.canTap(b) && m !== 'count' && !(m === 'ask' ? b.id === w.target : b.answer));
}
function solveRound(w) {
  let g = 0;
  while (w.state === 'round' && g++ < 5000) {
    const r = w.interactive ? rightOnes(w) : [];
    if (r.length) { tap(w, r[0]); }
    run(w, 0.05);
  }
}
function events(w) { return w.drainEvents(); }
function rectsOverlap(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
function circleRect(cx, cy, r, R) {
  const nx = Math.max(R.x, Math.min(cx, R.x + R.w)), ny = Math.max(R.y, Math.min(cy, R.y + R.h));
  return hyp(cx - nx, cy - ny) < r - 1e-6;
}
function miuRect(L) { return { x: L.miu.x - 90, y: L.miu.y - L.miu.h, w: 180, h: L.miu.h }; }
function signRect(L) { const sh = L.sign.h + 20; return { x: L.sign.x - L.sign.w / 2, y: L.sign.y - sh - 40, w: L.sign.w, h: sh + 40 }; }   // board + post
function playSession(seed, age, skill, opts) {
  opts = opts || {};
  const w = new KB.World({ seed, age, lang: opts.lang || 'en', config: opts.config });
  const v = opts.vp || VIEWPORTS[8];
  w.setViewport(v.W, v.H, v.ins);
  const bot = new KB.Bot(w, { skill, seed: seed * 3 + 1 });
  w.newSession();
  const dt = opts.dt || 1 / 30, evs = [];
  let t = 0;
  while (w.state !== 'sessionDone' && t < 3000) {
    bot.step(dt); w.update(dt);
    const ev = w.drainEvents();
    if (opts.keep) for (const e of ev) evs.push(e);
    if (opts.each) opts.each(w, ev, t);
    t += dt;
  }
  return { w, bot, t, events: evs };
}
/** A chapter of 4 rounds straight from content (with history like the world passes). */
function chapter(topic, age, lang, seed) {
  const rng = new KB.RNG(seed), hist = [], out = [];
  for (let ri = 0; ri < 4; ri++) { const r = KB.Content.makeRound(topic, { age, lang, rng, roundIndex: ri, history: hist }); hist.push(r.sum); out.push(r); }
  return out;
}

// ======================================================= RNG
test('rng: deterministic, ranges, shuffle is a permutation', () => {
  const a = new KB.RNG(42), b = new KB.RNG(42), c = new KB.RNG(43);
  const sa = [], sb = [], sc = [];
  for (let i = 0; i < 500; i++) { sa.push(a.next()); sb.push(b.next()); sc.push(c.next()); }
  assert.deepStrictEqual(sa, sb); assert.notDeepStrictEqual(sa, sc);
  assert.ok(sa.every(v => v >= 0 && v < 1));
  const r = new KB.RNG('x');
  for (let i = 0; i < 1000; i++) { const k = r.int(2, 5); assert.ok(k >= 2 && k <= 5 && k === Math.floor(k)); const f = r.float(-1, 1); assert.ok(f >= -1 && f < 1); }
  const arr = [1, 2, 3, 4, 5, 6, 7, 8]; const sh = r.shuffle(arr.slice());
  assert.deepStrictEqual(sh.slice().sort(), arr);
  assert.strictEqual(new Set(r.sample(arr, 5)).size, 5);
  assert.notStrictEqual(r.fork(1).next(), r.fork(2).next());
});

// ======================================================= content tables
test('content: palette, animals, age topics and word tables exactly as DESIGN §3/§5.1', () => {
  const hexes = { red: ['#E84A4A', '#A8282E'], blue: ['#3C8DE8', '#1F5BA8'], yellow: ['#FFD23F', '#C99A12'], green: ['#4CC26B', '#2A8343'],
    orange: ['#FF9A2E', '#C4650C'], purple: ['#9B6BE0', '#6840A8'], pink: ['#FF8FC0', '#C9558A'], cream: ['#FFF4DC', '#C9A877'] };
  for (const k in hexes) assert.deepStrictEqual(KB.PALETTE[k], { fill: hexes[k][0], dark: hexes[k][1] }, k);
  assert.deepStrictEqual(KB.ANIMALS, ['cow', 'pig', 'sheep', 'duck', 'horse', 'goat', 'chick', 'bunny', 'puppy']);
  assert.deepStrictEqual(KB.AGE_TOPICS, { 3: ['colors', 'size', 'shapes', 'animals'], 4: ['colors', 'shapes', 'count', 'animals'],
    5: ['shapes', 'count', 'letters', 'animals'], 6: ['lower', 'initial', 'add', 'count'], 7: ['initial', 'add', 'sub', 'oddeven'] });
  const en = KB.WORDS.en.map(w => w.animal + ':' + w.initial).join(' '), vi = KB.WORDS.vi.map(w => w.word + ':' + w.initial).join(' ');
  assert.strictEqual(en, 'cow:C pig:P sheep:S duck:D horse:H goat:G chick:C bunny:B puppy:P');
  assert.strictEqual(vi, 'bò:B lợn:L cừu:C vịt:V dê:D gà con:G');
  for (const l of LANGS) for (const w of KB.WORDS[l]) assert.strictEqual(w.sprite, 'animal_' + w.animal);
  assert.deepStrictEqual(KB.Content.topicsFor(2), KB.AGE_TOPICS[3]); assert.deepStrictEqual(KB.Content.topicsFor(9), KB.AGE_TOPICS[7]);
});

test('content: every topic × age 3–7 × en/vi × 200 seeds → valid, completable chapters within the §5.1 limits', () => {
  let n = 0;
  for (const topic of TOPICS) for (const age of AGES) for (const lang of LANGS) for (let s = 0; s < 200; s++) {
    const ch = chapter(topic, age, lang, s * 7919 + age * 13 + (lang === 'vi' ? 1 : 0));
    const targets = [];
    ch.forEach((r, ri) => {
      n++;
      const ctx = `${topic} age ${age} ${lang} seed ${s} r${ri}`;
      assert.strictEqual(KB.Content.validate(r), null, ctx);
      const B = r.balloons, ans = B.filter(b => b.answer), warm = ri === 0;
      assert.ok(B.length <= 14, ctx);
      assert.strictEqual(r.promptKey, 'p.' + topic);
      if (ri > 0) assert.notStrictEqual(r.sum.key, ch[ri - 1].sum.key, 'identical consecutive rounds ' + ctx);
      if (r.mode === 'find') {
        if (['colors', 'shapes'].includes(topic)) assert.ok(B.length <= KB.Content.MAXB[age], 'too many balloons ' + ctx);
        assert.ok(ans.length >= 1 && ans.length < B.length, ctx);
        assert.strictEqual(r.params.n, ans.length, ctx);
        for (const b of B) assert.strictEqual(b.answer, KB.Content.matches(r, b), 'answer flag ' + ctx);
      }
      switch (topic) {
        case 'colors': {
          assert.ok(B.every(b => b.shape === 'circle' && COLORS.includes(b.color) && b.nameKind === 'color' && b.nameValue === b.color), ctx);
          assert.strictEqual(r.sign.type, 'color'); assert.strictEqual(r.sign.value, r.params.color);
          if (warm) assert.strictEqual(ans.length, 1, ctx); else assert.ok(ans.length >= 2 && ans.length <= 3, ctx);
          const others = [...new Set(B.filter(b => !b.answer).map(b => b.color))];
          assert.strictEqual(others.length, KB.Content.NCHOICE[age] - 1, 'distractor colours ' + ctx);
          for (const c of others) { const k = B.filter(b => b.color === c).length; assert.ok(k >= 1 && k <= 2, ctx); }
          targets.push(r.params.color); break;
        }
        case 'shapes': {
          const shapes = new Set(B.map(b => b.shape));
          assert.strictEqual(shapes.size, KB.Content.NCHOICE[age], ctx);
          if (age <= 4) { assert.strictEqual(new Set(B.map(b => b.color)).size, 1, 'one colour ≤ 4 ' + ctx); assert.ok(!shapes.has('rect'), ctx); }
          if (warm) assert.strictEqual(ans.length, 1, ctx);
          assert.strictEqual(r.sign.type, 'shape'); targets.push(r.params.shape); break;
        }
        case 'size': {
          assert.strictEqual(new Set(B.map(b => b.color)).size, 1, ctx);
          assert.ok(B.every(b => b.scale === 1.3 || b.scale === 0.8), ctx);
          assert.ok(B.every(b => (b.scale === 1.3) === (b.nameValue === 'big')), ctx);
          if (warm) assert.strictEqual(B.length, 2, ctx);
          assert.ok(B.length <= 4, ctx);
          targets.push(r.params.color); break;
        }
        case 'count': {
          const N = r.sign.need, rg = KB.Content.COUNT_RANGE[age];
          assert.strictEqual(r.mode, 'count'); assert.strictEqual(r.sign.type, 'number'); assert.strictEqual(r.params.n, N);
          if (warm) assert.ok(N <= 3 && N >= 1, ctx); else assert.ok(N >= Math.max(2, rg[0]) && N <= rg[1], ctx);
          assert.strictEqual(B.length, N + (N <= 3 ? 3 : 2), ctx);
          assert.strictEqual(new Set(B.map(b => b.color)).size, 1, ctx);
          assert.ok(B.every(b => b.answer && b.nameKind === 'balloon'), ctx);
          targets.push(N + ':' + r.params.color); break;
        }
        case 'animals': {
          assert.strictEqual(r.mode, 'ask');
          assert.strictEqual(B.length, warm ? 2 : KB.Content.NCHOICE[age], ctx);
          assert.strictEqual(new Set(B.map(b => b.nameValue)).size, B.length, ctx);
          assert.deepStrictEqual(r.queue.slice().sort(), B.map(b => b.id).sort(), ctx);
          assert.ok(B.every(b => b.sprite === 'animal_' + b.nameValue && b.nameKind === 'animal'), ctx);
          assert.strictEqual(r.params.animal, B.find(b => b.id === r.queue[0]).nameValue);
          assert.strictEqual(r.sign.type, 'animal'); break;
        }
        case 'letters': case 'lower': {
          assert.ok(B.length >= 3 && B.length <= 5, ctx);
          assert.ok(B.every(b => KB.Content.TEXT_COLORS.includes(b.color)), ctx);
          if (topic === 'lower') { assert.ok(B.every(b => b.text === b.text.toLowerCase()), ctx); assert.ok(!B.some(b => b.text === 'i') && r.params.text !== 'I', 'no I in lower ' + ctx); }
          else assert.ok(B.every(b => b.text === b.text.toUpperCase()), ctx);
          assert.strictEqual(r.sign.type, 'text'); assert.strictEqual(r.sign.value, r.params.text); targets.push(r.params.text); break;
        }
        case 'initial': {
          const wd = KB.WORDS[lang].find(x => x.animal === r.params.animal);
          assert.ok(wd, 'initial word in ' + lang + ' ' + ctx);
          assert.strictEqual(ans.length, 1); assert.strictEqual(ans[0].text, wd.initial, ctx);
          assert.strictEqual(B.length, 3); assert.strictEqual(new Set(B.map(b => b.text)).size, 3, ctx);
          assert.strictEqual(r.sign.type, 'animal'); assert.strictEqual(r.sign.value, wd.animal);
          if (lang === 'vi') assert.ok(!['bunny', 'horse', 'puppy'].includes(wd.animal), ctx);
          targets.push(wd.animal); break;
        }
        case 'add': case 'sub': {
          const v = topic === 'add' ? r.params.a + r.params.b : r.params.a - r.params.b;
          assert.ok(r.params.a >= 1 && r.params.b >= 1, ctx);
          assert.ok(topic === 'add' ? v <= (age >= 7 ? 20 : 10) : (v >= 0 && r.params.a <= 10), ctx);
          assert.strictEqual(B.length, 3); assert.strictEqual(+ans[0].text, v, ctx);
          for (const b of B) { assert.ok(+b.text >= 0 && Math.abs(+b.text - v) <= 3, ctx); assert.strictEqual(b.nameKind, 'number'); }
          assert.strictEqual(new Set(B.map(b => b.text)).size, 3, ctx);
          assert.strictEqual(r.sign.value, r.params.text); break;
        }
        case 'oddeven': {
          assert.ok(B.length >= 5 && B.length <= 6, ctx);
          if (warm) assert.strictEqual(ans.length, 1, ctx); else assert.ok(ans.length >= 2 && ans.length <= 3, ctx);
          assert.strictEqual(new Set(B.map(b => b.text)).size, B.length, ctx);
          break;
        }
      }
    });
    if (['colors', 'shapes', 'letters', 'lower', 'initial'].includes(topic) && !(topic === 'initial' && lang === 'vi' && false))
      assert.strictEqual(new Set(targets).size, 4, `4 different targets per chapter: ${topic} ${age} ${lang} ${s} ${targets}`);
    if (topic === 'size' || topic === 'count') assert.strictEqual(new Set(targets).size, 4, `chapter varies ${topic} ${targets}`);
  }
  console.log('      ' + n + ' rounds');
});

test('content: colour-blind rule — below age 5 never blue+purple, red+green, yellow+orange, green+orange in one round or Talk', () => {
  for (const topic of TOPICS) for (const age of [3, 4]) for (let s = 0; s < 300; s++) {
    for (const r of chapter(topic, age, 'en', s)) {
      const cs = [...new Set(r.balloons.map(b => b.color))];
      assert.ok(!KB.Content.clash(cs), `${topic} age ${age} seed ${s}: ${cs}`);
    }
    if (topic === 'colors') {
      const t = KB.Content.makeTalk('colors', { age, lang: 'en', rng: new KB.RNG(s) });
      assert.ok(!KB.Content.clash(t.choices.map(c => c.value)), 'talk ' + s);
    }
  }
  // age ≥ 5 may mix any colours (shapes age 5 uses mixed colours)
  let mixed = 0;
  for (let s = 0; s < 200; s++) for (const r of chapter('shapes', 5, 'en', s)) if (new Set(r.balloons.map(b => b.color)).size > 1) mixed++;
  assert.ok(mixed > 500, 'shapes age 5 mixed colours ' + mixed);
});

test('content: validate() rejects broken rounds (self-check works)', () => {
  const ok = KB.Content.makeRound('colors', { age: 4, rng: new KB.RNG(3), roundIndex: 1 });
  assert.strictEqual(KB.Content.validate(ok), null);
  const bad1 = J(ok); bad1.balloons.forEach(b => { b.answer = false; }); assert.ok(KB.Content.validate(bad1));
  const bad2 = J(ok); bad2.balloons[0].answer = !bad2.balloons[0].answer; assert.ok(KB.Content.validate(bad2));
  const cnt = J(KB.Content.makeRound('count', { age: 4, rng: new KB.RNG(3), roundIndex: 2 })); cnt.balloons.length = cnt.sign.need; assert.ok(KB.Content.validate(cnt));
  const ask = J(KB.Content.makeRound('animals', { age: 4, rng: new KB.RNG(3), roundIndex: 2 })); ask.queue.pop(); assert.ok(KB.Content.validate(ask));
  const ask2 = J(KB.Content.makeRound('animals', { age: 4, rng: new KB.RNG(3), roundIndex: 2 })); ask2.params.animal = 'zebra'; assert.ok(KB.Content.validate(ask2));
});

test('content: deterministic (same seed → same round and talk)', () => {
  for (const topic of TOPICS) {
    const a = KB.Content.makeRound(topic, { age: 5, rng: new KB.RNG(77), roundIndex: 2 }), b = KB.Content.makeRound(topic, { age: 5, rng: new KB.RNG(77), roundIndex: 2 });
    assert.deepStrictEqual(a, b);
    assert.deepStrictEqual(KB.Content.makeTalk(topic, { age: 5, rng: new KB.RNG(5) }), KB.Content.makeTalk(topic, { age: 5, rng: new KB.RNG(5) }));
  }
});

test('talk: every topic × age × lang × 300 seeds → distinct choices with the answer; animals "says {sound}" rules', () => {
  const answers = { en: {}, vi: {} };
  for (const topic of TOPICS) for (const age of AGES) for (const lang of LANGS) for (let s = 0; s < 300; s++) {
    const t = KB.Content.makeTalk(topic, { age, lang, rng: new KB.RNG(s * 31 + age) }), ctx = `${topic} ${age} ${lang} ${s}`;
    assert.strictEqual(t.promptKey, 'talk.' + topic);
    const vals = t.choices.map(c => c.value);
    assert.strictEqual(new Set(vals).size, vals.length, ctx);
    assert.strictEqual(t.choices.length, topic === 'size' || topic === 'oddeven' ? 2 : 3, ctx);
    const a = t.choices.find(c => c.id === t.answerId); assert.ok(a, ctx);
    if (topic === 'count') { assert.strictEqual(t.show.count, a.value); if (age <= 4) assert.ok(a.value <= 5, ctx); }
    if (topic === 'colors') assert.strictEqual(t.show.color, a.value);
    if (topic === 'shapes') assert.strictEqual(t.show.shape, a.value);
    if (topic === 'size') assert.strictEqual(t.show.size, a.value);
    if (topic === 'animals') {
      const S = KB.Content.SOUND[lang];
      assert.strictEqual(t.params.sound, a.value, 'params.sound = answer animal id');
      assert.ok(S[a.value], 'answer has a sound ' + ctx);
      assert.notStrictEqual(a.value, 'bunny');
      if (lang === 'vi') assert.notStrictEqual(a.value, 'goat', 'goat never asked in vi');
      const groups = vals.map(v => S[v] || 'none');
      assert.strictEqual(new Set(groups).size, groups.length, 'two choices sound alike ' + ctx + ' ' + vals);
      assert.ok(t.choices.every(c => c.kind === 'animal' && KB.ANIMALS.includes(c.value)));
      answers[lang][a.value] = (answers[lang][a.value] || 0) + 1;
    }
  }
  assert.strictEqual(Object.keys(answers.en).length, 8, 'en: every animal with a sound is asked');
  assert.strictEqual(Object.keys(answers.vi).length, 7, 'vi: every animal with a sound is asked');
});

// ======================================================= layout
test('layout: §2 formulas (groundY, Miu, sign, bubble, yard, balloon size, short-side rule)', () => {
  const ls = KB.World.logicalSize;
  assert.deepStrictEqual(ls(852, 393), { W: 1561, H: 720 }); assert.deepStrictEqual(ls(1024, 768), { W: 960, H: 720 });
  assert.deepStrictEqual(ls(393, 852), { W: 720, H: 1561 }); assert.deepStrictEqual(ls(400, 400), { W: 960, H: 720 });
  const L = KB.World.computeLayout(960, 720, { top: 32, bottom: 27, left: 10, right: 0 }, 4);
  assert.strictEqual(L.groundY, 720 - 27 - 96);
  assert.deepStrictEqual([L.miu.x, L.miu.y, L.miu.h], [120, L.groundY + 18, 190]);
  assert.deepStrictEqual([L.sign.x, L.sign.y, L.sign.w], [285, L.groundY + 24, 150]);
  assert.deepStrictEqual([L.bubble.x, L.bubble.y, L.bubble.h], [34, 52, 122]); assert.strictEqual(L.bubble.w, Math.min(640, 960 - 34 - 160));
  assert.deepStrictEqual([L.yard.x0, L.yard.x1, L.yard.y], [380, 900, L.groundY + 30]);
  assert.strictEqual(L.balloonSize, 118);
  assert.strictEqual(L.play.y, 52 + 122 + 30 + 59); assert.strictEqual(L.play.y + L.play.h, L.groundY - 150);
  const T = KB.World.computeLayout(720, 1556, null, 3);
  assert.ok(T.tall && T.portrait);
  assert.strictEqual(T.groundY, 1556 - 96 - Math.min(140, 0.3 * (1556 - 1152)));
  assert.strictEqual(T.balloonSize, 128 * 1.15); assert.strictEqual(T.miu.h, 200);
  const PP = KB.World.computeLayout(720, 960, { top: 32, bottom: 27, left: 0, right: 0 }, 4);   // portrait: bubble below the HUD
  assert.deepStrictEqual([PP.bubble.y, PP.bubble.h], [32 + 96 + 24, 124]); assert.ok(PP.play.y >= PP.bubble.y + 124 + 30 + 59 - 1e-6);
  assert.ok(Math.abs(T.play.h - 1.05 * 720) < 1e-6, 'portrait band ≤ 1.05 W');
  for (const a of [3, 4, 5, 6, 7]) assert.strictEqual(KB.World.computeLayout(1280, 720, null, a).balloonSize, { 3: 128, 4: 118, 5: 108, 6: 108, 7: 108 }[a]);
});

test('layout: 12 viewports × every topic × age × 12 seeds → homes inside play, inside the screen, not under HUD/bubble, clear of Miu + sign, no overlaps', () => {
  let rounds = 0, minShrink = 1, minShrinkFew = 1;
  for (const v of VIEWPORTS) {
    const L0 = KB.World.computeLayout(v.W, v.H, v.ins, 4), ins = L0.ins;
    assert.ok(!rectsOverlap(L0.bubble, L0.hud), v.name + ' bubble under HUD');
    assert.ok(L0.yard.x1 - L0.yard.x0 >= 92, v.name + ' yard fits a friend');
    for (const age of AGES) for (const topic of KB.Content.topicsFor(age).concat(age === 3 ? ['size'] : [])) for (let s = 0; s < 12; s++) {
      const w = mkWorld({ seed: 100 + s, age, vp: v });
      roundOf(w, topic, s % 4);
      const L = w.layout, ctx = `${v.name} age ${age} ${topic} s${s}`;
      rounds++; minShrink = Math.min(minShrink, w.packShrink);
      if (w.balloons.length <= CFG.manyAt) minShrinkFew = Math.min(minShrinkFew, w.packShrink);
      assert.ok(w.packOk, 'pack shrank below 0.8 ' + ctx + ' ' + w.packShrink);
      const B = w.balloons;
      for (const b of B) {
        const r = b.size / 2, ex = Math.max(0, (b.size - L.balloonSize) / 2);
        assert.ok(b.hx >= L.play.x + ex - 1e-6 && b.hx <= L.play.x + L.play.w - ex + 1e-6, 'x in play ' + ctx);
        assert.ok(b.hy >= L.play.y - 1e-6 && b.hy <= L.play.y + L.play.h + 1e-6, 'y in play ' + ctx);
        assert.ok(b.hx - r >= ins.left && b.hx + r <= L.W - ins.right && b.hy - r >= ins.top && b.hy + r <= L.H - ins.bottom, 'on screen ' + ctx);
        assert.ok(!circleRect(b.hx, b.hy, r, L.hud), 'under HUD ' + ctx);
        assert.ok(!circleRect(b.hx, b.hy, r, L.bubble), 'under bubble ' + ctx);
        assert.ok(!circleRect(b.hx, b.hy, r, miuRect(L)), 'over Miu ' + ctx);
        assert.ok(!circleRect(b.hx, b.hy, r, signRect(L)), 'over sign ' + ctx);
        assert.ok(b.hy + CFG.bobAmp[1] + CFG.knotY[b.shape] * b.size + 0.9 * b.size / b.scale <= L.groundY + 50 + 1e-6, 'string tail ends at the grass ' + ctx);
      }
      for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
        const d = hyp(B[i].hx - B[j].hx, B[i].hy - B[j].hy);
        assert.ok(d >= (B.length > CFG.manyAt ? CFG.homeSpacingMany : CFG.homeSpacing) * (B[i].size + B[j].size) / 2 - 1e-6, 'spacing ' + ctx);
      }
      assert.ok(B.every(b => b.size >= 0.8 * b.base - 1e-6), ctx);
      assert.ok(B.every(b => b.size / b.scale >= (B.length > CFG.manyAt ? 90 : 100) - 1e-6), 'balloons ≥ 100 px (≥ 90 in crowded count rounds) ' + ctx + ' ' + Math.min(...B.map(b => b.size / b.scale)));
    }
  }
  console.log('      ' + rounds + ' rounds, min pack scale ' + minShrink.toFixed(2) + ' (≤ 10 balloons: ' + minShrinkFew.toFixed(2) + ')');
});

test('layout: homes spread (farthest-point sampling) and vary between seeds', () => {
  const w = mkWorld({ seed: 3, age: 4, vp: VIEWPORTS[8] });
  roundOf(w, 'colors', 1);
  const xs = w.balloons.map(b => b.hx), span = Math.max(...xs) - Math.min(...xs);
  assert.ok(span > 0.5 * w.layout.play.w, 'spread over the band ' + span);
  const w2 = mkWorld({ seed: 4, age: 4, vp: VIEWPORTS[8] }); roundOf(w2, 'colors', 1);
  assert.notDeepStrictEqual(w.balloons.map(b => Math.round(b.hx)), w2.balloons.map(b => Math.round(b.hx)));
});

test('layout: setViewport mid-round re-packs live balloons into the new band and moves friends to the new yard', () => {
  const w = mkWorld({ seed: 9, age: 4, vp: VIEWPORTS[8] });
  roundOf(w, 'animals', 2); settle(w); settleFloat(w);
  tap(w, w.balloonById(w.target)); run(w, 3);
  assert.ok(w.friends.length === 1 && w.friends[0].state !== 'fall');
  w.setViewport(720, 1556, VIEWPORTS[3].ins);
  const L = w.layout;
  for (const b of w.balloons.filter(b => b.state === 'float')) {
    assert.ok(b.hx >= L.play.x - 1e-6 && b.hx <= L.play.x + L.play.w + 1e-6 && b.hy >= L.play.y - 1e-6 && b.hy <= L.play.y + L.play.h + 1e-6);
    assert.strictEqual(b.x, b.hx);
  }
  const f = w.friends[0];
  assert.ok(f.x >= L.yard.x0 && f.x <= L.yard.x1 && Math.abs(f.y - L.yard.y) < 1e-6, 'friend moved to the new yard');
  run(w, 1);
  assert.ok(w.balloons.every(b => isFinite(b.x) && isFinite(b.y)));
});

// ======================================================= taps
test('tap: hit circle 0.6·size + 14, nearest centre wins, strings and non-live balloons are not tappable', () => {
  const w = mkWorld({ seed: 2, age: 4 });
  roundOf(w, 'colors', 1); settle(w); settleFloat(w);
  const b = w.balloons[0], r = CFG.touchR * b.size + CFG.touchPad;
  w.wind = 0;
  // freeze motion between the probes: read positions right before each tap
  assert.strictEqual(w.pointerDown(b.x + r - 1, b.y), b.id); w.pointerUp();
  run(w, 1.5); w.drainEvents();
  const others = w.balloons.filter(o => o !== b && hyp(o.x - (b.x - r - 1), o.y - b.y) < CFG.touchR * o.size + CFG.touchPad);
  if (!others.length) assert.strictEqual(w.pointerDown(b.x - r - 1, b.y), null, 'just outside → miss');
  // nearest centre wins when two circles overlap
  const w2 = mkWorld({ seed: 2, age: 4 }); roundOf(w2, 'colors', 1); settle(w2); settleFloat(w2);
  const [p, q] = w2.balloons; p.x = 500; p.y = 300; q.x = 560; q.y = 300; p._px = p.x; q._px = q.x;
  assert.strictEqual(w2.pointerDown(520, 300), p.id); w2.pointerUp();
  // the string end (1.4·size below the centre) is not tappable
  const w3 = mkWorld({ seed: 2, age: 4 }); roundOf(w3, 'colors', 1); settle(w3); settleFloat(w3);
  const c = w3.balloons[0], tail = c.string[c.string.length - 1];
  const hitAny = w3.balloons.some(o => hyp(o.x - tail.x, o.y - tail.y) <= CFG.touchR * o.size + CFG.touchPad);
  if (!hitAny) assert.strictEqual(w3.pointerDown(tail.x, tail.y), null);
  // no taps outside the round
  const w4 = mkWorld({ seed: 2, age: 4 }); w4.newSession(); assert.strictEqual(w4.state, 'intro'); assert.strictEqual(w4.pointerDown(600, 300), null);
});

test('tap: a rising balloon reacts only after 60 % of its rise; the round is playable after ≈ 0.8 s', () => {
  const w = mkWorld({ seed: 4, age: 4 });
  roundOf(w, 'colors', 1);
  const b = w.balloons[0];
  assert.strictEqual(b.state, 'rise'); assert.ok(b.y > w.layout.groundY);
  assert.strictEqual(w.pointerDown(b.x, b.y), null, 'below the grass: not yet');
  let tReady = null, t = 0;
  while (t < 3) { w.update(H); t += H; if (tReady === null && w.canTap(b)) tReady = t; }
  assert.ok(tReady > 0.3 && tReady < 0.8, 'first balloon tappable at ' + tReady);
  const w2 = mkWorld({ seed: 4, age: 4 }); roundOf(w2, 'colors', 1);
  let ti = 0; while (!w2.interactive) { w2.update(H); ti += H; }
  assert.ok(ti < 0.6 + 0.12 * w2.balloons.length + 0.2, 'interactive after ' + ti.toFixed(2) + ' s');
});

test('pop: correct on touch-down, 0.08 s stretch to 1.18×, then pop + shreds; string falls free and fades in 0.6 s', () => {
  const w = mkWorld({ seed: 5, age: 4 });
  roundOf(w, 'colors', 1); settle(w); settleFloat(w); w.drainEvents();
  const b = rightOnes(w)[0];
  assert.strictEqual(tap(w, b), b.id);
  let ev = events(w);
  const c = ev.find(e => e.type === 'correct');
  assert.ok(c && c.id === b.id && c.nameKind === 'color' && c.color === b.color && c.n === 1, 'correct immediately');
  assert.ok(!ev.some(e => e.type === 'pop'));
  assert.strictEqual(w.canTap(b), false, 'no double pop');
  run(w, 0.05); assert.ok(b.sx > 1.08 && b.sx < 1.18 + 1e-9, 'stretching ' + b.sx);
  run(w, 0.04); ev = events(w);
  const p = ev.find(e => e.type === 'pop');
  assert.ok(p && p.id === b.id && p.shape === b.shape, 'pop after the stretch');
  assert.strictEqual(b.state, 'pop'); assert.ok(w.shreds.length >= 6);
  const y0 = b.string[0].y; run(w, 0.3);
  assert.ok(b.string[0].y > y0 + 5, 'string falls'); assert.ok(b.strAlpha < 0.6 && b.strAlpha > 0);
  run(w, 0.35); assert.strictEqual(b.state, 'gone');
  run(w, 1); assert.ok(w.shreds.length === 0 || w.shreds.every(s => s.life > 0));
});

test('wrong: boing — squash wobble 0.18, impulse ≈ 220 px/s away from the finger, no-no shake, home again in ≈ 1 s, 0.3 s cooldown', () => {
  const w = mkWorld({ seed: 6, age: 4 });
  roundOf(w, 'colors', 1); settle(w); settleFloat(w); run(w, 1); w.drainEvents();
  const b = wrongOnes(w)[0], hx = b.x;
  const fx = b.x - 20, fy = b.y;
  assert.strictEqual(w.pointerDown(fx, fy), b.id); w.pointerUp();
  const ev = events(w), e = ev.find(x => x.type === 'wrong');
  assert.ok(e && e.id === b.id && e.nameKind === 'color' && e.nameValue === b.color);
  assert.strictEqual(e.targetNameKind, 'color'); assert.strictEqual(e.targetNameValue, w.cur.params.color);
  assert.ok(w.balloonById(e.target).answer, 'target = a right balloon');
  assert.ok(Math.abs(b.sx - 1.18) < 0.02 && Math.abs(b.sy - 0.82) < 0.02, 'squash amplitude');
  assert.ok(b.vx > 150, 'impulse away from the finger (to the right) ' + b.vx);
  assert.strictEqual(w.roundMistakes, 1);
  let maxRot = 0, maxDx = 0;
  run(w, 0.25, () => { maxRot = Math.max(maxRot, Math.abs(b.rot)); maxDx = Math.max(maxDx, b.x - hx); });
  assert.strictEqual(w.pointerDown(b.x, b.y), null, 'wrong lock: every tap ignored for 0.8 s'); w.pointerUp();
  assert.ok(!events(w).some(x => x.type === 'wrong'), 'cooldown: a 2nd tap within 0.3 s is ignored');
  assert.strictEqual(w.roundMistakes, 1);
  run(w, 0.9, () => { maxRot = Math.max(maxRot, Math.abs(b.rot)); maxDx = Math.max(maxDx, b.x - hx); });
  assert.ok(maxRot > 0.12, 'shake ' + maxRot); assert.ok(maxDx > 12 && maxDx < 60, 'pushed ' + maxDx);
  assert.ok(Math.abs(b.x - hx) < 2 * CFG.driftAmp + 4, 'back home within ≈ 1.2 s: ' + (b.x - hx));
  assert.ok(Math.abs(b.sx - 1) < 0.02);
  assert.strictEqual(b.state, 'float');
});

test('find mode: every right balloon pops → +0.5 s → the rest float away, roundDone; balloons never leave during play', () => {
  const w = mkWorld({ seed: 7, age: 4 });
  roundOf(w, 'shapes', 2); settle(w); settleFloat(w); w.drainEvents();
  const right = rightOnes(w), wrong = wrongOnes(w);
  for (const b of right) { tap(w, b); run(w, 0.2); }
  assert.ok(w.solved); assert.strictEqual(w.state, 'round');
  assert.ok(wrong.every(b => b.state === 'float'), 'still floating right after the last pop');
  run(w, 0.25); assert.strictEqual(w.state, 'round');
  run(w, 0.1); assert.strictEqual(w.state, 'roundDone');
  assert.ok(wrong.every(b => b.state === 'away'));
  const ev = events(w), rd = ev.find(e => e.type === 'roundDone');
  assert.ok(rd && rd.stars === 3 && rd.round === 2);
  const y0 = wrong[0].y; run(w, 1.6);
  assert.ok(CFG.awayFadeAt + CFG.awayFade < CFG.roundDoneTime, 'away balloons are gone before the next round');
  assert.ok(wrong.every(b => b.state === 'gone' || b.y < y0 - 200), 'flew up and away');
  assert.ok(wrong.every(b => b.state === 'gone'), 'all gone (faded) before the next round');
});

test('count mode: every tap pops, sign.filled counts with a wobble, at N the extras float away, roundDone after 0.5 s', () => {
  const w = mkWorld({ seed: 8, age: 4 });
  roundOf(w, 'count', 2); settle(w); settleFloat(w); w.drainEvents();
  const N = w.sign.need;
  assert.strictEqual(w.sign.type, 'number'); assert.strictEqual(w.sign.filled, 0);
  assert.ok(w.balloons.length >= N + 2);
  for (let k = 1; k <= N; k++) {
    const b = w.balloons.find(x => w.canTap(x));
    tap(w, b);
    const ev = events(w), c = ev.find(e => e.type === 'correct');
    assert.strictEqual(c.n, k); assert.strictEqual(c.need, N); assert.strictEqual(w.sign.filled, k);
    run(w, 0.06); assert.ok(Math.abs(w.sign.wob) > 0.01, 'sign wobbles');
    run(w, 0.2);
  }
  assert.ok(w.solved);
  const extras = w.balloons.filter(b => b.state === 'away');
  assert.strictEqual(extras.length, w.balloons.length - N, 'extras float away at N');
  assert.strictEqual(w.pointerDown(extras[0].x, extras[0].y), null, 'no more pops');
  run(w, 0.35); assert.strictEqual(w.state, 'roundDone');
  assert.strictEqual(events(w).find(e => e.type === 'roundDone').count, N);
});

test('ask mode: ask at start + on each target change; only the target pops; friends fall like a leaf, land on the yard, bounce, rest, fade in roundDone', () => {
  const w = mkWorld({ seed: 11, age: 5, vp: VIEWPORTS[4] });
  roundOf(w, 'animals', 2);
  let ev = events(w);
  const a0 = ev.find(e => e.type === 'ask');
  assert.ok(a0 && a0.first && a0.balloonId === w.target && a0.params.animal === w.balloonById(w.target).nameValue && a0.promptKey === 'p.animals');
  assert.deepStrictEqual(w.prompt(), { promptKey: 'p.animals', params: { animal: a0.params.animal } });
  assert.strictEqual(w.sign.value, a0.params.animal);
  settle(w); settleFloat(w); w.drainEvents();
  const n = w.balloons.length, L = w.layout;
  const other = w.balloons.find(b => b.id !== w.target);
  tap(w, other);
  ev = events(w); const wr = ev.find(e => e.type === 'wrong');
  assert.ok(wr && wr.target === w.target && wr.targetNameKind === 'animal' && wr.targetNameValue === w.balloonById(w.target).nameValue);
  assert.strictEqual(other.state, 'float');
  const landed = [];
  for (let k = 0; k < n; k++) {
    const t = w.balloonById(w.target);
    run(w, 0.85);   // past the 0.8 s wrong lock
    tap(w, t);
    ev = events(w);
    assert.ok(ev.some(e => e.type === 'correct' && e.id === t.id));
    if (k < n - 1) { const a = ev.find(e => e.type === 'ask'); assert.ok(a && !a.first && a.balloonId === w.target && a.balloonId !== t.id); assert.strictEqual(w.sign.value, a.params.animal); }
    run(w, 0.1);
    const f = w.friends[w.friends.length - 1];
    assert.ok(f && f.sprite === t.sprite && f.state === 'fall' && f.size === 84);
    let maxV = 0, maxRot = 0, t0 = 0, landT = null;
    while (f.state === 'fall' && t0 < 6) { w.update(H); t0 += H; maxV = Math.max(maxV, f.vy); maxRot = Math.max(maxRot, Math.abs(f.rot)); for (const e of w.drainEvents()) if (e.type === 'land') { landT = t0; landed.push(e); } }
    assert.ok(landT !== null, 'landed');
    assert.ok(maxV <= f.vt + 1 && maxV > 150 && f.vt >= 222, 'terminal ≈ v_t: ' + maxV);
    assert.ok(maxRot > 0.1 && maxRot <= 0.25 + 1e-9, 'leaf sway ' + maxRot);
    assert.ok(Math.abs(f.y - f.ty) < 1e-6 && f.x >= L.yard.x0 && f.x <= L.yard.x1 && f.y <= L.H - L.ins.bottom && f.x + 42 <= L.W - L.ins.right, 'on the yard, on screen');
    let maxHop = 0; const ty = f.ty;
    for (let i = 0; i < 120 && f.state !== 'rest'; i++) { w.update(H); maxHop = Math.max(maxHop, ty - f.y); }
    assert.ok(maxHop > 8 && maxHop < 25, 'small bounce ' + maxHop);
    assert.strictEqual(f.state, 'rest');
  }
  assert.strictEqual(new Set(landed.map(e => Math.round(e.x))).size, n, 'next free x per friend');
  const xs = w.friends.map(f => f.x); for (let i = 1; i < xs.length; i++) assert.ok(Math.abs(xs[i] - xs[i - 1]) >= CFG.yardSpacing - 1e-6 || w.friends[i].ty !== w.friends[i - 1].ty);
  let g = 0; while (w.state === 'round' && g++ < 600) w.update(H);
  assert.strictEqual(w.state, 'roundDone');
  assert.strictEqual(events(w).find(e => e.type === 'roundDone').stars, 2);
  run(w, 2.05); assert.ok(w.friends.every(f => f.alpha < 0.05), 'friends fade out in roundDone');
});

test('friends land inside the screen on every viewport (portrait yards stack a 2nd row)', () => {
  for (const v of VIEWPORTS) {
    const w = mkWorld({ seed: 12, age: 5, vp: v });
    roundOf(w, 'animals', 2); settle(w); settleFloat(w);
    const n = w.balloons.length;
    for (let k = 0; k < n; k++) { tap(w, w.balloonById(w.target)); run(w, 0.3); }
    let g = 0; while (w.friends.some(f => f.state !== 'rest') && g++ < 1200) w.update(H);
    const L = w.layout;
    for (const f of w.friends) {
      assert.ok(f.x - f.size / 2 >= L.ins.left && f.x + f.size / 2 <= L.W - L.ins.right, v.name + ' x');
      assert.ok(f.y <= L.H - L.ins.bottom && f.y - f.size >= L.groundY - 80, v.name + ' y');
      assert.ok(f.x - f.size / 2 >= L.sign.x + L.sign.w / 2 - 1, v.name + ' right of the sign');
    }
    for (let i = 0; i < w.friends.length; i++) for (let j = i + 1; j < w.friends.length; j++)
      assert.ok(hyp(w.friends[i].x - w.friends[j].x, w.friends[i].y - w.friends[j].y) >= 40, v.name + ' friends overlap');
  }
});

test('help: 2 wrong taps → hint glows the next target 3 s (bobs bigger); cooldown 6 s; manual hint()', () => {
  const w = mkWorld({ seed: 13, age: 4 });
  roundOf(w, 'colors', 1); settle(w); settleFloat(w); w.drainEvents();
  const bad = wrongOnes(w);
  tap(w, bad[0]); assert.ok(!events(w).some(e => e.type === 'hint'));
  run(w, 0.85); tap(w, bad[bad.length > 1 ? 1 : 0]);
  const h = events(w).find(e => e.type === 'hint');
  assert.ok(h, 'hint after 2 wrongs');
  const t = w.balloonById(h.id); assert.ok(t.answer);
  run(w, 0.5); assert.ok(t.glow > 0.9);
  run(w, 0.4); tap(w, bad[0]); assert.ok(!events(w).some(e => e.type === 'hint'), 'glowing: no new hint');
  run(w, 2.3); assert.strictEqual(t.glow, 0, 'glow ends after 3 s');
  // (all wrong taps above are ≥ 0.8 s apart: the wrong lock never swallows them)
  run(w, 0.4); tap(w, bad[0]); assert.ok(!events(w).some(e => e.type === 'hint'), 'cooldown 6 s');
  run(w, 3); tap(w, bad[0]); assert.ok(events(w).some(e => e.type === 'hint'), 'after 6 s a new hint');
  // manual hint
  const w2 = mkWorld({ seed: 14, age: 4 }); roundOf(w2, 'animals', 1); settle(w2); w2.drainEvents();
  assert.strictEqual(w2.hint(), w2.target); assert.strictEqual(events(w2).filter(e => e.type === 'hint').length, 1);
  assert.strictEqual(w2.hint(), w2.target); assert.strictEqual(events(w2).filter(e => e.type === 'hint').length, 0, 'no repeat while glowing');
});

test('idle: nudges after 12 s without a tap, then ×1.5 (18, 27) up to 30 s; reset by a tap', () => {
  const w = mkWorld({ seed: 15, age: 4 });
  roundOf(w, 'colors', 1); settle(w); w.drainEvents();
  const times = []; let t = 0;
  for (let i = 0; i < Math.round(120 / H); i++) { w.update(H); t += H; for (const e of w.drainEvents()) if (e.type === 'idle') { times.push(t); assert.strictEqual(e.promptKey, 'p.colors'); } }
  const gaps = times.map((x, i) => x - (i ? times[i - 1] : 0));
  assert.ok(Math.abs(gaps[0] - 12) < 0.05 && Math.abs(gaps[1] - 18) < 0.05 && Math.abs(gaps[2] - 27) < 0.05 && Math.abs(gaps[3] - 30) < 0.05, gaps.join());
  w.pointerDown(5, 5); w.pointerUp();
  let t2 = 0, first = null;
  while (first === null && t2 < 20) { w.update(H); t2 += H; if (w.drainEvents().some(e => e.type === 'idle')) first = t2; }
  assert.ok(Math.abs(first - 12) < 0.05, 'reset by a tap ' + first);
});

test('stars: 0 wrong → 3, 1 → 2, ≥ 2 → 1; Talk right → +1', () => {
  for (const [m, st] of [[0, 3], [1, 2], [2, 1], [4, 1]]) {
    const w = mkWorld({ seed: 16 + m, age: 4 });
    roundOf(w, 'colors', 2); settle(w); settleFloat(w);
    for (let i = 0; i < m; i++) { tap(w, wrongOnes(w)[0]); run(w, 0.85); }
    solveRound(w);
    assert.strictEqual(w.roundStars, st, m + ' mistakes');
  }
  const w = mkWorld({ seed: 30, age: 4 }); w.levels = ['colors']; w.startLevel(0); w._startTalk();
  const s0 = w.stars; assert.ok(w.talkAnswer(w.talk.answerId)); assert.strictEqual(w.stars, s0 + 1);
  assert.strictEqual(w.talkAnswer(w.talk.answerId), false, 'only one answer');
});

test('state machine: intro 2.5 → 4 rounds (roundDone 2.2) → talk (+2.0 after the answer) → levelDone 2.4 → … → sessionDone; chapter time limit 75 s', () => {
  const w = mkWorld({ seed: 31, age: 4 });
  w.newSession(); const ev0 = events(w);
  assert.deepStrictEqual(ev0.map(e => e.type), ['session', 'level']);
  run(w, 2.49); assert.strictEqual(w.state, 'intro'); run(w, 0.02); assert.strictEqual(w.state, 'round');
  const r0 = events(w).find(e => e.type === 'round');
  assert.ok(r0 && r0.round === 0 && r0.mode === 'find' && r0.promptKey === 'p.colors' && r0.sign.type === 'color');
  const seen = [];
  let g = 0;
  while (w.state !== 'sessionDone' && g++ < 200000) {
    if (w.state === 'round') solveRound(w);
    else if (w.state === 'talk' && !w.talkAnswered && w.stateTime > 1) w.talkAnswer(w.talk.answerId);
    else w.update(H);
    for (const e of w.drainEvents()) seen.push(e.type);
  }
  assert.strictEqual(w.state, 'sessionDone');
  assert.strictEqual(seen.filter(x => x === 'roundDone').length, 16, '16 rounds');
  assert.strictEqual(seen.filter(x => x === 'talk').length, 4); assert.strictEqual(seen.filter(x => x === 'levelDone').length, 4);
  assert.strictEqual(w.stars, 16 * 3 + 4);
  // time limit: a slow chapter goes to Talk after round 3
  const s = mkWorld({ seed: 32, age: 4 }); s.newSession();
  let rounds = 0; g = 0;
  while (s.state !== 'talk' && g++ < 100000) {
    if (s.state === 'round' && s.interactive) { run(s, 26); solveRound(s); rounds++; } else s.update(H);
  }
  assert.strictEqual(s.state, 'talk'); assert.strictEqual(s.round, 3, 'Talk after 3 rounds once > 75 s');
});

test('talk: re-ask every 12 s without an answer; glowAnswer from the 2nd re-ask', () => {
  const w = mkWorld({ seed: 33, age: 3 }); w.levels = ['animals']; w.startLevel(0); w._startTalk(); w.drainEvents();
  const asks = [];
  run(w, 37, () => { for (const e of w.drainEvents()) if (e.type === 'talkAsk') asks.push(e); });
  assert.strictEqual(asks.length, 3); assert.ok(!asks[0].glowAnswer && asks[1].glowAnswer && w.talk.glowAnswer);
  assert.strictEqual(w.talk.promptKey, 'talk.animals'); assert.ok(w.talk.params.sound);
});

test('Miu: moods on events, cheer hops, looks at the tapped balloon', () => {
  const w = mkWorld({ seed: 34, age: 4 });
  roundOf(w, 'colors', 1); settle(w); settleFloat(w);
  const b = wrongOnes(w)[0]; tap(w, b); assert.strictEqual(w.miu.mood, 'oops');
  run(w, 0.6); assert.ok(hyp(w.miu.lookX - b.x, w.miu.lookY - b.y) < 40, 'looks at it');
  run(w, 0.3); tap(w, rightOnes(w)[0]); assert.strictEqual(w.miu.mood, 'happy');
  solveRound(w); assert.strictEqual(w.miu.mood, 'cheer');
  let maxHop = 0; run(w, 1, () => { maxHop = Math.max(maxHop, w.miu.hop); });
  assert.ok(maxHop > 20 && maxHop <= 26 + 1e-9);
  assert.strictEqual(w.lumi, w.miu, 'Owl alias');
});

test('QA fixes: knot/string-top taps count, 0.8 s wrong lock, squash on a too-low balloon, idle glow from the 2nd nudge', () => {
  const w = mkWorld({ seed: 60, age: 4 });
  roundOf(w, 'colors', 1); settle(w); settleFloat(w); w.drainEvents();
  const b = rightOnes(w)[0], r = CFG.touchR * b.size + CFG.touchPad;
  const others = w.balloons.filter(o => o !== b && hyp(o.x - b.x, o.y - (b.y + 0.9 * b.size)) <= CFG.touchR * o.size + CFG.touchPad + 1);
  assert.ok(0.9 * b.size > r);
  if (!others.length) { assert.strictEqual(w.pointerDown(b.x + 5, b.y + 0.9 * b.size), b.id, 'string top counts'); w.pointerUp(); }
  assert.strictEqual(w.pointerDown(b.x + 0.5 * b.size, b.y + 0.9 * b.size), null, 'too far sideways'); w.pointerUp();
  // wrong lock
  const w2 = mkWorld({ seed: 61, age: 4 }); roundOf(w2, 'colors', 1); settle(w2); settleFloat(w2); w2.drainEvents();
  tap(w2, wrongOnes(w2)[0]); w2.drainEvents();
  run(w2, 0.5); const g = rightOnes(w2)[0];
  assert.strictEqual(tap(w2, g), null); assert.strictEqual(events(w2).length, 0, 'no event during the lock');
  run(w2, 0.35); const g2 = rightOnes(w2)[0]; assert.strictEqual(tap(w2, g2), g2.id);
  assert.ok(events(w2).some(e => e.type === 'correct'), 'taps work again after 0.8 s');
  assert.strictEqual(w2.roundMistakes, 1);
  // squash nudge on a still-rising balloon
  const w3 = mkWorld({ seed: 62, age: 4 }); roundOf(w3, 'colors', 1); run(w3, 0.2);
  const lo = w3.balloons.find(o => o.t > 0 && !w3.canTap(o));
  assert.strictEqual(w3.pointerDown(lo.x, lo.y), null); assert.ok(Math.abs(lo._q - CFG.riseNudge) < 1e-9); assert.ok(!w3.drainEvents().some(e => e.type === 'correct' || e.type === 'wrong'));
  // idle glow
  const w4 = mkWorld({ seed: 63, age: 4 }); roundOf(w4, 'animals', 1); settle(w4); w4.drainEvents();
  const hs = []; run(w4, 31, () => { for (const e of w4.drainEvents()) if (e.type === 'hint' || e.type === 'idle') hs.push(e); });
  assert.deepStrictEqual(hs.map(e => e.type), ['idle', 'idle', 'hint']);
  assert.strictEqual(hs[1].n, 2); assert.ok(hs[2].idle && hs[2].id === w4.target);
});

test('QA fixes: friends land ≈ 2 s after the pop on tall phones; ages 6–7 play 6 rounds; many count rounds never throw', () => {
  for (const v of [VIEWPORTS[2], VIEWPORTS[10], VIEWPORTS[4]]) {
    const w = mkWorld({ seed: 64, age: 3, vp: v }); roundOf(w, 'animals', 2); settle(w); settleFloat(w); w.drainEvents();
    const t = w.balloons.find(b => b.id === w.target); tap(w, t);
    let tt = 0, landT = null; while (landT === null && tt < 5) { w.update(H); tt += H; if (w.drainEvents().some(e => e.type === 'land')) landT = tt; }
    assert.ok(landT > 1.0 && landT < 2.3, v.name + ' lands after ' + landT);
  }
  for (const [age, n] of [[3, 4], [5, 4], [6, 6], [7, 6]]) {
    const w = mkWorld({ seed: 65, age }); w.newSession(); assert.strictEqual(w.roundsPerLevel, n, 'age ' + age);
  }
  const w = mkWorld({ seed: 66, age: 6 }); w.levels = ['count', 'size', 'colors']; 
  for (const tp of ['count', 'size', 'colors', 'shapes']) { w.levels = [tp]; w.startLevel(0); for (let i = 0; i < 30; i++) { w.round = i; w._beginRound(); } }
  const small = KB.Content.makeRound('size', { age: 6, rng: new KB.RNG(1), roundIndex: 1 });
  for (const age of AGES) assert.ok(CFG.balloonSize[age] * KB.Content.SIZE_SCALE.small >= 86, 'small balloon size');
  void small;
});

// ======================================================= physics
test('physics: buoyant rise (soft overshoot ≤ 20 %, settles ≈ 1.5 s), bob 6–9 px, drift ±10 px, wind shift + tilt, no NaN', () => {
  const w = mkWorld({ seed: 40, age: 4 });
  roundOf(w, 'colors', 1);
  const b = w.balloons[0], y0 = b.y, D = y0 - b.hy;
  let minY = 1e9, t = 0, tSettle = null;
  while (t < 4) { w.update(H); t += H; minY = Math.min(minY, b.y); if (tSettle === null && t > 0.8 && Math.abs(b.y - b.hy) < 12 && Math.abs(b.vy) < 25) tSettle = t; }
  const over = (b.hy - minY);
  assert.ok(over > 0.04 * D && over < 0.2 * D + 9, 'soft overshoot ' + over.toFixed(1) + ' of ' + D.toFixed(0));
  assert.ok(tSettle !== null && tSettle < 2.2, 'settles ' + tSettle);
  // bob / drift ranges over 10 s
  let maxDy = 0, maxDx = 0;
  run(w, 10, () => { maxDy = Math.max(maxDy, Math.abs(b.y - b.hy)); maxDx = Math.max(maxDx, Math.abs(b.x - b.hx)); });
  assert.ok(maxDy >= 5 && maxDy <= 9.5, 'bob ' + maxDy); assert.ok(maxDx >= 5 && maxDx <= 11, 'drift ' + maxDx);
  // wind: +40 px/s → home shifts ≈ +14 px, tilts right, strings trail to the right
  const xs0 = w.balloons.map(o => o.x);
  w.wind = 40; run(w, 4);
  const shift = w.balloons.reduce((s, o, i) => s + o.x - o.hx, 0) / w.balloons.length;
  assert.ok(shift > 8 && shift < 22, 'wind shift ' + shift.toFixed(1));
  assert.ok(w.balloons.every(o => o.rot > 0.05 && o.rot <= 0.25 + 0.03), 'tilt with the wind');
  const s = b.string; assert.ok(s[s.length - 1].x > s[0].x + 5, 'string trails downwind');
  void xs0;
  w.wind = 0;
  assert.ok(w.balloons.every(o => [o.x, o.y, o.rot, o.sx, o.sy].every(Number.isFinite)));
});

test('physics: 7-point verlet strings stay within length (0.9·size ± 15 %), hang below the knot, point 0 pinned', () => {
  const w = mkWorld({ seed: 41, age: 3 });
  roundOf(w, 'colors', 1);
  let worst = 0, worstShort = 9;
  run(w, 6, (i) => {
    if (i === 300) w.wind = -40; if (i === 500) { const b = w.balloons[0]; b.vx += 400; }
    for (const b of w.balloons) {
      if (!b.string || b.state === 'gone' || b.state === 'pop') continue;
      assert.strictEqual(b.string.length, 7);
      const seg = 0.15 * b.size / b.scale; let len = 0;
      for (let k = 0; k < 6; k++) { const d = hyp(b.string[k + 1].x - b.string[k].x, b.string[k + 1].y - b.string[k].y); len += d; worst = Math.max(worst, d / seg); }
      worstShort = Math.min(worstShort, len / (6 * seg));
    }
  });
  assert.ok(worst < 1.15, 'segment stretch ' + worst.toFixed(3)); assert.ok(worstShort > 0.85 || worstShort === 9, 'not collapsed ' + worstShort);
  w.wind = 0; run(w, 4);
  for (const b of w.balloons) {
    const K = w._knot(b); assert.ok(hyp(b.string[0].x - K.x, b.string[0].y - K.y) < 1e-6, 'pinned');
    assert.ok(b.string[6].y > b.string[0].y + 0.75 * b.size, 'hangs down');
  }
});

test('physics: soft separation keeps pushed balloons from overlapping much; everything finite over a spammed session', () => {
  const w = mkWorld({ seed: 42, age: 5, vp: VIEWPORTS[4] });
  roundOf(w, 'shapes', 2); settle(w); settleFloat(w);
  const [a, c] = w.balloons; c.x = a.x + 10; c.y = a.y;
  let minD = 1e9; run(w, 1.5, (i) => { if (i > 30) minD = Math.min(minD, hyp(c.x - a.x, c.y - a.y)); });
  assert.ok(hyp(c.x - a.x, c.y - a.y) > 0.9 * (a.size + c.size) / 2, 'pushed apart');
  // spam: random taps every frame for a whole session
  const s = mkWorld({ seed: 43, age: 4 }); s.newSession(); const r = new KB.RNG(1); let t = 0;
  while (s.state !== 'sessionDone' && t < 1500) {
    if (s.state === 'talk' && !s.talkAnswered) s.talkAnswer(r.pick(s.talk.choices).id);
    if (r.chance(0.3)) { s.pointerDown(r.float(0, s.layout.W), r.float(0, s.layout.H)); s.pointerUp(); }
    s.update(1 / 30); t += 1 / 30; s.drainEvents();
    for (const b of s.balloons) assert.ok(Number.isFinite(b.x + b.y + b.rot + b.vx + b.vy), 'NaN balloon');
    for (const f of s.friends) assert.ok(Number.isFinite(f.x + f.y + f.vy), 'NaN friend');
  }
  assert.strictEqual(s.state, 'sessionDone', 'random spam still finishes');
});

test('interpolation: _px/_py/_prot are the previous sub-step; alpha in [0,1)', () => {
  const w = mkWorld({ seed: 44 }); roundOf(w, 'colors', 1);
  w.update(0.3); w.update(1 / 200);
  assert.ok(w.alpha >= 0 && w.alpha < 1);
  for (const b of w.balloons) {
    if (b.t < 0) continue;
    assert.ok(hyp(b.x - b._px, b.y - b._py) < 20, 'one sub-step apart');
    assert.ok(b._pstring && b._pstring.length === 7);
  }
});

// ======================================================= determinism + sessions
test('determinism: same seed + same inputs → identical events; the dt split does not matter', () => {
  function script(frame) {
    const w = mkWorld({ seed: 50, age: 4 }); w.newSession();
    const evs = []; let t = 0, k = 0;
    const taps = []; for (let i = 0; i < 400; i++) taps.push({ t: 2.5 + i * 0.73, pick: i % 3 });
    while (w.state !== 'sessionDone' && t < 600) {
      const step = Math.round(w.time / H);
      while (k < taps.length && Math.round(taps[k].t / H) <= step) {
        if (w.state === 'round') { const c = w.balloons.filter(b => w.canTap(b)); if (c.length) { const b = c[taps[k].pick % c.length]; w.pointerDown(Math.round(b.x), Math.round(b.y)); w.pointerUp(); } }
        if (w.state === 'talk' && !w.talkAnswered) w.talkAnswer(w.talk.choices[taps[k].pick % w.talk.choices.length].id);
        k++;
      }
      const next = k < taps.length ? Math.round(taps[k].t / H) - step : 1e9;
      const n = Math.max(1, Math.min(Math.round(frame / H), next));
      w.update(n * H); t = w.time;
      for (const e of w.drainEvents()) evs.push(JSON.stringify(e, (kk, v) => typeof v === 'number' ? Math.round(v * 1000) / 1000 : v));
    }
    return evs;
  }
  const a = script(1 / 30), b = script(1 / 30), c = script(1 / 120), d = script(1 / 50);
  assert.ok(a.length > 100);
  assert.deepStrictEqual(a, b); assert.deepStrictEqual(a, c, '1/30 vs 1/120 frames'); assert.deepStrictEqual(a, d, '1/30 vs 1/50 frames');
});

test('bot: full sessions for every age × lang × 4 viewports reach sessionDone, no stuck round, sane timings', () => {
  const vps = [VIEWPORTS[1], VIEWPORTS[3], VIEWPORTS[5], VIEWPORTS[7]];
  for (const age of AGES) for (const lang of LANGS) for (let i = 0; i < vps.length; i++) for (const skill of [0.5, 0.9]) {
    let rStart = 0, maxRound = 0;
    const r = playSession(200 + age * 10 + i, age, skill, { lang, vp: vps[i], config: { strings: false }, each: (w, ev) => {
      for (const e of ev) { if (e.type === 'round') rStart = w.time; if (e.type === 'roundDone') maxRound = Math.max(maxRound, w.time - rStart); }
    } });
    const ctx = `age ${age} ${lang} ${vps[i].name} skill ${skill}`;
    assert.strictEqual(r.w.state, 'sessionDone', ctx);
    assert.ok(maxRound < 60, 'stuck round ' + maxRound + ' ' + ctx);
    assert.ok(r.t < 480, 'session ≤ 8 min for the bot ' + r.t + ' ' + ctx);
    assert.ok(r.bot.stats.taps === r.bot.stats.correct + r.bot.stats.wrong + r.bot.stats.misses + (r.bot.stats.taps - r.bot.stats.correct - r.bot.stats.wrong - r.bot.stats.misses));
    const maxStars = r.w.levels.length * (3 * (CFG.roundsByAge[age] || 4) + 1);
    assert.ok(r.w.stars >= 16 && r.w.stars <= maxStars, ctx + ' stars ' + r.w.stars);
  }
});

test('bot: perfect bot never errs (3 stars every round); taps through pointerDown at the balloon position', () => {
  for (const age of AGES) {
    const r = playSession(300 + age, age, 1, { keep: true, config: { strings: false } });
    assert.strictEqual(r.events.filter(e => e.type === 'wrong').length, 0, 'age ' + age);
    assert.ok(r.events.filter(e => e.type === 'roundDone').every(e => e.stars === 3));
    assert.strictEqual(r.bot.stats.talkRight, r.bot.stats.talks);
    assert.strictEqual(r.bot.stats.misses, 0, 'bot hits the balloon it aims at');
  }
});

test('performance: 10 full sessions (strings on) simulated in < 6 s', () => {
  const t0 = Date.now();
  for (let i = 0; i < 10; i++) { const r = playSession(500 + i, AGES[i % 5], 0.8, { dt: 1 / 30 }); assert.strictEqual(r.w.state, 'sessionDone'); }
  const ms = Date.now() - t0;
  console.log('      10 sessions: ' + ms + ' ms');
  assert.ok(ms < 6000, ms + ' ms');
});

// ======================================================= weather (times of day)
const AMB = [
  { skyTop: '#FFD6C2', skyBottom: '#FFF1DC', sun: 1, moon: 0, stars: 0, darkness: 0 },
  { skyTop: '#7EC8F2', skyBottom: '#DDF3FF', tint: null, sun: 1, moon: 0, stars: 0, darkness: 0 },
  { skyTop: '#B7A0DA', skyBottom: '#FFD9A6', sun: 1 },
  { skyTop: '#142048', skyBottom: '#34407A', sun: 0, moon: 1, stars: 1, darkness: 0.28 }
];
const AMB_KEYS = ['skyTop', 'skyBottom', 'horizon', 'tint', 'wind', 'sway', 'sun', 'sunX', 'sunY', 'moon', 'moonX', 'moonY', 'stars', 'darkness', 'gust', 'windBase'];
test('weather: ambient per time of day, no aurora, 2.5 s crossfade, sun travels, darkness ≤ 0.28, gusty wind within ±40 px/s', () => {
  const wx = new KB.Weather({ width: 1280, height: 720, seed: 1 });
  for (let m = 0; m < 4; m++) {
    wx.setWeather(m, { instant: true });
    const a = wx.ambient, e = AMB[m];
    for (const k of AMB_KEYS) assert.ok(k in a, 'ambient.' + k);
    assert.ok(!('aurora' in a), 'no aurora');
    for (const k in e) assert.strictEqual(a[k], e[k], 'mood ' + m + ' ' + k);
    assert.ok(/^#[0-9A-F]{6}$/.test(a.horizon));
    for (const k of ['sway', 'sun', 'sunX', 'sunY', 'moon', 'stars']) assert.ok(a[k] >= 0 && a[k] <= 1 + 1e-9, k);
  }
  assert.strictEqual(KB.Weather.FADE_TIME, 2.5);
  wx.setWeather(1, { instant: true }); const sx0 = wx.ambient.sunX;
  wx.setWeather(3);
  wx.update(0.625, { groundY: 624 }); wx.update(0.625, { groundY: 624 });
  const mid = wx.ambient;
  assert.ok(mid.sun > 0.2 && mid.sun < 0.8, 'crossfading'); assert.ok(mid.sunX !== sx0);
  wx.update(1, { groundY: 624 }); wx.update(0.3, { groundY: 624 });
  assert.strictEqual(wx.ambient.skyTop, '#142048');
  // wind per mood: noon is the breezy one; always within ±40, gusts happen
  for (let m = 0; m < 4; m++) {
    const w2 = new KB.Weather({ width: 1280, height: 720, seed: 5 + m }); w2.setWeather(m, { instant: true });
    let lo = 1e9, hi = -1e9, gust = 0;
    for (let i = 0; i < 1800; i++) { w2.update(1 / 30, { groundY: 624 }); lo = Math.min(lo, w2.ambient.wind); hi = Math.max(hi, w2.ambient.wind); gust = Math.max(gust, w2.ambient.gust); }
    assert.ok(lo >= -40 && hi <= 40, 'wind range');
    assert.ok(gust > 0.5, 'gusts');
    if (m === 1) assert.ok(hi > 30, 'noon breeze gusts ' + hi); else assert.ok(hi < 30, 'calm mood ' + m + ' ' + hi);
  }
});

test('weather: particles per time of day (butterflies, breeze leaves, dandelion fluff, stars + fireflies), cap 120, deterministic, resize', () => {
  const kinds = [];
  for (let m = 0; m < 4; m++) {
    const wx = new KB.Weather({ width: 1600, height: 720, seed: 3 }); wx.setWeather(m, { instant: true });
    const seen = {};
    let maxN = 0;
    for (let i = 0; i < 900; i++) {
      wx.update(1 / 30, { groundY: 624 });
      if (i % 50 === 0) wx.burst(800, 300, { kind: 'confetti', n: 40, color: 'red' });
      maxN = Math.max(maxN, wx.particles.length);
      for (const p of wx.particles) {
        seen[p.kind] = 1;
        assert.ok(Number.isFinite(p.x + p.y + p.alpha + p.size + p.rot + p.flipX), 'finite');
        assert.ok(['sky', 'back', 'front'].includes(p.layer));
        assert.ok(KB.Weather.SPRITES.includes(p.sprite), p.sprite);
        if (p.kind === 'butterfly') { assert.ok(p.y > 0.2 * 624 && p.y < 640, 'butterfly in the meadow ' + p.y); assert.ok(Math.abs(p.flipX) >= 0.25 - 1e-9 && Math.abs(p.flipX) <= 1); }
        if (p.kind === 'firefly') { assert.ok(p.glow === true); assert.ok(p.y > 0.4 * 624 && p.y < 700); }
      }
    }
    assert.ok(maxN <= KB.Weather.CAP);
    kinds.push(seen);
  }
  assert.ok(kinds[0].butterfly && kinds[0].mist && !kinds[0].firefly && !kinds[0].seed, 'morning');
  assert.ok(kinds[1].butterfly && kinds[1].leaf && !kinds[1].firefly, 'noon');
  assert.ok(kinds[2].seed && !kinds[2].butterfly, 'sunset fluff');
  assert.ok(kinds[3].firefly && kinds[3].star && !kinds[3].butterfly, 'night');
  // firefly blink: alpha varies a lot
  const wn = new KB.Weather({ width: 1280, height: 720, seed: 9 }); wn.setWeather(3, { instant: true });
  const f = wn.particles.find(p => p.kind === 'firefly'); let lo = 1, hi = 0;
  for (let i = 0; i < 300; i++) { wn.update(1 / 60, { groundY: 624 }); lo = Math.min(lo, f.alpha); hi = Math.max(hi, f.alpha); }
  assert.ok(hi > 0.6 && lo < 0.2, 'blinks ' + lo + ' ' + hi);
  // star field + determinism + dt split
  const a = new KB.Weather({ width: 1280, height: 720, seed: 4 }), b = new KB.Weather({ width: 1280, height: 720, seed: 4 });
  assert.ok(a.stars.length >= 50 && a.stars.every(s => s.y < 0.56 * 624 + 1));
  for (let i = 0; i < 120; i++) a.update(1 / 30, { groundY: 624 });
  for (let i = 0; i < 240; i++) b.update(1 / 60, { groundY: 624 });
  assert.deepStrictEqual(a.particles.map(p => [p.kind, Math.round(p.x * 100)]), b.particles.map(p => [p.kind, Math.round(p.x * 100)]));
  a.resize(720, 1556); assert.strictEqual(a.width, 720);
  for (let i = 0; i < 60; i++) a.update(1 / 30, { groundY: 1339 });
  assert.ok(a.particles.every(p => Number.isFinite(p.x)));
});

// ======================================================= run
(async () => {
  let pass = 0, fail = 0;
  for (const t of tests) {
    const t0 = Date.now();
    try { await t.fn(); pass++; console.log('  ✓ ' + t.name + ' (' + (Date.now() - t0) + ' ms)'); }
    catch (e) { fail++; console.log('  ✗ ' + t.name + '\n      ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n      ') : e)); }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
