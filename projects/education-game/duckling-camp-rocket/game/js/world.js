/* Mimi's Splash Rocket — DK.CONFIG + DK.World + DK.WindModel (headless, deterministic rocket-launch simulation; DESIGN §2, §5.2)
 *
 * ============================== CONVENTIONS ==============================
 *  Units: logical px (short side 720), seconds, radians, y DOWN, rot > 0 clockwise (0 = nose up). Screen space = world space.
 *  update(dt) runs fixed sub-steps of cfg.step (1/120 s). At the START of every sub-step each moving field is copied into its `_p`
 *  twin; render v = _v + (v − _v)·w.alpha.  Full API, CONFIG, events and render contract: docs/MECHANICS.md.
 *
 *  Round = k launches. Launch: mats unfold → play (tap the ONE right mat) → aim (0.45 s, Mimi hops onto the foot pump) → pump
 *  (any press = a stomp, ×3; auto after 3 s) → flight (boost → ballistic coast → parachute glide, damped pendulum) → landing
 *  exactly on the mat → collect (the thing flies to the flagpole and becomes a pennant; the rocket hops back to the pad) → next
 *  launch … → camp (pennants counted, Mimi dances, fountain) → roundDone → wipe.
 * ========================================================================
 */
(function (DK) {
  'use strict';

  var CONFIG = {
    // ---- timing / state machine (s) — as the base
    step: 1 / 120, maxFrame: 1.0,
    roundsPerLevel: 4, chapterTimeLimit: 75, chapterMinRounds: 3, chapterHardLimit: 72, chapterHardMin: 2, roundLongCut: 70, roundLongMin: 2,
    shortBudget: [1e9, 22, 40, 56],   // s into the chapter: a round starting later than this is short (2 launches × 2 mats)
    introTime: 2.5, levelDoneTime: 3.6,
    talkAfterAnswer: 1.6, talkAskTime: 12, talkGlowAfterAsks: 2, talkMaxAsks: 3, talkGiveUp: 2,

    // ---- layout (DESIGN §2; px)
    shortSide: 720, minLong: 960, maxLong: 1600, tallRatio: 1.6, phoneRatio: 1.9,
    bottomLand: 14, bottomPort: 26, bandGap: 10,
    bubbleX: 24, bubbleYLand: 18, bubbleMaxW: 700, bubbleRight: 200, bubbleHLand: 134, bubbleYPort: 110, bubbleHPort: 124,
    hudW: 160, hudH: 96, bubbleMinW: 220,
    campW: 272, campWMin: 230, campWStep: 14, campH: 280, campTallK: 1.15,
    poleXLand: 26, poleTopGap: 30, poleBaseUp: 40, poleXPort: 70, poleRise: 160,
    mimiXLand: 100, mimiUp: 70, pumpXLand: 178, pumpUp: 40, padXLand: 236, padUp: 60,
    mimiXPort: 120, pumpDxPort: -120,
    pennantTop: 24, pennantPitch: 46, pennantW: 56, pennantH: 44, slots: 4,
    horizonLandK: 0.30, horizonPort: 120,
    mimiHLand: 180, mimiHPort: 170, mimiHPhonePort: 200, rocketH: 120,
    sBase: { 3: 170, 4: 170, 5: 160, 6: 148, 7: 148 }, sMin: 130, sStep: 6, itemK: 0.62, dsMin: 0.82, matHK: 0.42,
    hitK: 0.6, hitInner: 0.8, hitPad: 14, hitPhone: 92, hitLift: 0.3, pumpHitR: 80,
    keepGap: 44, edgeGap: 44, poleGap: 40, padGap: 90, campGap: 40, matGap: 20, gridStep: 12, homeTries: 14, homeCapK: 1.0, homeJitK: 0.5,

    // ---- mats (DESIGN §5.2)
    unfoldLead: 0.35, unfoldEach: 0.16, unfoldTime: 0.4, unfoldBack: 1.2, askAfterUnfold: 0.3, nextLead: 0.1, nextAfterUnfold: 0.15,
    thingDropH: 46, thingDropAt: 0.55, thingG: 1800, thingBounce: 0.35,
    bobAmp: 2, bobHz: [0.42, 0.58],
    flapOmega: 12, flapZeta: 0.25, squishOmega: 14, squishZeta: 0.3, wigOmega: 16, wigZeta: 0.22,
    wrongFlap: 0.8, wrongWig: 0.3, rightSquish: 0.15, landSquish: 0.55, landFlap: 0.45, earlySquish: 0.12,
    goldTime: 0.4, glideTime: 0.3, activeRate: 6,
    foldTime: 0.5, foldRise: 160, foldSpin: 0.9,

    // ---- aim / pump
    aimTime: 0.45, aimMax: 0.6, aimOmega: 14, aimZeta: 0.6, arcN: 14, arcFade: 0.3,
    mimiHopTime: 0.3, mimiHopApex: 26, mimiLandSq: -0.14,
    pumpCount: 3, pumpMerge: 0.22, pumpAuto: 3.0, pumpAutoEvery: 0.5, launchDelay: 0.25, pumpSq: -0.12,
    pressOmega: 30, pressZeta: 0.7, pressHold: 0.09, pressDepth: 14, pumpFrame: 0.2,

    // ---- flight (physics; px, s)
    g: 900, coastMax: 1.05, boostTime: 0.25, apexMin: 220, apexK: 0.5, apexTop: 40, apexMinRise: 60,
    glideOmega: 3.0,             // horizontal glide under the chute: a critically damped approach (= linear air drag) onto the mat
    rotOmega: 10, rotZeta: 0.8, sprayN: 36, sprayV: [260, 520], spraySpread: 0.35, sprayLife: 0.6,
    chuteOmega: 12, chuteZeta: 0.4, chuteOpen: 0.3, chuteV: 220,
    swingOmega: 4.5, swingZeta: 0.15, swingZetaOpen: 0.3, swingMax: 0.45, swingDrive: 0.6, swingGround: 2.5,
    windK: 0.6, windSwing: 0.6, fadeH: 50, flightMax: 9,
    landBounce: 12, bounceG: 1600, tipOmega: 12, tipZeta: 0.5, drapeTo: 0.3, drapeRot: 1.1, drapeOmega: 8, drapeZeta: 0.7, landSqR: -0.18,
    chuteRotK: 0.4,

    // ---- collect / return
    landHold: 0.2, thingHopH: 20, thingHopTime: 0.22, flyTime: 0.55, flyApex: 70, flyScale: 0.42, flyNext: 0.1,
    countDelay: 0.45, countStep: 0.4, countTail: 0.3, badgeHold: 1.0, badgeRate: 6, badgeK: 0.42,
    returnDelay: 0.4, returnHopT: [0.3, 0.55], returnHopRef: 200, returnApexMin: 36, returnApexK: 0.22, returnPause: 0.06, returnSq: -0.16,
    refillTime: 0.6,

    // ---- camp + wipe
    campCountLead: 0.3, campCountStep: 0.35, fountainGap: 0.15, fountainN: 40, fountainSpawn: 0.6, fountainH: 260, fountainHold: 0.8,
    campTime: 1.9, cheerHold: 0.4, wipeTime: 1.3, wipeSwap: 0.5, wipeUnfold: 0.75,

    // ---- help (as the base, incl. its fix-round values)
    hintAfterMisses: 2, hintAfterSoft: 3, assistAfter: 5, hintTime: 5, hintCooldown: 6, hintCycle: 1.6,
    idleTime: 12, idleBackoff: 1.5, idleMax: 30, idleHintFrom: 2, tapMovePx: 24, sameWrongWindow: 1.0, repeatNoProgress: 0.9,
    pokeHopTime: 0.3, pokeApex: 22,
    leanOmega: 10, leanZeta: 0.45, leanWrong: 0.14, leanHold: 0.6, sqOmega: 16, sqZeta: 0.35, sxK: 0.6,

    // ---- water bits
    dropCap: 90, ringCap: 30, dropG: 900, splashN: 8, splashV: [150, 300], splashOut: [40, 140], dropR: [3, 6], dropLife: 0.5,
    ringLife: 0.8, ringR: [0.3, 0.9], ringFlat: 0.42, dropRingP: 0.3,

    // ---- surprises: one round per chapter (round 1 or 2, never the warm-up); chapters 0–2 rotate marmot / goat, rainbow = bird
    surpriseRounds: [1, 2], surpriseTypes: ['marmot', 'goat'], rainbowSurprise: 'bird', rainbowLevel: 3, surpriseAt: [2, 5],
    marmotUp: 0.4, marmotStay: 10, marmotDown: 0.4, marmotR: 54, marmotH: 84, marmotJump: 0.45, marmotJumpH: 26, burrowR: 34, marmotGap: 40,
    goatHop: 0.36, goatHops: 3, goatHopH: 26, goatHopDx: 44, goatStay: 10, goatR: 56, goatH: 96, goatW: 96, goatRockW: 120, goatGap: 60, goatTapHop: 0.4,
    birdIn: 1.2, birdStay: 10, birdOut: 1.0, birdR: 44, birdSing: 0.8, birdH: 50,

    // ---- wind (DK.WindModel): px/s² horizontal force; gusts in the breezy chapter
    breeze: [6, 14, 6, 5], gustMood: 1, gustEvery: [6, 10], gustFirst: [3, 6], gustAmp: [40, 60], gustTime: 1.5,

    // ---- Mimi
    moodTime: { happy: 0.9, cheer: 1.6, oops: 0.8, think: 1.4, talk: 1.0, wave: 1.4, giggle: 1.0, dance: 2.0, look: 1.0 },
    blink: [2.2, 5], blinkTime: 0.13
  };
  DK.CONFIG = CONFIG;

  var TAU = Math.PI * 2;
  var MIMI_DEFAULT = { feet: [150, 290], box: [44, 40, 262, 294], bill: [214, 150], pumpDy: 10, wingTip: [236, 176], hatTop: [150, 30] };
  var ROCKET_DEFAULT = { nozzle: [60, 236], nose: [60, 12], com: [60, 150], waterTop: 170, w: 64 };
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hyp(x, y) { return Math.sqrt(x * x + y * y); }
  function lerp(a, b, u) { return a + (b - a) * u; }
  function smooth(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  function easeOut(u) { u = clamp(u, 0, 1); return 1 - (1 - u) * (1 - u); }
  function backOut(u, c1) { u = clamp(u, 0, 1); var c3 = c1 + 1, v = u - 1; return 1 + c3 * v * v * v + c1 * v * v; }
  function wrap(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }
  function sgn(v) { return v < 0 ? -1 : 1; }
  function merge(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; if (b) for (k in b) o[k] = b[k]; return o; }
  function insOf(ins) { return { top: +(ins && ins.top) || 0, right: +(ins && ins.right) || 0, bottom: +(ins && ins.bottom) || 0, left: +(ins && ins.left) || 0 }; }
  function keepBoxes(hk) {
    var a = Array.isArray(hk) ? hk : hk ? [hk] : [], out = [];
    for (var i = 0; i < a.length; i++) { var b = a[i]; if (b && b.w > 0 && b.h > 0) out.push({ x: +b.x, y: +b.y, w: +b.w, h: +b.h }); }
    return out;
  }
  function inBox(b, x, y, pad) { pad = pad || 0; return !!b && x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad; }
  /** Gap between two boxes (> 0 apart, < 0 = overlap depth). */
  function boxGap(a, b) { var dx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), 0), dy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h), 0); return Math.max(dx, dy) > 0 ? hyp(dx, dy) : -Math.min(a.x + a.w - b.x, b.x + b.w - a.x, a.y + a.h - b.y, b.y + b.h - a.y); }
  /** Initial velocity that gives a damped spring (ω, ζ) released from 0 a first peak of `peak`. */
  function kickFor(peak, w, z) { var s = Math.sqrt(1 - z * z); return peak * w * Math.exp(z / s * Math.atan2(s, z)); }
  function spring(o, k, kv, target, w, z, h) { o[kv] += (w * w * (target - o[k]) - 2 * z * w * o[kv]) * h; o[k] += o[kv] * h; }
  function pts(p, d, keys) {
    var o = {}, k;
    for (k in d) o[k] = d[k];
    if (p) keys.forEach(function (key) {
      var v = p[key], dv = d[key];
      if (Array.isArray(dv)) { if (Array.isArray(v) && v.length >= dv.length && v.every(isFinite)) o[key] = v.slice(); }
      else if (isFinite(v)) o[key] = +v;
    });
    return o;
  }
  function mimiPoints() { return pts(DK.MIMI_POINTS, MIMI_DEFAULT, ['feet', 'box', 'bill', 'pumpDy', 'wingTip', 'hatTop']); }
  function rocketPoints() { return pts(DK.ROCKET_POINTS, ROCKET_DEFAULT, ['nozzle', 'nose', 'com', 'waterTop', 'w']); }

  /** DESIGN §2 short-side rule: CSS viewport → logical W×H. */
  function logicalSize(cssW, cssH, cfg) {
    cfg = cfg || CONFIG;
    var S = cfg.shortSide, aspect = cssW / Math.max(1, cssH);
    if (cssW >= cssH) return { W: clamp(Math.round(S * aspect), cfg.minLong, cfg.maxLong), H: S };
    return { W: S, H: clamp(Math.round(S / aspect), cfg.minLong, cfg.maxLong) };
  }
  function ageKey(age) { return clamp(Math.round(+age || 4), 3, 7); }

  /* ---------------------------------------------------------------- small ballistic hops (Mimi, the rocket's hops back)
   * plan(x0, y0, x1, y1, T, A): x at constant speed, y a true parabola through (T, y1) whose apex is A px above the higher end. */
  function plan(x0, y0, x1, y1, T, A) {
    T = Math.max(0.05, T); A = Math.max(1, A);
    var d = y1 - y0, H0 = A + Math.max(0, -d), s = (Math.sqrt(2 * H0) + Math.sqrt(2 * Math.max(0, H0 + d))) / T, g = s * s;
    return { x0: x0, y0: y0, x1: x1, y1: y1, T: T, g: g, vy0: -Math.sqrt(2 * g * H0), A: A };
  }
  function planAt(p, t) { return { x: p.x0 + (p.x1 - p.x0) * clamp(t / p.T, 0, 1), y: p.y0 + p.vy0 * t + 0.5 * p.g * t * t, vy: p.vy0 + p.g * t }; }

  /* ---------------------------------------------------------------- the flight plan (DESIGN §5.2 flight)
   * The rocket's centre of mass starts at (cx, cy). Boost: Tb s of a constant net acceleration (ax, −s) = thrust + gravity; then a
   * ballistic coast (gravity g) to the apex (vy = 0). Unknowns ax, s:
   *   apex height  Hh = cy − apexY = ½·s·Tb² + (s·Tb)²/(2g)           →  s = (−g + √(g² + 8·g·Hh/Tb²)) / 2
   *   apex x       x_A = cx + ax·Q,  Q = Tb²·(½ + s/g)
   * Under the chute the canopy point (the nose, ≈ (L − Lc) ahead of the COM at the apex) glides with the critically damped
   * response of linear air drag: off(t) = off₀·e^(−ω t) when off₀ = −vx/ω, so the glide ends exactly over the mat when
   *   x_A + dir·(L − Lc) + ax·Tb/ω = tx   →   ax = (tx − cx − dir·(L − Lc)) / (Q + Tb/ω).
   * Apex height: ≥ max(apexMin, apexK·distance) above the higher of pad / mat, clamped to y ≥ play.y0 + apexTop (the bubble band),
   * and always ≥ apexMinRise above both ends. Thrust angle θ = atan2(ax, g + s) (the launcher tube shows it clamped to ±aimMax).
   * Gravity is 900 px/s² unless the climb is so high (tall portraits) that the coast would last > coastMax: then this flight's g is
   * raised to 2·Hh / coastMax² (one constant g for the whole flight, so it stays a true parabola). */
  function planFlight(cx, cy, tx, ty, L, cfg) {
    var Tb = cfg.boostTime, pad = L.pad, dist = hyp(tx - pad.x, ty - pad.y), hi = Math.min(pad.y, ty);
    var apexY = hi - Math.max(cfg.apexMin, cfg.apexK * dist);
    apexY = Math.max(apexY, L.play.y0 + cfg.apexTop);
    apexY = Math.min(apexY, hi - cfg.apexMinRise);
    var Hh = Math.max(20, cy - apexY), g = Math.max(cfg.g, 2 * Hh / (cfg.coastMax * cfg.coastMax)), s = (-g + Math.sqrt(g * g + 8 * g * Hh / (Tb * Tb))) / 2;
    var Q = Tb * Tb * (0.5 + s / g), lead = L.rocketL - L.rocketLc, dir = tx >= cx ? 1 : -1, D = tx - cx - dir * lead;
    var ax = D / (Q + Tb / cfg.glideOmega);
    return { g: g, Tb: Tb, ax: ax, s: s, A: hyp(ax, g + s), theta: Math.atan2(ax, g + s), apexX: cx + ax * Q, apexY: cy - Hh, tc: s * Tb / g,
      vxA: ax * Tb, Hh: Hh, dir: dir, tx: tx, ty: ty, cx: cx, cy: cy };
  }
  /** The COM at time t of a plan's ascent (boost + coast up to the apex). */
  function planPos(F, t, g) {
    var Tb = F.Tb;
    if (t <= Tb) return { x: F.cx + 0.5 * F.ax * t * t, y: F.cy - 0.5 * F.s * t * t };
    var bx = F.cx + 0.5 * F.ax * Tb * Tb, by = F.cy - 0.5 * F.s * Tb * Tb, u = t - Tb;
    return { x: bx + F.ax * Tb * u, y: by - F.s * Tb * u + 0.5 * g * u * u };
  }

  /* ---------------------------------------------------------------- wind (DESIGN §5.3) */
  function WindModel(seed, cfg) {
    this.cfg = cfg || CONFIG; this.rng = new DK.RNG(seed === undefined ? 5 : seed);
    this.t = 0; this.wind = 0; this.gust = 0; this.gustDir = 0; this.mood = -1;
    this._next = 1e9; this._gT = -1; this._gA = 0; this.ph = this.rng.float(0, TAU); this.events = [];
  }
  WindModel.prototype.step = function (h, mood) {
    var c = this.cfg, s = ((mood | 0) % 4 + 4) % 4;
    if (s !== this.mood) { this.mood = s; this._gT = -1; this.gust = 0; this._next = s === c.gustMood ? this.rng.float(c.gustFirst[0], c.gustFirst[1]) : 1e9; }
    this.t += h;
    var amp = c.breeze[s], t = this.t;
    var base = amp * Math.sin(TAU * t / 11 + this.ph) * (0.65 + 0.35 * Math.sin(TAU * t / 4.3 + 2 * this.ph));
    if (s === c.gustMood) {
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

  /* ---------------------------------------------------------------- layout (DESIGN §2) */
  function hudBox(hk, W, H) { var best = null; for (var i = 0; i < hk.length; i++) { var b = hk[i]; if (b.x + b.w / 2 > W / 2 && b.y < H / 2 && (!best || b.y + b.h > best.y + best.h)) best = b; } return best; }
  function baseLayout(W, H, ins, cfg, hudKeep) {
    ins = insOf(ins);
    var portrait = H > W, tall = H / W > cfg.tallRatio, phone = (portrait ? H / W : W / H) > cfg.phoneRatio;
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
    var hud = { x: W - ins.right - cfg.hudW, y: 0, w: cfg.hudW + ins.right, h: ins.top + cfg.hudH };
    var band = bubble.y + bubble.h;
    if (portrait) band = Math.max(band, hud.y + hud.h);
    var play = { x0: ins.left, y0: band + cfg.bandGap, x1: W - ins.right, y1: H - ins.bottom - (portrait ? cfg.bottomPort : cfg.bottomLand) };
    var L = { W: W, H: H, ins: ins, portrait: portrait, tall: tall, phone: phone, bubble: bubble, hud: hud, play: play,
      safe: { x: ins.left, y: ins.top, w: W - ins.left - ins.right, h: H - ins.bottom - ins.top } };
    L.keep = [{ x: bubble.x, y: bubble.y, w: bubble.w, h: bubble.h, kind: 'bubble' }, { x: hud.x, y: hud.y, w: hud.w, h: hud.h, kind: 'hud' }];
    hk.forEach(function (b) { b.kind = 'hudKeep'; L.keep.push(b); });
    return L;
  }
  /** Camp corner, meadow, horizon, Mimi / pad / pump / pole for a camp width (landscape) and mat width S. Mutates L. */
  function campGeometry(L, cfg, S, campW) {
    var W = L.W, H = L.H, ins = L.ins, P = L.play, yb = H - ins.bottom;
    L.S = S; L.itemH = cfg.itemK * S;
    L.mimiH = L.portrait ? (L.phone ? cfg.mimiHPhonePort : cfg.mimiHPort) : cfg.mimiHLand; L.mimiS = L.mimiH / 300;
    L.rocketH = cfg.rocketH;
    if (!L.portrait) {
      var k = campW / cfg.campW;
      L.campW = campW;
      L.camp = { x0: 0, x1: ins.left + campW, y0: P.y0, y1: H };
      L.meadow = { x0: L.camp.x1, x1: W - ins.right, y0: P.y0, y1: P.y1 };
      L.horizon = P.y0 + cfg.horizonLandK * (H - P.y0);
      L.pole = { x: ins.left + cfg.poleXLand * k, y0: yb - cfg.poleBaseUp, y1: P.y0 + cfg.poleTopGap };
      L.mimiHome = { x: ins.left + cfg.mimiXLand * k, y: yb - cfg.mimiUp };
      L.pump = { x: ins.left + cfg.pumpXLand * k, y: yb - cfg.pumpUp };
      L.pad = { x: ins.left + cfg.padXLand * k, y: yb - cfg.padUp };
    } else {
      var ch = Math.round(cfg.campH * (L.tall ? cfg.campTallK : 1));
      L.campH = ch;
      L.camp = { x0: 0, x1: W, y0: yb - ch, y1: H };
      L.meadow = { x0: ins.left, x1: W - ins.right, y0: P.y0, y1: L.camp.y0 };
      L.horizon = P.y0 + cfg.horizonPort;
      L.pole = { x: W - ins.right - cfg.poleXPort, y0: yb - cfg.poleBaseUp, y1: Math.max(P.y0 + cfg.poleTopGap, L.camp.y0 - cfg.poleRise) };
      L.mimiHome = { x: ins.left + cfg.mimiXPort, y: yb - cfg.mimiUp };
      L.pad = { x: W / 2, y: yb - cfg.padUp };
      L.pump = { x: W / 2 + cfg.pumpDxPort, y: yb - cfg.pumpUp };
    }
    L.pump.r = cfg.pumpHitR;
    L.pennantW = cfg.pennantW; L.pennantH = cfg.pennantH; L.pennantPitch = cfg.pennantPitch;
    L.slots = [];
    for (var j = 0; j < cfg.slots; j++) L.slots.push({ x: L.pole.x, y: L.pole.y1 + cfg.pennantTop + j * cfg.pennantPitch });
    var pb = Math.min(L.pole.y0, L.pole.y1 + cfg.pennantTop + cfg.slots * cfg.pennantPitch + cfg.pennantH);
    L.poleBox = { x: L.pole.x - 10, y: L.pole.y1 - 20, w: cfg.pennantW + 20, h: Math.max(L.pole.y0, pb) - L.pole.y1 + 20 };
    var R = rocketPoints(), rs = cfg.rocketH / Math.max(1, R.nozzle[1] - R.nose[1]);
    L.rocketS = rs; L.rocketL = cfg.rocketH; L.rocketLc = (R.nozzle[1] - R.com[1]) * rs; L.rocketW = R.w * rs;
    L.dsMin = cfg.dsMin; L.hitK = cfg.hitK; L.hitInner = cfg.hitInner; L.hitPad = cfg.hitPad; L.hitPhone = cfg.hitPhone; L.hitLift = cfg.hitLift; L.matHK = cfg.matHK;
    L.hitR = hitRAt(L, 1);
    L.badgeR = cfg.badgeK * L.itemH;
    return L;
  }
  /** Depth scale of a mat whose centre is at y (DESIGN §2): 0.82 at the horizon … 1 at the meadow bottom. */
  function depthAt(L, y) { var u = clamp((y - L.horizon) / Math.max(1, L.meadow.y1 - L.horizon), 0, 1); return L.dsMin + (1 - L.dsMin) * u; }
  function hitRAt(L, ds) { var r = L.hitK * (L.S * ds * L.hitInner) + L.hitPad; return L.phone ? Math.max(r, L.hitPhone) : r; }
  /** A mat's footprint box (mat ellipse + the thing standing on its centre + 6 px shadow). */
  function matFoot(L, x, y, ds) {
    ds = ds || depthAt(L, y);
    var hw = 0.5 * L.S * ds, mh = 0.5 * L.matHK * L.S * ds, ih = L.itemH * ds;
    return { x: x - hw, y: y - ih, w: 2 * hw, h: ih + mh + 6 };
  }
  function matHitPt(L, x, y, ds) { return { x: x, y: y - L.hitLift * L.itemH * ds }; }
  /** Every grid point a mat centre may use (DESIGN §2 rules) → [{x, y, ds, r, hx, hy}]. */
  function matCandidates(L, cfg) {
    var out = [], M = L.meadow, st = cfg.gridStep, ins = L.ins;
    var y0 = L.horizon, y1 = M.y1, x0 = M.x0, x1 = M.x1;
    for (var y = y0 + 4; y <= y1; y += st) {
      var ds = depthAt(L, y), mh = 0.5 * L.matHK * L.S * ds;
      if (y < L.horizon + mh + 4) continue;
      for (var x = x0; x <= x1; x += st) {
        var b = matFoot(L, x, y, ds);
        if (b.x < ins.left + cfg.edgeGap || b.x + b.w > L.W - ins.right - cfg.edgeGap) continue;
        if (L.portrait) { if (b.y + b.h > L.camp.y0 - 10) continue; }
        else { if (b.y + b.h > L.H - ins.bottom - cfg.edgeGap) continue; if (b.x < L.camp.x1 + cfg.campGap) continue; }
        if (b.y < ins.top + cfg.edgeGap) continue;
        var ok = true;
        for (var k = 0; k < L.keep.length && ok; k++) if (boxGap(b, L.keep[k]) < cfg.keepGap) ok = false;
        if (!ok || boxGap(b, L.poleBox) < cfg.poleGap) continue;
        if (hyp(x - L.pad.x, y - L.pad.y) < cfg.padGap + 0.5 * L.S * ds) continue;
        var hp = matHitPt(L, x, y, ds);
        out.push({ x: x, y: y, ds: ds, r: hitRAt(L, ds), hx: hp.x, hy: hp.y, b: b });
      }
    }
    return out;
  }
  /** Clearance between two mat candidates: hit circles apart (DESIGN: ≥ matGap), and their footprints (mat + thing) never overlap. */
  function sep(a, b) { var d = hyp(a.hx - b.hx, a.hy - b.hy) - a.r - b.r; return boxGap(a.b, b.b) < 4 ? Math.min(d, -1) : d; }
  /** Seeded homes for m mats: farthest-point sampling with jitter over the candidates; every pair's hit circles ≥ matGap apart.
   *  → [{x, y, ds}] (+ .ok false when even the best set is closer than matGap — squeezed viewports only). */
  function matHomes(L, m, seed, cfg, cand) {
    cand = cand || matCandidates(L, cfg);
    var rng = new DK.RNG((seed >>> 0) || 1), best = null, bestMin = -1e9, i, j, c;
    if (!cand.length) { var out0 = []; for (i = 0; i < m; i++) out0.push({ x: (L.meadow.x0 + L.meadow.x1) / 2 + (i - (m - 1) / 2) * L.S, y: (L.horizon + L.meadow.y1) / 2, ds: 1 }); out0.ok = false; return out0; }
    var cap = cfg.homeCapK * L.hitR, jit = cfg.homeJitK * L.hitR;
    for (var t = 0; t < cfg.homeTries; t++) {
      var chosen = [rng.pick(cand)], pure = t >= cfg.homeTries - 3;
      while (chosen.length < m) {
        var bc = null, bs = -1e9;
        for (i = 0; i < cand.length; i++) {
          c = cand[i];
          var md = 1e9;
          for (j = 0; j < chosen.length; j++) md = Math.min(md, sep(c, chosen[j]));
          if (!pure && md < cfg.matGap) continue;
          var sc = pure ? md : Math.min(md, cap) + rng.next() * jit;
          if (sc > bs) { bs = sc; bc = c; }
        }
        if (!bc) break;
        chosen.push(bc);
      }
      if (chosen.length < m) continue;
      var mn = 1e9;
      for (i = 0; i < m; i++) for (j = i + 1; j < m; j++) mn = Math.min(mn, sep(chosen[i], chosen[j]));
      if (mn > bestMin) { bestMin = mn; best = chosen; }
      if (mn >= cfg.matGap - 1e-9) break;
    }
    var out = best.map(function (q) { return { x: q.x, y: q.y, ds: q.ds }; });
    out.ok = bestMin >= cfg.matGap - 1e-9;
    return out;
  }
  var _cache = {}, _cacheN = 0, _cfgId = 0;
  function cfgKey(cfg) { if (!cfg.__id) Object.defineProperty(cfg, '__id', { value: ++_cfgId, enumerable: false }); return cfg.__id; }
  /** computeLayout(W, H, ins, cfg, age, hudKeep) — S is the age base, −6 px steps down to sMin (130), then (landscape) the camp
   *  column narrows (272 → 230), until 3 mats fit apart for 3 test seeds; else `fits = false` with the smallest values. */
  function computeLayout(W, H, ins, cfg, age, hudKeep) {
    var a = ageKey(age);
    var key = cfgKey(cfg) + '|' + W + 'x' + H + '|' + JSON.stringify(insOf(ins)) + '|' + a + '|' + JSON.stringify(keepBoxes(hudKeep));
    if (_cache[key]) return JSON.parse(_cache[key]);
    var base = cfg.sBase[a], L = null, fits = false, cw, S;
    var cws = [];
    for (cw = cfg.campW; cw >= cfg.campWMin - 1e-9; cw -= cfg.campWStep) cws.push(cw);
    if (cws[cws.length - 1] > cfg.campWMin) cws.push(cfg.campWMin);
    outer:
    for (var ci = 0; ci < cws.length; ci++) {
      for (S = base; S >= cfg.sMin - 1e-9; S -= cfg.sStep) {
        L = campGeometry(baseLayout(W, H, ins, cfg, hudKeep), cfg, S, cws[ci]);
        var cand = matCandidates(L, cfg), ok = cand.length > 0;
        for (var sd = 1; sd <= 3 && ok; sd++) ok = matHomes(L, 3, sd * 7919, cfg, cand).ok;
        if (ok) { fits = true; break outer; }
      }
      if (!L.portrait) continue;
      break;
    }
    if (!fits) L = campGeometry(baseLayout(W, H, ins, cfg, hudKeep), cfg, cfg.sMin, L.portrait ? 0 : cfg.campWMin);
    L.fits = fits; L.age = a;
    if (++_cacheN > 300) { _cache = {}; _cacheN = 0; }
    _cache[key] = JSON.stringify(L);
    return L;
  }

  // ------------------------------------------------------------------ World
  function World(opts) {
    opts = opts || {};
    this.cfg = merge(CONFIG, opts.config);
    this.seed = opts.seed !== undefined ? opts.seed : 1;
    this.rng = new DK.RNG(this.seed);
    this._crng = new DK.RNG((DK.RNG.hash(this.seed) ^ 0x51ed27) >>> 0);   // cosmetic randomness (phases, droplets, blinks, surprise spots)
    this.windModel = new WindModel((DK.RNG.hash(this.seed) ^ 0x2a7e11) >>> 0, this.cfg);
    this.age = DK.Content.ageOf(opts.age !== undefined ? opts.age : 4);
    this.lang = opts.lang === 'vi' ? 'vi' : 'en';
    this._pendingAge = this.age; this._pendingLang = this.lang;
    this.state = 'menu'; this.phase = null;
    this.level = 0; this.levels = []; this.topic = null; this.weather = 0;
    this.round = 0; this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.stars = 0; this.levelStars = 0; this.roundStars = 0; this.misses = 0; this.streak = 0;
    this.time = 0; this.stateTime = 0; this.phaseTime = 0; this.alpha = 0; this._acc = 0;
    this.cur = null; this.talk = null; this.talkAnswered = null;
    this.mats = []; this.launch = 0; this.drops = []; this.rings = []; this.pennants = []; this.flyer = null; this.fountain = null;
    this.arc = null; this.arcAlpha = 0; this.marmot = null; this.goat = null; this.bird = null;
    this.hintHand = null; this.assistId = null; this.wipe = null; this.chosen = null;
    this.mimi = { x: 0, y: 0, _px: 0, _py: 0, state: 'stand', frame: 'idle', mood: 'idle', moodT: 0, blink: false, blinkT: 3, sx: 1, sy: 1, _psx: 1, _psy: 1,
      sq: 0, sqV: 0, face: 1, lean: 0, leanV: 0, _plean: 0, _leanT: 0, _leanTo: 0, onPump: false, h: 180, s: 0.6 };
    this.rocket = { x: 0, y: 0, _px: 0, _py: 0, rot: 0, _prot: 0, rotV: 0, aim: 0, _paim: 0, aimV: 0, state: 'pad', water: 1, fizz: 0,
      chute: 0, _pchute: 0, chuteV: 0, chuteFold: 1, chuteRot: 0, _pchuteRot: 0, chuteRotV: 0, swing: 0, _pswing: 0, swingV: 0, vx: 0, vy: 0, t: 0,
      sq: 0, sqV: 0, sx: 1, sy: 1, _psx: 1, _psy: 1, noseX: 0, noseY: 0, _pnoseX: 0, _pnoseY: 0, top: 0, s: 0.5, h: 120, l: 120 };
    this.pump = { x: 0, y: 0, r: 80, press: 0, _ppress: 0, pressV: 0, gauge: 0, gaugeV: 0, count: 0, glow: 0, _holdT: 0 };
    this.finger = { x: 0, y: 0, down: false };
    this.wind = 0; this.gust = 0; this._breezeExt = 0;
    this.hudKeep = opts.hudKeep || null; this.lastTopics = null; this.surprise = null; this._surpriseOff = 0; this._surpriseRound = 1;
    this.events = []; this.sessions = 0;
    this._idleN = 0; this._idleT = 0; this._idleGap = this.cfg.idleTime; this._lastHintT = -1e9; this.levelStartTime = 0;
    this._talkAskT = 0; this._talkAsks = 0; this._g = null; this._noProg = 0;
    this._usedKeys = []; this._prevRule = null; this._view = null; this._vp = null; this._homes = [];
    this._surpriseAt = -1; this._roundAssisted = false; this._unfoldDone = -1; this._modesSeen = {};
    this._fl = null; this._pumpS = null; this._col = null; this._camp = null; this._mhop = null; this._rhop = null;
    this.setViewport(opts.width || 1280, opts.height || 720, opts.ins || null);
  }
  World.logicalSize = logicalSize;
  World.computeLayout = function (W, H, ins, cfg, age, hudKeep) { return computeLayout(W, H, ins, merge(CONFIG, cfg), age === undefined ? 4 : age, hudKeep); };
  World.matHomes = function (L, m, seed, cfg) { var c = merge(CONFIG, cfg); return matHomes(L, m, seed, c); };
  World.matCandidates = function (L, cfg) { return matCandidates(L, merge(CONFIG, cfg)); };
  World.matFoot = matFoot;
  World.depthAt = depthAt;
  World.hitRAt = hitRAt;
  World.planFlight = function (cx, cy, tx, ty, L, cfg) { return planFlight(cx, cy, tx, ty, L, merge(CONFIG, cfg)); };
  World.kickFor = kickFor;
  World.plan = plan;
  World.planAt = planAt;
  World.boxGap = boxGap;
  World.mimiPoints = mimiPoints;
  World.rocketPoints = rocketPoints;

  var P = World.prototype;
  Object.defineProperty(P, 'interactive', { get: function () {
    return this.state === 'round' && !!this.cur && this.launch < this.cur.k && (this.phase === 'play' || (this.phase === 'pump' && !!this._pumpS && this._pumpS.n < this.cfg.pumpCount));
  } });
  Object.defineProperty(P, 'pumpGlow', { get: function () { return this.pump.glow; } });
  P._emit = function (e) {
    var L = this.layout;
    if (e.x !== undefined) { e.x = clamp(+e.x || 0, 0, L.W); e.y = clamp(+e.y || 0, 0, L.H); }
    this.events.push(e);
  };
  P.drainEvents = function () { var e = this.events; this.events = []; return e; };
  P.setAge = function (a) { this._pendingAge = DK.Content.ageOf(a); };
  P.setLang = function (l) { this._pendingLang = l === 'vi' ? 'vi' : 'en'; };
  /** An extra constant horizontal wind (px/s²) added to the world's own breeze (tests / main.js experiments); null / 0 = none. */
  P.setBreeze = function (w) { this._breezeExt = isFinite(+w) ? +w : 0; };
  P._setState = function (s) { this.state = s; this.stateTime = 0; };
  P._setPhase = function (p) { this.phase = p; this.phaseTime = 0; };
  P._mood = function (m, t) { this.mimi.mood = m; this.mimi.moodT = t || this.cfg.moodTime[m] || 1; };
  P.skipTalk = function () { if (this.state === 'talk') this._levelDone(); };
  P.matById = function (id) { for (var i = 0; i < this.mats.length; i++) if (this.mats[i].id === id) return this.mats[i]; return null; };
  P._meadowCentre = function () { var M = this.layout.meadow; return { x: (M.x0 + M.x1) / 2, y: (this.layout.horizon + M.y1) / 2 }; };
  P._target = function () {
    if (!this.cur || this.launch >= this.cur.k) return null;
    for (var i = 0; i < this.mats.length; i++) { var m = this.mats[i]; if (m.launch === this.launch && m.target && !m.visited) return m; }
    return null;
  };
  P._head = function () { var n = this.mimi, B = mimiPoints(), s = this.layout.mimiS; return { x: n.x + (B.bill[0] - B.feet[0]) * s, y: n.y + (B.bill[1] - B.feet[1]) * s }; };

  /** The current question while it can be answered (phase play), else null. */
  P.prompt = function () {
    if (!this.interactive || this.phase !== 'play') return null;
    var c = this.cur, o = { promptKey: c.promptKey, params: c.params, rule: c.rule, nameKind: c.rule.nameKind, nameValue: c.rule.value, k: c.k, left: c.k - this.launch, mode: c.mode, launch: this.launch, row: this.launch };
    if (c.mode === 'countSeq') o.count = this.launch + 1;
    return o;
  };

  // ---------------------------------------------------------------- geometry + test hooks (logical px)
  P._hitPt = function (m) { return matHitPt(this.layout, m.x, m.y, m.ds); };
  P._tappable = function (m) { return m.state === 'rest' || (m.state === 'unfold' && m.unfold > 0.5); };
  /** The mat's hit circle {x, y, r, own (its body radius 0.5·S·ds)} where it is now; null when it is not tappable. */
  P.matHit = function (id) { var m = this.matById(id); if (!m || !this._tappable(m)) return null; var p = this._hitPt(m); return { x: p.x, y: p.y, r: hitRAt(this.layout, m.ds), own: 0.5 * this.layout.S * m.ds }; };
  /** The tappable mat under (x, y): nearest hit centre within its radius → {m, d, own} | null. */
  P._matAt = function (x, y) {
    var best = null, bd = 1e9, L = this.layout;
    for (var i = 0; i < this.mats.length; i++) {
      var m = this.mats[i];
      if (!this._tappable(m)) continue;
      var p = this._hitPt(m), d = hyp(x - p.x, y - p.y);
      if (d > hitRAt(L, m.ds) || d >= bd) continue;
      bd = d; best = { m: m, d: d, own: 0.5 * L.S * m.ds };
    }
    return best;
  };
  /** Mimi's tap box {x, y (top-left), w, h, cx, cy} (DK.MIMI_POINTS.box scaled, + 8 px). */
  P.mimiHit = function () {
    var n = this.mimi, s = this.layout.mimiS, B = mimiPoints();
    var x0 = n.x + (B.box[0] - B.feet[0]) * s - 8, x1 = n.x + (B.box[2] - B.feet[0]) * s + 8, y0 = n.y + (B.box[1] - B.feet[1]) * s - 8, y1 = n.y + (B.box[3] - B.feet[1]) * s + 8;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  };
  /** The foot pump's hit circle {x, y, r} (r = max(hitR, 80)). */
  P.pumpHit = function () { var p = this.layout.pump; return { x: p.x, y: p.y, r: Math.max(this.layout.hitR, this.cfg.pumpHitR) }; };
  P._clearOfKeep = function (x, y) { var K = this.layout.keep; for (var k = 0; k < K.length; k++) if (inBox(K[k], x, y)) return false; return true; };
  P._onScreen = function (x, y, m) { var L = this.layout; m = m || 0; return x >= L.ins.left + m && x <= L.W - L.ins.right - m && y >= L.ins.top + m && y <= L.H - L.ins.bottom - m; };
  P._onMatBody = function (x, y) { var L = this.layout; for (var i = 0; i < this.mats.length; i++) { var m = this.mats[i]; if (this._tappable(m)) { var p = this._hitPt(m); if (hyp(x - p.x, y - p.y) <= 0.5 * L.S * m.ds) return true; } } return false; };
  /** A tappable point of a surprise: off every mat body, the speech bubble / HUD and Mimi, on the safe screen. */
  P._freeHit = function (x, y, r) {
    var ps = [[0, 0], [0, -0.5], [0.5, 0], [-0.5, 0], [0, 0.5], [0.4, -0.4], [-0.4, -0.4], [0.4, 0.4], [-0.4, 0.4]], nb = this.mimiHit();
    for (var i = 0; i < ps.length; i++) {
      var px = x + ps[i][0] * r, py = y + ps[i][1] * r;
      if (!this._onMatBody(px, py) && this._clearOfKeep(px, py) && this._onScreen(px, py, 6) && !inBox(nb, px, py)) return { x: px, y: py, r: r, cx: x, cy: y };
    }
    return null;
  };
  P._marmotPt = function () { var q = this.marmot; return q ? { x: q.x, y: q.y - 0.5 * this.cfg.marmotH * q.rise - q.jump } : null; };
  P._goatPt = function () { var q = this.goat; return q ? { x: q.x, y: q.y - 0.5 * this.cfg.goatH - q.hop } : null; };
  P._birdPt = function () { var q = this.bird; return q ? { x: q.x, y: q.y - 0.5 * this.cfg.birdH } : null; };
  P.marmotHit = function () { var q = this.marmot; if (!q || q.state === 'down' || q.rise < 0.6) return null; var p = this._marmotPt(); return this._freeHit(p.x, p.y, this.cfg.marmotR); };
  P.goatHit = function () { var q = this.goat; if (!q || q.state !== 'stand' || q.a < 0.6) return null; var p = this._goatPt(); return this._freeHit(p.x, p.y, this.cfg.goatR); };
  P.birdHit = function () { var q = this.bird; if (!q || q.state !== 'perch' || q.a < 0.6) return null; var p = this._birdPt(); return this._freeHit(p.x, p.y, this.cfg.birdR); };
  P._marmotAt = function (x, y) { var q = this.marmot; if (!q || q.state === 'down' || q.rise < 0.3) return false; var p = this._marmotPt(); return hyp(x - p.x, y - p.y) <= this.cfg.marmotR; };
  P._goatAt = function (x, y) { var q = this.goat; if (!q || q.state === 'out' || q.a < 0.3) return false; var p = this._goatPt(); return hyp(x - p.x, y - p.y) <= this.cfg.goatR; };
  P._birdAt = function (x, y) { var q = this.bird; if (!q || q.state === 'out' || q.a < 0.3) return false; var p = this._birdPt(); return hyp(x - p.x, y - p.y) <= this.cfg.birdR; };
  /** The current launch's target id (as a list) while a mat can be picked, [] otherwise. */
  P.targets = function () { var t = this.interactive && this.phase === 'play' ? this._target() : null; return t ? [t.id] : []; };
  /** What to touch next: {mat: id, id} in play · {pump: true, id: null, x, y} in pump (any press stomps) · null. */
  P.answer = function () {
    if (!this.interactive) return null;
    if (this.phase === 'pump') { var p = this.layout.pump; return { pump: true, id: null, mat: null, x: p.x, y: p.y }; }
    var t = this._target();
    return t ? { mat: t.id, id: t.id } : null;
  };
  P._inMeadow = function (x, y) { var M = this.layout.meadow; return x >= M.x0 && x <= M.x1 && y >= this.layout.horizon - this.layout.itemH && y <= M.y1 + 20; };

  // ---------------------------------------------------------------- viewport
  P.setViewport = function (W, H, ins) { this._view = { W: W, H: H, ins: insOf(ins) }; this._relayout(false); };
  P._relayout = function (force) {
    var v = this._view;
    var key = v.W + 'x' + v.H + ':' + JSON.stringify(v.ins) + ':' + this.age + ':' + JSON.stringify(this.hudKeep || null);
    if (key === this._vp && !force) return false;
    var had = !!this.layout, prev = this.layout;
    this._vp = key;
    this.layout = computeLayout(v.W, v.H, v.ins, this.cfg, this.age, this.hudKeep);
    this.layout.hudKeep = keepBoxes(this.hudKeep);
    var L = this.layout, n = this.mimi, r = this.rocket, p = this.pump;
    n.h = L.mimiH; n.s = L.mimiS; r.s = L.rocketS; r.h = r.l = L.rocketL;
    p.x = L.pump.x; p.y = L.pump.y; p.r = Math.max(L.hitR, this.cfg.pumpHitR);
    if (this.cur) this._applyHomes();
    if (had) this._snapAll(prev);
    else { n.x = n._px = L.mimiHome.x; n.y = n._py = L.mimiHome.y; this._padRocket(true); }
    this._poseMimi(); this._poseRocket();
    return true;
  };
  P._applyHomes = function () {
    var self = this, L = this.layout, cand = matCandidates(L, this.cfg);
    this._homes = [];
    for (var j = 0; j < this.cur.k; j++) this._homes.push(matHomes(L, this.cur.m, (this.cur.seed + j * 7919) >>> 0, this.cfg, cand));
    this.mats.forEach(function (m) { var hm = self._homes[m.launch] && self._homes[m.launch][m.i]; if (hm) { m.hx = hm.x; m.hy = hm.y; m.ds = hm.ds; } });
  };
  /** Rotation / resize mid-round (DESIGN §5.2): mats glide to their new homes in 0.3 s (from clamped on-screen points), Mimi and the
   *  pad / pump / pole snap, a flight in progress re-targets its mat's new position smoothly, everything is clamped on screen. */
  P._snapAll = function (prev) {
    var L = this.layout, self = this, sx = prev && prev.W ? L.W / prev.W : 1, sy = prev && prev.H ? L.H / prev.H : 1;
    this.cancelDrag();
    this.mats.forEach(function (m) {
      var ox = clamp(m.x, 0, L.W), oy = clamp(m.y, 0, L.H);
      m.gx = 0; m.gy = 0; m.gt = 1; self._placeMat(m, 0);
      m.gx = ox - m.x; m.gy = oy - m.y; m.gt = 0;
      self._placeMat(m, 0); self._twinMat(m);
    });
    var n = this.mimi;
    if (this._mhop) { this._mhop.p = null; }
    var fp = this._mimiSpot(); n.x = n._px = fp.x; n.y = n._py = fp.y;
    var r = this.rocket, F = this._fl;
    if (F && (F.phase === 'boost' || F.phase === 'coast')) {
      // re-aim the climb at the new mat: keep the COM (clamped on screen), set the ballistic velocity that reaches the new apex
      F.cx = clamp(F.cx * sx, L.ins.left + 10, L.W - L.ins.right - 10); F.cy = clamp(F.cy * sy, L.ins.top + 10, L.H - L.ins.bottom - 10);
      var mt = this.matById(F.id), tx = mt ? mt.x : F.cx, ty = mt ? mt.y : F.cy;
      var pl = planFlight(F.cx, F.cy + 1e3, tx, ty, L, this.cfg), apY = Math.min(pl.apexY, F.cy - 5);
      F.g = pl.g;
      var vy = -Math.sqrt(2 * F.g * Math.max(1, F.cy - apY)), tc = -vy / F.g, lead = L.rocketL - L.rocketLc, dir = tx >= F.cx ? 1 : -1;
      F.vy = vy; F.vx = (tx - F.cx - dir * lead) / (tc + 1 / this.cfg.glideOmega); F.phase = 'coast';
    } else if (F && F.phase === 'chute') {
      F.off *= sx; F.offV *= sx; F.hh = Math.max(0, F.hh * sy);
    }
    if (this._rhop) { r.x = clamp(r.x * sx, 0, L.W); r.y = clamp(r.y * sy, 0, L.H); this._rhop.p = null; this._rhop.from0 = null; this._rhop.from = { x: r.x, y: r.y }; }
    if (r.state === 'pad' || r.state === 'aim' || r.state === 'fountain') { r.x = L.pad.x; r.y = L.pad.y; }
    this._stepRocket(0);
    r._px = r.x; r._py = r.y; r._pnoseX = r.noseX; r._pnoseY = r.noseY;
    if (this.flyer) { var f = this.flyer; f.x0 = clamp(f.x0 * sx, 0, L.W); f.y0 = clamp(f.y0 * sy, 0, L.H); }
    this.pennants.forEach(function (q) { self._placePennant(q); });
    this.drops.forEach(function (d) { d.x = clamp(d.x * sx, 0, L.W); d.y = clamp(d.y * sy, 0, L.H); d.y0 *= sy; d._px = d.x; d._py = d.y; });
    this.rings.forEach(function (q) { q.x = clamp(q.x * sx, 0, L.W); q.y = clamp(q.y * sy, 0, L.H); });
    if (this.fountain) { this.fountain.x = r.noseX; this.fountain.y = r.noseY; }
    if (this.arc) this._makeArc();
    if (this.marmot) { var sp = this._marmotSpot(); if (sp) { this.marmot.x = sp.x; this.marmot.y = sp.y; this.marmot._px = sp.x; this.marmot._py = sp.y; } else this.marmot = null; }
    if (this.goat) { var gs = this._goatSpot(); if (gs) { var g = this.goat; g.rockX = gs.x; g.rockY = gs.y; g.x = g._px = gs.x; g.y = g._py = gs.y; g.state = g.state === 'out' ? 'out' : 'stand'; g.t = 0; g.a = g.state === 'stand' ? 1 : g.a; g.hop = 0; } else this.goat = null; }
    if (this.bird) { var b = this.bird; b.x = b._px = L.pole.x; b.y = b._py = L.pole.y1; if (b.state === 'in') { b.state = 'perch'; b.t = 0; b.a = 1; } }
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
    this.levels = DK.Content.topicsFor(this.age, this.rng, last);
    this._surpriseOff = this.rng.int(0, Math.max(0, this.cfg.surpriseTypes.length - 1));
    this.stars = 0; this._prevRule = null;
    this.weather = 0;
    this._emit({ type: 'session', levels: this.levels.slice() });
    this.startLevel(0);
  };
  P._clearRound = function () {
    this.mats = []; this._homes = []; this._g = null; this.finger.down = false; this.launch = 0;
    this.marmot = null; this.goat = null; this.bird = null; this.flyer = null; this.fountain = null; this.arc = null; this.arcAlpha = 0;
    this.pennants = []; this.chosen = null;
    this.hintHand = null; this.assistId = null; this._surpriseAt = -1; this._unfoldDone = -1;
    this._fl = null; this._pumpS = null; this._col = null; this._camp = null; this._mhop = null; this._rhop = null;
    var n = this.mimi, L = this.layout;
    n.state = 'stand'; n.onPump = false; n.sq = n.sqV = 0; n.lean = n.leanV = 0; n._leanT = 0;
    n.x = n._px = L.mimiHome.x; n.y = n._py = L.mimiHome.y;
    var p = this.pump; p.press = p._ppress = p.pressV = 0; p.count = 0; p.gauge = p.gaugeV = 0; p.glow = 0; p._holdT = 0;
    this._padRocket(true);
  };
  /** The rocket standing on the pad (full, chute packed); `hard` also resets its springs. */
  P._padRocket = function (hard) {
    var r = this.rocket, L = this.layout;
    r.state = 'pad'; r.x = r._px = L.pad.x; r.y = r._py = L.pad.y;
    if (hard) { r.rot = r._prot = 0; r.rotV = 0; r.aim = r._paim = 0; r.aimV = 0; r.water = 1; r.fizz = 0; r.chute = r._pchute = 0; r.chuteV = 0; r.chuteFold = 1;
      r.chuteRot = r._pchuteRot = 0; r.chuteRotV = 0; r.swing = r._pswing = 0; r.swingV = 0; r.vx = r.vy = 0; r.sq = r.sqV = 0; r.t = 0; }
    this._poseRocket();
  };
  P.startLevel = function (i) {
    if (!this.levels.length) this.levels = DK.Content.topicsFor(this.age);
    this.level = clamp(i | 0, 0, this.levels.length - 1);
    this.topic = this.levels[this.level];
    this.weather = this.level % 4;
    this.round = 0; this.levelStars = 0; this.levelStartTime = this.time;
    this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.cur = null; this.talk = null; this.talkAnswered = null; this.surprise = null; this._usedKeys = []; this._prevRule = null; this._modesSeen = {};
    var SR = this.cfg.surpriseRounds || [2];
    this._surpriseRound = SR[this.rng.int(0, SR.length - 1)];
    this._clearRound(); this.wipe = null;
    this._relayout(false);
    this._setState('intro'); this.phase = null;
    this._mood('wave', 1.6);
    var c = this._meadowCentre();
    this._emit({ type: 'level', level: this.level, topic: this.topic, weather: this.weather, x: c.x, y: c.y });
  };
  P._surpriseType = function () {
    var ST = this.cfg.surpriseTypes;
    if (this.level === this.cfg.rainbowLevel && this.cfg.rainbowSurprise) return this.cfg.rainbowSurprise;
    if (!ST || !ST.length) return null;
    return ST[(this.level + this._surpriseOff) % ST.length];
  };
  P._newMat = function (q) {
    var r = this._crng;
    return { id: q.id, launch: q.launch, row: q.launch, i: q.i, thing: q.thing, target: !!q.target, x: 0, y: 0, _px: 0, _py: 0, hx: 0, hy: 0, ds: 1, seed: r.int(1, 1e6),
      state: 'hidden', unfold: 0, _punfold: 0, unfoldT: 0, flap: 0, _pflap: 0, flapV: 0, squish: 0, _psquish: 0, squishV: 0, gold: 0, _pgold: 0, glow: 0, active: 0, _pactive: 0,
      alpha: 0, _palpha: 0, rot: 0, _prot: 0, foldT: 0, foldY: 0, foldDir: 1, thingHop: 0, _pthingHop: 0, thingS: 1, _pthingS: 1, thingA: 0, _pthingA: 0, wig: 0, _pwig: 0, wigV: 0,
      _tY: 0, _tV: 0, _tOn: false, bobPh: r.float(0, TAU), bobHz: r.float(this.cfg.bobHz[0], this.cfg.bobHz[1]), gx: 0, gy: 0, gt: 1, visited: false, count: -1, badge: null,
      _glowT: 0, _lastWrongT: -1e9, _sqNP: -1e9, _unfoldAt: 0, wet: 0 };
  };
  /** Prepare the next round (mats of launch 0 hidden, rocket on the pad); `unfold` starts when the wipe (if any) is over. */
  P._prepareRound = function () {
    var cfg = this.cfg;
    var rr = new DK.RNG((this.rng.next() * 4294967296) >>> 0);
    var sp = this.round === this._surpriseRound && this.round > 0 ? this._surpriseType() : null;
    var el = this.time - this.levelStartTime, sb = cfg.shortBudget, short = !!(sb && this.round > 0 && el > sb[Math.min(this.round, sb.length - 1)]);
    var cur = DK.Content.makeRound(this.topic, { age: this.age, lang: this.lang, rng: rr, roundIndex: this.round, surprise: sp, short: short, level: this.level,
      usedKeys: this._usedKeys, prevRule: this._prevRule, maxK: cfg.slots, maxDots: this.layout && this.layout.phone ? 10 : 0 });
    this._usedKeys.push(cur.key);
    this._clearRound();
    this.cur = cur; this.surprise = cur.surprise;
    this.misses = 0; this.streak = 0; this._noProg = 0; this._roundAssisted = false; this.launch = 0;
    this._applyHomes();
    this._buildLaunch(0);
    this._setState('round'); this._setPhase('wait');
  };
  P._buildLaunch = function (j) {
    var self = this, row = (this.cur.launches || this.cur.rows)[j];
    this.mats = this.mats.filter(function (m) { return m.state !== 'gone' && m.state !== 'hidden'; });
    row.forEach(function (q) { var m = self._newMat(q), hm = self._homes[j][q.i]; m.hx = hm.x; m.hy = hm.y; m.ds = hm.ds; self._placeMat(m, 0); self._twinMat(m); self.mats.push(m); });
  };
  P._beginUnfold = function (first) {
    var cfg = this.cfg, cur = this.cur, self = this, i = 0;
    this._setState('round'); this._setPhase('unfold');
    this._unfoldFirst = !!first; this._unfoldDone = -1;
    var lead = first ? cfg.unfoldLead : cfg.nextLead;
    this.mats.forEach(function (m) { if (m.launch === self.launch && m.state === 'hidden') m._unfoldAt = lead + (i++) * cfg.unfoldEach; });
    if (first) {
      this._roundT0 = this.time;
      this._idleT = 0; this._idleGap = cfg.idleTime; this._idleN = 0;
      this._mood('happy', 1.0);
      var c = this._meadowCentre();
      this._emit({ type: 'round', round: this.round, topic: this.topic, surprise: cur.surprise, k: cur.k, m: cur.m, n: cur.n, mode: cur.mode, short: cur.short, key: cur.key, x: c.x, y: c.y });
    }
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
  P._next = function () {
    var cur = this.cur, M = this._head();
    this._idleT = 0; this._idleGap = this.cfg.idleTime; this._idleN = 0;
    var e = { type: 'next', launch: this.launch, left: cur.k - this.launch, k: cur.k, mode: cur.mode, promptKey: cur.promptKey, params: cur.params, rule: cur.rule, x: M.x, y: M.y };
    if (cur.mode === 'countSeq') e.count = this.launch + 1;
    this._emit(e);
  };
  P._startTalk = function () {
    var rr = new DK.RNG((this.rng.next() * 4294967296) >>> 0);
    this.talk = DK.Content.makeTalk(this.topic, { age: this.age, lang: this.lang, rng: rr, level: this.level });
    this.talk.glowAnswer = false;
    this.talkAnswered = null; this._talkAskT = 0; this._talkAsks = 0;
    this.cur = null; this.phase = null;
    this._clearRound();
    this._setState('talk');
    this._mood('talk', 1.2);
    var c = this._meadowCentre();
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
   * pointerDown(x, y) → 'mat' (judged right / wrong) | 'squish' (a mat outside play, or the same wrong mat again < 1 s) | 'pump' (a
   * stomp) | 'merged' (a press < 0.22 s after the last stomp, or after the 3rd) | 'marmot' | 'goat' | 'bird' | 'mimi' (poke fires
   * on release) | 'soft' (grass / pump / rocket / nothing) | null (not in a round).
   */
  P.pointerDown = function (x, y) {
    if (this._g || (this.state !== 'round' && this.state !== 'roundDone')) return null;
    this.finger.x = x; this.finger.y = y; this.finger.down = true;
    var g = this._g = { x0: x, y0: y, x: x, y: y, t: this.time, kind: 'tap', maxD: 0, result: null };
    this._touch();
    return (g.result = this._press(x, y, g));
  };
  P._press = function (x, y, g) {
    var mt = this._matAt(x, y), onBody = mt && mt.d <= mt.own, play = this.interactive && this.phase === 'play';
    if (!onBody) {
      if (this._marmotAt(x, y)) { this._tapMarmot(); g.kind = 'surprise'; return 'marmot'; }
      if (this._goatAt(x, y)) { this._tapGoat(); g.kind = 'surprise'; return 'goat'; }
      if (this._birdAt(x, y)) { this._tapBird(); g.kind = 'surprise'; return 'bird'; }
    }
    if (this.state === 'round' && this.phase === 'pump' && this._pumpS) return this._stomp(false) ? 'pump' : 'merged';
    if (play && this.assistId && this._inMeadow(x, y)) {   // assist: the next press anywhere on the meadow picks the glowing target
      var a = this.matById(this.assistId);
      if (a && a.state === 'rest') { this._roundAssisted = true; this._emit({ type: 'assist', id: a.id, from: mt ? mt.m.id : null, x: a.x, y: a.y }); this._right(a); return 'mat'; }
    }
    if (mt && !mt.m.visited) {
      if (play && mt.m.launch === this.launch && mt.m.state === 'rest') {
        if (mt.m.target) { this._right(mt.m); return 'mat'; }
        return this._wrong(mt.m) ? 'mat' : 'squish';
      }
      if (!play) { this._squish(mt.m, { early: true }); return 'squish'; }
    }
    if (inBox(this.mimiHit(), x, y)) { g.kind = 'mimi'; return 'mimi'; }
    return this._soft(x, y, play);
  };
  P._squish = function (m, o) {
    m.squishV += kickFor(this.cfg.earlySquish, this.cfg.squishOmega, this.cfg.squishZeta);
    var e = { type: 'squish', id: m.id, x: m.x, y: m.y }; for (var k in o) e[k] = o[k];
    this._emit(e);
  };
  P._soft = function (x, y, play) {
    this._emit({ type: 'soft', x: x, y: y });
    if (play) this._noProgress(false);
    return 'soft';
  };
  P.pointerMove = function (x, y) {
    var g = this._g;
    if (!g) return;
    g.maxD = Math.max(g.maxD, hyp(x - g.x0, y - g.y0));
    this.finger.x = x; this.finger.y = y; g.x = x; g.y = y;
  };
  /** → 'pokeMimi' | 'up' | null */
  P.pointerUp = function (x, y) {
    var g = this._g;
    this._g = null; this.finger.down = false;
    if (!g) return null;
    if (x === undefined) { x = g.x; y = g.y; }
    var mv = Math.max(g.maxD, hyp(x - g.x0, y - g.y0));
    if (g.kind === 'mimi' && mv < this.cfg.tapMovePx && (this.state === 'round' || this.state === 'roundDone')) return this._pokeMimi() || 'up';
    return 'up';
  };
  /** The finger left (touchcancel / pause / rotation): the gesture ends without a judgement. */
  P.cancelDrag = function () { this._g = null; this.finger.down = false; };

  P._right = function (m) {
    var cfg = this.cfg, cur = this.cur, t = m.thing, j = this.launch;
    this.streak = 0; this._noProg = 0; this._touch();
    m._glowT = 0; this.assistId = null; this.hintHand = null;
    var ev = { type: 'right', id: m.id, thing: t, rule: cur.rule, mode: cur.mode, launch: j, row: j, k: cur.k, left: cur.k - j - 1, misses: this.misses, x: m.x, y: m.y };
    if (cur.mode === 'countSeq') ev.count = j + 1;
    if (cur.mode === 'countSel') ev.n = t.n;
    if (t.kind === 'animal') ev.home = t.home;
    this._mood('happy', cfg.moodTime.happy);
    this._emit(ev);
    this.chosen = m.id;
    m.squishV += kickFor(cfg.rightSquish, cfg.squishOmega, cfg.squishZeta);
    // aim: the launcher swings towards the flight's initial velocity; the dotted arc previews the flight; Mimi hops onto the pump
    var L = this.layout, F = planFlight(L.pad.x, L.pad.y - L.rocketLc, m.x, m.y, L, cfg);
    var aim = clamp(F.theta, -cfg.aimMax, cfg.aimMax);
    F = planFlight(L.pad.x + L.rocketLc * Math.sin(aim), L.pad.y - L.rocketLc * Math.cos(aim), m.x, m.y, L, cfg);
    this._aimTo = clamp(F.theta, -cfg.aimMax, cfg.aimMax);
    this._makeArc();
    if (this.rocket.state === 'pad') this.rocket.state = 'aim';   // still hopping back from the last launch: it aims once on the pad
    this._setPhase('aim');
    this._mimiHop('pump');
    this._emit({ type: 'aim', id: m.id, angle: this._aimTo, x: L.pad.x, y: L.pad.y });
  };
  P._wrong = function (m) {
    var cfg = this.cfg, cur = this.cur, t = m.thing, n = this.mimi, sg = m.x >= n.x ? 1 : -1;
    m.flapV += kickFor(cfg.wrongFlap, cfg.flapOmega, cfg.flapZeta) * (this._crng.chance(0.5) ? 1 : -1);
    m.wigV += kickFor(cfg.wrongWig, cfg.wigOmega, cfg.wigZeta) * (this._crng.chance(0.5) ? 1 : -1);
    n._leanTo = sg * cfg.leanWrong; n._leanT = cfg.leanHold;
    if (this.time - m._lastWrongT < cfg.sameWrongWindow) {   // the same mat again within 1 s: only a squish
      m._lastWrongT = this.time;
      this._squish(m, { repeat: true });
      if (this.time - m._sqNP > cfg.repeatNoProgress) { m._sqNP = this.time; this._noProgress(false); }
      return false;
    }
    m._lastWrongT = this.time;
    this.misses++; this.streak++;
    this._mood('oops');
    var want = { kind: cur.rule.kind, value: cur.rule.value, nameKind: cur.rule.nameKind, promptKey: cur.promptKey, params: cur.params, left: cur.k - this.launch };
    if (cur.mode === 'countSeq') want.count = this.launch + 1;
    var ev = { type: 'wrong', id: m.id, thing: t, got: { nameKind: t.nameKind, nameValue: t.nameValue }, want: want, rule: cur.rule, mode: cur.mode, launch: this.launch, row: this.launch,
      streak: this.streak, misses: this.misses, x: m.x, y: m.y };
    this._emit(ev);
    var h0 = this._lastHintT;
    this._noProgress(true);
    if (this._lastHintT !== h0) ev.hint = true;
    return true;
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
  P._pokeMimi = function () {
    var a = this.prompt(), M = this._head(), n = this.mimi;
    this._touch();
    this._mood('giggle');
    var ev = { type: 'pokeMimi', x: M.x, y: M.y };
    if (a) { ev.promptKey = a.promptKey; ev.params = a.params; ev.rule = a.rule; ev.left = a.left; ev.mode = a.mode; } else ev.busy = true;
    this._emit(ev);
    if (!this._mhop && !n.onPump && n.state !== 'dance') this._mimiHop('poke');
    return 'pokeMimi';
  };

  // ---------------------------------------------------------------- pump (the new gesture)
  P._beginPump = function () {
    var p = this.layout.pump;
    this._setPhase('pump');
    this._pumpS = { n: 0, last: -1e9, start: this.time, kid: -1e9, launchAt: -1, auto: false };
    this.mimi.state = 'pump';
    this._emit({ type: 'pumpAsk', x: p.x, y: p.y });
  };
  /** One stomp (DESIGN §5.2 pump). → false when merged (< 0.22 s after the last one) or already 3. */
  P._stomp = function (auto) {
    var cfg = this.cfg, S = this._pumpS, p = this.pump, n = this.mimi, r = this.rocket;
    if (!S || S.n >= cfg.pumpCount) return false;
    if (this.time - S.last < cfg.pumpMerge - 1e-9) return false;
    if (!auto) S.kid = this.time;
    S.n++; S.last = this.time;
    p.count = S.n; p._holdT = cfg.pressHold;
    n.sq = cfg.pumpSq; n.sqV = 0; n._stompT = this.time;
    r.fizz = 1;
    this._emit({ type: 'pump', n: S.n, auto: !!auto, x: p.x, y: p.y });
    if (S.n >= cfg.pumpCount) S.launchAt = this.time + cfg.launchDelay;
    return true;
  };
  P._stepPump = function (h) {
    var cfg = this.cfg, S = this._pumpS, p = this.pump, t = this.time;
    if (this.state === 'round' && this.phase === 'pump' && S) {
      if (S.n < cfg.pumpCount && t - Math.max(S.start, S.kid) >= cfg.pumpAuto - 1e-9 && t - S.last >= cfg.pumpAutoEvery - 1e-9) {
        if (!S.auto) { S.auto = true; this._emit({ type: 'pumpAuto', x: p.x, y: p.y }); }
        this._stomp(true);
      }
      if (S.launchAt >= 0 && t >= S.launchAt - 1e-9) { S.launchAt = -1; this._launch(); }
    }
    if (p._holdT > 0) p._holdT -= h;
    spring(p, 'press', 'pressV', p._holdT > 0 ? 1 : 0, cfg.pressOmega, cfg.pressZeta, h);
    p.press = clamp(p.press, -0.1, 1.05);
    var gT = this.phase === 'pump' || this.phase === 'aim' || this.phase === 'flight' && this.rocket.state === 'boost' ? p.count / cfg.pumpCount : 0;
    if (this.phase === 'flight' && this.rocket.state !== 'boost') gT = 0;
    spring(p, 'gauge', 'gaugeV', gT, 9, 0.6, h);
    var glowT = this.phase === 'pump' && S && S.n < cfg.pumpCount ? 0.55 + 0.45 * Math.sin(TAU * 1.6 * t) : 0;
    p.glow += (glowT - p.glow) * Math.min(1, h * 8);
    if (this.phase !== 'pump' && this.phase !== 'aim' && !(this.phase === 'flight')) p.count = 0;
  };

  // ---------------------------------------------------------------- the flight
  P._makeArc = function () {
    var L = this.layout, cfg = this.cfg, m = this.matById(this.chosen);
    if (!m) { this.arc = null; return; }
    var aim = this.rocket.state === 'aim' || this.rocket.state === 'pad' ? (this._aimTo || 0) : this.rocket.aim;
    var F = planFlight(L.pad.x + L.rocketLc * Math.sin(aim), L.pad.y - L.rocketLc * Math.cos(aim), m.x, m.y, L, cfg), out = [], T = F.Tb + F.tc, N = cfg.arcN, na = N - 5;
    for (var i = 0; i < na; i++) { var q = planPos(F, T * i / (na - 1), F.g); out.push({ x: q.x, y: q.y }); }
    var ax = F.apexX + F.dir * (L.rocketL - L.rocketLc), ay = F.apexY;
    for (var j = 1; j <= 5; j++) out.push({ x: lerp(ax, m.x, j / 5), y: lerp(ay, m.y, j / 5) });
    this.arc = out; this._arcPlan = F;
  };
  P._launch = function () {
    var cfg = this.cfg, L = this.layout, r = this.rocket, m = this.matById(this.chosen);
    var cx = r.x + L.rocketLc * Math.sin(r.rot), cy = r.y - L.rocketLc * Math.cos(r.rot);
    var F = planFlight(cx, cy, m.x, m.y, L, cfg);
    this._fl = { id: m.id, phase: 'boost', t: 0, T: 0, F: F, g: F.g, cx: cx, cy: cy, vx: 0, vy: 0, spray: 0, off: 0, offV: 0, offA: 0, py: 0, pvy: 0, s: 0, sV: 0, e: 1, apexT: 0 };
    r.state = 'boost'; r.t = 0; r.chuteFold = 1; r.rotV = 0;
    this._setPhase('flight');
    this.mimi.state = 'look'; this._mimiHop('home'); this._mood('look', 2.5);
    this._emit({ type: 'launch', id: m.id, x: r.x, y: r.y });
    this._emit({ type: 'whoosh', x: r.x, y: r.y });
  };
  P._spray = function (n) {
    var cfg = this.cfg, r = this.rocket, F = this._fl, c = this._crng, L = this.layout;
    var sp = hyp(F.vx, F.vy), ux = sp > 1 ? F.vx / sp : Math.sin(r.rot), uy = sp > 1 ? F.vy / sp : -Math.cos(r.rot);
    for (var q = 0; q < n; q++) {
      var v = c.float(cfg.sprayV[0], cfg.sprayV[1]), a = c.float(-cfg.spraySpread, cfg.spraySpread), ca = Math.cos(a), sa = Math.sin(a);
      var dx = -(ux * ca - uy * sa), dy = -(ux * sa + uy * ca), near = r.y > L.pad.y - 150;
      this._drop(r.x, r.y, F.vx * 0.15 + dx * v, F.vy * 0.15 + dy * v, c.float(cfg.dropR[0], cfg.dropR[1]), cfg.sprayLife * c.float(0.8, 1.15), near ? L.pad.y + 4 : L.H + 60, near);
    }
  };
  P._stepFlight = function (h) {
    var F = this._fl, cfg = this.cfg, r = this.rocket, L = this.layout;
    if (!F) return;
    var m = this.matById(F.id), g = F.g || cfg.g, Lr = L.rocketL, Lc = L.rocketLc;
    if (!m) { this._land(); return; }
    F.t += h; F.T += h; r.t = F.T;
    if (F.phase === 'boost' || F.phase === 'coast') {
      if (F.phase === 'boost') {
        F.vx += F.F.ax * h; F.vy += -F.F.s * h;
        F.spray += cfg.sprayN * h / cfg.boostTime;
        var ns = Math.floor(F.spray); F.spray -= ns; if (ns > 0) this._spray(ns);
        r.water = clamp(1 - F.t / cfg.boostTime, 0, 1);
        if (F.t >= cfg.boostTime - 1e-9) { F.phase = 'coast'; F.t = 0; r.state = 'coast'; r.water = 0; }
      } else F.vy += g * h;
      F.cx += F.vx * h; F.cy += F.vy * h;
      var sp = hyp(F.vx, F.vy);
      if (sp > 30) { var tgt = Math.atan2(F.vx, -F.vy), d = wrap(tgt - r.rot); r.rotV += (cfg.rotOmega * cfg.rotOmega * d - 2 * cfg.rotZeta * cfg.rotOmega * r.rotV) * h; r.rot += r.rotV * h; }
      r.x = F.cx - Lc * Math.sin(r.rot); r.y = F.cy + Lc * Math.cos(r.rot);
      r.vx = F.vx; r.vy = F.vy;
      if (F.phase === 'coast' && F.vy >= 0) {   // the apex: the parachute pops
        F.phase = 'chute'; F.t = 0; F.apexT = F.T; r.state = 'chute'; r.chute = 0; r.chuteV = 0; r.chuteFold = 0;
        var nx = F.cx + (Lr - Lc) * Math.sin(r.rot), ny = F.cy - (Lr - Lc) * Math.cos(r.rot);
        F.off = nx - m.x; F.offV = F.vx; F.hh = m.y - (ny + Lr); F.pvy = F.vy; F.s = wrap(r.rot); F.sV = r.rotV; F.e = 1;
        this._emit({ type: 'chute', id: F.id, x: nx, y: ny });
      }
    } else if (F.phase === 'chute') {
      spring(r, 'chute', 'chuteV', 1, cfg.chuteOmega, cfg.chuteZeta, h);
      var eff = clamp(r.chute, 0, 1.3), c = g / (cfg.chuteV * cfg.chuteV);
      // the canopy point is integrated RELATIVE to the mat (height hh above it, offset off beside it): the landing is exact even
      // when the mat glides (rotation / resize)
      F.pvy += (g - c * eff * F.pvy * Math.abs(F.pvy)) * h; F.hh -= F.pvy * h;
      var hh = F.hh, e = smooth(hh / cfg.fadeH);
      var wt = cfg.windK * this.wind * e, w = cfg.glideOmega;
      F.offA = w * w * (wt - F.off) - 2 * w * F.offV; F.offV += F.offA * h; F.off += F.offV * h;
      var ws = cfg.swingOmega, zs = (F.t < cfg.chuteOpen + 0.15 ? cfg.swingZetaOpen : cfg.swingZeta) + (1 - e) * cfg.swingGround;
      var sA = -ws * ws * Math.sin(F.s) + cfg.swingDrive * (F.offA / Lr) * Math.cos(F.s) - 2 * zs * ws * F.sV - cfg.windSwing * this.wind / Lr;
      F.sV += sA * h; F.s += F.sV * h;
      if (F.t > cfg.chuteOpen + 0.35 && Math.abs(F.s) > cfg.swingMax) { var sg = sgn(F.s); F.s = sg * cfg.swingMax; if (F.sV * sg > 0) F.sV = -0.3 * F.sV; }
      F.e = e;
      var rot = F.s * e, px = m.x + F.off * e, py = m.y - Lr - Math.max(0, hh);
      r.rot = rot; r.rotV = F.sV; r.swing = rot; r.swingV = F.sV;
      r.x = px - Lr * Math.sin(rot); r.y = py + Lr * Math.cos(rot);
      r.vx = F.offV; r.vy = F.pvy;
      var ct = cfg.chuteRotK * rot;
      r.chuteRotV = 0; r.chuteRot = ct;
      if (F.hh <= 1e-9 || F.T > cfg.flightMax) this._land();
    }
  };
  P._land = function () {
    var cfg = this.cfg, F = this._fl, r = this.rocket, L = this.layout, m = this.matById(F ? F.id : this.chosen), self = this;
    if (!m) { this._fl = null; this._padRocket(true); this._afterCollect(); return; }
    var err = hyp(r.x - m.x, r.y - m.y);
    r.x = m.x; r.y = m.y; r.vx = r.vy = 0;
    F.phase = 'landed'; F.t = 0; F.landX = m.x; F.side = sgn(r.swing || F.off || 1);
    r.state = 'landed'; r.swing = 0; r.swingV = 0; r._bz = 0; r._bzV = Math.sqrt(2 * cfg.bounceG * cfg.landBounce); r._bounced = false;
    r.sq = cfg.landSqR; r.sqV = 0;
    m.squishV += kickFor(cfg.landSquish, cfg.squishOmega, cfg.squishZeta); m.flapV += kickFor(cfg.landFlap, cfg.flapOmega, cfg.flapZeta);
    m.state = 'landed'; m.visited = true;
    this._ring(m.x, m.y, 1, 1); this._ring(m.x, m.y, 0.7, 0.7, 0.15);
    this._splash(m.x, m.y, cfg.splashN, 0.5 * L.S * m.ds);
    this._emit({ type: 'land', id: m.id, launch: m.launch, row: m.launch, k: this.cur.k, err: err, flight: F.T, x: m.x, y: m.y });
    this._emit({ type: 'splash', id: m.id, x: m.x, y: m.y });
    this.mats.forEach(function (o) { if (o.launch === m.launch && o.id !== m.id && o.state !== 'gone' && o.state !== 'fold') self._fold(o); });
    this._mood('cheer', 1.2); this.mimi.state = 'stand';
    this._setPhase('collect');
    this._col = { t: 0, id: m.id, step: 'hold', tT: 0, ret: false };
  };
  P._fold = function (m) {
    m.state = 'fold'; m.foldT = 0; m.foldDir = this._crng.chance(0.5) ? 1 : -1; m._u0 = m.unfold;
    this._emit({ type: 'fold', id: m.id, x: m.x, y: m.y });
  };
  /** Rocket pose fields for render (nose point, drawn top, squash). */
  P._poseRocket = function () {
    var r = this.rocket, L = this.layout;
    r.sy = 1 + (r.sq || 0); r.sx = 1 - this.cfg.sxK * (r.sq || 0);
    var Ls = L.rocketL * r.sy;
    r.noseX = r.x + Ls * Math.sin(r.rot); r.noseY = r.y - Ls * Math.cos(r.rot);
    var ch = r.chute > 0.05 ? r.chute * 0.85 * L.rocketL : 0;
    r.top = Math.min(r.y, r.noseY) - ch;
  };
  P._stepRocket = function (h) {
    var r = this.rocket, cfg = this.cfg, L = this.layout, F = this._fl;
    if (r.state === 'pad' || r.state === 'aim' || r.state === 'fountain') {
      r.x = L.pad.x; r.y = L.pad.y;
      var aT = r.state === 'aim' || (this.phase === 'pump' && this._pumpS) ? (this._aimTo || 0) : 0;
      spring(r, 'aim', 'aimV', aT, cfg.aimOmega, cfg.aimZeta, h);
      r.rot = r.aim + 0.025 * r.fizz * Math.sin(this.time * 38);
      r.water = Math.min(1, r.water + h / cfg.refillTime);
      spring(r, 'chute', 'chuteV', 0, 10, 0.8, h); r.chute = Math.max(0, r.chute);
      r.chuteFold = Math.min(1, r.chuteFold + h * 3); r.chuteRot += (0 - r.chuteRot) * Math.min(1, h * 6);
    } else if (r.state === 'landed') {
      if (!r._bounced) {
        r._bz += r._bzV * h; r._bzV -= cfg.bounceG * h;
        if (r._bz <= 0 && r._bzV < 0) { r._bz = 0; r._bzV = 0; r._bounced = true; r.sq = cfg.landSqR * 0.6; r.sqV = 0; }
      }
      var mm = F ? this.matById(F.id) : null;
      if (mm) { r.x = mm.x; r.y = mm.y - r._bz; }
      spring(r, 'rot', 'rotV', 0, cfg.tipOmega, cfg.tipZeta, h);
      spring(r, 'chute', 'chuteV', cfg.drapeTo, cfg.drapeOmega, cfg.drapeZeta, h);
      spring(r, 'chuteRot', 'chuteRotV', (F ? F.side : 1) * cfg.drapeRot, cfg.drapeOmega, cfg.drapeZeta, h);
    } else if (r.state === 'return') this._stepReturn(h);
    if (r.fizz > 0) r.fizz = Math.max(0, r.fizz - h * 2);
    spring(r, 'sq', 'sqV', 0, cfg.sqOmega, cfg.sqZeta, h);
    r.sq = clamp(r.sq, -0.3, 0.2);
    if (!(isFinite(r.x) && isFinite(r.y) && isFinite(r.rot))) { this._fl = null; this._padRocket(true); }
    this._poseRocket();
  };
  /** The rocket hops back to the pad in 2 springy hops (squash on each touch; `hopBack {n}` at each take-off). */
  P._startReturn = function () {
    var r = this.rocket;
    r.state = 'return'; this._fl = null; this._rhop = { n: 0, t: 0, p: null, wait: 0, from: { x: r.x, y: r.y } };
    spring(r, 'chute', 'chuteV', 0, 1, 1, 0);
    this._rhopGo();
  };
  P._rhopTarget = function (n) {
    var L = this.layout, H = this._rhop, f = H.from0 || H.from;
    return n === 0 ? { x: lerp(f.x, L.pad.x, 0.5), y: lerp(f.y, L.pad.y, 0.5) } : { x: L.pad.x, y: L.pad.y };
  };
  P._rhopGo = function () {
    var H = this._rhop, cfg = this.cfg, r = this.rocket;
    if (H.n === 0) H.from0 = { x: r.x, y: r.y };
    var to = this._rhopTarget(H.n), d = hyp(to.x - r.x, to.y - r.y);
    var T = clamp(cfg.returnHopT[0] * Math.sqrt(Math.max(1, d) / cfg.returnHopRef) + 0.12, cfg.returnHopT[0], cfg.returnHopT[1]);
    H.p = plan(r.x, r.y, to.x, to.y, T, Math.max(cfg.returnApexMin, cfg.returnApexK * Math.abs(to.x - r.x)) / (H.n + 1) * (H.n ? 1.4 : 1));
    H.t = 0; H.tx0 = to.x; H.ty0 = to.y; H.dir = sgn(to.x - r.x);
    r.sqV += 4;
    this._emit({ type: 'hopBack', n: H.n + 1, x: r.x, y: r.y });
  };
  P._stepReturn = function (h) {
    var H = this._rhop, r = this.rocket, cfg = this.cfg;
    if (!H) return;
    r.chute = Math.max(0, r.chute - h * 3); r.chuteFold = Math.min(1, r.chuteFold + h * 2.5); r.chuteRot += (0 - r.chuteRot) * Math.min(1, h * 6);
    if (!H.p) { var to0 = this._rhopTarget(H.n); H.p = plan(r.x, r.y, to0.x, to0.y, 0.3, cfg.returnApexMin); H.t = 0; H.tx0 = to0.x; H.ty0 = to0.y; }
    if (H.wait > 0) { H.wait -= h; if (H.wait <= 0) this._rhopGo(); spring(r, 'rot', 'rotV', 0, cfg.tipOmega, cfg.tipZeta, h); return; }
    H.t += h;
    var p = H.p, q = planAt(p, Math.min(H.t, p.T)), to = this._rhopTarget(H.n), u = clamp(H.t / p.T, 0, 1);
    r.x = q.x + (to.x - H.tx0) * u; r.y = q.y + (to.y - H.ty0) * u;
    r.rot = 0.22 * H.dir * Math.sin(Math.PI * u); r.rotV = 0;
    if (H.t >= p.T - 1e-9) {
      r.x = to.x; r.y = to.y; r.sq = cfg.returnSq; r.sqV = 0; r.rot = 0;
      if (H.n === 0) { H.n = 1; H.wait = cfg.returnPause; }
      else { this._rhop = null; r.state = this.phase === 'aim' || this.phase === 'pump' ? 'aim' : 'pad'; r.aim = 0; r.aimV = 0; }
    }
  };

  // ---------------------------------------------------------------- collect: the thing becomes a pennant
  P._stepCollect = function (h) {
    var C = this._col, cfg = this.cfg, L = this.layout;
    if (!C) return;
    C.t += h; C.tT += h;
    var m = this.matById(C.id), mode = this.cur.mode;
    if (!C.ret && C.t >= cfg.returnDelay) { C.ret = true; this._startReturn(); }
    if (m) switch (C.step) {
      case 'hold': if (C.tT >= cfg.landHold) { C.step = 'hop'; C.tT = 0; } break;
      case 'hop':
        m._tExtra = cfg.thingHopH * easeOut(C.tT / cfg.thingHopTime); m.thingS = 1 + 0.12 * easeOut(C.tT / cfg.thingHopTime);
        if (C.tT >= cfg.thingHopTime) {
          C.tT = 0;
          if (mode === 'countSel') { C.step = 'count'; m.count = 0; }
          else if (m.thing.kind === 'animal') { C.step = 'badge'; m.badge = { home: m.thing.home, x: m.x, y: m.y, r: L.badgeR * m.ds, a: 0 }; }
          else this._flyThing(m);
        }
        break;
      case 'count': {
        var n = m.thing.n, kk = Math.min(n, Math.floor((C.tT - cfg.countDelay) / cfg.countStep + 1e-9) + 1);
        if (C.tT >= cfg.countDelay && kk > m.count) { m.count = kk; this._emit({ type: 'count', id: m.id, i: kk, n: n, x: m.x, y: m.y - m.thingHop - 0.5 * L.itemH * m.ds }); }
        if (m.count >= n && C.tT >= cfg.countDelay + (n - 1) * cfg.countStep + cfg.countTail) this._flyThing(m);
        break;
      }
      case 'badge': {
        var b = m.badge, ih = L.itemH * m.ds * m.thingS, side = m.x + 0.5 * ih + 2 * b.r + 8 > L.W - L.ins.right ? -1 : 1;
        b.x = m.x + side * (0.5 * ih + b.r + 6); b.y = m.y - m.thingHop - 0.55 * ih; b.r = L.badgeR * m.ds;
        var was = b.a; b.a = Math.min(1, b.a + h * cfg.badgeRate);
        if (was === 0) this._emit({ type: 'homeBadge', id: m.id, home: b.home, x: b.x, y: b.y });
        if (C.tT >= cfg.badgeHold) this._flyThing(m);
        break;
      }
    }
    // the next launch's mats unfold while the thing flies up to the flagpole (the rocket may still be hopping home: aim waits for
    // it); after the last launch the camp waits for the last pennant
    if (C.step === 'fly' && C.tT >= cfg.flyNext && this.cur && this.launch + 1 < this.cur.k && !(this.launch + 1 >= cfg.roundLongMin && this.time - (this._roundT0 || 0) > cfg.roundLongCut)) this._afterCollect();
    else if (C.step === 'done') this._afterCollect();
  };
  /** The flying thing: a quadratic Bézier from the mat up to its pennant slot (control point above the higher end), shrinking to
   *  the pennant icon; on arrival it becomes w.pennants[slot] (`pennant` event). */
  P._stepFlyer = function (h) {
    var f = this.flyer, cfg = this.cfg;
    if (!f) return;
    f.t += h;
    var u = clamp(f.t / cfg.flyTime, 0, 1), sl = this._slotPt(f.slot), e2 = smooth(u);
    var x0 = f.x0, y0 = f.y0, x1 = sl.x, y1 = sl.y, top = Math.min(y0, y1) - cfg.flyApex;
    var cxp = (x0 + x1) / 2, cyp = 2 * top - (y0 + y1) / 2;
    f.x = (1 - e2) * (1 - e2) * x0 + 2 * (1 - e2) * e2 * cxp + e2 * e2 * x1;
    f.y = (1 - e2) * (1 - e2) * y0 + 2 * (1 - e2) * e2 * cyp + e2 * e2 * y1;
    f.s = lerp(f.s0, cfg.flyScale, e2); f.rot = -0.5 * Math.sin(Math.PI * u) * sgn(x1 - x0);
    if (u >= 1) {
      var pn = { thing: f.thing, id: f.id, slot: f.slot, x: 0, y: 0, flutter: 0.6, t: this._crng.float(0, 3), pop: 0, popV: kickFor(1.15, 14, 0.35), wave: 0, waveV: 0 };
      this._placePennant(pn);
      this.pennants.push(pn); this.flyer = null;
      this._emit({ type: 'pennant', id: f.id, slot: f.slot, thing: f.thing, x: pn.x, y: pn.y });
      if (this._col && this._col.id === f.id) { this._col.step = 'done'; this._col.tT = 0; }
    }
  };
  /** Where a pennant hangs: its top-left corner on the pole at slot j (+ its icon centre for the flyer). */
  P._slotPt = function (j) { var L = this.layout, s = L.slots[Math.min(j, L.slots.length - 1)]; return { x: s.x + 0.4 * L.pennantW, y: s.y + 0.32 * L.pennantH }; };
  P._placePennant = function (q) { var s = this.layout.slots[Math.min(q.slot, this.layout.slots.length - 1)]; q.x = s.x; q.y = s.y; q.w = this.layout.pennantW; q.h = this.layout.pennantH; };
  P._flyThing = function (m) {
    var L = this.layout;
    this._col.step = 'fly'; this._col.tT = 0;
    if (m.badge) m.badge.a = 0;
    var x0 = m.x, y0 = m.y - m.thingHop - 0.5 * L.itemH * m.ds;
    this.flyer = { id: m.id, thing: m.thing, slot: this.pennants.length, x: x0, y: y0, _px: x0, _py: y0, x0: x0, y0: y0, s: m.ds * m.thingS, s0: m.ds * m.thingS, _ps: m.ds, rot: 0, _prot: 0, t: 0, size: L.itemH };
    m.thingA = 0; m.count = -1;
  };
  P._afterCollect = function () {
    var self = this;
    this._col = null; this.chosen = null;
    this.launch++;
    // a round that already ran 70 s (a very slow child) goes to the camp after ≥ 2 launches (the in-round twin of short rounds)
    var longRound = this.launch >= this.cfg.roundLongMin && this.time - (this._roundT0 || 0) > this.cfg.roundLongCut;
    if (this.cur && this.launch < this.cur.k && !longRound) {
      this.mats.forEach(function (m) { if (m.state === 'landed') self._fold(m); });
      this._buildLaunch(this.launch);
      this._beginUnfold(false);
    } else this._beginCamp();
  };

  // ---------------------------------------------------------------- camp finale, round end, wipe
  P._beginCamp = function () {
    var L = this.layout;
    this._setPhase('camp');
    this._camp = { t: 0, i: 0, fAt: -1, fT: 0, spawned: 0, n: this.pennants.length };
    this.mimi.state = 'dance'; this._mood('dance', 3);
    this._emit({ type: 'camp', n: this.pennants.length, x: L.pole.x, y: (L.pole.y1 + L.pole.y0) / 2 });
  };
  P._stepCamp = function (h) {
    var K = this._camp, cfg = this.cfg, r = this.rocket, self = this;
    if (!K) return;
    K.t += h;
    var n = K.n;
    while (K.i < n && K.t >= cfg.campCountLead + K.i * cfg.campCountStep - 1e-9) {
      var q = this.pennants[K.i];
      K.i++;
      if (q) { q.waveV += kickFor(1, 10, 0.3); this._emit({ type: 'count', i: K.i, n: n, camp: true, id: q.id, x: q.x + 0.4 * q.w, y: q.y + 0.3 * q.h }); }
    }
    if (K.fAt < 0 && K.i >= n && K.t >= cfg.campCountLead + n * cfg.campCountStep + cfg.fountainGap - 1e-9) {
      K.fAt = K.t; r.state = r.state === 'pad' ? 'fountain' : r.state;
      this.fountain = { x: r.noseX, y: r.noseY, h: 0, _ph: 0, t: 0, a: 1, rainbow: 0 };
      this._emit({ type: 'fountain', x: r.noseX, y: r.noseY });
    }
    var F = this.fountain;
    if (F) {
      F.t += h; F.x = r.noseX; F.y = r.noseY;
      var want = Math.min(cfg.fountainN, Math.floor(cfg.fountainN * F.t / cfg.fountainSpawn));
      for (; K.spawned < want; K.spawned++) {
        var c = this._crng, v = Math.sqrt(2 * cfg.dropG * cfg.fountainH) * c.float(0.82, 1.04);
        this._drop(F.x + c.float(-4, 4), F.y, c.float(-55, 55), -v, c.float(3, 6), 2 * v / cfg.dropG * c.float(0.95, 1.1), this.layout.pad.y + 6, true);
      }
      var top = F.y;
      this.drops.forEach(function (d) { if (d.fountain && d.y < top) top = d.y; });
      F.h = Math.max(F.h * (F.t > cfg.fountainSpawn ? 0.985 : 1), F.y - top);
      F.rainbow = clamp(F.t / 0.4, 0, 1) * clamp((cfg.fountainSpawn + 0.9 - F.t) / 0.4, 0, 1);
      F.a = clamp((cfg.fountainSpawn + 1.1 - F.t) / 0.4, 0, 1);
    }
    if (K.fAt >= 0 && K.t >= Math.max(cfg.campTime, K.fAt + cfg.fountainHold) - 1e-9 && this.state === 'round') this._roundDone();
    void self;
  };
  P._starsFor = function (m) { return m <= 0 ? 3 : m === 1 ? 2 : 1; };
  P._roundDone = function () {
    var st = this._starsFor(this.misses), cur = this.cur, n = this.mimi;
    if (this._roundAssisted) st = Math.min(st, 2);   // an assisted round ≤ 2★
    this.roundStars = st; this.stars += st; this.levelStars += st;
    this._prevRule = { kind: cur.rule.kind, value: cur.rule.value };
    this.cancelDrag(); this.hintHand = null; this.assistId = null;
    this._setState('roundDone'); this.phaseTime = 0;
    this._emit({ type: 'roundDone', round: this.round, stars: st, misses: this.misses, assisted: !!this._roundAssisted, pennants: this.pennants.length, x: n.x, y: n.y - n.h - 20 });
  };
  P._startWipe = function () {
    var L = this.layout;
    this._setPhase('wipe');
    var dir = L.portrait ? { x: 0, y: -1 } : { x: 1, y: 0 };
    var mood = DK.Weather && DK.Weather.NAMES ? DK.Weather.NAMES[this.weather] : ['sunny', 'breezy', 'rain', 'rainbow'][this.weather];
    this.wipe = { t: 0, _pt: 0, dir: dir, mood: mood, weather: this.weather, swapped: false };
    var c = this._meadowCentre();
    this._emit({ type: 'wipe', mood: mood, weather: this.weather, dir: dir, x: c.x, y: c.y });
  };
  P._stepWipe = function (h) {
    var wp = this.wipe, cfg = this.cfg;
    if (!wp) return;
    wp.t = Math.min(1, wp.t + h / cfg.wipeTime);
    if (!wp.swapped && wp.t >= cfg.wipeSwap) { wp.swapped = true; this._swap(); }
    if (wp.swapped && wp.t >= cfg.wipeUnfold && this.state === 'round' && this.phase === 'wipe') this._beginUnfold(true);
    if (wp.t >= 1) this.wipe = null;
  };
  /** The screen is covered: the next round's mats (hidden) + rocket on the pad + pennants cleared, or Talk time. */
  P._swap = function () {
    var cfg = this.cfg;
    this.cur = null;
    this.round++;
    // Talk time after round 4, once the chapter passed 75 s with ≥ 3 rounds, or (a slow / struggling child) 72 s with ≥ 2 rounds
    var el = this.time - this.levelStartTime, long = (this.round >= cfg.chapterMinRounds && el > cfg.chapterTimeLimit) || (this.round >= cfg.chapterHardMin && el > cfg.chapterHardLimit);
    if (this.round < this.roundsPerLevel && !long) { this._prepareRound(); this._setPhase('wipe'); }
    else { if (this.round < this.roundsPerLevel) this.roundsPerLevel = this.round; this._startTalk(); }
  };

  // ---------------------------------------------------------------- help
  P.resetNudges = function () {
    this._idleT = 0; this._idleGap = this.cfg.idleTime; this._idleN = 0;
    this._talkAskT = 0; this._talkAsks = 0;
    if (this.talk) this.talk.glowAnswer = false;
  };
  P._glowing = function () { for (var i = 0; i < this.mats.length; i++) if (this.mats[i]._glowT > 0) return true; return false; };
  P._autoHint = function (fromIdle) {
    if (this._glowing() || this.hintHand || this.time - this._lastHintT < this.cfg.hintCooldown) return null;
    return this._doHint(fromIdle);
  };
  P._doHint = function (fromIdle) {
    var cfg = this.cfg, cur = this.cur;
    if (!this.interactive || this.phase !== 'play') return null;
    var m = this._target();
    if (!m) return null;
    m._glowT = cfg.hintTime;
    var p = this._hitPt(m);
    this.hintHand = { id: m.id, x: p.x, y: p.y, _px: p.x, _py: p.y, t: 0, press: 0, alpha: 0, time: 0, T: cfg.hintTime };
    this._stepHint(0);
    this._lastHintT = this.time;
    this._mood('talk', 1.2);
    var want = { kind: cur.rule.kind, value: cur.rule.value, nameKind: cur.rule.nameKind, promptKey: cur.promptKey, params: cur.params, left: cur.k - this.launch };
    if (cur.mode === 'countSeq') want.count = this.launch + 1;
    var ev = { type: 'hint', id: m.id, x: m.x, y: m.y, want: want };
    if (fromIdle) ev.idle = true;
    this._emit(ev);
    return { mat: m.id, id: m.id };
  };
  /** Manual hint (a tap on the speech bubble): the target mat glows + the ghost hand taps it. */
  P.hint = function () {
    if (!this.interactive || this.phase !== 'play') return null;
    if (this.hintHand) return { mat: this.hintHand.id, id: this.hintHand.id };
    return this._doHint(false);
  };
  /** Ghost hand (1.6 s cycle): glides in from below-right, taps the mat twice, drifts back fading. Fingertip = (x, y). */
  P._stepHint = function (h) {
    var H = this.hintHand, cfg = this.cfg;
    if (!H) return;
    H.time += h;
    var m = this.matById(H.id);
    if (!m || m.state !== 'rest' || m.visited || H.time >= H.T || this.state !== 'round' || this.phase !== 'play') { this.hintHand = null; return; }
    var p = this._hitPt(m), tx = p.x + 6, ty = p.y + 10;
    var u = (H.time % cfg.hintCycle) / cfg.hintCycle, ox = tx + 64, oy = ty + 104, x, y, press = 0, fade = 1;
    if (oy > this.layout.H - this.layout.ins.bottom - 10) oy = ty - 90;
    if (u < 0.25) { var v = smooth(u / 0.25); x = lerp(ox, tx, v); y = lerp(oy, ty, v); }
    else if (u < 0.65) { var k = (u - 0.25) / 0.2, tap = Math.sin(Math.PI * (k % 1)); press = tap; x = tx; y = ty + 8 * (1 - tap); }
    else { var w2 = smooth((u - 0.65) / 0.35); x = lerp(tx, ox, w2); y = lerp(ty, oy, w2); fade = 1 - 0.9 * w2; }
    H.alpha = clamp(H.time / 0.25, 0, 1) * clamp((H.T - H.time) / 0.35, 0, 1) * fade;
    H.x = x; H.y = y; H.t = u; H.press = press;
  };

  // ---------------------------------------------------------------- Mimi
  /** Where Mimi's feet are when she is not hopping: on the plunger (it moves her down), or at home. */
  P._mimiSpot = function () {
    var n = this.mimi, L = this.layout;
    if (n.onPump) return { x: L.pump.x, y: L.pump.y + this.pump.press * this.cfg.pressDepth };
    return { x: L.mimiHome.x, y: L.mimiHome.y };
  };
  /** Start a hop: 'pump' (onto the plunger), 'home', or 'poke' (in place). */
  P._mimiHop = function (to) {
    var n = this.mimi, cfg = this.cfg, L = this.layout;
    if (to === 'pump' && n.onPump && !this._mhop) return;
    if (to === 'home' && !n.onPump && !this._mhop) return;
    var tgt = to === 'pump' ? { x: L.pump.x, y: L.pump.y } : to === 'home' ? { x: L.mimiHome.x, y: L.mimiHome.y } : this._mimiSpot();
    var T = to === 'poke' ? cfg.pokeHopTime : cfg.mimiHopTime, A = to === 'poke' ? cfg.pokeApex : cfg.mimiHopApex;
    this._mhop = { to: to, t: 0, p: plan(n.x, n.y, tgt.x, tgt.y, T, A), tx0: tgt.x, ty0: tgt.y };
    n.sqV += 3;
  };
  P._stepMimi = function (h) {
    var n = this.mimi, cfg = this.cfg, L = this.layout, H = this._mhop;
    n.h = L.mimiH; n.s = L.mimiS;
    if (H) {
      if (!H.p) { var s0 = H.to === 'pump' ? L.pump : H.to === 'home' ? L.mimiHome : this._mimiSpot(); H.p = plan(n.x, n.y, s0.x, s0.y, 0.2, 10); H.tx0 = s0.x; H.ty0 = s0.y; H.t = 0; }
      H.t += h;
      var tg = H.to === 'pump' ? { x: L.pump.x, y: L.pump.y } : H.to === 'home' ? { x: L.mimiHome.x, y: L.mimiHome.y } : { x: H.tx0, y: H.ty0 };
      var q = planAt(H.p, Math.min(H.t, H.p.T)), u = clamp(H.t / H.p.T, 0, 1);
      n.x = q.x + (tg.x - H.tx0) * u; n.y = q.y + (tg.y - H.ty0) * u;
      spring(n, 'sq', 'sqV', q.vy < 0 ? 0.06 : 0.02, cfg.sqOmega, cfg.sqZeta, h);
      if (H.t >= H.p.T - 1e-9) {
        this._mhop = null; n.x = tg.x; n.y = tg.y;
        if (H.to === 'pump') n.onPump = true; else if (H.to === 'home') n.onPump = false;
        n.sq = cfg.mimiLandSq; n.sqV = 0;
      }
    } else {
      var sp = this._mimiSpot(); n.x = sp.x; n.y = sp.y;
      spring(n, 'sq', 'sqV', 0, cfg.sqOmega, cfg.sqZeta, h);
    }
    if (!this._mhop && n.onPump && this.phase !== 'aim' && this.phase !== 'pump') this._mimiHop('home');
    n.sq = clamp(n.sq, -0.3, 0.25);
    n.sy = 1 + n.sq; n.sx = 1 - cfg.sxK * n.sq;
    if (n._leanT > 0) n._leanT -= h; else n._leanTo = this._fl && this._fl.phase !== 'landed' ? -0.06 : 0;
    spring(n, 'lean', 'leanV', n._leanTo, cfg.leanOmega, cfg.leanZeta, h);
    if (this.state === 'sessionDone') n.state = 'dance';
    else if (this.phase === 'camp' || (this.state === 'roundDone' && this.phase === 'camp')) n.state = 'dance';
    else if (this.phase === 'pump') n.state = 'pump';
    else if (this.phase === 'flight') n.state = 'look';
    else if (n.state === 'dance' || n.state === 'pump' || n.state === 'look') n.state = 'stand';
    if (n.moodT > 0) { n.moodT -= h; if (n.moodT <= 0) { n.moodT = 0; n.mood = this.state === 'sessionDone' ? 'dance' : 'idle'; } }
    n.blinkT -= h;
    if (n.blink && n.blinkT <= 0) { n.blink = false; n.blinkT = this._crng.float(cfg.blink[0], cfg.blink[1]); }
    else if (!n.blink && n.blinkT <= 0) { n.blink = true; n.blinkT = cfg.blinkTime; }
    if (!(isFinite(n.x) && isFinite(n.y))) { n.x = L.mimiHome.x; n.y = L.mimiHome.y; this._mhop = null; n.onPump = false; }
    this._poseMimi();
  };
  /** frame = the svg frame to draw (mimi_<frame>.svg): pump ↔ idle per stomp, look in flight, dance in camp, else mood / blink. */
  P._poseMimi = function () {
    var n = this.mimi, cfg = this.cfg;
    if (n.state === 'dance') n.frame = 'dance';
    else if (n.state === 'pump' && n.onPump && !this._mhop) n.frame = this.time - (n._stompT || -1e9) < cfg.pumpFrame || this.pump.press > 0.3 ? 'pump' : (n.mood === 'idle' ? (n.blink ? 'blink' : 'idle') : n.mood);
    else if (n.state === 'look' && (n.mood === 'look' || n.mood === 'idle')) n.frame = 'look';
    else n.frame = n.mood === 'idle' && n.blink ? 'blink' : n.mood === 'pump' ? 'pump' : n.mood;
  };

  // ---------------------------------------------------------------- mats
  P._placeMat = function (m, h) {
    var cfg = this.cfg;
    if (m.gt < 1) m.gt = Math.min(1, m.gt + h / cfg.glideTime);
    var gk = 1 - smooth(m.gt);
    m.x = m.hx + m.gx * gk; m.y = m.hy + m.gy * gk - m.foldY;
  };
  P._twinMat = function (m) {
    m._px = m.x; m._py = m.y; m._punfold = m.unfold; m._psquish = m.squish; m._pflap = m.flap; m._pgold = m.gold; m._palpha = m.alpha; m._prot = m.rot;
    m._pthingHop = m.thingHop; m._pthingS = m.thingS; m._pthingA = m.thingA; m._pwig = m.wig; m._pactive = m.active;
  };
  P._stepMats = function (h) {
    var cfg = this.cfg, L = this.layout, t = this.time, self = this, i;
    for (i = 0; i < this.mats.length; i++) {
      var m = this.mats[i];
      if (m.state === 'gone') continue;
      if (m.state === 'hidden') {
        m.alpha = 0; m.unfold = 0; m.thingA = 0;
        if (this.phase === 'unfold' && this.state === 'round' && m.launch === this.launch && this.phaseTime >= m._unfoldAt - 1e-9) {
          m.state = 'unfold'; m.unfoldT = 0; m._tY = cfg.thingDropH; m._tV = 0; m._tOn = false;
          this._placeMat(m, 0);
          this._emit({ type: 'unfold', id: m.id, launch: m.launch, i: m.i, x: m.hx, y: m.hy });
        } else { this._placeMat(m, h); continue; }
      }
      if (m.state === 'unfold') {
        m.unfoldT += h;
        var u = m.unfoldT / cfg.unfoldTime;
        m.unfold = backOut(u, cfg.unfoldBack); m.alpha = Math.min(1, u * 4);
        if (u >= cfg.thingDropAt && !m._tOn) { m._tOn = true; }
        if (u >= 1) { m.unfold = 1; m.state = 'rest'; }
      } else if (m.state === 'fold') {
        m.foldT = Math.min(1, m.foldT + h / cfg.foldTime);
        var fu = m.foldT;
        m.unfold = (m._u0 === undefined ? 1 : m._u0) * (1 - smooth(fu / 0.55));
        m.foldY = cfg.foldRise * Math.max(0, (fu - 0.35) / 0.65) * Math.max(0, (fu - 0.35) / 0.65);
        m.rot = m.foldDir * cfg.foldSpin * Math.max(0, fu - 0.35);
        m.alpha = 1 - smooth((fu - 0.55) / 0.45); m.thingA = Math.min(m.thingA, 1 - smooth(fu / 0.4)); m.glow = 0; m.gold *= 1 - h * 4;
        if (fu >= 1) { m.state = 'gone'; m.alpha = 0; m.thingA = 0; }
      }
      // the thing: drops onto the mat with a bounce, then bobs gently (± 2 px, own phase); hops while being collected
      if (m._tOn && (m.state === 'unfold' || m.state === 'rest' || m.state === 'landed')) {
        if (m._tY > 0 || m._tV !== 0) {
          m._tV -= cfg.thingG * h; m._tY += m._tV * h;
          if (m._tY <= 0) { m._tY = 0; m._tV = m._tV < -60 ? -m._tV * cfg.thingBounce : 0; }
        }
      }
      if (m.state === 'unfold' || m.state === 'rest' || m.state === 'landed') {
        var away = m.visited && (!this._col || this._col.id !== m.id || this._col.step === 'fly' || this._col.step === 'done');
        var tA = m._tOn && !away ? 1 : 0;
        m.thingA = tA > m.thingA ? Math.min(1, m.thingA + h * 6) : tA;
      }
      var bob = m.state === 'rest' && !m.visited ? cfg.bobAmp * Math.sin(TAU * m.bobHz * t + m.bobPh) : 0;
      m.thingHop = m._tY + (m._tExtra || 0) + bob;
      spring(m, 'flap', 'flapV', 0, cfg.flapOmega, cfg.flapZeta, h);
      spring(m, 'squish', 'squishV', 0, cfg.squishOmega, cfg.squishZeta, h);
      spring(m, 'wig', 'wigV', 0, cfg.wigOmega, cfg.wigZeta, h);
      m.flap = clamp(m.flap, -1, 1); m.squish = clamp(m.squish, -0.3, 1); m.wig = clamp(m.wig, -0.6, 0.6);
      if (m.visited) m.gold = Math.min(1, m.gold + h / cfg.goldTime);
      if (m._glowT > 0) m._glowT = Math.max(0, m._glowT - h);
      var gT = this.assistId === m.id ? 1 : m._glowT > 0 ? 0.55 + 0.45 * Math.sin(TAU * 1.6 * t) : 0;
      m.glow += (gT - m.glow) * Math.min(1, h * (gT > m.glow ? 10 : 4));
      var aT = this.chosen === m.id && (this.phase === 'aim' || this.phase === 'pump' || this.phase === 'flight') ? 1 : 0;
      m.active += (aT - m.active) * Math.min(1, h * cfg.activeRate);
      m.wet = this.weather === 2 ? 1 : 0;
      if (m.state === 'landed' && m.thing.kind === 'animal' && m.badge && this._col && this._col.step !== 'badge') m.badge.a = Math.max(0, m.badge.a - h * 4);
      this._placeMat(m, h);
      if (!(isFinite(m.x) && isFinite(m.y))) { m.squish = m.squishV = m.flap = m.flapV = 0; m.x = m.hx; m.y = m.hy; }
    }
    // the unfold phase ends when every mat of this launch rests (+ a short pause) → the question (first launch) or `next`
    if (this.state === 'round' && this.phase === 'unfold') {
      var all = true;
      this.mats.forEach(function (q) { if (q.launch === self.launch && q.state !== 'rest') all = false; });
      if (all) {
        if (this._unfoldDone < 0) this._unfoldDone = this.time;
        if (this.time - this._unfoldDone >= (this._unfoldFirst ? cfg.askAfterUnfold : cfg.nextAfterUnfold) - 1e-9) { this._setPhase('play'); if (this._unfoldFirst) this._ask(); else this._next(); }
      }
    }
    void L;
  };
  P._stepPennants = function (h) {
    var cfg = this.cfg, t = this.time, wind = this.wind;
    for (var i = 0; i < this.pennants.length; i++) {
      var q = this.pennants[i];
      q.t += h;
      spring(q, 'pop', 'popV', 1, 14, 0.35, h);
      spring(q, 'wave', 'waveV', 0, 10, 0.3, h);
      q.flutter = clamp(0.45 + 0.2 * Math.sin(1.7 * t + q.slot) + Math.abs(wind) / 60 + Math.abs(q.wave) * 0.6, 0, 1);
      this._placePennant(q);
    }
    void cfg;
  };

  // ---------------------------------------------------------------- water bits
  P._drop = function (x, y, vx, vy, r, life, y0, ring, fountain) {
    if (this.drops.length >= this.cfg.dropCap) this.drops.shift();
    this.drops.push({ x: x, y: y, _px: x, _py: y, vx: vx, vy: vy, r: r, a: 1, t: 0, life: life, y0: y0, ring: !!ring, fountain: !!fountain || vy < -600 });
  };
  P._ring = function (x, y, size, a, delay) {
    var cfg = this.cfg, S = this.layout.S;
    if (this.rings.length >= cfg.ringCap) this.rings.shift();
    var r0 = cfg.ringR[0] * S * size, r1 = cfg.ringR[1] * S * size;
    this.rings.push({ x: x, y: y, r: r0, r0: r0, r1: r1, life: cfg.ringLife * (0.7 + 0.3 * size), t: -(delay || 0), a: 0, a0: a === undefined ? 1 : a, flat: cfg.ringFlat });
  };
  P._splash = function (x, y, n, rad) {
    var cfg = this.cfg, c = this._crng;
    for (var q = 0; q < n; q++) {
      var side = q % 2 ? 1 : -1, ang = c.float(0, Math.PI), ex = Math.cos(ang) * rad, ey = Math.sin(ang) * 0.25 * rad;
      this._drop(x + ex * side * 0.6, y + ey * 0.3, side * c.float(cfg.splashOut[0], cfg.splashOut[1]) * Math.abs(Math.cos(ang)) + c.float(-20, 20), -c.float(cfg.splashV[0], cfg.splashV[1]),
        c.float(cfg.dropR[0], cfg.dropR[1]), cfg.dropLife * c.float(0.85, 1.15), y + 4, true);
    }
  };
  P._stepWater = function (h) {
    var g = this.cfg.dropG, i;
    for (i = this.drops.length - 1; i >= 0; i--) {
      var d = this.drops[i]; d.t += h;
      d.vy += g * h; d.vx *= 1 - 0.8 * h; d.x += d.vx * h; d.y += d.vy * h;
      d.a = clamp(1 - d.t / d.life, 0, 1) * (d.fountain ? 1 : 1);
      if (d.fountain) d.a = clamp((d.life - d.t) / 0.3, 0, 1);
      if (d.t >= d.life || (d.vy > 0 && d.y > d.y0)) {
        if (d.ring && d.vy > 0 && d.y > d.y0 - 2 && this._crng.chance(this.cfg.dropRingP) && this.rings.length < this.cfg.ringCap) this._ring(d.x, d.y0, 0.15, 0.45);
        this.drops.splice(i, 1);
      }
    }
    for (i = this.rings.length - 1; i >= 0; i--) {
      var rp = this.rings[i]; rp.t += h;
      if (rp.t < 0) { rp.a = 0; continue; }
      var u = rp.t / rp.life;
      rp.r = lerp(rp.r0, rp.r1, easeOut(u)); rp.a = rp.a0 * (1 - u) * Math.min(1, u * 8);
      if (u >= 1) this.rings.splice(i, 1);
    }
  };

  // ---------------------------------------------------------------- surprises (DESIGN §5.2)
  /** All mat homes of this round (every launch) — surprises keep clear of them. */
  P._allHomes = function () {
    var L = this.layout, out = [];
    this._homes.forEach(function (row) { row.forEach(function (p) { var hp = matHitPt(L, p.x, p.y, p.ds); out.push({ x: hp.x, y: hp.y, r: hitRAt(L, p.ds), foot: matFoot(L, p.x, p.y, p.ds) }); }); });
    this.mats.forEach(function (m) { if (m.state !== 'gone') { var hp = matHitPt(L, m.x, m.y, m.ds); out.push({ x: hp.x, y: hp.y, r: hitRAt(L, m.ds), foot: matFoot(L, m.x, m.y, m.ds) }); } });
    return out;
  };
  /** A burrow spot in the meadow ≥ hitR + 40 from every mat (all launches), off the bubble / HUD / pole / pad / Mimi. */
  P._marmotSpot = function () {
    var L = this.layout, cfg = this.cfg, H = this._allHomes(), best = null, bs = -1e9, c = this._crng, M = L.meadow;
    for (var y = L.horizon + 40; y <= M.y1 - 30; y += 16) for (var x = M.x0 + 50; x <= M.x1 - 50; x += 16) {
      if (!this._onScreen(x, y, 40)) continue;
      var box = { x: x - 50, y: y - cfg.marmotH - 10, w: 100, h: cfg.marmotH + 20 }, ok = true, md = 1e9;
      for (var k = 0; k < L.keep.length && ok; k++) if (boxGap(box, L.keep[k]) < 10) ok = false;
      if (!ok || boxGap(box, L.poleBox) < 20 || hyp(x - L.pad.x, y - L.pad.y) < 140) continue;
      var py = y - 0.5 * cfg.marmotH;
      for (var i = 0; i < H.length && ok; i++) { md = Math.min(md, hyp(x - H[i].x, py - H[i].y) - H[i].r); if (boxGap(box, H[i].foot) < 10) ok = false; }
      if (!ok || md < cfg.marmotGap) continue;
      var sc = Math.min(md, 300) + c.float(0, 40);
      if (sc > bs) { bs = sc; best = { x: x, y: y }; }
    }
    return best;
  };
  /** The goat's rock: on the horizon line, ≥ 60 px above the top of every mat (thing included) or clear beside them. */
  P._goatSpot = function () {
    var L = this.layout, cfg = this.cfg, H = this._allHomes(), best = null, bs = -1e9, c = this._crng, M = L.meadow, y = L.horizon - 4;
    if (y - cfg.goatH < L.play.y0 + 6) return null;
    for (var x = M.x0 + 70; x <= M.x1 - 70; x += 14) {
      var box = { x: x - cfg.goatW / 2, y: y - cfg.goatH, w: cfg.goatW, h: cfg.goatH + 16 }, ok = this._onScreen(x, y - cfg.goatH, 20), md = 1e9;
      for (var k = 0; k < L.keep.length && ok; k++) if (boxGap(box, L.keep[k]) < 10) ok = false;
      if (!ok || boxGap(box, L.poleBox) < 20) continue;
      for (var i = 0; i < H.length && ok; i++) { var gp = boxGap(box, H[i].foot); if (gp < 20 || (H[i].foot.y < y + 16 && H[i].foot.y > y - cfg.goatH - cfg.goatGap && gp < cfg.goatGap)) ok = false; md = Math.min(md, gp); }
      if (!ok) continue;
      var sc = Math.min(md, 240) + c.float(0, 40);
      if (sc > bs) { bs = sc; best = { x: x, y: y }; }
    }
    return best;
  };
  P._spawnSurprise = function () {
    var cfg = this.cfg, L = this.layout, type = this.surprise;
    if (type === 'goat' && !this.goat) {
      var gs = this._goatSpot();
      if (!gs) type = 'marmot';
      else {
        var side = gs.x > (L.meadow.x0 + L.meadow.x1) / 2 ? 1 : -1, x0 = gs.x + side * cfg.goatHopDx * cfg.goatHops;
        this.goat = { x: x0, y: gs.y, _px: x0, _py: gs.y, rockX: gs.x, rockY: gs.y, rockW: cfg.goatRockW, state: 'in', t: 0, n: 0, hop: 0, a: 0, face: -side, dirIn: -side, frame: 'goat', s: 1, hopFrom: x0 };
        this._emit({ type: 'goat', x: gs.x, y: gs.y });
      }
    }
    if (type === 'marmot' && !this.marmot) {
      var sp = this._marmotSpot();
      if (sp) {
        this.marmot = { x: sp.x, y: sp.y, _px: sp.x, _py: sp.y, burrowR: cfg.burrowR, state: 'up', t: 0, rise: 0, jump: 0, _jT: -1, look: 0, wave: false, frame: 'marmot', a: 1 };
        this._emit({ type: 'marmot', x: sp.x, y: sp.y });
      }
    }
    if (type === 'bird' && !this.bird) {
      var tx = L.pole.x, ty = L.pole.y1, fx = L.portrait ? L.ins.left - 60 : L.W + 60, fy = L.play.y0 - 40;
      this.bird = { x: fx, y: fy, _px: fx, _py: fy, x0: fx, y0: fy, state: 'in', t: 0, a: 0, face: tx >= fx ? 1 : -1, flap: 0, sing: 0, frame: 'bird' };
      this._emit({ type: 'bird', x: tx, y: ty });
    }
  };
  P._tapMarmot = function () { var q = this.marmot; q._jT = 0; q.wave = true; q._waveT = 1.0; this._emit({ type: 'marmotTap', x: q.x, y: q.y - 0.5 * this.cfg.marmotH }); };
  P._tapGoat = function () { var q = this.goat; q._tapT = 0; this._emit({ type: 'goatTap', x: q.x, y: q.y - 0.5 * this.cfg.goatH }); };
  P._tapBird = function () { var q = this.bird; q.sing = 0.001; this._emit({ type: 'birdTap', x: q.x, y: q.y - 0.5 * this.cfg.birdH }); };
  P._stepSurprises = function (h) {
    var cfg = this.cfg, L = this.layout;
    if (this._surpriseAt >= 0 && this.time >= this._surpriseAt && this.state === 'round' && this.phase !== 'wipe' && this.phase !== 'unfold') { this._surpriseAt = -1; this._spawnSurprise(); }
    var q = this.marmot;
    if (q) {
      q.t += h;
      if (q.state === 'up') { q.rise = easeOut(q.t / cfg.marmotUp); if (q.t >= cfg.marmotUp) { q.state = 'look'; q.t = 0; } }
      else if (q.state === 'look' || q.state === 'wave') {
        q.rise = 1; q.look = Math.sin(q.t * 1.3);
        if (q.state === 'look' && q.t > 2.5 && q.t < 4) q.state = 'wave';
        else if (q.state === 'wave' && q.t >= 4) q.state = 'look';
        if (q.t >= cfg.marmotStay) { q.state = 'down'; q.t = 0; }
      } else if (q.state === 'down') { q.rise = 1 - easeOut(q.t / cfg.marmotDown); if (q.t >= cfg.marmotDown + 0.3) this.marmot = null; }
      if (this.marmot) {
        if (q._jT >= 0) { q._jT += h; var uj = clamp(q._jT / cfg.marmotJump, 0, 1); q.jump = cfg.marmotJumpH * 4 * uj * (1 - uj); if (uj >= 1) { q._jT = -1; q.jump = 0; } }
        if (q._waveT > 0) q._waveT -= h;
        q.wave = q.state === 'wave' || q._waveT > 0;
        q.frame = q.wave ? 'marmot_wave' : 'marmot';
      }
    }
    var g = this.goat;
    if (g) {
      g.t += h;
      if (g.state === 'in' || g.state === 'out') {
        var uh = clamp(g.t / cfg.goatHop, 0, 1), dx = (g.state === 'in' ? g.dirIn : -g.dirIn) * cfg.goatHopDx;
        g.face = sgn(dx);
        g.x = g.hopFrom + dx * uh; g.hop = cfg.goatHopH * 4 * uh * (1 - uh); g.frame = uh < 1 ? 'goat_hop' : 'goat';
        g.a = g.state === 'in' ? Math.min(1, g.a + h * 3) : Math.max(0, 1 - (g.n + uh) / cfg.goatHops);
        if (uh >= 1) {
          g.n++; g.t = 0; g.hopFrom = g.x;
          if (g.n >= cfg.goatHops) {
            if (g.state === 'in') { g.state = 'stand'; g.x = g.rockX; g.hop = 0; g.frame = 'goat'; g.n = 0; }
            else this.goat = null;
          }
        }
      } else if (g.state === 'stand') {
        g.a = 1; g.x = g.rockX; g.y = g.rockY;
        if (g._tapT !== undefined && g._tapT >= 0) { g._tapT += h; var ut = clamp(g._tapT / cfg.goatTapHop, 0, 1); g.hop = cfg.goatHopH * 4 * ut * (1 - ut); g.frame = ut < 1 ? 'goat_hop' : 'goat'; if (ut >= 1) { g._tapT = -1; g.hop = 0; } }
        if (g.t >= cfg.goatStay) { g.state = 'out'; g.t = 0; g.n = 0; g.hopFrom = g.x; g.hop = 0; }
      }
    }
    var b = this.bird;
    if (b) {
      b.t += h;
      var tx = L.pole.x, ty = L.pole.y1;
      if (b.state === 'in') {
        var ub = smooth(b.t / cfg.birdIn);
        b.x = lerp(b.x0, tx, ub); b.y = lerp(b.y0, ty, ub) - 90 * Math.sin(Math.PI * ub); b.a = Math.min(1, b.t * 3); b.flap = 0.5 + 0.5 * Math.sin(b.t * 30);
        if (b.t >= cfg.birdIn) { b.state = 'perch'; b.t = 0; b.x = tx; b.y = ty; b.flap = 0; }
      } else if (b.state === 'perch') {
        b.x = tx; b.y = ty; b.flap = 0;
        if (b.sing > 0) { b.sing = Math.min(1, b.sing + h / cfg.birdSing); if (b.sing >= 1) b.sing = 0; }
        if (b.t >= cfg.birdStay) { b.state = 'out'; b.t = 0; b.x0 = tx; b.y0 = ty; }
      } else {
        var uo = smooth(b.t / cfg.birdOut), ex = L.portrait ? L.W + 60 : L.ins.left - 60;
        b.x = lerp(b.x0, ex, uo); b.y = lerp(b.y0, L.play.y0 - 60, uo) - 60 * Math.sin(Math.PI * uo); b.a = 1 - uo; b.flap = 0.5 + 0.5 * Math.sin(b.t * 30); b.face = ex >= b.x0 ? 1 : -1;
        if (b.t >= cfg.birdOut) this.bird = null;
      }
      if (this.bird) b.frame = b.sing > 0 ? 'bird_sing' : 'bird';
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
  P._twins = function () {
    var i, o;
    for (i = 0; i < this.mats.length; i++) this._twinMat(this.mats[i]);
    for (i = 0; i < this.drops.length; i++) { o = this.drops[i]; o._px = o.x; o._py = o.y; }
    var r = this.rocket;
    r._px = r.x; r._py = r.y; r._prot = r.rot; r._paim = r.aim; r._pchute = r.chute; r._pswing = r.swing; r._psx = r.sx; r._psy = r.sy; r._pchuteRot = r.chuteRot; r._pnoseX = r.noseX; r._pnoseY = r.noseY;
    var n = this.mimi;
    n._px = n.x; n._py = n.y; n._psx = n.sx; n._psy = n.sy; n._plean = n.lean;
    this.pump._ppress = this.pump.press;
    if (this.flyer) { o = this.flyer; o._px = o.x; o._py = o.y; o._ps = o.s; o._prot = o.rot; }
    if (this.marmot) { o = this.marmot; o._px = o.x; o._py = o.y; o._prise = o.rise; o._pjump = o.jump; }
    if (this.goat) { o = this.goat; o._px = o.x; o._py = o.y; o._phop = o.hop; }
    if (this.bird) { o = this.bird; o._px = o.x; o._py = o.y; }
    if (this.hintHand) { this.hintHand._px = this.hintHand.x; this.hintHand._py = this.hintHand.y; }
    if (this.wipe) this.wipe._pt = this.wipe.t;
    if (this.fountain) this.fountain._ph = this.fountain.h;
  };
  P._step = function (h) {
    var cfg = this.cfg;
    this._twins();
    this.time += h; this.stateTime += h; this.phaseTime += h;
    var inChapter = this.state === 'intro' || this.state === 'round' || this.state === 'roundDone' || this.state === 'talk' || this.state === 'levelDone';
    this.wind = this.windModel.step(h, this.weather) + this._breezeExt;
    this.gust = this.windModel.gust;
    var ge = this.windModel.drain();
    for (var gi = 0; gi < ge.length; gi++) if (inChapter) { var c = this._meadowCentre(); this._emit({ type: 'gust', dir: ge[gi].dir, x: c.x, y: c.y }); }
    switch (this.state) {
      case 'intro': if (this.stateTime >= cfg.introTime) { this._prepareRound(); this._beginUnfold(true); } break;
      case 'round': this._stepRound(h); break;
      case 'roundDone':
        if (this.phase === 'camp') { this._stepCamp(h); if (this.stateTime >= cfg.cheerHold) this._startWipe(); }
        break;
      case 'talk':
        if (this.talkAnswered) { if (this.stateTime >= cfg.talkAfterAnswer) this._levelDone(); break; }
        this._talkAskT += h;
        if (this._talkAsks < cfg.talkMaxAsks && this._talkAskT >= cfg.talkAskTime - 1e-9) {
          this._talkAskT = 0; this._talkAsks++;
          if (this._talkAsks >= cfg.talkGlowAfterAsks) this.talk.glowAnswer = true;
          this._emit({ type: 'talkAsk', talk: this.talk, n: this._talkAsks, glowAnswer: this.talk.glowAnswer });
        } else if (this._talkAsks >= cfg.talkMaxAsks && this._talkAskT >= cfg.talkGiveUp - 1e-9) this.talkAnswer(this.talk.answer, true);   // Mimi answers
        break;
      case 'levelDone':
        if (this.stateTime >= cfg.levelDoneTime) {
          if (this.level < this.levels.length - 1) this.startLevel(this.level + 1);
          else {
            this._setState('sessionDone'); this.phase = null;
            this.lastTopics = this.levels.slice();
            this._mood('dance', 1e9);
            this._emit({ type: 'sessionDone', stars: this.stars });
          }
        }
        break;
    }
    this._stepWipe(h);
    this._stepPump(h);
    this._stepFlight(h);
    this._stepRocket(h);
    this._stepMats(h);
    this._stepFlyer(h);
    this._stepPennants(h);
    this._stepSurprises(h);
    this._stepHint(h);
    this._stepWater(h);
    this._stepMimi(h);
    if (this.arc) {
      var on = this.phase === 'aim' || this.phase === 'pump';
      this.arcAlpha = clamp(this.arcAlpha + (on ? h : -h) / cfg.arcFade, 0, 1);
      if (!on && this.arcAlpha <= 0) this.arc = null;
    }
  };
  P._stepRound = function (h) {
    var cfg = this.cfg;
    switch (this.phase) {
      case 'play':
        if (this.interactive && !this._g) {
          this._idleT += h;
          if (this._idleT >= this._idleGap - 1e-9) {
            this._idleT = 0; this._idleGap = Math.min(cfg.idleMax, this._idleGap * cfg.idleBackoff); this._idleN++;
            this._mood('think');
            var M = this._head();
            this._emit({ type: 'idle', n: this._idleN, promptKey: this.cur.promptKey, params: this.cur.params, rule: this.cur.rule, left: this.cur.k - this.launch, mode: this.cur.mode, x: M.x, y: M.y });
            if (this._idleN >= cfg.idleHintFrom) this._autoHint(true);
          }
        }
        break;
      case 'aim': if (this.phaseTime >= cfg.aimTime - 1e-9 && !this._mhop && this.rocket.state === 'aim' && this.mimi.onPump) this._beginPump(); break;
      case 'collect': this._stepCollect(h); break;
      case 'camp': this._stepCamp(h); break;
    }
  };

  DK.World = World;
  DK.WindModel = WindModel;
})(window.DK = window.DK || {});
