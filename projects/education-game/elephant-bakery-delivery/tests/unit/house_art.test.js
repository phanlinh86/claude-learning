// Tupi's Bakery Delivery — unit test for BD.HouseArt (game/js/house_art.js), plain node, no browser, no deps.
// A recording mock 2D context checks every call; Path2D is stubbed. Checks: public API, exact palette, outlines readable on
// the tablecloth, every house option (colour / sign kind / door / lit / glow / active / squash / snow / seed), every thing
// kind / treat / colour / shape / cookies + dots n 1–12 (± numeral) / tile (incl. '@odd' / '@even' EN + VI) / animal / home /
// blob / big:false draws without throwing and actually draws, no NaN / undefined reaches the context, save/restore balanced,
// dot + cookie layouts separate and inside, icons, hint hand, heart puff, sprinkles (pastel ≤ 0.5 saturation), snowflake,
// animal images via BD.Assets, node-safe load.
// Run: node tests/unit/house_art.test.js   (exit code 1 on any failure)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

let fails = 0, passes = 0;
function ok(cond, msg) { if (cond) passes++; else { fails++; if (fails < 60) console.error('FAIL', msg); } }

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'game', 'js', 'house_art.js'), 'utf8');

function mockCtx() {
  const calls = [], bad = [], images = [], texts = [];
  const grad = () => ({ addColorStop(o, c) { if (!(o >= 0 && o <= 1)) bad.push('stop ' + o); if (/NaN|undefined/.test(c)) bad.push('colour ' + c); } });
  const state = { globalAlpha: 1, lineWidth: 1, fillStyle: '#000', strokeStyle: '#000', font: '10px x', textAlign: 'left', lineDashOffset: 0,
    textBaseline: 'alphabetic', lineJoin: 'miter', lineCap: 'butt', shadowColor: '', shadowBlur: 0, shadowOffsetY: 0, globalCompositeOperation: 'source-over' };
  const stack = [];
  const ctx = new Proxy(state, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'save') return () => { calls.push('save'); stack.push(Object.assign({}, t)); };
      if (k === 'restore') return () => { calls.push('restore'); const s = stack.pop(); if (!s) bad.push('restore without save'); else Object.assign(t, s); };
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return (...a) => {
        if (a.some(v => !isFinite(v))) bad.push(k + ' NaN'); if (k === 'createRadialGradient' && (a[2] < 0 || a[5] < 0)) bad.push('radial negative r'); calls.push(k); return grad(); };
      if (k === 'measureText') return (s) => ({ width: String(s).length * 50, actualBoundingBoxAscent: 70, actualBoundingBoxDescent: /[gẵ]/.test(s) ? 20 : 0 });
      if (k === 'setLineDash') return (a) => { if (a.some(v => !isFinite(v) || v < 0)) bad.push('dash ' + a); };
      if (k === 'drawImage') return (...a) => { calls.push('drawImage'); images.push(a[0]); if (a.slice(1).some(v => !isFinite(v))) bad.push('drawImage NaN'); };
      return (...a) => {
        calls.push(k);
        if (a.some(v => (typeof v === 'number' && !isFinite(v)) || (v === undefined && k !== 'fill' && k !== 'stroke' && k !== 'clip'))) bad.push(k + '(' + a.join(',') + ')');
        if ((k === 'arc' && a[2] < 0) || (k === 'ellipse' && (a[2] < 0 || a[3] < 0))) bad.push(k + ' negative radius ' + a.join(','));
        if (k === 'fillText') { texts.push(String(a[0])); if (/undefined|NaN|^@/.test(String(a[0]))) bad.push('fillText ' + a[0]); }
      };
    },
    set(t, k, v) {
      if (typeof v === 'number' && !isFinite(v)) bad.push('set ' + String(k) + ' NaN');
      if (v === undefined || (typeof v === 'string' && /NaN|undefined/.test(v))) bad.push('set ' + String(k) + ' ' + v);
      if (k === 'globalAlpha' && (v < 0 || v > 1)) bad.push('globalAlpha ' + v);
      t[k] = v; return true;
    }
  });
  return { ctx, calls, bad, images, texts, depth: () => stack.length };
}

