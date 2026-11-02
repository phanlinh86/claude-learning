#!/usr/bin/env node
// Bim's Rainbow Rocket — headless unit tests for rng / content / world / weather / bot.
// Run from projects/education-game/elephant-rainbow-rocket:   node tests/unit/run.js   (exit 1 on any failure)
// (tests/unit/i18n_voice.test.js is the voice engineer's suite and runs on its own.)
'use strict';
const assert = require('assert');
const crypto = require('crypto');
const { load } = require('./load');

const RR = load();
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const H = 1 / 120;
const hyp = (x, y) => Math.sqrt(x * x + y * y);
const AGES = [3, 4, 5, 6, 7];
const LANGS = ['en', 'vi'];
const TOPICS = RR.Content.TOPICS;
const C = RR.Content;
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
  const w = new RR.World({ seed: o.seed || 1, age: o.age || 4, lang: o.lang || 'en', config: cfg });
  const v = o.vp || VP;
  w.setViewport(v.W, v.H, v.ins);
  w.newSession(); w.drainEvents();
  return w;
}
/** Starts round `ri` of `topic` directly (skips the intro) and runs to the first ask. */
function roundOf(w, topic, ri) {
  w.levels = [topic, topic, topic, topic];
  w.startLevel(0); w.round = ri || 0; w._beginRound();
  untilPhase(w, 'ask');
  return w;
}
function run(w, s, each) { const n = Math.round(s / H); for (let i = 0; i < n; i++) { if (each) each(i); w.update(H); } }
function untilPhase(w, ph, max) { let n = 0; while (w.phase !== ph && n++ < (max || 12000)) w.update(H); assert.strictEqual(w.phase, ph, 'phase ' + ph + ' (now ' + w.state + '/' + w.phase + ')'); }
function until(w, fn, max) { let n = 0; while (!fn() && n++ < (max || 24000)) w.update(H); assert.ok(fn(), 'condition not reached'); }
function tapIsland(w, id) { const h = w.islandHit(id); const r = w.pointerDown(h.x, h.y); w.pointerUp(h.x, h.y); return r; }
function wrongIds(w) { const a = w.answerId(); return w.islands.filter(i => i.state === 'idle' && i.token && i.id !== a).map(i => i.id); }
function evs(w) { return w.drainEvents(); }
function hashEvents(list) {
  const h = crypto.createHash('sha1');
  for (const e of list) h.update(JSON.stringify(e, (k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)));
  return h.digest('hex').slice(0, 12);
}
/** Runs a full session with the bot; returns stats and checks the invariants on the way. */
function botSession(o) {
  const w = mkWorld(Object.assign({ surprise: true }, o));
  const b = new RR.Bot(w, { skill: o.skill !== undefined ? o.skill : 0.8, seed: (o.seed || 1) + 7 });
  const all = [];
  let t = 0, prevCam = w.camY, ask = null, maxItems = 0;
  const dt = o.dt || 1 / 30;
  while (w.state !== 'sessionDone' && t < 1500) {
    b.step(dt); w.update(dt); t += dt;
    assert.ok(w.camY <= prevCam + 1e-9, 'camera moved down: ' + prevCam + ' → ' + w.camY);
    prevCam = w.camY;
    for (const k of ['x', 'y', 'rot', 'sx', 'sy', 'flame']) assert.ok(isFinite(w.rocket[k]), 'rocket.' + k + ' NaN');
    assert.ok(isFinite(w.wagon.x) && isFinite(w.wagon.y), 'wagon NaN');
    assert.ok(w.islands.length <= 7, 'too many islands ' + w.islands.length);
    assert.ok(w.trail.length <= RR.CONFIG.trailMax, 'trail too long');
    maxItems = Math.max(maxItems, w.wagon.items.length);
    for (const e of w.drainEvents()) {
      all.push(e);
      if (e.type === 'ask') ask = e;
      if (e.type === 'go') assert.strictEqual(e.id, ask.answerId, 'go on the wrong island');
      if (e.type === 'land' && w.state === 'round') assert.strictEqual(e.id, ask.answerId, 'landed on the wrong island');
      if (e.type === 'wrong') assert.notStrictEqual(e.id, ask.answerId);
    }
  }
  return { w, b, all, t, maxItems };
}

// ======================================================================== content
test('content: every age × topic × lang × round is solvable over many seeds (self-check)', () => {
  let n = 0;
  for (const age of AGES) for (const topic of TOPICS) for (const lang of LANGS) for (let ri = 0; ri < 4; ri++) for (let s = 0; s < 60; s++) {
    const r = C.makeRound(topic, { age, lang, rng: new RR.RNG(s * 97 + ri * 13 + age), roundIndex: ri });
    assert.strictEqual(C.validate(r), null);
    for (const h of r.hops) assert.strictEqual(h.tokens.filter(t => C.matches(h, t, lang)).length, 1);
    n++;
  }
  assert.ok(n === 5 * 11 * 2 * 4 * 60);
});

test('content: islands per row and hops per round follow the tables', () => {
  const ISL = { 3: [2, 2, 2, 3], 4: [2, 3, 3, 3], 5: [3, 3, 4, 4], 6: [3, 4, 4, 4], 7: [3, 4, 4, 4] };
  for (const age of AGES) for (const topic of TOPICS) for (let ri = 0; ri < 4; ri++) {
    const r = C.makeRound(topic, { age, lang: 'en', rng: new RR.RNG(ri + 1), roundIndex: ri });
    const want = topic === 'colors' && age < 5 ? Math.min(3, ISL[age][ri]) : ISL[age][ri];
    for (const h of r.hops) assert.strictEqual(h.tokens.length, want, topic + ' age ' + age + ' r' + ri);
    const hops = topic === 'count' && ri < 2 ? C.COUNT_UP[age][ri] : [2, 3, 3, 3][ri];
    assert.strictEqual(r.hops.length, hops, topic + ' hops age ' + age + ' r' + ri);
  }
});

test('content: tokens in a row are distinct; the same answer never twice in a row', () => {
  for (const age of AGES) for (const topic of TOPICS) for (let s = 0; s < 80; s++) {
    const r = C.makeRound(topic, { age, lang: s % 2 ? 'vi' : 'en', rng: new RR.RNG(s + 1000), roundIndex: s % 4 });
    let prev = null;
    for (const h of r.hops) {
      const keys = h.tokens.map(C.tokenKey);
      assert.strictEqual(new Set(keys).size, keys.length);
      assert.notStrictEqual(keys[h.answer], prev); prev = keys[h.answer];
    }
  }
});

test('content: colour-blind rule below age 5 (no blue+purple / red+green / yellow+orange / green+orange, no pink)', () => {
  let pinkSeen = false;
  for (const age of AGES) for (let s = 0; s < 400; s++) {
    const r = C.makeRound('colors', { age, lang: 'en', rng: new RR.RNG(s), roundIndex: s % 4 });
    for (const h of r.hops) {
      const cs = h.tokens.map(t => t.color);
      if (age < 5) { assert.ok(!C.clash(cs), cs.join('+')); assert.ok(cs.indexOf('pink') < 0); }
      else if (cs.indexOf('pink') >= 0) pinkSeen = true;
      assert.strictEqual(h.promptKey, 'p.colors');
      assert.strictEqual(h.tokens[h.answer].color, h.params.color);
    }
  }
  assert.ok(pinkSeen, 'pink is an answer colour from age 5');
});

