/* Gigi's Peekaboo Windows — GW.CONFIG + GW.World (headless, deterministic memory game in the windows of a city
 * building; DESIGN §1, §2, §6.2; docs/MECHANICS.md)
 *
 * ============================== CONVENTIONS ==============================
 *  Units: logical px (short side = 720), seconds, radians, y DOWN. rot > 0 = clockwise (canvas).
 *  update(dt) runs fixed sub-steps of cfg.step (1/120 s) with an accumulator. At the START of every sub-step each window,
 *  the critter, every car, Gigi's head and the camera store their previous values (_px, _py, _popen, _pflip, _pbloom,
 *  _pbounce, _phx, _phy, _phop, _pscroll, _pscrollT); the renderer draws p = _p + (p − _p)·w.alpha.
 *  The result depends only on the seed and the sub-step at which inputs arrive.
 *
 *  Window c (w.cards[], state down | up | matched; matched windows STAY, lit):
 *    centre (x, y), size w × h (= the grid size). c.open 0 closed … 1 open (≤ cfg.openMax 1.12 while it overshoots);
 *    c.flip = min(1, max(0, open)) (old name); c.light 0..1 lamp (after a match); c.bloom 0..≈1.2 flower box (spring);
 *    c.bounce ≥ 0 px the face hops UP; c.wiggle rad face rotation (mismatch "no-no"); c.glow 0..1 hint halo.
 *    During phase 'scroll' the windows of the NEW building are drawn offset by w.buildingDx = (1 − scrollT)·W.
 *  Building: w.building = { facade, trim, shutter, door, roof, seed } (style), layout.grid.building = rect + roof + door.
 *  Gigi: w.gigi { mood, moodT, hop, walk, walking, headX, headY (= the NECK JOINT of the head, hop included), neckBaseX,
 *    neckBaseY (hop included), … }: draw the body at (layout.gigi.x, layout.gigi.y − hop), the neck base → head joint as given.
 *  Critter: w.critter (surprise round) { type pigeon | bus | balloon, x, y, … }; traffic: w.traffic[] cars on the road.
 * ========================================================================
 */
