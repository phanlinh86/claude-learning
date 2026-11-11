/* Tuk's Ice Match — IM.CONFIG + IM.World (headless, deterministic ice-block memory simulation; DESIGN §2, §5.2)
 *
 * ============================== CONVENTIONS ==============================
 *  Units: logical px (short side = 720), seconds, radians, y DOWN. rot > 0 = clockwise (canvas).
 *  update(dt) runs fixed sub-steps of cfg.step (1/120 s) with an accumulator. At the START of every sub-step each block,
 *  reward and reward piece stores _px,_py,_prot (blocks also _pflip); the renderer draws p = _p + (p − _p)·w.alpha.
 *  The result depends only on the seed and the sub-step at which inputs arrive.
 *
 *  Block c = w.cards[i] (alias w.items; state deal | down | up | matched | gone):
 *    centre (x, y), size w × h (the grid size, aspect 0.9) × (sx, sy), rotation rot, alpha. Draw 'deal' blocks at (x, y) like
 *    any other (they slide in from off-screen: left in landscape, bottom in portrait). vx, vy = current glide velocity.
 *    flip 0 = frosted … 1 = clear ice (picture visible);  frost = 1 − flip (convenience).
 *    crack 0..1 = crack-line progress while a tap/rub reveal cracks the frost (0 otherwise; the frost then clears with flip).
 *    melt 0..1 = a matched block melting into the ice (already in sx/sy and alpha; draw a wet sheen ∝ melt).
 *    hole (bool) + holeT 0..1 (ripple age) + holeA 0..1 (fade): a 'gone' block with hole = true → draw the melt hole at
 *      (x, y), size w × h (IM.IceArt.drawHole) until the reward has left.  Only ONE block of a pair carries the hole.
 *    lift 0..1 (raised + bigger shadow; only the slide surprise), glow 0..1 = hint halo, glint 0..~0.35 = faint idle sparkle
 *    on a frosted block, bob = floe offset in px (floes surprise; already in x/y). Draw matched blocks LAST (they glide
 *    over the others).
 *  Reward r (state emerge | fly | settle | idle), r.sx/r.sy pop-in scale while emerging, r.alpha (chapter-end fade):
 *    fish / fishes  r.pieces[] { x, y, rot, face, _px, _py, _prot, color, wag 0..1, state 'wait'|'air'|'done' }: draw only
 *                   pieces in 'air': translate(x,y) → rotate(rot) → if face < 0 scale(1,−1) → a RIGHT-facing fish of width
 *                   r.pieceSize (rot = heading = atan2(vy, vx)). The reward is removed after the last splash.
 *    sculpture      BOTTOM-CENTRE anchor (x, y), width r.size, r.shape, r.color, r.glow, rot (slide wobble)
 *    animal         BOTTOM-CENTRE anchor (x, y), width r.size, r.face ±1 (+1 = facing right), squash sx/sy about the anchor;
 *                   r.home (homes topic) + r.badge {x, y, size, alpha}: draw the home badge (sprite home_<home>) centred
 *                   at badge.x, badge.y BEFORE the animal.
 *    star           centre (x, y), r.size × (sx, sy), r.glow, r.text
 *  Tuk: w.tuk (= w.dee, same object) { mood, moodT, lookX, lookY, hop, slide, belly } — hop = px ABOVE the feet anchor
 *    (layout.tuk), slide = px to the right of the anchor (belly slide at round end), belly = true while sliding (pose).
 *  w.aurora 0..1 = green aurora shimmer strength (aurora surprise round; peaks 1.5 s after the golden match).
 *  Layout extras: layout.tuk (= layout.dee), layout.shore {x, y, w, h} (where rewards settle), layout.sea {x, y, w}
 *    (open water the fish dive into), layout.perches [{x, y, kind:'shore'|'sky'|'sea'}].
 * ========================================================================
 */
