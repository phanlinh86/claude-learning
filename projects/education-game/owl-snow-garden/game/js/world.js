/* Owlet's Snow Garden — SG.CONFIG + SG.World (headless, deterministic simulation; DESIGN §2, §5.2)
 *
 * ============================== CONVENTIONS ==============================
 *  Units: logical px (short side = 720), seconds, radians, y DOWN.
 *  update(dt) runs fixed sub-steps of cfg.step (1/120 s) with an accumulator.
 *  At the START of every sub-step each item stores _px,_py,_prot; the renderer
 *  draws  p = _p + (p − _p) · w.alpha   (w.alpha = leftover / step, 0..1).
 *  Result depends only on seed + the sub-step index at which inputs arrive.
 *
 *  Drawing a seed (renderer contract):
 *    centre (x, y), rotation rot, drawn width = size · scale (scale ≠ 1 only in the size topic: 1.3 / 0.72)
 *    scale  = appear(0..1, back-overshoot) · (1 + (cfg.liftScale−1)·lift) · (sx, sy)
 *    alpha  = item.alpha (fades on 'leave')
 *    Items in state 'in' (and 'fly' once item.overPot) go between pot_back and pot_front.
 *    The held item is always the LAST element of w.items (grab moves it there).
 *  Planting (state 'in'): item.grow 0→1 over cfg.growTime; derived, already-eased values:
 *    item.sink   0→1  (grow 0–0.25)  seed shrinks and drops into the soil, behind the pot front
 *    item.stem   0→1  (from grow 0.25, critically damped spring) stem height = stem · basket.stemH · slot.stem
 *    item.petals 0→1  (from grow 0.55, spring ω 14 ζ 0.45 → overshoots to ≈ 1.2) petal opening
 *    flower base = (slot.x, basket.soilY); head centre = soilY − stem·stemH·slot.stem; head width ≈ basket.flowerSize;
 *    slot.lean = outward stem lean (rad); colour = item.flower. layout.pot.flowerTop = highest head top; the seed band
 *    ends layout.playGap px above the pot top (≥ 74, clear of the 120 px drop zone and of that head)
 *  Drawing a pot: basket.x = centre x, basket.y = soil (opening) centre y, w × h,
 *    sprite rect = [x − w/2, basket.top, w, h] (basket.bottom = top + h).
 *    kind 'pot' (pot_back/front, 256×200) or 'planter' (planter_back/front, 512×200, N holes = slots).
 *    squash: scaleX 1+squash, scaleY 1−squash around the bottom; shake ∈ [−1,1]
 *    → suggested x offset shake·cfg.shakePx and rotation shake·0.05 rad;
 *    glow 0..1 → soft halo; appear 0..1 → pop-in scale.
 *  Lumi: lumi.hop = px ABOVE the feet anchor (≥ 0).
 * ========================================================================
 */
