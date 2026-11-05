/* Bop's Rainy Band — RB.BandArt (character artist B), DESIGN §3 / §4.2.
 *
 *   drawMember(ctx, item, S, opt)    origin = member CENTRE, S = bounding square (px).
 *       opt = { glow 0..1, hit 0..1 (just tapped: skin ripple + small brightness), dpr, img(name) → Image|canvas|null,
 *               sing (bool, animals), t (s, for the glow pulse; default performance.now) }
 *       Every member RESTS ON THE SAME LINE: its visual bottom is at y = +S/2 (the top of its stool seat, see METRICS).
 *       kinds: color | shape | dots | number (+showDots) | letter | text | size (big = 1, small = 0.68 × S, scaled about
 *       the bottom point so it still sits on the stool) | animal (sticker 'animal_<x>' / 'animal_<x>_sing').
 *       Drums are side-view cylinders: cream skin ellipse on top, two rims, a zig-zag tension cord.
 *       Colour drums: the shell in the answer colour. Other drums: natural wood shell with a painted label (the face).
 *       Static drum faces are cached per (key, S, dpr) in lazily created offscreen canvases (node: drawn directly).
 *   drawStool(ctx, w, h)             flower-pot stool; origin = top-centre of its seat; spans y 0..h, width w.
 *   drawBigDrum(ctx, r, opt)         Bop's bass drum, origin = drum centre, 2r wide, 1.5r tall (y −0.75r … +0.75r).
 *                                    opt { hit 0..1, glow 0..1, t }
 *   drawNote(ctx, size, color, opt)  eighth note, origin = note-head centre; size = the slot radius (noteR).
 *                                    opt { empty: true } → the empty dashed cream ring of the song sheet; opt.pop 0..1
 *   drawSheet(ctx, x0, x1, y, n, season)  the song-sheet vine-line between x0 and x1 at y (season name or 0..3)
 *   drawNumberCard(ctx, w, h, n, lit)     counting card, origin = card CENTRE: numeral n + n dots, `lit` glowing
 *   drawGhostHand(ctx, size, t)      friendly pointing hand, origin = fingertip, finger points UP; t = time (s)
 *   drawGlow(ctx, w, h, t, strength) soft golden halo around a w×h ellipse centred at the origin
 *   COLORS                           = RB.PALETTE || the DESIGN §3 palette
 *   METRICS(S)                       geometry of a drum at size S (see below), memberBox(item, S), shapePath, clearCache
 */
