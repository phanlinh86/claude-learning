// GW.GigiArt — Gigi's code-drawn neck + sprite anchors (character artist A). See docs/DESIGN.md §4.1, §6.3.
// Classic script; safe to require() / vm-run in node (it never touches document; draw calls only use the ctx passed in).
//
//   ANCHORS = { body: {w:256, h:256, feet:[128,244], socket:[172,96], neckW:56},
//               head: {w:192, h:192, joint:[70,160], box:0.62} }
//     body svg: draw the 256 box scaled by s = h/256 so that feet lands on layout.gigi (x, y);
//               socket (in world px) = feet + (socket − feet)·s.
//     head svg: head box side = 0.62·h (hs = 0.62·h/192); translate to the joint, rotate(headAngle), draw at −joint·hs.
//   thickFor(h)                         recommended neck thickness for body height h (= neckW·h/256 = 0.21875·h)
//   drawNeck(ctx, bx, by, hx, hy, thick, opt)
//     tapered spotted neck from the socket (bx,by) to the head joint (hx,hy) in the current transform.
//     thick = width at the base (top = 0.72·thick). opt: { bend −1..1 (S-curve, default 0.25), lw (outline px, default
//     thick·4.2/56 = the SVG outline at the same scale), alpha }. The base end is a round coat-coloured cap that hides
//     the body stub's round top; the top end is hidden under the head's jowl (no outline drawn there).
//     Fast: no allocations per call (module-level typed arrays, no closures, no strings built).
//   headAngle(bx, by, hx, hy) → radians (|a| ≤ 0.35): head leans forward when the neck reaches right, back when left.
//   COLORS                              the palette used (DESIGN §3)
(function (GW) {
  'use strict';

  var COLORS = {
    coat: '#F3CE85', shade: '#E3B465', patch: '#B97A3F', line: '#7E5226', mane: '#9C6532', hi: '#FFF1CF',
    muzzle: '#FBEBCB', knob: '#6B4421', hoof: '#6B4421', scarf: '#7CCFB8', scarfDk: '#4C9C88'
  };
  var NECK_W = 56, SVG_LW = 4.2, TOP = 0.72;
  var ANCHORS = {
    body: { w: 256, h: 256, feet: [128, 244], socket: [172, 96], neckW: NECK_W },
    head: { w: 192, h: 192, joint: [70, 160], box: 0.62 }
  };
  var REST_X = 0.12, REST_Y = -0.6;               // DESIGN §6.2 rest pose (head joint = socket + rest·h)
  var BASE_X = 0.09 / Math.sqrt(1.0081), BASE_Y = -1 / Math.sqrt(1.0081);   // stub axis in the body svg
  var REST_LEAN = Math.atan2(REST_X, -REST_Y);

  // patches: [t along the neck, side (−1 back … +1 front, × half width), length factor, width factor]
  var PATCHES = [0.12, 0.30, 1.0, 1.0, 0.30, -0.32, 0.9, 1.1, 0.48, 0.36, 1.1, 0.9,
    0.66, -0.28, 0.95, 1.0, 0.84, 0.30, 0.85, 0.9, 1.0, -0.30, 0.8, 0.9];
  var NP = PATCHES.length / 4;

  var DASH = [0, 0], NODASH = [];
  var N = 16;
  var PX = new Float64Array(N + 1), PY = new Float64Array(N + 1);
  var TX = new Float64Array(N + 1), TY = new Float64Array(N + 1), WW = new Float64Array(N + 1);

  function sample(bx, by, hx, hy, bend) {
    var dx = hx - bx, dy = hy - by;
    var len = Math.sqrt(dx * dx + dy * dy);
    var ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
    var k = bend * len * 0.13;
    // the neck leaves the socket along the body stub (BASE_X/Y), then curves towards the head
    var c1x = bx + (ux * 0.4 + BASE_X * 0.6) * len * 0.38 + nx * k, c1y = by + (uy * 0.4 + BASE_Y * 0.6) * len * 0.38 + ny * k;
    var c2x = bx + dx * 2 / 3 - nx * k, c2y = by + dy * 2 / 3 - ny * k;
    for (var i = 0; i <= N; i++) {
      var t = i / N, mt = 1 - t;
      var a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t;
      PX[i] = a * bx + b * c1x + c * c2x + d * hx;
      PY[i] = a * by + b * c1y + c * c2y + d * hy;
      var tx = 3 * mt * mt * (c1x - bx) + 6 * mt * t * (c2x - c1x) + 3 * t * t * (hx - c2x);
      var ty = 3 * mt * mt * (c1y - by) + 6 * mt * t * (c2y - c1y) + 3 * t * t * (hy - c2y);
      var tl = Math.sqrt(tx * tx + ty * ty) || 1;
      TX[i] = tx / tl; TY[i] = ty / tl;
    }
    return len;
  }

  // edge polyline: side −1 = back (mane side), +1 = front; off = extra offset outward (px), from i0 to i1
  function edge(ctx, side, wk, off, i0, i1, move) {
    for (var i = i0; i <= i1; i++) {
      var r = WW[i] * wk + off;
      var x = PX[i] - TY[i] * side * r, y = PY[i] + TX[i] * side * r;
      if (i === i0 && move) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  }
  function edgeBack(ctx, side, wk, i0, i1) {   // same, walking backwards (for closing the outline polygon)
    for (var i = i1; i >= i0; i--) {
      var r = WW[i] * wk;
      ctx.lineTo(PX[i] - TY[i] * side * r, PY[i] + TX[i] * side * r);
    }
  }
  // the mane starts ext px below the socket along the stub axis, exactly over the body stub's mane strip
  function maneStart(ctx, bx, by, r, ext) {
    ctx.moveTo(bx - BASE_X * ext + BASE_Y * r, by - BASE_Y * ext - BASE_X * r);
  }
  function bodyPath(ctx) {
    ctx.beginPath();
    edge(ctx, -1, 1, 0, 0, N, true);
    edgeBack(ctx, 1, 1, 0, N);
    ctx.closePath();
  }

  function drawNeck(ctx, bx, by, hx, hy, thick, opt) {
    if (!(thick > 0)) return;
    var dx = hx - bx, dy = hy - by;
    if (dx * dx + dy * dy < 1) return;
    var bend = opt && typeof opt.bend === 'number' ? Math.max(-1, Math.min(1, opt.bend)) : 0.25;
    var lw = opt && opt.lw > 0 ? opt.lw : thick * SVG_LW / NECK_W;
    var len = sample(bx, by, hx, hy, bend);
    var i, half = thick * 0.5;
    for (i = 0; i <= N; i++) WW[i] = half * (1 - (1 - TOP) * i / N);

    ctx.save();
    if (opt && typeof opt.alpha === 'number') ctx.globalAlpha *= opt.alpha;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 1. mane strip just outside the back edge (outline, then colour); the coat fill covers its inner half
    var mo = thick * 0.06, mw = thick * 0.2, ext = thick * 0.6;
    ctx.beginPath();
    maneStart(ctx, bx, by, half + mo, ext);
    edge(ctx, -1, 1, mo, 0, N, false);
    ctx.lineCap = 'butt';     // flat outline end at the socket: the body stub's mane continues below it
    ctx.strokeStyle = COLORS.line; ctx.lineWidth = mw + 2 * lw; ctx.stroke();
    ctx.lineCap = 'round';    // round colour end covers the stub mane's outline cap -> seamless strip
    ctx.strokeStyle = COLORS.mane; ctx.lineWidth = mw; ctx.stroke();
    // tuft notches across the outer half of the mane (dash pattern reused, no allocation)
    DASH[0] = lw * 0.8; DASH[1] = thick * 0.3;
    ctx.beginPath();
    maneStart(ctx, bx, by, half + mo + mw * 0.25, ext);
    edge(ctx, -1, 1, mo + mw * 0.25, 0, N, false);
    ctx.setLineDash(DASH); ctx.lineCap = 'butt';
    ctx.strokeStyle = COLORS.line; ctx.lineWidth = mw * 0.55; ctx.stroke();
    ctx.setLineDash(NODASH); ctx.lineCap = 'round';

    // 2. coat fill + round base cap (hides the stub's round top so the join is seamless in any direction)
    ctx.fillStyle = COLORS.coat;
    bodyPath(ctx);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(bx, by, Math.max(0.5, half - lw * 0.5), 0, Math.PI * 2);
    ctx.fill();

    // 3. inside the neck: cel shade on the front edge, caramel patches that stretch with the length, highlight
    ctx.save();
    bodyPath(ctx);
    ctx.clip();
    ctx.beginPath();
    edge(ctx, 1, 1, 0, 0, N, true);
    ctx.strokeStyle = COLORS.shade; ctx.lineWidth = thick * 0.36; ctx.stroke();
    ctx.fillStyle = COLORS.patch;
    var along = 0.36 * len / NP;
    for (var p = 0; p < NP; p++) {
      var pt = PATCHES[p * 4], side = PATCHES[p * 4 + 1];
      i = Math.min(N, Math.round(pt * N));
      var w = WW[i];
      var a = Math.max(w * 0.52, along) * PATCHES[p * 4 + 2];
      var b = w * 0.52 * PATCHES[p * 4 + 3];
      var cx = PX[i] - TY[i] * side * w, cy = PY[i] + TX[i] * side * w;
      // rounded-square patch in the neck's local frame (tx, ty) / (−ty, tx)
      var ax = TX[i] * a, ay = TY[i] * a, bxv = -TY[i] * b, byv = TX[i] * b;
      ctx.beginPath();
      ctx.moveTo(cx + ax, cy + ay);
      ctx.quadraticCurveTo(cx + (ax + bxv) * 0.95, cy + (ay + byv) * 0.95, cx + bxv, cy + byv);
      ctx.quadraticCurveTo(cx + (bxv - ax) * 0.95, cy + (byv - ay) * 0.95, cx - ax, cy - ay);
      ctx.quadraticCurveTo(cx - (ax + bxv) * 0.95, cy - (ay + byv) * 0.95, cx - bxv, cy - byv);
      ctx.quadraticCurveTo(cx + (ax - bxv) * 0.95, cy + (ay - byv) * 0.95, cx + ax, cy + ay);
      ctx.fill();
    }
    ctx.beginPath();
    edge(ctx, -1, 0.55, 0, 2, N - 3, true);
    ctx.globalAlpha *= 0.6;
    ctx.strokeStyle = COLORS.hi; ctx.lineWidth = thick * 0.08; ctx.stroke();
    ctx.restore();

    // 4. outline along both sides only (the base joins the body stub, the top hides under the head)
    ctx.strokeStyle = COLORS.line; ctx.lineWidth = lw;
    // (offset by lw/2 so the line sits just outside the fill, like the SVG union outlines -> no step at the socket)
    ctx.beginPath();
    edge(ctx, -1, 1, lw * 0.5, 0, N, true);
    edge(ctx, 1, 1, lw * 0.5, 0, N, true);
    ctx.stroke();
    ctx.restore();
  }

  function headAngle(bx, by, hx, hy) {
    var lean = Math.atan2(hx - bx, -(hy - by));
    var a = 0.55 * (lean - REST_LEAN);
    return a > 0.35 ? 0.35 : a < -0.35 ? -0.35 : a;
  }

  function thickFor(h) { return NECK_W * h / 256; }

  GW.GigiArt = {
    ANCHORS: ANCHORS, COLORS: COLORS, REST: { x: REST_X, y: REST_Y },
    drawNeck: drawNeck, headAngle: headAngle, thickFor: thickFor
  };
})(typeof window !== 'undefined' ? (window.GW = window.GW || {}) : (globalThis.GW = globalThis.GW || {}));
