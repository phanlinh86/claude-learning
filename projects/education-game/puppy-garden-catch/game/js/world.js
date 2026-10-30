/* Puppy Garden Catch — PG.CONFIG + PG.World (headless, deterministic simulation; DESIGN §2, §5.2)
 *
 * ============================== CONVENTIONS ==============================
 *  Units: logical px (short side = 720), seconds, radians, y DOWN.
 *  update(dt) runs fixed sub-steps of cfg.step (1/120 s) with an accumulator.
 *  At the START of every sub-step each item stores _px,_py,_prot (Pip: pup._px; basket: _px,_py);
 *  the renderer draws  p = _p + (p − _p) · w.alpha   (w.alpha = leftover / step, 0..1).
 *  Result depends only on seed + the sub-step index at which inputs arrive.
 *
 *  Renderer contract
 *   item:   centre (x, y), rotation rot; drawn item width = item.size (scale already included);
 *           scale = appear(0..1, back-overshoot) × (sx, sy); alpha = item.alpha.
 *           bubble 0..1 → draw the soap bubble (diameter cfg.bubbleK × size) scaled by `bubble` and by
 *           (bsx, bsy) (bubble squash on the grass); glow 0..1 → golden halo.
 *           Items with inBasket = true (states 'pop' once below the rim, and 'in') go between basket_back and
 *           basket_front; everything else is drawn after the basket front.
 *   basket: rim centre (x, y), w × h; rotation wobble (rad, pendulum lag); squash: scaleX 1+squash,
 *           scaleY 1−squash about the basket bottom; shake ∈ [−1,1] → x offset shake·cfg.shakePx and
 *           extra rotation shake·0.06 rad; glow 0..1 (basket full); count/need → dots on the basket.
 *   pup:    feet anchor (x, layout.pup.y − hop), height layout.pup.h, face −1|1 (sprite faces +x when 1),
 *           tilt (rad), run 0..1 + step (stride phase: frame run1 while sin(step) ≥ 0, else run2; idle when run < 0.08),
 *           mood + moodT, lookX/lookY (eyes).
 * ========================================================================
 */
