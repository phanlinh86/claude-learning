#!/usr/bin/env node
// Momo's Toy Train — headless unit tests for rng / content / world / weather / bot.
// Run from projects/education-game/owl-toy-train:   node tests/unit/run.js [name part]   (exit 1 on any failure)
// (tests/unit/i18n_voice.test.js is the voice engineer's suite and runs on its own.)
'use strict';
const assert = require('assert');
const crypto = require('crypto');
const { load } = require('./load');

const TT = load();
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const H = 1 / 120;
const AGES = [3, 4, 5, 6, 7];
const LANGS = ['en', 'vi'];
const C = TT.Content;
const CFG = TT.CONFIG;
const TOPICS = C.TOPICS;
const J = v => JSON.parse(JSON.stringify(v));   // objects from the vm sandbox have other prototypes
assert.deepStrictEqual = ((orig) => (a, b, m) => orig(J(a), J(b), m))(assert.deepStrictEqual);

// independent copies of the DESIGN tables (§5.1)
const AGE_TOPICS = { 3: ['colors', 'shapes', 'size', 'homes'], 4: ['colors', 'shapes', 'count', 'homes'],
  5: ['shapes', 'count', 'letters', 'homes'], 6: ['lower', 'initial', 'add', 'count'], 7: ['initial', 'add', 'sub', 'oddeven'] };
const CLASH = [['blue', 'purple'], ['red', 'green'], ['yellow', 'orange'], ['green', 'orange']];
const HOMES = { barn: ['cow', 'pig', 'sheep'], pond: ['duck', 'frog', 'fish'], tree: ['bird', 'squirrel', 'butterfly'], burrow: ['bunny', 'mouse', 'fox'] };
function carsWant(topic, age, ri) {
  if (topic === 'count') return ri <= 2 || age === 5 ? 1 : 2;
  if (ri === 0 || topic === 'size' || topic === 'oddeven' || age <= 3) return 2;
  if (age === 5 && ri >= 2) return 4;
  return 3;
}
const VIEWPORTS = [
  { W: 1556, H: 720, ins: null, name: 'iPhone landscape' },
  { W: 1556, H: 720, ins: { top: 0, right: 108, bottom: 38, left: 108 }, name: 'iPhone landscape notch' },
  { W: 720, H: 1556, ins: null, name: 'iPhone portrait' },
  { W: 720, H: 1556, ins: { top: 108, right: 0, bottom: 62, left: 0 }, name: 'iPhone portrait notch' },
  { W: 960, H: 720, ins: null, name: 'iPad landscape 4:3' },
  { W: 960, H: 720, ins: { top: 32, right: 0, bottom: 27, left: 0 }, name: 'iPad landscape insets' },
  { W: 720, H: 960, ins: null, name: 'iPad portrait' },
  { W: 720, H: 960, ins: { top: 32, right: 0, bottom: 27, left: 0 }, name: 'iPad portrait insets' },
  { W: 1180, H: 820, ins: null, name: '1180×820' },
  { W: 1280, H: 720, ins: null, name: '16:9' },
  { W: 1600, H: 720, ins: null, name: '1600×720' },
  { W: 720, H: 1600, ins: { top: 44, right: 0, bottom: 34, left: 0 }, name: '720×1600 tall insets' },
  { W: 1080, H: 720, ins: { top: 24, right: 44, bottom: 20, left: 44 }, name: 'iPad Pro landscape insets' },
  { W: 720, H: 1036, ins: { top: 21, right: 0, bottom: 18, left: 0 }, name: 'iPad 820×1180 portrait' },
  { W: 720, H: 1280, ins: { top: 37, right: 0, bottom: 0, left: 0 }, name: 'iPhone SE portrait' },
  { W: 1280, H: 720, ins: { top: 0, right: 37, bottom: 21, left: 37 }, name: 'iPhone SE landscape' }
];
const ROTATE = [VIEWPORTS[0], VIEWPORTS[4], VIEWPORTS[2], VIEWPORTS[8]];   // 1556×720, 960×720, 720×1556, 1180×820
const VP = VIEWPORTS[4];

// ---------- helpers ----------
function mkWorld(o) {
  o = o || {};
  const cfg = Object.assign(o.surprise ? {} : { surpriseTypes: [] }, o.config || {});
  const w = new TT.World({ seed: o.seed || 1, age: o.age || 4, lang: o.lang || 'en', config: cfg });
  const v = o.vp || VP;
  w.setViewport(v.W, v.H, v.ins);
  w.newSession(); w.drainEvents();
  return w;
}
/** Starts round `ri` of `topic` directly (skips the intro) and runs to the load phase. */
function roundOf(w, topic, ri, surprise) {
  w.levels = [topic, topic, topic, topic];
  w.startLevel(0); w.round = ri || 0;
  w.cfg.surpriseRound = ri || 0; w.cfg.surpriseTypes = surprise ? [surprise] : [];
  w._beginRound();
  until(w, () => w.phase === 'load');
  return w;
}
function run(w, s, each) { const n = Math.round(s / H); for (let i = 0; i < n; i++) { if (each) each(i); w.update(H); } }
function until(w, fn, max) { let n = 0; while (!fn() && n++ < (max || 36000)) w.update(H); assert.ok(fn(), 'condition not reached (now ' + w.state + '/' + w.phase + ')'); }
function evs(w) { return w.drainEvents(); }
function rest(w) { return w.items.filter(i => i.state === 'rest'); }
function types(e) { return e.map(x => x.type); }
/** A real drag: press on the cargo, move over `frames` frames to (x, y), lift. → pointerUp result */
function drag(w, it, x, y, frames) {
  const id = w.pointerDown(it.x, it.y);
  assert.strictEqual(id, it.id, 'grabbed ' + id + ' instead of ' + it.id);
  const x0 = it.x, y0 = it.y, n = frames || 10;
  for (let k = 1; k <= n; k++) { w.pointerMove(x0 + (x - x0) * k / n, y0 + (y - y0) * k / n); w.update(1 / 60); }
  return w.pointerUp(x, y);
}
function dropOn(w, it, car, frames) { const b = w.carBox(car); return drag(w, it, b.x, b.floorY - 30, frames); }
function wrongCar(w, it) { return w.cars.find(c => c.id !== w.answerCarId(it.id)); }
function settle(w, s) { run(w, s || 1); }
function inScreen(w, x, y, pad) { pad = pad || 0; return x >= -pad && x <= w.layout.W + pad && y >= -pad && y <= w.layout.H + pad; }
function finite(w) {
  for (const it of w.items) for (const k of ['x', 'y', 'rot', 'sx', 'sy', 'size', '_px', '_py']) if (!isFinite(it[k])) return 'item ' + k;
  for (const k of ['x', 'v', 'wheelRot', 'whistle', 'glow']) if (!isFinite(w.train[k])) return 'train ' + k;
  for (const c of w.train.couple) if (!isFinite(c.dx) || !isFinite(c.s)) return 'couple';
  for (const c of w.cars) for (const k of ['ox', 'sq', 'shake', 'glow', 'done']) if (!isFinite(c[k])) return 'car ' + k;
  return null;
}
function hashEvents(list) {
  const h = crypto.createHash('sha1');
  for (const e of list) h.update(JSON.stringify(e, (k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)));
  return h.digest('hex').slice(0, 12);
}
/** A full session with the bot; → { w, events, roundTimes, t } */
function botSession(age, seed, vp, skill, dt, lang) {
  const w = new TT.World({ seed, age, lang: lang || 'en' });
  w.setViewport(vp.W, vp.H, vp.ins);
  w.newSession();
  const bot = new TT.Bot(w, { skill: skill === undefined ? 0.8 : skill, seed: seed + 5 });
  const all = [], rt = [];
  let t = 0, r0 = 0;
  dt = dt || 1 / 30;
  while (w.state !== 'sessionDone' && t < 1500) {
    bot.step(dt); w.update(dt); t += dt;
    const bad = finite(w); if (bad) throw new Error('NaN: ' + bad);
    for (const e of w.drainEvents()) { all.push(e); if (e.type === 'round') r0 = w.time; if (e.type === 'roundDone') rt.push(w.time - r0); }
  }
  return { w, events: all, roundTimes: rt, t, bot };
}

