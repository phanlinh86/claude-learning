// LL.LeafArt — code-drawn jungle leaves (flip on their stems), faces, the jungle tree with its row vines, colour things,
// butterflies, garland and star for Lolo's Jungle Leaf Match (character artist B). Contract: docs/DESIGN.md §3, §6.4.
// Classic script; safe to require() in node: document / canvases are only touched lazily inside draw calls (no canvas →
// everything is painted directly, uncached).
//
// Everything is drawn CENTRED at (0,0) in the current transform unless stated:
//   drawLeaf(ctx, w, h, face, open, opt)   a big rounded heart-shaped jungle leaf filling w × h (tip down) hanging on its stem
//                                          from (0, −h/2 − opt.stem). Flip about the vertical axis: sx = cos(open·π);
//                                          sx ≥ 0 → green top side scaled by sx, sx < 0 → pale underside (+ face when
//                                          sx < −0.05) scaled by −sx; a leaf-thickness strip + a bright edge line when
//                                          edge-on, a little twist (shear) and shading while turning; open may overshoot
//                                          to 1.12 (it wobbles back past the flat). Orchid bloom at the stem above the leaf.
//   drawFace(ctx, w, h, face, opt)          the face alone on a pale leaf-underside tile (Talk time, title); opt.plain → no tile
//   drawTree(ctx, rect, tree, opt)          NOT centred: rect = layout.grid.building {x, y, w, h, roofH, pad, rows}
//   drawThing(ctx, obj, colorKey, size)     butterfly | balloon | flower | kite | cup | boot, fits a size × size box
//   drawButterfly(ctx, colorKey, size, flap) wingspan ≈ size, flap = phase (rad); colorKey may be a hex
//   drawGarland(ctx, x0, y0, x1, y1, t)     absolute coords; a draped vine with pastel blossoms that sway with t (seconds)
//   drawStar(ctx, size, text, opt)          as Gigi
//   geometry(w, h, stem)                    the leaf's parts in local coords: {top, notch, tip, face, orchid, pivot}
//   vineY(row, x, t, i, sway)               y of the row vine at x (pivots of the leaves sit on it) — see drawTree
//
// drawLeaf opt: { leaf '#hex' | jungle|teal|lime|fern, leafDark, vine, vineDark, stem px, light 0..1, glow 0..1, glowColor,
//   bloom 0..1.2, flower '#hex' | lilac|white|blush, bounce px, wiggle rad, sprite(name, x, y, size), night 0..1, alpha 0..1 }
// face: { kind:'color'|'shape'|'dots'|'number'|'letter'|'text'|'animal'|'food'|'parity', value, color?, obj?, shape?,
//         sprite?, text?, n?, scale?, parity?:'odd'|'even' (a blue / orange ring on the underside on any kind) }
// Bitmaps cached per (key, size bucket of 2 px, device scale from the context's Y axis): face contents (transparent), the
// leaf top side per (leaf colour), the plain underside per (parity), trees (≤ 4 bitmaps: day + night tint, ≤ 2× dpr).
// Halos, rims, shading, edge, stem and orchid are drawn live (a handful of vector paths).
(function (LL) {
  'use strict';

  // ================================================================ palette & colour helpers
  var PALETTE = {
    red: ['#E84A4A', '#A8282E'], blue: ['#3C8DE8', '#1F5BA8'], yellow: ['#FFD23F', '#C99A12'],
    green: ['#4CC26B', '#2A8343'], orange: ['#FF9A2E', '#C4650C'], purple: ['#9B6BE0', '#6840A8'],
    pink: ['#FF8FC0', '#C9558A']
  };
  var LEAVES = { jungle: ['#3E9A5E', '#286B40'], teal: ['#3A9488', '#23645B'], lime: ['#7AA845', '#52762A'], fern: ['#4F8F3C', '#33622A'] };
  var BARKS = { brown: ['#8A6A4E', '#5E4532'], grey: ['#7D7266', '#544B42'], red: ['#8E5E4A', '#5E3C2F'] };
  var ORCHIDS = { lilac: '#E3C6F0', white: '#FFF7FB', blush: '#F7C9D6' };
  var UNDER = { fill: '#F3F6DF', fill2: '#E7EEC9', rim: '#C9D9A8', line: '#8FA866', lit: '#FFF6D2' };
  var STEM = { base: '#6E8F3A', dark: '#46612A' };
  var MOSS = '#8DBA6A', GOLD = '#FFE08A';
  var INK = { ink: '#3D2814', soft: '#DCE5BE' };
  var FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", "Segoe UI", system-ui, -apple-system, sans-serif';
  var SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'rect'];
  var THINGS = ['butterfly', 'balloon', 'flower', 'kite', 'cup', 'boot'];
  var DOT_COLORS = ['red', 'blue', 'purple', 'orange', 'red'];   // berries by n (never yellow/green on the pale underside)
  var KINDS = ['kapok', 'fig', 'palm'];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v, d) { v = +v; return isFinite(v) ? v : d; }
  function hexRgb(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  function rgbHex(c) {
    return '#' + c.map(function (v) { var s = Math.max(0, Math.min(255, Math.round(v))).toString(16); return s.length < 2 ? '0' + s : s; }).join('').toUpperCase();
  }
  function mix(a, b, t) { var x = hexRgb(a), y = hexRgb(b); return rgbHex([0, 1, 2].map(function (i) { return x[i] + (y[i] - x[i]) * t; })); }
  function rgba(hex, a) { var c = hexRgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (+clamp(num(a, 0), 0, 1)).toFixed(3) + ')'; }
  function lum(hex) {
    var c = hexRgb(hex).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) { var la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }
  function chroma(hex) { var c = hexRgb(hex); return (Math.max.apply(null, c) - Math.min.apply(null, c)) / 255; }
  function saturation(hex) {
    var c = hexRgb(hex).map(function (v) { return v / 255; }), mx = Math.max.apply(null, c), mn = Math.min.apply(null, c), l = (mx + mn) / 2;
    if (mx === mn) return 0;
    return l > 0.5 ? (mx - mn) / (2 - mx - mn) : (mx - mn) / (mx + mn);
  }
  function isHex(v) { return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v); }

  var COLORS = {};
  Object.keys(PALETTE).forEach(function (k) {
    var base = PALETTE[k][0], dark = PALETTE[k][1];
    COLORS[k] = { base: base, dark: dark, light: mix(base, '#FFFFFF', 0.42), shade: mix(base, dark, 0.5) };
  });
  function col(key) {
    if (COLORS[key]) return COLORS[key];
    if (isHex(key)) {
      var d = mix(key, '#2A1E1A', 0.38);
      return { base: key.toUpperCase(), dark: d, light: mix(key, '#FFFFFF', 0.42), shade: mix(key, d, 0.5) };
    }
    return COLORS.red;
  }
  function pick(v, table, dflt) {   // '#hex' | table key → [base, dark?]
    if (isHex(v)) return [v.toUpperCase(), null];
    if (typeof v === 'string') { var k = v.toLowerCase().replace(/[\s_-]/g, ''); if (table[k]) return [].concat(table[k]); }
    return [].concat(dflt);
  }
  function leafCols(leaf, leafDark) {
    var p = pick(leaf, LEAVES, LEAVES.jungle);
    var base = p[0], dark = isHex(leafDark) ? leafDark.toUpperCase() : (p[1] || mix(base, '#14301C', 0.42));
    return { base: base, dark: dark, vein: mix(base, '#FFFFFF', 0.4), shade: mix(base, dark, 0.45), hi: mix(base, '#FFFFFF', 0.22) };
  }
  function flowerCol(v) { var p = pick(v, ORCHIDS, ORCHIDS.lilac); return p[0]; }

  // ================================================================ small path helpers
  function rr(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function roundPoly(ctx, v, r) {
    var n = v.length;
    ctx.moveTo((v[0][0] + v[n - 1][0]) / 2, (v[0][1] + v[n - 1][1]) / 2);
    for (var i = 0; i < n; i++) {
      var a = v[i], b = v[(i + 1) % n];
      ctx.arcTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, typeof r === 'number' ? r : r[i]);
    }
    ctx.closePath();
  }
  function ell(ctx, x, y, rx, ry, rot) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot || 0, 0, Math.PI * 2); }
  function poly(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); }
  function rng(seed) { // mulberry32
    var a = (seed >>> 0) || 1;
    return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function backOut(x) { x = clamp(x, 0, 1); var c1 = 2.2, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }
  // a small pointed leaflet along +x from the origin (length L, width k·L)
  function leaflet(ctx, L, k) {
    var wd = L * (k || 0.36);
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.bezierCurveTo(L * 0.25, -wd, L * 0.7, -wd * 0.9, L, 0);
    ctx.bezierCurveTo(L * 0.7, wd * 0.9, L * 0.25, wd, 0, 0);
    ctx.closePath();
  }

  // ================================================================ shapes (unit = s, centred)
  function traceShape(ctx, shape, s) {
    ctx.beginPath();
    switch (shape) {
      case 'square': roundPoly(ctx, [[-0.43 * s, -0.43 * s], [0.43 * s, -0.43 * s], [0.43 * s, 0.43 * s], [-0.43 * s, 0.43 * s]], 0.1 * s); break;
      case 'rect': roundPoly(ctx, [[-0.52 * s, -0.3 * s], [0.52 * s, -0.3 * s], [0.52 * s, 0.3 * s], [-0.52 * s, 0.3 * s]], 0.09 * s); break;
      case 'triangle': roundPoly(ctx, [[0, -0.56 * s], [0.6 * s, 0.46 * s], [-0.6 * s, 0.46 * s]], 0.11 * s); break;
      case 'star': {
        var v = [], rad = [];
        for (var k = 0; k < 10; k++) {
          var ang = (-90 + k * 36) * Math.PI / 180, r = k % 2 ? 0.27 * s : 0.6 * s;
          v.push([Math.cos(ang) * r, Math.sin(ang) * r + 0.06 * s]); rad.push(k % 2 ? 0.05 * s : 0.08 * s);
        }
        roundPoly(ctx, v, rad);
        break;
      }
      case 'heart': {
        ctx.moveTo(0, -0.27 * s);
        ctx.bezierCurveTo(0.08 * s, -0.48 * s, 0.53 * s, -0.5 * s, 0.53 * s, -0.12 * s);
        ctx.bezierCurveTo(0.53 * s, 0.14 * s, 0.22 * s, 0.32 * s, 0, 0.5 * s);
        ctx.bezierCurveTo(-0.22 * s, 0.32 * s, -0.53 * s, 0.14 * s, -0.53 * s, -0.12 * s);
        ctx.bezierCurveTo(-0.53 * s, -0.5 * s, -0.08 * s, -0.48 * s, 0, -0.27 * s);
        ctx.closePath();
        break;
      }
      default: ctx.arc(0, 0, 0.5 * s, 0, Math.PI * 2);
    }
  }
  // a chunky painted shape (sticker-like: white border, cel shade, highlight)
  function drawShapeSolid(ctx, shape, color, size) {
    shape = SHAPES.indexOf(shape) >= 0 ? shape : 'circle';
    var c = col(color), s = size;
    ctx.save();
    ctx.lineJoin = 'round';
    traceShape(ctx, shape, s); ctx.lineWidth = Math.max(3, 0.11 * s); ctx.strokeStyle = '#FFFFFF'; ctx.stroke();
    traceShape(ctx, shape, s);
    var g = ctx.createRadialGradient(-0.16 * s, -0.18 * s, 0.03 * s, 0, 0, 0.64 * s);
    g.addColorStop(0, c.light); g.addColorStop(0.45, c.base); g.addColorStop(1, c.shade);
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = Math.max(1.6, 0.05 * s) * lineK(c); ctx.strokeStyle = lineCol(c); ctx.stroke();
    var hx = ({ heart: -0.27, triangle: -0.14, rect: -0.3, star: -0.12, square: -0.22 }[shape] || -0.2) * s;
    var hy = ({ heart: -0.18, triangle: 0.02, rect: -0.13, star: -0.1, square: -0.22 }[shape] || -0.2) * s;
    ell(ctx, hx, hy, 0.1 * s, 0.05 * s, -0.7); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
    ctx.restore();
  }

  // ================================================================ things (colour faces) — unit s, fit in s × s
  // outline colour / width factor: yellow gets a darker, 1.5× outline so it reads on the cream underside (QA)
  var YELLOW_LINE = '#A87A00';
  function lineCol(c) { return c.base === PALETTE.yellow[0] ? YELLOW_LINE : c.dark; }
  function lineK(c) { return c.base === PALETTE.yellow[0] ? 1.5 : 1; }
  function outline(ctx, c, s, k) { ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1.4, (k || 0.045) * s) * lineK(c); ctx.strokeStyle = lineCol(c); ctx.stroke(); }
  function shine(ctx, x, y, rx, ry, rot, a) { ell(ctx, x, y, rx, ry, rot); ctx.fillStyle = 'rgba(255,255,255,' + (a || 0.75) + ')'; ctx.fill(); }

  // butterfly: wingspan ≈ s, open = 0..1 (wing x-scale), front view
  function butterflyBody(ctx, c, s, open) {
    var k = clamp(open, 0.12, 1);
    var body = '#4A3A30', bodyD = '#2E241E';
    function wingUp() {   // right upper wing in wing space
      ctx.beginPath(); ctx.moveTo(0.02 * s, -0.04 * s);
      ctx.bezierCurveTo(0.1 * s, -0.36 * s, 0.38 * s, -0.46 * s, 0.47 * s, -0.33 * s);
      ctx.bezierCurveTo(0.54 * s, -0.2 * s, 0.4 * s, -0.04 * s, 0.03 * s, 0.02 * s);
      ctx.closePath();
    }
    function wingLo() {
      ctx.beginPath(); ctx.moveTo(0.03 * s, 0.02 * s);
      ctx.bezierCurveTo(0.3 * s, 0.02 * s, 0.4 * s, 0.18 * s, 0.33 * s, 0.31 * s);
      ctx.bezierCurveTo(0.26 * s, 0.42 * s, 0.08 * s, 0.32 * s, 0.02 * s, 0.1 * s);
      ctx.closePath();
    }
    for (var side = -1; side <= 1; side += 2) {
      ctx.save(); ctx.scale(side * k, 1);
      wingLo(); ctx.fillStyle = c.shade; ctx.fill(); outline(ctx, c, s, 0.04);
      ell(ctx, 0.22 * s, 0.2 * s, 0.05 * s, 0.05 * s, 0); ctx.fillStyle = c.light; ctx.fill();
      wingUp(); ctx.fillStyle = c.base; ctx.fill();
      ctx.save(); wingUp(); ctx.clip();
      ell(ctx, 0.36 * s, -0.3 * s, 0.13 * s, 0.1 * s, -0.4); ctx.fillStyle = rgba(c.dark, 0.35); ctx.fill();
      ctx.restore();
      wingUp(); outline(ctx, c, s, 0.04);
      ell(ctx, 0.3 * s, -0.24 * s, 0.075 * s, 0.065 * s, 0); ctx.fillStyle = '#FFFFFF'; ctx.fill();
      ctx.lineWidth = Math.max(1, 0.02 * s); ctx.strokeStyle = lineCol(c); ctx.stroke();
      ell(ctx, 0.3 * s, -0.24 * s, 0.035 * s, 0.03 * s, 0); ctx.fillStyle = c.dark; ctx.fill();
      shine(ctx, 0.16 * s, -0.22 * s, 0.05 * s, 0.025 * s, -0.9, 0.6);
      ctx.restore();
    }
    // antennae
    ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1.2, 0.025 * s); ctx.strokeStyle = bodyD;
    [-1, 1].forEach(function (sd) {
      ctx.beginPath(); ctx.moveTo(sd * 0.02 * s, -0.2 * s); ctx.quadraticCurveTo(sd * 0.05 * s, -0.36 * s, sd * 0.14 * s, -0.4 * s); ctx.stroke();
      ctx.beginPath(); ctx.arc(sd * 0.14 * s, -0.4 * s, Math.max(1.2, 0.03 * s), 0, Math.PI * 2); ctx.fillStyle = bodyD; ctx.fill();
    });
    // body
    ell(ctx, 0, 0.04 * s, 0.05 * s, 0.24 * s, 0); ctx.fillStyle = body; ctx.fill();
    ctx.lineWidth = Math.max(1, 0.02 * s); ctx.strokeStyle = bodyD; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -0.2 * s, 0.065 * s, 0, Math.PI * 2); ctx.fillStyle = body; ctx.fill(); ctx.stroke();
    ell(ctx, -0.015 * s, -0.04 * s, 0.015 * s, 0.08 * s, 0); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill();
  }
  function thingButterfly(ctx, c, s) { ctx.translate(0, 0.02 * s); butterflyBody(ctx, c, s * 1.05, 1); }

  function balloonBody(ctx, c, s, cx, cy) {
    function body() {
      ctx.beginPath(); ctx.moveTo(cx, cy - 0.38 * s);
      ctx.bezierCurveTo(cx + 0.2 * s, cy - 0.38 * s, cx + 0.31 * s, cy - 0.22 * s, cx + 0.31 * s, cy - 0.04 * s);
      ctx.bezierCurveTo(cx + 0.31 * s, cy + 0.16 * s, cx + 0.16 * s, cy + 0.34 * s, cx, cy + 0.37 * s);
      ctx.bezierCurveTo(cx - 0.16 * s, cy + 0.34 * s, cx - 0.31 * s, cy + 0.16 * s, cx - 0.31 * s, cy - 0.04 * s);
      ctx.bezierCurveTo(cx - 0.31 * s, cy - 0.22 * s, cx - 0.2 * s, cy - 0.38 * s, cx, cy - 0.38 * s);
      ctx.closePath();
    }
    poly(ctx, [[cx, cy + 0.35 * s], [cx + 0.055 * s, cy + 0.43 * s], [cx - 0.055 * s, cy + 0.43 * s]]);
    ctx.fillStyle = c.shade; ctx.fill(); outline(ctx, c, s, 0.03);
    body(); ctx.fillStyle = c.base; ctx.fill();
    ctx.save(); body(); ctx.clip();
    ell(ctx, cx + 0.2 * s, cy + 0.12 * s, 0.3 * s, 0.36 * s, 0.3); ctx.fillStyle = rgba(c.dark, 0.25); ctx.fill();
    ell(ctx, cx - 0.12 * s, cy - 0.16 * s, 0.16 * s, 0.18 * s, 0); ctx.fillStyle = rgba(c.light, 0.55); ctx.fill();
    ctx.restore();
    body(); outline(ctx, c, s);
    shine(ctx, cx - 0.14 * s, cy - 0.2 * s, 0.06 * s, 0.1 * s, 0.5, 0.85);
  }
  function thingBalloon(ctx, c, s) {
    ctx.beginPath(); ctx.moveTo(0, 0.31 * s);
    ctx.bezierCurveTo(0.08 * s, 0.37 * s, -0.08 * s, 0.43 * s, 0.03 * s, 0.5 * s);
    ctx.lineWidth = Math.max(1.2, 0.025 * s); ctx.strokeStyle = '#8C7B6E'; ctx.lineCap = 'round'; ctx.stroke();
    balloonBody(ctx, c, s * 1.08, 0, -0.1 * s);
  }

  function thingFlower(ctx, c, s) {
    // stem + two leaves (olive, never answer green) then a 5-petal daisy-like bloom
    ctx.beginPath(); ctx.moveTo(0, 0.02 * s); ctx.quadraticCurveTo(0.05 * s, 0.25 * s, 0, 0.5 * s);
    ctx.lineCap = 'round'; ctx.lineWidth = Math.max(2.4, 0.08 * s); ctx.strokeStyle = STEM.dark; ctx.stroke();
    ctx.lineWidth = Math.max(1.4, 0.045 * s); ctx.strokeStyle = STEM.base; ctx.stroke();
    [[0.02, 0.33, -0.5, 1], [0.01, 0.4, Math.PI + 0.5, -1]].forEach(function (L) {
      ctx.save(); ctx.translate(L[0] * s, L[1] * s); ctx.rotate(L[2]);
      leaflet(ctx, 0.22 * s, 0.42); ctx.fillStyle = STEM.base; ctx.fill(); ctx.lineWidth = Math.max(1, 0.025 * s); ctx.strokeStyle = STEM.dark; ctx.stroke();
      ctx.restore();
    });
    ctx.translate(0, -0.14 * s); ctx.scale(1.15, 1.15);
    var R = 0.3 * s;
    for (var p = 0; p < 5; p++) {
      var a = p * Math.PI * 2 / 5 - Math.PI / 2;
      ctx.save(); ctx.rotate(a);
      ctx.beginPath(); ctx.moveTo(0.06 * s, 0);
      ctx.bezierCurveTo(0.12 * s, -0.17 * s, R + 0.06 * s, -0.17 * s, R + 0.04 * s, 0);
      ctx.bezierCurveTo(R + 0.06 * s, 0.17 * s, 0.12 * s, 0.17 * s, 0.06 * s, 0);
      ctx.closePath();
      ctx.fillStyle = c.base; ctx.fill(); outline(ctx, c, s, 0.04);
      ell(ctx, R * 0.62, -0.035 * s, 0.07 * s, 0.03 * s, 0); ctx.fillStyle = rgba(c.light, 0.85); ctx.fill();
      ctx.restore();
    }
    var cc = c.base === COLORS.yellow.base ? COLORS.orange : COLORS.yellow;
    ctx.beginPath(); ctx.arc(0, 0, 0.12 * s, 0, Math.PI * 2);
    ctx.fillStyle = cc.base; ctx.fill(); ctx.lineWidth = Math.max(1.2, 0.035 * s); ctx.strokeStyle = lineCol(cc); ctx.stroke();
    [[-0.04, -0.03], [0.04, -0.02], [0, 0.04]].forEach(function (d) { ctx.beginPath(); ctx.arc(d[0] * s, d[1] * s, 0.017 * s, 0, Math.PI * 2); ctx.fillStyle = cc.dark; ctx.fill(); });
    shine(ctx, -0.05 * s, -0.06 * s, 0.03 * s, 0.018 * s, -0.7, 0.85);
  }

  function thingKite(ctx, c, s) {
    ctx.translate(-0.06 * s, -0.04 * s);
    ctx.beginPath(); ctx.moveTo(0.03 * s, 0.2 * s);
    ctx.bezierCurveTo(0.2 * s, 0.26 * s, 0.04 * s, 0.38 * s, 0.22 * s, 0.42 * s);
    ctx.bezierCurveTo(0.34 * s, 0.45 * s, 0.3 * s, 0.52 * s, 0.42 * s, 0.52 * s);
    ctx.lineWidth = Math.max(1.2, 0.022 * s); ctx.strokeStyle = '#8C7B6E'; ctx.lineCap = 'round'; ctx.stroke();
    [[0.11, 0.29, 0.6], [0.2, 0.41, -0.2], [0.34, 0.49, 0.3]].forEach(function (b) {
      ctx.save(); ctx.translate(b[0] * s, b[1] * s); ctx.rotate(b[2]);
      poly(ctx, [[0, 0], [-0.07 * s, -0.04 * s], [-0.07 * s, 0.04 * s]]); ctx.fillStyle = c.base; ctx.fill(); outline(ctx, c, s, 0.022);
      poly(ctx, [[0, 0], [0.07 * s, -0.04 * s], [0.07 * s, 0.04 * s]]); ctx.fillStyle = c.base; ctx.fill(); outline(ctx, c, s, 0.022);
      ctx.restore();
    });
    ctx.save(); ctx.rotate(-0.12);
    var T = [0, -0.44 * s], R = [0.3 * s, -0.13 * s], B = [0, 0.24 * s], L = [-0.3 * s, -0.13 * s], C = [0, -0.13 * s];
    poly(ctx, [T, R, B, L]); ctx.fillStyle = c.base; ctx.fill();
    poly(ctx, [T, C, L]); ctx.fillStyle = c.light; ctx.fill();
    poly(ctx, [C, R, B]); ctx.fillStyle = c.shade; ctx.fill();
    ctx.lineWidth = Math.max(1, 0.025 * s); ctx.strokeStyle = rgba(c.dark, 0.75);
    ctx.beginPath(); ctx.moveTo(T[0], T[1]); ctx.lineTo(B[0], B[1]); ctx.moveTo(L[0], L[1]); ctx.lineTo(R[0], R[1]); ctx.stroke();
    ctx.beginPath(); roundPoly(ctx, [T, R, B, L], 0.03 * s); outline(ctx, c, s);
    shine(ctx, -0.1 * s, -0.2 * s, 0.05 * s, 0.022 * s, -0.8, 0.8);
    ctx.restore();
  }

  function thingCup(ctx, c, s) {
    ctx.translate(-0.04 * s, 0.02 * s);
    ell(ctx, 0.04 * s, 0.33 * s, 0.46 * s, 0.085 * s, 0); ctx.fillStyle = '#FBF7EE'; ctx.fill();
    ctx.lineWidth = Math.max(1.2, 0.03 * s); ctx.strokeStyle = '#A8927A'; ctx.stroke();
    ell(ctx, 0.04 * s, 0.33 * s, 0.28 * s, 0.045 * s, 0); ctx.fillStyle = '#EDE3D3'; ctx.fill();
    ctx.beginPath(); ctx.arc(0.31 * s, 0.04 * s, 0.12 * s, -Math.PI / 2 - 0.2, Math.PI / 2 + 0.2);
    ctx.lineCap = 'round'; ctx.lineWidth = Math.max(3, 0.12 * s) * (lineK(c) > 1 ? 1.15 : 1); ctx.strokeStyle = lineCol(c); ctx.stroke();
    ctx.lineWidth = Math.max(1.6, 0.065 * s); ctx.strokeStyle = c.base; ctx.stroke();
    function mug() {
      ctx.beginPath(); ctx.moveTo(-0.3 * s, -0.18 * s); ctx.lineTo(0.32 * s, -0.18 * s);
      ctx.lineTo(0.29 * s, 0.2 * s); ctx.quadraticCurveTo(0.28 * s, 0.3 * s, 0.18 * s, 0.3 * s);
      ctx.lineTo(-0.16 * s, 0.3 * s); ctx.quadraticCurveTo(-0.26 * s, 0.3 * s, -0.27 * s, 0.2 * s); ctx.closePath();
    }
    mug(); ctx.fillStyle = c.base; ctx.fill();
    ctx.save(); mug(); ctx.clip();
    ctx.fillStyle = rgba(c.dark, 0.28); ctx.fillRect(0.15 * s, -0.2 * s, 0.2 * s, 0.52 * s);
    ctx.fillStyle = rgba(c.light, 0.8);
    [[-0.14, 0.02], [0.06, 0.12], [-0.04, -0.06], [0.16, -0.04], [-0.17, 0.2]].forEach(function (p) {
      ctx.beginPath(); ctx.arc(p[0] * s, p[1] * s, 0.035 * s, 0, Math.PI * 2); ctx.fill();
    });
    ctx.restore();
    mug(); outline(ctx, c, s);
    ell(ctx, 0.01 * s, -0.18 * s, 0.31 * s, 0.065 * s, 0); ctx.fillStyle = c.light; ctx.fill(); outline(ctx, c, s, 0.035);
    ell(ctx, 0.01 * s, -0.175 * s, 0.25 * s, 0.042 * s, 0); ctx.fillStyle = '#8A5A3C'; ctx.fill();
    ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1.4, 0.035 * s); ctx.strokeStyle = 'rgba(150,140,120,0.6)';
    [-0.08, 0.1].forEach(function (x) {
      ctx.beginPath(); ctx.moveTo(x * s, -0.26 * s);
      ctx.bezierCurveTo((x - 0.06) * s, -0.32 * s, (x + 0.06) * s, -0.38 * s, x * s, -0.45 * s); ctx.stroke();
    });
    shine(ctx, -0.2 * s, -0.05 * s, 0.025 * s, 0.07 * s, 0, 0.7);
  }

  function thingBoot(ctx, c, s) {
    ctx.translate(-0.06 * s, 0.02 * s);
    function boot() {
      ctx.beginPath(); ctx.moveTo(-0.24 * s, -0.4 * s); ctx.lineTo(0.1 * s, -0.4 * s);
      ctx.lineTo(0.1 * s, 0.06 * s);
      ctx.bezierCurveTo(0.22 * s, 0.07 * s, 0.42 * s, 0.1 * s, 0.44 * s, 0.26 * s);
      ctx.quadraticCurveTo(0.45 * s, 0.38 * s, 0.34 * s, 0.38 * s);
      ctx.lineTo(-0.2 * s, 0.38 * s); ctx.quadraticCurveTo(-0.26 * s, 0.38 * s, -0.26 * s, 0.32 * s);
      ctx.closePath();
    }
    boot(); ctx.fillStyle = c.base; ctx.fill();
    ctx.save(); boot(); ctx.clip();
    ctx.fillStyle = rgba(c.dark, 0.28); ctx.fillRect(0.0, -0.42 * s, 0.12 * s, 0.5 * s);
    ctx.beginPath(); ctx.moveTo(0.1 * s, 0.12 * s); ctx.quadraticCurveTo(0.36 * s, 0.14 * s, 0.46 * s, 0.3 * s); ctx.lineTo(0.46 * s, 0.4 * s); ctx.lineTo(0.1 * s, 0.4 * s); ctx.fill();
    ctx.fillStyle = c.dark; ctx.fillRect(-0.3 * s, 0.31 * s, 0.8 * s, 0.08 * s);
    ctx.restore();
    boot(); outline(ctx, c, s);
    rr(ctx, -0.28 * s, -0.47 * s, 0.42 * s, 0.11 * s, 0.04 * s); ctx.fillStyle = c.light; ctx.fill(); outline(ctx, c, s, 0.035);
    ctx.beginPath(); ctx.arc(0.13 * s, -0.415 * s, 0.05 * s, -Math.PI / 2 - 0.3, Math.PI / 2 + 0.3); ctx.lineWidth = Math.max(1.6, 0.035 * s); ctx.strokeStyle = lineCol(c); ctx.stroke();
    shine(ctx, -0.16 * s, -0.17 * s, 0.025 * s, 0.11 * s, 0, 0.7);
  }

  var THING_FN = { butterfly: thingButterfly, balloon: thingBalloon, flower: thingFlower, kite: thingKite, cup: thingCup, boot: thingBoot };
  function drawThing(ctx, obj, colorKey, size) {
    var fn = THING_FN[obj] || thingBalloon;
    ctx.save(); fn(ctx, col(colorKey), num(size, 80)); ctx.restore();
  }
  function drawButterfly(ctx, colorKey, size, flap) {
    var s = num(size, 40), f = num(flap, 0);
    ctx.save();
    butterflyBody(ctx, col(colorKey), s, 0.2 + 0.8 * Math.abs(Math.cos(f)));
    ctx.restore();
  }

  // ================================================================ star (as Gigi)
  function starPath(ctx, s, ro, ri) {
    var v = [], rad = [];
    for (var k = 0; k < 10; k++) {
      var ang = (-90 + k * 36) * Math.PI / 180, r = k % 2 ? ri : ro;
      v.push([Math.cos(ang) * r * s, Math.sin(ang) * r * s + 0.03 * s]); rad.push(k % 2 ? 0.04 * s : 0.08 * s);
    }
    ctx.beginPath(); roundPoly(ctx, v, rad);
  }
  function fitFont(ctx, text, maxW, px, weight) {
    ctx.font = (weight || 900) + ' ' + px + 'px ' + FONT;
    var w = ctx.measureText(text).width;
    if (w > maxW) { px = Math.max(6, px * maxW / w); ctx.font = (weight || 900) + ' ' + px + 'px ' + FONT; }
    return px;
  }
  function centredText(ctx, text, x, y, fill, outlineC, olw) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    var m = ctx.measureText(text), asc = m.actualBoundingBoxAscent, desc = m.actualBoundingBoxDescent;
    var by = (asc != null && desc != null && asc + desc > 0) ? y + (asc - desc) / 2 : y + parseFloat(String(ctx.font).replace(/^\D*?(\d+(\.\d+)?)px.*$/, '$1')) * 0.35;
    if (outlineC) { ctx.lineJoin = 'round'; ctx.lineWidth = olw; ctx.strokeStyle = outlineC; ctx.strokeText(text, x, by); }
    ctx.fillStyle = fill; ctx.fillText(text, x, by);
  }
  function drawStar(ctx, size, text, opt) {
    var s = num(size, 40), tw = (opt && opt.twinkle) || 0;
    ctx.save();
    var g = ctx.createRadialGradient(0, 0, 0.15 * s, 0, 0, 0.85 * s);
    g.addColorStop(0, 'rgba(255,240,170,0.75)'); g.addColorStop(0.55, 'rgba(255,220,110,0.28)'); g.addColorStop(1, 'rgba(255,220,110,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 0.85 * s, 0, Math.PI * 2); ctx.fill();
    starPath(ctx, s, 0.52, 0.27);
    var lg = ctx.createLinearGradient(-0.3 * s, -0.4 * s, 0.3 * s, 0.4 * s);
    lg.addColorStop(0, '#FFE58A'); lg.addColorStop(0.5, '#FFC83A'); lg.addColorStop(1, '#F5A623');
    ctx.fillStyle = lg; ctx.fill();
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(1.4, 0.045 * s); ctx.strokeStyle = '#C98612'; ctx.stroke();
    ell(ctx, -0.13 * s, -0.17 * s, 0.07 * s, 0.035 * s, -0.8); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
    if (text != null && text !== '') {
      var str = String(text);
      fitFont(ctx, str, 0.5 * s, Math.round(0.34 * s));
      centredText(ctx, str, 0, 0.05 * s, '#5A3208', 'rgba(255,248,215,0.9)', Math.max(1.5, 0.05 * s));
    }
    if (tw > 0) {
      ctx.save(); ctx.translate(0.36 * s, -0.36 * s); ctx.scale(tw, tw);
      ctx.beginPath();
      ctx.moveTo(0, -0.16 * s); ctx.quadraticCurveTo(0, 0, 0.16 * s, 0); ctx.quadraticCurveTo(0, 0, 0, 0.16 * s);
      ctx.quadraticCurveTo(0, 0, -0.16 * s, 0); ctx.quadraticCurveTo(0, 0, 0, -0.16 * s);
      ctx.fillStyle = '#FFFFFF'; ctx.fill(); ctx.restore();
    }
    ctx.restore();
  }

  // ================================================================ dots = round jungle berries in a dice layout
  var DOTS = {
    1: [1, 1, [[0, 0]]],
    2: [2, 2, [[1, 0], [0, 1]]],
    3: [3, 3, [[2, 0], [1, 1], [0, 2]]],
    4: [2, 2, [[0, 0], [1, 0], [0, 1], [1, 1]]],
    5: [3, 3, [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]]],
    6: [2, 3, [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2]]],
    7: [3, 3, [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [2, 2]]],
    8: [2, 4, [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2], [0, 3], [1, 3]]],
    9: [3, 3, [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2]]],
    10: [2, 5, [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2], [0, 3], [1, 3], [0, 4], [1, 4]]],
    11: [3, 4, [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2], [0, 3], [2, 3], [1, 0.5], [1, 1.5], [1, 2.5]]],
    12: [3, 4, [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [0, 2], [1, 2], [2, 2], [0, 3], [1, 3], [2, 3]]]
  };
  function drawBerry(ctx, r, c) {
    var g = ctx.createRadialGradient(-0.32 * r, -0.36 * r, 0.05 * r, 0, 0, r);
    g.addColorStop(0, mix(c.light, '#FFFFFF', 0.4)); g.addColorStop(0.45, c.base); g.addColorStop(1, c.shade);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = Math.max(1.2, 0.13 * r) * lineK(c); ctx.strokeStyle = lineCol(c); ctx.stroke();
    ell(ctx, -0.34 * r, -0.36 * r, 0.24 * r, 0.15 * r, -0.7); ctx.fillStyle = 'rgba(255,255,255,0.88)'; ctx.fill();
    // little calyx on top (olive, clearly not an answer colour)
    ctx.save(); ctx.translate(0.05 * r, -0.92 * r);
    ctx.fillStyle = STEM.base; ctx.strokeStyle = STEM.dark; ctx.lineWidth = Math.max(0.8, 0.06 * r);
    [-0.5, 0.5].forEach(function (a) { ctx.save(); ctx.rotate(-Math.PI / 2 + a * 1.5); leaflet(ctx, 0.45 * r, 0.5); ctx.fill(); ctx.stroke(); ctx.restore(); });
    ctx.restore();
  }
  function drawBerries(ctx, n, bw, bh, colorKey) {
    n = clamp(n | 0, 1, 12);
    var L = DOTS[n], cols = L[0], rows = L[1], c = col(colorKey || DOT_COLORS[(n - 1) % DOT_COLORS.length]);
    var cw = bw / cols, ch = bh / rows;
    var r = Math.min(cw, ch) * 0.36;
    if (n === 2 || n === 3) r = bw * (n === 2 ? 0.2 : 0.165);
    r = Math.min(r, bw * (n === 1 ? 0.27 : n <= 3 ? 0.2 : n === 4 ? 0.19 : n <= 6 ? 0.15 : 0.12));
    var gx = n <= 3 ? r * 2.45 : Math.min(cw, r * 2.9), gy = n <= 3 ? r * 2.45 : Math.min(ch, r * 2.9);
    var x0 = -gx * (cols - 1) / 2, y0 = -gy * (rows - 1) / 2 + 0.06 * r;
    L[2].forEach(function (p) { ctx.save(); ctx.translate(x0 + p[0] * gx, y0 + p[1] * gy); drawBerry(ctx, r, c); ctx.restore(); });
  }

  // ================================================================ offscreen cache
  var cache = {}, cacheN = 0, CACHE_MAX = 160;
  var tcache = [], TCACHE_MAX = 4;
  function makeCanvas(wpx, hpx) {
    if (typeof document !== 'undefined' && document && document.createElement) {
      var c = document.createElement('canvas'); c.width = wpx; c.height = hpx; return c;
    }
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(wpx, hpx);
    return null;
  }
  function ctxScale(ctx) {
    try {
      if (ctx.getTransform) { var m = ctx.getTransform(); var s = Math.sqrt(m.c * m.c + m.d * m.d); if (s > 0 && isFinite(s)) return s; }
    } catch (e) { /* ignore */ }
    return (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  }
  function bucket(v) { return Math.max(8, Math.round(v / 2) * 2); }
  // paints painter(c, W, H) centred into a cached bitmap of the bucketed size and blits it scaled to w × h at (cx, cy)
  function cached(ctx, id, w, h, painter, pad, cx, cy) {
    pad = pad || 2; cx = cx || 0; cy = cy || 0;
    var dpr = Math.min(4, Math.max(1, Math.round(ctxScale(ctx) * 2) / 2));
    var W = bucket(w), H = bucket(h);
    var key = id + '@' + W + 'x' + H + '@' + dpr, e = cache[key];
    if (!e) {
      var cv = makeCanvas(Math.ceil((W + 2 * pad) * dpr), Math.ceil((H + 2 * pad) * dpr));
      if (!cv) { ctx.save(); ctx.translate(cx, cy); ctx.scale(w / W, h / H); painter(ctx, W, H); ctx.restore(); return; }
      var c = cv.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, (W / 2 + pad) * dpr, (H / 2 + pad) * dpr);
      painter(c, W, H);
      if (cacheN >= CACHE_MAX) { cache = {}; cacheN = 0; }
      e = cache[key] = { cv: cv, W: W, H: H, pad: pad };
      cacheN++;
    }
    var kx = w / e.W, ky = h / e.H;
    ctx.drawImage(e.cv, cx + (-e.W / 2 - e.pad) * kx, cy + (-e.H / 2 - e.pad) * ky, (e.W + 2 * e.pad) * kx, (e.H + 2 * e.pad) * ky);
  }

  // ================================================================ faces
  function parityOf(face) {
    if (!face) return null;
    if (face.parity === 'odd' || face.parity === 'even') return face.parity;
    if (face.kind === 'parity') { var n = face.n != null ? face.n : +face.value; return isFinite(n) ? (n % 2 ? 'odd' : 'even') : null; }
    return null;
  }
  function isSticker(kind) { return kind === 'animal' || kind === 'food' || kind === 'home'; }
  function faceKind(face) {
    var k = face.kind;
    if (k === 'parity') k = face.dots || face.show === 'dots' || face.as === 'dots' ? 'dots' : 'number';
    return k;
  }
  function faceSig(f) {
    if (!f) return 'none';
    return [faceKind(f), isSticker(f.kind) ? '' : f.value, f.color, f.obj, f.shape, f.n, f.text, f.scale].join('|');
  }
  function stickerName(face) {
    if (face.sprite) return face.sprite;
    var pre = face.kind === 'food' ? 'food_' : face.kind === 'home' ? 'home_' : 'animal_';
    return pre + face.value;
  }
  // the face content alone, transparent background, centred in a bw × bh box (cached)
  function paintContent(ctx, bw, bh, face) {
    var k = face.scale == null ? 1 : num(face.scale, 1), kind = faceKind(face);
    ctx.save();
    if (kind !== 'shape') ctx.scale(k, k);
    switch (kind) {
      case 'color': {
        var sz = Math.min(bw * 1.0, bh * 1.0);
        drawThing(ctx, face.obj || 'balloon', face.color || face.value, sz);
        break;
      }
      case 'shape': {
        var sh = face.shape || face.value; if (SHAPES.indexOf(sh) < 0) sh = 'circle';
        var ls = Math.min(bw, bh) * (sh === 'rect' ? 0.88 : sh === 'triangle' ? 0.84 : sh === 'star' ? 0.9 : sh === 'heart' ? 0.9 : 0.8) * k;
        drawShapeSolid(ctx, sh, face.color || 'red', ls);
        break;
      }
      case 'dots': drawBerries(ctx, face.n != null ? face.n : +face.value, bw, bh, face.color); break;
      case 'animal': case 'food': case 'home': break;   // sprite drawn live by opt.sprite (shadow painted below)
      default: {
        var str = String(face.text != null ? face.text : face.value != null ? face.value : face.n != null ? face.n : '?');
        var isText = kind === 'text' || str.length > 2;
        var px = isText ? 0.4 * bh : str.length === 2 ? 0.7 * bh : 0.88 * bh;
        px = fitFont(ctx, str, bw * (isText ? 1.12 : str.length === 2 ? 0.62 : 1.0), Math.round(px));
        centredText(ctx, str, 0.02 * bw, 0.03 * bh, INK.soft);
        centredText(ctx, str, 0, 0, INK.ink);
      }
    }
    ctx.restore();
    if (isSticker(kind)) {
      var A = stickerBox(bw, bh, k);
      var rb = 0.46 * A.size;
      var gb = ctx.createRadialGradient(0, A.y, rb * 0.2, 0, A.y, rb);
      gb.addColorStop(0, rgba('#C9D8A6', 0.75)); gb.addColorStop(1, rgba('#B4C78C', 0.75));
      ctx.beginPath(); ctx.arc(0, A.y, rb, 0, Math.PI * 2); ctx.fillStyle = gb; ctx.fill();
      ctx.lineWidth = Math.max(1.2, 0.025 * A.size); ctx.strokeStyle = rgba('#7E9A55', 0.7); ctx.stroke();
      ell(ctx, 0, A.ground + 0.015 * A.sz, 0.34 * A.sz * k, 0.055 * A.sz * Math.max(0.7, k), 0);
      ctx.fillStyle = 'rgba(80,100,40,0.16)'; ctx.fill();
    }
  }
  // sticker box (animals / foods): sz = full box, ground = y of the sticker feet (stickers ≈ 110/128 of the box)
  function stickerBox(bw, bh, k) {
    var sz = Math.min(bw * 1.1, bh * 1.1), ground = 0.43 * sz;
    if (ground > bh * 0.5) ground = bh * 0.5;
    return { sz: sz, ground: ground, y: ground - 0.43 * sz * k, size: sz * k };
  }
  function drawContent(ctx, face, box, opt) {
    var bounce = num(opt && opt.bounce, 0), wig = num(opt && opt.wiggle, 0);
    ctx.save();
    ctx.translate(box.cx, box.cy - bounce);
    if (wig) { ctx.translate(0, box.h * 0.3); ctx.rotate(wig); ctx.translate(0, -box.h * 0.3); }
    cached(ctx, 'c:' + faceSig(face), box.w, box.h, function (c, W, H) { paintContent(c, W, H, face); }, Math.ceil(0.3 * box.w));
    if (isSticker(face.kind) && opt && typeof opt.sprite === 'function') {
      var A = stickerBox(box.w, box.h, face.scale == null ? 1 : num(face.scale, 1));
      opt.sprite(stickerName(face), 0, A.y, A.size);
    }
    ctx.restore();
  }

  // ================================================================ leaf geometry (local coords, leaf centred in w × h)
  function geometry(w, h, stem) {
    stem = Math.max(0, num(stem, 0));
    var top = -h / 2, notch = -0.43 * h;
    var fw = 0.68 * w, fh = Math.min(0.68 * w, 0.56 * h);
    var oy = top - Math.min(0.42 * stem, 0.1 * w) + 0.02 * h;
    return {
      w: w, h: h, stem: stem, top: top, notch: notch, tip: { x: 0.05 * w, y: 0.5 * h },
      face: { x: -fw / 2, y: -0.07 * h - fh / 2, w: fw, h: fh, cx: 0, cy: -0.07 * h },
      orchid: { x: 0.03 * w, y: oy, r: 0.12 * w },
      pivot: { x: 0, y: top - stem }
    };
  }
  // the leaf outline; m = +1 top side, −1 the underside (mirror image: the leaf turned over)
  function leafPath(ctx, w, h, m) {
    var X = function (v) { return m * v * w; }, Y = function (v) { return v * h; };
    ctx.beginPath();
    ctx.moveTo(0, Y(-0.43));
    ctx.bezierCurveTo(X(0.1), Y(-0.535), X(0.4), Y(-0.535), X(0.475), Y(-0.33));
    ctx.bezierCurveTo(X(0.535), Y(-0.15), X(0.47), Y(0.08), X(0.33), Y(0.24));
    ctx.bezierCurveTo(X(0.22), Y(0.36), X(0.1), Y(0.42), X(0.05), Y(0.5));
    ctx.bezierCurveTo(X(-0.02), Y(0.42), X(-0.19), Y(0.36), X(-0.31), Y(0.245));
    ctx.bezierCurveTo(X(-0.46), Y(0.1), X(-0.525), Y(-0.12), X(-0.47), Y(-0.33));
    ctx.bezierCurveTo(X(-0.4), Y(-0.535), X(-0.1), Y(-0.535), 0, Y(-0.43));
    ctx.closePath();
  }
  function midrib(u, w, h, m) {   // point on the midrib, u 0 (notch) .. 1 (tip)
    var a = 1 - u, x0 = 0, y0 = -0.43 * h, cx = 0.035 * w, cy = 0.02 * h, x1 = 0.048 * w, y1 = 0.47 * h;
    return [m * (a * a * x0 + 2 * a * u * cx + u * u * x1), a * a * y0 + 2 * a * u * cy + u * u * y1];
  }
  function halfW(v) {   // approximate half width (in w) of the leaf at y = v·h
    var P = [[-0.5, 0.2], [-0.4, 0.43], [-0.3, 0.49], [-0.15, 0.5], [0, 0.46], [0.15, 0.38], [0.3, 0.25], [0.42, 0.12], [0.5, 0.01]];
    for (var i = 1; i < P.length; i++) if (v <= P[i][0]) { var t = (v - P[i - 1][0]) / (P[i][0] - P[i - 1][0]); return P[i - 1][1] + (P[i][1] - P[i - 1][1]) * clamp(t, 0, 1); }
    return 0.01;
  }
  function veins(ctx, w, h, m, color, lw, mainLw) {
    ctx.lineCap = 'round'; ctx.strokeStyle = color;
    // midrib (tapering: two strokes)
    ctx.beginPath();
    var p0 = midrib(0, w, h, m), p1 = midrib(1, w, h, m);
    ctx.moveTo(p0[0], p0[1]); ctx.quadraticCurveTo(m * 0.035 * w, 0.02 * h, p1[0], p1[1]);
    ctx.lineWidth = mainLw * 0.6; ctx.stroke();
    ctx.beginPath(); var pm = midrib(0.55, w, h, m);
    ctx.moveTo(p0[0], p0[1]); ctx.quadraticCurveTo(m * 0.02 * w, -0.2 * h, pm[0], pm[1]);
    ctx.lineWidth = mainLw; ctx.stroke();
    ctx.lineWidth = lw;
    // basal veins fanning into the lobes
    [-1, 1].forEach(function (sd) {
      ctx.beginPath(); ctx.moveTo(p0[0], p0[1] + 0.01 * h);
      ctx.quadraticCurveTo(m * sd * 0.2 * w, -0.4 * h, m * sd * 0.36 * w, -0.33 * h); ctx.stroke();
    });
    // side veins curving up and out
    [0.3, 0.48, 0.65, 0.8].forEach(function (u) {
      var p = midrib(u, w, h, m), v = p[1] / h, ey = v - 0.07 - 0.04 * (1 - u);
      var hw = halfW(ey) * 0.8;
      [-1, 1].forEach(function (sd) {
        var ex = midrib(u, w, h, 1)[0] + sd * hw * w;
        ctx.beginPath(); ctx.moveTo(p[0], p[1]);
        ctx.quadraticCurveTo(m * (midrib(u, w, h, 1)[0] + sd * hw * 0.5 * w), p[1] - 0.012 * h, m * ex, ey * h);
        ctx.stroke();
      });
    });
  }
  // top side (green) — cached per leaf colour
  function paintLeafFront(ctx, w, h, L) {
    var lw = Math.max(1.6, 0.032 * w);
    leafPath(ctx, w, h, 1);
    var g = ctx.createLinearGradient(-0.4 * w, -0.45 * h, 0.4 * w, 0.45 * h);
    g.addColorStop(0, L.hi); g.addColorStop(0.45, L.base); g.addColorStop(1, L.shade);
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); leafPath(ctx, w, h, 1); ctx.clip();
    // one-step cel shade: the right half of the leaf (beyond the midrib) a step darker
    ctx.beginPath(); ctx.moveTo(0, -0.45 * h); ctx.quadraticCurveTo(0.035 * w, 0.02 * h, 0.05 * w, 0.52 * h);
    ctx.lineTo(0.7 * w, 0.6 * h); ctx.lineTo(0.7 * w, -0.6 * h); ctx.closePath();
    ctx.fillStyle = rgba(L.dark, 0.26); ctx.fill();
    // soft highlight upper-left
    ell(ctx, -0.25 * w, -0.25 * h, 0.17 * w, 0.09 * h, -0.6); ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill();
    ell(ctx, -0.29 * w, -0.3 * h, 0.06 * w, 0.022 * h, -0.65); ctx.fillStyle = 'rgba(255,255,255,0.26)'; ctx.fill();
    veins(ctx, w, h, 1, rgba(L.vein, 0.85), Math.max(1, 0.018 * w), Math.max(1.6, 0.04 * w));
    ctx.restore();
    leafPath(ctx, w, h, 1); ctx.lineJoin = 'round'; ctx.lineWidth = lw; ctx.strokeStyle = L.dark; ctx.stroke();
  }
  // underside (pale, the picture side) — cached per parity
  function paintLeafBack(ctx, w, h, parity) {
    var lw = Math.max(1.6, 0.032 * w);
    leafPath(ctx, w, h, -1);
    var g = ctx.createLinearGradient(0, -0.5 * h, 0, 0.5 * h);
    g.addColorStop(0, '#FAFCEC'); g.addColorStop(0.5, UNDER.fill); g.addColorStop(1, UNDER.fill2);
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); leafPath(ctx, w, h, -1); ctx.clip();
    // cel shade on the other half (mirrored), very soft
    ctx.beginPath(); ctx.moveTo(0, -0.45 * h); ctx.quadraticCurveTo(-0.035 * w, 0.02 * h, -0.05 * w, 0.52 * h);
    ctx.lineTo(0.7 * w, 0.6 * h); ctx.lineTo(0.7 * w, -0.6 * h); ctx.closePath();
    ctx.fillStyle = 'rgba(160,185,110,0.12)'; ctx.fill();
    veins(ctx, w, h, -1, rgba(UNDER.rim, 0.55), Math.max(1, 0.014 * w), Math.max(1.4, 0.03 * w));
    // inner rim band
    leafPath(ctx, w, h, -1); ctx.lineWidth = Math.max(3, 0.075 * w); ctx.strokeStyle = rgba(UNDER.rim, 0.9); ctx.stroke();
    if (parity) {
      var pc = parity === 'odd' ? COLORS.blue : COLORS.orange;
      leafPath(ctx, w, h, -1); ctx.lineWidth = Math.max(6, 0.15 * w); ctx.strokeStyle = pc.base; ctx.stroke();
      ctx.save(); ctx.translate(0, 0.004 * h); ctx.scale(0.86, 0.9); leafPath(ctx, w, h, -1); ctx.restore();
      ctx.lineWidth = Math.max(1, 0.012 * w); ctx.strokeStyle = pc.dark; ctx.stroke();
    }
    ell(ctx, 0.24 * w, -0.3 * h, 0.12 * w, 0.05 * h, 0.55); ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.fill();
    ctx.restore();
    leafPath(ctx, w, h, -1); ctx.lineJoin = 'round'; ctx.lineWidth = lw; ctx.strokeStyle = UNDER.line; ctx.stroke();
  }

  // ---- orchid (3 sepals, 2 petals, a lip, cream-yellow centre)
  function drawOrchid(ctx, x, y, r, color, scale, rot) {
    var sc = num(scale, 1); if (sc <= 0.01) return;
    var c = flowerCol(color), d = mix(c, '#7A5A80', 0.45), lip = mix(c, '#C98AA8', 0.3);
    ctx.save(); ctx.translate(x, y); ctx.rotate(num(rot, 0)); ctx.scale(sc, sc);
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(0.8, 0.09 * r); ctx.strokeStyle = d;
    [-Math.PI / 2, Math.PI / 2 + 0.75, Math.PI / 2 - 0.75].forEach(function (a) {   // sepals
      ctx.save(); ctx.rotate(a); leaflet(ctx, r, 0.4); ctx.fillStyle = mix(c, '#FFFFFF', 0.25); ctx.fill(); ctx.stroke(); ctx.restore();
    });
    [-0.35, Math.PI + 0.35].forEach(function (a) {   // petals (wide)
      ctx.save(); ctx.rotate(a); leaflet(ctx, 0.95 * r, 0.62); ctx.fillStyle = c; ctx.fill(); ctx.stroke(); ctx.restore();
    });
    // lip
    ctx.beginPath(); ctx.moveTo(-0.22 * r, 0.05 * r);
    ctx.bezierCurveTo(-0.34 * r, 0.5 * r, 0.34 * r, 0.5 * r, 0.22 * r, 0.05 * r); ctx.closePath();
    ctx.fillStyle = lip; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0.02 * r, 0.17 * r, 0, Math.PI * 2); ctx.fillStyle = '#FFF1B8'; ctx.fill();
    ctx.lineWidth = Math.max(0.6, 0.05 * r); ctx.strokeStyle = '#E2B84C'; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0.06 * r, 0.06 * r, 0, Math.PI * 2); ctx.fillStyle = '#F2C94C'; ctx.fill();
    ctx.restore();
  }

  function drawStem(ctx, w, h, stem, vine, vineDark) {
    var top = -h / 2 - stem, end = -0.425 * h, lw = Math.max(2.2, 0.042 * w);
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, top); ctx.quadraticCurveTo(0.05 * w, (top + end) / 2, 0, end);
    ctx.lineWidth = lw + Math.max(1.4, 0.022 * w); ctx.strokeStyle = vineDark; ctx.stroke();
    ctx.lineWidth = lw; ctx.strokeStyle = vine; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-0.006 * w, top + 0.2 * stem); ctx.quadraticCurveTo(0.03 * w, (top + end) / 2, -0.004 * w, end - 0.02 * h);
    ctx.lineWidth = Math.max(0.8, lw * 0.3); ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.stroke();
    if (stem > 2) {   // the knot where the stem is tied to the vine
      ell(ctx, 0, top + 0.01 * w, lw * 0.95, lw * 0.75, 0); ctx.fillStyle = vine; ctx.fill();
      ctx.lineWidth = Math.max(1, 0.016 * w); ctx.strokeStyle = vineDark; ctx.stroke();
    }
  }

  function halo(ctx, w, h, cy, color, a, k) {
    a = clamp(a, 0, 1); if (a < 0.01) return;
    var r = Math.max(w, h) * (k || 0.72);
    var g = ctx.createRadialGradient(0, cy, r * 0.25, 0, cy, r);
    g.addColorStop(0, rgba(color, 0.55 * a)); g.addColorStop(0.55, rgba(color, 0.25 * a)); g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, cy, r * 0.82, r, 0, 0, Math.PI * 2); ctx.fill();
  }

  // ================================================================ public: leaf
  function drawLeaf(ctx, w, h, face, open, opt) {
    opt = opt || {};
    w = Math.max(4, num(w, 120)); h = Math.max(4, num(h, w / 0.78));
    var o = clamp(num(open, 0), -0.25, 1.25);
    var th = o * Math.PI, sx = Math.cos(th), sn = Math.sin(th), ax = Math.abs(sx);
    var back = sx < 0;
    var L = leafCols(opt.leaf, opt.leafDark);
    var vine = isHex(opt.vine) ? opt.vine : STEM.base, vineDark = isHex(opt.vineDark) ? opt.vineDark : (isHex(opt.vine) ? mix(opt.vine, '#1E2A12', 0.38) : STEM.dark);
    var stem = Math.max(0, num(opt.stem, 0));
    var light = clamp(num(opt.light, 0), 0, 1), glow = clamp(num(opt.glow, 0), 0, 1), night = clamp(num(opt.night, 0), 0, 1);
    var bloom = clamp(num(opt.bloom, 0), 0, 1.3);
    var parity = parityOf(face);
    var G = geometry(w, h, stem);
    ctx.save();
    if (opt.alpha != null && num(opt.alpha, 1) < 1) ctx.globalAlpha *= Math.max(0, num(opt.alpha, 1));

    // ---- halos behind (narrower while edge-on)
    var hk = Math.max(0.35, ax);
    if (night > 0.01 || glow > 0.01 || light > 0.01) {
      ctx.save(); ctx.scale(hk, 1);
      if (night > 0.01) halo(ctx, w, h, 0, '#9FC2FF', 0.22 * night, 0.62);
      if (glow > 0.01) halo(ctx, w, h, 0, opt.glowColor && isHex(opt.glowColor) ? opt.glowColor : '#FFF3A8', glow, 0.78);
      if (light > 0.01) halo(ctx, w, h, 0, '#FFD866', 0.6 * light, 0.66);
      ctx.restore();
      if (light > 0.01) {   // the sunbeam slanting in from the upper left
        ctx.save();
        var bg = ctx.createLinearGradient(-0.9 * w, -1.6 * h, 0.1 * w, 0.2 * h);
        var ba = 0.16 * light * (1 - 0.75 * night);
        bg.addColorStop(0, rgba('#FFF6C8', 0)); bg.addColorStop(0.65, rgba('#FFF6C8', ba)); bg.addColorStop(1, rgba('#FFF6C8', 0));
        ctx.fillStyle = bg;
        poly(ctx, [[-0.95 * w, -1.5 * h], [-0.55 * w, -1.5 * h], [0.45 * w, 0.3 * h], [-0.1 * w, 0.4 * h]]); ctx.fill();
        ctx.restore();
      }
    }

    // ---- stem (behind the leaf)
    drawStem(ctx, w, h, stem, vine, vineDark);

    // ---- the turning leaf: scale x by |sx|, a little twist (shear) and drop while turning
    ctx.save();
    var shear = 0.075 * sn, sy = 1 - 0.035 * Math.abs(sn);
    ctx.translate(0, -0.45 * h);                 // turn about the stem point
    ctx.transform(1, shear, 0, sy, 0, 0);
    ctx.translate(0, 0.45 * h);
    var m = back ? -1 : 1;
    // leaf thickness strip (shows while turning)
    if (Math.abs(sn) > 0.02) {
      var tk = Math.max(1.5, 0.045 * w) * sn;
      ctx.save(); ctx.translate(tk, 0); ctx.scale(Math.max(ax, 0.001), 1);
      leafPath(ctx, w, h, m); ctx.fillStyle = back ? UNDER.line : L.dark; ctx.fill();
      ctx.restore();
    }
    if (ax < 0.05) {   // never vanish: a minimum sliver of the leaf in its rim colour
      ctx.save(); ctx.scale(0.05, 1);
      leafPath(ctx, w, h, m); ctx.fillStyle = back ? UNDER.rim : L.shade; ctx.fill();
      ctx.lineWidth = Math.max(1, 0.02 * w); ctx.strokeStyle = back ? UNDER.line : L.dark; ctx.stroke();
      ctx.restore();
    }
    if (ax > 0.004) {
      ctx.save(); ctx.scale(ax, 1);
      if (!back) {
        cached(ctx, 'lf:' + L.base + L.dark, w, h, function (c, W, H) { paintLeafFront(c, W, H, L); }, Math.ceil(0.05 * w));
      } else {
        cached(ctx, 'lb:' + (parity || ''), w, h, function (c, W, H) { paintLeafBack(c, W, H, parity); }, Math.ceil(0.05 * w));
        if (light > 0.01) {   // warm sunlit underside
          leafPath(ctx, w, h, -1); ctx.fillStyle = rgba(UNDER.lit, 0.55 * light); ctx.fill();
        }
      }
      // shading while turning (the leaf faces away from the light)
      var shade = 0.3 * Math.abs(sn) * (back ? 0.8 : 1);
      if (shade > 0.01) { leafPath(ctx, w, h, m); ctx.fillStyle = back ? 'rgba(90,110,60,' + shade.toFixed(3) + ')' : rgba(L.dark, shade * 1.4); ctx.fill(); }
      if (night > 0.01) {   // soft inner moon-glow + moon rim
        var ng = ctx.createRadialGradient(0.15 * w, -0.25 * h, 0.05 * w, 0, 0, 0.7 * h);
        ng.addColorStop(0, rgba('#CFE0FF', 0.1 * night)); ng.addColorStop(1, rgba('#CFE0FF', 0));
        leafPath(ctx, w, h, m); ctx.fillStyle = ng; ctx.fill();
        ctx.save(); leafPath(ctx, w, h, m); ctx.clip();
        ctx.translate(-0.02 * w, 0.015 * h); leafPath(ctx, w, h, m); ctx.lineWidth = Math.max(2, 0.04 * w); ctx.strokeStyle = rgba('#D8E6FF', 0.55 * night); ctx.stroke();
        ctx.restore();
      }
      if (back && face && sx < -0.05) drawContent(ctx, face, G.face, opt);
      if (light > 0.01) {   // golden lit rim
        leafPath(ctx, w, h, m); ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(3, 0.075 * w) / Math.max(ax, 0.3); ctx.strokeStyle = rgba(GOLD, light); ctx.stroke();
        ctx.lineWidth = Math.max(1, 0.02 * w) / Math.max(ax, 0.3); ctx.strokeStyle = rgba('#FFFFFF', 0.75 * light); ctx.stroke();
      }
      if (glow > 0.01) {
        leafPath(ctx, w, h, m); ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(2.5, 0.055 * w) / Math.max(ax, 0.3); ctx.strokeStyle = rgba('#FFF6B8', 0.95 * glow); ctx.stroke();
      }
      ctx.restore();
    }
    // edge-on: a thin bright edge so the leaf never vanishes
    if (ax < 0.22) {
      var ea = 1 - ax / 0.22, ew = Math.max(2, 0.045 * w);
      ctx.beginPath(); ctx.moveTo(0, -0.43 * h); ctx.bezierCurveTo(0.05 * w * sn, -0.1 * h, 0.06 * w * sn, 0.25 * h, 0.03 * w, 0.5 * h);
      ctx.lineCap = 'round';
      ctx.lineWidth = ew + 2; ctx.strokeStyle = rgba(L.dark, ea); ctx.stroke();
      ctx.lineWidth = ew; ctx.strokeStyle = rgba(mix(L.base, '#FFFFFF', 0.45), ea); ctx.stroke();
    }
    ctx.restore();

    // ---- orchid blooming on the stem just above the leaf
    if (bloom > 0.01) {
      var sc = bloom < 1 ? backOut(bloom) : 1 + (bloom - 1) * 0.5;
      drawOrchid(ctx, G.orchid.x, G.orchid.y, G.orchid.r, opt.flower, sc, 0.18);
    }
    ctx.restore();
  }

  // the face alone on a pale leaf-underside tile (Talk-time choices, title)
  function drawFace(ctx, w, h, face, opt) {
    opt = opt || {};
    w = Math.max(4, num(w, 120)); h = Math.max(4, num(h, w));
    face = face || { kind: 'number', value: '?' };
    ctx.save();
    if (opt.alpha != null && num(opt.alpha, 1) < 1) ctx.globalAlpha *= Math.max(0, num(opt.alpha, 1));
    if (num(opt.glow, 0) > 0) halo(ctx, w, h, 0, opt.glowColor && isHex(opt.glowColor) ? opt.glowColor : '#FFF3A8', clamp(opt.glow, 0, 1), 0.72);
    if (!opt.plain) {
      var parity = parityOf(face);
      cached(ctx, 'tile:' + (parity || ''), w, h, function (c, W, H) {
        var r = 0.16 * Math.min(W, H), lw = Math.max(1.5, 0.026 * W);
        rr(c, -W / 2 + lw / 2, -H / 2 + lw / 2, W - lw, H - lw, r);
        var g = c.createLinearGradient(0, -H / 2, 0, H / 2);
        g.addColorStop(0, '#FAFCEC'); g.addColorStop(0.6, UNDER.fill); g.addColorStop(1, UNDER.fill2);
        c.fillStyle = g; c.fill();
        var pc = parity ? (parity === 'odd' ? COLORS.blue : COLORS.orange) : null;
        c.lineWidth = pc ? Math.max(4, 0.08 * W) : Math.max(2.5, 0.045 * W); c.strokeStyle = pc ? pc.base : UNDER.rim; c.stroke();
        rr(c, -W / 2 + lw / 2, -H / 2 + lw / 2, W - lw, H - lw, r); c.lineWidth = Math.max(1, 0.014 * W); c.strokeStyle = pc ? pc.dark : UNDER.line; c.stroke();
        // a small leaf on the corner
        c.save(); c.translate(W / 2 - 0.07 * W, -H / 2 + 0.07 * H); c.rotate(-2.4);
        leaflet(c, 0.2 * W, 0.42); c.fillStyle = LEAVES.jungle[0]; c.fill(); c.lineWidth = Math.max(1, 0.014 * W); c.strokeStyle = LEAVES.jungle[1]; c.stroke();
        c.restore();
      }, Math.ceil(0.08 * w));
    }
    var bw = w * (opt.plain ? 0.94 : 0.74), bh = h * (opt.plain ? 0.94 : 0.74);
    drawContent(ctx, face, { cx: 0, cy: 0, w: bw, h: bh }, opt);
    ctx.restore();
  }

  // ================================================================ public: tree
  function treeCols(tree) {
    tree = tree || {};
    var b = pick(tree.bark, BARKS, BARKS.brown);
    var bark = b[0], barkDark = isHex(tree.barkDark) ? tree.barkDark.toUpperCase() : (b[1] || mix(bark, '#2A1E16', 0.38));
    var L = leafCols(tree.leaf, tree.leafDark);
    var moss = isHex(tree.moss) ? tree.moss : MOSS;
    var vine = isHex(tree.vine) ? tree.vine : STEM.base;
    return {
      bark: bark, barkDark: barkDark, barkLight: mix(bark, '#FFFFFF', 0.16), moss: moss, mossDark: mix(moss, '#2E4A22', 0.42),
      // canopy clusters: darker and calmer than the hanging leaves so the cards stand out
      can: mix(L.base, barkDark, 0.32), canDark: mix(L.dark, '#1A2A1A', 0.25), canLight: mix(L.base, '#8DBA6A', 0.25),
      vine: vine, vineDark: isHex(tree.vineDark) ? tree.vineDark : (isHex(tree.vine) ? mix(tree.vine, '#1E2A12', 0.38) : STEM.dark),
      flower: flowerCol(tree.flower), kind: KINDS.indexOf(tree.kind) >= 0 ? tree.kind : 'kapok', seed: num(tree.seed, 1) | 0
    };
  }
  function treeGeom(rect) {
    var R = { x: num(rect.x, 0), y: num(rect.y, 0), w: Math.max(20, num(rect.w, 300)), h: Math.max(20, num(rect.h, 300)) };
    R.pad = Math.max(10, num(rect.pad, Math.max(26, 0.06 * R.w)));
    R.roofH = Math.max(12, num(rect.roofH, Math.max(30, 0.34 * 120)));
    R.ground = R.y + R.h;
    R.branchY = R.y - 0.5 * R.roofH;
    R.bt = Math.max(14, 0.78 * R.roofH);
    return R;
  }
  function trunkSpec(R, T, side) {
    var p = R.pad, half = T.kind === 'palm' ? 0.34 * p : T.kind === 'fig' ? 0.6 * p : 0.66 * p;
    var limit = side < 0 ? R.x + 0.9 * p : R.x + R.w - 0.9 * p;   // never under a leaf (leaves start at x + pad)
    var inner = side < 0 ? R.x + 0.8 * p : R.x + R.w - 0.8 * p;
    var c = side < 0 ? inner - half : inner + half;
    return { c: c, half: half, side: side, limit: limit };
  }
  // trunk outline sampled top → bottom; returns {left:[...], right:[...]}
  function trunkPts(R, T, tr, r) {
    var top = R.branchY - 0.2 * R.bt, bot = R.ground, n = 22, L = [], Rt = [];
    var ph = r() * 6.28, amp = (T.kind === 'fig' ? 0.12 : T.kind === 'palm' ? 0.18 : 0.06) * R.pad;
    for (var i = 0; i <= n; i++) {
      var v = i / n, y = top + (bot - top) * v;
      var bend = Math.sin(v * Math.PI * 1.2 + ph) * amp * (1 - v * 0.6);
      var flare = T.kind === 'palm' ? 0.9 + 0.15 * v + 0.45 * Math.pow(v, 6) : 0.8 + 0.25 * v + 0.6 * Math.pow(v, 5) + 0.35 * Math.pow(1 - v, 8);
      // the trunk only flares OUTWARD; the inner edge is clamped to the pad limit
      var hwOut = tr.half * flare, hwIn = tr.half * Math.min(1, flare);
      if (tr.side < 0) { L.push([tr.c + bend - hwOut, y]); Rt.push([Math.min(tr.limit, tr.c + bend + hwIn), y]); }
      else { L.push([Math.max(tr.limit, tr.c + bend - hwIn), y]); Rt.push([tr.c + bend + hwOut, y]); }
    }
    return { L: L, R: Rt, top: top, bot: bot };
  }
  function pathPts(ctx, P, Q) {   // closed path along P then Q reversed (smooth with midpoints)
    ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]);
    var A = P.concat(Q.slice().reverse());
    for (var i = 1; i < A.length - 1; i++) ctx.quadraticCurveTo(A[i][0], A[i][1], (A[i][0] + A[i + 1][0]) / 2, (A[i][1] + A[i + 1][1]) / 2);
    ctx.lineTo(A[A.length - 1][0], A[A.length - 1][1]);
    ctx.closePath();
  }
  function drawRoots(ctx, R, T, tr, P, r, lw) {
    var g = R.ground, base = P.L[P.L.length - 1], baseR = P.R[P.R.length - 1];
    var out = tr.side;   // −1 left trunk → roots spread to the left (outward) mostly
    var roots = T.kind === 'kapok' ? [[-1, 1.05, 0.3], [1, 0.75, 0.24], [-1, 0.55, 0.16]] :
      T.kind === 'fig' ? [[-1, 0.8, 0.22], [1, 0.6, 0.2], [-1, 0.45, 0.32], [1, 0.35, 0.3]] : [[-1, 0.3, 0.08], [1, 0.3, 0.08]];
    roots.forEach(function (rt) {
      var dir = rt[0] * (out < 0 ? 1 : -1);   // +1 → outward
      var sx = dir > 0 ? (out < 0 ? base[0] : baseR[0]) : (out < 0 ? baseR[0] : base[0]);
      var reach = rt[1] * R.pad * (dir > 0 ? 1.25 : 0.7), hgt = rt[2] * Math.min(R.h, 420) * (T.kind === 'kapok' ? 1.05 : 0.7);
      var ex = sx + (out < 0 ? -1 : 1) * dir * reach;
      var inx = sx - (out < 0 ? -1 : 1) * dir * 0.18 * R.pad;
      var lim = function (x) { return out < 0 ? Math.min(x, tr.limit) : Math.max(x, tr.limit); };
      ex = lim(ex); inx = lim(inx); sx = lim(sx);
      ctx.beginPath(); ctx.moveTo(inx, g - hgt);
      ctx.quadraticCurveTo(sx + (ex - sx) * 0.25, g - hgt * 0.25, ex, g + 2);
      ctx.lineTo(inx + (sx - inx) * 0.2, g + 2); ctx.closePath();
      ctx.fillStyle = T.bark; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = T.barkDark; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(inx + (ex - inx) * 0.3, g - hgt * 0.45); ctx.quadraticCurveTo(sx + (ex - sx) * 0.4, g - hgt * 0.1, ex - (ex - sx) * 0.15, g);
      ctx.lineWidth = Math.max(1, lw * 0.7); ctx.strokeStyle = rgba(T.barkDark, 0.5); ctx.stroke();
    });
  }
  function drawTrunk(ctx, R, T, tr, r) {
    var P = trunkPts(R, T, tr, r), lw = Math.max(1.6, Math.min(3.2, R.pad / 14));
    drawRoots(ctx, R, T, tr, P, r, lw);
    pathPts(ctx, P.L, P.R);
    var g = ctx.createLinearGradient(tr.c - tr.half, 0, tr.c + tr.half, 0);
    g.addColorStop(0, T.barkLight); g.addColorStop(0.45, T.bark); g.addColorStop(1, mix(T.bark, T.barkDark, 0.55));
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); pathPts(ctx, P.L, P.R); ctx.clip();
    if (T.kind === 'palm') {   // ring segments
      ctx.strokeStyle = rgba(T.barkDark, 0.55); ctx.lineWidth = Math.max(1.2, lw * 0.8);
      for (var y = P.top + 0.6 * R.roofH; y < P.bot - 8; y += Math.max(14, tr.half * 0.9)) {
        var k = Math.round(((y - P.top) / (P.bot - P.top)) * 22), a = P.L[Math.min(22, k)], b = P.R[Math.min(22, k)];
        ctx.beginPath(); ctx.moveTo(a[0], y); ctx.quadraticCurveTo((a[0] + b[0]) / 2, y + 5, b[0], y); ctx.stroke();
      }
    } else {   // vertical grain
      ctx.strokeStyle = rgba(T.barkDark, 0.45); ctx.lineWidth = Math.max(1, lw * 0.7); ctx.lineCap = 'round';
      var nl = T.kind === 'fig' ? 5 : 3;
      for (var i = 0; i < nl; i++) {
        var u = (i + 0.5) / nl - 0.5, y0 = P.top + (P.bot - P.top) * (0.08 + 0.3 * r()), y1 = y0 + (P.bot - P.top) * (0.35 + 0.3 * r());
        ctx.beginPath();
        for (var s = 0; s <= 10; s++) {
          var yy = y0 + (y1 - y0) * s / 10, kk = Math.round(((yy - P.top) / (P.bot - P.top)) * 22), a2 = P.L[clamp(kk, 0, 22)], b2 = P.R[clamp(kk, 0, 22)];
          var xx = (a2[0] + b2[0]) / 2 + u * (b2[0] - a2[0]) * 0.8 + Math.sin(s * 0.9 + i) * 1.5;
          if (s) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy);
        }
        ctx.stroke();
      }
      // knot hole
      var ky = P.top + (P.bot - P.top) * (0.35 + 0.2 * r()), kc = Math.round(((ky - P.top) / (P.bot - P.top)) * 22);
      var kx = (P.L[kc][0] + P.R[kc][0]) / 2 + (r() - 0.5) * tr.half * 0.5, kr = tr.half * 0.28;
      ell(ctx, kx, ky, kr, kr * 1.4, 0); ctx.fillStyle = mix(T.barkDark, '#1E140E', 0.4); ctx.fill();
      ctx.lineWidth = Math.max(1.5, kr * 0.35); ctx.strokeStyle = T.barkLight; ctx.stroke();
    }
    // cel shade (right side) + highlight strip (left)
    ctx.fillStyle = rgba(T.barkDark, 0.28);
    ctx.beginPath(); ctx.moveTo(P.R[0][0], P.R[0][1]);
    P.R.forEach(function (p) { ctx.lineTo(p[0], p[1]); });
    for (var j = P.R.length - 1; j >= 0; j--) ctx.lineTo(P.R[j][0] - tr.half * 0.55, P.R[j][1]);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rgba('#FFFFFF', 0.18); ctx.lineWidth = Math.max(2, tr.half * 0.18); ctx.beginPath();
    P.L.forEach(function (p, i2) { if (i2) ctx.lineTo(p[0] + tr.half * 0.3, p[1]); else ctx.moveTo(p[0] + tr.half * 0.3, p[1]); });
    ctx.stroke();
    // moss patches on the trunk
    ctx.fillStyle = rgba(T.moss, 0.85);
    for (var q = 0; q < 2; q++) {
      var my = P.top + (P.bot - P.top) * (0.2 + 0.5 * r()), mk = Math.round(((my - P.top) / (P.bot - P.top)) * 22);
      var mx = tr.side < 0 ? P.L[mk][0] : P.R[mk][0];
      ell(ctx, mx, my, tr.half * 0.4, tr.half * 0.22, 0); ctx.fill();
      ell(ctx, mx + tr.half * 0.2 * -tr.side, my + tr.half * 0.2, tr.half * 0.25, tr.half * 0.15, 0); ctx.fill();
    }
    ctx.restore();
    pathPts(ctx, P.L, P.R); ctx.lineJoin = 'round'; ctx.lineWidth = lw; ctx.strokeStyle = T.barkDark; ctx.stroke();
    if (T.kind === 'fig') {   // aerial roots hanging from the branch alongside the trunk
      ctx.lineCap = 'round';
      for (var f = 0; f < 3; f++) {
        var fx = tr.c + tr.side * tr.half * (1.15 + 0.3 * f);   // outward side only
        var fy1 = R.ground - R.h * (0.15 + 0.25 * r());
        ctx.beginPath(); ctx.moveTo(fx, R.branchY);
        ctx.bezierCurveTo(fx + 6, R.branchY + (fy1 - R.branchY) * 0.4, fx - 6, R.branchY + (fy1 - R.branchY) * 0.7, fx + 2, fy1);
        ctx.lineWidth = Math.max(2.4, lw * 1.4); ctx.strokeStyle = T.barkDark; ctx.stroke();
        ctx.lineWidth = Math.max(1.2, lw * 0.7); ctx.strokeStyle = T.barkLight; ctx.stroke();
      }
    }
    return P;
  }
  // liana wrapping a trunk (in front of it) with a dangling curly end
  function drawLiana(ctx, R, T, tr, P, r) {
    var top = R.branchY + R.bt * 0.3, bot = R.ground - R.h * (0.35 + 0.2 * r()), turns = 2.2, n = 40, lw = Math.max(2, R.pad * 0.1);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    for (var i = 0; i <= n; i++) {
      var v = i / n, y = top + (bot - top) * v, k = clamp(Math.round(((y - P.top) / (P.bot - P.top)) * 22), 0, 22);
      var cx = (P.L[k][0] + P.R[k][0]) / 2, hw = (P.R[k][0] - P.L[k][0]) / 2 * 1.05;
      var x = cx + Math.sin(v * turns * Math.PI * 2 + (tr.side < 0 ? 0 : 2)) * hw;
      x = tr.side < 0 ? Math.min(x, tr.limit) : Math.max(x, tr.limit);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.lineWidth = lw + 2; ctx.strokeStyle = T.vineDark; ctx.stroke();
    ctx.lineWidth = lw; ctx.strokeStyle = T.vine; ctx.stroke();
    // a few little leaves on the liana
    for (var j = 1; j < 5; j++) {
      var v2 = j / 5, y2 = top + (bot - top) * v2, k2 = clamp(Math.round(((y2 - P.top) / (P.bot - P.top)) * 22), 0, 22);
      var cx2 = (P.L[k2][0] + P.R[k2][0]) / 2, hw2 = (P.R[k2][0] - P.L[k2][0]) / 2 * 1.05;
      var x2 = cx2 + Math.sin(v2 * turns * Math.PI * 2 + (tr.side < 0 ? 0 : 2)) * hw2;
      x2 = tr.side < 0 ? Math.min(x2, tr.limit - R.pad * 0.3) : Math.max(x2, tr.limit + R.pad * 0.3);
      ctx.save(); ctx.translate(x2, y2); ctx.rotate((j % 2 ? -0.6 : Math.PI + 0.6));
      leaflet(ctx, R.pad * 0.32, 0.45); ctx.fillStyle = T.canLight; ctx.fill(); ctx.lineWidth = 1.2; ctx.strokeStyle = T.canDark; ctx.stroke();
      ctx.restore();
    }
  }
  function drawCluster(ctx, x, y, s, T, r, n, droop) {
    n = n || 7;
    for (var pass = 0; pass < 2; pass++) {
      for (var i = 0; i < n; i++) {
        var a = -Math.PI + (i + 0.5) / n * Math.PI * (droop ? 1.6 : 1.15) - (droop ? 0.3 : 0.05) + (r() - 0.5) * 0.25;
        if (pass === 1 && i % 2) continue;
        var L = s * (pass ? 0.75 : 1) * (0.8 + 0.35 * r());
        ctx.save(); ctx.translate(x, y); ctx.rotate(a);
        leaflet(ctx, L, 0.34);
        ctx.fillStyle = pass ? T.canLight : T.can; ctx.fill();
        ctx.lineWidth = Math.max(1.2, s * 0.035); ctx.strokeStyle = T.canDark; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(L * 0.08, 0); ctx.lineTo(L * 0.85, 0); ctx.lineWidth = Math.max(0.8, s * 0.02); ctx.strokeStyle = rgba('#FFFFFF', 0.25); ctx.stroke();
        ctx.restore();
      }
    }
  }
  function drawPalmCrown(ctx, x, y, s, T, r) {
    for (var i = 0; i < 7; i++) {
      var a = -Math.PI + 0.15 + i * (Math.PI - 0.3) / 6, L = s * (0.9 + 0.3 * r());
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      // arching frond: a curved rib with leaflets
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(L * 0.5, -L * 0.12, L, L * 0.25);
      ctx.lineWidth = Math.max(2, s * 0.05); ctx.strokeStyle = T.canDark; ctx.lineCap = 'round'; ctx.stroke();
      for (var j = 1; j < 8; j++) {
        var u = j / 8, px = L * u, py = -L * 0.12 * 4 * u * (1 - u) * 0.5 + L * 0.25 * u * u;
        [-1, 1].forEach(function (sd) {
          ctx.save(); ctx.translate(px, py); ctx.rotate(sd * 1.1 + 0.3);
          leaflet(ctx, s * 0.28 * (1 - u * 0.5), 0.3); ctx.fillStyle = sd > 0 ? T.can : T.canLight; ctx.fill();
          ctx.lineWidth = 1; ctx.strokeStyle = T.canDark; ctx.stroke(); ctx.restore();
        });
      }
      ctx.restore();
    }
  }
  function branchPts(R, T, x0, x1) {
    var arch = (T.kind === 'fig' ? 0.6 : T.kind === 'palm' ? 0.22 : 0.42) * R.roofH, n = 24, top = [], bot = [];
    for (var i = 0; i <= n; i++) {
      var u = i / n, x = x0 + (x1 - x0) * u, lift = arch * 4 * u * (1 - u), wob = Math.sin(u * 9 + T.seed) * R.bt * 0.05;
      var thick = R.bt * (0.78 + 0.6 * Math.abs(u - 0.5));
      top.push([x, R.branchY - lift - thick / 2 + wob]); bot.push([x, R.branchY - lift + thick / 2 + wob]);
    }
    return { top: top, bot: bot, arch: arch };
  }
  function paintTree(ctx, R, T) {
    var r = rng(T.seed * 7919 + 13), lw = Math.max(1.6, Math.min(3.2, R.pad / 14));
    var trL = trunkSpec(R, T, -1), trR = trunkSpec(R, T, 1);
    var x0 = trL.c - trL.half * 0.6, x1 = trR.c + trR.half * 0.6;
    var B = branchPts(R, T, x0, x1);
    ctx.lineJoin = 'round';
    // canopy clusters behind the branch: big at both ends, 1–2 small ones in the middle
    var cs = R.roofH * 1.25;
    if (T.kind === 'palm') {
      drawPalmCrown(ctx, trL.c, R.branchY - R.bt * 0.3, cs * 1.5, T, r);
      drawPalmCrown(ctx, trR.c, R.branchY - R.bt * 0.3, cs * 1.5, T, r);
    } else {   // big clusters behind the trunk tops (a second pass in front later hides the joints)
      drawCluster(ctx, trL.c - R.pad * 0.2, B.top[0][1] - R.bt * 0.2, cs * 1.35, T, r, 9, false);
      drawCluster(ctx, trR.c + R.pad * 0.2, B.top[24][1] - R.bt * 0.2, cs * 1.35, T, r, 9, false);
    }
    var nm = R.w > 700 ? 3 : R.w > 420 ? 2 : 1;
    for (var m = 0; m < nm; m++) {
      var u = (m + 1) / (nm + 1) + (r() - 0.5) * 0.08, k = Math.round(u * 24);
      drawCluster(ctx, B.top[k][0], B.top[k][1] + R.bt * 0.25, cs * 0.75, T, r, 6, false);
    }
    // trunks
    var PL = drawTrunk(ctx, R, T, trL, r), PR = drawTrunk(ctx, R, T, trR, r);
    // branch
    pathPts(ctx, B.top, B.bot);
    var bg = ctx.createLinearGradient(0, R.branchY - R.bt, 0, R.branchY + R.bt * 0.6);
    bg.addColorStop(0, T.barkLight); bg.addColorStop(0.5, T.bark); bg.addColorStop(1, mix(T.bark, T.barkDark, 0.6));
    ctx.fillStyle = bg; ctx.fill();
    ctx.save(); pathPts(ctx, B.top, B.bot); ctx.clip();
    ctx.strokeStyle = rgba(T.barkDark, 0.4); ctx.lineWidth = Math.max(1, lw * 0.6); ctx.lineCap = 'round';
    for (var g = 0; g < 4; g++) {
      var ua = 0.08 + r() * 0.6, ub = ua + 0.15 + r() * 0.2, f = 0.35 + 0.4 * r();
      ctx.beginPath();
      for (var s = 0; s <= 8; s++) {
        var uu = ua + (ub - ua) * s / 8, kk = clamp(Math.round(uu * 24), 0, 24), y = B.top[kk][1] + (B.bot[kk][1] - B.top[kk][1]) * f;
        if (s) ctx.lineTo(B.top[kk][0], y); else ctx.moveTo(B.top[kk][0], y);
      }
      ctx.stroke();
    }
    ctx.restore();
    pathPts(ctx, B.top, B.bot); ctx.lineWidth = lw; ctx.strokeStyle = T.barkDark; ctx.stroke();
    // moss along the top of the branch (lumpy band)
    ctx.fillStyle = T.moss; ctx.strokeStyle = T.mossDark; ctx.lineWidth = Math.max(1, lw * 0.6);
    ctx.beginPath();
    for (var q = 0; q < 48; q++) {
      var pa = B.top[q >> 1], pb = B.top[Math.min(24, (q >> 1) + 1)], f2 = (q & 1) * 0.5;
      var px = pa[0] + (pb[0] - pa[0]) * f2, py = pa[1] + (pb[1] - pa[1]) * f2 + R.bt * 0.06;
      var rad = R.bt * (0.2 + 0.09 * Math.sin(q * 1.7 + T.seed) + 0.05 * Math.sin(q * 0.43));
      ctx.moveTo(px + rad, py); ctx.arc(px, py, rad, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.fillStyle = rgba('#FFFFFF', 0.22);
    for (q = 1; q < 24; q += 3) { ell(ctx, B.top[q][0] - 2, B.top[q][1], R.bt * 0.1, R.bt * 0.05, 0); ctx.fill(); }
    // soft shade under the branch
    ctx.fillStyle = rgba(T.barkDark, 0.18);
    ctx.beginPath(); ctx.moveTo(B.bot[2][0], B.bot[2][1]);
    for (q = 2; q <= 22; q++) ctx.lineTo(B.bot[q][0], B.bot[q][1] + 1);
    for (q = 22; q >= 2; q--) ctx.lineTo(B.bot[q][0], B.bot[q][1] + R.bt * 0.25);
    ctx.closePath(); ctx.fill();
    // lianas wrapping the trunks
    drawLiana(ctx, R, T, trL, PL, r); drawLiana(ctx, R, T, trR, PR, r);
    if (T.kind !== 'palm') {   // drooping foliage over both forks, in front of the branch
      drawCluster(ctx, trL.c + R.pad * 0.15, B.top[1][1] + R.bt * 0.35, cs * 0.95, T, r, 7, true);
      drawCluster(ctx, trR.c - R.pad * 0.15, B.top[23][1] + R.bt * 0.35, cs * 0.95, T, r, 7, true);
    }
    // orchids sitting on the branch
    var no = Math.max(2, Math.min(5, Math.round(R.w / 180)));
    for (var o = 0; o < no; o++) {
      var uo = clamp((o + 0.5) / no + (r() - 0.5) * 0.1, 0.06, 0.94), ko = Math.round(uo * 24);
      drawOrchid(ctx, B.top[ko][0], B.top[ko][1] - R.bt * 0.05, Math.max(7, R.roofH * 0.26), T.flower, 1, (r() - 0.5) * 0.6);
    }
  }
  function treeBounds(R) {
    var bx = Math.floor(R.x - 2.4 * R.pad - 20), by = Math.floor(R.branchY - R.roofH * 2.6 - 30);
    return { x: bx, y: by, w: Math.ceil(R.x + R.w + 2.4 * R.pad + 20 - bx), h: Math.ceil(R.ground + 8 - by) };
  }
  function paintTreeAt(c, R, T, night) {
    var Bd = treeBounds(R);
    c.save(); c.translate(-Bd.x, -Bd.y);
    paintTree(c, R, T);
    c.restore();
    if (night) {   // night tint, only over the tree's own pixels
      c.save(); c.globalCompositeOperation = 'source-atop';
      c.fillStyle = 'rgba(30,42,74,0.5)'; c.fillRect(0, 0, Bd.w, Bd.h);
      c.restore();
    }
  }
  function treeBitmap(ctx, R, T, night, key) {
    var dpr = Math.min(2, Math.max(1, Math.round(ctxScale(ctx) * 2) / 2)), k = key + (night ? '|n' : '|d');
    for (var i = 0; i < tcache.length; i++) if (tcache[i].key === k && tcache[i].dpr === dpr) return tcache[i];
    var Bd = treeBounds(R), cv = makeCanvas(Math.ceil(Bd.w * dpr), Math.ceil(Bd.h * dpr));
    if (!cv) return null;
    var c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintTreeAt(c, R, T, night);
    var e = { key: k, dpr: dpr, cv: cv, B: Bd };
    tcache.unshift(e); if (tcache.length > TCACHE_MAX) tcache.length = TCACHE_MAX;
    return e;
  }
  // y of row vine i at x (sag 0.06 of its length; knots → the vine passes through each knot x at row.y)
  function vineY(row, x, t, i, sway) {
    if (!row) return 0;
    var x0 = num(row.x0, 0), x1 = num(row.x1, x0 + 1), y = num(row.y, 0), sw = num(sway, 0) * Math.sin(num(t, 0) * 1.1 + num(i, 0) * 1.7);
    var ks = row.knots && row.knots.length ? [x0].concat(row.knots.map(Number).filter(isFinite).sort(function (a, b) { return a - b; }), [x1]) : [x0, x1];
    for (var j = 1; j < ks.length; j++) {
      if (x <= ks[j] || j === ks.length - 1) {
        var a = ks[j - 1], b = ks[j], len = Math.max(1, b - a), u = clamp((x - a) / len, 0, 1);
        return y + (0.06 * len + sw) * 4 * u * (1 - u);
      }
    }
    return y;
  }
  function drawVine(ctx, row, i, T, t, sway, scale) {
    var x0 = num(row.x0, 0), x1 = num(row.x1, x0 + 1), len = Math.max(1, x1 - x0), n = Math.max(8, Math.round(len / 14));
    var lw = Math.max(3, 4.5 * scale);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    for (var s = 0; s <= n; s++) { var x = x0 + len * s / n, y = vineY(row, x, t, i, sway); if (s) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.lineWidth = lw + 2.4; ctx.strokeStyle = T.vineDark; ctx.stroke();
    ctx.lineWidth = lw; ctx.strokeStyle = T.vine; ctx.stroke();
    ctx.lineWidth = Math.max(1, lw * 0.28); ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.save(); ctx.translate(0, -lw * 0.22); ctx.stroke(); ctx.restore();
    // little leaves and a curl or two along the vine
    var nl = Math.max(2, Math.round(len / 70)), r = rng((T.seed + 3) * 131 + i * 17);
    for (var j = 0; j < nl; j++) {
      var u = (j + 0.3 + 0.4 * r()) / nl, lx = x0 + len * u, ly = vineY(row, lx, t, i, sway), up = j % 2 ? 1 : -1;
      ctx.save(); ctx.translate(lx, ly); ctx.rotate(up * (0.9 + 0.4 * r()) + (up > 0 ? 0 : Math.PI) + Math.sin(num(t, 0) * 1.6 + j) * 0.08);
      leaflet(ctx, 14 * scale, 0.42); ctx.fillStyle = up > 0 ? T.canLight : T.can; ctx.fill();
      ctx.lineWidth = 1.1; ctx.strokeStyle = T.canDark; ctx.stroke();
      ctx.restore();
    }
    for (var e = 0; e < 2; e++) {   // tendril curls at both ends
      var ex = e ? x1 - 10 * scale : x0 + 10 * scale, ey = vineY(row, ex, t, i, sway), d = e ? -1 : 1;
      ctx.beginPath(); ctx.moveTo(ex, ey);
      ctx.bezierCurveTo(ex + d * 6 * scale, ey + 10 * scale, ex + d * 14 * scale, ey + 6 * scale, ex + d * 10 * scale, ey + 1 * scale);
      ctx.lineWidth = Math.max(1.2, 1.6 * scale); ctx.strokeStyle = T.vineDark; ctx.stroke();
    }
  }
  function drawTree(ctx, rect, tree, opt) {
    opt = opt || {}; rect = rect || {};
    var R = treeGeom(rect), T = treeCols(tree);
    var light = clamp(num(opt.light, 0), 0, 1), night = clamp(num(opt.night, 0), 0, 1), t = num(opt.t, 0);
    var sway = opt.sway == null ? 1.5 : num(opt.sway, 1.5);
    var key = ['t', T.bark, T.barkDark, T.can, T.moss, T.vine, T.flower, T.kind, T.seed, Math.round(R.x), Math.round(R.y), Math.round(R.w),
      Math.round(R.h), Math.round(R.pad), Math.round(R.roofH)].join('|');
    ctx.save();
    var Bd = treeBounds(R);
    var day = night < 0.999 && opt.cache !== false ? treeBitmap(ctx, R, T, false, key) : null;
    var nt = night > 0.001 && opt.cache !== false ? treeBitmap(ctx, R, T, true, key) : null;
    if (night < 0.999) {
      if (day) ctx.drawImage(day.cv, Bd.x, Bd.y, Bd.w, Bd.h);
      else paintTree(ctx, R, T);
    }
    if (night > 0.001) {
      if (nt) { ctx.globalAlpha *= night; ctx.drawImage(nt.cv, Bd.x, Bd.y, Bd.w, Bd.h); ctx.globalAlpha /= night; }
      else if (night >= 0.999 || !day) {
        if (night >= 0.999) paintTree(ctx, R, T);
        ctx.fillStyle = rgba('#1E2A4A', 0.32 * night);   // uncached fallback: a plain tint over the tree rect
        ctx.fillRect(Bd.x, Bd.y, Bd.w, Bd.h);
      }
    }
    // row vines (live: they sway)
    var rows = rect.rows || [], sc = clamp(R.pad / 34, 0.7, 1.5);
    for (var i = 0; i < rows.length; i++) {
      if (!rows[i]) continue;
      if (night > 0.01) { ctx.save(); drawVine(ctx, rows[i], i, T, t, sway, sc); ctx.restore(); }
      else drawVine(ctx, rows[i], i, T, t, sway, sc);
    }
    if (night > 0.01 && rows.length) {   // a faint moonlit sheen over the vines so they read at night
      for (i = 0; i < rows.length; i++) {
        if (!rows[i]) continue;
        var x0 = num(rows[i].x0, 0), x1 = num(rows[i].x1, x0 + 1);
        ctx.beginPath(); for (var s2 = 0; s2 <= 12; s2++) { var xx = x0 + (x1 - x0) * s2 / 12, yy = vineY(rows[i], xx, t, i, sway) - 2; if (s2) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); }
        ctx.lineWidth = 1.4; ctx.strokeStyle = rgba('#CFE0FF', 0.35 * night); ctx.stroke();
      }
    }
    if (light > 0.01) {   // cheer: warm glow over the tree
      var g = ctx.createRadialGradient(R.x + R.w / 2, R.y + R.h * 0.25, 0, R.x + R.w / 2, R.y + R.h * 0.25, Math.max(R.w, R.h) * 0.8);
      g.addColorStop(0, rgba('#FFF1C2', 0.4 * light)); g.addColorStop(1, rgba('#FFE29A', 0));
      ctx.fillStyle = g; ctx.fillRect(R.x - R.pad, R.y - R.roofH * 2, R.w + 2 * R.pad, R.h + R.roofH * 2);
    }
    ctx.restore();
  }

  // ================================================================ garland (cheer)
  var GARLAND = [ORCHIDS.lilac, ORCHIDS.white, ORCHIDS.blush, '#FFE9A8', '#CFE8F5'];
  function drawGarland(ctx, x0, y0, x1, y1, t) {
    x0 = num(x0, 0); y0 = num(y0, 0); x1 = num(x1, x0 + 100); y1 = num(y1, y0); t = num(t, 0);
    var len = Math.max(1, Math.hypot(x1 - x0, y1 - y0)), sag = len * (0.1 + 0.012 * Math.sin(t * 1.4));
    var mx = (x0 + x1) / 2, my = (y0 + y1) / 2 + sag * 2;
    var fs = clamp(len / 18, 9, 22), n = Math.max(3, Math.floor(len / (fs * 2.1)));
    ctx.save();
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, x1, y1);
    ctx.lineCap = 'round'; ctx.lineWidth = Math.max(2.4, fs * 0.28); ctx.strokeStyle = STEM.dark; ctx.stroke();
    ctx.lineWidth = Math.max(1.4, fs * 0.17); ctx.strokeStyle = STEM.base; ctx.stroke();
    for (var i = 0; i < n; i++) {
      var u = (i + 0.5) / n, a = 1 - u;
      var px = a * a * x0 + 2 * a * u * mx + u * u * x1, py = a * a * y0 + 2 * a * u * my + u * u * y1;
      var sway = Math.sin(t * 2.3 + i * 0.9) * 0.2;
      ctx.save(); ctx.translate(px, py); ctx.rotate(sway);
      ctx.save(); ctx.rotate(i % 2 ? 0.5 : Math.PI - 0.5); leaflet(ctx, fs * 0.9, 0.42); ctx.fillStyle = MOSS; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = STEM.dark; ctx.stroke(); ctx.restore();
      drawOrchid(ctx, 0, fs * 0.35, fs * 0.55, GARLAND[i % GARLAND.length], 1, sway);
      ctx.restore();
    }
    ctx.restore();
  }

  LL.LeafArt = {
    YELLOW_LINE: YELLOW_LINE,
    COLORS: COLORS, SHAPES: SHAPES, THINGS: THINGS, LEAVES: LEAVES, BARKS: BARKS, ORCHIDS: ORCHIDS, UNDER: UNDER, STEM: STEM,
    MOSS: MOSS, GOLD: GOLD, INK: INK, KINDS: KINDS, DOT_LAYOUTS: DOTS,
    drawLeaf: drawLeaf, drawFace: drawFace, drawTree: drawTree, drawThing: drawThing, drawButterfly: drawButterfly,
    drawGarland: drawGarland, drawStar: drawStar, drawOrchid: drawOrchid, drawShape: drawShapeSolid, traceShape: traceShape,
    geometry: geometry, vineY: vineY,
    clearCache: function () { cache = {}; cacheN = 0; tcache = []; },
    _contrast: contrast, _saturation: saturation, _chroma: chroma, _lum: lum, _faceSig: faceSig, _mix: mix,
    _trunkInner: function (rect, tree) {   // innermost x of the left / right trunk outlines (tests: trunks never under a leaf)
      var R = treeGeom(rect || {}), T = treeCols(tree), out = [];
      [-1, 1].forEach(function (sd) {
        var tr = trunkSpec(R, T, sd), P = trunkPts(R, T, tr, rng(T.seed * 7919 + 13));
        out.push(sd < 0 ? Math.max.apply(null, P.R.map(function (p) { return p[0]; })) : Math.min.apply(null, P.L.map(function (p) { return p[0]; })));
      });
      return { left: out[0], right: out[1], pad: R.pad, x: R.x, w: R.w };
    },
    _cacheSize: function () { return cacheN + tcache.length; }
  };
})(typeof window !== 'undefined' ? (window.LL = window.LL || {}) : (globalThis.LL = globalThis.LL || {}));
