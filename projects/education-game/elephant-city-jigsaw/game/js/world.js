/* Pom's Puzzle Town — PZ.CONFIG + PZ.World (headless, deterministic drag-a-piece jigsaw simulation; DESIGN §2, §5.2)
 *
 * ============================== CONVENTIONS ==============================
 *  Units: logical px (short side 720), seconds, radians, y DOWN, rot > 0 clockwise. Screen space = world space (no camera).
 *  update(dt) runs fixed sub-steps of cfg.step (1/120 s). At the START of every sub-step every moving field is copied into
 *  its `_p` twin; render v = _v + (v − _v)·w.alpha.
 *
 *  BOARD  w.board = { x, y, w, h, r (rest rect = layout.board), ox (px slide offset), tilt (rad, about the board centre),
 *    jig (px, vertical jiggle), shine 0..1, alive 0..1, turn 0..1 (page turn: scale x by cos(turn·π/2) about the left edge),
 *    scene, season 0..3 } + _pox _ptilt _pjig _pturn _pshine _palive.
 *    Draw the board, its SLOTS and the PLACED pieces inside the board transform:
 *      translate(ox, jig) · rotate(tilt about the board centre) · turn scale about the left edge.
 *  SLOTS  w.slots[] = { id, piece, u, v (0..1 of the board), x, y (centre at rest), size, filled, glow 0..1, thing }.
 *  PIECES w.pieces[] = { id, thing, slot, size, state 'drop'|'rest'|'held'|'snap'|'placed'|'home'|'wrong'|'gone', x, y (centre),
 *    rot, sx, sy (squash × the lift scale 1 + 0.12·lift — draw scale(sx, sy) as is), lift 0..1, glow 0..1, dim, count −1..n,
 *    ax, ay, arot (alive offsets), alive 0..1, pop 0..~1.15 (scale; 0 = not visible), homeX, homeY, homeRot }
 *    + _px _py _prot _psx _psy _plift _pax _pay _parot _ppop.  w.pieces is kept in DRAW ORDER every step:
 *    tray pieces (rest / drop) → placed → moving (home / wrong / snap) → the held piece LAST.
 *    Draw: translate(x + ax, y + ay) rotate(rot + arot) scale(sx·pop, sy·pop) → PuzzleArt.drawPiece(thing, size, {glow, lift,
 *    dim, count, alive, season}).  'placed' pieces are drawn in the board transform (see BOARD); skip state 'gone' / pop ≤ 0.
 * ========================================================================
 */
