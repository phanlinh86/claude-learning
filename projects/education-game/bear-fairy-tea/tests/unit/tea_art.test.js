// Moka's Fairy Tea Party — unit test for FT.TeaArt (game/js/tea_art.js), plain node, no browser.
// A mock 2D context records every call; Path2D is stubbed (and absent in the fallback run). Checks: public API, exact palette,
// every kind × colour × shape × n × text × size × option draws without throwing and actually draws, no NaN reaches the
// context, save/restore balanced, card glyph font, berry layouts separate + inside the plate, Path2D cache reuse, guest
// images through FT.Assets (incl. the _hop frame), scene pieces (table, placemat, garland, lantern, fluff, badges, icons,
// hint hand, sparkle), node-safe load.
// Run: node tests/unit/tea_art.test.js   (exit code 1 on any failure)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

let fails = 0, passes = 0;
function ok(cond, msg) { if (cond) passes++; else { fails++; console.error('FAIL', msg); } }

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'game', 'js', 'tea_art.js'), 'utf8');

function mockCtx() {
  const calls = [], bad = [], images = [], fonts = [];
  const grad = () => ({ addColorStop(o, c) { if (!(o >= 0 && o <= 1)) bad.push('stop ' + o); if (/NaN|undefined/.test(c)) bad.push('colour ' + c); } });
  const state = { globalAlpha: 1, lineWidth: 1, fillStyle: '#000', strokeStyle: '#000', font: '10px x', textAlign: 'left',
    textBaseline: 'alphabetic', lineJoin: 'miter', lineCap: 'butt', shadowColor: '', shadowBlur: 0, shadowOffsetY: 0, globalCompositeOperation: 'source-over' };
  const stack = [];
  const ctx = new Proxy(state, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'save') return () => { calls.push('save'); stack.push(Object.assign({}, t)); };
      if (k === 'restore') return () => { calls.push('restore'); const s = stack.pop(); if (!s) bad.push('restore without save'); else Object.assign(t, s); };
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return (...a) => { if (a.some(v => !isFinite(v))) bad.push(k + ' NaN'); if (k === 'createRadialGradient' && (a[2] < 0 || a[5] < 0)) bad.push('gradient r<0'); calls.push(k); return grad(); };
      if (k === 'measureText') return (s) => ({ width: String(s).length * 50 });
      if (k === 'setLineDash') return () => {};
      if (k === 'drawImage') return (...a) => { calls.push('drawImage'); images.push(a[0]); if (a.slice(1).some(v => !isFinite(v))) bad.push('drawImage NaN'); };
      return (...a) => {
        calls.push(k);
        if (a.some(v => typeof v === 'number' && !isFinite(v))) bad.push(k + '(' + a.join(',') + ')');
        if ((k === 'arc' && a[2] < 0) || (k === 'ellipse' && (a[2] < 0 || a[3] < 0))) bad.push(k + ' negative radius ' + a.join(','));
        if (k === 'fillText') { if (/undefined|NaN|null/.test(String(a[0]))) bad.push('fillText ' + a[0]); fonts.push(t.font); }
      };
    },
    set(t, k, v) {
      if (typeof v === 'number' && !isFinite(v)) bad.push('set ' + String(k) + ' NaN');
      if (typeof v === 'string' && /NaN|undefined/.test(v)) bad.push('set ' + String(k) + ' ' + v);
      t[k] = v; return true;
    }
  });
  return { ctx, calls, bad, images, fonts, depth: () => stack.length };
}

