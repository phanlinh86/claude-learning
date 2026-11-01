/* Kitten's Balloon Farm — KB.CONFIG + KB.World (headless, deterministic tap/pop simulation; DESIGN §2, §5.2)
 *
 * ============================== CONVENTIONS ==============================
 *  Units: logical px (short side = 720), seconds, radians, y DOWN. rot > 0 = clockwise (canvas).
 *  update(dt) runs fixed sub-steps of cfg.step (1/120 s) with an accumulator. At the START of every
 *  sub-step each balloon / friend stores _px,_py,_prot (balloon strings: _pstring); the renderer draws
 *  p = _p + (p − _p) · w.alpha. The result depends only on the seed + the sub-step at which inputs arrive.
 *
 *  Drawing a balloon b (state rise | float | away; skip pop/gone bodies):
 *    body centre (x, y), rotation rot, drawn body WIDTH = b.size (already includes scale and any fit-shrink),
 *    squash sx, sy (around the centre), b.alpha (fades on 'away'), b.glow 0..1 (hint halo), b.sprite / b.text on top.
 *    string: b.string[0..6] points (world px), [0] = the knot; alpha b.strAlpha (fades after a pop).
 *  Friend f (animal sticker): BOTTOM-CENTRE anchor (x, y) on the grass, width f.size (84), rot around the
 *    anchor, sx/sy squash around the anchor, f.alpha.
 *  Shreds: { x, y, vx, vy, rot, vr, color, life (s left), life0 } — cosmetic latex bits.
 *  Sign: w.sign { type, value, need, filled, wob } — wob ≈ −1..1 → suggested rotation 0.06·wob around the post foot.
 *  Miu: w.miu { mood, moodT, lookX, lookY, hop } — hop = px ABOVE the feet anchor.
 * ========================================================================
 */