(function (SG) {
  'use strict';

  var CONFIG = {
    // ---- timing / state machine (s)
    step: 1 / 120,             // fixed simulation sub-step (≤ 1/120 per DESIGN)
    maxFrame: 1.0,             // s, largest dt accepted per update() (speed mode passes big dt)
    roundsPerLevel: 4,         // warm-up + 3 real rounds
    chapterTimeLimit: 60,      // s since the chapter began: after ≥ chapterMinRounds rounds, go to Talk time once exceeded (QA playtest 75 → 60)
    chapterMinRounds: 3,
    introTime: 1.8,            // chapter banner
    appearTime: 0.45,          // item pop-in (back-overshoot)
    appearStagger: 0.07,       // s between consecutive items popping in
    potAppearTime: 0.35,       // new pots pop in
    roundDoneTime: 1.7,        // stars on screen
    leaveDelay: 1.0,           // s into roundDone when the flowers fade away (< roundDoneTime − leaveTime)
    leaveTime: 0.4,            // fade
    talkAfterAnswer: 1.6,      // talk panel stays after an answer
    levelDoneTime: 2.0,
    talkAskTime: 12,           // s without an answer → talkAsk (re-ask), repeating
    talkGlowAfterAsks: 2,      // from this re-ask on, talk.glowAnswer = true (UI glows the right choice)

    // ---- planting / growth (s, fractions of grow)
    growTime: 1.1,             // grow 0 → 1
    sinkEnd: 0.25,             // 0–0.25: seed sinks into the soil (smoothstep)
    bloomAt: 0.55,             // stem 0.25–0.55, petals open from 0.55; 'bloom' event here
    stemOmega: 15,             // rad/s, critically damped: 95 % in ≈ 0.32 s (= 0.3 of growTime)
    petalOmega: 14, petalZeta: 0.45,   // under-damped: peak ≈ 1.2 at ≈ 0.25 s, settles ≈ 0.6 s
    bloomHold: 0.4,            // roundDone waits until the last bloom + 0.4 s

    // ---- layout (DESIGN §2; px)
    shortSide: 720, minLong: 960, maxLong: 1600,
    groundOffset: 70,          // groundY = H − ins.bottom − 70 (snow line)
    potMaxW: 230, potGap: 24, potSideMargin: 20,
    potAspect: 0.78,           // h = 0.78 w (pot viewBox 256×200)
    potBottomDy: 8,            // pot bottom = groundY + 8
    potSoilFrac: 0.24,         // soil centre y = top + 0.24 h (soil (128,48) in 256×200)
    potSlotSpan: 0.66,         // slots spread over 66 % of the pot width
    potSideMarginPort: 6, potGapPort: 8,   // portrait: wider pots (QA P1-4: iPhone portrait with 4 pots)
    potMaxWTall: 290,          // tall portrait (H/W > 1.6) with ≤ 3 pots: bigger pots (QA P2-3)
    tallGroundRaise: 0.25, tallGroundMax: 120,   // tall portrait: groundY rises by min(120, 0.25·(H − 1.6 W)) px
    sizeSmallPot: 0.72,        // size topic: the 'small' pot is 0.72 × the big one (same x, same bottom)
    stemFrac: 0.42, stemMin: 45, stemMax: 80,   // stemH = clamp(0.42 h, 45, 80) px (QA P1-1: shorter stems)
    flowerMax: 96,             // flower head width cap (px)
    minAltBand: 240, potMinWLand: 190,   // landscape: pots shrink (not below 190 px) until the alt seed band is ≥ 240 px tall
    leanMax: 0.08,             // outer pot slots lean outward by up to ±0.08 rad (slot.lean)
    signScale: 0.55,           // sign width = 0.55 × pot w (sign.svg 128×112)
    lumiX: 105, lumiYLand: 225, lumiYPort: 245, lumiHLand: 175, lumiHPort: 190,
    bubbleDx: 85, bubbleY: 24, bubbleMaxW: 620, bubbleRightGap: 150, bubbleH: 104,
    playMargin: 40, playTopGap: 10,
    playPotGap: 74,            // px (minimum) between play band and pot top: resting seeds stay OUT of the 120 px drop zone;
                               // the band gap grows further if a full flower head would reach higher (layout.playGap)
    playLumiGap: 90, playBubbleGap: 16,   // landscape alternative band: from below the bubble, Lumi's box (±90 px) cut out
    hudW: 140, hudH: 90,       // DOM buttons top-right: x > W−ins.right−140, y < ins.top+90
    minSpacing: 1.1,           // min centre distance = 1.1 × size
    minShrink: 0.75,           // items shrink to ≥ 0.75× before giving up
    shrinkStep: 0.05,
    packJitter: 4,             // px random offset per resting item (spacing includes 2√2·jitter)
    maxRowStretch: 1.7,        // rows spread vertically at most 1.7 × spacing

    // ---- touch (px)
    touchR: 0.6, touchPad: 14, // item radius = 0.6 × size + 14
    potPadSide: 45,            // drop zone grows 45 px left/right/down (Dino playtest 30 → 45)
    potPadUp: 120,             // QA playtest 90 → 120: children release high above the pot
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
    slotScale: 0.82,           // seed size on the soil = 0.82 × its base size (limited by slot spacing)
    landSquash: 0.15,          // q on landing: sx = 1+q = 1.15, sy = 1−1.2q = 0.82
    squashOmega: 22, squashZeta: 0.3,
    potSquash: 0.12, potOmega: 18, potZeta: 0.25,

    // ---- wrong / miss
    shakeTime: 0.5, shakeWiggles: 3, shakePx: 10,
    wrongReturnTime: 0.55, wrongApex: 45, wobbleAmp: 0.28, wobbleHz: 2.5,
    missReturnTime: 0.5, missApex: 22,
    homeSquash: 0.07,

    // ---- idle life
    bobAmp: 3, bobPeriodMin: 2, bobPeriodMax: 3, bobFadeIn: 0.5,
    wiggleAmp: 0.12, wiggleTime: 0.4, wiggleMin: 4, wiggleMax: 8,

    // ---- help
    hintAfterMisses: 2, hintTime: 3,
    hintCooldown: 6,           // s: no auto-hint within 6 s of the last one, nor while the pot still glows
    idleTime: 12,              // s without a grab → idle nudge; the gap then grows ×1.5 per nudge up to idleMax
    idleBackoff: 2, idleMax: 60,   // QA playtest: 12 → 24 → 48 → 60 s

    // ---- Lumi
    moodTime: { happy: 0.9, cheer: 1.6, oops: 0.8, think: 1.4 },
    cheerHopPx: 26, cheerHopTime: 0.4, lookRate: 6,
    // ---- tall portrait phones: seed band height ≤ 0.85·W above the pots, seeds ×1.2 when H/W > 1.6
    portraitPlayMaxFrac: 0.85, portraitItemScale: 1.2, tallAspect: 1.6
  };
  SG.CONFIG = CONFIG;

  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hyp(x, y) { return Math.sqrt(x * x + y * y); }
  function easeOutBack(u) { var c1 = 1.70158, c3 = c1 + 1, v = u - 1; return 1 + c3 * v * v * v + c1 * v * v; }
  function smooth(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  function merge(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; if (b) for (k in b) o[k] = b[k]; return o; }

  /** DESIGN §2 short-side rule: CSS viewport → logical W×H. */
  function logicalSize(cssW, cssH, cfg) {
    cfg = cfg || CONFIG;
    var S = cfg.shortSide, aspect = cssW / Math.max(1, cssH);
    if (cssW >= cssH) return { W: clamp(Math.round(S * aspect), cfg.minLong, cfg.maxLong), H: S };
    return { W: S, H: clamp(Math.round(S / aspect), cfg.minLong, cfg.maxLong) };
  }

  function stemOf(h, cfg) { return clamp(cfg.stemFrac * h, cfg.stemMin, cfg.stemMax); }

  function computeLayout(W, H, ins, n, cfg) {
    ins = { top: +(ins && ins.top) || 0, right: +(ins && ins.right) || 0, bottom: +(ins && ins.bottom) || 0, left: +(ins && ins.left) || 0 };
    n = n || 3;
    var portrait = H > W, tall = H / W > cfg.tallAspect;
    var raise = tall ? Math.min(cfg.tallGroundMax, cfg.tallGroundRaise * (H - cfg.tallAspect * W)) : 0;
    var groundY = H - ins.bottom - cfg.groundOffset - raise;
    var margin = portrait ? cfg.potSideMarginPort : cfg.potSideMargin, gap = portrait ? cfg.potGapPort : cfg.potGap;
    var maxW = tall && n <= 3 ? cfg.potMaxWTall : cfg.potMaxW;
    var aw = W - ins.left - ins.right - 2 * margin;
    var pw = Math.min(maxW, aw / n - gap), ph, top, flowerClear, pgap;
    var bottom = groundY + cfg.potBottomDy, altTop = ins.top + cfg.bubbleY + cfg.bubbleH + cfg.playBubbleGap;
    for (;;) {
      ph = cfg.potAspect * pw; top = bottom - ph;
      // highest flower head above the pot top (one centred flower of width min(96, 0.5 w) on a full stem)
      flowerClear = stemOf(ph, cfg) - cfg.potSoilFrac * ph + 0.5 * Math.min(cfg.flowerMax, 0.5 * pw);
      pgap = Math.max(cfg.playPotGap, Math.ceil(flowerClear));
      if (portrait || top - pgap - altTop >= cfg.minAltBand || pw <= cfg.potMinWLand) break;
      pw = Math.max(cfg.potMinWLand, pw - 2);      // short landscape (iPad with insets): slightly smaller pots, bigger seeds
    }
    var py = top + cfg.potSoilFrac * ph, xs = [];
    for (var i = 0; i < n; i++) xs.push(ins.left + margin + (aw / n) * (i + 0.5));
    var lumi = { x: ins.left + cfg.lumiX, y: ins.top + (portrait ? cfg.lumiYPort : cfg.lumiYLand), h: portrait ? cfg.lumiHPort : cfg.lumiHLand };
    var bx = lumi.x + cfg.bubbleDx;
    var bubble = { x: bx, y: ins.top + cfg.bubbleY, w: Math.min(cfg.bubbleMaxW, W - bx - ins.right - cfg.bubbleRightGap), h: cfg.bubbleH };
    var px = ins.left + cfg.playMargin, pyy = lumi.y + cfg.playTopGap;
    var play = { x: px, y: pyy, w: W - ins.right - cfg.playMargin - px, h: top - pgap - pyy };
    // tall portrait phones: keep seeds in a band just above the pots (short drags) and make them bigger
    var itemScale = 1;
    if (portrait && play.h > cfg.portraitPlayMaxFrac * W) {
      var bh = cfg.portraitPlayMaxFrac * W;
      play.y = top - pgap - bh; play.h = bh;
      if (tall) itemScale = cfg.portraitItemScale;
    }
    play.itemScale = itemScale;
    // landscape: a taller band right of Lumi and below the bubble; World packs into it when that gives bigger seeds
    // (an L-shape: full width from below the bubble, minus Lumi's box `ex`)
    var playAlt = null;
    if (!portrait) {
      var ay = bubble.y + bubble.h + cfg.playBubbleGap;
      playAlt = { x: play.x, y: ay, w: play.w, h: top - pgap - ay, itemScale: 1,
        ex: { x: lumi.x - cfg.playLumiGap, y: lumi.y - lumi.h, w: 2 * cfg.playLumiGap, h: lumi.h + cfg.playTopGap } };
      if (playAlt.h <= play.h + 1) playAlt = null;
    }
    var sw = cfg.signScale * pw;
    var pot = { y: py, w: pw, h: ph, xs: xs, n: n, top: top, bottom: bottom, flowerTop: top - flowerClear,
      sign: { w: sw, h: sw * 112 / 128, bottomY: groundY + 0.5 * (H - groundY) } };   // suggested sign placement (stake bottom)
    return {
      W: W, H: H, ins: ins, portrait: portrait, tall: tall, groundY: groundY, playGap: pgap,
      pot: pot, nest: pot,                 // `nest` = old name (same object)
      lumi: lumi, bubble: bubble, play: play, playAlt: playAlt, itemScale: itemScale,
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
    var ex = play.ex, r0 = size / 2;
    function cut(pts) {     // drop centres whose item circle would touch the excluded box (Lumi)
      if (!ex) return pts;
      return pts.filter(function (p) {
        var nx = Math.max(ex.x, Math.min(p.x, ex.x + ex.w)), ny = Math.max(ex.y, Math.min(p.y, ex.y + ex.h));
        return hyp(p.x - nx, p.y - ny) >= r0;
      });
    }
    var rectRows = Math.floor(ih / d + 1e-9) + 1, rect = cut(build(rectRows, d, false));
    if (rect.length >= n || cols < 2) return rect;
    var hexRows = Math.floor(ih / (d * 0.8660254) + 1e-9) + 1, hex = cut(build(hexRows, d * 0.8660254, true));
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
    for (i = 0; i < items.length; i++) maxBase = Math.max(maxBase, items[i].baseSize * (items[i].scale || 1) * k0);   // drawn size = size · scale
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

  // ------------------------------------------------------------------ pot / planter slots
  /* Pot: one row on the soil line, centre-out fill, spread over potSlotSpan·w, outer stems a bit shorter.
   * Planter: N holes evenly spaced along the soil line (84 % of the width), filled LEFT → RIGHT (counting order).
   * slot = { x, y (seed centre resting on the soil), stem (stem height factor) }; b.soilY = flower base y. */
  function computeSlots(b, cap, baseSize, cfg) {
    cap = Math.max(1, cap);
    var slots = [], k, sxp, s, x0;
    b.stemH = stemOf(b.h, cfg);
    if (b.kind === 'planter') {
      sxp = b.w * 0.84 / cap; x0 = b.x - b.w * 0.42 + sxp / 2;
      s = Math.min(baseSize * cfg.slotScale, sxp, b.h * 0.6);
      for (k = 0; k < cap; k++) slots.push({ x: x0 + k * sxp, y: b.y - 0.3 * s, stem: k % 2 ? 0.72 : 1, lean: 0 });   // alternate heights: heads don't touch
      b.flowerSize = Math.min(cfg.flowerMax, sxp * 0.85);
    } else {
      sxp = cap > 1 ? b.w * cfg.potSlotSpan / cap : 0;
      s = Math.min(baseSize * cfg.slotScale, b.w * 0.5, cap > 1 ? sxp * 1.25 : 1e9);
      var idx = [], mid = (cap - 1) / 2;
      for (k = 0; k < cap; k++) idx.push(k);
      idx.sort(function (a, c) { return Math.abs(a - mid) - Math.abs(c - mid) || a - c; });   // centre-out
      for (k = 0; k < cap; k++) {
        var off = idx[k] - mid;
        slots.push({ x: b.x + off * sxp, y: b.y - 0.3 * s, stem: Math.abs(off) < 0.6 ? 1 : 0.86, lean: mid > 0 ? cfg.leanMax * off / mid : 0 });
      }
      b.flowerSize = Math.min(cfg.flowerMax, cap > 1 ? sxp * 1.05 : b.w * 0.5);
    }
    b.slots = slots; b.slotSize = s; b.soilY = b.y;
  }

  // ------------------------------------------------------------------ World
  function World(opts) {
    opts = opts || {};
    this.cfg = merge(CONFIG, opts.config);
    this.seed = opts.seed !== undefined ? opts.seed : 1;
    this.rng = new SG.RNG(this.seed);
    this.age = SG.Content.ageOf(opts.age !== undefined ? opts.age : 4);
    this.lang = opts.lang === 'vi' ? 'vi' : 'en';
    this._pendingAge = this.age; this._pendingLang = this.lang;
    this.state = 'menu';
    this.level = 0; this.levels = []; this.topic = null; this.weather = 0;
    this.round = 0; this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.stars = 0; this.levelStars = 0; this.roundMistakes = 0; this.roundStars = 0;
    this.time = 0; this.stateTime = 0; this.alpha = 0; this._acc = 0;
    this.cur = null; this.baskets = []; this.items = []; this.held = null; this.talk = null; this.talkAnswered = null;
    this.queue = []; this.target = null;       // ask mode
    this.completing = false;                   // round solved, waiting for the last bloom (+ bloomHold)
    this.finger = { x: 0, y: 0, down: false };
    this.lumi = { mood: 'idle', moodT: 0, lookX: 0, lookY: 0, hop: 0, _hopT: -1 };
    this.events = [];
    this.sessions = 0;
    this.interactive = false;
    this._idleT = 0; this._idleGap = this.cfg.idleTime; this._roundEnded = false; this._vpCount = 0;
    this._lastHintT = -1e9; this.levelStartTime = 0; this._talkAskT = 0; this._talkAsks = 0; this._lastBloomT = -1e9;
    this._down = { x: 0, y: 0, t: 0, maxD: 0 };
    this.setViewport(opts.width || 1280, opts.height || 720, opts.ins || null);
    this.lumi.lookX = this.layout.play.x + this.layout.play.w / 2; this.lumi.lookY = this.layout.play.y + this.layout.play.h / 2;
  }
  World.logicalSize = logicalSize;
  World.computeLayout = function (W, H, ins, n, cfg) { return computeLayout(W, H, ins, n, merge(CONFIG, cfg)); };
  World.packItems = packItems;
  World.gridPoints = gridPoints;

  var P = World.prototype;
  P._emit = function (e) { this.events.push(e); };
  P.drainEvents = function () { var e = this.events; this.events = []; return e; };
  P.setAge = function (a) { this._pendingAge = SG.Content.ageOf(a); };
  P.setLang = function (l) { this._pendingLang = l === 'vi' ? 'vi' : 'en'; };
  P.itemById = function (id) { for (var i = 0; i < this.items.length; i++) if (this.items[i].id === id) return this.items[i]; return null; };
  P.basketById = function (id) { for (var i = 0; i < this.baskets.length; i++) if (this.baskets[i].id === id) return this.baskets[i]; return null; };
  P._setState = function (s) { this.state = s; this.stateTime = 0; };
  P._mood = function (m) { this.lumi.mood = m; this.lumi.moodT = this.cfg.moodTime[m] || 1; if (m === 'cheer') this.lumi._hopT = 0; };
  /** The pot this item belongs in right now: ask mode → the current target, else its fixed answer. */
  P.goalOf = function (it) { return this.cur && this.cur.mode === 'ask' ? this.target : it.answer; };
  /** Current prompt (ask mode names the current target animal). */
  P.prompt = function () {
    if (!this.cur) return null;
    if (this.cur.mode === 'ask') {
      var b = this.basketById(this.target);
      return { promptKey: this.cur.promptKey, params: { animal: b ? b.label.value : this.cur.params.animal } };
    }
    return { promptKey: this.cur.promptKey, params: this.cur.params };
  };

  // ---------------------------------------------------------------- viewport
  P.setViewport = function (W, H, ins) {
    var n = this.baskets.length || 3;
    this.layout = computeLayout(W, H, ins, n, this.cfg);
    this._vpCount++;
    if (this.cur && this.baskets.length) this._relayoutRound();
  };

  P._relayoutRound = function () {
    var cfg = this.cfg, i, it;
    SG.Content.placeBaskets(this.baskets, this.layout);
    for (i = 0; i < this.baskets.length; i++) this._slotsFor(this.baskets[i]);
    var resting = [];
    for (i = 0; i < this.items.length; i++) {
      it = this.items[i];
      if (it.state === 'in' || it.state === 'fly' || it.state === 'leave') continue;
      resting.push(it);
    }
    this._pack(resting, (this.cur.seed ^ Math.imul(this.layout.W, 7919) ^ Math.imul(this.layout.H, 104729)) >>> 0);
    for (i = 0; i < this.items.length; i++) {
      it = this.items[i];
      var b = it.basketId ? this.basketById(it.basketId) : null;
      if (it.state === 'in' || it.state === 'leave') {
        if (b && it.slot >= 0) { var sl = b.slots[it.slot]; it.x = it._px = sl.x; it.y = it._py = sl.y; it.size = b.slotSize / (it.scale || 1); }
      } else if (it.state === 'fly') {
        this._planFly(it, b, it.vx, it.vy, true);
      } else if (it.state === 'idle' || it.state === 'appear') {
        it.x = it._px = it.homeX; it.y = it._py = it.homeY;
      } else if (it.state === 'return') {
        this._planReturn(it, it._retKind);
      }
    }
  };

  /** Packs resting seeds into layout.play, or into layout.playAlt (landscape) when that keeps them bigger.
   *  Sets w.playRect (the band used), w.packShrink, w.packOk. Deterministic (same seed → same homes). */
  P._pack = function (items, seed) {
    var L = this.layout, cfg = this.cfg, pr = packItems(items, L.play, new SG.RNG(seed), cfg), rect = L.play, i;
    if (pr.shrink < 1 && L.playAlt && items.length) {
      var keep = items.map(function (it) { return [it.homeX, it.homeY, it.size]; });
      var pa = packItems(items, L.playAlt, new SG.RNG(seed), cfg);
      if (pa.shrink > pr.shrink + 1e-9) { pr = pa; rect = L.playAlt; }
      else for (i = 0; i < items.length; i++) { items[i].homeX = keep[i][0]; items[i].homeY = keep[i][1]; items[i].size = keep[i][2]; }
    }
    this.playRect = rect; this.packShrink = pr.shrink; this.packOk = pr.ok;
  };

  P._slotsFor = function (b) {
    var cap = 0, base = 0, i, mode = this.cur.mode;
    for (i = 0; i < this.items.length; i++) {
      var it = this.items[i];
      if (mode !== 'sort' || it.answer === b.id) base = Math.max(base, it.baseSize * (it.scale || 1));
      if (mode === 'sort' && it.answer === b.id) cap++;
    }
    if (mode === 'ask') for (i = 0; i < this.cur.queue.length; i++) if (this.cur.queue[i] === b.id) cap++;
    if (mode === 'count') cap = b.need;
    computeSlots(b, Math.max(1, cap), base || 116, this.cfg);
  };

  // ---------------------------------------------------------------- session flow
  P.newSession = function () {
    this.age = this._pendingAge; this.lang = this._pendingLang;
    this.sessions++;
    this.levels = SG.Content.topicsFor(this.age);
    this.stars = 0; this._prevCount = null;
    this._emit({ type: 'session', levels: this.levels.slice() });
    this.startLevel(0);
  };

  P.startLevel = function (i) {
    if (!this.levels.length) this.levels = SG.Content.topicsFor(this.age);
    this.level = clamp(i | 0, 0, this.levels.length - 1);
    this.topic = this.levels[this.level];
    this.weather = this.level;
    this.round = 0; this.levelStars = 0; this.levelStartTime = this.time;
    this.items = []; this.baskets = []; this.cur = null; this.held = null; this.talk = null; this.talkAnswered = null;
    this.queue = []; this.target = null; this.completing = false;
    this.interactive = false;
    this._setState('intro');
    this._emit({ type: 'level', level: this.level, topic: this.topic });
  };

  P._beginRound = function () {
    var cfg = this.cfg, i;
    var n = SG.Content.potsFor(this.topic, this.age);
    var prevN = this.baskets.length, prevKind = this.baskets.length ? this.baskets[0].kind : null;
    this.layout = computeLayout(this.layout.W, this.layout.H, this.layout.ins, n, cfg);
    var rseed = (this.rng.next() * 4294967296) >>> 0;
    var rr = new SG.RNG(rseed);
    var cur = SG.Content.makeRound(this.topic, { age: this.age, lang: this.lang, rng: rr, roundIndex: this.round, layout: this.layout, prev: this._prevCount });
    this.cur = cur;
    if (cur.mode === 'count') this._prevCount = { n: cur.params.n, color: cur.params.color };   // C2: next count round avoids both
    this.roundMistakes = 0; this.held = null; this._idleT = 0; this._idleGap = cfg.idleTime; this._roundEnded = false; this.interactive = false;
    this.completing = false; this._lastBloomT = -1e9;
    var keep = prevN === cur.baskets.length && prevKind === cur.baskets[0].kind && cur.mode !== 'count';
    this.baskets = cur.baskets.map(function (b) {
      return { id: b.id, label: b.label, kind: b.kind, need: b.need !== undefined ? b.need : null, count: 0, reserved: 0, blooms: 0,
        x: b.x, y: b.y, w: b.w, h: b.h, top: b.top, bottom: b.bottom, soilY: b.y,
        squash: 0, _sqv: 0, shake: 0, _shakeT: -1, glow: 0, _glowT: 0,
        appear: keep ? 1 : 0, slots: [], slotSize: 0, flowerSize: 0, stemH: 0 };
    });
    this.items = cur.items.map(function (s, k) {
      return { id: s.id, sprite: s.sprite, shape: s.shape, color: s.color, text: s.text, scale: s.scale, flower: s.flower,
        baseSize: s.size, size: s.size, nameKind: s.nameKind, nameValue: s.nameValue, answer: s.answer,
        x: 0, y: 0, rot: 0, vx: 0, vy: 0, vr: 0, sx: 1, sy: 1, _q: 0, _qv: 0, lift: 0, alpha: 1,
        state: 'appear', t: -k * cfg.appearStagger, appear: 0, homeX: 0, homeY: 0, basketId: null, slot: -1, misses: 0,
        overPot: false, overNest: false, _appeared: false, _px: 0, _py: 0, _prot: 0,
        planted: false, grow: 0, sink: 0, stem: 0, _stemV: 0, petals: 0, _petV: 0, bloomed: false,
        _bobPh: rr.float(0, TAU), _bobP: rr.float(cfg.bobPeriodMin, cfg.bobPeriodMax), _bobW: 1,
        _wigT: rr.float(cfg.wiggleMin, cfg.wiggleMax), _wigU: -1, _wiggles: !!(s.sprite && s.sprite.indexOf('seed_') === 0),
        _f: null, _offX: 0, _offY: 0, _retKind: null };
    });
    this.queue = cur.queue ? cur.queue.slice() : [];
    this.target = cur.mode === 'ask' ? this.queue[0] : null;
    for (i = 0; i < this.baskets.length; i++) this._slotsFor(this.baskets[i]);
    this._pack(this.items, cur.seed);
    for (i = 0; i < this.items.length; i++) {
      var it = this.items[i];
      it.x = it._px = it.homeX; it.y = it._py = it.homeY;
    }
    this._setState('round');
    this._emit({ type: 'round', round: this.round, topic: this.topic, mode: cur.mode, promptKey: cur.promptKey, params: cur.params });
    if (cur.mode === 'ask') this._emitAsk();
  };

  P._emitAsk = function () {
    var b = this.basketById(this.target);
    if (!b) return;
    this.cur.params = { animal: b.label.value };
    this._emit({ type: 'ask', basketId: b.id, label: b.label, promptKey: this.cur.promptKey, params: { animal: b.label.value } });
  };

  P._endRound = function () {
    if (this._roundEnded) return;
    this._roundEnded = true;
    this.cancelDrag();
    var m = this.roundMistakes, st = m === 0 ? 3 : m === 1 ? 2 : 1;
    this.roundStars = st; this.stars += st; this.levelStars += st;
    this.interactive = false; this.completing = false;
    this._setState('roundDone');
    this._mood('cheer');
    var ev = { type: 'roundDone', stars: st, mistakes: m };
    if (this.cur.mode === 'count') { ev.count = this.baskets[0].need; ev.need = this.baskets[0].need; }   // Lumi says "N! Great!"
    this._emit(ev);
  };

  /** Round solved: no more input; count mode fades the extra seeds; roundDone follows the last bloom + bloomHold. */
  P._complete = function () {
    if (this.completing || this._roundEnded) return;
    this.completing = true; this.interactive = false;
    if (this.held) { var hi = this.itemById(this.held); this.held = null; if (hi && hi.state === 'drag') this._planReturn(hi, 'miss'); }
    if (this.cur.mode === 'count') {
      for (var i = 0; i < this.items.length; i++) {
        var it = this.items[i];
        if (it.state === 'in' || it.state === 'fly' || it.state === 'leave') continue;
        it._wasIn = false; it.state = 'leave'; it.t = 0; it.vx = 0; it.vy = 0; it.vr = 0;
      }
    }
  };

  P._leaveAll = function () {     // flowers (and anything left) fade away in place
    for (var i = 0; i < this.items.length; i++) {
      var it = this.items[i];
      if (it.state === 'leave') continue;
      it._wasIn = it.state === 'in';
      it.state = 'leave'; it.t = 0; it.vx = 0; it.vy = 0; it.vr = 0;
    }
  };

  P._startTalk = function () {
    var rr = new SG.RNG((this.rng.next() * 4294967296) >>> 0);
    this.talk = SG.Content.makeTalk(this.topic, { age: this.age, lang: this.lang, rng: rr });
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
    if (this.state !== 'round' || this.held || this._roundEnded || this.completing) return null;
    var cfg = this.cfg, best = null, bestD = 1e9;
    for (var i = this.items.length - 1; i >= 0; i--) {
      var it = this.items[i];
      if (!this._canGrab(it)) continue;
      var r = cfg.touchR * it.size * (it.scale || 1) + cfg.touchPad, d = hyp(x - it.x, y - it.y) / r;
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
      // tap guard: a quick tap is "what is this?", never a drop — no drop/miss/wrong/hint, no misses++
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

  /** Pot/planter whose (generous) drop zone contains the point; nearest centre wins where zones overlap. */
  P.potAt = function (px, py) {
    var cfg = this.cfg, best = null, bd = 1e9;
    for (var i = 0; i < this.baskets.length; i++) {
      var b = this.baskets[i];
      if (px < b.x - b.w / 2 - cfg.potPadSide || px > b.x + b.w / 2 + cfg.potPadSide) continue;
      if (py < b.top - cfg.potPadUp || py > b.bottom + cfg.potPadSide) continue;
      var d = Math.abs(px - b.x);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  };
  P.nestAt = P.potAt;   // old name

  P._drop = function (it, fx, fy) {
    // the finger's pot wins (a fast flick leaves the seed lagging over a neighbour); the seed centre catches 'beside' drops
    var b = this.potAt(fx, fy) || this.potAt(it.x, it.y), mode = this.cur.mode;
    if (b && mode === 'count' && b.reserved >= b.need) {      // planter already full (last seed in the air)
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
    var goal = this.goalOf(it);
    if (b.id === goal) {
      it.slot = b.reserved++;
      it.basketId = b.id;
      this._planFly(it, b, it.vx, it.vy, false);
      this._mood('happy');
      this._emit({ type: 'correct', id: it.id, basketId: b.id, nameKind: it.nameKind, nameValue: it.nameValue, label: b.label });
      if (mode === 'ask') {
        this.queue.shift();
        this.target = this.queue.length ? this.queue[0] : null;
        if (this.target) this._emitAsk();
      }
    } else {
      it.misses++; this.roundMistakes++;
      b._shakeT = 0;
      this._mood('oops');
      this._emit({ type: 'wrong', id: it.id, basketId: b.id, misses: it.misses, target: goal });
      this._planReturn(it, 'wrong');
      this._autoHint(it);
    }
  };

  P._autoHint = function (it) {   // never while that pot still glows, nor within hintCooldown s of the last hint
    if (it.misses < this.cfg.hintAfterMisses) return;
    var b = this.basketById(this.goalOf(it));
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
    if (this.state !== 'round' || this._roundEnded || this.completing) return null;
    var it = this.held ? this.itemById(this.held) : null;
    if (!it) for (var i = 0; i < this.items.length; i++) {
      var c = this.items[i];
      if (c.state === 'idle' || c.state === 'return' || c.state === 'appear') { it = c; break; }
    }
    if (!it) return null;
    var b = this.basketById(this.goalOf(it));
    if (!b) return null;
    if (b._glowT > 0) return b.id;          // already glowing: no repeated event / voice line
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
    it._f.size1 = b.slotSize / (it.scale || 1);   // slotSize is the drawn size; item.size is drawn × scale
    it.state = 'fly'; it.t = 0; it.overPot = it.overNest = false;
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

  P._solved = function () {
    if (this.cur.mode === 'count') return this.baskets[0].count >= this.baskets[0].need;
    for (var i = 0; i < this.items.length; i++) if (this.items[i].state !== 'in') return false;
    return true;
  };

  P._step = function (h) {
    var cfg = this.cfg, i;
    for (i = 0; i < this.items.length; i++) { var o = this.items[i]; o._px = o.x; o._py = o.y; o._prot = o.rot; }
    this.time += h; this.stateTime += h;

    switch (this.state) {
      case 'intro': if (this.stateTime >= cfg.introTime) this._beginRound(); break;
      case 'round':
        if (this.interactive && !this.held && !this.completing) {
          this._idleT += h;
          if (this._idleT >= this._idleGap - 1e-9) {
            this._idleT = 0; this._mood('think');
            this._idleGap = Math.min(cfg.idleMax, this._idleGap * cfg.idleBackoff);   // 12 → 18 → 27 → 30 s
            var pr = this.prompt();
            this._emit({ type: 'idle', promptKey: pr.promptKey, params: pr.params });
          }
        }
        break;
      case 'roundDone':
        if (this.stateTime >= cfg.leaveDelay && this.stateTime - h < cfg.leaveDelay) this._leaveAll();
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
          else { this._setState('sessionDone'); this.items = []; this._emit({ type: 'sessionDone', stars: this.stars }); }
        }
        break;
    }

    var allAppeared = true;
    for (i = 0; i < this.items.length; i++) {
      this._stepItem(this.items[i], h);
      if (this.items[i].state === 'appear') allAppeared = false;
    }
    if (this.state === 'round' && !this.interactive && !this.completing && allAppeared) this.interactive = true;
    if (this.state === 'round' && this.completing) {
      var all = true;
      for (i = 0; i < this.items.length; i++) { var q = this.items[i]; if (q.state === 'in' && !q.bloomed) { all = false; break; } }
      if (all && this.time - this._lastBloomT >= cfg.bloomHold - 1e-9) this._endRound();
    }
    for (i = 0; i < this.baskets.length; i++) this._stepBasket(this.baskets[i], h);
    this._stepLumi(h);
  };

  P._spring = function (it, h) {       // landing / home squash spring (q → 0)
    var w = this.cfg.squashOmega, z = this.cfg.squashZeta;
    it._qv += (-w * w * it._q - 2 * z * w * it._qv) * h;
    it._q += it._qv * h;
    it.sx = 1 + it._q; it.sy = 1 - 1.2 * it._q;
  };

  /* Planting: grow 0→1 over growTime. sink = smoothstep(grow/sinkEnd); stem = critically damped spring toward 1
   * started at grow = sinkEnd; petals = under-damped spring toward 1 started at grow = bloomAt ('bloom' event). */
  P._grow = function (it, h) {
    var cfg = this.cfg;
    if (it.grow < 1) it.grow = Math.min(1, it.grow + h / cfg.growTime);
    it.sink = smooth(it.grow / cfg.sinkEnd);
    if (it.grow >= cfg.sinkEnd) {
      var w = cfg.stemOmega;
      it._stemV += (w * w * (1 - it.stem) - 2 * w * it._stemV) * h;
      it.stem += it._stemV * h;
    }
    if (it.grow >= cfg.bloomAt - 1e-9) {
      if (!it.bloomed) {
        it.bloomed = true; this._lastBloomT = this.time;
        var b = this.basketById(it.basketId);
        if (b) b.blooms++;
        this._emit({ type: 'bloom', id: it.id, basketId: it.basketId, n: b ? b.blooms : 0, need: b && b.need !== null ? b.need : null, flower: it.flower });
      }
      var wp = cfg.petalOmega, z = cfg.petalZeta;
      it._petV += (wp * wp * (1 - it.petals) - 2 * z * wp * it._petV) * h;
      it.petals += it._petV * h;
    }
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
        if (it._wiggles) {
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
          if (it.vy > 0 && u > 0.5) it.overPot = it.overNest = true;
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
        this._grow(it, h);
        this._spring(it, h);
        break;

      case 'leave':
        u = clamp(it.t / cfg.leaveTime, 0, 1);
        if (it._wasIn) { this._grow(it, h); it.appear = 1 - 0.15 * u; }   // flowers fade in place, a little shrink
        else it.appear = 1 - u;                                            // extra / unplanted seeds pop away
        it.alpha = 1 - u;
        this._spring(it, h);
        break;
    }
  };

  P._land = function (it) {
    var cfg = this.cfg, b = this.basketById(it.basketId);
    it.state = 'in'; it.t = 0; it._f = null; it.overPot = it.overNest = true;
    it.planted = true; it.grow = 0; it.sink = 0; it.stem = 0; it._stemV = 0; it.petals = 0; it._petV = 0; it.bloomed = false;
    it._q = cfg.landSquash; it._qv = 0;
    b.count++;
    b.squash = cfg.potSquash; b._sqv = 0;
    this._emit({ type: 'land', id: it.id, basketId: b.id, count: b.count, need: this.cur.mode === 'count' ? b.need : null });
    if (this.state === 'round' && !this._roundEnded && this._solved()) this._complete();
  };

  P._stepBasket = function (b, h) {
    var cfg = this.cfg;
    b.appear = Math.min(1, b.appear + h / cfg.potAppearTime);
    var w = cfg.potOmega, z = cfg.potZeta;
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

  P._stepLumi = function (h) {
    var lm = this.lumi, cfg = this.cfg, L = this.layout;
    if (lm.moodT > 0) { lm.moodT -= h; if (lm.moodT <= 0) { lm.moodT = 0; lm.mood = 'idle'; } }
    var it = this.held ? this.itemById(this.held) : null;
    var lx = it ? it.x : L.play.x + L.play.w / 2, ly = it ? it.y : L.play.y + L.play.h / 2;
    var k = Math.min(1, h * cfg.lookRate);
    lm.lookX += (lx - lm.lookX) * k; lm.lookY += (ly - lm.lookY) * k;
    if (lm._hopT >= 0) {
      lm._hopT += h;
      var n = lm._hopT / cfg.cheerHopTime;
      if (n >= 3) { lm._hopT = -1; lm.hop = 0; }
      else { var ph = n - Math.floor(n); lm.hop = cfg.cheerHopPx * Math.pow(0.7, Math.floor(n)) * 4 * ph * (1 - ph); }   // 3 parabolic hops, each 70 % of the last
    }
  };

  SG.World = World;
})(window.SG = window.SG || {});
