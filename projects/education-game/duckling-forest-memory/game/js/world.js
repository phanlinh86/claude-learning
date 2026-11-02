/* Dee's Forest Memory — DM.CONFIG + DM.World (headless, deterministic memory-card simulation; DESIGN §2, §5.2)
 *
 * ============================== CONVENTIONS ==============================
 *  Units: logical px (short side = 720), seconds, radians, y DOWN. rot > 0 = clockwise (canvas).
 *  update(dt) runs fixed sub-steps of cfg.step (1/120 s) with an accumulator. At the START of every sub-step each card,
 *  reward and acorn piece stores _px,_py,_prot (cards also _pflip); the renderer draws p = _p + (p − _p)·w.alpha.
 *  The result depends only on the seed and the sub-step at which inputs arrive.
 *
 *  Card c (state deal | down | up | matched | gone; skip 'gone'):
 *    centre (x, y), size w × h (already the grid size) × (sx, sy), rotation rot, c.alpha.
 *    flip 0 = back … 1 = face: draw scaleX·|cos(π·flip)|, the FACE when flip > 0.5, else the back; a slight skew for depth.
 *    lift 0..1: draw the card CONFIG.liftPx (8) px higher and its shadow bigger/softer. glow 0..1 = hint halo.
 *    'deal' cards with t < 0 still sit on the deck (layout.stack), small (sx = sy = CONFIG.stackScale), face down.
 *  Reward r (state fly | settle | idle), kinds:
 *    butterfly  centre (x, y), width r.size, r.flap 0 (wings closed) … 1 (open), r.face ±1 (facing), rot
 *    lantern    centre (x, y), r.size; if r.ax !== null a string from (ax, ay) to the lantern top; r.glow 0..1
 *    star       centre (x, y), r.size × (sx, sy), r.glow, r.text (letter / number on it)
 *    animal     BOTTOM-CENTRE anchor (x, y), width r.size, r.face ±1 (+1 = facing right, as the sprite), sx/sy about the anchor
 *    acorns     r.pieces[] { x, y, rot, _px, _py, _prot } acorn centres, each r.pieceSize wide (r.x, r.y = pile bottom centre)
 *    every reward: r.alpha (fades at the end of a chapter).
 *  Dee: w.dee { mood, moodT, lookX, lookY, hop } — hop = px ABOVE the feet anchor (layout.dee).
 * ========================================================================
 */
