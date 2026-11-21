/* Bibi's Cloud Drums — CD.CONFIG + CD.World (headless, deterministic cloud-drum simulation; DESIGN §2, §5.2)
 *
 * ============================== CONVENTIONS ==============================
 *  Units: logical px (short side 720), seconds, radians, y DOWN, tilt > 0 clockwise (the drum top leans RIGHT).
 *  Screen space = world space (no camera). update(dt) runs fixed sub-steps of cfg.step (1/120 s). At the START of every
 *  sub-step every moving field is copied into its `_p` twin; render v = _v + (v − _v)·w.alpha.
 *
 *  DRUMS w.drums[] (pad order, left → right) = { id, i, thing, note, target, size (body longest side, px), bw, bh, bcy
 *    (visible box; bcy < 0 = the body centre ABOVE the bottom anchor), cushionW, cushionH, padX, padBase (cushion top at rest),
 *    padY (cushion top now: + idle bob + dent sink), hop (px above the cushion), vy, x, y (drum ANCHOR = bottom centre = padY −
 *    hop, + out sway), cx, cy (body centre, follows tilt), state 'enter'|'stand'|'out'|'gone', done, ring 0..1, dull 0|1,
 *    glow 0..1, sq (vertical squash, 1 = rest), skin 0..1, skinPh (rad), tilt (rad), dent (cushion squish, ≈ −0.35..1),
 *    cushionPop 0..1, count −1|0..n (dots drum run), dim, pop 0..1, alpha 0..1 } + _px _py _pcx _pcy _psq _ptilt _pdent
 *    _pskin _ppop _pcushionPop _palpha _ppadY.
 *    Draw: DrumArt.drawCushion(padX, padY, cushionW, {dent, t, night, pop: cushionPop, alpha}) then translate(x, y)
 *    rotate(tilt) → DrumArt.drawDrum(thing, size, {glow, ring, dull, sq, skin, skinPh, dim, night, pop, count}) at alpha.
 * ========================================================================
 */
