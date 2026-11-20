/* Pip's Reef Tower — RT.CONFIG + RT.World (headless, deterministic shell-block stacking under water; DESIGN §2, §5.2)
 *
 * ============================== CONVENTIONS ==============================
 *  Units: logical px (short side 720), seconds, radians, y DOWN, rot > 0 clockwise. Screen space = world space (no camera).
 *  update(dt) runs fixed sub-steps of cfg.step (1/120 s); at the START of every sub-step pieces / flying tower blocks / the
 *  puffer store _px/_py/_prot, the tower stores _ptheta, the goal _pcrownY/_pcloudY. Render v = _v + (v − _v)·alpha.
 *
 *  BLOCK SIZE: layout.LW × layout.LH (= round(1.12·S) × round(0.80·S)); a small block is 0.72× both (piece.bw × piece.bh).
 *    RT.BlockArt.drawBlock(ctx, block, LW·scale, LH·scale, opt) is called with the FULL size — BlockArt shrinks 'small' itself.
 *  PIECE (a choice block): (x, y) = CENTRE; draw translate(x, y) · rotate(rot) · scale(sx, sy) · drawBlock(...) with
 *    globalAlpha = alpha. y already includes the bottom-anchored squash offset. glow 0..1 = hint halo.
 *    Draw order: w.drawOrder() (resting 2nd row → 1st row → hopping → the active piece on top, above the tower).
 *  TOWER: w.blockPose(i, alpha) → { x, y (centre), rot, sx, sy, alpha } of tower.blocks[i] (i = 0 bottom); draw like a
 *    piece. The stand's top centre is (tower.x, tower.baseTop). Block i is rotated θ·(i+1)/n (the tower bends).
 *  GOAL: w.cloudPose(alpha) → {x, y (= the jellyfish bell top, anchor (100, 30) of env/jelly_ride.svg), s, alpha, pulse} | null;
 *    w.crownPose(alpha) → {x, y (= crown bottom anchor (40, 86)), rot, sx, sy, alpha} | null. goal.pulse 0..1 (0.9 Hz bell pulse).
 *  PEARLS: w.pearlPose(j, alpha) → {x, y (pearl BASE = anchor (24, 46) of pearl.svg), rot, s (pop scale, overshoots), h, lit, out
 *    (floats up), alpha} for w.pearls[j]. Pearl i sits on the FRONT of block i (left part), so the count reads bottom → top.
 *  PIP: (x, y) = FEET, height layout.pip.h (art 300×400, feet (150, 392)).
 *  PUFFER: (puffer.x, puffer.y) = centre of puffer.svg (≈ 96×80); flip = travel / facing direction (+1 right, −1 left; the art
 *    faces LEFT, so mirror it when flip > 0); puff 0..1 → draw puffer_up.svg (puffed round) when puff ≥ 0.5; rot = loop spin.
 *  WATER: a sent piece is state 'lift' with piece.bubble 0..1 (the lift bubble), events 'bubblePop' + 'trail' (render bubbles).
 * ========================================================================
 */