test('content: count-up rounds ask 1…N hop by hop (number tokens with stars), then stars rounds', () => {
  for (const age of AGES) for (let s = 0; s < 40; s++) for (let ri = 0; ri < 4; ri++) {
    const r = C.makeRound('count', { age, lang: 'en', rng: new RR.RNG(s * 3 + ri), roundIndex: ri });
    if (ri < 2) {
      assert.strictEqual(r.hops.length, C.COUNT_UP[age][ri]);
      r.hops.forEach((h, k) => {
        assert.strictEqual(h.promptKey, 'p.countUp'); assert.strictEqual(h.params.n, k + 1); assert.strictEqual(h.params.first, k === 0);
        assert.ok(h.tokens.every(t => t.kind === 'number' && t.showStars === true));
      });
    } else {
      for (const h of r.hops) {
        assert.strictEqual(h.promptKey, 'p.count');
        assert.ok(h.tokens.every(t => t.kind === 'stars' && t.n >= C.COUNT_RANGE[age][0] && t.n <= C.COUNT_RANGE[age][1]));
        if (age === 4) {   // distractors ≥ 2 away from the answer when the 1–5 range allows it
          const a = h.params.n, far = [1, 2, 3, 4, 5].filter(v => Math.abs(v - a) >= 2).length;
          const nFar = h.tokens.filter((t, j) => j !== h.answer && Math.abs(t.n - a) >= 2).length;
          assert.strictEqual(nFar, Math.min(far, h.tokens.length - 1));
        }
      }
    }
  }
});

test('content: animals ask by sound from round 3 at age ≥ 4 (about half the hops), never earlier or at age 3', () => {
  let sound = 0, name = 0;
  for (const age of AGES) for (let s = 0; s < 60; s++) for (let ri = 0; ri < 4; ri++) {
    const r = C.makeRound('animals', { age, lang: 'en', rng: new RR.RNG(s + ri * 100), roundIndex: ri });
    for (const h of r.hops) {
      if (h.promptKey === 'p.sound') { assert.ok(age >= 4 && ri >= 2); sound++; } else { assert.strictEqual(h.promptKey, 'p.animals'); if (age >= 4 && ri >= 2) name++; }
    }
  }
  assert.ok(sound > 0.35 * (sound + name) && sound < 0.65 * (sound + name), sound + ' / ' + name);
});

test('content: shapes below age 5 each gem its own colour; size rounds show the same animal big & small', () => {
  for (let s = 0; s < 200; s++) {
    const r = C.makeRound('shapes', { age: 3 + (s % 2), lang: 'en', rng: new RR.RNG(s), roundIndex: s % 4 });
    for (const h of r.hops) { const cs = h.tokens.map(t => t.color); assert.strictEqual(new Set(cs).size, cs.length); }
    const z = C.makeRound('size', { age: 3, lang: 'en', rng: new RR.RNG(s), roundIndex: s % 4 });
    for (const h of z.hops) {
      const same = h.tokens.filter(t => t.animal === h.params.animal);
      assert.strictEqual(same.length, 2); assert.deepStrictEqual(same.map(t => t.size).sort(), ['big', 'small']);
      assert.ok(same.every(t => t.scale === (t.size === 'big' ? 1 : C.SMALL_SCALE)));
    }
  }
});

test('content: initial uses the 8 animals; Vietnamese skips digraph words; lower skips I/L', () => {
  assert.ok(!RR.WORDS.vi.some(w => /^(ch|nh|th|ng|kh|ph|gh|tr|gi|qu)/i.test(w.word)));
  assert.ok(RR.WORDS.en.concat(RR.WORDS.vi).every(w => RR.ANIMALS.includes(w.animal) && w.sprite === 'animal_' + w.animal));
  for (const lang of LANGS) for (let s = 0; s < 100; s++) {
    const r = C.makeRound('initial', { age: 6, lang, rng: new RR.RNG(s), roundIndex: s % 4 });
    for (const h of r.hops) {
      const inits = h.tokens.map(t => t.initial);
      assert.strictEqual(inits.filter(x => x === h.params.letter).length, 1);
    }
    const l = C.makeRound('lower', { age: 6, lang, rng: new RR.RNG(s), roundIndex: s % 4 });
    for (const h of l.hops) assert.ok(!/[IL]/.test(h.params.letter));
  }
});

test('content: deterministic from the rng', () => {
  for (const topic of TOPICS) {
    const a = C.makeRound(topic, { age: 6, lang: 'vi', rng: new RR.RNG(42), roundIndex: 2 });
    const b = C.makeRound(topic, { age: 6, lang: 'vi', rng: new RR.RNG(42), roundIndex: 2 });
    assert.deepStrictEqual(a, b);
  }
});

test('content: Talk time — valid answer among distinct choices for every age × topic (picture kinds ≤ 5)', () => {
  for (const age of AGES) for (const topic of TOPICS) for (const lang of LANGS) for (let s = 0; s < 30; s++) {
    const t = C.makeTalk(topic, { age, lang, rng: new RR.RNG(s) });
    assert.strictEqual(t.promptKey, 'talk.' + topic);
    assert.ok(t.choices.find(c => c.id === t.answerId));
    assert.strictEqual(new Set(t.choices.map(c => String(c.value))).size, t.choices.length);
    assert.ok(t.choices.length >= 2 && t.choices.length <= 3);
    if (t.show) assert.ok(['color', 'shape', 'stars', 'number', 'animal', 'size', 'letter', 'text'].includes(t.show.kind));
    if (topic === 'colors' && age < 5) assert.ok(!C.clash(t.choices.map(c => c.value)));
  }
});

test('content: topic rotation between sessions (newSession lastTopics)', () => {
  for (const age of AGES) {
    const w = new RR.World({ seed: age, age }); w.setViewport(1280, 720);
    w.newSession(); const first = w.levels.slice();
    assert.strictEqual(new Set(first).size, 4);
    assert.ok(first.every(t => RR.AGE_POOLS[age].includes(t)));
    w.newSession({ lastTopics: first });
    assert.notStrictEqual(w.levels[0], first[0], 'chapter 1 rotates');
    assert.ok(w.levels.some(t => !first.includes(t)), 'a topic left out last time comes back');
  }
});

