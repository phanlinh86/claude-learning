/* Tibo's Dino Lake Fishing — TL.CONFIG + TL.World (headless, deterministic fishing-lake simulation; DESIGN §2, §5.2;
 * the real API / render contract: docs/MECHANICS.md)
 *
 * ============================== CONVENTIONS ==============================
 *  Units: logical px (short side 720), seconds, radians, y DOWN, rot > 0 clockwise. Screen space = world space (no camera).
 *  update(dt) runs fixed sub-steps of cfg.step (1/120 s). At the START of every sub-step every moving field is copied into its
 *  `_p` twin; render v = _v + (v − _v)·w.alpha.  No DOM, node-loadable.
 *
 *  FISH w.members[] = { id, i, thing, target, lane, laneY, x, y (BODY CENTRE), vx, vy, dir (−1..1 visual facing; the sign is the
 *    facing, |dir| < 1 mid-turn), face ±1 (where it is heading), sx, sy (= dir·stretch, squash: render scale(sx·scale, sy·scale)),
 *    rot, wag 0..1, wagPhase (rad), wriggle 0..1, glow 0..1, alert 0..1, count −1|0..n, scale, blink 0|1, alpha, above (centre
 *    above the surface), state 'enter'|'swim'|'dart'|'hooked'|'reel'|'show'|'leap'|'away'|'joy'|'leave'|'gone' }
 *    + _px _py _prot _psx _psy _pscale _palpha.
 *    Draw: translate(x, y) · rotate(rot) · scale(sx·scale, sy·scale) → TL.FishArt.drawThing(ctx, thing, layout.size, {t, wag,
 *    wagPhase, wriggle, glow, night, count, blink}) with globalAlpha = alpha.
 *  ROD tip = TL.World.rodTip(layout.rodBase, layout.rodLen, line.rodAngle, line.bend)
 *          = base + len·(cos(angle + 0.5·bend), sin(angle + 0.5·bend))      (TL.FishArt.drawRod must return the same tip)
 * ========================================================================
 */
