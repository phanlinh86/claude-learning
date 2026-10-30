/* Dino Nest Sort — DN.CONFIG + DN.World (headless, deterministic simulation; DESIGN §2, §5.2)
 *
 * ============================== CONVENTIONS ==============================
 *  Units: logical px (short side = 720), seconds, radians, y DOWN.
 *  update(dt) runs fixed sub-steps of cfg.step (1/120 s) with an accumulator.
 *  At the START of every sub-step each item stores _px,_py,_prot; the renderer
 *  draws  p = _p + (p − _p) · w.alpha   (w.alpha = leftover / step, 0..1).
 *  Result depends only on seed + the sub-step index at which inputs arrive.
 *
 *  Drawing an item (renderer contract):
 *    centre (x, y), rotation rot, drawn width = size
 *    scale  = appear(0..1, back-overshoot) · (1 + (cfg.liftScale−1)·lift) · (sx, sy)
 *    alpha  = item.alpha (fades on 'leave')
 *    shadow grows/offsets with lift.  Items in state 'in' (and 'fly' once
 *    item.overNest) go between nest_back and nest_front.
 *    The held item is always the LAST element of w.items (grab moves it there).
 *  Drawing a nest: basket.x = centre x, basket.y = opening centre y, w × h;
 *    nest sprite rect = [x−w/2, y−0.39h, w, h·(160/256)/0.62] (≈ h).
 *    squash: scaleX 1+squash, scaleY 1−squash around the bottom; shake ∈ [−1,1]
 *    → suggested x offset shake·cfg.shakePx and rotation shake·0.05 rad;
 *    glow 0..1 → soft halo; appear 0..1 → pop-in scale.
 *  Bo: bo.hop = px ABOVE the feet anchor (≥ 0).
 * ========================================================================
 */
