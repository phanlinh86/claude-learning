/* Koko's Cake Tower — CK.BlockArt (character artist B), DESIGN §3 / §4.2.
 *
 *   drawBlock(ctx, block, LW, LH, opt)   a soft CAKE LAYER, origin = CENTRE, LW × LH px (layout.LW / layout.LH).
 *       opt = { glow 0..1, lift 0..1, dpr, id (drip seed), img(name) → Image|null, t, cache:false }
 *       Front view with a thin top face (top 16 % of LH, back corners inset), rounded corners r = 0.18·LH, a cream
 *       filling band, and frosting on top that drips over the front edge in 4–6 rounded drips (pattern from opt.id).
 *       color layers: frosting + sponge in the answer colour (outline dark). Others: vanilla sponge + white frosting
 *       with a decoration: shape (fondant) | dots (chocolate drops, dice / ten-frame layout 1–10) | number (+ dots
 *       when block.showDots) | animal (cookie sticker 'animal_<x>') | letter | text | size (small = block.scale or
 *       0.72 of both dims; an animal size layer is vanilla with the sticker) | parity (text or pairs icon).
 *       Backward compatible: drawBlock(ctx, block, S, opt) (4th arg not a number) → LW = round(1.3·S), LH = round(0.78·S).
 *       Static faces are cached per (key, LW, LH, dpr, seed) in lazily created offscreen canvases (node → drawn direct).
 *   drawCandle(ctx, h, lit 0..1, out 0..1, t)  striped birthday candle, origin = BASE; flame flickers with t; out → smoke
 *   drawFlame(ctx, size, lit, out, t)          just the flame + smoke, origin = wick top (for an SVG candle body)
 *   drawPlate(ctx, w, h)                       round cake board, origin = top-centre of its surface
 *   drawSprinkle(ctx, len, color, rot)         one rounded sprinkle rod (color = palette name or hex), origin = centre
 *   drawGhostHand(ctx, size, t)                friendly pointing hand, origin = fingertip, finger points UP
 *   drawGlow(ctx, w, h, t, strength)           golden pulsing halo around a w×h box centred at the origin
 *   COLORS = CK.PALETTE ;  faceRect(LW, LH), blockScale(b), layerSize(b, LW, LH), shapePath, clearCache()
 *   drawLeafPad = drawPlate, drawFlower (kept for older callers).
 */