// ======================================================================== layout
test('layout: DESIGN §2 numbers (bubble, padY, rowY, field, island size, tall scale)', () => {
  const L = RR.World.computeLayout(1280, 720, null, null, 4);
  assert.strictEqual(L.padY, 720 - 118); assert.strictEqual(L.rowY, Math.max(20 + 122 + 175, 0.42 * 720));
  assert.deepStrictEqual([L.bubble.x, L.bubble.y, L.bubble.h, L.bubble.w], [24, 20, 122, 640]);
  assert.strictEqual(L.islandW, 200); assert.strictEqual(L.rocket.h, 190); assert.strictEqual(L.boost.r, 78);
  assert.strictEqual(RR.World.computeLayout(1280, 720, null, null, 6).islandW, 180);
  for (const v of VIEWPORTS) for (const age of AGES) {
    const M = RR.World.computeLayout(v.W, v.H, v.ins, null, age);
    if (M.portrait) {
      assert.strictEqual(M.bubble.y, (v.ins ? v.ins.top : 0) + 96 + 24);
      assert.ok(M.padY - M.rowY >= 0.30 * v.H - 1e-6, v.name);
      assert.ok(Math.abs(M.rowY - 0.47 * v.H) < 1e-6 || M.padY - M.rowY - 0.30 * v.H < 1e-6);
    }
    assert.strictEqual(M.scale, v.H / v.W > 1.6 ? 1.2 : 1);
    assert.ok(M.field.x0 < M.field.x1, v.name);
    assert.ok(M.rowY > M.bubble.y + M.bubble.h, v.name);
  }
  assert.deepStrictEqual(RR.World.logicalSize(390, 844), { W: 720, H: 1558 }); assert.deepStrictEqual(RR.World.logicalSize(1024, 768), { W: 960, H: 720 });
});

test('layout: rows — inside the field, ≥ w + 28 apart, tokens clear of bubble / HUD / hudKeep, tap at the hit centre picks it', () => {
  for (const v of VIEWPORTS) for (const age of AGES) for (let s = 1; s <= 6; s++) {
    const w = new RR.World({ seed: s * 31 + age, age, config: { surpriseTypes: [] } });
    // main.js passes the real DOM HUD and the bubble as two separate boxes
    w.hudKeep = [{ x: v.W - (v.ins ? v.ins.right : 0) - 430, y: 0, w: 430, h: (v.ins ? v.ins.top : 0) + 100 },
      { x: (v.ins ? v.ins.left : 0) + 14, y: 0, w: Math.min(660, v.W * 0.55), h: (v.ins ? v.ins.top : 0) + 160 }];
    w.setViewport(v.W, v.H, v.ins); w.newSession();
    for (const topic of ['colors', 'animals', 'letters']) for (let ri = 0; ri < 4; ri++) {
      roundOf(w, topic, ri);
      const L = w.layout, row = w.islands.filter(i => i.state === 'idle' && i.token);
      assert.ok(row.length >= 2);
      for (const i of row) {
        assert.ok(i._bx >= L.field.x0 - 1e-6 && i._bx <= L.field.x1 + 1e-6, v.name + ' x');
        const ts = w.tokenSize(i), sy = i._by - w.camY;
        const tb = { x: i._bx - ts / 2, y: sy - ts, w: ts, h: ts };
        for (const K of [L.bubble, L.hud].concat(L.hudKeep || [])) {
          const ov = tb.x < K.x + K.w && K.x < tb.x + tb.w && tb.y < K.y + K.h && K.y < tb.y + tb.h;
          assert.ok(!ov, v.name + ' age ' + age + ': token under the bubble/HUD');
        }
        assert.ok(sy + i.h < L.H - (L.ins.bottom || 0), 'island above the bottom');
        // no island / planet body over the rocket (visual QA P1-2)
        const rb = w.rocketHit(), body = { x: i._bx - i.w / 2, y: sy - 0.12 * i.w, w: i.w, h: i.h + 0.12 * i.w };
        assert.ok(!(body.x < rb.x + rb.w / 2 && rb.x - rb.w / 2 < body.x + body.w && body.y < rb.y + rb.h / 2 && rb.y - rb.h / 2 < body.y + body.h),
          v.name + ' age ' + age + ': island ' + i.id + ' overlaps the rocket ' + JSON.stringify({ body, rb, topic, ri, n: row.length, zz: new Set(row.map(q => Math.round(q._by))).size }));
        const h = w.islandHit(i.id);
        const got = w.pointerDown(h.x, h.y); w.cancelDrag();
        if (got !== i.id) assert.ok(got === 'rocket', v.name + ': hit centre of ' + i.id + ' → ' + got);   // only the rocket's body may win
        if (got === i.id) break;   // that answered the hop; the next checks come from the next round
      }
      const zig = new Set(row.map(i => Math.round(i._by))).size > 1 && (row.length - 1) * (L.islandW + 28) > L.field.x1 - L.field.x0;
      for (let a = 0; a < row.length; a++) for (let b = a + 1; b < row.length; b++)
        assert.ok(hyp(row[a]._bx - row[b]._bx, row[a]._by - row[b]._by) >= L.islandW + (zig ? RR.CONFIG.zigzagGap : 28) - 1e-6, v.name + ' min distance' + (zig ? ' (zig-zag)' : '') + ' age ' + age + ' s ' + s + ' ' + topic + ri + ' ' + row.map(i => i._bx.toFixed(0) + ',' + (i._by - w.camY).toFixed(0)).join(' ') + ' rocket ' + w.rocket.x.toFixed(0));
    }
  }
});

test('layout: the answer is never straight above the rocket two hops in a row', () => {
  let n = 0;
  for (let s = 0; s < 12; s++) for (const vi of [4, 6, 8]) {
    const w = mkWorld({ age: 3 + (s % 5), seed: s, vp: VIEWPORTS[vi] });
    let prev = false;
    while (w.state !== 'sessionDone') {
      if (w.state === 'round' && w.phase === 'ask') {
        const a = w.islandById(w.answerId()), above = Math.abs(a._bx - w.rocket.x) < w.layout.islandW / 2;
        assert.ok(!(above && prev), 'twice above the rocket'); prev = above; n++;
        tapIsland(w, a.id);
      }
      if (w.state === 'talk' && !w.talkAnswered) w.talkAnswer(w.talk.answerId);
      if (w.phase === 'boostReady') w.pointerDown(5, 5);
      w.update(1 / 60);
    }
  }
  assert.ok(n > 1000);
});

// ======================================================================== world flow
test('world: full sessions with the bot at every age (sessionDone, camera only climbs, right landings, ≤ 7 islands)', () => {
  for (const age of AGES) for (const skill of [0.5, 1]) for (const vi of [2, 4, 8]) {
    const r = botSession({ age, skill, seed: age * 7 + vi, vp: VIEWPORTS[vi], lang: vi === 4 ? 'vi' : 'en' });
    assert.strictEqual(r.w.state, 'sessionDone', 'age ' + age + ' skill ' + skill);
    const types = r.all.map(e => e.type);
    assert.strictEqual(types.filter(t => t === 'levelDone').length, 4);
    assert.ok(types.filter(t => t === 'go').length === types.filter(t => t === 'land').length);
    assert.ok(types.filter(t => t === 'collect').length === types.filter(t => t === 'go').length);
    assert.strictEqual(types.filter(t => t === 'boost').length, types.filter(t => t === 'boostEnd').length);
    assert.strictEqual(types.filter(t => t === 'roundDone').length, types.filter(t => t === 'boost').length);
    assert.ok(r.w.camY < -1000, 'the camera climbed');
    const st = r.all.filter(e => e.type === 'roundDone').reduce((s, e) => s + e.stars, 0) + r.all.filter(e => e.type === 'talkResult' && e.correct).length;
    assert.strictEqual(r.w.stars, st);
  }
});