(function (DM) {
  'use strict';

  var CONFIG = {
    // ---- timing / state machine (s)
    step: 1 / 120,             // fixed simulation sub-step (≤ 1/120 per DESIGN)
    maxFrame: 1.0,             // largest dt accepted per update() (speed mode passes big dt)
    roundsPerLevel: 4,         // rounds per chapter (warm-up + 3)
    chapterTimeLimit: 80,      // s since the chapter began: after ≥ chapterMinRounds rounds go to Talk time once exceeded (DESIGN 90; playtest: the careful 4-year-old's p90 session 494 → 447 s)
    chapterMinRounds: 3,
    introTime: 2.5,            // chapter banner + season line + the 2.5 s season crossfade
    roundEndDelay: 0.4,        // s after the last pair burst → roundDone (the last reward flies on during roundDone) (playtest: 0.7 → 0.4)
    roundDoneTime: 1.8,        // stars + Dee's short praise, then the next round (playtest: 2.2 → 1.8)
    talkAfterAnswer: 2.0,      // the Talk panel stays after an answer
    levelDoneTime: 2.0,        // chapter stars (playtest: 2.4 → 2.0)
    rewardFadeTime: 1.2,       // rewards fade out during levelDone (they stay the whole chapter)
    talkAskTime: 12,           // s without an answer → talkAsk (re-ask), repeating
    talkGlowAfterAsks: 2,      // from this re-ask on talk.glowAnswer = true

    // ---- content tuning (playtest-tuned; null → the DESIGN tables DM.Content.PAIRS / PEEK)
    // DESIGN 3: 2,2,3,3 · 4: 2,3,4,4 · 5: 3,4,5,5 · 6–7: 3,4,5,6 gave a typical 4-year-old chapter of 119 s (target 60–100)
    // and typical sessions up to 527 s (target ≤ 480). Tuned: 94 s / ≤ 460 s (docs/MECHANICS.md §9).
    pairsByAge: { 3: [2, 2, 2, 3], 4: [2, 2, 3, 3], 5: [2, 3, 4, 4], 6: [3, 3, 4, 5], 7: [3, 4, 4, 5] },
    peekByAge: { 3: 2.8, 4: 2.2, 5: 2.0, 6: 1.5, 7: 1.5 },   // s face up (DESIGN 3.5 / 2.5 / 2.0 / 1.5 / 1.5)
    adaptHold: true,           // after a HARD round the next round does not grow (pairs = min(table, last round's pairs)) …
    adaptSlowPlay: 40,         // … hard = more than 40 s of play, or only 1 star

    // ---- layout (DESIGN §2; px)
    shortSide: 720, minLong: 960, maxLong: 1600,
    groundOffset: 90,          // groundY = H − ins.bottom − 90
    deeDxLand: 110, deeDyLand: 16, deeHLand: 180,   // Dee feet anchor, landscape
    deeDxPort: 100, deeDyPort: 20, deeHPort: 170,   // portrait
    deeBoxW: 1.0,              // Dee's box is h × (1.0·h) around the anchor (the 256² sprite) — used for keep-out tests
    bubbleX: 24, bubbleY: 20, bubbleMaxW: 640, bubbleRightGap: 160, bubbleH: 122,   // landscape bubble
    bubbleHPort: 124, bubbleGapPort: 24,   // portrait: the bubble sits BELOW the HUD: y = ins.top + hudH + 24
    hudW: 160, hudH: 96,       // DOM buttons top-right: x > W − ins.right − 160, y < ins.top + 96
    boardTopGap: 24,           // board starts 24 px below the bubble
    boardGroundGap: 10,        // … and ends 10 px above groundY (cards may cover the grass edge)
    boardDeeGapLand: 130,      // landscape: board x ≥ dee.x + 130 (DESIGN ≥ 120; +10 so cards are ≥ 40 px from Dee's box)
    boardSide: 24,             // side margins of the board
    boardDeeHeadGap: 10,       // portrait board A: bottom ≤ Dee's head − 10
    boardDeeSideGap: 40,       // portrait board B (right of Dee, down to the grass): x ≥ Dee's box right + 40
    stackDx: 72, stackDy: 30,  // the deck sits on the grass at (dee.x + 72, groundY + 30), in front of Dee's wing
    stackScale: 0.45,          // deck cards are drawn at 0.45× (they grow while flying to their slot)

    // ---- cards / grid
    cardAspect: 0.78,          // w : h
    gapFrac: 0.12, gapMin: 14, // gap = max(14, 0.12·cw)
    cardMin: { 3: 120, 4: 120, 5: 104, 6: 104, 7: 104 },   // smallest allowed card width per age
    cardMax: 210,              // cards never get wider than this (2-pair rounds on a big portrait screen)
    hitPad: 10,                // hit test = card rect grown by 10 px; nearest rect wins
    yellowDeeGap: 40,          // colour rounds: no yellow card within 40 px of Dee's box (Dee is yellow too)

    // deal: ballistic arcs from the deck, staggered, with a spin, landing squash
    dealStagger: 0.07,         // s between cards leaving the deck
    dealTime: [0.42, 0.62],    // flight time = 0.42 + d/2400 s, ≤ 0.62
    dealSpeed: 2400,
    dealGravity: 2600,         // px/s² (the arc's apex is ≈ g·T²/8 above the straight line)
    dealSpin: [0.5, 1.0],      // turns during the flight (random sign), ends at rot 0
    dealSquash: 0.12,          // landing squash q (sx = 1 + q, sy = 1 − q)
    dealSettle: 0.15,          // s after the last card landed → peek
    // flip: critically damped spring on flip (0 → 1 in ≈ 0.26 s to 95 %)
    flipOmega: 18,
    liftPx: 8,                 // renderer: a card rises liftPx·lift (lift = sin(π·flip) while turning)
    peekStagger: 0.05,         // peek wave (slot order) / hide wave (reverse)
    playAtHide: 0.5,           // play starts when every card's flip < 0.5 (faces hidden)
    squashOmega: 20, squashZeta: 0.35,   // card squash spring
    breathAmp: 0.012, breathHz: 0.35,    // face-down cards breathe ≤ 1.5 % in play
    // match / mismatch
    matchAt: 0.95,             // the check happens when the 2nd card's flip ≥ 0.95
    matchHold: 0.25,           // both faces shown, cards lift …
    matchResolveTime: 0.4,     // … phase back to 'play' 0.4 s after the check (the pair is still spinning away)
    matchSlideOmega: 11, matchSlideZeta: 0.8,   // spring to the pair's midpoint
    matchSpinDelay: 0.1,       // spin starts 0.1 s after the slide
    matchSpinOmega: 9, matchSpinZeta: 0.45,     // full turn with ≈ 20 % overshoot
    matchShrink: 0.86,         // the pair shrinks to 0.86× as it meets
    matchSquashAt: 0.7, matchSquash: 0.2,       // squash pulse at 0.7 s …
    matchBurstAt: 0.85,        // … burst at 0.85 s after the check → 'gone' + the reward
    mismatchShow: 1.0,         // s both faces stay up after a mismatch (age 3: mismatchShowByAge)
    mismatchShowByAge: { 3: 1.2 },   // (DESIGN 1.4; playtest 1.2 — the 3-year-old chapter was 116 s)
    shakeAmp: 0.08, shakeWiggles: 3, shakeTime: 0.5,   // "no-no": damped sine rotation, 3 wiggles in 0.5 s
    fastReset: true,           // 3rd tap while 2 mismatched cards are up: both flip down at once, the new one flips up

    // ---- help
    hintAfterStreak: 3,        // 3 mismatches in a row → hint (streak resets)
    hintCooldown: 6,           // s: no auto-hint while one glows nor within 6 s of the last
    hintGlowTime: 2.5,         // glow 2.5 s (fade in 0.2, out 0.4)
    hintPeekDelay: 0.2, hintPeekHold: 0.45,   // the hinted face-down cards half-turn (flip → 0.75) for 0.45 s …
    hintPeekFlip: 0.75,        // … 0.75 = the face is visible at 70 % width (0.5 would be edge-on)
    idleTime: 12,              // s without a tap in play → idle nudge …
    idleBackoff: 1.5, idleMax: 30,   // … gap ×1.5 per nudge up to 30 s
    idleHintFrom: 2,           // from the 2nd idle nudge of a round a hint glows too

    // ---- rewards (one per match; they stay the whole chapter)
    maxRewards: 30,            // per chapter (DESIGN §8)
    perchStep: 64,             // candidate perch grid (px)
    perchTight: 3,             // pick randomly among the 3 free perches closest to the other rewards (tight packing, still varied)
    perchMargin: 10,           // reward boxes keep 10 px from the cards, bubble, HUD, Dee and the safe-area edges
    groundPerchDy: 72,         // ground perches: bottom anchor at groundY + 72 (animals 70 px tall stay below the board)
    branchDy: [-420, -360, -300],   // branch heights relative to groundY (env artist: mid_* low branches) — lanterns hang here
    canopyDy: 26,              // + a branch row at ins.top + 26 (the canopy edge at the top of the screen)
    lilyCount: 2,              // the 2 rightmost ground perches are lily pads (frogs go there first)
    sizes: { butterfly: 46, star: 44, lantern: 52, animal: 70, acorn: 22 },
    lanternString: 36,         // px of string from the branch to the lantern top
    flyTime: [0.9, 1.8], flySpeed: 900,   // butterflies / stars / lanterns: T = 0.7 + d/900 s within [0.9, 1.8]
    flyArc: 0.35, flyArcMax: 170,         // bezier control point raised by 0.35·d (≤ 170 px)
    flutterAmp: 26, flutterHz: 2.2,       // butterflies: noisy sideways sine on the path
    flapHz: 9, flapIdleEvery: [2, 4], flapIdleTime: 0.5,   // wing beats in flight; lazy flaps when sitting
    settleTime: 0.6,
    hopG: 2600, hopApex: [80, 46, 30], animalHops: 3, hopSquash: 0.18,   // animals: 3 parabolic hops, apex 80/46/30 px
    idleHopEvery: [4, 8], idleHopPx: 10,  // resting animals do a tiny hop now and then
    acornG: 2000, acornRest: 0.4, acornFric: 0.75, acornRoll: 6, acornApex: [60, 130], acornStagger: 0.04, acornMax: 12,
    acornSpread: 34,           // pile half-width
    pendG: 980, pendDamp: 0.8, pendWind: 0.0025, pendKick: 0.32,   // lanterns: pendulum g/L, damping /s, wind torque, first swing
    starTwinkle: 0.1, starHz: 1.4, bobPx: 4,

    // ---- Dee
    moodTime: { happy: 0.9, cheer: 1.6, oops: 0.8, think: 1.4 },
    hopPx: { happy: 14, cheer: 26 }, hopTime: 0.4, lookRate: 6, lookHold: 3
  };
  DM.CONFIG = CONFIG;

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
  function inside(R, S) { return R.x >= S.x - 1e-6 && R.y >= S.y - 1e-6 && R.x + R.w <= S.x + S.w + 1e-6 && R.y + R.h <= S.y + S.h + 1e-6; }

  /** DESIGN §2 short-side rule: CSS viewport → logical W×H. */
  function logicalSize(cssW, cssH, cfg) {
    cfg = cfg || CONFIG;
    var S = cfg.shortSide, aspect = cssW / Math.max(1, cssH);
    if (cssW >= cssH) return { W: clamp(Math.round(S * aspect), cfg.minLong, cfg.maxLong), H: S };
    return { W: S, H: clamp(Math.round(S / aspect), cfg.minLong, cfg.maxLong) };
  }

  function computeLayout(W, H, ins, cfg) {
    ins = { top: +(ins && ins.top) || 0, right: +(ins && ins.right) || 0, bottom: +(ins && ins.bottom) || 0, left: +(ins && ins.left) || 0 };
    var portrait = H > W, tall = H / W > 1.6;
    var groundY = H - ins.bottom - cfg.groundOffset;
    var dee = portrait ? { x: ins.left + cfg.deeDxPort, y: groundY + cfg.deeDyPort, h: cfg.deeHPort }
      : { x: ins.left + cfg.deeDxLand, y: groundY + cfg.deeDyLand, h: cfg.deeHLand };
    var dw = dee.h * cfg.deeBoxW;
    var deeRect = { x: dee.x - dw / 2, y: dee.y - dee.h, w: dw, h: dee.h };
    var bx = ins.left + cfg.bubbleX;
    var bubble = portrait
      ? { x: bx, y: ins.top + cfg.hudH + cfg.bubbleGapPort, w: Math.min(cfg.bubbleMaxW, W - bx - ins.right - cfg.bubbleX), h: cfg.bubbleHPort }
      : { x: bx, y: ins.top + cfg.bubbleY, w: Math.min(cfg.bubbleMaxW, W - bx - ins.right - cfg.bubbleRightGap), h: cfg.bubbleH };
    var hud = { x: W - ins.right - cfg.hudW, y: 0, w: cfg.hudW + ins.right, h: ins.top + cfg.hudH };
    var top = bubble.y + bubble.h + cfg.boardTopGap, bottom = groundY - cfg.boardGroundGap, boards;
    if (!portrait) {
      var lx = dee.x + cfg.boardDeeGapLand;
      boards = [{ x: lx, y: top, w: W - ins.right - cfg.boardSide - lx, h: bottom - top }];
    } else {
      var ax = ins.left + cfg.boardSide, bxx = deeRect.x + deeRect.w + cfg.boardDeeSideGap;
      boards = [
        { x: ax, y: top, w: W - ins.right - cfg.boardSide - ax, h: deeRect.y - cfg.boardDeeHeadGap - top },   // A: above Dee
        { x: bxx, y: top, w: W - ins.right - cfg.boardSide - bxx, h: bottom - top }                              // B: right of Dee
      ];
    }
    boards.forEach(function (b) { b.w = Math.max(0, b.w); b.h = Math.max(0, b.h); });
    var L = {
      W: W, H: H, ins: ins, portrait: portrait, tall: tall, groundY: groundY, dee: dee, deeRect: deeRect, bubble: bubble, hud: hud,
      boards: boards, board: boards[0], stack: { x: dee.x + cfg.stackDx, y: groundY + cfg.stackDy },
      safe: { x: ins.left, y: ins.top, w: W - ins.left - ins.right, h: H - ins.top - ins.bottom },
      grid: null, perches: []
    };
    L.perchCands = perchCandidates(L, cfg);
    L.perches = L.perchCands.map(function (p) { return { x: p.x, y: p.y, kind: p.kind }; });
    return L;
  }

  /* ------------------------------------------------------------------ grid
   * Every cols × rows with cols·rows ≥ n and ≤ n + 1 (at most one empty slot, the last row centred), on every board
   * candidate (portrait: A above Dee, B right of Dee). Largest card wins (capped at cardMax); ties (< 0.5 px) prefer
   * more columns in landscape, more rows in portrait, then board A. */
  function fitCard(b, cols, rows, cfg) {
    var g = cfg.gapFrac, a = cfg.cardAspect;
    var cw = Math.min(b.w / (cols + g * (cols - 1)), b.h / (rows / a + g * (rows - 1)));
    if (g * cw < cfg.gapMin) cw = Math.min((b.w - cfg.gapMin * (cols - 1)) / cols, (b.h - cfg.gapMin * (rows - 1)) * a / rows);
    return Math.max(0, cw);
  }
  function chooseGrid(L, n, age, cfg) {
    var best = null;
    for (var bi = 0; bi < L.boards.length; bi++) {
      var b = L.boards[bi];
      for (var cols = 1; cols <= n; cols++) {
        var rows = Math.ceil(n / cols);
        if (cols * rows - n > 1) continue;
        var raw = fitCard(b, cols, rows, cfg), sc = Math.min(raw, cfg.cardMax);
        var better = !best || sc > best.sc + 0.5;
        if (!better && best && Math.abs(sc - best.sc) <= 0.5) {
          var pref = L.portrait ? rows - best.rows : cols - best.cols;
          better = pref > 0;
        }
        if (better) best = { sc: sc, raw: raw, cols: cols, rows: rows, bi: bi };
      }
    }
    var B = L.boards[best.bi], cw = best.sc, ch = cw / cfg.cardAspect, gap = Math.max(cfg.gapMin, cfg.gapFrac * cw);
    var gw = best.cols * cw + (best.cols - 1) * gap, gh = best.rows * ch + (best.rows - 1) * gap;
    var x0 = B.x + (B.w - gw) / 2, y0 = B.y + (B.h - gh) / 2, slots = [];
    for (var k = 0; k < n; k++) {
      var r = Math.floor(k / best.cols), c = k % best.cols, inRow = Math.min(best.cols, n - r * best.cols);
      var off = (best.cols - inRow) * (cw + gap) / 2;
      slots.push({ x: x0 + off + c * (cw + gap) + cw / 2, y: y0 + r * (ch + gap) + ch / 2 });
    }
    return { cols: best.cols, rows: best.rows, cw: cw, ch: ch, gap: gap, x0: x0, y0: y0, n: n, slots: slots, boardIndex: best.bi,
      board: B, rect: { x: x0, y: y0, w: gw, h: gh }, minOk: cw >= (cfg.cardMin[age] || cfg.cardMin[5]) - 1e-9 };
  }

  /* ------------------------------------------------------------------ perches
   * Candidate points (kind ground | lily | branch | air). A reward kind maps a point to its final anchor + box; a point is
   * valid for a reward when that box is inside the safe area and clear of the bubble, HUD, Dee and the CURRENT card grid
   * (all grown by perchMargin). Rewards whose box a new, bigger grid covers fly to a new perch at the round start. */
  function perchCandidates(L, cfg) {
    var out = [], ins = L.ins, st = cfg.perchStep, x, y, i;
    var gx = [], gy = L.groundY + cfg.groundPerchDy;
    for (x = ins.left + 44; x <= L.W - ins.right - 44 + 1e-6; x += st) gx.push(x);
    for (i = 0; i < gx.length; i++) out.push({ x: gx[i], y: gy, kind: i >= gx.length - cfg.lilyCount ? 'lily' : 'ground' });
    var bys = cfg.branchDy.map(function (d) { return L.groundY + d; }).concat([ins.top + cfg.canopyDy]);
    for (i = 0; i < bys.length; i++) for (x = ins.left + 40 + (i % 2) * st / 2; x <= L.W - ins.right - 40; x += st) out.push({ x: x, y: bys[i], kind: 'branch' });
    var row = 0;
    for (y = ins.top + 40; y <= L.groundY - 50; y += st * 0.85, row++)
      for (x = ins.left + 36 + (row % 2) * st / 2; x <= L.W - ins.right - 36; x += st) out.push({ x: x, y: y, kind: 'air' });
    return out;
  }
  var PREF = {
    butterfly: ['branch', 'ground', 'air'], lantern: ['branch', 'air'], star: ['air', 'branch'], acorns: ['ground', 'lily'],
    animal: ['ground', 'lily'], frog: ['lily', 'ground'], owl: ['branch', 'ground'], squirrel: ['branch', 'ground']
  };
  function prefFor(r) {
    if (r.kind === 'animal') { var a = String(r.sprite || '').replace('animal_', ''); return PREF[a] || PREF.animal; }
    return PREF[r.kind];
  }
  /** Final placement of reward kind at perch point p → { x, y, ax, ay, box }. */
  function placeAt(kind, p, cfg) {
    var S = cfg.sizes, s, o = { ax: null, ay: null };
    switch (kind) {
      case 'animal': s = S.animal; o.x = p.x; o.y = p.y; o.box = { x: p.x - s / 2, y: p.y - s, w: s, h: s }; break;
      case 'acorns': s = cfg.acornSpread + S.acorn / 2; o.x = p.x; o.y = p.y; o.box = { x: p.x - s, y: p.y - 2.2 * S.acorn, w: 2 * s, h: 2.2 * S.acorn }; break;
      case 'lantern':
        s = S.lantern;
        if (p.kind === 'branch') { o.ax = p.x; o.ay = p.y; o.x = p.x; o.y = p.y + cfg.lanternString + s / 2;
          o.box = { x: p.x - s / 2 - 18, y: p.y, w: s + 36, h: cfg.lanternString + s }; }
        else { o.x = p.x; o.y = p.y; o.box = { x: p.x - s / 2, y: p.y - s / 2 - 4, w: s, h: s + 8 }; }
        break;
      default: {   // butterfly, star: sit on a branch / flower, or hover in the air
        s = S[kind] || 44;
        var dy = p.kind === 'ground' || p.kind === 'lily' ? -s * 0.6 : p.kind === 'branch' ? -s * 0.45 : 0;
        o.x = p.x; o.y = p.y + dy;
        var pad = kind === 'star' ? s * 0.12 : 4;
        o.box = { x: o.x - s / 2 - pad, y: o.y - s / 2 - pad, w: s + 2 * pad, h: s + 2 * pad };
      }
    }
    return o;
  }
  function boxFree(box, L, cfg) {
    var m = cfg.perchMargin;
    if (!inside(box, inflate(L.safe, -6))) return false;
    var obs = [L.bubble, L.hud, L.deeRect];
    if (L.grid) obs.push(L.grid.rect);
    for (var i = 0; i < obs.length; i++) if (overlapArea(box, inflate(obs[i], m)) > 0) return false;
    return true;
  }

  // ------------------------------------------------------------------ World
  function World(opts) {
    opts = opts || {};
    this.cfg = merge(CONFIG, opts.config);
    this.seed = opts.seed !== undefined ? opts.seed : 1;
    this.rng = new DM.RNG(this.seed);
    this.age = DM.Content.ageOf(opts.age !== undefined ? opts.age : 4);
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
    this.held = null; this.pairsHeld = false; this.wind = 0; this._hard = false; this._lastPairs = 0; this._playStart = 0;
    this.finger = { x: 0, y: 0, down: false };
    this.dee = { mood: 'idle', moodT: 0, lookX: 0, lookY: 0, hop: 0, _hopT: -1, _hopPx: 0, _hopN: 0 };
    this.events = []; this.sessions = 0; this.interactive = false; this.solved = false;
    this._mis = null; this._anims = []; this._idleN = 0; this._idleT = 0; this._idleGap = this.cfg.idleTime; this._doneT = -1;
    this._lastHintT = -1e9; this.levelStartTime = 0; this._talkAskT = 0; this._talkAsks = 0; this._hist = [];
    this._lookId = null; this._lookT = -1e9; this._rewardN = 0; this._holdT = -1; this._lastTapId = null;
    this.setViewport(opts.width || 1280, opts.height || 720, opts.ins || null);
    this.dee.lookX = this.layout.board.x + this.layout.board.w / 2; this.dee.lookY = this.layout.board.y + this.layout.board.h / 2;
  }
  World.logicalSize = logicalSize;
  World.computeLayout = function (W, H, ins, cfg) { return computeLayout(W, H, ins, merge(CONFIG, cfg)); };
  World.chooseGrid = function (L, n, age, cfg) { return chooseGrid(L, n, DM.Content.ageOf(age || 4), merge(CONFIG, cfg)); };
  World.placeAt = function (kind, p, cfg) { return placeAt(kind, p, merge(CONFIG, cfg)); };
  World.rectGap = rectGap; World.overlapArea = overlapArea;

  var P = World.prototype;
  Object.defineProperty(P, 'items', { get: function () { return this.cards; } });
  P._emit = function (e) { this.events.push(e); };
  P.drainEvents = function () { var e = this.events; this.events = []; return e; };
  P.setAge = function (a) { this._pendingAge = DM.Content.ageOf(a); };
  P.setLang = function (l) { this._pendingLang = l === 'vi' ? 'vi' : 'en'; };
  P.cardById = function (id) { for (var i = 0; i < this.cards.length; i++) if (this.cards[i].id === id) return this.cards[i]; return null; };
  P.itemById = P.cardById;
  P.rewardById = function (id) { for (var i = 0; i < this.rewards.length; i++) if (this.rewards[i].id === id) return this.rewards[i]; return null; };
  P._setState = function (s) { this.state = s; this.stateTime = 0; };
  P._setPhase = function (p) { this.phase = p; this.phaseTime = 0; };
  P._mood = function (m) {
    var d = this.dee; d.mood = m; d.moodT = this.cfg.moodTime[m] || 1;
    if (this.cfg.hopPx[m]) { d._hopT = 0; d._hopPx = this.cfg.hopPx[m]; d._hopN = m === 'cheer' ? 3 : 1; }
  };
  P.cancelDrag = function () { this.finger.down = false; };
  P.skipTalk = function () { if (this.state === 'talk') this._levelDone(); };
  P.prompt = function () { return this.cur ? { promptKey: this.cur.promptKey, params: this.cur.params } : null; };
  P._mismatchShow = function () { var b = this.cfg.mismatchShowByAge; return (b && b[this.age] !== undefined) ? b[this.age] : this.cfg.mismatchShow; };
  /** Card rect (CSS-free, logical px) at its current position. */
  P.cardRect = function (c) { return { x: c.x - c.w / 2, y: c.y - c.h / 2, w: c.w, h: c.h }; };

  // ---------------------------------------------------------------- viewport
  P.setViewport = function (W, H, ins) {
    var keepGrid = this.layout && this.layout.grid;
    this.layout = computeLayout(W, H, ins, this.cfg);
    if (this.cur && this.cards.length) this._relayoutRound();
    else if (keepGrid) this.layout.grid = null;
    if (this.rewards.length) this._reperchAll(true);
  };

  P._relayoutRound = function () {
    var L = this.layout, g = chooseGrid(L, this.cards.length, this.age, this.cfg), i;
    L.grid = g; L.board = g.board;
    for (i = 0; i < this.cards.length; i++) {
      var c = this.cards[i], s = g.slots[c.slot];
      c.hx = s.x; c.hy = s.y; c.w = g.cw; c.h = g.ch;
      if (c.state === 'deal') { this._dealPath(c); if (c.t < 0) { c.x = c._px = L.stack.x; c.y = c._py = L.stack.y; } }
      else if (c.state !== 'matched') { c.x = c._px = s.x; c.y = c._py = s.y; c.vx = c.vy = 0; }
    }
    if (this.cur.topic === 'colors') this._yellowRule(false);
    for (i = 0; i < this._anims.length; i++) {
      var m = this._anims[i], a = this.cardById(m.a), b = this.cardById(m.b);
      m.mx = a._mx = b._mx = (a.hx + b.hx) / 2; m.my = a._my = b._my = (a.hy + b.hy) / 2;
    }
  };

  /** Colour rounds: swap yellow cards away from Dee (≥ yellowDeeGap from Dee's box). */
  P._yellowRule = function (atStart) {
    var L = this.layout, cfg = this.cfg, cards = this.cards, D = L.deeRect, self = this;
    function near(c) { return rectGap(self.cardRect({ x: c.hx, y: c.hy, w: c.w, h: c.h }), D) < cfg.yellowDeeGap - 1e-6; }
    for (var guard = 0; guard < cards.length; guard++) {
      var bad = null, i;
      for (i = 0; i < cards.length; i++) if (cards[i].face.color === 'yellow' && cards[i].state !== 'gone' && near(cards[i])) { bad = cards[i]; break; }
      if (!bad) return;
      var best = null, bd = -1;
      for (i = 0; i < cards.length; i++) {
        var o = cards[i]; if (o.face.color === 'yellow' || o.state === 'matched') continue;
        var d = rectGap(this.cardRect({ x: o.hx, y: o.hy, w: o.w, h: o.h }), D);
        if (d >= cfg.yellowDeeGap && d > bd) { bd = d; best = o; }
      }
      if (!best) return;
      var s = bad.slot; bad.slot = best.slot; best.slot = s;
      var g = L.grid, A = g.slots[bad.slot], Bs = g.slots[best.slot];
      bad.hx = A.x; bad.hy = A.y; best.hx = Bs.x; best.hy = Bs.y;
      if (!atStart) { bad.x = bad._px = A.x; bad.y = bad._py = A.y; best.x = best._px = Bs.x; best.y = best._py = Bs.y; }
      else { this._dealPath(bad); this._dealPath(best); }
    }
  };

  // ---------------------------------------------------------------- session flow
  P.newSession = function () {
    this.age = this._pendingAge; this.lang = this._pendingLang;
    this.sessions++;
    this.levels = DM.Content.topicsFor(this.age);
    this.stars = 0; this.collected = [];
    this._emit({ type: 'session', levels: this.levels.slice() });
    this.startLevel(0);
  };

  P.startLevel = function (i) {
    if (!this.levels.length) this.levels = DM.Content.topicsFor(this.age);
    this.level = clamp(i | 0, 0, this.levels.length - 1);
    this.topic = this.levels[this.level];
    this.weather = this.level;
    this.round = 0; this.levelStars = 0; this.levelStartTime = this.time; this._hist = []; this._hard = false; this._lastPairs = 0;
    this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.cards = []; this.rewards = []; this.open = []; this.cur = null; this.talk = null; this.talkAnswered = null;
    this.interactive = false; this.solved = false; this._mis = null; this._anims = []; this.layout.grid = null; this._rewardN = 0;
    this._setState('intro'); this.phase = null;
    this._emit({ type: 'level', level: this.level, topic: this.topic });
  };

  P._beginRound = function () {
    var cfg = this.cfg, L = this.layout, i;
    var rr = new DM.RNG((this.rng.next() * 4294967296) >>> 0);
    var want = DM.Content.pairsFor(this.topic, this.age, this.lang, this.round, cfg.pairsByAge), held = false;
    if (cfg.adaptHold && this._hard && this._lastPairs && want > this._lastPairs) { want = this._lastPairs; held = true; }
    var cur = DM.Content.makeRound(this.topic, { age: this.age, lang: this.lang, rng: rr, roundIndex: this.round, history: this._hist,
      pairs: want, peekByAge: cfg.peekByAge });
    this.pairsHeld = held;
    this.cur = cur; this._hist.push(cur.sum);
    this.mismatches = 0; this.streak = 0; this.found = 0; this.pairs = cur.pairs; this.open = []; this._mis = null; this._anims = [];
    this._idleN = 0; this._idleT = 0; this._idleGap = cfg.idleTime; this._doneT = -1; this._holdT = -1;
    this.interactive = false; this.solved = false;
    var g = chooseGrid(L, cur.cards.length, this.age, cfg);
    L.grid = g; L.board = g.board;
    this.cards = cur.cards.map(function (s, k) {
      return { id: s.id, key: s.key, face: s.face, nameKind: s.nameKind, nameValue: s.nameValue, size: s.size || null, word: s.word || null,
        slot: k, state: 'deal', t: -k * cfg.dealStagger, x: L.stack.x, y: L.stack.y - k * 1.5, _px: L.stack.x, _py: L.stack.y - k * 1.5,
        rot: 0, _prot: 0, w: g.cw, h: g.ch, hx: g.slots[k].x, hy: g.slots[k].y, vx: 0, vy: 0, vr: 0,
        flip: 0, _pflip: 0, _fv: 0, flipT: 0, lift: 0, _lv: 0, sx: cfg.stackScale, sy: cfg.stackScale, _q: 0, _qv: 0,
        glow: 0, glowT: 0, peekT: -1, waveT: -1, alpha: 1, shakeT: -1, _ph: rr.float(0, TAU), _spin: 0, _sv: 0, _scale: 1,
        _dT: 0, _dvx: 0, _dvy: 0, _dw: 0, _dx0: 0, _dy0: 0, _drot0: 0, _spinTurns: rr.float(cfg.dealSpin[0], cfg.dealSpin[1]) * (rr.chance(0.5) ? 1 : -1) };
    });
    for (i = 0; i < this.cards.length; i++) this._dealPath(this.cards[i]);
    if (cur.topic === 'colors') this._yellowRule(true);
    this._setState('round'); this._setPhase('deal');
    this._emit({ type: 'round', round: this.round, topic: this.topic, promptKey: cur.promptKey, params: cur.params, pairs: cur.pairs, held: held });
    this._reperchAll(false);     // rewards the new grid covers fly to a free perch
  };

  /** Ballistic deal path from the deck to the card's slot (re-computed if the slot changes before it lands). */
  P._dealPath = function (c) {
    var cfg = this.cfg, S = this.layout.stack, x0 = S.x, y0 = S.y;
    var d = hyp(c.hx - x0, c.hy - y0), T = clamp(cfg.dealTime[0] + d / cfg.dealSpeed, cfg.dealTime[0], cfg.dealTime[1]);
    c._dx0 = x0; c._dy0 = y0; c._dT = T;
    c._dvx = (c.hx - x0) / T; c._dvy = (c.hy - y0 - 0.5 * cfg.dealGravity * T * T) / T;
    c._dw = c._spinTurns * TAU / T; c._drot0 = -c._dw * T;
  };

  P._endRound = function () {
    var m = this.mismatches, N = this.pairs, st = m <= Math.max(1, N - 1) ? 3 : m <= 2 * N ? 2 : 1;
    this.roundStars = st; this.stars += st; this.levelStars += st;
    this._hard = st === 1 || this.time - this._playStart > this.cfg.adaptSlowPlay; this._lastPairs = N;
    this.interactive = false;
    this._setState('roundDone'); this.phase = 'done';
    this._mood('cheer');
    this._emit({ type: 'roundDone', round: this.round, stars: st, mismatches: m });
  };

  P._startTalk = function () {
    var rr = new DM.RNG((this.rng.next() * 4294967296) >>> 0);
    this.talk = DM.Content.makeTalk(this.topic, { age: this.age, lang: this.lang, rng: rr });
    this.talk.glowAnswer = false;
    this.talkAnswered = null; this._talkAskT = 0; this._talkAsks = 0;
    this.cards = []; this.open = []; this.cur = null; this.layout.grid = null; this.phase = null;
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
  /** The card under (x, y): rect grown by hitPad; inside several → nearest centre. 'gone' / dealing cards never hit. */
  P._hit = function (x, y) {
    var best = null, bd = 1e9, pad = this.cfg.hitPad;
    for (var i = 0; i < this.cards.length; i++) {
      var c = this.cards[i];
      if (c.state === 'gone' || c.state === 'deal') continue;
      var hw = c.w * Math.max(c.sx, 0.5) / 2 + pad, hh = c.h * Math.max(c.sy, 0.5) / 2 + pad;
      var dx = Math.abs(x - c.x), dy = Math.abs(y - c.y);
      if (dx > hw || dy > hh) continue;
      var d = hyp(x - c.x, y - c.y);
      if (d < bd - 1e-9) { bd = d; best = c; }
    }
    return best;
  };

  P.pointerDown = function (x, y) {
    this.finger.x = x; this.finger.y = y; this.finger.down = true;
    if (this.state !== 'round' || this.solved) return null;
    var ph = this.phase;
    if (ph !== 'play' && ph !== 'resolve') return null;
    this._idleT = 0; this._idleGap = this.cfg.idleTime;      // any touch shows the child is here
    var c = this._hit(x, y);
    if (!c) return null;
    this._lookId = c.id; this._lookT = this.time; this._lastTapId = c.id;
    if (c.state === 'matched' || c.state === 'up') { this._emitTap(c); return c.id; }
    // c is face down
    if (ph === 'resolve' && !this._mis) return null;          // a pair was just found (≤ matchResolveTime): flips wait
    if (this.open.length < 2) { this._flipUp(c); return c.id; }
    var a = this.cardById(this.open[0]), b = this.cardById(this.open[1]);
    if (a.key === b.key || !this.cfg.fastReset) return null; // a match is about to be confirmed
    // impatient third tap: the two mismatched cards flip down at once, the new one flips up
    if (!this._mis) this._mismatch(a, b, false);
    this._flipDown(a); this._flipDown(b);
    this.open = []; this._mis = null; this._setPhase('play');
    this._flipUp(c);
    return c.id;
  };
  P.pointerMove = function (x, y) { this.finger.x = x; this.finger.y = y; };
  P.pointerUp = function (x, y) { if (x !== undefined) { this.finger.x = x; this.finger.y = y; } this.finger.down = false; };

  P._emitTap = function (c) { this._emit({ type: 'tap', id: c.id, nameKind: c.nameKind, nameValue: c.nameValue, face: c.face, size: c.size }); };
  P._flipUp = function (c) {
    c.state = 'up'; c.flipT = 1; c.peekT = -1;
    this.open.push(c.id);
    this._emit({ type: 'flip', id: c.id, nameKind: c.nameKind, nameValue: c.nameValue, face: c.face, size: c.size, open: this.open.length });
  };
  P._flipDown = function (c) { c.state = 'down'; c.flipT = 0; c.shakeT = -1; };

  P._names = function (ev, a, b) {
    ev.nameKindA = a.nameKind; ev.nameValueA = a.nameValue; ev.faceA = a.face; ev.sizeA = a.size;
    ev.nameKindB = b.nameKind; ev.nameValueB = b.nameValue; ev.faceB = b.face; ev.sizeB = b.size;
    return ev;
  };

  P._check = function () {
    var a = this.cardById(this.open[0]), b = this.cardById(this.open[1]);
    if (a.key === b.key) this._match(a, b); else this._mismatch(a, b, true);
    this.open = a.key === b.key ? [] : this.open;
  };

  P._match = function (a, b) {
    var cfg = this.cfg, info = this.cur.pairInfo[a.key];
    a.state = b.state = 'matched'; a.flipT = b.flipT = 1;
    this.open = []; this.found++; this.streak = 0;
    var last = this.found >= this.pairs;
    var M = { a: a.id, b: b.id, t: 0, mx: (a.hx + b.hx) / 2, my: (a.hy + b.hy) / 2, burst: false, info: info, last: last };
    this._anims.push(M);
    a._mt = b._mt = 0; a.glowT = b.glowT = 0; a.peekT = b.peekT = -1;
    a._mx = b._mx = M.mx; a._my = b._my = M.my;
    this._setPhase('resolve');
    this._mood(last ? 'cheer' : 'happy');
    var ev = { type: 'match', a: a.id, b: b.id, key: a.key, nameKind: info.nameKind, nameValue: info.nameValue, found: this.found, pairs: this.pairs };
    ['parity', 'animal', 'word', 'text', 'lower'].forEach(function (k) { if (info[k] !== undefined) ev[k] = info[k]; });
    this._emit(this._names(ev, a, b));
    if (last) { this.solved = true; this.interactive = false; }
  };

  P._mismatch = function (a, b, show) {
    var cfg = this.cfg;
    this.mismatches++; this.streak++;
    this._mood('oops');
    if (show) {
      this._mis = { a: a.id, b: b.id, t: 0 };
      this._setPhase('resolve');
      a.shakeT = b.shakeT = 0;
    }
    var ev = { type: 'mismatch', a: a.id, b: b.id, streak: this.streak, mismatches: this.mismatches };
    this._emit(this._names(ev, a, b));
    if (this.streak >= cfg.hintAfterStreak) { if (this._autoHint() !== null) this.streak = 0; }
  };

  /** The pair to hint: the partner of a single open card, else the pair of the last tapped card, else a random unfound pair. */
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
    this._lookId = pr[0].id; this._lookT = this.time;
    this._mood('think');
    var ev = { type: 'hint', a: pr[0].id, b: pr[1].id, nameKind: pr[0].nameKind, nameValue: pr[0].nameValue };
    if (fromIdle) ev.idle = true;
    this._emit(ev);
    return pr[0].id;
  };
  /** Manual hint (tap on Dee / the bubble): glows one pair; no event if it already glows. */
  P.hint = function () {
    if (this.state !== 'round' || this.solved || (this.phase !== 'play' && this.phase !== 'resolve')) return null;
    var pr = this._hintPair();
    if (!pr) return null;
    if (pr[0].glowT > 0) return pr[0].id;
    return this._doHint(false);
  };

  // ---------------------------------------------------------------- rewards
  P._spawnReward = function (R) {
    var cfg = this.cfg, info = R.info.reward, rr = this.rng;
    if (this.rewards.length >= cfg.maxRewards) this.rewards.shift();
    var k = this._rewardN++;
    var r = { id: 'r' + k, kind: info.kind, color: info.color || null, shape: info.shape || null, sprite: info.sprite || null,
      n: info.n || null, text: info.text || null, key: R.info.key || null,
      x: R.mx, y: R.my, _px: R.mx, _py: R.my, rot: 0, _prot: 0, sx: 1, sy: 1, alpha: 1, flap: 1, face: 1, glow: 0,
      size: cfg.sizes[info.kind === 'acorns' ? 'acorn' : info.kind], pieceSize: cfg.sizes.acorn,
      anchor: info.kind === 'animal' ? 'bottom' : 'center', ax: null, ay: null, state: 'fly', t: 0, perch: null, target: null,
      _ph: rr.float(0, TAU), _q: 0, _qv: 0, _nextIdle: rr.float(2, 5), pieces: null, _th: 0, _tw: 0 };
    if (r.kind === 'animal') r.y = r._py = R.my + r.size / 2;
    this.rewards.push(r);
    this.collected.push({ kind: r.kind, color: r.color, shape: r.shape, sprite: r.sprite, n: r.n, text: r.text });
    this._perch(r, false);
    this._emit({ type: 'reward', id: r.id, kind: r.kind, x: R.mx, y: R.my, color: r.color, shape: r.shape, sprite: r.sprite, n: r.n, text: r.text });
    return r;
  };

  /** Picks a free perch for r (tiers by kind preference; least overlap with other rewards) and starts its flight. */
  P._perch = function (r, snap) {
    var L = this.layout, cfg = this.cfg, pref = prefFor(r), boxes = [], i, j;
    for (i = 0; i < this.rewards.length; i++) { var o = this.rewards[i]; if (o !== r && o.target) boxes.push(o.target.box); }
    var best = null, bestScore = 1e18;
    var free = [];
    for (j = 0; j < pref.length; j++) {
      free = [];
      for (i = 0; i < L.perchCands.length; i++) {
        var p = L.perchCands[i];
        if (p.kind !== pref[j]) continue;
        var pl = placeAt(r.kind, p, cfg);
        if (!boxFree(pl.box, L, cfg)) continue;
        var ov = 0;
        for (var b = 0; b < boxes.length; b++) ov += overlapArea(pl.box, boxes[b]);
        pl.kind = p.kind;
        if (ov === 0) {   // tightness: distance to the nearest other reward box (tight packing leaves room for later ones)
          var gap = 1e9;
          for (var b2 = 0; b2 < boxes.length; b2++) gap = Math.min(gap, rectGap(pl.box, boxes[b2]));
          pl._gap = gap; free.push(pl);
        }
        var score = ov * 10 + j;
        if (score < bestScore) { bestScore = score; best = pl; }
      }
      if (free.length) break;
    }
    var pick = best;
    if (free.length) {
      if (boxes.length) { free.sort(function (u, v) { return u._gap - v._gap || u.x - v.x || u.y - v.y; }); free = free.slice(0, cfg.perchTight); }
      pick = free[Math.floor(this.rng.next() * free.length)];
    }
    if (!pick) {   // nothing valid at all (tiny screen): the ground strip in the middle
      pick = placeAt(r.kind, { x: L.W / 2, y: L.groundY + cfg.groundPerchDy, kind: 'ground' }, cfg); pick.kind = 'ground';
    }
    r.target = pick; r.perch = { kind: pick.kind, x: pick.x, y: pick.y };
    if (snap) this._snapReward(r); else this._fly(r);
  };

  /** Re-perch rewards whose target box the current grid covers (round start) or everything (resize: snap). */
  P._reperchAll = function (snap) {
    var L = this.layout, cfg = this.cfg, list = this.rewards.slice(), i;
    if (snap) { for (i = 0; i < list.length; i++) list[i].target = null; for (i = 0; i < list.length; i++) this._perch(list[i], true); return; }
    for (i = 0; i < list.length; i++) {
      var r = list[i];
      if (r.target && !boxFree(r.target.box, L, cfg)) { r.target = null; this._perch(r, false); }
    }
  };

  P._snapReward = function (r) {
    var T = r.target;
    r.x = r._px = T.x; r.y = r._py = T.y; r.ax = T.ax; r.ay = T.ay; r.rot = r._prot = 0; r.state = 'idle'; r.t = 0; r._th = 0; r._tw = 0;
    if (r.kind === 'acorns') this._makePieces(r, true);
  };

  /** Starts the flight from the reward's current position to r.target. */
  P._fly = function (r) {
    var cfg = this.cfg, T = r.target, x0 = r.x, y0 = r.y, d = hyp(T.x - x0, T.y - y0), rr = this.rng;
    r.state = 'fly'; r.t = 0; r.ax = null; r.ay = null;
    r.face = T.x >= x0 ? 1 : -1;
    if (r.kind === 'animal') {
      var n = cfg.animalHops, pts = [{ x: x0, y: y0 }];
      for (var k = 1; k < n; k++) {
        var u = k === 1 ? 0.55 : 0.55 + 0.45 * (k - 1) / (n - 1);
        pts.push({ x: x0 + (T.x - x0) * u, y: T.y + (y0 - T.y) * (1 - u) * (T.y < y0 ? 1 : 0) });
      }
      pts.push({ x: T.x, y: T.y });
      r._hops = []; for (k = 0; k < n; k++) r._hops.push(this._hop(pts[k], pts[k + 1], cfg.hopApex[k] || 30, cfg.hopG));
      r._hopI = 0; r._hopT = 0;
    } else if (r.kind === 'acorns') {
      this._makePieces(r, false);
    } else {
      var arc = Math.min(cfg.flyArcMax, cfg.flyArc * d);
      r._bz = { x0: x0, y0: y0, cx: (x0 + T.x) / 2, cy: Math.min(y0, T.y) - arc, x1: T.x, y1: T.y,
        T: clamp(0.7 + d / cfg.flySpeed, cfg.flyTime[0], cfg.flyTime[1]) };
    }
  };

  /** A parabolic hop from a to b with an apex ≥ apex px above the higher end (kept on screen). */
  P._hop = function (a, b, apex, g) {
    var top = this.layout.ins.top + 30;
    var H = Math.max(apex, a.y - b.y + apex);
    if (a.y - H < top) H = Math.max(Math.max(0, a.y - b.y) + 4, a.y - top);
    var vy = -Math.sqrt(2 * g * H), dy = b.y - a.y;
    var T = (-vy + Math.sqrt(Math.max(0, vy * vy + 2 * g * dy))) / g;
    T = Math.max(T, 0.12);
    return { x0: a.x, y0: a.y, vx: (b.x - a.x) / T, vy: vy, T: T, g: g, x1: b.x, y1: b.y };
  };

  P._makePieces = function (r, rest) {
    var cfg = this.cfg, T = r.target, n = Math.min(cfg.acornMax, Math.max(1, r.n || 1)), rr = this.rng, R = cfg.sizes.acorn / 2;
    var bottom = Math.min(n, 6), sp = cfg.acornSpread, x0 = r.x, y0 = r.y;
    r.pieces = [];
    for (var k = 0; k < n; k++) {
      var lay = k < bottom ? 0 : 1, idx = lay ? k - bottom : k, cnt = lay ? n - bottom : bottom;
      var tx = T.x + (cnt > 1 ? (idx / (cnt - 1) - 0.5) * 2 * (sp - R) * (lay ? 0.7 : 1) : 0) + (rest ? 0 : rr.float(-4, 4));
      var ty = T.y - R - lay * R * 1.3;
      var pc = { x: x0, y: y0, _px: x0, _py: y0, rot: 0, _prot: 0, vx: 0, vy: 0, vr: 0, tx: tx, ty: ty, state: 'wait',
        delay: k * cfg.acornStagger, hop: null };
      if (rest) { pc.x = pc._px = tx; pc.y = pc._py = ty; pc.state = 'rest'; pc.rot = pc._prot = rr.float(-0.4, 0.4); }
      else pc.hop = this._hop({ x: x0 + rr.float(-8, 8), y: y0 }, { x: tx, y: ty }, rr.float(cfg.acornApex[0], cfg.acornApex[1]), cfg.acornG);
      r.pieces.push(pc);
    }
  };

  P._stepReward = function (r, h) {
    var cfg = this.cfg, T = r.target, i, u;
    r.t += h;
    if (this.state === 'levelDone') r.alpha = 1 - clamp(this.stateTime / cfg.rewardFadeTime, 0, 1);
    switch (r.kind) {
      case 'butterfly': case 'star': case 'lantern': {
        if (r.state === 'fly') {
          var B = r._bz; u = clamp(r.t / B.T, 0, 1);
          var s = smooth(u), q = 1 - s;
          var bx = q * q * B.x0 + 2 * q * s * B.cx + s * s * B.x1, by = q * q * B.y0 + 2 * q * s * B.cy + s * s * B.y1;
          if (r.kind === 'butterfly') {
            var dx = 2 * q * (B.cx - B.x0) + 2 * s * (B.x1 - B.cx), dy = 2 * q * (B.cy - B.y0) + 2 * s * (B.y1 - B.cy), dl = hyp(dx, dy) || 1;
            var fl = cfg.flutterAmp * Math.sin(Math.PI * u) * (Math.sin(TAU * cfg.flutterHz * r.t + r._ph) + 0.4 * Math.sin(TAU * 3.7 * r.t + 2 * r._ph));
            bx += -dy / dl * fl; by += dx / dl * fl;
            r.flap = 0.5 + 0.5 * Math.cos(TAU * cfg.flapHz * r.t);
            r.rot = clamp(dx / dl * 0.25, -0.3, 0.3); r.face = dx >= 0 ? 1 : -1;
          } else if (r.kind === 'star') { r.rot += 4 * h; r.glow = 1; }
          else { r.rot = clamp((B.x1 - B.x0) * 0.0006 * Math.sin(Math.PI * u), -0.3, 0.3); r.glow = 0.6 + 0.4 * u; }
          r.x = bx; r.y = by;
          if (u >= 1) {
            r.x = T.x; r.y = T.y; r.state = 'settle'; r.t = 0;
            if (r.kind === 'lantern' && T.ax !== null) { r.ax = T.ax; r.ay = T.ay; r._th = cfg.pendKick * r.face; r._tw = 0; }
            this._emit({ type: 'land', id: r.id, kind: r.kind, x: r.x, y: r.y });
          }
        } else {
          if (r.state === 'settle' && r.t >= cfg.settleTime) { r.state = 'idle'; r.t = 0; }
          if (r.kind === 'butterfly') {
            var flapping = r.state === 'settle' || r._idleFlap > 0;
            if (r.state === 'idle') { r._nextIdle -= h; if (r._nextIdle <= 0) { r._idleFlap = cfg.flapIdleTime; r._nextIdle = this.rng.float(cfg.flapIdleEvery[0], cfg.flapIdleEvery[1]); } }
            if (r._idleFlap > 0) r._idleFlap -= h;
            var slow = r.state === 'settle' ? 1 - r.t / cfg.settleTime : 0.5;
            r.flap = flapping ? 0.5 + 0.5 * Math.cos(TAU * cfg.flapHz * (0.5 + 0.5 * slow) * r.t) : Math.max(0.15, r.flap - 3 * h);
            r.rot += (0 - r.rot) * Math.min(1, 8 * h);
            r.x = T.x; r.y = T.y;
          } else if (r.kind === 'star') {
            r.sx = r.sy = 1 + cfg.starTwinkle * Math.sin(TAU * cfg.starHz * this.time + r._ph);
            r.rot = 0.15 * Math.sin(0.8 * this.time + r._ph);
            r.x = T.x; r.y = T.y + cfg.bobPx * Math.sin(1.3 * this.time + r._ph);
            r.glow = 0.65 + 0.35 * Math.sin(TAU * 0.7 * this.time + r._ph);
          } else {   // lantern: pendulum from the branch, nudged by the wind
            r.glow = 0.8 + 0.2 * Math.sin(5.3 * this.time + r._ph) * Math.sin(2.1 * this.time);
            if (r.ax !== null) {
              var Lp = cfg.lanternString + r.size / 2;
              r._tw += (-(cfg.pendG / Lp) * Math.sin(r._th) - cfg.pendDamp * r._tw + cfg.pendWind * this.wind * 9.8) * h;
              r._th += r._tw * h;
              r._th = clamp(r._th, -1, 1);
              r.x = r.ax + Lp * Math.sin(r._th); r.y = r.ay + Lp * Math.cos(r._th);
              r.rot = -r._th;
            } else { r.x = T.x; r.y = T.y + cfg.bobPx * Math.sin(1.1 * this.time + r._ph); r.rot = 0.05 * Math.sin(0.9 * this.time + r._ph); }
          }
        }
        break;
      }
      case 'animal': {
        if (r.state === 'fly') {
          var hp = r._hops[r._hopI];
          r._hopT += h;
          var tt = Math.min(r._hopT, hp.T);
          r.x = hp.x0 + hp.vx * tt; r.y = hp.y0 + hp.vy * tt + 0.5 * hp.g * tt * tt;
          r.rot = 0.12 * r.face * Math.sin(Math.PI * tt / hp.T);
          if (r._hopT >= hp.T) {
            r.x = hp.x1; r.y = hp.y1; r.rot = 0;
            var vy = hp.vy + hp.g * hp.T;
            r._q = cfg.hopSquash * clamp(vy / 700, 0.4, 1.2); r._qv = 0;
            r._hopI++; r._hopT = 0;
            if (r._hopI >= r._hops.length) { r.state = 'settle'; r.t = 0; this._emit({ type: 'land', id: r.id, kind: r.kind, x: r.x, y: r.y }); }
          }
        } else {
          if (r.state === 'settle' && r.t >= cfg.settleTime) { r.state = 'idle'; r.t = 0; }
          if (r.state === 'idle') {
            r._nextIdle -= h;
            if (r._nextIdle <= 0 && !r._ih) { r._ih = this._hop({ x: T.x, y: T.y }, { x: T.x, y: T.y }, cfg.idleHopPx, cfg.hopG); r._ihT = 0; r._nextIdle = this.rng.float(cfg.idleHopEvery[0], cfg.idleHopEvery[1]); }
          }
          if (r._ih) {
            r._ihT += h; var it = Math.min(r._ihT, r._ih.T);
            r.y = T.y + r._ih.vy * it + 0.5 * r._ih.g * it * it;
            if (r._ihT >= r._ih.T) { r._ih = null; r.y = T.y; r._q = cfg.hopSquash * 0.4; r._qv = 0; }
          } else r.y = T.y;
          r.x = T.x;
        }
        var w = 18, z = 0.3;
        r._qv += (-w * w * r._q - 2 * z * w * r._qv) * h; r._q += r._qv * h;
        r.sx = 1 + r._q; r.sy = 1 - r._q + (r.state === 'idle' && !r._ih ? 0.02 * Math.sin(TAU * 0.5 * this.time + r._ph) : 0);
        break;
      }
      case 'acorns': {
        var all = true, any = false, R = cfg.sizes.acorn / 2;
        for (i = 0; i < r.pieces.length; i++) {
          var pc = r.pieces[i];
          pc._px = pc.x; pc._py = pc.y; pc._prot = pc.rot;
          if (pc.state === 'wait') { pc.delay -= h; if (pc.delay <= 0) { pc.state = 'air'; pc.vx = pc.hop.vx; pc.vy = pc.hop.vy; pc.vr = pc.hop.vx / R * 0.5; } all = false; continue; }
          if (pc.state === 'air' || pc.state === 'bounce') {
            pc.vy += cfg.acornG * h; pc.x += pc.vx * h; pc.y += pc.vy * h; pc.rot += pc.vr * h;
            if (pc.state === 'air') pc.x = clamp(pc.x, Math.min(pc.hop.x0, pc.tx) - 1, Math.max(pc.hop.x0, pc.tx) + 1);
            if (pc.y >= pc.ty && pc.vy > 0) {
              pc.y = pc.ty;
              if (pc.state === 'air') { any = true; pc.vx = clamp(pc.vx * 0.15, -60, 60); }
              pc.state = 'bounce';
              pc.vy = -cfg.acornRest * pc.vy; pc.vx *= cfg.acornFric; pc.vr = pc.vx / R;
              if (Math.abs(pc.vy) < 60) { pc.vy = 0; pc.state = 'roll'; }
            }
            if (pc.state !== 'roll') all = false;
          }
          if (pc.state === 'roll') {
            pc.vx -= pc.vx * Math.min(1, cfg.acornRoll * h);
            pc.x += pc.vx * h; pc.rot += pc.vx / R * h;
            pc.x = clamp(pc.x, T.x - cfg.acornSpread + R, T.x + cfg.acornSpread - R);
            if (Math.abs(pc.vx) < 2) { pc.vx = 0; pc.state = 'rest'; }
            else all = false;
          }
        }
        if (r.state === 'fly' && r.pieces.some(function (p) { return p.state === 'bounce' || p.state === 'roll' || p.state === 'rest'; })) {
          r.state = 'settle'; r.t = 0; this._emit({ type: 'land', id: r.id, kind: r.kind, x: T.x, y: T.y });
        }
        if (r.state === 'settle' && all) { r.state = 'idle'; r.t = 0; }
        r.x = T.x; r.y = T.y;
        break;
      }
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

  P._step = function (h) {
    var cfg = this.cfg, i;
    for (i = 0; i < this.cards.length; i++) { var o = this.cards[i]; o._px = o.x; o._py = o.y; o._prot = o.rot; o._pflip = o.flip; }
    for (i = 0; i < this.rewards.length; i++) { var q = this.rewards[i]; q._px = q.x; q._py = q.y; q._prot = q.rot; }
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
          else { this._setState('sessionDone'); this.cards = []; this.rewards = []; this._emit({ type: 'sessionDone', stars: this.stars, rewards: this.collected.length }); }
        }
        break;
    }
    for (i = 0; i < this.cards.length; i++) this._stepCard(this.cards[i], h);
    for (i = 0; i < this.rewards.length; i++) this._stepReward(this.rewards[i], h);
    this._stepDee(h);
  };

  P._stepRound = function (h) {
    var cfg = this.cfg, cards = this.cards, i, c, all;
    switch (this.phase) {
      case 'deal':
        all = true;
        for (i = 0; i < cards.length; i++) if (cards[i].state === 'deal') { all = false; break; }
        if (all && this._holdT < 0) this._holdT = 0;
        if (this._holdT >= 0) {
          this._holdT += h;
          if (this._holdT >= cfg.dealSettle) {
            this._holdT = -1; this._setPhase('peek');
            for (i = 0; i < cards.length; i++) cards[i].waveT = cards[i].slot * cfg.peekStagger;
            this._emit({ type: 'peek' });
          }
        }
        break;
      case 'peek':
        for (i = 0; i < cards.length; i++) { c = cards[i]; if (c.waveT >= 0) { c.waveT -= h; if (c.waveT <= 0) { c.waveT = -1; c.flipT = 1; } } }
        all = true;
        for (i = 0; i < cards.length; i++) if (cards[i].flip < 0.95) { all = false; break; }
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
        for (i = 0; i < cards.length; i++) { c = cards[i]; if (c.waveT >= 0) { c.waveT -= h; if (c.waveT <= 0) { c.waveT = -1; c.flipT = 0; } } }
        all = true;
        for (i = 0; i < cards.length; i++) if (cards[i].flip >= cfg.playAtHide || cards[i].flipT > 0) { all = false; break; }
        if (all) {
          this._setPhase('play'); this.interactive = true; this._idleT = 0; this._playStart = this.time;
          this._emit({ type: 'play' });
        }
        break;
      case 'play':
      case 'resolve':
      case 'done': {
        if (!this._mis && this.open.length === 2) {
          var a = this.cardById(this.open[0]), b = this.cardById(this.open[1]);
          if (a.flip >= cfg.matchAt && b.flip >= cfg.matchAt) this._check();
        }
        var young = false;
        for (i = this._anims.length - 1; i >= 0; i--) {
          var M = this._anims[i];
          M.t += h;
          if (M.t < cfg.matchResolveTime) young = true;
          if (M.t >= cfg.matchBurstAt) {
            var ca = this.cardById(M.a), cb = this.cardById(M.b);
            ca.state = cb.state = 'gone'; ca.alpha = cb.alpha = 0;
            M.info.key = ca.key;
            this._spawnReward(M);
            this._anims.splice(i, 1);
            if (M.last) this._doneT = 0;
          }
        }
        if (this._mis) {
          this._mis.t += h;
          if (this._mis.t >= this._mismatchShow()) {
            this._flipDown(this.cardById(this._mis.a)); this._flipDown(this.cardById(this._mis.b));
            this.open = []; this._mis = null;
          }
        }
        if (this._doneT >= 0) {
          if (this.phase !== 'done') this._setPhase('done');
          this._doneT += h;
          if (this._doneT >= cfg.roundEndDelay) { this._doneT = -1; this._endRound(); }
          break;
        }
        if (this.solved) { if (this.phase !== 'resolve') this._setPhase('resolve'); break; }
        var want = this._mis || young ? 'resolve' : 'play';
        if (this.phase !== want) this._setPhase(want);
        // idle nudges (only while playing)
        if (!this.solved) {
          this._idleT += h;
          if (this._idleT >= this._idleGap - 1e-9) {
            this._idleT = 0;
            this._idleGap = Math.min(cfg.idleMax, this._idleGap * cfg.idleBackoff);
            this._idleN++;
            this._mood('think');
            this._emit({ type: 'idle', n: this._idleN, promptKey: this.cur.promptKey, params: this.cur.params });
            if (this._idleN >= cfg.idleHintFrom) this._doHint(true);
          }
        }
        break;
      }
    }
  };

  /** A matching pair keeps spinning while the round goes on: their resolve record is kept on the cards (_m). */
  P._stepCard = function (c, h) {
    var cfg = this.cfg, w, z, u;
    c.t += h;
    if (c.glowT > 0) c.glowT = Math.max(0, c.glowT - h);
    c.glow = c.glowT > 0 ? clamp(Math.min(c.glowT / 0.4, (cfg.hintGlowTime - c.glowT) / 0.2), 0, 1) : 0;
    if (c.state === 'gone') return;
    if (c.state === 'deal') {
      if (c.t < 0) return;
      if (!c._dealt) { c._dealt = true; this._emit({ type: 'deal', id: c.id }); }
      var tt = Math.min(c.t, c._dT);
      c.x = c._dx0 + c._dvx * tt; c.y = c._dy0 + c._dvy * tt + 0.5 * cfg.dealGravity * tt * tt;
      c.rot = c._drot0 + c._dw * tt;
      c.sx = c.sy = cfg.stackScale + (1 - cfg.stackScale) * smooth(tt / c._dT);
      if (c.t >= c._dT) {
        c.state = 'down'; c.x = c.hx; c.y = c.hy; c.rot = 0; c.sx = c.sy = 1; c._q = cfg.dealSquash; c._qv = 0;
      }
      return;
    }
    // hint peek on a face-down card
    if (c.state === 'down') {
      var pk = 0;
      if (c.peekT >= 0) {
        c.peekT += h;
        if (c.peekT >= cfg.hintPeekDelay && c.peekT < cfg.hintPeekDelay + cfg.hintPeekHold) pk = cfg.hintPeekFlip;
        if (c.peekT >= cfg.hintPeekDelay + cfg.hintPeekHold) c.peekT = -1;
        c.flipT = pk;
      } else if (c.waveT < 0 && (this.phase === 'play' || this.phase === 'resolve' || this.phase === 'done')) c.flipT = 0;
    }
    // flip: critically damped spring
    w = cfg.flipOmega;
    c._fv += (w * w * (c.flipT - c.flip) - 2 * w * c._fv) * h;
    c.flip += c._fv * h;
    if (c.flip < 0) { c.flip = 0; if (c._fv < 0) c._fv = 0; }
    if (c.flip > 1) { c.flip = 1; if (c._fv > 0) c._fv = 0; }
    var liftT = Math.sin(Math.PI * c.flip);
    if (c.state === 'matched') {
      c._mt = (c._mt || 0) + h;
      var mt = c._mt, R = { mx: c._mx, my: c._my };
      c.lift += (1 - c.lift) * Math.min(1, 12 * h);
      if (mt >= cfg.matchHold) {
        // slide to the midpoint (spring), spin a full turn (under-damped → overshoot), shrink
        w = cfg.matchSlideOmega; z = cfg.matchSlideZeta;
        c.vx += (w * w * (R.mx - c.x) - 2 * z * w * c.vx) * h; c.vy += (w * w * (R.my - c.y) - 2 * z * w * c.vy) * h;
        c.x += c.vx * h; c.y += c.vy * h;
        if (mt >= cfg.matchHold + cfg.matchSpinDelay) {
          w = cfg.matchSpinOmega; z = cfg.matchSpinZeta;
          c._sv += (w * w * (TAU - c._spin) - 2 * z * w * c._sv) * h; c._spin += c._sv * h;
        }
        c._scale += (cfg.matchShrink - c._scale) * Math.min(1, 6 * h);
        if (mt >= cfg.matchSquashAt && !c._squashed) { c._squashed = true; c._q = cfg.matchSquash; c._qv = 0; }
      }
      c.rot = c._spin;
    } else {
      c.lift = liftT;
      // "no-no" shake: damped sine rotation, 3 wiggles
      c.rot = 0;
      if (c.shakeT >= 0) {
        c.shakeT += h; u = c.shakeT / cfg.shakeTime;
        if (u >= 1) c.shakeT = -1;
        else c.rot = cfg.shakeAmp * Math.sin(TAU * cfg.shakeWiggles * u) * (1 - u) * (1 - u);
      }
    }
    w = cfg.squashOmega; z = cfg.squashZeta;
    c._qv += (-w * w * c._q - 2 * z * w * c._qv) * h; c._q += c._qv * h;
    var br = c.state === 'down' && c.flip < 0.02 && this.phase === 'play' ? cfg.breathAmp * Math.sin(c._ph + TAU * cfg.breathHz * this.time) : 0;
    c.sx = c._scale * (1 + c._q) * (1 + br); c.sy = c._scale * (1 - c._q) * (1 + br);
  };
  P._stepDee = function (h) {
    var d = this.dee, cfg = this.cfg, L = this.layout;
    if (d.moodT > 0) { d.moodT -= h; if (d.moodT <= 0) { d.moodT = 0; d.mood = 'idle'; } }
    var B = L.grid ? L.grid.rect : L.board, lx = B.x + B.w / 2, ly = B.y + B.h / 2;
    if (this._lookId && this.time - this._lookT < cfg.lookHold) {
      var c = this.cardById(this._lookId);
      if (c && c.state !== 'gone') { lx = c.x; ly = c.y; }
    }
    var k = Math.min(1, h * cfg.lookRate);
    d.lookX += (lx - d.lookX) * k; d.lookY += (ly - d.lookY) * k;
    if (d._hopT >= 0) {
      d._hopT += h;
      var n = d._hopT / cfg.hopTime;
      if (n >= d._hopN) { d._hopT = -1; d.hop = 0; }
      else { var ph = n - Math.floor(n); d.hop = d._hopPx * Math.pow(0.7, Math.floor(n)) * 4 * ph * (1 - ph); }
    }
  };

  Object.defineProperty(P, 'miu', { get: function () { return this.dee; } });   // old helper name (kept for shared code)
  DM.World = World;
})(window.DM = window.DM || {});
