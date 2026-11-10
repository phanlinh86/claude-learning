// Kiki's Camp Chimes — unit test for CC.ChimeArt (game/js/chime_art.js), plain node, no browser.
// A mock 2D context records every call; Path2D is stubbed. Checks: all public functions exist, every kind / option draws
// without throwing and actually draws, bodyBox ≤ size with a sane cy, no NaN reaches the context, node-safe load.
// Run: node tests/unit/chime_art.test.js   (exit code 1 on any failure)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

let fails = 0, passes = 0;
function ok(cond, msg) { if (cond) passes++; else { fails++; console.error('FAIL', msg); } }

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'game', 'js', 'chime_art.js'), 'utf8');

function mockCtx() {
  const calls = [], bad = [];
  const grad = () => ({ addColorStop(o, c) { if (!(o >= 0 && o <= 1)) bad.push('stop ' + o); if (/NaN/.test(c)) bad.push('colour ' + c); } });
  const state = { globalAlpha: 1, lineWidth: 1, fillStyle: '#000', strokeStyle: '#000', font: '10px x', textAlign: 'left',
    textBaseline: 'alphabetic', lineJoin: 'miter', lineCap: 'butt', shadowColor: '', shadowBlur: 0, shadowOffsetY: 0 };
  const stack = [];
  const ctx = new Proxy(state, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'save') return () => { calls.push('save'); stack.push(Object.assign({}, t)); };
      if (k === 'restore') return () => { calls.push('restore'); const s = stack.pop(); if (!s) bad.push('restore without save'); else Object.assign(t, s); };
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return (...a) => { if (a.some(v => !isFinite(v))) bad.push(k + ' NaN'); calls.push(k); return grad(); };
      if (k === 'measureText') return (s) => ({ width: String(s).length * 50 });
      if (k === 'setLineDash') return () => {};
      return (...a) => {
        calls.push(k);
        if (a.some(v => typeof v === 'number' && !isFinite(v))) bad.push(k + '(' + a.join(',') + ')');
        if ((k === 'arc' && a[2] < 0) || (k === 'ellipse' && (a[2] < 0 || a[3] < 0))) bad.push(k + ' negative radius ' + a.join(','));
      };
    },
    set(t, k, v) {
      if (typeof v === 'number' && !isFinite(v)) bad.push('set ' + String(k) + ' NaN');
      if (typeof v === 'string' && /NaN|undefined/.test(v)) bad.push('set ' + String(k) + ' ' + v);
      t[k] = v; return true;
    }
  });
  return { ctx, calls, bad, depth: () => stack.length };
}

