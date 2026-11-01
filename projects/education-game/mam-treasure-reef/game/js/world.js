/* Mầm's Treasure Reef — TR.CONFIG + TR.World (headless, deterministic simulation; DESIGN §2, §5.2)
 *
 * ============================== CONVENTIONS ==============================
 *  Units: logical px (short side = 720), seconds, radians, y DOWN.
 *  update(dt) runs fixed sub-steps of cfg.step (1/120 s) with an accumulator.
 *  At the START of every sub-step each item stores _px,_py,_prot; the renderer
 *  draws  p = _p + (p − _p) · w.alpha   (w.alpha = leftover / step, 0..1).
 *  Result depends only on seed + the sub-step index at which inputs arrive.
 *  Events are pushed to w.events and drained by main (w.drainEvents()).
 *
 *  Session: w.newSession({ lagoon, plan, startLevel }) — plan from TR.Content.planFor (4 chapters {topic, mech, n?}),
 *  w.plan, w.lagoon, w.levels (= topics), w.mech / w.chapter (current chapter), w.pearls (+1 correct, +5 roundDone,
 *  +10 levelDone, +25 sessionDone), w.chapterStars[] (stars per finished chapter).
 *
 *  Drawing an item (renderer contract):
 *    centre (x, y), rotation rot, drawn width = size · scale (scale ≠ 1 only in the size topic: 1.3 / 0.72)
 *    scale  = appear(0..1, back-overshoot) · (1 + (cfg.liftScale−1)·lift) · (sx, sy)
 *    alpha  = item.alpha (fades on 'leave')
 *    states: appear, idle, drag, fly, return, in, leave (drag rounds) + buried, peek, hop (dig rounds)
 *    Items in state 'in' (and 'fly' once item.overChest) go between chest_back and chest_front.
 *    item.settle: after landing a spring 0 → 1 with overshoot (≈ 1.3 peak) — scale the item by
 *    1 + 0.12·(settle − 1) or bounce it by (1 − settle)·8 px for the settle bounce; 'sparkle' event on landing.
 *    The held item is always the LAST element of w.items (grab moves it there).
 *  Drawing a chest (basket): x = centre x, y = opening centre y (= openY), w × h,
 *    sprite rect = [x − w/2, basket.top, w, h] (basket.bottom = top + h).
 *    kind 'chest' (chest_back/front, 256×200; opening centre (128, 54) → y = top + 0.27 h) or
 *    'long' (long_back/front, 512×200, opening line y = top + 0.30 h, N slots = need).
 *    slots[{x, y}]: 'in' items rest at slot (chest: 3 across 66 % of w at y = openY + 0.12 h; long: N across 84 % of w
 *    at y = top + 0.6 h), drawn at slotSize (chest ≤ 0.42 w). squash: scaleX 1+squash, scaleY 1−squash around the
 *    bottom; shake ∈ [−1,1] → x offset shake·cfg.shakePx and rotation shake·0.05 rad; glow 0..1 halo; appear 0..1 pop-in.
 *
 *  DIG MODE (mode 'dig'):  w.mounds[] = { id, x (centre), y (ground contact = mound bottom), w (≈ 130–204),
 *    h (= w·96/160), state 'buried'|'peek'|'open'|'gone', itemId (null for the crab mound), crab, wiggle (−1..1 shake),
 *    puff (0..1, set to 1 on a dig, decays over cfg.moundPuffTime), breathe (0..1 slow), glow (0..1 hint),
 *    open (0..1 how open), appear (0..1), alpha (fades at round end), dance (crab, 0..1 over cfg.crabTime) }.
 *    Mound rect = [x − w/2, y − h, w, h]; mound top = y − h. Every mound keeps its geometry until the round ends
 *    ('gone' too). The tap rect is the mound rect + the peeking item, + cfg.moundPad (24) px all sides.
 *    The WORLD owns item positions: a buried item (state 'buried') sits at x = mound.x,
 *    y = moundTop + drawnSize·(0.5 − cfg.peekFrac) → its top 42 % shows above the mound top; the renderer draws
 *    hole/sand for open/gone mounds, then buried/peek items, then the mound sprite for every buried/peek mound (covering
 *    the lower part of the item), then hop/fly/free items, then chest fronts.
 *    Wrong tap → item 'peek': rises (item.peek 0→1) to y = moundTop − drawnSize·0.55 (fully above), holds, eases back
 *    within cfg.peekTime (1.1 s) → 'buried' again; mound.wiggle shakes.
 *    Correct tap → mound 'open' (+ puff 1), item 'hop' (ballistic rise, apex ≥ cfg.digHopApex = 90 px above the mound
 *    top) then 'fly' (parabola into the chest slot) → 'in'. Crab mound → 'open', event crab {moundId, x, y}, the renderer
 *    animates the crab (mound.dance 0..1), after cfg.crabTime the mound is 'gone'.
 *  Tutu: tutu.hop = px ABOVE the feet anchor (≥ 0); tutu.dance 0..1 during levelDone.
 * ========================================================================
 */