(function (PZ) {
  'use strict';

  var CONFIG = {
    // ---- timing / state machine (s)
    step: 1 / 120, maxFrame: 1.0,
    roundsPerLevel: 4, chapterTimeLimit: 75, chapterMinRounds: 2,   // playtest: 3 → 2 (a slow 3-year-old stays ≤ 8 min)
    shortBudget: [1e9, 30, 48, 62],   // s into the chapter: a round starting later than this is short (2 slots)
    introTime: 2.5, levelDoneTime: 3.6,   // 3.6: the chapter praise with the child's name is heard before the next title
    talkAfterAnswer: 1.6, talkAskTime: 12, talkGlowAfterAsks: 2, talkMaxAsks: 3, talkGiveUp: 12,

    // ---- layout (DESIGN §2; px)
    shortSide: 720, minLong: 960, maxLong: 1600, tallRatio: 1.6, phoneRatio: 1.9,
    groundLand: 14, groundPort: 26,
    bubbleX: 24, bubbleYLand: 18, bubbleMaxW: 560, bubbleRight: 200, bubbleHLand: 134, bubbleYPort: 110, bubbleHPort: 124,
    hudW: 160, hudH: 96, bubbleMinW: 220,
    pomXLand: 118, pomXPort: 104, pomHLand: 230, pomHPort: 200, pomFeet: 4, pomWFrac: 0.62, pomPad: 10,
    boardX0Land: 250, boardRight: 30, boardTopLand: 152, boardGapLand: 30, boardGapPort: 34, boardSide: 24, boardAspect: 1.75,
    boardAspectPort: 0.78, boardAspectPhone: 2.5, boardR: 26, frame: 22, boardCentrePort: 0.5,   // portrait: the board sits in the middle of the free band
    trayBelow: 96, trayBelowPhone: 76, trayX0Port: 230, traySideR: 24, trayLeftPort: 24, groundPad: 8, rowPad: 24, pomClear: 6,
    zoneGap: 44, zonePad: 30, zoneUp: 90, boardPad: 30,                  // piece tops ≥ 44 px below every drop zone
    trayMargin: 22, trayInsetB: 8,                                       // tray pieces stay 22 px inside the shelf sides; ledge ≥ 8 px above the ground line
    item: { 3: 112, 4: 112, 5: 112, 6: 104, 7: 104 }, bigItem: 1.2,   // ≥ 100 css touch targets on iPhone (visual P2-6); × 1.2 when tall (H/W > 1.6) or phone, if everything fits
    itemMin: { 3: 112, 4: 112, 5: 104, 6: 96, 7: 96 },                  // last-resort tier when the base item does not fit (iPad 4:3, 5 tray pieces)
    maxSlots: { 3: 2, 4: 3, 5: 4, 6: 4, 7: 4 }, maxPieces: { 3: 3, 4: 4, 5: 5, 6: 5, 7: 5 },
    slotK: 1.25, slotInset: 0.6, slotScale: 1, spotK: 1.3, spotMaxK: 1.6,
    hitK: 0.6, hitPad: 26, sizeK: { big: 1.25, small: 0.8 },
    busyK: 1.2,                                   // slot placement: a slot fully on busy scenery (tree, window, chalkboard) costs 1.2 × item of spacing score

    // ---- touch
    tapTime: 0.35, tapMovePx: 24,

    // ---- enter: board slide-in + pieces drop into the tray
    boardOmega: 11, boardZeta: 0.68, boardFrom: 80, boardTiltK: 0.00004, boardTiltMax: 0.06,   // ≈ 5 % overshoot, settled in ≈ 0.6 s
    dropDelay: 0.3, dropStagger: 0.12, dropH: 230, dropG: 2600, dropBounce: 0.32, dropMinBounce: 160, dropRot: 0.5, restRot: 0.14,
    enterMin: 1.1, enterTail: 0.12,

    // ---- drag (spring follow + pendulum)
    dragOmega: 28, dragZeta: 0.75, liftPx: 8, liftRate: 12, liftScale: 0.12,
    tiltK: 0.0009, tiltMax: 0.35, tiltOmega: 9, tiltZeta: 0.35,
    rotOmega: 12, rotZeta: 0.4,                  // resting tilt spring (rest / drop)
    squashOmega: 22, squashZeta: 0.35,

    // ---- drops
    snapTime: 0.16, snapSquash: 0.15, boardJig: 2, jigOmega: 30, jigZeta: 0.3,
    homeTime: 0.35, homeTimeMax: 0.6, homePerPx: 0.0006, homeApex: 36, homeSquash: 0.08,
    tapHop: 40, tapHopTime: 0.36,
    wrongShake: 10, wrongShakeTime: 0.4, wrongShakeHz: 7, wrongApex: 120, wrongTime: 0.55, wrongTimeMax: 0.85, wrongSquash: 0.22,
    nearGlow: 2.2, assistFlyTime: 0.6, assistApex: 80,
    askGap: 1.0, countStep: 0.5, countHold: 0.8,

    // ---- alive / turn
    shineTime: 0.7, aliveRamp: 0.4, aliveTime: 2.4, tootAt: 1.2, poofAt: 0.3, poofTime: 0.35, waveStagger: 0.12, turnTime: 0.8,

    // ---- help
    hintAfterMisses: 2, assistAfter: 6, assistAfterYoung: 3, assistMaxAge: 4, hintTime: 3.2, hintCooldown: 6, hintCycle: 1.6,   // ages ≤ 4: assist after 3 (playtest)
    idleTime: 12, idleBackoff: 1.5, idleMax: 30, idleHintFrom: 2,
    wiggleEvery: [2.6, 5], wiggleKick: 0.12, wiggleOmega: 18, wiggleZeta: 0.15,

    // ---- surprises: one round per chapter (round 1 or 2, never the warm-up); the type rotates per chapter
    surpriseRounds: [1, 2], surpriseTypes: ['pigeon', 'bubbles'],
    pigeonAt: [3, 8], pigeonStay: 6, pigeonSpeed: 70, pigeonW: 96, pigeonR: 50, pigeonLandTime: 0.7, pigeonEdge: 70, pigeonFlapTime: 0.9, pigeonHop: 60, pigeonTimes: 2, pigeonGap: 5,   // the pigeon walks on top of the board frame
    bubblesAt: [3, 7], bubbleN: [4, 6], bubbleGap: 0.45, bubbleR: [24, 34], bubbleRise: [45, 70], bubbleWob: 14, bubblePad: 12, bubblePopTime: 0.25,
    bubbleWaves: 2, bubbleWaveGap: 6,

    // ---- Pom
    moodTime: { happy: 0.9, cheer: 1.6, oops: 0.8, think: 1.4, talk: 1.0, wave: 1.4, point: 1.2, toot: 1.1 },
    hopTime: 0.42, lookRate: 6, blink: [2.2, 5], blinkTime: 0.13
  };
  PZ.CONFIG = CONFIG;

  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hyp(x, y) { return Math.sqrt(x * x + y * y); }
  function lerp(a, b, u) { return a + (b - a) * u; }
  function smooth(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  function easeOutBack(u) { var c1 = 1.70158, c3 = c1 + 1, v = u - 1; return 1 + c3 * v * v * v + c1 * v * v; }
  function merge(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; if (b) for (k in b) o[k] = b[k]; return o; }
  function insOf(ins) { return { top: +(ins && ins.top) || 0, right: +(ins && ins.right) || 0, bottom: +(ins && ins.bottom) || 0, left: +(ins && ins.left) || 0 }; }
  function keepBoxes(hk) {
    var a = Array.isArray(hk) ? hk : hk ? [hk] : [], out = [];
    for (var i = 0; i < a.length; i++) { var b = a[i]; if (b && b.w > 0 && b.h > 0) out.push({ x: +b.x, y: +b.y, w: +b.w, h: +b.h }); }
    return out;
  }
  function inBox(b, x, y, pad) { pad = pad || 0; return x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad; }
  /** Initial velocity that gives a damped spring (ω, ζ) released from 0 a first peak of `peak`. */
  function kickFor(peak, w, z) { var s = Math.sqrt(1 - z * z); return peak * w * Math.exp(z / s * Math.atan2(s, z)); }
  function spring(o, k, kv, target, w, z, h) { o[kv] += (w * w * (target - o[k]) - 2 * z * w * o[kv]) * h; o[k] += o[kv] * h; }
  /* Constant-acceleration (parabolic) path from (x0, y0) to (x1, y1) in T s whose apex is H px above the higher end (never
   * above minY): √g = (√(2A0) + √(2A1)) / T, vy0 = −√(2 g A0), ay = g; horizontal: vx0 given, ax = 2(x1 − x0 − vx0 T)/T². */
  function arc(x0, y0, x1, y1, T, H, vx0, minY) {
    var lo = Math.min(y0, y1), ya = Math.min(lo, Math.max(lo - H, minY === undefined ? -1e9 : minY)), A0 = y0 - ya, A1 = y1 - ya;
    var sg = (Math.sqrt(2 * A0) + Math.sqrt(2 * A1)) / T, g = sg * sg;
    return { x0: x0, y0: y0, x1: x1, y1: y1, vx0: vx0 || 0, vy0: -Math.sqrt(2 * g * A0), ax: 2 * (x1 - x0 - (vx0 || 0) * T) / (T * T), ay: g, T: T, t: 0, ya: ya };
  }
  function arcAt(f, t) { return { x: f.x0 + f.vx0 * t + 0.5 * f.ax * t * t, y: f.y0 + f.vy0 * t + 0.5 * f.ay * t * t }; }

  /** DESIGN §2 short-side rule: CSS viewport → logical W×H. */
  function logicalSize(cssW, cssH, cfg) {
    cfg = cfg || CONFIG;
    var S = cfg.shortSide, aspect = cssW / Math.max(1, cssH);
    if (cssW >= cssH) return { W: clamp(Math.round(S * aspect), cfg.minLong, cfg.maxLong), H: S };
    return { W: S, H: clamp(Math.round(S / aspect), cfg.minLong, cfg.maxLong) };
  }
  function ageKey(age) { return clamp(Math.round(+age || 4), 3, 7); }
  /** The biggest piece a round can hold at this age (the size topic's big piece at ages ≤ 4). */
  function maxSizeFor(cfg, age, item) { return ageKey(age) <= 4 ? item * cfg.sizeK.big : item; }

  /* ---------------------------------------------------------------- slot placement (DESIGN §2)
   * n slot centres inside the board rect inset by max(0.6 item, size/2 + 6), spread with farthest-point sampling from a jittered
   * 9 × 6 grid, ≥ 1.25 × item (× the pair's mean size) apart. Deterministic per seed. → { pts: [{x, y}], score } (score ≥ 0 ⇔
   * every pair is far enough). */
  function slotInset(cfg, item, sizes) { return Math.max(cfg.slotInset * item, Math.max.apply(null, sizes) / 2 + 6); }
  /** Busy-scenery penalty of a slot at (x, y): Σ overlap(slot box, rect) / slot area × busyK × item. */
  function busyPen(busy, x, y, size, item, cfg) {
    if (!busy || !busy.length) return 0;
    var h = size / 2, pen = 0;
    for (var i = 0; i < busy.length; i++) {
      var r = busy[i], ow = Math.min(x + h, r.x + r.w) - Math.max(x - h, r.x), oh = Math.min(y + h, r.y + r.h) - Math.max(y - h, r.y);
      if (ow > 0 && oh > 0) pen += ow * oh / (size * size);
    }
    return Math.min(1, pen) * (cfg.busyK || 0) * item;
  }
  function placeSlots(B, sizes, item, cfg, seed, busy) {
    var rng = new PZ.RNG((PZ.RNG.hash(seed || 1) ^ 0x3a1f5c2b) >>> 0), n = sizes.length, m = slotInset(cfg, item, sizes);
    var x0 = B.x + m, x1 = B.x + B.w - m, y0 = B.y + m, y1 = B.y + B.h - m, i, j, k;
    if (x1 < x0) x0 = x1 = B.x + B.w / 2;
    if (y1 < y0) y0 = y1 = B.y + B.h / 2;
    var GX = 9, GY = 6, cand = [];
    for (i = 0; i < GX; i++) for (j = 0; j < GY; j++) {
      var u = (i + 0.5 + rng.float(-0.35, 0.35)) / GX, v = (j + 0.5 + rng.float(-0.35, 0.35)) / GY;
      cand.push({ x: lerp(x0, x1, clamp((u - 0.5 / GX) * GX / (GX - 1), 0, 1)), y: lerp(y0, y1, clamp((v - 0.5 / GY) * GY / (GY - 1), 0, 1)) });
    }
    function need(a, b) { return cfg.slotK * (sizes[a] + sizes[b]) / 2; }
    var best = null, bestScore = -1e9, bestRank = -1e18;
    for (var s = 0; s < 14 || (bestScore < 0 && s < 90); s++) {   // more restarts only when no spaced set was found yet
      var pts = [cand[rng.int(0, cand.length - 1)]];
      for (k = 1; k < n; k++) {
        var bp = null, bs = -1e9;
        for (i = 0; i < cand.length; i++) {
          var c = cand[i], sc = 1e9;
          for (j = 0; j < pts.length; j++) sc = Math.min(sc, hyp(c.x - pts[j].x, c.y - pts[j].y) - need(j, k));
          if (busy) sc = Math.min(sc, 0.6 * item) - busyPen(busy, c.x, c.y, sizes[k], item, cfg);   // far enough → prefer open sky / grass / road
          sc += rng.float(0, 6);   // a little variety between equally good points
          if (sc > bs) { bs = sc; bp = c; }
        }
        pts.push(bp);
      }
      var score = setScore(pts, need), rank = score;
      if (busy) {   // every pair far enough first; then the least busy set
        rank = score >= 0 ? 1e6 + Math.min(score, 0.6 * item) : score;
        for (k = 0; k < n; k++) rank -= busyPen(busy, pts[k].x, pts[k].y, sizes[k], item, cfg);
      }
      if (best === null || rank > bestRank + 1e-9) { bestRank = rank; bestScore = score; best = pts; }
    }
    if (bestScore < 0 && n > 1) {   // a tight board: try the regular arrangements (1 … n rows, corners first) — the fits check's promise
      for (var nr = 1; nr <= n; nr++) {
        var nc = Math.ceil(n / nr), reg = [];
        for (k = 0; k < n; k++) {
          var ri = Math.floor(k / nc), ci = k % nc, cr = ri === nr - 1 ? n - nc * (nr - 1) : nc;
          reg.push({ x: cr > 1 ? lerp(x0, x1, ci / (cr - 1)) : (x0 + x1) / 2, y: nr > 1 ? lerp(y0, y1, ri / (nr - 1)) : (y0 + y1) / 2 });
        }
        var rs = setScore(reg, need);
        if (rs > bestScore + 1e-9) { bestScore = rs; best = reg; }
      }
    }
    return { pts: best.map(function (p) { return { x: p.x, y: p.y }; }), score: bestScore };
  }
  function setScore(pts, need) {
    var sc = 1e9;
    for (var a = 0; a < pts.length; a++) for (var b = 0; b < a; b++) sc = Math.min(sc, hyp(pts[a].x - pts[b].x, pts[a].y - pts[b].y) - need(b, a));
    return pts.length < 2 ? 1e9 : sc;
  }

  /* ---------------------------------------------------------------- tray spots
   * Rows (top = nearest the board first) hold pieces bottom-aligned on their ledge (row.y). For n pieces: the fewest rows
   * counted from the BOTTOM (nearest the child's thumb; no empty shelf above a full one) that hold n, shares in proportion to
   * capacity, spread evenly (spacing clamp(span / (c − 1), 1.3, 1.6) × item, never below 1.3 × the round's biggest piece) and
   * centred; the row ends move in by up to trayMargin (as far as the spacing allows) so tilted / wide pieces stay inside the
   * shelf's sides. → [{x, y (ledge), row}] (row = index into rows) */
  function rowCap(r, sp, size) { var span = r.x1 - r.x0 - size; return span < 0 ? 0 : Math.floor(span / sp + 1e-9) + 1; }
  function traySpots(L, n, maxSize, cfg) {
    var rows = L.tray.rows, item = L.item, ms = Math.max(item, maxSize || item), sp = cfg.spotK * ms, out = [], k, q;
    var caps = rows.map(function (r) { return rowCap(r, sp, ms); }), sum = 0, idx = [];
    for (k = rows.length - 1; k >= 0; k--) { sum += caps[k]; idx.unshift(k); if (sum >= n) break; }
    var squeeze = sum < n;
    if (squeeze) {   // an odd viewport (never an Apple device): every row takes a share by width, the spacing squeezes
      idx = rows.map(function (r, i) { return i; }); caps = rows.map(function () { return n; });
    }
    var used = idx.length, share = [], left, wsum = 0, wOf = function (j) { return squeeze ? rows[j].x1 - rows[j].x0 : caps[j]; };
    for (q = 0; q < used; q++) wsum += wOf(idx[q]);
    for (q = 0; q < used; q++) share[q] = Math.max(1, Math.min(caps[idx[q]], Math.floor(n * wOf(idx[q]) / wsum)));
    left = n - share.reduce(function (a, b) { return a + b; }, 0);
    for (k = 0; left > 0 && k < used * 8; k++) { q = used - 1 - (k % used); if (share[q] < caps[idx[q]]) { share[q]++; left--; } }   // extra pieces go to the lower rows first
    for (q = 0; left < 0 && q < used; q++) while (left < 0 && share[q] > 1) { share[q]--; left++; }
    for (q = 0; q < used; q++) {
      var r = rows[idx[q]], c = share[q], span = r.x1 - r.x0 - ms;
      var mg = clamp(c > 1 ? (span - (c - 1) * sp) / 2 : span / 2, 0, cfg.trayMargin || 0);   // never below the 1.3 × spacing
      var lo = r.x0 + ms / 2 + mg, hi = Math.max(lo, r.x1 - ms / 2 - mg);
      if (hi <= lo) lo = hi = (r.x0 + r.x1) / 2;
      var g = c > 1 ? Math.min(cfg.spotMaxK * ms, (hi - lo) / (c - 1)) : 0;
      var cx = (lo + hi) / 2;
      for (var i = 0; i < c; i++) out.push({ x: cx + (i - (c - 1) / 2) * g, y: r.y, row: idx[q] });
    }
    return out;
  }

  /**
   * DESIGN §2 layout. Tries the big item (× 1.2 on tall / phone screens) first and falls back to the base item when the board
   * would not hold maxSlots[age] at 1.25 × item or the tray would not hold maxPieces[age] at 1.3 × item.
   */
  function computeLayout(W, H, ins, cfg, age, hudKeep) {
    var portrait = H > W, phone = (portrait ? H / W : W / H) > cfg.phoneRatio, tall = H / W > cfg.tallRatio;
    var base = cfg.item[ageKey(age)], ks = (tall || phone) ? [cfg.bigItem, 1] : [1], L = null;
    var lo = cfg.itemMin && cfg.itemMin[ageKey(age)];
    if (lo && lo < base) ks.push(lo / base);
    for (var t = 0; t < ks.length; t++) {
      L = layoutTier(W, H, ins, cfg, age, hudKeep, Math.round(base * ks[t]));
      L.phone = phone;
      if (L.fits) break;
    }
    return L;
  }
  /** The HUD's measured box among the hudKeep boxes (the one in the right half; main.js passes [HUD, bubble]). */
  function hudBox(hk, W) { var best = null; for (var i = 0; i < hk.length; i++) { var b = hk[i]; if (b.x + b.w / 2 > W / 2 && (!best || b.y + b.h > best.y + best.h)) best = b; } return best; }
  function layoutTier(W, H, ins, cfg, age, hudKeep, item) {
    ins = insOf(ins);
    var portrait = H > W, tall = H / W > cfg.tallRatio, i, a = ageKey(age);
    var groundY = H - ins.bottom - (portrait ? cfg.groundPort : cfg.groundLand);
    var hk = keepBoxes(hudKeep), hb = hudBox(hk, W);
    var bx = ins.left + cfg.bubbleX, bubble;
    if (portrait) bubble = { x: bx, y: ins.top + cfg.bubbleYPort, w: W - bx - ins.right - cfg.bubbleX, h: cfg.bubbleHPort };
    else bubble = { x: bx, y: ins.top + cfg.bubbleYLand, w: Math.min(cfg.bubbleMaxW, W - ins.right - cfg.bubbleRight - bx), h: cfg.bubbleHLand };
    if (hb && bubble.x + bubble.w > hb.x - 10 && bubble.y < hb.y + hb.h) {   // the measured HUD: narrower beside it, else below
      var room = hb.x - 12 - bubble.x;
      if (!portrait && room >= cfg.bubbleMinW) bubble.w = room;
      else bubble.y = Math.max(bubble.y, hb.y + hb.h + 8);
    }
    bubble.w = Math.max(0, bubble.w);
    var hud = { x: W - ins.right - cfg.hudW, y: 0, w: cfg.hudW + ins.right, h: ins.top + cfg.hudH };
    var ph = portrait ? cfg.pomHPort : cfg.pomHLand;
    var pom = { x: ins.left + (portrait ? cfg.pomXPort : cfg.pomXLand), y: groundY - cfg.pomFeet, h: ph, w: cfg.pomWFrac * ph };
    var pomBox = { x: pom.x - pom.w / 2 - cfg.pomPad, y: pom.y - ph - cfg.pomPad, w: pom.w + 2 * cfg.pomPad, h: ph + 2 * cfg.pomPad };
    var maxSize = maxSizeFor(cfg, a, item), sp = cfg.spotK * item, nMax = cfg.maxPieces[a];
    var keepTop = 0;   // measured top boxes the board must stay below
    hk.forEach(function (b) { if (b.y + b.h < H / 2) keepTop = Math.max(keepTop, b.y + b.h); });
    var tray, board, rows = [], x0, x1, by, bb;
    if (!portrait) {
      var phoneL = W / H > cfg.phoneRatio, ledgeMax = groundY - (cfg.trayInsetB || 0);   // the ledge stays above the home indicator
      // phones: a shallower tray band (bigger board); the tray top moves up when the ledge would sink below ledgeMax, so piece tops
      // always stay zoneGap below the board (and its drop zones)
      var ty = Math.min(H - ins.bottom - item - (phoneL ? cfg.trayBelowPhone : cfg.trayBelow), ledgeMax - cfg.zoneGap - maxSize);
      x0 = ins.left + cfg.boardX0Land; x1 = W - ins.right - cfg.boardRight;
      rows.push({ x0: x0, x1: x1, y: ty + cfg.zoneGap + maxSize });
      tray = { x: x0, y: ty, w: x1 - x0, h: H - ins.bottom - ty };
      by = Math.max(ins.top + cfg.boardTopLand, bubble.y + bubble.h + cfg.boardGapLand, keepTop + 12);
      bb = ty - cfg.boardPad;
      // phones in landscape: the board may grow wider (2.2 : 1) so the bigger pieces still fit the short board
      var bh = Math.max(40, bb - by), bw = Math.min(x1 - x0, (W / H > cfg.phoneRatio ? cfg.boardAspectPhone : cfg.boardAspect) * bh);
      board = { x: (x0 + x1) / 2 - bw / 2, y: by, w: bw, h: bh, r: cfg.boardR };
    } else {
      var rx0 = ins.left + cfg.trayX0Port, rx1 = W - ins.right - cfg.traySideR, fx0 = ins.left + cfg.trayLeftPort;
      var gap = Math.max(sp, maxSize + cfg.rowPad), pomTop = pomBox.y - cfg.pomClear;
      var r0 = { x0: rx0, x1: rx1, y: groundY - cfg.groundPad }, have = rowCap(r0, sp, item);
      rows.push(r0);
      while (have < nMax && rows.length < 4) {
        var prev = rows[rows.length - 1], ly = prev.y - gap;
        var beside = ly > pomTop;   // this row still reaches Pom's height band
        var rA = { x0: rx0, x1: rx1, y: ly }, rB = { x0: fx0, x1: rx1, y: Math.min(ly, pomTop) };
        var r = beside && have + rowCap(rA, sp, item) >= nMax ? rA : beside ? rB : { x0: fx0, x1: rx1, y: ly };
        rows.push(r); have += rowCap(r, sp, item);
      }
      rows.reverse();   // top (nearest the board) first
      var topLedge = rows[0].y, ty2 = topLedge - maxSize - cfg.zoneGap;
      var tx0 = Math.min.apply(null, rows.map(function (q) { return q.x0; }));
      tray = { x: tx0, y: ty2, w: rx1 - tx0, h: H - ins.bottom - ty2 };
      by = Math.max(bubble.y + bubble.h + cfg.boardGapPort, keepTop + 12);
      bb = Math.min(ty2 - cfg.boardPad, pomBox.y - cfg.frame - 8);   // the full-width board (+ frame) stays above Pom's head
      var bwP = W - ins.left - ins.right - 2 * cfg.boardSide, space = Math.max(40, bb - by), bhP = Math.min(cfg.boardAspectPort * bwP, space);
      board = { x: ins.left + cfg.boardSide, y: by + (space - bhP) * cfg.boardCentrePort, w: bwP, h: bhP, r: cfg.boardR };
    }
    tray.rows = rows;
    var L = { W: W, H: H, ins: ins, portrait: portrait, tall: tall, phone: false, groundY: groundY, bubble: bubble, hud: hud, pom: pom, pomBox: pomBox,
      board: board, frame: cfg.frame, tray: tray, item: item, maxSize: maxSize, slotScale: cfg.slotScale, hitR: cfg.hitK * item + cfg.hitPad,
      safe: { x: ins.left, y: ins.top, w: W - ins.left - ins.right, h: H - ins.bottom - ins.top } };
    L.keep = [{ x: bubble.x, y: bubble.y, w: bubble.w, h: bubble.h, kind: 'bubble' }, { x: hud.x, y: hud.y, w: hud.w, h: hud.h, kind: 'hud' }];
    hk.forEach(function (b) { b.kind = 'hudKeep'; L.keep.push(b); });
    tray.spots = traySpots(L, nMax, item, cfg).map(function (s) { return { x: s.x, y: s.y - item / 2, row: s.row }; });   // resting centres
    // does everything fit? the board holds maxSlots at 1.25 × item, the tray maxPieces at 1.3 × item
    var cap = rows.reduce(function (s, q) { return s + rowCap(q, sp, item); }, 0);
    var sizes = []; for (i = 0; i < cfg.maxSlots[a]; i++) sizes.push(item);
    var ps = placeSlots(board, sizes, item, cfg, 1);
    for (var sd = 2; sd <= 6 && ps.score >= 0; sd++) { var q2 = placeSlots(board, sizes, item, cfg, sd); if (q2.score < ps.score) ps = q2; }   // any round seed must fit
    var sizeOk = a > 4 || placeSlots(board, [maxSize, item * cfg.sizeK.small], item, cfg, 1).score >= 0;
    L.trayCap = cap; L.slotScore = ps.score;
    L.fits = cap >= nMax && ps.score >= 0 && sizeOk && board.h >= 2 * slotInset(cfg, item, [item]) - 1;
    return L;
  }

  // ------------------------------------------------------------------ World
  function World(opts) {
    opts = opts || {};
    this.cfg = merge(CONFIG, opts.config);
    this.seed = opts.seed !== undefined ? opts.seed : 1;
    this.rng = new PZ.RNG(this.seed);
    this._crng = new PZ.RNG((PZ.RNG.hash(this.seed) ^ 0x51ed27) >>> 0);   // cosmetic randomness (tilts, blinks, wiggles, surprises)
    this.age = PZ.Content.ageOf(opts.age !== undefined ? opts.age : 4);
    this.lang = opts.lang === 'vi' ? 'vi' : 'en';
    this._pendingAge = this.age; this._pendingLang = this.lang;
    this.state = 'menu'; this.phase = null;
    this.level = 0; this.levels = []; this.topic = null; this.weather = 0;
    this.round = 0; this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.stars = 0; this.levelStars = 0; this.roundStars = 0; this.misses = 0; this.stepMisses = 0; this.streak = 0;
    this.time = 0; this.stateTime = 0; this.phaseTime = 0; this.alpha = 0; this._acc = 0;
    this.cur = null; this.step = -1; this.talk = null; this.talkAnswered = null;
    this.pieces = []; this.slots = []; this.pictures = []; this.bubbles = []; this.pigeon = null; this.hintHand = null;
    this.board = { x: 0, y: 0, w: 0, h: 0, r: 26, ox: 0, _pox: 0, vox: 0, tilt: 0, _ptilt: 0, jig: 0, _pjig: 0, vjig: 0, shine: 0, _pshine: 0,
      alive: 0, _palive: 0, turn: 0, _pturn: 0, scene: 'street', season: 0, show: false };
    this.pom = { x: 0, y: 0, h: 200, mood: 'idle', moodT: 0, blinkT: 3, blink: false, look: 0, lookX: 0, hop: 0, _phop: 0, _hopT: -1 };
    this.finger = { x: 0, y: 0, down: false };
    this.hudKeep = opts.hudKeep || null; this.lastTopics = null; this.surprise = null; this._surpriseOff = 0; this._surpriseRound = 1;
    this.magnet = false;
    this.events = []; this.sessions = 0;
    this._idleN = 0; this._idleT = 0; this._idleGap = this.cfg.idleTime; this._lastHintT = -1e9; this.levelStartTime = 0;
    this._talkAskT = 0; this._talkAsks = 0; this._press = null; this.held = null; this.tapMoveMin = this.cfg.tapMovePx;
    this._usedKeys = []; this._prevAns = null; this._prevAnsRun = 0; this._stepDone = false; this._waitAsk = -1; this._noProg = 0;
    this._view = null; this._vp = null; this._wiggleT = 3;
    this.setViewport(opts.width || 1280, opts.height || 720, opts.ins || null);
  }
  World.logicalSize = logicalSize;
  World.computeLayout = function (W, H, ins, cfg, age, hudKeep) { return computeLayout(W, H, ins, merge(CONFIG, cfg), age === undefined ? 4 : age, hudKeep); };
  World.placeSlots = function (board, sizes, item, cfg, seed) { return placeSlots(board, sizes, item, merge(CONFIG, cfg), seed); };
  World.traySpots = function (L, n, maxSize, cfg) { return traySpots(L, n, maxSize, merge(CONFIG, cfg)); };
  World.kickFor = kickFor;
  World.arc = arc;

  var P = World.prototype;
  /** true while a drop of the asked piece would be judged right now (round, play phase, the step open, nothing snapping). */
  Object.defineProperty(P, 'interactive', { get: function () { return this.state === 'round' && this.phase === 'play' && !this._stepDone && !this._snapping(); } });
  Object.defineProperty(P, 'stepInfo', { get: function () { return this.cur && this.step >= 0 ? this.cur.steps[this.step] || null : null; } });
  P._emit = function (e) { this.events.push(e); };
  P.drainEvents = function () { var e = this.events; this.events = []; return e; };
  P.setAge = function (a) { this._pendingAge = PZ.Content.ageOf(a); };
  P.setLang = function (l) { this._pendingLang = l === 'vi' ? 'vi' : 'en'; };
  P._setState = function (s) { this.state = s; this.stateTime = 0; };
  P._setPhase = function (p) { this.phase = p; this.phaseTime = 0; };
  P._mood = function (m, t) { this.pom.mood = m; this.pom.moodT = t || this.cfg.moodTime[m] || 1; };
  P._hop = function () { this.pom._hopT = 0; };
  P.skipTalk = function () { if (this.state === 'talk') this._levelDone(); };
  P.pieceById = function (id) { for (var i = 0; i < this.pieces.length; i++) if (this.pieces[i].id === id) return this.pieces[i]; return null; };
  P.slotById = function (id) { for (var i = 0; i < this.slots.length; i++) if (this.slots[i].id === id) return this.slots[i]; return null; };
  P._tapMove = function () { return Math.max(this.cfg.tapMovePx, +this.tapMoveMin || 0); };
  P._pomMouth = function () { var B = this.layout.pom; return { x: B.x + 0.18 * B.h, y: B.y - 0.62 * B.h }; };
  P._assistAfter = function () { return this.age <= this.cfg.assistMaxAge ? this.cfg.assistAfterYoung : this.cfg.assistAfter; };
  P._snapping = function () { for (var i = 0; i < this.pieces.length; i++) if (this.pieces[i].state === 'snap') return true; return false; };
  P._grabbable = function (p) { return p.state === 'rest' || p.state === 'home'; };

  /** The current question {promptKey, params, mode, step, nameKind, nameValue, need} (enter / play), else null. */
  P.prompt = function () {
    if (this.state !== 'round' || !this.cur || (this.phase !== 'play' && this.phase !== 'enter')) return null;
    var i = Math.max(0, this.step), s = this.cur.steps[i];
    if (!s) return null;
    return { promptKey: s.promptKey, params: s.params, mode: s.mode, step: i, nameKind: s.nameKind, nameValue: s.nameValue, need: s.need };
  };

  // ---------------------------------------------------------------- geometry + test hooks (logical px)
  P._hitR = function (p) { return this.cfg.hitK * p.size + this.cfg.hitPad; };
  /** The piece's hit circle {x, y, r} (where it is now). */
  P.pieceHit = function (id) { var p = this.pieceById(id); return p ? { x: p.x, y: p.y, r: this._hitR(p) } : null; };
  /** The grabbable tray piece under (x, y): inside its hit circle, the nearest centre wins. */
  P._pieceAt = function (x, y) {
    var best = null, bd = 1e9;
    for (var i = 0; i < this.pieces.length; i++) {
      var p = this.pieces[i];
      if (!this._grabbable(p)) continue;
      var d = hyp(x - p.x, y - p.y);
      if (d <= this._hitR(p) && d < bd) { bd = d; best = p; }
    }
    return best;
  };
  /** The piece's visible box (PuzzleArt.pieceBox when loaded, else size × size). */
  P._box = function (thing, size) {
    var A = PZ.PuzzleArt;
    if (A && typeof A.pieceBox === 'function') { try { var b = A.pieceBox(thing, size); if (b && b.w > 0 && b.h > 0) return { w: Math.min(size, b.w), h: Math.min(size, b.h) }; } catch (e) { /* headless */ } }
    return { w: size, h: size };
  };
  /** Drop zone of a slot: the piece box around the slot centre, +30 px left / right / down and +90 px up. */
  P.slotZone = function (id) {
    var s = this.slotById(id), c = this.cfg;
    if (!s) return null;
    var b = this._box(s.thing, s.size);
    return { x: s.x - b.w / 2 - c.zonePad, y: s.y - b.h / 2 - c.zoneUp, w: b.w + 2 * c.zonePad, h: b.h + c.zoneUp + c.zonePad };
  };
  P.boardZone = function () { var B = this.layout.board, p = this.cfg.boardPad; return { x: B.x - p, y: B.y - p, w: B.w + 2 * p, h: B.h + 2 * p }; };
  /** A logical point inside the slot's drop zone (its centre). */
  P.slotDrop = function (id) { var s = this.slotById(id); return s ? { x: s.x, y: s.y } : null; };
  P._pomBox = function () { return this.layout.pomBox; };
  /** Pom's tap box: {x, y (CENTRE), w, h}. */
  P.pomHit = function () { var b = this._pomBox(); return { x: b.x + b.w / 2, y: b.y + b.h / 2, w: b.w, h: b.h }; };
  P._pigeonC = function () { var g = this.pigeon; return g ? { x: g.x, y: g.y - 0.4 * g.size * 0.875, r: this.cfg.pigeonR } : null; };
  /** The pigeon's tap circle while it can be tapped (walking / pecking on its ledge on top of the board frame), else null.
   *  It never stands over the tray, so a tray piece can never hide it. */
  P.pigeonHit = function () {
    var g = this.pigeon, L = this.layout;
    if (!g || g.state !== 'walk' || g.x < L.ins.left + 30 || g.x > L.W - L.ins.right - 30) return null;
    return this._pigeonC();
  };
  /** The first bubble that can be tapped (rising, fully on screen, clear of the HUD / speech bubble and of tray pieces). */
  P.bubbleHit = function () {
    var L = this.layout;
    for (var i = 0; i < this.bubbles.length; i++) {
      var b = this.bubbles[i];
      if (b.state !== 'rise' || b.y - b.r < L.ins.top + 4 || b.y + b.r > L.H) continue;
      var bad = false;
      for (var k = 0; k < L.keep.length; k++) if (inBox(L.keep[k], b.x, b.y, b.r)) bad = true;
      if (bad || this._pieceAt(b.x, b.y)) continue;
      return { x: b.x, y: b.y, r: b.r + this.cfg.bubblePad, i: i };
    }
    return null;
  };
  /** What to drag next for the right answer: {piece, slot} | null. */
  P.answer = function () {
    if (!this.interactive) return null;
    var p = this._askedPiece();
    return p ? { piece: p.id, slot: p.slot } : null;
  };
  /** The asked piece (find: the target; findAll: the first unplaced target, the held one first). */
  P._askedPiece = function () {
    var s = this.stepInfo;
    if (!s) return null;
    var h = this.held && this.pieceById(this.held);
    if (h && s.targets.indexOf(h.id) >= 0) return h;
    for (var i = 0; i < s.targets.length; i++) { var p = this.pieceById(s.targets[i]); if (p && p.state !== 'placed' && p.state !== 'snap') return p; }
    return null;
  };
  P._isAsked = function (p) { var s = this.stepInfo; return !!s && s.targets.indexOf(p.id) >= 0 && p.state !== 'placed'; };

  // ---------------------------------------------------------------- viewport
  P.setViewport = function (W, H, ins) { this._view = { W: W, H: H, ins: insOf(ins) }; this._relayout(false); };
  P._relayout = function (force) {
    var v = this._view;
    var key = v.W + 'x' + v.H + ':' + JSON.stringify(v.ins) + ':' + this.age + ':' + JSON.stringify(this.hudKeep || null);
    if (key === this._vp && !force) return false;
    var had = !!this.layout;
    this._vp = key;
    this.layout = computeLayout(v.W, v.H, v.ins, this.cfg, this.age, this.hudKeep);
    this.layout.hudKeep = keepBoxes(this.hudKeep);
    var B = this.layout.pom, Bd = this.layout.board;
    this.pom.x = B.x; this.pom.y = B.y; this.pom.h = B.h;
    this.board.x = Bd.x; this.board.y = Bd.y; this.board.w = Bd.w; this.board.h = Bd.h; this.board.r = Bd.r;
    if (had) this._snapAll();
    return true;
  };
  /** Rotation / resize mid-round (DESIGN §5.2): cancel the drag (the held piece glides home), slots re-placed from (u, v), tray
   *  pieces snap to their new spots, placed pieces follow their slots, snapping pieces land, the pigeon / bubbles move. */
  P._snapAll = function () {
    var i, L = this.layout;
    this._press = null;
    if (this.cur && this.slots.length) {
      this._placeSlotsFromUV();
      this._layoutPieces();
      for (i = 0; i < this.pieces.length; i++) {
        var p = this.pieces[i];
        if (p.state === 'snap') this._land(p);
        if (p.state === 'placed') { var s = this.slotById(p.slot); p.x = p._px = s.x; p.y = p._py = s.y; }
        else if (p.state === 'held') { p.x = clamp(p.x, 0, L.W); p.y = clamp(p.y, 0, L.H); }
        else if (p.state !== 'gone' && p.state !== 'drop') this._setRest(p);
        else if (p.state === 'drop') { p.x = p._px = p.homeX; }
      }
      if (this.held) this.cancelDrag();
    }
    this.bubbles = [];
    if (this.pigeon) {
      var g = this.pigeon; this._pigeonPlan();
      if (g.state === 'walk' || g.state === 'flap') { g.x = g._px = clamp(g.x, g.lo, g.hi); g.y = g._py = this._perch().y; }
    }
    if (this.hintHand) this._hintGeo();
  };
  /** Slot centres from the stored (u, v); if the new board brings two slots too close, re-place them with the round seed. */
  P._placeSlotsFromUV = function () {
    var B = this.layout.board, cfg = this.cfg, item = this.layout.item, sizes = this.slots.map(function (s) { return s.size; }), i;
    for (i = 0; i < this.slots.length; i++) this.slots[i].size = this._sizeOf(this.slots[i].thing);
    sizes = this.slots.map(function (s) { return s.size; });
    var m = slotInset(cfg, item, sizes), pts = this.slots.map(function (s) {
      return { x: clamp(B.x + s.u * B.w, B.x + m, Math.max(B.x + m, B.x + B.w - m)), y: clamp(B.y + s.v * B.h, B.y + m, Math.max(B.y + m, B.y + B.h - m)) };
    });
    var need = function (a, b) { return cfg.slotK * (sizes[a] + sizes[b]) / 2; };
    if (setScore(pts, need) < 0) { pts = placeSlots(B, sizes, item, cfg, this.cur.seed, this._busy()).pts; }
    for (i = 0; i < this.slots.length; i++) {
      var s = this.slots[i];
      s.x = pts[i].x; s.y = pts[i].y; s.u = (s.x - B.x) / B.w; s.v = (s.y - B.y) / B.h;
    }
  };
  /** Busy scenery of this round's picture (trees, windows, the chalkboard) in logical px, or null (headless / no art). */
  P._busy = function () {
    var A = PZ.PuzzleArt, Bd = this.layout.board, B = this.board;
    if (!A || typeof A.sceneBusy !== 'function' || !this.cur) return null;
    try {
      return A.sceneBusy(this.cur.scene, Bd.w, Bd.h, { flip: !!B.flip }).map(function (r) { return { x: Bd.x + r.x, y: Bd.y + r.y, w: r.w, h: r.h }; });
    } catch (e) { return null; }
  };
  P._sizeOf = function (thing) { return this.layout.item * this.cfg.slotScale * (thing.size ? this.cfg.sizeK[thing.size] || 1 : 1); };
  /** Tray homes (bottom-aligned on the row ledges, resting tilt ±8°) for every piece of the round. */
  P._layoutPieces = function () {
    var self = this, L = this.layout, maxS = 0;
    this.pieces.forEach(function (p) { p.size = self._sizeOf(p.thing); maxS = Math.max(maxS, p.size); });
    var sp = traySpots(L, this.pieces.length, maxS, this.cfg), used = [];
    this.pieces.forEach(function (p, k) {
      var b = self._box(p.thing, p.size), s = sp[k];
      p.homeX = s.x; p.homeY = s.y - b.h / 2; p.boxH = b.h; p.boxW = b.w; p.spot = k;
      if (used.indexOf(s.row) < 0) used.push(s.row);
    });
    // render draws only the shelves this round uses (no empty wooden shelf) and the dimples under this round's spots
    L.tray.used = used; L.tray.roundSpots = sp.map(function (s) { return { x: s.x, y: s.y - L.item / 2, row: s.row }; });
  };
  P._setRest = function (p) {
    p.state = 'rest'; p.f = null; p.x = p._px = p.homeX; p.y = p._py = p.homeY; p.vx = p.vy = 0; p.rot = p._prot = p.homeRot; p.vr = 0;
    p.lift = 0; p.q = 0; p.qv = 0; this._scale(p);
  };

  // ---------------------------------------------------------------- session flow
  P.newSession = function (opts) {
    this.age = this._pendingAge; this.lang = this._pendingLang;
    this._relayout(false);
    this.sessions++;
    this._clearRound(); this.cur = null; this.state = 'menu';
    var last = (opts && opts.lastTopics) || this.lastTopics || null;
    this.levels = PZ.Content.topicsFor(this.age, this.rng, last);
    this._surpriseOff = this.rng.int(0, Math.max(0, this.cfg.surpriseTypes.length - 1));
    this.stars = 0; this.pictures = []; this._prevAns = null; this._prevAnsRun = 0;
    this.weather = 0;
    this._emit({ type: 'session', levels: this.levels.slice() });
    this.startLevel(0);
  };
  P._clearRound = function () {
    this.pieces = []; this.slots = []; this.step = -1; this._press = null; this.held = null; this.finger.down = false;
    this.pigeon = null; this.bubbles = []; this.hintHand = null; this._stepDone = false; this._waitAsk = -1; this.magnet = false;
    this._pigeonNext = -1; this._pigeonTimes = 0; this._bubbleNext = -1; this._bubbleWaves = 0; this._bubblesLeft = 0; this._bubblePopped = 0;
    var B = this.board; B.ox = B._pox = 0; B.vox = 0; B.tilt = B._ptilt = 0; B.jig = B._pjig = 0; B.vjig = 0; B.shine = B._pshine = 0;
    B.alive = B._palive = 0; B.turn = B._pturn = 0; B.show = false;
  };
  P.startLevel = function (i) {
    if (!this.levels.length) this.levels = PZ.Content.topicsFor(this.age);
    this.level = clamp(i | 0, 0, this.levels.length - 1);
    this.topic = this.levels[this.level];
    this.weather = this.level % 4;
    this.round = 0; this.levelStars = 0; this.levelStartTime = this.time;
    this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.cur = null; this.talk = null; this.talkAnswered = null; this.surprise = null; this._usedKeys = [];
    var SR = this.cfg.surpriseRounds || [2];
    this._surpriseRound = SR[this.rng.int(0, SR.length - 1)];
    this._clearRound();
    this._setState('intro'); this.phase = null;
    this._mood('wave', 1.6);
    this._emit({ type: 'level', level: this.level, topic: this.topic, weather: this.weather });
  };

  P._beginRound = function () {
    var cfg = this.cfg, self = this, L = this.layout;
    var rr = new PZ.RNG((this.rng.next() * 4294967296) >>> 0);
    var ST = cfg.surpriseTypes, sp = ST && ST.length && this.round === this._surpriseRound && this.round > 0 ? ST[(this.level + this._surpriseOff) % ST.length] : null;
    var el = this.time - this.levelStartTime, sb = cfg.shortBudget, short = !!(sb && this.round > 0 && el > sb[Math.min(this.round, sb.length - 1)]);
    var cur = PZ.Content.makeRound(this.topic, { age: this.age, lang: this.lang, rng: rr, roundIndex: this.round, surprise: sp, short: short, level: this.level,
      usedKeys: this._usedKeys, prevAns: this._prevAns, prevAnsRun: this._prevAnsRun });
    this._usedKeys.push(cur.key);
    this._clearRound();
    this.cur = cur; this.surprise = cur.surprise;
    this.misses = 0; this.stepMisses = 0; this.streak = 0; this._noProg = 0;
    var B = this.board;
    B.scene = cur.scene; B.season = this.weather; B.show = true;
    B.flip = this.round % 2 === 1;   // every other round the picture is mirrored, so the 4 pictures of a chapter differ
    B.ox = B._pox = L.W - L.board.x + cfg.boardFrom; B.vox = 0;
    // slots (board centre placement, stored as u, v) and pieces (tray order = content order)
    this.slots = cur.slots.map(function (s) {
      var pc = cur.pieces.filter(function (q) { return q.id === s.piece; })[0];
      return { id: s.id, piece: s.piece, thing: pc.thing, u: 0.5, v: 0.5, x: 0, y: 0, size: self._sizeOf(pc.thing), filled: false, glow: 0, _glowT: 0 };
    });
    var pl = placeSlots(L.board, this.slots.map(function (s) { return s.size; }), L.item, cfg, cur.seed, this._busy()).pts;
    this.slots.forEach(function (s, k) { s.x = pl[k].x; s.y = pl[k].y; s.u = (s.x - L.board.x) / L.board.w; s.v = (s.y - L.board.y) / L.board.h; });
    this.pieces = cur.pieces.map(function (q, i) {
      return { id: q.id, thing: q.thing, slot: q.slot, size: 0, state: 'drop', x: 0, y: 0, rot: 0, sx: 1, sy: 1, lift: 0, glow: 0, _glowT: 0, dim: 0,
        count: -1, ax: 0, ay: 0, arot: 0, alive: 0, pop: 0, homeX: 0, homeY: 0, homeRot: self._crng.float(-cfg.restRot, cfg.restRot),
        vx: 0, vy: 0, vr: 0, q: 0, qv: 0, t: 0, f: null, landed: false, bounces: 0, _dropAt: cfg.dropDelay + i * cfg.dropStagger, offX: 0, offY: 0,
        _px: 0, _py: 0, _prot: 0, _psx: 1, _psy: 1, _plift: 0, _pax: 0, _pay: 0, _parot: 0, _ppop: 0, _countT: 0, _popT: -1, wob: 0, wv: 0 };
    });
    this._layoutPieces();
    this.pieces.forEach(function (p) {
      p.x = p._px = p.homeX; p.y = p._py = p.homeY - cfg.dropH; p.rot = p._prot = p.homeRot + self._crng.float(-cfg.dropRot, cfg.dropRot);
    });
    var lastLand = cfg.dropDelay + (this.pieces.length - 1) * cfg.dropStagger + Math.sqrt(2 * cfg.dropH / cfg.dropG);
    this._enterTime = Math.max(cfg.enterMin, lastLand + cfg.enterTail);
    this._idleT = 0; this._idleGap = cfg.idleTime; this._idleN = 0;
    this._setState('round'); this._setPhase('enter');
    this._mood('happy', 1.2);
    this._emit({ type: 'round', round: this.round, topic: this.topic, surprise: cur.surprise, scene: cur.scene, season: this.weather, slots: this.slots.length,
      pieces: this.pieces.length, steps: cur.steps.length, mode: cur.steps[0].mode, short: cur.short, key: cur.key });
    this._emit({ type: 'boardIn', x: L.board.x + L.board.w / 2, y: L.board.y + L.board.h / 2 });
  };

  /** Ask the current step. */
  P._ask = function (first) {
    var cfg = this.cfg, cur = this.cur, s = this.stepInfo;
    if (!s) { this._startAlive(); return; }
    this._stepDone = false; this._waitAsk = -1; this.stepMisses = 0; this.magnet = false;
    this._idleT = 0; this._idleGap = cfg.idleTime; this._idleN = 0;
    if (this.hintHand) this.hintHand = null;
    this._mood('talk', 1.0);
    var M = this._pomMouth();
    this._emit({ type: 'ask', promptKey: s.promptKey, params: s.params, mode: s.mode, step: this.step, steps: cur.steps.length, first: !!first, round: this.round,
      nameKind: s.nameKind, nameValue: s.nameValue, need: s.need, x: M.x, y: M.y });
    if (first && this.surprise === 'pigeon') this._pigeonNext = this._crng.float(cfg.pigeonAt[0], cfg.pigeonAt[1]);
    if (first && this.surprise === 'bubbles') this._bubbleNext = this._crng.float(cfg.bubblesAt[0], cfg.bubblesAt[1]);
  };

  P._startTalk = function () {
    var rr = new PZ.RNG((this.rng.next() * 4294967296) >>> 0);
    this.talk = PZ.Content.makeTalk(this.topic, { age: this.age, lang: this.lang, rng: rr, level: this.level });
    this.talk.glowAnswer = false;
    this.talkAnswered = null; this._talkAskT = 0; this._talkAsks = 0;
    this.cur = null; this.phase = null;
    this._clearRound();
    this._setState('talk');
    this._mood('talk', 1.2);
    this._emit({ type: 'talk', talk: this.talk });
  };
  P.talkAnswer = function (choiceId, auto) {
    if (this.state !== 'talk' || this.talkAnswered || !this.talk) return false;
    var ok = choiceId === this.talk.answer && !auto;
    this.talkAnswered = { choiceId: choiceId, correct: ok, auto: !!auto };
    if (ok) { this.stars += 1; this.levelStars += 1; this._mood('cheer'); this._hop(); } else this._mood(auto ? 'happy' : 'think');
    this.stateTime = 0;
    this._emit({ type: 'talkResult', correct: ok, choiceId: choiceId, answerId: this.talk.answer, auto: !!auto });
    return ok;
  };
  P._levelDone = function () { this._setState('levelDone'); this.phase = null; this._emit({ type: 'levelDone', level: this.level, stars: this.levelStars }); };

  // ---------------------------------------------------------------- input (logical px; ONE active pointer)
  P._touch = function () { this._idleT = 0; this._idleGap = this.cfg.idleTime; };
  /** → 'grab' | 'pigeon' | 'bubble' | 'pom' | 'soft' | 'early' | null */
  P.pointerDown = function (x, y) {
    if (this.state !== 'round' || this.held || this._press) return null;
    this.finger.x = x; this.finger.y = y; this.finger.down = true;
    var cfg = this.cfg, L = this.layout;
    if (this.phase === 'play') {
      var p = this._pieceAt(x, y);
      if (p) return this._grab(p, x, y);
    }
    var gh = this.pigeonHit();
    if (gh && hyp(x - gh.x, y - gh.y) <= gh.r) { this._tapPigeon(); this.finger.down = false; return 'pigeon'; }
    var bh = this._bubbleUnder(x, y);
    if (bh) { this._popBubble(bh); this.finger.down = false; return 'bubble'; }
    if (inBox(this._pomBox(), x, y)) { this._press = { kind: 'pom', x: x, y: y, t: this.time, maxD: 0 }; return 'pom'; }
    this.finger.down = false;
    if (this.phase === 'enter') { this._emit({ type: 'soft', kind: 'early', x: x, y: y }); return 'early'; }
    if (this.phase !== 'play') return null;
    var onBoard = inBox(this.boardZone(), x, y);
    this._touch();
    if (onBoard) { var B = this.board; B.vjig += kickFor(cfg.boardJig * 0.5, cfg.jigOmega, cfg.jigZeta); }
    this._emit({ type: 'soft', kind: onBoard ? 'board' : 'space', x: x, y: y });
    // a child who never gets a piece to its shadow: after `assistAfter` taps without progress a press on the board flies the
    // asked piece into its slot by itself (no fail state, the round always ends)
    if (onBoard && !this._stepDone && this._noProg >= this._assistAfter() && this._assistFly(x, y)) return 'soft';
    if (!this._stepDone) this._noProgress();
    void L;
    return 'soft';
  };
  P._grab = function (p, x, y) {
    var cfg = this.cfg, ev, swap = false;
    // assist: after many taps / drops without progress, the next grab of ANY piece gives the finger the asked one, and a
    // press on the asked piece itself arms it too — a quick tap then glides it in (a child who taps "this one!" but cannot drag
    // yet still finishes every round; a drag still works as usual)
    if (!this._stepDone && this._noProg >= this._assistAfter()) {
      if (!this._isAsked(p)) {
        var a = this._askedPiece();
        if (a && this._grabbable(a)) {
          p.qv += kickFor(0.08, cfg.squashOmega, cfg.squashZeta);
          this._noProg = 0;
          this._emit({ type: 'assist', id: a.id, from: p.id, x: x, y: y });
          p = a; p._assisted = true; swap = true;
        }
      } else {
        this._noProg = 0; p._assisted = true;
        this._emit({ type: 'assist', id: p.id, from: p.id, x: x, y: y });
      }
    }
    p.state = 'held'; p.f = null; p.t = 0;
    p.offX = swap ? 0 : p.x - x; p.offY = swap ? 0 : p.y - y;   // a swapped-in piece jumps to the finger; the asked piece keeps its grip
    this.held = p.id; this._touch();
    this._press = { kind: 'piece', id: p.id, x: x, y: y, t: this.time, maxD: 0 };
    if (this.hintHand && this.hintHand.id !== p.id) this.hintHand = null;
    ev = { type: 'pickup', id: p.id, thing: p.thing, asked: this._isAsked(p), x: p.x, y: p.y };
    this._emit(ev);
    return 'grab';
  };
  P.pointerMove = function (x, y) {
    if (!this.finger.down) return;
    this.finger.x = x; this.finger.y = y;
    var d = this._press;
    if (d) d.maxD = Math.max(d.maxD, hyp(x - d.x, y - d.y));
  };
  /** → 'snap' | 'nearMiss' | 'wrong' | 'home' | 'tap' | 'pokePom' | null */
  P.pointerUp = function (x, y) {
    var pr = this._press;
    this._press = null;
    if (x === undefined && pr) { x = this.finger.x; y = this.finger.y; }
    this.finger.down = false;
    if (!pr) return null;
    this.finger.x = x; this.finger.y = y;
    var mv = Math.max(pr.maxD, hyp(x - pr.x, y - pr.y)), tap = mv < this._tapMove() && this.time - pr.t < this.cfg.tapTime;
    if (pr.kind === 'pom') return tap && this.state === 'round' ? this._pokePom() : null;
    var p = this.held && this.pieceById(this.held);
    this.held = null;
    if (!p || p.state !== 'held') return null;
    if (this.state !== 'round' || this.phase !== 'play') { this._goHome(p, 'home'); return 'home'; }
    // a release during the gap after a fit: the next step starts now (its ask is said), then the drop is judged
    if (this._stepDone && this.step < this.cur.steps.length - 1 && !this._snapping()) { this.step++; this._ask(false); }
    if (tap) {
      if (p._assisted) { p._assisted = false; return this._snap(p, 'fly'); }   // an assisted tap: the asked piece glides in
      this._hopHome(p);
      this._touch();
      this._emit({ type: 'tapPiece', id: p.id, thing: p.thing, x: p.homeX, y: p.homeY });
      if (!this._stepDone) this._noProg++;   // a curious tap counts towards the assist, but never lights the 2-miss hint (idle hints still come)
      return 'tap';
    }
    p._assisted = false;
    return this._drop(p, x, y);
  };
  /** The finger left (touchcancel / pause / rotation): a held piece glides home quietly. */
  P.cancelDrag = function () {
    this._press = null; this.finger.down = false;
    if (!this.held) return;
    var p = this.pieceById(this.held);
    this.held = null;
    if (p && p.state === 'held') { p._assisted = false; this._goHome(p, 'home'); }
  };
  /** Judge a drop at the RELEASE point: the piece centre or the finger point inside counts. */
  P._drop = function (p, fx, fy) {
    var cfg = this.cfg, s = this.stepInfo, asked = !this._stepDone && this._isAsked(p), Z = this.boardZone();
    var onBoard = inBox(Z, p.x, p.y) || inBox(Z, fx, fy);
    this._touch();
    if (asked) {
      var sz = this.slotZone(p.slot), inZone = inBox(sz, p.x, p.y) || inBox(sz, fx, fy);
      if (inZone || (this.magnet && onBoard)) return this._snap(p, 'magnet');
      if (onBoard) {
        var sl = this.slotById(p.slot);
        sl._glowT = cfg.nearGlow; this.magnet = true;
        this._goHome(p, 'near');
        this._mood('point', 1.2);
        this._emit({ type: 'nearMiss', id: p.id, slot: p.slot, thing: p.thing, x: sl.x, y: sl.y });
        return 'nearMiss';
      }
    } else if (onBoard && s && !this._stepDone) {
      var t = p.thing;
      this.misses++; this.stepMisses++; this.streak++;
      this._wrong(p);
      this._mood('oops');
      this._emit({ type: 'wrong', id: p.id, thing: t, got: { nameKind: t.nameKind, nameValue: t.nameValue, kind: t.kind, obj: t.obj, color: t.color, shape: t.shape, n: t.n,
        animal: t.animal, text: t.text, size: t.size }, want: { nameKind: s.nameKind, nameValue: s.nameValue, promptKey: s.promptKey, params: s.params },
        streak: this.streak, misses: this.misses, x: p.x, y: p.y });
      this._noProgress();
      return 'wrong';
    }
    this._goHome(p, 'home');
    this._emit({ type: 'home', id: p.id, x: p.x, y: p.y });
    if (s && !this._stepDone) this._noProgress();   // let go off the board: no miss, but it counts towards the hint / assist
    return 'home';
  };
  P._noProgress = function () { this._noProg++; if (this._noProg >= this.cfg.hintAfterMisses) this._autoHint(false); };
  P._pokePom = function () {
    var a = this.prompt(), B = this.layout.pom;
    if (!a) return null;
    this._touch();
    this._mood('talk', 1.0);
    this._emit({ type: 'pokePom', promptKey: a.promptKey, params: a.params, mode: a.mode, step: a.step, x: B.x, y: B.y - 0.7 * B.h });
    return 'pokePom';
  };
  /** Assist from a board press: the asked piece flies from the tray into its slot. */
  P._assistFly = function (x, y) {
    var a = this._askedPiece();
    if (!a || !this._grabbable(a)) return false;
    this._noProg = 0;
    this._emit({ type: 'assist', id: a.id, from: null, x: x, y: y });
    this._snap(a, 'fly');
    return true;
  };

  // ---------------------------------------------------------------- piece motion plans
  P._goHome = function (p, kind) {
    var cfg = this.cfg, d = hyp(p.homeX - p.x, p.homeY - p.y), T = clamp(cfg.homeTime + d * cfg.homePerPx, cfg.homeTime, cfg.homeTimeMax);
    p.f = arc(p.x, p.y, p.homeX, p.homeY, T, cfg.homeApex, clamp(p.vx * 0.15, -300, 300), this.layout.ins.top + 8);
    p.f.rot0 = p.rot; p.f.lift0 = p.lift; p.f.kind = kind; p.f.squash = cfg.homeSquash;
    p.state = 'home'; p.t = 0;
  };
  P._hopHome = function (p) {
    var cfg = this.cfg;
    p.f = arc(p.x, p.y, p.homeX, p.homeY, cfg.tapHopTime, cfg.tapHop, 0, this.layout.ins.top + 8);
    p.f.rot0 = p.rot; p.f.lift0 = p.lift; p.f.kind = 'tap'; p.f.squash = cfg.homeSquash * 1.5;
    p.state = 'home'; p.t = 0;
  };
  P._wrong = function (p) {
    p.state = 'wrong'; p.t = 0; p.f = null; p.wx0 = p.x; p.wy0 = p.y; p.wrot0 = p.rot;
  };
  /** Snap into the slot: 'magnet' = a quick ease-out-back glide (0.16 s), 'fly' = an arc from the tray (assist). */
  P._snap = function (p, kind) {
    var cfg = this.cfg, s = this.slotById(p.slot);
    p.state = 'snap'; p.t = 0; p.held = false;
    p.sn = { kind: kind, x0: p.x, y0: p.y, rot0: p.rot, lift0: p.lift, T: kind === 'fly' ? cfg.assistFlyTime : cfg.snapTime };
    if (kind === 'fly') p.sn.f = arc(p.x, p.y, s.x, s.y, cfg.assistFlyTime, cfg.assistApex, 0, this.layout.ins.top + 8);
    this.hintHand = null;
    this._stepDone = true;   // no new judgement until the fit is done
    this._snapStep = true;
    return 'snap';
  };
  /** The piece clicks into its slot: squash, the board jiggles, `placed` (+ counting for count pieces), `stepDone`. */
  P._land = function (p) {
    var cfg = this.cfg, s = this.slotById(p.slot), st = this.stepInfo;
    p.state = 'placed'; p.t = 0; p.sn = null; p.f = null;
    p.x = s.x; p.y = s.y; p.rot = 0; p.vr = 0; p.vx = p.vy = 0; p.lift = 0;
    p.q = cfg.snapSquash; p.qv = 0; p.glow = 0; p._glowT = 0;
    s.filled = true; s._glowT = 0;
    var B = this.board; B.vjig += kickFor(cfg.boardJig, cfg.jigOmega, cfg.jigZeta);
    this.streak = 0; this._noProg = 0; this._touch(); this.magnet = false;
    var cnt = (p.thing.kind === 'bunch' || p.thing.kind === 'dots') ? p.thing.n : 0;
    if (cnt) { p.count = 0; p._countT = 0; }
    var claimed = st ? st.targets.filter(function (id) { var q = this.pieceById(id); return q && q.state === 'placed'; }, this).length : 0;
    var last = !st || claimed >= st.need;
    var ev = { type: 'placed', id: p.id, slot: p.slot, thing: p.thing, step: this.step, x: s.x, y: s.y };
    if (cnt) ev.count = { n: cnt };
    if (st && st.mode === 'findAll') ev.all = { i: claimed, n: st.need };
    this._mood('happy'); this._hop();
    this._emit(ev);
    this._snapStep = false;
    if (last) {
      var lastStep = !this.cur || this.step >= this.cur.steps.length - 1;
      this._stepDone = true;
      this._waitAsk = cfg.askGap + (cnt ? cnt * cfg.countStep + 0.3 : 0);
      this._emit({ type: 'stepDone', step: this.step, steps: this.cur ? this.cur.steps.length : 1, last: lastStep });
    } else {
      this._stepDone = false;   // findAll: more pieces of this step to put in
    }
  };

  // ---------------------------------------------------------------- help
  P.resetNudges = function () {
    this._idleT = 0; this._idleGap = this.cfg.idleTime; this._idleN = 0;
    this._talkAskT = 0; this._talkAsks = 0;
    if (this.talk) this.talk.glowAnswer = false;
  };
  P._glowing = function () { for (var i = 0; i < this.pieces.length; i++) if (this.pieces[i]._glowT > 0) return true; return false; };
  P._autoHint = function (fromIdle) {
    if (this._glowing() || this.hintHand || this.time - this._lastHintT < this.cfg.hintCooldown) return null;
    return this._doHint(fromIdle);
  };
  P._doHint = function (fromIdle) {
    var p = this._askedPiece(), cfg = this.cfg, s = this.stepInfo;
    if (!p || !this.interactive || p.state === 'held') return null;
    p._glowT = cfg.hintTime;
    var sl = this.slotById(p.slot); sl._glowT = Math.max(sl._glowT, cfg.hintTime);
    this.hintHand = { id: p.id, slot: p.slot, x: p.homeX, y: p.homeY, x0: p.homeX, y0: p.homeY, x1: sl.x, y1: sl.y, t: 0, press: 0, alpha: 0, time: 0, T: cfg.hintTime };
    this._hintGeo();
    this._lastHintT = this.time;
    this._mood('point', cfg.hintTime);
    var ev = { type: 'hint', id: p.id, slot: p.slot, x: this.hintHand.x0, y: this.hintHand.y0, toX: sl.x, toY: sl.y,
      want: { nameKind: s.nameKind, nameValue: s.nameValue, promptKey: s.promptKey, params: s.params } };
    if (fromIdle) ev.idle = true;
    this._emit(ev);
    return { piece: p.id, slot: p.slot };
  };
  /** Manual hint (e.g. a tap on the bubble): the asked piece glows + the ghost hand drags it. → {piece, slot} | null */
  P.hint = function () {
    if (!this.interactive) return null;
    if (this.hintHand) return { piece: this.hintHand.id, slot: this.hintHand.slot };
    return this._doHint(false);
  };
  P._hintGeo = function () {
    var H = this.hintHand;
    if (!H) return;
    var p = this.pieceById(H.id), s = p && this.slotById(p.slot);
    if (!p || !s || p.state === 'placed') { this.hintHand = null; return; }
    H.x0 = p.homeX; H.y0 = p.homeY; H.x1 = s.x; H.y1 = s.y;
  };
  /** Ghost hand cycle (1.6 s): press on the piece (0–0.15), carry it on a low arc to the slot (0.15–0.7), let go (0.7–0.82),
   *  float back (0.82–1, fading). Fingertip = (x, y). */
  P._stepHint = function (h) {
    var H = this.hintHand, cfg = this.cfg;
    if (!H) return;
    H.time += h;
    if (H.time >= H.T || !this.interactive || this.held === H.id) { this.hintHand = null; return; }
    this._hintGeo();
    if (!this.hintHand) return;
    var u = (H.time % cfg.hintCycle) / cfg.hintCycle, x, y, press, fade = 1;
    if (u < 0.15) { press = smooth(u / 0.15); x = H.x0; y = H.y0 + 14 * (1 - press); }
    else if (u < 0.7) { var v = smooth((u - 0.15) / 0.55); press = 1; x = lerp(H.x0, H.x1, v); y = lerp(H.y0, H.y1, v) - 50 * Math.sin(Math.PI * v); }
    else if (u < 0.82) { press = 1 - smooth((u - 0.7) / 0.12); x = H.x1; y = H.y1 + 10 * (1 - press); }
    else { var w2 = smooth((u - 0.82) / 0.18); press = 0; x = lerp(H.x1, H.x0, w2); y = lerp(H.y1, H.y0, w2) + 10; fade = 1 - 0.85 * Math.sin(Math.PI * w2); }
    H.x = x; H.y = y; H.t = u; H.press = press;
    H.alpha = clamp(H.time / 0.25, 0, 1) * clamp((H.T - H.time) / 0.35, 0, 1) * fade;
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
  P._twins = function () {
    var i, o, B = this.board;
    for (i = 0; i < this.pieces.length; i++) {
      o = this.pieces[i];
      o._px = o.x; o._py = o.y; o._prot = o.rot; o._psx = o.sx; o._psy = o.sy; o._plift = o.lift; o._pax = o.ax; o._pay = o.ay; o._parot = o.arot; o._ppop = o.pop;
    }
    B._pox = B.ox; B._ptilt = B.tilt; B._pjig = B.jig; B._pturn = B.turn; B._pshine = B.shine; B._palive = B.alive;
    if (this.pigeon) { var g = this.pigeon; g._px = g.x; g._py = g.y; }
    for (i = 0; i < this.bubbles.length; i++) { o = this.bubbles[i]; o._px = o.x; o._py = o.y; }
    this.pom._phop = this.pom.hop;
  };
  P._step = function (h) {
    var cfg = this.cfg;
    this._twins();
    this.time += h; this.stateTime += h; this.phaseTime += h;
    switch (this.state) {
      case 'intro': if (this.stateTime >= cfg.introTime) this._beginRound(); break;
      case 'round': this._stepRound(h); break;
      case 'roundDone': this._stepRoundDone(h); break;
      case 'talk':
        if (this.talkAnswered) { if (this.stateTime >= cfg.talkAfterAnswer) this._levelDone(); break; }
        this._talkAskT += h;
        if (this._talkAsks < cfg.talkMaxAsks && this._talkAskT >= cfg.talkAskTime - 1e-9) {
          this._talkAskT = 0; this._talkAsks++;
          if (this._talkAsks >= cfg.talkGlowAfterAsks) this.talk.glowAnswer = true;
          this._emit({ type: 'talkAsk', talk: this.talk, n: this._talkAsks, glowAnswer: this.talk.glowAnswer });
        } else if (this._talkAsks >= cfg.talkMaxAsks && this._talkAskT >= cfg.talkGiveUp - 1e-9) this.talkAnswer(this.talk.answer, true);   // Pom answers
        break;
      case 'levelDone':
        if (this.stateTime >= cfg.levelDoneTime) {
          if (this.level < this.levels.length - 1) this.startLevel(this.level + 1);
          else {
            this._setState('sessionDone'); this.phase = null;
            this.lastTopics = this.levels.slice();
            this._emit({ type: 'sessionDone', stars: this.stars, pictures: this.pictures.slice() });
          }
        }
        break;
    }
    if (this.state === 'round' || this.state === 'roundDone') {
      this._stepBoard(h); this._stepPieces(h); this._stepSlots(h); this._stepSurprises(h); this._stepHint(h);
      this._sortPieces();
    }
    this._stepPom(h);
  };

  P._stepRound = function (h) {
    var cfg = this.cfg;
    switch (this.phase) {
      case 'enter':
        if (this.phaseTime >= this._enterTime && this.pieces.every(function (p) { return p.state !== 'drop'; })) { this._setPhase('play'); this.step = 0; this._ask(true); }
        break;
      case 'play': {
        if (this._stepDone && !this._snapStep) {
          if (this._waitAsk >= 0) {
            this._waitAsk -= h;
            if (this._waitAsk <= 0) {
              this._waitAsk = -1;
              if (this.step < this.cur.steps.length - 1) { this.step++; this._ask(false); }
              else this._startAlive();
            }
          }
          break;
        }
        if (this._stepDone) break;
        if (!this._press && !this.held) {
          this._idleT += h;
          if (this._idleT >= this._idleGap - 1e-9) {
            this._idleT = 0; this._idleGap = Math.min(cfg.idleMax, this._idleGap * cfg.idleBackoff); this._idleN++;
            this._mood('think');
            var a = this.prompt();
            this._emit({ type: 'idle', n: this._idleN, promptKey: a.promptKey, params: a.params, mode: a.mode, step: a.step });
            if (this._idleN >= cfg.idleHintFrom) this._autoHint(true);
          }
        }
        break;
      }
    }
  };
  P._starsFor = function (m) { return m <= 0 ? 3 : m === 1 ? 2 : 1; };
  /** The picture is complete: stars, shine sweep, every placed piece comes alive, leftover distractors poof, Pom cheers + toots. */
  P._startAlive = function () {
    var st = this._starsFor(this.misses), ls = this.cur && this.cur.steps[this.cur.steps.length - 1];
    if (ls) { this._prevAnsRun = String(ls.nameValue) === String(this._prevAns) ? (this._prevAnsRun || 1) + 1 : 1; this._prevAns = ls.nameValue; }
    this.roundStars = st; this.stars += st; this.levelStars += st;
    if (this.held) this.cancelDrag();
    this._press = null; this.hintHand = null;
    this._setState('roundDone'); this._setPhase('alive');
    this._tooted = false; this._aliveSaid = false;
    this._mood('cheer', 1.2); this._hop();
    var B = this.layout.board;
    this.pigeon = this.pigeon && this.pigeon.state !== 'fly' ? this._pigeonLeave() : this.pigeon;
    this._emit({ type: 'roundDone', round: this.round, stars: st, misses: this.misses, x: B.x + B.w / 2, y: B.y + B.h / 2 });
  };
  /** Will the chapter end after this round (Talk time next)? */
  P._chapterEnds = function () {
    var r = this.round + 1, el = this.time - this.levelStartTime;
    return r >= this.roundsPerLevel || (r >= this.cfg.chapterMinRounds && el > this.cfg.chapterTimeLimit);
  };
  P._stepRoundDone = function (h) {
    var cfg = this.cfg, B = this.layout.board, self = this;
    if (this.phase === 'alive') {
      var t = this.phaseTime;
      if (t >= cfg.shineTime && !this._aliveSaid) { this._aliveSaid = true; this._emit({ type: 'alive', x: B.x + B.w / 2, y: B.y + B.h / 2 }); }
      if (t >= cfg.tootAt && !this._tooted) { this._tooted = true; this._mood('toot'); this._hop(); var M = this._pomMouth(); this._emit({ type: 'toot', x: M.x, y: M.y }); }
      this.pieces.forEach(function (p) {
        if (p.state !== 'placed' && p.state !== 'gone' && p._popT < 0 && t >= cfg.poofAt && p.state !== 'held') {
          p._popT = 0; self._emit({ type: 'poof', id: p.id, x: p.x, y: p.y });
        }
      });
      if (t >= cfg.aliveTime) {
        this._setPhase('turn');
        this._emit({ type: 'boardOut', x: B.x, y: B.y + B.h / 2 });
      }
    } else if (this.phase === 'turn') {
      if (this.phaseTime >= cfg.turnTime) {
        this.pictures.push({ scene: this.board.scene, season: this.board.season, level: this.level, round: this.round, topic: this.topic,
          flip: !!this.board.flip, pieces: this.slots.map(function (s) { return { thing: s.thing, u: s.u, v: s.v, rs: s.size / Math.min(B.w, B.h) }; }) });
        this._nextRound();
      }
    }
  };
  P._nextRound = function () {
    var cfg = this.cfg;
    this._clearRound(); this.cur = null;
    this.round++;
    var el = this.time - this.levelStartTime, long = this.round >= cfg.chapterMinRounds && el > cfg.chapterTimeLimit;
    if (this.round < this.roundsPerLevel && !long) this._beginRound();
    else { if (this.round < this.roundsPerLevel) this.roundsPerLevel = this.round; this._startTalk(); }
  };

  // ---------------------------------------------------------------- board
  P._stepBoard = function (h) {
    var B = this.board, cfg = this.cfg, L = this.layout;
    B.x = L.board.x; B.y = L.board.y; B.w = L.board.w; B.h = L.board.h;
    spring(B, 'ox', 'vox', 0, cfg.boardOmega, cfg.boardZeta, h);
    B.tilt = clamp(B.vox * cfg.boardTiltK, -cfg.boardTiltMax, cfg.boardTiltMax);
    spring(B, 'jig', 'vjig', 0, cfg.jigOmega, cfg.jigZeta, h);
    if (this.state === 'roundDone') {
      var t = this.phase === 'alive' ? this.phaseTime : 99;
      B.shine = clamp(t / cfg.shineTime, 0, 1);
      B.alive = smooth((t - cfg.shineTime) / cfg.aliveRamp);
      if (this.phase === 'turn') { var u = clamp(this.phaseTime / cfg.turnTime, 0, 1); B.turn = u * u; B.shine = 1; B.alive = 1; }
    }
  };

  // ---------------------------------------------------------------- pieces
  P._scale = function (p) {
    var k = 1 + this.cfg.liftScale * p.lift;
    p.sy = (1 - p.q) * k; p.sx = (1 + 0.8 * p.q) * k;
  };
  P._stepPieces = function (h) {
    var cfg = this.cfg, self = this;
    // idle wiggle: now and then one resting piece gives a little "pick me!" wiggle
    this._wiggleT -= h;
    if (this._wiggleT <= 0) {
      this._wiggleT = this._crng.float(cfg.wiggleEvery[0], cfg.wiggleEvery[1]);
      var rest = this.pieces.filter(function (q) { return q.state === 'rest'; });
      if (rest.length && this.phase === 'play') this._crng.pick(rest).vr += kickFor(cfg.wiggleKick, cfg.wiggleOmega, cfg.wiggleZeta) * (this._crng.chance(0.5) ? 1 : -1);
    }
    for (var i = 0; i < this.pieces.length; i++) {
      var p = this.pieces[i];
      p.t += h;
      if (p._glowT > 0) p._glowT = Math.max(0, p._glowT - h);
      var gT = p._glowT > 0 ? 1 : 0;
      p.glow += (gT - p.glow) * Math.min(1, h * (gT ? 6 : 3));
      switch (p.state) {
        case 'drop': this._stepDrop(p, h); break;
        case 'rest':
          p.x = p.homeX;
          spring(p, 'rot', 'vr', p.homeRot, cfg.rotOmega, cfg.rotZeta, h);
          p.lift = Math.max(0, p.lift - h * cfg.liftRate * Math.max(0.2, p.lift));
          spring(p, 'q', 'qv', 0, cfg.squashOmega, cfg.squashZeta, h);
          p.y = p.homeY + p.boxH / 2 * (1 - (1 - p.q));   // squash about the bottom (the piece sits on its ledge)
          break;
        case 'held': {
          var tx = clamp(this.finger.x + p.offX, 0, this.layout.W), ty = clamp(this.finger.y + p.offY - cfg.liftPx * p.lift, 0, this.layout.H);
          var w = cfg.dragOmega, z = cfg.dragZeta;
          p.vx += (w * w * (tx - p.x) - 2 * z * w * p.vx) * h;
          p.vy += (w * w * (ty - p.y) - 2 * z * w * p.vy) * h;
          p.x += p.vx * h; p.y += p.vy * h;
          var tg = clamp(-p.vx * cfg.tiltK, -cfg.tiltMax, cfg.tiltMax);
          spring(p, 'rot', 'vr', tg, cfg.tiltOmega, cfg.tiltZeta, h);
          if (Math.abs(p.rot) > cfg.tiltMax) { p.rot = clamp(p.rot, -cfg.tiltMax, cfg.tiltMax); p.vr *= -0.3; }   // the swing never passes ±0.35
          p.lift += (1 - p.lift) * Math.min(1, h * cfg.liftRate);
          spring(p, 'q', 'qv', 0, cfg.squashOmega, cfg.squashZeta, h);
          break;
        }
        case 'snap': {
          var S = p.sn, sl = this.slotById(p.slot), u = clamp(p.t / S.T, 0, 1);
          if (S.kind === 'fly') { S.f.x1 = sl.x; S.f.y1 = sl.y; var a = arcAt(S.f, Math.min(p.t, S.T)); p.x = a.x; p.y = a.y; }
          else { var e = easeOutBack(u); p.x = lerp(S.x0, sl.x, e); p.y = lerp(S.y0, sl.y, e); }
          p.rot = S.rot0 * (1 - smooth(u)); p.lift = S.lift0 * (1 - u) + (S.kind === 'fly' ? 0.6 * Math.sin(Math.PI * u) : 0);
          spring(p, 'q', 'qv', 0, cfg.squashOmega, cfg.squashZeta, h);
          if (u >= 1) this._land(p);
          break;
        }
        case 'placed': this._stepPlaced(p, h); break;
        case 'home': {
          var f = p.f, tt = Math.min(f.T, p.t), pt = arcAt(f, tt), v2 = tt / f.T;
          p.x = pt.x; p.y = pt.y;
          p.rot = lerp(f.rot0, p.homeRot, smooth(v2)) + (f.kind === 'tap' ? 0.12 * Math.sin(TAU * v2) : 0);
          p.lift = f.lift0 * (1 - v2);
          spring(p, 'q', 'qv', 0, cfg.squashOmega, cfg.squashZeta, h);
          if (f.kind === 'tap') { var st2 = 0.1 * Math.sin(Math.PI * v2); p.q = -st2; }   // stretch while hopping
          if (p.t >= f.T) this._arrive(p, f.squash);
          break;
        }
        case 'wrong': {
          if (p.t < cfg.wrongShakeTime) {   // a damped "no-no" shake where it was let go
            var k = Math.exp(-p.t / (cfg.wrongShakeTime * 0.4));
            p.x = p.wx0 + cfg.wrongShake * k * Math.sin(TAU * cfg.wrongShakeHz * p.t); p.y = p.wy0;
            p.rot = p.wrot0 * (1 - p.t / cfg.wrongShakeTime) + 0.08 * k * Math.sin(TAU * cfg.wrongShakeHz * p.t + 1);
            p.lift = Math.max(0.3, p.lift - h * 2);
          } else {
            if (!p.f) {
              var d = hyp(p.homeX - p.x, p.homeY - p.y), T = clamp(cfg.wrongTime + d * cfg.homePerPx, cfg.wrongTime, cfg.wrongTimeMax);
              p.f = arc(p.x, p.y, p.homeX, p.homeY, T, cfg.wrongApex, 0, this.layout.ins.top + p.size / 2 + 4);
              p.f.rot0 = p.rot; p.f.lift0 = p.lift; p.f.t0 = p.t; p.f.dir = p.homeX >= p.x ? 1 : -1;
            }
            var F = p.f, ft = Math.min(F.T, p.t - F.t0), q2 = arcAt(F, ft), uu = ft / F.T;
            p.x = q2.x; p.y = q2.y; p.lift = F.lift0 * (1 - uu);
            p.rot = lerp(F.rot0, p.homeRot, smooth(uu)) + 0.35 * F.dir * Math.sin(Math.PI * uu);   // a little tumble on the way home
            if (ft >= F.T) this._arrive(p, cfg.wrongSquash);
          }
          spring(p, 'q', 'qv', 0, cfg.squashOmega, cfg.squashZeta, h);
          break;
        }
        case 'gone': p.pop = 0; break;
      }
      if (p._popT >= 0 && p.state !== 'gone') {   // a leftover distractor pops away (a small swell, then shrinks to nothing)
        p._popT += h;
        var pu = clamp(p._popT / cfg.poofTime, 0, 1);
        p.pop = pu < 0.3 ? 1 + 0.15 * Math.sin(Math.PI * pu / 0.3 * 0.5) : 1.15 * (1 - smooth((pu - 0.3) / 0.7));
        if (pu >= 1) { p.state = 'gone'; p.pop = 0; }
      }
      this._scale(p);
    }
    void self;
  };
  P._arrive = function (p, squash) {
    p.state = 'rest'; p.f = null; p.x = p.homeX; p.y = p.homeY; p.vx = p.vy = 0; p.lift = 0;
    p.q = 0; p.qv = kickFor(squash, this.cfg.squashOmega, this.cfg.squashZeta);
  };
  /** Enter: wait for its turn, then fall from above the tray (gravity), bounce on the ledge (restitution 0.32), squash on every
   *  contact, the tumble tilt settles to the resting tilt. */
  P._stepDrop = function (p, h) {
    var cfg = this.cfg, t = this.phaseTime - p._dropAt;
    if (this.phase !== 'enter' && this.state === 'round') t = Math.max(t, 0);
    if (t < 0) { p.pop = 0; return; }
    p.pop = Math.min(1, t / 0.08);   // pops in quickly above the tray, then falls
    p.vy += cfg.dropG * h; p.y += p.vy * h; p.x = p.homeX;
    spring(p, 'rot', 'vr', p.homeRot, cfg.rotOmega * (p.landed ? 1 : 0.35), cfg.rotZeta, h);
    if (p.y >= p.homeY && p.vy > 0) {
      var v = p.vy;
      p.y = p.homeY;
      p.qv += kickFor(clamp(v / 2600, 0.06, 0.26), cfg.squashOmega, cfg.squashZeta);
      if (!p.landed) { p.landed = true; this._emit({ type: 'pieceLand', id: p.id, i: this.pieces.indexOf(p), x: p.x, y: p.y + p.boxH / 2 }); }
      p.vr += (this._crng.chance(0.5) ? 1 : -1) * v * 0.0015;
      if (v > cfg.dropMinBounce && p.bounces < 2) { p.vy = -v * cfg.dropBounce; p.bounces++; }
      else { p.vy = 0; p.state = 'rest'; p.t = 0; }
    }
    spring(p, 'q', 'qv', 0, cfg.squashOmega, cfg.squashZeta, h);
  };
  /** A placed piece: follows its slot; squash settles; counting lights; in the alive phase its own little motion. */
  P._stepPlaced = function (p, h) {
    var cfg = this.cfg, s = this.slotById(p.slot);
    p.x = s.x; p.y = s.y; p.rot = 0;
    spring(p, 'q', 'qv', 0, cfg.squashOmega, cfg.squashZeta, h);
    if (p.count >= 0) {
      p._countT += h;
      var n = p.thing.n, i = Math.min(n, Math.floor(p._countT / cfg.countStep) + 1);
      if (i > p.count && p._countT < n * cfg.countStep + 1e-9) { p.count = i; this._emit({ type: 'count', id: p.id, i: i, n: n, x: p.x, y: p.y }); }
      if (p._countT >= n * cfg.countStep + cfg.countHold) p.count = -1;
    }
    if (this.state === 'roundDone') this._alivePose(p);
    else { p.ax = p.ay = p.arot = 0; p.alive = 0; }
  };
  /** DESIGN §5.2 alive motions (relative offsets; × the envelope `alive`). */
  P._alivePose = function (p) {
    var cfg = this.cfg, t = this.phase === 'alive' ? this.phaseTime - cfg.shineTime : cfg.aliveTime - cfg.shineTime + this.phaseTime;
    var env = smooth(t / 0.25) * (this.phase === 'turn' ? 1 - smooth(this.phaseTime / 0.3) : 1);
    if (t <= 0) { p.alive = 0; p.ax = p.ay = p.arot = 0; return; }
    p.alive = env;
    var th = p.thing, k = th.kind, o = th.obj, ax = 0, ay = 0, ar = 0, idx = this.slots.indexOf(this.slotById(p.slot));
    if (k === 'obj' && (o === 'car' || o === 'bus')) { ax = 18 * Math.sin(TAU * 0.8 * t); ay = -3 * Math.abs(Math.sin(TAU * 3 * t)); ar = 0.03 * Math.sin(TAU * 3 * t); }
    else if ((k === 'obj' && (o === 'balloon' || o === 'kite')) || k === 'bunch') { ay = -10 * smooth(t / 0.6) - 2 * Math.sin(TAU * 0.9 * t); ax = 4 * Math.sin(TAU * 0.6 * t); ar = 0.12 * Math.sin(TAU * 0.9 * t); }
    else if (k === 'obj' && (o === 'umbrella' || o === 'hat')) { ay = -8 * Math.abs(Math.sin(TAU * 1.2 * t)); ar = 0.05 * Math.sin(TAU * 1.2 * t); }
    else if (k === 'animal') {   // two hops (0.38 s each) with a squash on every landing
      var hp = t % 1.0, ht = hp / 0.38;
      if (t < 2 && ht < 1) ay = -22 * 4 * ht * (1 - ht);
      if (t < 2 && ht >= 1 && ht < 1.15 && p.q < 0.02) p.qv += kickFor(0.12, cfg.squashOmega, cfg.squashZeta);
    } else {   // house, flower, shape tiles, dots, glyphs: a pulse-bounce wave across the board
      var wt = t - idx * cfg.waveStagger, wp = wt % 0.9, wu = wp / 0.35;
      if (wt > 0 && wu < 1) ay = -14 * 4 * wu * (1 - wu);
      if (wt > 0 && wu >= 1 && wu < 1.1 && p.q < 0.02) p.qv += kickFor(0.1, cfg.squashOmega, cfg.squashZeta);
    }
    p.ax = ax * env; p.ay = ay * env; p.arot = ar * env;
  };
  P._stepSlots = function (h) {
    for (var i = 0; i < this.slots.length; i++) {
      var s = this.slots[i];
      if (s._glowT > 0) s._glowT = Math.max(0, s._glowT - h);
      var target = s._glowT > 0 && !s.filled ? 0.55 + 0.45 * Math.sin(TAU * 1.6 * this.time) : 0;   // a pulsing rim
      s.glow += (target - s.glow) * Math.min(1, h * 10);
    }
  };
  /** Draw order: tray pieces (rest / drop) → placed → moving (home / wrong / snap) → the held piece last. */
  P._sortPieces = function () {
    var held = this.held, rank = function (p) { return p.id === held ? 4 : p.state === 'placed' ? 1 : p.state === 'rest' || p.state === 'drop' || p.state === 'gone' ? 0 : 3; };
    var a = this.pieces, sorted = true;
    for (var i = 1; i < a.length; i++) if (rank(a[i - 1]) > rank(a[i])) { sorted = false; break; }
    if (sorted) return;
    this.pieces = a.map(function (p, i) { return { p: p, i: i, k: rank(p) }; }).sort(function (x, y) { return x.k - y.k || x.i - y.i; }).map(function (o) { return o.p; });
  };
  /** Pieces in draw order (w.pieces is kept sorted already). */
  P.drawOrder = function () { return this.pieces; };

  // ---------------------------------------------------------------- surprises
  /** The pigeon's ledge (feet y, walkable lo … hi): the top of the board frame, pigeonEdge in from its ends and clear of every
   *  keep-out box (speech bubble, HUD) that reaches down into its height band. When the bubble sits right on top of the board
   *  (iPad portrait) it walks on top of the speech bubble instead (left of the HUD); with no room on either (iPad 4:3 landscape:
   *  bubble and HUD both reach down to the frame) it lands on Pom's head and pecks there, riding his hops. Never over the tray. */
  P._perch = function () {
    var L = this.layout, B = L.board, cfg = this.cfg, R = cfg.pigeonW * 0.5, H = 0.88 * cfg.pigeonW;   // H: the drawn head height
    function cut(y, lo, hi, boxes) {
      var mid = (lo + hi) / 2;
      for (var i = 0; i < boxes.length; i++) {
        var k = boxes[i];
        if (!k || !(k.y < y && k.y + k.h > y - H) || k.x > hi + R || k.x + k.w < lo - R) continue;
        if (k.x + k.w / 2 < mid) lo = Math.max(lo, k.x + k.w + R); else hi = Math.min(hi, k.x - R);
      }
      return { y: y, lo: lo, hi: hi };
    }
    var fr = cut(B.y - L.frame + 2, B.x + cfg.pigeonEdge, B.x + B.w - cfg.pigeonEdge, L.keep);
    if (fr.hi - fr.lo >= 100) return fr;
    var Bb = L.bubble, hb = hudBox(L.hudKeep || [], L.W);
    if (Bb && Bb.w > 0 && Bb.y - H >= L.ins.top - 10) {
      var bu = cut(Bb.y + 3, Bb.x + cfg.pigeonEdge, Bb.x + Bb.w - cfg.pigeonEdge, [L.keep[1], hb]);
      if (bu.hi - bu.lo >= 100) return bu;
    }
    var pm = this.pom || L.pom, ph = pm.h || L.pom.h;
    return { y: L.pom.y - ph + 10 - 20 * (pm.hop || 0), lo: L.pom.x - 0.08 * ph, hi: L.pom.x + 0.12 * ph, pom: true };
  };
  /** Where the pigeon stops to peck: on its ledge, away from the open shadows below it (the child's drop target). */
  P._pigeonPlan = function () {
    var g = this.pigeon, cfg = this.cfg;
    if (!g) return;
    var pr = this._perch(), lo = pr.lo, hi = pr.hi, best = hi, bd = -1e9;
    g.lo = lo; g.hi = hi;
    for (var x = lo; x <= hi + 1e-9; x += 8) {
      var dmin = 1e9;
      for (var i = 0; i < this.slots.length; i++) { var s = this.slots[i]; if (s.filled) continue; dmin = Math.min(dmin, hyp(x - s.x, pr.y - s.y)); }
      var sc = Math.min(dmin, 260) + this._crng.float(0, 10) - 0.05 * Math.abs(x - (lo + hi) / 2);
      if (sc > bd) { bd = sc; best = x; }
    }
    g.stopX = best;
  };
  /** The picture is done: the pigeon flies off at once (it must not ride the page turn). */
  P._pigeonLeave = function () { var g = this.pigeon; if (g && g.state !== 'fly') { g.state = 'fly'; g.leave = true; g.dir = 1; g.hop = 0; } return g; };
  P._tapPigeon = function () {
    var g = this.pigeon, c = this._pigeonC();
    this._touch();
    g.state = 'flap'; g.ft = 0; g.tapped = true;
    this._emit({ type: 'pigeonTap', x: c.x, y: c.y });
  };
  P._bubbleUnder = function (x, y) {
    for (var i = 0; i < this.bubbles.length; i++) { var b = this.bubbles[i]; if (b.state === 'rise' && hyp(x - b.x, y - b.y) <= b.r + this.cfg.bubblePad) return b; }
    return null;
  };
  P._popBubble = function (b) {
    this._touch();
    b.state = 'pop'; b.pt = 0; this._bubblePopped++;
    this._emit({ type: 'bubblePop', x: b.x, y: b.y });
  };
  /** The band the bubbles rise in: right of the board when there is room, else over the board (never over the tray). */
  P._bubbleBand = function () {
    var L = this.layout, B = L.board, cfg = this.cfg, r = cfg.bubbleR[1];
    var bx0 = B.x + B.w + cfg.frame + 8, bx1 = L.W - L.ins.right - 10;
    if (bx1 - bx0 >= 2 * r + 2 * cfg.bubbleWob + 20) return { x0: bx0 + r + cfg.bubbleWob, x1: bx1 - r - cfg.bubbleWob, y: L.tray.y - r - 8 };
    return { x0: B.x + r + 20, x1: B.x + B.w - r - 20, y: B.y + B.h - r };
  };
  P._stepSurprises = function (h) {
    var cfg = this.cfg, L = this.layout, play = this.state === 'round' && this.phase === 'play', g = this.pigeon, r = this._crng, i;
    // ---- pigeon
    if (this._pigeonNext >= 0 && play && !g) {
      this._pigeonNext -= h;
      if (this._pigeonNext < 0) {
        this._pigeonTimes++;
        var pr = this._perch();
        // it glides in from above the right edge and lands on the right end of its ledge (the top of the board frame)
        g = this.pigeon = { x: L.W + cfg.pigeonW, y: pr.y - 220, _px: 0, _py: 0, dir: -1, step: 0, flap: 1, state: 'land', t: 0, size: cfg.pigeonW, hop: 0,
          stopX: 0, stopT: 0, leave: false, tapped: false, ft: 0, peck: 0, lo: pr.lo, hi: pr.hi };
        g._px = g.x; g._py = g.y;
        this._pigeonPlan();
        g.lf = arc(g.x, g.y, g.hi, pr.y, cfg.pigeonLandTime, 30, 0);
        this._emit({ type: 'pigeon', x: Math.min(L.W - 40, g.hi), y: pr.y });
      }
    }
    if (g) {
      g.t += h;
      var gy = this._perch().y, travel = Math.max(0, (g.hi - g.stopX) / cfg.pigeonSpeed), stay = Math.max(1.5, cfg.pigeonStay - travel);
      if (g.state === 'land') {   // a short gliding arc onto the ledge, wings flapping, then a little landing squash of the hop
        g.ft += h;
        var lp = arcAt(g.lf, Math.min(g.ft, g.lf.T));
        g.x = lp.x; g.y = lp.y; g.flap = 0.5 + 0.5 * Math.sin(TAU * 7 * g.ft);
        if (g.ft >= g.lf.T) { g.state = 'walk'; g.ft = 0; g.x = g.hi; g.y = gy; g.flap = 0; g.lf = null; }
      } else if (g.state === 'walk') {
        var moving = g.leave || (g.dir < 0 && g.x > g.stopX);
        if (moving) {
          g.x += g.dir * cfg.pigeonSpeed * h; g.step = (g.step + h * 2.4) % 1; g.peck = 0;
          if (!g.leave && g.x <= g.stopX) g.x = g.stopX;
        } else {   // pecking at its spot: a waddle pause + head bobs
          g.stopT += h; g.step = 0; g.peck = Math.max(0, Math.sin(TAU * 1.4 * g.stopT));
          if (g.stopT >= stay) { g.leave = true; g.dir = 1; }
        }
        g.y = gy; g.hop = 0; g.flap = 0;
        if (g.leave && g.x >= g.hi) { g.x = g.hi; g.state = 'fly'; g.again = !g.tapped; }   // the end of the ledge: it flies off
      } else if (g.state === 'flap') {   // flaps up and lands again (feathers come from main via weather.burst)
        g.ft += h;
        var u = clamp(g.ft / cfg.pigeonFlapTime, 0, 1);
        g.hop = cfg.pigeonHop * 4 * u * (1 - u); g.y = gy - g.hop; g.flap = 0.5 + 0.5 * Math.sin(TAU * 6 * g.ft);
        if (u >= 1) { g.state = 'walk'; g.flap = 0; g.y = gy; g.hop = 0; g.stopT = Math.max(g.stopT, stay - 1.2); }
      } else if (g.state === 'fly') {
        g.x += 260 * h; g.y -= 140 * h; g.flap = 0.5 + 0.5 * Math.sin(TAU * 7 * g.t);
        if (g.x > L.W + cfg.pigeonW || g.y < -cfg.pigeonW) {
          this.pigeon = null;
          if (g.again && this._pigeonTimes < cfg.pigeonTimes && play) this._pigeonNext = cfg.pigeonGap;   // untapped: it comes back once
        }
      }
    }
    // ---- bubbles
    if (this._bubbleNext >= 0 && play && !this._bubblesLeft) {
      this._bubbleNext -= h;
      if (this._bubbleNext < 0) {
        this._bubbleWaves++; this._bubblesLeft = r.int(cfg.bubbleN[0], cfg.bubbleN[1]); this._bubbleT = 0; this._bubblePopped = 0;
        var band = this._bubbleBand();
        this._emit({ type: 'bubbles', x: (band.x0 + band.x1) / 2, y: band.y, n: this._bubblesLeft });
      }
    }
    if (this._bubblesLeft > 0) {
      this._bubbleT -= h;
      if (this._bubbleT <= 0) {
        var bd = this._bubbleBand(), br = r.float(cfg.bubbleR[0], cfg.bubbleR[1]), bx = r.float(bd.x0, Math.max(bd.x0, bd.x1));
        this.bubbles.push({ x: bx, y: bd.y, _px: bx, _py: bd.y, x0: bx, r: br, wob: r.float(0, TAU), vy: r.float(cfg.bubbleRise[0], cfg.bubbleRise[1]), pop: 0, state: 'rise', pt: 0, t: 0 });
        this._bubblesLeft--; this._bubbleT = cfg.bubbleGap;
        if (!this._bubblesLeft) this._waveEndCheck = true;
      }
    }
    for (i = this.bubbles.length - 1; i >= 0; i--) {
      var b = this.bubbles[i];
      b.t += h;
      if (b.state === 'rise') {
        b.wob += h * TAU * 0.8;
        b.y -= b.vy * h; b.x = b.x0 + cfg.bubbleWob * Math.sin(b.wob);
        if (b.y + b.r < -10) this.bubbles.splice(i, 1);
      } else {
        b.pt += h; b.pop = clamp(b.pt / cfg.bubblePopTime, 0, 1);
        if (b.pop >= 1) this.bubbles.splice(i, 1);
      }
    }
    if (this._waveEndCheck && !this.bubbles.length && !this._bubblesLeft) {
      this._waveEndCheck = false;
      if (!this._bubblePopped && this._bubbleWaves < cfg.bubbleWaves && play) this._bubbleNext = cfg.bubbleWaveGap;
    }
  };

  P._stepPom = function (h) {
    var b = this.pom, cfg = this.cfg, L = this.layout;
    b.x = L.pom.x; b.y = L.pom.y; b.h = L.pom.h;
    if (b.moodT > 0) { b.moodT -= h; if (b.moodT <= 0) { b.moodT = 0; b.mood = 'idle'; } }
    b.blinkT -= h;
    if (b.blink && b.blinkT <= 0) { b.blink = false; b.blinkT = this._crng.float(cfg.blink[0], cfg.blink[1]); }
    else if (!b.blink && b.blinkT <= 0) { b.blink = true; b.blinkT = cfg.blinkTime; }
    if (b._hopT >= 0) { b._hopT += h; var u = b._hopT / cfg.hopTime; b.hop = u < 1 ? Math.sin(Math.PI * u) : 0; if (u >= 1) b._hopT = -1; }
    var tx = L.board.x + L.board.w / 2, hp = this.held && this.pieceById(this.held);
    if (hp) tx = hp.x;
    else if (this.hintHand) tx = this.hintHand.x;
    else if (this.pigeon) tx = this.pigeon.x;
    else if (this.bubbles.length) tx = this.bubbles[0].x;
    b.lookX += (tx - b.lookX) * Math.min(1, h * cfg.lookRate);
    b.look = clamp((b.lookX - b.x) / 500, -1, 1);
  };

  PZ.World = World;
})(window.PZ = window.PZ || {});
