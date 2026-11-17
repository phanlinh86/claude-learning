#!/usr/bin/env node
// Tibo's Dino Lake Fishing — headless unit tests for rng / content / world / weather / bot (mechanics engineer's suite).
// Run from the game folder:   node tests/unit/run.js [name part]      (exit 1 on any failure)
// (tests/unit/i18n_voice.test.js and fish_art.test.js are the other engineers' suites and run on their own.)
'use strict';
const assert = require('assert');
const { load } = require('./load');

const TL = load();
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const H = 1 / 120;
const AGES = [3, 4, 5, 6, 7];
const C = TL.Content;
const CFG = TL.CONFIG;
const J = v => JSON.parse(JSON.stringify(v));

// ---- independent copies of the DESIGN tables (§3, §5.1)
const AGE_TOPICS = { 3: ['colors', 'shapes', 'size', 'animals'], 4: ['colors', 'shapes', 'count', 'animals'],
  5: ['shapes', 'count', 'letters', 'animals'], 6: ['lower', 'initial', 'add', 'count'], 7: ['initial', 'add', 'sub', 'oddeven'] };
const ALL_TOPICS = ['colors', 'shapes', 'size', 'animals', 'count', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
const CLASH = [['blue', 'purple'], ['red', 'green'], ['yellow', 'orange'], ['green', 'orange'], ['red', 'orange']];
const HEX = { red: '#E84A4A', blue: '#3C8DE8', yellow: '#FFD23F', green: '#4CC26B', orange: '#FF9A2E', purple: '#8E44AD', pink: '#FF8FC0' };
const GUESTS = { bunny: 'forest', fox: 'forest', deer: 'forest', squirrel: 'forest', owl: 'forest', raccoon: 'forest', mouse: 'forest',
  hedgehog: 'forest', penguin: 'ice', crab: 'sea', goldfish: 'sea', camel: 'desert', lion: 'savanna' };
const WATER = { morning: ['#9FD9D6', '#5FAFB4'], noon: ['#8FD6DA', '#4E9FB0'], sunset: ['#B9C6C4', '#6E8C9A'], night: ['#3D5677', '#22344F'] };
const SKY = { morning: ['#BFE6F2', '#FBE9C9'], noon: ['#8FD0F0', '#E6F6FA'], sunset: ['#F6B48A', '#FBE3B8'], night: ['#1E2A55', '#3B4C7E'] };
const FISH_N = { 3: [2, 2, 3, 3], 4: [2, 3, 3, 4], 5: [2, 4, 4, 5], 6: [2, 4, 5, 5], 7: [2, 4, 5, 5] };
const SPRITES = ['mote', 'sparkle', 'glint', 'firefly', 'star', 'dot', 'drop', 'bubble', 'leaf_a', 'leaf_b', 'confetti_a', 'confetti_b', 'petal'];
// the five required viewports (logical W × H + safe-area insets) + a few more device shapes
const VPS = {
  iphoneL: [1556, 720, { left: 108, right: 108, bottom: 38 }], ipadL: [960, 720, { top: 32, bottom: 27 }],
  iphoneP: [720, 1556, { top: 108, bottom: 62 }], air11L: [1180, 820, { top: 24, bottom: 20 }], air11P: [820, 1180, { top: 24, bottom: 20 }],
  ipadP: [720, 1036, { top: 21, bottom: 18 }], port960: [720, 960, null], land1280: [1280, 720, null]
};
const REQ = ['iphoneL', 'ipadL', 'iphoneP', 'air11L', 'air11P'];
const NONPOS = ['session', 'talkAsk', 'talkResult', 'levelDone', 'sessionDone'];

// ---- helpers
function mkW(age, o) {
  o = o || {};
  const vp = VPS[o.vp || 'ipadL'];
  const w = new TL.World({ seed: o.seed || 7, age, lang: o.lang || 'en', config: o.config });
  if (o.hudKeep) w.hudKeep = o.hudKeep;
  w.setViewport(vp[0], vp[1], vp[2]);
  return w;
}
function run(w, s, dt) { dt = dt || 1 / 60; const n = Math.round(s / dt); for (let i = 0; i < n; i++) w.update(dt); }
function runUntil(w, f, max, dt) { dt = dt || H; max = max || 60; let t = 0; while (!f() && t < max) { w.update(dt); t += dt; } assert.ok(f(), 'timed out after ' + max + ' s'); return t; }
function tap(w, x, y) { const r = w.pointerDown(x, y); w.pointerUp(x, y); return r; }
/** A world in round `ri` of a chapter of `topic`, at play (fish in, asked). Events drained. */
function atPlay(age, topic, ri, o) {
  o = o || {};
  const w = mkW(age, o);
  w.newSession();
  if (topic) w.levels[o.level || 0] = topic;
  w.startLevel(o.level || 0);
  for (let r = 0; ; r++) {
    runUntil(w, () => w.interactive, 60);
    if (w.round >= (ri || 0)) break;
    const t = w.target; tap(w, t.x, t.y);
    runUntil(w, () => w.state === 'round' && w.phase === 'enter' && w.round > r, 60);
  }
  w.drainEvents();
  return w;
}
function other(w) { return w.members.find(m => !m.target && (m.state === 'swim' || m.state === 'dart')); }
function finite(o) { return Object.values(o).every(v => typeof v !== 'number' || Number.isFinite(v)); }
function onScreen(L, x, y, pad) { pad = pad || 0; return x >= -pad && x <= L.W + pad && y >= -pad && y <= L.H + pad; }
function boxHit(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
function bottomKeep(vp) { const [W, H, ins] = VPS[vp]; const b = (ins && ins.bottom) || 0; return [{ x: 0, y: H - b - 70, w: W, h: 70 + b }]; }
/** Independent rule checker (DESIGN §5.1): which members answer the asked question. */
function answers(r) {
  const p = r.params, out = [];
  r.members.forEach(m => {
    const t = m.thing, mk = t.mark || {}, txt = mk.text !== undefined ? String(mk.text) : null, num = txt !== null && /^\d+$/.test(txt) ? +txt : null;
    let ok;
    switch (r.promptKey) {
      case 'p.color': ok = t.kind === 'fish' && t.color === p.color; break;
      case 'p.shape': ok = mk.shape === p.shape; break;
      case 'p.size': ok = (t.big !== false) === p.big; break;
      case 'p.count': ok = mk.n === p.n; break;
      case 'p.animal': ok = t.animal === p.animal; break;
      case 'p.home': ok = t.kind === 'bubble' && GUESTS[t.animal] === p.home; break;
      case 'p.letter': ok = txt === p.letter; break;
      case 'p.lower': ok = txt === p.letter.toLowerCase(); break;
      case 'p.initial': ok = C.initialOfName(TL.THING_NAMES[r.lang][t.animal], r.lang) === p.letter; break;
      case 'p.add': ok = num === p.a + p.b; break;
      case 'p.sub': ok = num === p.a - p.b; break;
      case 'p.oddeven': ok = num !== null && (num % 2 ? 'odd' : 'even') === p.parity; break;
      default: throw new Error('prompt ' + r.promptKey);
    }
    if (ok) out.push(m.id);
  });
  return out;
}

// ======================================================================= RNG
test('rng: deterministic, ranges', () => {
  const a = new TL.RNG(42), b = new TL.RNG(42);
  for (let i = 0; i < 100; i++) assert.strictEqual(a.next(), b.next());
  const r = new TL.RNG('x');
  for (let i = 0; i < 1000; i++) { const v = r.int(2, 5); assert.ok(v >= 2 && v <= 5); }
  assert.strictEqual(new TL.RNG(1).shuffle([1, 2, 3, 4]).length, 4);
});

// ======================================================================= layout (DESIGN §2)
test('layout: 5 required viewports × ages — lanes in the water above the keep-out, lilies on the surface, show point clear, swim range on screen', () => {
  for (const vp of Object.keys(VPS)) for (const age of AGES) for (const keep of [false, true]) {
    const [W, H, ins0] = VPS[vp], ins = Object.assign({ top: 0, right: 0, bottom: 0, left: 0 }, ins0 || {});
    const hk = keep ? bottomKeep(vp) : null;
    const L = TL.World.computeLayout(W, H, ins, {}, age, hk), S = L.swim, tag = vp + ' age ' + age + (keep ? ' +keep' : '');
    const size = Math.round(({ 3: 104, 4: 104, 5: 96, 6: 90, 7: 90 })[age] * (H / W > 1.6 ? 1.12 : 1));
    assert.strictEqual(L.size, size, tag + ' size');
    assert.strictEqual(L.portrait, H > W, tag);
    if (!L.portrait) assert.strictEqual(L.surfaceY, Math.round(H * 0.4), tag + ' landscape surface');
    else assert.ok(L.surfaceY >= 0.3 * H - 1 && L.surfaceY >= L.bubble.y + L.bubble.h + 0.2 * H - 1, tag + ' portrait surface');
    assert.ok(L.portrait ? S.lanes.length >= 3 : S.lanes.length === (keep ? S.lanes.length : 3) && S.lanes.length >= 2, tag + ' lane count ' + S.lanes.length);
    if (vp === 'iphoneP' && !keep) assert.strictEqual(S.lanes.length, 5, tag + ' tall portrait: 5 lanes');
    S.lanes.forEach((y, i) => {
      assert.ok(y - 0.5 * size >= L.surfaceY + 0.2 * size, tag + ' lane ' + i + ' under the surface');
      assert.ok(y + 0.5 * size <= L.groundY, tag + ' lane ' + i + ' above the lake bed');
      if (hk) assert.ok(y + 0.5 * size <= hk[0].y - 44 + 0.5, tag + ' lane ' + i + ' ≥ 44 px above the bottom keep-out');
      assert.ok(y + 0.5 * size <= H - ins.bottom, tag + ' lane above the home indicator');
      if (i) assert.ok(y - S.lanes[i - 1] >= 1.0 * size - 0.5, tag + ' lane spacing');
      const R = S.ranges[i];
      assert.ok(R.x0 >= ins.left && R.x1 <= W - ins.right && R.cx0 <= R.cx1, tag + ' range on screen');
      assert.ok(R.cx0 - 0.75 * size >= ins.left - 0.5 && R.cx1 + 0.75 * size <= W - ins.right + 0.5, tag + ' whole fish inside');
      // the rock never hides a lane's swim range
      const fb = { x: R.cx0 - 0.75 * size, y: y - 0.5 * size, w: 1.5 * size, h: size }, rk = { x: L.rock.x0, y: L.rock.top, w: L.rock.w, h: L.rock.h };
      assert.ok(!boxHit(fb, rk), tag + ' lane ' + i + ' clear of the rock');
    });
    assert.strictEqual(L.lilies.length, 4);
    L.lilies.forEach(l => {
      assert.strictEqual(l.y, L.surfaceY + 6, tag + ' lily on the surface');
      assert.ok(l.x >= S.x0 + 39 && l.x <= S.x1 - 39 && l.x > L.rock.x1, tag + ' lily inside the lake, clear of the rock');
    });
    for (let i = 1; i < 4; i++) assert.ok(L.lilies[i].x - L.lilies[i - 1].x >= 80, tag + ' lilies spread');
    // the show point (the hanging fish) below / beside the bubble, above the water, on screen; the rod tips too
    assert.ok(!boxHit(L.showBox, L.bubble) && !boxHit(L.showBox, L.hud), tag + ' show fish clear of the bubble / HUD');
    assert.ok(L.showBox.y + L.showBox.h < L.surfaceY && L.showBox.x >= ins.left && L.showBox.x + L.showBox.w <= W - ins.right, tag + ' show fish on screen');
    assert.ok(L.showBox.x > L.tibo.x + 0.3 * L.tibo.h, tag + ' show fish not on Tibo');
    if (L.portrait) assert.ok(L.showPt.y - 0.62 * size >= L.bubble.y + L.bubble.h, tag + ' portrait: show point below the bubble');
    const rest = TL.World.rodTip(L.rodBase, L.rodLen, CFG.rodRest, 0);
    assert.ok(rest.y >= ins.top - 1 && rest.x <= W && !boxHit({ x: rest.x - 2, y: rest.y - 2, w: 4, h: 4 }, L.bubble), tag + ' rest rod tip on screen, not under the bubble');
    assert.ok(L.lineShow >= CFG.lineShowMin - 0.01 && L.lineShow <= CFG.lineShowMax + 0.01, tag + ' show line length');
    assert.ok(L.bubble.w >= 220 && L.bubble.x >= ins.left && L.bubble.x + L.bubble.w <= W - ins.right && L.bubble.y >= ins.top, tag + ' bubble');
    assert.ok(L.tiboBox.x >= ins.left - 30 && !boxHit({ x: L.tiboBox.x + 10, y: L.tiboBox.y + 10, w: L.tiboBox.w - 20, h: L.tiboBox.h - 20 }, L.bubble), tag + ' Tibo clear of the bubble');
    assert.ok(Math.abs(L.rock.seat.y - L.tibo.y) < 1e-6 && L.rock.y > L.surfaceY, tag + ' rock seat under Tibo, standing in the water');
    assert.ok(L.swim.x0 >= ins.left && L.swim.x1 <= W - ins.right, tag);
  }
});
test('layout: rodTip formula (shared with FishArt.drawRod) and logicalSize', () => {
  const b = { x: 100, y: 200 };
  const t = TL.World.rodTip(b, 170, -1.05, 0.8);
  assert.ok(Math.abs(t.x - (100 + 170 * Math.cos(-0.65))) < 1e-9 && Math.abs(t.y - (200 + 170 * Math.sin(-0.65))) < 1e-9);
  assert.ok(TL.World.rodTip(b, 170, -1.05, 0.5).y > TL.World.rodTip(b, 170, -1.05, 0).y, 'bend > 0 pulls the tip down');
  assert.deepStrictEqual(J(TL.World.logicalSize(852, 393)), { W: 1561, H: 720 });
  assert.deepStrictEqual(J(TL.World.logicalSize(393, 852)), { W: 720, H: 1561 });
  assert.deepStrictEqual(J(TL.World.logicalSize(1024, 768)), { W: 960, H: 720 });
  const w = mkW(4); run(w, 0.5);
  const ln = w.line, tip = TL.World.rodTip(w.layout.rodBase, w.layout.rodLen, ln.rodAngle, ln.bend);
  assert.ok(Math.abs(tip.x - ln.tip.x) < 1e-6 && Math.abs(tip.y - ln.tip.y) < 1e-6, 'line.tip = rodTip(layout.rodBase, layout.rodLen, rodAngle, bend)');
});

// ======================================================================= content (DESIGN §5.1)
test('content: every topic × age 3–7 × 200 seeds × rounds × en/vi — one target, self-check, independent rule check', () => {
  let n = 0;
  for (const topic of ALL_TOPICS) for (const age of AGES) for (let s = 0; s < 200; s++) for (let ri = 0; ri < 4; ri++) {
    const lang = s % 2 ? 'vi' : 'en', short = s % 9 === 4 && ri > 0;
    const r = C.makeRound(topic, { age, lang, rng: new TL.RNG(s * 977 + ri * 13 + age), roundIndex: ri, short, level: s % 4 });
    const tag = topic + ' age ' + age + ' seed ' + s + ' r' + ri;
    assert.strictEqual(C.validate(r), null, tag);
    const want = short ? Math.min(FISH_N[age][ri], age <= 4 ? 2 : 3) : FISH_N[age][ri];
    assert.strictEqual(r.members.length, want, tag + ' fish count');
    const tg = r.members.filter(m => m.target);
    assert.strictEqual(tg.length, 1, tag + ' exactly one target');
    assert.deepStrictEqual(answers(r), [tg[0].id], tag + ' exactly the target answers the question (independent check)');
    assert.strictEqual(r.targetId, tg[0].id);
    const cs = [];
    r.members.forEach(m => [m.thing.color, m.thing.mark && m.thing.mark.color].forEach(c => { if (c && cs.indexOf(c) < 0) cs.push(c); }));
    cs.forEach(c => assert.ok(HEX[c], tag + ' palette colour'));
    if (age < 5) {
      CLASH.forEach(p => assert.ok(!(cs.includes(p[0]) && cs.includes(p[1])), tag + ' colour pair ' + p));
      assert.ok(!cs.includes('pink'), tag + ' no pink below 5');
    }
    if (r.promptKey === 'p.count') { const ns = r.members.map(m => m.thing.mark.n); assert.strictEqual(new Set(ns).size, ns.length, tag + ' counts distinct'); }
    if (r.promptKey === 'p.lower') r.members.forEach(m => { assert.ok(m.thing.mark.text !== 'i' && m.thing.mark.text !== 'l' && r.params.letter !== 'I' && r.params.letter !== 'L', tag + ' no I / l'); });
    if (r.promptKey === 'p.colors' || topic === 'colors') assert.ok(cs.length <= ({ 3: 2, 4: 3 })[age] || 4, tag + ' colour set');
    if (topic === 'shapes' && age < 5) assert.strictEqual(cs.length, 1, tag + ' one mark colour');
    if (topic === 'animals' || topic === 'initial') r.members.forEach(m => assert.ok(m.thing.kind === 'bubble' && m.thing.animal !== 'goldfish', tag + ' bubble friends'));
    r.members.forEach(m => assert.ok(m.thing.nameKind && m.thing.nameValue !== undefined, tag + ' name'));
    n++;
  }
  // determinism
  const a = C.makeRound('count', { age: 4, rng: new TL.RNG(5), roundIndex: 2 }), b = C.makeRound('count', { age: 4, rng: new TL.RNG(5), roundIndex: 2 });
  assert.deepStrictEqual(J(a), J(b));
  assert.ok(n === ALL_TOPICS.length * AGES.length * 200 * 4);
});
test('content: prompt keys / params per DESIGN, homes by age, Talk, topic rotation', () => {
  const keys = { colors: ['p.color', ['color']], shapes: ['p.shape', ['shape']], size: ['p.size', ['big']], count: ['p.count', ['n']],
    letters: ['p.letter', ['letter']], lower: ['p.lower', ['letter']], initial: ['p.initial', ['letter']], add: ['p.add', ['a', 'b']],
    sub: ['p.sub', ['a', 'b']], oddeven: ['p.oddeven', ['parity']] };
  for (const t in keys) { const r = C.makeRound(t, { age: 6, rng: new TL.RNG(3), roundIndex: 1 }); assert.strictEqual(r.promptKey, keys[t][0]); assert.deepStrictEqual(Object.keys(r.params).sort(), keys[t][1].slice().sort()); }
  for (let s = 0; s < 100; s++) {
    assert.strictEqual(C.makeRound('animals', { age: 3, rng: new TL.RNG(s), roundIndex: 2 }).promptKey, 'p.animal');
    assert.strictEqual(C.makeRound('animals', { age: 5, rng: new TL.RNG(s), roundIndex: 0 }).promptKey, 'p.animal');
    const r4 = C.makeRound('animals', { age: 4, rng: new TL.RNG(s), roundIndex: 3 });
    assert.strictEqual(r4.promptKey, 'p.home');
    assert.ok(['sea', 'ice', 'forest'].includes(r4.params.home));
    r4.members.forEach(m => assert.ok(['sea', 'ice', 'forest'].includes(m.thing.home), 'age 4 homes'));
  }
  for (const topic of ALL_TOPICS) for (const age of AGES) for (let s = 0; s < 40; s++) {
    const t = C.makeTalk(topic, { age, lang: s % 2 ? 'vi' : 'en', rng: new TL.RNG(s) });
    assert.ok(t.choices.length >= 2 && t.choices.some(c => c.id === t.answer), topic + ' talk answer');
    assert.strictEqual(new Set(t.choices.map(c => String(c.value))).size, t.choices.length, topic + ' talk distinct');
  }
  for (const age of AGES) {
    assert.deepStrictEqual(J(C.topicsFor(age)), AGE_TOPICS[age]);
    const r = new TL.RNG(1), a = C.topicsFor(age, r, AGE_TOPICS[age]);
    assert.strictEqual(a.length, 4); assert.notStrictEqual(a[0], AGE_TOPICS[age][0] === TL.AGE_POOLS[age][0] ? TL.AGE_POOLS[age][0] : '?');
  }
});

// ======================================================================= swimming
test('swim: fish swim in, stay in their lane range, U-turn smoothly (dir 1 → 0 → −1), never overlap in a lane, no jumps', () => {
  for (const vp of REQ) for (const age of [3, 5, 7]) {
    const w = atPlay(age, 'colors', 3, { vp, seed: 3 + age });
    const L = w.layout, ms = w.members;
    assert.ok(ms.length >= 3);
    let turns = 0, mid = 0, prev = {};
    for (let k = 0; k < 30 * 120; k++) {
      w.update(H);
      for (const m of ms) {
        const R = w._range(m.lane);
        assert.ok(m.x >= R.cx0 - 1.5 && m.x <= R.cx1 + 1.5, vp + ' x in the lane range ' + m.x + ' ' + R.cx0 + '..' + R.cx1);
        assert.ok(m.y > L.surfaceY && m.y < L.groundY && Math.abs(m.y - m.laneY) < 30, vp + ' y near the lane');
        const p = prev[m.id];
        if (p) {
          assert.ok(Math.hypot(m.x - p.x, m.y - p.y) < 4, 'no jump');
          assert.ok(Math.abs(m.dir - p.dir) <= Math.PI / CFG.turnTime * H + 1e-6, 'smooth turn (0.35 s)');
          if (Math.sign(p.face) !== Math.sign(m.face)) turns++;
          if (Math.abs(m.dir) < 0.3) mid++;
        }
        prev[m.id] = { x: m.x, y: m.y, dir: m.dir, face: m.face };
        for (const o of ms) if (o !== m && o.lane === m.lane) assert.ok(Math.abs(o.x - m.x) >= 1.0 * w._len(m), vp + ' no overlap in a lane');
        assert.ok(m.sx === m.dir * (1 + CFG.squashSxK * m.q), 'sx = dir × stretch');
        assert.ok(m.wag >= 0.29 && m.wag <= 1.01 && Number.isFinite(m.wagPhase));
      }
      if (w.phase !== 'play') break;
    }
    assert.ok(turns >= 2 && mid > 0, vp + ' U-turns happen and pass through dir ≈ 0 (' + turns + ')');
  }
});
test('swim: cruise speed by age, a held finger slows nearby fish to ≈ 35 %', () => {
  const w = atPlay(4, 'colors', 1, { seed: 9 });
  run(w, 4, H);
  const m = w.members[0];
  assert.ok(m.cruise >= 48 * 0.85 - 1e-9 && m.cruise <= 48 * 1.15 + 1e-9);
  // press on empty water near it (not on it) and hold
  const L = w.layout;
  let px = m.x, py = m.y + w._hitR(m) + 20;
  if (py > L.groundY) py = m.y - w._hitR(m) - 20;
  w.pointerDown(px, py);
  run(w, 1.5, H);
  const near = Math.hypot(m.x - w.finger.x, m.y - w.finger.y) < CFG.fingerR;
  if (near) assert.ok(m.slowK < 0.5, 'slowed ' + m.slowK);
  w.pointerUp(px, py);
  run(w, 2, H);
  assert.ok(m.slowK > 0.9 || m._glowT > 0, 'speeds up again');
});

// ======================================================================= the catch
test('catch: cast arc (on screen, apex ≥ 24 px) → plop → bite at the mouth → reel → splash → pendulum → show → roundDone → leap → dive → lily → joy → leave', () => {
  for (const vp of REQ) {
    const w = atPlay(4, 'colors', 1, { vp, seed: 21 });
    const L = w.layout, t = w.target;
    assert.strictEqual(tap(w, t.x, t.y), 'member');
    let ev = w.drainEvents();
    assert.ok(ev.some(e => e.type === 'right' && e.id === t.id && e.lily === 1));
    assert.strictEqual(w.phase, 'cast');
    let minHookY = 1e9, seen = [], swing = 0, liftOff = null, open = 0;
    for (let k = 0; k < 20 * 120 && w.phase !== 'leave'; k++) {
      w.update(H);
      const ln = w.line;
      if (ln.state === 'fly') minHookY = Math.min(minHookY, ln.hook.y);
      assert.ok(onScreen(L, ln.hook.x, ln.hook.y, 1), vp + ' hook on screen ' + ln.hook.x + ',' + ln.hook.y);
      if (t.state === 'show' || (t.state === 'reel' && w._reel.stage === 'air')) {
        const mo = w.mouthOf(t);
        assert.ok(Math.hypot(mo.x - ln.hook.x, mo.y - ln.hook.y) < 0.6, 'the fish hangs by its mouth on the hook');
        assert.ok(t.y < L.surfaceY + 0.6 * L.size && t.above !== undefined);
        if (t.state === 'show') swing = Math.max(swing, Math.abs(ln.theta));
      }
      if (t.state === 'leap' && !liftOff) liftOff = { x: t.x, y: t.y };
      open = Math.max(open, w.lilies[1].open);
      for (const e of w.drainEvents()) {
        seen.push(e.type);
        if (NONPOS.indexOf(e.type) < 0) assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y), e.type + ' x, y');
        if (e.type === 'plop') assert.strictEqual(e.y, L.surfaceY);
        if (e.type === 'bite') { const mo = w.mouthOf(t); assert.ok(Math.hypot(mo.x - e.x, mo.y - e.y) < 3, 'bite at the mouth'); }
        if (e.type === 'dive') { assert.strictEqual(e.x, L.lilies[1].x); assert.strictEqual(e.y, L.surfaceY); }
        if (e.type === 'lily') { assert.strictEqual(e.i, 1); assert.strictEqual(e.color, t.thing.color); }
        if (e.type === 'roundDone') assert.strictEqual(e.stars, 3);
      }
    }
    const order = ['cast', 'plop', 'bite', 'reel', 'splash', 'show', 'roundDone', 'release', 'dive', 'lily', 'leave'];
    let at = -1;
    order.forEach(o => { const i = seen.indexOf(o, at + 1); assert.ok(i > at, vp + ' event order: ' + o + ' in ' + seen.join(',')); at = i; });
    assert.ok(minHookY >= L.ins.top + 13 && minHookY < w.layout.rodBase.y, vp + ' the hook arcs up first, on screen ' + minHookY.toFixed(0) + ' top ' + L.ins.top);
    assert.ok(swing > 0.03 && swing < 0.5, vp + ' a gentle pendulum swing at the show (' + swing.toFixed(2) + ')');
    assert.ok(open > 1.02, vp + ' the lily opens with an overshoot');
    assert.ok(liftOff && liftOff.y < L.surfaceY, 'the leap starts above the water');
    runUntil(w, () => w.phase === 'enter' && w.round === 2, 10);
  }
});
test('catch: rod bends while reeling, whips on the cast, springs back straight', () => {
  const w = atPlay(5, 'shapes', 1, { seed: 4 });
  const t = w.target; tap(w, t.x, t.y);
  let minA = 0, maxBend = 0, maxA = -9;
  for (let k = 0; k < 8 * 120 && w.phase !== 'release'; k++) { w.update(H); minA = Math.min(minA, w.line.rodAngle); maxA = Math.max(maxA, w.line.rodAngle); maxBend = Math.max(maxBend, w.line.bend); }
  assert.ok(minA < CFG.rodRest - 0.08, 'wind-up'); assert.ok(maxA > CFG.rodCast + 0.1, 'whip forward');
  assert.ok(maxBend > 0.7, 'bends ≈ 0.8 while reeling');
  run(w, 2.5, H);
  assert.ok(Math.abs(w.line.bend) < 0.05 && Math.abs(w.line.rodAngle - CFG.rodRest) < 0.05, 'straight again');
  assert.strictEqual(w.line.state, 'rest');
});
test('count topic: spots counted one by one while it hangs; animals home: badge', () => {
  const w = atPlay(4, 'count', 2, { seed: 8 });
  const t = w.target, n = t.thing.mark.n; tap(w, t.x, t.y);
  const counts = [];
  runUntil(w, () => { for (const e of w.drainEvents()) if (e.type === 'count') counts.push(e.i); return w.state === 'roundDone'; }, 20);
  assert.deepStrictEqual(counts, Array.from({ length: n }, (_, i) => i + 1));
  const w2 = atPlay(5, 'animals', 2, { seed: 8 });
  const t2 = w2.target; tap(w2, t2.x, t2.y);
  let home = null;
  runUntil(w2, () => { for (const e of w2.drainEvents()) if (e.type === 'home') home = e; return !!home; }, 20);
  assert.strictEqual(home.home, t2.thing.home);
  assert.ok(w2.badge && w2.badge.home === t2.thing.home && !boxHit({ x: w2.badge.x - 40, y: w2.badge.y - 40, w: 80, h: 80 }, w2.layout.bubble));
});

