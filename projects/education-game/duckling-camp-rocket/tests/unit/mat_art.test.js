// Mimi's Splash Rocket — unit test for DK.MatArt (game/js/mat_art.js), plain node, no browser, no deps.
// A recording mock 2D context checks every call; Path2D is stubbed. Checks: public API (DESIGN §4.3), exact palette + mat
// hex, outline contrast on the oatmeal mat, every thing kind / obj / colour / shape / dots n 1–12 (± numeral) / tile / animal /
// icon / pennant / mat option extreme draws without throwing and actually draws, no NaN / Infinity / undefined reaches the
// context, save/restore balanced, pinecone layouts separate + inside the sign, mat options visibly change the drawing, Path2D
// cache reused, animal images via DK.Assets, node-safe load.
// Run: node tests/unit/mat_art.test.js   (exit code 1 on any failure)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

let fails = 0, passes = 0;
function ok(cond, msg) { if (cond) passes++; else { fails++; console.error('FAIL', msg); } }

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'game', 'js', 'mat_art.js'), 'utf8');

function mockCtx() {
  const calls = [], bad = [], images = [], args = [];
  const grad = () => ({ addColorStop(o, c) { if (!(o >= 0 && o <= 1)) bad.push('stop ' + o); if (/NaN|undefined|Infinity/.test(c)) bad.push('colour ' + c); } });
  const state = { globalAlpha: 1, lineWidth: 1, fillStyle: '#000', strokeStyle: '#000', font: '10px x', textAlign: 'left', lineDashOffset: 0,
    textBaseline: 'alphabetic', lineJoin: 'miter', lineCap: 'butt', shadowColor: '', shadowBlur: 0, shadowOffsetY: 0, globalCompositeOperation: 'source-over' };
  const stack = [];
  const ctx = new Proxy(state, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'save') return () => { calls.push('save'); stack.push(Object.assign({}, t)); };
      if (k === 'restore') return () => { calls.push('restore'); const s = stack.pop(); if (!s) bad.push('restore without save'); else Object.assign(t, s); };
      if (k === 'createRadialGradient' || k === 'createLinearGradient' || k === 'createConicGradient') return (...a) => {
        if (a.some(v => !isFinite(v))) bad.push(k + ' NaN'); if (k === 'createRadialGradient' && (a[2] < 0 || a[5] < 0)) bad.push('radial negative r'); calls.push(k); return grad(); };
      if (k === 'measureText') return (s) => ({ width: String(s).length * 50 });
      if (k === 'setLineDash') return (a) => { if (a.some(v => !isFinite(v) || v < 0)) bad.push('dash ' + a); };
      if (k === 'drawImage') return (...a) => { calls.push('drawImage'); images.push(a[0]); if (a.slice(1).some(v => !isFinite(v))) bad.push('drawImage NaN'); };
      return (...a) => {
        calls.push(k); args.push([k, a]);
        if (a.some(v => (typeof v === 'number' && !isFinite(v)) || v === undefined && k !== 'fill' && k !== 'stroke' && k !== 'clip')) bad.push(k + '(' + a.join(',') + ')');
        if ((k === 'arc' && a[2] < 0) || (k === 'ellipse' && (a[2] < 0 || a[3] < 0))) bad.push(k + ' negative radius ' + a.join(','));
        if (k === 'fillText' && /undefined|NaN/.test(String(a[0]))) bad.push('fillText ' + a[0]);
      };
    },
    set(t, k, v) {
      if (typeof v === 'number' && !isFinite(v)) bad.push('set ' + String(k) + ' NaN');
      if (v === undefined || (typeof v === 'string' && /NaN|undefined|Infinity/.test(v))) bad.push('set ' + String(k) + ' ' + v);
      if (k === 'globalAlpha' && (v < 0 || v > 1)) bad.push('globalAlpha ' + v);
      t[k] = v; return true;
    }
  });
  return { ctx, calls, bad, images, args, depth: () => stack.length };
}

