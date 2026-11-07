/* Nini's Sea Painting — SP.CONFIG + SP.World (headless, deterministic tap-to-paint simulation; DESIGN §2, §5.2)
 *
 * ============================== CONVENTIONS ==============================
 *  Units: logical px (short side 720), seconds, radians, y DOWN, rot > 0 clockwise. Screen space = world space (no camera).
 *  update(dt) runs fixed sub-steps of cfg.step (1/120 s). At the START of every sub-step every moving field is copied into
 *  its `_p` twin; render v = _v + (v − _v)·w.alpha.
 *
 *  PICTURE: data = w.picture (= round.pic, SP.Pictures.build result, authored in 600 × 400). Screen placement:
 *    box = layout.canvas {x, y, w = 600 s, h = 400 s, s}. w.pic = { x, y (screen px offset of the picture box from (box.x,
 *    box.y)), rot (rad), sx, sy (scale), wig (rad, skew-X body wave), alpha } — all about the picture's BOTTOM-CENTRE:
 *      ctx.translate(box.x + pic.x + box.w/2, box.y + pic.y + box.h); ctx.rotate(rot); ctx.transform(1, 0, -Math.tan(wig), 1, 0, 0)
 *      [skew: a point h px above the pivot moves tan(wig)·h to the right]; ctx.scale(sx, sy); ctx.translate(−box.w/2, −box.h); ctx.scale(s, s);
 *      PaintArt.drawPicture(ctx, w.picture, w.st, …)
 *    In the paint phase w.pic is identity (x = y = rot = wig = 0, sx = sy = alpha = 1) — taps map picture px = (X − box.x)/s.
 *  PART STATE: w.parts[] / w.st[partId] (same objects) = { id, color (hex | null), t 0..1 (fill, eased), _pt, ox, oy (fill
 *    origin, picture px), glow 0..1, wob (px, signed, damped), _pwob, sparkle 0..1, painted (bool: claimed by a right tap) }.
 *  SHELLS: w.shells[] = { color (palette name), hex, x, y (centre), r, pop 0..1 (scale; easeOutBack in / out), lift 0..1
 *    (× ~18 px up), wob (px, signed, horizontal), glow 0..1, dim 0..1, selected (bool: the brush holds this colour), _p* twins }.
 *  BRUSH: w.brush = { color (palette name | null), hex, x, y (bristle TIP), angle (rad: rotation of a brush drawn tip at the
 *    origin, handle pointing UP; + = clockwise, the handle leans right; rest −0.5), dip 0..1 (pressed into the paint / onto the
 *    canvas: squash the bristles), state 'rest'|'fly'|'dip'|'dab', size (px, handle length) } + _p* twins.
 *  Also: w.splats[] {x, y, color, hex, r, t 0..1} (PaintArt.drawSplash), w.canvasGlow 0..1 (drawCanvasFrame opt.glow),
 *    w.hintHand null | {x, y (fingertip), x0, y0 (target), t 0..1 cycle, press 0..1, alpha, target 'shell'|'part', id},
 *    w.fishy null | {x, y (centre), dir ±1 (faces right when +1), state 'swim'|'happy', t, wig (rad tail wag), size (px wide)},
 *    w.clam null | {x, y (bottom-centre on the sand), w, h, open 0..1.15 (lid spring), glow 0..1, taps}.
 * ========================================================================
 */