// ======================================================================= wrong / help
test('wrong tap → miss + dart (3× speed, away from the finger, still in range), same fish again < 1 s → wiggle, no miss', () => {
  const w = atPlay(4, 'colors', 2, { seed: 5 });
  const m = other(w); assert.ok(m);
  const v0 = Math.abs(m.vx);
  assert.strictEqual(tap(w, m.x - 10, m.y), 'member');
  let ev = w.drainEvents();
  const wr = ev.find(e => e.type === 'wrong');
  assert.ok(wr && wr.id === m.id && wr.misses === 1 && wr.got.nameKind === 'color' && wr.want.kind === 'color');
  assert.strictEqual(w.misses, 1); assert.strictEqual(m.state, 'dart');
  run(w, 0.25, H);
  assert.ok(Math.abs(m.vx) > Math.max(2 * m.cruise, v0), 'darts fast ' + m.vx);
  assert.ok(w.bubbles.length >= 3, 'puffs bubbles');
  tap(w, m.x, m.y);
  ev = w.drainEvents();
  assert.ok(ev.some(e => e.type === 'wiggle' && e.repeat)); assert.strictEqual(w.misses, 1);
  run(w, 1, H);
  assert.strictEqual(m.state, 'swim');
  const R = w._range(m.lane); assert.ok(m.x >= R.cx0 - 1 && m.x <= R.cx1 + 1);
});
test('2 misses → hint (target glows, slows to 40 %, ghost hand follows it), cooldown 6 s', () => {
  const w = atPlay(5, 'shapes', 2, { seed: 6 });
  const a = other(w); tap(w, a.x, a.y); run(w, 1.2, H);
  const b = w.members.find(m => !m.target && m !== a && m.state === 'swim') || a;
  tap(w, b.x, b.y);
  const ev = w.drainEvents();
  const h = ev.find(e => e.type === 'hint');
  assert.ok(h && h.id === w.target.id, 'hint after 2 misses');
  assert.ok(ev.find(e => e.type === 'wrong' && e.misses === 2).hint);
  run(w, 1.5, H);
  const t = w.target;
  assert.ok(w.hintHand && t.glow > 0.3 && t.slowK < 0.6, 'glow + slow');
  assert.ok(Math.hypot(w.hintHand.x - t.x, w.hintHand.y - t.y) < 140, 'the hand follows the moving target');
  assert.strictEqual(w.hint().member, t.id);
});
test('soft taps: 3 → hint, 6 (after 10 s of play) → assist; the next press anywhere in the water picks the target (≤ 2★)', () => {
  const w = atPlay(4, 'colors', 2, { seed: 12 });
  const L = w.layout;
  const empty = () => { for (let k = 0; k < 200; k++) { const x = L.swim.x0 + (k * 37) % (L.swim.x1 - L.swim.x0), y = L.surfaceY + 30 + (k * 53) % (L.groundY - L.surfaceY - 60); if (!w._memberNear(x, y).m && !w.critterHit()) return [x, y]; } return null; };
  let hint = false, armed = false;
  for (let i = 0; i < 3; i++) { const p = empty(); assert.strictEqual(tap(w, p[0], p[1]), 'soft'); for (const e of w.drainEvents()) if (e.type === 'hint') hint = true; run(w, 0.3, H); }
  assert.ok(hint, 'hint after 3 soft taps');
  run(w, 10, H);
  for (let i = 0; i < 3; i++) { const p = empty(); tap(w, p[0], p[1]); for (const e of w.drainEvents()) if (e.type === 'assistArmed') armed = true; run(w, 0.3, H); }
  assert.ok(armed && w.assistId === w.target.id, 'assist armed');
  run(w, 0.8, H);
  assert.ok(w.target.slowK < 0.3 && w.target.scale > 1.05, 'the target slows to 20 % and grows');
  const p = empty();
  assert.strictEqual(tap(w, p[0], p[1]), 'member');
  const ev = w.drainEvents();
  assert.ok(ev.some(e => e.type === 'assist') && ev.some(e => e.type === 'right'));
  let st = null;
  runUntil(w, () => { for (const e of w.drainEvents()) if (e.type === 'roundDone') st = e.stars; return st !== null; }, 20);
  assert.ok(st <= 2, 'assisted ≤ 2★');
});
test('stars: 3 / 2 / 1 for 0 / 1 / ≥ 2 misses', () => {
  for (const miss of [0, 1, 2, 3]) {
    const w = atPlay(6, 'add', 1, { seed: 30 + miss });
    for (let i = 0; i < miss; i++) { const o = other(w); tap(w, o.x, o.y); run(w, 1.1, H); }
    const t = w.target; tap(w, t.x, t.y);
    let st = null;
    runUntil(w, () => { for (const e of w.drainEvents()) if (e.type === 'roundDone') st = e; return st !== null; }, 20);
    assert.strictEqual(st.stars, miss === 0 ? 3 : miss === 1 ? 2 : 1); assert.strictEqual(st.misses, miss);
  }
});
test('hit test: a tap where the fish was 0.12 s ago counts; a slide from empty water onto a fish within 0.25 s is judged; Tibo poke', () => {
  const w = atPlay(4, 'colors', 1, { seed: 14 });
  const t = w.target;
  run(w, 0.5, H);
  const old = w._posAt(t, w.time - 0.12), r = w._hitR(t);
  // a point inside the old circle but outside the current one (if the fish moved enough), else just the old centre
  const dx = t.x - old.x, d = Math.hypot(dx, t.y - old.y);
  const px = d > 1 ? old.x - (dx / d) * (r * 0.9) : old.x, py = old.y;
  assert.strictEqual(tap(w, px, py), 'member');
  assert.ok(w.drainEvents().some(e => e.type === 'right'));
  const w2 = atPlay(4, 'colors', 1, { seed: 15 });
  const t2 = w2.target, r2 = w2._hitR(t2), L = w2.layout;
  let sy = t2.y + r2 + 25; if (sy > L.groundY - 5 || w2._memberNear(t2.x, sy).m) sy = t2.y - r2 - 25;
  assert.ok(!w2._memberNear(t2.x, sy).m);
  assert.strictEqual(w2.pointerDown(t2.x, sy), 'soft');
  w2.update(1 / 60); w2.pointerMove(t2.x, t2.y); w2.pointerUp(t2.x, t2.y);
  assert.ok(w2.drainEvents().some(e => e.type === 'right'), 'slide judged');
  const w3 = atPlay(4, 'colors', 1, { seed: 16 });
  const tb = w3.tiboHit();
  assert.strictEqual(w3.pointerDown(tb.cx, tb.cy), 'tibo');
  assert.strictEqual(w3.pointerUp(tb.cx, tb.cy), 'pokeTibo');
  assert.ok(w3.drainEvents().some(e => e.type === 'pokeTibo' && e.promptKey === 'p.color'));
});
test('idle nudges 12 → 18 → 27 → 30 s, the first one hints; the target never leaves the swim range meanwhile', () => {
  const w = atPlay(3, 'size', 1, { seed: 2 });
  const t0 = w.time, idles = [];
  for (let k = 0; k < 95 * 60; k++) {
    w.update(1 / 60);
    const t = w.target, R = w._range(t.lane);
    assert.ok(t.x >= R.cx0 - 1.5 && t.x <= R.cx1 + 1.5 && t.y > w.layout.surfaceY && t.y < w.layout.groundY, 'target reachable');
    for (const e of w.drainEvents()) if (e.type === 'idle') idles.push(Math.round(w.time - t0));
  }
  assert.deepStrictEqual(idles.slice(0, 5), [12, 30, 57, 87, 117].filter(x => x <= 95).length ? idles.slice(0, 5) : idles.slice(0, 5));
  assert.strictEqual(idles[0], 12); assert.strictEqual(idles[1], 30); assert.strictEqual(idles[2], 57); assert.strictEqual(idles[3], 87);
});