(function (CK) {
  'use strict';

  var FALLBACK_PALETTE = {
    red:    { base: '#E84A4A', dark: '#A8282E', light: '#F7A0A0' },
    blue:   { base: '#3C8DE8', dark: '#1F5BA8', light: '#A6CCF5' },
    yellow: { base: '#FFD23F', dark: '#C99A12', light: '#FFEB9C' },
    green:  { base: '#4CC26B', dark: '#2A8343', light: '#A8E6B8' },
    orange: { base: '#FF9A2E', dark: '#C4650C', light: '#FFCB8E' },
    purple: { base: '#8E44AD', dark: '#6840A8', light: '#D2BDF3' },
    pink:   { base: '#FF8FC0', dark: '#C9558A', light: '#FFCCE2' }
  };
  function palette() { return CK.PALETTE || FALLBACK_PALETTE; }
  function pal(c) {
    var p = palette()[c] || FALLBACK_PALETTE[c];
    if (p) return p;
    if (typeof c === 'string' && c[0] === '#') return { base: c, dark: mix(c, '#000000', 0.35), light: mix(c, '#FFFFFF', 0.45) };
    return FALLBACK_PALETTE.orange;
  }

  // vanilla layer + white frosting (DESIGN §3)
  var VANILLA = { sponge: '#F6DFAE', top: '#FBEFD2', line: '#B98A4E' };
  var WHITE_FROST = { base: '#FFFDF7', shade: '#EFE6D8' };
  var CREAM = '#FFF5DE';                 // filling band
  var INK = '#5A3A22';                   // chocolate: drops, numerals, letters
  var ICING = '#FFFDF7';
  var FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", system-ui, sans-serif';
  var TOP = 0.16;                        // top face height (fraction of LH)
  var RAD = 0.18;                        // corner radius (fraction of LH)
  var SMALL = 0.72;
  var PI2 = Math.PI * 2;

  // ---------------------------------------------------------------- colour helpers
  function rgb(h) { h = h.replace('#', ''); return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; }
  function mix(a, b, t) {
    var A = rgb(a), B = rgb(b), o = '#';
    for (var i = 0; i < 3; i++) { var v = Math.round(A[i] + (B[i] - A[i]) * t); o += (v < 16 ? '0' : '') + v.toString(16); }
    return o.toUpperCase();
  }
  function rgba(h, a) { var c = rgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function hash(s) { s = String(s); var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rnd(seed) { var s = (seed >>> 0) || 1; return function () { s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x6D2B79F5) >>> 0; s = (s ^ (s >>> 13)) >>> 0; return (s % 100000) / 100000; }; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  // ---------------------------------------------------------------- geometry
  function lineW(LH) { return Math.max(2.5, LH * 0.05); }               // ≈ 5 px at LH 97
  function faceRect(LW, LH) {
    if (LH == null) { var S = LW; LW = Math.round(1.3 * S); LH = Math.round(0.78 * S); }
    var lw = lineW(LH); return { x: -LW / 2 + lw, y: -LH / 2 + TOP * LH, w: LW - 2 * lw, h: LH * (1 - TOP) - lw };
  }

  // silhouette: top face (back corners inset, soft) + front face with rounded bottom corners
  function bodyPath(ctx, w, h) {
    var hw = w / 2, hh = h / 2, yT = -hh + TOP * h, r = RAD * h, rt = 0.1 * h;
    ctx.beginPath();
    ctx.moveTo(-hw, yT + rt * 0.4);
    ctx.bezierCurveTo(-hw, -hh + rt * 0.2, -hw + 0.12 * w, -hh, -hw + 0.3 * w, -hh);       // soft frosted dome
    ctx.lineTo(hw - 0.3 * w, -hh);
    ctx.bezierCurveTo(hw - 0.12 * w, -hh, hw, -hh + rt * 0.2, hw, yT + rt * 0.4);
    ctx.lineTo(hw, hh - r);
    ctx.arcTo(hw, hh, hw - r, hh, r);
    ctx.lineTo(-hw + r, hh);
    ctx.arcTo(-hw, hh, -hw, hh - r, r);
    ctx.closePath();
  }

  function roundRect(ctx, x, y, w, h, r, keep) {
    r = Math.min(r, w / 2, h / 2);
    if (!keep) ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
  }

  // drip pattern for a seed: 4–6 drips, spaced across the front, lengths varied (fractions of LH)
  function dripsFor(seed, w, h, short) {
    var R = rnd(seed * 2654435761 + 7), n = 4 + Math.floor(R() * 3), out = [];
    var span = 0.86 * w, x0 = -span / 2, step = span / n;
    for (var i = 0; i < n; i++) {
      var dw = (0.09 + R() * 0.04) * w;
      dw = Math.min(dw, 0.24 * h + 6);
      var x = x0 + step * (i + 0.5) + (R() - 0.5) * step * 0.35;
      var len = short ? (0.09 + R() * 0.11) * h : (0.2 + R() * 0.2) * h;
      if (i % 2 === (seed & 1)) len *= short ? 0.75 : 0.62;                    // alternate long / short
      out.push({ x: x, dw: dw, len: Math.max(len, dw * 0.62) });
    }
    return out;
  }

  // frosting: everything above the band line yB plus the drips hanging from it (fill, clipped to the body)
  function frostPath(ctx, w, h, yB, drips) {
    var hw = w / 2 + 4, top = -h / 2 - 4, k;
    ctx.beginPath();
    ctx.moveTo(-hw, top); ctx.lineTo(hw, top); ctx.lineTo(hw, yB);
    for (var i = drips.length - 1; i >= 0; i--) {
      var d = drips[i], r = d.dw / 2, xr = d.x + r, xl = d.x - r, yb = yB + d.len - r;
      k = Math.min(r * 0.9, d.len * 0.35);
      ctx.lineTo(xr + k, yB);
      ctx.quadraticCurveTo(xr, yB, xr, yB + k);
      ctx.lineTo(xr, yb);
      ctx.arc(d.x, yb, r, 0, Math.PI, false);
      ctx.lineTo(xl, yB + k);
      ctx.quadraticCurveTo(xl, yB, xl - k, yB);
    }
    // a gentle wave between drips
    ctx.lineTo(-hw, yB);
    ctx.closePath();
  }
  function frostEdge(ctx, w, h, yB, drips) {          // only the visible lower edge (for the outline stroke)
    var hw = w / 2 + 4, k;
    ctx.beginPath(); ctx.moveTo(hw, yB);
    for (var i = drips.length - 1; i >= 0; i--) {
      var d = drips[i], r = d.dw / 2, xr = d.x + r, xl = d.x - r, yb = yB + d.len - r;
      k = Math.min(r * 0.9, d.len * 0.35);
      ctx.lineTo(xr + k, yB); ctx.quadraticCurveTo(xr, yB, xr, yB + k); ctx.lineTo(xr, yb);
      ctx.arc(d.x, yb, r, 0, Math.PI, false);
      ctx.lineTo(xl, yB + k); ctx.quadraticCurveTo(xl, yB, xl - k, yB);
    }
    ctx.lineTo(-hw, yB);
  }

  // ---------------------------------------------------------------- the cake layer
  function layerColors(b) {
    if (isColorBlock(b)) {
      var c = pal(b.color || b.value);
      return {
        colour: true, line: c.dark,
        sponge: mix(c.light, c.base, 0.22), spongeShade: mix(mix(c.light, c.base, 0.22), c.dark, 0.2),
        top: mix(c.base, '#FFFFFF', 0.28),
        frost: c.base, frostShade: mix(c.base, c.dark, 0.3), frostLine: c.dark,
        crumb: mix(c.light, c.dark, 0.25)
      };
    }
    return {
      colour: false, line: VANILLA.line,
      sponge: VANILLA.sponge, spongeShade: mix(VANILLA.sponge, VANILLA.line, 0.22),
      top: '#FFFFFF', frost: WHITE_FROST.base, frostShade: WHITE_FROST.shade, frostLine: mix(WHITE_FROST.shade, VANILLA.line, 0.55),
      crumb: mix(VANILLA.sponge, VANILLA.line, 0.3)
    };
  }

  function drawCake(ctx, w, h, C, seed, decorated) {
    var hw = w / 2, hh = h / 2, yT = -hh + TOP * h, lw = lineW(h);
    var yB = yT + (decorated ? 0.11 : 0.15) * h;                                  // frosting band bottom on the front
    var drips = dripsFor(seed, w, h, decorated);
    var R = rnd(seed + 99);
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // outline (fat stroke under the fill) + sponge
    bodyPath(ctx, w, h);
    ctx.lineWidth = lw * 2; ctx.strokeStyle = C.line; ctx.stroke();
    ctx.fillStyle = C.sponge; ctx.fill();
    ctx.clip();
    // sponge cel shade: right strip + bottom strip
    ctx.fillStyle = C.spongeShade;
    ctx.beginPath();
    ctx.moveTo(hw - 0.07 * w, yT); ctx.lineTo(hw + 4, yT); ctx.lineTo(hw + 4, hh + 4); ctx.lineTo(-hw - 4, hh + 4);
    ctx.lineTo(-hw - 4, hh - 0.11 * h); ctx.lineTo(hw - 0.07 * w, hh - 0.11 * h); ctx.closePath(); ctx.fill();
    // crumb pores
    ctx.fillStyle = rgba(C.crumb, 0.45);
    for (var i = 0; i < 16; i++) {
      var px = (R() - 0.5) * 0.9 * w, py = yB + 0.12 * h + R() * (hh - yB - 0.2 * h);
      ctx.beginPath(); ctx.ellipse(px, py, (0.012 + R() * 0.012) * h, (0.008 + R() * 0.008) * h, 0, 0, PI2); ctx.fill();
    }
    // cream filling band (wavy edges)
    var fy = decorated ? 0.3 * h : 0.27 * h, fh = 0.1 * h;
    ctx.beginPath();
    ctx.moveTo(-hw - 4, fy - fh / 2);
    for (var x = -hw; x <= hw + 4; x += w / 12) ctx.lineTo(x, fy - fh / 2 + Math.sin(x / w * 19 + seed) * 0.012 * h);
    for (x = hw + 4; x >= -hw - 4; x -= w / 12) ctx.lineTo(x, fy + fh / 2 + Math.sin(x / w * 23 + seed * 0.7) * 0.014 * h);
    ctx.closePath();
    ctx.fillStyle = CREAM; ctx.fill();
    ctx.lineWidth = Math.max(1, lw * 0.4); ctx.strokeStyle = rgba(C.line, 0.45); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.ellipse(-hw + 0.2 * w, fy - fh * 0.12, 0.08 * w, fh * 0.16, 0, 0, PI2); ctx.fill();
    // frosting (band + drips), its shade on the right, gloss upper-left
    ctx.save(); ctx.translate(0.008 * w, 0.035 * h);           // soft shadow the frosting casts on the sponge
    frostPath(ctx, w, h, yB, drips); ctx.fillStyle = rgba(C.line, 0.22); ctx.fill(); ctx.restore();
    frostPath(ctx, w, h, yB, drips);
    ctx.fillStyle = C.frost; ctx.fill();
    ctx.save(); frostPath(ctx, w, h, yB, drips); ctx.clip();
    ctx.fillStyle = C.frostShade;
    ctx.fillRect(hw - 0.06 * w, -hh - 4, 0.06 * w + 8, h);
    ctx.beginPath(); ctx.rect(-hw - 4, yB + 0.02 * h, w + 8, h); ctx.clip();
    for (i = 0; i < drips.length; i++) {                     // a shade on the right of each drip
      var d = drips[i];
      ctx.beginPath(); ctx.ellipse(d.x + d.dw * 0.28, yB + d.len - d.dw * 0.5, d.dw * 0.24, d.len * 0.55, 0, 0, PI2); ctx.fill();
    }
    ctx.restore();
    // top face (lighter frosting) and the rim line between top and front
    ctx.fillStyle = C.top;
    ctx.beginPath(); ctx.ellipse(0, -hh + TOP * h * 0.5, hw * 0.9, TOP * h * 0.5, 0, 0, PI2); ctx.fill();
    ctx.strokeStyle = rgba(C.frostLine, 0.5); ctx.lineWidth = Math.max(1, lw * 0.4);
    ctx.beginPath(); ctx.moveTo(-hw + 0.1 * w, yT + 0.005 * h); ctx.quadraticCurveTo(0, yT + 0.05 * h, hw - 0.1 * w, yT + 0.005 * h); ctx.stroke();
    // frosting lower edge outline
    frostEdge(ctx, w, h, yB, drips);
    ctx.lineWidth = lw * 0.75; ctx.strokeStyle = C.frostLine; ctx.stroke();
    // gloss: a streak on the band + a dot on each drip bulb
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.ellipse(-hw + 0.24 * w, yT + 0.05 * h, 0.13 * w, 0.022 * h, -0.03, 0, PI2); ctx.fill();
    for (i = 0; i < drips.length; i++) {
      d = drips[i];
      ctx.beginPath(); ctx.ellipse(d.x - d.dw * 0.18, yB + d.len - d.dw * 0.55, d.dw * 0.13, d.dw * 0.2, 0, 0, PI2); ctx.fill();
    }
    // sugar pearls on colour layers (white, neutral)
    if (C.colour) {
      var np = 3 + (seed % 3);
      for (i = 0; i < np; i++) {
        var qx = -hw * 0.75 + (i + 0.5) * (1.5 * hw / np) + (R() - 0.5) * 0.04 * w, qy = -hh + TOP * h * (0.35 + R() * 0.3);
        var pr = 0.032 * h;
        ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.beginPath(); ctx.arc(qx + pr * 0.25, qy + pr * 0.3, pr, 0, PI2); ctx.fill();
        ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(qx, qy, pr, 0, PI2); ctx.fill();
      }
    }
    // soft highlight on the sponge upper-left
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath(); ctx.ellipse(-hw + 0.1 * w, fy - 0.16 * h, 0.035 * w, 0.1 * h, 0, 0, PI2); ctx.fill();
    ctx.restore();
    // crisp outer outline on top
    ctx.save(); bodyPath(ctx, w, h); ctx.lineJoin = 'round'; ctx.lineWidth = lw; ctx.strokeStyle = C.line; ctx.stroke(); ctx.restore();
  }

  // ---------------------------------------------------------------- shapes (fondant)
  function shapePath(ctx, shape, r) {
    var i, a;
    ctx.beginPath();
    switch (shape) {
      case 'circle': ctx.arc(0, 0, r, 0, PI2); break;
      case 'square': roundRect(ctx, -r * 0.86, -r * 0.86, r * 1.72, r * 1.72, r * 0.16); break;
      case 'rect': roundRect(ctx, -r * 1.2, -r * 0.62, r * 2.4, r * 1.24, r * 0.14); break;
      case 'oval': ctx.ellipse(0, 0, r * 1.24, r * 0.72, 0, 0, PI2); break;
      case 'diamond':
        ctx.moveTo(0, -r * 1.08); ctx.lineTo(r * 0.78, 0); ctx.lineTo(0, r * 1.08); ctx.lineTo(-r * 0.78, 0); ctx.closePath(); break;
      case 'triangle':
        ctx.moveTo(0, -r * 1.02); ctx.lineTo(r * 1.06, r * 0.82); ctx.lineTo(-r * 1.06, r * 0.82); ctx.closePath(); break;
      case 'star':
        for (i = 0; i < 10; i++) {
          a = -Math.PI / 2 + i * Math.PI / 5;
          var rr = i % 2 ? r * 0.5 : r * 1.08;
          if (i) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr + r * 0.06); else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr + r * 0.06);
        }
        ctx.closePath(); break;
      case 'heart':
        ctx.moveTo(0, r * 1.0);
        ctx.bezierCurveTo(-r * 0.35, r * 0.68, -r * 1.12, r * 0.22, -r * 1.06, -r * 0.34);
        ctx.bezierCurveTo(-r * 1.0, -r * 0.92, -r * 0.24, -r * 1.06, 0, -r * 0.5);
        ctx.bezierCurveTo(r * 0.24, -r * 1.06, r * 1.0, -r * 0.92, r * 1.06, -r * 0.34);
        ctx.bezierCurveTo(r * 1.12, r * 0.22, r * 0.35, r * 0.68, 0, r * 1.0);
        ctx.closePath(); break;
      default: ctx.arc(0, 0, r, 0, PI2);
    }
  }

  function drawShape(ctx, shape, r, c, lw) {
    ctx.save();
    ctx.lineJoin = 'round';
    shapePath(ctx, shape, r);                                    // white icing halo so it pops off the sponge
    ctx.lineWidth = lw * 2.6; ctx.strokeStyle = ICING; ctx.stroke();
    ctx.lineWidth = lw; ctx.strokeStyle = c.dark; ctx.stroke();
    ctx.fillStyle = c.base; ctx.fill();
    ctx.clip();
    ctx.fillStyle = rgba(c.dark, 0.25);                          // cel shade lower-right
    ctx.beginPath(); ctx.ellipse(r * 0.55, r * 0.75, r * 1.3, r * 0.7, -0.5, 0, PI2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';                    // fondant highlight upper-left
    ctx.beginPath(); ctx.ellipse(-r * 0.38, -r * 0.42, r * 0.32, r * 0.15, -0.6, 0, PI2); ctx.fill();
    ctx.restore();
    ctx.save(); shapePath(ctx, shape, r); ctx.lineJoin = 'round'; ctx.lineWidth = lw * 0.55; ctx.strokeStyle = c.dark; ctx.stroke(); ctx.restore();
  }

  // ---------------------------------------------------------------- chocolate drops
  var DICE = {
    1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
    6: [[-1, -1], [0, -1], [1, -1], [-1, 1], [0, 1], [1, 1]]
  };
  function drop(ctx, x, y, r, col) {
    ctx.fillStyle = ICING; ctx.beginPath(); ctx.arc(x, y, r * 1.18, 0, PI2); ctx.fill();          // cream halo
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, PI2); ctx.fill();
    ctx.fillStyle = rgba(mix(col, '#000000', 0.3), 0.6); ctx.beginPath(); ctx.arc(x + r * 0.18, y + r * 0.22, r * 0.72, 0, PI2); ctx.fill();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x - r * 0.08, y - r * 0.1, r * 0.72, 0, PI2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.ellipse(x - r * 0.34, y - r * 0.36, r * 0.26, r * 0.18, -0.6, 0, PI2); ctx.fill();
  }
  // n 1–6: dice layout (6 = two rows of 3 — fits a wide layer); 7–10: ten-frame (5 on top, the rest below)
  function drawDrops(ctx, n, LH, cx, cy, col, scale) {
    n = Math.max(1, Math.min(10, n | 0)); scale = scale || 1;
    var i, r, d;
    if (n <= 6) {
      r = (n <= 3 ? 0.1 : n <= 5 ? 0.088 : 0.084) * LH * scale;
      var dx = (n === 6 ? 0.27 : 0.25) * LH * scale, dy = 0.2 * LH * scale;
      if (n === 6) dy = 0.13 * LH * scale;
      for (i = 0; i < DICE[n].length; i++) drop(ctx, cx + DICE[n][i][0] * dx, cy + DICE[n][i][1] * dy, r, col);
      return;
    }
    r = 0.08 * LH * scale; d = 0.235 * LH * scale;
    var dyy = 0.13 * LH * scale;
    for (i = 0; i < 5; i++) drop(ctx, cx + (i - 2) * d, cy - dyy, r, col);
    for (i = 0; i < n - 5; i++) drop(ctx, cx + (i - 2) * d, cy + dyy, r, col);
  }
  // small counting drops beside a numeral: rows of up to 5 (two rows from 6)
  function drawDotGrid(ctx, n, LH, cx, cy, col, maxW) {
    n = Math.max(0, Math.min(10, n | 0)); if (!n) return;
    var rows = n > 5 ? 2 : 1, cols = rows > 1 ? 5 : n;
    var gap = Math.min(0.24 * LH, maxW / Math.max(cols, 3)), r = Math.min(0.085 * LH, gap * 0.4);
    for (var k = 0; k < rows; k++) {
      var cnt = rows > 1 ? (k ? n - 5 : 5) : n, y = cy + (rows > 1 ? (k - 0.5) * Math.max(0.23 * LH, r * 3) : 0);
      for (var i = 0; i < cnt; i++) drop(ctx, cx + (i - (cols - 1) / 2) * gap, y, r, col);
    }
  }

  // ---------------------------------------------------------------- piped chocolate text
  function drawLabel(ctx, txt, cx, cy, maxH, maxW, col) {
    txt = String(txt);
    var fs = Math.round(maxH);
    ctx.font = 'bold ' + fs + 'px ' + FONT;
    var w = ctx.measureText ? ctx.measureText(txt).width : fs * txt.length * 0.6;
    if (w > maxW) { fs = Math.floor(fs * maxW / w); ctx.font = 'bold ' + fs + 'px ' + FONT; }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var y = cy + fs * 0.05;
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, fs * 0.17); ctx.strokeStyle = ICING; ctx.strokeText(txt, cx, y);     // cream piping edge
    ctx.lineWidth = Math.max(1.5, fs * 0.06); ctx.strokeStyle = col; ctx.strokeText(txt, cx, y);     // piped weight
    ctx.fillStyle = col; ctx.fillText(txt, cx, y);
    ctx.save();                                                                                      // glossy top edge
    ctx.globalAlpha = 0.28; ctx.fillStyle = '#FFFFFF'; ctx.fillText(txt, cx - fs * 0.025, y - fs * 0.04);
    ctx.globalAlpha = 1; ctx.fillStyle = col; ctx.fillText(txt, cx + fs * 0.01, y + fs * 0.01);
    ctx.restore();
  }

  // ---------------------------------------------------------------- animal sticker (or placeholder)
  function drawSticker(ctx, img, size, cx, cy) {
    if (img) { ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size); return; }
    var r = size * 0.4;
    ctx.save();
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(cx, cy, r + size * 0.06, 0, PI2); ctx.fill();
    ctx.fillStyle = '#D69A5A'; ctx.strokeStyle = '#8A5226'; ctx.lineWidth = size * 0.035;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, PI2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#3A2418';
    ctx.beginPath(); ctx.arc(cx - r * 0.36, cy - r * 0.12, r * 0.13, 0, PI2); ctx.arc(cx + r * 0.36, cy - r * 0.12, r * 0.13, 0, PI2); ctx.fill();
    ctx.strokeStyle = '#3A2418'; ctx.lineWidth = size * 0.03; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx, cy + r * 0.12, r * 0.3, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------- per kind
  function isColorBlock(b) { return b.kind === 'color' || (b.kind === 'size' && !b.animal); }
  function blockScale(b) {
    if (!b || b.kind !== 'size') return 1;
    if ((b.size || b.value) === 'big') return 1;
    if (typeof b.scale === 'number' && b.scale > 0 && b.scale < 1) return b.scale;
    return (b.size || b.value) === 'small' ? SMALL : 1;
  }
  function blockKey(b) {
    return [b.kind, b.value, b.color, b.shape, b.n, b.text, b.animal, b.size, b.showDots ? 1 : 0].join('|');
  }
  function decoCentre(LH) { return 0.12 * LH; }

  function paintBlock(ctx, b, LW, LH, seed, imgFn) {
    var C = layerColors(b), deco = !C.colour;
    drawCake(ctx, LW, LH, C, seed, deco);
    if (!deco) return;
    var cy = decoCentre(LH), lw = lineW(LH);
    var ink = b.color && b.kind !== 'shape' && b.kind !== 'size' && pal(b.color) ? pal(b.color).dark : INK;
    switch (b.kind) {
      case 'shape':
        ctx.save(); ctx.translate(0, cy);
        drawShape(ctx, b.shape || b.value, 0.29 * LH, pal(b.color || 'red'), lw * 1.15);
        ctx.restore();
        break;
      case 'dots':
        drawDrops(ctx, b.n != null ? b.n : +b.value, LH, 0, cy + 0.01 * LH, INK);
        break;
      case 'number':
        var num = b.text != null ? b.text : (b.n != null ? b.n : b.value), nn = b.n != null ? b.n : +b.value;
        if (b.showDots && nn > 0) {
          var fs = Math.round((String(num).length > 1 ? 0.5 : 0.62) * LH);
          ctx.font = 'bold ' + fs + 'px ' + FONT;
          var nw = Math.min(0.34 * LW, ctx.measureText ? ctx.measureText(String(num)).width : fs * 0.6 * String(num).length);
          var left = -LW / 2 + lw + 0.04 * LW, nx = left + nw / 2;
          drawLabel(ctx, num, nx, cy, fs, 0.34 * LW, ink);
          var a0 = left + nw + 0.05 * LW, a1 = LW / 2 - lw - 0.035 * LW;
          drawDotGrid(ctx, nn, LH, (a0 + a1) / 2, cy, ink, a1 - a0);
        } else drawLabel(ctx, num, 0, cy, 0.66 * LH, 0.8 * LW, ink);
        break;
      case 'letter':
        drawLabel(ctx, b.text != null ? b.text : b.value, 0, cy, 0.66 * LH, 0.8 * LW, ink);
        break;
      case 'animal':
      case 'size':
        var an = b.animal || b.value;
        drawSticker(ctx, imgFn ? imgFn('animal_' + an) : null, 0.86 * LH, 0, cy - 0.04 * LH);
        break;
      case 'text':
        var t = String(b.text != null ? b.text : b.value);
        drawLabel(ctx, t, 0, cy, (t.length > 6 ? 0.4 : t.length > 3 ? 0.5 : 0.62) * LH, 0.84 * LW, ink);
        break;
      case 'parity':
        if (b.text != null) { drawLabel(ctx, b.text, 0, cy, 0.5 * LH, 0.84 * LW, ink); break; }
        // pairs icon: even = 2 pairs, odd = 2 pairs + 1 alone
        var odd = (b.value === 'odd'), r = 0.075 * LH, g = 0.22 * LH, cols = odd ? 3 : 2, x0 = -(cols - 1) / 2 * 0.3 * LH;
        for (var p = 0; p < cols; p++) for (var q = 0; q < 2; q++) if (!(odd && p === 2 && q === 1)) drop(ctx, x0 + p * 0.3 * LH, cy + (q - 0.5) * g, r, INK);
        break;
      default: break;
    }
  }

  // ---------------------------------------------------------------- cache
  var cache = {}, cacheN = 0, MAX_CACHE = 200;
  function makeCanvas(w, h) {
    try {
      if (typeof document !== 'undefined' && document.createElement) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
      if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    } catch (e) { }
    return null;
  }
  function imgReady(img) { return img && (img.complete === undefined || img.complete) && (img.naturalWidth === undefined || img.naturalWidth > 0); }
  function needsImg(b) { return b.kind === 'animal' || (b.kind === 'size' && !!b.animal); }

  function faceCanvas(b, w, h, dpr, seed, imgFn) {
    var ni = needsImg(b), img = null;
    if (ni && imgFn) { img = imgFn('animal_' + (b.animal || b.value)); if (!imgReady(img)) img = null; }
    var key = blockKey(b) + '@' + Math.round(w * 10) + 'x' + Math.round(h * 10) + '@' + dpr + '#' + seed;
    var hit = cache[key];
    if (hit) return hit;
    var pad = Math.ceil(lineW(h) * 1.5 + 3), cw = w + 2 * pad, ch = h + 2 * pad;
    var cv = makeCanvas(Math.ceil(cw * dpr), Math.ceil(ch * dpr));
    if (!cv) return null;
    var g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, cw * dpr / 2, ch * dpr / 2);
    paintBlock(g, b, w, h, seed, function () { return img; });
    var entry = { canvas: cv, w: cw, h: ch };
    if (!(ni && !img)) {                                         // never cache a placeholder face: the image may arrive
      if (cacheN >= MAX_CACHE) { cache = {}; cacheN = 0; }
      cache[key] = entry; cacheN++;
    }
    return entry;
  }

  function seedOf(b, opt) {
    var id = opt && opt.id != null ? opt.id : (b.id != null ? b.id : blockKey(b));
    return (typeof id === 'number' ? (id | 0) : hash(id)) % 16;
  }

  /** Drawn size of a layer (after the small-size scale). */
  function layerSize(b, LW, LH) { var s = blockScale(b); return { w: Math.round(LW * s), h: Math.round(LH * s) }; }

  // ---------------------------------------------------------------- public
  function drawBlock(ctx, block, LW, LH, opt) {
    if (!block) return;
    if (typeof LH !== 'number') {                                // old API: drawBlock(ctx, block, S, opt)
      opt = LH; var S = LW; LW = Math.round(1.3 * S); LH = Math.round(0.78 * S);
    }
    opt = opt || {};
    var sc = blockScale(block), w = LW * sc, h = LH * sc;
    var glow = +opt.glow || 0, lift = +opt.lift || 0, seed = seedOf(block, opt);
    if (glow > 0.01) drawGlow(ctx, w, h, opt.t != null ? opt.t : nowSec(), glow);
    var dpr = opt.dpr || 1, entry = null;
    if (opt.cache !== false) entry = faceCanvas(block, w, h, dpr, seed, opt.img);
    if (entry) ctx.drawImage(entry.canvas, -entry.w / 2, -entry.h / 2, entry.w, entry.h);
    else paintBlock(ctx, block, w, h, seed, opt.img);
    if (lift > 0.01) {
      ctx.save(); bodyPath(ctx, w, h); ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,236,200,' + (0.14 * Math.min(1, lift)).toFixed(3) + ')';
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.restore();
    }
  }
  function nowSec() { return (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) / 1000; }

  function drawGlow(ctx, w, h, t, strength) {
    strength = clamp01(strength == null ? 1 : strength);
    if (!strength) return;
    var wave = Math.sin((t || 0) * 5.5), pulse = 0.85 + 0.15 * wave;
    var m = Math.min(w, h), R = m * (0.3 + 0.03 * wave), cr = m * RAD;
    ctx.save();
    ctx.beginPath(); ctx.rect(-w - 4 * R, -h - 4 * R, 2 * w + 8 * R, 2 * h + 8 * R);
    roundRect(ctx, -w / 2 + 1, -h / 2 + 1, w - 2, h - 2, cr, true); ctx.clip('evenodd');
    for (var i = 5; i >= 1; i--) {
      var e = R * i / 5, a = strength * pulse * 0.22 * (1 - (i - 1) / 5);
      roundRect(ctx, -w / 2 - e, -h / 2 - e, w + 2 * e, h + 2 * e, cr + e);
      ctx.fillStyle = 'rgba(255,214,80,' + a.toFixed(3) + ')'; ctx.fill();
    }
    roundRect(ctx, -w / 2 - m * 0.05, -h / 2 - m * 0.05, w + m * 0.1, h + m * 0.1, cr + m * 0.05);
    ctx.lineWidth = m * 0.05; ctx.strokeStyle = 'rgba(255,226,110,' + (0.95 * strength * pulse).toFixed(3) + ')'; ctx.stroke();
    ctx.lineWidth = m * 0.018; ctx.strokeStyle = 'rgba(255,255,235,' + (0.9 * strength).toFixed(3) + ')'; ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------- candle
  var CANDLE = { body: '#FFF8EC', stripe: '#9ED8CB', stripe2: '#F6B6CF', line: '#C9B79A' };
  function drawFlame(ctx, size, lit, out, t) {
    lit = clamp01(lit == null ? 1 : lit); out = clamp01(out || 0); t = t || 0;
    var s = size, fl = lit * clamp01(1 - out * 3.5);                  // the flame is gone at out ≈ 0.29
    ctx.save();
    if (fl > 0.01) {
      var fy = 1 + 0.09 * Math.sin(t * 17) + 0.05 * Math.sin(t * 31 + 1), sway = 0.08 * Math.sin(t * 11) + 0.04 * Math.sin(t * 23);
      var fh = s * fy * fl, fw = s * 0.5 * (0.6 + 0.4 * fl);
      // warm glow
      var gr = s * 1.1 * fl;
      if (ctx.createRadialGradient) {
        var grd = ctx.createRadialGradient(0, -fh * 0.45, 0, 0, -fh * 0.45, gr);
        grd.addColorStop(0, 'rgba(255,214,120,' + (0.45 * fl).toFixed(3) + ')'); grd.addColorStop(1, 'rgba(255,214,120,0)');
        ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(0, -fh * 0.45, gr, 0, PI2); ctx.fill();
      }
      function tear(k) {
        var hh = fh * k, ww = fw * k;
        ctx.beginPath();
        ctx.moveTo(sway * s * k * 1.6, -hh);
        ctx.bezierCurveTo(ww * 0.25 + sway * s, -hh * 0.6, ww * 0.62, -hh * 0.22, ww * 0.5, -hh * 0.02);
        ctx.arc(0, -hh * 0.02 - 0 , ww * 0.5, 0, Math.PI, false);
        ctx.bezierCurveTo(-ww * 0.62, -hh * 0.22, -ww * 0.25 + sway * s, -hh * 0.6, sway * s * k * 1.6, -hh);
        ctx.closePath();
      }
      ctx.translate(0, -s * 0.04);
      tear(1); ctx.fillStyle = '#FF9A3C'; ctx.fill(); ctx.lineWidth = Math.max(1, s * 0.05); ctx.strokeStyle = '#E8742A'; ctx.stroke();
      tear(0.72); ctx.fillStyle = '#FFD45E'; ctx.fill();
      tear(0.4); ctx.fillStyle = '#FFF8D8'; ctx.fill();
      ctx.translate(0, s * 0.04);
    }
    // wick
    ctx.strokeStyle = '#4A3A30'; ctx.lineWidth = Math.max(1, s * 0.08); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, s * 0.12); ctx.lineTo(0, -s * 0.06); ctx.stroke();
    // smoke puffs + a curl when blown out
    if (out > 0.02) {
      var p = out;
      for (var i = 0; i < 3; i++) {
        var k = clamp01(p * 1.3 - i * 0.15); if (k <= 0) continue;
        var a = (1 - k) * 0.85, y = -s * (0.4 + k * 2.2 + i * 0.25), x = Math.sin(k * 5 + i * 2) * s * 0.35, r = s * (0.18 + k * 0.4);
        ctx.fillStyle = 'rgba(176,170,186,' + a.toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(x, y, r, 0, PI2); ctx.arc(x + r * 0.7, y + r * 0.2, r * 0.7, 0, PI2); ctx.arc(x - r * 0.6, y + r * 0.3, r * 0.6, 0, PI2); ctx.fill();
      }
      var ca = clamp01(1 - p) * 0.8;
      if (ca > 0.02) {
        ctx.strokeStyle = 'rgba(160,156,170,' + ca.toFixed(3) + ')'; ctx.lineWidth = Math.max(1, s * 0.07);
        ctx.beginPath(); ctx.moveTo(0, -s * 0.05);
        ctx.bezierCurveTo(s * 0.3, -s * 0.4, -s * 0.3, -s * 0.7, s * 0.05, -s * (0.9 + p * 0.6)); ctx.stroke();
      }
    }
    ctx.restore();
  }
  function drawCandle(ctx, h, lit, out, t) {
    var w = Math.max(6, h * 0.24), r = w / 2, lw = Math.max(1, w * 0.12);
    ctx.save();
    ctx.lineJoin = 'round';
    roundRect(ctx, -r, -h, w, h, r * 0.45);
    ctx.lineWidth = lw * 2; ctx.strokeStyle = CANDLE.line; ctx.stroke();
    ctx.fillStyle = CANDLE.body; ctx.fill();
    ctx.save(); roundRect(ctx, -r, -h, w, h, r * 0.45); ctx.clip();
    for (var y = -h - w, i = 0; y < w; y += w * 0.9, i++) {         // diagonal stripes
      ctx.fillStyle = i % 2 ? CANDLE.stripe2 : CANDLE.stripe;
      ctx.beginPath(); ctx.moveTo(-r - 1, y + w * 0.6); ctx.lineTo(r + 1, y); ctx.lineTo(r + 1, y + w * 0.4); ctx.lineTo(-r - 1, y + w); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(r * 0.35, -h, r, h);
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(-r * 0.6, -h + w * 0.3, r * 0.3, h - w * 0.6);
    ctx.restore();
    ctx.translate(0, -h);
    drawFlame(ctx, Math.max(8, w * 1.5), lit, out, t);
    ctx.restore();
  }

  // ---------------------------------------------------------------- plate (round cake board)
  function drawPlate(ctx, w, h) {
    var hw = w / 2, ry = h * 0.34, th = h * 0.38, lw = Math.max(2, h * 0.07);
    var TOPC = '#FFF8EC', RIM = '#F1E6D2', TRIM = '#BFE3D6', LINE = '#C9B79A';
    ctx.save(); ctx.lineJoin = 'round';
    ctx.fillStyle = 'rgba(80,50,30,0.14)';                                          // soft shadow
    ctx.beginPath(); ctx.ellipse(0, th + ry * 0.6, hw * 0.96, ry * 0.7, 0, 0, PI2); ctx.fill();
    // rim (thickness)
    ctx.beginPath();
    ctx.moveTo(-hw, 0); ctx.lineTo(-hw, th); ctx.ellipse(0, th, hw, ry, 0, Math.PI, 0, true); ctx.lineTo(hw, 0); ctx.closePath();
    ctx.fillStyle = RIM; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = LINE; ctx.stroke();
    // mint trim band on the rim
    ctx.save(); ctx.clip();
    ctx.strokeStyle = TRIM; ctx.lineWidth = th * 0.36;
    ctx.beginPath(); ctx.ellipse(0, th * 0.55, hw, ry, 0, 0, Math.PI); ctx.stroke();
    ctx.restore();
    // top surface + lace scallops
    ctx.beginPath(); ctx.ellipse(0, 0, hw, ry, 0, 0, PI2);
    ctx.fillStyle = TOPC; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = LINE; ctx.stroke();
    ctx.strokeStyle = rgba(TRIM, 0.95); ctx.lineWidth = Math.max(1.5, lw * 0.7);
    ctx.beginPath(); ctx.ellipse(0, 0, hw * 0.86, ry * 0.72, 0, 0, PI2); ctx.stroke();
    ctx.fillStyle = TRIM;
    for (var i = 0; i < 18; i++) {
      var a = i / 18 * PI2; ctx.beginPath(); ctx.arc(Math.cos(a) * hw * 0.93, Math.sin(a) * ry * 0.82, Math.max(1.2, h * 0.04), 0, PI2); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.ellipse(-hw * 0.45, -ry * 0.4, hw * 0.22, ry * 0.16, -0.1, 0, PI2); ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------- sprinkle
  function drawSprinkle(ctx, len, color, rot) {
    var c = color && color[0] === '#' ? { base: color, dark: mix(color, '#000000', 0.25) } : pal(color || 'pink');
    var w = Math.max(2, len * 0.32);
    ctx.save(); ctx.rotate(rot || 0);
    roundRect(ctx, -len / 2, -w / 2, len, w, w / 2);
    ctx.fillStyle = c.base; ctx.fill();
    ctx.lineWidth = Math.max(0.8, w * 0.16); ctx.strokeStyle = c.dark; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    roundRect(ctx, -len / 2 + w * 0.4, -w * 0.32, len - w * 0.8, w * 0.22, w * 0.11); ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------- ghost hand
  function drawGhostHand(ctx, size, t) {
    var s = size, F = '#FFF4E4', L = '#B9835A', SH = '#F1D6B8';
    t = t || 0;
    var press = 0.5 + 0.5 * Math.sin(t * 6);
    ctx.save();
    var ph = (t * 1.4) % 1;
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.8 * (1 - ph)).toFixed(3) + ')'; ctx.lineWidth = s * 0.035;
    ctx.beginPath(); ctx.arc(0, 0, s * (0.08 + 0.22 * ph), 0, PI2); ctx.stroke();
    ctx.translate(0, s * 0.03 * press);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    function rr(x, y, w, h, r) {
      ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
      ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
      ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
    }
    function hand() {
      ctx.beginPath();
      rr(-s * 0.085, 0, s * 0.17, s * 0.52, s * 0.085);
      rr(-s * 0.26, s * 0.36, s * 0.47, s * 0.42, s * 0.14);
      ctx.moveTo(-s * 0.2, s * 0.5);
      ctx.ellipse(-s * 0.27, s * 0.46, s * 0.07, s * 0.15, -0.6, 0, PI2);
    }
    ctx.globalAlpha *= 0.94;
    hand(); ctx.lineWidth = s * 0.07; ctx.strokeStyle = L; ctx.stroke();
    hand(); ctx.fillStyle = F; ctx.fill();
    ctx.strokeStyle = SH; ctx.lineWidth = s * 0.03;
    ctx.beginPath(); ctx.moveTo(0, s * 0.5); ctx.lineTo(s * 0.18, s * 0.5); ctx.moveTo(0, s * 0.62); ctx.lineTo(s * 0.18, s * 0.62); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.ellipse(-s * 0.03, s * 0.12, s * 0.025, s * 0.07, 0, 0, PI2); ctx.fill();
    ctx.fillStyle = '#9ED8CB'; ctx.strokeStyle = '#5FA597'; ctx.lineWidth = s * 0.04;          // Koko's mint cuff
    ctx.beginPath(); rr(-s * 0.24, s * 0.76, s * 0.44, s * 0.14, s * 0.05); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------- legacy: a small candy flower (older render code)
  var FLOWER = {
    coral: { petal: '#F6B6CF', line: '#C9789A', mid: '#FFF1B8' },
    cream: { petal: '#FFF4DC', line: '#C9B48A', mid: '#F6C27A' },
    lilac: { petal: '#DCCDF3', line: '#9C88C2', mid: '#FFF1B8' }
  };
  function drawFlower(ctx, size, t, hue) {
    var key = typeof hue === 'number' ? ['coral', 'cream', 'lilac'][((hue % 3) + 3) % 3] : hue;
    var c = FLOWER[key] || FLOWER.coral;
    t = clamp01(t == null ? 1 : t);
    if (t <= 0) return;
    var k = 1.70158, u = t - 1, e = 1 + (k + 1) * u * u * u + k * u * u;
    var r = size * 0.5 * Math.max(0, e);
    ctx.save(); ctx.rotate((1 - t) * 0.9);
    ctx.lineWidth = Math.max(1, size * 0.045); ctx.strokeStyle = c.line;
    for (var pass = 0; pass < 2; pass++) for (var i = 0; i < 5; i++) {
      ctx.save(); ctx.rotate(i * PI2 / 5 - Math.PI / 2);
      ctx.beginPath(); ctx.ellipse(r * 0.52, 0, r * 0.48, r * 0.3, 0, 0, PI2);
      if (pass === 0) ctx.stroke(); else { ctx.fillStyle = c.petal; ctx.fill(); }
      ctx.restore();
    }
    ctx.fillStyle = c.mid; ctx.beginPath(); ctx.arc(0, 0, r * 0.24, 0, PI2); ctx.fill();
    ctx.restore();
  }

  CK.BlockArt = {
    drawBlock: drawBlock, drawGhostHand: drawGhostHand, drawCandle: drawCandle, drawFlame: drawFlame, drawPlate: drawPlate,
    drawSprinkle: drawSprinkle, drawGlow: drawGlow,
    drawLeafPad: drawPlate, drawFlower: drawFlower,
    get COLORS() { return palette(); },
    faceRect: faceRect, blockScale: blockScale, layerSize: layerSize, shapePath: shapePath, bodyPath: bodyPath,
    clearCache: function () { cache = {}; cacheN = 0; },
    VANILLA: VANILLA, INK: INK, FONT: FONT, SMALL: SMALL, TOP: TOP, _mix: mix
  };
})(typeof window !== 'undefined' ? (window.CK = window.CK || {}) : (globalThis.CK = globalThis.CK || {}));
