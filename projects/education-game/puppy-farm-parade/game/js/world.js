/* Bo's Farm Parade — FP.CONFIG + FP.World (headless, deterministic odd-one-out parade simulation; DESIGN §2, §5.2)
 *
 * ============================== CONVENTIONS ==============================
 *  Units: logical px (short side 720), seconds, radians, y DOWN, rot > 0 clockwise. Screen space = world space (no camera).
 *  update(dt) runs fixed sub-steps of cfg.step (1/120 s). At the START of every sub-step every moving field is copied into its
 *  `_p` twin; render v = _v + (v − _v)·w.alpha.
 *
 *  MEMBERS w.members[] (slot order at the start of the round) = { id, i (index in the round), thing, odd, slot (current slot index),
 *    size (= layout.item, the body box height before big:false art scaling), x, y (FEET point), tx (slot target x), vx, bob (lift ≥ 0:
 *    step bob + breathing + jumps), sx, sy (squash: sx = 1 + q, sy = 1 / (1 + q)), rot (tilt + wiggle + hop spin), rotV (wiggle
 *    velocity), wheel (rad, wagons / carts), step (0|1 walking frame), stepT (0..1 step phase), state 'enter'|'stand'|'hop'|'stage'|
 *    'march'|'in'|'leave'|'gone', walking (bool), glow 0..1, dim 0..1, count −1|0..n (crates on the stage), scale (perspective / "in"
 *    shrink), alpha 0..1, face (1 = facing right, −1 = left), clip (bool: draw clipped to layout.barn.door — it is walking in),
 *    hopT, cx, cy (hit-circle centre = body centre) } + _px _py _prot _psx _psy _pbob _pscale _pwheel _palpha.
 *    Draw: ctx.translate(x, y − bob) · rotate(rot) · scale(face·sx·scale, sy·scale) → FP.ParadeArt.drawMember(ctx, thing, size,
 *      {glow, dim, wheel, step, night, count}) with globalAlpha = alpha (and clipped to the doorway when clip).
 * ========================================================================
 */