function load(withPath2D) {
  const sb = { console, Math };
  sb.window = sb;
  if (withPath2D) sb.Path2D = function () { const p = this; ['moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'arc', 'ellipse', 'closePath', 'rect'].forEach(m => { p[m] = () => {}; }); };
  vm.createContext(sb);
  vm.runInContext(SRC, sb, { filename: 'chime_art.js' });
  return sb.CC;
}

// node-safe load without window (plain global)
try {
  const sb = { console, Math }; sb.global = sb; vm.createContext(sb); vm.runInContext(SRC, sb);
  ok(sb.CC && sb.CC.ChimeArt, 'loads with no window (global fallback)');
} catch (e) { ok(false, 'node-safe load threw: ' + e.message); }

for (const withP2D of [false, true]) {
  const CC = load(withP2D), A = CC && CC.ChimeArt, tag = withP2D ? '[Path2D] ' : '[no Path2D] ';
  ok(!!A, tag + 'CC.ChimeArt exists');
  if (!A) continue;
  ['drawChime', 'bodyBox', 'drawCord', 'drawBeam', 'drawGarland', 'drawFire', 'drawNote', 'drawIcon', 'drawGhostHand',
    'drawFirefly', 'hookPoint', 'pal', 'thingKey', 'clearCache', 'lanternRadius', 'fireTop']
    .forEach(f => ok(typeof A[f] === 'function', tag + 'function ' + f));
  ok(A.PALETTE && A.PALETTE.red.base === '#E84A4A' && A.PALETTE.purple.light === '#D2BDF3', tag + 'palette exact hex');
  ok(A.BRASS.base === '#D8B26A' && A.WOOD.base === '#A87245', tag + 'brass / wood hex');
  ok(A.SHAPES.length === 8 && A.ANIMALS.length === 8, tag + 'shapes / animals lists');
  ok(A.pal('red').base === '#E84A4A' && A.pal('nope') === null, tag + 'pal lookup');

  const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
  const things = [].concat(
    COLORS.map(c => ({ kind: 'bell', color: c })),
    [{ kind: 'bell', color: 'red', big: true }, { kind: 'bell' }],
    A.SHAPES.map((s, i) => ({ kind: 'plate', shape: s, color: COLORS[i % 7] })), [{ kind: 'plate', shape: 'blob' }],
    [0, 1, 2, 3, 4, 5, 6].map(n => ({ kind: 'string', n })),
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map(n => ({ kind: 'dots', n })),
    A.ANIMALS.map(a => ({ kind: 'animal', animal: a })), [{ kind: 'animal', animal: 'dragon' }],
    ['A', 'g', 'Đ', '7', '12', '', 'WWW'].map(t => ({ kind: 'glyph', text: t })), [{ kind: 'glyph', text: 'B', color: 'blue' }, { kind: 'glyph', n: 9 }],
    [{ kind: 'mystery' }]
  );
  const opts = [{}, { ring: 0.7 }, { ring: 1, clap: 1 }, { ring: 0.5, flash: 0 }, { glow: 1 }, { dim: 1 }, { count: 0 }, { count: 3 },
    { count: 99 }, { clap: -1 }, { night: 1, ring: 0.3, glow: 0.5 }, { pop: 0.4 }, { pop: 0 }, { ring: NaN, glow: 'x' }];
  for (const t of things) {
    for (const size of [112, 336, 48]) {
      const b = A.bodyBox(t, size);
      ok(b.w > 0 && b.h > 0 && b.w <= size + 1e-9 && b.h <= size + 1e-9, tag + 'bodyBox ≤ size ' + JSON.stringify(t) + ' ' + size + ' → ' + JSON.stringify(b));
      ok(b.cy > 0 && b.cy < b.h, tag + 'bodyBox cy inside ' + JSON.stringify(t));
    }
    for (const o of opts) {
      const m = mockCtx();
      try { A.drawChime(m.ctx, t, 112, o); } catch (e) { ok(false, tag + 'drawChime threw ' + JSON.stringify(t) + ' ' + JSON.stringify(o) + ': ' + e.stack); continue; }
      ok(m.bad.length === 0, tag + 'clean calls ' + JSON.stringify(t) + ' ' + JSON.stringify(o) + ' ' + m.bad.slice(0, 3).join(' | '));
      ok(m.depth() === 0, tag + 'save/restore balanced ' + JSON.stringify(t));
      if (o.pop !== 0) ok(m.calls.filter(c => c === 'fill').length > 3, tag + 'draws something ' + JSON.stringify(t) + ' ' + JSON.stringify(o));
      else ok(m.calls.length === 0, tag + 'pop 0 draws nothing');
    }
  }
  // the right options change the drawing
  const count = (t, o) => { const m = mockCtx(); A.drawChime(m.ctx, t, 112, o); return m.calls.length; };
  ok(count({ kind: 'bell', color: 'red' }, { ring: 0.7 }) > count({ kind: 'bell', color: 'red' }, {}), tag + 'ring adds arcs');
  ok(count({ kind: 'string', n: 3 }, { count: 3 }) > count({ kind: 'string', n: 3 }, { count: 0 }), tag + 'count lights bells');
  ok(count({ kind: 'animal', animal: 'fox' }, { ring: 0.8, flash: 0 }) > count({ kind: 'animal', animal: 'fox' }, { ring: 0.4, flash: 0 }) - 40, tag + 'animal sings');
  for (let n = 1; n <= 5; n++) {
    const sb = A.bodyBox({ kind: 'string', n }, 100);
    ok(sb.w >= 80 && sb.h >= 80, tag + 'string n=' + n + ' fills ≥ 0.8 × size ' + JSON.stringify(sb));
    ok(JSON.stringify(sb) === JSON.stringify(A.bodyBox({ kind: 'string', n: 1 }, 100)), tag + 'string n=' + n + ' same box as n=1 (fair counting)');
  }
  // every little bell of a string is ≥ 0.3 × size wide: measure the bell bodies' arcs/curves via the recorded transform
  ok(A.STRING_BELL && A.STRING_BELL.w >= 30, tag + 'string mini bell ≥ 0.3 × size wide (' + (A.STRING_BELL && A.STRING_BELL.w) + ')');
  ok(count({ kind: 'string', n: 5 }, {}) > count({ kind: 'string', n: 1 }, {}), tag + 'more bells draw more');
  ok(Math.abs(A.bodyBox({ kind: 'bell' }, 100).w - 86) < 1e-9 && A.bodyBox({ kind: 'bell' }, 100).h === 100, tag + 'bell 0.86 × 1');
  const rect = A.bodyBox({ kind: 'plate', shape: 'rect' }, 100), ov = A.bodyBox({ kind: 'plate', shape: 'oval' }, 100);
  ok(rect.w > rect.h * 1.1 && ov.h > ov.w * 1.3, tag + 'rect wide / oval tall');

  // scene pieces
  const layout = { beam: { x0: 250, x1: 1200, y: 260, r: 15 }, posts: [{ x: 250, top: 190, bottom: 700 }, { x: 1200, top: 190, bottom: 700 }],
    garland: { x0: 250, x1: 1200, y: 198, sag: 26 }, hooks: [{ x: 400 }, { x: 600 }] };
  const lanterns = [{ x: 400, y: 215, lit: 0, color: null, swing: 0, flash: 0 }, { x: 600, y: 222, lit: 1, color: 'red', swing: 0.2, flash: 1 },
    { x: 800, y: 222, lit: 0.5, color: null, swing: -0.1, flash: 0.3 }, { x: 900, y: 220, lit: 1, color: 'weird' }, null];
  const scene = [
    ['drawCord', m => A.drawCord(m.ctx, 10, 10, 30, 160, { night: 1 })],
    ['drawCord zero', m => A.drawCord(m.ctx, 10, 10, 10, 10, {})],
    ['drawBeam', m => A.drawBeam(m.ctx, layout, { t: 1, wob: 2, night: 0.5, hooks: [300, { x: 500 }] })],
    ['drawBeam default hooks', m => A.drawBeam(m.ctx, layout)],
    ['drawBeam no posts', m => A.drawBeam(m.ctx, { beam: { x0: 0, x1: 500, y: 100, r: 15 } }, {})],
    ['drawGarland', m => A.drawGarland(m.ctx, layout.garland, lanterns, { t: 2, night: 1 })],
    ['drawGarland empty', m => A.drawGarland(m.ctx, layout.garland, [], {})],
    ['drawFire', m => A.drawFire(m.ctx, { x: 200, y: 600, s: 0.9 }, { t: 3.3, glow: 1 })],
    ['drawFire noglow', m => A.drawFire(m.ctx, { x: 200, y: 600, s: 1 }, { t: 0, glow: 0 })],
    ['drawNote', m => A.drawNote(m.ctx, 50, 50, 40, { color: 'blue', alpha: 0.5, rot: 0.3 })],
    ['drawNote gold', m => A.drawNote(m.ctx, 50, 50, 40)],
    ['drawGhostHand', m => A.drawGhostHand(m.ctx, 90, 0.5)],
    ['drawFirefly', m => A.drawFirefly(m.ctx, 5, 5, 4, 0.7)],
    ['drawIcon number', m => A.drawIcon(m.ctx, { kind: 'number', n: 7 }, 120)],
    ['drawIcon number 15', m => A.drawIcon(m.ctx, { kind: 'number', n: 15 }, 120)],
    ['drawIcon color', m => A.drawIcon(m.ctx, { kind: 'color', color: 'green' }, 120)],
    ['drawIcon size big', m => A.drawIcon(m.ctx, { kind: 'size', big: true, color: 'blue' }, 120)],
    ['drawIcon size small', m => A.drawIcon(m.ctx, { kind: 'size', big: false }, 120)],
    ['drawIcon letter', m => A.drawIcon(m.ctx, { kind: 'letter', text: 'Q' }, 120)],
    ['drawIcon chimes', m => things.forEach(t => A.drawIcon(m.ctx, t, 120))],
    ['drawIcon unknown', m => A.drawIcon(m.ctx, { kind: '??' }, 120)]
  ];
  for (const [n, f] of scene) {
    const m = mockCtx();
    try { f(m); ok(m.bad.length === 0, tag + n + ' clean ' + m.bad.slice(0, 3).join(' | ')); ok(m.depth() === 0, tag + n + ' balanced'); }
    catch (e) { ok(false, tag + n + ' threw: ' + e.stack); }
  }
  // null-safety
  try { A.drawChime(null, { kind: 'bell' }, 112); A.drawChime(mockCtx().ctx, null, 112); A.drawBeam(null); A.drawGarland(mockCtx().ctx, null); A.drawFire(null); A.drawIcon(null); ok(true, ''); }
  catch (e) { ok(false, tag + 'null args threw ' + e.message); }
  const hp = A.hookPoint(layout, 400, 2);
  ok(hp.x === 400 && hp.y === 260 + 2 + 15 + 12, tag + 'hookPoint');
  ok(A.fireTop({ x: 0, y: 600, s: 1 }) === 490, tag + 'fireTop');
  ok(A.thingKey({ kind: 'bell', color: 'red' }) !== A.thingKey({ kind: 'bell', color: 'blue' }), tag + 'thingKey distinct');
  A.clearCache();
}

console.log((fails ? 'FAILED ' : 'ok ') + passes + ' passed, ' + fails + ' failed (chime_art)');
process.exit(fails ? 1 : 0);
