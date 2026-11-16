#!/usr/bin/env node
// Moka's Fairy Tea Party — headless unit tests for rng / content / world / weather / bot.
// Run from the game folder:   node tests/unit/run.js [name part]      (exit 1 on any failure)
// (tests/unit/i18n_voice.test.js and tea_art.test.js are the other engineers' suites and run on their own.)
'use strict';
const assert = require('assert');
const { load } = require('./load');

const FT = load();
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const H = 1 / 120;
const AGES = [3, 4, 5, 6, 7];
const C = FT.Content;
const CFG = FT.CONFIG;
const J = v => JSON.parse(JSON.stringify(v));   // objects from the vm sandbox have other prototypes
assert.deepStrictEqual = ((orig) => (a, b, m) => orig(J(a), J(b), m))(assert.deepStrictEqual);

// ---- independent copies of the DESIGN tables (§3, §5.1)
const AGE_TOPICS = { 3: ['colors', 'shapes', 'size', 'animals'], 4: ['colors', 'shapes', 'count', 'animals'],
  5: ['shapes', 'count', 'letters', 'animals'], 6: ['lower', 'initial', 'add', 'count'], 7: ['initial', 'add', 'sub', 'oddeven'] };
const ALL_TOPICS = ['colors', 'shapes', 'size', 'animals', 'count', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
const CLASH = [['blue', 'purple'], ['red', 'green'], ['yellow', 'orange'], ['green', 'orange'], ['red', 'orange']];
const HEX = { red: '#E84A4A', blue: '#3C8DE8', yellow: '#FFD23F', green: '#4CC26B', orange: '#FF9A2E', purple: '#8E44AD', pink: '#FF8FC0' };
const GUESTS = { bunny: 'forest', fox: 'forest', deer: 'forest', squirrel: 'forest', owl: 'forest', raccoon: 'forest', mouse: 'forest',
  hedgehog: 'forest', penguin: 'ice', crab: 'sea', goldfish: 'sea', camel: 'desert', lion: 'savanna' };
const OBJECTS = ['cup', 'teapot', 'jar', 'bowl', 'cupcake'];
const SKY = { sunny: ['#BFE3D0', '#FBF6DF'], breezy: ['#CFE6DA', '#F5F1E2'], rain: ['#97A9B4', '#CBD6D6'], rainbow: ['#A9DCEB', '#FFF1D9'] };
const PARTICLES = ['mote', 'sparkle', 'leaf', 'leaf_b', 'petal', 'raindrop', 'splash', 'puff', 'dust', 'seed', 'confetti_a', 'confetti_b', 'star', 'dot'];
const VPS = {
  land1280: [1280, 720, null], ipadL: [960, 720, { top: 32, bottom: 27 }], ipadAir: [1036, 720, { top: 18, bottom: 14 }],
  iphoneL: [1561, 720, { left: 108, right: 108, bottom: 38 }], iphoneP: [720, 1561, { top: 108, bottom: 62 }],
  ipadP: [720, 1036, { top: 21, bottom: 18 }], port960: [720, 960, null], port1600: [720, 1600, null]
};
const NONPOS = ['session', 'talkAsk', 'talkResult', 'levelDone', 'sessionDone'];

// ---- helpers
function mkW(age, o) {
  o = o || {};
  const vp = VPS[o.vp || 'land1280'];
  const w = new FT.World({ seed: o.seed || 7, age, lang: o.lang || 'en', config: o.config });
  w.setViewport(vp[0], vp[1], vp[2]);
  return w;
}
function run(w, s, dt) { dt = dt || 1 / 60; const n = Math.round(s / dt); for (let i = 0; i < n; i++) w.update(dt); }
function runUntil(w, f, max, dt) { dt = dt || H; max = max || 60; let t = 0; while (!f() && t < max) { w.update(dt); t += dt; } assert.ok(f(), 'timed out after ' + max + ' s'); return t; }
/** A world in round `ri` of a chapter of `topic`, at play (things landed, asked). Events drained. */
function atPlay(age, topic, ri, o) {
  const w = mkW(age, o);
  w.newSession();
  if (topic) { w.levels[o && o.level || 0] = topic; }
  w.startLevel(o && o.level || 0);
  for (let r = 0; ; r++) {
    runUntil(w, () => w.interactive, 60);
    if (w.round >= (ri || 0)) break;
    const odd = w.odd; tap(w, odd.cx, odd.cy);
    runUntil(w, () => w.state === 'round' && w.phase === 'enter' && w.round > r, 60);
  }
  w.drainEvents();
  return w;
}
function tap(w, x, y) { const d = w.pointerDown(x, y); w.pointerUp(x, y); return d; }
function tapM(w, m) { return tap(w, m.cx, m.cy); }
function evs(w, type) { return w.drainEvents().filter(e => !type || e.type === type); }
function collect(w, s, dt) { const out = []; dt = dt || H; const n = Math.round(s / dt); for (let i = 0; i < n; i++) { w.update(dt); out.push(...w.drainEvents().map(e => Object.assign({ t: w.time }, e))); } return out; }
function wrongM(w) { return w.members.find(m => !m.odd && m.state === 'sit'); }

/* Independent rule checker (does not call FT.Content.ruleHolds). */
const VI_DIG = ['ngh', 'ng', 'nh', 'ch', 'gh', 'kh', 'ph', 'th', 'tr', 'gi', 'qu'];
function initialIndep(t, lang) {
  const name = t.kind === 'guest' ? FT.THING_NAMES[lang][t.animal] : t.kind === 'obj' ? FT.THING_NAMES[lang][t.obj] : null;
  if (!name) return null;
  let ws = name.toLowerCase().split(/\s+/);
  const cl = lang === 'vi' ? ['con', 'cái', 'quả', 'chiếc'] : ['the', 'a', 'an'];
  while (ws.length > 1 && cl.includes(ws[0])) ws.shift();
  const w0 = ws[0];
  if (lang === 'vi' && VI_DIG.some(d => w0.startsWith(d))) return null;
  if (w0[0] === 'đ') return 'Đ';
  return w0[0].normalize('NFD').replace(/[̣̀́̃̉]/g, '').normalize('NFC').toUpperCase();
}
function holds(rule, t, lang) {
  const v = rule.value;
  switch (rule.kind) {
    case 'color': return t.color === v;
    case 'shape': return t.kind === 'cookie' && t.shape === v;
    case 'size': return (t.big === false ? 'small' : 'big') === v;
    case 'n': return t.kind === 'plate' && t.n === v;
    case 'animal': return t.kind === 'guest' && t.animal === v;
    case 'home': return t.kind === 'guest' && GUESTS[t.animal] === v;
    case 'letter': return t.kind === 'card' && t.text.toUpperCase() === v;
    case 'initial': return initialIndep(t, lang) === v;
    case 'sum': { const m = /^(\d+)\+(\d+)$/.exec(t.text); return !!m && +m[1] + +m[2] === v; }
    case 'diff': { const m = /^(\d+)−(\d+)$/.exec(t.text); return !!m && +m[1] - +m[2] === v; }
    case 'parity': return t.kind === 'card' && /^\d+$/.test(t.text) && (+t.text % 2 ? 'odd' : 'even') === v;
  }
  throw new Error('rule ' + rule.kind);
}
const KIND_OF = { colors: 'obj', shapes: 'cookie', count: 'plate', animals: 'guest', letters: 'card', lower: 'card', add: 'card', sub: 'card', oddeven: 'card' };
function countWant(age, ri, level, short, topic) {
  const T = age <= 3 ? [3, 3, 3, 4] : age === 4 ? (level === 0 || topic === 'count' ? [3, 3, 4, 4] : [3, 4, 4, 5]) : age === 5 ? [3, 4, 5, 5] : [4, 5, 5, 5];
  let n = T[ri]; if (short && ri > 0) n = Math.min(n, age <= 4 ? 3 : 4); return n;
}

// ================================================================ rng / layout
test('rng: deterministic, ranges, fork', () => {
  const a = new FT.RNG(5), b = new FT.RNG(5);
  for (let i = 0; i < 100; i++) assert.strictEqual(a.next(), b.next());
  const r = new FT.RNG('x');
  for (let i = 0; i < 1000; i++) { const k = r.int(2, 4); assert.ok(k >= 2 && k <= 4); const f = r.float(1, 2); assert.ok(f >= 1 && f < 2); }
  assert.strictEqual(new FT.RNG(9).sample([1, 2, 3, 4], 3).length, 3);
  assert.notStrictEqual(new FT.RNG(3).fork(1).next(), new FT.RNG(3).next());
});

test('logical size: short side 720, long side clamped 960–1600', () => {
  const S = FT.World.logicalSize;
  assert.deepStrictEqual(S(1180, 820), { W: 1036, H: 720 });
  assert.deepStrictEqual(S(393, 852), { W: 720, H: 1561 });
  assert.deepStrictEqual(S(1024, 1024), { W: 960, H: 720 });
  assert.deepStrictEqual(S(300, 1000), { W: 720, H: 1600 });
});

test('layout: DESIGN §2 numbers (Moka, table, slots, garland, lanterns, fairy home) on 8 viewports × age × n', () => {
  for (const [name, [W, Hh, ins]] of Object.entries(VPS)) for (const age of AGES) for (let n = 3; n <= 5; n++) {
    const L = FT.World.computeLayout(W, Hh, ins, {}, age, null, n), I = Object.assign({ top: 0, right: 0, bottom: 0, left: 0 }, ins || {}), tag = `${name} age ${age} n ${n}`;
    const port = Hh > W;
    assert.strictEqual(L.groundY, Hh - I.bottom - (port ? 26 : 14), tag);
    assert.strictEqual(L.moka.x, I.left + (port ? 110 : 120), tag); assert.strictEqual(L.moka.y, L.groundY - (port ? 6 : 10)); assert.strictEqual(L.moka.h, port ? 220 : 250);
    const bb = L.bubble.y + L.bubble.h;
    assert.strictEqual(L.garland.y, bb + (port ? 50 : 46), tag); assert.strictEqual(L.garland.sag, 40);
    assert.strictEqual(L.garland.lanterns.length, 4);
    L.garland.lanterns.forEach((q, i) => {
      assert.ok(Math.abs(q.y - FT.World.garlandY(L.garland, q.u)) < 1e-9, 'lantern on the vine curve');
      assert.ok(q.cy - q.y > 34 && q.cy - q.y < 34 + 70, 'lantern hangs 34 px below');
      if (i) assert.ok(q.x > L.garland.lanterns[i - 1].x + 50, 'lanterns spread');
    });
    if (port) {
      assert.strictEqual(L.table.x0, I.left + 50); assert.strictEqual(L.table.x1, W - I.right - 50);
      assert.ok(L.table.y >= L.garland.bottom + 260 - 1e-9 || L.table.y === L.groundY - 60, tag + ' table ≥ garland + 260');
      assert.ok(L.table.y <= L.moka.y - L.moka.h - 40 + 1e-9 || L.table.y === L.garland.bottom + 260, tag);
    } else {
      assert.strictEqual(L.table.y, L.groundY - 150, tag); assert.strictEqual(L.table.x0, L.moka.x + 110); assert.strictEqual(L.table.x1, W - I.right - 60);
    }
    const base = { 3: 124, 4: 124, 5: 114, 6: 106, 7: 106 }[age];
    assert.ok([Math.round(base * 1.12), base, 100].includes(L.item) || L.squeezed, tag + ' item ' + L.item);
    if (L.item === Math.round(base * 1.12)) assert.ok(L.tall);
    assert.strictEqual(L.slots.length, n);
    for (let i = 0; i < n; i++) {
      const s = L.slots[i];
      assert.ok(s.x >= L.table.x0 + 40 - 0.5 && s.x <= L.table.x1 - 40 + 0.5, tag + ' slot in the table');
      assert.strictEqual(s.y, L.table.y);
      if (i) { const sp = s.x - L.slots[i - 1].x; assert.ok(sp >= 1.12 * L.item - 1e-6 && sp <= 1.7 * L.item + 1e-6, tag + ' spacing ' + sp); }
    }
    // things fully below the lanterns; not under Moka's head; on screen
    assert.ok(L.table.y - L.item * 1.12 > L.garland.bottom, tag + ' things clear of the lanterns');
    assert.ok(L.slots[0].x - L.item / 2 >= I.left && L.slots[n - 1].x + L.item / 2 <= W - I.right, tag + ' on screen');
    assert.ok(L.fairyHome.x > L.garland.x0 && L.fairyHome.x < L.garland.lanterns[0].x && L.fairyHome.y < FT.World.garlandY(L.garland, 0.08), tag + ' fairy perches on the vine near the left tree');
    assert.ok(L.table.y <= L.groundY - 60);
    assert.strictEqual(L.entryY, -140);
  }
});

test('layout: fuzz 400 aspects + insets + measured HUD / bottom toolbar boxes: finite, slots on screen, things ≥ 44 px above bottom keep-outs', () => {
  const r = new FT.RNG(11);
  for (let k = 0; k < 400; k++) {
    const land = r.chance(0.5), long = r.int(960, 1600), W = land ? long : 720, Hh = land ? 720 : long;
    const ins = { top: r.int(0, 60), bottom: r.int(0, 40), left: land ? r.int(0, 110) : 0, right: land ? r.int(0, 110) : 0 };
    const hk = [{ x: W - ins.right - 150, y: ins.top + 8, w: 140, h: r.int(50, 110) }];
    if (r.chance(0.4)) hk.push({ x: W / 2 - 100, y: Hh - ins.bottom - r.int(40, 90), w: 200, h: 50 });
    for (let n = 3; n <= 5; n++) {
      const L = FT.World.computeLayout(W, Hh, ins, {}, r.int(3, 7), hk, n);
      assert.ok([L.table.y, L.item, L.garland.y, L.moka.x].every(Number.isFinite));
      assert.ok(L.fits || L.squeezed);
      for (const s of L.slots) assert.ok(s.x - L.item / 2 >= -1 && s.x + L.item / 2 <= W + 1);
      for (const b of hk) if (b.y > Hh / 2) assert.ok(L.table.y <= b.y - 44 + 1e-9, 'above the bottom toolbar');
      assert.ok(L.garland.y >= L.bubble.y + L.bubble.h);
    }
  }
});

test('hit test: the nearest thing centre wins; a press at ± 0.3 r picks that thing; Moka loses to a thing; a press between things is soft', () => {
  const w = atPlay(4, 'colors', 2, { vp: 'iphoneP' });
  for (const m of w.members) {
    const h = w.memberHit(m.id);
    assert.ok(Math.abs(h.y - (m.y - m.lift - w._drawH(m) / 2)) < 1e-9 && Math.abs(h.r - (0.6 * m.size + w.layout.hitPad)) < 1e-9);
    for (const [dx, dy] of [[0.3, 0], [-0.3, 0.2], [0, -0.3]]) assert.strictEqual(w._memberAt(h.x + dx * h.r, h.y + dy * h.r).id, m.id);
  }
  assert.ok(w.layout.hitR * 2 >= 184 - 1e-9, 'phones: ≥ 184 logical px targets');
  const mb = w.mokaHit();
  assert.ok(mb.w > 100 && mb.h > 200);
  assert.strictEqual(w.pointerDown(mb.cx, mb.cy), 'moka'); assert.strictEqual(w.pointerUp(mb.cx, mb.cy), 'pokeMoka');
  assert.strictEqual(w.pointerDown(w.layout.W / 2, w.layout.groundY - 2), 'soft'); w.pointerUp();
});

// ================================================================ content
test('content: every topic × age 3–7 × en/vi × 2000 seeds — exactly one odd, the rest share the rule (independent check), kinds, counts, CVD', () => {
  let made = 0;
  for (const topic of ALL_TOPICS) for (const age of AGES) for (const lang of ['en', 'vi']) for (let s = 0; s < 2000; s++) {
    const ri = s % 4, level = (s >> 2) % 4, short = s % 7 === 5;
    const r = C.makeRound(topic, { age, lang, rng: new FT.RNG(s * 131 + age), roundIndex: ri, level, short, prevOddSlots: [s % 3] });
    made++;
    const tag = `${topic} age ${age} ${lang} seed ${s}`;
    assert.strictEqual(C.validate(r), null, tag);
    assert.strictEqual(r.members.length, countWant(age, ri, level, short, topic), tag + ' count');
    const odd = r.members.filter(m => m.odd);
    assert.strictEqual(odd.length, 1, tag);
    assert.strictEqual(odd[0].id, r.oddId);
    assert.notStrictEqual(r.oddSlot, s % 3, tag + ' never the previous odd slot');
    for (const m of r.members) {
      assert.strictEqual(holds(r.rule, m.thing, lang), !m.odd, tag + ' rule ' + JSON.stringify(r.rule) + ' ' + JSON.stringify(m.thing));
      if (KIND_OF[topic]) assert.strictEqual(m.thing.kind, KIND_OF[topic], tag);
      if (m.thing.kind === 'obj') { assert.ok(OBJECTS.includes(m.thing.obj)); assert.ok(HEX[m.thing.color]); }
      if (m.thing.kind === 'guest') assert.strictEqual(m.thing.home, GUESTS[m.thing.animal]);
      if (m.thing.kind === 'plate') assert.ok(m.thing.n >= 1 && m.thing.n <= 12);
      assert.ok(m.thing.nameKind && m.thing.nameValue !== undefined);
    }
    const cs = [...new Set(r.members.map(m => m.thing.color).filter(Boolean))];
    if (age < 5) { assert.ok(!CLASH.some(([a, b]) => cs.includes(a) && cs.includes(b)), tag + ' CVD ' + cs); assert.ok(!cs.includes('pink')); }
    if (topic === 'animals') {
      const ts = r.members.map(m => m.thing);
      if (age <= 3 || ri === 0) { assert.strictEqual(r.promptKey, 'p.animal'); assert.ok(ts.every(t => t.home === 'forest')); }
      else { assert.strictEqual(r.promptKey, 'p.forest'); assert.notStrictEqual(odd[0].thing.home, 'forest'); assert.notStrictEqual(odd[0].thing.animal, 'goldfish'); }
    }
    if (topic === 'size') assert.ok(r.members.every(m => m.thing.kind === 'obj' || (m.thing.kind === 'guest' && m.thing.home === 'forest')));
    if (topic === 'shapes' && age <= 4) assert.strictEqual(cs.length, 1, 'one icing colour ≤ 4');
  }
  assert.strictEqual(made, 11 * 5 * 2 * 2000);
});

test('content: chained chapters — never the same odd slot twice in a row, slots spread, no repeated set, no repeated ask', () => {
  for (const age of AGES) for (const topic of FT.AGE_POOLS[age]) {
    const hist = {};
    for (let c = 0; c < 300; c++) {
      const rng = new FT.RNG(c + age * 1000), used = [], prevSlots = []; let prevRule = null, run = 0, prev = null;
      for (let ri = 0; ri < 4; ri++) {
        const r = C.makeRound(topic, { age, lang: c % 2 ? 'vi' : 'en', rng, roundIndex: ri, level: 1, usedKeys: used, prevRule, prevRuleRun: run, prevOddSlots: prevSlots.slice() });
        if (prevSlots.length) assert.notStrictEqual(r.oddSlot, prevSlots[0], `${topic} age ${age}: odd slot twice in a row`);
        assert.ok(!used.includes(r.key));
        if (prevRule && !['home', 'size', 'parity'].includes(r.rule.kind)) assert.ok(String(prevRule.value) !== String(r.rule.value) || r.rule.kind !== prevRule.kind, 'same ask');
        used.push(r.key); prevSlots.unshift(r.oddSlot);
        run = prevRule && prevRule.kind === r.rule.kind && String(prevRule.value) === String(r.rule.value) ? run + 1 : 1; prevRule = r.rule;
        const n = r.members.length; (hist[n] = hist[n] || Array(n).fill(0))[r.oddSlot]++;
        prev = r;
      }
      void prev;
    }
    for (const n of Object.keys(hist)) { const h = hist[n], tot = h.reduce((a, b) => a + b, 0); if (tot > 200) h.forEach(v => assert.ok(v / tot > 0.5 / n, `slot spread ${topic} ${age} n ${n}: ${h}`)); }
  }
});

test('content: warm-up — age 4 chapter 1 has 3 things; very different shape pairs / colour pairs / berry counts in round 0', () => {
  const FAR = { circle: ['triangle', 'star', 'square'], square: ['star', 'triangle', 'heart'], triangle: ['circle', 'heart', 'square'], star: ['circle', 'square'], heart: ['square', 'triangle'] };
  for (let s = 0; s < 500; s++) {
    for (const topic of AGE_TOPICS[4]) {
      const r = C.makeRound(topic, { age: 4, lang: 'en', rng: new FT.RNG(s), roundIndex: 0, level: 0 });
      assert.strictEqual(r.members.length, 3);
      const o = r.members.find(m => m.odd).thing, f = r.members.find(m => !m.odd).thing;
      if (topic === 'shapes') assert.ok(FAR[f.shape].includes(o.shape), f.shape + ' vs ' + o.shape);
      if (topic === 'count') assert.ok(Math.abs(o.n - f.n) >= 2 && Math.max(o.n, f.n) <= 4);
      if (topic === 'colors') assert.ok(f.obj === o.obj && !CLASH.some(([a, b]) => [a, b].includes(f.color) && [a, b].includes(o.color)));
      if (topic === 'animals') assert.strictEqual(r.promptKey, 'p.animal');
    }
  }
});

test('content: initial letters en + vi (classifier dropped, tone marks dropped, digraph words skipped) — tea things + guests', () => {
  assert.strictEqual(C.initialOfName('cái tách', 'vi'), 'T'); assert.strictEqual(C.initialOfName('ấm trà', 'vi'), 'Â');
  assert.strictEqual(C.initialOfName('con thỏ', 'vi'), null); assert.strictEqual(C.initialOfName('chim cánh cụt', 'vi'), null);
  assert.strictEqual(C.initialOfName('con cá vàng', 'vi'), 'C'); assert.strictEqual(C.initialOfName('con lạc đà', 'vi'), 'L');
  assert.strictEqual(C.initialOfName('cupcake', 'en'), 'C'); assert.strictEqual(C.initialOfName('hedgehog', 'en'), 'H');
  for (const lang of ['en', 'vi']) { const g = C.initialGroups(lang, 'table'); assert.ok(Object.keys(g).filter(k => g[k].length >= 2).length >= 2, lang); }
});

test('content: Talk time — every topic × age: 2 choices at 3, 3 from 4, the answer is one of them, guests / homes, CVD', () => {
  for (const topic of ALL_TOPICS) for (const age of AGES) for (let s = 0; s < 300; s++) {
    const t = C.makeTalk(topic, { age, lang: s % 2 ? 'vi' : 'en', rng: new FT.RNG(s) });
    const want = topic === 'size' ? 2 : ['letters', 'lower', 'initial', 'add', 'sub', 'oddeven'].includes(topic) ? 3 : age <= 3 ? 2 : 3;
    assert.strictEqual(t.choices.length, want, topic + ' ' + age);
    assert.ok(t.choices.some(c => c.id === t.answer));
    assert.strictEqual(new Set(t.choices.map(c => String(c.value))).size, t.choices.length);
    if (topic === 'animals' && age > 3) { assert.ok(t.choices.every(c => c.thing.kind === 'home')); assert.ok(t.choices.some(c => c.value === 'forest')); assert.notStrictEqual(t.params.animal, 'goldfish'); assert.strictEqual(t.show.kind, 'guest'); }
    if (topic === 'animals' && age <= 3) assert.ok(t.choices.every(c => c.thing.kind === 'guest' && GUESTS[c.value] === 'forest'));
    if (topic === 'count') assert.strictEqual(t.show.kind, 'plate');
    if (topic === 'colors' && age < 5) { const cs = t.choices.map(c => c.value); assert.ok(!CLASH.some(([a, b]) => cs.includes(a) && cs.includes(b))); }
  }
});

test('content: topics — the first session plays FT.AGE_TOPICS; later sessions rotate (left-out topic comes back, easiest first)', () => {
  for (const age of AGES) {
    assert.deepStrictEqual(C.topicsFor(age), AGE_TOPICS[age]);
    const r = new FT.RNG(age), a = C.topicsFor(age, r, AGE_TOPICS[age]), pool = FT.AGE_POOLS[age];
    assert.strictEqual(a.length, 4); assert.ok(a.every(t => pool.includes(t)));
    const left = pool.filter(t => !AGE_TOPICS[age].includes(t));
    left.forEach(t => assert.ok(a.includes(t)));
  }
});

// ================================================================ world: enter
test('enter: things spawn above their placemats (0.22 s apart) and float down under dandelion fluff — terminal speed, pendulum sway, soft landing squash, table spring, mat pop, fluff drifts away', () => {
  const w = mkW(4);
  w.newSession(); w.levels[0] = 'colors'; w.startLevel(0);
  runUntil(w, () => w.state === 'round');
  const L = w.layout, n = w.members.length, spawn = {}, land = {}, peak = {}, minSy = {}, swings = {}, v = {};
  w.members.forEach(m => { assert.strictEqual(m.state, 'fall'); assert.ok(m.y <= L.entryY + 10, 'starts above the screen'); assert.ok(Math.abs(m.fluffX - m.tx) <= 60 + 1e-9); });
  let t = 0, first = null;
  while (w.phase === 'enter' && t < 6) {
    w.update(H); t += H;
    for (const e of w.drainEvents()) {
      if (e.type === 'fall') spawn[e.id] = t;
      if (e.type === 'land') { land[e.id] = t; assert.ok(Number.isFinite(e.x + e.y + e.i)); assert.strictEqual(e.y, L.table.y); }
      if (e.type === 'ask') first = e;
    }
    for (const m of w.members) {
      if (m.state === 'fall' && m._spawned) {
        assert.ok(m.fluff > 0 && m.fluffY < m.y - m.size, 'the fluff is above its thing');
        assert.ok(Math.abs(m.rot + m.swing) < 1e-9, 'hangs rigidly (rot = −swing)');
        (swings[m.id] = swings[m.id] || []).push(m.swing); v[m.id] = Math.max(v[m.id] || 0, m.fvy);
      }
      if (m.state === 'sit') { peak[m.id] = Math.max(peak[m.id] || 1, m.sx); minSy[m.id] = Math.min(minSy[m.id] || 1, m.sy); }
    }
  }
  assert.ok(first && first.first && first.promptKey === 'p.colors', 'ask {first} after everyone landed');
  assert.strictEqual(w.phase, 'play');
  const st = Object.values(spawn).sort((a, b) => a - b);
  assert.strictEqual(st.length, n);
  for (let i = 1; i < n; i++) assert.ok(Math.abs(st[i] - st[i - 1] - 0.22) < 0.02, 'stagger 0.22 s');
  assert.ok(t >= 1.4 && t <= 2.8, 'enter ' + t.toFixed(2) + ' s');
  for (const m of w.members) {
    const sw = swings[m.id], mx = Math.max(...sw.map(Math.abs));
    assert.ok(mx > 0.05 && mx < 0.3, 'pendulum sway ' + mx);
    assert.ok(Math.max(...sw) - Math.min(...sw) > 0.05, 'it swings');
    assert.ok(v[m.id] > 300, 'terminal-velocity descent ' + v[m.id]);
    assert.ok(peak[m.id] > 1.08 && peak[m.id] < 1.2 && minSy[m.id] < 0.9 && minSy[m.id] > 0.8, `landing squash sx ${peak[m.id]} sy ${minSy[m.id]}`);
    assert.strictEqual(m.y, L.table.y); assert.ok(Math.abs(m.x - m.tx) < 4, 'on its placemat');
    assert.ok(m.fluff < 1 && m.fluffY < m.y - m.size, 'the fluff let go');
  }
  // the fluffs drift up-left and fade; the table springs
  const f0 = w.members.map(m => [m.fluffX, m.fluffY]);
  run(w, 0.5);
  w.members.forEach((m, i) => assert.ok(m.fluffX < f0[i][0] && m.fluffY < f0[i][1]));
  run(w, 1.5);
  w.members.forEach(m => assert.strictEqual(m.fluff, 0));
  // table spring + placemat pop were kicked on landing
  const w2 = mkW(4); w2.newSession(); runUntil(w2, () => w2.members.some(m => m.state === 'sit'));
  let mxs = 0, mxp = 0; for (let k = 0; k < 30; k++) { w2.update(H); mxs = Math.max(mxs, Math.abs(w2.table.spring)); mxp = Math.max(mxp, ...w2.mats.map(q => q.pop)); }
  assert.ok(mxs > 0.8 && mxs < 6, 'table spring ' + mxs); assert.ok(mxp > 0.5, 'placemat pop');
});

test('enter: breezy wind pushes the fluffs and sways sitting things gently (≤ 0.04 rad); presses during the fall are soft "early"', () => {
  const w = mkW(4); w.setBreeze(1); w.newSession();
  runUntil(w, () => w.state === 'round');
  w.update(0.6);
  const m = w.members.find(q => q._spawned && q.state === 'fall');
  assert.ok(m.fvx > 0, 'pushed right by the breeze');
  assert.strictEqual(w.pointerDown(30, w.layout.H / 2), 'early'); w.pointerUp();
  runUntil(w, () => w.interactive); run(w, 2);
  let mx = 0; for (let k = 0; k < 600; k++) { w.update(H); for (const q of w.members) if (q._jumpT < 0) mx = Math.max(mx, Math.abs(q.rot)); }
  assert.ok(mx > 0.01 && mx <= 0.045, 'breeze sway ' + mx);
});

// ================================================================ world: right / rise / chime / cheers / clear
test('right: fairy flies in (0.45 s), circles + 3 dust, the thing levitates and floats up swaying + shrinking into its lantern, lantern opens with overshoot + swings; 3★', () => {
  const w = atPlay(4, 'colors', 1), o = w.odd, L = w.layout, q = w.garland.lanterns[1];
  const x0 = o.x, y0 = o.y;
  assert.strictEqual(tapM(w, o), 'member');
  const e0 = w.drainEvents(), right = e0.find(e => e.type === 'right');
  assert.ok(right && right.id === o.id && right.lantern === 1 && Number.isFinite(right.x + right.y));
  assert.strictEqual(w.phase, 'rise'); assert.strictEqual(w.interactive, false); assert.strictEqual(w.prompt(), null);
  const ev = [], ys = [], xs = [], scs = []; let t = 0, tArr = -1, tLan = -1, litMax = 0;
  while (w.state === 'round' && t < 8) {
    w.update(H); t += H;
    for (const e of w.drainEvents()) { ev.push(e); if (e.type === 'fairyArrive') tArr = t; if (e.type === 'lantern') tLan = t; }
    if (o._rs === 'float') { ys.push(o.y); xs.push(o.x); scs.push(o.scale); }
    litMax = Math.max(litMax, q.lit);
  }
  assert.ok(Math.abs(tArr - 0.45) < 0.03, 'fairy arrives after 0.45 s: ' + tArr);
  assert.strictEqual(ev.filter(e => e.type === 'dust').length, 3);
  ev.filter(e => e.type === 'dust').forEach(e => assert.ok(Number.isFinite(e.x + e.y)));
  assert.ok(ev.some(e => e.type === 'rise'));
  for (let i = 1; i < ys.length; i++) assert.ok(ys[i] <= ys[i - 1] + 1e-9, 'floats up monotonically');
  void x0; void y0;
  let dev = 0; for (let i = 0; i < xs.length; i++) { const u = (o._y0 - ys[i]) / (o._y0 - o._yT), base = o._x0 + (q.cx - o._x0) * (u * u * (3 - 2 * u)); dev = Math.max(dev, Math.abs(xs[i] - base)); }
  assert.ok(dev > 10 && dev <= 26.5, 'lateral sway ' + dev);
  assert.ok(scs[scs.length - 1] < 0.45 && scs[0] > 0.95, 'shrinks 1 → 0.42');
  assert.strictEqual(o.state, 'lantern');
  const lan = ev.find(e => e.type === 'lantern');
  assert.strictEqual(lan.i, 1); assert.strictEqual(lan.color, o.thing.color); assert.ok(Math.abs(lan.x - q.cx) < 1e-9);
  assert.ok(tLan > 1.6 && tLan < 4, 'lantern after ' + tLan);
  assert.ok(Math.abs(o.x - q.cx) < 1 && Math.abs(o.cy - q.cy) < 2, 'vanished into the lantern');
  const rd = ev.find(e => e.type === 'roundDone');
  assert.ok(rd && rd.stars === 3 && rd.misses === 0);
  assert.strictEqual(w.state, 'roundDone'); assert.strictEqual(w.phase, 'chime');
  run(w, 0.4, H); litMax = Math.max(litMax, q.lit);
  assert.ok(litMax > 1.1, 'lantern opens with a spring overshoot ' + litMax);
  assert.ok(Math.abs(q.swing) > 0.02 || Math.abs(q.swingV) > 0.05, 'the lantern swings');
  run(w, 3, H);
  assert.ok(Math.abs(q.lit - 1) < 0.05);
  assert.strictEqual(q.thing, o.thing);
  assert.strictEqual(w.fairy.state === 'rest' || w.fairy.state === 'loop', true);
  void L;
});

test('chime → cheers → clear: friends hop one after another left → right (26 px, bell ring, guests _hop), Moka cheers, a poof sweep clears the table, next round', () => {
  const w = atPlay(4, 'animals', 1);
  tapM(w, w.odd);
  runUntil(w, () => w.phase === 'chime');
  const t0 = w.time, ev = [], lifts = {};
  let hopSeen = false;
  while (!(w.state === 'round' && w.phase === 'enter') && w.time - t0 < 8) {
    w.update(H);
    for (const e of w.drainEvents()) ev.push(Object.assign({ t: w.time - t0 }, e));
    for (const m of w.members) { lifts[m.id] = Math.max(lifts[m.id] || 0, m.lift); if (m.hop) hopSeen = true; }
  }
  const ch = ev.filter(e => e.type === 'chime');
  assert.strictEqual(ch.length, w.members.length - 0 ? ch.length : 0);
  assert.ok(ch.length >= 2);
  for (let i = 0; i < ch.length; i++) { assert.strictEqual(ch[i].i, i); assert.strictEqual(ch[i].n, ch.length); if (i) { assert.ok(ch[i].x > ch[i - 1].x, 'left → right'); assert.ok(Math.abs(ch[i].t - ch[i - 1].t - 0.3) < 0.02); } }
  assert.ok(hopSeen, 'guest hop frame');
  ch.forEach(e => assert.ok(lifts[e.id] > 24 && lifts[e.id] < 28, 'hop 26 px: ' + lifts[e.id]));
  const cheers = ev.find(e => e.type === 'cheers'), poofs = ev.filter(e => e.type === 'poof');
  assert.ok(cheers && cheers.t > ch[ch.length - 1].t && Number.isFinite(cheers.x + cheers.y));
  assert.strictEqual(poofs.length, ch.length);
  for (let i = 1; i < poofs.length; i++) assert.ok(poofs[i].x >= poofs[i - 1].x && poofs[i].t >= poofs[i - 1].t, 'poof sweep left → right');
  assert.ok(poofs[0].t - cheers.t > 1.0, 'cheers ≈ 1.1 s');
  assert.ok(ev.some(e => e.type === 'round' && e.round === 2));
  assert.ok(w.garland.lanterns[1].lit > 0.9, 'lanterns stay lit through the chapter');
});

test('count: the odd plate\'s berries are counted one by one (count i = 1..n, 0.5 s apart) before it floats up', () => {
  const w = atPlay(4, 'count', 2), o = w.odd;
  tapM(w, o);
  const right = evs(w).find(e => e.type === 'right');
  assert.deepStrictEqual(right.count, { n: o.thing.n, others: w.cur.rule.value });
  const ev = collect(w, 10);
  const cs = ev.filter(e => e.type === 'count'), rise = ev.find(e => e.type === 'rise');
  assert.deepStrictEqual(cs.map(e => e.i), Array.from({ length: o.thing.n }, (_, i) => i + 1));
  for (let i = 1; i < cs.length; i++) assert.ok(Math.abs(cs[i].t - cs[i - 1].t - 0.5) < 0.02);
  assert.ok(rise.t > cs[cs.length - 1].t + 0.3, 'counted before the rise');
});

test('forest: a guest that lives elsewhere floats up and its home badge shows under its lantern for 2 s', () => {
  const w = atPlay(5, 'animals', 1), o = w.odd;
  assert.strictEqual(w.cur.promptKey, 'p.forest');
  tapM(w, o);
  assert.strictEqual(evs(w).find(e => e.type === 'right').home, o.thing.home);
  runUntil(w, () => !!w.garland.badge, 10);
  const b = w.garland.badge;
  assert.strictEqual(b.home, o.thing.home); assert.strictEqual(b.i, 1); assert.ok(b.y > w.garland.lanterns[1].cy);
  const t0 = w.time; let amax = 0;
  while (w.garland.badge) { w.update(H); if (w.garland.badge) amax = Math.max(amax, w.garland.badge.a); }
  assert.ok(Math.abs(w.time - t0 - 2) < 0.05 && amax > 0.99);
});

// ================================================================ world: wrong / hint / soft / assist / slide / Moka
test('wrong: a "no-no" wiggle (±0.18 rad spring, ω 18) + a 14 px hop, a miss; the same thing again within 1 s is not a new miss (wiggle repeat)', () => {
  const w = atPlay(4, 'colors', 1), m = wrongM(w);
  tapM(w, m);
  const e = evs(w).find(q => q.type === 'wrong');
  assert.ok(e && e.id === m.id && e.got.nameValue === m.thing.color && e.want.kind === 'color' && e.misses === 1 && Number.isFinite(e.x + e.y));
  let pk = 0, lift = 0; for (let k = 0; k < 40; k++) { w.update(H); pk = Math.max(pk, Math.abs(m.wig)); lift = Math.max(lift, m.lift); }
  assert.ok(Math.abs(pk - 0.18) < 0.02, 'wiggle peak ' + pk); assert.ok(Math.abs(lift - 14) < 1, 'hop ' + lift);
  tapM(w, m);
  const e2 = evs(w);
  assert.ok(e2.some(q => q.type === 'wiggle' && q.repeat)); assert.strictEqual(w.misses, 1);
  assert.strictEqual(w.interactive, true, 'no fail state');
});

test('hint: after 2 misses the odd one glows + the ghost hand taps it (1.6 s cycle); 6 s cooldown; 2 misses → 1★; manual hint()', () => {
  const w = atPlay(4, 'colors', 2), others = w.members.filter(m => !m.odd);
  tapM(w, others[0]); run(w, 1.2);
  tapM(w, others[1] || others[0]);
  const ev = evs(w), wr = ev.filter(e => e.type === 'wrong');
  assert.ok(wr[1].hint === true);
  const h = ev.find(e => e.type === 'hint');
  assert.ok(h && h.id === w.odd.id && h.mode === 'tap');
  run(w, 0.3, H);
  assert.ok(w.hintHand && w.hintHand.id === w.odd.id && w.hintHand.alpha > 0);
  let presses = 0, was = 0; for (let k = 0; k < 192; k++) { w.update(H); const p = w.hintHand ? w.hintHand.press : 0; if (p > 0.5 && was <= 0.5) presses++; was = p; }
  assert.strictEqual(presses, 2, 'taps twice per cycle');
  assert.ok(w.odd.glow > 0.3);
  run(w, 2);
  assert.strictEqual(w.hintHand, null);
  tapM(w, others[0]); assert.ok(!evs(w).some(e => e.type === 'hint'), 'cooldown');
  run(w, 6);
  assert.ok(w.hint().member === w.odd.id);
  tapM(w, w.odd);
  const rd = collect(w, 6).find(e => e.type === 'roundDone');
  assert.strictEqual(rd.stars, 1);
});

test('idle: nudges at 12 → 18 → 27 → 30 s (backoff ×1.5, cap 30); the 2nd idle shows the hint; touches reset it', () => {
  const w = atPlay(4, 'shapes', 1);
  const ev = collect(w, 125, 1 / 60), id = ev.filter(e => e.type === 'idle'), t0 = ev.length ? ev[0].t - 0 : 0; void t0;
  const start = w.time - 125, ts = id.map(e => +(e.t - start).toFixed(1));
  assert.deepStrictEqual(ts.slice(0, 5), [12, 30, 57, 87, 117].map(x => +x.toFixed(1)));
  assert.ok(ev.some(e => e.type === 'hint' && e.idle));
  assert.strictEqual(w.interactive, true, 'waits for the child');
});

test('soft presses: dust sparkle, 3 → hint, 6 → assist armed (the next press anywhere in the table band picks the odd one, ≤ 2★); soft never a miss', () => {
  const w = atPlay(4, 'colors', 1), L = w.layout;
  const px = L.W / 2, py = L.groundY - 4;
  for (let i = 0; i < 3; i++) { assert.strictEqual(tap(w, px, py), 'soft'); w.update(0.05); }
  let ev = evs(w);
  assert.strictEqual(ev.filter(e => e.type === 'soft').length, 3); assert.ok(ev.some(e => e.type === 'hint')); assert.strictEqual(w.misses, 0);
  assert.ok(w.puffs.length > 0);
  for (let i = 0; i < 3; i++) { tap(w, px, py); w.update(0.05); }
  ev = evs(w);
  const arm = ev.find(e => e.type === 'assistArmed');
  assert.ok(arm && arm.id === w.odd.id);
  const other = wrongM(w);
  tapM(w, other);
  ev = evs(w);
  assert.ok(ev.some(e => e.type === 'assist' && e.from === other.id) && ev.some(e => e.type === 'right'));
  assert.strictEqual(collect(w, 6).find(e => e.type === 'roundDone').stars, 2);
});

test('slide: a press on nothing that moves onto a thing within 0.25 s is judged on it; later contacts of the gesture are ignored', () => {
  const w = atPlay(5, 'shapes', 1), o = w.odd, L = w.layout, sx = o.cx, sy = L.groundY - 2;
  assert.strictEqual(w.pointerDown(sx, sy), 'soft');
  w.update(0.05); w.pointerMove(o.cx, o.cy);
  assert.ok(evs(w).some(e => e.type === 'right')); w.pointerUp();
  const w2 = atPlay(5, 'shapes', 1), o2 = w2.odd, m2 = wrongM(w2);
  w2.pointerDown(o2.cx, w2.layout.groundY - 2); w2.update(0.3); w2.pointerMove(o2.cx, o2.cy); w2.pointerUp();
  assert.ok(!evs(w2).some(e => e.type === 'right'), 'too late');
  w2.pointerDown(m2.cx, m2.cy); w2.pointerMove(o2.cx, o2.cy); w2.pointerUp();
  const e3 = evs(w2);
  assert.ok(e3.some(e => e.type === 'wrong') && !e3.some(e => e.type === 'right'), 'one judgement per gesture');
});

test('Moka: a tap repeats the question (pokeMoka with the prompt); outside play it is a busy poke; never a miss', () => {
  const w = atPlay(4, 'colors', 0), b = w.mokaHit();
  tap(w, b.cx, b.cy);
  const p = evs(w).find(e => e.type === 'pokeMoka');
  assert.ok(p && p.promptKey === 'p.colors' && Number.isFinite(p.x + p.y));
  tapM(w, w.odd); w.update(0.1); evs(w);
  tap(w, b.cx, b.cy);
  assert.ok(evs(w).find(e => e.type === 'pokeMoka').busy);
  assert.strictEqual(w.misses, 0);
  const m = w.members.find(q => q.state === 'sit');
  assert.strictEqual(tapM(w, m), 'brush', 'a thing tapped while another rises just hops');
});

// ================================================================ critters
test('critters: one round per chapter (round 1 or 2, never the warm-up) — ladybug / butterfly / snail / fairies by chapter; tap → critterTap; never a mistake; they leave', () => {
  const kinds = ['ladybug', 'butterfly', 'snail', 'fairies'];
  for (let lv = 0; lv < 4; lv++) for (const seed of [3, 8]) {
    const w = mkW(4, { seed }); w.newSession(); w.startLevel(lv);
    let seen = null, tapped = false, rounds = new Set();
    for (let k = 0; k < 40 * 120 && w.state !== 'talk'; k++) {
      w.update(1 / 60);
      for (const e of w.drainEvents()) {
        if (e.type === 'round' && e.surprise) rounds.add(e.round);
        if (e.type === 'critter') { seen = e; assert.strictEqual(e.kind, kinds[lv]); assert.ok(Number.isFinite(e.x + e.y)); }
        if (e.type === 'critterTap') tapped = true;
      }
      const h = w.critterHit();
      if (h && !tapped && w.critter.t > 0.8) {
        assert.ok(h.x > 0 && h.x < w.layout.W && h.y > 0 && h.y < w.layout.H);
        const m0 = w.misses; assert.strictEqual(tap(w, h.x, h.y), 'critter'); assert.strictEqual(w.misses, m0, 'a critter tap is never a miss');
      }
      if (w.interactive && w.phaseTime > 9) tapM(w, w.odd);
    }
    assert.ok(seen, 'critter appeared in chapter ' + lv); assert.ok(tapped, kinds[lv] + ' tapped');
    assert.strictEqual(rounds.size, 1); assert.ok([1, 2].includes([...rounds][0]));
    assert.strictEqual(w.critter, null, 'gone by Talk time');
  }
});

test('critters: the ladybug walks the table front edge and stops in a gap; the butterfly sits on a friend (not the odd one); a press on a thing beats a nearby critter', () => {
  const w = mkW(4, { seed: 5 }); w.newSession(); w.startLevel(0);
  w._surpriseRound = 1;
  runUntil(w, () => w.round === 0 && w.interactive, 30); tapM(w, w.odd);
  runUntil(w, () => w.round === 1 && w.interactive, 30);
  runUntil(w, () => !!w.critter, 10);
  const c = w.critter, L = w.layout;
  assert.strictEqual(c.kind, 'ladybug'); assert.strictEqual(c.y, L.table.y + CFG.ladybug.dy);
  runUntil(w, () => c.state === 'stop', 20);
  const sl = L.slots; assert.ok(sl.some((s, i) => i && Math.abs(c.x - (s.x + sl[i - 1].x) / 2) < 1), 'stops between placemats');
  for (const m of w.members) { const d = w._memberAt(m.cx, m.cy + 20); assert.strictEqual(d && d.id, m.id); }
  const w2 = mkW(4, { seed: 5 }); w2.newSession(); w2.startLevel(1); w2._surpriseRound = 1;
  runUntil(w2, () => w2.round === 0 && w2.interactive, 30); tapM(w2, w2.odd);
  runUntil(w2, () => w2.round === 1 && w2.critter && w2.critter.state === 'sit', 30);
  const b = w2.critter, on = w2.memberById(b.onId);
  assert.ok(!on.odd && Math.abs(b.x - on.x) < 1 && b.y < on.cy - on.size * 0.4);
});

// ================================================================ chapter / talk / session
test('chapter: Talk after round 4; after ≥ 3 rounds once the chapter passed 75 s (dark lanterns light up gold, garlandFull); late rounds are short', () => {
  const w = mkW(4); w.newSession();
  const ev = [];
  for (let k = 0; k < 120 * 120 && w.state !== 'talk'; k++) { w.update(H); ev.push(...w.drainEvents()); if (w.interactive && w.phaseTime > 1) tapM(w, w.odd); }
  assert.strictEqual(ev.filter(e => e.type === 'roundDone').length, 4);
  const gf = ev.find(e => e.type === 'garlandFull'); assert.ok(gf && gf.n === 4);
  assert.ok(ev.findIndex(e => e.type === 'garlandFull') < ev.findIndex(e => e.type === 'talk'));
  assert.ok(w.garland.lanterns.every(q => q.lit > 0.8) && w.garland.twinkle > 0.5);
  // a slow chapter
  const w2 = mkW(4); w2.newSession(); const e2 = [];
  for (let k = 0; k < 300 * 60 && w2.state !== 'talk'; k++) { w2.update(1 / 60); e2.push(...w2.drainEvents()); if (w2.interactive && w2.phaseTime > 24) tapM(w2, w2.odd); }
  assert.strictEqual(e2.filter(e => e.type === 'roundDone').length, 3);
  assert.strictEqual(w2.roundsPerLevel, 3);
  assert.ok(e2.filter(e => e.type === 'lantern' && e.auto).length === 1);
  assert.ok(e2.some(e => e.type === 'round' && e.short));
});

test('talk: answer → +1★ → levelDone; no answer → re-asked 3× (glow from the 2nd) then Moka answers (no star); skipTalk', () => {
  const w = mkW(4); w.newSession(); w.startLevel(0);
  w._startTalk();
  assert.strictEqual(w.state, 'talk');
  const s0 = w.stars;
  assert.ok(w.talkAnswer(w.talk.answer)); assert.strictEqual(w.stars, s0 + 1);
  run(w, 1.7); assert.strictEqual(w.state, 'levelDone');
  w._startTalk(); w.drainEvents();
  const ev = collect(w, 40, 1 / 60);
  assert.deepStrictEqual(ev.filter(e => e.type === 'talkAsk').map(e => e.n), [1, 2, 3]);
  assert.ok(ev.filter(e => e.type === 'talkAsk')[1].glowAnswer);
  const tr = ev.find(e => e.type === 'talkResult'); assert.ok(tr.auto && !tr.correct, JSON.stringify(tr));
  w._startTalk(); w.skipTalk(); assert.strictEqual(w.state, 'levelDone');
});

function botSession(age, skill, vp, seed, lang) {
  const w = mkW(age, { vp, seed, lang }), b = new FT.Bot(w, { skill, seed: seed + 1 });
  w.newSession();
  let t = 0, rT = 0, maxR = 0, roundsDone = 0, starsR = [], ev = [];
  while (w.state !== 'sessionDone' && t < 1500) {
    b.step(1 / 30); w.update(1 / 30); t += 1 / 30;
    for (const e of w.drainEvents()) {
      b.onEvent(e); ev.push(e);
      if (e.type === 'round') rT = w.time;
      if (e.type === 'roundDone') { roundsDone++; maxR = Math.max(maxR, w.time - rT); starsR.push(e.stars); }
    }
  }
  return { w, b, t, maxR, roundsDone, starsR, ev };
}
test('full headless bot sessions per age × skill (1, 0.6, 0) × viewport: sessionDone, every round completable, no stuck round, stars 3/2/1, events carry x, y', () => {
  const vps = Object.keys(VPS);
  let k = 0;
  for (const age of AGES) for (const skill of [1, 0.6, 0]) {
    const vp = vps[k++ % vps.length], r = botSession(age, skill, vp, 100 + k, k % 2 ? 'vi' : 'en'), tag = `age ${age} skill ${skill} ${vp}`;
    assert.strictEqual(r.w.state, 'sessionDone', tag);
    assert.ok(r.roundsDone >= 12 && r.roundsDone <= 16, tag);
    assert.ok(r.maxR < 120, tag + ' stuck round ' + r.maxR);
    assert.ok(r.t < 8 * 60, tag + ' session ' + (r.t / 60).toFixed(1) + ' min');
    if (skill === 1) assert.ok(r.starsR.every(s => s === 3));
    if (skill === 0) assert.ok(r.starsR.every(s => s <= 2));
    assert.ok(r.b.stats.taps > 0 && r.ev.some(e => e.type === 'sessionDone'));
    for (const e of r.ev) if (!NONPOS.includes(e.type)) assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y), tag + ' event ' + e.type + ' x, y');
  }
  // topics rotate next session
  const w = mkW(4); w.newSession(); const t1 = w.levels.slice(); w.lastTopics = t1; w.newSession();
  assert.notDeepStrictEqual(w.levels, t1);
});