(function (IM) {
  'use strict';

  var CONFIG = {
    // ---- timing / state machine (s)
    step: 1 / 120,             // fixed simulation sub-step (≤ 1/120 per DESIGN)
    maxFrame: 1.0,             // largest dt accepted per update() (speed mode passes big dt)
    roundsPerLevel: 4,         // rounds per chapter (warm-up + 3)
    chapterTimeLimit: 75,      // s since the chapter began: after ≥ chapterMinRounds rounds go to Talk time once exceeded (Dee 80; sims: careful 5-year-old p90 489 → 478 s)
    chapterMinRounds: 3,
    introTime: 2.5,            // chapter banner + weather line + the 2.5 s weather crossfade
    roundEndDelay: 0.4,        // s after the last pair melted → roundDone (the last reward leaps on during roundDone)
    roundDoneTime: 1.6,        // stars + Tuk's belly slide (1.56 s) + short praise, then the next round (Dee 1.8)
    talkAfterAnswer: 2.0,      // the Talk panel stays after an answer
    levelDoneTime: 2.0,        // chapter stars
    rewardFadeTime: 1.2,       // rewards fade out during levelDone (they stay the whole chapter)
    talkAskTime: 12,           // s without an answer → talkAsk (re-ask), repeating
    talkGlowAfterAsks: 2,      // from this re-ask on talk.glowAnswer = true

    // ---- content tuning (playtest-tuned; null → the DESIGN tables IM.Content.PAIRS / PEEK)
    pairsByAge: { 3: [2, 2, 2, 3], 4: [2, 2, 3, 3], 5: [2, 3, 4, 4], 6: [3, 3, 4, 5], 7: [3, 4, 4, 5] },
    peekByAge: { 3: 2.8, 4: 2.2, 5: 2.0, 6: 1.5, 7: 1.5 },   // s clear (DESIGN Dee 3.5 / 2.5 / 2.0 / 1.5 / 1.5) …
    peekPerCard: true,         // … × (0.6 + 0.1·blocks): 4 blocks 1.0×, 6 → 1.2×, 8 → 1.4×, 10 → 1.6×

    // ---- surprise round: one per chapter, the type rotates per chapter from a random start per session
    surpriseRound: 2,          // round index (the 3rd round; always played: the chapter limit applies after ≥ 3 rounds)
    surpriseTypes: ['slide', 'aurora', 'floes'],
    slideTime: 1.0,            // slide: after the hide 2 frosted blocks glide to swap places (2 swaps from age slideFrom) …
    slideFrom: 5,
    slideArc: 0.35,            // … along curves bulging 0.35·d + 30 px (≥ 1.05 × the block's long side) to opposite sides
    slideSettle: 0.15,         // s after the swap → play
    floesScale: 0.92,          // floes: blocks 0.92× the grid size (never below the age minimum) …
    floesArc: 0.4,             // … columns follow an arc of up to 0.4·block height, rows stagger sideways …
    floeBob: 3, floeBobHz: 0.4,    // … each floe bobs ±3 px …
    floeDrift: 2, floeDriftHz: 0.13,   // … and drifts ±2 px sideways (≥ 14 px gaps are kept: drift ≤ (gap − 14)/2)
    auroraRise: 1.2,           // aurora shimmer fades in over 1.2 s at the round start …
    auroraBoost: 0.5,          // … +0.5 for 1.5 s after the golden pair (w.aurora up to 1.5)
    adaptHold: true,           // after a HARD round the next round does not grow …
    adaptSlowPlay: 40,         // … hard = more than 40 s of play, or only 1 star

    // ---- layout (DESIGN §2; px)
    shortSide: 720, minLong: 960, maxLong: 1600,
    groundOffset: 90,          // groundY = H − ins.bottom − 90
    deeDxLand: 110, deeDyLand: 16, deeHLand: 180,   // Tuk feet anchor, landscape (names kept from Dee)
    deeDxPort: 100, deeDyPort: 20, deeHPort: 170,   // portrait
    deeBoxW: 1.0,              // Tuk's box is h × (1.0·h) around the anchor (the 256² sprite) — used for keep-out tests
    bubbleX: 24, bubbleY: 20, bubbleMaxW: 640, bubbleRightGap: 160, bubbleH: 122,   // landscape bubble
    bubbleHPort: 124, bubbleGapPort: 24,   // portrait: the bubble sits BELOW the HUD: y = ins.top + hudH + 24
    hudW: 160, hudH: 96,       // DOM buttons top-right: x > W − ins.right − 160, y < ins.top + 96
    boardTopGap: 24, boardGroundGap: 10, boardDeeGapLand: 130, boardSide: 24, boardDeeHeadGap: 10, boardDeeSideGap: 40,
    shoreTop: -10, shoreH: 60, // layout.shore = groundY − 10 … groundY + 50
    seaDx: 90, seaDy: 34, seaW: 120,   // layout.sea centre (W − ins.right − 90, groundY + 34), width 120

    // ---- blocks / grid
    cardAspect: 0.9,           // w : h (chunky, nearly square ice blocks)
    gapFrac: 0.12, gapMin: 14, // gap = max(14, 0.12·cw)
    cardMin: { 3: 120, 4: 120, 5: 104, 6: 104, 7: 104 },   // smallest allowed block width per age
    cardMax: 210,
    hitPad: 10,                // hit test = block rect grown by 10 px; nearest rect wins (unmatched blocks first)
    sameTapHint: 3,            // 3 taps on the one open block (no idle reset) → auto hint (partner glows)
    thirdTapAfter: 0.5,        // the third-tap reset needs both mismatched faces shown ≥ 0.5 s
    tukColor: 'red', tukColorGap: 40,   // colour rounds: no red block within 40 px of Tuk's box (Tuk's hat is red)

    // deal: blocks slide in on the ice like a train (same distance D for all → they never overlap), constant friction
    dealStagger: 0.07,         // s between blocks starting (far side first)
    dealFriction: 5000,        // μ px/s² (sims: 4000 → 5000, a 1556-px row slides in 0.78 s): v0 = sqrt(2·μ·D) → they stop exactly in their slot after T = sqrt(2D/μ)
    dealBumpV: 140, bumpOmega: 28, bumpZeta: 0.45,   // tiny overshoot bump (peak ≈ 4 px) on arrival
    dealSquash: 0.06,          // arrival squash q
    dealSettle: 0.15,          // s after the last block stopped → peek
    // reveal / hide
    crackTime: 0.12,           // tap / rub: crack lines 0 → 1 in 0.12 s, then the frost clears (flip spring) …
    flipOmega: 18,             // … critically damped ω 18 (0 → 0.95 in ≈ 0.26 s)
    hideOmega: 10,             // frost grows back slower (ω 10: 1 → 0.05 in ≈ 0.47 s)
    liftPx: 8,
    peekStagger: 0.05, playAtHide: 0.5,
    squashOmega: 20, squashZeta: 0.35,
    glintEvery: [3, 6], glintTime: 0.5, glintAmp: 0.35,   // idle: a faint sparkle on frosted blocks every 3–6 s
    // match: glide together (exponential friction), clink (restitution), melt into a hole
    matchAt: 0.95,             // the check happens when the 2nd block's flip ≥ 0.95
    matchHold: 0.15,           // both pictures shown, then the glide starts
    matchResolveTime: 0.4,     // phase back to 'play' 0.4 s after the check (the pair glides on)
    glideFriction: 2.2,        // k /s: v' = −k·v (ice) → x(t) = x0 + v0/k·(1 − e^(−kt))
    glideContactV: 180,        // px/s left when the blocks touch: v0 = k·s + 180 (s = each block's way to contact)
    clinkRest: 0.3,            // elastic bounce at contact: v → −0.3·v
    glideMaxTime: 2.5,         // safety: contact forced after 2.5 s
    meltDelay: 0.1, meltTime: 0.4,     // melt starts 0.1 s after the clink, takes 0.4 s (shrink to 0.15 + fade)
    holeTime: 1.2,             // hole ripple / fade (stays at least until the reward left)
    mismatchShow: 1.0, mismatchShowByAge: { 3: 1.2 },
    shakeAmp: 0.07, shakeWiggles: 3, shakeTime: 0.55,   // wobble: damped sine rotation ±0.07 rad, 3 wiggles
    fastReset: true,

    // ---- help
    hintAfterStreak: 3, hintCooldown: 6, hintGlowTime: 2.5,
    hintPeekDelay: 0.2, hintPeekHold: 0.45, hintPeekFlip: 0.75,
    idleTime: 12, idleBackoff: 1.5, idleMax: 30, idleHintFrom: 2,

    // ---- rewards (one per match)
    maxRewards: 30,            // per chapter (DESIGN §8)
    perchStep: 52, perchJitter: [18, 12], perchMinGap: 24, perchMargin: 10,
    groundPerchDy: [72, 40, 8],   // shore rows: bottom anchor at groundY + 72 (front), + 40, + 8 (back rows; render by y)
    seaCount: 2,               // the 2 rightmost front-row shore perches are 'sea' (the water's edge: whale / seal / walrus)
    sizes: { fish: 40, sculpture: 58, animal: 70, star: 52, piece: 34, badge: 58 },
    emergeTime: 0.22,          // a reward pops out of the hole (scale 0.35 → 1)
    fishG: 1400,               // fish: ballistic parabola (g px/s²) from the hole to layout.sea …
    fishApex: [120, 200],      // … apex 120–200 px above the higher end (kept ≥ ins.top + 40)
    fishStagger: 0.35,         // fishes: one fish every 0.35 s (counted aloud: leap.k)
    fishWagHz: 6,
    sculptFriction: 900,       // sculpture slides on the ice with constant friction μ (v0 = sqrt(2μd), stops exactly)
    badgeDx: -36, badgeDy: -30, badgeFade: 0.4,   // home badge centre relative to the animal's feet anchor
    flyTime: [0.9, 1.8], flySpeed: 900, flyArc: 0.35, flyArcMax: 170,   // stars rise on a bezier
    settleTime: 0.6,
    hopG: 2600, hopApex: [80, 46, 30], animalHops: 3, hopSquash: 0.18,
    idleHopEvery: [4, 8], idleHopPx: 10,
    starTwinkle: 0.1, starHz: 1.4, bobPx: 4,

    // ---- Tuk
    moodTime: { happy: 0.9, cheer: 1.6, oops: 0.8, think: 1.4 },
    hopPx: { happy: 14, cheer: 26 }, hopTime: 0.4, lookRate: 6, lookHold: 3,
    tukSlidePx: 70, tukSlideFriction: 500, tukSlideHold: 0.25, tukSlideDelay: 0.25   // belly slide 70 px and back (0.25 + 2·0.53 + 0.25 = 1.56 s)
  };
  IM.CONFIG = CONFIG;

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
  function union(a, b) { var x = Math.min(a.x, b.x), y = Math.min(a.y, b.y); return { x: x, y: y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }; }
  function inside(R, S) { return R.x >= S.x - 1e-6 && R.y >= S.y - 1e-6 && R.x + R.w <= S.x + S.w + 1e-6 && R.y + R.h <= S.y + S.h + 1e-6; }
  function isFishKind(k) { return k === 'fish' || k === 'fishes'; }

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
    var tuk = portrait ? { x: ins.left + cfg.deeDxPort, y: groundY + cfg.deeDyPort, h: cfg.deeHPort }
      : { x: ins.left + cfg.deeDxLand, y: groundY + cfg.deeDyLand, h: cfg.deeHLand };
    var dw = tuk.h * cfg.deeBoxW;
    var tukRect = { x: tuk.x - dw / 2, y: tuk.y - tuk.h, w: dw, h: tuk.h };
    var bx = ins.left + cfg.bubbleX;
    var bubble = portrait
      ? { x: bx, y: ins.top + cfg.hudH + cfg.bubbleGapPort, w: Math.min(cfg.bubbleMaxW, W - bx - ins.right - cfg.bubbleX), h: cfg.bubbleHPort }
      : { x: bx, y: ins.top + cfg.bubbleY, w: Math.min(cfg.bubbleMaxW, W - bx - ins.right - cfg.bubbleRightGap), h: cfg.bubbleH };
    var hud = { x: W - ins.right - cfg.hudW, y: 0, w: cfg.hudW + ins.right, h: ins.top + cfg.hudH };
    var top = bubble.y + bubble.h + cfg.boardTopGap, bottom = groundY - cfg.boardGroundGap, boards;
    if (!portrait) {
      var lx = tuk.x + cfg.boardDeeGapLand;
      boards = [{ x: lx, y: top, w: W - ins.right - cfg.boardSide - lx, h: bottom - top }];
    } else {
      var ax = ins.left + cfg.boardSide, bxx = tukRect.x + tukRect.w + cfg.boardDeeSideGap;
      boards = [
        { x: ax, y: top, w: W - ins.right - cfg.boardSide - ax, h: tukRect.y - cfg.boardDeeHeadGap - top },   // A: above Tuk
        { x: bxx, y: top, w: W - ins.right - cfg.boardSide - bxx, h: bottom - top }                             // B: right of Tuk
      ];
    }
    boards.forEach(function (b) { b.w = Math.max(0, b.w); b.h = Math.max(0, b.h); });
    var L = {
      W: W, H: H, ins: ins, portrait: portrait, tall: tall, groundY: groundY, tuk: tuk, dee: tuk, tukRect: tukRect, deeRect: tukRect,
      bubble: bubble, hud: hud, boards: boards, board: boards[0],
      shore: { x: ins.left, y: groundY + cfg.shoreTop, w: W - ins.left - ins.right, h: cfg.shoreH },
      sea: { x: W - ins.right - cfg.seaDx, y: groundY + cfg.seaDy, w: cfg.seaW },
      stack: portrait ? { x: W / 2, y: H + 40 } : { x: ins.left - 60, y: groundY - 60 },   // where the deal comes from (info)
      safe: { x: ins.left, y: ins.top, w: W - ins.left - ins.right, h: H - ins.top - ins.bottom },
      grid: null, perches: []
    };
    L.perchCands = perchCandidates(L, cfg);
    L.perches = L.perchCands.map(function (p) { return { x: p.x, y: p.y, kind: p.kind }; });
    return L;
  }

  /* ------------------------------------------------------------------ grid (as Dee; block aspect 0.9) */
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
          var sq = Math.abs(cols - rows) - Math.abs(best.cols - best.rows);
          if (sq !== 0) better = sq < 0;
          else if (bi !== best.bi) better = bi < best.bi;
          else better = (L.portrait ? rows - best.rows : cols - best.cols) > 0;
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

  /** Floes surprise: the slots become little ice floes — blocks 0.92× (≥ the age minimum), columns on an arc, rows staggered
   * sideways; neighbours keep ≥ gapMin + 2·floeDrift (they drift); the result is re-centred in the board. */
  function floesLayout(g, age, cfg) {
    var B = g.board, minW = cfg.cardMin[age] || cfg.cardMin[5];
    var cw = Math.min(g.cw, Math.max(minW, g.cw * cfg.floesScale)), ch = cw / cfg.cardAspect;
    var px = g.cw + g.gap, py = g.ch + g.gap, gapX = px - cw, keep = cfg.gapMin + 2 * cfg.floeDrift;
    var gw = (g.cols - 1) * px + cw, gh = (g.rows - 1) * py + ch;
    var S = Math.max(0, Math.min((gapX - keep) / 2, (B.w - gw) / 2 - cfg.floeDrift, 0.25 * cw));
    var A = Math.max(0, Math.min(B.h - gh - 2 * cfg.floeBob, cfg.floesArc * ch));
    var pts = g.slots.map(function (s, k) {
      var r = Math.floor(k / g.cols), c = Math.round((s.x - g.x0 - g.cw / 2) / px * 1e6) / 1e6;
      var arc = function (cc) { return Math.sin(Math.PI * (clamp(cc, 0, g.cols - 1) + 0.5) / g.cols); };
      var lift = Math.abs(c - Math.round(c)) > 1e-3 ? Math.min(arc(c - 0.5), arc(c + 0.5)) : arc(c);
      return { x: s.x + (r % 2 ? S : -S) * (g.rows > 1 ? 1 : 0), y: s.y - A * lift };
    });
    var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    pts.forEach(function (q) { x0 = Math.min(x0, q.x - cw / 2); x1 = Math.max(x1, q.x + cw / 2); y0 = Math.min(y0, q.y - ch / 2); y1 = Math.max(y1, q.y + ch / 2); });
    var dx = B.x + (B.w - (x1 - x0)) / 2 - x0, dy = B.y + (B.h - (y1 - y0)) / 2 - y0;
    pts.forEach(function (q) { q.x += dx; q.y += dy; });
    var o = {}; for (var k in g) o[k] = g[k];
    o.cw = cw; o.ch = ch; o.slots = pts; o.style = 'floes';
    o.rect = { x: x0 + dx, y: y0 + dy, w: x1 - x0, h: y1 - y0 };
    o.minOk = cw >= minW - 1e-9;
    // motion room: bob / drift never push a block out of the board nor two blocks closer than gapMin
    o.bobAmp = Math.max(0, Math.min(cfg.floeBob, (B.h - o.rect.h) / 2, (py - ch - cfg.gapMin) / 2));
    o.driftAmp = Math.max(0, Math.min(cfg.floeDrift, (B.w - o.rect.w) / 2, (gapX - cfg.gapMin) / 2));
    return o;
  }

  /* ------------------------------------------------------------------ perches
   * Candidate points: 'shore' (two rows along the snow bank), 'sea' (the 2 rightmost front-row points, at the water's edge)
   * and 'sky' (a grid above the board for stars). A point is valid for a reward when its box is inside the safe area and
   * clear of the bubble, HUD, Tuk and the CURRENT block grid (all grown by perchMargin). Fish never perch (they dive). */
  function perchCandidates(L, cfg) {
    var out = [], ins = L.ins, st = cfg.perchStep, x, y, i, j;
    var jr = new IM.RNG((Math.imul(L.W | 0, 7919) ^ Math.imul(L.H | 0, 104729) ^ 0x51ed) >>> 0), JX = cfg.perchJitter[0], JY = cfg.perchJitter[1];
    var gdy = [].concat(cfg.groundPerchDy);
    for (j = 0; j < gdy.length; j++) {
      var gx = [];
      for (x = ins.left + 44 + (j % 2) * st / 2; x <= L.W - ins.right - 44 + 1e-6; x += st) gx.push(x);
      for (i = 0; i < gx.length; i++) out.push({ x: clamp(gx[i] + jr.float(-JX, JX), ins.left + 40, L.W - ins.right - 40), y: L.groundY + gdy[j] + jr.float(-4, 4),
        kind: j === 0 && i >= gx.length - cfg.seaCount ? 'sea' : 'shore', row: j });
    }
    var row = 0;
    for (y = ins.top + 40; y <= L.groundY - 50; y += st * 0.85, row++)
      for (x = ins.left + 36 + (row % 2) * st / 2; x <= L.W - ins.right - 36; x += st) out.push({ x: x + jr.float(-JX, JX), y: y + jr.float(-JY, JY), kind: 'sky' });
    return out;
  }
  var PREF = {
    sculpture: ['shore', 'sea'], star: ['sky'], animal: ['shore', 'sea'],
    whale: ['sea', 'shore'], seal: ['sea', 'shore'], walrus: ['sea', 'shore']
  };
  function prefFor(r) {
    if (r.kind === 'animal') { if (r.home) return PREF.animal; var a = String(r.sprite || '').replace('animal_', ''); return PREF[a] || PREF.animal; }
    return PREF[r.kind] || PREF.animal;
  }
  /** Final placement of reward kind at perch point p → { x, y, box, badge? }. home → the animal stands beside its badge. */
  function placeAt(kind, p, cfg, n, home) {
    var S = cfg.sizes, s, o = { ax: null, ay: null };
    switch (kind) {
      case 'animal': {
        s = S.animal; o.x = p.x; o.y = p.y; o.box = { x: p.x - s / 2, y: p.y - s, w: s, h: s };
        if (home) {
          var bs = S.badge, bx = p.x + cfg.badgeDx, by = p.y + cfg.badgeDy;
          o.badge = { x: bx, y: by, size: bs };
          o.box = union(o.box, { x: bx - bs / 2, y: by - bs / 2, w: bs, h: bs });
        }
        break;
      }
      case 'sculpture': s = S.sculpture; o.x = p.x; o.y = p.y; o.box = { x: p.x - s / 2, y: p.y - s, w: s, h: s }; break;
      default: {   // star: hovers in the sky (a sky point) or sits on the snow bank
        s = S[kind] || 44;
        var dy = p.kind === 'shore' || p.kind === 'sea' ? -s * 0.6 : 0;
        o.x = p.x; o.y = p.y + dy;
        var pad = s * 0.12;
        o.box = { x: o.x - s / 2 - pad, y: o.y - s / 2 - pad, w: s + 2 * pad, h: s + 2 * pad };
      }
    }
    return o;
  }
  function boxFree(box, L, cfg) {
    var m = cfg.perchMargin;
    if (!inside(box, inflate(L.safe, -6))) return false;
    var obs = [L.bubble, L.hud, L.tukRect];
    if (L.hudKeep) obs.push(L.hudKeep);
    if (L.grid) obs.push(L.grid.rect);
    for (var i = 0; i < obs.length; i++) if (overlapArea(box, inflate(obs[i], m)) > 0) return false;
    return true;
  }

  // ------------------------------------------------------------------ World
  function World(opts) {
    opts = opts || {};
    this.cfg = merge(CONFIG, opts.config);
    this.seed = opts.seed !== undefined ? opts.seed : 1;
    this.rng = new IM.RNG(this.seed);
    this.age = IM.Content.ageOf(opts.age !== undefined ? opts.age : 4);
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
    this.aurora = 0; this._auroraT = -1;
    this.finger = { x: 0, y: 0, down: false };
    this._rubbed = null; this._rubLast = null;
    this.tuk = { mood: 'idle', moodT: 0, lookX: 0, lookY: 0, hop: 0, slide: 0, belly: false,
      _hopT: -1, _hopPx: 0, _hopN: 0, _slT: -1 };
    this.dee = this.tuk;   // alias (one release)
    this.events = []; this.sessions = 0; this.interactive = false; this.solved = false;
    this._mis = null; this._anims = []; this._idleN = 0; this._idleT = 0; this._idleGap = this.cfg.idleTime; this._doneT = -1;
    this._lastHintT = -1e9; this.levelStartTime = 0; this._talkAskT = 0; this._talkAsks = 0; this._hist = [];
    this._lookId = null; this._lookT = -1e9; this._rewardN = 0; this._holdT = -1; this._lastTapId = null;
    this.setViewport(opts.width || 1280, opts.height || 720, opts.ins || null);
    this.tuk.lookX = this.layout.board.x + this.layout.board.w / 2; this.tuk.lookY = this.layout.board.y + this.layout.board.h / 2;
  }
  World.logicalSize = logicalSize;
  World.computeLayout = function (W, H, ins, cfg) { return computeLayout(W, H, ins, merge(CONFIG, cfg)); };
  World.chooseGrid = function (L, n, age, cfg) { return chooseGrid(L, n, IM.Content.ageOf(age || 4), merge(CONFIG, cfg)); };
  World.placeAt = function (kind, p, cfg, n, home) { return placeAt(kind, p, merge(CONFIG, cfg), n, home); };
  World.floesLayout = function (g, age, cfg) { return floesLayout(g, IM.Content.ageOf(age || 4), merge(CONFIG, cfg)); };
  World.pondLayout = World.floesLayout;   // old name
  World.rectGap = rectGap; World.overlapArea = overlapArea;

  var P = World.prototype;
  Object.defineProperty(P, 'items', { get: function () { return this.cards; } });
  Object.defineProperty(P, 'miu', { get: function () { return this.tuk; } });
  P._emit = function (e) { this.events.push(e); };
  P.drainEvents = function () { var e = this.events; this.events = []; return e; };
  P.setAge = function (a) { this._pendingAge = IM.Content.ageOf(a); };
  P.setLang = function (l) { this._pendingLang = l === 'vi' ? 'vi' : 'en'; };
  P.cardById = function (id) { for (var i = 0; i < this.cards.length; i++) if (this.cards[i].id === id) return this.cards[i]; return null; };
  P.itemById = P.cardById; P.blockById = P.cardById;
  P.rewardById = function (id) { for (var i = 0; i < this.rewards.length; i++) if (this.rewards[i].id === id) return this.rewards[i]; return null; };
  P._setState = function (s) { this.state = s; this.stateTime = 0; };
  P._setPhase = function (p) { this.phase = p; this.phaseTime = 0; };
  P._mood = function (m) {
    var d = this.tuk; d.mood = m; d.moodT = this.cfg.moodTime[m] || 1;
    if (this.cfg.hopPx[m]) { d._hopT = 0; d._hopPx = this.cfg.hopPx[m]; d._hopN = m === 'cheer' ? 3 : 1; }
  };
  P.cancelDrag = function () { this.finger.down = false; this._rubbed = null; this._rubLast = null; };
  P.skipTalk = function () { if (this.state === 'talk') this._levelDone(); };
  P.prompt = function () { return this.cur ? { promptKey: this.cur.promptKey, params: this.cur.params } : null; };
  P._mismatchShow = function () { var b = this.cfg.mismatchShowByAge; return (b && b[this.age] !== undefined) ? b[this.age] : this.cfg.mismatchShow; };
  P.cardRect = function (c) { return { x: c.x - c.w / 2, y: c.y - c.h / 2, w: c.w, h: c.h }; };

  // ---------------------------------------------------------------- viewport
  P.setViewport = function (W, H, ins) {
    var keepGrid = this.layout && this.layout.grid;
    this.layout = computeLayout(W, H, ins, this.cfg);
    var hk = this.hudKeep;
    this.layout.hudKeep = hk && hk.w > 0 && hk.h > 0 ? { x: +hk.x, y: +hk.y, w: +hk.w, h: +hk.h } : null;
    if (this.cur && this.cards.length) this._relayoutRound();
    else if (keepGrid) this.layout.grid = null;
    if (this.rewards.length) this._reperchAll(true);
  };

  P._relayoutRound = function () {
    var L = this.layout, g = chooseGrid(L, this.cards.length, this.age, this.cfg), i;
    if (this.surprise === 'floes') g = floesLayout(g, this.age, this.cfg);
    L.grid = g; L.board = g.board;
    for (i = 0; i < this.cards.length; i++) {
      var c = this.cards[i], s = g.slots[c.slot];
      c.hx = s.x; c.hy = s.y; c.w = g.cw; c.h = g.ch;
      c._sw = null; c.lift = 0; c._bo = 0; c._bv = 0;
      if (c.state === 'gone') { c.x = c._px = s.x; c.y = c._py = s.y; }
      else if (c.state !== 'matched' && c.state !== 'deal') { c.x = c._px = s.x; c.y = c._py = s.y; c.vx = c.vy = 0; }
    }
    this._dealPaths();
    for (i = 0; i < this.cards.length; i++) if (this.cards[i].state === 'deal') this._dealPos(this.cards[i]);
    if (this.cur.topic === 'colors') this._tukColorRule(false);
    for (i = 0; i < this._anims.length; i++) this._relaunchGlide(this._anims[i]);
  };

  /** Colour rounds: swap red blocks away from Tuk (≥ tukColorGap from Tuk's box; Tuk's hat is red). */
  P._tukColorRule = function (atStart) {
    var L = this.layout, cfg = this.cfg, cards = this.cards, D = L.tukRect, self = this, col = cfg.tukColor;
    function near(c) { return rectGap(self.cardRect({ x: c.hx, y: c.hy, w: c.w, h: c.h }), D) < cfg.tukColorGap - 1e-6; }
    for (var guard = 0; guard < cards.length; guard++) {
      var bad = null, i;
      for (i = 0; i < cards.length; i++) if (cards[i].face.color === col && cards[i].state !== 'gone' && cards[i].state !== 'matched' && near(cards[i])) { bad = cards[i]; break; }
      if (!bad) return;
      var best = null, bd = -1;
      for (i = 0; i < cards.length; i++) {
        var o = cards[i]; if (o.face.color === col || o.state === 'matched' || o.state === 'gone') continue;
        var d = rectGap(this.cardRect({ x: o.hx, y: o.hy, w: o.w, h: o.h }), D);
        if (d >= cfg.tukColorGap && d > bd) { bd = d; best = o; }
      }
      if (!best) return;
      var s = bad.slot; bad.slot = best.slot; best.slot = s;
      var g = L.grid, A = g.slots[bad.slot], Bs = g.slots[best.slot];
      bad.hx = A.x; bad.hy = A.y; best.hx = Bs.x; best.hy = Bs.y;
      if (!atStart) {
        [bad, best].forEach(function (c) { if (c.state !== 'deal') { c.x = c._px = c.hx; c.y = c._py = c.hy; } });
      }
    }
    if (atStart) { this._dealPaths(); }
  };

  // ---------------------------------------------------------------- session flow
  P.newSession = function (opts) {
    this.age = this._pendingAge; this.lang = this._pendingLang;
    this.sessions++;
    var last = (opts && opts.lastTopics) || this.lastTopics || null;
    this.levels = IM.Content.topicsFor(this.age, this.rng, last);
    this._surpriseOff = this.rng.int(0, this.cfg.surpriseTypes.length - 1);
    this.stars = 0; this.collected = [];
    this._emit({ type: 'session', levels: this.levels.slice() });
    this.startLevel(0);
  };

  P.startLevel = function (i) {
    if (!this.levels.length) this.levels = IM.Content.topicsFor(this.age);
    this.level = clamp(i | 0, 0, this.levels.length - 1);
    this.topic = this.levels[this.level];
    this.weather = this.level;
    this.round = 0; this.levelStars = 0; this.levelStartTime = this.time; this._hist = []; this._hard = false; this._lastPairs = 0;
    this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.cards = []; this.rewards = []; this.open = []; this.cur = null; this.talk = null; this.talkAnswered = null;
    this.interactive = false; this.solved = false; this._mis = null; this._anims = []; this.layout.grid = null; this._rewardN = 0;
    this.surprise = null; this._rubbed = null; this._rubLast = null;
    this._setState('intro'); this.phase = null;
    this._emit({ type: 'level', level: this.level, topic: this.topic });
  };

  P._beginRound = function () {
    var cfg = this.cfg, L = this.layout, i;
    var rr = new IM.RNG((this.rng.next() * 4294967296) >>> 0);
    var want = IM.Content.pairsFor(this.topic, this.age, this.lang, this.round, cfg.pairsByAge), held = false;
    if (cfg.adaptHold && this._hard && this._lastPairs && want > this._lastPairs) { want = this._lastPairs; held = true; }
    var cur = IM.Content.makeRound(this.topic, { age: this.age, lang: this.lang, rng: rr, roundIndex: this.round, history: this._hist,
      pairs: want, peekByAge: cfg.peekByAge });
    this.pairsHeld = held;
    if (cfg.peekPerCard) cur.peek = cur.peek * (0.6 + 0.1 * cur.cards.length);
    var ST = cfg.surpriseTypes, sp = ST && ST.length && this.round === cfg.surpriseRound ? ST[(this.level + this._surpriseOff) % ST.length] : null;
    this.surprise = sp; cur.surprise = sp; cur.golden = sp === 'aurora' ? rr.pick(Object.keys(cur.pairInfo).sort()) : null;
    this._shuffled = false; this._sameN = 0; this._auroraT = -1;
    this.cur = cur; this._hist.push(cur.sum);
    this.mismatches = 0; this.streak = 0; this.found = 0; this.pairs = cur.pairs; this.open = []; this._mis = null; this._anims = [];
    this._idleN = 0; this._idleT = 0; this._idleGap = cfg.idleTime; this._doneT = -1; this._holdT = -1;
    this.interactive = false; this.solved = false; this._rubbed = null; this._rubLast = null;
    var g = chooseGrid(L, cur.cards.length, this.age, cfg);
    if (sp === 'floes') g = floesLayout(g, this.age, cfg);
    L.grid = g; L.board = g.board;
    this.cards = cur.cards.map(function (s, k) {
      return { id: s.id, key: s.key, face: s.face, nameKind: s.nameKind, nameValue: s.nameValue, size: s.size || null, word: s.word || null,
        slot: k, state: 'deal', t: 0, x: 0, y: 0, _px: 0, _py: 0, rot: 0, _prot: 0, w: g.cw, h: g.ch,
        hx: g.slots[k].x, hy: g.slots[k].y, vx: 0, vy: 0,
        flip: 0, _pflip: 0, _fv: 0, flipT: 0, frost: 1, crack: 0, _crackT: -1, melt: 0, hole: false, holeT: 0, holeA: 0,
        lift: 0, sx: 1, sy: 1, _q: 0, _qv: 0, glow: 0, glowT: 0, glint: 0, bob: 0, peekT: -1, waveT: -1, alpha: 1, shakeT: -1,
        _ph: rr.float(0, TAU), _scale: 1, _bo: 0, _bv: 0, _dx0: 0, _dy0: 0, _ddx: 0, _ddy: 0, _dD: 0, _dv0: 0, _dT: 0, _dealt: false };
    });
    if (cur.topic === 'colors') this._tukColorRule(true);
    this._dealPaths();
    for (i = 0; i < this.cards.length; i++) { this._dealPos(this.cards[i]); this.cards[i]._px = this.cards[i].x; this.cards[i]._py = this.cards[i].y; }
    this._setState('round'); this._setPhase('deal');
    this._emit({ type: 'round', round: this.round, topic: this.topic, promptKey: cur.promptKey, params: cur.params, pairs: cur.pairs, held: held, surprise: sp });
    this._reperchAll(false);
  };

  /** Slide-in deal: every block travels the SAME distance D (landscape: from the left, portrait: from the bottom) with
   * constant friction μ → v0 = sqrt(2μD), T = sqrt(2D/μ); the far side starts first (stagger) so they never overlap. */
  P._dealPaths = function () {
    var cfg = this.cfg, L = this.layout, cards = this.cards, i, D = 0, order;
    var deal = cards.filter(function (c) { return c.state === 'deal'; });
    if (!deal.length) return;
    var g = L.grid;
    if (!L.portrait) {
      var mx = -1e9; for (i = 0; i < cards.length; i++) mx = Math.max(mx, cards[i].hx);
      D = mx - L.ins.left + g.cw / 2 + 20;
      order = cards.slice().sort(function (a, b) { return (b.hx - a.hx) || (a.hy - b.hy) || (a.slot - b.slot); });
    } else {
      var my = 1e9; for (i = 0; i < cards.length; i++) my = Math.min(my, cards[i].hy);
      D = L.H + g.ch / 2 + 20 - my;
      order = cards.slice().sort(function (a, b) { return (a.hy - b.hy) || (a.hx - b.hx) || (a.slot - b.slot); });
    }
    var v0 = Math.sqrt(2 * cfg.dealFriction * D), T = v0 / cfg.dealFriction;
    for (i = 0; i < order.length; i++) {
      var c = order[i];
      c._ddx = L.portrait ? 0 : 1; c._ddy = L.portrait ? -1 : 0;
      c._dx0 = c.hx - c._ddx * D; c._dy0 = c.hy - c._ddy * D; c._dD = D; c._dv0 = v0; c._dT = T;
      if (c.state === 'deal' && !c._dealt) c.t = -i * cfg.dealStagger;
    }
  };
  P._dealPos = function (c) {
    var tt = clamp(c.t, 0, c._dT), mu = this.cfg.dealFriction;
    var s = Math.min(c._dD, c._dv0 * tt - 0.5 * mu * tt * tt), v = Math.max(0, c._dv0 - mu * tt);
    c.x = c._dx0 + c._ddx * s; c.y = c._dy0 + c._ddy * s;
    c.vx = c._ddx * v; c.vy = c._ddy * v;
  };

  P._startPlay = function () {
    this._setPhase('play'); this.interactive = true; this._idleT = 0; this._playStart = this.time;
    this._emit({ type: 'play' });
  };

  /** Slide surprise: 1 swap (2 from age slideFrom) of frosted blocks with different keys; each glides along a curve to the
   * other's slot (opposite sides, so they pass each other), decelerating like ice (u = 1 − (1 − t/T)²). */
  P._startSlide = function () {
    var cfg = this.cfg, L = this.layout, rr = this.rng, self = this, cards = this.cards.slice(), swaps = [];
    this._shuffled = true;
    var nSw = this.age >= cfg.slideFrom ? 2 : 1, used = {};
    function okAt(c, slot) {
      if (c.face.color !== cfg.tukColor) return true;
      var q = L.grid.slots[slot];
      return rectGap({ x: q.x - c.w / 2, y: q.y - c.h / 2, w: c.w, h: c.h }, L.tukRect) >= cfg.tukColorGap - 1e-6;
    }
    for (var t = 0; t < nSw; t++) {
      var opts = [];
      for (var i = 0; i < cards.length; i++) for (var j = i + 1; j < cards.length; j++) {
        var a = cards[i], b = cards[j];
        if (used[a.id] || used[b.id] || a.key === b.key || a.state !== 'down' || b.state !== 'down') continue;
        if (!okAt(a, b.slot) || !okAt(b, a.slot)) continue;
        opts.push([a, b]);
      }
      if (!opts.length) break;
      var pr = opts[Math.floor(rr.next() * opts.length)];
      used[pr[0].id] = used[pr[1].id] = 1; swaps.push(pr);
    }
    this._setPhase('slide');
    swaps.forEach(function (pr) {
      var a = pr[0], b = pr[1], sa = a.slot;
      a.slot = b.slot; b.slot = sa;
      [a, b].forEach(function (c, side) {
        var q = L.grid.slots[c.slot], x0 = c.hx, y0 = c.hy, dx = q.x - x0, dy = q.y - y0, d = hyp(dx, dy) || 1;
        var bulge = Math.max(cfg.slideArc * d + 30, 1.05 * Math.max(c.w, c.h)) * (side ? -1 : 1);
        c._sw = { x0: x0, y0: y0, x1: q.x, y1: q.y, cx: (x0 + q.x) / 2 - dy / d * bulge, cy: (y0 + q.y) / 2 + dx / d * bulge, t: 0, side: side };
        c.hx = q.x; c.hy = q.y;
      });
      self._emit({ type: 'slide', a: a.id, b: b.id });
    });
  };

  P._endRound = function () {
    var m = this.mismatches, N = this.pairs, st = m <= Math.max(1, N - 1) ? 3 : m <= 2 * N ? 2 : 1;
    this.roundStars = st; this.stars += st; this.levelStars += st;
    this._hard = st === 1 || this.time - this._playStart > this.cfg.adaptSlowPlay; this._lastPairs = N;
    this.interactive = false;
    this._setState('roundDone'); this.phase = 'done';
    this._mood('cheer');
    this.tuk._slT = 0;   // belly slide
    this._emit({ type: 'roundDone', round: this.round, stars: st, mismatches: m });
  };

  P._startTalk = function () {
    var rr = new IM.RNG((this.rng.next() * 4294967296) >>> 0);
    this.talk = IM.Content.makeTalk(this.topic, { age: this.age, lang: this.lang, rng: rr });
    this.talk.glowAnswer = false;
    this.talkAnswered = null; this._talkAskT = 0; this._talkAsks = 0;
    this.cards = []; this.open = []; this.cur = null; this.layout.grid = null; this.phase = null; this.surprise = null;
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
  /** The block under (x, y): rect grown by hitPad; inside several → nearest centre; unmatched blocks win over a gliding
   * matched pair. 'gone' / dealing blocks never hit. matchedOk = false → matched blocks are ignored (rub). */
  P._hit = function (x, y, matchedOk) {
    var best = null, bd = 1e9, bestM = null, bdm = 1e9, pad = this.cfg.hitPad;
    for (var i = 0; i < this.cards.length; i++) {
      var c = this.cards[i];
      if (c.state === 'gone' || c.state === 'deal') continue;
      var hw = c.w * Math.max(c.sx, 0.5) / 2 + pad, hh = c.h * Math.max(c.sy, 0.5) / 2 + pad;
      if (Math.abs(x - c.x) > hw || Math.abs(y - c.y) > hh) continue;
      var d = hyp(x - c.x, y - c.y);
      if (c.state === 'matched') { if (d < bdm - 1e-9) { bdm = d; bestM = c; } }
      else if (d < bd - 1e-9) { bd = d; best = c; }
    }
    return best || (matchedOk === false ? null : bestM);
  };

  P.pointerDown = function (x, y) {
    this.finger.x = x; this.finger.y = y; this.finger.down = true;
    this._rubbed = {}; this._rubLast = null;
    if (this.state !== 'round' || this.solved) return null;
    var ph = this.phase;
    if (ph !== 'play' && ph !== 'resolve') return null;
    var c = this._hit(x, y), cfg = this.cfg;
    var same = !!c && c.state === 'up' && this.open.length === 1 && this.open[0] === c.id && !this._mis;
    if (!same) { this._idleT = 0; this._idleGap = cfg.idleTime; }
    if (!c) return null;
    this._rubLast = c.id; this._rubbed[c.id] = 1;
    this._lookId = c.id; this._lookT = this.time; this._lastTapId = c.id;
    if (same) { if (++this._sameN >= cfg.sameTapHint) { this._sameN = 0; this._autoHint(); } }
    else this._sameN = 0;
    if (c.state === 'matched' || c.state === 'up') { this._emitTap(c); return c.id; }
    if (ph === 'resolve' && !this._mis) return null;          // a pair was just found (≤ matchResolveTime): reveals wait
    if (this.open.length < 2) { this._flipUp(c, 'tap'); return c.id; }
    var a = this.cardById(this.open[0]), b = this.cardById(this.open[1]);
    if (a.key === b.key || !cfg.fastReset) return null;
    if (!this._mis || this._mis.t < cfg.thirdTapAfter) return null;
    this._flipDown(a); this._flipDown(b);
    this.open = []; this._mis = null; this._setPhase('play');
    this._flipUp(c, 'tap');
    return c.id;
  };
  /** While the finger is down, ENTERING a frosted block reveals it (a rub), until 2 unmatched blocks are up. A rub never
   * reveals a block twice and does nothing over an up / matched block. Returns the revealed id or null. */
  P.pointerMove = function (x, y) {
    this.finger.x = x; this.finger.y = y;
    if (!this.finger.down || !this._rubbed) return null;
    if (this.state !== 'round' || this.solved || this.phase !== 'play' || this._mis) return null;
    var c = this._hit(x, y, false), id = c ? c.id : null;
    if (id === this._rubLast) return null;
    this._rubLast = id;
    if (!c || c.state !== 'down' || this._rubbed[id] || this.open.length >= 2) return null;
    this._rubbed[id] = 1;
    this._idleT = 0; this._idleGap = this.cfg.idleTime; this._sameN = 0;
    this._lookId = c.id; this._lookT = this.time; this._lastTapId = c.id;
    this._flipUp(c, 'rub');
    return c.id;
  };
  P.pointerUp = function (x, y) {
    if (x !== undefined) { this.finger.x = x; this.finger.y = y; }
    this.finger.down = false; this._rubbed = null; this._rubLast = null;
  };

  P._emitTap = function (c) { this._emit({ type: 'tap', id: c.id, nameKind: c.nameKind, nameValue: c.nameValue, face: c.face, size: c.size }); };
  P._flipUp = function (c, via) {
    c.state = 'up'; c.peekT = -1; c.crack = 0; c._crackT = 0; c.flipT = 0;
    this.open.push(c.id);
    this._emit({ type: 'flip', id: c.id, nameKind: c.nameKind, nameValue: c.nameValue, face: c.face, size: c.size, open: this.open.length,
      via: via || 'tap', x: c.x, y: c.y });
  };
  P._flipDown = function (c) { c.state = 'down'; c.flipT = 0; c.shakeT = -1; c.crack = 0; c._crackT = -1; };

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
    var info = this.cur.pairInfo[a.key];
    a.state = b.state = 'matched'; a.flipT = b.flipT = 1;
    this.open = []; this.found++; this.streak = 0;
    var last = this.found >= this.pairs;
    var M = { a: a.id, b: b.id, t: 0, mx: (a.hx + b.hx) / 2, my: (a.hy + b.hy) / 2, info: info, last: last,
      stage: 'hold', clinkT: -1, meltT: -1 };
    this._anims.push(M);
    a.glowT = b.glowT = 0; a.peekT = b.peekT = -1; a.shakeT = b.shakeT = -1;
    this._setPhase('resolve');
    this._mood(last ? 'cheer' : 'happy');
    var ev = { type: 'match', a: a.id, b: b.id, key: a.key, nameKind: info.nameKind, nameValue: info.nameValue, found: this.found, pairs: this.pairs };
    ['parity', 'animal', 'home', 'word', 'text', 'lower'].forEach(function (k) { if (info[k] !== undefined) ev[k] = info[k]; });
    if (this.cur.golden && a.key === this.cur.golden) {
      ev.golden = true; ev.aurora = true; M.golden = true;
      this._mood('cheer'); this._auroraT = 0;
      this._emit(this._names(ev, a, b));
      this._emit({ type: 'golden', a: a.id, b: b.id, key: a.key, x: M.mx, y: M.my, aurora: true });
    } else this._emit(this._names(ev, a, b));
    if (last) { this.solved = true; this.interactive = false; }
  };

  /** Glide geometry for a matched pair: each block heads to the other along the centre line u and stops touching at the
   * midpoint. Contact separation along u for two w × h rects: sc = min(w/|ux|, h/|uy|). v0 = k·s + contactV. */
  P._launchGlide = function (M) {
    var cfg = this.cfg, a = this.cardById(M.a), b = this.cardById(M.b);
    var dx = b.x - a.x, dy = b.y - a.y, d = hyp(dx, dy) || 1, ux = dx / d, uy = dy / d;
    var sc = Math.min(Math.abs(ux) > 1e-9 ? a.w / Math.abs(ux) : 1e9, Math.abs(uy) > 1e-9 ? a.h / Math.abs(uy) : 1e9);
    M.mx = (a.x + b.x) / 2; M.my = (a.y + b.y) / 2; M.ux = ux; M.uy = uy; M.sc = sc;
    var s = Math.max(0, (d - sc) / 2), v0 = cfg.glideFriction * s + cfg.glideContactV;
    a.vx = ux * v0; a.vy = uy * v0; b.vx = -ux * v0; b.vy = -uy * v0;
    M.stage = 'glide'; M.gT = 0; M.v0 = v0; M.s = s;
    if (s <= 1e-6) this._clink(M, a, b);
  };
  /** After a resize: put the pair back in its (new) slots and glide again, or keep it touching at the new midpoint. */
  P._relaunchGlide = function (M) {
    var a = this.cardById(M.a), b = this.cardById(M.b);
    if (!a || !b) return;
    if (M.stage === 'hold' || M.stage === 'glide') {
      a.x = a._px = a.hx; a.y = a._py = a.hy; b.x = b._px = b.hx; b.y = b._py = b.hy; a.vx = a.vy = b.vx = b.vy = 0;
      if (M.stage === 'glide') this._launchGlide(M); else { M.mx = (a.hx + b.hx) / 2; M.my = (a.hy + b.hy) / 2; }
    } else {
      M.mx = (a.hx + b.hx) / 2; M.my = (a.hy + b.hy) / 2;
      var dx = b.hx - a.hx, dy = b.hy - a.hy, d = hyp(dx, dy) || 1;
      M.ux = dx / d; M.uy = dy / d;
      M.sc = Math.min(d, Math.abs(M.ux) > 1e-9 ? a.w / Math.abs(M.ux) : 1e9, Math.abs(M.uy) > 1e-9 ? a.h / Math.abs(M.uy) : 1e9);
      var hs = M.sc / 2;
      a.x = a._px = M.mx - M.ux * hs; a.y = a._py = M.my - M.uy * hs; b.x = b._px = M.mx + M.ux * hs; b.y = b._py = M.my + M.uy * hs;
      a.vx = a.vy = b.vx = b.vy = 0;
    }
  };
  P._clink = function (M, a, b) {
    var cfg = this.cfg, hs = M.sc / 2;
    a.x = M.mx - M.ux * hs; a.y = M.my - M.uy * hs; b.x = M.mx + M.ux * hs; b.y = M.my + M.uy * hs;
    var va = a.vx * M.ux + a.vy * M.uy, e = cfg.clinkRest;
    a.vx = -e * va * M.ux; a.vy = -e * va * M.uy; b.vx = -a.vx; b.vy = -a.vy;
    a._q = b._q = 0.06; a._qv = b._qv = 0;
    M.stage = 'clink'; M.clinkT = M.t; M.vContact = va;
    this._emit({ type: 'clink', a: a.id, b: b.id, x: M.mx, y: M.my, v: va });
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
  P.hint = function () {
    if (this.state !== 'round' || this.solved || (this.phase !== 'play' && this.phase !== 'resolve')) return null;
    var pr = this._hintPair();
    if (!pr) return null;
    if (pr[0].glowT > 0) return pr[0].id;
    return this._doHint(false);
  };

  // ---------------------------------------------------------------- rewards
  var FISHES_COLORS = ['orange', 'blue', 'yellow', 'pink', 'green', 'purple', 'red'];
  P._spawnReward = function (M, hole) {
    var cfg = this.cfg, info = M.info.reward, rr = this.rng;
    if (this.rewards.length >= cfg.maxRewards) {   // drop the oldest resting one (never a fish in the air)
      for (var q = 0; q < this.rewards.length; q++) if (!isFishKind(this.rewards[q].kind)) { this.rewards.splice(q, 1); break; }
    }
    var k = this._rewardN++, kind = info.kind;
    var r = { id: 'r' + k, kind: kind, color: info.color || null, shape: info.shape || null, sprite: info.sprite || null,
      n: kind === 'fish' ? 1 : (info.n || null), text: info.text || null, home: info.home || null, key: M.info.key || null,
      x: M.mx, y: M.my, _px: M.mx, _py: M.my, rot: 0, _prot: 0, sx: 0.35, sy: 0.35, alpha: 1, face: 1, glow: 0,
      size: cfg.sizes[kind === 'fishes' ? 'fish' : kind] || 44, pieceSize: cfg.sizes.piece,
      anchor: kind === 'animal' || kind === 'sculpture' ? 'bottom' : 'center', ax: null, ay: null,
      state: 'emerge', t: 0, perch: null, target: null, badge: null, pieces: null, hole: hole ? hole.id : null,
      _ph: rr.float(0, TAU), _q: 0, _qv: 0, _nextIdle: rr.float(2, 5), _th: 0, _tw: 0 };
    if (r.anchor === 'bottom') r.y = r._py = M.my + r.size / 2;
    if (M.golden) r.golden = true;
    this.rewards.push(r);
    this.collected.push({ kind: r.kind, color: r.color, shape: r.shape, sprite: r.sprite, n: r.n, text: r.text, home: r.home });
    if (isFishKind(kind)) this._makeFish(r);
    else this._perch(r, false);
    this._emit({ type: 'reward', id: r.id, kind: r.kind, x: M.mx, y: M.my, color: r.color, shape: r.shape, sprite: r.sprite, n: r.n,
      text: r.text, home: r.home, golden: !!M.golden });
    return r;
  };

  /** Fish pieces: each waits k·fishStagger s, then leaps on a parabola (g = fishG) to a spot on layout.sea. */
  P._makeFish = function (r) {
    var cfg = this.cfg, n = Math.max(1, Math.min(12, r.n || 1)), rr = this.rng, S = this.layout.sea;
    r.pieces = []; r.target = { x: S.x, y: S.y, box: null }; r.perch = { kind: 'sea', x: S.x, y: S.y };
    for (var k = 0; k < n; k++) {
      var tx = S.x + (n > 1 ? (k / (n - 1) - 0.5) : rr.float(-0.3, 0.3)) * S.w * 0.8;
      r.pieces.push({ k: k + 1, x: r.x, y: r.y, _px: r.x, _py: r.y, rot: -Math.PI / 2, _prot: -Math.PI / 2, face: 1, wag: 0,
        color: r.kind === 'fish' ? r.color : FISHES_COLORS[k % FISHES_COLORS.length], state: 'wait',
        delay: cfg.emergeTime + k * cfg.fishStagger, tx: tx, ty: S.y, apex: rr.float(cfg.fishApex[0], cfg.fishApex[1]), traj: null });
    }
  };
  P._fishTraj = function (pc) {
    var cfg = this.cfg, g = cfg.fishG, top = this.layout.ins.top + 40;
    var yTop = Math.max(top, Math.min(pc.y, pc.ty) - pc.apex);
    if (yTop > Math.min(pc.y, pc.ty) - 20) yTop = Math.min(pc.y, pc.ty) - 20;
    var vy = -Math.sqrt(2 * g * (pc.y - yTop)), t1 = -vy / g, t2 = Math.sqrt(2 * Math.max(0, pc.ty - yTop) / g), T = t1 + t2;
    return { x0: pc.x, y0: pc.y, vx: (pc.tx - pc.x) / T, vy: vy, T: T, g: g, t: 0 };
  };

  /** Picks a free perch for r (tiers by kind preference; least overlap with other rewards) and starts its motion. */
  P._perch = function (r, snap) {
    var L = this.layout, cfg = this.cfg, pref = prefFor(r), boxes = [], i, j;
    for (i = 0; i < this.rewards.length; i++) { var o = this.rewards[i]; if (o !== r && o.target && o.target.box) boxes.push(o.target.box); }
    var best = null, bestScore = 1e18, free = [];
    for (j = 0; j < pref.length; j++) {
      free = [];
      for (i = 0; i < L.perchCands.length; i++) {
        var p = L.perchCands[i];
        if (p.kind !== pref[j]) continue;
        var pl = placeAt(r.kind, p, cfg, r.n, r.home);
        if (!boxFree(pl.box, L, cfg)) continue;
        var ov = 0;
        for (var b = 0; b < boxes.length; b++) ov += overlapArea(pl.box, boxes[b]);
        pl.kind = p.kind;
        if (ov === 0) {
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
      var pool = free.filter(function (q) { return q._gap >= cfg.perchMinGap; });
      if (!pool.length) pool = free;
      var tot = 0, wsum = pool.map(function (q) { tot += Math.min(160, q._gap) + 1; return tot; });
      var u = this.rng.next() * tot, k = 0;
      while (k < pool.length - 1 && wsum[k] < u) k++;
      pick = pool[k];
    }
    if (!pick) { pick = placeAt(r.kind, { x: L.W / 2, y: L.groundY + [].concat(cfg.groundPerchDy)[0], kind: 'shore' }, cfg, r.n, r.home); pick.kind = 'shore'; }
    r.target = pick; r.perch = { kind: pick.kind, x: pick.x, y: pick.y };
    if (r.home) { var bd = pick.badge; r.badge = { x: bd.x, y: bd.y, size: bd.size, alpha: snap || r.badge ? 1 : 0 }; }
    if (snap) this._snapReward(r); else if (r.state !== 'emerge') this._fly(r);
  };

  P._reperchAll = function (snap) {
    var L = this.layout, cfg = this.cfg, list = this.rewards.slice(), i;
    if (snap) {
      for (i = 0; i < list.length; i++) if (isFishKind(list[i].kind)) this._finishFish(list[i]);
      list = this.rewards.slice();
      for (i = 0; i < list.length; i++) list[i].target = null;
      for (i = 0; i < list.length; i++) this._perch(list[i], true);
      return;
    }
    for (i = 0; i < list.length; i++) {
      var r = list[i];
      if (isFishKind(r.kind)) continue;
      if (r.target && !boxFree(r.target.box, L, cfg)) { r.target = null; this._perch(r, false); }
    }
  };
  /** A resize while fish fly: they all dive at once (removed; the 'land' event still comes). */
  P._finishFish = function (r) {
    var i = this.rewards.indexOf(r);
    if (i >= 0) this.rewards.splice(i, 1);
    this._clearHole(r);
    this._emit({ type: 'land', id: r.id, kind: r.kind, x: this.layout.sea.x, y: this.layout.sea.y });
  };
  P._clearHole = function (r) { if (r.hole) { var c = this.cardById(r.hole); if (c) c._holeFree = true; } };

  P._snapReward = function (r) {
    var T = r.target;
    r.x = r._px = T.x; r.y = r._py = T.y; r.ax = T.ax; r.ay = T.ay; r.rot = r._prot = 0; r.state = 'idle'; r.t = 0;
    r.sx = r.sy = 1; r._sl = null; r._hops = null; r._bz = null;
    if (r.badge) r.badge.alpha = 1;
    this._clearHole(r);
  };

  /** Starts the move from the reward's current position to r.target (after it emerged from the hole). */
  P._fly = function (r) {
    var cfg = this.cfg, T = r.target, x0 = r.x, y0 = r.y, d = hyp(T.x - x0, T.y - y0);
    r.state = 'fly'; r.t = 0;
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
    } else if (r.kind === 'sculpture') {   // slides on the ice: constant friction, stops exactly on the spot
      var mu = cfg.sculptFriction, v0 = Math.sqrt(2 * mu * d);
      r._sl = { x0: x0, y0: y0, ux: d > 1e-9 ? (T.x - x0) / d : 0, uy: d > 1e-9 ? (T.y - y0) / d : 0, d: d, v0: v0, T: v0 / mu, mu: mu };
    } else {
      var arc = Math.min(cfg.flyArcMax, cfg.flyArc * d);
      r._bz = { x0: x0, y0: y0, cx: (x0 + T.x) / 2, cy: Math.min(y0, T.y) - arc, x1: T.x, y1: T.y,
        T: clamp(0.7 + d / cfg.flySpeed, cfg.flyTime[0], cfg.flyTime[1]) };
    }
  };

  P._hop = function (a, b, apex, g) {
    var top = this.layout.ins.top + 30;
    var H = Math.max(apex, a.y - b.y + apex);
    if (a.y - H < top) H = Math.max(Math.max(0, a.y - b.y) + 4, a.y - top);
    var vy = -Math.sqrt(2 * g * H), dy = b.y - a.y;
    var T = (-vy + Math.sqrt(Math.max(0, vy * vy + 2 * g * dy))) / g;
    T = Math.max(T, 0.12);
    return { x0: a.x, y0: a.y, vx: (b.x - a.x) / T, vy: vy, T: T, g: g, x1: b.x, y1: b.y };
  };

  P._landed = function (r) {
    this._emit({ type: 'land', id: r.id, kind: r.kind, x: r.x, y: r.y });
    if (r.home) this._emit({ type: 'homeArrive', id: r.id, home: r.home, sprite: r.sprite, x: r.x, y: r.y });
    this._clearHole(r);
  };

  P._stepReward = function (r, h) {
    var cfg = this.cfg, T = r.target, i, u;
    r.t += h;
    if (this.state === 'levelDone') r.alpha = 1 - clamp(this.stateTime / cfg.rewardFadeTime, 0, 1);
    if (r.badge && r.badge.alpha < 1) r.badge.alpha = Math.min(1, r.badge.alpha + h / cfg.badgeFade);
    if (isFishKind(r.kind)) return this._stepFish(r, h);
    if (r.state === 'emerge') {   // pops up out of the hole
      u = clamp(r.t / cfg.emergeTime, 0, 1);
      r.sx = r.sy = 0.35 + 0.65 * smooth(u);
      if (u >= 1) { r.sx = r.sy = 1; this._fly(r); }
      return;
    }
    switch (r.kind) {
      case 'star': {
        if (r.state === 'fly') {
          var B = r._bz; u = clamp(r.t / B.T, 0, 1);
          var s = smooth(u), q = 1 - s;
          r.x = q * q * B.x0 + 2 * q * s * B.cx + s * s * B.x1; r.y = q * q * B.y0 + 2 * q * s * B.cy + s * s * B.y1;
          r.rot += 4 * h; r.glow = 1;
          if (u >= 1) { r.x = T.x; r.y = T.y; r.state = 'settle'; r.t = 0; this._landed(r); }
        } else {
          if (r.state === 'settle' && r.t >= cfg.settleTime) { r.state = 'idle'; r.t = 0; }
          r.sx = r.sy = 1 + cfg.starTwinkle * Math.sin(TAU * cfg.starHz * this.time + r._ph);
          r.rot = 0.15 * Math.sin(0.8 * this.time + r._ph);
          r.x = T.x; r.y = T.y + cfg.bobPx * Math.sin(1.3 * this.time + r._ph);
          r.glow = 0.65 + 0.35 * Math.sin(TAU * 0.7 * this.time + r._ph);
        }
        break;
      }
      case 'sculpture': {
        if (r.state === 'fly') {
          var S = r._sl, tt = Math.min(r.t, S.T), sd = Math.min(S.d, S.v0 * tt - 0.5 * S.mu * tt * tt);
          r.x = S.x0 + S.ux * sd; r.y = S.y0 + S.uy * sd;
          r.rot = 0.05 * Math.sin(TAU * 1.5 * tt) * (1 - tt / Math.max(S.T, 1e-6));
          if (r.t >= S.T) { r.x = T.x; r.y = T.y; r.rot = 0; r.state = 'settle'; r.t = 0; r._q = 0.08; r._qv = 0; this._landed(r); }
        } else {
          if (r.state === 'settle' && r.t >= cfg.settleTime) { r.state = 'idle'; r.t = 0; }
          r.x = T.x; r.y = T.y; r.rot = 0;
          r.glow = 0.5 + 0.2 * Math.sin(TAU * 0.4 * this.time + r._ph);
        }
        var ws = 18, zs = 0.3;
        r._qv += (-ws * ws * r._q - 2 * zs * ws * r._qv) * h; r._q += r._qv * h;
        r.sx = 1 + r._q; r.sy = 1 - r._q;
        break;
      }
      case 'animal': {
        if (r.state === 'fly') {
          var hp = r._hops[r._hopI];
          r._hopT += h;
          var ht = Math.min(r._hopT, hp.T);
          r.x = hp.x0 + hp.vx * ht; r.y = hp.y0 + hp.vy * ht + 0.5 * hp.g * ht * ht;
          r.rot = 0.12 * r.face * Math.sin(Math.PI * ht / hp.T);
          if (r._hopT >= hp.T) {
            r.x = hp.x1; r.y = hp.y1; r.rot = 0;
            var vy = hp.vy + hp.g * hp.T;
            r._q = cfg.hopSquash * clamp(vy / 700, 0.4, 1.2); r._qv = 0;
            r._hopI++; r._hopT = 0;
            if (r._hopI >= r._hops.length) { r.state = 'settle'; r.t = 0; this._landed(r); }
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
    }
  };

  P._stepFish = function (r, h) {
    var cfg = this.cfg, all = true, ps = r.pieces;
    if (r.state === 'emerge') { r.sx = r.sy = 0.35 + 0.65 * smooth(r.t / cfg.emergeTime); if (r.t >= cfg.emergeTime) { r.sx = r.sy = 1; r.state = 'fly'; } }
    for (var i = 0; i < ps.length; i++) {
      var pc = ps[i];
      if (pc.state === 'done') continue;
      all = false;
      pc.wag = 0.5 + 0.5 * Math.sin(TAU * cfg.fishWagHz * this.time + i);
      if (pc.state === 'wait') {
        pc.delay -= h;
        if (pc.delay <= 0) {
          pc.state = 'air'; pc.traj = this._fishTraj(pc);
          this._emit({ type: 'leap', id: r.id, k: pc.k, n: ps.length, x: pc.x, y: pc.y, color: pc.color });
        }
        continue;
      }
      var J = pc.traj; J.t += h;
      var t = Math.min(J.t, J.T);
      pc.x = J.x0 + J.vx * t; pc.y = J.y0 + J.vy * t + 0.5 * J.g * t * t;
      var vy = J.vy + J.g * t;
      pc.face = J.vx >= 0 ? 1 : -1;
      pc.rot = Math.atan2(vy, J.vx);
      if (J.t >= J.T) {
        pc.x = pc.tx; pc.y = pc.ty; pc.state = 'done';
        this._emit({ type: 'splash', id: r.id, k: pc.k, x: pc.x, y: pc.y });
      }
    }
    if (ps[0]) { r.x = ps[0].x; r.y = ps[0].y; r.rot = ps[0].rot; r.face = ps[0].face; }
    if (all) {
      r._done = true;
      this._emit({ type: 'land', id: r.id, kind: r.kind, x: this.layout.sea.x, y: this.layout.sea.y });
      this._clearHole(r);
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
    var cfg = this.cfg, i, j;
    for (i = 0; i < this.cards.length; i++) { var o = this.cards[i]; o._px = o.x; o._py = o.y; o._prot = o.rot; o._pflip = o.flip; }
    for (i = 0; i < this.rewards.length; i++) {
      var q = this.rewards[i]; q._px = q.x; q._py = q.y; q._prot = q.rot;
      if (q.pieces) for (j = 0; j < q.pieces.length; j++) { var pc = q.pieces[j]; pc._px = pc.x; pc._py = pc.y; pc._prot = pc.rot; }
    }
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
    for (i = this.rewards.length - 1; i >= 0; i--) if (this.rewards[i]._done) this.rewards.splice(i, 1);
    this._stepTuk(h);
    // aurora shimmer
    var at = this.surprise === 'aurora' && (this.state === 'round' || this.state === 'roundDone') ? 1 : 0;
    if (this._auroraT >= 0) { this._auroraT += h; if (this._auroraT < 1.5) at += cfg.auroraBoost; }
    this.aurora += clamp(at - this.aurora, -h / cfg.auroraRise, h / cfg.auroraRise);
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
        if (all && this.surprise === 'slide' && !this._shuffled) {
          for (i = 0; i < cards.length; i++) if (cards[i].flip > 0.03) { all = false; break; }   // frost fully back first
          if (all) this._startSlide();
          break;
        }
        if (all) this._startPlay();
        break;
      case 'slide': {
        all = true;
        for (i = 0; i < cards.length; i++) if (cards[i]._sw) { all = false; break; }
        if (all && this._holdT < 0) this._holdT = 0;
        if (this._holdT >= 0) { this._holdT += h; if (this._holdT >= cfg.slideSettle) { this._holdT = -1; this._startPlay(); } }
        break;
      }
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
          if (this._stepMatch(M, h)) {
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

  /** One matched pair: hold → glide (exact exponential friction) → clink → melt → hole + reward. true when finished. */
  P._stepMatch = function (M, h) {
    var cfg = this.cfg, a = this.cardById(M.a), b = this.cardById(M.b), k = cfg.glideFriction;
    if (M.stage === 'hold') { if (M.t >= cfg.matchHold) this._launchGlide(M); return false; }
    var e = Math.exp(-k * h), f = (1 - e) / k;
    [a, b].forEach(function (c) { c.x += c.vx * f; c.y += c.vy * f; c.vx *= e; c.vy *= e; });
    if (M.stage === 'glide') {
      M.gT += h;
      var sep = (b.x - a.x) * M.ux + (b.y - a.y) * M.uy;
      if (sep <= M.sc + 1e-9 || M.gT >= cfg.glideMaxTime) this._clink(M, a, b);
      return false;
    }
    var since = M.t - M.clinkT;
    if (since >= cfg.meltDelay) {
      if (M.stage === 'clink') {
        M.stage = 'melt';
        this._emit({ type: 'melt', id: a.id, x: a.x, y: a.y });
        this._emit({ type: 'melt', id: b.id, x: b.x, y: b.y });
      }
      var u = clamp((since - cfg.meltDelay) / cfg.meltTime, 0, 1);
      a.melt = b.melt = u;
      if (u >= 1) {
        a.state = b.state = 'gone'; a.alpha = b.alpha = 0; a.vx = a.vy = b.vx = b.vy = 0;
        a.hole = true; a.holeT = 0; a.holeA = 1; a._holeFree = false; a.x = a._px = M.mx; a.y = a._py = M.my; b.hole = false;
        M.info.key = a.key;
        this._spawnReward(M, a);
        return true;
      }
    }
    return false;
  };

  P._stepCard = function (c, h) {
    var cfg = this.cfg, w, z, u;
    c.t += h;
    if (c.glowT > 0) c.glowT = Math.max(0, c.glowT - h);
    c.glow = c.glowT > 0 ? clamp(Math.min(c.glowT / 0.4, (cfg.hintGlowTime - c.glowT) / 0.2), 0, 1) : 0;
    if (c.state === 'gone') {
      if (c.hole) {
        c.holeT = Math.min(1, c.holeT + h / cfg.holeTime);
        if (c._holeFree && c.holeT >= 1) { c.holeA = Math.max(0, c.holeA - h / 0.4); if (c.holeA <= 0) c.hole = false; }
      }
      return;
    }
    if (c.state === 'deal') {
      if (c.t < 0) { this._dealPos(c); return; }
      if (!c._dealt) { c._dealt = true; this._emit({ type: 'deal', id: c.id }); }
      this._dealPos(c);
      if (c.t >= c._dT) {
        c.state = 'down'; c.x = c.hx; c.y = c.hy; c.vx = c.vy = 0; c._bo = 0; c._bv = cfg.dealBumpV; c._q = cfg.dealSquash; c._qv = 0;
      }
      c.sx = c.sy = 1;
      return;
    }
    if (c._sw) {   // slide surprise: glide along a curve with ice deceleration (u = 1 − (1 − t/T)²), exactly into the slot
      var S = c._sw; S.t += h;
      var tu = Math.min(1, S.t / cfg.slideTime), su = 1 - (1 - tu) * (1 - tu), sq = 1 - su;
      c.x = sq * sq * S.x0 + 2 * sq * su * S.cx + su * su * S.x1;
      c.y = sq * sq * S.y0 + 2 * sq * su * S.cy + su * su * S.y1;
      c.lift = 0.35 * Math.sin(Math.PI * tu);
      c.rot = 0.06 * Math.sin(Math.PI * tu) * (S.side ? -1 : 1);
      if (S.t >= cfg.slideTime) { c._sw = null; c.x = c.hx; c.y = c.hy; c.rot = 0; c.lift = 0; c._q = cfg.dealSquash; c._qv = 0; }
      c.sx = 1 + c._q; c.sy = 1 - c._q;
      return;
    }
    // reveal: crack lines first, then the frost clears
    if (c._crackT >= 0 && c.state === 'up') {
      c._crackT += h; c.crack = clamp(c._crackT / cfg.crackTime, 0, 1);
      if (c.crack >= 1) { c._crackT = -1; c.flipT = 1; }
    }
    if (c.state === 'down') {
      var pk = 0;
      if (c.peekT >= 0) {
        c.peekT += h;
        if (c.peekT >= cfg.hintPeekDelay && c.peekT < cfg.hintPeekDelay + cfg.hintPeekHold) pk = cfg.hintPeekFlip;
        if (c.peekT >= cfg.hintPeekDelay + cfg.hintPeekHold) c.peekT = -1;
        c.flipT = pk;
      } else if (c.waveT < 0 && (this.phase === 'play' || this.phase === 'resolve' || this.phase === 'done')) c.flipT = 0;
    }
    // flip: critically damped spring (faster up, slower frost-back)
    w = c.flipT >= c.flip ? cfg.flipOmega : cfg.hideOmega;
    c._fv += (w * w * (c.flipT - c.flip) - 2 * w * c._fv) * h;
    c.flip += c._fv * h;
    if (c.flip < 0) { c.flip = 0; if (c._fv < 0) c._fv = 0; }
    if (c.flip > 1) { c.flip = 1; if (c._fv > 0) c._fv = 0; }
    c.frost = 1 - c.flip;
    if (c.state === 'matched') {
      c.rot = 0; c.lift = 0;
      c._scale = 1 - 0.85 * c.melt;
      c.alpha = 1 - c.melt;
    } else {
      // home position + arrival bump + floe bob / drift
      w = cfg.bumpOmega; z = cfg.bumpZeta;
      c._bv += (-w * w * c._bo - 2 * z * w * c._bv) * h; c._bo += c._bv * h;
      var fx = 0, fy = 0;
      var G = this.layout.grid;
      if (this.surprise === 'floes' && G && G.style === 'floes') {
        fy = G.bobAmp * Math.sin(c._ph + TAU * cfg.floeBobHz * this.time);
        fx = G.driftAmp * Math.sin(1.7 * c._ph + TAU * cfg.floeDriftHz * this.time);
      }
      c.bob = fy;
      c.x = c.hx + c._ddx * c._bo + fx; c.y = c.hy + c._ddy * c._bo + fy;
      c.vx = c._ddx * c._bv; c.vy = c._ddy * c._bv;
      c.lift = 0; c.rot = 0;
      if (c.shakeT >= 0) {   // wobble: damped sine rotation, 3 wiggles
        c.shakeT += h; u = c.shakeT / cfg.shakeTime;
        if (u >= 1) c.shakeT = -1;
        else c.rot = cfg.shakeAmp * Math.sin(TAU * cfg.shakeWiggles * u) * (1 - u) * (1 - u);
      }
    }
    // idle glint on frosted blocks (deterministic: from the block's phase, no rng)
    c.glint = 0;
    if (c.state === 'down' && c.flip < 0.02 && this.phase === 'play') {
      var per = cfg.glintEvery[0] + (cfg.glintEvery[1] - cfg.glintEvery[0]) * (c._ph / TAU);
      var gu = ((this.time + c._ph * 3) % per) / cfg.glintTime;
      if (gu < 1) c.glint = cfg.glintAmp * Math.sin(Math.PI * gu);
    }
    w = cfg.squashOmega; z = cfg.squashZeta;
    c._qv += (-w * w * c._q - 2 * z * w * c._qv) * h; c._q += c._qv * h;
    c.sx = c._scale * (1 + c._q); c.sy = c._scale * (1 - c._q);
  };

  P._stepTuk = function (h) {
    var d = this.tuk, cfg = this.cfg, L = this.layout;
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
    // belly slide: out with constant friction (v0 = sqrt(2μD)), hold, back the same way
    if (d._slT >= 0) {
      d._slT += h;
      var mu = cfg.tukSlideFriction, D = cfg.tukSlidePx, v0 = Math.sqrt(2 * mu * D), T = v0 / mu;
      var t = d._slT - cfg.tukSlideDelay;
      if (t < 0) { d.slide = 0; d.belly = false; }
      else if (t < T) { d.slide = v0 * t - 0.5 * mu * t * t; d.belly = true; }
      else if (t < T + cfg.tukSlideHold) { d.slide = D; d.belly = true; }
      else if (t < 2 * T + cfg.tukSlideHold) { var t2 = t - T - cfg.tukSlideHold; d.slide = D - (v0 * t2 - 0.5 * mu * t2 * t2); d.belly = true; }
      else { d.slide = 0; d.belly = false; d._slT = -1; }
    }
  };
  P._stepDee = P._stepTuk;

  IM.World = World;
})(window.IM = window.IM || {});
