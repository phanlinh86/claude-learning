/* Pip's Camp Hide & Seek — FC.CONFIG + FC.World (headless, deterministic hide-and-seek simulation; DESIGN §2, §5.2)
 *
 * ============================== CONVENTIONS ==============================
 *  Units: logical px (short side 720), seconds, radians, y DOWN, rot > 0 clockwise. Screen space = world space (no camera).
 *  update(dt) runs fixed sub-steps of cfg.step (1/120 s); at the START of every sub-step each place stores _pshake and each
 *  friend / the critter stores _px/_py/_prot. Render p = _p + (p − _p)·w.alpha.
 *
 *  PLACE (hiding place): (x, y) = bottom centre. Draw spots/<kind>.svg (viewBox 240×200, anchor (120, 196)) w px wide
 *    (k = w/240, so drawn height h = 200k) with art (120, 196) at (x, y), rotated `shake` about (x, y), scaled (sx, sy) about
 *    (x, y), globalAlpha / scale by `appear` (0..1, back-out pop). open 0..1 → crossfade to <kind>_open.svg. glow 0..1 =
 *    hint halo. peekY = screen y of the clip line. clueTop = screen y of the top of the highest clue (hit box / keep-outs).
 *  FRIEND: (x, y) = FEET (bottom centre of the 128×128 animal sprite), drawn `size` px square, scaled (sx, sy) and rotated
 *    rot about the feet; the head top is y − size·sy. wave → animal_<a>_wave sprite. The clue is drawn at the head top
 *    (FC.CampArt.drawClue origin = (x, y − size·sy), size = size). While state ∈ hidden|pop|boo|duck the friend is drawn
 *    BEHIND its place (f.place) and clipped to y < place.peekY. Otherwise it is drawn above every place (in y order).
 *  Hidden pose: feet = peekY + (1 − peekRiseFrac)·size·(1 − rise): rise 0 → the head top is peekRiseFrac·size above
 *    peekY; rise 1 → the feet are on the peek line (the whole friend shows).
 *  PIP: (x, y) = feet, height layout.pip.h (art 256×300, feet (128, 292)). Fire: layout.camp (flames at (x, y − 0.29·w)).
 * ========================================================================
 */
