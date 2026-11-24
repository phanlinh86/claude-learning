#!/usr/bin/env node
// Lolo's Jungle Leaf Match — unit tests for game/js/lolo_art.js (LL.LoloArt) and artist A's SVG files (no deps).
// Run from projects/education-game/monkey-jungle-leaves:   node tests/unit/lolo_art.test.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const JS = path.join(ROOT, 'game', 'js', 'lolo_art.js');
const ASSETS = path.join(ROOT, 'game', 'assets', 'default');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// node-safe at load: a sandbox with no document / no DOM at all
function loadArt(withWindow) {
  const sb = { console, Math, Float64Array };
  if (withWindow) sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(JS, 'utf8'), sb, { filename: 'lolo_art.js' });
  return withWindow ? sb.LL : vm.runInContext('globalThis.LL', sb);
}

// stub 2D context: records calls, checks every numeric argument is finite, tracks save/restore balance
function stubCtx() {
  const calls = [];
  let depth = 0;
  const num = (name, args) => {
    for (const a of args) if (typeof a === 'number') assert.ok(Number.isFinite(a), `${name} got non-finite ${a}`);
    calls.push(name);
  };
  const pts = [];
  const ctx = {
    globalAlpha: 1, lineCap: 'butt', lineJoin: 'miter', lineWidth: 1, strokeStyle: '#000', fillStyle: '#000',
    save() { depth++; calls.push('save'); }, restore() { depth--; assert.ok(depth >= 0, 'restore without save'); calls.push('restore'); },
    beginPath() { calls.push('beginPath'); }, closePath() { calls.push('closePath'); },
    moveTo(...a) { num('moveTo', a); pts.push(a); }, lineTo(...a) { num('lineTo', a); pts.push(a); },
    quadraticCurveTo(...a) { num('quadraticCurveTo', a); }, bezierCurveTo(...a) { num('bezierCurveTo', a); },
    arc(...a) { num('arc', a); pts.push(a); }, ellipse(...a) { num('ellipse', a); },
    fill() { calls.push('fill'); }, stroke() { calls.push('stroke'); }, clip() { calls.push('clip'); },
    setLineDash(a) { assert.ok(Array.isArray(a)); calls.push('setLineDash'); },
    translate(...a) { num('translate', a); }, rotate(...a) { num('rotate', a); }, scale(...a) { num('scale', a); }
  };
  return { ctx, calls, pts, depth: () => depth };
}

const LL = loadArt(true);
const A = LL && LL.LoloArt;

test('loads without window/document (node-safe) and with window', () => {
  const L2 = loadArt(false);
  assert.ok(L2 && L2.LoloArt && typeof L2.LoloArt.drawArm === 'function');
  assert.ok(!/\bdocument\./.test(fs.readFileSync(JS, 'utf8')), 'no document access');
});

test('LL.LoloArt API exists', () => {
  assert.ok(A, 'LL.LoloArt missing');
  for (const f of ['drawArm', 'drawTail', 'headTilt', 'armLen']) assert.strictEqual(typeof A[f], 'function', f);
});

test('ANCHORS match DESIGN §4.1 / §6.3', () => {
  const N = A.ANCHORS;
  assert.deepStrictEqual([N.body.w, N.body.h], [256, 256]);
  assert.deepStrictEqual(Array.from(N.body.feet), [128, 244]);
  assert.deepStrictEqual(Array.from(N.body.socket), [128, 118]);
  assert.deepStrictEqual(Array.from(N.body.shoulder), [152, 136]);
  assert.deepStrictEqual(Array.from(N.body.tail), [84, 220]);
  assert.deepStrictEqual([N.hang.w, N.hang.h], [256, 256]);
  assert.deepStrictEqual(Array.from(N.hang.hand), [128, 18]);
  assert.deepStrictEqual(Array.from(N.hang.socket), [128, 118]);
  assert.deepStrictEqual(Array.from(N.hang.tail), [84, 200]);
  assert.deepStrictEqual([N.head.w, N.head.h], [192, 192]);
  assert.deepStrictEqual(Array.from(N.head.joint), [96, 172]);
  assert.ok(N.headScale > 0.3 && N.headScale < 0.8 && N.head.box === N.headScale);
});

test('armLen: rest < reach, scales with h', () => {
  assert.ok(A.armLen(150, 0) < A.armLen(150, 1));
  assert.ok(Math.abs(A.armLen(300, 0.5) / A.armLen(150, 0.5) - 2) < 1e-9);
  assert.ok(Number.isFinite(A.armLen(150, NaN)));
});

test('drawArm runs on a mock ctx for many angles / lengths / options, balanced, finite', () => {
  for (let ang = -Math.PI; ang <= Math.PI + 1e-9; ang += 0.25) for (const len of [0, 5, 44, 70, 140])
    for (const opt of [undefined, {}, { point: true }, { point: true, scale: 2, alpha: 0.5 }, { bend: 9 }]) {
      const s = stubCtx();
      A.drawArm(s.ctx, 200, 300, ang, len, opt);
      assert.strictEqual(s.depth(), 0, 'save/restore unbalanced');
      assert.ok(s.calls.filter(c => c === 'fill').length >= 3, 'arm + cap + hand fills');
      assert.ok(s.calls.filter(c => c === 'stroke').length >= 4, 'shade + 2 outlines + hand');
    }
});