(function (RT) {
  'use strict';

  var CONFIG = {
    // ---- timing / state machine (s)
    step: 1 / 120,             // fixed simulation sub-step (≤ 1/120 per DESIGN)
    maxFrame: 1.0,             // largest dt accepted per update() (speed mode passes big dt)
    roundsPerLevel: 4,         // towers per chapter
    chapterTimeLimit: 80,      // s since the chapter began: after ≥ chapterMinRounds towers go to Talk time once exceeded
    chapterMinRounds: 2,
    chapterBudget: 100,        // … and also when this chapter's pace (s per stacked block) says the next tower would end past 100 s
    introTime: 2.5,            // chapter banner + weather line (the 2.5 s weather crossfade)
    talkAfterAnswer: 1.6,
    levelDoneTime: 1.8,
    talkAskTime: 12,           // s without an answer → talkAsk (re-ask), repeating
    talkGlowAfterAsks: 2,

    // ---- layout (DESIGN §2; px)
    shortSide: 720, minLong: 960, maxLong: 1600, tallRatio: 1.6,
    groundLand: 28, groundPort: 40,
    blockS: { 3: 124, 4: 124, 5: 110, 6: 110, 7: 110 }, blockMin: 92,   // item scale S
    layerW: 1.12, layerH: 0.80,               // shell blocks: LW = round(1.12·S), LH = round(0.80·S) (age 4: 139 × 99)
    topRoomLand: 150, topRoomPort: 364,       // the tallest tower top stays this far below ins.top (tall portrait: bubble bottom 234 + 12 + goalH 110 + 8)
    wideRatio: 1.9, topRoomWide: 116,         // phone landscape (W/H > 1.9): less sky → S 110 at ages 5–7
    baseDyPortShort: 90, topRoomPortShort: 272, pipDyPortShort: 40,   // QA P3-9: iPad portrait feet 11 px over the tray → 41 px clearance   // short portraits (iPad): bubble on the HUD row; sky = bubble bottom 142 + 12 + 110 + 8
    towerFracLand: 0.40, towerMinLand: 400, towerFracPort: 0.58,   // 0.40 / 400: room for 2–3 wide blocks right of the drop zone (iPad 4:3)
    baseDyLand: 96, baseDyPort: 150, baseExtra: 60,   // the stand is ≈ 98 px tall at baseW 221 → it stands on the ground in landscape
    dropPad: 60, dropBelow: 10, dropCatch: 40,   // dropCatch: the RELEASE test reaches 40 px further to each side (QA P2-3: 78–88 % of side misses were within 40 px); the layout keeps dropPad
    goalGap: 8, goalH: 110, cloudLift: 18,    // crown bottom = goalY; the jellyfish bell top 18 px above it; crown + bell ≈ 110 px
    pipXLand: 120, pipHLand: 330, pipHSmall: 300, pipSmallW: 1100, pipXPort: 110, pipDyPort: 70, pipHPort: 300,
    pipHalfW: 0.38, pipPad: 20,             // Pip's hit box: feet x ± 0.38·h, h tall (+ 20 px)
    slotGap: 34, slotEdge: 20,   // slotGap ≥ 2·hitPadX + 2: neighbouring hit boxes never overlap (narrow shell blocks)
    slotDropGap: 44, slotLift: 6, slotLiftPort: 8, row2Gap: 40, slotMaxGap: 70,
    bubbleX: 24, bubbleYLand: 18, bubbleMaxW: 560, bubbleHLand: 122, bubbleYPort: 110, bubbleHPort: 124,
    hudW: 160, hudH: 96,
    hitPadX: 16, hitFrac: 0.6, hitPad: 14,    // piece hit box: |dx| ≤ LW/2 + 16, |dy| ≤ 0.6·S + 14; the nearest centre wins

    // ---- motion (physics) — under water
    g: 2600,                   // px/s² (legacy: nothing falls with it any more)
    gWater: 900, vTerm: 420,   // sinking: gravity minus buoyancy, quadratic drag k = gWater/vTerm² → terminal speed 420 px/s
    gHome: 1500,               // slower watery ballistic arcs: wrong bounce, drift home, out
    // tap to send: the piece is wrapped in a bubble and lifted on an ease-in-out arc to dropPoint, the bubble pops, it sinks
    sendTime: 0.55, sendApex: 0.5, sendApexPx: 30, sendRock: 0.06, bubbleIn: 0.1, trailEvery: 0.09,
    rockA: 0.12, rockHz: 1.3, rockNear: 1.2, sinkSway: 6, sinkSwayHz: 0.7,   // leaf-like rocking while sinking (fades within 1.2·LH of the top)
    dragOmega: 30, dragZeta: 0.8, dragLift: 1.08, liftOmega: 18, liftZeta: 0.6, grabClamp: 0.35,
    tiltK: 0.0007, tiltMax: 0.35, tiltOmega: 14, tiltZeta: 0.45,   // pendulum tilt while dragged (rad per px/s)
    tapMovePx: 24, tapTime: 0.35,
    stillMove: 10, stillTime: 6,
    fallKeepVx: 0.4, fallOmega: 10, fallZeta: 0.9, landWithin: 0.18, fallRotRate: 8, fallLift: 30,   // landWithin × LW
    landSquash: 0.18, squashOmega: 18, squashZeta: 0.35, belowSquash: 0.06,   // soft plonk: sy 0.82 → overshoot ≈ 1.055 → settles (≈ 0.5 s)
    swayK: 14, swayC: 1.9, swayMax: 0.12,                    // tower in water: θ'' = −k·θ − c·ω + torque (0.6 Hz, ζ 0.25)
    swayBase: 0.02, swayOffset: 0.03, swayImpact: 0.03, swayPeakMax: 0.07, centreRate: 0.6,   // centreRate × LW per s
    swayRoom: 0.1,             // landing / bounce / crown / blow kicks never push the rocking amplitude past 0.1 rad (a landing right after the gust)
    breezeTorque: 0.18, breezeHz: [0.3, 0.19], breezeMix: [0.75, 0.25], breezeTau: 1.2,   // setBreeze (sea current): |θ| from it ≤ ≈ 0.016 rad
    restitution: 0.45, bounceKick: 260, bounceSpin: 7, bounceSway: 0.025, bounceApex: 6,
    homeApex: 50, tapApex: 22,
    // QA P3-1: a wrong block drifts home through the water (Hermite curve from its bounce velocity to rest): peak ≈ homeDriftV,
    // stretched only as far as the time budget allows (home ≤ homeBy s after it was sent)
    homeDriftV: 420, homeBy: 2.4, homeDriftMin: 0.45, homeDriftRock: 0.06,
    dealStagger: 0.08, dealDelay: 0.35, dealSettle: 0.08, nextDealDelay: 0.15,
    // playtest P1-1 ask gate (ages ≤ askGateAges): the ask (question + tappable blocks) opens only once Pip is quiet
    // (world.speechBusy(), set by main), waiting at most askGateMax s; without the hook (headless, speed mode) no wait
    askGateMax: 2.5, askGateAges: 5,
    dealSink: 0.75, dealFrom: 300, dealRock: 0.14, dealSway: 10, dealFade: 0.25, dealSquash: 0.07,   // pieces drift down 300 px into their slots
    outTime: 0.35, outVx: [60, 140], outVy: -200, outBuoy: -300, tossApex: 1.2,   // out: the unchosen blocks float up and fade
    dropAbove: 1.5,            // dropPoint = 1.5·LH above the tower top
    bobAmp: 2, bobHz: 0.7, wiggleAmp: 0.07, wiggleHz: 2.2,
    // goal: the starfish crown riding a little jellyfish
    goalOmega: 7, goalZeta: 0.7, goalBob: 4, goalBobHz: 1.1, goalNear: 1.5, goalBump: 60, pulseHz: 0.9,   // swim-in spring (≈ 4 % overshoot), bob ± 4 px

    // ---- tower done → clear (DESIGN §5.2: ≈ 3.6 s for 4 blocks)
    crownAt: 0.15, crownHop: 160, crownG: 1400, crownSquash: 0.3, crownOmega: 22, crownZeta: 0.3, crownKick: 0.012,
    jellyAway: 1.0, jellyUp: 340,   // the jellyfish swims up 340 px and fades in 1 s after it drops the crown
    countAt: 0.65, countStep: 0.45,  // count i at countAt + (i − 1)·countStep (room for a spoken number)
    // the crown sits at +min(0.28·LW, LW/2 − 32) on the top block (its 64 px stay on the top). Visual P2-1: pearl i (art drawn
    // pearlH·LH = 79 px at age 4, ball 0.38·h ≈ 30 px ≈ 16 CSS px on iPhone portrait) hangs on block i's LEFT side, outside
    // the face (it never covers numerals / dots / pictures; the crown and the count numerals are on the right): the ball centre
    // pearlOut·ball-radius outside the left edge, at the block's mid-height (pearlBallY = the art's ball centre above its base, × h)
    crownOff: 0.28, crownHalfW: 32, pearlH: 0.80, pearlOut: 0.55, pearlBallY: 0.29, pearlBallR: 0.19, pearlMaxBh: 1.0, popOmega: 18, popZeta: 0.4, litDelay: 0.1, litTime: 0.2,
    blowAfter: 0.45, blowKick: 0.025, outAfter: 0.45, outTimeC: 0.4, sprinklesAfter: 0.3, roundDoneAfter: 0.4, doneMax: 7,
    clearStagger: 0.1, clearTime: 0.8, clearVy: -80, clearBuoy: 1100, clearVt: 700, clearFade: 0.3, clearDrift: [20, 60], clearAfter: 0.1,

    // ---- help
    hintAfterMisses: 2, hintCooldown: 6, wrongLock: 1.3, hintTime: 4, hintStroke: 0.9, hintBob: 28,   // the ghost hand TAPS the piece (0.9 s per tap)
    idleTime: 12, idleBackoff: 1.5, idleMax: 30, idleHintFrom: 1,   // QA P3-3: gaps 12, 18, 27, 30, 30 (skill rule: back-off to 30 s)
    graceAssist: true, freeSlipFrom: 3, softTapHint: 3, tapAssist: true,   // freeSlipFrom 3 (QA P3-1): towers of ≥ 3 blocks forgive one slip
    fadeWrongAfter: 3,         // QA P1-1: from the 3rd wrong drop on one ask the wrong blocks puff away (_out) — only the right one is left

    // ---- surprise round: one per chapter, the type rotates per chapter from a random start per session
    surpriseRound: 1,
    surpriseTypes: ['breeze', 'puffer'],
    gustAfter: 1.1, gustPeak: 0.1, gustDir: -1, holdDelay: 0.3, holdTime: 1.5, holdDamp: 3, holdStiff: 1.5, windDecay: 1.2,
    // playtest P1-2: the puffer stays when a block is sent (it leaves after pufferSit or when tapped) and arrives sooner
    pufferDelay: [0.3, 0.8], pufferIn: 1.2, pufferSit: 4, pufferOut: 1.2, pufferLoop: 1.4, pufferLoopR: 46, pufferR: 64,
    pufferPuffIn: 0.25, pufferSpin: [0.3, 1.05], pufferHoverDx: 0.5, pufferHoverPx: 44, pufferHoverDy: 56,   // hover right of the top

    // ---- Pip
    moodTime: { happy: 0.9, cheer: 1.6, oops: 0.8, think: 1.4, talk: 1.0, hold: 1.5, blow: 0.9 }, lookRate: 6, blink: [2.2, 5], blinkTime: 0.13
  };
  RT.CONFIG = CONFIG;

  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hyp(x, y) { return Math.sqrt(x * x + y * y); }
  function smooth(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  function lerp(a, b, u) { return a + (b - a) * u; }
  function merge(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; if (b) for (k in b) o[k] = b[k]; return o; }
  function sgn(v) { return v < 0 ? -1 : 1; }
  /** Initial velocity that makes a damped spring (from rest at 0) peak at `peak`. */
  function kickFor(peak, w, z) { var s = Math.sqrt(1 - z * z); return peak * w * Math.exp(z / s * Math.atan2(s, z)); }
  function keepBoxes(hk) {
    var a = Array.isArray(hk) ? hk : hk ? [hk] : [], out = [];
    for (var i = 0; i < a.length; i++) { var b = a[i]; if (b && b.w > 0 && b.h > 0) out.push({ x: +b.x, y: +b.y, w: +b.w, h: +b.h }); }
    return out;
  }
  /** Cubic Hermite drift A {x0, y0, vx0, vy0, x1, y1, T} at u = t/T (end velocity 0) → {x, y, vx, vy}. */
  function herm(A, u) {
    u = clamp(u, 0, 1);
    var u2 = u * u, u3 = u2 * u, T = A.T;
    var h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = 3 * u2 - 2 * u3;
    var d00 = 6 * u2 - 6 * u, d10 = 3 * u2 - 4 * u + 1, d01 = 6 * u - 6 * u2;
    return { x: h00 * A.x0 + h10 * T * A.vx0 + h01 * A.x1, y: h00 * A.y0 + h10 * T * A.vy0 + h01 * A.y1,
      vx: (d00 * A.x0 + d01 * A.x1) / T + d10 * A.vx0, vy: (d00 * A.y0 + d01 * A.y1) / T + d10 * A.vy0 };
  }
  function driftPeak(A) { var m = 0; for (var i = 0; i <= 24; i++) { var q = herm(A, i / 24); m = Math.max(m, hyp(q.vx, q.vy)); } return m; }
  function insOf(ins) {
    return { top: +(ins && ins.top) || 0, right: +(ins && ins.right) || 0, bottom: +(ins && ins.bottom) || 0, left: +(ins && ins.left) || 0 };
  }

  /** DESIGN §2 short-side rule: CSS viewport → logical W×H. */
  function logicalSize(cssW, cssH, cfg) {
    cfg = cfg || CONFIG;
    var S = cfg.shortSide, aspect = cssW / Math.max(1, cssH);
    if (cssW >= cssH) return { W: clamp(Math.round(S * aspect), cfg.minLong, cfg.maxLong), H: S };
    return { W: S, H: clamp(Math.round(S / aspect), cfg.minLong, cfg.maxLong) };
  }

  /** The largest S ≤ S0 (≥ blockMin) with rows·round(layerH·S) ≤ budget. */
  function fitS(S0, budget, rows, cfg) {
    var S = Math.max(cfg.blockMin, Math.floor(Math.min(S0, budget / (rows * cfg.layerH))));
    while (S > cfg.blockMin && rows * Math.round(cfg.layerH * S) > budget) S--;
    return S;
  }

  /** DESIGN §2 layout. maxN = the most blocks a tower of this age has (S is fixed for the session). */
  function computeLayout(W, H, ins, cfg, age, maxN) {
    ins = insOf(ins);
    var portrait = H > W, tall = H / W > cfg.tallRatio;
    var groundY = H - ins.bottom - (portrait ? cfg.groundPort : cfg.groundLand);
    var S0 = cfg.blockS[age] || cfg.blockS[5], S, baseTop, tx, LH;
    if (portrait) {
      tx = cfg.towerFracPort * W;
      var bdy = tall ? cfg.baseDyPort : cfg.baseDyPortShort, room = tall ? cfg.topRoomPort : cfg.topRoomPortShort;
      // the tray row (LH) below the stand + maxN blocks on it fit under the top room
      S = fitS(S0, groundY - bdy - ins.top - room, maxN + 1, cfg);
      LH = Math.round(cfg.layerH * S);
      baseTop = groundY - LH - bdy;
    } else {
      tx = Math.max(ins.left + cfg.towerFracLand * (W - ins.left - ins.right), ins.left + cfg.towerMinLand);
      var wide = W / H > cfg.wideRatio;
      baseTop = groundY - cfg.baseDyLand;
      S = fitS(S0, baseTop - ins.top - (wide ? cfg.topRoomWide : cfg.topRoomLand), maxN, cfg);
      LH = Math.round(cfg.layerH * S);
    }
    var LW = Math.round(cfg.layerW * S);
    var tower = { x: tx, baseTop: baseTop, baseW: LW + cfg.baseExtra };
    var drop = { x0: tx - (LW / 2 + cfg.dropPad), x1: tx + LW / 2 + cfg.dropPad, y1: baseTop + cfg.dropBelow };
    var pip = portrait
      ? { x: ins.left + cfg.pipXPort, y: baseTop + (tall ? cfg.pipDyPort : cfg.pipDyPortShort), h: cfg.pipHPort }
      : { x: ins.left + cfg.pipXLand, y: groundY - 4, h: W < cfg.pipSmallW ? cfg.pipHSmall : cfg.pipHLand };
    var bx = ins.left + cfg.bubbleX;
    var bubble = portrait
      ? (tall ? { x: bx, y: ins.top + cfg.bubbleYPort, w: W - bx - ins.right - cfg.bubbleX, h: cfg.bubbleHPort }
              : { x: bx, y: ins.top + cfg.bubbleYLand, w: W - ins.right - cfg.hudW - 14 - bx, h: cfg.bubbleHPort })
      : { x: bx, y: ins.top + cfg.bubbleYLand, w: landBubbleW(), h: cfg.bubbleHLand };
    bubble.w = Math.max(0, bubble.w);
    // landscape (visual QA P2-4): the bubble runs up to the goal box's left edge (starfish + jellyfish, ±90 px, as in the
    // layout test) instead of the drop zone's; when even the tallest tower's goal box (goalH) stays below the bubble band
    // it runs on over the tower, stopping short of the puffer's hover spot (right of the top) and of the HUD
    function landBubbleW() {
      var left = tx - 90 - 14 - bx;
      var goalTop = baseTop - maxN * Math.round(cfg.layerH * S) - cfg.goalGap - cfg.goalH;
      if (goalTop > ins.top + cfg.bubbleYLand + cfg.bubbleHLand + 16) {
        var right = Math.min(W - ins.right - cfg.hudW - 14, tx + cfg.pufferHoverDx * LW + cfg.pufferHoverPx - 84);
        return Math.min(Math.round(cfg.bubbleMaxW * 1.3), Math.max(left, right - bx));
      }
      return Math.min(cfg.bubbleMaxW, left);
    }
    var hud = { x: W - ins.right - cfg.hudW, y: 0, w: cfg.hudW + ins.right, h: ins.top + cfg.hudH };
    var L = {
      W: W, H: H, ins: ins, portrait: portrait, tall: tall, groundY: groundY, S: S, LW: LW, LH: LH, maxN: maxN, tower: tower, drop: drop,
      pearlH: Math.round(cfg.pearlH * LH), crownOff: Math.round(Math.min(cfg.crownOff * LW, LW / 2 - cfg.crownHalfW)),
      pip: pip, bubble: bubble, hud: hud, goalH: cfg.goalH,
      safe: { x: ins.left, y: ins.top, w: W - ins.left - ins.right, h: H - ins.top - ins.bottom }
    };
    L.lulu = pip;   // deprecated alias (Lulu's name)
    setGoalY(L, cfg, maxN);
    L.slots = slotsFor(L, cfg, 3);
    return L;
  }
  function goalYFor(L, cfg, n) { return L.tower.baseTop - n * L.LH - cfg.goalGap; }
  function setGoalY(L, cfg, n) { L.goalY = goalYFor(L, cfg, n); L.goal = { x: L.tower.x, y: L.goalY, cloudY: L.goalY - cfg.cloudLift }; }

  /** Pearl offsets for a tower of n full blocks → [x…] (offset from each block's centre) with .h (drawn pearl height), .y
   *  (the base offset below the block centre) and .r (the ball radius). Pearl j hangs on block j's LEFT side (visual P2-1):
   *  ball centre x = −bw/2 − pearlOut·r (just outside the face, so it never covers the block's numeral / dots / picture; the
   *  crown and the count numerals are on the right), ball centre y = the block's centre. */
  function pearlOffsets(n, LW, LH, cfg, bw, bh) {
    bw = bw || LW; bh = bh || LH;
    var h = Math.min(Math.round(cfg.pearlH * LH), Math.round(cfg.pearlMaxBh * bh)), r = cfg.pearlBallR * h, out = [];
    for (var j = 0; j < n; j++) out.push(-bw / 2 - cfg.pearlOut * r);
    out.h = h; out.y = cfg.pearlBallY * h; out.r = r;
    return out;
  }

  /** Resting centres of k choice blocks (full-size centres; a small block sits lower, bottom-aligned). */
  function slotsFor(L, cfg, k) {
    var LW = L.LW, LH = L.LH, ins = L.ins, out = [], a, b, yr;
    function row(m, y, r) {
      var gap = m > 1 ? Math.min(LW + cfg.slotMaxGap, (b - a) / (m - 1)) : 0, w = gap * (m - 1), c = (a + b) / 2;
      for (var j = 0; j < m; j++) out.push({ x: c - w / 2 + j * gap, y: y, row: r });
    }
    if (L.portrait) {   // one row across the width under the stand
      a = ins.left + LW / 2 + cfg.slotEdge; b = L.W - ins.right - LW / 2 - cfg.slotEdge;
      row(k, L.groundY - LH / 2 - cfg.slotLiftPort, 0);
      return out;
    }
    yr = L.groundY - LH / 2 - cfg.slotLift; a = L.drop.x1 + cfg.slotDropGap + LW / 2; b = L.W - ins.right - LW / 2 - cfg.slotEdge;
    var sp = LW + cfg.slotGap, fit = Math.max(1, Math.floor((b - a) / sp + 1e-9) + 1);
    if (k <= fit) row(k, yr, 0);
    else { row(fit, yr, 0); row(Math.min(fit, k - fit), yr - LH - cfg.row2Gap, 1); }
    return out;
  }

  // ------------------------------------------------------------------ World
  function World(opts) {
    opts = opts || {};
    this.cfg = merge(CONFIG, opts.config);
    this.seed = opts.seed !== undefined ? opts.seed : 1;
    this.rng = new RT.RNG(this.seed);
    this._crng = new RT.RNG((RT.RNG.hash(this.seed) ^ 0x51ed27) >>> 0);   // cosmetic randomness (spins, blinks, kicks)
    this.age = RT.Content.ageOf(opts.age !== undefined ? opts.age : 4);
    this.lang = opts.lang === 'vi' ? 'vi' : 'en';
    this._pendingAge = this.age; this._pendingLang = this.lang;
    this.state = 'menu'; this.phase = null;
    this.level = 0; this.levels = []; this.topic = null; this.weather = 0;
    this.round = 0; this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.stars = 0; this.levelStars = 0; this.roundStars = 0; this.towers = 0;
    this.ask = 0; this.asks = 0; this.misses = 0; this.assists = 0; this.askMisses = 0; this.streak = 0;
    this.time = 0; this.stateTime = 0; this.phaseTime = 0; this.alpha = 0; this._acc = 0;
    this.cur = null; this.pieces = []; this.talk = null; this.talkAnswered = null; this.wind = 0;
    this.breeze = 0; this._breezeIn = 0; this.blowT = 0;
    this.hudKeep = opts.hudKeep || null; this.lastTopics = null; this.surprise = null; this._surpriseOff = 0;
    this.tower = { x: 0, baseTop: 0, blocks: [], theta: 0, _ptheta: 0, omega: 0, n: 0 };
    this.goal = null; this.pearls = []; this.puffer = null; this.hintHand = null;
    this.pip = { x: 0, y: 0, mood: 'idle', moodT: 0, blinkT: 3, blink: false, look: 0, lookX: 0, lookY: 0 };
    this.events = []; this.sessions = 0; this._idN = 0;
    this._idleN = 0; this._idleT = 0; this._idleGap = this.cfg.idleTime; this._lastHintT = -1e9; this.levelStartTime = 0;
    this._talkAskT = 0; this._talkAsks = 0; this._lockUntil = -1; this._press = null; this._softN = 0;
    this._vp = null; this.tapMoveMin = 0;
    this.setViewport(opts.width || 1280, opts.height || 720, opts.ins || null);
  }
  World.logicalSize = logicalSize;
  World.computeLayout = function (W, H, ins, cfg, age) {
    var c = merge(CONFIG, cfg), a = RT.Content.ageOf(age || 4);
    return computeLayout(W, H, ins, c, a, RT.Content.maxBlocks(a));
  };
  World.slotsFor = slotsFor;
  World.pearlOffsets = function (n, L, cfg) { return pearlOffsets(n, L.LW, L.LH, merge(CONFIG, cfg)); };   // → [x…] with .h (pearl height px), .y, .r
  World.kickFor = kickFor;

  var P = World.prototype;
  Object.defineProperty(P, 'interactive', { get: function () { return this.state === 'round' && this.phase === 'ask'; } });
  Object.defineProperty(P, 'lulu', { get: function () { return this.pip; } });   // deprecated alias for older code
  P._emit = function (e) { this.events.push(e); };
  P.drainEvents = function () { var e = this.events; this.events = []; return e; };
  P.setAge = function (a) { this._pendingAge = RT.Content.ageOf(a); };
  P.setLang = function (l) { this._pendingLang = l === 'vi' ? 'vi' : 'en'; };
  /** Weather wind 0..1 (main passes weather.ambient.wind every frame): a gentle sinusoidal rocking of the tower (|θ| ≤ 0.02). */
  P.setBreeze = function (v) { this._breezeIn = clamp(+v || 0, 0, 1); };
  P.pieceById = function (id) { for (var i = 0; i < this.pieces.length; i++) if (this.pieces[i].id === id) return this.pieces[i]; return null; };
  P._setState = function (s) { this.state = s; this.stateTime = 0; };
  P._setPhase = function (p) { this.phase = p; this.phaseTime = 0; };
  P._mood = function (m, t) { this.pip.mood = m; this.pip.moodT = t || this.cfg.moodTime[m] || 1; };
  P.skipTalk = function () { if (this.state === 'talk') this._levelDone(); };
  P._askObj = function () { return this.cur && this.ask < this.cur.asks.length ? this.cur.asks[this.ask] : null; };
  P._rightPiece = function () {
    for (var i = 0; i < this.pieces.length; i++) { var p = this.pieces[i]; if (p.right && p.askIdx === this.ask && p.state !== 'out' && p.state !== 'gone') return p; }
    return null;
  };
  /** The current question {promptKey, params} (null before the first ask / outside a round). */
  P.prompt = function () {
    if (this.state !== 'round' || !this.cur || !this._asked || this.phase === 'done' || this._openAsk !== this.ask) return null;
    var a = this._askObj();
    return a ? { promptKey: a.promptKey, params: a.params } : null;
  };
  /** Id of the right piece of the current ask (null when no ask is open). */
  P.answerId = function () {
    if (this.state !== 'round' || !this._asked || (this.phase !== 'ask' && this.phase !== 'bounce' && this.phase !== 'drop')) return null;
    var p = this._rightPiece();
    return p ? p.id : null;
  };

  // ---------------------------------------------------------------- geometry
  P._hitHalf = function () { var L = this.layout, c = this.cfg; return { x: L.LW / 2 + c.hitPadX, y: c.hitFrac * L.S + c.hitPad }; };
  /** Hit box of a piece: {x, y (centre), w, h} logical px. */
  P.pieceHit = function (id) {
    var p = typeof id === 'object' ? id : this.pieceById(id);
    if (!p) return null;
    var h = this._hitHalf();
    return { x: p.x, y: p.y, w: 2 * h.x, h: 2 * h.y };
  };
  P._pipBox = function () { var Q = this.layout.pip, hw = this.cfg.pipHalfW * Q.h; return { l: Q.x - hw, t: Q.y - Q.h, r: Q.x + hw, b: Q.y }; };
  P.pipHit = function () { var b = this._pipBox(); return { x: (b.l + b.r) / 2, y: (b.t + b.b) / 2, w: b.r - b.l, h: b.b - b.t }; };
  P.luluHit = P.pipHit;   // deprecated alias
  /** Pip's lips in the blow frame (art (270, 140) of 300×400, feet (150, 392)). */
  P.pipMouth = function () { var Q = this.layout.pip, k = Q.h / 400; return { x: Q.x + 120 * k, y: Q.y - 252 * k }; };
  /** Top surface centre of the tower (stand top when empty) → {x, y, rot}. */
  P.towerTop = function (alpha) {
    var T = this.tower, live = this._liveCount();
    if (!live) return { x: T.x, y: T.baseTop, rot: 0 };
    var c = this._chain(alpha === undefined ? 1 : alpha), q = c[live - 1];
    return { x: q.tx, y: q.ty, rot: q.rot };
  };
  /** Logical point dropAbove·LH above the tower top (where a finger lets go of a block). */
  P.dropPoint = function () { var t = this.towerTop(); return { x: t.x, y: t.y - this.cfg.dropAbove * this.layout.LH }; };
  P._liveCount = function () { var b = this.tower.blocks, n = 0; while (n < b.length && !b[n].fly) n++; return n; };
  /** The bending chain of the stacked blocks: centre, rotation, top point of every non-flying block. */
  P._chain = function (alpha) {
    var T = this.tower, n = this._liveCount(), th = lerp(T._ptheta, T.theta, alpha), out = [];
    var ax = T.x, ay = T.baseTop;
    for (var i = 0; i < n; i++) {
      var b = T.blocks[i], r = th * (i + 1) / n, h = b.bh * b.sy, s = Math.sin(r), c = Math.cos(r);
      // centre = axis point + R(r)·(dx, −h/2); next axis point = axis + R(r)·(0, −h)
      var cx = ax + c * b.dx + s * h / 2, cy = ay + s * b.dx - c * h / 2;
      var nx = ax + s * h, ny = ay - c * h;
      out.push({ x: cx, y: cy, rot: r, tx: cx + s * h / 2, ty: cy - c * h / 2, h: h });
      ax = nx; ay = ny;
    }
    return out;
  };
  /** Pose of tower block i for render: {x, y (centre), rot, sx, sy, alpha}. */
  P.blockPose = function (i, alpha) {
    var b = this.tower.blocks[i];
    if (!b) return null;
    alpha = alpha === undefined ? this.alpha : alpha;
    if (b.fly) {
      var F = b.fly;
      return { x: lerp(F._px, F.x, alpha), y: lerp(F._py, F.y, alpha), rot: lerp(F._prot, F.rot, alpha), sx: 1, sy: 1, alpha: F.alpha };
    }
    var c = this._chain(alpha)[i];
    return { x: c.x, y: c.y, rot: c.rot, sx: b.sx, sy: b.sy, alpha: 1 };
  };
  /** A point (ox along the block, on its top surface − up) of the block that carries the crown → {x, y, rot, alpha}. */
  P._onTop = function (ox, up, alpha) {
    var G = this.goal, T = this.tower, i = -1, k;
    for (k = 0; k < T.blocks.length; k++) if (G && T.blocks[k].id === G.onId) i = k;
    if (i < 0) return null;
    var b = T.blocks[i], p = this.blockPose(i, alpha), h = b.fly ? b.bh : b.bh * b.sy, s = Math.sin(p.rot), c = Math.cos(p.rot);
    var dy = -(h / 2 + up);
    return { x: p.x + c * ox - s * dy, y: p.y + s * ox + c * dy, rot: p.rot, alpha: p.alpha };
  };
  /** A point (ox, oy) in the frame of the tower block with this id (origin = its centre, y down) → {x, y, rot, alpha} | null. */
  P._onBlock = function (id, ox, oy, alpha) {
    var T = this.tower, i;
    for (i = 0; i < T.blocks.length; i++) if (T.blocks[i].id === id) break;
    if (i >= T.blocks.length) return null;
    var b = T.blocks[i], p = this.blockPose(i, alpha), k = b.fly ? 1 : b.sy, s = Math.sin(p.rot), c = Math.cos(p.rot);
    return { x: p.x + c * ox - s * oy * k, y: p.y + s * ox + c * oy * k, rot: p.rot, alpha: p.alpha };
  };
  /** The jellyfish: {x, y (bell top anchor), s (scale), alpha, pulse 0..1} | null (gone once it swam away). */
  P.cloudPose = function (alpha) {
    var G = this.goal;
    if (!G || G.cloudA <= 0) return null;
    alpha = alpha === undefined ? this.alpha : alpha;
    return { x: G.x, y: lerp(G._pcloudY, G.cloudY, alpha), s: G.cloudS, alpha: G.cloudA, pulse: G.pulse };
  };
  P.jellyPose = P.cloudPose;
  /** The crown: {x, y (bottom anchor), rot, sx, sy, alpha} | null (null once its block has flown away). */
  P.crownPose = function (alpha) {
    var G = this.goal;
    if (!G) return null;
    alpha = alpha === undefined ? this.alpha : alpha;
    if (G.state === 'on') {
      var q = this._onTop(this.layout.crownOff, 0, alpha);
      if (!q) return null;
      return { x: q.x, y: q.y, rot: q.rot, sx: G.csx, sy: G.csy, alpha: q.alpha };
    }
    return { x: lerp(G._pcrownX, G.crownX, alpha), y: lerp(G._pcrownY, G.crownY, alpha), rot: 0, sx: G.csx, sy: G.csy, alpha: 1 };
  };
  /** Pearl j: {x, y (base), rot, s (pop scale), lit, out, alpha} | null. */
  P.pearlPose = function (j, alpha) {
    var C = this.pearls[j];
    if (!C || C.pop <= 0.001) return null;
    var q = this._onBlock(C.blockId, C.x, C.y, alpha === undefined ? this.alpha : alpha);
    if (!q) return null;
    return { x: q.x, y: q.y, rot: q.rot, s: C.pop, h: C.h, lit: C.lit, out: C.out, alpha: q.alpha };
  };
  /** Render order of the pieces: resting 2nd row, resting 1st row, moving, then the active (dragged / falling) one. */
  P.drawOrder = function () {
    return this.pieces.filter(function (p) { return p.state !== 'gone'; }).sort(function (a, b) { return a.z - b.z || a.slot - b.slot; });
  };
  /** Test hooks: the puffer's tap circle {x, y, r} / position {x, y}, or null. */
  P.pufferHit = function () { var B = this.puffer; return B && (B.state === 'in' || B.state === 'sit') ? { x: B.x, y: B.y, r: this.cfg.pufferR } : null; };
  P.pufferPos = function () { return this.puffer ? { x: this.puffer.x, y: this.puffer.y } : null; };

  /** What is under (x, y)? the puffer, the nearest resting piece, Pip (+ 20 px). */
  P._hit = function (x, y) {
    var Be = this.puffer, i;
    if (Be && (Be.state === 'in' || Be.state === 'sit') && hyp(x - Be.x, y - Be.y) <= this.cfg.pufferR) return 'puffer';
    var hh = this._hitHalf(), best = null, bd = 1e9;
    for (i = 0; i < this.pieces.length; i++) {
      var p = this.pieces[i];
      if (p.state !== 'rest' && p.state !== 'home' && p.state !== 'bounce' && p.state !== 'in') continue;
      if (Math.abs(x - p.x) > hh.x || Math.abs(y - p.y) > hh.y) continue;
      var d = hyp(x - p.x, y - p.y);
      if (d < bd) { bd = d; best = p; }
    }
    if (best) return best;
    var b = this._pipBox(), pad = this.cfg.pipPad;
    if (x >= b.l - pad && x <= b.r + pad && y >= b.t - pad && y <= b.b + pad) return 'pip';
    return null;
  };

  // ---------------------------------------------------------------- viewport
  P.setViewport = function (W, H, ins) {
    var key = W + 'x' + H + ':' + JSON.stringify(insOf(ins)) + ':' + this.age + ':' + JSON.stringify(this.hudKeep || null);
    if (key === this._vp) return;
    this._vp = key;
    var old = this.layout ? { LW: this.layout.LW } : null;
    this.layout = computeLayout(W, H, ins, this.cfg, this.age, RT.Content.maxBlocks(this.age));
    this.layout.hudKeep = keepBoxes(this.hudKeep);
    if (this.cur) setGoalY(this.layout, this.cfg, this.cur.n);
    this.pip.x = this.layout.pip.x; this.pip.y = this.layout.pip.y;
    this.tower.x = this.layout.tower.x; this.tower.baseTop = this.layout.tower.baseTop;
    if (old) this._snapAll(old.LW);
  };
  P._slots = function (k) { return slotsFor(this.layout, this.cfg, k); };
  P._sizeOf = function (o, block) {
    var L = this.layout, k = block.size === 'small' ? RT.Content.SMALL_SCALE : 1;
    o.bw = L.LW * k; o.bh = L.LH * k; o.side = o.bh;   // side: deprecated (= bh)
  };
  P._home = function (p) {
    var L = this.layout, s = this._slots(p.k)[p.slot] || { x: L.W / 2, y: L.groundY - L.LH / 2, row: 0 };
    this._sizeOf(p, p.block);
    p.homeX = s.x; p.homeY = s.y + (L.LH - p.bh) / 2; p.row = s.row;
  };
  /** Rotation / resize mid-round: cancel the drag, re-layout, finish running motions, snap everything. */
  P._snapAll = function (oldLW) {
    var self = this, L = this.layout, k = L.LW / (oldLW || L.LW);
    this._press = null;
    this.tower.blocks.forEach(function (b) { b.dx *= k; self._sizeOf(b, b.block); });
    var ps = this.pieces.slice();
    ps.forEach(function (p) {
      self._home(p);
      if (p.state === 'lift') { p.bubble = 0; p.lift = null; self._emit({ type: 'bubblePop', pieceId: p.id, x: p.x, y: p.y }); p.state = 'fall'; }
      if (p.state === 'fall') {
        if (p.right) { self._land(p, 0.3); return; }
        self._bounce(p, 0.3);
      }
      if (p.state === 'out') p.state = 'gone';
      if (p.state !== 'gone') self._rest(p, true);
      if (p.state === 'rest' && p._fadeOut) { p._fadeOut = false; p.state = 'gone'; }   // a fading wrong block just vanishes on a re-layout
    });
    this.pieces = this.pieces.filter(function (p) { return p.state !== 'gone'; });
    if (this.tower.blocks.some(function (b) { return b.fly; })) {
      this.tower.blocks = this.tower.blocks.filter(function (b) { return !b.fly; });
      if (this.goal && this.goal.state === 'on' && !this.tower.blocks.some(function (b) { return b.id === self.goal.onId; })) { this.goal = null; this.pearls = []; }
    }
    if (this.goal) this._placeGoal(true);
    this.puffer = null;
    if (this.hintHand) this._hintGeo();
    if (this.phase === 'bounce') this._setPhase('ask');
  };

  // ---------------------------------------------------------------- session flow
  P._newId = function (p) { return p + (this._idN++); };

  P.newSession = function (opts) {
    this.age = this._pendingAge; this.lang = this._pendingLang;
    this.sessions++;
    var L = this.layout;
    this._clearRound(); this.cur = null; this.state = 'menu';
    this._vp = null; this.layout = null;
    this.setViewport(L.W, L.H, L.ins);
    var last = (opts && opts.lastTopics) || this.lastTopics || null;
    this.levels = RT.Content.topicsFor(this.age, this.rng, last);
    this._surpriseOff = this.rng.int(0, Math.max(0, this.cfg.surpriseTypes.length - 1));
    this.stars = 0; this.towers = 0; this.cur = null;
    this.weather = 0;
    this._emit({ type: 'session', levels: this.levels.slice() });
    this.startLevel(0);
  };

  P._clearRound = function () {
    this.pieces = []; this.tower.blocks = []; this.tower.theta = this.tower._ptheta = this.tower.omega = 0;
    this.goal = null; this.pearls = []; this.puffer = null; this.hintHand = null; this._press = null; this.wind = 0; this.blowT = 0;
  };

  P.startLevel = function (i) {
    if (!this.levels.length) this.levels = RT.Content.topicsFor(this.age);
    this.level = clamp(i | 0, 0, this.levels.length - 1);
    this.topic = this.levels[this.level];
    this.weather = this.level % 4;   // 0 sunny, 1 breezy, 2 rain, 3 rainbow
    this.round = 0; this.levelStars = 0; this.levelStartTime = this.time; this._chapBlocks = 0;
    this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.cur = null; this.talk = null; this.talkAnswered = null; this.surprise = null; this._lastAskOf = null; this._asked = false;
    this._clearRound();
    this._setState('intro'); this.phase = null;
    this._mood('idle', 0.01);
    this._emit({ type: 'level', level: this.level, topic: this.topic, weather: this.weather });
  };

  P._beginRound = function () {
    var cfg = this.cfg;
    var rr = new RT.RNG((this.rng.next() * 4294967296) >>> 0);
    // the chapter's surprise: the puffer at tower surpriseRound; the breeze at the first tower from there with ≥ 3 blocks (it needs a 3rd
    // block after the gust — age 4's tower 2 has 2 blocks since QA P2-4)
    var ST = cfg.surpriseTypes, type = ST && ST.length ? ST[(this.level + this._surpriseOff) % ST.length] : null, at = cfg.surpriseRound;
    if (type === 'breeze' && !cfg.blocksByRound) while (at < 3 && RT.Content.blocksFor(this.topic, this.age, at) < 3) at++;
    var sp = type && this.round === at ? type : null;
    this.cur = RT.Content.makeRound(this.topic, { age: this.age, lang: this.lang, rng: rr, roundIndex: this.round, surprise: sp,
      avoid: this._lastAskOf || null, blocks: cfg.blocksByRound ? cfg.blocksByRound[this.round] : undefined });
    if (sp === 'breeze' && this.cur.n < 3) sp = 'puffer';   // the breeze needs a 3rd block after the gust
    if (sp === 'puffer' && this.cur.n < 2) sp = null;
    this.cur.surprise = sp;
    this._lastAskOf = this.cur.asks[this.cur.asks.length - 1];
    this.surprise = sp;
    this.ask = 0; this.asks = this.cur.n; this.misses = 0; this.assists = 0; this.askMisses = 0; this.streak = 0; this._asked = false; this._openAsk = -1;
    this._gustAt = -1; this._gustDone = false; this._holdAt = -1; this._beeAt = -1; this._beeDone = false; this._done = null; this._clearT = 0;
    this._clearRound();
    this.tower.n = this.cur.n;
    setGoalY(this.layout, cfg, this.cur.n);
    this.goal = { x: 0, y: 0, cloudY: 0, _pcloudY: 0, state: 'float', bob: 0, pulse: 0, dy: 0, vy: 0, crownX: 0, _pcrownX: 0, crownY: 0, _pcrownY: 0,
      cvy: 0, csx: 1, csy: 1, _cq: 0, _cqv: 0, cloudA: 1, cloudS: 1, swimY: 0, onId: null, _puffT: -1 };
    this._placeGoal(false);
    this._setState('round'); this._setPhase('deal');
    this._dealAt = this.time + cfg.dealDelay;
    this._mood('happy', 1.0);
    this._emit({ type: 'round', round: this.round, topic: this.topic, n: this.cur.n, asks: this.asks, surprise: sp });
  };

  /** Goal position for the current layout (snap: no float-in; a dropping crown lands at once). */
  P._placeGoal = function (snap) {
    var G = this.goal, L = this.layout, cfg = this.cfg;
    setGoalY(L, cfg, this.cur ? this.cur.n : L.maxN);
    G.x = L.tower.x; G.y = L.goalY;
    if (snap) {
      G.dy = 0; G.vy = 0;
      if (G.state === 'drop') this._crownOn(false);
      if (G._puffT >= 0) G.cloudA = 0;
    } else { G.dy = -(L.goalY + 140); G.vy = 0; }
    this._goalPose();
    G._pcloudY = G.cloudY; G._pcrownY = G.crownY; G._pcrownX = G.crownX;
  };
  P._goalPose = function () {
    var G = this.goal, cfg = this.cfg;
    G.bob = cfg.goalBob * Math.sin(TAU * cfg.goalBobHz * this.time);
    G.pulse = 0.5 - 0.5 * Math.cos(TAU * cfg.pulseHz * (G._puffT >= 0 ? 2 : 1) * this.time);   // the bell pulses faster while it swims away
    G.cloudY = G.y - cfg.cloudLift + G.dy + G.bob + (G.swimY || 0);
    if (G.state === 'float') { G.crownX = G.x; G.crownY = G.y + G.dy + G.bob; }
    else if (G.state === 'on') { var q = this._onTop(this.layout.crownOff, 0, 1); if (q) { G.crownX = q.x; G.crownY = q.y; } }
  };

  P._deal = function () {
    var cfg = this.cfg, self = this, a = this._askObj(), k = a.choices.length, ids = [];
    a.choices.forEach(function (b, i) {
      var p = { id: self._newId('b'), block: b, askIdx: self.ask, choice: i, right: i === a.answer, slot: i, k: k,
        homeX: 0, homeY: 0, row: 0, bw: 0, bh: 0, side: 0, x: 0, y: 0, _px: 0, _py: 0, vx: 0, vy: 0, rot: 0, _prot: 0, rv: 0,
        sx: 1, sy: 1, _q: 0, _qv: 0, scale: 1, _sv: 0, alpha: 1, state: 'in', glow: 0, _glowT: 0, t: 0, z: 2,
        delay: i * cfg.dealStagger, bounces: 0, arc: null, bubble: 0 };
      self._home(p);
      p._fy = p.homeY - cfg.dealFrom; p._ph = self._crng.float(0, TAU);   // drifts down dealFrom px into its slot (fading in)
      p.x = p._px = p.homeX; p.y = p._py = p._fy; p.alpha = 0;
      p.rot = p._prot = 0;
      self.pieces.push(p); ids.push(p.id);
    });
    this._gateT = 0;
    this._emit({ type: 'deal', ask: this.ask, n: k, pieces: ids });
  };
  /** Playtest P1-1 ask gate: true while the dealt ask should keep waiting for Pip to finish speaking (ages ≤ askGateAges,
   *  at most askGateMax s). `world.speechBusy` is an optional hook main sets (() => the voice is speaking or has a line queued);
   *  without it (headless tests, sims, speed mode) the gate never waits, so the world stays deterministic. */
  P._askGated = function () {
    var cfg = this.cfg, f = this.speechBusy;
    if (typeof f !== 'function' || !(cfg.askGateMax > 0) || this.age > cfg.askGateAges || this._gateT >= cfg.askGateMax) return false;
    try { return !!f(); } catch (e) { return false; }
  };

  P._startAsk = function () {
    var a = this._askObj(), r = this._rightPiece();
    this._setPhase('ask');
    this._asked = true; this._openAsk = this.ask;
    this.askMisses = 0; this._lockUntil = -1; this._softN = 0;
    this._idleT = 0; this._idleGap = this.cfg.idleTime; this._idleN = 0;
    this._emit({ type: 'ask', ask: this.ask, asks: this.asks, promptKey: a.promptKey, params: a.params, answerId: r ? r.id : null,
      nameKind: a.nameKind, nameValue: a.nameValue, first: this.ask === 0, waited: this._gateT || 0 });
    if (this.surprise === 'puffer' && !this._beeDone && this._beeAt < 0 && this.ask >= 1) {
      this._beeAt = this.time + this.rng.float(this.cfg.pufferDelay[0], this.cfg.pufferDelay[1]);
    }
  };

  P._startTalk = function () {
    var rr = new RT.RNG((this.rng.next() * 4294967296) >>> 0);
    this.talk = RT.Content.makeTalk(this.topic, { age: this.age, lang: this.lang, rng: rr });
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

  // ---------------------------------------------------------------- input (SCREEN logical px; ONE active pointer)
  P._tapMove = function () { return Math.max(this.cfg.tapMovePx, +this.tapMoveMin || 0); };
  P._locked = function () { return this.time < this._lockUntil; };
  P._touch = function () { this._idleT = 0; this._idleGap = this.cfg.idleTime; };
  /** → piece id | 'locked' | 'pip' | 'puffer' | null */
  P.pointerDown = function (x, y) {
    if (this._press && this._press.kind === 'piece') this.cancelDrag();
    this._press = null;
    if (this.state !== 'round') return null;
    var hit = this._hit(x, y);
    if (hit === 'puffer') {
      var Be = this.puffer;
      Be.state = 'loop'; Be.t = 0; Be.tapped = true; Be.lx = Be.x; Be.ly = Be.y; Be.flip = Be.flip || -1;
      this._emit({ type: 'pufferTap', x: Be.x, y: Be.y });
      return 'puffer';
    }
    if (hit === 'pip') {
      if (!this.prompt()) return null;
      this._press = { kind: 'pip', x0: x, y0: y, t0: this.time, moved: false, maxD: 0, fx: x, fy: y };
      return 'pip';
    }
    if (!hit) {   // plaza / sky / the tower: a soft tap (and, once the block was hinted, a tap on the tower stacks it)
      if (this.phase === 'ask' && this._openAsk === this.ask) this._press = { kind: 'grass', x0: x, y0: y, t0: this.time, moved: false, maxD: 0, fx: x, fy: y };
      return null;
    }
    var p = hit;
    var free = p.state === 'rest' || (p.state === 'home' && !p._wrong);
    if (this.phase !== 'ask' || !free || this._locked()) {
      if (p.askIdx === this.ask && (this.phase === 'ask' || this.phase === 'bounce')) { this._emit({ type: 'locked', pieceId: p.id }); return 'locked'; }
      return null;
    }
    var L = this.layout, cx = this.cfg.grabClamp * L.LW, cy = this.cfg.grabClamp * L.LH;
    p.state = 'drag'; p.z = 4; p.vx = 0; p.vy = 0; p.arc = null;
    this._press = { kind: 'piece', id: p.id, x0: x, y0: y, t0: this.time, moved: false, maxD: 0,
      ox: clamp(x - p.x, -cx, cx), oy: clamp(y - p.y, -cy, cy), fx: x, fy: y, grabbed: false, sx: x, sy: y, st: this.time };
    this.pip.lookX = p.x;
    return p.id;
  };
  P.pointerMove = function (x, y) {
    var d = this._press;
    if (!d) return;
    d.fx = x; d.fy = y;
    var m = hyp(x - d.x0, y - d.y0);
    if (m > d.maxD) d.maxD = m;
    if (m >= this._tapMove()) d.moved = true;
    if (d.kind === 'piece' && hyp(x - d.sx, y - d.sy) >= this.cfg.stillMove) { d.sx = x; d.sy = y; d.st = this.time; }
    if (d.kind === 'piece') this._confirmGrab(d);
  };
  /** A press on a piece becomes a real grab once it moved ≥ 24 px or lasted ≥ 0.35 s → event 'grab' (resets the idle help). */
  P._confirmGrab = function (d) {
    if (d.grabbed || !(d.moved || this.time - d.t0 >= this.cfg.tapTime)) return;
    var p = this.pieceById(d.id);
    if (!p) return;
    d.grabbed = true;
    this._touch();
    if (p.right && this.hintHand) this.hintHand = null;
    this._emit({ type: 'grab', pieceId: p.id, nameKind: p.block.nameKind, nameValue: p.block.nameValue, block: p.block, right: p.right, x: p.x, y: p.y });
  };
  /** → 'tap' | 'drop' | 'miss' | 'pokePip' | null */
  P.pointerUp = function (x, y) {
    var d = this._press;
    this._press = null;
    if (!d) return null;
    if (x === undefined) { x = d.fx; y = d.fy; }
    var m = Math.max(d.maxD, hyp(x - d.x0, y - d.y0)), tap = !d.moved && m < this._tapMove() && this.time - d.t0 < this.cfg.tapTime;
    if (d.kind === 'grass') {
      if (!tap || this.phase !== 'ask') return null;
      var R = this._rightPiece(), D0 = this.layout.drop;
      if (this.cfg.tapAssist && R && R._hinted && R.state === 'rest' && x >= D0.x0 && x <= D0.x1 && y < this.layout.groundY) {
        this._touch();
        this._send(R, true);
        this._emit({ type: 'drop', pieceId: R.id, x: R.x, y: R.y, right: true, assisted: true, via: 'tower' });
        return 'drop';
      }
      this._softTap();
      return null;
    }
    if (d.kind === 'pip') {
      if (!tap || this.state !== 'round') return null;
      var a = this.prompt();
      if (!a) return null;
      this._mood('talk', 1.0);
      this._emit({ type: 'pokePip', promptKey: a.promptKey, params: a.params });
      this._softTap();
      return 'pokePip';
    }
    var p = this.pieceById(d.id);
    if (!p || p.state !== 'drag') return null;
    if (tap) {
      // TAP TO SEND (DESIGN §5.2): a tap on a block is an ANSWER — the block rides a bubble up over the tower and sinks onto it
      // (a wrong one bonks off and drifts home: a miss for the hint logic, gentle feedback). Not an assist.
      if (this.phase !== 'ask' || this._openAsk !== this.ask) { this._arcHome(p, this.cfg.tapApex); return 'tap'; }
      this._touch();
      if (p.right && this.hintHand) this.hintHand = null;
      this._emit({ type: 'tapPiece', pieceId: p.id, nameKind: p.block.nameKind, nameValue: p.block.nameValue, block: p.block, x: p.x, y: p.y,
        right: p.right, assist: false, send: true });
      var sx = p.x, sy = p.y;
      this._send(p, false);
      this._emit({ type: 'drop', pieceId: p.id, x: sx, y: sy, right: p.right, via: 'tap' });
      return 'drop';
    }
    this._confirmGrab(d);
    var D = this.layout.drop, hx = d.fx - d.ox, hy = d.fy - d.oy, c = this.cfg.dropCatch || 0, X0 = D.x0 - c, X1 = D.x1 + c;
    if ((p.x >= X0 && p.x <= X1 && p.y < D.y1) || (hx >= X0 && hx <= X1 && hy < D.y1)) {
      this._startFall(p);
      this._emit({ type: 'drop', pieceId: p.id, x: p.x, y: p.y, right: p.right });
      return 'drop';
    }
    if (this.cfg.graceAssist && p.right && p._hinted) {
      this._touch();
      this._send(p, true);
      this._emit({ type: 'drop', pieceId: p.id, x: p.x, y: p.y, right: true, assisted: true, via: 'grace' });
      return 'drop';
    }
    this._arcHome(p, this.cfg.homeApex);
    this._emit({ type: 'miss', pieceId: p.id, x: p.x, y: p.y });
    this._softTap();
    return 'miss';
  };
  /** The finger left (touchcancel / pause): the dragged piece flies home, no event. */
  P.cancelDrag = function () {
    var d = this._press;
    this._press = null;
    if (d && d.kind === 'piece') { var p = this.pieceById(d.id); if (p && p.state === 'drag') this._arcHome(p, this.cfg.homeApex); }
  };

  // ---------------------------------------------------------------- piece motion
  P._arcHome = function (p, apexAbove) {
    var g = this.cfg.gHome, apexY = Math.min(p.y, p.homeY) - apexAbove;
    var t1 = Math.sqrt(2 * Math.max(0, p.y - apexY) / g), t2 = Math.sqrt(2 * Math.max(0, p.homeY - apexY) / g);
    p.arc = { x0: p.x, y0: p.y, x1: p.homeX, y1: p.homeY, t1: t1, T: Math.max(0.05, t1 + t2), t: 0, rot0: p.rot };
    p.state = 'home'; p.z = 3;
  };
  /** QA P3-1: a bonked (wrong) block drifts home through the water instead of a fast ballistic drop: a cubic Hermite curve
   *  from its bounce velocity to rest in its slot. T is chosen so the peak speed is ≈ homeDriftV (the sinking terminal speed),
   *  but never longer than the time left until homeBy s after it was sent (then it moves a little faster). */
  P._driftHome = function (p) {
    var cfg = this.cfg, vC = cfg.homeDriftV, D = hyp(p.homeX - p.x, p.homeY - p.y);
    var left = Math.max(cfg.homeDriftMin, cfg.homeBy - (this.time - (p._sentAt !== undefined ? p._sentAt : this.time)));
    var A = { drift: true, x0: p.x, y0: p.y, x1: p.homeX, y1: p.homeY, vx0: p.vx, vy0: p.vy, T: 1, t: 0, t1: 0, rot0: p.rot };
    var T = clamp(1.5 * D / vC, cfg.homeDriftMin, left), k;
    for (k = 0; k < 12; k++) {   // stretch T until the sampled peak speed is ≤ vC (or the budget is used up)
      A.T = T;
      if (driftPeak(A) <= vC * 1.02 || T >= left) break;
      T = Math.min(left, T * 1.1);
    }
    A.T = T;
    p.arc = A; p.state = 'home'; p.z = 3;
  };
  P._rest = function (p, snap) {
    p.state = 'rest'; p.arc = null; p.vx = p.vy = 0; p.z = p.row ? 0 : 1;
    if (snap) { p.x = p._px = p.homeX; p.y = p._py = p.homeY; p.rot = p._prot = 0; p.rv = 0; p.scale = 1; p._sv = 0; p._q = p._qv = 0; p.sx = p.sy = 1; p.alpha = 1; }
  };
  P._softTap = function () {
    if (this.phase !== 'ask') return;
    var n = ++this._softN, k = this.cfg.softTapHint;
    if (n === k) this._doHint(false); else if (n > k && n % k === 0) this._autoHint(false);
  };
  P._beeAway = function () { var B = this.puffer; if (B && (B.state === 'in' || B.state === 'sit')) { B.state = 'away'; B.t = 0; this._beeAwayGeo(B); } };
  /** Legacy name (assisted stack): now the bubble lift. */
  P._toss = function (p) { this._send(p, true); };
  /** Tap to send (also every assisted stack and a release below the tower top): the piece is wrapped in a bubble (p.bubble
   *  0 → 1 in bubbleIn s) and flies on an ease-in-out Bézier arc (sendTime s; control point 2.5·(sendApex·LH + sendApexPx) above
   *  the drop point, so the block passes over it) to dropPoint() — tracked live, so a swaying tower is followed — where the bubble pops ('bubblePop') and it sinks. */
  P._send = function (p, assisted) {
    var cfg = this.cfg;
    if (assisted) this.assists++;
    if (this._press && this._press.id === p.id) this._press = null;
    p.state = 'lift'; p.z = 4; p.arc = null; p.vx = p.vy = 0; p.rv = 0; p.t = 0; p._trailT = 0; p.bubble = 0; p._fadeOut = p._fadeOut || false;
    p.lift = { x0: p.x, y0: p.y, t: 0, T: cfg.sendTime, apex: cfg.sendApex * this.layout.LH + cfg.sendApexPx, rot0: p.rot };
    p._sentAt = this.time;
    this._setPhase('drop');   // (playtest P1-2: the puffer stays — it leaves after pufferSit or when tapped)
  };
  P._startFall = function (p) {
    var cfg = this.cfg, top = this.towerTop(), LW = this.layout.LW;
    if (p.y + p.bh / 2 > top.y - 4) { this._send(p, false); return; }   // let go beside / below the top: a bubble carries it up
    if (p.state !== 'lift') p._sentAt = this.time;   // a dragged release: the home budget (homeBy) counts from here
    p.state = 'fall'; p.z = 4; p.ft = 0; p._rot0 = p.rot; p._trailT = p._trailT || 0;
    p.vx *= cfg.fallKeepVx;
    p.vy = p.vy > 0 ? p.vy : p.vy * 0.3;
    p.fallOff = clamp(p.x - top.x, -(cfg.landWithin * LW - cfg.sinkSway), cfg.landWithin * LW - cfg.sinkSway);
    p.rv = 0;
    this._setPhase('drop');
  };
  P._trail = function (p, h) {
    p._trailT = (p._trailT || 0) + h;
    if (p._trailT >= this.cfg.trailEvery) { p._trailT -= this.cfg.trailEvery; this._emit({ type: 'trail', pieceId: p.id, x: p.x, y: p.y + p.bh / 2 }); }
  };

  P._stepPiece = function (p, h) {
    var cfg = this.cfg, g = cfg.gHome, w, z, ax;
    p.t += h;
    var liftT = 1;
    switch (p.state) {
      case 'in': {   // drifts down dealFrom px through the water (decelerating), fading in, rocking a little; a soft settle
        if (p.t < p.delay) { p.alpha = 0; break; }
        var ti = p.t - p.delay, ui = clamp(ti / cfg.dealSink, 0, 1), ei = 1 - Math.pow(1 - ui, 2.2);
        var yi = p._fy + (p.homeY - p._fy) * ei;
        p.vy = (yi - p.y) / h;
        p.y = yi; p.x = p.homeX + cfg.dealSway * Math.sin(TAU * 0.8 * ti + p._ph) * (1 - ei);
        p.alpha = clamp(ti / cfg.dealFade, 0, 1);
        p.rot = cfg.dealRock * Math.sin(TAU * 1.1 * ti + p._ph) * (1 - ei);
        if (ui >= 1) { p.y = p.homeY; p.x = p.homeX; p.rot = 0; p._q = cfg.dealSquash; p._qv = 0; this._rest(p, false); }
        break;
      }
      case 'rest': {
        var bob = cfg.bobAmp * Math.sin(TAU * cfg.bobHz * (this.time + p.slot * 0.37));
        p.x = p.homeX; p.y = p.homeY - Math.max(0, bob) - p.glow * 6 * (0.5 + 0.5 * Math.sin(TAU * 1.6 * this.time));
        var wig = p.glow * cfg.wiggleAmp * Math.sin(TAU * cfg.wiggleHz * this.time);
        p.rv += (cfg.tiltOmega * cfg.tiltOmega * (wig - p.rot) - 2 * 0.7 * cfg.tiltOmega * p.rv) * h; p.rot += p.rv * h;
        break;
      }
      case 'drag': {
        var d = this._press;
        if (d && d.id === p.id) {
          var tx = d.fx - d.ox, ty = d.fy - d.oy;
          w = cfg.dragOmega; z = cfg.dragZeta;
          p.vx += (w * w * (tx - p.x) - 2 * z * w * p.vx) * h; p.vy += (w * w * (ty - p.y) - 2 * z * w * p.vy) * h;
          p.x += p.vx * h; p.y += p.vy * h;
          if (!d.grabbed) this._confirmGrab(d);
        }
        var tr = clamp(p.vx * cfg.tiltK, -cfg.tiltMax, cfg.tiltMax);
        p.rv += (cfg.tiltOmega * cfg.tiltOmega * (tr - p.rot) - 2 * cfg.tiltZeta * cfg.tiltOmega * p.rv) * h; p.rot += p.rv * h;
        p.rot = clamp(p.rot, -cfg.tiltMax, cfg.tiltMax);
        liftT = cfg.dragLift;
        break;
      }
      case 'lift': {   // wrapped in a bubble, on an ease-in-out arc to the drop point (tracked live), then the bubble pops
        var Lf = p.lift, dpl = this.dropPoint();
        Lf.t += h;
        var ul = clamp(Lf.t / Lf.T, 0, 1), el = smooth(ul), ox = p.x, oy = p.y;
        // quadratic Bézier: start → control (70 % of the way across, 2.5·apex above the drop point) → drop point: the block
        // rises, passes OVER the drop point and comes down onto it (the control point stays below the top inset: on screen)
        var cxl = Lf.x0 + 0.7 * (dpl.x - Lf.x0), cyl = Math.max(Math.min(Lf.y0, dpl.y) - 2.5 * Lf.apex, Math.min(dpl.y, this.layout.ins.top + p.bh / 2 + 8)), m0 = (1 - el) * (1 - el), m1 = 2 * el * (1 - el), m2 = el * el;
        p.x = m0 * Lf.x0 + m1 * cxl + m2 * dpl.x;
        p.y = m0 * Lf.y0 + m1 * cyl + m2 * dpl.y;
        p.vx = (p.x - ox) / h; p.vy = (p.y - oy) / h;
        p.rot = Lf.rot0 * (1 - el) + cfg.sendRock * Math.sin(TAU * 1.4 * Lf.t) * Math.sin(Math.PI * ul);
        p.bubble = clamp(Lf.t / cfg.bubbleIn, 0, 1);
        liftT = cfg.dragLift;
        this._trail(p, h);
        if (ul >= 1) {
          p.x = dpl.x; p.y = dpl.y; p.bubble = 0; p.lift = null; p.vx = 0; p.vy = 0;
          this._emit({ type: 'bubblePop', pieceId: p.id, x: p.x, y: p.y });
          this._startFall(p);
        }
        break;
      }
      case 'fall': {   // sinking: gWater with quadratic drag (terminal vTerm), steered onto the top, rocking like a leaf
        var top = this.towerTop(), LHf = this.layout.LH;
        p.ft += h;
        var gap = top.y - (p.y + p.bh / 2), near = smooth(clamp(gap / (cfg.rockNear * LHf), 0, 1));
        var txf = top.x + p.fallOff + cfg.sinkSway * Math.sin(TAU * cfg.sinkSwayHz * p.ft) * near;
        w = cfg.fallOmega; z = cfg.fallZeta;
        var kd = cfg.gWater / (cfg.vTerm * cfg.vTerm);
        p.vy += (cfg.gWater - kd * p.vy * Math.abs(p.vy)) * h;
        ax = w * w * (txf - p.x) - 2 * z * w * p.vx;
        p.vx += ax * h;
        p.x += p.vx * h; p.y += p.vy * h;
        p.rot = p._rot0 * Math.exp(-cfg.fallRotRate * p.ft) + cfg.rockA * near * Math.sin(TAU * cfg.rockHz * p.ft); p.rv = 0;
        this._trail(p, h);
        if (p.vy > 0 && p.y + p.bh / 2 >= top.y) {
          p.y = top.y - p.bh / 2;
          var imp = clamp(p.vy / cfg.vTerm, 0, 1);
          if (p.right) this._land(p, imp);
          else this._bounce(p, imp);
        }
        break;
      }
      case 'bounce': {
        p.vy += cfg.gHome * h; p.x += p.vx * h; p.y += p.vy * h; p.rot += p.rv * h;
        if (p.vy >= 0) this._driftHome(p);
        break;
      }
      case 'home': {
        var A = p.arc;
        A.t += h;
        var tt = Math.min(A.t, A.T);
        if (A.drift) {   // QA P3-1: a watery drift (cubic Hermite: bounce velocity → rest), rocking a little
          var hp = herm(A, tt / A.T);
          p.x = hp.x; p.y = hp.y; p.vx = hp.vx; p.vy = hp.vy;
          p.rot = A.rot0 * (1 - smooth(tt / A.T)) + cfg.homeDriftRock * Math.sin(TAU * cfg.rockHz * tt) * Math.sin(Math.PI * tt / A.T); p.rv = 0;
        } else {
          p.x = A.x0 + (A.x1 - A.x0) * tt / A.T;
          p.y = A.y0 - g * A.t1 * tt + 0.5 * g * tt * tt;
          p.vy = -g * A.t1 + g * tt; p.vx = (A.x1 - A.x0) / A.T;
          p.rot = A.rot0 * (1 - smooth(tt / A.T)); p.rv = 0;
        }
        if (A.t >= A.T) {
          p.x = A.x1; p.y = A.y1;
          p._q = cfg.landSquash * clamp(p.vy / 1400, 0.25, 1); p._qv = 0;
          this._rest(p, false); p.rot = 0;
          p._wrong = false;
          if (p._fadeOut && this.state === 'round') { p._fadeOut = false; this._out(p); }
          if (this.phase === 'bounce' && !this.pieces.some(function (q) { return q.state === 'bounce' || (q.state === 'home' && q._wrong); })) this._setPhase('ask');
        }
        break;
      }
      case 'out': {   // the unchosen blocks float up and fade (buoyant)
        p.vy += cfg.outBuoy * h; p.x += p.vx * h; p.y += p.vy * h; p.rot += p.rv * h;
        p.alpha = clamp(1 - p.t / cfg.outTime, 0, 1);
        liftT = 0.8;
        if (p.t >= cfg.outTime) p.state = 'gone';
        break;
      }
    }
    // squash & stretch (landing 1 − q → jelly overshoot → 1) and the lift scale
    p._qv += (-cfg.squashOmega * cfg.squashOmega * p._q - 2 * cfg.squashZeta * cfg.squashOmega * p._qv) * h; p._q += p._qv * h;
    p.sy = 1 - p._q; p.sx = 1 + 0.5 * p._q;
    if (p.state === 'rest' || p.state === 'in' || p.state === 'home') p.y += p.bh * p._q / 2;   // squash about the bottom
    p._sv += (cfg.liftOmega * cfg.liftOmega * (liftT - p.scale) - 2 * cfg.liftZeta * cfg.liftOmega * p._sv) * h; p.scale += p._sv * h;
    if (p._glowT > 0) p._glowT = Math.max(0, p._glowT - h);
    var gT = p._glowT > 0 ? 1 : 0;
    p.glow += (gT - p.glow) * Math.min(1, h * (gT ? 6 : 3));
  };

  /** The right block lands on the tower top: joins the stack, jelly squash, the tower sways. */
  P._land = function (p, impact) {
    var cfg = this.cfg, T = this.tower, L = this.layout, LW = L.LW, live = this._liveCount();
    var top = this.towerTop(), a = this._askObj();
    var off = clamp(p.x - top.x, -cfg.landWithin * LW, cfg.landWithin * LW);
    var dx0 = live ? T.blocks[live - 1].dx : 0;
    var nb = { id: p.id, block: p.block, dx: dx0 + off, bw: p.bw, bh: p.bh, side: p.bh, sy: 1 - cfg.landSquash, sx: 1 + 0.5 * cfg.landSquash,
      _q: cfg.landSquash, _qv: 0, glow: 0, _glowT: 0, counted: false, fly: null };
    // the soft sponge below compresses a little (falloff with depth)
    for (var i = live - 1, dep = 0; i >= 0 && dep < 4; i--, dep++) T.blocks[i]._q += cfg.belowSquash * (1 - 0.25 * dep) * (0.5 + 0.5 * impact);
    T.blocks.splice(live, 0, nb);
    var n = live + 1;
    var dir = Math.abs(off) > 0.02 * LW ? sgn(off) : (this._crng.chance(0.5) ? 1 : -1);
    var peak = Math.min(cfg.swayPeakMax, (cfg.swayBase + cfg.swayOffset * Math.abs(off) / (cfg.landWithin * LW) + cfg.swayImpact * impact) * (0.8 + 0.1 * n));
    this._swayKick(dir * peak, true);
    // the jellyfish bumps up a little when the tower gets close
    var G = this.goal;
    if (G && G.state === 'float') {
      var gap = (top.y - p.bh) - G.y;
      if (gap < cfg.goalNear * L.LH) G.vy -= cfg.goalBump * (1 - Math.max(0, gap) / (cfg.goalNear * L.LH)) + 10;
    }
    p.state = 'gone';
    this._chapBlocks++;
    var pose = this.blockPose(n - 1, 1);
    this.streak = 0;
    this._mood('happy');
    this.hintHand = null;
    this._emit({ type: 'land', pieceId: p.id, n: n, impact: impact, x: pose.x, y: pose.y + p.bh / 2, right: true, sand: true });
    this._emit({ type: 'stack', n: n, nameKind: p.block.nameKind, nameValue: p.block.nameValue, block: p.block, ask: this.ask, asks: this.asks,
      promptKey: a.promptKey, params: a.params, topic: this.topic, x: pose.x, y: pose.y });
    var self = this;
    this.pieces.forEach(function (q) { if (q !== p && q.state !== 'gone' && q.state !== 'out') self._out(q); });
    if (this.surprise === 'breeze' && n === 2 && !this._gustDone) this._gustAt = this.time + cfg.gustAfter;
    if (n >= this.cur.n) { this.ask++; this._startDone(); return; }
    this.ask++;
    this._setPhase('deal');
    this._dealAt = this.time + cfg.nextDealDelay;
  };
  P._out = function (q) {
    var cfg = this.cfg, L = this.layout, dir = q.homeX >= L.tower.x ? 1 : -1;
    if (q === this.pieceById(this._press && this._press.id)) this._press = null;
    q.state = 'out'; q.t = 0; q.z = 2; q.arc = null;
    q.vx = dir * this._crng.float(cfg.outVx[0], cfg.outVx[1]); q.vy = cfg.outVy; q.rv = dir * this._crng.float(2, 5);
  };
  /** A wrong block bounces off the top (restitution, sideways kick towards its home side, spin) and flies home. */
  P._bounce = function (p, impact) {
    var cfg = this.cfg, a = this._askObj(), top = this.towerTop(), R = this._rightPiece();
    var dir = p.homeX >= top.x ? 1 : -1;
    p.state = 'bounce'; p.z = 4; p._wrong = true;
    p.vy = -Math.abs(p.vy) * cfg.restitution;
    p.vx = dir * cfg.bounceKick; p.rv = dir * cfg.bounceSpin;
    p._q = cfg.landSquash * 0.7; p._qv = 0;
    this._swayKick(-dir * cfg.bounceSway * (0.5 + impact), true);
    var T = this.tower, live = this._liveCount();
    if (live) T.blocks[live - 1]._q += cfg.belowSquash * 0.6;
    this.misses++; this.askMisses++; this.streak++;
    this._lockUntil = this.time + cfg.wrongLock;
    this._mood('oops');
    var want = { kind: a.nameKind, value: a.nameValue };
    if (R) { want.block = R.block; ['color', 'shape', 'animal', 'size', 'n', 'text'].forEach(function (k) { if (R.block[k] !== undefined) want[k] = R.block[k]; }); }
    this._setPhase('bounce');
    this._emit({ type: 'wrong', pieceId: p.id, nameKind: p.block.nameKind, nameValue: p.block.nameValue, block: p.block, want: want,
      streak: this.streak, misses: this.askMisses, x: p.x, y: p.y + p.bh / 2, promptKey: a.promptKey, params: a.params });
    if (this.askMisses === cfg.hintAfterMisses) this._doHint(false);
    else if (this.askMisses > cfg.hintAfterMisses) this._autoHint();
    if (cfg.fadeWrongAfter && this.askMisses >= cfg.fadeWrongAfter) this._fadeWrong(p);
  };
  /** Errorless fade: the wrong blocks of this ask puff away (the bouncing one when it is home) — only the right one stays. */
  P._fadeWrong = function (bouncing) {
    var self = this, ids = [];
    this.pieces.forEach(function (q) {
      if (q.right || q.askIdx !== self.ask || q.state === 'out' || q.state === 'gone') return;
      if (q === bouncing || q.state !== 'rest') q._fadeOut = true; else self._out(q);
      ids.push(q.id);
    });
    if (!this._fadedAsk || this._fadedAsk !== this.ask + ':' + this.round) {
      this._fadedAsk = this.ask + ':' + this.round;
      this._emit({ type: 'fadeWrong', ask: this.ask, pieces: ids });
    }
  };
  /** limit: shrink the kick so the rocking amplitude (θ, ω/ω₀) + peak stays ≤ swayRoom (the gust itself is not limited). */
  P._swayKick = function (peak, limit) {
    var cfg = this.cfg, T = this.tower, w = Math.sqrt(cfg.swayK), z = cfg.swayC / (2 * w);
    if (limit) { var A = hyp(T.theta, T.omega / w); peak = sgn(peak) * Math.min(Math.abs(peak), Math.max(0.004, cfg.swayRoom - A)); }
    T.omega += kickFor(peak, w, z);
  };

  // ---------------------------------------------------------------- help
  P.resetNudges = function () {
    this._idleT = 0; this._idleGap = this.cfg.idleTime; this._idleN = 0;
    this._talkAskT = 0; this._talkAsks = 0;
    if (this.talk) this.talk.glowAnswer = false;
  };
  P._autoHint = function (fromIdle) {
    if (this.time - this._lastHintT < this.cfg.hintCooldown) return null;
    return this._doHint(!!fromIdle);
  };
  P._hintGeo = function () {
    var H = this.hintHand, p = this.pieceById(H.pieceId);
    if (!p) { this.hintHand = null; return; }
    var dp = this.dropPoint();
    H.fromX = p.homeX; H.fromY = p.homeY; H.toX = dp.x; H.toY = dp.y;
  };
  P._doHint = function (fromIdle) {
    var p = this._rightPiece();
    if (!p) return null;
    p._glowT = this.cfg.hintTime; p._hinted = true;
    this._lastHintT = this.time;
    this._mood('think');
    this.hintHand = { pieceId: p.id, fromX: 0, fromY: 0, toX: 0, toY: 0, t: 0, x: p.homeX, y: p.homeY, alpha: 0, T: this.cfg.hintTime, time: 0,
      tap: true, lift: 1, press: false };
    this._hintGeo();
    var ev = { type: 'hint', pieceId: p.id, x: p.homeX, y: p.homeY };
    if (fromIdle) ev.idle = true;
    this._emit(ev);
    return p.id;
  };
  /** Manual hint (tap on the bubble): the right piece glows + the ghost hand (no event while it already glows). */
  P.hint = function () {
    if (this.state !== 'round' || this.phase !== 'ask') return null;
    var p = this._rightPiece();
    if (!p) return null;
    if (p._glowT > 0) return p.id;
    return this._doHint(false);
  };
  P._stepHint = function (h) {
    var H = this.hintHand;
    if (!H) return;
    H.time += h;
    if (H.time >= H.T || this.phase === 'done') { this.hintHand = null; return; }
    this._hintGeo();
    if (!this.hintHand) return;
    // TAP hint: the hand bobs on the right piece — down (0–0.3), presses (0.3–0.5), lifts (0.5–1) every hintStroke s.
    // fromX/fromY (the slot) and toX/toY (the drop point) are kept as data (where the tap sends it).
    var cfg = this.cfg, p = this.pieceById(H.pieceId), st = cfg.hintStroke, u = (H.time % st) / st;
    var lift = u < 0.3 ? 1 - smooth(u / 0.3) : u < 0.5 ? 0 : smooth((u - 0.5) / 0.5);
    H.t = u; H.tap = true; H.lift = lift; H.press = u >= 0.3 && u < 0.5;
    H.x = p.x + 0.12 * this.layout.LW; H.y = p.y + 0.08 * this.layout.LH - lift * cfg.hintBob;
    H.alpha = Math.min(1, H.time / 0.2, Math.max(0, (H.T - H.time) / 0.3));
  };

  // ---------------------------------------------------------------- tower done: crown → count + pearls → blow → sprinkles → clear
  P._starsFor = function (m) {
    var free = this.cur && this.cur.n >= this.cfg.freeSlipFrom ? 1 : 0;
    return m <= free ? 3 : m <= free + 1 ? 2 : 1;
  };
  P._startDone = function () {
    var cfg = this.cfg, n = this._liveCount(), L = this.layout, T = this.tower;
    this._setPhase('done');
    this.hintHand = null;
    this._done = { crown: false, counted: 0, blowAt: -1, outAt: -1, sprAt: -1, rdAt: -1, blow: false, out: false, spr: false, roundDone: false };
    this.pearls = [];
    for (var j = 0; j < n; j++) {
      var bj = T.blocks[j], xs = pearlOffsets(1, L.LW, L.LH, cfg, bj.bw, bj.bh);
      this.pearls.push({ i: j + 1, blockId: bj.id, x: xs[0], y: xs.y, h: xs.h, pop: 0, _pv: 0, _popAt: -1, lit: 0, out: 0 });
    }
    this.pearlH = this.pearls.length ? this.pearls[0].h : L.pearlH;
    if (this.goal) this.goal.onId = this.tower.blocks[n - 1].id;
    this._mood('cheer', 3);
    this.towers++;
    this._emit({ type: 'towerDone', n: n });
  };
  P._stepDone = function (h) {
    var cfg = this.cfg, D = this._done, T = this.tower, n = this._liveCount(), t = this.phaseTime, G = this.goal, i;
    if (!D.crown && t >= cfg.crownAt) {
      D.crown = true;
      if (G && G.state === 'float') {   // the starfish drops off the jellyfish onto the top; the jellyfish swims up and away
        G.state = 'drop'; G._puffT = 0; G.cvy = -cfg.crownHop; G.dy = 0; G.vy = 0;
        this._emit({ type: 'crown', x: G.crownX, y: G.crownY });
      }
    }
    while (D.counted < n && t >= cfg.countAt + cfg.countStep * D.counted) {
      i = D.counted++;
      var b = T.blocks[i], pose = this.blockPose(i, 1), C = this.pearls[i];
      b._glowT = 0.6; b.counted = true;
      if (C) { C._popAt = this.time; C._pv = 0; }
      var cp = C ? this._onBlock(C.blockId, C.x, C.y, 1) : null;
      this._emit({ type: 'count', i: i + 1, n: n, x: pose.x, y: pose.y, cx: cp ? cp.x : pose.x, cy: cp ? cp.y : pose.y });
      if (D.counted >= n) D.blowAt = t + cfg.blowAfter;
    }
    if (!D.blow && D.blowAt >= 0 && t >= D.blowAt) {
      D.blow = true; D.outAt = t + cfg.outAfter;
      this._mood('blow');
      this.blowT = 1;
      this._swayKick(cfg.blowKick, true);   // the breath gust: the tower jiggles towards the right
      var top = this.towerTop(), mo = this.pipMouth();
      this._emit({ type: 'blow', x: mo.x, y: mo.y, tx: top.x, ty: top.y });
    }
    if (!D.out && D.outAt >= 0 && t >= D.outAt) {
      D.out = true; D.sprAt = t + cfg.sprinklesAfter;
      this.pearls.forEach(function (c) { c._outOn = true; });
      var tp = this.towerTop();
      this._emit({ type: 'pearlsOut', n: this.pearls.length, x: tp.x, y: tp.y });
    }
    if (!D.spr && D.sprAt >= 0 && t >= D.sprAt) {
      D.spr = true; D.rdAt = t + cfg.roundDoneAfter;
      this._mood('cheer', 1.6);
      var ts = this.towerTop();
      this._emit({ type: 'sprinkles', x: ts.x, y: ts.y });
    }
    if ((!D.roundDone && D.rdAt >= 0 && t >= D.rdAt) || t >= cfg.doneMax) {
      if (!D.roundDone) {
        D.roundDone = true;
        var m = this.misses + this.assists, st = this._starsFor(m);   // an assisted stack counts like a miss
        this.roundStars = st; this.stars += st; this.levelStars += st;
        this._emit({ type: 'roundDone', round: this.round, stars: st, misses: this.misses, assists: this.assists });
      }
      this._startClear();
    }
  };
  P._crownOn = function (kick) {
    var G = this.goal, cfg = this.cfg, live = this._liveCount();
    if (!G) return;
    G.state = 'on'; G.cvy = 0;
    if (!G.onId && live) G.onId = this.tower.blocks[live - 1].id;
    G._cq = cfg.crownSquash; G._cqv = 0;
    this._goalPose();
    if (kick) {
      this._swayKick((this._crng.chance(0.5) ? 1 : -1) * cfg.crownKick, true);
      if (live) this.tower.blocks[live - 1]._q += 0.06;
    }
    this._emit({ type: 'crownOn', x: G.crownX, y: G.crownY });
  };
  P._stepPearls = function (h) {
    var cfg = this.cfg, w = cfg.popOmega, z = cfg.popZeta, now = this.time;
    for (var j = 0; j < this.pearls.length; j++) {
      var C = this.pearls[j];
      if (C._popAt < 0) continue;
      // pop: a spring from 0 to 1 with an overshoot (≈ 1.25) — the pearl springs up out of its shell
      C._pv += (w * w * (1 - C.pop) - 2 * z * w * C._pv) * h; C.pop = Math.max(0, C.pop + C._pv * h);
      var lt = now - C._popAt - cfg.litDelay;
      C.lit = clamp(lt / cfg.litTime, 0, 1) * (1 - C.out);
      if (C._outOn) C.out = Math.min(1, C.out + h / cfg.outTimeC);
    }
    if (this.blowT > 0) this.blowT = Math.max(0, this.blowT - h / 0.9);
  };
  P._startClear = function () {
    this._setState('roundDone'); this.phase = 'clear'; this.phaseTime = 0;
    var cfg = this.cfg, T = this.tower, n = this._liveCount();
    T.blocks.forEach(function (b, i) { b._clearAt = (n - 1 - i) * cfg.clearStagger; });
    this.pieces.forEach(function (p) { if (p.state !== 'gone') p.state = 'gone'; });
    if (this.goal && this.goal.state === 'drop') this._crownOn(false);   // (doneMax safety)
    this.pearls.forEach(function (c) { if (c._popAt < 0) { c._popAt = 0; c.pop = 1; } c._outOn = true; });
    this._mood('happy', 1.0);
  };
  P._stepClear = function (h) {
    var cfg = this.cfg, T = this.tower, L = this.layout, g = cfg.g, self = this, live = this._liveCount();
    for (var i = live - 1; i >= 0; i--) {
      var b = T.blocks[i];
      if (i !== live - 1 || this.phaseTime < b._clearAt) break;
      var pose = this.blockPose(i, 1);
      var dr = (i % 2 ? 1 : -1) * this._crng.float(cfg.clearDrift[0], cfg.clearDrift[1]);
      b.fly = { x: pose.x, y: pose.y, _px: pose.x, _py: pose.y, rot: pose.rot, _prot: pose.rot, vx: dr, vy: cfg.clearVy, rv: 0, alpha: 1, t: 0,
        bubble: 1, _ph: this._crng.float(0, TAU), _x0: pose.x, _rot0: pose.rot };   // floats up and away in a bubble
      this._emit({ type: 'clearBlock', i: i + 1, x: pose.x, y: pose.y });
      live--;
    }
    var kc = cfg.clearBuoy / (cfg.clearVt * cfg.clearVt);
    T.blocks.forEach(function (b) {
      var F = b.fly; if (!F) return;
      F.t += h; F.vy += (-cfg.clearBuoy + kc * F.vy * Math.abs(F.vy)) * h;   // buoyant rise with water drag (terminal clearVt)
      F.x += (F.vx + 18 * Math.cos(TAU * 0.9 * F.t + F._ph)) * h; F.y += F.vy * h;
      F.rot = F._rot0 * Math.exp(-4 * F.t) + 0.08 * Math.sin(TAU * 1.1 * F.t + F._ph);
      F.alpha = clamp(1 - (F.t - (cfg.clearTime - cfg.clearFade)) / cfg.clearFade, 0, 1);
    });
    T.blocks = T.blocks.filter(function (b) { return !b.fly || b.fly.t < cfg.clearTime; });
    var G = this.goal;
    if (G && G.onId && !T.blocks.some(function (b) { return b.id === G.onId; })) this.goal = null;   // the crown left with the top block
    if (this.pearls.length) this.pearls = this.pearls.filter(function (c) { return T.blocks.some(function (b) { return b.id === c.blockId; }); });
    if (!T.blocks.length) { this._clearT += h; if (this._clearT >= cfg.clearAfter) self._nextRound(); }
  };
  P._nextRound = function () {
    var cfg = this.cfg;
    this._clearRound();
    this.round++;
    var el = this.time - this.levelStartTime, nNext = this.round < this.roundsPerLevel ? RT.Content.blocksFor(this.topic, this.age, this.round) : 0;
    var pace = this._chapBlocks ? (el - cfg.introTime) / this._chapBlocks : 0;
    var long = this.round >= cfg.chapterMinRounds && (el > cfg.chapterTimeLimit || el + pace * nNext > cfg.chapterBudget);
    if (this.round < this.roundsPerLevel && !long) this._beginRound();
    else { if (this.round < this.roundsPerLevel) this.roundsPerLevel = this.round; this._startTalk(); }
  };

  // ---------------------------------------------------------------- tower / goal / surprises
  P._stepTower = function (h) {
    var cfg = this.cfg, T = this.tower, LW = this.layout.LW, hold = this.pip.mood === 'hold';
    var k = cfg.swayK * (hold ? cfg.holdStiff : 1), c = cfg.swayC * (hold ? cfg.holdDamp : 1);
    // weather breeze: smoothed input, a gentle sinusoidal torque (two slow tones, far below the 0.81 Hz sway resonance)
    this.breeze += (this._breezeIn - this.breeze) * Math.min(1, h / cfg.breezeTau);
    var tq = 0;
    if (this.breeze > 1e-4) {
      var Hz = cfg.breezeHz, Mx = cfg.breezeMix;
      tq = cfg.breezeTorque * this.breeze * (Mx[0] * Math.sin(TAU * Hz[0] * this.time) + Mx[1] * Math.sin(TAU * Hz[1] * this.time + 1));
    }
    T.omega += (-k * T.theta - c * T.omega + tq) * h; T.theta += T.omega * h;
    if (Math.abs(T.theta) > cfg.swayMax) { T.theta = sgn(T.theta) * cfg.swayMax; if (T.omega * T.theta > 0) T.omega *= -0.3; }
    var rate = cfg.centreRate * LW * h;
    for (var i = 0; i < T.blocks.length; i++) {
      var b = T.blocks[i];
      if (b.fly) continue;
      var stp = Math.min(rate, Math.max(rate * 0.25, Math.abs(b.dx) * 4 * h));
      b.dx -= sgn(b.dx) * Math.min(Math.abs(b.dx), stp);
      b._qv += (-cfg.squashOmega * cfg.squashOmega * b._q - 2 * cfg.squashZeta * cfg.squashOmega * b._qv) * h; b._q += b._qv * h;
      b.sy = 1 - b._q; b.sx = 1 + 0.5 * b._q;
      if (b._glowT > 0) { b._glowT = Math.max(0, b._glowT - h); b.glow = Math.min(1, b.glow + h * 10); }
      else b.glow = Math.max(b.counted ? 0.3 : 0, b.glow - h * 2.5);
    }
  };
  P._stepGoal = function (h) {
    var G = this.goal, cfg = this.cfg;
    if (!G) return;
    // float-in / bump spring of the jellyfish (+ crown while it sits on it)
    var w = cfg.goalOmega, z = cfg.goalZeta;
    G.vy += (-w * w * G.dy - 2 * z * w * G.vy) * h; G.dy += G.vy * h;
    if (G._puffT >= 0) {   // the jellyfish swims up (accelerating pulses) and fades
      G._puffT += h; var u = clamp(G._puffT / cfg.jellyAway, 0, 1);
      G.swimY = -cfg.jellyUp * (0.25 * u + 0.75 * u * u); G.cloudA = 1 - smooth(clamp((u - 0.3) / 0.7, 0, 1)); G.cloudS = 1;
    }
    if (G.state === 'drop') {   // the crown: a small hop, slow watery sinking, a magnet in x onto the top
      var top = this._onTop(this.layout.crownOff, 0, 1) || this.towerTop();   // a little hop sideways to its place on the top
      G.cvy += cfg.crownG * h; G.crownY += G.cvy * h;
      G.crownX += (top.x - G.crownX) * Math.min(1, 12 * h);
      if (G.cvy > 0 && G.crownY >= top.y) { G.crownY = top.y; this._crownOn(true); }
    }
    G._cqv += (-cfg.crownOmega * cfg.crownOmega * G._cq - 2 * cfg.crownZeta * cfg.crownOmega * G._cqv) * h; G._cq += G._cqv * h;
    G.csy = 1 - G._cq; G.csx = 1 + 0.5 * G._cq;
    this._goalPose();
  };
  /** The puffer surprise: swims in from the right, hovers beside the tower top (follows the sway), swims out right.
   *  Tap (in / sit) → 'loop': it puffs up round (puff 0 → 1 in pufferPuffIn s), spins one loop (rot 0 → 2π) on a circle of
   *  pufferLoopR px, deflates (the last 0.35 s) and zooms off to the right ('away'). */
  P._pufferHover = function () {
    var cfg = this.cfg, L = this.layout, top = this.towerTop();
    var x = top.x + Math.sin(top.rot) * 8 + cfg.pufferHoverDx * L.LW + cfg.pufferHoverPx, y = top.y - cfg.pufferHoverDy;
    return { x: Math.min(x, L.W - L.ins.right - 60), y: Math.max(y, L.ins.top + 50) };
  };
  P._stepPuffer = function (h) {
    var cfg = this.cfg, L = this.layout;
    if (this._beeAt > 0 && this.time >= this._beeAt && !this.puffer && !this._beeDone) {
      this._beeAt = -1;
      if (this.phase === 'ask' && this._liveCount() > 0) {
        this._beeDone = true;
        var hv = this._pufferHover(), sx = L.W + 70, sy = hv.y - 40 - this._crng.float(0, 60);
        this.puffer = { x: sx, y: sy, _px: sx, _py: sy, sx: sx, sy: sy, t: 0, state: 'in', flip: -1, flap: 0, rot: 0, puff: 0 };
        this._emit({ type: 'puffer', x: sx, y: sy });
      } else this._beeAt = this.time + 0.5;   // wait for a calm moment (an ask with a block on the tower)
    }
    var B = this.puffer;
    if (!B) return;
    B._px = B.x; B._py = B.y;
    B.t += h;
    var hov = this._pufferHover();
    switch (B.state) {
      case 'in': {   // a gentle wavy swim from the right edge to its hover spot
        var u = smooth(B.t / cfg.pufferIn);
        B.x = lerp(B.sx, hov.x, u);
        B.y = lerp(B.sy, hov.y, u) + Math.sin(B.t * 4.2) * 14 * (1 - u);
        B.flip = -1; B.flap = (B.t * 6) % 1; B.rot = 0.12 * Math.sin(B.t * 4.2) * (1 - u); B.puff = 0;
        if (B.t >= cfg.pufferIn) { B.state = 'sit'; B.t = 0; }
        break;
      }
      case 'sit':   // hovers, bobbing slowly, fins fluttering
        B.x = hov.x + Math.sin(B.t * 1.3) * 4; B.y = hov.y + Math.sin(B.t * 2.1) * 5; B.rot = 0.05 * Math.sin(B.t * 2.1); B.flap = (B.t * 3) % 1; B.puff = 0;
        if (B.t >= cfg.pufferSit) { B.state = 'away'; B.t = 0; this._beeAwayGeo(B); }
        break;
      case 'loop': {   // tapped: puff up, one spinning loop above its spot, deflate, then zoom off
        var S0 = cfg.pufferSpin[0], S1 = cfg.pufferSpin[1], R = cfg.pufferLoopR, T = cfg.pufferLoop;
        B.puff = B.t < cfg.pufferPuffIn ? smooth(B.t / cfg.pufferPuffIn) : B.t > T - 0.35 ? smooth((T - B.t) / 0.35) : 1;
        var a = TAU * smooth(clamp((B.t - S0) / (S1 - S0), 0, 1));
        B.x = B.lx + Math.sin(a) * R * B.flip; B.y = B.ly - R + Math.cos(a) * R;
        B.rot = a * B.flip; B.flap = (B.t * 10) % 1;
        if (B.t >= T) { B.x = B.lx; B.y = B.ly; B.rot = 0; B.puff = 0; B.state = 'away'; B.t = 0; this._beeAwayGeo(B); }
        break;
      }
      case 'away': {   // zooms off to the right, rising a little
        var v = B.t / cfg.pufferOut;
        B.x = B.ax + B.dir * (L.W * 0.9) * v * v + Math.sin(B.t * 7) * 6;
        B.y = B.ay - 90 * v + Math.sin(B.t * 9) * 5;
        B.flip = B.dir; B.flap = (B.t * 12) % 1; B.rot = 0; B.puff = 0;
        if (B.t >= cfg.pufferOut) this.puffer = null;
        break;
      }
    }
  };
  P._beeAwayGeo = function (B) { B.ax = B.x; B.ay = B.y; B.t = 0; B.dir = 1; };   // always out to the right
  P._stepGust = function (h) {
    var cfg = this.cfg;
    if (this._gustAt > 0 && this.time >= this._gustAt && !this._gustDone) {
      this._gustAt = -1; this._gustDone = true;
      this.wind = cfg.gustDir;
      var T = this.tower;
      T.omega = 0;
      this._swayKick(cfg.gustDir * cfg.gustPeak - T.theta * 0.5);
      this._holdAt = this.time + cfg.holdDelay;   // the tower tips first, then Pip steadies it with both paws
      this._emit({ type: 'gust', dir: cfg.gustDir, strength: 1 });
    }
    if (this._holdAt > 0 && this.time >= this._holdAt) { this._holdAt = -1; this._mood('hold', cfg.holdTime); }
    if (this.wind) { var d = h / cfg.windDecay; this.wind = Math.abs(this.wind) <= d ? 0 : this.wind - sgn(this.wind) * d; }
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

  P._step = function (h) {
    var cfg = this.cfg, i, T = this.tower;
    for (i = 0; i < this.pieces.length; i++) { var p = this.pieces[i]; p._px = p.x; p._py = p.y; p._prot = p.rot; }
    for (i = 0; i < T.blocks.length; i++) { var F = T.blocks[i].fly; if (F) { F._px = F.x; F._py = F.y; F._prot = F.rot; } }
    T._ptheta = T.theta;
    if (this.goal) { var G = this.goal; G._pcloudY = G.cloudY; G._pcrownY = G.crownY; G._pcrownX = G.crownX; }
    this.time += h; this.stateTime += h; this.phaseTime += h;

    switch (this.state) {
      case 'intro': if (this.stateTime >= cfg.introTime) this._beginRound(); break;
      case 'round': this._stepRound(h); break;
      case 'roundDone': this._stepClear(h); break;
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
            this._emit({ type: 'sessionDone', stars: this.stars, towers: this.towers });
          }
        }
        break;
    }
    for (i = 0; i < this.pieces.length; i++) this._stepPiece(this.pieces[i], h);
    this.pieces = this.pieces.filter(function (q) { return q.state !== 'gone'; });
    if (this.state === 'round' || this.state === 'roundDone') {
      this._stepTower(h); this._stepGoal(h); this._stepPearls(h); this._stepPuffer(h); this._stepGust(h); this._stepHint(h);
    } else this.breeze += (this._breezeIn - this.breeze) * Math.min(1, h / cfg.breezeTau);
    this._stepPip(h);
  };

  P._stepRound = function (h) {
    var cfg = this.cfg;
    switch (this.phase) {
      case 'deal': {
        if (this._dealAt > 0 && this.time >= this._dealAt) { this._dealAt = -1; this._deal(); this._settleT = 0; }
        if (this._dealAt < 0) {
          var a = this.ask, all = this.pieces.some(function (p) { return p.askIdx === a; }) &&
            this.pieces.every(function (p) { return p.askIdx !== a || p.state === 'rest'; });
          if (all) {
            this._settleT += h;
            if (this._settleT >= cfg.dealSettle) { if (this._askGated()) this._gateT += h; else this._startAsk(); }   // P1-1: wait for Pip to be quiet
          }
        }
        break;
      }
      case 'ask': {
        var d = this._press, dragging = d && d.kind === 'piece', still = dragging && this.time - d.st >= 1;
        if (!dragging || still) this._idleT += h;
        if (dragging && this.time - d.st >= cfg.stillTime) {
          var sp0 = d.id;
          this.cancelDrag();
          this._emit({ type: 'stillDrag', pieceId: sp0 });
          break;
        }
        if (this._idleT >= this._idleGap - 1e-9) {
          this._idleT = 0;
          this._idleGap = Math.min(cfg.idleMax, this._idleGap * cfg.idleBackoff);
          this._idleN++;
          this._mood('think');
          var q = this._askObj();
          this._emit({ type: 'idle', n: this._idleN, promptKey: q.promptKey, params: q.params });
          if (this._idleN >= cfg.idleHintFrom) this._autoHint(true);
        }
        break;
      }
      case 'drop': case 'bounce': break;
      case 'done': this._stepDone(h); break;
    }
  };

  P._stepPip = function (h) {
    var b = this.pip, cfg = this.cfg, L = this.layout;
    b.x = L.pip.x; b.y = L.pip.y;
    if (b.moodT > 0) { b.moodT -= h; if (b.moodT <= 0) { b.moodT = 0; b.mood = 'idle'; } }
    b.blinkT -= h;
    if (b.blink && b.blinkT <= 0) { b.blink = false; b.blinkT = this._crng.float(cfg.blink[0], cfg.blink[1]); }
    else if (!b.blink && b.blinkT <= 0) { b.blink = true; b.blinkT = cfg.blinkTime; }
    // look: the dragged / flying piece, the puffer, the falling crown, else the tower top
    var tx = L.tower.x, ty = this.towerTop().y, act = null;
    for (var i = 0; i < this.pieces.length; i++) if (this.pieces[i].z >= 3) act = this.pieces[i];
    if (act) { tx = act.x; ty = act.y; } else if (this.puffer) { tx = this.puffer.x; ty = this.puffer.y; }
    else if (this.goal && this.goal.state === 'drop') { tx = this.goal.crownX; ty = this.goal.crownY; }
    b.lookX += (tx - b.lookX) * Math.min(1, h * cfg.lookRate);
    b.lookY += (ty - b.lookY) * Math.min(1, h * cfg.lookRate);
    b.look = clamp((b.lookX - b.x) / 500, -1, 1);
  };

  RT.World = World;
})(window.RT = window.RT || {});
