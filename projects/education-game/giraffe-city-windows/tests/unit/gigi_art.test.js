#!/usr/bin/env node
// Gigi's Peekaboo Windows — unit tests for game/js/gigi_art.js (GW.GigiArt) and artist A's SVG files (no deps).
// Run from projects/education-game/giraffe-city-windows:   node tests/unit/gigi_art.test.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const JS = path.join(ROOT, 'game', 'js', 'gigi_art.js');
const ASSETS = path.join(ROOT, 'game', 'assets', 'default');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function loadArt() {
  const sb = { console, Math, Float64Array };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(JS, 'utf8'), sb, { filename: 'gigi_art.js' });
  return sb.GW;
}

// stub 2D context: records calls, checks every numeric argument is finite, tracks save/restore balance
function stubCtx() {
  const calls = [];
  let depth = 0;
  const num = (name, args) => {
    for (const a of args) if (typeof a === 'number') assert.ok(Number.isFinite(a), `${name} got non-finite ${a}`);
    calls.push(name);
  };
  const ctx = {
    globalAlpha: 1, lineCap: 'butt', lineJoin: 'miter', lineWidth: 1, strokeStyle: '#000', fillStyle: '#000',
    save() { depth++; calls.push('save'); }, restore() { depth--; assert.ok(depth >= 0, 'restore without save'); calls.push('restore'); },
    beginPath() { calls.push('beginPath'); }, closePath() { calls.push('closePath'); },
    moveTo(...a) { num('moveTo', a); }, lineTo(...a) { num('lineTo', a); },
    quadraticCurveTo(...a) { num('quadraticCurveTo', a); }, bezierCurveTo(...a) { num('bezierCurveTo', a); },
    arc(...a) { num('arc', a); }, ellipse(...a) { num('ellipse', a); },
    fill() { calls.push('fill'); }, stroke() { calls.push('stroke'); }, clip() { calls.push('clip'); },
    setLineDash(a) { assert.ok(Array.isArray(a)); calls.push('setLineDash'); },
    translate(...a) { num('translate', a); }, rotate(...a) { num('rotate', a); }, scale(...a) { num('scale', a); }
  };
  return { ctx, calls, depth: () => depth };
}

const GW = loadArt();
const A = GW && GW.GigiArt;

test('GW.GigiArt API exists', () => {
  assert.ok(A, 'GW.GigiArt missing');
  assert.strictEqual(typeof A.drawNeck, 'function');
  assert.strictEqual(typeof A.headAngle, 'function');
  assert.strictEqual(typeof A.thickFor, 'function');
});

test('ANCHORS match DESIGN §4.1 / §6.3', () => {
  const N = A.ANCHORS;
  assert.deepStrictEqual([N.body.w, N.body.h], [256, 256]);
  assert.deepStrictEqual(Array.from(N.body.feet), [128, 244]);
  assert.deepStrictEqual(Array.from(N.body.socket), [172, 96]);
  assert.deepStrictEqual([N.head.w, N.head.h], [192, 192]);
  assert.deepStrictEqual(Array.from(N.head.joint), [70, 160]);
  assert.ok(N.body.neckW > 0 && N.head.box === 0.62);
});

test('thickFor scales with the body height', () => {
  assert.ok(Math.abs(A.thickFor(256) - A.ANCHORS.body.neckW) < 1e-9);
  assert.ok(Math.abs(A.thickFor(150) / A.thickFor(75) - 2) < 1e-9);
});

test('drawNeck draws, keeps save/restore balanced, finite args, many poses', () => {
  const h = 150, th = A.thickFor(h);
  const poses = [[0.12, -0.6], [-0.6, -0.9], [0, -1.6], [1.2, -1.0], [1.5, -0.4], [-1.4, -0.5], [0.3, -0.45]];
  for (const [ox, oy] of poses) for (const bend of [undefined, -1, 0, 0.5, 1, 7]) {
    const s = stubCtx();
    A.drawNeck(s.ctx, 300, 500, 300 + ox * h, 500 + oy * h, th, bend === undefined ? undefined : { bend });
    assert.strictEqual(s.depth(), 0, 'save/restore unbalanced');
    assert.ok(s.calls.filter(c => c === 'fill').length >= 3, 'neck fill + cap + patches');
    assert.ok(s.calls.filter(c => c === 'stroke').length >= 4, 'mane + shade + outline');
    assert.ok(s.calls.includes('clip'));
  }
});

test('drawNeck ignores degenerate input (zero length / zero thickness)', () => {
  const s = stubCtx();
  A.drawNeck(s.ctx, 10, 10, 10, 10, 20, {});
  A.drawNeck(s.ctx, 10, 10, 50, -80, 0, {});
  A.drawNeck(s.ctx, 10, 10, 50, -80, NaN, {});
  assert.strictEqual(s.calls.length, 0);
});

