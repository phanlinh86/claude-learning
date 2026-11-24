/* Lolo's Jungle Leaf Match — LL.CONFIG + LL.World (headless, deterministic memory game on the big leaves of a jungle tree;
 * DESIGN §1, §2, §6.2; docs/MECHANICS.md is the exact API / renderer contract)
 *
 * ============================== CONVENTIONS ==============================
 *  Units: logical px (short side = 720), seconds, radians, y DOWN. rot > 0 = clockwise (canvas).
 *  update(dt) runs fixed sub-steps of cfg.step (1/120 s) with an accumulator. At the START of every sub-step every moving
 *  value stores its previous value in its `_p…` partner; the renderer draws v = _v + (v − _v)·w.alpha.
 *  The result depends only on the seed and the sub-step at which inputs arrive.
 *
 *  Leaf c (w.cards[], state down | up | matched; matched leaves STAY, lit):
 *    centre (x, y), size w × h (= the grid size). c.open 0 top side … 1 turned over (≤ cfg.openMax 1.12 while it overshoots);
 *    c.flip = clamp(open, 0, 1); c.light 0..1 sunbeam glow (after a match); c.bloom 0..≈1.2 orchid on the stem (spring);
 *    c.bounce ≥ 0 px the face hops UP; c.wiggle rad face rotation (mismatch "no-no"); c.glow 0..1 hint halo.
 *    c.px, c.py = pivot (the stem top on the row vine), c.stem = px from the pivot to the leaf top, c.swing rad = pendulum
 *    angle about the pivot (+ = clockwise). During phase 'scroll' the NEW tree is drawn offset by w.buildingDx.
 *  Tree: w.building = { bark, barkDark, moss, leaf, leafDark, vine, vineDark, flower, kind, seed }, layout.grid.building =
 *    rect + branch band + row vines (rows[]), door always null.
 *  Lolo: w.lolo { mood, moodT, hop, lean, armA, armExt, armLen, lookX/Y, blink, tail, squash, flipRot, hang, vine, dx, … }.
 *  Critter: w.critter (surprise round) { type toucan | frog | butterfly, x, y, … }. w.traffic is always [].
 * ========================================================================
 */