// ====================================================================== rng
test('rng: deterministic, ranges, sample, fork', () => {
  const a = new TT.RNG(42), b = new TT.RNG(42);
  for (let i = 0; i < 100; i++) assert.strictEqual(a.next(), b.next());
  const r = new TT.RNG(7);
  for (let i = 0; i < 2000; i++) { const v = r.int(2, 5); assert.ok(v >= 2 && v <= 5 && Number.isInteger(v)); const f = r.float(1, 2); assert.ok(f >= 1 && f < 2); }
  const s = r.sample([1, 2, 3, 4, 5], 3); assert.strictEqual(new Set(s).size, 3);
  const f1 = new TT.RNG(9).fork('x'), f2 = new TT.RNG(9).fork('x'); assert.strictEqual(f1.next(), f2.next());
});

// ====================================================================== content
test('content: every topic × age × lang × 4 rounds × 60 seeds is completable and follows the rules', () => {
  let n = 0;
  for (const topic of TOPICS) for (const age of AGES) for (const lang of LANGS) for (let seed = 1; seed <= 60; seed++) {
    const rng = new TT.RNG(seed * 1009 + age * 31 + (lang === 'vi' ? 7 : 0));
    let prev = null;
    for (let ri = 0; ri < 4; ri++) {
      const r = C.makeRound(topic, { age, lang, rng, roundIndex: ri, surprise: ri === 2 ? 'hitch' : null, prevKey: prev ? prev.key : null });
      n++;
      const tag = `${topic} age ${age} ${lang} seed ${seed} r${ri}`;
      assert.strictEqual(C.validate(r), null, tag);
      assert.strictEqual(r.cars.length, carsWant(topic, age, ri), tag + ': cars');
      assert.ok(r.items.length >= 1 && r.items.length <= 14, tag + ': items');
      if (ri === 0) assert.strictEqual(r.surprise, null, tag + ': no surprise in the warm-up');
      // colours: no clash / pink below age 5 (cars and cargo together)
      const cs = [...new Set(r.cars.map(c => c.label.color).concat(r.items.filter(i => ['block', 'shape', 'size'].includes(i.kind)).map(i => i.color)).filter(Boolean))];
      if (age < 5) {
        for (const [p, q] of CLASH) assert.ok(!(cs.includes(p) && cs.includes(q)), tag + ': clash ' + p + '+' + q);
        assert.ok(!cs.includes('pink'), tag + ': pink');
      }
      if (r.mode === 'count') {
        const needs = r.cars.map(c => c.need), sum = needs.reduce((a, b) => a + b, 0);
        assert.ok(r.items.length >= sum, tag + ': not enough cargo');
        assert.ok(r.items.every(i => i.answer === null && i.kind === 'sprite' && i.cargo === r.items[0].cargo), tag + ': one cargo kind');
        if (ri === 0) assert.ok(needs.length === 1 && needs[0] >= 1 && needs[0] <= 2, tag + ': warm-up N 1–2');
        if (ri === 1) assert.ok(needs.length === 1 && needs[0] >= 2 && needs[0] <= 4, tag + ': round 1 N 2–4');
        if (age <= 4) assert.ok(sum <= 6, tag + ': ΣN ≤ 6');
        if (age === 5) assert.ok(needs.length === 1 && sum <= 10, tag + ': age 5 ≤ 10');
        if (age >= 6) assert.ok(sum <= 12, tag + ': ≤ 12');
        if (needs.length === 2) assert.notStrictEqual(needs[0], needs[1], tag + ': N1 ≠ N2');
        r.cars.forEach(c => assert.strictEqual(!!c.label.showDots, age <= 4 && c.need <= 5, tag + ': dots'));
      } else {
        // independent re-derivation of the right car
        for (const it of r.items) {
          const car = r.cars.find(c => c.id === it.answer);
          assert.ok(car, tag + ': item without a car');
          const L = car.label;
          let ok;
          switch (topic) {
            case 'colors': ok = it.kind === 'block' && it.color === L.value; break;
            case 'shapes': ok = it.kind === 'shape' && it.shape === L.value && (age >= 5 || it.color === L.color); break;
            case 'size': ok = it.kind === 'size' && it.size === L.value && it.color === L.color; break;
            case 'homes': ok = HOMES[L.value].includes(it.animal); break;
            case 'letters': ok = it.text === L.value; break;
            case 'lower': ok = it.text === L.value.toLowerCase() && it.text !== L.value && !['i', 'l'].includes(it.text); break;
            case 'initial': ok = TT.WORDS[lang].find(x => x.animal === it.animal).initial === L.value; break;
            case 'add': ok = it.n === L.a + L.b && L.value === L.a + '+' + L.b; break;
            case 'sub': ok = it.n === L.a - L.b && it.n >= 0 && L.a <= 10; break;
            case 'oddeven': ok = (it.n % 2 ? 'odd' : 'even') === L.value; break;
          }
          assert.ok(ok, tag + ': ' + JSON.stringify(it) + ' → ' + JSON.stringify(L));
          // exactly one car fits
          assert.strictEqual(r.cars.filter(c => C.fits(c, it, lang)).length, 1, tag + ': fits one car');
        }
        const per = r.cars.map(c => r.items.filter(i => i.answer === c.id).length);
        assert.ok(per.every(m => m >= 1), tag + ': a car without cargo');
        if (ri === 0) assert.ok(per.every(m => m === 1) && r.cars.length === 2, tag + ': warm-up = 2 cars × 1');
        else assert.ok(per.every(m => m <= 2), tag + ': ≤ 2 per car');
        assert.ok(r.items.length <= (age <= 4 ? 5 : 6), tag + ': total cargo');
        assert.strictEqual(new Set(r.cars.map(c => c.label.type + c.label.value)).size, r.cars.length, tag + ': distinct cars');
      }
      if (prev) assert.notStrictEqual(r.key, prev.key, tag + ': identical consecutive rounds');
      prev = r;
    }
  }
  assert.ok(n > 10000);
});

test('content: deterministic by seed; prompt keys / params', () => {
  for (const topic of TOPICS) {
    const a = C.makeRound(topic, { age: 5, lang: 'en', rng: new TT.RNG(3), roundIndex: 2 });
    const b = C.makeRound(topic, { age: 5, lang: 'en', rng: new TT.RNG(3), roundIndex: 2 });
    assert.deepStrictEqual(a, b);
  }
  const c1 = C.makeRound('count', { age: 4, lang: 'en', rng: new TT.RNG(1), roundIndex: 1 });
  assert.strictEqual(c1.promptKey, 'p.count'); assert.strictEqual(c1.params.n, c1.cars[0].need); assert.ok(TT.CARGO.includes(c1.params.cargo));
  let two = 0;
  for (let s = 0; s < 40; s++) { const r = C.makeRound('count', { age: 4, lang: 'en', rng: new TT.RNG(s), roundIndex: 3 }); if (r.promptKey === 'p.count2') { two++; assert.deepStrictEqual([r.params.a, r.params.b], r.cars.map(c => c.need)); } }
  assert.ok(two > 0);
  assert.strictEqual(C.makeRound('homes', { age: 3, rng: new TT.RNG(1) }).promptKey, 'p.homes');
});