test('drawArm: hand lands len px from the shoulder; up-left angles are clamped away from the face', () => {
  const handAt = (ang, len) => {   // the hand circle = the arc call with the hand radius (the last arc whose r ≈ 10.5·u)
    const s = stubCtx();
    A.drawArm(s.ctx, 0, 0, ang, len, { scale: 1 });
    const r = 10.5 * 150 / 256;
    const arcs = s.pts.filter(p => p.length >= 5 && Math.abs(p[2] - r) < 1e-6);
    return arcs[arcs.length - 1];
  };
  const h = handAt(-0.6, 60);
  assert.ok(Math.abs(Math.hypot(h[0], h[1]) - 60) < 1e-6 && Math.abs(Math.atan2(h[1], h[0]) + 0.6) < 1e-6);
  const ul = handAt(-2.4, 60);
  assert.ok(Math.atan2(ul[1], ul[0]) >= -1.75 - 1e-9, 'up-left clamped to ≥ −1.75');
});

test('drawArm ignores bad input', () => {
  const s = stubCtx();
  A.drawArm(s.ctx, NaN, 0, 0, 50, {});
  A.drawArm(s.ctx, 0, 0, Infinity, 50, {});
  A.drawArm(s.ctx, 0, 0, 0, 50, { scale: 0 });
  A.drawArm(null, 0, 0, 0, 50, {});
  assert.strictEqual(s.calls.length, 0);
});

test('drawTail runs for sit / hang, both sides, many phases; side −1 goes left, +1 mirrors', () => {
  for (const hang of [false, true]) for (const side of [-1, 1, undefined]) for (let ph = -7; ph <= 7; ph += 1.3) {
    const s = stubCtx();
    A.drawTail(s.ctx, 0, 0, 150, ph, { side, hang, alpha: 0.8 });
    assert.strictEqual(s.depth(), 0);
    assert.ok(s.calls.filter(c => c === 'fill').length >= 2 && s.calls.includes('stroke'));
  }
  const minX = side => { const s = stubCtx(); A.drawTail(s.ctx, 0, 0, 150, 0, { side }); return Math.min(...s.pts.map(p => p[0])); };
  const maxX = side => { const s = stubCtx(); A.drawTail(s.ctx, 0, 0, 150, 0, { side }); return Math.max(...s.pts.map(p => p[0])); };
  assert.ok(minX(-1) < -40, 'default tail reaches out to the left (behind)');
  assert.ok(Math.abs(maxX(1) + minX(-1)) < 1e-6, 'side +1 is the mirror image');
  const s = stubCtx();
  A.drawTail(s.ctx, 0, 0, 0, 0, {}); A.drawTail(s.ctx, NaN, 0, 150, 0, {});
  assert.strictEqual(s.calls.length, 0, 'degenerate input draws nothing');
});

test('headTilt: bounded, up = negative, down = positive, finite on junk', () => {
  assert.ok(A.headTilt(0, 300, -200, 0, 0) < 0, 'looking up-right tilts the face up');
  assert.ok(A.headTilt(0, 300, 200, 0, 0) > 0, 'looking down-right tilts down');
  assert.strictEqual(A.headTilt(0, 0, 0, 0, 0), 0);
  for (let a = -Math.PI; a <= Math.PI; a += 0.1) for (const lean of [-0.3, 0, 0.3]) {
    const v = A.headTilt(lean, Math.cos(a) * 200, Math.sin(a) * 200, 0, 0);
    assert.ok(Math.abs(v) <= 0.3 + 1e-12 && Number.isFinite(v));
  }
  assert.ok(Number.isFinite(A.headTilt(undefined, undefined, NaN, 0, 0)));
});

// ---------------------------------------------------------------- SVG files
const HEADS = ['idle', 'blink', 'talk', 'happy', 'cheer', 'think', 'oops'];
const SVGS = [
  ...['sit', 'hop', 'hang'].map(n => [`characters/lolo_body_${n}.svg`, 256, 256]),
  ...HEADS.map(n => [`characters/lolo_head_${n}.svg`, 192, 192]),
  ['characters/lolo_title.svg', 320, 480],
  ['characters/toucan.svg', 128, 128], ['characters/toucan_flap.svg', 128, 128],
  ['characters/frog.svg', 128, 128], ['characters/frog_jump.svg', 128, 128],
  ['ui/star.svg', 64, 64], ['ui/star_empty.svg', 64, 64],
  ['icon.svg', 512, 512]
];