(function (TR) {
  'use strict';

  var CONFIG = {
    // ---- timing / state machine (s)
    step: 1 / 120,             // fixed simulation sub-step (≤ 1/120 per DESIGN)
    maxFrame: 1.0,             // s, largest dt accepted per update() (speed mode passes big dt)
    roundsPerLevel: 4,         // warm-up + 3 real rounds
    chapterTimeLimit: 100,     // s since the chapter began: after ≥ chapterMinRounds rounds, go to Talk time once exceeded
    chapterMinRounds: 3,
    introTime: 1.8,            // chapter banner
    appearTime: 0.45,          // item pop-in (back-overshoot)
    appearStagger: 0.07,       // s between consecutive items popping in
    chestAppearTime: 0.35,     // new chests / mounds pop in
    roundDoneTime: 1.7,        // stars on screen
    leaveDelay: 1.0,           // s into roundDone when the treasures fade away (< roundDoneTime − leaveTime)
    leaveTime: 0.4,            // fade
    landHold: 0.5,             // roundDone 0.5 s after the last landing
    talkAfterAnswer: 1.6,      // talk panel stays after an answer
    levelDoneTime: 2.0,        // Tutu's dance (tutu.dance 0 → 1)
    talkAskTime: 12,           // s without an answer → talkAsk (re-ask), repeating
    talkGlowAfterAsks: 2,      // from this re-ask on, talk.glowAnswer = true (UI glows the right choice)

    // ---- landing settle (item.settle spring 0 → 1, under-damped: peaks ≈ 1.3)
    settleOmega: 16, settleZeta: 0.35,

    // ---- layout (DESIGN §2; px)
    shortSide: 720, minLong: 960, maxLong: 1600,
    groundOffset: 70,          // groundY = H − ins.bottom − 70 (sand line)
    chestMaxW: 230, chestGap: 24, chestSideMargin: 20,
    chestAspect: 0.78,         // h = 0.78 w (chest viewBox 256×200)
    chestBottomDy: 8,          // chest bottom = groundY + 8
    chestOpenFrac: 0.27,       // opening centre y = top + 0.27 h (chest_back (128,54) in 256×200)
    chestSlotSpan: 0.66,       // slots spread over 66 % of the chest width
    chestSlotDy: 0.12,         // slot y = openY + 0.12 h (inside the chest, between back and front)
    chestSlotMax: 0.42,        // slotSize ≤ 0.42 w (3 slots across)
    longSlotY: 0.6,            // long chest: slots at top + 0.6 h
    chestSideMarginPort: 6, chestGapPort: 8,   // portrait: wider chests (4 chests on an iPhone)
    chestMaxWTall: 290,        // tall portrait (H/W > 1.6) with ≤ 3 chests: bigger chests
    tallGroundRaise: 0.25, tallGroundMax: 120,   // tall portrait: groundY rises by min(120, 0.25·(H − 1.6 W)) px
    sizeSmallChest: 0.72,      // size topic: the 'small' chest is 0.72 × the big one (same x, same bottom)
    minAltBand: 240, chestMinWLand: 190,   // landscape: chests shrink (not below 190 px) until the alt band is ≥ 240 px tall
    signScale: 0.55,           // sign width = 0.55 × chest w (sign.svg 128×112)
    tutuX: 105, tutuYLand: 225, tutuYPort: 245, tutuHLand: 175, tutuHPort: 190,
    bubbleDx: 85, bubbleY: 24, bubbleMaxW: 620, bubbleRightGap: 150, bubbleH: 104,
    playMargin: 40, playTopGap: 10,
    playChestGap: 74,          // px between the play band and the chest top: resting items stay OUT of the 120 px drop zone
    playTutuGap: 90, playBubbleGap: 16,   // landscape alternative band: from below the bubble, Tutu's box (±90 px) cut out
    hudW: 140, hudH: 90,       // DOM buttons top-right: x > W−ins.right−140, y < ins.top+90
    minSpacing: 1.1,           // min centre distance = 1.1 × size
    minShrink: 0.75,           // items shrink to ≥ 0.75× before giving up
    shrinkStep: 0.05,
    packJitter: 4,             // px random offset per resting item (spacing includes 2√2·jitter)
    maxRowStretch: 1.7,        // rows spread vertically at most 1.7 × spacing

    // ---- dig layout (DESIGN §2 moundGrid)
    chestDigMaxW: 200, chestDigMinW: 170,   // the single dig chest is smaller (200, down to 170 on short viewports): room for the mound rows
    moundW: 170, moundMinW: 130, moundAspect: 96 / 160,   // mound sprite 160×96
    moundGap: 190,             // nominal anchor spacing (rows hug the chest; rows closer only on short viewports)
    moundRowMin: 150,          // below this row spacing the mound shrinks (iPad landscape with insets ≈ 157)
    moundChestGap: 12,         // bottom row: mound bottom this far above the dig chest top
    digTutuGap: 105,           // landscape: mound columns start right of Tutu (tutu.x + 105)
    moundItemFrac: 0.62,       // drawn item ≤ 0.62 × mound w
    moundPad: 40,              // tap rect = mound rect (+ peeking item) + 40 px all sides (playtest: 3-year-olds tap the sand beside it)
    peekFrac: 0.42,            // visible top fraction of a buried item
    peekAbove: 0.3,            // peek: item centre at moundTop − 0.3 · drawn size (playtest: 0.55 overlapped the mound above)
    peekTime: 1.1, peekRise: 0.18,
    digHopApex: 90, digHopTime: 0.32,
    moundOpenTime: 0.25, moundPuffTime: 0.6, moundWiggleTime: 0.5, moundWiggles: 3,
    moundBreatheMin: 2.5, moundBreatheMax: 3.5,
    crabTime: 1.6,

    // ---- touch (px)
    touchR: 0.6, touchPad: 14, // item radius = 0.6 × size + 14
    chestPadSide: 45,          // drop zone grows 45 px left/right/down
    chestPadUp: 120,           // children release high above the chest
    tapMovePx: 24, tapTime: 1.0,    // finger moved < 24 px and released < 1 s after down → a TAP, not a drop (playtest: toddlers hold pokes 0.4–0.8 s)
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
    slotScale: 0.82,           // item size in the chest = 0.82 × its base size (limited by slot spacing)
    landSquash: 0.15,          // q on landing: sx = 1+q = 1.15, sy = 1−1.2q = 0.82
    squashOmega: 22, squashZeta: 0.3,
    chestSquash: 0.12, chestOmega: 18, chestZeta: 0.25,

    // ---- wrong / miss
    shakeTime: 0.5, shakeWiggles: 3, shakePx: 10,
    wrongReturnTime: 0.55, wrongApex: 45, wobbleAmp: 0.28, wobbleHz: 2.5,
    missReturnTime: 0.5, missApex: 22,
    homeSquash: 0.07,

    // ---- idle life
    bobAmp: 3, bobPeriodMin: 2, bobPeriodMax: 3, bobFadeIn: 0.5,
    wiggleAmp: 0.12, wiggleTime: 0.4, wiggleMin: 4, wiggleMax: 8,

    // ---- help
    hintAfterMisses: 2, hintTime: 5,
    hintCooldown: 6,           // s: no auto-hint within 6 s of the last one, nor while the target still glows
    idleTime: 12,              // s without a grab/tap → idle nudge; the gap then grows ×2 per nudge up to idleMax
    idleBackoff: 2, idleMax: 60,

    // ---- pearls / fun
    pearlCorrect: 1, pearlRound: 5, pearlLevel: 10, pearlSession: 25,
    photobombEvery: 3, photobombMax: 2,

    // ---- Tutu
    moodTime: { happy: 0.9, cheer: 1.6, oops: 0.8, think: 1.4 },
    cheerHopPx: 26, cheerHopTime: 0.4, lookRate: 6,
    // ---- tall portrait phones: item band height ≤ 0.85·W above the chests, items ×1.2 when H/W > 1.6
    portraitPlayMaxFrac: 0.85, portraitItemScale: 1.2, tallAspect: 1.6
  };
  TR.CONFIG = CONFIG;

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

  /** Dig geometry: one smaller chest, the mound size and the 6-anchor grid (priority order: low rows first). */
  function digLayout(W, H, ins, cfg, portrait, tall, groundY, bottom, tutu, bubble, k0) {
    var aw = W - ins.left - ins.right - 2 * (portrait ? cfg.chestSideMarginPort : cfg.chestSideMargin);
    var cwMax = Math.min(cfg.chestDigMaxW, aw - (portrait ? cfg.chestGapPort : cfg.chestGap));
    var cols = portrait ? 2 : 3, rows = portrait ? 3 : 2;
    var x0 = portrait ? ins.left + cfg.playMargin : tutu.x + cfg.digTutuGap, x1 = W - ins.right - cfg.playMargin, dx = (x1 - x0) / cols;
    var yMin0 = portrait ? tutu.y + cfg.playTopGap : bubble.y + bubble.h + cfg.playBubbleGap;
    var mw = Math.min(cfg.moundW * k0, dx - 30), mh, peek, cw = cwMax, ch, top, yMin, yTop, yBot, dy, tries = 0;
    for (;;) {                                      // short viewports: shrink the dig chest first (to chestDigMinW), then the mounds
      mh = mw * cfg.moundAspect; peek = cfg.peekFrac * cfg.moundItemFrac * mw;   // room above the mound top for the poking item
      ch = cfg.chestAspect * cw; top = bottom - ch;
      yMin = portrait ? Math.max(yMin0, top - cfg.portraitPlayMaxFrac * W) : yMin0;   // tall phones: mounds within reach above the chest
      yTop = yMin + peek + mh;                      // top row ground contact (mound bottom)
      yBot = top - cfg.moundChestGap;               // bottom row ground contact
      dy = rows > 1 ? (yBot - yTop) / (rows - 1) : 0;
      if (dy >= cfg.moundRowMin || tries++ > 40) break;
      if (cw > cfg.chestDigMinW) cw = Math.max(cfg.chestDigMinW, cw - 10);
      else if (mw > cfg.moundMinW) mw = Math.max(cfg.moundMinW, mw - 5);
      else break;
    }
    var chest = { x: ins.left + (W - ins.left - ins.right) / 2, w: cw, h: ch, top: top, bottom: bottom, y: top + cfg.chestOpenFrac * ch };
    dy = Math.min(cfg.moundGap, dy);
    var grid = [], r, c, order = [];
    for (r = rows - 1; r >= 0; r--) {               // low rows first; in a row: outer anchors before the middle one
      var idx = []; for (c = 0; c < cols; c++) idx.push(c);
      idx.sort(function (a, b) { return Math.abs(b - (cols - 1) / 2) - Math.abs(a - (cols - 1) / 2) || a - b; });
      for (c = 0; c < cols; c++) order.push([r, idx[c]]);
    }
    for (var i = 0; i < order.length; i++) grid.push({ x: x0 + dx * (order[i][1] + 0.5), y: yBot - (rows - 1 - order[i][0]) * dy, row: order[i][0], col: order[i][1] });
    return { chest: chest, mound: { w: mw, h: mh, peek: peek, dx: dx, dy: dy }, grid: grid, rows: rows, cols: cols };
  }

  function computeLayout(W, H, ins, n, cfg) {
    ins = { top: +(ins && ins.top) || 0, right: +(ins && ins.right) || 0, bottom: +(ins && ins.bottom) || 0, left: +(ins && ins.left) || 0 };
    n = n || 3;
    var portrait = H > W, tall = H / W > cfg.tallAspect;
    var raise = tall ? Math.min(cfg.tallGroundMax, cfg.tallGroundRaise * (H - cfg.tallAspect * W)) : 0;
    var groundY = H - ins.bottom - cfg.groundOffset - raise;
    var margin = portrait ? cfg.chestSideMarginPort : cfg.chestSideMargin, gap = portrait ? cfg.chestGapPort : cfg.chestGap;
    var maxW = tall && n <= 3 ? cfg.chestMaxWTall : cfg.chestMaxW;
    var aw = W - ins.left - ins.right - 2 * margin;
    var pw = Math.min(maxW, aw / n - gap), ph, top, pgap = cfg.playChestGap;
    var bottom = groundY + cfg.chestBottomDy, altTop = ins.top + cfg.bubbleY + cfg.bubbleH + cfg.playBubbleGap;
    for (;;) {
      ph = cfg.chestAspect * pw; top = bottom - ph;
      if (portrait || top - pgap - altTop >= cfg.minAltBand || pw <= cfg.chestMinWLand) break;
      pw = Math.max(cfg.chestMinWLand, pw - 2);      // short landscape (iPad with insets): slightly smaller chests, bigger items
    }
    var py = top + cfg.chestOpenFrac * ph, xs = [];
    for (var i = 0; i < n; i++) xs.push(ins.left + margin + (aw / n) * (i + 0.5));
    var tutu = { x: ins.left + cfg.tutuX, y: ins.top + (portrait ? cfg.tutuYPort : cfg.tutuYLand), h: portrait ? cfg.tutuHPort : cfg.tutuHLand };
    var bx = tutu.x + cfg.bubbleDx;
    var bubble = { x: bx, y: ins.top + cfg.bubbleY, w: Math.min(cfg.bubbleMaxW, W - bx - ins.right - cfg.bubbleRightGap), h: cfg.bubbleH };
    var px = ins.left + cfg.playMargin, pyy = tutu.y + cfg.playTopGap;
    var play = { x: px, y: pyy, w: W - ins.right - cfg.playMargin - px, h: top - pgap - pyy };
    var itemScale = 1;
    if (portrait && play.h > cfg.portraitPlayMaxFrac * W) {   // tall portrait: a band just above the chests (short drags), bigger items
      var bh = cfg.portraitPlayMaxFrac * W;
      play.y = top - pgap - bh; play.h = bh;
      if (tall) itemScale = cfg.portraitItemScale;
    }
    play.itemScale = itemScale;
    var playAlt = null;   // landscape: a taller L-shaped band right of Tutu and below the bubble
    if (!portrait) {
      var ay = bubble.y + bubble.h + cfg.playBubbleGap;
      playAlt = { x: play.x, y: ay, w: play.w, h: top - pgap - ay, itemScale: 1,
        ex: { x: tutu.x - cfg.playTutuGap, y: tutu.y - tutu.h, w: 2 * cfg.playTutuGap, h: tutu.h + cfg.playTopGap } };
      if (playAlt.h <= play.h + 1) playAlt = null;
    }
    var sw = cfg.signScale * pw;
    var chest = { y: py, w: pw, h: ph, xs: xs, n: n, top: top, bottom: bottom,
      sign: { w: sw, h: sw * 112 / 128, bottomY: groundY + 0.5 * (H - groundY) } };   // suggested sign placement (stake bottom)
    var dig = digLayout(W, H, ins, cfg, portrait, tall, groundY, bottom, tutu, bubble, itemScale);
    return {
      W: W, H: H, ins: ins, portrait: portrait, tall: tall, groundY: groundY, playGap: pgap,
      chest: chest, pot: chest, nest: chest,     // old names (same object)
      tutu: tutu, bubble: bubble, play: play, playAlt: playAlt, itemScale: itemScale,
      dig: dig, mound: dig.mound, moundGrid: dig.grid,
      hud: { x: W - ins.right - cfg.hudW, y: 0, w: cfg.hudW + ins.right, h: ins.top + cfg.hudH }
    };
  }

  // ------------------------------------------------------------------ packing
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
    function cut(pts) {
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
    for (i = 0; i < items.length; i++) maxBase = Math.max(maxBase, items[i].baseSize * (items[i].scale || 1) * k0);
    var jit = cfg.packJitter, s = 1, pts = null, ok = true;
    for (s = 1; s > 0.2; s = Math.round((s - cfg.shrinkStep) * 1000) / 1000) {
      var size = maxBase * s, d = cfg.minSpacing * size + 2 * Math.SQRT2 * jit;
      pts = gridPoints(play, size + 2 * jit, d, cfg, items.length);
      if (pts.length >= items.length) break;
      if (s - cfg.shrinkStep < cfg.minShrink - 1e-9) ok = false;
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

  // ------------------------------------------------------------------ chest slots
  /* Chest: one row inside the opening, centre-out fill, spread over chestSlotSpan·w, y = openY + 0.12 h.
   * Long chest: N slots evenly spaced (84 % of the width) at top + 0.6 h, filled LEFT → RIGHT (counting order). */
  function computeSlots(b, cap, baseSize, cfg) {
    cap = Math.max(1, cap);
    var slots = [], k, sxp, s;
    if (b.kind === 'long') {
      sxp = b.w * 0.84 / cap; var x0 = b.x - b.w * 0.42 + sxp / 2;
      s = Math.min(baseSize * cfg.slotScale, sxp, b.h * 0.6);
      for (k = 0; k < cap; k++) slots.push({ x: x0 + k * sxp, y: b.top + cfg.longSlotY * b.h });
    } else {
      sxp = cap > 1 ? b.w * cfg.chestSlotSpan / cap : 0;
      s = Math.min(baseSize * cfg.slotScale, b.w * cfg.chestSlotMax, cap > 1 ? sxp * 1.25 : 1e9);
      var idx = [], mid = (cap - 1) / 2;
      for (k = 0; k < cap; k++) idx.push(k);
      idx.sort(function (a, c) { return Math.abs(a - mid) - Math.abs(c - mid) || a - c; });   // centre-out
      for (k = 0; k < cap; k++) slots.push({ x: b.x + (idx[k] - mid) * sxp, y: b.y + cfg.chestSlotDy * b.h });
    }
    b.slots = slots; b.slotSize = s; b.openY = b.y;
  }

  // ------------------------------------------------------------------ World
  function World(opts) {
    opts = opts || {};
    this.cfg = merge(CONFIG, opts.config);
    this.seed = opts.seed !== undefined ? opts.seed : 1;
    this.rng = new TR.RNG(this.seed);
    this.age = TR.Content.ageOf(opts.age !== undefined ? opts.age : 4);
    this.lang = opts.lang === 'vi' ? 'vi' : 'en';
    this._pendingAge = this.age; this._pendingLang = this.lang;
    this.state = 'menu';
    this.level = 0; this.levels = []; this.plan = []; this.lagoon = 1; this.topic = null; this.mech = 'drag'; this.chapter = null; this.weather = 0;
    this.round = 0; this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.stars = 0; this.levelStars = 0; this.chapterStars = []; this.roundMistakes = 0; this.roundStars = 0; this.pearls = 0;
    this.time = 0; this.stateTime = 0; this.alpha = 0; this._acc = 0;
    this.cur = null; this.baskets = []; this.items = []; this.mounds = []; this.held = null; this.talk = null; this.talkAnswered = null;
    this.queue = []; this.target = null;       // ask mode: chest ids; dig mode: item ids
    this.completing = false;                   // round solved, waiting for the last landing (+ landHold)
    this.finger = { x: 0, y: 0, down: false };
    this.tutu = { mood: 'idle', moodT: 0, lookX: 0, lookY: 0, hop: 0, dance: 0, _hopT: -1 };
    this.events = [];
    this.sessions = 0;
    this.interactive = false;
    this._idleT = 0; this._idleGap = this.cfg.idleTime; this._roundEnded = false; this._vpCount = 0;
    this._lastHintT = -1e9; this.levelStartTime = 0; this._talkAskT = 0; this._talkAsks = 0; this._lastLandT = -1e9;
    this._down = { x: 0, y: 0, t: 0, maxD: 0 }; this._digDown = false;
    this._chapterCorrect = 0; this._photobombs = 0; this._prev = null;
    this.setViewport(opts.width || 1280, opts.height || 720, opts.ins || null);
    this.tutu.lookX = this.layout.play.x + this.layout.play.w / 2; this.tutu.lookY = this.layout.play.y + this.layout.play.h / 2;
  }
  World.logicalSize = logicalSize;
  World.computeLayout = function (W, H, ins, n, cfg) { return computeLayout(W, H, ins, n, merge(CONFIG, cfg)); };
  World.packItems = packItems;
  World.gridPoints = gridPoints;

  var P = World.prototype;
  P._emit = function (e) { this.events.push(e); };
  P.drainEvents = function () { var e = this.events; this.events = []; return e; };
  P.setAge = function (a) { this._pendingAge = TR.Content.ageOf(a); };
  P.setLang = function (l) { this._pendingLang = l === 'vi' ? 'vi' : 'en'; };
  P.itemById = function (id) { for (var i = 0; i < this.items.length; i++) if (this.items[i].id === id) return this.items[i]; return null; };
  P.basketById = function (id) { for (var i = 0; i < this.baskets.length; i++) if (this.baskets[i].id === id) return this.baskets[i]; return null; };
  P.moundById = function (id) { for (var i = 0; i < this.mounds.length; i++) if (this.mounds[i].id === id) return this.mounds[i]; return null; };
  P._setState = function (s) { this.state = s; this.stateTime = 0; };
  P._mood = function (m) { this.tutu.mood = m; this.tutu.moodT = this.cfg.moodTime[m] || 1; if (m === 'cheer') this.tutu._hopT = 0; };
  P.isDig = function () { return !!this.cur && this.cur.mode === 'dig'; };
  /** The chest this item belongs in right now: ask mode → the current target, else its fixed answer. */
  P.goalOf = function (it) { return this.cur && this.cur.mode === 'ask' ? this.target : it.answer; };
  /** Current prompt (ask mode names the current target animal; dig names the current target). */
  P.prompt = function () {
    if (!this.cur) return null;
    if (this.cur.mode === 'ask') {
      var b = this.basketById(this.target);
      return { promptKey: this.cur.promptKey, params: { animal: b ? b.label.value : this.cur.params.animal } };
    }
    if (this.cur.mode === 'dig') return { promptKey: this.cur.promptKey, params: this.cur.need ? { n: this.cur.need } : TR.Content.digParams(this.cur, this.target) };
    return { promptKey: this.cur.promptKey, params: this.cur.params };
  };
  /** Dig: the label of the current target (count: any pearl). */
  P.targetLabel = function () {
    if (!this.isDig()) return null;
    if (this.cur.need) return { type: 'pearl', value: 'pearl' };
    var it = this.itemById(this.target);
    return it ? it.label : null;
  };
  /** Dig: the first buried mound that answers the current target (hint / bot). */
  P.targetMound = function () {
    var lb = this.targetLabel();
    if (!lb) return null;
    if (this.cur.need && this.baskets[0].reserved >= this.baskets[0].need) return null;   // count: enough pearls are on their way
    for (var i = 0; i < this.mounds.length; i++) {
      var m = this.mounds[i];
      if (m.state !== 'buried' || m.crab) continue;
      var it = this.itemById(m.itemId);
      if (it && TR.Content.sameLabel(it.label, lb)) return m;
    }
    return null;
  };

  // ---------------------------------------------------------------- viewport
  P.setViewport = function (W, H, ins) {
    var n = this.isDig() ? 1 : (this.baskets.length || 3);
    this.layout = computeLayout(W, H, ins, n, this.cfg);
    this._vpCount++;
    if (this.cur && this.baskets.length) this._relayoutRound();
  };

  P._relayoutRound = function () {
    var i, it, b, L = this.layout;
    TR.Content.placeBaskets(this.baskets, L, this.cur.mech);
    for (i = 0; i < this.baskets.length; i++) this._slotsFor(this.baskets[i]);
    if (this.isDig()) {
      this.cancelDrag();
      for (i = 0; i < this.mounds.length; i++) this._placeMound(this.mounds[i]);
      for (i = 0; i < this.items.length; i++) {
        it = this.items[i]; b = it.basketId ? this.basketById(it.basketId) : null;
        var m = this.moundById(it.moundId);
        if (it.state === 'buried' || it.state === 'peek' || it.state === 'appear') { this._sizeDigItem(it, m); this._placeBuried(it, m); }
        else if (it.state === 'hop') { it._hop.x0 = m.x; it._hop.y0 = this._buriedY(it, m); this._stepHop(it, 0); it.x = clamp(it.x, 0, L.W); it.y = clamp(it.y, 0, L.H); it._px = it.x; it._py = it.y; }
        else if (it.state === 'fly') { it.x = clamp(it.x, 0, L.W); it.y = clamp(it.y, 0, L.H); this._planFly(it, b, it.vx, it.vy, true); }
        else if (it.state === 'in' || it.state === 'leave') { if (b && it.slot >= 0) { var sl0 = b.slots[it.slot]; it.x = it._px = sl0.x; it.y = it._py = sl0.y; it.size = b.slotSize / (it.scale || 1); } }
      }
      return;
    }
    var resting = [];
    for (i = 0; i < this.items.length; i++) {
      it = this.items[i];
      if (it.state === 'in' || it.state === 'fly' || it.state === 'leave') continue;
      resting.push(it);
    }
    this._pack(resting, (this.cur.seed ^ Math.imul(L.W, 7919) ^ Math.imul(L.H, 104729)) >>> 0);
    for (i = 0; i < this.items.length; i++) {
      it = this.items[i];
      b = it.basketId ? this.basketById(it.basketId) : null;
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

  /** Packs resting items into layout.play, or into layout.playAlt (landscape) when that keeps them bigger. */
  P._pack = function (items, seed) {
    var L = this.layout, cfg = this.cfg, pr = packItems(items, L.play, new TR.RNG(seed), cfg), rect = L.play, i;
    if (pr.shrink < 1 && L.playAlt && items.length) {
      var keep = items.map(function (it) { return [it.homeX, it.homeY, it.size]; });
      var pa = packItems(items, L.playAlt, new TR.RNG(seed), cfg);
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
    if (mode === 'count' || (mode === 'dig' && this.cur.need)) cap = b.need;
    else if (mode === 'dig') cap = this.cur.queue.length;
    computeSlots(b, Math.max(1, cap), base || 116, this.cfg);
  };

  // ---------------------------------------------------------------- mounds (dig)
  P._placeMound = function (m) {
    var L = this.layout, g = L.moundGrid, p = g[Math.min(m.slot, g.length - 1)];
    m.x = p.x; m.y = p.y; m.w = L.mound.w; m.h = L.mound.h;
  };
  P._sizeDigItem = function (it, m) {
    var drawn = Math.min(it.baseSize * (it.scale || 1) * (this.layout.itemScale || 1), this.cfg.moundItemFrac * m.w);
    it.size = drawn / (it.scale || 1);
  };
  P._buriedY = function (it, m) { return m.y - m.h + it.size * (it.scale || 1) * (0.5 - this.cfg.peekFrac); };
  P._peekY = function (it, m) { return m.y - m.h - it.size * (it.scale || 1) * this.cfg.peekAbove; };
  P._placeBuried = function (it, m) { it.x = it._px = m.x; it.y = it._py = this._buriedY(it, m); };
  /** Mound whose padded rect (mound + peeking item + 24 px) contains the point; nearest centre wins. */
  P.moundAt = function (px, py) {
    var cfg = this.cfg, best = null, bd = 1e9;
    for (var i = 0; i < this.mounds.length; i++) {
      var m = this.mounds[i], top = m.y - m.h;
      var it = m.itemId ? this.itemById(m.itemId) : null;
      if (it && (it.state === 'buried' || it.state === 'peek')) top = Math.min(top, it.y - it.size * (it.scale || 1) / 2);
      if (px < m.x - m.w / 2 - cfg.moundPad || px > m.x + m.w / 2 + cfg.moundPad) continue;
      if (py < top - cfg.moundPad || py > m.y + cfg.moundPad) continue;
      var d = hyp(px - m.x, py - (m.y - m.h / 2));
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  };

  P.tapMound = function (id) {
    if (this.state !== 'round' || !this.isDig() || !this.interactive || this._roundEnded || this.completing) return false;
    var m = this.moundById(id), cfg = this.cfg;
    if (!m || m.state !== 'buried') return false;
    this._idleT = 0; this._idleGap = cfg.idleTime;
    if (m.crab) {
      m.state = 'open'; m._openT = 0; m.puff = 1; m._crabT = 0;
      this._mood('happy');
      this._emit({ type: 'crab', moundId: m.id, x: m.x, y: m.y });
      return true;
    }
    var it = this.itemById(m.itemId), b = this.baskets[0], lb = this.targetLabel();
    if (this.cur.need && b.reserved >= b.need) return false;      // count: the last pearl is still in the air — a free tap, no penalty
    var ok = it && lb && TR.Content.sameLabel(it.label, lb);
    this._emit({ type: 'dig', moundId: m.id, itemId: it.id, correct: !!ok });
    if (ok) {
      m.state = 'open'; m._openT = 0; m.puff = 1;
      var qi = this.queue.indexOf(it.id);
      if (qi >= 0) this.queue.splice(qi, 1); else this.queue.shift();     // a look-alike stands in for the asked one
      this.target = this.queue.length ? this.queue[0] : null;
      it.slot = b.reserved++; it.basketId = b.id;
      var y0 = this._buriedY(it, m);
      it.state = 'hop'; it.t = 0; it._hop = { x0: m.x, y0: y0, A: cfg.digHopApex + (y0 - (m.y - m.h)), dir: this.rng.sign() };   // apex 90 px above the mound top
      this._mood('happy');
      this._emit({ type: 'correct', id: it.id, basketId: b.id, moundId: m.id, nameKind: it.nameKind, nameValue: it.nameValue, label: it.label });
      this._addPearls(cfg.pearlCorrect);
      this._countCorrect();
      if (this.target && !this.cur.need) {
        this.cur.params = TR.Content.digParams(this.cur, this.target);
        this._emit({ type: 'next', itemId: this.target, promptKey: this.cur.promptKey, params: this.cur.params });
      }
    } else {
      m.state = 'peek'; m._wigT = 0;
      it.state = 'peek'; it.t = 0; it.peek = 0; it.misses++;
      this.roundMistakes++;
      this._mood('oops');
      this._emit({ type: 'wrong', moundId: m.id, itemId: it.id, id: it.id, nameKind: it.nameKind, nameValue: it.nameValue, misses: this.roundMistakes, target: this.target });
      if (this.roundMistakes >= cfg.hintAfterMisses) this._autoHintDig();
    }
    return true;
  };

  P._autoHintDig = function () {
    var m = this.targetMound();
    if (!m || m._glowT > 0 || this.time - this._lastHintT < this.cfg.hintCooldown) return;
    this._glowMound(m);
  };
  P._glowMound = function (m) {
    m._glowT = this.cfg.hintTime;
    this._lastHintT = this.time;
    this._mood('think');
    this._emit({ type: 'hint', moundId: m.id, basketId: null });
    return m.id;
  };

  P._stepMound = function (m, h) {
    var cfg = this.cfg;
    m.appear = Math.min(1, m.appear + h / cfg.chestAppearTime);
    m.breathe = 0.5 + 0.5 * Math.sin(m._bph + TAU * this.time / m._bper);
    if (m.puff > 0) m.puff = Math.max(0, m.puff - h / cfg.moundPuffTime);
    if (m._wigT >= 0) {
      m._wigT += h;
      var u = m._wigT / cfg.moundWiggleTime;
      if (u >= 1) { m._wigT = -1; m.wiggle = 0; }
      else m.wiggle = Math.sin(TAU * cfg.moundWiggles * u) * Math.pow(1 - u, 1.5);
    }
    if (m.state === 'open' || m.state === 'gone') { m._openT += h; m.open = smooth(m._openT / cfg.moundOpenTime); }
    if (m.crab && m.state === 'open') {
      m._crabT += h; m.dance = clamp(m._crabT / cfg.crabTime, 0, 1);
      if (m._crabT >= cfg.crabTime) m.state = 'gone';
    }
    if (m._glowT > 0) m._glowT = Math.max(0, m._glowT - h);
    m.glow = clamp(m._glowT / 0.4, 0, 1);
    if (m._leave) m.alpha = Math.max(0, m.alpha - h / cfg.leaveTime);
  };

  // ---------------------------------------------------------------- session flow
  P.newSession = function (o) {
    o = o || {};
    this.age = this._pendingAge; this.lang = this._pendingLang;
    this.sessions++;
    this.lagoon = Math.max(1, Math.min(6, Math.round(+o.lagoon || 1)));
    this.plan = (o.plan || TR.Content.planFor(this.age, this.lagoon)).map(function (c) { return { topic: c.topic, mech: c.mech === 'dig' ? 'dig' : 'drag', n: c.n, range: c.range }; });
    this.levels = this.plan.map(function (c) { return c.topic; });
    this.stars = 0; this.pearls = 0; this.chapterStars = []; this._prev = null;
    this._emit({ type: 'session', levels: this.levels.slice(), lagoon: this.lagoon, plan: this.plan.map(function (c) { return { topic: c.topic, mech: c.mech }; }) });
    this.startLevel(o.startLevel || 0);
  };

  P.startLevel = function (i) {
    if (!this.plan.length) { this.plan = TR.Content.planFor(this.age, this.lagoon); this.levels = this.plan.map(function (c) { return c.topic; }); }
    this.level = clamp(i | 0, 0, this.plan.length - 1);
    this.chapter = this.plan[this.level];
    this.topic = this.chapter.topic; this.mech = this.chapter.mech;
    this.weather = this.level;
    this.round = 0; this.levelStars = 0; this.levelStartTime = this.time; this._prev = null;
    this._chapterCorrect = 0; this._photobombs = 0;
    this.items = []; this.baskets = []; this.mounds = []; this.cur = null; this.held = null; this.talk = null; this.talkAnswered = null;
    this.queue = []; this.target = null; this.completing = false; this._digDown = false;
    this.interactive = false; this.tutu.dance = 0;
    this._setState('intro');
    this._emit({ type: 'level', level: this.level, topic: this.topic, mech: this.mech });
  };

  P._beginRound = function () {
    var cfg = this.cfg, i, dig = this.mech === 'dig';
    var n = dig ? 1 : (this.chapter && this.chapter.n) || TR.Content.chestsFor(this.topic, this.age);
    var prevN = this.baskets.length, prevKind = this.baskets.length ? this.baskets[0].kind : null;
    this.layout = computeLayout(this.layout.W, this.layout.H, this.layout.ins, n, cfg);
    var rseed = (this.rng.next() * 4294967296) >>> 0;
    var rr = new TR.RNG(rseed);
    var cur = TR.Content.makeRound(this.topic, { age: this.age, lang: this.lang, rng: rr, roundIndex: this.round, layout: this.layout, mech: this.mech,
      n: this.chapter && this.chapter.n, range: this.chapter && this.chapter.range, prev: this._prev });
    this.cur = cur;
    this._prev = { sig: cur.sig, n: cur.params && cur.params.n !== undefined ? cur.params.n : (cur.need || null), color: cur.params ? cur.params.color : null };
    this.roundMistakes = 0; this.held = null; this._idleT = 0; this._idleGap = cfg.idleTime; this._roundEnded = false; this.interactive = false;
    this.completing = false; this._lastLandT = -1e9; this._digDown = false;
    var keep = prevN === cur.baskets.length && prevKind === cur.baskets[0].kind && cur.mode !== 'count' && !cur.need;
    this.baskets = cur.baskets.map(function (b) {
      return { id: b.id, label: b.label, kind: b.kind, need: b.need !== undefined ? b.need : null, count: 0, reserved: 0,
        x: b.x, y: b.y, w: b.w, h: b.h, top: b.top, bottom: b.bottom, openY: b.y,
        squash: 0, _sqv: 0, shake: 0, _shakeT: -1, glow: 0, _glowT: 0,
        appear: keep ? 1 : 0, slots: [], slotSize: 0 };
    });
    this.items = cur.items.map(function (s, k) {
      return { id: s.id, sprite: s.sprite, shape: s.shape, color: s.color, text: s.text, scale: s.scale, gem: s.gem, label: s.label || null,
        baseSize: s.size, size: s.size, nameKind: s.nameKind, nameValue: s.nameValue, answer: s.answer,
        x: 0, y: 0, rot: 0, vx: 0, vy: 0, vr: 0, sx: 1, sy: 1, _q: 0, _qv: 0, lift: 0, alpha: 1,
        state: 'appear', t: -k * cfg.appearStagger, appear: 0, homeX: 0, homeY: 0, basketId: null, slot: -1, misses: 0,
        overChest: false, overPot: false, _appeared: false, _px: 0, _py: 0, _prot: 0,
        settle: 1, _setV: 0, peek: 0, moundId: null, _hop: null,
        _bobPh: rr.float(0, TAU), _bobP: rr.float(cfg.bobPeriodMin, cfg.bobPeriodMax), _bobW: 1,
        _wigT: rr.float(cfg.wiggleMin, cfg.wiggleMax), _wigU: -1, _wiggles: !!(s.sprite && s.sprite.indexOf('shell_') === 0),
        _f: null, _offX: 0, _offY: 0, _retKind: null };
    });
    this.queue = cur.queue ? cur.queue.slice() : [];
    this.target = cur.mode === 'ask' || cur.mode === 'dig' ? this.queue[0] : null;
    for (i = 0; i < this.baskets.length; i++) this._slotsFor(this.baskets[i]);
    if (dig) {
      var self = this;
      this.mounds = cur.mounds.map(function (m) {
        var mm = { id: m.id, slot: m.slot, x: 0, y: 0, w: 0, h: 0, state: 'buried', itemId: m.item ? m.item.id : null, crab: !!m.crab,
          wiggle: 0, puff: 0, breathe: 0.5, glow: 0, open: 0, appear: 0, alpha: 1, dance: 0,
          _wigT: -1, _openT: 0, _crabT: 0, _glowT: 0, _bph: rr.float(0, TAU), _bper: rr.float(cfg.moundBreatheMin, cfg.moundBreatheMax), _leave: false };
        self._placeMound(mm);
        return mm;
      });
      for (i = 0; i < this.mounds.length; i++) {
        var md = this.mounds[i];
        if (!md.itemId) continue;
        var di = this.itemById(md.itemId);
        di.moundId = md.id; this._sizeDigItem(di, md); this._placeBuried(di, md);
        di.homeX = di.x; di.homeY = di.y;
      }
      this.playRect = this.layout.play; this.packShrink = 1; this.packOk = true;
    } else {
      this.mounds = [];
      this._pack(this.items, cur.seed);
      for (i = 0; i < this.items.length; i++) { var it = this.items[i]; it.x = it._px = it.homeX; it.y = it._py = it.homeY; }
    }
    this._setState('round');
    this._emit({ type: 'round', round: this.round, topic: this.topic, mech: this.mech, mode: cur.mode, promptKey: cur.promptKey, params: cur.params, need: cur.need || null });
    if (cur.mode === 'ask') this._emitAsk();
  };

  P._emitAsk = function () {
    var b = this.basketById(this.target);
    if (!b) return;
    this.cur.params = { animal: b.label.value };
    this._emit({ type: 'ask', basketId: b.id, label: b.label, promptKey: this.cur.promptKey, params: { animal: b.label.value } });
  };

  P._addPearls = function (n) {
    if (!(n > 0)) return;
    this.pearls += n;
    this._emit({ type: 'pearl', n: n, total: this.pearls });
  };
  /** Every 3rd correct of a chapter → photobomb {dir, y} (≤ 2 per chapter). */
  P._countCorrect = function () {
    var cfg = this.cfg;
    this._chapterCorrect++;
    if (this._chapterCorrect % cfg.photobombEvery === 0 && this._photobombs < cfg.photobombMax) {
      this._photobombs++;
      this._emit({ type: 'photobomb', dir: this.rng.sign(), y: this.rng.float(0.15, 0.6) });
    }
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
    if (this.cur.mode === 'count' || this.cur.need) { ev.count = this.baskets[0].need; ev.need = this.baskets[0].need; }   // Tutu says "N! Great!"
    this._emit(ev);
    this._addPearls(this.cfg.pearlRound);
  };

  /** Round solved: no more input; count mode fades the extra pearls; roundDone follows the last landing + landHold. */
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

  P._leaveAll = function () {     // treasures (and anything left) fade away in place; mounds fade too
    for (var i = 0; i < this.items.length; i++) {
      var it = this.items[i];
      if (it.state === 'leave') continue;
      it._wasIn = it.state === 'in';
      it.state = 'leave'; it.t = 0; it.vx = 0; it.vy = 0; it.vr = 0;
    }
    for (i = 0; i < this.mounds.length; i++) this.mounds[i]._leave = true;
  };

  P._startTalk = function () {
    var rr = new TR.RNG((this.rng.next() * 4294967296) >>> 0);
    this.talk = TR.Content.makeTalk(this.topic, { age: this.age, lang: this.lang, rng: rr });
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
    this.chapterStars[this.level] = this.levelStars;
    this._setState('levelDone');
    this._mood('cheer');
    this._emit({ type: 'levelDone', level: this.level, stars: this.levelStars, mech: this.mech });
    this._addPearls(this.cfg.pearlLevel);
  };

  // ---------------------------------------------------------------- input
  P._canGrab = function (it) { return it.state === 'idle' || it.state === 'return'; };

  P.pointerDown = function (x, y) {
    this.finger.x = x; this.finger.y = y; this.finger.down = true;
    if (this.state !== 'round' || this.held || this._roundEnded || this.completing) return null;
    var cfg = this.cfg;
    this._down.x = x; this._down.y = y; this._down.t = this.time; this._down.maxD = 0;
    this._idleT = 0;                                              // any touch counts as activity (no nudges while hammering the sand)
    if (this.isDig()) { this._digDown = true; return null; }     // dig mode: a tap is judged on release (no drag)
    var best = null, bestD = 1e9;
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
    this._emit({ type: 'grab', id: best.id, nameKind: best.nameKind, nameValue: best.nameValue });
    return best.id;
  };
  P.pointerMove = function (x, y) {
    this.finger.x = x; this.finger.y = y;
    if (this.held || this._digDown) this._down.maxD = Math.max(this._down.maxD, hyp(x - this._down.x, y - this._down.y));
  };
  P.pointerUp = function (x, y) {
    if (x !== undefined) { this.finger.x = x; this.finger.y = y; }
    this.finger.down = false;
    var cfg = this.cfg, d = Math.max(this._down.maxD, hyp(this.finger.x - this._down.x, this.finger.y - this._down.y));
    if (this._digDown) {
      this._digDown = false;
      if (d < cfg.tapMovePx) { var m = this.moundAt(this._down.x, this._down.y); if (m) this.tapMound(m.id); }   // a moved finger does nothing
      return;
    }
    if (!this.held) return;
    var it = this.itemById(this.held);
    this.held = null;
    if (!it || it.state !== 'drag') return;
    if (d < cfg.tapMovePx && this.time - this._down.t < cfg.tapTime) {
      // tap guard: a quick tap is "what is this?", never a drop — no drop/miss/wrong/hint, no misses++
      this._planReturn(it, 'tap');
      this._emit({ type: 'tap', id: it.id, nameKind: it.nameKind, nameValue: it.nameValue });
      return;
    }
    this._drop(it, this.finger.x, this.finger.y);
  };
  P.cancelDrag = function () {
    this.finger.down = false; this._digDown = false;
    if (!this.held) return;
    var it = this.itemById(this.held);
    this.held = null;
    if (it && it.state === 'drag') this._planReturn(it, 'miss');
  };

  /** Chest whose (generous) drop zone contains the point; nearest centre wins where zones overlap. */
  P.chestAt = function (px, py) {
    var cfg = this.cfg, best = null, bd = 1e9;
    for (var i = 0; i < this.baskets.length; i++) {
      var b = this.baskets[i];
      if (px < b.x - b.w / 2 - cfg.chestPadSide || px > b.x + b.w / 2 + cfg.chestPadSide) continue;
      if (py < b.top - cfg.chestPadUp || py > b.bottom + cfg.chestPadSide) continue;
      var d = Math.abs(px - b.x);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  };
  P.potAt = P.nestAt = P.chestAt;   // old names

  P._drop = function (it, fx, fy) {
    // the finger's chest wins (a fast flick leaves the item lagging over a neighbour); the item centre catches 'beside' drops
    var b = this.chestAt(fx, fy) || this.chestAt(it.x, it.y), mode = this.cur.mode;
    if (b && mode === 'count' && b.reserved >= b.need) {      // long chest already full (last pearl in the air)
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
      this._addPearls(this.cfg.pearlCorrect);
      this._countCorrect();
      if (mode === 'ask') {
        this.queue.shift();
        this.target = this.queue.length ? this.queue[0] : null;
        if (this.target) this._emitAsk();
      }
    } else {
      it.misses++; this.roundMistakes++;
      b._shakeT = 0;
      this._mood('oops');
      this._emit({ type: 'wrong', id: it.id, basketId: b.id, misses: it.misses, target: goal, nameKind: it.nameKind, nameValue: it.nameValue });
      this._planReturn(it, 'wrong');
      this._autoHint(it);
    }
  };

  P._autoHint = function (it) {   // never while that chest still glows, nor within hintCooldown s of the last hint
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
  /** Glows the target: drag → the chest of the held (or first idle) item; dig → the target mound. */
  P.hint = function () {
    if (this.state !== 'round' || this._roundEnded || this.completing) return null;
    if (this.isDig()) {
      var m = this.targetMound();
      if (!m) return null;
      if (m._glowT > 0) return m.id;
      return this._glowMound(m);
    }
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
   * apex H px above the higher end:  p(τ) = p0 + v0·τ + ½·a·τ². */
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
    it.state = 'fly'; it.t = 0; it.overChest = it.overPot = false;
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
    if (this.cur.mode === 'count' || (this.cur.mode === 'dig' && this.cur.need)) return this.baskets[0].count >= this.baskets[0].need;
    if (this.cur.mode === 'dig') {
      if (this.queue.length) return false;
      for (var k = 0; k < this.items.length; k++) { var s = this.items[k].state; if (s === 'hop' || s === 'fly') return false; }
      return true;
    }
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
            this._idleGap = Math.min(cfg.idleMax, this._idleGap * cfg.idleBackoff);   // 12 → 24 → 48 → 60 s
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
        this.tutu.dance = clamp(this.stateTime / cfg.levelDoneTime, 0, 1);
        if (this.stateTime >= cfg.levelDoneTime) {
          this.tutu.dance = 0;
          if (this.level < this.plan.length - 1) this.startLevel(this.level + 1);
          else {
            this._setState('sessionDone'); this.items = []; this.mounds = [];
            this._addPearls(cfg.pearlSession);
            this._emit({ type: 'sessionDone', stars: this.stars, lagoon: this.lagoon, levelStars: this.chapterStars.slice(), pearls: this.pearls });
          }
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
      for (i = 0; i < this.items.length; i++) { var q = this.items[i].state; if (q === 'fly' || q === 'hop') { all = false; break; } }
      if (all && this.time - this._lastLandT >= cfg.landHold - 1e-9) this._endRound();
    }
    for (i = 0; i < this.baskets.length; i++) this._stepBasket(this.baskets[i], h);
    for (i = 0; i < this.mounds.length; i++) this._stepMound(this.mounds[i], h);
    this._stepTutu(h);
  };

  P._spring = function (it, h) {       // landing / home squash spring (q → 0)
    var w = this.cfg.squashOmega, z = this.cfg.squashZeta;
    it._qv += (-w * w * it._q - 2 * z * w * it._qv) * h;
    it._q += it._qv * h;
    it.sx = 1 + it._q; it.sy = 1 - 1.2 * it._q;
    if (it.settle < 1 || Math.abs(it._setV) > 1e-6) {   // settle bounce: under-damped spring 0 → 1 (overshoot ≈ 1.3)
      var ws = this.cfg.settleOmega, zs = this.cfg.settleZeta;
      it._setV += (ws * ws * (1 - it.settle) - 2 * zs * ws * it._setV) * h;
      it.settle += it._setV * h;
      if (Math.abs(it.settle - 1) < 1e-4 && Math.abs(it._setV) < 1e-3) { it.settle = 1; it._setV = 0; }
    }
  };

  P._stepHop = function (it, h) {
    var cfg = this.cfg, hp = it._hop;
    it.t += h;
    var u = clamp(it.t / cfg.digHopTime, 0, 1), v = 1 - (1 - u) * (1 - u);   // decelerating rise
    it.x = hp.x0; it.y = hp.y0 - hp.A * v;
    it.rot = 0.25 * hp.dir * Math.sin(Math.PI * u);
    it.vx = 0; it.vy = -2 * hp.A * (1 - u) / cfg.digHopTime;
    return u >= 1;
  };

  P._stepItem = function (it, h) {
    var cfg = this.cfg, f, u, m;
    switch (it.state) {
      case 'appear':
        it.t += h;
        if (it.t >= 0 && !it._appeared) { it._appeared = true; this._emit({ type: 'appear', id: it.id }); }
        u = clamp(it.t / cfg.appearTime, 0, 1);
        it.appear = it.t <= 0 ? 0 : easeOutBack(u);
        it.x = it.homeX; it.y = it.homeY;
        if (u >= 1) { it.appear = 1; it.state = it.moundId ? 'buried' : 'idle'; it.t = 0; it._bobW = 0; }
        break;

      case 'buried':
        m = this.moundById(it.moundId);
        if (m) { it.x = m.x; it.y = this._buriedY(it, m); }
        it.rot = 0; it.vx = it.vy = 0; it.peek = 0;
        this._spring(it, h);
        break;

      case 'peek': {
        it.t += h;
        m = this.moundById(it.moundId);
        var r = cfg.peekRise;
        it.peek = smooth(it.t / r) * smooth((cfg.peekTime - it.t) / r);
        if (m) { it.x = m.x; it.y = this._buriedY(it, m) + (this._peekY(it, m) - this._buriedY(it, m)) * it.peek; }
        it.rot = 0.08 * (m ? m.wiggle : 0);
        if (it.t >= cfg.peekTime) { it.state = 'buried'; it.t = 0; it.peek = 0; if (m && m.state === 'peek') m.state = 'buried'; }
        this._spring(it, h);
        break;
      }

      case 'hop':
        if (this._stepHop(it, h)) {
          var b = this.basketById(it.basketId);
          it.rot = 0; this._planFly(it, b, 0, 0, false);
        }
        this._spring(it, h);
        break;

      case 'idle': {
        it.t += h;
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
        it.t += h;
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
        it.t += h;
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
          if (it.vy > 0 && u > 0.5) it.overChest = it.overPot = true;
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
        it.t += h;
        this._spring(it, h);
        break;

      case 'leave':
        it.t += h;
        u = clamp(it.t / cfg.leaveTime, 0, 1);
        it.appear = it._wasIn ? 1 - 0.15 * u : 1 - u;      // landed treasures fade in place with a little shrink; extras pop away
        it.alpha = 1 - u;
        this._spring(it, h);
        break;
    }
  };

  P._land = function (it) {
    var cfg = this.cfg, b = this.basketById(it.basketId);
    it.state = 'in'; it.t = 0; it._f = null; it.overChest = it.overPot = true;
    it._q = cfg.landSquash; it._qv = 0;
    it.settle = 0; it._setV = 0;
    b.count++;
    b.squash = cfg.chestSquash; b._sqv = 0;
    this._lastLandT = this.time;
    var counting = this.cur.mode === 'count' || !!this.cur.need;
    this._emit({ type: 'land', id: it.id, basketId: b.id, count: b.count, need: counting ? b.need : null });
    this._emit({ type: 'sparkle', id: it.id, basketId: b.id, x: it.x, y: it.y, gem: it.gem });
    if (counting) this._emit({ type: 'count', n: b.count, need: b.need });
    if (this.state === 'round' && !this._roundEnded && this._solved()) this._complete();
  };

  P._stepBasket = function (b, h) {
    var cfg = this.cfg;
    b.appear = Math.min(1, b.appear + h / cfg.chestAppearTime);
    var w = cfg.chestOmega, z = cfg.chestZeta;
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

  P._stepTutu = function (h) {
    var tu = this.tutu, cfg = this.cfg, L = this.layout;
    if (tu.moodT > 0) { tu.moodT -= h; if (tu.moodT <= 0) { tu.moodT = 0; tu.mood = 'idle'; } }
    var it = this.held ? this.itemById(this.held) : null;
    if (!it && this.isDig()) for (var i = 0; i < this.items.length; i++) { var s = this.items[i].state; if (s === 'hop' || s === 'fly' || s === 'peek') { it = this.items[i]; break; } }
    var lx = it ? it.x : L.play.x + L.play.w / 2, ly = it ? it.y : L.play.y + L.play.h / 2;
    var k = Math.min(1, h * cfg.lookRate);
    tu.lookX += (lx - tu.lookX) * k; tu.lookY += (ly - tu.lookY) * k;
    if (tu._hopT >= 0) {
      tu._hopT += h;
      var n = tu._hopT / cfg.cheerHopTime;
      if (n >= 3) { tu._hopT = -1; tu.hop = 0; }
      else { var ph = n - Math.floor(n); tu.hop = cfg.cheerHopPx * Math.pow(0.7, Math.floor(n)) * 4 * ph * (1 - ph); }   // 3 parabolic hops, each 70 % of the last
    }
  };

  TR.World = World;
})(window.TR = window.TR || {});