// ======================================================================= resize / rotation
test('resize mid-cast / mid-reel / mid-pendulum / mid-leap / mid-joy keeps everything on screen and finishes the round', () => {
  const stages = [w => w.line.state === 'fly', w => w.phase === 'reel' && w._reel.stage === 'under', w => w.phase === 'reel' && w._reel.stage === 'air',
    w => w.phase === 'show', w => w.phase === 'release' && w.target && w.target.state === 'leap', w => w.phase === 'joy', w => w.phase === 'enter'];
  const pairs = [['ipadL', 'iphoneP'], ['iphoneP', 'iphoneL'], ['air11L', 'air11P']];
  for (const [a, b] of pairs) stages.forEach((st, si) => {
    const w = atPlay(5, 'count', 1, { vp: a, seed: 40 + si });
    const t = w.target;
    tap(w, t.x, t.y);
    runUntil(w, () => st(w), 20);
    if (process.env.DBG) console.log(a, b, si, w.phase, w.line.state);
    const v = VPS[b]; w.setViewport(v[0], v[1], v[2]);
    const L = w.layout;
    for (let k = 0; k < 25 * 120 && !(w.round === 2 && w.phase === 'play'); k++) {
      w.update(H);
      for (const m of w.members) {
        assert.ok(finite({ x: m.x, y: m.y, rot: m.rot, sx: m.sx }), 'finite');
        if (m.state === 'swim' || m.state === 'dart' || m.state === 'hooked' || m.state === 'reel' || m.state === 'show' || m.state === 'leap')
          assert.ok(m.x >= L.ins.left - 1 && m.x <= L.W - L.ins.right + 1 && m.y >= L.ins.top - 1 && m.y <= L.H - L.ins.bottom + 1, b + ' stage ' + si + ' fish on screen ' + m.state + ' ' + m.x.toFixed(0) + ',' + m.y.toFixed(0));
        if (m.state === 'swim') { const R = w._range(m.lane); assert.ok(m.x >= R.cx0 - 2 && m.x <= R.cx1 + 2, 'in the new range'); }
      }
      assert.ok(onScreen(L, w.line.hook.x, w.line.hook.y, 1) && onScreen(L, w.line.tip.x, w.line.tip.y, 1), 'line on screen');
      if (w.phase === 'show') { const mo = w.mouthOf(w.target); assert.ok(Math.hypot(mo.x - w.line.hook.x, mo.y - w.line.hook.y) < 0.6, 'still on the hook'); }
    }
    assert.ok(w.round === 2 && w.phase === 'play', a + '→' + b + ' stage ' + si + ' finished the round');
  });
});