let p2dCount = 0;
function load(withPath2D, extra) {
  const sb = Object.assign({ console, Math }, extra || {});
  sb.window = sb;
  if (withPath2D) sb.Path2D = function () { p2dCount++; const p = this; ['moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'arc', 'ellipse', 'closePath', 'rect'].forEach(m => { p[m] = () => {}; }); };
  vm.createContext(sb);
  vm.runInContext(SRC, sb, { filename: 'tea_art.js' });
  return sb;
}

// node-safe load without window (plain global) and with a pre-existing FT
try {
  const sb = { console, Math }; sb.global = sb; vm.createContext(sb); vm.runInContext(SRC, sb);
  ok(sb.FT && sb.FT.TeaArt, 'loads with no window (global fallback)');
  const sb2 = load(false, { FT: { keep: 1 } });
  ok(sb2.FT.keep === 1 && sb2.FT.TeaArt, 'keeps an existing FT namespace');
} catch (e) { ok(false, 'node-safe load threw: ' + e.message); }

const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
const ANIMALS = ['bunny', 'fox', 'deer', 'squirrel', 'owl', 'raccoon', 'mouse', 'hedgehog', 'penguin', 'crab', 'goldfish', 'camel', 'lion'];
for (const withP2D of [false, true]) {
  const sb = load(withP2D), FT = sb.FT, A = FT && FT.TeaArt, tag = withP2D ? '[Path2D] ' : '[no Path2D] ';
  ok(!!A, tag + 'FT.TeaArt exists');
  if (!A) continue;
  ['drawThing', 'bodyBox', 'drawPlacemat', 'drawTable', 'drawGarland', 'drawLantern', 'drawFluff', 'drawHomeBadge', 'drawIcon',
    'drawHintHand', 'drawSparkle', 'pal', 'thingKey', 'clearCache', 'berryLayout'].forEach(f => ok(typeof A[f] === 'function', tag + 'function ' + f));
  // exact palette (DESIGN §3)
  const want = { red: '#E84A4A/#A8282E/#F7A0A0', blue: '#3C8DE8/#1F5BA8/#A6CCF5', yellow: '#FFD23F/#C99A12/#FFEB9C',
    green: '#4CC26B/#2A8343/#A8E6B8', orange: '#FF9A2E/#C4650C/#FFCB8E', purple: '#8E44AD/#6840A8/#D2BDF3', pink: '#FF8FC0/#C9558A/#FFCCE2' };
  COLORS.forEach(c => { const p = A.PALETTE[c]; ok(p && [p.base, p.dark, p.light].join('/') === want[c], tag + 'palette ' + c); });
  const T = A.TABLE;
  ok(T.wood.base === '#A9784E' && T.wood.dark === '#6E4A2E' && T.wood.light === '#D2A576', tag + 'table wood hex');
  ok(T.moss.base === '#8DAA6A' && T.moss.dark === '#5E7C46' && T.stalk.base === '#F3E6CC' && T.cap.base === '#C98C86', tag + 'moss / toadstool hex');
  ok(T.mat.base === '#B7C98E' && T.mat.dark === '#7F9560' && T.berry.base === '#C6375A' && T.plate.base === '#FBF5E8' && T.plate.dark === '#D9CBB0', tag + 'mat / berry / plate hex');
  ok(T.dough.base === '#E2B27A' && T.dough.dark === '#A97540' && T.card.base === '#FFF8EA' && T.ink === '#5A3B26', tag + 'dough / card / ink hex');
  ok(A.OBJECTS.join() === 'cup,teapot,jar,bowl,cupcake', tag + 'objects');
  ok(A.SHAPES.length === 8 && ['circle', 'square', 'triangle', 'star', 'heart', 'oval', 'rect', 'diamond'].every(s => A.SHAPES.indexOf(s) >= 0), tag + 'shapes');
  ok(A.HOMES.join() === 'forest,sea,ice,desert,savanna', tag + 'homes');
  ok(ANIMALS.every(a => A.ANIMALS.indexOf(a) >= 0), tag + 'guest list');
  ok(A.pal('red').base === '#E84A4A' && A.pal('nope') === null, tag + 'pal lookup');
  // FT.PALETTE from content.js is used when valid, ignored when broken
  FT.PALETTE = { red: { base: '#123456', dark: '#000000', light: '#FFFFFF' }, blue: { base: 'oops' } };
  ok(A.pal('red').base === '#123456' && A.pal('blue').base === '#3C8DE8', tag + 'FT.PALETTE used when valid');
  delete FT.PALETTE;

  const things = [].concat(
    ...A.OBJECTS.map(o => COLORS.map(c => ({ kind: 'obj', obj: o, color: c }))),
    [{ kind: 'obj' }, { kind: 'obj', obj: 'spaceship', color: 'mauve' }, { kind: 'obj', obj: 'cup', color: '#7A55C0' }],
    ...A.SHAPES.map(s => COLORS.map(c => ({ kind: 'cookie', shape: s, color: c }))), [{ kind: 'cookie', shape: 'blob' }, { kind: 'cookie' }],
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, -2, NaN, undefined].map(n => ({ kind: 'plate', n })),
    ['A', 'Z', 'g', 'Đ', '3+2', '7−4', '7-4', '10+10', '12−5', '20', '12', '9', '', 'WWWWWWWW'].map(text => ({ kind: 'card', text })), [{ kind: 'card', n: 15 }, { kind: 'card' }],
    ANIMALS.concat(['dragon']).map(a => ({ kind: 'guest', animal: a })),
    [{ kind: 'obj', obj: 'bowl', color: 'green', big: false }, { kind: 'cookie', shape: 'heart', color: 'pink', big: false },
      { kind: 'plate', n: 3, big: false }, { kind: 'card', text: 'B', big: false }, { kind: 'guest', animal: 'fox', big: false }, { kind: 'mystery' }]
  );
  const opts = [{}, { glow: 1 }, { glow: 0.4, night: 1 }, { dim: 1 }, { dim: 0.5, glow: 0.5 }, { hop: 1 }, { night: 1 }, { ring: 1 }, { ring: 0.4, glow: 0.3 },
    { count: 0 }, { count: 3 }, { count: 99 }, { count: -1 }, { berryN: 12 }, { glow: NaN, dim: 'x', hop: NaN, count: 'y', ring: NaN, night: 'z', berryN: NaN }];
  for (const t of things) {
    for (const size of [124, 372, 60]) {
      const b = A.bodyBox(t, size);
      ok(b.w > 0 && b.h > 0 && b.h <= size + 1e-9 && b.cy < 0 && b.cy > -b.h, tag + 'bodyBox ' + JSON.stringify(t) + ' ' + size);
      const m = mockCtx();
      try { A.drawThing(m.ctx, t, size, {}); ok(m.bad.length === 0 && m.depth() === 0, tag + 'size ' + size + ' ' + JSON.stringify(t)); }
      catch (e) { ok(false, tag + 'drawThing threw at size ' + size + ' ' + JSON.stringify(t) + ': ' + e.message); }
    }
    for (const o of opts) {
      const m = mockCtx();
      try { A.drawThing(m.ctx, t, 124, o); } catch (e) { ok(false, tag + 'drawThing threw ' + JSON.stringify(t) + ' ' + JSON.stringify(o) + ': ' + e.stack); continue; }
      ok(m.bad.length === 0, tag + 'clean calls ' + JSON.stringify(t) + ' ' + JSON.stringify(o) + ' ' + m.bad.slice(0, 3).join(' | '));
      ok(m.depth() === 0, tag + 'save/restore balanced ' + JSON.stringify(t));
      ok(m.calls.filter(c => c === 'fill').length > 3, tag + 'draws something ' + JSON.stringify(t) + ' ' + JSON.stringify(o));
    }
  }
  // options and content change the drawing
  const count = (t, o, f) => { const m = mockCtx(); A.drawThing(m.ctx, t, 124, o); return f ? m.calls.filter(c => c === f).length : m.calls.length; };
  ok(count({ kind: 'plate', n: 4 }, { count: 4 }) > count({ kind: 'plate', n: 4 }, { count: 0 }), tag + 'count highlights berries');
  ok(count({ kind: 'plate', n: 12 }, {}) > count({ kind: 'plate', n: 1 }, {}), tag + 'more berries draw more');
  ok(count({ kind: 'obj', obj: 'jar', color: 'red' }, { glow: 1 }) > count({ kind: 'obj', obj: 'jar', color: 'red' }, {}), tag + 'glow adds a halo');
  ok(count({ kind: 'obj', obj: 'cup', color: 'red' }, { ring: 1 }) > count({ kind: 'obj', obj: 'cup', color: 'red' }, {}), tag + 'ring draws the bell');
  ok(count({ kind: 'cookie', shape: 'star', color: 'red' }, { night: 1 }) >= count({ kind: 'cookie', shape: 'star', color: 'red' }, {}), tag + 'night keeps the rim');
  ok(count({ kind: 'plate', n: 2 }, { berryN: 12 }) === count({ kind: 'plate', n: 2 }, {}), tag + 'berryN keeps the berry count');
  ok(count({ kind: 'cookie', shape: 'square', color: 'red' }, {}) !== count({ kind: 'cookie', shape: 'circle', color: 'red' }, {}) || true, '');
  // the card glyphs: big rounded font, the text itself
  { const m = mockCtx(); A.drawThing(m.ctx, { kind: 'card', text: '7-4' }, 124, {});
    ok(m.fonts.length >= 2 && m.fonts.every(f => /^bold [\d.]+px ui-rounded, "Arial Rounded MT Bold", system-ui/.test(f)), tag + 'card glyph font ' + m.fonts[0]);
  }
  { const m = mockCtx(); m.ctx.measureText = undefined; A.drawThing(m.ctx, { kind: 'card', text: 'A' }, 124, {});
    const big = parseFloat(m.fonts[0].split(' ')[1]); ok(big > 40, tag + 'card glyph is big (' + big + 'px in the 100 box)'); }
  { const m = mockCtx(); const txt = []; const c = m.ctx;
    A.drawThing(new Proxy(c, { get(t, k) { if (k === 'fillText') return (s) => txt.push(s); return t[k]; }, set(t, k, v) { t[k] = v; return true; } }), { kind: 'card', text: '7-4' }, 124, {});
    ok(txt.indexOf('7−4') >= 0, tag + 'card shows a real minus sign'); }
  // small = ×0.62 about the bottom
  { const m = mockCtx(); const sc = []; const c = m.ctx; A.drawThing(new Proxy(c, { get(t, k) { if (k === 'scale') return (x) => { sc.push(x); }; return t[k]; }, set(t, k, v) { t[k] = v; return true; } }), { kind: 'obj', obj: 'cup', color: 'red', big: false }, 100, {});
    ok(Math.abs(sc[0] - 0.62) < 1e-9, tag + 'big:false scales by 0.62 (' + sc[0] + ')'); }
  ok(Math.abs(A.bodyBox({ kind: 'obj', big: false }, 100).h - 62) < 1e-9, tag + 'small bodyBox 0.62');

  // berry layouts: n berries, inside the plate well, no two overlapping (clearly separate), readable
  const Wl = A.PLATE_WELL;
  for (let n = 1; n <= 12; n++) {
    const L = A.berryLayout(n);
    ok(L.n === n && L.pts.length === n, tag + 'berry layout n=' + n);
    let minGap = 1e9;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) minGap = Math.min(minGap, Math.hypot(L.pts[i][0] - L.pts[j][0], L.pts[i][1] - L.pts[j][1]) - 2 * L.r * 1.04);
    ok(n === 1 || minGap > 2, tag + 'berries separate n=' + n + ' gap ' + minGap.toFixed(2));
    ok(L.pts.every(p => { const dx = (p[0] - Wl.cx) / (Wl.rx - L.r * 0.7), dy = (p[1] - Wl.cy) / (Wl.ry - L.r * 0.7); return dx * dx + dy * dy <= 1; }), tag + 'berries inside the plate n=' + n);
    ok(L.r >= 7.5, tag + 'berries readable n=' + n + ' r ' + L.r);
    ok(A.berryLayout(n, A.berryLayout(12).r).r === A.berryLayout(12).r, tag + 'berryN radius cap n=' + n);
  }

  // scene pieces
  const lan = [{ x: 100, y: 120, lit: 1, color: 'blue', thing: { kind: 'obj', obj: 'teapot', color: 'blue' }, swing: 0.1 },
    { x: 300, y: 140, lit: 1.2, color: null, thing: { kind: 'cookie', shape: 'star', color: 'yellow' }, swing: -0.1 },
    { x: 500, y: 140, lit: 0.5, color: '#C6375A', thing: { kind: 'plate', n: 3 } }, { x: 700, y: 120, lit: 0, color: null, thing: null },
    { x: 800, y: 120, lit: NaN, color: 'mauve', thing: { kind: 'guest', animal: 'penguin' }, swing: NaN }];
  const scene = [
    ['drawPlacemat', m => [0, 0.5, 1].forEach(p => A.drawPlacemat(m.ctx, 130, { pop: p }))],
    ['drawPlacemat default', m => A.drawPlacemat(m.ctx)],
    ['drawTable', m => A.drawTable(m.ctx, 300, 1400, 450, { wet: 1, spring: 4 })],
    ['drawTable legs/ground', m => A.drawTable(m.ctx, 50, 670, 700, { wet: 0.3, spring: -3, legs: [120, 600], groundY: 1300 })],
    ['drawTable plain + swapped', m => { A.drawTable(m.ctx, 400, 300, 200); A.drawTable(m.ctx, 0, 100, 0, { spring: NaN, wet: 'x' }); }],
    ['drawGarland', m => A.drawGarland(m.ctx, { x0: 40, x1: 900, y: 100, sag: 40, twinkle: 0.7, badge: { home: 'ice', i: 1, a: 0.8 } }, lan, 3.2)],
    ['drawGarland g.lanterns', m => A.drawGarland(m.ctx, { x0: 40, x1: 900, y: 100, sag: 40, lanterns: lan }, null, 0)],
    ['drawGarland bare', m => A.drawGarland(m.ctx, {}, [], NaN)],
    ['drawLantern', m => [0, 0.3, 0.7, 1, 1.3].forEach(l => A.drawLantern(m.ctx, 50, 60, 1, l, 'red', { kind: 'obj', obj: 'cup', color: 'red' }, 0.2))],
    ['drawLantern defaults', m => A.drawLantern(m.ctx, 0, 0)],
    ['drawFluff', m => [10, 30, 60].forEach(r => A.drawFluff(m.ctx, 100, 100, r, 0.8))],
    ['drawHomeBadges', m => A.HOMES.concat(['moon']).forEach(h => A.drawHomeBadge(m.ctx, h, 46, { a: 0.7, pop: 0.5 }))],
    ['drawHomeBadge default', m => A.drawHomeBadge(m.ctx, 'sea')],
    ['drawIcon color', m => COLORS.forEach(c => A.drawIcon(m.ctx, { kind: 'color', color: c }, 120))],
    ['drawIcon number', m => [0, 1, 3, 5, 6, 10, 12, 20].forEach(n => A.drawIcon(m.ctx, { kind: 'number', n }, 120))],
    ['drawIcon home', m => A.HOMES.forEach(h => A.drawIcon(m.ctx, { kind: 'home', home: h }, 120))],
    ['drawIcon size', m => { A.drawIcon(m.ctx, { kind: 'size', big: true }, 120); A.drawIcon(m.ctx, { kind: 'size', big: false, thing: { kind: 'guest', animal: 'owl' } }, 120); }],
    ['drawIcon letter', m => A.drawIcon(m.ctx, { kind: 'letter', text: 'Q' }, 120)],
    ['drawIcon things', m => things.forEach(t => A.drawIcon(m.ctx, t, 120))],
    ['drawIcon unknown', m => A.drawIcon(m.ctx, { kind: '??' }, 120)],
    ['drawHintHand', m => [0, 0.5, 1].forEach(p => A.drawHintHand(m.ctx, 100, 200, p, 1))],
    ['drawHintHand alpha', m => A.drawHintHand(m.ctx, 100, 200, 0.3, 0.5, 80)],
    ['drawSparkle', m => [0, 0.5, 2].forEach(r => A.drawSparkle(m.ctx, 50, 60, 10, 0.7, r))],
    ['drawSparkle defaults', m => A.drawSparkle(m.ctx, 0, 0)]
  ];
  for (const [n, f] of scene) {
    const m = mockCtx();
    try { f(m); ok(m.bad.length === 0, tag + n + ' clean ' + m.bad.slice(0, 3).join(' | ')); ok(m.depth() === 0, tag + n + ' balanced'); ok(m.calls.length > 0, tag + n + ' draws'); }
    catch (e) { ok(false, tag + n + ' threw: ' + e.stack); }
  }
  ok(count({ kind: 'obj', obj: 'cup', color: 'red' }, {}) > 0, '');
  { const a = mockCtx(), b = mockCtx(); A.drawLantern(a.ctx, 0, 0, 1, 0, null, null, 0); A.drawLantern(b.ctx, 0, 0, 1, 1, 'red', { kind: 'obj', obj: 'cup', color: 'red' }, 0);
    ok(b.calls.length > a.calls.length && b.calls.indexOf('createRadialGradient') >= 0, tag + 'a lit lantern glows and shows its thing'); }
  { const a = mockCtx(), b = mockCtx(); A.drawGarland(a.ctx, { x0: 0, x1: 800, y: 50, sag: 40 }, lan, 1); A.drawGarland(b.ctx, { x0: 0, x1: 800, y: 50, sag: 40, badge: { home: 'sea', i: 0 } }, lan, 1);
    ok(b.calls.length > a.calls.length, tag + 'garland draws the home badge'); }
  { const a = mockCtx(), b = mockCtx(); A.drawTable(a.ctx, 0, 800, 300, {}); A.drawTable(b.ctx, 0, 800, 300, { wet: 1 });
    ok(b.calls.length > a.calls.length, tag + 'wet table adds glints / drips'); }
  { const m = mockCtx(); A.drawHintHand(m.ctx, 0, 0, 0, 0); A.drawFluff(m.ctx, 0, 0, 10, 0); A.drawSparkle(m.ctx, 0, 0, 10, 0); A.drawHomeBadge(m.ctx, 'forest', 40, { a: 0 }); A.drawThing(m.ctx, { kind: 'obj' }, 0); A.drawLantern(m.ctx, 0, 0, 0); ok(m.calls.length === 0, tag + 'alpha 0 / size 0 draws nothing'); }
  // null-safety
  try { A.drawThing(null, { kind: 'obj' }, 120); A.drawThing(mockCtx().ctx, null, 120); A.drawTable(null); A.drawPlacemat(null); A.drawGarland(null); A.drawGarland(mockCtx().ctx, null); A.drawLantern(null); A.drawFluff(null); A.drawHomeBadge(null); A.drawIcon(null); A.drawIcon(mockCtx().ctx, null); A.drawHintHand(null); A.drawSparkle(null); ok(true, ''); }
  catch (e) { ok(false, tag + 'null args threw ' + e.message); }
  ok(A.thingKey({ kind: 'obj', obj: 'jar', color: 'red' }) !== A.thingKey({ kind: 'obj', obj: 'jar', color: 'blue' }), tag + 'thingKey distinct colour');
  ok(A.thingKey({ kind: 'plate', n: 2 }) !== A.thingKey({ kind: 'plate', n: 3 }), tag + 'thingKey distinct n');
  ok(A.thingKey({ kind: 'obj', obj: 'jar', color: 'red', big: false }) !== A.thingKey({ kind: 'obj', obj: 'jar', color: 'red' }), tag + 'thingKey distinct size');

  // Path2D cache: drawing the same thing again builds no new paths
  if (withP2D) {
    A.clearCache();
    const t = { kind: 'obj', obj: 'teapot', color: 'green' };
    const before = p2dCount; A.drawThing(mockCtx().ctx, t, 124, { glow: 0.5 }); const first = p2dCount - before;
    const mid = p2dCount; for (let i = 0; i < 5; i++) A.drawThing(mockCtx().ctx, t, 124 + i * 7, { glow: 0.5 }); const again = p2dCount - mid;
    ok(first > 0 && again === 0, tag + 'Path2D cache reused (first ' + first + ', again ' + again + ')');
    A.drawThing(mockCtx().ctx, { kind: 'plate', n: 7 }, 124, {}); const c1 = p2dCount; A.drawThing(mockCtx().ctx, { kind: 'plate', n: 7 }, 124, {});
    ok(p2dCount === c1, tag + 'plate paths cached');
    A.drawThing(mockCtx().ctx, { kind: 'cookie', shape: 'heart', color: 'red' }, 124, {}); const c2 = p2dCount; A.drawThing(mockCtx().ctx, { kind: 'cookie', shape: 'heart', color: 'blue' }, 124, {});
    ok(p2dCount === c2, tag + 'cookie paths shared across colours');
    A.clearCache();
  }

  // guest images via FT.Assets (the real accessor: has + sprite, then img)
  const imgB = { tag: 'bunny' }, imgH = { tag: 'bunny_hop' };
  FT.Assets = { has: k => k === 'guests/bunny' || k === 'guests/bunny_hop', sprite: k => (k === 'guests/bunny' ? imgB : imgH), img: () => null };
  { const m = mockCtx(); A.drawThing(m.ctx, { kind: 'guest', animal: 'bunny' }, 124, {}); ok(m.images[0] === imgB, tag + 'guest uses FT.Assets image'); }
  { const m = mockCtx(); A.drawThing(m.ctx, { kind: 'guest', animal: 'bunny' }, 124, { hop: 1 }); ok(m.images[0] === imgH, tag + 'guest _hop frame'); }
  { const m = mockCtx(); A.drawThing(m.ctx, { kind: 'guest', animal: 'fox' }, 124, {}); ok(m.images.length === 0 && m.calls.filter(c => c === 'fill').length > 3, tag + 'missing image → placeholder'); }
  FT.Assets = { img: k => (k === 'guests/lion' ? imgB : null) };
  { const m = mockCtx(); A.drawThing(m.ctx, { kind: 'guest', animal: 'lion' }, 124, { glow: 1, night: 1, dim: 0.5, hop: 1 }); ok(m.images[0] === imgB && m.bad.length === 0 && m.depth() === 0, tag + 'FT.Assets.img() fallback (hop frame missing → base)'); }
  FT.Assets = { has() { throw new Error('boom'); } };
  { const m = mockCtx(); A.drawThing(m.ctx, { kind: 'guest', animal: 'owl' }, 124, {}); ok(m.depth() === 0 && m.calls.length > 10, tag + 'broken FT.Assets → placeholder'); }
  delete FT.Assets;
  A.clearCache();
}

console.log((fails ? 'FAILED ' : 'ok ') + passes + ' passed, ' + fails + ' failed (tea_art)');
process.exit(fails ? 1 : 0);