test('world: every event of §5.2 occurs with its fields', () => {
  const r = botSession({ age: 4, skill: 0.6, seed: 5 });
  const by = {}; for (const e of r.all) (by[e.type] = by[e.type] || []).push(e);
  const need = { level: ['level', 'topic'], round: ['round', 'topic', 'hops', 'surprise'], appear: ['id'], ask: ['hop', 'hops', 'promptKey', 'params'],
    go: ['id', 'nameKind', 'nameValue'], ignite: ['id'], liftoff: ['id'], land: ['id'], collect: ['id', 'token'], climb: [],
    wrong: ['id', 'nameKind', 'nameValue', 'want', 'streak'], hint: ['id'], roundDone: ['round', 'stars', 'misses'], boostReady: [],
    boost: [], boostEnd: [], talk: ['talk'], talkResult: ['correct'], levelDone: ['level', 'stars'], sessionDone: ['stars'] };
  for (const k in need) {
    assert.ok(by[k] && by[k].length, 'no ' + k + ' event');
    for (const f of need[k]) assert.ok(by[k][0][f] !== undefined, k + '.' + f);
  }
  assert.ok(by.wrong[0].want.kind && by.wrong[0].want.value !== undefined);
});

test('world: a wrong island never advances; the 2nd miss on a hop lights the hint on the right island', () => {
  const w = mkWorld({ age: 5, seed: 3 }); roundOf(w, 'animals', 2); evs(w);
  const hop = w.hop, ans = w.answerId(), wr = wrongIds(w);
  assert.ok(wr.length >= 2);
  assert.strictEqual(tapIsland(w, wr[0]), wr[0]);
  let e = evs(w);
  assert.ok(e.some(x => x.type === 'wrong' && x.id === wr[0] && x.streak === 1));
  assert.ok(!e.some(x => x.type === 'hint'));
  // tap lock: another island tap inside 0.8 s → 'locked' (no miss, no idle reset)
  assert.strictEqual(tapIsland(w, wr[1]), 'locked'); e = evs(w);
  assert.ok(e.some(x => x.type === 'locked' && x.id === wr[1])); assert.ok(!e.some(x => x.type === 'wrong'));
  assert.strictEqual(w.misses, 1);
  run(w, 0.85);
  assert.strictEqual(w.phase, 'ask'); assert.strictEqual(w.hop, hop); assert.strictEqual(w.rocket.pad, w.rocket.pad);
  assert.ok(w.islandById(wr[0]).state === 'idle');
  tapIsland(w, wr[1]); e = evs(w);
  assert.ok(e.some(x => x.type === 'wrong'));
  const hint = e.find(x => x.type === 'hint');
  assert.ok(hint && hint.id === ans, '2nd miss → hint on the answer');
  run(w, 0.5);
  assert.ok(w.islandById(ans).glow > 0.5);
  assert.strictEqual(w.misses, 2);
  // 2nd-miss lock is 1.6 s; then cooldown: more misses inside 6 s add no second hint event
  assert.strictEqual(tapIsland(w, ans), 'locked'); evs(w);
  run(w, 1.2);
  tapIsland(w, wr[0]); assert.ok(!evs(w).some(x => x.type === 'hint'));
  run(w, 1.7);
  tapIsland(w, ans); assert.ok(evs(w).some(x => x.type === 'go' && x.id === ans));
});

test('world: stars per round 3 / 2 / 1 for 0 / 1 / ≥ 2 misses', () => {
  for (const miss of [0, 1, 2, 3]) {
    const w = mkWorld({ age: 6, seed: 11 + miss }); roundOf(w, 'letters', 0); evs(w);
    let m = miss;
    while (w.state === 'round') {
      if (w.phase === 'ask' && w.time >= w._lockUntil) { const wr = wrongIds(w); if (m > 0 && wr.length) { tapIsland(w, wr[0]); m--; } else tapIsland(w, w.answerId()); }
      w.update(H);
    }
    const rd = evs(w).find(e => e.type === 'roundDone');
    assert.strictEqual(rd.stars, miss === 0 ? 3 : miss === 1 ? 2 : 1); assert.strictEqual(rd.misses, miss);
  }
});

test('world: idle nudges at 12 s, then ×1.5 (18 s); the 2nd idle also hints', () => {
  const w = mkWorld({ age: 4, seed: 2 }); roundOf(w, 'colors', 1); evs(w);
  const t0 = w.time, idles = [];
  let hint = null;
  run(w, 31, () => { for (const e of w.drainEvents()) { if (e.type === 'idle') idles.push([e.n, +(w.time - t0).toFixed(2)]); if (e.type === 'hint') hint = e; } });
  assert.deepStrictEqual(idles.map(x => x[0]), [1, 2]);
  assert.ok(Math.abs(idles[0][1] - 12) < 0.05 && Math.abs(idles[1][1] - 30) < 0.05, JSON.stringify(idles));
  assert.ok(hint && hint.idle && hint.id === w.answerId());
});

test('world: flight — ignite 0.35 s, curved thrust flight, heading ≤ 0.9 rad, retro flame 0.3, landing squash 0.82 → 1.06, dip ≈ 14 px', () => {
  for (let s = 0; s < 12; s++) {
    const w = mkWorld({ age: 4, seed: 100 + s, vp: VIEWPORTS[s % 2 ? 6 : 8] }); roundOf(w, 'animals', 1); evs(w);
    const r = w.rocket, T = w.islandById(w.answerId()), x0 = r.x, y0 = r.y;
    tapIsland(w, T.id);
    assert.strictEqual(w.phase, 'ignite');
    let tIg = 0; while (w.phase === 'ignite') { w.update(H); tIg += H; }
    assert.ok(Math.abs(tIg - 0.35) < 0.02, 'ignite ' + tIg);
    const x1 = T.x, y1 = T.y, speeds = [];
    let apex = 0, maxRot = 0, minFlame = 1, px = r.x, py = r.y;
    while (w.phase === 'fly') {
      w.update(H);
      const d2 = (x1 - x0) ** 2 + (y1 - y0) ** 2, t = ((r.x - x0) * (x1 - x0) + (r.y - y0) * (y1 - y0)) / d2;
      apex = Math.max(apex, hyp(r.x - (x0 + t * (x1 - x0)), r.y - (y0 + t * (y1 - y0))));
      maxRot = Math.max(maxRot, Math.abs(r.rot)); minFlame = Math.min(minFlame, r.flame);
      speeds.push(hyp(r.x - px, r.y - py) / H); px = r.x; py = r.y;
    }
    assert.ok(apex >= 40 && apex <= 140, 'apex ' + apex);
    assert.ok(maxRot <= 0.9 + 1e-9 && maxRot > 0.05, 'rot ' + maxRot);
    assert.ok(Math.abs(minFlame - 0.3) < 0.02);
    const n = speeds.length, vmax = Math.max(...speeds);
    assert.ok(speeds[1] < 0.4 * vmax && speeds[n - 2] < 0.4 * vmax, 'accelerate … retro-decelerate');
    assert.strictEqual(w.phase, 'land'); assert.strictEqual(r.pad, T.id);
    let minSy = 9, maxSy = 0, dip = 0;
    run(w, 0.8, () => { minSy = Math.min(minSy, r.sy); maxSy = Math.max(maxSy, r.sy); dip = Math.max(dip, T._dip); });
    assert.ok(Math.abs(minSy - 0.82) < 0.02, 'squash ' + minSy);
    assert.ok(maxSy > 1.03 && maxSy < 1.09, 'overshoot ' + maxSy);
    assert.ok(dip > 11 && dip < 16, 'dip ' + dip);
    assert.ok(w.trail.length > 3);
  }
});