test('content: VI initials avoid digraph words; lower rounds never use I/l', () => {
  for (const w of TT.WORDS.vi) assert.ok(!/^(ch|th|nh|ph|kh|gi|ng|tr)/i.test(w.word) && w.animal !== 'frog', w.word);
  for (const w of TT.WORDS.en) assert.strictEqual(w.word[0].toUpperCase(), w.initial);
  for (const l of [...TT.WORDS.en, ...TT.WORDS.vi]) assert.ok(TT.ANIMALS.includes(l.animal));
  for (let s = 0; s < 200; s++) for (const lang of LANGS) {
    const r = C.makeRound('lower', { age: 6, lang, rng: new TT.RNG(s), roundIndex: 3 });
    for (const c of r.cars) assert.ok(!'IL'.includes(c.label.value));
  }
});

test('content: topics — AGE_TOPICS first, rotation differs, chapters from the pool', () => {
  for (const age of AGES) {
    assert.deepStrictEqual(C.topicsFor(age), AGE_TOPICS[age]);
    assert.deepStrictEqual(C.topicsFor(age, new TT.RNG(1), null), AGE_TOPICS[age], 'first session');
    for (let s = 0; s < 30; s++) {
      const t = C.topicsFor(age, new TT.RNG(s), AGE_TOPICS[age]);
      assert.strictEqual(t.length, 4); assert.strictEqual(new Set(t).size, 4);
      assert.ok(t.every(x => TT.AGE_POOLS[age].includes(x)));
      assert.notStrictEqual(t[0], AGE_TOPICS[age][0], 'chapter 1 rotates');
    }
  }
  assert.strictEqual(C.topicsFor(4)[0], 'colors', 'the default age starts trivially easy');
});

test('content: Talk time for every topic × age × lang', () => {
  for (const topic of TOPICS) for (const age of AGES) for (const lang of LANGS) for (let s = 0; s < 25; s++) {
    const t = C.makeTalk(topic, { age, lang, rng: new TT.RNG(s * 13 + age) });
    assert.strictEqual(t.promptKey, 'talk.' + topic);
    assert.ok(t.choices.length >= 2 && t.choices.length <= 5);
    assert.strictEqual(new Set(t.choices.map(c => c.id)).size, t.choices.length);
    assert.strictEqual(t.choices.filter(c => c.id === t.answerId).length, 1);
    assert.strictEqual(new Set(t.choices.map(c => JSON.stringify(Object.assign({}, c, { id: 0 })))).size, t.choices.length, 'distinct choices');
  }
});

// ====================================================================== layout
test('layout: every viewport × 1–4 cars: on screen, rug clear of drop zones / HUD / bubble / engine', () => {
  for (const v of VIEWPORTS) for (let n = 1; n <= 4; n++) for (const caps of [[1, 1, 1, 1], [2, 2, 2, 2], [12, 3, 2, 2]]) {
    const L = TT.World.computeLayout(v.W, v.H, v.ins, {}, { n, caps: caps.slice(0, n) });
    const ins = L.ins, tag = v.name + ' n' + n + ' caps ' + caps;
    assert.ok(L.engine.x0 >= ins.left + CFG.engineX - 1e-6, tag + ': engine left');
    const last = L.cars[n - 1];
    assert.ok(last.x1 <= v.W - ins.right - 20 + 1e-6, tag + ': cars fit');
    for (let i = 1; i < n; i++) assert.ok(Math.abs(L.cars[i].x0 - L.cars[i - 1].x1 - 16) < 1e-6, tag + ': gap 16');
    assert.ok(L.cars[0].x0 - L.engine.x1 > 15.99, tag + ': engine gap');
    assert.ok(L.carW <= 260 && L.carW >= 100, tag + ': carW ' + L.carW);
    assert.ok(L.carH >= 96 && L.carH <= 150);
    assert.ok(L.trackY < L.groundY && L.trackY > v.H * 0.4, tag + ': track');
    assert.ok(L.whistle.y > ins.top + 96 && inBounds(L.whistle, v), tag + ': whistle');
    assert.ok(L.tunnelX <= ins.left, tag + ': tunnel');
    assert.ok(L.rug.y1 >= L.rug.y0, tag + ': rug');
    for (const c of L.cars) {
      assert.ok(c.slots.length === caps[c.index], tag + ': slots');
      for (const s of c.slots) assert.ok(s.x > c.x0 && s.x < c.x1 && s.y < c.floorY, tag + ': slot inside its car');
      if (c.slots.length <= 6 && c.slots.length > 1) {   // within a row: ≥ 0.45·S apart (or ≥ half a cargo in a narrow car)
        const cs = L.S * c.scale, want = Math.min(0.45 * L.S, 0.5 * cs, (0.86 * c.w - 0.5 * cs));
        for (const a of c.slots) for (const b of c.slots) if (a !== b && a.row === b.row) assert.ok(Math.abs(a.x - b.x) >= want - 1e-6, tag + ': slot spacing ' + Math.abs(a.x - b.x));
        for (const a of c.slots) for (const b of c.slots) if (a.row < b.row) assert.ok(b.y < a.y, tag + ': back rows are raised');
      }
    }
    // the rug ends ≥ 44 px above every drop zone (car top − 90)
    const minTop = Math.min(...L.cars.map(c => c.y0));
    assert.ok(L.rug.y1 <= minTop - 90 - 44 + 1e-6, tag + ': rug in a drop zone');
    assert.ok(L.rug.y0 >= L.bubble.y + L.bubble.h + 40 + L.S / 2 - 1e-6, tag + ': rug under the bubble');
  }
  function inBounds(p, v) { return p.x > 0 && p.x < v.W && p.y > 0 && p.y < v.H; }
});

test('layout: resting cargo of real rounds is on screen, clear of HUD / bubble / engine / drop zones (all viewports)', () => {
  let worst = 1;
  for (const v of VIEWPORTS) for (const age of AGES) for (const topic of ['colors', 'count', 'homes', 'add']) for (const ri of [1, 3]) {
    const w = mkWorld({ age, vp: v, seed: age * 7 + ri });
    roundOf(w, topic, ri);
    const L = w.layout, tag = v.name + ' age ' + age + ' ' + topic + ' r' + ri;
    worst = Math.min(worst, w.packShrink);
    assert.ok(w.packShrink >= 0.6, tag + ': cargo shrunk to ' + w.packShrink);
    const hud = { x: v.W - L.ins.right - 160, y: 0, w: 160 + L.ins.right, h: L.ins.top + 96 };
    for (const it of w.items) {
      const r = it.restSize / 2, tg = tag + ' ' + it.id;
      assert.ok(it.homeX - r >= 0 && it.homeX + r <= v.W && it.homeY - r >= 0, tg + ': off screen');
      assert.ok(!(it.homeX + r > hud.x && it.homeY - r < hud.y + hud.h), tg + ': under the HUD');
      const B = L.bubble;
      assert.ok(!(it.homeX + r > B.x && it.homeX - r < B.x + B.w && it.homeY - r < B.y + B.h && it.homeY + r > B.y), tg + ': under the bubble');
      assert.ok(!w.carAt(it.homeX, it.homeY) && !w.carAt(it.homeX, it.homeY + 43.9), tg + ': within 44 px of a drop zone');
      assert.ok(Math.hypot(it.homeX - L.whistle.x, it.homeY - L.whistle.y) > L.whistle.r + 26 + 0.4 * it.restSize, tg + ': on the whistle');
      assert.ok(2 * w._hitR(it) >= 100, tg + ': touch target ≥ 100 px');
    }
    for (let i = 0; i < w.items.length; i++) for (let j = i + 1; j < w.items.length; j++) {
      const a = w.items[i], b = w.items[j];
      assert.ok(Math.hypot(a.homeX - b.homeX, a.homeY - b.homeY) >= 1.0 * Math.max(a.restSize, b.restSize), tag + ': overlapping cargo');
    }
  }
  assert.ok(worst >= 0.6);
});

