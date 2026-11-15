/* Nim's River Hop — NH.CONFIG + NH.World + NH.WindModel (headless, deterministic river-crossing simulation; DESIGN §2, §5.2)
 *
 * ============================== CONVENTIONS ==============================
 *  Units: logical px (short side 720), seconds, radians, y DOWN, rot > 0 clockwise. Screen space = world space (no camera).
 *  update(dt) runs fixed sub-steps of cfg.step (1/120 s). At the START of every sub-step each moving field is copied into its `_p`
 *  twin; render v = _v + (v − _v)·w.alpha.  Full render contract + event table: docs/MECHANICS.md.
 *
 *  STONES w.stones[] (row-major) = { id, row, i, thing, target, x, y (TOP-CENTRE of the top face, with every motion), hx, hy (home),
 *    seed, state 'hidden'|'rise'|'rest'|'sink'|'gone', riseT 0..1, dip (px, spring), dipV, tilt (rad, spring), tiltV, bob (px now),
 *    bobPh, sub 0..1 (how deep it sits in the water → StoneArt opt.dip), gold 0..1, glow 0..1, active 0..1, alpha 0..1, visited,
 *    thing motion: thingHop (px up), thingDx (px), thingS (scale), thingA (alpha), wig (rad), wigV, count (−1 | dots counted),
 *    badge {home, x, y, r, a} | null }  + _px _py _ptilt _psub _palpha _pthingHop _pthingDx _pthingS _pthingA _pwig _pgold
 *  NIM w.nim = { x, y (FEET), state 'stand'|'crouch'|'air'|'land'|'walk'|'roll', frame (svg frame to draw), mood, sx, sy, lean,
 *    rollRot, curl 0..1, onRow (−1 near bank, 0..k−1, k far bank), face 1, h, s (= h/300), fruits [kind…], ballX, ballY, ballR,
 *    backSlots [{x, y, rot}] / rollSlots [{x, y, rot}] (world px, current pose) }  + _px _py _psx _psy _plean _prollRot _pcurl
 * ========================================================================
 */