(function (SP) {
  'use strict';

  var CONFIG = {
    // ---- timing / state machine (s)
    step: 1 / 120, maxFrame: 1.0,
    roundsPerLevel: 4, chapterTimeLimit: 75, chapterMinRounds: 3,
    shortBudget: [1e9, 34, 54, 70],   // s into the chapter: a round starting later than this is short (content: fewer steps)
    introTime: 2.5, clearTime: 0.4, levelDoneTime: 1.8,
    talkAfterAnswer: 1.6, talkAskTime: 12, talkGlowAfterAsks: 2, talkMaxAsks: 3, talkGiveUp: 12,

    // ---- layout (DESIGN §2; px)
    shortSide: 720, minLong: 960, maxLong: 1600, tallRatio: 1.6,
    groundLand: 18, groundPort: 30,
    bubbleX: 24, bubbleYLand: 18, bubbleMaxW: 560, bubbleRight: 200, bubbleHLand: 122, bubbleYPort: 110, bubbleHPort: 124,
    hudW: 160, hudH: 96,
    frame: 16,                 // shell frame drawn OUTSIDE the canvas inner box
    canvasGapTop: 16, canvasGapBottom: 20, canvasGapBottomLand: 16, sideM: 24, sideMPort: 20, sideMNini: 14, sMax: 1.25,
    shellR: 58, shellHitPad: 18, shellGap: 24, shellGapMax: 40, shellDrop: 14, shellDropLand: 8, shellsPlan: 4,
    niniHLand: 250, niniHPort: 210, niniHPortMin: 170, niniWFrac: 0.72, niniXLand: 130, niniGap: 8, niniFeet: 6, niniCanvasGap: 10,
    clamW: 112, clamH: 98, clamGap: 14, clamR: 66,
    landColumn: true,          // landscape: paint shells in a column right of the canvas when that gives a larger canvas
    columnMinGain: 1.02,       // … the column must beat the row's canvas scale by ≥ 2 %
    fishLaneBandLand: 120, fishLaneBandPort: 150,   // water band above the canvas this tall → the fishy swims there

    // ---- picture / touch
    hitPad: 14,                // picture px around every part's hit shape
    tapTime: 1.0, tapMovePx: 64, niniPad: 10,   // playtest P2-1: nothing is a drag here, so a loose tap only helps
    softWob: 3, softShellWob: 4,                 // a too-long press / a drag: a tiny wobble of what is under the finger (event 'soft')

    // ---- brush
    brushFlyMin: 0.16, brushFlyMax: 0.3, brushFlyPerPx: 1 / 3500, brushArc: 34, brushArcPerPx: 0.06,
    dipTime: 0.24, dipDepth: 14, dabTime: 0.16, dabDepth: 7, brushRestDelay: 0.12, brushSize: 120, brushBob: 2.5,

    // ---- paint
    fillTime: 0.7, sweepFill: 0.5, sparkleTime: 0.8, splatTime: 0.45,
    partOmega: 30, partZeta: 0.2, partWob: 6, paintWob: 2.5,
    shellPopTime: 0.35, shellStagger: 0.1, shellDelay: 0.35, shellLiftOmega: 14, shellLiftZeta: 0.45, shellSel: 0.35,
    shellWobOmega: 26, shellWobZeta: 0.18, shellWob: 8, shellOutTime: 0.28,
    pickGlow: 0.55,            // the pickColor target glows at this level the whole step (hint: 1)

    // ---- round phases
    enterTime: 1.1, enterFrom: 0.6, enterOmega: 8, enterZeta: 0.6, enterSway: 0.07,
    askGap: 0.5,               // stepDone → next ask
    sweepGap: 0.12, finishMin: 1.2, finishTail: 0.25,
    aliveTime: 2.4, aliveMove: 2.0, aliveBubbleGap: 0.22,

    // ---- help
    hintAfterMisses: 2,        // taps without progress in a step (wrong / needPaint / notThis / empty canvas / empty sand + water) → hint
    assistAfter: 6, assistAfterOld: 5, assistMaxAge: 4,   // … this many → the next canvas / shell tap does the right thing
    hintTime: 3, hintCooldown: 6, hintCycle: 1.2,
    idleTime: 12, idleBackoff: 1.5, idleMax: 30, idleHintFrom: 2,

    // ---- surprises: one round per chapter (round 1 or 2, never the warm-up); the type rotates per chapter
    surpriseRounds: [1, 2], surpriseTypes: ['fishy', 'pearl'],
    fishyAt: 2.5, fishySpeed: 150, fishyHappySpeed: 420, fishyPasses: 2, fishyGapTime: 5, fishyW: 120, fishyR: 64, fishyBob: 10,
    clamOpenOmega: 9, clamOpenZeta: 0.45, clamOpenTime: 2.2,

    // ---- Nini
    moodTime: { happy: 0.9, cheer: 1.6, oops: 0.8, think: 1.4, talk: 1.0, wave: 1.4, paint: 0.7, point: 1.2 },
    lookRate: 6, blink: [2.2, 5], blinkTime: 0.13
  };
  SP.CONFIG = CONFIG;

  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hyp(x, y) { return Math.sqrt(x * x + y * y); }
  function lerp(a, b, u) { return a + (b - a) * u; }
  function smooth(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  function easeOutBack(u) { var c1 = 1.70158, c3 = c1 + 1, v = u - 1; return 1 + c3 * v * v * v + c1 * v * v; }
  function easeOut3(u) { u = clamp(u, 0, 1); var v = 1 - u; return 1 - v * v * v; }
  function merge(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; if (b) for (k in b) o[k] = b[k]; return o; }
  function insOf(ins) { return { top: +(ins && ins.top) || 0, right: +(ins && ins.right) || 0, bottom: +(ins && ins.bottom) || 0, left: +(ins && ins.left) || 0 }; }
  function keepBoxes(hk) {
    var a = Array.isArray(hk) ? hk : hk ? [hk] : [], out = [];
    for (var i = 0; i < a.length; i++) { var b = a[i]; if (b && b.w > 0 && b.h > 0) out.push({ x: +b.x, y: +b.y, w: +b.w, h: +b.h }); }
    return out;
  }
  function hexOf(c) { return c && SP.PALETTE && SP.PALETTE[c] ? SP.PALETTE[c].base : c || null; }
  /** Initial velocity that gives a damped spring (ω, ζ) released from 0 a first peak of `peak`. */
  function kickFor(peak, w, z) { var s = Math.sqrt(1 - z * z); return peak * w * Math.exp(z / s * Math.atan2(s, z)); }
  function spring(o, k, kv, target, w, z, h) { o[kv] += (w * w * (target - o[k]) - 2 * z * w * o[kv]) * h; o[k] += o[kv] * h; }

  /** DESIGN §2 short-side rule: CSS viewport → logical W×H. */
  function logicalSize(cssW, cssH, cfg) {
    cfg = cfg || CONFIG;
    var S = cfg.shortSide, aspect = cssW / Math.max(1, cssH);
    if (cssW >= cssH) return { W: clamp(Math.round(S * aspect), cfg.minLong, cfg.maxLong), H: S };
    return { W: S, H: clamp(Math.round(S / aspect), cfg.minLong, cfg.maxLong) };
  }

  /** Palette slot centres: n shells of radius r centred at cx inside [lo, hi] (gap shellGap … shellGapMax). → slots | null */
  function shellRow(n, cx, lo, hi, y, cfg) {
    var r = cfg.shellR, out = [];
    if (!n) return out;
    var room = hi - lo, gap = n > 1 ? clamp((room - 2 * r * n) / (n - 1), cfg.shellGap, cfg.shellGapMax) : 0;
    var w = 2 * r * n + gap * (n - 1);
    if (w > room + 1e-6) return null;
    var x0 = clamp(cx - w / 2, lo, hi - w);
    for (var i = 0; i < n; i++) out.push({ x: x0 + r + i * (2 * r + gap), y: y, r: r });
    return out;
  }

  /**
   * DESIGN §2 layout. plan = { n: shells this round (0–5), clam: bool (pearl round) }.
   *   canvas {x, y, w, h, s} = INNER picture box (frame `frame` px drawn outside), palette {y, slots[{x, y, r}], hitR},
   *   nini {x, y (feet), h, w}, brush {x, y} (resting tip), clam null | {x, y (bottom anchor), w, h}, fishY (fishy lane),
   *   bubble, hud, groundY, keep[] (debug: what the child must touch stays out of these boxes).
   */
  function computeLayout(W, H, ins, cfg, plan, hudKeep) {
    var row = rowLayout(W, H, ins, cfg, plan, hudKeep);
    if (row.portrait || !cfg.landColumn) return row;
    var col = columnLayout(W, H, ins, cfg, plan, hudKeep, row);
    return col && col.canvas.s > row.canvas.s * (cfg.columnMinGain || 1) ? col : row;
  }
  /** The fishy's lane: the open water band above the canvas when it is tall enough, else across the top of the picture
   *  (there the picture and the shells win every press while a step is interactive — World.pointerDown). */
  function fishLane(portrait, canvas, F, bubble, hud, cfg) {
    var above = portrait ? bubble.y + bubble.h : Math.max(bubble.y + bubble.h, hud.y + hud.h);
    var band = canvas.y - F - above, need = portrait ? cfg.fishLaneBandPort : cfg.fishLaneBandLand;
    return band >= need ? above + band / 2 : canvas.y + 0.13 * canvas.h;
  }
  function layoutOut(W, H, ins, portrait, tall, groundY, bubble, hud, hk, canvas, F, palette, nini, clam, cfg) {
    var brush = { x: nini.x + 0.3 * nini.h, y: nini.y - 0.5 * nini.h };
    var keep = [{ x: bubble.x, y: bubble.y, w: bubble.w, h: bubble.h, kind: 'bubble' }, { x: hud.x, y: hud.y, w: hud.w, h: hud.h, kind: 'hud' }];
    hk.forEach(function (b) { b.kind = 'hudKeep'; keep.push(b); });
    return {
      W: W, H: H, ins: ins, portrait: portrait, tall: tall, groundY: groundY, bubble: bubble, hud: hud, canvas: canvas, frame: F,
      palette: palette, nini: nini, brush: brush, clam: clam, fishY: fishLane(portrait, canvas, F, bubble, hud, cfg), keep: keep,
      safe: { x: ins.left, y: ins.top, w: W - ins.left - ins.right, h: H - ins.top - ins.bottom }
    };
  }
  /** n slots of radius r stacked vertically at x, centred on cy inside [lo, hi] (gap shellGap … shellGapMax) → slots | null */
  function shellCol(n, x, cy, lo, hi, cfg) {
    var r = cfg.shellR, out = [];
    if (!n) return out;
    var room = hi - lo, gap = n > 1 ? clamp((room - 2 * r * n) / (n - 1), cfg.shellGap, cfg.shellGapMax) : 0;
    var h = 2 * r * n + gap * (n - 1);
    if (h > room + 1e-6) return null;
    var y0 = clamp(cy - h / 2, lo, hi - h);
    for (var i = 0; i < n; i++) out.push({ x: x, y: y0 + r + i * (2 * r + gap), r: r });
    return out;
  }
  /**
   * Landscape alternative (visual P2-2, phones ≈ 2.2:1): the paint shells stand in a vertical column RIGHT of the canvas
   * (centred between the canvas frame and the right safe edge, below the HUD keep-out), so the canvas can use the full
   * height between the bubble / HUD and the sand; Nini stays on the left. The clam goes under the column when it fits,
   * else on the sand left of Nini (the canvas gives up the width). Planned for max(n, shellsPlan) shells like the row, so
   * the canvas keeps its size between rounds. → layout | null (does not fit).
   */
  function columnLayout(W, H, ins, cfg, plan, hudKeep, row) {
    ins = insOf(ins); plan = plan || {};
    var F = cfg.frame, r = cfg.shellR, hk = keepBoxes(hudKeep), i;
    var groundY = row.groundY, bubble = row.bubble, hud = row.hud;
    var n = clamp(plan.n | 0, 0, 5), nPlan = Math.max(n, cfg.shellsPlan);
    var top = Math.max(bubble.y + bubble.h + cfg.canvasGapTop + F, hud.y + hud.h + 8 + F);
    var colTop = hud.y + hud.h + 8, colBot = groundY - cfg.shellDropLand;
    for (i = 0; i < hk.length; i++) if (hk[i].y + hk[i].h < H / 2) { top = Math.max(top, hk[i].y + hk[i].h + 8 + F); colTop = Math.max(colTop, hk[i].y + hk[i].h + 8); }
    var bottom = groundY - cfg.canvasGapBottomLand - F;
    if (colBot - colTop < nPlan * 2 * r + (nPlan - 1) * cfg.shellGap - 1e-6) return null;
    var niniH = cfg.niniHLand, nW = cfg.niniWFrac * niniH, cl = cfg.clamW;
    var xL = ins.left + cfg.sideM, xR = W - ins.right, colW = cfg.shellGap + 2 * r + cfg.sideM;
    var best = null;
    [false, true].forEach(function (clamLeft) {
      if (clamLeft && !plan.clam) return;
      var extra = clamLeft ? cl + cfg.clamGap : 0;
      var s = Math.min((bottom - top) / 400, (xR - colW - xL - extra - nW - cfg.niniGap - 2 * F) / 600, cfg.sMax);
      if (!(s > 0)) return;
      var cw = 600 * s, ch = 400 * s, groupW = extra + nW + cfg.niniGap + 2 * F + cw;
      var gx = xL + Math.max(0, (xR - colW - xL - groupW) / 2);
      var canvas = { x: gx + extra + nW + cfg.niniGap + F, y: top + Math.max(0, (bottom - top - ch) / 2), w: cw, h: ch, s: s };
      var nx = Math.max(ins.left + (clamLeft ? extra : 0) + cfg.niniXLand - 0.0001, gx + extra + nW / 2);
      nx = Math.min(nx, canvas.x - F - cfg.niniGap - nW / 2);
      var nini = { x: nx, y: groundY - cfg.niniFeet, h: niniH, w: nW };
      var outerR = canvas.x + cw + F, colX = (outerR + xR) / 2;
      colX = clamp(colX, outerR + cfg.shellGap + r, xR - cfg.sideM - r);
      var cy = canvas.y + ch / 2, slots, clam = null;
      if (plan.clam && !clamLeft) {   // the clam on the sand under the column
        var hiC = groundY - 2 - cfg.clamH - cfg.clamGap;
        slots = shellCol(n, colX, cy, colTop, hiC, cfg);
        if (!slots) return;
        clam = { x: colX, y: groundY - 2, w: cl, h: cfg.clamH };
      } else {
        slots = shellCol(n, colX, cy, colTop, colBot, cfg);
        if (!slots) return;
        if (clamLeft) {
          var cx0 = nini.x - nW / 2 - cfg.clamGap - cl / 2;
          if (cx0 - cl / 2 < ins.left + 8) return;
          clam = { x: cx0, y: groundY - 2, w: cl, h: cfg.clamH };
        }
      }
      if (!best || s > best.canvas.s) best = { canvas: canvas, nini: nini, slots: slots, clam: clam, colX: colX };
    });
    if (!best) return null;
    var palette = { y: best.slots.length ? best.slots[0].y : groundY - r, x: best.colX, slots: best.slots, hitR: r + cfg.shellHitPad, n: n, column: true };
    return layoutOut(W, H, ins, false, H / W > cfg.tallRatio, groundY, bubble, hud, hk, best.canvas, F, palette, best.nini, best.clam, cfg);
  }
  function rowLayout(W, H, ins, cfg, plan, hudKeep) {
    ins = insOf(ins); plan = plan || {};
    var portrait = H > W, tall = H / W > cfg.tallRatio, F = cfg.frame, r = cfg.shellR;
    var groundY = H - ins.bottom - (portrait ? cfg.groundPort : cfg.groundLand);
    var bx = ins.left + cfg.bubbleX, bubble;
    if (portrait) bubble = { x: bx, y: ins.top + cfg.bubbleYPort, w: W - bx - ins.right - cfg.bubbleX, h: cfg.bubbleHPort };
    else bubble = { x: bx, y: ins.top + cfg.bubbleYLand, w: Math.min(cfg.bubbleMaxW, W - ins.right - cfg.bubbleRight - bx), h: cfg.bubbleHLand };
    bubble.w = Math.max(0, bubble.w);
    var hud = { x: W - ins.right - cfg.hudW, y: 0, w: cfg.hudW + ins.right, h: ins.top + cfg.hudH };
    var hk = keepBoxes(hudKeep);
    var n = clamp(plan.n | 0, 0, 5), nPlan = Math.max(n, cfg.shellsPlan);
    var shellY = groundY - (portrait ? cfg.shellDrop : cfg.shellDropLand) - r, needW = nPlan * 2 * r + (nPlan - 1) * cfg.shellGap;
    var top = bubble.y + bubble.h + cfg.canvasGapTop + F, i;
    var canvas, nini, lo, hi, s, cw, ch, niniH, nW, shiftL = 0;
    if (!portrait) {
      top = Math.max(top, hud.y + hud.h + 8 + F);
      niniH = cfg.niniHLand; nW = cfg.niniWFrac * niniH;
      var bottom = shellY - r - cfg.canvasGapBottomLand - F;
      var xL = ins.left + cfg.sideM, xR = W - ins.right - cfg.sideM;
      for (i = 0; i < hk.length; i++) if (hk[i].y + hk[i].h < H / 2) top = Math.max(top, hk[i].y + hk[i].h + 8 + F);
      s = Math.min((bottom - top) / 400, (xR - xL - nW - cfg.niniGap - 2 * F) / 600, cfg.sMax);
      cw = 600 * s; ch = 400 * s;
      var groupW = nW + cfg.niniGap + 2 * F + cw, gx = xL + Math.max(0, (xR - xL - groupW) / 2);
      canvas = { x: gx + nW + cfg.niniGap + F, y: top + Math.max(0, (bottom - top - ch) / 2), w: cw, h: ch, s: s };
      nini = { x: Math.max(ins.left + cfg.niniXLand - 0.0001, gx + nW / 2), y: groundY - cfg.niniFeet, h: niniH, w: nW };
      nini.x = Math.min(nini.x, canvas.x - F - cfg.niniGap - nW / 2);
      lo = nini.x + nW / 2 + 12; hi = xR; shiftL = nini.x - nW / 2 - xL;
    } else {
      var sm = cfg.sideMNini;
      niniH = cfg.niniHPort; nW = cfg.niniWFrac * niniH;
      var room = W - ins.left - ins.right - 2 * sm - cfg.niniGap - needW;
      if (room < nW) { nW = Math.max(cfg.niniWFrac * cfg.niniHPortMin, room); niniH = nW / cfg.niniWFrac; }
      nini = { x: ins.left + sm + nW / 2, y: groundY - cfg.niniFeet, h: niniH, w: nW };
      lo = ins.left + sm + nW + cfg.niniGap; hi = W - ins.right - sm;
      var niniTop = nini.y - niniH;
      var bottomP = Math.min(shellY - r - cfg.canvasGapBottom, niniTop - cfg.niniCanvasGap) - F;
      for (i = 0; i < hk.length; i++) if (hk[i].y + hk[i].h < H / 2) top = Math.max(top, hk[i].y + hk[i].h + 8 + F);
      var wMax = W - ins.left - ins.right - 2 * cfg.sideMPort - 2 * F;
      s = Math.min((bottomP - top) / 400, wMax / 600, cfg.sMax);
      cw = 600 * s; ch = 400 * s;
      canvas = { x: ins.left + (W - ins.left - ins.right - cw) / 2, y: bottomP - ch, w: cw, h: ch, s: s };
      // tall portraits (phones): plenty of water above the canvas — Nini stands ON the canvas frame (top-left) instead of
      // in the sand corner, the shells get the whole row and the group is centred in the free band (no empty sea band).
      var bottomFree = shellY - r - cfg.canvasGapBottom - F;
      var sFree = Math.min((bottomFree - top) / 400, wMax / 600, cfg.sMax);
      var hUp = cfg.niniHPortUp || 230;
      if (bottomFree - top - 400 * sFree - 2 * F >= hUp + 30) {
        s = sFree; cw = 600 * s; ch = 400 * s;
        niniH = hUp; nW = cfg.niniWFrac * niniH;
        var slack = bottomFree - top - ch - niniH - 2 * F + 14;           // + overlap: feet rest on the frame
        var cy0 = top + niniH + F - 14 + slack * 0.55;
        canvas = { x: ins.left + (W - ins.left - ins.right - cw) / 2, y: Math.min(bottomFree - ch, cy0), w: cw, h: ch, s: s };
        nini = { x: canvas.x + nW / 2 + 6, y: canvas.y - F + 12, h: niniH, w: nW, up: true };
        lo = ins.left + 18; hi = W - ins.right - 18;
      }
    }
    // palette: centred on the canvas, kept right of Nini; a pearl round keeps room for the clam right of the shells
    var cx = canvas.x + canvas.w / 2, slots = shellRow(n, cx, lo, hi, shellY, cfg), clam = null;
    if (!slots) slots = shellRow(n, cx, lo - 12, hi + cfg.sideM - 8, shellY, merge(cfg, { shellGap: 12 }))
      || shellRow(n, W / 2, ins.left + 12, W - ins.right - 12, shellY, merge(cfg, { shellGap: 12 })) || [];   // 5 shells in portrait (unused): over Nini's corner
    if (plan.clam) {
      var cl = cfg.clamW, withClam = shellRow(n, cx, lo, hi - cl - cfg.clamGap, shellY, cfg);
      if (!withClam && !portrait && shiftL > 0) {   // narrow landscape: slide Nini + canvas left to make room on the sand
        canvas.x -= shiftL; nini.x -= shiftL; lo -= shiftL; cx -= shiftL;
        withClam = shellRow(n, cx, lo, hi - cl - cfg.clamGap, shellY, cfg);
        if (!withClam) { canvas.x += shiftL; nini.x += shiftL; lo += shiftL; cx += shiftL; }
      }
      if (withClam) {
        slots = withClam;
        var right = n ? slots[n - 1].x + r : lo;
        clam = { x: Math.min(hi - cl / 2, Math.max(right + cfg.clamGap + cl / 2, n ? 0 : cx + canvas.w / 2 - cl / 2)), y: groundY - 2, w: cl, h: cfg.clamH };
      }
    }
    var palette = { y: shellY, slots: slots, hitR: r + cfg.shellHitPad, n: n, column: false };
    return layoutOut(W, H, ins, portrait, tall, groundY, bubble, hud, hk, canvas, F, palette, nini, clam, cfg);
  }

  // ------------------------------------------------------------------ picture geometry helpers (picture px)
  function hitBox(h) {
    if (!h) return null;
    if (h.type === 'ellipse') return { x0: h.cx - h.rx, y0: h.cy - h.ry, x1: h.cx + h.rx, y1: h.cy + h.ry };
    var b = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 };
    if (h.type === 'multi') { (h.list || []).forEach(function (q) { var c = hitBox(q); b.x0 = Math.min(b.x0, c.x0); b.y0 = Math.min(b.y0, c.y0); b.x1 = Math.max(b.x1, c.x1); b.y1 = Math.max(b.y1, c.y1); }); return b; }
    (h.pts || []).forEach(function (p) { b.x0 = Math.min(b.x0, p[0]); b.y0 = Math.min(b.y0, p[1]); b.x1 = Math.max(b.x1, p[0]); b.y1 = Math.max(b.y1, p[1]); });
    return b;
  }
  /** A safe tap point inside a part (picture px): its authored safe point (cx, cy) when it hits the part with a 12 px
   *  ring around it, else the sample point whose 8-direction ring stays on the part the longest. */
  function safePoint(pic, part) {
    var P = SP.Pictures;
    function ring(x, y, R) { for (var k = 0; k < 8; k++) if (P.hit(pic, x + R * Math.cos(k * TAU / 8), y + R * Math.sin(k * TAU / 8), 0) !== part.id) return false; return true; }
    if (P.hit(pic, part.cx, part.cy, 0) === part.id && ring(part.cx, part.cy, 12)) return { x: part.cx, y: part.cy, r: 12 };
    var bb = part.bbox ? { x0: part.bbox[0], y0: part.bbox[1], x1: part.bbox[2], y1: part.bbox[3] } : hitBox(part.hit) || { x0: part.cx - 30, y0: part.cy - 30, x1: part.cx + 30, y1: part.cy + 30 };
    var best = null, bestR = -1;
    var stepX = Math.max(6, (bb.x1 - bb.x0) / 12), stepY = Math.max(6, (bb.y1 - bb.y0) / 12);
    for (var y = bb.y0 + stepY / 2; y < bb.y1; y += stepY) for (var x = bb.x0 + stepX / 2; x < bb.x1; x += stepX) {
      if (P.hit(pic, x, y, 0) !== part.id) continue;
      var rr = 0;
      for (var R = 4; R <= 40; R += 6) { if (!ring(x, y, R)) break; rr = R; }
      if (rr > bestR) { bestR = rr; best = [x, y]; }
    }
    return best ? { x: best[0], y: best[1], r: bestR } : { x: part.cx, y: part.cy, r: 0 };
  }

  // ------------------------------------------------------------------ World
  function World(opts) {
    opts = opts || {};
    this.cfg = merge(CONFIG, opts.config);
    this.seed = opts.seed !== undefined ? opts.seed : 1;
    this.rng = new SP.RNG(this.seed);
    this._crng = new SP.RNG((SP.RNG.hash(this.seed) ^ 0x51ed27) >>> 0);   // cosmetic randomness (blinks, bubbles, wiggles)
    this.age = SP.Content.ageOf(opts.age !== undefined ? opts.age : 4);
    this.lang = opts.lang === 'vi' ? 'vi' : 'en';
    this._pendingAge = this.age; this._pendingLang = this.lang;
    this.state = 'menu'; this.phase = null;
    this.level = 0; this.levels = []; this.topic = null; this.weather = 0;
    this.round = 0; this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.stars = 0; this.levelStars = 0; this.roundStars = 0; this.misses = 0; this.stepMisses = 0; this.streak = 0; this.pictures = 0;
    this.time = 0; this.stateTime = 0; this.phaseTime = 0; this.alpha = 0; this._acc = 0;
    this.cur = null; this.picture = null; this.parts = []; this.st = {}; this.shells = []; this.step = -1; this.talk = null; this.talkAnswered = null;
    this.pic = { x: 0, y: 0, _px: 0, _py: 0, vy: 0, rot: 0, _prot: 0, sx: 1, sy: 1, _psx: 1, _psy: 1, wig: 0, _pwig: 0, alpha: 0, _palpha: 0 };
    this.brush = { color: null, hex: null, x: 0, y: 0, _px: 0, _py: 0, angle: -0.5, _pangle: -0.5, dip: 0, _pdip: 0, state: 'rest', size: this.cfg.brushSize, job: null };
    this.nini = { x: 0, y: 0, h: 200, mood: 'idle', moodT: 0, blinkT: 3, blink: false, look: 0, lookX: 0 };
    this.hudKeep = opts.hudKeep || null; this.lastTopics = null; this.surprise = null; this._surpriseOff = 0; this._surpriseRound = 1;
    this.fishy = null; this.clam = null; this.hintHand = null; this.splats = []; this.canvasGlow = 0; this.gallery = [];
    this.events = []; this.sessions = 0;
    this._idleN = 0; this._idleT = 0; this._idleGap = this.cfg.idleTime; this._lastHintT = -1e9; this.levelStartTime = 0;
    this._talkAskT = 0; this._talkAsks = 0; this._press = null; this.tapMoveMin = this.cfg.tapMovePx; this._prevPics = [];
    this._view = null; this._vp = null;
    this.setViewport(opts.width || 1280, opts.height || 720, opts.ins || null);
  }
  World.logicalSize = logicalSize;
  World.computeLayout = function (W, H, ins, cfg, plan, hudKeep) { return computeLayout(W, H, ins, merge(CONFIG, cfg), plan, hudKeep); };
  World.kickFor = kickFor;
  World.safePoint = safePoint;

  var P = World.prototype;
  Object.defineProperty(P, 'interactive', { get: function () { return this.state === 'round' && this.phase === 'paint' && !this._stepDone; } });
  Object.defineProperty(P, 'stepInfo', { get: function () { return this.cur && this.step >= 0 ? this.cur.steps[this.step] : null; } });
  P._emit = function (e) { this.events.push(e); };
  P.drainEvents = function () { var e = this.events; this.events = []; return e; };
  P.setAge = function (a) { this._pendingAge = SP.Content.ageOf(a); };
  P.setLang = function (l) { this._pendingLang = l === 'vi' ? 'vi' : 'en'; };
  P._setState = function (s) { this.state = s; this.stateTime = 0; };
  P._setPhase = function (p) { this.phase = p; this.phaseTime = 0; };
  P._mood = function (m, t) { this.nini.mood = m; this.nini.moodT = t || this.cfg.moodTime[m] || 1; };
  P.skipTalk = function () { if (this.state === 'talk') this._levelDone(); };
  P.partById = function (id) { return this.st[id] || null; };
  P.shellByColor = function (c) { for (var i = 0; i < this.shells.length; i++) if (this.shells[i].color === c) return this.shells[i]; return null; };
  P._tapMove = function () { return Math.max(this.cfg.tapMovePx, +this.tapMoveMin || 0); };
  P._loaded = function () { var s = this.stepInfo; return !!s && this.brush.color === s.color; };

  /** The current question {promptKey, params, mode, step, follow?} (enter / paint), else null. */
  P.prompt = function () {
    if (this.state !== 'round' || !this.cur || (this.phase !== 'paint' && this.phase !== 'enter')) return null;
    var i = Math.max(0, this.step), s = this.cur.steps[i];
    if (!s) return null;
    if (this.phase === 'paint' && s.mode === 'pickColor' && this._loaded())
      return { promptKey: 'p.tapPart', params: { part: s.nameValue, color: s.color }, mode: s.mode, step: i, follow: true };
    return { promptKey: s.promptKey, params: s.params, mode: s.mode, step: i };
  };

  // ---------------------------------------------------------------- coordinates + test hooks (logical px)
  P.picToScreen = function (x, y) { var C = this.layout.canvas; return { x: C.x + this.pic.x + x * C.s, y: C.y + this.pic.y + y * C.s }; };
  P.screenToPic = function (X, Y) { var C = this.layout.canvas; return { x: (X - C.x - this.pic.x) / C.s, y: (Y - C.y - this.pic.y) / C.s }; };
  /** A safe tap point inside a part (logical px) {x, y}, null when unknown. */
  P.partTap = function (id) {
    var p = this.st[id]; if (!p || !this.picture) return null;
    if (!p._safe) p._safe = safePoint(this.picture, p.src);
    return this.picToScreen(p._safe.x, p._safe.y);
  };
  P.shellHit = function (color) { var s = this.shellByColor(color); return s ? { x: s.x, y: s.y, r: this.layout.palette.hitR } : null; };
  P._niniBox = function () {
    var N = this.layout.nini, p = this.cfg.niniPad;
    return { x: N.x - N.w / 2 - p, y: N.y - N.h - p, w: N.w + 2 * p, h: N.h + 2 * p };
  };
  P.niniHit = function () { var b = this._niniBox(); return { x: b.x + b.w / 2, y: b.y + b.h / 2, w: b.w, h: b.h }; };
  P._fishyPos = function () { var f = this.fishy; return f && f.state !== 'gone' ? { x: f.x, y: f.y } : null; };
  /** The fishy's tap point when it can be tapped now (on screen, not under the HUD / bubble), else null. */
  P.fishyHit = function () {
    var f = this.fishy, L = this.layout;
    if (!f || f.state !== 'swim') return null;
    var r = this.cfg.fishyR;
    if (f.x < L.ins.left + 30 || f.x > L.W - L.ins.right - 30) return null;
    for (var i = 0; i < L.keep.length; i++) { var K = L.keep[i]; if (f.x > K.x - 20 && f.x < K.x + K.w + 20 && f.y > K.y - 20 && f.y < K.y + K.h + 20) return null; }
    return { x: f.x, y: f.y, r: r };
  };
  P.clamHit = function () { var c = this.clam; return c ? { x: c.x, y: c.y - 0.42 * c.h, r: this.cfg.clamR } : null; };
  /** What to tap next for the right answer: {shell: colour} | {part: id} | null (DESIGN §5.5). */
  P.answer = function () {
    if (!this.interactive) return null;
    var s = this.stepInfo;
    if ((s.mode === 'pickColor' || s.mode === 'pickTap') && !this._loaded()) return { shell: s.color };
    for (var i = 0; i < s.targets.length; i++) { var p = this.st[s.targets[i]]; if (p && !p.painted) return { part: p.id }; }
    return null;
  };

  // ---------------------------------------------------------------- viewport
  P.setViewport = function (W, H, ins) { this._view = { W: W, H: H, ins: insOf(ins) }; this._relayout(false); };
  P._plan = function () { return { n: this.cur && this.cur.palette ? this.cur.palette.length : 0, clam: this.surprise === 'pearl' }; };
  P._relayout = function (force) {
    var v = this._view, pl = this._plan();
    var key = v.W + 'x' + v.H + ':' + JSON.stringify(v.ins) + ':' + JSON.stringify(pl) + ':' + JSON.stringify(this.hudKeep || null);
    if (key === this._vp && !force) return false;
    var had = !!this.layout;
    this._vp = key;
    this.layout = computeLayout(v.W, v.H, v.ins, this.cfg, pl, this.hudKeep);
    this.layout.hudKeep = keepBoxes(this.hudKeep);
    var N = this.layout.nini;
    this.nini.x = N.x; this.nini.y = N.y; this.nini.h = N.h;
    if (had) this._snapAll();
    return true;
  };
  /** Rotation / resize: shells, brush, clam, fishy and the hint hand snap to the new layout; fills keep their progress. */
  P._snapAll = function () {
    var L = this.layout, i, slots = L.palette.slots;
    for (i = 0; i < this.shells.length; i++) {
      var sh = this.shells[i], sl = slots[i];
      if (sl) { sh.x = sl.x; sh.y = sl.y; sh.r = sl.r; }
    }
    this._press = null;
    var B = this.brush;
    if (B.job) this._finishJob(true);
    B.state = 'rest'; B.x = B._px = L.brush.x; B.y = B._py = L.brush.y; B.dip = 0;
    if (this.clam) {
      if (L.clam) { this.clam.x = L.clam.x; this.clam.y = L.clam.y; this.clam.w = L.clam.w; this.clam.h = L.clam.h; } else this.clam = null;
    }
    if (this.fishy) { this.fishy.y = this.fishy._py = this.fishy.y0 = L.fishY; this.fishy.x = clamp(this.fishy.x, -200, L.W + 200); this.fishy._px = this.fishy.x; }
    for (i = 0; i < this.parts.length; i++) this.parts[i]._screenOk = false;
    if (this.hintHand) this._hintGeo();
    this.splats = [];
  };

  // ---------------------------------------------------------------- session flow
  P.newSession = function (opts) {
    this.age = this._pendingAge; this.lang = this._pendingLang;
    this.sessions++;
    this._clearRound(); this.cur = null; this.state = 'menu';
    var last = (opts && opts.lastTopics) || this.lastTopics || null;
    this.levels = SP.Content.topicsFor(this.age, this.rng, last);
    this._surpriseOff = this.rng.int(0, Math.max(0, this.cfg.surpriseTypes.length - 1));
    this.stars = 0; this.pictures = 0; this.gallery = []; this._prevPics = [];
    this.weather = 0;
    this._emit({ type: 'session', levels: this.levels.slice() });
    this.startLevel(0);
  };
  P._clearRound = function () {
    this.picture = null; this.parts = []; this.st = {}; this.shells = []; this.step = -1; this._press = null; this.fishy = null; this.clam = null;
    this.hintHand = null; this.splats = []; this._stepDone = false; this._waitAsk = -1;
    var B = this.brush; B.job = null; B.state = 'rest'; B.color = null; B.hex = null; B.dip = 0;
    if (this.layout) { B.x = B._px = this.layout.brush.x; B.y = B._py = this.layout.brush.y; }
    var p = this.pic; p.x = p._px = 0; p.y = p._py = 0; p.vy = 0; p.rot = p._prot = 0; p.sx = p.sy = p._psx = p._psy = 1; p.wig = p._pwig = 0; p.alpha = p._palpha = 0;
  };
  P.startLevel = function (i) {
    if (!this.levels.length) this.levels = SP.Content.topicsFor(this.age);
    this.level = clamp(i | 0, 0, this.levels.length - 1);
    this.topic = this.levels[this.level];
    this.weather = this.level % 4;
    this.round = 0; this.levelStars = 0; this.levelStartTime = this.time;
    this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.cur = null; this.talk = null; this.talkAnswered = null; this.surprise = null;
    var SR = this.cfg.surpriseRounds || [2];
    this._surpriseRound = SR[this.rng.int(0, SR.length - 1)];
    this._clearRound();
    this._relayout(false);
    this._setState('intro'); this.phase = null;
    this._mood('wave', 1.6);
    this._emit({ type: 'level', level: this.level, topic: this.topic, weather: this.weather });
  };

  P._beginRound = function () {
    var cfg = this.cfg, self = this;
    var rr = new SP.RNG((this.rng.next() * 4294967296) >>> 0);
    var ST = cfg.surpriseTypes, sp = ST && ST.length && this.round === this._surpriseRound && this.round > 0 ? ST[(this.level + this._surpriseOff) % ST.length] : null;
    var el = this.time - this.levelStartTime, sb = cfg.shortBudget, short = !!(sb && this.round > 0 && el > sb[Math.min(this.round, sb.length - 1)]);
    var cur = SP.Content.makeRound(this.topic, { age: this.age, lang: this.lang, rng: rr, roundIndex: this.round, surprise: sp, prevPics: this._prevPics.slice(), short: short, level: this.level });
    this._prevPics.push(cur.templateId);
    this._clearRound();
    this.cur = cur; this.surprise = sp;
    this.misses = 0; this.stepMisses = 0; this.streak = 0;
    this._relayout(true);
    if (sp === 'pearl' && !this.layout.clam) { this.surprise = sp = cur.surprise = 'fishy'; this._relayout(true); }   // no room on the sand: the fishy comes
    var L = this.layout;
    this.picture = cur.pic;
    this.parts = cur.pic.parts.map(function (q) {
      var o = { id: q.id, src: q, role: q.role, nameKind: q.nameKind, nameValue: q.nameValue, size: q.size, text: q.text, def: q.def,
        color: null, t: 0, _pt: 0, u: 0, ox: q.cx, oy: q.cy, glow: 0, _glowT: 0, base: 0, wob: 0, _pwob: 0, wv: 0, sparkle: 0,
        painted: false, filling: false, done: false, fillTime: cfg.fillTime, _safe: null };
      self.st[q.id] = o;
      return o;
    });
    this.shells = (cur.palette || []).map(function (c, i) {
      var sl = L.palette.slots[i] || { x: L.W / 2, y: L.palette.y, r: cfg.shellR };
      return { color: c, hex: hexOf(c), x: sl.x, y: sl.y, r: sl.r, pop: 0, _ppop: 0, lift: 0, _plift: 0, lv: 0, wob: 0, _pwob: 0, wv: 0,
        glow: 0, _glowT: 0, dim: 0, selected: false, _popAt: cfg.shellDelay + i * cfg.shellStagger, _popped: false };
    });
    var pc = this.pic; pc.y = pc._py = cfg.enterFrom * L.H; pc.vy = 0; pc.alpha = pc._palpha = 1;
    if (sp === 'pearl' && L.clam) this.clam = { x: L.clam.x, y: L.clam.y, w: L.clam.w, h: L.clam.h, open: 0, _popen: 0, ov: 0, taps: 0, openT: 0, glow: 0 };
    this._fishyNext = sp === 'fishy' ? cfg.fishyAt : -1; this._fishyPasses = 0;
    this._idleT = 0; this._idleGap = cfg.idleTime; this._idleN = 0;
    this._setState('round'); this._setPhase('enter');
    this._mood('happy', 1.2);
    var C = L.canvas;
    this._emit({ type: 'round', round: this.round, topic: this.topic, surprise: sp, picId: cur.pic.id, templateId: cur.templateId, alive: cur.pic.alive,
      palette: cur.palette ? cur.palette.slice() : null, steps: cur.steps.length, mode: cur.steps[0].mode, short: cur.short });
    this._emit({ type: 'bubbles', x: C.x + C.w / 2, y: C.y + C.h, n: 10 });
    if (this.clam) this._emit({ type: 'pearl', x: this.clam.x, y: this.clam.y - this.clam.h / 2 });
  };

  P._ask = function (first) {
    var cfg = this.cfg, s = this.stepInfo, B = this.brush;
    this._stepDone = false; this._waitAsk = -1; this.stepMisses = 0; this._noProg = 0;
    if (s.mode === 'pickColor' || s.mode === 'pickTap') { B.color = null; B.hex = null; }   // Nini rinses the brush
    else { B.color = s.color; B.hex = hexOf(s.color); }
    for (var i = 0; i < this.parts.length; i++) this.parts[i].base = 0;
    if (s.mode === 'pickColor') this.st[s.targets[0]].base = cfg.pickGlow;
    for (i = 0; i < this.shells.length; i++) this.shells[i].selected = false;
    this._idleT = 0; this._idleGap = cfg.idleTime; this._idleN = 0;
    this._mood('talk', 1.0);
    this._emit({ type: 'ask', promptKey: s.promptKey, params: s.params, mode: s.mode, step: this.step, steps: this.cur.steps.length, first: !!first, round: this.round,
      color: s.color, nameKind: s.nameKind, nameValue: s.nameValue, need: s.need });
  };

  P._startTalk = function () {
    var rr = new SP.RNG((this.rng.next() * 4294967296) >>> 0);
    this.talk = SP.Content.makeTalk(this.topic, { age: this.age, lang: this.lang, rng: rr });
    this.talk.glowAnswer = false;
    this.talkAnswered = null; this._talkAskT = 0; this._talkAsks = 0;
    this.cur = null; this.phase = null;
    this._clearRound();
    this._setState('talk');
    this._mood('talk', 1.2);
    this._emit({ type: 'talk', talk: this.talk });
  };
  P.talkAnswer = function (choiceId, auto) {
    if (this.state !== 'talk' || this.talkAnswered || !this.talk) return false;
    var ok = choiceId === this.talk.answer && !auto;
    this.talkAnswered = { choiceId: choiceId, correct: ok, auto: !!auto };
    if (ok) { this.stars += 1; this.levelStars += 1; this._mood('cheer'); } else this._mood(auto ? 'happy' : 'think');
    this.stateTime = 0;
    this._emit({ type: 'talkResult', correct: ok, choiceId: choiceId, answerId: this.talk.answer, auto: !!auto });
    return ok;
  };
  P._levelDone = function () { this._setState('levelDone'); this.phase = null; this._emit({ type: 'levelDone', level: this.level, stars: this.levelStars }); };

  // ---------------------------------------------------------------- input (logical px; ONE active pointer)
  P._touch = function () { this._idleT = 0; this._idleGap = this.cfg.idleTime; };
  /** What is under (x, y): {kind:'shell', shell} | {kind:'part', part} | null (nearest shell within the hit radius first,
   *  then the picture part, hitPad included). */
  P._under = function (x, y) {
    var best = null, bd = 1e9, R = this.layout.palette.hitR, i;
    for (i = 0; i < this.shells.length; i++) { var sh = this.shells[i], d = hyp(x - sh.x, y - sh.y); if (d <= R && d < bd) { bd = d; best = sh; } }
    if (best) return { kind: 'shell', shell: best };
    if (!this.picture) return null;
    var C = this.layout.canvas, F = this.layout.frame;
    if (x < C.x - F || x > C.x + C.w + F || y < C.y - F || y > C.y + C.h + F) return null;
    var q = this.screenToPic(x, y), id = SP.Pictures.hit(this.picture, q.x, q.y, this.cfg.hitPad);
    return id && this.st[id] ? { kind: 'part', part: this.st[id] } : null;
  };
  /** → 'fishy' | 'clam' | 'press' | null.  The fishy and the clam react on the press (a moving / small target).
   *  While a step is interactive a shell or an unpainted part under the finger wins over the fishy swimming across it
   *  (functional P2-2: a counting child never loses a right tap to the surprise). */
  P.pointerDown = function (x, y) {
    if (this.state !== 'round' || this._press) return null;
    var fh = this.fishyHit();
    if (fh && hyp(x - fh.x, y - fh.y) <= fh.r) {
      var u = this.interactive ? this._under(x, y) : null;
      if (!u || (u.kind === 'part' && u.part.painted)) { this._tapFishy(); return 'fishy'; }
    }
    var ch = this.clamHit();
    if (ch && hyp(x - ch.x, y - ch.y) <= ch.r) { this._tapClam(); return 'clam'; }
    this._press = { x: x, y: y, t: this.time, maxD: 0 };
    return 'press';
  };
  P.pointerMove = function (x, y) { var p = this._press; if (p) p.maxD = Math.max(p.maxD, hyp(x - p.x, y - p.y)); };
  /** A tap = press + release within tapTime and < tapMovePx (a drag is ignored); handled at the PRESS position.
   *  → 'pick' | 'wrong' | 'paint' | 'needPaint' | 'notThis' | 'already' | 'pokeNini' | null */
  P.pointerUp = function (x, y) {
    var p = this._press;
    this._press = null;
    if (!p || this.state !== 'round') return null;
    var mv = Math.max(p.maxD, x === undefined ? 0 : hyp(x - p.x, y - p.y));
    if (mv >= this._tapMove() || this.time - p.t > this.cfg.tapTime) { this._soft(p.x, p.y, mv >= this._tapMove() ? 'drag' : 'hold'); return null; }
    return this.tap(p.x, p.y);
  };
  /** A press that was not a tap (held > tapTime or moved ≥ tapMovePx): no paint, but a soft answer — what is under the
   *  press point gives a tiny wobble and the event 'soft' lets main.js play the soft sound (functional P3-1). */
  P._soft = function (x, y, kind) {
    var u = this._under(x, y), cfg = this.cfg, ev = { type: 'soft', kind: kind, target: null, x: x, y: y };
    if (u && u.kind === 'shell') { u.shell.wv += kickFor(cfg.softShellWob, cfg.shellWobOmega, cfg.shellWobZeta); ev.target = 'shell'; ev.color = u.shell.color; }
    else if (u && u.kind === 'part') { u.part.wv += kickFor(cfg.softWob, cfg.partOmega, cfg.partZeta); ev.target = 'part'; ev.partId = u.part.id; }
    this._emit(ev);
  };
  P.cancelDrag = function () { this._press = null; };
  /** One tap at (x, y) (logical px), already classified as a tap. */
  P.tap = function (x, y) {
    if (this.state !== 'round') return null;
    var nb = this._niniBox();
    var onNini = x >= nb.x && x <= nb.x + nb.w && y >= nb.y && y <= nb.y + nb.h;
    if (!this.interactive) return onNini ? this._pokeNini() : null;
    // shells (nearest centre within the hit radius)
    var best = null, bd = 1e9, i, R = this.layout.palette.hitR;
    for (i = 0; i < this.shells.length; i++) { var sh = this.shells[i], d = hyp(x - sh.x, y - sh.y); if (d <= R && d < bd) { bd = d; best = sh; } }
    var C = this.layout.canvas, F = this.layout.frame;
    var onCanvas = x >= C.x - F && x <= C.x + C.w + F && y >= C.y - F && y <= C.y + C.h + F;
    if ((best || onCanvas) && this._noProg >= this._assistAfter()) return this._assist(x, y);
    if (best) return this._tapShell(best);
    // parts of the picture
    if (onCanvas) {
      var q = this.screenToPic(x, y), id = SP.Pictures.hit(this.picture, q.x, q.y, this.cfg.hitPad);
      if (id && this.st[id]) return this._tapPart(this.st[id], q, x, y);
      this._noProgress();   // the empty canvas around the drawing
      return null;
    }
    if (onNini) return this._pokeNini();
    // empty sand / water (the HUD and bubble never reach the world): no mistake, no star lost, but it counts as a tap
    // without progress toward the hint and the assist (playtest P1-3: a child who never touches the picture still finishes)
    if (this._noProg >= this._assistAfter()) return this._assist(x, y);
    this._noProgress();
    return null;
  };

  P._assistAfter = function () { return this.age <= this.cfg.assistMaxAge ? this.cfg.assistAfter : this.cfg.assistAfterOld; };
  /** A tap that made no progress (wrong / needPaint / notThis / empty canvas): the 2nd one shows a hint. */
  P._noProgress = function () { this._noProg++; if (this._noProg >= this.cfg.hintAfterMisses) this._autoHint(false); };
  /** After many taps without progress in one step (a toddler tapping around), the next tap on the canvas or a shell does
   *  the right next thing — Nini guides the brush (event 'assist'). Misses already made still count for the stars. */
  P._assist = function (x, y) {
    var a = this.answer();
    if (!a) return null;
    this._noProg = 0;
    this._emit({ type: 'assist', target: a.shell ? 'shell' : 'part', id: a.shell || a.part, x: x, y: y });
    if (a.shell) return this._tapShell(this.shellByColor(a.shell));
    var p = this.st[a.part], sp = this.partTap(p.id), q = this.screenToPic(sp.x, sp.y);
    return this._tapPart(p, q, sp.x, sp.y);
  };
  P._pokeNini = function () {
    var a = this.prompt(), N = this.layout.nini;
    if (!a) return null;
    this._touch();
    this._mood('talk', 1.0);
    this._emit({ type: 'pokeNini', promptKey: a.promptKey, params: a.params, mode: a.mode, step: a.step, follow: !!a.follow, x: N.x, y: N.y - 0.7 * N.h });
    return 'pokeNini';
  };
  P._tapShell = function (sh) {
    var s = this.stepInfo, cfg = this.cfg;
    if (sh.color === s.color) {
      if (this._loaded()) {
        sh.lv += kickFor(0.25, cfg.shellLiftOmega, cfg.shellLiftZeta);
        this._emit({ type: 'pick', color: sh.color, again: true, x: sh.x, y: sh.y });
        return 'pick';
      }
      this.streak = 0; this._noProg = 0; this._touch();
      sh.lv += kickFor(0.8, cfg.shellLiftOmega, cfg.shellLiftZeta);
      for (var i = 0; i < this.shells.length; i++) this.shells[i].selected = this.shells[i] === sh;
      sh._glowT = 0;
      if (this.hintHand && this.hintHand.target === 'shell') this.hintHand = null;
      var self = this;
      this.brush.color = sh.color; this.brush.hex = sh.hex;   // logically loaded at once (a fast part tap still paints)
      this._brushTo('shell', sh.x, sh.y - 0.15 * sh.r, function () { self._emit({ type: 'dip', color: sh.color, x: sh.x, y: sh.y }); });
      this._mood('happy');
      this._emit({ type: 'pick', color: sh.color, x: sh.x, y: sh.y });
      if (s.mode === 'pickColor') {
        var tp = this.st[s.targets[0]], P0 = this.partTap(tp.id);
        this._emit({ type: 'ask', promptKey: 'p.tapPart', params: { part: s.nameValue, color: s.color }, mode: s.mode, step: this.step, steps: this.cur.steps.length,
          first: false, follow: true, round: this.round, color: s.color, nameKind: s.nameKind, nameValue: s.nameValue, x: P0.x, y: P0.y });
      }
      return 'pick';
    }
    sh.wv += kickFor(cfg.shellWob, cfg.shellWobOmega, cfg.shellWobZeta) * (this._crng.chance(0.5) ? 1 : -1);
    if (this._loaded()) {   // the right paint is already on the brush: just "paint the shining part" (not a mistake)
      this._emit({ type: 'notThis', kind: 'shell', color: sh.color, want: { nameKind: s.nameKind, nameValue: s.nameValue }, x: sh.x, y: sh.y });
      this._noProgress();
      return 'notThis';
    }
    this.misses++; this.stepMisses++; this.streak++; this._touch();
    this._splat(sh.x, sh.y - 0.3 * sh.r, sh.color, 0.55);
    this._mood('oops');
    this._emit({ type: 'wrong', kind: 'color', color: sh.color, got: { nameKind: 'color', nameValue: sh.color }, want: { nameKind: 'color', nameValue: s.color },
      streak: this.streak, misses: this.misses, x: sh.x, y: sh.y });
    this._noProgress();
    return 'wrong';
  };
  P._tapPart = function (p, q, X, Y) {
    var s = this.stepInfo, cfg = this.cfg, isT = s.targets.indexOf(p.id) >= 0;
    if (p.painted) { this._touch(); this._emit({ type: 'already', partId: p.id, nameKind: p.nameKind, nameValue: p.nameValue, x: X, y: Y }); return 'already'; }
    var want = { nameKind: s.nameKind, nameValue: s.nameValue, partId: s.targets[0] };
    if (s.mode === 'pickColor' || s.mode === 'pickTap') {
      if (!this._loaded()) {
        this._emit({ type: 'needPaint', color: s.color, partId: p.id, x: X, y: Y });
        this._noProgress();   // keeps tapping the picture: the 2nd time the shell is shown
        return 'needPaint';
      }
    }
    if (s.mode === 'pickColor') {
      if (!isT) { this._emit({ type: 'notThis', kind: 'part', partId: p.id, nameKind: p.nameKind, nameValue: p.nameValue, want: want, x: X, y: Y }); this._noProgress(); return 'notThis'; }
      return this._claim(p, q, X, Y);
    }
    if (s.mode === 'count') {
      var claimed = this._claimedCount();
      if (claimed >= s.need) return null;   // N reached: the step finishes, extra taps do nothing
      if (isT) return this._claim(p, q, X, Y, { i: claimed + 1, n: s.need });
    } else if (isT) return this._claim(p, q, X, Y);
    if (p.role !== s.role) { this._emit({ type: 'notThis', kind: 'part', partId: p.id, nameKind: p.nameKind, nameValue: p.nameValue, want: want, x: X, y: Y }); this._noProgress(); return 'notThis'; }
    // a wrong part of the asked kind: it wobbles, kind words
    this.misses++; this.stepMisses++; this.streak++; this._touch();
    p.wv += kickFor(cfg.partWob, cfg.partOmega, cfg.partZeta) * (this._crng.chance(0.5) ? 1 : -1);
    this._mood('oops');
    this._emit({ type: 'wrong', kind: 'part', partId: p.id, got: { nameKind: p.nameKind, nameValue: p.nameValue, size: p.size }, want: want, streak: this.streak,
      misses: this.misses, x: X, y: Y });
    this._noProgress();
    return 'wrong';
  };
  P._claimedCount = function () {
    var s = this.stepInfo, n = 0;
    for (var i = 0; i < s.targets.length; i++) if (this.st[s.targets[i]].painted) n++;
    return n;
  };
  /** A right tap: the part is painted (logically now); the brush flies there and the colour spreads on contact. */
  P._claim = function (p, q, X, Y, count) {
    var s = this.stepInfo, self = this, color = this.brush.color || s.color, hex = hexOf(color);
    p.painted = true; p.color = hex; p.colorName = color; p.ox = q.x; p.oy = q.y;
    this.streak = 0; this._noProg = 0; this._touch();
    p.base = 0; p._glowT = 0;
    if (this.hintHand && this.hintHand.id === p.id) this.hintHand = null;
    var stepI = this.step;
    this._brushTo('part', X, Y, function () {
      p.filling = true; p.u = 0;
      p.wv += kickFor(self.cfg.paintWob, self.cfg.partOmega, self.cfg.partZeta);
      self._splat(X, Y, color, 1);
      var ev = { type: 'paint', partId: p.id, color: color, hex: hex, role: p.role, nameKind: p.nameKind, nameValue: p.nameValue, size: p.size, step: stepI, x: X, y: Y };
      if (count) ev.count = count;
      self._emit(ev);
    });
    this._mood('paint');
    if (count ? count.i >= count.n : true) { this._stepDone = true; this.hintHand = null; for (var i = 0; i < this.shells.length; i++) this.shells[i]._glowT = 0; }
    return 'paint';
  };
  P._splat = function (x, y, color, k) { this.splats.push({ x: x, y: y, color: color, hex: hexOf(color), r: 34 * (k || 1), t: 0 }); if (this.splats.length > 8) this.splats.shift(); };

  P._tapFishy = function () {
    var f = this.fishy;
    this._touch();
    f.state = 'happy'; f.t = 0;
    this._emit({ type: 'fishyTap', x: f.x, y: f.y, dir: f.dir });
  };
  P._tapClam = function () {
    var c = this.clam, cfg = this.cfg;
    this._touch();
    c.taps++; c.openT = cfg.clamOpenTime; c.ov += kickFor(0.25, cfg.clamOpenOmega, cfg.clamOpenZeta);
    this._emit({ type: 'pearlTap', x: c.x, y: c.y - 0.5 * c.h, taps: c.taps });
  };

  // ---------------------------------------------------------------- brush
  /** Send the brush to (x, y) (tip); `cb` fires on arrival (dip / dab contact). A job still under way fires at once. */
  P._brushTo = function (kind, x, y, cb) {
    var B = this.brush, cfg = this.cfg;
    if (B.job) this._finishJob(false);
    var d = hyp(x - B.x, y - B.y), T = clamp(cfg.brushFlyMin + d * cfg.brushFlyPerPx, cfg.brushFlyMin, cfg.brushFlyMax);
    B.job = { kind: kind, x0: B.x, y0: B.y, x1: x, y1: y, T: T, t: 0, H: cfg.brushArc + cfg.brushArcPerPx * d, cb: cb, fired: false, hold: 0 };
    B.state = 'fly';
    this._emit({ type: 'whoosh', to: kind, x: x, y: y });
  };
  /** Complete the current job now (its effect happens; snap = also jump the brush to rest). */
  P._finishJob = function (snap) {
    var B = this.brush, J = B.job;
    if (!J) return;
    if (!J.fired) { J.fired = true; if (J.cb) J.cb(); }
    B.job = null; B.dip = 0;
    if (snap) { B.state = 'rest'; B.x = this.layout.brush.x; B.y = this.layout.brush.y; }
  };
  P._stepBrush = function (h) {
    var B = this.brush, cfg = this.cfg, L = this.layout, J = B.job, restA = -0.5;
    if (J) {
      J.t += h;
      if (B.state === 'fly') {
        var u = clamp(J.t / J.T, 0, 1), sU = smooth(u);
        var x = lerp(J.x0, J.x1, sU), y = lerp(J.y0, J.y1, sU) - J.H * 4 * sU * (1 - sU);
        var vx = (x - B.x) / h;
        B.x = x; B.y = y;
        B.angle += (clamp(restA * 0.4 - vx * 0.0006, -1.1, 0.9) - B.angle) * Math.min(1, h * 14);
        if (u >= 1) { B.state = J.kind === 'shell' ? 'dip' : J.kind === 'rest' ? 'rest' : 'dab'; J.t = 0; if (J.kind === 'rest') B.job = null; }
      } else if (B.state === 'dip' || B.state === 'dab') {
        var Td = B.state === 'dip' ? cfg.dipTime : cfg.dabTime, depth = B.state === 'dip' ? cfg.dipDepth : cfg.dabDepth, v = clamp(J.t / Td, 0, 1);
        B.dip = Math.sin(Math.PI * v);
        B.x = J.x1; B.y = J.y1 + depth * B.dip;
        B.angle += (0 - B.angle) * Math.min(1, h * 16);
        if (!J.fired && (B.state === 'dab' || v >= 0.5)) { J.fired = true; if (J.cb) J.cb(); }
        if (v >= 1) {
          J.hold += h;
          B.dip = 0;
          if (J.hold >= cfg.brushRestDelay) {
            var R = L.brush;
            B.job = { kind: 'rest', x0: B.x, y0: B.y, x1: R.x, y1: R.y, T: clamp(cfg.brushFlyMin + hyp(R.x - B.x, R.y - B.y) * cfg.brushFlyPerPx, cfg.brushFlyMin, cfg.brushFlyMax),
              t: 0, H: cfg.brushArc * 0.6, cb: null, fired: true, hold: 0 };
            B.state = 'fly';
          }
        }
      }
    } else if (this.phase === 'finish' && this._sweepTarget) {
      var T2 = this._sweepTarget;
      B.state = 'fly';
      B.x += (T2.x - B.x) * Math.min(1, h * 18); B.y += (T2.y - B.y) * Math.min(1, h * 18);
      B.angle += (0.2 * Math.sin(TAU * 3 * this.phaseTime) - B.angle) * Math.min(1, h * 10);
      B.dip = 0.4 + 0.3 * Math.sin(TAU * 6 * this.phaseTime);
    } else {
      // resting in Nini's flipper: a slow breathing bob
      var tx = L.brush.x, ty = L.brush.y + cfg.brushBob * Math.sin(TAU * 0.45 * this.time);
      B.x += (tx - B.x) * Math.min(1, h * 12); B.y += (ty - B.y) * Math.min(1, h * 12);
      B.angle += (restA - B.angle) * Math.min(1, h * 8);
      B.dip += (0 - B.dip) * Math.min(1, h * 10);
      B.state = 'rest';
    }
  };

  // ---------------------------------------------------------------- help
  P.resetNudges = function () {
    this._idleT = 0; this._idleGap = this.cfg.idleTime; this._idleN = 0;
    this._talkAskT = 0; this._talkAsks = 0;
    if (this.talk) this.talk.glowAnswer = false;
  };
  P._glowing = function () {
    for (var i = 0; i < this.parts.length; i++) if (this.parts[i]._glowT > 0) return true;
    for (i = 0; i < this.shells.length; i++) if (this.shells[i]._glowT > 0) return true;
    return false;
  };
  P._autoHint = function (fromIdle) {
    if (this._glowing() || this.time - this._lastHintT < this.cfg.hintCooldown) return null;
    return this._doHint(fromIdle);
  };
  P._doHint = function (fromIdle) {
    var a = this.answer(), cfg = this.cfg;
    if (!a) return null;
    var H = { target: a.shell ? 'shell' : 'part', id: a.shell || a.part, x: 0, y: 0, x0: 0, y0: 0, t: 0, alpha: 0, time: 0, T: cfg.hintTime };
    if (a.shell) this.shellByColor(a.shell)._glowT = cfg.hintTime; else this.st[a.part]._glowT = cfg.hintTime;
    this.hintHand = H; this._hintGeo();
    this._lastHintT = this.time;
    this._mood('point', cfg.hintTime);
    var ev = { type: 'hint', target: H.target, id: H.id, x: H.x0, y: H.y0, color: this.stepInfo.color, want: { nameKind: this.stepInfo.nameKind, nameValue: this.stepInfo.nameValue } };
    if (fromIdle) ev.idle = true;
    this._emit(ev);
    return { target: H.target, id: H.id };
  };
  /** Manual hint (e.g. a tap on the bubble): the right shell / part glows + the ghost hand. → {target, id} | null */
  P.hint = function () {
    if (!this.interactive) return null;
    if (this.hintHand) return { target: this.hintHand.target, id: this.hintHand.id };
    return this._doHint(false);
  };
  P._hintGeo = function () {
    var H = this.hintHand;
    if (!H) return;
    var p = H.target === 'shell' ? this.shellHit(H.id) : this.partTap(H.id);
    if (!p) { this.hintHand = null; return; }
    H.x0 = p.x; H.y0 = p.y;
  };
  P._stepHint = function (h) {
    var H = this.hintHand, cfg = this.cfg;
    if (!H) return;
    H.time += h;
    if (H.time >= H.T || !this.interactive) { this.hintHand = null; return; }
    this._hintGeo();
    var u = (H.time % cfg.hintCycle) / cfg.hintCycle, press = Math.sin(Math.PI * clamp((u - 0.35) / 0.3, 0, 1));
    H.t = u;
    H.x = H.x0 + 26 * (1 - smooth(u / 0.35)) * (u < 0.35 ? 1 : 0);
    H.y = H.y0 + 30 * (1 - smooth(u / 0.35)) * (u < 0.35 ? 1 : 0) - 10 * (1 - press) * (u >= 0.35 ? 1 : 0) + 3 * press;
    H.press = press;
    H.alpha = clamp(H.time / 0.25, 0, 1) * clamp((H.T - H.time) / 0.35, 0, 1);
  };

  // ---------------------------------------------------------------- simulation
  P.update = function (dt) {
    if (!(dt > 0)) return;
    var h = this.cfg.step;
    this._acc += Math.min(dt, this.cfg.maxFrame);
    while (this._acc >= h - 1e-12) { this._acc -= h; this._step(h); }
    if (this._acc < 0) this._acc = 0;
    this.alpha = this._acc / h;
  };
  P._twins = function () {
    var i, pc = this.pic, B = this.brush;
    pc._px = pc.x; pc._py = pc.y; pc._prot = pc.rot; pc._psx = pc.sx; pc._psy = pc.sy; pc._pwig = pc.wig; pc._palpha = pc.alpha;
    B._px = B.x; B._py = B.y; B._pangle = B.angle; B._pdip = B.dip;
    for (i = 0; i < this.parts.length; i++) { var p = this.parts[i]; p._pt = p.t; p._pwob = p.wob; }
    for (i = 0; i < this.shells.length; i++) { var s = this.shells[i]; s._ppop = s.pop; s._plift = s.lift; s._pwob = s.wob; }
    if (this.fishy) { this.fishy._px = this.fishy.x; this.fishy._py = this.fishy.y; this.fishy._pwig = this.fishy.wig; }
    if (this.clam) this.clam._popen = this.clam.open;
  };
  P._step = function (h) {
    var cfg = this.cfg;
    this._twins();
    this.time += h; this.stateTime += h; this.phaseTime += h;
    switch (this.state) {
      case 'intro': if (this.stateTime >= cfg.introTime) this._beginRound(); break;
      case 'round': this._stepRound(h); break;
      case 'roundDone': if (this.stateTime >= cfg.clearTime) this._nextRound(); break;
      case 'talk':
        if (this.talkAnswered) { if (this.stateTime >= cfg.talkAfterAnswer) this._levelDone(); break; }
        this._talkAskT += h;
        if (this._talkAsks < cfg.talkMaxAsks && this._talkAskT >= cfg.talkAskTime - 1e-9) {
          this._talkAskT = 0; this._talkAsks++;
          if (this._talkAsks >= cfg.talkGlowAfterAsks) this.talk.glowAnswer = true;
          this._emit({ type: 'talkAsk', talk: this.talk, n: this._talkAsks, glowAnswer: this.talk.glowAnswer });
        } else if (this._talkAsks >= cfg.talkMaxAsks && this._talkAskT >= cfg.talkGiveUp - 1e-9) this.talkAnswer(this.talk.answer, true);   // Nini answers herself
        break;
      case 'levelDone':
        if (this.stateTime >= cfg.levelDoneTime) {
          if (this.level < this.levels.length - 1) this.startLevel(this.level + 1);
          else {
            this._setState('sessionDone'); this.phase = null;
            this.lastTopics = this.levels.slice();
            this._emit({ type: 'sessionDone', stars: this.stars, pictures: this.pictures, gallery: this.gallery.slice() });
          }
        }
        break;
    }
    if (this.state === 'round') {
      this._stepParts(h); this._stepShells(h); this._stepBrush(h); this._stepSurprises(h); this._stepHint(h);
      for (var i = this.splats.length - 1; i >= 0; i--) { var sp = this.splats[i]; sp.t += h / cfg.splatTime; if (sp.t >= 1) this.splats.splice(i, 1); }
    }
    var gT = this.state === 'round' && (this.phase === 'finish' || (this.phase === 'alive' && this.phaseTime < 0.6)) ? 1 : 0;
    this.canvasGlow += (gT - this.canvasGlow) * Math.min(1, h * 5);
    this._stepNini(h);
  };

  P._stepRound = function (h) {
    var cfg = this.cfg, pc = this.pic, L = this.layout;
    switch (this.phase) {
      case 'enter': {
        spring(pc, 'y', 'vy', 0, cfg.enterOmega, cfg.enterZeta, h);
        var u = clamp(this.phaseTime / cfg.enterTime, 0, 1);
        pc.rot = cfg.enterSway * Math.sin(TAU * 0.9 * this.phaseTime) * (1 - u) * (1 - u);
        pc.alpha = clamp(this.phaseTime / 0.25, 0, 1);
        if (this.phaseTime >= cfg.enterTime) {
          pc.y = pc._py = 0; pc.vy = 0; pc.rot = pc._prot = 0; pc.alpha = 1;
          this._setPhase('paint'); this.step = 0;
          this._ask(true);
        }
        break;
      }
      case 'paint': {
        if (this._stepDone) {
          if (this._waitAsk < 0 && this._stepComplete()) {
            this._waitAsk = cfg.askGap;
            this._emit({ type: 'stepDone', step: this.step, steps: this.cur.steps.length, last: this.step >= this.cur.steps.length - 1 });
            this._mood('happy');
          }
          if (this._waitAsk >= 0) {
            this._waitAsk -= h;
            if (this._waitAsk <= 0) {
              if (this.step < this.cur.steps.length - 1) { this.step++; this._ask(false); }
              else this._startFinish();
            }
          }
          break;
        }
        if (!this._press) {
          this._idleT += h;
          if (this._idleT >= this._idleGap - 1e-9) {
            this._idleT = 0; this._idleGap = Math.min(cfg.idleMax, this._idleGap * cfg.idleBackoff); this._idleN++;
            this._mood('think');
            var a = this.prompt();
            this._emit({ type: 'idle', n: this._idleN, promptKey: a.promptKey, params: a.params, mode: a.mode, step: a.step, follow: !!a.follow });
            if (this._idleN >= cfg.idleHintFrom) this._autoHint(true);
          }
        }
        break;
      }
      case 'finish':
        this._stepFinish(h);
        break;
      case 'alive':
        this._stepAlive(h);
        if (this.phaseTime >= cfg.aliveTime) {
          var st = this._starsFor(this.misses);
          this.roundStars = st; this.stars += st; this.levelStars += st; this.pictures++;
          var fills = {}; this.parts.forEach(function (p) { fills[p.id] = p.color; });
          this.gallery.push({ picId: this.picture.id, templateId: this.cur.templateId, alive: this.picture.alive, fills: fills, stars: st });
          this._emit({ type: 'roundDone', round: this.round, stars: st, misses: this.misses });
          this._setState('roundDone'); this.phase = 'clear'; this.phaseTime = 0;
          this._press = null; this.hintHand = null;
        }
        break;
    }
    if (L && this.phase !== 'enter' && this.phase !== 'alive' && this.phase !== 'clear' && this.state === 'round') { pc.x = 0; pc.y = 0; pc.rot = 0; pc.sx = pc.sy = 1; pc.wig = 0; pc.alpha = 1; }
  };
  P._stepComplete = function () {
    var s = this.stepInfo, n = 0;
    for (var i = 0; i < s.targets.length; i++) { var p = this.st[s.targets[i]]; if (p.painted) { if (!p.done) return false; n++; } }
    return n >= (s.mode === 'count' ? s.need : 1);
  };
  P._starsFor = function (m) { return m <= 0 ? 3 : m === 1 ? 2 : 1; };
  P._nextRound = function () {
    var cfg = this.cfg;
    this._clearRound(); this.cur = null;
    this.round++;
    var el = this.time - this.levelStartTime, long = this.round >= cfg.chapterMinRounds && el > cfg.chapterTimeLimit;
    if (this.round < this.roundsPerLevel && !long) this._beginRound();
    else { if (this.round < this.roundsPerLevel) this.roundsPerLevel = this.round; this._startTalk(); }
  };

  // ---------------------------------------------------------------- parts / shells
  P._stepParts = function (h) {
    var cfg = this.cfg;
    for (var i = 0; i < this.parts.length; i++) {
      var p = this.parts[i];
      if (p.filling) {
        p.u = Math.min(1, p.u + h / p.fillTime);
        p.t = easeOut3(p.u);
        if (p.u >= 1) {
          p.filling = false; p.done = true; p.t = 1; p.sparkle = 1;
          var c = this.picToScreen(p.src.cx, p.src.cy);
          this._emit({ type: 'filled', partId: p.id, color: p.colorName || null, hex: p.color, sweep: !!p._sweep, x: c.x, y: c.y });
        }
      }
      if (p.sparkle > 0) p.sparkle = Math.max(0, p.sparkle - h / cfg.sparkleTime);
      spring(p, 'wob', 'wv', 0, cfg.partOmega, cfg.partZeta, h);
      if (p._glowT > 0) p._glowT = Math.max(0, p._glowT - h);
      var gT = p._glowT > 0 ? 1 : p.painted ? 0 : p.base;
      p.glow += (gT - p.glow) * Math.min(1, h * (gT > p.glow ? 6 : 3));
    }
  };
  P._stepShells = function (h) {
    var cfg = this.cfg, out = this.phase === 'alive' || this.state !== 'round';
    for (var i = 0; i < this.shells.length; i++) {
      var s = this.shells[i];
      if (out) {
        s.pop = Math.max(0, s.pop - h / cfg.shellOutTime);
      } else if (this.phase === 'enter' || s.pop < 1) {
        var tt = (this.phase === 'enter' ? this.phaseTime : 99) - s._popAt;
        if (tt >= 0 && !s._popped) { s._popped = true; this._emit({ type: 'shellPop', color: s.color, x: s.x, y: s.y }); }
        s.pop = tt <= 0 ? 0 : tt >= cfg.shellPopTime ? 1 : easeOutBack(tt / cfg.shellPopTime);
      }
      var sel = s.selected && this._loaded() && this.phase === 'paint';
      spring(s, 'lift', 'lv', sel ? cfg.shellSel : 0, cfg.shellLiftOmega, cfg.shellLiftZeta, h);
      spring(s, 'wob', 'wv', 0, cfg.shellWobOmega, cfg.shellWobZeta, h);
      if (s._glowT > 0) s._glowT = Math.max(0, s._glowT - h);
      var gT = s._glowT > 0 ? 1 : 0;
      s.glow += (gT - s.glow) * Math.min(1, h * (gT ? 6 : 3));
      var dT = this.phase === 'finish' || this.phase === 'alive' ? 1 : 0;
      s.dim += (dT - s.dim) * Math.min(1, h * 4);
    }
  };

  // ---------------------------------------------------------------- finish: Nini sweeps colour over the rest
  P._startFinish = function () {
    var cfg = this.cfg, rest = this.parts.filter(function (p) { return !p.painted; });
    rest.sort(function (a, b) { return a.src.cx - b.src.cx || a.src.cy - b.src.cy; });
    this._sweep = rest.map(function (p, i) { return { p: p, at: i * cfg.sweepGap, started: false }; });
    this._finishTime = Math.max(cfg.finishMin, (rest.length ? (rest.length - 1) * cfg.sweepGap + cfg.sweepFill : 0) + cfg.finishTail);
    this._sweepTarget = null;
    this.hintHand = null;
    if (this.brush.job) this._finishJob(false);
    for (var i = 0; i < this.parts.length; i++) { this.parts[i].base = 0; this.parts[i]._glowT = 0; }
    this._setPhase('finish');
    this._mood('paint', this._finishTime);
    this._emit({ type: 'finish', n: rest.length });
  };
  P._stepFinish = function (h) {
    var cfg = this.cfg;
    for (var i = 0; i < this._sweep.length; i++) {
      var w = this._sweep[i], p = w.p;
      if (w.started || this.phaseTime < w.at) continue;
      w.started = true;
      p.painted = true; p.color = p.def || '#9FD8D0'; p.colorName = null; p.ox = p.src.cx - 40; p.oy = p.src.cy; p.filling = true; p.u = 0; p.fillTime = cfg.sweepFill; p._sweep = true;
      var c = this.picToScreen(p.src.cx, p.src.cy);
      this._sweepTarget = c;
      this._emit({ type: 'sweep', partId: p.id, hex: p.color, i: i, n: this._sweep.length, x: c.x, y: c.y });
    }
    var allDone = this.parts.every(function (q) { return q.done; });
    if (this.phaseTime >= this._finishTime && allDone) this._startAlive();
  };

  // ---------------------------------------------------------------- alive: the picture comes off the canvas
  P._startAlive = function () {
    this._sweepTarget = null;
    var L = this.layout, C = L.canvas;
    // float / bob leave to the RIGHT / top-right (visual P2-1): a limited rise so the picture does not sit behind the bubble /
    // HUD — at most a quarter of its height above the bubble's bottom by the time it is off the right edge
    var B = L.bubble, rise = clamp(C.y - L.frame - (B.y + B.h) + 0.25 * C.h, 60, 0.35 * (C.y + C.h + 80));
    this._alive = { kind: this.picture.alive || 'swim', dx: L.W - C.x + 80, dy: C.y + C.h + 80, rise: rise, nextBubble: 0.2, hopN: -1 };
    this._setPhase('alive');
    this._mood('cheer', this.cfg.aliveTime);
    this._emit({ type: 'alive', kind: this._alive.kind, x: C.x + C.w / 2, y: C.y + C.h / 2 });
  };
  /** Kinematics per pic.alive (t in s since the start of alive, T = aliveMove). Offsets about the picture's bottom-centre. */
  P._stepAlive = function (h) {
    var A = this._alive, pc = this.pic, t = this.phaseTime, T = this.cfg.aliveMove, C = this.layout.canvas, u, k;
    if (t >= T) { pc.alpha = 0; return; }
    pc.alpha = 1; pc.rot = 0; pc.sx = pc.sy = 1; pc.wig = 0; pc.x = 0; pc.y = 0;
    switch (A.kind) {
      case 'swim': {   // tail beat (skew wave) + anticipation, then constant thrust to the right
        var t0 = 0.25, beat = TAU * 2.8 * t;
        pc.wig = 0.11 * Math.sin(beat) * Math.min(1, t / 0.3);
        pc.sx = 1 + 0.025 * Math.sin(beat * 2); pc.sy = 1 / pc.sx;
        if (t < t0) pc.x = -16 * Math.sin(Math.PI * t / t0);
        else { var a = 2 * A.dx / Math.pow(T - 0.2 - t0, 2); pc.x = 0.5 * a * (t - t0) * (t - t0); }
        pc.y = -7 * Math.sin(TAU * 1.2 * t); pc.rot = -0.04 * Math.min(1, t / 0.4);
        break;
      }
      case 'scuttle': {   // crouch, then sideways hops (parabolic) with squash on every landing
        var crouch = 0.18, period = 0.26, hops = Math.ceil((T - crouch) / period), step = A.dx / (hops - 1.5);
        if (t < crouch) { k = Math.sin(Math.PI * t / crouch); pc.sy = 1 - 0.1 * k; pc.sx = 1 + 0.07 * k; break; }
        var tt = t - crouch, n = Math.floor(tt / period), v = (tt - n * period) / period, air = 0.72;
        if (v < air) { var w = v / air; pc.x = (n + smooth(w)) * step; pc.y = -30 * 4 * w * (1 - w); pc.rot = 0.05 * (n % 2 ? 1 : -1) * Math.sin(Math.PI * w); }
        else { k = Math.sin(Math.PI * (v - air) / (1 - air)); pc.x = (n + 1) * step; pc.sy = 1 - 0.12 * k; pc.sx = 1 + 0.09 * k; }
        if (n !== A.hopN) { A.hopN = n; if (n > 0) this._emit({ type: 'hop', n: n, x: C.x + pc.x + C.w / 2, y: C.y + C.h }); }
        break;
      }
      case 'sail': {   // rocking about the keel + a glide that picks up speed
        u = t / T;
        pc.rot = 0.075 * Math.sin(TAU * 0.9 * t) * (1 - 0.3 * u);
        pc.y = -5 * Math.sin(TAU * 0.9 * t + Math.PI / 2) + 5;
        pc.x = A.dx * Math.pow(Math.max(0, (t - 0.15) / (T - 0.25)), 2.2);
        break;
      }
      case 'bob': {   // a buoyant dip-and-bob, then it drifts away up-right (accelerating), pulsing
        var tb = 0.45;
        pc.sy = 1 + 0.06 * Math.sin(TAU * 1.6 * t); pc.sx = 1 - 0.04 * Math.sin(TAU * 1.6 * t);
        if (t < tb) pc.y = 14 * Math.sin(Math.PI * t / tb);
        else { k = Math.pow((t - tb) / (T - tb - 0.1), 2); pc.x = A.dx * k; pc.y = -A.rise * k - 8 * Math.sin(TAU * 1.6 * (t - tb)); }
        pc.rot = 0.04 * Math.sin(TAU * 0.8 * t) + 0.05 * Math.min(1, Math.max(0, t - tb) / 0.6);   // leans into the drift
        break;
      }
      default: {   // 'float': drifts off to the right, rising a little, with a sideways sway
        u = Math.max(0, t / (T - 0.1));
        k = Math.pow(u, 1.6);
        pc.x = A.dx * k + 36 * Math.sin(TAU * 0.55 * t) * (1 - 0.5 * u);
        pc.y = -A.rise * k;
        pc.rot = 0.07 * Math.sin(TAU * 0.55 * t + 0.6);
        break;
      }
    }
    A.nextBubble -= h;
    if ((A.kind === 'swim' || A.kind === 'float' || A.kind === 'bob') && A.nextBubble <= 0) {
      A.nextBubble = this.cfg.aliveBubbleGap;
      this._emit({ type: 'bubbles', x: C.x + pc.x + (A.kind === 'swim' ? 0.1 : 0.5) * C.w, y: C.y + pc.y + 0.55 * C.h, n: 3 });
    }
  };

  // ---------------------------------------------------------------- surprises
  P._stepSurprises = function (h) {
    var cfg = this.cfg, L = this.layout, f = this.fishy, c = this.clam;
    if (this._fishyNext >= 0 && this.phase === 'paint') {
      this._fishyNext -= h;
      if (this._fishyNext < 0 && !f) {
        var dir = this._crng.chance(0.5) ? 1 : -1;
        f = this.fishy = { x: dir > 0 ? -cfg.fishyW : L.W + cfg.fishyW, y: L.fishY, y0: L.fishY, _px: 0, _py: 0, dir: dir, state: 'swim', t: 0, wig: 0, _pwig: 0, size: cfg.fishyW };
        f._px = f.x; f._py = f.y;
        this._fishyPasses++;
        this._emit({ type: 'fishy', x: dir > 0 ? 0 : L.W, y: f.y, dir: dir });
      }
    }
    if (f) {
      f.t += h;
      var sp = f.state === 'happy' ? cfg.fishyHappySpeed : cfg.fishySpeed;
      f.x += f.dir * sp * h;
      f.y = f.y0 + cfg.fishyBob * Math.sin(TAU * 0.7 * f.t) - (f.state === 'happy' ? 60 * Math.min(1, f.t) : 0);
      f.wig = 0.2 * Math.sin(TAU * (f.state === 'happy' ? 5 : 2.4) * f.t);
      if ((f.dir > 0 && f.x > L.W + cfg.fishyW) || (f.dir < 0 && f.x < -cfg.fishyW)) {
        var again = f.state === 'swim' && this._fishyPasses < cfg.fishyPasses;
        this.fishy = null;
        this._fishyNext = again ? cfg.fishyGapTime : -1;
      }
    }
    if (c) {
      if (c.openT > 0) c.openT = Math.max(0, c.openT - h);
      spring(c, 'open', 'ov', c.openT > 0 ? 1 : 0, cfg.clamOpenOmega, cfg.clamOpenZeta, h);
      c.open = clamp(c.open, -0.05, 1.15);
      c.glow = c.openT > 0 ? 1 : 0.35 + 0.25 * Math.sin(TAU * 0.6 * this.time);
    }
  };

  P._stepNini = function (h) {
    var m = this.nini, cfg = this.cfg, L = this.layout;
    m.x = L.nini.x; m.y = L.nini.y; m.h = L.nini.h;
    if (m.moodT > 0) { m.moodT -= h; if (m.moodT <= 0) { m.moodT = 0; m.mood = 'idle'; } }
    m.blinkT -= h;
    if (m.blink && m.blinkT <= 0) { m.blink = false; m.blinkT = this._crng.float(cfg.blink[0], cfg.blink[1]); }
    else if (!m.blink && m.blinkT <= 0) { m.blink = true; m.blinkT = cfg.blinkTime; }
    var tx = L.canvas.x + L.canvas.w / 2;
    if (this.hintHand) tx = this.hintHand.x;
    else if (this.fishy) tx = this.fishy.x;
    else if (this.brush.state !== 'rest') tx = this.brush.x;
    m.lookX += (tx - m.lookX) * Math.min(1, h * cfg.lookRate);
    m.look = clamp((m.lookX - m.x) / 500, -1, 1);
  };

  SP.World = World;
})(window.SP = window.SP || {});