// ====================================================================== world: flow
test('world: full bot sessions finish for every age (4 viewports, EN + VI), no stuck rounds, no NaN', () => {
  for (const age of AGES) for (const [k, v] of ROTATE.entries()) {
    const S = botSession(age, 100 + age * 10 + k, v, 0.8, 1 / 30, k % 2 ? 'vi' : 'en');
    const tag = 'age ' + age + ' ' + v.name;
    assert.strictEqual(S.w.state, 'sessionDone', tag + ': ended in ' + S.w.state + '/' + S.w.phase);
    const T = types(S.events);
    assert.strictEqual(T.filter(t => t === 'levelDone').length, 4, tag);
    assert.ok(S.roundTimes.length >= 12 && S.roundTimes.length <= 16, tag + ': rounds ' + S.roundTimes.length);
    assert.ok(Math.max(...S.roundTimes) < 120, tag + ': a stuck round ' + Math.max(...S.roundTimes).toFixed(0) + ' s');
    for (const t of ['arrive', 'deal', 'ask', 'grab', 'correct', 'land', 'carDone', 'loaded', 'whistle', 'depart', 'puff', 'clack', 'departed', 'roundDone', 'talk', 'talkResult', 'sessionDone'])
      assert.ok(T.includes(t), tag + ': no ' + t + ' event');
    const st = S.events.filter(e => e.type === 'roundDone').reduce((a, e) => a + e.stars, 0) + S.events.filter(e => e.type === 'talkResult' && e.correct).length;
    assert.strictEqual(S.w.stars, st, tag + ': stars add up');
    assert.ok(S.t < 8 * 60, tag + ': session ' + S.t.toFixed(0) + ' s');
  }
});

test('world: phases arrive → deal → load → whistle → depart → clear, events in order', () => {
  const w = mkWorld({ age: 4 });
  w.levels = ['colors', 'colors', 'colors', 'colors']; w.startLevel(0);
  until(w, () => w.state === 'round');
  assert.strictEqual(w.phase, 'arrive');
  const seen = [];
  let lastPhase = null;
  until(w, () => { if (w.phase !== lastPhase) { seen.push(w.phase); lastPhase = w.phase; } return w.phase === 'load'; });
  let e = types(evs(w));
  assert.ok(e.indexOf('round') < e.indexOf('arrive') && e.indexOf('arrive') < e.indexOf('deal') && e.indexOf('deal') < e.indexOf('ask'), e.join(','));
  const ask = w.prompt(); assert.strictEqual(ask.promptKey, 'p.colors');
  for (const it of rest(w).slice()) dropOn(w, it, w.carById(w.answerCarId(it.id)));
  until(w, () => w.phase === 'whistle');
  e = types(evs(w));
  assert.ok(e.indexOf('land') < e.indexOf('loaded'));
  assert.strictEqual(w.prompt().promptKey, 'loaded');
  const hb = w.whistleHit();
  assert.strictEqual(w.pointerDown(hb.x, hb.y), 'whistle'); w.pointerUp(hb.x, hb.y);
  assert.strictEqual(w.phase, 'depart');
  run(w, 0.35);
  assert.strictEqual(w.pointerDown(hb.x, hb.y), 'toot'); w.pointerUp(hb.x, hb.y);
  until(w, () => w.state === 'roundDone');
  e = evs(w);
  const rd = e.find(x => x.type === 'roundDone');
  assert.strictEqual(rd.stars, 3); assert.strictEqual(rd.misses, 0);
  assert.ok(types(e).indexOf('depart') < types(e).indexOf('departed'));
  assert.ok(types(e).includes('toot'));
  until(w, () => w.state === 'round' && w.round === 1);
  assert.strictEqual(w.phase, 'arrive');
});

test('world: arrive braking — x falls monotonically from W+120 to 0, couplings compress, a clack, wheels turn', () => {
  const w = mkWorld({ age: 4, vp: VIEWPORTS[0] });
  w.levels = ['colors', 'colors', 'colors', 'colors']; w.startLevel(0); w.round = 2;
  until(w, () => w.state === 'round');
  assert.ok(Math.abs(w.train.x - (w.layout.W + 120)) < 30);
  let px = w.train.x, minS = 0, maxS = 0, wr0 = w.train.wheelRot;
  const all = [];
  until(w, () => {
    assert.ok(w.train.x <= px + 1e-9, 'train backs up'); px = w.train.x;
    for (const c of w.train.couple) { minS = Math.min(minS, c.s); maxS = Math.max(maxS, c.s); assert.ok(c.s >= -12.001 && c.s <= 16.001); }
    all.push(...w.drainEvents());
    return w.phase !== 'arrive';
  });
  assert.strictEqual(w.train.x, 0);
  assert.ok(minS < -4, 'cars bunch up: ' + minS);
  assert.ok(all.some(e => e.type === 'clack'), 'a coupling clack');
  assert.ok(w.train.wheelRot < wr0 - 30, 'wheels rolled (left = negative)');
  // the couplings settle after the stop (damped)
  run(w, 2.5);
  for (const c of w.train.couple) assert.ok(Math.abs(c.s) < 0.6, 'settled ' + c.s);
});

test('world: depart — jolt, acceleration ≤ 900 px/s², couplings stretch in turn, cargo hops, puffs speed up', () => {
  const w = mkWorld({ age: 5, vp: VIEWPORTS[0] });
  roundOf(w, 'colors', 2);
  for (const it of rest(w).slice()) dropOn(w, it, w.carById(w.answerCarId(it.id)));
  until(w, () => w.phase === 'whistle');
  evs(w);
  const hb = w.whistleHit(); w.pointerDown(hb.x, hb.y); w.pointerUp(hb.x, hb.y);
  const firstPeak = w.train.couple.map(() => -1), puffT = [];
  let t = 0, maxV = 0, bounce = 0, ridesAlong = true;
  until(w, () => {
    t += H;
    for (const [i, c] of w.train.couple.entries()) if (firstPeak[i] < 0 && c.s > 2) firstPeak[i] = t;
    maxV = Math.max(maxV, -w.train.v);
    for (const it of w.items) {
      if (it.state !== 'in') continue;
      bounce = Math.min(bounce, it.bounce);
      const c = w.carById(it.carId), sl = c.slots[it.slot];
      if (Math.abs(it.x - (sl.x + c.ox + c.shake)) > 1e-6) ridesAlong = false;
    }
    for (const e of w.drainEvents()) if (e.type === 'puff') puffT.push(t);
    return w.state !== 'round';
  });
  assert.ok(maxV <= 900 + 1e-6 && maxV > 800, 'v max ' + maxV);
  assert.ok(firstPeak.every(x => x > 0), 'every coupling stretched');
  for (let i = 1; i < firstPeak.length; i++) assert.ok(firstPeak[i] > firstPeak[i - 1], 'in turn: ' + firstPeak);
  assert.ok(bounce < -2, 'cargo hops ' + bounce);
  assert.ok(ridesAlong, 'cargo rides in its car');
  const gaps = puffT.slice(1).map((x, i) => x - puffT[i]);
  assert.ok(gaps.length >= 2 && gaps[gaps.length - 1] < gaps[0] + 1e-9 && gaps[0] <= 0.25 + 1e-6, 'puffs speed up ' + gaps.map(g => g.toFixed(2)));
  assert.ok(t > 1.8 && t < 4.5, 'depart took ' + t.toFixed(2));
});

