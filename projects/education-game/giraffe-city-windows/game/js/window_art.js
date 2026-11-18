// GW.WindowArt — code-drawn windows (hinged wooden shutters), faces, buildings and street props for Gigi's Peekaboo Windows
// (character artist B). Contract: docs/DESIGN.md §3, §6.4. Classic script; safe to require() in node: document / canvases
// are only touched lazily inside draw calls (no canvas → everything is painted directly, uncached).
//
// Everything is drawn CENTRED at (0,0) in the current transform unless stated:
//   drawWindow(ctx, w, h, face, open, opt)  a window of the cell w × h (w:h = 0.78): lintel + frame + sill + warm room + face
//                                           (open > 0.02) + two louvred shutters hinged on the opening's outer edges that
//                                           swing TOWARDS the viewer in true 3D perspective (open 0 closed … 1 open … 1.12
//                                           overshoot). The flower box hangs below the cell (≈ 0.14·w into the gap).
//   drawFace(ctx, w, h, face, opt)          the face alone on a cream window-tile (Talk-time choices, title); opt.plain → no tile
//   drawBuilding(ctx, rect, building, opt)  NOT centred: rect = layout.grid.building {x, y, w, h, roofH}; the roof band is
//                                           drawn above rect.y (rect.y − roofH … rect.y)
//   drawThing(ctx, obj, colorKey, size)     umbrella | balloon | car | kite | cup | boot, fits a size × size box
//   drawBunting(ctx, x0, y0, x1, y1, t)     absolute coords; a sagging string of muted flags that sway with t (seconds)
//   drawBalloon(ctx, colorKey, size, t)     balloon body centred at (0,0), width = size, string hangs to ≈ +1.9·size
//   drawStar(ctx, size, text, opt)          as Dee's CardArt.drawStar
//   geometry(w, h)                          the window's parts in its local coords (opening, sill, flower box …) for the
//                                           renderer / world (pigeon perch = sill top)
//
// drawWindow opt: { shutter '#hex' | name, trim '#hex' | name, light 0..1, glow 0..1, glowColor, bloom 0..1.2,
//   bloomColor colourKey | '#hex' | 'mixed', box (default true: an empty flower box is always there), bounce px (face lifts
//   UP by this many px), wiggle rad, sprite(name, x, y, size), rain 0..1, t seconds (rain drop slide / sway), seed (rain
//   drop layout, e.g. the card index), alpha 0..1 }
// face: { kind:'color'|'shape'|'dots'|'number'|'letter'|'text'|'animal'|'home'|'parity', value, color?, obj?, shape?,
//         sprite?, text?, n?, scale?, parity?:'odd'|'even' (window FRAME in blue / orange on any kind) }
// Bitmaps cached per (key, size bucket of 2 px, device scale from the context's Y axis): face contents (transparent), the
// static window frame, the pair of CLOSED shutters, buildings (≤ 3, at ≤ 2× device scale). Glow / light / bloom / rain and
// moving shutters are drawn live (vector, exact perspective).
(function (GW) {
  'use strict';

  // ================================================================ palette & colour helpers
  var PALETTE = {
    red: ['#E84A4A', '#A8282E'], blue: ['#3C8DE8', '#1F5BA8'], yellow: ['#FFD23F', '#C99A12'],
    green: ['#4CC26B', '#2A8343'], orange: ['#FF9A2E', '#C4650C'], purple: ['#9B6BE0', '#6840A8'],
    pink: ['#FF8FC0', '#C9558A']
  };
  var FACADES = { brickrose: '#E6B8A2', cream: '#F2E3C6', sage: '#C9D8B6', skygrey: '#C8D6E2', lilacgrey: '#D9CFE0', sand: '#EAD4AE' };
  var SHUTTERS = { teal: '#5E9E97', slateblue: '#6C86A6', olive: '#8E9A5B', terracotta: '#B9775E' };
  var ALIAS = { brick: 'brickrose', rose: 'brickrose', sky: 'skygrey', grey: 'skygrey', lilac: 'lilacgrey', slate: 'slateblue' };
  var TRIM = '#FBF7EE';
  var ROOM = {
    wall: '#FFF6E2', wall2: '#FBEBCD', lit: '#FFE9A8', lit2: '#FFDD8A', floor: '#F4DFBC', recess: '#5E4A3E',
    curtain: '#F2D6C4', curtainSh: '#E0B6A1', curtainLine: '#C4947E', ink: '#3D2814', inkSoft: '#EBDABB'
  };
  var WOOD = { box: '#A8744A', boxSh: '#875A35', boxLine: '#6A4428', soil: '#6B4A33', leaf: '#5FB36B', leafSh: '#3F8A4D' };
  var FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", "Segoe UI", system-ui, -apple-system, sans-serif';
  var SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'rect'];
  var THINGS = ['umbrella', 'balloon', 'car', 'kite', 'cup', 'boot'];
  var DOT_COLORS = ['red', 'blue', 'green', 'purple', 'orange'];   // dots face light colour by n (never yellow on cream)

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hexRgb(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  function rgbHex(c) {
    return '#' + c.map(function (v) { var s = Math.max(0, Math.min(255, Math.round(v))).toString(16); return s.length < 2 ? '0' + s : s; }).join('').toUpperCase();
  }
  function mix(a, b, t) { var x = hexRgb(a), y = hexRgb(b); return rgbHex([0, 1, 2].map(function (i) { return x[i] + (y[i] - x[i]) * t; })); }
  function rgba(hex, a) { var c = hexRgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (+clamp(a, 0, 1)).toFixed(3) + ')'; }
  function lum(hex) {
    var c = hexRgb(hex).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) { var la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }
  function chroma(hex) { var c = hexRgb(hex); return (Math.max.apply(null, c) - Math.min.apply(null, c)) / 255; }
  function saturation(hex) { // HSL saturation 0..1
    var c = hexRgb(hex).map(function (v) { return v / 255; }), mx = Math.max.apply(null, c), mn = Math.min.apply(null, c), l = (mx + mn) / 2;
    if (mx === mn) return 0;
    return l > 0.5 ? (mx - mn) / (2 - mx - mn) : (mx - mn) / (mx + mn);
  }

  var COLORS = {};
  Object.keys(PALETTE).forEach(function (k) {
    var base = PALETTE[k][0], dark = PALETTE[k][1];
    COLORS[k] = { base: base, dark: dark, light: mix(base, '#FFFFFF', 0.42), shade: mix(base, dark, 0.5) };
  });
  function col(key) {
    if (COLORS[key]) return COLORS[key];
    if (typeof key === 'string' && /^#[0-9a-f]{6}$/i.test(key)) {
      var d = mix(key, '#2A1E1A', 0.38);
      return { base: key, dark: d, light: mix(key, '#FFFFFF', 0.42), shade: mix(key, d, 0.5) };
    }
    return COLORS.red;
  }
  function resolve(v, table, dflt) {
    if (typeof v === 'string') {
      if (/^#[0-9a-f]{6}$/i.test(v)) return v.toUpperCase();
      var k = v.toLowerCase().replace(/[\s_-]/g, '');
      k = ALIAS[k] || k;
      if (table[k]) return table[k];
    }
    return dflt;
  }

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

  // ================================================================ shapes (unit = s, centred) — as Dee's CardArt
  function traceShape(ctx, shape, s) {
    ctx.beginPath();
    switch (shape) {
      case 'square': roundPoly(ctx, [[-0.43 * s, -0.43 * s], [0.43 * s, -0.43 * s], [0.43 * s, 0.43 * s], [-0.43 * s, 0.43 * s]], 0.1 * s); break;
      case 'rect': roundPoly(ctx, [[-0.52 * s, -0.3 * s], [0.52 * s, -0.3 * s], [0.52 * s, 0.3 * s], [-0.52 * s, 0.3 * s]], 0.09 * s); break;
      case 'triangle': roundPoly(ctx, [[0, -0.64 * s], [0.6 * s, 0.4 * s], [-0.6 * s, 0.4 * s]], 0.11 * s); break;
      case 'star': {
        var v = [], rad = [];
        for (var k = 0; k < 10; k++) {
          var ang = (-90 + k * 36) * Math.PI / 180, r = k % 2 ? 0.27 * s : 0.6 * s;
          v.push([Math.cos(ang) * r, Math.sin(ang) * r + 0.03 * s]); rad.push(k % 2 ? 0.05 * s : 0.08 * s);
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
  function capY(shape, s) { return ({ circle: -0.5, square: -0.43, rect: -0.3, triangle: -0.5, star: -0.52, heart: -0.28 }[shape] || -0.5) * s; }

  // paper lantern in a shape (Dee's lantern) — hangs in the window on a cord
  function drawLantern(ctx, shape, color, size, glow) {
    shape = SHAPES.indexOf(shape) >= 0 ? shape : 'circle';
    var c = col(color), s = size, lw = Math.max(1.4, 0.045 * s), cy = capY(shape, s);
    glow = clamp(glow || 0, 0, 1);
    ctx.save();
    if (glow > 0.01) {
      var g0 = ctx.createRadialGradient(0, 0, s * 0.2, 0, 0, s * 0.9);
      g0.addColorStop(0, rgba(mix(c.light, '#FFF6C8', 0.5), 0.6 * glow));
      g0.addColorStop(0.5, rgba(c.light, 0.28 * glow));
      g0.addColorStop(1, rgba(c.light, 0));
      ctx.fillStyle = g0; ctx.beginPath(); ctx.arc(0, 0, s * 0.9, 0, Math.PI * 2); ctx.fill();
    }
    traceShape(ctx, shape, s);
    var g = ctx.createRadialGradient(-0.08 * s, -0.04 * s, 0.03 * s, 0, 0.02 * s, 0.62 * s);
    g.addColorStop(0, mix(c.light, '#FFF8D8', 0.35 + 0.3 * glow));
    g.addColorStop(0.42, c.base); g.addColorStop(1, c.shade);
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.lineWidth = Math.max(1, 0.022 * s); ctx.strokeStyle = rgba(c.dark, 0.35);
    [-0.24, 0.24].forEach(function (k) {
      ctx.beginPath(); ctx.moveTo(k * s * 0.4, -0.7 * s); ctx.quadraticCurveTo(k * s * 1.6, 0, k * s * 0.4, 0.7 * s); ctx.stroke();
    });
    ctx.restore();
    traceShape(ctx, shape, s);
    ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.strokeStyle = c.dark; ctx.stroke();
    var hx = ({ heart: -0.26, triangle: -0.12, rect: -0.3, star: -0.12 }[shape] || -0.2) * s;
    var hy = ({ heart: -0.17, triangle: -0.06, rect: -0.12, star: -0.12 }[shape] || -0.2) * s;
    ell(ctx, hx, hy, 0.1 * s, 0.055 * s, -0.7); ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fill();
    rr(ctx, -0.12 * s, cy - 0.1 * s, 0.24 * s, 0.11 * s, 0.035 * s);
    ctx.fillStyle = '#D4A843'; ctx.fill(); ctx.lineWidth = Math.max(1, 0.028 * s); ctx.strokeStyle = '#8A6420'; ctx.stroke();
    ctx.restore();
  }

  // ================================================================ things (colour faces) — unit s, fit in s × s
  function outline(ctx, c, s, k) { ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1.4, (k || 0.045) * s); ctx.strokeStyle = c.dark; ctx.stroke(); }
  function shine(ctx, x, y, rx, ry, rot, a) { ell(ctx, x, y, rx, ry, rot); ctx.fillStyle = 'rgba(255,255,255,' + (a || 0.75) + ')'; ctx.fill(); }

  function thingUmbrella(ctx, c, s) {
    ctx.translate(0, 0.04 * s);
    // shaft + J handle (behind the canopy)
    ctx.beginPath(); ctx.moveTo(0, -0.1 * s); ctx.lineTo(0, 0.3 * s);
    ctx.lineCap = 'round'; ctx.lineWidth = Math.max(2, 0.085 * s); ctx.strokeStyle = '#4E3A2E'; ctx.stroke();
    ctx.lineWidth = Math.max(1.2, 0.045 * s); ctx.strokeStyle = '#8B6A55'; ctx.stroke();
    ctx.beginPath(); ctx.arc(-0.085 * s, 0.3 * s, 0.085 * s, 0, Math.PI);
    ctx.lineWidth = Math.max(3, 0.11 * s); ctx.strokeStyle = c.dark; ctx.stroke();
    ctx.lineWidth = Math.max(1.6, 0.06 * s); ctx.strokeStyle = c.base; ctx.stroke();
    // canopy
    var L = -0.48 * s, R = 0.48 * s, B = -0.04 * s, T = -0.44 * s;
    function canopy() {
      ctx.beginPath(); ctx.moveTo(L, B);
      ctx.bezierCurveTo(L + 0.01 * s, -0.3 * s, -0.25 * s, T, 0, T);
      ctx.bezierCurveTo(0.25 * s, T, R - 0.01 * s, -0.3 * s, R, B);
      for (var i = 0; i < 4; i++) { var x1 = R - (i + 1) * 0.24 * s; ctx.quadraticCurveTo(x1 + 0.12 * s, B - 0.1 * s, x1, B); }
      ctx.closePath();
    }
    canopy(); ctx.fillStyle = c.base; ctx.fill();
    ctx.save(); canopy(); ctx.clip();
    // alternating panels (cel) + right-side shade
    ctx.fillStyle = rgba(c.light, 0.55);
    [[-0.24, -0.48], [0.24, 0]].forEach(function (p) {
      ctx.beginPath(); ctx.moveTo(0, T); ctx.lineTo(p[0] * s, B + 0.02 * s); ctx.lineTo(p[1] * s, B + 0.02 * s); ctx.closePath(); ctx.fill();
    });
    ctx.fillStyle = rgba(c.dark, 0.28);
    ctx.beginPath(); ctx.moveTo(0.14 * s, T); ctx.bezierCurveTo(0.4 * s, -0.36 * s, 0.5 * s, -0.2 * s, 0.5 * s, B + 0.03 * s); ctx.lineTo(0.3 * s, B + 0.03 * s);
    ctx.bezierCurveTo(0.3 * s, -0.25 * s, 0.24 * s, -0.36 * s, 0.14 * s, T); ctx.fill();
    ctx.lineWidth = Math.max(1, 0.022 * s); ctx.strokeStyle = rgba(c.dark, 0.55);
    [-0.24, 0, 0.24].forEach(function (x) { ctx.beginPath(); ctx.moveTo(0, T + 0.01 * s); ctx.quadraticCurveTo(x * s * 0.9, -0.22 * s, x * s, B); ctx.stroke(); });
    ctx.restore();
    canopy(); outline(ctx, c, s);
    shine(ctx, -0.25 * s, -0.27 * s, 0.09 * s, 0.04 * s, -0.75);
    // tip
    ctx.beginPath(); ctx.moveTo(0, T); ctx.lineTo(0, T - 0.07 * s); ctx.lineWidth = Math.max(2, 0.06 * s); ctx.strokeStyle = c.dark; ctx.stroke();
  }

  function balloonBody(ctx, c, s, cx, cy) { // body width ≈ 0.62·s, height ≈ 0.76·s around (cx, cy)
    function body() {
      ctx.beginPath(); ctx.moveTo(cx, cy - 0.38 * s);
      ctx.bezierCurveTo(cx + 0.2 * s, cy - 0.38 * s, cx + 0.31 * s, cy - 0.22 * s, cx + 0.31 * s, cy - 0.04 * s);
      ctx.bezierCurveTo(cx + 0.31 * s, cy + 0.16 * s, cx + 0.16 * s, cy + 0.34 * s, cx, cy + 0.37 * s);
      ctx.bezierCurveTo(cx - 0.16 * s, cy + 0.34 * s, cx - 0.31 * s, cy + 0.16 * s, cx - 0.31 * s, cy - 0.04 * s);
      ctx.bezierCurveTo(cx - 0.31 * s, cy - 0.22 * s, cx - 0.2 * s, cy - 0.38 * s, cx, cy - 0.38 * s);
      ctx.closePath();
    }
    // knot
    poly(ctx, [[cx, cy + 0.35 * s], [cx + 0.055 * s, cy + 0.43 * s], [cx - 0.055 * s, cy + 0.43 * s]]);
    ctx.fillStyle = c.shade; ctx.fill(); outline(ctx, c, s, 0.03);
    body(); ctx.fillStyle = c.base; ctx.fill();
    ctx.save(); body(); ctx.clip();
    ell(ctx, cx + 0.2 * s, cy + 0.12 * s, 0.3 * s, 0.36 * s, 0.3); ctx.fillStyle = rgba(c.dark, 0.25); ctx.fill();
    ell(ctx, cx - 0.12 * s, cy - 0.16 * s, 0.16 * s, 0.18 * s, 0); ctx.fillStyle = rgba(c.light, 0.55); ctx.fill();
    ctx.restore();
    body(); outline(ctx, c, s);
    shine(ctx, cx - 0.14 * s, cy - 0.2 * s, 0.06 * s, 0.1 * s, 0.5, 0.85);
    ell(ctx, cx - 0.2 * s, cy - 0.02 * s, 0.022 * s, 0.035 * s, 0.3); ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
  }
  function thingBalloon(ctx, c, s) {
    ctx.beginPath(); ctx.moveTo(0, 0.31 * s);
    ctx.bezierCurveTo(0.08 * s, 0.37 * s, -0.08 * s, 0.43 * s, 0.03 * s, 0.5 * s);
    ctx.lineWidth = Math.max(1.2, 0.025 * s); ctx.strokeStyle = '#8C7B6E'; ctx.lineCap = 'round'; ctx.stroke();
    balloonBody(ctx, c, s * 1.08, 0, -0.1 * s);
  }

  function thingCar(ctx, c, s) {
    ctx.translate(0, 0.06 * s);
    var lw = Math.max(1.4, 0.04 * s);
    function cabin() {
      ctx.beginPath(); ctx.moveTo(-0.32 * s, -0.04 * s);
      ctx.bezierCurveTo(-0.28 * s, -0.2 * s, -0.22 * s, -0.31 * s, -0.08 * s, -0.31 * s);
      ctx.lineTo(0.06 * s, -0.31 * s);
      ctx.bezierCurveTo(0.2 * s, -0.31 * s, 0.26 * s, -0.2 * s, 0.32 * s, -0.04 * s);
      ctx.closePath();
    }
    cabin(); ctx.fillStyle = c.base; ctx.fill(); outline(ctx, c, s, 0.04);
    // windows
    ctx.fillStyle = '#D9EEF6'; ctx.strokeStyle = c.dark; ctx.lineWidth = Math.max(1, 0.026 * s);
    poly(ctx, [[-0.25 * s, -0.06 * s], [-0.18 * s, -0.25 * s], [-0.04 * s, -0.25 * s], [-0.04 * s, -0.06 * s]]); ctx.fill(); ctx.stroke();
    poly(ctx, [[0.01 * s, -0.06 * s], [0.01 * s, -0.25 * s], [0.12 * s, -0.25 * s], [0.24 * s, -0.06 * s]]); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-0.15 * s, -0.22 * s); ctx.lineTo(-0.1 * s, -0.22 * s); ctx.lineWidth = Math.max(1, 0.03 * s); ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.stroke();
    // body
    rr(ctx, -0.48 * s, -0.07 * s, 0.96 * s, 0.25 * s, 0.11 * s); ctx.fillStyle = c.base; ctx.fill();
    ctx.save(); rr(ctx, -0.48 * s, -0.07 * s, 0.96 * s, 0.25 * s, 0.11 * s); ctx.clip();
    ctx.fillStyle = rgba(c.dark, 0.3); ctx.fillRect(-0.5 * s, 0.1 * s, s, 0.1 * s);
    ctx.restore();
    rr(ctx, -0.48 * s, -0.07 * s, 0.96 * s, 0.25 * s, 0.11 * s); ctx.lineWidth = lw; ctx.strokeStyle = c.dark; ctx.stroke();
    // door line + handle
    ctx.beginPath(); ctx.moveTo(-0.02 * s, -0.05 * s); ctx.lineTo(-0.02 * s, 0.12 * s); ctx.lineWidth = Math.max(1, 0.022 * s); ctx.strokeStyle = rgba(c.dark, 0.7); ctx.stroke();
    rr(ctx, 0.03 * s, -0.01 * s, 0.07 * s, 0.025 * s, 0.012 * s); ctx.fillStyle = c.dark; ctx.fill();
    // lights + bumpers
    ell(ctx, 0.44 * s, 0.0, 0.035 * s, 0.03 * s, 0); ctx.fillStyle = '#FFE58A'; ctx.fill(); ctx.lineWidth = Math.max(1, 0.018 * s); ctx.strokeStyle = '#B98A1E'; ctx.stroke();
    rr(ctx, -0.49 * s, -0.02 * s, 0.04 * s, 0.05 * s, 0.015 * s); ctx.fillStyle = c.dark; ctx.fill();
    rr(ctx, 0.38 * s, 0.11 * s, 0.13 * s, 0.05 * s, 0.025 * s); ctx.fillStyle = '#D8D0C8'; ctx.fill(); ctx.strokeStyle = '#8D8279'; ctx.stroke();
    rr(ctx, -0.51 * s, 0.11 * s, 0.11 * s, 0.05 * s, 0.025 * s); ctx.fill(); ctx.stroke();
    // shine on the bonnet
    ctx.beginPath(); ctx.moveTo(-0.38 * s, -0.03 * s); ctx.lineTo(-0.26 * s, -0.03 * s); ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1.2, 0.03 * s); ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.stroke();
    // wheels
    [-0.27, 0.27].forEach(function (x) {
      ctx.beginPath(); ctx.arc(x * s, 0.19 * s, 0.115 * s, 0, Math.PI * 2); ctx.fillStyle = '#4A4246'; ctx.fill();
      ctx.lineWidth = Math.max(1, 0.025 * s); ctx.strokeStyle = '#2E282B'; ctx.stroke();
      ctx.beginPath(); ctx.arc(x * s, 0.19 * s, 0.05 * s, 0, Math.PI * 2); ctx.fillStyle = '#D9D3CC'; ctx.fill();
    });
  }

  function thingKite(ctx, c, s) {
    // tail first (behind)
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
    // saucer
    ell(ctx, 0.04 * s, 0.33 * s, 0.46 * s, 0.085 * s, 0); ctx.fillStyle = '#FBF7EE'; ctx.fill();
    ctx.lineWidth = Math.max(1.2, 0.03 * s); ctx.strokeStyle = '#A8927A'; ctx.stroke();
    ell(ctx, 0.04 * s, 0.33 * s, 0.28 * s, 0.045 * s, 0); ctx.fillStyle = '#EDE3D3'; ctx.fill();
    // handle
    ctx.beginPath(); ctx.arc(0.31 * s, 0.04 * s, 0.12 * s, -Math.PI / 2 - 0.2, Math.PI / 2 + 0.2);
    ctx.lineCap = 'round'; ctx.lineWidth = Math.max(3, 0.12 * s); ctx.strokeStyle = c.dark; ctx.stroke();
    ctx.lineWidth = Math.max(1.6, 0.065 * s); ctx.strokeStyle = c.base; ctx.stroke();
    // mug
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
    // rim + cocoa
    ell(ctx, 0.01 * s, -0.18 * s, 0.31 * s, 0.065 * s, 0); ctx.fillStyle = c.light; ctx.fill(); outline(ctx, c, s, 0.035);
    ell(ctx, 0.01 * s, -0.175 * s, 0.25 * s, 0.042 * s, 0); ctx.fillStyle = '#8A5A3C'; ctx.fill();
    // steam
    ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1.4, 0.035 * s); ctx.strokeStyle = 'rgba(170,150,135,0.6)';
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
    // rim band + pull tab
    rr(ctx, -0.28 * s, -0.47 * s, 0.42 * s, 0.11 * s, 0.04 * s); ctx.fillStyle = c.light; ctx.fill(); outline(ctx, c, s, 0.035);
    ctx.beginPath(); ctx.arc(0.13 * s, -0.415 * s, 0.05 * s, -Math.PI / 2 - 0.3, Math.PI / 2 + 0.3); ctx.lineWidth = Math.max(1.6, 0.035 * s); ctx.strokeStyle = c.dark; ctx.stroke();
    shine(ctx, -0.16 * s, -0.17 * s, 0.025 * s, 0.11 * s, 0, 0.7);
  }

  var THING_FN = { umbrella: thingUmbrella, balloon: thingBalloon, car: thingCar, kite: thingKite, cup: thingCup, boot: thingBoot };
  function drawThing(ctx, obj, colorKey, size) {
    var fn = THING_FN[obj] || thingBalloon;
    ctx.save(); fn(ctx, col(colorKey), size); ctx.restore();
  }

  // ================================================================ star (as Dee)
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
    var s = size, tw = (opt && opt.twinkle) || 0;
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

  // ================================================================ dots = round coloured lights in a dice layout
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
  function drawLight(ctx, r, c) {
    var g0 = ctx.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 1.5);
    g0.addColorStop(0, rgba(c.light, 0.55)); g0.addColorStop(1, rgba(c.light, 0));
    ctx.fillStyle = g0; ctx.beginPath(); ctx.arc(0, 0, r * 1.5, 0, Math.PI * 2); ctx.fill();
    var g = ctx.createRadialGradient(-0.32 * r, -0.36 * r, 0.05 * r, 0, 0, r);
    g.addColorStop(0, mix(c.light, '#FFFFFF', 0.45)); g.addColorStop(0.45, c.base); g.addColorStop(1, c.shade);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = Math.max(1.2, 0.13 * r); ctx.strokeStyle = c.dark; ctx.stroke();
    ell(ctx, -0.34 * r, -0.38 * r, 0.24 * r, 0.15 * r, -0.7); ctx.fillStyle = 'rgba(255,255,255,0.88)'; ctx.fill();
  }
  function drawLights(ctx, n, bw, bh, colorKey) {
    n = clamp(n | 0, 1, 12);
    var L = DOTS[n], cols = L[0], rows = L[1], c = col(colorKey || DOT_COLORS[(n - 1) % DOT_COLORS.length]);
    var cw = bw / cols, ch = bh / rows;
    var r = Math.min(cw, ch) * 0.36;
    r = Math.min(r, bw * (n === 1 ? 0.28 : n <= 3 ? 0.2 : n === 4 ? 0.19 : n <= 6 ? 0.15 : 0.12));
    var gx = Math.min(cw, r * 2.9), gy = Math.min(ch, r * 2.9);
    var x0 = -gx * (cols - 1) / 2, y0 = -gy * (rows - 1) / 2;
    L[2].forEach(function (p) { ctx.save(); ctx.translate(x0 + p[0] * gx, y0 + p[1] * gy); drawLight(ctx, r, c); ctx.restore(); });
  }

  // ================================================================ window geometry (local coords, centred cell w × h)
  var SWING = 1.1;      // shutter angle at open = 1: 1.1·90° ≈ 99° (just past perpendicular → the back face shows; less reach so neighbours never stack, visual QA P2-3)
  var PERSP = 2.6;      // camera distance in window widths (in front of the window centre)
  function geometry(w, h) {
    var capH = 0.085 * w, sillH = 0.09 * w, fw = 0.062 * w, fx = 0.44 * w;
    var fTop = -h / 2 + 0.5 * capH, fBot = h / 2 - 0.5 * sillH;
    var ox = fx - fw, oTop = -h / 2 + capH + 0.03 * w, oBot = h / 2 - sillH - 0.006 * w;
    var oh = oBot - oTop, cy = (oTop + oBot) / 2;
    var bw = 2 * ox * 0.8, bh = oh * 0.8;
    return {
      w: w, h: h, capH: capH, sillH: sillH, fw: fw,
      frame: { x: -fx, y: fTop, w: 2 * fx, h: fBot - fTop },
      cap: { x: -0.49 * w, y: -h / 2, w: 0.98 * w, h: capH },
      sill: { x: -0.5 * w, y: h / 2 - sillH, w: w, h: sillH },
      opening: { x: -ox, y: oTop, w: 2 * ox, h: oh, cy: cy },
      content: { x: -bw / 2, y: cy - bh / 2 + 0.02 * oh, w: bw, h: bh, cx: 0, cy: cy + 0.02 * oh },
      box: { x: -0.37 * w, y: h / 2 - 0.01 * w, w: 0.74 * w, h: 0.125 * w },
      shutter: { sw: ox + 0.004 * w, top: oTop - 0.012 * w, bot: oBot + 0.006 * w, cy: cy, D: PERSP * w, t: 0.04 * w }
    };
  }

  // ================================================================ offscreen cache (as CardArt)
  var cache = {}, cacheN = 0, CACHE_MAX = 160;
  var bcache = [], BCACHE_MAX = 3;
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
  function isSticker(kind) { return kind === 'animal' || kind === 'home'; }
  function faceKind(face) {
    var k = face.kind;
    if (k === 'parity') k = face.dots || face.show === 'dots' || face.as === 'dots' ? 'dots' : 'number';
    return k;
  }
  function faceSig(f) {
    if (!f) return 'none';
    return [faceKind(f), isSticker(f.kind) ? '' : f.value, f.color, f.obj, f.shape, f.n, f.text, f.scale].join('|');
  }
  // the face content alone, transparent background, centred in a bw × bh box (cached)
  function paintContent(ctx, bw, bh, face) {
    var k = face.scale == null ? 1 : face.scale, kind = faceKind(face);
    ctx.save();
    if (kind !== 'shape') ctx.scale(k, k);
    switch (kind) {
      case 'color': {
        var sz = Math.min(bw * 1.04, bh * 0.98);
        drawThing(ctx, face.obj || 'balloon', face.color || face.value, sz);
        break;
      }
      case 'shape': {
        var sh = face.shape || face.value; if (SHAPES.indexOf(sh) < 0) sh = 'circle';
        var ls = bw * (sh === 'rect' ? 0.84 : sh === 'star' ? 0.8 : sh === 'square' ? 0.84 : 0.8) * k;
        var dy = 0.1 * bh;
        var top = dy + capY(sh, ls) - 0.1 * ls;
        // the cord the lantern hangs from (from the top of the room)
        ctx.beginPath(); ctx.moveTo(0, -bh * 0.62); ctx.lineTo(0, top);
        ctx.lineWidth = Math.max(1.2, 0.018 * bw); ctx.strokeStyle = '#9A7A5A'; ctx.stroke();
        ctx.translate(0, dy);
        drawLantern(ctx, sh, face.color || 'red', ls, 0.25);
        break;
      }
      case 'dots': drawLights(ctx, face.n != null ? face.n : +face.value, bw, bh, face.color); break;
      case 'animal': case 'home': break;   // sprite drawn live by opt.sprite (shadow painted below)
      default: {
        var str = String(face.text != null ? face.text : face.value != null ? face.value : face.n != null ? face.n : '?');
        var isText = kind === 'text' || str.length > 2;
        var px = isText ? 0.36 * bh : str.length === 2 ? 0.62 * bh : 0.8 * bh;
        px = fitFont(ctx, str, bw * (isText ? 1.12 : 1.0), Math.round(px));
        centredText(ctx, str, 0.015 * bw, 0.024 * bh, ROOM.inkSoft);
        centredText(ctx, str, 0, 0, ROOM.ink);
      }
    }
    ctx.restore();
    if (isSticker(kind)) {
      var A = stickerBox(bw, bh, k);
      ell(ctx, 0, A.ground + 0.015 * A.sz, 0.34 * A.sz * k, 0.055 * A.sz * Math.max(0.7, k), 0);
      ctx.fillStyle = 'rgba(120,90,50,0.18)'; ctx.fill();
    }
  }
  // sticker box (animals / homes): sz = full box, ground = y of the sticker feet (stickers ≈ 110/128 of the box)
  function stickerBox(bw, bh, k) {
    var sz = Math.min(bw * 1.12, bh * 1.05), ground = 0.43 * sz;
    if (ground > bh * 0.5) ground = bh * 0.5;
    return { sz: sz, ground: ground, y: ground - 0.43 * sz * k, size: sz * k };
  }
  function drawContent(ctx, face, box, opt) {
    var bounce = (opt && opt.bounce) || 0, wig = (opt && opt.wiggle) || 0;
    ctx.save();
    ctx.translate(box.cx, box.cy - bounce);
    if (wig) { ctx.translate(0, box.h * 0.3); ctx.rotate(wig); ctx.translate(0, -box.h * 0.3); }
    cached(ctx, 'c:' + faceSig(face), box.w, box.h, function (c, W, H) { paintContent(c, W, H, face); }, Math.ceil(0.3 * box.w));
    if (isSticker(face.kind) && opt && typeof opt.sprite === 'function') {
      var A = stickerBox(box.w, box.h, face.scale == null ? 1 : face.scale);
      opt.sprite(face.sprite || ((face.kind === 'home' ? 'home_' : 'animal_') + face.value), 0, A.y, A.size);
    }
    ctx.restore();
  }

  // ================================================================ window parts
  function paintFrame(ctx, W, H, trim, parity) {
    var G = geometry(W, H), w = W, lw = Math.max(1.2, 0.02 * w);
    var tDark = mix(trim, '#6E5E50', 0.5), tShade = mix(trim, '#B8A58E', 0.45);
    var F = G.frame, O = G.opening, C = G.cap, S = G.sill;
    // soft shadow on the facade
    rr(ctx, F.x + 0.02 * w, F.y + 0.035 * w, F.w, F.h + 0.02 * w, 0.03 * w); ctx.fillStyle = 'rgba(70,50,40,0.14)'; ctx.fill();
    // frame (answer colour for parity)
    var fc = parity ? (parity === 'odd' ? COLORS.blue : COLORS.orange) : null;
    rr(ctx, F.x, F.y, F.w, F.h, 0.025 * w);
    ctx.fillStyle = fc ? fc.base : trim; ctx.fill();
    ctx.lineWidth = lw; ctx.strokeStyle = fc ? fc.dark : tDark; ctx.stroke();
    // frame bevel (lit top-left, shaded bottom-right)
    ctx.lineWidth = Math.max(1, 0.012 * w);
    ctx.strokeStyle = fc ? rgba('#FFFFFF', 0.45) : 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.moveTo(F.x + 0.02 * w, F.y + F.h - 0.03 * w); ctx.lineTo(F.x + 0.02 * w, F.y + 0.02 * w); ctx.lineTo(F.x + F.w - 0.03 * w, F.y + 0.02 * w); ctx.stroke();
    // the dark opening (seen through the shutter seam)
    rr(ctx, O.x, O.y, O.w, O.h, 0.012 * w); ctx.fillStyle = ROOM.recess; ctx.fill();
    ctx.lineWidth = Math.max(1, 0.014 * w); ctx.strokeStyle = fc ? fc.dark : tShade; ctx.stroke();
    // lintel cap with keystone
    rr(ctx, C.x, C.y, C.w, C.h, 0.02 * w); ctx.fillStyle = trim; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = tDark; ctx.stroke();
    ctx.fillStyle = tShade; ctx.fillRect(C.x + lw, C.y + C.h * 0.66, C.w - 2 * lw, C.h * 0.22);
    poly(ctx, [[-0.075 * w, C.y - 0.012 * w], [0.075 * w, C.y - 0.012 * w], [0.055 * w, C.y + C.h + 0.02 * w], [-0.055 * w, C.y + C.h + 0.02 * w]]);
    ctx.fillStyle = mix(trim, tShade, 0.35); ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = tDark; ctx.stroke();
    // sill: top lip + front face + underside shadow
    rr(ctx, S.x, S.y, S.w, S.h, 0.02 * w); ctx.fillStyle = trim; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = tDark; ctx.stroke();
    ctx.fillStyle = tShade; ctx.fillRect(S.x + lw, S.y + S.h * 0.45, S.w - 2 * lw, S.h * 0.4);
    ctx.beginPath(); ctx.moveTo(S.x + 0.03 * w, S.y + 0.02 * w); ctx.lineTo(S.x + S.w - 0.03 * w, S.y + 0.02 * w);
    ctx.lineWidth = Math.max(1, 0.012 * w); ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineCap = 'round'; ctx.stroke();
  }

  function drawRoom(ctx, G, light) {
    var O = G.opening, w = G.w;
    var wall = light > 0 ? mix(ROOM.wall, ROOM.lit, light) : ROOM.wall;
    var g = ctx.createLinearGradient(0, O.y, 0, O.y + O.h);
    g.addColorStop(0, mix(wall, ROOM.wall2, 0.55)); g.addColorStop(0.35, wall); g.addColorStop(1, mix(wall, ROOM.wall2, 0.7));
    ctx.fillStyle = g; ctx.fillRect(O.x, O.y, O.w, O.h);
    if (light > 0.01) {   // lamp glow from the ceiling
      var rg = ctx.createRadialGradient(0, O.y + 0.12 * O.h, 0, 0, O.y + 0.2 * O.h, O.h * 0.75);
      rg.addColorStop(0, rgba('#FFF7D6', 0.85 * light)); rg.addColorStop(1, rgba(ROOM.lit2, 0));
      ctx.fillStyle = rg; ctx.fillRect(O.x, O.y, O.w, O.h);
    }
    // floor band at the back of the room
    ctx.fillStyle = rgba(light > 0 ? mix(ROOM.floor, ROOM.lit2, 0.4 * light) : ROOM.floor, 0.75);
    ctx.fillRect(O.x, O.y + O.h * 0.86, O.w, O.h * 0.14);
    // reveal: depth of the wall (top + left in shade, light from the upper-left)
    var d = 0.035 * w;
    ctx.fillStyle = 'rgba(94,70,52,0.22)';
    poly(ctx, [[O.x, O.y], [O.x + O.w, O.y], [O.x + O.w - d, O.y + d], [O.x + d, O.y + d]]); ctx.fill();
    ctx.fillStyle = 'rgba(94,70,52,0.12)';
    poly(ctx, [[O.x + O.w, O.y], [O.x + O.w, O.y + O.h], [O.x + O.w - d, O.y + O.h], [O.x + O.w - d, O.y + d]]); ctx.fill();
    // little tied-back curtains in the corners
    var cw = 0.11 * O.w, th = O.y + O.h * 0.52;
    for (var s = -1; s <= 1; s += 2) {
      var ex = s < 0 ? O.x : O.x + O.w, ix = ex - s * cw;
      ctx.beginPath(); ctx.moveTo(ex, O.y); ctx.lineTo(ix, O.y);
      ctx.quadraticCurveTo(ex - s * cw * 0.55, O.y + O.h * 0.3, ex - s * cw * 0.25, th);
      ctx.quadraticCurveTo(ex - s * cw * 0.5, th + O.h * 0.12, ex - s * cw * 0.7, O.y + O.h * 0.9);
      ctx.lineTo(ex, O.y + O.h * 0.9); ctx.closePath();
      ctx.fillStyle = ROOM.curtain; ctx.fill();
      ctx.lineWidth = Math.max(1, 0.01 * w); ctx.strokeStyle = ROOM.curtainLine; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ex - s * cw * 0.45, O.y + 0.01 * w); ctx.quadraticCurveTo(ex - s * cw * 0.3, O.y + O.h * 0.3, ex - s * cw * 0.15, th);
      ctx.strokeStyle = ROOM.curtainSh; ctx.stroke();
      rr(ctx, ex - s * cw * 0.32 - 0.018 * w, th - 0.012 * w, 0.036 * w, 0.024 * w, 0.01 * w); ctx.fillStyle = ROOM.curtainLine; ctx.fill();
    }
    // curtain rod
    ctx.fillStyle = '#B7946C'; ctx.fillRect(O.x, O.y + 0.004 * w, O.w, Math.max(1.2, 0.016 * w));
  }
  // parity (odd blue / even orange): a thick painted lining round the inside of the window, only visible when open
  function drawParityLining(ctx, G, parity) {
    var O = G.opening, w = G.w, pc = parity === 'odd' ? COLORS.blue : COLORS.orange, k = 0.075 * w;
    rr(ctx, O.x + k / 2, O.y + k / 2, O.w - k, O.h - k, 0.03 * w);
    ctx.lineWidth = k; ctx.strokeStyle = pc.base; ctx.stroke();
    ctx.lineWidth = Math.max(1, 0.012 * w); ctx.strokeStyle = pc.dark;
    rr(ctx, O.x + k, O.y + k, O.w - 2 * k, O.h - 2 * k, 0.02 * w); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(O.x + k * 0.3, O.y + O.h - k); ctx.lineTo(O.x + k * 0.3, O.y + k * 0.3); ctx.lineTo(O.x + O.w - k, O.y + k * 0.3);
    ctx.lineWidth = Math.max(1, 0.012 * w); ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.stroke();
  }
  function drawGlass(ctx, G) {
    var O = G.opening;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    poly(ctx, [[O.x + O.w * 0.7, O.y], [O.x + O.w * 0.82, O.y], [O.x + O.w, O.y + O.h * 0.2], [O.x + O.w, O.y + O.h * 0.36]]); ctx.fill();
    poly(ctx, [[O.x + O.w * 0.88, O.y], [O.x + O.w * 0.92, O.y], [O.x + O.w, O.y + O.h * 0.1], [O.x + O.w, O.y + O.h * 0.16]]); ctx.fill();
    ctx.restore();
  }

  // ---- shutters: true 3D rotation about the vertical hinge, central perspective from a camera at the window centre
  function shadeFor(base, nx, nz) {   // light from the upper-left front
    var lx = -0.45, lz = 0.89, dot = nx * lx + nz * lz, ref = lz;   // closed (n = +z) keeps the exact colour
    var amt = clamp((ref - dot) * 0.36, 0, 0.42);
    var c = amt > 0 ? mix(base, '#231C1A', amt) : base;
    return dot > ref ? mix(base, '#FFF4E0', clamp((dot - ref) * 0.6, 0, 0.12)) : c;
  }
  function drawShutter(ctx, G, s, th, base) {
    var S = G.shutter, sw = S.sw, top = S.top, bot = S.bot, cy = S.cy, D = S.D, t = S.t, w = G.w;
    var cs = Math.cos(th), sn = Math.sin(th);
    var nx = s * sn, nz = cs;   // front normal
    function P(u, y, back) {
      var X = s * sw - s * u * cs, Z = u * sn;
      if (back) { X -= nx * t; Z -= nz * t; }
      var k = D / Math.max(0.2 * D, D - Z);
      return [X * k, cy + (y - cy) * k];
    }
    // which face looks at the camera (panel centre)
    var Xc = s * sw - s * (sw / 2) * cs, Zc = (sw / 2) * sn;
    var front = (nx * (0 - Xc) + nz * (D - Zc)) > 0;
    var Xe = s * sw - s * sw * cs, Ze = sw * sn;
    var edgeVis = (-s * cs) * (0 - Xe) + sn * (D - Ze) > 0 && th > 0.02;
    var dark = mix(base, '#2A211E', 0.55);
    var lw = Math.max(1, 0.014 * w);
    ctx.lineJoin = 'round';
    // free-edge thickness strip
    if (edgeVis) {
      poly(ctx, [P(sw, top, false), P(sw, bot, false), P(sw, bot, true), P(sw, top, true)]);
      ctx.fillStyle = mix(base, '#3A2C26', 0.45); ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = dark; ctx.stroke();
    }
    var back = !front;
    var face = back ? shadeFor(mix(base, '#3A2C26', 0.12), -nx, -nz) : shadeFor(base, nx, nz);
    var recess = mix(face, '#2A211E', 0.38), slat = mix(face, '#FFFFFF', 0.05), hi = mix(face, '#FFFFFF', 0.35);
    function quad(u0, y0, u1, y1) { poly(ctx, [P(u0, y0, back), P(u1, y0, back), P(u1, y1, back), P(u0, y1, back)]); }
    // panel
    quad(0, top, sw, bot); ctx.fillStyle = face; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = dark; ctx.stroke();
    var b = 0.15 * sw, rail = 0.07 * (bot - top);
    var panels = [[top + b, cy - rail / 2], [cy + rail / 2, bot - b]];
    var pitchMin = Math.max(4.2, 0.052 * w);
    panels.forEach(function (pn) {
      var y0 = pn[0], y1 = pn[1], ph = y1 - y0;
      quad(b, y0, sw - b, y1); ctx.fillStyle = recess; ctx.fill();
      var n = clamp(Math.round(ph / pitchMin), 3, 9), p = ph / n;
      ctx.fillStyle = slat;
      for (var i = 0; i < n; i++) { quad(b, y0 + i * p + 0.08 * p, sw - b, y0 + i * p + 0.72 * p); ctx.fill(); }
      ctx.lineWidth = Math.max(0.8, 0.008 * w); ctx.strokeStyle = hi;
      for (i = 0; i < n; i++) {
        var a = P(b, y0 + i * p + 0.1 * p, back), c = P(sw - b, y0 + i * p + 0.1 * p, back);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); ctx.stroke();
      }
      quad(b, y0, sw - b, y1); ctx.lineWidth = Math.max(0.8, 0.01 * w); ctx.strokeStyle = dark; ctx.stroke();
    });
    // top-rail highlight
    var h0 = P(0.04 * sw, top + 0.02 * w, back), h1 = P(sw - 0.04 * sw, top + 0.02 * w, back);
    ctx.beginPath(); ctx.moveTo(h0[0], h0[1]); ctx.lineTo(h1[0], h1[1]); ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1, 0.012 * w); ctx.strokeStyle = rgba('#FFFFFF', back ? 0.18 : 0.45); ctx.stroke();
    if (!back) {
      // iron hinge straps on the hinge side
      [top + 0.12 * (bot - top), bot - 0.12 * (bot - top)].forEach(function (yy) {
        var hh = 0.017 * (bot - top);
        quad(0, yy - hh, 0.34 * sw, yy + hh); ctx.fillStyle = mix(base, '#2A211E', 0.62); ctx.fill();
        var pc = P(0.34 * sw, yy, false);
        ctx.beginPath(); ctx.arc(pc[0], pc[1], Math.max(1, hh * 1.25), 0, Math.PI * 2); ctx.fill();
      });
    }
    // knob on the free-edge stile (both faces have one: a latch behind)
    var kc = P(sw - 0.5 * b, cy, back), ke = P(sw - 0.5 * b + 0.03 * w, cy, back);
    var kr0 = Math.max(1.6, 0.034 * w), kr = kr0 * (D / Math.max(0.2 * D, D - (sw - 0.5 * b) * sn));
    var krx = clamp(Math.abs(ke[0] - kc[0]) / (0.03 * w) * kr0, kr * 0.25, kr);   // foreshortened across the panel
    ell(ctx, kc[0], kc[1], krx, kr, 0); ctx.fillStyle = back ? '#A88A4E' : '#E2B85A'; ctx.fill();
    ctx.lineWidth = Math.max(0.8, 0.01 * w); ctx.strokeStyle = '#7A5C22'; ctx.stroke();
    if (!back) { ell(ctx, kc[0] - krx * 0.3, kc[1] - kr * 0.35, krx * 0.35, kr * 0.25, 0); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill(); }
  }
  function paintClosedShutters(ctx, W, H, base) {
    var G = geometry(W, H);
    drawShutter(ctx, G, -1, 0, base);
    drawShutter(ctx, G, 1, 0, base);
    // centre seam shadow
    var S = G.shutter;
    ctx.fillStyle = 'rgba(40,28,22,0.35)'; ctx.fillRect(-0.006 * W, S.top + 0.01 * W, 0.012 * W, S.bot - S.top - 0.02 * W);
  }
  function drawShutters(ctx, G, open, base) {
    var oc = clamp(open, 0, 1.12); if (oc > 1) oc = 1 + (oc - 1) * 0.4;   // the hinge stop: overshoot shows, but only a little
    var th = oc * Math.PI / 2 * SWING;
    if (th < 0.004) {
      cached(ctx, 'sh:' + base, G.w, G.h, function (c, W, H) { paintClosedShutters(c, W, H, base); }, Math.ceil(0.05 * G.w));
      return;
    }
    // the shutter whose free edge is nearer the camera is drawn last (they never overlap much, but be safe)
    drawShutter(ctx, G, -1, th, base);
    drawShutter(ctx, G, 1, th, base);
  }

  // ---- flower box + flowers
  function flowerColor(bc, i) {
    if (bc === 'mixed' || bc == null) return col(['red', 'yellow', 'purple', 'pink', 'orange', 'blue'][i % 6]);
    return col(bc);
  }
  function drawFlowerBox(ctx, G, bloom, bloomColor) {
    var B = G.box, w = G.w, lw = Math.max(1, 0.014 * w);
    var bl = Math.max(0, bloom || 0);
    // flowers behind the box front
    var N = 5;
    for (var i = 0; i < N; i++) {
      var d = i === 2 ? 0 : (i === 1 || i === 3) ? 0.12 : 0.24;      // pop from the middle outwards
      var local = (bl - d) / (1 - d);
      if (local <= 0) continue;
      var sc = local < 1 ? backOut(local) : 1 + (local - 1) * 0.6;
      var fx = B.x + B.w * (0.12 + 0.76 * i / (N - 1)), base = B.y + 0.02 * w;
      var stem = (0.1 + (i % 2 ? 0.02 : 0.05)) * w * sc, fy = base - stem;
      ctx.beginPath(); ctx.moveTo(fx, base); ctx.quadraticCurveTo(fx + (i - 2) * 0.006 * w, base - stem * 0.5, fx, fy);
      ctx.lineWidth = Math.max(1, 0.014 * w); ctx.strokeStyle = WOOD.leafSh; ctx.lineCap = 'round'; ctx.stroke();
      ell(ctx, fx + 0.022 * w * sc, base - stem * 0.35, 0.024 * w * sc, 0.011 * w * sc, -0.6); ctx.fillStyle = WOOD.leaf; ctx.fill();
      var c = flowerColor(bloomColor, i), r = 0.034 * w * sc;
      ctx.save(); ctx.translate(fx, fy); ctx.rotate((i - 2) * 0.15);
      for (var p = 0; p < 5; p++) {
        var a = p * Math.PI * 2 / 5 - Math.PI / 2;
        ell(ctx, Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9, r * 0.62, r * 0.5, a);
        ctx.fillStyle = c.base; ctx.fill(); ctx.lineWidth = Math.max(0.7, 0.008 * w); ctx.strokeStyle = c.dark; ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(0, 0, r * 0.45, 0, Math.PI * 2); ctx.fillStyle = c === COLORS.yellow ? '#FF9A2E' : '#FFE27A'; ctx.fill();
      ctx.lineWidth = Math.max(0.7, 0.008 * w); ctx.strokeStyle = '#C99A12'; ctx.stroke();
      ctx.restore();
    }
    // green leaves along the top (always a little; fuller when blooming)
    var lv = 0.55 + 0.45 * clamp(bl, 0, 1);
    for (var j = 0; j < 7; j++) {
      var lx = B.x + B.w * (0.08 + 0.84 * j / 6), ly = B.y + 0.012 * w;
      ell(ctx, lx, ly - 0.012 * w * lv, 0.034 * w * lv, 0.018 * w * lv, (j % 2 ? 0.5 : -0.5));
      ctx.fillStyle = j % 2 ? WOOD.leaf : WOOD.leafSh; ctx.fill();
    }
    // box
    poly(ctx, [[B.x, B.y], [B.x + B.w, B.y], [B.x + B.w - 0.03 * w, B.y + B.h], [B.x + 0.03 * w, B.y + B.h]]);
    ctx.fillStyle = WOOD.box; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = WOOD.boxLine; ctx.stroke();
    ctx.fillStyle = WOOD.boxSh; ctx.fillRect(B.x + 0.04 * w, B.y + B.h * 0.6, B.w - 0.08 * w, B.h * 0.12);
    ctx.fillRect(B.x + B.w * 0.33, B.y + B.h * 0.12, Math.max(1, 0.01 * w), B.h * 0.48);
    ctx.fillRect(B.x + B.w * 0.66, B.y + B.h * 0.12, Math.max(1, 0.01 * w), B.h * 0.48);
    rr(ctx, B.x - 0.012 * w, B.y - 0.008 * w, B.w + 0.024 * w, 0.028 * w, 0.01 * w); ctx.fillStyle = mix(WOOD.box, '#FFFFFF', 0.12); ctx.fill();
    ctx.lineWidth = lw; ctx.strokeStyle = WOOD.boxLine; ctx.stroke();
  }

  // ---- rain drops on the glass
  function drawRain(ctx, G, rain, t, seed) {
    var O = G.opening, w = G.w, r = rng(((seed | 0) + 7) * 2654435761);
    var n = Math.round(3 + 10 * rain);
    ctx.save();
    rr(ctx, O.x, O.y, O.w, O.h, 0.01 * w); ctx.clip();
    for (var i = 0; i < n; i++) {
      var x = O.x + O.w * (0.06 + 0.88 * r()), sp = (0.04 + 0.1 * r()) * O.h, y0 = r() * O.h * 1.2;
      var y = O.y - 0.1 * O.h + ((y0 + sp * (t || 0)) % (O.h * 1.2));
      var rad = (0.014 + 0.016 * r()) * w;
      // trail
      ctx.beginPath(); ctx.moveTo(x, y - rad); ctx.lineTo(x + 0.004 * w, y - rad - 0.09 * O.h * r());
      ctx.lineWidth = Math.max(0.8, rad * 0.45); ctx.lineCap = 'round'; ctx.strokeStyle = rgba('#FFFFFF', 0.28 * rain); ctx.stroke();
      // drop
      ctx.beginPath(); ctx.moveTo(x, y - rad * 1.5);
      ctx.quadraticCurveTo(x + rad, y - rad * 0.2, x + rad * 0.9, y + rad * 0.3);
      ctx.arc(x, y + rad * 0.3, rad * 0.9, 0, Math.PI);
      ctx.quadraticCurveTo(x - rad, y - rad * 0.2, x, y - rad * 1.5);
      ctx.fillStyle = rgba('#DCEBF5', 0.5 * rain + 0.15); ctx.fill();
      ctx.lineWidth = Math.max(0.7, rad * 0.22); ctx.strokeStyle = rgba('#6F8DA6', 0.55 * rain + 0.1); ctx.stroke();
      ell(ctx, x - rad * 0.3, y, rad * 0.22, rad * 0.32, 0.3); ctx.fillStyle = rgba('#FFFFFF', 0.9 * rain); ctx.fill();
    }
    ctx.restore();
  }

  // ---- halos
  function drawHalo(ctx, G, a, color, grow) {
    var F = G.frame, w = G.w;
    a = clamp(a, 0, 1); if (a < 0.01) return;
    ctx.save();
    for (var i = 4; i >= 1; i--) {
      var e = i * grow * w;
      rr(ctx, F.x - e, F.y - e - 0.04 * w, F.w + 2 * e, F.h + 2 * e + 0.08 * w, 0.05 * w + e);
      ctx.fillStyle = rgba(color, Math.min(0.3, 0.15 * a * (1.25 - i * 0.2))); ctx.fill();
    }
    ctx.restore();
  }

  // ================================================================ public: window
  function drawWindow(ctx, w, h, face, open, opt) {
    opt = opt || {};
    var G = geometry(w, h), o = +open || 0;
    var trim = resolve(opt.trim, { white: TRIM }, TRIM);
    var shut = resolve(opt.shutter, SHUTTERS, SHUTTERS.teal);
    var light = clamp(+opt.light || 0, 0, 1), glow = clamp(+opt.glow || 0, 0, 1);
    var parity = parityOf(face);
    ctx.save();
    if (opt.alpha != null && opt.alpha < 1) ctx.globalAlpha *= Math.max(0, opt.alpha);
    if (glow > 0) {
      drawHalo(ctx, G, glow * 1.6, opt.glowColor || '#FFD95A', 0.04);
      var Fg = G.frame;
      rr(ctx, Fg.x - 0.035 * w, Fg.y - 0.07 * w, Fg.w + 0.07 * w, Fg.h + 0.14 * w, 0.06 * w);
      ctx.lineWidth = Math.max(2, 0.03 * w); ctx.strokeStyle = rgba(mix(opt.glowColor || '#FFD95A', '#FFFFFF', 0.35), 0.95 * glow); ctx.stroke();
    }
    if (light > 0) drawHalo(ctx, G, light * 0.9, '#FFE29A', 0.05);
    cached(ctx, 'fr:' + trim, w, h, function (c, W, H) { paintFrame(c, W, H, trim, null); }, Math.ceil(0.06 * w));
    if (o > 0.02 && face) {
      var O = G.opening;
      ctx.save();
      rr(ctx, O.x, O.y, O.w, O.h, 0.012 * w); ctx.clip();
      drawRoom(ctx, G, light);
      if (parity) drawParityLining(ctx, G, parity);
      drawContent(ctx, face, G.content, opt);
      drawGlass(ctx, G);
      ctx.restore();
    }
    if (light > 0.01) {   // warm light spilling onto the sill
      var S = G.sill;
      ctx.fillStyle = rgba('#FFE9A8', 0.55 * light); ctx.fillRect(G.opening.x, S.y + 0.006 * w, G.opening.w, S.h * 0.4);
    }
    if (opt.box !== false || opt.bloom > 0) drawFlowerBox(ctx, G, opt.bloom || 0, opt.bloomColor);
    drawShutters(ctx, G, o, shut);
    if (opt.rain > 0) drawRain(ctx, G, clamp(opt.rain, 0, 1), opt.t || 0, opt.seed || 0);
    ctx.restore();
  }

  // the face alone on a cream window tile (Talk-time choices, title)
  function drawFace(ctx, w, h, face, opt) {
    opt = opt || {};
    face = face || { kind: 'number', value: '?' };
    ctx.save();
    if (opt.alpha != null && opt.alpha < 1) ctx.globalAlpha *= Math.max(0, opt.alpha);
    if (opt.glow > 0) {
      var Gh = { frame: { x: -w / 2, y: -h / 2 + 0.04 * w, w: w, h: h - 0.08 * w }, w: w };
      drawHalo(ctx, Gh, opt.glow, opt.glowColor || '#FFD95A', 0.035);
    }
    if (!opt.plain) {
      var parity = parityOf(face);
      cached(ctx, 'tile:' + (parity || ''), w, h, function (c, W, H) {
        var r = 0.12 * W, lw = Math.max(1.5, 0.026 * W);
        rr(c, -W / 2 + lw / 2, -H / 2 + lw / 2, W - lw, H - lw, r);
        var g = c.createLinearGradient(0, -H / 2, 0, H / 2);
        g.addColorStop(0, '#FFFCF4'); g.addColorStop(0.6, ROOM.wall); g.addColorStop(1, ROOM.wall2);
        c.fillStyle = g; c.fill();
        var pc = parity ? (parity === 'odd' ? COLORS.blue : COLORS.orange) : null;
        c.lineWidth = pc ? Math.max(3, 0.06 * W) : lw; c.strokeStyle = pc ? pc.base : '#B79A72'; c.stroke();
        if (pc) { rr(c, -W / 2 + lw / 2, -H / 2 + lw / 2, W - lw, H - lw, r); c.lineWidth = Math.max(1, 0.012 * W); c.strokeStyle = pc.dark; c.stroke(); }
        c.beginPath(); c.moveTo(-W / 2 + 0.07 * W, -H / 2 + 0.24 * W); c.quadraticCurveTo(-W / 2 + 0.08 * W, -H / 2 + 0.08 * W, -W / 2 + 0.24 * W, -H / 2 + 0.065 * W);
        c.lineCap = 'round'; c.lineWidth = Math.max(1, 0.02 * W); c.strokeStyle = 'rgba(255,255,255,0.9)'; c.stroke();
      });
    }
    var bw = w * (opt.plain ? 0.94 : 0.76), bh = h * (opt.plain ? 0.94 : 0.76);
    drawContent(ctx, face, { cx: 0, cy: 0, w: bw, h: bh }, opt);
    ctx.restore();
  }

  // ================================================================ public: building
  function paintBuilding(ctx, R, b, opt, ox, oy) {
    // R in local coords where the facade starts at (ox, oy)
    var x = ox, y = oy, w = R.w, h = R.h, rh = R.roofH || 0.32 * 140;
    var fac = resolve(b.facade, FACADES, FACADES.cream);
    var trim = resolve(b.trim, { white: TRIM }, TRIM);
    var shut = resolve(b.shutter, SHUTTERS, SHUTTERS.teal);
    var dark = mix(fac, '#4E4044', 0.42), mid = mix(fac, dark, 0.22), lightF = mix(fac, '#FFFFFF', 0.25);
    var tDark = mix(trim, '#6E5E50', 0.5);
    var roofCol = mix(dark, '#8E6A60', 0.45), roofDark = mix(roofCol, '#2E2224', 0.35);
    var lw = Math.max(1.5, Math.min(3, w / 300));
    var R0 = rng((b.seed | 0) + 101);
    var ov = Math.min(14, 0.025 * w), corn = 0.3 * rh;
    ctx.lineJoin = 'round';

    // ---- roof (behind the cornice)
    var roof = b.roof || 'flat';
    if (roof === 'gable') {
      var ah = Math.min(rh * 1.55, w * 0.16);
      poly(ctx, [[x - ov * 1.6, y - corn + 2], [x + w / 2, y - corn - ah], [x + w + ov * 1.6, y - corn + 2]]);
      ctx.fillStyle = roofCol; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = roofDark; ctx.stroke();
      var band = Math.max(7, rh * 0.26), slope = ah / (w / 2 + ov * 1.6), inx = band * Math.sqrt(1 + 1 / (slope * slope));
      // tile courses along the slopes
      ctx.save(); poly(ctx, [[x - ov * 1.6, y - corn + 2], [x + w / 2, y - corn - ah], [x + w + ov * 1.6, y - corn + 2]]); ctx.clip();
      ctx.strokeStyle = rgba(roofDark, 0.45); ctx.lineWidth = Math.max(1, lw * 0.6);
      for (var tk = 1; tk < 3; tk++) {
        var d = band * tk / 3, ix = d * Math.sqrt(1 + 1 / (slope * slope));
        ctx.beginPath(); ctx.moveTo(x - ov * 1.6 + ix, y - corn + 2); ctx.lineTo(x + w / 2, y - corn - ah + d * Math.sqrt(1 + slope * slope)); ctx.lineTo(x + w + ov * 1.6 - ix, y - corn + 2); ctx.stroke();
      }
      ctx.restore();
      poly(ctx, [[x - ov * 1.6 + inx, y - corn + 1], [x + w / 2, y - corn - ah + band * Math.sqrt(1 + slope * slope)], [x + w + ov * 1.6 - inx, y - corn + 1]]);
      ctx.fillStyle = lightF; ctx.fill(); ctx.lineWidth = lw * 0.8; ctx.strokeStyle = mid; ctx.stroke();
      // round attic window
      var orr = Math.min(ah * 0.2, 22), ocy = y - corn - ah * 0.36;
      ctx.beginPath(); ctx.arc(x + w / 2, ocy, orr + lw * 1.6, 0, Math.PI * 2); ctx.fillStyle = trim; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = tDark; ctx.stroke();
      ctx.beginPath(); ctx.arc(x + w / 2, ocy, orr, 0, Math.PI * 2); ctx.fillStyle = shut; ctx.fill();
      ctx.lineWidth = Math.max(1, orr * 0.14); ctx.strokeStyle = trim;
      ctx.beginPath(); ctx.moveTo(x + w / 2 - orr, ocy); ctx.lineTo(x + w / 2 + orr, ocy); ctx.moveTo(x + w / 2, ocy - orr); ctx.lineTo(x + w / 2, ocy + orr); ctx.stroke();
    } else if (roof === 'arch') {
      var aw = Math.min(w * 0.5, 340), ah2 = Math.min(rh * 1.35, w * 0.14);
      ctx.beginPath(); ctx.moveTo(x + w / 2 - aw / 2, y - corn);
      ctx.bezierCurveTo(x + w / 2 - aw / 2, y - corn - ah2 * 1.3, x + w / 2 + aw / 2, y - corn - ah2 * 1.3, x + w / 2 + aw / 2, y - corn);
      ctx.closePath(); ctx.fillStyle = fac; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = dark; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + w / 2 - aw / 2 - 4, y - corn);
      ctx.bezierCurveTo(x + w / 2 - aw / 2 - 4, y - corn - ah2 * 1.36, x + w / 2 + aw / 2 + 4, y - corn - ah2 * 1.36, x + w / 2 + aw / 2 + 4, y - corn);
      ctx.lineWidth = Math.max(3, rh * 0.09); ctx.strokeStyle = trim; ctx.stroke(); ctx.lineWidth = lw * 0.7; ctx.strokeStyle = tDark; ctx.stroke();
      // half-round fan window
      var fr = Math.min(ah2 * 0.62, aw * 0.18), fcy = y - corn - 2;
      ctx.beginPath(); ctx.arc(x + w / 2, fcy, fr, Math.PI, 0); ctx.closePath(); ctx.fillStyle = shut; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = tDark; ctx.stroke();
      ctx.lineWidth = Math.max(1, fr * 0.08); ctx.strokeStyle = trim;
      for (var k = 1; k < 4; k++) { var a = Math.PI + k * Math.PI / 4; ctx.beginPath(); ctx.moveTo(x + w / 2, fcy); ctx.lineTo(x + w / 2 + Math.cos(a) * fr, fcy + Math.sin(a) * fr); ctx.stroke(); }
      // low parapet on both sides
      ctx.fillStyle = mid; ctx.fillRect(x - ov * 0.6, y - corn - rh * 0.3, w / 2 - aw / 2 + ov * 0.6, rh * 0.3 + 1);
      ctx.fillRect(x + w / 2 + aw / 2, y - corn - rh * 0.3, w / 2 - aw / 2 + ov * 0.6, rh * 0.3 + 1);
      ctx.fillStyle = trim;
      ctx.fillRect(x - ov, y - corn - rh * 0.36, w / 2 - aw / 2 + ov, rh * 0.09);
      ctx.fillRect(x + w / 2 + aw / 2, y - corn - rh * 0.36, w / 2 - aw / 2 + ov, rh * 0.09);
    } else {   // flat: parapet with a raised centre panel and a round medallion
      var ph = rh * 1.05, cw2 = Math.min(w * 0.3, 200);
      ctx.fillStyle = mid; ctx.fillRect(x - ov * 0.5, y - corn - ph * 0.6, w + ov, ph * 0.6);
      rr(ctx, x + w / 2 - cw2 / 2, y - corn - ph, cw2, ph, 4); ctx.fillStyle = fac; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = dark; ctx.stroke();
      ctx.fillStyle = trim;
      ctx.fillRect(x - ov, y - corn - ph * 0.6 - rh * 0.08, w + 2 * ov, rh * 0.09);
      rr(ctx, x + w / 2 - cw2 / 2 - 4, y - corn - ph - rh * 0.06, cw2 + 8, rh * 0.1, 3); ctx.fill(); ctx.lineWidth = lw * 0.7; ctx.strokeStyle = tDark; ctx.stroke();
      var mr = Math.min(ph * 0.26, 16);
      ctx.beginPath(); ctx.arc(x + w / 2, y - corn - ph * 0.46, mr, 0, Math.PI * 2); ctx.fillStyle = trim; ctx.fill(); ctx.lineWidth = lw * 0.8; ctx.strokeStyle = tDark; ctx.stroke();
      ctx.beginPath(); ctx.arc(x + w / 2, y - corn - ph * 0.46, mr * 0.5, 0, Math.PI * 2); ctx.fillStyle = shut; ctx.fill();
      // little posts along the parapet
      var np = Math.max(2, Math.round(w / 90));
      ctx.fillStyle = trim;
      for (var q = 0; q <= np; q++) {
        var px = x + (w * q) / np; if (Math.abs(px - (x + w / 2)) < cw2 / 2 + 10) continue;
        ctx.fillRect(px - 4, y - corn - ph * 0.6 - rh * 0.14, 8, rh * 0.08);
      }
    }

    // ---- facade body
    ctx.save();
    rr(ctx, x, y - 1, w, h + 1, 3);
    var fg = ctx.createLinearGradient(0, y, 0, y + h);
    fg.addColorStop(0, lightF); fg.addColorStop(0.25, fac); fg.addColorStop(1, mix(fac, mid, 0.5));
    ctx.fillStyle = fg; ctx.fill();
    ctx.clip();
    // gentle block texture (deterministic)
    var bwk = clamp(w / 24, 16, 34), bhk = bwk * 0.42, nb = Math.round(clamp(w * h / 6000, 18, 110));
    for (var i = 0; i < nb; i++) {
      var bx = x + R0() * w, by = y + R0() * h, lt = R0() < 0.5;
      rr(ctx, bx, by, bwk * (0.8 + 0.4 * R0()), bhk, bhk * 0.35);
      ctx.fillStyle = lt ? rgba(lightF, 0.55) : rgba(mid, 0.4); ctx.fill();
    }
    // floor bands between window rows (opt.bands: absolute y list, converted by the caller)
    (opt._bands || []).forEach(function (yy) {
      ctx.fillStyle = rgba(trim, 0.85); ctx.fillRect(x, yy - 2, w, 5);
      ctx.fillStyle = rgba(dark, 0.18); ctx.fillRect(x, yy + 3, w, 2);
    });
    // side pilasters (quoins)
    var qw = clamp(w * 0.03, 10, 22), qh = qw * 1.1;
    for (var s2 = 0; s2 < 2; s2++) {
      var qx = s2 ? x + w - qw : x;
      ctx.fillStyle = rgba(mix(fac, trim, 0.55), 0.9); ctx.fillRect(qx, y, qw, h);
      ctx.fillStyle = rgba(mid, 0.35);
      for (var yy2 = y + qh; yy2 < y + h; yy2 += qh * 2) ctx.fillRect(qx, yy2, qw, qh);
    }
    // plinth
    var plH = clamp(h * 0.05, 10, 24);
    ctx.fillStyle = mix(fac, dark, 0.35); ctx.fillRect(x, y + h - plH, w, plH);
    ctx.fillStyle = rgba(trim, 0.6); ctx.fillRect(x, y + h - plH, w, 3);
    // ambient shade under the cornice
    var sg = ctx.createLinearGradient(0, y, 0, y + 22);
    sg.addColorStop(0, rgba(dark, 0.3)); sg.addColorStop(1, rgba(dark, 0));
    ctx.fillStyle = sg; ctx.fillRect(x, y, w, 22);
    ctx.restore();
    rr(ctx, x, y - 1, w, h + 1, 3); ctx.lineWidth = lw; ctx.strokeStyle = dark; ctx.stroke();

    // ---- drainpipe
    var pipeX = opt._pipeX != null ? opt._pipeX : x + w - Math.max(5, Math.min(8, w / 110)) / 2 - 4;
    var pc = mix('#9AA3AA', fac, 0.3), pd = mix(pc, '#3E4448', 0.4), pw = Math.max(5, Math.min(8, w / 110));
    ctx.fillStyle = pc; ctx.fillRect(pipeX - pw / 2, y - corn * 0.2, pw, h + corn * 0.2 - plH * 0.3);
    ctx.lineWidth = 1.2; ctx.strokeStyle = pd; ctx.strokeRect(pipeX - pw / 2, y - corn * 0.2, pw, h + corn * 0.2 - plH * 0.3);
    for (var bk = y + 40; bk < y + h - 20; bk += 90) { ctx.fillStyle = pd; ctx.fillRect(pipeX - pw / 2 - 2, bk, pw + 4, 3); }
    rr(ctx, pipeX - pw, y + h - plH * 0.4, pw * 2.2, pw * 0.9, 2); ctx.fillStyle = pc; ctx.fill(); ctx.strokeStyle = pd; ctx.stroke();

    // ---- cornice (over the roof base)
    rr(ctx, x - ov, y - corn, w + 2 * ov, corn, 3); ctx.fillStyle = trim; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = tDark; ctx.stroke();
    ctx.fillStyle = mix(trim, '#B8A58E', 0.45); ctx.fillRect(x - ov + 2, y - corn * 0.42, w + 2 * ov - 4, corn * 0.18);
    var dw = clamp(corn * 0.42, 4, 10), nd = Math.floor((w + 2 * ov) / (dw * 2.2));
    ctx.fillStyle = mix(trim, '#B8A58E', 0.3);
    for (var dn = 0; dn < nd; dn++) ctx.fillRect(x - ov + dw * 0.6 + dn * dw * 2.2, y - 1, dw, dw * 0.8);
    ctx.fillStyle = rgba('#FFFFFF', 0.9); ctx.fillRect(x - ov + 3, y - corn + 2, w + 2 * ov - 6, 2);

    // ---- door + steps + lamp + plant + plaque
    var doorW = opt._doorW, doorX = opt._doorX, doorH = opt._doorH;
    var stepH = Math.max(5, doorW * 0.09), dB = y + h - 2 * stepH, dT = dB - doorH;
    // steps
    rr(ctx, doorX - doorW * 0.78, y + h - stepH, doorW * 1.56, stepH + 2, 2); ctx.fillStyle = '#D8CFC4'; ctx.fill(); ctx.lineWidth = lw * 0.8; ctx.strokeStyle = '#9C9086'; ctx.stroke();
    rr(ctx, doorX - doorW * 0.66, y + h - 2 * stepH, doorW * 1.32, stepH + 1, 2); ctx.fillStyle = '#E6DED4'; ctx.fill(); ctx.stroke();
    // door surround (trim) with arched top
    var sr = doorW * 0.62;
    ctx.beginPath(); ctx.moveTo(doorX - sr, dB); ctx.lineTo(doorX - sr, dT + doorW * 0.5); ctx.arc(doorX, dT + doorW * 0.5, sr, Math.PI, 0); ctx.lineTo(doorX + sr, dB); ctx.closePath();
    ctx.fillStyle = trim; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = tDark; ctx.stroke();
    var dr = doorW / 2;
    function doorPath() { ctx.beginPath(); ctx.moveTo(doorX - dr, dB); ctx.lineTo(doorX - dr, dT + dr); ctx.arc(doorX, dT + dr, dr, Math.PI, 0); ctx.lineTo(doorX + dr, dB); ctx.closePath(); }
    doorPath(); ctx.fillStyle = shut; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = mix(shut, '#2A211E', 0.5); ctx.stroke();
    // fanlight
    ctx.beginPath(); ctx.arc(doorX, dT + dr, dr * 0.78, Math.PI, 0); ctx.closePath();
    ctx.fillStyle = '#FFF1CF'; ctx.fill(); ctx.lineWidth = Math.max(1, lw * 0.7); ctx.strokeStyle = mix(shut, '#2A211E', 0.4); ctx.stroke();
    for (var fk = 1; fk < 4; fk++) { var fa = Math.PI + fk * Math.PI / 4; ctx.beginPath(); ctx.moveTo(doorX, dT + dr); ctx.lineTo(doorX + Math.cos(fa) * dr * 0.78, dT + dr + Math.sin(fa) * dr * 0.78); ctx.stroke(); }
    // two door panels + knob
    var pTop = dT + dr + doorW * 0.12, pH = (dB - pTop - doorW * 0.12);
    ctx.lineWidth = Math.max(1, lw * 0.8); ctx.strokeStyle = mix(shut, '#2A211E', 0.35); ctx.fillStyle = mix(shut, '#2A211E', 0.12);
    [[pTop, pH * 0.45], [pTop + pH * 0.55, pH * 0.45]].forEach(function (pp) { rr(ctx, doorX - dr * 0.7, pp[0], dr * 1.4, pp[1], 3); ctx.fill(); ctx.stroke(); });
    ctx.beginPath(); ctx.arc(doorX + dr * 0.72, pTop + pH * 0.5, Math.max(2, doorW * 0.045), 0, Math.PI * 2); ctx.fillStyle = '#E2B85A'; ctx.fill(); ctx.strokeStyle = '#7A5C22'; ctx.stroke();
    // wall lamp beside the door
    var lx = doorX + sr + doorW * 0.28, ly = dT + doorW * 0.55, ls = doorW * 0.16;
    ctx.fillStyle = '#4E4648'; ctx.fillRect(lx - 1.5, ly - ls * 1.6, 3, ls * 0.8);
    rr(ctx, lx - ls * 0.6, ly - ls * 0.8, ls * 1.2, ls * 1.6, ls * 0.3); ctx.fillStyle = '#FFE9A8'; ctx.fill(); ctx.lineWidth = Math.max(1, lw * 0.8); ctx.strokeStyle = '#4E4648'; ctx.stroke();
    poly(ctx, [[lx - ls * 0.8, ly - ls * 0.8], [lx + ls * 0.8, ly - ls * 0.8], [lx, ly - ls * 1.4]]); ctx.fillStyle = '#4E4648'; ctx.fill();
    // plaque (no text) above the door
    rr(ctx, doorX - doorW * 0.3, dT - doorW * 0.36 - 2, doorW * 0.6, doorW * 0.22, doorW * 0.1); ctx.fillStyle = shut; ctx.fill(); ctx.lineWidth = Math.max(1, lw * 0.7); ctx.strokeStyle = trim; ctx.stroke();
    ctx.beginPath(); ctx.arc(doorX, dT - doorW * 0.25 - 2, doorW * 0.045, 0, Math.PI * 2); ctx.fillStyle = trim; ctx.fill();
    // potted bush by the steps
    var bx2 = doorX - doorW * 0.78 - doorW * 0.32, pr = doorW * 0.24;
    poly(ctx, [[bx2 - pr * 0.8, y + h - pr * 1.1], [bx2 + pr * 0.8, y + h - pr * 1.1], [bx2 + pr * 0.6, y + h], [bx2 - pr * 0.6, y + h]]);
    ctx.fillStyle = '#C47A56'; ctx.fill(); ctx.lineWidth = Math.max(1, lw * 0.8); ctx.strokeStyle = '#8A4E34'; ctx.stroke();
    ctx.beginPath(); ctx.arc(bx2, y + h - pr * 1.6, pr * 0.9, 0, Math.PI * 2); ctx.fillStyle = '#6DB36F'; ctx.fill(); ctx.strokeStyle = '#3F8A4D'; ctx.stroke();
    ctx.beginPath(); ctx.arc(bx2 - pr * 0.3, y + h - pr * 1.9, pr * 0.3, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fill();
  }

  function drawBuilding(ctx, rect, building, opt) {
    opt = opt || {}; building = building || {};
    var R = { x: rect.x, y: rect.y, w: rect.w, h: rect.h, roofH: rect.roofH || Math.max(30, rect.w * 0.06) };
    var doorW = opt.doorW || clamp(R.w * 0.1, 46, 84);
    var doorH = opt.doorH || doorW * 1.75;
    var doorX = opt.doorX != null ? opt.doorX : R.x + R.w * 0.74;
    var light = clamp(+opt.light || 0, 0, 1);
    var pad = Math.ceil(Math.min(14, 0.025 * R.w) * 1.6 + 8), top = Math.ceil(Math.max(R.roofH * 1.9, R.roofH * 0.3 + Math.min(R.roofH * 1.55, R.w * 0.16)) + pad);
    var bands = (opt.bands || []).map(function (y) { return y - R.y; });
    var o2 = { _doorW: doorW, _doorH: doorH, _doorX: doorX - R.x + pad, _bands: bands.map(function (y) { return y + top; }),
      _pipeX: opt.pipeX != null ? opt.pipeX - R.x + pad : null };
    var key = ['b', building.facade, building.trim, building.shutter, building.roof, building.door, building.seed | 0,
      Math.round(R.w), Math.round(R.h), Math.round(R.roofH), Math.round(o2._doorX), Math.round(doorW), Math.round(doorH), bands.map(Math.round).join(','), o2._pipeX == null ? '' : Math.round(o2._pipeX)].join('|');
    var dpr = Math.min(2, Math.max(1, Math.round(ctxScale(ctx) * 2) / 2));
    var BW = Math.ceil(R.w + 2 * pad), BH = Math.ceil(R.h + top + 4);
    var e = null;
    for (var i = 0; i < bcache.length; i++) if (bcache[i].key === key && bcache[i].dpr === dpr) { e = bcache[i]; break; }
    if (!e && opt.cache !== false) {
      var cv = makeCanvas(Math.ceil(BW * dpr), Math.ceil(BH * dpr));
      if (cv) {
        var c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
        paintBuilding(c, R, building, o2, pad, top);
        e = { key: key, dpr: dpr, cv: cv };
        bcache.unshift(e); if (bcache.length > BCACHE_MAX) bcache.length = BCACHE_MAX;
      }
    }
    if (e) ctx.drawImage(e.cv, R.x - pad, R.y - top, BW, BH);
    else { ctx.save(); ctx.translate(R.x - pad, R.y - top); paintBuilding(ctx, R, building, o2, pad, top); ctx.restore(); }
    if (light > 0.01) {   // cheer: warm wash + lamp glow
      ctx.save();
      var g = ctx.createRadialGradient(R.x + R.w / 2, R.y + R.h * 0.3, 0, R.x + R.w / 2, R.y + R.h * 0.3, Math.max(R.w, R.h) * 0.8);
      g.addColorStop(0, rgba('#FFF1C2', 0.45 * light)); g.addColorStop(1, rgba('#FFE29A', 0));
      ctx.fillStyle = g; ctx.fillRect(R.x, R.y - R.roofH, R.w, R.h + R.roofH);
      var lx = doorX + doorW * 0.62 + doorW * 0.28, ly = R.y + R.h - 2 * Math.max(5, doorW * 0.09) - doorH + doorW * 0.55;
      var lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, doorW * 0.8);
      lg.addColorStop(0, rgba('#FFE9A8', 0.8 * light)); lg.addColorStop(1, rgba('#FFE9A8', 0));
      ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(lx, ly, doorW * 0.8, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  // ================================================================ bunting + balloon
  var BUNT = ['red', 'yellow', 'blue', 'green', 'orange', 'purple', 'pink'].map(function (k) { return { f: mix(COLORS[k].base, '#F4EBDD', 0.32), d: mix(COLORS[k].dark, '#F4EBDD', 0.2) }; });
  function drawBunting(ctx, x0, y0, x1, y1, t) {
    t = t || 0;
    var len = Math.hypot(x1 - x0, y1 - y0), sag = len * (0.09 + 0.012 * Math.sin(t * 1.4));
    var mx = (x0 + x1) / 2, my = (y0 + y1) / 2 + sag * 2;   // quadratic control → mid sag = sag
    var fs = clamp(len / 16, 12, 34), n = Math.max(3, Math.floor(len / (fs * 1.3)));
    ctx.save();
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, x1, y1);
    ctx.lineWidth = Math.max(1.2, fs * 0.08); ctx.strokeStyle = '#8A7A6A'; ctx.stroke();
    for (var i = 0; i < n; i++) {
      var u = (i + 0.5) / n, a = 1 - u;
      var px = a * a * x0 + 2 * a * u * mx + u * u * x1, py = a * a * y0 + 2 * a * u * my + u * u * y1;
      var tx = 2 * a * (mx - x0) + 2 * u * (x1 - mx), ty = 2 * a * (my - y0) + 2 * u * (y1 - my), ang = Math.atan2(ty, tx);
      var sway = Math.sin(t * 2.3 + i * 0.9) * 0.14;
      var c = BUNT[i % BUNT.length];
      ctx.save(); ctx.translate(px, py); ctx.rotate(ang + sway);
      ctx.beginPath(); ctx.moveTo(-fs * 0.45, 0); ctx.lineTo(fs * 0.45, 0); ctx.lineTo(0, fs * 0.95); ctx.closePath();
      ctx.fillStyle = c.f; ctx.fill(); ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(1, fs * 0.06); ctx.strokeStyle = c.d; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-fs * 0.3, fs * 0.08); ctx.lineTo(-fs * 0.05, fs * 0.6); ctx.lineWidth = Math.max(1, fs * 0.06); ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
  function drawBalloon(ctx, colorKey, size, t) {
    t = t || 0;
    var c = col(colorKey), s = size / 0.62;   // body width = size
    ctx.save();
    var ky = 0.43 * s, L = 1.5 * size, sw = Math.sin(t * 2.1) * 0.12 * size;
    ctx.beginPath(); ctx.moveTo(0, ky);
    ctx.bezierCurveTo(sw, ky + L * 0.33, -sw, ky + L * 0.66, sw * 0.6, ky + L);
    ctx.lineWidth = Math.max(1.2, 0.03 * size); ctx.strokeStyle = '#8C7B6E'; ctx.lineCap = 'round'; ctx.stroke();
    balloonBody(ctx, c, s, 0, 0);
    ctx.restore();
  }

  GW.WindowArt = {
    COLORS: COLORS, SHAPES: SHAPES, THINGS: THINGS, FACADES: FACADES, SHUTTERS: SHUTTERS, TRIM: TRIM, ROOM: ROOM, WOOD: WOOD,
    DOT_LAYOUTS: DOTS, SWING: SWING, PERSP: PERSP,
    drawWindow: drawWindow, drawFace: drawFace, drawBuilding: drawBuilding, drawThing: drawThing,
    drawBunting: drawBunting, drawBalloon: drawBalloon, drawStar: drawStar, drawLantern: drawLantern, traceShape: traceShape,
    geometry: geometry,
    clearCache: function () { cache = {}; cacheN = 0; bcache = []; },
    _contrast: contrast, _saturation: saturation, _chroma: chroma, _lum: lum, _faceSig: faceSig, _resolve: resolve,
    _cacheSize: function () { return cacheN + bcache.length; }
  };
})(typeof window !== 'undefined' ? (window.GW = window.GW || {}) : (globalThis.GW = globalThis.GW || {}));
