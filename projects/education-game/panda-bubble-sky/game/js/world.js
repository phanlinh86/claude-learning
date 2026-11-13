/* Bao's Bubble Sky — PB.CONFIG + PB.World + PB.WindModel (headless, deterministic floating-bubble simulation; DESIGN §2, §5.2)
 *
 * ============================== CONVENTIONS ==============================
 *  Units: logical px (short side 720), seconds, radians, y DOWN, rot > 0 clockwise. Screen space = world space (no camera).
 *  update(dt) runs fixed sub-steps of cfg.step (1/120 s). At the START of every sub-step every moving field is copied into its
 *  `_p` twin; render v = _v + (v − _v)·w.alpha.  Full render contract + event table: docs/MECHANICS.md.
 *
 *  BUBBLES w.bubbles[] (blow order) = { id, i, thing, target, x, y (CENTRE), vx, vy, r (current radius), R (full radius = d/2),
 *    hx, hy (home), wx, wy (the wandering home point), state 'wait'|'grow'|'float'|'pop'|'freed'|'away'|'gone', grow 0..1,
 *    wob (membrane stretch, −0.3..0.3), wobV, wobA (stretch axis, rad), glow 0..1, rot (thing rotation), popT 0..1, alpha 0..1,
 *    t (own clock: rim shimmer), perched (a bird sits on it),
 *    freed thing: fstate null|'hop'|'count'|'badge'|'fly'|'done', fx, fy (thing CENTRE), fs (scale of thingSize), fr (rot),
 *    fq (squash: sx = 1 + fq, sy = 1/(1 + fq)), ft (time in fstate), count (stars counted so far, −1 = none), badge
 *    {home, a, x, y} | null, piece (rainbow piece index) }  + _px _py _pr _pwob _prot _palpha _pfx _pfy _pfs _pfr _pfq _pgrow.
 * ========================================================================
 */