let p2dCount = 0;
function load(withPath2D, extra) {
  const sb = Object.assign({ console, Math }, extra || {});
  sb.window = sb;
  if (withPath2D) sb.Path2D = function () { p2dCount++; const p = this; ['moveTo', 'lineTo', 'quadraticCurveTo', 'bezierCurveTo', 'arc', 'ellipse', 'closePath', 'rect'].forEach(m => { p[m] = () => {}; }); };
  vm.createContext(sb);
  vm.runInContext(SRC, sb, { filename: 'house_art.js' });
  return sb;
}
function run(f) { const m = mockCtx(); let err = null; try { f(m); } catch (e) { err = e; } return { m, err }; }
const J = o => JSON.stringify(o);

// ---- node-safe load
try {
  const sb = { console, Math }; sb.global = sb; vm.createContext(sb); vm.runInContext(SRC, sb);
  ok(sb.BD && sb.BD.HouseArt, 'loads with no window (global fallback)');
  const sb2 = load(false, { BD: { keep: 1 } });
  ok(sb2.BD.keep === 1 && sb2.BD.HouseArt, 'keeps an existing BD namespace');
  let touched = false;
  const sb3 = { console, Math }; sb3.window = sb3;
  Object.defineProperty(sb3, 'document', { get() { touched = true; return undefined; } });
  vm.createContext(sb3); vm.runInContext(SRC, sb3);
  ok(!touched, 'no document access at load');
} catch (e) { ok(false, 'node-safe load threw: ' + e.message); }

function hsl(h) {
  const n = parseInt(h.slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  return { s: d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)), l };
}