// ====================================================================== world: input rules
test('world: a tap is not a drop (even right above a car)', () => {
  const w = mkWorld({ age: 4 });
  roundOf(w, 'colors', 1);
  const it = rest(w)[0], hx = it.homeX, hy = it.homeY;
  evs(w);
  assert.strictEqual(w.pointerDown(it.x, it.y), it.id);
  w.pointerMove(it.x + 10, it.y + 15); w.update(1 / 60); w.update(1 / 60);
  assert.strictEqual(w.pointerUp(it.x + 10, it.y + 15), 'tap');
  let e = evs(w);
  assert.ok(types(e).includes('grab') && types(e).includes('tap'));
  assert.ok(!['drop', 'miss', 'wrong', 'hint', 'correct'].some(t => types(e).includes(t)), types(e).join(','));
  settle(w, 0.6);
  assert.strictEqual(it.state, 'rest'); assert.ok(Math.abs(it.x - hx) < 1e-6 && Math.abs(it.y - hy) < 4);
  assert.strictEqual(it.misses, 0); assert.strictEqual(w.misses, 0);
  // a slow press (> 0.35 s) without moving is a drop (a miss, not a mistake)
  w.pointerDown(it.x, it.y); run(w, 0.5); assert.strictEqual(w.pointerUp(it.x, it.y), 'miss');
  assert.strictEqual(w.misses, 0);
});

test('world: wrong drop → car shakes, cargo boings home; 2nd miss hints (cooldown 6 s); stars 3/2/1', () => {
  const w = mkWorld({ age: 4 });
  roundOf(w, 'colors', 1);
  const it = rest(w)[0], bad = wrongCar(w, it);
  evs(w);
  assert.strictEqual(dropOn(w, it, bad), 'wrong');
  let e = evs(w);
  const we = e.find(x => x.type === 'wrong');
  assert.ok(we && we.carId === bad.id && we.want.carId === w.answerCarId(it.id) && we.item.nameKind === 'color');
  run(w, 0.1); assert.ok(Math.abs(bad.shake) > 0.5, 'shake');
  settle(w, 0.8);
  assert.strictEqual(it.state, 'rest'); assert.ok(Math.abs(it.x - it.homeX) < 1e-6);
  assert.strictEqual(bad.shake, 0);
  assert.ok(!types(e).includes('hint'));
  dropOn(w, it, bad); e = evs(w);
  const h = e.find(x => x.type === 'hint');
  assert.ok(h && h.id === it.id && h.carId === w.answerCarId(it.id), 'the 2nd miss hints');
  assert.ok(w.hintHand && w.hintHand.kind === 'drag');
  run(w, 0.3); assert.ok(w.carById(h.carId).glow > 0.5 && it.glow > 0.5);
  settle(w, 0.5);
  dropOn(w, it, bad); e = evs(w);
  assert.ok(!types(e).includes('hint'), 'cooldown: no new hint within 6 s');
  assert.strictEqual(w.misses, 3);
  assert.strictEqual(w._starsFor(0), 3); assert.strictEqual(w._starsFor(1), 2); assert.strictEqual(w._starsFor(5), 1);
});

test('world: release outside every zone floats home (miss, not a mistake); right drop arcs into the car', () => {
  const w = mkWorld({ age: 4 });
  roundOf(w, 'shapes', 1);
  const it = rest(w)[0];
  assert.strictEqual(drag(w, it, w.layout.W / 2, w.layout.rug.y0 - 10 > 0 ? w.layout.rug.y0 : 200), 'miss');
  settle(w, 0.8); assert.strictEqual(it.state, 'rest'); assert.strictEqual(w.misses, 0);
  // dragged to the very top edge and let go: the float home stays on screen
  drag(w, it, it.x, 0, 12);
  until(w, () => { assert.ok(it.y >= 0 && it.y <= w.layout.H, 'off screen ' + it.y); return it.state === 'rest'; });
  evs(w);
  const car = w.carById(w.answerCarId(it.id));
  // dropping high (90 px above the car top) still counts
  assert.strictEqual(drag(w, it, w.carBox(car).x, car.y0 - 85), 'correct');
  assert.strictEqual(it.state, 'fly');
  let apex = 1e9; const y0 = it.y;
  until(w, () => { apex = Math.min(apex, it.y); return it.state === 'in'; });
  assert.ok(y0 - apex >= 55, 'arc apex ' + (y0 - apex));
  const e = evs(w);
  assert.ok(types(e).includes('correct') && types(e).includes('land'));
  assert.ok(it.inCar && car.items.includes(it.id));
  assert.ok(car.sq !== 0 || car.sqv !== 0, 'the car squashes');
});

test('world: count — correct counts i/n, full car → full (not a mistake), spare cargo waves bye', () => {
  const w = mkWorld({ age: 4 });
  roundOf(w, 'count', 1);
  const car = w.cars[0], n = car.need, counts = [], e = [];
  for (let k = 0; k < n; k++) {
    const it = rest(w)[0];
    assert.strictEqual(dropOn(w, it, car), 'correct');
    const ee = evs(w); e.push(...ee);
    counts.push(ee.find(x => x.type === 'correct').count.i + '/' + n);
    if (k < n - 1) settle(w, 0.6);
  }
  assert.deepStrictEqual(counts, Array.from({ length: n }, (_, i) => (i + 1) + '/' + n));
  assert.ok(types(e).includes('bye'), 'spare cargo leaves');
  until(w, () => w.phase === 'whistle');
  assert.strictEqual(w.items.filter(i => i.state !== 'in').length, 0);
  assert.strictEqual(w.misses, 0);
  // a full car: two-car round, fill car 0, then one more onto it
  const w2 = mkWorld({ age: 4, seed: 5 });
  roundOf(w2, 'count', 3);
  const c0 = w2.cars[0];
  for (let k = 0; k < c0.need; k++) { dropOn(w2, rest(w2)[0], c0); settle(w2, 0.6); }
  evs(w2);
  const extra = rest(w2)[0];
  assert.strictEqual(dropOn(w2, extra, c0), 'full');
  assert.ok(types(evs(w2)).includes('full'));
  settle(w2, 0.8);
  assert.strictEqual(extra.state, 'rest'); assert.strictEqual(w2.misses, 0);
  assert.strictEqual(w2.answerCarId(extra.id), w2.cars[1].id);
});

test('world: whistle nudge at 6 s (ghost hand taps), Momo toots it herself at CONFIG.whistleAuto (9 s)', () => {
  const w = mkWorld({ age: 3 });
  roundOf(w, 'colors', 0);
  for (const it of rest(w).slice()) dropOn(w, it, w.carById(w.answerCarId(it.id)));
  until(w, () => w.phase === 'whistle');
  evs(w);
  run(w, 5.9); assert.ok(!types(evs(w)).includes('whistleHint'));
  run(w, 0.2); assert.ok(types(evs(w)).includes('whistleHint')); assert.ok(w.hintHand && w.hintHand.kind === 'tap');
  run(w, CFG.whistleAuto - 6.2); assert.strictEqual(w.phase, 'whistle');
  run(w, 0.3);
  const e = evs(w).find(x => x.type === 'whistle');
  assert.ok(e && e.auto === true); assert.strictEqual(w.phase, 'depart'); assert.strictEqual(w.momo.mood, 'whistle');
  // the engine body counts as the whistle in the whistle phase
  const w2 = mkWorld({ age: 3, seed: 3 });
  roundOf(w2, 'colors', 0);
  for (const it of rest(w2).slice()) dropOn(w2, it, w2.carById(w2.answerCarId(it.id)));
  until(w2, () => w2.phase === 'whistle');
  const E = w2.layout.engine;
  assert.strictEqual(w2.pointerDown(E.x0 + 30, w2.layout.trackY - 40), 'whistle');
});