(function (PB) {
  'use strict';

  var CONFIG = {
    // ---- timing / state machine (s)
    step: 1 / 120, maxFrame: 1.0,
    roundsPerLevel: 4, chapterTimeLimit: 75, chapterMinRounds: 3,
    shortBudget: [1e9, 26, 44, 60],   // s into the chapter: a round starting later than this is short (4 bubbles, k 1)
    introTime: 2.5, levelDoneTime: 3.6,
    talkAfterAnswer: 1.6, talkAskTime: 12, talkGlowAfterAsks: 2, talkMaxAsks: 3, talkGiveUp: 2,

    // ---- layout (DESIGN §2; px)
    shortSide: 720, minLong: 960, maxLong: 1600, tallRatio: 1.6, phoneRatio: 1.9,
    groundLand: 14, groundPort: 26,
    bubbleX: 24, bubbleYLand: 18, bubbleMaxW: 560, bubbleRight: 200, bubbleHLand: 134, bubbleYPort: 110, bubbleHPort: 124,
    hudW: 160, hudH: 96, bubbleMinW: 220,
    baoXLand: 130, baoXPort: 120, baoHLand: 240, baoHPort: 220, baoFeet: 4, baoPad: 10, baoBoxL: 0.38, baoBoxR: 0.42, baoBoxTop: 0.94,
    dBase: { 3: 150, 4: 150, 5: 138, 6: 126, 7: 126 }, dMin: 112, dStep: 4, tallK: 1.1, homeGap: 22, keepGap: 44, homeGrid: 10,
    fieldK: 0.55, fieldTopLand: 16, fieldBotLand: 30, fieldSide: 20, fieldTopPort: 20, fieldBaoK: 0.5, fieldBaoGap: 10, fieldBonusK: 0.3,
    keepPad: 14, baoKeepPad: 14, homeTries: 8, homeBest: 14,   // ≥ wander 10 + bob ≈ 2.5 px: a resting bubble never touches them
    rainbowDy: 30, rainbowPortraitLift: 24, rainbowPadK: 0.4, rainbowTopGap: 30, rainbowWK: 0.16, rainbowW: [40, 70],
    hitK: 0.6, hitPad: 14, hitPhone: 92, thingK: 0.62,

    // ---- floating (a speed-capped soft spring to a wandering home + buoyancy + wind + soft collisions + walls)
    homeOmega: 2.4, homeZeta: 0.55, homeAccMax: 650, floatVMax: 560, vHard: 1500,
    wander: 10, wanderP: [3, 5], bobAcc: 14, bobHz: [0.45, 0.75], windK: 2.5,
    collGap: 6, collK: 90, collE: 0.35, collWobK: 0.0007, collWobMax: 0.12, bumpMinV: 40, bumpEvery: 0.12,
    wallK: 120, wallDamp: 6,
    wobOmega: 13, wobZeta: 0.12, wobMax: 0.3, rotOmega: 6, rotZeta: 0.3, rotLag: 0.0005, rotMax: 0.2,
    wigOmega: 16, wigZeta: 0.22,

    // ---- blow (DESIGN §5.2)
    blowLead: 0.5, blowEach: 0.5, growTime: 0.35, growR0: 0.3, detachV: [380, 520], detachWob: 0.22, askAfterBlow: 0.4, rainbowIn: 0.5,

    // ---- right: pop, freed thing, rainbow
    popTime: 0.22, dropN: 14, dropV: [160, 340], dropG: 900, dropLife: 0.6, dropR: [4, 9], dropCap: 60,
    hopH: 46, hopTime: 0.28, hopSquash: 0.16, flyTime: 0.75, flyApex: 80, flyScale: 0.35, flySpin: 0.5,
    countDelay: 0.3, countStep: 0.45, countTail: 0.35, badgeHold: 0.9, badgeRate: 6, paintTime: 0.45,

    // ---- wrong / soft / Bao poke
    wrongWob: 0.28, wrongImpulse: 260, wrongRot: 0.25, sameWrongWindow: 1.0, brushWob: 0.12, brushImpulse: 120,
    miniN: 5, miniLife: [0.6, 1.1], miniR: [5, 11], miniCap: 40, pokeMinis: 3,

    // ---- help (DESIGN §5.2 / skill rules)
    hintAfterMisses: 2, hintAfterSoft: 3, assistAfter: 6, hintTime: 3.2, hintCooldown: 6, hintCycle: 1.6,
    idleTime: 12, idleBackoff: 1.5, idleMax: 30, idleHintFrom: 2, flickTime: 0.25, tapMovePx: 24,

    // ---- rainbow / whoosh / out
    rainbowTime: 1.4, shineTime: 1.2, whooshTime: 2.2, whooshMin: 1.0, whooshAy: 600, whooshK: 1.7, whooshAx: 0.45, whooshRamp: 0.3,
    whooshStagger: 2600, whooshDelayMax: 0.45, whooshSoftPop: 0.5, whooshWob: 0.12, outTime: 0.6,

    // ---- surprises: one round per chapter (round 1 or 2, never the warm-up); chapters 0–2 rotate bird / kite, winter = snow
    surpriseRounds: [1, 2], surpriseTypes: ['bird', 'kite'], winterSurprise: 'snow', winterLevel: 3, surpriseAt: [2, 5],
    birdIn: 1.8, birdPerch: 3, birdOut: 1.6, birdPass: 3.6, birdLoop: 1.0, birdLoopR: 46, birdR: 52, birdDip: 70, birdWave: 14, birdAbove: 18,
    kiteIn: 2.0, kiteStay: 8, kiteOut: 2.0, kiteLoop: 1.2, kiteR: 64,
    snowN: 5, snowR: 36, snowV: 42, snowFall: 12, snowStagger: 0.7, snowTwinkle: 0.5, snowMinis: 6,

    // ---- wind (PB.WindModel): px/s² horizontal force; × windK on the bubbles
    breeze: [6, 6, 8, 10], gustEvery: [6, 10], gustFirst: [3, 6], gustAmp: [40, 60], gustTime: 1.5, gustWob: 0.08,

    // ---- Bao
    moodTime: { happy: 0.9, cheer: 1.6, oops: 0.8, think: 1.4, talk: 1.0, wave: 1.4, giggle: 1.0, blow: 1.0, dance: 2.0 },
    bounceTime: 0.42, lookRate: 6, blink: [2.2, 5], blinkTime: 0.13
  };
  PB.CONFIG = CONFIG;

  var TAU = Math.PI * 2;
  var BAO_DEFAULT = { feet: [150, 292], ring: [250, 120], blowRing: [214, 104], ringR: 26, mouth: [184, 148] };
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
  function boxDist(b, x, y) { var dx = Math.max(b.x - x, 0, x - b.x - b.w), dy = Math.max(b.y - y, 0, y - b.y - b.h); return hyp(dx, dy); }
  /** Initial velocity that gives a damped spring (ω, ζ) released from 0 a first peak of `peak`. */
  function kickFor(peak, w, z) { var s = Math.sqrt(1 - z * z); return peak * w * Math.exp(z / s * Math.atan2(s, z)); }
  function spring(o, k, kv, target, w, z, h) { o[kv] += (w * w * (target - o[k]) - 2 * z * w * o[kv]) * h; o[k] += o[kv] * h; }
  function baoPoints() { var p = PB.BAO_POINTS || {}; return { feet: p.feet || BAO_DEFAULT.feet, ring: p.ring || BAO_DEFAULT.ring, blowRing: p.blowRing || BAO_DEFAULT.blowRing, ringR: p.ringR || BAO_DEFAULT.ringR, mouth: p.mouth || BAO_DEFAULT.mouth }; }
  /** Quadratic Bézier flight {x0, y0, cx, cy, x1, y1, T}: the apex lies ≥ H px above the straight line (control point lifted 2H). */
  function flight(x0, y0, x1, y1, T, H) {
    var mx = (x0 + x1) / 2, my = (y0 + y1) / 2, dx = x1 - x0, dy = y1 - y0, L = hyp(dx, dy) || 1, nx = dy / L, ny = -dx / L;
    if (ny > 0) { nx = -nx; ny = -ny; }   // the normal that points UP
    if (Math.abs(ny) < 0.3) { nx = 0; ny = -1; }   // a near-vertical chord: lift straight up
    var lift = 2 * Math.max(H, 0.22 * L);
    return { x0: x0, y0: y0, cx: mx + nx * lift, cy: my + ny * lift, x1: x1, y1: y1, T: Math.max(0.05, T) };
  }
  function flightAt(f, s) { var a = (1 - s) * (1 - s), b = 2 * s * (1 - s), c = s * s; return { x: a * f.x0 + b * f.cx + c * f.x1, y: a * f.y0 + b * f.cy + c * f.y1 }; }
  /** A point on the rainbow's band centre line at fill position f ∈ [0, k] (0 = the left foot, k = the right foot). */
  function rainbowPoint(rb, k, f) {
    var th = Math.PI * (1 - clamp(f / Math.max(1, k), 0, 1)), rr = rb.r - rb.w / 2;
    return { x: rb.cx + rr * Math.cos(th), y: rb.cy - rr * Math.sin(th), a: th };
  }

  /** DESIGN §2 short-side rule: CSS viewport → logical W×H. */
  function logicalSize(cssW, cssH, cfg) {
    cfg = cfg || CONFIG;
    var S = cfg.shortSide, aspect = cssW / Math.max(1, cssH);
    if (cssW >= cssH) return { W: clamp(Math.round(S * aspect), cfg.minLong, cfg.maxLong), H: S };
    return { W: S, H: clamp(Math.round(S / aspect), cfg.minLong, cfg.maxLong) };
  }
  function ageKey(age) { return clamp(Math.round(+age || 4), 3, 7); }

  /* ---------------------------------------------------------------- wind (DESIGN §5.3)
   * Deterministic. spring / summer: a gentle ±6 breeze, autumn ±8 + gusts every 6–10 s (±40–60, 1.5 s, event `gust {dir}`),
   * winter ±10. `wind` px/s² horizontal; `gust` 0..1 envelope, `gustDir` ±1. PB.Weather follows a world's model via
   * weather.windSource = world (else it runs its own copy). */
  function WindModel(seed, cfg) {
    this.cfg = cfg || CONFIG; this.rng = new PB.RNG(seed === undefined ? 5 : seed);
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
   * computeLayout(W, H, ins, cfg, age, hudKeep, n, seed): the bubble diameter d is the largest of (age base × 1.1 when tall),
   * the age base, then −4 px steps down to 112, for which n homes fit (n points ≥ d + 22 apart among the valid resting centres,
   * checked by farthest-point sampling from the four field corners); the homes themselves are a seeded best-candidate sample
   * (DESIGN: "farthest-point sampling … seeded per round"), sorted farthest-from-the-wand first (bubble i = homes[i]). */
  var _cache = {}, _cacheN = 0, _cfgId = 0;
  function cfgKey(cfg) { if (!cfg.__id) Object.defineProperty(cfg, '__id', { value: ++_cfgId, enumerable: false }); return cfg.__id; }
  function hudBox(hk, W, H) { var best = null; for (var i = 0; i < hk.length; i++) { var b = hk[i]; if (b.x + b.w / 2 > W / 2 && b.y < H / 2 && (!best || b.y + b.h > best.y + best.h)) best = b; } return best; }
  function baseLayout(W, H, ins, cfg, hudKeep) {
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
    var hud = { x: W - ins.right - cfg.hudW, y: 0, w: cfg.hudW + ins.right, h: ins.top + cfg.hudH };
    var bh = portrait ? cfg.baoHPort : cfg.baoHLand, s = bh / 300, BP = baoPoints();
    var bao = { x: ins.left + (portrait ? cfg.baoXPort : cfg.baoXLand), y: groundY - cfg.baoFeet, h: bh, s: s };
    function pt(p, r) { return { x: bao.x + (p[0] - BP.feet[0]) * s, y: bao.y + (p[1] - BP.feet[1]) * s, r: r }; }
    bao.ring = pt(BP.ring, BP.ringR * s); bao.blowRing = pt(BP.blowRing, BP.ringR * s); bao.mouth = pt(BP.mouth, 0);
    var bl = bao.x - cfg.baoBoxL * bh - cfg.baoPad, br = Math.max(bao.x + cfg.baoBoxR * bh, bao.ring.x + bao.ring.r) + cfg.baoPad;
    var bt = Math.min(bao.y - cfg.baoBoxTop * bh, bao.ring.y - bao.ring.r) - cfg.baoPad;
    bao.box = { x: bl, y: bt, w: br - bl, h: bao.y + cfg.baoPad - bt };
    bao.w = bao.box.w - 2 * cfg.baoPad;
    var L = { W: W, H: H, ins: ins, portrait: portrait, tall: tall, phone: phone, groundY: groundY, bubble: bubble, hud: hud, bao: bao,
      safe: { x: ins.left, y: ins.top, w: W - ins.left - ins.right, h: H - ins.bottom - ins.top } };
    L.keep = [{ x: bubble.x, y: bubble.y, w: bubble.w, h: bubble.h, kind: 'bubble' }, { x: hud.x, y: hud.y, w: hud.w, h: hud.h, kind: 'hud' }];
    hk.forEach(function (b) { b.kind = 'hudKeep'; L.keep.push(b); });
    L.lowKeep = hk.filter(function (b) { return b.y > H / 2; });
    return L;
  }
  function fieldFor(L, d, cfg) {
    var b = L.bao.box, bb = L.bubble.y + L.bubble.h, K = cfg.fieldK, ins = L.ins, f;
    if (!L.portrait) f = { x0: b.x + b.w + K * d, x1: L.W - ins.right - K * d - cfg.fieldSide, y0: bb + K * d + cfg.fieldTopLand, y1: L.groundY - K * d - cfg.fieldBotLand };
    else {
      f = { x0: ins.left + K * d + cfg.fieldSide, x1: L.W - ins.right - K * d - cfg.fieldSide, y0: bb + K * d + cfg.fieldTopPort, y1: b.y - cfg.fieldBaoK * d - cfg.fieldBaoGap };
      f.bonusX0 = b.x + b.w + K * d; f.bonusY1 = f.y1 + cfg.fieldBonusK * d;   // the bottom row may come down right of Bao
    }
    return f;
  }
  /** May a bubble of radius r rest with its centre at (x, y)? (never under the speech bubble / HUD / hudKeep, clear of Bao's box,
   *  ≥ 44 px above the bottom keep-outs, inside the safe screen) */
  function okHome(L, x, y, r, cfg) {
    var i, b;
    for (i = 0; i < L.keep.length; i++) if (boxDist(L.keep[i], x, y) < r + cfg.keepPad) return false;
    if (boxDist(L.bao.box, x, y) < r + cfg.baoKeepPad) return false;
    for (i = 0; i < L.lowKeep.length; i++) { b = L.lowKeep[i]; if (x + r > b.x && x - r < b.x + b.w && y + r > b.y - cfg.keepGap) return false; }
    if (x - r < L.ins.left + 4 || x + r > L.W - L.ins.right - 4 || y - r < L.ins.top + 4 || y + r > L.groundY - 6) return false;
    return true;
  }
  function candidates(L, f, d, cfg) {
    var out = [], g = cfg.homeGrid, r = d / 2, x, y;
    var yMax = f.bonusY1 !== undefined ? f.bonusY1 : f.y1;
    for (y = f.y0; y <= yMax + 1e-6; y += g) for (x = f.x0; x <= f.x1 + 1e-6; x += g) {
      if (y > f.y1 && !(f.bonusX0 !== undefined && x >= f.bonusX0)) continue;
      if (okHome(L, x, y, r, cfg)) out.push(x, y);
    }
    return out;   // flat [x0, y0, x1, y1, …]
  }
  /** Farthest-point sampling over flat candidates from index s: n points or null when they cannot be ≥ minD apart. */
  function fps(c, s, n, minD) {
    var m = c.length / 2, md = new Float64Array(m), pts = [c[2 * s], c[2 * s + 1]], i, j;
    for (i = 0; i < m; i++) md[i] = hyp(c[2 * i] - pts[0], c[2 * i + 1] - pts[1]);
    for (j = 1; j < n; j++) {
      var bi = -1, bd = -1;
      for (i = 0; i < m; i++) if (md[i] > bd) { bd = md[i]; bi = i; }
      if (bd < minD) return null;
      var px = c[2 * bi], py = c[2 * bi + 1]; pts.push(px, py);
      for (i = 0; i < m; i++) { var dd = hyp(c[2 * i] - px, c[2 * i + 1] - py); if (dd < md[i]) md[i] = dd; }
    }
    return pts;
  }
  function cornerStarts(c) {
    var m = c.length / 2, best = [0, 0, 0, 0], sc = [1e18, -1e18, 1e18, -1e18];
    for (var i = 0; i < m; i++) {
      var x = c[2 * i], y = c[2 * i + 1];
      if (x + y < sc[0]) { sc[0] = x + y; best[0] = i; }
      if (x - y > sc[1]) { sc[1] = x - y; best[1] = i; }
      if (x - y < sc[2]) { sc[2] = x - y; best[2] = i; }
      if (x + y > sc[3]) { sc[3] = x + y; best[3] = i; }
    }
    return best;
  }
  /** Regular lattices (square + hex, a few offsets) of valid resting centres exactly minD apart: [[x0, y0, x1, y1, …], …] with ≥ n
   *  points each (a tight field where greedy sampling misses the packing: 9 bubbles on an iPad with insets). */
  function lattices(L, f, d, n, minD, cfg) {
    var out = [], s = minD + 0.5, r = d / 2, yMax = f.bonusY1 !== undefined ? f.bonusY1 : f.y1;
    var offs = [0, 0.25, 0.5, 0.75];
    for (var hex = 0; hex < 2; hex++) for (var a = 0; a < offs.length; a++) for (var b = 0; b < offs.length; b++) {
      var dy = hex ? s * Math.sqrt(3) / 2 : s, pts = [], row = 0;
      for (var y = f.y0 + offs[b] * dy; y <= yMax + 1e-6; y += dy, row++) {
        var sh = hex && row % 2 ? s / 2 : 0;
        for (var x = f.x0 + ((offs[a] * s + sh) % s); x <= f.x1 + 1e-6; x += s) {
          if (y > f.y1 && !(f.bonusX0 !== undefined && x >= f.bonusX0)) continue;
          if (okHome(L, x, y, r, cfg)) pts.push(x, y);
        }
      }
      if (pts.length >= 2 * n) out.push(pts);
    }
    return out;
  }
  function fitsN(c, n, minD) {
    if (c.length / 2 < n) return null;
    if (n <= 1) return [c[0], c[1]];
    var st = cornerStarts(c);
    for (var k = 0; k < st.length; k++) { var p = fps(c, st[k], n, minD); if (p) return p; }
    return null;
  }
  /** The d tier for (viewport, age, n): cached; {d, field, cands, fits, fallback (fps points)}. */
  function sizeTier(L, cfg, a, n, hkKey) {
    var key = cfgKey(cfg) + '|' + L.W + 'x' + L.H + '|' + JSON.stringify(L.ins) + '|' + a + '|' + n + '|' + hkKey;
    if (_cache[key]) return _cache[key];
    var base = cfg.dBase[a], tiers = [];
    if (L.tall) tiers.push(Math.round(base * cfg.tallK));
    for (var d = base; d >= cfg.dMin; d -= cfg.dStep) tiers.push(d);
    if (tiers[tiers.length - 1] !== cfg.dMin) tiers.push(cfg.dMin);
    var res = null;
    for (var t = 0; t < tiers.length && !res; t++) {
      var f = fieldFor(L, tiers[t], cfg), c = candidates(L, f, tiers[t], cfg), p = fitsN(c, n, tiers[t] + cfg.homeGap), lat = null;
      if (!p) { lat = lattices(L, f, tiers[t], n, tiers[t] + cfg.homeGap, cfg); if (lat.length) p = fps(lat[0], cornerStarts(lat[0])[0], n, 0); }
      if (p) res = { d: tiers[t], field: f, cands: c, fits: true, fallback: p, lattices: lat };
    }
    if (!res) {   // an odd viewport: the smallest tier, spread as far as possible (never an Apple device; unit-tested)
      var dm = cfg.dMin, fm = fieldFor(L, dm, cfg), cm = candidates(L, fm, dm, cfg);
      if (cm.length < 2) cm = [(fm.x0 + fm.x1) / 2, (fm.y0 + fm.y1) / 2];
      res = { d: dm, field: fm, cands: cm, fits: false, fallback: fps(cm, cornerStarts(cm)[0], Math.min(n, cm.length / 2), 0) || [cm[0], cm[1]] };
    }
    if (++_cacheN > 400) { _cache = {}; _cacheN = 0; }
    _cache[key] = res;
    return res;
  }
  /** Seeded best-candidate homes (n points ≥ minD apart); falls back to the farthest-point set. */
  function seededHomes(c, n, minD, seed, tries, best, fallback) {
    var m = c.length / 2, rng = new PB.RNG(seed >>> 0 || 1);
    for (var t = 0; t < tries; t++) {
      var pts = [], s = rng.int(0, m - 1);
      pts.push(c[2 * s], c[2 * s + 1]);
      var ok = true;
      for (var j = 1; j < n && ok; j++) {
        var bx = 0, by = 0, bd = -1, q, i;
        for (q = 0; q < best; q++) {
          i = rng.int(0, m - 1);
          var dd = minDist(pts, c[2 * i], c[2 * i + 1]);
          if (dd > bd) { bd = dd; bx = c[2 * i]; by = c[2 * i + 1]; }
        }
        if (bd < minD) {   // scan everything for room: a random one of the free spots
          var free = [];
          for (i = 0; i < m; i++) if (minDist(pts, c[2 * i], c[2 * i + 1]) >= minD) free.push(i);
          if (free.length) { i = free[rng.int(0, free.length - 1)]; bd = minD; bx = c[2 * i]; by = c[2 * i + 1]; }
        }
        if (bd < minD) ok = false; else pts.push(bx, by);
      }
      if (ok) return pts;
    }
    return fallback.slice(0, 2 * n);
  }
  function minDist(pts, x, y) { var m = 1e9; for (var k = 0; k < pts.length; k += 2) { var d = hyp(pts[k] - x, pts[k + 1] - y); if (d < m) m = d; } return m; }
  function computeLayout(W, H, ins, cfg, age, hudKeep, n, seed) {
    var a = ageKey(age);
    n = clamp(Math.round(n || 5), 1, 9);
    var L = baseLayout(W, H, ins, cfg, hudKeep), hkKey = JSON.stringify(keepBoxes(hudKeep));
    var T = sizeTier(L, cfg, a, n, hkKey), d = T.d;
    var sd = seed === undefined ? 1 : seed, pts;
    if (T.fits && T.lattices) {   // tight: a seeded lattice + a seeded spread subset of it
      var lr = new PB.RNG((sd ^ 0x1a77) >>> 0 || 3), lat = T.lattices[lr.int(0, T.lattices.length - 1)];
      pts = fps(lat, lr.int(0, lat.length / 2 - 1), n, 0) || T.fallback.slice();
    } else pts = T.fits ? seededHomes(T.cands, n, d + cfg.homeGap, sd, cfg.homeTries, cfg.homeBest, T.fallback) : T.fallback.slice();
    var homes = [];
    for (var k = 0; k < pts.length; k += 2) homes.push({ x: pts[k], y: pts[k + 1] });
    while (homes.length < n) homes.push({ x: (T.field.x0 + T.field.x1) / 2, y: (T.field.y0 + T.field.y1) / 2 });
    var ring = L.bao.blowRing;
    homes.sort(function (p, q) { return hyp(q.x - ring.x, q.y - ring.y) - hyp(p.x - ring.x, p.y - ring.y); });
    var f = T.field, bb = L.bubble.y + L.bubble.h;
    // integrator fix (docs/reports/integration.md): in portrait the arch's feet stand on the clouds just above Bao's head
    // (cy = Bao's box top + rainbowPortraitLift) — at groundY + 30 the whole arch hid in the tall cloud floor and the first
    // piece's landing point sat behind Bao. Landscape is unchanged (DESIGN §2).
    var rcy = L.groundY + cfg.rainbowDy;
    if (L.portrait && cfg.rainbowPortraitLift != null) rcy = Math.min(rcy, L.bao.box.y + cfg.rainbowPortraitLift);
    var rr = Math.min(0.5 * (f.x1 - f.x0) + cfg.rainbowPadK * d, Math.min(L.groundY, rcy) - bb - cfg.rainbowTopGap);
    L.field = f; L.homes = homes; L.d = d; L.R = d / 2; L.n = n; L.fits = T.fits; L.seed = seed;
    L.rainbow = { cx: (f.x0 + f.x1) / 2, cy: rcy, r: rr, w: clamp(cfg.rainbowWK * rr, cfg.rainbowW[0], cfg.rainbowW[1]) };
    L.hitR = cfg.hitK * d + cfg.hitPad;
    if (L.phone) L.hitR = Math.max(L.hitR, cfg.hitPhone);
    L.thingSize = cfg.thingK * d;
    L.walls = { x0: L.ins.left + 4, x1: W - L.ins.right - 4, y0: Math.max(L.ins.top + 4, bb + 6), y1: L.groundY - 4 };
    return L;
  }

  // ------------------------------------------------------------------ World
  function World(opts) {
    opts = opts || {};
    this.cfg = merge(CONFIG, opts.config);
    this.seed = opts.seed !== undefined ? opts.seed : 1;
    this.rng = new PB.RNG(this.seed);
    this._crng = new PB.RNG((PB.RNG.hash(this.seed) ^ 0x51ed27) >>> 0);   // cosmetic randomness (motion phases, blinks, surprise spots)
    this.windModel = new WindModel((PB.RNG.hash(this.seed) ^ 0x2a7e11) >>> 0, this.cfg);
    this.age = PB.Content.ageOf(opts.age !== undefined ? opts.age : 4);
    this.lang = opts.lang === 'vi' ? 'vi' : 'en';
    this._pendingAge = this.age; this._pendingLang = this.lang;
    this.state = 'menu'; this.phase = null;
    this.level = 0; this.levels = []; this.topic = null; this.weather = 0;
    this.round = 0; this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.stars = 0; this.levelStars = 0; this.roundStars = 0; this.misses = 0; this.streak = 0;
    this.time = 0; this.stateTime = 0; this.phaseTime = 0; this.alpha = 0; this._acc = 0;
    this.cur = null; this.talk = null; this.talkAnswered = null;
    this.bubbles = []; this.drops = []; this.minis = []; this.snowflakes = [];
    this.bird = null; this.kite = null; this.hintHand = null; this.assistId = null;
    this.rainbow = { k: 1, filled: 0, _pfilled: 0, arrived: 0, shine: 0, _pshine: 0, alpha: 0, _palpha: 0, guide: 0 };
    this.bao = { x: 0, y: 0, h: 240, w: 200, mood: 'idle', moodT: 0, blinkT: 3, blink: false, look: 0, lookX: 0, bounce: 0, _pbounce: 0, _bT: -1 };
    this.finger = { x: 0, y: 0, down: false };
    this.wind = 0; this.gust = 0;
    this.hudKeep = opts.hudKeep || null; this.lastTopics = null; this.surprise = null; this._surpriseOff = 0; this._surpriseRound = 1;
    this.events = []; this.sessions = 0;
    this._idleN = 0; this._idleT = 0; this._idleGap = this.cfg.idleTime; this._lastHintT = -1e9; this.levelStartTime = 0;
    this._talkAskT = 0; this._talkAsks = 0; this._g = null; this._noProg = 0; this._popped = 0; this._lastBumpT = -1e9;
    this._usedKeys = []; this._prevRule = null; this._view = null; this._vp = null; this._lookT = 0; this._lookX = 0;
    this._surpriseAt = -1; this._lastDetachT = -1; this._roundAssisted = false; this._askedFirst = false;
    this.setViewport(opts.width || 1280, opts.height || 720, opts.ins || null);
  }
  World.logicalSize = logicalSize;
  World.computeLayout = function (W, H, ins, cfg, age, hudKeep, n, seed) { return computeLayout(W, H, ins, merge(CONFIG, cfg), age === undefined ? 4 : age, hudKeep, n, seed); };
  World.kickFor = kickFor;
  World.flight = flight;
  World.flightAt = flightAt;
  World.rainbowPoint = rainbowPoint;
  World.okHome = function (L, x, y, r, cfg) { return okHome(L, x, y, r, merge(CONFIG, cfg)); };

  var P = World.prototype;
  Object.defineProperty(P, 'interactive', { get: function () { return this.state === 'round' && this.phase === 'play' && !!this.cur && this._popped < this.cur.k; } });
  P._emit = function (e) { this.events.push(e); };
  P.drainEvents = function () { var e = this.events; this.events = []; return e; };
  P.setAge = function (a) { this._pendingAge = PB.Content.ageOf(a); };
  P.setLang = function (l) { this._pendingLang = l === 'vi' ? 'vi' : 'en'; };
  P._setState = function (s) { this.state = s; this.stateTime = 0; };
  P._setPhase = function (p) { this.phase = p; this.phaseTime = 0; };
  P._mood = function (m, t) { this.bao.mood = m; this.bao.moodT = t || this.cfg.moodTime[m] || 1; };
  P._bounce = function () { this.bao._bT = 0; };
  P.skipTalk = function () { if (this.state === 'talk') this._levelDone(); };
  P.bubbleById = function (id) { for (var i = 0; i < this.bubbles.length; i++) if (this.bubbles[i].id === id) return this.bubbles[i]; return null; };
  P._fieldCentre = function () { var f = this.layout.field; return { x: (f.x0 + f.x1) / 2, y: (f.y0 + f.y1) / 2 }; };
  P._isTarget = function (b) { return !!this.cur && (this.cur.mode === 'countPop' ? this._popped < this.cur.k : b.target); };

  /** The current question while it can be answered (round / play, not all popped), else null. */
  P.prompt = function () {
    if (!this.interactive) return null;
    var c = this.cur;
    return { promptKey: c.promptKey, params: c.params, rule: c.rule, nameKind: c.rule.nameKind, nameValue: c.rule.value, k: c.k, left: c.k - this._popped, mode: c.mode };
  };

  // ---------------------------------------------------------------- geometry + test hooks (logical px)
  /** The bubble's hit circle {x, y, r: hitR} (where it is now), null unless it floats. */
  P.bubbleHit = function (id) { var b = this.bubbleById(id); return b && b.state === 'float' ? { x: b.x, y: b.y, r: this.layout.hitR, own: b.r } : null; };
  /** The floating bubble under (x, y): nearest centre within hitR → {b, d} | null. */
  P._bubbleAt = function (x, y) {
    var best = null, bd = 1e9, R = this.layout.hitR;
    for (var i = 0; i < this.bubbles.length; i++) {
      var b = this.bubbles[i];
      if (b.state !== 'float') continue;
      var d = hyp(x - b.x, y - b.y);
      if (d <= R && d < bd) { bd = d; best = b; }
    }
    return best ? { b: best, d: bd } : null;
  };
  P._insideOwn = function (x, y) { for (var i = 0; i < this.bubbles.length; i++) { var b = this.bubbles[i]; if (b.state === 'float' && hyp(x - b.x, y - b.y) <= b.r) return true; } return false; };
  /** Bao's tap box {x, y (top-left), w, h, cx, cy}. */
  P.baoHit = function () { var b = this.layout.bao.box; return { x: b.x, y: b.y, w: b.w, h: b.h, cx: b.x + b.w / 2, cy: b.y + b.h / 2 }; };
  P._clearOfKeep = function (x, y, r) { var K = this.layout.keep; for (var k = 0; k < K.length; k++) if (inBox(K[k], x, y, r * 0.5)) return false; return true; };
  P._onScreen = function (x, y, m) { var L = this.layout; m = m || 0; return x >= L.ins.left + m && x <= L.W - L.ins.right - m && y >= L.ins.top + m && y <= L.H - L.ins.bottom - m; };
  /** A tappable point of the surprise: never inside a bubble's own radius, never under the speech bubble / HUD (test hooks). */
  P._freeHit = function (x, y, r) {
    if (!this._onScreen(x, y, 10) || !this._clearOfKeep(x, y, 0)) return null;
    var pts = [[0, 0], [0, -0.6], [0.6, 0], [-0.6, 0], [0, 0.6], [0.45, -0.45], [-0.45, -0.45], [0.45, 0.45], [-0.45, 0.45]];
    for (var i = 0; i < pts.length; i++) {
      var px = x + pts[i][0] * r, py = y + pts[i][1] * r;
      if (!this._insideOwn(px, py) && this._clearOfKeep(px, py, 0) && this._onScreen(px, py, 6) && !inBox(this.layout.bao.box, px, py)) return { x: px, y: py, r: r, cx: x, cy: y };
    }
    return null;
  };
  P.birdHit = function () { var b = this.bird; if (!b || b.state === 'gone' || b.state === 'loop') return null; return this._freeHit(b.x, b.y, this.cfg.birdR); };
  P.kiteHit = function () { var k = this.kite; if (!k || k.state === 'gone' || k.state === 'loop') return null; return this._freeHit(k.x, k.y, this.cfg.kiteR); };
  P.snowHit = function () {
    for (var i = 0; i < this.snowflakes.length; i++) {
      var f = this.snowflakes[i];
      if (f.state !== 'fall' || f.a < 0.5) continue;
      var h = this._freeHit(f.x, f.y, f.r);
      if (h && hyp(h.x - f.x, h.y - f.y) <= f.r) { h.i = i; return h; }
    }
    return null;
  };
  P._birdAt = function (x, y) { var b = this.bird; return b && b.state !== 'gone' && b.state !== 'loop' && hyp(x - b.x, y - b.y) <= this.cfg.birdR; };
  P._kiteAt = function (x, y) { var k = this.kite; return k && k.state !== 'gone' && k.state !== 'loop' && hyp(x - k.x, y - k.y) <= this.cfg.kiteR; };
  P._snowAt = function (x, y) {
    var best = null, bd = 1e9;
    for (var i = 0; i < this.snowflakes.length; i++) { var f = this.snowflakes[i], d = hyp(x - f.x, y - f.y); if (f.state === 'fall' && f.a > 0.3 && d <= f.r && d < bd) { bd = d; best = f; } }
    return best;
  };
  /** The remaining targets' ids (countPop: every floating bubble until k are popped). */
  P.targets = function () {
    if (!this.interactive) return [];
    var self = this;
    return this.bubbles.filter(function (b) { return b.state === 'float' && self._isTarget(b); }).map(function (b) { return b.id; });
  };
  /** What to touch next: {bubble: id} while interactive (the remaining target nearest the field centre), else null. */
  P.answer = function () {
    if (!this.interactive) return null;
    var b = this._hintTarget();
    return b ? { bubble: b.id } : null;
  };
  P._hintTarget = function () {
    var c = this._fieldCentre(), best = null, bd = 1e9, self = this;
    if (this.assistId) { var a = this.bubbleById(this.assistId); if (a && a.state === 'float') return a; }
    if (this.hintHand) { var hb = this.bubbleById(this.hintHand.id); if (hb && hb.state === 'float') return hb; }
    this.bubbles.forEach(function (b) { if (b.state === 'float' && self._isTarget(b)) { var d = hyp(b.x - c.x, b.y - c.y); if (d < bd) { bd = d; best = b; } } });
    return best;
  };
  P._inField = function (x, y) { var f = this.layout.field, m = this.layout.R; return x >= f.x0 - m && x <= f.x1 + m && y >= f.y0 - m && y <= (f.bonusY1 !== undefined ? f.bonusY1 : f.y1) + m; };

  // ---------------------------------------------------------------- viewport
  P.setViewport = function (W, H, ins) { this._view = { W: W, H: H, ins: insOf(ins) }; this._relayout(false); };
  P._relayout = function (force) {
    var v = this._view, n = this.cur ? this.cur.n : 5, seed = this.cur ? this.cur.seed : 1;
    var key = v.W + 'x' + v.H + ':' + JSON.stringify(v.ins) + ':' + this.age + ':' + n + ':' + seed + ':' + JSON.stringify(this.hudKeep || null);
    if (key === this._vp && !force) return false;
    var had = !!this.layout, prev = this.layout;
    this._vp = key;
    this.layout = computeLayout(v.W, v.H, v.ins, this.cfg, this.age, this.hudKeep, n, seed);
    this.layout.hudKeep = keepBoxes(this.hudKeep);
    var L = this.layout, B = L.bao;
    this.bao.x = B.x; this.bao.y = B.y; this.bao.h = B.h; this.bao.w = B.w;
    var rb = this.rainbow; rb.cx = L.rainbow.cx; rb.cy = L.rainbow.cy; rb.r = L.rainbow.r; rb.w = L.rainbow.w;
    if (had) this._snapAll(prev);
    return true;
  };
  /** Rotation / resize mid-round (DESIGN §5.2): the gesture is cancelled, bubbles get new homes (they drift there; clamped into the
   *  screen), growing ones move to the wand, freed things retarget the new rainbow, drops / minis / surprises are clamped. */
  P._snapAll = function (prev) {
    var L = this.layout, self = this, W = L.walls;
    this.cancelDrag();
    var sx = prev && prev.W ? L.W / prev.W : 1, sy = prev && prev.H ? L.H / prev.H : 1;
    // new homes: floating bubbles take the nearest free home (greedy matching on their scaled position: nobody crosses the
    // field and jams), the others the remaining homes in blow order
    var used = {}, pairs = [], fl = this.bubbles.filter(function (b) { return b.state === 'float'; });
    fl.forEach(function (b) { L.homes.forEach(function (hm, k) { pairs.push({ b: b, k: k, d: hyp(b.x * sx - hm.x, b.y * sy - hm.y) }); }); });
    pairs.sort(function (p, q) { return p.d - q.d; });
    pairs.forEach(function (p) { if (p.b._hk === undefined && !used[p.k]) { p.b._hk = p.k; used[p.k] = 1; } });
    this.bubbles.forEach(function (b) {
      if (b._hk === undefined) { var k = 0; while (used[k] && k < L.homes.length - 1) k++; b._hk = used[b.i] ? k : b.i; used[b._hk] = 1; }
    });
    this.bubbles.forEach(function (b) {
      var hm = L.homes[b._hk] || L.homes[0];
      delete b._hk;
      b.hx = hm.x; b.hy = hm.y; b.R = L.R;
      if (b.state === 'wait' || b.state === 'grow') { self._growPos(b); }
      else if (b.state === 'float' || b.state === 'away') {
        b.r = b.state === 'float' ? b.R : b.r;
        if (b.state === 'float') { b.x = clamp(b.x * sx, W.x0 + b.r, W.x1 - b.r); b.y = clamp(b.y * sy, W.y0 + b.r, W.y1 - b.r); }
        else { b.x *= sx; b.y *= sy; }
      } else if (b.state === 'pop' || b.state === 'freed') { b.x = clamp(b.x * sx, 0, L.W); b.y = clamp(b.y * sy, 0, L.H); }
      if (b.fstate && b.fstate !== 'done') {
        b.fx = clamp(b.fx * sx, L.ins.left + 20, L.W - L.ins.right - 20); b.fy = clamp(b.fy * sy, L.ins.top + 20, L.groundY);
        if (b.fstate === 'fly' && b._f) {
          var T = Math.max(0.25, b._f.T - b.ft), tp = rainbowPoint(self.rainbow, self.rainbow.k, b.piece + 0.5);
          b._f = flight(b.fx, b.fy, tp.x, tp.y, T, cfgApex(self)); b.ft = 0; b._fs0 = b.fs;
        } else { b._fy0 = b.fy; b._fx0 = b.fx; }
        if (b.badge) { b.badge.x = b.fx + b.badge.dx; b.badge.y = b.fy - 0.55 * L.thingSize; }
      }
      self._twin(b);
    });
    this.drops.forEach(function (d) { d.x *= sx; d.y *= sy; d._px = d.x; d._py = d.y; });
    this.minis.forEach(function (d) { d.x *= sx; d.y *= sy; d._px = d.x; d._py = d.y; });
    this.snowflakes.forEach(function (f) { f.x0 = clamp(f.x0 * sx, L.ins.left + f.r, L.W - L.ins.right - f.r); f.x = clamp(f.x * sx, L.ins.left + f.r, L.W - L.ins.right - f.r); f.y *= sy; f._px = f.x; f._py = f.y; });
    if (this.bird) { var bd = this.bird; bd.x *= sx; bd.y *= sy; bd._px = bd.x; bd._py = bd.y; if (bd.path && (bd.state === 'in' || bd.state === 'out' || bd.state === 'pass')) { bd.path = this._birdPath(bd.state, bd); bd.path.x0 = bd.x; bd.path.y0 = bd.y; bd.t = 0; } }
    if (this.kite) { var kt = this.kite; kt.x *= sx; kt.y *= sy; kt._px = kt.x; kt._py = kt.y; this._kiteAnchor(); }
    if (this.hintHand) this._stepHint(0);
  };
  function cfgApex(w) { return w.cfg.flyApex; }

  // ---------------------------------------------------------------- session flow
  P.newSession = function (opts) {
    this.age = this._pendingAge; this.lang = this._pendingLang;
    this.cur = null;
    this._relayout(false);
    this.sessions++;
    this._clearRound(); this.state = 'menu';
    var last = (opts && opts.lastTopics) || this.lastTopics || null;
    this.levels = PB.Content.topicsFor(this.age, this.rng, last);
    this._surpriseOff = this.rng.int(0, Math.max(0, this.cfg.surpriseTypes.length - 1));
    this.stars = 0; this._prevRule = null;
    this.weather = 0;
    this._emit({ type: 'session', levels: this.levels.slice() });
    this.startLevel(0);
  };
  /** keep = true between two rounds: a bird / kite already leaving and the falling snow finish their exit. */
  P._clearRound = function (keep) {
    this.bubbles = []; this._g = null; this.finger.down = false;
    if (!keep || !this.bird || this.bird.state !== 'out') this.bird = null;
    if (!keep || !this.kite || this.kite.state !== 'out') this.kite = null;
    if (!keep) { this.snowflakes = []; this.drops = []; this.minis = []; }
    this.hintHand = null; this.assistId = null; this._popped = 0; this._surpriseAt = -1;
    this.rainbow.filled = this.rainbow._pfilled = 0; this.rainbow.arrived = 0; this.rainbow.shine = this.rainbow._pshine = 0;
    if (!keep) { this.rainbow.alpha = this.rainbow._palpha = 0; }
    this.rainbow.guide = 0;
  };
  P.startLevel = function (i) {
    if (!this.levels.length) this.levels = PB.Content.topicsFor(this.age);
    this.level = clamp(i | 0, 0, this.levels.length - 1);
    this.topic = this.levels[this.level];
    this.weather = this.level % 4;
    this.round = 0; this.levelStars = 0; this.levelStartTime = this.time;
    this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.cur = null; this.talk = null; this.talkAnswered = null; this.surprise = null; this._usedKeys = []; this._prevRule = null;
    var SR = this.cfg.surpriseRounds || [2];
    this._surpriseRound = SR[this.rng.int(0, SR.length - 1)];
    this._clearRound();
    this._relayout(false);
    this._setState('intro'); this.phase = null;
    this._mood('wave', 1.6);
    var c = this._fieldCentre();
    this._emit({ type: 'level', level: this.level, topic: this.topic, weather: this.weather, x: c.x, y: c.y });
  };
  /** The surprise type of this chapter: winter has snow, the others rotate bird / kite. */
  P._surpriseType = function () {
    var ST = this.cfg.surpriseTypes;
    if (this.level === this.cfg.winterLevel && this.cfg.winterSurprise) return this.cfg.winterSurprise;
    if (!ST || !ST.length) return null;
    return ST[(this.level + this._surpriseOff) % ST.length];
  };

  P._newBubble = function (q) {
    var r = this._crng, L = this.layout, hm = L.homes[q.i] || L.homes[0];
    var b = { id: q.id, i: q.i, thing: q.thing, target: !!q.target, x: L.bao.blowRing.x, y: L.bao.blowRing.y, vx: 0, vy: 0, r: 0, R: L.R,
      hx: hm.x, hy: hm.y, wx: hm.x, wy: hm.y, state: 'wait', grow: 0, wob: 0, wobV: 0, wobA: 0, glow: 0, rot: 0, rotV: 0, wig: 0, wigV: 0,
      popT: 0, alpha: 0, t: r.float(0, 10), perched: false, soft: false, rot0: 0,
      fstate: null, fx: 0, fy: 0, fs: 1, fr: 0, fq: 0, fqV: 0, ft: 0, count: -1, badge: null, piece: -1, _f: null,
      _blowAt: 0, _ax: 0, _ay: 0, _wAy: 0, _lastWrongT: -1e9, _glowT: 0, _flashT: 0, _awayDelay: 0, _contact: {},
      _wph: [r.float(0, TAU), r.float(0, TAU), r.float(0, TAU)], _wP: [r.float(this.cfg.wanderP[0], this.cfg.wanderP[1]), r.float(this.cfg.wanderP[0], this.cfg.wanderP[1])],
      _bobHz: r.float(this.cfg.bobHz[0], this.cfg.bobHz[1]) };
    this._twin(b);
    return b;
  };
  P._beginRound = function () {
    var cfg = this.cfg, self = this;
    var rr = new PB.RNG((this.rng.next() * 4294967296) >>> 0);
    var sp = this.round === this._surpriseRound && this.round > 0 ? this._surpriseType() : null;
    var el = this.time - this.levelStartTime, sb = cfg.shortBudget, short = !!(sb && this.round > 0 && el > sb[Math.min(this.round, sb.length - 1)]);
    var cur = PB.Content.makeRound(this.topic, { age: this.age, lang: this.lang, rng: rr, roundIndex: this.round, surprise: sp, short: short, level: this.level,
      usedKeys: this._usedKeys, prevRule: this._prevRule });
    this._usedKeys.push(cur.key);
    this._clearRound(true);
    this.cur = cur; this.surprise = cur.surprise;
    this.misses = 0; this.streak = 0; this._noProg = 0; this._roundAssisted = false; this._popped = 0; this._askedFirst = false;
    this._relayout(false);   // d / homes for this round's bubble count and seed
    var L = this.layout;
    this.bubbles = cur.bubbles.map(function (q) { return self._newBubble(q); });
    this.bubbles.forEach(function (b) { b._blowAt = cfg.blowLead + b.i * cfg.blowEach; self._growPos(b); self._twin(b); });
    this._lastDetachT = -1;
    var rb = this.rainbow; rb.k = cur.k; rb.filled = rb._pfilled = 0; rb.arrived = 0; rb.shine = rb._pshine = 0; rb.guide = 1;
    this._idleT = 0; this._idleGap = cfg.idleTime; this._idleN = 0;
    this._setState('round'); this._setPhase('blow');
    this._mood('blow', cfg.blowLead + cur.n * cfg.blowEach + 0.2);
    var c = this._fieldCentre();
    this._emit({ type: 'round', round: this.round, topic: this.topic, surprise: cur.surprise, n: cur.n, k: cur.k, mode: cur.mode, short: cur.short, key: cur.key, x: c.x, y: c.y });
    void L;
  };

  P._ask = function (first) {
    var cfg = this.cfg, cur = this.cur;
    this._idleT = 0; this._idleGap = cfg.idleTime; this._idleN = 0;
    this._mood('talk', 1.0);
    var M = this.layout.bao.mouth;
    // first = the long "Look at the bubbles! …" wording: only the chapter's round 0 (DESIGN §6); chapterFirst = the same (alias)
    this._emit({ type: 'ask', promptKey: cur.promptKey, params: cur.params, rule: cur.rule, first: !!first && this.round === 0, chapterFirst: !!first && this.round === 0,
      round: this.round, n: cur.n, k: cur.k, mode: cur.mode, x: M.x, y: M.y });
    if (first && this.surprise) this._surpriseAt = this.time + this._crng.float(cfg.surpriseAt[0], cfg.surpriseAt[1]);
  };

  P._startTalk = function () {
    var rr = new PB.RNG((this.rng.next() * 4294967296) >>> 0);
    this.talk = PB.Content.makeTalk(this.topic, { age: this.age, lang: this.lang, rng: rr, level: this.level });
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
    if (ok) { this.stars += 1; this.levelStars += 1; this._mood('cheer'); this._bounce(); } else this._mood(auto ? 'happy' : 'think');
    this.stateTime = 0;
    this._emit({ type: 'talkResult', correct: ok, choiceId: choiceId, answerId: this.talk.answer, auto: !!auto });
    return ok;
  };
  P._levelDone = function () { this._setState('levelDone'); this.phase = null; this._emit({ type: 'levelDone', level: this.level, stars: this.levelStars }); };

  // ---------------------------------------------------------------- input (logical px; ONE active pointer; a gesture = down … up)
  P._touch = function () { this._idleT = 0; this._idleGap = this.cfg.idleTime; };
  /**
   * pointerDown(x, y) → 'bubble' (play: judged right / wrong) | 'brush' (a bubble pressed outside play: it jiggles, `squish
   * {early}`) | 'bird' | 'kite' | 'snow' | 'bao' (poke fires on release) | 'soft' (nothing: mini bubbles) | null (not in a round).
   * Nearest bubble centre within hitR wins; a surprise wins only where the finger is outside every bubble's OWN radius.
   */
  P.pointerDown = function (x, y) {
    if (this._g || (this.state !== 'round' && this.state !== 'roundDone')) return null;
    this.finger.x = x; this.finger.y = y; this.finger.down = true;
    var g = this._g = { x0: x, y0: y, x: x, y: y, t: this.time, judged: false, kind: 'gesture', maxD: 0, result: null, soft: false, contacted: false };
    this._touch();
    var play = this.interactive;
    if (play && this.assistId && this._inField(x, y)) {   // assist: the next press anywhere in the field picks the glowing target
      var a = this.bubbleById(this.assistId), under = this._bubbleAt(x, y);
      if (a && a.state === 'float') { this._contact(a, g, under ? under.b.id : null); return (g.result = 'bubble'); }
    }
    var hit = this._bubbleAt(x, y);
    if (hit && hit.d <= hit.b.r) return (g.result = this._press(hit.b, g));
    if (this._birdAt(x, y)) { this._tapBird(); g.kind = 'surprise'; g.contacted = true; return (g.result = 'bird'); }
    if (this._kiteAt(x, y)) { this._tapKite(); g.kind = 'surprise'; g.contacted = true; return (g.result = 'kite'); }
    var sf = this._snowAt(x, y);
    if (sf && this._clearOfKeep(sf.x, sf.y, 0)) { this._tapSnow(sf); g.kind = 'surprise'; g.contacted = true; return (g.result = 'snow'); }
    if (hit) return (g.result = this._press(hit.b, g));
    if (inBox(this.layout.bao.box, x, y)) { g.kind = 'bao'; return (g.result = 'bao'); }
    this._spawnMinis(x, y, this.cfg.miniN);
    this._emit({ type: 'soft', x: x, y: y });
    g.soft = true;   // counts as a press without progress on release (play), unless a flick goes on to touch a bubble
    return (g.result = 'soft');
  };
  P._press = function (b, g) {
    if (this.interactive) { this._contact(b, g); return 'bubble'; }
    g.contacted = true; this._brush(b, g.x0, g.y0);
    return 'brush';
  };
  /** A finger slide: a press that started on nothing and moves onto a bubble within 0.25 s (a swipe) is judged on that bubble.
   *  Later contacts of the same gesture are ignored. */
  P.pointerMove = function (x, y) {
    var g = this._g;
    if (!g) return;
    g.maxD = Math.max(g.maxD, hyp(x - g.x0, y - g.y0));
    this.finger.x = x; this.finger.y = y;
    if (g.soft && !g.contacted && this.time - g.t <= this.cfg.flickTime + 1e-9 && this.interactive) {
      var best = null, bs = 2, R = this.layout.hitR;
      for (var i = 0; i < this.bubbles.length; i++) {
        var b = this.bubbles[i];
        if (b.state !== 'float') continue;
        var s = segHit(g.x, g.y, x, y, b.x, b.y, Math.min(R, b.r + 10));
        if (s >= 0 && s < bs) { bs = s; best = b; }
      }
      if (best) { g.x0 = x; g.y0 = y; this._contact(best, g); }
    }
    g.x = x; g.y = y;
  };
  /** → 'pokeBao' | 'up' | null */
  P.pointerUp = function (x, y) {
    var g = this._g;
    this._g = null; this.finger.down = false;
    if (!g) return null;
    if (x === undefined) { x = g.x; y = g.y; }
    var mv = Math.max(g.maxD, hyp(x - g.x0, y - g.y0));
    if (g.soft && !g.contacted && this.interactive) this._noProgress(false);
    if (g.kind === 'bao' && mv < this.cfg.tapMovePx && (this.state === 'round' || this.state === 'roundDone')) return this._pokeBao() || 'up';
    return 'up';
  };
  /** The finger left (touchcancel / pause / rotation): the gesture ends without a judgement. */
  P.cancelDrag = function () { this._g = null; this.finger.down = false; };

  function segHit(ax, ay, bx, by, cx, cy, r) {
    var dx = bx - ax, dy = by - ay, fx = ax - cx, fy = ay - cy, a = dx * dx + dy * dy, c = fx * fx + fy * fy - r * r;
    if (c <= 0) return 0;
    if (a < 1e-9) return -1;
    var b = 2 * (fx * dx + fy * dy), disc = b * b - 4 * a * c;
    if (disc < 0) return -1;
    var s = (-b - Math.sqrt(disc)) / (2 * a);
    return s >= 0 && s <= 1 ? s : -1;
  }
  World.segHit = segHit;

  /** The judged contact of a gesture with bubble b (`from` = the bubble under the finger when the assist redirects it). */
  P._contact = function (b, g, from) {
    g.contacted = true; g.judged = true;
    if (from !== undefined) { this._roundAssisted = true; this._emit({ type: 'assist', id: b.id, from: from, x: b.x, y: b.y }); }
    if (this._isTarget(b)) this._right(b); else this._wrong(b, g.x0, g.y0);
    return 'bubble';
  };
  P._right = function (b) {
    var cfg = this.cfg, cur = this.cur, t = b.thing, L = this.layout;
    var i = this._popped++;
    var left = cur.k - this._popped;
    this.streak = 0; this._noProg = 0; this._touch();   // progress: the soft-press count for hint / assist starts again
    if (this.assistId === b.id) this.assistId = null;
    if (this.hintHand && this.hintHand.id === b.id) this.hintHand = null;
    b._glowT = 0;
    var ev = { type: 'right', id: b.id, thing: t, rule: cur.rule, mode: cur.mode, i: i, k: cur.k, left: left, misses: this.misses, x: b.x, y: b.y };
    if (cur.mode === 'countPop') ev.count = i + 1;
    if (t.kind === 'stars' && cur.mode === 'countSel') ev.n = t.n;
    if (t.kind === 'animal') ev.home = t.home;
    this._mood('happy', cfg.moodTime.happy); this._bounce();
    this._lookX = b.x; this._lookT = 1.5;
    this._emit(ev);
    this._pop(b, false);
    // the freed thing: hops up a little, (counts its stars / shows its home), then flies to rainbow piece i
    b.fstate = 'hop'; b.ft = 0; b.fx = b._fx0 = b.x; b.fy = b._fy0 = b.y; b.fs = 1; b.fr = b.rot; b.fq = cfg.hopSquash; b.fqV = 0; b.piece = i;
    this._twin(b);
    if (left <= 0) { this.hintHand = null; this.assistId = null; }
  };
  /** The film ruptures: popT 0 → 1 in 0.22 s + a ring of droplets (soft: a leftover popping at the top edge during the whoosh). */
  P._pop = function (b, soft) {
    var cfg = this.cfg, r = this._crng;
    b.state = 'pop'; b.popT = 0; b.soft = !!soft;
    var n = soft ? Math.round(cfg.dropN / 2) : cfg.dropN;
    for (var k = 0; k < n; k++) {
      var a = TAU * (k + r.float(-0.3, 0.3)) / n, sp = r.float(cfg.dropV[0], cfg.dropV[1]) * (soft ? 0.6 : 1);
      var x = b.x + Math.cos(a) * b.r * 0.9, y = b.y + Math.sin(a) * b.r * 0.9;
      if (this.drops.length >= cfg.dropCap) this.drops.shift();
      this.drops.push({ x: x, y: y, _px: x, _py: y, vx: Math.cos(a) * sp + b.vx * 0.3, vy: Math.sin(a) * sp + b.vy * 0.3, r: r.float(cfg.dropR[0], cfg.dropR[1]), a: 1, t: 0, life: cfg.dropLife * r.float(0.8, 1.15) });
    }
    this._emit({ type: 'pop', id: b.id, x: b.x, y: b.y, r: b.r, soft: !!soft });
  };
  P._wrong = function (b, fx, fy) {
    var cfg = this.cfg, cur = this.cur, t = b.thing;
    this._squish(b, fx, fy, cfg.wrongWob, cfg.wrongImpulse);
    b.wigV += (fx < b.x ? 1 : -1) * kickFor(cfg.wrongRot, cfg.wigOmega, cfg.wigZeta);
    this._lookX = b.x; this._lookT = 1.2;
    if (this.time - b._lastWrongT < cfg.sameWrongWindow) {   // the same bubble again within 1 s: only squishes
      b._lastWrongT = this.time;
      this._emit({ type: 'squish', id: b.id, repeat: true, x: b.x, y: b.y });
      return;
    }
    b._lastWrongT = this.time;
    this.misses++; this.streak++;
    this._mood('oops');
    var ev = { type: 'wrong', id: b.id, thing: t, got: { nameKind: t.nameKind, nameValue: t.nameValue }, want: { kind: cur.rule.kind, value: cur.rule.value,
      nameKind: cur.rule.nameKind, promptKey: cur.promptKey, params: cur.params, left: cur.k - this._popped }, rule: cur.rule, streak: this.streak, misses: this.misses, x: b.x, y: b.y };
    this._emit(ev);
    var h0 = this._lastHintT;
    this._noProgress(true);
    if (this._lastHintT !== h0) ev.hint = true;   // this miss brought the hint (main says a short pointer line)
  };
  /** Jelly squish: compress along the finger → centre axis + an impulse away from the finger. */
  P._squish = function (b, fx, fy, peak, imp) {
    var cfg = this.cfg, dx = b.x - fx, dy = b.y - fy, d = hyp(dx, dy);
    if (d < 1e-3) { dx = 1; dy = 0; d = 1; }
    var nx = dx / d, ny = dy / d;
    b.vx += nx * imp; b.vy += ny * imp;
    b.wobA = Math.atan2(ny, nx); b.wob = 0; b.wobV = -kickFor(peak, cfg.wobOmega, cfg.wobZeta);
  };
  P._brush = function (b, fx, fy) {
    this._squish(b, fx, fy, this.cfg.brushWob, this.cfg.brushImpulse);
    this._emit({ type: 'squish', id: b.id, early: true, x: b.x, y: b.y });
  };
  P._noProgress = function (miss) {
    var cfg = this.cfg;
    this._noProg++;
    if ((miss && this.misses >= cfg.hintAfterMisses) || this._noProg >= cfg.hintAfterSoft) this._autoHint(false);
    if (this._noProg >= cfg.assistAfter && !this.assistId) {
      var a = this._hintTarget();
      if (a) { this.assistId = a.id; this._emit({ type: 'assistArmed', id: a.id, x: a.x, y: a.y }); }
    }
  };
  P._pokeBao = function () {
    var B = this.layout.bao, a = this.prompt();
    this._touch();
    this._mood('giggle');
    this._spawnMinis(B.ring.x, B.ring.y, this.cfg.pokeMinis, true);
    var ev = { type: 'pokeBao', x: B.mouth.x, y: B.mouth.y };
    if (a) { ev.promptKey = a.promptKey; ev.params = a.params; ev.rule = a.rule; ev.left = a.left; } else ev.busy = true;
    this._emit(ev);
    return 'pokeBao';
  };
  P._spawnMinis = function (x, y, n, up) {
    var cfg = this.cfg, r = this._crng;
    for (var k = 0; k < n; k++) {
      if (this.minis.length >= cfg.miniCap) this.minis.shift();
      var a = up ? r.float(-2.2, -0.9) : r.float(0, TAU), sp = r.float(40, 120);
      this.minis.push({ x: x, y: y, _px: x, _py: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, r: r.float(cfg.miniR[0], cfg.miniR[1]), a: 1, t: 0,
        life: r.float(cfg.miniLife[0], cfg.miniLife[1]), ph: r.float(0, TAU) });
    }
  };

  // ---------------------------------------------------------------- help
  P.resetNudges = function () {
    this._idleT = 0; this._idleGap = this.cfg.idleTime; this._idleN = 0;
    this._talkAskT = 0; this._talkAsks = 0;
    if (this.talk) this.talk.glowAnswer = false;
  };
  P._glowing = function () { for (var i = 0; i < this.bubbles.length; i++) if (this.bubbles[i]._glowT > 0) return true; return false; };
  P._autoHint = function (fromIdle) {
    if (this._glowing() || this.hintHand || this.time - this._lastHintT < this.cfg.hintCooldown) return null;
    return this._doHint(fromIdle);
  };
  P._doHint = function (fromIdle) {
    var cfg = this.cfg, cur = this.cur;
    if (!this.interactive) return null;
    var b = this._hintTarget();
    if (!b) return null;
    b._glowT = cfg.hintTime;
    this.hintHand = { id: b.id, x: b.x, y: b.y, _px: b.x, _py: b.y, t: 0, press: 0, alpha: 0, time: 0, T: cfg.hintTime };
    this._stepHint(0);
    this._lastHintT = this.time;
    this._mood('talk', 1.2);
    var ev = { type: 'hint', id: b.id, x: b.x, y: b.y, want: { kind: cur.rule.kind, value: cur.rule.value, nameKind: cur.rule.nameKind, promptKey: cur.promptKey, params: cur.params, left: cur.k - this._popped } };
    if (fromIdle) ev.idle = true;
    this._emit(ev);
    return { bubble: b.id };
  };
  /** Manual hint (a tap on the speech bubble): a target glows + the ghost hand taps it. */
  P.hint = function () {
    if (!this.interactive) return null;
    if (this.hintHand) return { bubble: this.hintHand.id };
    return this._doHint(false);
  };
  /** Ghost hand (1.6 s cycle): glides in from below-right, taps the (moving) bubble twice, drifts back fading. Fingertip = (x, y). */
  P._stepHint = function (h) {
    var H = this.hintHand, cfg = this.cfg;
    if (!H) return;
    H.time += h;
    var b = this.bubbleById(H.id);
    if (!b || b.state !== 'float' || H.time >= H.T || !this.interactive) { this.hintHand = null; return; }
    var tx = b.x + 6, ty = b.y + 10;
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
  P._twin = function (b) {
    b._px = b.x; b._py = b.y; b._pr = b.r; b._pwob = b.wob; b._prot = b.rot; b._palpha = b.alpha; b._pgrow = b.grow;
    b._pfx = b.fx; b._pfy = b.fy; b._pfs = b.fs; b._pfr = b.fr; b._pfq = b.fq;
  };
  P._twins = function () {
    var i, o;
    for (i = 0; i < this.bubbles.length; i++) this._twin(this.bubbles[i]);
    for (i = 0; i < this.drops.length; i++) { o = this.drops[i]; o._px = o.x; o._py = o.y; }
    for (i = 0; i < this.minis.length; i++) { o = this.minis[i]; o._px = o.x; o._py = o.y; }
    for (i = 0; i < this.snowflakes.length; i++) { o = this.snowflakes[i]; o._px = o.x; o._py = o.y; o._prot = o.rot; }
    if (this.bird) { o = this.bird; o._px = o.x; o._py = o.y; }
    if (this.kite) { o = this.kite; o._px = o.x; o._py = o.y; o._prot = o.rot; }
    if (this.hintHand) { this.hintHand._px = this.hintHand.x; this.hintHand._py = this.hintHand.y; }
    var rb = this.rainbow; rb._pfilled = rb.filled; rb._pshine = rb.shine; rb._palpha = rb.alpha;
    this.bao._pbounce = this.bao.bounce;
  };
  P._step = function (h) {
    var cfg = this.cfg;
    this._twins();
    this.time += h; this.stateTime += h; this.phaseTime += h;
    var inChapter = this.state === 'intro' || this.state === 'round' || this.state === 'roundDone' || this.state === 'talk' || this.state === 'levelDone';
    this.wind = this.windModel.step(h, this.weather);
    this.gust = this.windModel.gust;
    var ge = this.windModel.drain();
    for (var gi = 0; gi < ge.length; gi++) if (inChapter) this._onGust(ge[gi].dir);
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
        } else if (this._talkAsks >= cfg.talkMaxAsks && this._talkAskT >= cfg.talkGiveUp - 1e-9) this.talkAnswer(this.talk.answer, true);   // Bao answers
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
    if (this.state === 'round' || this.state === 'roundDone') {
      this._stepBubbles(h); this._stepSurprises(h); this._stepHint(h);
    }
    this._stepRainbow(h);
    this._stepDrops(h); this._stepMinis(h);
    if (this.state !== 'round' && this.state !== 'roundDone') this._stepSurprises(h);   // a leaving bird / kite, falling snow
    this._stepBao(h);
  };
  P._onGust = function (dir) {
    var cfg = this.cfg, k = kickFor(cfg.gustWob, cfg.wobOmega, cfg.wobZeta), c = this._fieldCentre();
    this.bubbles.forEach(function (b) { if (b.state === 'float') { b.wobA = 0; b.wobV += k * (b.wob >= 0 ? 1 : -1); } });
    this._emit({ type: 'gust', dir: dir, x: c.x, y: c.y });
  };

  P._stepRound = function (h) {
    var cfg = this.cfg;
    if (this.phase === 'blow') {
      var allOut = true;
      for (var i = 0; i < this.bubbles.length; i++) { var b = this.bubbles[i]; if (b.state === 'wait' || b.state === 'grow') allOut = false; }
      if (allOut && this._lastDetachT >= 0 && this.time - this._lastDetachT >= cfg.askAfterBlow - 1e-9) { this._setPhase('play'); this._ask(true); }
      return;
    }
    if (this.phase !== 'play') return;
    if (this.interactive && !this._g) {
      this._idleT += h;
      if (this._idleT >= this._idleGap - 1e-9) {
        this._idleT = 0; this._idleGap = Math.min(cfg.idleMax, this._idleGap * cfg.idleBackoff); this._idleN++;
        this._mood('think');
        var Mo = this.layout.bao.mouth;
        this._emit({ type: 'idle', n: this._idleN, promptKey: this.cur.promptKey, params: this.cur.params, rule: this.cur.rule, left: this.cur.k - this._popped, x: Mo.x, y: Mo.y });
        if (this._idleN >= cfg.idleHintFrom) this._autoHint(true);
      }
    }
    if (this._popped >= this.cur.k) {
      var busy = this.bubbles.some(function (q) { return q.fstate && q.fstate !== 'done'; });
      if (!busy && this.rainbow.filled >= this.cur.k - 1e-9) this._roundDone();
    }
  };
  P._starsFor = function (m) { return m <= 0 ? 3 : m === 1 ? 2 : 1; };
  P._roundDone = function () {
    var st = this._starsFor(this.misses), cur = this.cur, rb = this.rainbow;
    if (this._roundAssisted) st = Math.min(st, 2);   // an assisted round ≤ 2★
    this.roundStars = st; this.stars += st; this.levelStars += st;
    this._prevRule = { kind: cur.rule.kind, value: cur.rule.value };
    this.cancelDrag(); this.hintHand = null; this.assistId = null;
    this._setState('roundDone'); this._setPhase('rainbow');
    this._mood('cheer', this.cfg.rainbowTime); this._bounce();
    var top = { x: rb.cx, y: rb.cy - rb.r };
    this._emit({ type: 'roundDone', round: this.round, stars: st, misses: this.misses, assisted: !!this._roundAssisted, x: top.x, y: top.y });
    this._emit({ type: 'rainbowDone', k: cur.k, x: top.x, y: top.y });
  };
  P._stepRoundDone = function (h) {
    var cfg = this.cfg, self = this;
    if (this.phase === 'rainbow') {
      this.rainbow.shine = clamp(this.phaseTime / cfg.shineTime, 0, 1);
      if (this.phaseTime >= cfg.rainbowTime - 1e-9) this._startWhoosh();
    } else if (this.phase === 'whoosh') {
      var left = this.bubbles.filter(function (b) { return b.state === 'away' || b.state === 'float' || b.state === 'pop'; }).length;
      if ((left === 0 && this.phaseTime >= cfg.whooshMin) || this.phaseTime >= cfg.whooshTime - 1e-9) {
        this.bubbles.forEach(function (b) { if (b.state === 'away' || b.state === 'float') { b.state = 'gone'; b.alpha = 0; self._emit({ type: 'away', id: b.id, forced: true, x: b.x, y: b.y }); } });
        this._setPhase('out');
      }
    } else if (this.phase === 'out') {
      if (this.phaseTime >= cfg.outTime - 1e-9) this._nextRound();
    }
  };
  /** whoosh: Bao blows; the leftover bubbles get an up-right wind (closest to Bao first) and leave the screen. */
  P._startWhoosh = function () {
    var cfg = this.cfg, L = this.layout, ring = L.bao.blowRing, self = this, r = this._crng, soft = null;
    this._setPhase('whoosh');
    this._mood('blow', 1.0);
    var left = this.bubbles.filter(function (b) { return b.state === 'float'; });
    if (left.length && r.chance(cfg.whooshSoftPop)) soft = r.pick(left).id;
    left.forEach(function (b) {
      b.state = 'away'; b._awayT = 0; b._awayDelay = Math.min(cfg.whooshDelayMax, hyp(b.x - ring.x, b.y - ring.y) / cfg.whooshStagger); b._softPop = b.id === soft;
      var D = Math.min(b.y + b.r + 20, (L.W - b.x + b.r + 20) / cfg.whooshAx);   // the shorter way out (up, or right)
      b._wAy = -Math.max(cfg.whooshAy, cfg.whooshK * D);
      b._glowT = 0;
    });
    if (this.bird && this.bird.state !== 'gone' && this.bird.state !== 'out') this._birdLeave();
    if (this.kite && this.kite.state !== 'gone' && this.kite.state !== 'out') this._kiteLeave();
    this._emit({ type: 'whoosh', n: left.length, x: ring.x, y: ring.y });
    void self;
  };
  P._nextRound = function () {
    var cfg = this.cfg;
    this._clearRound(true); this.cur = null;
    this.round++;
    var el = this.time - this.levelStartTime, long = this.round >= cfg.chapterMinRounds && el > cfg.chapterTimeLimit;
    if (this.round < this.roundsPerLevel && !long) this._beginRound();
    else { if (this.round < this.roundsPerLevel) this.roundsPerLevel = this.round; this._startTalk(); }
  };

  // ---------------------------------------------------------------- bubbles
  /** Where a growing bubble sits: its back edge on the wand ring, pushed out along the blow direction as it grows. */
  P._growPos = function (b) {
    var L = this.layout, ring = L.bao.blowRing, c = this._fieldCentre(), dx = c.x - ring.x, dy = c.y - ring.y, d = hyp(dx, dy) || 1;
    var ux = 0.75 * dx / d + 0.25, uy = 0.75 * dy / d - 0.15, ud = hyp(ux, uy) || 1;
    b._dirX = ux / ud; b._dirY = uy / ud;
    var cfg = this.cfg, R = b.R || L.R;
    b.r = b.state === 'grow' ? lerp(cfg.growR0 * R, R, easeOut(b.grow)) : cfg.growR0 * R;
    var out = Math.max(0, b.r - 0.6 * ring.r);
    b.x = ring.x + b._dirX * out; b.y = ring.y + b._dirY * out;
  };
  P._stepBubbles = function (h) {
    var cfg = this.cfg, L = this.layout, bs = this.bubbles, self = this, i, b, wind = this.wind * cfg.windK;
    var w = cfg.homeOmega, z = cfg.homeZeta, W = L.walls, perched = this.bird && this.bird.state === 'perch' ? this.bird.on : null;
    for (i = 0; i < bs.length; i++) {
      b = bs[i];
      b.t += h;
      if (b.state === 'gone') continue;
      if (b.state === 'wait') {
        b.alpha = 0;
        if (this.phase === 'blow' && this.phaseTime >= b._blowAt) {
          b.state = 'grow'; b.grow = 0; this._growPos(b); b.alpha = 1;
          this._emit({ type: 'blow', i: b.i, id: b.id, x: L.bao.blowRing.x, y: L.bao.blowRing.y });
        } else { this._growPos(b); continue; }
      }
      if (b.state === 'grow') {
        b.grow = Math.min(1, b.grow + h / cfg.growTime);
        this._growPos(b); b.alpha = Math.min(1, b.grow * 4);
        b.wob = 0.06 * Math.sin(Math.PI * b.grow);   // a slightly flattened film on the ring
        if (b.grow >= 1) {
          b.state = 'float'; b.r = b.R; b._ax = 0; b._ay = 0;
          var hx = b.hx - b.x, hy = b.hy - b.y, hd = hyp(hx, hy) || 1, sp = this._crng.float(cfg.detachV[0], cfg.detachV[1]);
          b.vx = hx / hd * sp; b.vy = hy / hd * sp;
          b.wobA = Math.atan2(hy, hx); b.wob = 0; b.wobV = kickFor(cfg.detachWob, cfg.wobOmega, cfg.wobZeta);
          this._lastDetachT = this.time;
          this._emit({ type: 'bubbleIn', id: b.id, i: b.i, x: b.x, y: b.y });
        }
        continue;
      }
      if (b.state === 'float') {
        // wandering home (Lissajous ±10 px, periods 3–5 s)
        b.wx = b.hx + cfg.wander * Math.sin(TAU * b.t / b._wP[0] + b._wph[0]);
        b.wy = b.hy + cfg.wander * Math.sin(TAU * b.t / b._wP[1] + b._wph[1]);
        var ax = w * w * (b.wx - b.x), ay = w * w * (b.wy - b.y), am = hyp(ax, ay);
        if (am > cfg.homeAccMax) { ax *= cfg.homeAccMax / am; ay *= cfg.homeAccMax / am; }
        ax += -2 * z * w * b.vx + wind; ay += -2 * z * w * b.vy + cfg.bobAcc * Math.sin(TAU * b._bobHz * b.t + b._wph[2]);
        if (perched === b.id) ay += cfg.birdDip;
        // soft walls (screen / speech bubble / cloud floor) + Bao's box
        var r = b.r;
        if (b.x - r < W.x0) ax += cfg.wallK * (W.x0 - (b.x - r)) - cfg.wallDamp * Math.min(0, b.vx);
        if (b.x + r > W.x1) ax -= cfg.wallK * ((b.x + r) - W.x1) + cfg.wallDamp * Math.max(0, b.vx);
        if (b.y - r < W.y0) ay += cfg.wallK * (W.y0 - (b.y - r)) - cfg.wallDamp * Math.min(0, b.vy);
        if (b.y + r > W.y1) ay -= cfg.wallK * ((b.y + r) - W.y1) + cfg.wallDamp * Math.max(0, b.vy);
        var bx = L.bao.box, qx = clamp(b.x, bx.x, bx.x + bx.w), qy = clamp(b.y, bx.y, bx.y + bx.h), qd = hyp(b.x - qx, b.y - qy);
        if (qd < r && qd > 1e-6) { ax += cfg.wallK * (r - qd) * (b.x - qx) / qd; ay += cfg.wallK * (r - qd) * (b.y - qy) / qd; }
        b._ax = ax; b._ay = ay;
      } else if (b.state === 'away') {
        b._awayT += h;
        var ramp = smooth((b._awayT - b._awayDelay) / cfg.whooshRamp);
        if (b._awayT >= b._awayDelay && !b._kicked) { b._kicked = true; b.wobA = -0.9; b.wobV += kickFor(cfg.whooshWob, cfg.wobOmega, cfg.wobZeta); }
        b.vx += cfg.whooshAx * -b._wAy * ramp * h - 0.5 * b.vx * h;
        b.vy += b._wAy * ramp * h - 0.5 * b.vy * h;
        b.x += b.vx * h; b.y += b.vy * h;
        if (b._softPop && b.y - b.r < L.ins.top + 6) { this._pop(b, true); b.fstate = null; continue; }
        if (b.y + b.r < -10 || b.x - b.r > L.W + 10) { b.state = 'gone'; b.alpha = 0; this._emit({ type: 'away', id: b.id, x: clamp(b.x, 0, L.W), y: clamp(b.y, 0, L.H) }); }
      }
      if (b.state === 'pop') {
        b.popT = Math.min(1, b.popT + h / cfg.popTime);
        if (b.popT >= 1) { b.state = b.fstate ? 'freed' : 'gone'; b.alpha = 0; if (b.state === 'gone' && b.soft) this._emit({ type: 'away', id: b.id, popped: true, x: b.x, y: b.y }); }
      }
    }
    // pairwise soft collisions between floating bubbles (growing ones push but do not move)
    for (i = 0; i < bs.length; i++) {
      var a = bs[i];
      if (a.state !== 'float' && a.state !== 'grow') continue;
      for (var j = i + 1; j < bs.length; j++) {
        var c = bs[j];
        if (c.state !== 'float' && c.state !== 'grow') continue;
        if (a.state === 'grow' && c.state === 'grow') continue;
        var dx = c.x - a.x, dy = c.y - a.y, d = hyp(dx, dy), min = a.r + c.r + cfg.collGap;
        if (d >= min) { a._contact[c.id] = false; continue; }
        if (d < 1e-6) { dx = 1; dy = 0; d = 1; }
        var nx = dx / d, ny = dy / d, o = min - d, f = cfg.collK * o;
        var ma = a.state === 'float' ? (c.state === 'float' ? 0.5 : 1) : 0, mc = c.state === 'float' ? (a.state === 'float' ? 0.5 : 1) : 0;
        if (ma) { a._ax -= nx * f * ma * 2; a._ay -= ny * f * ma * 2; }
        if (mc) { c._ax += nx * f * mc * 2; c._ay += ny * f * mc * 2; }
        var vn = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;   // < 0: approaching
        if (vn < 0) {
          var jj = -(1 + cfg.collE) * vn * 0.5 * Math.min(1, h * 30);
          if (ma) { a.vx -= nx * jj * ma * 2; a.vy -= ny * jj * ma * 2; }
          if (mc) { c.vx += nx * jj * mc * 2; c.vy += ny * jj * mc * 2; }
        }
        if (!a._contact[c.id]) {   // contact starts: both membranes get a kick, a soft bump sound (rate-limited)
          a._contact[c.id] = true;
          var sp2 = Math.abs(vn), kk = Math.min(cfg.collWobMax, cfg.collWobK * sp2), ang = Math.atan2(ny, nx);
          if (a.state === 'float') { a.wobA = ang; a.wobV -= kickFor(kk, cfg.wobOmega, cfg.wobZeta); }
          if (c.state === 'float') { c.wobA = ang; c.wobV -= kickFor(kk, cfg.wobOmega, cfg.wobZeta); }
          if (sp2 >= cfg.bumpMinV && this.time - this._lastBumpT >= cfg.bumpEvery) { this._lastBumpT = this.time; this._emit({ type: 'bump', a: a.id, b: c.id, v: sp2, x: a.x + nx * a.r, y: a.y + ny * a.r }); }
        }
      }
    }
    // integrate the floaters (semi-implicit Euler), speed caps, membrane + thing springs, glow
    for (i = 0; i < bs.length; i++) {
      b = bs[i];
      if (b.state === 'float') {
        b.vx += b._ax * h; b.vy += b._ay * h;
        var v = hyp(b.vx, b.vy), cap = v > cfg.floatVMax && hyp(b.x - b.hx, b.y - b.hy) > 4 * cfg.wander ? cfg.floatVMax : cfg.vHard;
        if (v > cap) { b.vx *= cap / v; b.vy *= cap / v; }
        b.x += b.vx * h; b.y += b.vy * h;
        if (!(isFinite(b.x) && isFinite(b.y))) { b.x = b.hx; b.y = b.hy; b.vx = b.vy = 0; }
        b.x = clamp(b.x, -L.W, 2 * L.W); b.y = clamp(b.y, -L.H, 2 * L.H);
      }
      if (b.state === 'float' || b.state === 'away' || b.state === 'grow') {
        if (b.state !== 'grow') { spring(b, 'wob', 'wobV', 0, cfg.wobOmega, cfg.wobZeta, h); b.wob = clamp(b.wob, -cfg.wobMax, cfg.wobMax); }
        var lag = clamp(-cfg.rotLag * b.vx, -cfg.rotMax, cfg.rotMax);
        spring(b, 'rot0', 'rotV', lag, cfg.rotOmega, cfg.rotZeta, h);
        spring(b, 'wig', 'wigV', 0, cfg.wigOmega, cfg.wigZeta, h);
        b.rot = (b.rot0 || 0) + b.wig;
      }
      if (b._glowT > 0) b._glowT = Math.max(0, b._glowT - h);
      var gT = this.assistId === b.id ? 1 : b._glowT > 0 ? 0.55 + 0.45 * Math.sin(TAU * 1.6 * this.time) : 0;
      b.glow += (gT - b.glow) * Math.min(1, h * (gT > b.glow ? 10 : 4));
      if (b.fstate && b.fstate !== 'done') this._stepFreed(b, h);
    }
    void self;
  };
  /** The freed thing: hop (squash → stretch) → countSel: count the stars / animal: home badge → curved flight to rainbow piece i. */
  P._stepFreed = function (b, h) {
    var cfg = this.cfg, L = this.layout, cur = this.cur;
    b.ft += h;
    spring(b, 'fq', 'fqV', 0, 16, 0.4, h);
    if (b.fstate === 'hop') {
      var u = clamp(b.ft / cfg.hopTime, 0, 1);
      b.fy = b._fy0 - cfg.hopH * easeOut(u); b.fx = b._fx0;
      b.fr = b.fr * Math.max(0, 1 - 8 * h);
      if (u >= 1) {
        b._fx0 = b.fx; b._fy0 = b.fy; b.ft = 0;
        if (cur && cur.mode === 'countSel' && b.thing.kind === 'stars') { b.fstate = 'count'; b.count = 0; }
        else if (b.thing.kind === 'animal') {
          b.fstate = 'badge';
          var dx = (b.fx > L.W - L.ins.right - 160 ? -1 : 1) * 0.75 * L.thingSize;
          b.badge = { home: b.thing.home, a: 0, dx: dx, x: b.fx + dx, y: b.fy - 0.55 * L.thingSize, r: 0.32 * L.thingSize };
          this._emit({ type: 'homeBadge', id: b.id, home: b.thing.home, x: b.badge.x, y: b.badge.y });
        } else this._fly(b);
      }
      return;
    }
    if (b.fstate === 'count' || b.fstate === 'badge') {
      b.fx = b._fx0; b.fy = b._fy0 - 4 * Math.sin(TAU * 0.9 * b.ft);   // hovering above the pop spot
      if (b.fstate === 'count') {
        var n = b.thing.n, kk = Math.min(n, Math.floor((b.ft - cfg.countDelay) / cfg.countStep + 1e-9) + 1);
        if (b.ft >= cfg.countDelay && kk > b.count) {
          b.count = kk; b.fqV += kickFor(0.05, 16, 0.4);
          this._emit({ type: 'count', id: b.id, i: kk, n: n, x: b.fx, y: b.fy });
        }
        if (b.count >= n && b.ft >= cfg.countDelay + (n - 1) * cfg.countStep + cfg.countTail) this._fly(b);
      } else {
        b.badge.a = Math.min(1, b.badge.a + h * cfg.badgeRate); b.badge.x = b.fx + b.badge.dx; b.badge.y = b.fy - 0.55 * L.thingSize;
        if (b.ft >= cfg.badgeHold) this._fly(b);
      }
      return;
    }
    if (b.fstate === 'fly') {
      var f = b._f, s = smooth(b.ft / f.T), p = flightAt(f, s);
      b.fx = p.x; b.fy = p.y; b.fs = lerp(b._fs0, cfg.flyScale, s); b.fr = cfg.flySpin * Math.sin(Math.PI * s) * (f.x1 >= f.x0 ? 1 : -1);
      if (b.badge) { b.badge.a = Math.max(0, b.badge.a - h * 5); b.badge.x = b.fx + b.badge.dx; b.badge.y = b.fy - 0.55 * L.thingSize; if (b.badge.a <= 0) b.badge = null; }
      if (b.ft >= f.T - 1e-9) {
        b.fstate = 'done'; b.state = 'gone'; b.badge = null; b.fx = f.x1; b.fy = f.y1;
        this.rainbow.arrived++;
        this._emit({ type: 'paint', id: b.id, i: b.piece, k: this.rainbow.k, x: f.x1, y: f.y1 });
      }
    }
  };
  P._fly = function (b) {
    var tp = rainbowPoint(this.rainbow, this.rainbow.k, b.piece + 0.5);
    b.fstate = 'fly'; b.ft = 0; b._fs0 = b.fs;
    b._f = flight(b.fx, b.fy, tp.x, tp.y, this.cfg.flyTime, this.cfg.flyApex);
    this._emit({ type: 'fly', id: b.id, i: b.piece, x: b.fx, y: b.fy, tx: tp.x, ty: tp.y });
  };
  P._stepRainbow = function (h) {
    var cfg = this.cfg, rb = this.rainbow, inRound = this.state === 'round' || (this.state === 'roundDone' && this.phase !== 'out');
    rb.filled = Math.min(rb.arrived, rb.filled + h / cfg.paintTime);
    var ta = inRound ? 1 : 0;
    rb.alpha = ta > rb.alpha ? Math.min(ta, rb.alpha + h / cfg.rainbowIn) : Math.max(ta, rb.alpha - h / cfg.outTime);
  };
  P._stepDrops = function (h) {
    var g = this.cfg.dropG;
    for (var i = this.drops.length - 1; i >= 0; i--) {
      var d = this.drops[i]; d.t += h;
      d.vy += g * h; d.vx *= 1 - 1.5 * h; d.x += d.vx * h; d.y += d.vy * h; d.a = clamp(1 - d.t / d.life, 0, 1);
      if (d.t >= d.life) this.drops.splice(i, 1);
    }
  };
  P._stepMinis = function (h) {
    for (var i = this.minis.length - 1; i >= 0; i--) {
      var m = this.minis[i]; m.t += h;
      m.vx *= 1 - 2 * h; m.vy = m.vy * (1 - 2 * h) - 60 * h; m.x += (m.vx + 12 * Math.sin(6 * m.t + m.ph)) * h; m.y += m.vy * h;
      var u = m.t / m.life; m.a = u < 0.15 ? u / 0.15 : clamp((1 - u) / 0.85, 0, 1);
      if (m.t >= m.life) this.minis.splice(i, 1);
    }
  };

  // ---------------------------------------------------------------- surprises
  P._spawnSurprise = function () {
    var cfg = this.cfg, L = this.layout, r = this._crng, i, f = L.field;
    if (this.surprise === 'bird' && !this.bird) {
      var side = r.chance(0.5) ? -1 : 1, sx = side < 0 ? -60 : L.W + 60, sy = this._birdY();
      var opts = this.bubbles.filter(function (b) { return b.state === 'float' && !b.target; });
      if (this.cur.mode === 'countPop') opts = [];
      var on = opts.length ? r.pick(opts).id : null;
      this.bird = { x: sx, y: sy, _px: sx, _py: sy, flap: 0, face: side < 0 ? 1 : -1, state: on ? 'in' : 'pass', t: 0, on: on, side: side, sx: sx, sy: sy, stay: 0, loopT: 0, after: null };
      this.bird.path = this._birdPath(this.bird.state, this.bird);
      this._emit({ type: 'bird', perch: on, x: clamp(sx, 0, L.W), y: sy });
    } else if (this.surprise === 'kite' && !this.kite) {
      var x0 = L.ins.left - 120, y0 = f.y0 - 0.1 * L.d;
      this.kite = { x: x0, y: y0, _px: x0, _py: y0, rot: 0, _prot: 0, state: 'in', t: 0, ax: 0, ay: 0, x0: x0, y0: y0, stringX: L.ins.left - 40, stringY: L.H + 40, loopT: 0 };
      this._kiteAnchor();
      this._emit({ type: 'kite', x: this.kite.ax, y: this.kite.ay });
    } else if (this.surprise === 'snow' && !this.snowflakes.some(function (q) { return q.state === 'fall'; })) {
      var top = L.bubble.y + L.bubble.h + 10, v = Math.max(cfg.snowV, (L.groundY - top) / cfg.snowFall);
      for (i = 0; i < cfg.snowN; i++) {
        var x = f.x0 + (i + 0.5) / cfg.snowN * (f.x1 - f.x0) + r.float(-0.25, 0.25) * (f.x1 - f.x0) / cfg.snowN;
        this.snowflakes.push({ x: x, y: top, _px: x, _py: top, x0: x, r: cfg.snowR * r.float(0.85, 1.1), rot: r.float(0, TAU), _prot: 0, a: 0, state: 'wait', t: -i * cfg.snowStagger, v: v * r.float(0.85, 1.15), ph: r.float(0, TAU), tw: 0 });
      }
      var c = this._fieldCentre();
      this._emit({ type: 'snow', n: cfg.snowN, x: c.x, y: top });
    }
  };
  /** The bird's cruising height: above the field's top row, never over the speech bubble. */
  P._birdY = function () { var L = this.layout; return Math.max(L.bubble.y + L.bubble.h + 40, L.field.y0 - 0.45 * L.d); };
  /** A straight-ish leg for the bird's state (in: to above its perch bubble, out / pass: across and away). */
  P._birdPath = function (st, bd) {
    var L = this.layout, cfg = this.cfg, b = bd.on ? this.bubbleById(bd.on) : null;
    if (st === 'in' && b) return { x0: bd.x, y0: bd.y, T: cfg.birdIn };
    if (st === 'pass') return { x0: bd.x, y0: this._birdY(), x1: bd.side < 0 ? L.W + 80 : -80, y1: this._birdY() - 20, T: cfg.birdPass };
    var ex = bd.x < L.W / 2 ? -80 : L.W + 80;
    if (bd.side) ex = bd.side < 0 ? L.W + 80 : -80;
    return { x0: bd.x, y0: bd.y, x1: ex, y1: Math.max(L.ins.top - 60, bd.y - 220), T: cfg.birdOut };
  };
  P._birdLeave = function () { var bd = this.bird; bd.state = 'out'; bd.t = 0; bd.path = this._birdPath('out', bd); bd.face = bd.path.x1 > bd.x ? 1 : -1; };
  P._tapBird = function () {
    var bd = this.bird, L = this.layout;
    bd.after = bd.state; bd.state = 'loop'; bd.loopT = 0; bd.lx = bd.x; bd.ly = bd.y; bd.flap = 1;
    this._emit({ type: 'birdTap', x: clamp(bd.x, 0, L.W), y: bd.y });
  };
  P._kiteAnchor = function () {
    var k = this.kite, L = this.layout, f = L.field;
    k.ax = f.x0 + 0.3 * (f.x1 - f.x0); k.ay = f.y0 - 0.1 * L.d; k.stringX = L.ins.left - 40; k.stringY = L.H + 40;
  };
  P._kiteLeave = function () { var k = this.kite; k.state = 'out'; k.t = 0; k.ox = k.x; k.oy = k.y; };
  P._tapKite = function () {
    var k = this.kite;
    k.after = k.state; k.state = 'loop'; k.loopT = 0; k.lx = k.x; k.ly = k.y; k.rot0 = k.rot;
    this._emit({ type: 'kiteTap', x: k.x, y: k.y });
  };
  P._tapSnow = function (f) {
    f.state = 'twinkle'; f.t = 0;
    this._emit({ type: 'snowTap', x: f.x, y: f.y });
  };
  P._stepSurprises = function (h) {
    var cfg = this.cfg, L = this.layout, i;
    if (this._surpriseAt >= 0 && this.time >= this._surpriseAt && ((this.state === 'round' && this.phase === 'play') || (this.state === 'roundDone' && this.phase === 'rainbow'))) { this._surpriseAt = -1; this._spawnSurprise(); }
    // ---- bird
    var bd = this.bird;
    if (bd) {
      bd.t += h;
      var pb = bd.on ? this.bubbleById(bd.on) : null;
      if (bd.state === 'in') {
        if (!pb || pb.state !== 'float') { this._birdLeave(); }
        else {
          var u = smooth(bd.t / bd.path.T), tx = pb.x, ty = pb.y - pb.r - cfg.birdAbove;
          bd.x = lerp(bd.path.x0, tx, u); bd.y = lerp(bd.path.y0, ty, u) - cfg.birdWave * Math.sin(Math.PI * u) - 6 * Math.sin(TAU * 1.4 * bd.t) * (1 - u);
          bd.face = tx >= bd.path.x0 ? 1 : -1; bd.flap = 0.5 + 0.5 * Math.sin(TAU * 7 * bd.t);
          if (bd.t >= bd.path.T) { bd.state = 'perch'; bd.stay = 0; pb.perched = true; }
        }
      } else if (bd.state === 'perch') {
        bd.stay += h;
        if (!pb || pb.state !== 'float') this._birdLeave();
        else {
          bd.x = pb.x; bd.y = pb.y - pb.r - cfg.birdAbove + 4; bd.flap = Math.max(0, Math.sin(TAU * 0.5 * bd.stay)) > 0.97 ? 0.6 : 0;
          if (bd.stay >= cfg.birdPerch) { pb.perched = false; this._birdLeave(); }
        }
      } else if (bd.state === 'out' || bd.state === 'pass') {
        var pt = bd.path, uo = clamp(bd.t / pt.T, 0, 1);
        bd.x = lerp(pt.x0, pt.x1, uo); bd.y = lerp(pt.y0, pt.y1, bd.state === 'pass' ? uo : uo * uo) + cfg.birdWave * Math.sin(TAU * 0.8 * bd.t);
        bd.face = pt.x1 >= pt.x0 ? 1 : -1; bd.flap = 0.5 + 0.5 * Math.sin(TAU * 7 * bd.t);
        if (uo >= 1) { bd.state = 'gone'; this.bird = null; }
      } else if (bd.state === 'loop') {
        bd.loopT += h;
        var ul = clamp(bd.loopT / cfg.birdLoop, 0, 1), a = TAU * smooth(ul);
        bd.x = bd.lx + bd.face * cfg.birdLoopR * Math.sin(a); bd.y = bd.ly - cfg.birdLoopR * (1 - Math.cos(a)); bd.flap = 0.5 + 0.5 * Math.sin(TAU * 9 * bd.loopT);
        if (ul >= 1) {
          bd.x = bd.lx; bd.y = bd.ly;
          if (bd.after === 'perch' && pb && pb.state === 'float' && bd.stay < cfg.birdPerch) bd.state = 'perch';
          else { if (pb) pb.perched = false; bd.t = 0; bd.state = bd.after === 'pass' ? 'pass' : 'out'; bd.path = this._birdPath(bd.state, bd); if (bd.state === 'pass') { bd.path.x0 = bd.x; bd.path.y0 = bd.y; } }
        }
      }
    }
    // ---- kite: drifts in from the left at the field's top, sways ~8 s, leaves up-right; tap → a loop
    var k = this.kite;
    if (k) {
      k.t += h;
      if (k.state === 'in') {
        var uk = smooth(k.t / cfg.kiteIn);
        k.x = lerp(k.x0, k.ax, uk); k.y = lerp(k.y0 + 60, k.ay, uk); k.rot = 0.25 * (1 - uk) + 0.1 * Math.sin(1.3 * k.t);
        if (k.t >= cfg.kiteIn) { k.state = 'sway'; k.t = 0; }
      } else if (k.state === 'sway') {
        k.x = k.ax + 40 * Math.sin(0.5 * k.t); k.y = k.ay + 16 * Math.sin(0.9 * k.t); k.rot = 0.15 * Math.sin(0.8 * k.t) + 0.002 * this.wind;
        if (k.t >= cfg.kiteStay) this._kiteLeave();
      } else if (k.state === 'out') {
        var uo2 = smooth(k.t / cfg.kiteOut);
        k.x = lerp(k.ox, L.W + 160, uo2); k.y = lerp(k.oy, L.ins.top - 140, uo2 * uo2); k.rot = 0.3 * uo2;
        if (k.t >= cfg.kiteOut) this.kite = null;
      } else if (k.state === 'loop') {
        k.loopT += h;
        var ul2 = clamp(k.loopT / cfg.kiteLoop, 0, 1), a2 = TAU * smooth(ul2);
        k.x = k.lx + 30 * Math.sin(a2); k.y = k.ly - 30 * (1 - Math.cos(a2)); k.rot = k.rot0 + a2;
        if (ul2 >= 1) { k.rot = k.rot0; k.x = k.lx; k.y = k.ly; if (k.after === 'out') { k.state = 'out'; k.ox = k.x; k.oy = k.y; } else { k.state = k.after === 'in' ? 'sway' : k.after; } }
      }
    }
    // ---- snow: big flakes drift down between the bubbles; tap → twinkle into mini bubbles
    for (i = this.snowflakes.length - 1; i >= 0; i--) {
      var f = this.snowflakes[i];
      f.t += h;
      if (f.state === 'wait') { if (f.t >= 0) { f.state = 'fall'; f.t = 0; } else continue; }
      if (f.state === 'fall') {
        f.y += f.v * h; f.x = f.x0 + 26 * Math.sin(0.9 * f.t + f.ph) + 0.6 * this.wind * Math.min(f.t, 3); f.rot += 0.6 * h;
        f.a = Math.min(1, f.t / 0.6) * clamp((L.groundY - 20 - f.y) / 60, 0, 1);
        if (f.y > L.groundY - 20) this.snowflakes.splice(i, 1);
      } else if (f.state === 'twinkle') {
        var tw = clamp(f.t / cfg.snowTwinkle, 0, 1);
        f.tw = tw; f.a = 1 - tw; f.rot += 3 * h;
        if (tw >= 1) { this._spawnMinis(f.x, f.y, cfg.snowMinis); this.snowflakes.splice(i, 1); }
      }
    }
  };

  P._stepBao = function (h) {
    var b = this.bao, cfg = this.cfg, L = this.layout;
    b.x = L.bao.x; b.y = L.bao.y; b.h = L.bao.h; b.w = L.bao.w;
    if (b.moodT > 0) { b.moodT -= h; if (b.moodT <= 0) { b.moodT = 0; b.mood = 'idle'; } }
    b.blinkT -= h;
    if (b.blink && b.blinkT <= 0) { b.blink = false; b.blinkT = this._crng.float(cfg.blink[0], cfg.blink[1]); }
    else if (!b.blink && b.blinkT <= 0) { b.blink = true; b.blinkT = cfg.blinkTime; }
    if (b._bT >= 0) { b._bT += h; var u = b._bT / cfg.bounceTime; b.bounce = u < 1 ? Math.sin(Math.PI * u) : 0; if (u >= 1) b._bT = -1; }
    this._lookT -= h;
    var c = this._fieldCentre(), tx = c.x;
    if (this._g) tx = this.finger.x;
    else if (this.hintHand) tx = this.hintHand.x;
    else if (this._lookT > 0) tx = this._lookX;
    else if (this.bird && this.bird.state !== 'gone') tx = this.bird.x;
    else if (this.kite) tx = this.kite.x;
    b.lookX += (tx - b.lookX) * Math.min(1, h * cfg.lookRate);
    b.look = clamp((b.lookX - b.x) / 500, -1, 1);
    b.ring = b.mood === 'blow' ? L.bao.blowRing : L.bao.ring;
  };

  PB.World = World;
  PB.WindModel = WindModel;
})(window.PB = window.PB || {});