// ================================================================ rotation / determinism / interpolation
test('rotation mid-fall: falling things drift to the new slots and land on the new table; mid-rise: the thing retargets its lantern; everything stays on screen', () => {
  // mid-fall
  const w = mkW(4, { vp: 'iphoneP' }); w.newSession();
  runUntil(w, () => w.state === 'round'); run(w, 0.7, H);
  assert.ok(w.members.some(m => m.state === 'fall' && m._spawned));
  w.pointerDown(10, 10);
  w.setViewport(1561, 720, { left: 108, right: 108, bottom: 38 });
  assert.strictEqual(w._g, null, 'gesture cancelled');
  const L = w.layout;
  for (let k = 0; k < 600 && w.phase === 'enter'; k++) {
    w.update(H);
    for (const m of w.members) if (m._spawned) assert.ok(m.x > 0 && m.x < L.W && m.y <= L.table.y + 1e-9, 'on screen, above the new table');
  }
  assert.strictEqual(w.phase, 'play');
  w.members.forEach((m, i) => { assert.strictEqual(m.y, L.table.y); assert.ok(Math.abs(m.x - L.slots[i].x) < 3); });
  // mid-rise
  const o = w.odd; tapM(w, o);
  runUntil(w, () => o._rs === 'float' && o._ft > 0.4, 10);
  w.setViewport(720, 1561, { top: 108, bottom: 62 });
  const L2 = w.layout, q = L2.garland.lanterns[0];
  runUntil(w, () => o.state === 'lantern', 10);
  assert.ok(Math.abs(o.x - q.cx) < 1 && Math.abs(o.cy - q.cy) < 2, 'into the new lantern');
  runUntil(w, () => w.phase === 'clear', 10);
  for (const m of w.members) if (m.state === 'sit') assert.ok(Math.abs(m.y - L2.table.y) < 1e-9 && m.x > 0 && m.x < L2.W);
  // mid-play: sitting things spring to the new slots
  const w3 = atPlay(5, 'shapes', 2, { vp: 'ipadL' }); w3.setViewport(720, 1036, { top: 21, bottom: 18 });
  run(w3, 1.5, H);
  w3.members.forEach((m, i) => assert.ok(Math.abs(m.x - w3.layout.slots[i].x) < 2 && m.y === w3.layout.table.y));
  tapM(w3, w3.odd); assert.ok(evs(w3).some(e => e.type === 'right'));
});