test('world: idle nudges 12 s → ×1.5 → … ≤ 30 s; the 2nd idle hints; a still drag times out after 6 s', () => {
  const w = mkWorld({ age: 4 });
  roundOf(w, 'homes', 1);
  evs(w);
  const at = [];
  let hints = 0;
  run(w, 100, () => { for (const e of w.drainEvents()) { if (e.type === 'idle') at.push(w.time); if (e.type === 'hint') hints++; } });
  const gaps = at.map((t, i) => t - (i ? at[i - 1] : at[0] - 12));
  assert.ok(Math.abs(gaps[0] - 12) < 0.05 && Math.abs(gaps[1] - 18) < 0.05 && Math.abs(gaps[2] - 27) < 0.05 && Math.abs(gaps[3] - 30) < 0.05, gaps.join(' '));
  assert.ok(hints >= 1, 'idle hint');
  const it = rest(w)[0];
  w.pointerDown(it.x, it.y); w.pointerMove(it.x + 60, it.y + 10);
  run(w, 5.9); assert.strictEqual(w.held, it.id);
  run(w, 0.2); assert.strictEqual(w.held, null);
  assert.ok(types(evs(w)).includes('stillDrag'));
  settle(w, 0.7); assert.strictEqual(it.state, 'rest');
  assert.strictEqual(w.pointerUp(it.x, it.y), null, 'the late lift does nothing');
});

test('world: manual hint + answerCarId + test hooks', () => {
  const w = mkWorld({ age: 5 });
  roundOf(w, 'letters', 2);
  evs(w);
  const cid = w.hint();
  const e = evs(w).find(x => x.type === 'hint');
  assert.ok(cid && e && e.carId === cid);
  assert.strictEqual(w.hint(), cid, 'no second hint while one shows');
  assert.strictEqual(evs(w).length, 0);
  run(w, 0.7);
  const H2 = w.hintHand; assert.ok(H2.x !== H2.x0 || H2.y !== H2.y0, 'the ghost hand drags');
  for (const it of w.items) {
    const b = w.itemHit(it.id); assert.ok(b.w >= 100 && Math.abs(b.x - it.x) < 1e-9);
    const c = w.carById(w.answerCarId(it.id)); assert.ok(c && C.fits(w.cur.cars[c.index], it.item, 'en'));
  }
  const cb = w.carBox(w.cars[0].id); assert.ok(cb.w === w.cars[0].w && cb.x > w.cars[0].x0);
  const mh = w.momoHit(), wh = w.whistleHit();
  assert.ok(mh.w > 60 && wh.w === 2 * (w.layout.whistle.r + 26));
  assert.strictEqual(w.pointerDown(mh.x, mh.y), 'momo');
  assert.strictEqual(w.pointerUp(mh.x, mh.y), 'pokeMomo');
  const pe = evs(w).find(x => x.type === 'pokeMomo');
  assert.strictEqual(pe.promptKey, 'p.letters');
  assert.strictEqual(w.pointerDown(wh.x, wh.y), 'toot', 'whistle during load = a fun toot');
  w.pointerUp(wh.x, wh.y);
});

test('world: one active pointer — a second press while dragging is ignored', () => {
  const w = mkWorld({ age: 4 });
  roundOf(w, 'colors', 1);
  const [a, b] = rest(w);
  assert.strictEqual(w.pointerDown(a.x, a.y), a.id);
  assert.strictEqual(w.pointerDown(b.x, b.y), null);
  assert.strictEqual(w.held, a.id);
});

test('world: rotation mid-drag / mid-flight / mid-arrive via setViewport stays clean (1556×720, 960×720, 720×1556, 1180×820)', () => {
  for (const from of ROTATE) for (const to of ROTATE) {
    if (from === to) continue;
    for (const topic of ['colors', 'count']) {
      const w = mkWorld({ age: 5, vp: from, seed: 11 });
      roundOf(w, topic, 2);
      const [a, b] = rest(w), car = w.carById(w.answerCarId(b.id));
      dropOn(w, b, car);                                     // b is flying into its car
      w.pointerDown(a.x, a.y); w.pointerMove(a.x + 100, a.y + 120); w.update(1 / 60);   // a is held
      w.setViewport(to.W, to.H, to.ins);
      const tag = from.name + ' → ' + to.name + ' ' + topic;
      assert.strictEqual(w.held, null, tag + ': drag cancelled');
      assert.strictEqual(b.state, 'in', tag + ': the arc finished');
      for (const it of w.items) {
        assert.ok(inScreen(w, it.x, it.y, 0) && inScreen(w, it._px, it._py, 0), tag + ': ' + it.id + ' off screen ' + it.x + ',' + it.y);
        if (it.state === 'in') { const c = w.carById(it.carId), s = c.slots[it.slot]; assert.ok(Math.abs(it.x - (s.x + c.ox + c.shake)) < 1e-6 && Math.abs(it.y - s.y) < 8, tag + ': slot'); }
        else { assert.ok(it.homeX >= w.layout.rug.x0 - 5 && it.homeX <= w.layout.rug.x1 + 5 && it.homeY <= w.layout.rug.y1 + 5, tag + ': re-packed'); }
      }
      assert.strictEqual(w.pointerUp(a.x, a.y), null);
      run(w, 0.5);
      assert.strictEqual(finite(w), null);
      for (const it of w.items) assert.ok(inScreen(w, it.x, it.y, 0), tag + ': after');
      // the round can still be finished
      for (const it of rest(w).slice()) { const cid = w.answerCarId(it.id); if (cid) { dropOn(w, it, w.carById(cid)); settle(w, 0.6); } }
      until(w, () => w.phase === 'whistle', 3000);
    }
    // mid-arrive
    const w3 = mkWorld({ age: 4, vp: from });
    w3.levels = ['colors', 'colors', 'colors', 'colors']; w3.startLevel(0);
    until(w3, () => w3.state === 'round' && w3.phaseTime > 0.8);
    const u = w3._arriveU;
    w3.setViewport(to.W, to.H, to.ins);
    assert.ok(Math.abs(w3.train.x - (to.W + 120) * (1 - u) * (1 - u)) < 1e-6);
    until(w3, () => w3.phase === 'load');
    assert.strictEqual(w3.train.x, 0);
  }
});

test('world: surprises — hitch bunny hops onto the last car and rides away; balloon tap; no score change', () => {
  const w = mkWorld({ age: 4, surprise: true });
  roundOf(w, 'colors', 2, 'hitch');
  assert.strictEqual(w.surprise, 'hitch');
  run(w, 2.6);
  assert.ok(types(evs(w)).includes('hitch'));
  until(w, () => w.hitch && w.hitch.state === 'ride');
  const last = w.cars[w.cars.length - 1];
  assert.ok(Math.abs(w.hitch.y - (last.y0 + 6)) < 2 && w.hitch.x < last.x1 + last.ox && w.hitch.x > last.x0 + last.ox);
  const hb = w.hitchHit();
  assert.strictEqual(w.pointerDown(hb.x, hb.y), 'hitch');
  assert.ok(types(evs(w)).includes('hitchTap')); assert.strictEqual(w.hitch.state, 'wave'); assert.strictEqual(w.misses, 0);
  for (const it of rest(w).slice()) dropOn(w, it, w.carById(w.answerCarId(it.id)));
  until(w, () => w.phase === 'whistle');
  const wh = w.whistleHit(); w.pointerDown(wh.x, wh.y); w.pointerUp();
  until(w, () => w.train.x < -300);
  assert.ok(w.hitch.x < last.x1 + w.layout.W, 'rides along');
  assert.ok(Math.abs(w.hitch.x - (last.x1 + last.ox - 0.3 * last.w)) < 1e-6);
  const w2 = mkWorld({ age: 4, surprise: true });
  roundOf(w2, 'shapes', 2, 'balloon');
  assert.ok(w2.balloon);
  const bb = w2.balloonHit();
  assert.ok(inScreen(w2, bb.x, bb.y));
  evs(w2);
  assert.strictEqual(w2.pointerDown(bb.x, bb.y), 'balloon');
  assert.ok(types(evs(w2)).includes('balloonTap'));
  run(w2, 0.2); assert.ok(w2.balloon.bob > 3, 'bob');
  assert.strictEqual(w2.stars, 0);
  // never in the warm-up; one surprise round per chapter, alternating
  const S = botSession(4, 77, VP, 0.9);
  const sr = S.events.filter(e => e.type === 'round' && e.surprise);
  assert.strictEqual(sr.length, 4);
  assert.ok(sr.every(e => e.round === 2));
  assert.ok(sr[0].surprise !== sr[1].surprise && sr[1].surprise !== sr[2].surprise);
});