(function (PG) {
  'use strict';

  var CONFIG = {
    // ---- timing / state machine (s)
    step: 1 / 120,             // fixed simulation sub-step
    maxFrame: 1.0,             // largest dt accepted per update() (speed mode passes big dt)
    roundsPerLevel: 4,         // warm-up + 3 rounds
    chapterTimeLimit: 75,      // s since the chapter began: after ≥ chapterMinRounds rounds, go to Talk time
    chapterMinRounds: 3,
    introTime: 1.8,            // chapter banner
    roundDoneTime: 1.7,        // stars on screen
    leaveDelay: 1.0,           // s into roundDone when caught items hop out of the basket
    leaveTime: 0.4,            // pop + fade / hop-out + fade
    talkAfterAnswer: 1.6,
    levelDoneTime: 2.0,
    talkAskTime: 12,           // s without an answer → talkAsk (re-ask), repeating
    talkGlowAfterAsks: 2,

    // ---- layout (DESIGN §2; px)
    shortSide: 720, minLong: 960, maxLong: 1600,
    groundOffset: 64,          // groundY = H − ins.bottom − 64
    pupFeetDy: 6,              // pup.y = groundY + 6
    pupHLand: 200, pupHPort: 215, tallRatio: 1.6, tallK: 1.1,
    pupSpeed: 1150,            // px/s, max running speed
    basketW: { 3: 220, 4: 210, 5: 200, 6: 185, 7: 185 }, basketPortraitK: 1.1, basketAspect: 0.62,
    rimFrac: 0.32,             // rim centre = pup.y − 0.32·pup.h (face stays visible above the back rim)
    laneMargin: 16,            // px between basket edge and the safe-area edge at Pip's extremes
    skyTopGap: 150,            // sky.top = ins.top + 150
    spawnDy: 40,               // bubbles are born at sky.top + 40 (bubble top clears the speech bubble)
    bubbleX: 20, bubbleY: 16, bubbleMaxW: 680, bubbleSideGap: 190, bubbleH: 100,
    hudW: 160, hudH: 92,       // DOM buttons top-right
    pupTapK: 0.5,              // tap within 0.5·pup.h of Pip's chest → tapPup
    pupChestK: 0.6,            // chest centre = feet − 0.6·pup.h
    refFallPx: 460,            // fall/rise speeds are given for a 460 px drop (spawn line → rim) and scale by
    fallScaleMin: 0.75, fallScaleMax: 3,   //   clamp(fallDist / 460, 0.75, 3): every screen keeps a ≈ 6–7 s fall at age 4

    // ---- touch
    tapMovePx: 24, tapTime: 0.35,   // finger moved < 24 px and released < 0.35 s after down → a TAP
    tapRuns: false,            // DESIGN: after a tap on a bubble Pip keeps running to it. false = he stops where he is
                               //   (REQUIREMENT "a tap is not a move-and-catch decision"; see MECHANICS §6)
    touchR: 0.6, touchPad: 14,      // bubble hit radius = 0.6 × size + 14

    // ---- spawning
    autoSpawn: true,           // false = tests spawn by hand with w._spawn(true|false)
    firstSpawn: 0.8,           // s into the round (DESIGN 0.6; tuned: lets Pip's prompt start first)
    spawnGap: 1.6, spawnGapAge3: 2.0,   // s, minimum between two spawns (DESIGN 1.3 / 1.6; tuned calmer)
    appearTime: 0.4,           // bubble pops into existence (back-overshoot)
    bubbleK: 1.35,             // bubble diameter = 1.35 × item size
    spawnSepK: 1.4,            // ≥ 1.4 × bubble size apart from bubbles at a similar height
    spawnCandidates: 16,
    firstNearK: 0.35,          // first spawn of a round lands within 0.35·W of Pip
    warmNearPx: [30, 70],      // warm-up first spawn: right above Pip's side (offset range px)
    rightGapMax: 1.0,          // s with no right bubble in the air (air full of wrong ones) → extra right spawn

    // ---- fall (in the bubble)
    fallSpeed: { 3: 58, 4: 64, 5: 78, 6: 88, 7: 98 },     // px/s terminal velocity for a 460 px drop (DESIGN 70/80/95/105/115;
                                                          //   tuned to the ≈ 6–8 s fall and the 60–100 s chapter target)
    fallLevelK: 0.05,          // × (1 + 0.05·level)
    dragRate: 2.2,             // 1/s:  v' = (vT − v)·2.2
    swayAmp: 22,               // px
    swayPeriodMin: 2.4, swayPeriodMax: 3.2,   // s
    rotSway: 0.15,             // rad
    windPx: 45,                // px/s per unit wind
    windBase: [0.1, 0.6, 0.35, 0.15],         // per weather mood (same base winds as PG.Weather)
    windWobble: 0.25, windPeriod: 8,          // slow ±25 % breathing of the wind (period s)
    driftRate: 1.2,            // 1/s, bubble drift velocity relaxes to the wind
    edgeK: 6,                  // 1/s², soft reflection spring at the lane edges
    hintSlow: 0.55,            // glowing bubble falls at 0.55×

    // ---- assist (ages ≤ magnetMaxAge)
    magnetMaxAge: 4,
    magnetX: 70,               // px beyond the catch edge
    magnetUp: 140,             // px above the rim
    magnetRate: 2.0,           // 1/s, gentle exponential pull of the drift centre toward the basket

    // ---- catch
    catchAbove: 10,            // caught when y ≥ rim − 10 …
    catchBelow: 30,            // … and y ≤ rim + 30 (a late-but-close catch still counts)
    catchSideK: 0.25,          // |x − basket.x| ≤ 0.5·basket.w + 0.25·size
    popTime: 0.3,              // s, pop-and-drop into the basket (parabola in basket coordinates)
    popApex: 18,               // px above the higher end
    popInherit: 0.25,          // fraction of vx kept
    inScale: 0.7,              // item size in the basket = 0.7 × its size (limited by slot spacing)
    landSquash: 0.15,          // q on landing: sx = 1+q = 1.15, sy = 1−1.2q = 0.82
    squashOmega: 22, squashZeta: 0.3,
    basketSquash: 0.14, basketOmega: 18, basketZeta: 0.35,
    hopPx: 10, hopTime: 0.25,  // Pip's happy hop on a right catch

    // ---- wrong catch
    wrongDip: 0.12,            // s the item sinks into the basket before hopping out
    shakeTime: 0.5, shakeWiggles: 3, shakePx: 10,
    hopOutVx: 180, hopOutVy: -520, gravity: 1500,   // px/s, px/s, px/s²
    rebubbleTime: 0.3,         // new bubble forms at the apex
    riseSpeed: 140,            // px/s
    riseRate: 2.0,             // 1/s, vy relaxes to −riseSpeed

    // ---- ground (missed right item / wrong item reaching the grass)
    groundK: 0.4,              // contact when y ≥ groundY − 0.4·size
    groundBounce: 0.35,        // vy = −0.35·vy
    groundTime: 0.5,
    groundSquash: 0.25,        // bubble squash (bsx = 1+q, bsy = 1−q)
    groundG: 600,              // px/s² while bouncing on the grass

    // ---- round end
    leaveVy: -420, leaveVx: 90, leaveG: 1600,

    // ---- Pip
    pupOmega: 9,               // rad/s, critically damped follow
    stepK: 0.012,              // rad of stride phase per px run
    tiltK: 0.00025, tiltMax: 0.12, tiltOmega: 12, tiltZeta: 0.6,
    faceVx: 40,                // |vx| > 40 px/s → face the direction of motion
    swayOmega: 14, swayZeta: 0.4,   // basket pendulum lag spring
    swayInertia: 0.12,         // sway'' gets −0.12·(Pip acceleration) → ≈ 8 px lag on a sprint start
    swayMaxK: 0.12,            // |sway| ≤ 0.12·basket.w
    wobbleK: 0.004,            // basket rotation = −sway·0.004 rad/px
    lookRate: 6,
    cheerHopPx: 22, cheerHopTime: 0.4,
    moodTime: { happy: 0.9, cheer: 1.6, oops: 0.8, think: 1.2 },

    // ---- help
    hintAfterMistakes: 2,      // wrong catches + misses since the last right catch
    hintTime: 4,               // s glow
    hintCooldown: 6,
    glowRate: 5,               // 1/s glow fade in/out
    idleTime: 12, idleBackoff: 1.5, idleMax: 30
  };
  PG.CONFIG = CONFIG;

  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hyp(x, y) { return Math.sqrt(x * x + y * y); }
  function easeOutBack(u) { var c1 = 1.70158, c3 = c1 + 1, v = u - 1; return 1 + c3 * v * v * v + c1 * v * v; }
  function merge(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; if (b) for (k in b) o[k] = b[k]; return o; }
  function ageOf(a) { return PG.Content.ageOf(a); }

  /** DESIGN §2 short-side rule: CSS viewport → logical W×H. */
  function logicalSize(cssW, cssH, cfg) {
    cfg = cfg || CONFIG;
    var S = cfg.shortSide, aspect = cssW / Math.max(1, cssH);
    if (cssW >= cssH) return { W: clamp(Math.round(S * aspect), cfg.minLong, cfg.maxLong), H: S };
    return { W: S, H: clamp(Math.round(S / aspect), cfg.minLong, cfg.maxLong) };
  }

  function computeLayout(W, H, ins, age, cfg) {
    ins = { top: +(ins && ins.top) || 0, right: +(ins && ins.right) || 0, bottom: +(ins && ins.bottom) || 0, left: +(ins && ins.left) || 0 };
    age = ageOf(age);
    var portrait = H > W, tall = H / W > cfg.tallRatio;
    var groundY = H - ins.bottom - cfg.groundOffset;
    var ph = (portrait ? cfg.pupHPort : cfg.pupHLand) * (tall ? cfg.tallK : 1);
    var bw = cfg.basketW[age] * (portrait ? cfg.basketPortraitK : 1), bh = cfg.basketAspect * bw;
    var py = groundY + cfg.pupFeetDy, rimDy = cfg.rimFrac * ph;
    var minX = ins.left + 0.5 * bw + cfg.laneMargin, maxX = W - ins.right - 0.5 * bw - cfg.laneMargin;
    var skyTop = ins.top + cfg.skyTopGap, rimY = py - rimDy;
    var spawnY = skyTop + cfg.spawnDy;
    var fallDist = rimY - spawnY;
    return {
      W: W, H: H, ins: ins, portrait: portrait, groundY: groundY,
      pup: { y: py, h: ph, minX: minX, maxX: maxX, speed: cfg.pupSpeed },
      basket: { w: bw, h: bh, rimDy: rimDy },
      sky: { top: skyTop, bottom: rimY },
      lanes: { x0: minX, x1: maxX },
      spawnY: spawnY,
      fallScale: clamp(fallDist / cfg.refFallPx, cfg.fallScaleMin, cfg.fallScaleMax),
      bubble: { x: ins.left + cfg.bubbleX, y: ins.top + cfg.bubbleY, w: Math.min(cfg.bubbleMaxW, W - ins.left - ins.right - cfg.bubbleSideGap), h: cfg.bubbleH },
      pupTap: { r: cfg.pupTapK * ph },
      hud: { x: W - ins.right - cfg.hudW, y: 0, w: cfg.hudW + ins.right, h: ins.top + cfg.hudH }
    };
  }

  /** Slot offsets (relative to the rim centre) for `need` items: centre-out rows, piling upward. */
  function computeSlots(need, maxSize, bw, bh, cfg) {
    var r0 = need <= 3 ? need : need <= 5 ? 3 : need <= 9 ? 4 : 5;
    r0 = Math.max(1, r0);
    var sxp = bw * 0.74 / r0;
    var s = Math.min(maxSize * cfg.inScale, sxp * 1.3, bw * 0.45);
    var rows = [], left = need, len = r0;
    while (left > 0) { var m = Math.min(len, left); rows.push(m); left -= m; len = Math.max(1, len - 1); }
    var slots = [];
    for (var r = 0; r < rows.length; r++) {
      var cnt = rows[r], dy = 0.05 * bh - r * s * 0.62, idx = [];
      for (var k = 0; k < cnt; k++) idx.push(k);
      var mid = (cnt - 1) / 2;
      idx.sort(function (a, c) { return Math.abs(a - mid) - Math.abs(c - mid) || a - c; });
      for (var j = 0; j < idx.length; j++) slots.push({ dx: (idx[j] - mid) * sxp, dy: dy });
    }
    return { slots: slots, size: s };
  }

  // ------------------------------------------------------------------ World
  function World(opts) {
    opts = opts || {};
    this.cfg = merge(CONFIG, opts.config);
    this.seed = opts.seed !== undefined ? opts.seed : 1;
    this.rng = new PG.RNG(this.seed);
    this.age = ageOf(opts.age !== undefined ? opts.age : 4);
    this.lang = opts.lang === 'vi' ? 'vi' : 'en';
    this._pendingAge = this.age; this._pendingLang = this.lang;
    this.state = 'menu';
    this.level = 0; this.levels = []; this.topic = null; this.weather = 0;
    this.round = 0; this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.stars = 0; this.levelStars = 0; this.roundMistakes = 0; this.roundStars = 0;
    this.time = 0; this.stateTime = 0; this.alpha = 0; this._acc = 0;
    this.cur = null; this.items = []; this.talk = null; this.talkAnswered = null;
    this.wind = 0; this.windVx = 0;
    this.events = [];
    this.sessions = 0;
    this.interactive = false;
    this.counters = { spawns: 0, catches: 0, correct: 0, wrong: 0, misses: 0, taps: 0, hints: 0, idles: 0 };
    this._nextId = 1; this._srng = new PG.RNG(1);
    this._idleT = 0; this._idleGap = this.cfg.idleTime; this._roundEnded = false;
    this._lastHintT = -1e9; this._mistakes = 0; this._hintPending = false;
    this.levelStartTime = 0; this._talkAskT = 0; this._talkAsks = 0;
    this._steer = null;
    this.finger = { x: 0, y: 0, down: false };
    this.pup = { x: 0, vx: 0, ax: 0, targetX: 0, steering: false, face: 1, run: 0, step: 0, tilt: 0, _tv: 0,
      mood: 'idle', moodT: 0, lookX: 0, lookY: 0, hop: 0, _hopT: -1, _hopKind: null, _px: 0 };
    this.basket = { x: 0, y: 0, w: 0, h: 0, count: 0, need: 1, reserved: 0, squash: 0, _sqv: 0, shake: 0, _shakeT: -1,
      glow: 0, wobble: 0, sway: 0, _swv: 0, slots: [], slotSize: 60, _px: 0, _py: 0 };
    this.setViewport(opts.width || 1280, opts.height || 720, opts.ins || null);
    this.pup.x = this.pup.targetX = this.pup._px = (this.layout.lanes.x0 + this.layout.lanes.x1) / 2;
    this._placeBasket();
    this.basket._px = this.basket.x; this.basket._py = this.basket.y;
    this.pup.lookX = this.pup.x; this.pup.lookY = this.layout.spawnY;
  }
  World.logicalSize = logicalSize;
  World.computeLayout = function (W, H, ins, age, cfg) { return computeLayout(W, H, ins, age, merge(CONFIG, cfg)); };
  World.computeSlots = function (need, maxSize, bw, bh, cfg) { return computeSlots(need, maxSize, bw, bh, merge(CONFIG, cfg)); };

  var P = World.prototype;
  P._emit = function (e) { this.events.push(e); };
  P.drainEvents = function () { var e = this.events; this.events = []; return e; };
  P.setAge = function (a) { this._pendingAge = ageOf(a); };
  P.setLang = function (l) { this._pendingLang = l === 'vi' ? 'vi' : 'en'; };
  P.itemById = function (id) { for (var i = 0; i < this.items.length; i++) if (this.items[i].id === id) return this.items[i]; return null; };
  P._setState = function (s) { this.state = s; this.stateTime = 0; };
  P._mood = function (m) { var p = this.pup; p.mood = m; p.moodT = this.cfg.moodTime[m] || 1; if (m === 'cheer') { p._hopT = 0; p._hopKind = 'cheer'; } };
  P._isAir = function (it) { return it.state === 'appear' || it.state === 'fall'; };
  P._fallScale = function () { return this.layout.fallScale; };

  // ---------------------------------------------------------------- viewport
  P.setViewport = function (W, H, ins) {
    var old = this.layout;
    this.layout = computeLayout(W, H, ins, this.age, this.cfg);
    this._afterLayout(old);
  };
  P._afterLayout = function (old) {
    var L = this.layout, p = this.pup, b = this.basket, i;
    this.cancelDrag();
    p.x = clamp(p.x, L.pup.minX, L.pup.maxX); p.targetX = clamp(p.targetX, L.pup.minX, L.pup.maxX); p._px = p.x;
    b.w = L.basket.w; b.h = L.basket.h;
    if (this.cur) this._makeSlots();
    this._placeBasket();
    b._px = b.x; b._py = b.y;
    if (!old) return;
    // bubbles: keep their fall progress (proportional y), clamp x into the lanes
    var y0o = old.spawnY, y1o = old.groundY, y0n = L.spawnY, y1n = L.groundY;
    for (i = 0; i < this.items.length; i++) {
      var it = this.items[i];
      if (it.state === 'in' || it.state === 'pop') continue;
      var u = (it.y - y0o) / Math.max(1, y1o - y0o);
      it.y = y0n + u * (y1n - y0n);
      var A = this.cfg.swayAmp;
      it.xb = clamp(it.xb, L.lanes.x0, L.lanes.x1);
      it.x = clamp(it.x, L.lanes.x0 - A, L.lanes.x1 + A);
      it._px = it.x; it._py = it.y;
    }
  };
  P._placeBasket = function () {
    var L = this.layout, b = this.basket, p = this.pup;
    b.x = p.x + b.sway;
    b.y = L.pup.y - L.basket.rimDy - p.hop;
  };
  P._makeSlots = function () {
    var maxSize = 60, pool = this.cur.pool;
    for (var i = 0; i < pool.length; i++) if (pool[i].right) maxSize = Math.max(maxSize, pool[i].size);
    var s = computeSlots(this.basket.need, maxSize, this.basket.w, this.basket.h, this.cfg);
    this.basket.slots = s.slots; this.basket.slotSize = s.size;
  };

  // ---------------------------------------------------------------- session flow
  P.newSession = function () {
    this.age = this._pendingAge; this.lang = this._pendingLang;
    this.sessions++;
    this.levels = PG.Content.topicsFor(this.age);
    this.stars = 0;
    var L = this.layout;
    this.layout = computeLayout(L.W, L.H, L.ins, this.age, this.cfg);   // basket width depends on age
    this._afterLayout(L);
    this._emit({ type: 'session', levels: this.levels.slice() });
    this.startLevel(0);
  };

  P.startLevel = function (i) {
    if (!this.levels.length) this.levels = PG.Content.topicsFor(this.age);
    this.level = clamp(i | 0, 0, this.levels.length - 1);
    this.topic = this.levels[this.level];
    this.weather = this.level;
    this.round = 0; this.levelStars = 0; this.levelStartTime = this.time;
    this.items = []; this.cur = null; this.talk = null; this.talkAnswered = null;
    this.basket.count = 0; this.basket.reserved = 0; this.basket.glow = 0;
    this.interactive = false;
    this._setState('intro');
    this._emit({ type: 'level', level: this.level, topic: this.topic });
  };

  P._beginRound = function () {
    var cfg = this.cfg;
    var rseed = (this.rng.next() * 4294967296) >>> 0;
    var cur = PG.Content.makeRound(this.topic, { age: this.age, lang: this.lang, rng: new PG.RNG(rseed), roundIndex: this.round });
    this.cur = cur;
    this._srng = new PG.RNG(cur.seed);
    this.items = [];
    this.roundMistakes = 0; this._mistakes = 0; this._hintPending = false;
    this._idleT = 0; this._idleGap = cfg.idleTime; this._roundEnded = false;
    this._spawnCount = 0; this._sinceSpawn = 0; this._noRightT = 0; this._lastRight = true; this._lastWrongTpl = -1;
    var b = this.basket;
    b.count = 0; b.reserved = 0; b.need = cur.need; b.glow = 0;
    this._makeSlots();
    this.interactive = true;
    this._setState('round');
    this._emit({ type: 'round', round: this.round, topic: this.topic, mode: cur.mode, promptKey: cur.promptKey, params: cur.params, need: cur.need });
  };

  P._endRound = function () {
    if (this._roundEnded) return;
    this._roundEnded = true;
    var m = this.roundMistakes, st = m === 0 ? 3 : m === 1 ? 2 : 1;
    this.roundStars = st; this.stars += st; this.levelStars += st;
    this._setState('roundDone');
    this._mood('cheer');
    for (var i = 0; i < this.items.length; i++) {      // bubbles still in the air pop and fade
      var it = this.items[i];
      if (it.state === 'in' || it.state === 'pop') continue;
      this._leave(it, false);
    }
    this._emit({ type: 'roundDone', stars: st, mistakes: m, round: this.round, count: this.basket.count, need: this.basket.need });
  };
  P._leave = function (it, wasIn) {
    var cfg = this.cfg;
    if (!wasIn && it.bubble > 0.05) this._emit({ type: 'pop', id: it.id, x: it.x, y: it.y });
    it.state = 'leave'; it.t = 0; it._wasIn = wasIn; it.inBasket = false;
    if (wasIn) { it.vy = cfg.leaveVy * this.rng.float(0.85, 1.15); it.vx = this.rng.float(-1, 1) * cfg.leaveVx; it.vr = this.rng.float(-4, 4); }
    else { it.vx = 0; it.vy = 0; it.vr = 0; it._b0 = it.bubble; }
  };

  P._startTalk = function () {
    var rr = new PG.RNG((this.rng.next() * 4294967296) >>> 0);
    this.items = []; this.basket.count = 0; this.basket.reserved = 0;
    this.talk = PG.Content.makeTalk(this.topic, { age: this.age, lang: this.lang, rng: rr });
    this.talk.glowAnswer = false;
    this.talkAnswered = null; this._talkAskT = 0; this._talkAsks = 0;
    this.interactive = false;
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
  P.skipTalk = function () { if (this.state === 'talk') this._levelDone(); };

  P._levelDone = function () {
    this._setState('levelDone');
    this._emit({ type: 'levelDone', level: this.level, stars: this.levelStars });
  };

  // ---------------------------------------------------------------- input
  P._canSteer = function () { return this.state === 'round' || this.state === 'intro' || this.state === 'roundDone'; };
  /** Bubble under (x, y): hit radius 0.6·size + 14; the nearest (relative) wins. */
  P.itemAt = function (x, y) {
    var cfg = this.cfg, best = null, bd = 1e9;
    for (var i = this.items.length - 1; i >= 0; i--) {
      var it = this.items[i];
      if (!(it.state === 'appear' || it.state === 'fall' || it.state === 'ground' || it.state === 'rise' || it.state === 'bounce')) continue;
      var r = cfg.touchR * it.size + cfg.touchPad, d = hyp(x - it.x, y - it.y) / r;
      if (d <= 1 && d < bd) { bd = d; best = it; }
    }
    return best;
  };
  P.pointerDown = function (x, y) {
    this.finger.x = x; this.finger.y = y; this.finger.down = true;
    var hit = this.state === 'round' ? this.itemAt(x, y) : null;
    this._steer = { x0: x, y0: y, t0: this.time, maxD: 0, hitId: hit ? hit.id : null };
    if (!this._canSteer()) return null;
    var L = this.layout, p = this.pup;
    p.targetX = clamp(x, L.pup.minX, L.pup.maxX); p.steering = true;
    return hit ? hit.id : null;
  };
  P.pointerMove = function (x, y) {
    this.finger.x = x; this.finger.y = y;
    var s = this._steer;
    if (!s || !this.finger.down) return;
    s.maxD = Math.max(s.maxD, hyp(x - s.x0, y - s.y0));
    if (this.pup.steering && this._canSteer()) { var L = this.layout; this.pup.targetX = clamp(x, L.pup.minX, L.pup.maxX); }
  };
  P.pointerUp = function (x, y) {
    if (x !== undefined) this.pointerMove(x, y);
    var s = this._steer, cfg = this.cfg;
    this.finger.down = false; this.pup.steering = false; this._steer = null;
    if (!s) return;
    var isTap = s.maxD < cfg.tapMovePx && this.time - s.t0 < cfg.tapTime;
    if (!isTap || this.state !== 'round') return;
    var it = s.hitId ? this.itemById(s.hitId) : null;
    if (it && it.state !== 'in' && it.state !== 'pop' && it.state !== 'leave') {
      this.counters.taps++;
      if (!cfg.tapRuns) this.pup.targetX = this.pup.x;
      this._emit({ type: 'tap', id: it.id, nameKind: it.nameKind, nameValue: it.nameValue });   // Pip keeps running to x (tapRuns)
      return;
    }
    var L = this.layout, p = this.pup;
    if (hyp(this.finger.x - p.x, this.finger.y - (L.pup.y - cfg.pupChestK * L.pup.h - p.hop)) <= L.pupTap.r) {
      this._emit({ type: 'tapPup', promptKey: this.cur.promptKey, params: this.cur.params });
    }
  };
  P.cancelDrag = function () {
    this.finger.down = false; this._steer = null;
    if (this.pup) { this.pup.steering = false; this.pup.targetX = this.pup.x; }
  };

  // ---------------------------------------------------------------- help
  P._rightAir = function () {
    var out = [];
    for (var i = 0; i < this.items.length; i++) { var it = this.items[i]; if (it.right && (it.state === 'fall' || it.state === 'appear')) out.push(it); }
    return out;
  };
  P._lowestRight = function () {
    var a = this._rightAir(), best = null;
    for (var i = 0; i < a.length; i++) if (!best || a[i].y > best.y) best = a[i];
    return best;
  };
  P._glowing = function () { for (var i = 0; i < this.items.length; i++) if (this.items[i]._glowT > 0 && this._isAir(this.items[i])) return this.items[i]; return null; };
  P._glowItem = function (it, emit) {
    it._glowT = this.cfg.hintTime;
    this._lastHintT = this.time;
    this._mood('think');
    if (emit) { this.counters.hints++; this._emit({ type: 'hint', id: it.id }); }
  };
  P.hint = function () {
    if (this.state !== 'round' || this._roundEnded) return null;
    var g = this._glowing();
    if (g && g.right) return g.id;          // already glowing: no repeated event / voice line
    var it = this._lowestRight();
    if (!it) { this._hintPending = true; return null; }
    this._glowItem(it, true); this._hintPending = false; this._mistakes = 0;
    return it.id;
  };
  P._mistake = function () {
    this._mistakes++;
    if (this._mistakes >= this.cfg.hintAfterMistakes) this._hintPending = true;
  };
  P._stepHelp = function (h) {
    var cfg = this.cfg;
    if (this._hintPending && !this._glowing() && this.time - this._lastHintT >= cfg.hintCooldown - 1e-9) {
      var it = this._lowestRight();
      if (it) { this._glowItem(it, true); this._hintPending = false; this._mistakes = 0; }
    }
    if (this._spawnCount > 0) {
      this._idleT += h;
      if (this._idleT >= this._idleGap - 1e-9) {
        this._idleT = 0;
        this._idleGap = Math.min(cfg.idleMax, this._idleGap * cfg.idleBackoff);   // 12 → 18 → 27 → 30 s
        this._mood('think');
        this.counters.idles++;
        var r = this._lowestRight();
        if (r && !this._glowing()) this._glowItem(r, false);
        this._emit({ type: 'idle', promptKey: this.cur.promptKey, params: this.cur.params });
      }
    }
  };

  // ---------------------------------------------------------------- spawning
  P._spawnGap = function () { return this.age <= 3 ? this.cfg.spawnGapAge3 : this.cfg.spawnGap; };
  P._stepSpawner = function (h) {
    var cfg = this.cfg, cur = this.cur, i, air = 0, rightAir = 0;
    this._sinceSpawn += h;
    for (i = 0; i < this.items.length; i++) { var it = this.items[i]; if (this._isAir(it)) { air++; if (it.right) rightAir++; } }
    this._noRightT = rightAir ? 0 : this._noRightT + h;
    if (this.basket.reserved >= this.basket.need || !cfg.autoSpawn) return;
    if (this._spawnCount === 0) { if (this.stateTime >= cfg.firstSpawn - 1e-9) this._spawn(true); return; }
    if (this._sinceSpawn < this._spawnGap() - 1e-9) return;
    if (air < cur.maxAir) this._spawn(rightAir === 0 ? true : null);
    else if (rightAir === 0 && this._noRightT >= cfg.rightGapMax - 1e-9 && air < cur.maxAir + 1) this._spawn(true);
  };

  P._fallV = function (age) {
    return this.cfg.fallSpeed[age] * (1 + this.cfg.fallLevelK * this.level) * this._fallScale();
  };

  P._spawn = function (forceRight) {
    var cfg = this.cfg, cur = this.cur, r = this._srng, L = this.layout, i;
    var right = forceRight === true ? true : forceRight === false ? false : (this.age <= 4 && !this._lastRight) ? true : r.chance(cur.rightShare);
    var rights = [], wrongs = [];
    for (i = 0; i < cur.pool.length; i++) (cur.pool[i].right ? rights : wrongs).push(i);
    var ti;
    if (right) ti = r.pick(rights);
    else {
      var wc = wrongs.length > 1 ? wrongs.filter(function (k) { return k !== this._lastWrongTpl; }, this) : wrongs;
      ti = r.pick(wc); this._lastWrongTpl = ti;
    }
    var t = cur.pool[ti], size = t.size, bub = cfg.bubbleK * size;
    var x0 = L.lanes.x0, x1 = L.lanes.x1, first = this._spawnCount === 0;
    // estimated fall time to the rim → upwind spawn so the bubble LANDS where we planned
    var vT = this._fallV(this.age), fallT = (L.sky.bottom - L.spawnY) / vT + 1 / cfg.dragRate;
    var drift = this.windVx * fallT;
    var land;
    if (first) {
      var px = this.pup.x;
      if (this.round === 0) {
        var off = r.float(cfg.warmNearPx[0], cfg.warmNearPx[1]) * r.sign();
        land = clamp(px + off, x0, x1);
      } else {
        var nr = cfg.firstNearK * L.W;
        land = r.float(Math.max(x0, px - nr), Math.min(x1, px + nr));
      }
    } else {
      // farthest-point sampling against bubbles at a similar height (upper part of the sky)
      var best = null, bs = -1;
      for (i = 0; i < cfg.spawnCandidates; i++) {
        var cx = x0 + (x1 - x0) * (i + r.float(0.15, 0.85)) / cfg.spawnCandidates;
        var score = 2000 + r.float(0, 400);      // > any distance: empty sky → random lane
        for (var k = 0; k < this.items.length; k++) {
          var o = this.items[k];
          if (!this._isAir(o)) continue;
          var dy = o.y - L.spawnY;
          if (dy > 3 * bub) continue;
          var ox = o.xb + this.windVx * (fallT * Math.max(0, 1 - dy / Math.max(1, L.sky.bottom - L.spawnY)));
          score = Math.min(score, Math.abs(cx - ox) + dy * 0.35);
        }
        if (score > bs + 1e-9) { bs = score; best = cx; }
      }
      land = best;
    }
    var xs = clamp(land - drift, x0, x1);
    var id = 'b' + (this._nextId++);
    var it = {
      id: id, sprite: t.sprite, shape: t.shape, color: t.anyColor ? r.pick(PG.Content.COLORS) : t.color, text: t.text,
      scale: t.scale, size: size, size0: size, nameKind: t.nameKind, nameValue: t.nameValue, right: t.right,
      x: xs, y: L.spawnY, xb: xs, ub: this.windVx, vx: 0, vy: 0, rot: 0, vr: 0, sx: 1, sy: 1, _q: 0, _qv: 0,
      bsx: 1, bsy: 1, _bq: 0, _bqv: 0, alpha: 1,
      state: 'appear', t: 0, appear: 0, bubble: 1, glow: 0, _glowT: 0,
      phase: r.float(0, TAU), _swP: r.float(cfg.swayPeriodMin, cfg.swayPeriodMax), misses: 0,
      inBasket: false, slot: -1, _f: null, _px: xs, _py: L.spawnY, _prot: 0
    };
    this.items.push(it);
    this._spawnCount++; this._sinceSpawn = 0; this._lastRight = t.right;
    if (t.right) this._noRightT = 0;
    this.counters.spawns++;
    this._emit({ type: 'appear', id: id });
    return it;
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
    for (i = 0; i < this.items.length; i++) { var o = this.items[i]; o._px = o.x; o._py = o.y; o._prot = o.rot; }
    this.pup._px = this.pup.x; this.basket._px = this.basket.x; this.basket._py = this.basket.y;
    this.time += h; this.stateTime += h;
    var lt = this.time - this.levelStartTime;
    this.wind = (cfg.windBase[this.weather] || 0) * (1 + cfg.windWobble * Math.sin(TAU * lt / cfg.windPeriod));
    this.windVx = this.wind * cfg.windPx;

    switch (this.state) {
      case 'intro': if (this.stateTime >= cfg.introTime - 1e-9) this._beginRound(); break;
      case 'round':
        if (!this._roundEnded) { this._stepSpawner(h); this._stepHelp(h); }
        break;
      case 'roundDone':
        if (this.stateTime >= cfg.leaveDelay - 1e-9 && this.stateTime - h < cfg.leaveDelay - 1e-9) {
          for (i = 0; i < this.items.length; i++) if (this.items[i].state === 'in' || this.items[i].state === 'pop') this._leave(this.items[i], true);
        }
        if (this.stateTime >= cfg.roundDoneTime - 1e-9) {
          this.round++;
          var long = this.round >= cfg.chapterMinRounds && this.time - this.levelStartTime > cfg.chapterTimeLimit;
          if (this.round < this.roundsPerLevel && !long) this._beginRound(); else this._startTalk();
        }
        break;
      case 'talk':
        if (this.talkAnswered) { if (this.stateTime >= cfg.talkAfterAnswer - 1e-9) this._levelDone(); break; }
        this._talkAskT += h;
        if (this._talkAskT >= cfg.talkAskTime - 1e-9) {
          this._talkAskT = 0; this._talkAsks++;
          if (this._talkAsks >= cfg.talkGlowAfterAsks) this.talk.glowAnswer = true;
          this._emit({ type: 'talkAsk', talk: this.talk, n: this._talkAsks, glowAnswer: this.talk.glowAnswer });
        }
        break;
      case 'levelDone':
        if (this.stateTime >= cfg.levelDoneTime - 1e-9) {
          if (this.level < this.levels.length - 1) this.startLevel(this.level + 1);
          else { this._setState('sessionDone'); this.items = []; this._emit({ type: 'sessionDone', stars: this.stars }); }
        }
        break;
    }

    this._stepPup(h);
    this._stepBasket(h);
    var dead = false;
    for (i = 0; i < this.items.length; i++) { this._stepItem(this.items[i], h); if (this.items[i]._dead) dead = true; }
    if (dead) this.items = this.items.filter(function (it) { return !it._dead; });
  };

  // ---------------------------------------------------------------- Pip + basket
  P._stepPup = function (h) {
    var p = this.pup, cfg = this.cfg, L = this.layout;
    if (p.moodT > 0) { p.moodT -= h; if (p.moodT <= 0) { p.moodT = 0; p.mood = 'idle'; } }
    // critically damped follow, speed-limited, clamped to the lanes
    var w = cfg.pupOmega, vx0 = p.vx;
    var ax = w * w * (p.targetX - p.x) - 2 * w * p.vx;
    p.vx = clamp(p.vx + ax * h, -L.pup.speed, L.pup.speed);
    p.x += p.vx * h;
    if (p.x < L.pup.minX) { p.x = L.pup.minX; if (p.vx < 0) p.vx = 0; }
    if (p.x > L.pup.maxX) { p.x = L.pup.maxX; if (p.vx > 0) p.vx = 0; }
    p.ax = (p.vx - vx0) / h;
    if (Math.abs(p.vx) < 1e-3 && Math.abs(p.targetX - p.x) < 0.05) { p.vx = 0; p.x = p.targetX; }
    p.run = Math.min(1, Math.abs(p.vx) / L.pup.speed);
    p.step = (p.step + Math.abs(p.vx) * cfg.stepK * h) % TAU;
    if (Math.abs(p.vx) > cfg.faceVx) p.face = p.vx > 0 ? 1 : -1;
    var tt = clamp(p.vx * cfg.tiltK, -cfg.tiltMax, cfg.tiltMax), wt = cfg.tiltOmega;
    p._tv += (wt * wt * (tt - p.tilt) - 2 * cfg.tiltZeta * wt * p._tv) * h;
    p.tilt += p._tv * h;
    // hops: a single happy hop, or 3 cheer hops (each 70 % of the last)
    if (p._hopT >= 0) {
      p._hopT += h;
      if (p._hopKind === 'cheer') {
        var n = p._hopT / cfg.cheerHopTime;
        if (n >= 3) { p._hopT = -1; p.hop = 0; }
        else { var ph = n - Math.floor(n); p.hop = cfg.cheerHopPx * Math.pow(0.7, Math.floor(n)) * 4 * ph * (1 - ph); }
      } else {
        var u = p._hopT / cfg.hopTime;
        if (u >= 1) { p._hopT = -1; p.hop = 0; } else p.hop = cfg.hopPx * 4 * u * (1 - u);
      }
    }
    // eyes: the lowest right bubble, else ahead of the basket
    var tgt = this.state === 'round' ? this._lowestRight() : null;
    var lx = tgt ? tgt.x : p.x + p.face * 120, ly = tgt ? tgt.y : L.spawnY + 80;
    var k = Math.min(1, h * cfg.lookRate);
    p.lookX += (lx - p.lookX) * k; p.lookY += (ly - p.lookY) * k;
  };

  P._stepBasket = function (h) {
    var b = this.basket, cfg = this.cfg, p = this.pup;
    // pendulum lag: the basket is "hung" from Pip's paws — his acceleration pushes it back, a spring returns it
    var w = cfg.swayOmega, z = cfg.swayZeta;
    b._swv += (-w * w * b.sway - 2 * z * w * b._swv - cfg.swayInertia * p.ax) * h;
    b.sway += b._swv * h;
    var sm = cfg.swayMaxK * b.w;
    if (b.sway > sm) { b.sway = sm; if (b._swv > 0) b._swv = 0; }
    if (b.sway < -sm) { b.sway = -sm; if (b._swv < 0) b._swv = 0; }
    b.wobble = -b.sway * cfg.wobbleK;
    this._placeBasket();
    var wq = cfg.basketOmega, zq = cfg.basketZeta;
    b._sqv += (-wq * wq * b.squash - 2 * zq * wq * b._sqv) * h;
    b.squash += b._sqv * h;
    if (b._shakeT >= 0) {
      b._shakeT += h;
      var u = b._shakeT / cfg.shakeTime;
      if (u >= 1) { b._shakeT = -1; b.shake = 0; }
      else b.shake = Math.sin(TAU * cfg.shakeWiggles * u) * Math.pow(1 - u, 1.5);
    }
    var full = b.count >= b.need && this.cur && (this.state === 'roundDone' || this.state === 'round');
    b.glow = clamp(b.glow + (full ? 1 : -1) * h * cfg.glowRate, 0, 1);
  };

  // ---------------------------------------------------------------- items
  P._spring = function (it, h) {       // item squash spring (q → 0)
    var w = this.cfg.squashOmega, z = this.cfg.squashZeta;
    it._qv += (-w * w * it._q - 2 * z * w * it._qv) * h;
    it._q += it._qv * h;
    it.sx = 1 + it._q; it.sy = 1 - 1.2 * it._q;
  };
  P._bubbleSpring = function (it, h) { // bubble squash spring (ground contact)
    var w = this.cfg.squashOmega * 0.7, z = 0.35;
    it._bqv += (-w * w * it._bq - 2 * z * w * it._bqv) * h;
    it._bq += it._bqv * h;
    it.bsx = 1 + it._bq; it.bsy = 1 - it._bq;
  };

  /** Drift centre xb: relaxes to the wind, soft spring back inside the lanes; displayed x adds the sway. */
  P._drift = function (it, h, magnet) {
    var cfg = this.cfg, L = this.layout, A = cfg.swayAmp;
    it.ub += (this.windVx - it.ub) * cfg.driftRate * h;
    var lo = L.lanes.x0, hi = L.lanes.x1;
    if (it.xb < lo) it.ub += cfg.edgeK * (lo - it.xb) * h * 8;
    if (it.xb > hi) it.ub -= cfg.edgeK * (it.xb - hi) * h * 8;
    if (it.xb < lo && it.ub < 0) it.ub *= 1 - Math.min(1, 6 * h);
    if (it.xb > hi && it.ub > 0) it.ub *= 1 - Math.min(1, 6 * h);
    it.xb += it.ub * h;
    if (magnet) it.xb += (this.basket.x - it.x) * cfg.magnetRate * h;
    it.phase += TAU / it._swP * h;
    var nx = it.xb + A * Math.sin(it.phase);
    it.vx = (nx - it.x) / h;
    it.x = nx;
    it.rot = cfg.rotSway * Math.sin(it.phase - 0.6);
  };

  P._stepItem = function (it, h) {
    var cfg = this.cfg, L = this.layout, b = this.basket, u, f;
    it.t += h;
    if (it._glowT > 0) it._glowT = Math.max(0, it._glowT - h);
    it.glow = clamp(it.glow + (it._glowT > 0 ? 1 : -1) * cfg.glowRate * h, 0, 1);
    switch (it.state) {
      case 'appear':
        u = clamp(it.t / cfg.appearTime, 0, 1);
        it.appear = easeOutBack(u);
        this._drift(it, h, false);
        it.vy = 0;
        if (u >= 1) { it.appear = 1; it.state = 'fall'; it.t = 0; }
        break;

      case 'fall': {
        var vT = this._fallV(this.age) * (1 - (1 - cfg.hintSlow) * it.glow);
        it.vy += (vT - it.vy) * cfg.dragRate * h;
        var rimY = b.y, half = 0.5 * b.w + cfg.catchSideK * it.size, dx = it.x - b.x;
        var magnet = it.right && this.age <= cfg.magnetMaxAge && this.state === 'round' &&
          Math.abs(dx) <= half + cfg.magnetX && it.y >= rimY - cfg.magnetUp && it.y < rimY;
        this._drift(it, h, magnet);
        it.y += it.vy * h;
        // catch: centre in the rim band, moving down, inside the basket mouth
        if (this.state === 'round' && !this._roundEnded && it.vy > 0 && b.reserved < b.need &&
            it.y >= b.y - cfg.catchAbove && it.y <= b.y + cfg.catchBelow && Math.abs(it.x - b.x) <= 0.5 * b.w + cfg.catchSideK * it.size) {
          this._catch(it);
          break;
        }
        if (it.y >= L.groundY - cfg.groundK * it.size) this._ground(it);
        break;
      }

      case 'pop': {   // right: parabola in basket coordinates into the slot; wrong: short dip, then hop out
        f = it._f;
        if (it.right) {
          f.tau = Math.min(f.T, f.tau + h);
          var s = f.tau;
          var lx = f.x0 + f.vx0 * s + 0.5 * f.ax * s * s, ly = f.y0 + f.vy0 * s + 0.5 * f.ay * s * s;
          it.x = b.x + lx; it.y = b.y + ly;
          it.vx = f.vx0 + f.ax * s; it.vy = f.vy0 + f.ay * s;
          u = f.tau / f.T;
          it.size = f.size0 + (f.size1 - f.size0) * u;
          it.rot = f.rot0 * (1 - u) * (1 - u);
          if (it.vy > 0 && ly > -0.1 * b.h) it.inBasket = true;
          if (f.tau >= f.T - 1e-9) this._land(it);
        } else {
          it.vy += cfg.gravity * h * 0.5; it.y += it.vy * h; it.x += (b.x + it._dx - it.x) * Math.min(1, 20 * h);
          it.inBasket = true;
          if (it.t >= cfg.wrongDip - 1e-9) {
            var side = it.x - this.pup.x;
            var sg = Math.abs(side) < 1 ? (this.rng.next() < 0.5 ? -1 : 1) : side > 0 ? 1 : -1;
            // hop out away from Pip's centre, but never off the play area
            if (it.x + sg * 90 > L.lanes.x1 + 40 || it.x + sg * 90 < L.lanes.x0 - 40) sg = -sg;
            it.vx = sg * cfg.hopOutVx; it.vy = cfg.hopOutVy; it.vr = sg * 5;
            it.state = 'bounce'; it.t = 0; it.inBasket = false;
          }
        }
        this._spring(it, h);
        break;
      }

      case 'in': {
        var sl = b.slots[Math.min(it.slot, b.slots.length - 1)];
        it.x = b.x + sl.dx; it.y = b.y + sl.dy; it.rot = b.wobble;
        this._spring(it, h);
        break;
      }

      case 'bounce':  // ballistic hop out of the basket; at the apex a new bubble forms
        it.vy += cfg.gravity * h; it.x += it.vx * h; it.y += it.vy * h; it.rot += it.vr * h;
        it.vr *= 1 - Math.min(1, 2 * h);
        if (it.vy >= 0) { it.state = 'rise'; it.t = 0; it.bubble = 0; it.xb = it.x; it.ub = it.vx * 0.5; it.phase = 0; }
        this._spring(it, h);
        break;

      case 'ground': // bubble squashes on the grass and bounces softly
        it.vy += cfg.groundG * h; it.y += it.vy * h;
        var gy = L.groundY - cfg.groundK * it.size;
        if (it.y > gy) { it.y = gy; if (it.vy > 0) it.vy = -cfg.groundBounce * it.vy; }
        it.x += it.ub * 0.2 * h;
        it.rot *= 1 - Math.min(1, 4 * h);
        this._bubbleSpring(it, h);
        if (it.t >= cfg.groundTime - 1e-9) { it.state = 'rise'; it.t = 0; it.xb = it.x - cfg.swayAmp * Math.sin(it.phase); }
        break;

      case 'rise': {
        it.bubble = Math.min(1, it.bubble + h / cfg.rebubbleTime);
        var vr = -cfg.riseSpeed * this._fallScale() * (0.3 + 0.7 * it.bubble);
        it.vy += (vr - it.vy) * cfg.riseRate * h;
        it.y += it.vy * h;
        this._drift(it, h, false);
        it.rot *= 1 - Math.min(1, 2 * h);
        this._bubbleSpring(it, h);
        if (it.y < -cfg.bubbleK * it.size) it._dead = true;
        break;
      }

      case 'leave':
        u = clamp(it.t / cfg.leaveTime, 0, 1);
        if (it._wasIn) { it.vy += cfg.leaveG * h; it.x += it.vx * h; it.y += it.vy * h; it.rot += it.vr * h; }
        else { it.bubble = 0; it.vy += cfg.gravity * 0.3 * h; it.y += it.vy * h; }
        it.alpha = 1 - u;
        if (u >= 1) it._dead = true;
        break;
    }
  };

  /* Constant-acceleration (parabolic) path from (x0,y0) to (x1,y1) in T s, apex H px above the higher end:
   *   ya = min(y0,y1) − H, √g = (√(2(y0−ya)) + √(2(y1−ya)))/T, vy0 = −√(2g(y0−ya)); x: ax = 2(x1−x0−vx0T)/T². */
  function arc(x0, y0, x1, y1, T, H, vx0) {
    var ya = Math.min(y0, y1) - H, A0 = y0 - ya, A1 = y1 - ya;
    var sg = (Math.sqrt(2 * A0) + Math.sqrt(2 * A1)) / T, g = sg * sg;
    return { x0: x0, y0: y0, x1: x1, y1: y1, vx0: vx0, vy0: -Math.sqrt(2 * g * A0), ax: 2 * (x1 - x0 - vx0 * T) / (T * T), ay: g, T: T, tau: 0, H: H };
  }
  World.arc = arc;

  P._catch = function (it) {
    var cfg = this.cfg, b = this.basket, p = this.pup;
    this.counters.catches++;
    it.bubble = 0; it.state = 'pop'; it.t = 0;
    this._emit({ type: 'catch', id: it.id, right: it.right });
    this._emit({ type: 'pop', id: it.id, x: it.x, y: it.y });
    if (it.right) {
      it.slot = b.reserved++;
      var sl = b.slots[Math.min(it.slot, b.slots.length - 1)];
      var vx0 = clamp((it.vx - p.vx) * cfg.popInherit, -300, 300);
      it._f = arc(it.x - b.x, it.y - b.y, sl.dx, sl.dy, cfg.popTime, cfg.popApex, vx0);
      it._f.size0 = it.size; it._f.size1 = b.slotSize; it._f.rot0 = it.rot;
      this._mistakes = 0; this._hintPending = false;
      this._idleT = 0; this._idleGap = cfg.idleTime;
      p._hopT = 0; p._hopKind = 'hop';
      this._mood('happy');
      this.counters.correct++;
      this._emit({ type: 'correct', id: it.id, nameKind: it.nameKind, nameValue: it.nameValue, count: b.reserved, need: b.need, target: this.cur.target });
    } else {
      it._dx = it.x - b.x; it.vy = Math.min(it.vy, 120);
      this.roundMistakes++;
      b._shakeT = 0;
      this._mood('oops');
      this._idleT = 0;
      this.counters.wrong++;
      this._emit({ type: 'wrong', id: it.id, nameKind: it.nameKind, nameValue: it.nameValue, target: this.cur.target, misses: this.roundMistakes });
      this._mistake();
    }
  };

  P._land = function (it) {
    var cfg = this.cfg, b = this.basket;
    it.state = 'in'; it.t = 0; it._f = null; it.inBasket = true; it.size = b.slotSize; it.vx = 0; it.vy = 0;
    it._q = cfg.landSquash; it._qv = 0;
    b.count++;
    b.squash = cfg.basketSquash; b._sqv = 0;
    this._emit({ type: 'land', id: it.id, count: b.count, need: b.need });
    if (this.state === 'round' && b.count >= b.need) this._endRound();
  };

  P._ground = function (it) {
    var cfg = this.cfg;
    it.state = 'ground'; it.t = 0;
    it.y = this.layout.groundY - cfg.groundK * it.size;
    it.vy = -cfg.groundBounce * it.vy;
    it._bq = cfg.groundSquash; it._bqv = 0; it.bsx = 1 + it._bq; it.bsy = 1 - it._bq;
    this._emit({ type: 'bounce', id: it.id });
    if (it.right && this.state === 'round' && !this._roundEnded) {
      it.misses++;
      this.counters.misses++;
      this._emit({ type: 'miss', id: it.id });
      this._mistake();
    }
  };

  PG.World = World;
})(window.PG = window.PG || {});
