/* Kiki's Camp Chimes — CC.CONFIG + CC.World (headless, deterministic wind-chime simulation; DESIGN §2, §5.2)
 *
 * ============================== CONVENTIONS ==============================
 *  Units: logical px (short side 720), seconds, radians, y DOWN, rot > 0 clockwise. Screen space = world space (no camera).
 *  update(dt) runs fixed sub-steps of cfg.step (1/120 s). At the START of every sub-step every moving field is copied into
 *  its `_p` twin; render v = _v + (v − _v)·w.alpha.
 *
 *  CHIMES w.chimes[] (hook order, left → right) = { id, i, thing, note, target, size (body longest side, px), bw, bh (visible
 *    box), bcy (body centre below the cord end), hookX, hookY (hook point; the beam wobble is already added), cord (current
 *    length), cordRest, L (= cord + bcy, pendulum length), theta (rad, + = swung RIGHT), omega, spin (body twist relative to
 *    the cord), x, y (BODY TOP = the cord end), cx, cy (body centre), rot (= −theta + spin: the body's draw rotation),
 *    state 'enter'|'hang'|'out'|'gone', done (rung right this round), ring 0..1, dull 0..1 (a wrong ring: no rim flash),
 *    glow 0..1, clap −1..1, count −1|0..n, dim, pop 0..1 } + _px _py _pcx _pcy _ptheta _pspin _pcord _prot _ppop.
 *    Draw: drawCord(hookX, hookY → x, y) when cord > 2; translate(x, y) rotate(rot) scale(pop) → ChimeArt.drawChime(thing,
 *    size, {glow, ring, dim, count, clap, night, pop}).
 * ========================================================================
 */