test('world: chapter time limit — after ≥ 3 trains and > 75 s go to Talk time; Talk re-asks every 12 s, glows after 2', () => {
  const w = mkWorld({ age: 3 });
  w.levels = ['colors', 'shapes', 'size', 'homes']; w.startLevel(0);
  let r = 0;
  const bot = new TT.Bot(w, { skill: 1, seed: 1 });
  // a slow child: waits 25 s before every load
  until(w, () => {
    if (w.state === 'round' && w.phase === 'load' && w.phaseTime < 25) { w.update(H); return false; }
    bot.step(H);
    if (w.state === 'talk') return true;
    if (w.events.some(e => e.type === 'roundDone')) r += w.drainEvents().filter(e => e.type === 'roundDone').length;
    return false;
  }, 200000);
  assert.strictEqual(r, 3, 'cut after 3 trains');
  assert.strictEqual(w.roundsPerLevel, 3);
  evs(w);
  const asks = [];
  run(w, 37, () => { for (const e of w.drainEvents()) if (e.type === 'talkAsk') asks.push(e); });
  assert.strictEqual(asks.length, 3);
  assert.strictEqual(asks[0].glowAnswer, false); assert.strictEqual(asks[1].glowAnswer, true);
  assert.ok(w.talkAnswer(w.talk.answerId));
  until(w, () => w.state === 'intro' && w.level === 1);
});

test('world: determinism — same seed → same events; frame size does not matter', () => {
  const a = botSession(4, 9, VIEWPORTS[0], 0.7), b = botSession(4, 9, VIEWPORTS[0], 0.7);
  assert.strictEqual(hashEvents(a.events), hashEvents(b.events));
  const c = botSession(4, 10, VIEWPORTS[0], 0.7);
  assert.notStrictEqual(hashEvents(a.events), hashEvents(c.events));
  // recorded inputs replayed with other frame splits
  function rec(dt) {
    const w = mkWorld({ age: 5, seed: 21 }), log = [], out = [];
    const bot = new TT.Bot(w, { skill: 0.7, seed: 4 });
    for (const k of ['pointerDown', 'pointerMove', 'pointerUp', 'talkAnswer']) { const f = w[k].bind(w); w[k] = (...x) => { log.push({ t: w.time, k, x }); return f(...x); }; }
    for (let t = 0; t < 120; t += dt) { bot.step(dt); w.update(dt); out.push(...w.drainEvents()); }
    return { log, hash: hashEvents(out), end: w.time };
  }
  const R = rec(1 / 30);
  for (const dt of [1 / 120, 1 / 60]) {
    const w = mkWorld({ age: 5, seed: 21 }), out = [];
    let i = 0;
    while (w.time < R.end - 1e-9) {
      while (i < R.log.length && R.log[i].t <= w.time + 1e-9) { const c = R.log[i++]; w[c.k](...c.x); }
      const next = i < R.log.length ? R.log[i].t : R.end, st = Math.min(dt, Math.max(H, Math.round((next - w.time) / H) * H));
      w.update(st + 1e-12); out.push(...w.drainEvents());
    }
    assert.strictEqual(hashEvents(out), R.hash, 'replay at dt ' + dt);
  }
});

test('world: interpolation fields + alpha; speed mode (big dt) still finishes', () => {
  const w = mkWorld({ age: 4 });
  w.update(0.0123);
  assert.ok(w.alpha >= 0 && w.alpha < 1);
  const S = botSession(4, 3, VP, 0.9, 0.25);
  assert.strictEqual(S.w.state, 'sessionDone');
  const w2 = mkWorld({ age: 4 });
  roundOf(w2, 'colors', 1);
  const it = w2.items[0];
  for (const k of ['_px', '_py', '_prot', '_psize']) assert.ok(k in it);
  for (const k of ['_px', '_pwheelRot']) assert.ok(k in w2.train);
  assert.ok('_pdx' in w2.train.couple[0] && '_pox' in w2.cars[0] && '_psq' in w2.cars[0]);
});

test('world: setAge / setLang apply at the next session; newSession rotates chapter topics', () => {
  const w = mkWorld({ age: 4 });
  const first = w.levels.slice();
  assert.deepStrictEqual(first, AGE_TOPICS[4]);
  w.setAge(6); w.setLang('vi');
  assert.strictEqual(w.age, 4);
  w.lastTopics = first; w.setAge(4); w.newSession();
  assert.notStrictEqual(w.levels[0], first[0]);
  w.setAge(6); w.newSession({ lastTopics: null });
  assert.strictEqual(w.age, 6); assert.strictEqual(w.lang, 'vi');
});

// ====================================================================== weather
test('weather: moods, wall colours (DESIGN §3), skies, crossfade, caps, puffs', () => {
  const wx = new TT.Weather({ width: 1556, height: 720, seed: 3, groundY: 702 });
  const WALL = ['#F3E6CF', '#F6EBD8', '#F2D6C0', '#4B4F78'], SKY = [['#BFE3F5', '#FFF3D6'], ['#86CBF0', '#DFF2FB'], ['#F7A86B', '#FCD9A8'], ['#1D2350', '#3B3F7A']];
  const want = { 0: 'mote', 1: 'bubble', 2: 'feather', 3: 'sparkle' };
  for (let m = 0; m < 4; m++) {
    wx.setWeather(m, { instant: true });
    const a = wx.ambient;
    assert.strictEqual(a.wall, WALL[m]); assert.strictEqual(a.skyTop, SKY[m][0]); assert.strictEqual(a.skyBottom, SKY[m][1]);
    assert.strictEqual(a.mood, ['morning', 'noon', 'sunset', 'night'][m]);
    for (let i = 0; i < 300; i++) { wx.update(1 / 60); if (i % 5 === 0) wx.addPuff(300, 400, -600); }
    assert.ok(wx.particles.length <= 120);
    assert.ok(wx.particles.some(p => p.sprite === want[m]), 'mood particles ' + m);
    assert.ok(wx.particles.some(p => p.sprite === 'puff'));
    for (const p of wx.particles) { assert.ok(TT.Weather.SPRITES.includes(p.sprite), p.sprite); assert.ok(isFinite(p.x) && isFinite(p.y) && isFinite(p.alpha) && isFinite(p.size)); }
  }
  assert.ok(Math.abs(wx.ambient.darkness - 0.32) < 1e-9 && Math.abs(wx.ambient.lamp - 1) < 1e-9); assert.ok(wx.stars.length > 5 && wx.stars.every(s => s.alpha > 0));
  wx.setWeather(0);
  for (let i = 0; i < 75; i++) wx.update(1 / 60);
  const mid = wx.ambient.wall; assert.ok(mid !== WALL[0] && mid !== WALL[3]);
  for (let i = 0; i < 90; i++) wx.update(1 / 60);
  assert.strictEqual(wx.ambient.wall, WALL[0]);
  wx.burst(500, 300, { kind: 'confetti', n: 400 }); assert.ok(wx.particles.length <= 120);
  wx.resize(720, 1556, 1500); wx.update(1); assert.ok(wx.particles.every(p => isFinite(p.x)));
});

