// LL.LoloArt — Lolo the little monkey: code-drawn right arm + curly tail, sprite anchors (character artist A).
// See docs/DESIGN.md §4.1, §6.3. Classic script; node-safe at load (never touches document / window APIs; draw calls only
// use the ctx passed in; no allocations per draw call).
//
//   ANCHORS.body  sit/hop svg (256 box): feet [128,244], socket [128,118], shoulder [152,136], tail [84,220]
//   ANCHORS.hang  hang svg (256 box):    hand [128,18],  socket [128,118], tail [84,200]
//   ANCHORS.head  head svg (192 box):    joint [96,172], box 0.52 (= ANCHORS.headScale)
//     body svg drawn at s = h/256 with feet on layout.lolo; head box side = headScale·h (hs = headScale·h/192),
//     translate to the socket, rotate(tilt), drawImage at −joint·hs.
//   ANCHORS.arm   {rest: 74, reach: 116, restAng: 1.0, w: 18} in body units: arm length from the shoulder to the hand centre
//     (rest = hand on the knee, reach = fully pointing). armLen(h, ext) → px.
//   drawArm(ctx, sx, sy, ang, len, opt)  right arm from the shoulder (sx, sy) at screen angle ang (0 = right, −π/2 = up),
//     length len px to the hand centre: soft-bent tapered fur arm (outline) + peach mitten hand.
//     opt: {point (index finger out), scale (= h/150, default 1), bend (0..0.3, default 0.14), alpha}
//   drawTail(ctx, x, y, h, phase, opt)   long curly "?" tail from the root (x, y), body height h; phase (rad) animates the curl.
//     opt: {side −1 (default: goes left = behind a right-facing Lolo) | +1 (mirrored), hang (hangs down, tip curls), alpha}
//   headTilt(lean, lookX, lookY, x, y) → rad (|a| ≤ 0.3): looking up-right tilts the face up (negative), down → positive.
//   COLORS                                palette (DESIGN §3)
(function (LL) {
  'use strict';

  var COLORS = {
    fur: '#9A6A45', shade: '#7E5534', line: '#5A3A22', furHi: '#B88A63',
    peach: '#F6D2A8', peachSh: '#E8B988', peachLn: '#B07A4E',
    eye: '#2F2622', cheek: '#F5AFB4', bow: '#5FC7C9', bowDk: '#2F8D90'
  };
  var HEAD_SCALE = 0.52;
  var ANCHORS = {
    body: { w: 256, h: 256, feet: [128, 244], socket: [128, 118], shoulder: [152, 136], tail: [84, 220] },
    hang: { w: 256, h: 256, hand: [128, 18], socket: [128, 118], tail: [84, 200] },
    head: { w: 192, h: 192, joint: [96, 172], box: HEAD_SCALE },
    headScale: HEAD_SCALE,
    arm: { rest: 74, reach: 116, restAng: 1.0, w: 18 }
  };
  var LW = 4.2;            // outline width in body units (same as the SVGs)
  var U150 = 150 / 256;    // px per body unit at h = 150 (opt.scale = 1)

  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // ------------------------------------------------------------------ arm
  var AN = 12;
  var AX = new Float64Array(AN + 1), AY = new Float64Array(AN + 1), ATX = new Float64Array(AN + 1), ATY = new Float64Array(AN + 1);
  var AW = new Float64Array(AN + 1);

  // the shoulder sits just below the right side of the big head: visually the arm stays in [−1.75, 2.2] rad
  // (from slightly past straight up, round the front, to down-forward) so it never sweeps across the face or the belly.
  var ANG_MIN = -1.75, ANG_MAX = 2.2;
  var ANG_MID = (ANG_MIN + ANG_MAX - 2 * Math.PI) / 2;   // middle of the forbidden arc (≈ −2.92)
  function clampAng(a) {
    a = Math.atan2(Math.sin(a), Math.cos(a));            // (−π, π]
    if (a < ANG_MIN) return a < ANG_MID ? ANG_MAX : ANG_MIN;   // snap to the nearer end of the allowed range
    if (a > ANG_MAX) return ANG_MAX;
    return a;
  }

  function armLen(h, ext) {
    var e = clamp(num(ext, 0), 0, 1);
    return (ANCHORS.arm.rest + (ANCHORS.arm.reach - ANCHORS.arm.rest) * e) * num(h, 150) / 256;
  }

  function ribbon(ctx, X, Y, TX, TY, W, n, side, off, i0, move) {
    for (var i = i0; i <= n; i++) {
      var r = W[i] + off;
      var x = X[i] - TY[i] * side * r, y = Y[i] + TX[i] * side * r;
      if (i === i0 && move) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  }
  function ribbonBack(ctx, X, Y, TX, TY, W, n, side) {
    for (var i = n; i >= 0; i--) ctx.lineTo(X[i] - TY[i] * side * W[i], Y[i] + TX[i] * side * W[i]);
  }

  function drawHand(ctx, x, y, r, ca, sa, point, u) {
    var lw = LW * u;
    ctx.lineWidth = lw;
    ctx.strokeStyle = COLORS.line;
    if (point) {   // index finger: a rounded capsule out of the mitten along the arm direction
      var fl = r * 1.5, fw = r * 0.34;
      var fx = x + ca * fl, fy = y + sa * fl;
      ctx.lineCap = 'round';
      ctx.lineWidth = fw * 2 + lw * 2; ctx.strokeStyle = COLORS.line;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(fx, fy); ctx.stroke();
      ctx.lineWidth = fw * 2; ctx.strokeStyle = COLORS.peach;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(fx, fy); ctx.stroke();
      ctx.lineWidth = lw; ctx.strokeStyle = COLORS.line;
    }
    ctx.fillStyle = COLORS.peach;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // finger creases (or a curled-fingers crease + thumb when pointing)
    ctx.strokeStyle = COLORS.peachLn; ctx.lineWidth = 2.2 * u; ctx.lineCap = 'round';
    ctx.beginPath();
    if (point) {
      ctx.moveTo(x + ca * r * 0.2 - sa * r * 0.55, y + sa * r * 0.2 + ca * r * 0.55);
      ctx.lineTo(x + ca * r * 0.75 - sa * r * 0.45, y + sa * r * 0.75 + ca * r * 0.45);
    } else {
      for (var k = -1; k <= 1; k += 2) {
        var o = 0.32 * k;
        ctx.moveTo(x + ca * r * 0.35 - sa * r * o, y + sa * r * 0.35 + ca * r * o);
        ctx.lineTo(x + ca * r * 0.95 - sa * r * o * 1.05, y + sa * r * 0.95 + ca * r * o * 1.05);
      }
    }
    ctx.stroke();
  }

  function drawArm(ctx, sx, sy, ang, len, opt) {
    sx = +sx; sy = +sy; ang = +ang; len = +len;
    if (!ctx || !isFinite(sx) || !isFinite(sy) || !isFinite(ang) || !isFinite(len)) return;
    opt = opt || {};
    var u = num(opt.scale, 1) * U150;                     // px per body unit
    if (!(u > 0)) return;
    var r = 10.5 * u, w0 = ANCHORS.arm.w * u, w1 = 14 * u;
    len = Math.max(len, r * 0.8);
    ang = clampAng(ang);
    var ca = Math.cos(ang), sa = Math.sin(ang);
    var nx = -sa, ny = ca;
    if (ny < -0.3) { nx = -nx; ny = -ny; }                // the elbow bends down / forward, never up over the head
    // pointing up: the elbow swings out to the right so the arm passes beside the face, not over it
    var up = clamp((-sa - 0.45) / 0.5, 0, 1);
    var bend = clamp(num(opt.bend, 0.14), -0.3, 0.3) * len * (1 + 1.3 * up);
    var hx = sx + ca * len, hy = sy + sa * len;
    var ex = sx + ca * len * 0.5 + nx * bend * 2, ey = sy + sa * len * 0.5 + ny * bend * 2;   // quad control (peak = bend)
    for (var i = 0; i <= AN; i++) {
      var t = i / AN, mt = 1 - t;
      AX[i] = mt * mt * sx + 2 * mt * t * ex + t * t * hx;
      AY[i] = mt * mt * sy + 2 * mt * t * ey + t * t * hy;
      var tx = 2 * mt * (ex - sx) + 2 * t * (hx - ex), ty = 2 * mt * (ey - sy) + 2 * t * (hy - ey);
      var tl = Math.sqrt(tx * tx + ty * ty) || 1;
      ATX[i] = tx / tl; ATY[i] = ty / tl;
      AW[i] = (w0 + (w1 - w0) * t) * 0.5;
    }
    ctx.save();
    if (opt.alpha !== undefined) ctx.globalAlpha *= clamp(num(opt.alpha, 1), 0, 1);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // fur ribbon + a round fur cap on the shoulder (no outline there: it melts into the body)
    ctx.fillStyle = COLORS.fur;
    ctx.beginPath();
    ribbon(ctx, AX, AY, ATX, ATY, AW, AN, 1, 0, 0, true);
    ribbonBack(ctx, AX, AY, ATX, ATY, AW, AN, -1);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(sx, sy, w0 * 0.5, 0, Math.PI * 2); ctx.fill();
    // cel shade along the elbow (outer / lower) side
    var sd = (nx * -sa + ny * ca) >= 0 ? 1 : -1;
    ctx.strokeStyle = COLORS.shade; ctx.lineWidth = w0 * 0.26;
    ctx.beginPath(); ribbon(ctx, AX, AY, ATX, ATY, AW, AN, sd, -w0 * 0.2, 2, true); ctx.stroke();
    // outline along both sides, starting a little away from the shoulder
    ctx.strokeStyle = COLORS.line; ctx.lineWidth = LW * u;
    ctx.beginPath(); ribbon(ctx, AX, AY, ATX, ATY, AW, AN, 1, LW * u * 0.3, 2, true); ctx.stroke();
    ctx.beginPath(); ribbon(ctx, AX, AY, ATX, ATY, AW, AN, -1, LW * u * 0.3, 2, true); ctx.stroke();
    drawHand(ctx, hx, hy, r, ca, sa, !!opt.point, u);
    ctx.restore();
  }

  // ------------------------------------------------------------------ tail
  var TN = 28;
  var TX_ = new Float64Array(TN + 1), TY_ = new Float64Array(TN + 1), TTX = new Float64Array(TN + 1), TTY = new Float64Array(TN + 1);
  var TW = new Float64Array(TN + 1);

  function drawTail(ctx, x, y, h, phase, opt) {
    x = +x; y = +y; h = +h; phase = num(+phase, 0);
    if (!ctx || !isFinite(x) || !isFinite(y) || !(h > 0)) return;
    opt = opt || {};
    var s = h / 256, hang = !!opt.hang, side = num(opt.side, -1) >= 0 ? 1 : -1;
    var L = (hang ? 150 : 176) * s, ds = L / TN;
    var th = hang ? Math.PI / 2 + 0.55 : Math.PI - 0.18;
    var px = 0, py = 0;
    TX_[0] = x; TY_[0] = y;
    for (var i = 1; i <= TN; i++) {
      var t = i / TN;
      var k = hang ? -0.3 + 11.0 * t * t * t * t + 0.35 * Math.sin(phase - 3 * t) * t
        : 1.35 + 9.0 * t * t * t * t + 0.45 * Math.sin(phase - 2.6 * t) * t;
      th += k / TN;
      px += Math.cos(th) * ds; py += Math.sin(th) * ds;
      TX_[i] = side < 0 ? x + px : x - px;              // side −1: as integrated (goes left); +1: mirrored
      TY_[i] = y + py;
    }
    for (i = 0; i <= TN; i++) {
      var a = i > 0 ? i - 1 : 0, b = i < TN ? i + 1 : TN;
      var tx = TX_[b] - TX_[a], ty = TY_[b] - TY_[a], tl = Math.sqrt(tx * tx + ty * ty) || 1;
      TTX[i] = tx / tl; TTY[i] = ty / tl;
      TW[i] = (13 - 5.5 * (i / TN)) * s * 0.5;
    }
    ctx.save();
    if (opt.alpha !== undefined) ctx.globalAlpha *= clamp(num(opt.alpha, 1), 0, 1);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.fillStyle = COLORS.fur; ctx.strokeStyle = COLORS.line; ctx.lineWidth = LW * s;
    ctx.beginPath();
    ribbon(ctx, TX_, TY_, TTX, TTY, TW, TN, 1, 0, 0, true);
    ribbonBack(ctx, TX_, TY_, TTX, TTY, TW, TN, -1);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // round tip: outlined disc, then a fur disc that hides the ribbon's square end line
    ctx.beginPath(); ctx.arc(TX_[TN], TY_[TN], TW[TN], 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(TX_[TN], TY_[TN], Math.max(0.1, TW[TN] - LW * s * 0.5), 0, Math.PI * 2); ctx.fill();
    // soft highlight along the upper side
    ctx.strokeStyle = COLORS.furHi; ctx.lineWidth = 2.4 * s; ctx.globalAlpha *= 0.7;
    ctx.beginPath();
    for (i = 3; i <= TN - 6; i++) {
      var hx = TX_[i] + TTY[i] * TW[i] * 0.45 * side * -1, hy = TY_[i] - TTX[i] * TW[i] * 0.45 * side * -1;
      if (i === 3) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
    }
    ctx.stroke();
    ctx.restore();
  }

  // ------------------------------------------------------------------ head tilt
  function headTilt(lean, lookX, lookY, x, y) {
    var l = num(lean, 0) * 0.15;
    var dx = num(lookX, NaN) - num(x, NaN), dy = num(lookY, NaN) - num(y, NaN);
    var look = 0;
    if (isFinite(dx) && isFinite(dy) && dx * dx + dy * dy > 1) {
      var el = Math.atan2(dy, Math.abs(dx));        // −π/2 (straight up) … +π/2 (straight down)
      look = 0.3 * el * (dx >= 0 ? 1 : 0.5);        // looking behind (left): a smaller tilt
    }
    return clamp(look + l, -0.3, 0.3);
  }

  LL.LoloArt = {
    COLORS: COLORS, ANCHORS: ANCHORS, armLen: armLen,
    drawArm: drawArm, drawTail: drawTail, headTilt: headTilt
  };
})(typeof window !== 'undefined' ? (window.LL = window.LL || {}) : (globalThis.LL = globalThis.LL || {}));