test('world: collect — the token arcs into the wagon (collect event), climb puts the landed island at padY, next row puffs in 0 → 1.12 → 1', () => {
  const w = mkWorld({ age: 4, seed: 9 }); roundOf(w, 'shapes', 1); evs(w);
  const id = w.answerId(); tapIsland(w, id);
  let col = null, climb = false, peak = 0;
  until(w, () => {
    for (const e of w.drainEvents()) { if (e.type === 'collect') col = e; if (e.type === 'climb') climb = true; }
    for (const i of w.islands) if (i.state === 'appear') peak = Math.max(peak, i.sx);
    return w.phase === 'ask';
  });
  assert.ok(col && col.id === id && col.token.kind === 'shape' && w.wagon.items.length === 1 && climb);
  assert.ok(peak > 1.09 && peak < 1.15, 'appear overshoot ' + peak);
  const pad = w.islandById(id);
  run(w, 1);
  assert.ok(Math.abs(pad._by - w.camY - w.layout.padY) < 1, 'pad at padY');
  assert.strictEqual(pad.state, 'pad'); assert.ok(pad.collected);
});

test('world: taps are ignored during ignite / fly / land / climb / appear', () => {
  const w = mkWorld({ age: 4, seed: 4 }); roundOf(w, 'animals', 2); evs(w);
  const wr = wrongIds(w)[0], id = w.answerId(), hW = w.islandHit(wr);
  tapIsland(w, id);
  const seen = new Set();
  until(w, () => {
    if (w.phase !== 'ask') { seen.add(w.phase); assert.strictEqual(w.pointerDown(hW.x, hW.y), null); w.pointerUp(hW.x, hW.y); }
    return w.phase === 'ask';
  });
  for (const p of ['ignite', 'fly', 'land', 'climb', 'appear']) assert.ok(seen.has(p), p);
  assert.ok(!evs(w).some(e => e.type === 'wrong'));
});

test('world: aim drag from the rocket answers; tap vs drag rule (< 24 px & < 0.35 s → pokeBim)', () => {
  const w = mkWorld({ age: 4, seed: 6 }); roundOf(w, 'colors', 2); evs(w);
  const rk = w.rocketHit();
  // quick tap on the rocket → pokeBim, nothing else
  assert.strictEqual(w.pointerDown(rk.x, rk.y), 'rocket');
  assert.ok(w.aim);
  run(w, 0.1); w.pointerMove(rk.x + 10, rk.y + 5);
  assert.strictEqual(w.pointerUp(rk.x + 10, rk.y + 5), 'pokeBim');
  let e = evs(w); assert.ok(e.some(x => x.type === 'pokeBim' && x.promptKey === 'p.colors')); assert.ok(!e.some(x => x.type === 'go' || x.type === 'wrong'));
  // long press without moving → nothing
  w.pointerDown(rk.x, rk.y); run(w, 0.5); assert.strictEqual(w.pointerUp(rk.x, rk.y), null); assert.strictEqual(evs(w).length, 0);
  // drag to the open sky → cancelled quietly
  w.pointerDown(rk.x, rk.y); w.pointerMove(rk.x + 40, rk.y - 300 > 0 ? 40 : rk.y); w.pointerUp(rk.x + 40, 40);
  assert.ok(!evs(w).some(x => x.type === 'go' || x.type === 'wrong')); assert.strictEqual(w.aim, null);
  // drag to a wrong island → wrong; drag to the answer → go
  const wr = wrongIds(w)[0], hw = w.islandHit(wr);
  w.pointerDown(rk.x, rk.y); w.pointerMove((rk.x + hw.x) / 2, (rk.y + hw.y) / 2); w.pointerMove(hw.x, hw.y);
  assert.strictEqual(w.aim.target, wr);
  assert.strictEqual(w.pointerUp(hw.x, hw.y), wr); assert.ok(evs(w).some(x => x.type === 'wrong' && x.id === wr));
  run(w, 0.9);   // past the 0.8 s tap lock
  const id = w.answerId(), ha = w.islandHit(id);
  w.pointerDown(rk.x, rk.y); for (let k = 1; k <= 10; k++) { w.update(H); w.pointerMove(rk.x + (ha.x - rk.x) * k / 10, rk.y + (ha.y - rk.y) * k / 10); }
  assert.strictEqual(w.aim.target, id);
  assert.strictEqual(w.pointerUp(ha.x, ha.y), id); assert.ok(evs(w).some(x => x.type === 'go' && x.id === id));
  assert.strictEqual(w.aim, null); assert.strictEqual(w.phase, 'ignite');
  // cancelDrag clears the aim
  const w2 = mkWorld({ age: 4, seed: 7 }); roundOf(w2, 'colors', 2); const r2 = w2.rocketHit(); w2.pointerDown(r2.x, r2.y); w2.cancelDrag();
  assert.strictEqual(w2.aim, null); assert.strictEqual(w2.pointerUp(r2.x, r2.y), null);
});

test('world: a tap on the pad → tapPad', () => {
  const w = mkWorld({ age: 4, seed: 8 }); roundOf(w, 'colors', 1); evs(w);
  const pad = w.islandById(w.rocket.pad), sx = pad.x + pad.w * 0.42, sy = pad.y - w.camY + pad.h * 0.5;
  assert.strictEqual(w.pointerDown(sx, sy), 'pad'); assert.ok(evs(w).some(e => e.type === 'tapPad'));
});

test('world: roundDone → boostReady; boost by tap, or by itself after 5 s; boostEnd on a fresh pad, camera follows', () => {
  for (const tap of [true, false]) {
    const w = mkWorld({ age: 3, seed: 21 }); roundOf(w, 'colors', 0); evs(w);
    until(w, () => { if (w.state === 'round' && w.phase === 'ask') tapIsland(w, w.answerId()); return w.state === 'roundDone'; });
    assert.ok(evs(w).some(e => e.type === 'roundDone'));
    assert.strictEqual(w.pointerDown(100, 100), null);   // the stars phase ignores taps
    untilPhase(w, 'boostReady');
    assert.ok(evs(w).some(e => e.type === 'boostReady'));
    const t0 = w.time, cam0 = w.camY, pad0 = w.rocket.pad;
    if (tap) { run(w, 1); assert.strictEqual(w.pointerDown(w.layout.W / 2, 60), 'boost'); }
    until(w, () => w.phase === 'boost');
    const b = evs(w).find(e => e.type === 'boost');
    assert.strictEqual(b.auto, !tap);
    if (!tap) assert.ok(Math.abs(w.time - t0 - RR.CONFIG.autoBoost) < 0.02, 'auto boost after CONFIG.autoBoost (4 s)');
    let maxT = 0;
    until(w, () => { maxT = Math.max(maxT, w.boostT); return w.state !== 'roundDone'; });
    assert.ok(maxT > 0.99);
    assert.ok(w.camY < cam0 - 0.9 * 1.5 * w.layout.H, 'boost climbs ≈ 1.5 H');
    assert.notStrictEqual(w.rocket.pad, pad0);
    assert.ok(evs(w).some(e => e.type === 'boostEnd'));
    assert.strictEqual(w.state, 'round'); assert.strictEqual(w.round, 1);
  }
});