(function (GW) {
  'use strict';

  var CONFIG = {
    // ---- timing / state machine (s)
    step: 1 / 120,             // fixed simulation sub-step (≤ 1/120 per DESIGN)
    maxFrame: 1.0,             // largest dt accepted per update() (speed mode passes big dt)
    roundsPerLevel: 4,         // rounds (buildings) per chapter (warm-up + 3)
    chapterTimeLimit: 80,      // s since the chapter began: after ≥ chapterMinRounds rounds go to Talk time once exceeded (Dee's tuned rule)
    chapterMinRounds: 3,
    introTime: 2.5,            // chapter banner + weather line + the 2.5 s weather crossfade
    matchCelebrate: 0.7,       // s after the LAST pair's check → the building cheers (light + both flower boxes popped by then)
    cheerTime: 1.2,            // DESIGN: 'cheer' phase — every window glows, confetti from the roof, windows hop in a wave
    cheerWave: 0.06,           // s between the windows' cheer hops (slot order)
    roundDoneTime: 0.8,        // stars + Gigi's short praise, then the street scrolls (Dee 1.8; playtest: the scroll + cheer add ≈ 3 s per round)
    scrollTime: 1.6,           // DESIGN: the camera pans one screen width, smooth-step
    scrollSettle: 0.15,        // s after the new building is in place → peek
    talkAfterAnswer: 2.0,      // the Talk panel stays after an answer
    levelDoneTime: 2.0,        // chapter stars
    talkAskTime: 12,           // s without an answer → talkAsk (re-ask), repeating
    talkGlowAfterAsks: 2,      // from this re-ask on talk.glowAnswer = true

    // ---- content tuning (playtest-tuned; null → the DESIGN tables GW.Content.PAIRS / PEEK) — kept from Dee (MECHANICS §6)
    pairsByAge: { 3: [2, 2, 2, 3], 4: [2, 2, 3, 3], 5: [2, 3, 4, 4], 6: [3, 3, 4, 5], 7: [3, 4, 4, 5] },
    peekByAge: { 3: 2.8, 4: 2.2, 5: 2.0, 6: 1.5, 7: 1.5 },   // s every window stays open in the peek …
    peekPerCard: true,         // … × (0.6 + 0.1·windows): 4 windows 1.0×, 6 → 1.2×, 8 → 1.4×, 10 → 1.6×

    // ---- surprise round: one per chapter, the type rotates per chapter from a random start per session
    surpriseRound: 2,          // round index (the 3rd building; always played: the chapter limit applies after ≥ 3 rounds)
    surpriseTypes: ['pigeon', 'bus', 'balloon'],
    surpriseDelay: [1.5, 3.5], // s after play starts until the critter appears
    adaptHold: true,           // after a HARD round the next round does not grow (pairs = min(table, last round's pairs)) …
    adaptSlowPlay: 40,         // … hard = more than 40 s of play, or only 1 star

    // ---- layout (DESIGN §2; px)
    shortSide: 720, minLong: 960, maxLong: 1600,
    groundOffset: 90,          // groundY = H − ins.bottom − 90 (top of the pavement)
    gigiDxLand: 110, gigiDyLand: 22, gigiHLand: 150,   // Gigi's feet anchor + body-box height, landscape
    gigiDxPort: 100, gigiDyPort: 24, gigiHPort: 140,   // portrait
    gigiBoxW: 1.2,             // Gigi's keep-out / body hit box = (1.2·h) × h above the feet
    bodyFeet: [128, 244], bodySocket: [172, 96], bodyBox: 256,   // body svg anchors (DESIGN §4.1, viewBox 256)
    headJoint: [70, 160], headBoxSvg: 192, headK: 0.62,          // head svg anchors (viewBox 192); head box = 0.62·h square
    bubbleX: 24, bubbleY: 20, bubbleMaxW: 640, bubbleRightGap: 160, bubbleH: 122,   // landscape bubble
    bubbleHPort: 124, bubbleGapPort: 24,   // portrait: the bubble sits BELOW the HUD: y = ins.top + hudH + 24
    hudW: 160, hudH: 96,       // DOM buttons top-right: x > W − ins.right − 160, y < ins.top + 96
    boardTopGap: 24,           // board (building incl. its top facade pad) starts 24 px below the bubble
    boardGroundGap: 14,        // windows end ≥ 14 px above groundY (facade below them ≥ 0.5·gap down to groundY + 4)
    boardGigiGapLand: 130,     // landscape: board x ≥ gigi.x + 130 (Gigi's box + 40 px; her rest head + 16 px keep-out stays left of it)
    boardSide: 24,             // side margins of the board
    boardHeadGap: 22,          // portrait board A (above Gigi): bottom ≤ Gigi's REST head box top − 22 (16 px keep-out + 6)
    boardGigiSideGap: 40,      // portrait board B (right of Gigi): x ≥ Gigi's box right + 40

    // ---- windows / grid / building
    cardAspect: 0.78,          // window w : h
    gapFrac: 0.16, gapMin: 18, // gap = max(18, 0.16·cw) (shutters swing into the gap)
    padFrac: 0.22, padMin: 22, // facade around the grid: pad = max(22, 0.22·cw) on the sides and the top (inside the board)
    roofFrac: 0.32,            // roof / cornice band above the facade = 0.32·cw (may go under the HUD / bubble)
    doorFrac: 0.42,            // door width = 0.42·cw (drawn in free facade space, never over a window)
    cardMin: { 3: 120, 4: 120, 5: 104, 6: 104, 7: 104 },   // smallest allowed window width per age
    cardMax: 210,              // windows never get wider than this
    hitPad: 10,                // hit test = window rect grown by 10 px; nearest centre wins
    sameTapHint: 3,            // 3 taps on the one open window (no idle reset) → auto hint (partner glows)
    thirdTapAfter: 0.5,        // the third-tap reset needs both mismatched faces shown ≥ 0.5 s
    yellowGigiGap: 40,         // colour rounds: no yellow window within 40 px of Gigi's box (sand-coloured giraffe)

    // ---- shutters (DESIGN §6.2): spring on c.open towards 1 (open) / 0 (closed)
    openOmega: 16, openZeta: 0.42,   // under-damped: swings open past 1 …
    openMax: 1.12,             // … and hits the hinge stop at 1.12 (bounces back with 0.3 of its speed) — DESIGN "≤ 1.12"
    openStopBounce: 0.3,
    clackBounce: 0.25,         // closing: crossing 0 → open = 0, velocity × −0.25 (a small rebound) …
    clackMinV: 4,              // … 'clack' event when it hits with ≥ 4 /s (the first hit of a close; ≈ 8–10 /s)
    clackStopV: 0.6,           // slower hits just stop
    breezeSway: 0.03, breezeHz: 0.7, breezeWind: 22,   // open shutters sway ±0.03·(wind/22) in a breeze (w.wind from main)
    peekStagger: 0.05,         // peek wave (slot order) / hide wave (reverse)
    playAtHide: 0.5,           // play starts when every window's open < 0.5 (faces hidden)
    // ---- match / mismatch
    matchAt: 0.95,             // the check happens when the 2nd window's open ≥ 0.95
    matchHold: 0.25,           // both faces shown …
    matchResolveTime: 0.4,     // … phase back to 'play' 0.4 s after the check (the boxes are still blooming)
    lightTime: 0.4,            // lamp on: light 0 → 1 (smooth-step) from matchHold
    bloomOmega: 14, bloomZeta: 0.45,   // flower box spring to 1 (ζ 0.45 → peak 1.20; DESIGN ζ 0.35 would reach 1.31 > its 0..1.2 range)
    bloomDelay: [0.05, 0.2],   // s after matchHold: box A pops, then box B ("pop-pop") → bloom {id} events
    bounceG: 2000, bouncePx: 12, matchHops: 2,   // both faces hop twice, 12 px apex, g 2000 px/s²
    cheerHopPx: 10,            // cheer wave: every window's face hops once
    mismatchShow: 1.0,         // s both faces stay up after a mismatch (age 3: mismatchShowByAge)
    mismatchShowByAge: { 3: 1.2 },
    shakeAmp: 0.08, shakeWiggles: 3, shakeTime: 0.5,   // face "no-no": damped sine rotation c.wiggle, 3 wiggles in 0.5 s
    fastReset: true,           // 3rd tap while 2 mismatched windows are up: both close at once, the new one opens

    // ---- help
    hintAfterStreak: 3,        // 3 mismatches in a row → hint (streak resets)
    hintCooldown: 6,           // s: no auto-hint while one glows nor within 6 s of the last
    hintGlowTime: 2.5,         // glow 2.5 s (fade in 0.2, out 0.4)
    hintPeekDelay: 0.2, hintPeekHold: 0.45,   // the hinted closed windows open a crack for 0.45 s …
    hintPeekOpen: 0.3,         // … to open = 0.3 (DESIGN: "a crack")
    idleTime: 12,              // s without a tap in play → idle nudge …
    idleBackoff: 1.5, idleMax: 30,   // … gap ×1.5 per nudge up to 30 s
    idleHintFrom: 2,           // from the 2nd idle nudge of a round a hint glows too

    // ---- Gigi
    moodTime: { happy: 0.9, cheer: 1.6, oops: 0.8, think: 1.4 },
    hopPx: { happy: 14, cheer: 26 }, hopTime: 0.4, lookRate: 6, lookHold: 3,
    headOmega: 9, headZeta: 0.55,    // the head joint follows its target with a spring (≈ 12 % overshoot: a springy stretch)
    neckMaxK: 1.6, neckMinK: 0.45,   // |head joint − neck base| ≤ 1.6·h (target), ≥ 0.45·h
    stretchMaxK: 1.08,               // the spring may overshoot the reach to 1.08 × neckMax
    restDx: 0.12, restDy: -0.6,      // rest pose: head joint = neck base + (0.12·h, −0.6·h)
    headKeep: 16,                    // the head box never comes within 16 px of the window grid rect
    headTopK: 0.35,                  // head joint y ≥ ins.top + 0.35·h
    walkHz: 2.2, walkBob: 4, walkLead: 0.1,   // trot cycles / s, body bob px, head leans 0.1·h forward while walking
    blinkEvery: [2.5, 5], blinkTime: 0.12,

    // ---- critters (surprise round) and traffic
    pigeonSize: 64, pigeonFly: 1.4, pigeonAway: 1.2, pigeonMove: [8, 14], pigeonPeck: [1.2, 2.8], pigeonFlapHz: 8,
    busW: 220, busH: 92, busSpeed: 120, busStop: 2.0, busHonkExtra: 1.0, busBrake: 160, busAccel: 120, busDy: 82,
    balloonSize: 70, balloonRise: 40, balloonSwayPx: 18, balloonSwayHz: 0.35, balloonString: 50, balloonAway: 380,
    carW: 150, carH: 75, carEvery: [6, 14], carSpeed: [140, 200], carMax: 2, carLaneDy: [66, 82], carAccel: 300, carGap: 40
  };
  GW.CONFIG = CONFIG;

  var FACADES = ['#E6B8A2', '#F2E3C6', '#C9D8B6', '#C8D6E2', '#D9CFE0', '#EAD4AE'];   // DESIGN §3
  var SHUTTERS = ['#5E9E97', '#6C86A6', '#8E9A5B', '#B9775E'];
  var DOORS = ['#7A5A44', '#5E7A8C', '#8A6A9A', '#6E8A5A'];
  var ROOFS = ['flat', 'gable', 'arch'];
  var TRIM = '#FBF7EE';

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
  function inRect(x, y, R) { return x >= R.x && x <= R.x + R.w && y >= R.y && y <= R.y + R.h; }

  /** DESIGN §2 short-side rule: CSS viewport → logical W×H. */
  function logicalSize(cssW, cssH, cfg) {
    cfg = cfg || CONFIG;
    var S = cfg.shortSide, aspect = cssW / Math.max(1, cssH);
    if (cssW >= cssH) return { W: clamp(Math.round(S * aspect), cfg.minLong, cfg.maxLong), H: S };
    return { W: S, H: clamp(Math.round(S / aspect), cfg.minLong, cfg.maxLong) };
  }

  // ------------------------------------------------------------------ Gigi geometry
  /** Head box (logical px) for a head joint (jx, jy): the 0.62·h square of the head svg, its neck joint at (jx, jy). */
  function headBoxAt(jx, jy, h, cfg) {
    var s = cfg.headK * h, ox = cfg.headJoint[0] / cfg.headBoxSvg * s, oy = cfg.headJoint[1] / cfg.headBoxSvg * s;
    return { x: jx - ox, y: jy - oy, w: s, h: s };
  }
  function gigiGeometry(L, cfg) {
    var g = L.gigi, h = g.h, B = cfg.bodyBox;
    L.gigiRect = { x: g.x - cfg.gigiBoxW * h / 2, y: g.y - h, w: cfg.gigiBoxW * h, h: h };
    L.neckBase = { x: g.x + (cfg.bodySocket[0] - cfg.bodyFeet[0]) / B * h, y: g.y + (cfg.bodySocket[1] - cfg.bodyFeet[1]) / B * h };
    L.headRest = { x: L.neckBase.x + cfg.restDx * h, y: L.neckBase.y + cfg.restDy * h };
    L.headRestBox = headBoxAt(L.headRest.x, L.headRest.y, h, cfg);
    L.neckMax = cfg.neckMaxK * h; L.neckMin = cfg.neckMinK * h;
  }

  function computeLayout(W, H, ins, cfg) {
    ins = { top: +(ins && ins.top) || 0, right: +(ins && ins.right) || 0, bottom: +(ins && ins.bottom) || 0, left: +(ins && ins.left) || 0 };
    var portrait = H > W, tall = H / W > 1.6;
    var groundY = H - ins.bottom - cfg.groundOffset;
    var gigi = portrait ? { x: ins.left + cfg.gigiDxPort, y: groundY + cfg.gigiDyPort, h: cfg.gigiHPort }
      : { x: ins.left + cfg.gigiDxLand, y: groundY + cfg.gigiDyLand, h: cfg.gigiHLand };
    var L = { W: W, H: H, ins: ins, portrait: portrait, tall: tall, groundY: groundY, gigi: gigi };
    gigiGeometry(L, cfg);
    var GR = L.gigiRect;
    var bx = ins.left + cfg.bubbleX;
    var bubble = portrait
      ? { x: bx, y: ins.top + cfg.hudH + cfg.bubbleGapPort, w: Math.min(cfg.bubbleMaxW, W - bx - ins.right - cfg.bubbleX), h: cfg.bubbleHPort }
      : { x: bx, y: ins.top + cfg.bubbleY, w: Math.min(cfg.bubbleMaxW, W - bx - ins.right - cfg.bubbleRightGap), h: cfg.bubbleH };
    var hud = { x: W - ins.right - cfg.hudW, y: 0, w: cfg.hudW + ins.right, h: ins.top + cfg.hudH };
    var top = bubble.y + bubble.h + cfg.boardTopGap, bottom = groundY - cfg.boardGroundGap, boards;
    if (!portrait) {
      var lx = gigi.x + cfg.boardGigiGapLand;
      boards = [{ x: lx, y: top, w: W - ins.right - cfg.boardSide - lx, h: bottom - top }];
    } else {
      var ax = ins.left + cfg.boardSide, bxx = Math.max(GR.x + GR.w + cfg.boardGigiSideGap, L.headRestBox.x + L.headRestBox.w + cfg.boardHeadGap);
      boards = [
        { x: ax, y: top, w: W - ins.right - cfg.boardSide - ax, h: L.headRestBox.y - cfg.boardHeadGap - top },   // A: above Gigi's head
        { x: bxx, y: top, w: W - ins.right - cfg.boardSide - bxx, h: bottom - top }                               // B: right of Gigi
      ];
    }
    boards.forEach(function (b) { b.w = Math.max(0, b.w); b.h = Math.max(0, b.h); });
    L.bubble = bubble; L.hud = hud; L.boards = boards; L.board = boards[0];
    L.safe = { x: ins.left, y: ins.top, w: W - ins.left - ins.right, h: H - ins.top - ins.bottom };
    L.road = { y0: groundY + 40, y1: H };
    L.grid = null;
    // old names (Dee's code / tests)
    L.dee = gigi; L.deeRect = GR;
    return L;
  }

  /* ------------------------------------------------------------------ grid + building
   * Every cols × rows with cols·rows ≥ n and ≤ n + 1 (at most one empty slot, the last row centred), on every board.
   * The building (grid + facade pad on the sides and the top) must fit the board. Largest window wins (capped at cardMax);
   * ties (< 0.5 px) → the squarer grid, then board A, then more columns (landscape) / rows (portrait). */
  function gapOf(cw, cfg) { return Math.max(cfg.gapMin, cfg.gapFrac * cw); }
  function padOf(cw, cfg) { return Math.max(cfg.padMin, cfg.padFrac * cw); }
  function fitCard(b, cols, rows, cfg) {
    var a = cfg.cardAspect, lo = 0, hi = Math.max(1, b.w / cols);
    function ok(cw) {
      var g = gapOf(cw, cfg), p = padOf(cw, cfg);
      return cols * cw + (cols - 1) * g + 2 * p <= b.w + 1e-9 && rows * cw / a + (rows - 1) * g + p <= b.h + 1e-9;
    }
    if (!ok(lo + 1e-6)) return 0;
    for (var i = 0; i < 44; i++) { var m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; }
    return lo;
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
          var sq = Math.abs(cols - rows) - Math.abs(best.cols - best.rows);
          if (sq !== 0) better = sq < 0;
          else if (bi !== best.bi) better = bi < best.bi;
          else better = (L.portrait ? rows - best.rows : cols - best.cols) > 0;
        }
        if (better) best = { sc: sc, raw: raw, cols: cols, rows: rows, bi: bi };
      }
    }
    var B = L.boards[best.bi], cw = best.sc, ch = cw / cfg.cardAspect, gap = gapOf(cw, cfg), pad = padOf(cw, cfg);
    var gw = best.cols * cw + (best.cols - 1) * gap, gh = best.rows * ch + (best.rows - 1) * gap;
    var x0 = B.x + (B.w - gw - 2 * pad) / 2 + pad, y0 = B.y + (B.h - gh - pad) / 2 + pad, slots = [];
    for (var k = 0; k < n; k++) {
      var r = Math.floor(k / best.cols), c = k % best.cols, inRow = Math.min(best.cols, n - r * best.cols);
      var off = (best.cols - inRow) * (cw + gap) / 2;
      slots.push({ x: x0 + off + c * (cw + gap) + cw / 2, y: y0 + r * (ch + gap) + ch / 2 });
    }
    var g = { cols: best.cols, rows: best.rows, cw: cw, ch: ch, gap: gap, pad: pad, x0: x0, y0: y0, n: n, slots: slots, boardIndex: best.bi,
      board: B, rect: { x: x0, y: y0, w: gw, h: gh }, minOk: cw >= (cfg.cardMin[age] || cfg.cardMin[5]) - 1e-9 };
    g.building = buildingRect(L, g, cfg);
    return g;
  }
  function shiftGrid(g, dx) {
    g.x0 += dx; g.rect = { x: g.rect.x + dx, y: g.rect.y, w: g.rect.w, h: g.rect.h };
    for (var i = 0; i < g.slots.length; i++) g.slots[i] = { x: g.slots[i].x + dx, y: g.slots[i].y };
  }
  /** Facade rect around the grid down to the pavement + roof band + a door in free facade space (or null).
   * May shift the grid sideways inside its board to make room for a door bay. */
  function buildingRect(L, g, cfg) {
    var R = g.rect, p = g.pad, ground = L.groundY + 4;
    var b = { x: R.x - p, y: R.y - p, w: R.w + 2 * p, h: ground - (R.y - p), roofH: cfg.roofFrac * g.cw, pad: p, door: null, doorX: null, doorW: null };
    var dw = cfg.doorFrac * g.cw, band = ground - (R.y + R.h), GR = L.gigiRect, door = null;
    if (band - 0.5 * g.gap >= Math.max(56, 0.4 * g.ch)) {
      // a free band under the windows (portrait board A): the door in it, not behind Gigi
      var cx = b.x + b.w / 2;
      if (cx + dw / 2 + 8 > GR.x && cx - dw / 2 - 8 < GR.x + GR.w) cx = b.x + b.w - p - 0.25 * g.cw - dw / 2;
      door = { x: cx, y: ground, w: dw, h: Math.min(0.9 * g.ch, band - 0.5 * g.gap) };
    } else if (g.cols * g.rows > g.n) {
      // the last row has an empty slot: the door in the free half-slot at its right end
      var last = g.slots[g.n - 1], lastR = last.x + g.cw / 2, lastTop = last.y - g.ch / 2;
      var z0 = lastR + g.gap / 2, z1 = R.x + R.w + p / 2, ww = Math.min(dw, z1 - z0 - 6);
      if (ww >= 0.3 * g.cw) door = { x: (z0 + z1) / 2, y: ground, w: ww, h: Math.min(0.9 * g.ch, ground - lastTop - 0.12 * g.ch) };
    }
    if (!door) {
      // no free facade: a narrow bay on the right (else the left) side of the building when the board has room
      var bayW = dw + 0.5 * g.gap, B = g.board, dh = Math.min(0.9 * g.ch, ground - (R.y + R.h - g.ch));
      var spareR = B.x + B.w - (b.x + b.w), spareL = b.x - B.x;
      if (spareL + spareR >= bayW - 1e-6) {
        // shift the whole building (grid included) left just enough, then add the bay on the right
        var sh = Math.min(0, spareR - bayW);
        if (sh < 0) { shiftGrid(g, sh); R = g.rect; b.x += sh; }
        b.w += bayW;
        door = { x: R.x + R.w + (p + bayW) / 2, y: ground, w: dw, h: dh };
      }
    }
    if (door) { b.door = door; b.doorX = door.x; b.doorW = door.w; }
    return b;
  }

  // ------------------------------------------------------------------ World
  function World(opts) {
    opts = opts || {};
    this.cfg = merge(CONFIG, opts.config);
    this.seed = opts.seed !== undefined ? opts.seed : 1;
    this.rng = new GW.RNG(this.seed);                                  // content / hints (the game's own stream)
    this.arng = new GW.RNG(((this.seed >>> 0) ^ 0xA5A5F00D) >>> 0);    // ambient: buildings, critters, traffic, blinks
    this.age = GW.Content.ageOf(opts.age !== undefined ? opts.age : 4);
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
    this.held = null; this.pairsHeld = false; this.wind = 0; this.hudKeep = opts.hudKeep || null; this.lastTopics = null;
    this.surprise = null; this._surpriseOff = 0; this._sameN = 0; this._hard = false; this._lastPairs = 0; this._playStart = 0;
    this.building = null; this.prevBuilding = null; this.lastBuilding = null;
    this.scroll = 0; this.scrollT = 1; this._pscroll = 0; this._pscrollT = 1; this._scroll0 = 0; this.buildingDx = 0; this.prevDx = 0;
    this.critter = null; this._critterAt = -1; this.traffic = []; this._carNext = 4; this._carN = 0;
    this.cheer = 0;
    this.finger = { x: 0, y: 0, down: false };
    this.gigi = { mood: 'idle', moodT: 0, lookX: 0, lookY: 0, hop: 0, _phop: 0, _hopT: -1, _hopPx: 0, _hopN: 0,
      walk: 0, walking: false, _foot: 0, headX: 0, headY: 0, _phx: 0, _phy: 0, _hvx: 0, _hvy: 0, neckBaseX: 0, neckBaseY: 0,
      neckLen: 0, blink: 0, _blinkT: 3, _blinkOn: 0, tx: 0, ty: 0 };
    this.events = []; this.sessions = 0; this.interactive = false; this.solved = false;
    this._mis = null; this._anims = []; this._idleN = 0; this._idleT = 0; this._idleGap = this.cfg.idleTime; this._doneT = -1;
    this._lastHintT = -1e9; this.levelStartTime = 0; this._talkAskT = 0; this._talkAsks = 0; this._hist = [];
    this._lookId = null; this._lookT = -1e9; this._holdT = -1; this._lastTapId = null; this._gridVer = 0; this._tKey = '';
    this.setViewport(opts.width || 1280, opts.height || 720, opts.ins || null);
    var Lb = this.layout.board;
    this.gigi.lookX = Lb.x + Lb.w / 2; this.gigi.lookY = Lb.y + Lb.h / 2;
    this._snapHead();
  }
  World.logicalSize = logicalSize;
  World.computeLayout = function (W, H, ins, cfg) { return computeLayout(W, H, ins, merge(CONFIG, cfg)); };
  World.chooseGrid = function (L, n, age, cfg) { return chooseGrid(L, n, GW.Content.ageOf(age || 4), merge(CONFIG, cfg)); };
  World.headBoxAt = function (jx, jy, h, cfg) { return headBoxAt(jx, jy, h, merge(CONFIG, cfg)); };
  World.rectGap = rectGap; World.overlapArea = overlapArea;
  World.FACADES = FACADES; World.SHUTTERS = SHUTTERS; World.DOORS = DOORS; World.ROOFS = ROOFS;
  /** Gigi's head box for hit tests and the renderer (alpha given → interpolated): { x, y, w, h, jx, jy } (jx, jy = neck joint). */
  World.gigiHead = function (w, alpha) {
    var g = w.gigi, a = alpha === undefined ? 1 : alpha;
    var jx = g._phx + (g.headX - g._phx) * a, jy = g._phy + (g.headY - g._phy) * a;
    var b = headBoxAt(jx, jy, w.layout.gigi.h, w.cfg); b.jx = jx; b.jy = jy;
    return b;
  };

  var P = World.prototype;
  Object.defineProperty(P, 'items', { get: function () { return this.cards; } });
  Object.defineProperty(P, 'dee', { get: function () { return this.gigi; } });   // old helper names (shared code)
  Object.defineProperty(P, 'miu', { get: function () { return this.gigi; } });
  P._emit = function (e) { this.events.push(e); };
  P.drainEvents = function () { var e = this.events; this.events = []; return e; };
  P.setAge = function (a) { this._pendingAge = GW.Content.ageOf(a); };
  P.setLang = function (l) { this._pendingLang = l === 'vi' ? 'vi' : 'en'; };
  P.cardById = function (id) { for (var i = 0; i < this.cards.length; i++) if (this.cards[i].id === id) return this.cards[i]; return null; };
  P.itemById = P.cardById;
  P._setState = function (s) { this.state = s; this.stateTime = 0; };
  P._setPhase = function (p) { this.phase = p; this.phaseTime = 0; };
  P._mood = function (m) {
    var d = this.gigi; d.mood = m; d.moodT = this.cfg.moodTime[m] || 1;
    if (this.cfg.hopPx[m]) { d._hopT = 0; d._hopPx = this.cfg.hopPx[m]; d._hopN = m === 'cheer' ? 3 : 1; }
  };
  P.cancelDrag = function () { this.finger.down = false; };
  P.skipTalk = function () { if (this.state === 'talk') this._levelDone(); };
  P.prompt = function () { return this.cur ? { promptKey: this.cur.promptKey, params: this.cur.params } : null; };
  P._mismatchShow = function () { var b = this.cfg.mismatchShowByAge; return (b && b[this.age] !== undefined) ? b[this.age] : this.cfg.mismatchShow; };
  /** Window rect (logical px, at its slot; add w.buildingDx while scrolling). */
  P.cardRect = function (c) { return { x: c.x - c.w / 2, y: c.y - c.h / 2, w: c.w, h: c.h }; };
  /** Tight hit box of the critter (logical px) or null. */
  P.critterRect = function () {
    var k = this.critter, cfg = this.cfg;
    if (!k || k.state === 'gone') return null;
    if (k.type === 'pigeon') { var s = cfg.pigeonSize; return { x: k.x - 0.42 * s, y: k.y - 0.78 * s, w: 0.84 * s, h: 0.78 * s }; }
    if (k.type === 'bus') return { x: k.x - k.w / 2, y: k.y - k.h, w: k.w, h: k.h };
    var r = cfg.balloonSize / 2; return { x: k.x - r, y: k.y - r * 1.15, w: 2 * r, h: 2.3 * r };
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
    var L = this.layout, g = this.gigi;
    g.neckBaseX = L.neckBase.x; g.neckBaseY = L.neckBase.y;
    if (old) {
      // keep Gigi's head pose relative to her neck, then make it valid for the new layout
      var dx = g.headX - old.neckBase.x, dy = g.headY - old.neckBase.y;
      g.headX = g._phx = L.neckBase.x + dx * L.gigi.h / old.gigi.h; g.headY = g._phy = L.neckBase.y + dy * L.gigi.h / old.gigi.h;
      var q = this._nearestHead(g.headX, g.headY, !!L.grid && this.phase !== 'scroll');
      g.headX = g._phx = q.x; g.headY = g._phy = q.y; g._hvx = g._hvy = 0;
      this._tKey = '';
      // critter + traffic follow the new street
      for (var i = 0; i < this.traffic.length; i++) { var car = this.traffic[i]; car.y = car._py = L.groundY + this.cfg.carLaneDy[car.lane]; car.x = car._px = car.x * W / old.W; }
      var k = this.critter;
      if (k) {
        if (k.type === 'bus') { k.y = k._py = L.groundY + this.cfg.busDy; k.x = k._px = k.x * W / old.W; k.xStop = W / 2; }
        else if (k.type === 'pigeon' && L.grid) { this._pigeonSill(k, k.sillId); if (k.state === 'sit') { k.x = k._px = k.sx0; k.y = k._py = k.sy0; } }
        else { k.x = k._px = k.x * W / old.W; k.y = k._py = k.y * H / old.H; }
      }
    }
  };

  P._relayoutRound = function () {
    var L = this.layout, g = chooseGrid(L, this.cards.length, this.age, this.cfg), i;
    L.grid = g; L.board = g.board;
    for (i = 0; i < this.cards.length; i++) {
      var c = this.cards[i], s = g.slots[c.slot];
      c.hx = c.x = c._px = s.x; c.hy = c.y = c._py = s.y; c.w = g.cw; c.h = g.ch;
    }
    if (this.cur.topic === 'colors') this._yellowRule();
  };

  /** Colour rounds: swap yellow windows away from Gigi (≥ yellowGigiGap from her box). */
  P._yellowRule = function () {
    var L = this.layout, cfg = this.cfg, cards = this.cards, D = L.gigiRect, self = this;
    function gap(c) { return rectGap(self.cardRect({ x: c.hx, y: c.hy, w: c.w, h: c.h }), D); }
    for (var guard = 0; guard < cards.length; guard++) {
      var bad = null, i;
      for (i = 0; i < cards.length; i++) if (cards[i].face.color === 'yellow' && gap(cards[i]) < cfg.yellowGigiGap - 1e-6) { bad = cards[i]; break; }
      if (!bad) return;
      var best = null, bd = -1;
      for (i = 0; i < cards.length; i++) {
        var o = cards[i]; if (o.face.color === 'yellow' || o.state === 'matched') continue;
        var d = gap(o);
        if (d >= cfg.yellowGigiGap && d > bd) { bd = d; best = o; }
      }
      if (!best) return;
      var s = bad.slot; bad.slot = best.slot; best.slot = s;
      var g = L.grid, A = g.slots[bad.slot], Bs = g.slots[best.slot];
      bad.hx = bad.x = bad._px = A.x; bad.hy = bad.y = bad._py = A.y; best.hx = best.x = best._px = Bs.x; best.hy = best.y = best._py = Bs.y;
    }
  };

  // ---------------------------------------------------------------- session flow
  /** opts.lastTopics (or w.lastTopics): the previous session's chapter topics → this session rotates (GW.Content.topicsFor). */
  P.newSession = function (opts) {
    this.age = this._pendingAge; this.lang = this._pendingLang;
    this.sessions++;
    var last = (opts && opts.lastTopics) || this.lastTopics || null;
    this.levels = GW.Content.topicsFor(this.age, this.rng, last);
    this._surpriseOff = this.rng.int(0, this.cfg.surpriseTypes.length - 1);
    this.stars = 0; this.collected = [];
    this._emit({ type: 'session', levels: this.levels.slice() });
    this.startLevel(0);
  };

  P.startLevel = function (i) {
    if (!this.levels.length) this.levels = GW.Content.topicsFor(this.age);
    this.level = clamp(i | 0, 0, this.levels.length - 1);
    this.topic = this.levels[this.level];
    this.weather = this.level;
    this.round = 0; this.levelStars = 0; this.levelStartTime = this.time; this._hist = []; this._hard = false; this._lastPairs = 0;
    this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.cards = []; this.open = []; this.cur = null; this.talk = null; this.talkAnswered = null;
    this.interactive = false; this.solved = false; this._mis = null; this._anims = []; this.layout.grid = null; this._gridVer++;
    this.surprise = null; this.critter = null; this.cheer = 0;
    this._setState('intro'); this.phase = null;
    this._emit({ type: 'level', level: this.level, topic: this.topic });
  };

  /** A new building style, never the previous building's facade or shutter colour. */
  P._newBuilding = function () {
    var r = this.arng, prev = this.building, f, s;
    do { f = r.pick(FACADES); } while (prev && f === prev.facade);
    do { s = r.pick(SHUTTERS); } while (prev && s === prev.shutter);
    return { facade: f, trim: TRIM, shutter: s, door: r.pick(DOORS), roof: r.pick(ROOFS), seed: (r.next() * 4294967296) >>> 0 };
  };
  function freezeCards(cards) {
    return cards.map(function (c) {
      return { id: c.id, face: c.face, state: c.state, slot: c.slot, x: c.x, y: c.y, w: c.w, h: c.h,
        open: Math.min(1, Math.max(0, c.open)), flip: c.flip, light: c.light, bloom: Math.min(1, c.bloom), bounce: 0, wiggle: 0, glow: 0 };
    });
  }
  P._snapshotBuilding = function () {
    if (!this.building || !this.layout.grid) return null;
    return { building: this.building, rect: this.layout.grid.building, grid: this.layout.grid, cards: freezeCards(this.cards) };
  };

  P._beginRound = function () {
    var cfg = this.cfg, L = this.layout, i;
    var rr = new GW.RNG((this.rng.next() * 4294967296) >>> 0);
    var want = GW.Content.pairsFor(this.topic, this.age, this.lang, this.round, cfg.pairsByAge), held = false;
    if (cfg.adaptHold && this._hard && this._lastPairs && want > this._lastPairs) { want = this._lastPairs; held = true; }
    var cur = GW.Content.makeRound(this.topic, { age: this.age, lang: this.lang, rng: rr, roundIndex: this.round, history: this._hist,
      pairs: want, peekByAge: cfg.peekByAge });
    this.pairsHeld = held;
    if (cfg.peekPerCard) cur.peek = cur.peek * (0.6 + 0.1 * cur.cards.length);
    var ST = cfg.surpriseTypes, sp = ST && ST.length && this.round === cfg.surpriseRound ? ST[(this.level + this._surpriseOff) % ST.length] : null;
    this.surprise = sp; cur.surprise = sp; this._critterAt = -1;
    this._sameN = 0;
    // the street: the old building (or the last one of the previous chapter) leaves, a new one slides in
    this.prevBuilding = (this.cards.length ? this._snapshotBuilding() : null) || this.lastBuilding || null;
    this.lastBuilding = null;
    var first = !this.prevBuilding;
    this.building = this._newBuilding();
    this.cur = cur; this._hist.push(cur.sum);
    this.mismatches = 0; this.streak = 0; this.found = 0; this.pairs = cur.pairs; this.open = []; this._mis = null; this._anims = [];
    this._idleN = 0; this._idleT = 0; this._idleGap = cfg.idleTime; this._doneT = -1; this._holdT = -1;
    this.interactive = false; this.solved = false; this.cheer = 0;
    var g = chooseGrid(L, cur.cards.length, this.age, cfg);
    L.grid = g; L.board = g.board; this._gridVer++;
    var ar = this.arng;
    this.cards = cur.cards.map(function (s, k) {
      var q = g.slots[k];
      return { id: s.id, key: s.key, face: s.face, nameKind: s.nameKind, nameValue: s.nameValue, size: s.size || null, word: s.word || null,
        obj: s.obj || null, slot: k, state: 'down', x: q.x, y: q.y, _px: q.x, _py: q.y, hx: q.x, hy: q.y, w: g.cw, h: g.ch, rot: 0, _prot: 0,
        sx: 1, sy: 1, alpha: 1, lift: 0,
        open: 0, _popen: 0, _ov: 0, openT: 0, flip: 0, _pflip: 0, flipT: 0,
        light: 0, bloom: 0, _pbloom: 0, _blv: 0, bounce: 0, _pbounce: 0, _bvy: 0, _bt: 0, _bq: 0, _bT: -1, _bPx: 0, wiggle: 0,
        glow: 0, glowT: 0, peekT: -1, waveT: -1, shakeT: -1, _mt: -1, _popA: 0, _popped: false, _ph: ar.float(0, TAU), seed: (ar.next() * 65536) | 0 };
    });
    if (cur.topic === 'colors') this._yellowRule();
    this._setState('round'); this._setPhase('scroll');
    this._scroll0 = this.scroll; this.scrollT = this._pscrollT = 0;
    this.buildingDx = L.W; this.prevDx = 0;
    this.gigi.walking = true; this.gigi._foot = 0;
    this._emit({ type: 'scroll', first: first, building: this.building });
    this._emit({ type: 'round', round: this.round, topic: this.topic, promptKey: cur.promptKey, params: cur.params, pairs: cur.pairs, held: held,
      surprise: sp, building: this.building });
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
    this._mood('cheer');
    this.cards.forEach(function (c) { self._kickBounce(c, c.slot * cfg.cheerWave, 1, cfg.cheerHopPx); });
    var k = this.critter;
    if (k && k.type === 'pigeon' && k.state !== 'away' && k.state !== 'gone') { this._pigeonAway(k); this._emit({ type: 'critter', critter: 'pigeon', action: 'leave', x: k.x, y: k.y }); }
    this._emit({ type: 'cheer', x: B.x + B.w / 2, y: B.y - B.roofH });
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
    var rr = new GW.RNG((this.rng.next() * 4294967296) >>> 0);
    this.talk = GW.Content.makeTalk(this.topic, { age: this.age, lang: this.lang, rng: rr });
    this.talk.glowAnswer = false;
    this.talkAnswered = null; this._talkAskT = 0; this._talkAsks = 0;
    this.lastBuilding = this._snapshotBuilding();      // the lit building stays in the street behind the Talk panel
    this.cards = []; this.open = []; this.cur = null; this.layout.grid = null; this.phase = null; this._gridVer++;
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
  /** The window under (x, y): rect grown by hitPad; inside several → nearest centre. */
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
  P._hitGigi = function (x, y) {
    var L = this.layout;
    return inRect(x, y, L.gigiRect) || inRect(x, y, World.gigiHead(this));
  };

  /** Touch-down. Returns a window id, 'critter', 'gigi' or null. Order: the pigeon / balloon (drawn in front of the windows,
   * tight box) → windows → Gigi (body or head box) → the bus. Windows answer only in play / resolve. */
  P.pointerDown = function (x, y) {
    this.finger.x = x; this.finger.y = y; this.finger.down = true;
    var inRound = this.state === 'round', cfg = this.cfg;
    var kr = this.critterRect(), k = this.critter;
    if (kr && k.type !== 'bus' && k.state !== 'away' && inRect(x, y, kr)) { this._tapCritter(); return 'critter'; }
    var scrolling = inRound && this.phase === 'scroll';
    var c = inRound && !scrolling ? this._hit(x, y) : null;
    if (c) {
      if (this.solved) return null;
      var ph = this.phase;
      if (ph !== 'play' && ph !== 'resolve') return null;
      // tapping the ONE open window again and again is not "activity" (no idle reset); 3 such taps → a hint
      var same = c.state === 'up' && this.open.length === 1 && this.open[0] === c.id && !this._mis;
      if (!same) { this._idleT = 0; this._idleGap = cfg.idleTime; }
      this._lookId = c.id; this._lookT = this.time; this._lastTapId = c.id;
      if (same) { if (++this._sameN >= cfg.sameTapHint) { this._sameN = 0; this._autoHint(); } }
      else this._sameN = 0;
      if (c.state === 'matched' || c.state === 'up') { this._emitTap(c); return c.id; }
      if (ph === 'resolve' && !this._mis) return null;          // a pair was just found (≤ matchResolveTime): opens wait
      if (this.open.length < 2) { this._openUp(c); return c.id; }
      var a = this.cardById(this.open[0]), b = this.cardById(this.open[1]);
      if (a.key === b.key || !cfg.fastReset) return null;     // a match is about to be confirmed
      if (!this._mis || this._mis.t < cfg.thirdTapAfter) return null;
      this._close(a); this._close(b);
      this.open = []; this._mis = null; this._setPhase('play');
      this._openUp(c);
      return c.id;
    }
    if (this.state !== 'menu' && this._hitGigi(x, y)) { this._idleT = 0; this._idleGap = cfg.idleTime; return 'gigi'; }
    if (kr && k.type === 'bus' && inRect(x, y, kr)) { this._tapCritter(); return 'critter'; }
    if (inRound && (this.phase === 'play' || this.phase === 'resolve')) { this._idleT = 0; this._idleGap = cfg.idleTime; }   // the child is here
    return null;
  };
  P.pointerMove = function (x, y) { this.finger.x = x; this.finger.y = y; };
  P.pointerUp = function (x, y) { if (x !== undefined) { this.finger.x = x; this.finger.y = y; } this.finger.down = false; };

  P._emitTap = function (c) { this._emit({ type: 'tap', id: c.id, nameKind: c.nameKind, nameValue: c.nameValue, face: c.face, size: c.size, obj: c.obj }); };
  P._openUp = function (c) {
    c.state = 'up'; c.openT = c.flipT = 1; c.peekT = -1;
    this.open.push(c.id);
    this._emit({ type: 'flip', id: c.id, nameKind: c.nameKind, nameValue: c.nameValue, face: c.face, size: c.size, obj: c.obj, open: this.open.length });
  };
  P._close = function (c) { c.state = 'down'; c.openT = c.flipT = 0; c.shakeT = -1; };

  P._names = function (ev, a, b) {
    ev.nameKindA = a.nameKind; ev.nameValueA = a.nameValue; ev.faceA = a.face; ev.sizeA = a.size; ev.objA = a.obj;
    ev.nameKindB = b.nameKind; ev.nameValueB = b.nameValue; ev.faceB = b.face; ev.sizeB = b.size; ev.objB = b.obj;
    return ev;
  };

  P._check = function () {
    var a = this.cardById(this.open[0]), b = this.cardById(this.open[1]);
    if (a.key === b.key) this._match(a, b); else this._mismatch(a, b);
  };

  /** Starts `hops` ballistic hops of apex px on window c's face after `delay` s. */
  P._kickBounce = function (c, delay, hops, px) { c._bT = delay; c._bq = hops; c._bPx = px; };

  P._match = function (a, b) {
    var cfg = this.cfg, info = this.cur.pairInfo[a.key];
    a.state = b.state = 'matched'; a.openT = b.openT = a.flipT = b.flipT = 1;
    this.open = []; this.found++; this.streak = 0;
    var last = this.found >= this.pairs;
    this._anims.push({ a: a.id, b: b.id, t: 0, last: last });
    a._mt = b._mt = 0; a.glowT = b.glowT = 0; a.peekT = b.peekT = -1;
    a._popA = cfg.matchHold + cfg.bloomDelay[0]; b._popA = cfg.matchHold + cfg.bloomDelay[1]; a._popped = b._popped = false;
    this._kickBounce(a, cfg.matchHold, cfg.matchHops, cfg.bouncePx); this._kickBounce(b, cfg.matchHold, cfg.matchHops, cfg.bouncePx);
    this._setPhase('resolve');
    this._mood(last ? 'cheer' : 'happy');
    var ev = { type: 'match', a: a.id, b: b.id, key: a.key, nameKind: info.nameKind, nameValue: info.nameValue, found: this.found, pairs: this.pairs };
    ['parity', 'animal', 'home', 'word', 'text', 'lower', 'obj'].forEach(function (k) { if (info[k] !== undefined) ev[k] = info[k]; });
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

  /** The pair to hint: the partner of a single open window, else the pair of the last tapped one, else a random unfound pair. */
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
  /** Manual hint (tap on Gigi / the bubble): glows one pair; no event if it already glows. */
  P.hint = function () {
    if (this.state !== 'round' || this.solved || (this.phase !== 'play' && this.phase !== 'resolve')) return null;
    var pr = this._hintPair();
    if (!pr) return null;
    if (pr[0].glowT > 0) return pr[0].id;
    return this._doHint(false);
  };

  // ---------------------------------------------------------------- critters (surprise round)
  P._spawnCritter = function () {
    var cfg = this.cfg, L = this.layout, r = this.arng, g = L.grid, type = this.surprise, k;
    k = { type: type, x: 0, y: 0, _px: 0, _py: 0, rot: 0, _prot: 0, state: 'in', t: 0, flap: 0, face: 1, color: null,
      sx: 1, sy: 1, _q: 0, _qv: 0, honk: 0, wave: 0, peck: 0, swing: 0, _sw: 0, size: 0, w: 0, h: 0, tapped: false };
    if (type === 'pigeon') {
      k.size = cfg.pigeonSize;
      var c = r.pick(this.cards);
      this._pigeonSill(k, c.id);
      var fromRight = r.chance(0.6);
      this._pigeonFly(k, fromRight ? L.W + 60 : -60, L.ins.top + r.float(30, 90), k.sx0, k.sy0, cfg.pigeonFly);
      k.state = 'fly';
    } else if (type === 'bus') {
      k.w = cfg.busW; k.h = cfg.busH; k.x = -k.w / 2 - 20; k.y = L.groundY + cfg.busDy; k.vx = 0; k.xStop = L.W / 2; k.stopT = cfg.busStop;
      k.lane = 1; k.state = 'in';
    } else {
      k.size = cfg.balloonSize;
      var cols = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
      var used = {}; this.cards.forEach(function (q) { if (q.face.color) used[q.face.color] = 1; });
      var free = cols.filter(function (q) { return !used[q]; });
      k.color = r.pick(free.length ? free : cols);
      var R = g.rect;
      k.x0 = r.float(R.x + 0.15 * R.w, R.x + 0.85 * R.w); k.x = k.x0; k.y = L.groundY + 6; k.vx = 0; k.vy = -cfg.balloonRise;
      k.state = 'rise'; k._ph = r.float(0, TAU);
    }
    k._px = k.x; k._py = k.y;
    this.critter = k;
    this._emit({ type: 'critter', critter: type, action: 'enter', x: k.x, y: k.y });
  };
  /** The pigeon's sill: the bottom edge of window id (a random spot along it). */
  P._pigeonSill = function (k, id) {
    var c = this.cardById(id) || this.cards[0];
    if (!c) return;
    k.sillId = c.id;
    var u = k._sillU !== undefined ? k._sillU : (k._sillU = this.arng.float(-0.25, 0.25));
    k.sx0 = c.hx + u * c.w; k.sy0 = c.hy + c.h / 2;
  };
  P._pigeonFly = function (k, x0, y0, x1, y1, T) {
    var d = hyp(x1 - x0, y1 - y0);
    k._bz = { x0: x0, y0: y0, cx: (x0 + x1) / 2, cy: Math.min(y0, y1) - 0.25 * d - 30, x1: x1, y1: y1, T: T };
    k.x = x0; k.y = y0; k.t = 0; k.face = x1 >= x0 ? 1 : -1;
  };
  P._pigeonAway = function (k) {
    var L = this.layout, right = k.x > L.W / 2 ? 1 : -1;
    if (k.state === 'fly' && k._bz) right = k.face;
    this._pigeonFly(k, k.x, k.y, right > 0 ? L.W + 90 : -90, L.ins.top - 70, this.cfg.pigeonAway);
    k.state = 'away';
  };
  P._tapCritter = function () {
    var k = this.critter, cfg = this.cfg;
    k.tapped = true;
    if (k.type === 'pigeon') this._pigeonAway(k);
    else if (k.type === 'bus') { k.honk = 1; k._q = 0.08; k._qv = 0; k.wave = 1; if (k.state === 'stop') k.stopT = Math.min(k.stopT + cfg.busHonkExtra, cfg.busStop + 2 * cfg.busHonkExtra); }
    else if (k.state !== 'away') { k.state = 'away'; k.t = 0; k._spin = 0; }
    this._emit({ type: 'critter', critter: k.type, action: 'tap', x: k.x, y: k.type === 'bus' ? k.y - k.h / 2 : k.y });
  };
  /** The vehicle ahead of v (same lane, in its driving direction) among the cars and the bus. */
  P._ahead = function (v, dir) {
    var best = null, bd = 1e9, list = this.traffic.slice(), k = this.critter;
    if (k && k.type === 'bus' && k.state !== 'gone') list.push(k);
    for (var i = 0; i < list.length; i++) {
      var o = list[i]; if (o === v || o.lane !== v.lane) continue;
      var d = (o.x - v.x) * dir;
      if (d > 0 && d < bd) { bd = d; best = o; }
    }
    return best ? { v: best, gap: bd - (best.w + v.w) / 2 } : null;
  };
  P._stepCritter = function (h) {
    var k = this.critter, cfg = this.cfg, L = this.layout, u, B;
    k._px = k.x; k._py = k.y; k._prot = k.rot;
    k.t += h;
    if (k.type === 'pigeon') {
      if (k.state === 'fly' || k.state === 'away' || k.state === 'hop') {
        B = k._bz; u = clamp(k.t / B.T, 0, 1);
        var s = k.state === 'away' ? u * u : smooth(u), q = 1 - s;
        k.x = q * q * B.x0 + 2 * q * s * B.cx + s * s * B.x1; k.y = q * q * B.y0 + 2 * q * s * B.cy + s * s * B.y1;
        k.flap = 0.5 + 0.5 * Math.sin(TAU * cfg.pigeonFlapHz * k.t * (k.state === 'away' ? 1.4 : 1));
        k.rot = 0.18 * k.face * Math.sin(Math.PI * u);
        if (u >= 1) {
          if (k.state === 'away') { k.state = 'gone'; return; }
          if (k.state === 'fly') this._emit({ type: 'critter', critter: 'pigeon', action: 'land', x: k.x, y: k.y });
          k.state = 'sit'; k.t = 0; k.rot = 0; k.flap = 0; k._q = 0.15; k._qv = 0;
          k._peckT = this.arng.float(cfg.pigeonPeck[0], cfg.pigeonPeck[1]); k._moveT = this.arng.float(cfg.pigeonMove[0], cfg.pigeonMove[1]);
        }
      } else if (k.state === 'sit') {
        k.x = k.sx0; k.y = k.sy0;
        k._peckT -= h;
        if (k._peckT <= 0) { k._peckT = this.arng.float(cfg.pigeonPeck[0], cfg.pigeonPeck[1]); k._peck0 = k.t; }
        k.peck = k._peck0 !== undefined && k.t - k._peck0 < 0.3 ? Math.sin(Math.PI * (k.t - k._peck0) / 0.3) : 0;
        k._moveT -= h;
        if (k._moveT <= 0 && this.cards.length > 1) {   // flutters over to another sill now and then
          var others = this.cards.filter(function (c) { return c.id !== k.sillId; });
          var x0 = k.x, y0 = k.y; k._sillU = undefined; this._pigeonSill(k, this.arng.pick(others).id);
          this._pigeonFly(k, x0, y0, k.sx0, k.sy0, 0.8); k.state = 'hop';
        }
      }
      var w0 = 18, z0 = 0.3; k._qv += (-w0 * w0 * k._q - 2 * z0 * w0 * k._qv) * h; k._q += k._qv * h; k.sx = 1 + k._q; k.sy = 1 - k._q;
    } else if (k.type === 'bus') {
      var vmax = cfg.busSpeed, ah = this._ahead(k, 1);
      if (k.state === 'in') { var d = k.xStop - k.x; vmax = Math.min(vmax, Math.sqrt(Math.max(0, 2 * cfg.busBrake * d))); if (d <= 0.5) { k.state = 'stop'; k.t = 0; k.x = Math.max(k.x, k.xStop); vmax = 0; this._emit({ type: 'critter', critter: 'bus', action: 'stop', x: k.x, y: k.y }); } }
      else if (k.state === 'stop') { vmax = 0; k.stopT -= h; if (k.stopT <= 0) { k.state = 'out'; k.t = 0; } }
      if (ah) vmax = Math.min(vmax, Math.max(0, (ah.gap - cfg.carGap) * 3 + (ah.v.vx || 0)));
      var acc = clamp((vmax - k.vx) / h, -cfg.busBrake * 2, cfg.busAccel);
      k.vx += acc * h; if (k.state === 'stop') k.vx = Math.max(0, Math.min(k.vx, vmax));
      k.x += k.vx * h;
      k.rot += (clamp(acc * 0.00025, -0.05, 0.05) - k.rot) * Math.min(1, 6 * h);   // body pitch: nose dips when braking
      k.honk = Math.max(0, k.honk - h / 0.5); k.wave = Math.max(0, k.wave - h / 1.5);
      var w1 = 16, z1 = 0.3; k._qv += (-w1 * w1 * k._q - 2 * z1 * w1 * k._qv) * h; k._q += k._qv * h; k.sx = 1 + k._q; k.sy = 1 - k._q;
      if (k.state === 'out' && k.x - k.w / 2 > L.W + 20) k.state = 'gone';
    } else {   // balloon
      if (k.state === 'rise') {
        var ax = k.x;
        k.x = k.x0 + cfg.balloonSwayPx * Math.sin(TAU * cfg.balloonSwayHz * k.t + k._ph) + 0.4 * this.wind * k.t;
        k.y += -cfg.balloonRise * h;
        k.vx = (k.x - ax) / h;
      } else if (k.state === 'away') {
        var ax2 = k.x;
        k.vy = Math.max(-cfg.balloonAway, k.vy - 1200 * h); k.y += k.vy * h;
        k._spin += 9 * h; k.rot = k._spin + 0.2 * Math.sin(k._spin);
        k.x += 0.3 * this.wind * h; k.vx = (k.x - ax2) / h;
      }
      // the string is a damped pendulum hanging from the balloon; the balloon's sideways acceleration swings it
      var Ls = cfg.balloonString, axl = (k.vx - (k._vx0 || 0)) / h; k._vx0 = k.vx;
      k._sw += (-(980 / Ls) * Math.sin(k.swing) - 1.6 * k._sw - axl / Ls * Math.cos(k.swing) * 0.6) * h;
      k.swing = clamp(k.swing + k._sw * h, -0.8, 0.8);
      if (k.state === 'rise') k.rot = 0.08 * Math.sin(TAU * cfg.balloonSwayHz * k.t + k._ph + 1);
      if (k.y < -cfg.balloonSize * 1.5 - 60) k.state = 'gone';
    }
  };

  // ---------------------------------------------------------------- traffic (ambient)
  P._stepTraffic = function (h) {
    var cfg = this.cfg, L = this.layout, r = this.arng, i;
    var quiet = this.state === 'talk' || this.state === 'levelDone' || this.state === 'sessionDone' || this.state === 'menu';
    if (!quiet && this.time >= this._carNext) {
      this._carNext = this.time + 1;            // retry in 1 s when the lane entry is busy
      if (this.traffic.length < cfg.carMax) {
        var lane = r.int(0, 1), face = lane === 1 ? 1 : -1, x = face > 0 ? -cfg.carW / 2 - 10 : L.W + cfg.carW / 2 + 10;
        var probe = { lane: lane, x: x - face * 400, w: cfg.carW }, ah = this._ahead(probe, face);
        if (!ah || ah.gap > 260) {
          this.traffic.push({ id: 'car' + (this._carN++), kind: r.chance(0.5) ? 'car_a' : 'car_b', lane: lane, face: face, x: x, _px: x,
            y: L.groundY + cfg.carLaneDy[lane], _py: L.groundY + cfg.carLaneDy[lane], vx: face * r.float(cfg.carSpeed[0], cfg.carSpeed[1]), w: cfg.carW, h: cfg.carH });
          this.traffic[this.traffic.length - 1].v0 = Math.abs(this.traffic[this.traffic.length - 1].vx);
          this._carNext = this.time + r.float(cfg.carEvery[0], cfg.carEvery[1]);
        }
      }
    }
    for (i = this.traffic.length - 1; i >= 0; i--) {
      var c = this.traffic[i];
      c._px = c.x; c._py = c.y;
      var vmax = c.v0, a2 = this._ahead(c, c.face);
      if (a2) vmax = Math.min(vmax, Math.max(0, (a2.gap - cfg.carGap) * 3 + Math.abs(a2.v.vx || 0)));
      var sp = Math.abs(c.vx);
      sp += clamp((vmax - sp) / h, -cfg.carAccel * 2, cfg.carAccel) * h;
      c.vx = c.face * Math.max(0, sp);
      c.x += c.vx * h;
      if (c.x < -cfg.carW - 200 || c.x > L.W + cfg.carW + 200) this.traffic.splice(i, 1);
    }
  };

  // ---------------------------------------------------------------- Gigi's head (springy neck)
  /** Is (jx, jy) a valid head joint? reach, screen, top limit and (withGrid) ≥ headKeep px away from the window grid. */
  P._headOk = function (jx, jy, withGrid, reach) {
    var L = this.layout, cfg = this.cfg, h = L.gigi.h, b = headBoxAt(jx, jy, h, cfg), S = L.safe;
    var d = hyp(jx - L.neckBase.x, jy - L.neckBase.y);
    if (d > (reach || L.neckMax) + 1e-6 || d < L.neckMin - 1e-6) return false;
    if (b.x < S.x - 1e-6 || b.y < S.y - 1e-6 || b.x + b.w > S.x + S.w + 1e-6 || b.y + b.h > S.y + S.h + 1e-6) return false;
    if (jy < L.ins.top + cfg.headTopK * h - 1e-6) return false;
    if (withGrid && L.grid && overlapArea(b, inflate(L.grid.rect, cfg.headKeep)) > 0) return false;
    return true;
  };
  /** The valid head joint nearest to (tx, ty) (projections + a polar sample of the reach disc; the rest pose last). */
  P._nearestHead = function (tx, ty, withGrid) {
    var L = this.layout, cfg = this.cfg, h = L.gigi.h, base = L.neckBase, self = this, best = null, bd = 1e18;
    function consider(x, y) {
      // pull into the reach annulus first
      var dx = x - base.x, dy = y - base.y, d = hyp(dx, dy) || 1e-9;
      if (d > L.neckMax) { x = base.x + dx / d * L.neckMax; y = base.y + dy / d * L.neckMax; }
      else if (d < L.neckMin) { x = base.x + dx / d * L.neckMin; y = base.y + dy / d * L.neckMin; }
      if (!self._headOk(x, y, withGrid)) return;
      var e = hyp(x - tx, y - ty);
      if (e < bd) { bd = e; best = { x: x, y: y }; }
    }
    consider(tx, ty);
    if (best && bd < 1e-6) return best;
    // screen-clamped target
    var s = cfg.headK * h, ox = cfg.headJoint[0] / cfg.headBoxSvg * s, oy = cfg.headJoint[1] / cfg.headBoxSvg * s, S = L.safe;
    var cx = clamp(tx, S.x + ox, S.x + S.w - (s - ox)), cy = clamp(ty, Math.max(S.y + oy, L.ins.top + cfg.headTopK * h), S.y + S.h - (s - oy));
    consider(cx, cy);
    if (withGrid && L.grid) {   // just outside the forbidden rect for the joint (grid + keep-out, grown by the head box offsets)
      var E = inflate(L.grid.rect, cfg.headKeep), F = { x: E.x - (s - ox), y: E.y - (s - oy), w: E.w + s, h: E.h + s }, m = 0.5;
      [[F.x - m, cy], [F.x + F.w + m, cy], [cx, F.y - m], [cx, F.y + F.h + m],
        [F.x - m, F.y - m], [F.x + F.w + m, F.y - m], [F.x - m, F.y + F.h + m], [F.x + F.w + m, F.y + F.h + m]].forEach(function (p) { consider(p[0], p[1]); });
    }
    for (var ai = 0; ai < 40; ai++) for (var ri = 0; ri < 6; ri++) {
      var ang = ai / 40 * TAU, rad = L.neckMin + (L.neckMax - L.neckMin) * (ri + 0.5) / 6;
      consider(base.x + Math.cos(ang) * rad, base.y + Math.sin(ang) * rad);
    }
    consider(L.headRest.x, L.headRest.y);
    return best || { x: L.headRest.x, y: L.headRest.y };
  };
  P._snapHead = function () {
    var g = this.gigi, L = this.layout;
    g.headX = g._phx = L.headRest.x; g.headY = g._phy = L.headRest.y; g._hvx = g._hvy = 0;
    g.neckBaseX = L.neckBase.x; g.neckBaseY = L.neckBase.y; g.tx = L.headRest.x; g.ty = L.headRest.y;
  };
  /** Head target (cached): rest / walking lean / the window Gigi looks at / the roof while the building cheers. */
  P._headTarget = function () {
    var g = this.gigi, L = this.layout, cfg = this.cfg, h = L.gigi.h, key, tx, ty, grid = true;
    var look = this._lookId && this.time - this._lookT < cfg.lookHold ? this.cardById(this._lookId) : null;
    if (this.state === 'round' && this.phase === 'scroll') { key = 'walk'; tx = L.headRest.x + cfg.walkLead * h; ty = L.headRest.y; grid = false; }
    else if (this.state === 'round' && this.phase === 'cheer' && L.grid) { key = 'roof'; var B = L.grid.building; tx = B.x + B.w / 2; ty = B.y - B.roofH; }
    else if (this.state === 'round' && look && L.grid) { key = 'win:' + look.id; tx = look.hx; ty = look.hy; }
    else { key = 'rest'; tx = L.headRest.x; ty = L.headRest.y; }
    key += '|' + this._gridVer;
    if (key !== this._tKey) {
      this._tKey = key;
      var q = this._nearestHead(tx, ty, grid);
      g.tx = q.x; g.ty = q.y; g._tGrid = grid;
    }
  };
  P._stepGigi = function (h) {
    var d = this.gigi, cfg = this.cfg, L = this.layout;
    d._phx = d.headX; d._phy = d.headY; d._phop = d.hop;
    if (d.moodT > 0) { d.moodT -= h; if (d.moodT <= 0) { d.moodT = 0; d.mood = 'idle'; } }
    // eyes
    var B = L.grid ? L.grid.rect : L.board, lx = B.x + B.w / 2, ly = B.y + B.h / 2;
    if (this._lookId && this.time - this._lookT < cfg.lookHold) { var c = this.cardById(this._lookId); if (c) { lx = c.x; ly = c.y; } }
    if (d.walking) { lx = L.W; ly = L.gigi.y - 1.5 * L.gigi.h; }
    var k = Math.min(1, h * cfg.lookRate);
    d.lookX += (lx - d.lookX) * k; d.lookY += (ly - d.lookY) * k;
    // hops (mood) + trot bob
    var hop = 0;
    if (d._hopT >= 0) {
      d._hopT += h;
      var n = d._hopT / cfg.hopTime;
      if (n >= d._hopN) d._hopT = -1;
      else { var ph = n - Math.floor(n); hop = d._hopPx * Math.pow(0.7, Math.floor(n)) * 4 * ph * (1 - ph); }
    }
    if (d.walking) {
      var w0 = d.walk; d.walk = (d.walk + cfg.walkHz * h) % 1;
      var f0 = Math.floor(w0 * 2), f1 = Math.floor(d.walk * 2) + (d.walk < w0 ? 2 : 0);
      if (f1 !== f0) { d._foot = (d._foot + 1) % 2; this._emit({ type: 'walk', foot: d._foot }); }
      hop += cfg.walkBob * Math.abs(Math.sin(TAU * d.walk));
    } else d.walk = 0;
    d.hop = hop;
    // blink
    d._blinkT -= h;
    if (d._blinkT <= 0) { d._blinkOn = cfg.blinkTime; d._blinkT = this.arng.float(cfg.blinkEvery[0], cfg.blinkEvery[1]); }
    if (d._blinkOn > 0) d._blinkOn -= h;
    d.blink = d._blinkOn > 0 ? 1 : 0;
    // head: spring to the target, then the hard limits (grid keep-out, screen, reach)
    this._headTarget();
    // (the body hop lifts the head target too: the head follows through the springy neck, a little late)
    var w = cfg.headOmega, z = cfg.headZeta;
    d._hvx += (w * w * (d.tx - d.headX) - 2 * z * w * d._hvx) * h; d._hvy += (w * w * (d.ty - hop - d.headY) - 2 * z * w * d._hvy) * h;
    var nx = d.headX + d._hvx * h, ny = d.headY + d._hvy * h;
    var base = L.neckBase, dd = hyp(nx - base.x, ny - base.y) || 1e-9, mx = cfg.stretchMaxK * L.neckMax;
    if (dd > mx) { nx = base.x + (nx - base.x) / dd * mx; ny = base.y + (ny - base.y) / dd * mx; }
    if (dd < L.neckMin) { nx = base.x + (nx - base.x) / dd * L.neckMin; ny = base.y + (ny - base.y) / dd * L.neckMin; }
    if (!this._headOk(nx, ny, d._tGrid !== false, mx)) {
      // the overshoot would hit the keep-out / the screen edge: slide along it (keep the free axis), else stop there
      if (this._headOk(nx, d.headY, d._tGrid !== false, mx)) { ny = d.headY; d._hvy = 0; }
      else if (this._headOk(d.headX, ny, d._tGrid !== false, mx)) { nx = d.headX; d._hvx = 0; }
      else if (this._headOk(d.headX, d.headY, d._tGrid !== false, mx)) { nx = d.headX; ny = d.headY; d._hvx = d._hvy = 0; }
      else { var q = this._nearestHead(nx, ny, d._tGrid !== false); nx = q.x; ny = q.y; d._hvx = d._hvy = 0; }
    }
    d.headX = nx; d.headY = ny;
    d.neckBaseX = base.x; d.neckBaseY = base.y - hop;     // the neck base rides on the hopping body
    d.neckLen = hyp(nx - base.x, ny - base.y);
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
      var o = this.cards[i]; o._px = o.x; o._py = o.y; o._prot = o.rot; o._popen = o.open; o._pflip = o.flip; o._pbloom = o.bloom; o._pbounce = o.bounce;
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
    for (i = 0; i < this.cards.length; i++) this._stepWindow(this.cards[i], h);
    if (this.critter) { this._stepCritter(h); if (this.critter && this.critter.state === 'gone') this.critter = null; }
    this._stepTraffic(h);
    this._stepGigi(h);
  };

  P._stepRound = function (h) {
    var cfg = this.cfg, cards = this.cards, i, c, all;
    switch (this.phase) {
      case 'scroll': {
        var L = this.layout, u = this.phaseTime / cfg.scrollTime, s = smooth(u), dPx = (s - this.scrollT) * L.W;
        this.scrollT = s; this.scroll = this._scroll0 + s * L.W;
        this.buildingDx = (1 - s) * L.W; this.prevDx = -s * L.W;
        // the critter and the cars belong to the street: they move with it
        for (i = 0; i < this.traffic.length; i++) { this.traffic[i].x -= dPx; }
        if (this.critter) { var k = this.critter; k.x -= dPx; if (k.x0 !== undefined) k.x0 -= dPx; if (k.xStop !== undefined) k.xStop -= dPx; if (k._bz) { k._bz.x0 -= dPx; k._bz.cx -= dPx; k._bz.x1 -= dPx; }
          if (k.x < -400) this.critter = null; }
        if (u >= 1) {
          if (this._holdT < 0) {
            this.scrollT = 1; this.buildingDx = 0; this.prevDx = -L.W; this.prevBuilding = null; this.gigi.walking = false;
            this._holdT = 0;
          }
          this._holdT += h;
          if (this._holdT >= cfg.scrollSettle) { this._holdT = -1; this._startPeek(); }
        }
        break;
      }
      case 'peek':
        for (i = 0; i < cards.length; i++) { c = cards[i]; if (c.waveT >= 0) { c.waveT -= h; if (c.waveT <= 0) { c.waveT = -1; c.openT = c.flipT = 1; } } }
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
        for (i = 0; i < cards.length; i++) { c = cards[i]; if (c.waveT >= 0) { c.waveT -= h; if (c.waveT <= 0) { c.waveT = -1; c.openT = c.flipT = 0; } } }
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
          var busy = false;
          if (this.surprise === 'bus') for (i = 0; i < this.traffic.length; i++) { var t = this.traffic[i]; if (t.lane === 1 && t.x < 300) busy = true; }
          if (busy) this._critterAt = this.time + 0.5; else { this._critterAt = -2; this._spawnCritter(); }
        }
        if (this._doneT >= 0) {
          this._doneT += h;
          if (this._doneT >= cfg.matchCelebrate) { this._doneT = -1; this._startCheer(); }
          break;
        }
        if (this.solved) { if (this.phase !== 'resolve') this._setPhase('resolve'); break; }
        var want = this._mis || young ? 'resolve' : 'play';
        if (this.phase !== want) this._setPhase(want);
        // idle nudges (only while playing)
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

  /** One window: shutters (spring + hinge stop + clack), hint crack, breeze sway, lamp, flower box, face hops / wiggle. */
  P._stepWindow = function (c, h) {
    var cfg = this.cfg, w, z, u;
    if (c.glowT > 0) c.glowT = Math.max(0, c.glowT - h);
    c.glow = c.glowT > 0 ? clamp(Math.min(c.glowT / 0.4, (cfg.hintGlowTime - c.glowT) / 0.2), 0, 1) : 0;
    // hint: a closed window opens a crack
    if (c.state === 'down') {
      if (c.peekT >= 0) {
        c.peekT += h;
        var pk = c.peekT >= cfg.hintPeekDelay && c.peekT < cfg.hintPeekDelay + cfg.hintPeekHold ? cfg.hintPeekOpen : 0;
        if (c.peekT >= cfg.hintPeekDelay + cfg.hintPeekHold) c.peekT = -1;
        c.openT = c.flipT = pk;
      } else if (c.waveT < 0 && (this.phase === 'play' || this.phase === 'resolve' || this.phase === 'cheer')) c.openT = c.flipT = 0;
    }
    var tgt = c.openT;
    if (tgt >= 1 && this.wind) tgt += cfg.breezeSway * clamp(this.wind / cfg.breezeWind, -1.5, 1.5) * Math.sin(c._ph + TAU * cfg.breezeHz * this.time);
    // shutters: under-damped spring, hinge stop at openMax, a clack when they shut
    w = cfg.openOmega; z = cfg.openZeta;
    c._ov += (w * w * (tgt - c.open) - 2 * z * w * c._ov) * h;
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
    // match: lamp, flower box, face hops
    if (c.state === 'matched') {
      c._mt += h;
      c.light = smooth((c._mt - cfg.matchHold) / cfg.lightTime);
      if (c._mt >= c._popA) {
        if (!c._popped) { c._popped = true; this._emit({ type: 'bloom', id: c.id, x: c.x, y: c.y + c.h / 2 }); }
        w = cfg.bloomOmega; z = cfg.bloomZeta;
        c._blv += (w * w * (1 - c.bloom) - 2 * z * w * c._blv) * h; c.bloom += c._blv * h;
      }
    }
    // face hops: exact ballistic arcs bounce = v0·t − ½·g·t² (apex = the hop height), one after the other
    if (c._bT >= 0) { c._bT -= h; if (c._bT < 0 && c._bq > 0) { c._bq--; c._bvy = Math.sqrt(2 * cfg.bounceG * c._bPx); c._bt = 0; } }
    if (c._bvy > 0) {
      c._bt += h;
      var tH = 2 * c._bvy / cfg.bounceG;
      if (c._bt >= tH) {
        if (c._bq > 0) { c._bq--; c._bt -= tH; } else { c._bvy = 0; c._bt = 0; }
      }
      c.bounce = c._bvy > 0 ? Math.max(0, c._bvy * c._bt - 0.5 * cfg.bounceG * c._bt * c._bt) : 0;
    }
    // mismatch: the faces shake "no-no"
    c.wiggle = 0;
    if (c.shakeT >= 0) {
      c.shakeT += h; u = c.shakeT / cfg.shakeTime;
      if (u >= 1) c.shakeT = -1;
      else c.wiggle = cfg.shakeAmp * Math.sin(TAU * cfg.shakeWiggles * u) * (1 - u) * (1 - u);
    }
  };

  GW.World = World;
})(window.GW = window.GW || {});