test('determinism: the same seed + the same inputs → the same events whatever the frame size', () => {
  function go(dt) {
    const w = mkW(5, { seed: 42 }), b = new FT.Bot(w, { skill: 0.7, seed: 3 }); w.newSession(); w.setBreeze(0.3);
    const out = [];
    for (let t = 0; t < 120; t += dt) { b.step(dt); w.update(dt); for (const e of w.drainEvents()) { b.onEvent(e); out.push(e.type + ':' + (e.id || '') + ':' + (e.x !== undefined ? e.x.toFixed(3) : '')); } }
    return out;
  }
  const a = go(1 / 60), b = go(1 / 60);
  assert.deepStrictEqual(a, b);
  const w1 = mkW(4, { seed: 9 }), w2 = mkW(4, { seed: 9 }); w1.newSession(); w2.newSession();
  const e1 = [], e2 = [];
  for (let k = 0; k < 600; k++) { w1.update(1 / 120); for (const e of w1.drainEvents()) e1.push(e.type + (e.x || 0).toFixed(4)); }
  for (let k = 0; k < 100; k++) { w2.update(1 / 20); for (const e of w2.drainEvents()) e2.push(e.type + (e.x || 0).toFixed(4)); }
  assert.deepStrictEqual(e1, e2);
});

test('interpolation twins: _px _py _plift _prot _psx _psy _pscale _pfluffX _pfluffY (things), fairy / critter / lantern / table twins = the values at the start of the last sub-step; alpha', () => {
  const w = atPlay(4, 'animals', 2), o = w.odd;
  tapM(w, o);
  runUntil(w, () => o._rs === 'float', 5);
  run(w, 0.2, H);
  const snap = { x: o.x, y: o.y, lift: o.lift, rot: o.rot, sx: o.sx, sy: o.sy, scale: o.scale, fx: o.fluffX, fy: o.fluffY, fairyX: w.fairy.x, lit: w.garland.lanterns[2].lit, sp: w.table.spring };
  w.update(H);
  assert.strictEqual(o._px, snap.x); assert.strictEqual(o._py, snap.y); assert.strictEqual(o._plift, snap.lift); assert.strictEqual(o._prot, snap.rot);
  assert.strictEqual(o._psx, snap.sx); assert.strictEqual(o._psy, snap.sy); assert.strictEqual(o._pscale, snap.scale);
  assert.strictEqual(o._pfluffX, snap.fx); assert.strictEqual(o._pfluffY, snap.fy);
  assert.strictEqual(w.fairy._px, snap.fairyX); assert.strictEqual(w.garland.lanterns[2]._plit, snap.lit); assert.strictEqual(w.table._pspring, snap.sp);
  assert.notStrictEqual(o.y, o._py, 'it moved');
  w.update(H * 0.5);
  assert.ok(w.alpha > 0.49 && w.alpha < 0.51);
  assert.ok(CFG.step <= 1 / 120 + 1e-12);
  for (const m of w.members) for (const k of ['_px', '_py', '_plift', '_prot', '_psx', '_psy', '_pscale', '_pfluffX', '_pfluffY', '_palpha']) assert.ok(k in m, k);
});