test('world: chapter time limit — after ≥ 3 rounds and > 80 s → Talk time; Talk re-asks every 12 s, glow from the 2nd', () => {
  const w = mkWorld({ age: 4, seed: 12 });
  let rounds = 0;
  until(w, () => {
    if (w.state === 'round' && w.phase === 'ask' && w.phaseTime > 9) tapIsland(w, w.answerId());   // a slow child
    for (const e of w.drainEvents()) if (e.type === 'roundDone') rounds++;
    return w.state === 'talk';
  }, 200000);
  assert.ok(rounds >= RR.CONFIG.chapterMinRounds && rounds < 4, 'rounds ' + rounds);
  assert.strictEqual(w.roundsPerLevel, rounds, 'a cut chapter: roundsPerLevel = rounds played (HUD dots fill)');
  const asks = [];
  run(w, 25, () => { for (const e of w.drainEvents()) if (e.type === 'talkAsk') asks.push(e); });
  assert.deepStrictEqual(asks.map(a => a.n), [1, 2]); assert.strictEqual(asks[0].glowAnswer, false); assert.strictEqual(asks[1].glowAnswer, true);
  // resetNudges (main.js on resume): Talk re-asks start over
  w.resetNudges(); assert.strictEqual(w.talk.glowAnswer, false);
  const asks2 = []; run(w, 12.1, () => { for (const e of w.drainEvents()) if (e.type === 'talkAsk') asks2.push(e.n); });
  assert.deepStrictEqual(asks2, [1]);
  assert.ok(w.talkAnswer(w.talk.answerId)); until(w, () => w.state === 'intro'); assert.strictEqual(w.level, 1);
  assert.strictEqual(w.roundsPerLevel, RR.CONFIG.roundsPerLevel, 'reset at the next chapter');
});

test('world: night chapter (stage 3) islands are planets; camY never resets inside a session', () => {
  const w = mkWorld({ age: 4, seed: 13 });
  w.startLevel(3); until(w, () => w.phase === 'ask');
  assert.ok(w.islands.filter(i => i.token).every(i => i.style === 'planet'));
  assert.ok(w.islands.filter(i => i.token).every(i => Math.abs(i.h - 0.8 * i.w) < 1e-9));
});

test('world: drift surprise keeps the row inside the field and apart; shooting star → shootingTap', () => {
  for (const type of ['drift', 'shooting']) {
    const w = new RR.World({ seed: 30, age: 5, config: { surpriseTypes: [type] } }); w.setViewport(1280, 720); w.newSession();
    w.levels = ['animals', 'animals', 'animals', 'animals']; w.startLevel(0); w.round = 2; w._beginRound(); evs(w);
    assert.strictEqual(w.surprise, type);
    if (type === 'drift') {
      untilPhase(w, 'ask'); const x0 = w.islands.filter(i => i.token).map(i => i.x);
      let moved = 0;
      run(w, 6, () => {
        w.islands.filter(i => i.token).forEach((i, k) => { moved = Math.max(moved, Math.abs(i.x - x0[k])); });
        const row = w.islands.filter(i => i.token && i.state === 'idle');
        for (const i of row) assert.ok(i.x >= w.layout.field.x0 - 1e-6 && i.x <= w.layout.field.x1 + 1e-6);
        for (let a = 0; a < row.length; a++) for (let b = a + 1; b < row.length; b++) assert.ok(Math.abs(row[a].x - row[b].x) > 1);
      });
      assert.ok(moved > 20, 'drifted ' + moved);
      // the rocket still lands on the drifting answer
      const id = w.answerId(); tapIsland(w, id); untilPhase(w, 'land');
      assert.strictEqual(w.rocket.pad, id); assert.ok(Math.abs(w.rocket.x - w.islandById(id).x) < 1);
    } else {
      let sh = false;
      until(w, () => { if (w.drainEvents().some(e => e.type === 'shooting')) sh = true; if (w.phase === 'ask' && !w.shooting) { if (w.hop === 0) tapIsland(w, w.answerId()); } return sh; });
      const S = w.shooting, L = w.layout, sy0 = S.y - w.camY;
      assert.ok(sy0 >= Math.max(L.bubble.y + L.bubble.h, L.hud.y + L.hud.h) + 50 - 1e-6, 'shooting star below the bubble / HUD: ' + sy0);
      run(w, 0.5);
      const hit = w.pointerDown(S.x, S.y - w.camY);
      assert.strictEqual(hit, 'shooting');
      const e = evs(w).find(x => x.type === 'shootingTap'); assert.ok(e && isFinite(e.x) && isFinite(e.y));
      run(w, 1); assert.strictEqual(w.shooting, null);
    }
  }
});

test('world: rotation mid-flight / mid-boost keeps every object on screen and the round intact', () => {
  for (let s = 0; s < 10; s++) for (const [a, b] of [[8, 2], [2, 8], [4, 6], [6, 1]]) {
    const A = VIEWPORTS[a], B = VIEWPORTS[b];
    const w = mkWorld({ age: 4 + (s % 3), seed: 50 + s, vp: A }); roundOf(w, 'colors', 1 + (s % 3)); evs(w);
    const id = w.answerId(); tapIsland(w, id);
    run(w, 0.35 + 0.1 + 0.05 * (s % 6));            // somewhere in the flight
    w.setViewport(B.W, B.H, B.ins);
    const L = w.layout, ins = L.ins;
    until(w, () => {
      const r = w.rocket, sy = r.y - w.camY;
      assert.ok(r.x - L.rocket.w / 2 >= ins.left - 1 && r.x + L.rocket.w / 2 <= L.W - ins.right + 1, 'rocket x ' + r.x);
      assert.ok(sy - L.rocket.h >= -L.rocket.h * 0.25 && sy <= L.H + 1, 'rocket y ' + sy);
      assert.ok(w.wagon.x >= ins.left - 1 && w.wagon.x <= L.W - ins.right + 1, 'wagon x');
      for (const i of w.islands) if (i.state === 'idle' || i.state === 'pad') assert.ok(i.x >= 0 && i.x <= L.W, 'island x');
      return w.phase === 'ask' || w.state !== 'round';
    });
    assert.strictEqual(w.rocket.pad, id, 'landed on the answer after the rotation');
    if (w.state === 'round') for (const i of w.islands.filter(o => o.state === 'idle')) {
      assert.ok(i._bx >= L.field.x0 - 1e-6 && i._bx <= L.field.x1 + 1e-6);
      const sy = i._by - w.camY; assert.ok(sy > L.bubble.y && sy < L.padY);
    }
    // rotation while asking: same answer island, re-placed inside the new field
    if (w.state === 'round' && w.phase === 'ask') {
      const ans = w.answerId(); w.setViewport(A.W, A.H, A.ins);
      assert.strictEqual(w.answerId(), ans);
      for (const i of w.islands.filter(o => o.state === 'idle')) assert.ok(i._bx >= w.layout.field.x0 - 1e-6 && i._bx <= w.layout.field.x1 + 1e-6);
      assert.strictEqual(tapIsland(w, ans), ans);
    }
  }
  // mid-boost
  const w = mkWorld({ age: 3, seed: 77, vp: VIEWPORTS[8] }); roundOf(w, 'colors', 0);
  until(w, () => { if (w.state === 'round' && w.phase === 'ask') tapIsland(w, w.answerId()); return w.phase === 'boostReady'; });
  w.pointerDown(10, 10); run(w, 0.9); w.setViewport(720, 1556, null);
  until(w, () => { const sy = w.rocket.y - w.camY; assert.ok(sy <= w.layout.H + 1 && sy >= -50); return w.state === 'round'; });
});