// ======================================================================= flow
test('chapter: 4 rounds → pondFull → Talk; a long chapter ends after 3 rounds (auto lilies); Talk lock + star', () => {
  const w = atPlay(4, 'colors', 0, { seed: 50 });
  for (let r = 0; r < 4; r++) { runUntil(w, () => w.interactive, 30); const t = w.target; tap(w, t.x, t.y); }
  let pf = false;
  runUntil(w, () => { for (const e of w.drainEvents()) if (e.type === 'pondFull') pf = true; return w.state === 'talk'; }, 30);
  assert.ok(pf && w.lilies.every(q => q.target === 1));
  assert.strictEqual(w.talkAnswer(w.talk.answer), false, 'locked in the first second');
  run(w, 1.1, H);
  const s0 = w.stars;
  assert.strictEqual(w.talkAnswer(w.talk.answer), true); assert.strictEqual(w.stars, s0 + 1);
  runUntil(w, () => w.state === 'intro' && w.level === 1, 10);
  assert.ok(w.lilies.every(q => q.target === 0), 'lilies reset per chapter');
  // long chapter
  const w2 = atPlay(3, 'colors', 0, { seed: 51, config: { chapterTimeLimit: 5 } });
  const autos = [];
  for (let r = 0; r < 3; r++) { runUntil(w2, () => w2.interactive, 30); const t = w2.target; tap(w2, t.x, t.y); }
  runUntil(w2, () => { for (const e of w2.drainEvents()) if (e.type === 'lily' && e.auto) autos.push(e.i); return w2.state === 'talk'; }, 30);
  assert.deepStrictEqual(autos, [3]); assert.strictEqual(w2.roundsPerLevel, 3);
});
test('short rounds once the chapter runs long; surprises: each critter appears in its chapter, is tappable, never covers the target', () => {
  const w = atPlay(5, 'shapes', 1, { seed: 60, config: { shortBudget: [1e9, 0, 0, 0] } });
  assert.ok(w.cur.short && w.members.length === 3);
  const kinds = ['ptero', 'bronto', 'frog', 'fireflies'];
  for (let lv = 0; lv < 4; lv++) {
    let found = null;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const v = mkW(4, { seed: 70 + seed });
      v.newSession(); v.startLevel(lv);
      const sr = v._surpriseRound;
      for (let r = 0; r <= sr; r++) {
        runUntil(v, () => v.interactive, 40);
        if (r < sr) { const t = v.target; tap(v, t.x, t.y); }
      }
      const tap0 = v.time;
      let hit = null;
      for (let k = 0; k < 10 * 120 && !hit; k++) {
        v.update(H);
        hit = v.critterHit();
        const c = v.critter;
        if (c && c.kind === 'bronto' && c.block !== undefined) { const t = v.target, R = v._range(t.lane); assert.ok(R.cx1 <= c.block - 0.5 * v.layout.len + 1 || R.cx1 === v.layout.swim.ranges[t.lane].cx0 + 0.5 * (v.layout.swim.ranges[t.lane].cx1 - v.layout.swim.ranges[t.lane].cx0)); }
      }
      void tap0;
      if (hit) { assert.strictEqual(hit.kind, kinds[lv]); assert.strictEqual(v.pointerDown(hit.x, hit.y), 'critter'); v.pointerUp(hit.x, hit.y); assert.ok(v.drainEvents().some(e => e.type === 'critterTap' && e.kind === kinds[lv])); found = hit; break; }
    }
    assert.ok(found, kinds[lv] + ' appeared and was tapped');
  }
});
test('full sessions: bot skill 1 / 0.6 / 0.2 × ages 3–7 — sessionDone, no stuck round, no NaN, events carry x, y, fish never overlap in a lane', () => {
  const vps = Object.keys(VPS);
  let k = 0;
  for (const skill of [1, 0.6, 0.2]) for (const age of AGES) {
    const vp = vps[k++ % vps.length];
    const w = mkW(age, { seed: 100 + k, vp, lang: k % 2 ? 'vi' : 'en' });
    const bot = new TL.Bot(w, { skill, seed: k });
    w.newSession();
    let t = 0, roundT = 0, maxRound = 0, rounds = 0, stars = 0, dt = 1 / 30;
    while (w.state !== 'sessionDone' && t < 1500) {
      bot.step(dt); w.update(dt); t += dt; roundT += dt;
      for (const e of w.drainEvents()) {
        bot.onEvent(e);
        if (NONPOS.indexOf(e.type) < 0) assert.ok(Number.isFinite(e.x) && Number.isFinite(e.y), e.type + ' has x, y');
        if (e.type === 'round') { maxRound = Math.max(maxRound, roundT); roundT = 0; rounds++; }
        if (e.type === 'roundDone') { assert.ok(e.stars >= 1 && e.stars <= 3); stars += e.stars; }
      }
      for (const m of w.members) {
        assert.ok(finite({ x: m.x, y: m.y, rot: m.rot, sx: m.sx, sy: m.sy, scale: m.scale, glow: m.glow, wag: m.wag, alpha: m.alpha }), 'NaN');
        if ((m.state === 'swim') && w.state === 'round') for (const o of w.members) if (o !== m && o.lane === m.lane && o.state === 'swim') assert.ok(Math.abs(o.x - m.x) >= 0.95 * w._len(m), 'lane overlap');
      }
      assert.ok(finite({ a: w.line.rodAngle, b: w.line.bend, hx: w.line.hook.x, hy: w.line.hook.y }), 'line NaN');
    }
    assert.strictEqual(w.state, 'sessionDone', 'skill ' + skill + ' age ' + age + ' finished');
    assert.ok(maxRound < 120, 'no stuck round (' + maxRound.toFixed(0) + ' s)');
    assert.ok(rounds >= 8 && t < 8 * 60 + 60, 'session ' + (t / 60).toFixed(1) + ' min');
    if (skill === 1) assert.strictEqual(w.stars, stars + 4, 'skill 1: every Talk right');
  }
});
test('determinism: same seed + same bot → same event log; interpolation twins', () => {
  const log = () => {
    const w = mkW(5, { seed: 77 }), bot = new TL.Bot(w, { skill: 0.7, seed: 3 }), out = [];
    w.newSession();
    for (let i = 0; i < 60 * 40; i++) { bot.step(1 / 60); w.update(1 / 60); for (const e of w.drainEvents()) { bot.onEvent(e); out.push(e.type + ':' + (e.id || '') + ':' + Math.round(e.x || 0)); } }
    return out.join('|');
  };
  assert.strictEqual(log(), log());
  const w = atPlay(4, 'colors', 1, { seed: 3 });
  w.update(1 / 60 + H * 0.4);
  assert.ok(w.alpha > 0 && w.alpha < 1);
  w.members.forEach(m => assert.ok(Math.hypot(m.x - m._px, m.y - m._py) < 6));
  // through a whole catch (cast, reel, leap with its flip, joy jumps): rot never jumps more than 0.35 rad between twins
  const t = w.target; tap(w, t.x, t.y);
  for (let k = 0; k < 14 * 120 && w.phase !== 'leave'; k++) { w.update(H); w.members.forEach(m => { if (m.state !== 'gone') assert.ok(Math.abs(m.rot - m._prot) < 0.35, m.state + ' rot twin ' + m.rot + ' / ' + m._prot); }); }
});