(function (NH) {
  'use strict';

  var CONFIG = {
    // ---- timing / state machine (s)
    step: 1 / 120, maxFrame: 1.0,
    roundsPerLevel: 4, chapterTimeLimit: 75, chapterMinRounds: 3,
    shortBudget: [1e9, 24, 42, 58],   // s into the chapter: a round starting later than this is short (2 rows × 2 stones)
    introTime: 2.5, levelDoneTime: 3.6,
    talkAfterAnswer: 1.6, talkAskTime: 12, talkGlowAfterAsks: 2, talkMaxAsks: 3, talkGiveUp: 2,

    // ---- layout (DESIGN §2; px)
    shortSide: 720, minLong: 960, maxLong: 1600, tallRatio: 1.6, phoneRatio: 1.9,
    bottomLand: 14, bottomPort: 26, bandGap: 10,
    bubbleX: 24, bubbleYLand: 18, bubbleMaxW: 700, bubbleRight: 200, bubbleHLand: 134, bubbleYPort: 110, bubbleHPort: 124,
    hudW: 160, hudH: 96, bubbleMinW: 220,
    nearW: 230, nearWMin: 190, farW: 210, farWMin: 170, nearH: 250, nearHMin: 200, farH: 220, farHMinPad: 20, farHPad: 40, tallNearK: 1.2, bankStep: 10,
    compactRatio: 1.6, compactNearMin: 170, compactFarMin: 150, compactGoalUp: 20,   // squat portraits (iPad 4:3): see computeLayout
    nimXLand: 120, nimDyLand: 40, nimDxPort: 60, nimYPortK: 0.62, goalUpPort: 30, goalXLand: 120,
    nimHLand: 190, nimHPort: 180, nimHPhonePort: 210,
    sBase: { 3: 150, 4: 150, 5: 140, 6: 128, 7: 128 }, sMin: 116, sStep: 4, itemK: 0.62,
    footBot: 0.4,            // a stone's footprint: x ± S/2, y − itemH … y + 0.4·S (top face 0.36·S + side 0.22·S below its centre line)
    pitchGapLand: 8,          // landscape: rows (columns) never overlap: pitch ≥ S + 8 (stricter than DESIGN's S·0.62 + 40)
    pitchPortK: 0.5, pitchPortGap: 30,   // portrait: pitch ≥ 0.5·S + itemH + 30 (DESIGN)
    acrossGap: 8, keepGap: 20, edgeGap: 6, riverPad: 12, landTopGap: 20, portSideK: 0.55,
    jitter: 18, spreadMin: 0.72,
    hitK: 0.45, hitPad: 14, hitPhone: 92, hitLift: 0.35, activeBias: 10,

    // ---- stones (DESIGN §5.2)
    dipOmega: 11, dipZeta: 0.22, tiltOmega: 9, tiltZeta: 0.18, bobAmp: 2, bobHz: [0.4, 0.6], gustTilt: 0.03, subK: 0.22,
    riseLead: 0.4, riseEach: 0.18, riseTime: 0.45, riseDepth: 0.35, riseOver: 8, askAfterRise: 0.35,
    sinkTime: 0.6, sinkDepth: 0.32, goldTime: 0.4, glideTime: 0.3, activeRate: 6,

    // ---- Nim's hop (crouch → ballistic arc → squash)
    crouchTime: 0.12, crouchSq: -0.16, hopTime: 0.46, hopRef: 220, hopTimeMin: 0.42, hopTimeMax: 0.62, apexMin: 70, apexK: 0.2,
    stretch: 0.12, fallStretch: 0.04, takeoffSqV: 5, landSq: -0.2, sqOmega: 16, sqZeta: 0.35, sxK: 0.6, landTime: 0.16, queueTime: 0.35, countHold: 0.5, nimTopGap: 8, apexMinCap: 40, phoneMaxDots: 10,
    leanOmega: 10, leanZeta: 0.45, leanWrong: 0.14, leanAir: 0.07, leanHold: 0.6,

    // ---- land / right
    landDipV: 160, landTilt: 0.05, rippleLife: 0.9, rippleR: [0.5, 1.05], rippleFlat: 0.38, rippleGap: 0.16, rippleCap: 40,
    dropN: 8, dropV: [150, 300], dropOut: [40, 140], dropG: 900, dropLife: 0.5, dropR: [3, 6], dropCap: 60, riseDrops: 3,
    thingHopH: 20, thingHopTime: 0.25, thingAwayTime: 0.5, thingAwayDelay: 0.1,
    showMove: 0.35, showScale: 1.25, countDelay: 0.45, countStep: 0.4, countTail: 0.35, badgeHold: 1.0, badgeRate: 6, badgeK: 0.42,

    // ---- wrong / ahead / soft
    wrongTilt: 0.14, wrongDipV: 90, wrongWig: 0.3, wigOmega: 16, wigZeta: 0.22, sameWrongWindow: 1.0, repeatNoProgress: 0.9, aheadDipV: 50, aheadTilt: 0.04, earlyTilt: 0.05,

    // ---- bank (≈ 2.2 s) + wipe
    bankDelay: 0.3, bankLandX: 40, bankHopTime: 0.46, landHold: 0.12, walkTime: 0.3, walkApex: 18, walkCrouch: 0.06,
    curlTime: 0.25, rollTime: 0.5, rollDist: 90, uncurlTime: 0.25, fruitGlide: 0.35, cheerHold: 0.45, rollLiftK: 0.55,
    fruitK: 0.28, fruitPopTime: 0.35, wipeTime: 1.3, wipeSwap: 0.5, wipeRise: 0.75,

    // ---- help (DESIGN §5.2 / skill rules)
    hintAfterMisses: 2, hintAfterSoft: 3, assistAfter: 5, hintTime: 5, hintCooldown: 6, hintCycle: 1.6,
    idleTime: 12, idleBackoff: 1.5, idleMax: 30, idleHintFrom: 2, tapMovePx: 24, pokeHopTime: 0.3, pokeApex: 22,

    // ---- surprises: one round per chapter (round 1 or 2, never the warm-up); chapters 0–2 rotate fish / frog, winter = snow
    surpriseRounds: [1, 2], surpriseTypes: ['fish', 'frog'], winterSurprise: 'snow', winterLevel: 3, surpriseAt: [2, 5],
    fishLeap: 1.2, fishApex: 120, fishLeaps: 2, fishGap: 1.4, fishSpan: 150, fishR: 58, fishFlip: 0.5, fishS: 0.8,
    frogIn: 0.6, frogStay: 10, frogOut: 0.6, frogDrift: 6, frogR: 54, frogCroak: 0.6, frogHop: 0.4, frogHopDx: 16, frogPadR: 46, frogS: 0.8,
    snowN: 5, snowR: 36, snowV: 42, snowFall: 12, snowStagger: 0.7, snowTwinkle: 0.5,

    // ---- wind (NH.WindModel): px/s² horizontal force
    breeze: [6, 6, 8, 10], gustEvery: [6, 10], gustFirst: [3, 6], gustAmp: [40, 60], gustTime: 1.5,

    // ---- Nim
    moodTime: { happy: 0.9, cheer: 1.6, oops: 0.8, think: 1.4, talk: 1.0, wave: 1.4, giggle: 1.0, dance: 2.0 },
    blink: [2.2, 5], blinkTime: 0.13,
    crouchArt: [1.02, 0.88]   // nim_crouch.svg is already squashed (art_nim.py): dsx / dsy divide it out
  };
  NH.CONFIG = CONFIG;

  var TAU = Math.PI * 2;
  var NIM_DEFAULT = { feet: [150, 290], backSlots: [[112, 132, -0.55], [150, 112, -0.1], [188, 122, 0.35], [96, 168, -0.9]], crouchDy: 16,
    rollC: [150, 200], rollR: 88, rollSlots: [[150, 116], [222, 176], [78, 176], [150, 280]], mouth: [214, 168], box: [42, 58, 262, 296] };
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hyp(x, y) { return Math.sqrt(x * x + y * y); }
  function lerp(a, b, u) { return a + (b - a) * u; }
  function smooth(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  function easeOut(u) { u = clamp(u, 0, 1); return 1 - (1 - u) * (1 - u); }
  function merge(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; if (b) for (k in b) o[k] = b[k]; return o; }
  function insOf(ins) { return { top: +(ins && ins.top) || 0, right: +(ins && ins.right) || 0, bottom: +(ins && ins.bottom) || 0, left: +(ins && ins.left) || 0 }; }
  function keepBoxes(hk) {
    var a = Array.isArray(hk) ? hk : hk ? [hk] : [], out = [];
    for (var i = 0; i < a.length; i++) { var b = a[i]; if (b && b.w > 0 && b.h > 0) out.push({ x: +b.x, y: +b.y, w: +b.w, h: +b.h }); }
    return out;
  }
  function inBox(b, x, y, pad) { pad = pad || 0; return x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad; }
  function boxGap(a, b) { var dx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), 0), dy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h), 0); return Math.max(dx, dy) > 0 ? hyp(dx, dy) : -Math.min(a.x + a.w - b.x, b.x + b.w - a.x, a.y + a.h - b.y, b.y + b.h - a.y); }
  /** Initial velocity that gives a damped spring (ω, ζ) released from 0 a first peak of `peak`. */
  function kickFor(peak, w, z) { var s = Math.sqrt(1 - z * z); return peak * w * Math.exp(z / s * Math.atan2(s, z)); }
  function spring(o, k, kv, target, w, z, h) { o[kv] += (w * w * (target - o[k]) - 2 * z * w * o[kv]) * h; o[k] += o[kv] * h; }
  function nimPoints() {
    var p = NH.NIM_POINTS || {}, d = NIM_DEFAULT;
    function arr(a, n, fb) { return Array.isArray(a) && a.length >= 1 && a.every(function (q) { return Array.isArray(q) && q.length >= n && q.every(isFinite); }) ? a : fb; }
    return { feet: arr([p.feet], 2, [d.feet])[0], backSlots: arr(p.backSlots, 2, d.backSlots), rollSlots: arr(p.rollSlots, 2, d.rollSlots),
      rollC: arr([p.rollC], 2, [d.rollC])[0], rollR: isFinite(p.rollR) && p.rollR > 0 ? +p.rollR : d.rollR, mouth: arr([p.mouth], 2, [d.mouth])[0],
      box: Array.isArray(p.box) && p.box.length === 4 && p.box.every(isFinite) ? p.box : d.box, crouchDy: isFinite(p.crouchDy) ? +p.crouchDy : d.crouchDy,
      jumpDy: isFinite(p.jumpDy) ? +p.jumpDy : 0 };
  }

  /** DESIGN §2 short-side rule: CSS viewport → logical W×H. */
  function logicalSize(cssW, cssH, cfg) {
    cfg = cfg || CONFIG;
    var S = cfg.shortSide, aspect = cssW / Math.max(1, cssH);
    if (cssW >= cssH) return { W: clamp(Math.round(S * aspect), cfg.minLong, cfg.maxLong), H: S };
    return { W: S, H: clamp(Math.round(S / aspect), cfg.minLong, cfg.maxLong) };
  }
  function ageKey(age) { return clamp(Math.round(+age || 4), 3, 7); }

  /* ---------------------------------------------------------------- ballistic hop
   * plan(x0, y0, x1, y1, T, A) → {x0, y0, x1, y1, T, g, vy0}: x moves at a constant speed (x0 → x1 in T), y is a true parabola
   * y(t) = y0 + vy0·t + ½·g·t² through (T, y1) whose apex is exactly A px above the HIGHER end (min(y0, y1) − A).
   * From y_apex = y0 − vy0²/(2g) and y(T) = y1:  √g = (√(2·H0) + √(2·(H0 + d))) / T,  H0 = A + max(0, y0 − y1), d = y1 − y0. */
  function plan(x0, y0, x1, y1, T, A) {
    T = Math.max(0.05, T); A = Math.max(1, A);
    var d = y1 - y0, H0 = A + Math.max(0, -d), s = (Math.sqrt(2 * H0) + Math.sqrt(2 * Math.max(0, H0 + d))) / T, g = s * s;
    return { x0: x0, y0: y0, x1: x1, y1: y1, T: T, g: g, vy0: -Math.sqrt(2 * g * H0), A: A };
  }
  function planAt(p, t) { return { x: p.x0 + (p.x1 - p.x0) * clamp(t / p.T, 0, 1), y: p.y0 + p.vy0 * t + 0.5 * p.g * t * t, vy: p.vy0 + p.g * t }; }
  function hopTime(cfg, dist) { return clamp(cfg.hopTime * Math.sqrt(Math.max(1, dist) / cfg.hopRef), cfg.hopTimeMin, cfg.hopTimeMax); }
  function hopApex(cfg, dx) { return Math.max(cfg.apexMin, cfg.apexK * Math.abs(dx)); }

  /* ---------------------------------------------------------------- wind (DESIGN §5.3) */
  function WindModel(seed, cfg) {
    this.cfg = cfg || CONFIG; this.rng = new NH.RNG(seed === undefined ? 5 : seed);
    this.t = 0; this.wind = 0; this.gust = 0; this.gustDir = 0; this.season = -1;
    this._next = 1e9; this._gT = -1; this._gA = 0; this.ph = this.rng.float(0, TAU); this.events = [];
  }
  WindModel.prototype.step = function (h, season) {
    var c = this.cfg, s = ((season | 0) % 4 + 4) % 4;
    if (s !== this.season) { this.season = s; this._gT = -1; this.gust = 0; this._next = s === 2 ? this.rng.float(c.gustFirst[0], c.gustFirst[1]) : 1e9; }
    this.t += h;
    var amp = c.breeze[s], t = this.t;
    var base = amp * Math.sin(TAU * t / 11 + this.ph) * (0.65 + 0.35 * Math.sin(TAU * t / 4.3 + 2 * this.ph));
    if (s === 2) {
      this._next -= h;
      if (this._gT < 0 && this._next <= 0) {
        this._gT = 0; this.gustDir = this.rng.sign(); this._gA = this.rng.float(c.gustAmp[0], c.gustAmp[1]);
        this._next = this.rng.float(c.gustEvery[0], c.gustEvery[1]);
        this.events.push({ type: 'gust', dir: this.gustDir });
      }
      if (this._gT >= 0) {
        this._gT += h;
        var u = this._gT / c.gustTime, e = Math.sin(Math.PI * clamp(u, 0, 1));
        this.gust = e * e;
        if (u >= 1) { this._gT = -1; this.gust = 0; }
      }
    }
    this.wind = base + this.gustDir * this._gA * this.gust;
    return this.wind;
  };
  WindModel.prototype.drain = function () { var e = this.events; this.events = []; return e; };

  /* ---------------------------------------------------------------- layout (DESIGN §2)
   * computeLayout(W, H, ins, cfg, age, hudKeep, k, m): the stone width S is the age base, −4 px steps down to 116, for which k rows ×
   * m stones fit without any two footprints overlapping (and clear of the bubble / HUD / hudKeep / safe edges); when even 116 does
   * not fit, the banks compress (10 px steps) to their minimums and S is searched again. */
  /** Nim's drawn extent around his feet (NH.NIM_POINTS.box) for height h: {left, right, up}. */
  function nimExtent(h) { var B = nimPoints(), s = h / 300; return { left: (B.feet[0] - B.box[0]) * s, right: (B.box[2] - B.feet[0]) * s, up: (B.feet[1] - B.box[1]) * s }; }
  /** The fruit's x on the far bank: at the end of the roll (goal + rollDist / 2) Nim's nose stays ≥ 4 px inside the safe screen. */
  function goalX(W, ins, ext, cfg) { return Math.min(W - ins.right - cfg.goalXLand, W - ins.right - ext.right - cfg.rollDist / 2 - 4); }
  function hudBox(hk, W, H) { var best = null; for (var i = 0; i < hk.length; i++) { var b = hk[i]; if (b.x + b.w / 2 > W / 2 && b.y < H / 2 && (!best || b.y + b.h > best.y + best.h)) best = b; } return best; }
  function baseLayout(W, H, ins, cfg, hudKeep, compact) {
    ins = insOf(ins);
    var portrait = H > W, tall = H / W > cfg.tallRatio, phone = (portrait ? H / W : W / H) > cfg.phoneRatio;
    var hk = keepBoxes(hudKeep), hb = hudBox(hk, W, H);
    var bx = ins.left + cfg.bubbleX, bubble;
    // compact: beside the HUD, ending left of Nim's head when he stands at the goal (W − ins.right − 0.4·nimH − rollDist / 2)
    var nimHc = portrait ? (phone ? cfg.nimHPhonePort : cfg.nimHPort) : cfg.nimHLand, ext = nimExtent(nimHc), gx = goalX(W, ins, ext, cfg);
    if (portrait && compact) bubble = { x: bx, y: ins.top + cfg.bubbleYLand, w: Math.min(W - ins.right - cfg.hudW - 12, gx - ext.left - 8) - bx, h: cfg.bubbleHPort };
    else if (portrait) bubble = { x: bx, y: ins.top + cfg.bubbleYPort, w: W - bx - ins.right - cfg.bubbleX, h: cfg.bubbleHPort };
    else bubble = { x: bx, y: ins.top + cfg.bubbleYLand, w: Math.min(cfg.bubbleMaxW, W - ins.right - cfg.bubbleRight - bx), h: cfg.bubbleHLand };
    if (hb && bubble.x + bubble.w > hb.x - 10 && bubble.y < hb.y + hb.h) {   // the measured HUD: narrower beside it, else below
      var room = hb.x - 12 - bubble.x;
      if (!portrait && room >= cfg.bubbleMinW) bubble.w = room;
      else bubble.y = Math.max(bubble.y, hb.y + hb.h + 8);
    }
    bubble.w = Math.max(0, bubble.w);
    var hud = { x: W - ins.right - cfg.hudW, y: 0, w: cfg.hudW + ins.right, h: ins.top + cfg.hudH };
    var band = bubble.y + bubble.h;
    if (portrait) band = Math.max(band, hud.y + hud.h);
    var play = { x0: ins.left, y0: band + cfg.bandGap, x1: W - ins.right, y1: H - ins.bottom - (portrait ? cfg.bottomPort : cfg.bottomLand) };
    var nimH = portrait ? (phone ? cfg.nimHPhonePort : cfg.nimHPort) : cfg.nimHLand;
    var L = { W: W, H: H, ins: ins, portrait: portrait, tall: tall, phone: phone, compact: !!(portrait && compact), ax: portrait ? { x: 0, y: -1 } : { x: 1, y: 0 },
      flowDir: portrait ? { x: 1, y: 0 } : { x: 0, y: 1 }, bubble: bubble, hud: hud, play: play, nimH: nimH, nimS: nimH / 300,
      safe: { x: ins.left, y: ins.top, w: W - ins.left - ins.right, h: H - ins.bottom - ins.top } };
    L.keep = [{ x: bubble.x, y: bubble.y, w: bubble.w, h: bubble.h, kind: 'bubble' }, { x: hud.x, y: hud.y, w: hud.w, h: hud.h, kind: 'hud' }];
    hk.forEach(function (b) { b.kind = 'hudKeep'; L.keep.push(b); });
    return L;
  }
  /** Banks, river, rows and the across range for stone width S and bank sizes (bn, bf). → geometry or null when it does not fit. */
  function geometry(L, cfg, S, k, m, bn, bf) {
    var W = L.W, H = L.H, ins = L.ins, P = L.play, itemH = cfg.itemK * S, fb = cfg.footBot * S, g = {}, j;
    g.S = S; g.itemH = itemH;
    if (!L.portrait) {
      g.near = { x: 0, y: P.y0, w: ins.left + bn, h: H - P.y0 };
      g.far = { x: W - ins.right - bf, y: P.y0, w: ins.right + bf, h: H - P.y0 };
      g.river = { x: g.near.x + g.near.w, y: P.y0, w: g.far.x - (g.near.x + g.near.w), h: H - P.y0 };
      var pitch = (g.river.w - 2 * cfg.riverPad) / k;
      if (pitch < S + cfg.pitchGapLand) return null;
      g.pitch = pitch; g.rowPos = [];
      for (j = 0; j < k; j++) g.rowPos.push(g.river.x + cfg.riverPad + (j + 0.5) * pitch);
      // across = y of the top face: the thing's top clear of the bubble / HUD / top keeps over the river, the footprint above the bottom keep
      var top = P.y0, bot = P.y1, rx0 = g.river.x, rx1 = g.river.x + g.river.w;
      L.keep.forEach(function (b) {
        if (b.x > rx1 || b.x + b.w < rx0) return;
        if (b.y + b.h / 2 < H / 2) top = Math.max(top, b.y + b.h + cfg.keepGap - cfg.bandGap);
        else bot = Math.min(bot, b.y - cfg.keepGap);
      });
      g.a0 = Math.max(top + cfg.landTopGap, ins.top + cfg.edgeGap) + itemH; g.a1 = bot - fb;
      g.minAcross = itemH + fb + cfg.acrossGap;
      // Nim standing on a stone must stay below the speech bubble / HUD over his column (visual QA P1-1): per row, the stone
      // tops start at (the lowest top keep over Nim's art width) + his height above the feet + a gap
      var ex = nimExtent(L.nimH);
      g.rowA0 = [];
      for (j = 0; j < k; j++) {
        var cx = g.rowPos[j], lo = g.a0;
        L.keep.forEach(function (b) {
          if (b.y + b.h / 2 >= H / 2 || b.x > cx + ex.right || b.x + b.w < cx - ex.left) return;
          lo = Math.max(lo, b.y + b.h + ex.up + cfg.nimTopGap);
        });
        // a soft rule: when the row cannot hold m stones below Nim's line, it keeps the thing-clear range as far as it must
        // (the DOM bubble fades while Nim's art is under it — main.js safety net)
        if (!cfg._nimSoft && (g.a1 - lo < (m >= 2 ? (m - 1) * g.minAcross : 0))) return null;   // strict pass: smaller stones first
        g.rowA0.push(Math.max(g.a0, Math.min(lo, g.a1 - (m >= 2 ? (m - 1) * g.minAcross : 0))));
      }
      g.nimHome = { x: ins.left + cfg.nimXLand, y: (P.y0 + P.y1) / 2 + cfg.nimDyLand };
      g.goal = { x: goalX(W, ins, nimExtent(L.nimH), cfg), y: g.nimHome.y };
    } else {
      g.near = { x: 0, y: H - ins.bottom - bn, w: W, h: ins.bottom + bn };
      g.far = { x: 0, y: P.y0, w: W, h: bf };
      g.river = { x: 0, y: g.far.y + g.far.h, w: W, h: g.near.y - (g.far.y + g.far.h) };
      var pp = g.river.h / k;
      // DESIGN: pitch ≥ 0.5·S + itemH + 30; a compact (squat) portrait only needs the footprints apart (itemH + 0.4·S + 8)
      if (pp < (L.compact ? itemH + fb + cfg.acrossGap : cfg.pitchPortK * S + itemH + cfg.pitchPortGap)) return null;
      g.pitch = pp; g.rowPos = [];
      // footprint centres evenly spaced (row 0 next to the near bank); the top face sits 0.11·S below the footprint centre
      for (j = 0; j < k; j++) g.rowPos.push(g.near.y - (j + 0.5) * pp + 0.5 * (itemH - fb));
      // Nim's whole art stays on screen on an edge-column stone (visual QA P2-1): margin = max(0.55·S, his extent + 6)
      var exP = nimExtent(L.nimH);
      var lx = ins.left + Math.max(cfg.portSideK * S, exP.left + cfg.edgeGap), rx = W - ins.right - Math.max(cfg.portSideK * S, exP.right + cfg.edgeGap);
      g.a0 = lx; g.a1 = rx; g.minAcross = S + cfg.acrossGap;
      g.nimHome = { x: W / 2 - cfg.nimDxPort, y: g.near.y + cfg.nimYPortK * g.near.h };
      g.goal = { x: W / 2 + cfg.nimDxPort, y: g.far.y + g.far.h - cfg.goalUpPort };
      // compact: a short far bank; the fruit waits at the right, under the HUD and clear of the (narrower) speech bubble
      if (L.compact) g.goal = { x: goalX(W, ins, nimExtent(L.nimH), cfg), y: g.far.y + g.far.h - cfg.compactGoalUp };
    }
    if (m >= 2 && g.a1 - g.a0 < (m - 1) * g.minAcross) return null;
    if (g.a1 < g.a0) return null;
    return g;
  }
  var _cache = {}, _cacheN = 0, _cfgId = 0;
  function cfgKey(cfg) { if (!cfg.__id) Object.defineProperty(cfg, '__id', { value: ++_cfgId, enumerable: false }); return cfg.__id; }
  function computeLayout(W, H, ins, cfg, age, hudKeep, k, m) {
    var a = ageKey(age);
    k = clamp(Math.round(k || 3), 1, 6); m = clamp(Math.round(m || 3), 1, 4);
    var key = cfgKey(cfg) + '|' + W + 'x' + H + '|' + JSON.stringify(insOf(ins)) + '|' + a + '|' + k + 'x' + m + '|' + JSON.stringify(keepBoxes(hudKeep));
    if (_cache[key]) return JSON.parse(_cache[key]);
    var L = baseLayout(W, H, ins, cfg, hudKeep, false), base = cfg.sBase[a], g = null, fits = true;
    function search(L, nH0, nH1, fH0, fH1) {
      var steps = Math.ceil(Math.max(nH0 - nH1, fH0 - fH1, 0) / cfg.bankStep), r = null;
      for (var c = 0; c <= steps && !r; c++) {
        var bn = Math.max(nH1, nH0 - c * cfg.bankStep), bf = Math.max(fH1, fH0 - c * cfg.bankStep);
        for (var S = base; S >= cfg.sMin - 1e-9 && !r; S -= cfg.sStep) r = geometry(L, cfg, S, k, m, bn, bf);
        if (!r && base > cfg.sMin) r = geometry(L, cfg, cfg.sMin, k, m, bn, bf);
      }
      return r;
    }
    var nH0 = L.portrait ? Math.round(cfg.nearH * (L.tall ? cfg.tallNearK : 1)) : cfg.nearW, nH1 = L.portrait ? cfg.nearHMin : cfg.nearWMin;
    var fH0 = L.portrait ? Math.max(cfg.farH, L.nimH + cfg.farHPad) : cfg.farW, fH1 = L.portrait ? L.nimH + cfg.farHMinPad : cfg.farWMin;
    // a squat portrait (iPad: usable height / width < 1.6) uses the compact layout (bubble beside the HUD, footprint pitch, small
    // banks) for every round, so the speech bubble does not jump between rounds; any other portrait falls back to it only when needed
    var ii = insOf(ins), squat = L.portrait && (H - ii.top - ii.bottom) / W < cfg.compactRatio;
    if (!squat) g = search(L, nH0, nH1, fH0, fH1);
    if (!g && !L.portrait) { var c0 = cfg; cfg = merge(cfg, { _nimSoft: true }); g = search(L, nH0, nH1, fH0, fH1); cfg = c0; }   // Nim's line relaxed
    if (!g && L.portrait) {
      var Lc = baseLayout(W, H, ins, cfg, hudKeep, true);
      g = search(Lc, nH0, cfg.compactNearMin, fH0, cfg.compactFarMin);
      if (g || squat) L = Lc;
    }
    if (!g) {   // an odd viewport (never an Apple device; unit-tested): the smallest stones, the narrowest banks, squeezed rows
      fits = false;
      var big = merge(cfg, { pitchGapLand: -1e9, pitchPortGap: -1e9, acrossGap: -1e9, keepGap: 0, landTopGap: 0, nimTopGap: -1e9 });
      g = geometry(L, big, cfg.sMin, k, 1, nH1, fH1);
      g.a1 = Math.max(g.a0, g.a1); g.minAcross = m > 1 ? (g.a1 - g.a0) / (m - 1) : 0;
    }
    for (var kk in g) L[kk] = g[kk];
    L.rows = k; L.m = m; L.fits = fits; L.age = a;
    L.hitR = cfg.hitK * L.S + cfg.hitPad;
    if (L.phone) L.hitR = Math.max(L.hitR, cfg.hitPhone);
    L.badgeR = cfg.badgeK * L.itemH;
    L.fruitR = 0.5 * cfg.fruitK * L.nimH;
    L.rollStart = { x: L.goal.x - cfg.rollDist / 2, y: L.goal.y }; L.rollEnd = { x: L.goal.x + cfg.rollDist / 2, y: L.goal.y };
    L.across = { a0: L.a0, a1: L.a1 };
    if (++_cacheN > 300) { _cache = {}; _cacheN = 0; }
    _cache[key] = JSON.stringify(L);
    return L;
  }
  /** A stone's footprint box (x ± S/2, y − itemH … y + 0.4·S). */
  function footprint(L, x, y, cfg) { return { x: x - L.S / 2, y: y - L.itemH, w: L.S, h: L.itemH + (cfg || CONFIG).footBot * L.S }; }
  /** Seeded homes for k rows × m stones: [[{x, y}] × m] × k. Along = the row position; across: the m stones spread over the range
   *  (≥ minAcross apart, spacing 72–100 % of the room, a seeded group offset, ± 18 px jitter that never breaks the gap). */
  function stoneHomes(L, k, m, seed, cfg) {
    cfg = cfg || CONFIG;
    var rng = new NH.RNG((seed >>> 0) || 1), out = [];
    for (var j = 0; j < k; j++) {
      var a = L.rowPos[Math.min(j, L.rowPos.length - 1)], A0 = L.rowA0 && L.rowA0[j] != null ? Math.min(L.rowA0[j], L.a1) : L.a0, span = L.a1 - A0, ac = [], i;
      if (m <= 1) ac.push(A0 + span * rng.float(0.3, 0.7));
      else {
        var full = span / (m - 1), sp = Math.max(L.minAcross, full * rng.float(cfg.spreadMin, 1));
        sp = Math.min(sp, full);
        var start = A0 + rng.float(0, Math.max(0, span - sp * (m - 1)));
        for (i = 0; i < m; i++) ac.push(start + i * sp);
        for (i = 0; i < m; i++) {   // jitter, keeping the gap and the range
          var lo = i > 0 ? ac[i - 1] + L.minAcross : A0, hi = i < m - 1 ? ac[i + 1] - L.minAcross : L.a1;
          var v = ac[i] + rng.float(-cfg.jitter, cfg.jitter);
          ac[i] = clamp(v, Math.min(lo, ac[i]), Math.max(hi, ac[i]));
        }
      }
      var row = [];
      for (i = 0; i < ac.length; i++) row.push(L.portrait ? { x: ac[i], y: a } : { x: a, y: ac[i] });
      out.push(row);
    }
    return out;
  }

  // ------------------------------------------------------------------ World
  function World(opts) {
    opts = opts || {};
    this.cfg = merge(CONFIG, opts.config);
    this.seed = opts.seed !== undefined ? opts.seed : 1;
    this.rng = new NH.RNG(this.seed);
    this._crng = new NH.RNG((NH.RNG.hash(this.seed) ^ 0x51ed27) >>> 0);   // cosmetic randomness (phases, droplets, blinks, surprise spots)
    this.windModel = new WindModel((NH.RNG.hash(this.seed) ^ 0x2a7e11) >>> 0, this.cfg);
    this.age = NH.Content.ageOf(opts.age !== undefined ? opts.age : 4);
    this.lang = opts.lang === 'vi' ? 'vi' : 'en';
    this._pendingAge = this.age; this._pendingLang = this.lang;
    this.state = 'menu'; this.phase = null;
    this.level = 0; this.levels = []; this.topic = null; this.weather = 0;
    this.round = 0; this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.stars = 0; this.levelStars = 0; this.roundStars = 0; this.misses = 0; this.streak = 0;
    this.time = 0; this.stateTime = 0; this.phaseTime = 0; this.alpha = 0; this._acc = 0;
    this.cur = null; this.talk = null; this.talkAnswered = null;
    this.stones = []; this.row = 0; this.drops = []; this.ripples = []; this.snowflakes = [];
    this.fish = null; this.frog = null; this.fruit = null; this.hintHand = null; this.assistId = null; this.wipe = null;
    this.nim = { x: 0, y: 0, _px: 0, _py: 0, state: 'stand', frame: 'idle', mood: 'idle', moodT: 0, blink: false, blinkT: 3, sx: 1, sy: 1, _psx: 1, _psy: 1,
      sq: 0, sqV: 0, face: 1, onRow: -1, lean: 0, leanV: 0, _plean: 0, _leanT: 0, _leanTo: 0, rollRot: 0, _prollRot: 0, curl: 0, _pcurl: 0,
      fruits: [], h: 190, s: 190 / 300, dsx: 1, dsy: 1, ballX: 0, ballY: 0, ballR: 0, backSlots: [], rollSlots: [] };
    this.finger = { x: 0, y: 0, down: false };
    this.wind = 0; this.gust = 0;
    this.hudKeep = opts.hudKeep || null; this.lastTopics = null; this.surprise = null; this._surpriseOff = 0; this._surpriseRound = 1;
    this.events = []; this.sessions = 0;
    this._idleN = 0; this._idleT = 0; this._idleGap = this.cfg.idleTime; this._lastHintT = -1e9; this.levelStartTime = 0;
    this._talkAskT = 0; this._talkAsks = 0; this._g = null; this._noProg = 0; this._hop = null; this._queued = null; this._bank = null;
    this._usedKeys = []; this._prevRule = null; this._prevFruit = null; this._view = null; this._vp = null; this._counting = null;
    this._surpriseAt = -1; this._roundAssisted = false; this._riseDone = -1; this._bankAt = -1; this._next = null; this._modesSeen = {};
    this.setViewport(opts.width || 1280, opts.height || 720, opts.ins || null);
  }
  World.logicalSize = logicalSize;
  World.computeLayout = function (W, H, ins, cfg, age, hudKeep, k, m) { return computeLayout(W, H, ins, merge(CONFIG, cfg), age === undefined ? 4 : age, hudKeep, k, m); };
  /** The most rows (≤ 4) that fit this viewport without squeezing (iPad 4:3 portrait: 3). */
  World.maxRows = function (W, H, ins, age, m, cfg, hudKeep) { var c = merge(CONFIG, cfg); for (var k = 4; k > 2; k--) if (computeLayout(W, H, ins, c, age, hudKeep, k, m || 3).fits) return k; return 2; };
  World.stoneHomes = function (L, k, m, seed, cfg) { return stoneHomes(L, k, m, seed, merge(CONFIG, cfg)); };
  World.footprint = function (L, x, y, cfg) { return footprint(L, x, y, merge(CONFIG, cfg)); };
  World.kickFor = kickFor;
  World.plan = plan;
  World.planAt = planAt;
  World.boxGap = boxGap;
  World.nimPoints = nimPoints;

  var P = World.prototype;
  Object.defineProperty(P, 'interactive', { get: function () {
    return this.state === 'round' && this.phase === 'play' && !!this.cur && this.row < this.cur.k && (this.nim.state === 'stand' || this.nim.state === 'land') && !this._hop && !this._counting && this._bankAt < 0 && !(this.time < this._holdUntil);
  } });
  Object.defineProperty(P, 'fruitsOnBack', { get: function () { return this.nim.fruits; } });
  P._emit = function (e) {
    var L = this.layout;
    if (e.x !== undefined) { e.x = clamp(+e.x || 0, 0, L.W); e.y = clamp(+e.y || 0, 0, L.H); }
    this.events.push(e);
  };
  P.drainEvents = function () { var e = this.events; this.events = []; return e; };
  P.setAge = function (a) { this._pendingAge = NH.Content.ageOf(a); };
  P.setLang = function (l) { this._pendingLang = l === 'vi' ? 'vi' : 'en'; };
  P._setState = function (s) { this.state = s; this.stateTime = 0; };
  P._setPhase = function (p) { this.phase = p; this.phaseTime = 0; };
  P._mood = function (m, t) { this.nim.mood = m; this.nim.moodT = t || this.cfg.moodTime[m] || 1; };
  P.skipTalk = function () { if (this.state === 'talk') this._levelDone(); };
  P.stoneById = function (id) { for (var i = 0; i < this.stones.length; i++) if (this.stones[i].id === id) return this.stones[i]; return null; };
  P._riverCentre = function () { var r = this.layout.river; return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; };
  P._target = function () { if (!this.cur || this.row >= this.cur.k) return null; for (var i = 0; i < this.stones.length; i++) { var s = this.stones[i]; if (s.row === this.row && s.target) return s; } return null; };
  P._head = function () { var n = this.nim, B = nimPoints(), s = this.layout.nimS; return { x: n.x + (B.mouth[0] - B.feet[0]) * s, y: n.y + (B.mouth[1] - B.feet[1]) * s - 0.25 * this.layout.nimH }; };

  /** The current question while it can be answered (play, Nim standing), else null. */
  P.prompt = function () {
    if (!this.interactive) return null;
    var c = this.cur, o = { promptKey: c.promptKey, params: c.params, rule: c.rule, nameKind: c.rule.nameKind, nameValue: c.rule.value, k: c.k, left: c.k - this.row, mode: c.mode, row: this.row };
    if (c.mode === 'countSeq') o.count = this.row + 1;
    return o;
  };

  // ---------------------------------------------------------------- geometry + test hooks (logical px)
  /** The point a finger aims at: the stone's top centre raised by 0.35·itemH (covers stone + thing). */
  P._hitPt = function (s) { return { x: s.x, y: s.y - this.cfg.hitLift * this.layout.itemH }; };
  /** The stone's hit circle {x, y, r: hitR, own: 0.5·S} (where it is now), null when it is not tappable (hidden / sinking / gone). */
  P.stoneHit = function (id) { var s = this.stoneById(id); if (!s || (s.state !== 'rest' && s.state !== 'rise')) return null; var p = this._hitPt(s); return { x: p.x, y: p.y, r: this.layout.hitR, own: 0.5 * this.layout.S }; };
  /** The tappable stone under (x, y): nearest hit centre within hitR (the active row gets a 10 px bias on ties) → {s, d} | null. */
  P._stoneAt = function (x, y) {
    var best = null, bd = 1e9, R = this.layout.hitR, bias = this.cfg.activeBias;
    for (var i = 0; i < this.stones.length; i++) {
      var s = this.stones[i];
      if (s.state !== 'rest' && s.state !== 'rise') continue;
      var p = this._hitPt(s), d = hyp(x - p.x, y - p.y);
      if (d > R) continue;
      var score = d - (s.row === this.row && !s.visited ? bias : 0);
      if (score < bd) { bd = score; best = { s: s, d: d }; }
    }
    return best;
  };
  /** Nim's tap box {x, y (top-left), w, h, cx, cy} (NH.NIM_POINTS.box scaled, + 8 px; the ball while rolling). */
  P.nimHit = function () {
    var n = this.nim, s = this.layout.nimS, B = nimPoints();
    if (n.state === 'roll' && n.curl > 0.3) { var r = n.ballR + 8; return { x: n.ballX - r, y: n.ballY - r, w: 2 * r, h: 2 * r, cx: n.ballX, cy: n.ballY }; }
    var x0 = n.x + (B.box[0] - B.feet[0]) * s - 8, x1 = n.x + (B.box[2] - B.feet[0]) * s + 8, y0 = n.y + (B.box[1] - B.feet[1]) * s - 8, y1 = n.y + (B.box[3] - B.feet[1]) * s + 8;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  };
  P._clearOfKeep = function (x, y) { var K = this.layout.keep; for (var k = 0; k < K.length; k++) if (inBox(K[k], x, y)) return false; return true; };
  P._onScreen = function (x, y, m) { var L = this.layout; m = m || 0; return x >= L.ins.left + m && x <= L.W - L.ins.right - m && y >= L.ins.top + m && y <= L.H - L.ins.bottom - m; };
  P._onStoneBody = function (x, y) { var r = 0.5 * this.layout.S; for (var i = 0; i < this.stones.length; i++) { var s = this.stones[i]; if ((s.state === 'rest' || s.state === 'rise') && hyp(x - s.x, y - (s.y - this.cfg.hitLift * this.layout.itemH)) <= r) return true; } return false; };
  /** A tappable point of a surprise: off every stone's own body, off the speech bubble / HUD / Nim, on the safe screen. */
  P._freeHit = function (x, y, r) {
    var pts = [[0, 0], [0, -0.5], [0.5, 0], [-0.5, 0], [0, 0.5], [0.4, -0.4], [-0.4, -0.4], [0.4, 0.4], [-0.4, 0.4]], nb = this.nimHit();
    for (var i = 0; i < pts.length; i++) {
      var px = x + pts[i][0] * r, py = y + pts[i][1] * r;
      if (!this._onStoneBody(px, py) && this._clearOfKeep(px, py) && this._onScreen(px, py, 6) && !inBox(nb, px, py)) return { x: px, y: py, r: r, cx: x, cy: y };
    }
    return null;
  };
  P.fishHit = function () { var f = this.fish; if (!f || f.state !== 'leap' || f.flip > 0 || f.u < 0.12 || f.u > 0.88) return null; return this._freeHit(f.x, f.y, this.cfg.fishR); };
  P.frogHit = function () { var f = this.frog; if (!f || (f.state !== 'sit' && f.state !== 'in') || f.a < 0.6 || f.croak > 0) return null; return this._freeHit(f.x, f.y - 0.3 * this.cfg.frogR, this.cfg.frogR); };
  P.snowHit = function () {
    for (var i = 0; i < this.snowflakes.length; i++) {
      var f = this.snowflakes[i];
      if (f.state !== 'fall' || f.a < 0.5) continue;
      var h = this._freeHit(f.x, f.y, f.r);
      if (h && hyp(h.x - f.x, h.y - f.y) <= f.r) { h.i = i; return h; }
    }
    return null;
  };
  P._fishAt = function (x, y) { var f = this.fish; return f && f.state === 'leap' && f.flip <= 0 && hyp(x - f.x, y - f.y) <= this.cfg.fishR; };
  P._frogAt = function (x, y) { var f = this.frog; return f && (f.state === 'sit' || f.state === 'in') && f.a > 0.3 && f.croak <= 0 && hyp(x - f.x, y - (f.y - 0.3 * this.cfg.frogR)) <= this.cfg.frogR; };
  P._snowAt = function (x, y) {
    var best = null, bd = 1e9;
    for (var i = 0; i < this.snowflakes.length; i++) { var f = this.snowflakes[i], d = hyp(x - f.x, y - f.y); if (f.state === 'fall' && f.a > 0.3 && d <= f.r && d < bd) { bd = d; best = f; } }
    return best;
  };
  /** The active row's target id (as a list), [] when nothing can be answered. */
  P.targets = function () { var t = this.interactive ? this._target() : null; return t ? [t.id] : []; };
  /** What to touch next: {stone: id, id} while interactive, else null. */
  P.answer = function () { var t = this.interactive ? this._target() : null; return t ? { stone: t.id, id: t.id } : null; };
  P._inRiver = function (x, y) { var r = this.layout.river, m = 0.25 * this.layout.S; return x >= r.x - m && x <= r.x + r.w + m && y >= r.y - m && y <= r.y + r.h + m; };

  // ---------------------------------------------------------------- viewport
  P.setViewport = function (W, H, ins) { this._view = { W: W, H: H, ins: insOf(ins) }; this._relayout(false); };
  P._relayout = function (force) {
    var v = this._view, k = this.cur ? this.cur.k : 3, m = this.cur ? this.cur.m : 3;
    var key = v.W + 'x' + v.H + ':' + JSON.stringify(v.ins) + ':' + this.age + ':' + k + 'x' + m + ':' + (this.cur ? this.cur.seed : 0) + ':' + JSON.stringify(this.hudKeep || null);
    if (key === this._vp && !force) return false;
    var had = !!this.layout, prev = this.layout;
    this._vp = key;
    this.layout = computeLayout(v.W, v.H, v.ins, this.cfg, this.age, this.hudKeep, k, m);
    this.layout.hudKeep = keepBoxes(this.hudKeep);
    var L = this.layout, n = this.nim;
    n.h = L.nimH; n.s = L.nimS;
    if (this.cur) this._applyHomes();
    if (had) this._snapAll(prev);
    else { n.x = n._px = L.nimHome.x; n.y = n._py = L.nimHome.y; }
    this._poseNim();
    return true;
  };
  P._applyHomes = function () {
    var hm = stoneHomes(this.layout, this.cur.k, this.cur.m, this.cur.seed, this.cfg);
    this.stones.forEach(function (s) { var p = hm[s.row][s.i]; s.hx = p.x; s.hy = p.y; });
  };
  /** Rotation / resize mid-round (DESIGN §5.2): stones glide to their new homes in 0.3 s (starting clamped on screen), Nim follows his
   *  stone or snaps to his bank point, a hop in flight is re-planned to the new target with the time it had left. */
  P._snapAll = function (prev) {
    var L = this.layout, self = this, sx = prev && prev.W ? L.W / prev.W : 1, sy = prev && prev.H ? L.H / prev.H : 1;
    this.cancelDrag(); this._queued = null;
    this.stones.forEach(function (s) {
      var ox = clamp(s.x, 0, L.W), oy = clamp(s.y, 0, L.H);
      self._placeStone(s, 0);
      s.gx = ox - s.x; s.gy = oy - s.y; s.gt = 0;
      self._placeStone(s, 0);
      self._twin(s);
    });
    var n = this.nim;
    if (this._hop) {
      var H0 = this._hop, from = { x: clamp(n.x, 0, L.W), y: clamp(n.y, 0, L.H) }, to = this._hopTarget(H0);
      if (H0.phase === 'air') { var T = Math.max(0.18, H0.p.T - H0.t); H0.p = plan(from.x, from.y, to.x, to.y, T, Math.max(this.cfg.apexMin * 0.5, H0.A * 0.6)); H0.t = 0; H0.tx0 = to.x; H0.ty0 = to.y; }
    }
    if (this._bank && !this._hop) { var bp = this._bankFeet(); n.x = bp.x; n.y = bp.y; }
    else if (!this._hop) { var hp = this._standPoint(); n.x = hp.x; n.y = hp.y; }
    n._px = n.x; n._py = n.y;
    if (this.fruit) this._placeFruit();
    this.drops.forEach(function (d) { d.x = clamp(d.x * sx, 0, L.W); d.y = clamp(d.y * sy, 0, L.H); d.y0 *= sy; d._px = d.x; d._py = d.y; });
    this.ripples.forEach(function (r) { r.x = clamp(r.x * sx, 0, L.W); r.y = clamp(r.y * sy, 0, L.H); });
    this.snowflakes.forEach(function (f) { f.x0 = clamp(f.x0 * sx, L.ins.left + f.r, L.W - L.ins.right - f.r); f.x = clamp(f.x * sx, L.ins.left + f.r, L.W - L.ins.right - f.r); f.y *= sy; f._px = f.x; f._py = f.y; });
    if (this.fish) { var f = this.fish; f.state = 'under'; f.t = 0; var sp = this._fishSpot(); f.x = sp.x0; f.y = sp.y; f.path = sp; f._px = f.x; f._py = f.y; }
    if (this.frog) { var fr = this.frog, spot = this._waterSpot(this.layout.hitR + 30, 'frog'); if (spot) { fr.x = fr.padX = spot.x; fr.y = fr.padY = spot.y; fr._px = fr.x; fr._py = fr.y; } else fr.state = 'out'; }
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
    this.levels = NH.Content.topicsFor(this.age, this.rng, last);
    this._surpriseOff = this.rng.int(0, Math.max(0, this.cfg.surpriseTypes.length - 1));
    this.stars = 0; this._prevRule = null;
    this.weather = 0;
    this._emit({ type: 'session', levels: this.levels.slice() });
    this.startLevel(0);
  };
  P._clearRound = function () {
    this._holdUntil = 0;
    this.stones = []; this._g = null; this.finger.down = false; this._queued = null; this._hop = null; this._bank = null; this._counting = null;
    this.fish = null; this.frog = null; this.snowflakes = []; this.fruit = null;
    this.hintHand = null; this.assistId = null; this._surpriseAt = -1; this.row = 0; this._riseDone = -1; this._bankAt = -1; this._onStone = null; this._acrossFrac = undefined;
    var n = this.nim, L = this.layout;
    n.state = 'stand'; n.onRow = -1; n.curl = n._pcurl = 0; n.rollRot = n._prollRot = 0; n.sq = n.sqV = 0; n.lean = n.leanV = 0; n._leanT = 0;
    n.x = n._px = L.nimHome.x; n.y = n._py = L.nimHome.y;
  };
  P.startLevel = function (i) {
    if (!this.levels.length) this.levels = NH.Content.topicsFor(this.age);
    this.level = clamp(i | 0, 0, this.levels.length - 1);
    this.topic = this.levels[this.level];
    this.weather = this.level % 4;
    this.round = 0; this.levelStars = 0; this.levelStartTime = this.time;
    this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.cur = null; this.talk = null; this.talkAnswered = null; this.surprise = null; this._usedKeys = []; this._prevRule = null; this._modesSeen = {};   // _prevFruit carries over: never the same fruit twice in a row, also across chapters
    var SR = this.cfg.surpriseRounds || [2];
    this._surpriseRound = SR[this.rng.int(0, SR.length - 1)];
    this._clearRound(); this.wipe = null;
    this.nim.fruits = [];
    this._relayout(false);
    this._setState('intro'); this.phase = null;
    this._mood('wave', 1.6);
    var c = this._riverCentre();
    this._emit({ type: 'level', level: this.level, topic: this.topic, weather: this.weather, x: c.x, y: c.y });
  };
  P._surpriseType = function () {
    var ST = this.cfg.surpriseTypes;
    if (this.level === this.cfg.winterLevel && this.cfg.winterSurprise) return this.cfg.winterSurprise;
    if (!ST || !ST.length) return null;
    return ST[(this.level + this._surpriseOff) % ST.length];
  };

  P._newStone = function (q, order) {
    var r = this._crng;
    var s = { id: q.id, row: q.row, i: q.i, order: order, thing: q.thing, target: !!q.target, x: 0, y: 0, hx: 0, hy: 0, seed: r.int(1, 1e6),
      state: 'hidden', riseT: 0, offY: 0, dip: 0, dipV: 0, tilt: 0, tiltV: 0, bob: 0, bobPh: r.float(0, TAU), bobHz: r.float(this.cfg.bobHz[0], this.cfg.bobHz[1]),
      sub: 1, gold: 0, glow: 0, active: 0, alpha: 0, visited: false, sinkT: 0, gx: 0, gy: 0, gt: 1,
      thingHop: 0, thingDx: 0, thingS: 1, thingA: 1, wig: 0, wigV: 0, count: -1, badge: null, _tState: 'on', _tT: 0, _lastWrongT: -1e9, _glowT: 0 };
    return s;
  };
  /** Prepare the next round (stones hidden, Nim at home); `rise` starts when the wipe (if any) is over. */
  P._prepareRound = function () {
    var cfg = this.cfg, self = this;
    var rr = new NH.RNG((this.rng.next() * 4294967296) >>> 0);
    var sp = this.round === this._surpriseRound && this.round > 0 ? this._surpriseType() : null;
    var el = this.time - this.levelStartTime, sb = cfg.shortBudget, short = !!(sb && this.round > 0 && el > sb[Math.min(this.round, sb.length - 1)]);
    var v = this._view, maxK = World.maxRows(v.W, v.H, v.ins, this.age, 3, this.cfg, this.hudKeep);
    var cur = NH.Content.makeRound(this.topic, { age: this.age, lang: this.lang, rng: rr, roundIndex: this.round, surprise: sp, short: short, level: this.level,
      usedKeys: this._usedKeys, prevRule: this._prevRule, prevFruit: this._prevFruit, maxK: maxK, maxDots: this.layout && this.layout.phone ? cfg.phoneMaxDots : 0 });
    this._usedKeys.push(cur.key); this._prevFruit = cur.fruit;
    this._clearRound();
    this.cur = cur; this.surprise = cur.surprise;
    this.misses = 0; this.streak = 0; this._noProg = 0; this._roundAssisted = false; this.row = 0;
    this._relayout(false);   // S / rows for this round's k × m (no stones yet: nothing glides)
    var order = 0;
    this.stones = [];
    cur.rows.forEach(function (row) { row.forEach(function (q) { self.stones.push(self._newStone(q, order++)); }); });
    this._applyHomes();
    this.stones.forEach(function (s) { self._placeStone(s, 0); self._twin(s); });
    this._setState('round'); this._setPhase('wait');
  };
  P._beginRise = function () {
    var cfg = this.cfg, cur = this.cur;
    this._setState('round'); this._setPhase('rise');
    this._idleT = 0; this._idleGap = cfg.idleTime; this._idleN = 0;
    this.stones.forEach(function (s) { s._riseAt = cfg.riseLead + s.order * cfg.riseEach; });
    this._riseDone = -1;
    this.fruit = { kind: cur.fruit, x: 0, y: 0, _px: 0, _py: 0, s: 0, _ps: 0, sV: 0, rot: 0, _prot: 0, state: 'wait', t: 0, slot: -1, size: 2 * this.layout.fruitR };
    this._placeFruit(); this.fruit._px = this.fruit.x; this.fruit._py = this.fruit.y;
    this.fruit.sV = kickFor(1.15, 14, 0.35);
    this._mood('happy', 1.0);
    var c = this._riverCentre();
    this._emit({ type: 'round', round: this.round, topic: this.topic, surprise: cur.surprise, k: cur.k, m: cur.m, n: cur.n, mode: cur.mode, short: cur.short, key: cur.key, fruit: cur.fruit, x: c.x, y: c.y });
  };
  P._ask = function () {
    var cfg = this.cfg, cur = this.cur, M = this._head();
    this._idleT = 0; this._idleGap = cfg.idleTime; this._idleN = 0;
    this._mood('talk', 1.0);
    var modeFirst = !this._modesSeen[cur.mode]; this._modesSeen[cur.mode] = true;
    this._emit({ type: 'ask', promptKey: cur.promptKey, params: cur.params, rule: cur.rule, first: this.round === 0, modeFirst: modeFirst,
      round: this.round, k: cur.k, m: cur.m, mode: cur.mode, x: M.x, y: M.y });
    if (this.surprise) this._surpriseAt = this.time + this._crng.float(cfg.surpriseAt[0], cfg.surpriseAt[1]);
  };
  P._startTalk = function () {
    var rr = new NH.RNG((this.rng.next() * 4294967296) >>> 0);
    this.talk = NH.Content.makeTalk(this.topic, { age: this.age, lang: this.lang, rng: rr, level: this.level });
    this.talk.glowAnswer = false;
    this.talkAnswered = null; this._talkAskT = 0; this._talkAsks = 0;
    this.cur = null; this.phase = null;
    this._clearRound();
    this._relayout(false);
    this._setState('talk');
    this._mood('talk', 1.2);
    var c = this._riverCentre();
    this._emit({ type: 'talk', talk: this.talk, x: c.x, y: c.y });
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

  // ---------------------------------------------------------------- input (logical px; ONE active pointer; a gesture = down … up)
  P._touch = function () { this._idleT = 0; this._idleGap = this.cfg.idleTime; };
  /**
   * pointerDown(x, y) → 'stone' (judged right / wrong) | 'queued' (a stone of the next row while Nim is mid-hop: judged when he
   * stands, ≤ 0.35 s) | 'squish' (a stone outside play: it wobbles, `squish {early}`) | 'ahead' (a later row: `ahead`) | 'fish' |
   * 'frog' | 'snow' | 'nim' (poke fires on release) | 'soft' (water / bank / nothing) | null (not in a round).
   */
  P.pointerDown = function (x, y) {
    if (this._g || (this.state !== 'round' && this.state !== 'roundDone')) return null;
    this.finger.x = x; this.finger.y = y; this.finger.down = true;
    var g = this._g = { x0: x, y0: y, x: x, y: y, t: this.time, kind: 'tap', maxD: 0, result: null };
    this._touch();
    return (g.result = this._press(x, y, g));
  };
  P._press = function (x, y, g) {
    var play = this.interactive;
    if (play && this.assistId && this._inRiver(x, y)) {   // assist: the next press anywhere in the river picks the glowing target
      var a = this.stoneById(this.assistId), under = this._stoneAt(x, y);
      if (a && a.state === 'rest') { this._roundAssisted = true; this._emit({ type: 'assist', id: a.id, from: under ? under.s.id : null, x: a.x, y: a.y }); this._right(a); return 'stone'; }
    }
    // Nim in the air over the next row: a press on him is a poke, never a press on a stone behind him
    if (this._hop && inBox(this.nimHit(), x, y)) { if (g) g.kind = 'nim'; return 'nim'; }
    var st = this._stoneAt(x, y), onBody = st && st.d <= 0.5 * this.layout.S;
    if (!onBody) {
      if (this._fishAt(x, y)) { this._tapFish(); if (g) g.kind = 'surprise'; return 'fish'; }
      if (this._frogAt(x, y)) { this._tapFrog(); if (g) g.kind = 'surprise'; return 'frog'; }
      var sf = this._snowAt(x, y);
      if (sf && this._clearOfKeep(sf.x, sf.y)) { this._tapSnow(sf); if (g) g.kind = 'surprise'; return 'snow'; }
    }
    if (st && !st.s.visited) {
      var res = this._pressStone(st.s, x, y);
      if (res) return res;
    }
    if (inBox(this.nimHit(), x, y)) { if (g) g.kind = 'nim'; return 'nim'; }
    return this._soft(x, y, play);
  };
  P._soft = function (x, y, play) {
    if (this._inRiver(x, y) && this._waterAt(x, y)) this._ripple(x, y, 0.35, 0.6);
    this._emit({ type: 'soft', x: x, y: y });
    if (play) this._noProgress(false);
    return 'soft';
  };
  /** Is (x, y) open water (in the river, not on a stone body)? */
  P._waterAt = function (x, y) { var r = this.layout.river; return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h && !this._onStoneBody(x, y); };
  /** The row a press is judged against: while Nim hops onto row j, the NEXT row (j + 1) is the one a child aims at. */
  P._activeRow = function () { var H = this._hop; return H && H.kind === 'stone' ? H.to + 1 : this.row; };
  P._pressStone = function (s, x, y) {
    var cfg = this.cfg, sg = x < s.x ? 1 : -1, ar = this._activeRow(), play = this.state === 'round' && this.phase === 'play' && !!this.cur;
    if (play && s.row === ar && s.state === 'rest' && ar < this.cur.k) {
      if (this.interactive) { this._judge(s); return 'stone'; }
      if (this._hop || this.nim.state !== 'stand' || this.time < this._holdUntil) {
        // a press made while Nim is still hopping / counting: only the right stone is kept (judged when he can hop again);
        // any other stone just wobbles — a mid-air tap is never a miss (playtest P2)
        if (s.target) {   // kept until he can hop again (the rest of this hop + the count hold) + queueTime
          var Hq = this._hop, rest = !Hq ? 0 : Hq.phase === 'air' && Hq.p ? Math.max(0, Hq.p.T - Hq.t) : Math.max(0, Hq.crouchT - Hq.t) + cfg.hopTimeMax;
          this._queued = { x: x, y: y, t: this.time, exp: this.time + rest + cfg.landTime + cfg.queueTime + (this.cur.mode === 'countSeq' ? cfg.countHold : 0) };
          return 'queued';
        }
        s.tiltV += sg * kickFor(cfg.earlyTilt, cfg.tiltOmega, cfg.tiltZeta); s.dipV += 0.5 * cfg.aheadDipV;
        this._emit({ type: 'squish', id: s.id, early: true, x: s.x, y: s.y });
        return 'squish';
      }
    }
    if (play && s.row > ar && s.state === 'rest') {
      s.dipV += cfg.aheadDipV; s.tiltV += sg * kickFor(cfg.aheadTilt, cfg.tiltOmega, cfg.tiltZeta);
      this._ripple(s.x, s.hy + 0.3 * this.layout.S, 0.6, 0.5);
      this._emit({ type: 'ahead', id: s.id, row: s.row, active: this.row, x: s.x, y: s.y });
      if (this.interactive) this._noProgress(false);
      return 'ahead';
    }
    if (s.state === 'rest' || s.state === 'rise') {
      s.tiltV += sg * kickFor(cfg.earlyTilt, cfg.tiltOmega, cfg.tiltZeta); s.dipV += 0.5 * cfg.aheadDipV;
      this._emit({ type: 'squish', id: s.id, early: true, x: s.x, y: s.y });
      return 'squish';
    }
    return null;
  };
  P.pointerMove = function (x, y) {
    var g = this._g;
    if (!g) return;
    g.maxD = Math.max(g.maxD, hyp(x - g.x0, y - g.y0));
    this.finger.x = x; this.finger.y = y; g.x = x; g.y = y;
  };
  /** → 'pokeNim' | 'up' | null */
  P.pointerUp = function (x, y) {
    var g = this._g;
    this._g = null; this.finger.down = false;
    if (!g) return null;
    if (x === undefined) { x = g.x; y = g.y; }
    var mv = Math.max(g.maxD, hyp(x - g.x0, y - g.y0));
    if (g.kind === 'nim' && mv < this.cfg.tapMovePx && (this.state === 'round' || this.state === 'roundDone')) return this._pokeNim() || 'up';
    return 'up';
  };
  /** The finger left (touchcancel / pause / rotation): the gesture ends without a judgement. */
  P.cancelDrag = function () { this._g = null; this.finger.down = false; };

  P._judge = function (s) { if (s.target) this._right(s); else this._wrong(s); };
  P._right = function (s) {
    var cfg = this.cfg, cur = this.cur, t = s.thing, j = this.row;
    this.streak = 0; this._noProg = 0; this._touch();
    if (this.assistId === s.id) this.assistId = null;
    if (this.hintHand && this.hintHand.id === s.id) this.hintHand = null;
    s._glowT = 0; this.assistId = null; this.hintHand = null;
    var ev = { type: 'right', id: s.id, thing: t, rule: cur.rule, mode: cur.mode, row: j, k: cur.k, left: cur.k - j - 1, misses: this.misses, x: s.x, y: s.y };
    if (cur.mode === 'countSeq') ev.count = j + 1;
    if (cur.mode === 'countSel') ev.n = t.n;
    if (t.kind === 'animal') ev.home = t.home;
    this._mood('happy', cfg.moodTime.happy);
    this._emit(ev);
    s.visited = true;
    this._startHop({ kind: 'stone', id: s.id, from: this.nim.onRow, to: j });
  };
  P._wrong = function (s) {
    var cfg = this.cfg, cur = this.cur, t = s.thing, n = this.nim, sg = s.x >= n.x ? 1 : -1;
    s.tiltV += sg * kickFor(cfg.wrongTilt, cfg.tiltOmega, cfg.tiltZeta); s.dipV += cfg.wrongDipV;
    s.wigV += kickFor(cfg.wrongWig, cfg.wigOmega, cfg.wigZeta) * (this._crng.chance(0.5) ? 1 : -1);
    this._ripple(s.x, s.hy + 0.3 * this.layout.S, 0.55, 0.6);
    n._leanTo = sg * cfg.leanWrong; n._leanT = cfg.leanHold;
    if (this.time - s._lastWrongT < cfg.sameWrongWindow) {   // the same stone again within 1 s: only wobbles
      s._lastWrongT = this.time;
      this._emit({ type: 'squish', id: s.id, repeat: true, x: s.x, y: s.y });
      // not a miss, but it is no progress: a child hammering one wrong stone still gets the hint and the assist (playtest P0)
      if (this.interactive && this.time - (s._sqNP == null ? -1e9 : s._sqNP) > cfg.repeatNoProgress) { s._sqNP = this.time; this._noProgress(false); }
      return;
    }
    s._lastWrongT = this.time;
    this.misses++; this.streak++;
    this._mood('oops');
    var want = { kind: cur.rule.kind, value: cur.rule.value, nameKind: cur.rule.nameKind, promptKey: cur.promptKey, params: cur.params, left: cur.k - this.row };
    if (cur.mode === 'countSeq') want.count = this.row + 1;
    var ev = { type: 'wrong', id: s.id, thing: t, got: { nameKind: t.nameKind, nameValue: t.nameValue }, want: want, rule: cur.rule, mode: cur.mode, row: this.row,
      streak: this.streak, misses: this.misses, x: s.x, y: s.y };
    this._emit(ev);
    var h0 = this._lastHintT;
    this._noProgress(true);
    if (this._lastHintT !== h0) ev.hint = true;
  };
  P._noProgress = function (miss) {
    var cfg = this.cfg;
    this._noProg++;
    if ((miss && this.misses >= cfg.hintAfterMisses) || this._noProg >= cfg.hintAfterSoft) this._autoHint(false);
    if (this._noProg >= cfg.assistAfter && !this.assistId) {
      var a = this._target();
      if (a) { this.assistId = a.id; this._emit({ type: 'assistArmed', id: a.id, x: a.x, y: a.y }); }
    }
  };
  P._pokeNim = function () {
    var a = this.prompt(), M = this._head(), n = this.nim;
    this._touch();
    this._mood('giggle');
    var ev = { type: 'pokeNim', x: M.x, y: M.y };
    if (a) { ev.promptKey = a.promptKey; ev.params = a.params; ev.rule = a.rule; ev.left = a.left; ev.mode = a.mode; } else ev.busy = true;
    this._emit(ev);
    if (n.state === 'stand' && !this._hop && !this._bank) this._startHop({ kind: 'poke', from: n.onRow, to: n.onRow });
    return 'pokeNim';
  };

  // ---------------------------------------------------------------- help
  P.resetNudges = function () {
    this._idleT = 0; this._idleGap = this.cfg.idleTime; this._idleN = 0;
    this._talkAskT = 0; this._talkAsks = 0;
    if (this.talk) this.talk.glowAnswer = false;
  };
  P._glowing = function () { for (var i = 0; i < this.stones.length; i++) if (this.stones[i]._glowT > 0) return true; return false; };
  P._autoHint = function (fromIdle) {
    if (this._glowing() || this.hintHand || this.time - this._lastHintT < this.cfg.hintCooldown) return null;
    return this._doHint(fromIdle);
  };
  P._doHint = function (fromIdle) {
    var cfg = this.cfg, cur = this.cur;
    if (!this.interactive) return null;
    var s = this._target();
    if (!s) return null;
    s._glowT = cfg.hintTime;
    var p = this._hitPt(s);
    this.hintHand = { id: s.id, x: p.x, y: p.y, _px: p.x, _py: p.y, t: 0, press: 0, alpha: 0, time: 0, T: cfg.hintTime };
    this._stepHint(0);
    this._lastHintT = this.time;
    this._mood('talk', 1.2);
    var want = { kind: cur.rule.kind, value: cur.rule.value, nameKind: cur.rule.nameKind, promptKey: cur.promptKey, params: cur.params, left: cur.k - this.row };
    if (cur.mode === 'countSeq') want.count = this.row + 1;
    var ev = { type: 'hint', id: s.id, x: s.x, y: s.y, want: want };
    if (fromIdle) ev.idle = true;
    this._emit(ev);
    return { stone: s.id, id: s.id };
  };
  /** Manual hint (a tap on the speech bubble): the active row's target glows + the ghost hand taps it. */
  P.hint = function () {
    if (!this.interactive) return null;
    if (this.hintHand) return { stone: this.hintHand.id, id: this.hintHand.id };
    return this._doHint(false);
  };
  /** Ghost hand (1.6 s cycle): glides in from below-right, taps the stone twice, drifts back fading. Fingertip = (x, y). */
  P._stepHint = function (h) {
    var H = this.hintHand, cfg = this.cfg;
    if (!H) return;
    H.time += h;
    var s = this.stoneById(H.id);
    if (!s || s.state !== 'rest' || s.visited || H.time >= H.T || this.state !== 'round' || this.phase !== 'play') { this.hintHand = null; return; }
    var p = this._hitPt(s), tx = p.x + 6, ty = p.y + 10;
    var u = (H.time % cfg.hintCycle) / cfg.hintCycle, ox = tx + 64, oy = ty + 104, x, y, press = 0, fade = 1;
    if (oy > this.layout.H - this.layout.ins.bottom - 10) { oy = ty - 90; }
    if (u < 0.25) { var v = smooth(u / 0.25); x = lerp(ox, tx, v); y = lerp(oy, ty, v); }
    else if (u < 0.65) { var k = (u - 0.25) / 0.2, tap = Math.sin(Math.PI * (k % 1)); press = tap; x = tx; y = ty + 8 * (1 - tap); }
    else { var w2 = smooth((u - 0.65) / 0.35); x = lerp(tx, ox, w2); y = lerp(ty, oy, w2); fade = 1 - 0.9 * w2; }
    H.alpha = clamp(H.time / 0.25, 0, 1) * clamp((H.T - H.time) / 0.35, 0, 1) * fade;
    H.x = x; H.y = y; H.t = u; H.press = press;
  };

  // ---------------------------------------------------------------- Nim: hops
  /** Where Nim stands now when not hopping: his stone's top centre, the near-bank home, or the bank sequence point. */
  P._standPoint = function () {
    var n = this.nim, L = this.layout;
    if (n.onRow >= 0 && this.cur && n.onRow < this.cur.k && this._onStone) { var s = this.stoneById(this._onStone); if (s && s.state !== 'gone') return { x: s.x, y: s.y }; }
    if (this._bank) return this._bankFeet();
    return { x: L.nimHome.x, y: L.nimHome.y };
  };
  P._hopTarget = function (H) {
    if (H.kind === 'stone') { var s = this.stoneById(H.id); return s ? { x: s.x, y: s.y } : { x: this.nim.x, y: this.nim.y }; }
    if (H.kind === 'bank') return this._bankPts().land;
    if (H.kind === 'walk') { var bp = this._bankPts(); return H.n === 0 ? bp.mid : bp.roll; }
    return this._standPoint();   // poke: in place (on his stone / bank point)
  };
  /** Start a hop: crouch (crouchTime) → air (ballistic) → land. opt {kind 'stone'|'bank'|'walk'|'poke', id?, from, to, n?} */
  P._startHop = function (opt) {
    var cfg = this.cfg, n = this.nim;
    var small = opt.kind === 'walk' || opt.kind === 'poke';
    this._hop = { kind: opt.kind, id: opt.id, from: opt.from, to: opt.to, n: opt.n || 0, phase: 'crouch', t: 0,
      crouchT: small ? cfg.walkCrouch : cfg.crouchTime, p: null, A: 0, tx0: 0, ty0: 0 };
    n.state = 'crouch';
    if (opt.kind !== 'poke' && opt.kind !== 'walk') this._queued = null;
  };
  P._takeOff = function () {
    var cfg = this.cfg, H = this._hop, n = this.nim, to = this._hopTarget(H), dx = to.x - n.x, dist = hyp(dx, to.y - n.y);
    var T, A;
    if (H.kind === 'walk') { T = cfg.walkTime; A = cfg.walkApex; }
    else if (H.kind === 'poke') { T = cfg.pokeHopTime; A = cfg.pokeApex; }
    else { T = hopTime(cfg, dist); A = hopApex(cfg, dx); A = Math.min(A, Math.max(cfg.apexMinCap, this._apexRoom(n.x, n.y, to.x, to.y))); }
    H.p = plan(n.x, n.y, to.x, to.y, T, A); H.A = A; H.t = 0; H.phase = 'air'; H.tx0 = to.x; H.ty0 = to.y;
    n.state = H.kind === 'walk' ? 'walk' : 'air';
    n.sqV += H.kind === 'stone' || H.kind === 'bank' ? cfg.takeoffSqV : 0.5 * cfg.takeoffSqV;
    if (H.kind === 'stone' || H.kind === 'bank') {
      if (this._onStone) { var s0 = this.stoneById(this._onStone); if (s0) { s0.dipV -= 0.35 * cfg.landDipV; } }   // the push-off lifts the stone a little
      this._emit({ type: 'hop', from: H.from, to: H.to, id: H.id, kind: H.kind, x: n.x, y: n.y, tx: to.x, ty: to.y });
    }
  };
  /** Landscape: how high the hop's apex may go so Nim's head (+ the take-off stretch) stays below a top keep (speech bubble /
   *  HUD) over his path (visual QA P1-1). Portrait: no limit. */
  P._apexRoom = function (x0, y0, x1, y1) {
    var L = this.layout, cfg = this.cfg;
    if (L.portrait) return 1e9;
    var ex = nimExtent(L.nimH), up = ex.up, xa = Math.min(x0, x1) - ex.left, xb = Math.max(x0, x1) + ex.right, band = -1e9;
    for (var i = 0; i < L.keep.length; i++) { var b = L.keep[i]; if (b.y + b.h / 2 < L.H / 2 && b.x < xb && b.x + b.w > xa) band = Math.max(band, b.y + b.h); }
    return band < -1e8 ? 1e9 : Math.min(y0, y1) - up - band - cfg.nimTopGap;
  };
  P._stepHop = function (h) {
    var cfg = this.cfg, H = this._hop, n = this.nim;
    if (!H) return;
    H.t += h;
    if (H.phase === 'crouch') {
      var sp = this._standPoint(); n.x = sp.x; n.y = sp.y;
      var u = smooth(H.t / H.crouchT), depth = H.kind === 'walk' || H.kind === 'poke' ? 0.5 * cfg.crouchSq : cfg.crouchSq;
      n.sq = lerp(n.sq, depth, u); n.sqV = 0;
      if (H.t >= H.crouchT - 1e-9) this._takeOff();
      return;
    }
    // air: the planned parabola + the target's own small motion (bob / dip) blended in, so the feet meet the stone exactly
    var p = H.p, q = planAt(p, Math.min(H.t, p.T)), to = this._hopTarget(H), u2 = clamp(H.t / p.T, 0, 1);
    n.x = q.x + (to.x - H.tx0) * u2; n.y = q.y + (to.y - H.ty0) * u2;
    var vy0 = Math.abs(p.vy0) || 1, tgt = q.vy < 0 ? cfg.stretch * clamp(-q.vy / vy0, 0, 1) : cfg.fallStretch * clamp(q.vy / vy0, 0, 1);
    if (H.kind === 'walk' || H.kind === 'poke') tgt *= 0.5;
    spring(n, 'sq', 'sqV', tgt, cfg.sqOmega, cfg.sqZeta, h);
    n._leanTo = (H.kind === 'stone' || H.kind === 'bank') ? cfg.leanAir * (q.vy < 0 ? 1 : 0.4) * (p.x1 >= p.x0 ? 1 : -1) : 0; n._leanT = h * 2;
    if (H.t >= p.T - 1e-9) this._land();
  };
  P._land = function () {
    var cfg = this.cfg, H = this._hop, n = this.nim, L = this.layout, to = this._hopTarget(H);
    n.x = to.x; n.y = to.y;
    this._hop = null;
    var small = H.kind === 'walk' || H.kind === 'poke';
    n.sq = small ? 0.5 * cfg.landSq : cfg.landSq; n.sqV = 0;
    n.state = small ? (this._bank ? 'walk' : 'stand') : 'land'; n._landT = small ? 0.04 : cfg.landTime;
    if (H.kind === 'poke') { n.state = 'stand'; return; }
    if (H.kind === 'walk') { this._bank.t = 0; this._bank.step = H.n === 0 ? 'walk2' : 'curl'; return; }
    if (H.kind === 'bank') {
      n.onRow = this.cur.k; this._onStone = null;
      this._emit({ type: 'bankLand', x: n.x, y: n.y });
      this._bank = { step: 'land', t: 0 };
      this._setPhase('bank');
      return;
    }
    // a stone
    var s = this.stoneById(H.id), self = this;
    n.onRow = s.row; this._onStone = s.id;
    s.dipV += cfg.landDipV;
    s.tiltV += (H.p.x1 >= H.p.x0 ? 1 : -1) * kickFor(cfg.landTilt, cfg.tiltOmega, cfg.tiltZeta);
    var wx = s.x, wy = s.hy + 0.3 * L.S;
    this._ripple(wx, wy, 1, 1); this._ripple(wx, wy, 1, 0.8, cfg.rippleGap);
    this._splashDrops(s, cfg.dropN, 1);
    this._emit({ type: 'land', id: s.id, row: s.row, k: this.cur.k, x: s.x, y: s.y });
    this._emit({ type: 'splash', id: s.id, big: false, x: wx, y: wy });
    // the thing: hops away (match / countSeq) · rises above Nim and is counted (countSel) · shows its home (animals)
    var mode = this.cur.mode, t = s.thing;
    s._tT = 0;
    if (mode === 'countSel') { s._tState = 'count'; s.count = 0; this._counting = s.id; }
    else if (t.kind === 'animal') {
      s._tState = 'badge';
      s.badge = { home: t.home, x: s.x, y: s.y, r: L.badgeR, a: 0 };
    } else this._thingAway(s);
    this.stones.forEach(function (o) { if (o.row === s.row && o.id !== s.id && (o.state === 'rest' || o.state === 'rise')) { o.state = 'sink'; o.sinkT = 0; self._ripple(o.x, o.hy + 0.3 * L.S, 0.8, 0.7); } });
    this.row = s.row + 1;
    if (this.row >= this.cur.k) this._bankAt = this.time + cfg.bankDelay;
    else if (mode === 'countSeq') this._holdUntil = this.time + cfg.countHold;   // the number is said before the next hop
  };
  P._thingAway = function (s) {
    s._tState = 'away'; s._tT = 0; s._hop0 = s.thingHop;
    this._emit({ type: 'thingAway', id: s.id, x: s.x + s.thingDx, y: s.y - s.thingHop - 0.5 * this.layout.itemH * s.thingS });
  };
  /** Where a counted / badge thing shows itself: above Nim's head, or beside him when that would touch the speech bubble. */
  P._showSpot = function (s) {
    var cfg = this.cfg, L = this.layout, sc = cfg.showScale, ih = L.itemH * sc, up = L.nimH * 0.92;
    var band = L.play.y0 - cfg.bandGap + 8;
    if (s.y - up - ih >= band) return { hop: up, dx: 0 };
    // beside him, clear of his whole art (0.49·nimH to the nose side) — never flipped onto his face
    var hop = clamp(0.5 * L.nimH, 0, Math.max(0, s.y - ih - band)), wb = s.badge ? 2 * L.badgeR + 6 : 0;
    var off = 0.5 * L.nimH + 0.55 * ih + 8, fits = function (d) { var x = s.x + d; return x - 0.5 * ih - (d < 0 ? wb : 0) >= L.ins.left + 6 && x + 0.5 * ih + (d > 0 ? wb : 0) <= L.W - L.ins.right - 6; };
    var dx = off * (L.portrait ? 1 : -1);
    if (!fits(dx)) dx = -dx;
    if (!fits(dx)) return { hop: Math.max(0, s.y - ih - band), dx: 0 };   // no room either side (a screen edge): above him, as high as the band allows
    return { hop: hop, dx: dx };
  };
  P._stepThing = function (s, h) {
    var cfg = this.cfg, L = this.layout;
    if (s._tState === 'on') return;
    s._tT += h;
    if (s._tState === 'away') {
      var u = s._tT / cfg.thingHopTime;
      s.thingHop = (s._hop0 || 0) + cfg.thingHopH * easeOut(u);
      s.thingA = 1 - clamp((s._tT - cfg.thingAwayDelay) / (cfg.thingAwayTime - cfg.thingAwayDelay), 0, 1);
      s.thingS = (s._s0 || 1) * (1 + 0.15 * easeOut(u));
      if (s.badge) { s.badge.a = Math.max(0, s.badge.a - h * 4); }
      if (s.thingA <= 0) { s._tState = 'gone'; s.thingA = 0; s.badge = null; }
      return;
    }
    if (s._tState === 'count' || s._tState === 'badge') {
      var spot = this._showSpot(s), um = smooth(s._tT / cfg.showMove);
      s.thingHop = spot.hop * um; s.thingDx = spot.dx * um; s.thingS = lerp(1, cfg.showScale, um); s._s0 = s.thingS;
      if (s._tState === 'count') {
        var n = s.thing.n, kk = Math.min(n, Math.floor((s._tT - cfg.countDelay) / cfg.countStep + 1e-9) + 1);
        if (s._tT >= cfg.countDelay && kk > s.count) {
          s.count = kk;
          this._emit({ type: 'count', id: s.id, i: kk, n: n, x: s.x + s.thingDx, y: s.y - s.thingHop - 0.5 * L.itemH * s.thingS });
        }
        if (s.count >= n && s._tT >= cfg.countDelay + (n - 1) * cfg.countStep + cfg.countTail) { this._counting = null; this._thingAway(s); }
      } else {
        var b = s.badge, dxb = (0.5 * L.itemH * s.thingS + L.badgeR + 6) * (s.thingDx < 0 ? -1 : 1);
        b.x = s.x + s.thingDx + dxb; b.y = s.y - s.thingHop - 0.55 * L.itemH * s.thingS; b.r = L.badgeR;
        if (b.x + b.r > L.W - L.ins.right - 4 || b.x - b.r < L.ins.left + 4) { dxb = -dxb; b.x = s.x + s.thingDx + dxb; }
        var was = b.a; b.a = Math.min(1, b.a + h * cfg.badgeRate);
        if (was === 0) this._emit({ type: 'homeBadge', id: s.id, home: b.home, x: b.x, y: b.y });
        if (s._tT >= cfg.showMove + cfg.badgeHold) this._thingAway(s);
      }
    }
  };

  // ---------------------------------------------------------------- bank phase (≈ 2.2 s)
  /** The bank's points for the CURRENT layout: land (the bank hop's landing), mid (walk hop 1), roll (roll start = walk hop 2), end. */
  P._bankPts = function () {
    var L = this.layout, cfg = this.cfg, f = this._acrossFrac === undefined ? 0.5 : this._acrossFrac, land;
    if (!L.portrait) {
      var y0 = L.play.y0 + 0.8 * L.nimH, y1 = L.play.y1 - 10;
      land = { x: Math.min(L.far.x + cfg.bankLandX, L.rollStart.x), y: lerp(y0, y1, f) };
    } else {
      land = { x: clamp(lerp(L.a0, L.a1, f), L.ins.left + 0.45 * L.nimH, L.W - L.ins.right - 0.45 * L.nimH), y: L.goal.y };
    }
    var roll = L.rollStart;
    return { land: land, mid: { x: lerp(land.x, roll.x, 0.5), y: lerp(land.y, roll.y, 0.5) }, roll: roll, end: L.rollEnd, goal: L.goal };
  };
  /** Nim's feet during the bank sequence (when not hopping). */
  P._bankFeet = function () {
    var B = this._bank, bp = this._bankPts();
    if (!B) return bp.land;
    if (B.step === 'land' || B.step === 'walk1') return bp.land;
    if (B.step === 'walk2') return bp.mid;
    if (B.step === 'curl') return bp.roll;
    if (B.step === 'roll') return { x: lerp(bp.roll.x, bp.end.x, this._rollU(B.t)), y: bp.roll.y };
    return bp.end;
  };
  P._rollU = function (t) { var u = clamp(t / this.cfg.rollTime, 0, 1); return u < 0.5 ? 2 * u * u : 1 - 2 * (1 - u) * (1 - u); };   // ease in-out (a push, then it slows)
  P._startBankHop = function () {
    var last = this._onStone ? this.stoneById(this._onStone) : null, L = this.layout;
    if (last) {
      if (!L.portrait) { var y0 = L.play.y0 + 0.8 * L.nimH, y1 = L.play.y1 - 10; this._acrossFrac = clamp((last.hy - y0) / Math.max(1, y1 - y0), 0, 1); }
      else this._acrossFrac = clamp((last.hx - L.a0) / Math.max(1, L.a1 - L.a0), 0, 1);
    }
    this._bankAt = -1;
    this._startHop({ kind: 'bank', from: this.nim.onRow, to: this.cur.k });
  };
  P._stepBank = function (h) {
    var cfg = this.cfg, B = this._bank, n = this.nim, L = this.layout, bp = this._bankPts();
    if (!B || this._hop) return;
    B.t += h;
    switch (B.step) {
      case 'land':
        if (B.t >= cfg.landHold) { B.step = 'walk1'; B.t = 0; this._startHop({ kind: 'walk', n: 0 }); }
        break;
      case 'walk2':
        this._startHop({ kind: 'walk', n: 1 });
        break;
      case 'curl':
        if (B.t <= h + 1e-9) { n.state = 'roll'; this._emit({ type: 'curl', x: n.x, y: n.y - 0.3 * L.nimH }); }
        n.curl = clamp(B.t / cfg.curlTime, 0, 1);
        if (B.t >= cfg.curlTime) { B.step = 'roll'; B.t = 0; n.rollRot = 0; }
        break;
      case 'roll': {
        var u = this._rollU(B.t), x = lerp(bp.roll.x, bp.end.x, u), R = n.ballR || nimPoints().rollR * L.nimS;
        n.x = x; n.y = bp.roll.y;
        n.rollRot = (x - bp.roll.x) / R;   // rolling without slipping: angle = distance / radius
        var f = this.fruit;
        if (f && f.state === 'wait' && x >= f.x - 0.12 * R) {
          f.state = 'stick'; f.t = 0; f._a0 = Math.PI / 2 - n.rollRot;   // pressed onto the spines at the bottom of the ball
          this._emit({ type: 'stick', fruit: f.kind, x: f.x, y: f.y });
        }
        if (B.t >= cfg.rollTime && f && f.state === 'wait') { f.state = 'stick'; f.t = 0; f._a0 = Math.PI / 2 - n.rollRot; this._emit({ type: 'stick', fruit: f.kind, x: f.x, y: f.y }); }
        if (B.t >= cfg.rollTime) { B.step = 'uncurl'; B.t = 0; n.x = bp.end.x; this._emit({ type: 'uncurl', x: n.x, y: n.y - 0.5 * L.nimH }); this._mood('cheer', 1.6); }
        break;
      }
      case 'uncurl': {
        n.curl = 1 - clamp(B.t / cfg.uncurlTime, 0, 1);
        if (n.curl <= 0) n.state = 'stand';
        var fr = this.fruit;
        if (fr && fr.state === 'stick') { fr.state = 'fly'; fr.t = 0; fr.slot = n.fruits.length % 4; fr._fx = fr.x; fr._fy = fr.y; fr._fr = fr.rot; }
        if (B.t >= Math.max(cfg.uncurlTime, cfg.fruitGlide) && (!fr || fr.state === 'done')) {
          n.state = 'stand'; n.curl = 0;
          B.step = 'cheer'; B.t = 0;
          this._roundDone();
        }
        break;
      }
      case 'cheer':
        if (B.t >= cfg.cheerHold) this._startWipe();
        break;
    }
  };
  P._placeFruit = function () {
    var f = this.fruit, L = this.layout;
    if (!f) return;
    f.size = 2 * L.fruitR;
    if (f.state === 'wait') { f.x = L.goal.x; f.y = L.goal.y - L.fruitR * 0.95; }
  };
  P._stepFruit = function (h) {
    var f = this.fruit, n = this.nim, cfg = this.cfg;
    if (!f) return;
    f.t += h;
    spring(f, 's', 'sV', 1, 14, 0.35, h);
    if (f.state === 'wait') { this._placeFruit(); f.rot = 0.05 * Math.sin(2.2 * this.time); }
    else if (f.state === 'stick') {
      var a = f._a0 + n.rollRot, r = n.ballR * 0.92;
      f.x = n.ballX + Math.cos(a) * r; f.y = n.ballY + Math.sin(a) * r; f.rot = n.rollRot;
      f.s = 1; f.sV = 0;
    } else if (f.state === 'fly') {
      var sl = n.backSlots[f.slot] || { x: n.x, y: n.y - 0.6 * n.h, rot: 0 }, u = smooth(f.t / cfg.fruitGlide);
      f.x = lerp(f._fx, sl.x, u); f.y = lerp(f._fy, sl.y, u) - 26 * Math.sin(Math.PI * u); f.rot = lerp(f._fr, sl.rot, u);
      if (f.t >= cfg.fruitGlide) { f.state = 'done'; n.fruits.push(f.kind); }
    }
  };

  // ---------------------------------------------------------------- round end, wipe
  P._starsFor = function (m) { return m <= 0 ? 3 : m === 1 ? 2 : 1; };
  P._roundDone = function () {
    var st = this._starsFor(this.misses), cur = this.cur, n = this.nim;
    if (this._roundAssisted) st = Math.min(st, 2);   // an assisted round ≤ 2★
    this.roundStars = st; this.stars += st; this.levelStars += st;
    this._prevRule = { kind: cur.rule.kind, value: cur.rule.value };
    this.cancelDrag(); this.hintHand = null; this.assistId = null;
    this._setState('roundDone'); this.phaseTime = 0;
    this._emit({ type: 'roundDone', round: this.round, stars: st, misses: this.misses, assisted: !!this._roundAssisted, fruit: cur.fruit, fruits: n.fruits.length, x: n.x, y: n.y - n.h - 20 });
  };
  P._startWipe = function () {
    var L = this.layout;
    this._setPhase('wipe');
    if (this._bank) this._bank.step = 'done';
    this.wipe = { t: 0, _pt: 0, dir: { x: L.ax.x, y: L.ax.y }, season: this.weather, swapped: false };
    var c = this._riverCentre();
    this._emit({ type: 'wipe', season: this.weather, dir: this.wipe.dir, x: c.x, y: c.y });
  };
  P._stepWipe = function (h) {
    var wp = this.wipe, cfg = this.cfg;
    if (!wp) return;
    wp.t = Math.min(1, wp.t + h / cfg.wipeTime);
    if (!wp.swapped && wp.t >= cfg.wipeSwap) { wp.swapped = true; this._swap(); }
    // the new stones start rising while the curtain's tail leaves the screen (t ≥ 0.75)
    if (wp.swapped && wp.t >= cfg.wipeRise && this.state === 'round' && this.phase === 'wipe') this._beginRise();
    if (wp.t >= 1) this.wipe = null;
  };
  /** The screen is covered: the next round's stones (hidden) + Nim back home, or Talk time. */
  P._swap = function () {
    var cfg = this.cfg;
    this.cur = null;
    this.round++;
    var el = this.time - this.levelStartTime, long = this.round >= cfg.chapterMinRounds && el > cfg.chapterTimeLimit;
    if (this.round < this.roundsPerLevel && !long) { this._prepareRound(); this._setPhase('wipe'); }
    else { if (this.round < this.roundsPerLevel) this.roundsPerLevel = this.round; this._startTalk(); }
  };

  // ---------------------------------------------------------------- water bits
  P._ripple = function (x, y, size, a, delay) {
    var cfg = this.cfg, S = this.layout.S;
    if (this.ripples.length >= cfg.rippleCap) this.ripples.shift();
    var r0 = cfg.rippleR[0] * S * size, r1 = cfg.rippleR[1] * S * size;
    this.ripples.push({ x: x, y: y, r: r0, r0: r0, r1: r1, life: cfg.rippleLife * (0.7 + 0.3 * size), t: -(delay || 0), a: 0, a0: a === undefined ? 1 : a, flat: cfg.rippleFlat });
  };
  P._splashDrops = function (s, n, k) {
    var cfg = this.cfg, r = this._crng, S = this.layout.S, wy = s.hy + 0.3 * S;
    for (var q = 0; q < n; q++) {
      if (this.drops.length >= cfg.dropCap) this.drops.shift();
      var side = q % 2 ? 1 : -1, ang = r.float(0, Math.PI), ex = Math.cos(ang) * 0.5 * S, ey = Math.sin(ang) * 0.12 * S;
      var x = s.x + ex * side, y = wy + ey, vx = side * r.float(cfg.dropOut[0], cfg.dropOut[1]) * Math.abs(Math.cos(ang)) * k + r.float(-20, 20);
      this.drops.push({ x: x, y: y, _px: x, _py: y, y0: y, vx: vx, vy: -r.float(cfg.dropV[0], cfg.dropV[1]) * k, r: r.float(cfg.dropR[0], cfg.dropR[1]), a: 1, t: 0, life: cfg.dropLife * r.float(0.85, 1.15) });
    }
  };
  P._stepWater = function (h) {
    var g = this.cfg.dropG, i;
    for (i = this.drops.length - 1; i >= 0; i--) {
      var d = this.drops[i]; d.t += h;
      d.vy += g * h; d.vx *= 1 - 1.2 * h; d.x += d.vx * h; d.y += d.vy * h;
      d.a = clamp(1 - d.t / d.life, 0, 1);
      if (d.t >= d.life || (d.vy > 0 && d.y > d.y0 + 6)) {   // back into the water: a tiny ring now and then
        if (d.vy > 0 && d.y > d.y0 && this._crng.chance(0.3) && this.ripples.length < this.cfg.rippleCap) this._ripple(d.x, d.y0 + 4, 0.2, 0.45);
        this.drops.splice(i, 1);
      }
    }
    for (i = this.ripples.length - 1; i >= 0; i--) {
      var rp = this.ripples[i]; rp.t += h;
      if (rp.t < 0) { rp.a = 0; continue; }
      var u = rp.t / rp.life;
      rp.r = lerp(rp.r0, rp.r1, easeOut(u)); rp.a = rp.a0 * (1 - u) * Math.min(1, u * 8);
      if (u >= 1) this.ripples.splice(i, 1);
    }
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
  P._twin = function (s) {
    s._px = s.x; s._py = s.y; s._ptilt = s.tilt; s._psub = s.sub; s._palpha = s.alpha; s._pgold = s.gold;
    s._pthingHop = s.thingHop; s._pthingDx = s.thingDx; s._pthingS = s.thingS; s._pthingA = s.thingA; s._pwig = s.wig;
  };
  P._twins = function () {
    var i, o;
    for (i = 0; i < this.stones.length; i++) this._twin(this.stones[i]);
    for (i = 0; i < this.drops.length; i++) { o = this.drops[i]; o._px = o.x; o._py = o.y; }
    for (i = 0; i < this.snowflakes.length; i++) { o = this.snowflakes[i]; o._px = o.x; o._py = o.y; o._prot = o.rot; }
    if (this.fish) { o = this.fish; o._px = o.x; o._py = o.y; o._prot = o.rot; }
    if (this.frog) { o = this.frog; o._px = o.x; o._py = o.y; }
    if (this.fruit) { o = this.fruit; o._px = o.x; o._py = o.y; o._ps = o.s; o._prot = o.rot; }
    if (this.hintHand) { this.hintHand._px = this.hintHand.x; this.hintHand._py = this.hintHand.y; }
    if (this.wipe) this.wipe._pt = this.wipe.t;
    var n = this.nim;
    n._px = n.x; n._py = n.y; n._psx = n.sx; n._psy = n.sy; n._plean = n.lean; n._prollRot = n.rollRot; n._pcurl = n.curl;
  };
  P._step = function (h) {
    var cfg = this.cfg;
    this._twins();
    this.time += h; this.stateTime += h; this.phaseTime += h;
    var inChapter = this.state === 'intro' || this.state === 'round' || this.state === 'roundDone' || this.state === 'talk' || this.state === 'levelDone';
    this.wind = this.windModel.step(h, this.weather);
    this.gust = this.windModel.gust;
    var ge = this.windModel.drain();
    for (var gi = 0; gi < ge.length; gi++) if (inChapter) { var c = this._riverCentre(); this._emit({ type: 'gust', dir: ge[gi].dir, x: c.x, y: c.y }); }
    switch (this.state) {
      case 'intro': if (this.stateTime >= cfg.introTime) { this._prepareRound(); this._beginRise(); } break;
      case 'round': this._stepRound(h); break;
      case 'roundDone': this._stepBank(h); break;
      case 'talk':
        if (this.talkAnswered) { if (this.stateTime >= cfg.talkAfterAnswer) this._levelDone(); break; }
        this._talkAskT += h;
        if (this._talkAsks < cfg.talkMaxAsks && this._talkAskT >= cfg.talkAskTime - 1e-9) {
          this._talkAskT = 0; this._talkAsks++;
          if (this._talkAsks >= cfg.talkGlowAfterAsks) this.talk.glowAnswer = true;
          this._emit({ type: 'talkAsk', talk: this.talk, n: this._talkAsks, glowAnswer: this.talk.glowAnswer });
        } else if (this._talkAsks >= cfg.talkMaxAsks && this._talkAskT >= cfg.talkGiveUp - 1e-9) this.talkAnswer(this.talk.answer, true);   // Nim answers
        break;
      case 'levelDone':
        if (this.stateTime >= cfg.levelDoneTime) {
          if (this.level < this.levels.length - 1) this.startLevel(this.level + 1);
          else {
            this._setState('sessionDone'); this.phase = null;
            this.lastTopics = this.levels.slice();
            this._mood('dance', 1e9);
            this._emit({ type: 'sessionDone', stars: this.stars, fruits: this.nim.fruits.length });
          }
        }
        break;
    }
    this._stepWipe(h);
    this._stepHop(h);
    this._stepStones(h);
    this._stepFruit(h);
    this._stepSurprises(h);
    this._stepHint(h);
    this._stepWater(h);
    this._stepNim(h);
    if (this._queued && this.interactive) {   // a tap made while Nim was in the air: judged now (≤ 0.35 s old)
      var q = this._queued; this._queued = null;
      if (this.time <= (q.exp != null ? q.exp : q.t + cfg.queueTime) + 1e-9) { var st = this._stoneAt(q.x, q.y); if (st && st.s.row === this.row && st.s.state === 'rest' && !st.s.visited && st.s.target) this._judge(st.s); }
    }
  };
  P._stepRound = function (h) {
    var cfg = this.cfg, self = this;
    if (this.phase === 'rise') {
      var all = true;
      this.stones.forEach(function (s) {
        if (s.state === 'hidden' && self.phaseTime >= s._riseAt) {
          s.state = 'rise'; s.riseT = 0;
          self._placeStone(s, 0);
          self._ripple(s.x, s.hy + 0.3 * self.layout.S, 0.8, 0.8); self._splashDrops(s, cfg.riseDrops, 0.7);
          self._emit({ type: 'rise', id: s.id, row: s.row, i: s.i, x: s.x, y: s.hy });
        }
        if (s.state === 'hidden' || s.state === 'rise') all = false;
      });
      if (all) {
        if (this._riseDone < 0) this._riseDone = this.time;
        if (this.time - this._riseDone >= cfg.askAfterRise - 1e-9) { this._setPhase('play'); this._ask(); }
      }
      return;
    }
    if (this.phase === 'bank') { this._stepBank(h); return; }
    if (this.phase !== 'play') return;
    if (this.interactive && !this._g) {
      this._idleT += h;
      if (this._idleT >= this._idleGap - 1e-9) {
        this._idleT = 0; this._idleGap = Math.min(cfg.idleMax, this._idleGap * cfg.idleBackoff); this._idleN++;
        this._mood('think');
        var M = this._head();
        this._emit({ type: 'idle', n: this._idleN, promptKey: this.cur.promptKey, params: this.cur.params, rule: this.cur.rule, left: this.cur.k - this.row, mode: this.cur.mode, x: M.x, y: M.y });
        if (this._idleN >= cfg.idleHintFrom) this._autoHint(true);
      }
    }
    if (this._bankAt >= 0 && this.time >= this._bankAt && !this._hop && !this._counting && this.nim.state === 'stand') this._startBankHop();
  };

  // ---------------------------------------------------------------- stones
  /** x, y from home + bob + dip + rise / sink offset + rotation glide. */
  P._placeStone = function (s, h) {
    var cfg = this.cfg, S = this.layout.S;
    if (s.gt < 1) s.gt = Math.min(1, s.gt + h / cfg.glideTime);
    var gk = 1 - smooth(s.gt);
    s.x = s.hx + s.gx * gk;
    s.y = s.hy + s.bob + s.dip + s.offY + s.gy * gk;
    s.sub = clamp((s.dip + s.offY) / (cfg.subK * S), 0, 1);
  };
  P._stepStones = function (h) {
    var cfg = this.cfg, L = this.layout, S = L.S, t = this.time, gustT = cfg.gustTilt * clamp(this.windModel.gustDir * this.gust + this.wind / 120, -1, 1);
    var play = this.state === 'round' && this.phase === 'play';
    for (var i = 0; i < this.stones.length; i++) {
      var s = this.stones[i];
      if (s.state === 'gone') continue;
      if (s.state === 'hidden') { s.alpha = 0; s.offY = cfg.riseDepth * S; this._placeStone(s, h); continue; }
      if (s.state === 'rise') {
        s.riseT = Math.min(1, s.riseT + h / cfg.riseTime);
        s.offY = lerp(cfg.riseDepth * S, -cfg.riseOver, easeOut(s.riseT));
        s.alpha = Math.min(1, s.riseT * 3);
        if (s.riseT >= 1) { s.state = 'rest'; s.dip += s.offY; s.offY = 0; s.dipV = 0; }   // the overshoot is handed to the dip spring
      } else if (s.state === 'sink') {
        s.sinkT = Math.min(1, s.sinkT + h / cfg.sinkTime);
        s.offY = cfg.sinkDepth * S * smooth(s.sinkT);
        s.alpha = 1 - smooth(s.sinkT);
        s.thingA = Math.min(s.thingA, 1 - s.sinkT);
        if (s.sinkT >= 1) { s.state = 'gone'; s.alpha = 0; }
      }
      if (s.state === 'rest' || s.state === 'sink' || s.state === 'rise') {
        s.bob = cfg.bobAmp * Math.sin(TAU * s.bobHz * t + s.bobPh) * (s.state === 'rest' ? 1 : 0.5);
        spring(s, 'dip', 'dipV', 0, cfg.dipOmega, cfg.dipZeta, h);
        spring(s, 'tilt', 'tiltV', this.weather === 2 ? gustT : 0, cfg.tiltOmega, cfg.tiltZeta, h);
        spring(s, 'wig', 'wigV', 0, cfg.wigOmega, cfg.wigZeta, h);
        s.dip = clamp(s.dip, -0.3 * S, 0.3 * S); s.tilt = clamp(s.tilt, -0.35, 0.35);
      }
      if (s.visited) s.gold = Math.min(1, s.gold + h / cfg.goldTime);
      if (s._glowT > 0) s._glowT = Math.max(0, s._glowT - h);
      var gT = this.assistId === s.id ? 1 : s._glowT > 0 ? 0.55 + 0.45 * Math.sin(TAU * 1.6 * t) : 0;
      s.glow += (gT - s.glow) * Math.min(1, h * (gT > s.glow ? 10 : 4));
      var aT = play && this.cur && s.row === this.row && s.state === 'rest' && !s.visited ? 1 : 0;
      s.active += (aT - s.active) * Math.min(1, h * cfg.activeRate);
      this._stepThing(s, h);
      this._placeStone(s, h);
      if (!(isFinite(s.x) && isFinite(s.y))) { s.dip = s.dipV = s.tilt = s.tiltV = 0; s.x = s.hx; s.y = s.hy; }
    }
  };

  // ---------------------------------------------------------------- surprises
  /** The open-water point farthest from every stone (scored over a 20 px grid of the river), never under the bubble / HUD / Nim;
   *  'frog' prefers the downstream side. null when nothing is ≥ minD from all stones. */
  P._waterSpot = function (minD, kind) {
    var L = this.layout, R = L.river, r = this._crng, best = null, bs = -1e9, nb = this.nimHit(), pad = 40, S = L.S, self = this;
    var pts = this.stones.filter(function (s) { return s.state === 'rest' || s.state === 'rise' || s.state === 'hidden'; }).map(function (s) { return [s.hx, s.hy - 0.3 * L.itemH]; });
    for (var y = R.y + pad; y <= R.y + R.h - pad; y += 20) for (var x = R.x + pad; x <= R.x + R.w - pad; x += 20) {
      if (!this._onScreen(x, y, 50) || !this._clearOfKeep(x, y - 60) || inBox(nb, x, y, 30)) continue;
      var md = 1e9;
      for (var i = 0; i < pts.length; i++) md = Math.min(md, hyp(x - pts[i][0], y - pts[i][1]));
      if (md < minD) continue;
      var down = kind === 'frog' ? (L.portrait ? (x - R.x) / R.w : (y - R.y) / R.h) * 120 : 0;
      var sc = Math.min(md, 2 * minD) + down + r.float(0, 30);
      if (sc > bs) { bs = sc; best = { x: x, y: y, d: md }; }
    }
    void S; void self;
    return best;
  };
  /** A fish leap: from (x0, y) to (x1, y) across open water (between two rows), apex 120 px up. */
  P._fishSpot = function () {
    var L = this.layout, cfg = this.cfg, r = this._crng, half = cfg.fishSpan / 2;
    var sp = this._waterSpot(0.55 * L.S + 10, 'fish') || { x: L.river.x + L.river.w / 2, y: L.river.y + L.river.h / 2 };
    var dir = r.chance(0.5) ? 1 : -1, x0 = clamp(sp.x - dir * half, L.ins.left + 40, L.W - L.ins.right - 40), x1 = clamp(sp.x + dir * half, L.ins.left + 40, L.W - L.ins.right - 40);
    var y = Math.max(sp.y, L.play.y0 + cfg.fishApex + 40);
    return { x0: x0, x1: x1, y: y };
  };
  P._spawnSurprise = function () {
    var cfg = this.cfg, L = this.layout, r = this._crng, i;
    var type = this.surprise;
    if (type === 'frog' && !this.frog) {
      var spot = this._waterSpot(L.hitR + 30, 'frog');
      if (!spot) type = 'fish';   // no open water far enough from the stones: a fish instead
      else {
        this.frog = { x: spot.x, y: spot.y, _px: spot.x, _py: spot.y, padX: spot.x, padY: spot.y, padR: cfg.frogPadR, padRot: r.float(0, TAU), s: cfg.frogS,
          croak: 0, hopY: 0, hopDx: 0, side: 0, state: 'in', t: 0, a: 0, _hopT: -1 };
        this._ripple(spot.x, spot.y, 0.6, 0.7);
        this._emit({ type: 'frog', x: spot.x, y: spot.y });
      }
    }
    if (type === 'fish' && !this.fish) {
      var p = this._fishSpot();
      this.fish = { x: p.x0, y: p.y, _px: p.x0, _py: p.y, rot: 0, _prot: 0, flip: 0, face: p.x1 >= p.x0 ? 1 : -1, s: cfg.fishS, above: false, state: 'leap', t: 0, u: 0, n: 0, path: p, tapped: false };
      this._fishIn();
    } else if (type === 'snow' && !this.snowflakes.some(function (q) { return q.state === 'fall'; })) {
      var top = L.play.y0 + 10, x0 = L.portrait ? L.ins.left + 60 : L.river.x + 20, x1 = L.portrait ? L.W - L.ins.right - 60 : L.river.x + L.river.w - 20;
      var v = Math.max(cfg.snowV, (L.play.y1 - top) / cfg.snowFall);
      for (i = 0; i < cfg.snowN; i++) {
        var x = x0 + (i + 0.5) / cfg.snowN * (x1 - x0) + r.float(-0.25, 0.25) * (x1 - x0) / cfg.snowN;
        this.snowflakes.push({ x: x, y: top, _px: x, _py: top, x0: x, r: cfg.snowR * r.float(0.85, 1.1), rot: r.float(0, TAU), _prot: 0, a: 0, state: 'wait', t: -i * cfg.snowStagger, v: v * r.float(0.85, 1.15), ph: r.float(0, TAU), tw: 0 });
      }
      this._emit({ type: 'snow', n: cfg.snowN, x: (x0 + x1) / 2, y: top });
    }
  };
  P._fishIn = function () {
    var f = this.fish, p = f.path;
    f.state = 'leap'; f.t = 0; f.u = 0; f.n++; f.flip = 0; f.tapped = false; f.face = p.x1 >= p.x0 ? 1 : -1; f.x = p.x0; f.y = p.y;
    this._ripple(p.x0, p.y, 0.5, 0.8); this._fishDrops(p.x0, p.y);
    this._emit({ type: 'fish', n: f.n, x: p.x0, y: p.y });
    this._emit({ type: 'splash', fish: true, big: false, x: p.x0, y: p.y });
  };
  P._fishDrops = function (x, y) {
    var r = this._crng, cfg = this.cfg;
    for (var q = 0; q < 5; q++) {
      if (this.drops.length >= cfg.dropCap) this.drops.shift();
      this.drops.push({ x: x, y: y, _px: x, _py: y, y0: y, vx: r.float(-90, 90), vy: -r.float(120, 260), r: r.float(cfg.dropR[0], cfg.dropR[1]), a: 1, t: 0, life: cfg.dropLife });
    }
  };
  P._tapFish = function () { var f = this.fish; f.flip = 0.001; f.tapped = true; this._emit({ type: 'fishTap', x: f.x, y: f.y }); };
  P._tapFrog = function () {
    var f = this.frog;
    f.croak = 0.001; f._hopT = 0; f._hopFrom = f.hopDx; f.side = f.side > 0 ? -1 : 1; f.hopTo = f.side * this.cfg.frogHopDx;
    this._emit({ type: 'frogTap', x: f.x, y: f.y });
  };
  P._tapSnow = function (f) { f.state = 'twinkle'; f.t = 0; this._emit({ type: 'snowTap', x: f.x, y: f.y }); };
  P._stepSurprises = function (h) {
    var cfg = this.cfg, L = this.layout, i;
    if (this._surpriseAt >= 0 && this.time >= this._surpriseAt && this.state === 'round' && (this.phase === 'play' || this.phase === 'bank')) { this._surpriseAt = -1; this._spawnSurprise(); }
    var f = this.fish;
    if (f) {
      f.t += h;
      if (f.state === 'leap') {
        var p = f.path, u = clamp(f.t / cfg.fishLeap, 0, 1), dx = p.x1 - p.x0;
        f.u = u; f.x = p.x0 + dx * u; f.y = p.y - 4 * cfg.fishApex * u * (1 - u);
        var vx = dx / cfg.fishLeap, vy = -4 * cfg.fishApex * (1 - 2 * u) / cfg.fishLeap;
        f.rot = Math.atan2(vy, Math.abs(vx)) * 0.9; f.above = true;
        if (f.flip > 0) f.flip = Math.min(1, f.flip + h / cfg.fishFlip);
        if (u >= 1) {
          f.above = false; f.flip = 0;
          this._ripple(p.x1, p.y, 0.6, 0.9); this._fishDrops(p.x1, p.y);
          this._emit({ type: 'splash', fish: true, big: false, x: p.x1, y: p.y });
          if (f.n >= cfg.fishLeaps) this.fish = null;
          else { f.state = 'under'; f.t = 0; f.from = { x: p.x1, y: p.y }; f.path = this._fishSpot(); }
        }
      } else if (f.state === 'under') {   // a shadow gliding under the water to the next leap
        var uu = smooth(f.t / cfg.fishGap); f.above = false; f.rot = 0;
        f.x = lerp(f.from.x, f.path.x0, uu); f.y = lerp(f.from.y, f.path.y, uu);
        if (f.t >= cfg.fishGap) this._fishIn();
      }
    }
    var fr = this.frog;
    if (fr) {
      fr.t += h;
      if (fr.state === 'in') { fr.a = Math.min(1, fr.t / cfg.frogIn); if (fr.t >= cfg.frogIn) { fr.state = 'sit'; fr.t = 0; } }
      else if (fr.state === 'sit') {
        // the pad drifts slowly downstream while it stays far from every stone
        var fd = L.flowDir, nx = fr.padX + fd.x * cfg.frogDrift * h, ny = fr.padY + fd.y * cfg.frogDrift * h, ok = this._inRiver(nx, ny) && this._onScreen(nx, ny, 50);
        for (i = 0; i < this.stones.length && ok; i++) { var s = this.stones[i]; if ((s.state === 'rest' || s.state === 'rise') && hyp(nx - s.x, ny - (s.y - 0.3 * L.itemH)) < L.hitR + 30) ok = false; }
        if (ok) { fr.padX = nx; fr.padY = ny; }
        fr.padRot += 0.05 * h;
        if (fr.t >= cfg.frogStay) { fr.state = 'out'; fr.t = 0; }
      } else if (fr.state === 'out') {
        fr.a = Math.max(0, 1 - fr.t / cfg.frogOut);
        if (fr.t >= cfg.frogOut) this.frog = null;
      }
      if (this.frog) {
        if (fr.croak > 0) { fr.croak = Math.min(1, fr.croak + h / cfg.frogCroak); if (fr.croak >= 1) fr.croak = 0; }
        if (fr._hopT >= 0) {
          fr._hopT += h; var uh = clamp(fr._hopT / cfg.frogHop, 0, 1);
          fr.hopDx = lerp(fr._hopFrom, fr.hopTo, uh); fr.hopY = -22 * 4 * uh * (1 - uh);
          if (uh >= 1) { fr._hopT = -1; fr.hopY = 0; }
        }
        fr.x = fr.padX + fr.hopDx; fr.y = fr.padY + fr.hopY;
      }
    }
    for (i = this.snowflakes.length - 1; i >= 0; i--) {
      var q = this.snowflakes[i];
      q.t += h;
      if (q.state === 'wait') { if (q.t >= 0) { q.state = 'fall'; q.t = 0; } else continue; }
      if (q.state === 'fall') {
        q.y += q.v * h; q.x = q.x0 + 26 * Math.sin(0.9 * q.t + q.ph) + 0.6 * this.wind * Math.min(q.t, 3); q.rot += 0.6 * h;
        q.a = Math.min(1, q.t / 0.6) * clamp((L.play.y1 - 20 - q.y) / 60, 0, 1);
        if (q.y > L.play.y1 - 20) this.snowflakes.splice(i, 1);
      } else if (q.state === 'twinkle') {
        var tw = clamp(q.t / cfg.snowTwinkle, 0, 1);
        q.tw = tw; q.a = 1 - tw; q.rot += 3 * h;
        if (tw >= 1) this.snowflakes.splice(i, 1);
      }
    }
  };

  // ---------------------------------------------------------------- Nim
  P._stepNim = function (h) {
    var n = this.nim, cfg = this.cfg, L = this.layout;
    n.h = L.nimH; n.s = L.nimS;
    if (!this._hop) {
      if (this.state === 'round' || this.state === 'roundDone' || this.state === 'talk' || this.state === 'intro' || this.state === 'levelDone' || this.state === 'sessionDone') {
        if (n.state !== 'roll') { var sp = this._standPoint(); n.x = sp.x; n.y = sp.y; }
      }
      if (n.state === 'land') { n._landT -= h; if (n._landT <= 0) n.state = 'stand'; }
      if (n.state === 'walk' && !this._bank) n.state = 'stand';
      spring(n, 'sq', 'sqV', 0, cfg.sqOmega, cfg.sqZeta, h);
    }
    n.sq = clamp(n.sq, -0.35, 0.3);
    n.sy = 1 + n.sq; n.sx = 1 - cfg.sxK * n.sq;
    if (n._leanT > 0) n._leanT -= h; else n._leanTo = 0;
    spring(n, 'lean', 'leanV', n._leanTo, cfg.leanOmega, cfg.leanZeta, h);
    if (n.moodT > 0) { n.moodT -= h; if (n.moodT <= 0) { n.moodT = 0; n.mood = this.state === 'sessionDone' ? 'dance' : 'idle'; } }
    n.blinkT -= h;
    if (n.blink && n.blinkT <= 0) { n.blink = false; n.blinkT = this._crng.float(cfg.blink[0], cfg.blink[1]); }
    else if (!n.blink && n.blinkT <= 0) { n.blink = true; n.blinkT = cfg.blinkTime; }
    if (!(isFinite(n.x) && isFinite(n.y))) { n.x = L.nimHome.x; n.y = L.nimHome.y; this._hop = null; n.state = 'stand'; }
    this._poseNim();
  };
  /** Derived pose fields for render: frame, the rolling ball, fruit slots (world px). */
  P._poseNim = function () {
    var n = this.nim, B = nimPoints(), s = this.layout.nimS, i;
    n.frame = n.state === 'crouch' ? 'crouch' : (n.state === 'air' || n.state === 'walk') && this._hop && this._hop.phase === 'air' ? 'jump'
      : n.state === 'roll' ? (n.curl >= 0.4 ? 'roll' : 'crouch') : n.mood === 'idle' && n.blink ? 'blink' : n.mood;
    n.ballR = B.rollR * s;
    var lift = 0, f = this.fruit;
    if (f && n.state === 'roll' && f.state === 'wait') { var d = (n.x - f.x) / n.ballR; if (Math.abs(d) < 1) lift = this.cfg.rollLiftK * this.layout.fruitR * (1 - d * d); }
    n.ballX = n.x + (B.rollC[0] - B.feet[0]) * s; n.ballY = n.y + (B.rollC[1] - B.feet[1]) * s - lift;
    var ca = this.cfg.crouchArt || [1, 1], cr0 = n.frame === 'crouch';
    n.dsx = cr0 ? n.sx / ca[0] : n.sx; n.dsy = cr0 ? n.sy / ca[1] : n.sy;   // the scale render applies to the CURRENT frame's art
    var cl = Math.cos(n.lean), sl = Math.sin(n.lean), dy0 = (cr0 ? B.crouchDy : n.frame === 'jump' ? B.jumpDy : 0) * s;
    n.backSlots = [];
    for (i = 0; i < B.backSlots.length; i++) {
      var q = B.backSlots[i], dx = (q[0] - B.feet[0]) * s * n.dsx * n.face, dy = ((q[1] - B.feet[1]) * s + dy0) * n.dsy;
      n.backSlots.push({ x: n.x + dx * cl - dy * sl, y: n.y + dx * sl + dy * cl, rot: (q[2] || 0) + n.lean });
    }
    n.rollSlots = [];
    var cr = Math.cos(n.rollRot), sr = Math.sin(n.rollRot);
    for (i = 0; i < B.rollSlots.length; i++) {
      var p = B.rollSlots[i], ex = (p[0] - B.rollC[0]) * s, ey = (p[1] - B.rollC[1]) * s;
      n.rollSlots.push({ x: n.ballX + ex * cr - ey * sr, y: n.ballY + ex * sr + ey * cr, rot: n.rollRot });
    }
  };

  NH.World = World;
  NH.WindModel = WindModel;
})(window.NH = window.NH || {});