test('world: determinism — same seed + bot → same events; frame size does not matter', () => {
  const a = botSession({ age: 5, skill: 0.7, seed: 4 }), b = botSession({ age: 5, skill: 0.7, seed: 4 });
  assert.strictEqual(hashEvents(a.all), hashEvents(b.all));
  // inputs recorded at 1/30 s, replayed at 1/120 s frames
  const rec = [], w = mkWorld({ age: 6, seed: 9, surprise: true });
  for (const fn of ['pointerDown', 'pointerMove', 'pointerUp', 'talkAnswer']) { const o = w[fn].bind(w); w[fn] = (...x) => { rec.push({ s: Math.round(w.time / H), fn, x }); return o(...x); }; }
  const bot = new RR.Bot(w, { skill: 0.7, seed: 3 }), e1 = [];
  while (w.state !== 'sessionDone') { bot.step(1 / 30); w.update(1 / 30); e1.push(...w.drainEvents()); }
  const v = mkWorld({ age: 6, seed: 9, surprise: true }), e2 = [];
  let k = 0;
  while (v.state !== 'sessionDone' && v.time < 2000) {
    const s = Math.round(v.time / H);
    while (k < rec.length && rec[k].s <= s) { v[rec[k].fn](...rec[k].x); k++; }
    v.update(H); e2.push(...v.drainEvents());
  }
  assert.strictEqual(hashEvents(e1), hashEvents(e2));
});

test('world: prompt() / answerId() / islandHit() / rocketHit() / items alias', () => {
  const w = mkWorld({ age: 4, seed: 15 }); roundOf(w, 'count', 0);
  const p = w.prompt(); assert.strictEqual(p.promptKey, 'p.countUp'); assert.strictEqual(p.params.n, 1);
  const a = w.islandById(w.answerId()); assert.strictEqual(a.token.n, 1);
  assert.strictEqual(w.items, w.islands);
  const h = w.islandHit(a.id); assert.ok(h.w > 0 && h.h > 0 && isFinite(h.x));
  const r = w.rocketHit(); assert.ok(r.y + r.h / 2 <= w.layout.H);
  assert.ok(Math.abs(w.layout.boost.x - w.rocket.x) < 1e-9);
});

test('world: wagon — rope of 6 points from the hook, wagon beside the rocket at rest, swings in after a flight', () => {
  const w = mkWorld({ age: 4, seed: 16 }); roundOf(w, 'animals', 1);
  const W = w.wagon, L = w.layout;
  assert.strictEqual(W.rope.length, 6);
  const restGap = Math.abs(W.x - w.rocket.x);
  assert.ok(restGap > L.rocket.w / 2, 'wagon beside the rocket');
  tapIsland(w, w.answerId());
  let maxRot = 0, maxD = 0;
  until(w, () => { maxRot = Math.max(maxRot, Math.abs(W.rot)); maxD = Math.max(maxD, hyp(W.x - w.rocket.x, W.y - w.rocket.y)); return w.phase === 'ask'; });
  assert.ok(maxD <= RR.CONFIG.ropeLen * L.rocket.h + L.rocket.h * 0.1 + 1, 'tethered ' + maxD);
  assert.ok(maxRot > 0.02, 'the wagon swings');
  run(w, 2);
  assert.ok(Math.abs(Math.abs(W.x - w.rocket.x) - restGap) < 4, 'back beside the rocket');
  const seg = RR.CONFIG.ropeLen * L.rocket.h / 5;
  for (let k = 0; k < 5; k++) assert.ok(hyp(W.rope[k + 1].x - W.rope[k].x, W.rope[k + 1].y - W.rope[k].y) <= seg * 1.6);
});

test('bot: drags about 30 % of its answers, answers right with p ≈ skill, boosts, talks', () => {
  const r = botSession({ age: 5, skill: 0.7, seed: 31 });
  const s = r.b.stats, ans = s.right + s.wrong;
  assert.ok(s.drags / (s.taps + s.drags) > 0.15 && s.drags / (s.taps + s.drags) < 0.45, JSON.stringify(s));
  assert.ok(s.boosts >= 12); assert.strictEqual(s.talks, 4);
  assert.ok(s.wrong > 0 && s.right / ans > 0.5);
});