(function (KB) {
  'use strict';

  var CONFIG = {
    // ---- timing / state machine (s)
    step: 1 / 120,             // fixed simulation sub-step (≤ 1/120 per DESIGN)
    maxFrame: 1.0,             // largest dt accepted per update() (speed mode passes big dt)
    roundsPerLevel: 4,         // warm-up + 3 rounds
    chapterTimeLimit: 75,      // s since the chapter began: after ≥ chapterMinRounds rounds go to Talk time once exceeded
    chapterMinRounds: 3,
    introTime: 2.5,            // chapter banner + "Chapter 2 · Shapes!" + the 2.5 s sky crossfade (playtest: 1.8 → 2.5)
    roundEndDelay: 0.5,        // s after the last target popped → remaining balloons away + roundDone
    roundEndFriendWait: 3.0,   // …but wait (at most this long) for falling friends to touch the grass first
    roundDoneTime: 2.2,        // stars + Miu's praise line (≈ 2 s), then the next round (playtest: 1.7 → 2.2)
    leaveDelay: 1.6,           // s into roundDone when the friends fade out …
    leaveTime: 0.4,            // … over this long
    talkAfterAnswer: 2.0,      // Talk panel stays after an answer (Miu: "Yes! Moo! The cow!")
    levelDoneTime: 2.4,        // chapter stars
    talkAskTime: 12,           // s without an answer → talkAsk (re-ask), repeating
    talkGlowAfterAsks: 2,      // from this re-ask on talk.glowAnswer = true

    // ---- layout (DESIGN §2; px)
    shortSide: 720, minLong: 960, maxLong: 1600,
    groundOffset: 96,          // groundY = H − ins.bottom − 96 (top of the grass)
    tallAspect: 1.6, tallGroundRaise: 0.3, tallGroundMax: 140,   // tall portrait: groundY rises by min(140, 0.3·(H − 1.6 W))
    miuDx: 110, miuDy: 18, miuHLand: 190, miuHPort: 200,          // Miu feet anchor (ins.left + 110, groundY + 18)
    signDx: 165, signDy: 24, signW: 150, signVBW: 128, signVBH: 112,   // sign post foot (miu.x + 165, groundY + 24), board 150 wide
    bubbleX: 24, bubbleY: 20, bubbleMaxW: 640, bubbleRightGap: 160, bubbleH: 104,
    playSide: 50,              // balloon bodies stay ≥ 50 px from the safe-area sides
    playTopGap: 30,            // … and ≥ 30 px below the bubble
    playGroundGap: 150,        // lowest balloon centre = groundY − 150 …
    stringReach: 1.5, stringBelowGround: 50,   // … or higher, so knot (≈ 0.6·size) + rope (0.9·size) ends ≤ 50 px below groundY (tall phones, age 3)
    portraitBandFrac: 1.05,    // portrait: band height ≤ 1.05·W, kept just above the ground (short reach)
    miuBoxDx: 110,             // no balloon body in the box x < sign.x + 110, y > groundY − 320 (Miu + sign)
    miuBoxH: 320,
    miuBoxHMin: 240,           // crowded rounds only (packing fails otherwise): the box shrinks to 240 px (bodies still clear Miu's hat)
    yardDx: 120, yardRight: 60, yardDy: 30,   // friends land on y = groundY + 30, x from sign.x + 120 to W − ins.right − 60
    yardSpacing: 92, yardRowDy: 24,           // 92 px apart; a 2nd row stands 24 px further back, offset half a slot
    hudW: 160, hudH: 96,       // DOM buttons top-right: x > W − ins.right − 160, y < ins.top + 96

    // ---- balloons
    balloonSize: { 3: 128, 4: 118, 5: 108, 6: 108, 7: 108 },   // body width by age
    tallScale: 1.15,           // ×1.15 on tall portrait phones
    homeSpacing: 1.2,          // min centre distance = 1.2 × mean size of the pair
    homeSpacingMany: 1.05, manyAt: 10,   // > 10 balloons (count 9–12 at ages 5–7): 1.05 × so they keep ≥ 100 px on an iPad
    shrinkStep: 0.05, minShrink: 0.8, // sizes shrink in 5 % steps down to 0.8× before packing gives up (then keeps shrinking)
    packGrid: 14,              // px: candidate grid for farthest-point sampling
    packTriesMany: 24,         // crowded rounds (> 10 balloons): more restarts before shrinking
    packTries: 6,              // attempts per size step before shrinking (2 spread, 2 tight, 2 with the lower Miu box)
    packSlack: 0.8,            // pick randomly among candidates whose clearance is ≥ 80 % of the best (spread + variety)
    knotY: { circle: 0.6, heart: 0.5, star: 0.5, square: 0.56, triangle: 0.52, rect: 0.42 },   // knot below centre (× size) if KB.BalloonArt is absent
    touchR: 0.6, touchPad: 14, // hit radius = 0.6 × size + 14; nearest centre wins
    tapAtRise: 0.6,            // a rising balloon reacts after 60 % of its rise

    // rise: buoyant under-damped spring from below the grass to home
    riseStagger: 0.12,         // s between balloons
    riseOmega: 3.2, riseZeta: 0.55,   // soft overshoot (≈ 12 %), 60 % of the rise in ≈ 0.5 s, settled in ≈ 1.5 s
    riseJitterX: 30,           // start x = home ± 30 px (the spring curves it in)
    riseSettle: 1.6,           // s: rise → float (or earlier once within 3 px and < 20 px/s)

    // float: spring to (home + bob + drift + wind) — stiffer so a wrong-tap kick returns in ≈ 1 s
    floatOmega: 5.5, floatZeta: 0.7,  // settles in ≈ 4/(ζω) ≈ 1.0 s
    bobAmp: [6, 9], bobPeriod: [2.2, 3.4],      // vertical sine (px, s), random phase
    driftAmp: 10, driftPeriod: [5, 8],          // lazy horizontal drift ±10 px
    windGain: 0.35,            // home shift = wind · 0.35 s (±14 px at ±40 px/s)
    windTilt: 0.003,           // rad per px/s of wind (±0.12 rad)
    sepFactor: 1.1, sepK: 40, sepHomeFrac: 0.95,  // soft separation below 1.1 × mean size (never stronger than the homes allow)
    tiltK: 0.0025, tiltMax: 0.25,               // target rot = clamp(−vx · 0.0025 + wind tilt, ±0.25)
    tiltOmega: 7, tiltZeta: 0.35,               // rotational spring (sways ~2 times)
    hintBob: 1.0,              // a glowing balloon bobs (1 + 1.0) × bigger

    // string: 7-point verlet rope
    strings: true,             // (the sims may switch strings off: cosmetic only)
    stringPts: 7, stringSeg: 0.15,              // segment = 0.15 × size (rope 0.9 × size)
    stringGravity: 900, stringDamp: 0.98, stringIters: 3,
    stringWind: 5,             // px/s² of sideways pull per px/s of wind
    stringFade: 0.6,           // s: a popped balloon's string falls and fades

    // pop
    popStretchTime: 0.08, popStretch: 1.18,     // 0.08 s stretch to 1.18× → burst ('pop' event)
    shredN: 8, shredSpeed: [140, 340], shredGravity: 700, shredDrag: 1.6, shredLife: [0.6, 0.95], shredCap: 64,

    // friends (animal stickers from popped animal balloons)
    friendSize: 84,
    friendGravity: 600, friendTerminal: 222,    // drag k = g / v_t = 2.7 1/s → ≈ 220 px/s terminal (leaf-like)
    friendPopVy: -60,          // a little hop up when the balloon bursts
    friendSwayAmp: 18, friendSwayRad: 0.25, friendSwayHz: 0.7,   // sway ±18 px / ±0.25 rad like a leaf
    friendBounceG: 900, friendBounce0: 160, friendRestitution: 0.35, friendBounces: 2,   // first hop ≥ 160 px/s (≈ 14 px), then ×0.35
    friendSquash: 0.22, squashOmega: 18, squashZeta: 0.3,
    friendBreath: 0.02,        // resting friends breathe ±2 % (sy)

    // wrong tap
    wrongCooldown: 0.3,        // s per balloon
    wrongImpulse: 220,         // px/s away from the finger
    wobbleOmega: 16, wobbleZeta: 0.28, wobbleAmp: 0.18,   // squash-and-stretch spring
    shakeTime: 0.6, shakeAmp: 0.22, shakeHz: 3.5,         // "no-no" rotational shake (decays (1 − u)²)

    // away (round end / count extras)
    awayAccel: 260, awayV0: 180, awaySway: 22, awayFadeAt: 1.0, awayFade: 0.5,

    // sign
    signOmega: 14, signZeta: 0.25, signKick: 6, signKickRound: 4,

    // ---- help
    hintAfterMisses: 2, hintTime: 3,
    hintCooldown: 6,           // s: no auto-hint while one glows nor within 6 s of the last
    idleTime: 12,              // s without a tap → idle nudge …
    idleBackoff: 1.5, idleMax: 30,   // … gap ×1.5 per nudge up to 30 s

    // ---- Miu
    moodTime: { happy: 0.9, cheer: 1.6, oops: 0.8, think: 1.4 },
    cheerHopPx: 26, cheerHopTime: 0.4, lookRate: 6, lookHold: 3
  };
  KB.CONFIG = CONFIG;

  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hyp(x, y) { return Math.sqrt(x * x + y * y); }
  function smooth(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  function merge(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; if (b) for (k in b) o[k] = b[k]; return o; }

  /** DESIGN §2 short-side rule: CSS viewport → logical W×H. */
  function logicalSize(cssW, cssH, cfg) {
    cfg = cfg || CONFIG;
    var S = cfg.shortSide, aspect = cssW / Math.max(1, cssH);
    if (cssW >= cssH) return { W: clamp(Math.round(S * aspect), cfg.minLong, cfg.maxLong), H: S };
    return { W: S, H: clamp(Math.round(S / aspect), cfg.minLong, cfg.maxLong) };
  }

  function computeLayout(W, H, ins, age, cfg) {
    ins = { top: +(ins && ins.top) || 0, right: +(ins && ins.right) || 0, bottom: +(ins && ins.bottom) || 0, left: +(ins && ins.left) || 0 };
    var portrait = H > W, tall = H / W > cfg.tallAspect;
    var raise = tall ? Math.min(cfg.tallGroundMax, cfg.tallGroundRaise * (H - cfg.tallAspect * W)) : 0;
    var groundY = H - ins.bottom - cfg.groundOffset - raise;
    var miu = { x: ins.left + cfg.miuDx, y: groundY + cfg.miuDy, h: portrait ? cfg.miuHPort : cfg.miuHLand };
    var sw = cfg.signW, sh = sw * cfg.signVBH / cfg.signVBW;
    var sign = { x: miu.x + cfg.signDx, y: groundY + cfg.signDy, w: sw, h: sh };
    var bx = ins.left + cfg.bubbleX;
    var bubble = { x: bx, y: ins.top + cfg.bubbleY, w: Math.min(cfg.bubbleMaxW, W - bx - ins.right - cfg.bubbleRightGap), h: cfg.bubbleH };
    var size = (cfg.balloonSize[age] || cfg.balloonSize[5]) * (tall ? cfg.tallScale : 1);
    // play = rectangle of allowed balloon CENTRES for a balloon of the base size
    var x0 = ins.left + cfg.playSide + size / 2, x1 = W - ins.right - cfg.playSide - size / 2;
    var y0 = bubble.y + bubble.h + cfg.playTopGap + size / 2, y1 = groundY - Math.max(cfg.playGroundGap, cfg.stringReach * size - cfg.stringBelowGround);
    if (portrait && y1 - y0 > cfg.portraitBandFrac * W) y0 = y1 - cfg.portraitBandFrac * W;
    var play = { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
    var excl = { x: -1e4, y: groundY - cfg.miuBoxH, w: 1e4 + sign.x + cfg.miuBoxDx, h: 1e4 };   // Miu + sign box (bodies stay out)
    var yard = { x0: sign.x + cfg.yardDx, x1: W - ins.right - cfg.yardRight, y: groundY + cfg.yardDy };
    return {
      W: W, H: H, ins: ins, portrait: portrait, tall: tall, groundY: groundY,
      miu: miu, sign: sign, bubble: bubble, play: play, excl: excl, yard: yard, balloonSize: size, age: age,
      hud: { x: W - ins.right - cfg.hudW, y: 0, w: cfg.hudW + ins.right, h: ins.top + cfg.hudH }
    };
  }

  function circleHitsRect(cx, cy, r, R) {
    var nx = clamp(cx, R.x, R.x + R.w), ny = clamp(cy, R.y, R.y + R.h);
    return hyp(cx - nx, cy - ny) < r;
  }

  /* ------------------------------------------------------------------ home packing
   * Farthest-point sampling on a grid of candidate centres: the biggest balloon first; each next balloon takes a
   * random candidate among those whose clearance (distance to the nearest placed balloon minus the required
   * spacing) is ≥ packSlack × the best clearance. Spacing 1.2 × mean size; if a balloon does not fit, all sizes
   * shrink 5 % and the packing restarts (to 0.8× → ok; below that it keeps shrinking but reports ok = false).
   * items: [{ base }] (base = unshrunk drawn width) → sets it.hx, it.hy, it.size. Returns { shrink, ok }. */
  function packHomes(items, L, rng, cfg) {
    if (!items.length) return { shrink: 1, ok: true };
    var order = items.map(function (it, i) { return i; }).sort(function (a, b) { return items[b].base - items[a].base || a - b; });
    var spacing = items.length > cfg.manyAt ? cfg.homeSpacingMany : cfg.homeSpacing;
    var exLow = { x: L.excl.x, y: L.groundY - cfg.miuBoxHMin, w: L.excl.w, h: L.excl.h };
    for (var s = 1; s > 0.3; s = Math.round((s - cfg.shrinkStep) * 1000) / 1000) {
      for (var at = 0, nt = items.length > cfg.manyAt ? cfg.packTriesMany : cfg.packTries; at < nt; at++) {
        // attempts: spread (farthest-point) ×2, tight (smallest clearance, hex-like) ×2, then both with the lower Miu box
        var tight = at % 4 >= 2, box = at >= 4 ? exLow : L.excl;   // (crowded: more restarts, alternating spread / tight)
        var placed = tryPack(items, order, L, s, spacing, box, tight, rng, cfg);
        if (placed) {
          for (var j = 0; j < placed.length; j++) { var t = items[placed[j].i]; t.hx = placed[j].x; t.hy = placed[j].y; t.size = placed[j].sz; }
          return { shrink: s, ok: s >= cfg.minShrink - 1e-9 };
        }
      }
    }
    var P = L.play;   // never reached for sane layouts: a row in the band centre
    for (var m = 0; m < items.length; m++) { items[m].hx = P.x + P.w * (m + 0.5) / items.length; items[m].hy = P.y + P.h / 2; items[m].size = items[m].base * 0.3; }
    return { shrink: 0.3, ok: false };
  }
  function tryPack(items, order, L, s, spacing, box, tight, rng, cfg) {
    var P = L.play, base = L.balloonSize, g = cfg.packGrid, placed = [];
    for (var oi = 0; oi < order.length; oi++) {
      var it = items[order[oi]], sz = it.base * s, r = sz / 2;
      // centre range for this size (bigger balloons: the band shrinks by the extra half-width)
      var ex = Math.max(0, (sz - base) / 2), ax = P.x + ex, aw = P.w - 2 * ex, ay = P.y + ex, ah = P.h - 2 * ex;
      if (aw < 0) { ax = P.x + P.w / 2; aw = 0; }
      if (ah < 0) { ay = P.y + P.h / 2; ah = 0; }
      var nx = Math.max(1, Math.floor(aw / g) + 1), ny = Math.max(1, Math.floor(ah / g) + 1);
      var dx = nx > 1 ? aw / (nx - 1) : 0, dy = ny > 1 ? ah / (ny - 1) : 0;
      var cands = [], best = -1e9, low = 1e9;
      for (var iy = 0; iy < ny; iy++) for (var ix = 0; ix < nx; ix++) {
        var cx = ax + ix * dx, cy = ay + iy * dy;
        if (circleHitsRect(cx, cy, r, box)) continue;
        var clr = 1e6;
        for (var k = 0; k < placed.length; k++) {
          var q = placed[k];
          clr = Math.min(clr, hyp(cx - q.x, cy - q.y) - spacing * (sz + q.sz) / 2);
        }
        if (clr < 0) continue;
        cands.push({ x: cx, y: cy, c: clr });
        if (clr > best) best = clr;
        if (clr < low) low = clr;
      }
      if (!cands.length) return null;
      var pool;
      if (!placed.length) pool = cands;
      else if (tight) pool = cands.filter(function (c) { return c.c <= low + g; });
      else pool = cands.filter(function (c) { return c.c >= cfg.packSlack * best - 1e-9; });
      var pick = pool[Math.floor(rng.next() * pool.length)];
      placed.push({ x: pick.x, y: pick.y, sz: sz, i: order[oi] });
    }
    return placed;
  }

  // ------------------------------------------------------------------ World
  function World(opts) {
    opts = opts || {};
    this.cfg = merge(CONFIG, opts.config);
    this.seed = opts.seed !== undefined ? opts.seed : 1;
    this.rng = new KB.RNG(this.seed);
    this.age = KB.Content.ageOf(opts.age !== undefined ? opts.age : 4);
    this.lang = opts.lang === 'vi' ? 'vi' : 'en';
    this._pendingAge = this.age; this._pendingLang = this.lang;
    this.state = 'menu';
    this.level = 0; this.levels = []; this.topic = null; this.weather = 0;
    this.round = 0; this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.stars = 0; this.levelStars = 0; this.roundMistakes = 0; this.roundStars = 0;
    this.time = 0; this.stateTime = 0; this.alpha = 0; this._acc = 0;
    this.cur = null; this.balloons = []; this.friends = []; this.shreds = [];
    this.sign = { type: null, value: null, need: null, filled: 0, wob: 0, _wv: 0 };
    this.target = null; this.queue = []; this.pops = 0;
    this.talk = null; this.talkAnswered = null;
    this.held = null;                         // (Owl API: nothing is ever held in a tap game)
    this.wind = 0;                            // px/s, set by main from weather.ambient.wind each frame
    this.finger = { x: 0, y: 0, down: false };
    this.miu = { mood: 'idle', moodT: 0, lookX: 0, lookY: 0, hop: 0, _hopT: -1 };
    this.events = [];
    this.sessions = 0; this.interactive = false; this.solved = false;
    this._solvedT = -1; this._idleT = 0; this._idleGap = this.cfg.idleTime; this._roundEnded = false;
    this._lastHintT = -1e9; this.levelStartTime = 0; this._talkAskT = 0; this._talkAsks = 0;
    this._lookId = null; this._lookT = -1e9; this._hist = []; this._friendN = 0;
    this.packShrink = 1; this.packOk = true;
    this.setViewport(opts.width || 1280, opts.height || 720, opts.ins || null);
    this.miu.lookX = this.layout.play.x + this.layout.play.w / 2; this.miu.lookY = this.layout.play.y + this.layout.play.h / 2;
  }
  World.logicalSize = logicalSize;
  World.computeLayout = function (W, H, ins, age, cfg) { return computeLayout(W, H, ins, KB.Content.ageOf(age || 4), merge(CONFIG, cfg)); };
  World.packHomes = function (items, L, rng, cfg) { return packHomes(items, L, rng, merge(CONFIG, cfg)); };

  var P = World.prototype;
  Object.defineProperty(P, 'items', { get: function () { return this.balloons; } });   // Owl name (tests / resize code)
  Object.defineProperty(P, 'lumi', { get: function () { return this.miu; } });         // Owl name
  P._emit = function (e) { this.events.push(e); };
  P.drainEvents = function () { var e = this.events; this.events = []; return e; };
  P.setAge = function (a) { this._pendingAge = KB.Content.ageOf(a); };
  P.setLang = function (l) { this._pendingLang = l === 'vi' ? 'vi' : 'en'; };
  P.balloonById = function (id) { for (var i = 0; i < this.balloons.length; i++) if (this.balloons[i].id === id) return this.balloons[i]; return null; };
  P.itemById = P.balloonById;
  P._setState = function (s) { this.state = s; this.stateTime = 0; };
  P._mood = function (m) { this.miu.mood = m; this.miu.moodT = this.cfg.moodTime[m] || 1; if (m === 'cheer') this.miu._hopT = 0; };
  P.cancelDrag = function () { this.finger.down = false; };   // nothing to cancel in a tap game
  P.skipTalk = function () { if (this.state === 'talk') this._levelDone(); };

  /** Current task: ask mode names the CURRENT target animal. */
  P.prompt = function () {
    if (!this.cur) return null;
    if (this.cur.mode === 'ask') {
      var b = this.balloonById(this.target);
      return { promptKey: this.cur.promptKey, params: { animal: b ? b.nameValue : this.cur.params.animal } };
    }
    return { promptKey: this.cur.promptKey, params: this.cur.params };
  };

  /** Can this balloon react to a tap right now? */
  P.canTap = function (b) {
    if (!b || b.popT >= 0) return false;
    if (b.state === 'float') return true;
    return b.state === 'rise' && b.t >= 0 && b.riseU >= this.cfg.tapAtRise;
  };
  P._live = function (b) { return (b.state === 'rise' || b.state === 'float') && b.popT < 0; };

  // ---------------------------------------------------------------- viewport
  P.setViewport = function (W, H, ins) {
    this.layout = computeLayout(W, H, ins, this.age, this.cfg);
    this.playRect = this.layout.play;
    if (this.cur && this.balloons.length) this._relayoutRound();
  };

  P._relayoutRound = function () {
    var i, b, L = this.layout, keep = [];
    for (i = 0; i < this.balloons.length; i++) { b = this.balloons[i]; if (b.state === 'rise' || b.state === 'float') keep.push(b); }
    var rs = (this.cur.seed ^ Math.imul(L.W, 7919) ^ Math.imul(L.H, 104729)) >>> 0;
    this._pack(keep, rs);
    for (i = 0; i < keep.length; i++) {
      b = keep[i];
      if (b.state === 'float') { b.x = b._px = b.hx; b.y = b._py = b.hy; b.vx = b.vy = 0; this._resetString(b); }
      else b._y0 = Math.max(b._y0, b.y);
    }
    for (i = 0; i < this.friends.length; i++) {
      var f = this.friends[i], s = this._yardSlot(f.slot);
      f.tx = s.x; f.ty = s.y;
      if (f.state !== 'fall') { f.x = f._px = s.x; f.y = f._py = s.y; }
      else { f.x0 = Math.min(f.x0, L.W); f.y0 = Math.min(f.y0, f.ty - 1); }
    }
  };

  P._pack = function (list, seed) {
    var pr = packHomes(list, this.layout, new KB.RNG(seed), this.cfg);
    this.packShrink = pr.shrink; this.packOk = pr.ok;
    return pr;
  };

  P._yardSlot = function (k) {
    var Y = this.layout.yard, sp = this.cfg.yardSpacing;
    var per = Math.max(1, Math.floor((Y.x1 - Y.x0) / sp)), row = Math.floor(k / per), col = k % per;
    var x = Y.x0 + sp / 2 + col * sp + (row % 2) * sp / 2;
    x = Math.min(x, Y.x1 - this.cfg.friendSize / 2);
    return { x: x, y: Y.y - row * this.cfg.yardRowDy };
  };

  P._knotY = function (b) {
    var A = KB.BalloonArt;
    if (A && typeof A.knotY === 'function') { var v = A.knotY(b.shape, b.size); if (isFinite(v)) return v; }
    return (this.cfg.knotY[b.shape] || 0.6) * b.size;
  };
  P._knot = function (b) {
    var k = this._knotY(b) * b.sy;
    return { x: b.x - Math.sin(b.rot) * k, y: b.y + Math.cos(b.rot) * k };
  };
  /** String segment: 0.15 × the UNSCALED size (a big balloon has the same string as a normal one). */
  P._seg = function (b) { return this.cfg.stringSeg * b.size / (b.scale || 1); };
  P._resetString = function (b) {
    var n = this.cfg.stringPts, seg = this._seg(b), K = this._knot(b);
    if (!b.string) { b.string = []; b._pstring = []; for (var j = 0; j < n; j++) { b.string.push({ x: 0, y: 0 }); b._pstring.push({ x: 0, y: 0 }); } }
    for (var i = 0; i < n; i++) { b.string[i].x = b._pstring[i].x = K.x; b.string[i].y = b._pstring[i].y = K.y + i * seg; }
  };

  // ---------------------------------------------------------------- session flow
  P.newSession = function () {
    this.age = this._pendingAge; this.lang = this._pendingLang;
    this.sessions++;
    this.levels = KB.Content.topicsFor(this.age);
    this.stars = 0;
    this._emit({ type: 'session', levels: this.levels.slice() });
    this.startLevel(0);
  };

  P.startLevel = function (i) {
    if (!this.levels.length) this.levels = KB.Content.topicsFor(this.age);
    this.level = clamp(i | 0, 0, this.levels.length - 1);
    this.topic = this.levels[this.level];
    this.weather = this.level;
    this.round = 0; this.levelStars = 0; this.levelStartTime = this.time; this._hist = [];
    this.balloons = []; this.friends = []; this.shreds = []; this.cur = null; this.talk = null; this.talkAnswered = null;
    this.queue = []; this.target = null; this.interactive = false; this.solved = false;
    this.sign = { type: null, value: null, need: null, filled: 0, wob: 0, _wv: 0 };
    this._setState('intro');
    this._emit({ type: 'level', level: this.level, topic: this.topic });
  };

  P._beginRound = function () {
    var cfg = this.cfg, i;
    this.layout = computeLayout(this.layout.W, this.layout.H, this.layout.ins, this.age, cfg);
    this.playRect = this.layout.play;
    var rr = new KB.RNG((this.rng.next() * 4294967296) >>> 0);
    var cur = KB.Content.makeRound(this.topic, { age: this.age, lang: this.lang, rng: rr, roundIndex: this.round, history: this._hist, layout: this.layout });
    this.cur = cur; this._hist.push(cur.sum);
    this.roundMistakes = 0; this.pops = 0; this._idleT = 0; this._idleGap = cfg.idleTime; this._roundEnded = false;
    this.interactive = false; this.solved = false; this._solvedT = -1;
    this.friends = []; this.shreds = []; this._friendN = 0;
    this.sign = { type: cur.sign.type, value: cur.sign.value, need: cur.sign.need !== undefined ? cur.sign.need : null, filled: 0,
      wob: 0, _wv: cfg.signKickRound };
    if (cur.sign.parity) this.sign.parity = cur.sign.parity;
    var base = this.layout.balloonSize, L = this.layout;
    this.balloons = cur.balloons.map(function (s, k) {
      return { id: s.id, shape: s.shape, color: s.color, scale: s.scale, base: base * s.scale, size: base * s.scale,
        sprite: s.sprite, text: s.text, answer: s.answer, nameKind: s.nameKind, nameValue: s.nameValue,
        x: 0, y: 0, _px: 0, _py: 0, rot: 0, _prot: 0, vx: 0, vy: 0, vr: 0, hx: 0, hy: 0,
        state: 'rise', t: -k * cfg.riseStagger, riseU: 0, _y0: 0, popT: -1, cool: 0,
        sx: 1, sy: 1, _q: 0, _qv: 0, shakeT: -1, glow: 0, glowT: 0, alpha: 1, strAlpha: 1, pinned: true,
        _bobA: rr.float(cfg.bobAmp[0], cfg.bobAmp[1]), _bobP: rr.float(cfg.bobPeriod[0], cfg.bobPeriod[1]), _bobPh: rr.float(0, TAU),
        _drP: rr.float(cfg.driftPeriod[0], cfg.driftPeriod[1]), _drPh: rr.float(0, TAU), _jx: rr.float(-cfg.riseJitterX, cfg.riseJitterX),
        _swPh: rr.float(0, TAU), string: null, _pstring: null };
    });
    this._pack(this.balloons, cur.seed);
    for (i = 0; i < this.balloons.length; i++) {
      var b = this.balloons[i];
      b.x = b._px = b.hx + b._jx; b.y = b._py = b._y0 = L.groundY + b.size;
      this._resetString(b);
    }
    this.queue = cur.queue ? cur.queue.slice() : [];
    this.target = cur.mode === 'ask' ? this.queue[0] : null;
    this._setState('round');
    this._emit({ type: 'round', round: this.round, topic: this.topic, mode: cur.mode, promptKey: cur.promptKey, params: cur.params,
      sign: { type: this.sign.type, value: this.sign.value, need: this.sign.need } });
    if (cur.mode === 'ask') this._emitAsk(true);
  };

  P._emitAsk = function (first) {
    var b = this.balloonById(this.target);
    if (!b) return;
    this.cur.params = { animal: b.nameValue };
    this.sign.value = b.nameValue;
    if (!first) this.sign._wv += this.cfg.signKickRound;
    this._emit({ type: 'ask', balloonId: b.id, promptKey: this.cur.promptKey, params: { animal: b.nameValue }, first: !!first,
      left: this.queue.length });
  };

  /** The balloon a hint should glow: ask → target; find → the first live right answer; count → the first live balloon. */
  P._hintTarget = function () {
    if (!this.cur) return null;
    if (this.cur.mode === 'ask') { var t = this.balloonById(this.target); return t && this._live(t) ? t : null; }
    for (var i = 0; i < this.balloons.length; i++) {
      var b = this.balloons[i];
      if (this._live(b) && (this.cur.mode === 'count' || b.answer)) return b;
    }
    return null;
  };

  P._endRound = function () {
    if (this._roundEnded) return;
    this._roundEnded = true;
    for (var i = 0; i < this.balloons.length; i++) { var b = this.balloons[i]; if (this._live(b)) this._away(b); }
    var m = this.roundMistakes, st = m === 0 ? 3 : m === 1 ? 2 : 1;
    this.roundStars = st; this.stars += st; this.levelStars += st;
    this.interactive = false;
    this._setState('roundDone');
    this._mood('cheer');
    var ev = { type: 'roundDone', round: this.round, stars: st, mistakes: m };
    if (this.cur.mode === 'count') { ev.count = this.sign.need; ev.need = this.sign.need; }
    this._emit(ev);
  };

  P._startTalk = function () {
    var rr = new KB.RNG((this.rng.next() * 4294967296) >>> 0);
    this.talk = KB.Content.makeTalk(this.topic, { age: this.age, lang: this.lang, rng: rr });
    this.talk.glowAnswer = false;
    this.talkAnswered = null; this._talkAskT = 0; this._talkAsks = 0;
    this.balloons = []; this.friends = []; this.shreds = [];
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

  // ---------------------------------------------------------------- input
  P.pointerDown = function (x, y) {
    this.finger.x = x; this.finger.y = y; this.finger.down = true;
    if (this.state !== 'round' || this.solved || this._roundEnded) return null;
    this._idleT = 0; this._idleGap = this.cfg.idleTime;   // any touch shows the child is here
    var cfg = this.cfg, best = null, bestD = 1e9;
    for (var i = 0; i < this.balloons.length; i++) {
      var b = this.balloons[i];
      if (!this.canTap(b)) continue;
      var r = cfg.touchR * b.size + cfg.touchPad, d = hyp(x - b.x, y - b.y);
      if (d <= r && d < bestD - 1e-9) { best = b; bestD = d; }
    }
    if (!best) return null;
    this._lookId = best.id; this._lookT = this.time;
    if (best.cool > 0) return best.id;                    // still boinging from a wrong tap
    var mode = this.cur.mode;
    var right = mode === 'count' ? true : mode === 'ask' ? best.id === this.target : best.answer;
    if (right) this._correct(best); else this._wrong(best, x, y);
    return best.id;
  };
  P.pointerMove = function (x, y) { this.finger.x = x; this.finger.y = y; };
  P.pointerUp = function (x, y) { if (x !== undefined) { this.finger.x = x; this.finger.y = y; } this.finger.down = false; };

  P._evFields = function (b, ev) {
    ev.id = b.id; ev.x = b.x; ev.y = b.y; ev.color = b.color; ev.shape = b.shape; ev.sprite = b.sprite; ev.text = b.text;
    ev.nameKind = b.nameKind; ev.nameValue = b.nameValue; ev.n = this.pops; ev.need = this.cur.mode === 'count' ? this.sign.need : null;
    return ev;
  };

  P._correct = function (b) {
    var cfg = this.cfg, mode = this.cur.mode;
    b.popT = 0; b.glowT = 0; b.glow = 0;
    this.pops++;
    if (mode === 'count') { this.sign.filled = Math.min(this.sign.need, this.sign.filled + 1); this.sign._wv += cfg.signKick; }
    this._mood('happy');
    this._emit(this._evFields(b, { type: 'correct' }));
    if (mode === 'ask') {
      var qi = this.queue.indexOf(b.id); if (qi >= 0) this.queue.splice(qi, 1);
      this.target = this.queue.length ? this.queue[0] : null;
      if (this.target) this._emitAsk(false);
    }
    var done;
    if (mode === 'count') done = this.pops >= this.sign.need;
    else if (mode === 'ask') done = !this.queue.length;
    else { done = true; for (var i = 0; i < this.balloons.length; i++) { var o = this.balloons[i]; if (o.answer && this._live(o)) { done = false; break; } } }
    if (done) {
      this.solved = true; this._solvedT = this.time; this.interactive = false;
      if (mode === 'count') for (var j = 0; j < this.balloons.length; j++) if (this._live(this.balloons[j])) this._away(this.balloons[j]);
    }
  };

  P._wrong = function (b, fx, fy) {
    var cfg = this.cfg;
    this.roundMistakes++;
    b.cool = cfg.wrongCooldown;
    var dx = b.x - fx, dy = b.y - fy, d = hyp(dx, dy);
    if (d < 1) { dx = b.x >= this.layout.W / 2 ? -1 : 1; dy = -0.3; d = hyp(dx, dy); }
    b.vx += dx / d * cfg.wrongImpulse; b.vy += dy / d * cfg.wrongImpulse;
    b._q = cfg.wobbleAmp; b._qv = 0; b.shakeT = 0; b.sx = 1 + b._q; b.sy = 1 - b._q;
    this._mood('oops');
    var t = this._hintTarget();
    var ev = { type: 'wrong', id: b.id, x: b.x, y: b.y, nameKind: b.nameKind, nameValue: b.nameValue, mistakes: this.roundMistakes,
      target: t ? t.id : null, targetNameKind: null, targetNameValue: null };
    var tk = this._targetName();
    ev.targetNameKind = tk.kind; ev.targetNameValue = tk.value;
    this._emit(ev);
    if (this.roundMistakes >= cfg.hintAfterMisses) this._autoHint();
  };
  /** What the child should find (for "That one is blue. Find the red one!"). */
  P._targetName = function () {
    var c = this.cur, p = c.params;
    switch (c.topic) {
      case 'colors': return { kind: 'color', value: p.color };
      case 'shapes': return { kind: 'shape', value: p.shape };
      case 'size': return { kind: 'size', value: p.size };
      case 'animals': { var t = this.balloonById(this.target); return { kind: 'animal', value: t ? t.nameValue : p.animal }; }
      case 'letters': return { kind: 'letter', value: p.text };
      case 'lower': return { kind: 'letter', value: p.text.toLowerCase() };
      case 'initial': return { kind: 'letter', value: p.text };
      case 'add': return { kind: 'number', value: p.a + p.b };
      case 'sub': return { kind: 'number', value: p.a - p.b };
      case 'oddeven': return { kind: 'parity', value: p.parity };
      case 'count': return { kind: 'number', value: p.n };
    }
    return { kind: null, value: null };
  };

  P._autoHint = function () {
    var t = this._hintTarget();
    if (!t || t.glowT > 0 || this.time - this._lastHintT < this.cfg.hintCooldown) return null;
    return this._glow(t);
  };
  P._glow = function (b) {
    b.glowT = this.cfg.hintTime;
    this._lastHintT = this.time;
    this._lookId = b.id; this._lookT = this.time;
    this._mood('think');
    this._emit({ type: 'hint', id: b.id });
    return b.id;
  };
  /** Manual hint (tap on Miu / bubble): glows the (next) target; no event if it glows already. */
  P.hint = function () {
    if (this.state !== 'round' || this.solved || this._roundEnded) return null;
    var t = this._hintTarget();
    if (!t) return null;
    if (t.glowT > 0) return t.id;
    return this._glow(t);
  };

  P._away = function (b) {
    b.state = 'away'; b.t = 0; b.popT = -1; b.glowT = 0;
    b.vy = Math.min(b.vy, -this.cfg.awayV0);
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
    for (i = 0; i < this.balloons.length; i++) { var o = this.balloons[i]; o._px = o.x; o._py = o.y; o._prot = o.rot; }
    for (i = 0; i < this.friends.length; i++) { var f0 = this.friends[i]; f0._px = f0.x; f0._py = f0.y; f0._prot = f0.rot; }
    this.time += h; this.stateTime += h;

    switch (this.state) {
      case 'intro': if (this.stateTime >= cfg.introTime) this._beginRound(); break;
      case 'round':
        if (this.interactive && !this.solved) {
          this._idleT += h;
          if (this._idleT >= this._idleGap - 1e-9) {
            this._idleT = 0; this._mood('think');
            this._idleGap = Math.min(cfg.idleMax, this._idleGap * cfg.idleBackoff);   // 12 → 18 → 27 → 30 s
            var pr = this.prompt();
            this._emit({ type: 'idle', promptKey: pr.promptKey, params: pr.params });
          }
        }
        if (this.solved && !this._roundEnded) {
          var since = this.time - this._solvedT, popping = false, falling = false;
          for (i = 0; i < this.balloons.length; i++) if (this.balloons[i].popT >= 0) { popping = true; break; }
          for (i = 0; i < this.friends.length; i++) if (this.friends[i].state === 'fall') { falling = true; break; }
          if (since >= cfg.roundEndDelay - 1e-9 && !popping && (!falling || since >= cfg.roundEndFriendWait)) this._endRound();
        }
        break;
      case 'roundDone':
        if (this.stateTime >= cfg.roundDoneTime) {
          this.round++;
          var long = this.round >= cfg.chapterMinRounds && this.time - this.levelStartTime > cfg.chapterTimeLimit;
          if (this.round < this.roundsPerLevel && !long) this._beginRound(); else this._startTalk();
        }
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
          else { this._setState('sessionDone'); this.balloons = []; this.friends = []; this._emit({ type: 'sessionDone', stars: this.stars }); }
        }
        break;
    }

    this._separate(h);
    var allReady = this.balloons.length > 0;
    for (i = 0; i < this.balloons.length; i++) {
      var b = this.balloons[i];
      this._stepBalloon(b, h);
      if (b.state === 'rise' && !this.canTap(b) && b.popT < 0) allReady = false;
    }
    if (this.state === 'round' && !this.interactive && !this.solved && allReady) this.interactive = true;
    for (i = 0; i < this.friends.length; i++) this._stepFriend(this.friends[i], h);
    this._stepShreds(h);
    this._stepSign(h);
    this._stepMiu(h);
  };

  /** Soft separation: pairs of live balloons closer than 1.1 × mean size push apart (never past their homes' spacing). */
  P._separate = function (h) {
    var cfg = this.cfg, B = this.balloons, n = B.length;
    for (var i = 0; i < n; i++) {
      var a = B[i]; if (!this._live(a) || a.t < 0) continue;
      for (var j = i + 1; j < n; j++) {
        var c = B[j]; if (!this._live(c) || c.t < 0) continue;
        var dx = c.x - a.x, dy = c.y - a.y, d = hyp(dx, dy);
        var dmin = Math.min(cfg.sepFactor * (a.size + c.size) / 2, cfg.sepHomeFrac * hyp(c.hx - a.hx, c.hy - a.hy));
        if (d >= dmin) continue;
        if (d < 1e-6) { dx = 1; dy = 0; d = 1; }
        var f = cfg.sepK * (dmin - d) * h, nx = dx / d, ny = dy / d;
        a.vx -= nx * f; a.vy -= ny * f; c.vx += nx * f; c.vy += ny * f;
      }
    }
  };

  P._stepBalloon = function (b, h) {
    var cfg = this.cfg, u;
    b.t += h;
    if (b.cool > 0) b.cool = Math.max(0, b.cool - h);
    if (b.glowT > 0) b.glowT = Math.max(0, b.glowT - h);
    b.glow = b.glowT > 0 ? clamp(Math.min(b.glowT / 0.4, (cfg.hintTime - b.glowT) / 0.2), 0, 1) : 0;
    switch (b.state) {
      case 'rise':
        if (b.t < 0) break;
        if (b.t - h < 0) this._emit({ type: 'appear', id: b.id });
        this._spring(b, h, cfg.riseOmega, cfg.riseZeta);
        b.riseU = Math.max(b.riseU, clamp((b._y0 - b.y) / Math.max(1, b._y0 - b.hy), 0, 2));
        if (b.t >= cfg.riseSettle || (b.t > 0.6 && Math.abs(b.y - b.hy) < 3 && Math.abs(b.vy) < 20)) b.state = 'float';
        break;
      case 'float':
        this._spring(b, h, cfg.floatOmega, cfg.floatZeta);
        break;
      case 'pop':
        b.strAlpha = clamp(1 - b.t / cfg.stringFade, 0, 1);
        if (b.t >= cfg.stringFade) { b.state = 'gone'; b.t = 0; }
        break;
      case 'away': {
        b.vy -= cfg.awayAccel * h;
        b.vx += (Math.sin(b._swPh + 2.4 * b.t) * cfg.awaySway * 2.4 + this.wind * 0.6 - b.vx) * Math.min(1, 2 * h);
        b.x += b.vx * h; b.y += b.vy * h;
        this._tilt(b, h);
        u = clamp((b.t - cfg.awayFadeAt) / cfg.awayFade, 0, 1);
        b.alpha = 1 - u;
        var len = this._seg(b) * (cfg.stringPts - 1);
        if (u >= 1 || b.y + this._knotY(b) + len < -10) { b.state = 'gone'; b.t = 0; b.alpha = 0; }
        break;
      }
    }
    // popping stretch (inside rise / float): hold still, swell to 1.18×, then burst
    if (b.popT >= 0) {
      b.popT += h;
      u = smooth(b.popT / cfg.popStretchTime);
      b.sx = b.sy = 1 + (cfg.popStretch - 1) * u;
      if (b.popT >= cfg.popStretchTime - 1e-9) this._burst(b);
    } else if (b.state !== 'gone') {
      var w = cfg.wobbleOmega, z = cfg.wobbleZeta;
      b._qv += (-w * w * b._q - 2 * z * w * b._qv) * h;
      b._q += b._qv * h;
      b.sx = 1 + b._q; b.sy = 1 - b._q;
    }
    if (cfg.strings && b.string && b.state !== 'gone') this._stepString(b, h);
  };

  /** Spring toward home + bob + drift + wind; then the tilt spring. Semi-implicit Euler. */
  P._spring = function (b, h, w, z) {
    var cfg = this.cfg, T = this.time;
    if (b.popT >= 0) { b.vx *= Math.pow(0.02, h); b.vy *= Math.pow(0.02, h); b.x += b.vx * h; b.y += b.vy * h; return; }
    var bob = b._bobA * (1 + cfg.hintBob * b.glow) * Math.sin(b._bobPh + TAU * T / b._bobP);
    var tx = b.hx + cfg.driftAmp * Math.sin(b._drPh + TAU * T / b._drP) + this.wind * cfg.windGain;
    var ty = b.hy + bob;
    b.vx += (w * w * (tx - b.x) - 2 * z * w * b.vx) * h;
    b.vy += (w * w * (ty - b.y) - 2 * z * w * b.vy) * h;
    b.x += b.vx * h; b.y += b.vy * h;
    this._tilt(b, h);
  };
  P._tilt = function (b, h) {
    var cfg = this.cfg;
    var tr = clamp(-b.vx * cfg.tiltK + this.wind * cfg.windTilt, -cfg.tiltMax, cfg.tiltMax), wr = cfg.tiltOmega;
    if (b._rs === undefined) b._rs = 0;
    b.vr += (wr * wr * (tr - b._rs) - 2 * cfg.tiltZeta * wr * b.vr) * h;
    b._rs += b.vr * h;
    var sh = 0;
    if (b.shakeT >= 0) {
      b.shakeT += h;
      var u = b.shakeT / cfg.shakeTime;
      if (u >= 1) b.shakeT = -1;
      else sh = cfg.shakeAmp * Math.sin(TAU * cfg.shakeHz * b.shakeT) * (1 - u) * (1 - u);
    }
    b.rot = b._rs + sh;
  };

  /** 7-point verlet rope; point 0 pinned to the knot (until the pop). */
  P._stepString = function (b, h) {
    var cfg = this.cfg, S = b.string, PS = b._pstring, n = S.length, seg = this._seg(b);
    var ax = this.wind * cfg.stringWind, ay = cfg.stringGravity, d2 = h * h, damp = cfg.stringDamp, i;
    for (i = 0; i < n; i++) {
      var p = S[i], q = PS[i], vx = (p.x - q.x) * damp, vy = (p.y - q.y) * damp;
      q.x = p.x; q.y = p.y;
      if (i === 0 && b.pinned) continue;
      p.x += vx + ax * d2; p.y += vy + ay * d2;
    }
    if (b.pinned) { var K = this._knot(b); S[0].x = K.x; S[0].y = K.y; }
    for (var it = 0; it < cfg.stringIters; it++) {
      for (i = 0; i < n - 1; i++) {
        var A = S[i], B2 = S[i + 1], dx = B2.x - A.x, dy = B2.y - A.y, L = hyp(dx, dy) || 1e-6, diff = (L - seg) / L;
        if (i === 0 && b.pinned) { B2.x -= dx * diff; B2.y -= dy * diff; }
        else { A.x += dx * diff * 0.5; A.y += dy * diff * 0.5; B2.x -= dx * diff * 0.5; B2.y -= dy * diff * 0.5; }
      }
    }
  };

  P._burst = function (b) {
    var cfg = this.cfg, r = this.rng, i;
    b.popT = -1; b.state = 'pop'; b.t = 0; b.pinned = false; b.sx = b.sy = 1; b.alpha = 0;
    this._emit(this._evFields(b, { type: 'pop' }));
    for (i = 0; i < cfg.shredN && this.shreds.length < cfg.shredCap; i++) {
      var a = TAU * (i + r.float(0.1, 0.9)) / cfg.shredN, sp = r.float(cfg.shredSpeed[0], cfg.shredSpeed[1]), life = r.float(cfg.shredLife[0], cfg.shredLife[1]);
      this.shreds.push({ x: b.x + Math.cos(a) * b.size * 0.3, y: b.y + Math.sin(a) * b.size * 0.3, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80,
        rot: r.float(0, TAU), vr: r.float(-12, 12), color: b.color, life: life, life0: life });
    }
    if (b.sprite) {
      var k = this._friendN++, s = this._yardSlot(k), y0 = b.y + cfg.friendSize / 2;
      this.friends.push({ id: 'f' + k, balloonId: b.id, sprite: b.sprite, nameValue: b.nameValue, slot: k,
        x: b.x, y: y0, _px: b.x, _py: y0, rot: 0, _prot: 0, vy: cfg.friendPopVy, state: 'fall', t: 0, bounces: 0,
        x0: b.x, y0: y0, tx: s.x, ty: Math.max(s.y, y0 + 1), sx: 1, sy: 1, _q: 0, _qv: 0, size: cfg.friendSize, alpha: 1, _ph: r.float(0, TAU) });
    }
  };

  P._stepFriend = function (f, h) {
    var cfg = this.cfg, g, u;
    f.t += h;
    if (f.state === 'fall') {
      g = cfg.friendGravity;
      f.vy += (g - (g / cfg.friendTerminal) * f.vy) * h;
      f.y += f.vy * h;
      u = clamp((f.y - f.y0) / Math.max(1, f.ty - f.y0), 0, 1);
      var ph = f._ph + TAU * cfg.friendSwayHz * f.t;
      f.x = f.x0 + (f.tx - f.x0) * smooth(u) + cfg.friendSwayAmp * Math.sin(ph) * Math.sin(Math.PI * u);
      f.rot = cfg.friendSwayRad * Math.cos(ph) * (1 - u);
      if (f.y >= f.ty) {
        f.y = f.ty; f.x = f.tx; f.rot = 0; f.state = 'land'; f.bounces = 0;
        f._q = cfg.friendSquash * clamp(f.vy / cfg.friendTerminal, 0.5, 1.2); f._qv = 0;
        f.vy = -Math.max(cfg.friendBounce0, cfg.friendRestitution * f.vy);
        this._emit({ type: 'land', id: f.id, x: f.x, y: f.y, sprite: f.sprite, nameValue: f.nameValue });
      }
    } else if (f.state === 'land') {
      f.vy += cfg.friendBounceG * h; f.y += f.vy * h;
      if (f.y >= f.ty) {
        f.y = f.ty; f.bounces++;
        f._q = cfg.friendSquash * clamp(f.vy / cfg.friendTerminal, 0, 1) * 0.8; f._qv = 0;
        if (f.bounces >= cfg.friendBounces) { f.state = 'rest'; f.vy = 0; f.t = 0; }
        else f.vy = -cfg.friendRestitution * f.vy;
      }
    } else if (f.state === 'rest') {
      f.y = f.ty; f.x = f.tx;
    }
    var w = cfg.squashOmega, z = cfg.squashZeta;
    f._qv += (-w * w * f._q - 2 * z * w * f._qv) * h; f._q += f._qv * h;
    f.sx = 1 + f._q; f.sy = 1 - f._q + (f.state === 'rest' ? cfg.friendBreath * Math.sin(f._ph + TAU * 0.5 * this.time) : 0);
    if (this.state === 'roundDone') f.alpha = 1 - clamp((this.stateTime - cfg.leaveDelay) / cfg.leaveTime, 0, 1);
  };

  P._stepShreds = function (h) {
    var cfg = this.cfg, S = this.shreds, k = cfg.shredDrag;
    for (var i = S.length - 1; i >= 0; i--) {
      var s = S[i];
      s.life -= h;
      if (s.life <= 0) { S.splice(i, 1); continue; }
      s.vx -= s.vx * k * h; s.vy += (cfg.shredGravity - s.vy * k) * h;
      s.x += s.vx * h; s.y += s.vy * h; s.rot += s.vr * h;
    }
  };

  P._stepSign = function (h) {
    var s = this.sign, w = this.cfg.signOmega, z = this.cfg.signZeta;
    s._wv += (-w * w * s.wob - 2 * z * w * s._wv) * h; s.wob += s._wv * h;
  };

  P._stepMiu = function (h) {
    var m = this.miu, cfg = this.cfg, L = this.layout;
    if (m.moodT > 0) { m.moodT -= h; if (m.moodT <= 0) { m.moodT = 0; m.mood = 'idle'; } }
    var lx = L.play.x + L.play.w / 2, ly = L.play.y + L.play.h / 2;
    if (this._lookId && this.time - this._lookT < cfg.lookHold) {
      var b = this.balloonById(this._lookId);
      if (b && b.state !== 'gone') { lx = b.x; ly = b.y; this._lookX = b.x; this._lookY = b.y; }
      else if (this._lookX !== undefined) { lx = this._lookX; ly = this._lookY; }
    }
    var k = Math.min(1, h * cfg.lookRate);
    m.lookX += (lx - m.lookX) * k; m.lookY += (ly - m.lookY) * k;
    if (m._hopT >= 0) {
      m._hopT += h;
      var n = m._hopT / cfg.cheerHopTime;
      if (n >= 3) { m._hopT = -1; m.hop = 0; }
      else { var ph = n - Math.floor(n); m.hop = cfg.cheerHopPx * Math.pow(0.7, Math.floor(n)) * 4 * ph * (1 - ph); }   // 3 hops, each 70 % of the last
    }
  };

  KB.World = World;
})(window.KB = window.KB || {});
