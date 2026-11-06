/* Momo's Toy Train — TT.CONFIG + TT.World (headless, deterministic drag-and-load train simulation; DESIGN §2, §5.2)
 *
 * ============================== CONVENTIONS ==============================
 *  Units: logical px (short side 720), seconds, radians, y DOWN, rot > 0 clockwise. Screen space = world space (no camera).
 *  update(dt) runs fixed sub-steps of cfg.step (1/120 s). At the START of every sub-step the world copies the current value of
 *  every moving field into its `_p` twin (items _px/_py/_prot/_psize, train _px/_pwheelRot, couple _pdx, cars _pox/_psq,
 *  hitch/balloon _px/_py, balloon _psway). Render v = _v + (v − _v)·w.alpha.
 *
 *  TRAIN: the whole train is drawn at its PARKED layout position + w.train.x (engine: layout.engine.x0 + train.x).
 *    Car i: left edge = cars[i].x0 + cars[i].ox where ox = train.x + train.couple[i].dx (+ cars[i].shake for the wiggle).
 *    couple[i].dx = car i's total spring offset from its parked spacing (+ = farther from the engine); couple[i].s = the
 *    stretch of the coupling in FRONT of car i (+ stretched / − compressed, |s| ≤ carGap − 4).
 *    wheelRot = rolled distance / cfg.wheelR (rad, negative while rolling left). A wheel of radius r turns wheelRot·wheelR/r.
 *  ITEM (w.items[]): (x, y) = CENTRE; drawn square size it.size (already includes pop-in, lift, the car scale); rot; (sx, sy)
 *    squash about the centre (y already moved so the bottom stays put). it.inCar → draw it between its car's back and front
 *    (it.carId), back rows (higher it.row) first; other items in front of the train; the held item is the LAST element.
 *    it.alpha fades the 'bye' extras of a count round. it.glow 0..1 hint glow. it.bounce = hop height in a moving car (≤ 0,
 *    already included in y).
 *  HINT HAND: w.hintHand null | {kind:'drag'|'tap', x, y (fingertip now), x0, y0, x1, y1, t 0..1 cycle, alpha, itemId, carId}.
 *  HITCH: w.hitch null | {x, y (bottom-centre anchor of bunny_toy.svg), size (drawn px), state 'in'|'ride'|'wave', t, flip}.
 *  BALLOON: w.balloon null | {x, y (string end = tie point), size (drawn height px), sway (rad, + = leans right), bob (px up),
 *    t, popped:false, taps}.
 * ========================================================================
 */
