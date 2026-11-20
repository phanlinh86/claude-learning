/* Pip's Reef Tower — RT.BlockArt (character artist B), DESIGN §3 / §4.2.
 *
 *   drawBlock(ctx, block, LW, LH, opt)   a chunky SHELL BLOCK, origin = CENTRE, LW × LH px (layout.LW / layout.LH).
 *       opt = { glow 0..1, lift 0..1, dpr, id (ridge seed), img(name) → Image|null, t, cache:false }
 *       Front view with a thin top face (top 14 % of LH), rounded corners r = 0.2·LH, a scalloped shell ridge along
 *       the top edge (5–7 bumps, pattern from opt.id), soft ridge lines fanning on the front and a tiny barnacle /
 *       pearl in one corner. color blocks: the whole block in the answer colour (base front, light ridges/top, dark
 *       outline). Others: sand-stone #F3DDB2 / top #FBEFD4 / outline #B98A4E with a decoration: shape | dots (white
 *       pearl dots with a lilac rim, dice / ten-frame layout 1–10) | number (+ pearl dots when block.showDots) |
 *       animal (sticker 'animal_<x>') | letter | text | size (small = block.scale or 0.72 of both dims; an animal size
 *       block is sand with the sticker) | parity (text or pairs icon). Numerals / letters in dark teal #1F5E6B.
 *       Backward compatible: drawBlock(ctx, block, S, opt) (4th arg not a number) → LW = round(1.12·S), LH = round(0.8·S).
 *       Static faces are cached per (key, LW, LH, dpr, seed) in lazily created offscreen canvases (node → drawn direct).
 *   drawPearl(ctx, h, lit 0..1, out 0..1, t)  a pearl on a tiny open shell, origin = BASE; lit → glow halo + twinkle;
 *                                              out → the pearl lifts (up to −1.2·h) inside a bubble, fades, pops
 *   drawBubble(ctx, r, a)                      a water bubble of radius r (thin rim, highlight), alpha a; origin = centre
 *   drawPlate(ctx, w, h)                       a flat sandy shell tray, origin = top-centre of its surface
 *   drawSprinkle(ctx, len, color, rot)         a tiny FISH (len = body length) tinted color (palette name or hex),
 *                                              facing angle rot; origin = centre
 *   drawGhostHand(ctx, size, t)                friendly pointing hand that TAPS (bobs down/up, ripple ring on contact);
 *                                              origin = fingertip, finger points UP
 *   drawGlow(ctx, w, h, t, strength)           golden pulsing halo around a w×h box centred at the origin
 *   COLORS = RT.PALETTE ;  faceRect(LW, LH), blockScale(b), layerSize(b, LW, LH), shapePath, bodyPath, clearCache()
 *   Kept for older callers: drawFlame (now a twinkle sparkle), drawLeafPad = drawPlate, drawFlower (a sea anemone).
 */
