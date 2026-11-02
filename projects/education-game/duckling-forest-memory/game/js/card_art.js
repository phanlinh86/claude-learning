// DM.CardArt — code-drawn cards and forest rewards for Dee's Forest Memory (character artist A). See docs/DESIGN.md §5.6.
// Classic script; safe to require() in node (document / canvases are only touched lazily inside draw calls).
//
// Everything is drawn CENTRED at (0,0) in the current transform:
//   drawBack(ctx, w, h, opt)            card back (items/card_back.svg via DM.Assets if loaded, else the same design by code)
//   drawFront(ctx, w, h, face, opt)     cream card + face content (cached bitmap) + live sprite for kind 'animal'
//   drawCard(ctx, w, h, face, flip, opt)  convenience: 3D flip (scaleX = |cos πflip|, face when flip > 0.5, slight skew)
//   drawButterfly(ctx, color, size, flap)  size = wingspan; flap 0 = wings open … 1 = wings almost closed
//   drawLantern(ctx, shape, color, size, glow)  size = shape box width; hook top at y = lanternTop(shape, size)
//   drawAcorn(ctx, size, opt)            size = acorn width; height ≈ 1.26·size (stem −0.66·size … tip +0.6·size)
//   drawStar(ctx, size, text, opt)       glowing gold star (size = tip-to-tip width) with optional text in the middle
// opt (front/back/card): { glow 0..1 (live warm halo, e.g. hint/selected), glowColor '#RRGGBB', alpha 0..1,
//                          sprite(name, x, y, size) — renderer callback for animal faces (x,y = centre, size = box px) }
// face: { kind:'color'|'shape'|'dots'|'number'|'letter'|'text'|'animal'|'parity', value, color?, shape?, sprite?, text?, n?,
//         scale? (content scale, e.g. 0.6 for the small one of a big/small pair), parity? 'odd'|'even' (frame colour on any
//         kind), dots? true (parity card showing acorns instead of the numeral) }
// Bitmaps are cached per (face, round(w), round(h), device scale); the device scale comes from the context's Y axis, so a
// flip (scaleX) never changes the bucket. The glow is drawn live (never cached).
(function (DM) {
  'use strict';

  var PALETTE = {
    red: ['#E84A4A', '#A8282E'], blue: ['#3C8DE8', '#1F5BA8'], yellow: ['#FFD23F', '#C99A12'],
    green: ['#4CC26B', '#2A8343'], orange: ['#FF9A2E', '#C4650C'], purple: ['#9B6BE0', '#6840A8'],
    pink: ['#FF8FC0', '#C9558A']
  };
  var CARD = { face: '#FFF8EA', face2: '#FBEFD8', frame: '#E7D3AE', line: '#9A774C', ink: '#3D2814', inkSoft: '#E9D9BC' };
  var BACK = { base: '#2F7D73', line: '#1F5C54', mid: '#4FA393', light: '#8CCFB8', medal: '#3A8C80', glowC: '#4A9A8E' };
  var ACORN = { nut: '#C98A4B', nutSh: '#A66B33', nutHi: '#EBC08E', cap: '#8C5B2E', capSh: '#6E4421', line: '#5A3818', stem: '#5A3818' };
  var ACORN_GOLD = { nut: '#F4C653', nutSh: '#D9A033', nutHi: '#FFE7A3', cap: '#B9792C', capSh: '#94591B', line: '#7E4E14', stem: '#7E4E14' };
  var FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", "Segoe UI", system-ui, -apple-system, sans-serif';
  var SHAPES = ['circle', 'square', 'triangle', 'star', 'heart', 'rect'];

  function hexRgb(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  function rgbHex(c) {
    return '#' + c.map(function (v) { var s = Math.max(0, Math.min(255, Math.round(v))).toString(16); return s.length < 2 ? '0' + s : s; }).join('').toUpperCase();
  }
  function mix(a, b, t) { var x = hexRgb(a), y = hexRgb(b); return rgbHex([0, 1, 2].map(function (i) { return x[i] + (y[i] - x[i]) * t; })); }
  function rgba(hex, a) { var c = hexRgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (+a).toFixed(3) + ')'; }
  function lum(hex) {
    var c = hexRgb(hex).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) { var la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }

  var COLORS = {};
  Object.keys(PALETTE).forEach(function (k) {
    var base = PALETTE[k][0], dark = PALETTE[k][1];
    COLORS[k] = { base: base, dark: dark, light: mix(base, '#FFFFFF', 0.42), shade: mix(base, dark, 0.5) };
  });
  function col(key) { return COLORS[key] || COLORS.red; }

  // ---------------------------------------------------------------- small helpers
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
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
  function hasPath2D() { return typeof Path2D !== 'undefined'; }

  // ---------------------------------------------------------------- shapes (unit = s, centred)
  // box: circle Ø1 · square 0.86 · rect 1.0 × 0.6 · triangle 1.0 × 0.9 · star Ø1.1 · heart 1.0 × 0.92
  var GEO = {
    circle: { top: -0.5, bot: 0.5 }, square: { top: -0.43, bot: 0.43 }, rect: { top: -0.3, bot: 0.3 },
    triangle: { top: -0.5, bot: 0.4 }, star: { top: -0.56, bot: 0.45 }, heart: { top: -0.3, bot: 0.47, notch: -0.3 }
  };
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
  function capY(shape, s) { // where the lantern cap sits (top of the shape at x = 0)
    return ({ circle: -0.5, square: -0.43, rect: -0.3, triangle: -0.5, star: -0.52, heart: -0.28 }[shape] || -0.5) * s;
  }
  function lanternTop(shape, size) { return capY(shape, size) - 0.2 * size; }

  // ---------------------------------------------------------------- lantern
  function drawLantern(ctx, shape, color, size, glow) {
    shape = GEO[shape] ? shape : 'circle';
    var c = col(color), s = size, lw = Math.max(1.4, 0.045 * s), cy = capY(shape, s);
    glow = Math.max(0, Math.min(1, glow || 0));
    ctx.save();
    if (glow > 0.01) {  // warm halo in the lantern's own colour
      var g0 = ctx.createRadialGradient(0, 0, s * 0.2, 0, 0, s * 0.95);
      g0.addColorStop(0, rgba(mix(c.light, '#FFF6C8', 0.5), 0.75 * glow));
      g0.addColorStop(0.5, rgba(c.light, 0.35 * glow));
      g0.addColorStop(1, rgba(c.light, 0));
      ctx.fillStyle = g0; ctx.beginPath(); ctx.arc(0, 0, s * 0.95, 0, Math.PI * 2); ctx.fill();
    }
    // hanger: a little loop + cap
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, cy - 0.15 * s, 0.05 * s, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(1.2, 0.03 * s); ctx.strokeStyle = '#7A5A2E'; ctx.stroke();
    // body
    traceShape(ctx, shape, s);
    var g = ctx.createRadialGradient(-0.08 * s, -0.04 * s, 0.03 * s, 0, 0.02 * s, 0.62 * s);
    g.addColorStop(0, mix(c.light, '#FFF8D8', 0.35 + 0.3 * glow));
    g.addColorStop(0.42, c.base); g.addColorStop(1, c.shade);
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.clip();
    // paper ribs
    ctx.lineWidth = Math.max(1, 0.022 * s); ctx.strokeStyle = rgba(c.dark, 0.35);
    [-0.24, 0.24].forEach(function (k) {
      ctx.beginPath(); ctx.moveTo(k * s * 0.4, -0.7 * s); ctx.quadraticCurveTo(k * s * 1.6, 0, k * s * 0.4, 0.7 * s); ctx.stroke();
    });
    ctx.restore();
    traceShape(ctx, shape, s);
    ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.strokeStyle = c.dark; ctx.stroke();
    // highlight
    var hx = ({ heart: -0.26, triangle: -0.12, rect: -0.3, star: -0.12 }[shape] || -0.2) * s;
    var hy = ({ heart: -0.17, triangle: -0.06, rect: -0.12, star: -0.12 }[shape] || -0.2) * s;
    ell(ctx, hx, hy, 0.1 * s, 0.055 * s, -0.7); ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fill();
    // cap on top
    rr(ctx, -0.12 * s, cy - 0.1 * s, 0.24 * s, 0.11 * s, 0.035 * s);
    ctx.fillStyle = '#D4A843'; ctx.fill(); ctx.lineWidth = Math.max(1, 0.028 * s); ctx.strokeStyle = '#8A6420'; ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------- butterfly
  function wingPaths(ctx, s, upper) {
    ctx.beginPath();
    if (upper) {
      ctx.moveTo(0.03 * s, -0.04 * s);
      ctx.bezierCurveTo(0.08 * s, -0.3 * s, 0.3 * s, -0.46 * s, 0.44 * s, -0.4 * s);
      ctx.bezierCurveTo(0.55 * s, -0.34 * s, 0.5 * s, -0.12 * s, 0.4 * s, -0.03 * s);
      ctx.bezierCurveTo(0.3 * s, 0.04 * s, 0.12 * s, 0.05 * s, 0.03 * s, 0.03 * s);
    } else {
      ctx.moveTo(0.03 * s, 0.02 * s);
      ctx.bezierCurveTo(0.16 * s, 0.03 * s, 0.34 * s, 0.06 * s, 0.34 * s, 0.2 * s);
      ctx.bezierCurveTo(0.34 * s, 0.33 * s, 0.2 * s, 0.38 * s, 0.12 * s, 0.32 * s);
      ctx.bezierCurveTo(0.05 * s, 0.26 * s, 0.03 * s, 0.14 * s, 0.03 * s, 0.02 * s);
    }
    ctx.closePath();
  }
  function drawButterfly(ctx, color, size, flap) {
    var c = col(color), s = size, lw = Math.max(1.2, 0.03 * s);
    flap = Math.max(0, Math.min(1, flap || 0));
    var k = 1 - 0.85 * flap;   // wing x-scale (wings fold up towards the body)
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (var side = -1; side <= 1; side += 2) {
      ctx.save();
      ctx.scale(side * k, 1);
      [false, true].forEach(function (upper) {
        wingPaths(ctx, s, upper);
        ctx.fillStyle = upper ? c.base : mix(c.base, c.shade, 0.35); ctx.fill();
        ctx.save(); ctx.clip();
        // light inner panel
        if (upper) { ell(ctx, 0.26 * s, -0.2 * s, 0.13 * s, 0.09 * s, -0.5); }
        else { ell(ctx, 0.19 * s, 0.18 * s, 0.08 * s, 0.07 * s, 0.4); }
        ctx.fillStyle = c.light; ctx.fill();
        ctx.restore();
        wingPaths(ctx, s, upper);
        ctx.lineWidth = lw; ctx.strokeStyle = c.dark; ctx.stroke();
      });
      // white spots along the upper-wing edge
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      [[0.43, -0.33, 0.032], [0.47, -0.2, 0.026], [0.29, 0.27, 0.024]].forEach(function (d) {
        ctx.beginPath(); ctx.arc(d[0] * s, d[1] * s, d[2] * s, 0, Math.PI * 2); ctx.fill();
      });
      ctx.restore();
    }
    // antennae
    ctx.strokeStyle = '#4A3424'; ctx.lineWidth = Math.max(1, 0.022 * s);
    for (var a = -1; a <= 1; a += 2) {
      ctx.beginPath(); ctx.moveTo(a * 0.02 * s, -0.26 * s);
      ctx.quadraticCurveTo(a * 0.05 * s, -0.4 * s, a * 0.13 * s, -0.43 * s); ctx.stroke();
      ctx.beginPath(); ctx.arc(a * 0.135 * s, -0.43 * s, 0.025 * s, 0, Math.PI * 2); ctx.fillStyle = '#4A3424'; ctx.fill();
    }
    // body + head with a tiny smile
    rr(ctx, -0.04 * s, -0.2 * s, 0.08 * s, 0.46 * s, 0.04 * s);
    ctx.fillStyle = '#5A4030'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, -0.22 * s, 0.065 * s, 0, Math.PI * 2); ctx.fillStyle = '#5A4030'; ctx.fill();
    ctx.beginPath(); ctx.arc(-0.02 * s, -0.235 * s, 0.014 * s, 0, Math.PI * 2); ctx.arc(0.022 * s, -0.235 * s, 0.014 * s, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(-0.012 * s, -0.12 * s, 0.012 * s, 0.05 * s, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------- acorn
  function drawAcorn(ctx, size, opt) {
    var P = (opt && opt.gold) ? ACORN_GOLD : ACORN, s = size, lw = Math.max(1, (opt && opt.lw) || 0.07 * s);
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    function nut() {
      ctx.beginPath(); ctx.moveTo(-0.42 * s, -0.08 * s);
      ctx.bezierCurveTo(-0.44 * s, 0.26 * s, -0.2 * s, 0.5 * s, 0, 0.6 * s);
      ctx.bezierCurveTo(0.2 * s, 0.5 * s, 0.44 * s, 0.26 * s, 0.42 * s, -0.08 * s); ctx.closePath();
    }
    function cap() {
      ctx.beginPath(); ctx.moveTo(-0.5 * s, -0.02 * s);
      ctx.bezierCurveTo(-0.54 * s, -0.3 * s, -0.28 * s, -0.44 * s, 0, -0.44 * s);
      ctx.bezierCurveTo(0.28 * s, -0.44 * s, 0.54 * s, -0.3 * s, 0.5 * s, -0.02 * s);
      ctx.bezierCurveTo(0.2 * s, 0.06 * s, -0.2 * s, 0.06 * s, -0.5 * s, -0.02 * s); ctx.closePath();
    }
    nut(); ctx.fillStyle = P.nut; ctx.fill();
    ctx.save(); nut(); ctx.clip();
    ctx.beginPath(); ctx.moveTo(0.12 * s, -0.06 * s); ctx.bezierCurveTo(0.3 * s, 0.04 * s, 0.3 * s, 0.32 * s, 0, 0.62 * s);
    ctx.lineTo(0.6 * s, 0.6 * s); ctx.lineTo(0.6 * s, -0.1 * s); ctx.closePath(); ctx.fillStyle = P.nutSh; ctx.fill();
    ctx.restore();
    nut(); ctx.lineWidth = lw; ctx.strokeStyle = P.line; ctx.stroke();
    ell(ctx, -0.2 * s, 0.13 * s, 0.07 * s, 0.14 * s, 0); ctx.fillStyle = rgba(P.nutHi, 0.95); ctx.fill();
    // stem
    ctx.beginPath(); ctx.moveTo(0.02 * s, -0.42 * s); ctx.bezierCurveTo(0.04 * s, -0.56 * s, 0.12 * s, -0.64 * s, 0.2 * s, -0.66 * s);
    ctx.lineWidth = lw * 1.6; ctx.strokeStyle = P.stem; ctx.stroke();
    cap(); ctx.fillStyle = P.cap; ctx.fill();
    ctx.save(); cap(); ctx.clip();
    ctx.fillStyle = rgba(P.capSh, 0.8); ctx.fillRect(-0.6 * s, -0.17 * s, 1.2 * s, 0.3 * s);
    if (s >= 14) {   // cap scales (skip when tiny)
      ctx.lineWidth = lw * 0.6; ctx.strokeStyle = rgba(P.line, 0.6);
      [[-0.28, -0.26], [0, -0.3], [0.28, -0.26], [-0.14, -0.14], [0.14, -0.14]].forEach(function (p) {
        ctx.beginPath(); ctx.moveTo((p[0] - 0.09) * s, p[1] * s); ctx.quadraticCurveTo(p[0] * s, (p[1] + 0.07) * s, (p[0] + 0.09) * s, p[1] * s); ctx.stroke();
      });
    }
    ctx.restore();
    cap(); ctx.lineWidth = lw; ctx.strokeStyle = P.line; ctx.stroke();
    ell(ctx, -0.22 * s, -0.3 * s, 0.09 * s, 0.04 * s, -0.4); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------- star (reward for letters / sums)
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
  // draw text visually centred at (x, y) using real glyph bounds when available
  function centredText(ctx, text, x, y, fill, outline, olw) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    var m = ctx.measureText(text), asc = m.actualBoundingBoxAscent, desc = m.actualBoundingBoxDescent;
    var by = (asc != null && desc != null && asc + desc > 0) ? y + (asc - desc) / 2 : y + parseFloat(ctx.font.replace(/^\D*?(\d+(\.\d+)?)px.*$/, '$1')) * 0.35;
    if (outline) { ctx.lineJoin = 'round'; ctx.lineWidth = olw; ctx.strokeStyle = outline; ctx.strokeText(text, x, by); }
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
    if (tw > 0) {  // a little 4-point twinkle at the upper right
      ctx.save(); ctx.translate(0.36 * s, -0.36 * s); ctx.scale(tw, tw);
      ctx.beginPath();
      ctx.moveTo(0, -0.16 * s); ctx.quadraticCurveTo(0, 0, 0.16 * s, 0); ctx.quadraticCurveTo(0, 0, 0, 0.16 * s);
      ctx.quadraticCurveTo(0, 0, -0.16 * s, 0); ctx.quadraticCurveTo(0, 0, 0, -0.16 * s);
      ctx.fillStyle = '#FFFFFF'; ctx.fill(); ctx.restore();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- dice-like acorn layouts (grid cols × rows, cells)
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
  function drawDots(ctx, n, bw, bh) {
    n = Math.max(1, Math.min(12, n | 0));
    var L = DOTS[n], cols = L[0], rows = L[1];
    // acorn width a, height ≈ 1.26a; cells are a bit roomier than the acorn
    var cw = bw / cols, ch = bh / rows;
    var a = Math.min(cw * 0.8, ch * 0.8 / 1.26, bw * (n === 1 ? 0.62 : n <= 4 ? 0.4 : 0.32));
    // pack the grid a little tighter than the box when acorns are capped
    var gx = Math.min(cw, a * 1.55), gy = Math.min(ch, a * 1.26 * 1.25);
    var x0 = -gx * (cols - 1) / 2, y0 = -gy * (rows - 1) / 2;
    L[2].forEach(function (p) {
      ctx.save(); ctx.translate(x0 + p[0] * gx, y0 + p[1] * gy + 0.03 * a);
      drawAcorn(ctx, a, { lw: Math.max(1.2, 0.075 * a) });
      ctx.restore();
    });
  }

  // ---------------------------------------------------------------- card front / back painters (unit: card w × h, centred)
  function parityOf(face) {
    if (!face) return null;
    if (face.parity === 'odd' || face.parity === 'even') return face.parity;
    if (face.kind === 'parity') { var n = face.n != null ? face.n : +face.value; return isFinite(n) ? (n % 2 ? 'odd' : 'even') : null; }
    return null;
  }
  function paintFrame(ctx, w, h, parity) {
    var r = 0.12 * w, lw = Math.max(1.5, 0.026 * w);
    rr(ctx, -w / 2 + lw / 2, -h / 2 + lw / 2, w - lw, h - lw, r);
    var g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, '#FFFCF4'); g.addColorStop(0.6, CARD.face); g.addColorStop(1, CARD.face2);
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = lw; ctx.strokeStyle = CARD.line; ctx.stroke();
    var ins = 0.068 * w;
    if (parity) {
      var pc = parity === 'odd' ? COLORS.blue : COLORS.orange, fl = 0.07 * w;
      rr(ctx, -w / 2 + ins, -h / 2 + ins, w - 2 * ins, h - 2 * ins, r * 0.6);
      ctx.lineWidth = fl; ctx.strokeStyle = pc.base; ctx.stroke();
      rr(ctx, -w / 2 + ins - fl / 2, -h / 2 + ins - fl / 2, w - 2 * ins + fl, h - 2 * ins + fl, r * 0.6 + fl / 2);
      ctx.lineWidth = Math.max(1, 0.012 * w); ctx.strokeStyle = pc.dark; ctx.stroke();
      rr(ctx, -w / 2 + ins + fl / 2, -h / 2 + ins + fl / 2, w - 2 * ins - fl, h - 2 * ins - fl, Math.max(1, r * 0.6 - fl / 2));
      ctx.stroke();
    } else {
      rr(ctx, -w / 2 + ins, -h / 2 + ins, w - 2 * ins, h - 2 * ins, r * 0.6);
      ctx.lineWidth = Math.max(1.5, 0.038 * w); ctx.strokeStyle = CARD.frame; ctx.stroke();
      // two tiny leaf sprigs in the frame corners (top-left, bottom-right)
      [[-1, -1], [1, 1]].forEach(function (q) {
        ctx.save(); ctx.translate(q[0] * (w / 2 - ins * 1.95), q[1] * (h / 2 - ins * 1.95)); ctx.rotate(q[0] < 0 ? -0.8 : 2.35);
        ell(ctx, 0, -0.035 * w, 0.03 * w, 0.014 * w, 0); ctx.fillStyle = CARD.frame; ctx.fill();
        ell(ctx, 0.032 * w, 0.005 * w, 0.03 * w, 0.014 * w, 0.9); ctx.fill();
        ctx.restore();
      });
    }
    // soft sheen along the top-left edge
    ctx.beginPath(); ctx.moveTo(-w / 2 + 0.07 * w, -h / 2 + 0.24 * w); ctx.quadraticCurveTo(-w / 2 + 0.08 * w, -h / 2 + 0.08 * w, -w / 2 + 0.24 * w, -h / 2 + 0.065 * w);
    ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1, 0.02 * w); ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.stroke();
  }

  function contentBox(w, h) { return { w: w * 0.74, h: h * 0.76 }; }

  function paintFace(ctx, w, h, face) {
    var parity = parityOf(face);
    paintFrame(ctx, w, h, parity);
    var b = contentBox(w, h), k = face.scale == null ? 1 : face.scale, kind = face.kind;
    ctx.save();
    ctx.scale(k, k);
    if (kind === 'parity') kind = face.dots || face.show === 'dots' || face.as === 'dots' ? 'dots' : 'number';
    switch (kind) {
      case 'color': {
        ctx.translate(0, 0.02 * h);
        drawButterfly(ctx, face.color || face.value, b.w * 1.06, 0);
        break;
      }
      case 'shape': {
        var sh = face.shape || face.value, ls = b.w * (sh === 'rect' ? 0.95 : sh === 'star' ? 0.9 : sh === 'square' ? 0.92 : 0.86);
        ctx.translate(0, 0.06 * h + ({ rect: 0.02, triangle: 0.03, heart: 0.02 }[sh] || 0) * h);
        drawLantern(ctx, sh, face.color || 'red', ls, 0.28);
        break;
      }
      case 'dots': {
        drawDots(ctx, face.n != null ? face.n : +face.value, b.w, b.h);
        break;
      }
      case 'animal': break;   // shadow drawn below (unscaled ground line); the sprite is drawn live by opt.sprite
      default: { // number, letter, text
        var str = String(face.text != null ? face.text : face.value != null ? face.value : face.n);
        var isText = kind === 'text' || str.length > 2;
        var px = isText ? 0.3 * h : str.length === 2 ? 0.5 * h : 0.62 * h;
        px = fitFont(ctx, str, b.w * (isText ? 1.08 : 0.98), Math.round(px));
        centredText(ctx, str, 0.012 * w + 0, 0.022 * h, CARD.inkSoft);   // soft offset shadow
        centredText(ctx, str, 0, 0, CARD.ink);
      }
    }
    ctx.restore();
    if (kind === 'animal') {   // soft ground shadow on one shared ground line, so big and small stand side by side
      var A = animalBox(w, h, k);
      ell(ctx, 0, A.ground + 0.02 * A.sz, 0.34 * A.sz * k, 0.06 * A.sz * Math.max(0.7, k), 0);
      ctx.fillStyle = 'rgba(120,90,50,0.17)'; ctx.fill();
    }
  }
  // animal sprite box: sz = full-size box, ground = y of the sticker's feet (stickers are ≈110/128 of their box)
  function animalBox(w, h, k) {
    var sz = contentBox(w, h).w * 1.18, ground = 0.43 * sz - 0.01 * h;
    return { sz: sz, ground: ground, y: ground - 0.43 * sz * k, size: sz * k };
  }

  // card back: identical geometry to items/card_back.svg (156 × 200 units)
  var BACKQ = null;
  function backQuadrant(ctx) {
    var m = BACK.mid, l = BACK.light;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = m;
    if (hasPath2D()) {
      if (!BACKQ) BACKQ = [new Path2D('M18,30 C18,18 30,14 38,20 C46,26 40,38 32,34 C26,31 30,24 34,26'),
        new Path2D('M34,20 C50,14 64,22 70,34'), new Path2D('M24,36 C18,50 22,64 32,72')];
      ctx.lineWidth = 3.2; ctx.stroke(BACKQ[0]);
      ctx.lineWidth = 2.6; ctx.stroke(BACKQ[1]); ctx.stroke(BACKQ[2]);
    }
    [[54, 18, -20], [66, 30, 30], [20, 54, 70], [30, 68, 120]].forEach(function (p) {
      var a = p[2] * Math.PI / 180;
      ell(ctx, p[0], p[1], 7.5, 3.6, a); ctx.fillStyle = m; ctx.fill();
      ctx.beginPath(); ctx.moveTo(p[0] - 6 * Math.cos(a), p[1] - 6 * Math.sin(a)); ctx.lineTo(p[0] + 6 * Math.cos(a), p[1] + 6 * Math.sin(a));
      ctx.lineWidth = 1.2; ctx.strokeStyle = rgba(BACK.base, 0.8); ctx.stroke(); ctx.strokeStyle = m;
    });
    ctx.fillStyle = l;
    [[46, 40, 2.2], [40, 52, 1.6], [58, 46, 1.4], [76, 22, 1.8], [16, 80, 1.6]].forEach(function (p) {
      ctx.beginPath(); ctx.arc(p[0], p[1], p[2], 0, Math.PI * 2); ctx.fill();
    });
  }
  function paintBack(ctx, w, h) {
    ctx.save();
    ctx.scale(w / 156, h / 200);
    ctx.translate(-78, -100);
    rr(ctx, 2, 2, 152, 196, 18);
    var g = ctx.createRadialGradient(78, 90, 0, 78, 90, 0.62 * Math.hypot(156, 200) / Math.SQRT2);
    g.addColorStop(0, mix(BACK.base, BACK.mid, 0.35)); g.addColorStop(1, BACK.base);
    ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = BACK.line; ctx.stroke();
    rr(ctx, 7, 7, 142, 186, 14); ctx.lineWidth = 2; ctx.strokeStyle = mix(BACK.base, '#FFFFFF', 0.12); ctx.stroke();
    ctx.save();
    rr(ctx, 12, 12, 132, 176, 11); ctx.clip();
    [[1, 0, 0, 1, 0, 0], [-1, 0, 0, 1, 156, 0], [1, 0, 0, -1, 0, 200], [-1, 0, 0, -1, 156, 200]].forEach(function (m) {
      ctx.save(); ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]); backQuadrant(ctx); ctx.restore();
    });
    ell(ctx, 22, 100, 9, 4, Math.PI / 2); ctx.fillStyle = BACK.mid; ctx.fill();
    ell(ctx, 134, 100, 9, 4, Math.PI / 2); ctx.fill();
    ctx.restore();
    rr(ctx, 12, 12, 132, 176, 11); ctx.lineWidth = 2.5; ctx.strokeStyle = rgba(BACK.light, 0.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(78, 100, 31, 0, Math.PI * 2); ctx.fillStyle = BACK.medal; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = BACK.light; ctx.stroke();
    ctx.beginPath(); ctx.arc(78, 100, 25, 0, Math.PI * 2);
    if (ctx.setLineDash) ctx.setLineDash([2.5, 4]);
    ctx.lineWidth = 2; ctx.strokeStyle = BACK.mid; ctx.stroke();
    if (ctx.setLineDash) ctx.setLineDash([]);
    ctx.save(); ctx.translate(78, 102); drawAcorn(ctx, 30, { gold: true, lw: 2.6 }); ctx.restore();
    ctx.beginPath(); ctx.moveTo(16, 40); ctx.bezierCurveTo(18, 24, 26, 16, 42, 15);
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------- offscreen cache
  var cache = {}, cacheN = 0, CACHE_MAX = 120;
  function makeCanvas(wpx, hpx) {
    if (typeof document !== 'undefined' && document.createElement) {
      var c = document.createElement('canvas'); c.width = wpx; c.height = hpx; return c;
    }
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(wpx, hpx);
    return null;
  }
  // device scale from the Y axis of the current transform (a flip's scaleX must not change the bucket)
  function ctxScale(ctx) {
    try {
      if (ctx.getTransform) { var m = ctx.getTransform(); var s = Math.sqrt(m.c * m.c + m.d * m.d); if (s > 0) return s; }
    } catch (e) { /* ignore */ }
    return (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  }
  function faceSig(f) {
    if (!f) return 'none';
    return [f.kind, f.kind === 'animal' ? '' : f.value, f.color, f.shape, f.n, f.text, f.scale, parityOf(f), f.dots || f.show || f.as].join('|');
  }
  function cached(ctx, id, w, h, painter) {
    var dpr = Math.min(4, Math.max(1, Math.round(ctxScale(ctx) * 2) / 2));
    var W = Math.max(8, Math.round(w)), H = Math.max(8, Math.round(h));
    var key = id + '@' + W + 'x' + H + '@' + dpr, e = cache[key];
    if (!e) {
      var pad = 2, cv = makeCanvas(Math.ceil((W + 2 * pad) * dpr), Math.ceil((H + 2 * pad) * dpr));
      if (!cv) { painter(ctx, w, h); return; }
      var c = cv.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, (W / 2 + pad) * dpr, (H / 2 + pad) * dpr);
      painter(c, W, H);
      if (cacheN >= CACHE_MAX) { cache = {}; cacheN = 0; }
      e = cache[key] = { cv: cv, W: W, H: H, pad: pad };
      cacheN++;
    }
    var kx = w / e.W, ky = h / e.H;
    ctx.drawImage(e.cv, (-e.W / 2 - e.pad) * kx, (-e.H / 2 - e.pad) * ky, (e.W + 2 * e.pad) * kx, (e.H + 2 * e.pad) * ky);
  }

  // live glow: warm halo around the card outline (hint / selected)
  function drawCardGlow(ctx, w, h, glow, color) {
    glow = Math.max(0, Math.min(1, glow));
    if (glow < 0.01) return;
    var c = color || '#FFD95A', r = 0.12 * w;
    ctx.save();
    for (var i = 4; i >= 1; i--) {
      var e = i * 0.035 * w;
      rr(ctx, -w / 2 - e, -h / 2 - e, w + 2 * e, h + 2 * e, r + e);
      ctx.fillStyle = rgba(c, 0.16 * glow * (1.25 - i * 0.2)); ctx.fill();
    }
    rr(ctx, -w / 2 - 0.02 * w, -h / 2 - 0.02 * w, w + 0.04 * w, h + 0.04 * w, r + 0.02 * w);
    ctx.lineWidth = Math.max(2, 0.035 * w); ctx.strokeStyle = rgba(mix(c, '#FFFFFF', 0.4), 0.95 * glow); ctx.stroke();
    ctx.restore();
  }

  function begin(ctx, opt) {
    ctx.save();
    if (opt && opt.alpha != null && opt.alpha < 1) ctx.globalAlpha *= Math.max(0, opt.alpha);
    if (opt && opt.glow) drawCardGlow(ctx, opt._w, opt._h, opt.glow, opt.glowColor);
  }

  function drawBack(ctx, w, h, opt) {
    opt = opt || {}; opt._w = w; opt._h = h;
    begin(ctx, opt);
    var A = DM.Assets, spr = null;
    if (A && A.has && A.has('card_back') && A.sprite) {
      try { spr = A.sprite('card_back', Math.max(w, h) * ctxScale(ctx)); } catch (e) { spr = null; }
    }
    if (spr) ctx.drawImage(spr, -w / 2, -h / 2, w, h);
    else cached(ctx, 'back', w, h, paintBack);
    ctx.restore();
  }

  function drawFront(ctx, w, h, face, opt) {
    opt = opt || {}; opt._w = w; opt._h = h;
    face = face || { kind: 'number', value: '?' };
    begin(ctx, opt);
    cached(ctx, 'f:' + faceSig(face), w, h, function (c, W, H) { paintFace(c, W, H, face); });
    if (face.kind === 'animal' && typeof opt.sprite === 'function') {
      var A = animalBox(w, h, face.scale == null ? 1 : face.scale);   // the small one stands on the same ground line
      opt.sprite(face.sprite || face.value, 0, A.y, A.size);
    }
    ctx.restore();
  }

  // 3D flip helper: flip 0 = back … 1 = face; lift 0..1 raises the card a few px (shadow is the renderer's)
  function drawCard(ctx, w, h, face, flip, opt) {
    var f = Math.max(0, Math.min(1, flip || 0)), sx = Math.abs(Math.cos(Math.PI * f));
    if (sx < 0.02) return;
    ctx.save();
    var skew = Math.sin(Math.PI * f) * 0.06 * (f < 0.5 ? 1 : -1);
    ctx.transform(sx, skew, 0, 1, 0, 0);
    if (f > 0.5) drawFront(ctx, w, h, face, opt); else drawBack(ctx, w, h, opt);
    ctx.restore();
  }

  DM.CardArt = {
    COLORS: COLORS, SHAPES: SHAPES, CARD: CARD, BACK: BACK,
    drawBack: drawBack, drawFront: drawFront, drawCard: drawCard, drawCardGlow: drawCardGlow,
    drawButterfly: drawButterfly, drawLantern: drawLantern, lanternTop: lanternTop,
    drawAcorn: drawAcorn, drawStar: drawStar, traceShape: traceShape,
    DOT_LAYOUTS: DOTS,
    clearCache: function () { cache = {}; cacheN = 0; },
    _contrast: contrast, _faceSig: faceSig
  };
})(typeof window !== 'undefined' ? (window.DM = window.DM || {}) : (globalThis.DM = globalThis.DM || {}));