(function (CC) {
  'use strict';

  var CONFIG = {
    // ---- timing / state machine (s)
    step: 1 / 120, maxFrame: 1.0,
    roundsPerLevel: 4, chapterTimeLimit: 75, chapterMinRounds: 2,
    shortBudget: [1e9, 30, 48, 62],   // s into the chapter: a round starting later than this is short (2 targets)
    introTime: 2.5, levelDoneTime: 3.6,
    talkAfterAnswer: 1.6, talkAskTime: 12, talkGlowAfterAsks: 2, talkMaxAsks: 3, talkGiveUp: 12,

    // ---- layout (DESIGN §2; px)
    shortSide: 720, minLong: 960, maxLong: 1600, tallRatio: 1.6, phoneRatio: 1.9,
    groundLand: 14, groundPort: 26,
    bubbleX: 24, bubbleYLand: 18, bubbleMaxW: 560, bubbleRight: 200, bubbleHLand: 134, bubbleYPort: 110, bubbleHPort: 124,
    hudW: 160, hudH: 96, bubbleMinW: 220,
    kikiXLand: 118, kikiXPort: 104, kikiHLand: 230, kikiHPort: 200, kikiTallK: 1.15, kikiFeet: 4, kikiWFrac: 0.62, kikiPad: 10,
    fireOffLand: 150, fireRightPort: 120, fireSLand: 1, fireSPort: 0.9, fireW: 120, fireH: 130, fireUp: 6, firePostGap: 10,
    beamX0Land: 250, beamSide: 36, beamTopLand: 210, beamBelowBubble: 92, beamR: 15, hookDrop: 6, postR: 16, postPad: 16,
    postAbove: 70, garlandAbove: 62, garlandSag: 26,
    kikiClear: 60, fireClear: 40, groundClear: 40,
    // item = the chime body size, chosen PER ROUND from its real chime count n (QA visual P1-1): iPad keeps the base item;
    // phones / tall screens grow up to itemCap. Portrait rounds that would get small chimes hang in a zig-zag (alternate short /
    // long cords, neighbours ≥ item + zigGap apart vertically) so the hooks may be spZig × item apart.
    item: { 3: 112, 4: 112, 5: 112, 6: 104, 7: 104 }, itemCap: 150, itemMin: { 3: 104, 4: 104, 5: 104, 6: 96, 7: 96 },
    maxChimes: { 3: 3, 4: 4, 5: 5, 6: 5, 7: 5 }, spMin: 1.3, spMax: 1.7, spTight: 1.18, spZig: 0.95, zigGap: 16, zigGain: 8,
    sizeK: { big: 1.25, small: 0.75 },
    cordLand: [90, 150], cordPort: [110, 190], cordTall: [160, 330], tallBeamGap: 120, cordStagger: 30, cordFloor: 50,
    hitK: 0.6, hitPad: 14, hitDiaPhone: 184, cordHitW: 26,   // phones / tall: hitPad grows so the hit diameter ≥ 184 logical ≈ 100 css px
    fairSwipe: true, coreK: 0.42, corePad: 8,                // judge the BODY core, brush the rim (playtest P1-1)

    // ---- chime physics: damped pendulum + secondary spin + clapper
    g: 2200, damp: 1.6, thetaMax: 0.8, edgePad: 6,         // full swing dies down in ≈ 3–4 s; |θ| ≤ 0.8 rad and the body never swings off screen
    spinOmega: 10, spinZeta: 0.25, spinK: 1.4, spinKick: 0.7, spinMax: 0.3,
    clapOmega: 16, clapZeta: 0.18, clapK: 30, clapKick: 0.8,
    breezeEvery: [0.4, 1.2], breezeAmp: 0.02,

    // ---- strikes (amplitudes in rad: an impulse dω = amp · ω0, ω0 = √(g / L))
    kTap: 0.32, swipeK: 0.35, swipeMin: 0.6, swipeMax: 1.6, rateLimit: 0.18, ringTime: 0.8, wrongRing: 0.5,
    softNudge: 0.03, beamWob: 2, wobOmega: 26, wobZeta: 0.25, countJingle: 0.05,

    // ---- enter: chimes drop on their unrolling cords and bounce on a vertical spring
    dropDelay: 0.15, dropStagger: 0.14, dropG: 2600, dropPop: 0.08, catchOmega: 14, catchZeta: 0.45, catchMaxBounce: 40,
    catchTheta: 0.06, enterMin: 1.2, enterTail: 0.25, enterWob: 3,

    // ---- notes → lanterns
    noteTime: 0.7, noteApex: 90, litRate: 3, flashTime: 0.6, lanternOmega: 5, lanternZeta: 0.12, lanternKick: 0.22, lanternSongKick: 0.12,

    // ---- play
    askGap: 1.0, countStep: 0.5, tapMovePx: 24, glowFlash: 1.0,

    // ---- song + out
    songAskDelay: 0.5, songWait: 4, cascadeGap: 0.16, kSong: 0.5, songTail: 0.6,
    outStagger: 0.08, outPull: 0.45, outPop: 0.14, outTime: 0.9, outKick: 0.12,

    // ---- help
    hintAfterMisses: 2, assistAfter: 6, assistAfterYoung: 3, assistMaxAge: 4, hintTime: 3.2, hintCooldown: 6, hintCycle: 1.6, swipeCycle: 2.0,
    idleTime: 12, idleBackoff: 1.5, idleMax: 30, idleHintFrom: 2,

    // ---- surprises: one round per chapter (round 1 or 2, never the warm-up); chapters 0–2 rotate the types, the night is fireflies
    surpriseRounds: [1, 2], surpriseTypes: ['hedgehog', 'bird'], nightSurprise: 'fireflies', nightLevel: 3,
    surpriseStepS: 1.8,   // a surprise comes ≤ (steps × 1.8 − 1) s after the first ask, so short rounds see it too
    hedgehogAt: [3, 5], hedgehogSpeed: 70, hedgehogSniff: 7, hedgehogR: 58, hedgehogLift: 34, hedgehogBallTime: 0.25, hedgehogRoll: 40,
    hedgehogRollTime: 0.6, hedgehogUncurl: 0.35, hedgehogBodyR: 30,
    birdAt: [3, 5], birdStay: 7, birdR: 48, birdLift: 30, birdFlyTime: 1.1, birdHopEvery: [0.9, 2], birdHopTime: 0.3, birdHopH: 14, birdSingTime: 1.0,
    firefliesAt: [3, 5], fireflyN: 5, fireflyR: 40, fireflyInTime: 1.6, fireflyStay: 14, fireflyZip: 0.8, fireflyStagger: 0.35,

    // ---- Kiki
    moodTime: { happy: 0.9, cheer: 1.6, oops: 0.8, think: 1.4, talk: 1.0, wave: 1.4, point: 1.2, dance: 0.5 },
    hopTime: 0.42, lookRate: 6, blink: [2.2, 5], blinkTime: 0.13
  };
  CC.CONFIG = CONFIG;

  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hyp(x, y) { return Math.sqrt(x * x + y * y); }
  function lerp(a, b, u) { return a + (b - a) * u; }
  function smooth(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  function sgn(v) { return v < 0 ? -1 : 1; }
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
   * above minY). */
  function arc(x0, y0, x1, y1, T, H, vx0, minY) {
    var lo = Math.min(y0, y1), ya = Math.min(lo, Math.max(lo - H, minY === undefined ? -1e9 : minY)), A0 = y0 - ya, A1 = y1 - ya;
    var sg = (Math.sqrt(2 * A0) + Math.sqrt(2 * A1)) / T, g = sg * sg;
    return { x0: x0, y0: y0, x1: x1, y1: y1, vx0: vx0 || 0, vy0: -Math.sqrt(2 * g * A0), ax: 2 * (x1 - x0 - (vx0 || 0) * T) / (T * T), ay: g, T: T, t: 0, ya: ya };
  }
  function arcAt(f, t) { return { x: f.x0 + f.vx0 * t + 0.5 * f.ax * t * t, y: f.y0 + f.vy0 * t + 0.5 * f.ay * t * t }; }
  /** Segment (ax, ay) → (bx, by) vs circle (cx, cy, r): the first parameter s ∈ [0, 1] inside the circle, or −1. */
  function segHit(ax, ay, bx, by, cx, cy, r) {
    var dx = bx - ax, dy = by - ay, fx = ax - cx, fy = ay - cy, a = dx * dx + dy * dy, c = fx * fx + fy * fy - r * r;
    if (c <= 0) return 0;
    if (a < 1e-9) return -1;
    var b = 2 * (fx * dx + fy * dy), disc = b * b - 4 * a * c;
    if (disc < 0) return -1;
    var s = (-b - Math.sqrt(disc)) / (2 * a);
    return s >= 0 && s <= 1 ? s : -1;
  }
  function segDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, u = l2 > 0 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
    return hyp(px - ax - u * dx, py - ay - u * dy);
  }

  /** DESIGN §2 short-side rule: CSS viewport → logical W×H. */
  function logicalSize(cssW, cssH, cfg) {
    cfg = cfg || CONFIG;
    var S = cfg.shortSide, aspect = cssW / Math.max(1, cssH);
    if (cssW >= cssH) return { W: clamp(Math.round(S * aspect), cfg.minLong, cfg.maxLong), H: S };
    return { W: S, H: clamp(Math.round(S / aspect), cfg.minLong, cfg.maxLong) };
  }
  function ageKey(age) { return clamp(Math.round(+age || 4), 3, 7); }

  /** The visible body box {w, h, cy} of a chime (ChimeArt.bodyBox when loaded, else an estimate per kind); h, w ≤ size. */
  function bodyBox(thing, size) {
    var A = CC.ChimeArt;
    if (A && typeof A.bodyBox === 'function') {
      try {
        var b = A.bodyBox(thing, size);
        if (b && b.w > 0 && b.h > 0) { var h = Math.min(size, b.h); return { w: Math.min(size, b.w), h: h, cy: clamp(+b.cy || h / 2, 0.2 * h, h) }; }
      } catch (e) { /* headless */ }
    }
    var w = 1, hh = 1, k = thing && thing.kind;
    if (k === 'bell') w = 0.86;
    else if (k === 'plate') {
      var s = thing.shape;
      if (s === 'rect') hh = 0.667; else if (s === 'oval') w = 0.74; else if (s === 'triangle' || s === 'heart') hh = 0.9; else if (s === 'diamond') w = 0.8;
    } else if (k === 'string') { w = Math.min(1, 0.45 + 0.13 * (thing.n || 1)); hh = 0.95; }
    else if (k === 'glyph') w = 0.86;
    return { w: w * size, h: hh * size, cy: hh * size * (k === 'bell' ? 0.55 : 0.5) };
  }

  /* ---------------------------------------------------------------- layout (DESIGN §2)
   * Sized for n chimes (the round's real count; maxChimes[age] between rounds). Candidates, the first that fits wins:
   *   row:  item = min(cap, usable / (n × 1.3))  (cap = itemCap 150 on phones / tall screens, else the age's base item)
   *   zig (portrait, n ≥ 3, enough cord range): item = min(cap, usable / (n × 0.95)) when ≥ zigGain px bigger than the row
   *   then the row at itemMin × 1.3, itemMin × 1.18, finally (odd viewports only) a squeezed item at 1.18. */
  function computeLayout(W, H, ins, cfg, age, hudKeep, n) {
    var a = ageKey(age), portrait = H > W, phone = (portrait ? H / W : W / H) > cfg.phoneRatio, tall = H / W > cfg.tallRatio;
    n = Math.max(1, Math.round(n || cfg.maxChimes[a]));
    var base = cfg.item[a], lo = cfg.itemMin[a] || base, cap = (tall || phone) ? Math.max(base, cfg.itemCap) : base;
    var probe = layoutTier(W, H, ins, cfg, a, hudKeep, base, cfg.spMin, n, false), usable = probe.usable, L;
    var row = Math.min(cap, Math.floor(usable / (n * cfg.spMin)));
    var tiers = [];
    // zig: (n − 1) gaps of 0.95 × item + one item width, so the end bodies stay inside
    if (portrait && n >= 3) { var zi = Math.min(cap, Math.floor(usable / ((n - 1) * cfg.spZig + 1))); if (zi >= row + cfg.zigGain && row < cap) tiers.push([zi, cfg.spZig, true]); }
    if (row >= Math.min(cap, base) || row >= lo) tiers.push([row, cfg.spMin, false]);
    tiers.push([lo, cfg.spMin, false]); tiers.push([lo, cfg.spTight, false]);
    for (var t = 0; t < tiers.length; t++) {
      L = layoutTier(W, H, ins, cfg, a, hudKeep, tiers[t][0], tiers[t][1], n, tiers[t][2]);
      L.tier = t;
      if (L.fits) return L;
    }
    var sq = Math.max(72, Math.floor(usable / (n * cfg.spTight)));   // an odd viewport (never an Apple device)
    L = layoutTier(W, H, ins, cfg, a, hudKeep, Math.min(lo, sq), cfg.spTight, n, false); L.tier = tiers.length; L.squeezed = true;
    return L;
  }
  /** The HUD's measured box among the hudKeep boxes (the one in the right half; main.js passes [HUD, bubble]). */
  function hudBox(hk, W) { var best = null; for (var i = 0; i < hk.length; i++) { var b = hk[i]; if (b.x + b.w / 2 > W / 2 && (!best || b.y + b.h > best.y + best.h)) best = b; } return best; }
  function layoutTier(W, H, ins, cfg, a, hudKeep, item, spK, n, zig) {
    ins = insOf(ins);
    var portrait = H > W, tall = H / W > cfg.tallRatio, phone = (portrait ? H / W : W / H) > cfg.phoneRatio;
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
    var kh = portrait ? Math.round(cfg.kikiHPort * (tall ? cfg.kikiTallK : 1)) : cfg.kikiHLand;
    var kiki = { x: ins.left + (portrait ? cfg.kikiXPort : cfg.kikiXLand), y: groundY - cfg.kikiFeet, h: kh, w: cfg.kikiWFrac * kh };
    var kikiBox = { x: kiki.x - kiki.w / 2 - cfg.kikiPad, y: kiki.y - kh - cfg.kikiPad, w: kiki.w + 2 * cfg.kikiPad, h: kh + 2 * cfg.kikiPad };
    var bx0 = ins.left + (portrait ? cfg.beamSide : cfg.beamX0Land), bx1 = W - ins.right - cfg.beamSide;
    // the campfire (decoration): landscape right of Kiki — moved right of the left post when it would stand in it
    var fs = portrait ? cfg.fireSPort : cfg.fireSLand, fw = cfg.fireW * fs, fh = cfg.fireH * fs;
    var fx = portrait ? W - ins.right - cfg.fireRightPort : kiki.x + cfg.fireOffLand;
    if (!portrait) fx = Math.max(fx, bx0 + cfg.postR + cfg.firePostGap + fw / 2);
    var fire = { x: fx, y: groundY - cfg.fireUp, s: fs, w: fw, h: fh };
    var fireBox = { x: fx - fw / 2, y: fire.y - fh, w: fw, h: fh };
    var maxSize = item * (a <= 4 ? cfg.sizeK.big : 1);   // the size topic's big bell (ages ≤ 4)
    var keepTop = 0;
    hk.forEach(function (b) { if (b.y + b.h < H / 2) keepTop = Math.max(keepTop, b.y + b.h); });
    var beamMin = Math.max(bubble.y + bubble.h + cfg.beamBelowBubble, keepTop + cfg.beamBelowBubble, portrait ? 0 : ins.top + cfg.beamTopLand);
    var cr = portrait ? (tall ? cfg.cordTall : cfg.cordPort) : cfg.cordLand, hookDy = cfg.beamR + cfg.hookDrop, limit, beamY;
    if (portrait) {   // the lowest chime bottom ≥ 60 px above Kiki's head and ≥ 40 px above the fire top
      limit = Math.min(kiki.y - kiki.h - cfg.kikiClear, fireBox.y - cfg.fireClear);
      // tall phones: the beam hangs high (bubble bottom + 120) and the long cords fill the middle (QA visual P2-1)
      beamY = tall ? Math.max(beamMin, bubble.y + bubble.h + cfg.tallBeamGap) : Math.max(beamMin, limit - hookDy - cr[1] - maxSize);
    } else {
      limit = groundY - cfg.groundClear;
      beamY = beamMin;
    }
    var cordMax = Math.min(cr[1], limit - beamY - hookDy - maxSize);
    var cordMin = Math.max(cfg.cordFloor, Math.min(cr[0], cordMax - cfg.cordStagger));
    var beam = { x0: bx0, x1: bx1, y: beamY, r: cfg.beamR, hookY: beamY + hookDy };
    var posts = [{ x: bx0, top: beamY - cfg.postAbove, bottom: groundY }, { x: bx1, top: beamY - cfg.postAbove, bottom: groundY }];
    var garland = { x0: bx0, x1: bx1, y: beamY - cfg.garlandAbove, sag: cfg.garlandSag };
    var usable = bx1 - bx0 - 2 * cfg.postPad;
    var hitPad = (tall || phone) ? Math.max(cfg.hitPad, cfg.hitDiaPhone / 2 - cfg.hitK * item) : cfg.hitPad;
    var L = { W: W, H: H, ins: ins, portrait: portrait, tall: tall, phone: phone, groundY: groundY, bubble: bubble, hud: hud,
      kiki: kiki, kikiBox: kikiBox, fire: fire, fireBox: fireBox, beam: beam, posts: posts, garland: garland, lanterns: [], hooks: [],
      item: item, spK: spK, maxSize: maxSize, cord: [cordMin, cordMax], limit: limit, fireLimit: fireBox.y - cfg.fireClear,
      usable: usable, hitPad: hitPad, hitR: cfg.hitK * item + hitPad, n: n, zig: !!zig,
      band: { x: bx0 - 20, y: beamY - cfg.beamR - 20, w: bx1 - bx0 + 40, h: hookDy + cordMax + maxSize + cfg.beamR + 40 },
      safe: { x: ins.left, y: ins.top, w: W - ins.left - ins.right, h: H - ins.bottom - ins.top } };
    L.keep = [{ x: bubble.x, y: bubble.y, w: bubble.w, h: bubble.h, kind: 'bubble' }, { x: hud.x, y: hud.y, w: hud.w, h: hud.h, kind: 'hud' }];
    hk.forEach(function (b) { b.kind = 'hudKeep'; L.keep.push(b); });
    var span = zig ? ((n - 1) * spK + 1) * item : n * spK * item;
    var fireOk = portrait || L.fireLimit - beam.hookY - item >= 20;   // a chime over the landscape fire still hangs on a cord ≥ 20 px
    L.fits = span <= usable + 1e-6 && cordMax >= cfg.cordFloor && fireOk && (!zig || cordMax - cordMin >= item + cfg.zigGap);
    return L;
  }
  /** Hook points for n chimes: centred on the beam, spacing clamp(usable / n, spK × item, spMax × item) (zig-zag: ≤ 1.3 × item). */
  function hooksFor(L, n, cfg) {
    var sp = L.zig ? clamp((L.usable - L.item) / Math.max(1, n - 1), L.spK * L.item, cfg.spMin * L.item)
      : clamp(L.usable / Math.max(1, n), L.spK * L.item, cfg.spMax * L.item), mid = (L.beam.x0 + L.beam.x1) / 2, out = [];
    for (var i = 0; i < n; i++) out.push({ x: mid + (i - (n - 1) / 2) * sp, y: L.beam.hookY });
    return out;
  }
  /** n lantern centres, evenly spaced between the post tops, on the garland's sag curve. */
  function lanternsFor(L, n) {
    var G = L.garland, out = [];
    for (var i = 0; i < n; i++) {
      var u = (i + 1) / (n + 1);
      out.push({ x: lerp(G.x0, G.x1, u), y: G.y + G.sag * 4 * u * (1 - u) });
    }
    return out;
  }

  // ------------------------------------------------------------------ World
  function World(opts) {
    opts = opts || {};
    this.cfg = merge(CONFIG, opts.config);
    this.seed = opts.seed !== undefined ? opts.seed : 1;
    this.rng = new CC.RNG(this.seed);
    this._crng = new CC.RNG((CC.RNG.hash(this.seed) ^ 0x51ed27) >>> 0);   // cosmetic randomness (breeze, kicks, blinks, surprises)
    this.age = CC.Content.ageOf(opts.age !== undefined ? opts.age : 4);
    this.lang = opts.lang === 'vi' ? 'vi' : 'en';
    this._pendingAge = this.age; this._pendingLang = this.lang;
    this.state = 'menu'; this.phase = null;
    this.level = 0; this.levels = []; this.topic = null; this.weather = 0;
    this.round = 0; this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.stars = 0; this.levelStars = 0; this.roundStars = 0; this.misses = 0; this.stepMisses = 0; this.streak = 0;
    this.time = 0; this.stateTime = 0; this.phaseTime = 0; this.alpha = 0; this._acc = 0;
    this.cur = null; this.step = -1; this.talk = null; this.talkAnswered = null;
    this.chimes = []; this.lanterns = []; this.notes = []; this.songs = []; this.fireflies = [];
    this.hedgehog = null; this.bird = null; this.hintHand = null; this.assistId = null;
    this.beam = { wob: 0, _pwob: 0, vwob: 0 };
    this.kiki = { x: 0, y: 0, h: 200, w: 124, mood: 'idle', moodT: 0, blinkT: 3, blink: false, look: 0, lookX: 0, hop: 0, _phop: 0, _hopT: -1 };
    this.finger = { x: 0, y: 0, down: false };
    this.hudKeep = opts.hudKeep || null; this.lastTopics = null; this.surprise = null; this._surpriseOff = 0; this._surpriseRound = 1;
    this.events = []; this.sessions = 0;
    this._idleN = 0; this._idleT = 0; this._idleGap = this.cfg.idleTime; this._lastHintT = -1e9; this.levelStartTime = 0;
    this._talkAskT = 0; this._talkAsks = 0; this._g = null;
    this._usedKeys = []; this._prevAns = null; this._prevAnsRun = 0; this._stepDone = false; this._waitAsk = -1; this._noProg = 0;
    this._view = null; this._vp = null; this._breezeT = 1; this._lastNote = -1; this._lit = 0; this._song = null; this._lookT = 0; this._lookX = 0;
    this.setViewport(opts.width || 1280, opts.height || 720, opts.ins || null);
  }
  World.logicalSize = logicalSize;
  World.computeLayout = function (W, H, ins, cfg, age, hudKeep, n) { return computeLayout(W, H, ins, merge(CONFIG, cfg), age === undefined ? 4 : age, hudKeep, n); };
  World.hooksFor = function (L, n, cfg) { return hooksFor(L, n, merge(CONFIG, cfg)); };
  World.lanternsFor = lanternsFor;
  World.bodyBox = bodyBox;
  World.kickFor = kickFor;
  World.arc = arc;
  World.segHit = segHit;

  var P = World.prototype;
  /** true while a first contact on the asked chime would be judged right now (round, play phase, the step open). */
  Object.defineProperty(P, 'interactive', { get: function () { return this.state === 'round' && this.phase === 'play' && !this._stepDone; } });
  Object.defineProperty(P, 'stepInfo', { get: function () { return this.cur && this.step >= 0 ? this.cur.steps[this.step] || null : null; } });
  P._emit = function (e) { this.events.push(e); };
  P.drainEvents = function () { var e = this.events; this.events = []; return e; };
  P.setAge = function (a) { this._pendingAge = CC.Content.ageOf(a); };
  P.setLang = function (l) { this._pendingLang = l === 'vi' ? 'vi' : 'en'; };
  P._setState = function (s) { this.state = s; this.stateTime = 0; };
  P._setPhase = function (p) { this.phase = p; this.phaseTime = 0; };
  P._mood = function (m, t) { this.kiki.mood = m; this.kiki.moodT = t || this.cfg.moodTime[m] || 1; };
  P._hop = function () { this.kiki._hopT = 0; };
  P.skipTalk = function () { if (this.state === 'talk') this._levelDone(); };
  P.chimeById = function (id) { for (var i = 0; i < this.chimes.length; i++) if (this.chimes[i].id === id) return this.chimes[i]; return null; };
  P._kikiMouth = function () { var B = this.layout.kiki; return { x: B.x + 0.18 * B.h, y: B.y - 0.62 * B.h }; };
  P._assistAfter = function () { return this.age <= this.cfg.assistMaxAge ? this.cfg.assistAfterYoung : this.cfg.assistAfter; };
  P._bandCentre = function () { var b = this.layout.band; return { x: b.x + b.w / 2, y: this.layout.beam.hookY + this.layout.cord[1] * 0.6 }; };

  /** The current question {promptKey, params, mode, step, nameKind, nameValue, need} (enter / play), else null. */
  P.prompt = function () {
    if (this.state !== 'round' || !this.cur || (this.phase !== 'play' && this.phase !== 'enter')) return null;
    var i = Math.max(0, this.step), s = this.cur.steps[i];
    if (!s) return null;
    return { promptKey: s.promptKey, params: s.params, mode: s.mode, step: i, nameKind: s.nameKind, nameValue: s.nameValue, need: s.need };
  };

  // ---------------------------------------------------------------- geometry + test hooks (logical px)
  P._hitR = function (c) { return this.cfg.hitK * c.size + (this.layout.hitPad === undefined ? this.cfg.hitPad : this.layout.hitPad); };
  /** The body core (judged on a slide / press): r = 0.42 × size + 8 — cores of neighbours never overlap. */
  P._coreR = function (c) { return this.cfg.coreK * c.size + this.cfg.corePad; };
  P._coreSet = function (x, y) {
    var o = {};
    for (var i = 0; i < this.chimes.length; i++) { var q = this.chimes[i]; if (this._touchable(q) && hyp(x - q.cx, y - q.cy) <= this._coreR(q)) o[q.id] = true; }
    return o;
  };
  /** The chime's hit circle {x, y, r} (body centre where it is now, r = 0.6 × size + 14). */
  P.chimeHit = function (id) { var c = this.chimeById(id); return c && c.state !== 'gone' ? { x: c.cx, y: c.cy, r: this._hitR(c) } : null; };
  P._touchable = function (c) { return c.state === 'hang' || (c.state === 'enter' && c.caught); };
  /** The chime under (x, y): inside its hit circle or on its cord (a 26 px capsule from the hook to the body top); the nearest
   *  centre (or cord line) wins. */
  P._chimeAt = function (x, y) {
    var best = null, bd = 1e9, cw = this.cfg.cordHitW / 2;
    for (var i = 0; i < this.chimes.length; i++) {
      var c = this.chimes[i];
      if (!this._touchable(c)) continue;
      var d = hyp(x - c.cx, y - c.cy), ok = d <= this._hitR(c);
      if (c.cord > 4) { var dc = segDist(x, y, c.hookX, c.hookY, c.x, c.y); if (dc <= cw) { ok = true; d = Math.min(d, dc); } }
      if (ok && d < bd) { bd = d; best = c; }
    }
    return best;
  };
  /** Kiki's tap box {x, y (top-left), w, h, cx, cy}. */
  P.kikiHit = function () { var b = this.layout.kikiBox; return { x: b.x, y: b.y, w: b.w, h: b.h, cx: b.x + b.w / 2, cy: b.y + b.h / 2 }; };
  P.beamHit = function () { var B = this.layout.beam; return { x0: B.x0, x1: B.x1, y: B.y + this.beam.wob, r: B.r, band: this.layout.band }; };
  P._clearOfChimes = function (x, y, r) {
    for (var i = 0; i < this.chimes.length; i++) {
      var c = this.chimes[i];
      if (c.state === 'gone') continue;
      if (hyp(x - c.cx, y - c.cy) < this._hitR(c) + r * 0.5) return false;
      if (c.cord > 4 && segDist(x, y, c.hookX, c.hookY, c.x, c.y) < this.cfg.cordHitW / 2 + r * 0.5) return false;
    }
    return true;
  };
  P._clearOfKeep = function (x, y, r) { var K = this.layout.keep; for (var k = 0; k < K.length; k++) if (inBox(K[k], x, y, r * 0.5)) return false; return true; };
  /** The hedgehog's tap circle while it can be tapped (walking / sniffing, on screen), else null. */
  P.hedgehogHit = function () {
    var g = this.hedgehog, L = this.layout, cfg = this.cfg;
    if (!g || (g.state !== 'walk' && g.state !== 'sniff') || g.x < L.ins.left + 30 || g.x > L.W - L.ins.right - 30) return null;
    var c = { x: g.x, y: g.y - cfg.hedgehogLift, r: cfg.hedgehogR };
    return this._chimeAt(c.x, c.y) ? null : c;
  };
  /** The bird's tap circle while it sits on the beam, else null. */
  P.birdHit = function () {
    var b = this.bird, cfg = this.cfg;
    if (!b || b.state !== 'perch') return null;
    var c = { x: b.x, y: b.y - cfg.birdLift, r: cfg.birdR };
    return this._chimeAt(c.x, c.y) ? null : c;
  };
  /** The first firefly that can be tapped (drifting, on screen, clear of chimes and of the HUD / bubble), else null. */
  P.fireflyHit = function () {
    var L = this.layout, r = this.cfg.fireflyR;
    for (var i = 0; i < this.fireflies.length; i++) {
      var f = this.fireflies[i];
      if (f.state !== 'drift' || f.y < L.ins.top + 10 || f.x < L.ins.left + 10 || f.x > L.W - L.ins.right - 10) continue;
      if (this._chimeAt(f.x, f.y) || !this._clearOfKeep(f.x, f.y, r)) continue;
      return { x: f.x, y: f.y, r: r, i: i };
    }
    return null;
  };
  P._fireflyAt = function (x, y) {
    var r = this.cfg.fireflyR, best = null, bd = 1e9;
    for (var i = 0; i < this.fireflies.length; i++) { var f = this.fireflies[i], d = hyp(x - f.x, y - f.y); if (f.state === 'drift' && d <= r && d < bd) { bd = d; best = f; } }
    return best;
  };
  /** What to touch next: {chime: id} in play (the asked chime), {song: true} while the song waits for its swipe, else null. */
  P.answer = function () {
    if (this.state === 'roundDone' && this.phase === 'song' && this._song && !this._song.started) return { song: true };
    if (!this.interactive) return null;
    var c = this._askedChime();
    return c ? { chime: c.id } : null;
  };
  /** The asked chime (find: the target; findAll: the first target not rung right yet). */
  P._askedChime = function () {
    var s = this.stepInfo;
    if (!s) return null;
    for (var i = 0; i < s.targets.length; i++) { var c = this.chimeById(s.targets[i]); if (c && !c.done) return c; }
    return null;
  };

  // ---------------------------------------------------------------- viewport
  P.setViewport = function (W, H, ins) { this._view = { W: W, H: H, ins: insOf(ins) }; this._relayout(false); };
  P._relayout = function (force) {
    var v = this._view;
    var n = this.chimes.length || this.cfg.maxChimes[this.age];   // sized for THIS round's chimes (QA visual P1-1)
    var key = v.W + 'x' + v.H + ':' + JSON.stringify(v.ins) + ':' + this.age + ':' + n + ':' + JSON.stringify(this.hudKeep || null);
    if (key === this._vp && !force) return false;
    var had = !!this.layout;
    this._vp = key;
    this.layout = computeLayout(v.W, v.H, v.ins, this.cfg, this.age, this.hudKeep, n);
    this.layout.hudKeep = keepBoxes(this.hudKeep);
    var K = this.layout.kiki;
    this.kiki.x = K.x; this.kiki.y = K.y; this.kiki.h = K.h; this.kiki.w = K.w;
    this.layout.hooks = hooksFor(this.layout, n, this.cfg);
    this.layout.lanterns = lanternsFor(this.layout, this.lanterns.length);
    if (had) this._snapAll();
    return true;
  };
  /** Rotation / resize mid-round (DESIGN §5.2): cancel the gesture, hooks + cords re-placed (deterministic per round), chimes keep
   *  theta / omega, lanterns move, notes in flight retarget, surprises re-placed. */
  P._snapAll = function () {
    var i, L = this.layout, self = this;
    this.cancelDrag();
    if (this.chimes.length) {
      this._placeChimes(true);
      this.chimes.forEach(function (c) { self._pose(c); self._twinChime(c); });
    }
    for (i = 0; i < this.lanterns.length; i++) { var ln = this.lanterns[i], p = L.lanterns[i]; ln.x = p.x; ln.y = p.y; }
    for (i = 0; i < this.notes.length; i++) {
      var n = this.notes[i], to = L.lanterns[n.lantern] || { x: n.x1, y: n.y1 }, T = Math.max(0.3, n.T - n.t);
      n.x = clamp(n.x, 0, L.W); n.y = clamp(n.y, 0, L.H);
      n.f = arc(n.x, n.y, to.x, to.y, T, this.cfg.noteApex * 0.5, 0, L.ins.top + 8);
      n.x0 = n.x; n.y0 = n.y; n.x1 = to.x; n.y1 = to.y; n.T = n.t + T; n.t0 = n.t; n._px = n.x; n._py = n.y;
    }
    if (this.hedgehog) { var hg = this.hedgehog; hg.y = hg._py = this._hedgehogY(); hg.stopX = this._hedgehogStop(); if (hg.state !== 'walk' && hg.state !== 'leave') hg.x = hg._px = hg.stopX; }
    if (this.bird) { var b = this.bird; this._birdPlan(); if (b.state === 'perch') { b.x = b._px = b.perchX + b.hopX; b.y = b._py = b.perchY; } else if (b.f && b.state === 'fly') { b.f = arc(b.x, b.y, b.perchX, b.perchY, Math.max(0.3, b.f.T - b.ft), 40, 0); b.ft = 0; } }
    if (this.fireflies.length) this._fireflyAnchors();
    this.hintHand && this._stepHint(0);
  };
  /** Hooks, sizes, boxes and cord lengths of the round's chimes (staggered per round seed: neighbours differ ≥ 30 px). */
  P._placeChimes = function (snap) {
    var L = this.layout, cfg = this.cfg, self = this, n = this.chimes.length;
    L.hooks = hooksFor(L, n, cfg);
    this.chimes.forEach(function (c, i) {
      c.i = i; c.hookX = L.hooks[i].x; c.size = Math.round(L.item * (c.thing.size ? cfg.sizeK[c.thing.size] || 1 : 1));
      var b = bodyBox(c.thing, c.size); c.bw = b.w; c.bh = b.h; c.bcy = b.cy;
    });
    var rr = new CC.RNG(((this.cur ? this.cur.seed : 1) ^ 0x2c1b3a77) >>> 0), prev = null, st = cfg.cordStagger;
    var lims = this.chimes.map(function (c) {
      var lim = L.limit;
      if (!L.portrait && Math.abs(c.hookX - L.fire.x) < L.fire.w / 2 + c.bw / 2 + 20) lim = Math.min(lim, L.fireLimit);
      var cmax = Math.min(L.cord[1], lim - L.beam.hookY - c.bh), cmin = Math.max(cfg.cordFloor, Math.min(L.cord[0], cmax - st));
      if (cmax < cmin) { cmin = cmax = Math.max(20, cmax); }
      return [cmin, cmax];
    });
    if (L.zig && n >= 2) {   // zig-zag: alternate short / long cords; a long chime's body starts below its short neighbours' bodies
      var first = rr.chance(0.5) ? 0 : 1, chs = this.chimes;
      chs.forEach(function (c, i) {   // short ones: near the bottom of their range, leaving room for a long neighbour below them
        if ((i + first) % 2 !== 0) return;
        var slack = Math.max(0, Math.min(20, lims[i][1] - lims[i][0] - (L.item + cfg.zigGap) - 4));
        c.cordRest = lims[i][0] + rr.float(0, slack);
      });
      chs.forEach(function (c, i) {
        if ((i + first) % 2 === 0) return;
        var lo = lims[i][0];
        [i - 1, i + 1].forEach(function (j) { var q = chs[j]; if (q) lo = Math.max(lo, q.cordRest + q.bh + cfg.zigGap); });
        c.cordRest = Math.min(lims[i][1], rr.float(lo, Math.max(lo, Math.min(lims[i][1], lo + 24))));
      });
    } else this.chimes.forEach(function (c, i) {
      var cmin = lims[i][0], cmax = lims[i][1], v = -1;
      if (cmax - cmin < 2 * st) {   // a tight range: alternate its ends (the farther one from the neighbour)
        v = prev === null ? (rr.chance(0.5) ? cmin : cmax) : Math.abs(cmax - prev) >= Math.abs(cmin - prev) ? cmax : cmin;
      } else {
        for (var t = 0; t < 24 && v < 0; t++) { var q = rr.float(cmin, cmax); if (prev === null || Math.abs(q - prev) >= st - 1e-6) v = q; }
        if (v < 0) v = Math.abs(cmax - prev) >= Math.abs(cmin - prev) ? cmax : cmin;
      }
      c.cordRest = v; prev = v;
    });
    if (snap) this.chimes.forEach(function (c) {
      var v = c.cordRest;
      if (c.state === 'hang' || (c.state === 'enter' && c.caught)) { c.cord = v; c.vcord = 0; }
      else if (c.state === 'enter' || c.state === 'out') c.cord = Math.min(c.cord, v);
    });
    void self;
  };

  // ---------------------------------------------------------------- session flow
  P.newSession = function (opts) {
    this.age = this._pendingAge; this.lang = this._pendingLang;
    this._relayout(false);
    this.sessions++;
    this._clearRound(); this.cur = null; this.state = 'menu';
    var last = (opts && opts.lastTopics) || this.lastTopics || null;
    this.levels = CC.Content.topicsFor(this.age, this.rng, last);
    this._surpriseOff = this.rng.int(0, Math.max(0, this.cfg.surpriseTypes.length - 1));
    this.stars = 0; this.songs = []; this._prevAns = null; this._prevAnsRun = 0;
    this.weather = 0;
    this._emit({ type: 'session', levels: this.levels.slice() });
    this.startLevel(0);
  };
  /** keep = true between two rounds: a hedgehog / bird / fireflies already leaving finish their exit. */
  P._clearRound = function (keep) {
    this.chimes = []; this.lanterns = []; this.notes = []; this.step = -1; this._g = null; this.finger.down = false;
    if (!keep || !this.hedgehog || this.hedgehog.state !== 'leave') this.hedgehog = null;
    if (!keep || !this.bird || this.bird.state !== 'leave') this.bird = null;
    this.fireflies = keep ? this.fireflies.filter(function (f) { return f.state === 'zip'; }) : [];
    this.hintHand = null; this.assistId = null;
    this._stepDone = false; this._waitAsk = -1; this._song = null; this._lit = 0;
    this._hedgehogNext = -1; this._birdNext = -1; this._firefliesNext = -1;
    this.beam.wob = this.beam._pwob = 0; this.beam.vwob = 0;
    this.layout.lanterns = [];
  };
  P.startLevel = function (i) {
    if (!this.levels.length) this.levels = CC.Content.topicsFor(this.age);
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
  /** The surprise type of this chapter: the night chapter has fireflies, the others rotate hedgehog / bird. */
  P._surpriseType = function () {
    var ST = this.cfg.surpriseTypes;
    if (!ST || !ST.length) return null;
    if (this.level === this.cfg.nightLevel && this.cfg.nightSurprise) return this.cfg.nightSurprise;
    return ST[(this.level + this._surpriseOff) % ST.length];
  };

  P._beginRound = function () {
    var cfg = this.cfg, self = this, L = this.layout;
    var rr = new CC.RNG((this.rng.next() * 4294967296) >>> 0);
    var sp = this.round === this._surpriseRound && this.round > 0 ? this._surpriseType() : null;
    var el = this.time - this.levelStartTime, sb = cfg.shortBudget, short = !!(sb && this.round > 0 && el > sb[Math.min(this.round, sb.length - 1)]);
    var cur = CC.Content.makeRound(this.topic, { age: this.age, lang: this.lang, rng: rr, roundIndex: this.round, surprise: sp, short: short, level: this.level,
      usedKeys: this._usedKeys, prevAns: this._prevAns, prevAnsRun: this._prevAnsRun });
    this._usedKeys.push(cur.key);
    this._clearRound(true);
    this.cur = cur; this.surprise = cur.surprise;
    this.misses = 0; this.stepMisses = 0; this.streak = 0; this._noProg = 0;
    this.chimes = cur.chimes.map(function (q, i) {
      return { id: q.id, i: i, thing: q.thing, note: q.note, target: q.target, size: 0, bw: 0, bh: 0, bcy: 0, hookX: 0, hookY: 0,
        cord: 0, vcord: 0, cordRest: 0, L: 1, theta: 0, omega: 0, spin: 0, vspin: 0, clap: 0, vclap: 0, alphaT: 0,
        x: 0, y: 0, cx: 0, cy: 0, rot: 0, state: 'enter', caught: false, done: false, ring: 0, dull: 0, glow: 0, count: -1, dim: 0, pop: 0,
        _hitT: -1e9, _glowT: 0, _flashT: 0, _countT: 0, _dropAt: cfg.dropDelay + i * cfg.dropStagger, _outAt: 0, _outT: -1, _outCord: 0,
        _px: 0, _py: 0, _pcx: 0, _pcy: 0, _ptheta: 0, _pspin: 0, _pcord: 0, _prot: 0, _ppop: 0 };
    });
    this._roundAssisted = false;
    this._relayout(false); L = this.layout;   // item / hooks sized for this round's chime count
    this._placeChimes(false);
    this.chimes.forEach(function (c) { self._pose(c); self._twinChime(c); });
    var nL = cur.steps.reduce(function (s, st) { return s + st.need; }, 0);
    L.lanterns = lanternsFor(L, nL);
    this.lanterns = L.lanterns.map(function (p) { return { x: p.x, y: p.y, lit: 0, color: null, swing: 0, vswing: 0, flash: 0, _plit: 0, _pswing: 0, _litT: 0 }; });
    var maxRest = Math.max.apply(null, this.chimes.map(function (c) { return c.cordRest; }));
    var lastCatch = cfg.dropDelay + (this.chimes.length - 1) * cfg.dropStagger + Math.sqrt(2 * maxRest / cfg.dropG);
    this._enterTime = Math.max(cfg.enterMin, lastCatch + cfg.enterTail);
    this.beam.vwob += kickFor(cfg.enterWob, cfg.wobOmega, cfg.wobZeta);
    this._idleT = 0; this._idleGap = cfg.idleTime; this._idleN = 0;
    this._setState('round'); this._setPhase('enter');
    this._mood('happy', 1.2);
    var bc = this._bandCentre();
    this._emit({ type: 'round', round: this.round, topic: this.topic, surprise: cur.surprise, chimes: this.chimes.length, lanterns: nL,
      steps: cur.steps.length, mode: cur.steps[0].mode, short: cur.short, key: cur.key, x: bc.x, y: bc.y });
  };

  /** Ask the current step. */
  P._ask = function (first) {
    var cfg = this.cfg, cur = this.cur, s = this.stepInfo;
    if (!s) { this._startSong(); return; }
    this._stepDone = false; this._waitAsk = -1; this.stepMisses = 0; this._noProg = 0; this._disarm();
    this._idleT = 0; this._idleGap = cfg.idleTime; this._idleN = 0;
    if (this.hintHand) this.hintHand = null;
    this._mood('talk', 1.0);
    var M = this._kikiMouth();
    this._emit({ type: 'ask', promptKey: s.promptKey, params: s.params, mode: s.mode, step: this.step, steps: cur.steps.length, first: !!first, round: this.round,
      nameKind: s.nameKind, nameValue: s.nameValue, need: s.need, x: M.x, y: M.y });
    // a surprise comes 3–5 s after the first ask, but never later than the round is expected to last (steps × 1.8 − 1 s)
    var notes = cur.steps.reduce(function (a2, st2) { return a2 + st2.need; }, 0), late = Math.max(2, notes * cfg.surpriseStepS - 1), self = this;
    var at = function (r) { return Math.min(self._crng.float(r[0], r[1]), late); };
    if (first && this.surprise === 'hedgehog') this._hedgehogNext = at(cfg.hedgehogAt);
    if (first && this.surprise === 'bird') this._birdNext = at(cfg.birdAt);
    if (first && this.surprise === 'fireflies') this._firefliesNext = at(cfg.firefliesAt);
  };

  P._startTalk = function () {
    var rr = new CC.RNG((this.rng.next() * 4294967296) >>> 0);
    this.talk = CC.Content.makeTalk(this.topic, { age: this.age, lang: this.lang, rng: rr, level: this.level });
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

  // ---------------------------------------------------------------- input (logical px; ONE active pointer; a gesture = down … up)
  P._touch = function () { this._idleT = 0; this._idleGap = this.cfg.idleTime; };
  P._w0 = function (c) { return Math.sqrt(this.cfg.g / Math.max(20, c.L)); };
  /**
   * pointerDown(x, y) → 'chime' (the first contact of the gesture: struck + judged in play) | 'song' (starts the cascade) |
   * 'brush' (a chime rung outside the judged moment) | 'hedgehog' | 'bird' | 'firefly' | 'kiki' (poke fires on release) |
   * 'soft' (nothing / the beam / the sky) | 'early' (during enter, nothing under the finger) | null.
   * A chime under the finger always wins over a surprise.
   */
  P.pointerDown = function (x, y) {
    if (this._g || (this.state !== 'round' && this.state !== 'roundDone')) return null;
    this.finger.x = x; this.finger.y = y; this.finger.down = true;
    var cfg = this.cfg, L = this.layout, ph = this.phase, c = this._chimeAt(x, y);
    var g = this._g = { x0: x, y0: y, x: x, y: y, t: this.time, judged: false, kind: 'gesture', maxD: 0, inside: {}, vx: 0, result: null,
      core: this._coreSet(x, y), deferred: null };
    for (var i = 0; i < this.chimes.length; i++) { var q = this.chimes[i]; if (this._touchable(q) && hyp(x - q.cx, y - q.cy) <= this._hitR(q)) g.inside[q.id] = true; }
    this._touch();
    if (c) g.inside[c.id] = true;
    var play = this.state === 'round' && ph === 'play';
    if (play && this.assistId && inBox(L.band, x, y)) {   // assist: the next press anywhere in the beam band strikes the asked chime
      var a = this.chimeById(this.assistId);
      if (a && !a.done) { this._contact(a, x, y, null, g, c ? c.id : null); return (g.result = 'chime'); }
    }
    if (c) {
      var dir = x < c.cx ? 1 : -1;   // the finger left of the body centre → it swings right
      if (this._fair() && !c.done && hyp(x - c.cx, y - c.cy) > this._coreR(c)) {
        // a press on the RIM (the gap between bodies, the cord): it rings softly now; a tap (release before moving 24 px) judges
        // this chime, a slide judges the first body core it enters (playtest P1-1)
        this._brush(c, dir * cfg.kTap * this._w0(c), false);
        g.contacted = true; g.deferred = c.id;
        return (g.result = 'chime');
      }
      var r = this._contact(c, x, y, dir * cfg.kTap * this._w0(c), g, undefined);
      return (g.result = r);
    }
    var hh = this.hedgehogHit();
    if (hh && hyp(x - hh.x, y - hh.y) <= hh.r) { this._tapHedgehog(); g.kind = 'surprise'; return (g.result = 'hedgehog'); }
    var bh = this.birdHit();
    if (bh && hyp(x - bh.x, y - bh.y) <= bh.r) { this._tapBird(); g.kind = 'surprise'; return (g.result = 'bird'); }
    var ff = this._fireflyAt(x, y);
    if (ff && this._clearOfKeep(ff.x, ff.y, 0)) { this._tapFirefly(ff); g.kind = 'surprise'; return (g.result = 'firefly'); }
    if (inBox(L.kikiBox, x, y)) { g.kind = 'kiki'; return (g.result = 'kiki'); }
    if (ph === 'enter') { this._emit({ type: 'soft', kind: 'early', x: x, y: y }); return (g.result = 'early'); }
    if (this.state === 'roundDone' && ph === 'song' && this._song && !this._song.started && inBox(L.band, x, y) && this.chimes.length) {
      var near = null, nd = 1e9;   // a press on the beam band plays the song too, from the nearest chime (playtest P2-5)
      for (var k = 0; k < this.chimes.length; k++) { var qq = this.chimes[k], dd = hyp(x - qq.cx, y - qq.cy); if (qq.state !== 'gone' && dd < nd) { nd = dd; near = qq; } }
      this._beginCascade(near, false); g.contacted = true;
      return (g.result = 'song');
    }
    if (ph !== 'play' && ph !== 'song') return (g.result = null);
    var onBeam = inBox(L.band, x, y);
    this._softNudge();
    this._emit({ type: 'soft', kind: onBeam ? 'beam' : 'sky', x: x, y: y });
    g.soft = play;   // counts as a press without progress on release, unless the slide goes on to touch a chime
    return (g.result = 'soft');
  };
  /** A finger slide: the path segment crossing a chime's hit circle strikes it (impulse from the finger's horizontal speed);
   *  the gesture's first contact is judged, every later one is a brush. Rate-limited per chime (0.18 s). */
  P.pointerMove = function (x, y) {
    var g = this._g;
    if (!g) return;
    var cfg = this.cfg, dtm = Math.max(this.time - g.t, 1 / 120), vx = clamp((x - g.x) / dtm, -4000, 4000), hits = [], i;
    g.vx = vx;
    g.maxD = Math.max(g.maxD, hyp(x - g.x0, y - g.y0));
    this.finger.x = x; this.finger.y = y;
    if (g.deferred && g.maxD >= cfg.tapMovePx) g.deferred = null;   // the rim press became a slide
    if ((this.state === 'round' || this.state === 'roundDone') && this.phase !== null) {
      var fair = this._fair(), cores = {};
      for (i = 0; i < this.chimes.length; i++) {
        var c = this.chimes[i];
        if (!this._touchable(c)) continue;
        var r = this._hitR(c), s = segHit(g.x, g.y, x, y, c.cx, c.cy, r), was = !!g.inside[c.id];
        g.inside[c.id] = hyp(x - c.cx, y - c.cy) <= r;
        if (fair && !g.judged && !c.done && !g.core[c.id]) {   // entering a body core: the judged contact
          var sc = segHit(g.x, g.y, x, y, c.cx, c.cy, this._coreR(c));
          if (sc >= 0) { cores[c.id] = true; hits.push({ c: c, s: sc, core: true }); continue; }
        }
        if (s >= 0 && !was && this.time - c._hitT >= cfg.rateLimit - 1e-9) hits.push({ c: c, s: s, core: false });
      }
      hits.sort(function (a, b) { return a.s - b.s; });
      for (i = 0; i < hits.length; i++) {
        var q = hits[i].c, w0 = this._w0(q), dir = Math.abs(vx) > 20 ? sgn(vx) : (g.x < q.cx ? 1 : -1);
        var amp = clamp(Math.abs(vx) * cfg.swipeK / Math.max(20, q.L) / w0, cfg.swipeMin * cfg.kTap, cfg.swipeMax * cfg.kTap);
        if (this.state === 'round' && this.phase === 'play' && this.assistId && !g.judged) {
          var a = this.chimeById(this.assistId);
          if (a && !a.done) { this._contact(a, x, y, dir * amp * this._w0(a), g, q.id, true); continue; }
        }
        // fair judging: entering only the rim of a chime not rung yet is a brush while the gesture is still unjudged
        if (fair && !hits[i].core && !g.judged && !q.done && this._fair()) { this._brush(q, dir * amp * w0, true); g.contacted = true; continue; }
        this._contact(q, x, y, dir * amp * w0, g, undefined, true);
      }
      g.core = this._coreSet(x, y);
    }
    g.x = x; g.y = y; g.t = this.time;
  };
  /** → 'pokeKiki' | 'up' | null */
  P.pointerUp = function (x, y) {
    var g = this._g;
    this._g = null; this.finger.down = false;
    if (!g) return null;
    if (x === undefined) { x = g.x; y = g.y; }
    var mv = Math.max(g.maxD, hyp(x - g.x0, y - g.y0));
    this._resolveDeferred(g);
    if (g.soft && !g.contacted && this.state === 'round' && this.phase === 'play' && !this._stepDone) this._noProgress();
    if (g.kind === 'kiki' && mv < this.cfg.tapMovePx && this.state === 'round') return this._pokeKiki() || 'up';
    return 'up';
  };
  /** The finger left (touchcancel / pause / rotation): the gesture ends; a rim tap still waiting is judged (a slipped tap counts). */
  P.cancelDrag = function () { var g = this._g; this._g = null; this.finger.down = false; if (g) this._resolveDeferred(g); };
  /** Fair judging is on in play while no assist is armed (assist: the first contact anywhere is the asked chime). */
  P._fair = function () { return !!this.cfg.fairSwipe && this.state === 'round' && this.phase === 'play' && !this.assistId; };
  /** A rim tap is judged on release: the pressed chime, if the finger did not slide and nothing was judged yet. */
  P._resolveDeferred = function (g) {
    if (!g.deferred || g.judged || !this._fair()) return;
    var c = this.chimeById(g.deferred);
    g.deferred = null;
    if (c && !c.done && this._touchable(c)) this._contact(c, g.x, g.y, (g.x < c.cx ? 1 : -1) * 1e-6, g);
  };
  /** A soft ring (sound only): never a mistake, never progress. */
  P._brush = function (c, dw, swipe) {
    var str = this._strike(c, dw, 0.6, false);
    this._emit({ type: 'ring', id: c.id, thing: c.thing, note: c.note, x: c.cx, y: c.cy, strength: str, judged: false, brush: true, swipe: !!swipe });
  };
  P._counting = function () { for (var i = 0; i < this.chimes.length; i++) { var c = this.chimes[i]; if (c.count >= 0 && c.count < c.thing.n) return true; } return false; };

  /**
   * A contact of the gesture with chime c (dω = the impulse, null = a tap-strength push away from the finger). In play the
   * gesture's FIRST contact on a chime not rung right yet is judged (right / wrong); a chime already rung right just rings.
   * `from` = the chime under the finger when the assist redirects the strike to the asked chime.
   */
  P._contact = function (c, x, y, dw, g, from, swipe) {
    var cfg = this.cfg;
    g.contacted = true;
    if (dw === null || dw === undefined) dw = (x < c.cx ? 1 : -1) * cfg.kTap * this._w0(c);
    var play = this.state === 'round' && this.phase === 'play';
    if (play && !g.judged && !c.done && this._stepDone && this.step < this.cur.steps.length - 1 && !this._counting() && this._waitAsk >= 0) {
      this.step++; this._ask(false);   // a contact during the gap after a right note: the next step starts now and judges it
    }
    if (play && !g.judged && !c.done && !this._stepDone) {
      g.judged = true;
      var s = this.stepInfo, right = s.targets.indexOf(c.id) >= 0;
      var str = this._strike(c, dw, right ? 1 : cfg.wrongRing, !right);
      this._emit({ type: 'ring', id: c.id, thing: c.thing, note: c.note, x: c.cx, y: c.cy, strength: str, judged: true, swipe: !!swipe, dull: !right });
      if (from !== undefined) { this._roundAssisted = true; this._emit({ type: 'assist', id: c.id, from: from, x: x, y: y }); }
      if (right) this._right(c); else this._wrong(c, s);
      return 'chime';
    }
    if (this.state === 'roundDone' && this.phase === 'song' && this._song && !this._song.started) {
      this._strike(c, dw, 0, false);
      this._beginCascade(swipe ? null : c, false);
      return 'song';
    }
    var str2 = this._strike(c, dw * (this.phase === 'song' ? 0.8 : 1), 0.6, false);
    this._emit({ type: 'ring', id: c.id, thing: c.thing, note: c.note, x: c.cx, y: c.cy, strength: str2, judged: false, brush: true, swipe: !!swipe });
    return 'brush';
  };
  /** Physics of a strike: the angular impulse, the body twist and the clapper kick, ring flash. → strength (≈ 1 for a tap). */
  P._strike = function (c, dw, ring, dull) {
    var cfg = this.cfg, w0 = this._w0(c), dir = sgn(dw);
    c.omega += dw;
    c.vspin -= dir * cfg.spinKick;
    c.vclap += dir * cfg.clapKick * cfg.clapOmega;
    if (ring > 0) { c.ring = Math.max(c.ring, ring); c.dull = dull ? 1 : 0; }
    c._hitT = this.time;
    if (dull) c.dull = 1;
    this._lastNote = c.note; this._lookX = c.cx; this._lookT = 1.2;
    return Math.abs(dw) / (cfg.kTap * w0);
  };
  P._right = function (c) {
    var cfg = this.cfg, s = this.stepInfo;
    c.done = true; c._flashT = cfg.glowFlash; c._glowT = 0;
    this.streak = 0; this._noProg = 0; this._touch(); this._disarm(); this.hintHand = null;
    var li = Math.min(this._lit, this.lanterns.length - 1), ln = this.lanterns[li];
    this._lit++;
    var color = c.thing.color || null;
    if (ln) {
      var f = arc(c.cx, c.cy, ln.x, ln.y, cfg.noteTime, cfg.noteApex, 0, this.layout.ins.top + 8);
      this.notes.push({ x: c.cx, y: c.cy, _px: c.cx, _py: c.cy, x0: c.cx, y0: c.cy, x1: ln.x, y1: ln.y, t: 0, t0: 0, T: cfg.noteTime, f: f, color: color,
        lantern: li, note: c.note, alpha: 0, rot: 0, id: c.id });
    }
    var cnt = (c.thing.kind === 'string' || c.thing.kind === 'dots') ? c.thing.n : 0;
    if (cnt) { c.count = 0; c._countT = 0; }
    var claimed = s.targets.filter(function (id) { var q = this.chimeById(id); return q && q.done; }, this).length;
    var last = claimed >= s.need;
    var ev = { type: 'right', id: c.id, thing: c.thing, note: c.note, step: this.step, lantern: li, x: c.cx, y: c.cy };
    if (cnt) ev.count = { n: cnt };
    if (s.mode === 'findAll') ev.all = { i: claimed, n: s.need };
    this._mood('happy'); this._hop();
    this._emit(ev);
    if (last) {
      var lastStep = this.step >= this.cur.steps.length - 1;
      this._stepDone = true;
      this._waitAsk = cfg.askGap + (cnt ? cnt * cfg.countStep + 0.3 : 0);
      if (lastStep) this._waitAsk = Math.max(this._waitAsk, cfg.noteTime + 0.2);
      this._emit({ type: 'stepDone', step: this.step, steps: this.cur.steps.length, last: lastStep, x: c.cx, y: c.cy });
    }
  };
  P._wrong = function (c, s) {
    var t = c.thing;
    this.misses++; this.stepMisses++; this.streak++;
    this._mood('oops');
    this._emit({ type: 'wrong', id: c.id, thing: t, got: { nameKind: t.nameKind, nameValue: t.nameValue, kind: t.kind, color: t.color, shape: t.shape, n: t.n,
      animal: t.animal, text: t.text, size: t.size }, want: { nameKind: s.nameKind, nameValue: s.nameValue, promptKey: s.promptKey, params: s.params },
      streak: this.streak, misses: this.misses, x: c.cx, y: c.cy });
    this._noProgress();
  };
  /** A press on nothing: the beam wobbles 2 px and every chime gets a tiny nudge. */
  P._softNudge = function () {
    var cfg = this.cfg, self = this;
    this.beam.vwob += kickFor(cfg.beamWob, cfg.wobOmega, cfg.wobZeta);
    this.chimes.forEach(function (c) { if (self._touchable(c)) c.omega += (self._crng.chance(0.5) ? 1 : -1) * cfg.softNudge * self._w0(c); });
    this.lanterns.forEach(function (l) { l.vswing += (self._crng.chance(0.5) ? 1 : -1) * 0.3; });
  };
  P._noProgress = function () {
    this._noProg++;
    if (this._noProg >= this.cfg.hintAfterMisses) this._autoHint(false);
    if (this._noProg >= this._assistAfter() && !this.assistId) {
      var a = this._askedChime();
      if (a) { this.assistId = a.id; this._emit({ type: 'assistArmed', id: a.id, x: a.cx, y: a.cy }); }
    }
  };
  P._disarm = function () { this.assistId = null; };
  P._pokeKiki = function () {
    var a = this.prompt(), B = this.layout.kiki;
    if (!a) return null;
    this._touch();
    this._mood('talk', 1.0);
    this._emit({ type: 'pokeKiki', promptKey: a.promptKey, params: a.params, mode: a.mode, step: a.step, x: B.x, y: B.y - 0.7 * B.h });
    return 'pokeKiki';
  };

  // ---------------------------------------------------------------- help
  P.resetNudges = function () {
    this._idleT = 0; this._idleGap = this.cfg.idleTime; this._idleN = 0;
    this._talkAskT = 0; this._talkAsks = 0;
    if (this.talk) this.talk.glowAnswer = false;
  };
  P._glowing = function () { for (var i = 0; i < this.chimes.length; i++) if (this.chimes[i]._glowT > 0) return true; return false; };
  P._autoHint = function (fromIdle) {
    if (this._glowing() || this.hintHand || this.time - this._lastHintT < this.cfg.hintCooldown) return null;
    return this._doHint(fromIdle);
  };
  P._doHint = function (fromIdle) {
    var c = this._askedChime(), cfg = this.cfg, s = this.stepInfo;
    if (!c || !this.interactive) return null;
    c._glowT = cfg.hintTime;
    this.hintHand = { id: c.id, mode: 'tap', x: c.cx, y: c.cy, _px: c.cx, _py: c.cy, t: 0, press: 0, alpha: 0, time: 0, T: cfg.hintTime };
    this._stepHint(0);
    this._lastHintT = this.time;
    this._mood('point', cfg.hintTime);
    var ev = { type: 'hint', id: c.id, mode: 'tap', x: c.cx, y: c.cy, want: { nameKind: s.nameKind, nameValue: s.nameValue, promptKey: s.promptKey, params: s.params } };
    if (fromIdle) ev.idle = true;
    this._emit(ev);
    return { chime: c.id };
  };
  /** Manual hint (e.g. a tap on the bubble): the asked chime glows + the ghost hand taps it; in the song: the swipe hand. */
  P.hint = function () {
    if (this.state === 'roundDone' && this.phase === 'song' && this._song && !this._song.started) { this._swipeHand(); return { song: true }; }
    if (!this.interactive) return null;
    if (this.hintHand) return { chime: this.hintHand.id };
    return this._doHint(false);
  };
  P._swipeHand = function () {
    if (this.hintHand && this.hintHand.mode === 'swipe') return;
    var b = this._bandCentre();
    this.hintHand = { id: null, mode: 'swipe', x: b.x, y: b.y, _px: b.x, _py: b.y, t: 0, press: 0, alpha: 0, time: 0, T: 1e9 };
    this._stepHint(0);
  };
  /** Ghost hand. tap (1.6 s cycle): glides in from below-right, taps the chime twice, drifts back fading. swipe (2.0 s): presses
   *  at the left end of the beam band, slides right across the chimes, lifts. Fingertip = (x, y). */
  P._stepHint = function (h) {
    var H = this.hintHand, cfg = this.cfg;
    if (!H) return;
    H.time += h;
    var x, y, press, fade = 1, u;
    if (H.mode === 'tap') {
      var c = this.chimeById(H.id);
      if (!c || c.done || H.time >= H.T || !this.interactive) { this.hintHand = null; return; }
      u = (H.time % cfg.hintCycle) / cfg.hintCycle;
      var ox = c.cx + 70, oy = c.cy + 110, tx = c.cx + 6, ty = c.cy + 10;
      if (u < 0.25) { var v = smooth(u / 0.25); x = lerp(ox, tx, v); y = lerp(oy, ty, v); press = 0; }
      else if (u < 0.65) { var k = (u - 0.25) / 0.2, tap = Math.sin(Math.PI * (k % 1)); press = tap; x = tx; y = ty + 8 * (1 - tap); }
      else { var w2 = smooth((u - 0.65) / 0.35); x = lerp(tx, ox, w2); y = lerp(ty, oy, w2); press = 0; fade = 1 - 0.9 * w2; }
      H.alpha = clamp(H.time / 0.25, 0, 1) * clamp((H.T - H.time) / 0.35, 0, 1) * fade;
    } else {
      if (!(this.state === 'roundDone' && this.phase === 'song' && this._song && !this._song.started)) { this.hintHand = null; return; }
      var B = this.layout.band, yS = this._chimeMidY(), x0 = B.x + 40, x1 = B.x + B.w - 40;
      u = (H.time % cfg.swipeCycle) / cfg.swipeCycle;
      if (u < 0.15) { press = smooth(u / 0.15); x = x0; y = yS + 12 * (1 - press); }
      else if (u < 0.75) { var m = smooth((u - 0.15) / 0.6); press = 1; x = lerp(x0, x1, m); y = yS - 10 * Math.sin(Math.PI * m); }
      else { var e = smooth((u - 0.75) / 0.25); press = 1 - e; x = x1; y = yS + 12 * e; fade = 1 - e; }
      H.alpha = clamp(H.time / 0.3, 0, 1) * fade;
    }
    H.x = x; H.y = y; H.t = u; H.press = press;
  };
  P._chimeMidY = function () {
    var s = 0, n = 0;
    for (var i = 0; i < this.chimes.length; i++) { var c = this.chimes[i]; if (c.state !== 'gone') { s += c.cy; n++; } }
    return n ? s / n : this._bandCentre().y;
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
  P._twinChime = function (c) { c._px = c.x; c._py = c.y; c._pcx = c.cx; c._pcy = c.cy; c._ptheta = c.theta; c._pspin = c.spin; c._pcord = c.cord; c._prot = c.rot; c._ppop = c.pop; };
  P._twins = function () {
    var i, o;
    for (i = 0; i < this.chimes.length; i++) this._twinChime(this.chimes[i]);
    for (i = 0; i < this.lanterns.length; i++) { o = this.lanterns[i]; o._pswing = o.swing; o._plit = o.lit; }
    for (i = 0; i < this.notes.length; i++) { o = this.notes[i]; o._px = o.x; o._py = o.y; }
    for (i = 0; i < this.fireflies.length; i++) { o = this.fireflies[i]; o._px = o.x; o._py = o.y; }
    if (this.hedgehog) { o = this.hedgehog; o._px = o.x; o._py = o.y; o._proll = o.roll; o._pball = o.ball; }
    if (this.bird) { o = this.bird; o._px = o.x; o._py = o.y; }
    if (this.hintHand) { this.hintHand._px = this.hintHand.x; this.hintHand._py = this.hintHand.y; }
    this.beam._pwob = this.beam.wob;
    this.kiki._phop = this.kiki.hop;
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
        } else if (this._talkAsks >= cfg.talkMaxAsks && this._talkAskT >= cfg.talkGiveUp - 1e-9) this.talkAnswer(this.talk.answer, true);   // Kiki answers
        break;
      case 'levelDone':
        if (this.stateTime >= cfg.levelDoneTime) {
          if (this.level < this.levels.length - 1) this.startLevel(this.level + 1);
          else {
            this._setState('sessionDone'); this.phase = null;
            this.lastTopics = this.levels.slice();
            this._emit({ type: 'sessionDone', stars: this.stars, songs: this.songs.slice() });
          }
        }
        break;
    }
    if (this.state === 'round' || this.state === 'roundDone') {
      spring(this.beam, 'wob', 'vwob', 0, cfg.wobOmega, cfg.wobZeta, h);
      this._stepChimes(h); this._stepLanterns(h); this._stepNotes(h); this._stepSurprises(h); this._stepHint(h);
    }
    this._stepKiki(h);
  };

  P._stepRound = function (h) {
    var cfg = this.cfg;
    switch (this.phase) {
      case 'enter':
        if (this.phaseTime >= this._enterTime && this.chimes.every(function (c) { return c.state === 'hang'; })) { this._setPhase('play'); this.step = 0; this._ask(true); }
        break;
      case 'play': {
        if (this._stepDone) {
          if (this._waitAsk >= 0) {
            this._waitAsk -= h;
            if (this._waitAsk <= 0) {
              this._waitAsk = -1;
              if (this.step < this.cur.steps.length - 1) { this.step++; this._ask(false); }
              else this._startSong();
            }
          }
          break;
        }
        if (!this._g) {
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
  /** Every note is in: stars, then song time — the ghost hand shows a swipe; a touch on any chime (or songWait) starts the cascade. */
  P._startSong = function () {
    var st = this._starsFor(this.misses), ls = this.cur && this.cur.steps[this.cur.steps.length - 1];
    if (ls) { this._prevAnsRun = String(ls.nameValue) === String(this._prevAns) ? (this._prevAnsRun || 1) + 1 : 1; this._prevAns = ls.nameValue; }
    if (this._roundAssisted) st = Math.min(st, 2);   // an assisted note caps the round at 2★ (playtest P2-1)
    this.roundStars = st; this.stars += st; this.levelStars += st;
    this.cancelDrag(); this.hintHand = null; this._disarm();
    this._setState('roundDone'); this._setPhase('song');
    this._song = { asked: false, started: false, auto: false, t: 0, order: [], i: 0, dirs: [], done: false };
    this._mood('cheer', 1.2); this._hop();
    this._surprisesLeave();
    var bc = this._bandCentre();
    this._emit({ type: 'roundDone', round: this.round, stars: st, misses: this.misses, x: bc.x, y: bc.y });
  };
  /** The cascade: every chime left → right (a tap: from the touched one outwards), 0.16 s apart, strong strikes. */
  P._beginCascade = function (from, auto) {
    var S = this._song, n = this.chimes.length, i;
    if (!S || S.started) return;
    S.started = true; S.auto = !!auto; S.t = 0; S.i = 0; S.order = []; S.dirs = [];
    if (from) {
      var k = this.chimes.indexOf(from);
      var idx = []; for (i = 0; i < n; i++) idx.push(i);
      idx.sort(function (a, b) { return Math.abs(a - k) - Math.abs(b - k) || a - b; });
      S.order = idx.map(function (j) { return this.chimes[j]; }, this);
      S.dirs = idx.map(function (j) { return j < k ? -1 : 1; });
    } else {
      S.order = this.chimes.slice(); S.dirs = S.order.map(function () { return 1; });
    }
    this.hintHand = null;
  };
  P._stepSong = function (h) {
    var cfg = this.cfg, S = this._song;
    if (!S) return;
    if (!S.asked && this.phaseTime >= cfg.songAskDelay) {
      S.asked = true; S.askT = this.time;
      var bc = this._bandCentre();
      this._emit({ type: 'songAsk', x: bc.x, y: bc.y });
      this._swipeHand();
    }
    if (S.asked && !S.started && this.time - S.askT >= cfg.songWait - 1e-9) this._beginCascade(null, true);
    if (!S.started) return;
    S.t += h;
    var nL = this.lanterns.length;
    while (S.i < S.order.length && S.t >= S.i * cfg.cascadeGap - 1e-9) {
      var c = S.order[S.i];
      if (c.state !== 'gone') {
        c.omega += S.dirs[S.i] * cfg.kSong * this._w0(c);
        c.vspin -= S.dirs[S.i] * cfg.spinKick; c.vclap += S.dirs[S.i] * cfg.clapKick * cfg.clapOmega;
        c.ring = 1; c.dull = 0; c._hitT = this.time; this._lastNote = c.note;
      }
      if (nL) { var ln = this.lanterns[Math.min(nL - 1, Math.floor(S.i * nL / S.order.length))]; ln.flash = 1; ln.vswing += kickFor(cfg.lanternSongKick, cfg.lanternOmega, cfg.lanternZeta) * S.dirs[S.i]; }
      this._mood(S.i % 2 ? 'cheer' : 'dance', cfg.moodTime.dance);
      this._emit({ type: 'songNote', id: c.id, i: S.i, n: S.order.length, note: c.note, x: c.cx, y: c.cy });
      S.i++;
    }
    if (!S.done && S.i >= S.order.length && S.t >= (S.order.length - 1) * cfg.cascadeGap + cfg.songTail - 1e-9) {
      S.done = true;
      this._mood('happy', 1.0);
      var bc2 = this._bandCentre();
      this._emit({ type: 'songDone', auto: S.auto, x: bc2.x, y: bc2.y });
      this._startOut();
    }
  };
  /** out: the chimes are pulled up (distractors first); the round's tune goes to w.songs. */
  P._startOut = function () {
    var cfg = this.cfg, self = this, cur = this.cur;
    this._setPhase('out');
    var order = this.chimes.filter(function (c) { return !c.target; }).concat(this.chimes.filter(function (c) { return c.target; }));
    order.forEach(function (c, k) { c._outAt = k * cfg.outStagger; });
    this._outEnd = Math.max(cfg.outTime, (order.length - 1) * cfg.outStagger + cfg.outPull + cfg.outPop + 0.02);
    if (cur) {
      var notes = cur.song.map(function (id) { return self.chimeById(id).note; }), colors = cur.song.map(function (id) { return self.chimeById(id).thing.color || null; });
      this.songs.push({ level: this.level, round: this.round, topic: this.topic, notes: notes, colors: colors });
    }
    var bc = this._bandCentre();
    this._emit({ type: 'chimesOut', x: bc.x, y: bc.y });
  };
  /** Will the chapter end after this round (Talk time next)? */
  P._chapterEnds = function () {
    var r = this.round + 1, el = this.time - this.levelStartTime;
    return r >= this.roundsPerLevel || (r >= this.cfg.chapterMinRounds && el > this.cfg.chapterTimeLimit);
  };
  P._stepRoundDone = function (h) {
    if (this.phase === 'song') this._stepSong(h);
    else if (this.phase === 'out' && this.phaseTime >= this._outEnd) this._nextRound();
  };
  P._nextRound = function () {
    var cfg = this.cfg;
    this._clearRound(); this.cur = null;
    this.round++;
    var el = this.time - this.levelStartTime, long = this.round >= cfg.chapterMinRounds && el > cfg.chapterTimeLimit;
    if (this.round < this.roundsPerLevel && !long) this._beginRound();
    else { if (this.round < this.roundsPerLevel) this.roundsPerLevel = this.round; this._startTalk(); }
  };

  // ---------------------------------------------------------------- chimes
  /** Positions from the pendulum state: body top = hook + cord·(sin θ, cos θ); body centre along the body's own axis. */
  P._pose = function (c) {
    var L = this.layout;
    c.hookY = L.beam.hookY + this.beam.wob;
    c.L = Math.max(1, c.cord) + c.bcy;
    var cl = Math.max(0, c.cord);
    c.x = c.hookX + cl * Math.sin(c.theta); c.y = c.hookY + cl * Math.cos(c.theta);
    c.rot = -c.theta + c.spin;
    c.cx = c.x - Math.sin(c.rot) * c.bcy; c.cy = c.y + Math.cos(c.rot) * c.bcy;
  };
  /** The largest swing towards `dir` that keeps the body (half width + the swing of its box) inside the screen. */
  P._thetaLim = function (c, dir) {
    var L = this.layout, room = dir > 0 ? L.W - L.ins.right - c.hookX : c.hookX - L.ins.left, reach = room - c.bw / 2 - this.cfg.edgePad;
    var lim = reach <= 0 ? 0.05 : reach >= c.L ? Math.PI / 2 : Math.asin(reach / c.L);
    return Math.max(0.05, Math.min(this.cfg.thetaMax, lim));
  };
  P._stepChimes = function (h) {
    var cfg = this.cfg, self = this, i;
    // breeze: now and then a hanging chime gets a tiny random push (± 0.02 rad)
    this._breezeT -= h;
    if (this._breezeT <= 0) {
      this._breezeT = this._crng.float(cfg.breezeEvery[0], cfg.breezeEvery[1]);
      var hang = this.chimes.filter(function (c) { return c.state === 'hang'; });
      if (hang.length) { var b = this._crng.pick(hang); b.omega += this._crng.float(-1, 1) * cfg.breezeAmp * this._w0(b); }
    }
    for (i = 0; i < this.chimes.length; i++) {
      var c = this.chimes[i];
      if (c.state === 'gone') { c.pop = 0; continue; }
      // --- cord length: enter fall + catch spring / hang spring / out pull
      if (c.state === 'enter') {
        var t = this.phaseTime - c._dropAt;
        if (this.phase !== 'enter') t = Math.max(t, 1);
        if (t < 0) { c.pop = 0; c.cord = 0; this._pose(c); continue; }
        c.pop = Math.min(1, t / cfg.dropPop);
        if (!c.caught) {
          c.vcord += cfg.dropG * h; c.cord += c.vcord * h;
          if (c.cord >= c.cordRest) {   // the cord goes taut: a springy bounce, a little rocking swing
            c.caught = true; c.cord = c.cordRest;
            c.vcord = Math.min(c.vcord, kickFor(cfg.catchMaxBounce, cfg.catchOmega, cfg.catchZeta));
            c.omega += this._crng.float(-1, 1) * cfg.catchTheta * this._w0(c);
            this.beam.vwob += kickFor(0.8, cfg.wobOmega, cfg.wobZeta);
            this._pose(c);
            this._emit({ type: 'chimeIn', id: c.id, i: c.i, x: c.cx, y: c.cy });
          }
        } else {
          spring(c, 'cord', 'vcord', c.cordRest, cfg.catchOmega, cfg.catchZeta, h);
          if (Math.abs(c.cord - c.cordRest) < 0.5 && Math.abs(c.vcord) < 8) c.state = 'hang';
          else if (t > 1.5) c.state = 'hang';
        }
      } else if (c.state === 'hang') {
        spring(c, 'cord', 'vcord', c.cordRest, cfg.catchOmega, cfg.catchZeta, h);
        if (this.phase === 'out' && this.phaseTime >= c._outAt) { c.state = 'out'; c._outT = 0; c._outCord = c.cord; c.omega += (this._crng.chance(0.5) ? 1 : -1) * cfg.outKick * this._w0(c); }
      } else if (c.state === 'out') {
        c._outT += h;
        var u = clamp(c._outT / cfg.outPull, 0, 1);
        c.cord = c._outCord * (1 - u * u); c.vcord = 0;
        if (u >= 1) { var pu = clamp((c._outT - cfg.outPull) / cfg.outPop, 0, 1); c.pop = 1 - smooth(pu); if (pu >= 1) { c.state = 'gone'; c.pop = 0; } }
      }
      // --- pendulum (θ'' = −(g/L) sin θ − c θ'), body twist lagging the cord, clapper
      c.L = Math.max(1, c.cord) + c.bcy;
      var w2 = cfg.g / Math.max(20, c.L), acc = -w2 * Math.sin(c.theta) - cfg.damp * c.omega;
      c.omega += acc * h; c.theta += c.omega * h;
      var tl = this._thetaLim(c, c.theta >= 0 ? 1 : -1);
      if (Math.abs(c.theta) > tl) { c.theta = clamp(c.theta, -tl, tl); c.omega *= -0.3; }   // a soft bounce at the end of the swing
      c.alphaT = acc;
      c.vspin += (-cfg.spinOmega * cfg.spinOmega * c.spin - 2 * cfg.spinZeta * cfg.spinOmega * c.vspin - cfg.spinK * acc) * h;
      c.spin += c.vspin * h;
      if (Math.abs(c.spin) > cfg.spinMax) { c.spin = clamp(c.spin, -cfg.spinMax, cfg.spinMax); c.vspin *= -0.3; }
      c.vclap += (-cfg.clapOmega * cfg.clapOmega * c.clap - 2 * cfg.clapZeta * cfg.clapOmega * c.vclap - cfg.clapK * acc) * h;
      c.clap += c.vclap * h;
      if (Math.abs(c.clap) > 1) { c.clap = clamp(c.clap, -1, 1); c.vclap *= -0.4; }
      // --- flashes, glow, counting
      c.ring = Math.max(0, c.ring - h / cfg.ringTime);
      if (c.ring <= 0) c.dull = 0;
      if (c._glowT > 0) c._glowT = Math.max(0, c._glowT - h);
      if (c._flashT > 0) c._flashT = Math.max(0, c._flashT - h);
      var gT = this.assistId === c.id ? 1 : c._glowT > 0 ? 0.55 + 0.45 * Math.sin(TAU * 1.6 * this.time) : 0;
      gT = Math.max(gT, c._flashT / cfg.glowFlash);
      c.glow += (gT - c.glow) * Math.min(1, h * (gT > c.glow ? 10 : 4));
      if (c.count >= 0 && c.count < c.thing.n) {
        c._countT += h;
        var k = Math.min(c.thing.n, Math.floor(c._countT / cfg.countStep + 1e-9) + 1);
        if (k > c.count) {
          c.count = k;
          c.omega += (k % 2 ? 1 : -1) * cfg.countJingle * this._w0(c); c.vclap += (k % 2 ? 1 : -1) * 0.5 * cfg.clapOmega;
          this._pose(c);
          this._emit({ type: 'count', id: c.id, i: k, n: c.thing.n, x: c.cx, y: c.cy });
        }
      }
      this._pose(c);
    }
    void self;
  };
  P._stepLanterns = function (h) {
    var cfg = this.cfg;
    for (var i = 0; i < this.lanterns.length; i++) {
      var l = this.lanterns[i];
      l.lit += ((l._litT ? 1 : 0) - l.lit) * Math.min(1, h * cfg.litRate);
      l.flash = Math.max(0, l.flash - h / cfg.flashTime);
      spring(l, 'swing', 'vswing', 0, cfg.lanternOmega, cfg.lanternZeta, h);
    }
  };
  P._stepNotes = function (h) {
    var cfg = this.cfg;
    for (var i = this.notes.length - 1; i >= 0; i--) {
      var n = this.notes[i];
      n.t += h;
      var ft = Math.min(n.T, n.t) - (n.t0 || 0), p = arcAt(n.f, Math.max(0, ft));
      n.x = p.x; n.y = p.y; n.alpha = clamp(n.t / 0.1, 0, 1); n.rot = 0.25 * Math.sin(TAU * 1.5 * n.t);
      if (n.t >= n.T) {
        this.notes.splice(i, 1);
        var l = this.lanterns[n.lantern];
        if (l) {
          l._litT = 1; l.color = n.color; l.flash = 1; l.vswing += kickFor(cfg.lanternKick, cfg.lanternOmega, cfg.lanternZeta) * (n.x1 >= n.x0 ? 1 : -1);
          this._emit({ type: 'lantern', i: n.lantern, color: n.color, note: n.note, x: l.x, y: l.y });
        }
      }
    }
  };

  // ---------------------------------------------------------------- surprises
  P._surprisesLeave = function () {
    var hg = this.hedgehog, b = this.bird;
    this._hedgehogNext = -1; this._birdNext = -1; this._firefliesNext = -1;
    if (hg && hg.state !== 'leave') { hg.state = 'leave'; hg.dir = 1; hg.ball = 0; }
    if (b && b.state !== 'leave') this._birdLeave();
    this.fireflies.forEach(function (f) { if (f.state !== 'zip') { f.state = 'zip'; f.zt = 0; } });
  };
  P._hedgehogY = function () { return this.layout.groundY - 8; };
  /** Where the hedgehog stops to sniff: near the middle, clear of Kiki and the fire. */
  P._hedgehogStop = function () {
    var L = this.layout, lo = L.kikiBox.x + L.kikiBox.w + 90, hi = L.W - L.ins.right - 90, F = L.fire, best = (lo + hi) / 2, bd = 1e9;
    for (var x = lo; x <= hi; x += 10) {
      if (Math.abs(x - F.x) < F.w / 2 + 80) continue;
      var d = Math.abs(x - L.W / 2);
      if (d < bd) { bd = d; best = x; }
    }
    return clamp(best, lo, Math.max(lo, hi));
  };
  P._tapHedgehog = function () {
    var g = this.hedgehog, c = this.hedgehogHit() || { x: g.x, y: g.y };
    g._back = g.state; g.state = 'ball'; g.bt = 0; g.rollFrom = g.x; g.tapped = true;
    this._emit({ type: 'hedgehogTap', x: c.x, y: c.y });
  };
  /** The bird's perch: the middle of the widest gap on the beam between two hooks (or a post and the end hook). */
  P._birdPlan = function () {
    var b = this.bird, L = this.layout;
    if (!b) return;
    var xs = [L.beam.x0 + L.postR + 6].concat(this.chimes.map(function (c) { return c.hookX; })).concat([L.beam.x1 - L.postR - 6]), best = 0, bw = -1;
    for (var i = 1; i < xs.length; i++) { var w = xs[i] - xs[i - 1]; if (w > bw + 1e-6) { bw = w; best = i; } }
    b.perchX = (xs[best] + xs[best - 1]) / 2; b.perchY = L.beam.y - L.beam.r; b.gap = bw;
    b.hopMax = Math.max(0, bw / 2 - 30);
  };
  P._birdLeave = function () {
    var b = this.bird, L = this.layout;
    b.state = 'leave'; b.ft = 0; b.f = arc(b.x, b.y, b.x - 260, -80, 1.0, 20, 0); b.dir = -1;
    void L;
  };
  P._tapBird = function () {
    var b = this.bird, c = this.birdHit() || { x: b.x, y: b.y };
    var note = this._lastNote >= 0 ? this._lastNote : this.cur && this.cur.song.length ? this.chimeById(this.cur.song[0]).note : 0;
    b.sing = 1; b.singT = this.cfg.birdSingTime; b.hopT = 0; b.hopFrom = b.hopTo = b.hopX;   // a happy little hop on the spot
    this._emit({ type: 'birdTap', note: note, x: c.x, y: c.y });
  };
  /** Firefly anchors: in the gaps between the chime cords, above the chime bodies (else above the beam between the lanterns). */
  P._fireflyAnchors = function () {
    var L = this.layout, cfg = this.cfg, self = this;
    var xs = [L.beam.x0].concat(this.chimes.map(function (c) { return c.hookX; })).concat([L.beam.x1]), gaps = [];
    for (var i = 1; i < xs.length; i++) gaps.push((xs[i] + xs[i - 1]) / 2);
    var top = 1e9;
    this.chimes.forEach(function (c) { top = Math.min(top, L.beam.hookY + c.cordRest + c.bcy - self._hitR(c)); });
    var y0 = L.beam.y + L.beam.r + 18, y1 = top - 22, above = y1 - y0 < 30;
    if (above) { y0 = L.garland.y + 30; y1 = L.beam.y - L.beam.r - 20; }
    this.fireflies.forEach(function (f, k) {
      f.ax = gaps[k % gaps.length] + (k >= gaps.length ? 20 : 0);
      f.ay = lerp(y0, Math.max(y0, y1), (k * 0.37) % 1);
    });
    void cfg;
  };
  P._tapFirefly = function (f) {
    f.state = 'zip'; f.zt = 0; f.glow = 1.6; f.tapped = true;
    this._emit({ type: 'fireflyTap', x: f.x, y: f.y });
  };
  P._stepSurprises = function (h) {
    var cfg = this.cfg, L = this.layout, play = this.state === 'round' && this.phase === 'play', r = this._crng, i;
    // ---- hedgehog: trundles in from the right along the ground line, sniffs near the middle, leaves
    if (this._hedgehogNext >= 0 && play && !this.hedgehog) {
      this._hedgehogNext -= h;
      if (this._hedgehogNext < 0) {
        this._hedgehogNext = -1;
        var x0 = L.W - L.ins.right + 90;
        this.hedgehog = { x: x0, y: this._hedgehogY(), _px: x0, _py: this._hedgehogY(), dir: -1, step: 0, ball: 0, _pball: 0, roll: 0, _proll: 0,
          state: 'walk', t: 0, stopX: this._hedgehogStop(), sniffT: 0, bt: 0, sniff: 0, tapped: false };
        this._emit({ type: 'hedgehog', x: L.W - L.ins.right - 40, y: this._hedgehogY() });
      }
    }
    var g = this.hedgehog;
    if (g) {
      g.t += h; g.y = this._hedgehogY();
      if (g.state === 'walk' || g.state === 'leave') {
        g.x += g.dir * cfg.hedgehogSpeed * (g.state === 'leave' ? 1.6 : 1) * h; g.step = (g.step + h * 2.6) % 1; g.sniff = 0;
        if (g.state === 'walk' && g.x <= g.stopX) { g.x = g.stopX; g.state = 'sniff'; g.sniffT = 0; }
        if (g.state === 'leave' && g.x > L.W + 120) this.hedgehog = null;
      } else if (g.state === 'sniff') {
        g.sniffT += h; g.step = 0; g.sniff = 0.5 + 0.5 * Math.sin(TAU * 2.2 * g.sniffT);
        if (g.sniffT >= cfg.hedgehogSniff) { g.state = 'leave'; g.dir = 1; }
      } else if (g.state === 'ball') {   // curls up (0.25 s), rolls 40 px (0.6 s), uncurls (0.35 s)
        g.bt += h;
        var tb = cfg.hedgehogBallTime, tr = cfg.hedgehogRollTime, tu = cfg.hedgehogUncurl;
        if (g.bt < tb) g.ball = smooth(g.bt / tb);
        else if (g.bt < tb + tr) {
          g.ball = 1; var ur = smooth((g.bt - tb) / tr), nx = g.rollFrom + g.dir * cfg.hedgehogRoll * ur;
          g.roll += (nx - g.x) / cfg.hedgehogBodyR; g.x = nx;   // rolling without slipping: angle = distance / radius
        } else if (g.bt < tb + tr + tu) g.ball = 1 - smooth((g.bt - tb - tr) / tu);
        else { g.ball = 0; g.state = g._back === 'walk' ? 'walk' : 'sniff'; if (g.state === 'walk' && g.x < g.stopX) g.stopX = g.x; }
      }
    }
    // ---- bird: flies in, perches on the beam between hooks, hops, sings when tapped, leaves
    if (this._birdNext >= 0 && play && !this.bird) {
      this._birdNext -= h;
      if (this._birdNext < 0) {
        this._birdNext = -1;
        var bx = L.W + 60, by = L.ins.top + 40;
        this.bird = { x: bx, y: by, _px: bx, _py: by, dir: -1, hop: 0, hopX: 0, hopT: -1, hopFrom: 0, hopTo: 0, nextHop: 1.2, sing: 0, singT: 0, flap: 1, state: 'fly', t: 0, ft: 0, f: null };
        this._birdPlan();
        var B = this.bird;
        B.f = arc(bx, by, B.perchX, B.perchY, cfg.birdFlyTime, 40, 0);
        this._emit({ type: 'bird', x: B.perchX, y: B.perchY });
      }
    }
    var b = this.bird;
    if (b) {
      b.t += h;
      if (b.sing > 0) { b.singT -= h; b.sing = clamp(b.singT / cfg.birdSingTime, 0, 1); }
      if (b.state === 'fly' || b.state === 'leave') {
        b.ft += h; var fp = arcAt(b.f, Math.min(b.ft, b.f.T)); b.x = fp.x; b.y = fp.y; b.flap = 0.5 + 0.5 * Math.sin(TAU * 7 * b.ft);
        if (b.state === 'fly' && b.ft >= b.f.T) { b.state = 'perch'; b.x = b.perchX; b.y = b.perchY; b.flap = 0; b.stay = 0; b.f = null; }
        else if (b.state === 'leave' && b.ft >= b.f.T) this.bird = null;
      } else if (b.state === 'perch') {
        b.stay += h; b.flap = 0;
        b.nextHop -= h;
        if (b.hopT < 0 && b.nextHop <= 0 && b.hopMax > 0) { b.hopT = 0; b.hopFrom = b.hopX; b.hopTo = r.float(-b.hopMax, b.hopMax); b.dir = b.hopTo >= b.hopX ? 1 : -1; b.nextHop = r.float(cfg.birdHopEvery[0], cfg.birdHopEvery[1]); }
        if (b.hopT >= 0) {
          b.hopT += h; var uh = clamp(b.hopT / cfg.birdHopTime, 0, 1);
          b.hopX = lerp(b.hopFrom, b.hopTo, uh); b.hop = 4 * uh * (1 - uh);
          if (uh >= 1) { b.hopT = -1; b.hop = 0; }
        }
        b.x = b.perchX + b.hopX; b.y = b.perchY - b.hop * cfg.birdHopH;
        if (b.stay >= cfg.birdStay) this._birdLeave();
      }
    }
    // ---- fireflies: drift down into the gaps between the chimes, glow, zip off when tapped (or after a while)
    if (this._firefliesNext >= 0 && play && !this.fireflies.some(function (q) { return q.state !== 'zip'; })) {
      this._firefliesNext -= h;
      if (this._firefliesNext < 0) {
        this._firefliesNext = -1;
        for (i = 0; i < cfg.fireflyN; i++) {
          var sx = r.float(L.beam.x0, L.beam.x1);
          this.fireflies.push({ x: sx, y: -30, _px: sx, _py: -30, r: 10, glow: 0, phase: r.float(0, TAU), state: 'in', t: -i * cfg.fireflyStagger, sx: sx, sy: -30, ax: 0, ay: 0, zt: 0, vx: 0, vy: 0 });
        }
        this._fireflyAnchors();
        var c0 = this._bandCentre();
        this._emit({ type: 'fireflies', n: cfg.fireflyN, x: c0.x, y: L.beam.y });
      }
    }
    for (i = this.fireflies.length - 1; i >= 0; i--) {
      var f = this.fireflies[i];
      f.t += h;
      var tw = 0.5 + 0.5 * Math.sin(TAU * 0.9 * f.t + f.phase);
      if (f.state === 'in') {
        if (f.t < 0) { f.glow = 0; f.x = f.sx; f.y = -30; continue; }
        var ui = smooth(f.t / cfg.fireflyInTime);
        f.x = lerp(f.sx, f.ax, ui) + 14 * Math.sin(TAU * 0.6 * f.t + f.phase); f.y = lerp(f.sy, f.ay, ui); f.glow = 0.4 + 0.6 * tw * ui;
        if (f.t >= cfg.fireflyInTime) f.state = 'drift';
      } else if (f.state === 'drift') {
        f.x = f.ax + 18 * Math.sin(TAU * 0.23 * f.t + f.phase); f.y = f.ay + 12 * Math.sin(TAU * 0.31 * f.t + 2 * f.phase); f.glow = 0.35 + 0.65 * tw;
        if (f.t >= cfg.fireflyInTime + cfg.fireflyStay) { f.state = 'zip'; f.zt = 0; }
      } else if (f.state === 'zip') {   // flares, then zips off up and away
        f.zt += h;
        if (!f.vx && !f.vy) { var ang = r.float(-2.6, -0.5); f.vx = Math.cos(ang) * 60; f.vy = Math.sin(ang) * 60; }
        f.vx *= 1 + 3 * h; f.vy *= 1 + 3 * h; f.x += f.vx * h; f.y += f.vy * h;
        f.glow = f.tapped ? Math.max(0, 1.6 - 1.2 * f.zt / cfg.fireflyZip) : Math.max(0, 1 - f.zt / cfg.fireflyZip);
        if (f.zt >= cfg.fireflyZip * 1.5 || f.y < -40 || f.x < -40 || f.x > L.W + 40) this.fireflies.splice(i, 1);
      }
    }
  };

  P._stepKiki = function (h) {
    var b = this.kiki, cfg = this.cfg, L = this.layout;
    b.x = L.kiki.x; b.y = L.kiki.y; b.h = L.kiki.h; b.w = L.kiki.w;
    if (b.moodT > 0) { b.moodT -= h; if (b.moodT <= 0) { b.moodT = 0; b.mood = 'idle'; } }
    b.blinkT -= h;
    if (b.blink && b.blinkT <= 0) { b.blink = false; b.blinkT = this._crng.float(cfg.blink[0], cfg.blink[1]); }
    else if (!b.blink && b.blinkT <= 0) { b.blink = true; b.blinkT = cfg.blinkTime; }
    if (b._hopT >= 0) { b._hopT += h; var u = b._hopT / cfg.hopTime; b.hop = u < 1 ? Math.sin(Math.PI * u) : 0; if (u >= 1) b._hopT = -1; }
    this._lookT -= h;
    var tx = (L.beam.x0 + L.beam.x1) / 2;
    if (this._g) tx = this.finger.x;
    else if (this.hintHand) tx = this.hintHand.x;
    else if (this._lookT > 0) tx = this._lookX;
    else if (this.bird) tx = this.bird.x;
    else if (this.hedgehog) tx = this.hedgehog.x;
    else if (this.fireflies.length) tx = this.fireflies[0].x;
    b.lookX += (tx - b.lookX) * Math.min(1, h * cfg.lookRate);
    b.look = clamp((b.lookX - b.x) / 500, -1, 1);
  };

  CC.World = World;
})(window.CC = window.CC || {});
