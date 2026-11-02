/* Bim's Rainbow Rocket — RR.CONFIG + RR.World (headless, deterministic rocket-hop simulation; DESIGN §2, §5.2)
 *
 * ============================== CONVENTIONS ==============================
 *  Units: logical px (short side = 720), seconds, radians, y DOWN. rot > 0 = clockwise (canvas).
 *  WORLD space: x as the screen, y down and unbounded upwards. w.camY = world y of the screen top (only ever decreases in a
 *  session); screen y = world y − camY. Render with _pcamY + (camY − _pcamY)·alpha like every other _p* field.
 *  update(dt) runs fixed sub-steps of cfg.step (1/120 s); at the START of every sub-step each island, the rocket, the wagon,
 *  its rope points, flyers, the shooting star and the camera store _px/_py/_prot/_pcamY.
 *  Pointer input takes SCREEN logical px (the world adds camY). The result depends only on the seed and the sub-step at
 *  which inputs arrive.
 *
 *  Island i: (x, y) = centre of its TOP SURFACE (world). Cloud: puffy body below the surface, i.w wide × i.h (= 0.55·w) high.
 *    Planet (night): circle of diameter i.w·0.8 whose top is at y (i.h = 0.8·w). Draw scaled (sx, sy) about (x, y), rotated
 *    rot about (x, y), globalAlpha alpha, glow 0..1 = hint halo. The token sits on the surface: bottom-centre (x, y), size
 *    w.tokenSize(i) (0.5·w). i.collected → the token has left (do not draw it; a colour island stays coloured).
 *  Rocket: (x, y) = bottom-centre (the feet on the pad), height layout.rocket.h, width layout.rocket.w; rotate rot and scale
 *    (sx, sy) about (x, y); jitter by shake·3 px; flame 0..1 at the nozzle; glow 0..1 while waiting for the boost tap.
 *  Wagon: (x, y) = its HITCH point (art (80, 18) of 160×110), drawn layout.wagon.w wide, rotated rot about the hitch.
 *    rope[0] = the rocket's tow hook, rope[5] = the hitch. items[] = collected tokens (draw ≤ 5, small, between the halves).
 *  Flyer: a token flying into the wagon, centre (x, y), drawn at s × tokenSize, rotated rot.
 * ========================================================================
 */