(function (FC) {
  'use strict';

  var CONFIG = {
    // ---- timing / state machine (s)
    step: 1 / 120,             // fixed simulation sub-step (≤ 1/120 per DESIGN)
    maxFrame: 1.0,             // largest dt accepted per update() (speed mode passes big dt)
    roundsPerLevel: 4,         // rounds per chapter
    chapterTimeLimit: 80,      // s since the chapter began: after ≥ chapterMinRounds rounds go to Talk time once exceeded
    chapterMinRounds: 3,
    introTime: 2.5,            // chapter banner + season line (the 2.5 s weather crossfade)
    talkAfterAnswer: 1.6,
    levelDoneTime: 1.8,
    talkAskTime: 12,           // s without an answer → talkAsk (re-ask), repeating
    talkGlowAfterAsks: 2,

    // ---- content (null → FC.Content tables: 3: 2,2,3,3 · 4: 2,3,4,4 · 5: 3,4,5,5 · 6–7: 4,5,6,6)
    placesByAge: null,

    // ---- round phases
    gatherMin: 1.0,            // gather lasts ≥ 1.0 s (friends hop in from the right, then wave)
    gatherStagger: 0.12,
    gatherWave: 0.25,          // s of waving after the last friend arrived
    countTime: 2.6,            // count phase: Pip covers his eyes …
    countAt: [0.3, 1.1, 1.9],  // … countNum 1, 2, 3
    runAt: 0.35, runStagger: 0.15,   // the friends start running to their places
    peekTime: 0.7,             // Pip's 'peek' mood after the count
    openTime: 0.18,            // a place opens 0 → 1 (closes in closeTime)
    closeTime: 0.2,
    popDelay: 0.06, popTime: 0.25, popBack: 1.7,   // the friend pops up (rise 0 → 1, back-out overshoot ≈ 1.1)
    duckTime: 0.22,            // rise 1 → 0
    booTime: 0.9,              // a wrong friend giggles + wiggles, then ducks
    wiggleAmp: 0.14, wiggleHz: 2.4,
    foundMin: 0.6,             // phase 'found' ≥ 0.6 s (until the friend has jumped clear of its place)
    partyTime: 2.2,            // party (dance) ≥ 2.2 s, and until every friend sits + 0.3 s
    partyAfterSeat: 0.3,
    leaveStagger: 0.08, leaveMax: 2.0,
    appearTime: 0.35, appearStagger: 0.07, appearBack: 1.9,

    // ---- surprise round: one per chapter, the type rotates per chapter from a random start per session
    surpriseRound: 2,
    surpriseTypes: ['swap', 'critter'],
    swapApex: [120, 60],       // the two crossing arcs (px above the higher end)
    critterDelay: [1.2, 2.2],  // s into ask #1 (the 2nd ask) → the squirrel pops up …
    critterIn: 0.3, critterUp: 2.4, critterOut: 0.3, critterTapTime: 0.5,
    critterFrac: 0.42,         // squirrel size × spotW
    critterR: 70,              // tap radius (px, or 0.7·size if bigger)

    // ---- layout (DESIGN §2; px)
    shortSide: 720, minLong: 960, maxLong: 1600,
    tallRatio: 1.6, tallScale: 1.15,
    bubbleX: 24, bubbleY: 20, bubbleMaxW: 640, bubbleRightGap: 440, bubbleH: 122,
    bubbleHPort: 124, bubbleGapPort: 24, hudW: 160, hudH: 96,
    groundLand: 28, groundPort: 40,
    pipX: 120, pipH: 230, pipHPort: 250, pipAspect: 0.66,   // Pip's hit box is 0.66·h wide
    campX: 150, campDy: 10, campW: 200,
    backLand: 0.58, backScaleLand: 0.86, frontLand: 150,
    backPort: 0.47, backScalePort: 0.88, midPort: 0.62, midScalePort: 0.94, frontPort: 300,
    fieldLeft: 250, fieldRight: 260,   // landscape front row: ins.left + 250 … W − ins.right − 260
    fieldEdge: 0.6,                    // other rows: ± 0.6·spotW from the safe edges
    spotW: { 3: 220, 4: 220, 5: 200, 6: 200, 7: 200 },
    spotArtW: 240, spotArtH: 200, spotAnchor: 196,
    peekY: { bush: 53, stump: 50, tent: 59, rock: 58, leaves: 62, log: 63, snowman: 63, drift: 62 },   // viewBox y of the clip line (= spots.json 2026-11-03; World.applySpots overrides)
    friendFrac: 0.75,          // friend size = 0.75·spotW·row.scale
    seatFrac: 0.55,            // seated friend size = 0.55·spotW
    peekRiseFrac: 0.42,        // a hidden friend's head top is 0.42·size above peekY
    clueFrac: { hat: 0.2, flag: 0.55, sign: 0.55, badge: 0.55, ears: 0.04, size: 0.04 },   // clue height above the head (× size)
    peekHalf: 0.5,             // half width of the peek box (head + clue) × friend size
    objHalf: 0.46,             // half width of the object box × w
    sameGap: 24,               // same row: centre distance ≥ w + 24
    rowGap: 8,                 // different rows: boxes ≥ 8 px apart
    vGap: 4,
    jitterX: 18,
    keepMargin: 8,             // clues keep 8 px from the bubble / HUD / hudKeep
    rowMinDY: 40, frontMinGround: 20,
    shrink: [1, 0.94, 0.88, 0.82, 0.76, 0.7, 0.64, 0.58],
    hitPad: 22, pipHitPad: 20,
    seats: [[-0.95, 0], [-1.6, 0.02], [-2.25, 0], [0.62, -0.12], [0.08, -0.4], [-0.48, -0.38]],   // × seat size from the fire
    gatherYLand: 18,

    // ---- motion (physics)
    hopG: 2600,                // px/s² gravity of every hop (ballistic arcs)
    hopContact: 0.07,          // s on the ground between two hops (squash)
    enterApex: [36, 50], enterHop: 440,   // gather: hop length ≤ 440 px
    runApex: [28, 42], runHop3: 420,      // count: 2 hops, 3 when farther than 420 px
    jumpApex: 90,              // a found friend jumps out of its place …
    jumpFwd: 0.34,             // … to 0.34·w in front of it, towards the fire
    seatApex: [40, 64], seatHop: 250,     // then 2–4 hops (≤ 250 px each) to its bench seat
    leaveApex: [36, 50], leaveHop: 380,
    danceApex: 16, dancePeriod: 0.46, danceStagger: 0.12,
    landSquash: 0.2, takeoffStretch: 0.1, squashOmega: 22, squashZeta: 0.32,
    lean: 0.16, rotOmega: 16, rotZeta: 0.7,
    shakeKick: 0.1, shakeOmega: 18, shakeZeta: 0.22,       // place shake: damped spring, first peak ≈ 0.1 rad
    placeSquash: 0.08,
    fireBase: 0.35, fireDecay: 0.9,

    // ---- help
    hintAfterMisses: 2,        // the 2nd miss on an ask always glows the right place
    hintCooldown: 6,
    wrongLock: 0.8, wrongLock2: 1.6,   // s: place taps ignored after a wrong peek (1.6 s from the 2nd miss) → event 'locked'
    hintGlowTime: 4, hintLift: 0.16, hintBob: 0.06, hintBobHz: 1.6,
    idleTime: 12, idleBackoff: 1.5, idleMax: 30, idleHintFrom: 2,
    tapMove: 24, tapTime: 0.35,          // a press on Pip is a TAP when it moves < 24 px and lasts < 0.35 s

    // ---- Pip
    moodTime: { happy: 0.9, cheer: 1.6, oops: 0.8, think: 1.4, peek: 0.7, talk: 1.0 }, lookRate: 6, blink: [2.2, 5], blinkTime: 0.13
  };
  FC.CONFIG = CONFIG;

  var TAU = Math.PI * 2;
  var SPLITS = {
    L: { 2: [[0, 2], [1, 1], [2, 0]], 3: [[0, 3], [1, 2], [2, 1], [3, 0]], 4: [[2, 2], [1, 3], [3, 1], [4, 0]],
      5: [[2, 3], [3, 2], [4, 1], [1, 4]], 6: [[3, 3], [4, 2], [2, 4], [5, 1]] },
    P: { 2: [[0, 0, 2], [1, 0, 1], [2, 0, 0]], 3: [[0, 0, 3], [1, 0, 2], [2, 0, 1], [3, 0, 0]], 4: [[2, 0, 2], [1, 0, 3], [3, 0, 1]],
      5: [[2, 1, 2], [1, 2, 2], [2, 2, 1], [2, 0, 3], [3, 0, 2], [1, 1, 3]], 6: [[2, 2, 2], [3, 1, 2], [2, 1, 3], [3, 0, 3], [1, 2, 3], [2, 2, 2]] }
  };
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hyp(x, y) { return Math.sqrt(x * x + y * y); }
  function smooth(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  function lerp(a, b, u) { return a + (b - a) * u; }
  function merge(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; if (b) for (k in b) o[k] = b[k]; return o; }
  /** back-out ease: 0 → overshoot → 1 */
  function backOut(u, c) { u = clamp(u, 0, 1) - 1; return 1 + (c + 1) * u * u * u + c * u * u; }
  /** Initial velocity that makes a damped spring (from rest at 0) peak at `peak`. */
  function kickFor(peak, w, z) { var s = Math.sqrt(1 - z * z); return peak * w * Math.exp(z / s * Math.atan2(s, z)); }
  /** world.hudKeep: one box or an array of boxes (screen px) → clean array of valid boxes. */
  function keepBoxes(hk) {
    var a = Array.isArray(hk) ? hk : hk ? [hk] : [], out = [];
    for (var i = 0; i < a.length; i++) { var b = a[i]; if (b && b.w > 0 && b.h > 0) out.push({ x: +b.x, y: +b.y, w: +b.w, h: +b.h }); }
    return out;
  }
  function boxHit(l, t, r, b, x, y) { return x >= l && x <= r && y >= t && y <= b; }
  function boxDist(l, t, r, b, x, y) { var dx = Math.max(l - x, 0, x - r), dy = Math.max(t - y, 0, y - b); return hyp(dx, dy); }

  /** DESIGN §2 short-side rule: CSS viewport → logical W×H. */
  function logicalSize(cssW, cssH, cfg) {
    cfg = cfg || CONFIG;
    var S = cfg.shortSide, aspect = cssW / Math.max(1, cssH);
    if (cssW >= cssH) return { W: clamp(Math.round(S * aspect), cfg.minLong, cfg.maxLong), H: S };
    return { W: S, H: clamp(Math.round(S / aspect), cfg.minLong, cfg.maxLong) };
  }

  function computeLayout(W, H, ins, cfg, age) {
    ins = { top: +(ins && ins.top) || 0, right: +(ins && ins.right) || 0, bottom: +(ins && ins.bottom) || 0, left: +(ins && ins.left) || 0 };
    var portrait = H > W, tall = H / W > cfg.tallRatio, sc = tall ? cfg.tallScale : 1;
    var bx = ins.left + cfg.bubbleX;
    var bubble = portrait
      ? { x: bx, y: ins.top + cfg.hudH + cfg.bubbleGapPort, w: W - bx - ins.right - cfg.bubbleX, h: cfg.bubbleHPort }
      : { x: bx, y: ins.top + cfg.bubbleY, w: Math.min(cfg.bubbleMaxW, W - bx - ins.right - cfg.bubbleRightGap), h: cfg.bubbleH };
    bubble.w = Math.max(0, bubble.w);
    var hud = { x: W - ins.right - cfg.hudW, y: 0, w: cfg.hudW + ins.right, h: ins.top + cfg.hudH };
    var groundY = H - ins.bottom - (portrait ? cfg.groundPort : cfg.groundLand);
    var ph = (portrait ? cfg.pipHPort : cfg.pipH) * sc;
    var pip = { x: ins.left + cfg.pipX, y: groundY - 6, h: ph, w: ph * cfg.pipAspect };
    var camp = { x: W - ins.right - cfg.campX, y: groundY - cfg.campDy, w: cfg.campW * sc };
    var spotW = (cfg.spotW[age] || cfg.spotW[5]) * sc, e = spotW * cfg.fieldEdge;
    var x0 = ins.left + e, x1 = W - ins.right - e, rows;
    if (portrait) {
      rows = [{ name: 'back', y: cfg.backPort * H, scale: cfg.backScalePort, x0: x0, x1: x1, edge: true },
        { name: 'middle', y: Math.min(cfg.midPort * H, (cfg.backPort * H + groundY - cfg.frontPort * sc) / 2), scale: cfg.midScalePort, x0: x0, x1: x1, optional: true, edge: true },
        { name: 'front', y: groundY - cfg.frontPort * sc, scale: 1, x0: x0, x1: x1, edge: true }];
    } else {
      rows = [{ name: 'back', y: cfg.backLand * H, scale: cfg.backScaleLand, x0: x0, x1: x1, edge: true },
        { name: 'front', y: groundY - cfg.frontLand, scale: 1, x0: ins.left + cfg.fieldLeft, x1: W - ins.right - cfg.fieldRight }];
    }
    var front = rows[rows.length - 1];
    var seat = spotW * cfg.seatFrac, fs = spotW * cfg.friendFrac;
    var bench = cfg.seats.map(function (s) { return { x: camp.x + s[0] * seat, y: camp.y + 2 + s[1] * seat }; });
    // the gather line: in the open meadow, clear of Pip (and of the fire in landscape)
    var gather = portrait
      ? { y: front.y + 0.5 * (groundY - front.y), x0: pip.x + pip.w / 2 + 10 + fs * 0.4, x1: W - ins.right - fs * 0.55 }
      : { y: groundY - cfg.gatherYLand, x0: pip.x + pip.w / 2 + 24 + fs * 0.45, x1: camp.x - spotW * 0.6 };
    if (gather.x1 < gather.x0) gather.x1 = gather.x0;
    return {
      W: W, H: H, ins: ins, portrait: portrait, tall: tall, scale: sc, bubble: bubble, hud: hud, groundY: groundY,
      pip: pip, camp: camp, bench: bench, seatSize: seat, rows: rows, field: { x0: front.x0, x1: front.x1 },
      spotW: spotW, spotH: spotW * cfg.spotArtH / cfg.spotArtW, friendSize: fs, peekRise: fs * cfg.peekRiseFrac,
      gather: gather, exitX: W + fs * 0.7,
      safe: { x: ins.left, y: ins.top, w: W - ins.left - ins.right, h: H - ins.top - ins.bottom }
    };
  }

  // ------------------------------------------------------------------ place layout solver (DESIGN §2)
  function rowGeo(L, cfg, row, y, k, pv, cf) {
    var w = L.spotW * row.scale * k, f = w * cfg.friendFrac, a = w / cfg.spotArtW;
    var pHi = y - (cfg.spotAnchor - pv.min) * a, pLo = y - (cfg.spotAnchor - pv.max) * a;
    return { y: y, w: w, f: f, pHi: pHi, pLo: pLo, top: pHi - (cfg.peekRiseFrac + cf) * f, ph: f * cfg.peekHalf, oh: w * cfg.objHalf };
  }
  /** min |dx| between places of two different rows: peek boxes (head + clue) never overlap each other or another
   * place's object; objects may overlap (depth). */
  function sepRows(A, B, cfg) {
    var m = cfg.rowGap, v = cfg.vGap, d = 0;
    function ov(t1, b1, t2, b2) { return t1 < b2 + v && t2 < b1 + v; }
    if (ov(A.top, A.pLo, B.top, B.pLo)) d = Math.max(d, A.ph + B.ph + m);
    if (ov(A.top, A.pLo, B.pHi, B.y)) d = Math.max(d, A.ph + B.oh + m);
    if (ov(A.pHi, A.y, B.top, B.pLo)) d = Math.max(d, A.oh + B.ph + m);
    return d;
  }
  function patternsOf(counts) {
    var out = [], cur = [], c = counts.slice(), n = c.reduce(function (s, x) { return s + x; }, 0);
    (function rec() {
      if (cur.length === n) { out.push(cur.slice()); return; }
      for (var r = 0; r < c.length; r++) if (c[r] > 0) { c[r]--; cur.push(r); rec(); cur.pop(); c[r]++; }
    })();
    return out;
  }
  function adjSame(p) { var s = 0; for (var i = 1; i < p.length; i++) if (p[i] === p[i - 1]) s++; return s; }

  /** x positions for a left-to-right row pattern, or null. Spread evenly (+ jitter), every constraint kept. */
  function chain(pat, geos, rows, cfg, rng) {
    var n = pat.length, Lx = [], Rx = [], i, j;
    var d = function (a, b) { return pat[a] === pat[b] ? geos[pat[a]].w + cfg.sameGap : sepRows(geos[pat[a]], geos[pat[b]], cfg); };
    var D = [];
    for (i = 0; i < n; i++) { D[i] = []; for (j = 0; j < n; j++) D[i][j] = i < j ? d(i, j) : 0; }
    for (i = 0; i < n; i++) {
      var lo = rows[pat[i]].x0;
      for (j = 0; j < i; j++) lo = Math.max(lo, Lx[j] + D[j][i]);
      if (lo > rows[pat[i]].x1 + 1e-6) return null;
      Lx.push(lo);
    }
    for (i = n - 1; i >= 0; i--) {
      var hi = rows[pat[i]].x1;
      for (j = i + 1; j < n; j++) hi = Math.min(hi, Rx[j] - D[i][j]);
      Rx[i] = hi;
    }
    var a = 1e9, b = -1e9;
    pat.forEach(function (r) { a = Math.min(a, rows[r].x0); b = Math.max(b, rows[r].x1); });
    var xs = [];
    for (i = 0; i < n; i++) xs.push(clamp(a + (b - a) * (i + 0.5) / n + rng.float(-cfg.jitterX, cfg.jitterX), Lx[i], Math.max(Lx[i], Rx[i])));
    for (j = 1; j < n; j++) for (i = 0; i < j; i++) xs[j] = Math.max(xs[j], xs[i] + D[i][j]);
    for (i = 0; i < n; i++) if (xs[i] > rows[pat[i]].x1 + 1e-6) return Lx;
    return xs;
  }

  /**
   * Lays out n hiding places (DESIGN §2): split over the rows, staggered, clues clear of every keep-out box, shrinking
   * spotW (× cfg.shrink) and moving rows down when needed. Deterministic from `seed`.
   * → { k, split, slots:[{x, y, row, scale}], rowsY, cramped }
   */
  function solvePlaces(L, cfg, n, pv, cf, keeps, seed) {
    var rng = new FC.RNG(seed), rows0 = L.rows, sp = SPLITS[L.portrait ? 'P' : 'L'][clamp(n, 2, 6)];
    var m = cfg.keepMargin, best = null, rows = rows0;
    for (var ki = 0; ki < cfg.shrink.length; ki++) {
      var k = cfg.shrink[ki];
      // side margins (0.6·w) shrink with the places; the landscape front row keeps its Pip / fire limits
      rows = rows0.map(function (r) {
        if (!r.edge) return r;
        var e = L.spotW * cfg.fieldEdge * k * r.scale;
        return { name: r.name, y: r.y, scale: r.scale, x0: L.ins.left + e, x1: L.W - L.ins.right - e, edge: true };
      });
      for (var si = 0; si < sp.length; si++) {
        var split = sp[si], used = [];
        split.forEach(function (c, r) { if (c > 0) used.push(r); });
        if (L.portrait && n <= 4 && split[1] > 0) continue;
        var pats = rng.shuffle(patternsOf(split)).sort(function (p, q) { return adjSame(p) - adjSame(q); });
        var ys = rows.map(function (r) { return r.y; }), sol = null;
        for (var it = 0; it < 5 && !sol; it++) {
          var geos = rows.map(function (r, i) { return rowGeo(L, cfg, r, ys[i], k, pv, cf); });
          var xs = null, pat = null;
          for (var pi = 0; pi < pats.length && !xs; pi++) { xs = chain(pats[pi], geos, rows, cfg, rng); pat = pats[pi]; }
          if (!xs) break;
          if (!best) best = { k: k, split: split, xs: xs, pat: pat, ys: ys.slice(), cramped: true };
          var need = rows.map(function () { return 0; });
          for (var j = 0; j < n; j++) {
            var g = geos[pat[j]], l = xs[j] - g.ph, r2 = xs[j] + g.ph;
            if (g.top < L.ins.top + 4) need[pat[j]] = Math.max(need[pat[j]], L.ins.top + 4 - g.top);
            for (var q = 0; q < keeps.length; q++) {
              var K = keeps[q];
              if (r2 + m > K.x && l - m < K.x + K.w && g.top - m < K.y + K.h && g.pLo + m > K.y) need[pat[j]] = Math.max(need[pat[j]], K.y + K.h + m - g.top);
            }
          }
          if (need.every(function (v) { return v <= 0.01; })) { sol = { xs: xs, pat: pat }; break; }
          for (var r = 0; r < rows.length; r++) ys[r] += need[r] > 0 ? need[r] + 0.5 : 0;
          // rows stay ordered and the front row stays above the ground
          var ok = true, prev = -1e9;
          for (r = 0; r < rows.length; r++) {
            if (split[r] === 0) continue;
            if (ys[r] < prev + cfg.rowMinDY) ok = false;
            prev = ys[r];
          }
          if (ys[rows.length - 1] > L.groundY - cfg.frontMinGround) ok = false;
          if (!ok) break;
        }
        if (sol) {
          return { k: k, split: split, rowsY: ys, cramped: false,
            slots: sol.xs.map(function (x, j) { return { x: x, y: ys[sol.pat[j]], row: sol.pat[j], scale: rows[sol.pat[j]].scale }; }) };
        }
      }
    }
    // nothing fits (never seen on the tested viewports): the smallest tried layout, clues may touch a keep-out
    if (!best) {
      var kk = cfg.shrink[cfg.shrink.length - 1], fr = rows.length - 1, span = rows[fr].x1 - rows[fr].x0;
      best = { k: kk, split: null, ys: rows.map(function (r) { return r.y; }), pat: [], xs: [], cramped: true };
      for (var z = 0; z < n; z++) { best.pat.push(fr); best.xs.push(rows[fr].x0 + span * (z + 0.5) / n); }
    }
    return { k: best.k, split: best.split, rowsY: best.ys, cramped: true,
      slots: best.xs.map(function (x, j) { return { x: x, y: best.ys[best.pat[j]], row: best.pat[j], scale: rows[best.pat[j]].scale }; }) };
  }

  // ------------------------------------------------------------------ World
  function World(opts) {
    opts = opts || {};
    this.cfg = merge(CONFIG, opts.config);
    this.seed = opts.seed !== undefined ? opts.seed : 1;
    this.rng = new FC.RNG(this.seed);
    this._crng = new FC.RNG((FC.RNG.hash(this.seed) ^ 0x51ed27) >>> 0);   // cosmetic randomness (hop apexes, blinks)
    this.age = FC.Content.ageOf(opts.age !== undefined ? opts.age : 4);
    this.lang = opts.lang === 'vi' ? 'vi' : 'en';
    this._pendingAge = this.age; this._pendingLang = this.lang;
    this.state = 'menu'; this.phase = null;
    this.level = 0; this.levels = []; this.topic = null; this.weather = 0; this.season = 0;
    this.round = 0; this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.stars = 0; this.levelStars = 0; this.roundStars = 0;
    this.ask = 0; this.asks = 0; this.misses = 0; this.askMisses = 0; this.streak = 0;
    this.time = 0; this.stateTime = 0; this.phaseTime = 0; this.alpha = 0; this._acc = 0;
    this.cur = null; this.places = []; this.friends = []; this.met = [];
    this.talk = null; this.talkAnswered = null; this.wind = 0; this.hudKeep = opts.hudKeep || null; this.lastTopics = null;
    this.surprise = null; this._surpriseOff = 0;
    this.critter = null; this._critterAt = -1; this._critterDone = false; this._swapDone = false;
    this.geo = null; this.fire = { power: this.cfg.fireBase, x: 0, y: 0 };
    this.pip = { x: 0, y: 0, mood: 'idle', moodT: 0, blinkT: 3, blink: false, lookX: 0, look: 0 };
    this.events = []; this.sessions = 0; this._idN = 0; this._seatN = 0;
    this._idleN = 0; this._idleT = 0; this._idleGap = this.cfg.idleTime; this._lastHintT = -1e9; this.levelStartTime = 0;
    this._talkAskT = 0; this._talkAsks = 0; this._lockUntil = -1; this._press = null; this._lookAt = null;
    this._countN = 0; this._ran = false; this._foundF = null; this._partyF = null; this._partySeatT = -1;
    this.setViewport(opts.width || 1280, opts.height || 720, opts.ins || null);
  }
  World.logicalSize = logicalSize;
  World.computeLayout = function (W, H, ins, cfg, age) { return computeLayout(W, H, ins, merge(CONFIG, cfg), FC.Content.ageOf(age || 4)); };
  World.solvePlaces = solvePlaces;
  World.backOut = backOut;
  /** spots.json ({ kind: { peekY, season } }) → CONFIG.peekY (call once when the art metadata is loaded). */
  World.applySpots = function (json) {
    if (!json) return 0;
    var n = 0;
    for (var k in json) if (json[k] && typeof json[k].peekY === 'number' && isFinite(json[k].peekY)) { CONFIG.peekY[k] = json[k].peekY; n++; }
    return n;
  };

  var P = World.prototype;
  Object.defineProperty(P, 'interactive', { get: function () { return this.state === 'round' && this.phase === 'ask'; } });
  P._emit = function (e) { this.events.push(e); };
  P.drainEvents = function () { var e = this.events; this.events = []; return e; };
  P.setAge = function (a) { this._pendingAge = FC.Content.ageOf(a); };
  P.setLang = function (l) { this._pendingLang = l === 'vi' ? 'vi' : 'en'; };
  P.placeById = function (id) { for (var i = 0; i < this.places.length; i++) if (this.places[i].id === id) return this.places[i]; return null; };
  P.friendById = function (id) { for (var i = 0; i < this.friends.length; i++) if (this.friends[i].id === id) return this.friends[i]; return null; };
  P._setState = function (s) { this.state = s; this.stateTime = 0; };
  P._setPhase = function (p) { this.phase = p; this.phaseTime = 0; };
  P._mood = function (m, t) { this.pip.mood = m; this.pip.moodT = t || this.cfg.moodTime[m] || 1; };
  P.skipTalk = function () { if (this.state === 'talk') this._levelDone(); };
  P._askObj = function () { return this.cur && this.ask < this.cur.asks.length ? this.cur.asks[this.ask] : null; };
  /** The friend the current ask is looking for. */
  P._answerF = function () {
    var a = this._askObj();
    return a ? this.friendById(this._fids[a.answer]) : null;
  };
  /** The current question {promptKey, params} (null before the first ask / outside a round). */
  P.prompt = function () {
    if (this.state !== 'round' || !this.cur || !this._asked) return null;
    var a = this._askObj();
    return a ? { promptKey: a.promptKey, params: a.params } : null;
  };
  /** Id of the place where the friend of the current ask hides (null when no ask is open). */
  P.answerId = function () {
    if (this.state !== 'round' || (this.phase !== 'ask' && this.phase !== 'peek')) return null;
    var f = this._answerF();
    return f && !f.found ? f.home : null;
  };

  // ---------------------------------------------------------------- geometry
  P._fsize = function (p) { return p.w * this.cfg.friendFrac; };
  /** screen box of a place's peek area (head + clue) and of its object */
  P._peekBox = function (p) { var h = p.fs * this.cfg.peekHalf; return { l: p.x - h, t: p.clueTop, r: p.x + h, b: p.peekY }; };
  P._objBox = function (p) { var h = p.w * this.cfg.objHalf; return { l: p.x - h, t: p.peekY, r: p.x + h, b: p.y }; };
  /** Screen rect (logical px) of a place's hit area (DESIGN §2: x ± w/2, clue top … bottom): centre (x, y), size w × h. */
  P.placeHit = function (id) {
    var p = typeof id === 'object' ? id : this.placeById(id);
    if (!p) return null;
    return { x: p.x, y: (p.clueTop + p.y) / 2, w: p.w, h: p.y - p.clueTop };
  };
  P._pipBox = function () { var Q = this.layout.pip; return { l: Q.x - Q.w / 2, t: Q.y - Q.h, r: Q.x + Q.w / 2, b: Q.y }; };
  P.pipHit = function () { var b = this._pipBox(); return { x: (b.l + b.r) / 2, y: (b.t + b.b) / 2, w: b.r - b.l, h: b.b - b.t }; };
  /** What is under (x, y)? peek boxes, then objects (front row first), then Pip, then padded place boxes (nearest),
   * then Pip + 20 px. → place | 'pip' | null */
  P._hit = function (x, y) {
    var ps = this.places.filter(function (p) { return !p.leaving; }), i, b, cfg = this.cfg;
    for (i = 0; i < ps.length; i++) { b = this._peekBox(ps[i]); if (boxHit(b.l, b.t, b.r, b.b, x, y)) return ps[i]; }
    var byY = ps.slice().sort(function (p, q) { return q.y - p.y; });
    for (i = 0; i < byY.length; i++) { b = this._objBox(byY[i]); if (boxHit(b.l, b.t, b.r, b.b, x, y)) return byY[i]; }
    var pb = this._pipBox();
    if (boxHit(pb.l, pb.t, pb.r, pb.b, x, y)) return 'pip';
    var best = null, bd = 1e9, pad = cfg.hitPad;
    for (i = 0; i < ps.length; i++) {
      var p = ps[i], l = p.x - p.w / 2, r = p.x + p.w / 2;
      if (!boxHit(l - pad, p.clueTop - pad, r + pad, p.y + pad, x, y)) continue;
      var d = boxDist(l, p.clueTop, r, p.y, x, y);
      if (d < bd) { bd = d; best = p; }
    }
    if (best) return best;
    pad = cfg.pipHitPad;
    if (boxHit(pb.l - pad, pb.t - pad, pb.r + pad, pb.b + pad, x, y)) return 'pip';
    return null;
  };

  // ---------------------------------------------------------------- viewport
  P.setViewport = function (W, H, ins) {
    this.layout = computeLayout(W, H, ins, this.cfg, this.age);
    this.layout.hudKeep = keepBoxes(this.hudKeep);
    this.pip.x = this.layout.pip.x; this.pip.y = this.layout.pip.y;
    this.fire.x = this.layout.camp.x; this.fire.y = this.layout.camp.y;
    if (this.places.length) { this._placeLayout(); this._snapAll(); }
  };

  P._keeps = function () { var L = this.layout; return [L.bubble, L.hud].concat(keepBoxes(this.hudKeep)); };
  P._pv = function () {
    var ks = FC.SEASON_SPOTS[this.season] || FC.SEASON_SPOTS[0], cfg = this.cfg;
    var a = cfg.peekY[ks[0]] != null ? cfg.peekY[ks[0]] : 50, b = cfg.peekY[ks[1]] != null ? cfg.peekY[ks[1]] : 50;
    return { min: Math.min(a, b), max: Math.max(a, b) };
  };
  /** (Re)places the round's places for the current layout (same seed → same result). */
  P._placeLayout = function () {
    var cfg = this.cfg, L = this.layout, self = this, live = this.places.filter(function (p) { return !p.leaving; });
    if (!live.length || !this.cur) return;
    var cf = 0;
    live.forEach(function (p) { var f = self.friendById(p.friendId); cf = Math.max(cf, cfg.clueFrac[(f && f.clue.kind) || 'badge'] || 0.55); });
    this._cf = cf;
    var sol = solvePlaces(L, cfg, live.length, this._pv(), cf, this._keeps(), this.cur.seed);
    this.geo = { k: sol.k, split: sol.split, cramped: sol.cramped, rowsY: sol.rowsY, clueFrac: cf };
    live.forEach(function (p, i) {
      var s = sol.slots[i];
      p.x = s.x; p.y = s.y; p.row = s.row; p.scale = s.scale * sol.k;
      p.w = L.spotW * p.scale; p.h = p.w * cfg.spotArtH / cfg.spotArtW; p.fs = self._fsize(p);
      var pv = cfg.peekY[p.kind] != null ? cfg.peekY[p.kind] : 50;
      p.peekY = p.y - (cfg.spotAnchor - pv) * p.w / cfg.spotArtW;
      p.peekRise = p.fs * cfg.peekRiseFrac;
      p.clueTop = p.peekY - (cfg.peekRiseFrac + cf) * p.fs;
    });
  };
  /** Rotation / resize mid-round: every running animation finishes instantly (with its events) and objects snap. */
  P._snapAll = function () {
    var self = this;
    this.friends.forEach(function (f) { self._finish(f); });
    this.friends.forEach(function (f) { self._pose(f, 0); f._px = f.x; f._py = f.y; f.rot = f._prot = 0; f._rv = 0; f._q = f._qv = 0; f.sx = f.sy = 1; });
    this.places.forEach(function (p) {
      p.open = p._openT; p.shake = p._pshake = 0; p._sv = 0; p._q = p._qv = 0; p.sx = p.sy = 1;
      p.appear = p.leaving ? 0 : 1; p._appT = 1e9;
    });
    this.friends = this.friends.filter(function (f) { return f.state !== 'gone'; });
    this.places = this.places.filter(function (p) { return !p.leaving; });
    if (this.critter) { var c = this._critterSpot(); if (c) { this.critter.x = this.critter._px = c.x; this.critter.y = this.critter._py = c.y; this.critter.size = c.size; } else this.critter = null; }
  };

  // ---------------------------------------------------------------- session flow
  P._newId = function (p) { return p + (this._idN++); };

  /** opts.lastTopics (or w.lastTopics): the previous session's chapter topics → this session rotates (FC.Content.topicsFor). */
  P.newSession = function (opts) {
    this.age = this._pendingAge; this.lang = this._pendingLang;
    this.sessions++;
    var L = this.layout;
    this.layout = computeLayout(L.W, L.H, L.ins, this.cfg, this.age);
    this.layout.hudKeep = L.hudKeep;
    var last = (opts && opts.lastTopics) || this.lastTopics || null;
    this.levels = FC.Content.topicsFor(this.age, this.rng, last);
    this._surpriseOff = this.rng.int(0, Math.max(0, this.cfg.surpriseTypes.length - 1));
    this.stars = 0; this.met = []; this.places = []; this.friends = []; this.critter = null; this.cur = null;
    this.weather = this.season = 0;
    this._emit({ type: 'session', levels: this.levels.slice() });
    this.startLevel(0);
  };

  P.startLevel = function (i) {
    if (!this.levels.length) this.levels = FC.Content.topicsFor(this.age);
    this.level = clamp(i | 0, 0, this.levels.length - 1);
    this.topic = this.levels[this.level];
    this.weather = this.season = this.level % 4;
    this.round = 0; this.levelStars = 0; this.levelStartTime = this.time;
    this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.cur = null; this.talk = null; this.talkAnswered = null; this.surprise = null;
    this.places = []; this.friends = []; this.critter = null; this._press = null; this._asked = false;
    this._setState('intro'); this.phase = null;
    this._mood('idle', 0.01);
    this._emit({ type: 'level', level: this.level, topic: this.topic, season: this.season });
  };

  P._beginRound = function () {
    var cfg = this.cfg, self = this;
    var rr = new FC.RNG((this.rng.next() * 4294967296) >>> 0);
    var ST = cfg.surpriseTypes, sp = ST && ST.length && this.round === cfg.surpriseRound ? ST[(this.level + this._surpriseOff) % ST.length] : null;
    this.cur = FC.Content.makeRound(this.topic, { age: this.age, lang: this.lang, rng: rr, roundIndex: this.round, season: this.season,
      surprise: sp, placesByAge: cfg.placesByAge });
    this.surprise = sp;
    this.ask = 0; this.asks = this.cur.asks.length; this.misses = 0; this.askMisses = 0; this.streak = 0; this._asked = false;
    this._critterAt = -1; this._critterDone = false; this._swapDone = false; this.critter = null; this._seatN = 0;
    this._countN = 0; this._ran = false; this._foundF = null; this._partyF = null; this._partySeatT = -1; this._lookAt = null;
    this.places = []; this.friends = []; this._fids = [];
    var L = this.layout;
    this.cur.places.forEach(function (cp, i) {
      var pid = self._newId('p'), fid = self._newId('f');
      self.places.push({ id: pid, idx: i, kind: cp.kind, friendId: fid, x: 0, y: 0, w: L.spotW, h: L.spotH, scale: 1, row: 0, peekY: 0,
        peekRise: 0, clueTop: 0, fs: L.friendSize, open: 0, _openT: 0, shake: 0, _pshake: 0, _sv: 0, sx: 1, sy: 1, _q: 0, _qv: 0,
        glow: 0, _glowT: 0, found: false, appear: 0, _appT: -i * cfg.appearStagger, leaving: false });
      var sc = cp.clue.scale || 1;
      self.friends.push({ id: fid, animal: cp.friend, clue: cp.clue, x: L.exitX, y: L.gather.y, _px: L.exitX, _py: L.gather.y, rot: 0, _prot: 0,
        sx: 1, sy: 1, scale: sc, size: L.friendSize * sc, place: null, home: pid, state: 'enter', rise: 0, t: 0, wave: false, look: 0,
        seat: -1, found: false, bob: 0, at: null, _seg: null, _queue: [], _q: 0, _qv: 0, _rv: 0, _lean: 0, _wig: 0, _dance: 0, _lift: 0 });
      self._fids.push(fid);
    });
    this._placeLayout();
    // the friends hop in from the right, staggered; the first goes farthest left
    var n = this.friends.length;
    this.friends.forEach(function (f, i) {
      f.at = null;
      f._queue.push({ type: 'wait', T: i * cfg.gatherStagger, state: 'enter' });
      f._queue.push({ type: 'hop', to: { kind: 'gather', i: i, n: n }, apex: cfg.enterApex, hopLen: cfg.enterHop, state: 'enter',
        onDone: function () { f.state = 'wave'; f.wave = true; } });
    });
    this._setState('round'); this._setPhase('gather');
    this._mood('happy', 1.0);
    this._emit({ type: 'round', round: this.round, topic: this.topic, places: n, asks: this.asks, surprise: sp });
    this._emit({ type: 'gather' });
  };

  P._startCount = function () {
    this._setPhase('count');
    this._mood('cover', 99);
    this._countN = 0; this._ran = false;
  };
  P._run = function () {
    var cfg = this.cfg, self = this;
    this._ran = true;
    this.friends.forEach(function (f, i) {
      var p = self.placeById(f.home);
      var d = hyp(p.x - f.x, p.peekY - f.y);
      f._queue.push({ type: 'wait', T: i * cfg.runStagger, state: 'wave' });
      f._queue.push({ type: 'hop', to: { kind: 'place', id: p.id }, hops: d > cfg.runHop3 ? 3 : 2, apex: cfg.runApex, state: 'run',
        onStart: function () { f.wave = false; },
        onDone: function () { self._duckIn(f, true); } });
    });
  };
  /** f stands on its place's peek line → ducks behind it (hideIn). */
  P._duckIn = function (f, emit) {
    var p = this.placeById(f.home), self = this;
    f.place = p.id; f.at = { kind: 'place', id: p.id }; f.rise = 1; f.state = 'duck'; f.wave = false;
    this._kickPlace(p, 1);
    if (emit) this._emit({ type: 'hideIn', placeId: p.id, friendId: f.id });
    f._queue.unshift({ type: 'rise', to: 0, T: this.cfg.duckTime, ease: 'smooth', state: 'duck', onDone: function () { f.state = 'hidden'; f.look = 0; void self; } });
  };

  P._startAsk = function () {
    var a = this._askObj(), f = this._answerF();
    this._setPhase('ask');
    this._asked = true;
    this.askMisses = 0; this._lockUntil = -1;
    this._idleT = 0; this._idleGap = this.cfg.idleTime; this._idleN = 0;
    this._emit({ type: 'ask', ask: this.ask, asks: this.asks, promptKey: a.promptKey, params: a.params, answerId: f.home, friendId: f.id });
    if (this.surprise === 'critter' && !this._critterDone && this._critterAt < 0 && (this.ask === 1 || this.asks === 1)) {
      this._critterAt = this.time + this.rng.float(this.cfg.critterDelay[0], this.cfg.critterDelay[1]);
    }
  };

  P._endRoundParty = function () {
    var cfg = this.cfg, self = this, m = this.misses, st = m === 0 ? 3 : m === 1 ? 2 : 1;
    this.roundStars = st; this.stars += st; this.levelStars += st;
    this._setPhase('party');
    this._mood('cheer', cfg.partyTime);
    this.fire.power = 1;
    this._emit({ type: 'roundDone', round: this.round, stars: st, misses: m });
    // the leftover friend pops out by itself and joins the fire
    var left = this.friends.filter(function (f) { return !f.found; })[0];
    this._partyF = left || null; this._partySeatT = left ? -1 : 0;
    if (left) {
      var p = this.placeById(left.home);
      p._openT = 1; this._kickPlace(p, 0.7);
      left.state = 'pop';
      left._queue.push({ type: 'rise', to: 1, T: cfg.popTime, ease: 'back', state: 'pop', onDone: function () {
        self._emit({ type: 'reveal', placeId: p.id, friendId: left.id, nameKind: left.clue.nameKind, nameValue: left.clue.nameValue, clue: left.clue });
        self._toFire(left, function () { self._partySeatT = self.time; });
      } });
    }
    this.friends.forEach(function (f) { if (f.found && f.state === 'seated') self._dance(f); });
  };
  P._dance = function (f) {
    var cfg = this.cfg;
    f.state = 'dance';
    f._queue.push({ type: 'bounce', T: 1e9, off: (f.seat % 6) * cfg.danceStagger, state: 'dance' });
  };
  P._leaveAll = function () {
    var cfg = this.cfg, self = this;
    this._setState('roundDone'); this.phase = 'leave';
    this._mood('happy', 1.0);
    this.friends.forEach(function (f, i) {
      if (f._seg && f._seg.type === 'bounce') { f._seg = null; f._dance = 0; }
      f._queue = f._queue.filter(function (s) { return s.type !== 'bounce'; });
      self._finish(f);
      f._queue.push({ type: 'wait', T: i * cfg.leaveStagger, state: f.state });
      f._queue.push({ type: 'hop', to: { kind: 'exit', i: i }, apex: cfg.leaveApex, hopLen: cfg.leaveHop, state: 'leave',
        onStart: function () { f.place = null; f.at = null; },
        onDone: function () { f.state = 'gone'; } });
    });
    this.places.forEach(function (p) { p.leaving = true; });
    this.critter = null;
  };

  P._startTalk = function () {
    var rr = new FC.RNG((this.rng.next() * 4294967296) >>> 0);
    this.talk = FC.Content.makeTalk(this.topic, { age: this.age, lang: this.lang, rng: rr });
    this.talk.glowAnswer = false;
    this.talkAnswered = null; this._talkAskT = 0; this._talkAsks = 0;
    this.cur = null; this.phase = null; this.places = []; this.friends = [];
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
  P._locked = function () { return this.time < this._lockUntil; };
  P._touch = function () { this._idleT = 0; this._idleGap = this.cfg.idleTime; };   // a tap that hit something
  /** → place id | 'empty' | 'locked' | 'pip' | 'critter' | null */
  P.pointerDown = function (x, y) {
    this._press = null;
    if (this.state !== 'round') return null;
    var C = this.critter;
    if (C && (C.state === 'in' || C.state === 'up')) {
      var r = Math.max(this.cfg.critterR, C.size * 0.7);
      if (hyp(x - C.x, y - (C.y - C.size * 0.5)) <= r) {
        this._touch();
        C.state = 'tapped'; C.t = 0;
        this._emit({ type: 'critterTap', x: C.x, y: C.y - C.size * 0.5 });
        return 'critter';
      }
    }
    if (this.phase !== 'ask') return null;
    var hit = this._hit(x, y);
    if (hit === 'pip') { this._touch(); this._press = { x0: x, y0: y, t0: this.time, moved: false }; return 'pip'; }
    if (!hit) return null;   // grass / sky: the idle help keeps counting
    var p = hit, f = this.friendById(p.friendId);
    this._lookAt = p.id;
    if (p.found) { this._touch(); this._emit({ type: 'empty', placeId: p.id, x: p.x, y: p.peekY }); return 'empty'; }
    if (this._locked() || !f || f.state !== 'hidden') { this._emit({ type: 'locked', placeId: p.id }); return 'locked'; }   // spamming is not rewarded
    this._touch();
    this._peek(p, f);
    return p.id;
  };
  P.pointerMove = function (x, y) {
    if (!this._press) return;
    if (hyp(x - this._press.x0, y - this._press.y0) >= this.cfg.tapMove) this._press.moved = true;
  };
  P.pointerUp = function (x, y) {
    var d = this._press;
    this._press = null;
    if (!d || this.state !== 'round' || this.phase !== 'ask') return null;
    if (x === undefined) { x = d.x0; y = d.y0; }
    if (d.moved || hyp(x - d.x0, y - d.y0) >= this.cfg.tapMove || this.time - d.t0 >= this.cfg.tapTime) return null;
    var a = this._askObj();
    this._mood('talk', 1.0);
    this._emit({ type: 'pokePip', promptKey: a.promptKey, params: a.params });
    return 'pokePip';
  };
  P.cancelDrag = function () { this._press = null; };

  P._kickPlace = function (p, s) {
    var cfg = this.cfg;
    p._sv += (this._crng.chance(0.5) ? 1 : -1) * kickFor(cfg.shakeKick * (s || 1), cfg.shakeOmega, cfg.shakeZeta);
    p._q = cfg.placeSquash * (s || 1); p._qv = 0;
  };

  P._peek = function (p, f) {
    var cfg = this.cfg, self = this, right = f.id === (this._answerF() || {}).id;
    this._setPhase('peek');
    p._openT = 1; this._kickPlace(p, 1);
    f.state = 'pop';
    this._emit({ type: 'peek', placeId: p.id, friendId: f.id, right: right });
    f._queue.push({ type: 'wait', T: cfg.popDelay, state: 'pop' });
    f._queue.push({ type: 'rise', to: 1, T: cfg.popTime, ease: 'back', state: 'pop', onDone: function () { self._resolve(p, f, right); } });
  };

  P._resolve = function (p, f, right) {
    var cfg = this.cfg, self = this, a = this._askObj();
    if (right) {
      this.streak = 0;
      p.found = true; p._glowT = 0; f.found = true;
      this.fire.power = 1;
      this._mood('happy');
      this.met.push(f.animal);
      var n = this.friends.filter(function (x) { return x.found; }).length;
      this._emit({ type: 'found', placeId: p.id, friendId: f.id, nameKind: f.clue.nameKind, nameValue: f.clue.nameValue, clue: f.clue,
        animal: f.animal, n: n, ask: this.ask, promptKey: a.promptKey, params: a.params });
      this._foundF = f;
      this._setPhase('found');
      this._toFire(f, null);
      return;
    }
    this.misses++; this.askMisses++; this.streak++;
    this._lockUntil = this.time + (this.askMisses >= 2 ? cfg.wrongLock2 : cfg.wrongLock);
    this._mood('oops');
    var A = this._answerF(), want = { kind: A.clue.nameKind, value: A.clue.nameValue };
    if (A.clue.animal) want.animal = A.clue.animal;
    this._emit({ type: 'wrong', placeId: p.id, friendId: f.id, nameKind: f.clue.nameKind, nameValue: f.clue.nameValue, clue: f.clue,
      animal: f.animal, want: want, streak: this.streak, misses: this.askMisses, promptKey: a.promptKey, params: a.params });
    f.state = 'boo'; f.look = this.pip.x < f.x ? -1 : 1;
    f._queue.push({ type: 'wait', T: cfg.booTime, wiggle: true, state: 'boo' });
    f._queue.push({ type: 'rise', to: 0, T: cfg.duckTime, ease: 'smooth', state: 'duck', onStart: function () { p._openT = 0; },
      onDone: function () { f.state = 'hidden'; f.look = 0; self._kickPlace(p, 0.6); } });
    this._setPhase('ask');
    if (this.askMisses === cfg.hintAfterMisses) this._doHint(false);   // the 2nd miss always glows
    else if (this.askMisses > cfg.hintAfterMisses) this._autoHint();
  };

  /** jump out of the place (forwards, towards the fire) → hop to the next free bench seat → seated (+ seat event). */
  P._toFire = function (f, done) {
    var cfg = this.cfg, self = this, p = this.placeById(f.home), seat = this._seatN++ % 6;
    f.state = 'jump';
    f._queue.push({ type: 'hop', to: { kind: 'front', id: p.id }, hops: 1, apex: [cfg.jumpApex, cfg.jumpApex], state: 'jump',
      onStart: function () { f.place = null; f.at = null; },
      onDone: function () {
        f._queue.push({ type: 'hop', to: { kind: 'seat', i: seat }, apex: cfg.seatApex, hopLen: cfg.seatHop, minHops: 2, maxHops: 4, state: 'hop',
          onDone: function () {
            f.state = 'seated'; f.seat = seat; f.at = { kind: 'seat', i: seat };
            var S = self.layout.bench[seat];
            self._emit({ type: 'seat', friendId: f.id, seat: seat, x: S.x, y: S.y });
            if (self.phase === 'party' && self.state === 'round') self._dance(f);
            if (done) done();
          } });
      } });
  };

  P._startSwap = function () {
    var cfg = this.cfg, self = this;
    var hidden = this.friends.filter(function (f) { return !f.found && f.state === 'hidden'; });
    if (hidden.length < 2) { this._swapDone = true; this._startAsk(); return; }
    this._swapDone = true;
    var pair = this.rng.shuffle(hidden.slice()).slice(0, 2), A = pair[0], B = pair[1];
    var pA = this.placeById(A.home), pB = this.placeById(B.home);
    this._setPhase('swap');
    this._swapping = [A.id, B.id];
    [[A, pA, pB, cfg.swapApex[0]], [B, pB, pA, cfg.swapApex[1]]].forEach(function (s, j) {
      var f = s[0], from = s[1], to = s[2], apex = s[3];
      from._openT = 1; self._kickPlace(from, 0.8);
      f.state = 'pop';
      f._queue.push({ type: 'rise', to: 1, T: cfg.popTime, ease: 'back', state: 'pop', onDone: function () {
        if (j === 0) {
          // the friends trade places: homes + place.friendId follow (the asks follow the FRIENDS, so every ask stays solvable)
          A.home = pB.id; B.home = pA.id; pA.friendId = B.id; pB.friendId = A.id;
          self._emit({ type: 'swap', a: A.id, b: B.id, placeA: pA.id, placeB: pB.id });
        }
      } });
      f._queue.push({ type: 'hop', to: { kind: 'place', id: to.id }, hops: 1, apex: [apex, apex], state: 'hop',
        onStart: function () { f.place = null; f.at = null; from._openT = 0; },
        onDone: function () { self._duckIn(f, false); } });
    });
  };

  /** After a pause: idle nudges start over and Talk time re-asks from the beginning. */
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
    var f = this._answerF(), a = f && this.placeById(f.home);
    if (!a || a._glowT > 0) return null;
    a._glowT = this.cfg.hintGlowTime;
    this._lastHintT = this.time;
    this._mood('think');
    var ev = { type: 'hint', placeId: a.id };
    if (fromIdle) ev.idle = true;
    this._emit(ev);
    return a.id;
  };
  /** Manual hint (tap on the bubble): the right place glows (no event while it already glows). */
  P.hint = function () {
    if (this.state !== 'round' || this.phase !== 'ask') return null;
    var f = this._answerF(), a = f && this.placeById(f.home);
    if (!a) return null;
    if (a._glowT > 0) return a.id;
    return this._doHint(false);
  };

  // ---------------------------------------------------------------- friend motion (segments)
  /** Anchor point (feet) + sprite size for a motion target. */
  P._anchor = function (f, to) {
    var L = this.layout, cfg = this.cfg, p, s;
    switch (to.kind) {
      case 'place': p = this.placeById(to.id); return { x: p.x, y: p.peekY, size: p.fs * f.scale };
      case 'front': {
        p = this.placeById(to.id);
        var dir = L.camp.x >= p.x ? 1 : -1;
        return { x: clamp(p.x + dir * cfg.jumpFwd * p.w, L.ins.left + 40, L.W - L.ins.right - 40), y: p.y + 6, size: p.fs * f.scale };
      }
      case 'seat': s = L.bench[to.i % L.bench.length]; return { x: s.x, y: s.y, size: L.seatSize * f.scale };
      case 'gather': {
        var G = L.gather, u = to.n > 1 ? to.i / (to.n - 1) : 0.5;
        return { x: lerp(G.x0, G.x1, u), y: G.y + (to.i % 2 ? -10 : 0), size: L.friendSize * f.scale };
      }
      case 'exit': return { x: L.exitX + (to.i || 0) * 30, y: L.gather.y, size: L.friendSize * f.scale };
    }
    return { x: f.x, y: f.y, size: f.size };
  };
  P._riseY = function (p, f, rise) { return p.peekY + (1 - this.cfg.peekRiseFrac) * f.size * (1 - rise); };

  P._begin = function (f, S) {
    S.t = 0;
    if (S.state) f.state = S.state;
    if (S.onStart) S.onStart();
    if (S.type === 'rise') S.from = f.rise;
    if (S.type === 'hop') {
      var A = this._anchor(f, S.to), cfg = this.cfg, d = hyp(A.x - f.x, A.y - f.y);
      if (!S.hops) S.hops = clamp(Math.ceil(d / (S.hopLen || 300)), S.minHops || 1, S.maxHops || 4);
      S.k = 0; S.s0 = f.size; S.hop = null; S.contact = 0; S.d0 = Math.max(1, d);
      void cfg;
    }
    return S;
  };
  P._nextHop = function (f, S) {
    var A = this._anchor(f, S.to), m = S.hops - S.k, g = this.cfg.hopG;
    var x1 = m <= 1 ? A.x : f.x + (A.x - f.x) / m, y1 = m <= 1 ? A.y : f.y + (A.y - f.y) / m;
    var a = this._crng.float(S.apex[0], S.apex[1]), apexY = Math.min(f.y, y1) - a;
    var t1 = Math.sqrt(2 * (f.y - apexY) / g), t2 = Math.sqrt(2 * (y1 - apexY) / g);
    S.hop = { x0: f.x, y0: f.y, x1: x1, y1: y1, t1: t1, T: t1 + t2, t: 0, s0: f.size, s1: lerp(f.size, A.size, 1 / m), dir: x1 >= f.x ? 1 : -1 };
    f._q = -this.cfg.takeoffStretch; f._qv = 0;
  };
  /** Advances segment S by h; returns true when it finished. */
  P._advance = function (f, S, h) {
    var cfg = this.cfg;
    S.t += h;
    switch (S.type) {
      case 'wait':
        f._wig = S.wiggle ? cfg.wiggleAmp * Math.sin(TAU * cfg.wiggleHz * S.t) * (1 - clamp(S.t / S.T, 0, 1)) : 0;
        if (S.t >= S.T) { f._wig = 0; return true; }
        return false;
      case 'rise': {
        var u = clamp(S.t / S.T, 0, 1);
        f.rise = lerp(S.from, S.to, S.ease === 'back' ? backOut(u, cfg.popBack) : smooth(u));
        if (u >= 1) { f.rise = S.to; return true; }
        return false;
      }
      case 'bounce': {
        var ph = ((S.t + S.off) % cfg.dancePeriod) / cfg.dancePeriod, prev = ((S.t - h + S.off) % cfg.dancePeriod) / cfg.dancePeriod;
        f._dance = cfg.danceApex * 4 * ph * (1 - ph);
        if (ph < prev) { f._q = cfg.landSquash * 0.6; f._qv = 0; }
        if (S.t >= S.T) { f._dance = 0; return true; }
        return false;
      }
      case 'hop': {
        if (S.contact > 0) { S.contact -= h; if (S.contact > 0) return false; }
        if (!S.hop) this._nextHop(f, S);
        var H = S.hop;
        H.t += h;
        var tt = Math.min(H.t, H.T), g = cfg.hopG;
        f.x = H.x0 + (H.x1 - H.x0) * tt / H.T;
        f.y = H.y0 - g * H.t1 * tt + 0.5 * g * tt * tt;
        f.size = lerp(H.s0, H.s1, tt / H.T);
        f._lean = cfg.lean * H.dir * (1 - 2 * tt / H.T) * Math.min(1, Math.abs(H.x1 - H.x0) / 60);
        if (H.t >= H.T) {
          f.x = H.x1; f.y = H.y1; f.size = H.s1; f._lean = 0;
          f._q = cfg.landSquash; f._qv = 0;
          S.k++; S.hop = null;
          if (S.k >= S.hops) { var A = this._anchor(f, S.to); f.x = A.x; f.y = A.y; f.size = A.size; f.at = S.to.kind === 'front' ? null : S.to; return true; }
          S.contact = cfg.hopContact;
        }
        return false;
      }
    }
    return true;
  };
  /** Completes S at once (resize snap). */
  P._complete = function (f, S) {
    switch (S.type) {
      case 'rise': f.rise = S.to; break;
      case 'wait': f._wig = 0; break;
      case 'bounce': f._dance = 0; break;
      case 'hop': { var A = this._anchor(f, S.to); f.x = A.x; f.y = A.y; f.size = A.size; f._lean = 0; f.at = S.to.kind === 'front' ? null : S.to; break; }
    }
  };
  P._finish = function (f) {
    for (var guard = 0; guard < 64 && (f._seg || f._queue.length); guard++) {
      if (!f._seg) {
        var nx = f._queue.shift();
        if (nx.type === 'bounce') { f._dance = 0; continue; }   // a dance never needs finishing
        f._seg = this._begin(f, nx);
      }
      var S = f._seg;
      this._complete(f, S);
      f._seg = null;
      if (S.onDone) S.onDone();
    }
  };
  /** Pose of a friend that is not flying: attached to a place (rise), a seat or the gather line. */
  P._pose = function (f, h) {
    var S = f._seg;
    if (S && S.type === 'hop') return;
    var at = f.at, cfg = this.cfg;
    if (!at) return;
    if (at.kind === 'place') {
      var p = this.placeById(at.id); if (!p) return;
      f.size = p.fs * f.scale;
      var lift = 0;
      if (f.state === 'hidden') {
        lift = p.glow * cfg.hintLift * (1 + Math.sin(TAU * cfg.hintBobHz * this.time) * cfg.hintBob / cfg.hintLift);
        f.bob = lift * (1 - cfg.peekRiseFrac) * f.size;
      } else f.bob = 0;
      f.x = p.x; f.y = this._riseY(p, f, f.rise + lift);
    } else {
      var A = this._anchor(f, at);
      f.x = A.x; f.y = A.y - (f._dance || 0); f.size = A.size;
    }
    void h;
  };

  P._stepFriend = function (f, h) {
    var cfg = this.cfg;
    f.t += h;
    for (var g = 0; g < 4; g++) {
      if (!f._seg && f._queue.length) f._seg = this._begin(f, f._queue.shift());
      if (!f._seg) break;
      var S = f._seg;
      if (!this._advance(f, S, g === 0 ? h : 0)) break;
      f._seg = null;
      if (S.onDone) S.onDone();
    }
    this._pose(f, h);
    // squash & stretch spring (landing 1 − 0.2 → overshoot → 1), heading lean + wiggle on a rotation spring
    f._qv += (-cfg.squashOmega * cfg.squashOmega * f._q - 2 * cfg.squashZeta * cfg.squashOmega * f._qv) * h; f._q += f._qv * h;
    f.sy = 1 - f._q; f.sx = 1 + 0.6 * f._q;
    var rt = f._lean + f._wig;
    f._rv += (cfg.rotOmega * cfg.rotOmega * (rt - f.rot) - 2 * cfg.rotZeta * cfg.rotOmega * f._rv) * h; f.rot += f._rv * h;
    if (f.state === 'seated' || f.state === 'dance') f.look = this.layout.camp.x >= f.x ? 1 : -1;
  };

  P._stepPlace = function (p, h) {
    var cfg = this.cfg;
    p._pshake = p.shake;
    // open / close ramps
    var rate = h / (p._openT > p.open ? cfg.openTime : cfg.closeTime);
    p.open = p._openT > p.open ? Math.min(p._openT, p.open + rate) : Math.max(p._openT, p.open - rate);
    // shake: damped rotation spring
    p._sv += (-cfg.shakeOmega * cfg.shakeOmega * p.shake - 2 * cfg.shakeZeta * cfg.shakeOmega * p._sv) * h; p.shake += p._sv * h;
    p._qv += (-cfg.squashOmega * cfg.squashOmega * p._q - 2 * cfg.squashZeta * cfg.squashOmega * p._qv) * h; p._q += p._qv * h;
    p.sy = 1 - p._q; p.sx = 1 + 0.5 * p._q;
    // appear (back-out pop) / disappear
    if (p.leaving) p.appear = Math.max(0, p.appear - h / cfg.appearTime);
    else if (p.appear < 1) { p._appT += h; p.appear = p._appT <= 0 ? 0 : Math.min(1, backOut(p._appT / cfg.appearTime, cfg.appearBack)); if (p._appT >= cfg.appearTime) p.appear = 1; }
    // hint glow
    if (p._glowT > 0) p._glowT = Math.max(0, p._glowT - h);
    var gT = p._glowT > 0 && !p.found ? 1 : 0;
    p.glow += (gT - p.glow) * Math.min(1, h * (gT ? 6 : 3));
  };

  // ---------------------------------------------------------------- critter (surprise)
  P._critterSpot = function () {
    var L = this.layout, cfg = this.cfg, s = L.spotW * cfg.critterFrac, keeps = this._keeps(), self = this, m = 10;
    var back = this.places.filter(function (p) { return !p.leaving; });
    if (!back.length) return null;
    var top = Math.min.apply(null, back.map(function (p) { return p.clueTop; }));
    var backY = Math.min.apply(null, back.map(function (p) { return p.y; }));
    var cands = [], ys = [top - 6, backY - 0.25 * L.spotW];
    var pb = this._pipBox();
    ys.forEach(function (y) {
      for (var x = L.ins.left + s / 2 + 12; x <= L.W - L.ins.right - s / 2 - 12; x += 16) {
        var l = x - s / 2, r = x + s / 2, t = y - s, b = y, ok = t > L.ins.top + 4;
        for (var q = 0; ok && q < keeps.length; q++) { var K = keeps[q]; if (r + m > K.x && l - m < K.x + K.w && t - m < K.y + K.h && b + m > K.y) ok = false; }
        for (q = 0; ok && q < back.length; q++) { var B = self._peekBox(back[q]), O = self._objBox(back[q]);
          if (r + m > B.l && l - m < B.r && t - m < B.b && b + m > B.t) ok = false;
          if (r + m > O.l && l - m < O.r && t - m < O.b && b + m > O.t) ok = false; }
        if (ok && r + m > pb.l && l - m < pb.r && t - m < pb.b && b + m > pb.t) ok = false;
        if (ok) cands.push({ x: x, y: y, size: s });
      }
    });
    if (!cands.length) return null;
    return cands[Math.floor(this._crng.next() * cands.length)];
  };
  P._stepCritter = function (h) {
    var cfg = this.cfg, C = this.critter;
    if (this._critterAt > 0 && this.time >= this._critterAt && !C && !this._critterDone && this.state === 'round') {
      this._critterDone = true; this._critterAt = -1;
      var s = this._critterSpot();
      if (s) {
        this.critter = { x: s.x, y: s.y, _px: s.x, _py: s.y, size: s.size, t: 0, state: 'in', rise: 0 };
        this._emit({ type: 'critter', x: s.x, y: s.y - s.size / 2 });
      }
      return;
    }
    if (!C) return;
    C._px = C.x; C._py = C.y;
    C.t += h;
    switch (C.state) {
      case 'in': C.rise = backOut(C.t / cfg.critterIn, 1.6); if (C.t >= cfg.critterIn) { C.state = 'up'; C.t = 0; C.rise = 1; } break;
      case 'up': C.rise = 1; if (C.t >= cfg.critterUp) { C.state = 'out'; C.t = 0; } break;
      case 'out': C.rise = 1 - smooth(C.t / cfg.critterOut); if (C.t >= cfg.critterOut) this.critter = null; break;
      case 'tapped': C.rise = 1 + 0.15 * Math.sin(Math.PI * clamp(C.t / cfg.critterTapTime, 0, 1)); if (C.t >= cfg.critterTapTime) this.critter = null; break;
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
    for (i = 0; i < this.friends.length; i++) { var f = this.friends[i]; f._px = f.x; f._py = f.y; f._prot = f.rot; }
    this.time += h; this.stateTime += h; this.phaseTime += h;
    this.fire.power += (cfg.fireBase - this.fire.power) * Math.min(1, h * cfg.fireDecay);   // before the logic: a flare reads 1

    switch (this.state) {
      case 'intro': if (this.stateTime >= cfg.introTime) this._beginRound(); break;
      case 'round': this._stepRound(h); break;
      case 'roundDone': {
        var gone = this.friends.every(function (x) { return x.state === 'gone'; });
        if (gone || this.stateTime >= cfg.leaveMax) {
          this.friends = []; this.places = [];
          this.round++;
          var long = this.round >= cfg.chapterMinRounds && this.time - this.levelStartTime > cfg.chapterTimeLimit;
          if (this.round < this.roundsPerLevel && !long) this._beginRound();
          else { if (this.round < this.roundsPerLevel) this.roundsPerLevel = this.round; this._startTalk(); }   // a cut chapter: the HUD dots fill
        }
        break;
      }
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
            this._emit({ type: 'sessionDone', stars: this.stars, friends: this.met.length, met: this.met.slice() });
          }
        }
        break;
    }
    for (i = 0; i < this.places.length; i++) this._stepPlace(this.places[i], h);
    for (i = 0; i < this.friends.length; i++) this._stepFriend(this.friends[i], h);
    if (this.state === 'roundDone') this.places = this.places.filter(function (p) { return p.appear > 0; });
    this._stepCritter(h);
    this._stepPip(h);
    this.fire.x = this.layout.camp.x; this.fire.y = this.layout.camp.y;
  };

  P._stepRound = function (h) {
    var cfg = this.cfg, self = this;
    switch (this.phase) {
      case 'gather': {
        var all = this.friends.every(function (f) { return f.state === 'wave' && !f._seg && !f._queue.length; });
        if (all) { this._waveT = (this._waveT || 0) + h; } else this._waveT = 0;
        if (all && this.phaseTime >= cfg.gatherMin && this._waveT >= cfg.gatherWave) this._startCount();
        break;
      }
      case 'count': {
        while (this._countN < cfg.countAt.length && this.phaseTime >= cfg.countAt[this._countN]) {
          this._countN++;
          this._emit({ type: 'countNum', n: this._countN });
        }
        if (!this._ran && this.phaseTime >= cfg.runAt) this._run();
        var hid = this._ran && this.friends.every(function (f) { return f.state === 'hidden' && !f._seg && !f._queue.length; });
        if (hid && this.phaseTime >= cfg.countTime && this._countN >= cfg.countAt.length) {
          this._mood('peek');
          this._emit({ type: 'ready' });
          this._startAsk();
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
          var a = this._askObj();
          this._emit({ type: 'idle', n: this._idleN, promptKey: a.promptKey, params: a.params });
          if (this._idleN >= cfg.idleHintFrom) this._doHint(true);
        }
        break;
      }
      case 'peek': break;   // the pop resolves it
      case 'found': {
        var F = this._foundF;
        var clear = F && F.state !== 'jump' && F.state !== 'pop';
        if (clear && this.phaseTime >= cfg.foundMin) {
          if (this.ask + 1 < this.asks) {
            this.ask++;
            if (this.surprise === 'swap' && !this._swapDone) this._startSwap();
            else this._startAsk();
          } else {
            this.ask++;
            this._endRoundParty();
          }
        }
        break;
      }
      case 'swap': {
        var ids = this._swapping || [];
        var done = ids.every(function (id) { var f = self.friendById(id); return f && f.state === 'hidden' && !f._seg && !f._queue.length; });
        if (done) this._startAsk();
        break;
      }
      case 'party': {
        var seated = this._partySeatT >= 0 && this.time - this._partySeatT >= cfg.partyAfterSeat &&
          this.friends.every(function (f) { return f.state === 'seated' || f.state === 'dance'; });
        if (this.phaseTime >= cfg.partyTime && seated) this._leaveAll();
        break;
      }
    }
  };

  P._stepPip = function (h) {
    var b = this.pip, cfg = this.cfg, L = this.layout;
    b.x = L.pip.x; b.y = L.pip.y;
    if (b.moodT > 0) { b.moodT -= h; if (b.moodT <= 0) { b.moodT = 0; b.mood = 'idle'; } }
    b.blinkT -= h;
    if (b.blink && b.blinkT <= 0) { b.blink = false; b.blinkT = this._crng.float(cfg.blink[0], cfg.blink[1]); }
    else if (!b.blink && b.blinkT <= 0) { b.blink = true; b.blinkT = cfg.blinkTime; }
    // look: the friend that is moving / was tapped, else the middle of the places
    var lx = b.x + 200, self = this;
    if (this.phase === 'found' && this._foundF) lx = this._foundF.x;
    else if (this._lookAt && this.placeById(this._lookAt)) lx = this.placeById(this._lookAt).x;
    else if (this.places.length) lx = this.places.reduce(function (s, p) { return s + p.x; }, 0) / this.places.length;
    else if (this.friends.length) lx = this.friends.reduce(function (s, f) { return s + f.x; }, 0) / this.friends.length;
    void self;
    b.lookX += (lx - b.lookX) * Math.min(1, h * cfg.lookRate);
    b.look = clamp((b.lookX - b.x) / 500, -1, 1);
  };

  FC.World = World;
})(window.FC = window.FC || {});