const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
for (const withP2D of [false, true]) {
  const sb = load(withP2D), BD = sb.BD, A = BD && BD.HouseArt, tag = withP2D ? '[Path2D] ' : '[no Path2D] ';
  ok(!!A, tag + 'BD.HouseArt exists');
  if (!A) continue;
  ['drawHouse', 'houseBox', 'drawThing', 'drawHomeBadge', 'drawSnowflake', 'drawIcon', 'drawHintHand', 'drawHeartPuff', 'drawSprinkle',
    'dotLayout', 'cookieLayout', 'thingTop', 'pal', 'lineOf', 'contrast', 'thingKey', 'tileText', 'variant', 'houseStyle', 'clearCache']
    .forEach(f => ok(typeof A[f] === 'function', tag + 'function ' + f));
  const want = { red: '#E84A4A/#A8282E/#F7A0A0', blue: '#3C8DE8/#1F5BA8/#A6CCF5', yellow: '#FFD23F/#C99A12/#FFEB9C',
    green: '#4CC26B/#2A8343/#A8E6B8', orange: '#FF9A2E/#C4650C/#FFCB8E', purple: '#8E44AD/#6840A8/#D2BDF3', pink: '#FF8FC0/#C9558A/#FFCCE2' };
  COLORS.forEach(c => { const p = A.PALETTE[c]; ok(p && [p.base, p.dark, p.light].join('/') === want[c], tag + 'palette ' + c); });
  ok(A.HOUSE.wall === '#C98A52' && A.HOUSE.shade === '#A86C3C' && A.HOUSE.line === '#7E4E2A' && A.HOUSE.trim === '#FFF8EC'
    && A.HOUSE.roof === '#FFF2DC' && A.HOUSE.door === '#B5773F', tag + 'house hex (DESIGN §3)');
  ok(A.SIGN.base === '#F3E6CC' && A.SIGN.line === '#9C7A5A' && A.INK === '#3A3640', tag + 'sign + dot hex');
  ok(A.TREATS.join() === 'cupcake,macaron,donut,cakepop,jelly', tag + 'treats');
  ok(A.SHAPES.join() === 'circle,square,triangle,star,heart,oval,rect,diamond', tag + 'shapes');
  ok(A.HOMES.join() === 'farm,sea,ice,jungle,savanna', tag + 'homes');
  ok(A.KINDS.join() === 'treat,shape,cookies,dots,tile,animal,home,blob', tag + 'kinds');
  ok(A.SMALL === 0.6, tag + 'small = 0.6');
  ok(A.pal('red').base === '#E84A4A' && A.pal('nope') === null, tag + 'pal lookup');
  BD.PALETTE = { red: { base: '#123456', dark: '#000000', light: '#FFFFFF' }, blue: { base: 'oops' } };
  ok(A.pal('red').base === '#123456' && A.pal('blue').base === '#3C8DE8', tag + 'BD.PALETTE used when valid, fallback when broken');
  delete BD.PALETTE;
  COLORS.forEach(c => { const l = A.lineOf(c), k = A.contrast(l, A.TABLE); ok(k >= 3, tag + 'outline contrast on the tablecloth ' + c + ' ' + k.toFixed(2)); });
  A.SPRINKLES.forEach(h => { const q = hsl(h); ok(q.s <= 0.5 + 1e-9, tag + 'sprinkle pastel ' + h + ' S=' + q.s.toFixed(2)); });
  A.GUMS.forEach(h => ok(hsl(h).s <= 0.5, tag + 'gumdrop calm ' + h));
  ok(A.tileText({ text: '@odd' }, 'en') === 'odd' && A.tileText({ text: '@even' }, 'vi') === 'chẵn' && A.tileText({ text: '@odd' }, 'vi') === 'lẻ', tag + "'@odd' / '@even' words");
  ok(A.tileText({ text: '7-4' }) === '7−4' && A.tileText({ n: 15 }) === '15', tag + 'tile text normalised');

  // ---- every thing
  const things = [].concat(
    ...A.TREATS.map(o => COLORS.map(c => ({ kind: 'treat', obj: o, color: c }))),
    [{ kind: 'treat' }, { kind: 'treat', obj: 'pizza', color: 'mauve' }],
    ...A.SHAPES.map(s => COLORS.map(c => ({ kind: 'shape', shape: s, color: c }))), [{ kind: 'shape', shape: 'blob' }],
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 0, 13, -2, NaN].map(n => ({ kind: 'cookies', n })),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 0, 13, NaN].map(n => ({ kind: 'dots', n })),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => ({ kind: 'dots', n, numeral: true })),
    ['A', 'a', 'Đ', 'ẵ', '3+2', '7−4', '7-4', '10+10', '12−5', '20', '9', '', 'WWWWWWWW', '@odd', '@even', 'lẻ', 'chẵn'].map(text => ({ kind: 'tile', text })),
    [{ kind: 'tile', n: 15 }, { kind: 'tile' }, { kind: 'tile', text: '@even', lang: 'vi' }],
    A.ANIMALS.concat(['dragon']).map(a => ({ kind: 'animal', animal: a })),
    A.HOMES.concat(['moon']).map(h => ({ kind: 'home', home: h })),
    COLORS.concat(['nope']).map(c => ({ kind: 'blob', color: c })),
    [{ kind: 'treat', obj: 'cupcake', color: 'green', big: false }, { kind: 'animal', animal: 'sheep', big: false }, { kind: 'cookies', n: 3, big: false }, { kind: 'mystery' }]
  );
  const opts = [{}, { glow: 1 }, { glow: 0.4, wiggle: -1 }, { wiggle: 0.5, rot: 0.1 }, { alpha: 0.5 }, { count: 3 }, { count: 99 }, { shadow: false },
    { direct: true, lang: 'vi' }, { glow: NaN, wiggle: 'x', count: 'y', alpha: NaN, rot: NaN }];
  for (const t of things) {
    for (const o of opts) {
      const { m, err } = run(m => A.drawThing(m.ctx, t, 72, o));
      if (err) { ok(false, tag + 'drawThing threw ' + J(t) + ' ' + J(o) + ': ' + err.stack); continue; }
      ok(m.bad.length === 0, tag + 'clean calls ' + J(t) + ' ' + J(o) + ' ' + m.bad.slice(0, 3).join(' | '));
      ok(m.depth() === 0, tag + 'save/restore balanced ' + J(t));
      ok(m.calls.filter(c => c === 'fill').length >= 2, tag + 'draws something ' + J(t) + ' ' + J(o));
    }
    const h = A.thingTop(t, 93);
    ok(h > 30 && h < 125, tag + 'thingTop sane ' + J(t) + ' ' + h);
  }
  const count = (f, what) => { const { m } = run(f); return what ? m.calls.filter(c => c === what).length : m.calls.length; };
  ok(count(m => A.drawThing(m.ctx, { kind: 'dots', n: 4 }, 93, { count: 4 })) > count(m => A.drawThing(m.ctx, { kind: 'dots', n: 4 }, 93, {})), tag + 'count rings dots');
  ok(count(m => A.drawThing(m.ctx, { kind: 'cookies', n: 4 }, 93, { count: 2 })) > count(m => A.drawThing(m.ctx, { kind: 'cookies', n: 4 }, 93, {})), tag + 'count rings cookies');
  ok(count(m => A.drawThing(m.ctx, { kind: 'treat', obj: 'donut', color: 'red' }, 93, { glow: 1 })) > count(m => A.drawThing(m.ctx, { kind: 'treat', obj: 'donut', color: 'red' }, 93, {})), tag + 'glow adds a halo');
  { const { m } = run(m => A.drawThing(m.ctx, { kind: 'tile', text: '@even' }, 93, { lang: 'vi' })); ok(m.texts.includes('chẵn'), tag + "tile '@even' in VI draws chẵn"); }
  ok(count(m => A.drawThing(m.ctx, { kind: 'dots', n: 3, numeral: true }, 93, {}), 'fillText') === 1 && count(m => A.drawThing(m.ctx, { kind: 'dots', n: 3 }, 93, {}), 'fillText') === 0, tag + 'numeral only when asked');
  { // treats: the answer colour is used as a fill
    for (const o of A.TREATS) for (const c of COLORS) {
      const fills = []; const { m } = run(() => {});
      const px = new Proxy(m.ctx, { get(t, k) { if (k === 'fill') return () => fills.push(t.fillStyle); return t[k]; }, set(t, k, v) { t[k] = v; return true; } });
      A.drawThing(px, { kind: 'treat', obj: o, color: c }, 80, { direct: true });
      ok(fills.filter(f => f === A.PALETTE[c].base).length >= 1, tag + 'treat ' + o + ' filled in ' + c);
    }
  }
  { // small = ×0.6; things stand on the origin
    const sc = [], ys = [];
    const { m } = run(() => {});
    const px = new Proxy(m.ctx, { get(t, k) { if (k === 'scale') return (x) => { sc.push(x); }; if (k === 'translate') return (x, y) => { ys.push(y); }; return t[k]; }, set(t, k, v) { t[k] = v; return true; } });
    A.drawThing(px, { kind: 'treat', obj: 'cupcake', color: 'red', big: false }, 100, {});
    ok(Math.abs(sc[0] - 0.6) < 1e-9, tag + 'big:false scales by 0.6');
    ok(ys[0] < -40, tag + 'thing shifted up so its foot sits on the origin');
  }

  // ---- layouts: n items, separate (gap ≥ 0.6 r), inside
  for (let n = 1; n <= 12; n++) {
    for (const L of [A.dotLayout(n, false), A.dotLayout(n, true), A.cookieLayout(n)]) {
      ok(L.n === n && L.pts.length === n, tag + 'layout has n points ' + n);
      let minGap = 1e9;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) minGap = Math.min(minGap, Math.hypot(L.pts[i][0] - L.pts[j][0], L.pts[i][1] - L.pts[j][1]) - 2 * L.rs);
      ok(n === 1 || minGap >= 0.6 * L.rs, tag + 'items separate n=' + n + ' gap ' + minGap.toFixed(2));
      ok(L.pts.every(p => Math.abs(p[0]) + L.rs <= 50 && p[1] - L.rs >= -100 && p[1] + L.rs <= 0), tag + 'items inside the box n=' + n);
    }
    ok(A.cookieLayout(n).rs >= (n <= 4 ? 13 : n <= 8 ? 8.5 : 7), tag + 'cookies big enough to count n=' + n + ' rs ' + A.cookieLayout(n).rs.toFixed(1));
  }

  // ---- houses
  const signs = [null].concat(things.filter((t, i) => i % 3 === 0));
  const hopts = [{}, { door: 0.5, lit: 0.5 }, { door: 1, lit: 1, glow: 1, active: 1 }, { squash: 0.8, snow: 1 }, { snow: 0.25, alpha: 0.4 }, { door: NaN, lit: 'x', glow: NaN, squash: NaN, snow: NaN, alpha: NaN, seed: NaN }];
  let hi = 0;
  for (const sign of signs) for (const o of hopts) {
    const opt = Object.assign({ seed: hi++, sign }, o);
    const { m, err } = run(m => A.drawHouse(m.ctx, 150 + (hi % 3) * 10, opt));
    if (err) { ok(false, tag + 'drawHouse threw ' + J(opt) + ': ' + err.stack); continue; }
    ok(m.bad.length === 0, tag + 'house clean ' + J(opt) + ' ' + m.bad.slice(0, 3).join(' | '));
    ok(m.depth() === 0, tag + 'house save/restore balanced');
    ok(m.calls.filter(c => c === 'fill').length > 20, tag + 'house draws ' + J(opt));
  }
  for (const c of COLORS.concat([null, 'nope'])) for (let seed = 0; seed < 45; seed += 4) {
    const { m, err } = run(m => A.drawHouse(m.ctx, 160, { color: c, seed, snow: seed % 2, door: (seed % 5) / 4, lit: 1 }));
    ok(!err && m.bad.length === 0 && m.depth() === 0, tag + 'colour house ' + c + ' seed ' + seed + (err ? ' ' + err.message : ' ' + m.bad.slice(0, 2).join(' | ')));
  }
  { // colour mode paints the roof + door in the answer colour; blob signs switch to colour mode
    for (const c of COLORS) {
      const fills = []; const { m } = run(() => {});
      const px = new Proxy(m.ctx, { get(t, k) { if (k === 'fill') return () => fills.push(t.fillStyle); return t[k]; }, set(t, k, v) { t[k] = v; return true; } });
      A.drawHouse(px, 160, { color: c, seed: 1 });
      ok(fills.filter(f => f === A.PALETTE[c].base).length >= 3, tag + 'colour house uses ' + c + ' (roof, door, blob)');
      const fills2 = []; const px2 = new Proxy(m.ctx, { get(t, k) { if (k === 'fill') return () => fills2.push(t.fillStyle); return t[k]; }, set(t, k, v) { t[k] = v; return true; } });
      A.drawHouse(px2, 160, { sign: { kind: 'blob', color: c }, seed: 1 });
      ok(fills2.filter(f => f === A.PALETTE[c].base).length >= 3, tag + 'blob sign → colour mode ' + c);
    }
  }
  ok(count(m => A.drawHouse(m.ctx, 150, { sign: { kind: 'dots', n: 3 }, glow: 1 })) > count(m => A.drawHouse(m.ctx, 150, { sign: { kind: 'dots', n: 3 } })), tag + 'house glow adds strokes');
  ok(count(m => A.drawHouse(m.ctx, 150, { lit: 1 })) > count(m => A.drawHouse(m.ctx, 150, {})), tag + 'lit adds the window glow');
  ok(count(m => A.drawHouse(m.ctx, 150, { door: 0.5 })) > count(m => A.drawHouse(m.ctx, 150, { door: 0 })) && count(m => A.drawHouse(m.ctx, 150, { door: 1 })) < count(m => A.drawHouse(m.ctx, 150, { door: 0.5 })), tag + 'door opening draws the swung panel edge, the knob goes when wide open');
  ok(count(m => A.drawHouse(m.ctx, 0, {})) === 0 && count(m => A.drawHouse(m.ctx, 150, { alpha: 0 })) === 0, tag + 'S 0 / alpha 0 draw nothing');
  { const { m } = run(m => A.drawHouse(m.ctx, 150, { sign: { kind: 'tile', text: '@odd' }, lang: 'vi' })); ok(m.texts.includes('lẻ'), tag + 'house tile sign in VI'); }
  for (const S of [128, 146, 150, 156, 170]) {
    const b = A.houseBox(S);
    ok([b.x0, b.y0, b.x1, b.y1, b.w, b.h, b.signR, b.signW, b.signH].every(Number.isFinite) && b.x0 < 0 && b.x1 > 0 && b.y0 < 0 && b.y1 >= 0, tag + 'houseBox finite S' + S);
    ok(b.h / S > 0.9 && b.h / S < 1.12, tag + 'house height ≈ S ' + (b.h / S).toFixed(2));
    ok(b.signH >= 0.55 * S, tag + 'sign board ≥ 0.55·S tall');
    ok(b.chimney[1] < b.signC[1] && b.door.y1 === 0, tag + 'chimney above, door at the origin');
    ok(A.houseBox(S, { color: 'red' }).signR < b.signR, tag + 'colour plaque smaller than the board');
  }
  ok(A.variant(3) === A.variant(3) && A.variant(-3) >= 0 && A.variant(0.37) >= 0 && A.variant(NaN) === 0, tag + 'variant');
  const styles = new Set(); for (let s = 0; s < 45; s++) { const st = A.houseStyle(s); styles.add(st.roof + ':' + st.win + ':' + st.gum); }
  ok(styles.size === 45, tag + '45 seeded house styles');

  // ---- icons, badges, hand, puff, sprinkles, snowflake
  const icons = [].concat(things.filter((t, i) => i % 5 === 0), COLORS.map(c => ({ kind: 'color', color: c })), [0, 1, 5, 10, 12, 20, NaN].map(n => ({ kind: 'number', n })),
    A.HOMES.map(h => ({ kind: 'home', home: h })), [{ kind: 'size', big: true }, { kind: 'size', big: false }, { kind: 'size', big: true, thing: { kind: 'treat', obj: 'donut', color: 'blue' } },
      { kind: 'letter', text: 'B' }, { kind: 'weird' }]);
  for (const ic of icons) for (const sz of [96, 60]) {
    const { m, err } = run(m => A.drawIcon(m.ctx, ic, sz));
    ok(!err && m.bad.length === 0 && m.depth() === 0 && m.calls.includes('fill'), tag + 'icon ' + J(ic) + (err ? ' ' + err.message : ' ' + m.bad.slice(0, 2).join(' | ')));
  }
  for (const h of A.HOMES.concat(['x'])) { const { m, err } = run(m => A.drawHomeBadge(m.ctx, h, 40, { a: 0.7, pop: 0.8 })); ok(!err && m.bad.length === 0 && m.depth() === 0, tag + 'badge ' + h); }
  for (const p of [0, 0.5, 1, NaN]) for (const a of [1, 0.5]) { const { m, err } = run(m => A.drawHintHand(m.ctx, 100, 100, p, a)); ok(!err && m.bad.length === 0 && m.depth() === 0 && m.calls.includes('fill'), tag + 'hand ' + p + ' ' + a); }
  for (const r of [6, 16, 40]) for (const a of [1, 0.3]) { const { m, err } = run(m => A.drawHeartPuff(m.ctx, r, a)); ok(!err && m.bad.length === 0 && m.depth() === 0 && m.calls.includes('fill'), tag + 'heart puff ' + r); }
  ok(count(m => A.drawHeartPuff(m.ctx, 16, 0)) === 0 && count(m => A.drawHeartPuff(m.ctx, NaN, 1)) > 0, tag + 'heart puff alpha 0 / NaN r');
  for (let k = -1; k <= 7; k++) for (const r of [3, 8]) { const { m, err } = run(m => A.drawSprinkle(m.ctx, k, r, k * 0.5)); ok(!err && m.bad.length === 0 && m.depth() === 0 && m.calls.includes('fill'), tag + 'sprinkle ' + k); }
  { const { m, err } = run(m => A.drawSprinkle(m.ctx, NaN, NaN, NaN)); ok(!err && m.bad.length === 0, tag + 'sprinkle NaN-safe'); }
  for (const r of [10, 30]) { const { m, err } = run(m => A.drawSnowflake(m.ctx, r, 0.3, 0.8)); ok(!err && m.bad.length === 0 && m.depth() === 0, tag + 'snowflake ' + r); }
  ok(count(m => A.drawThing(null, { kind: 'dots', n: 1 }, 50)) === 0 && count(m => A.drawThing(m.ctx, null, 50)) === 0 && count(m => A.drawIcon(m.ctx, null, 50)) === 0, tag + 'null-safe');

  // ---- animal images via BD.Assets (placeholder without)
  const img = { width: 200, height: 200 };
  BD.Assets = { img: k => (k === 'animals/cow' ? img : null) };
  { const { m } = run(m => A.drawThing(m.ctx, { kind: 'animal', animal: 'cow' }, 90, {})); ok(m.images.includes(img), tag + 'animal image drawn from BD.Assets'); }
  { const { m } = run(m => A.drawHouse(m.ctx, 150, { sign: { kind: 'animal', animal: 'cow' } })); ok(m.images.includes(img), tag + 'animal sign drawn from BD.Assets'); }
  { const { m } = run(m => A.drawThing(m.ctx, { kind: 'animal', animal: 'pig' }, 90, {})); ok(m.images.length === 0 && m.calls.includes('fill'), tag + 'placeholder when the image is missing'); }
  delete BD.Assets;
  ok(A.thingKey({ kind: 'tile', text: '@odd' }, 'en') !== A.thingKey({ kind: 'tile', text: '@odd' }, 'vi'), tag + 'cache key includes the resolved word');
  A.clearCache();
}
ok(p2dCount > 0, 'Path2D cache used when available');
const before = p2dCount; { const sb = load(true); const A = sb.BD.HouseArt; const m = mockCtx(); A.drawHouse(m.ctx, 150, { seed: 1 }); const k = p2dCount; A.drawHouse(m.ctx, 150, { seed: 1 }); ok(p2dCount === k && k > before, 'Path2D reused on the second draw'); }

console.log((fails ? 'FAILED ' : 'ok ') + passes + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