let p2dCount = 0;
function load(withPath2D, extra) {
  const sb = Object.assign({ console, Math }, extra || {});
  sb.window = sb;
  if (withPath2D) sb.Path2D = function () { p2dCount++; const p = this; ['moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'arc', 'ellipse', 'closePath', 'rect'].forEach(m => { p[m] = () => {}; }); };
  vm.createContext(sb);
  vm.runInContext(SRC, sb, { filename: 'mat_art.js' });
  return sb;
}
function run(f) { const m = mockCtx(); let err = null; try { f(m); } catch (e) { err = e; } return { m, err }; }
function clean(tag, name, f, minCalls) {
  const { m, err } = run(f);
  ok(!err, tag + name + ' threw ' + (err && err.stack));
  ok(m.bad.length === 0, tag + name + ' clean ' + m.bad.slice(0, 3).join(' | '));
  ok(m.depth() === 0, tag + name + ' save/restore balanced');
  ok(m.calls.length >= (minCalls == null ? 1 : minCalls), tag + name + ' draws (' + m.calls.length + ')');
  return m;
}

// node-safe load: no window / document (plain global), keeps an existing DK, no DOM touched at load
try {
  const sb = { console, Math }; sb.global = sb; vm.createContext(sb); vm.runInContext(SRC, sb);
  ok(sb.DK && sb.DK.MatArt, 'loads with no window (global fallback)');
  const sb2 = load(false, { DK: { keep: 1 } });
  ok(sb2.DK.keep === 1 && sb2.DK.MatArt, 'keeps an existing DK namespace');
  let touched = false;
  const sb3 = { console, Math }; sb3.window = sb3;
  Object.defineProperty(sb3, 'document', { get() { touched = true; return undefined; } });
  vm.createContext(sb3); vm.runInContext(SRC, sb3);
  ok(!touched, 'no document access at load');
} catch (e) { ok(false, 'node-safe load threw: ' + e.message); }

const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
for (const withP2D of [false, true]) {
  const sb = load(withP2D), DK = sb.DK, A = DK && DK.MatArt, tag = withP2D ? '[Path2D] ' : '[no Path2D] ';
  ok(!!A, tag + 'DK.MatArt exists');
  if (!A) continue;
  ['drawMat', 'drawThing', 'drawPennant', 'drawPole', 'drawPad', 'drawPump', 'drawArc', 'drawDrop', 'drawPuddleRing', 'drawHomeBadge',
    'drawIcon', 'drawHintHand', 'drawBurrow', 'drawRock', 'dotLayout', 'thingTop', 'pennantH', 'rockTop', 'matRy', 'pumpHose',
    'pal', 'lineOf', 'contrast', 'thingKey', 'clearCache'].forEach(f => ok(typeof A[f] === 'function', tag + 'function ' + f));
  const want = { red: '#E84A4A/#A8282E/#F7A0A0', blue: '#3C8DE8/#1F5BA8/#A6CCF5', yellow: '#FFD23F/#C99A12/#FFEB9C',
    green: '#4CC26B/#2A8343/#A8E6B8', orange: '#FF9A2E/#C4650C/#FFCB8E', purple: '#8E44AD/#6840A8/#D2BDF3', pink: '#FF8FC0/#C9558A/#FFCCE2' };
  COLORS.forEach(c => { const p = A.PALETTE[c]; ok(p && [p.base, p.dark, p.light].join('/') === want[c], tag + 'palette ' + c); });
  ok(A.MAT.top === '#EFE2C6' && A.MAT.ring === '#CDB68E' && A.MAT.line === '#9C8763' && A.GOLD === '#F4D27A', tag + 'mat hex (DESIGN §3)');
  ok(A.SIGN.base === '#F3E6CC' && A.SIGN.line === '#9C7A5A' && A.CONE.base === '#8A5E3B', tag + 'sign + pinecone hex');
  ok(A.OBJS.join() === 'flower,mushroom,ball,mug,lantern', tag + 'objs');
  ok(A.SHAPES.join() === 'circle,square,triangle,star,heart,oval,rect,diamond', tag + 'shapes');
  ok(A.HOMES.join() === 'farm,sea,ice,jungle,savanna', tag + 'homes');
  ok(A.KINDS.join() === 'obj,shape,dots,tile,animal', tag + 'kinds');
  ok(A.SMALL === 0.6, tag + 'small = 0.6');
  ok(A.pal('red').base === '#E84A4A' && A.pal('nope') === null, tag + 'pal lookup (fallback while DK.PALETTE is undefined)');
  DK.PALETTE = { red: { base: '#123456', dark: '#000000', light: '#FFFFFF' }, blue: { base: 'oops' } };
  ok(A.pal('red').base === '#123456' && A.pal('blue').base === '#3C8DE8', tag + 'DK.PALETTE used when valid, fallback when broken');
  delete DK.PALETTE;
  COLORS.forEach(c => { const l = A.lineOf(c), k = A.contrast(l, A.MAT.top); ok(k >= 3, tag + 'outline contrast on the mat ' + c + ' ' + l + ' ' + k.toFixed(2) + ':1'); });
  ok(A.contrast(A.CONE.base, A.SIGN.base) >= 4.5, tag + 'pinecones contrast on the sign ' + A.contrast(A.CONE.base, A.SIGN.base).toFixed(2));
  ok(A.contrast('#FFFFFF', '#000000') > 20.9, tag + 'contrast formula');

  const things = [].concat(
    ...A.OBJS.map(o => COLORS.map(c => ({ kind: 'obj', obj: o, color: c }))),
    [{ kind: 'obj' }, { kind: 'obj', obj: 'rocket', color: 'mauve' }],
    ...A.SHAPES.map(s => COLORS.map(c => ({ kind: 'shape', shape: s, color: c }))), [{ kind: 'shape', shape: 'blob' }],
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 0, 13, -2, NaN].map(n => ({ kind: 'dots', n })),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => ({ kind: 'dots', n, numeral: true })),
    ['A', 'a', 'Đ', '3+2', '7−4', '7-4', '10+10', '12−5', '20', '9', '', 'WWWWWWWW'].map(text => ({ kind: 'tile', text })), [{ kind: 'tile', n: 15 }, { kind: 'tile' }],
    A.ANIMALS.concat(['dragon']).map(a => ({ kind: 'animal', animal: a })),
    [{ kind: 'obj', obj: 'mug', color: 'green', big: false }, { kind: 'animal', animal: 'sheep', big: false }, { kind: 'dots', n: 3, big: false }, { kind: 'mystery' }]
  );
  const opts = [{}, { glow: 1 }, { glow: 0.4, wiggle: -1 }, { wiggle: 0.5, rot: 0.1 }, { alpha: 0.5 }, { count: 0 }, { count: 3 }, { count: 99 }, { shadow: false },
    { direct: true }, { numeral: true }, { glow: NaN, wiggle: 'x', count: 'y', alpha: NaN, rot: NaN }, { glow: Infinity, wiggle: -Infinity, alpha: Infinity }];
  for (const t of things) {
    for (const o of opts) {
      const { m, err } = run(m => A.drawThing(m.ctx, t, 105, o));
      if (err) { ok(false, tag + 'drawThing threw ' + JSON.stringify(t) + ' ' + JSON.stringify(o) + ': ' + err.stack); continue; }
      ok(m.bad.length === 0, tag + 'clean calls ' + JSON.stringify(t) + ' ' + JSON.stringify(o) + ' ' + m.bad.slice(0, 3).join(' | '));
      ok(m.depth() === 0, tag + 'save/restore balanced ' + JSON.stringify(t));
      ok(m.calls.filter(c => c === 'fill').length >= 2, tag + 'draws something ' + JSON.stringify(t) + ' ' + JSON.stringify(o));
    }
    const h = A.thingTop(t, 105);
    ok(h > 40 && h < (t.kind === 'dots' && t.n >= 7 && !t.numeral ? 175 : 135), tag + 'thingTop sane ' + JSON.stringify(t) + ' ' + h);
    // pennants for every thing, flutter extremes, both directions
    for (const po of [{}, { flutter: 1, t: 2.3 }, { flutter: 0.5, t: 0, dir: -1 }, { flutter: NaN, t: NaN, alpha: NaN }, { flutter: Infinity, t: -Infinity }]) {
      const { m, err } = run(m => A.drawPennant(m.ctx, t, 72, po));
      ok(!err && m.bad.length === 0 && m.depth() === 0 && m.calls.length > 10, tag + 'drawPennant ' + JSON.stringify(t) + ' ' + JSON.stringify(po) + ' ' + (err ? err.stack : m.bad.slice(0, 3).join(' | ')));
    }
  }
  const count = (f, what) => { const { m } = run(f); return what ? m.calls.filter(c => c === what).length : m.calls.length; };
  ok(count(m => A.drawThing(m.ctx, { kind: 'dots', n: 4 }, 105, { count: 4 })) > count(m => A.drawThing(m.ctx, { kind: 'dots', n: 4 }, 105, {})), tag + 'count rings pinecones');
  ok(count(m => A.drawThing(m.ctx, { kind: 'obj', obj: 'mug', color: 'red' }, 105, { glow: 1 })) > count(m => A.drawThing(m.ctx, { kind: 'obj', obj: 'mug', color: 'red' }, 105, {})), tag + 'glow adds a halo');
  ok(count(m => A.drawThing(m.ctx, { kind: 'tile', text: 'A' }, 105, {}), 'fillText') >= 1, tag + 'tile draws its text');
  ok(count(m => A.drawThing(m.ctx, { kind: 'dots', n: 3, numeral: true }, 105, {}), 'fillText') === 1 && count(m => A.drawThing(m.ctx, { kind: 'dots', n: 3 }, 105, {}), 'fillText') === 0, tag + 'numeral only when asked');
  ok(count(m => A.drawThing(m.ctx, { kind: 'dots', n: 3 }, 105, { numeral: true }), 'fillText') === 1, tag + 'opt.numeral adds the numeral');
  ok(count(m => A.drawThing(m.ctx, { kind: 'obj', obj: 'ball' }, 105, {})) > count(m => A.drawThing(m.ctx, { kind: 'obj', obj: 'ball' }, 105, { shadow: false })), tag + 'contact shadow on by default');
  ok(count(m => A.drawPennant(m.ctx, { kind: 'dots', n: 4 }, 72, {}), 'fillText') === 1, tag + 'dots pennant shows its numeral');
  { // the pennant IS the thing's colour (colour things), cream otherwise
    const fills = (t) => { const { m } = run(() => {}); const seen = []; const px = new Proxy(m.ctx, { set(o, k, v) { if (k === 'fillStyle') seen.push(v); o[k] = v; return true; }, get(o, k) { return o[k]; } }); A.drawPennant(px, t, 72, {}); return seen; };
    ok(fills({ kind: 'obj', obj: 'mug', color: 'blue' }).indexOf('#3C8DE8') >= 0, tag + 'blue mug → blue pennant');
    ok(fills({ kind: 'shape', shape: 'star', color: 'orange' }).indexOf('#FF9A2E') >= 0, tag + 'orange star → orange pennant');
    ok(fills({ kind: 'animal', animal: 'cow' }).indexOf('#F6EEDC') >= 0, tag + 'animal → cream pennant');
  }
  { // small = ×0.6, wiggle rotates ±0.3 about the base, things stand on the origin (drawn above it)
    const sc = [], rot = [], ys = [];
    const { m } = run(() => {});
    const px = new Proxy(m.ctx, { get(t, k) { if (k === 'scale') return (x) => { sc.push(x); }; if (k === 'rotate') return (a) => { rot.push(a); }; if (k === 'translate') return (x, y) => { ys.push(y); }; return t[k]; }, set(t, k, v) { t[k] = v; return true; } });
    A.drawThing(px, { kind: 'obj', obj: 'ball', color: 'red', big: false }, 100, {});
    ok(Math.abs(sc[0] - 0.6) < 1e-9, tag + 'big:false scales by 0.6 (' + sc[0] + ')');
    ok(ys[0] < -40, tag + 'thing shifted up so its foot sits on the origin (' + ys[0] + ')');
    A.drawThing(px, { kind: 'obj', obj: 'ball', color: 'red' }, 100, { wiggle: 1 });
    ok(rot.some(a => Math.abs(a - 0.3) < 1e-9), tag + 'wiggle 1 rotates 0.3 rad');
  }

  // pinecone layouts: n cones, clearly separate (gap ≥ 0.6 r), inside the sign, readable on a phone
  for (let n = 1; n <= 12; n++) {
    for (const numeral of [false, true]) {
      const L = A.dotLayout(n, numeral);
      ok(L.n === n && L.pts.length === n, tag + 'layout n=' + n);
      let gap = 1e9;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) gap = Math.min(gap, Math.hypot(L.pts[i][0] - L.pts[j][0], L.pts[i][1] - L.pts[j][1]) - 2 * L.rs);
      ok(n === 1 || gap >= 0.6 * L.rs, tag + 'pinecones separate n=' + n + (numeral ? ' +N' : '') + ' gap ' + gap.toFixed(2));
      if (!numeral) ok(L.pts.every(p => Math.hypot(p[0], p[1] + 59) + L.rs <= 35), tag + 'pinecones inside the disc n=' + n);
      else ok(L.pts.every(p => Math.abs(p[0]) + L.rs <= 37 && p[1] - L.rs >= -60 && p[1] + L.rs <= -21), tag + 'pinecones inside the tablet n=' + n);
      // phone: itemH ≈ 0.62·148 ≈ 92 logical → ×0.92; cone height (2 r) ≥ 10 logical px
      ok(2 * L.rs * 0.92 >= (numeral && n > 8 ? 9 : 10), tag + 'pinecones readable n=' + n + (numeral ? ' +N' : '') + ' d ' + (2 * L.rs * 0.92).toFixed(1));
      for (let i = 1; i < n; i++) ok(L.pts[i][1] > L.pts[i - 1][1] - 1e-6 || L.pts[i][0] > L.pts[i - 1][0], tag + 'reading order n=' + n);
    }
  }

  // mats: every option and its extremes, 4 variants, sizes
  const mopts = [{}, { seed: 3 }, { seed: 0.734 }, { seed: -17 }, { unfold: 0 }, { unfold: 0.01 }, { unfold: 0.3 }, { unfold: 0.5, flap: 1 }, { unfold: 0.999 }, { unfold: 1.25 }, { unfold: 9 }, { unfold: -3 },
    { flap: 1 }, { flap: -1, t: 0.4 }, { flap: 5 }, { squish: 1 }, { squish: -0.5 }, { squish: -9 }, { squish: 1, flap: 0.6 }, { gold: 0.3 }, { gold: 1 }, { gold: 1, squish: 0.5 },
    { glow: 1 }, { glow: 0.5, active: 1 }, { active: 1, t: 3.2 }, { active: 0.5, unfold: 0.2 }, { wet: 1 }, { wet: 0.5, gold: 1 }, { alpha: 0.5 }, { alpha: 1, unfold: 1, flap: 0, squish: 0, gold: 1, glow: 1, active: 1, wet: 1 },
    { seed: NaN, unfold: NaN, flap: 'x', squish: NaN, gold: NaN, glow: undefined, wet: 'y', alpha: NaN, active: NaN, t: NaN },
    { seed: Infinity, unfold: Infinity, flap: -Infinity, squish: Infinity, gold: Infinity, glow: Infinity, active: Infinity, wet: Infinity, t: Infinity }];
  for (const o of mopts) for (const S of [170, 139, 510, 20]) {
    const { m, err } = run(m => A.drawMat(m.ctx, S, o));
    ok(!err, tag + 'drawMat threw ' + JSON.stringify(o) + (err ? err.stack : ''));
    ok(m.bad.length === 0 && m.depth() === 0 && m.calls.length > 10, tag + 'drawMat clean ' + S + ' ' + JSON.stringify(o) + ' ' + m.bad.slice(0, 3).join(' | '));
  }
  for (let v = 0; v < 8; v++) { const { m, err } = run(m => A.drawMat(m.ctx, 170, { seed: v })); ok(!err && m.bad.length === 0 && m.depth() === 0, tag + 'mat variant ' + v); }
  ok(A.variant(3) === A.variant(7) && A.variant(3) !== A.variant(4) && A.variant(0.5) >= 0 && A.variant(0.5) < 4, tag + 'variant mapping');
  const base = count(m => A.drawMat(m.ctx, 170, {}));
  ['gold', 'glow', 'active', 'wet'].forEach(k => ok(count(m => A.drawMat(m.ctx, 170, { [k]: 1 })) > base, tag + k + ' adds an overlay'));
  ok(count(m => A.drawMat(m.ctx, 170, { flap: 0.8 })) > base, tag + 'flap draws the cloth wave (strips)');
  ok(count(m => A.drawMat(m.ctx, 170, { unfold: 0.4 })) !== base, tag + 'unfold draws the roll');
  { // squish: wider + flatter; unfold 0: a tube on the left (no face beyond it)
    const sc = [];
    const { m } = run(() => {});
    const px = new Proxy(m.ctx, { get(t, k) { if (k === 'scale') return (x, y) => { sc.push([x, y]); }; return t[k]; }, set(t, k, v) { t[k] = v; return true; } });
    A.drawMat(px, 100, { squish: 1 });
    ok(sc.some(s => s[0] > 1.1 && s[1] < 0.8), tag + 'squish 1 → wider + flatter ' + JSON.stringify(sc));
    const rects = []; const { m: m2 } = run(() => {});
    const px2 = new Proxy(m2.ctx, { get(t, k) { if (k === 'rect') return (x, y, w) => { rects.push(x + w); }; return t[k]; }, set(t, k, v) { t[k] = v; return true; } });
    A.drawMat(px2, 100, { unfold: 0 });
    ok(rects.length && Math.max.apply(null, rects) < -20, tag + 'unfold 0 keeps the flat part to the left edge (' + Math.max.apply(null, rects).toFixed(1) + ')');
  }
  ok(count(m => A.drawMat(m.ctx, 170, { alpha: 0 })) === 0 && count(m => A.drawMat(m.ctx, 0, {})) === 0, tag + 'alpha 0 / S 0 draws nothing');

  // camp props
  const arc = []; for (let i = 0; i < 14; i++) arc.push({ x: 200 + i * 30, y: 500 - Math.sin(i / 13 * Math.PI) * 260 });
  const scene = [
    ['drawPole', m => [[0], [2.4], [NaN]].forEach(q => A.drawPole(m.ctx, 60, 650, 300, { t: q[0] }))],
    ['drawPole short/odd', m => { A.drawPole(m.ctx, 60, 650, 640); A.drawPole(m.ctx, 60, 650, NaN); A.drawPole(m.ctx, NaN, NaN, NaN, {}); }],
    ['drawPad', m => [0, 0.6, -0.6, 2, -2, NaN, Infinity].forEach(aim => A.drawPad(m.ctx, 200, 600, { aim, hose: A.pumpHose(160, 620) }))],
    ['drawPad hose right / none / bad', m => { A.drawPad(m.ctx, 360, 600, { hose: { x: 470, y: 670 } }); A.drawPad(m.ctx, 360, 600); A.drawPad(m.ctx, 360, 600, { hose: { x: NaN, y: 'a' }, alpha: 0.5 }); }],
    ['drawPump', m => [{}, { press: 1 }, { press: 0.5, glow: 1, gauge: 0.66, count: 2 }, { gauge: 1, count: 3 }, { count: 9, gauge: -2, press: 7 }, { press: NaN, glow: NaN, gauge: NaN, count: NaN, alpha: NaN }, { press: Infinity, gauge: Infinity, count: Infinity }].forEach(o => A.drawPump(m.ctx, 160, 620, o))],
    ['drawArc', m => { A.drawArc(m.ctx, arc, { t: 1.2, alpha: 0.8 }); A.drawArc(m.ctx, arc.map(p => [p.x, p.y]), {}); A.drawArc(m.ctx, [{ x: 1, y: 2 }]); A.drawArc(m.ctx, [{ x: NaN, y: 1 }, null, { x: 5, y: 5 }], { t: NaN, alpha: NaN }); }],
    ['drawDrop', m => [1, 4, 8].forEach(r => A.drawDrop(m.ctx, 10, 20, r, 0.7))],
    ['drawPuddleRing', m => [[10, 1], [60, 0.5], [200, 0.2], [30, NaN]].forEach(q => A.drawPuddleRing(m.ctx, 10, 20, q[0], q[1]))],
    ['drawBurrow', m => [20, 40, 90].forEach(r => A.drawBurrow(m.ctx, 300, 400, r))],
    ['drawRock', m => [60, 120, 240].forEach(w => A.drawRock(m.ctx, 300, 400, w))],
    ['drawHomeBadges', m => A.HOMES.concat(['moon']).forEach(h => A.drawHomeBadge(m.ctx, h, 46, { a: 0.7, pop: 0.5 }))],
    ['drawHomeBadge default', m => A.drawHomeBadge(m.ctx, 'sea')],
    ['drawIcon color', m => COLORS.concat(['mauve']).forEach(c => A.drawIcon(m.ctx, { kind: 'color', color: c }, 120))],
    ['drawIcon number', m => [0, 1, 3, 5, 6, 10, 12, 20, NaN].forEach(n => A.drawIcon(m.ctx, { kind: 'number', n }, 120))],
    ['drawIcon home', m => A.HOMES.forEach(h => A.drawIcon(m.ctx, { kind: 'home', home: h }, 120))],
    ['drawIcon size', m => { A.drawIcon(m.ctx, { kind: 'size', big: true }, 120); A.drawIcon(m.ctx, { kind: 'size', big: false }, 120); A.drawIcon(m.ctx, { kind: 'size', big: false, thing: { kind: 'animal', animal: 'pig' } }, 120); }],
    ['drawIcon letter', m => A.drawIcon(m.ctx, { kind: 'letter', text: 'Q' }, 120)],
    ['drawIcon things', m => things.forEach(t => A.drawIcon(m.ctx, t, 120))],
    ['drawIcon unknown', m => A.drawIcon(m.ctx, { kind: '??' }, 120)],
    ['drawHintHand', m => [0, 0.5, 1].forEach(p => A.drawHintHand(m.ctx, 100, 200, p, 1))],
    ['drawHintHand alpha', m => A.drawHintHand(m.ctx, 100, 200, 0.3, 0.5, 80)]
  ];
  for (const [n, f] of scene) clean(tag, n, f, 5);
  ok(count(m => A.drawPump(m.ctx, 0, 0, { count: 3 })) > count(m => A.drawPump(m.ctx, 0, 0, { count: 0 })), tag + 'pump count lights');
  ok(count(m => A.drawPump(m.ctx, 0, 0, { glow: 1 })) > count(m => A.drawPump(m.ctx, 0, 0, {})), tag + 'pump glow');
  { // press moves the foot pad down; gauge moves the needle; aim rotates the tube
    const tr = []; const { m } = run(() => {});
    const px = new Proxy(m.ctx, { get(t, k) { if (k === 'translate') return (x, y) => { tr.push(y); }; if (k === 'rotate') return (a) => { tr.push('r' + a); }; return t[k]; }, set(t, k, v) { t[k] = v; return true; } });
    A.drawPump(px, 0, 0, { press: 1 }); ok(tr.indexOf(13) >= 0, tag + 'press 1 → pad 13 px down');
    tr.length = 0; A.drawPad(px, 0, 0, { aim: 0.5 }); ok(tr.indexOf('r0.5') >= 0, tag + 'aim rotates the launcher tube');
    const lt = (g) => { const { m } = run(m => A.drawPump(m.ctx, 0, 0, { gauge: g })); return JSON.stringify(m.args.filter(a => a[0] === 'lineTo')); };
    ok(lt(0) !== lt(1), tag + 'gauge moves the needle');
  }
  ok(A.pennantH(72) > 40 && A.pennantH(72) < 46, tag + 'pennant fits the 46 px slot pitch');
  ok(A.rockTop(120) > 40 && A.rockTop(120) < 60 && A.matRy(170) > 70 * 0.5 && A.matRy(170) < 0.43 * 170, tag + 'rockTop / matRy');
  const hz = A.pumpHose(160, 620); ok(isFinite(hz.x) && isFinite(hz.y) && hz.y > 620, tag + 'pumpHose');
  ok(count(m => { A.drawHintHand(m.ctx, 0, 0, 0, 0); A.drawDrop(m.ctx, 0, 0, 3, 0); A.drawPuddleRing(m.ctx, 0, 0, 10, 0); A.drawHomeBadge(m.ctx, 'farm', 40, { a: 0 }); A.drawThing(m.ctx, { kind: 'obj' }, 0);
    A.drawThing(m.ctx, { kind: 'obj' }, 90, { alpha: 0 }); A.drawPennant(m.ctx, { kind: 'obj' }, 0); A.drawPennant(m.ctx, { kind: 'obj' }, 70, { alpha: 0 }); A.drawPump(m.ctx, 0, 0, { alpha: 0 }); A.drawPad(m.ctx, 0, 0, { alpha: 0 });
    A.drawArc(m.ctx, [], {}); A.drawArc(m.ctx, [{ x: 1, y: 1 }], { alpha: 0 }); A.drawBurrow(m.ctx, 0, 0, 0); A.drawRock(m.ctx, 0, 0, 0); }) === 0, tag + 'alpha 0 / size 0 draws nothing');
  try { A.drawThing(null, { kind: 'obj' }, 90); A.drawThing(mockCtx().ctx, null, 90); A.drawMat(null, 150); A.drawPennant(null); A.drawPennant(mockCtx().ctx, null, 70);
    A.drawPole(null); A.drawPad(null); A.drawPump(null); A.drawArc(null); A.drawArc(mockCtx().ctx, null); A.drawPuddleRing(null); A.drawBurrow(null); A.drawRock(null);
    A.drawHomeBadge(null); A.drawIcon(null); A.drawIcon(mockCtx().ctx, null); A.drawHintHand(null); A.drawDrop(null); ok(true, ''); }
  catch (e) { ok(false, tag + 'null args threw ' + e.message); }
  ok(A.thingKey({ kind: 'obj', obj: 'mug', color: 'red' }) !== A.thingKey({ kind: 'obj', obj: 'mug', color: 'blue' }), tag + 'thingKey distinct colour');
  ok(A.thingKey({ kind: 'dots', n: 2 }) !== A.thingKey({ kind: 'dots', n: 3 }) && A.thingKey({ kind: 'dots', n: 2 }) !== A.thingKey({ kind: 'dots', n: 2, numeral: true }), tag + 'thingKey distinct n / numeral');
  ok(A.thingKey({ kind: 'obj', obj: 'ball', color: 'red', big: false }) !== A.thingKey({ kind: 'obj', obj: 'ball', color: 'red' }), tag + 'thingKey distinct size');

  if (withP2D) {
    A.clearCache();
    const t = { kind: 'obj', obj: 'lantern', color: 'green' };
    const before = p2dCount; A.drawThing(mockCtx().ctx, t, 90, { glow: 0.5 }); A.drawMat(mockCtx().ctx, 150, { seed: 2 }); A.drawThing(mockCtx().ctx, { kind: 'dots', n: 5 }, 90); const first = p2dCount - before;
    const mid = p2dCount; for (let i = 0; i < 5; i++) { A.drawThing(mockCtx().ctx, t, 90 + i * 7, { wiggle: i / 5 }); A.drawMat(mockCtx().ctx, 150 + i, { seed: 2, squish: i / 5 }); A.drawThing(mockCtx().ctx, { kind: 'dots', n: 5 }, 90 + i); } const again = p2dCount - mid;
    ok(first > 0 && again === 0, tag + 'Path2D cache reused (first ' + first + ', again ' + again + ')');
    A.clearCache();
  }

  // animal images via DK.Assets: feet at the origin
  const imgCow = { tag: 'cow' };
  DK.Assets = { has: k => k === 'animals/cow', sprite: () => imgCow, img: () => null };
  { const { m } = run(m => A.drawThing(m.ctx, { kind: 'animal', animal: 'cow' }, 90, {})); ok(m.images[0] === imgCow, tag + 'animal uses DK.Assets image'); }
  { const { m } = run(m => A.drawThing(m.ctx, { kind: 'animal', animal: 'pig' }, 90, {})); ok(m.images.length === 0 && m.calls.filter(c => c === 'fill').length > 3, tag + 'missing image → placeholder'); }
  { const { m } = run(m => A.drawPennant(m.ctx, { kind: 'animal', animal: 'cow' }, 72, {})); ok(m.images[0] === imgCow && m.bad.length === 0, tag + 'animal pennant uses the image'); }
  DK.Assets = { img: k => (k === 'animals/lion' ? imgCow : null) };
  { const { m } = run(m => A.drawThing(m.ctx, { kind: 'animal', animal: 'lion' }, 90, { glow: 1 })); ok(m.images[0] === imgCow && m.bad.length === 0 && m.depth() === 0, tag + 'DK.Assets.img() fallback'); }
  DK.Assets = { has() { throw new Error('boom'); } };
  { const { m } = run(m => A.drawThing(m.ctx, { kind: 'animal', animal: 'duck' }, 90, {})); ok(m.depth() === 0 && m.calls.length > 10, tag + 'broken DK.Assets → placeholder'); }
  delete DK.Assets;
  A.clearCache();
}

console.log((fails ? 'FAILED ' : 'ok ') + passes + ' passed, ' + fails + ' failed (mat_art)');
process.exit(fails ? 1 : 0);