test('artist A SVGs exist with the right viewBox and width/height', () => {
  for (const [rel, w, h] of SVGS) {
    const p = path.join(ASSETS, rel);
    assert.ok(fs.existsSync(p), rel + ' missing');
    const src = fs.readFileSync(p, 'utf8');
    const root = src.match(/<svg\b[^>]*>/);
    assert.ok(root, rel + ': no <svg>');
    assert.ok(root[0].includes(`viewBox="0 0 ${w} ${h}"`), rel + ': viewBox');
    assert.ok(root[0].includes(`width="${w}"`) && root[0].includes(`height="${h}"`), rel + ': width/height');
  }
});

test('no giraffe leftovers (pigeon / walk frames)', () => {
  for (const rel of ['characters/pigeon.svg', 'characters/pigeon_flap.svg', 'characters/lolo_body_stand.svg',
    'characters/lolo_body_walk_a.svg', 'characters/lolo_body_walk_b.svg']) assert.ok(!fs.existsSync(path.join(ASSETS, rel)), rel);
});

test('SVGs are self-contained and safe (no text, fonts, scripts, external refs)', () => {
  for (const [rel] of SVGS) {
    const src = fs.readFileSync(path.join(ASSETS, rel), 'utf8');
    assert.ok(!/<text\b/i.test(src), rel + ': <text>');
    assert.ok(!/<script\b/i.test(src) && !/\son\w+\s*=/i.test(src), rel + ': script / event handler');
    assert.ok(!/<(image|use|foreignObject|style)\b/i.test(src), rel + ': image/use/foreignObject/style');
    assert.ok(!/(xlink:)?href\s*=/i.test(src), rel + ': href');
    assert.ok(!/url\(\s*['"]?(?!#)/i.test(src), rel + ': external url()');
    assert.ok(!/font-family|@import/i.test(src), rel + ': fonts');
    assert.ok((src.match(/feGaussianBlur/g) || []).length <= 1, rel + ': too many blurs');
    for (const m of src.matchAll(/url\(#([^)]+)\)/g)) assert.ok(src.includes(`id="${m[1]}"`), rel + ': missing #' + m[1]);
    const open = (src.match(/<(?!\/|\?|!)[a-zA-Z][^>]*[^/]>/g) || []).length;
    const close = (src.match(/<\/[a-zA-Z]+>/g) || []).length;
    assert.strictEqual(open, close, rel + ': unbalanced tags');
  }
});

test('ids are unique across the sprites that are drawn together', () => {
  const ids = new Map();
  for (const [rel] of SVGS.filter(([r]) => r.includes('lolo_'))) {
    for (const m of fs.readFileSync(path.join(ASSETS, rel), 'utf8').matchAll(/id="([^"]+)"/g)) {
      assert.ok(!ids.has(m[1]) || ids.get(m[1]) === rel, `id ${m[1]} in ${rel} and ${ids.get(m[1])}`);
      ids.set(m[1], rel);
    }
  }
});

test('Lolo uses the DESIGN §3 palette (fur, outline, peach, eyes, cheeks, leaf bow)', () => {
  const body = fs.readFileSync(path.join(ASSETS, 'characters/lolo_body_sit.svg'), 'utf8');
  const head = fs.readFileSync(path.join(ASSETS, 'characters/lolo_head_idle.svg'), 'utf8');
  for (const c of ['#9A6A45', '#7E5534', '#5A3A22', '#F6D2A8', '#E8B988']) assert.ok(body.includes(c), 'body ' + c);
  for (const c of ['#9A6A45', '#5A3A22', '#F6D2A8', '#2F2622', '#F5AFB4', '#5FC7C9', '#2F8D90']) assert.ok(head.includes(c), 'head ' + c);
  const C = A.COLORS;
  assert.strictEqual(C.fur, '#9A6A45'); assert.strictEqual(C.line, '#5A3A22'); assert.strictEqual(C.peach, '#F6D2A8');
  const frog = fs.readFileSync(path.join(ASSETS, 'characters/frog.svg'), 'utf8');
  assert.ok(frog.includes('#7CCB5A'), 'frog green');
});

test('body frames share an identical torso; heads share an identical skull', () => {
  const grab = (rel, re) => { const m = fs.readFileSync(path.join(ASSETS, rel), 'utf8').match(re); assert.ok(m, rel); return m[1]; };
  const torso = n => grab(`characters/lolo_body_${n}.svg`, /<clipPath id="[^"]+t"><path d="([^"]+)"/);
  for (const n of ['hop', 'hang']) assert.strictEqual(torso(n), torso('sit'), n);
  const skull = n => grab(`characters/lolo_head_${n}.svg`, /<clipPath id="[^"]+s"><path d="([^"]+)"/);
  for (const n of HEADS) assert.strictEqual(skull(n), skull('idle'), n);
});

let fail = 0;
for (const t of tests) {
  try { t.fn(); console.log('ok   ', t.name); } catch (e) { fail++; console.log('FAIL ', t.name, '\n     ', e.message); }
}
console.log(`\n${tests.length - fail}/${tests.length} passed`);
process.exit(fail ? 1 : 0);