(function (FP) {
  'use strict';

  var CONFIG = {
    // ---- timing / state machine (s)
    step: 1 / 120, maxFrame: 1.0,
    roundsPerLevel: 4, chapterTimeLimit: 75, chapterMinRounds: 3,
    shortBudget: [1e9, 26, 42, 56],   // s into the chapter: a round starting later than this is short (3 / 4 members)
    introTime: 2.5, levelDoneTime: 3.6,
    talkAfterAnswer: 1.6, talkAskTime: 12, talkGlowAfterAsks: 2, talkMaxAsks: 3, talkGiveUp: 2,   // Bo answers 2 s after the 3rd re-ask

    // ---- layout (DESIGN §2; px)
    shortSide: 720, minLong: 960, maxLong: 1600, tallRatio: 1.6, phoneRatio: 1.9,
    groundLand: 14, groundPort: 26,
    bubbleX: 24, bubbleYLand: 18, bubbleMaxW: 560, bubbleRight: 200, bubbleHLand: 134, bubbleYPort: 110, bubbleHPort: 124,
    hudW: 160, hudH: 96, bubbleMinW: 220,
    boXLand: 112, boXPort: 100, boHLand: 220, boHPort: 200, boFeet: 4, boWFrac: 0.7, boPad: 10,
    lineUpLand: 96, lineAbovePort: 70, lineX0Land: 120, lineX1Land: 30, linePortSide: 64, portX1Door: -40, doorClear: 4, boClearK: 0.62,
    item: { 3: 120, 4: 120, 5: 112, 6: 104, 7: 104 }, itemMin: 100, tallK: 1.12, spMin: 1.22, spMax: 1.6, spTight: 1.12, itemFloor: 72,
    barnLand: { right: 130, w: 250, h: 270, dy: 12 }, barnSmall: { right: 105, w: 200, h: 216, dyPort: -6, dyLand: 12 },
    doorW: 140 / 300, doorH: 150 / 320, doorPad: 30, vaneUp: 4,
    stageLand: { dy: 200, s: 0.9 }, stagePort: { dy: 230, s: 0.95 }, stageGap: 30, hopBodyK: 1.02, hopBodyGap: 16, hopRoom: 40, stageBale: 92,
    badgeDx: 120, badgeDy: 60, badgeR: 46, entryOff: 160, exitPad: 80,
    hitK: 0.6, hitPad: 14, hitDiaPhone: 184, littleHitK: 0.85, keepGap: 44, fenceLand: 170, fencePort: 190,

    // ---- members: walking (a speed-capped spring + step cycle), squash, tilt, wiggle
    walkOmega: 9, walkZeta: 0.8, walkMax: 520, enterV: [440, 760], enterLead: 1.7, enterStagger: 0.28, enterMin: 1.4, enterTail: 0.15,
    arriveEps: 3, arriveV: 25, walkMin: 18,
    stepRate: [2.6, 4.6], stepRef: 300, stepH: [6, 9], wagonStepH: 2.5, wagonR: 0.12,
    squashOmega: 16, squashZeta: 0.4, squashStep: 0.06, squashWagon: 0.03, squashLand: 0.16, squashSettle: 0.07, qMax: 0.3,
    tiltMax: 0.12, tiltRef: 600, tiltOmega: 10, tiltZeta: 0.7,
    wigPeak: 0.18, wigOmega: 18, wigZeta: 0.25, wrongHop: 18, wrongHopT: 0.32, sameWrongWindow: 1.0,
    breathAmp: 1.5, breathHz: 0.6, lookHopEvery: [3, 7], lookHopH: 8, lookHopT: 0.3,

    // ---- right: ballistic hop to the hay-bale stage, gap closing, counting
    crouch: 0.1, crouchQ: 0.1, stretchTake: 0.14, hopTime: 0.75, hopApex: 120, hopSpin: 0.3, landHold: 0.9, gapDelay: 0.3,
    countDelay: 0.25, countStep: 0.5, countTail: 0.4, stagePop: 0.12, stageOmega: 14, stageZeta: 0.35, badgeRate: 4,

    // ---- gate / march / out
    gateHandAfter: 2.0, gateWait: 4, gateWaitAfterAuto: 2.5, doorOmega: 8, doorZeta: 0.35, doorMarchAt: 0.35,
    marchTime: 2.2, marchSpeed: [220, 560], marchRate: 2.6, marchH: 9, marchAccel: 0.25, inShrink: 0.85, inWalk: 0.35, inFade: 0.3,
    waveEvery: 0.7, waveHop: 14, waveHopT: 0.35, leaveDrop: 0.45, leaveSpeed: 520, leaveStepH: 10, outDelay: 0.5, outTime: 0.8,
    vaneKick: 16, vaneDrag: 1.1, vaneWind: 0.15, grandDance: 2.2,

    // ---- help (DESIGN §5.2 / skill rules)
    hintAfterMisses: 2, hintAfterSoft: 3, assistAfter: 6, hintTime: 3.2, hintCooldown: 6, hintCycle: 1.6,
    idleTime: 12, idleBackoff: 1.5, idleMax: 30, idleHintFrom: 2, flickTime: 0.25, tapMovePx: 24, puffTime: 0.6,

    // ---- surprises: one round per chapter (round 1 or 2, never the warm-up); chapters 0–2 rotate chick / rooster, night = fireflies
    surpriseRounds: [1, 2], surpriseTypes: ['chick', 'rooster'], nightSurprise: 'fireflies', nightLevel: 3,
    surpriseAt: [2, 4.5],
    chickSpeed: 260, chickR: 46, chickH: 60, chickStepRate: 8, chickFlapTime: 0.6,
    roosterStay: 8, roosterR: 62, roosterLift: 80, roosterIn: 0.6, roosterCrowT: 1.2, roosterClear: 120,
    fireflyN: 5, fireflyR: 40, fireflyInTime: 1.6, fireflyStay: 14, fireflyZip: 0.8, fireflyStagger: 0.35,

    // ---- Bo
    moodTime: { happy: 0.9, cheer: 1.6, oops: 0.8, think: 1.4, talk: 1.0, wave: 1.4, point: 1.2, bark: 0.8, dance: 0.5 },
    boHopTime: 0.42, lookRate: 6, blink: [2.2, 5], blinkTime: 0.13
  };
  FP.CONFIG = CONFIG;

  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hyp(x, y) { return Math.sqrt(x * x + y * y); }
  function lerp(a, b, u) { return a + (b - a) * u; }
  function smooth(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  function merge(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; if (b) for (k in b) o[k] = b[k]; return o; }
  function insOf(ins) { return { top: +(ins && ins.top) || 0, right: +(ins && ins.right) || 0, bottom: +(ins && ins.bottom) || 0, left: +(ins && ins.left) || 0 }; }
  function keepBoxes(hk) {
    var a = Array.isArray(hk) ? hk : hk ? [hk] : [], out = [];
    for (var i = 0; i < a.length; i++) { var b = a[i]; if (b && b.w > 0 && b.h > 0) out.push({ x: +b.x, y: +b.y, w: +b.w, h: +b.h }); }
    return out;
  }
  function inBox(b, x, y, pad) { pad = pad || 0; return x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad; }
  function boxDist(b, x, y) { var dx = Math.max(b.x - x, 0, x - b.x - b.w), dy = Math.max(b.y - y, 0, y - b.y - b.h); return hyp(dx, dy); }
  /** Initial velocity that gives a damped spring (ω, ζ) released from 0 a first peak of `peak`. */
  function kickFor(peak, w, z) { var s = Math.sqrt(1 - z * z); return peak * w * Math.exp(z / s * Math.atan2(s, z)); }
  function spring(o, k, kv, target, w, z, h) { o[kv] += (w * w * (target - o[k]) - 2 * z * w * o[kv]) * h; o[k] += o[kv] * h; }
  /* Constant-acceleration (parabolic) path from (x0, y0) to (x1, y1) in T s whose apex is H px above the higher end (never above
   * minY). */
  function arc(x0, y0, x1, y1, T, H, vx0, minY) {
    var lo = Math.min(y0, y1), ya = Math.min(lo, Math.max(lo - H, minY === undefined ? -1e9 : minY)), A0 = y0 - ya, A1 = y1 - ya;
    var sg = (Math.sqrt(2 * A0) + Math.sqrt(2 * A1)) / T, g = sg * sg;
    if (!(g > 0)) g = 1e-6;
    return { x0: x0, y0: y0, x1: x1, y1: y1, vx0: vx0 || 0, vy0: -Math.sqrt(2 * g * A0), ax: 2 * (x1 - x0 - (vx0 || 0) * T) / (T * T), ay: g, T: T, t: 0, ya: ya };
  }
  function arcAt(f, t) { return { x: f.x0 + f.vx0 * t + 0.5 * f.ax * t * t, y: f.y0 + f.vy0 * t + 0.5 * f.ay * t * t }; }
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

  /** DESIGN §2 short-side rule: CSS viewport → logical W×H. */
  function logicalSize(cssW, cssH, cfg) {
    cfg = cfg || CONFIG;
    var S = cfg.shortSide, aspect = cssW / Math.max(1, cssH);
    if (cssW >= cssH) return { W: clamp(Math.round(S * aspect), cfg.minLong, cfg.maxLong), H: S };
    return { W: S, H: clamp(Math.round(S / aspect), cfg.minLong, cfg.maxLong) };
  }
  function ageKey(age) { return clamp(Math.round(+age || 4), 3, 7); }

  /* ---------------------------------------------------------------- layout (DESIGN §2)
   * Sized for n members (the round's real count; 5 between rounds). Tiers, the first that fits wins: the age's item (× 1.12 on tall
   * screens) at spacing 1.22 × item, the base item, itemMin 100 at 1.22 ×, itemMin at 1.12 ×; landscape then tries the same with the
   * smaller barn (iPad 4:3); an odd viewport finally squeezes the item. "Fits" = the n slot CENTRES lie in [line.x0, line.x1]. */
  function computeLayout(W, H, ins, cfg, age, hudKeep, n) {
    var a = ageKey(age), portrait = H > W, tall = H / W > cfg.tallRatio;
    n = clamp(Math.round(n || 5), 1, 5);
    var base = cfg.item[a], big = tall ? Math.round(base * cfg.tallK) : base, lo = Math.min(cfg.itemMin, base), tiers = [], L, t;
    [false, true].forEach(function (compact) {
      if (compact && portrait) return;
      if (big > base) tiers.push([big, cfg.spMin, compact]);
      tiers.push([base, cfg.spMin, compact]);
      if (lo < base) tiers.push([lo, cfg.spMin, compact]);
      tiers.push([lo, cfg.spTight, compact]);
    });
    for (t = 0; t < tiers.length; t++) {
      L = layoutTier(W, H, ins, cfg, a, hudKeep, tiers[t][0], tiers[t][1], n, tiers[t][2]);
      L.tier = t;
      if (L.fits) return L;
    }
    var L0 = layoutTier(W, H, ins, cfg, a, hudKeep, lo, cfg.spTight, n, !portrait);
    var sq = Math.max(cfg.itemFloor, Math.floor((L0.line.x1 - L0.line.x0) / Math.max(1, (n - 1) * cfg.spTight)));
    L = layoutTier(W, H, ins, cfg, a, hudKeep, Math.min(lo, sq), cfg.spTight, n, !portrait);
    L.tier = tiers.length; L.squeezed = true;
    return L;
  }
  /** The HUD's measured box among the hudKeep boxes (the one in the top-right; main.js passes [HUD, bubble, …]). */
  function hudBox(hk, W, H) { var best = null; for (var i = 0; i < hk.length; i++) { var b = hk[i]; if (b.x + b.w / 2 > W / 2 && b.y < H / 2 && (!best || b.y + b.h > best.y + best.h)) best = b; } return best; }
  function layoutTier(W, H, ins, cfg, a, hudKeep, item, spK, n, compact) {
    ins = insOf(ins);
    var portrait = H > W, tall = H / W > cfg.tallRatio, phone = (portrait ? H / W : W / H) > cfg.phoneRatio;
    var groundY = H - ins.bottom - (portrait ? cfg.groundPort : cfg.groundLand);
    var hk = keepBoxes(hudKeep), hb = hudBox(hk, W, H);
    var bx = ins.left + cfg.bubbleX, bubble;
    if (portrait) bubble = { x: bx, y: ins.top + cfg.bubbleYPort, w: W - bx - ins.right - cfg.bubbleX, h: cfg.bubbleHPort };
    else bubble = { x: bx, y: ins.top + cfg.bubbleYLand, w: Math.min(cfg.bubbleMaxW, W - ins.right - cfg.bubbleRight - bx), h: cfg.bubbleHLand };
    if (hb && bubble.x + bubble.w > hb.x - 10 && bubble.y < hb.y + hb.h) {   // the measured HUD: narrower beside it, else below
      var room = hb.x - 12 - bubble.x;
      if (!portrait && room >= cfg.bubbleMinW) bubble.w = room;
      else bubble.y = Math.max(bubble.y, hb.y + hb.h + 8);
    }
    bubble.w = Math.max(0, bubble.w);
    var bb = bubble.y + bubble.h;
    var hud = { x: W - ins.right - cfg.hudW, y: 0, w: cfg.hudW + ins.right, h: ins.top + cfg.hudH };
    var bh = portrait ? cfg.boHPort : cfg.boHLand;
    var bo = { x: ins.left + (portrait ? cfg.boXPort : cfg.boXLand), y: groundY - cfg.boFeet, h: bh, w: cfg.boWFrac * bh };
    var boBox = { x: bo.x - bo.w / 2 - cfg.boPad, y: bo.y - bh - cfg.boPad, w: bo.w + 2 * cfg.boPad, h: bh + 2 * cfg.boPad };
    var lineY = portrait ? bo.y - bh - cfg.lineAbovePort : groundY - cfg.lineUpLand;
    // measured bottom keep-outs (toolbars): resting feet stay ≥ 44 px above them
    hk.forEach(function (b) { if (b.y > H / 2 && b.y - cfg.keepGap < lineY) lineY = b.y - cfg.keepGap; });
    var B = portrait || compact ? cfg.barnSmall : cfg.barnLand;
    var dy = portrait ? cfg.barnSmall.dyPort : compact ? cfg.barnSmall.dyLand : cfg.barnLand.dy;
    var barn = { x: W - ins.right - B.right, y: lineY + dy, w: B.w, h: B.h, sx: B.w / 300, sy: B.h / 320, small: B === cfg.barnSmall };
    var dw = cfg.doorW * B.w, dh = cfg.doorH * B.h, pad = cfg.doorPad;
    barn.door = { x: barn.x, y: barn.y, w: dw, h: dh, l: barn.x - dw / 2, r: barn.x + dw / 2, top: barn.y - dh };
    barn.door.box = { x: barn.door.l - pad, y: barn.door.top - pad, w: dw + 2 * pad, h: dh + pad + 10 };
    barn.box = { x: barn.x - B.w / 2, y: barn.y - B.h, w: B.w, h: B.h };
    barn.roof = { x: barn.x, y: barn.y - B.h };
    barn.vane = { x: barn.x, y: barn.y - B.h - cfg.vaneUp };
    // landscape: the first member's BODY (not only its slot centre) stays clear of Bo's box
    var x0 = portrait ? ins.left + cfg.linePortSide : Math.max(bo.x + cfg.lineX0Land, boBox.x + boBox.w + cfg.boClearK * item);
    var x1 = portrait ? barn.door.x - cfg.portX1Door : barn.x - B.w / 2 - cfg.lineX1Land;
    var line = { y: lineY, x0: x0, x1: x1 };
    var S = portrait ? cfg.stagePort : cfg.stageLand;
    var stage = { x: portrait ? W / 2 : (x0 + x1) / 2, y: lineY - S.dy, s: S.s };
    stage.y = Math.max(stage.y, bb + cfg.stageGap + item * stage.s);   // the member standing on it stays clear of the bubble
    // the hop's apex: the member's BODY top (≈ 1.02 × item above its feet) stays ≥ 16 px below the bubble
    var hopMinY = Math.max(ins.top + item + 10, bb + item * cfg.hopBodyK + cfg.hopBodyGap);
    // portrait: keep ≥ 40 px of arc room under that limit (the stage moves down, never into the members' heads)
    if (portrait) stage.y = Math.max(stage.y, Math.min(hopMinY + cfg.hopRoom, lineY - item - cfg.stageBale * stage.s - 8));
    var homeBadge = { x: stage.x + cfg.badgeDx, y: stage.y - cfg.badgeDy, r: cfg.badgeR };
    if (homeBadge.x + homeBadge.r > W - ins.right - 10) homeBadge.x = stage.x - cfg.badgeDx;
    var hitPad = (tall || phone) ? Math.max(cfg.hitPad, cfg.hitDiaPhone / 2 - cfg.hitK * item) : cfg.hitPad;
    var sp = clamp((x1 - x0) / n, spK * item, cfg.spMax * item);
    var L = { W: W, H: H, ins: ins, portrait: portrait, tall: tall, phone: phone, groundY: groundY, bubble: bubble, hud: hud, bo: bo, boBox: boBox,
      line: line, slots: [], item: item, x1Clear: portrait ? barn.door.l - 0.5 * item - cfg.doorClear : x1, spK: spK, sp: sp, n: n, compact: !!compact, barn: barn, stage: stage, homeBadge: homeBadge,
      entryX: ins.left - cfg.entryOff, exitX: -item - cfg.exitPad, fenceY: fenceTop(W, H, lineY),
      hitPad: hitPad, hitR: cfg.hitK * item + hitPad,
      hopMinY: hopMinY,
      band: { x: x0 - item * 0.9, y: lineY - item * 1.45, w: x1 - x0 + 1.8 * item, h: item * 1.45 + 40 },
      safe: { x: ins.left, y: ins.top, w: W - ins.left - ins.right, h: H - ins.bottom - ins.top } };
    L.keep = [{ x: bubble.x, y: bubble.y, w: bubble.w, h: bubble.h, kind: 'bubble' }, { x: hud.x, y: hud.y, w: hud.w, h: hud.h, kind: 'hud' }];
    hk.forEach(function (b) { b.kind = 'hudKeep'; L.keep.push(b); });
    L.fits = (n - 1) * sp <= x1 - x0 + 0.5;
    L.slots = slotsFor(L, n, cfg);
    return L;
  }
  /** The mid layer's fence top rail on screen (the rooster's feet) — the same formula as tools/env_scenes.js envLayout
   *  (L.fence.y), so the rooster stands exactly on the painted fence: landscape ≈ line.y − 170, tall portrait ≈ line.y − 226. */
  function fenceTop(W, H, lineY) {
    var portrait = H > W, tall = H / W > 1.6, kp = portrait ? (tall ? 1.36 : 1.15) : 1, km = 0.9 * kp, kg = portrait ? (tall ? 1.3 : 1.15) : 1;
    var horizonY = Math.round(lineY - 100 * kg), midY = horizonY + 4 - 296 * km;
    return Math.round(midY + 214 * km);
  }
  /** k slot centres {x, y} on the line: centred in [x0, x1], spacing clamp((x1 − x0) / k, spK × item, 1.6 × item). */
  function slotsFor(L, k, cfg) {
    cfg = cfg || CONFIG;
    var x0 = L.line.x0, x1 = L.line.x1;
    // portrait: when the k members fit left of the doorway, they stand there (the barn doors stay visible for the gate)
    if (L.x1Clear != null && L.x1Clear < x1 && (k - 1) * L.spK * L.item <= L.x1Clear - x0) x1 = L.x1Clear;
    var sp = clamp((x1 - x0) / Math.max(1, k), L.spK * L.item, cfg.spMax * L.item), mid = (x0 + x1) / 2, out = [];
    for (var i = 0; i < k; i++) out.push({ x: mid + (i - (k - 1) / 2) * sp, y: L.line.y });
    return out;
  }

  // ------------------------------------------------------------------ World
  function World(opts) {
    opts = opts || {};
    this.cfg = merge(CONFIG, opts.config);
    this.seed = opts.seed !== undefined ? opts.seed : 1;
    this.rng = new FP.RNG(this.seed);
    this._crng = new FP.RNG((FP.RNG.hash(this.seed) ^ 0x51ed27) >>> 0);   // cosmetic randomness (look hops, blinks, surprise spots)
    this.age = FP.Content.ageOf(opts.age !== undefined ? opts.age : 4);
    this.lang = opts.lang === 'vi' ? 'vi' : 'en';
    this._pendingAge = this.age; this._pendingLang = this.lang;
    this.state = 'menu'; this.phase = null;
    this.level = 0; this.levels = []; this.topic = null; this.weather = 0;
    this.round = 0; this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.stars = 0; this.levelStars = 0; this.roundStars = 0; this.misses = 0; this.streak = 0;
    this.time = 0; this.stateTime = 0; this.phaseTime = 0; this.alpha = 0; this._acc = 0;
    this.cur = null; this.talk = null; this.talkAnswered = null;
    this.members = []; this.fireflies = []; this.puffs = [];
    this.chick = null; this.rooster = null; this.hintHand = null; this.assistId = null;
    this.stage = { x: 0, y: 0, s: 1, pop: 0, _ppop: 0, popV: 0, memberId: null, badge: null };
    this.barn = { door: 0, _pdoor: 0, doorV: 0, doorTarget: 0, vane: 0, _pvane: 0, vaneSpin: 0 };
    this.bo = { x: 0, y: 0, h: 200, w: 140, mood: 'idle', moodT: 0, blinkT: 3, blink: false, look: 0, lookX: 0, hop: 0, _phop: 0, _hopT: -1 };
    this.finger = { x: 0, y: 0, down: false };
    this.hudKeep = opts.hudKeep || null; this.lastTopics = null; this.surprise = null; this._surpriseOff = 0; this._surpriseRound = 1;
    this.events = []; this.sessions = 0;
    this._idleN = 0; this._idleT = 0; this._idleGap = this.cfg.idleTime; this._lastHintT = -1e9; this.levelStartTime = 0;
    this._talkAskT = 0; this._talkAsks = 0; this._g = null; this._noProg = 0; this._answered = false;
    this._usedKeys = []; this._usedOdd = []; this._prevRule = null; this._prevRuleRun = 0; this._prevOddSlot = -1; this._prevOddSlots = []; this._gateAutoPrev = false;
    this._view = null; this._vp = null; this._lookT = 0; this._lookX = 0; this._lookHopT = 3;
    this._march = null; this._doorOpened = false; this._doorOpenT = -1; this._surpriseAt = -1; this._gateHinted = false;
    this.setViewport(opts.width || 1280, opts.height || 720, opts.ins || null);
  }
  World.logicalSize = logicalSize;
  World.computeLayout = function (W, H, ins, cfg, age, hudKeep, n) { return computeLayout(W, H, ins, merge(CONFIG, cfg), age === undefined ? 4 : age, hudKeep, n); };
  World.slotsFor = function (L, k, cfg) { return slotsFor(L, k, merge(CONFIG, cfg)); };
  World.kickFor = kickFor;
  World.arc = arc;
  World.arcAt = arcAt;
  World.segHit = segHit;

  var P = World.prototype;
  /** true while a first contact on a member is judged right now (round, play, not answered yet). */
  Object.defineProperty(P, 'interactive', { get: function () { return this.state === 'round' && this.phase === 'play' && !this._answered; } });
  Object.defineProperty(P, 'odd', { get: function () { return this.cur ? this.memberById(this.cur.oddId) : null; } });
  P._emit = function (e) { this.events.push(e); };
  P.drainEvents = function () { var e = this.events; this.events = []; return e; };
  P.setAge = function (a) { this._pendingAge = FP.Content.ageOf(a); };
  P.setLang = function (l) { this._pendingLang = l === 'vi' ? 'vi' : 'en'; };
  P._setState = function (s) { this.state = s; this.stateTime = 0; };
  P._setPhase = function (p) { this.phase = p; this.phaseTime = 0; };
  P._mood = function (m, t) { this.bo.mood = m; this.bo.moodT = t || this.cfg.moodTime[m] || 1; };
  P._boHop = function () { this.bo._hopT = 0; };
  P.skipTalk = function () { if (this.state === 'talk') this._levelDone(); };
  P.memberById = function (id) { for (var i = 0; i < this.members.length; i++) if (this.members[i].id === id) return this.members[i]; return null; };
  P._boMouth = function () { var B = this.layout.bo; return { x: B.x + 0.22 * B.h, y: B.y - 0.62 * B.h }; };
  P._lineCentre = function () { var l = this.layout.line; return { x: (l.x0 + l.x1) / 2, y: l.y - this.layout.item / 2 }; };

  /** The current question {promptKey, params, rule, nameKind, nameValue} while it can be answered (round / play, not answered),
   *  else null (enter, hop, gate …: the question is not repeated then). */
  P.prompt = function () {
    if (!this.interactive || !this.cur) return null;
    var c = this.cur;
    return { promptKey: c.promptKey, params: c.params, rule: c.rule, nameKind: c.rule.nameKind, nameValue: c.rule.value };
  };

  // ---------------------------------------------------------------- geometry + test hooks (logical px)
  P._little = function (m) { return m.thing.big === false; };
  P._drawH = function (m) { return m.size * (this._little(m) ? 0.62 : 1) * m.scale * m.sy; };
  P._hitR = function (m) { return this.cfg.hitK * m.size * (this._little(m) ? this.cfg.littleHitK : 1) * Math.max(0.85, m.scale) + this.layout.hitPad; };
  P._pose = function (m) { m.cx = m.x; m.cy = m.y - m.bob - this._drawH(m) / 2; };
  /** The member's hit circle {x, y, r} (body centre where it is now, incl. hops; r = 0.6 × size + 14), null when gone. */
  P.memberHit = function (id) { var m = this.memberById(id); return m && m.state !== 'gone' ? { x: m.cx, y: m.cy, r: this._hitR(m) } : null; };
  /** The member under (x, y): standing ones (gate: also the one on the stage); the nearest centre wins. */
  P._memberAt = function (x, y, gate) {
    var best = null, bd = 1e9;
    for (var i = 0; i < this.members.length; i++) {
      var m = this.members[i];
      if (!(m.state === 'stand' || (gate && m.state === 'stage'))) continue;
      var d = hyp(x - m.cx, y - m.cy);
      if (d <= this._hitR(m) && d < bd) { bd = d; best = m; }
    }
    return best;
  };
  P._onMember = function (x, y, extra) {
    for (var i = 0; i < this.members.length; i++) { var m = this.members[i]; if ((m.state === 'stand' || m.state === 'enter') && hyp(x - m.cx, y - m.cy) <= this._hitR(m) + (extra || 0)) return true; }
    return false;
  };
  /** Bo's tap box {x, y (top-left), w, h, cx, cy}. */
  P.boHit = function () { var b = this.layout.boBox; return { x: b.x, y: b.y, w: b.w, h: b.h, cx: b.x + b.w / 2, cy: b.y + b.h / 2 }; };
  /** The barn door tap box (the doorway + 30 px) {x, y, w, h, cx, cy}. */
  P.doorHit = function () { var b = this.layout.barn.door.box; return { x: b.x, y: b.y, w: b.w, h: b.h, cx: b.x + b.w / 2, cy: b.y + b.h / 2 }; };
  P._clearOfKeep = function (x, y, r) { var K = this.layout.keep; for (var k = 0; k < K.length; k++) if (inBox(K[k], x, y, r * 0.5)) return false; return true; };
  P.chickHit = function () {
    var c = this.chick, L = this.layout;
    if (!c || (c.state !== 'run' && c.state !== 'peck') || c.x < L.ins.left + 20 || c.x > L.W - L.ins.right - 20) return null;
    var h = { x: c.x, y: c.y - this.cfg.chickH / 2, r: this.cfg.chickR };
    return this._memberAt(h.x, h.y) ? null : h;
  };
  P.roosterHit = function () {
    var r = this.rooster;
    if (!r || r.state !== 'stand') return null;
    var h = { x: r.x, y: r.y - this.cfg.roosterLift, r: this.cfg.roosterR };
    return this._memberAt(h.x, h.y) ? null : h;
  };
  /** The first firefly that can be tapped (drifting, on screen, clear of members and of the HUD / bubble), else null. */
  P.fireflyHit = function () {
    var L = this.layout, r = this.cfg.fireflyR;
    for (var i = 0; i < this.fireflies.length; i++) {
      var f = this.fireflies[i];
      if (f.state !== 'drift' || f.y < L.ins.top + 10 || f.x < L.ins.left + 10 || f.x > L.W - L.ins.right - 10) continue;
      if (this._memberAt(f.x, f.y) || !this._clearOfKeep(f.x, f.y, r)) continue;
      return { x: f.x, y: f.y, r: r, i: i };
    }
    return null;
  };
  P._fireflyAt = function (x, y) {
    var r = this.cfg.fireflyR, best = null, bd = 1e9;
    for (var i = 0; i < this.fireflies.length; i++) { var f = this.fireflies[i], d = hyp(x - f.x, y - f.y); if (f.state === 'drift' && d <= r && d < bd) { bd = d; best = f; } }
    return best;
  };
  /** What to touch next: {member: id} in play (the odd one), {door: true} while the barn waits to be opened, else null. */
  P.answer = function () {
    if (this.state === 'roundDone' && this.phase === 'gate' && !this._doorOpened) return { door: true };
    if (!this.interactive || !this.cur) return null;
    return { member: this.cur.oddId };
  };

  // ---------------------------------------------------------------- viewport
  P.setViewport = function (W, H, ins) { this._view = { W: W, H: H, ins: insOf(ins) }; this._relayout(false); };
  P._relayout = function (force) {
    var v = this._view, n = this.cur ? this.cur.members.length : 5;
    var key = v.W + 'x' + v.H + ':' + JSON.stringify(v.ins) + ':' + this.age + ':' + n + ':' + JSON.stringify(this.hudKeep || null);
    if (key === this._vp && !force) return false;
    var had = !!this.layout;
    this._vp = key;
    this.layout = computeLayout(v.W, v.H, v.ins, this.cfg, this.age, this.hudKeep, n);
    this.layout.hudKeep = keepBoxes(this.hudKeep);
    var L = this.layout, B = L.bo;
    this.bo.x = B.x; this.bo.y = B.y; this.bo.h = B.h; this.bo.w = B.w;
    this.stage.x = L.stage.x; this.stage.y = L.stage.y; this.stage.s = L.stage.s;
    if (had) this._snapAll();
    return true;
  };
  /** The members still in the parade line (not the odd one once it left), in slot order. */
  P._lineMembers = function () {
    return this.members.filter(function (m) { return m.state === 'enter' || m.state === 'stand'; }).sort(function (a, b) { return a.slot - b.slot; });
  };
  /** Rotation / resize mid-round (DESIGN §5.2): cancel the gesture, slots re-placed, members re-target and walk (clamped into the
   *  screen), a hop in flight retargets the new stage, the stage member / marchers / surprises are re-placed. */
  P._snapAll = function () {
    var L = this.layout, cfg = this.cfg, self = this;
    this.cancelDrag();
    var line = this._lineMembers(), sl = slotsFor(L, line.length, cfg);
    line.forEach(function (m, k) {
      m.slot = k; m.tx = sl[k].x; m.size = L.item; m.y = L.line.y;
      if (m.state === 'stand') { var hw = m.size * 0.5; m.x = clamp(m.x, L.ins.left + hw, L.W - L.ins.right - hw); }
      else m._spawnX = L.entryX;
    });
    this.members.forEach(function (m) {
      m.size = L.item;
      if (m.state === 'hop' && m._f) {
        var T = Math.max(0.25, m._f.T - m._ft);
        m._f = arc(m.x, m.y, L.stage.x, L.stage.y, T, cfg.hopApex * 0.5, 0, L.hopMinY); m._ft = 0;
      } else if (m.state === 'stage') { m.x = L.stage.x; m.y = L.stage.y; m.scale = L.stage.s; }
      else if (m.state === 'march' || m.state === 'in') { m.y = L.line.y; m.x = clamp(m.x, -m.size, L.W + m.size); }
      else if (m.state === 'leave') { if (!m._lv || m._lv.phase !== 'drop') m.y = L.line.y; else m._lv.f = arc(m.x, m.y, m.x - 150, L.line.y, Math.max(0.2, m._lv.f.T - m._lv.ft), 40, 0); if (m._lv && m._lv.phase === 'drop') m._lv.ft = 0; }
      self._pose(m); self._twin(m);
    });
    if (this.chick) { var c = this.chick, sp = this._chickSpot(); c.tx = sp.x; c.ty = sp.y; if (c.state === 'peck') { c.x = c._px = sp.x; c.y = c._py = sp.y; } else if (c.state !== 'march' && c.state !== 'in') { c.y = c._py = sp.y; } else c.y = c._py = L.line.y; }
    if (this.rooster) {
      var r = this.rooster;
      if (r.state === 'leave') { var ex = r.x < L.W / 2 ? -80 : L.W + 80; r.f = arc(r.x, r.y, ex, r.y - 220, Math.max(0.3, r.f.T - r.ft), 20, 0); r.ft = 0; }
      else { var rs = this._roosterSpot(); r.x = r._px = rs.x; r.y = r._py = rs.y; if (r.state === 'in') r.state = 'stand'; r.f = null; }
    }
    if (this.fireflies.length) this._fireflyAnchors();
    if (this.hintHand) this._stepHint(0);
  };

  // ---------------------------------------------------------------- session flow
  P.newSession = function (opts) {
    this.age = this._pendingAge; this.lang = this._pendingLang;
    this.cur = null;
    this._relayout(false);
    this.sessions++;
    this._clearRound(); this.state = 'menu';
    var last = (opts && opts.lastTopics) || this.lastTopics || null;
    this.levels = FP.Content.topicsFor(this.age, this.rng, last);
    this._surpriseOff = this.rng.int(0, Math.max(0, this.cfg.surpriseTypes.length - 1));
    this.stars = 0; this._prevRule = null; this._prevRuleRun = 0; this._prevOddSlot = -1; this._prevOddSlots = [];
    this.weather = 0;
    this._emit({ type: 'session', levels: this.levels.slice() });
    this.startLevel(0);
  };
  /** keep = true between two rounds: a rooster / fireflies already leaving finish their exit. */
  P._clearRound = function (keep) {
    this.members = []; this._g = null; this.finger.down = false;
    this.chick = null;
    if (!keep || !this.rooster || this.rooster.state !== 'leave') this.rooster = null;
    this.fireflies = keep ? this.fireflies.filter(function (f) { return f.state === 'zip'; }) : [];
    this.hintHand = null; this.assistId = null; this._answered = false; this._march = null;
    this._doorOpened = false; this._doorOpenT = -1; this._surpriseAt = -1; this._gateHinted = false;
    this.stage.memberId = null; this.stage.badge = null;
    this.barn.doorTarget = 0;
    if (!keep) { this.barn.door = this.barn._pdoor = 0; this.barn.doorV = 0; }
  };
  P.startLevel = function (i) {
    if (!this.levels.length) this.levels = FP.Content.topicsFor(this.age);
    this.level = clamp(i | 0, 0, this.levels.length - 1);
    this.topic = this.levels[this.level];
    this.weather = this.level % 4;
    this.round = 0; this.levelStars = 0; this.levelStartTime = this.time;
    this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.cur = null; this.talk = null; this.talkAnswered = null; this.surprise = null; this._usedKeys = []; this._usedOdd = []; this._gateAutoPrev = false;
    var SR = this.cfg.surpriseRounds || [2];
    this._surpriseRound = SR[this.rng.int(0, SR.length - 1)];
    this._clearRound();
    this._relayout(false);
    this._setState('intro'); this.phase = null;
    this._mood('wave', 1.6);
    var c = this._lineCentre();
    this._emit({ type: 'level', level: this.level, topic: this.topic, weather: this.weather, x: c.x, y: c.y });
  };
  /** The surprise type of this chapter: the night chapter has fireflies, the others rotate chick / rooster. */
  P._surpriseType = function () {
    var ST = this.cfg.surpriseTypes;
    if (this.level === this.cfg.nightLevel && this.cfg.nightSurprise) return this.cfg.nightSurprise;
    if (!ST || !ST.length) return null;
    return ST[(this.level + this._surpriseOff) % ST.length];
  };

  P._newMember = function (q, i) {
    return { id: q.id, i: i, thing: q.thing, odd: !!q.odd, slot: q.slot, size: 0, x: 0, y: 0, tx: 0, vx: 0, vmax: this.cfg.walkMax, bob: 0, sx: 1, sy: 1,
      rot: 0, rotV: 0, tilt: 0, tiltV: 0, wig: 0, q: 0, qV: 0, spin: 0, wheel: 0, step: 0, stepT: 0, state: 'enter', walking: false,
      glow: 0, dim: 0, count: -1, scale: 1, alpha: 1, face: 1, clip: false, hopT: -1, cx: 0, cy: 0, jump: 0, breath: 0, _breathK: 0, _stepBob: 0,
      _jumpT: -1, _jumpH: 0, _jumpDur: 0.3, _spawnAt: 0, _spawnX: 0, _lastWrongT: -1e9, _glowT: 0, _flashT: 0, _countAt: -1, _countDoneT: -1,
      _ph: this._crng.float(0, TAU), _f: null, _ft: 0, _lv: null, _waveT: 0, _arrived: false,
      _px: 0, _py: 0, _prot: 0, _psx: 1, _psy: 1, _pbob: 0, _pscale: 1, _pwheel: 0, _palpha: 1 };
  };
  P._beginRound = function () {
    var cfg = this.cfg, self = this;
    var rr = new FP.RNG((this.rng.next() * 4294967296) >>> 0);
    var sp = this.round === this._surpriseRound && this.round > 0 ? this._surpriseType() : null;
    var el = this.time - this.levelStartTime, sb = cfg.shortBudget, short = !!(sb && this.round > 0 && el > sb[Math.min(this.round, sb.length - 1)]);
    var cur = FP.Content.makeRound(this.topic, { age: this.age, lang: this.lang, rng: rr, roundIndex: this.round, surprise: sp, short: short, level: this.level,
      usedKeys: this._usedKeys, prevRule: this._prevRule, prevRuleRun: this._prevRuleRun, prevOddSlots: this._prevOddSlots.slice(), usedOdd: this._usedOdd });
    this._usedKeys.push(cur.key);
    if (cur.oddValue != null) this._usedOdd.push(cur.oddValue);
    this._clearRound(true);
    this.cur = cur; this.surprise = cur.surprise;
    this.misses = 0; this.streak = 0; this._noProg = 0; this._roundAssisted = false; this._landT = -1;
    this._relayout(false);   // item / slots sized for this round's member count
    var L = this.layout, n = cur.members.length;
    this.members = cur.members.map(function (q, i) { return self._newMember(q, i); });
    // the leader (rightmost slot) walks in first; each member 0.28 s after the one in front of it
    var dLead = L.slots[n - 1].x - L.entryX, vmax = clamp(dLead / cfg.enterLead, cfg.enterV[0], cfg.enterV[1]);
    this.members.forEach(function (m) {
      m.size = L.item; m.x = L.entryX; m.y = L.line.y; m.tx = L.slots[m.slot].x; m.vmax = vmax; m._spawnX = L.entryX;
      m._spawnAt = (n - 1 - m.slot) * cfg.enterStagger;
      self._pose(m); self._twin(m);
    });
    this._idleT = 0; this._idleGap = cfg.idleTime; this._idleN = 0;
    this._lookHopT = this._crng.float(cfg.lookHopEvery[0], cfg.lookHopEvery[1]);
    this._setState('round'); this._setPhase('enter');
    this._mood('wave', 1.4);
    var c = this._lineCentre();
    this._emit({ type: 'round', round: this.round, topic: this.topic, surprise: cur.surprise, n: n, short: cur.short, key: cur.key, x: c.x, y: c.y });
  };

  P._ask = function (first) {
    var cfg = this.cfg, cur = this.cur;
    this._idleT = 0; this._idleGap = cfg.idleTime; this._idleN = 0;
    this._mood('talk', 1.0);
    var M = this._boMouth();
    this._emit({ type: 'ask', promptKey: cur.promptKey, params: cur.params, rule: cur.rule, first: !!first, round: this.round, n: this.members.length, x: M.x, y: M.y });
    if (first && this.surprise) this._surpriseAt = this.time + this._crng.float(cfg.surpriseAt[0], cfg.surpriseAt[1]);
  };

  P._startTalk = function () {
    var rr = new FP.RNG((this.rng.next() * 4294967296) >>> 0);
    this.talk = FP.Content.makeTalk(this.topic, { age: this.age, lang: this.lang, rng: rr, level: this.level });
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
    if (ok) { this.stars += 1; this.levelStars += 1; this._mood('cheer'); this._boHop(); } else this._mood(auto ? 'happy' : 'think');
    this.stateTime = 0;
    this._emit({ type: 'talkResult', correct: ok, choiceId: choiceId, answerId: this.talk.answer, auto: !!auto });
    return ok;
  };
  P._levelDone = function () { this._setState('levelDone'); this.phase = null; this._emit({ type: 'levelDone', level: this.level, stars: this.levelStars }); };

  // ---------------------------------------------------------------- input (logical px; ONE active pointer; a gesture = down … up)
  P._touch = function () { this._idleT = 0; this._idleGap = this.cfg.idleTime; };
  /**
   * pointerDown(x, y) → 'member' (play: the gesture's first contact, judged right / wrong) | 'door' (gate: opens the barn) |
   * 'brush' (a member touched outside play: it bobs) | 'chick' | 'rooster' | 'firefly' | 'bo' (poke fires on release) |
   * 'soft' (nothing: a dust puff) | 'early' (enter, nothing under the finger) | null (not in a round).
   * A member under the finger always wins over a surprise; surprises win over Bo.
   */
  P.pointerDown = function (x, y) {
    if (this._g || (this.state !== 'round' && this.state !== 'roundDone')) return null;
    this.finger.x = x; this.finger.y = y; this.finger.down = true;
    var L = this.layout, ph = this.phase, g = this._g = { x0: x, y0: y, x: x, y: y, t: this.time, judged: false, kind: 'gesture', maxD: 0, result: null, soft: false, contacted: false };
    this._touch();
    var gate = this.state === 'roundDone' && ph === 'gate' && !this._doorOpened, m;
    if (gate) {
      m = this._memberAt(x, y, true);
      if (m || inBox(L.barn.door.box, x, y) || inBox(L.barn.box, x, y)) { g.contacted = true; this._openDoor(false, x, y); return (g.result = 'door'); }
    }
    var play = this.interactive;
    if (play && this.assistId && inBox(L.band, x, y)) {   // assist: the next press anywhere in the line band picks the odd one
      var a = this.memberById(this.assistId), under = this._memberAt(x, y);
      if (a && a.state === 'stand') { this._contact(a, g, under ? under.id : null); return (g.result = 'member'); }
    }
    m = gate ? null : this._memberAt(x, y);
    if (m) {
      if (play) { this._contact(m, g); return (g.result = 'member'); }
      g.contacted = true; this._jump(m, this.cfg.lookHopH, this.cfg.lookHopT);
      this._emit({ type: 'wiggle', id: m.id, early: true, x: m.cx, y: m.cy });
      return (g.result = 'brush');
    }
    var ch = this.chickHit();
    if (ch && hyp(x - ch.x, y - ch.y) <= ch.r) { this._tapChick(); g.kind = 'surprise'; g.contacted = true; return (g.result = 'chick'); }
    var rh = this.roosterHit();
    if (rh && hyp(x - rh.x, y - rh.y) <= rh.r) { this._tapRooster(); g.kind = 'surprise'; g.contacted = true; return (g.result = 'rooster'); }
    var ff = this._fireflyAt(x, y);
    if (ff && this._clearOfKeep(ff.x, ff.y, 0)) { this._tapFirefly(ff); g.kind = 'surprise'; g.contacted = true; return (g.result = 'firefly'); }
    if (inBox(L.boBox, x, y)) { g.kind = 'bo'; return (g.result = 'bo'); }
    if (this.state === 'round' && ph === 'enter') { this._emit({ type: 'soft', kind: 'early', x: x, y: y }); return (g.result = 'early'); }
    this._puff(x, y);
    this._emit({ type: 'soft', kind: 'ground', x: x, y: y });
    g.soft = true;   // counts as a press without progress on release (play), unless a flick goes on to touch a member
    return (g.result = 'soft');
  };
  /** A finger slide: a press that started on nothing and moves onto a member within 0.25 s (a flick) is judged on that member
   *  (gate: a flick onto the doors / a member opens the barn). Later contacts of the same gesture are ignored. */
  P.pointerMove = function (x, y) {
    var g = this._g;
    if (!g) return;
    g.maxD = Math.max(g.maxD, hyp(x - g.x0, y - g.y0));
    this.finger.x = x; this.finger.y = y;
    if (g.soft && !g.contacted && this.time - g.t <= this.cfg.flickTime + 1e-9) {
      if (this.interactive) {
        var best = null, bs = 2;
        for (var i = 0; i < this.members.length; i++) {
          var m = this.members[i];
          if (m.state !== 'stand') continue;
          var s = segHit(g.x, g.y, x, y, m.cx, m.cy, this._hitR(m));
          if (s >= 0 && s < bs) { bs = s; best = m; }
        }
        if (best) this._contact(best, g);
      } else if (this.state === 'roundDone' && this.phase === 'gate' && !this._doorOpened) {
        var L = this.layout;
        if (this._memberAt(x, y, true) || inBox(L.barn.door.box, x, y) || inBox(L.barn.box, x, y)) { g.contacted = true; this._openDoor(false, x, y); }
      }
    }
    g.x = x; g.y = y;
  };
  /** → 'pokeBo' | 'up' | null */
  P.pointerUp = function (x, y) {
    var g = this._g;
    this._g = null; this.finger.down = false;
    if (!g) return null;
    if (x === undefined) { x = g.x; y = g.y; }
    var mv = Math.max(g.maxD, hyp(x - g.x0, y - g.y0));
    if (g.soft && !g.contacted && this.interactive) this._noProgress(false);
    if (g.kind === 'bo' && mv < this.cfg.tapMovePx && (this.state === 'round' || this.state === 'roundDone')) return this._pokeBo() || 'up';
    return 'up';
  };
  /** The finger left (touchcancel / pause / rotation): the gesture ends without a judgement. */
  P.cancelDrag = function () { this._g = null; this.finger.down = false; };

  /** The judged contact of a gesture with member m (`from` = the member under the finger when the assist redirects it). */
  P._contact = function (m, g, from) {
    g.contacted = true; g.judged = true;
    if (from !== undefined) { this._roundAssisted = true; this._emit({ type: 'assist', id: m.id, from: from, x: m.cx, y: m.cy }); }
    if (m.odd) this._right(m); else this._wrong(m);
    return 'member';
  };
  P._right = function (m) {
    var cfg = this.cfg, cur = this.cur, t = m.thing;
    this._answered = true; this.streak = 0; this._touch(); this.assistId = null; this.hintHand = null;
    m._flashT = 1; m._glowT = 0;
    var ev = { type: 'right', id: m.id, thing: t, rule: cur.rule, misses: this.misses, x: m.cx, y: m.cy };
    if (t.kind === 'crate') ev.count = { n: t.n, others: cur.rule.value };
    if (cur.rule.kind === 'home') ev.home = t.home;
    this._mood('bark', cfg.moodTime.bark); this._boHop();
    this._lookX = m.cx; this._lookT = 1.5;
    this._emit(ev);
    this._launch(m);
    this._gapAt = this.time + cfg.gapDelay;
    this._setPhase('hop');
  };
  P._wrong = function (m) {
    var cfg = this.cfg, cur = this.cur, t = m.thing;
    var dir = m.cx < this._lineCentre().x ? 1 : -1;
    m.rotV += dir * kickFor(cfg.wigPeak, cfg.wigOmega, cfg.wigZeta);
    this._jump(m, cfg.wrongHop, cfg.wrongHopT);
    this._lookX = m.cx; this._lookT = 1.2;
    if (this.time - m._lastWrongT < cfg.sameWrongWindow) {   // the same member again within 1 s: just wiggles
      m._lastWrongT = this.time;
      this._emit({ type: 'wiggle', id: m.id, repeat: true, x: m.cx, y: m.cy });
      return;
    }
    m._lastWrongT = this.time;
    this.misses++; this.streak++;
    this._mood('oops');
    var ev = { type: 'wrong', id: m.id, thing: t, got: { nameKind: t.nameKind, nameValue: t.nameValue }, want: { kind: cur.rule.kind, value: cur.rule.value,
      nameKind: cur.rule.nameKind, promptKey: cur.promptKey, params: cur.params }, streak: this.streak, misses: this.misses, x: m.cx, y: m.cy };
    this._emit(ev);
    var h0 = this._lastHintT;
    this._noProgress(true);
    if (this._lastHintT !== h0) ev.hint = true;   // this miss triggered the hint (main says a short pointer line)
  };
  P._noProgress = function (miss) {
    var cfg = this.cfg;
    this._noProg++;
    if ((miss && this.misses >= cfg.hintAfterMisses) || this._noProg >= cfg.hintAfterSoft) this._autoHint(false);
    if (this._noProg >= cfg.assistAfter && !this.assistId) {
      var a = this.odd;
      if (a && a.state === 'stand') { this.assistId = a.id; this._emit({ type: 'assistArmed', id: a.id, x: a.cx, y: a.cy }); }
    }
  };
  P._pokeBo = function () {
    var B = this.layout.bo, a = this.prompt(), gate = this.state === 'roundDone' && this.phase === 'gate' && !this._doorOpened;
    // outside play / gate (enter, hop, march …) the poke still fires, without a prompt: main only barks / giggles
    this._touch();
    this._mood('talk', 1.0);
    var ev = { type: 'pokeBo', x: B.x, y: B.y - 0.7 * B.h };
    if (gate) ev.gate = true; else if (a) { ev.promptKey = a.promptKey; ev.params = a.params; ev.rule = a.rule; } else ev.busy = true;
    this._emit(ev);
    return 'pokeBo';
  };
  P._puff = function (x, y) { this.puffs.push({ x: x, y: y, t: 0, T: this.cfg.puffTime, r: 14, alpha: 1 }); };

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
    var m = this.odd, cfg = this.cfg, cur = this.cur;
    if (!m || !this.interactive || m.state !== 'stand') return null;
    m._glowT = cfg.hintTime;
    this.hintHand = { id: m.id, mode: 'tap', x: m.cx, y: m.cy, _px: m.cx, _py: m.cy, t: 0, press: 0, alpha: 0, time: 0, T: cfg.hintTime };
    this._stepHint(0);
    this._lastHintT = this.time;
    this._mood('point', cfg.hintTime);
    var ev = { type: 'hint', id: m.id, mode: 'tap', x: m.cx, y: m.cy, want: { kind: cur.rule.kind, value: cur.rule.value, nameKind: cur.rule.nameKind, promptKey: cur.promptKey, params: cur.params } };
    if (fromIdle) ev.idle = true;
    this._emit(ev);
    return { member: m.id };
  };
  /** Manual hint (a tap on the bubble): the odd one glows + the ghost hand taps it; in the gate: the hand points at the doors. */
  P.hint = function () {
    if (this.state === 'roundDone' && this.phase === 'gate' && !this._doorOpened) { this._doorHand(); return { door: true }; }
    if (!this.interactive) return null;
    if (this.hintHand) return { member: this.hintHand.id };
    return this._doHint(false);
  };
  P._doorHand = function () {
    if (this.hintHand && this.hintHand.mode === 'door') return;
    var d = this.layout.barn.door;
    this.hintHand = { id: null, mode: 'door', x: d.x, y: d.top + d.h / 2, _px: d.x, _py: d.top + d.h / 2, t: 0, press: 0, alpha: 0, time: 0, T: 1e9 };
    this._stepHint(0);
    this._mood('point', 1.6);
    if (!this._gateHinted) { this._gateHinted = true; this._emit({ type: 'gateHint', x: d.x, y: d.top + d.h / 2 }); }
  };
  /** Ghost hand (1.6 s cycle): glides in from below-right, taps the target twice, drifts back fading. Fingertip = (x, y). */
  P._stepHint = function (h) {
    var H = this.hintHand, cfg = this.cfg;
    if (!H) return;
    H.time += h;
    var tx, ty;
    if (H.mode === 'tap') {
      var m = this.memberById(H.id);
      if (!m || m.state !== 'stand' || H.time >= H.T || !this.interactive) { this.hintHand = null; return; }
      tx = m.cx + 6; ty = m.cy + 10;
    } else {
      if (!(this.state === 'roundDone' && this.phase === 'gate' && !this._doorOpened)) { this.hintHand = null; return; }
      var d = this.layout.barn.door; tx = d.x + 6; ty = d.top + d.h * 0.55;
    }
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
  P._twin = function (m) { m._px = m.x; m._py = m.y; m._prot = m.rot; m._psx = m.sx; m._psy = m.sy; m._pbob = m.bob; m._pscale = m.scale; m._pwheel = m.wheel; m._palpha = m.alpha; };
  P._twins = function () {
    var i, o;
    for (i = 0; i < this.members.length; i++) this._twin(this.members[i]);
    for (i = 0; i < this.fireflies.length; i++) { o = this.fireflies[i]; o._px = o.x; o._py = o.y; }
    if (this.chick) { o = this.chick; o._px = o.x; o._py = o.y; o._palpha = o.alpha; }
    if (this.rooster) { o = this.rooster; o._px = o.x; o._py = o.y; }
    if (this.hintHand) { this.hintHand._px = this.hintHand.x; this.hintHand._py = this.hintHand.y; }
    this.stage._ppop = this.stage.pop; this.barn._pdoor = this.barn.door; this.barn._pvane = this.barn.vane;
    this.bo._phop = this.bo.hop;
  };
  P._step = function (h) {
    var cfg = this.cfg;
    this._twins();
    this.time += h; this.stateTime += h; this.phaseTime += h;
    switch (this.state) {
      case 'intro': if (this.stateTime >= cfg.introTime) this._beginRound(); break;
      case 'round': this._stepRound(h); break;
      case 'roundDone': this._stepRoundDone(h); break;
      case 'talk':
        if (this.talkAnswered) { if (this.stateTime >= cfg.talkAfterAnswer) this._levelDone(); break; }
        this._talkAskT += h;
        if (this._talkAsks < cfg.talkMaxAsks && this._talkAskT >= cfg.talkAskTime - 1e-9) {
          this._talkAskT = 0; this._talkAsks++;
          if (this._talkAsks >= cfg.talkGlowAfterAsks) this.talk.glowAnswer = true;
          this._emit({ type: 'talkAsk', talk: this.talk, n: this._talkAsks, glowAnswer: this.talk.glowAnswer });
        } else if (this._talkAsks >= cfg.talkMaxAsks && this._talkAskT >= cfg.talkGiveUp - 1e-9) this.talkAnswer(this.talk.answer, true);   // Bo answers
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
    if (this.state === 'round' || this.state === 'roundDone') {
      this._stepMembers(h); this._stepStage(h); this._stepSurprises(h); this._stepHint(h);
    }
    this._stepBarn(h); this._stepPuffs(h);
    this._stepBo(h);
  };

  P._stepRound = function (h) {
    var cfg = this.cfg;
    switch (this.phase) {
      case 'enter':
        if (this.phaseTime >= cfg.enterMin && this.members.every(function (m) { return m.state === 'stand'; }) && this.members.every(function (m) { return !m.walking; })) {
          this._setPhase('play'); this._ask(true);
        }
        break;
      case 'play':
        if (!this._g) {
          this._idleT += h;
          if (this._idleT >= this._idleGap - 1e-9) {
            this._idleT = 0; this._idleGap = Math.min(cfg.idleMax, this._idleGap * cfg.idleBackoff); this._idleN++;
            this._mood('think');
            this._emit({ type: 'idle', n: this._idleN, promptKey: this.cur.promptKey, params: this.cur.params, rule: this.cur.rule });
            if (this._idleN >= cfg.idleHintFrom) this._autoHint(true);
          }
        }
        // a standing member now and then does a little look-around hop (cosmetic)
        this._lookHopT -= h;
        if (this._lookHopT <= 0) {
          this._lookHopT = this._crng.float(cfg.lookHopEvery[0], cfg.lookHopEvery[1]);
          var st = this.members.filter(function (m) { return m.state === 'stand' && !m.walking && m._jumpT < 0; });
          if (st.length) this._jump(this._crng.pick(st), cfg.lookHopH, cfg.lookHopT);
        }
        break;
      case 'hop': {
        var o = this.odd, self = this;
        if (this._gapAt >= 0 && this.time >= this._gapAt) { this._gapAt = -1; this._closeGap(); }
        if (!o || o.state !== 'stage' || this._landT < 0) break;
        var countDone = o.thing.kind !== 'crate' || (o._countDoneT >= 0 && this.time >= o._countDoneT + cfg.countTail);
        var settled = this._gapAt < 0 && this.members.every(function (m) { return m === o || m.state !== 'stand' || !m.walking; });
        if (countDone && settled && this.time >= this._landT + cfg.landHold) this._roundDone();
        void self;
        break;
      }
    }
  };
  P._closeGap = function () {
    var L = this.layout, line = this._lineMembers(), sl = slotsFor(L, line.length, this.cfg), cfg = this.cfg;
    line.forEach(function (m, k) { m.slot = k; m.tx = sl[k].x; m.vmax = cfg.walkMax; });
    this._emit({ type: 'gap', n: line.length, x: (L.line.x0 + L.line.x1) / 2, y: L.line.y });
  };
  P._starsFor = function (m) { return m <= 0 ? 3 : m === 1 ? 2 : 1; };
  P._roundDone = function () {
    var st = this._starsFor(this.misses), cur = this.cur;
    if (this._roundAssisted) st = Math.min(st, 2);   // an assisted round ≤ 2★
    this.roundStars = st; this.stars += st; this.levelStars += st;
    var rk = cur.rule;
    this._prevRuleRun = this._prevRule && this._prevRule.kind === rk.kind && String(this._prevRule.value) === String(rk.value) ? this._prevRuleRun + 1 : 1;
    this._prevRule = { kind: rk.kind, value: rk.value }; this._prevOddSlot = cur.oddSlot; this._prevOddSlots = [cur.oddSlot].concat(this._prevOddSlots).slice(0, 2);
    this.cancelDrag(); this.hintHand = null; this.assistId = null;
    this._setState('roundDone'); this._setPhase('gate');
    this._mood('cheer', 1.2); this._boHop();
    var c = this._lineCentre(), d = this.layout.barn.door;
    this._emit({ type: 'roundDone', round: this.round, stars: st, misses: this.misses, assisted: !!this._roundAssisted, x: c.x, y: c.y });
    this._emit({ type: 'gateAsk', x: d.x, y: d.top + d.h / 2 });
  };
  P._openDoor = function (auto, x, y) {
    if (this._doorOpened) return;
    var d = this.layout.barn.door;
    this._doorOpened = true; this._doorOpenT = this.time; this.barn.doorTarget = 1; this.hintHand = null; this._gateAutoPrev = !!auto;
    this._mood('happy', 1.0);
    this._emit({ type: 'doorOpen', auto: !!auto, x: d.x, y: d.top + d.h / 2, tapX: x, tapY: y });
  };
  P._stepRoundDone = function (h) {
    var cfg = this.cfg;
    if (this.phase === 'gate') {
      if (!this._doorOpened) {
        if (this.phaseTime >= cfg.gateHandAfter && !this.hintHand) this._doorHand();
        // after a gate that opened by itself, the next gate of the chapter opens sooner (a door tap restores gateWait)
        if (this.phaseTime >= (this._gateAutoPrev ? cfg.gateWaitAfterAuto : cfg.gateWait) - 1e-9) this._openDoor(true);
      } else if (this.time - this._doorOpenT >= cfg.doorMarchAt - 1e-9) this._startMarch();
    } else if (this.phase === 'march') {
      this._stepMarch(h);
    } else if (this.phase === 'out' && this.phaseTime >= cfg.outTime) this._nextRound();
  };
  /** march: the friends walk in step (one shared step clock) into the doorway, one after another. */
  P._startMarch = function () {
    var cfg = this.cfg, L = this.layout, d = L.barn.door;
    var ms = this.members.filter(function (m) { return m.state === 'stand'; }), minX = 1e9;
    ms.forEach(function (m) { minX = Math.min(minX, m.x); });
    if (this.chick && this.chick.state !== 'gone') minX = Math.min(minX, this.chick.x);
    var dist = Math.max(0, d.x - minX) + d.w * cfg.inWalk;
    var v = clamp(dist / cfg.marchTime, cfg.marchSpeed[0], cfg.marchSpeed[1]);
    this._march = { v: v, t: 0, ph: 0, i: 0, paradeAt: -1 };
    ms.forEach(function (m) { m.state = 'march'; m.walking = true; m.tx = d.x; });
    if (this.chick && this.chick.state !== 'gone' && this.chick.state !== 'in') { this.chick.state = 'march'; }
    this._setPhase('march');
    this._mood('cheer', 2.5);
    this.fireflies.forEach(function (f) { if (f.state !== 'zip') { f.state = 'zip'; f.zt = 0; } });
    this._surpriseAt = -1;
    this._emit({ type: 'marchStart', n: ms.length, v: v, x: (L.line.x0 + L.line.x1) / 2, y: L.line.y });
  };
  P._stepMarch = function (h) {
    var M = this._march, cfg = this.cfg, L = this.layout, d = L.barn.door, self = this;
    if (!M) return;
    M.t += h;
    var v = M.v * smooth(M.t / cfg.marchAccel), wrap = false;
    M.ph += cfg.marchRate * h * smooth(M.t / cfg.marchAccel + 0.3);
    if (M.ph >= 1) { M.ph -= 1; wrap = true; M.i++; }
    var u = M.ph, bob = cfg.marchH * 4 * u * (1 - u), anyMarch = false;
    this.members.forEach(function (m) {
      if (m.state !== 'march' && m.state !== 'in') return;
      m.vx = v; m.x += v * h; m.wheel += v * h / (cfg.wagonR * m.size);
      m._stepBob = m.thing.kind === 'animal' ? bob : bob * 0.35; m.stepT = u;
      if (wrap) { m.step ^= 1; m.qV += kickFor(m.thing.kind === 'animal' ? cfg.squashStep : cfg.squashWagon, cfg.squashOmega, cfg.squashZeta); }
      var hw = m.size * 0.45;
      if (!m.clip && m.x + hw > d.l) m.clip = true;
      if (m.state === 'march' && m.x >= d.x) { m.state = 'in'; self._emit({ type: 'inBarn', id: m.id, x: d.x, y: d.y - d.h / 2 }); }
      if (m.state === 'in') {
        var k = (m.x - d.x) / Math.max(1, d.w * cfg.inWalk);
        m.scale = lerp(1, cfg.inShrink, smooth(k));
        m.alpha = 1 - smooth((m.x - d.x - d.w * 0.15) / Math.max(1, d.w * cfg.inFade));
        if (m.alpha <= 0) { m.alpha = 0; m.state = 'gone'; m.walking = false; }
      }
      if (m.state === 'march') anyMarch = true;
    });
    if (wrap) this._emit({ type: 'marchStep', i: M.i, x: (L.line.x0 + L.line.x1) / 2, y: L.line.y });
    var c = this.chick, chickBusy = c && (c.state === 'march' || c.state === 'run' || c.state === 'peck');
    if (M.paradeAt < 0 && !anyMarch && !chickBusy) {
      M.paradeAt = this.time;
      this.barn.vaneSpin += cfg.vaneKick;
      // the chapter's last round is a grand parade: Bo dances (main adds the long fanfare + a confetti burst)
      var grand = this.round >= cfg.roundsPerLevel - 1;
      if (grand) this._mood('dance', cfg.grandDance); else this._mood('cheer', 1.6);
      this._boHop();
      var o = this.odd;
      if (o && o.state === 'stage') this._leave(o);
      this._emit({ type: 'parade', round: this.round, grand: grand, x: L.barn.roof.x, y: L.barn.roof.y });
    }
    if (M.paradeAt >= 0 && this.time - M.paradeAt >= cfg.outDelay - 1e-9) this._startOut();
  };
  /** out: the doors swing shut; then the next round (or Talk time). */
  P._startOut = function () {
    var d = this.layout.barn.door;
    this._setPhase('out');
    this.barn.doorTarget = 0;
    this._emit({ type: 'doorClose', x: d.x, y: d.top + d.h / 2 });
  };
  P._nextRound = function () {
    var cfg = this.cfg;
    this._clearRound(true); this.cur = null;
    this.round++;
    var el = this.time - this.levelStartTime, long = this.round >= cfg.chapterMinRounds && el > cfg.chapterTimeLimit;
    if (this.round < this.roundsPerLevel && !long) this._beginRound();
    else { if (this.round < this.roundsPerLevel) this.roundsPerLevel = this.round; this._startTalk(); }
  };

  // ---------------------------------------------------------------- members
  P._jump = function (m, H, T) { m._jumpT = 0; m._jumpH = H; m._jumpDur = T; };
  /** Starts the right answer's hop: a short crouch, then a ballistic arc onto the stage. */
  P._launch = function (m) { m.state = 'hop'; m.hopT = 0; m._f = null; m._ft = 0; m.walking = false; m.vx = 0; m._jumpT = -1; m.jump = 0; };
  P._land = function (m) {
    var cfg = this.cfg, st = this.stage;
    m.state = 'stage'; m.x = st.x; m.y = st.y; m.scale = st.s; m.spin = 0; m._f = null;
    m.qV += kickFor(cfg.squashLand, cfg.squashOmega, cfg.squashZeta);
    st.popV += kickFor(cfg.stagePop, cfg.stageOmega, cfg.stageZeta); st.memberId = m.id;
    if (this.cur && this.cur.rule.kind === 'home') st.badge = { home: m.thing.home, a: 0 };
    if (m.thing.kind === 'crate') { m.count = 0; m._countAt = this.time + cfg.countDelay; }
    this._landT = this.time;
    this._puff(st.x, st.y);
    this._pose(m);
    this._emit({ type: 'land', id: m.id, x: st.x, y: st.y });
  };
  /** The odd one leaves the other way: a hop down off the stage, then animals bounce-walk / objects roll off to the left edge. */
  P._leave = function (m) {
    var L = this.layout;
    m.state = 'leave'; m.face = -1; m.walking = true;
    m._lv = { phase: 'drop', ft: 0, f: arc(m.x, m.y, m.x - 150, L.line.y, this.cfg.leaveDrop, 40, 0), s0: m.scale };
    this._emit({ type: 'leave', id: m.id, home: m.thing.home || null, x: m.cx, y: m.cy });
  };
  P._stepMembers = function (h) {
    var cfg = this.cfg, L = this.layout, self = this, t = this.phaseTime;
    for (var i = 0; i < this.members.length; i++) {
      var m = this.members[i], walker = m.thing.kind === 'animal';
      if (m.state === 'gone') continue;
      if (m.state !== 'march' && m.state !== 'in') m._stepBob = 0;   // marchers: the shared bob set by _stepMarch
      if (m.state === 'enter' || m.state === 'stand') {
        if (m.state === 'enter' && this.phase === 'enter' && t < m._spawnAt) { m.x = m._spawnX; m.vx = 0; m.y = L.line.y; m.walking = false; }
        else {
          // speed-capped critically-damped-ish spring towards the slot + a step cycle while moving
          var dx = m.tx - m.x;
          m.vx += (cfg.walkOmega * cfg.walkOmega * dx - 2 * cfg.walkZeta * cfg.walkOmega * m.vx) * h;
          m.vx = clamp(m.vx, -m.vmax, m.vmax);
          m.x += m.vx * h; m.y = L.line.y;
          var sp = Math.abs(m.vx), moving = sp > cfg.walkMin || Math.abs(dx) > 1.5;
          if (!walker) m.wheel += m.vx * h / (cfg.wagonR * m.size);
          if (moving || m.stepT > 0) {
            var rate = clamp(cfg.stepRate[0] + sp / cfg.stepRef, cfg.stepRate[0], cfg.stepRate[1]);
            m.stepT += rate * h;
            if (m.stepT >= 1) {
              m.stepT = moving ? m.stepT - 1 : 0; m.step ^= 1;
              m.qV += kickFor(walker ? cfg.squashStep : cfg.squashWagon, cfg.squashOmega, cfg.squashZeta);
              if (m.x > L.ins.left - m.size * 0.5) self._emit({ type: 'step', id: m.id, kind: walker ? 'animal' : 'wagon', x: m.x, y: m.y });
            }
            var H = walker ? lerp(cfg.stepH[0], cfg.stepH[1], Math.min(1, sp / 500)) : cfg.wagonStepH;
            m._stepBob = m.stepT > 0 ? H * 4 * m.stepT * (1 - m.stepT) : 0;
          }
          m.walking = moving || m.stepT > 0;
          if (!walker) m.face = 1;   // wagons roll backwards: an instant mirror reads as a glitch
          else if (Math.abs(m.vx) > 30) m.face = m.vx > 0 ? 1 : -1; else if (!m.walking) m.face = 1;
          if (m.state === 'enter' && Math.abs(dx) < cfg.arriveEps && sp < cfg.arriveV && m.stepT === 0) {
            m.state = 'stand'; m.walking = false;
            m.qV = Math.max(m.qV, kickFor(cfg.squashSettle, cfg.squashOmega, cfg.squashZeta));   // a little settle squash (never stacked)
            self._pose(m);
            self._emit({ type: 'memberIn', id: m.id, i: m.slot, x: m.cx, y: m.cy });
          }
        }
      } else if (m.state === 'hop') this._stepHop(m, h);
      else if (m.state === 'stage') {
        m.x = this.stage.x; m.y = this.stage.y; m.scale = this.stage.s;
        if (this.phase === 'march' && m._jumpT < 0) { m._waveT -= h; if (m._waveT <= 0) { m._waveT = cfg.waveEvery; this._jump(m, cfg.waveHop, cfg.waveHopT); } }
      } else if (m.state === 'leave') this._stepLeave(m, h);
      // march / in: moved by _stepMarch (state roundDone)
      // ---- common: tilt (speed lean), wiggle, squash, jumps, breathing, glow, counting
      var lean = cfg.tiltMax * clamp(m.vx / cfg.tiltRef, -1, 1) * (walker ? 1 : 0.5);
      if (m.state === 'hop' || m.state === 'stage') lean = 0;
      spring(m, 'tilt', 'tiltV', lean, cfg.tiltOmega, cfg.tiltZeta, h);
      m.rotV += (-cfg.wigOmega * cfg.wigOmega * m.wig - 2 * cfg.wigZeta * cfg.wigOmega * m.rotV) * h; m.wig += m.rotV * h;
      if (m.state !== 'hop' || m.hopT > cfg.crouch) { spring(m, 'q', 'qV', 0, cfg.squashOmega, cfg.squashZeta, h); m.q = clamp(m.q, -cfg.qMax, cfg.qMax); }
      m.sx = 1 + m.q; m.sy = 1 / (1 + m.q);
      m.rot = m.tilt + m.wig + m.spin;
      if (m._jumpT >= 0) {
        m._jumpT += h; var uj = m._jumpT / m._jumpDur;
        if (uj >= 1) { m._jumpT = -1; m.jump = 0; m.qV += kickFor(cfg.squashSettle, cfg.squashOmega, cfg.squashZeta); }
        else m.jump = m._jumpH * 4 * uj * (1 - uj);
      }
      var standing = (m.state === 'stand' || m.state === 'stage') && !m.walking;
      m._breathK = clamp(m._breathK + (standing ? h : -h) * 4, 0, 1);
      m.breath = cfg.breathAmp * (0.5 + 0.5 * Math.sin(TAU * cfg.breathHz * this.time + m._ph)) * m._breathK;
      m.bob = m._stepBob + m.jump + m.breath;
      if (m._glowT > 0) m._glowT = Math.max(0, m._glowT - h);
      if (m._flashT > 0) m._flashT = Math.max(0, m._flashT - h);
      var gT = this.assistId === m.id ? 1 : m._glowT > 0 ? 0.55 + 0.45 * Math.sin(TAU * 1.6 * this.time) : 0;
      gT = Math.max(gT, m._flashT);
      m.glow += (gT - m.glow) * Math.min(1, h * (gT > m.glow ? 10 : 4));
      if (m.thing.kind === 'crate' && m.count >= 0 && m.count < m.thing.n && m._countAt >= 0) {
        var k = Math.min(m.thing.n, Math.floor((this.time - m._countAt) / cfg.countStep + 1e-9) + 1);
        if (this.time >= m._countAt && k > m.count) {
          m.count = k;
          m.qV += kickFor(0.04, cfg.squashOmega, cfg.squashZeta);
          this._pose(m);
          this._emit({ type: 'count', id: m.id, i: k, n: m.thing.n, x: m.cx, y: m.cy });
          if (k >= m.thing.n) m._countDoneT = this.time;
        }
      }
      this._pose(m);
    }
    void self;
  };
  P._stepHop = function (m, h) {
    var cfg = this.cfg, L = this.layout, st = this.stage;
    m.hopT += h;
    if (!m._f) {   // crouch (squash down), then take-off with a stretch
      m.q = cfg.crouchQ * smooth(m.hopT / cfg.crouch); m.qV = 0;
      if (m.hopT >= cfg.crouch) {
        m._f = arc(m.x, m.y, st.x, st.y, cfg.hopTime, cfg.hopApex, 0, L.hopMinY); m._ft = 0; m._dir = st.x >= m.x ? 1 : -1; m._s0 = m.scale;
        m.q = -cfg.stretchTake; m.qV = 0;
        this._emit({ type: 'hop', id: m.id, x: m.cx, y: m.cy });
      }
      return;
    }
    m._ft += h;
    var f = m._f, u = clamp(m._ft / f.T, 0, 1), p = arcAt(f, Math.min(m._ft, f.T));
    m.x = p.x; m.y = p.y; m.scale = lerp(m._s0, st.s, smooth(u)); m.spin = cfg.hopSpin * Math.sin(Math.PI * u) * m._dir;
    if (m._ft >= f.T - 1e-9) this._land(m);
  };
  P._stepLeave = function (m, h) {
    var cfg = this.cfg, L = this.layout, lv = m._lv, walker = m.thing.kind === 'animal';
    if (lv.phase === 'drop') {
      lv.ft += h;
      var u = clamp(lv.ft / lv.f.T, 0, 1), p = arcAt(lv.f, Math.min(lv.ft, lv.f.T));
      m.x = p.x; m.y = p.y; m.scale = lerp(lv.s0, 1, u);
      if (u >= 1) { lv.phase = 'run'; m.y = L.line.y; m.scale = 1; m.vx = -cfg.leaveSpeed; m.qV += kickFor(cfg.squashLand, cfg.squashOmega, cfg.squashZeta); }
      return;
    }
    m.vx = -cfg.leaveSpeed; m.x += m.vx * h; m.y = L.line.y;
    if (walker) {
      m.stepT += cfg.stepRate[1] * h;
      if (m.stepT >= 1) { m.stepT -= 1; m.step ^= 1; m.qV += kickFor(cfg.squashStep, cfg.squashOmega, cfg.squashZeta); }
      m._stepBob = cfg.leaveStepH * 4 * m.stepT * (1 - m.stepT);
    } else m.wheel += m.vx * h / (cfg.wagonR * m.size);
    if (m.x < L.exitX) { m.state = 'gone'; m.walking = false; m.alpha = 0; }
  };
  P._stepStage = function (h) {
    var cfg = this.cfg, st = this.stage;
    spring(st, 'pop', 'popV', 0, cfg.stageOmega, cfg.stageZeta, h);
    if (st.badge) st.badge.a = Math.min(1, st.badge.a + h * cfg.badgeRate);
  };
  P._stepBarn = function (h) {
    var cfg = this.cfg, b = this.barn;
    spring(b, 'door', 'doorV', b.doorTarget, cfg.doorOmega, cfg.doorZeta, h);
    if (b.door < 0) { b.door = 0; b.doorV = -0.3 * b.doorV; }
    b.vaneSpin *= Math.exp(-cfg.vaneDrag * h);
    b.vane += (b.vaneSpin + cfg.vaneWind * Math.sin(0.7 * this.time)) * h;
  };
  P._stepPuffs = function (h) {
    for (var i = this.puffs.length - 1; i >= 0; i--) {
      var p = this.puffs[i]; p.t += h;
      var u = p.t / p.T; p.alpha = 1 - u; p.r = 14 + 22 * smooth(u);
      if (u >= 1) this.puffs.splice(i, 1);
    }
  };

  // ---------------------------------------------------------------- surprises
  /** Where the chick waits: on the path at the tail of the line (else the first clear spot to the right / a bit in front), clear
   *  of the members' hit circles, Bo, the doorway and the HUD. */
  P._chickSpot = function () {
    var L = this.layout, cfg = this.cfg, sl = slotsFor(L, Math.max(1, this._lineMembers().length || L.n), cfg), self = this;
    var tail = sl[0].x - 0.5 * L.sp - 40, ys = [L.line.y + 44, L.line.y + 70, L.line.y + 100].filter(function (y) { return y <= L.groundY - 6; });
    if (!ys.length) ys = [L.line.y + 30];
    var hb = cfg.chickH / 2, cr = cfg.chickR;
    function clear(x, y) {
      var cy = y - hb;
      if (x < L.ins.left + 40 || x > L.W - L.ins.right - 40) return false;
      for (var i = 0; i < sl.length; i++) if (hyp(x - sl[i].x, cy - (L.line.y - L.item / 2)) < L.hitR + 16) return false;
      if (inBox(L.boBox, x, cy, cr * 0.5) || inBox(L.barn.door.box, x, cy, 10)) return false;
      return self._clearOfKeep(x, cy, cr);
    }
    for (var k = 0; k < ys.length; k++) {
      for (var x = Math.max(L.ins.left + 40, tail); x < L.W - L.ins.right - 40; x += 12) if (clear(x, ys[k])) return { x: x, y: ys[k] };
    }
    return { x: clamp(tail, L.ins.left + 40, L.W - 40), y: ys[ys.length - 1] };
  };
  P._tapChick = function () {
    var c = this.chick, h = this.chickHit() || { x: c.x, y: c.y };
    c.flap = 1; c.flapT = this.cfg.chickFlapTime;
    this._emit({ type: 'chickTap', x: h.x, y: h.y });
  };
  /** The rooster's fence-top spot: ≥ 120 px from the stage (and its member), the badge and the bubble; never over the barn, Bo,
   *  the HUD or a member. */
  P._roosterSpot = function () {
    var L = this.layout, cfg = this.cfg, y = L.fenceY, cy = y - cfg.roosterLift, st = L.stage, ok = [];
    for (var x = L.ins.left + 80; x <= L.W - L.ins.right - 80; x += 20) {
      if (hyp(x - st.x, cy - (st.y - L.item * st.s * 0.5)) < cfg.roosterClear + L.item * 0.5) continue;
      if (Math.abs(x - st.x) < cfg.roosterClear) continue;
      if (hyp(x - L.homeBadge.x, cy - L.homeBadge.y) < L.homeBadge.r + cfg.roosterR + 20) continue;
      if (boxDist(L.bubble, x, cy) < cfg.roosterClear) continue;
      if (inBox(L.barn.box, x, cy, 40) || inBox(L.boBox, x, cy, 30)) continue;
      // never on the roof / weathervane: the barn incl. the vane and the rooster's own height
      var bbx = L.barn.box;
      if (x > bbx.x - cfg.roosterR && x < bbx.x + bbx.w + cfg.roosterR && y > bbx.y - 120) continue;
      if (!this._clearOfKeep(x, cy, cfg.roosterR * 2)) continue;
      if (this._onMember(x, cy, cfg.roosterR * 0.5)) continue;
      ok.push(x);
    }
    var px = ok.length ? ok[Math.floor(this._crng.next() * ok.length)] : L.ins.left + 80;
    return { x: px, y: y };
  };
  P._tapRooster = function () {
    var r = this.rooster, h = this.roosterHit() || { x: r.x, y: r.y };
    r.crow = 1; r.crowT = this.cfg.roosterCrowT; r.stay = Math.min(r.stay, this.cfg.roosterStay - this.cfg.roosterCrowT - 0.2);
    this._emit({ type: 'roosterTap', x: h.x, y: h.y });
  };
  /** Firefly anchors: between the members, just above their heads. */
  P._fireflyAnchors = function () {
    var L = this.layout, sl = slotsFor(L, Math.max(1, this._lineMembers().length || L.n), this.cfg), xs = [];
    xs.push(sl[0].x - L.sp * 0.5);
    for (var i = 1; i < sl.length; i++) xs.push((sl[i].x + sl[i - 1].x) / 2);
    xs.push(sl[sl.length - 1].x + L.sp * 0.5);
    var y0 = L.line.y - L.item - 0.6 * L.hitR;
    this.fireflies.forEach(function (f, k) {
      f.ax = xs[k % xs.length] + (k >= xs.length ? 26 : 0);
      f.ay = y0 - ((k * 37) % 50);
    });
  };
  P._tapFirefly = function (f) {
    f.state = 'zip'; f.zt = 0; f.glow = 1.6; f.tapped = true;
    this._emit({ type: 'fireflyTap', x: f.x, y: f.y });
  };
  P._spawnSurprise = function () {
    var cfg = this.cfg, L = this.layout, r = this._crng, i;
    if (this.surprise === 'chick' && !this.chick) {
      var sp = this._chickSpot();
      this.chick = { x: L.entryX, y: sp.y, _px: L.entryX, _py: sp.y, tx: sp.x, ty: sp.y, step: 0, stepT: 0, flap: 0, flapT: 0, peck: 0, state: 'run', t: 0,
        face: 1, alpha: 1, _palpha: 1, scale: 1 };
      this._emit({ type: 'chick', x: sp.x, y: sp.y - cfg.chickH / 2 });
    } else if (this.surprise === 'rooster' && !this.rooster) {
      var rs = this._roosterSpot(), sx = rs.x < L.W / 2 ? -60 : L.W + 60;
      this.rooster = { x: sx, y: rs.y - 160, _px: sx, _py: rs.y - 160, crow: 0, crowT: 0, flap: 1, state: 'in', t: 0, stay: 0, face: rs.x < L.W / 2 ? 1 : -1,
        f: arc(sx, rs.y - 160, rs.x, rs.y, cfg.roosterIn, 30, 0), ft: 0 };
      this._emit({ type: 'rooster', x: rs.x, y: rs.y - cfg.roosterLift });
    } else if (this.surprise === 'fireflies' && !this.fireflies.some(function (q) { return q.state !== 'zip'; })) {
      for (i = 0; i < cfg.fireflyN; i++) {
        var fx = r.float(L.line.x0, L.line.x1);
        this.fireflies.push({ x: fx, y: -30, _px: fx, _py: -30, r: 10, glow: 0, phase: r.float(0, TAU), state: 'in', t: -i * cfg.fireflyStagger, sx: fx, sy: -30, ax: 0, ay: 0, zt: 0, vx: 0, vy: 0 });
      }
      this._fireflyAnchors();
      var c0 = this._lineCentre();
      this._emit({ type: 'fireflies', n: cfg.fireflyN, x: c0.x, y: L.line.y - L.item });
    }
  };
  P._stepSurprises = function (h) {
    var cfg = this.cfg, L = this.layout, r = this._crng, i;
    if (this._surpriseAt >= 0 && this.time >= this._surpriseAt && (this.phase === 'play' || this.phase === 'hop' || this.phase === 'gate')) {
      this._surpriseAt = -1; this._spawnSurprise();
    }
    // ---- chick: scurries in from the left to the tail of the line, pecks; marches into the barn last
    var c = this.chick;
    if (c) {
      c.t += h;
      if (c.flapT > 0) { c.flapT -= h; c.flap = clamp(c.flapT / cfg.chickFlapTime, 0, 1); } else c.flap = 0;
      if (c.state === 'run') {
        var dx = c.tx - c.x;
        c.x += clamp(dx, -cfg.chickSpeed * h, cfg.chickSpeed * h); c.y = c.ty;
        c.stepT += cfg.chickStepRate * h; if (c.stepT >= 1) { c.stepT -= 1; c.step ^= 1; }
        if (Math.abs(dx) < 1) { c.x = c.tx; c.state = 'peck'; c.step = 0; }
      } else if (c.state === 'peck') {
        c.peck = Math.max(0, Math.sin(TAU * 1.3 * c.t)); c.step = 0;
      } else if (c.state === 'march' && this._march) {
        var M = this._march, v = M.v * smooth(M.t / cfg.marchAccel), d = L.barn.door;
        // it follows the last marcher at a little distance (or walks on when it is the last one)
        var last = null;
        this.members.forEach(function (m) { if (m.state === 'march' && (!last || m.x < last.x)) last = m; });
        var maxX = last ? last.x - L.item * 0.55 : 1e9;
        c.x = Math.min(c.x + v * 1.05 * h, Math.max(c.x, maxX));
        c.y += (L.line.y - c.y) * Math.min(1, h * 6);
        c.stepT += cfg.chickStepRate * h; if (c.stepT >= 1) { c.stepT -= 1; c.step ^= 1; }
        c.peck = 0;
        if (c.x >= d.x) { c.state = 'in'; this._emit({ type: 'inBarn', id: 'chick', x: d.x, y: d.y - d.h / 2 }); }
      } else if (c.state === 'in' && this._march) {
        var M2 = this._march, d2 = L.barn.door;
        c.x += M2.v * h;
        c.alpha = 1 - smooth((c.x - d2.x) / Math.max(1, d2.w * cfg.inFade));
        c.scale = cfg.inShrink + (1 - cfg.inShrink) * c.alpha;
        if (c.alpha <= 0) { c.alpha = 0; c.state = 'gone'; }
      }
    }
    // ---- rooster: flutters onto the fence top, stands (crows when tapped), flies off after ≈ 8 s
    var R2 = this.rooster;
    if (R2) {
      R2.t += h;
      if (R2.crowT > 0) { R2.crowT -= h; R2.crow = clamp(R2.crowT / cfg.roosterCrowT, 0, 1); } else R2.crow = 0;
      if (R2.state === 'in' || R2.state === 'leave') {
        R2.ft += h; var fp = arcAt(R2.f, Math.min(R2.ft, R2.f.T)); R2.x = fp.x; R2.y = fp.y; R2.flap = 0.5 + 0.5 * Math.sin(TAU * 7 * R2.ft);
        if (R2.state === 'in' && R2.ft >= R2.f.T) { R2.state = 'stand'; R2.flap = 0; R2.stay = 0; R2.f = null; }
        else if (R2.state === 'leave' && R2.ft >= R2.f.T) this.rooster = null;
      } else if (R2.state === 'stand') {
        R2.stay += h; R2.flap = 0;
        if (R2.stay >= cfg.roosterStay && R2.crowT <= 0) {
          R2.state = 'leave'; R2.ft = 0; var ex = R2.x < L.W / 2 ? -80 : L.W + 80; R2.face = ex < R2.x ? -1 : 1;
          R2.f = arc(R2.x, R2.y, ex, R2.y - 220, 1.0, 20, 0);
        }
      }
    }
    // ---- fireflies: drift down between the members' heads, glow, zip off when tapped (or after a while / at the march)
    for (i = this.fireflies.length - 1; i >= 0; i--) {
      var f = this.fireflies[i];
      f.t += h;
      var tw = 0.5 + 0.5 * Math.sin(TAU * 0.9 * f.t + f.phase);
      if (f.state === 'in') {
        if (f.t < 0) { f.glow = 0; f.x = f.sx; f.y = -30; continue; }
        var ui = smooth(f.t / cfg.fireflyInTime);
        f.x = lerp(f.sx, f.ax, ui) + 14 * Math.sin(TAU * 0.6 * f.t + f.phase); f.y = lerp(f.sy, f.ay, ui); f.glow = 0.4 + 0.6 * tw * ui;
        if (f.t >= cfg.fireflyInTime) f.state = 'drift';
      } else if (f.state === 'drift') {
        f.x = f.ax + 18 * Math.sin(TAU * 0.23 * f.t + f.phase); f.y = f.ay + 12 * Math.sin(TAU * 0.31 * f.t + 2 * f.phase); f.glow = 0.35 + 0.65 * tw;
        if (f.t >= cfg.fireflyInTime + cfg.fireflyStay) { f.state = 'zip'; f.zt = 0; }
      } else if (f.state === 'zip') {
        f.zt += h;
        if (!f.vx && !f.vy) { var ang = r.float(-2.6, -0.5); f.vx = Math.cos(ang) * 60; f.vy = Math.sin(ang) * 60; }
        f.vx *= 1 + 3 * h; f.vy *= 1 + 3 * h; f.x += f.vx * h; f.y += f.vy * h;
        f.glow = f.tapped ? Math.max(0, 1.6 - 1.2 * f.zt / cfg.fireflyZip) : Math.max(0, 1 - f.zt / cfg.fireflyZip);
        if (f.zt >= cfg.fireflyZip * 1.5 || f.y < -40 || f.x < -40 || f.x > L.W + 40) this.fireflies.splice(i, 1);
      }
    }
  };

  P._stepBo = function (h) {
    var b = this.bo, cfg = this.cfg, L = this.layout;
    b.x = L.bo.x; b.y = L.bo.y; b.h = L.bo.h; b.w = L.bo.w;
    if (b.moodT > 0) { b.moodT -= h; if (b.moodT <= 0) { b.moodT = 0; b.mood = b.mood === 'bark' ? 'happy' : 'idle'; if (b.mood === 'happy') b.moodT = cfg.moodTime.happy; } }
    b.blinkT -= h;
    if (b.blink && b.blinkT <= 0) { b.blink = false; b.blinkT = this._crng.float(cfg.blink[0], cfg.blink[1]); }
    else if (!b.blink && b.blinkT <= 0) { b.blink = true; b.blinkT = cfg.blinkTime; }
    if (b._hopT >= 0) { b._hopT += h; var u = b._hopT / cfg.boHopTime; b.hop = u < 1 ? Math.sin(Math.PI * u) : 0; if (u >= 1) b._hopT = -1; }
    this._lookT -= h;
    var tx = (L.line.x0 + L.line.x1) / 2;
    if (this._g) tx = this.finger.x;
    else if (this.hintHand) tx = this.hintHand.x;
    else if (this._lookT > 0) tx = this._lookX;
    else if (this.phase === 'march' || this.phase === 'gate') tx = L.barn.x;
    else if (this.chick) tx = this.chick.x;
    else if (this.rooster) tx = this.rooster.x;
    else if (this.fireflies.length) tx = this.fireflies[0].x;
    b.lookX += (tx - b.lookX) * Math.min(1, h * cfg.lookRate);
    b.look = clamp((b.lookX - b.x) / 500, -1, 1);
  };

  FP.World = World;
})(window.FP = window.FP || {});