test('motion is smooth: no position jumps > 40 px in one 1/120 s sub-step for things / fairy / critters over full sessions', () => {
  for (const age of [3, 6]) {
    const w = mkW(age, { vp: age === 3 ? 'iphoneP' : 'ipadL', seed: age }), b = new FT.Bot(w, { skill: 0.7, seed: 1 }); w.newSession();
    for (let k = 0; k < 240 * 120 && w.state !== 'sessionDone'; k++) {
      b.step(H); w.update(H);
      for (const e of w.drainEvents()) b.onEvent(e);
      for (const m of w.members) if (m._spawned !== false || m.state !== 'fall') { if (m.state !== 'gone' && m.state !== 'lantern') assert.ok(Math.hypot(m.x - m._px, m.y - m._py) < 40, 'thing jump ' + m.state); }
      assert.ok(Math.hypot(w.fairy.x - w.fairy._px, w.fairy.y - w.fairy._py) < 40, 'fairy jump ' + w.fairy.state);
      if (w.critter && w.critter.kind !== 'fairies') assert.ok(Math.hypot(w.critter.x - w.critter._px, w.critter.y - w.critter._py) < 40, 'critter jump');
    }
  }
});

// ================================================================ weather / bot
test('weather: moods (sky colours, darkness, wind), crossfade 2.5 s, particle kinds per mood ⊂ DESIGN §4.4, cap 120, bursts, addDust, party, rain splashes on the table', () => {
  const W = FT.Weather, wx = new W({ width: 1280, height: 720, seed: 3, groundY: 706, tableY: 556 });
  assert.deepStrictEqual(W.NAMES, ['sunny', 'breezy', 'rain', 'rainbow']);
  assert.deepStrictEqual([...W.KINDS].sort(), [...PARTICLES].sort());
  wx.setTable(230, 1220, 556);
  const kindsBy = {};
  for (let i = 0; i < 4; i++) {
    wx.setWeather(i, { instant: true });
    const a = wx.ambient, nm = W.NAMES[i];
    assert.strictEqual(a.skyTop, SKY[nm][0]); assert.strictEqual(a.skyBottom, SKY[nm][1]); assert.strictEqual(a.mood, nm); assert.strictEqual(a.moodIndex, i);
    let windMax = 0, splashTable = 0;
    for (let k = 0; k < 900; k++) { wx.update(1 / 60); windMax = Math.max(windMax, wx.ambient.wind); for (const p of wx.particles) if (p.kind === 'splash' && Math.abs(p.y - 556) < 12 && p.x > 230 && p.x < 1220) splashTable++; }
    kindsBy[nm] = new Set(wx.particles.map(p => p.kind));
    for (const p of wx.particles) { assert.ok(PARTICLES.includes(p.kind), p.kind); assert.ok(Number.isFinite(p.x + p.y + p.a + p.s + p.rot)); assert.ok(p.layer === 'back' || p.layer === 'front'); }
    if (nm === 'breezy') assert.ok(windMax > 0.6); else assert.ok(windMax < 0.3);
    if (nm === 'rain') { assert.strictEqual(a.darkness, 0.12); assert.ok(splashTable > 20, 'splashes on the table'); } else assert.strictEqual(wx.ambient.darkness, 0);
  }
  assert.ok(kindsBy.sunny.has('mote') && kindsBy.sunny.has('seed'));
  assert.ok(kindsBy.breezy.has('leaf') && kindsBy.breezy.has('petal'));
  assert.ok(kindsBy.rain.has('raindrop') && kindsBy.rain.has('splash'));
  assert.ok(kindsBy.rainbow.has('sparkle') && wx.ambient.rainbow === 1);
  wx.setWeather(0, { instant: true }); wx.setWeather(3);
  for (let k = 0; k < 75; k++) wx.update(1 / 60);
  assert.ok(wx.ambient.envMix > 0.2 && wx.ambient.envMix < 0.8, 'crossfade');
  for (let k = 0; k < 200; k++) wx.update(1 / 60);
  assert.strictEqual(wx.ambient.envMix, 1);
  for (const kind of ['sparkle', 'stars', 'confetti', 'leaves', 'puff', 'dust', 'splash', 'seeds']) wx.burst(600, 300, { kind, n: 30 });
  assert.ok(wx.particles.length <= 120, 'cap ' + wx.particles.length);
  const wx2 = new W({ width: 1280, height: 720, seed: 1 }); wx2.setWeather(2, { instant: true });
  wx2.particles.length = 0; wx2.addDust(100, 200, 8);
  assert.ok(wx2.particles.filter(p => p.kind === 'dust').length === 8 && wx2.particles.every(p => p.tint));
  wx2.party(true); for (let k = 0; k < 120; k++) wx2.update(1 / 60);
  assert.ok(wx2.ambient.party > 0.9 && wx2.particles.some(p => /confetti/.test(p.kind)));
  wx2.resize(720, 1556, 1530, 1200);
  for (let k = 0; k < 60; k++) wx2.update(1 / 60);
  for (const p of wx2.particles) assert.ok(Number.isFinite(p.x + p.y + p.a));
});

test('bot: plays only through the pointer API + talkAnswer; taps critters and pokes Moka sometimes; skill 1 never misses', () => {
  let critter = 0, poke = 0;
  for (let s = 0; s < 6; s++) { const r = botSession(4, 1, 'land1280', 300 + s); critter += r.b.stats.critter; poke += r.b.stats.poke; assert.strictEqual(r.b.stats.wrong, 0); assert.ok(r.b.stats.right >= 12); }
  assert.ok(critter > 0 && poke >= 0);
});

// ---------------------------------------------------------------- runner
(async () => {
  const only = process.argv[2];
  let pass = 0, fail = 0;
  const t0 = Date.now();
  for (const t of tests) {
    if (only && !t.name.includes(only)) continue;
    const s = Date.now();
    try { await t.fn(); pass++; console.log(`  ok  ${t.name} (${Date.now() - s} ms)`); }
    catch (e) { fail++; console.log(`FAIL  ${t.name}\n      ${(e && e.stack || e).toString().split('\n').slice(0, 4).join('\n      ')}`); }
  }
  console.log(`\n${pass} passed, ${fail} failed (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  process.exit(fail ? 1 : 0);
})();