(function (DN) {
  'use strict';

  var CONFIG = {
    // ---- timing / state machine (s)
    step: 1 / 120,             // fixed simulation sub-step (≤ 1/120 per DESIGN)
    maxFrame: 1.0,             // s, largest dt accepted per update() (speed mode passes big dt)
    roundsPerLevel: 4,         // playtest: 5 → 4 (warm-up + 3 real rounds) — chapters were too long at ages 3–4
    chapterTimeLimit: 75,      // s since the chapter began: after ≥ chapterMinRounds rounds, go to Talk time once exceeded
    chapterMinRounds: 3,
    introTime: 1.8,            // chapter banner
    appearTime: 0.45,          // item pop-in (back-overshoot)
    appearStagger: 0.07,       // s between consecutive items popping in (~0.6 s for 8 items)
    nestAppearTime: 0.35,      // new nests pop in
    roundDoneTime: 1.7,        // stars on screen (playtest 2.0 → 1.7)
    leaveDelay: 1.0,           // s into roundDone when items hop out of the nests (< roundDoneTime − leaveTime)
    leaveTime: 0.4,            // hop-out + fade
    talkAfterAnswer: 1.6,      // talk panel stays after an answer
    levelDoneTime: 2.0,        // playtest 2.4 → 2.0
    talkAskTime: 12,           // s without an answer → talkAsk (re-ask), repeating
    talkGlowAfterAsks: 2,      // from this re-ask on, talk.glowAnswer = true (UI glows the right choice)

    // ---- layout (DESIGN §2; px)
    shortSide: 720, minLong: 960, maxLong: 1600,
    groundOffset: 70,          // groundY = H − ins.bottom − 70
    nestMaxW: 240, nestGap: 24, nestSideMargin: 20, nestAspect: 0.62,
    nestOpening: 0.45,         // opening centre y = groundY − 0.45 h
    nestTopFrac: 0.39,         // sprite top = opening y − 0.39 h (opening at 62/160 of nest_back.svg)
    signScale: 0.55,           // sign width = 0.55 × nest w (sign.svg 128×112)
    boX: 105, boYLand: 225, boYPort: 245, boHLand: 175, boHPort: 190,
    bubbleDx: 85, bubbleY: 24, bubbleMaxW: 620, bubbleRightGap: 150, bubbleH: 104,
    playMargin: 40, playTopGap: 10,
    playNestGap: 44,           // px between play band and nest top (playtest 24 → 44): resting items stay OUT of the 90 px drop zone
    hudW: 140, hudH: 90,       // DOM buttons top-right: x > W−ins.right−140, y < ins.top+90
    minSpacing: 1.1,           // min centre distance = 1.1 × size
    minShrink: 0.75,           // generator shrinks items to ≥ 0.75× before giving up
    shrinkStep: 0.05,
    packJitter: 4,             // px random offset per resting item (spacing includes 2√2·jitter)
    maxRowStretch: 1.7,        // rows spread vertically at most 1.7 × spacing

    // ---- touch (px)
    touchR: 0.6, touchPad: 14, // item radius = 0.6 × size + 14
    nestPadSide: 45,           // drop zone grows 45 px left/right/down (playtest 30 → 45: catches 'just beside' drops)
    nestPadUp: 90,
    tapMovePx: 24, tapTime: 0.35,   // finger moved < 24 px and released < 0.35 s after down → a TAP, not a drop
    tapReturnTime: 0.25, tapApex: 6,

    // ---- drag: critically damped spring + pendulum tilt
    dragOmega: 28,             // rad/s; ζ = 1 → 95 % settle in ≈ 4.7/ω = 0.17 s
    grabKeep: 0.5,             // fraction of the grab offset kept (item slides half-way under the finger)
    liftPx: 10,                // item rides 10 px above the finger target
    liftRate: 12,              // 1/s, lift easing 0 → 1
    liftScale: 1.12,
    tiltK: 0.0016,             // rad per px/s: target tilt = clamp(−vx·k, ±tiltMax)
    tiltMax: 0.45,             // rad
    tiltOmega: 9, tiltZeta: 0.35,   // rotational spring (under-damped: swings ~2 times, settles in ~1.5 s)

    // ---- correct drop: ballistic flight
    flyBase: 0.3, flyPerPx: 1 / 2000, flyMin: 0.32, flyMax: 0.5,   // T = clamp(0.3 + d/2000, .32, .5) s
    flyApex: 60,               // px above the higher end (minimum)
    flyApexFromVy: 0.06,       // + px per px/s of upward release speed
    flyApexMax: 140,
    flyInherit: 0.25,          // fraction of release vx kept as initial flight vx
    slotScale: 0.82,           // item size in a nest = 0.82 × its base size (count mode: limited by slot spacing)
    landSquash: 0.15,          // q on landing: sx = 1+q = 1.15, sy = 1−1.2q = 0.82
    squashOmega: 22, squashZeta: 0.3,
    nestSquash: 0.12, nestOmega: 18, nestZeta: 0.25,

    // ---- wrong / miss
    shakeTime: 0.5, shakeWiggles: 3, shakePx: 10,
    wrongReturnTime: 0.55, wrongApex: 45, wobbleAmp: 0.28, wobbleHz: 2.5,
    missReturnTime: 0.5, missApex: 22,
    homeSquash: 0.07,

    // ---- idle life
    bobAmp: 3, bobPeriodMin: 2, bobPeriodMax: 3, bobFadeIn: 0.5,
    wiggleAmp: 0.12, wiggleTime: 0.4, wiggleMin: 4, wiggleMax: 8,

    // ---- leave (round end)
    leaveVy: -420, leaveVx: 90, leaveG: 1600,

    // ---- help
    hintAfterMisses: 2, hintTime: 3,
    hintCooldown: 6,           // s: no auto-hint within 6 s of the last one, nor while the nest still glows
    idleTime: 12,              // s without a grab → idle nudge; the gap then grows ×1.5 per nudge up to idleMax
    idleBackoff: 1.5, idleMax: 30,

    // ---- Bo
    moodTime: { happy: 0.9, cheer: 1.6, oops: 0.8, think: 1.4 },
    cheerHopPx: 26, cheerHopTime: 0.4, lookRate: 6,
    // ---- tall portrait phones (visual QA): item band height ≤ 0.85·W above the nests, items ×1.2
    portraitPlayMaxFrac: 0.85, portraitItemScale: 1.2
  };
  DN.CONFIG = CONFIG;

  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hyp(x, y) { return Math.sqrt(x * x + y * y); }
  function easeOutBack(u) { var c1 = 1.70158, c3 = c1 + 1, v = u - 1; return 1 + c3 * v * v * v + c1 * v * v; }
  function merge(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; if (b) for (k in b) o[k] = b[k]; return o; }

  /** DESIGN §2 short-side rule: CSS viewport → logical W×H. */
  function logicalSize(cssW, cssH, cfg) {
    cfg = cfg || CONFIG;
    var S = cfg.shortSide, aspect = cssW / Math.max(1, cssH);
    if (cssW >= cssH) return { W: clamp(Math.round(S * aspect), cfg.minLong, cfg.maxLong), H: S };
    return { W: S, H: clamp(Math.round(S / aspect), cfg.minLong, cfg.maxLong) };
  }

  function computeLayout(W, H, ins, n, cfg) {
    ins = { top: +(ins && ins.top) || 0, right: +(ins && ins.right) || 0, bottom: +(ins && ins.bottom) || 0, left: +(ins && ins.left) || 0 };
    n = n || 3;
    var portrait = H > W;
    var groundY = H - ins.bottom - cfg.groundOffset;
    var aw = W - ins.left - ins.right - 2 * cfg.nestSideMargin;
    var nw = Math.min(cfg.nestMaxW, aw / n - cfg.nestGap), nh = cfg.nestAspect * nw;
    var ny = groundY - cfg.nestOpening * nh, xs = [];
    for (var i = 0; i < n; i++) xs.push(ins.left + cfg.nestSideMargin + (aw / n) * (i + 0.5));
    var bo = { x: ins.left + cfg.boX, y: ins.top + (portrait ? cfg.boYPort : cfg.boYLand), h: portrait ? cfg.boHPort : cfg.boHLand };
    var bx = bo.x + cfg.bubbleDx;
    var bubble = { x: bx, y: ins.top + cfg.bubbleY, w: Math.min(cfg.bubbleMaxW, W - bx - ins.right - cfg.bubbleRightGap), h: cfg.bubbleH };
    var nestTop = ny - cfg.nestTopFrac * nh;
    var px = ins.left + cfg.playMargin, py = bo.y + cfg.playTopGap;
    var play = { x: px, y: py, w: W - ins.right - cfg.playMargin - px, h: nestTop - cfg.playNestGap - py };
    // tall portrait phones: keep items in a band just above the nests (short drags) and make them bigger
    var itemScale = 1;
    if (portrait && play.h > cfg.portraitPlayMaxFrac * W) {
      var ph = cfg.portraitPlayMaxFrac * W;
      play.y = nestTop - cfg.playNestGap - ph; play.h = ph;
      if (H / W > 1.6) itemScale = cfg.portraitItemScale;
    }
    play.itemScale = itemScale;
    var sw = cfg.signScale * nw;
    return {
      W: W, H: H, ins: ins, portrait: portrait, groundY: groundY,
      nest: { y: ny, w: nw, h: nh, xs: xs, n: n, top: nestTop,
        sign: { w: sw, h: sw * 112 / 128, bottomY: groundY + 0.5 * (H - groundY) } },   // suggested sign placement (stake bottom)
      bo: bo, bubble: bubble, play: play, itemScale: itemScale,
      hud: { x: W - ins.right - cfg.hudW, y: 0, w: cfg.hudW + ins.right, h: ins.top + cfg.hudH }
    };
  }

  // ------------------------------------------------------------------ packing
  /** Grid of candidate centres for items of `size` with centre spacing ≥ d, inside play. */
  function gridPoints(play, size, d, cfg, n) {
    var iw = play.w - size, ih = play.h - size;
    if (iw < -1e-6 || ih < -1e-6) return [];
    iw = Math.max(0, iw); ih = Math.max(0, ih);
    var cols = Math.floor(iw / d + 1e-9) + 1;
    var dx = cols > 1 ? iw / (cols - 1) : 0, x0 = play.x + size / 2 + (cols > 1 ? 0 : iw / 2);
    function build(rows, dyMin, hex) {
      var dy = rows > 1 ? Math.min(ih / (rows - 1), d * cfg.maxRowStretch) : 0;
      if (rows > 1 && dy < dyMin - 1e-9) return [];
      var hgt = dy * (rows - 1), y0 = play.y + size / 2 + (ih - hgt) / 2, pts = [];
      for (var r = 0; r < rows; r++) {
        var off = hex && (r % 2) ? dx / 2 : 0, c = hex && (r % 2) ? cols - 1 : cols;
        for (var k = 0; k < c; k++) pts.push({ x: x0 + off + k * dx, y: y0 + r * dy });
      }
      return pts;
    }
    var rectRows = Math.floor(ih / d + 1e-9) + 1, rect = build(rectRows, d, false);
    if (rect.length >= n || cols < 2) return rect;
    var hexRows = Math.floor(ih / (d * 0.8660254) + 1e-9) + 1, hex = build(hexRows, d * 0.8660254, true);
    return hex.length > rect.length ? hex : rect;
  }

  /** Farthest-point sampling: spreads the chosen grid points over the play area (no 3 sums in one column). */
  function spreadPick(pts, n) {
    if (pts.length <= n) return pts.slice(0, n);
    var out = [pts[0]], used = [true], dmin = [], i, j;
    for (i = 0; i < pts.length; i++) { used[i] = i === 0; dmin[i] = hyp(pts[i].x - pts[0].x, pts[i].y - pts[0].y); }
    while (out.length < n) {
      var best = -1, bd = -1;
      for (i = 0; i < pts.length; i++) if (!used[i] && dmin[i] > bd) { bd = dmin[i]; best = i; }
      used[best] = true; out.push(pts[best]);
      for (j = 0; j < pts.length; j++) dmin[j] = Math.min(dmin[j], hyp(pts[j].x - pts[best].x, pts[j].y - pts[best].y));
    }
    return out;
  }

  /** Sets homeX/homeY/size of `items` (each has baseSize) inside play. Returns { shrink, ok }. */
  function packItems(items, play, rng, cfg) {
    if (!items.length) return { shrink: 1, ok: true };
    var maxBase = 0, i, k0 = play.itemScale || 1;
    for (i = 0; i < items.length; i++) maxBase = Math.max(maxBase, items[i].baseSize * k0);
    var jit = cfg.packJitter, s = 1, pts = null, ok = true;
    for (s = 1; s > 0.2; s = Math.round((s - cfg.shrinkStep) * 1000) / 1000) {
      var size = maxBase * s, d = cfg.minSpacing * size + 2 * Math.SQRT2 * jit;
      pts = gridPoints(play, size + 2 * jit, d, cfg, items.length);
      if (pts.length >= items.length) break;
      if (s - cfg.shrinkStep < cfg.minShrink - 1e-9) ok = false;   // giving up the 0.75 floor: keep shrinking (never overlap)
    }
    var pick = spreadPick(rng.shuffle(pts), items.length);
    for (i = 0; i < items.length; i++) {
      var it = items[i];
      it.size = it.baseSize * k0 * s;
      it.homeX = pick[i].x + rng.float(-jit, jit);
      it.homeY = pick[i].y + rng.float(-jit, jit);
    }
    return { shrink: s, ok: ok };
  }

  // ------------------------------------------------------------------ nest slots
  function computeSlots(b, cap, baseSize, isCount, cfg) {
    var r0 = isCount ? (cap <= 3 ? cap : cap <= 5 ? 3 : cap <= 9 ? 4 : 5) : Math.min(cap, 3);
    r0 = Math.max(1, r0);
    var sxp = b.w * 0.74 / r0;
    var s = Math.min(baseSize * cfg.slotScale, sxp * 1.3, b.w * 0.5);
    var rows = [], left = cap, len = r0;
    while (left > 0) { var m = Math.min(len, left); rows.push(m); left -= m; len = Math.max(1, len - 1); }
    var slots = [];
    for (var r = 0; r < rows.length; r++) {
      var cnt = rows[r], y = b.y - 0.05 * s - r * s * 0.62, idx = [];
      for (var k = 0; k < cnt; k++) idx.push(k);
      var mid = (cnt - 1) / 2;
      idx.sort(function (a, c) { return Math.abs(a - mid) - Math.abs(c - mid) || a - c; });   // centre-out
      for (var j = 0; j < idx.length; j++) slots.push({ x: b.x + (idx[j] - mid) * sxp, y: y });
    }
    b.slots = slots; b.slotSize = s;
  }

  // ------------------------------------------------------------------ World
  function World(opts) {
    opts = opts || {};
    this.cfg = merge(CONFIG, opts.config);
    this.seed = opts.seed !== undefined ? opts.seed : 1;
    this.rng = new DN.RNG(this.seed);
    this.age = DN.Content.ageOf(opts.age !== undefined ? opts.age : 4);
    this.lang = opts.lang === 'vi' ? 'vi' : 'en';
    this._pendingAge = this.age; this._pendingLang = this.lang;
    this.state = 'menu';
    this.level = 0; this.levels = []; this.topic = null; this.weather = 0;
    this.round = 0; this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.stars = 0; this.levelStars = 0; this.roundMistakes = 0; this.roundStars = 0;
    this.time = 0; this.stateTime = 0; this.alpha = 0; this._acc = 0;
    this.cur = null; this.baskets = []; this.items = []; this.held = null; this.talk = null; this.talkAnswered = null;
    this.finger = { x: 0, y: 0, down: false };
    this.bo = { mood: 'idle', moodT: 0, lookX: 0, lookY: 0, hop: 0, _hopT: -1 };
    this.events = [];
    this.sessions = 0;
    this.interactive = false;
    this._idleT = 0; this._idleGap = this.cfg.idleTime; this._roundEnded = false; this._vpCount = 0;
    this._lastHintT = -1e9; this.levelStartTime = 0; this._talkAskT = 0; this._talkAsks = 0;
    this._down = { x: 0, y: 0, t: 0, maxD: 0 };
    this.setViewport(opts.width || 1280, opts.height || 720, opts.ins || null);
    this.bo.lookX = this.layout.play.x + this.layout.play.w / 2; this.bo.lookY = this.layout.play.y + this.layout.play.h / 2;
  }
  World.logicalSize = logicalSize;
  World.computeLayout = function (W, H, ins, n, cfg) { return computeLayout(W, H, ins, n, merge(CONFIG, cfg)); };
  World.packItems = packItems;
  World.gridPoints = gridPoints;

  var P = World.prototype;
  P._emit = function (e) { this.events.push(e); };
  P.drainEvents = function () { var e = this.events; this.events = []; return e; };
  P.setAge = function (a) { this._pendingAge = DN.Content.ageOf(a); };
  P.setLang = function (l) { this._pendingLang = l === 'vi' ? 'vi' : 'en'; };
  P.itemById = function (id) { for (var i = 0; i < this.items.length; i++) if (this.items[i].id === id) return this.items[i]; return null; };
  P.basketById = function (id) { for (var i = 0; i < this.baskets.length; i++) if (this.baskets[i].id === id) return this.baskets[i]; return null; };
  P._setState = function (s) { this.state = s; this.stateTime = 0; };
  P._mood = function (m) { this.bo.mood = m; this.bo.moodT = this.cfg.moodTime[m] || 1; if (m === 'cheer') this.bo._hopT = 0; };

  // ---------------------------------------------------------------- viewport
  P.setViewport = function (W, H, ins) {
    var n = this.baskets.length || 3;
    this.layout = computeLayout(W, H, ins, n, this.cfg);
    this._vpCount++;
    if (this.cur && this.baskets.length) this._relayoutRound();
  };

  P._relayoutRound = function () {
    var cfg = this.cfg, i, it;
    DN.Content.placeBaskets(this.baskets, this.layout);
    for (i = 0; i < this.baskets.length; i++) this._slotsFor(this.baskets[i]);
    var resting = [];
    for (i = 0; i < this.items.length; i++) {
      it = this.items[i];
      if (it.state === 'in' || it.state === 'fly' || it.state === 'leave') continue;
      resting.push(it);
    }
    var pr = packItems(resting, this.layout.play, new DN.RNG((this.cur.seed ^ Math.imul(this.layout.W, 7919) ^ Math.imul(this.layout.H, 104729)) >>> 0), cfg);
    this.packShrink = pr.shrink; this.packOk = pr.ok;
    for (i = 0; i < this.items.length; i++) {
      it = this.items[i];
      var b = it.basketId ? this.basketById(it.basketId) : null;
      if (it.state === 'in' || it.state === 'leave') {
        if (b && it.slot >= 0 && it.state === 'in') { var sl = b.slots[it.slot]; it.x = it._px = sl.x; it.y = it._py = sl.y; it.size = b.slotSize; }
      } else if (it.state === 'fly') {
        this._planFly(it, b, it.vx, it.vy, true);
      } else if (it.state === 'idle' || it.state === 'appear') {
        it.x = it._px = it.homeX; it.y = it._py = it.homeY;
      } else if (it.state === 'return') {
        this._planReturn(it, it._retKind);
      }
    }
  };

  P._slotsFor = function (b) {
    var cap = 0, base = 0, isCount = this.cur.mode === 'count';
    for (var i = 0; i < this.items.length; i++) {
      var it = this.items[i];
      if (it.answer === b.id) { cap++; base = Math.max(base, it.baseSize); }
    }
    if (isCount) cap = b.need;
    computeSlots(b, Math.max(1, cap), base || 110, isCount, this.cfg);
  };

  // ---------------------------------------------------------------- session flow
  P.newSession = function () {
    this.age = this._pendingAge; this.lang = this._pendingLang;
    this.sessions++;
    this.levels = DN.Content.topicsFor(this.age);
    this.stars = 0;
    this._emit({ type: 'session', levels: this.levels.slice() });
    this.startLevel(0);
  };

  P.startLevel = function (i) {
    if (!this.levels.length) this.levels = DN.Content.topicsFor(this.age);
    this.level = clamp(i | 0, 0, this.levels.length - 1);
    this.topic = this.levels[this.level];
    this.weather = this.level;
    this.round = 0; this.levelStars = 0; this.levelStartTime = this.time;
    this.items = []; this.baskets = []; this.cur = null; this.held = null; this.talk = null; this.talkAnswered = null;
    this.interactive = false;
    this._setState('intro');
    this._emit({ type: 'level', level: this.level, topic: this.topic });
  };

  P._beginRound = function () {
    var cfg = this.cfg, i;
    var n = DN.Content.nestsFor(this.topic, this.age);
    var prevN = this.baskets.length;
    this.layout = computeLayout(this.layout.W, this.layout.H, this.layout.ins, n, cfg);
    var rseed = (this.rng.next() * 4294967296) >>> 0;
    var rr = new DN.RNG(rseed);
    var cur = DN.Content.makeRound(this.topic, { age: this.age, lang: this.lang, rng: rr, roundIndex: this.round, layout: this.layout });
    this.cur = cur;
    this.roundMistakes = 0; this.held = null; this._idleT = 0; this._idleGap = cfg.idleTime; this._roundEnded = false; this.interactive = false;
    this.baskets = cur.baskets.map(function (b) {
      return { id: b.id, label: b.label, need: b.need !== undefined ? b.need : null, count: 0, reserved: 0,
        x: b.x, y: b.y, w: b.w, h: b.h, squash: 0, _sqv: 0, shake: 0, _shakeT: -1, glow: 0, _glowT: 0,
        appear: prevN === cur.baskets.length ? 1 : 0, slots: [], slotSize: 0 };
    });
    this.items = cur.items.map(function (s, k) {
      return { id: s.id, sprite: s.sprite, shape: s.shape, color: s.color, text: s.text, scale: s.scale,
        baseSize: s.size, size: s.size, nameKind: s.nameKind, nameValue: s.nameValue, answer: s.answer,
        x: 0, y: 0, rot: 0, vx: 0, vy: 0, vr: 0, sx: 1, sy: 1, _q: 0, _qv: 0, lift: 0, alpha: 1,
        state: 'appear', t: -k * cfg.appearStagger, appear: 0, homeX: 0, homeY: 0, basketId: null, slot: -1, misses: 0,
        overNest: false, _appeared: false, _px: 0, _py: 0, _prot: 0,
        _bobPh: rr.float(0, TAU), _bobP: rr.float(cfg.bobPeriodMin, cfg.bobPeriodMax), _bobW: 1,
        _wigT: rr.float(cfg.wiggleMin, cfg.wiggleMax), _wigU: -1, _egg: !!(s.sprite && s.sprite.indexOf('egg') === 0),
        _f: null, _offX: 0, _offY: 0, _retKind: null };
    });
    for (i = 0; i < this.baskets.length; i++) this._slotsFor(this.baskets[i]);
    var pr = packItems(this.items, this.layout.play, new DN.RNG(cur.seed), cfg);
    this.packShrink = pr.shrink; this.packOk = pr.ok;
    for (i = 0; i < this.items.length; i++) {
      var it = this.items[i];
      it.x = it._px = it.homeX; it.y = it._py = it.homeY;
    }
    this._setState('round');
    this._emit({ type: 'round', round: this.round, topic: this.topic, mode: cur.mode, promptKey: cur.promptKey, params: cur.params });
  };

  P._endRound = function () {
    if (this._roundEnded) return;
    this._roundEnded = true;
    this.cancelDrag();
    var m = this.roundMistakes, st = m === 0 ? 3 : m === 1 ? 2 : 1;
    this.roundStars = st; this.stars += st; this.levelStars += st;
    this.interactive = false;
    this._setState('roundDone');
    this._mood('cheer');
    var ev = { type: 'roundDone', stars: st, mistakes: m };
    if (this.cur.mode === 'count') { ev.count = this.baskets[0].need; ev.need = this.baskets[0].need; }   // Bo says "N! Great!"
    this._emit(ev);
  };

  P._leaveAll = function () {
    var cfg = this.cfg;
    for (var i = 0; i < this.items.length; i++) {
      var it = this.items[i];
      if (it.state === 'leave') continue;
      it._wasIn = it.state === 'in';
      it.state = 'leave'; it.t = 0;
      if (it._wasIn) { it.vy = cfg.leaveVy * this.rng.float(0.85, 1.15); it.vx = this.rng.float(-1, 1) * cfg.leaveVx; it.vr = this.rng.float(-4, 4); }
      else { it.vx = 0; it.vy = 0; it.vr = 0; }
    }
  };

  P._startTalk = function () {
    var rr = new DN.RNG((this.rng.next() * 4294967296) >>> 0);
    this.talk = DN.Content.makeTalk(this.topic, { age: this.age, lang: this.lang, rng: rr });
    this.talk.glowAnswer = false;
    this.talkAnswered = null; this._talkAskT = 0; this._talkAsks = 0;
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
  P._canGrab = function (it) { return it.state === 'idle' || it.state === 'return'; };

  P.pointerDown = function (x, y) {
    this.finger.x = x; this.finger.y = y; this.finger.down = true;
    if (this.state !== 'round' || this.held || this._roundEnded) return null;
    var cfg = this.cfg, best = null, bestD = 1e9;
    for (var i = this.items.length - 1; i >= 0; i--) {
      var it = this.items[i];
      if (!this._canGrab(it)) continue;
      var r = cfg.touchR * it.size + cfg.touchPad, d = hyp(x - it.x, y - it.y) / r;
      if (d <= 1 && d < bestD - 1e-9) { best = it; bestD = d; }
    }
    if (!best) return null;
    this.items.splice(this.items.indexOf(best), 1); this.items.push(best);   // draw on top
    best.state = 'drag'; best.t = 0; best._f = null;
    best._offX = (best.x - x) * cfg.grabKeep; best._offY = (best.y - y) * cfg.grabKeep;
    this.held = best.id; this._idleT = 0; this._idleGap = cfg.idleTime;
    this._down.x = x; this._down.y = y; this._down.t = this.time; this._down.maxD = 0;
    this._emit({ type: 'grab', id: best.id, nameKind: best.nameKind, nameValue: best.nameValue });
    return best.id;
  };
  P.pointerMove = function (x, y) {
    this.finger.x = x; this.finger.y = y;
    if (this.held) this._down.maxD = Math.max(this._down.maxD, hyp(x - this._down.x, y - this._down.y));
  };
  P.pointerUp = function (x, y) {
    if (x !== undefined) { this.finger.x = x; this.finger.y = y; }
    this.finger.down = false;
    if (!this.held) return;
    var it = this.itemById(this.held);
    this.held = null;
    if (!it || it.state !== 'drag') return;
    var cfg = this.cfg, d = Math.max(this._down.maxD, hyp(this.finger.x - this._down.x, this.finger.y - this._down.y));
    if (d < cfg.tapMovePx && this.time - this._down.t < cfg.tapTime) {
      // C1 tap guard: a quick tap is "what is this?", never a drop — no drop/miss/wrong/hint, no misses++
      this._planReturn(it, 'tap');
      this._emit({ type: 'tap', id: it.id, nameKind: it.nameKind, nameValue: it.nameValue });
      return;
    }
    this._drop(it, this.finger.x, this.finger.y);
  };
  P.cancelDrag = function () {
    this.finger.down = false;
    if (!this.held) return;
    var it = this.itemById(this.held);
    this.held = null;
    if (it && it.state === 'drag') this._planReturn(it, 'miss');
  };

  /** Basket whose (generous) drop zone contains the point; nearest centre wins where zones overlap. */
  P.nestAt = function (px, py) {
    var cfg = this.cfg, best = null, bd = 1e9;
    for (var i = 0; i < this.baskets.length; i++) {
      var b = this.baskets[i], top = b.y - cfg.nestTopFrac * b.h;
      if (px < b.x - b.w / 2 - cfg.nestPadSide || px > b.x + b.w / 2 + cfg.nestPadSide) continue;
      if (py < top - cfg.nestPadUp || py > top + b.h + cfg.nestPadSide) continue;
      var d = Math.abs(px - b.x);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  };

  P._drop = function (it, fx, fy) {
    var cfg = this.cfg, b = this.nestAt(it.x, it.y) || this.nestAt(fx, fy);
    if (b && this.cur.mode === 'count' && b.reserved >= b.need) {      // nest already full (last one in the air)
      this._emit({ type: 'drop', id: it.id, basketId: null });
      this._planReturn(it, 'miss');
      return;
    }
    this._emit({ type: 'drop', id: it.id, basketId: b ? b.id : null });
    if (!b) {
      it.misses++;
      this._emit({ type: 'miss', id: it.id });
      this._planReturn(it, 'miss');
      this._autoHint(it);
      return;
    }
    if (b.id === it.answer) {
      it.slot = b.reserved++;
      it.basketId = b.id;
      this._planFly(it, b, it.vx, it.vy, false);
      this._mood('happy');
      this._emit({ type: 'correct', id: it.id, basketId: b.id, nameKind: it.nameKind, nameValue: it.nameValue, label: b.label });
    } else {
      it.misses++; this.roundMistakes++;
      b._shakeT = 0;
      this._mood('oops');
      this._emit({ type: 'wrong', id: it.id, basketId: b.id, misses: it.misses });
      this._planReturn(it, 'wrong');
      this._autoHint(it);
    }
  };

  P._autoHint = function (it) {   // C2: never while that nest still glows, nor within hintCooldown s of the last hint
    if (it.misses < this.cfg.hintAfterMisses) return;
    var b = this.basketById(it.answer);
    if (!b || b._glowT > 0 || this.time - this._lastHintT < this.cfg.hintCooldown) return;
    this._glow(b);
  };
  P._glow = function (b) {
    if (!b) return null;
    b._glowT = this.cfg.hintTime;
    this._lastHintT = this.time;
    this._mood('think');
    this._emit({ type: 'hint', basketId: b.id });
    return b.id;
  };
  P.hint = function () {
    if (this.state !== 'round' || this._roundEnded) return null;
    var it = this.held ? this.itemById(this.held) : null;
    if (!it) for (var i = 0; i < this.items.length; i++) {
      var c = this.items[i];
      if (c.state === 'idle' || c.state === 'return' || c.state === 'appear') { it = c; break; }
    }
    if (!it) return null;
    var b = this.basketById(it.answer);
    if (b && b._glowT > 0) return b.id;          // already glowing: no repeated event / voice line
    return this._glow(b);
  };

  // ---------------------------------------------------------------- trajectories
  /* Constant-acceleration (parabolic) path from the current position to (x1,y1) in T seconds,
   * apex H px above the higher end:  p(τ) = p0 + v0·τ + ½·a·τ².
   * Vertical: rise A0 = y0−ya, fall A1 = y1−ya with ya = min(y0,y1)−H, so
   *   √g = (√(2A0) + √(2A1)) / T,   vy0 = −√(2 g A0),   ay = g.
   * Horizontal: vx0 given (inherited), ax = 2(x1 − x0 − vx0 T)/T². */
  function arc(it, x1, y1, T, H, vx0) {
    var x0 = it.x, y0 = it.y, ya = Math.min(y0, y1) - H, A0 = y0 - ya, A1 = y1 - ya;
    var sg = (Math.sqrt(2 * A0) + Math.sqrt(2 * A1)) / T, g = sg * sg;
    return { x0: x0, y0: y0, x1: x1, y1: y1, vx0: vx0, vy0: -Math.sqrt(2 * g * A0), ax: 2 * (x1 - x0 - vx0 * T) / (T * T), ay: g,
      T: T, tau: 0, H: H, rot0: it.rot, size0: it.size, size1: it.size };
  }

  P._planFly = function (it, b, rvx, rvy, keepTau) {
    var cfg = this.cfg, sl = b.slots[Math.min(it.slot, b.slots.length - 1)];
    var d = hyp(sl.x - it.x, sl.y - it.y);
    var T = clamp(cfg.flyBase + d * cfg.flyPerPx, cfg.flyMin, cfg.flyMax);
    if (keepTau && it._f) T = Math.max(0.12, it._f.T - it._f.tau);   // re-target mid-air (viewport change)
    var H = clamp(cfg.flyApex + Math.max(0, -(rvy || 0)) * cfg.flyApexFromVy, cfg.flyApex, cfg.flyApexMax);
    var vx0 = clamp((rvx || 0) * cfg.flyInherit, -500, 500);
    it._f = arc(it, sl.x, sl.y, T, H, vx0);
    it._f.size1 = b.slotSize;
    it.state = 'fly'; it.t = 0; it.overNest = false;
  };

  P._planReturn = function (it, kind) {
    var cfg = this.cfg, wrong = kind === 'wrong', tap = kind === 'tap';
    var T = wrong ? cfg.wrongReturnTime : tap ? cfg.tapReturnTime : cfg.missReturnTime;
    if (it.state === 'return' && it._f && it._retKind === kind) T = Math.max(0.15, it._f.T - it._f.tau);
    it._f = arc(it, it.homeX, it.homeY, T, wrong ? cfg.wrongApex : tap ? cfg.tapApex : cfg.missApex, 0);
    it._f.size1 = it.size;
    it._retKind = kind;
    it.state = 'return'; it.t = 0;
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
    this.time += h; this.stateTime += h;

    switch (this.state) {
      case 'intro': if (this.stateTime >= cfg.introTime) this._beginRound(); break;
      case 'round':
        if (this.interactive && !this.held) {
          this._idleT += h;
          if (this._idleT >= this._idleGap - 1e-9) {
            this._idleT = 0; this._mood('think');
            this._idleGap = Math.min(cfg.idleMax, this._idleGap * cfg.idleBackoff);   // C4: 12 → 18 → 27 → 30 s
            this._emit({ type: 'idle', promptKey: this.cur.promptKey, params: this.cur.params });
          }
        }
        break;
      case 'roundDone':
        if (this.stateTime >= cfg.leaveDelay && this.stateTime - h < cfg.leaveDelay) this._leaveAll();
        if (this.stateTime >= cfg.roundDoneTime) {
          this.round++;
          var long = this.round >= cfg.chapterMinRounds && this.time - this.levelStartTime > cfg.chapterTimeLimit;   // C3
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
          else { this._setState('sessionDone'); this.items = []; this._emit({ type: 'sessionDone', stars: this.stars }); }
        }
        break;
    }

    var allAppeared = true;
    for (i = 0; i < this.items.length; i++) {
      this._stepItem(this.items[i], h);
      if (this.items[i].state === 'appear') allAppeared = false;
    }
    if (this.state === 'round' && !this.interactive && allAppeared) this.interactive = true;
    for (i = 0; i < this.baskets.length; i++) this._stepBasket(this.baskets[i], h);
    this._stepBo(h);
  };

  P._spring = function (it, h) {       // landing / home squash spring (q → 0)
    var w = this.cfg.squashOmega, z = this.cfg.squashZeta;
    it._qv += (-w * w * it._q - 2 * z * w * it._qv) * h;
    it._q += it._qv * h;
    it.sx = 1 + it._q; it.sy = 1 - 1.2 * it._q;
  };

  P._stepItem = function (it, h) {
    var cfg = this.cfg, f, u;
    it.t += h;
    switch (it.state) {
      case 'appear':
        if (it.t >= 0 && !it._appeared) { it._appeared = true; this._emit({ type: 'appear', id: it.id }); }
        u = clamp(it.t / cfg.appearTime, 0, 1);
        it.appear = it.t <= 0 ? 0 : easeOutBack(u);
        it.x = it.homeX; it.y = it.homeY;
        if (u >= 1) { it.appear = 1; it.state = 'idle'; it.t = 0; it._bobW = 0; }
        break;

      case 'idle': {
        it._bobW = Math.min(1, it._bobW + h / cfg.bobFadeIn);
        var bob = cfg.bobAmp * it._bobW * Math.sin(it._bobPh + TAU * this.time / it._bobP);
        it.x = it.homeX; it.y = it.homeY + bob; it.vx = 0; it.vy = 0;
        it.lift = Math.max(0, it.lift - h * cfg.liftRate * it.lift - h);
        var rot = 0;
        if (it._egg) {
          if (it._wigU < 0) { it._wigT -= h; if (it._wigT <= 0) { it._wigU = 0; it._wigT = this.rng.float(cfg.wiggleMin, cfg.wiggleMax); } }
          if (it._wigU >= 0) {
            it._wigU += h / cfg.wiggleTime;
            if (it._wigU >= 1) it._wigU = -1;
            else rot = cfg.wiggleAmp * Math.sin(TAU * 2 * it._wigU) * (1 - it._wigU * 0.5);
          }
        }
        it.rot += (rot - it.rot) * Math.min(1, h * 25); it.vr = 0;
        this._spring(it, h);
        break;
      }

      case 'drag': {
        var L = this.layout;
        var tx = clamp(this.finger.x + it._offX, 0, L.W), ty = clamp(this.finger.y + it._offY - cfg.liftPx, 0, L.H);
        var w = cfg.dragOmega;
        it.vx += (w * w * (tx - it.x) - 2 * w * it.vx) * h;
        it.vy += (w * w * (ty - it.y) - 2 * w * it.vy) * h;
        it.x += it.vx * h; it.y += it.vy * h;
        var tt = clamp(-it.vx * cfg.tiltK, -cfg.tiltMax, cfg.tiltMax), wr = cfg.tiltOmega;
        it.vr += (wr * wr * (tt - it.rot) - 2 * cfg.tiltZeta * wr * it.vr) * h;
        it.rot += it.vr * h;
        it.lift += (1 - it.lift) * Math.min(1, h * cfg.liftRate);
        this._spring(it, h);
        break;
      }

      case 'fly':
      case 'return': {
        f = it._f; f.tau = Math.min(f.T, f.tau + h);
        var s = f.tau;
        it.x = f.x0 + f.vx0 * s + 0.5 * f.ax * s * s;
        it.y = f.y0 + f.vy0 * s + 0.5 * f.ay * s * s;
        it.vx = f.vx0 + f.ax * s; it.vy = f.vy0 + f.ay * s;
        u = f.tau / f.T;
        it.size = f.size0 + (f.size1 - f.size0) * u;
        it.lift = Math.max(0, it.lift - h * 5);
        if (it.state === 'fly') {
          it.rot = f.rot0 * (1 - u) * (1 - u);
          if (it.vy > 0 && u > 0.5) it.overNest = true;
        } else if (it._retKind === 'wrong') {
          it.rot = f.rot0 * (1 - u) * (1 - u) + cfg.wobbleAmp * Math.sin(TAU * cfg.wobbleHz * f.tau) * (1 - u);
        } else it.rot = f.rot0 * (1 - u) * (1 - u);
        it.vr = 0;
        if (f.tau >= f.T - 1e-9) {
          it.x = f.x1; it.y = f.y1; it.size = f.size1; it.rot = 0; it.vx = 0; it.vy = 0;
          if (it.state === 'fly') this._land(it);
          else { it.state = 'idle'; it.t = 0; it._bobW = 0; it._q = cfg.homeSquash; it._qv = 0; it._f = null; }
        }
        this._spring(it, h);
        break;
      }

      case 'in':
        this._spring(it, h);
        break;

      case 'leave':
        u = clamp(it.t / cfg.leaveTime, 0, 1);
        if (it._wasIn) {
          it.vy += cfg.leaveG * h; it.x += it.vx * h; it.y += it.vy * h; it.rot += it.vr * h;
        } else it.appear = 1 - u;
        it.alpha = 1 - u;
        this._spring(it, h);
        break;
    }
  };

  P._land = function (it) {
    var cfg = this.cfg, b = this.basketById(it.basketId);
    it.state = 'in'; it.t = 0; it._f = null; it.overNest = true;
    it._q = cfg.landSquash; it._qv = 0;
    b.count++;
    b.squash = cfg.nestSquash; b._sqv = 0;
    this._emit({ type: 'land', id: it.id, basketId: b.id, count: b.count, need: this.cur.mode === 'count' ? b.need : null });
    if (this.state !== 'round') return;
    if (this.cur.mode === 'count') { if (b.count >= b.need) this._endRound(); return; }
    for (var i = 0; i < this.items.length; i++) if (this.items[i].state !== 'in') return;
    this._endRound();
  };

  P._stepBasket = function (b, h) {
    var cfg = this.cfg;
    b.appear = Math.min(1, b.appear + h / cfg.nestAppearTime);
    var w = cfg.nestOmega, z = cfg.nestZeta;
    b._sqv += (-w * w * b.squash - 2 * z * w * b._sqv) * h;
    b.squash += b._sqv * h;
    if (b._shakeT >= 0) {
      b._shakeT += h;
      var u = b._shakeT / cfg.shakeTime;
      if (u >= 1) { b._shakeT = -1; b.shake = 0; }
      else b.shake = Math.sin(TAU * cfg.shakeWiggles * u) * Math.pow(1 - u, 1.5);
    }
    if (b._glowT > 0) b._glowT = Math.max(0, b._glowT - h);
    b.glow = clamp(b._glowT / 0.4, 0, 1);
  };

  P._stepBo = function (h) {
    var bo = this.bo, cfg = this.cfg, L = this.layout;
    if (bo.moodT > 0) { bo.moodT -= h; if (bo.moodT <= 0) { bo.moodT = 0; bo.mood = 'idle'; } }
    var it = this.held ? this.itemById(this.held) : null;
    var lx = it ? it.x : L.play.x + L.play.w / 2, ly = it ? it.y : L.play.y + L.play.h / 2;
    var k = Math.min(1, h * cfg.lookRate);
    bo.lookX += (lx - bo.lookX) * k; bo.lookY += (ly - bo.lookY) * k;
    if (bo._hopT >= 0) {
      bo._hopT += h;
      var n = bo._hopT / cfg.cheerHopTime;
      if (n >= 3) { bo._hopT = -1; bo.hop = 0; }
      else { var ph = n - Math.floor(n); bo.hop = cfg.cheerHopPx * Math.pow(0.7, Math.floor(n)) * 4 * ph * (1 - ph); }   // 3 parabolic hops, each 70 % of the last
    }
  };

  DN.World = World;
})(window.DN = window.DN || {});