test('drawNeck restores ctx state (alpha, dash) and honours opt.alpha', () => {
  const s = stubCtx();
  let alpha = 1, minAlpha = 1;
  Object.defineProperty(s.ctx, 'globalAlpha', { get() { return alpha; }, set(v) { alpha = v; minAlpha = Math.min(minAlpha, v); } });
  const saved = [];
  s.ctx.save = function () { saved.push(alpha); };
  s.ctx.restore = function () { alpha = saved.pop(); };
  A.drawNeck(s.ctx, 0, 0, 20, -90, 30, { alpha: 0.5 });
  assert.ok(minAlpha <= 0.5 + 1e-9, 'opt.alpha applied');
  assert.strictEqual(alpha, 1, 'alpha restored');
  assert.strictEqual(saved.length, 0, 'save/restore balanced');
});

test('headAngle: 0 near rest, sign follows the reach, clamped to ±0.35', () => {
  const h = 150;
  assert.ok(Math.abs(A.headAngle(0, 0, 0.12 * h, -0.6 * h)) < 1e-9, 'rest pose = 0');
  assert.ok(A.headAngle(0, 0, 1.2 * h, -0.8 * h) > 0, 'reaching right tilts forward (clockwise)');
  assert.ok(A.headAngle(0, 0, -1.0 * h, -1.0 * h) < 0, 'reaching left tilts back');
  for (let a = -Math.PI; a <= Math.PI; a += 0.1) {
    const v = A.headAngle(0, 0, Math.cos(a) * 200, Math.sin(a) * 200);
    assert.ok(Math.abs(v) <= 0.35 + 1e-12 && Number.isFinite(v));
  }
});

// ---------------------------------------------------------------- SVG files
const SVGS = [
  ...['stand', 'walk_a', 'walk_b', 'hop'].map(n => [`characters/gigi_body_${n}.svg`, 256, 256]),
  ...['idle', 'blink', 'talk', 'happy', 'cheer', 'think', 'oops'].map(n => [`characters/gigi_head_${n}.svg`, 192, 192]),
  ['characters/gigi_title.svg', 320, 480],
  ['characters/pigeon.svg', 128, 128], ['characters/pigeon_flap.svg', 128, 128],
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
    // every url(#id) points at an id defined in the same file
    for (const m of src.matchAll(/url\(#([^)]+)\)/g)) assert.ok(src.includes(`id="${m[1]}"`), rel + ': missing #' + m[1]);
    // balanced tags (cheap well-formedness check)
    const open = (src.match(/<(?!\/|\?|!)[a-zA-Z][^>]*[^/]>/g) || []).length;
    const close = (src.match(/<\/[a-zA-Z]+>/g) || []).length;
    assert.strictEqual(open, close, rel + ': unbalanced tags');
  }
});

test('Gigi uses the DESIGN §3 palette (coat, patches, outline, scarf)', () => {
  const body = fs.readFileSync(path.join(ASSETS, 'characters/gigi_body_stand.svg'), 'utf8');
  const head = fs.readFileSync(path.join(ASSETS, 'characters/gigi_head_idle.svg'), 'utf8');
  for (const c of ['#F3CE85', '#B97A3F', '#7E5226', '#7CCFB8', '#4C9C88', '#6B4421', '#9C6532']) assert.ok(body.includes(c), 'body ' + c);
  for (const c of ['#F3CE85', '#FBEBCB', '#6B4421', '#2F2622', '#F5AFB4', '#7E5226']) assert.ok(head.includes(c), 'head ' + c);
  const C = A.COLORS;
  assert.strictEqual(C.coat, '#F3CE85'); assert.strictEqual(C.patch, '#B97A3F');
  assert.strictEqual(C.line, '#7E5226'); assert.strictEqual(C.mane, '#9C6532');
});

test('body frames share an identical torso (only legs / tail change)', () => {
  const torso = n => {
    const s = fs.readFileSync(path.join(ASSETS, `characters/gigi_body_${n}.svg`), 'utf8');
    return s.match(/<clipPath id="[^"]+t">(.*?)<\/clipPath>/)[1];   // torso + neck stub outline
  };
  const ref = torso('stand');
  for (const n of ['walk_a', 'walk_b', 'hop']) assert.strictEqual(torso(n), ref, n);
});

let fail = 0;
for (const t of tests) {
  try { t.fn(); console.log('ok   ', t.name); } catch (e) { fail++; console.log('FAIL ', t.name, '\n     ', e.message); }
}
console.log(`\n${tests.length - fail}/${tests.length} passed`);
process.exit(fail ? 1 : 0);