(function (TL) {
  'use strict';

  var CONFIG = {
    // ---- timing / state machine (s)
    step: 1 / 120, maxFrame: 1.0,
    roundsPerLevel: 4, chapterTimeLimit: 75, chapterMinRounds: 3, chapterHardLimit: 110, chapterHardMinRounds: 2,
    shortBudget: [1e9, 26, 42, 56],   // s into the chapter: a round starting later than this is short (fewer fish)
    introTime: 2.5, levelDoneTime: 3.6, pondFullTime: 1.6,
    talkAfterAnswer: 1.6, talkLock: 1, talkAskTime: 12, talkGlowAfterAsks: 2, talkMaxAsks: 3, talkGiveUp: 2,

    // ---- layout (DESIGN §2; px)
    shortSide: 720, minLong: 960, maxLong: 1600, tallRatio: 1.6, phoneRatio: 1.9,
    groundLand: 14, groundPort: 26,
    bubbleX: 24, bubbleYLand: 18, bubbleMaxW: 560, bubbleMaxWPhone: 720, bubbleRight: 200, bubbleHLand: 134, bubbleGap: 16,
    bubbleYPort: 110, bubbleHPort: 124, bubbleHPortPhone: 140, bubbleMinW: 220, hudW: 160, hudH: 96,
    surfaceLandK: 0.40, surfacePortK: 0.20, surfacePortMinK: 0.30, rodClear: 20, tiboClear: 6,
    tiboXLand: 110, tiboXPort: 105, tiboHLand: 190, tiboHPort: 170, tiboUpLand: 34, tiboUpPort: 30, tiboWK: 0.78, tiboPad: 10,
    tiboSvg: { size: 300, seatX: 150, seatY: 292, gripX: 205, gripY: 175 },
    rockWLand: 300, rockWPort: 270, rockSvg: { w: 320, h: 260, seatX: 150, seatY: 70 },
    rodLenLand: 170, rodLenPort: 150,
    rodRest: -1.05, rodWindup: -1.22, rodWhip: -0.62, rodCast: -0.85, rodReel: -1.0, rodShow: -0.75,
    bendCast: 0.15, bendReel: 0.8, bendShow: 0.4,
    swimRockGap: 30, swimRightLand: 50, swimSidePort: 40, laneTopK: 0.75, laneBotK: 0.85, laneMinK: 1.0, laneSqueezeK: 0.85, laneTallK: 1.25,
    lanesLand: 3, lanesPort: 4, lanesTall: 5, keepGap: 44, rockLaneGap: 20,
    lilyEdge: 12, lilyK: 0.95, lilyPadW: 84, lilyGapMin: 110, lilyDy: 6, laneTopPad: 12, bedSand: 138, bedGap: 10, bedKPort: 1.15, bedKTall: 1.36, laneCapMax: 3, showLift: 24, lineShowMin: 60, lineShowMax: 160,
    size: { 3: 104, 4: 104, 5: 96, 6: 90, 7: 90 }, tallK: 1.12, lenK: 1.5, littleK: 0.6, bubbleD: 1.25,
    hitK: 0.6, hitPad: 22, littleHitK: 0.85, bubbleHitK: 0.65,
    mouth: { x: 0.66, y: 0.04 }, hangRot: 0.42, bubbleHook: 0.6,   // the mouth in fish-local units of size (fish facing RIGHT)

    // ---- swimming (DESIGN §5.2)
    speed: { 3: 38, 4: 48, 5: 58, 6: 66, 7: 74 }, speedVar: [0.85, 1.15], bubbleSpeedK: 0.7,
    velK: 2.6, turnVelK: 6, turnTime: 0.35, brakeL: 0.3, neighK: 1.3, sepK: 1.08,
    bobAmp: 6, bobHz: 0.5, driftAmp: 10, driftHz: 0.07, bubbleBob: 9, yOmega: 2.6, yZeta: 0.9,
    pitchK: 0.6, pitchMax: 0.25, rotOmega: 10, rotZeta: 0.8, hangOmega: 24, reelRotOmega: 12, wagHz: [1.1, 3.2],
    fingerR: 180, fingerK: 0.35, hintSlow: 0.4, assistSlow: 0.2, slowRate: 3, assistScale: 1.12,
    squashOmega: 14, squashZeta: 0.4, squashSxK: 0.86, qMax: 0.3,
    enterStagger: 0.25, enterMin: 1.2, enterVMax: 480, enterAcc: 380, enterRefW: 1100, enterVelK: 6, enterSpread: [0.3, 0.7],
    fishBubbleEvery: [2.2, 5],

    // ---- wrong tap: dart
    dartTime: 0.4, dartK: 3, dartTurn: 0.18, dartVelK: 12, dartKick: 0.16, dartBubbles: 3, sameWrongWindow: 1.0, brushKick: 0.08,

    // ---- cast: rod wind-up + whip, ballistic hook arc, plop, sink, bite
    castWindup: 0.12, castWhip: 0.15, rodOmega: 12, rodZeta: 0.35, bendOmega: 9, bendZeta: 0.45,
    hookFly: 0.55, hookApex: 90, hookApexMin: 24, hookTopGap: 14, castRelease: 1.0, sinkTime: 0.35, sinkSway: 6, hookStopK: 5, alertTime: 0.6, biteKick: 0.12,
    restLine: 40, restSwing: 0.1, restSwingHz: 0.55, freeOmega: 9, freeZeta: 0.5,

    // ---- reel: curve under water, splash, damped pendulum with a shortening line (DESIGN §5.2)
    reelUnderV: 330, reelUnderT: [0.7, 1.3], exitTheta: 0.45, exitSwingK: 0.25, exitSwingMax: 1.0, pendG: 1400, pendDamp: 0.6, pendDampReel: 1.2, thetaMax: 1.1, pivotAccMax: 5000,
    reelSpeed: 150, reelMinT: 0.6, wriggleHz: 4.2, wriggleAmp: 0.16, wriggleAir: 0.55, wriggleShow: 0.2, trailEvery: 0.08,

    // ---- show / release leap / lily
    showTime: 1.4, countDelay: 0.25, countStep: 0.55, countTail: 0.8, badgeTime: 2, badgeFade: 0.25,
    leapApex: 150, leapApexMin: 60, leapG: 1400, leapSpin: 1, leapBlend: 0.18, awayTime: 0.9, lilyDelay: 0.12,
    lilyOmega: 8, lilyZeta: 0.4, rodBackOmega: 10, rodBackZeta: 0.25,

    // ---- joy jumps / leave
    joyGap: 0.35, joyTail: 0.5, joyH: [60, 90], joyG: 1400, joyRiseK: 0.55, joyReady: 0.9, joyVx: 90, joyMaxT: 4.5,
    leaveV: 620, leaveVelK: 4, leaveTurn: 0.22, leaveMax: 1.8,

    // ---- help (DESIGN §5.2)
    hintAfterMisses: 2, hintAfterSoft: 3, assistAfter: 6, assistMinPlay: 10, assistMaxStars: 1, assistTibo: true, pokeNoProgress: 2, hintTime: 10, hintCooldown: 6, hintCycle: 1.6,
    idleTime: 12, idleBackoff: 1.5, idleMax: 30, idleHintFrom: 1, flickTime: 0.25, tapMovePx: 24, tapMoveCss: 24,
    critterK: 2, critterSoftK: 1.5, histLag: 0.12, histKeep: 0.25, puffTime: 0.6,

    // ---- fx
    rippleTime: 0.9, rippleR: [8, 70], splashTime: 0.5, bubbleCap: 40, rippleCap: 16, splashCap: 10,

    // ---- critters: one round per chapter (round 1 or 2, never the warm-up); kind by chapter index
    surpriseRounds: [1, 2], critters: ['ptero', 'bronto', 'frog', 'fireflies'], surpriseAt: [2, 4.5],
    ptero: { r: 60, inT: 2.6, dipT: 0.6, outT: 2.4, loopT: 1.2, loopR: 55, flapHz: 3 },
    bronto: { hLand: 220, hPort: 200, rK: 0.3, inT: 2.5, stay: 10, sprayT: 1.6, outT: 2.5, block: 0.42 },
    frog: { r: 44, h: 80, inT: 0.8, hopT: 0.6, hopH: 70, sit: 12, outT: 0.8 },
    fireflies: { n: 6, r: 40, inT: 1.4, stay: 14, outT: 1.2, twT: 0.9 },

    // ---- Tibo
    moodTime: { happy: 1.0, cheer: 1.4, oops: 0.8, think: 1.4, talk: 1.0, wave: 1.4, cast: 0.7 },
    bounceT: 0.42, lookRate: 6, blink: [2.2, 5], blinkTime: 0.13
  };
  TL.CONFIG = CONFIG;

  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hyp(x, y) { return Math.sqrt(x * x + y * y); }
  function lerp(a, b, u) { return a + (b - a) * u; }
  function smooth(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  function sgn(v) { return v < 0 ? -1 : 1; }
  function merge(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; if (b) for (k in b) o[k] = b[k]; return o; }
  function insOf(ins) { return { top: +(ins && ins.top) || 0, right: +(ins && ins.right) || 0, bottom: +(ins && ins.bottom) || 0, left: +(ins && ins.left) || 0 }; }
  function keepBoxes(hk) {
    var a = Array.isArray(hk) ? hk : hk ? [hk] : [], out = [];
    for (var i = 0; i < a.length; i++) { var b = a[i]; if (b && b.w > 0 && b.h > 0) out.push({ x: +b.x, y: +b.y, w: +b.w, h: +b.h }); }
    return out;
  }
  function inBox(b, x, y, pad) { pad = pad || 0; return x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad; }
  function boxHit(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
  /** Initial velocity that gives a damped spring (ω, ζ) released from 0 a first peak of `peak`. */
  function kickFor(peak, w, z) { var s = Math.sqrt(1 - z * z); return peak * w * Math.exp(z / s * Math.atan2(s, z)); }
  function spring(o, k, kv, target, w, z, h) { o[kv] += (w * w * (target - o[k]) - 2 * z * w * o[kv]) * h; o[k] += o[kv] * h; }
  function bez(x0, y0, cx, cy, x1, y1, u) { var a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u; return { x: a * x0 + b * cx + c * x1, y: a * y0 + b * cy + c * y1 }; }
  function bezD(x0, y0, cx, cy, x1, y1, u) { return { x: 2 * (1 - u) * (cx - x0) + 2 * u * (x1 - cx), y: 2 * (1 - u) * (cy - y0) + 2 * u * (y1 - cy) }; }
  /** Segment (ax, ay) → (bx, by) vs circle (cx, cy, r): the first parameter s ∈ [0, 1] inside the circle, or −1. */
  function segHit(ax, ay, bx, by, cx, cy, r) {
    var dx = bx - ax, dy = by - ay, fx = ax - cx, fy = ay - cy, a = dx * dx + dy * dy, c = fx * fx + fy * fy - r * r;
    if (c <= 0) return 0;
    if (a < 1e-9) return -1;
    var b = 2 * (fx * dx + fy * dy), disc = b * b - 4 * a * c;
    if (disc < 0) return -1;
    var s = (-b - Math.sqrt(disc)) / (2 * a);
    return s >= 0 && s <= 1 ? s : -1;
  }
  /** THE rod-tip formula shared with TL.FishArt.drawRod: the rod is a curve from `base` of length `len`; a bend b turns the
   *  chord by +0.5·b (b > 0 pulls the tip down/forward). */
  function rodTip(base, len, angle, bend) {
    var a = angle + 0.5 * (bend || 0);
    return { x: base.x + len * Math.cos(a), y: base.y + len * Math.sin(a) };
  }
  /** Ballistic launch from (x0, y0) to (x1, y1) with gravity g and an apex `apex` px above the higher end → {vx, vy, T}. */
  function ballistic(x0, y0, x1, y1, g, apex) {
    var top = Math.min(y0, y1) - Math.max(1, apex), up = y0 - top, down = y1 - top;
    var vy = -Math.sqrt(2 * g * up), T = Math.sqrt(2 * up / g) + Math.sqrt(2 * Math.max(0, down) / g);
    return { vx: (x1 - x0) / Math.max(0.05, T), vy: vy, T: T, g: g };
  }

  /** DESIGN §2 short-side rule: CSS viewport → logical W×H. */
  function logicalSize(cssW, cssH, cfg) {
    cfg = cfg || CONFIG;
    var S = cfg.shortSide, aspect = cssW / Math.max(1, cssH);
    if (cssW >= cssH) return { W: clamp(Math.round(S * aspect), cfg.minLong, cfg.maxLong), H: S };
    return { W: S, H: clamp(Math.round(S / aspect), cfg.minLong, cfg.maxLong) };
  }
  function ageKey(age) { return clamp(Math.round(+age || 4), 3, 7); }
  /** Entry spread inside a lane's centre range for k fish: they enter to a … 1 − a (k = 2: ¼ / ¾ ≈ 0.22 / 0.78). */
  function laneSpread(k) { return k <= 2 ? 0.22 : 0.06; }
  /** The HUD's measured box among the hudKeep boxes (the one in the top-right). */
  function hudBox(hk, W, H) { var best = null; for (var i = 0; i < hk.length; i++) { var b = hk[i]; if (b.x + b.w / 2 > W / 2 && b.y < H / 2 && (!best || b.y + b.h > best.y + best.h)) best = b; } return best; }
  /** The offset mouth − centre of a fish (or hook point − centre of a bubble) for a pose. */
  function anchorVec(kind, s, dir, sy, rot, cfg) {
    var mx, my;
    if (kind === 'bubble') { mx = 0; my = -cfg.bubbleHook * s; }
    else { mx = cfg.mouth.x * s * dir; my = cfg.mouth.y * s * (sy || 1); }
    var c = Math.cos(rot), sn = Math.sin(rot);
    return { x: mx * c - my * sn, y: mx * sn + my * c };
  }

  /* ---------------------------------------------------------------- layout (DESIGN §2; docs/MECHANICS.md §3) */
  function computeLayout(W, H, ins, cfg, age, hudKeep) {
    ins = insOf(ins);
    var a = ageKey(age), portrait = H > W, tall = H / W > cfg.tallRatio, phone = (portrait ? H / W : W / H) > cfg.phoneRatio;
    var groundY = H - ins.bottom - (portrait ? cfg.groundPort : cfg.groundLand);
    var hk = keepBoxes(hudKeep), hb = hudBox(hk, W, H);
    var size = Math.round(cfg.size[a] * (tall ? cfg.tallK : 1)), len = size * cfg.lenK;
    var hud = { x: W - ins.right - cfg.hudW, y: 0, w: cfg.hudW + ins.right, h: ins.top + cfg.hudH };
    // Tibo (seat point = bottom centre on the rock) + the rod grip from the character SVG (grip 205,175 / seat 150,292 in 300²)
    var th = portrait ? cfg.tiboHPort : cfg.tiboHLand, TS = cfg.tiboSvg, k = th / TS.size;
    var grip = { x: (TS.gripX - TS.seatX) * k, y: (TS.gripY - TS.seatY) * k };
    var rodLen = portrait ? cfg.rodLenPort : cfg.rodLenLand, up = portrait ? cfg.tiboUpPort : cfg.tiboUpLand;
    // the speech bubble (y, h); landscape x comes after the show point (the rod + the hanging fish own the top-left)
    var bubble = portrait
      ? { x: ins.left + cfg.bubbleX, y: ins.top + cfg.bubbleYPort, w: 0, h: phone ? cfg.bubbleHPortPhone : cfg.bubbleHPort }
      : { x: 0, y: ins.top + cfg.bubbleYLand, w: 0, h: cfg.bubbleHLand };
    if (portrait) {
      bubble.w = W - bubble.x - ins.right - cfg.bubbleX;
      if (hb && bubble.x + bubble.w > hb.x - 10 && bubble.y < hb.y + hb.h) bubble.y = Math.max(bubble.y, hb.y + hb.h + 8);
    }
    var bb = bubble.y + bubble.h, surfaceY;
    if (!portrait) surfaceY = Math.round(H * cfg.surfaceLandK);
    else {
      var tipRise = -grip.y - rodLen * Math.sin(cfg.rodRest);   // rest rod tip height above the seat
      surfaceY = Math.round(Math.max(bb + cfg.surfacePortK * H, bb + cfg.rodClear + up + tipRise, bb + cfg.tiboClear + up + th, cfg.surfacePortMinK * H));
    }
    var tibo = { x: ins.left + (portrait ? cfg.tiboXPort : cfg.tiboXLand), y: surfaceY - up, h: th, w: cfg.tiboWK * th };
    tibo.mouth = { x: tibo.x + 0.14 * th, y: tibo.y - 0.58 * th };
    var tiboBox = { x: tibo.x - tibo.w / 2 - cfg.tiboPad, y: tibo.y - th - cfg.tiboPad, w: tibo.w + 2 * cfg.tiboPad, h: th + 2 * cfg.tiboPad };
    var rodBase = { x: tibo.x + grip.x, y: tibo.y + grip.y };
    // the shore rock: its seat (150, 70 of 320×260) under Tibo's seat
    var RS = cfg.rockSvg, rw = portrait ? cfg.rockWPort : cfg.rockWLand, rk = rw / RS.w, rh = RS.h * rk;
    var rock = { x: tibo.x + (RS.w / 2 - RS.seatX) * rk, y: tibo.y + (RS.h - RS.seatY) * rk, w: rw, h: rh, seat: { x: tibo.x, y: tibo.y } };
    rock.top = rock.y - rh; rock.x0 = rock.x - rw / 2; rock.x1 = rock.x + rw / 2;
    // the show point: the fish hangs facing Tibo (dir −1, head up hangRot) under the show-pose rod tip
    var tipShow = rodTip(rodBase, rodLen, cfg.rodShow, cfg.bendShow);
    var mv = anchorVec('fish', size, -1, 1, cfg.hangRot, cfg);
    var showY = surfaceY - 0.5 * size - cfg.showLift;
    var lineShow = clamp(showY + mv.y - tipShow.y, cfg.lineShowMin, cfg.lineShowMax);
    var showPt = { x: tipShow.x - mv.x, y: tipShow.y + lineShow - mv.y };
    var showBox = { x: showPt.x - 0.5 * len, y: showPt.y - 0.62 * size, w: len, h: 1.24 * size };
    if (!portrait) {
      bubble.x = Math.max(ins.left + cfg.bubbleX, Math.round(showBox.x + showBox.w + cfg.bubbleGap));
      bubble.w = Math.min(phone ? cfg.bubbleMaxWPhone : cfg.bubbleMaxW, W - ins.right - cfg.bubbleRight - bubble.x);
      if (hb && bubble.x + bubble.w > hb.x - 10 && bubble.y < hb.y + hb.h) {
        var room = hb.x - 12 - bubble.x;
        if (room >= cfg.bubbleMinW) bubble.w = room; else bubble.y = Math.max(bubble.y, hb.y + hb.h + 8);
      }
      bubble.w = Math.max(cfg.bubbleMinW, bubble.w);
    }
    bb = bubble.y + bubble.h;
    // swim range + lanes
    var x0 = portrait ? ins.left + cfg.swimSidePort : rock.x1 + cfg.swimRockGap, x1 = W - ins.right - (portrait ? cfg.swimSidePort : cfg.swimRightLand);
    var top = surfaceY + cfg.laneTopK * size + cfg.laneTopPad, bot = groundY - cfg.laneBotK * size;
    // the opaque sand of the lake-bed art starts at H − 138·kp (kp = the env art scale): the fish body stays ≥ 10 px above it
    var kp = portrait ? (tall ? cfg.bedKTall : cfg.bedKPort) : 1;
    bot = Math.min(bot, H - cfg.bedSand * kp - cfg.bedGap - 0.5 * size);
    hk.forEach(function (b) { if (b.y > H / 2) bot = Math.min(bot, b.y - cfg.keepGap - 0.5 * size); });
    var nMax = portrait ? (tall ? cfg.lanesTall : cfg.lanesPort) : cfg.lanesLand, j;
    var need = a <= 3 ? 3 : a === 4 ? 4 : 5;   // the most fish a round of this age shows
    function buildLanes(minK) {
      var nl = 1, sp = 0, k2, lanes = [], ranges = [];
      for (k2 = nMax; k2 >= 2; k2--) {
        sp = (bot - top) / (k2 - 1);
        if (sp >= (k2 >= 5 ? Math.max(minK, cfg.laneTallK) : minK) * size) { nl = k2; break; }
      }
      if (nl < 2) { nl = bot - top >= 0.8 * size ? 2 : 1; sp = nl > 1 ? bot - top : 0; }
      for (k2 = 0; k2 < nl; k2++) {
        var ly = Math.round(nl > 1 ? top + k2 * sp : (top + Math.max(top, bot)) / 2);
        lanes.push(ly);
        var lx0 = x0;
        if (rock.x1 + cfg.rockLaneGap > lx0 && ly - 0.5 * size - 6 < rock.y) lx0 = rock.x1 + cfg.rockLaneGap;   // the rock hides that lane's left end
        var cx0 = lx0 + 0.5 * len, cx1 = x1 - 0.5 * len;
        if (cx1 < cx0) { var mid = (cx0 + cx1) / 2; cx0 = cx1 = mid; }
        // cap: how many fish fit (spread over the lane's centre range with a lane-neighbour gap ≥ neighK·len + 8)
        var cap = 1;
        for (var kk = 2; kk <= cfg.laneCapMax; kk++) if ((1 - 2 * laneSpread(kk)) * (cx1 - cx0) / (kk - 1) >= cfg.neighK * len + 8) cap = kk;
        ranges.push({ x0: lx0, x1: x1, cx0: cx0, cx1: cx1, cap: cap });
      }
      return { lanes: lanes, ranges: ranges, sp: sp, capSum: ranges.reduce(function (t, R) { return t + R.cap; }, 0) };
    }
    // lanes ≥ 1.0 size apart; only when they cannot hold the age's biggest round they tighten (down to laneSqueezeK)
    var LB = buildLanes(cfg.laneMinK);
    for (var mk = cfg.laneMinK - 0.05; LB.capSum < need && mk >= cfg.laneSqueezeK - 1e-9; mk -= 0.05) { var L2 = buildLanes(mk); if (L2.lanes.length > LB.lanes.length) LB = L2; }
    var lanes = LB.lanes, ranges = LB.ranges, sp = LB.sp;
    var swim = { x0: x0, x1: x1, lanes: lanes, ranges: ranges, spacing: sp, len: len, top: top, bottom: bot };
    // lilies: 4 spots ON the surface, clear of the rock
    // render draws a pad ≈ lilyPadW × lilyS wide (lilyS = size/104 × 0.95); centres from the rock (+ 12 px gap) to swim.x1 − 12,
    // ≥ lilyGapMin apart, else the pads shrink (layout.lilyS)
    var lilyS = size / 104 * cfg.lilyK, padHalf = 0.5 * cfg.lilyPadW * lilyS, lilies = [];
    var lx = Math.max(x0, rock.x1 + cfg.lilyEdge + padHalf), rx = x1 - cfg.lilyEdge, lsp = (rx - lx) / 3;
    if (lsp < cfg.lilyGapMin) { lx = Math.max(x0, rock.x1 + cfg.lilyEdge); lsp = (rx - lx) / 3; }
    lilyS = Math.min(lilyS, Math.max(0.5, (lsp - 16) / cfg.lilyPadW));
    for (j = 0; j < 4; j++) lilies.push({ x: Math.round(lx + j * lsp), y: surfaceY + cfg.lilyDy });
    // bronto stands at the right end, knees in the water (bottom anchor)
    var bh = portrait ? cfg.bronto.hPort : cfg.bronto.hLand;
    var bronto = { x: W - ins.right - 0.5 * bh * 260 / 300 - 4, y: surfaceY + 0.22 * bh, h: bh, w: bh * 260 / 300 };   // the whole art box on screen
    var L = { W: W, H: H, ins: ins, portrait: portrait, tall: tall, phone: phone, groundY: groundY, bubble: bubble, hud: hud,
      surfaceY: surfaceY, size: size, len: len, tibo: tibo, tiboBox: tiboBox, rock: rock, rodBase: rodBase, rodLen: rodLen,
      tipShow: tipShow, lineShow: lineShow, showPt: showPt, showBox: showBox, swim: swim, lilies: lilies, lilyS: lilyS, bronto: bronto,
      bedTop: H - cfg.bedSand * kp,
      band: { x: ins.left, y: surfaceY, w: W - ins.left - ins.right, h: Math.max(0, groundY - surfaceY) },
      sky: { y0: Math.max(bb, hud.y + hud.h) + 20, y1: surfaceY - 40 },
      hitPad: cfg.hitPad, hitR: cfg.hitK * size + cfg.hitPad,
      safe: { x: ins.left, y: ins.top, w: W - ins.left - ins.right, h: H - ins.bottom - ins.top } };
    L.keep = [{ x: bubble.x, y: bubble.y, w: bubble.w, h: bubble.h, kind: 'bubble' }, { x: hud.x, y: hud.y, w: hud.w, h: hud.h, kind: 'hud' }];
    hk.forEach(function (b) { b.kind = 'hudKeep'; L.keep.push(b); });
    L.hudKeep = hk;
    return L;
  }

  // ------------------------------------------------------------------ World
  function World(opts) {
    opts = opts || {};
    this.cfg = merge(CONFIG, opts.config);
    this.seed = opts.seed !== undefined ? opts.seed : 1;
    this.rng = new TL.RNG(this.seed);
    this._crng = new TL.RNG((TL.RNG.hash(this.seed) ^ 0x51ed27) >>> 0);   // cosmetic randomness (bubbles, blinks, phases, critters)
    this.age = TL.Content.ageOf(opts.age !== undefined ? opts.age : 4);
    this.lang = opts.lang === 'vi' ? 'vi' : 'en';
    this._pendingAge = this.age; this._pendingLang = this.lang;
    this.state = 'menu'; this.phase = null;
    this.level = 0; this.levels = []; this.topic = null; this.weather = 0;
    this.round = 0; this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.stars = 0; this.levelStars = 0; this.roundStars = 0; this.misses = 0; this.streak = 0;
    this.time = 0; this.stateTime = 0; this.phaseTime = 0; this.alpha = 0; this._acc = 0;
    this.cur = null; this.talk = null; this.talkAnswered = null;
    this.members = []; this.lilies = []; this.ripples = []; this.splashes = []; this.bubbles = []; this.puffs = [];
    this.badge = null; this.critter = null; this.hintHand = null; this.assistId = null; this.pondFull = 0; this._ppondFull = 0;
    this.line = { state: 'rest', tip: { x: 0, y: 0 }, hook: { x: 0, y: 0 }, slack: 0, bend: 0, bendV: 0, rodAngle: this.cfg.rodRest, rodV: 0,
      len: this.cfg.restLine, theta: 0, thetaV: 0, id: null, _ptip: { x: 0, y: 0 }, _phook: { x: 0, y: 0 }, _pslack: 0, _pbend: 0, _prodAngle: this.cfg.rodRest };
    this.tibo = { x: 0, y: 0, h: 190, w: 148, mood: 'idle', moodT: 0, blinkT: 3, blink: false, look: 0, lookX: 0, bounce: 0, _pbounce: 0, _bT: -1 };
    this.finger = { x: 0, y: 0, down: false };
    this.hudKeep = opts.hudKeep || null; this.lastTopics = null; this.surprise = null; this._surpriseRound = 1;
    this.events = []; this.sessions = 0;
    this._idleN = 0; this._idleT = 0; this._idleGap = this.cfg.idleTime; this._lastHintT = -1e9; this.levelStartTime = 0; this._playT0 = 0;
    this._viewScale = 1;
    this._talkAskT = 0; this._talkAsks = 0; this._g = null; this._noProg = 0; this._answered = false;
    this._usedKeys = []; this._usedTargets = []; this._prevRule = null; this._prevRuleRun = 0; this._prevLane = -1;
    this._view = null; this._vp = null; this._lookT = 0; this._lookX = 0; this._surpriseAt = -1;
    this._reel = null; this._joy = null; this._pondAt = -1; this._tipPrev = null; this._tipV = { x: 0, y: 0 };
    this.setViewport(opts.width || 1280, opts.height || 720, opts.ins || null);
    this._lineRest(true);
  }
  World.logicalSize = logicalSize;
  World.computeLayout = function (W, H, ins, cfg, age, hudKeep) { return computeLayout(W, H, ins, merge(CONFIG, cfg), age === undefined ? 4 : age, hudKeep); };
  World.rodTip = rodTip;
  World.ballistic = ballistic;
  World.anchorVec = function (kind, s, dir, sy, rot, cfg) { return anchorVec(kind, s, dir, sy, rot, merge(CONFIG, cfg)); };
  World.kickFor = kickFor;
  World.segHit = segHit;

  var P = World.prototype;
  /** true while a first contact on a fish is judged right now (round, play, not answered yet). */
  Object.defineProperty(P, 'interactive', { get: function () { return this.state === 'round' && this.phase === 'play' && !this._answered; } });
  Object.defineProperty(P, 'target', { get: function () { return this.cur ? this.memberById(this.cur.targetId) : null; } });
  P._emit = function (e) { this.events.push(e); };
  P.drainEvents = function () { var e = this.events; this.events = []; return e; };
  P.setAge = function (a) { this._pendingAge = TL.Content.ageOf(a); };
  P.setLang = function (l) { this._pendingLang = l === 'vi' ? 'vi' : 'en'; };
  P._setState = function (s) { this.state = s; this.stateTime = 0; };
  P._setPhase = function (p) { this.phase = p; this.phaseTime = 0; };
  P._mood = function (m, t) { this.tibo.mood = m; this.tibo.moodT = t || this.cfg.moodTime[m] || 1; };
  P._bounce = function () { this.tibo._bT = 0; };
  P.skipTalk = function () { if (this.state === 'talk') this._levelDone(); };
  P.memberById = function (id) { for (var i = 0; i < this.members.length; i++) if (this.members[i].id === id) return this.members[i]; return null; };
  P._mouth = function () { var m = this.layout.tibo.mouth; return { x: m.x, y: m.y }; };
  P._lakeCentre = function () { var L = this.layout; return { x: (L.swim.x0 + L.swim.x1) / 2, y: (L.surfaceY + L.groundY) / 2 }; };

  /** The current question {promptKey, params, rule, nameKind, nameValue} while it can be answered, else null. */
  P.prompt = function () {
    if (!this.interactive || !this.cur) return null;
    var c = this.cur;
    return { promptKey: c.promptKey, params: c.params, rule: c.rule, nameKind: c.rule.nameKind, nameValue: c.rule.value };
  };

  // ---------------------------------------------------------------- geometry + test hooks (logical px)
  P._effSize = function (m) { return this.layout.size * (m.thing.big === false ? this.cfg.littleK : 1) * m.scale; };
  P._len = function (m) { return m.thing.kind === 'bubble' ? this.layout.size * this.cfg.bubbleD : this._effSize(m) * this.cfg.lenK; };
  P._hitR = function (m) {
    var c = this.cfg, s = this.layout.size;
    if (m.thing.kind === 'bubble') return c.bubbleHitK * s * Math.max(0.85, m.scale) + c.hitPad;
    return c.hitK * s * (m.thing.big === false ? c.littleHitK : 1) * Math.max(0.85, m.scale) + c.hitPad;
  };
  P._anchor = function (m, rot, dir) { return anchorVec(m.thing.kind, this._effSize(m), dir === undefined ? (m.dir || -1) : dir, m.sy, rot === undefined ? m.rot : rot, this.cfg); };
  /** The point the hook / line attaches to (fish mouth or bubble top) where it is now. */
  P.mouthOf = function (m) { var v = this._anchor(m); return { x: m.x + v.x, y: m.y + v.y }; };
  var TAPPABLE = { enter: 1, swim: 1, dart: 1, joy: 1, leave: 1, hooked: 1 };
  /** The fish's hit circle {x, y, r} (body centre where it is now), null when it cannot be touched. */
  P.memberHit = function (id) { var m = this.memberById(id); return m && TAPPABLE[m.state] && m.alpha > 0.3 ? { x: m.x, y: m.y, r: this._hitR(m) } : null; };
  P._posAt = function (m, t) {
    var H = m._hist;
    if (!H.length) return { x: m.x, y: m.y };
    if (t <= H[0].t) return { x: H[0].x, y: H[0].y };
    for (var i = H.length - 1; i > 0; i--) {
      if (H[i - 1].t <= t) { var a = H[i - 1], b = H[i], u = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1; return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u) }; }
    }
    return { x: H[H.length - 1].x, y: H[H.length - 1].y };
  };
  /** The fish nearest to (x, y) within its hit radius, judged at its interpolated position now AND 0.12 s ago (kids tap where it
   *  was); `states` = the states that count. → {m, d} */
  P._memberNear = function (x, y, states) {
    var best = null, bd = 1e9, al = this.alpha, lagT = this.time - this.cfg.histLag;
    for (var i = 0; i < this.members.length; i++) {
      var m = this.members[i];
      if (!(states || TAPPABLE)[m.state] || m.alpha <= 0.3) continue;
      var r = this._hitR(m), cx = m._px + (m.x - m._px) * al, cy = m._py + (m.y - m._py) * al, old = this._posAt(m, lagT);
      var d = Math.min(hyp(x - cx, y - cy), hyp(x - old.x, y - old.y));
      if (d <= r && d < bd) { bd = d; best = m; }
    }
    return { m: best, d: bd };
  };
  /** Tibo's tap box {x, y (top-left), w, h, cx, cy}. */
  P.tiboHit = function () { var b = this.layout.tiboBox; return { x: b.x, y: b.y, w: b.w, h: b.h, cx: b.x + b.w / 2, cy: b.y + b.h / 2 }; };
  P._clearOfKeep = function (x, y, r) { var K = this.layout.keep; for (var k = 0; k < K.length; k++) if (inBox(K[k], x, y, r * 0.5)) return false; return true; };
  P._onScreen = function (x, y, m) { var L = this.layout; return x >= L.ins.left + m && x <= L.W - L.ins.right - m && y >= L.ins.top + m && y <= L.H - L.ins.bottom - m; };
  /** The critter's tap circle {x, y, r, kind, i?} when it can be tapped right now (on screen, clear of the HUD / bubble), else null. */
  P.critterHit = function () {
    var c = this.critter, k;
    if (!c) return null;
    if (c.kind === 'fireflies') {
      if (c.state !== 'dance') return null;
      for (k = 0; k < c.flies.length; k++) {
        var f = c.flies[k];
        if (this._onScreen(f.x, f.y, 10) && this._clearOfKeep(f.x, f.y, c.r)) return { x: f.x, y: f.y, r: c.r, kind: c.kind, i: k };
      }
      return null;
    }
    if (!c.tappable) return null;
    if (!this._onScreen(c.hx, c.hy, 10) || !this._clearOfKeep(c.hx, c.hy, c.r)) return null;
    return { x: c.hx, y: c.hy, r: c.r, kind: c.kind };
  };
  P._critterAt = function (x, y) {
    var c = this.critter;
    if (!c) return null;
    if (c.kind === 'fireflies') {
      if (c.state !== 'dance') return null;
      var best = null, bd = 1e9;
      for (var k = 0; k < c.flies.length; k++) { var f = c.flies[k], d = hyp(x - f.x, y - f.y); if (d <= c.r && d < bd && this._clearOfKeep(f.x, f.y, 0)) { bd = d; best = { kind: c.kind, i: k, d: d }; } }
      return best;
    }
    var h = this.critterHit();
    if (!h) return null;
    var dd = hyp(x - h.x, y - h.y);
    return dd <= h.r ? { kind: c.kind, d: dd } : null;
  };
  /** What to touch next: {member: id} in play (the target), else null. */
  P.answer = function () { return this.interactive && this.cur ? { member: this.cur.targetId } : null; };
  /** The effective swim range of a lane (the bronto's legs block the right end while it is in the water). */
  P._range = function (lane) {
    var L = this.layout, R = L.swim.ranges[clamp(lane, 0, L.swim.ranges.length - 1)], c = this.critter;
    if (c && c.kind === 'bronto' && c.block !== undefined) {
      var cx1 = Math.max(R.cx0 + 0.5 * (R.cx1 - R.cx0), Math.min(R.cx1, c.block - 0.5 * L.len));
      return { x0: R.x0, x1: R.x1, cx0: R.cx0, cx1: cx1 };
    }
    return R;
  };

  // ---------------------------------------------------------------- viewport
  P.setViewport = function (W, H, ins) { this._view = { W: W, H: H, ins: insOf(ins) }; this._relayout(false); };
  P._relayout = function (force) {
    var v = this._view;
    var key = v.W + 'x' + v.H + ':' + JSON.stringify(v.ins) + ':' + this.age + ':' + JSON.stringify(this.hudKeep || null);
    if (key === this._vp && !force) return false;
    var had = !!this.layout;
    this._vp = key;
    this._oldL = this.layout || null;
    this.layout = computeLayout(v.W, v.H, v.ins, this.cfg, this.age, this.hudKeep);
    var L = this.layout, T = this.tibo;
    T.x = L.tibo.x; T.y = L.tibo.y; T.h = L.tibo.h; T.w = L.tibo.w;
    var old = this.lilies;
    this.lilies = L.lilies.map(function (p, i) { var o = old[i] || { open: 0, openV: 0, target: 0, color: null, sway: 0, _popen: 0, ph: i * 1.3 }; o.x = p.x; o.y = p.y; return o; });
    if (had) this._snapAll();
    return true;
  };
  /** Rotation / resize mid-round (DESIGN §5.2): cancel the gesture; lanes re-placed (fish spring to their new lane y, x clamped into
   *  the new range); the cast / reel / pendulum / leap re-aim at the new geometry; everything clamped on screen. */
  P._snapAll = function () {
    var L = this.layout, self = this, nl = L.swim.lanes.length, cfg = this.cfg, O = this._oldL || L;
    this.cancelDrag();
    // positions map proportionally from the old lake into the new one (x across the swim range, y across the water depth)
    var mapX = function (x) { return L.swim.x0 + (x - O.swim.x0) * (L.swim.x1 - L.swim.x0) / Math.max(1, O.swim.x1 - O.swim.x0); };
    var mapY = function (y) { return y >= O.surfaceY ? L.surfaceY + (y - O.surfaceY) * (L.groundY - L.surfaceY) / Math.max(1, O.groundY - O.surfaceY) : L.surfaceY - (O.surfaceY - y); };
    var oldN = this._laneN || nl;
    this._laneN = nl;
    this.members.forEach(function (m) {
      if (oldN !== nl) m.lane = oldN > 1 ? Math.round(m.lane * (nl - 1) / (oldN - 1)) : 0;
      m.lane = clamp(m.lane, 0, nl - 1); m.laneY = L.swim.lanes[m.lane];
      var R = self._range(m.lane), s = self._effSize(m);
      if (m.state === 'swim' || m.state === 'dart' || m.state === 'hooked') {
        m.x = clamp(mapX(m.x), R.cx0, R.cx1); m.y = mapY(m.y);
        m.y = clamp(m.y, L.surfaceY + 0.3 * s, L.H - L.ins.bottom - 0.3 * s);
      } else if (m.state === 'enter') m.xe = lerp(R.cx0, R.cx1, m.xu);
      else if (m.state === 'reel' || m.state === 'show') { if (self._reel && self._reel.stage === 'under') { m.x = mapX(m.x); m.y = mapY(m.y); } self._reelRelayout(m); }
      else if (m.state === 'leap') self._leapStart(m, true);
      else if (m.state === 'joy' || m.state === 'away' || m.state === 'leave') {
        m.x = clamp(mapX(m.x), -L.len, L.W + L.len); m.y = mapY(m.y);
        if (m._joy) { m._joy.x0 = m.x - m._joy.vx * m._joy.t; m._joy.y0 = m.y - (m._joy.vy * m._joy.t + 0.5 * cfg.joyG * m._joy.t * m._joy.t); } m.y = clamp(m.y, L.ins.top + 0.5 * s, L.H - L.ins.bottom - 0.3 * s);
      }
      m._hist = [];
      self._twin(m);
    });
    // the line: a hook in flight re-aims at the new surface point; a free / resting hook snaps under the tip
    var ln = this.line;
    ln.tip = rodTip(L.rodBase, L.rodLen, ln.rodAngle, ln.bend);
    if (ln.state === 'fly' && this._cast) this._flyAim(this.memberById(ln.id), true);
    else if (ln.state === 'sink' && this._cast) { this._cast.x0 = clamp(ln.hook.x, 0, L.W); this._cast.y0 = L.surfaceY; }
    else if (ln.state === 'rest' || ln.state === 'free') {
      var keepId = this.phase === 'cast' && this.state === 'round' ? ln.id : null;   // the wind-up goes on (QA P1-a)
      var ra = ln.rodAngle, rv = ln.rodV, bd = ln.bend, bv = ln.bendV;
      this._lineRest(true);
      if (keepId) { ln.id = keepId; ln.rodAngle = ra; ln.rodV = rv; ln.bend = bd; ln.bendV = bv; ln.tip = rodTip(L.rodBase, L.rodLen, ra, bd); ln.hook = { x: ln.tip.x, y: ln.tip.y + cfg.restLine }; }
    }
    ln.hook.x = clamp(ln.hook.x, 0, L.W); ln.hook.y = clamp(ln.hook.y, 0, L.H);
    this._tipPrev = null;
    this.ripples = []; this.splashes = [];
    this.bubbles.forEach(function (b) { b.x = clamp(b.x, 0, L.W); b.y = clamp(b.y, L.surfaceY + 4, L.H); });
    this.puffs = [];
    if (this.badge) this._placeBadge();
    if (this.critter) this._critterRelayout();
    if (this.hintHand) this._stepHint(0);
    this._twins();
    void cfg;
  };

  // ---------------------------------------------------------------- session flow
  P.newSession = function (opts) {
    this.age = this._pendingAge; this.lang = this._pendingLang;
    this.cur = null;
    this._relayout(false);
    this.sessions++;
    this._clearRound(); this.state = 'menu';
    var last = (opts && opts.lastTopics) || this.lastTopics || null;
    this.levels = TL.Content.topicsFor(this.age, this.rng, last);
    this.stars = 0; this._prevRule = null; this._prevRuleRun = 0; this._prevLane = -1;
    this.weather = 0;
    this._emit({ type: 'session', levels: this.levels.slice() });
    this.startLevel(0);
  };
  /** keep = true between two rounds: a critter that is leaving finishes its exit. */
  P._clearRound = function (keep) {
    this.members = []; this._g = null; this.finger.down = false;
    if (!keep || !this.critter || !this._critterLeaving()) this.critter = null;
    this.hintHand = null; this.assistId = null; this._answered = false; this._cast = null; this._reel = null; this._joy = null;
    this._surpriseAt = -1; this._pondAt = -1; this.badge = null;
    if (!keep) { this.puffs = []; this.ripples = []; this.splashes = []; }
    if (this.line.state !== 'rest' && this.line.state !== 'free') this._lineFree();
  };
  P._resetLilies = function () {
    this.pondFull = 0; this._ppondFull = 0;
    this.lilies.forEach(function (q) { q.open = 0; q._popen = 0; q.openV = 0; q.target = 0; q.color = null; });
  };
  P.startLevel = function (i) {
    if (!this.levels.length) this.levels = TL.Content.topicsFor(this.age);
    this.level = clamp(i | 0, 0, this.levels.length - 1);
    this.topic = this.levels[this.level];
    this.weather = this.level % 4;
    this.round = 0; this.levelStars = 0; this.levelStartTime = this.time;
    this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.cur = null; this.talk = null; this.talkAnswered = null; this.surprise = null; this._usedKeys = []; this._usedTargets = [];
    var SR = this.cfg.surpriseRounds || [2];
    this._surpriseRound = SR[this.rng.int(0, SR.length - 1)];
    this._clearRound();
    this._resetLilies();
    this._relayout(false);
    this._setState('intro'); this.phase = null;
    this._mood('wave', 1.6);
    var c = this._lakeCentre();
    this._emit({ type: 'level', level: this.level, topic: this.topic, weather: this.weather, x: c.x, y: c.y });
  };
  P._critterKind = function () { var K = this.cfg.critters; return K && K.length ? K[this.level % K.length] : null; };

  P._newMember = function (q, i) {
    var r = this._crng, cfg = this.cfg;
    return { id: q.id, i: i, thing: q.thing, target: !!q.target, lane: 0, laneY: 0, x: 0, y: 0, vx: 0, vy: 0, dir: 1, face: 1, sx: 1, sy: 1,
      rot: 0, rotV: 0, rotT: 0, wag: 0.5, wagPhase: r.float(0, TAU), wriggle: 0, glow: 0, alert: 0, count: -1, scale: 1, scaleV: 0, blink: 0, alpha: 1,
      above: false, state: 'enter', cruise: 40, slowK: 1, turnT: -1, turnDur: cfg.turnTime, turnFrom: 1, xe: 0, xu: 0.5, q: 0, qV: 0,
      _spawnAt: 0, _spawned: false, _lastWrongT: -1e9, _glowT: 0, _flashT: 0, _alertT: 0, _dartT: 0, _dartDir: 1, _ph: r.float(0, TAU), _dph: r.float(0, TAU),
      _blinkT: r.float(1, 4), _bubT: r.float(cfg.fishBubbleEvery[0], cfg.fishBubbleEvery[1]), _hist: [], _joy: null, _leap: null, _awayT: 0,
      _px: 0, _py: 0, _prot: 0, _psx: 1, _psy: 1, _pscale: 1, _palpha: 1 };
  };
  P._beginRound = function () {
    var cfg = this.cfg, self = this;
    var rr = new TL.RNG((this.rng.next() * 4294967296) >>> 0);
    var sp = this.round === this._surpriseRound && this.round > 0 ? this._critterKind() : null;
    var el = this.time - this.levelStartTime, sb = cfg.shortBudget, short = !!(sb && this.round > 0 && el > sb[Math.min(this.round, sb.length - 1)]);
    var cur = TL.Content.makeRound(this.topic, { age: this.age, lang: this.lang, rng: rr, roundIndex: this.round, surprise: sp, short: short, level: this.level,
      usedKeys: this._usedKeys, prevRule: this._prevRule, prevRuleRun: this._prevRuleRun, usedTargets: this._usedTargets });
    this._usedKeys.push(cur.key);
    if (cur.targetValue != null) this._usedTargets.push(cur.targetValue);
    this._clearRound(true);
    this.cur = cur; this.surprise = cur.surprise;
    this.misses = 0; this.streak = 0; this._noProg = 0; this._roundAssisted = false; this._pokes = 0;
    this._relayout(false);
    this._laneN = this.layout.swim.lanes.length;
    this.members = cur.members.map(function (q, i) { return self._newMember(q, i); });
    this._placeFish(new TL.RNG(cur.seed));
    this._idleT = 0; this._idleGap = cfg.idleTime; this._idleN = 0;
    this._setState('round'); this._setPhase('enter');
    this._mood('wave', 1.4);
    var c = this._lakeCentre();
    this._emit({ type: 'round', round: this.round, topic: this.topic, surprise: cur.surprise, n: this.members.length, short: cur.short, key: cur.key, x: c.x, y: c.y });
  };
  /** Lanes (round-robin over a shuffled lane order; the target never in the previous round's target lane when there is a choice),
   *  entry sides (two fish in one lane come from opposite sides), entry targets spread over the lane, speeds. */
  P._placeFish = function (r) {
    var L = this.layout, cfg = this.cfg, self = this, nl = L.swim.lanes.length, ms = this.members;
    var order = r.shuffle(ms.slice()), lanesOrd = r.shuffle(L.swim.lanes.map(function (y, i) { return i; }));
    var tgt = ms.filter(function (m) { return m.target; })[0];
    var byLane = {};
    order.forEach(function (m, k) {
      var lane = lanesOrd[k % nl], t = 0;
      // a lane that holds only one fish (narrow: the rock end) passes its second fish on
      while ((byLane[lane] || []).length >= L.swim.ranges[lane].cap && t++ < nl) lane = lanesOrd[(lanesOrd.indexOf(lane) + 1) % nl];
      (byLane[lane] = byLane[lane] || []).push(m); m.lane = lane;
    });
    // the target never swims in the previous round's target lane when another lane is free to swap with
    if (tgt && nl > 1 && tgt.lane === this._prevLane) {
      var other = order.filter(function (m) { return m !== tgt && m.lane !== tgt.lane; })[0];
      if (other) {
        var la = tgt.lane, lb = other.lane;
        byLane[la].splice(byLane[la].indexOf(tgt), 1, other); byLane[lb].splice(byLane[lb].indexOf(other), 1, tgt);
        tgt.lane = lb; other.lane = la;
      } else {
        var free = lanesOrd.filter(function (l) { return l !== tgt.lane && !(byLane[l] && byLane[l].length); })[0];
        if (free !== undefined) { byLane[tgt.lane].splice(byLane[tgt.lane].indexOf(tgt), 1); (byLane[free] = byLane[free] || []).push(tgt); tgt.lane = free; }
      }
    }
    var k0 = 0;
    Object.keys(byLane).forEach(function (ln) {
      var list = byLane[ln], R = L.swim.ranges[+ln], n = list.length;
      list.forEach(function (m, j) {
        m.laneY = L.swim.lanes[+ln];
        // one fish: anywhere in the middle, from a random side; two: from opposite sides to ≈ ¼ / ¾ of the lane
        var a = laneSpread(n);
        m.xu = n === 1 ? r.float(cfg.enterSpread[0], cfg.enterSpread[1]) : a + (1 - 2 * a) * j / (n - 1);
        var side = n === 1 ? r.sign() : (m.xu < 0.5 ? -1 : m.xu > 0.5 ? 1 : r.sign());   // −1: enters from the left (heading right)
        m.xe = lerp(R.cx0, R.cx1, m.xu);
        m.face = -side; m.dir = m.face;
        var len = self._len(m);
        m.x = side < 0 ? -0.6 * len : L.W + 0.6 * len;
        m.y = m.laneY + r.float(-8, 8);
        m.cruise = cfg.speed[self.age] * r.float(cfg.speedVar[0], cfg.speedVar[1]) * (m.thing.kind === 'bubble' ? cfg.bubbleSpeedK : 1);
        m.vx = m.face * cfg.enterVMax * Math.max(1, L.W / cfg.enterRefW);
        m._spawnAt = k0 * cfg.enterStagger; k0++;
        m.state = 'enter';
        self._pose(m); self._twin(m);
      });
    });
    // spawn order: the fish heading farthest into the lake first, so one never has to pass another of its side
    ms.slice().sort(function (p, q) { return (q.face > 0 ? q.xe : L.W - q.xe) - (p.face > 0 ? p.xe : L.W - p.xe) || p.i - q.i; })
      .forEach(function (m, k) { m._spawnAt = k * cfg.enterStagger; });
    this._prevLane = tgt ? tgt.lane : -1;
  };

  P._ask = function (first) {
    var cfg = this.cfg, cur = this.cur;
    this._idleT = 0; this._idleGap = cfg.idleTime; this._idleN = 0;
    this._mood('talk', 1.0);
    var M = this._mouth();
    this._emit({ type: 'ask', promptKey: cur.promptKey, params: cur.params, rule: cur.rule, first: !!first, round: this.round, n: this.members.length, x: M.x, y: M.y });
    if (first && this.surprise) this._surpriseAt = this.time + this._crng.float(cfg.surpriseAt[0], cfg.surpriseAt[1]);
  };

  P._startTalk = function () {
    var rr = new TL.RNG((this.rng.next() * 4294967296) >>> 0);
    this.talk = TL.Content.makeTalk(this.topic, { age: this.age, lang: this.lang, rng: rr, level: this.level });
    this.talk.glowAnswer = false;
    this.talkAnswered = null; this._talkAskT = 0; this._talkAsks = 0;
    this.cur = null; this.phase = null;
    this._clearRound();
    this._setState('talk');
    this._mood('talk', 1.2);
    var M = this._mouth();
    this._emit({ type: 'talk', talk: this.talk, x: M.x, y: M.y });
  };
  /** true while a Talk choice can be answered (not in the first talkLock s: the question is heard first). */
  P.talkOpen = function () { return this.state === 'talk' && !!this.talk && !this.talkAnswered && this.stateTime >= this.cfg.talkLock - 1e-9; };
  P.talkAnswer = function (choiceId, auto) {
    if (this.state !== 'talk' || this.talkAnswered || !this.talk) return false;
    if (!auto && !this.talkOpen()) return false;
    var ok = choiceId === this.talk.answer && !auto;
    this.talkAnswered = { choiceId: choiceId, correct: ok, auto: !!auto };
    if (ok) { this.stars += 1; this.levelStars += 1; this._mood('cheer'); this._bounce(); } else this._mood(auto ? 'happy' : 'think');
    this.stateTime = 0;
    this._emit({ type: 'talkResult', correct: ok, choiceId: choiceId, answerId: this.talk.answer, auto: !!auto });
    return ok;
  };
  P._levelDone = function () { this._setState('levelDone'); this.phase = null; this._emit({ type: 'levelDone', level: this.level, stars: this.levelStars }); };

  // ---------------------------------------------------------------- input (logical px; ONE active pointer; a gesture = down … up)
  P._touch = function () { this._idleT = 0; this._idleGap = this.cfg.idleTime; this._idleN = 0; };
  /**
   * pointerDown(x, y) → 'member' (play: the gesture's first contact, judged right / wrong) | 'brush' (a fish touched outside play:
   * a little wiggle) | 'critter' | 'tibo' (poke fires on release) | 'soft' (nothing: ripple / bubbles / sparkle) | 'early' (enter,
   * nothing under the finger) | null (not in a round). Nearest centre wins; a critter wins only when ≥ critterK × closer.
   */
  P.pointerDown = function (x, y) {
    if (this._g || (this.state !== 'round' && this.state !== 'roundDone')) return null;
    this.finger.x = x; this.finger.y = y; this.finger.down = true;
    var L = this.layout, g = this._g = { x0: x, y0: y, x: x, y: y, t: this.time, judged: false, kind: 'gesture', maxD: 0, result: null, soft: false, contacted: false };
    var play = this.interactive;
    // assist: the next press anywhere in the water (or on Tibo: he helps) picks the target
    if (play && this.assistId && (inBox(L.band, x, y) || (this.cfg.assistTibo && inBox(L.tiboBox, x, y)))) {
      this._touch();
      var a = this.memberById(this.assistId), under = this._memberNear(x, y).m;
      if (a && (a.state === 'swim' || a.state === 'dart')) { this._contact(a, g, under ? under.id : null); return (g.result = 'member'); }
    }
    var near = this._memberNear(x, y), cr = this._critterAt(x, y);
    // critter / Tibo taps never restart the idle clock (a child who only pokes Tibo still gets nudges, hints and the assist)
    if (cr && (!near.m || cr.d * this.cfg.critterK < near.d)) { this._tapCritter(cr); g.kind = 'critter'; g.contacted = true; return (g.result = 'critter'); }
    var m = near.m;
    if (m || !inBox(L.tiboBox, x, y)) this._touch();
    if (m) {
      if (play && (m.state === 'swim' || m.state === 'dart')) { this._contact(m, g); return (g.result = 'member'); }
      g.contacted = true;
      m.qV += kickFor(this.cfg.brushKick, this.cfg.squashOmega, this.cfg.squashZeta);
      this._emit({ type: 'wiggle', id: m.id, early: true, x: m.x, y: m.y });
      return (g.result = 'brush');
    }
    if (inBox(L.tiboBox, x, y)) { g.kind = 'tibo'; return (g.result = 'tibo'); }
    if (this.state === 'round' && this.phase === 'enter') { this._emit({ type: 'soft', kind: 'early', x: x, y: y }); return (g.result = 'early'); }
    var water = y >= L.surfaceY;
    if (water) { this._puffBubbles(x, y, 3); if (y < L.surfaceY + 60) this._ripple(x, L.surfaceY, 0.6); }
    else this._puff(x, y);
    this._emit({ type: 'soft', kind: water ? 'water' : 'sky', x: x, y: y });
    g.soft = true;
    return (g.result = 'soft');
  };
  /** A finger slide: a press that started on nothing and moves onto a fish within 0.25 s is judged on that fish. */
  P.pointerMove = function (x, y) {
    var g = this._g;
    if (!g) return;
    g.maxD = Math.max(g.maxD, hyp(x - g.x0, y - g.y0));
    this.finger.x = x; this.finger.y = y;
    if (g.soft && !g.contacted && this.time - g.t <= this.cfg.flickTime + 1e-9 && this.interactive) {
      var best = null, bs = 2;
      for (var i = 0; i < this.members.length; i++) {
        var m = this.members[i];
        if (m.state !== 'swim' && m.state !== 'dart') continue;
        var s = segHit(g.x, g.y, x, y, m.x, m.y, this._hitR(m));
        if (s >= 0 && s < bs) { bs = s; best = m; }
      }
      if (best) this._contact(best, g);
    }
    g.x = x; g.y = y;
  };
  /** → 'pokeTibo' | 'up' | null */
  P.pointerUp = function (x, y) {
    var g = this._g;
    this._g = null; this.finger.down = false;
    if (!g) return null;
    if (x === undefined) { x = g.x; y = g.y; }
    var mv = Math.max(g.maxD, hyp(x - g.x0, y - g.y0));
    if (g.soft && !g.contacted && this.interactive && !this._nearCritter(g.x0, g.y0)) this._noProgress(false);
    if (g.kind === 'tibo' && mv < this.tapMoveMax() && (this.state === 'round' || this.state === 'roundDone')) return this._pokeTibo() || 'up';
    return 'up';
  };
  P.tapMoveMax = function () { return Math.max(this.cfg.tapMovePx, this.cfg.tapMoveCss / Math.max(0.05, this._viewScale)); };
  P.setViewScale = function (s) { this._viewScale = +s > 0 ? +s : 1; };
  P._nearCritter = function (x, y) {
    var c = this.critter, k;
    if (!c) return false;
    var r = c.r * this.cfg.critterSoftK;
    if (c.kind === 'fireflies') { for (k = 0; k < (c.flies || []).length; k++) if (hyp(x - c.flies[k].x, y - c.flies[k].y) <= r) return true; return false; }
    return hyp(x - c.hx, y - c.hy) <= r;
  };
  /** The finger left (touchcancel / pause / rotation): the gesture ends without a judgement. */
  P.cancelDrag = function () { this._g = null; this.finger.down = false; };

  P._contact = function (m, g, from) {
    g.contacted = true; g.judged = true;
    if (from !== undefined) { this._roundAssisted = true; this._emit({ type: 'assist', id: m.id, from: from, x: m.x, y: m.y }); }
    if (m.target) this._right(m); else this._wrong(m);
    return 'member';
  };
  P._right = function (m) {
    var cur = this.cur, t = m.thing, cfg = this.cfg;
    this._answered = true; this.streak = 0; this._touch(); this.assistId = null; this.hintHand = null;
    m._flashT = 1; m._glowT = 0; m._alertT = cfg.alertTime; m.alert = 1;
    m.qV += kickFor(0.1, cfg.squashOmega, cfg.squashZeta);
    var ev = { type: 'right', id: m.id, thing: t, rule: cur.rule, misses: this.misses, lily: clamp(this.round, 0, 3), x: m.x, y: m.y };
    if (t.mark && t.mark.n !== undefined) ev.count = { n: t.mark.n };
    if (cur.rule.kind === 'home') ev.home = t.home;
    this._mood('cast'); this._bounce();
    this._lookX = m.x; this._lookT = 1.5;
    this._emit(ev);
    m.state = 'hooked';
    this.line.id = m.id; this.line.state = 'rest'; this.line.len = cfg.restLine;
    this._cast = { t: 0, released: false, x0: 0, y0: 0, x1: 0, y1: 0, vx: 0, vy: 0, g: 0, T: 0, ft: 0, st: 0 };
    this._setPhase('cast');
  };
  P._wrong = function (m) {
    var cfg = this.cfg, cur = this.cur, t = m.thing;
    this._lookX = m.x; this._lookT = 1.2;
    if (this.time - m._lastWrongT < cfg.sameWrongWindow) {   // the same fish again within 1 s of its counted miss: just wiggles
      m.qV += kickFor(cfg.brushKick, cfg.squashOmega, cfg.squashZeta);
      this._emit({ type: 'wiggle', id: m.id, repeat: true, x: m.x, y: m.y });
      this._noProgress(false);
      return;
    }
    m._lastWrongT = this.time;
    this.misses++; this.streak++;
    this._mood('oops');
    this._dart(m, this.finger.x);
    var ev = { type: 'wrong', id: m.id, thing: t, got: { nameKind: t.nameKind, nameValue: t.nameValue }, want: { kind: cur.rule.kind, value: cur.rule.value,
      nameKind: cur.rule.nameKind, promptKey: cur.promptKey, params: cur.params }, streak: this.streak, misses: this.misses, x: m.x, y: m.y };
    this._emit(ev);
    var h0 = this._lastHintT;
    this._noProgress(true);
    if (this._lastHintT !== h0) ev.hint = true;
  };
  /** A startled dart away from the finger (3× speed for 0.4 s, stretch, 3 bubbles); never out of its lane range. */
  P._dart = function (m, fx) {
    var cfg = this.cfg, R = this._range(m.lane), dir = fx <= m.x ? 1 : -1;
    var room = dir > 0 ? R.cx1 - m.x : m.x - R.cx0, need = cfg.dartK * m.cruise * cfg.dartTime * 0.6;
    if (room < need && (dir > 0 ? m.x - R.cx0 : R.cx1 - m.x) > room) dir = -dir;
    m.state = 'dart'; m._dartT = 0; m._dartDir = dir;
    if (sgn(m.dir) !== dir) this._turn(m, dir, cfg.dartTurn); else m.face = dir;
    m.qV += kickFor(cfg.dartKick, cfg.squashOmega, cfg.squashZeta);
    var mo = this.mouthOf(m);
    this._puffBubbles(mo.x, mo.y, cfg.dartBubbles);
  };
  P._noProgress = function (miss) {
    var cfg = this.cfg;
    this._noProg++;
    if ((miss && this.misses >= cfg.hintAfterMisses) || this._noProg >= cfg.hintAfterSoft) this._autoHint(false);
    if (this._noProg >= cfg.assistAfter && !this.assistId && this.time - this._playT0 >= cfg.assistMinPlay - 1e-9) {
      var a = this.target;
      if (a && (a.state === 'swim' || a.state === 'dart')) { this.assistId = a.id; this._emit({ type: 'assistArmed', id: a.id, x: a.x, y: a.y }); }
    }
  };
  P._pokeTibo = function () {
    var M = this._mouth(), a = this.prompt();
    if (this.interactive) { this._pokes = (this._pokes || 0) + 1; if (this._pokes % this.cfg.pokeNoProgress === 0) this._noProgress(false); }
    if (this.tibo.mood === 'idle' || this.tibo.mood === 'talk' || this.tibo.mood === 'think') this._mood('talk', 1.0);
    this._bounce();
    var ev = { type: 'pokeTibo', x: M.x, y: M.y };
    if (a) { ev.promptKey = a.promptKey; ev.params = a.params; ev.rule = a.rule; } else ev.busy = true;
    this._emit(ev);
    return 'pokeTibo';
  };

  // ---------------------------------------------------------------- fx lists (render draws them via FishArt)
  P._puff = function (x, y) { this.puffs.push({ x: x, y: y, t: 0, T: this.cfg.puffTime, r: 14, alpha: 1 }); };
  P._ripple = function (x, y, k) {
    if (this.ripples.length >= this.cfg.rippleCap) this.ripples.shift();
    this.ripples.push({ x: x, y: y, r: this.cfg.rippleR[0], a: 0.9, t: 0, k: k || 1 });
  };
  P._splash = function (x, y, s, kind, id) {
    if (this.splashes.length >= this.cfg.splashCap) this.splashes.shift();
    this.splashes.push({ x: x, y: y, s: s, u: 0, t: 0 });
    this._ripple(x, y, s); if (s >= 1) this._ripple(x, y, 0.6 * s);
    var e = { type: 'splash', x: x, y: y, s: s, big: s >= 1, kind: kind || 'splash' };
    if (id) e.id = id;
    this._emit(e);
  };
  P._bubble = function (x, y, r) {
    var L = this.layout, c = this._crng;
    if (y <= L.surfaceY + 4) return;
    if (this.bubbles.length >= this.cfg.bubbleCap) this.bubbles.shift();
    this.bubbles.push({ x: x, y: y, r: r || c.float(4, 8), vy: -c.float(45, 75), vx: c.float(-6, 6), a: 0.85, ph: c.float(0, TAU), t: 0 });
  };
  P._puffBubbles = function (x, y, n) { for (var i = 0; i < n; i++) this._bubble(x + this._crng.float(-10, 10), y + this._crng.float(-8, 8), this._crng.float(4, 9)); };
  P._stepFx = function (h) {
    var cfg = this.cfg, L = this.layout, i, o, u;
    for (i = this.ripples.length - 1; i >= 0; i--) {
      o = this.ripples[i]; o.t += h; u = o.t / cfg.rippleTime;
      o.r = lerp(cfg.rippleR[0], cfg.rippleR[1] * o.k, 1 - (1 - u) * (1 - u)); o.a = 0.9 * (1 - u);
      if (u >= 1) this.ripples.splice(i, 1);
    }
    for (i = this.splashes.length - 1; i >= 0; i--) { o = this.splashes[i]; o.t += h; o.u = o.t / cfg.splashTime; if (o.u >= 1) this.splashes.splice(i, 1); }
    for (i = this.bubbles.length - 1; i >= 0; i--) {
      o = this.bubbles[i]; o.t += h;
      o.y += o.vy * h; o.x += (o.vx + 14 * Math.sin(o.ph + o.t * 5)) * h; o.vx *= Math.pow(0.3, h);
      if (o.y <= L.surfaceY + 2) this.bubbles.splice(i, 1);
      else o.a = Math.min(0.85, (o.y - L.surfaceY) / 20);
    }
    for (i = this.puffs.length - 1; i >= 0; i--) {
      o = this.puffs[i]; o.t += h; u = o.t / o.T; o.alpha = 1 - u; o.r = 14 + 22 * smooth(u);
      if (u >= 1) this.puffs.splice(i, 1);
    }
  };

  // ---------------------------------------------------------------- help
  P.resetNudges = function () {
    this._idleT = 0; this._idleGap = this.cfg.idleTime; this._idleN = 0;
    this._talkAskT = 0; this._talkAsks = 0;
    if (this.talk) this.talk.glowAnswer = false;
  };
  P._glowing = function () { for (var i = 0; i < this.members.length; i++) if (this.members[i]._glowT > 0) return true; return false; };
  P._autoHint = function (fromIdle) {
    if (this._glowing() || this.hintHand || this.time - this._lastHintT < this.cfg.hintCooldown) return null;
    return this._doHint(fromIdle);
  };
  P._doHint = function (fromIdle) {
    var m = this.target, cfg = this.cfg, cur = this.cur;
    if (!m || !this.interactive || (m.state !== 'swim' && m.state !== 'dart')) return null;
    m._glowT = cfg.hintTime;
    this.hintHand = { id: m.id, mode: 'tap', x: m.x, y: m.y, _px: m.x, _py: m.y, t: 0, press: 0, alpha: 0, time: 0, T: cfg.hintTime };
    this._stepHint(0);
    this._lastHintT = this.time;
    this._mood('think', 1.2);
    var ev = { type: 'hint', id: m.id, mode: 'tap', x: m.x, y: m.y, want: { kind: cur.rule.kind, value: cur.rule.value, nameKind: cur.rule.nameKind, promptKey: cur.promptKey, params: cur.params } };
    if (fromIdle) ev.idle = true;
    this._emit(ev);
    return { member: m.id };
  };
  /** Manual hint (a tap on the bubble): the target glows + slows, the ghost hand taps it. */
  P.hint = function () {
    if (!this.interactive) return null;
    if (this.hintHand) return { member: this.hintHand.id };
    return this._doHint(false);
  };
  /** Ghost hand (1.6 s cycle): glides in from below-right of the SWIMMING target, taps it twice, drifts back fading. Fingertip = (x, y). */
  P._stepHint = function (h) {
    var H = this.hintHand, cfg = this.cfg;
    if (!H) return;
    H.time += h;
    var m = this.memberById(H.id);
    if (!m || (m.state !== 'swim' && m.state !== 'dart') || H.time >= H.T || !this.interactive) { this.hintHand = null; return; }
    var tx = m.x + 6, ty = m.y + 10;
    var u = (H.time % cfg.hintCycle) / cfg.hintCycle, ox = tx + 64, oy = ty + 104, x, y, press = 0, fade = 1;
    if (u < 0.25) { var v = smooth(u / 0.25); x = lerp(ox, tx, v); y = lerp(oy, ty, v); }
    else if (u < 0.65) { var k = (u - 0.25) / 0.2, tap = Math.sin(Math.PI * (k % 1)); press = tap; x = tx; y = ty + 8 * (1 - tap); }
    else { var w2 = smooth((u - 0.65) / 0.35); x = lerp(tx, ox, w2); y = lerp(ty, oy, w2); fade = 1 - 0.9 * w2; }
    H.alpha = clamp(H.time / 0.25, 0, 1) * clamp((H.T - H.time) / 0.35, 0, 1) * fade;
    H.x = x; H.y = y; H.t = u; H.press = press;
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
  P._twin = function (m) { m._px = m.x; m._py = m.y; m._prot = m.rot; m._psx = m.sx; m._psy = m.sy; m._pscale = m.scale; m._palpha = m.alpha; };
  P._twins = function () {
    var i, o;
    for (i = 0; i < this.members.length; i++) this._twin(this.members[i]);
    var ln = this.line;
    ln._ptip = { x: ln.tip.x, y: ln.tip.y }; ln._phook = { x: ln.hook.x, y: ln.hook.y }; ln._pslack = ln.slack; ln._pbend = ln.bend; ln._prodAngle = ln.rodAngle;
    for (i = 0; i < this.lilies.length; i++) this.lilies[i]._popen = this.lilies[i].open;
    this._ppondFull = this.pondFull;
    if (this.badge) this.badge._pa = this.badge.a;
    var c = this.critter;
    if (c) { c._px = c.x; c._py = c.y; if (c.flies) c.flies.forEach(function (q) { q._px = q.x; q._py = q.y; }); }
    if (this.hintHand) { this.hintHand._px = this.hintHand.x; this.hintHand._py = this.hintHand.y; }
    this.tibo._pbounce = this.tibo.bounce;
    void o;
  };
  P._step = function (h) {
    var cfg = this.cfg;
    this._twins();
    this.time += h; this.stateTime += h; this.phaseTime += h;
    this._stepLine(h);   // rod springs + the tip first: the cast / reel / hanging fish use this step's tip
    switch (this.state) {
      case 'intro': if (this.stateTime >= cfg.introTime) this._beginRound(); break;
      case 'round': case 'roundDone': this._stepRound(h); break;
      case 'talk':
        if (this.talkAnswered) { if (this.stateTime >= cfg.talkAfterAnswer) this._levelDone(); break; }
        this._talkAskT += h;
        if (this._talkAsks < cfg.talkMaxAsks && this._talkAskT >= cfg.talkAskTime - 1e-9) {
          this._talkAskT = 0; this._talkAsks++;
          if (this._talkAsks >= cfg.talkGlowAfterAsks) this.talk.glowAnswer = true;
          this._emit({ type: 'talkAsk', talk: this.talk, n: this._talkAsks, glowAnswer: this.talk.glowAnswer });
        } else if (this._talkAsks >= cfg.talkMaxAsks && this._talkAskT >= cfg.talkGiveUp - 1e-9) this.talkAnswer(this.talk.answer, true);
        break;
      case 'levelDone':
        if (this.stateTime >= cfg.levelDoneTime) {
          if (this.level < this.levels.length - 1) this.startLevel(this.level + 1);
          else {
            this._setState('sessionDone'); this.phase = null;
            this.lastTopics = this.levels.slice();
            this._emit({ type: 'sessionDone', stars: this.stars });
          }
        }
        break;
    }
    if (this.state === 'round' || this.state === 'roundDone') { this._stepMembers(h); this._stepCritter(h); this._stepHint(h); }
    this._stepLilies(h); this._stepFx(h); this._stepTibo(h);
  };

  P._stepRound = function (h) {
    var cfg = this.cfg, self = this;
    switch (this.phase) {
      case 'enter':
        this.members.forEach(function (m) {
          if (!m._spawned && self.phaseTime >= m._spawnAt - 1e-9) { m._spawned = true; self._emit({ type: 'enterSwim', id: m.id, x: clamp(m.x, 0, self.layout.W), y: m.y }); }
        });
        if (this.phaseTime >= cfg.enterMin && this.members.every(function (m) { return m.state === 'swim'; })) { this._setPhase('play'); this._playT0 = this.time; this._ask(true); }
        break;
      case 'play':
        if (!this._g) {
          this._idleT += h;
          if (this._idleT >= this._idleGap - 1e-9) {
            this._idleT = 0; this._idleGap = Math.min(cfg.idleMax, this._idleGap * cfg.idleBackoff); this._idleN++;
            this._mood('think');
            var M = this._mouth();
            this._emit({ type: 'idle', n: this._idleN, promptKey: this.cur.promptKey, params: this.cur.params, rule: this.cur.rule, x: M.x, y: M.y });
            if (this._idleN >= cfg.idleHintFrom) this._autoHint(true);
          }
        }
        break;
      case 'cast': this._stepCast(h); break;
      case 'reel': case 'show': this._stepReel(h); break;
      case 'release': this._stepRelease(h); break;
      case 'joy': this._stepJoy(h); break;
      case 'leave': this._stepLeave(h); break;
    }
  };
  P._starsFor = function (m) { return m <= 0 ? 3 : m === 1 ? 2 : 1; };

  // ---------------------------------------------------------------- cast → bite
  /** Ballistic hook flight from the rod tip to the surface above the fish's (predicted) mouth: apex ≥ hookApex above the tip. */
  P._flyAim = function (m, keepT) {
    var C = this._cast, L = this.layout, cfg = this.cfg, ln = this.line;
    if (!m) return;
    var mo = this.mouthOf(m), px = clamp(mo.x + m.vx / cfg.hookStopK, L.swim.x0, L.swim.x1);
    var T = keepT ? Math.max(0.2, C.T - C.ft) : cfg.hookFly, x0 = keepT ? ln.hook.x : ln.tip.x, y0 = keepT ? ln.hook.y : ln.tip.y;
    // apex hookApex above the release point, but never above the top of the safe area
    // apex hookApex above the release point, never above the safe area; lowered until the sampled arc clears the speech bubble
    var B = L.bubble, y1 = L.surfaceY, dy = y1 - y0, room = y0 - L.ins.top - cfg.hookTopGap, aMin = clamp(room, 6, cfg.hookApexMin), H0 = clamp(Math.min(cfg.hookApex, room), aMin, cfg.hookApex), s, g;
    for (var tries = 0; tries < 8; tries++) {
      s = (Math.sqrt(2 * H0) + Math.sqrt(Math.max(0, 2 * H0 + 2 * dy))) / T; g = s * s;   // ½T²·s² − √(2H)·T·s − Δy = 0 (s = √g)
      var vy0 = -Math.sqrt(2 * g * H0), vx0 = (px - x0) / T, hit = false;
      for (var q = 1; q < 12 && !hit; q++) { var tq = T * q / 12, hx = x0 + vx0 * tq, hy = y0 + vy0 * tq + 0.5 * g * tq * tq; hit = hx > B.x - 6 && hx < B.x + B.w + 6 && hy < B.y + B.h + 6; }
      if (!hit || H0 <= aMin) break;
      H0 = Math.max(aMin, H0 * 0.7);
    }
    C.x0 = x0; C.y0 = y0; C.x1 = px; C.y1 = y1; C.g = g; C.vy = -Math.sqrt(2 * g * H0); C.vx = (px - x0) / T; C.T = T; C.ft = 0;
  };
  P._stepCast = function (h) {
    var C = this._cast, cfg = this.cfg, ln = this.line, m = this.memberById(ln.id), L = this.layout;
    if (!C || !m) {   // safety net: back to play, nobody left hooked
      this.members.forEach(function (q) { if (q.state === 'hooked') { q.state = 'swim'; q.alert = 0; } });
      this._cast = null; this._lineFree(); this._setPhase('play'); this._answered = false; this._mood('idle', 0.1); return;
    }
    C.t += h;
    if (!C.released && C.t >= cfg.castWindup + cfg.castRelease * cfg.castWhip - 1e-9) {   // the line leaves mid-whip
      C.released = true; ln.state = 'fly';
      this._flyAim(m, false);
      this._emit({ type: 'cast', id: m.id, x: ln.tip.x, y: ln.tip.y });
    }
    if (ln.state === 'fly') {
      C.ft += h;
      var u = Math.min(C.ft, C.T);
      ln.hook.x = C.x0 + C.vx * u; ln.hook.y = C.y0 + C.vy * u + 0.5 * C.g * u * u;
      ln.slack = 26 * (1 - clamp(C.ft / C.T, 0, 1)) + 8;
      if (C.ft >= C.T - 1e-9) {
        ln.hook.x = C.x1; ln.hook.y = L.surfaceY; ln.state = 'sink'; C.st = 0; C.x0 = C.x1; C.y0 = L.surfaceY;
        this._ripple(C.x1, L.surfaceY, 0.7);
        this._emit({ type: 'plop', id: m.id, x: C.x1, y: L.surfaceY });
      }
    } else if (ln.state === 'sink') {
      C.st += h;
      var us = clamp(C.st / cfg.sinkTime, 0, 1), mo = this.mouthOf(m), e = smooth(us);
      ln.hook.x = lerp(C.x0, mo.x, e) + cfg.sinkSway * Math.sin(TAU * 2.5 * C.st) * (1 - us);
      ln.hook.y = lerp(C.y0, mo.y, e);
      ln.slack = 8 * (1 - us);
      if (us >= 1) this._bite(m);
    }
  };
  P._bite = function (m) {
    var cfg = this.cfg, L = this.layout, ln = this.line;
    ln.state = 'taut'; ln.slack = 0;
    m.qV += kickFor(cfg.biteKick, cfg.squashOmega, cfg.squashZeta);
    var mo = this.mouthOf(m);
    this._emit({ type: 'bite', id: m.id, x: mo.x, y: mo.y });
    this._puffBubbles(mo.x, mo.y, 2);
    // the reel path: a curve up and toward the exit point (θ0 right of the reel-pose tip), the fish facing the pull
    var tip = rodTip(L.rodBase, L.rodLen, cfg.rodShow, cfg.bendShow);
    var ex = clamp(tip.x + (L.surfaceY - tip.y) * Math.tan(cfg.exitTheta), L.swim.x0 + 20, L.swim.x1 - 20);
    var pull = Math.abs(ex - m.x) < 40 ? -1 : sgn(ex - m.x);
    if (sgn(m.dir) !== pull) this._turn(m, pull, cfg.turnTime); else m.face = pull;
    m.state = 'reel'; m.wriggle = 1;
    this._reel = { stage: 'under', t: 0, x0: m.x, y0: m.y, ex: ex, T: 1, trail: 0, airT: 0, showT: 0, counted: false, homed: false };
    this._reelPath(m);
    this._mood('reel', 30);
    this._setPhase('reel');
    this._emit({ type: 'reel', id: m.id, x: m.x, y: m.y });
  };
  P._reelPath = function (m) {
    var R = this._reel, L = this.layout, cfg = this.cfg;
    var mo = this.mouthOf(m);
    R.x0 = mo.x; R.y0 = mo.y; R.ey = L.surfaceY;   // the MOUTH runs along the path (the line pulls it)
    R.cx = lerp(R.x0, R.ex, 0.15); R.cy = lerp(R.y0, R.ey, 0.7);
    var d = hyp(R.ex - R.x0, R.ey - R.y0);
    R.T = clamp(d / cfg.reelUnderV, cfg.reelUnderT[0], cfg.reelUnderT[1]); R.t = 0;
  };
  /** Re-layout during reel / show: under water the path restarts from here to the new exit; in the air the pendulum keeps its
   *  angle under the new tip (the fish re-hangs from the hook), the line clamped to the new show length. */
  P._reelRelayout = function (m) {
    var R = this._reel, L = this.layout, cfg = this.cfg;
    if (!R) return;
    if (R.stage === 'under') {
      var tip = rodTip(L.rodBase, L.rodLen, cfg.rodShow, cfg.bendShow);
      R.ex = clamp(tip.x + (L.surfaceY - tip.y) * Math.tan(cfg.exitTheta), L.swim.x0 + 20, L.swim.x1 - 20);
      var hl = 0.5 * this._len(m);
      m.x = clamp(m.x, L.ins.left + hl, L.W - L.ins.right - hl); m.y = clamp(m.y, L.surfaceY + 10, L.H - L.ins.bottom - 0.3 * L.size);
      this._reelPath(m);
    } else {
      var ln = this.line;
      ln.tip = rodTip(L.rodBase, L.rodLen, ln.rodAngle, ln.bend);
      ln.len = clamp(ln.len, L.lineShow, Math.max(L.lineShow, L.surfaceY - ln.tip.y));
      this._hang(m);
    }
  };
  /** The fish hangs from the hook at the end of the pendulum line (hook = tip + len·(sin θ, cos θ)); its body follows the line. */
  P._hang = function (m) {
    var ln = this.line, cfg = this.cfg;
    ln.hook.x = ln.tip.x + ln.len * Math.sin(ln.theta); ln.hook.y = ln.tip.y + ln.len * Math.cos(ln.theta);
    var v = this._anchor(m);
    m.x = ln.hook.x - v.x; m.y = ln.hook.y - v.y;
    void cfg;
  };
  P._stepReel = function (h) {
    var R = this._reel, cfg = this.cfg, L = this.layout, ln = this.line, m = this.memberById(ln.id);
    if (!R || !m) return;
    R.t += h;
    if (R.stage === 'under') {
      var tau = clamp(R.t / R.T, 0, 1), u = 0.35 * tau + 0.65 * tau * tau;
      var p = bez(R.x0, R.y0, R.cx, R.cy, R.ex, R.ey, u), d = bezD(R.x0, R.y0, R.cx, R.cy, R.ex, R.ey, Math.max(0.02, u));
      var dl = Math.max(1e-6, hyp(d.x, d.y)), nx = -d.y / dl, ny = d.x / dl, wob = 10 * Math.sin(TAU * 3.5 * R.t) * (1 - tau);
      // the MOUTH follows the path (the line pulls it); the body trails
      var dir = sgn(m.dir), rt = dir > 0 ? Math.atan2(d.y, d.x) : Math.atan2(-d.y, -d.x);
      m.rotT = clamp(rt, -cfg.thetaMax, cfg.thetaMax);
      var v = this._anchor(m);
      m.x = p.x + nx * wob - v.x; m.y = p.y + ny * wob - v.y;
      var hl = 0.5 * this._len(m);
      m.x = clamp(m.x, L.ins.left + hl, L.W - L.ins.right - hl); m.y = clamp(m.y, L.surfaceY - 0.3 * L.size, L.H - L.ins.bottom - 0.3 * L.size);
      m.vx = d.x * (0.35 + 1.3 * tau) / R.T; m.vy = d.y * (0.35 + 1.3 * tau) / R.T;
      var mo = this.mouthOf(m); ln.hook.x = mo.x; ln.hook.y = mo.y;
      R.trail += h;
      if (R.trail >= cfg.trailEvery) { R.trail = 0; this._bubble(m.x - dir * 0.5 * this._len(m), m.y, this._crng.float(3, 7)); }
      if (tau >= 1) {   // breaks the surface: splash, then the pendulum
        R.stage = 'air'; R.airT = 0;
        m.above = true;
        this._splash(ln.hook.x, L.surfaceY, 1, 'exit', m.id);
        var tip = ln.tip, dx = ln.hook.x - tip.x, dy = ln.hook.y - tip.y;
        ln.len = Math.max(L.lineShow, hyp(dx, dy)); ln.theta = Math.atan2(dx, dy);
        var vx = m.vx, vy = m.vy;
        ln.thetaV = clamp(cfg.exitSwingK * (vx * Math.cos(ln.theta) - vy * Math.sin(ln.theta)) / ln.len, -cfg.exitSwingMax, cfg.exitSwingMax);
        if (sgn(m.dir) > 0) this._turn(m, -1, cfg.turnTime);   // face Tibo while hanging
        this._emit({ type: 'surface', id: m.id, x: ln.hook.x, y: L.surfaceY });
      }
      return;
    }
    // ---- in the air: a damped pendulum from the (moving) rod tip with a shortening line
    R.airT += h;
    var ap = this._tipAcc || { x: 0, y: 0 }, th = ln.theta;
    var Ld = 0;
    if (this.phase === 'reel') {
      var rem = ln.len - L.lineShow;
      Ld = -cfg.reelSpeed * clamp(rem / 30, 0, 1) * smooth(R.airT / 0.25);
    }
    var acc = (-cfg.pendG * Math.sin(th) - 2 * Ld * ln.thetaV  - ap.x * Math.cos(th) + ap.y * Math.sin(th)) / Math.max(20, ln.len) - (this.phase === 'reel' ? cfg.pendDampReel : cfg.pendDamp) * ln.thetaV;
    ln.thetaV += acc * h; ln.theta += ln.thetaV * h;
    if (Math.abs(ln.theta) > cfg.thetaMax) { ln.theta = sgn(ln.theta) * cfg.thetaMax; ln.thetaV *= -0.3; }
    ln.len = Math.max(L.lineShow, ln.len + Ld * h);
    var hang = m.thing.kind === 'bubble' ? 0 : -cfg.hangRot * m.dir;   // head up (continuous through the turn to face Tibo)
    m.wriggle += ((this.phase === 'show' ? cfg.wriggleShow : cfg.wriggleAir) - m.wriggle) * Math.min(1, h * 2);
    m.rotT = hang - ln.theta * 0.9 + cfg.wriggleAmp * m.wriggle * Math.sin(TAU * cfg.wriggleHz * R.airT);
    m.vx = 0; m.vy = 0;
    this._hang(m);
    if (this.phase === 'reel' && ln.len <= L.lineShow + 0.5 && R.airT >= cfg.reelMinT) {
      this._setPhase('show'); R.showT = 0;
      this._mood('happy', 30); this._bounce();
      m.state = 'show';
      this._emit({ type: 'show', id: m.id, x: m.x, y: m.y });
      if (this.cur.rule.kind === 'home') {
        this.badge = { home: m.thing.home, id: m.id, a: 0, _pa: 0, t: 0, x: 0, y: 0 };
        this._placeBadge();
        this._emit({ type: 'home', home: m.thing.home, id: m.id, x: this.badge.x, y: this.badge.y });
      }
      if (m.thing.mark && m.thing.mark.n !== undefined) { m.count = 0; R.countAt = this.time + cfg.countDelay; }
    } else if (this.phase === 'show') {
      R.showT += h;
      var n = m.thing.mark && m.thing.mark.n !== undefined ? m.thing.mark.n : 0, T = n ? n * cfg.countStep + cfg.countTail + cfg.countDelay : cfg.showTime;
      if (n && m.count < n && this.time >= R.countAt) {
        var k = Math.min(n, Math.floor((this.time - R.countAt) / cfg.countStep + 1e-9) + 1);
        if (k > m.count) {
          m.count = k;
          m.qV += kickFor(0.04, cfg.squashOmega, cfg.squashZeta);
          this._emit({ type: 'count', id: m.id, i: k, n: n, x: m.x, y: m.y });
        }
      }
      if (R.showT >= T - 1e-9) this._roundDone(m);
    }
  };
  P._placeBadge = function () {
    var b = this.badge, L = this.layout;
    b.x = clamp(L.showPt.x + 0.5 * L.len + 56, L.ins.left + 60, L.W - L.ins.right - 60);
    b.y = clamp(L.showPt.y, Math.max(L.bubble.y + L.bubble.h, L.hud.y + L.hud.h) + 56, L.surfaceY - 50);
  };
  P._roundDone = function (m) {
    var st = this._starsFor(this.misses), cur = this.cur, cfg = this.cfg;
    if (this._roundAssisted) st = Math.min(st, this.cfg.assistMaxStars);   // an assisted round: 1★ (QA: mashing must not earn 2★)
    this.roundStars = st; this.stars += st; this.levelStars += st;
    var rk = cur.rule;
    this._prevRuleRun = this._prevRule && this._prevRule.kind === rk.kind && String(this._prevRule.value) === String(rk.value) ? this._prevRuleRun + 1 : 1;
    this._prevRule = { kind: rk.kind, value: rk.value };
    this.cancelDrag(); this.hintHand = null; this.assistId = null;
    this._setState('roundDone');
    this._emit({ type: 'roundDone', round: this.round, stars: st, misses: this.misses, assisted: !!this._roundAssisted, x: m.x, y: m.y });
    // release: the hook lets go, the fish leaps to the next lily spot; the others rise toward the surface for their joy jumps
    m.count = -1;
    this._lineFree();
    this._leapStart(m, false);
    this._mood('cheer', 2.2); this._bounce();
    this._setPhase('release');
    this._lilyAt = -1;
    this._emit({ type: 'release', id: m.id, x: m.x, y: m.y });
    void cfg;
  };
  /** The release leap: ballistic from where the fish hangs to lily[round] (apex ≤ leapApex, kept under the bubble), one flip. */
  P._leapStart = function (m, re) {
    var L = this.layout, cfg = this.cfg, i = clamp(this.round, 0, 3), lp = L.lilies[i], B = L.bubble;
    var x0 = clamp(m.x, L.ins.left, L.W - L.ins.right), y0 = clamp(m.y, L.ins.top + 0.5 * L.size, L.surfaceY - 4);
    var overlap = Math.max(x0, lp.x) + 0.5 * L.len > B.x && Math.min(x0, lp.x) - 0.5 * L.len < B.x + B.w;
    var ceil = (overlap ? B.y + B.h : L.ins.top) + 0.6 * L.size;
    var apex = clamp(Math.min(cfg.leapApex, Math.min(y0, lp.y) - ceil), cfg.leapApexMin, cfg.leapApex);
    var b = ballistic(x0, y0, lp.x, lp.y, cfg.leapG, apex);
    m.x = x0; m.y = y0; m.state = 'leap'; m.above = true;
    m._leap = { t: 0, T: b.T, x0: x0, y0: y0, vx: b.vx, vy: b.vy, g: b.g, i: i, rot0: re && m._leap ? m._leap.rot0 : m.rot % TAU, dir0: re && m._leap ? m._leap.dir0 : sgn(m.dir), spin: (b.vx >= 0 ? 1 : -1) * TAU * cfg.leapSpin };
    var d = b.vx >= 0 ? 1 : -1;
    if (sgn(m.dir) !== d) this._turn(m, d, cfg.dartTurn); else m.face = d;
  };
  P._stepRelease = function (h) {
    var cfg = this.cfg, self = this, L = this.layout;
    // the others swim up under the surface, ready to jump
    this.members.forEach(function (q) { if (q.state === 'swim' && !q.target) q._joyPrep = true; });
    if (this._lilyAt >= 0 && this.time >= this._lilyAt - 1e-9) {
      this._lilyAt = -2;
      var m = this.memberById(this.cur.targetId), i = clamp(this.round, 0, 3), q = this.lilies[i], t = m ? m.thing : {};
      q.target = 1; q.color = t.color || (t.mark && t.mark.color) || null;
      q.openV += 0;
      this._emit({ type: 'lily', i: i, x: q.x, y: q.y, color: q.color });
      this._startJoy();
    }
    void self; void L;
  };
  P._startJoy = function () {
    var ms = this.members.filter(function (m) { return m.state === 'swim' && !m.target; }).sort(function (a, b) { return a.x - b.x; });
    this._joy = { list: ms.map(function (m) { return m.id; }), i: 0, next: 0, landed: 0 };
    this._setPhase('joy');
    this._mood('happy', 2);
  };
  P._stepJoy = function (h) {
    var J = this._joy, cfg = this.cfg, L = this.layout;
    if (!J) { this._startLeave(); return; }
    while (J.i < J.list.length && this.phaseTime >= J.next - 1e-9) {
      var m = this.memberById(J.list[J.i]);
      if (m && m.state === 'swim' && m.y > L.surfaceY + cfg.joyReady * this._effSize(m) && this.phaseTime < cfg.joyMaxT - 1.2) break;   // still rising
      if (m && m.state === 'swim') this._joyJump(m, J.i, J.list.length);
      J.i++; J.next = this.phaseTime + cfg.joyGap;
    }
    var flying = this.members.some(function (q) { return q.state === 'joy'; });
    if ((J.i >= J.list.length && !flying && this.phaseTime >= J.next - cfg.joyGap + cfg.joyTail) || this.phaseTime >= cfg.joyMaxT) this._startLeave();
  };
  P._joyJump = function (m, i, n) {
    var cfg = this.cfg, L = this.layout, R = this._range(m.lane), r = this._crng;
    var apexY = L.surfaceY - r.float(cfg.joyH[0], cfg.joyH[1]), up = Math.max(30, m.y - apexY), vy = -Math.sqrt(2 * cfg.joyG * up);
    var T = 2 * Math.sqrt(2 * up / cfg.joyG), d = sgn(m.dir), vx = d * Math.max(cfg.joyVx, Math.abs(m.vx));
    if (m.x + vx * T > R.cx1 || m.x + vx * T < R.cx0) { vx = -vx; d = -d; }
    if (sgn(m.dir) !== d) this._turn(m, d, cfg.dartTurn);
    m.state = 'joy'; m._joyPrep = false;
    m._joy = { t: 0, x0: m.x, y0: m.y, vx: vx, vy: vy, rot0: m.rot, spin: d * TAU, T: T };
    this._emit({ type: 'joy', i: i, n: n, id: m.id, x: m.x, y: m.y });
  };
  P._startLeave = function () {
    var cfg = this.cfg, L = this.layout, self = this, n = 0;
    this._joy = null;
    this.members.forEach(function (m) {
      if (m.state === 'swim' || m.state === 'dart' || m.state === 'joy') {
        if (m.state === 'joy') { m.y = Math.max(m.y, L.surfaceY + 0.2 * L.size); m.above = false; }
        m.state = 'leave'; m._joyPrep = false; n++;
        var side = m.x < L.W / 2 ? -1 : 1;
        if (Math.abs(m.x - L.W / 2) < 0.15 * L.W) side = sgn(m.dir);
        m._side = side;
        if (sgn(m.dir) !== side) self._turn(m, side, cfg.leaveTurn); else m.face = side;
      }
    });
    this._critterLeave();
    this._setPhase('leave');
    var c = this._lakeCentre();
    this._emit({ type: 'leave', n: n, x: c.x, y: c.y });
  };
  P._stepLeave = function () {
    var cfg = this.cfg;
    var done = this.members.every(function (m) { return m.state === 'gone' || (m.state === 'away' && m.alpha < 0.05); });
    if (done || this.phaseTime >= cfg.leaveMax) this._afterLeave();
  };
  /** After the leave: the next round, or (round 4 / the chapter ran long) the pond is full (lilies sway + sparkle), then Talk. */
  P._afterLeave = function () {
    var cfg = this.cfg, L = this.layout, self = this;
    var nxt = this.round + 1, el = this.time - this.levelStartTime;
    var long = (nxt >= cfg.chapterMinRounds && el > cfg.chapterTimeLimit) || (nxt >= cfg.chapterHardMinRounds && el > cfg.chapterHardLimit);
    if (nxt < this.roundsPerLevel && !long) { this._clearRound(true); this.cur = null; this.round = nxt; this._beginRound(); return; }
    if (this._pondAt < 0) {
      this._pondAt = this.time;
      this.members.forEach(function (m) { m.state = 'gone'; m.alpha = 0; });
      // a chapter cut short: the lilies still closed open in gold, so the pond is full
      this.lilies.forEach(function (q, i) {
        if (q.target) return;
        q.target = 1; q.color = null;
        self._emit({ type: 'lily', i: i, x: q.x, y: q.y, color: null, auto: true });
      });
      this._mood('cheer', cfg.pondFullTime); this._bounce();
      this._emit({ type: 'pondFull', n: 4, x: (L.swim.x0 + L.swim.x1) / 2, y: L.surfaceY });
      return;
    }
    if (this.time - this._pondAt >= cfg.pondFullTime - 1e-9) {
      this._clearRound(true); this.cur = null; this.round = nxt;
      if (nxt < this.roundsPerLevel) this.roundsPerLevel = nxt;
      this._startTalk();
    }
  };

  // ---------------------------------------------------------------- the rod + line
  P._lineRest = function (snap) {
    var ln = this.line, L = this.layout, cfg = this.cfg;
    ln.state = 'rest'; ln.id = null; ln.slack = 0; ln.len = cfg.restLine;
    if (snap) {
      ln.rodAngle = cfg.rodRest; ln.rodV = 0; ln.bend = 0; ln.bendV = 0; ln.theta = 0; ln.thetaV = 0;
      ln.tip = rodTip(L.rodBase, L.rodLen, ln.rodAngle, ln.bend);
      ln.hook = { x: ln.tip.x, y: ln.tip.y + cfg.restLine };
      ln._ptip = { x: ln.tip.x, y: ln.tip.y }; ln._phook = { x: ln.hook.x, y: ln.hook.y };
    }
  };
  /** The hook lets go: the line springs back under the tip, the rod straightens with an overshoot. */
  P._lineFree = function () {
    var ln = this.line;
    ln.state = 'free'; ln.slack = 10; ln._fv = { x: 0, y: 0 };
  };
  P._stepLine = function (h) {
    var ln = this.line, cfg = this.cfg, L = this.layout, ph = this.phase, C = this._cast;
    // rod angle + bend targets per phase (springs)
    var aT = cfg.rodRest, bT = 0, w = cfg.rodOmega, z = cfg.rodZeta, bw = cfg.bendOmega, bz = cfg.bendZeta;
    var active = !!ln.id && this.state === 'round' && (ph === 'cast' || ph === 'reel' || ph === 'show') && ln.state !== 'free';
    if (active) {
      if (ph === 'cast') {
        var t = C ? C.t : 0;
        aT = t < cfg.castWindup ? cfg.rodWindup : t < cfg.castWindup + cfg.castWhip ? cfg.rodWhip : cfg.rodCast;
        bT = t < cfg.castWindup ? -0.15 : cfg.bendCast;
      } else if (ph === 'reel') {
        var R = this._reel, under = R && R.stage === 'under';
        aT = under ? cfg.rodReel : lerp(cfg.rodReel, cfg.rodShow, smooth((R ? R.airT : 0) / 0.6));
        bT = under ? cfg.bendReel : cfg.bendShow + 0.25 * clamp((ln.len - L.lineShow) / 60, 0, 1);
      } else if (ph === 'show') { aT = cfg.rodShow; bT = cfg.bendShow; }
    } else { w = cfg.rodBackOmega; z = cfg.rodBackZeta; bw = cfg.rodBackOmega; bz = cfg.rodBackZeta; }
    spring(ln, 'rodAngle', 'rodV', aT, w, z, h);
    spring(ln, 'bend', 'bendV', bT, bw, bz, h);
    ln.bend = clamp(ln.bend, -0.6, 1.2);
    var tip = rodTip(L.rodBase, L.rodLen, ln.rodAngle, ln.bend);
    // the tip's acceleration drives the hanging pendulum
    if (this._tipPrev) {
      var vx = (tip.x - this._tipPrev.x) / h, vy = (tip.y - this._tipPrev.y) / h;
      var M = cfg.pivotAccMax;
      this._tipAcc = { x: clamp((vx - this._tipV.x) / h, -M, M), y: clamp((vy - this._tipV.y) / h, -M, M) };
      this._tipV = { x: vx, y: vy };
    } else { this._tipAcc = { x: 0, y: 0 }; this._tipV = { x: 0, y: 0 }; }
    this._tipPrev = { x: tip.x, y: tip.y };
    ln.tip = tip;
    if (ln.state === 'rest') {   // the hook dangles a little below the tip, swinging gently
      var sw = cfg.restSwing * Math.sin(TAU * cfg.restSwingHz * this.time);
      ln.hook.x = tip.x + cfg.restLine * Math.sin(sw); ln.hook.y = tip.y + cfg.restLine * Math.cos(sw);
    } else if (ln.state === 'free') {
      var rx = tip.x, ry = tip.y + cfg.restLine, f = ln._fv || (ln._fv = { x: 0, y: 0 });
      f.x += (cfg.freeOmega * cfg.freeOmega * (rx - ln.hook.x) - 2 * cfg.freeZeta * cfg.freeOmega * f.x) * h;
      f.y += (cfg.freeOmega * cfg.freeOmega * (ry - ln.hook.y) - 2 * cfg.freeZeta * cfg.freeOmega * f.y) * h;
      ln.hook.x += f.x * h; ln.hook.y += f.y * h;
      ln.slack = Math.max(0, ln.slack - h * 12);
      if (hyp(rx - ln.hook.x, ry - ln.hook.y) < 2 && hyp(f.x, f.y) < 20) this._lineRest(false);
    }
  };
  P._stepLilies = function (h) {
    var c = this.cfg, self = this;
    this.lilies.forEach(function (q, i) {
      spring(q, 'open', 'openV', q.target || 0, c.lilyOmega, c.lilyZeta, h);
      if (q.open < 0) { q.open = 0; q.openV = 0; }
      q.sway = (0.04 + 0.08 * self.pondFull) * Math.sin(1.1 * self.time + q.ph);
    });
    var tw = this._pondAt >= 0 ? 1 : 0;
    this.pondFull += (tw - this.pondFull) * Math.min(1, h * (tw ? 6 : 2));
    if (this.badge) {
      var b = this.badge, T = c.badgeTime;
      b.t += h; b.a = clamp(Math.min(b.t / c.badgeFade, (T - b.t) / c.badgeFade), 0, 1);
      if (b.t >= T) this.badge = null;
    }
  };

  // ---------------------------------------------------------------- fish motion
  /** Start a U-turn toward `to` (±1): dir eases from ±1 through 0 to ∓1 (cos) over T s; the heading flips now. */
  P._turn = function (m, to, T) {
    if (m.turnT >= 0 && m.face === to) return;
    m.turnFrom = m.turnT >= 0 ? m.dir : sgn(m.dir); m.face = to; m.turnT = 0; m.turnDur = T || this.cfg.turnTime;
    if (sgn(m.turnFrom) === to) { m.turnT = -1; m.dir = to; }
  };
  P._pose = function (m) {
    var cfg = this.cfg;
    var st = 1 + cfg.squashSxK * m.q, sq = 1 - m.q;
    m.sx = m.dir * st; m.sy = sq;
  };
  /** Lane neighbour distance ahead (centre gap − neighK·mean length) for a fish heading `face`, or +∞. */
  P._gapAhead = function (m) {
    var best = 1e9, cfg = this.cfg;
    for (var i = 0; i < this.members.length; i++) {
      var o = this.members[i];
      if (o === m || o.lane !== m.lane || !LANE_STATES[o.state]) continue;
      var dx = (o.x - m.x) * m.face;
      if (dx <= 0) continue;
      var g = dx - cfg.neighK * 0.5 * (this._len(m) + this._len(o));
      if (g < best) best = g;
    }
    return best;
  };
  var LANE_STATES = { enter: 1, swim: 1, dart: 1, hooked: 1 };
  P._stepMembers = function (h) {
    var cfg = this.cfg, L = this.layout, self = this, fd = this.finger.down, fx = this.finger.x, fy = this.finger.y;
    for (var i = 0; i < this.members.length; i++) {
      var m = this.members[i];
      if (m.state === 'gone') continue;
      if (m.state === 'enter' && !m._spawned) { this._pose(m); continue; }
      var R = this._range(m.lane), len = this._len(m), s = this._effSize(m);
      // ---- speed factor (a held finger nearby, the hint, the assist), smoothed
      var slowT = 1;
      if (fd && hyp(fx - m.x, fy - m.y) < cfg.fingerR) slowT = cfg.fingerK;
      if (m.target && m._glowT > 0) slowT = Math.min(slowT, cfg.hintSlow);
      if (this.assistId === m.id) slowT = Math.min(slowT, cfg.assistSlow);
      m.slowK += (slowT - m.slowK) * (1 - Math.exp(-cfg.slowRate * h));
      var cruise = m.cruise * m.slowK, vdes = 0, k = cfg.velK, horiz = true;
      // ---- turns
      if (m.turnT >= 0) {
        m.turnT += h;
        var ut = clamp(m.turnT / m.turnDur, 0, 1);
        m.dir = m.turnFrom * Math.cos(Math.PI * ut);
        if (ut >= 1) { m.turnT = -1; m.dir = m.face; }
      }
      switch (m.state) {
        case 'enter': {
          var d = (m.xe - m.x) * m.face;
          if (d <= 0) { m.state = 'swim'; vdes = m.face * cruise; break; }
          var wk = Math.max(1, L.W / cfg.enterRefW);   // wide screens: the fish come from further, so faster
          vdes = m.face * Math.max(cruise, Math.min(cfg.enterVMax * wk, Math.sqrt(cruise * cruise + 2 * cfg.enterAcc * wk * d)));
          var ga = this._gapAhead(m);
          if (ga < 2 && m.x >= R.cx0 && m.x <= R.cx1) { m.state = 'swim'; vdes = 0; break; }   // blocked by a lane neighbour: it is in
          if (ga < 1e8) vdes = m.face * Math.min(Math.abs(vdes), Math.max(0, cruise * Math.sqrt(clamp(ga / (cfg.brakeL * len), 0, 1)) + 2 * Math.max(0, ga)));
          k = cfg.enterVelK;
          break;
        }
        case 'swim': case 'dart': {
          if (m.state === 'dart') {
            m._dartT += h;
            if (m._dartT >= cfg.dartTime) m.state = 'swim';
          }
          var dE = m.face > 0 ? R.cx1 - m.x : m.x - R.cx0, dN = this._gapAhead(m), dd = Math.min(dE, dN), brake = cfg.brakeL * len;
          if (m.state === 'dart') { vdes = m._dartDir * Math.min(cfg.dartK * m.cruise, Math.max(0, Math.sqrt(Math.max(0, dd) * 2 * 400))); k = cfg.dartVelK; }
          else if (m.turnT >= 0) { vdes = clamp(m.turnT / m.turnDur, 0, 1) < 0.4 ? 0 : m.face * cruise * 0.6; k = cfg.turnVelK; }
          else {
            vdes = m.face * cruise * Math.sqrt(clamp(dd / brake, 0, 1));
            if ((dd <= 1 && Math.abs(m.vx) < Math.max(10, 0.4 * cruise)) || dd < -2) this._turn(m, -m.face, cfg.turnTime);
          }
          break;
        }
        case 'hooked': vdes = 0; k = cfg.hookStopK; break;
        case 'leave': vdes = m._side * cfg.leaveV; k = cfg.leaveVelK;
          if (m.x < -0.7 * len || m.x > L.W + 0.7 * len) { m.state = 'gone'; m.alpha = 0; }
          break;
        default: horiz = false;
      }
      if (horiz) {
        m.vx += (vdes - m.vx) * (1 - Math.exp(-k * h));
        m.x += m.vx * h;
        if (m.state === 'swim' || m.state === 'dart' || m.state === 'hooked') {
          if (m.x < R.cx0 - 0.5) { m.x = Math.min(m.x + Math.max(40, Math.abs(m.vx)) * h, R.cx0); if (m.face < 0 && m.turnT < 0) this._turn(m, 1); }
          if (m.x > R.cx1 + 0.5) { m.x = Math.max(m.x - Math.max(40, Math.abs(m.vx)) * h, R.cx1); if (m.face > 0 && m.turnT < 0) this._turn(m, -1); }
        }
        // ---- vertical: the lane + a bob + a slow drift (spring); joy prep: up under the surface
        var bobA = m.thing.kind === 'bubble' ? cfg.bubbleBob : cfg.bobAmp, dA = L.swim.spacing < 1.2 * L.size ? 0.6 * cfg.driftAmp : cfg.driftAmp;
        var yT = m.laneY + bobA * Math.sin(TAU * cfg.bobHz * this.time + m._ph) + dA * Math.sin(TAU * cfg.driftHz * this.time + m._dph);
        if (m._joyPrep) yT = L.surfaceY + cfg.joyRiseK * s;
        if (m.state === 'leave' || m.state === 'hooked') yT = m.state === 'hooked' ? m.y : yT;
        m.vy += (cfg.yOmega * cfg.yOmega * (yT - m.y) - 2 * cfg.yZeta * cfg.yOmega * m.vy) * h * (m._joyPrep ? 2.2 : 1);
        if (m.state === 'hooked') m.vy *= Math.pow(0.02, h);
        m.y += m.vy * h;
        m.y = clamp(m.y, L.surfaceY + 0.3 * s, L.H - L.ins.bottom - 0.3 * s);
        // ---- pitch with the vertical speed (rot sign follows the facing)
        var pitch = clamp(Math.atan2(m.vy, Math.abs(m.vx) + 40) * cfg.pitchK, -cfg.pitchMax, cfg.pitchMax);
        m.rotT = m.thing.kind === 'bubble' ? 0.06 * Math.sin(TAU * 0.4 * this.time + m._ph) : pitch * m.dir;
      } else if (m.state === 'joy') this._stepJoyFish(m, h);
      else if (m.state === 'leap') this._stepLeap(m, h);
      else if (m.state === 'away') {
        m._awayT += h;
        m.vx *= Math.pow(0.25, h); m.vy *= Math.pow(0.15, h);
        m.x += m.vx * h; m.y += m.vy * h; m.rotT = 0;
        m.alpha = Math.max(0, 1 - m._awayT / cfg.awayTime);
        if (m._awayT >= cfg.awayTime) { m.state = 'gone'; m.alpha = 0; }
      }
      // ---- rotation spring (reel / show set rotT directly; leap / joy write rot)
      if (m.state !== 'leap' && m.state !== 'joy') {
        var rw = m.state === 'show' || (m.state === 'reel' && this._reel && this._reel.stage === 'air') ? cfg.hangOmega : m.state === 'reel' ? cfg.reelRotOmega : cfg.rotOmega;   // stiffer on the line (keeps the wriggle)
        m.rotV += (rw * rw * (m.rotT - m.rot) - 2 * cfg.rotZeta * rw * m.rotV) * h;
        m.rot += m.rotV * h;
      }
      // ---- squash / glow / tail
      spring(m, 'q', 'qV', 0, cfg.squashOmega, cfg.squashZeta, h); m.q = clamp(m.q, -cfg.qMax, cfg.qMax);
      var scT = this.assistId === m.id ? cfg.assistScale : 1;
      spring(m, 'scale', 'scaleV', scT, 9, 0.6, h);
      var spd = Math.abs(m.vx) + 0.3 * Math.abs(m.vy), cr0 = Math.max(10, m.cruise);
      var wagT = m.state === 'reel' || m.state === 'show' ? 1 : m.state === 'gone' || m.state === 'leap' ? 0.6 : clamp(0.3 + 0.7 * spd / cr0 + (m.turnT >= 0 ? 0.3 : 0), 0.3, 1);
      m.wag += (wagT - m.wag) * Math.min(1, h * 4);
      m.wagPhase += h * TAU * lerp(cfg.wagHz[0], cfg.wagHz[1], clamp((m.wag - 0.3) / 0.7, 0, 1));
      if (m.wagPhase > 1e4) m.wagPhase -= TAU * 1000;
      if (m.state !== 'reel' && m.state !== 'show') m.wriggle = Math.max(0, m.wriggle - h * 2);
      if (m._glowT > 0) m._glowT = Math.max(0, m._glowT - h);
      if (m._flashT > 0) m._flashT = Math.max(0, m._flashT - h * 0.6);
      if (m._alertT > 0) { m._alertT = Math.max(0, m._alertT - h); m.alert = m._alertT / cfg.alertTime; }
      var gT = this.assistId === m.id ? 1 : m._glowT > 0 ? 0.55 + 0.45 * Math.sin(TAU * 1.6 * this.time) : 0;
      if (m.state === 'reel' || m.state === 'show') gT = Math.max(gT, 0.6 + 0.25 * Math.sin(TAU * 2 * this.time));
      gT = Math.max(gT, m._flashT);
      m.glow += (gT - m.glow) * Math.min(1, h * (gT > m.glow ? 10 : 4));
      m._blinkT -= h;
      if (m._blinkT <= 0) { if (m.blink) { m.blink = 0; m._blinkT = this._crng.float(2, 5); } else { m.blink = 1; m._blinkT = 0.12; } }
      // ---- the odd air bubble from a swimming fish
      if (m.state === 'swim' && !m.above) {
        m._bubT -= h;
        if (m._bubT <= 0) { m._bubT = this._crng.float(cfg.fishBubbleEvery[0], cfg.fishBubbleEvery[1]); var mo = this.mouthOf(m); this._bubble(mo.x, mo.y - 4, this._crng.float(3, 6)); }
      }
      m.above = m.y < L.surfaceY;
      this._pose(m);
      // ---- reel / show: the body hangs from the hook — re-hang after the squash changed sy (mouth stays on the hook)
      if ((m.state === 'reel' && this._reel && this._reel.stage === 'air') || m.state === 'show') this._hang(m);
      m._hist.push({ t: this.time, x: m.x, y: m.y });
      while (m._hist.length > 2 && m._hist[0].t < this.time - cfg.histKeep) m._hist.shift();
    }
    this._separate();
    void self;
  };
  /** Safety net: fish in one lane never overlap (push apart along x). */
  P._separate = function () {
    var cfg = this.cfg, ms = this.members;
    for (var i = 0; i < ms.length; i++) for (var j = i + 1; j < ms.length; j++) {
      var a = ms[i], b = ms[j];
      if (a.lane !== b.lane || !(a.state === 'swim' || a.state === 'dart') || !(b.state === 'swim' || b.state === 'dart')) continue;
      var need = cfg.sepK * 0.5 * (this._len(a) + this._len(b)), dx = b.x - a.x;
      if (Math.abs(dx) < need) {
        var push = 0.5 * (need - Math.abs(dx)), sd = dx >= 0 ? 1 : -1;
        var Ra = this._range(a.lane);
        a.x = clamp(a.x - sd * push, Ra.cx0 - 0.5 * need, Ra.cx1 + 0.5 * need); b.x = clamp(b.x + sd * push, Ra.cx0 - 0.5 * need, Ra.cx1 + 0.5 * need);
      }
    }
  };
  P._stepLeap = function (m, h) {
    var J = m._leap, cfg = this.cfg, L = this.layout;
    J.t += h;
    var t = Math.min(J.t, J.T);
    m.x = J.x0 + J.vx * t; m.y = J.y0 + J.vy * t + 0.5 * J.g * t * t;
    m.vx = J.vx; m.vy = J.vy + J.g * t;
    // pitch along the flight, weighted by dir (continuous through the turn: an edge-on fish has no pitch); the hanging pose
    // blends out over leapBlend s and mirrors with the turn; plus one full flip
    var pitch = clamp(Math.atan2(m.vy, Math.abs(m.vx) + 1) * 0.6, -0.9, 0.9) * m.dir;
    m.rot = lerp(J.rot0 * m.dir * J.dir0, pitch, smooth(t / cfg.leapBlend)) + J.spin * smooth(t / J.T);
    m.wriggle = 0.3;
    if (J.t >= J.T - 1e-9) {   // dive: big splash at the lily spot, then the fish swims away under water and fades
      var lp = L.lilies[J.i];
      m.x = lp.x; m.y = L.surfaceY + 0.2 * this._effSize(m);
      this._splash(lp.x, L.surfaceY, 1.2, 'dive', m.id);
      this._emit({ type: 'dive', id: m.id, x: lp.x, y: L.surfaceY });
      m.state = 'away'; m._awayT = 0; m.above = false;
      m.vx = sgn(J.vx) * 120; m.vy = 160; m.rotT = 0; m.rotV = 0;
      var r0 = m.rot % TAU; if (Math.abs(r0) > Math.PI) r0 -= sgn(r0) * TAU;
      m._prot += r0 - m.rot; m.rot = r0;   // the twin moves by the same whole turns: no backward spin in the interpolation
      this._lilyAt = this.time + cfg.lilyDelay;
    }
  };
  P._stepJoyFish = function (m, h) {
    var J = m._joy, cfg = this.cfg, L = this.layout;
    J.t += h;
    var t = J.t;
    m.x = J.x0 + J.vx * t; m.y = J.y0 + J.vy * t + 0.5 * cfg.joyG * t * t;
    m.vx = J.vx; m.vy = J.vy + cfg.joyG * t;
    m.rot = J.rot0 * (1 - smooth(t / J.T)) + J.spin * smooth(t / J.T);
    var was = m.above;
    m.above = m.y < L.surfaceY;
    if (!J.out && m.above) J.out = true;
    if (J.out && !m.above && m.vy > 0 && was) {   // back in: small splash, swim on (keeps its velocity; the lane spring catches it)
      this._splash(m.x, L.surfaceY, 0.6, 'joy', m.id);
      m.state = 'swim'; var r1 = m.rot - J.spin; m._prot += r1 - m.rot; m.rot = r1; m.rotT = 0; m.rotV = 0; m.vy *= 0.35; m.vx *= 0.8; m._joyPrep = false;
      var R = this._range(m.lane); m.x = clamp(m.x, R.cx0, R.cx1);
    }
    if (t > J.T + 1.5) { m.state = 'swim'; m._prot = 0; m.rot = 0; m.y = Math.max(m.y, L.surfaceY + 0.3 * L.size); }
  };

  // ---------------------------------------------------------------- critters (one round per chapter)
  P._critterLeaving = function () { var c = this.critter; return !!c && (c.state === 'out'); };
  P._spawnCritter = function () {
    var cfg = this.cfg, L = this.layout, k = this.surprise, r = this._crng, c;
    if (!k || this.critter) return;
    if (k === 'ptero') {
      var y0 = clamp(L.sky.y0 + 30, L.ins.top + 60, L.surfaceY - 120);
      c = { kind: k, state: 'in', t: 0, x: L.W + 90, y: y0, face: -1, flap: 0, flapPh: 0, r: cfg.ptero.r,
        p0: { x: L.W + 90, y: y0 }, dip: { x: lerp(L.swim.x0, L.swim.x1, r.float(0.45, 0.7)), y: L.surfaceY - 26 }, dipped: false };
    } else if (k === 'bronto') {
      var B = L.bronto;
      c = { kind: k, state: 'in', t: 0, x: L.W + 0.5 * B.h, y: B.y, h: B.h, face: -1, spray: 0, r: cfg.bronto.rK * B.h, x1: B.x, x0: L.W + 0.5 * B.h };
    } else if (k === 'frog') {
      var open = this.lilies.filter(function (q) { return q.target; }), pad = open.length ? this.lilies.indexOf(open[0]) : 3;
      c = { kind: k, state: 'in', t: 0, x: L.W + 40, y: L.surfaceY + 2, face: -1, jump: 0, pad: pad, r: cfg.frog.r, h: cfg.frog.h, hop: null };
      this._frogHop(c, pad, cfg.frog.inT, 120);
    } else if (k === 'fireflies') {
      var fs = [], y1 = Math.max(L.sky.y0 + 10, L.surfaceY - 220), y2 = L.surfaceY - 30;
      for (var j = 0; j < cfg.fireflies.n; j++) {
        var hx = lerp(L.swim.x0 + 40, L.swim.x1 - 40, (j + 0.5) / cfg.fireflies.n) + r.float(-30, 30), hy = r.float(y1, Math.max(y1, y2));
        fs.push({ x: hx, y: hy, hx: hx, hy: hy, _px: hx, _py: hy, a: 0, tw: 0, ph: r.float(0, TAU), ph2: r.float(0, TAU) });
      }
      c = { kind: k, state: 'in', t: 0, x: fs[0].x, y: fs[0].y, flies: fs, r: cfg.fireflies.r };
    }
    c._px = c.x; c._py = c.y; c.hx = c.x; c.hy = c.y; c.tappable = false;
    this.critter = c;
    this._stepCritter(0);
    var hc = this.critterHit() || { x: clamp(c.x, 0, L.W), y: c.y };
    this._emit({ type: 'critter', kind: k, x: hc.x, y: hc.y });
  };
  P._frogHop = function (c, pad, T, H) {
    var L = this.layout, lp = L.lilies[clamp(pad, 0, 3)];
    c.hop = { t: 0, T: T, x0: c.x, y0: c.y, x1: lp.x, y1: lp.y - 4, H: H };
    c.pad = pad; c.state = c.state === 'out' ? 'out' : (c.state === 'in' ? 'in' : 'hop');
    c.face = lp.x < c.x ? -1 : 1;
  };
  P._tapCritter = function (cr) {
    var c = this.critter, cfg = this.cfg, h = this.critterHit() || { x: c.x, y: c.y };
    if (!c) return;
    var ev = { type: 'critterTap', kind: c.kind, x: h.x, y: h.y };
    if (c.kind === 'ptero') { if (c.state !== 'loop') { c._resume = { state: c.state, t: c.t }; c.state = 'loop'; c.t = 0; c._cx = c.x; c._cy = c.y - cfg.ptero.loopR; } }
    else if (c.kind === 'bronto') { c.state = 'spray'; c.t = 0; ev.spray = { x: c.x - 0.42 * c.h, y: c.y - 0.95 * c.h }; }
    else if (c.kind === 'frog') {
      var pads = [0, 1, 2, 3].filter(function (i) { return i !== c.pad; });
      this._frogHop(c, pads[this._crng.int(0, pads.length - 1)], cfg.frog.hopT, cfg.frog.hopH);
      c.state = 'hop';
    } else if (c.kind === 'fireflies') { var f = c.flies[cr.i]; f.tw = 1; ev.i = cr.i; ev.x = f.x; ev.y = f.y; }
    this._emit(ev);
  };
  /** The round ends: a critter still around says goodbye. */
  P._critterLeave = function () {
    var c = this.critter, L = this.layout;
    if (!c || this._critterLeaving()) return;
    if (c.kind === 'ptero') { c.state = 'out'; c.t = 0; c._o = { x: c.x, y: c.y }; }
    else if (c.kind === 'bronto') { c.state = 'out'; c.t = 0; }
    else if (c.kind === 'frog') { c.state = 'out'; c.t = 0; c.hop = { t: 0, T: this.cfg.frog.outT, x0: c.x, y0: c.y, x1: L.W + 60, y1: L.surfaceY + 2, H: 90 }; c.face = 1; }
    else { c.state = 'out'; c.t = 0; }
  };
  P._critterRelayout = function () {
    var c = this.critter, L = this.layout;
    if (c.kind === 'bronto') { c.h = L.bronto.h; c.y = L.bronto.y; c.x1 = L.bronto.x; c.x0 = L.W + 0.5 * c.h; if (c.state === 'stay' || c.state === 'spray') c.x = c.x1; }
    else if (c.kind === 'frog') { var lp = L.lilies[clamp(c.pad, 0, 3)]; c.hop = null; c.x = lp.x; c.y = lp.y - 4; if (c.state === 'in' || c.state === 'hop') { c.state = 'sit'; c.t = 0; } if (c.state === 'out') { this.critter = null; return; } }
    else if (c.kind === 'ptero') { c.p0 = { x: L.W + 90, y: clamp(L.sky.y0 + 30, L.ins.top + 60, L.surfaceY - 120) }; c.dip = { x: lerp(L.swim.x0, L.swim.x1, 0.6), y: L.surfaceY - 26 }; c.x = clamp(c.x, -100, L.W + 100); c.y = clamp(c.y, 0, L.surfaceY); }
    else if (c.kind === 'fireflies') {
      var y1 = Math.max(L.sky.y0 + 10, L.surfaceY - 220), y2 = L.surfaceY - 30, n = c.flies.length;
      c.flies.forEach(function (f, j) { f.hx = lerp(L.swim.x0 + 40, L.swim.x1 - 40, (j + 0.5) / n); f.hy = lerp(y1, Math.max(y1, y2), (j % 3 + 0.5) / 3); f.x = f.hx; f.y = f.hy; f._px = f.x; f._py = f.y; });
    }
    c._px = c.x; c._py = c.y;
    this._critterHitPos();
  };
  P._critterHitPos = function () {
    var c = this.critter;
    if (!c) return;
    if (c.kind === 'bronto') { c.hx = c.x - 0.1 * c.h; c.hy = c.y - 0.55 * c.h; c.tappable = c.state === 'stay' || c.state === 'spray' || (c.state === 'in' && c.t > 0.6 * this.cfg.bronto.inT); c.block = c.x - this.cfg.bronto.block * c.h - 10; }
    else if (c.kind === 'frog') { c.hx = c.x; c.hy = c.y - 0.4 * c.h; c.tappable = c.state === 'sit'; }
    else if (c.kind === 'ptero') { c.hx = c.x; c.hy = c.y; c.tappable = c.state === 'in' || c.state === 'dip' || c.state === 'glide'; }
    else { c.hx = c.x; c.hy = c.y; }
  };
  P._stepCritter = function (h) {
    var cfg = this.cfg, L = this.layout, c = this.critter, u, p;
    if (this._surpriseAt >= 0 && this.time >= this._surpriseAt && (this.phase === 'play' || this.phase === 'cast' || this.phase === 'reel' || this.phase === 'show')) {
      this._surpriseAt = -1; this._spawnCritter(); c = this.critter;
    }
    if (!c) return;
    c.t += h;
    if (c.kind === 'ptero') {
      var Pt = cfg.ptero;
      c.flapPh += h * Pt.flapHz * (c.state === 'dip' ? 0.5 : 1); c.flap = (c.flapPh % 1) < 0.5 ? 0 : 1;
      if (c.state === 'in') {
        u = clamp(c.t / Pt.inT, 0, 1);
        p = bez(c.p0.x, c.p0.y, lerp(c.p0.x, c.dip.x, 0.6), c.p0.y - 20, c.dip.x, c.dip.y, smooth(u));
        c.x = p.x; c.y = p.y; c.face = -1;
        if (u >= 1) { c.state = 'dip'; c.t = 0; }
      } else if (c.state === 'dip') {
        c.x = c.dip.x - 90 * (c.t / Pt.dipT); c.y = c.dip.y + 4 * Math.sin(Math.PI * c.t / Pt.dipT);
        if (!c.dipped && c.t >= 0.25 * Pt.dipT) { c.dipped = true; this._splash(c.x, L.surfaceY, 0.6, 'ptero'); }
        if (c.t >= Pt.dipT) { c.state = 'glide'; c.t = 0; c._o = { x: c.x, y: c.y }; }
      } else if (c.state === 'glide' || c.state === 'out') {
        var T = c.state === 'glide' ? Pt.outT : Pt.outT * 0.8;
        u = clamp(c.t / T, 0, 1);
        p = bez(c._o.x, c._o.y, c._o.x - 160, c._o.y - 40, c._o.x - 40 + (c.state === 'out' ? -200 : 0), L.ins.top - 80, smooth(u));
        c.x = p.x; c.y = p.y; c.face = -1;
        if (u >= 1) { c.state = 'gone'; this.critter = null; return; }
      } else if (c.state === 'loop') {
        u = clamp(c.t / Pt.loopT, 0, 1);
        var a = Math.PI / 2 - TAU * smooth(u);
        c.x = c._cx + Math.cos(a) * Pt.loopR; c.y = c._cy + Math.sin(a) * Pt.loopR;
        if (u >= 1) { c.state = 'glide'; c.t = 0; c._o = { x: c.x, y: c.y }; }
      }
    } else if (c.kind === 'bronto') {
      var Bc = cfg.bronto;
      if (c.state === 'in') { u = smooth(c.t / Bc.inT); c.x = lerp(c.x0, c.x1, u); if (c.t >= Bc.inT) { c.state = 'stay'; c.t = 0; c._stay = 0; } }
      else if (c.state === 'stay') { c._stay = (c._stay || 0) + h; c.x = c.x1; if (c._stay >= Bc.stay) { c.state = 'out'; c.t = 0; } }
      else if (c.state === 'spray') { c._stay = (c._stay || 0) + h; c.spray = Math.sin(Math.PI * clamp(c.t / Bc.sprayT, 0, 1)); if (c.t >= Bc.sprayT) { c.state = 'stay'; c.t = 0; c.spray = 0; } }
      else if (c.state === 'out') { u = smooth(c.t / Bc.outT); c.x = lerp(c.x1, c.x0, u); c.face = 1; if (c.t >= Bc.outT) { c.state = 'gone'; this.critter = null; return; } }
      c.step = Math.floor(c.t * 3) % 2;
    } else if (c.kind === 'frog') {
      var F = cfg.frog;
      if (c.hop && (c.state === 'in' || c.state === 'hop' || c.state === 'out')) {
        var hp = c.hop; hp.t += h; u = clamp(hp.t / hp.T, 0, 1);
        c.x = lerp(hp.x0, hp.x1, u); c.y = lerp(hp.y0, hp.y1, u) - hp.H * 4 * u * (1 - u); c.jump = u < 1 ? 1 : 0;
        if (u >= 1) {
          if (c.state === 'out') { c.state = 'gone'; this.critter = null; return; }
          this._splash(c.x, L.surfaceY, 0.35, 'frog');
          c.state = 'sit'; c.t = 0; c.hop = null; c._sit = c._sit || 0;
        }
      } else if (c.state === 'sit') {
        c._sit = (c._sit || 0) + h; c.jump = 0;
        var lp = L.lilies[clamp(c.pad, 0, 3)]; c.x = lp.x; c.y = lp.y - 4;
        if (c._sit >= F.sit) { c.state = 'out'; c.t = 0; c.hop = { t: 0, T: F.outT, x0: c.x, y0: c.y, x1: L.W + 60, y1: L.surfaceY + 2, H: 90 }; c.face = 1; }
      }
    } else if (c.kind === 'fireflies') {
      var Fy = cfg.fireflies, self = this, fade = c.state === 'in' ? clamp(c.t / Fy.inT, 0, 1) : c.state === 'out' ? 1 - clamp(c.t / Fy.outT, 0, 1) : 1;
      c.flies.forEach(function (f, j) {
        f.x = f.hx + 34 * Math.sin(0.7 * self.time + f.ph) + 12 * Math.sin(1.9 * self.time + f.ph2);
        f.y = f.hy + 18 * Math.sin(0.9 * self.time + f.ph2) + 6 * Math.sin(2.3 * self.time + f.ph);
        if (f.tw > 0) f.tw = Math.max(0, f.tw - h / Fy.twT);
        f.a = fade * (0.55 + 0.45 * Math.sin(TAU * 0.8 * self.time + f.ph)) + f.tw * 0.5;
        void j;
      });
      if (c.state === 'in' && c.t >= Fy.inT) { c.state = 'dance'; c.t = 0; }
      else if (c.state === 'dance' && c.t >= Fy.stay) { c.state = 'out'; c.t = 0; }
      else if (c.state === 'out' && c.t >= Fy.outT) { c.state = 'gone'; this.critter = null; return; }
      c.x = c.flies[0].x; c.y = c.flies[0].y;
    }
    this._critterHitPos();
  };

  // ---------------------------------------------------------------- Tibo
  P._stepTibo = function (h) {
    var b = this.tibo, cfg = this.cfg, L = this.layout;
    b.x = L.tibo.x; b.y = L.tibo.y; b.h = L.tibo.h; b.w = L.tibo.w;
    if (b.moodT > 0) { b.moodT -= h; if (b.moodT <= 0) { b.moodT = 0; b.mood = 'idle'; } }
    if (this.phase !== 'reel' && b.mood === 'reel') b.mood = 'happy';
    if (this.phase !== 'show' && this.phase !== 'reel' && b.mood === 'happy' && b.moodT > 5) b.moodT = 1;
    b.blinkT -= h;
    if (b.blink && b.blinkT <= 0) { b.blink = false; b.blinkT = this._crng.float(cfg.blink[0], cfg.blink[1]); }
    else if (!b.blink && b.blinkT <= 0) { b.blink = true; b.blinkT = cfg.blinkTime; }
    if (b._bT >= 0) { b._bT += h; var u = b._bT / cfg.bounceT; b.bounce = u < 1 ? Math.sin(Math.PI * u) : 0; if (u >= 1) b._bT = -1; }
    this._lookT -= h;
    var tx = (L.swim.x0 + L.swim.x1) / 2, ln = this.line;
    if (this._g) tx = this.finger.x;
    else if (this.hintHand) tx = this.hintHand.x;
    else if (ln.state !== 'rest' && ln.state !== 'free') tx = ln.hook.x;
    else if (this._lookT > 0) tx = this._lookX;
    else if (this.critter) tx = this.critter.x;
    b.lookX += (tx - b.lookX) * Math.min(1, h * cfg.lookRate);
    b.look = clamp((b.lookX - b.x) / 500, -1, 1);
  };

  TL.World = World;
})(window.TL = window.TL || {});