(function (RT) {
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
  function palette() { return RT.PALETTE || FALLBACK_PALETTE; }
  function pal(c) {
    var p = palette()[c] || FALLBACK_PALETTE[c];
    if (p) return p;
    if (typeof c === 'string' && c[0] === '#') return { base: c, dark: mix(c, '#000000', 0.35), light: mix(c, '#FFFFFF', 0.45) };
    return FALLBACK_PALETTE.orange;
  }

  // sand-stone block (DESIGN §3)
  var SAND = { front: '#F3DDB2', top: '#FBEFD4', line: '#B98A4E' };
  var VANILLA = SAND;                    // old name kept
  var INK = '#1F5E6B';                   // dark teal: numerals, letters
  var HALO = '#FFF9EC';                  // cream halo behind decorations
  var PEARL = { fill: '#FFFFFF', rim: '#9C95B8', sheen: '#F3E6FA' };
  var FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", system-ui, sans-serif';
  var TOP = 0.14;                        // top face height (fraction of LH), incl. the scallops
  var BUMP = 0.07;                       // scallop height (fraction of LH)
  var RAD = 0.2;                         // corner radius (fraction of LH)
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
  function lineW(LH) { return Math.max(2.5, LH * 0.05); }               // ≈ 5 px at LH 99
  function faceRect(LW, LH) {
    if (LH == null) { var S = LW; LW = Math.round(1.12 * S); LH = Math.round(0.8 * S); }
    var lw = lineW(LH); return { x: -LW / 2 + lw, y: -LH / 2 + TOP * LH, w: LW - 2 * lw, h: LH * (1 - TOP) - lw };
  }

  // scallop pattern for a seed: 5–7 bumps across the top edge, widths varied a little
  function scallopsFor(seed, w) {
    var R = rnd(seed * 2654435761 + 11), n = 5 + (seed % 3), ws = [], sum = 0, i;
    for (i = 0; i < n; i++) { var v = 0.85 + R() * 0.3; if (i === 0 || i === n - 1) v *= 0.9; ws.push(v); sum += v; }
    var span = w * 0.9, x = -span / 2, out = [];
    for (i = 0; i < n; i++) { var bw = ws[i] / sum * span; out.push({ x0: x, x1: x + bw, k: 0.85 + 0.3 * ((i + seed) % 2) }); x += bw; }
    return out;
  }

  // silhouette: front face (rounded) + thin top face whose back edge is a scalloped shell ridge
  function bodyPath(ctx, w, h, seed) {
    var hw = w / 2, hh = h / 2, yT = -hh + TOP * h, r = RAD * h, bh = BUMP * h, inset = 0.05 * w;
    var sc = scallopsFor(seed || 0, w), yb = -hh + bh;
    ctx.beginPath();
    ctx.moveTo(-hw, yT + r * 0.35);
    ctx.quadraticCurveTo(-hw, yb + 0.02 * h, -hw + inset, yb);       // back-left corner of the top face
    ctx.lineTo(sc[0].x0, yb);
    for (var i = 0; i < sc.length; i++) {
      var s = sc[i], m = (s.x0 + s.x1) / 2, top = yb - bh * s.k * 1.9;
      ctx.bezierCurveTo(s.x0, top, s.x1, top, s.x1, yb);
    }
    ctx.lineTo(hw - inset, yb);
    ctx.quadraticCurveTo(hw, yb + 0.02 * h, hw, yT + r * 0.35);
    ctx.lineTo(hw, hh - r);
    ctx.arcTo(hw, hh, hw - r, hh, r);
    ctx.lineTo(-hw + r, hh);
    ctx.arcTo(-hw, hh, -hw, hh - r, r);
    ctx.closePath();
    void m;
  }

  function roundRect(ctx, x, y, w, h, r, keep) {
    r = Math.min(r, w / 2, h / 2);
    if (!keep) ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
  }

  // ---------------------------------------------------------------- the shell block
  function blockColors(b) {
    if (isColorBlock(b)) {
      var c = pal(b.color || b.value);
      return {
        colour: true, line: c.dark, front: c.base, shade: mix(c.base, c.dark, 0.28),
        top: mix(c.base, c.light, 0.6), ridge: mix(c.base, c.light, 0.75), ridgeShade: mix(c.base, c.dark, 0.35),
        speck: mix(c.base, c.light, 0.5)
      };
    }
    return {
      colour: false, line: SAND.line, front: SAND.front, shade: mix(SAND.front, SAND.line, 0.2),
      top: SAND.top, ridge: mix(SAND.front, '#FFFFFF', 0.55), ridgeShade: mix(SAND.front, SAND.line, 0.3),
      speck: mix(SAND.front, SAND.line, 0.35)
    };
  }

  function barnacle(ctx, x, y, r, C) {           // a tiny pearl (colour blocks) or a tiny pink fan shell (sand)
    if (C.colour) {
      ctx.fillStyle = 'rgba(0,0,0,0.14)'; ctx.beginPath(); ctx.arc(x + r * 0.2, y + r * 0.25, r, 0, PI2); ctx.fill();
      pearlDot(ctx, x, y, r, 0);
      return;
    }
    var B = '#F7C3CC', BL = '#C27886', s2 = r * 1.7, i;
    ctx.save(); ctx.translate(x, y + s2 * 0.35); ctx.rotate(x < 0 ? -0.25 : 0.25); ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-s2, 0);
    for (i = 0; i < 5; i++) {
      var a0 = Math.PI + i / 5 * Math.PI, a1 = Math.PI + (i + 0.5) / 5 * Math.PI, a2 = Math.PI + (i + 1) / 5 * Math.PI;
      ctx.quadraticCurveTo(Math.cos(a1) * s2 * 1.18, Math.sin(a1) * s2 * 1.18, Math.cos(a2) * s2, Math.sin(a2) * s2);
      void a0;
    }
    ctx.closePath();
    ctx.fillStyle = B; ctx.fill(); ctx.lineWidth = Math.max(1, r * 0.3); ctx.strokeStyle = BL; ctx.stroke();
    ctx.strokeStyle = rgba(BL, 0.6); ctx.lineWidth = Math.max(0.7, r * 0.18);
    for (i = 1; i < 5; i++) { var a = Math.PI + i / 5 * Math.PI; ctx.beginPath(); ctx.moveTo(0, -s2 * 0.1); ctx.lineTo(Math.cos(a) * s2 * 0.85, Math.sin(a) * s2 * 0.85); ctx.stroke(); }
    ctx.fillStyle = BL; ctx.beginPath(); ctx.ellipse(0, s2 * 0.05, s2 * 0.25, s2 * 0.14, 0, 0, PI2); ctx.fill();
    ctx.restore();
  }

  function drawShellBlock(ctx, w, h, C, seed, decorated) {
    var hw = w / 2, hh = h / 2, yT = -hh + TOP * h, lw = lineW(h), bh = BUMP * h, yb = -hh + bh;
    var R = rnd(seed + 99), sc = scallopsFor(seed, w), i;
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // outline (fat stroke under the fill) + front
    bodyPath(ctx, w, h, seed);
    ctx.lineWidth = lw * 2; ctx.strokeStyle = C.line; ctx.stroke();
    ctx.fillStyle = C.front; ctx.fill();
    ctx.clip();
    // cel shade: right strip + bottom strip
    ctx.fillStyle = C.shade;
    ctx.beginPath();
    ctx.moveTo(hw - 0.07 * w, yT); ctx.lineTo(hw + 4, yT); ctx.lineTo(hw + 4, hh + 4); ctx.lineTo(-hw - 4, hh + 4);
    ctx.lineTo(-hw - 4, hh - 0.12 * h); ctx.quadraticCurveTo(0, hh - 0.15 * h, hw - 0.07 * w, hh - 0.12 * h); ctx.closePath(); ctx.fill();
    // shell ribs radiating from a hinge below the bottom centre up to every scallop trough (a scallop shell);
    // colour blocks: soft grooves + light ribs over the whole front; sand blocks: only near the top, fading out
    var hx = 0, hy = hh + 0.9 * h, tr = [], rib, g0;
    for (i = 1; i < sc.length; i++) tr.push(sc[i].x0);
    for (i = 0; i < tr.length; i++) {
      var tx = tr[i], ty = yT, by0 = C.colour ? hh + 2 : yT + 0.42 * h;
      var bx0 = hx + (tx - hx) * (hy - by0) / (hy - ty);
      if (ctx.createLinearGradient) {
        g0 = ctx.createLinearGradient(0, ty, 0, by0);
        g0.addColorStop(0, rgba(C.ridgeShade, C.colour ? 0.5 : 0.42)); g0.addColorStop(1, rgba(C.ridgeShade, C.colour ? 0.25 : 0));
        rib = ctx.createLinearGradient(0, ty, 0, by0);
        rib.addColorStop(0, rgba(C.ridge, 0.95)); rib.addColorStop(1, rgba(C.ridge, C.colour ? 0.45 : 0));
      } else { g0 = rgba(C.ridgeShade, 0.4); rib = rgba(C.ridge, 0.7); }
      var rw = 0.03 * h;
      ctx.strokeStyle = g0; ctx.lineWidth = rw;
      ctx.beginPath(); ctx.moveTo(bx0, by0); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.strokeStyle = rib; ctx.lineWidth = rw * 1.1;
      ctx.beginPath(); ctx.moveTo(bx0 - rw * 1.1, by0); ctx.lineTo(tx - rw * 1.1, ty); ctx.stroke();
    }
    // specks (sand grains / shell texture), kept to the edges on decorated blocks
    ctx.fillStyle = rgba(C.speck, 0.55);
    for (i = 0; i < 14; i++) {
      var px = (R() - 0.5) * 0.92 * w, py = yT + 0.1 * h + R() * (hh - yT - 0.2 * h);
      if (decorated && Math.abs(px) < 0.36 * w) px = (px < 0 ? -1 : 1) * (0.36 * w + R() * 0.08 * w);
      ctx.beginPath(); ctx.ellipse(px, py, (0.012 + R() * 0.01) * h, (0.009 + R() * 0.007) * h, R(), 0, PI2); ctx.fill();
    }
    // top face: lighter band from the scallop crests down to yT, with a curved rim line
    ctx.fillStyle = C.top;
    ctx.beginPath(); ctx.moveTo(-hw - 4, -hh - 6); ctx.lineTo(hw + 4, -hh - 6); ctx.lineTo(hw + 4, yT);
    ctx.quadraticCurveTo(0, yT + 0.035 * h, -hw - 4, yT); ctx.closePath(); ctx.fill();
    // each scallop bump: a soft lighter dome so the ridge reads as rounded shell lobes
    ctx.fillStyle = rgba('#FFFFFF', C.colour ? 0.28 : 0.5);
    for (i = 0; i < sc.length; i++) {
      var mx = (sc[i].x0 + sc[i].x1) / 2, bw2 = (sc[i].x1 - sc[i].x0) / 2;
      ctx.beginPath(); ctx.ellipse(mx - bw2 * 0.12, yb - bh * sc[i].k * 0.5, bw2 * 0.45, bh * 0.45, 0, 0, PI2); ctx.fill();
    }
    ctx.strokeStyle = rgba(C.line, 0.7); ctx.lineWidth = Math.max(1.2, lw * 0.5);
    ctx.beginPath(); ctx.moveTo(-hw, yT); ctx.quadraticCurveTo(0, yT + 0.035 * h, hw, yT); ctx.stroke();
    // gloss: a streak on the top face + a soft highlight upper-left of the front
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.ellipse(-hw + 0.22 * w, yb + 0.02 * h, 0.12 * w, 0.018 * h, -0.02, 0, PI2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.24)';
    ctx.beginPath(); ctx.ellipse(-hw + 0.085 * w, yT + 0.28 * h, 0.03 * w, 0.16 * h, 0, 0, PI2); ctx.fill();
    // a tiny barnacle / pearl in one corner (side by seed)
    var side = (seed & 1) ? 1 : -1;
    if (C.colour) barnacle(ctx, side * (hw - 0.075 * w - 0.03 * h), hh - 0.17 * h, 0.05 * h, C);
    else if (decorated !== 'busy') barnacle(ctx, side * (hw - 0.075 * w - 0.02 * h), hh - 0.2 * h, 0.05 * h, C);
    ctx.restore();
    // crisp outer outline on top
    ctx.save(); bodyPath(ctx, w, h, seed); ctx.lineJoin = 'round'; ctx.lineWidth = lw; ctx.strokeStyle = C.line; ctx.stroke(); ctx.restore();
  }

  // ---------------------------------------------------------------- shapes
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
    shapePath(ctx, shape, r);                                    // cream halo so it pops off the sand
    ctx.lineWidth = lw * 2.6; ctx.strokeStyle = HALO; ctx.stroke();
    ctx.lineWidth = lw; ctx.strokeStyle = c.dark; ctx.stroke();
    ctx.fillStyle = c.base; ctx.fill();
    ctx.clip();
    ctx.fillStyle = rgba(c.dark, 0.25);                          // cel shade lower-right
    ctx.beginPath(); ctx.ellipse(r * 0.55, r * 0.75, r * 1.3, r * 0.7, -0.5, 0, PI2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';                    // highlight upper-left
    ctx.beginPath(); ctx.ellipse(-r * 0.38, -r * 0.42, r * 0.32, r * 0.15, -0.6, 0, PI2); ctx.fill();
    ctx.restore();
    ctx.save(); shapePath(ctx, shape, r); ctx.lineJoin = 'round'; ctx.lineWidth = lw * 0.55; ctx.strokeStyle = c.dark; ctx.stroke(); ctx.restore();
  }

  // ---------------------------------------------------------------- pearl dots
  var DICE = {
    1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
    6: [[-1, -1], [0, -1], [1, -1], [-1, 1], [0, 1], [1, 1]]
  };
  function pearlDot(ctx, x, y, r, shadow) {
    if (shadow !== 0) { ctx.fillStyle = 'rgba(70,50,30,' + (shadow == null ? 0.2 : 0.2 * shadow) + ')'; ctx.beginPath(); ctx.arc(x + r * 0.16, y + r * 0.26, r * 1.08, 0, PI2); ctx.fill(); }
    ctx.fillStyle = PEARL.rim; ctx.beginPath(); ctx.arc(x, y, r, 0, PI2); ctx.fill();
    ctx.fillStyle = PEARL.fill; ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0, PI2); ctx.fill();
    ctx.fillStyle = PEARL.sheen; ctx.beginPath(); ctx.arc(x + r * 0.18, y + r * 0.22, r * 0.5, 0, PI2); ctx.fill();
    ctx.fillStyle = PEARL.fill; ctx.beginPath(); ctx.arc(x - r * 0.06, y - r * 0.06, r * 0.5, 0, PI2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,1)'; ctx.beginPath(); ctx.ellipse(x - r * 0.32, y - r * 0.34, r * 0.24, r * 0.16, -0.6, 0, PI2); ctx.fill();
  }
  // n 1–6: dice layout (6 = two rows of 3); 7–10: ten-frame (5 on top, the rest below)
  function drawPearlDots(ctx, n, LH, cx, cy, scale) {
    n = Math.max(1, Math.min(10, n | 0)); scale = scale || 1;
    var i, r, d;
    if (n <= 6) {
      r = (n <= 3 ? 0.12 : n <= 5 ? 0.108 : 0.1) * LH * scale;
      var dx = (n === 6 ? 0.28 : 0.27) * LH * scale, dy = 0.2 * LH * scale;
      if (n === 6) dy = 0.14 * LH * scale;
      for (i = 0; i < DICE[n].length; i++) pearlDot(ctx, cx + DICE[n][i][0] * dx, cy + DICE[n][i][1] * dy, r);
      return;
    }
    r = 0.095 * LH * scale; d = 0.24 * LH * scale;
    var dyy = 0.15 * LH * scale;
    for (i = 0; i < 5; i++) pearlDot(ctx, cx + (i - 2) * d, cy - dyy, r);
    for (i = 0; i < n - 5; i++) pearlDot(ctx, cx + (i - 2) * d, cy + dyy, r);
  }
  // small counting pearls beside a numeral: rows of up to 5 (two rows from 6)
  function drawDotGrid(ctx, n, LH, cx, cy, maxW) {
    n = Math.max(0, Math.min(10, n | 0)); if (!n) return;
    var rows = n > 5 ? 2 : 1, cols = rows > 1 ? 5 : n;
    var gap = Math.min(0.24 * LH, maxW / Math.max(cols, 3)), r = Math.min(0.095 * LH, gap * 0.44);
    for (var k = 0; k < rows; k++) {
      var cnt = rows > 1 ? (k ? n - 5 : 5) : n, y = cy + (rows > 1 ? (k - 0.5) * Math.max(0.23 * LH, r * 3) : 0);
      for (var i = 0; i < cnt; i++) pearlDot(ctx, cx + (i - (cols - 1) / 2) * gap, y, r);
    }
  }

  // ---------------------------------------------------------------- dark-teal lettering with a cream edge
  function drawLabel(ctx, txt, cx, cy, maxH, maxW, col) {
    txt = String(txt);
    var fs = Math.round(maxH);
    ctx.font = 'bold ' + fs + 'px ' + FONT;
    var w = ctx.measureText ? ctx.measureText(txt).width : fs * txt.length * 0.6;
    if (w > maxW) { fs = Math.floor(fs * maxW / w); ctx.font = 'bold ' + fs + 'px ' + FONT; }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var y = cy + fs * 0.05;
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, fs * 0.17); ctx.strokeStyle = HALO; ctx.strokeText(txt, cx, y);      // cream edge
    ctx.lineWidth = Math.max(1.5, fs * 0.06); ctx.strokeStyle = col; ctx.strokeText(txt, cx, y);     // chunky weight
    ctx.fillStyle = col; ctx.fillText(txt, cx, y);
    ctx.save();                                                                                      // soft top sheen
    ctx.globalAlpha = 0.22; ctx.fillStyle = '#FFFFFF'; ctx.fillText(txt, cx - fs * 0.025, y - fs * 0.04);
    ctx.globalAlpha = 1; ctx.fillStyle = col; ctx.fillText(txt, cx + fs * 0.01, y + fs * 0.01);
    ctx.restore();
  }

  // ---------------------------------------------------------------- animal sticker (or a placeholder fish)
  function drawSticker(ctx, img, size, cx, cy) {
    if (img) { ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size); return; }
    ctx.save(); ctx.translate(cx, cy);
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(0, 0, size * 0.44, 0, PI2); ctx.fill();
    drawSprinkle(ctx, size * 0.62, '#7FD3C4', 0);
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
  function decoCentre(LH) { return 0.08 * LH; }

  function paintBlock(ctx, b, LW, LH, seed, imgFn) {
    var C = blockColors(b), deco = !C.colour;
    drawShellBlock(ctx, LW, LH, C, seed, deco && (b.showDots || b.kind === 'parity' || (b.kind === 'dots' && (b.n || +b.value) > 6)) ? 'busy' : deco);
    if (!deco) return;
    var cy = decoCentre(LH), lw = lineW(LH);
    var ink = b.color && b.kind !== 'shape' && b.kind !== 'size' && pal(b.color) ? pal(b.color).dark : INK;
    switch (b.kind) {
      case 'shape':
        ctx.save(); ctx.translate(0, cy);
        drawShape(ctx, b.shape || b.value, 0.28 * LH, pal(b.color || 'red'), lw * 1.15);
        ctx.restore();
        break;
      case 'dots':
        drawPearlDots(ctx, b.n != null ? b.n : +b.value, LH, 0, cy + 0.01 * LH);
        break;
      case 'number':
        var num = b.text != null ? b.text : (b.n != null ? b.n : b.value), nn = b.n != null ? b.n : +b.value;
        if (b.showDots && nn > 0) {
          var fs = Math.round((String(num).length > 1 ? 0.5 : 0.62) * LH);
          ctx.font = 'bold ' + fs + 'px ' + FONT;
          var nw = Math.min(0.34 * LW, ctx.measureText ? ctx.measureText(String(num)).width : fs * 0.6 * String(num).length);
          var left = -LW / 2 + lw + 0.045 * LW, nx = left + nw / 2;
          drawLabel(ctx, num, nx, cy, fs, 0.34 * LW, ink);
          var a0 = left + nw + 0.05 * LW, a1 = LW / 2 - lw - 0.035 * LW;
          drawDotGrid(ctx, nn, LH, (a0 + a1) / 2, cy, a1 - a0);
        } else drawLabel(ctx, num, 0, cy, 0.66 * LH, 0.8 * LW, ink);
        break;
      case 'letter':
        drawLabel(ctx, b.text != null ? b.text : b.value, 0, cy, 0.66 * LH, 0.8 * LW, ink);
        break;
      case 'animal':
      case 'size':
        var an = b.animal || b.value;
        drawSticker(ctx, imgFn ? imgFn('animal_' + an) : null, 0.84 * LH, 0, cy);
        break;
      case 'text':
        var t = String(b.text != null ? b.text : b.value);
        drawLabel(ctx, t, 0, cy, (t.length > 6 ? 0.4 : t.length > 3 ? 0.5 : 0.62) * LH, 0.84 * LW, ink);
        break;
      case 'parity':
        if (b.text != null) { drawLabel(ctx, b.text, 0, cy, 0.5 * LH, 0.84 * LW, ink); break; }
        // pairs icon: even = 2 pairs, odd = 2 pairs + 1 alone
        var odd = (b.value === 'odd'), r = 0.08 * LH, g = 0.24 * LH, cols = odd ? 3 : 2, x0 = -(cols - 1) / 2 * 0.3 * LH;
        for (var p = 0; p < cols; p++) for (var q = 0; q < 2; q++) if (!(odd && p === 2 && q === 1)) pearlDot(ctx, x0 + p * 0.3 * LH, cy + (q - 0.5) * g, r);
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

  /** Drawn size of a block (after the small-size scale). */
  function layerSize(b, LW, LH) { var s = blockScale(b); return { w: Math.round(LW * s), h: Math.round(LH * s) }; }

  // ---------------------------------------------------------------- public
  function drawBlock(ctx, block, LW, LH, opt) {
    if (!block) return;
    if (typeof LH !== 'number') {                                // old API: drawBlock(ctx, block, S, opt)
      opt = LH; var S = LW; LW = Math.round(1.12 * S); LH = Math.round(0.8 * S);
    }
    opt = opt || {};
    var sc = blockScale(block), w = LW * sc, h = LH * sc;
    var glow = +opt.glow || 0, lift = +opt.lift || 0, seed = seedOf(block, opt);
    if (glow > 0.01) drawGlow(ctx, w, h, opt.t != null ? opt.t : nowSec(), glow);
    var dpr = opt.dpr || 1, entry = null;
    if (opt.cache !== false) entry = faceCanvas(block, w, h, dpr, seed, opt.img);
    if (entry) ctx.drawImage(entry.canvas, -entry.w / 2, -entry.h / 2, entry.w, entry.h);
    else paintBlock(ctx, block, w, h, seed, opt.img);
    if (lift > 0.01) {                                           // lifted: a cool watery sheen
      ctx.save(); bodyPath(ctx, w, h, seed); ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(210,245,255,' + (0.14 * Math.min(1, lift)).toFixed(3) + ')';
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

  // ---------------------------------------------------------------- bubble
  function drawBubble(ctx, r, a) {
    a = a == null ? 1 : clamp01(a);
    if (!(a > 0.003) || !(r > 0.3)) return;
    ctx.save();
    if (ctx.createRadialGradient) {
      var g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
      g.addColorStop(0, 'rgba(255,255,255,' + (0.05 * a).toFixed(3) + ')');
      g.addColorStop(0.75, 'rgba(200,240,255,' + (0.14 * a).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(180,232,250,' + (0.32 * a).toFixed(3) + ')');
      ctx.fillStyle = g;
    } else ctx.fillStyle = 'rgba(200,240,255,' + (0.15 * a).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, PI2); ctx.fill();
    var lw = Math.max(1, r * 0.06);
    ctx.lineWidth = lw; ctx.strokeStyle = 'rgba(255,255,255,' + (0.85 * a).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(0, 0, r - lw / 2, 0, PI2); ctx.stroke();
    ctx.lineWidth = Math.max(0.8, r * 0.035); ctx.strokeStyle = 'rgba(90,170,200,' + (0.35 * a).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(0, 0, r - lw * 1.4, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();        // faint inner rim below
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1.2, Math.min(r * 0.12, 1.5 + r * 0.05)); ctx.strokeStyle = 'rgba(255,255,255,' + (0.9 * a).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.7, 1.08 * Math.PI, 1.4 * Math.PI); ctx.stroke();               // highlight arc
    ctx.fillStyle = 'rgba(255,255,255,' + (0.95 * a).toFixed(3) + ')';
    ctx.beginPath(); ctx.arc(-r * 0.22, -r * 0.6, Math.max(0.7, r * 0.08), 0, PI2); ctx.fill();
    ctx.fillStyle = 'rgba(255,214,240,' + (0.35 * a).toFixed(3) + ')';                                   // soap sheen
    ctx.beginPath(); ctx.ellipse(r * 0.45, r * 0.42, r * 0.22, r * 0.1, -0.8, 0, PI2); ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------- pearl on a tiny shell
  var SHELL = { fill: '#F8E6D0', line: '#B98A6A', inner: '#FBD3D3' };
  function sparkle(ctx, x, y, s, a) {
    if (a <= 0.01) return;
    ctx.fillStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
    ctx.beginPath();
    ctx.moveTo(x, y - s); ctx.quadraticCurveTo(x, y, x + s, y); ctx.quadraticCurveTo(x, y, x, y + s);
    ctx.quadraticCurveTo(x, y, x - s, y); ctx.quadraticCurveTo(x, y, x, y - s); ctx.fill();
  }
  function drawShellCup(ctx, w, hgt) {                        // a tiny open scallop, origin = bottom centre
    var hw = w / 2, lw = Math.max(1, w * 0.07);
    ctx.save(); ctx.lineJoin = 'round';
    // back half (open lid) behind the pearl
    ctx.beginPath(); ctx.moveTo(-hw * 0.9, -hgt * 0.62);
    ctx.quadraticCurveTo(0, -hgt * 1.9, hw * 0.9, -hgt * 0.62); ctx.closePath();
    ctx.fillStyle = SHELL.inner; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = SHELL.line; ctx.stroke();
    ctx.restore();
  }
  function drawShellFront(ctx, w, hgt) {
    var hw = w / 2, lw = Math.max(1, w * 0.07);
    ctx.save(); ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-hw, -hgt * 0.62);
    ctx.quadraticCurveTo(-hw * 0.85, 0, 0, 0); ctx.quadraticCurveTo(hw * 0.85, 0, hw, -hgt * 0.62);
    ctx.quadraticCurveTo(0, -hgt * 0.45, -hw, -hgt * 0.62); ctx.closePath();
    ctx.fillStyle = SHELL.fill; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = SHELL.line; ctx.stroke();
    ctx.strokeStyle = rgba(SHELL.line, 0.55); ctx.lineWidth = Math.max(0.7, lw * 0.6);
    ctx.beginPath(); ctx.moveTo(0, -hgt * 0.08); ctx.lineTo(0, -hgt * 0.5);
    ctx.moveTo(-hw * 0.2, -hgt * 0.1); ctx.lineTo(-hw * 0.55, -hgt * 0.52); ctx.moveTo(hw * 0.2, -hgt * 0.1); ctx.lineTo(hw * 0.55, -hgt * 0.52);
    ctx.stroke();
    ctx.restore();
  }
  function drawPearl(ctx, h, lit, out, t) {
    lit = clamp01(lit == null ? 1 : lit); out = clamp01(out || 0); t = t || 0;
    var w = Math.max(8, h * 0.4), sh = Math.max(4, h * 0.21), r = Math.max(3.5, h * 0.19);
    var py0 = -sh * 0.6 - r * 0.85;                              // resting pearl centre
    var e = out * out * (3 - 2 * out);
    var py = py0 - 1.2 * h * e + Math.sin(t * 3) * 0.04 * h * e, px = Math.sin(out * 7) * 0.08 * h * out;
    var pa = out < 0.75 ? 1 : clamp01(1 - (out - 0.75) / 0.17);   // pearl + bubble gone by out ≈ 0.92 (pop)
    var shellA = clamp01(1 - Math.max(0, out - 0.6) / 0.4);
    ctx.save();
    if (shellA > 0.01) { ctx.save(); ctx.globalAlpha *= shellA; drawShellCup(ctx, w, sh); ctx.restore(); }
    // glow halo
    var gl = lit * (1 - out * 0.6) * pa, tw = 0.85 + 0.15 * Math.sin(t * 6.3);
    if (gl > 0.01 && ctx.createRadialGradient) {
      var gr = r * 3.2 * tw, grd = ctx.createRadialGradient(px, py, r * 0.5, px, py, gr);
      grd.addColorStop(0, 'rgba(255,248,220,' + (0.75 * gl).toFixed(3) + ')');
      grd.addColorStop(0.5, 'rgba(240,220,255,' + (0.3 * gl).toFixed(3) + ')');
      grd.addColorStop(1, 'rgba(240,220,255,0)');
      ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(px, py, gr, 0, PI2); ctx.fill();
    }
    if (pa > 0.01) {
      ctx.save(); ctx.globalAlpha *= pa;
      // the pearl: dull lilac-grey when unlit → bright white with a pink-blue sheen
      var body = mix('#CFC8DD', '#FBF8FF', lit), rim = mix('#9C95B8', '#B9AED6', lit);
      ctx.fillStyle = rim; ctx.beginPath(); ctx.arc(px, py, r, 0, PI2); ctx.fill();
      ctx.fillStyle = body; ctx.beginPath(); ctx.arc(px - r * 0.04, py - r * 0.05, r * 0.86, 0, PI2); ctx.fill();
      ctx.fillStyle = rgba('#FFC9E3', 0.55 * lit); ctx.beginPath(); ctx.ellipse(px + r * 0.3, py + r * 0.35, r * 0.42, r * 0.28, -0.5, 0, PI2); ctx.fill();
      ctx.fillStyle = rgba('#BFE6FF', 0.6 * lit); ctx.beginPath(); ctx.ellipse(px - r * 0.42, py + r * 0.22, r * 0.2, r * 0.32, 0.3, 0, PI2); ctx.fill();
      ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.ellipse(px - r * 0.3, py - r * 0.36, r * 0.3, r * 0.2, -0.6, 0, PI2); ctx.fill();
      if (lit > 0.5) sparkle(ctx, px + r * 0.95, py - r * 1.0, r * (0.5 + 0.35 * Math.sin(t * 5.1)), (lit - 0.5) * 2 * (0.6 + 0.4 * Math.sin(t * 4.3)));
      // the bubble wrapping it as it floats away
      if (out > 0.04) {
        ctx.save(); ctx.translate(px, py);
        drawBubble(ctx, r * (1.6 + 0.25 * clamp01(out * 3)), clamp01(out * 4));
        ctx.restore();
      }
      ctx.restore();
    }
    if (out > 0.85 && out < 1) {                                // pop: a little ring of sparkles
      var k = (out - 0.85) / 0.15, sa = 1 - k;
      for (var i = 0; i < 6; i++) {
        var an = i / 6 * PI2 + 0.3, rr = r * (1.6 + 2.2 * k);
        sparkle(ctx, px + Math.cos(an) * rr, py + Math.sin(an) * rr, r * 0.55 * (1 - k * 0.5), sa);
      }
    }
    if (shellA > 0.01) { ctx.save(); ctx.globalAlpha *= shellA; drawShellFront(ctx, w, sh); ctx.restore(); }
    ctx.restore();
  }
  /** Legacy: drawFlame(ctx, size, lit, out, t) → a twinkling light at the origin (no fire under water). */
  function drawFlame(ctx, size, lit, out, t) {
    lit = clamp01(lit == null ? 1 : lit) * clamp01(1 - (out || 0));
    if (lit <= 0.01) return;
    ctx.save();
    sparkle(ctx, 0, -size * 0.4, size * 0.4 * (0.8 + 0.2 * Math.sin((t || 0) * 6)), lit);
    ctx.restore();
  }

  // ---------------------------------------------------------------- plate: a flat sandy shell tray
  function drawPlate(ctx, w, h) {
    var hw = w / 2, ry = h * 0.36, th = h * 0.32, lw = Math.max(2, h * 0.07);
    var TOPC = '#F6E6C4', RIM = '#E6CC9A', LINE = '#B98A4E', RIB = '#FBF1DA';
    var n = 12;
    function edge(y0, k) {                                      // scalloped front edge of the tray (k = depth)
      ctx.moveTo(-hw, y0);
      for (var i = 0; i < n; i++) {
        var a0 = Math.PI - i / n * Math.PI, a1 = Math.PI - (i + 1) / n * Math.PI, am = (a0 + a1) / 2;
        var x1 = Math.cos(a1) * hw, y1 = y0 + Math.sin(a1) * ry;
        var xm = Math.cos(am) * hw * 1.03, ym = y0 + Math.sin(am) * ry + k;
        ctx.quadraticCurveTo(xm, ym, x1, y1);
      }
    }
    ctx.save(); ctx.lineJoin = 'round';
    ctx.fillStyle = 'rgba(80,60,30,0.14)';                                          // soft shadow on the sand
    ctx.beginPath(); ctx.ellipse(0, th + ry * 0.6, hw * 0.98, ry * 0.7, 0, 0, PI2); ctx.fill();
    // rim (thickness) with a scalloped lower edge
    ctx.beginPath(); ctx.moveTo(hw, 0); ctx.lineTo(-hw, 0); ctx.lineTo(-hw, th);
    edge(th, ry * 0.25); ctx.lineTo(hw, 0); ctx.closePath();
    ctx.fillStyle = RIM; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = LINE; ctx.stroke();
    // top surface + radial ribs + a darker inner rim
    ctx.beginPath(); ctx.ellipse(0, 0, hw, ry, 0, 0, PI2);
    ctx.fillStyle = TOPC; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = LINE; ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.ellipse(0, 0, hw * 0.94, ry * 0.86, 0, 0, PI2); ctx.clip();
    ctx.strokeStyle = RIB; ctx.lineWidth = Math.max(1.5, h * 0.06); ctx.lineCap = 'round';
    for (var i = 0; i <= 10; i++) {
      var a = Math.PI * 0.08 + i / 10 * Math.PI * 0.84;
      ctx.beginPath(); ctx.moveTo(0, ry * 1.4); ctx.lineTo(Math.cos(a) * hw * 1.1, ry * 1.4 - Math.sin(a) * ry * 2.6); ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = rgba(LINE, 0.45); ctx.lineWidth = Math.max(1, lw * 0.6);
    ctx.beginPath(); ctx.ellipse(0, 0, hw * 0.94, ry * 0.86, 0, 0, PI2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.ellipse(-hw * 0.45, -ry * 0.42, hw * 0.2, ry * 0.14, -0.1, 0, PI2); ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------- confetti: a tiny fish
  function drawSprinkle(ctx, len, color, rot) {
    var c = color && color[0] === '#' ? { base: color, dark: mix(color, '#000000', 0.3) } : pal(color || 'pink');
    var L = Math.max(4, len), bh = L * 0.36, lw = Math.max(0.8, L * 0.06);
    ctx.save(); ctx.rotate(rot || 0); ctx.lineJoin = 'round';
    // tail (behind, at -x) and body (head at +x)
    ctx.beginPath();
    ctx.moveTo(-L * 0.28, 0); ctx.lineTo(-L * 0.5, -bh * 0.62); ctx.quadraticCurveTo(-L * 0.44, 0, -L * 0.5, bh * 0.62); ctx.closePath();
    ctx.fillStyle = c.base; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = c.dark; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(L * 0.06, 0, L * 0.36, bh / 2, 0, 0, PI2);
    ctx.fillStyle = c.base; ctx.fill(); ctx.stroke();
    if (L >= 10) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';                  // belly sheen
      ctx.beginPath(); ctx.ellipse(L * 0.04, -bh * 0.17, L * 0.2, bh * 0.12, 0, 0, PI2); ctx.fill();
    }
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(L * 0.24, -bh * 0.06, Math.max(0.9, bh * 0.2), 0, PI2); ctx.fill();
    ctx.fillStyle = '#2F2A3A'; ctx.beginPath(); ctx.arc(L * 0.255, -bh * 0.05, Math.max(0.6, bh * 0.12), 0, PI2); ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------- ghost hand (taps)
  function drawGhostHand(ctx, size, t) {
    var s = size, F = '#FFF4E4', L = '#B9835A', SH = '#F1D6B8';
    t = t || 0;
    var P = 1.1, ph = (t % P) / P;                               // one tap per 1.1 s
    // hover high (0..0.35) → press down (0.35..0.5) → hold (0.5..0.6) → lift (0.6..1)
    var lift;
    if (ph < 0.35) lift = 1;
    else if (ph < 0.5) { var k = (ph - 0.35) / 0.15; lift = 1 - k * k; }
    else if (ph < 0.6) lift = 0;
    else { var u = (ph - 0.6) / 0.4; lift = u * u * (3 - 2 * u); }
    ctx.save();
    // ripple ring at the fingertip after contact
    if (ph >= 0.5) {
      var rp = (ph - 0.5) / 0.5;
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.85 * (1 - rp)).toFixed(3) + ')'; ctx.lineWidth = s * 0.035;
      ctx.beginPath(); ctx.ellipse(0, 0, s * (0.08 + 0.26 * rp), s * (0.05 + 0.15 * rp), 0, 0, PI2); ctx.stroke();
    }
    ctx.translate(0, s * 0.2 * lift);
    var sq = 1 - 0.05 * (1 - lift);                              // tiny squash on contact
    ctx.scale(1 + (1 - sq) * 0.6, sq);
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
    ctx.globalAlpha *= 0.95;
    hand(); ctx.lineWidth = s * 0.07; ctx.strokeStyle = L; ctx.stroke();
    hand(); ctx.fillStyle = F; ctx.fill();
    ctx.strokeStyle = SH; ctx.lineWidth = s * 0.03;
    ctx.beginPath(); ctx.moveTo(0, s * 0.5); ctx.lineTo(s * 0.18, s * 0.5); ctx.moveTo(0, s * 0.62); ctx.lineTo(s * 0.18, s * 0.62); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.ellipse(-s * 0.03, s * 0.12, s * 0.025, s * 0.07, 0, 0, PI2); ctx.fill();
    ctx.fillStyle = '#9ED8CB'; ctx.strokeStyle = '#5FA597'; ctx.lineWidth = s * 0.04;          // Pip's mint cuff
    ctx.beginPath(); rr(-s * 0.24, s * 0.76, s * 0.44, s * 0.14, s * 0.05); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------- legacy: drawFlower → a little sea anemone
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
    for (var pass = 0; pass < 2; pass++) for (var i = 0; i < 8; i++) {
      ctx.save(); ctx.rotate(i * PI2 / 8 - Math.PI / 2);
      ctx.beginPath(); ctx.ellipse(r * 0.55, 0, r * 0.45, r * 0.16, 0, 0, PI2);
      if (pass === 0) ctx.stroke(); else { ctx.fillStyle = c.petal; ctx.fill(); }
      ctx.restore();
    }
    ctx.fillStyle = c.mid; ctx.beginPath(); ctx.arc(0, 0, r * 0.26, 0, PI2); ctx.fill();
    ctx.restore();
  }

  RT.BlockArt = {
    drawBlock: drawBlock, drawGhostHand: drawGhostHand, drawPearl: drawPearl, drawFlame: drawFlame, drawPlate: drawPlate,
    drawSprinkle: drawSprinkle, drawBubble: drawBubble, drawGlow: drawGlow,
    drawLeafPad: drawPlate, drawFlower: drawFlower,
    get COLORS() { return palette(); },
    faceRect: faceRect, blockScale: blockScale, layerSize: layerSize, shapePath: shapePath, bodyPath: bodyPath,
    clearCache: function () { cache = {}; cacheN = 0; },
    SAND: SAND, VANILLA: VANILLA, INK: INK, FONT: FONT, SMALL: SMALL, TOP: TOP, _mix: mix
  };
})(typeof window !== 'undefined' ? (window.RT = window.RT || {}) : (globalThis.RT = globalThis.RT || {}));