(function (TT) {
  'use strict';

  var CONFIG = {
    // ---- timing / state machine (s)
    step: 1 / 120,             // fixed simulation sub-step (≤ 1/120 per DESIGN)
    maxFrame: 1.0,             // largest dt accepted per update() (speed mode passes big dt)
    roundsPerLevel: 4,         // warm-up + 3
    chapterTimeLimit: 75,      // s since the chapter began: after ≥ chapterMinRounds trains go to Talk time once exceeded
    chapterMinRounds: 3,
    shortBudget: [1e9, 30, 52, 70],   // s into the chapter: a sort round starting later than this carries 1 cargo per car
    introTime: 2.5,            // chapter banner + time-of-day line (the 2.5 s weather crossfade)
    talkAfterAnswer: 1.6,
    levelDoneTime: 1.8,
    talkAskTime: 12,           // s without an answer → talkAsk (re-ask), repeating
    talkGlowAfterAsks: 2,

    // ---- layout (DESIGN §2; px)
    shortSide: 720, minLong: 960, maxLong: 1600, tallRatio: 1.6,
    groundLand: 18, groundPort: 30, trackLand: 40, trackPort: 220, trackTall: 230, trackPortShort: 120, portShortH: 960, portFullH: 1200,
    cargoS: 104, tallScale: 1.2,
    engineW: 240, engineWSmall: 210, smallW: 1100, engineWPort: 150, engineX: 8, portMaxCars: 3, smallCarK: 0.7, engineHFrac: 1.15, cabFrac: 0.45,
    momoDy: 72, momoHFrac: 0.8, whistleR: 34, whistlePad: 26, enginePad: 20,
    carGap: 16, carMaxW: 260, carEdge: 20, carHFrac: 0.62, carHMin: 96, carHMax: 150, wheelH: 26, floorFrac: 0.62,
    rowRaise: 0.28, slotMinGap: 0.45, slotSpan: 0.86, carScaleK: 2.3, carScaleMin: 0.55, carScaleMax: 0.85, bigNeed: 6, carScaleFloor: 0.42,
    centreTrain: true,
    rugEdge: 40, rugBubbleGap: 40, rugGap: 44, rugPortFrac: 0.85, rugTop: 18, keepPad: 16,
    bubbleX: 24, bubbleYLand: 18, bubbleMaxW: 560, bubbleRight: 200, bubbleHLand: 122, bubbleYPort: 110, bubbleHPort: 124,
    hudW: 160, hudH: 96, tunnelDx: 40,
    minSpacing: 1.1, bandShrink: 0.85, minShrink: 0.6, shrinkStep: 0.05, packJitter: 4,

    // ---- touch
    hitFrac: 0.6, hitPad: 14,  // cargo hit: centre ± (0.6·S + 14)
    zoneSide: 30, zoneUp: 90, zoneDown: 20, zoneUpFar: 130, aimTravel: 120,   // a release up to 130 px above a car still lands once the toy travelled ≥ 120 px
    tapHintAfter: 2, tapAssistAfter: 4, tapAssistMaxAge: 4,   // taps (not drags) per round → hint / glide the toy in (ages ≤ 4)
    tapMovePx: 24, tapTime: 0.35, momoTapTime: 0.6, momoHalfW: 0.32, momoPad: 16,
    stillDragTime: 6, stillPx: 8,

    // ---- drag: critically damped spring + pendulum tilt
    dragOmega: 28, grabKeep: 0.5, liftPx: 10, liftRate: 12, liftScale: 1.1,
    tiltK: 0.0016, tiltMax: 0.45, tiltOmega: 9, tiltZeta: 0.35,

    // ---- right drop: ballistic arc into the slot
    flyBase: 0.3, flyPerPx: 1 / 2000, flyMin: 0.35, flyMax: 0.5, flyApex: 60, flyApexFromVy: 0.06, flyApexMax: 140, flyInherit: 0.25,
    landSquash: 0.2, squashOmega: 22, squashZeta: 0.3,
    carSquash: 0.08, carOmega: 18, carZeta: 0.25,

    // ---- wrong / miss / tap / full
    shakeTime: 0.5, shakeWiggles: 3, shakePx: 10,
    wrongReturnTime: 0.55, wrongApex: 45, wobbleAmp: 0.28, wobbleHz: 2.5,
    missReturnTime: 0.5, missApex: 22, tapReturnTime: 0.25, tapApex: 8, fullReturnTime: 0.5, fullApex: 40, homeSquash: 0.07,

    // ---- deal / done
    dealDelay: 0.15, dealStagger: 0.12, popTime: 0.4, dealSettle: 0.1,
    loadedSettle: 0.4, byeTime: 0.6, byeStagger: 0.08,
    bobAmp: 2.5, bobPeriod: [2, 3],

    // ---- train
    arriveTime: 1.6, arriveFrom: 120,
    coupleOmega: 9, coupleZeta: 0.35, coupleGain: 0.75, coupleLag: 0.07, clackMin: 2, coupleRestitution: 0.3,
    wheelR: 22, railJoint: 150,
    whistleTime: 0.8, whistleLead: 0.55, whistleNudge: 6, whistleAuto: 9, tootGap: 0.3,
    departKick: 120, departAccel: 900, departVmax: 900,
    puffSlow: 0.25, puffFast: 0.12, puffIdle: 2.6, chimneyDx: 0.18,
    hopG: 2200, hopRest: 0.35, hopKick: [70, 150], joltKick: [140, 230], cargoTiltK: 0.00025, cargoTiltOmega: 10, cargoTiltZeta: 0.3,
    clearTime: 0.5,

    // ---- help
    hintAfterMisses: 2, hintTime: 3, hintCooldown: 6, hintCycle: 1.4,
    idleTime: 12, idleBackoff: 1.5, idleMax: 30, idleHintFrom: 2,

    // ---- surprises: one round per chapter (never the warm-up), the type rotates per chapter from a random start
    surpriseRound: 2, surpriseTypes: ['hitch', 'balloon'],
    hitchAt: 2.5, hitchHops: 3, hitchApex: 70, hitchG: 2200, hitchPause: 0.12, hitchWave: 1.2, hitchSize: 1.05, hitchR: 70,
    balloonSize: 1.55, balloonOmega: 3.2, balloonZeta: 0.25, balloonDrag: 0.0007, balloonMax: 0.75, balloonBob: 26, balloonR: 0.3,

    // ---- Momo
    moodTime: { happy: 0.9, cheer: 1.6, oops: 0.8, think: 1.4, talk: 1.0, wave: 1.4, whistle: 0.9, point: 1.2 },
    lookRate: 6, blink: [2.2, 5], blinkTime: 0.13
  };
  TT.CONFIG = CONFIG;

  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hyp(x, y) { return Math.sqrt(x * x + y * y); }
  function lerp(a, b, u) { return a + (b - a) * u; }
  function easeOutBack(u) { var c1 = 1.70158, c3 = c1 + 1, v = u - 1; return 1 + c3 * v * v * v + c1 * v * v; }
  function merge(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; if (b) for (k in b) o[k] = b[k]; return o; }
  function keepBoxes(hk) {
    var a = Array.isArray(hk) ? hk : hk ? [hk] : [], out = [];
    for (var i = 0; i < a.length; i++) { var b = a[i]; if (b && b.w > 0 && b.h > 0) out.push({ x: +b.x, y: +b.y, w: +b.w, h: +b.h }); }
    return out;
  }
  function insOf(ins) {
    return { top: +(ins && ins.top) || 0, right: +(ins && ins.right) || 0, bottom: +(ins && ins.bottom) || 0, left: +(ins && ins.left) || 0 };
  }
  function boxHit(b, x, y, pad) { pad = pad || 0; return x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad; }
  /** Distance from (x, y) to the box (0 inside). */
  function boxDist(b, x, y) { var nx = clamp(x, b.x, b.x + b.w), ny = clamp(y, b.y, b.y + b.h); return hyp(x - nx, y - ny); }

  /** DESIGN §2 short-side rule: CSS viewport → logical W×H. */
  function logicalSize(cssW, cssH, cfg) {
    cfg = cfg || CONFIG;
    var S = cfg.shortSide, aspect = cssW / Math.max(1, cssH);
    if (cssW >= cssH) return { W: clamp(Math.round(S * aspect), cfg.minLong, cfg.maxLong), H: S };
    return { W: S, H: clamp(Math.round(S / aspect), cfg.minLong, cfg.maxLong) };
  }

  /** Engine geometry (offsets from the engine's bottom-left at rail level, y up = negative): TT.TrainArt.engineGeom when the
   *  art is loaded and sane, else the DESIGN fallback (cab = right 45 %, whistle on the boiler roof in front of the cab). */
  function engineGeom(E, cfg) {
    var g = null, A = TT.TrainArt;
    if (A && typeof A.engineGeom === 'function') {
      try { g = A.engineGeom(E); } catch (e) { g = null; }
      var ok = g && g.whistle && g.cab && isFinite(g.whistle.x) && isFinite(g.whistle.y) && isFinite(g.cab.x0) && isFinite(g.cab.x1);
      if (ok) {
        var neg = function (v) { return v > 0 ? -v : v; };
        g = { cab: { x0: g.cab.x0, x1: g.cab.x1, floorY: neg(g.cab.floorY || 0) }, whistle: { x: g.whistle.x, y: neg(g.whistle.y), r: g.whistle.r || cfg.whistleR },
          chimney: g.chimney && isFinite(g.chimney.x) ? { x: g.chimney.x, y: neg(g.chimney.y) } : { x: cfg.chimneyDx * E, y: -cfg.engineHFrac * E },
          lamp: g.lamp && isFinite(g.lamp.x) ? { x: g.lamp.x, y: neg(g.lamp.y) } : { x: 0.03 * E, y: -0.45 * E } };
        if (Math.abs(g.whistle.x) <= 1.3 * E && Math.abs(g.whistle.y) <= 1.5 * E && g.cab.x1 > g.cab.x0) return g;
      }
    }
    return { cab: { x0: (1 - cfg.cabFrac) * E, x1: E, floorY: -cfg.momoDy }, whistle: { x: 0.4 * E, y: -0.86 * E, r: cfg.whistleR },
      chimney: { x: cfg.chimneyDx * E, y: -cfg.engineHFrac * E }, lamp: { x: 0.03 * E, y: -0.45 * E } };
  }

  /** Slots of a car (cargo centres, PARKED coordinates). m slots, cargo drawn size cs. Front row first, left → right;
   *  back rows raised rowRaise·S and staggered by half a step. */
  function carSlots(c, m, S, cs, cfg) {
    var out = [], span = cfg.slotSpan * c.w, cx = (c.x0 + c.x1) / 2, rise = cfg.rowRaise * cs / cfg.carScaleMax;
    var minGap = Math.max(0.5 * cs, m <= cfg.bigNeed ? cfg.slotMinGap * S : 0);
    var cols = Math.max(1, Math.min(m, 6, Math.floor(Math.max(0, span - 0.5 * cs) / minGap + 1e-9) + 1));
    var sp = cols > 1 ? Math.min((span - 0.5 * cs) / (cols - 1), 0.95 * cs) : 0;
    for (var k = 0; k < m; k++) {
      var row = Math.floor(k / cols), col = k % cols, inRow = Math.min(cols, m - row * cols);
      out.push({ x: cx + (col - (inRow - 1) / 2) * sp + (row % 2 ? 0.25 * sp : 0), y: c.floorY - cs / 2 - row * rise, row: row });
    }
    return out;
  }

  /**
   * DESIGN §2 layout. plan = { n: cars, caps: [slots per car], scales: [cargo-scale factor per car] (optional), surprise }.
   */
  function computeLayout(W, H, ins, cfg, plan, hudKeep) {
    ins = insOf(ins);
    plan = plan || {};
    var n = clamp(plan.n || 3, 1, 4), i;
    var portrait = H > W, tall = H / W > cfg.tallRatio;
    var groundY = H - ins.bottom - (portrait ? cfg.groundPort : cfg.groundLand);
    var dy;
    if (!portrait) dy = cfg.trackLand;
    else if (tall) dy = cfg.trackTall;
    else dy = lerp(cfg.trackPortShort, cfg.trackPort, clamp((H - cfg.portShortH) / (cfg.portFullH - cfg.portShortH), 0, 1));
    var trackY = groundY - dy;
    var S = Math.round(cfg.cargoS * (portrait && tall ? cfg.tallScale : 1));
    var E = portrait ? cfg.engineWPort : W < cfg.smallW ? cfg.engineWSmall : cfg.engineW;
    var xL = ins.left + cfg.engineX, xR = W - ins.right - cfg.carEdge, gap = cfg.carGap;
    var carW = Math.min(cfg.carMaxW, (xR - (xL + E + gap) - gap * (n - 1)) / n);
    var used = E + gap + n * carW + gap * (n - 1), off = cfg.centreTrain ? Math.max(0, (xR - xL - used) / 2) : 0;
    var ex0 = Math.round(xL + off), g = engineGeom(E, cfg);
    var engine = { x0: ex0, x1: ex0 + E, y0: trackY - cfg.engineHFrac * E, w: E };
    var momo = { x: ex0 + (g.cab.x0 + g.cab.x1) / 2, y: trackY - cfg.momoDy, h: cfg.momoHFrac * E };
    var whistle = { x: ex0 + g.whistle.x, y: trackY + g.whistle.y, r: g.whistle.r || cfg.whistleR };
    var chimney = { x: ex0 + g.chimney.x, y: trackY + g.chimney.y };
    var carH = clamp(cfg.carHFrac * carW, cfg.carHMin, cfg.carHMax);
    var carScale = clamp(carW / (cfg.carScaleK * S), cfg.carScaleMin, cfg.carScaleMax);
    var cars = [], minTop = 1e9, xc = engine.x1 + gap;
    for (i = 0; i < n; i++) {
      var kk = (plan.ks && plan.ks[i]) || 1, cw = carW * kk, chh = Math.max(cfg.carHMin * kk, carH * kk);   // size topic: the small car is smaller
      var x0 = xc + (carW - cw) / 2, y0 = trackY - cfg.wheelH - chh;
      xc += carW + gap;
      var c = { index: i, x0: x0, x1: x0 + cw, y0: y0, y1: trackY, w: cw, h: chh, floorY: y0 + cfg.floorFrac * chh };
      var cap = Math.max(1, (plan.caps && plan.caps[i]) || 2);
      c.scale = cap > cfg.bigNeed ? Math.max(cfg.carScaleFloor, carScale * Math.sqrt(cfg.bigNeed / cap)) : carScale;
      c.slots = carSlots(c, cap, S, S * c.scale, cfg);
      cars.push(c);
      minTop = Math.min(minTop, y0);
    }
    // bubble + HUD
    var bx = ins.left + cfg.bubbleX, bubble;
    if (portrait && tall) bubble = { x: bx, y: ins.top + cfg.bubbleYPort, w: W - bx - ins.right - cfg.bubbleX, h: cfg.bubbleHPort };
    else if (portrait) bubble = { x: bx, y: ins.top + cfg.bubbleYLand, w: W - ins.right - cfg.hudW - 14 - bx, h: cfg.bubbleHPort };
    else bubble = { x: bx, y: ins.top + cfg.bubbleYLand, w: Math.min(cfg.bubbleMaxW, W - ins.right - cfg.bubbleRight - bx), h: cfg.bubbleHLand };
    bubble.w = Math.max(0, bubble.w);
    var hud = { x: W - ins.right - cfg.hudW, y: 0, w: cfg.hudW + ins.right, h: ins.top + cfg.hudH };
    // rug: centres of resting cargo. y1 keeps every centre ≥ rugGap px above the cars' drop zones (zoneUp above the car tops)
    var y1 = minTop - cfg.zoneUp - cfg.rugGap;
    var y0 = bubble.y + bubble.h + cfg.rugBubbleGap + S / 2;
    if (portrait) y0 = Math.max(y0, y1 - cfg.rugPortFrac * W);
    var rug = { x0: ins.left + cfg.rugEdge + S / 2, x1: W - ins.right - cfg.rugEdge - S / 2, y0: y0, y1: Math.max(y0, y1),
      top: Math.max(ins.top + cfg.rugTop + S / 2, portrait ? y0 : 0) };   // landscape: the area right of the bubble may hold cargo too
    // keep-out boxes for resting cargo centres (DESIGN §2: nothing the child must touch under the HUD / the bubble)
    var keep = [
      { x: bubble.x, y: bubble.y, w: bubble.w, h: bubble.h, pad: cfg.rugBubbleGap + S / 2, kind: 'bubble' },
      { x: hud.x, y: hud.y, w: hud.w, h: hud.h, pad: S / 2 + 10, kind: 'hud' },
      { x: engine.x0, y: Math.min(engine.y0, whistle.y - whistle.r - cfg.whistlePad, momo.y - momo.h), w: E, h: trackY - Math.min(engine.y0, whistle.y - whistle.r - cfg.whistlePad, momo.y - momo.h), pad: S / 2 + cfg.keepPad, kind: 'engine' }
    ];
    keepBoxes(hudKeep).forEach(function (b) { b.pad = S / 2 + 8; b.kind = 'hudKeep'; keep.push(b); });
    // the toy-block tunnel at the left edge (render: x = min(tunnelX, engine.x0 − 0.11E − 0.29E − 6), far side to +0.61E): no cargo on it
    var tunR = Math.min(ins.left - cfg.tunnelDx, ex0 - 0.4 * E - 6) + 0.42 * 1.45 * E;
    if (tunR > 0) keep.push({ x: -400, y: 0, w: tunR + 400, h: trackY, pad: S / 2 + 6, kind: 'tunnel' });
    if (plan.surprise && n) {   // the bunny on the last car's rim / the balloon above it
      var lc = cars[n - 1], hgt = plan.surprise === 'balloon' ? cfg.balloonSize * S : cfg.hitchSize * S;
      keep.push({ x: lc.x1 - 0.45 * carW, y: lc.y0 - hgt, w: 0.45 * carW + 30, h: hgt, pad: S / 2, kind: plan.surprise });
    }
    return {
      W: W, H: H, ins: ins, portrait: portrait, tall: tall, groundY: groundY, trackY: trackY, S: S, n: n,
      engine: engine, momo: momo, whistle: whistle, chimney: chimney, cars: cars, carW: carW, carH: carH, carScale: carScale,
      rug: rug, keep: keep, bubble: bubble, hud: hud, tunnelX: ins.left - cfg.tunnelDx,
      safe: { x: ins.left, y: ins.top, w: W - ins.left - ins.right, h: H - ins.top - ins.bottom }
    };
  }

  // ------------------------------------------------------------------ packing (farthest-point sampling)
  /** Candidate rest centres for cargo of drawn `size` with spacing d: rows from the rug bottom (next to the cars) upwards;
   *  `upper` (landscape) also uses the area beside the bubble up to rug.top. Points near a keep box are dropped. */
  function rugPoints(L, size, d, upper) {
    var R = L.rug, pts = [], yTop = upper && !L.portrait ? Math.min(R.top, R.y0) : R.y0;
    var cols = Math.max(1, Math.floor((R.x1 - R.x0) / d + 1e-9) + 1), dx = cols > 1 ? (R.x1 - R.x0) / (cols - 1) : 0;
    var rows = Math.max(1, Math.floor((R.y1 - yTop) / d + 1e-9) + 1);
    for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
      var x = cols > 1 ? R.x0 + c * dx : (R.x0 + R.x1) / 2, y = R.y1 - r * d, bad = false;
      for (var q = 0; q < L.keep.length; q++) { var K = L.keep[q]; if (boxDist(K, x, y) < K.pad + (size - L.S) / 2) { bad = true; break; } }
      if (!bad) pts.push({ x: x, y: y });
    }
    return pts;
  }
  function spreadPick(pts, n, first) {
    if (pts.length <= n) return pts.slice(0, n);
    var out = [], used = [], dmin = [], i, j, s = first % pts.length;
    out.push(pts[s]);
    for (i = 0; i < pts.length; i++) { used[i] = i === s; dmin[i] = hyp(pts[i].x - pts[s].x, pts[i].y - pts[s].y); }
    while (out.length < n) {
      var best = -1, bd = -1;
      for (i = 0; i < pts.length; i++) if (!used[i] && dmin[i] > bd + 1e-9) { bd = dmin[i]; best = i; }
      used[best] = true; out.push(pts[best]);
      for (j = 0; j < pts.length; j++) dmin[j] = Math.min(dmin[j], hyp(pts[j].x - pts[best].x, pts[j].y - pts[best].y));
    }
    return out;
  }
  /** homeX/homeY for each record (it.baseSize = S·item.scale); sets it.restSize. Main rug band first (down to bandShrink),
   *  then with the area beside the bubble (down to minShrink), then smaller. → { shrink, ok }. */
  function packItems(recs, L, rng, cfg) {
    if (!recs.length) return { shrink: 1, ok: true };
    var maxB = 0, i, s, pts = [], jit = cfg.packJitter, found = false, tier, lo;
    for (i = 0; i < recs.length; i++) maxB = Math.max(maxB, recs[i].baseSize);
    for (tier = 0; tier < 3 && !found; tier++) {
      lo = tier === 0 ? cfg.bandShrink : tier === 1 ? cfg.minShrink : 0.3;
      for (s = 1; s >= lo - 1e-9; s = Math.round((s - cfg.shrinkStep) * 1000) / 1000) {
        var size = maxB * s;
        pts = rugPoints(L, size, cfg.minSpacing * size + 2 * Math.SQRT2 * jit, tier > 0);
        if (pts.length >= recs.length) { found = true; break; }
      }
    }
    if (!found) s = 0.3;
    var pick = spreadPick(pts.length ? pts : [{ x: (L.rug.x0 + L.rug.x1) / 2, y: L.rug.y1 }], recs.length, rng.int(0, 1e6));
    rng.shuffle(pick);
    for (i = 0; i < recs.length; i++) {
      var p = pick[i % pick.length], it = recs[i];
      it.restSize = it.baseSize * s;
      it.homeX = clamp(p.x + rng.float(-jit, jit), L.rug.x0, L.rug.x1);
      it.homeY = Math.min(L.rug.y1, p.y + rng.float(-jit, jit));
    }
    return { shrink: s, ok: found && s >= cfg.minShrink - 1e-9 };
  }

  // ------------------------------------------------------------------ World
  function World(opts) {
    opts = opts || {};
    this.cfg = merge(CONFIG, opts.config);
    this.seed = opts.seed !== undefined ? opts.seed : 1;
    this.rng = new TT.RNG(this.seed);
    this._crng = new TT.RNG((TT.RNG.hash(this.seed) ^ 0x51ed27) >>> 0);   // cosmetic randomness (hops, puffs, bob phases)
    this.age = TT.Content.ageOf(opts.age !== undefined ? opts.age : 4);
    this.lang = opts.lang === 'vi' ? 'vi' : 'en';
    this._pendingAge = this.age; this._pendingLang = this.lang;
    this.state = 'menu'; this.phase = null;
    this.level = 0; this.levels = []; this.topic = null; this.weather = 0;
    this.round = 0; this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.stars = 0; this.levelStars = 0; this.roundStars = 0; this.misses = 0; this.streak = 0; this.trains = 0;
    this.time = 0; this.stateTime = 0; this.phaseTime = 0; this.alpha = 0; this._acc = 0;
    this.cur = null; this.items = []; this.cars = []; this.held = null; this.talk = null; this.talkAnswered = null;
    this.hudKeep = opts.hudKeep || null; this.lastTopics = null; this.surprise = null; this._surpriseOff = 0;
    this.hitch = null; this.balloon = null; this.hintHand = null;
    this.train = { x: 0, _px: 0, v: 0, a: 0, wheelRot: 0, _pwheelRot: 0, whistle: 0, lamp: 0, glow: 0, dist: 0, couple: [] };
    this.momo = { x: 0, y: 0, h: 200, mood: 'idle', moodT: 0, blinkT: 3, blink: false, look: 0, lookX: 0 };
    this.finger = { x: 0, y: 0, down: false };
    this.events = []; this.sessions = 0; this._serial = 0;
    this._idleN = 0; this._idleT = 0; this._idleGap = this.cfg.idleTime; this._lastHintT = -1e9; this.levelStartTime = 0;
    this._talkAskT = 0; this._talkAsks = 0; this._press = null; this._down = null; this._aHist = []; this.tapMoveMin = 24;
    this._vp = null; this._view = null; this.packShrink = 1; this.packOk = true;
    this.setViewport(opts.width || 1280, opts.height || 720, opts.ins || null);
  }
  World.logicalSize = logicalSize;
  World.computeLayout = function (W, H, ins, cfg, plan, hudKeep) { return computeLayout(W, H, ins, merge(CONFIG, cfg), plan, hudKeep); };
  World.packItems = packItems;
  World.carSlots = carSlots;

  var P = World.prototype;
  Object.defineProperty(P, 'interactive', { get: function () { return this.state === 'round' && this.phase === 'load'; } });
  P._emit = function (e) { this.events.push(e); };
  P.drainEvents = function () { var e = this.events; this.events = []; return e; };
  P.setAge = function (a) { this._pendingAge = TT.Content.ageOf(a); };
  P.setLang = function (l) { this._pendingLang = l === 'vi' ? 'vi' : 'en'; };
  P.itemById = function (id) { for (var i = 0; i < this.items.length; i++) if (this.items[i].id === id) return this.items[i]; return null; };
  P.carById = function (id) { for (var i = 0; i < this.cars.length; i++) if (this.cars[i].id === id) return this.cars[i]; return null; };
  P._setState = function (s) { this.state = s; this.stateTime = 0; };
  P._setPhase = function (p) { this.phase = p; this.phaseTime = 0; };
  P._mood = function (m, t) { this.momo.mood = m; this.momo.moodT = t || this.cfg.moodTime[m] || 1; };
  P.skipTalk = function () { if (this.state === 'talk') this._levelDone(); };
  P._mode = function () { return this.cur ? this.cur.mode : null; };
  P._tapMove = function () { return Math.max(this.cfg.tapMovePx, +this.tapMoveMin || 0); };

  /** The current question {promptKey, params, mode, phase} (whistle phase: promptKey 'loaded'); null otherwise. */
  P.prompt = function () {
    if (this.state !== 'round' || !this.cur) return null;
    if (this.phase === 'deal' || this.phase === 'load') return { promptKey: this.cur.promptKey, params: this.cur.params, mode: this.cur.mode, phase: this.phase };
    if (this.phase === 'whistle') return { promptKey: 'loaded', params: {}, mode: this.cur.mode, phase: 'whistle' };
    return null;
  };

  // ---------------------------------------------------------------- geometry / test hooks (logical px)
  P._hitR = function (it) { return this.cfg.hitFrac * Math.max(it.size, this.layout.S * this.packShrink) + this.cfg.hitPad; };
  /** Cargo hit box {x, y (centre), w, h}. */
  P.itemHit = function (id) {
    var it = typeof id === 'object' ? id : this.itemById(id);
    if (!it) return null;
    var r = this._hitR(it);
    return { x: it.x, y: it.y, w: 2 * r, h: 2 * r };
  };
  /** Car body box at its CURRENT position {x, y (centre), w, h} (the bot's / QA's drop target). */
  P.carBox = function (id) {
    var c = typeof id === 'object' ? id : this.carById(id);
    if (!c) return null;
    var x0 = c.x0 + c.ox + c.shake;
    return { x: x0 + c.w / 2, y: (c.y0 + c.floorY) / 2, w: c.w, h: c.floorY - c.y0, x0: x0, x1: x0 + c.w, y0: c.y0, floorY: c.floorY };
  };
  P._zone = function (c, up) {
    var cfg = this.cfg, x0 = c.x0 + c.ox;
    return { l: x0 - cfg.zoneSide, r: x0 + c.w + cfg.zoneSide, t: c.y0 - (up || cfg.zoneUp), b: c.y1 + cfg.zoneDown };
  };
  P._whistlePos = function () { var Wh = this.layout.whistle; return { x: Wh.x + this.train.x, y: Wh.y, r: Wh.r }; };
  P.whistleHit = function () { var Wh = this._whistlePos(), r = Wh.r + this.cfg.whistlePad; return { x: Wh.x, y: Wh.y, w: 2 * r, h: 2 * r }; };
  P._engineBox = function () {
    var E = this.layout.engine, p = this.cfg.enginePad;
    return { x: E.x0 + this.train.x - p, y: E.y0 - p, w: E.w + 2 * p, h: this.layout.trackY - E.y0 + 2 * p };
  };
  P._momoBox = function () {
    var M = this.layout.momo, hw = this.cfg.momoHalfW * M.h, p = this.cfg.momoPad;
    return { x: M.x + this.train.x - hw - p, y: M.y - M.h - p, w: 2 * (hw + p), h: M.h + 2 * p };
  };
  P.momoHit = function () { var b = this._momoBox(); return { x: b.x + b.w / 2, y: b.y + b.h / 2, w: b.w, h: b.h }; };
  P._onScreenX = function (x, r) { var L = this.layout; return L && this.phase !== 'depart' ? Math.min(x, L.W - L.ins.right - r) : x; };   // tap targets inside the screen
  P.hitchHit = function () { var h = this.hitch; if (!h) return null; var r = this.cfg.hitchR; return { x: this._onScreenX(h.x, r), y: h.y - 0.45 * h.size, w: 2 * r, h: 2 * r }; };
  P._balloonHead = function () {
    var B = this.balloon; if (!B) return null;
    var L = 0.72 * B.size;
    return { x: B.x + Math.sin(B.sway) * L, y: B.y - Math.cos(B.sway) * L - B.bob, r: this.cfg.balloonR * B.size + this.cfg.hitPad };
  };
  P.balloonHit = function () { var h = this._balloonHead(); return h ? { x: this._onScreenX(h.x, h.r), y: h.y, w: 2 * h.r, h: 2 * h.r } : null; };
  /** Id of a right car for this cargo now (count: the first count car with room), null when none. */
  P.answerCarId = function (itemId) {
    var it = typeof itemId === 'object' ? itemId : this.itemById(itemId);
    if (!it || !this.cur) return null;
    if (this.cur.mode === 'count') {
      for (var i = 0; i < this.cars.length; i++) if (this.cars[i].reserved < this.cars[i].need) return this.cars[i].id;
      return null;
    }
    return it.answer || null;
  };
  /** Car whose drop zone contains (px, py); overlapping zones → the car whose centre x is nearest. */
  P.carAt = function (px, py, up) {
    var best = null, bd = 1e9;
    for (var i = 0; i < this.cars.length; i++) {
      var c = this.cars[i], z = this._zone(c, up);
      if (px < z.l || px > z.r || py < z.t || py > z.b) continue;
      var d = Math.abs(px - (z.l + z.r) / 2);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  };

  // ---------------------------------------------------------------- viewport
  P.setViewport = function (W, H, ins) {
    this._view = { W: W, H: H, ins: insOf(ins) };
    this._relayout(false);
  };
  P._plan = function () {
    var n = this.cars.length || TT.Content.maxCars(this.age), caps = [];
    var ks = [];
    for (var i = 0; i < this.cars.length; i++) {
      caps.push(this.cars[i].cap);
      var lb = this.cars[i].label;
      ks.push(lb && lb.type === 'size' && lb.value === 'small' ? this.cfg.smallCarK : 1);
    }
    return { n: n, caps: caps, ks: ks, surprise: this.surprise };
  };
  P._relayout = function (force) {
    var v = this._view, pl = this._plan();
    var key = v.W + 'x' + v.H + ':' + JSON.stringify(v.ins) + ':' + JSON.stringify(pl) + ':' + JSON.stringify(this.hudKeep || null);
    if (key === this._vp && !force) return false;
    var had = !!this.layout;
    this._vp = key;
    this.layout = computeLayout(v.W, v.H, v.ins, this.cfg, pl, this.hudKeep);
    this.layout.hudKeep = keepBoxes(this.hudKeep);
    var L = this.layout;
    for (var i = 0; i < this.cars.length; i++) {
      var c = this.cars[i], lc = L.cars[i];
      c.x0 = lc.x0; c.x1 = lc.x1; c.y0 = lc.y0; c.y1 = lc.y1; c.w = lc.w; c.h = lc.h; c.floorY = lc.floorY; c.slots = lc.slots; c.scale = lc.scale;
    }
    this.momo.x = L.momo.x; this.momo.y = L.momo.y; this.momo.h = L.momo.h;
    if (had && this.cur) this._snapAll();
    return true;
  };
  /** Rotation / resize mid-round (DESIGN §5.2): cancel the drag, re-layout, snap cargo in cars to their slots, re-pack resting
   *  cargo into the new rug, finish every arc instantly; a moving train keeps its phase (x re-derived / clamped). */
  P._snapAll = function () {
    var L = this.layout, i;
    if (this.held) { var hi = this.itemById(this.held); this.held = null; if (hi) { hi.state = 'rest'; hi.lift = 0; } }
    this._press = null; this.finger.down = false;
    var resting = [], flying = this.items.filter(function (q) { return q.state === 'fly'; });
    for (i = 0; i < flying.length; i++) this._land(flying[i], true);
    for (i = 0; i < this.items.length; i++) {
      var it = this.items[i];
      it.baseSize = L.S * it.item.scale;
      if (it.state === 'in') continue;
      if (it.state === 'home' || it.state === 'drag') { it.state = 'rest'; it._f = null; }
      resting.push(it);
    }
    this._pack(resting, true);
    for (i = 0; i < this.items.length; i++) {
      var q = this.items[i];
      if (q.state === 'in') { this._inCarPos(q); }
      else { q.x = q.homeX; q.y = q.homeY; q.size = q.restSize * (q.state === 'pop' ? Math.max(0, q.appear) : 1); q.rot = 0; q.vx = q.vy = 0; }
      q._px = q.x; q._py = q.y; q._prot = q.rot; q._psize = q.size;
    }
    // the train: arriving → x from its progress; departing → keep x (clamped)
    var T = this.train;
    if (this.state === 'round' && this.phase === 'arrive') T.x = this._arriveX(this._arriveU || 0);
    else T.x = clamp(T.x, -(L.W + 4000), L.W + 400);
    T._px = T.x;
    this._carsOx(); for (i = 0; i < this.cars.length; i++) this.cars[i]._pox = this.cars[i].ox;
    if (this.hintHand) this._hintGeo();
    this._surpriseGeo(true);
  };
  P._pack = function (recs, relayout) {
    if (!recs.length) return;
    var L = this.layout, seed = ((this.cur ? this.cur.seed : 1) ^ Math.imul(L.W, 7919) ^ Math.imul(L.H, 104729) ^ (relayout ? 0x9e37 : 0)) >>> 0;
    var r = packItems(recs, L, new TT.RNG(seed), this.cfg);
    this.packShrink = r.shrink; this.packOk = r.ok;
  };

  // ---------------------------------------------------------------- session flow
  P.newSession = function (opts) {
    this.age = this._pendingAge; this.lang = this._pendingLang;
    this.sessions++;
    this._clearRound(); this.cur = null; this.state = 'menu';
    var last = (opts && opts.lastTopics) || this.lastTopics || null;
    this.levels = TT.Content.topicsFor(this.age, this.rng, last);
    this._surpriseOff = this.rng.int(0, Math.max(0, this.cfg.surpriseTypes.length - 1));
    this.stars = 0; this.trains = 0;
    this.weather = 0;
    this._emit({ type: 'session', levels: this.levels.slice() });
    this.startLevel(0);
  };

  P._clearRound = function () {
    this.items = []; this.cars = []; this.held = null; this._press = null; this.hitch = null; this.balloon = null; this.hintHand = null;
    this.finger.down = false; this.train.couple = []; this._aHist = [];
  };

  P.startLevel = function (i) {
    if (!this.levels.length) this.levels = TT.Content.topicsFor(this.age);
    this.level = clamp(i | 0, 0, this.levels.length - 1);
    this.topic = this.levels[this.level];
    this.weather = this.level % 4;
    this.round = 0; this.levelStars = 0; this.levelStartTime = this.time;
    this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.cur = null; this.talk = null; this.talkAnswered = null; this.surprise = null; this._prevKey = null;
    this._clearRound();
    this._relayout(false);
    this.train.x = this.train._px = this.layout.W + this.cfg.arriveFrom + 200;   // the track is empty during the chapter banner
    this._setState('intro'); this.phase = null;
    this._mood('wave', 1.6);
    this._emit({ type: 'level', level: this.level, topic: this.topic, weather: this.weather });
  };

  P._uid = function (p) { return p + (++this._serial); };

  P._beginRound = function () {
    var cfg = this.cfg, self = this;
    var rr = new TT.RNG((this.rng.next() * 4294967296) >>> 0);
    var ST = cfg.surpriseTypes, sp = ST && ST.length && this.round === cfg.surpriseRound && this.round > 0 ? ST[(this.level + this._surpriseOff) % ST.length] : null;
    var el = this.time - this.levelStartTime, sb = cfg.shortBudget, short = !!(sb && this.round > 0 && el > (sb[Math.min(this.round, sb.length - 1)]));
    var V = this._view || this.layout, portrait = !!(V && V.H > V.W);
    var cur = TT.Content.makeRound(this.topic, { age: this.age, lang: this.lang, rng: rr, roundIndex: this.round, surprise: sp, prevKey: this._prevKey || null, short: short,
      maxCars: portrait ? cfg.portMaxCars : 0, warm3: this.level >= 1, prevToy: this._prevToy || null });
    this._prevKey = cur.key;
    if (cur.mode === 'count' && cur.params && cur.params.cargo) this._prevToy = cur.params.cargo;
    this.cur = cur; this.surprise = sp;
    this.misses = 0; this.streak = 0; this._taps = 0;
    this._clearRound();
    var idMap = {};
    this.cars = cur.cars.map(function (c, i) {
      var id = self._uid('car'); idMap[c.id] = id;
      var cap = cur.mode === 'count' ? c.need : cur.items.filter(function (it) { return it.answer === c.id; }).length;
      return { id: id, index: i, label: c.label, need: cur.mode === 'count' ? c.need : cap, nameKind: c.nameKind, nameValue: c.nameValue, cap: cap,
        x0: 0, x1: 0, y0: 0, y1: 0, w: 0, h: 0, floorY: 0, slots: [], scale: 1, items: [], reserved: 0, filled: 0,
        sq: 0, _psq: 0, sqv: 0, shake: 0, _shakeT: -1, glow: 0, _glowT: 0, done: 0, _done: false, ox: 0, _pox: 0, bounceAt: 0 };
    });
    this.items = cur.items.map(function (s, k) {
      return { id: self._uid('it'), item: s, answer: s.answer ? idMap[s.answer] : null, nameKind: s.nameKind, nameValue: s.nameValue,
        x: 0, y: 0, _px: 0, _py: 0, rot: 0, _prot: 0, sx: 1, sy: 1, q: 0, qv: 0, glow: 0, _glowT: 0, size: 0, _psize: 0, baseSize: 0, restSize: 0,
        state: 'pop', t: 0, delay: k * cfg.dealStagger, appear: 0, homeX: 0, homeY: 0, carId: null, slot: -1, row: 0, inCar: false,
        bounce: 0, bv: 0, tilt: 0, tv: 0, alpha: 1, lift: 0, vx: 0, vy: 0, vr: 0, misses: 0, _f: null, _retKind: null, _offX: 0, _offY: 0,
        _bobPh: self._crng.float(0, TAU), _bobP: self._crng.float(cfg.bobPeriod[0], cfg.bobPeriod[1]), _bobW: 0 };
    });
    this.train.couple = this.cars.map(function () { return { dx: 0, _pdx: 0, v: 0, s: 0, sv: 0 }; });
    this._relayout(true);
    var L = this.layout;
    this.items.forEach(function (it) { it.baseSize = L.S * it.item.scale; });
    this._pack(this.items, false);
    this.items.forEach(function (it) { it.x = it._px = it.homeX; it.y = it._py = it.homeY; it.size = it._psize = 0; });
    // the train rolls in from the right
    var T = this.train;
    T.v = 0; T.a = 0; T.whistle = 0; T.glow = 0;
    this._arriveU = 0; T.x = T._px = this._arriveX(0);
    this._carsOx(); this.cars.forEach(function (c) { c._pox = c.ox; });
    this._puffT = 0; this._railAt = 0; this._lastLandT = -1e9; this._solvedAt = -1; this._byeDone = false; this._whistleT = -1;
    this._departed = false; this._started = false; this._hitchDone = false; this._lastTootT = -1e9; this._whistleHinted = false;
    this._idleT = 0; this._idleGap = cfg.idleTime; this._idleN = 0;
    if (sp === 'balloon') this._balloonIn();
    this._setState('round'); this._setPhase('arrive');
    this._mood('happy', 1.2);
    this._emit({ type: 'round', round: this.round, topic: this.topic, mode: cur.mode, surprise: sp, cars: this.cars.length, items: this.items.length, short: cur.short,
      promptKey: cur.promptKey, params: cur.params });
    if (sp === 'balloon') { var Bh = this._balloonHead(); this._emit({ type: 'balloon', x: Bh.x, y: Bh.y }); }
  };
  /** Arrive kinematics: constant braking from x0 = W + arriveFrom to the stop (x = X0·(1 − u)²). */
  P._arriveX = function (u) { var X0 = this.layout.W + this.cfg.arriveFrom; return X0 * (1 - u) * (1 - u); };

  P._deal = function () {
    var L = this.layout;
    this._setPhase('deal');
    this._emit({ type: 'deal', n: this.items.length, x: (L.rug.x0 + L.rug.x1) / 2, y: (L.rug.y0 + L.rug.y1) / 2 });
  };
  P._startLoad = function () {
    this._setPhase('load');
    this._idleT = 0; this._idleGap = this.cfg.idleTime; this._idleN = 0;
    this._emit({ type: 'ask', promptKey: this.cur.promptKey, params: this.cur.params, mode: this.cur.mode, first: true, round: this.round,
      cars: this.cars.map(function (c) { return { id: c.id, label: c.label, need: c.need, nameKind: c.nameKind, nameValue: c.nameValue }; }) });
  };

  P._startTalk = function () {
    var rr = new TT.RNG((this.rng.next() * 4294967296) >>> 0);
    this.talk = TT.Content.makeTalk(this.topic, { age: this.age, lang: this.lang, rng: rr });
    this.talk.glowAnswer = false;
    this.talkAnswered = null; this._talkAskT = 0; this._talkAsks = 0;
    this.cur = null; this.phase = null;
    this._clearRound();
    this._setState('talk');
    this._mood('talk', 1.2);
    this._emit({ type: 'talk', talk: this.talk });
  };

  P.talkAnswer = function (choiceId) {
    if (this.state !== 'talk' || this.talkAnswered || !this.talk) return false;
    var ok = choiceId === this.talk.answerId;
    this.talkAnswered = { choiceId: choiceId, correct: ok };
    if (ok) { this.stars += 1; this.levelStars += 1; this._mood('cheer'); } else this._mood('think');
    this.stateTime = 0;
    this._emit({ type: 'talkResult', correct: ok, choiceId: choiceId, answerId: this.talk.answerId });
    return ok;
  };

  P._levelDone = function () {
    this._setState('levelDone');
    this._emit({ type: 'levelDone', level: this.level, stars: this.levelStars });
  };

  // ---------------------------------------------------------------- input (logical px; ONE active pointer)
  P._touch = function () { this._idleT = 0; this._idleGap = this.cfg.idleTime; };
  P._grabbable = function (it) { return (it.state === 'rest' || it.state === 'home') && !it._bye; };
  /** → item id | 'whistle' | 'toot' | 'momo' | 'hitch' | 'balloon' | null */
  P.pointerDown = function (x, y) {
    this.finger.x = x; this.finger.y = y;
    if (this.state !== 'round' || this.held || this._press) return null;
    this.finger.down = true;
    var cfg = this.cfg, i;
    if (this.phase === 'load') {
      var best = null, bd = 1e9;
      for (i = this.items.length - 1; i >= 0; i--) {
        var it = this.items[i];
        if (!this._grabbable(it)) continue;
        var r = this._hitR(it), dx = Math.abs(x - it.x), dy = Math.abs(y - it.y);
        if (dx > r || dy > r) continue;
        var d = hyp(dx, dy);
        if (d < bd - 1e-9) { bd = d; best = it; }
      }
      if (best) {
        this.items.splice(this.items.indexOf(best), 1); this.items.push(best);   // draw on top
        best.state = 'drag'; best.t = 0; best._f = null;
        best._offX = (best.x - x) * cfg.grabKeep; best._offY = (best.y - y) * cfg.grabKeep;
        this.held = best.id; this._touch();
        this._down = { x: x, y: y, t: this.time, maxD: 0, ax: x, ay: y, at: this.time };
        if (this.hintHand && this.hintHand.kind === 'drag' && this.hintHand.itemId !== best.id) this.hintHand = null;
        this._emit({ type: 'grab', id: best.id, nameKind: best.nameKind, nameValue: best.nameValue, item: best.item, x: best.x, y: best.y });
        return best.id;
      }
    }
    // surprises (immediate)
    var hh = this.hitchHit();
    if (hh && this.hitch.state !== 'in' && boxHit({ x: hh.x - hh.w / 2, y: hh.y - hh.h / 2, w: hh.w, h: hh.h }, x, y) && hyp(x - hh.x, y - hh.y) <= cfg.hitchR) { this._tapHitch(); this.finger.down = false; return 'hitch'; }
    var bh = this.balloonHit();
    if (bh && hyp(x - bh.x, y - bh.y) <= bh.w / 2) { this._tapBalloon(); this.finger.down = false; return 'balloon'; }
    // the whistle fires on the press (kids hold it); in the whistle phase the whole engine counts
    var Wh = this._whistlePos(), onWhistle = hyp(x - Wh.x, y - Wh.y) <= Wh.r + cfg.whistlePad;
    if (this.phase === 'whistle' && this._whistleT < 0 && (onWhistle || boxHit(this._engineBox(), x, y))) { this._doWhistle(false); this.finger.down = false; return 'whistle'; }
    if (onWhistle) { this._toot(); this.finger.down = false; return 'toot'; }
    if (boxHit(this._momoBox(), x, y)) { this._press = { kind: 'momo', x0: x, y0: y, t0: this.time, maxD: 0 }; return 'momo'; }
    this.finger.down = false;
    return null;
  };
  P.pointerMove = function (x, y) {
    this.finger.x = x; this.finger.y = y;
    var d = this._down;
    if (this.held && d) {
      var m = hyp(x - d.x, y - d.y);
      if (m > d.maxD) d.maxD = m;
      if (hyp(x - d.ax, y - d.ay) > this.cfg.stillPx) { d.ax = x; d.ay = y; d.at = this.time; }
    }
    if (this._press) { var pm = hyp(x - this._press.x0, y - this._press.y0); if (pm > this._press.maxD) this._press.maxD = pm; }
  };
  /** → 'correct' | 'wrong' | 'miss' | 'full' | 'tap' | 'pokeMomo' | null */
  P.pointerUp = function (x, y) {
    if (x !== undefined) { this.finger.x = x; this.finger.y = y; }
    this.finger.down = false;
    var pr = this._press;
    this._press = null;
    if (pr) {
      var pm = Math.max(pr.maxD, hyp(this.finger.x - pr.x0, this.finger.y - pr.y0));
      if (pr.kind === 'momo' && pm < this._tapMove() && this.time - pr.t0 < this.cfg.momoTapTime) return this._pokeMomo();
      return null;
    }
    if (!this.held) return null;
    var it = this.itemById(this.held);
    this.held = null;
    if (!it || it.state !== 'drag') return null;
    var d = this._down, cfg = this.cfg, mv = Math.max(d.maxD, hyp(this.finger.x - d.x, this.finger.y - d.y));
    if (mv < this._tapMove() && this.time - d.t < cfg.tapTime) {
      // a tap is "what is this?", never a drop: hop home quietly, Momo names it (no drop / miss / wrong)
      this._taps = (this._taps || 0) + 1;
      if (this.phase === 'load' && this.age <= cfg.tapAssistMaxAge && this._taps >= cfg.tapAssistAfter) {
        // a child who only taps: the toy glides into its car by itself (playtest P1-1)
        var ac = this.carById(this.answerCarId(it));
        if (ac) {
          this._emit({ type: 'tap', id: it.id, nameKind: it.nameKind, nameValue: it.nameValue, item: it.item, x: it.x, y: it.y, assist: true });
          this._taps = 0;
          return this._drop(it, (ac.x0 + ac.x1) / 2 + ac.ox, ac.floorY - 10);
        }
      }
      this._planReturn(it, 'tap');
      this._emit({ type: 'tap', id: it.id, nameKind: it.nameKind, nameValue: it.nameValue, item: it.item, x: it.x, y: it.y });
      if (this.phase === 'load' && this._taps >= cfg.tapHintAfter) this._autoHint(it, true);   // show how to drag
      return 'tap';
    }
    return this._drop(it, this.finger.x, this.finger.y);
  };
  /** The finger left (touchcancel / pause): a held cargo floats home, no event. */
  P.cancelDrag = function () {
    this.finger.down = false; this._press = null;
    if (!this.held) return;
    var it = this.itemById(this.held);
    this.held = null;
    if (it && it.state === 'drag') this._planReturn(it, 'miss');
  };

  P._pokeMomo = function () {
    var a = this.prompt(), M = this.layout.momo;
    if (!a) return null;
    this._mood('talk', 1.0);
    this._emit({ type: 'pokeMomo', promptKey: a.promptKey, params: a.params, mode: a.mode, phase: a.phase, x: M.x + this.train.x, y: M.y - 0.6 * M.h });
    return 'pokeMomo';
  };
  P._tapHitch = function () {
    var H = this.hitch;
    H.state = 'wave'; H.t = 0;
    this._emit({ type: 'hitchTap', x: H.x, y: H.y - 0.5 * H.size });
  };
  P._tapBalloon = function () {
    var B = this.balloon, h = this._balloonHead();
    B.taps++; B.bobV += this.cfg.balloonBob * 9; B.swayV += (this._crng.chance(0.5) ? 1 : -1) * 0.9;
    this._emit({ type: 'balloonTap', x: h.x, y: h.y, taps: B.taps });
  };
  P._toot = function () {
    if (this.time - this._lastTootT < this.cfg.tootGap) return;
    this._lastTootT = this.time;
    this.train.whistle = 1;
    var Wh = this._whistlePos();
    this._emit({ type: 'toot', x: Wh.x, y: Wh.y });
  };
  P._doWhistle = function (auto) {
    var Wh = this._whistlePos();
    this._whistleT = this.time; this.train.whistle = 1; this._lastTootT = this.time;
    this.hintHand = null;
    this._mood('whistle', this.cfg.moodTime.whistle);
    this._emit({ type: 'whistle', auto: !!auto, x: Wh.x, y: Wh.y });
    this._setPhase('depart');
  };

  // ---------------------------------------------------------------- drops
  P._drop = function (it, fx, fy) {
    // the finger's car wins (a fast flick leaves the cargo lagging over a neighbour); the cargo centre catches 'beside' drops
    var c = this.carAt(fx, fy) || this.carAt(it.x, it.y), mode = this.cur.mode;
    if (!c && this._down && this._down.maxD >= this.cfg.aimTravel) c = this.carAt(fx, fy, this.cfg.zoneUpFar) || this.carAt(it.x, it.y, this.cfg.zoneUpFar);
    this._emit({ type: 'drop', id: it.id, carId: c ? c.id : null });
    if (!c) {
      it.misses++;
      this._emit({ type: 'miss', id: it.id, x: it.x, y: it.y });
      this._planReturn(it, 'miss');
      this._afterMiss(it);
      return 'miss';
    }
    if (mode === 'count') {
      if (c.reserved >= c.need) {
        this._emit({ type: 'full', id: it.id, carId: c.id, x: it.x, y: it.y });
        this._planReturn(it, 'full');
        return 'full';
      }
      this._correct(it, c);
      return 'correct';
    }
    if (it.answer === c.id && c.reserved < c.slots.length) { this._correct(it, c); return 'correct'; }
    // wrong car: it wiggles, the cargo boings home
    it.misses++; this.misses++; this.streak++;
    c._shakeT = 0;
    this._mood('oops');
    var R = this.carById(it.answer);
    this._emit({ type: 'wrong', id: it.id, carId: c.id, item: { nameKind: it.nameKind, nameValue: it.nameValue }, want: R ? { nameKind: R.nameKind, nameValue: R.nameValue, carId: R.id, label: R.label } : null,
      got: { nameKind: c.nameKind, nameValue: c.nameValue, label: c.label }, streak: this.streak, misses: it.misses, x: it.x, y: it.y });
    this._planReturn(it, 'wrong');
    this._afterMiss(it);
    return 'wrong';
  };
  P._afterMiss = function (it) { if (it.misses >= this.cfg.hintAfterMisses) this._autoHint(it, false); };
  P._correct = function (it, c) {
    it.slot = c.reserved++;
    it.carId = c.id;
    this._planFly(it, c, false);
    this.streak = 0;
    this._mood('happy');
    if (this.hintHand && this.hintHand.itemId === it.id) this.hintHand = null;
    var ev = { type: 'correct', id: it.id, carId: c.id, nameKind: it.nameKind, nameValue: it.nameValue, label: c.label, item: it.item, x: it.x, y: it.y };
    if (this.cur.mode === 'count') ev.count = { i: c.reserved, n: c.need };
    this._emit(ev);
    if (this.cur.mode === 'count' && this.cars.every(function (q) { return q.reserved >= q.need; })) this._byeAll();
  };
  /** Count round: every car has its cargo (some still in the air) → the spare cargo waves goodbye and fades out. */
  P._byeAll = function () {
    if (this._byeDone) return;
    this._byeDone = true;
    var ids = [], cfg = this.cfg, k = 0;
    if (this.held) { var hi = this.itemById(this.held); this.held = null; if (hi && hi.state === 'drag') this._planReturn(hi, 'miss'); }
    for (var i = 0; i < this.items.length; i++) {
      var it = this.items[i];
      if (it.carId) continue;
      it._byeAt = this.time + (k++) * cfg.byeStagger;
      it._bye = true;
      ids.push(it.id);
    }
    if (ids.length) this._emit({ type: 'bye', ids: ids, n: ids.length });
  };

  // ---------------------------------------------------------------- help
  P.resetNudges = function () {
    this._idleT = 0; this._idleGap = this.cfg.idleTime; this._idleN = 0;
    this._talkAskT = 0; this._talkAsks = 0;
    if (this.talk) this.talk.glowAnswer = false;
  };
  P._glowing = function () { for (var i = 0; i < this.cars.length; i++) if (this.cars[i]._glowT > 0) return true; return false; };
  P._autoHint = function (it, fromIdle) {
    if (this._glowing() || this.time - this._lastHintT < this.cfg.hintCooldown) return null;
    return this._doHint(it, fromIdle);
  };
  P._hintItem = function () {
    if (this.held) return this.itemById(this.held);
    var best = null;
    for (var i = 0; i < this.items.length; i++) {
      var c = this.items[i];
      if (!this._grabbable(c) || c._bye) continue;
      if (!best || c.misses > best.misses) best = c;
    }
    return best;
  };
  P._doHint = function (it, fromIdle) {
    it = it || this._hintItem();
    if (!it) return null;
    var cid = this.answerCarId(it), c = cid && this.carById(cid);
    if (!c) return null;
    var cfg = this.cfg;
    c._glowT = cfg.hintTime; it._glowT = cfg.hintTime;
    this._lastHintT = this.time;
    this._mood('point', cfg.hintTime);
    this.hintHand = { kind: 'drag', itemId: it.id, carId: c.id, x: it.x, y: it.y, x0: it.x, y0: it.y, x1: 0, y1: 0, t: 0, alpha: 0, time: 0, T: cfg.hintTime };
    this._hintGeo();
    var ev = { type: 'hint', id: it.id, carId: c.id, item: { nameKind: it.nameKind, nameValue: it.nameValue }, want: { nameKind: c.nameKind, nameValue: c.nameValue, label: c.label } };
    if (fromIdle) ev.idle = true;
    this._emit(ev);
    return c.id;
  };
  /** Manual hint (tap on the bubble): the right car of the held / a resting cargo glows + the ghost hand. → car id | null */
  P.hint = function () {
    if (this.state !== 'round' || this.phase !== 'load') return null;
    if (this.hintHand && this.hintHand.kind === 'drag') return this.hintHand.carId;
    if (this._glowing()) { for (var i = 0; i < this.cars.length; i++) if (this.cars[i]._glowT > 0) return this.cars[i].id; }
    return this._doHint(null, false);
  };
  P._hintGeo = function () {
    var H = this.hintHand;
    if (!H) return;
    if (H.kind === 'tap') { var Wh = this._whistlePos(); H.x0 = H.x1 = Wh.x + 6; H.y0 = H.y1 = Wh.y + 10; return; }
    var it = this.itemById(H.itemId), c = this.carById(H.carId);
    if (!it || !c || it.state === 'in' || it.state === 'fly') { this.hintHand = null; return; }
    var b = this.carBox(c);
    H.x0 = it.state === 'drag' ? it.x : it.homeX; H.y0 = it.state === 'drag' ? it.y : it.homeY;
    H.x1 = b.x; H.y1 = c.floorY - 30;
  };
  /** Ghost hand: drag → press at the cargo, carry it on a low arc to the car, lift, repeat; tap → taps the whistle. */
  P._stepHint = function (h) {
    var H = this.hintHand, cfg = this.cfg;
    if (!H) return;
    H.time += h;
    var live = this.state === 'round' && (H.kind === 'drag' ? this.phase === 'load' : this.phase === 'whistle');
    if (H.time >= H.T || !live) { this.hintHand = null; return; }
    this._hintGeo();
    if (!this.hintHand) return;
    var u = (H.time % cfg.hintCycle) / cfg.hintCycle, m = clamp((u - 0.18) / 0.55, 0, 1), s = m * m * (3 - 2 * m);
    H.t = u;
    if (H.kind === 'tap') {
      var press = Math.sin(Math.PI * clamp((u - 0.35) / 0.3, 0, 1));
      H.x = H.x0; H.y = H.y0 - 14 * (1 - press) + 4 * press;
    } else {
      H.x = lerp(H.x0, H.x1, s); H.y = lerp(H.y0, H.y1, s) - 50 * Math.sin(Math.PI * s);
    }
    H.alpha = clamp(H.time / 0.25, 0, 1) * clamp((H.T - H.time) / 0.35, 0, 1) * (H.kind === 'drag' ? clamp(Math.min(u / 0.08, (1 - u) / 0.12), 0, 1) : 1);
  };

  // ---------------------------------------------------------------- trajectories
  /* Constant-acceleration (parabolic) path from the current position to (x1, y1) in T s, apex H px above the higher end:
   *   √g = (√(2A0) + √(2A1)) / T, vy0 = −√(2 g A0), ay = g;  horizontal: vx0 given, ax = 2(x1 − x0 − vx0 T)/T². */
  function arc(it, x1, y1, T, H, vx0, minY) {
    var x0 = it.x, y0 = it.y, lo = Math.min(y0, y1), ya = Math.min(lo, Math.max(lo - H, minY || 0)), A0 = y0 - ya, A1 = y1 - ya;   // the apex stays on screen
    var sg = (Math.sqrt(2 * A0) + Math.sqrt(2 * A1)) / T, g = sg * sg;
    return { x0: x0, y0: y0, x1: x1, y1: y1, vx0: vx0, vy0: -Math.sqrt(2 * g * A0), ax: 2 * (x1 - x0 - vx0 * T) / (T * T), ay: g,
      T: T, tau: 0, H: H, rot0: it.rot, size0: it.size, size1: it.size };
  }
  P._slotPos = function (it, c) {
    var sl = c.slots[Math.min(it.slot, c.slots.length - 1)] || { x: (c.x0 + c.x1) / 2, y: c.floorY - 30, row: 0 };
    return { x: sl.x + c.ox + c.shake, y: sl.y, row: sl.row };
  };
  P._planFly = function (it, c) {
    var cfg = this.cfg, sp = this._slotPos(it, c), d = hyp(sp.x - it.x, sp.y - it.y);
    var T = clamp(cfg.flyBase + d * cfg.flyPerPx, cfg.flyMin, cfg.flyMax);
    var H = clamp(cfg.flyApex + Math.max(0, -(it.vy || 0)) * cfg.flyApexFromVy, cfg.flyApex, cfg.flyApexMax);
    var vx0 = clamp((it.vx || 0) * cfg.flyInherit, -500, 500);
    it._f = arc(it, sp.x, sp.y, T, H, vx0, this.layout.ins.top + 8);
    it._f.size1 = this.layout.S * c.scale * it.item.scale;
    it.state = 'fly'; it.t = 0; it.inCar = false; it.row = sp.row;
  };
  P._planReturn = function (it, kind) {
    var cfg = this.cfg;
    var T = { wrong: cfg.wrongReturnTime, tap: cfg.tapReturnTime, full: cfg.fullReturnTime }[kind] || cfg.missReturnTime;
    var H = { wrong: cfg.wrongApex, tap: cfg.tapApex, full: cfg.fullApex }[kind] || cfg.missApex;
    it._f = arc(it, it.homeX, it.homeY, T, H, 0, this.layout.ins.top + 8);
    it._f.size1 = it.restSize;
    it._retKind = kind;
    it.state = 'home'; it.t = 0; it.inCar = false;
  };
  P._land = function (it, quiet) {
    var cfg = this.cfg, c = this.carById(it.carId);
    it.state = 'in'; it.t = 0; it._f = null; it.inCar = true; it.vx = it.vy = 0; it.rot = 0;
    it.q = quiet ? 0 : cfg.landSquash; it.qv = 0; it.bounce = 0; it.bv = 0; it.tilt = 0; it.tv = 0;
    c.items.push(it.id); c.filled++;
    if (!quiet) { c.sqv += World.kickFor(cfg.carSquash, cfg.carOmega, cfg.carZeta); }
    this._inCarPos(it);
    this._lastLandT = this.time;
    // draw order: cargo in cars first, back rows first
    this._sortItems();
    this._emit({ type: 'land', id: it.id, carId: c.id, i: c.filled, n: c.need, x: it.x, y: it.y, quiet: !!quiet });
    if (c.filled >= c.need && !c._done) { c._done = true; this._emit({ type: 'carDone', carId: c.id, x: this.carBox(c).x, y: c.y0 }); }
  };
  P._sortItems = function () {
    var a = this.items, held = this.held;
    var order = a.map(function (it, i) { return { it: it, i: i, k: it.state === 'in' ? 0 : it.id === held ? 2 : 1 }; });
    order.sort(function (p, q) { return p.k - q.k || (p.k === 0 ? q.it.row - p.it.row : 0) || p.i - q.i; });
    this.items = order.map(function (o) { return o.it; });
  };
  P._inCarPos = function (it) {
    var c = this.carById(it.carId);
    if (!c) return;
    var sp = this._slotPos(it, c), size = this.layout.S * c.scale * it.item.scale;
    it.row = sp.row;
    it.sy = 1 - 1.2 * it.q; it.sx = 1 + it.q;
    it.size = size;
    it.x = sp.x; it.y = sp.y + size / 2 * (1 - it.sy) + it.bounce;
    it.rot = it.tilt;
  };
  World.kickFor = function (peak, w, z) { var s = Math.sqrt(1 - z * z); return peak * w * Math.exp(z / s * Math.atan2(s, z)); };

  // ---------------------------------------------------------------- simulation
  P.update = function (dt) {
    if (!(dt > 0)) return;
    var h = this.cfg.step;
    this._acc += Math.min(dt, this.cfg.maxFrame);
    while (this._acc >= h - 1e-12) { this._acc -= h; this._step(h); }
    if (this._acc < 0) this._acc = 0;
    this.alpha = this._acc / h;
  };

  P._step = function (h) {
    var cfg = this.cfg, i, T = this.train;
    for (i = 0; i < this.items.length; i++) { var o = this.items[i]; o._px = o.x; o._py = o.y; o._prot = o.rot; o._psize = o.size; }
    T._px = T.x; T._pwheelRot = T.wheelRot;
    for (i = 0; i < T.couple.length; i++) T.couple[i]._pdx = T.couple[i].dx;
    for (i = 0; i < this.cars.length; i++) { this.cars[i]._pox = this.cars[i].ox; this.cars[i]._psq = this.cars[i].sq; }
    if (this.hitch) { this.hitch._px = this.hitch.x; this.hitch._py = this.hitch.y; }
    if (this.balloon) { this.balloon._px = this.balloon.x; this.balloon._py = this.balloon.y; this.balloon._psway = this.balloon.sway; }
    this.time += h; this.stateTime += h; this.phaseTime += h;

    switch (this.state) {
      case 'intro': if (this.stateTime >= cfg.introTime) this._beginRound(); break;
      case 'round': this._stepRound(h); break;
      case 'roundDone':
        if (this.stateTime >= cfg.clearTime) this._nextRound();
        break;
      case 'talk':
        if (this.talkAnswered) { if (this.stateTime >= cfg.talkAfterAnswer) this._levelDone(); break; }
        this._talkAskT += h;
        if (this._talkAskT >= cfg.talkAskTime - 1e-9) {
          this._talkAskT = 0; this._talkAsks++;
          if (this._talkAsks >= cfg.talkGlowAfterAsks) this.talk.glowAnswer = true;
          this._emit({ type: 'talkAsk', talk: this.talk, n: this._talkAsks, glowAnswer: this.talk.glowAnswer });
        }
        break;
      case 'levelDone':
        if (this.stateTime >= cfg.levelDoneTime) {
          if (this.level < this.levels.length - 1) this.startLevel(this.level + 1);
          else {
            this._setState('sessionDone'); this.phase = null;
            this.lastTopics = this.levels.slice();
            this._emit({ type: 'sessionDone', stars: this.stars, trains: this.trains });
          }
        }
        break;
    }
    if (this.state === 'round') {
      this._stepTrain(h);
      for (i = 0; i < this.cars.length; i++) this._stepCar(this.cars[i], h);
      for (i = 0; i < this.items.length; i++) this._stepItem(this.items[i], h);
      this.items = this.items.filter(function (q) { return q.state !== 'gone'; });
      this._stepSurprises(h);
      this._stepHint(h);
    }
    T.whistle = Math.max(0, T.whistle - h / cfg.whistleTime);
    var lampT = this.weather === 3 ? 1 : 0;
    T.lamp += (lampT - T.lamp) * Math.min(1, h * 1.5);
    this._stepMomo(h);
  };

  P._stepRound = function (h) {
    var cfg = this.cfg, i;
    switch (this.phase) {
      case 'arrive':
        this._arriveU = Math.min(1, this._arriveU + h / cfg.arriveTime);
        if (this._arriveU >= 1) {
          this.train.x = 0; this.train.v = 0;
          this._emit({ type: 'arrive', x: this.layout.engine.x0, y: this.layout.trackY });
          this._mood('wave', 1.2);
          this._deal();
        }
        break;
      case 'deal': {
        var all = true;
        for (i = 0; i < this.items.length; i++) if (this.items[i].state === 'pop') { all = false; break; }
        if (all && this.phaseTime >= cfg.dealSettle) this._startLoad();
        break;
      }
      case 'load': {
        // still finger on a held cargo: let it go after stillDragTime s
        if (this.held && this._down && this.time - this._down.at >= cfg.stillDragTime) {
          var sid = this.held; this.cancelDrag();
          this._emit({ type: 'stillDrag', id: sid });
        }
        if (!this.held) {
          this._idleT += h;
          if (this._idleT >= this._idleGap - 1e-9) {
            this._idleT = 0;
            this._idleGap = Math.min(cfg.idleMax, this._idleGap * cfg.idleBackoff);
            this._idleN++;
            this._mood('think');
            var hit = this._hintItem(), hc = hit && this.answerCarId(hit), C = hc && this.carById(hc);
            this._emit({ type: 'idle', n: this._idleN, promptKey: this.cur.promptKey, params: this.cur.params, mode: this.cur.mode,
              x: C ? this.carBox(C).x : this.layout.W / 2, y: C ? C.y0 : this.layout.trackY });
            if (this._idleN >= cfg.idleHintFrom) this._autoHint(null, true);
          }
        }
        if (this.surprise === 'hitch' && !this._hitchDone && this.phaseTime >= cfg.hitchAt) this._hitchIn();
        if (this._solved()) {
          if (this._solvedAt < 0) this._solvedAt = this.time;
          var flying = this.items.some(function (q) { return q.state === 'fly' || (q._bye && q.state !== 'gone'); });
          if (!flying && this.time - this._lastLandT >= cfg.loadedSettle - 1e-9) {
            this._setPhase('whistle');
            this.hintHand = null;
            for (i = 0; i < this.cars.length; i++) this.cars[i]._glowT = 0;
            this._mood('point', 2);
            var Wh = this._whistlePos();
            this._emit({ type: 'loaded', x: Wh.x, y: Wh.y });
          }
        }
        break;
      }
      case 'whistle':
        if (!this._whistleHinted && this.phaseTime >= cfg.whistleNudge - 1e-9) {
          this._whistleHinted = true;
          this.hintHand = { kind: 'tap', itemId: null, carId: null, x: 0, y: 0, x0: 0, y0: 0, x1: 0, y1: 0, t: 0, alpha: 0, time: 0, T: cfg.whistleAuto - cfg.whistleNudge };
          this._hintGeo();
          var W2 = this._whistlePos();
          this._mood('point', 2);
          this._emit({ type: 'whistleHint', x: W2.x, y: W2.y });
        }
        if (this.phaseTime >= cfg.whistleAuto - 1e-9) this._doWhistle(true);
        break;
      case 'depart':
        if (this._departed) break;
        var Lc = this.cars[this.cars.length - 1], tail = Lc ? Lc.x1 + Lc.ox : this.layout.engine.x1 + this.train.x;
        if (tail < this.layout.tunnelX) {
          this._departed = true;
          this.trains++;
          this._emit({ type: 'departed' });
          var st = this._starsFor(this.misses);
          this.roundStars = st; this.stars += st; this.levelStars += st;
          this._emit({ type: 'roundDone', round: this.round, stars: st, misses: this.misses });
          this._setState('roundDone'); this.phase = 'clear'; this.phaseTime = 0;
          this.held = null; this._press = null; this.hintHand = null;
        }
        break;
    }
  };
  P._solved = function () {
    if (!this.cur || !this.cars.length) return false;
    if (this.cur.mode === 'count') return this.cars.every(function (c) { return c.filled >= c.need; });
    for (var i = 0; i < this.items.length; i++) if (this.items[i].state !== 'in') return false;
    return true;
  };
  /** 3 / 2 / 1 stars for 0 / 1 / ≥ 2 wrong drops. */
  P._starsFor = function (m) { return m <= 0 ? 3 : m === 1 ? 2 : 1; };
  P._nextRound = function () {
    var cfg = this.cfg;
    this._clearRound();
    this.round++;
    var el = this.time - this.levelStartTime;
    var long = this.round >= cfg.chapterMinRounds && el > cfg.chapterTimeLimit;
    if (this.round < this.roundsPerLevel && !long) this._beginRound();
    else { if (this.round < this.roundsPerLevel) this.roundsPerLevel = this.round; this._startTalk(); }   // a cut chapter: the HUD dots fill
  };

  // ---------------------------------------------------------------- train physics
  P._carsOx = function () {
    var T = this.train;
    for (var i = 0; i < this.cars.length; i++) this.cars[i].ox = T.x + (T.couple[i] ? T.couple[i].dx : 0);
  };
  P._stepTrain = function (h) {
    var cfg = this.cfg, T = this.train, L = this.layout, x0 = T.x, a = 0, i;
    switch (this.phase) {
      case 'arrive': {
        var u = this._arriveU, X0 = L.W + cfg.arriveFrom;
        T.x = this._arriveX(u);
        T.v = -2 * X0 * (1 - u) / cfg.arriveTime;
        a = u < 1 ? 2 * X0 / (cfg.arriveTime * cfg.arriveTime) : 0;
        if (u >= 1) { T.x = 0; T.v = 0; }
        break;
      }
      case 'depart':
        if (!this._started) {
          if (this.phaseTime >= cfg.whistleLead) {
            this._started = true;
            T.v = -cfg.departKick; a = -cfg.departKick / h;   // the jolt: an impulse, felt by every coupling in turn
            this._kickCargo(cfg.joltKick, -1);
            this._mood('cheer', 2.2);
            var E = L.engine;
            this._emit({ type: 'depart', x: E.x0 + T.x, y: L.trackY });
          }
        } else if (T.v > -cfg.departVmax) {
          a = -cfg.departAccel;
          T.v = Math.max(-cfg.departVmax, T.v + a * h);
        }
        T.x += T.v * h;
        break;
      default:
        T.v = 0;
    }
    T.a = a;
    var dist = T.x - x0;
    T.wheelRot += dist / cfg.wheelR;
    T.dist += Math.abs(dist);
    // couplings: per-coupling damped springs driven by the train's acceleration, delayed by coupleLag per car
    var lagN = Math.max(1, Math.round(cfg.coupleLag / h)), Hh = this._aHist;
    Hh.unshift(a); if (Hh.length > lagN * 5 + 2) Hh.length = lagN * 5 + 2;
    var w = cfg.coupleOmega, z = cfg.coupleZeta, lim = cfg.carGap - 4, sum = 0;
    for (i = 0; i < T.couple.length; i++) {
      var C = T.couple[i], ad = Hh[i * lagN] || 0, prevV = C.sv;
      C.sv += (-w * w * C.s - 2 * z * w * C.sv - cfg.coupleGain * ad) * h;
      C.s += C.sv * h;
      if (C.s < -lim) { C.s = -lim; if (C.sv < 0) C.sv = -C.sv * cfg.coupleRestitution; this._clack(i, true); }
      else if (C.s > cfg.carGap) { C.s = cfg.carGap; if (C.sv > 0) C.sv = -C.sv * cfg.coupleRestitution; }
      else if (prevV < 0 && C.sv >= 0 && C.s < -cfg.clackMin) this._clack(i, false);
      sum += C.s; C.dx = sum; C.v = C.sv;
    }
    this._carsOx();
    // puffs from the chimney
    var ch = L.chimney, cx = ch.x + T.x, sp = Math.abs(T.v);
    this._puffT -= h;
    if (this._puffT <= 0) {
      var moving = sp > 20;
      this._puffT = moving ? lerp(cfg.puffSlow, cfg.puffFast, clamp(sp / cfg.departVmax, 0, 1)) : cfg.puffIdle * this._crng.float(0.8, 1.2);
      if (cx > -60 && cx < L.W + 60 && (moving || this.phase === 'load' || this.phase === 'whistle' || this.phase === 'deal'))
        this._emit({ type: 'puff', x: cx, y: ch.y, v: T.v, small: !moving });
    }
    // rail joints: a clatter + small hops of the cargo in each car as it passes a joint
    if (sp > 30) {
      this._railAt += Math.abs(dist);
      if (this._railAt >= cfg.railJoint) {
        this._railAt -= cfg.railJoint;
        this._emit({ type: 'rail', v: T.v });
        if (this.phase === 'depart') this._kickCargo(cfg.hopKick, 1);
      }
    }
  };
  P._clack = function (i, hard) {
    var c = this.cars[i], T = this.train;
    if (!c) return;
    if (c._lastClack !== undefined && this.time - c._lastClack < 0.12) return;
    c._lastClack = this.time;
    var x = c.x0 + c.ox - this.cfg.carGap / 2;
    if (x > -40 && x < this.layout.W + 40) this._emit({ type: 'clack', i: i, carId: c.id, hard: !!hard, x: x, y: this.layout.trackY - this.cfg.wheelH, v: T.v });
  };
  /** Cargo in the cars hops (ballistic, restitution hopRest): `range` px/s upward kick; stagger 0.05 s per car. */
  P._kickCargo = function (range, scale) {
    var r = this._crng;
    for (var i = 0; i < this.items.length; i++) {
      var it = this.items[i];
      if (it.state !== 'in') continue;
      var c = this.carById(it.carId), k = c ? c.index : 0;
      it._kickAt = this.time + 0.05 * k;
      it._kickV = -r.float(range[0], range[1]) * Math.abs(scale || 1);
    }
    if (this.hitch) { this.hitch._kickAt = this.time + 0.05 * this.cars.length; this.hitch._kickV = -r.float(range[0], range[1]); }
  };

  P._stepCar = function (c, h) {
    var cfg = this.cfg;
    c.sqv += (-cfg.carOmega * cfg.carOmega * c.sq - 2 * cfg.carZeta * cfg.carOmega * c.sqv) * h;
    c.sq += c.sqv * h;
    if (c._shakeT >= 0) {
      c._shakeT += h;
      var u = c._shakeT / cfg.shakeTime;
      if (u >= 1) { c._shakeT = -1; c.shake = 0; }
      else c.shake = cfg.shakePx * Math.sin(TAU * cfg.shakeWiggles * u) * Math.pow(1 - u, 1.5);
    }
    if (c._glowT > 0) c._glowT = Math.max(0, c._glowT - h);
    var gT = c._glowT > 0 ? 1 : 0;
    c.glow += (gT - c.glow) * Math.min(1, h * (gT ? 6 : 3));
    if (c._done && c.done < 1) c.done = Math.min(1, c.done + h / 0.35);
  };

  P._spring = function (it, h) {
    var w = this.cfg.squashOmega, z = this.cfg.squashZeta;
    it.qv += (-w * w * it.q - 2 * z * w * it.qv) * h;
    it.q += it.qv * h;
    it.sx = 1 + it.q; it.sy = 1 - 1.2 * it.q;
  };

  P._stepItem = function (it, h) {
    var cfg = this.cfg, L = this.layout, f, u;
    it.t += h;
    if (it._glowT > 0) it._glowT = Math.max(0, it._glowT - h);
    var gT = it._glowT > 0 ? 1 : 0;
    it.glow += (gT - it.glow) * Math.min(1, h * (gT ? 6 : 3));
    // count round extras: wave goodbye (a little hop) and fade out
    if (it._bye && it.state !== 'drag' && it.state !== 'home' && it.state !== 'bye' && it.state !== 'gone' && this.time >= it._byeAt) { it.state = 'bye'; it.t = 0; }
    switch (it.state) {
      case 'pop': {
        var tt = this.phase === 'deal' ? this.phaseTime - it.delay - cfg.dealDelay : -1;
        if (tt >= 0 && !it._popped) { it._popped = true; this._emit({ type: 'pop', id: it.id, x: it.homeX, y: it.homeY }); }
        u = clamp(tt / cfg.popTime, 0, 1);
        it.appear = tt <= 0 ? 0 : easeOutBack(u);
        it.x = it.homeX; it.y = it.homeY; it.size = it.restSize * it.appear;
        if (u >= 1) { it.appear = 1; it.state = 'rest'; it.t = 0; it._bobW = 0; it.size = it.restSize; }
        break;
      }
      case 'rest': {
        it._bobW = Math.min(1, it._bobW + h / 0.5);
        var bob = cfg.bobAmp * it._bobW * Math.sin(it._bobPh + TAU * this.time / it._bobP);
        this._spring(it, h);
        it.lift = Math.max(0, it.lift - h * cfg.liftRate * it.lift - h);
        it.size = it.restSize * (1 + (cfg.liftScale - 1) * it.lift);
        it.x = it.homeX; it.y = it.homeY + bob + it.size / 2 * (1 - it.sy);
        it.rot += (0 - it.rot) * Math.min(1, h * 20); it.vx = it.vy = 0; it.vr = 0;
        break;
      }
      case 'drag': {
        var tx = clamp(this.finger.x + it._offX, 0, L.W), ty = clamp(this.finger.y + it._offY - cfg.liftPx, 0, L.H);
        var w = cfg.dragOmega;
        it.vx += (w * w * (tx - it.x) - 2 * w * it.vx) * h;
        it.vy += (w * w * (ty - it.y) - 2 * w * it.vy) * h;
        it.x += it.vx * h; it.y += it.vy * h;
        var tg = clamp(-it.vx * cfg.tiltK, -cfg.tiltMax, cfg.tiltMax), wr = cfg.tiltOmega;
        it.vr += (wr * wr * (tg - it.rot) - 2 * cfg.tiltZeta * wr * it.vr) * h;
        it.rot += it.vr * h;
        it.lift += (1 - it.lift) * Math.min(1, h * cfg.liftRate);
        it.size = it.restSize * (1 + (cfg.liftScale - 1) * it.lift);
        this._spring(it, h);
        break;
      }
      case 'fly':
      case 'home': {
        f = it._f;
        if (it.state === 'fly') {   // the car may still be springing: follow its slot
          var c0 = this.carById(it.carId);
          if (c0) { var sp = this._slotPos(it, c0), dxs = sp.x - f.x1; f.x1 = sp.x; f.ax += 2 * dxs / (f.T * f.T); }
        }
        f.tau = Math.min(f.T, f.tau + h);
        var s = f.tau;
        it.x = f.x0 + f.vx0 * s + 0.5 * f.ax * s * s;
        it.y = f.y0 + f.vy0 * s + 0.5 * f.ay * s * s;
        it.vx = f.vx0 + f.ax * s; it.vy = f.vy0 + f.ay * s;
        u = f.tau / f.T;
        it.lift = Math.max(0, it.lift - h * 5);
        it.size = f.size0 + (f.size1 - f.size0) * u;
        if (it.state === 'fly') {
          it.rot = f.rot0 * (1 - u) * (1 - u);
          if (it.vy > 0 && u > 0.55) it.inCar = true;   // descending into the car: draw between its back and front
        } else if (it._retKind === 'wrong') it.rot = f.rot0 * (1 - u) * (1 - u) + cfg.wobbleAmp * Math.sin(TAU * cfg.wobbleHz * f.tau) * (1 - u);
        else it.rot = f.rot0 * (1 - u) * (1 - u);
        it.vr = 0;
        this._spring(it, h);
        if (f.tau >= f.T - 1e-9) {
          if (it.state === 'fly') this._land(it, false);
          else {
            it.x = f.x1; it.y = f.y1; it.size = it.restSize; it.rot = 0; it.vx = it.vy = 0; it._f = null;
            it.state = 'rest'; it.t = 0; it._bobW = 0; it.q = cfg.homeSquash; it.qv = 0;
          }
        }
        break;
      }
      case 'in': {
        if (it._kickAt !== undefined && this.time >= it._kickAt) { it.bv = Math.min(it.bv, it._kickV); it._kickAt = undefined; }
        if (it.bounce < 0 || it.bv < 0) {
          it.bv += cfg.hopG * h; it.bounce += it.bv * h;
          if (it.bounce >= 0) {
            it.bounce = 0;
            if (it.bv > 60) { it.q = Math.max(it.q, Math.min(0.12, it.bv / 2000)); it.bv = -it.bv * cfg.hopRest; } else it.bv = 0;
          }
        }
        // the cargo tilts back as the train speeds up (a rotational spring driven by the acceleration)
        var wt = cfg.cargoTiltOmega;
        it.tv += (-wt * wt * it.tilt - 2 * cfg.cargoTiltZeta * wt * it.tv + cfg.cargoTiltK * this.train.a * wt * wt / 9) * h;
        it.tilt = clamp(it.tilt + it.tv * h, -0.35, 0.35);
        this._spring(it, h);
        this._inCarPos(it);
        break;
      }
      case 'bye': {
        u = clamp(it.t / cfg.byeTime, 0, 1);
        it.alpha = 1 - u;
        it.y = it.homeY - 40 * Math.sin(Math.PI * Math.min(1, u * 1.4)) * (1 - u * 0.5);
        it.rot = 0.25 * Math.sin(TAU * 2 * u) * (1 - u);
        it.size = it.restSize * (1 - 0.25 * u);
        if (u >= 1) it.state = 'gone';
        break;
      }
    }
  };

  // ---------------------------------------------------------------- surprises
  P._lastCar = function () { return this.cars[this.cars.length - 1] || null; };
  P._hitchSeat = function () {
    var c = this._lastCar(); if (!c) return { x: this.layout.W + 100, y: this.layout.trackY };
    return { x: c.x1 + c.ox - 0.3 * c.w, y: c.y0 + 6 };
  };
  P._hitchIn = function () {
    this._hitchDone = true;
    var L = this.layout, cfg = this.cfg, S = L.S, seat = this._hitchSeat(), x0 = L.W + 0.8 * S, hops = [], n = cfg.hitchHops;
    for (var k = 1; k <= n; k++) hops.push({ x: lerp(x0, seat.x, k / n), floor: k < n });
    this.hitch = { x: x0, y: L.trackY + 8, _px: x0, _py: L.trackY + 8, size: cfg.hitchSize * S, state: 'in', t: 0, flip: -1, hops: hops, arc: null, wait: 0,
      bounce: 0, bv: 0 };
    this._emit({ type: 'hitch', x: seat.x, y: seat.y - 0.5 * S });
  };
  P._balloonIn = function () {
    var S = this.layout.S;
    this.balloon = { x: 0, y: 0, _px: 0, _py: 0, size: this.cfg.balloonSize * S, sway: 0, _psway: 0, swayV: 0, bob: 0, bobV: 0, t: 0, popped: false, taps: 0 };
    this._surpriseGeo(true);
  };
  P._balloonTie = function () { var c = this._lastCar(); return c ? { x: c.x1 + c.ox - 0.35 * c.w, y: c.y0 + 8 } : { x: 0, y: 0 }; };   // tied in from the end: stays on screen (QA P1-1)
  P._surpriseGeo = function (snap) {
    var H = this.hitch, B = this.balloon;
    if (B) { var t = this._balloonTie(); B.x = t.x; B.y = t.y; if (snap) { B._px = B.x; B._py = B.y; B._psway = B.sway; } }
    if (H && (H.state === 'ride' || H.state === 'wave' || snap)) {
      if (H.state !== 'in') { var s = this._hitchSeat(); H.x = s.x; H.y = s.y + H.bounce; }
      else if (snap) { H.state = 'ride'; H.arc = null; H.hops = []; var s2 = this._hitchSeat(); H.x = s2.x; H.y = s2.y; }
      if (snap) { H._px = H.x; H._py = H.y; }
    }
  };
  P._stepSurprises = function (h) {
    var cfg = this.cfg, H = this.hitch, B = this.balloon, T = this.train;
    if (H) {
      H.t += h;
      if (H.state === 'in') {
        if (!H.arc) {
          if (H.wait > 0) H.wait -= h;
          else {
            var nx = H.hops.shift();
            if (!nx) { H.state = 'ride'; H.t = 0; this._emit({ type: 'hitchSit', x: H.x, y: H.y }); }
            else {
              var seat = this._hitchSeat(), y1 = nx.floor ? this.layout.trackY + 8 : seat.y, ya = Math.min(H.y, y1) - cfg.hitchApex;
              var t1 = Math.sqrt(2 * (H.y - ya) / cfg.hitchG), t2 = Math.sqrt(2 * (y1 - ya) / cfg.hitchG);
              H.arc = { x0: H.x, y0: H.y, x1: nx.floor ? nx.x : seat.x, y1: y1, t1: t1, T: t1 + t2, t: 0, last: !nx.floor };
            }
          }
        }
        if (H.arc) {
          var A = H.arc; A.t += h;
          var tt = Math.min(A.t, A.T);
          if (A.last) { var st = this._hitchSeat(); A.x1 = st.x; A.y1 = st.y; }
          H.x = A.x0 + (A.x1 - A.x0) * tt / A.T;
          H.y = A.y0 - cfg.hitchG * A.t1 * tt + 0.5 * cfg.hitchG * tt * tt;
          if (A.t >= A.T) { H.x = A.x1; H.y = A.y1; H.arc = null; H.wait = cfg.hitchPause; this._emit({ type: 'hitchHop', x: H.x, y: H.y }); }
        }
      } else {
        if (H._kickAt !== undefined && this.time >= H._kickAt) { H.bv = Math.min(H.bv, H._kickV); H._kickAt = undefined; }
        if (H.bounce < 0 || H.bv < 0) {
          H.bv += cfg.hopG * h; H.bounce += H.bv * h;
          if (H.bounce >= 0) { H.bounce = 0; H.bv = H.bv > 60 ? -H.bv * cfg.hopRest : 0; }
        }
        if (H.state === 'wave' && H.t >= cfg.hitchWave) { H.state = 'ride'; H.t = 0; }
        var s = this._hitchSeat(); H.x = s.x; H.y = s.y + H.bounce;
      }
    }
    if (B) {
      B.t += h;
      var tie = this._balloonTie(); B.x = tie.x; B.y = tie.y;
      // a pendulum: the string leans back against the train's speed (drag) and swings with its acceleration; idle sway
      var tgt = clamp(-T.v * cfg.balloonDrag, -cfg.balloonMax, cfg.balloonMax) - 0.12 + 0.06 * Math.sin(TAU * 0.35 * B.t), w = cfg.balloonOmega;
      B.swayV += (w * w * (tgt - B.sway) - 2 * cfg.balloonZeta * w * B.swayV + T.a * 0.0004) * h;
      B.sway = clamp(B.sway + B.swayV * h, -1.1, 1.1);
      if (this.phase !== 'depart' && this.layout) {   // parked: the head (and its tap target) never swings past the right edge
        var Lb = this.layout, room = (Lb.W - Lb.ins.right - 12 - 0.3 * B.size - B.x) / (0.72 * B.size);
        var smax = room >= 1 ? 1.1 : room <= -1 ? -1.1 : Math.asin(room);
        if (B.sway > smax) { B.sway = smax; if (B.swayV > 0) B.swayV = -0.3 * B.swayV; }
      }
      var wb = 7;
      B.bobV += (-wb * wb * B.bob - 2 * 0.3 * wb * B.bobV) * h;
      B.bob += B.bobV * h;
    }
  };

  P._stepMomo = function (h) {
    var m = this.momo, cfg = this.cfg, L = this.layout;
    m.x = L.momo.x + this.train.x; m.y = L.momo.y; m.h = L.momo.h;
    if (m.moodT > 0) { m.moodT -= h; if (m.moodT <= 0) { m.moodT = 0; m.mood = this.state === 'round' && this.phase === 'whistle' ? 'point' : 'idle'; } }
    m.blinkT -= h;
    if (m.blink && m.blinkT <= 0) { m.blink = false; m.blinkT = this._crng.float(cfg.blink[0], cfg.blink[1]); }
    else if (!m.blink && m.blinkT <= 0) { m.blink = true; m.blinkT = cfg.blinkTime; }
    var tx = (L.rug.x0 + L.rug.x1) / 2, held = this.held && this.itemById(this.held);
    if (held) tx = held.x;
    else if (this.hintHand) tx = this.hintHand.x;
    else if (this.hitch) tx = this.hitch.x;
    else if (this.balloon) tx = this.balloon.x;
    m.lookX += (tx - m.lookX) * Math.min(1, h * cfg.lookRate);
    m.look = clamp((m.lookX - m.x) / 500, -1, 1);
    // the whistle glows / pulses while waiting
    var T = this.train, gl = 0;
    if (this.state === 'round' && this.phase === 'whistle') gl = (this._whistleHinted ? 1 : 0.55) * (0.6 + 0.4 * Math.sin(TAU * 1.2 * this.phaseTime));
    T.glow += (gl - T.glow) * Math.min(1, h * 8);
  };

  TT.World = World;
})(window.TT = window.TT || {});
