// Bibi's Cloud Drums — unit test for CD.DrumArt (game/js/drum_art.js), plain node, no browser.
// A mock 2D context records every call; Path2D is stubbed. Checks: all public functions exist, every kind / option draws
// without throwing and actually draws, bodyBox ≤ size with cy < 0 (above the bottom-centre anchor), no NaN reaches the context, node-safe load.
// Run: node tests/unit/drum_art.test.js   (exit code 1 on any failure)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

let fails = 0, passes = 0;
function ok(cond, msg) { if (cond) passes++; else { fails++; console.error('FAIL', msg); } }

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'game', 'js', 'drum_art.js'), 'utf8');

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
  vm.runInContext(SRC, sb, { filename: 'drum_art.js' });
  return sb.CD;
}

// node-safe load without window (plain global)
try {
  const sb = { console, Math }; sb.global = sb; vm.createContext(sb); vm.runInContext(SRC, sb);
  ok(sb.CD && sb.CD.DrumArt, 'loads with no window (global fallback)');
} catch (e) { ok(false, 'node-safe load threw: ' + e.message); }

for (const withP2D of [false, true]) {
  const CD = load(withP2D), A = CD && CD.DrumArt, tag = withP2D ? '[Path2D] ' : '[no Path2D] ';
  ok(!!A, tag + 'CD.DrumArt exists');
  if (!A) continue;
  ['drawDrum', 'bodyBox', 'drawCushion', 'cushionDip', 'drawGarland', 'drawCymbal', 'drawCard', 'drawNote', 'drawIcon',
    'drawGhostHand', 'drawFirefly', 'pal', 'thingKey', 'clearCache', 'lanternRadius']
    .forEach(f => ok(typeof A[f] === 'function', tag + 'function ' + f));
  ['drawBeam', 'drawFire', 'drawCord', 'hookPoint', 'fireTop'].forEach(f => ok(A[f] === undefined, tag + 'chime-era ' + f + ' removed'));
  ok(A.PALETTE && A.PALETTE.red.base === '#E84A4A' && A.PALETTE.purple.light === '#D2BDF3', tag + 'palette exact hex');
  ok(A.BRASS.base === '#D8B26A' && A.WOOD.base === '#C99466' && A.SILVER.base === '#E4E6EE' && A.SKIN.base === '#FFF6E6', tag + 'brass / wood / silver / skin hex');
  ok(A.CLOUD.base === '#F4F1FA' && A.CLOUD.shade === '#DCD6EC', tag + 'cushion white-lilac');
  ok(A.SHAPES.length === 8 && A.KINDS.join() === 'drum,shape,big,dots,animal,glyph', tag + 'shapes / kinds lists');
  ok(A.ANIMALS.join() === 'cow,duck,cat,pig,frog,sheep,hen,mouse', tag + 'animals list');
  ok(A.pal('red').base === '#E84A4A' && A.pal('nope') === null, tag + 'pal lookup');

  const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
  const things = [].concat(
    COLORS.map(c => ({ kind: 'drum', color: c })), [{ kind: 'drum' }, { kind: 'drum', color: 'weird' }],
    A.SHAPES.map((s, i) => ({ kind: 'shape', shape: s, color: COLORS[i % 7] })), [{ kind: 'shape', shape: 'blob' }],
    [{ kind: 'big' }, { kind: 'big', n: 3 }],
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map(n => ({ kind: 'dots', n })),
    A.ANIMALS.map(a => ({ kind: 'animal', animal: a })), [{ kind: 'animal', animal: 'dragon' }],
    ['A', 'g', 'Đ', '7', '12', '', 'WWW'].map(t => ({ kind: 'glyph', text: t })), [{ kind: 'glyph', text: 'B', color: 'blue' }, { kind: 'glyph', n: 9 }],
    [{ kind: 'mystery' }]
  );
  const opts = [{}, { ring: 0.7 }, { ring: 1, skin: 1, skinPh: 1.6 }, { ring: 0.5, dull: 1 }, { glow: 1 }, { dim: 1 }, { count: 0 }, { count: 3 },
    { count: 99 }, { sq: 0.8 }, { sq: 1.2, skin: 0.5, skinPh: 4.7 }, { sing: 1 }, { sing: 0.4, ring: 0.3 },
    { night: 1, ring: 0.3, glow: 0.5 }, { pop: 0.4 }, { pop: 1.2 }, { pop: 0 }, { ring: NaN, glow: 'x', sq: NaN, skin: 'y' }];
  for (const t of things) {
    for (const size of [112, 336, 48]) {
      const b = A.bodyBox(t, size);
      ok(b.w > 0 && b.h > 0 && b.w <= size + 1e-9 && b.h <= size + 1e-9, tag + 'bodyBox ≤ size ' + JSON.stringify(t) + ' ' + size + ' → ' + JSON.stringify(b));
      ok(b.cy < 0 && -b.cy < b.h, tag + 'bodyBox cy above the anchor, inside the box ' + JSON.stringify(t));
    }
    for (const o of opts) {
      const m = mockCtx();
      try { A.drawDrum(m.ctx, t, 112, o); } catch (e) { ok(false, tag + 'drawDrum threw ' + JSON.stringify(t) + ' ' + JSON.stringify(o) + ': ' + e.stack); continue; }
      ok(m.bad.length === 0, tag + 'clean calls ' + JSON.stringify(t) + ' ' + JSON.stringify(o) + ' ' + m.bad.slice(0, 3).join(' | '));
      ok(m.depth() === 0, tag + 'save/restore balanced ' + JSON.stringify(t));
      if (o.pop !== 0) ok(m.calls.filter(c => c === 'fill').length > 3, tag + 'draws something ' + JSON.stringify(t) + ' ' + JSON.stringify(o));
      else ok(m.calls.length === 0, tag + 'pop 0 draws nothing');
    }
  }
  // the right options change the drawing
  const count = (t, o) => { const m = mockCtx(); A.drawDrum(m.ctx, t, 112, o); return m.calls.length; };
  ok(count({ kind: 'drum', color: 'red' }, { ring: 0.7 }) > count({ kind: 'drum', color: 'red' }, {}), tag + 'ring adds flash + sound rings');
  ok(count({ kind: 'drum', color: 'red' }, { ring: 0.7, dull: 1 }) < count({ kind: 'drum', color: 'red' }, { ring: 0.7 }), tag + 'dull drops the flash');
  ok(count({ kind: 'big' }, { skin: 1, skinPh: 1 }) > count({ kind: 'big' }, {}), tag + 'skin ripple draws ripples');
  ok(count({ kind: 'dots', n: 3 }, { count: 3 }) > count({ kind: 'dots', n: 3 }, { count: 0 }), tag + 'count rings dots');
  ok(count({ kind: 'animal', animal: 'cow' }, { sing: 1 }) > count({ kind: 'animal', animal: 'cow' }, {}), tag + 'animal sings (song lines)');
  ok(count({ kind: 'dots', n: 9 }, {}) > count({ kind: 'dots', n: 2 }, {}), tag + 'more dots draw more');
  // squash keeps the bottom at the anchor: the scale is applied about the origin (no translate before it)
  { const seq = []; const m = mockCtx(); const ctx = new Proxy(m.ctx, { get(t, k) { const v = t[k]; if (k === 'scale' || k === 'translate') return (...a) => { seq.push([k, ...a]); return v(...a); }; return v; } });
    A.drawDrum(ctx, { kind: 'drum', color: 'red' }, 112, { sq: 0.8 });
    const sc = seq.findIndex(q => q[0] === 'scale' && Math.abs(q[2] - 0.8) < 1e-9);
    ok(sc >= 0 && Math.abs(seq[sc][1] - 1 / Math.sqrt(0.8)) < 1e-9 && !seq.slice(0, sc).some(q => q[0] === 'translate'), tag + 'squash about the anchor, width × 1/√sq'); }
  // geometry: proportions per kind
  const bb = k => A.bodyBox(k, 100);
  ok(Math.abs(bb({ kind: 'drum' }).h - 88.3) < 1.5 && bb({ kind: 'drum' }).w > 95, tag + 'tom ≈ size wide, ≈ 0.86–0.9 tall');
  ok(bb({ kind: 'big' }).h > 93, tag + 'big drum deeper (≈ 0.95)');
  A.ANIMALS.forEach(a => ok(bb({ kind: 'animal', animal: a }).h > 90, tag + a + ' (animal + drum) fills the size'));
  const dip0 = A.cushionDip(140, 0), dip1 = A.cushionDip(140, 1);
  ok(dip0 === 0 && dip1 > 4 && dip1 < 14, tag + 'cushionDip 0 → 0, 1 → a few px (' + dip1.toFixed(2) + ')');

  // scene pieces
  const garland = { x0: 250, x1: 1200, y: 198, sag: 22 };
  const lanterns = [{ x: 400, y: 215, lit: 0, color: null, swing: 0, flash: 0 }, { x: 600, y: 222, lit: 1, color: 'red', swing: 0.2, flash: 1 },
    { x: 800, y: 222, lit: 0.5, color: null, swing: -0.1, flash: 0.3 }, { x: 900, y: 220, lit: 1, color: 'weird' }, null];
  const scene = [
    ['drawCushion', m => A.drawCushion(m.ctx, 100, 300, 140, { dent: 0.7, t: 2, night: 1, alpha: 0.8, pop: 0.6 })],
    ['drawCushion defaults', m => A.drawCushion(m.ctx, 100, 300, 140)],
    ['drawCushion dent 1', m => A.drawCushion(m.ctx, 100, 300, 140, { dent: 1 })],
    ['drawCushion NaN', m => A.drawCushion(m.ctx, 100, 300, NaN, { dent: NaN, pop: 'x' })],
    ['drawGarland', m => A.drawGarland(m.ctx, garland, lanterns, { t: 2, night: 1 })],
    ['drawGarland empty', m => A.drawGarland(m.ctx, garland, [], {})],
    ['drawCymbal', m => A.drawCymbal(m.ctx, { x: 200, y: 600, s: 0.9 }, { tilt: 0.2, ring: 1, night: 1, t: 3 })],
    ['drawCymbal h only', m => A.drawCymbal(m.ctx, { x: 200, y: 600, h: 120 })],
    ['drawCard', m => { for (let n = 1; n <= 12; n++) for (let l = 0; l <= n; l += 2) A.drawCard(m.ctx, 50, 50, n, { lit: l, pop: 0.9, flash: 0.5, size: 150 }); }],
    ['drawCard junk', m => A.drawCard(m.ctx, 50, 50, NaN, { lit: 99 })],
    ['drawNote', m => A.drawNote(m.ctx, 50, 50, 40, { color: 'blue', alpha: 0.5, rot: 0.3 })],
    ['drawNote gold', m => A.drawNote(m.ctx, 50, 50, 40)],
    ['drawGhostHand', m => A.drawGhostHand(m.ctx, 90, 0.5)],
    ['drawFirefly', m => { A.drawFirefly(m.ctx, 5, 5, 4, 0.7); A.drawFirefly(m.ctx, 5, 5, 4, 0); }],
    ['drawIcon number', m => A.drawIcon(m.ctx, { kind: 'number', n: 7 }, 120)],
    ['drawIcon number 15', m => A.drawIcon(m.ctx, { kind: 'number', n: 15 }, 120)],
    ['drawIcon color', m => A.drawIcon(m.ctx, { kind: 'color', color: 'green' }, 120)],
    ['drawIcon size big', m => A.drawIcon(m.ctx, { kind: 'size', big: true, color: 'blue' }, 120)],
    ['drawIcon size small', m => A.drawIcon(m.ctx, { kind: 'size', big: false }, 120)],
    ['drawIcon sound', m => A.ANIMALS.concat(['??']).forEach(a => A.drawIcon(m.ctx, { kind: 'sound', animal: a }, 120))],
    ['drawIcon letter', m => A.drawIcon(m.ctx, { kind: 'letter', text: 'Q' }, 120)],
    ['drawIcon drums', m => things.forEach(t => A.drawIcon(m.ctx, t, 120))],
    ['drawIcon unknown', m => A.drawIcon(m.ctx, { kind: '??' }, 120)]
  ];
  for (const [n, f] of scene) {
    const m = mockCtx();
    try { f(m); ok(m.bad.length === 0, tag + n + ' clean ' + m.bad.slice(0, 3).join(' | ')); ok(m.depth() === 0, tag + n + ' balanced'); }
    catch (e) { ok(false, tag + n + ' threw: ' + e.stack); }
  }
  { const m = mockCtx(); A.drawCard(m.ctx, 0, 0, 3, { lit: 0 }); const c0 = m.calls.length; const m2 = mockCtx(); A.drawCard(m2.ctx, 0, 0, 3, { lit: 3 }); ok(m2.calls.length > c0, tag + 'lit card dots draw glow'); }
  // null-safety
  try { A.drawDrum(null, { kind: 'drum' }, 112); A.drawDrum(mockCtx().ctx, null, 112); A.drawCushion(null); A.drawGarland(mockCtx().ctx, null); A.drawCymbal(null);
    A.drawCymbal(mockCtx().ctx, null); A.drawCard(null); A.drawIcon(null); ok(true, ''); }
  catch (e) { ok(false, tag + 'null args threw ' + e.message); }
  ok(A.thingKey({ kind: 'drum', color: 'red' }) !== A.thingKey({ kind: 'drum', color: 'blue' }), tag + 'thingKey distinct');
  ok(A.lanternRadius() > 15, tag + 'lanternRadius');
  A.clearCache();
}

console.log((fails ? 'FAILED ' : 'ok ') + passes + ' passed, ' + fails + ' failed (drum_art)');
process.exit(fails ? 1 : 0);