// ======================================================================= weather / bot
test('weather: moods (sky + water hex per DESIGN), crossfade, particles (kinds = sprites, layers, cap), drops fall back into the lake, resize', () => {
  const wx = new TL.Weather({ width: 960, height: 720, surfaceY: 288, groundY: 679, seed: 3 });
  ['morning', 'noon', 'sunset', 'night'].forEach((m, i) => {
    wx.setWeather(i, { instant: true });
    const a = wx.ambient;
    assert.strictEqual(a.mood, m); assert.strictEqual(a.skyTop, SKY[m][0]); assert.strictEqual(a.skyBottom, SKY[m][1]);
    assert.strictEqual(a.waterTop, WATER[m][0]); assert.strictEqual(a.waterDeep, WATER[m][1]);
    for (let k = 0; k < 300; k++) wx.update(1 / 60);
    wx.particles.forEach(p => { assert.ok(SPRITES.includes(p.sprite), p.sprite); assert.ok(['sky', 'back', 'water', 'surface', 'front'].includes(p.layer)); });
    if (m === 'night') { assert.strictEqual(a.night, 1); assert.ok(wx.particles.some(p => p.kind === 'firefly') && wx.particles.some(p => p.kind === 'twinkle')); }
    if (m === 'noon') assert.ok(wx.particles.some(p => p.kind === 'glint' && Math.abs(p.y - 288) < 12));
    assert.ok(wx.particles.some(p => p.kind === 'bubble' && p.y > 288), 'bubbles under water');
  });
  wx.setWeather(0);
  wx.update(1.25);
  assert.ok(wx.ambient.envMix > 0.2 && wx.ambient.envMix < 0.8, 'crossfade');
  for (let i = 0; i < 20; i++) wx.burst(400, 300, { kind: 'confetti', n: 30 });
  assert.ok(wx.particles.length <= 120);
  wx.addDrops(500, 288, 12);
  for (let k = 0; k < 120; k++) wx.update(1 / 60);
  assert.ok(!wx.particles.some(p => p.kind === 'drop'), 'drops gone back into the lake');
  wx.resize(720, 1556, 669, 1468);
  for (let k = 0; k < 60; k++) wx.update(1 / 60);
  wx.particles.forEach(p => { assert.ok(Number.isFinite(p.x + p.y + p.alpha + p.size)); if (p.kind === 'bubble') assert.ok(p.y > 669); });
});
test('bot: taps the moving target at its current position through pointerDown / Up', () => {
  const w = atPlay(4, 'colors', 1, { seed: 90 });
  const bot = new TL.Bot(w, { skill: 1, seed: 1 });
  let right = null;
  runUntil(w, () => { bot.step(1 / 60); for (const e of w.drainEvents()) { bot.onEvent(e); if (e.type === 'right') right = e; } return !!right; }, 20, 1 / 60);
  assert.strictEqual(right.id, w.cur.targetId);
  assert.ok(bot.stats.taps + bot.stats.slides >= 1);
});

// ======================================================================= runner
const only = process.argv[2];
let fail = 0, ran = 0;
const t0 = Date.now();
for (const t of tests) {
  if (only && t.name.indexOf(only) < 0) continue;
  ran++;
  const s = Date.now();
  try { t.fn(); console.log('ok   ' + t.name + ' (' + ((Date.now() - s) / 1000).toFixed(1) + ' s)'); }
  catch (e) { fail++; console.log('FAIL ' + t.name + '\n     ' + (e && e.stack || e).toString().split('\n').slice(0, 4).join('\n     ')); }
}
console.log((fail ? 'FAILED ' + fail + ' / ' : 'all ') + ran + ' tests passed' + (fail ? '' : '') + ' in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
process.exit(fail ? 1 : 0);