// ====================================================================== bot
test('bot: drives only the input API; skill 1 makes no mistakes; skill 0.3 still finishes', () => {
  const S = botSession(5, 5, VIEWPORTS[2], 1);
  assert.strictEqual(S.bot.stats.wrong, 0);
  assert.strictEqual(S.events.filter(e => e.type === 'roundDone').every(e => e.stars === 3), true);
  assert.ok(S.bot.stats.whistles >= 12);
  const S2 = botSession(3, 6, VIEWPORTS[4], 0.3);
  assert.strictEqual(S2.w.state, 'sessionDone');
  assert.ok(S2.bot.stats.wrong > 0);
  assert.ok(S2.events.some(e => e.type === 'hint'));
});

// ---------------------------------------------------------------------- QA round 1 rules
test('QA1: two taps (no drag) in a round → hint; ages ≤ 4: the 4th tap glides the toy into its car', () => {
  const w = mkWorld({ age: 4, seed: 5 });
  roundOf(w, 'colors', 1);
  const tap = it => { w.pointerDown(it.x, it.y); w.update(1 / 60); return w.pointerUp(it.x, it.y); };
  evs(w);
  let it = rest(w)[0];
  assert.strictEqual(tap(it), 'tap'); settle(w, 0.5);
  it = rest(w)[0]; assert.strictEqual(tap(it), 'tap');
  assert.ok(types(evs(w)).includes('hint'), 'hint after 2 taps');
  settle(w, 0.5); it = rest(w)[0]; tap(it); settle(w, 0.5);
  it = rest(w)[0]; const r = tap(it);
  assert.strictEqual(r, 'correct', 'the 4th tap loads the toy');
  settle(w, 1); assert.strictEqual(it.state, 'in');
  assert.strictEqual(w.misses, 0);
});
test('QA1: a release up to zoneUpFar above a car lands once the toy travelled ≥ aimTravel', () => {
  const w = mkWorld({ age: 4, seed: 7 });
  roundOf(w, 'colors', 1);
  const it = rest(w)[0], c = w.carById(w.answerCarId(it.id)), b = w.carBox(c);
  const y = c.y0 - CFG.zoneUp - 25;   // above the normal zone, inside zoneUpFar
  assert.strictEqual(w.pointerDown(it.x, it.y), it.id);
  const x0 = it.x, y0 = it.y, tx = x0 + (b.x > x0 ? -1 : 1) * 140;   // a wide swing first (travel ≥ aimTravel), then above the car
  for (let k = 1; k <= 8; k++) { w.pointerMove(x0 + (tx - x0) * k / 8, y0); w.update(1 / 60); }
  for (let k = 1; k <= 10; k++) { w.pointerMove(tx + (b.x - tx) * k / 10, y0 + (y - y0) * k / 10); w.update(1 / 60); }
  assert.strictEqual(w.pointerUp(b.x, y), 'correct');
  // a short release up there (no travel) is still a miss
  const w2 = mkWorld({ age: 4, seed: 7 });
  roundOf(w2, 'colors', 1);
  const it2 = rest(w2)[0], c2 = w2.carById(w2.answerCarId(it2.id)), b2 = w2.carBox(c2);
  if (Math.hypot(b2.x - it2.x, c2.y0 - CFG.zoneUp - 25 - it2.y) < CFG.aimTravel) assert.strictEqual(drag(w2, it2, b2.x, c2.y0 - CFG.zoneUp - 25, 6), 'miss');
});
test('QA1: spare count toys waving goodbye cannot be grabbed', () => {
  const w = mkWorld({ age: 4, seed: 2 });
  roundOf(w, 'count', 1);
  const need = w.cars.reduce((a, c) => a + c.need, 0);
  for (let k = 0; k < need; k++) { const it = rest(w)[0]; dropOn(w, it, w.carById(w.answerCarId(it.id))); }
  const spare = w.items.find(i => i._bye && (i.state === 'rest' || i.state === 'home'));
  if (spare) assert.notStrictEqual(w.pointerDown(spare.x, spare.y), spare.id);
});
test('QA1: balloon head stays on screen while parked (every viewport, after taps)', () => {
  for (const vp of VIEWPORTS) {
    const w = mkWorld({ age: 4, seed: 3, vp, surprise: true });
    roundOf(w, 'colors', 2, 'balloon');
    for (let k = 0; k < 5; k++) { const h = w._balloonHead(); w.pointerDown(h.x, h.y); w.pointerUp(h.x, h.y); run(w, 0.4, () => {
      const q = w._balloonHead();
      assert.ok(q.x + 0.3 * w.balloon.size <= vp.W - ((vp.ins && vp.ins.right) || 0) - 12 + 1e-6, vp.name + ': balloon head off screen ' + q.x);
    }); }
  }
});
test('QA1: portrait → ≤ 3 cars (age 5); size topic: the small car is visibly smaller', () => {
  const w = mkWorld({ age: 5, seed: 4, vp: VIEWPORTS[2] });
  for (const ri of [2, 3]) { roundOf(w, 'shapes', ri); assert.ok(w.cars.length <= 3, 'portrait cars ' + w.cars.length); }
  const w2 = mkWorld({ age: 5, seed: 4 });
  roundOf(w2, 'shapes', 2); assert.strictEqual(w2.cars.length, 4);
  const w3 = mkWorld({ age: 3, seed: 6 });
  roundOf(w3, 'size', 1);
  const big = w3.cars.find(c => c.label.value === 'big'), small = w3.cars.find(c => c.label.value === 'small');
  assert.ok(small.w < 0.8 * big.w && small.h < big.h, 'small car ' + small.w + ' vs ' + big.w);
});
test('QA1: content — no repeated car set / counting toy in a row; later warm-ups carry 3 toys at age ≥ 4; topic opener rotates', () => {
  const R = TT.RNG;
  for (const topic of ['colors', 'shapes', 'homes', 'count']) for (let seed = 1; seed <= 40; seed++) {
    const rng = new R(seed);
    let prev = null, toy = null;
    for (let ri = 0; ri < 4; ri++) {
      const r = C.makeRound(topic, { age: 4, lang: 'en', rng, roundIndex: ri, prevKey: prev, prevToy: toy });
      if (prev && ri > 0) assert.notStrictEqual(r.key.split('#')[0], prev.split('#')[0], topic + ' same cars');
      if (r.mode === 'count') { if (toy) assert.notStrictEqual(r.params.cargo, toy); toy = r.params.cargo; }
      prev = r.key;
    }
  }
  const r3 = C.makeRound('colors', { age: 4, rng: new R(3), roundIndex: 0, warm3: true });
  assert.strictEqual(r3.items.length, 3);
  const r0 = C.makeRound('colors', { age: 4, rng: new R(3), roundIndex: 0 });
  assert.strictEqual(r0.items.length, 2);
  const openers = new Set();
  let last = null;
  const rng = new R(9);
  for (let k = 0; k < 12; k++) { const t = C.topicsFor(4, rng, last); openers.add(t[0]); last = t; }
  assert.ok(openers.size >= 3, 'openers ' + [...openers]);
});

// ---------------------------------------------------------------------- runner
const only = process.argv[2];
let pass = 0, fail = 0;
const t0 = Date.now();
for (const t of tests) {
  if (only && !t.name.includes(only)) continue;
  const s = Date.now();
  try { t.fn(); pass++; console.log('✓ ' + t.name + ' (' + (Date.now() - s) + ' ms)'); }
  catch (e) { fail++; console.log('✗ ' + t.name + '\n    ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e)); }
}
console.log(`\n${pass} passed, ${fail} failed (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(fail ? 1 : 0);