(function (RR) {
  'use strict';

  var CONFIG = {
    // ---- timing / state machine (s)
    step: 1 / 120,             // fixed simulation sub-step (≤ 1/120 per DESIGN)
    maxFrame: 1.0,             // largest dt accepted per update() (speed mode passes big dt)
    roundsPerLevel: 4,         // rounds per chapter (warm-up + 3)
    chapterTimeLimit: 72,      // s since the chapter began: after ≥ chapterMinRounds rounds go to Talk time once exceeded (DESIGN 80; playtest 72)
    chapterMinRounds: 2,       // playtest P2-1: slow 3–4-year-olds stay ≤ 8 min (was 3)
    introTime: 2.5,            // chapter banner + time-of-day line (the 2.5 s sky crossfade)
    roundDoneTime: 1.0,        // phase 'stars': the wagon bursts into the round's stars, then 'boostReady'
    autoBoost: 4,              // s in boostReady without a tap → boost by itself
    talkAfterAnswer: 1.6,
    levelDoneTime: 1.8,
    talkAskTime: 12,           // s without an answer → talkAsk (re-ask), repeating
    talkGlowAfterAsks: 2,

    // ---- content (null → RR.Content tables: islands 3: 2,2,2,3 · 4: 2,3,3,3 · 5: 3,3,4,4 · 6–7: 3,4,4,4; hops 2,3,3,3)
    islandsByAge: null,
    hopsPerRound: [2, 2, 3, 3],   // DESIGN 2,3,3,3 (count-up rounds: N); playtest: 2,2,3,3 keeps 4-round chapters ≤ 100 s

    // ---- surprise round: one per chapter, the type rotates per chapter from a random start per session
    surpriseRound: 2,
    surpriseTypes: ['drift', 'shooting'],
    driftSpeed: 25,            // px/s, the whole row drifts together and bounces inside the field
    shootingDelay: [2.5, 4], // s into the ask of hop 1 (or 0) → a shooting star crosses …
    shootingTime: 3,           // … in 3 s
    shootingR: 70,             // tap radius (px)

    // ---- layout (DESIGN §2; px)
    shortSide: 720, minLong: 960, maxLong: 1600,
    tallRatio: 1.6, tallScale: 1.2,
    bubbleX: 24, bubbleY: 20, bubbleMaxW: 640, bubbleRightGap: 440, bubbleH: 122,
    bubbleHPort: 124, bubbleGapPort: 24, hudW: 160, hudH: 96,
    padLand: 118, padPort: 150,          // padY = H − ins.bottom − 118 (landscape) / 150 (portrait)
    rowBelowBubble: 175, rowFracLand: 0.42, rowFracPort: 0.47, rowMinFromPad: 0.30,
    islandW: { 3: 200, 4: 200, 5: 180, 6: 180, 7: 180 },
    islandAspect: 0.55,        // cloud height = 0.55·w
    planetFrac: 0.8,           // planet diameter = 0.8·w
    tokenFrac: 0.5,            // token size = 0.5·w
    islandGap: 28,             // min centre distance = w + 28
    rowJitter: 26,             // ± y per island
    zigzag: 70,                // portrait rows that do not fit side by side zig-zag ≥ ±70 px
    rocketGap: 14,             // an island over the rocket keeps 14 px above its nose (when the bubble allows)
    keepMargin: 8,             // tokens keep 8 px from the bubble / HUD / hudKeep
    hitPad: 24, rocketHitPad: 30,
    rocketH: 190, rocketAspect: 200 / 300,
    boostR: 78,

    // ---- motion
    appearTime: 0.4, appearStagger: 0.09, appearDrop: 60, appearBack: 1.9,   // back-out: 0 → 1.12 → 1
    leaveTime: 0.6, leaveDrop: 90,
    igniteTime: 0.35, igniteCrouch: 0.09, igniteShake: 1,
    flyBase: 0.4, flySpeed: 1000, flyTime: [0.6, 1.1],  // T = 0.4 + arc length/1000 s within [0.6, 1.1]
    flyApex: [60, 120], flyApexK: 0.25,  // apex above the straight line = clamp(0.25·d, 60, 120)
    flyBulge: [20, 60],                  // sideways bulge toward the screen centre (vertical-ish flights)
    thrustAccel: 0.35, thrustRetro: 0.3, // speed profile: accelerate 35 %, cruise, retro-decelerate 30 % of the time
    retroFlame: 0.3,
    rotMax: 0.9, rotOmega: 14, rotZeta: 0.75,
    liftStretch: 0.14,                   // liftoff stretch kick (sy 1.14 → spring)
    squashOmega: 18, squashZeta: 0.35,   // rocket squash spring (landing 0.82 → 1.06 → 1)
    landSquash: 0.18, landTime: 0.3,
    dipPx: 14, dipOmega: 14, dipZeta: 0.35,
    trailStep: 12, trailMax: 140, trailFade: 1.6,
    flyerTime: 0.55, flyerArc: 90, flyerScale: 0.45,
    climbOmega: 6,             // critically damped camera spring (95 % in ≈ 0.8 s)
    climbAppearAt: 0.4,        // the next row starts appearing when the climb is 40 % done
    wobbleAmp: 0.12, wobbleTime: 0.6, wobbleWiggles: 2.5, wrongHop: 12, hopG: 2200,

    // ---- help
    hintAfterMisses: 2,        // 2nd miss on a hop → the right island glows and bobs
    hintCooldown: 6,
    wrongLock: 0.8, wrongLock2: 1.6,   // s: island taps ignored after a wrong island (1.6 s from the 2nd miss of a hop) → event 'locked'
    dragSnap: 80,              // px: a drag released near an island (≤ 80 px from its hit box) flies there; else 'dragMiss'
    zigzagGap: 52,             // zig-zag rows: centre distance ≥ islandW + 52 so the padded hit areas never overlap
    hintGlowTime: 4, hintBob: 6, hintBobHz: 1.6,
    idleTime: 12, idleBackoff: 1.5, idleMax: 30, idleHintFrom: 1,
    tapMove: 24, tapTime: 0.35,          // a press on the rocket is a TAP when it moves < 24 px and lasts < 0.35 s

    // ---- boost
    boostIgnite: 0.25, boostRise: 1.2, boostDecel: 0.5, boostDistH: 1.5,   // D = 1.5·H in 0.25 + 1.4 + 0.5 s
    boostAccel: 0.3,           // fraction of the flight accelerating (the last boostDecel s decelerate)
    boostCamOmega: 10, boostSettle: 0.25,
    readyBounceHz: 1.4, readyBouncePx: 10,

    // ---- wagon
    ropeN: 6, ropeLen: 0.55,   // × rocket h
    wagonW: 0.6,               // × rocket h (art 160 × 110, hitch at (80, 18))
    wagonG: 700, wagonDrag: 1.2, wagonOmega: 7, wagonZeta: 0.55, ropeIters: 6, ropeDamp: 0.985, wagonSink: 10,

    // ---- Bim
    moodTime: { happy: 0.9, cheer: 1.6, oops: 0.8, think: 1.4 }, lookRate: 6
  };
  RR.CONFIG = CONFIG;

  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hyp(x, y) { return Math.sqrt(x * x + y * y); }
  function smooth(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  function merge(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; if (b) for (k in b) o[k] = b[k]; return o; }
  /** world.hudKeep: one box or an array of boxes (screen px) → clean array of valid boxes (null when none). */
  function keepBoxes(hk) {
    var a = Array.isArray(hk) ? hk : hk ? [hk] : [], out = [];
    for (var i = 0; i < a.length; i++) { var b = a[i]; if (b && b.w > 0 && b.h > 0) out.push({ x: +b.x, y: +b.y, w: +b.w, h: +b.h }); }
    return out.length ? out : null;
  }
  function overlap(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
  /** semi-implicit spring o[k] → target (o[v] = velocity) */
  function spring(o, k, v, target, w, z, h) { o[v] += (w * w * (target - o[k]) - 2 * z * w * o[v]) * h; o[k] += o[v] * h; }
  /** Initial velocity that makes a damped spring (from rest at 0) peak at `peak`. */
  function kickFor(peak, w, z) { var s = Math.sqrt(1 - z * z); return peak * w * Math.exp(z / s * Math.atan2(s, z)); }
  /** back-out ease: 0 → overshoot → 1 */
  function backOut(u, c) { u = clamp(u, 0, 1) - 1; return 1 + (c + 1) * u * u * u + c * u * u; }
  /** Thrust-like distance profile s(u): accelerate (a), cruise, decelerate (d); s(0)=0, s(1)=1, continuous speed. */
  function thrust(u, a, d) {
    u = clamp(u, 0, 1);
    var v = 1 / (1 - a / 2 - d / 2);
    if (u < a) return v * u * u / (2 * a);
    if (u > 1 - d) return 1 - v * (1 - u) * (1 - u) / (2 * d);
    return v * (a / 2 + (u - a));
  }
  function thrustV(u, a, d) {   // normalized speed (peak 1)
    u = clamp(u, 0, 1);
    return u < a ? u / a : u > 1 - d ? (1 - u) / d : 1;
  }
  function bez(p0, p1, p2, p3, t) { var q = 1 - t; return q * q * q * p0 + 3 * q * q * t * p1 + 3 * q * t * t * p2 + t * t * t * p3; }
  function bezD(p0, p1, p2, p3, t) { var q = 1 - t; return 3 * q * q * (p1 - p0) + 6 * q * t * (p2 - p1) + 3 * t * t * (p3 - p2); }

  /** DESIGN §2 short-side rule: CSS viewport → logical W×H. */
  function logicalSize(cssW, cssH, cfg) {
    cfg = cfg || CONFIG;
    var S = cfg.shortSide, aspect = cssW / Math.max(1, cssH);
    if (cssW >= cssH) return { W: clamp(Math.round(S * aspect), cfg.minLong, cfg.maxLong), H: S };
    return { W: S, H: clamp(Math.round(S / aspect), cfg.minLong, cfg.maxLong) };
  }

  function computeLayout(W, H, ins, cfg, age) {
    ins = { top: +(ins && ins.top) || 0, right: +(ins && ins.right) || 0, bottom: +(ins && ins.bottom) || 0, left: +(ins && ins.left) || 0 };
    var portrait = H > W, tall = H / W > cfg.tallRatio, scale = tall ? cfg.tallScale : 1;
    var bx = ins.left + cfg.bubbleX;
    var bubble = portrait
      ? { x: bx, y: ins.top + cfg.hudH + cfg.bubbleGapPort, w: W - bx - ins.right - cfg.bubbleX, h: cfg.bubbleHPort }
      : { x: bx, y: ins.top + cfg.bubbleY, w: Math.min(cfg.bubbleMaxW, W - bx - ins.right - cfg.bubbleRightGap), h: cfg.bubbleH };
    bubble.w = Math.max(0, bubble.w);
    var hud = { x: W - ins.right - cfg.hudW, y: 0, w: cfg.hudW + ins.right, h: ins.top + cfg.hudH };
    var padY = H - ins.bottom - (portrait ? cfg.padPort : cfg.padLand);
    var bb = bubble.y + bubble.h;
    var rowY = portrait ? Math.min(cfg.rowFracPort * H, padY - cfg.rowMinFromPad * H) : Math.max(bb + cfg.rowBelowBubble, cfg.rowFracLand * H);
    var iw = (cfg.islandW[age] || cfg.islandW[5]) * scale;
    var rh = cfg.rocketH * scale, rw = rh * cfg.rocketAspect;
    var L = {
      W: W, H: H, ins: ins, portrait: portrait, tall: tall, scale: scale, bubble: bubble, hud: hud, padY: padY, rowY: rowY,
      islandW: iw, islandH: iw * cfg.islandAspect, tokenSize: iw * cfg.tokenFrac,
      field: { x0: ins.left + iw * 0.6, x1: W - ins.right - iw * 0.6 },
      rocket: { h: rh, w: rw },
      wagon: { w: rh * cfg.wagonW, h: rh * cfg.wagonW * 110 / 160 },
      boost: { x: W / 2, y: padY - rh / 2, r: cfg.boostR },
      safe: { x: ins.left, y: ins.top, w: W - ins.left - ins.right, h: H - ins.top - ins.bottom }
    };
    return L;
  }

  // ------------------------------------------------------------------ World
  function World(opts) {
    opts = opts || {};
    this.cfg = merge(CONFIG, opts.config);
    this.seed = opts.seed !== undefined ? opts.seed : 1;
    this.rng = new RR.RNG(this.seed);
    this.age = RR.Content.ageOf(opts.age !== undefined ? opts.age : 4);
    this.lang = opts.lang === 'vi' ? 'vi' : 'en';
    this._pendingAge = this.age; this._pendingLang = this.lang;
    this.state = 'menu'; this.phase = null;
    this.level = 0; this.levels = []; this.topic = null; this.weather = 0;
    this.round = 0; this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.stars = 0; this.levelStars = 0; this.roundStars = 0;
    this.hop = 0; this.hops = 0; this.misses = 0; this.hopMisses = 0; this.streak = 0;
    this.time = 0; this.stateTime = 0; this.phaseTime = 0; this.alpha = 0; this._acc = 0;
    this.cur = null; this.islands = []; this.flyers = []; this.trail = []; this.collected = [];
    this.talk = null; this.talkAnswered = null; this.wind = 0; this.hudKeep = opts.hudKeep || null; this.lastTopics = null;
    this.surprise = null; this._surpriseOff = 0;
    this.camY = 0; this._pcamY = 0; this._camV = 0; this._camT = 0; this._camW = this.cfg.climbOmega;
    this.aim = null; this._drag = null; this.shooting = null; this.boostT = 0; this.boostSpeed = 0; this.cloudBankY = null;
    this.bim = { mood: 'idle', moodT: 0, lookX: 0, lookY: 0 };
    this.events = []; this.sessions = 0; this._idN = 0;
    this._idleN = 0; this._idleT = 0; this._idleGap = this.cfg.idleTime; this._lastHintT = -1e9; this.levelStartTime = 0;
    this._talkAskT = 0; this._talkAsks = 0; this._aboveLast = false; this._row = null; this._fl = null; this._bst = null;
    this._wrongIds = []; this._lockUntil = -1;
    this.rocket = { x: 0, y: 0, _px: 0, _py: 0, rot: 0, _prot: 0, sx: 1, sy: 1, vx: 0, vy: 0, flame: 0, phase: 'rest', shake: 0,
      pad: null, glow: 0, _q: 0, _qv: 0, _rv: 0, _hopT: -1, _hopY: 0, _bounce: 0 };
    this.wagon = { x: 0, y: 0, _px: 0, _py: 0, rot: 0, _prot: 0, vx: 0, vy: 0, _rv: 0, items: [], rope: [], side: -1, burst: null };
    this.setViewport(opts.width || 1280, opts.height || 720, opts.ins || null);
    this._resetPad();
  }
  World.logicalSize = logicalSize;
  World.computeLayout = function (W, H, ins, cfg, age) { return computeLayout(W, H, ins, merge(CONFIG, cfg), RR.Content.ageOf(age || 4)); };
  World.thrust = thrust;

  var P = World.prototype;
  Object.defineProperty(P, 'items', { get: function () { return this.islands; } });   // old code paths
  Object.defineProperty(P, 'interactive', { get: function () { return this.state === 'round' && this.phase === 'ask'; } });
  P._emit = function (e) { this.events.push(e); };
  P.drainEvents = function () { var e = this.events; this.events = []; return e; };
  P.setAge = function (a) { this._pendingAge = RR.Content.ageOf(a); };
  P.setLang = function (l) { this._pendingLang = l === 'vi' ? 'vi' : 'en'; };
  P.islandById = function (id) { for (var i = 0; i < this.islands.length; i++) if (this.islands[i].id === id) return this.islands[i]; return null; };
  P.itemById = P.islandById;
  P._setState = function (s) { this.state = s; this.stateTime = 0; };
  P._setPhase = function (p) { this.phase = p; this.phaseTime = 0; };
  P._mood = function (m) { this.bim.mood = m; this.bim.moodT = this.cfg.moodTime[m] || 1; };
  P.skipTalk = function () { if (this.state === 'talk') this._levelDone(); };
  P._hop = function () { return this.cur ? this.cur.hops[this.hop] : null; };
  /** The current question {promptKey, params} (null outside a round). */
  P.prompt = function () {
    var h = this.state === 'round' ? this._hop() : null;
    return h ? { promptKey: h.promptKey, params: h.params } : null;
  };
  /** Id of the right island of the current hop (null when no row is up). */
  P.answerId = function () {
    if (!this._row) return null;
    var a = this.islandById(this._row.answerId);
    return a && (a.state === 'idle' || a.state === 'appear') ? a.id : null;
  };
  P.tokenSize = function (i) { return (i ? i.w : this.layout.islandW) * this.cfg.tokenFrac; };
  P._style = function () { return this.weather >= 3 ? 'planet' : 'cloud'; };

  // ---------------------------------------------------------------- geometry
  P._islandH = function (style, w) { return style === 'planet' ? w * this.cfg.planetFrac : w * this.cfg.islandAspect; };
  /** Island hit test (world): body ellipse (+24) or the token box (+24). Returns a distance score or -1. */
  P._hitIsland = function (i, x, y) {
    var pad = this.cfg.hitPad, s = Math.max(0.5, i.sx), ts = this.tokenSize(i) * s;
    var ew, eh, cx = i.x, cy;
    if (i.style === 'planet') { ew = eh = i.w * this.cfg.planetFrac / 2 * s + pad; cy = i.y + i.w * this.cfg.planetFrac / 2; }
    else { ew = i.w * s / 2 + pad; eh = i.h * s / 2 + pad; cy = i.y + i.h / 2; }
    var dx = (x - cx) / ew, dy = (y - cy) / eh, inE = dx * dx + dy * dy <= 1;
    var inT = Math.abs(x - i.x) <= ts / 2 + pad && y >= i.y - ts - pad && y <= i.y + pad;
    if (!inE && !inT) return -1;
    return hyp(x - i.x, y - (i.y + (i.h - ts) / 2));
  };
  P._rocketBox = function () { var r = this.rocket, R = this.layout.rocket; return { x: r.x - R.w / 2, y: r.y - R.h, w: R.w, h: R.h }; };
  P._inRocket = function (x, y, pad) { var b = this._rocketBox(); return x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad; };
  /** Screen rect (logical px) of an island's hit area: centre (x, y), size w × h. */
  P.islandHit = function (id) {
    var i = typeof id === 'object' ? id : this.islandById(id);
    if (!i) return null;
    var ts = this.tokenSize(i), top = i.y - ts, bot = i.y + i.h;
    return { x: i.x, y: (top + bot) / 2 - this.camY, w: i.w, h: bot - top };
  };
  P.rocketHit = function () { var b = this._rocketBox(); return { x: b.x + b.w / 2, y: b.y + b.h / 2 - this.camY, w: b.w, h: b.h }; };

  // ---------------------------------------------------------------- viewport
  P.setViewport = function (W, H, ins) {
    var old = this.layout;
    this.layout = computeLayout(W, H, ins, this.cfg, this.age);
    this.layout.hudKeep = keepBoxes(this.hudKeep);
    if (old && this.rocket && this.rocket.pad) this._relayout(old);
    this._updBoostBtn();
  };

  /** Rotation / resize while playing: every world object is mapped (screen-relative, camY unchanged) into the new field;
   * the current row is placed again (same seed → same token slots), a flight is re-aimed at its island's new spot. */
  P._relayout = function (O) {
    var L = this.layout, cam = this.camY, self = this;
    function seg(v, a0, a1, b0, b1) { return b0 + (v - a0) * (b1 - b0) / ((a1 - a0) || 1); }
    function mapY(sy) {
      if (sy <= O.rowY) return seg(sy, 0, O.rowY, 0, L.rowY);
      if (sy <= O.padY) return seg(sy, O.rowY, O.padY, L.rowY, L.padY);
      return seg(sy, O.padY, O.H, L.padY, L.H);
    }
    function mapX(x) { return seg(x, O.field.x0, O.field.x1, L.field.x0, L.field.x1); }
    function mp(o, kx, ky) { o[kx] = mapX(o[kx]); o[ky] = cam + mapY(o[ky] - cam); }
    var k = L.islandW / O.islandW;
    this.islands.forEach(function (i) {
      var x0 = i.x, y0 = i.y;
      mp(i, 'x', 'y');
      i._bx += i.x - x0; i._by += i.y - y0; i._px = i.x; i._py = i.y;
      i.w = i.w * k; i.h = self._islandH(i.style, i.w);
      i._bx = clamp(i._bx, L.field.x0, L.field.x1);
    });
    var r = this.rocket;
    mp(r, 'x', 'y'); r._px = r.x; r._py = r.y;
    var pad = this.islandById(r.pad);
    if (pad && r.phase !== 'fly' && r.phase !== 'boost') r.x = pad._bx;
    r.x = clamp(r.x, L.ins.left + L.rocket.w / 2 + 4, L.W - L.ins.right - L.rocket.w / 2 - 4);
    var w = this.wagon;
    mp(w, 'x', 'y'); w._px = w.x; w._py = w.y;
    w.rope.forEach(function (p) { mp(p, 'x', 'y'); p._px = p.x; p._py = p.y; p.ox = p.x; p.oy = p.y; });
    this.trail.forEach(function (p) { mp(p, 'x', 'y'); });
    this.flyers.forEach(function (f) { mp(f, 'x', 'y'); mp(f, 'x0', 'y0'); f._px = f.x; f._py = f.y; });
    if (this.shooting) { mp(this.shooting, 'x', 'y'); this.shooting._px = this.shooting.x; this.shooting._py = this.shooting.y; }
    if (this.aim) mp(this.aim, 'x', 'y');
    if (this._drag) { this._drag.x0 = mapX(this._drag.x0); this._drag.y0 = mapY(this._drag.y0); }
    // camera target: the island the rocket stands on (or is climbing to) goes to padY
    if (pad && r.phase !== 'fly' && r.phase !== 'boost') this._camT = Math.min(cam, pad._by - L.padY);
    else this._camT = Math.min(this._camT, cam);
    // the current row: placed again for the new field
    if (this._row && this._row.ids.some(function (id) { var i = self.islandById(id); return i && (i.state === 'appear' || i.state === 'idle'); })) {
      this._placeRow(this._row, this._row.camT = Math.min(this._camT, cam) , true);
    }
    if (this._fl) {
      this._fl.x0 = mapX(this._fl.x0); this._fl.y0 = cam + mapY(this._fl.y0 - cam);
      if (r.phase === 'ignite' && pad) { this._fl.x0 = pad.x; this._fl.y0 = pad.y; }
      this._aimFlight();
    }
    if (this._bst) {
      this._bst.x = r.x; this._bst.y0 = cam + mapY(this._bst.y0 - cam);
      var np = this.islandById(this._bst.pad); if (np) { np._bx = r.x; this._bst.y1 = np._by; }
    }
    this._snapWagonInside();
  };

  P._updBoostBtn = function () {
    var L = this.layout, r = this.rocket;
    if (!r) return;
    L.boost.x = r.x; L.boost.y = r.y - this.camY - L.rocket.h / 2;
  };

  // ---------------------------------------------------------------- session flow
  P._newId = function () { return 'i' + (this._idN++); };
  P._makeIsland = function (bx, by, token, state) {
    var L = this.layout, style = this._style();
    var i = { id: this._newId(), x: bx, y: by, _px: bx, _py: by, _bx: bx, _by: by, w: L.islandW, h: this._islandH(style, L.islandW),
      rot: 0, _prot: 0, sx: 1, sy: 1, style: style, token: token || null, state: state || 'idle', t: 0, wob: 0, glow: 0, alpha: 1,
      collected: false, _dip: 0, _dv: 0, _wobT: -1, _glowT: 0, _drift: 0, _ph: this.rng.float(0, TAU), _lv: 0, launch: false };
    this.islands.push(i);
    return i;
  };

  /** The launch pad at the bottom-centre of the screen (a new session starts on the ground). */
  P._resetPad = function () {
    var L = this.layout;
    this.islands = []; this.flyers = []; this.trail = [];
    this.camY = this._pcamY = this._camT = 0; this._camV = 0;
    var p = this._makeIsland(L.W / 2, L.padY, null, 'pad');
    p.launch = true;
    var r = this.rocket;
    r.x = r._px = p.x; r.y = r._py = p.y; r.rot = r._prot = 0; r.sx = r.sy = 1; r.vx = r.vy = 0; r.flame = 0; r.phase = 'rest';
    r.shake = 0; r.pad = p.id; r.glow = 0; r._q = r._qv = r._rv = 0; r._hopT = -1; r._hopY = 0; r._bounce = 0;
    this.wagon.items = []; this.wagon.burst = null;
    this._snapWagon();
    this._updBoostBtn();
  };

  /** opts.lastTopics (or w.lastTopics): the previous session's chapter topics → this session rotates (RR.Content.topicsFor). */
  P.newSession = function (opts) {
    this.age = this._pendingAge; this.lang = this._pendingLang;
    this.sessions++;
    var L = this.layout;
    this.layout = computeLayout(L.W, L.H, L.ins, this.cfg, this.age);
    this.layout.hudKeep = L.hudKeep;
    var last = (opts && opts.lastTopics) || this.lastTopics || null;
    this.levels = RR.Content.topicsFor(this.age, this.rng, last);
    this._surpriseOff = this.rng.int(0, Math.max(0, this.cfg.surpriseTypes.length - 1));
    this.stars = 0; this.collected = []; this._aboveLast = false; this._row = null; this._fl = null; this._bst = null;
    this.aim = null; this._drag = null; this.shooting = null; this.cloudBankY = null;
    this.weather = 0;
    this._resetPad();
    this._emit({ type: 'session', levels: this.levels.slice() });
    this.startLevel(0);
  };

  P.startLevel = function (i) {
    if (!this.levels.length) this.levels = RR.Content.topicsFor(this.age);
    this.level = clamp(i | 0, 0, this.levels.length - 1);
    this.topic = this.levels[this.level];
    this.weather = this.level;
    this.round = 0; this.levelStars = 0; this.levelStartTime = this.time;
    this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.cur = null; this.talk = null; this.talkAnswered = null; this.surprise = null; this._row = null;
    this.aim = null; this._drag = null; this.shooting = null;
    this._cancelMotion();
    // keep only the pad
    var pad = this.rocket.pad;
    this.islands = this.islands.filter(function (x) { return x.id === pad; });
    this._setState('intro'); this.phase = null;
    this._emit({ type: 'level', level: this.level, topic: this.topic });
  };

  /** A forced jump (startLevel mid-flight / mid-boost, debug gotoLevel): the rocket settles on a pad at once. */
  P._cancelMotion = function () {
    var r = this.rocket, B = this._bst;
    if (B) { var np = this.islandById(B.pad); if (np) { r.pad = np.id; np.state = 'pad'; np.sx = np.sy = 1; np.alpha = 1; np.t = 0; } }
    if (this._fl) { var t = this.islandById(this._fl.target); if (t && r.phase === 'fly') { r.pad = t.id; t.state = 'pad'; t.collected = true; } }
    this._fl = null; this._bst = null; this.flyers = []; this.boostT = 0; this.boostSpeed = 0; this.cloudBankY = null; this._camW = this.cfg.climbOmega;
    if (r.phase !== 'rest') { r.phase = 'rest'; r.flame = 0; r.shake = 0; }
    var pad = this.islandById(r.pad);
    if (pad) { r.x = pad.x; r.y = pad.y; this._camT = Math.min(this.camY, pad._by - this.layout.padY); }
  };

  P._beginRound = function () {
    var cfg = this.cfg;
    var rr = new RR.RNG((this.rng.next() * 4294967296) >>> 0);
    var ST = cfg.surpriseTypes, sp = ST && ST.length && this.round === cfg.surpriseRound ? ST[(this.level + this._surpriseOff) % ST.length] : null;
    this.cur = RR.Content.makeRound(this.topic, { age: this.age, lang: this.lang, rng: rr, roundIndex: this.round, surprise: sp,
      islandsByAge: cfg.islandsByAge, hopsPerRound: cfg.hopsPerRound });
    this.surprise = sp;
    this.hop = 0; this.hops = this.cur.hops.length; this.misses = 0; this.hopMisses = 0; this.streak = 0;
    this._shootAt = -1; this._shootDone = false; this.shooting = null;
    this._setState('round');
    this._emit({ type: 'round', round: this.round, topic: this.topic, hops: this.hops, surprise: sp });
    this._spawnRow(this._camT);
  };

  /** Spawns the islands of the current hop for a camera at camT (screen positions → world). Phase 'appear'. */
  P._spawnRow = function (camT) {
    var cfg = this.cfg, h = this._hop(), self = this;
    var row = { hop: this.hop, seed: (this.rng.next() * 4294967296) >>> 0, ids: [], answerId: null, camT: camT, driftV: 0, drift: 0 };
    h.tokens.forEach(function (tk, k) {
      var i = self._makeIsland(0, 0, tk, 'appear');
      i.t = -k * cfg.appearStagger; i.sx = i.sy = 0; i.alpha = 0; i._emitted = false;
      row.ids.push(i.id);
      if (k === h.answer) row.answerId = i.id;
    });
    this._row = row; this._wrongIds = []; this._lookId = null; this._lockUntil = -1;
    this.islands.forEach(function (o) { if (o.state === 'leave') o.state = 'gone'; });   // ≤ 6 islands alive (DESIGN §8)
    this._placeRow(row, camT, false);
    if (this.surprise === 'drift') row.driftV = (this.rng.chance(0.5) ? 1 : -1) * cfg.driftSpeed;
    this._idleT = 0; this._idleGap = cfg.idleTime; this._idleN = 0;
    this._setPhase('appear');
  };

  /** Row placement (screen → world at camT). Deterministic from row.seed, so a rotation re-places it the same way. */
  P._placeRow = function (row, camT, keep) {
    var L = this.layout, cfg = this.cfg, rr = new RR.RNG(row.seed), n = row.ids.length, self = this;
    var iw = L.islandW, style = this._style(), ih = this._islandH(style, iw), ts = iw * cfg.tokenFrac;
    var minD = iw + cfg.islandGap, x0 = L.field.x0, x1 = L.field.x1, span = Math.max(0, x1 - x0);
    var rx = this.rocket.x, rw = L.rocket.w, xs = [], ys = [], k;
    var keeps = [L.bubble, L.hud].concat(keepBoxes(this.hudKeep) || []), m = cfg.keepMargin;   // + the real DOM HUD / bubble boxes (main.js)
    var lim = L.padY - L.rocket.h - ih - cfg.rocketGap;        // an island over the rocket keeps above its nose
    var overRocket = function (x) { return Math.abs(x - rx) < iw / 2 + rw / 2 + 10; };
    var keepMin = function (x) {                                // the highest surface y whose token clears every keep-out
      var y = -1e9;
      for (var q = 0; q < keeps.length; q++) {
        var K = keeps[q];
        if (K.w > 0 && x + ts / 2 + m > K.x && x - ts / 2 - m < K.x + K.w) y = Math.max(y, K.y + K.h + ts + m);
      }
      return y;
    };
    if ((n - 1) * minD <= span) {
      // one row: the slack is split at random between the n + 1 gaps; a few tries, fewest islands over the rocket wins
      var best = null, bestBad = 1e9;
      for (var tr = 0; tr < 6; tr++) {
        var cuts = [], tot = 0, slack = span - (n - 1) * minD, xx = [];
        for (k = 0; k <= n; k++) { var c = rr.float(0.4, 1); cuts.push(c); tot += c; }
        var acc = x0;
        for (k = 0; k < n; k++) { acc += slack * cuts[k] / tot; xx.push(acc + k * minD); }
        var bad = xx.filter(overRocket).length;
        if (bad < bestBad) { bestBad = bad; best = xx; }
      }
      xs = best;
      // keep-out vs "above the rocket's nose": when a keep-out pushes an island over the rocket down onto it, the row is
      // laid out again in the two segments left and right of the rocket's column instead (visual QA P1-2)
      var half = iw / 2 + rw / 2 + 11, yoff = null, grp = null;
      var clashes = function (arr) { return arr.some(function (x) { return overRocket(x) && keepMin(x) > lim; }); };
      if (clashes(xs)) {
        // the two segments left and right of the rocket's column; each holds a straight row or, when narrow, a zig-zag
        // (neighbours ±A in y; islands two apart are ≥ minD in x). Segments are ≥ 2·half > minD apart.
        var segA = [x0, Math.min(x1, rx - half)], segB = [Math.max(x0, rx + half), x1], opts = [];
        var mode = function (sg, c) {
          var sp = sg[1] - sg[0];
          if (c === 0) return 'none';
          if (sp < 0) return null;
          if (c === 1 || (c - 1) * minD <= sp) return 'row';
          if (c === 2 || 2 * sp / (c - 1) >= minD) return 'zig';
          return null;
        };
        for (var na = 0; na <= n; na++) {
          var ma = mode(segA, na), mb = mode(segB, n - na);
          if (ma && mb) opts.push({ na: na, cost: (ma === 'zig') + (mb === 'zig') });
        }
        if (opts.length) {
          var cmin = Math.min.apply(null, opts.map(function (o) { return o.cost; }));
          var nA = rr.pick(opts.filter(function (o) { return o.cost === cmin; })).na;
          xs = []; yoff = []; grp = [];
          [[segA, nA, 0], [segB, n - nA, 1]].forEach(function (S) {
            var sg = S[0], c = S[1], md = mode(sg, c);
            if (!c) return;
            if (md === 'row') {
              var off = rr.float(0, Math.max(0, sg[1] - sg[0] - (c - 1) * minD));
              for (var q = 0; q < c; q++) { xs.push(sg[0] + off + q * minD); yoff.push(rr.float(-cfg.rowJitter, cfg.rowJitter)); grp.push(S[2]); }
            } else {
              var dz = (sg[1] - sg[0]) / (c - 1), Az = Math.sqrt(Math.max(0, minD * minD - dz * dz)) / 2 + 6, gz = rr.chance(0.5) ? 1 : -1;
              for (var q2 = 0; q2 < c; q2++) { xs.push(sg[0] + q2 * dz); yoff.push((q2 % 2 ? Az : -Az) * gz); grp.push(S[2]); }
            }
          });
        }
      }
      for (k = 0; k < n; k++) {
        ys.push(L.rowY + (yoff ? yoff[k] : rr.float(-cfg.rowJitter, cfg.rowJitter)));
        if (yoff) continue;                                    // segments beside the rocket move as groups (below)
        if (overRocket(xs[k])) ys[k] = Math.min(ys[k], lim);
        ys[k] = Math.max(ys[k], keepMin(xs[k]));               // neighbours are ≥ minD apart in x: y moves never crowd them
      }
      if (yoff) [0, 1].forEach(function (gi) {
        var pz = -1e9, j;
        for (j = 0; j < n; j++) if (grp[j] === gi) pz = Math.max(pz, keepMin(xs[j]) - ys[j]);
        if (pz > 0) for (j = 0; j < n; j++) if (grp[j] === gi) ys[j] += pz;
      });
    } else {
      // zig-zag: even x spacing across the field, alternate rows ≥ ±zigzag apart (enough for the min distance)
      var zD = iw + Math.max(cfg.islandGap, cfg.zigzagGap || 0);   // functional QA B3: padded hit areas never overlap
      var dx = n > 1 ? span / (n - 1) : 0, A = Math.max(cfg.zigzag, Math.sqrt(Math.max(0, zD * zD - dx * dx)) / 2 + 2);
      var sg0 = rr.chance(0.5) ? 1 : -1, bestL = 1e9, sg = sg0;
      [sg0, -sg0].forEach(function (g) {                       // the phase that needs the smaller lift over the rocket wins
        var need = 0;
        for (var j = 0; j < n; j++) if (overRocket(x0 + j * dx)) need = Math.max(need, L.rowY + (j % 2 ? A : -A) * g - lim);
        if (need < bestL - 1e-9) { bestL = need; sg = g; }
      });
      for (k = 0; k < n; k++) { xs.push(x0 + k * dx); ys.push(L.rowY + (k % 2 ? A : -A) * sg); }
      // the whole row moves together (keeps the spacing): up for the rocket, but never into a keep-out
      var room = 1e9, push = 0;
      for (k = 0; k < n; k++) { var km = keepMin(xs[k]); room = Math.min(room, ys[k] - km); push = Math.max(push, km - ys[k]); }
      var shift = push > 0 ? push : -Math.min(Math.max(0, bestL), Math.max(0, room));
      for (k = 0; k < n; k++) ys[k] += shift;
      // still an island on the rocket (keep-outs leave no room to lift the row)? Two tiers instead: the islands over the
      // rocket's column sit high (≤ lim), the rest lower beside the rocket, ≥ zD from every upper island (visual QA P1-2)
      var stuck = false;
      for (k = 0; k < n; k++) if (overRocket(xs[k]) && ys[k] > lim + 0.5) stuck = true;
      if (stuck) {
        var hz = rw / 2 + iw / 2 + 11, nu = Math.ceil(n / 2), up = [], lo = [], j;
        for (j = 0; j < nu; j++) up.push(clamp(rx + (j - (nu - 1) / 2) * zD, x0, x1));
        var left = [x0, rx - hz], right = [rx + hz, x1], slots2 = [];
        [left, right].forEach(function (sg) { for (var x = sg[0]; x <= sg[1] + 1e-6 && sg[1] >= sg[0]; x += zD) slots2.push(x); });
        slots2.sort(function (p, q) { return Math.abs(q - rx) - Math.abs(p - rx); });   // outermost first
        for (j = 0; j < n - nu && j < slots2.length; j++) lo.push(slots2[j]);
        if (lo.length === n - nu) {
          var yu = -1e9; up.forEach(function (x) { yu = Math.max(yu, keepMin(x)); });
          yu = Math.max(yu, Math.min(lim, L.rowY));
          var okT = yu <= lim + 0.5, X = [], Y = [];
          up.forEach(function (x) { X.push(x); Y.push(yu); });
          lo.forEach(function (x) {
            var y = Math.max(keepMin(x), L.rowY);
            up.forEach(function (ux) { var ddx = Math.abs(ux - x); if (ddx < zD) y = Math.max(y, yu + Math.sqrt(zD * zD - ddx * ddx) + 1); });
            if (y + ih > L.H - L.ins.bottom - 10) okT = false;
            X.push(x); Y.push(y);
          });
          // up islands in one row must also be ≥ zD apart (clamping may squeeze them)
          for (j = 1; j < up.length; j++) if (up[j] - up[j - 1] < zD - 1e-6) okT = false;
          if (okT) {
            var ord = X.map(function (x, q) { return q; }).sort(function (p, q) { return X[p] - X[q]; });
            xs = ord.map(function (q) { return X[q]; }); ys = ord.map(function (q) { return Y[q]; });
          }
        }
      }
    }
    // slots → tokens: a fixed shuffle; the answer is never straight above the rocket twice in a row
    var slots = rr.shuffle(xs.map(function (x, j) { return j; }));
    var ai = row.ids.indexOf(row.answerId);
    var above = function (j) { return Math.abs(xs[j] - rx) < iw / 2; };
    if (!keep) {
      if (this._aboveLast && above(slots[ai])) {
        for (k = 0; k < n; k++) if (k !== ai && !above(slots[k])) { var t = slots[k]; slots[k] = slots[ai]; slots[ai] = t; break; }
      }
      row.slots = slots;
      this._aboveLast = above(slots[ai]);
    } else slots = row.slots;
    row.ids.forEach(function (id, j) {
      var i = self.islandById(id); if (!i) return;
      i._bx = xs[slots[j]]; i._by = camT + ys[slots[j]];
      if (keep) { i.x = i._px = i._bx + row.drift; i.y = i._py = i._by; }
    });
    row.camT = camT;
  };

  P._endRound = function () {
    var m = this.misses, st = m === 0 ? 3 : m === 1 ? 2 : 1;
    this.roundStars = st; this.stars += st; this.levelStars += st;
    this._setState('roundDone'); this._setPhase('stars');
    this._mood('cheer');
    var w = this.wagon;
    w.burst = { items: w.items.slice(), t: 0 }; w.items = [];
    this._row = null; this.shooting = null;
    this._emit({ type: 'roundDone', round: this.round, stars: st, misses: m });
  };

  P._startTalk = function () {
    var rr = new RR.RNG((this.rng.next() * 4294967296) >>> 0);
    this.talk = RR.Content.makeTalk(this.topic, { age: this.age, lang: this.lang, rng: rr });
    this.talk.glowAnswer = false;
    this.talkAnswered = null; this._talkAskT = 0; this._talkAsks = 0;
    this.cur = null; this.phase = null;
    this._setState('talk');
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

  // ---------------------------------------------------------------- input (SCREEN logical px)
  P._rowIsland = function (x, y) {
    var best = null, bd = 1e9;
    for (var i = 0; i < this.islands.length; i++) {
      var o = this.islands[i];
      if (o.state !== 'idle' || !this._row || this._row.ids.indexOf(o.id) < 0) continue;
      var d = this._hitIsland(o, x, y);
      if (d >= 0 && d < bd) { bd = d; best = o; }
    }
    return best;
  };

  P._locked = function () { return this.time < this._lockUntil; };
  P._touch = function () { this._idleT = 0; this._idleGap = this.cfg.idleTime; };   // a tap that hit something
  P.pointerDown = function (sx, sy) {
    var x = sx, y = sy + this.camY, cfg = this.cfg;
    if (this.state === 'roundDone' && this.phase === 'boostReady') { this._boost(false); return 'boost'; }
    if (this.state !== 'round') return null;
    var S = this.shooting;
    if (S && !S.caught && hyp(x - S.x, y - S.y) <= cfg.shootingR) {
      this._touch();
      S.caught = true; S.t = Math.max(S.t, 0);
      this._emit({ type: 'shootingTap', x: S.x, y: S.y - this.camY });
      return 'shooting';
    }
    if (this.phase !== 'ask') return null;
    this._drag = null; this.aim = null;
    // the rocket body first, then an island, then the rocket's padded box, then the pad
    var isl = this._rowIsland(x, y);
    if (this._inRocket(x, y, 0) || (!isl && this._inRocket(x, y, cfg.rocketHitPad))) {
      this._touch();
      this._drag = { x0: sx, y0: sy, t0: this.time, moved: false };
      this.aim = { x: x, y: y, target: null };
      return 'rocket';
    }
    if (isl) {
      if (this._locked()) { this._emit({ type: 'locked', id: isl.id }); return 'locked'; }   // spamming is not rewarded
      this._touch(); this._answer(isl); return isl.id;
    }
    var pad = this.islandById(this.rocket.pad);
    if (pad && this._hitIsland(pad, x, y) >= 0) { this._touch(); this._emit({ type: 'tapPad', id: pad.id }); return 'pad'; }
    return null;   // empty sky: the idle help keeps counting (playtest P1-3)
  };

  P.pointerMove = function (sx, sy) {
    if (!this._drag) return;
    if (this.state !== 'round' || this.phase !== 'ask') { this.cancelDrag(); return; }
    var x = sx, y = sy + this.camY;
    if (hyp(sx - this._drag.x0, sy - this._drag.y0) >= this.cfg.tapMove) this._drag.moved = true;
    var isl = this._rowIsland(x, y);
    this.aim = { x: x, y: y, target: isl ? isl.id : null };
    if (isl) this._lookId = isl.id;
  };

  P.pointerUp = function (sx, sy) {
    var d = this._drag;
    if (!d) return null;
    this._drag = null; this.aim = null;
    if (this.state !== 'round' || this.phase !== 'ask') return null;
    if (sx === undefined) { sx = d.x0; sy = d.y0; }
    var moved = d.moved || hyp(sx - d.x0, sy - d.y0) >= this.cfg.tapMove;
    if (!moved) {
      if (this.time - d.t0 < this.cfg.tapTime) {
        var h = this._hop();
        this._mood('happy');
        this._emit({ type: 'pokeBim', promptKey: h.promptKey, params: h.params });
        return 'pokeBim';
      }
      return null;
    }
    var isl = this._rowIsland(sx, sy + this.camY) || this._snapIsland(sx, sy + this.camY);
    if (isl) {
      if (this._locked()) { this._emit({ type: 'locked', id: isl.id }); return 'locked'; }
      this._answer(isl); return isl.id;
    }
    this._emit({ type: 'dragMiss' });   // released far from every island: main plays a soft sound and repeats the prompt
    return null;
  };
  /** Nearest row island whose hit box is within cfg.dragSnap px of (x, y) (world), else null (playtest P1-2). */
  P._snapIsland = function (x, y) {
    var best = null, bd = this.cfg.dragSnap, cy = this.camY;
    for (var i = 0; i < this.islands.length; i++) {
      var o = this.islands[i];
      if (o.state !== 'idle' || !this._row || this._row.ids.indexOf(o.id) < 0) continue;
      var b = this.islandHit(o.id); if (!b) continue;
      var dx = Math.max(0, Math.abs(x - b.x) - b.w / 2), dy = Math.max(0, Math.abs(y - cy - b.y) - b.h / 2), d = hyp(dx, dy);
      if (d <= bd) { bd = d; best = o; }
    }
    return best;
  };
  P.cancelDrag = function () { this._drag = null; this.aim = null; };

  P._answer = function (isl) {
    var cfg = this.cfg, h = this._hop(), t = isl.token;
    this._lookId = isl.id;
    if (isl.id === this._row.answerId) {
      this._emit({ type: 'go', id: isl.id, nameKind: t.nameKind, nameValue: t.nameValue, token: t });
      this._mood('happy');
      this._ignite(isl);
      return true;
    }
    this.misses++; this.hopMisses++; this.streak++;
    this._lockUntil = this.time + (this.hopMisses >= 2 ? cfg.wrongLock2 : cfg.wrongLock);
    if (this._wrongIds.indexOf(isl.id) < 0) this._wrongIds.push(isl.id);
    isl._wobT = 0;
    var r = this.rocket; if (r._hopT < 0) { r._hopT = 0; }
    this._mood('oops');
    var A = this.islandById(this._row.answerId).token;
    var want = { kind: A.nameKind, value: A.nameValue };
    if (A.animal) want.animal = A.animal;
    this._emit({ type: 'wrong', id: isl.id, nameKind: t.nameKind, nameValue: t.nameValue, token: t, want: want,
      streak: this.streak, misses: this.hopMisses, promptKey: h.promptKey, params: h.params });
    if (this.hopMisses === cfg.hintAfterMisses) this._doHint(false);   // the 2nd miss always glows (playtest P2-2)
    else if (this.hopMisses > cfg.hintAfterMisses) this._autoHint();
    return false;
  };

  /** After a pause: idle nudges start over and Talk time re-asks from the beginning (playtest P2-3). */
  P.resetNudges = function () {
    this._idleT = 0; this._idleGap = this.cfg.idleTime; this._idleN = 0;
    this._talkAskT = 0; this._talkAsks = 0;
    if (this.talk) this.talk.glowAnswer = false;
  };
  P._autoHint = function () {
    if (this.time - this._lastHintT < this.cfg.hintCooldown) return null;
    return this._doHint(false);
  };
  P._doHint = function (fromIdle) {
    var a = this._row && this.islandById(this._row.answerId);
    if (!a || a._glowT > 0) return null;
    a._glowT = this.cfg.hintGlowTime;
    this._lastHintT = this.time; this._lookId = a.id;
    this._mood('think');
    var ev = { type: 'hint', id: a.id };
    if (fromIdle) ev.idle = true;
    this._emit(ev);
    return a.id;
  };
  /** Manual hint (tap on the bubble): the right island glows (no event while it already glows). */
  P.hint = function () {
    if (this.state !== 'round' || (this.phase !== 'ask' && this.phase !== 'appear')) return null;
    var a = this._row && this.islandById(this._row.answerId);
    if (!a) return null;
    if (a._glowT > 0) return a.id;
    return this._doHint(false);
  };

  // ---------------------------------------------------------------- rocket: ignite → fly → land → climb
  P._ignite = function (target) {
    var r = this.rocket;
    this._setPhase('ignite');
    r.phase = 'ignite'; r._hopT = -1; r._hopY = 0;
    this._fl = { target: target.id, t: 0, T: 0, x0: r.x, y0: r.y, distSince: 0 };
    this.aim = null; this._drag = null;
    this._emit({ type: 'ignite', id: target.id });
  };

  /** (Re)builds the flight curve from (x0, y0) to the target island's current surface. */
  P._aimFlight = function () {
    var F = this._fl, L = this.layout, cfg = this.cfg, T = this.islandById(F.target);
    if (!T) return;
    var x0 = F.x0, y0 = F.y0, x1 = T.x, y1 = T.y, dx = x1 - x0, dy = y1 - y0, d = hyp(dx, dy) || 1;
    var apex = clamp(cfg.flyApexK * d, cfg.flyApex[0], cfg.flyApex[1]);
    // in the frame of the straight line: e along it, n perpendicular and pointing UP (for a near-vertical flight: toward the
    // screen centre, away from the edge). Both control points sit k = apex/0.75 off the line → the mid-curve is `apex` away;
    // the start tangent leans up (take-off), the end tangent comes down onto the island.
    var ex = dx / d, ey = dy / d, nx = ey, ny = -ex;
    if (ny > 0) { nx = -nx; ny = -ny; }
    if (Math.abs(ny) < 0.35) { var side = x0 + dx / 2 < L.W / 2 ? 1 : -1; if (nx * side < 0) { nx = -nx; ny = -ny; } }
    var k = apex / 0.75;
    F.c1x = x0 + 0.3 * dx + nx * k; F.c1y = y0 + 0.3 * dy + ny * k;
    F.c2x = x0 + 0.7 * dx + nx * k; F.c2y = y0 + 0.7 * dy + ny * k;
    // keep the convex hull (and so the whole curve) inside the screen
    var xl = L.ins.left + L.rocket.w / 2 + 4, xr = L.W - L.ins.right - L.rocket.w / 2 - 4, yt = this.camY + L.ins.top + L.rocket.h * 0.75;
    F.c1x = clamp(F.c1x, xl, xr); F.c2x = clamp(F.c2x, xl, xr); F.c1y = Math.max(F.c1y, yt); F.c2y = Math.max(F.c2y, yt);
    F.x1 = x1; F.y1 = y1;
    // arc-length table (32 samples)
    var tab = [0], px = x0, py = y0, len = 0;
    for (var k = 1; k <= 32; k++) {
      var tt = k / 32, qx = bez(x0, F.c1x, F.c2x, x1, tt), qy = bez(y0, F.c1y, F.c2y, y1, tt);
      len += hyp(qx - px, qy - py); tab.push(len); px = qx; py = qy;
    }
    F.tab = tab; F.len = len;
    if (!F.T) F.T = clamp(cfg.flyBase + len / cfg.flySpeed, cfg.flyTime[0], cfg.flyTime[1]);
  };
  P._curveAt = function (s) {   // s = 0..1 of the arc length → curve parameter t
    var F = this._fl, tab = F.tab, target = s * F.len, k = 1;
    while (k < tab.length - 1 && tab[k] < target) k++;
    var a = tab[k - 1], b = tab[k], f = b > a ? (target - a) / (b - a) : 0;
    return clamp((k - 1 + f) / 32, 0, 1);
  };

  P._stepRocket = function (h) {
    var r = this.rocket, cfg = this.cfg, F = this._fl, L = this.layout, pad = this.islandById(r.pad);
    var px = r.x, py = r.y, rotT = 0, qT = 0;
    switch (r.phase) {
      case 'rest': case 'land': {
        // tiny hop (wrong answer) + boostReady bounce
        r._hopY = 0;
        if (r._hopT >= 0) {
          var Th = 2 * Math.sqrt(2 * cfg.wrongHop / cfg.hopG);
          r._hopT += h;
          if (r._hopT >= Th) { r._hopT = -1; r._q = 0.08; r._qv = 0; }
          else r._hopY = cfg.wrongHop - 0.5 * cfg.hopG * Math.pow(r._hopT - Th / 2, 2);
        }
        var bounce = 0;
        if (this.state === 'roundDone' && this.phase === 'boostReady') {
          var ph = (this.phaseTime * cfg.readyBounceHz) % 1;
          bounce = cfg.readyBouncePx * 4 * ph * (1 - ph);
          if (ph < h * cfg.readyBounceHz * 1.01 && this.phaseTime > 0.1) { r._q = 0.06; r._qv = 0; }
          r.glow = Math.min(1, r.glow + h * 3);
        } else r.glow = Math.max(0, r.glow - h * 3);
        if (pad) { r.x = pad.x; r.y = pad.y - r._hopY - bounce; }
        r.flame = Math.max(0, r.flame - h * 4);
        r.shake = Math.max(0, r.shake - h * 6);
        if (r.phase === 'land' && this.phase !== 'land') r.phase = 'rest';
        break;
      }
      case 'ignite': {
        var u = clamp(this.phaseTime / cfg.igniteTime, 0, 1);
        r.flame = smooth(u); r.shake = cfg.igniteShake * u;
        qT = cfg.igniteCrouch * smooth(u * 1.5);
        if (pad) { r.x = pad.x; r.y = pad.y; }
        if (u >= 1) {
          this._setPhase('fly'); r.phase = 'fly';
          F.x0 = r.x; F.y0 = r.y; F.t = 0; F.T = 0; this._aimFlight();
          r._q = -cfg.liftStretch; r._qv = 0;
          if (pad) { pad._dv += 60; }
          this._emit({ type: 'liftoff', id: F.target });
        }
        break;
      }
      case 'fly': {
        if (!F || !F.tab || !this.islandById(F.target)) { this._fl = null; r.phase = 'rest'; if (this.phase === 'fly') this._setPhase('ask'); break; }
        F.t += h;
        var tgt = this.islandById(F.target);
        if (tgt && (Math.abs(tgt.x - F.x1) > 0.01 || Math.abs(tgt.y - F.y1) > 0.01)) this._aimFlight();   // drifting / dipping target
        var uf = clamp(F.t / F.T, 0, 1), s = thrust(uf, cfg.thrustAccel, cfg.thrustRetro), ct = this._curveAt(s);
        r.x = bez(F.x0, F.c1x, F.c2x, F.x1, ct); r.y = bez(F.y0, F.c1y, F.c2y, F.y1, ct);
        var tx = bezD(F.x0, F.c1x, F.c2x, F.x1, ct), ty = bezD(F.y0, F.c1y, F.c2y, F.y1, ct);
        var retro = smooth((uf - (1 - cfg.thrustRetro)) / cfg.thrustRetro);
        rotT = clamp(Math.atan2(tx, -ty), -cfg.rotMax, cfg.rotMax) * (1 - retro);
        r.flame = 1 - (1 - cfg.retroFlame) * retro;
        r.shake = 0.3 * (1 - retro);
        if (uf >= 1) this._land(tgt);
        break;
      }
      case 'boost': this._stepBoost(h); rotT = 0; break;
    }
    // rotation spring (heading), squash spring
    if (r.phase !== 'boost') {
      r._rv += (cfg.rotOmega * cfg.rotOmega * (rotT - r.rot) - 2 * cfg.rotZeta * cfg.rotOmega * r._rv) * h;
      r.rot = clamp(r.rot + r._rv * h, -cfg.rotMax, cfg.rotMax);
    } else { r._rv += (cfg.rotOmega * cfg.rotOmega * (0 - r.rot) - 2 * cfg.rotZeta * cfg.rotOmega * r._rv) * h; r.rot += r._rv * h; }
    r._qv += (cfg.squashOmega * cfg.squashOmega * (qT - r._q) - 2 * cfg.squashZeta * cfg.squashOmega * r._qv) * h; r._q += r._qv * h;
    r.sy = 1 - r._q; r.sx = 1 + 0.6 * r._q;
    r.vx = (r.x - px) / h; r.vy = (r.y - py) / h;
    // rainbow trail from the nozzle
    if (r.phase === 'fly' || r.phase === 'boost') {
      var last = this.trail[this.trail.length - 1];
      if (!last || hyp(r.x - last.x, r.y - last.y) >= cfg.trailStep) {
        this.trail.push({ x: r.x, y: r.y, a: 1 });
        if (this.trail.length > cfg.trailMax) this.trail.shift();
      }
    }
    for (var i = this.trail.length - 1; i >= 0; i--) { this.trail[i].a -= h / cfg.trailFade; if (this.trail[i].a <= 0) this.trail.splice(i, 1); }
    void L;
  };

  P._land = function (isl) {
    var r = this.rocket, cfg = this.cfg, oldPad = this.islandById(r.pad), self = this;
    this._fl = null;
    r.x = isl.x; r.y = isl.y; r.phase = 'land'; r.pad = isl.id;
    r._q = cfg.landSquash; r._qv = 0; r.flame = cfg.retroFlame;
    isl.state = 'pad'; isl._glowT = 0;
    isl._dv += kickFor(cfg.dipPx, cfg.dipOmega, cfg.dipZeta);
    this.wagon.side = isl.x > (oldPad ? oldPad.x : isl.x) ? -1 : 1;   // the wagon trails behind
    if (oldPad && oldPad !== isl) { oldPad.state = 'leave'; oldPad.t = 0; }
    var row = this._row;
    row.ids.forEach(function (id) {
      var o = self.islandById(id); if (!o) return;
      o._bx += row.drift;                       // bake the drift in: these islands leave the row
      if (o !== isl && o.state !== 'leave') { o.state = 'leave'; o.t = 0; }
    });
    row.drift = 0; row.driftV = 0; row.ids = [];
    // the token jumps into the wagon
    var ts = this.tokenSize(isl), tk = isl.token;
    isl.collected = true;
    this.flyers.push({ token: tk, id: isl.id, x: isl.x, y: isl.y - ts / 2, _px: isl.x, _py: isl.y - ts / 2, x0: isl.x, y0: isl.y - ts / 2,
      rot: 0, _prot: 0, s: 1, t: 0, spin: (this.rng.chance(0.5) ? 1 : -1) * this.rng.float(3, 6) });
    this._setPhase('land');
    this._mood(this.hop >= this.hops - 1 ? 'cheer' : 'happy');
    this._emit({ type: 'land', id: isl.id });
  };

  P._stepFlyers = function (h) {
    var cfg = this.cfg, W = this.wagon, Lw = this.layout.wagon;
    for (var i = this.flyers.length - 1; i >= 0; i--) {
      var f = this.flyers[i];
      f.t += h;
      var u = clamp(f.t / cfg.flyerTime, 0, 1), s = smooth(u);
      // the wagon basket (moves with the rope): bezier from the start, control lifted by flyerArc
      var bx = W.x + Math.sin(W.rot) * Lw.h * 0.35, by = W.y + Math.cos(W.rot) * Lw.h * 0.35;
      var cx = (f.x0 + bx) / 2, cy = Math.min(f.y0, by) - cfg.flyerArc, q = 1 - s;
      f.x = q * q * f.x0 + 2 * q * s * cx + s * s * bx;
      f.y = q * q * f.y0 + 2 * q * s * cy + s * s * by;
      f.rot += f.spin * h * (1 - u);
      f.s = 1 - (1 - cfg.flyerScale) * s;
      if (u >= 1) {
        this.flyers.splice(i, 1);
        W.items.push(f.token);
        this.collected.push(f.token);
        W.vy += 120;   // the wagon bobs as the item drops in
        this._emit({ type: 'collect', id: f.id, token: f.token, n: W.items.length, hop: this.hop });
      }
    }
  };

  // ---------------------------------------------------------------- boost
  P._boost = function (auto) {
    var r = this.rocket, L = this.layout, cfg = this.cfg, pad = this.islandById(r.pad);
    this._setPhase('boost');
    r.phase = 'boost'; r.glow = 0; r._hopT = -1;
    var D = cfg.boostDistH * L.H;
    var x = clamp(r.x, L.field.x0, L.field.x1);
    var np = this._makeIsland(x, r.y - D, null, 'appear');
    np.sx = np.sy = 0; np.alpha = 0; np._emitted = false;
    np.t = -(cfg.boostIgnite + cfg.boostRise + cfg.boostDecel - cfg.appearTime - 0.15);
    this._bst = { t: 0, y0: r.y, y1: np._by, x: r.x, pad: np.id, landed: false, settle: 0 };
    if (pad) { pad.state = 'leave'; pad.t = 0; }
    this.cloudBankY = r.y - 0.5 * D;
    this._camW = cfg.boostCamOmega;
    this.wagon.burst = null;
    this._emit({ type: 'boost', auto: !!auto });
  };

  P._stepBoost = function (h) {
    var r = this.rocket, cfg = this.cfg, B = this._bst, L = this.layout;
    B.t += h;
    var np = this.islandById(B.pad);
    if (np) { B.y1 = np._by; np._bx = B.x; }
    if (B.landed) {
      B.settle += h;
      if (np) { r.x = np.x; r.y = np.y; }
      r.flame = Math.max(0, r.flame - 4 * h); r.shake = Math.max(0, r.shake - 6 * h);
      if (B.settle >= cfg.boostSettle) { this._bst = null; this.boostT = 0; this.boostSpeed = 0; r.phase = 'rest'; this._afterBoost(); }
      return;
    }
    if (B.t < cfg.boostIgnite) {
      var u0 = B.t / cfg.boostIgnite;
      r.flame = smooth(u0); r.shake = 1; r._q += (cfg.igniteCrouch - r._q) * Math.min(1, 20 * h);
      r.x = B.x; r.y = B.y0;
      return;
    }
    var T = cfg.boostRise + cfg.boostDecel, u = clamp((B.t - cfg.boostIgnite) / T, 0, 1), dec = cfg.boostDecel / T;
    if (!B.lifted) { B.lifted = true; r._q = -cfg.liftStretch * 1.3; r._qv = 0; }
    var s = thrust(u, cfg.boostAccel, dec);
    r.x = B.x; r.y = B.y0 + (B.y1 - B.y0) * s;
    r.flame = u < 1 - dec ? 1 : 1 - (1 - cfg.retroFlame) * smooth((u - (1 - dec)) / dec);
    r.shake = u < 1 - dec ? 0.8 : 0.2;
    this.boostT = u; this.boostSpeed = thrustV(u, cfg.boostAccel, dec);
    this._camT = Math.min(this._camT, r.y - L.padY);
    if (u >= 1) {
      B.landed = true;
      r.x = B.x; r.y = B.y1; r.pad = B.pad;
      r._q = cfg.landSquash; r._qv = 0;
      if (np) { np.state = 'pad'; np.t = 0; np.sx = np.sy = 1; np.alpha = 1; np._dv += kickFor(cfg.dipPx, cfg.dipOmega, cfg.dipZeta); }
      this._camT = Math.min(this._camT, B.y1 - L.padY);
      this.cloudBankY = null;
      this._emit({ type: 'boostEnd' });
    }
  };

  P._afterBoost = function () {
    var cfg = this.cfg;
    this._camW = cfg.climbOmega;
    this.round++;
    var long = this.round >= cfg.chapterMinRounds && this.time - this.levelStartTime > cfg.chapterTimeLimit;
    if (this.round < this.roundsPerLevel && !long) this._beginRound();
    else { if (this.round < this.roundsPerLevel) this.roundsPerLevel = this.round; this._startTalk(); }   // a cut chapter: the HUD dots fill
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
    var cfg = this.cfg, i;
    for (i = 0; i < this.islands.length; i++) { var o = this.islands[i]; o._px = o.x; o._py = o.y; o._prot = o.rot; }
    var r = this.rocket, w = this.wagon;
    r._px = r.x; r._py = r.y; r._prot = r.rot; w._px = w.x; w._py = w.y; w._prot = w.rot;
    for (i = 0; i < w.rope.length; i++) { w.rope[i]._px = w.rope[i].x; w.rope[i]._py = w.rope[i].y; }
    for (i = 0; i < this.flyers.length; i++) { var f = this.flyers[i]; f._px = f.x; f._py = f.y; f._prot = f.rot; }
    if (this.shooting) { this.shooting._px = this.shooting.x; this.shooting._py = this.shooting.y; }
    this._pcamY = this.camY;
    this.time += h; this.stateTime += h; this.phaseTime += h;

    switch (this.state) {
      case 'intro': if (this.stateTime >= cfg.introTime) this._beginRound(); break;
      case 'round': this._stepRound(h); break;
      case 'roundDone':
        if (this.phase === 'stars' && this.phaseTime >= cfg.roundDoneTime) { this._setPhase('boostReady'); this._emit({ type: 'boostReady' }); }
        else if (this.phase === 'boostReady' && this.phaseTime >= cfg.autoBoost) this._boost(true);
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
            this._emit({ type: 'sessionDone', stars: this.stars, items: this.collected.length });
          }
        }
        break;
    }
    this._stepRocket(h);
    this._stepCamera(h);
    for (i = 0; i < this.islands.length; i++) this._stepIsland(this.islands[i], h);
    this.islands = this.islands.filter(function (x) { return x.state !== 'gone'; });
    this._stepFlyers(h);
    this._stepWagon(h);
    this._stepShooting(h);
    this._stepBim(h);
    if (this.wagon.burst) { this.wagon.burst.t += h; if (this.wagon.burst.t > 2) this.wagon.burst = null; }
    this._updBoostBtn();
  };

  P._stepCamera = function (h) {
    var w = this._camW, before = this.camY;
    this._camV += (w * w * (this._camT - this.camY) - 2 * w * this._camV) * h;
    this.camY += this._camV * h;
    if (this.camY > before) { this.camY = before; if (this._camV > 0) this._camV = 0; }   // the camera only climbs
  };

  P._stepRound = function (h) {
    var cfg = this.cfg, self = this, row = this._row;
    switch (this.phase) {
      case 'appear': {
        var all = row.ids.every(function (id) { var x = self.islandById(id); return x && x.state === 'idle'; });
        if (all) {
          this._setPhase('ask');
          var hp = this._hop();
          this._emit({ type: 'ask', hop: this.hop, hops: this.hops, promptKey: hp.promptKey, params: hp.params, answerId: row.answerId });
          if (this.surprise === 'shooting' && !this._shootDone && (this.hop === 1 || this.hops === 1)) {
            this._shootAt = this.time + this.rng.float(cfg.shootingDelay[0], cfg.shootingDelay[1]);
          }
        }
        break;
      }
      case 'ask': {
        this._idleT += h;
        if (this._idleT >= this._idleGap - 1e-9) {
          this._idleT = 0;
          this._idleGap = Math.min(cfg.idleMax, this._idleGap * cfg.idleBackoff);
          this._idleN++;
          this._mood('think');
          var hq = this._hop();
          this._emit({ type: 'idle', n: this._idleN, promptKey: hq.promptKey, params: hq.params });
          if (this._idleN >= cfg.idleHintFrom) this._doHint(true);
        }
        break;
      }
      case 'ignite': case 'fly': break;   // the rocket steps itself
      case 'land':
        if (this.phaseTime >= cfg.landTime) {
          var pad = this.islandById(this.rocket.pad);
          this._camT = Math.min(this._camT, pad._by - this.layout.padY);
          this._climb0 = this.camY;
          this._setPhase('climb');
          this._emit({ type: 'climb' });
        }
        break;
      case 'climb': {
        var span = this._climb0 - this._camT, done = span > 0 ? (this._climb0 - this.camY) / span : 1;
        var settled = Math.abs(this.camY - this._camT) < 2 && Math.abs(this._camV) < 30;
        if (this.hop < this.hops - 1) {
          if (done >= cfg.climbAppearAt || settled) { this.hop++; this.hopMisses = 0; this._spawnRow(this._camT); }
        } else if (settled && !this.flyers.length) this._endRound();
        break;
      }
    }
    // shooting star (surprise)
    if (this._shootAt > 0 && this.time >= this._shootAt && !this.shooting && !this._shootDone) {
      this._shootDone = true; this._shootAt = -1;
      var L = this.layout, dir = this.rng.chance(0.5) ? 1 : -1;
      // open sky between the bubble / HUD and the row's tokens (functional QA B1: it used to fly behind the bubble)
      var top = Math.max(L.bubble.y + L.bubble.h, L.hud.y + L.hud.h);
      (keepBoxes(this.hudKeep) || []).forEach(function (b) { top = Math.max(top, b.y + b.h); });
      top += 50;
      var bot = L.rowY - this._islandH(this._style(), L.islandW) - 40, sy = bot >= top ? this.rng.float(top, bot) : top;
      var x0 = dir > 0 ? L.ins.left - 60 : L.W - L.ins.right + 60;
      var dist = L.W - L.ins.left - L.ins.right + 120;
      this.shooting = { x: x0, y: this.camY + sy, _px: x0, _py: this.camY + sy, vx: dir * dist / cfg.shootingTime,
        vy: this.rng.float(20, 50), t: 0, caught: false };
      this._emit({ type: 'shooting' });
    }
    // drift surprise: the row moves as one and bounces in the field
    if (row && row.driftV) {
      var lo = 1e9, hi = -1e9;
      row.ids.forEach(function (id) { var x = self.islandById(id); if (x && x.state !== 'leave') { lo = Math.min(lo, x._bx); hi = Math.max(hi, x._bx); } });
      if (lo < 1e9 && (this.phase === 'ask' || this.phase === 'appear' || this.phase === 'ignite' || this.phase === 'fly')) {
        row.drift += row.driftV * h;
        var L2 = this.layout;
        if (lo + row.drift < L2.field.x0) { row.drift = L2.field.x0 - lo; row.driftV = Math.abs(row.driftV); }
        if (hi + row.drift > L2.field.x1) { row.drift = L2.field.x1 - hi; row.driftV = -Math.abs(row.driftV); }
      }
    }
  };

  P._stepIsland = function (i, h) {
    var cfg = this.cfg, row = this._row, inRow = row && row.ids.indexOf(i.id) >= 0;
    i.t += h;
    var offY = 0, sc = 1;
    switch (i.state) {
      case 'appear': {
        if (i.t < 0) { i.sx = i.sy = 0; i.alpha = 0; break; }
        if (!i._emitted) { i._emitted = true; this._emit({ type: 'appear', id: i.id }); }
        var u = clamp(i.t / cfg.appearTime, 0, 1);
        sc = backOut(u, cfg.appearBack);
        offY = -cfg.appearDrop * (1 - u) * (1 - u);
        i.alpha = Math.min(1, u * 2.5);
        if (u >= 1) { i.state = i.token ? 'idle' : 'pad'; i.t = 0; sc = 1; offY = 0; i.alpha = 1; }
        break;
      }
      case 'leave': {
        var v = clamp(i.t / cfg.leaveTime, 0, 1);
        offY = cfg.leaveDrop * v * v; sc = 1 - 0.3 * v; i.alpha = 1 - v;
        if (v >= 1) i.state = 'gone';
        break;
      }
      default: i.alpha = 1;
    }
    // dip spring (landing / liftoff push)
    i._dv += (-cfg.dipOmega * cfg.dipOmega * i._dip - 2 * cfg.dipZeta * cfg.dipOmega * i._dv) * h; i._dip += i._dv * h;
    // wrong-answer wobble: damped sine rotation + squash
    i.rot = 0; var q = 0;
    if (i._wobT >= 0) {
      i._wobT += h; var wu = i._wobT / cfg.wobbleTime;
      if (wu >= 1) { i._wobT = -1; i.wob = 0; }
      else { var env = (1 - wu) * (1 - wu); i.wob = env; i.rot = cfg.wobbleAmp * Math.sin(TAU * cfg.wobbleWiggles * wu) * env; q = 0.08 * Math.sin(TAU * cfg.wobbleWiggles * 2 * wu) * env; }
    }
    // hint glow + bob
    if (i._glowT > 0) i._glowT = Math.max(0, i._glowT - h);
    var gT = i._glowT > 0 ? 1 : 0;
    i.glow += (gT - i.glow) * Math.min(1, h * (gT ? 6 : 3));
    var bob = i.glow * cfg.hintBob * Math.sin(TAU * cfg.hintBobHz * this.time + i._ph);
    var drift = inRow && i.state !== 'leave' ? row.drift : 0;
    // islands that are not the pad float very gently (breathing)
    var breathe = i.state === 'idle' ? 2 * Math.sin(i._ph + 1.1 * this.time) : 0;
    i.x = i._bx + drift;
    i.y = i._by + offY + i._dip - bob + breathe;
    i.sx = sc * (1 + q); i.sy = sc * (1 - q);
    if (i.state === 'gone') return;
  };

  P._stepShooting = function (h) {
    var S = this.shooting, cfg = this.cfg;
    if (!S) return;
    S.t += h;
    S.y += this.camY - this._pcamY;   // stays in the same part of the sky while the camera climbs
    if (S.caught) { S.vx *= Math.pow(0.02, h); S.vy *= Math.pow(0.02, h); S.ct = (S.ct || 0) + h; }
    S.x += S.vx * h; S.y += S.vy * h;
    if ((S.caught && S.ct > 0.4) || (!S.caught && S.t >= cfg.shootingTime)) this.shooting = null;
  };

  // ---------------------------------------------------------------- wagon on a spring rope
  P._hook = function () {
    var r = this.rocket, d = this.layout.rocket.h * 0.06;
    return { x: r.x + Math.sin(r.rot) * d, y: r.y - Math.cos(r.rot) * d };
  };
  P._wagonRest = function () {
    var L = this.layout, r = this.rocket, pad = this.islandById(r.pad), Wg = L.wagon;
    var surf = pad ? pad.y : r.y;
    var side = this.wagon.side || -1, gap = L.rocket.w / 2 + Wg.w / 2 + 6;
    var xl = L.ins.left + Wg.w / 2 + 4, xr = L.W - L.ins.right - Wg.w / 2 - 4;
    var x = r.x + side * gap;
    if (x < xl || x > xr) { side = -side; x = r.x + side * gap; this.wagon.side = side; }
    return { x: clamp(x, xl, xr), y: surf - Wg.h * (92 / 110) + this.cfg.wagonSink };
  };
  P._snapWagon = function () {
    var w = this.wagon, R = this._wagonRest(), H = this._hook(), n = this.cfg.ropeN;
    w.x = w._px = R.x; w.y = w._py = R.y; w.vx = w.vy = 0; w.rot = w._prot = 0; w._rv = 0;
    w.rope = [];
    for (var k = 0; k < n; k++) {
      var u = k / (n - 1), x = H.x + (R.x - H.x) * u, y = H.y + (R.y - H.y) * u + 8 * Math.sin(Math.PI * u);
      w.rope.push({ x: x, y: y, _px: x, _py: y, ox: x, oy: y });
    }
  };
  P._snapWagonInside = function () {
    var L = this.layout, w = this.wagon, Wg = L.wagon;
    w.x = clamp(w.x, L.ins.left + Wg.w / 2, L.W - L.ins.right - Wg.w / 2);
  };
  P._stepWagon = function (h) {
    var cfg = this.cfg, w = this.wagon, r = this.rocket, L = this.layout, H = this._hook();
    var len = cfg.ropeLen * L.rocket.h, seg = len / (cfg.ropeN - 1);
    var flying = r.phase === 'fly' || r.phase === 'boost' || r.phase === 'ignite';
    var R = this._wagonRest();
    if (!flying) {
      // resting: a damped spring to its spot beside the rocket (it swings in after a flight)
      var om = cfg.wagonOmega, z = cfg.wagonZeta;
      w.vx += (om * om * (R.x - w.x) - 2 * z * om * w.vx) * h;
      w.vy += (om * om * (R.y - w.y) - 2 * z * om * w.vy) * h;
    } else {
      // towed: gravity-lite + air drag; the rope is a max-length tether
      w.vy += cfg.wagonG * h;
      w.vx -= w.vx * Math.min(1, cfg.wagonDrag * h); w.vy -= w.vy * Math.min(1, cfg.wagonDrag * h);
    }
    w.x += w.vx * h; w.y += w.vy * h;
    var dx = w.x - H.x, dy = w.y - H.y, d = hyp(dx, dy);
    if (d > len) {
      var nx = dx / d, ny = dy / d;
      w.x = H.x + nx * len; w.y = H.y + ny * len;
      var vr = w.vx * nx + w.vy * ny;
      if (vr > 0) { w.vx -= vr * nx; w.vy -= vr * ny; }
      // the rope drags the wagon along with the rocket's velocity
      w.vx += (r.vx - w.vx) * Math.min(1, 6 * h) * (flying ? 1 : 0);
      w.vy += (r.vy - w.vy) * Math.min(1, 6 * h) * (flying ? 1 : 0);
    }
    // stay on screen horizontally
    var xl = L.ins.left + L.wagon.w / 2, xr = L.W - L.ins.right - L.wagon.w / 2;
    if (w.x < xl) { w.x = xl; if (w.vx < 0) w.vx = 0; }
    if (w.x > xr) { w.x = xr; if (w.vx > 0) w.vx = 0; }
    // tilt toward the rope pull while towed, level when resting; spring-limited
    var rt = flying ? clamp(Math.atan2(H.x - w.x, w.y - H.y) * 0.45, -0.5, 0.5) : clamp(-w.vx * 0.0015, -0.25, 0.25);
    w._rv += (100 * (rt - w.rot) - 2 * 0.5 * 10 * w._rv) * h; w.rot += w._rv * h;
    // rope: verlet chain pinned at the hook and the hitch
    var P0 = w.rope, n = P0.length, k, it;
    for (k = 1; k < n - 1; k++) {
      var p = P0[k], vx = (p.x - p.ox) * cfg.ropeDamp, vy = (p.y - p.oy) * cfg.ropeDamp;
      p.ox = p.x; p.oy = p.y;
      p.x += vx; p.y += vy + 900 * h * h;
    }
    P0[0].x = P0[0].ox = H.x; P0[0].y = P0[0].oy = H.y;
    P0[n - 1].x = P0[n - 1].ox = w.x; P0[n - 1].y = P0[n - 1].oy = w.y;
    for (it = 0; it < cfg.ropeIters; it++) {
      for (k = 0; k < n - 1; k++) {
        var a = P0[k], b = P0[k + 1], ex = b.x - a.x, ey = b.y - a.y, dd = hyp(ex, ey) || 1e-6;
        if (dd <= seg) continue;   // a rope only pulls
        var diff = (dd - seg) / dd, fa = k === 0 ? 0 : (k + 1 === n - 1 ? 1 : 0.5), fb = k + 1 === n - 1 ? 0 : (k === 0 ? 1 : 0.5);
        a.x += ex * diff * fa; a.y += ey * diff * fa; b.x -= ex * diff * fb; b.y -= ey * diff * fb;
      }
    }
  };

  P._stepBim = function (h) {
    var b = this.bim, cfg = this.cfg;
    if (b.moodT > 0) { b.moodT -= h; if (b.moodT <= 0) { b.moodT = 0; b.mood = 'idle'; } }
    var lx = this.rocket.x, ly = this.rocket.y - this.layout.rowY;
    if (this.aim) { lx = this.aim.x; ly = this.aim.y; }
    else if (this._fl) { var t = this.islandById(this._fl.target); if (t) { lx = t.x; ly = t.y; } }
    else if (this._lookId && this.islandById(this._lookId) && this.islandById(this._lookId).state === 'idle') {
      var o = this.islandById(this._lookId); lx = o.x; ly = o.y;
    } else if (this._row && this._row.ids.length) {
      var sx = 0, n = 0, self = this;
      this._row.ids.forEach(function (id) { var x = self.islandById(id); if (x) { sx += x.x; n++; } });
      if (n) { lx = sx / n; ly = this.camY + this.layout.rowY; }
    }
    var k = Math.min(1, h * cfg.lookRate);
    b.lookX += (lx - b.lookX) * k; b.lookY += (ly - b.lookY) * k;
  };

  RR.World = World;
})(window.RR = window.RR || {});
