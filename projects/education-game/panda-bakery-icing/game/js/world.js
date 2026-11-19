/* Mochi's Icing Bakery — IB.CONFIG + IB.World (headless, deterministic pick-and-trace simulation; DESIGN §2, §5.3)
 *
 * ============================== CONVENTIONS ==============================
 *  Units: logical px (short side 720), seconds, radians, y DOWN, rot > 0 clockwise. Screen space = world space (no camera).
 *  update(dt) runs fixed sub-steps of cfg.step (1/120 s). At the START of every sub-step every moving field is copied into
 *  its `_p` twin; render v = _v + (v − _v)·w.alpha.
 *  TRAY PICTURE px: the 600 × 400 authoring box of layout.tray {x, y, w = 600 s, h = 400 s, s}:
 *    X = tray.x + px·s, Y = tray.y + py·s   (w.path, w.icing, w.chips, w.walker are picture px; the rest is screen px).
 *  Docs: docs/MECHANICS.md (events table, render contract, CONFIG, layout, motion).
 * ========================================================================
 */
(function (IB) {
  'use strict';

  var CONFIG = {
    // ---- timing / state machine (s)
    step: 1 / 120, maxFrame: 1.0,
    roundsPerLevel: 4, chapterTimeLimit: 68, chapterMinRounds: 3,   // QA playtest P2-7 (was 75 / [∞, ∞, 44, 58])
    shortBudget: [1e9, 1e9, 30, 50],   // s into the chapter: a later round is "short" (colours: one bag + trace pair)
    introTime: 2.5, clearTime: 0.4, levelDoneTime: 1.8,
    talkAfterAnswer: 1.6, talkAskTime: 12, talkGlowAfterAsks: 2, talkMaxAsks: 3, talkGiveUp: 12,

    // ---- layout (DESIGN §2; px) — same maths as sea paint (canvas → tray, palette → choices, Nini → Mochi, clam → sack)
    shortSide: 720, minLong: 960, maxLong: 1600, tallRatio: 1.6,
    groundLand: 18, groundPort: 30,
    bubbleX: 24, bubbleYLand: 18, bubbleMaxW: 560, bubbleRight: 200, bubbleHLand: 122, bubbleYPort: 110, bubbleHPort: 124,
    hudW: 160, hudH: 96,
    frame: 16,                 // tray rim drawn OUTSIDE the inner tray box
    trayGapTop: 16, trayGapBottom: 20, trayGapBottomLand: 16, sideM: 24, sideMPort: 20, sideMMochi: 14, sMax: 1.25,
    choiceR: 58, choiceRPort: 72, choiceHitPad: 18, choiceGap: 24, choiceGapMax: 40, choiceDrop: 14, choiceDropLand: 8, choicesPlan: 4,   // choiceRPort: QA visual P2-1 (portrait phones, when it fits)
    mochiHLand: 250, mochiHPort: 210, mochiHPortMin: 170, mochiHPortUp: 230, mochiWFrac: 0.72, mochiXLand: 130, mochiGap: 8, mochiFeet: 6,
    mochiTrayGap: 10, mochiArtTop: 0.97,
    sackW: 112, sackH: 98, sackGap: 14, sackR: 66,
    landColumn: true, columnMinGain: 1.02,
    birdLaneBandLand: 120, birdLaneBandPort: 150,
    rackCookie: 74, rackCookieMin: 50, rackPad: 6, rackGap: 6, rackBandPort: 84,

    // ---- touch
    tapTime: 1.0, tapMovePx: 64, mochiPad: 10, trayPad: 30, softWob: 3,

    // ---- trace (picture px)
    tol: { 3: 72, 4: 64, 5: 55, 6: 50, 7: 45 }, look: 90, startTolK: 1.4,   // QA playtest P2-6 (+10 %: phones are the strict device)
    offPathTime: 0.6, offPathGap: 3,
    traceTapMove: 20, traceTapTime: 0.45,   // a press on the tray in a trace step shorter / smaller than this = a tap
    magicGain: 1.25, magicDollop: 80, magicDollopFrac: 0.12,   // magic icing: finger movement × gain advances the path; any tap
                                                              // squeezes a dollop of max(80 px, 12 % of the path)
    progressMarks: [0.25, 0.5, 0.75],
    flowHold: 0.12,                         // s after the last progress the icing still "flows"

    // ---- bag (screen px)
    bagOmega: 32, bagZeta: 0.82, bagSwingOmega: 9, bagSwingZeta: 0.3, bagTraceAngle: 0.3, bagRestAngle: -0.35, bagTiltPerV: 0.0007,
    bagTiltMax: 0.55, bagHover: 0.55, bagFlyMin: 0.24, bagFlyMax: 0.42, bagFlyPerPx: 1 / 3000, bagArc: 36, bagArcPerPx: 0.03,
    bagBob: 2.5, bagSize: 120, squeezeRate: 12,

    // ---- cookies / choices
    cookieFlyMin: 0.42, cookieFlyMax: 0.62, cookieFlyPerPx: 1 / 3000, cookieArc: 60, cookieArcPerPx: 0.05, cookieSpin: 0.35,
    squashOmega: 20, squashZeta: 0.32, landSquash: 0.2,
    enterTime: 1.0, enterFrom: 0.75, enterOmega: 9, enterZeta: 0.55, enterSway: 0.08,
    choicePopTime: 0.35, choiceStagger: 0.1, choiceDelay: 0.3, choiceLiftOmega: 14, choiceLiftZeta: 0.45, choiceSel: 0.35,
    choiceWobOmega: 26, choiceWobZeta: 0.18, choiceWob: 8, choiceOutTime: 0.28, traceDim: 0.6,
    bagGrabR: 90, bagGrabUp: 40,           // trace step: a press this close to (bag.x, bag.y − 40) grabs the resting bag
    dragPickPad: 90,                       // pick step: a drag from a choice released over the tray (+ pad) picks it
    askGap: 0.45, askGapPick: 0.2, traceDoneWait: 0.35,

    // ---- chips (picture px)
    chipR: 15, chipGap: 34, chipFlyTime: 0.36, chipArc: 50, chipEdge: 10,

    // ---- finish / hop / walk
    finishTime: 1.3, gleamTime: 0.8, sprinkleN: 26, sprinkleSpawn: 0.6, sprinkleG: 1500, sprinkleDrop: [160, 300],
    hopCrouch: 0.12, hop1Time: 0.34, hop1H: 46, hop2Time: 0.56, hop2Arc: 90, settleTime: 0.22, settleH: 12, hopTail: 0.12,
    walkSpeed: 230, walkMin: 1.0, walkMax: 1.7, waddle: 0.22, joyTime: 0.38, joyH: 34,

    // ---- help
    hintAfterMisses: 2,        // pick / chips steps: taps without progress (wrong / needPick / offTap) → hint
    assistAfter: 6, assistAfterOld: 5, assistMaxAge: 4,   // … this many → the next tap does the right thing (event assist)
    traceHintAfter: 2, traceHintIdle: 8, traceAssistAfter: 4, traceAssistAfterOld: 6,
    hintTime: 3, pathHintTime: 3.6, pathHintCycle: 1.8, pathHintFrac: 0.3, hintCooldown: 6, hintCycle: 1.2,
    idleTime: 12, idleBackoff: 1.5, idleMax: 30, idleHintFrom: 2,

    // ---- surprises: one round per chapter (round 1 or 2, never the warm-up); the type rotates per chapter
    surpriseRounds: [1, 2], surpriseTypes: ['bird', 'mouse'],
    birdAt: 2.5, birdSpeed: 170, birdHappySpeed: 440, birdPasses: 2, birdGapTime: 5, birdW: 120, birdR: 64, birdBob: 12, birdFlapHz: 7,
    mousePeek: [3.5, 6], mousePeekTime: 2.2, mouseOmega: 10, mouseZeta: 0.4, mouseHappyTime: 1.6,

    // ---- Mochi
    moodTime: { happy: 0.9, cheer: 1.6, oops: 0.8, think: 1.4, talk: 1.0, wave: 1.4, pipe: 0.7, point: 1.2 },
    lookRate: 6, blink: [2.2, 5], blinkTime: 0.13
  };
  IB.CONFIG = CONFIG;

  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hyp(x, y) { return Math.sqrt(x * x + y * y); }
  function lerp(a, b, u) { return a + (b - a) * u; }
  function smooth(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  function easeOutBack(u) { var c1 = 1.70158, c3 = c1 + 1, v = u - 1; return 1 + c3 * v * v * v + c1 * v * v; }
  function merge(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; if (b) for (k in b) o[k] = b[k]; return o; }
  function insOf(ins) { return { top: +(ins && ins.top) || 0, right: +(ins && ins.right) || 0, bottom: +(ins && ins.bottom) || 0, left: +(ins && ins.left) || 0 }; }
  function keepBoxes(hk) {
    var a = Array.isArray(hk) ? hk : hk ? [hk] : [], out = [];
    for (var i = 0; i < a.length; i++) { var b = a[i]; if (b && b.w > 0 && b.h > 0) out.push({ x: +b.x, y: +b.y, w: +b.w, h: +b.h }); }
    return out;
  }
  function hexOf(c) { return c && IB.PALETTE && IB.PALETTE[c] ? IB.PALETTE[c].base : c || null; }
  /** Initial velocity that gives a damped spring (ω, ζ) released from 0 a first peak of `peak`. */
  function kickFor(peak, w, z) { var s = Math.sqrt(1 - z * z); return peak * w * Math.exp(z / s * Math.atan2(s, z)); }
  function spring(o, k, kv, target, w, z, h) { o[kv] += (w * w * (target - o[k]) - 2 * z * w * o[kv]) * h; o[k] += o[kv] * h; }
  /** A ballistic arc in normalised time u ∈ [0, 1] from y0 to y1 whose apex is A px above the HIGHER end (constant gravity):
   *  y(u) = y0 + v·u + ½·g·u². → {v, g, at} (at = u of the apex). */
  function ballistic(y0, y1, A) {
    var a = y0 - Math.min(y0, y1) + Math.max(1, A), D = y1 - y0, q = Math.sqrt(2 * a) + Math.sqrt(Math.max(0, 2 * a + 2 * D)), g = q * q, v = -Math.sqrt(2 * g * a);
    return { v: v, g: g, at: -v / g };
  }
  function arcY(B, y0, u) { return y0 + B.v * u + 0.5 * B.g * u * u; }
  function tolOf(cfg, age) { var t = cfg.tol; return typeof t === 'number' ? t : t[age] || t[4] || 58; }

  /** DESIGN §2 short-side rule: CSS viewport → logical W×H. */
  function logicalSize(cssW, cssH, cfg) {
    cfg = cfg || CONFIG;
    var S = cfg.shortSide, aspect = cssW / Math.max(1, cssH);
    if (cssW >= cssH) return { W: clamp(Math.round(S * aspect), cfg.minLong, cfg.maxLong), H: S };
    return { W: S, H: clamp(Math.round(S / aspect), cfg.minLong, cfg.maxLong) };
  }

  // ================================================================== layout
  /** n slots of radius r centred at cx inside [lo, hi] (gap choiceGap … choiceGapMax). → slots | null */
  function slotRow(n, cx, lo, hi, y, cfg) {
    var r = cfg.choiceR, out = [];
    if (!n) return out;
    var room = hi - lo, gap = n > 1 ? clamp((room - 2 * r * n) / (n - 1), cfg.choiceGap, cfg.choiceGapMax) : 0;
    var w = 2 * r * n + gap * (n - 1);
    if (w > room + 1e-6) return null;
    var x0 = clamp(cx - w / 2, lo, hi - w);
    for (var i = 0; i < n; i++) out.push({ x: x0 + r + i * (2 * r + gap), y: y, r: r });
    return out;
  }
  function slotCol(n, x, cy, lo, hi, cfg) {
    var r = cfg.choiceR, out = [];
    if (!n) return out;
    var room = hi - lo, gap = n > 1 ? clamp((room - 2 * r * n) / (n - 1), cfg.choiceGap, cfg.choiceGapMax) : 0;
    var h = 2 * r * n + gap * (n - 1);
    if (h > room + 1e-6) return null;
    var y0 = clamp(cy - h / 2, lo, hi - h);
    for (var i = 0; i < n; i++) out.push({ x: x, y: y0 + r + i * (2 * r + gap), r: r });
    return out;
  }
  function birdLane(portrait, tray, F, bubble, hud, cfg) {
    var above = portrait ? bubble.y + bubble.h : Math.max(bubble.y + bubble.h, hud.y + hud.h);
    var band = tray.y - F - above, need = portrait ? cfg.birdLaneBandPort : cfg.birdLaneBandLand;
    return band >= need ? above + band / 2 : tray.y + 0.13 * tray.h;
  }
  /** The cooling rack: 4 cookie slots in a region (best of 4×1, 2×2, 1×4 by cookie size). align: 'center' | 'bottom'. */
  function rackIn(x0, y0, x1, y1, cfg, align) {
    var best = null, pad = cfg.rackPad, g = cfg.rackGap;
    [[4, 1], [2, 2], [1, 4]].forEach(function (cr) {
      var cols = cr[0], rows = cr[1];
      var size = Math.min(cfg.rackCookie, (x1 - x0 - 2 * pad) / cols - g, (y1 - y0 - 2 * pad) / rows - g);
      if (!best || size > best.size + 0.5) best = { cols: cols, rows: rows, size: size };
    });
    var size = Math.floor(best.size), cell = size + g, w = best.cols * cell + 2 * pad, h = best.rows * cell + 2 * pad;
    var x = (x0 + x1) / 2 - w / 2, y = align === 'bottom' ? y1 - h : (y0 + y1) / 2 - h / 2, slots = [];
    for (var j = 0; j < best.rows; j++) for (var i = 0; i < best.cols; i++) slots.push({ x: x + pad + cell * (i + 0.5), y: y + pad + cell * (j + 0.5) });
    return { x: x, y: y, w: w, h: h, size: size, cols: best.cols, rows: best.rows, slots: slots };
  }
  function layoutOut(W, H, ins, portrait, tall, groundY, bubble, hud, hk, tray, F, choices, mochi, sack, cfg, rackBand) {
    var bag = { x: mochi.x + 0.3 * mochi.h, y: mochi.y - 0.5 * mochi.h };
    var keep = [{ x: bubble.x, y: bubble.y, w: bubble.w, h: bubble.h, kind: 'bubble' }, { x: hud.x, y: hud.y, w: hud.w, h: hud.h, kind: 'hud' }];
    hk.forEach(function (b) { b.kind = 'hudKeep'; keep.push(b); });
    // the cooling rack (decoration — nothing to touch): landscape above Mochi's head in the left column; tall portrait right of
    // Mochi above the tray; portrait between the tray and the choices, right of Mochi.
    var mTop = mochi.y - cfg.mochiArtTop * mochi.h, rack, i, x0, x1, y0, y1;
    if (!portrait) {
      x0 = ins.left + 12; x1 = tray.x - F - 10; y0 = bubble.y + bubble.h + 10; y1 = mTop - 8;
      for (i = 0; i < hk.length; i++) if (hk[i].x < x1 && hk[i].y + hk[i].h < H / 2) y0 = Math.max(y0, hk[i].y + hk[i].h + 8);
      rack = rackIn(x0, y0, x1, y1, cfg, 'center');
    } else if (mochi.up) {
      x0 = mochi.x + mochi.w / 2 + 12; x1 = W - ins.right - 16; y0 = bubble.y + bubble.h + 10; y1 = tray.y - F - 10;
      rack = rackIn(x0, y0, x1, y1, cfg, 'bottom');
    } else {
      x0 = mochi.x + mochi.w / 2 + 12; x1 = W - ins.right - 14; y0 = tray.y + tray.h + F + 3;
      y1 = (choices.slots.length ? choices.y - cfg.choiceR : groundY - 2 * cfg.choiceR) - 10;
      if (sack && sack.x - sack.w / 2 < x1 && sack.y - sack.h < y1) x1 = Math.min(x1, sack.x - sack.w / 2 - 8);
      rack = rackIn(x0, y0, x1, y1, cfg, 'center');
    }
    return {
      W: W, H: H, ins: ins, portrait: portrait, tall: tall, groundY: groundY, bubble: bubble, hud: hud, tray: tray, frame: F,
      choices: choices, mochi: mochi, bag: bag, sack: sack, rack: rack, birdY: birdLane(portrait, tray, F, bubble, hud, cfg), keep: keep,
      safe: { x: ins.left, y: ins.top, w: W - ins.right - ins.left, h: H - ins.top - ins.bottom }
    };
  }
  /**
   * DESIGN §2 layout. plan = { n: choices this round (0–5), sack: bool (mouse round) }.
   *   tray {x, y, w, h, s} = INNER box (rim `frame` px drawn outside), choices {y, slots, sets {k: slots}, hitR, n, column},
   *   mochi {x, y (feet), h, w, up?}, bag {x, y} (resting nozzle tip), rack {x, y, w, h, size, slots[{x, y}]},
   *   sack null | {x, y (bottom), w, h}, birdY, bubble, hud, groundY, keep[] (debug).
   */
  function computeLayout(W, H, ins, cfg, plan, hudKeep) {
    var row = rowLayout(W, H, ins, cfg, plan, hudKeep);
    if (row.portrait) {
      // QA visual P2-1: portrait phones get bigger choices (r 72, hit r + 18) when the row fits them without shrinking the tray
      var n = (plan && plan.n) | 0;
      if (cfg.choiceRPort > cfg.choiceR && n <= 4) {
        var big = rowLayout(W, H, ins, merge(cfg, { choiceR: cfg.choiceRPort }), plan, hudKeep);
        if (big.choices.fit && big.tray.s >= row.tray.s * 0.97 - 1e-9 && big.rack.size >= cfg.rackCookieMin) return big;
      }
      return row;
    }
    if (!cfg.landColumn) return row;
    var col = columnLayout(W, H, ins, cfg, plan, hudKeep, row);
    return col && col.tray.s > row.tray.s * (cfg.columnMinGain || 1) ? col : row;
  }
  function withSets(choices, n, mk) {
    choices.sets = {};
    for (var k = 1; k <= Math.max(1, n); k++) choices.sets[k] = mk(k) || choices.slots;
    return choices;
  }
  function columnLayout(W, H, ins, cfg, plan, hudKeep, row) {
    ins = insOf(ins); plan = plan || {};
    var F = cfg.frame, r = cfg.choiceR, hk = keepBoxes(hudKeep), i;
    var groundY = row.groundY, bubble = row.bubble, hud = row.hud;
    var n = clamp(plan.n | 0, 0, 5), nPlan = Math.max(n, cfg.choicesPlan);
    var top = Math.max(bubble.y + bubble.h + cfg.trayGapTop + F, hud.y + hud.h + 8 + F);
    var colTop = hud.y + hud.h + 8, colBot = groundY - cfg.choiceDropLand;
    // QA visual P1-1: a keep box only pushes the column down when it overlaps the column band horizontally
    var bandL = W - ins.right - (cfg.choiceGap + 2 * r + cfg.sideM) - 8, bandR = W - ins.right;
    for (i = 0; i < hk.length; i++) if (hk[i].y + hk[i].h < H / 2) {
      top = Math.max(top, hk[i].y + hk[i].h + 8 + F);
      if (hk[i].x < bandR && hk[i].x + hk[i].w > bandL) colTop = Math.max(colTop, hk[i].y + hk[i].h + 8);
    }
    var bottom = groundY - cfg.trayGapBottomLand - F;
    // plan for max(n, 4) shells; when the column is too short: max(n, 3), then with a 12 px gap
    var slotCfg = cfg, need = function (k, g) { return k * 2 * r + (k - 1) * g; };
    if (colBot - colTop < need(nPlan, cfg.choiceGap) - 1e-6) {
      nPlan = Math.max(n, 3);
      if (colBot - colTop < need(nPlan, cfg.choiceGap) - 1e-6) {
        if (colBot - colTop < need(nPlan, 12) - 1e-6) return null;
        slotCfg = merge(cfg, { choiceGap: 12 });   // tighter slots only; the column keeps its 24 px from the tray
      }
    }
    var mH = cfg.mochiHLand, mW = cfg.mochiWFrac * mH, cl = cfg.sackW;
    var xL = ins.left + cfg.sideM, xR = W - ins.right, colW = cfg.choiceGap + 2 * r + cfg.sideM;
    var best = null;
    [false, true].forEach(function (sackLeft) {
      if (sackLeft && !plan.sack) return;
      var extra = sackLeft ? cl + cfg.sackGap : 0;
      var s = Math.min((bottom - top) / 400, (xR - colW - xL - extra - mW - cfg.mochiGap - 2 * F) / 600, cfg.sMax);
      if (!(s > 0)) return;
      var cw = 600 * s, ch = 400 * s, groupW = extra + mW + cfg.mochiGap + 2 * F + cw;
      var gx = xL + Math.max(0, (xR - colW - xL - groupW) / 2);
      var tray = { x: gx + extra + mW + cfg.mochiGap + F, y: top + Math.max(0, (bottom - top - ch) / 2), w: cw, h: ch, s: s };
      var mx = Math.max(ins.left + (sackLeft ? extra : 0) + cfg.mochiXLand - 0.0001, gx + extra + mW / 2);
      mx = Math.min(mx, tray.x - F - cfg.mochiGap - mW / 2);
      var mochi = { x: mx, y: groundY - cfg.mochiFeet, h: mH, w: mW };
      var outerR = tray.x + cw + F, colX = (outerR + xR) / 2;
      colX = clamp(colX, outerR + cfg.choiceGap + r, xR - cfg.sideM - r);
      var cy = tray.y + ch / 2, hiC = colBot, sack = null;
      if (plan.sack && !sackLeft) { hiC = groundY - 2 - cfg.sackH - cfg.sackGap; sack = { x: colX, y: groundY - 2, w: cl, h: cfg.sackH }; }
      var slots = slotCol(n, colX, cy, colTop, hiC, slotCfg);
      if (!slots) return;
      if (sackLeft) {
        var cx0 = mochi.x - mW / 2 - cfg.sackGap - cl / 2;
        if (cx0 - cl / 2 < ins.left + 8) return;
        sack = { x: cx0, y: groundY - 2, w: cl, h: cfg.sackH };
      }
      if (!best || s > best.tray.s) best = { tray: tray, mochi: mochi, slots: slots, sack: sack, colX: colX, cy: cy, hiC: hiC };
    });
    if (!best) return null;
    var choices = withSets({ y: best.slots.length ? best.slots[0].y : groundY - r, x: best.colX, slots: best.slots, hitR: r + cfg.choiceHitPad, n: n, column: true, fit: true, r: r }, n,
      function (k) { return slotCol(k, best.colX, best.cy, colTop, best.hiC, slotCfg); });
    return layoutOut(W, H, ins, false, H / W > cfg.tallRatio, groundY, bubble, hud, hk, best.tray, F, choices, best.mochi, best.sack, cfg);
  }
  function rowLayout(W, H, ins, cfg, plan, hudKeep) {
    ins = insOf(ins); plan = plan || {};
    var portrait = H > W, tall = H / W > cfg.tallRatio, F = cfg.frame, r = cfg.choiceR;
    var groundY = H - ins.bottom - (portrait ? cfg.groundPort : cfg.groundLand);
    var bx = ins.left + cfg.bubbleX, bubble;
    if (portrait) bubble = { x: bx, y: ins.top + cfg.bubbleYPort, w: W - bx - ins.right - cfg.bubbleX, h: cfg.bubbleHPort };
    else bubble = { x: bx, y: ins.top + cfg.bubbleYLand, w: Math.min(cfg.bubbleMaxW, W - ins.right - cfg.bubbleRight - bx), h: cfg.bubbleHLand };
    bubble.w = Math.max(0, bubble.w);
    var hud = { x: W - ins.right - cfg.hudW, y: 0, w: cfg.hudW + ins.right, h: ins.top + cfg.hudH };
    var hk = keepBoxes(hudKeep);
    var n = clamp(plan.n | 0, 0, 5), nPlan = Math.max(n, cfg.choicesPlan);
    var slotY = groundY - (portrait ? cfg.choiceDrop : cfg.choiceDropLand) - r, needW = nPlan * 2 * r + (nPlan - 1) * cfg.choiceGap;
    var top = bubble.y + bubble.h + cfg.trayGapTop + F, i;
    var tray, mochi, lo, hi, s, cw, ch, mH, mW, shiftL = 0;
    if (!portrait) {
      top = Math.max(top, hud.y + hud.h + 8 + F);
      mH = cfg.mochiHLand; mW = cfg.mochiWFrac * mH;
      var bottom = slotY - r - cfg.trayGapBottomLand - F;
      var xL = ins.left + cfg.sideM, xR = W - ins.right - cfg.sideM;
      for (i = 0; i < hk.length; i++) if (hk[i].y + hk[i].h < H / 2) top = Math.max(top, hk[i].y + hk[i].h + 8 + F);
      s = Math.min((bottom - top) / 400, (xR - xL - mW - cfg.mochiGap - 2 * F) / 600, cfg.sMax);
      cw = 600 * s; ch = 400 * s;
      var groupW = mW + cfg.mochiGap + 2 * F + cw, gx = xL + Math.max(0, (xR - xL - groupW) / 2);
      tray = { x: gx + mW + cfg.mochiGap + F, y: top + Math.max(0, (bottom - top - ch) / 2), w: cw, h: ch, s: s };
      mochi = { x: Math.max(ins.left + cfg.mochiXLand - 0.0001, gx + mW / 2), y: groundY - cfg.mochiFeet, h: mH, w: mW };
      mochi.x = Math.min(mochi.x, tray.x - F - cfg.mochiGap - mW / 2);
      lo = mochi.x + mW / 2 + 12; hi = xR; shiftL = mochi.x - mW / 2 - xL;
    } else {
      var sm = cfg.sideMMochi;
      mH = cfg.mochiHPort; mW = cfg.mochiWFrac * mH;
      var room = W - ins.left - ins.right - 2 * sm - cfg.mochiGap - needW;
      if (room < mW) { mW = Math.max(cfg.mochiWFrac * cfg.mochiHPortMin, room); mH = mW / cfg.mochiWFrac; }
      mochi = { x: ins.left + sm + mW / 2, y: groundY - cfg.mochiFeet, h: mH, w: mW };
      lo = ins.left + sm + mW + cfg.mochiGap; hi = W - ins.right - sm;
      var mTop = mochi.y - mH;
      // the rack strip lives between the tray and the choices (right of Mochi): reserve its band
      var bottomP = Math.min(slotY - r - Math.max(cfg.trayGapBottom, cfg.rackBandPort), mTop - cfg.mochiTrayGap) - F;
      for (i = 0; i < hk.length; i++) if (hk[i].y + hk[i].h < H / 2) top = Math.max(top, hk[i].y + hk[i].h + 8 + F);
      var wMax = W - ins.left - ins.right - 2 * cfg.sideMPort - 2 * F;
      s = Math.min((bottomP - top) / 400, wMax / 600, cfg.sMax);
      cw = 600 * s; ch = 400 * s;
      tray = { x: ins.left + (W - ins.left - ins.right - cw) / 2, y: bottomP - ch, w: cw, h: ch, s: s };
      // tall portraits (phones): plenty of room above the tray — Mochi stands ON the tray rim (top-left), the rack beside
      // her, the choices get the whole row and the group is centred in the free band
      var bottomFree = slotY - r - cfg.trayGapBottom - F;
      var sFree = Math.min((bottomFree - top) / 400, wMax / 600, cfg.sMax);
      var hUp = cfg.mochiHPortUp;
      if (bottomFree - top - 400 * sFree - 2 * F >= hUp + 30) {
        s = sFree; cw = 600 * s; ch = 400 * s;
        mH = hUp; mW = cfg.mochiWFrac * mH;
        var slack = bottomFree - top - ch - mH - 2 * F + 14;
        var cy0 = top + mH + F - 14 + slack * 0.55;
        tray = { x: ins.left + (W - ins.left - ins.right - cw) / 2, y: Math.min(bottomFree - ch, cy0), w: cw, h: ch, s: s };
        mochi = { x: tray.x + mW / 2 + 6, y: tray.y - F + 12, h: mH, w: mW, up: true };
        lo = ins.left + 18; hi = W - ins.right - 18;
      }
    }
    var cx = tray.x + tray.w / 2, slots = slotRow(n, cx, lo, hi, slotY, cfg), sack = null;
    var fallback = function (k) {
      return slotRow(k, cx, lo - 12, hi + cfg.sideM - 8, slotY, merge(cfg, { choiceGap: 12 })) ||
        slotRow(k, W / 2, ins.left + 12, W - ins.right - 12, slotY, merge(cfg, { choiceGap: 12 })) || [];
    };
    var fit = !!slots;
    if (!slots) slots = fallback(n);
    var rowHi = hi;
    if (plan.sack) {
      var cl = cfg.sackW, withSack = slotRow(n, cx, lo, hi - cl - cfg.sackGap, slotY, cfg);
      if (!withSack && !portrait && shiftL > 0) {   // narrow landscape: slide Mochi + tray left to make room for the sack
        tray.x -= shiftL; mochi.x -= shiftL; lo -= shiftL; cx -= shiftL;
        withSack = slotRow(n, cx, lo, hi - cl - cfg.sackGap, slotY, cfg);
        if (!withSack) { tray.x += shiftL; mochi.x += shiftL; lo += shiftL; cx += shiftL; }
      }
      if (withSack) {
        slots = withSack; rowHi = hi - cl - cfg.sackGap;
        var right = n ? slots[n - 1].x + r : lo;
        sack = { x: Math.min(hi - cl / 2, Math.max(right + cfg.sackGap + cl / 2, n ? 0 : cx + tray.w / 2 - cl / 2)), y: groundY - 2, w: cl, h: cfg.sackH };
      }
    }
    var choices = withSets({ y: slotY, slots: slots, hitR: r + cfg.choiceHitPad, n: n, column: false, fit: fit, r: r }, n,
      function (k) { return slotRow(k, cx, lo, rowHi, slotY, cfg) || fallback(k); });
    return layoutOut(W, H, ins, portrait, tall, groundY, bubble, hud, hk, tray, F, choices, mochi, sack, cfg);
  }

  // ================================================================== World
  function World(opts) {
    opts = opts || {};
    this.cfg = merge(CONFIG, opts.config);
    this.seed = opts.seed !== undefined ? opts.seed : 1;
    this.rng = new IB.RNG(this.seed);
    this._crng = new IB.RNG((IB.RNG.hash(this.seed) ^ 0x51ed27) >>> 0);   // cosmetic randomness (blinks, wobble signs, sprinkles)
    this.age = IB.Content.ageOf(opts.age !== undefined ? opts.age : 4);
    this.lang = opts.lang === 'vi' ? 'vi' : 'en';
    this._pendingAge = this.age; this._pendingLang = this.lang;
    this.state = 'menu'; this.phase = null;
    this.level = 0; this.levels = []; this.topic = null; this.weather = 0;
    this.round = 0; this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.stars = 0; this.levelStars = 0; this.roundStars = 0; this.misses = 0; this.stepMisses = 0; this.streak = 0; this.cookies = 0;
    this.time = 0; this.stateTime = 0; this.phaseTime = 0; this.alpha = 0; this._acc = 0;
    this.cur = null; this.step = -1; this.talk = null; this.talkAnswered = null;
    this.choices = []; this.cookie = null; this.side = null; this.home = null; this.walker = null;
    this.path = null; this.traceState = null; this.icing = []; this.chips = []; this.sprinkles = []; this.rackCookies = []; this.gallery = [];
    this.bag = { hex: null, color: null, x: 0, y: 0, _px: 0, _py: 0, angle: CONFIG.bagRestAngle, _pangle: CONFIG.bagRestAngle, av: 0, squeeze: 0, _psqueeze: 0,
      state: 'rest', size: this.cfg.bagSize, vx: 0, vy: 0, job: null, hoverT: 0 };
    this.mochi = { x: 0, y: 0, h: 200, w: 144, mood: 'idle', moodT: 0, blinkT: 3, blink: false, look: 0, lookX: 0 };
    this.hudKeep = opts.hudKeep || null; this.lastTopics = null; this.surprise = null; this._surpriseOff = 0; this._surpriseRound = 1;
    this.bird = null; this.sack = null; this.hintHand = null; this.trayGlow = 0; this.gleam = -1; this.guideGlow = 0; this.flow = 0; this.flowing = false;
    this.events = []; this.sessions = 0;
    this._idleN = 0; this._idleT = 0; this._idleGap = this.cfg.idleTime; this._lastHintT = -1e9; this.levelStartTime = 0;
    this._talkAskT = 0; this._talkAsks = 0; this._press = null; this.tapMoveMin = this.cfg.tapMovePx; this._prevAnswers = null;
    this._view = null; this._vp = null;
    this.setViewport(opts.width || 1280, opts.height || 720, opts.ins || null);
  }
  World.logicalSize = logicalSize;
  World.computeLayout = function (W, H, ins, cfg, plan, hudKeep) { return computeLayout(W, H, ins, merge(CONFIG, cfg), plan, hudKeep); };
  World.kickFor = kickFor;
  World.ballistic = ballistic;

  var P = World.prototype;
  Object.defineProperty(P, 'interactive', { get: function () { return this.state === 'round' && this.phase === 'play' && !this._stepDone && this.step >= 0; } });
  Object.defineProperty(P, 'stepInfo', { get: function () { return this.cur && this.step >= 0 ? this.cur.steps[this.step] || null : null; } });
  Object.defineProperty(P, 'magic', { get: function () { return !!this._magic; } });
  Object.defineProperty(P, 'tol', { get: function () { return tolOf(this.cfg, this.age); } });
  P._emit = function (e) { this.events.push(e); };
  P.drainEvents = function () { var e = this.events; this.events = []; return e; };
  P.setAge = function (a) { this._pendingAge = IB.Content.ageOf(a); };
  P.setLang = function (l) { this._pendingLang = l === 'vi' ? 'vi' : 'en'; };
  P._setState = function (s) { this.state = s; this.stateTime = 0; };
  P._setPhase = function (p) { this.phase = p; this.phaseTime = 0; };
  P._mood = function (m, t) { this.mochi.mood = m; this.mochi.moodT = t || this.cfg.moodTime[m] || 1; };
  P.skipTalk = function () { if (this.state === 'talk') this._levelDone(); };
  P._tapMove = function () { return Math.max(this.cfg.tapMovePx, +this.tapMoveMin || 0); };
  P.choiceById = function (id) { for (var i = 0; i < this.choices.length; i++) if (this.choices[i].id === id) return this.choices[i]; return null; };

  /** The current question {promptKey, params, mode, step, follow} (enter / play), else null. */
  P.prompt = function () {
    if (this.state !== 'round' || !this.cur || (this.phase !== 'play' && this.phase !== 'enter')) return null;
    var i = Math.max(0, this.step), s = this.cur.steps[i];
    if (!s) return null;
    return { promptKey: s.promptKey, params: s.params, mode: s.mode, step: i, follow: !!s.follow };
  };

  // ---------------------------------------------------------------- coordinates + test hooks (logical px)
  P.picToScreen = function (x, y) { var T = this.layout.tray; return { x: T.x + x * T.s, y: T.y + y * T.s }; };
  P.screenToPic = function (X, Y) { var T = this.layout.tray; return { x: (X - T.x) / T.s, y: (Y - T.y) / T.s }; };
  /** On the tray (inner box + rim + trayPad). The pad band does not count where Mochi stands (tall portrait: on the rim). */
  P._onTray = function (x, y, pad) {
    var T = this.layout.tray, F = this.layout.frame + (pad === undefined ? this.cfg.trayPad : pad);
    if (!(x >= T.x - F && x <= T.x + T.w + F && y >= T.y - F && y <= T.y + T.h + F)) return false;
    if (x >= T.x && x <= T.x + T.w && y >= T.y && y <= T.y + T.h) return true;
    var b = this._mochiBox();
    return !(x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
  };
  P.choiceHit = function (id) { var c = this.choiceById(id); return c && !c.gone ? { x: c.x, y: c.y, r: this.layout.choices.hitR } : null; };
  P._mochiBox = function () {
    var N = this.layout.mochi, p = this.cfg.mochiPad;
    return { x: N.x - N.w / 2 - p, y: N.y - N.h - p, w: N.w + 2 * p, h: N.h + 2 * p };
  };
  P._onMochi = function (x, y) { var b = this._mochiBox(); return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h; };
  P.mochiHit = function () { var b = this._mochiBox(); return { x: b.x + b.w / 2, y: b.y + b.h / 2, w: b.w, h: b.h }; };
  /** The bird's tap point when it can be tapped now (on screen, not under the HUD / bubble), else null. */
  P.birdHit = function () {
    var f = this.bird, L = this.layout;
    if (!f || f.state !== 'fly') return null;
    if (f.x < L.ins.left + 30 || f.x > L.W - L.ins.right - 30) return null;
    for (var i = 0; i < L.keep.length; i++) { var K = L.keep[i]; if (f.x > K.x - 20 && f.x < K.x + K.w + 20 && f.y > K.y - 20 && f.y < K.y + K.h + 20) return null; }
    var st = this.stepInfo;
    if (this.interactive && st && st.mode !== 'pickBag' && st.mode !== 'pickCookie' && this._onTray(f.x, f.y)) return null;
    if (this.interactive && this._choiceAt(f.x, f.y)) return null;
    return { x: f.x, y: f.y, r: this.cfg.birdR };
  };
  P.mouseHit = function () { var c = this.sack; return c ? { x: c.x, y: c.y - 0.5 * c.h, r: this.cfg.sackR } : null; };
  P.cookieScreen = function () { var c = this.cookie; return c ? { x: c.x, y: c.y, size: c.size } : null; };
  /** Remaining points of the CURRENT stroke (logical px), [] when there is no trace step. */
  P.pathScreen = function () {
    if (!this.path || !this.traceState || this.traceState.complete) return [];
    var self = this, rem = IB.Trace.remaining(this.path, this.traceState)[this.traceState.stroke] || [];
    return rem.map(function (q) { var p = self.picToScreen(q[0], q[1]); return [p.x, p.y]; });
  };
  /** Remaining points of every stroke still to trace (logical px). */
  P.pathScreenAll = function () {
    if (!this.path || !this.traceState) return [];
    var self = this;
    return IB.Trace.remaining(this.path, this.traceState).filter(function (s) { return s.length; })
      .map(function (s) { return s.map(function (q) { var p = self.picToScreen(q[0], q[1]); return [p.x, p.y]; }); });
  };
  /** A free chip spot on the cookie (logical px) or null. */
  P.chipSpot = function () {
    var s = this.stepInfo;
    if (!s || s.mode !== 'chips') return null;
    var q = this._freeChipSpot(s.on.x, s.on.y);
    return q ? this.picToScreen(q.x, q.y) : null;
  };
  /** What to do next for the right answer: {choice: id, x, y} | {trace: true, x, y} | {chip: {x, y}} | null. */
  P.answer = function () {
    if (!this.interactive) return null;
    var s = this.stepInfo;
    if (s.mode === 'pickBag' || s.mode === 'pickCookie') { var h = this.choiceHit(s.answer); return h ? { choice: s.answer, x: h.x, y: h.y } : null; }
    if (s.mode === 'trace') { var hd = IB.Trace.head(this.path, this.traceState), p = this.picToScreen(hd.x, hd.y); return { trace: true, x: p.x, y: p.y }; }
    if (s.mode === 'chips') { var c = this.chipSpot(); return c ? { chip: c } : null; }
    return null;
  };

  // ---------------------------------------------------------------- viewport
  P.setViewport = function (W, H, ins) { this._view = { W: W, H: H, ins: insOf(ins) }; this._relayout(false); };
  P._plan = function () {
    var n = 0;
    if (this.cur) this.cur.steps.forEach(function (s) { if (s.choices) n = Math.max(n, s.choices.length); });
    return { n: n, sack: this.surprise === 'mouse' };
  };
  P._relayout = function (force) {
    var v = this._view, pl = this._plan();
    var key = v.W + 'x' + v.H + ':' + JSON.stringify(v.ins) + ':' + JSON.stringify(pl) + ':' + JSON.stringify(this.hudKeep || null);
    if (key === this._vp && !force) return false;
    var had = !!this.layout;
    this._vp = key;
    this.layout = computeLayout(v.W, v.H, v.ins, this.cfg, pl, this.hudKeep);
    this.layout.hudKeep = keepBoxes(this.hudKeep);
    var N = this.layout.mochi;
    this.mochi.x = N.x; this.mochi.y = N.y; this.mochi.h = N.h; this.mochi.w = N.w; this.mochi.up = !!N.up;
    if (had) this._snapAll();
    return true;
  };
  /** Rotation / resize: everything snaps to the new layout; flights land at once; a press is cancelled (the trace keeps
   *  its progress — icing, chips and the walker live in tray picture px). */
  P._snapAll = function () {
    var L = this.layout, i, self = this;
    this._placeChoices(true);
    if (this._press) this._endPress(true);
    var B = this.bag;
    if (B.job) { B.job = null; }
    B.state = 'rest'; B.x = B._px = L.bag.x; B.y = B._py = L.bag.y; B.vx = B.vy = 0; B.hoverT = 0;
    [this.cookie, this.side, this.home].forEach(function (it) { if (it) self._landNow(it); });
    if (this.sack) {
      if (L.sack) { this.sack.x = L.sack.x; this.sack.y = L.sack.y; this.sack.w = L.sack.w; this.sack.h = L.sack.h; } else this.sack = null;
    }
    if (this.bird) { this.bird.y = this.bird._py = this.bird.y0 = L.birdY; this.bird.x = clamp(this.bird.x, -200, L.W + 200); this.bird._px = this.bird.x; }
    for (i = 0; i < this.rackCookies.length; i++) { var rc = this.rackCookies[i], sl = L.rack.slots[rc.slot] || L.rack.slots[L.rack.slots.length - 1]; rc.x = rc._px = sl.x; rc.y = rc._py = sl.y; rc.size = L.rack.size; }
    this._syncScreen();
    if (this.hintHand) this._hintGeo();
  };

  // ---------------------------------------------------------------- session flow
  P.newSession = function (opts) {
    this.age = this._pendingAge; this.lang = this._pendingLang;
    this.sessions++;
    this._clearRound(); this.cur = null; this.state = 'menu';
    var last = (opts && opts.lastTopics) || this.lastTopics || null;
    this.levels = IB.Content.topicsFor(this.age, this.rng, last);
    this._surpriseOff = this.rng.int(0, Math.max(0, this.cfg.surpriseTypes.length - 1));
    this.stars = 0; this.cookies = 0; this.gallery = []; this._prevAnswers = null; this.rackCookies = [];
    this.weather = 0;
    this._emit({ type: 'session', levels: this.levels.slice() });
    this.startLevel(0);
  };
  P._clearRound = function () {
    this.choices = []; this.cookie = null; this.side = null; this.home = null; this.walker = null; this.path = null; this.traceState = null;
    this.icing = []; this.chips = []; this.sprinkles = []; this.step = -1; this._press = null; this.bird = null; this.sack = null;
    this.hintHand = null; this._stepDone = false; this._waitAsk = -1; this.gleam = -1; this.guideGlow = 0; this.flowing = false; this._magic = false;
    this._hop = null; this._walk = null; this._hopEndT = null;
    var B = this.bag; B.job = null; B.state = 'rest'; B.hex = null; B.color = null; B.squeeze = 0; B.hoverT = 0;
    if (this.layout) { B.x = B._px = this.layout.bag.x; B.y = B._py = this.layout.bag.y; }
  };
  P.startLevel = function (i) {
    if (!this.levels.length) this.levels = IB.Content.topicsFor(this.age);
    this.level = clamp(i | 0, 0, this.levels.length - 1);
    this.topic = this.levels[this.level];
    this.weather = this.level % 4;
    this.round = 0; this.levelStars = 0; this.levelStartTime = this.time;
    this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.cur = null; this.talk = null; this.talkAnswered = null; this.surprise = null;
    var SR = this.cfg.surpriseRounds || [2];
    this._surpriseRound = SR[this.rng.int(0, SR.length - 1)];
    this._clearRound();
    this.rackCookies = [];   // a fresh cooling rack every chapter (the session's cookies stay in w.gallery)
    this._relayout(false);
    this._setState('intro'); this.phase = null;
    this._mood('wave', 1.6);
    this._emit({ type: 'level', level: this.level, topic: this.topic, weather: this.weather });
  };

  /** A tray item (board cookie, picked cookie, side animal, home): picture rest place + screen fields for render. */
  P._item = function (ck, at, extra) {
    var it = { ck: ck, px: at.x, py: at.y, psize: at.size, x: 0, y: 0, size: 0, rot: 0, sx: 1, sy: 1, alpha: 1, glow: 0, sparkle: 0, wob: 0, wv: 0,
      sq: 0, sqv: 0, offY: 0, offV: 0, job: null, state: 'rest', _px: 0, _py: 0, _psize: 0, _prot: 0, _psx: 1, _psy: 1 };
    if (extra) for (var k in extra) it[k] = extra[k];
    this._itemScreen(it);
    it._px = it.x; it._py = it.y; it._psize = it.size;
    return it;
  };
  P._itemScreen = function (it) {
    if (it.job) return;
    var T = this.layout.tray, p = this.picToScreen(it.px, it.py);
    it.x = p.x; it.y = p.y + it.offY; it.size = it.psize * T.s;
  };
  P._landNow = function (it) {
    var J = it.job;
    if (J && J.kind === 'fly' && J.onLand) { var cb = J.onLand; J.onLand = null; it.job = null; cb(); }
    else if (J && J.kind === 'hop') { it.job = null; this._hopLand(true); return; }
    it.job = null; it.offY = 0; it.offV = 0; it.state = 'rest';
    this._itemScreen(it);
  };

  P._beginRound = function () {
    var cfg = this.cfg;
    var rr = new IB.RNG((this.rng.next() * 4294967296) >>> 0);
    var ST = cfg.surpriseTypes, sp = ST && ST.length && this.round === this._surpriseRound && this.round > 0 ? ST[(this.level + this._surpriseOff) % ST.length] : null;
    var el = this.time - this.levelStartTime, sb = cfg.shortBudget, short = !!(sb && this.round > 0 && el > sb[Math.min(this.round, sb.length - 1)]);
    var cur = IB.Content.makeRound(this.topic, { age: this.age, lang: this.lang, rng: rr, roundIndex: this.round, surprise: sp, prev: this._prevAnswers, short: short, level: this.level });
    this._prevAnswers = cur.answers.slice();
    this._clearRound();
    this.cur = cur; this.surprise = sp;
    this.misses = 0; this.stepMisses = 0; this.streak = 0;
    this._relayout(true);
    if (sp === 'mouse' && !this.layout.sack) { this.surprise = sp = cur.surprise = 'bird'; this._relayout(true); }   // no room: the bird comes
    var L = this.layout, B = cur.board;
    if (B.cookie) this.cookie = this._item(B.cookie, B.at, { offY: -cfg.enterFrom * L.H, enter: true });
    if (B.home) this.home = this._item({ kind: 'home', home: B.home }, B.homeAt, { home: B.home, offY: -cfg.enterFrom * L.H - 60, enter: true });
    var first = cur.steps[0];
    if (first.choices) this._setChoices(first, cfg.choiceDelay);
    if (sp === 'mouse' && L.sack) this.sack = { x: L.sack.x, y: L.sack.y, w: L.sack.w, h: L.sack.h, mouse: 0, _pmouse: 0, mv: 0, peekT: 0, nextPeek: 1.2, happy: false, happyT: 0, taps: 0, glow: 0 };
    this._birdNext = sp === 'bird' ? cfg.birdAt : -1; this._birdPasses = 0;
    this._idleT = 0; this._idleGap = cfg.idleTime; this._idleN = 0;
    this._setState('round'); this._setPhase('enter');
    this._mood('happy', 1.2);
    var T = L.tray;
    this._emit({ type: 'round', round: this.round, topic: this.topic, surprise: sp, steps: cur.steps.length, modes: cur.steps.map(function (s) { return s.mode; }),
      short: cur.short, board: B.cookie ? B.cookie.kind : null, home: B.home || null });
    this._emit({ type: 'enter', x: T.x + T.w / 2, y: T.y + T.h / 2, cookie: !!B.cookie });
    if (this.sack) this._emit({ type: 'sack', x: this.sack.x, y: this.sack.y - this.sack.h / 2 });
  };

  /** Choices for a pick step: reuse the row when it is the same set (colours: the 2nd pair), else pop in new ones. */
  P._setChoices = function (s, delay) {
    var cfg = this.cfg, same = this.choices.length === s.choices.length && this.choices.every(function (c, i) { return c.id === s.choices[i].id && c.nameValue === s.choices[i].nameValue; });
    if (same) {
      var k = 0;
      this.choices.forEach(function (c) {
        c.dim = c.dim || 0; c.selected = false;
        if (c.gone) { c.gone = false; c.pop = 0; c._popped = false; c._popAt = k++ * cfg.choiceStagger; c._popClock = 0; }
      });
      return;
    }
    this.choices = s.choices.map(function (c, i) {
      return { id: c.id, kind: c.kind, color: c.color || null, hex: hexOf(c.color), ck: c.ck || null, nameKind: c.nameKind, nameValue: c.nameValue, scale: c.scale || 1,
        x: 0, y: 0, r: cfg.choiceR, pop: 0, _ppop: 0, lift: 0, _plift: 0, lv: 0, wob: 0, _pwob: 0, wv: 0, glow: 0, _glowT: 0, dim: 0, selected: false, gone: false,
        _popAt: (delay || 0) + i * cfg.choiceStagger, _popped: false, _popClock: 0, _px: 0, _py: 0 };
    });
    this._placeChoices(true);
  };
  P._placeChoices = function (snap) {
    var C = this.layout.choices, n = this.choices.length, slots = (C.sets && C.sets[n]) || C.slots;
    for (var i = 0; i < n; i++) {
      var c = this.choices[i], sl = slots[i] || { x: this.layout.W / 2, y: C.y, r: this.cfg.choiceR };
      c.x = sl.x; c.y = sl.y; c.r = sl.r;
      if (snap !== false) { c._px = c.x; c._py = c.y; }
    }
  };

  P._ask = function (first) {
    var cfg = this.cfg, s = this.stepInfo, B = this.bag, L = this.layout, i;
    this._stepDone = false; this._waitAsk = -1; this.stepMisses = 0; this._noProg = 0; this._magic = false; this._stepT = 0;
    this._idleT = 0; this._idleGap = cfg.idleTime; this._idleN = 0;
    var ev = { type: 'ask', promptKey: s.promptKey, params: s.params, mode: s.mode, step: this.step, steps: this.cur.steps.length, first: !!first, follow: !!s.follow,
      round: this.round, color: s.color || (s.params && s.params.color) || null, nameKind: s.nameKind, nameValue: s.nameValue };
    if (s.mode === 'pickBag' || s.mode === 'pickCookie') {
      if (!first || !this.choices.length) this._setChoices(s, 0);
      if (s.mode === 'pickBag') { B.hex = null; B.color = null; }   // Mochi puts the bag back
      for (i = 0; i < this.choices.length; i++) { this.choices[i].dim = 0; this.choices[i].selected = false; }
    } else if (s.mode === 'trace') {
      this.path = IB.Trace.path(s.path);
      this.traceState = IB.Trace.start(this.path);
      this._icingBase = this.icing.length;
      this._marks = 0; this._offT = 0; this._offN = 0; this._lastOffT = -1e9; this._traceTaps = 0; this._noProgT = 0; this._lastProgT = -1e9;
      B.hex = hexOf(s.color); B.color = s.color;
      var hd = IB.Trace.head(this.path, this.traceState), hp = this.picToScreen(hd.x, hd.y);
      ev.x = hp.x; ev.y = hp.y; ev.what = s.path.kind === 'road' ? 'road' : s.nameKind; ev.strokes = this.path.strokes.length;
    } else if (s.mode === 'chips') {
      this._chipsN = 0;
      ev.need = s.need;
      var cp = this.picToScreen(s.on.x, s.on.y); ev.x = cp.x; ev.y = cp.y;
    }
    this._mood('talk', 1.0);
    this._emit(ev);
  };

  P._startTalk = function () {
    var rr = new IB.RNG((this.rng.next() * 4294967296) >>> 0);
    this.talk = IB.Content.makeTalk(this.topic, { age: this.age, lang: this.lang, rng: rr });
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
  P._choiceAt = function (x, y) {
    var best = null, bd = 1e9, R = this.layout.choices.hitR;
    for (var i = 0; i < this.choices.length; i++) { var c = this.choices[i]; if (c.gone || c.pop < 0.3) continue; var d = hyp(x - c.x, y - c.y); if (d <= R && d < bd) { bd = d; best = c; } }
    return best;
  };
  /** → 'bird' | 'mouse' | 'trace' | 'press' | null.  The bird and the mouse react on the press. While a step is interactive a
   *  choice or the tray under the finger wins over the bird flying across it. */
  P.pointerDown = function (x, y) {
    if (this.state !== 'round' || this._press) return null;
    var it = this.interactive, s = this.stepInfo;
    // the tray only 'wins' over the bird when it is the target (trace / chips); in a pick step a tap on the bird is the bird
    var mine = it && (this._choiceAt(x, y) || (s && s.mode !== 'pickBag' && s.mode !== 'pickCookie' && this._onTray(x, y)));
    var bh = this.birdHit();
    if (bh && !mine && hyp(x - bh.x, y - bh.y) <= bh.r) { this._tapBird(); return 'bird'; }
    var mh = this.mouseHit();
    if (mh && !(it && this._choiceAt(x, y)) && hyp(x - mh.x, y - mh.y) <= mh.r) { this._tapMouse(); return 'mouse'; }
    var ch = it ? this._choiceAt(x, y) : null;
    this._press = { x: x, y: y, lx: x, ly: y, t: this.time, maxD: 0, kind: 'press', moved: 0, choice: ch ? ch.id : null };
    // trace step (QA P1-2): a press anywhere but on Mochi (the bird and the mouse reacted above) is a trace press — the bag
    // follows the finger, the icing only flows on the path. The resting bag in Mochi's paw counts as "not Mochi".
    if (it && s.mode === 'trace') {
      var B = this.layout.bag, onBag = hyp(x - B.x, y - (B.y - this.cfg.bagGrabUp)) <= this.cfg.bagGrabR;
      if (onBag || this._onTray(x, y) || !this._onMochi(x, y)) {
        this._press.where = this._onTray(x, y) ? 'tray' : onBag ? 'bag' : ch ? 'choice' : 'other';
        this._traceDown(x, y); return 'trace';
      }
    }
    return 'press';
  };
  P.pointerMove = function (x, y) {
    var p = this._press;
    if (!p) return;
    p.maxD = Math.max(p.maxD, hyp(x - p.x, y - p.y));
    var d = hyp(x - p.lx, y - p.ly);
    p.moved += d; p.lx = x; p.ly = y;
    if (p.kind === 'trace') this._traceMove(x, y, d);
  };
  /** → 'pick' | 'wrong' | 'needPick' | 'chip' | 'already' | 'offTap' | 'traceTap' | 'tracePause' | 'traceDone' | 'pokeMochi' |
   *  'soft' | 'assist' | null.  A tap = press + release within tapTime and < tapMovePx, handled at the PRESS position. */
  P.pointerUp = function (x, y) {
    var p = this._press;
    if (!p || this.state !== 'round') { this._press = null; return null; }
    if (x !== undefined) this.pointerMove(x, y);
    if (p.kind === 'trace') return this._traceUp(p);
    this._press = null;
    var mv = p.maxD, dur = this.time - p.t, isTap = mv < this._tapMove() && dur <= this.cfg.tapTime, s = this.stepInfo;
    if (this.interactive && s.mode === 'chips' && this._onTray(p.x, p.y)) return this._tapChips(p.x, p.y);
    if (this.interactive && (s.mode === 'pickBag' || s.mode === 'pickCookie') && this._onTray(p.x, p.y) && !this._choiceAt(p.x, p.y))
      return this._noProg >= this._assistAfter() ? this._assist(p.x, p.y) : this._needPick(p.x, p.y);
    var picking = this.interactive && (s.mode === 'pickBag' || s.mode === 'pickCookie');
    // QA P1-3: a drag that starts on a choice and is released over the tray picks it (right → pick, wrong → wrong)
    if (picking && p.choice && mv >= this._tapMove() && this._onTray(p.lx, p.ly, this.cfg.dragPickPad)) {
      var dc = this.choiceById(p.choice);
      if (dc && !dc.gone) return this._noProg >= this._assistAfter() ? this._assist(p.lx, p.ly) : this._tapChoice(dc);
    }
    if (!isTap) {
      this._soft(p.x, p.y, mv >= this._tapMove() ? 'drag' : 'hold');
      if (picking) this._noProgress();   // still counts toward the hint
      return 'soft';
    }
    return this.tap(p.x, p.y);
  };
  P.cancelDrag = function () { if (this._press) this._endPress(true); };
  P._endPress = function (cancel) {
    var p = this._press;
    this._press = null;
    if (p && p.kind === 'trace') {
      if (this.traceState) IB.Trace.lift(this.traceState);
      this.bag.hoverT = cancel ? 0.01 : this.cfg.bagHover;
      this._offT = 0;
    }
  };
  P._soft = function (x, y, kind) {
    var c = this._choiceAt(x, y), ev = { type: 'soft', kind: kind, target: null, x: x, y: y };
    if (c) { c.wv += kickFor(this.cfg.softWob, this.cfg.choiceWobOmega, this.cfg.choiceWobZeta); ev.target = 'choice'; ev.id = c.id; }
    else if (this._onTray(x, y)) ev.target = 'tray';
    this._emit(ev);
  };
  /** One tap at (x, y) (logical px), already classified as a tap. */
  P.tap = function (x, y) {
    if (this.state !== 'round') return null;
    var nb = this._mochiBox(), onMochi = x >= nb.x && x <= nb.x + nb.w && y >= nb.y && y <= nb.y + nb.h;
    if (!this.interactive) return onMochi ? this._pokeMochi() : null;
    var s = this.stepInfo, c = this._choiceAt(x, y), onTray = this._onTray(x, y);
    if (s.mode === 'pickBag' || s.mode === 'pickCookie') {
      if (this._noProg >= this._assistAfter() && (c || onTray || !onMochi)) return this._assist(x, y);
      if (c) return this._tapChoice(c);
      if (onTray) return this._needPick(x, y);
      if (onMochi) return this._pokeMochi();
      return this._offTap(x, y);
    }
    if (s.mode === 'chips') {
      if (onTray) return this._tapChips(x, y);
      if (onMochi) return this._pokeMochi();
      if (this._noProg >= this._assistAfter()) return this._assist(x, y);
      return this._offTap(x, y);
    }
    // trace step: a tap that did not start on the tray (magic icing: any tap squeezes a dollop)
    if (onMochi && !c) return this._pokeMochi();
    if (this._magic) return this._dollop();
    if (c) c.wv += kickFor(this.cfg.softWob, this.cfg.choiceWobOmega, this.cfg.choiceWobZeta);
    return this._traceTapEv(x, y, c ? 'choice' : onTray ? 'tray' : 'other');
  };

  P._assistAfter = function () { return this.age <= this.cfg.assistMaxAge ? this.cfg.assistAfter : this.cfg.assistAfterOld; };
  P._traceAssistAfter = function () { return this.age <= this.cfg.assistMaxAge ? this.cfg.traceAssistAfter : this.cfg.traceAssistAfterOld; };
  /** A tap / action that made no progress: the 2nd shows a hint (pick / chips steps). */
  P._noProgress = function () { this._noProg++; if (this._noProg >= this.cfg.hintAfterMisses) this._autoHint(false); };
  /** After many taps without progress (a toddler tapping around), the next tap does the right next thing (event 'assist').
   *  Misses already made still count for the stars. */
  P._assist = function (x, y) {
    var a = this.answer();
    if (!a) return null;
    this._noProg = 0;
    if (a.choice) { this._emit({ type: 'assist', target: 'choice', id: a.choice, x: x, y: y }); this._tapChoice(this.choiceById(a.choice)); return 'assist'; }
    if (a.chip) { this._emit({ type: 'assist', target: 'chip', x: x, y: y }); this._tapChips(a.chip.x, a.chip.y); return 'assist'; }
    return null;
  };
  P._pokeMochi = function () {
    var a = this.prompt(), N = this.layout.mochi;
    if (!a) return null;
    this._touch();
    this._mood('talk', 1.0);
    this._emit({ type: 'pokeMochi', promptKey: a.promptKey, params: a.params, mode: a.mode, step: a.step, follow: !!a.follow, x: N.x, y: N.y - 0.7 * N.h });
    return 'pokeMochi';
  };
  P._offTap = function (x, y) {
    var s = this.stepInfo;
    this._emit({ type: 'offTap', mode: s.mode, x: x, y: y });
    this._noProgress();
    return 'offTap';
  };
  P._needPick = function (x, y) {
    var s = this.stepInfo;
    this._emit({ type: 'needPick', kind: s.mode === 'pickBag' ? 'bag' : 'cookie', want: { nameKind: s.nameKind, nameValue: s.nameValue }, x: x, y: y });
    if (this.cookie) this.cookie.wv += kickFor(this.cfg.softWob, this.cfg.choiceWobOmega, this.cfg.choiceWobZeta);
    this._noProgress();
    return 'needPick';
  };
  P._tapChoice = function (c) {
    var s = this.stepInfo, cfg = this.cfg;
    if (c.id === s.answer) return this._pick(c);
    this.misses++; this.stepMisses++; this.streak++; this._touch();
    c.wv += kickFor(cfg.choiceWob, cfg.choiceWobOmega, cfg.choiceWobZeta) * (this._crng.chance(0.5) ? 1 : -1);
    this._mood('oops');
    this._emit({ type: 'wrong', kind: c.kind, id: c.id, color: c.color, got: { nameKind: c.nameKind, nameValue: c.nameValue }, want: { nameKind: s.nameKind, nameValue: s.nameValue },
      streak: this.streak, misses: this.misses, x: c.x, y: c.y });
    this._noProgress();
    return 'wrong';
  };
  /** A right pick: the bag flies to Mochi's paw (pickBag) / the cookie flies in an arc onto the tray (pickCookie). */
  P._pick = function (c) {
    var s = this.stepInfo, cfg = this.cfg, self = this;
    this.streak = 0; this._noProg = 0; this._touch();
    this._stepDone = true; this.hintHand = null;
    c.lv += kickFor(0.8, cfg.choiceLiftOmega, cfg.choiceLiftZeta); c.gone = true; c._glowT = 0;
    for (var i = 0; i < this.choices.length; i++) { this.choices[i].selected = this.choices[i] === c; this.choices[i]._glowT = 0; }
    this._mood('happy');
    this._emit({ type: 'pick', id: c.id, kind: c.kind, color: c.color, nameKind: c.nameKind, nameValue: c.nameValue, x: c.x, y: c.y });
    if (c.kind === 'bag') {
      var B = this.bag;
      B.hex = c.hex; B.color = c.color; B.x = B._px = c.x; B.y = B._py = c.y - 0.2 * c.r;
      this._bagTo(this.layout.bag.x, this.layout.bag.y, 'rest');
      this._waitFor = B.job.T;
    } else {
      if (s.side && this.cookie) {   // initial: the animal steps aside for the letter cookie
        this.side = this.cookie; this.cookie = null;
        this._flyItem(this.side, s.side, null);
      }
      var it = this._item(c.ck, s.land);
      it.x = it._px = c.x; it.y = it._py = c.y; it.size = it._psize = 2 * c.r * (c.scale || 1);
      this.cookie = it;
      this._flyItem(it, s.land, function () { self._emit({ type: 'land', what: 'tray', x: it.x, y: it.y }); });
      this._waitFor = it.job.T;
    }
    return 'pick';
  };
  /** Ballistic flight of a tray item from where it is now to a picture place (x linear, y parabola with apex, size eased). */
  P._flyItem = function (it, to, onLand) {
    var cfg = this.cfg, p = this.picToScreen(to.x, to.y), d = hyp(p.x - it.x, p.y - it.y);
    var T = clamp(cfg.cookieFlyMin + d * cfg.cookieFlyPerPx, cfg.cookieFlyMin, cfg.cookieFlyMax);
    it.px = to.x; it.py = to.y; it.psize = to.size;
    it.job = { kind: 'fly', x0: it.x, y0: it.y, s0: it.size, T: T, t: 0, A: cfg.cookieArc + cfg.cookieArcPerPx * d, spin: (p.x >= it.x ? 1 : -1) * cfg.cookieSpin, onLand: onLand };
    it.state = 'fly';
    this._emit({ type: 'whoosh', what: 'cookie', x: p.x, y: p.y });
  };
  P._stepItem = function (it, h) {
    var cfg = this.cfg, J = it.job, T = this.layout.tray;
    if (J && J.kind === 'fly') {
      J.t += h;
      var u = clamp(J.t / J.T, 0, 1), p = this.picToScreen(it.px, it.py), su = smooth(u);
      it.x = lerp(J.x0, p.x, u);
      it.y = arcY(ballistic(J.y0, p.y, J.A), J.y0, u);   // the target is re-read every step (rotation-safe)
      it.size = lerp(J.s0, it.psize * T.s, su);
      it.rot = J.spin * Math.sin(Math.PI * u);
      if (u >= 1) {
        it.job = null; it.state = 'rest'; it.rot = 0;
        it.sqv += kickFor(cfg.landSquash, cfg.squashOmega, cfg.squashZeta);
        if (J.onLand) J.onLand();
      }
    } else if (it.state === 'rest' && !J) {
      if (it.enter) {   // sliding onto the tray from above: damped spring, a squash on first contact
        var before = it.offY;
        spring(it, 'offY', 'offV', 0, cfg.enterOmega, cfg.enterZeta, h);
        if (before < 0 && it.offY >= 0 && !it._landed) { it._landed = true; it.sqv += kickFor(cfg.landSquash, cfg.squashOmega, cfg.squashZeta); this._emit({ type: 'land', what: 'tray', x: it.x, y: it.y }); }
        it.rot = cfg.enterSway * Math.sin(TAU * 0.9 * this.phaseTime) * Math.max(0, 1 - this.phaseTime / cfg.enterTime);
        if (this.phase !== 'enter' && Math.abs(it.offY) < 0.5 && Math.abs(it.offV) < 5) { it.enter = false; it.offY = 0; it.offV = 0; it.rot = 0; }
      }
      this._itemScreen(it);
    }
    spring(it, 'sq', 'sqv', 0, cfg.squashOmega, cfg.squashZeta, h);
    spring(it, 'wob', 'wv', 0, cfg.choiceWobOmega, cfg.choiceWobZeta, h);
    if (!it.hopSquash) { it.sx = 1 + 0.6 * it.sq; it.sy = 1 - it.sq; }
    if (it.sparkle > 0) it.sparkle = Math.max(0, it.sparkle - h / 0.8);
    var gT = it === this.cookie && this.phase === 'finish' ? 1 : 0;
    it.glow += (gT - it.glow) * Math.min(1, h * (gT ? 6 : 3));
    // a glyph cookie resting on the tray in a round that traces it: the embossed text fades out (plain 0 → 1 in 0.3 s) —
    // the dots + icing ARE the numeral / letter. Render: emboss alpha = 1 − plain (ck.plain = true on the rack).
    var pT = it.ck && it.ck.kind === 'glyph' && it === this.cookie && (!it.job || it.job.kind === 'hop') && this.cur &&
      this.cur.steps.some(function (st) { return st.mode === 'trace' && st.path.kind === 'glyph'; }) ? 1 : 0;
    it.plain = clamp((it.plain || 0) + (pT ? h : -h) / 0.3, 0, 1);
  };

  // ---------------------------------------------------------------- trace
  P._toPic = function (x, y) { return this.screenToPic(x, y); };
  P._traceDown = function (x, y) {
    var p = this._press, st = this.traceState, cfg = this.cfg, q = this._toPic(x, y);
    p.kind = 'trace'; p.total0 = st.total; p.st0 = { stroke: st.stroke, done: st.done, complete: st.complete, total: st.total }; p.prog = false; p.near = false; p.started = false;
    this._touch();
    IB.Trace.lift(st);
    this.bag.state = 'trace'; this.bag.hoverT = 0; this.bag.job = null;
    if (this._magic) { p.started = true; this._emit({ type: 'traceStart', stroke: st.stroke, n: this.path.strokes.length, resume: st.done > 0 || st.stroke > 0, magic: true, x: x, y: y }); }
    else this._track(q.x, q.y);
  };
  P._traceMove = function (x, y, d) {
    if (!this.traceState || this.traceState.complete) return;
    var q = this._toPic(x, y);
    if (this._magic) { if (d > 0) this._advance(d / this.layout.tray.s * this.cfg.magicGain); }
    else this._track(q.x, q.y);
  };
  P._traceUp = function (p) {
    this._endPress(false);
    var st = this.traceState, cfg = this.cfg;
    if (!st || st.complete || !this.interactive) return st && st.complete ? 'traceDone' : null;
    var dur = this.time - p.t;
    if (this._magic && p.moved < cfg.traceTapMove * 2) return this._dollop();
    // QA BUG-1: a tap (short, little movement) is never icing — progress made by it is rolled back (unless it finished a stroke)
    if (p.maxD < cfg.traceTapMove && dur < cfg.traceTapTime && st.stroke === p.st0.stroke) {
      if (p.prog) this._rollback(p.st0);
      return this._traceTapEv(p.x, p.y, p.where || 'tray');
    }
    if (p.prog) { this._emit({ type: 'tracePause', total: st.total, stroke: st.stroke }); return 'tracePause'; }
    // QA P1-1: a slide that made no progress counts like offPath (2nd → hint, 4th / 6th → magic icing)
    if (p.moved >= cfg.traceTapMove && this._lastOffT < p.t && !this._magic) {
      this._offN++; this._lastOffT = this.time;
      var hd = this._headScreen();
      this._emit({ type: 'offPath', n: this._offN, slide: true, x: p.lx, y: p.ly, hx: hd.x, hy: hd.y });
      this._traceNoProg();
    }
    return null;
  };
  P._rollback = function (s0) {
    var st = this.traceState;
    st.stroke = s0.stroke; st.done = s0.done; st.complete = s0.complete; st.total = s0.total; st.anchor = false;
    while (this._marks > 0 && st.total < this.cfg.progressMarks[this._marks - 1]) this._marks--;
    this._syncIcing();
  };
  P._dollop = function () {
    var cfg = this.cfg, st = this.traceState;
    this._advance(Math.max(cfg.magicDollop, cfg.magicDollopFrac * this.path.len));
    return st.complete ? 'traceDone' : 'tracePause';
  };
  P._traceTapEv = function (x, y, where) {
    this._traceTaps++;
    this._emit({ type: 'traceTap', n: this._traceTaps, where: where, x: x, y: y });
    this._traceNoProg();
    return 'traceTap';
  };
  /** offPath / traceTap: the 2nd shows the path hint, the 4th (ages ≤ 4) / 6th turns on magic icing. */
  P._traceNoProg = function () {
    this._noProg++;
    if (!this._magic && this._noProg >= this._traceAssistAfter()) {
      this._magic = true;
      var hd = this._headScreen();
      this._emit({ type: 'assist', target: 'path', magic: true, x: hd.x, y: hd.y });
      this._mood('pipe', 1.2);
    } else if (this._noProg >= this.cfg.traceHintAfter) this._autoHint(false);
  };
  P._headScreen = function () { var hd = IB.Trace.head(this.path, this.traceState); return this.picToScreen(hd.x, hd.y); };
  P._track = function (x, y) {
    var st = this.traceState, before = { stroke: st.stroke, done: st.done, total: st.total }, p = this._press;
    IB.Trace.track(this.path, st, x, y, this.tol, this.cfg.look);
    if (p && p.kind === 'trace') {
      if (st.anchor && !st.off) p.near = true;
      // every press that starts tracing says so (once): it touched the shining start / the icing head
      if (st.anchor && !p.started) {
        p.started = true;
        var sp = this.picToScreen(x, y);
        this._emit({ type: 'traceStart', stroke: before.stroke, n: this.path.strokes.length, resume: before.done > 0 || before.stroke > 0, magic: false, x: sp.x, y: sp.y });
      }
    }
    this._afterProgress(before);
  };
  P._advance = function (d) {
    var st = this.traceState, before = { stroke: st.stroke, done: st.done, total: st.total };
    IB.Trace.advance(this.path, st, d, this.tol);
    this._afterProgress(before);
  };
  P._afterProgress = function (b) {
    var st = this.traceState, cfg = this.cfg, n = this.path.strokes.length, i;
    if (st.total <= b.total + 1e-9) return;
    this._lastProgT = this.time; this._noProgT = 0; this._touch();
    if (this._press) this._press.prog = true;
    if (this.hintHand && this.hintHand.target === 'path') this.hintHand = null;
    this._syncIcing();
    var hp = this._headScreen();
    for (i = b.stroke; i < Math.min(st.complete ? n - 1 : st.stroke, n - 1); i++) {
      var e = this.path.strokes[i].pts[this.path.strokes[i].pts.length - 1], ep = this.picToScreen(e[0], e[1]);
      this._emit({ type: 'strokeDone', i: i, n: n, x: ep.x, y: ep.y });
      this._mood('happy', 0.6);
    }
    while (this._marks < cfg.progressMarks.length && st.total >= cfg.progressMarks[this._marks] && !st.complete) {
      this._emit({ type: 'traceProgress', total: cfg.progressMarks[this._marks], x: hp.x, y: hp.y });
      this._marks++;
    }
    if (st.complete) this._traceDone();
  };
  /** Rebuild the icing polylines of this step from the tracker (finished strokes whole, the current one up to `done`). */
  P._syncIcing = function () {
    var d = IB.Trace.drawn(this.path, this.traceState), s = this.stepInfo, hex = hexOf(s.color);
    for (var k = 0; k < d.length; k++) {
      if (!d[k].length) { if (this.icing[this._icingBase + k]) this.icing[this._icingBase + k].pts = []; continue; }
      var ic = this.icing[this._icingBase + k];
      if (!ic) {
        for (var j = this.icing.length; j <= this._icingBase + k; j++) this.icing[j] = this.icing[j] || { pts: [], hex: hex, color: s.color, wet: 1, alpha: 1, host: s.on || (s.path && s.path.kind === 'shape') ? 'cookie' : 'tray' };   // shape / size outlines are piped on the cookie too (integration fix)
        ic = this.icing[this._icingBase + k];
      }
      ic.pts = d[k]; ic.wet = 1;
    }
  };
  P._traceDone = function () {
    var s = this.stepInfo, hp = this._headScreen();
    this._stepDone = true; this.hintHand = null; this._waitFor = this.cfg.traceDoneWait;
    this.flowing = false;
    if (this.cookie) this.cookie.sparkle = 1;
    this._mood('cheer', 1.2);
    this._emit({ type: 'traceDone', what: s.path.kind === 'road' ? 'road' : s.nameKind, value: s.nameValue, color: s.color, magic: !!this._magic, x: hp.x, y: hp.y });
    if (this._press && this._press.kind === 'trace') this.bag.hoverT = 0.25;
  };

  // ---------------------------------------------------------------- chips
  P._freeChipSpot = function (cx, cy, want) {
    var cfg = this.cfg, s = this.stepInfo, R = s.on.r - cfg.chipR - cfg.chipEdge, chips = this.chips, best = null, bd = 1e9;
    function free(x, y) { for (var i = 0; i < chips.length; i++) if (hyp(x - chips[i].tx, y - chips[i].ty) < cfg.chipGap) return false; return hyp(x - s.on.x, y - s.on.y) <= R + 1e-6; }
    var tx = want ? want.x : cx, ty = want ? want.y : cy;
    var dd = hyp(tx - s.on.x, ty - s.on.y);
    if (dd > R) { tx = s.on.x + (tx - s.on.x) * R / dd; ty = s.on.y + (ty - s.on.y) * R / dd; }
    if (free(tx, ty)) return { x: tx, y: ty };
    for (var r = 8; r <= 2 * R; r += 8) for (var k = 0; k < 24; k++) {
      var a = k * TAU / 24, x = tx + r * Math.cos(a), y = ty + r * Math.sin(a);
      if (free(x, y)) { var d = hyp(x - tx, y - ty); if (d < bd) { bd = d; best = { x: x, y: y }; } }
      if (best && k === 23) return best;
    }
    return best;
  };
  P._tapChips = function (x, y) {
    var s = this.stepInfo, cfg = this.cfg;
    if (this._chipsN >= s.need) { this._emit({ type: 'already', kind: 'chip', n: s.need, x: x, y: y }); return 'already'; }
    var q = this._freeChipSpot(s.on.x, s.on.y, this._toPic(x, y));
    if (!q) { this._emit({ type: 'already', kind: 'chip', n: this._chipsN, x: x, y: y }); return 'already'; }
    this._chipsN++; this._noProg = 0; this._touch(); this.streak = 0;
    if (this.hintHand && this.hintHand.target === 'chip') this.hintHand = null;
    var from = this._toPic(this.layout.bag.x, this.layout.bag.y - 20);
    var ch = { x: from.x, y: from.y, _px: from.x, _py: from.y, tx: q.x, ty: q.y, r: cfg.chipR, squash: 0, sq: 0, sqv: 0, alpha: 1, rot: this._crng.float(-0.6, 0.6),
      fly: { x0: from.x, y0: from.y, t: 0, T: cfg.chipFlyTime, B: ballistic(from.y, q.y, cfg.chipArc) }, i: this._chipsN, n: s.need };
    this.chips.push(ch);
    this._mood('pipe', 0.5);
    if (this._chipsN >= s.need) { this._stepDone = true; this.hintHand = null; this._waitFor = cfg.chipFlyTime + 0.15; }
    var sp = this.picToScreen(q.x, q.y);
    this._emit({ type: 'chipDrop', i: this._chipsN, n: s.need, x: sp.x, y: sp.y });
    return 'chip';
  };
  P._stepChips = function (h) {
    var cfg = this.cfg;
    for (var i = 0; i < this.chips.length; i++) {
      var c = this.chips[i], F = c.fly;
      if (F) {
        F.t += h;
        var u = clamp(F.t / F.T, 0, 1);
        c.x = lerp(F.x0, c.tx, u); c.y = arcY(F.B, F.y0, u);
        if (u >= 1) {
          c.fly = null; c.x = c.tx; c.y = c.ty;
          c.sqv += kickFor(0.35, 24, 0.3);
          var sp = this.picToScreen(c.x, c.y);
          this._emit({ type: 'chip', i: c.i, n: c.n, x: sp.x, y: sp.y });
          if (c.i >= c.n && this.stepInfo && this.stepInfo.mode === 'chips') this._emit({ type: 'chipsDone', n: c.n, x: sp.x, y: sp.y });
        }
      }
      spring(c, 'sq', 'sqv', 0, 24, 0.3, h);
      c.squash = c.sq;
    }
  };

  // ---------------------------------------------------------------- surprises
  P._tapBird = function () {
    var f = this.bird;
    this._touch();
    f.state = 'happy'; f.t = 0;
    this._emit({ type: 'birdTap', x: f.x, y: f.y, dir: f.dir });
  };
  P._tapMouse = function () {
    var c = this.sack, cfg = this.cfg;
    this._touch();
    c.taps++; c.happy = true; c.happyT = cfg.mouseHappyTime; c.peekT = cfg.mouseHappyTime; c.nextPeek = this._crng.float(cfg.mousePeek[0], cfg.mousePeek[1]); c.mv += kickFor(0.25, cfg.mouseOmega, cfg.mouseZeta);
    this._emit({ type: 'mouseTap', x: c.x, y: c.y - 0.6 * c.h, taps: c.taps });
  };
  P._stepSurprises = function (h) {
    var cfg = this.cfg, L = this.layout, f = this.bird, c = this.sack;
    if (this._birdNext >= 0 && this.phase === 'play') {
      this._birdNext -= h;
      if (this._birdNext < 0 && !f) {
        var dir = this._crng.chance(0.5) ? 1 : -1;
        f = this.bird = { x: dir > 0 ? -cfg.birdW : L.W + cfg.birdW, y: L.birdY, y0: L.birdY, _px: 0, _py: 0, dir: dir, state: 'fly', t: 0, flap: 0, size: cfg.birdW };
        f._px = f.x; f._py = f.y;
        this._birdPasses++;
        this._emit({ type: 'bird', x: dir > 0 ? 0 : L.W, y: f.y, dir: dir });
      }
    }
    if (f) {
      f.t += h;
      var happy = f.state === 'happy', sp = happy ? cfg.birdHappySpeed : cfg.birdSpeed;
      f.x += f.dir * sp * h;
      // flutter: wing beats lift it in little hops (a bob locked to the flap), a happy bird climbs away
      var beat = TAU * cfg.birdFlapHz * (happy ? 1.5 : 1) * f.t;
      f.flap = 0.5 + 0.5 * Math.sin(beat);
      f.y = f.y0 + cfg.birdBob * Math.sin(TAU * 0.8 * f.t) - 3 * Math.sin(beat) - (happy ? 150 * Math.min(1, f.t) * Math.min(1, f.t) : 0);
      if ((f.dir > 0 && f.x > L.W + cfg.birdW) || (f.dir < 0 && f.x < -cfg.birdW)) {
        var again = f.state === 'fly' && this._birdPasses < cfg.birdPasses;
        this.bird = null;
        this._birdNext = again ? cfg.birdGapTime : -1;
      }
    }
    if (c) {
      if (c.peekT > 0) c.peekT = Math.max(0, c.peekT - h);
      else { c.nextPeek -= h; if (c.nextPeek <= 0 && this.phase === 'play') { c.peekT = cfg.mousePeekTime; c.nextPeek = this._crng.float(cfg.mousePeek[0], cfg.mousePeek[1]); this._emit({ type: 'mouse', x: c.x, y: c.y - c.h }); } }
      if (c.happyT > 0) { c.happyT = Math.max(0, c.happyT - h); if (!c.happyT) c.happy = false; }
      spring(c, 'mouse', 'mv', c.peekT > 0 ? 1 : 0, cfg.mouseOmega, cfg.mouseZeta, h);
      c.mouse = clamp(c.mouse, -0.05, 1.2);
      c.glow = c.peekT > 0 ? 0 : 0.3 + 0.2 * Math.sin(TAU * 0.6 * this.time);
    }
  };

  // ---------------------------------------------------------------- bag
  /** Fly the bag (nozzle tip) to (x, y) on an arc; `then` = the state after landing ('rest'). */
  P._bagTo = function (x, y, then) {
    var B = this.bag, cfg = this.cfg, d = hyp(x - B.x, y - B.y);
    B.job = { x0: B.x, y0: B.y, x1: x, y1: y, T: clamp(cfg.bagFlyMin + d * cfg.bagFlyPerPx, cfg.bagFlyMin, cfg.bagFlyMax), t: 0, A: cfg.bagArc + cfg.bagArcPerPx * d, then: then };
    B.state = 'fly';
  };
  P._stepBag = function (h) {
    var B = this.bag, cfg = this.cfg, L = this.layout, J = B.job, p = this._press, ox = B.x, oy = B.y, target = cfg.bagRestAngle;
    var tracing = p && p.kind === 'trace' && this.traceState && !this.traceState.complete;
    if (J) {
      J.t += h;
      var u = clamp(J.t / J.T, 0, 1), su = smooth(u);
      if (J.then === 'rest') { J.x1 = L.bag.x; J.y1 = L.bag.y; }
      B.x = lerp(J.x0, J.x1, su); B.y = arcY(ballistic(J.y0, J.y1, J.A), J.y0, su);
      if (u >= 1) { B.job = null; B.state = J.then || 'rest'; }
      target = cfg.bagRestAngle * 0.5;
    } else if (tracing || (B.state === 'trace' && (B.hoverT > 0 || p))) {
      // follows the finger (magic icing: the icing head) with a stiff damped spring; hovers a moment after a lift
      var tx = p ? p.lx : B.x, ty = p ? p.ly : B.y;
      if (this._magic && p) { var hd = this._headScreen(); tx = hd.x; ty = hd.y; }
      tx = clamp(tx, L.ins.left, L.W - L.ins.right); ty = clamp(ty, L.ins.top, L.H - L.ins.bottom);   // the bag stays on screen
      if (tracing) {
        B.vx += (cfg.bagOmega * cfg.bagOmega * (tx - B.x) - 2 * cfg.bagZeta * cfg.bagOmega * B.vx) * h;
        B.vy += (cfg.bagOmega * cfg.bagOmega * (ty - B.y) - 2 * cfg.bagZeta * cfg.bagOmega * B.vy) * h;
        B.x += B.vx * h; B.y += B.vy * h;
      } else {
        B.vx *= Math.pow(0.02, h); B.vy *= Math.pow(0.02, h);
        if (!B.hoverT) B.hoverT = 0.25;
        B.hoverT -= h;
        if (B.hoverT <= 0) { B.hoverT = 0; this._bagTo(L.bag.x, L.bag.y, 'rest'); }
      }
      B.state = 'trace';
      target = cfg.bagTraceAngle;
    } else {
      // resting in Mochi's paw: a slow breathing bob
      var rx = L.bag.x, ry = L.bag.y + cfg.bagBob * Math.sin(TAU * 0.45 * this.time);
      B.x += (rx - B.x) * Math.min(1, h * 12); B.y += (ry - B.y) * Math.min(1, h * 12);
      B.state = 'rest'; B.vx = B.vy = 0;
    }
    // pendulum: the bag hangs from the hand, so it swings against the horizontal acceleration (tilts with the velocity)
    var vxNow = (B.x - ox) / h;
    var tgt = target + clamp(-vxNow * cfg.bagTiltPerV, -cfg.bagTiltMax, cfg.bagTiltMax);
    spring(B, 'angle', 'av', tgt, cfg.bagSwingOmega, cfg.bagSwingZeta, h);
    var flowing = !!(this.traceState && this.time - this._lastProgT < cfg.flowHold && !this.traceState.complete && this.phase === 'play');
    this.flowing = flowing;
    var sqT = flowing ? 1 : tracing ? 0.25 : 0;
    B.squeeze += (sqT - B.squeeze) * Math.min(1, h * cfg.squeezeRate);
    this.flow += ((flowing ? 1 : 0) - this.flow) * Math.min(1, h * 10);
  };

  // ---------------------------------------------------------------- help
  P.resetNudges = function () {
    this._idleT = 0; this._idleGap = this.cfg.idleTime; this._idleN = 0;
    this._talkAskT = 0; this._talkAsks = 0; this._noProgT = 0;
    if (this.talk) this.talk.glowAnswer = false;
  };
  P._autoHint = function (fromIdle) {
    if (this.hintHand || this.time - this._lastHintT < this.cfg.hintCooldown) return null;
    return this._doHint(fromIdle);
  };
  P._doHint = function (fromIdle) {
    var a = this.answer(), cfg = this.cfg, s = this.stepInfo;
    if (!a) return null;
    var target = a.choice ? 'choice' : a.trace ? 'path' : 'chip';
    var H = { target: target, id: a.choice || null, x: 0, y: 0, x0: 0, y0: 0, t: 0, press: 0, alpha: 0, time: 0, T: target === 'path' ? cfg.pathHintTime : cfg.hintTime, pts: null };
    if (a.choice) this.choiceById(a.choice)._glowT = cfg.hintTime;
    this.hintHand = H; this._hintGeo();
    this._lastHintT = this.time;
    this._mood('point', H.T);
    var ev = { type: 'hint', target: target, id: H.id, x: H.x0, y: H.y0, mode: s.mode, color: s.color || null, want: { nameKind: s.nameKind, nameValue: s.nameValue } };
    if (fromIdle) ev.idle = true;
    this._emit(ev);
    return { target: target, id: H.id };
  };
  /** Manual hint (e.g. a tap on the bubble): the right choice glows / the ghost hand slides along the path. → {target, id} | null */
  P.hint = function () {
    if (!this.interactive) return null;
    if (this.hintHand) return { target: this.hintHand.target, id: this.hintHand.id };
    return this._doHint(false);
  };
  P._hintGeo = function () {
    var H = this.hintHand;
    if (!H) return;
    if (H.target === 'choice') { var c = this.choiceHit(H.id); if (!c) { this.hintHand = null; return; } H.x0 = c.x; H.y0 = c.y; H.pts = null; }
    else if (H.target === 'path') {
      // the next 30 % of the current stroke (≥ 120 px) from the icing head, screen px
      var st = this.traceState, p = this.path, si = st.stroke, len = p.strokes[si].len, a = st.done, b = Math.min(len, a + Math.max(120, this.cfg.pathHintFrac * len)), pts = [];
      for (var k = 0; k <= 16; k++) { var q = IB.Trace.pointAt(p, si, lerp(a, b, k / 16)), sp = this.picToScreen(q.x, q.y); pts.push([sp.x, sp.y]); }
      H.pts = pts; H.x0 = pts[0][0]; H.y0 = pts[0][1];
    } else { var cs = this.chipSpot(); if (!cs) { this.hintHand = null; return; } H.x0 = cs.x; H.y0 = cs.y; H.pts = null; }
  };
  P._stepHint = function (h) {
    var H = this.hintHand, cfg = this.cfg, u, press;
    var gT = H && H.target === 'path' ? 1 : 0;
    this.guideGlow += (gT - this.guideGlow) * Math.min(1, h * (gT ? 6 : 3));
    if (!H) return;
    H.time += h;
    if (H.time >= H.T || !this.interactive) { this.hintHand = null; return; }
    if (H.target === 'path') {
      if (!H.pts || (this.time * 120 | 0) % 12 === 0) this._hintGeo();
      if (!this.hintHand) return;
      // press at the head (0.25 s), slide along the next part (1.2 s), lift (0.35 s)
      var cyc = cfg.pathHintCycle; u = (H.time % cyc) / cyc;
      var t1 = 0.14, t2 = 0.8, v = clamp((u - t1) / (t2 - t1), 0, 1), idx = smooth(v) * (H.pts.length - 1), i0 = Math.floor(idx), f = idx - i0, i1 = Math.min(H.pts.length - 1, i0 + 1);
      H.x = lerp(H.pts[i0][0], H.pts[i1][0], f); H.y = lerp(H.pts[i0][1], H.pts[i1][1], f);
      press = u < t1 ? smooth(u / t1) : u < t2 ? 1 : 1 - smooth((u - t2) / (1 - t2));
      if (u >= t2) H.y -= 14 * smooth((u - t2) / (1 - t2));
      H.press = press; H.t = u;
    } else {
      this._hintGeo();
      if (!this.hintHand) return;
      u = (H.time % cfg.hintCycle) / cfg.hintCycle; press = Math.sin(Math.PI * clamp((u - 0.35) / 0.3, 0, 1));
      H.t = u;
      H.x = H.x0 + 26 * (1 - smooth(u / 0.35)) * (u < 0.35 ? 1 : 0);
      H.y = H.y0 + 30 * (1 - smooth(u / 0.35)) * (u < 0.35 ? 1 : 0) - 10 * (1 - press) * (u >= 0.35 ? 1 : 0) + 3 * press;
      H.press = press;
    }
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
    var i, B = this.bag;
    B._px = B.x; B._py = B.y; B._pangle = B.angle; B._psqueeze = B.squeeze;
    for (i = 0; i < this.choices.length; i++) { var c = this.choices[i]; c._ppop = c.pop; c._plift = c.lift; c._pwob = c.wob; c._px = c.x; c._py = c.y; }
    [this.cookie, this.side, this.home].forEach(function (it) { if (it) { it._px = it.x; it._py = it.y; it._psize = it.size; it._prot = it.rot; it._psx = it.sx; it._psy = it.sy; } });
    if (this.walker) { this.walker._px = this.walker.x; this.walker._py = this.walker.y; this.walker._prot = this.walker.rot; }
    for (i = 0; i < this.chips.length; i++) { this.chips[i]._px = this.chips[i].x; this.chips[i]._py = this.chips[i].y; }
    for (i = 0; i < this.sprinkles.length; i++) { this.sprinkles[i]._px = this.sprinkles[i].x; this.sprinkles[i]._py = this.sprinkles[i].y; }
    for (i = 0; i < this.rackCookies.length; i++) { var r = this.rackCookies[i]; r._px = r.x; r._py = r.y; r._psx = r.sx; r._psy = r.sy; }
    if (this.bird) { this.bird._px = this.bird.x; this.bird._py = this.bird.y; }
    if (this.sack) this.sack._pmouse = this.sack.mouse;
  };
  P._step = function (h) {
    var cfg = this.cfg;
    this._twins();
    this.time += h; this.stateTime += h; this.phaseTime += h;
    switch (this.state) {
      case 'intro': if (this.stateTime >= cfg.introTime) this._beginRound(); break;
      case 'round': this._stepRound(h); break;
      case 'roundDone':
        this._stepClear(h);
        if (this.stateTime >= cfg.clearTime) this._nextRound();
        break;
      case 'talk':
        if (this.talkAnswered) { if (this.stateTime >= cfg.talkAfterAnswer) this._levelDone(); break; }
        this._talkAskT += h;
        if (this._talkAsks < cfg.talkMaxAsks && this._talkAskT >= cfg.talkAskTime - 1e-9) {
          this._talkAskT = 0; this._talkAsks++;
          if (this._talkAsks >= cfg.talkGlowAfterAsks) this.talk.glowAnswer = true;
          this._emit({ type: 'talkAsk', talk: this.talk, n: this._talkAsks, glowAnswer: this.talk.glowAnswer });
        } else if (this._talkAsks >= cfg.talkMaxAsks && this._talkAskT >= cfg.talkGiveUp - 1e-9) this.talkAnswer(this.talk.answer, true);   // Mochi answers herself
        break;
      case 'levelDone':
        if (this.stateTime >= cfg.levelDoneTime) {
          if (this.level < this.levels.length - 1) this.startLevel(this.level + 1);
          else {
            this._setState('sessionDone'); this.phase = null;
            this.lastTopics = this.levels.slice();
            this._emit({ type: 'sessionDone', stars: this.stars, cookies: this.cookies, gallery: this.gallery.slice() });
          }
        }
        break;
    }
    if (this.state === 'round') {
      var self = this;
      [this.cookie, this.side, this.home].forEach(function (it) { if (it) self._stepItem(it, h); });
      this._stepChoices(h); this._stepBag(h); this._stepChips(h); this._stepSprinkles(h); this._stepSurprises(h); this._stepHint(h);
      for (var i = 0; i < this.icing.length; i++) if (this.icing[i] && this.icing[i].wet > 0 && !(this.flowing && i >= this._icingBase)) this.icing[i].wet = Math.max(0, this.icing[i].wet - h / 2);
    }
    this._stepRack(h);
    var gT = this.state === 'round' && this.phase === 'finish' ? 1 : 0;
    this.trayGlow += (gT - this.trayGlow) * Math.min(1, h * 5);
    this._stepMochi(h);
  };

  P._stepRound = function (h) {
    var cfg = this.cfg;
    switch (this.phase) {
      case 'enter':
        if (this.phaseTime >= cfg.enterTime) { this._setPhase('play'); this.step = 0; this._ask(true); }
        break;
      case 'play': {
        this._stepT += h;
        if (this._stepDone) {
          if (this._waitFor > 0) { this._waitFor -= h; break; }
          if (this._waitAsk < 0 && !this._busy()) {
            var s = this.stepInfo, nx = this.cur.steps[this.step + 1];
            this._waitAsk = nx && nx.follow ? cfg.askGapPick : cfg.askGap;
            this._emit({ type: 'stepDone', step: this.step, steps: this.cur.steps.length, mode: s.mode, last: !nx });
            if (!nx) this._mood('cheer', 1.0);
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
        var st = this.stepInfo;
        if (st.mode === 'trace') this._stepTraceHelp(h);
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
      case 'hop':
        this._stepHop(h);
        break;
    }
  };
  P._busy = function () {
    if (this.cookie && this.cookie.job) return true;
    if (this.side && this.side.job) return true;
    for (var i = 0; i < this.chips.length; i++) if (this.chips[i].fly) return true;
    return false;
  };
  /** Trace step help: off the path > 0.6 s while pressing → offPath (≥ 3 s apart); 8 s without progress → the path hint. */
  P._stepTraceHelp = function (h) {
    var cfg = this.cfg, p = this._press, st = this.traceState;
    this._noProgT += h;
    if (p && p.kind === 'trace' && st.off && p.near && !this._magic) {   // QA P2-4: only after this press was once on the dots
      this._offT += h;
      if (this._offT >= cfg.offPathTime && this.time - this._lastOffT >= cfg.offPathGap) {
        this._offT = 0; this._lastOffT = this.time; this._offN++;
        var hd = this._headScreen();
        this._emit({ type: 'offPath', n: this._offN, x: p.lx, y: p.ly, hx: hd.x, hy: hd.y });
        this._traceNoProg();
      }
    } else this._offT = 0;
    if (this._noProgT >= cfg.traceHintIdle) { this._noProgT = 0; this._autoHint(!p); }
  };

  // ---------------------------------------------------------------- choices
  P._stepChoices = function (h) {
    var cfg = this.cfg, out = this.phase === 'finish' || this.phase === 'hop' || this.state !== 'round', s = this.stepInfo, tracing = s && s.mode !== 'pickBag' && s.mode !== 'pickCookie';
    for (var i = 0; i < this.choices.length; i++) {
      var c = this.choices[i];
      if (out || c.gone) {
        if (c.gone && !out) c.pop = Math.max(0, c.pop - h / 0.12);
        else c.pop = Math.max(0, c.pop - h / cfg.choiceOutTime);
      } else if (!c._popped || c.pop < 1) {
        c._popClock += h;
        var tt = c._popClock - c._popAt;
        if (tt >= 0 && !c._popped) { c._popped = true; this._emit({ type: 'choicePop', id: c.id, kind: c.kind, color: c.color, x: c.x, y: c.y }); }
        c.pop = tt <= 0 ? 0 : tt >= cfg.choicePopTime ? 1 : easeOutBack(tt / cfg.choicePopTime);
      }
      spring(c, 'lift', 'lv', 0, cfg.choiceLiftOmega, cfg.choiceLiftZeta, h);
      spring(c, 'wob', 'wv', 0, cfg.choiceWobOmega, cfg.choiceWobZeta, h);
      if (c._glowT > 0) c._glowT = Math.max(0, c._glowT - h);
      var gT = c._glowT > 0 ? 1 : 0;
      c.glow += (gT - c.glow) * Math.min(1, h * (gT ? 6 : 3));
      var dT = out ? 1 : tracing && this.phase === 'play' ? cfg.traceDim : 0;
      c.dim += (dT - c.dim) * Math.min(1, h * 4);
    }
  };

  // ---------------------------------------------------------------- finish: gleam + sprinkles
  P._startFinish = function () {
    var cfg = this.cfg, r = this._crng, it = this.cookie, self = this;
    this.hintHand = null;
    if (this._press) this._endPress(true);
    this._setPhase('finish');
    this._mood('pipe', cfg.finishTime);
    this.gleam = 0;
    for (var i = 0; i < this.icing.length; i++) this.icing[i].wet = 1;
    // sprinkles: on the cookie (they stick and travel with it); animals: along the road on the tray
    var cols = ['#E84A4A', '#3C8DE8', '#FFD23F', '#4CC26B', '#FF9A2E', '#8E44AD', '#FF8FC0', '#FFFFFF'];
    var road = this.topic === 'animals' && this.path ? this.path.strokes[0] : null;
    this.sprinkles = [];
    for (i = 0; i < cfg.sprinkleN; i++) {
      var lx, ly, host;
      if (road) { var q = road.pts[r.int(0, road.pts.length - 1)]; lx = q[0] + r.float(-26, 26); ly = q[1] + r.float(-22, 22); host = 'tray'; }
      else if (it) { var a = r.float(0, TAU), rr = Math.sqrt(r.next()) * (it.psize / 2 - 18); lx = it.px + rr * Math.cos(a); ly = it.py + rr * Math.sin(a); host = 'cookie'; }
      else { lx = r.float(150, 450); ly = r.float(120, 300); host = 'tray'; }
      this.sprinkles.push({ lx: lx, ly: ly, px: lx + r.float(-20, 20), py: ly - r.float(cfg.sprinkleDrop[0], cfg.sprinkleDrop[1]), vy: r.float(0, 80), at: r.float(0, cfg.sprinkleSpawn),
        rot: r.float(0, TAU), spin: r.float(-9, 9), hex: r.pick(cols), plen: r.float(12, 17), len: 0, alpha: 0, bounced: false, landed: false, host: host, x: 0, y: 0, _px: 0, _py: 0 });
    }
    this._syncScreen();
    var c = it ? { x: it.x, y: it.y } : this.picToScreen(300, 200);
    this._emit({ type: 'finish', topic: this.topic, x: c.x, y: c.y });
    if (it) it.sparkle = 1;
  };
  P._stepSprinkles = function (h) {
    var cfg = this.cfg;
    for (var i = 0; i < this.sprinkles.length; i++) {
      var p = this.sprinkles[i];
      if (p.at > 0) { p.at -= h; continue; }
      p.alpha = Math.min(1, p.alpha + h / 0.12);
      if (!p.landed) {
        var x0 = p.px;
        p.vy += cfg.sprinkleG * h; p.py += p.vy * h; p.px += (p.lx - x0) * Math.min(1, h * 3); p.rot += p.spin * h;
        if (p.py >= p.ly) {
          p.py = p.ly;
          if (!p.bounced && p.vy > 120) { p.vy = -0.22 * p.vy; p.bounced = true; p.spin *= 0.4; }
          else { p.landed = true; p.vy = 0; p.px = p.lx; }
        }
      }
    }
    this._syncScreen();
  };
  P._stepFinish = function (h) {
    var cfg = this.cfg;
    this.gleam = this.phaseTime < cfg.gleamTime ? this.phaseTime / cfg.gleamTime : -1;
    if (this.phaseTime >= cfg.finishTime) this._startHop();
  };
  /** Screen positions of picture-space things (sprinkles). */
  P._syncScreen = function () {
    for (var i = 0; i < this.sprinkles.length; i++) {
      var p = this.sprinkles[i], s = this.picToScreen(p.px, p.py);
      p.x = s.x; p.y = s.y; p.len = p.plen * this.layout.tray.s;
    }
  };

  // ---------------------------------------------------------------- hop: onto the cooling rack (animals: walk home first)
  /** Icing, chips and sprinkles of the cookie, normalised to the cookie (centre 0,0; 1 = the cookie diameter). */
  P._decorate = function (it) {
    var ck = {}, k, D = it.psize, cx = it.px, cy = it.py;
    for (k in it.ck) ck[k] = it.ck[k];
    function n(x, y) { return [(x - cx) / D, (y - cy) / D]; }
    ck.icing = this.icing.filter(function (ic) { return ic && ic.host === 'cookie' && ic.pts.length; })
      .map(function (ic) { return { pts: ic.pts.map(function (q) { return n(q[0], q[1]); }), hex: ic.hex, w: IB.Content.ICING_W / D }; });
    ck.chips = this.chips.map(function (c) { var q = n(c.tx, c.ty); return { x: q[0], y: q[1], r: c.r / D, rot: c.rot }; });
    ck.sprinkles = this.sprinkles.filter(function (p) { return p.host === 'cookie' && p.landed; })
      .map(function (p) { var q = n(p.lx, p.ly); return { x: q[0], y: q[1], hex: p.hex, rot: p.rot, len: p.plen / D }; });
    if (ck.kind === 'glyph') ck.plain = true;   // the icing IS the numeral / letter: no embossed text under it
    return ck;
  };
  P._startHop = function () {
    this._setPhase('hop');
    this.gleam = -1;
    var it = this.cookie;
    if (this.topic === 'animals' && it && this.path) { this._startWalk(); return; }
    if (!it) { this._finishRound(); return; }
    it.ck = this._decorate(it);
    this.icing = this.icing.filter(function (ic) { return ic && ic.host !== 'cookie'; });
    this.chips = []; this.sprinkles = this.sprinkles.filter(function (p) { return p.host !== 'cookie'; });
    this._startRackHop(it, true);
  };
  P._rackSlot = function () {
    var R = this.layout.rack, i = Math.min(this.rackCookies.length, R.slots.length - 1);
    return { i: i, x: R.slots[i].x, y: R.slots[i].y, size: R.size };
  };
  /** 2–3 ballistic hops: (crouch +) a hop in place, a big arc with one flip onto the rack slot, a little settle bounce. */
  P._startRackHop = function (it, inPlace) {
    this._hop = { it: it, stage: inPlace ? 0 : 2, t: 0, n: 0, x0: it.x, y0: it.y, s0: it.size };
    it.job = { kind: 'hop' }; it.state = 'hop'; it.hopSquash = true;
    this._mood('cheer', 1.4);
  };
  P._stepHop = function (h) {
    var cfg = this.cfg, Hp = this._hop;
    if (this._walk) { this._stepWalk(h); return; }
    if (!Hp) return;
    var it = Hp.it, sl = this._rackSlot(), u, k;
    Hp.t += h;
    switch (Hp.stage) {
      case 0:   // crouch: squash down before the jump
        k = smooth(Hp.t / cfg.hopCrouch); it.sx = 1 + 0.14 * k; it.sy = 1 - 0.18 * k; it.x = Hp.x0; it.y = Hp.y0 + 0.09 * it.size * k;
        if (Hp.t >= cfg.hopCrouch) { Hp.stage = 1; Hp.t = 0; Hp.n++; this._emit({ type: 'hop', n: Hp.n, x: it.x, y: it.y }); }
        break;
      case 1:   // hop in place (ballistic), stretch in the air, squash on landing
        u = clamp(Hp.t / cfg.hop1Time, 0, 1);
        it.x = Hp.x0; it.y = Hp.y0 - cfg.hop1H * 4 * u * (1 - u);
        k = Math.sin(Math.PI * u); it.sx = 1 - 0.06 * k; it.sy = 1 + 0.08 * k; it.rot = 0.06 * Math.sin(TAU * u);
        if (u >= 1) { Hp.stage = 2; Hp.t = 0; it.sq = 0; it.sqv = kickFor(0.16, cfg.squashOmega, cfg.squashZeta); this._emit({ type: 'land', what: 'hop', x: it.x, y: it.y }); Hp.x0 = it.x; Hp.y0 = it.y; Hp.s0 = it.size; Hp.wait = 0.08; }
        break;
      case 2:   // a short recovery, then the big arc with one flip onto the rack
        if (Hp.wait > 0) { Hp.wait -= h; it.sx = 1 + 0.6 * it.sq; it.sy = 1 - it.sq; if (Hp.wait <= 0) { Hp.t = 0; Hp.n++; this._emit({ type: 'hop', n: Hp.n, x: it.x, y: it.y, to: 'rack' }); } break; }
        if (Hp.t === h && Hp.n === 0) { Hp.n++; this._emit({ type: 'hop', n: Hp.n, x: it.x, y: it.y, to: 'rack' }); }
        u = clamp(Hp.t / cfg.hop2Time, 0, 1);
        it.x = lerp(Hp.x0, sl.x, u); it.y = arcY(ballistic(Hp.y0, sl.y, cfg.hop2Arc), Hp.y0, u);
        it.size = lerp(Hp.s0, sl.size, smooth(u));
        it.rot = (sl.x >= Hp.x0 ? 1 : -1) * TAU * smooth(u);
        k = Math.sin(Math.PI * u); it.sx = 1 - 0.05 * k; it.sy = 1 + 0.07 * k;
        if (u >= 1) this._hopLand(false);
        break;
    }
  };
  /** The cookie lands on its rack slot (snap = after a rotation: no settle bounce wait). */
  P._hopLand = function (snap) {
    var Hp = this._hop, cfg = this.cfg;
    if (!Hp) return;
    var it = Hp.it, sl = this._rackSlot();
    var rc = { ck: it.ck, icing: it.ck.icing || [], slot: sl.i, x: sl.x, y: sl.y, size: sl.size, sx: 1, sy: 1, sq: 0, sqv: kickFor(cfg.landSquash + 0.06, cfg.squashOmega, cfg.squashZeta),
      bounceT: snap ? 0 : cfg.settleTime, _px: sl.x, _py: sl.y, _psx: 1, _psy: 1, rot: 0 };
    this.rackCookies.push(rc);
    this.cookie = null; this._hop = null;
    this.cookies++;
    this.gallery.push({ ck: it.ck, topic: this.topic, round: this.round, stars: this._starsFor(this.misses) });
    this._emit({ type: 'rack', slot: sl.i, n: this.rackCookies.length, x: sl.x, y: sl.y });
    this._emit({ type: 'land', what: 'rack', x: sl.x, y: sl.y });
    this._hopEndT = snap ? 0 : cfg.settleTime + cfg.hopTail;
    if (this.state === 'round' && this.phase === 'hop' && snap) this._finishRound();
  };
  P._stepRack = function (h) {
    var cfg = this.cfg;
    for (var i = 0; i < this.rackCookies.length; i++) {
      var r = this.rackCookies[i], sl = this.layout.rack.slots[r.slot] || this.layout.rack.slots[0];
      spring(r, 'sq', 'sqv', 0, cfg.squashOmega, cfg.squashZeta, h);
      r.sx = 1 + 0.6 * r.sq; r.sy = 1 - r.sq;
      r.x = sl.x; r.size = this.layout.rack.size;
      if (r.bounceT > 0) {   // the little settle bounce
        r.bounceT = Math.max(0, r.bounceT - h);
        var u = 1 - r.bounceT / cfg.settleTime;
        r.y = sl.y - cfg.settleH * 4 * u * (1 - u);
      } else r.y = sl.y;
    }
    if (this.state === 'round' && this.phase === 'hop' && !this._hop && !this._walk && this._hopEndT !== undefined && this._hopEndT !== null) {
      this._hopEndT -= h;
      if (this._hopEndT <= 0) { this._hopEndT = null; this._finishRound(); }
    }
  };
  /** Animals: the animal cookie walks (waddle-hops) along the iced road to its home, a joy jump, then hops to the rack. */
  P._startWalk = function () {
    var cfg = this.cfg, it = this.cookie, road = this.path.strokes[0].pts, pts = [[it.px, it.py]].concat(road.map(function (q) { return q.slice(); }));
    var hm = this.home, end = road[road.length - 1];
    if (hm) pts.push([lerp(end[0], hm.px, 0.25), lerp(end[1], hm.py + 0.12 * hm.psize, 0.25)]);
    var cum = [0];
    for (var i = 1; i < pts.length; i++) cum.push(cum[i - 1] + hyp(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    var L = cum[cum.length - 1];
    this._walk = { pts: pts, cum: cum, len: L, T: clamp(L / cfg.walkSpeed, cfg.walkMin, cfg.walkMax), t: 0, stage: 'walk', size: it.psize * 0.8 };
    this.walker = { animal: it.ck.animal, ck: it.ck, x: it.px, y: it.py, rot: 0, size: this._walk.size, sx: 1, sy: 1, dir: 1, alpha: 1, _px: it.px, _py: it.py, _prot: 0 };
    it.alpha = 0;
    this._mood('cheer', 1.6);
    var sp = this.picToScreen(it.px, it.py);
    this._emit({ type: 'walk', animal: it.ck.animal, home: hm ? hm.home : null, x: sp.x, y: sp.y });
  };
  P._stepWalk = function (h) {
    var Wk = this._walk, cfg = this.cfg, w = this.walker, it = this.cookie, u, k;
    Wk.t += h;
    if (Wk.stage === 'walk') {
      u = clamp(Wk.t / Wk.T, 0, 1);
      var s = smooth(u) * 0.15 + u * 0.85, d = s * Wk.len, i = 1;
      while (i < Wk.cum.length - 1 && Wk.cum[i] < d) i++;
      var a = Wk.pts[i - 1], b = Wk.pts[i], seg = Wk.cum[i] - Wk.cum[i - 1] || 1, f = clamp((d - Wk.cum[i - 1]) / seg, 0, 1);
      var ph = (Wk.t % cfg.waddle) / cfg.waddle;   // waddle-hops: a little parabola each step, tilting side to side
      w.x = lerp(a[0], b[0], f); w.y = lerp(a[1], b[1], f) - 10 * 4 * ph * (1 - ph);
      w.rot = 0.13 * Math.sin(Math.PI * Wk.t / cfg.waddle);
      w.dir = b[0] >= a[0] ? 1 : -1;
      k = ph < 0.12 ? 1 - ph / 0.12 : 0; w.sx = 1 + 0.08 * k; w.sy = 1 - 0.1 * k;
      if (u >= 1) {
        Wk.stage = 'joy'; Wk.t = 0; w.rot = 0;
        var hm = this.home, hp = hm ? { x: hm.x, y: hm.y } : this.picToScreen(w.x, w.y);
        if (hm) { hm.wv += kickFor(6, cfg.choiceWobOmega, cfg.choiceWobZeta); hm.sparkle = 1; hm.sqv += kickFor(0.12, cfg.squashOmega, cfg.squashZeta); }
        this._emit({ type: 'home', animal: w.animal, home: hm ? hm.home : null, x: hp.x, y: hp.y });
        Wk.y0 = w.y;
      }
    } else if (Wk.stage === 'joy') {
      u = clamp(Wk.t / cfg.joyTime, 0, 1);
      w.y = Wk.y0 - cfg.joyH * 4 * u * (1 - u); k = Math.sin(Math.PI * u); w.sx = 1 - 0.06 * k; w.sy = 1 + 0.1 * k;
      if (u >= 1) {
        // the walker becomes the hopping cookie
        var sp = this.picToScreen(w.x, Wk.y0);
        it.alpha = 1; it.x = sp.x; it.y = sp.y; it.size = Wk.size * this.layout.tray.s; it.rot = 0;
        it.ck = this._decorate(it); it.ck.icing = []; it.ck.chips = []; it.ck.sprinkles = [];
        this.walker = null; this._walk = null;
        this._startRackHop(it, false);
      }
    }
  };
  P._finishRound = function () {
    if (this.state !== 'round') return;
    var st = this._starsFor(this.misses);
    this.roundStars = st; this.stars += st; this.levelStars += st;
    this._emit({ type: 'roundDone', round: this.round, stars: st, misses: this.misses });
    this._setState('roundDone'); this.phase = 'clear'; this.phaseTime = 0;
    if (this._press) this._endPress(true);
    this.hintHand = null;
  };
  /** Clear: the tray empties (icing road, home, sprinkles, side cookie fade), the choices are gone. */
  P._stepClear = function (h) {
    var k = Math.max(0, 1 - this.stateTime / this.cfg.clearTime), i;
    for (i = 0; i < this.icing.length; i++) this.icing[i].alpha = k;
    for (i = 0; i < this.sprinkles.length; i++) this.sprinkles[i].alpha = k;
    [this.home, this.side, this.cookie].forEach(function (it) { if (it) it.alpha = Math.min(it.alpha, k); });
    for (i = 0; i < this.choices.length; i++) this.choices[i].pop = Math.max(0, this.choices[i].pop - h / this.cfg.choiceOutTime);
    if (this.bird) this.bird = null;
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

  P._stepMochi = function (h) {
    var m = this.mochi, cfg = this.cfg, L = this.layout;
    m.x = L.mochi.x; m.y = L.mochi.y; m.h = L.mochi.h; m.w = L.mochi.w;
    if (m.moodT > 0) { m.moodT -= h; if (m.moodT <= 0) { m.moodT = 0; m.mood = 'idle'; } }
    m.blinkT -= h;
    if (m.blink && m.blinkT <= 0) { m.blink = false; m.blinkT = this._crng.float(cfg.blink[0], cfg.blink[1]); }
    else if (!m.blink && m.blinkT <= 0) { m.blink = true; m.blinkT = cfg.blinkTime; }
    var tx = L.tray.x + L.tray.w / 2;
    if (this.hintHand) tx = this.hintHand.x;
    else if (this.bird) tx = this.bird.x;
    else if (this.bag.state !== 'rest') tx = this.bag.x;
    else if (this.cookie && this.cookie.job) tx = this.cookie.x;
    m.lookX += (tx - m.lookX) * Math.min(1, h * cfg.lookRate);
    m.look = clamp((m.lookX - m.x) / 500, -1, 1);
  };

  World.tolOf = tolOf;
  IB.World = World;
})(window.IB = window.IB || {});