(function (LL) {
  'use strict';

  var CONFIG = {
    // ---- timing / state machine (s)
    step: 1 / 120,             // fixed simulation sub-step
    maxFrame: 1.0,             // largest dt accepted per update() (speed mode passes big dt)
    roundsPerLevel: 4,         // rounds (trees) per chapter (warm-up + 3)
    chapterTimeLimit: 75,      // s since the chapter began: after ≥ chapterMinRounds rounds go to Talk time once exceeded (skill rule)
    chapterMinRounds: 3,
    introTime: 2.5,            // chapter banner + weather line + the 2.5 s weather crossfade
    matchCelebrate: 0.7,       // s after the LAST pair's check → the tree cheers
    cheerTime: 1.2,            // 'cheer' phase — leaves sway in a wave, petals, Lolo backflips
    cheerWave: 0.06,           // s between the leaves' cheer kicks (slot order)
    roundDoneTime: 0.8,        // stars + Lolo's short praise, then the vine swing / scroll
    scrollTime: 1.6,           // the camera pans one screen width, smooth-step (a layout may need up to scrollTimeMax)
    scrollTimeMax: 1.9,
    scrollSettle: 0.15,        // s after the new tree is in place → peek
    talkAfterAnswer: 2.0,
    levelDoneTime: 2.0,
    talkAskTime: 12,
    talkGlowAfterAsks: 2,

    // ---- content tuning (playtest-tuned)
    pairsByAge: { 3: [2, 2, 2, 3], 4: [2, 2, 3, 3], 5: [2, 3, 4, 4], 6: [3, 3, 4, 5], 7: [3, 4, 4, 5] },
    peekByAge: { 3: 2.8, 4: 2.2, 5: 2.0, 6: 1.5, 7: 1.5 },
    peekPerCard: true,         // × (0.6 + 0.1·leaves)

    // ---- surprise round
    surpriseRound: 2,
    surpriseTypes: ['toucan', 'frog', 'butterfly'],
    surpriseDelay: [3, 5],     // s after play starts (QA: later, so the child has settled into the round)
    adaptHold: true, adaptSlowPlay: 40,

    // ---- layout (DESIGN §2; px)
    shortSide: 720, minLong: 960, maxLong: 1600,
    groundOffset: 90,          // groundY = H − ins.bottom − 90 (top of the jungle floor)
    loloDxLand: 110, loloDyLand: 10, loloHLand: 150,   // Lolo's feet / seat anchor + body height, landscape
    loloDxPort: 100, loloDyPort: 12, loloHPort: 140,   // portrait (iPad: ≈ 150 CSS px already)
    loloDxTall: 120, loloHTall: 170,   // tall portrait phones (H/W > 1.6): QA — 140 was only ≈ 76 CSS px on an iPhone
    loloBoxW: 1.25, loloBoxH: 1.15,   // keep-out / hit box = 1.25·h × 1.15·h above the feet, centred on x
    loloKeep: 16,              // no leaf within 16 px of loloRect
    bodyFeet: [128, 244], bodySocket: [128, 118], bodyShoulder: [152, 136], bodyTail: [84, 220], bodyBox: 256,
    hangHand: [128, 18], hangTail: [84, 200],
    headJoint: [96, 172], headBoxSvg: 192, headK: 0.6,   // head svg: 0.6·h square, joint at (96, 172)/192 on the socket
    bubbleX: 24, bubbleY: 20, bubbleMaxW: 640, bubbleRightGap: 160, bubbleH: 122,
    bubbleHPort: 124, bubbleGapPort: 24,
    hudW: 160, hudH: 96,
    boardTopGap: 24,           // board (tree incl. its top pad) starts 24 px below the bubble
    boardGroundGap: 14,        // leaves end ≥ 14 px above groundY
    boardLoloGapLand: 130,     // landscape: board x ≥ lolo.x + 130 (leaves ≥ pad further: ≥ 62 px right of loloRect)
    boardSide: 24,
    boardLoloTopGap: 46,       // portrait board A (above Lolo): bottom ≤ loloRect top − 46 (16 keep-out + 30 hop room)
    boardLoloSideGap: 40,      // portrait board B (right of Lolo): x ≥ loloRect right + 40

    // ---- leaves / grid / tree
    cardAspect: 0.78,          // leaf w : h
    gapFrac: 0.16, gapMin: 18, // gap x = max(18, 0.16·cw)
    gapYFrac: 0.26, gapYMin: 30,   // gap y = max(30, 0.26·cw): a vine and a stem live in it
    padFrac: 0.32, padMin: 36, // tree around the grid: pad = max(36, 0.32·cw) sides + top — the trunks live in it (QA: trunk width ≤ pad)
    roofFrac: 0.34,            // branch band above the tree rect = 0.34·cw
    vineFrac: 0.62,            // row vine at rowTop − 0.62·gapY (its lowest point); stems ≥ 0.62·gapY
    vineSag: 0.06, vineSagMaxK: 0.28,   // vine sag = min(0.06·length, 0.28·gapY); the ends are `sag` higher
    vineOver: 0.35,            // the row vine runs 0.35·pad past the outer leaves into the trunks
    cardMin: { 3: 120, 4: 120, 5: 104, 6: 104, 7: 104 },
    maxEmpty: 2, gridSizeTol: 0.08, gridFillW: 0.5, gridBalanceW: 0.5, gridEmptyW: 0.02,
    cardMax: 210,
    hitPad: 10,
    sameTapHint: 3,
    thirdTapAfter: 0.5,
    yellowLoloGap: 40,

    // ---- leaf flip (DESIGN §6.2): spring on c.open towards 1 (turned over) / 0
    openOmega: 14, openZeta: 0.45,   // DESIGN ω 12 reaches 0.95 only after 0.225 s; ω 14 → 0.19 s (DESIGN: ≤ 0.2 s) — MECHANICS D2
    openMax: 1.12, openStopBounce: 0.3,
    clackBounce: 0.25, clackMinV: 4, clackStopV: 0.6,
    peekStagger: 0.05,
    playAtHide: 0.5,
    // ---- leaf pendulum (swing about the stem top)
    swingOmega: 4.2, swingZeta: 0.12, swingMax: 0.14,
    swingKick: 0.6,            // rad/s per flip / turn-back (DESIGN 0.9: a single kick would hit the 0.14 clamp; see MECHANICS D3)
    swingKickHint: 0.35,       // the hint lift
    swingKickWave: 0.3,        // the peek / hide waves (every leaf at once: smaller, so none hits the clamp at play start)
    swingCheer: 0.55,          // cheer wave kick (same sign for all: a wave)
    swingWind: 0.0667,         // breeze torque: rad/s² per px/s of max(|w.wind|, swingBreezeMin) × (0.3 + 0.7·sin(2π·0.31·t + φ))
    swingBreezeMin: 9,         // → a visible ≈ 0.06 rad peak-to-peak sway even at night, ≤ ≈ 0.07 rad at a 16 px/s gust (never the clamp by itself)
    swingBreezeHz: 0.31,
    // ---- match / mismatch
    matchAt: 0.95, matchHold: 0.25, matchResolveTime: 0.4, lightTime: 0.4,
    bloomOmega: 14, bloomZeta: 0.45, bloomDelay: [0.05, 0.2], bloomStemK: 0.3,   // the orchid sits 0.3·stem above the leaf top
    bounceG: 2000, bouncePx: 12, matchHops: 2, cheerHopPx: 10,
    mismatchShow: 1.6, mismatchShowByAge: { 3: 1.8 },   // QA: the mismatch line names the 2nd leaf ≈ 1.5 s in
    shakeAmp: 0.08, shakeWiggles: 3, shakeTime: 0.5,
    fastReset: true,

    // ---- help
    hintAfterStreak: 2, hintCooldown: 6, hintGlowTime: 6,
    hintPeekDelay: 0.2, hintPeekHold: 0.45, hintPeekOpen: 0.3,
    idleTime: 12, idleBackoff: 1.5, idleMax: 30, idleHintFrom: 2,

    // ---- Lolo
    moodTime: { happy: 0.9, cheer: 1.6, oops: 0.8, think: 1.4 },
    hopPx: { happy: 14, cheer: 26 }, hopTime: 0.4, lookRate: 6, lookHold: 3,
    leanOmega: 8, leanZeta: 0.5, leanMax: 0.16, leanDx: 120,
    armOmega: 10, armZeta: 0.5, armRest: 1.0, armRestK: 0.3, armMaxK: 0.55, armLeafKeep: 4,
    tailRate: 1.6, tailRateHappy: 3.6,
    blinkEvery: [2.5, 5], blinkTime: 0.12,
    squashOmega: 16, squashZeta: 0.35, squashLand: 0.15,
    flipG: 1143, flipJump: 70, flipDelay: 0.1,     // backflip: 70 px ballistic jump (airtime 0.7 s), −2π
    // ---- vine swing during the scroll (real pendulum + ballistic arcs)
    swingG: 980, swingDamp: 0.15, leapDelay: 0.1, leapTime: 0.2, vineAbove: 30, handToFeetK: (244 - 18) / 256,
    hangBottomK: (256 - 18) / 256, hangHalfWK: 0.36, swingDegs: [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60],

    // ---- critters (surprise round)
    toucanSize: 72, toucanFly: 1.4, toucanAway: 1.2, toucanMove: [8, 14], toucanBob: [1.2, 2.8], toucanFlapHz: 7,
    frogSize: 70, frogDy: 52, frogHopLen: [60, 80], frogApex: 34, frogEvery: [0.6, 0.9], frogG: 980, frogStop: 2.5,
    frogCroakEvery: 0.8, frogBigApex: 120,
    critterCore: 0.6,          // a turnable leaf under the finger wins unless the finger is in the middle 60 % of the toucan / butterfly box
    frogStopGap: 40,           // the frog stops ≥ 40 px right of loloRect (never on the log / at her feet)
    flySize: 60, flyRise: 45, flySwayPx: 26, flySwayHz: 0.5, flyFlapHz: 9, flyAway: 380
  };
  LL.CONFIG = CONFIG;

  // tree palettes (DESIGN §3)
  var LEAVES = [['#3E9A5E', '#286B40'], ['#3A9488', '#23645B'], ['#7AA845', '#52762A'], ['#4F8F3C', '#33622A']];
  var BARKS = [['#8A6A4E', '#5E4532'], ['#7D7266', '#544B42'], ['#8E5E4A', '#5E3C2F']];
  var FLOWERS = ['#E3C6F0', '#FFF7FB', '#F7C9D6'];
  var KINDS = ['kapok', 'fig', 'palm'];
  var MOSS = '#8DBA6A', VINE = '#6E8F3A', VINE_DARK = '#46612A';

  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hyp(x, y) { return Math.sqrt(x * x + y * y); }
  function smooth(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  function merge(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; if (b) for (k in b) o[k] = b[k]; return o; }
  function inflate(R, m) { return { x: R.x - m, y: R.y - m, w: R.w + 2 * m, h: R.h + 2 * m }; }
  function overlapArea(a, b) {
    var w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
  }
  function rectGap(a, b) {
    var dx = Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w)), dy = Math.max(0, a.y - (b.y + b.h), b.y - (a.y + a.h));
    return hyp(dx, dy);
  }
  function inRect(x, y, R) { return !!R && x >= R.x && x <= R.x + R.w && y >= R.y && y <= R.y + R.h; }
  /** Damped spring step (semi-implicit Euler) on o[k] with velocity o[kv] towards target. */
  function spring(o, k, kv, target, w, z, h) { o[kv] += (w * w * (target - o[k]) - 2 * z * w * o[kv]) * h; o[k] += o[kv] * h; }

  /** DESIGN §2 short-side rule: CSS viewport → logical W×H. */
  function logicalSize(cssW, cssH, cfg) {
    cfg = cfg || CONFIG;
    var S = cfg.shortSide, aspect = cssW / Math.max(1, cssH);
    if (cssW >= cssH) return { W: clamp(Math.round(S * aspect), cfg.minLong, cfg.maxLong), H: S };
    return { W: S, H: clamp(Math.round(S / aspect), cfg.minLong, cfg.maxLong) };
  }

  /** The row vine's y at x: a quadratic sag, ends (x0, ye) / (x1, ye), lowest point y at the middle. */
  function vineY(row, x) {
    var u = clamp((x - row.x0) / Math.max(1e-9, row.x1 - row.x0), 0, 1);
    return row.ye + 4 * row.sag * u * (1 - u);
  }

  // ------------------------------------------------------------------ Lolo geometry
  function loloGeometry(L, cfg) {
    var g = L.lolo, h = g.h, B = cfg.bodyBox;
    L.loloRect = { x: g.x - cfg.loloBoxW * h / 2, y: g.y - cfg.loloBoxH * h, w: cfg.loloBoxW * h, h: cfg.loloBoxH * h };
    L.loloSocket = { x: g.x + (cfg.bodySocket[0] - cfg.bodyFeet[0]) / B * h, y: g.y + (cfg.bodySocket[1] - cfg.bodyFeet[1]) / B * h };
    L.loloShoulder = { x: g.x + (cfg.bodyShoulder[0] - cfg.bodyFeet[0]) / B * h, y: g.y + (cfg.bodyShoulder[1] - cfg.bodyFeet[1]) / B * h };
    L.loloTail = { x: g.x + (cfg.bodyTail[0] - cfg.bodyFeet[0]) / B * h, y: g.y + (cfg.bodyTail[1] - cfg.bodyFeet[1]) / B * h };
    L.loloRoom = 200;           // free px above loloRect (set per grid)
  }
  /** Head box from the body pose (socket rotated by lean about the feet, lifted by hop): 0.6·h square, joint on the socket. */
  function headBox(L, cfg, lean, hop) {
    var g = L.lolo, h = g.h, sx = L.loloSocket.x - g.x, sy = L.loloSocket.y - g.y, c = Math.cos(lean), s = Math.sin(lean);
    var jx = g.x + c * sx - s * sy, jy = g.y - hop + s * sx + c * sy, S = cfg.headK * h;
    return { x: jx - cfg.headJoint[0] / cfg.headBoxSvg * S, y: jy - cfg.headJoint[1] / cfg.headBoxSvg * S, w: S, h: S, jx: jx, jy: jy };
  }

  function computeLayout(W, H, ins, cfg) {
    ins = { top: +(ins && ins.top) || 0, right: +(ins && ins.right) || 0, bottom: +(ins && ins.bottom) || 0, left: +(ins && ins.left) || 0 };
    var portrait = H > W, tall = H / W > 1.6;
    var groundY = H - ins.bottom - cfg.groundOffset;
    var lolo = portrait ? (tall ? { x: ins.left + cfg.loloDxTall, y: groundY + cfg.loloDyPort, h: cfg.loloHTall }
      : { x: ins.left + cfg.loloDxPort, y: groundY + cfg.loloDyPort, h: cfg.loloHPort })
      : { x: ins.left + cfg.loloDxLand, y: groundY + cfg.loloDyLand, h: cfg.loloHLand };
    var L = { W: W, H: H, ins: ins, portrait: portrait, tall: tall, groundY: groundY, lolo: lolo };
    loloGeometry(L, cfg);
    var GR = L.loloRect;
    var bx = ins.left + cfg.bubbleX;
    var bubble = portrait
      ? { x: bx, y: ins.top + cfg.hudH + cfg.bubbleGapPort, w: Math.min(cfg.bubbleMaxW, W - bx - ins.right - cfg.bubbleX), h: cfg.bubbleHPort }
      : { x: bx, y: ins.top + cfg.bubbleY, w: Math.min(cfg.bubbleMaxW, W - bx - ins.right - cfg.bubbleRightGap), h: cfg.bubbleH };
    var hud = { x: W - ins.right - cfg.hudW, y: 0, w: cfg.hudW + ins.right, h: ins.top + cfg.hudH };
    var top = bubble.y + bubble.h + cfg.boardTopGap, bottom = groundY - cfg.boardGroundGap, boards;
    if (!portrait) {
      var lx = lolo.x + cfg.boardLoloGapLand;
      boards = [{ x: lx, y: top, w: W - ins.right - cfg.boardSide - lx, h: bottom - top }];
    } else {
      var ax = ins.left + cfg.boardSide, bxx = GR.x + GR.w + cfg.boardLoloSideGap;
      boards = [
        { x: ax, y: top, w: W - ins.right - cfg.boardSide - ax, h: GR.y - cfg.boardLoloTopGap - top },   // A: above Lolo
        { x: bxx, y: top, w: W - ins.right - cfg.boardSide - bxx, h: bottom - top },                      // B: right of Lolo
        { x: ax, y: top, w: W - ins.right - cfg.boardSide - ax, h: bottom - top, lolo: true }             // C: full; the last row's
      ];                                                                                                     // empty slots over Lolo
    }
    boards.forEach(function (b) { b.w = Math.max(0, b.w); b.h = Math.max(0, b.h); });
    L.bubble = bubble; L.hud = hud; L.boards = boards; L.board = boards[0];
    L.safe = { x: ins.left, y: ins.top, w: W - ins.left - ins.right, h: H - ins.top - ins.bottom };
    L.floor = { y0: groundY, y1: H, frogY: groundY + cfg.frogDy };
    L.road = { y0: groundY + 40, y1: H };      // old name
    L.grid = null;
    L.dee = lolo; L.deeRect = GR;               // old names
    return L;
  }

  /* ------------------------------------------------------------------ grid + tree
   * Every cols × rows with ≤ maxEmpty (2) empty slots in the last row (centred, ≥ 2 leaves), on every board. The tree (grid +
   * pad on the sides and the top) must fit the board. Among the layouts whose leaf is within gridSizeTol (8 %) of the largest,
   * the best score = size/largest + gridFillW·fill − gridBalanceW·offset − gridEmptyW·empty wins (fill = the tree's share of
   * the play area, offset = |board centre − screen centre| / W); ties → squarer, board A, more columns / rows. */
  function gapOf(cw, cfg) { return Math.max(cfg.gapMin, cfg.gapFrac * cw); }
  function gapYOf(cw, cfg) { return Math.max(cfg.gapYMin, cfg.gapYFrac * cw); }
  function padOf(cw, cfg) { return Math.max(cfg.padMin, cfg.padFrac * cw); }
  /** Board C (portrait, full height): rows above Lolo end ≥ boardLoloTopGap above loloRect, the last row is right-aligned and
   * its leftmost leaf keeps loloKeep + 0.15·ch (swing) right of loloRect. Returns the largest cw (0 when none fits). */
  function fitCardC(L, b, cols, rows, lastN, cfg) {
    if (rows < 2 || lastN >= cols) return 0;
    var a = cfg.cardAspect, R = L.loloRect, lo = 0, hi = Math.max(1, b.w / cols);
    function okY(cw) {
      var ch = cw / a, g = gapOf(cw, cfg), gy = gapYOf(cw, cfg), p = padOf(cw, cfg);
      return cols * cw + (cols - 1) * g + 2 * p <= b.w + 1e-9 && rows * ch + (rows - 1) * gy + p <= b.h + 1e-9 &&
        b.y + p + (rows - 1) * ch + (rows - 2) * gy <= R.y - cfg.boardLoloTopGap + 1e-9;
    }
    function okX(cw) {
      var ch = cw / a, g = gapOf(cw, cfg), p = padOf(cw, cfg), gw = cols * cw + (cols - 1) * g;
      var x0 = b.x + (b.w - gw - 2 * p) / 2 + p;
      return x0 + (cols - lastN) * (cw + g) >= R.x + R.w + cfg.loloKeep + 0.15 * ch - 1e-9;
    }
    if (!okY(1e-6)) return 0;
    for (var i = 0; i < 44; i++) { var m = (lo + hi) / 2; if (okY(m)) lo = m; else hi = m; }
    var cw = Math.min(lo, cfg.cardMax);
    while (cw >= 40 && !okX(cw)) cw -= 1;
    return cw >= 40 ? cw : 0;
  }
  function fitCard(b, cols, rows, cfg) {
    var a = cfg.cardAspect, lo = 0, hi = Math.max(1, b.w / cols);
    function ok(cw) {
      var g = gapOf(cw, cfg), gy = gapYOf(cw, cfg), p = padOf(cw, cfg);
      return cols * cw + (cols - 1) * g + 2 * p <= b.w + 1e-9 && rows * cw / a + (rows - 1) * gy + p <= b.h + 1e-9;
    }
    if (!ok(lo + 1e-6)) return 0;
    for (var i = 0; i < 44; i++) { var m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; }
    return lo;
  }
  function chooseGrid(L, n, age, cfg) {
    // candidates: every board × cols × rows with ≤ maxEmpty empty slots, the last row holding ≥ 2 leaves (or full)
    var cands = [], top = 0, bi, cols;
    for (bi = 0; bi < L.boards.length; bi++) {
      var b = L.boards[bi];
      for (cols = 1; cols <= n; cols++) {
        var rows = Math.ceil(n / cols), empty = cols * rows - n, lastN = n - (rows - 1) * cols;
        if (empty > cfg.maxEmpty || (empty > 0 && lastN < 2 && !b.lolo)) continue;   // board C: one leaf in the corner is fine
        var raw = b.lolo ? fitCardC(L, b, cols, rows, lastN, cfg) : fitCard(b, cols, rows, cfg), sc = Math.min(raw, cfg.cardMax);
        if (!(sc > 0)) continue;
        cands.push({ sc: sc, raw: raw, cols: cols, rows: rows, bi: bi, empty: empty });
        top = Math.max(top, sc);
      }
    }
    // the largest leaf wins — but among layouts within gridSizeTol of it, prefer the one that fills the play area best and
    // sits horizontally balanced on the screen (QA: a 2×5 column right of Lolo left 36 % of an iPhone empty)
    var minW = cfg.cardMin[age] || cfg.cardMin[5], S = L.safe, areaTop = L.boards[0].y, areaH = Math.max(1, L.groundY - areaTop);
    var best = null;
    for (var k = 0; k < cands.length; k++) {
      var q = cands[k];
      if (q.sc < top * (1 - cfg.gridSizeTol) - 1e-9 || (top >= minW && q.sc < minW - 1e-9)) continue;
      var gw = q.cols * q.sc + (q.cols - 1) * gapOf(q.sc, cfg) + 2 * padOf(q.sc, cfg);
      var gh = q.rows * q.sc / cfg.cardAspect + (q.rows - 1) * gapYOf(q.sc, cfg) + padOf(q.sc, cfg);
      var bb = L.boards[q.bi], cx = bb.x + bb.w / 2;
      var fill = Math.min(1, gw / S.w) * Math.min(1, gh / areaH), off = Math.abs(cx - (S.x + S.w / 2)) / S.w;
      q.score = q.sc / top + cfg.gridFillW * fill - cfg.gridBalanceW * off - cfg.gridEmptyW * q.empty;
      var better = !best || q.score > best.score + 1e-6;
      if (!better && Math.abs(q.score - best.score) <= 1e-6) {
        var sq = Math.abs(q.cols - q.rows) - Math.abs(best.cols - best.rows);
        if (sq !== 0) better = sq < 0; else if (q.bi !== best.bi) better = q.bi < best.bi;
        else better = (L.portrait ? q.rows - best.rows : q.cols - best.cols) > 0;
      }
      if (better) best = q;
    }
    var B = L.boards[best.bi], cw = best.sc, ch = cw / cfg.cardAspect, gap = gapOf(cw, cfg), gapY = gapYOf(cw, cfg), pad = padOf(cw, cfg);
    var gw = best.cols * cw + (best.cols - 1) * gap, gh = best.rows * ch + (best.rows - 1) * gapY;
    var x0 = B.x + (B.w - gw - 2 * pad) / 2 + pad, y0 = B.y + (B.h - gh - pad) / 2 + pad, slots = [];
    if (B.lolo) y0 = Math.min(y0, L.loloRect.y - cfg.boardLoloTopGap - (best.rows - 1) * ch - (best.rows - 2) * gapY);
    for (var k = 0; k < n; k++) {
      var r = Math.floor(k / best.cols), c = k % best.cols, inRow = Math.min(best.cols, n - r * best.cols);
      var off = (best.cols - inRow) * (cw + gap) * (B.lolo ? 1 : 0.5);      // board C: the last row right-aligned
      slots.push({ x: x0 + off + c * (cw + gap) + cw / 2, y: y0 + r * (ch + gapY) + ch / 2, row: r });
    }
    var g = { cols: best.cols, rows: best.rows, cw: cw, ch: ch, gap: gap, gapX: gap, gapY: gapY, pad: pad, x0: x0, y0: y0, n: n, slots: slots,
      boardIndex: best.bi, board: B, rect: { x: x0, y: y0, w: gw, h: gh }, minOk: cw >= (cfg.cardMin[age] || cfg.cardMin[5]) - 1e-9 };
    g.building = treeRect(L, g, cfg);
    // stems: every slot hangs from its row vine
    for (k = 0; k < n; k++) {
      var s = slots[k], row = g.building.rows[s.row];
      s.py = vineY(row, s.x); s.px = s.x; s.stem = s.y - ch / 2 - s.py;
    }
    return g;
  }
  /** Tree rect around the grid down to the floor + branch band + the row vines; no door. */
  function treeRect(L, g, cfg) {
    var R = g.rect, p = g.pad, ground = L.groundY + 4, rows = [];
    for (var r = 0; r < g.rows; r++) {
      var top = g.y0 + r * (g.ch + g.gapY), y = top - cfg.vineFrac * g.gapY;
      var x0 = R.x - cfg.vineOver * p, x1 = R.x + R.w + cfg.vineOver * p;
      if (g.board.lolo && r === g.rows - 1) {   // board C: the short last row's vine starts at its first leaf (not over Lolo)
        var first = g.slots[(g.rows - 1) * g.cols]; x0 = first.x - g.cw / 2 - cfg.vineOver * p;
      }
      var sag = Math.min(cfg.vineSag * (x1 - x0), cfg.vineSagMaxK * g.gapY);
      rows.push({ y: y, ye: y - sag, x0: x0, x1: x1, sag: sag, top: top });
    }
    return { x: R.x - p, y: R.y - p, w: R.w + 2 * p, h: ground - (R.y - p), roofH: cfg.roofFrac * g.cw, pad: p, rows: rows,
      door: null, doorX: null, doorW: null };
  }
  /** Free px above loloRect before the keep-out of a leaf that overlaps her horizontally (for hops / the backflip). */
  function loloRoom(L, g, cfg) {
    var R = L.loloRect, room = 200;
    if (g) for (var i = 0; i < g.slots.length; i++) {
      var s = g.slots[i], lx = s.x - g.cw / 2 - cfg.loloKeep, rx = s.x + g.cw / 2 + cfg.loloKeep;
      if (rx <= R.x || lx >= R.x + R.w) continue;
      var bot = s.y + g.ch / 2 + cfg.loloKeep;
      if (bot <= R.y + 1e-6) room = Math.min(room, R.y - bot);
    }
    return Math.max(0, room);
  }

  // ------------------------------------------------------------------ vine swing plan
  /* Lolo's trip from the old log to the new one while the camera pans W in T s (world x = screen x at the scroll start;
   * camera = W·smooth(t / T)). leap: ballistic for leapTime with its apex at the grab point G = the bottom of a liana hanging
   * from a pivot vineAbove px above the screen top (so the grab is tangential) → pendulum (g, small damping) until the release
   * angle → ballistic flight → lands with her hand at the seat height, world x = lolo.x + W. The release angle and the leap
   * speed are searched so the landing is exact and the whole trip stays on screen (hand ≥ ins.top + hudH, body bottom ≤
   * groundY + 24, |x − edge| ≥ hangHalfW·h), landing before T − 0.1 s; the widest release angle that fits wins (scroll time
   * grows in 0.05 s steps up to scrollTimeMax only when nothing fits). Samples per sub-step. */
  function planSwing(L, cfg, T0) {
    var h = cfg.step, g = cfg.swingG, lo = L.lolo, H = lo.h, W = L.W, ins = L.ins;
    var ax = lo.x, ay = lo.y - cfg.handToFeetK * H, tl = cfg.leapTime, n0 = Math.round(cfg.leapDelay / h);
    var topY = ins.top + cfg.hudH, botY = L.groundY + 24 - cfg.hangBottomK * H;
    var xMin = ins.left + cfg.hangHalfWK * H, xMax = W - ins.right - cfg.hangHalfWK * H;
    function sim(vx, thR, T, keep) {
      var nl = Math.round(tl / h), vy0 = -g * nl * h;   // apex exactly after nl steps of the integrator
      var x = ax, y = ay, vy = vy0, i, S = keep ? { x: [], y: [], a: [], ph: [], vth: [] } : null, n = 0, ok = true, ang = 0, av = 0;
      function push(px, py, a, ph, vt) {
        var t = (n0 + n) * h, cam = W * smooth(t / T), sx = px - cam;
        if (py < topY - 1e-6 || py > botY + 1e-6 || sx < xMin - 1e-6 || sx > xMax + 1e-6) ok = false;
        if (S) { S.x.push(sx); S.y.push(py); S.a.push(a); S.ph.push(ph); S.vth.push(vt || 0); }
        n++;
      }
      // leap (semi-implicit Euler: v then x)
      for (i = 0; i < nl; i++) { vy += g * h; x += vx * h; y += vy * h; push(x, y, 0, 0); }
      var Gx = x, Gy = y, Py = -cfg.vineAbove, Lv = Gy - Py;
      if (Lv < 40) return null;
      var th = 0, om = vx / Lv, nGrab = n;
      for (i = 0; i < 4000; i++) {
        om += (-(g / Lv) * Math.sin(th) - cfg.swingDamp * om) * h; th += om * h;
        if (om <= 0) return { short: true };
        push(Gx + Lv * Math.sin(th), Py + Lv * Math.cos(th), -th, 1, om);
        if (th >= thR) break;
      }
      var nRel = n;
      x = Gx + Lv * Math.sin(th); y = Py + Lv * Math.cos(th);
      var fvx = Lv * om * Math.cos(th), fvy = -Lv * om * Math.sin(th);
      ang = -th; av = -om;
      for (i = 0; i < 4000; i++) {
        var px0 = x, py0 = y;
        fvy += g * h; x += fvx * h; y += fvy * h;
        // she rights herself in the air (spring to upright)
        av += (-64 * ang - 2 * 0.8 * 8 * av) * h; ang += av * h;
        if (fvy > 0 && y >= ay) {
          var u = (ay - py0) / (y - py0), lx = px0 + (x - px0) * u;
          if (S) push(lx, ay, 0, 2); else n++;
          return { landX: lx, nGrab: nGrab, nRel: nRel, nLand: n, Gx: Gx, Py: Py, Lv: Lv, thR: thR, omR: om, vx: vx, S: S, ok: ok,
            tLand: (n0 + n) * h };
        }
        push(x, y, ang, 2);
      }
      return null;
    }
    var T = T0, best = null;
    for (; T <= cfg.scrollTimeMax + 1e-9 && !best; T += 0.05) {
      for (var di = 0; di < cfg.swingDegs.length; di++) {
        var thR = cfg.swingDegs[di] * Math.PI / 180, a = 100, b = 4000, r = null;
        for (var it = 0; it < 40; it++) {
          var m = (a + b) / 2, q = sim(m, thR, T, false);
          if (!q || q.short || q.landX < ax + W) a = m; else b = m;
        }
        r = sim(b, thR, T, false);
        if (!r || r.short || !r.ok || r.tLand > T - 0.1 || Math.abs(r.landX - (ax + W)) > 0.5) continue;
        // the widest swing on the vine that fits (the shortest scroll time first)
        if (!best || thR > best.thR) best = { vx: b, thR: thR, T: T };
      }
      if (best) break;
    }
    if (!best) { T = cfg.scrollTimeMax; best = { vx: 0, thR: 0, T: T, none: true }; return { none: true, T: T }; }
    var P = sim(best.vx, best.thR, best.T, true);
    P.T = best.T; P.n0 = n0; P.ax = ax; P.ay = ay; P.Gy = P.S.y[P.nGrab - 1];
    return P;
  }

  // ------------------------------------------------------------------ World
  function World(opts) {
    opts = opts || {};
    this.cfg = merge(CONFIG, opts.config);
    this.seed = opts.seed !== undefined ? opts.seed : 1;
    this.rng = new LL.RNG(this.seed);                                  // content / hints (the game's own stream)
    this.arng = new LL.RNG(((this.seed >>> 0) ^ 0xA5A5F00D) >>> 0);    // ambient: trees, critters, blinks
    this.age = LL.Content.ageOf(opts.age !== undefined ? opts.age : 4);
    this.lang = opts.lang === 'vi' ? 'vi' : 'en';
    this._pendingAge = this.age; this._pendingLang = this.lang;
    this.state = 'menu'; this.phase = null;
    this.level = 0; this.levels = []; this.topic = null; this.weather = 0;
    this.round = 0; this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.stars = 0; this.levelStars = 0; this.roundStars = 0;
    this.mismatches = 0; this.streak = 0; this.found = 0; this.pairs = 0;
    this.time = 0; this.stateTime = 0; this.phaseTime = 0; this.alpha = 0; this._acc = 0;
    this.cur = null; this.cards = []; this.rewards = []; this.collected = []; this.open = [];
    this.talk = null; this.talkAnswered = null;
    this.held = null; this.pairsHeld = false; this.wind = 0; this.hudKeep = opts.hudKeep || null; this.lastTopics = null; this.lastTopics2 = null;
    this.surprise = null; this._surpriseOff = 0; this._sameN = 0; this._hard = false; this._lastPairs = 0; this._playStart = 0;
    this.building = null; this.prevBuilding = null; this.lastBuilding = null;
    this.scroll = 0; this.scrollT = 1; this._pscroll = 0; this._pscrollT = 1; this._scroll0 = 0; this.buildingDx = 0; this.prevDx = 0;
    this.scrollTime = this.cfg.scrollTime; this._plan = null; this._planKey = '';
    this.critter = null; this._critterAt = -1; this.traffic = [];
    this.cheer = 0;
    this.finger = { x: 0, y: 0, down: false };
    this.lolo = { mood: 'idle', moodT: 0, lookX: 0, lookY: 0, hop: 0, _phop: 0, _hopT: -1, _hopPx: 0, _hopN: 0,
      lean: 0, _plean: 0, _vlean: 0, armA: this.cfg.armRest, _parmA: this.cfg.armRest, _varmA: 0, armExt: 0, _parmExt: 0, _varmExt: 0,
      armLen: 0, _parmLen: 0, shX: 0, shY: 0, blink: 0, _blinkT: 3, _blinkOn: 0, tail: 0, _ptail: 0,
      squash: 0, _psquash: 0, _vsquash: 0, flipRot: 0, _pflipRot: 0, _flipT: -1, _flipJ: 0, _flipV: 0, _flipDelay: -1,
      hang: false, vine: null, dx: 0, _pdx: 0, _landed: true, tx: 0, ty: 0, walking: false, walk: 0 };
    this.events = []; this.sessions = 0; this.interactive = false; this.solved = false;
    this._mis = null; this._anims = []; this._idleN = 0; this._idleT = 0; this._idleGap = this.cfg.idleTime; this._doneT = -1;
    this._lastHintT = -1e9; this.levelStartTime = 0; this._talkAskT = 0; this._talkAsks = 0; this._hist = [];
    this._lookId = null; this._lookT = -1e9; this._holdT = -1; this._lastTapId = null; this._gridVer = 0;
    this.setViewport(opts.width || 1280, opts.height || 720, opts.ins || null);
    var Lb = this.layout.board;
    this.lolo.lookX = Lb.x + Lb.w / 2; this.lolo.lookY = Lb.y + Lb.h / 2;
    this._stepArm(0);
    this.lolo._parmLen = this.lolo.armLen;
  }
  World.logicalSize = logicalSize;
  World.computeLayout = function (W, H, ins, cfg) { return computeLayout(W, H, ins, merge(CONFIG, cfg)); };
  World.chooseGrid = function (L, n, age, cfg) { return chooseGrid(L, n, LL.Content.ageOf(age || 4), merge(CONFIG, cfg)); };
  World.planSwing = function (L, cfg, T) { var c = merge(CONFIG, cfg); return planSwing(L, c, T || c.scrollTime); };
  World.vineY = vineY;
  World.rectGap = rectGap; World.overlapArea = overlapArea;
  World.LEAVES = LEAVES; World.BARKS = BARKS; World.FLOWERS = FLOWERS; World.KINDS = KINDS;
  /** Lolo's head box (from the body pose; alpha given → interpolated): { x, y, w, h, jx, jy } (jx, jy = the neck socket). */
  World.loloHead = function (w, alpha) {
    var g = w.lolo, a = alpha === undefined ? 1 : alpha;
    return headBox(w.layout, w.cfg, g._plean + (g.lean - g._plean) * a, g._phop + (g.hop - g._phop) * a);
  };
  /** Axis-aligned bounds of leaf c rotated by its swing about its pivot (logical px, at its slot). */
  World.leafBounds = function (c, swing) {
    var a = swing === undefined ? c.swing : swing, cs = Math.cos(a), sn = Math.sin(a), xs = [], ys = [];
    [[-c.w / 2, -c.h / 2], [c.w / 2, -c.h / 2], [-c.w / 2, c.h / 2], [c.w / 2, c.h / 2]].forEach(function (p) {
      var dx = c.x + p[0] - c.px, dy = c.y + p[1] - c.py;
      xs.push(c.px + cs * dx - sn * dy); ys.push(c.py + sn * dx + cs * dy);
    });
    var x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys);
    return { x: x0, y: y0, w: Math.max.apply(null, xs) - x0, h: Math.max.apply(null, ys) - y0 };
  };

  var P = World.prototype;
  Object.defineProperty(P, 'items', { get: function () { return this.cards; } });
  Object.defineProperty(P, 'dee', { get: function () { return this.lolo; } });
  Object.defineProperty(P, 'miu', { get: function () { return this.lolo; } });
  P._emit = function (e) { this.events.push(e); };
  P.drainEvents = function () { var e = this.events; this.events = []; return e; };
  P.setAge = function (a) { this._pendingAge = LL.Content.ageOf(a); };
  P.setLang = function (l) { this._pendingLang = l === 'vi' ? 'vi' : 'en'; };
  P.cardById = function (id) { for (var i = 0; i < this.cards.length; i++) if (this.cards[i].id === id) return this.cards[i]; return null; };
  P.itemById = P.cardById;
  P._setState = function (s) { this.state = s; this.stateTime = 0; };
  P._setPhase = function (p) { this.phase = p; this.phaseTime = 0; };
  P._mood = function (m, noHop) {
    var d = this.lolo; d.mood = m; d.moodT = this.cfg.moodTime[m] || 1;
    if (this.cfg.hopPx[m] && !noHop && !d.hang) {
      d._hopT = 0; d._hopPx = Math.min(this.cfg.hopPx[m], this.layout.loloRoom); d._hopN = m === 'cheer' ? 3 : 1;
    }
  };
  P.cancelDrag = function () { this.finger.down = false; };
  P.skipTalk = function () { if (this.state === 'talk') this._levelDone(); };
  P.prompt = function () { return this.cur ? { promptKey: this.cur.promptKey, params: this.cur.params } : null; };
  P._mismatchShow = function () { var b = this.cfg.mismatchShowByAge; return (b && b[this.age] !== undefined) ? b[this.age] : this.cfg.mismatchShow; };
  /** Leaf rect (logical px, unrotated, at its slot; add w.buildingDx while scrolling). Hit tests use it. */
  P.cardRect = function (c) { return { x: c.x - c.w / 2, y: c.y - c.h / 2, w: c.w, h: c.h }; };
  /** Tight hit box of the critter (logical px) or null. */
  P.critterRect = function () {
    var k = this.critter, cfg = this.cfg, s;
    if (!k || k.state === 'gone') return null;
    if (k.type === 'toucan') { s = cfg.toucanSize; return { x: k.x - 0.42 * s, y: k.y - 0.85 * s, w: 0.84 * s, h: 0.85 * s }; }
    if (k.type === 'frog') { s = cfg.frogSize; return { x: k.x - 0.45 * s, y: k.y - k.hy - 0.8 * s, w: 0.9 * s, h: 0.8 * s }; }
    s = cfg.flySize; return { x: k.x - 0.5 * s, y: k.y - 0.42 * s, w: s, h: 0.84 * s };
  };
  /** Lolo's hit box: loloRect, or the hanging body while she swings. */
  P.loloBox = function () {
    var g = this.lolo, L = this.layout, cfg = this.cfg, H = L.lolo.h;
    if (g.hang && g.vine) return { x: g.vine.hx - cfg.hangHalfWK * H, y: g.vine.hy, w: 2 * cfg.hangHalfWK * H, h: cfg.hangBottomK * H };
    var R = L.loloRect; return { x: R.x + g.dx, y: R.y, w: R.w, h: R.h };
  };

  // ---------------------------------------------------------------- viewport
  P.setViewport = function (W, H, ins) {
    var old = this.layout;
    this.layout = computeLayout(W, H, ins, this.cfg);
    var hk = this.hudKeep;
    this.layout.hudKeep = hk && hk.w > 0 && hk.h > 0 ? { x: +hk.x, y: +hk.y, w: +hk.w, h: +hk.h } : null;
    this.prevBuilding = null; this.lastBuilding = null;     // frozen snapshots of another layout: dropped
    if (this.cur && this.cards.length) this._relayoutRound();
    else this.layout.grid = null;
    this._gridVer++;
    var L = this.layout, d = this.lolo;
    // a resize / rotation mid-scroll: Lolo is put on the NEW log at once (she rides in with it; one 'land' per scroll)
    if (this.phase === 'scroll' && this.state === 'round') {
      this.buildingDx = (1 - this.scrollT) * W; this.prevDx = -this.scrollT * W;
      this._landNow();
    }
    else if (d.hang || d.vine) this._endSwing(false);
    this._planKey = '';
    if (old) {
      var k = this.critter;
      if (k) {
        if (k.type === 'frog') { k.y = k._py = L.floor.frogY; k.x = k._px = k.x * W / old.W; k.xStop = this._frogStopX(); }
        else if (k.type === 'toucan' && L.grid && k.state === 'sit') { this._perch(k, k.perchI); k.x = k._px = k.sx0; k.y = k._py = k.sy0; }
        else { k.x = k._px = k.x * W / old.W; k.y = k._py = k.y * H / old.H; if (k.x0 !== undefined) k.x0 = k.x0 * W / old.W; }
      }
    }
  };

  P._relayoutRound = function () {
    var L = this.layout, g = chooseGrid(L, this.cards.length, this.age, this.cfg), i;
    L.grid = g; L.board = g.board; L.loloRoom = loloRoom(L, g, this.cfg);
    for (i = 0; i < this.cards.length; i++) this._placeCard(this.cards[i], g);
    if (this.cur.topic === 'colors') this._yellowRule();
  };
  P._placeCard = function (c, g) {
    var s = g.slots[c.slot];
    c.hx = c.x = c._px = s.x; c.hy = c.y = c._py = s.y; c.w = g.cw; c.h = g.ch;
    c.px = s.px; c.py = s.py; c.stem = s.stem; c.row = s.row;
  };

  /** Colour rounds: swap yellow leaves away from Lolo (≥ yellowLoloGap from her box). */
  P._yellowRule = function () {
    var L = this.layout, cfg = this.cfg, cards = this.cards, D = L.loloRect, self = this;
    function gap(c) { return rectGap(self.cardRect(c), D); }
    for (var guard = 0; guard < cards.length; guard++) {
      var bad = null, i;
      for (i = 0; i < cards.length; i++) if (cards[i].face.color === 'yellow' && gap(cards[i]) < cfg.yellowLoloGap - 1e-6) { bad = cards[i]; break; }
      if (!bad) return;
      var best = null, bd = -1;
      for (i = 0; i < cards.length; i++) {
        var o = cards[i]; if (o.face.color === 'yellow' || o.state === 'matched') continue;
        var dd = gap(o);
        if (dd >= cfg.yellowLoloGap && dd > bd) { bd = dd; best = o; }
      }
      if (!best) return;
      var s = bad.slot; bad.slot = best.slot; best.slot = s;
      this._placeCard(bad, L.grid); this._placeCard(best, L.grid);
    }
  };

  // ---------------------------------------------------------------- session flow
  P.newSession = function (opts) {
    this.age = this._pendingAge; this.lang = this._pendingLang;
    this.sessions++;
    var last = (opts && opts.lastTopics) || this.lastTopics || null, last2 = (opts && opts.lastTopics2) || this.lastTopics2 || null;
    this.levels = LL.Content.topicsFor(this.age, this.rng, last, last2);
    this.lastTopics2 = last ? last.slice() : null; this.lastTopics = this.levels.slice();   // "Play again" in the same world rotates too
    this._surpriseOff = this.rng.int(0, this.cfg.surpriseTypes.length - 1);
    this.stars = 0; this.collected = [];
    this._emit({ type: 'session', levels: this.levels.slice() });
    this.startLevel(0);
  };

  P.startLevel = function (i) {
    if (!this.levels.length) this.levels = LL.Content.topicsFor(this.age);
    this.level = clamp(i | 0, 0, this.levels.length - 1);
    this.topic = this.levels[this.level];
    this.weather = this.level;
    this.round = 0; this.levelStars = 0; this.levelStartTime = this.time; this._hist = []; this._hard = false; this._lastPairs = 0;
    this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.cards = []; this.open = []; this.cur = null; this.talk = null; this.talkAnswered = null;
    this.interactive = false; this.solved = false; this._mis = null; this._anims = []; this.layout.grid = null; this._gridVer++;
    this.surprise = null; this.critter = null; this.cheer = 0;
    if (this.lolo.hang) this._endSwing(false);
    this._setState('intro'); this.phase = null;
    this._emit({ type: 'level', level: this.level, topic: this.topic });
  };

  /** A new tree, never the previous tree's leaf or bark colour. */
  P._newBuilding = function () {
    var r = this.arng, prev = this.building, lf, bk;
    do { lf = r.pick(LEAVES); } while (prev && lf[0] === prev.leaf);
    do { bk = r.pick(BARKS); } while (prev && bk[0] === prev.bark);
    return { bark: bk[0], barkDark: bk[1], moss: MOSS, leaf: lf[0], leafDark: lf[1], vine: VINE, vineDark: VINE_DARK,
      flower: r.pick(FLOWERS), kind: r.pick(KINDS), seed: (r.next() * 4294967296) >>> 0 };
  };
  function freezeCards(cards) {
    return cards.map(function (c) {
      return { id: c.id, face: c.face, state: c.state, slot: c.slot, x: c.x, y: c.y, w: c.w, h: c.h, px: c.px, py: c.py, stem: c.stem, row: c.row,
        open: Math.min(1, Math.max(0, c.open)), flip: c.flip, light: c.light, bloom: Math.min(1, c.bloom), bounce: 0, wiggle: 0, glow: 0,
        swing: c.swing, _pswing: c.swing, vswing: c.vswing, seed: c.seed };
    });
  }
  P._snapshotBuilding = function () {
    if (!this.building || !this.layout.grid) return null;
    return { building: this.building, rect: this.layout.grid.building, grid: this.layout.grid, cards: freezeCards(this.cards) };
  };

  P._beginRound = function () {
    var cfg = this.cfg, L = this.layout;
    var rr = new LL.RNG((this.rng.next() * 4294967296) >>> 0);
    var want = LL.Content.pairsFor(this.topic, this.age, this.lang, this.round, cfg.pairsByAge), held = false;
    if (cfg.adaptHold && this._hard && this._lastPairs && want > this._lastPairs) { want = this._lastPairs; held = true; }
    var cur = LL.Content.makeRound(this.topic, { age: this.age, lang: this.lang, rng: rr, roundIndex: this.round, history: this._hist,
      pairs: want, peekByAge: cfg.peekByAge });
    this.pairsHeld = held;
    if (cfg.peekPerCard) cur.peek = cur.peek * (0.6 + 0.1 * cur.cards.length);
    var ST = cfg.surpriseTypes, sp = ST && ST.length && this.round === cfg.surpriseRound ? ST[(this.level + this._surpriseOff) % ST.length] : null;
    this.surprise = sp; cur.surprise = sp; this._critterAt = -1;
    this._sameN = 0;
    // the jungle: the old tree (or the last one of the previous chapter) leaves, a new one slides in
    this.prevBuilding = (this.cards.length ? this._snapshotBuilding() : null) || this.lastBuilding || null;
    this.lastBuilding = null;
    var first = !this.prevBuilding;
    this.building = this._newBuilding();
    this.cur = cur; this._hist.push(cur.sum);
    this.mismatches = 0; this.streak = 0; this.found = 0; this.pairs = cur.pairs; this.open = []; this._mis = null; this._anims = [];
    this._idleN = 0; this._idleT = 0; this._idleGap = cfg.idleTime; this._doneT = -1; this._holdT = -1;
    this.interactive = false; this.solved = false; this.cheer = 0;
    var g = chooseGrid(L, cur.cards.length, this.age, cfg);
    L.grid = g; L.board = g.board; L.loloRoom = loloRoom(L, g, cfg); this._gridVer++;
    var ar = this.arng, self = this;
    this.cards = cur.cards.map(function (s, k) {
      var c = { id: s.id, key: s.key, face: s.face, nameKind: s.nameKind, nameValue: s.nameValue, size: s.size || null, word: s.word || null,
        obj: s.obj || null, slot: k, state: 'down', rot: 0, _prot: 0, sx: 1, sy: 1, alpha: 1, lift: 0,
        open: 0, _popen: 0, _ov: 0, openT: 0, flip: 0, _pflip: 0, flipT: 0,
        swing: 0, _pswing: 0, vswing: 0,
        light: 0, bloom: 0, _pbloom: 0, _blv: 0, bounce: 0, _pbounce: 0, _bvy: 0, _bt: 0, _bq: 0, _bT: -1, _bPx: 0, wiggle: 0,
        glow: 0, glowT: 0, peekT: -1, waveT: -1, shakeT: -1, _mt: -1, _popA: 0, _popped: false, _ph: ar.float(0, TAU), seed: (ar.next() * 65536) | 0 };
      self._placeCard(c, g);
      return c;
    });
    if (cur.topic === 'colors') this._yellowRule();
    this._setState('round'); this._setPhase('scroll');
    this._scroll0 = this.scroll; this.scrollT = this._pscrollT = 0;
    this.buildingDx = L.W; this.prevDx = 0;
    this._startSwing();
    this._emit({ type: 'scroll', first: first, building: this.building, time: this.scrollTime });
    this._emit({ type: 'round', round: this.round, topic: this.topic, promptKey: cur.promptKey, params: cur.params, pairs: cur.pairs, held: held,
      surprise: sp, building: this.building });
  };

  // ---------------------------------------------------------------- Lolo's vine swing (phase 'scroll')
  P._startSwing = function () {
    var L = this.layout, cfg = this.cfg, key = L.W + 'x' + L.H + '|' + JSON.stringify(L.ins) + '|' + cfg.scrollTime;
    if (key !== this._planKey) { this._plan = planSwing(L, cfg, cfg.scrollTime); this._planKey = key; }
    var P0 = this._plan;
    this.scrollTime = P0.T;
    var d = this.lolo;
    d._hopT = -1; d.hop = d._phop = 0; d._flipT = -1; d._flipDelay = -1; d.flipRot = d._pflipRot = 0;
    d._landed = false;
    if (P0.none) { d.vine = null; d.hang = false; this._landNow(); return; }
    // the liana hangs from the canopy (world-fixed: it scrolls with the camera) right where she will grab it
    d.vine = { px: P0.Gx, _ppx: P0.Gx, py: P0.Py, len: P0.Lv, held: false, ang: 0, _pang: 0, hx: P0.ax, hy: P0.ay, _phx: P0.ax, _phy: P0.ay,
      ex: P0.Gx, ey: P0.Py + P0.Lv, _pex: P0.Gx, _pey: P0.Py + P0.Lv, vth: 0, _vth: 0, _vom: 0, alpha: 0, _palpha: 0, phase: 'wait', n: -1 };
  };
  /** Ends the swing (landed, or a resize / chapter change): Lolo sits on her log. */
  P._endSwing = function (landed) {
    var d = this.lolo;
    d.hang = false; d.vine = null;
    if (landed) { d.squash = this.cfg.squashLand; d._vsquash = 0; } else { d.dx = d._pdx = 0; }
  };
  /** Skips the rest of the swing (resize / rotation, or no plan): she is on the new log now — exactly one 'land' per scroll. */
  P._landNow = function () {
    var d = this.lolo, L = this.layout;
    if (d._landed) { if (d.hang) { d.hang = false; d.vine = null; } return; }
    d._landed = true;
    this._endSwing(true);
    d.dx = d._pdx = (1 - this.scrollT) * L.W;
    this._emit({ type: 'swing', phase: 'land', x: L.lolo.x + d.dx, y: L.lolo.y, skipped: true });
  };
  P._stepSwing = function (h) {
    var d = this.lolo, v = d.vine, P0 = this._plan, L = this.layout, cfg = this.cfg;
    if (!v || !P0 || P0.none) { if (d._landed) d.dx = (1 - this.scrollT) * L.W; return; }
    v._ppx = v.px; v._phx = v.hx; v._phy = v.hy; v._pang = v.ang; v._pex = v.ex; v._pey = v.ey; v._palpha = v.alpha;
    var n = Math.round(this.phaseTime / h) - P0.n0, cam = L.W * smooth(this.phaseTime / this.scrollTime);
    v.px = P0.Gx - cam;
    v.alpha = clamp(v.phase === 'done' ? v.alpha - h / 0.3 : this.phaseTime / Math.max(h, cfg.leapDelay), 0, 1);
    var S = P0.S, ex, ey;
    if (n >= 0 && n < P0.nLand && v.phase !== 'done') {
      if (n === 0 || v.phase === 'wait') { v.phase = 'leap'; d.hang = true; this._emit({ type: 'swing', phase: 'leap', x: S.x[0], y: S.y[0] }); }
      var i = Math.min(n, S.x.length - 1);
      v.hx = S.x[i]; v.hy = S.y[i]; v.ang = S.a[i];
      if (n >= P0.nGrab && v.phase === 'leap') { v.phase = 'grab'; v.held = true; this._emit({ type: 'swing', phase: 'grab', x: v.hx, y: v.hy }); }
      if (n >= P0.nRel && v.phase === 'grab') {
        v.phase = 'fly'; v.held = false; v._vth = P0.thR; v._vom = P0.omR;
        this._emit({ type: 'swing', phase: 'release', x: v.hx, y: v.hy });
      }
    } else if (n >= P0.nLand && v.phase !== 'done') {
      v.phase = 'done'; v.held = false; d._landed = true;
      this._endSwing(true);
      d.vine = v;                    // the free liana stays (fading) until the scroll ends
      this._emit({ type: 'swing', phase: 'land', x: L.lolo.x + (1 - this.scrollT) * L.W, y: L.lolo.y });
    }
    // the liana: hanging still / held (to her hand) / swinging free after the release (a light damped pendulum)
    if (v.held) { ex = v.hx; ey = v.hy; v.vth = Math.atan2(v.hx - v.px, v.hy - v.py); }
    else {
      if (v.phase === 'fly' || v.phase === 'done') {
        v._vom += (-(cfg.swingG / v.len) * Math.sin(v._vth) - 1.2 * v._vom) * h; v._vth += v._vom * h; v.vth = v._vth;
      }
      ex = v.px + v.len * Math.sin(v.vth); ey = v.py + v.len * Math.cos(v.vth);
    }
    v.ex = ex; v.ey = ey;
    if (!d.hang) d.dx = v.phase === 'done' ? (1 - this.scrollT) * L.W : -this.scrollT * L.W;   // she rides on her log
  };

  P._startPeek = function () {
    this._setPhase('peek');
    for (var i = 0; i < this.cards.length; i++) this.cards[i].waveT = this.cards[i].slot * this.cfg.peekStagger;
    this._emit({ type: 'peek' });
  };

  P._startPlay = function () {
    this._setPhase('play'); this.interactive = true; this._idleT = 0; this._playStart = this.time;
    if (this.surprise && !this.critter && this._critterAt < 0) this._critterAt = this.time + this.arng.float(this.cfg.surpriseDelay[0], this.cfg.surpriseDelay[1]);
    this._emit({ type: 'play' });
  };

  P._startCheer = function () {
    var B = this.layout.grid.building, cfg = this.cfg, self = this;
    this._setPhase('cheer');
    this._mood('cheer', true);
    this.cards.forEach(function (c) { self._kickBounce(c, c.slot * cfg.cheerWave, 1, cfg.cheerHopPx); c._cheerT = c.slot * cfg.cheerWave; });
    this.lolo._flipDelay = cfg.flipDelay;
    var k = this.critter;
    if (k && k.type === 'toucan' && k.state !== 'away' && k.state !== 'gone') { this._toucanAway(k); this._emit({ type: 'critter', critter: 'toucan', action: 'leave', x: k.x, y: k.y }); }
    this._emit({ type: 'cheer', x: B.x + B.w / 2, y: B.y - B.roofH / 2 });
  };

  P._endRound = function () {
    var m = this.mismatches, N = this.pairs, st = m <= Math.max(1, N - 1) ? 3 : m <= 2 * N ? 2 : 1;
    this.roundStars = st; this.stars += st; this.levelStars += st;
    this._hard = st === 1 || this.time - this._playStart > this.cfg.adaptSlowPlay; this._lastPairs = N;
    this.interactive = false;
    this._setState('roundDone'); this.phase = 'done';
    this._emit({ type: 'roundDone', round: this.round, stars: st, mismatches: m });
  };

  P._startTalk = function () {
    var rr = new LL.RNG((this.rng.next() * 4294967296) >>> 0);
    this.talk = LL.Content.makeTalk(this.topic, { age: this.age, lang: this.lang, rng: rr });
    this.talk.glowAnswer = false;
    this.talkAnswered = null; this._talkAskT = 0; this._talkAsks = 0;
    this.lastBuilding = this._snapshotBuilding();      // the lit tree stays behind the Talk panel
    this.cards = []; this.open = []; this.cur = null; this.layout.grid = null; this.layout.loloRoom = 200; this.phase = null; this._gridVer++;
    this.critter = null; this.cheer = 0;
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
  /** The leaf under (x, y): unrotated rect grown by hitPad; inside several → nearest centre. */
  P._hit = function (x, y) {
    var best = null, bd = 1e9, pad = this.cfg.hitPad;
    for (var i = 0; i < this.cards.length; i++) {
      var c = this.cards[i];
      if (Math.abs(x - c.x) > c.w / 2 + pad || Math.abs(y - c.y) > c.h / 2 + pad) continue;
      var d = hyp(x - c.x, y - c.y);
      if (d < bd - 1e-9) { bd = d; best = c; }
    }
    return best;
  };
  P._hitLolo = function (x, y) { return inRect(x, y, this.loloBox()) || (!this.lolo.hang && inRect(x, y, World.loloHead(this))); };

  /** Touch-down. Returns a leaf id, 'critter', 'lolo' or null. Order: the toucan / butterfly (drawn in front of the leaves,
   * tight box) → leaves → Lolo → the frog. Leaves answer only in play / resolve. */
  P.pointerDown = function (x, y) {
    this.finger.x = x; this.finger.y = y; this.finger.down = true;
    var inRound = this.state === 'round', cfg = this.cfg;
    var kr = this.critterRect(), k = this.critter;
    var scrolling = inRound && this.phase === 'scroll';
    var c = inRound && !scrolling ? this._hit(x, y) : null;
    if (kr && k.type !== 'frog' && k.state !== 'away' && inRect(x, y, kr)) {
      // a leaf that would turn wins, unless the finger is right on the critter (the middle critterCore of its box)
      var turnable = c && c.state === 'down' && !this.solved && (this.phase === 'play' || (this.phase === 'resolve' && this._mis));
      var m = (1 - cfg.critterCore) / 2, core = { x: kr.x + m * kr.w, y: kr.y + m * kr.h, w: kr.w * cfg.critterCore, h: kr.h * cfg.critterCore };
      if (!turnable || inRect(x, y, core)) { this._tapCritter(); return 'critter'; }
    }
    if (c) {
      if (this.solved) return null;
      var ph = this.phase;
      if (ph !== 'play' && ph !== 'resolve') return null;
      var same = c.state === 'up' && this.open.length === 1 && this.open[0] === c.id && !this._mis;
      if (!same) { this._idleT = 0; this._idleGap = cfg.idleTime; }
      this._lookId = c.id; this._lookT = this.time; this._lastTapId = c.id;
      if (same) { if (++this._sameN >= cfg.sameTapHint) { this._sameN = 0; this._autoHint(); } }
      else this._sameN = 0;
      if (c.state === 'matched' || c.state === 'up') { this._emitTap(c); return c.id; }
      if (ph === 'resolve' && !this._mis) return null;
      if (this.open.length < 2) { this._openUp(c); return c.id; }
      var a = this.cardById(this.open[0]), b = this.cardById(this.open[1]);
      if (a.key === b.key || !cfg.fastReset) return null;
      if (!this._mis || this._mis.t < cfg.thirdTapAfter) return null;
      this._close(a); this._close(b);
      this.open = []; this._mis = null; this._setPhase('play');
      this._openUp(c);
      return c.id;
    }
    if (this.state !== 'menu' && this._hitLolo(x, y)) { this._idleT = 0; this._idleGap = cfg.idleTime; return 'lolo'; }
    if (kr && k.type === 'frog' && inRect(x, y, kr)) { this._tapCritter(); return 'critter'; }
    if (inRound && (this.phase === 'play' || this.phase === 'resolve')) { this._idleT = 0; this._idleGap = cfg.idleTime; }
    return null;
  };
  P.pointerMove = function (x, y) { this.finger.x = x; this.finger.y = y; };
  P.pointerUp = function (x, y) { if (x !== undefined) { this.finger.x = x; this.finger.y = y; } this.finger.down = false; };

  P._emitTap = function (c) { this._emit({ type: 'tap', id: c.id, nameKind: c.nameKind, nameValue: c.nameValue, face: c.face, size: c.size, obj: c.obj }); };
  /** Sets a leaf's flip target; a change kicks its pendulum (sign alternating with the slot, opposite when turning back). */
  P._target = function (c, v, kick) {
    if (v === c.openT) return;
    var cfg = this.cfg, sg = c.slot % 2 ? -1 : 1, up = v > c.openT;
    var dir = sg * (up ? 1 : -1);
    if (kick === undefined) kick = (v > 0 && v < 1) || (c.openT > 0 && c.openT < 1) ? cfg.swingKickHint : cfg.swingKick;
    else if (!up && Math.abs(c.vswing) > 1e-3) dir = c.vswing > 0 ? -1 : 1;   // the hide wave: turning back pushes against the swing
    c.vswing += dir * kick;
    c.openT = c.flipT = v;
  };
  P._openUp = function (c) {
    c.state = 'up'; this._target(c, 1); c.peekT = -1;
    this.open.push(c.id);
    this._emit({ type: 'flip', id: c.id, nameKind: c.nameKind, nameValue: c.nameValue, face: c.face, size: c.size, obj: c.obj, open: this.open.length });
  };
  P._close = function (c) { c.state = 'down'; this._target(c, 0); c.shakeT = -1; };

  P._names = function (ev, a, b) {
    ev.nameKindA = a.nameKind; ev.nameValueA = a.nameValue; ev.faceA = a.face; ev.sizeA = a.size; ev.objA = a.obj;
    ev.nameKindB = b.nameKind; ev.nameValueB = b.nameValue; ev.faceB = b.face; ev.sizeB = b.size; ev.objB = b.obj;
    return ev;
  };
  P._check = function () {
    var a = this.cardById(this.open[0]), b = this.cardById(this.open[1]);
    if (a.key === b.key) this._match(a, b); else this._mismatch(a, b);
  };
  P._kickBounce = function (c, delay, hops, px) { c._bT = delay; c._bq = hops; c._bPx = px; };

  P._match = function (a, b) {
    var cfg = this.cfg, info = this.cur.pairInfo[a.key];
    a.state = b.state = 'matched'; this._target(a, 1); this._target(b, 1);
    this.open = []; this.found++; this.streak = 0;
    var last = this.found >= this.pairs;
    this._anims.push({ a: a.id, b: b.id, t: 0, last: last });
    a._mt = b._mt = 0; a.glowT = b.glowT = 0; a.peekT = b.peekT = -1;
    a._popA = cfg.matchHold + cfg.bloomDelay[0]; b._popA = cfg.matchHold + cfg.bloomDelay[1]; a._popped = b._popped = false;
    this._kickBounce(a, cfg.matchHold, cfg.matchHops, cfg.bouncePx); this._kickBounce(b, cfg.matchHold, cfg.matchHops, cfg.bouncePx);
    this._setPhase('resolve');
    this._mood(last ? 'cheer' : 'happy');
    var ev = { type: 'match', a: a.id, b: b.id, key: a.key, nameKind: info.nameKind, nameValue: info.nameValue, found: this.found, pairs: this.pairs };
    ['parity', 'animal', 'food', 'word', 'text', 'lower', 'obj'].forEach(function (k) { if (info[k] !== undefined) ev[k] = info[k]; });
    this._emit(this._names(ev, a, b));
    this.collected.push({ topic: this.topic, key: a.key, faceA: a.face, faceB: b.face });
    if (last) { this.solved = true; this.interactive = false; this._doneT = 0; }
  };

  P._mismatch = function (a, b) {
    var cfg = this.cfg;
    this.mismatches++; this.streak++;
    this._mood('oops');
    this._mis = { a: a.id, b: b.id, t: 0 };
    this._setPhase('resolve');
    a.shakeT = b.shakeT = 0;
    var ev = { type: 'mismatch', a: a.id, b: b.id, streak: this.streak, mismatches: this.mismatches };
    this._emit(this._names(ev, a, b));
    if (this.streak >= cfg.hintAfterStreak) { if (this._autoHint() !== null) this.streak = 0; }
  };

  P._hintPair = function () {
    var cards = this.cards, i, key = null;
    var free = function (c) { return c.state === 'down' || c.state === 'up'; };
    if (this.open.length === 1) key = this.cardById(this.open[0]).key;
    else if (this._lastTapId) { var lt = this.cardById(this._lastTapId); if (lt && free(lt)) key = lt.key; }
    if (!key) {
      var keys = [];
      for (i = 0; i < cards.length; i++) if (free(cards[i]) && keys.indexOf(cards[i].key) < 0) keys.push(cards[i].key);
      if (!keys.length) return null;
      key = keys[Math.floor(this.rng.next() * keys.length)];
    }
    var pr = cards.filter(function (c) { return c.key === key && free(c); });
    return pr.length === 2 ? pr : null;
  };
  P._autoHint = function () {
    if (this.time - this._lastHintT < this.cfg.hintCooldown) return null;
    return this._doHint(false);
  };
  P._doHint = function (fromIdle) {
    var pr = this._hintPair();
    if (!pr || pr[0].glowT > 0 || pr[1].glowT > 0) return null;
    var cfg = this.cfg;
    for (var i = 0; i < 2; i++) { pr[i].glowT = cfg.hintGlowTime; if (pr[i].state === 'down') pr[i].peekT = 0; }
    this._lastHintT = this.time;
    var lk = pr[0].state === 'down' ? pr[0] : pr[1];
    this._lookId = lk.id; this._lookT = this.time;
    this._mood('think');
    var ev = { type: 'hint', a: pr[0].id, b: pr[1].id, nameKind: pr[0].nameKind, nameValue: pr[0].nameValue };
    if (fromIdle) ev.idle = true;
    this._emit(ev);
    return pr[0].id;
  };
  P.hint = function () {
    if (this.state !== 'round' || this.solved || (this.phase !== 'play' && this.phase !== 'resolve')) return null;
    var pr = this._hintPair();
    if (!pr) return null;
    if (pr[0].glowT > 0) return pr[0].id;
    return this._doHint(false);
  };

  // ---------------------------------------------------------------- critters (surprise round)
  /** Toucan perches: on a row vine between two neighbouring leaves (or past a row's outer leaf when there is room). */
  P._perches = function () {
    var g = this.layout.grid, out = [];
    if (!g) return out;
    var rows = g.building.rows;
    for (var r = 0; r < rows.length; r++) {
      var xs = this.cards.filter(function (c) { return c.row === r; }).map(function (c) { return c.x; }).sort(function (a, b) { return a - b; });
      if (!xs.length) continue;
      for (var i = 0; i + 1 < xs.length; i++) out.push({ row: r, x: (xs[i] + xs[i + 1]) / 2 });
      var lx = (rows[r].x0 + xs[0] - g.cw / 2) / 2, rx = (rows[r].x1 + xs[xs.length - 1] + g.cw / 2) / 2;
      if (xs[0] - g.cw / 2 - rows[r].x0 >= 24) out.push({ row: r, x: lx });
      if (rows[r].x1 - xs[xs.length - 1] - g.cw / 2 >= 24) out.push({ row: r, x: rx });
    }
    return out;
  };
  P._perch = function (k, i) {
    var ps = this._perches(); if (!ps.length) return;
    k.perchI = clamp(i | 0, 0, ps.length - 1);
    var p = ps[k.perchI], row = this.layout.grid.building.rows[p.row];
    k.sx0 = p.x; k.sy0 = vineY(row, p.x); k.perchRow = p.row;
  };
  P._spawnCritter = function () {
    var cfg = this.cfg, L = this.layout, r = this.arng, g = L.grid, type = this.surprise, k;
    k = { type: type, x: 0, y: 0, _px: 0, _py: 0, rot: 0, _prot: 0, state: 'in', t: 0, flap: 0, _pflap: 0, face: 1, color: null,
      sx: 1, sy: 1, _q: 0, _qv: 0, bob: 0, peck: 0, croak: 0, air: false, hy: 0, _phy: 0, size: 0, tapped: false };
    if (type === 'toucan') {
      k.size = cfg.toucanSize;
      var ps = this._perches();
      this._perch(k, r.int(0, Math.max(0, ps.length - 1)));
      var fromRight = r.chance(0.6);
      this._fly(k, fromRight ? L.W + 60 : -60, L.ins.top + r.float(30, 90), k.sx0, k.sy0, cfg.toucanFly);
      k.state = 'fly';
    } else if (type === 'frog') {
      k.size = cfg.frogSize; k.x = -40; k.y = L.floor.frogY; k.xStop = this._frogStopX(); k.state = 'in';
      k._next = 0.2; k._hop = null; k.stopT = cfg.frogStop; k._croakT = 0.3;
    } else {
      k.size = cfg.flySize;
      var cols = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
      var used = {}; this.cards.forEach(function (q) { if (q.face.color) used[q.face.color] = 1; });
      var free = cols.filter(function (q) { return !used[q]; });
      k.color = r.pick(free.length ? free : cols);
      var R = g.rect;
      k.x0 = r.float(R.x + 0.15 * R.w, R.x + 0.85 * R.w); k.x = k.x0; k.y = L.groundY + 6; k.vx = 0; k.vy = -cfg.flyRise;
      k.state = 'rise'; k._ph = r.float(0, TAU);
    }
    k._px = k.x; k._py = k.y;
    this.critter = k;
    this._emit({ type: 'critter', critter: type, action: 'enter', x: k.x, y: k.y });
  };
  /** Where the frog sits: the first landing at x ≥ max(W/2 − 40, loloRect right + frogStopGap + its half width). */
  P._frogStopX = function () {
    var L = this.layout, R = L.loloRect;
    return Math.max(L.W / 2 - 40, R.x + R.w + this.cfg.frogStopGap + 0.45 * this.cfg.frogSize);
  };
  P._fly = function (k, x0, y0, x1, y1, T) {
    var d = hyp(x1 - x0, y1 - y0);
    k._bz = { x0: x0, y0: y0, cx: (x0 + x1) / 2, cy: Math.min(y0, y1) - 0.25 * d - 30, x1: x1, y1: y1, T: T };
    k.x = x0; k.y = y0; k.t = 0; k.face = x1 >= x0 ? 1 : -1;
  };
  P._toucanAway = function (k) {
    var L = this.layout, right = k.x > L.W / 2 ? 1 : -1;
    if (k.state === 'fly' && k._bz) right = k.face;
    this._fly(k, k.x, k.y, right > 0 ? L.W + 90 : -90, L.ins.top - 70, this.cfg.toucanAway);
    k.state = 'away';
  };
  /** Frog: one ballistic hop (len px forward, apex px) starting now. */
  P._frogHop = function (k, len, apex) {
    var g = this.cfg.frogG, v0 = Math.sqrt(2 * g * apex), T = 2 * v0 / g;
    k._hop = { x0: k.x, len: len, v0: v0, T: T, t: 0, big: apex > this.cfg.frogApex + 1 };
    k.air = true;
    this._emit({ type: 'critter', critter: 'frog', action: 'hop', x: k.x, y: k.y, big: k._hop.big });
  };
  P._tapCritter = function () {
    var k = this.critter;
    k.tapped = true;
    if (k.type === 'toucan') this._toucanAway(k);
    else if (k.type === 'frog') k._big = true;          // the big jump starts at once from the floor (or on the next landing)
    else if (k.state !== 'away') { k.state = 'away'; k.t = 0; k._spin = 0; k._ax = k.x; }
    var R = this.critterRect();
    this._emit({ type: 'critter', critter: k.type, action: 'tap', x: k.x, y: R ? R.y + R.h / 2 : k.y });
  };
  P._stepCritter = function (h) {
    var k = this.critter, cfg = this.cfg, L = this.layout, u, B;
    k._px = k.x; k._py = k.y; k._prot = k.rot; k._phy = k.hy; k._pflap = k.flap;
    k.t += h;
    if (k.type === 'toucan') {
      if (k.state === 'fly' || k.state === 'away' || k.state === 'hop') {
        B = k._bz; u = clamp(k.t / B.T, 0, 1);
        var s = k.state === 'away' ? u * u : smooth(u), q = 1 - s;
        k.x = q * q * B.x0 + 2 * q * s * B.cx + s * s * B.x1; k.y = q * q * B.y0 + 2 * q * s * B.cy + s * s * B.y1;
        k.flap = 0.5 + 0.5 * Math.sin(TAU * cfg.toucanFlapHz * k.t * (k.state === 'away' ? 1.4 : 1));
        k.rot = 0.18 * k.face * Math.sin(Math.PI * u);
        if (u >= 1) {
          if (k.state === 'away') { k.state = 'gone'; return; }
          if (k.state === 'fly') this._emit({ type: 'critter', critter: 'toucan', action: 'land', x: k.x, y: k.y });
          k.state = 'sit'; k.t = 0; k.rot = 0; k.flap = 0; k._q = 0.15; k._qv = 0;
          k._bobT = this.arng.float(cfg.toucanBob[0], cfg.toucanBob[1]); k._moveT = this.arng.float(cfg.toucanMove[0], cfg.toucanMove[1]);
        }
      } else if (k.state === 'sit') {
        k.x = k.sx0; k.y = k.sy0;
        k._bobT -= h;
        if (k._bobT <= 0) { k._bobT = this.arng.float(cfg.toucanBob[0], cfg.toucanBob[1]); k._bob0 = k.t; }
        k.bob = k.peck = k._bob0 !== undefined && k.t - k._bob0 < 0.35 ? Math.sin(Math.PI * (k.t - k._bob0) / 0.35) : 0;
        k._moveT -= h;
        var ps = this._perches();
        if (k._moveT <= 0 && ps.length > 1) {   // hops along the vine to another gap now and then
          var x0 = k.x, y0 = k.y, ni = this.arng.int(0, ps.length - 2); if (ni >= k.perchI) ni++;
          this._perch(k, ni);
          this._fly(k, x0, y0, k.sx0, k.sy0, 0.8); k.state = 'hop';
        }
      }
      spring(k, '_q', '_qv', 0, 18, 0.3, h); k.sx = 1 + k._q; k.sy = 1 - k._q;
    } else if (k.type === 'frog') {
      var hp = k._hop;
      if (hp) {
        hp.t += h;
        var tt = Math.min(hp.t, hp.T);
        k.x = hp.x0 + hp.len * tt / hp.T;
        k.hy = Math.max(0, hp.v0 * tt - 0.5 * cfg.frogG * tt * tt);
        var vy = hp.v0 - cfg.frogG * tt;
        k.rot = -0.25 * k.face * (hp.big ? 0 : vy / hp.v0);
        if (hp.t >= hp.T) {
          k._hop = null; k.air = false; k.hy = 0; k.rot = 0; k._q = hp.big ? 0.22 : 0.16; k._qv = 0;
          k._next = this.arng.float(cfg.frogEvery[0], cfg.frogEvery[1]) - hp.T;
          if (k.state === 'in' && k.x >= k.xStop) { k.state = 'stop'; k.stopT = cfg.frogStop; k._croakT = 0.3; this._emit({ type: 'critter', critter: 'frog', action: 'stop', x: k.x, y: k.y }); }
        }
      } else {
        k._next -= h;
        if (k._big) { k._big = false; this._frogHop(k, 0, cfg.frogBigApex); }
        else if (k.state === 'stop') {
          k.stopT -= h; k._croakT -= h;
          if (k._croakT <= 0) { k._croakT = cfg.frogCroakEvery; k._croak0 = k.t; }
          if (k.stopT <= 0) { k.state = 'out'; k._next = 0; }
        } else if (k._next <= 0) this._frogHop(k, this.arng.float(cfg.frogHopLen[0], cfg.frogHopLen[1]), cfg.frogApex);
      }
      k.croak = k._croak0 !== undefined && k.t - k._croak0 < 0.4 ? Math.sin(Math.PI * (k.t - k._croak0) / 0.4) : 0;
      spring(k, '_q', '_qv', 0, 16, 0.3, h); k.sx = 1 + k._q; k.sy = 1 - k._q;
      if (k.state === 'out' && k.x > L.W + 60) { k.state = 'gone'; this._emit({ type: 'critter', critter: 'frog', action: 'leave', x: k.x, y: k.y }); }
    } else {   // butterfly
      var ax = k.x;
      if (k.state === 'rise') {
        k.x = k.x0 + cfg.flySwayPx * Math.sin(TAU * cfg.flySwayHz * k.t + k._ph) + 0.3 * this.wind * k.t;
        k.y += -cfg.flyRise * h;
      } else if (k.state === 'away') {
        k.vy = Math.max(-cfg.flyAway, k.vy - 900 * h); k.y += k.vy * h;
        k._spin += 3 * TAU * h;
        k.x = k._ax + 30 * Math.sin(k._spin) * Math.min(1, k.t / 0.3);
        k._ax += 0.3 * this.wind * h;
      }
      k.vx = (k.x - ax) / h;
      k.flap = (k.flap + TAU * cfg.flyFlapHz * (k.state === 'away' ? 1.6 : 1) * h) % TAU;
      k.rot = clamp(k.vx / 200, -0.3, 0.3);
      if (k.y < -cfg.flySize - 60) { k.state = 'gone'; if (!k.tapped) this._emit({ type: 'critter', critter: 'butterfly', action: 'leave', x: k.x, y: 0 }); }
    }
  };

  // ---------------------------------------------------------------- Lolo
  /** The arm: angle from the shoulder (rotated by lean, lifted by hop) and the drawable length (never into a leaf). */
  P._stepArm = function (h) {
    var d = this.lolo, cfg = this.cfg, L = this.layout, H = L.lolo.h, lo = L.lolo;
    var sx = L.loloShoulder.x - lo.x, sy = L.loloShoulder.y - lo.y, c = Math.cos(d.lean), s = Math.sin(d.lean);
    d.shX = lo.x + c * sx - s * sy + d.dx; d.shY = lo.y - d.hop + s * sx + c * sy;
    var look = this._lookId && this.time - this._lookT < cfg.lookHold && this.state === 'round' ? this.cardById(this._lookId) : null;
    var tA = cfg.armRest, tE = 0, tLean = 0;
    if (look && !d.hang) {
      tA = Math.atan2(look.y - d.shY, look.x - d.shX); tE = 1;
      tLean = cfg.leanMax * clamp((look.x - lo.x) / cfg.leanDx, -1, 1);
    }
    if (h > 0) {
      spring(d, 'lean', '_vlean', tLean, cfg.leanOmega, cfg.leanZeta, h);
      spring(d, 'armA', '_varmA', tA, cfg.armOmega, cfg.armZeta, h);
      spring(d, 'armExt', '_varmExt', tE, cfg.armOmega, cfg.armZeta, h);
      d.armExt = clamp(d.armExt, 0, 1);
    }
    // length: rest 0.3·h → up to 0.55·h when pointing, cut where the ray enters a leaf rect (+4 px)
    var want = cfg.armRestK * H + (cfg.armMaxK - cfg.armRestK) * H * d.armExt, ux = Math.cos(d.armA), uy = Math.sin(d.armA), lim = want;
    for (var i = 0; i < this.cards.length && L.grid; i++) {
      var R = inflate(this.cardRect(this.cards[i]), cfg.armLeafKeep), t0 = 0, t1 = lim, ok = true;
      [[ux, d.shX, R.x, R.x + R.w], [uy, d.shY, R.y, R.y + R.h]].forEach(function (a) {
        if (!ok) return;
        if (Math.abs(a[0]) < 1e-9) { if (a[1] < a[2] || a[1] > a[3]) ok = false; return; }
        var ta = (a[2] - a[1]) / a[0], tb = (a[3] - a[1]) / a[0];
        if (ta > tb) { var tmp = ta; ta = tb; tb = tmp; }
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) ok = false;
      });
      if (ok) lim = Math.min(lim, Math.max(0, t0));
    }
    d.armLen = Math.max(0.12 * H, lim);
    if (lim < 0.12 * H) d.armLen = lim;          // a leaf right at the shoulder (never in a valid layout)
  };
  P._stepLolo = function (h) {
    var d = this.lolo, cfg = this.cfg, L = this.layout;
    d._phop = d.hop; d._plean = d.lean; d._parmA = d.armA; d._parmExt = d.armExt; d._parmLen = d.armLen; d._ptail = d.tail;
    d._psquash = d.squash; d._pflipRot = d.flipRot; d._pdx = d.dx;
    if (d.moodT > 0) { d.moodT -= h; if (d.moodT <= 0) { d.moodT = 0; d.mood = 'idle'; } }
    // eyes
    var B = L.grid ? L.grid.rect : L.board, lx = B.x + B.w / 2, ly = B.y + B.h / 2;
    if (this._lookId && this.time - this._lookT < cfg.lookHold) { var c = this.cardById(this._lookId); if (c) { lx = c.x; ly = c.y; } }
    if (this.phase === 'cheer' && L.grid) { lx = L.grid.building.x + L.grid.building.w / 2; ly = L.grid.building.y - L.grid.building.roofH / 2; }
    if (d.hang && d.vine) { lx = d.vine.hx + 300; ly = d.vine.hy + 40; }
    var k = Math.min(1, h * cfg.lookRate);
    d.lookX += (lx - d.lookX) * k; d.lookY += (ly - d.lookY) * k;
    // hops (mood)
    var hop = 0;
    if (d._hopT >= 0) {
      d._hopT += h;
      var n = d._hopT / cfg.hopTime;
      if (n >= d._hopN) d._hopT = -1;
      else { var ph = n - Math.floor(n); hop = d._hopPx * Math.pow(0.7, Math.floor(n)) * 4 * ph * (1 - ph); }
    }
    // backflip: a ballistic jump (apex ≤ 70 px, the room above her) with a constant spin of −2π over the airtime
    if (d._flipDelay >= 0) {
      d._flipDelay -= h;
      if (d._flipDelay < 0) {
        d._flipJ = Math.min(cfg.flipJump, L.loloRoom); d._flipV = Math.sqrt(2 * cfg.flipG * d._flipJ); d._flipT = 0;
        d._hopT = -1; hop = 0;
        this._emit({ type: 'backflip', jump: d._flipJ, time: 2 * d._flipV / cfg.flipG });
      }
    }
    if (d._flipT >= 0) {
      d._flipT += h;
      var T = 2 * d._flipV / cfg.flipG;
      if (d._flipT >= T || T <= 0) { d._flipT = -1; d.flipRot = 0; hop = 0; d.squash = cfg.squashLand; d._vsquash = 0; }
      else { hop = d._flipV * d._flipT - 0.5 * cfg.flipG * d._flipT * d._flipT; d.flipRot = -TAU * d._flipT / T; }
    }
    d.hop = d.hang ? 0 : hop;
    spring(d, 'squash', '_vsquash', 0, cfg.squashOmega, cfg.squashZeta, h);
    d.squash = clamp(d.squash, -0.15, 0.15);
    d.tail = (d.tail + (d.mood === 'happy' || d.mood === 'cheer' ? cfg.tailRateHappy : cfg.tailRate) * h) % TAU;
    // blink
    d._blinkT -= h;
    if (d._blinkT <= 0) { d._blinkOn = cfg.blinkTime; d._blinkT = this.arng.float(cfg.blinkEvery[0], cfg.blinkEvery[1]); }
    if (d._blinkOn > 0) d._blinkOn -= h;
    d.blink = d._blinkOn > 0 ? 1 : 0;
    if (this.state === 'round' && this.phase === 'scroll') this._stepSwing(h);
    else if (d.vine || d.hang) this._endSwing(false);
    if (this.state === 'round' && this.phase === 'scroll' && d._landed && !d.vine) d.dx = (1 - this.scrollT) * L.W;
    if (!(this.state === 'round' && this.phase === 'scroll')) d.dx = 0;
    this._stepArm(h);
    d.tx = d.lookX; d.ty = d.lookY;
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
    for (i = 0; i < this.cards.length; i++) {
      var o = this.cards[i]; o._px = o.x; o._py = o.y; o._prot = o.rot; o._popen = o.open; o._pflip = o.flip; o._pbloom = o.bloom;
      o._pbounce = o.bounce; o._pswing = o.swing;
    }
    this._pscroll = this.scroll; this._pscrollT = this.scrollT;
    this.time += h; this.stateTime += h; this.phaseTime += h;

    switch (this.state) {
      case 'intro': if (this.stateTime >= cfg.introTime) this._beginRound(); break;
      case 'round': this._stepRound(h); break;
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
          else { this._setState('sessionDone'); this.cards = []; this._emit({ type: 'sessionDone', stars: this.stars, rewards: this.collected.length, found: this.collected.length }); }
        }
        break;
    }
    for (i = 0; i < this.cards.length; i++) this._stepLeaf(this.cards[i], h);
    var frozen = (this.prevBuilding && this.prevBuilding.cards) || (this.lastBuilding && this.lastBuilding.cards) || null;
    if (frozen) for (i = 0; i < frozen.length; i++) { frozen[i]._pswing = frozen[i].swing; this._stepSwingOf(frozen[i], h, false); }
    if (this.critter) { this._stepCritter(h); if (this.critter && this.critter.state === 'gone') this.critter = null; }
    this._stepLolo(h);
  };

  P._stepRound = function (h) {
    var cfg = this.cfg, cards = this.cards, i, c, all;
    switch (this.phase) {
      case 'scroll': {
        var L = this.layout, u = this.phaseTime / this.scrollTime, s = smooth(u), dPx = (s - this.scrollT) * L.W;
        this.scrollT = s; this.scroll = this._scroll0 + s * L.W;
        this.buildingDx = (1 - s) * L.W; this.prevDx = -s * L.W;
        if (this.critter) { var k = this.critter; k.x -= dPx; if (k.x0 !== undefined) k.x0 -= dPx; if (k._ax !== undefined) k._ax -= dPx;
          if (k._hop) k._hop.x0 -= dPx; if (k._bz) { k._bz.x0 -= dPx; k._bz.cx -= dPx; k._bz.x1 -= dPx; }
          if (k.x < -400) this.critter = null; }
        if (u >= 1) {
          if (this._holdT < 0) {
            this.scrollT = 1; this.buildingDx = 0; this.prevDx = -L.W; this.prevBuilding = null;
            this._holdT = 0;
          }
          this._holdT += h;
          if (this._holdT >= cfg.scrollSettle) { this._holdT = -1; this._startPeek(); }
        }
        break;
      }
      case 'peek':
        for (i = 0; i < cards.length; i++) { c = cards[i]; if (c.waveT >= 0) { c.waveT -= h; if (c.waveT <= 0) { c.waveT = -1; this._target(c, 1, cfg.swingKickWave); } } }
        all = true;
        for (i = 0; i < cards.length; i++) if (cards[i].open < 0.95 || cards[i].openT < 1) { all = false; break; }
        if (all && this._holdT < 0) this._holdT = 0;
        if (this._holdT >= 0) {
          this._holdT += h;
          if (this._holdT >= this.cur.peek) {
            this._holdT = -1; this._setPhase('hide');
            var n = cards.length;
            for (i = 0; i < n; i++) cards[i].waveT = (n - 1 - cards[i].slot) * cfg.peekStagger;
            this._emit({ type: 'hide' });
          }
        }
        break;
      case 'hide':
        for (i = 0; i < cards.length; i++) { c = cards[i]; if (c.waveT >= 0) { c.waveT -= h; if (c.waveT <= 0) { c.waveT = -1; this._target(c, 0, cfg.swingKickWave); } } }
        all = true;
        for (i = 0; i < cards.length; i++) if (cards[i].open >= cfg.playAtHide || cards[i].openT > 0) { all = false; break; }
        if (all) this._startPlay();
        break;
      case 'play':
      case 'resolve': {
        if (!this._mis && this.open.length === 2) {
          var a = this.cardById(this.open[0]), b = this.cardById(this.open[1]);
          if (a.open >= cfg.matchAt && b.open >= cfg.matchAt) this._check();
        }
        var young = false;
        for (i = this._anims.length - 1; i >= 0; i--) {
          var M = this._anims[i]; M.t += h;
          if (M.t < cfg.matchResolveTime) young = true; else this._anims.splice(i, 1);
        }
        if (this._mis) {
          this._mis.t += h;
          if (this._mis.t >= this._mismatchShow()) {
            this._close(this.cardById(this._mis.a)); this._close(this.cardById(this._mis.b));
            this.open = []; this._mis = null;
          }
        }
        if (this.surprise && !this.critter && this._critterAt >= 0 && this.time >= this._critterAt && !this.solved) {
          this._critterAt = -2; this._spawnCritter();
        }
        if (this._doneT >= 0) {
          this._doneT += h;
          if (this._doneT >= cfg.matchCelebrate) { this._doneT = -1; this._startCheer(); }
          break;
        }
        if (this.solved) { if (this.phase !== 'resolve') this._setPhase('resolve'); break; }
        var want = this._mis || young ? 'resolve' : 'play';
        if (this.phase !== want) this._setPhase(want);
        this._idleT += h;
        if (this._idleT >= this._idleGap - 1e-9) {
          this._idleT = 0;
          this._idleGap = Math.min(cfg.idleMax, this._idleGap * cfg.idleBackoff);
          this._idleN++;
          this._mood('think');
          this._emit({ type: 'idle', n: this._idleN, promptKey: this.cur.promptKey, params: this.cur.params });
          if (this._idleN >= cfg.idleHintFrom) this._doHint(true);
        }
        break;
      }
      case 'cheer':
        this.cheer = Math.sin(Math.PI * clamp(this.phaseTime / cfg.cheerTime, 0, 1));
        if (this.phaseTime >= cfg.cheerTime) { this.cheer = 0; this._endRound(); }
        break;
    }
  };

  /** A leaf's pendulum about its stem top: ω 4.2, ζ 0.12, wind torque, clamp ±swingMax. */
  P._stepSwingOf = function (c, h, wind) {
    var cfg = this.cfg, w = cfg.swingOmega, z = cfg.swingZeta, tq = 0;
    if (wind) {
      var wv = this.wind || 0, mag = Math.max(Math.abs(wv), cfg.swingBreezeMin) * (wv < 0 ? -1 : 1);
      tq = cfg.swingWind * mag * (0.3 + 0.7 * Math.sin(TAU * cfg.swingBreezeHz * this.time + (c._ph || 0)));
    }
    c.vswing += (-w * w * c.swing - 2 * z * w * c.vswing + tq) * h;
    c.swing += c.vswing * h;
    if (c.swing > cfg.swingMax) { c.swing = cfg.swingMax; if (c.vswing > 0) c.vswing = 0; }
    else if (c.swing < -cfg.swingMax) { c.swing = -cfg.swingMax; if (c.vswing < 0) c.vswing = 0; }
  };

  /** One leaf: flip (spring + stop + fwip), hint lift, pendulum swing, sunbeam, orchid, face hops / wiggle. */
  P._stepLeaf = function (c, h) {
    var cfg = this.cfg, w, z, u;
    if (c.glowT > 0) c.glowT = Math.max(0, c.glowT - h);
    c.glow = c.glowT > 0 ? clamp(Math.min(c.glowT / 0.4, (cfg.hintGlowTime - c.glowT) / 0.2), 0, 1) : 0;
    if (c.state === 'down') {
      if (c.peekT >= 0) {
        c.peekT += h;
        var pk = c.peekT >= cfg.hintPeekDelay && c.peekT < cfg.hintPeekDelay + cfg.hintPeekHold ? cfg.hintPeekOpen : 0;
        if (c.peekT >= cfg.hintPeekDelay + cfg.hintPeekHold) c.peekT = -1;
        this._target(c, pk);
      } else if (c.waveT < 0 && (this.phase === 'play' || this.phase === 'resolve' || this.phase === 'cheer')) this._target(c, 0);
    }
    // cheer wave kick
    if (c._cheerT !== undefined && c._cheerT >= 0) { c._cheerT -= h; if (c._cheerT < 0) { c.vswing += cfg.swingCheer; c._cheerT = -1; } }
    // flip: under-damped spring, stop at openMax, a soft "fwip" when it settles back
    w = cfg.openOmega; z = cfg.openZeta;
    c._ov += (w * w * (c.openT - c.open) - 2 * z * w * c._ov) * h;
    c.open += c._ov * h;
    if (c.open > cfg.openMax) { c.open = cfg.openMax; if (c._ov > 0) c._ov = -c._ov * cfg.openStopBounce; }
    if (c.open < 0) {
      c.open = 0;
      if (c._ov < 0) {
        var vin = -c._ov;
        c._ov = vin < cfg.clackStopV ? 0 : vin * cfg.clackBounce;
        if (vin >= cfg.clackMinV) this._emit({ type: 'clack', id: c.id, v: vin });
      }
    }
    c.flip = clamp(c.open, 0, 1);
    this._stepSwingOf(c, h, true);
    // match: sunbeam, orchid, face hops
    if (c.state === 'matched') {
      c._mt += h;
      c.light = smooth((c._mt - cfg.matchHold) / cfg.lightTime);
      if (c._mt >= c._popA) {
        if (!c._popped) {
          c._popped = true;
          // the orchid opens on the stem bloomStemK·stem above the leaf top (rotated with the swing about the pivot)
          var r = c.stem * (1 - cfg.bloomStemK);
          this._emit({ type: 'bloom', id: c.id, x: c.px - Math.sin(c.swing) * r, y: c.py + Math.cos(c.swing) * r });
        }
        w = cfg.bloomOmega; z = cfg.bloomZeta;
        c._blv += (w * w * (1 - c.bloom) - 2 * z * w * c._blv) * h; c.bloom += c._blv * h;
      }
    }
    if (c._bT >= 0) { c._bT -= h; if (c._bT < 0 && c._bq > 0) { c._bq--; c._bvy = Math.sqrt(2 * cfg.bounceG * c._bPx); c._bt = 0; } }
    if (c._bvy > 0) {
      c._bt += h;
      var tH = 2 * c._bvy / cfg.bounceG;
      if (c._bt >= tH) {
        if (c._bq > 0) { c._bq--; c._bt -= tH; } else { c._bvy = 0; c._bt = 0; }
      }
      c.bounce = c._bvy > 0 ? Math.max(0, c._bvy * c._bt - 0.5 * cfg.bounceG * c._bt * c._bt) : 0;
    }
    c.wiggle = 0;
    if (c.shakeT >= 0) {
      c.shakeT += h; u = c.shakeT / cfg.shakeTime;
      if (u >= 1) c.shakeT = -1;
      else c.wiggle = cfg.shakeAmp * Math.sin(TAU * cfg.shakeWiggles * u) * (1 - u) * (1 - u);
    }
  };

  LL.World = World;
})(window.LL = window.LL || {});