(function (RB) {
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
  function palette() { return RB.PALETTE || FALLBACK_PALETTE; }
  function pal(c) {
    var p = palette()[c] || FALLBACK_PALETTE[c];
    if (p) return p;
    if (typeof c === 'string' && c[0] === '#' && c.length === 7) return { base: c, dark: mix(c, '#000000', 0.35), light: mix(c, '#FFFFFF', 0.45) };
    return FALLBACK_PALETTE.orange;
  }

  var WOOD = { base: '#E7C590', dark: '#8E5F33', light: '#F5DFB6', line: '#7E5530' };
  var SKIN = '#FFF6E4', SKIN_SH = '#EEDCBC', CORD = '#FFF6E4';
  var LABEL = '#FBEBCB';
  var INK = '#5A3A22';
  var FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", system-ui, sans-serif';

  // ---------------------------------------------------------------- colour helpers
  function rgb(h) { h = h.replace('#', ''); return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; }
  function mix(a, b, t) {
    var A = rgb(a), B = rgb(b), o = '#';
    for (var i = 0; i < 3; i++) { var v = Math.round(A[i] + (B[i] - A[i]) * t); o += (v < 16 ? '0' : '') + v.toString(16); }
    return o.toUpperCase();
  }
  function rgba(h, a) { var c = rgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (+a).toFixed(3) + ')'; }
  function clamp01(v) { v = +v || 0; return v < 0 ? 0 : v > 1 ? 1 : v; }
  function nowSec() { return (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) / 1000; }

  // ---------------------------------------------------------------- drum geometry (fractions of S, origin = member centre)
  //   skin (top) ellipse centre yT, bottom ellipse centre yB, both radii rx × ry; rims rimH tall.
  //   visual top    = yT − ry = −0.38 S      visual bottom = yB + ry = +0.50 S  (= the stool seat line)
  //   painted label centred at (0, faceY) — the front of the shell between the rims.
  function METRICS(S) {
    var rx = 0.42 * S, ry = 0.12 * S, yT = -0.26 * S, yB = 0.38 * S, rimH = 0.065 * S;
    return { rx: rx, ry: ry, yT: yT, yB: yB, rimH: rimH, top: yT - ry, bottom: yB + ry,
      faceY: 0.185 * S, faceW: 0.68 * S, faceH: 0.42 * S, lw: lineW(S) };
  }
  function lineW(S) { return Math.max(2, S * 0.026); }      // ≈ 4 px at S = 150

  // closed outline of the whole drum (shell + top ellipse)
  function drumPath(ctx, m) {
    ctx.beginPath();
    ctx.moveTo(-m.rx, m.yT);
    ctx.lineTo(-m.rx, m.yB);
    ctx.ellipse(0, m.yB, m.rx, m.ry, 0, Math.PI, 0, true);
    ctx.lineTo(m.rx, m.yT);
    ctx.ellipse(0, m.yT, m.rx, m.ry, 0, 0, Math.PI, true);   // back (upper) half of the top ellipse
    ctx.closePath();
  }
  // a band of the shell between y0 and y1 (both measured at the sides), following the cylinder front
  function bandPath(ctx, m, y0, y1) {
    ctx.beginPath();
    ctx.moveTo(-m.rx, y0);
    ctx.lineTo(-m.rx, y1);
    ctx.ellipse(0, y1, m.rx, m.ry, 0, Math.PI, 0, true);
    ctx.lineTo(m.rx, y0);
    ctx.ellipse(0, y0, m.rx, m.ry, 0, 0, Math.PI, false);
    ctx.closePath();
  }

  function roundRect(ctx, x, y, w, h, r, keep) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    if (!keep) ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
  }

  // c = { base, dark, light, line? }
  function paintDrum(ctx, S, c, label) {
    var m = METRICS(S), lw = m.lw, line = c.line || mix(c.dark, '#000000', 0.18);
    var shade = mix(c.base, c.dark, 0.38);
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // soft contact shadow on the seat
    ctx.fillStyle = 'rgba(40,30,20,0.18)';
    ctx.beginPath(); ctx.ellipse(0, m.bottom - S * 0.01, m.rx * 0.78, S * 0.03, 0, 0, Math.PI * 2); ctx.fill();
    // fat outline + shell
    drumPath(ctx, m);
    ctx.lineWidth = lw * 2; ctx.strokeStyle = line; ctx.stroke();
    ctx.fillStyle = c.base; ctx.fill();
    ctx.save();
    drumPath(ctx, m); ctx.clip();
    // cel shade: right third of the cylinder (one step), and a light strip at the left
    ctx.fillStyle = shade;
    ctx.beginPath(); ctx.ellipse(m.rx * 1.18, (m.yT + m.yB) / 2, m.rx * 0.62, S * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = rgba(c.light, 0.75);
    roundRect(ctx, -m.rx * 0.78, m.yT, m.rx * 0.13, m.yB - m.yT + m.ry, m.rx * 0.06); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    roundRect(ctx, -m.rx * 0.6, m.yT, m.rx * 0.05, m.yB - m.yT + m.ry * 0.6, m.rx * 0.025); ctx.fill();
    // wood grain on wooden shells
    if (c.grain) {
      ctx.strokeStyle = rgba(c.dark, 0.28); ctx.lineWidth = Math.max(1, S * 0.008);
      for (var g = 0; g < 5; g++) {
        var gx = -m.rx * 0.9 + g * m.rx * 0.42 + (g % 2) * m.rx * 0.1;
        ctx.beginPath(); ctx.moveTo(gx, m.yT); ctx.bezierCurveTo(gx + S * 0.02, m.yT + S * 0.2, gx - S * 0.02, m.yB - S * 0.1, gx + S * 0.01, m.yB + m.ry); ctx.stroke();
      }
    }
    // zig-zag tension cord between the rims (front half of the cylinder)
    var up = m.yT + m.rimH * 1.05, dn = m.yB - m.rimH * 1.05, N = 8, pts = [];
    for (var i = 0; i <= N; i++) {
      var th = Math.PI - (i / N) * Math.PI, x = m.rx * Math.cos(th) * 0.995, dy = m.ry * Math.sin(th);
      pts.push([x, (i % 2 ? dn : up) + dy]);
    }
    ctx.beginPath();
    for (i = 0; i < pts.length; i++) { if (i) ctx.lineTo(pts[i][0], pts[i][1]); else ctx.moveTo(pts[i][0], pts[i][1]); }
    ctx.lineWidth = S * 0.032; ctx.strokeStyle = rgba(line, 0.85); ctx.stroke();
    ctx.lineWidth = S * 0.017; ctx.strokeStyle = CORD; ctx.stroke();
    ctx.restore();
    // rims (bottom, then top band)
    var rim = c.rim || c.dark, rimL = mix(rim, '#FFFFFF', 0.35);
    bandPath(ctx, m, m.yB - m.rimH, m.yB);
    ctx.fillStyle = rim; ctx.fill(); ctx.lineWidth = lw * 0.7; ctx.strokeStyle = line; ctx.stroke();
    ctx.save(); bandPath(ctx, m, m.yB - m.rimH, m.yB); ctx.clip();
    ctx.beginPath(); ctx.ellipse(0, m.yB - m.rimH * 0.55, m.rx * 0.9, m.ry, 0, Math.PI * 0.62, Math.PI * 0.9);
    ctx.lineWidth = S * 0.012; ctx.strokeStyle = rgba(rimL, 0.9); ctx.stroke(); ctx.restore();
    bandPath(ctx, m, m.yT, m.yT + m.rimH);
    ctx.fillStyle = rim; ctx.fill(); ctx.lineWidth = lw * 0.7; ctx.strokeStyle = line; ctx.stroke();
    ctx.save(); bandPath(ctx, m, m.yT, m.yT + m.rimH); ctx.clip();
    ctx.beginPath(); ctx.ellipse(0, m.yT + m.rimH * 0.45, m.rx * 0.9, m.ry, 0, Math.PI * 0.62, Math.PI * 0.9);
    ctx.lineWidth = S * 0.012; ctx.strokeStyle = rgba(rimL, 0.9); ctx.stroke(); ctx.restore();
    // top: rim ring + cream skin
    ctx.beginPath(); ctx.ellipse(0, m.yT, m.rx, m.ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = rim; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = line; ctx.stroke();
    skinPath(ctx, m);
    ctx.fillStyle = SKIN; ctx.fill();
    ctx.save(); skinPath(ctx, m); ctx.clip();
    ctx.fillStyle = SKIN_SH;
    ctx.beginPath(); ctx.ellipse(m.rx * 0.2, m.yT + m.ry * 0.5, m.rx * 0.9, m.ry * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.ellipse(-m.rx * 0.38, m.yT - m.ry * 0.25, m.rx * 0.22, m.ry * 0.2, -0.12, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    skinPath(ctx, m); ctx.lineWidth = lw * 0.6; ctx.strokeStyle = rgba(line, 0.75); ctx.stroke();
    // crisp outer silhouette
    drumPath(ctx, m); ctx.lineWidth = lw; ctx.strokeStyle = line; ctx.stroke();
    // painted label on the shell (wood drums)
    if (label) {
      roundRect(ctx, -m.faceW / 2, m.faceY - m.faceH / 2, m.faceW, m.faceH, S * 0.08);
      ctx.fillStyle = LABEL; ctx.fill();
      ctx.lineWidth = lw * 0.8; ctx.strokeStyle = rgba(c.dark, 0.9); ctx.stroke();
      ctx.save(); roundRect(ctx, -m.faceW / 2, m.faceY - m.faceH / 2, m.faceW, m.faceH, S * 0.08); ctx.clip();
      ctx.fillStyle = rgba('#E8CFA0', 0.55);
      ctx.beginPath(); ctx.ellipse(m.faceW * 0.55, m.faceY + m.faceH * 0.5, m.faceW * 0.45, m.faceH * 0.45, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    return m;
  }
  function skinPath(ctx, m) { ctx.beginPath(); ctx.ellipse(0, m.yT, m.rx * 0.88, m.ry * 0.74, 0, 0, Math.PI * 2); }

  // ---------------------------------------------------------------- shapes
  function shapePath(ctx, shape, r) {
    var i, a;
    ctx.beginPath();
    switch (shape) {
      case 'circle': ctx.arc(0, 0, r, 0, Math.PI * 2); break;
      case 'square': roundRect(ctx, -r * 0.86, -r * 0.86, r * 1.72, r * 1.72, r * 0.16, true); break;
      case 'rect': roundRect(ctx, -r * 1.2, -r * 0.6, r * 2.4, r * 1.2, r * 0.14, true); break;
      case 'oval': ctx.ellipse(0, 0, r * 1.22, r * 0.7, 0, 0, Math.PI * 2); break;
      case 'diamond':
        ctx.moveTo(0, -r * 1.08); ctx.lineTo(r * 0.8, 0); ctx.lineTo(0, r * 1.08); ctx.lineTo(-r * 0.8, 0); ctx.closePath(); break;
      case 'triangle':
        ctx.moveTo(0, -r * 1.0); ctx.lineTo(r * 1.08, r * 0.84); ctx.lineTo(-r * 1.08, r * 0.84); ctx.closePath(); break;
      case 'star':
        for (i = 0; i < 10; i++) {
          a = -Math.PI / 2 + i * Math.PI / 5;
          var rr = i % 2 ? r * 0.5 : r * 1.1;
          if (i) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr + r * 0.08); else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr + r * 0.08);
        }
        ctx.closePath(); break;
      case 'heart':
        ctx.moveTo(0, r * 1.0);
        ctx.bezierCurveTo(-r * 0.35, r * 0.68, -r * 1.12, r * 0.22, -r * 1.06, -r * 0.34);
        ctx.bezierCurveTo(-r * 1.0, -r * 0.92, -r * 0.24, -r * 1.06, 0, -r * 0.5);
        ctx.bezierCurveTo(r * 0.24, -r * 1.06, r * 1.0, -r * 0.92, r * 1.06, -r * 0.34);
        ctx.bezierCurveTo(r * 1.12, r * 0.22, r * 0.35, r * 0.68, 0, r * 1.0);
        ctx.closePath(); break;
      default: ctx.arc(0, 0, r, 0, Math.PI * 2);
    }
  }
  function drawShape(ctx, shape, r, c, lw) {
    ctx.save();
    ctx.lineJoin = 'round';
    shapePath(ctx, shape, r);
    ctx.lineWidth = lw * 2; ctx.strokeStyle = c.dark; ctx.stroke();
    ctx.fillStyle = c.base; ctx.fill();
    ctx.clip();
    ctx.fillStyle = rgba(c.dark, 0.25);
    ctx.beginPath(); ctx.ellipse(r * 0.6, r * 0.75, r * 1.2, r * 0.7, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.42)';
    ctx.beginPath(); ctx.ellipse(-r * 0.36, -r * 0.4, r * 0.32, r * 0.15, -0.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.save(); shapePath(ctx, shape, r); ctx.lineJoin = 'round'; ctx.lineWidth = lw; ctx.strokeStyle = c.dark; ctx.stroke(); ctx.restore();
  }

  // ---------------------------------------------------------------- dice dots
  var DICE = {
    1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
    6: [[-1, -1], [0, -1], [1, -1], [-1, 1], [0, 1], [1, 1]],
    7: [[-1, -1], [0, -1], [1, -1], [0, 0], [-1, 1], [0, 1], [1, 1]],
    8: [[-1.5, -1], [-0.5, -1], [0.5, -1], [1.5, -1], [-1.5, 1], [-0.5, 1], [0.5, 1], [1.5, 1]],
    9: [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]],
    10: [[-2, -1], [-1, -1], [0, -1], [1, -1], [2, -1], [-2, 1], [-1, 1], [0, 1], [1, 1], [2, 1]]
  };
  function dot(ctx, x, y, r, col) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.32)'; ctx.beginPath(); ctx.arc(x - r * 0.32, y - r * 0.34, r * 0.3, 0, Math.PI * 2); ctx.fill();
  }
  // dice layout inside a w×h label centred at (0, cy)
  function drawDice(ctx, n, w, h, cy, col) {
    n = Math.max(1, Math.min(10, n | 0));
    var pts = DICE[n], dx, dy = h * 0.27, r;
    if (n <= 5) { dx = h * 0.34; r = n === 1 ? h * 0.2 : n <= 3 ? h * 0.17 : h * 0.15; }
    else if (n <= 7) { dx = w * 0.24; r = h * 0.14; }
    else if (n === 9) { dx = h * 0.33; dy = h * 0.3; r = h * 0.11; }
    else { dx = n === 10 ? w * 0.17 : w * 0.2; r = h * 0.12; }
    if (n === 7) pts = [[-1, -1], [0, -1], [1, -1], [-1.5, 1], [-0.5, 1], [0.5, 1], [1.5, 1]], dx = w * 0.2;
    for (var i = 0; i < pts.length; i++) dot(ctx, pts[i][0] * dx, cy + pts[i][1] * dy, r, col);
  }
  // small counting dots in up to 2 rows of 5
  function drawDotRow(ctx, n, w, cy, r, col, litN, t) {
    n = Math.max(0, Math.min(12, n | 0)); if (!n) return;
    var per = n > 5 ? (n > 10 ? 6 : 5) : n, rows = n > 5 ? 2 : 1, gap = Math.min(r * (rows > 1 ? 2.6 : 2.9), w / per), k = 0;
    for (var row = 0; row < rows; row++) {
      var cnt = row ? n - per : per, y = cy + (rows > 1 ? (row - 0.5) * r * 2.5 : 0);
      for (var i = 0; i < cnt; i++, k++) {
        var x = (i - (cnt - 1) / 2) * gap;
        if (litN == null) { dot(ctx, x, y, r, col); continue; }
        if (k < litN) {
          var g = ctx.createRadialGradient(x, y, r * 0.4, x, y, r * 2.1);
          g.addColorStop(0, 'rgba(255,214,80,0.75)'); g.addColorStop(1, 'rgba(255,214,80,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.1, 0, Math.PI * 2); ctx.fill();
          dot(ctx, x, y, r, '#FFB81C');
          ctx.lineWidth = Math.max(1.5, r * 0.22); ctx.strokeStyle = '#B9790A'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
        } else {
          ctx.lineWidth = Math.max(1.5, r * 0.26); ctx.strokeStyle = rgba(col, 0.55);
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.beginPath(); ctx.arc(x, y, r * 0.9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
      }
    }
  }

  // ---------------------------------------------------------------- text
  function drawLabel(ctx, txt, cy, maxH, maxW, col) {
    txt = String(txt);
    var fs = maxH;
    ctx.font = 'bold ' + Math.round(fs) + 'px ' + FONT;
    var w = ctx.measureText(txt).width;
    if (w > maxW) { fs = Math.floor(fs * maxW / w); ctx.font = 'bold ' + fs + 'px ' + FONT; }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var y = cy + fs * 0.05;
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1.5, fs * 0.06); ctx.strokeStyle = col; ctx.strokeText(txt, 0, y);
    ctx.fillStyle = col; ctx.fillText(txt, 0, y);
  }

  // ---------------------------------------------------------------- per-kind
  function isColorDrum(it) { return it.kind === 'color' || (it.kind === 'size' && !it.animal); }
  function memberScale(it) {
    if (!it || it.kind !== 'size') return 1;
    if (typeof it.scale === 'number' && it.scale > 0) return it.scale;
    return (it.size || it.value) === 'small' ? 0.68 : 1;
  }
  function itemKey(it) {
    return [it.kind, it.value, it.color, it.shape, it.n, it.text, it.animal, it.size, it.showDots ? 1 : 0].join('|');
  }
  function woodC() { return { base: WOOD.base, dark: WOOD.dark, light: WOOD.light, line: WOOD.line, rim: WOOD.dark, grain: true }; }
  function colorC(name) { var p = pal(name); return { base: p.base, dark: p.dark, light: p.light, rim: p.dark, line: mix(p.dark, '#000000', 0.22) }; }

  function paintMember(ctx, it, S) {
    if (isColorDrum(it)) { paintDrum(ctx, S, colorC(it.color || it.value), false); return; }
    if (it.plain) { paintDrum(ctx, S, woodC(), false); return; }
    var m = paintDrum(ctx, S, woodC(), true);
    var cy = m.faceY, fw = m.faceW, fh = m.faceH, lw = m.lw;
    var ink = it.color && it.kind !== 'shape' ? pal(it.color).dark : INK;
    switch (it.kind) {
      case 'shape':
        var sh = it.shape || it.value, r = (sh === 'rect' || sh === 'oval') ? fh * 0.36 : fh * 0.39;
        ctx.save(); ctx.translate(0, cy); drawShape(ctx, sh, r, pal(it.color || 'red'), lw * 0.9); ctx.restore();
        break;
      case 'dots':
        drawDice(ctx, it.n != null ? it.n : +it.value, fw, fh, cy, INK);
        break;
      case 'number':
        var nv = it.n != null ? it.n : +it.value, num = it.text != null ? it.text : (it.n != null ? it.n : it.value);
        if (it.showDots && nv > 0) {
          drawLabel(ctx, num, cy - fh * (nv > 5 ? 0.23 : 0.17), fh * (nv > 5 ? 0.54 : 0.66), fw * 0.8, ink);
          drawDotRow(ctx, nv, fw * 0.94, cy + fh * (nv > 5 ? 0.25 : 0.29), fh * (nv > 5 ? 0.11 : 0.13), ink);
        } else drawLabel(ctx, num, cy, fh * 0.92, fw * 0.86, ink);
        break;
      case 'letter':
        drawLabel(ctx, it.text != null ? it.text : it.value, cy, fh * 0.92, fw * 0.86, ink);
        break;
      case 'text':
        var t = String(it.text != null ? it.text : it.value);
        drawLabel(ctx, t, cy, (t.length > 4 ? 0.52 : t.length > 2 ? 0.66 : 0.9) * fh, fw * 0.9, ink);
        break;
      default: break;
    }
  }

  // ---------------------------------------------------------------- cache
  var cache = {}, cacheN = 0, MAX_CACHE = 120;
  function makeCanvas(w, h) {
    try {
      if (typeof document !== 'undefined' && document.createElement) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
      if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    } catch (e) { }
    return null;
  }
  function imgReady(img) { return !!img && (img.complete === undefined || img.complete) && (img.naturalWidth === undefined || img.naturalWidth > 0); }

  function faceCanvas(it, S, dpr) {
    var key = itemKey(it) + '@' + Math.round(S * 10) + 'x' + dpr;
    var hit = cache[key];
    if (hit) return hit;
    var pad = Math.ceil(lineW(S) * 2 + 3), w = Math.ceil(S * 0.84 + 2 * pad), top = -0.38 * S - pad, bot = 0.5 * S + pad;
    var h = Math.ceil(bot - top);
    var cv = makeCanvas(Math.ceil(w * dpr), Math.ceil(h * dpr));
    if (!cv) return null;
    var g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, w * dpr / 2, -top * dpr);
    paintMember(g, it, S);
    var entry = { canvas: cv, x: -w / 2, y: top, w: w, h: h };
    if (cacheN >= MAX_CACHE) { cache = {}; cacheN = 0; }
    cache[key] = entry; cacheN++;
    return entry;
  }

  // ---------------------------------------------------------------- hit overlay (live): skin ripple + brightness
  function drawHit(ctx, m, hit, line) {
    hit = clamp01(hit); if (hit < 0.01) return;
    var ph = 1 - hit;                                   // 0 → 1 as the ripple spreads
    ctx.save();
    // brightness over the whole drum
    drumPath(ctx, m);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,240,210,' + (0.16 * hit).toFixed(3) + ')'; ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    // skin pressed in the middle + 2 expanding rings
    skinPath(ctx, m); ctx.clip();
    ctx.fillStyle = 'rgba(190,150,100,' + (0.28 * hit).toFixed(3) + ')';
    ctx.beginPath(); ctx.ellipse(0, m.yT + m.ry * 0.06, m.rx * 0.28 * (0.6 + hit * 0.4), m.ry * 0.26 * (0.6 + hit * 0.4), 0, 0, Math.PI * 2); ctx.fill();
    for (var k = 0; k < 2; k++) {
      var p = Math.min(1, ph * 1.15 + k * 0.28), a = (1 - p) * hit * 0.9;
      if (a <= 0.01) continue;
      ctx.lineWidth = Math.max(1.5, m.ry * 0.12);
      ctx.strokeStyle = rgba(line || '#A8743F', a);
      ctx.beginPath(); ctx.ellipse(0, m.yT, m.rx * 0.82 * (0.18 + 0.8 * p), m.ry * 0.7 * (0.18 + 0.8 * p), 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
    // little "boom" arcs above the skin
    if (hit > 0.2) {
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineWidth = Math.max(2, m.rx * 0.05);
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.95 * hit).toFixed(3) + ')';
      var lift = (1 - hit) * m.rx * 0.18;
      for (var s = -1; s <= 1; s += 2) {
        ctx.beginPath(); ctx.arc(s * m.rx * 0.98, m.yT - m.ry * 1.6 - lift, m.rx * 0.2, s < 0 ? Math.PI * 1.05 : -Math.PI * 0.45, s < 0 ? Math.PI * 1.45 : -Math.PI * 0.05); ctx.stroke();
        ctx.beginPath(); ctx.arc(s * m.rx * 0.98, m.yT - m.ry * 1.6 - lift, m.rx * 0.36, s < 0 ? Math.PI * 1.1 : -Math.PI * 0.4, s < 0 ? Math.PI * 1.4 : -Math.PI * 0.1); ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------- animal sticker
  function animalImage(it, opt) {
    var a = it.animal || it.value, f = opt && opt.img, img = null;
    if (!f) return null;
    if (opt.sing) { img = f('animal_' + a + '_sing'); if (!imgReady(img)) img = null; }
    if (!img) { img = f('animal_' + a); if (!imgReady(img)) img = null; }
    return img;
  }
  function drawAnimal(ctx, it, S, opt) {
    var img = animalImage(it, opt);
    // sticker box: 160 viewBox, bottom anchor (80,156) → +S/2
    var size = S * 1.06, top = S / 2 - size * 156 / 160;
    if (img) {
      ctx.drawImage(img, -size / 2, top, size, size);
      var hit = clamp01(opt && opt.hit);
      if (hit > 0.01) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.22 * hit;
        ctx.drawImage(img, -size / 2, top, size, size); ctx.restore();
      }
      return;
    }
    // fallback: a friendly round face
    var r = S * 0.36, cy = S / 2 - r - S * 0.06;
    ctx.save();
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(0, cy, r + S * 0.05, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#C9A27A'; ctx.strokeStyle = '#8A6440'; ctx.lineWidth = S * 0.026;
    ctx.beginPath(); ctx.arc(0, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2F2A3A';
    ctx.beginPath(); ctx.arc(-r * 0.36, cy - r * 0.12, r * 0.13, 0, Math.PI * 2); ctx.arc(r * 0.36, cy - r * 0.12, r * 0.13, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2F2A3A'; ctx.lineWidth = S * 0.022; ctx.lineCap = 'round';
    ctx.beginPath();
    if (opt && opt.sing) { ctx.fillStyle = '#7A2E3A'; ctx.ellipse(0, cy + r * 0.32, r * 0.18, r * 0.22, 0, 0, Math.PI * 2); ctx.fill(); }
    else { ctx.arc(0, cy + r * 0.12, r * 0.3, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke(); }
    ctx.restore();
  }

  // ---------------------------------------------------------------- public: members
  function drawMember(ctx, item, S, opt) {
    if (!item) return;
    opt = opt || {};
    var sc = memberScale(item), s = S * sc;
    var glow = clamp01(opt.glow);
    ctx.save();
    if (sc !== 1) ctx.translate(0, S / 2 * (1 - sc));        // keep the bottom on the stool seat
    if (glow > 0.01) {
      ctx.save(); ctx.translate(0, s * 0.06);
      drawGlow(ctx, s * 0.92, s * 0.98, opt.t != null ? opt.t : nowSec(), glow);
      ctx.restore();
    }
    if (item.kind === 'animal' || (item.kind === 'size' && item.animal)) { drawAnimal(ctx, item, s, opt); ctx.restore(); return; }
    var dpr = opt.dpr || 1, entry = opt.cache === false ? null : faceCanvas(item, s, dpr);
    if (entry) ctx.drawImage(entry.canvas, entry.x, entry.y, entry.w, entry.h);
    else paintMember(ctx, item, s);
    if (opt.hit > 0.01) drawHit(ctx, METRICS(s), opt.hit, isColorDrum(item) ? pal(item.color || item.value).dark : WOOD.dark);
    ctx.restore();
  }

  // the visible box of a member (for debug/hit areas), relative to its centre
  function memberBox(item, S) {
    var sc = memberScale(item), s = S * sc, off = S / 2 * (1 - sc);
    if (item && item.kind === 'animal') return { x: -s * 0.47, y: off + s * 0.5 - s * 0.95, w: s * 0.94, h: s * 0.95 };
    return { x: -0.42 * s - 2, y: off - 0.38 * s, w: 0.84 * s + 4, h: 0.88 * s };
  }

  // ---------------------------------------------------------------- stool (flower pot + wooden seat)
  function drawStool(ctx, w, h) {
    var POT = '#D9825B', POT_D = '#A85A3C', POT_L = '#EFA27C', LINE = '#7E3F2A';
    var SEAT = '#C99A6B', SEAT_T = '#E2B886', SEAT_L = '#8A5E38';
    var sw = w / 2, seatRy = Math.max(3, h * 0.16), seatTh = h * 0.2;
    var potTop = seatTh + seatRy * 0.6, potBot = h, tw = sw * 0.8, bw = sw * 0.58, rimH = h * 0.2;
    var lw = Math.max(2, w * 0.03);
    ctx.save(); ctx.lineJoin = 'round';
    // ground shadow
    ctx.fillStyle = 'rgba(40,25,15,0.2)';
    ctx.beginPath(); ctx.ellipse(0, potBot, bw * 1.35, Math.max(2, h * 0.08), 0, 0, Math.PI * 2); ctx.fill();
    // pot body
    ctx.beginPath(); ctx.moveTo(-tw * 0.94, potTop + rimH); ctx.lineTo(-bw, potBot - 2); ctx.quadraticCurveTo(0, potBot + 3, bw, potBot - 2);
    ctx.lineTo(tw * 0.94, potTop + rimH); ctx.closePath();
    ctx.fillStyle = POT; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = LINE; ctx.stroke();
    ctx.save(); ctx.clip();
    ctx.fillStyle = POT_D; ctx.fillRect(tw * 0.35, potTop, sw, h);
    ctx.fillStyle = rgba(POT_L, 0.9); ctx.fillRect(-tw * 0.62, potTop, tw * 0.14, h);
    ctx.restore();
    // pot rim
    roundRect(ctx, -tw, potTop, tw * 2, rimH, rimH * 0.35);
    ctx.fillStyle = POT; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = LINE; ctx.stroke();
    ctx.fillStyle = rgba(POT_L, 0.9); ctx.fillRect(-tw * 0.75, potTop + rimH * 0.22, tw * 0.9, rimH * 0.22);
    // wooden seat (a thick disc)
    ctx.beginPath(); ctx.moveTo(-sw, 0); ctx.lineTo(-sw, seatTh); ctx.ellipse(0, seatTh, sw, seatRy, 0, Math.PI, 0, true); ctx.lineTo(sw, 0); ctx.closePath();
    ctx.fillStyle = SEAT; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = SEAT_L; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 0, sw, seatRy, 0, 0, Math.PI * 2);
    ctx.fillStyle = SEAT_T; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 0, sw * 0.62, seatRy * 0.55, 0, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(1, lw * 0.4); ctx.strokeStyle = rgba(SEAT_L, 0.35); ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------- Bop's big drum
  function drawBigDrum(ctx, r, opt) {
    opt = opt || {};
    var hit = clamp01(opt.hit), glow = clamp01(opt.glow);
    var SH = '#C98B55', SHD = '#9A6234', SHL = '#E3AE7A', LINE = '#5E3A1E', RIM = '#8A5530', RIML = '#B97C4C', TACK = '#F2C94C';
    var m = { rx: r, ry: 0.34 * r, yT: -0.41 * r, yB: 0.41 * r, rimH: 0.1 * r };
    var lw = Math.max(2.5, r * 0.04);
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (glow > 0.01) { ctx.save(); drawGlow(ctx, r * 2.05, r * 1.55, opt.t != null ? opt.t : nowSec(), glow); ctx.restore(); }
    // ground shadow
    ctx.fillStyle = 'rgba(30,25,20,0.22)';
    ctx.beginPath(); ctx.ellipse(0, 0.75 * r, r * 1.05, r * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    // little feet
    for (var s = -1; s <= 1; s += 2) {
      roundRect(ctx, s * r * 0.62 - r * 0.09, 0.62 * r, r * 0.18, r * 0.13, r * 0.05);
      ctx.fillStyle = RIM; ctx.fill(); ctx.lineWidth = lw * 0.8; ctx.strokeStyle = LINE; ctx.stroke();
    }
    // shell
    drumPath(ctx, m); ctx.lineWidth = lw * 2; ctx.strokeStyle = LINE; ctx.stroke(); ctx.fillStyle = SH; ctx.fill();
    ctx.save(); drumPath(ctx, m); ctx.clip();
    ctx.fillStyle = SHD; ctx.beginPath(); ctx.ellipse(r * 1.2, 0, r * 0.6, r * 1.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = rgba(SHL, 0.85); roundRect(ctx, -r * 0.8, m.yT, r * 0.12, r * 1.3, r * 0.05); ctx.fill();
    // wood grain
    ctx.strokeStyle = rgba(SHD, 0.4); ctx.lineWidth = Math.max(1, r * 0.012);
    for (var g = 0; g < 6; g++) {
      var gx = -r * 0.92 + g * r * 0.36;
      ctx.beginPath(); ctx.moveTo(gx, m.yT); ctx.bezierCurveTo(gx + r * 0.05, -r * 0.1, gx - r * 0.05, r * 0.2, gx + r * 0.02, m.yB + m.ry); ctx.stroke();
    }
    // cord
    var up = m.yT + m.rimH * 1.05, dn = m.yB - m.rimH * 1.05, N = 10;
    ctx.beginPath();
    for (var i = 0; i <= N; i++) {
      var th = Math.PI - (i / N) * Math.PI, x = r * Math.cos(th) * 0.995, y = (i % 2 ? dn : up) + m.ry * Math.sin(th);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.lineWidth = r * 0.045; ctx.strokeStyle = LINE; ctx.stroke();
    ctx.lineWidth = r * 0.024; ctx.strokeStyle = CORD; ctx.stroke();
    ctx.restore();
    // front emblem: a lily-pad leaf with a raindrop (Bop's band badge)
    ctx.save(); ctx.translate(0, r * 0.2);
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.3, r * 0.22, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#FFF1D2'; ctx.fill(); ctx.lineWidth = lw * 0.8; ctx.strokeStyle = LINE; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.ellipse(0, r * 0.03, r * 0.2, r * 0.13, 0, -Math.PI * 0.42, Math.PI * 1.42 - Math.PI * 2 + Math.PI * 2, false);
    ctx.closePath();
    ctx.fillStyle = '#6FBF73'; ctx.fill(); ctx.lineWidth = lw * 0.55; ctx.strokeStyle = '#2F7A44'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r * 0.0, -r * 0.13); ctx.quadraticCurveTo(r * 0.075, -r * 0.035, r * 0.06, -r * 0.005);
    ctx.arc(0, -r * 0.01, r * 0.06, 0.05, Math.PI - 0.05); ctx.quadraticCurveTo(-r * 0.075, -r * 0.035, 0, -r * 0.13);
    ctx.fillStyle = '#7EC8EE'; ctx.fill(); ctx.lineWidth = lw * 0.5; ctx.strokeStyle = '#2F6E9E'; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(-r * 0.02, -r * 0.03, r * 0.015, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // rims with golden tacks
    bandPath(ctx, m, m.yB - m.rimH, m.yB); ctx.fillStyle = RIM; ctx.fill(); ctx.lineWidth = lw * 0.8; ctx.strokeStyle = LINE; ctx.stroke();
    bandPath(ctx, m, m.yT, m.yT + m.rimH); ctx.fillStyle = RIM; ctx.fill(); ctx.stroke();
    for (var k = 0; k <= 6; k++) {
      var tt = Math.PI - (k + 0.5) / 7 * Math.PI, tx = r * Math.cos(tt) * 0.94, sy = m.ry * Math.sin(tt);
      [m.yT + m.rimH * 0.55 + sy, m.yB - m.rimH * 0.45 + sy].forEach(function (ty) {
        ctx.fillStyle = TACK; ctx.beginPath(); ctx.arc(tx, ty, r * 0.024, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = Math.max(1, r * 0.008); ctx.strokeStyle = '#9A7210'; ctx.stroke();
      });
    }
    // top: rim ring + skin
    ctx.beginPath(); ctx.ellipse(0, m.yT, r, m.ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = RIM; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = LINE; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, m.yT, r * 0.92, m.ry * 0.82, 0, 0, Math.PI * 2);
    ctx.fillStyle = RIML; ctx.fill();
    var sk = { rx: r, ry: m.ry, yT: m.yT };
    skinPath(ctx, sk); ctx.fillStyle = SKIN; ctx.fill();
    ctx.save(); skinPath(ctx, sk); ctx.clip();
    ctx.fillStyle = SKIN_SH; ctx.beginPath(); ctx.ellipse(r * 0.22, m.yT + m.ry * 0.5, r * 0.9, m.ry * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.ellipse(-r * 0.35, m.yT - m.ry * 0.28, r * 0.22, m.ry * 0.18, -0.1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    skinPath(ctx, sk); ctx.lineWidth = lw * 0.6; ctx.strokeStyle = rgba(LINE, 0.6); ctx.stroke();
    drumPath(ctx, m); ctx.lineWidth = lw; ctx.strokeStyle = LINE; ctx.stroke();
    drawHit(ctx, m, hit, '#9A6234');
    ctx.restore();
  }

  // ---------------------------------------------------------------- notes
  function drawNote(ctx, size, color, opt) {
    opt = opt || {};
    var R = size;
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (opt.empty) {
      ctx.fillStyle = 'rgba(60,45,40,0.16)';
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = Math.max(2, R * 0.13);
      ctx.strokeStyle = 'rgba(90,60,40,0.35)';
      ctx.beginPath(); ctx.arc(0, R * 0.04, R, 0, Math.PI * 2); ctx.stroke();
      if (ctx.setLineDash) ctx.setLineDash([R * 0.34, R * 0.24]);
      ctx.strokeStyle = '#FFF6E4';
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.stroke();
      if (ctx.setLineDash) ctx.setLineDash([]);
      ctx.restore(); return;
    }
    var p = pal(color), pop = clamp01(opt.pop);
    if (pop > 0) ctx.scale(1 + 0.4 * pop, 1 + 0.4 * pop);
    var hx = R * 0.6, hy = R * 0.44, rot = -0.38, lw = Math.max(2, R * 0.11);
    var sx = hx * 0.86, sTop = -R * 1.75;
    function body() {
      ctx.beginPath(); ctx.ellipse(0, 0, hx, hy, rot, 0, Math.PI * 2);
      roundRect(ctx, sx - R * 0.14, sTop, R * 0.2, -sTop - hy * 0.2, R * 0.08, true);
      ctx.moveTo(sx + R * 0.02, sTop);
      ctx.bezierCurveTo(sx + R * 0.5, sTop + R * 0.25, sx + R * 0.82, sTop + R * 0.55, sx + R * 0.56, sTop + R * 1.15);
      ctx.bezierCurveTo(sx + R * 0.6, sTop + R * 0.75, sx + R * 0.32, sTop + R * 0.58, sx + R * 0.02, sTop + R * 0.5);
      ctx.closePath();
    }
    // halo
    var g = ctx.createRadialGradient(0, -R * 0.4, R * 0.3, 0, -R * 0.4, R * 1.7);
    g.addColorStop(0, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -R * 0.4, R * 1.7, 0, Math.PI * 2); ctx.fill();
    body(); ctx.lineWidth = lw * 2; ctx.strokeStyle = p.dark; ctx.stroke();
    body(); ctx.fillStyle = p.base; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.ellipse(-hx * 0.3, -hy * 0.35, hx * 0.32, hy * 0.2, rot, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------- song sheet (vine line)
  var SEASONS = ['spring', 'summer', 'autumn', 'winter'];
  var VINE = {
    spring: { vine: '#5E9A4E', line: '#3F6E36', leaf: '#86C46E', leaf2: '#A8D98C', flower: '#F6C3D2' },
    summer: { vine: '#4F9A48', line: '#33702F', leaf: '#6CBF5E', leaf2: '#93D27F', flower: '#FFE08A' },
    autumn: { vine: '#8E7048', line: '#5E4630', leaf: '#D69A55', leaf2: '#B97A4A', flower: null },
    winter: { vine: '#7E6A58', line: '#55463A', leaf: '#7FA88A', leaf2: '#9CBBA4', flower: null, snow: true }
  };
  function drawSheet(ctx, x0, x1, y, n, season) {
    var sn = typeof season === 'number' ? SEASONS[((season % 4) + 4) % 4] : (season || 'spring');
    var c = VINE[sn] || VINE.spring, L = x1 - x0, amp = 5, wl = 160;
    function vy(x) { return y + Math.sin((x - x0) / wl * Math.PI * 2) * amp; }
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // two faint staff lines
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
    [-22, 22].forEach(function (d) { ctx.beginPath(); ctx.moveTo(x0 + 20, y + d); ctx.lineTo(x1 - 20, y + d); ctx.stroke(); });
    // the vine
    ctx.beginPath();
    for (var x = x0; x <= x1; x += 8) { if (x === x0) ctx.moveTo(x, vy(x)); else ctx.lineTo(x, vy(x)); }
    ctx.lineTo(x1, vy(x1));
    ctx.lineWidth = 9; ctx.strokeStyle = c.line; ctx.stroke();
    ctx.lineWidth = 5; ctx.strokeStyle = c.vine; ctx.stroke();
    // curls at both ends
    [[x0, -1], [x1, 1]].forEach(function (e) {
      ctx.beginPath(); ctx.arc(e[0] + e[1] * 10, vy(e[0]) - 10, 10, e[1] > 0 ? Math.PI * 0.5 : Math.PI * 0.5, e[1] > 0 ? Math.PI * 2.1 : -Math.PI * 1.1, e[1] < 0);
      ctx.lineWidth = 7; ctx.strokeStyle = c.line; ctx.stroke(); ctx.lineWidth = 3.5; ctx.strokeStyle = c.vine; ctx.stroke();
    });
    // leaves (alternating up/down), skipping nothing: they are small and sit on the line
    var step = 46, k = 0;
    for (x = x0 + 30; x < x1 - 20; x += step, k++) {
      var up = k % 2 ? 1 : -1, yy = vy(x), ang = up * (0.9 + 0.2 * Math.sin(k * 1.7));
      ctx.save(); ctx.translate(x, yy); ctx.rotate(-ang + (up < 0 ? 0 : 0));
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(7, -9, 0, -20); ctx.quadraticCurveTo(-7, -9, 0, 0);
      ctx.fillStyle = k % 3 ? c.leaf : c.leaf2; ctx.fill(); ctx.lineWidth = 1.8; ctx.strokeStyle = c.line; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(0, -15); ctx.lineWidth = 1.1; ctx.strokeStyle = rgba(c.line, 0.6); ctx.stroke();
      ctx.restore();
      if (c.flower && k % 4 === 2) {
        ctx.save(); ctx.translate(x + 10, yy + up * -2);
        for (var pi = 0; pi < 5; pi++) {
          var a = pi / 5 * Math.PI * 2;
          ctx.fillStyle = c.flower; ctx.beginPath(); ctx.arc(Math.cos(a) * 4.2, Math.sin(a) * 4.2, 3.6, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = '#F2B23E'; ctx.beginPath(); ctx.arc(0, 0, 2.4, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
    // winter: snow caps along the vine
    if (c.snow) {
      ctx.fillStyle = '#FFFFFF';
      for (x = x0 + 12; x < x1 - 10; x += 34) {
        ctx.beginPath(); ctx.ellipse(x, vy(x) - 4, 9, 3.6, 0, Math.PI, 0); ctx.fill();
      }
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- counting card (origin = centre)
  function drawNumberCard(ctx, w, h, n, lit) {
    n = Math.max(0, n | 0); lit = Math.max(0, Math.min(n, +lit || 0));
    var r = Math.min(w, h) * 0.16, lw = Math.max(2.5, Math.min(w, h) * 0.03);
    ctx.save(); ctx.lineJoin = 'round';
    // shadow, frame, paper
    ctx.fillStyle = 'rgba(40,30,20,0.2)'; roundRect(ctx, -w / 2 + 3, -h / 2 + 6, w, h, r); ctx.fill();
    roundRect(ctx, -w / 2, -h / 2, w, h, r); ctx.fillStyle = '#C99A6B'; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = '#7E5530'; ctx.stroke();
    var f = Math.max(5, w * 0.05);
    roundRect(ctx, -w / 2 + f, -h / 2 + f, w - 2 * f, h - 2 * f, r * 0.7); ctx.fillStyle = '#FFF8E8'; ctx.fill();
    ctx.lineWidth = lw * 0.5; ctx.strokeStyle = rgba('#7E5530', 0.4); ctx.stroke();
    // little leaf in the corner
    ctx.save(); ctx.translate(-w / 2 + f * 1.2, -h / 2 + f * 1.2); ctx.rotate(-0.6);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(w * 0.05, -w * 0.04, w * 0.11, 0); ctx.quadraticCurveTo(w * 0.05, w * 0.04, 0, 0);
    ctx.fillStyle = '#86C46E'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#3F6E36'; ctx.stroke();
    ctx.restore();
    var ih = h - 2 * f;
    drawLabel(ctx, String(n), -h / 2 + f + ih * 0.33, ih * 0.56, w * 0.7, INK);
    drawDotRow(ctx, n, w - 2 * f - 12, -h / 2 + f + ih * (n > 6 ? 0.78 : 0.8), Math.min(ih * (n > 6 ? 0.07 : 0.085), (w - 2 * f) / (Math.min(n, 6) * 3.1 + 0.01)), INK, lit);
    ctx.restore();
  }

  // ---------------------------------------------------------------- glow
  function drawGlow(ctx, w, h, t, strength) {
    strength = clamp01(strength == null ? 1 : strength);
    if (!strength) return;
    var wave = Math.sin((t || 0) * 5.5), pulse = 0.85 + 0.15 * wave;
    var rx = w / 2, ry = h / 2, m = Math.min(w, h), reach = m * (0.32 + 0.03 * wave);
    ctx.save();
    ctx.translate(0, 0); ctx.scale(1, ry / rx);
    var R0 = rx * 0.82, R1 = rx + reach * rx / Math.max(1, ry) * 0.9;
    var g = ctx.createRadialGradient(0, 0, R0, 0, 0, R1);
    g.addColorStop(0, 'rgba(255,214,80,' + (0.55 * strength * pulse).toFixed(3) + ')');
    g.addColorStop(0.45, 'rgba(255,214,80,' + (0.28 * strength * pulse).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(255,214,80,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, R1, 0, Math.PI * 2); ctx.arc(0, 0, R0 * 0.98, 0, Math.PI * 2, true); ctx.fill();
    ctx.restore();
    // golden rim ring
    ctx.save();
    ctx.beginPath(); ctx.ellipse(0, 0, rx + m * 0.06, ry + m * 0.06, 0, 0, Math.PI * 2);
    ctx.lineWidth = m * 0.04; ctx.strokeStyle = 'rgba(255,220,100,' + (0.85 * strength * pulse).toFixed(3) + ')'; ctx.stroke();
    ctx.lineWidth = m * 0.014; ctx.strokeStyle = 'rgba(255,255,235,' + (0.85 * strength).toFixed(3) + ')'; ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------- ghost hand
  function drawGhostHand(ctx, size, t) {
    var s = size, F = '#FFF4E4', L = '#B9835A', SH = '#F1D6B8';
    t = t || 0;
    var press = 0.5 + 0.5 * Math.sin(t * 6);
    ctx.save();
    var ph = (t * 1.4) % 1;
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.85 * (1 - ph)).toFixed(3) + ')'; ctx.lineWidth = s * 0.035;
    ctx.beginPath(); ctx.arc(0, 0, s * (0.08 + 0.22 * ph), 0, Math.PI * 2); ctx.stroke();
    ctx.translate(0, s * 0.04 * press);
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
      ctx.ellipse(-s * 0.27, s * 0.46, s * 0.07, s * 0.15, -0.6, 0, Math.PI * 2);
    }
    ctx.globalAlpha *= 0.95;
    hand(); ctx.lineWidth = s * 0.07; ctx.strokeStyle = L; ctx.stroke();
    hand(); ctx.fillStyle = F; ctx.fill();
    ctx.strokeStyle = SH; ctx.lineWidth = s * 0.03;
    ctx.beginPath(); ctx.moveTo(0, s * 0.5); ctx.lineTo(s * 0.18, s * 0.5); ctx.moveTo(0, s * 0.62); ctx.lineTo(s * 0.18, s * 0.62); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.ellipse(-s * 0.03, s * 0.12, s * 0.025, s * 0.07, 0, 0, Math.PI * 2); ctx.fill();
    // cuff: aqua like Bop
    ctx.fillStyle = '#62C7CF'; ctx.strokeStyle = '#2A6E78'; ctx.lineWidth = s * 0.04;
    ctx.beginPath(); rr(-s * 0.24, s * 0.76, s * 0.44, s * 0.14, s * 0.05); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  RB.BandArt = {
    drawMember: drawMember, drawStool: drawStool, drawBigDrum: drawBigDrum, drawNote: drawNote, drawSheet: drawSheet,
    drawNumberCard: drawNumberCard, drawGhostHand: drawGhostHand, drawGlow: drawGlow,
    get COLORS() { return palette(); },
    METRICS: METRICS, memberBox: memberBox, memberScale: memberScale, shapePath: shapePath,
    clearCache: function () { cache = {}; cacheN = 0; },
    WOOD: WOOD, INK: INK, FONT: FONT, _mix: mix
  };
})(typeof window !== 'undefined' ? (window.RB = window.RB || {}) : (globalThis.RB = globalThis.RB || {}));