// ======================================================================== weather
test('weather: 4 times of day, hex ambient, 2.5 s crossfade, cap 120, particles slide with the camera', () => {
  const wx = new RR.Weather({ width: 1280, height: 720, seed: 3 });
  for (let m = 0; m < 4; m++) {
    wx.setWeather(m);
    for (let k = 0; k < 600; k++) { wx.update(1 / 60, { camDY: -3 }); assert.ok(wx.particles.length <= 120); }
    const a = wx.ambient;
    for (const key of ['skyTop', 'skyMid', 'skyBottom', 'cloudShade', 'rimLight']) assert.ok(/^#[0-9A-F]{6}$/.test(a[key]), key);
    for (const key of ['sun', 'sunX', 'sunY', 'moon', 'stars', 'rainbow', 'darkness', 'wind']) assert.ok(isFinite(a[key]), key);
    assert.strictEqual(a.skyTop, RR.Weather.SKY[m].top);
    for (let k = 0; k < 4; k++) wx.burst(640, 360, { kind: ['confetti', 'puff', 'sparkle', 'stars'][k], n: 40 });
    assert.ok(wx.particles.length <= 120);
  }
  assert.strictEqual(wx.ambient.stars, 1);
  wx.setWeather(1); for (let k = 0; k < 75; k++) wx.update(1 / 60); const mid = wx.ambient.skyTop; for (let k = 0; k < 78; k++) wx.update(1 / 60);
  assert.ok(mid !== RR.Weather.SKY[3].top && mid !== RR.Weather.SKY[1].top); assert.strictEqual(wx.ambient.skyTop, RR.Weather.SKY[1].top);
  // camera climb: clouds move down by camDY·parallax
  const c0 = wx.clouds.map(c => c.y); wx.update(1 / 60, { camDY: -10 });
  const moved = wx.clouds.filter((c, i) => Math.abs((c.y - c0[i]) - 10 * c.par) < 0.5).length;
  assert.ok(moved >= wx.clouds.length - 2);
  // night streaks
  const wn = new RR.Weather({ width: 960, height: 720, seed: 5, weather: 3 });
  let streak = 0; for (let k = 0; k < 60 * 20; k++) { wn.update(1 / 60); streak += wn.particles.filter(p => p.kind === 'streak' && p.age < 1 / 59).length; }
  assert.ok(streak >= 2, 'falling stars every ~8 s');
  // deterministic
  const p = new RR.Weather({ seed: 9 }), q = new RR.Weather({ seed: 9 });
  for (let k = 0; k < 300; k++) { p.update(1 / 60, { camDY: -2 }); q.update(1 / 60, { camDY: -2 }); }
  assert.deepStrictEqual(JSON.parse(JSON.stringify(p.particles)), JSON.parse(JSON.stringify(q.particles)));
});


test('world: tap lock 0.8 s / 1.6 s after a wrong island; sky taps keep the idle help counting', () => {
  const w = mkWorld({ age: 5, seed: 41 }); roundOf(w, 'animals', 2); evs(w);
  const wr = wrongIds(w), ans = w.answerId();
  tapIsland(w, wr[0]); evs(w);
  run(w, 0.7); assert.strictEqual(tapIsland(w, ans), 'locked'); assert.strictEqual(w.phase, 'ask');
  run(w, 0.15); tapIsland(w, wr[1]); assert.ok(evs(w).some(e => e.type === 'wrong'));   // 2nd miss → 1.6 s lock
  run(w, 1.5); assert.strictEqual(tapIsland(w, ans), 'locked');
  run(w, 0.15); assert.strictEqual(tapIsland(w, ans), ans);
  // empty sky taps do not reset the idle timer: the first idle nudge (with a glow) still comes at 12 s
  const w2 = mkWorld({ age: 4, seed: 42 }); roundOf(w2, 'colors', 1); evs(w2);
  const L = w2.layout, t0 = w2.time; let idle = null, hint = null, sky = null;
  for (let y = L.ins.top + 150; y < L.padY - 250 && !sky; y += 10) for (let x = 30; x < L.W - 30; x += 10) {
    if (w2._rowIsland(x, y + w2.camY) || w2._inRocket(x, y + w2.camY, 40)) continue; sky = { x, y }; break;
  }
  assert.ok(sky, 'an empty sky spot');
  run(w2, 12.2, i => {
    if (i % 120 === 0) { assert.strictEqual(w2.pointerDown(sky.x, sky.y), null); w2.pointerUp(sky.x, sky.y); }
    for (const e of w2.drainEvents()) { if (e.type === 'idle' && !idle) idle = w2.time - t0; if (e.type === 'hint') hint = e; }
  });
  assert.ok(idle && Math.abs(idle - 12) < 0.05, 'idle at ' + idle); assert.ok(hint && hint.idle, 'idleHintFrom 1 → the 1st idle glows');
});

test('world: the 2nd miss always glows (even inside the hint cooldown); resetNudges restarts idle nudges', () => {
  const w = mkWorld({ age: 5, seed: 43 }); roundOf(w, 'animals', 2); evs(w);
  w.hint(); evs(w); run(w, 4.2);   // a manual hint has just faded, cooldown still running
  const wr = wrongIds(w);
  tapIsland(w, wr[0]); run(w, 0.9); tapIsland(w, wr[1]);
  assert.ok(evs(w).some(e => e.type === 'hint' && e.id === w.answerId()), '2nd miss → hint despite the cooldown');
  run(w, 7); w.drainEvents(); w.resetNudges();
  assert.strictEqual(w._idleN, 0); assert.strictEqual(w._idleGap, RR.CONFIG.idleTime);
});

test('world: drag snap — released ≤ 80 px from an island flies there; far away → dragMiss', () => {
  const w = mkWorld({ age: 4, seed: 44 }); roundOf(w, 'colors', 2); evs(w);
  const rk = w.rocketHit(), id = w.answerId(), h = w.islandHit(id);
  const fx = h.x, fy = h.y - h.h / 2 - 50;   // 50 px above the hit box
  assert.strictEqual(w._rowIsland(fx, fy + w.camY), null);
  w.pointerDown(rk.x, rk.y); w.pointerMove((rk.x + fx) / 2, (rk.y + fy) / 2); w.pointerMove(fx, fy);
  assert.strictEqual(w.pointerUp(fx, fy), id); assert.ok(evs(w).some(e => e.type === 'go' && e.id === id));
  const w2 = mkWorld({ age: 4, seed: 45 }); roundOf(w2, 'colors', 2); evs(w2);
  const r2 = w2.rocketHit(); let far = null;
  for (let y = w2.layout.ins.top + 140; y < r2.y && !far; y += 20) for (let x = 40; x < w2.layout.W - 40; x += 20) {
    if (w2._rowIsland(x, y + w2.camY) || w2._snapIsland(x, y + w2.camY) || Math.abs(x - r2.x) < r2.w) continue; far = { x, y }; break;
  }
  assert.ok(far, 'a far spot exists');
  w2.pointerDown(r2.x, r2.y); w2.pointerMove(far.x, far.y);
  assert.strictEqual(w2.pointerUp(far.x, far.y), null);
  const e = evs(w2); assert.ok(e.some(x => x.type === 'dragMiss')); assert.ok(!e.some(x => x.type === 'go' || x.type === 'wrong'));
});

test('content: colours below age 5 never pair red+orange (+ the old clashes); answers balanced', () => {
  const cnt = {};
  for (let s = 0; s < 600; s++) {
    const r = RR.Content.makeRound('colors', { age: 4, lang: 'en', rng: new RR.RNG(s), roundIndex: 1 + (s % 3) });
    for (const h of r.hops) {
      const cs = h.tokens.map(t => t.value);
      assert.ok(!RR.Content.clash(cs), cs.join('+'));
      assert.ok(!(cs.includes('red') && cs.includes('orange')));
      const a = h.tokens[h.answer].value; cnt[a] = (cnt[a] || 0) + 1;
    }
  }
  const v = Object.values(cnt), tot = v.reduce((a, b) => a + b, 0);
  for (const k in cnt) if (k !== 'orange') assert.ok(cnt[k] / tot > 0.14 && cnt[k] / tot < 0.3, k + ' ' + (cnt[k] / tot).toFixed(2));
});

// ======================================================================== run
let pass = 0, fail = 0;
const t0 = Date.now();
for (const t of tests) {
  try { t.fn(); pass++; console.log('ok   ' + t.name); }
  catch (e) { fail++; console.log('FAIL ' + t.name + '\n     ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n     ') : e)); }
}
console.log(`\n${pass} passed, ${fail} failed (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(fail ? 1 : 0);