(function (CD) {
  'use strict';

  var CONFIG = {
    // ---- timing / state machine (s)
    step: 1 / 120, maxFrame: 1.0,
    roundsPerLevel: 4, chapterTimeLimit: 75, chapterMinRounds: 2,
    shortBudget: [1e9, 30, 48, 62],   // s into the chapter: a round starting later than this is short (2 targets / 2 beat steps)
    introTime: 2.5, levelDoneTime: 3.6,
    talkAfterAnswer: 1.6, talkAskTime: 12, talkGlowAfterAsks: 2, talkMaxAsks: 3, talkGiveUp: 12,

    // ---- layout (DESIGN §2; px)
    shortSide: 720, minLong: 960, maxLong: 1600, tallRatio: 1.6, phoneRatio: 1.9,
    groundLand: 14, groundPort: 26,
    bubbleX: 24, bubbleYLand: 18, bubbleMaxW: 560, bubbleRight: 200, bubbleHLand: 134, bubbleYPort: 110, bubbleHPort: 124,
    hudW: 160, hudH: 96, bubbleMinW: 220,
    bibiXLand: 118, bibiXPort: 104, bibiHLand: 230, bibiHPort: 200, bibiTallK: 1.15, bibiFeet: 4, bibiWFrac: 0.62, bibiPad: 10,
    cymOffLand: 180, cymRightPort: 120, cymSLand: 1, cymSPort: 1.1, cymW: 120, cymH: 140, cymUp: 6, cymClear: 20,
    stageX0Land: 250, stageRightLand: 40, stageSide: 36,
    floorLand: 110,          // landscape: cushion bottoms ≥ 110 px above the ground (the lamb walks below them)
    floorClear: 40,          // portrait: cushion bottoms ≥ 40 px above Bibi's head, the cymbal top and the ground
    garlandBelowLand: 46, garlandBelowPort: 84, garlandSag: 22, garlandSide: 60, lanternR: 22, lanternDrop: 34, noteRoom: 14,
    // item = the drum size, chosen PER ROUND from its real drum count n; phones / tall screens grow up to itemCap. Portrait rounds
    // that would get small drums stand in a zig-zag (alternate high / low pads, zigK × item + zigGap apart vertically).
    item: { 3: 112, 4: 112, 5: 112, 6: 104, 7: 104 }, itemCap: 150, itemCapTall: 170, itemMin: { 3: 104, 4: 104, 5: 104, 6: 96, 7: 96 },
    maxDrums: { 3: 3, 4: 4, 5: 5, 6: 5, 7: 5 }, phoneMaxDrums: 4,   // ages ≥ 5 on phones / tall portrait: ≤ 4 drums (QA visual P1-1)
    spMin: 1.3, spMax: 1.7, spTight: 1.18, spZig: 0.95, zigK: 1.35, zigGap: 56, zigGain: 8, zigJit: 8,
    sizeK: { big: 1.25, small: 0.75, mid: 1 }, beatK: 1.45, cushionK: 1.25, cushionHK: 0.32,
    stagger: 28, staggerMin: 24, bobAmp: 3, bobPeriod: [2.6, 3.4],
    hitK: 0.6, hitPad: 14, hitDiaPhone: 200, cushionHitPad: 6,   // phones / tall: every drum's hit diameter ≥ 200 logical (≥ 100 css px even on a 360 px tall phone, the small drum too)
    fairSwipe: true, coreK: 0.42, corePad: 8,                   // judge the BODY core, brush the rim (playtest P1-1)

    // ---- drum physics (DESIGN §5.2): hop + gravity, squash spring, cushion dent spring, skin ripple, tilt spring
    gravity: 2600, hopTap: 22, hopMax: 30, hopBrush: 14, hopWrong: 10, hopSong: 26, hopMin: 8,
    windup: 0.06, windSq: 0.86,                                 // anticipation: the drum squashes to ≈ 0.86 first, then hops
    sqOmega: 18, sqZeta: 0.3, sqImpact: 0.17, sqImpactMax: 0.26, sqStretch: 0.07, sqMin: 0.66, sqMax: 1.3,
    dentOmega: 12, dentZeta: 0.35, dentImpact: 0.9, dentPx: 0.2, dentMin: -0.35, dentMax: 1,
    skinTime: 0.6, skinRate: 40, skinBrush: 0.5,
    tiltOmega: 9, tiltZeta: 0.3, tiltKick: 0.12, wrongTiltK: 1.5, tiltMax: 0.35,
    wiggleEvery: [1.2, 3], wiggleAmp: 0.025,

    // ---- strikes
    swipeRef: 900, swipeMin: 0.6, swipeMax: 1.6, rateLimit: 0.18, ringTime: 0.8, wrongRing: 0.5,
    softDent: 0.15, softTilt: 0.03,

    // ---- enter: cushions puff in, then the drums fall from above the top edge onto them
    cushionDelay: 0.05, cushionStagger: 0.1, cushionPopTime: 0.32, dropGap: 0.12, dropStagger: 0.14, dropV0: 600, dropAbove: 40,
    enterMin: 1.2, enterTail: 0.25,

    // ---- beat mode (count at ages ≤ 4)
    beatGap: 0.2, beatListen: 0.9, beatNudge: 4, beatAboveMin: 1.3, cardSide: 30, cardH: 140, cardHPhone: 170, cardMinH: 110, cardWK: 0.8, cardGap: 24,
    ringK: 0.3, ringSideK: 0.15,   // the sound rings rise ≈ 0.3 × size above the skin (and spread 0.15 × size sideways): the card stays clear of them
    cardPop: 0.25, cardOut: 0.6, cardOutTime: 0.2, cardFlash: 0.4,

    // ---- notes → lanterns
    noteTime: 0.7, noteApex: 90, litRate: 3, flashTime: 0.6, lanternOmega: 5, lanternZeta: 0.12, lanternKick: 0.22, lanternSongKick: 0.12,

    // ---- play
    askGap: 1.0, countStep: 0.5, tapMovePx: 24, glowFlash: 1.0,

    // ---- song + cymbal + out
    songAskDelay: 0.5, songWait: 6, waveGap: 0.18, beatSongGap: 0.3, beatSongN: 3, cymbalDelay: 0.25, songTail: 0.6,
    cymOmega: 7, cymZeta: 0.15, cymKick: 0.32, cymTapKick: 0.14, cymRingTime: 1.2,
    outStagger: 0.08, outHop: 18, outAcc: 1500, outFade: [0.25, 0.45], outSway: 10, outTime: 0.9, cushionOutDelay: 0.12, cushionOutTime: 0.28,

    // ---- help
    hintAfterMisses: 2, assistAfter: 6, assistAfterYoung: 3, assistMaxAge: 4, hintTime: 3.2, hintCooldown: 6, hintCycle: 1.6, swipeCycle: 2.0,
    idleTime: 12, idleBackoff: 1.5, idleMax: 30, idleHintFrom: 2,

    // ---- surprises: one round per chapter (round 1 or 2, never the warm-up); chapters 0–2 rotate the types, the night is fireflies
    surpriseRounds: [1, 2], surpriseTypes: ['lamb', 'bird'], nightSurprise: 'fireflies', nightLevel: 3,
    surpriseStepS: 1.8,   // a surprise comes ≤ (notes × 1.8 − 1) s after the first ask, so short rounds see it too
    surpriseYoungAge: 4, surpriseYoungAt: 1.0, lambInYoung: 30,   // ages ≤ 4: ≈ 1 s after the first ask, the lamb starts just inside the edge (QA functional P2-1)
    lambRPhone: 92, birdRPhone: 92,
    lambAt: [3, 5], lambSpeed: 70, lambSniff: 7, lambR: 58, lambLift: 34, lambBallTime: 0.25, lambRoll: 40,
    lambRollTime: 0.6, lambUncurl: 0.35, lambBodyR: 30,
    birdAt: [3, 5], birdStay: 7, birdR: 48, birdLift: 30, birdW: 84, birdH: 72, birdFlyTime: 1.1, birdHopEvery: [0.9, 2], birdHopTime: 0.3, birdHopH: 14, birdSingTime: 1.0,
    firefliesAt: [3, 5], fireflyN: 5, fireflyR: 40, fireflyInTime: 1.6, fireflyStay: 14, fireflyZip: 0.8, fireflyStagger: 0.35,

    // ---- Bibi
    moodTime: { happy: 0.9, cheer: 1.6, oops: 0.8, think: 1.4, talk: 1.0, wave: 1.4, point: 1.2, dance: 0.5, beat: 0.2 },
    hopTime: 0.42, lookRate: 6, blink: [2.2, 5], blinkTime: 0.13
  };
  CD.CONFIG = CONFIG;

  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hyp(x, y) { return Math.sqrt(x * x + y * y); }
  function lerp(a, b, u) { return a + (b - a) * u; }
  function smooth(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  function backOut(u) { u = clamp(u, 0, 1); var s = 1.9; u -= 1; return 1 + u * u * ((s + 1) * u + s); }   // overshoot ≈ 1.12
  function merge(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; if (b) for (k in b) o[k] = b[k]; return o; }
  function insOf(ins) { return { top: +(ins && ins.top) || 0, right: +(ins && ins.right) || 0, bottom: +(ins && ins.bottom) || 0, left: +(ins && ins.left) || 0 }; }
  function keepBoxes(hk) {
    var a = Array.isArray(hk) ? hk : hk ? [hk] : [], out = [];
    for (var i = 0; i < a.length; i++) { var b = a[i]; if (b && b.w > 0 && b.h > 0) out.push({ x: +b.x, y: +b.y, w: +b.w, h: +b.h }); }
    return out;
  }
  function inBox(b, x, y, pad) { pad = pad || 0; return x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad; }
  function boxHit(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
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

  /** DESIGN §2 short-side rule: CSS viewport → logical W×H. */
  function logicalSize(cssW, cssH, cfg) {
    cfg = cfg || CONFIG;
    var S = cfg.shortSide, aspect = cssW / Math.max(1, cssH);
    if (cssW >= cssH) return { W: clamp(Math.round(S * aspect), cfg.minLong, cfg.maxLong), H: S };
    return { W: S, H: clamp(Math.round(S / aspect), cfg.minLong, cfg.maxLong) };
  }
  function ageKey(age) { return clamp(Math.round(+age || 4), 3, 7); }

  /** The visible body box {w, h, cy} of a drum standing on its bottom anchor; cy < 0 (above the anchor). DrumArt.bodyBox when
   *  it follows that contract, else an estimate per kind (drum / shape / dots / glyph w 1.0 h 0.86, animal w 0.9 h 1.0, big w 1.0 h 0.95). */
  function bodyBox(thing, size) {
    var A = CD.DrumArt;
    if (A && typeof A.bodyBox === 'function') {
      try {
        var b = A.bodyBox(thing, size);
        if (b && b.w > 0 && b.h > 0 && b.cy < 0) { var h = Math.min(size, b.h); return { w: Math.min(size, b.w), h: h, cy: clamp(+b.cy, -h, -0.2 * h) }; }
      } catch (e) { /* headless */ }
    }
    var k = thing && thing.kind, w = 1, hh = 0.86;
    if (k === 'animal') { w = 0.9; hh = 1.0; } else if (k === 'big') hh = 0.95;
    return { w: w * size, h: hh * size, cy: -hh * size * 0.5 };
  }
  /** Size factor of a thing (size topic big / small, the beat drum). */
  function kOf(thing, cfg) { return thing.kind === 'big' ? cfg.beatK : thing.size ? cfg.sizeK[thing.size] || 1 : 1; }

  /* ---------------------------------------------------------------- layout (DESIGN §2)
   * Sized for n drums (the round's real count; maxDrums[age] between rounds) whose biggest is kMax × item (the size topic's big
   * drum 1.25; the beat drum `beat`). Candidates, the first that fits wins (u = kMax × item, foot = cushionK × u):
   *   zig (portrait, n ≥ 3): item = min(cap, usable / (kMax (spZig (n − 1) + cushionK))) when ≥ zigGain px bigger than the row
   *   row:  item = min(cap, usable / (kMax (spMin (n − 1) + cushionK)))   (cap = itemCap 150 on phones / tall screens, else the age's item)
   *   then the row at itemMin × 1.3, itemMin × 1.18, finally (odd viewports only) a squeezed item at 1.18. */
  function computeLayout(W, H, ins, cfg, age, hudKeep, n, kMax, beat) {
    var a = ageKey(age), portrait = H > W, phone = (portrait ? H / W : W / H) > cfg.phoneRatio, tall = H / W > cfg.tallRatio;
    n = Math.max(1, Math.round(n || cfg.maxDrums[a])); kMax = beat ? 1 : (kMax || 1);
    var base = cfg.item[a], lo = cfg.itemMin[a] || base;
    var caps = tall ? [Math.max(base, cfg.itemCapTall), Math.max(base, cfg.itemCap)] : phone ? [Math.max(base, cfg.itemCap)] : [base];
    var probe = layoutTier(W, H, ins, cfg, a, hudKeep, base, cfg.spMin, n, false, kMax, beat), usable = probe.usable, L;
    var per = function (sp) { return kMax * (sp * (n - 1) + cfg.cushionK); };
    var tiers = [];
    caps.forEach(function (cap) {   // tall phones try 170 first, then 150
      var row = Math.min(cap, Math.floor(usable / per(cfg.spMin)));
      if (portrait && n >= 3 && kMax === 1) { var zi = Math.min(cap, Math.floor(usable / per(cfg.spZig))); if (zi >= row + cfg.zigGain && row < cap) tiers.push([zi, cfg.spZig, true]); }
      if (row >= Math.min(cap, base) || row >= lo) tiers.push([row, cfg.spMin, false]);
    });
    tiers.push([lo, cfg.spMin, false]); tiers.push([lo, cfg.spTight, false]);
    for (var t = 0; t < tiers.length; t++) {
      L = layoutTier(W, H, ins, cfg, a, hudKeep, tiers[t][0], tiers[t][1], n, tiers[t][2], kMax, beat);
      L.tier = t;
      if (L.fits) return L;
    }
    if (portrait && cfg.garlandBelowPort > cfg.garlandBelowLand) {   // a very short portrait: the lantern string moves up (the bird may then sit over the bubble edge)
      var L2 = computeLayout(W, H, ins, merge(cfg, { garlandBelowPort: cfg.garlandBelowLand }), age, hudKeep, n, kMax, beat);
      if (L2.fits) return L2;
    }
    var sq = Math.max(72, Math.floor(usable / per(cfg.spTight)));   // an odd viewport (never an Apple device)
    L = layoutTier(W, H, ins, cfg, a, hudKeep, Math.min(lo, sq), cfg.spTight, n, false, kMax, beat); L.tier = tiers.length; L.squeezed = true;
    return L;
  }
  /** The HUD's measured box among the hudKeep boxes (the one in the right half; main.js passes [HUD, bubble]). */
  function hudBox(hk, W) { var best = null; for (var i = 0; i < hk.length; i++) { var b = hk[i]; if (b.x + b.w / 2 > W / 2 && (!best || b.y + b.h > best.y + best.h)) best = b; } return best; }
  function layoutTier(W, H, ins, cfg, a, hudKeep, item, spK, n, zig, kMax, beat) {
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
    var kh = portrait ? Math.round(cfg.bibiHPort * (tall ? cfg.bibiTallK : 1)) : cfg.bibiHLand;
    var bibi = { x: ins.left + (portrait ? cfg.bibiXPort : cfg.bibiXLand), y: groundY - cfg.bibiFeet, h: kh, w: cfg.bibiWFrac * kh };
    var bibiBox = { x: bibi.x - bibi.w / 2 - cfg.bibiPad, y: bibi.y - kh - cfg.bibiPad, w: bibi.w + 2 * cfg.bibiPad, h: kh + 2 * cfg.bibiPad };
    // the cymbal on its stand (decoration): landscape right of Bibi, portrait bottom-right
    var cs = portrait ? cfg.cymSPort : cfg.cymSLand, cw = cfg.cymW * cs, ch = cfg.cymH * cs;
    var cymbal = { x: portrait ? W - ins.right - cfg.cymRightPort : bibi.x + cfg.cymOffLand, y: groundY - cfg.cymUp, s: cs, w: cw, h: ch };
    var cymbalBox = { x: cymbal.x - cw / 2, y: cymbal.y - ch, w: cw, h: ch };
    var x0 = ins.left + (portrait ? cfg.stageSide : cfg.stageX0Land), x1 = W - ins.right - (portrait ? cfg.stageSide : cfg.stageRightLand);
    var keepTop = 0;
    hk.forEach(function (b) { if (b.y + b.h < H / 2) keepTop = Math.max(keepTop, b.y + b.h); });
    var bb = bubble.y + bubble.h;
    var gy = Math.max(bb, keepTop) + (portrait ? cfg.garlandBelowPort : cfg.garlandBelowLand);
    var garland = { x0: ins.left + cfg.garlandSide, x1: W - ins.right - cfg.garlandSide, y: gy, sag: cfg.garlandSag };
    var lanternBottom = gy + cfg.garlandSag + cfg.lanternDrop;
    var topLimit = Math.max(lanternBottom + cfg.noteRoom, bb + 8, keepTop + 8);   // hit circle tops stay below this
    // floor: the lowest cushion bottom (landscape: the lamb walks below; portrait: above Bibi's head and the cymbal)
    var floor = portrait ? Math.min(bibiBox.y + cfg.bibiPad, cymbalBox.y, groundY) - cfg.floorClear : groundY - cfg.floorLand;
    var hitPad = (tall || phone) ? Math.max(cfg.hitPad, cfg.hitDiaPhone / 2 - cfg.hitK * item) : cfg.hitPad, hitMin = (tall || phone) ? cfg.hitDiaPhone / 2 : 0;
    var hr = function (s) { return Math.max(cfg.hitK * s + hitPad, hitMin); };
    var u = kMax * item, cushion = { w: cfg.cushionK * item, h: cfg.cushionHK * item };
    var usable = x1 - x0;
    var L = { W: W, H: H, ins: ins, portrait: portrait, tall: tall, phone: phone, groundY: groundY, bubble: bubble, hud: hud,
      bibi: bibi, bibiBox: bibiBox, cymbal: cymbal, cymbalBox: cymbalBox, stage: { x0: x0, x1: x1, y: 0 }, pads: [],
      garland: garland, lanterns: [], item: item, spK: spK, kMax: kMax, cushion: cushion, maxSize: u, usable: usable,
      hitPad: hitPad, hitMin: hitMin, hitR: hr(item), n: n, zig: !!zig, beat: null, topLimit: topLimit, lanternBottom: lanternBottom,
      floor: floor, cymFloor: cymbalBox.y - cfg.cymClear, keepTop: keepTop, band: null,
      safe: { x: ins.left, y: ins.top, w: W - ins.left - ins.right, h: H - ins.bottom - ins.top } };
    L.keep = [{ x: bubble.x, y: bubble.y, w: bubble.w, h: bubble.h, kind: 'bubble' }, { x: hud.x, y: hud.y, w: hud.w, h: hud.h, kind: 'hud' }];
    hk.forEach(function (b) { b.kind = 'hudKeep'; L.keep.push(b); });
    // vertical: the pad (cushion top) range for the biggest drum of this layout
    var bobA = cfg.bobAmp, vmid = (lanternBottom + floor) / 2;
    var padTop = function (s, hk) { return topLimit + (hk || 0.5) * s + hr(s) + bobA; };   // highest pad whose hit circle top stays below topLimit (animal box: centre 0.5 s up)
    var padLow = function (s, fl) { return fl - cfg.cushionHK * s - bobA; };                               // lowest pad whose cushion stays above the floor
    var fits;
    if (beat) {   // ONE big drum + the number card: above it when there is room for a clearly big drum, else beside it
      var cH0 = (tall || phone) ? cfg.cardHPhone : cfg.cardH;
      var s = Math.round(item * cfg.beatK), cardH = cH0, cardTop = Math.max(lanternBottom + 8, bb + 8, keepTop + 8), mode = 'above';
      var minAbove = function (s2, h2) { return cardTop + h2 + cardClear(cfg, s2) + 0.95 * s2 + bobA; };   // the highest pad with the card above
      var sMin = Math.round(item * cfg.beatAboveMin);
      while (s > sMin && padLow(s, floor) < minAbove(s, cardH)) s -= 2;
      while (cardH > cfg.cardMinH && padLow(s, floor) < minAbove(s, cardH)) cardH -= 2;
      if (padLow(s, floor) < minAbove(s, cardH)) {   // the card goes beside the drum (to its right), the pair centred on the stage
        mode = 'side'; s = Math.round(item * cfg.beatK); cardH = cH0;
        while (s > item && padLow(s, floor) < padTop(s, 0.475)) s -= 2;
      }
      var cardW = Math.round(cardH * cfg.cardWK);
      // side: the pair spans padX − cushion/2 … card right edge; shift centres it on the stage
      L.beat = { size: s, cardH: cardH, cardW: cardW, cardTop: cardTop, mode: mode, shift: mode === 'side' ? -(sideGap(cfg, s) + cardW - (cfg.cushionK - 1) * s / 2) / 2 : 0 };
      L.maxSize = s;
      var lo2 = mode === 'above' ? minAbove(s, cardH) : padTop(s, 0.475), hi2 = padLow(s, floor);
      fits = hi2 >= lo2 && (mode === 'above' ? cfg.cushionK * s : (cfg.cushionK + 1) * s / 2 + sideGap(cfg, s) + cardW) <= usable + 1e-6;
      L.base = clamp(hi2 - cfg.stagger, lo2, Math.max(lo2, hi2));
      // portrait: the drum (+ the card above it) is centred between the lantern string and Bibi's head (QA visual P2-7)
      if (portrait) L.base = clamp(vmid + (mode === 'above' ? (0.63 * s + cardClear(cfg, s) + cardH) / 2 : 0.315 * s), lo2, Math.max(lo2, hi2));
    } else {
      var span = kMax * item * (spK * (n - 1) + cfg.cushionK);
      var lowest = padLow(u, floor), highest = padTop(u);
      if (zig) {
        L.zigDy = cfg.zigK * u + cfg.zigGap; L.base = lowest - cfg.zigJit; fits = L.base - L.zigDy - cfg.zigJit >= highest;
        if (fits && portrait) L.base = clamp(vmid + (L.zigDy + 0.54 * u) / 2, highest + L.zigDy + cfg.zigJit, lowest - cfg.zigJit);
      } else if (lowest - 2 * cfg.stagger >= highest) {
        L.base = lowest - cfg.stagger; fits = true;
        if (portrait) L.base = clamp(vmid + 0.27 * u, highest + cfg.stagger, lowest - cfg.stagger);   // centred band (QA visual P2-7)
      } else if (lowest >= highest) { L.base = (lowest + highest) / 2; L.tight = true; fits = true; }   // no room to stagger: one height
      else { L.base = lowest; fits = false; }
      // landscape: a drum standing over the cymbal keeps its cushion above the cymbal top
      var sp0 = n <= 1 ? 0 : clamp((usable - cfg.cushionK * u) / (n - 1), spK * u, (zig ? cfg.spMin : cfg.spMax) * u), xFirst = (x0 + x1) / 2 - (n - 1) / 2 * sp0;
      if (!portrait && Math.abs(xFirst - cymbal.x) < cymbal.w / 2 + cfg.cushionK * u / 2 + 10 && padLow(u, L.cymFloor) < highest) {
        // no room above the cymbal (a short landscape screen): the stage starts right of it instead
        L.stage.x0 = x0 = Math.max(x0, cymbalBox.x + cymbalBox.w + 10); L.usable = usable = x1 - x0; L.cymShift = true;
      }
      fits = fits && span <= usable + 1e-6;
    }
    L.fits = fits;
    L.stage.y = L.base;
    L.band = { x: x0 - 20, y: topLimit - 10, w: x1 - x0 + 40, h: Math.max(60, floor + 20 - (topLimit - 10)) };
    return L;
  }
  /** Room between the big drum's top (at rest) and the card above it: the hop, the sound rings, a gap. */
  function cardClear(cfg, s) { return cfg.hopMax + cfg.ringK * s + cfg.cardGap; }
  /** Gap between the big drum's body and the card beside it. */
  function sideGap(cfg, s) { return cfg.cardSide + cfg.ringSideK * s; }
  /** The hit radius of a drum of size s: 0.6 s + hitPad, at least hitDiaPhone / 2 on phones / tall screens. */
  function hitROf(L, cfg, s) { return Math.max(cfg.hitK * s + L.hitPad, L.hitMin || 0); }
  /**
   * Pads (cushion tops) for n drums: centred on the stage, spacing clamp((usable − foot) / (n − 1), spK × u, spMax × u)
   * (u = kMax × item, foot = cushionK × u; zig-zag ≤ spMin × u); heights staggered per round seed (± stagger, neighbours ≥
   * staggerMin apart; zig-zag: alternate high / low rows zigDy apart), then clipped per drum to [hit circle below topLimit,
   * cushion above the floor / over the cymbal: above the cymbal]. sizes = [{size, box}] (optional, else the biggest drum).
   */
  function padsFor(L, n, cfg, seed, sizes, flat) {
    cfg = cfg || CONFIG;
    var u = L.kMax * L.item, foot = cfg.cushionK * u, mid = (L.stage.x0 + L.stage.x1) / 2, out = [], i;
    var sp = n <= 1 ? 0 : L.zig ? clamp((L.usable - foot) / (n - 1), L.spK * u, cfg.spMin * u) : clamp((L.usable - foot) / (n - 1), L.spK * u, cfg.spMax * u);
    var rr = new CD.RNG(((seed === undefined ? 1 : seed) ^ 0x2c1b3a77) >>> 0), prev = null, A = cfg.stagger, first = rr.chance(0.5) ? 0 : 1;
    for (i = 0; i < n; i++) {
      var x = mid + (i - (n - 1) / 2) * sp + (L.beat ? L.beat.shift : 0), sz = sizes && sizes[i] ? sizes[i] : { size: L.beat ? L.beat.size : u, box: { h: u, cy: -0.5 * u, w: u } };
      var s = sz.size, bx = sz.box, cw = cfg.cushionK * s;
      var lo = L.topLimit + (-bx.cy) + hitROf(L, cfg, s) + cfg.bobAmp;   // highest allowed pad (smallest y)
      var fl = L.floor;
      if (!L.portrait && Math.abs(x - L.cymbal.x) < L.cymbal.w / 2 + cw / 2 + 10) fl = Math.min(fl, L.cymFloor);
      var hi = fl - cfg.cushionHK * s - cfg.bobAmp;                              // lowest allowed pad
      if (L.beat && L.beat.mode === 'above') lo = Math.max(lo, L.beat.cardTop + L.beat.cardH + cardClear(cfg, s) + bx.h + cfg.bobAmp);
      var y;
      if (L.beat || n === 1 || flat) y = L.base;
      else if (L.zig) y = L.base - ((i + first) % 2 ? L.zigDy : 0) + rr.float(-cfg.zigJit, cfg.zigJit);
      else if (L.tight) y = L.base;
      else {
        var v = -1e9;
        for (var t = 0; t < 24 && v < -1e8; t++) { var q = rr.float(-A, A); if (prev === null || Math.abs(q - prev) >= cfg.staggerMin - 1e-6) v = q; }
        if (v < -1e8) v = prev >= 0 ? -A : A;
        prev = v; y = L.base + v;
      }
      out.push({ x: x, y: clamp(y, lo, Math.max(lo, hi)), lo: lo, hi: hi, clipped: y < lo || y > hi });
    }
    if (flat && n > 1) {   // size rounds: every drum on ONE line so big and small compare at a glance (QA visual P2-3)
      var mlo = -1e9, mhi = 1e9;
      out.forEach(function (p) { mlo = Math.max(mlo, p.lo); mhi = Math.min(mhi, p.hi); });
      if (mlo <= mhi) out.forEach(function (p) { p.y = clamp(L.base, mlo, mhi); p.clipped = false; p.flat = true; });
    }
    return out;
  }
  /** n lantern centres, evenly spaced along the garland string, on its sag curve. */
  function lanternsFor(L, n) {
    var G = L.garland, out = [];
    for (var i = 0; i < n; i++) {
      var u = (i + 1) / (n + 1);
      out.push({ x: lerp(G.x0, G.x1, u), y: G.y + G.sag * 4 * u * (1 - u) });
    }
    return out;
  }
  function stringY(G, x) { var u = clamp((x - G.x0) / Math.max(1, G.x1 - G.x0), 0, 1); return G.y + G.sag * 4 * u * (1 - u); }

  // ------------------------------------------------------------------ World
  function World(opts) {
    opts = opts || {};
    this.cfg = merge(CONFIG, opts.config);
    this.seed = opts.seed !== undefined ? opts.seed : 1;
    this.rng = new CD.RNG(this.seed);
    this._crng = new CD.RNG((CD.RNG.hash(this.seed) ^ 0x51ed27) >>> 0);   // cosmetic randomness (wiggles, blinks, surprises)
    this.age = CD.Content.ageOf(opts.age !== undefined ? opts.age : 4);
    this.lang = opts.lang === 'vi' ? 'vi' : 'en';
    this._pendingAge = this.age; this._pendingLang = this.lang;
    this.state = 'menu'; this.phase = null;
    this.level = 0; this.levels = []; this.topic = null; this.weather = 0;
    this.round = 0; this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.stars = 0; this.levelStars = 0; this.roundStars = 0; this.misses = 0; this.stepMisses = 0; this.streak = 0;
    this.time = 0; this.stateTime = 0; this.phaseTime = 0; this.alpha = 0; this._acc = 0;
    this.cur = null; this.step = -1; this.talk = null; this.talkAnswered = null;
    this.drums = []; this.lanterns = []; this.notes = []; this.songs = []; this.fireflies = [];
    this.lamb = null; this.bird = null; this.hintHand = null; this.assistId = null; this.card = null;
    this.cymbal = { tilt: 0, vtilt: 0, ring: 0, _ptilt: 0 };
    this.bibi = { x: 0, y: 0, h: 200, w: 124, mood: 'idle', moodT: 0, blinkT: 3, blink: false, look: 0, lookX: 0, hop: 0, _phop: 0, _hopT: -1 };
    this.finger = { x: 0, y: 0, down: false };
    this.hudKeep = opts.hudKeep || null; this.lastTopics = null; this.surprise = null; this._surpriseOff = 0; this._surpriseRound = 1;
    this.events = []; this.sessions = 0;
    this._idleN = 0; this._idleT = 0; this._idleGap = this.cfg.idleTime; this._lastHintT = -1e9; this.levelStartTime = 0;
    this._talkAskT = 0; this._talkAsks = 0; this._g = null; this._beat = null;
    this._usedKeys = []; this._prevAns = null; this._prevAnsRun = 0; this._stepDone = false; this._waitAsk = -1; this._noProg = 0;
    this._view = null; this._vp = null; this._wiggleT = 1; this._lastNote = -1; this._lit = 0; this._song = null; this._lookT = 0; this._lookX = 0;
    this.setViewport(opts.width || 1280, opts.height || 720, opts.ins || null);
  }
  World.logicalSize = logicalSize;
  World.computeLayout = function (W, H, ins, cfg, age, hudKeep, n, kMax, beat) { return computeLayout(W, H, ins, merge(CONFIG, cfg), age === undefined ? 4 : age, hudKeep, n, kMax, beat); };
  World.padsFor = function (L, n, cfg, seed, sizes, flat) { return padsFor(L, n, merge(CONFIG, cfg), seed, sizes, flat); };
  World.lanternsFor = lanternsFor;
  World.bodyBox = bodyBox;
  World.kickFor = kickFor;
  World.arc = arc;
  World.segHit = segHit;

  var P = World.prototype;
  /** true while a first contact on the asked drum would be judged right now (round, play phase, the step open). */
  Object.defineProperty(P, 'interactive', { get: function () { return this.state === 'round' && this.phase === 'play' && !this._stepDone; } });
  Object.defineProperty(P, 'stepInfo', { get: function () { return this.cur && this.step >= 0 ? this.cur.steps[this.step] || null : null; } });
  P._emit = function (e) { this.events.push(e); };
  P.drainEvents = function () { var e = this.events; this.events = []; return e; };
  P.setAge = function (a) { this._pendingAge = CD.Content.ageOf(a); };
  P.setLang = function (l) { this._pendingLang = l === 'vi' ? 'vi' : 'en'; };
  P._setState = function (s) { this.state = s; this.stateTime = 0; };
  P._setPhase = function (p) { this.phase = p; this.phaseTime = 0; };
  P._mood = function (m, t) { this.bibi.mood = m; this.bibi.moodT = t || this.cfg.moodTime[m] || 1; };
  P._hop = function () { this.bibi._hopT = 0; };
  P.skipTalk = function () { if (this.state === 'talk') this._levelDone(); };
  P.drumById = function (id) { for (var i = 0; i < this.drums.length; i++) if (this.drums[i].id === id) return this.drums[i]; return null; };
  P._bibiMouth = function () { var B = this.layout.bibi; return { x: B.x + 0.18 * B.h, y: B.y - 0.62 * B.h }; };
  P._assistAfter = function () { return this.age <= this.cfg.assistMaxAge ? this.cfg.assistAfterYoung : this.cfg.assistAfter; };
  P._isBeat = function () { var s = this.stepInfo; return !!(s && s.mode === 'beat'); };
  P._bandCentre = function () {
    var b = this.layout.band, n = 0, sy = 0;
    for (var i = 0; i < this.drums.length; i++) { var c = this.drums[i]; if (c.state !== 'gone') { sy += c.padBase + c.bcy; n++; } }
    return { x: b.x + b.w / 2, y: n ? sy / n : b.y + b.h / 2 };
  };

  /** The current question {promptKey, params, mode, step, nameKind, nameValue, need} (enter / play), else null. */
  P.prompt = function () {
    if (this.state !== 'round' || !this.cur || (this.phase !== 'play' && this.phase !== 'enter')) return null;
    var i = Math.max(0, this.step), s = this.cur.steps[i];
    if (!s) return null;
    return { promptKey: s.promptKey, params: s.params, mode: s.mode, step: i, nameKind: s.nameKind, nameValue: s.nameValue, need: s.need };
  };

  // ---------------------------------------------------------------- geometry + test hooks (logical px)
  P._hitR = function (c) { return hitROf(this.layout, this.cfg, c.size); };
  /** The body core (judged on a slide / press): r = 0.42 × size + 8 — cores of neighbours never overlap. */
  P._coreR = function (c) { return this.cfg.coreK * c.size + this.cfg.corePad; };
  P._coreSet = function (x, y) {
    var o = {};
    for (var i = 0; i < this.drums.length; i++) { var q = this.drums[i]; if (this._touchable(q) && hyp(x - q.cx, y - q.cy) <= this._coreR(q)) o[q.id] = true; }
    return o;
  };
  /** The cushion's tap box {x, y, w, h} (under the drum). */
  P._cushionBox = function (c) { var p = this.cfg.cushionHitPad; return { x: c.padX - c.cushionW / 2 - p, y: c.padY - p, w: c.cushionW + 2 * p, h: c.cushionH + 2 * p }; };
  /** The drum's hit circle {x, y, r} (body centre where it is now, r = 0.6 × size + hitPad). */
  P.drumHit = function (id) { var c = this.drumById(id); return c && c.state !== 'gone' ? { x: c.cx, y: c.cy, r: this._hitR(c) } : null; };
  P._touchable = function (c) { return c.state === 'stand'; };
  /** The drum under (x, y): inside its hit circle or its cushion box; the nearest body centre wins. */
  P._drumAt = function (x, y) {
    var best = null, bd = 1e9;
    for (var i = 0; i < this.drums.length; i++) {
      var c = this.drums[i];
      if (!this._touchable(c)) continue;
      var d = hyp(x - c.cx, y - c.cy), ok = d <= this._hitR(c) || inBox(this._cushionBox(c), x, y);
      if (ok && d < bd) { bd = d; best = c; }
    }
    return best;
  };
  /** Bibi's tap box {x, y (top-left), w, h, cx, cy}. */
  P.bibiHit = function () { var b = this.layout.bibiBox; return { x: b.x, y: b.y, w: b.w, h: b.h, cx: b.x + b.w / 2, cy: b.y + b.h / 2 }; };
  /** The cymbal's tap box {x, y (top-left), w, h, cx, cy}. */
  P.cymbalHit = function () { var b = this.layout.cymbalBox; return { x: b.x, y: b.y, w: b.w, h: b.h, cx: b.x + b.w / 2, cy: b.y + b.h / 2 }; };
  /** The drum stage {x0, x1, y (mean cushion top), band}. */
  P.stageHit = function () { var L = this.layout; return { x0: L.stage.x0, x1: L.stage.x1, y: L.stage.y, band: L.band }; };
  P._clearOfKeep = function (x, y, r) { var K = this.layout.keep; for (var k = 0; k < K.length; k++) if (inBox(K[k], x, y, r * 0.5)) return false; return true; };
  /** The lamb's tap circle while it can be tapped (walking / sniffing, on screen), else null. */
  P.lambHit = function () {
    var g = this.lamb, L = this.layout, cfg = this.cfg;
    if (!g || (g.state !== 'walk' && g.state !== 'sniff') || g.x < L.ins.left + 30 || g.x > L.W - L.ins.right - 30) return null;
    var c = { x: g.x, y: g.y - cfg.lambLift, r: L.phone || L.tall ? cfg.lambRPhone : cfg.lambR };
    return this._drumAt(c.x, c.y) ? null : c;
  };
  /** The bird's tap circle while it sits on the lantern string, else null. */
  P.birdHit = function () {
    var b = this.bird, cfg = this.cfg, L = this.layout;
    if (!b || b.state !== 'perch') return null;
    var c = { x: b.x, y: b.y - cfg.birdLift, r: L.phone || L.tall ? cfg.birdRPhone : cfg.birdR };
    return this._drumAt(c.x, c.y) ? null : c;
  };
  /** The first firefly that can be tapped (drifting, on screen, clear of drums and of the HUD / bubble), else null. */
  P.fireflyHit = function () {
    var L = this.layout, r = this.cfg.fireflyR;
    for (var i = 0; i < this.fireflies.length; i++) {
      var f = this.fireflies[i];
      if (f.state !== 'drift' || f.y < L.ins.top + 10 || f.x < L.ins.left + 10 || f.x > L.W - L.ins.right - 10) continue;
      if (this._drumAt(f.x, f.y) || !this._clearOfKeep(f.x, f.y, r)) continue;
      return { x: f.x, y: f.y, r: r, i: i };
    }
    return null;
  };
  P._fireflyAt = function (x, y) {
    var r = this.cfg.fireflyR, best = null, bd = 1e9;
    for (var i = 0; i < this.fireflies.length; i++) { var f = this.fireflies[i], d = hyp(x - f.x, y - f.y); if (f.state === 'drift' && d <= r && d < bd) { bd = d; best = f; } }
    return best;
  };
  /** What to touch next: {drum: id} in play (the asked drum; beat mode: the big drum until the count is done), {song: true}
   *  while the song waits for its first touch, else null. */
  P.answer = function () {
    if (this.state === 'roundDone' && this.phase === 'song' && this._song && !this._song.started) return { song: true };
    if (!this.interactive) return null;
    var c = this._askedDrum();
    return c ? { drum: c.id } : null;
  };
  /** The asked drum (find / beat: the target; findAll: the first target not rung right yet). */
  P._askedDrum = function () {
    var s = this.stepInfo;
    if (!s) return null;
    for (var i = 0; i < s.targets.length; i++) { var c = this.drumById(s.targets[i]); if (c && !c.done) return c; }
    return null;
  };

  // ---------------------------------------------------------------- viewport
  P.setViewport = function (W, H, ins) { this._view = { W: W, H: H, ins: insOf(ins) }; this._relayout(false); };
  P._shape = function () {
    var cfg = this.cfg, n = this.drums.length || Math.min(cfg.maxDrums[this.age], this._drumCap()), k = 1, beat = false;
    for (var i = 0; i < this.drums.length; i++) { var t = this.drums[i].thing; if (t.kind === 'big') beat = true; else k = Math.max(k, kOf(t, cfg)); }
    return { n: n, k: k, beat: beat };
  };
  /** The most drums a round may have on this screen: ages ≥ 5 on phones / tall portrait screens get ≤ 4 (bigger drums). */
  P._drumCap = function () {
    var v = this._view, cfg = this.cfg, portrait = v.H > v.W, phone = (portrait ? v.H / v.W : v.W / v.H) > cfg.phoneRatio, tall = v.H / v.W > cfg.tallRatio;
    return this.age >= 5 && (phone || tall) ? cfg.phoneMaxDrums : 5;
  };
  P._relayout = function (force) {
    var v = this._view, sh = this._shape();
    var key = v.W + 'x' + v.H + ':' + JSON.stringify(v.ins) + ':' + this.age + ':' + sh.n + ':' + sh.k + ':' + sh.beat + ':' + JSON.stringify(this.hudKeep || null);
    if (key === this._vp && !force) return false;
    var had = !!this.layout;
    this._vp = key;
    this.layout = computeLayout(v.W, v.H, v.ins, this.cfg, this.age, this.hudKeep, sh.n, sh.k, sh.beat);
    this.layout.hudKeep = keepBoxes(this.hudKeep);
    var K = this.layout.bibi;
    this.bibi.x = K.x; this.bibi.y = K.y; this.bibi.h = K.h; this.bibi.w = K.w;
    this.layout.pads = padsFor(this.layout, sh.n, this.cfg, this.cur ? this.cur.seed : 1, null, !!(this.cur && this.cur.topic === 'size'));
    this.layout.lanterns = lanternsFor(this.layout, this.lanterns.length);
    if (had) this._snapAll();
    return true;
  };
  /** Rotation / resize mid-round: cancel the gesture, pads re-placed (deterministic per round), drums keep their motion (hop,
   *  squash, tilt, dent), lanterns + the card move, notes in flight retarget, surprises re-placed. */
  P._snapAll = function () {
    var i, L = this.layout, self = this;
    this.cancelDrag();
    if (this.drums.length) {
      this._placeDrums();
      this.drums.forEach(function (c) { if (c.state === 'enter' && !c._released) c.hop = c.padBase + self.cfg.dropAbove; self._pose(c); self._twinDrum(c); });
    }
    for (i = 0; i < this.lanterns.length; i++) { var ln = this.lanterns[i], p = L.lanterns[i]; ln.x = p.x; ln.y = p.y; }
    for (i = 0; i < this.notes.length; i++) {
      var n = this.notes[i], to = L.lanterns[n.lantern] || { x: n.x1, y: n.y1 }, T = Math.max(0.3, n.T - n.t);
      n.x = clamp(n.x, 0, L.W); n.y = clamp(n.y, 0, L.H);
      n.f = arc(n.x, n.y, to.x, to.y, T, this.cfg.noteApex * 0.5, 0, L.ins.top + 8);
      n.x0 = n.x; n.y0 = n.y; n.x1 = to.x; n.y1 = to.y; n.T = n.t + T; n.t0 = n.t; n._px = n.x; n._py = n.y;
    }
    if (this.lamb) { var hg = this.lamb; hg.y = hg._py = this._lambY(); hg.stopX = this._lambStop(); if (hg.state !== 'walk' && hg.state !== 'leave') hg.x = hg._px = hg.stopX; }
    if (this.bird) { var b = this.bird; this._birdPlan(); if (b.state === 'perch') { b.x = b._px = b.perchX + b.hopX; b.y = b._py = stringY(L.garland, b.x); } else if (b.f && b.state === 'fly') { b.f = arc(b.x, b.y, b.perchX, b.perchY, Math.max(0.3, b.f.T - b.ft), 40, 0); b.ft = 0; } }
    if (this.fireflies.length) this._fireflyAnchors();
    this.hintHand && this._stepHint(0);
  };
  /** Pads, sizes, boxes, cushions and the card of the round's drums (heights staggered per round seed). */
  P._placeDrums = function () {
    var L = this.layout, cfg = this.cfg, n = this.drums.length;
    var sizes = this.drums.map(function (c) {
      var s = c.thing.kind === 'big' && L.beat ? L.beat.size : Math.floor(L.item * kOf(c.thing, cfg));
      return { size: s, box: bodyBox(c.thing, s) };
    });
    L.pads = padsFor(L, n, cfg, this.cur ? this.cur.seed : 1, sizes, !!(this.cur && this.cur.topic === 'size'));
    var top = 1e9, bot = -1e9, sy = 0;
    this.drums.forEach(function (c, i) {
      var z = sizes[i], p = L.pads[i];
      c.i = i; c.size = z.size; c.bw = z.box.w; c.bh = z.box.h; c.bcy = z.box.cy;
      c.cushionW = cfg.cushionK * c.size; c.cushionH = cfg.cushionHK * c.size;
      c.padX = p.x; c.padBase = p.y;
      top = Math.min(top, p.y + c.bcy - hitROf(L, cfg, c.size) - cfg.hopMax); bot = Math.max(bot, p.y + c.cushionH); sy += p.y;
    });
    if (n) {
      L.stage.y = sy / n;
      L.band = { x: L.stage.x0 - 20, y: Math.min(top, L.topLimit) - 10, w: L.stage.x1 - L.stage.x0 + 40, h: bot + 20 - (Math.min(top, L.topLimit) - 10) };
    }
    if (this.card) this._placeCard();
  };
  /** The number card's centre above the big drum (beat mode). */
  P._placeCard = function () {
    var L = this.layout, cfg = this.cfg, c = this.drumById(this.card.id) || this.drums[0], B = L.beat;
    if (!c) return;
    var h = B ? B.cardH : cfg.cardH, w = B ? B.cardW : Math.round(h * cfg.cardWK);
    if (B && B.mode === 'side') { this.card.x = c.padX + c.bw / 2 + sideGap(cfg, c.size) + w / 2; this.card.y = c.padBase + c.bcy; }
    else { this.card.x = c.padX; this.card.y = c.padBase - cfg.bobAmp - c.bh - cardClear(cfg, c.size) - h / 2; }
    this.card.w = w; this.card.h = h; this.card.mode = B ? B.mode : 'above';
  };

  // ---------------------------------------------------------------- session flow
  P.newSession = function (opts) {
    this.age = this._pendingAge; this.lang = this._pendingLang;
    this._relayout(false);
    this.sessions++;
    this._clearRound(); this.cur = null; this.state = 'menu';
    var last = (opts && opts.lastTopics) || this.lastTopics || null;
    this.levels = CD.Content.topicsFor(this.age, this.rng, last);
    this._surpriseOff = this.rng.int(0, Math.max(0, this.cfg.surpriseTypes.length - 1));
    this.stars = 0; this.songs = []; this._prevAns = null; this._prevAnsRun = 0;
    this.weather = 0;
    this._emit({ type: 'session', levels: this.levels.slice() });
    this.startLevel(0);
  };
  /** keep = true between two rounds: a lamb / bird / fireflies already leaving finish their exit. */
  P._clearRound = function (keep) {
    this.drums = []; this.lanterns = []; this.notes = []; this.step = -1; this._g = null; this.finger.down = false;
    if (!keep || !this.lamb || this.lamb.state !== 'leave') this.lamb = null;
    if (!keep || !this.bird || this.bird.state !== 'leave') this.bird = null;
    this.fireflies = keep ? this.fireflies.filter(function (f) { return f.state === 'zip'; }) : [];
    this.hintHand = null; this.assistId = null; this.card = null; this._beat = null;
    this._stepDone = false; this._waitAsk = -1; this._song = null; this._lit = 0;
    this._lambNext = -1; this._birdNext = -1; this._firefliesNext = -1;
    this.layout.lanterns = [];
  };
  P.startLevel = function (i) {
    if (!this.levels.length) this.levels = CD.Content.topicsFor(this.age);
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
  /** The surprise type of this chapter: the night chapter has fireflies, the others rotate lamb / bird. */
  P._surpriseType = function () {
    var ST = this.cfg.surpriseTypes;
    if (!ST || !ST.length) return null;
    if (this.level === this.cfg.nightLevel && this.cfg.nightSurprise) return this.cfg.nightSurprise;
    return ST[(this.level + this._surpriseOff) % ST.length];
  };
  /** Lanterns of a round: one per note (a find / findAll target, one per beat step). */
  function notesOf(cur) { return cur.steps.reduce(function (s, st) { return s + (st.mode === 'beat' ? 1 : st.need); }, 0); }

  P._beginRound = function () {
    var cfg = this.cfg, self = this, L;
    var rr = new CD.RNG((this.rng.next() * 4294967296) >>> 0);
    var sp = this.round === this._surpriseRound && this.round > 0 ? this._surpriseType() : null;
    var el = this.time - this.levelStartTime, sb = cfg.shortBudget, short = !!(sb && this.round > 0 && el > sb[Math.min(this.round, sb.length - 1)]);
    var cur = CD.Content.makeRound(this.topic, { age: this.age, lang: this.lang, rng: rr, roundIndex: this.round, surprise: sp, short: short, level: this.level, maxDrums: this._drumCap(),
      usedKeys: this._usedKeys, prevAns: this._prevAns, prevAnsRun: this._prevAnsRun });
    this._usedKeys.push(cur.key);
    this._clearRound(true);
    this.cur = cur; this.surprise = cur.surprise;
    this.misses = 0; this.stepMisses = 0; this.streak = 0; this._noProg = 0;
    var br = new CD.RNG(((cur.seed || 1) ^ 0x7f4a7c15) >>> 0);   // per-round cosmetic: cushion bob phases / periods
    this.drums = cur.drums.map(function (q, i) {
      return { id: q.id, i: i, thing: q.thing, note: q.note, target: q.target, size: 0, bw: 0, bh: 0, bcy: 0, cushionW: 0, cushionH: 0,
        padX: 0, padBase: 0, padY: 0, hop: 0, vy: 0, air: false, x: 0, y: 0, cx: 0, cy: 0, swayX: 0,
        state: 'enter', done: false, ring: 0, dull: 0, glow: 0, sq: 1, vsq: 0, skin: 0, skinPh: 0, tilt: 0, vtilt: 0, dent: 0, vdent: 0,
        cushionPop: 0, count: -1, dim: 0, pop: 0, alpha: 1, bob: 0,
        _bobPh: br.float(0, TAU), _bobT: br.float(cfg.bobPeriod[0], cfg.bobPeriod[1]),
        _hitT: -1e9, _glowT: 0, _flashT: 0, _countT: 0, _windT: 0, _launch: 0, _dropAt: 0, _cushAt: cfg.cushionDelay + i * cfg.cushionStagger,
        _outAt: 0, _outT: -1, _released: false,
        _px: 0, _py: 0, _pcx: 0, _pcy: 0, _psq: 1, _ptilt: 0, _pdent: 0, _pskin: 0, _ppop: 0, _pcushionPop: 0, _palpha: 1, _ppadY: 0 };
    });
    var n = this.drums.length, rel = cfg.cushionDelay + (n - 1) * cfg.cushionStagger + cfg.dropGap;
    this.drums.forEach(function (c, i) { c._dropAt = rel + i * cfg.dropStagger; });
    this._roundAssisted = false;
    this._relayout(false); L = this.layout;   // item / pads sized for this round's drums
    this._placeDrums();
    this.drums.forEach(function (c) { c.padY = c.padBase; c.hop = c.padBase + cfg.dropAbove; self._pose(c); self._twinDrum(c); });
    var nL = notesOf(cur);
    L.lanterns = lanternsFor(L, nL);
    this.lanterns = L.lanterns.map(function (p) { return { x: p.x, y: p.y, lit: 0, color: null, swing: 0, vswing: 0, flash: 0, _plit: 0, _pswing: 0, _litT: 0 }; });
    // the ask comes once every drum stood up: last release + its fall (from above the top edge, initial speed dropV0)
    var lastLand = 0;
    this.drums.forEach(function (c) { var d = c.hop, g = cfg.gravity, v = cfg.dropV0; lastLand = Math.max(lastLand, c._dropAt + (-v + Math.sqrt(v * v + 2 * g * d)) / g); });
    this._enterTime = Math.max(cfg.enterMin, lastLand + cfg.enterTail);
    this._idleT = 0; this._idleGap = cfg.idleTime; this._idleN = 0;
    this._setState('round'); this._setPhase('enter');
    this._mood('happy', 1.2);
    var bc = this._bandCentre();
    this._emit({ type: 'round', round: this.round, topic: this.topic, surprise: cur.surprise, drums: this.drums.length, lanterns: nL,
      steps: cur.steps.length, mode: cur.steps[0].mode, short: cur.short, key: cur.key, x: bc.x, y: bc.y });
  };

  /** Ask the current step. */
  P._ask = function (first) {
    var cfg = this.cfg, cur = this.cur, s = this.stepInfo;
    if (!s) { this._startSong(); return; }
    this._stepDone = false; this._waitAsk = -1; this.stepMisses = 0; this._noProg = 0; this._disarm();
    this._idleT = 0; this._idleGap = cfg.idleTime; this._idleN = 0;
    if (this.hintHand) this.hintHand = null;
    if (s.mode === 'beat') {   // the big drum is struck again for every beat step; a fresh number card pops up above it
      var big = this.drumById(s.targets[0]);
      if (big) big.done = false;
      this._beat = { i: 0, lastT: -1e9, askT: this.time };
      this.card = { id: s.targets[0], x: 0, y: 0, w: 0, h: 0, n: s.need, lit: 0, pop: 0, flash: 0, _ppop: 0, _inT: 0, _outT: -1 };
      this._placeCard();
    } else this._beat = null;
    this._mood('talk', 1.0);
    var M = this._bibiMouth();
    this._emit({ type: 'ask', promptKey: s.promptKey, params: s.params, mode: s.mode, step: this.step, steps: cur.steps.length, first: !!first, round: this.round,
      nameKind: s.nameKind, nameValue: s.nameValue, need: s.need, x: M.x, y: M.y });
    // a surprise comes 3–5 s after the first ask, but never later than the round is expected to last (notes × 1.8 − 1 s)
    var notes = notesOf(cur), late = Math.max(2, notes * cfg.surpriseStepS - 1), self = this;
    var young = this.age <= cfg.surpriseYoungAge;
    var at = function (r) { var v = self._crng.float(r[0], r[1]); return young ? cfg.surpriseYoungAt : Math.min(v, late); };
    if (first && this.surprise === 'lamb') this._lambNext = at(cfg.lambAt);
    if (first && this.surprise === 'bird') this._birdNext = at(cfg.birdAt);
    if (first && this.surprise === 'fireflies') this._firefliesNext = at(cfg.firefliesAt);
  };

  P._startTalk = function () {
    var rr = new CD.RNG((this.rng.next() * 4294967296) >>> 0);
    this.talk = CD.Content.makeTalk(this.topic, { age: this.age, lang: this.lang, rng: rr, level: this.level });
    this.talk.glowAnswer = false;
    this.talkAnswered = null; this._talkAskT = 0; this._talkAsks = 0;
    this.cur = null; this.phase = null;
    this._clearRound();
    this._relayout(false);
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
  /**
   * pointerDown(x, y) → 'drum' (the first contact of the gesture: struck + judged in play; beat mode: a beat) | 'song' (starts
   * the wave) | 'brush' (a drum struck outside the judged moment) | 'lamb' | 'bird' | 'firefly' | 'bibi' (poke fires on
   * release) | 'cymbal' (a soft crash: never progress, never a mistake) | 'soft' (nothing / the stage / the sky) | 'early'
   * (during enter, nothing under the finger) | null. A drum under the finger always wins over a surprise.
   */
  P.pointerDown = function (x, y) {
    if (this._g || (this.state !== 'round' && this.state !== 'roundDone')) return null;
    this.finger.x = x; this.finger.y = y; this.finger.down = true;
    var cfg = this.cfg, L = this.layout, ph = this.phase, c = this._drumAt(x, y);
    var g = this._g = { x0: x, y0: y, x: x, y: y, t: this.time, judged: false, kind: 'gesture', maxD: 0, inside: {}, vx: 0, result: null,
      core: this._coreSet(x, y), deferred: null };
    for (var i = 0; i < this.drums.length; i++) { var q = this.drums[i]; if (this._touchable(q) && hyp(x - q.cx, y - q.cy) <= this._hitR(q)) g.inside[q.id] = true; }
    this._touch();
    if (c) g.inside[c.id] = true;
    var play = this.state === 'round' && ph === 'play';
    if (play && this.assistId && inBox(L.band, x, y)) {   // assist: the next press anywhere in the drum band strikes the asked drum
      var a = this.drumById(this.assistId);
      if (a && !a.done) { this._contact(a, x, y, x < a.cx ? 1 : -1, 1, g, c ? c.id : null); return (g.result = 'drum'); }
    }
    if (c) {
      var dir = x < c.cx ? 1 : -1;   // the finger left of the body centre → the drum leans right (away from the finger)
      if (this._fair() && !c.done && hyp(x - c.cx, y - c.cy) > this._coreR(c)) {
        // a press on the RIM (the gap between bodies, the cushion): it booms softly now; a tap (release before moving 24 px)
        // judges this drum, a slide judges the first body core it enters (playtest P1-1)
        this._brush(c, dir, false);
        g.contacted = true; g.deferred = c.id;
        return (g.result = 'drum');
      }
      return (g.result = this._contact(c, x, y, dir, 1, g, undefined));
    }
    var hh = this.lambHit();
    if (hh && hyp(x - hh.x, y - hh.y) <= hh.r) { this._tapLamb(); g.kind = 'surprise'; return (g.result = 'lamb'); }
    var bh = this.birdHit();
    if (bh && hyp(x - bh.x, y - bh.y) <= bh.r) { this._tapBird(); g.kind = 'surprise'; return (g.result = 'bird'); }
    var ff = this._fireflyAt(x, y);
    if (ff && this._clearOfKeep(ff.x, ff.y, 0)) { this._tapFirefly(ff); g.kind = 'surprise'; return (g.result = 'firefly'); }
    if (inBox(L.bibiBox, x, y)) { g.kind = 'bibi'; return (g.result = 'bibi'); }
    if (inBox(L.cymbalBox, x, y)) { this._tapCymbal(); g.kind = 'cymbal'; return (g.result = 'cymbal'); }
    if (ph === 'enter') { this._emit({ type: 'soft', kind: 'early', x: x, y: y }); return (g.result = 'early'); }
    if (this.state === 'roundDone' && ph === 'song' && this._song && !this._song.started && inBox(L.band, x, y) && this.drums.length) {
      this._beginWave(false); g.contacted = true;   // a press on the drum band plays the song too (playtest P2-5)
      return (g.result = 'song');
    }
    if (ph !== 'play' && ph !== 'song') return (g.result = null);
    var onStage = inBox(L.band, x, y);
    this._softNudge();
    this._emit({ type: 'soft', kind: onStage ? 'stage' : 'sky', x: x, y: y });
    g.soft = play;   // counts as a press without progress on release, unless the slide goes on to touch a drum
    return (g.result = 'soft');
  };
  /** A finger slide: the path segment crossing a drum's hit circle strikes it (strength from the finger's speed); the gesture's
   *  first contact is judged, every later one is a brush. Rate-limited per drum (0.18 s). */
  P.pointerMove = function (x, y) {
    var g = this._g;
    if (!g) return;
    var cfg = this.cfg, dtm = Math.max(this.time - g.t, 1 / 120), vx = clamp((x - g.x) / dtm, -4000, 4000), vy = clamp((y - g.y) / dtm, -4000, 4000), hits = [], i;
    g.vx = vx;
    g.maxD = Math.max(g.maxD, hyp(x - g.x0, y - g.y0));
    this.finger.x = x; this.finger.y = y;
    if (g.deferred && g.maxD >= cfg.tapMovePx) g.deferred = null;   // the rim press became a slide
    if ((this.state === 'round' || this.state === 'roundDone') && this.phase !== null) {
      var fair = this._fair();
      for (i = 0; i < this.drums.length; i++) {
        var c = this.drums[i];
        if (!this._touchable(c)) continue;
        var r = this._hitR(c), s = segHit(g.x, g.y, x, y, c.cx, c.cy, r), was = !!g.inside[c.id];
        g.inside[c.id] = hyp(x - c.cx, y - c.cy) <= r;
        if (fair && !g.judged && !c.done && !g.core[c.id]) {   // entering a body core: the judged contact
          var sc = segHit(g.x, g.y, x, y, c.cx, c.cy, this._coreR(c));
          if (sc >= 0) { hits.push({ c: c, s: sc, core: true }); continue; }
        }
        if (s >= 0 && !was && this.time - c._hitT >= cfg.rateLimit - 1e-9) hits.push({ c: c, s: s, core: false });
      }
      hits.sort(function (a, b) { return a.s - b.s; });
      var spd = hyp(vx, vy), str = clamp(spd / cfg.swipeRef, cfg.swipeMin, cfg.swipeMax);
      for (i = 0; i < hits.length; i++) {
        var q = hits[i].c, dir = Math.abs(vx) > 20 ? (vx > 0 ? 1 : -1) : (g.x < q.cx ? 1 : -1);
        if (this.state === 'round' && this.phase === 'play' && this.assistId && !g.judged) {
          var a = this.drumById(this.assistId);
          if (a && !a.done) { this._contact(a, x, y, dir, str, g, q.id, true); continue; }
        }
        // fair judging: entering only the rim of a drum not rung yet is a brush while the gesture is still unjudged
        if (fair && !hits[i].core && !g.judged && !q.done && this._fair()) { this._brush(q, dir, true, str); g.contacted = true; continue; }
        this._contact(q, x, y, dir, str, g, undefined, true);
      }
      g.core = this._coreSet(x, y);
    }
    g.x = x; g.y = y; g.t = this.time;
  };
  /** → 'pokeBibi' | 'up' | null */
  P.pointerUp = function (x, y) {
    var g = this._g;
    this._g = null; this.finger.down = false;
    if (!g) return null;
    if (x === undefined) { x = g.x; y = g.y; }
    var mv = Math.max(g.maxD, hyp(x - g.x0, y - g.y0));
    this._resolveDeferred(g);
    // no progress: a soft press that never touched a drum, or a slide that only brushed rims / drums already rung (never a miss)
    if (((g.soft && !g.contacted) || (g.contacted && !g.judged && g.kind === 'gesture')) && this.state === 'round' && this.phase === 'play' && !this._stepDone) this._noProgress();
    if (g.kind === 'bibi' && mv < this.cfg.tapMovePx && this.state === 'round') return this._pokeBibi() || 'up';
    return 'up';
  };
  /** The finger left (touchcancel / pause / rotation): the gesture ends; a rim tap still waiting is judged (a slipped tap counts). */
  P.cancelDrag = function () { var g = this._g; this._g = null; this.finger.down = false; if (g) this._resolveDeferred(g); };
  /** Fair judging is on in play while no assist is armed and it is not a beat step (one drum: every touch on it is a beat). */
  P._fair = function () { return !!this.cfg.fairSwipe && this.state === 'round' && this.phase === 'play' && !this.assistId && !this._isBeat(); };
  /** A rim tap is judged on release: the pressed drum, if the finger did not slide and nothing was judged yet. */
  P._resolveDeferred = function (g) {
    if (!g.deferred || g.judged || !this._fair()) return;
    var c = this.drumById(g.deferred);
    g.deferred = null;
    if (c && !c.done && this._touchable(c)) this._contact(c, g.x, g.y, g.x < c.cx ? 1 : -1, 1, g);
  };
  /** A soft boom (sound only): never a mistake, never progress. */
  P._brush = function (c, dir, swipe, str) {
    this._strike(c, dir, Math.min(1, str || 1), 'brush');
    this._emit({ type: 'ring', id: c.id, thing: c.thing, note: this._noteOf(c), x: c.cx, y: c.cy, strength: 0.6, judged: false, brush: true, swipe: !!swipe });
  };
  /** The note a drum plays now: a beat step's own note (the song climbs per step), else the drum's note. */
  P._noteOf = function (c) { var s = this.stepInfo; return s && s.mode === 'beat' && s.note !== undefined && c.thing.kind === 'big' ? s.note : c.note; };
  P._counting = function () { for (var i = 0; i < this.drums.length; i++) { var c = this.drums[i]; if (c.count >= 0 && c.count < c.thing.n) return true; } return false; };

  /**
   * A contact of the gesture with drum c (dir = +1 leans right / −1 left, str = strength ≈ 1 for a tap, 0.6–1.6 a swipe). In
   * play the gesture's FIRST contact on a drum not rung right yet is judged (right / wrong; beat mode: a beat); a drum already
   * rung right just booms. `from` = the drum under the finger when the assist redirects the strike to the asked drum.
   */
  P._contact = function (c, x, y, dir, str, g, from, swipe) {
    var cfg = this.cfg;
    g.contacted = true;
    var play = this.state === 'round' && this.phase === 'play';
    if (play && !g.judged && !c.done && this._stepDone && this.step < this.cur.steps.length - 1 && !this._counting() && this._waitAsk >= 0) {
      this.step++; this._ask(false);   // a contact during the gap after a right note: the next step starts now and judges it
    }
    if (play && !g.judged && !c.done && !this._stepDone) {
      g.judged = true;
      var s = this.stepInfo;
      if (s.mode === 'beat') return this._beatHit(c, dir, str, swipe, from, x, y);
      var right = s.targets.indexOf(c.id) >= 0;
      var st = this._strike(c, dir, str, right ? 'tap' : 'wrong');
      this._emit({ type: 'ring', id: c.id, thing: c.thing, note: c.note, x: c.cx, y: c.cy, strength: st, judged: true, swipe: !!swipe, dull: !right });
      if (from !== undefined) { this._roundAssisted = true; this._emit({ type: 'assist', id: c.id, from: from, x: x, y: y }); }
      if (right) this._right(c); else this._wrong(c, s);
      return 'drum';
    }
    if (this.state === 'roundDone' && this.phase === 'song' && this._song && !this._song.started) {
      this._strike(c, dir, str, 'brush');
      this._beginWave(false);
      return 'song';
    }
    var st2 = this._strike(c, dir, str * (this.phase === 'song' ? 0.8 : 1), 'brush');
    this._emit({ type: 'ring', id: c.id, thing: c.thing, note: this._noteOf(c), x: c.cx, y: c.cy, strength: st2, judged: false, brush: true, swipe: !!swipe });
    return 'brush';
  };
  /** A beat on the big drum: counted when ≥ beatGap after the last counted beat (else a brush: it booms, does not count). */
  P._beatHit = function (c, dir, str, swipe, from, x, y) {
    // counted when ≥ beatGap after the last counted beat and ≥ beatListen after the ask (the child hears the number first: QA playtest P1-1)
    var cfg = this.cfg, B = this._beat, s = this.stepInfo, ok = this.time - B.lastT >= cfg.beatGap - 1e-9 && this.time - B.askT >= cfg.beatListen - 1e-9;
    var st = this._strike(c, dir, ok ? str : 0.6, ok ? 'tap' : 'brush');
    var note = this._noteOf(c);
    this._emit({ type: 'ring', id: c.id, thing: c.thing, note: note, x: c.cx, y: c.cy, strength: st, judged: ok, brush: !ok, swipe: !!swipe, beat: true });
    if (from !== undefined) { this._roundAssisted = true; this._emit({ type: 'assist', id: c.id, from: from, x: x, y: y }); }
    if (!ok) return 'drum';
    B.lastT = this.time; B.i++;
    if (this.card) { this.card.lit = B.i; this.card.flash = 1; }
    this._noProg = 0; this._disarm(); this.hintHand = null;
    this._mood('beat', cfg.moodTime.beat);
    this._emit({ type: 'count', id: c.id, i: B.i, n: s.need, x: c.cx, y: c.cy, beat: true });
    if (B.i >= s.need) this._right(c);
    else { this._idleT = 0; this._idleGap = cfg.beatNudge; }   // a partial count: Bibi nudges ("Two! One more!") after 4 s
    return 'drum';
  };
  /**
   * Physics of a strike: anticipation squash (windup) → hop (peak 22 px × strength for a tap, ≤ 30; brush 14; wrong 10;
   * song 26), tilt kick away from the finger, skin ripple, ring flash. kind 'tap' | 'wrong' | 'brush' | 'song'. → strength.
   */
  P._strike = function (c, dir, str, kind) {
    var cfg = this.cfg, peak;
    str = str || 1;
    if (kind === 'brush') peak = cfg.hopBrush;
    else if (kind === 'wrong') peak = cfg.hopWrong;
    else if (kind === 'song') peak = cfg.hopSong;
    else peak = clamp(cfg.hopTap * str, cfg.hopMin, cfg.hopMax);
    var v0 = Math.sqrt(2 * cfg.gravity * peak);
    if (c.air) {   // struck in the air: a boost (no windup) up to the same apex — repeated strikes never stack higher than `peak`
      if (c.state !== 'out') c.vy = Math.max(c.vy, Math.sqrt(2 * cfg.gravity * Math.max(0, peak - c.hop)));
      c.vsq += kickFor(0.05, cfg.sqOmega, cfg.sqZeta);
    }
    else if (c._windT > 0) c._launch = Math.max(c._launch, v0);
    else { c._windT = cfg.windup; c._launch = v0; c.vsq -= kickFor(1 - cfg.windSq, cfg.sqOmega, cfg.sqZeta); c.vdent += kickFor(0.25, cfg.dentOmega, cfg.dentZeta); }
    var tk = cfg.tiltKick * Math.min(1.3, kind === 'brush' ? 0.6 : str) * (kind === 'wrong' ? cfg.wrongTiltK : 1);
    c.vtilt += (dir >= 0 ? 1 : -1) * kickFor(tk, cfg.tiltOmega, cfg.tiltZeta);
    c.skin = Math.max(c.skin, kind === 'brush' ? cfg.skinBrush : 1); c.skinPh = 0;
    if (kind === 'wrong') { c.ring = Math.max(c.ring, cfg.wrongRing); c.dull = 1; }
    else if (kind !== 'brush') { c.ring = 1; c.dull = 0; }
    else c.ring = Math.max(c.ring, 0.6);
    c._hitT = this.time;
    this._lastNote = this._noteOf(c); this._lookX = c.cx; this._lookT = 1.2;
    return kind === 'brush' ? 0.6 : str;
  };
  P._right = function (c) {
    var cfg = this.cfg, s = this.stepInfo, beat = s.mode === 'beat';
    c.done = true; c._flashT = cfg.glowFlash; c._glowT = 0;
    this.streak = 0; this._noProg = 0; this._touch(); this._disarm(); this.hintHand = null;
    var li = Math.min(this._lit, this.lanterns.length - 1), ln = this.lanterns[li];
    this._lit++;
    var color = c.thing.color || null, note = this._noteOf(c);
    if (ln) {
      var f = arc(c.cx, c.cy, ln.x, ln.y, cfg.noteTime, cfg.noteApex, 0, this.layout.ins.top + 8);
      this.notes.push({ x: c.cx, y: c.cy, _px: c.cx, _py: c.cy, x0: c.cx, y0: c.cy, x1: ln.x, y1: ln.y, t: 0, t0: 0, T: cfg.noteTime, f: f, color: color,
        lantern: li, note: note, alpha: 0, rot: 0, id: c.id });
    }
    var cnt = c.thing.kind === 'dots' ? c.thing.n : 0;   // a dots drum lights its dots 1..n (the count run)
    if (cnt) { c.count = 0; c._countT = 0; }
    var claimed = s.targets.filter(function (id) { var q = this.drumById(id); return q && q.done; }, this).length;
    var last = beat || claimed >= s.need;
    var ev = { type: 'right', id: c.id, thing: c.thing, note: note, step: this.step, lantern: li, x: c.cx, y: c.cy };
    if (cnt) ev.count = { n: cnt };
    if (beat) { ev.count = { n: s.need }; ev.beat = true; if (this.card) this.card._outT = cfg.cardOut; }
    if (s.mode === 'findAll') ev.all = { i: claimed, n: s.need };
    this._mood('happy'); this._hop();
    this._emit(ev);
    if (last) {
      var lastStep = this.step >= this.cur.steps.length - 1;
      this._stepDone = true;
      this._waitAsk = cfg.askGap + (cnt ? cnt * cfg.countStep + 0.3 : 0) + (beat ? cfg.cardOut + cfg.cardOutTime : 0);
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
  /** A press on nothing: every cushion jiggles a little, the drums wobble, the lanterns sway. */
  P._softNudge = function () {
    var cfg = this.cfg, self = this;
    this.drums.forEach(function (c) {
      if (!self._touchable(c)) return;
      c.vdent += kickFor(cfg.softDent, cfg.dentOmega, cfg.dentZeta);
      c.vtilt += (self._crng.chance(0.5) ? 1 : -1) * kickFor(cfg.softTilt, cfg.tiltOmega, cfg.tiltZeta);
    });
    this.lanterns.forEach(function (l) { l.vswing += (self._crng.chance(0.5) ? 1 : -1) * 0.3; });
  };
  P._tapCymbal = function () {
    var cfg = this.cfg, Y = this.layout.cymbal;
    this.cymbal.vtilt += kickFor(cfg.cymTapKick, cfg.cymOmega, cfg.cymZeta); this.cymbal.ring = Math.max(this.cymbal.ring, 0.5);
    this._touch();
    this._emit({ type: 'cymbalTap', x: Y.x, y: Y.y - 0.85 * Y.h });
  };
  P._noProgress = function () {
    this._noProg++;
    if (this._noProg >= this.cfg.hintAfterMisses) this._autoHint(false);
    if (this._noProg >= this._assistAfter() && !this.assistId) {
      var a = this._askedDrum();
      if (a) { this.assistId = a.id; this._emit({ type: 'assistArmed', id: a.id, x: a.cx, y: a.cy }); }
    }
  };
  P._disarm = function () { this.assistId = null; };
  P._pokeBibi = function () {
    var a = this.prompt(), B = this.layout.bibi;
    if (!a) return null;
    this._touch();
    this._mood('talk', 1.0);
    this._emit({ type: 'pokeBibi', promptKey: a.promptKey, params: a.params, mode: a.mode, step: a.step, x: B.x, y: B.y - 0.7 * B.h });
    return 'pokeBibi';
  };

  // ---------------------------------------------------------------- help
  P.resetNudges = function () {
    this._idleT = 0; this._idleGap = this.cfg.idleTime; this._idleN = 0;
    this._talkAskT = 0; this._talkAsks = 0;
    if (this.talk) this.talk.glowAnswer = false;
  };
  P._glowing = function () { for (var i = 0; i < this.drums.length; i++) if (this.drums[i]._glowT > 0) return true; return false; };
  P._autoHint = function (fromIdle) {
    if (this._glowing() || this.hintHand || this.time - this._lastHintT < this.cfg.hintCooldown) return null;
    return this._doHint(fromIdle);
  };
  P._doHint = function (fromIdle) {
    var c = this._askedDrum(), cfg = this.cfg, s = this.stepInfo;
    if (!c || !this.interactive) return null;
    c._glowT = cfg.hintTime;
    this.hintHand = { id: c.id, mode: 'tap', x: c.cx, y: c.cy, _px: c.cx, _py: c.cy, t: 0, press: 0, alpha: 0, time: 0, T: cfg.hintTime };
    this._stepHint(0);
    this._lastHintT = this.time;
    this._mood('point', cfg.hintTime);
    var ev = { type: 'hint', id: c.id, mode: 'tap', x: c.cx, y: c.cy, want: { nameKind: s.nameKind, nameValue: s.nameValue, promptKey: s.promptKey, params: s.params } };
    if (fromIdle) ev.idle = true;
    this._emit(ev);
    return { drum: c.id };
  };
  /** Manual hint (e.g. a tap on the bubble): the asked drum glows + the ghost hand taps it; in the song: the swipe hand. */
  P.hint = function () {
    if (this.state === 'roundDone' && this.phase === 'song' && this._song && !this._song.started) { this._swipeHand(); return { song: true }; }
    if (!this.interactive) return null;
    if (this.hintHand) return { drum: this.hintHand.id };
    return this._doHint(false);
  };
  P._swipeHand = function () {
    if (this.hintHand && this.hintHand.mode === 'swipe') return;
    var b = this._bandCentre();
    this.hintHand = { id: null, mode: 'swipe', x: b.x, y: b.y, _px: b.x, _py: b.y, t: 0, press: 0, alpha: 0, time: 0, T: 1e9 };
    this._stepHint(0);
  };
  /** Ghost hand. tap (1.6 s cycle): glides in from below-right, taps the drum twice, drifts back fading. swipe (2.0 s): presses
   *  at the left end of the drum band, slides right across the drums, lifts. Fingertip = (x, y). */
  P._stepHint = function (h) {
    var H = this.hintHand, cfg = this.cfg;
    if (!H) return;
    H.time += h;
    var x, y, press, fade = 1, u;
    if (H.mode === 'tap') {
      var c = this.drumById(H.id);
      if (!c || c.done || H.time >= H.T || !this.interactive) { this.hintHand = null; return; }
      u = (H.time % cfg.hintCycle) / cfg.hintCycle;
      var ox = c.cx + 70, oy = c.cy + 110, tx = c.cx + 6, ty = c.cy + 10;
      if (u < 0.25) { var v = smooth(u / 0.25); x = lerp(ox, tx, v); y = lerp(oy, ty, v); press = 0; }
      else if (u < 0.65) { var k = (u - 0.25) / 0.2, tap = Math.sin(Math.PI * (k % 1)); press = tap; x = tx; y = ty + 8 * (1 - tap); }
      else { var w2 = smooth((u - 0.65) / 0.35); x = lerp(tx, ox, w2); y = lerp(ty, oy, w2); press = 0; fade = 1 - 0.9 * w2; }
      H.alpha = clamp(H.time / 0.25, 0, 1) * clamp((H.T - H.time) / 0.35, 0, 1) * fade;
    } else {
      if (!(this.state === 'roundDone' && this.phase === 'song' && this._song && !this._song.started)) { this.hintHand = null; return; }
      var B = this.layout.band, yS = this._drumMidY(), x0 = B.x + 40, x1 = B.x + B.w - 40;
      u = (H.time % cfg.swipeCycle) / cfg.swipeCycle;
      if (u < 0.15) { press = smooth(u / 0.15); x = x0; y = yS + 12 * (1 - press); }
      else if (u < 0.75) { var m = smooth((u - 0.15) / 0.6); press = 1; x = lerp(x0, x1, m); y = yS - 10 * Math.sin(Math.PI * m); }
      else { var e = smooth((u - 0.75) / 0.25); press = 1 - e; x = x1; y = yS + 12 * e; fade = 1 - e; }
      H.alpha = clamp(H.time / 0.3, 0, 1) * fade;
    }
    H.x = x; H.y = y; H.t = u; H.press = press;
  };
  /** Mean body-centre y of the drums (where to swipe). */
  P._drumMidY = function () {
    var s = 0, n = 0;
    for (var i = 0; i < this.drums.length; i++) { var c = this.drums[i]; if (c.state !== 'gone') { s += c.cy; n++; } }
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
  P._twinDrum = function (c) {
    c._px = c.x; c._py = c.y; c._pcx = c.cx; c._pcy = c.cy; c._psq = c.sq; c._ptilt = c.tilt; c._pdent = c.dent; c._pskin = c.skin;
    c._ppop = c.pop; c._pcushionPop = c.cushionPop; c._palpha = c.alpha; c._ppadY = c.padY;
  };
  P._twins = function () {
    var i, o;
    for (i = 0; i < this.drums.length; i++) this._twinDrum(this.drums[i]);
    for (i = 0; i < this.lanterns.length; i++) { o = this.lanterns[i]; o._pswing = o.swing; o._plit = o.lit; }
    for (i = 0; i < this.notes.length; i++) { o = this.notes[i]; o._px = o.x; o._py = o.y; }
    for (i = 0; i < this.fireflies.length; i++) { o = this.fireflies[i]; o._px = o.x; o._py = o.y; }
    if (this.lamb) { o = this.lamb; o._px = o.x; o._py = o.y; o._proll = o.roll; o._pball = o.ball; }
    if (this.bird) { o = this.bird; o._px = o.x; o._py = o.y; }
    if (this.hintHand) { this.hintHand._px = this.hintHand.x; this.hintHand._py = this.hintHand.y; }
    if (this.card) this.card._ppop = this.card.pop;
    this.cymbal._ptilt = this.cymbal.tilt;
    this.bibi._phop = this.bibi.hop;
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
        } else if (this._talkAsks >= cfg.talkMaxAsks && this._talkAskT >= cfg.talkGiveUp - 1e-9) this.talkAnswer(this.talk.answer, true);   // Bibi answers
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
      this._stepDrums(h); this._stepCard(h); this._stepLanterns(h); this._stepNotes(h); this._stepSurprises(h); this._stepHint(h);
    }
    spring(this.cymbal, 'tilt', 'vtilt', 0, cfg.cymOmega, cfg.cymZeta, h);
    this.cymbal.ring = Math.max(0, this.cymbal.ring - h / cfg.cymRingTime);
    this._stepBibi(h);
  };

  P._stepRound = function (h) {
    var cfg = this.cfg;
    switch (this.phase) {
      case 'enter':
        if (this.phaseTime >= this._enterTime && this.drums.every(function (c) { return c.state === 'stand'; })) { this._setPhase('play'); this.step = 0; this._ask(true); }
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
            var a = this.prompt(), B = this._beat, c = this._askedDrum();
            if (B && B.i > 0 && B.i < a.need) this._emit({ type: 'beatNudge', i: B.i, n: a.need, id: c ? c.id : null, idleN: this._idleN, promptKey: a.promptKey, params: a.params, mode: a.mode, step: a.step, x: c ? c.cx : 0, y: c ? c.cy : 0 });
            else this._emit({ type: 'idle', n: this._idleN, promptKey: a.promptKey, params: a.params, mode: a.mode, step: a.step });
            if (this._idleN >= cfg.idleHintFrom) this._autoHint(true);
          }
        }
        break;
      }
    }
  };
  P._starsFor = function (m) { return m <= 0 ? 3 : m === 1 ? 2 : 1; };
  /** Every note is in: stars, then song time — the ghost hand shows a swipe; a touch on any drum (or songWait) starts the wave. */
  P._startSong = function () {
    var st = this._starsFor(this.misses), ls = this.cur && this.cur.steps[this.cur.steps.length - 1];
    if (ls) { this._prevAnsRun = String(ls.nameValue) === String(this._prevAns) ? (this._prevAnsRun || 1) + 1 : 1; this._prevAns = ls.nameValue; }
    if (this._roundAssisted) st = Math.min(st, 2);   // an assisted note caps the round at 2★ (playtest P2-1)
    this.roundStars = st; this.stars += st; this.levelStars += st;
    this.cancelDrag(); this.hintHand = null; this._disarm();
    this._setState('roundDone'); this._setPhase('song');
    this._song = { asked: false, started: false, auto: false, t: 0, order: [], notes: [], gap: this.cfg.waveGap, i: 0, done: false, crashed: false };
    this._mood('cheer', 1.2); this._hop();   // surprises stay through song + out (they leave at the next round: QA functional P2-1)
    var bc = this._bandCentre();
    this._emit({ type: 'roundDone', round: this.round, stars: st, misses: this.misses, x: bc.x, y: bc.y });
  };
  /** The song wave: every drum left → right, 0.18 s apart (beat mode: the big drum ×3, 0.3 s apart, the steps' notes). */
  P._beginWave = function (auto) {
    var S = this._song, cfg = this.cfg, self = this;
    if (!S || S.started) return;
    S.started = true; S.auto = !!auto; S.t = 0; S.i = 0;
    var live = this.drums.filter(function (c) { return c.state !== 'gone'; });
    if (live.length === 1 && live[0].thing.kind === 'big') {
      var ns = this.cur.steps.map(function (s) { return s.note !== undefined ? s.note : live[0].note; });
      S.order = []; S.notes = [];
      for (var k = 0; k < cfg.beatSongN; k++) { S.order.push(live[0]); S.notes.push(ns[Math.min(k, ns.length - 1)]); }
      S.gap = cfg.beatSongGap;
    } else { S.order = live; S.notes = live.map(function (c) { return c.note; }); S.gap = cfg.waveGap; }
    this.hintHand = null;
    void self;
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
    if (S.asked && !S.started && this.time - S.askT >= cfg.songWait - 1e-9) this._beginWave(true);
    if (!S.started) return;
    S.t += h;
    var nL = this.lanterns.length, N = S.order.length;
    while (S.i < N && S.t >= S.i * S.gap - 1e-9) {
      var c = S.order[S.i], dir = S.i % 2 ? -1 : 1;
      if (c.state !== 'gone') this._strike(c, dir, 1, 'song');
      this._lastNote = S.notes[S.i];
      if (nL) { var ln = this.lanterns[Math.min(nL - 1, Math.floor(S.i * nL / N))]; ln.flash = 1; ln.vswing += kickFor(cfg.lanternSongKick, cfg.lanternOmega, cfg.lanternZeta) * dir; }
      this._mood(S.i % 2 ? 'idle' : 'beat', S.gap);
      this._emit({ type: 'songNote', id: c.id, i: S.i, n: N, note: S.notes[S.i], x: c.cx, y: c.cy });
      S.i++;
    }
    var tCrash = (N - 1) * S.gap + cfg.cymbalDelay;
    if (!S.crashed && S.i >= N && S.t >= tCrash - 1e-9) {
      S.crashed = true;
      var Y = this.layout.cymbal;
      this.cymbal.vtilt += kickFor(cfg.cymKick, cfg.cymOmega, cfg.cymZeta); this.cymbal.ring = 1;
      this._mood('cheer', 1.2);
      this._emit({ type: 'cymbal', x: Y.x, y: Y.y - 0.85 * Y.h });
    }
    if (!S.done && S.crashed && S.t >= tCrash + cfg.songTail - 1e-9) {
      S.done = true;
      var bc2 = this._bandCentre();
      this._emit({ type: 'songDone', auto: S.auto, x: bc2.x, y: bc2.y });
      this._startOut();
    }
  };
  /** out: the drums hop up and float away upward (distractors first), cushions puff away; the round's tune goes to w.songs. */
  P._startOut = function () {
    var cfg = this.cfg, self = this, cur = this.cur;
    this._setPhase('out');
    var order = this.drums.filter(function (c) { return !c.target; }).concat(this.drums.filter(function (c) { return c.target; }));
    order.forEach(function (c, k) { c._outAt = k * cfg.outStagger; });
    var up = cfg.outFade[0] + cfg.outFade[1];
    this._outEnd = Math.max(cfg.outTime, (order.length - 1) * cfg.outStagger + Math.max(up, cfg.cushionOutDelay + cfg.cushionOutTime) + 0.02);
    if (cur) {
      var notes = [], colors = [];
      cur.steps.forEach(function (s) {
        if (s.mode === 'beat') { notes.push(s.note); colors.push(null); }
        else s.targets.forEach(function (id) { var d = self.drumById(id); notes.push(d.note); colors.push(d.thing.color || null); });
      });
      this.songs.push({ level: this.level, round: this.round, topic: this.topic, notes: notes, colors: colors });
    }
    var bc = this._bandCentre();
    this._emit({ type: 'drumsOut', x: bc.x, y: bc.y });
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
    this._surprisesLeave(); this._clearRound(true); this.cur = null;   // a lamb / bird / fireflies still here leave now
    this.round++;
    var el = this.time - this.levelStartTime, long = this.round >= cfg.chapterMinRounds && el > cfg.chapterTimeLimit;
    if (this.round < this.roundsPerLevel && !long) this._beginRound();
    else { if (this.round < this.roundsPerLevel) this.roundsPerLevel = this.round; this._startTalk(); }
  };

  // ---------------------------------------------------------------- drums
  /** Positions: the cushion top rides the idle bob and sinks with the dent; the drum anchor stands hop px above it; the body
   *  centre follows the tilt about the anchor. */
  P._pose = function (c) {
    var cfg = this.cfg;
    c.padY = c.padBase + c.bob + Math.max(0, c.dent) * cfg.dentPx * c.cushionH;
    c.x = c.padX + c.swayX; c.y = c.padY - c.hop;
    c.cx = c.x - Math.sin(c.tilt) * c.bcy; c.cy = c.y + Math.cos(c.tilt) * c.bcy;
  };
  /** The drum lands on its cushion: squash + cushion dent kicks scaled by the impact speed, `land` (dust puff). */
  P._land = function (c) {
    var cfg = this.cfg, v = -c.vy, vRef = Math.sqrt(2 * cfg.gravity * cfg.hopTap), k = v / vRef;
    c.hop = 0; c.vy = 0; c.air = false;
    c.vsq -= kickFor(clamp(cfg.sqImpact * k, 0.04, cfg.sqImpactMax), cfg.sqOmega, cfg.sqZeta);
    c.vdent += kickFor(clamp(cfg.dentImpact * k, 0.15, cfg.dentMax), cfg.dentOmega, cfg.dentZeta);
    this._pose(c);
    if (c.state === 'enter') { c.state = 'stand'; this._emit({ type: 'drumIn', id: c.id, i: c.i, x: c.cx, y: c.cy }); }
    this._emit({ type: 'land', id: c.id, x: c.padX, y: c.padY, v: +k.toFixed(3) });
  };
  P._stepDrums = function (h) {
    var cfg = this.cfg, i, t = this.time;
    // idle: now and then a standing drum gets a tiny wobble (cosmetic, seeded)
    this._wiggleT -= h;
    if (this._wiggleT <= 0) {
      this._wiggleT = this._crng.float(cfg.wiggleEvery[0], cfg.wiggleEvery[1]);
      var st = this.drums.filter(function (c) { return c.state === 'stand' && !c.air; });
      if (st.length) { var b = this._crng.pick(st); b.vtilt += this._crng.float(-1, 1) * kickFor(cfg.wiggleAmp, cfg.tiltOmega, cfg.tiltZeta); }
    }
    for (i = 0; i < this.drums.length; i++) {
      var c = this.drums[i];
      if (c.state === 'gone') { c.pop = 0; c.alpha = 0; continue; }
      // --- cushion pop (enter: puff in with an overshoot; out: puff away)
      if (c.state === 'enter' || this.phase === 'enter') {
        var tc = (this.phase === 'enter' ? this.phaseTime : 9) - c._cushAt;
        c.cushionPop = tc <= 0 ? 0 : backOut(tc / cfg.cushionPopTime);
      }
      // --- enter: released from above the top edge, free fall onto the cushion
      if (c.state === 'enter') {
        var tr = (this.phase === 'enter' ? this.phaseTime : 9) - c._dropAt;
        if (tr < 0) { c.pop = 0; this._stepSprings(c, h); this._pose(c); continue; }
        if (!c._released) { c._released = true; c.air = true; c.vy = -cfg.dropV0; c.pop = 1; }
      } else if (c.state === 'stand' && this.phase === 'out' && this.phaseTime >= c._outAt) {
        c.state = 'out'; c._outT = 0; c._outRise = false;
        this._strike(c, this._crng.chance(0.5) ? 1 : -1, 1, 'song');
        c._launch = Math.sqrt(2 * cfg.gravity * cfg.outHop); c.ring = 0;
      }
      // --- vertical motion: windup → launch; airborne under gravity (out: after the apex it floats away upward)
      if (c._windT > 0) { c._windT -= h; if (c._windT <= 0) { c._windT = 0; c.vy = Math.max(c.vy, c._launch); c._launch = 0; c.air = true; } }
      if (c.air) {
        var acc = c.state === 'out' && (c._outRise || c.vy <= 0) ? cfg.outAcc : -cfg.gravity;   // exact ballistic step (the peak is exact)
        if (acc > 0) c._outRise = true;
        c.hop += c.vy * h + 0.5 * acc * h * h; c.vy += acc * h;
        if (c.hop <= 0 && c.vy < 0 && c.state !== 'out') this._land(c);
      }
      if (c.state === 'out') {
        c._outT += h;
        var to = c._outT;
        c.swayX = cfg.outSway * Math.sin(TAU * 1.3 * to) * Math.min(1, to / 0.3);
        c.alpha = 1 - smooth((to - cfg.outFade[0]) / cfg.outFade[1]);
        var tco = to - cfg.cushionOutDelay;
        c.cushionPop = tco <= 0 ? 1 : 1 - smooth(tco / cfg.cushionOutTime);
        if (c.alpha <= 0 && c.cushionPop <= 0) { c.state = 'gone'; c.pop = 0; c.alpha = 0; c.cushionPop = 0; continue; }
      }
      this._stepSprings(c, h);
      c.bob = cfg.bobAmp * Math.sin(TAU * t / c._bobT + c._bobPh) * clamp(c.cushionPop, 0, 1);
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
          c.vtilt += (k % 2 ? 1 : -1) * kickFor(0.03, cfg.tiltOmega, cfg.tiltZeta); c.skin = Math.max(c.skin, 0.4); c.skinPh = 0;
          this._pose(c);
          this._emit({ type: 'count', id: c.id, i: k, n: c.thing.n, x: c.cx, y: c.cy });
        }
      }
      this._pose(c);
    }
  };
  /** Squash (stretch while rising, windup dip), cushion dent, tilt springs; skin ripple decay + phase. */
  P._stepSprings = function (c, h) {
    var cfg = this.cfg, vRef = Math.sqrt(2 * cfg.gravity * cfg.hopTap);
    var sqT = c.air ? 1 + cfg.sqStretch * clamp(c.vy / vRef, -1, 1) : 1;
    spring(c, 'sq', 'vsq', sqT, cfg.sqOmega, cfg.sqZeta, h);
    if (c.sq < cfg.sqMin) { c.sq = cfg.sqMin; c.vsq = Math.max(0, c.vsq); } else if (c.sq > cfg.sqMax) { c.sq = cfg.sqMax; c.vsq = Math.min(0, c.vsq); }
    spring(c, 'dent', 'vdent', 0, cfg.dentOmega, cfg.dentZeta, h);
    if (c.dent > cfg.dentMax) { c.dent = cfg.dentMax; c.vdent = Math.min(0, c.vdent); } else if (c.dent < cfg.dentMin) { c.dent = cfg.dentMin; c.vdent = Math.max(0, c.vdent); }
    spring(c, 'tilt', 'vtilt', 0, cfg.tiltOmega, cfg.tiltZeta, h);
    if (Math.abs(c.tilt) > cfg.tiltMax) { c.tilt = clamp(c.tilt, -cfg.tiltMax, cfg.tiltMax); c.vtilt *= -0.3; }
    c.skin = Math.max(0, c.skin - h / cfg.skinTime);
    c.skinPh = (c.skinPh + cfg.skinRate * h) % 1e4;
  };
  P._stepCard = function (h) {
    var C = this.card, cfg = this.cfg;
    if (!C) return;
    C.flash = Math.max(0, C.flash - h / cfg.cardFlash);
    if (C._outT >= 0) {
      if (C._outT > 0) { C._outT = Math.max(0, C._outT - h); C._inT += h; C.pop = backOut(C._inT / cfg.cardPop); return; }
      C.pop -= h / cfg.cardOutTime;
      if (C.pop <= 0) this.card = null;
      return;
    }
    C._inT += h; C.pop = backOut(C._inT / cfg.cardPop);
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
    var hg = this.lamb, b = this.bird;
    this._lambNext = -1; this._birdNext = -1; this._firefliesNext = -1;
    if (hg && hg.state !== 'leave') { hg.state = 'leave'; hg.dir = 1; hg.ball = 0; }
    if (b && b.state !== 'leave') this._birdLeave();
    this.fireflies.forEach(function (f) { if (f.state !== 'zip') { f.state = 'zip'; f.zt = 0; } });
  };
  P._lambY = function () { return this.layout.groundY - 8; };
  /** Where the lamb stops to sniff: near the middle, clear of Bibi and the cymbal. */
  P._lambStop = function () {
    var L = this.layout, lo = L.bibiBox.x + L.bibiBox.w + 90, hi = L.W - L.ins.right - 90, F = L.cymbal, best = (lo + hi) / 2, bd = 1e9;
    for (var x = lo; x <= hi; x += 10) {
      if (Math.abs(x - F.x) < F.w / 2 + 80) continue;
      var d = Math.abs(x - L.W / 2);
      if (d < bd) { bd = d; best = x; }
    }
    return clamp(best, lo, Math.max(lo, hi));
  };
  P._tapLamb = function () {
    var g = this.lamb, c = this.lambHit() || { x: g.x, y: g.y };
    g._back = g.state; g.state = 'ball'; g.bt = 0; g.rollFrom = g.x; g.tapped = true;
    this._emit({ type: 'lambTap', x: c.x, y: c.y });
  };
  /** The bird's perch: the middle of the widest gap between lanterns on the garland string whose bird box is clear of the
   *  bubble / HUD (feet on the string). */
  P._birdPlan = function () {
    var b = this.bird, L = this.layout, G = L.garland, cfg = this.cfg, self = this;
    if (!b) return;
    var xs = [G.x0 + 30].concat(this.lanterns.map(function (l) { return l.x; })).concat([G.x1 - 30]), best = -1, bw = -1, any = 0, aw = -1;
    for (var i = 1; i < xs.length; i++) {
      var w = xs[i] - xs[i - 1], mx = (xs[i] + xs[i - 1]) / 2, my = stringY(G, mx);
      var box = { x: mx - cfg.birdW / 2, y: my - cfg.birdH, w: cfg.birdW, h: cfg.birdH };
      var clear = L.keep.every(function (k) { return !boxHit(box, k); });
      if (w > aw + 1e-6) { aw = w; any = i; }
      if (clear && w > bw + 1e-6) { bw = w; best = i; }
    }
    if (best < 0) { best = any; bw = aw; }
    b.perchX = (xs[best] + xs[best - 1]) / 2; b.perchY = stringY(G, b.perchX); b.gap = bw;
    b.hopMax = Math.max(0, bw / 2 - 34);
    void self;
  };
  P._birdLeave = function () {
    var b = this.bird;
    b.state = 'leave'; b.ft = 0; b.f = arc(b.x, b.y, b.x - 260, -80, 1.0, 20, 0); b.dir = -1;
  };
  P._tapBird = function () {
    var b = this.bird, c = this.birdHit() || { x: b.x, y: b.y };
    var note = this._lastNote >= 0 ? this._lastNote : this.cur && this.cur.song.length ? this.drumById(this.cur.song[0]).note : 0;
    b.sing = 1; b.singT = this.cfg.birdSingTime; b.hopT = 0; b.hopFrom = b.hopTo = b.hopX;   // a happy little hop on the spot
    this._emit({ type: 'birdTap', note: note, x: c.x, y: c.y });
  };
  /** Firefly anchors: in the gaps between the drums at body height when a gap is wide enough, else in the sky between the
   *  lanterns and the drum tops. */
  P._fireflyAnchors = function () {
    var L = this.layout, cfg = this.cfg, self = this, obs = [], spots = [], my = 0, i;
    // the free horizontal gaps across the stage between drums (hit circle / cushion) and the card, at body height
    this.drums.forEach(function (c) { var r = Math.max(self._hitR(c), c.cushionW / 2 + cfg.cushionHitPad) + 4; obs.push([c.padX - r, c.padX + r]); my += c.padBase + c.bcy; });
    my /= Math.max(1, this.drums.length);
    if (this.card) obs.push([this.card.x - this.card.w / 2 - 10, this.card.x + this.card.w / 2 + 10]);
    obs.sort(function (a, b) { return a[0] - b[0]; });
    var cur = L.stage.x0, need = 2 * (18 + 12) + 16;
    for (i = 0; i <= obs.length; i++) {
      var lo = i < obs.length ? obs[i][0] : L.stage.x1;
      if (lo - cur >= need) spots.push({ x: (cur + lo) / 2, y: my });
      if (i < obs.length) cur = Math.max(cur, obs[i][1]);
    }
    // the sky between the lanterns and the drum tops (incl. the hop and the card)
    var top = 1e9;
    this.drums.forEach(function (c) { top = Math.min(top, c.padBase + c.bcy - self._hitR(c) - cfg.hopMax); });
    if (this.card) top = Math.min(top, this.card.y - this.card.h / 2);
    var y0 = L.lanternBottom + 24, y1 = top - 24, sky = y1 - y0 >= 0;
    var n = this.fireflies.length;
    this.fireflies.forEach(function (f, k) {
      var useGap = spots.length && (!sky || k % 2 === 0);
      if (useGap) { var gi = sky ? (k / 2) % spots.length : k % spots.length, s = spots[gi], lap = Math.floor((sky ? k / 2 : k) / spots.length); f.ax = s.x; f.ay = s.y + (lap % 2 ? 1 : -1) * Math.min(60, 30 * lap); return; }
      var u = (k + 0.5) / n;
      f.ax = lerp(L.stage.x0 + 40, L.stage.x1 - 40, u); f.ay = lerp(y0, Math.max(y0, y1), (k * 0.37) % 1);
    });
  };
  P._tapFirefly = function (f) {
    f.state = 'zip'; f.zt = 0; f.glow = 1.6; f.tapped = true;
    this._emit({ type: 'fireflyTap', x: f.x, y: f.y });
  };
  P._stepSurprises = function (h) {
    var cfg = this.cfg, L = this.layout, play = this.state === 'round' && this.phase === 'play', r = this._crng, i;
    // ---- lamb: trots in from the right along the ground line, sniffs near the middle, leaves
    if (this._lambNext >= 0 && play && !this.lamb) {
      this._lambNext -= h;
      if (this._lambNext < 0) {
        this._lambNext = -1;
        var x0 = this.age <= cfg.surpriseYoungAge ? L.W - L.ins.right - cfg.lambInYoung : L.W - L.ins.right + 90;
        this.lamb = { x: x0, y: this._lambY(), _px: x0, _py: this._lambY(), dir: -1, step: 0, ball: 0, _pball: 0, roll: 0, _proll: 0,
          state: 'walk', t: 0, stopX: this._lambStop(), sniffT: 0, bt: 0, sniff: 0, tapped: false };
        this._emit({ type: 'lamb', x: L.W - L.ins.right - 40, y: this._lambY() });
      }
    }
    var g = this.lamb;
    if (g) {
      g.t += h; g.y = this._lambY();
      if (g.state === 'walk' || g.state === 'leave') {
        g.x += g.dir * cfg.lambSpeed * (g.state === 'leave' ? 1.6 : 1) * h; g.step = (g.step + h * 2.6) % 1; g.sniff = 0;
        if (g.state === 'walk' && g.x <= g.stopX) { g.x = g.stopX; g.state = 'sniff'; g.sniffT = 0; }
        if (g.state === 'leave' && g.x > L.W + 120) this.lamb = null;
      } else if (g.state === 'sniff') {
        g.sniffT += h; g.step = 0; g.sniff = 0.5 + 0.5 * Math.sin(TAU * 2.2 * g.sniffT);
        if (g.sniffT >= cfg.lambSniff) { g.state = 'leave'; g.dir = 1; }
      } else if (g.state === 'ball') {   // puffs up (0.25 s), rolls 40 px (0.6 s), un-puffs (0.35 s)
        g.bt += h;
        var tb = cfg.lambBallTime, tr = cfg.lambRollTime, tu = cfg.lambUncurl;
        if (g.bt < tb) g.ball = smooth(g.bt / tb);
        else if (g.bt < tb + tr) {
          g.ball = 1; var ur = smooth((g.bt - tb) / tr), nx = g.rollFrom + g.dir * cfg.lambRoll * ur;
          g.roll += (nx - g.x) / cfg.lambBodyR; g.x = nx;   // rolling without slipping: angle = distance / radius
        } else if (g.bt < tb + tr + tu) g.ball = 1 - smooth((g.bt - tb - tr) / tu);
        else { g.ball = 0; g.state = g._back === 'walk' ? 'walk' : 'sniff'; if (g.state === 'walk' && g.x < g.stopX) g.stopX = g.x; }
      }
    }
    // ---- bird: flies in, perches on the lantern string between lanterns, hops along it, sings when tapped, leaves
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
        b.x = b.perchX + b.hopX; b.y = stringY(L.garland, b.x) - b.hop * cfg.birdHopH;
        if (b.stay >= cfg.birdStay) this._birdLeave();
      }
    }
    // ---- fireflies (twinkle stars): drift down between / above the drums, glow, zip off when tapped (or after a while)
    if (this._firefliesNext >= 0 && play && !this.fireflies.some(function (q) { return q.state !== 'zip'; })) {
      this._firefliesNext -= h;
      if (this._firefliesNext < 0) {
        this._firefliesNext = -1;
        for (i = 0; i < cfg.fireflyN; i++) {
          var sx = r.float(L.stage.x0, L.stage.x1);
          this.fireflies.push({ x: sx, y: -30, _px: sx, _py: -30, r: 10, glow: 0, phase: r.float(0, TAU), state: 'in', t: -i * cfg.fireflyStagger, sx: sx, sy: -30, ax: 0, ay: 0, zt: 0, vx: 0, vy: 0 });
        }
        this._fireflyAnchors();
        var c0 = this._bandCentre();
        this._emit({ type: 'fireflies', n: cfg.fireflyN, x: c0.x, y: L.lanternBottom + 30 });
      }
    }
    for (i = this.fireflies.length - 1; i >= 0; i--) {
      var f = this.fireflies[i];
      f.t += h;
      var tw = 0.5 + 0.5 * Math.sin(TAU * 0.9 * f.t + f.phase);
      if (f.state === 'in') {
        if (f.t < 0) { f.glow = 0; f.x = f.sx; f.y = -30; continue; }
        var ui = smooth(f.t / cfg.fireflyInTime);
        f.x = lerp(f.sx, f.ax, ui) + 14 * Math.sin(TAU * 0.6 * f.t + f.phase) * (1 - ui); f.y = lerp(f.sy, f.ay, ui); f.glow = 0.4 + 0.6 * tw * ui;
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

  P._stepBibi = function (h) {
    var b = this.bibi, cfg = this.cfg, L = this.layout;
    b.x = L.bibi.x; b.y = L.bibi.y; b.h = L.bibi.h; b.w = L.bibi.w;
    if (b.moodT > 0) { b.moodT -= h; if (b.moodT <= 0) { b.moodT = 0; b.mood = 'idle'; } }
    b.blinkT -= h;
    if (b.blink && b.blinkT <= 0) { b.blink = false; b.blinkT = this._crng.float(cfg.blink[0], cfg.blink[1]); }
    else if (!b.blink && b.blinkT <= 0) { b.blink = true; b.blinkT = cfg.blinkTime; }
    if (b._hopT >= 0) { b._hopT += h; var u = b._hopT / cfg.hopTime; b.hop = u < 1 ? Math.sin(Math.PI * u) : 0; if (u >= 1) b._hopT = -1; }
    this._lookT -= h;
    var tx = (L.stage.x0 + L.stage.x1) / 2;
    if (this._g) tx = this.finger.x;
    else if (this.hintHand) tx = this.hintHand.x;
    else if (this._lookT > 0) tx = this._lookX;
    else if (this.bird) tx = this.bird.x;
    else if (this.lamb) tx = this.lamb.x;
    else if (this.fireflies.length) tx = this.fireflies[0].x;
    b.lookX += (tx - b.lookX) * Math.min(1, h * cfg.lookRate);
    b.look = clamp((b.lookX - b.x) / 500, -1, 1);
  };

  CD.World = World;
})(window.CD = window.CD || {});
