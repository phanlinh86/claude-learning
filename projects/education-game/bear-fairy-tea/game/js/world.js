/* Moka's Fairy Tea Party — FT.CONFIG + FT.World (headless, deterministic odd-one-out tea-table simulation; DESIGN §2, §5.2)
 *
 * ============================== CONVENTIONS ==============================
 *  Units: logical px (short side 720), seconds, radians, y DOWN, rot > 0 clockwise. Screen space = world space (no camera).
 *  update(dt) runs fixed sub-steps of cfg.step (1/120 s). At the START of every sub-step every moving field is copied into its
 *  `_p` twin; render v = _v + (v − _v)·w.alpha.  No DOM, node-loadable.
 *
 *  THINGS w.members[] (slot order) = { id, i, thing, odd, slot, size (body box height before the big:false 0.62 art scale),
 *    x, y (BOTTOM centre, where it sits on the placemat), lift (px above y: hops / levitation; draw at y − lift), tx (slot x),
 *    vx, vy, sx, sy (squash), rot, rotV, swing (pendulum angle under the fluff while falling), fluff 0..1 (fluff alpha),
 *    fluffX, fluffY, fluffR (the dandelion-fluff parachute: drawn while fluff > 0, attached while falling, drifting away after),
 *    state 'fall'|'sit'|'rise'|'lantern'|'poof'|'gone', glow 0..1, dim 0..1, count −1|0..n (plate berries being counted),
 *    scale, hop 0|1 (guest _hop frame), ring 0..1 (chime bell flash), alpha 0..1, cx, cy (hit-circle centre = body centre) }
 *    + _px _py _plift _prot _psx _psy _pscale _pfluffX _pfluffY _palpha.
 *    Draw (skip 'lantern' / 'gone'): translate(x, y − lift) · rotate(rot) · scale(sx·scale, sy·scale) → FT.TeaArt.drawThing(ctx,
 *      thing, size, {glow, dim, hop, count, ring, night}) with globalAlpha = alpha; fluff: drawFluff(ctx, fluffX, fluffY, fluffR, fluff).
 * ========================================================================
 */
(function (FT) {
  'use strict';

  var CONFIG = {
    // ---- timing / state machine (s)
    step: 1 / 120, maxFrame: 1.0,
    roundsPerLevel: 4, chapterTimeLimit: 75, chapterMinRounds: 3,
    shortBudget: [1e9, 26, 42, 56],   // s into the chapter: a round starting later than this is short (3 / 4 things)
    introTime: 2.5, levelDoneTime: 3.6, garlandFullTime: 1.6,
    talkAfterAnswer: 1.6, talkAskTime: 12, talkGlowAfterAsks: 2, talkMaxAsks: 3, talkGiveUp: 2,

    // ---- layout (DESIGN §2; px)
    shortSide: 720, minLong: 960, maxLong: 1600, tallRatio: 1.6, phoneRatio: 1.9,
    groundLand: 14, groundPort: 26,
    bubbleX: 24, bubbleYLand: 18, bubbleMaxW: 560, bubbleRight: 200, bubbleHLand: 134, bubbleYPort: 110, bubbleHPort: 124,
    hudW: 160, hudH: 96, bubbleMinW: 220,
    mokaXLand: 120, mokaXPort: 110, mokaHLand: 250, mokaHPort: 220, mokaFeetLand: 10, mokaFeetPort: 6, mokaWFrac: 0.7, mokaPad: 10,
    tableUp: 150, tableX0Moka: 110, tableRight: 60, tablePortSide: 50, tableAboveMoka: 40, tableBelowGarland: 260, tableMinUp: 60,
    slotInset: 40, plankOver: 30, plankH: 46, legInset: 70,
    item: { 3: 124, 4: 124, 5: 114, 6: 106, 7: 106 }, itemMin: 100, tallK: 1.12, spMin: 1.25, spMax: 1.7, spTight: 1.12, itemFloor: 72,
    garlandGapLand: 46, garlandGapPort: 50, garlandSag: 40, garlandSide: 70, lanternDrop: 34, lanternH: 70, lanternU: [0.2, 0.8], fairyHomeU: 0.08, fairyPerch: 16,
    entryY: -140, entryJitter: 60,
    hitK: 0.6, hitPad: 14, hitDiaPhone: 184, littleHitK: 0.85, keepGap: 44, littleK: 0.62,

    // ---- enter: dandelion-fluff fall (terminal-velocity descent + pendulum sway), landing squash, table spring
    enterStagger: 0.22, enterMin: 1.4, fallTime: 1.25, fallV: [260, 900], fallV0: 0.6, fallDrag: 7, brakeK: 0.36, landV: 150, landRef: 240,
    stringK: 0.32, fluffK: 0.42,
    driftOmega: 2.6, driftZeta: 0.85, windPush: 40,
    swingOmega: 3.2, swingZeta: 0.15, swing0: 0.13, swingDrive: 0.3, swingHz: [0.35, 0.6], swingWind: 0.5, swingAccK: 0.9,
    squashOmega: 16, squashZeta: 0.4, squashLand: 0.14, squashSxK: 0.86, qMax: 0.3, settleTime: 0.3,
    tableOmega: 14, tableZeta: 0.3, tableKick: 2.5, mass: { obj: 0.8, cookie: 0.6, plate: 0.7, card: 0.5, guest: 1 },
    matOmega: 14, matZeta: 0.35, fluffAwayV: [-46, -64], fluffFade: 1.4,
    tiltOmega: 10, tiltZeta: 0.5, sitOmega: 9, sitZeta: 0.8, sitVMax: 520,
    breathAmp: 1.5, breathHz: 0.6, breezeRot: 0.04, breezeHz: 0.45,
    wigPeak: 0.18, wigOmega: 18, wigZeta: 0.25, wrongHop: 14, wrongHopT: 0.3, sameWrongWindow: 1.0,
    lookHopEvery: [3, 7], lookHopH: 8, lookHopT: 0.3,

    // ---- rise: fairy flies in, circles + dust, berries counted, buoyant swaying rise into the lantern
    fairyFly: 0.45, fairyArc: 80, fairyCircle: 0.7, dustN: 3, levitate: 12, levitateT: 0.4, levBob: 3,
    countDelay: 0.2, countStep: 0.5, countTail: 0.35,
    riseV: [220, 400], riseTime: 1.6, riseDrag: 2.6, swayAmp: 26, swayHz: 1.1, riseSpin: 0.18, riseScale: 0.42, arriveSlow: 90,
    lanternOmega: 9, lanternZeta: 0.35, lswingOmega: 4, lswingZeta: 0.12, lswingKick: 0.22, lswingWind: 0.25, lanternHold: 0.35,
    badgeTime: 2, badgeFade: 0.25,
    fairyLead: 30, fairyOmega: 10, fairyZeta: 0.9, fairyBack: 0.8, fairyBob: 3, flapRest: 4, flapFly: 12,

    // ---- chime wave / cheers / clear
    chimeGap: 0.3, chimeTail: 0.4, chimeHop: 26, chimeHopT: 0.36, chimeRing: 0.5, chimeLand: 0.08, chimeHopHold: 0.15,
    cheersTime: 1.1, loopTime: 0.9, loopR: 34,
    clearTime: 0.8, poofDelay: 0.05, poofSweep: 0.4, poofTime: 0.28, poofLift: 10,

    // ---- help (DESIGN §5.2 / skill rules)
    hintAfterMisses: 2, hintAfterSoft: 3, assistAfter: 6, hintTime: 3.2, hintCooldown: 6, hintCycle: 1.6,
    idleTime: 12, idleBackoff: 1.5, idleMax: 30, idleHintFrom: 2, flickTime: 0.25, tapMovePx: 24, puffTime: 0.6, critterK: 2,

    // ---- critters: one round per chapter (round 1 or 2, never the warm-up); kind by chapter index
    surpriseRounds: [1, 2], critters: ['ladybug', 'butterfly', 'snail', 'fairies'], surpriseAt: [2, 4.5],
    ladybug: { speed: 70, r: 40, stop: 3, stepRate: 7, flyT: 1.1, dy: 20, lift: 12 },
    butterfly: { r: 38, inT: 1.6, sit: 5, loopT: 1.2, loopR: 50, outT: 1.6, gap: 8 },
    snail: { r: 46, inT: 2.2, stay: 10, peekT: 1.0, outT: 1.6, out: 70, lift: 40 },
    fairies: { n: 4, r: 40, inT: 1.4, stay: 14, twirlT: 0.9, outT: 1.2, orbit: 46, w: 1.6 },

    // ---- Moka
    moodTime: { happy: 0.9, cheer: 1.4, oops: 0.8, think: 1.4, talk: 1.0, wave: 1.4, point: 1.2, sip: 1.3 },
    bounceT: 0.42, lookRate: 6, blink: [2.2, 5], blinkTime: 0.13
  };
  FT.CONFIG = CONFIG;

  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hyp(x, y) { return Math.sqrt(x * x + y * y); }
  function lerp(a, b, u) { return a + (b - a) * u; }
  function smooth(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
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
  function bez(x0, y0, cx, cy, x1, y1, u) { var a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u; return { x: a * x0 + b * cx + c * x1, y: a * y0 + b * cy + c * y1 }; }
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

  /* ---------------------------------------------------------------- layout (DESIGN §2)
   * Sized for n things (the round's real count; 5 between rounds). Tiers, the first that fits wins: the age's item (× 1.12 on
   * tall screens) at spacing 1.25 × item, the base item, itemMin 100 at 1.25 ×, itemMin at 1.12 ×; an odd viewport finally
   * squeezes the item. "Fits" = the n slot centres lie in [table.x0 + 40, table.x1 − 40]. */
  function computeLayout(W, H, ins, cfg, age, hudKeep, n) {
    var a = ageKey(age), tall = H / W > cfg.tallRatio;
    n = clamp(Math.round(n || 5), 1, 5);
    var base = cfg.item[a], big = tall ? Math.round(base * cfg.tallK) : base, lo = Math.min(cfg.itemMin, base), tiers = [], L, t;
    if (big > base) tiers.push([big, cfg.spMin]);
    tiers.push([base, cfg.spMin]);
    if (lo < base) tiers.push([lo, cfg.spMin]);
    tiers.push([lo, cfg.spTight]);
    for (t = 0; t < tiers.length; t++) {
      L = layoutTier(W, H, ins, cfg, a, hudKeep, tiers[t][0], tiers[t][1], n);
      L.tier = t;
      if (L.fits) return L;
    }
    var L0 = layoutTier(W, H, ins, cfg, a, hudKeep, lo, cfg.spTight, n);
    var sq = Math.max(cfg.itemFloor, Math.floor(L0.span / Math.max(1, (n - 1) * cfg.spTight)));
    L = layoutTier(W, H, ins, cfg, a, hudKeep, Math.min(lo, sq), cfg.spTight, n);
    L.tier = tiers.length; L.squeezed = true;
    return L;
  }
  /** The HUD's measured box among the hudKeep boxes (the one in the top-right). */
  function hudBox(hk, W, H) { var best = null; for (var i = 0; i < hk.length; i++) { var b = hk[i]; if (b.x + b.w / 2 > W / 2 && b.y < H / 2 && (!best || b.y + b.h > best.y + best.h)) best = b; } return best; }
  function garlandY(g, u) { return g.y + g.sag * 4 * u * (1 - u); }
  function layoutTier(W, H, ins, cfg, a, hudKeep, item, spK, n) {
    ins = insOf(ins);
    var portrait = H > W, tall = H / W > cfg.tallRatio, phone = (portrait ? H / W : W / H) > cfg.phoneRatio;
    var groundY = H - ins.bottom - (portrait ? cfg.groundPort : cfg.groundLand);
    var hk = keepBoxes(hudKeep), hb = hudBox(hk, W, H);
    var bx = ins.left + cfg.bubbleX, bubble;
    if (portrait) bubble = { x: bx, y: ins.top + cfg.bubbleYPort, w: W - bx - ins.right - cfg.bubbleX, h: cfg.bubbleHPort };
    else bubble = { x: bx, y: ins.top + cfg.bubbleYLand, w: Math.min(cfg.bubbleMaxW, W - ins.right - cfg.bubbleRight - bx), h: cfg.bubbleHLand };
    if (hb && bubble.x + bubble.w > hb.x - 10 && bubble.y < hb.y + hb.h) {   // the measured HUD: narrower beside it, else below
      var room = hb.x - 12 - bubble.x;
      if (!portrait && room >= cfg.bubbleMinW) bubble.w = room;
      else bubble.y = Math.max(bubble.y, hb.y + hb.h + 8);
    }
    bubble.w = Math.max(0, bubble.w);
    var bb = bubble.y + bubble.h;
    var hud = { x: W - ins.right - cfg.hudW, y: 0, w: cfg.hudW + ins.right, h: ins.top + cfg.hudH };
    // Moka (seat point + height)
    var mh = portrait ? cfg.mokaHPort : cfg.mokaHLand;
    var moka = { x: ins.left + (portrait ? cfg.mokaXPort : cfg.mokaXLand), y: groundY - (portrait ? cfg.mokaFeetPort : cfg.mokaFeetLand), h: mh, w: cfg.mokaWFrac * mh };
    var mokaBox = { x: moka.x - moka.w / 2 - cfg.mokaPad, y: moka.y - mh - cfg.mokaPad, w: moka.w + 2 * cfg.mokaPad, h: mh + 2 * cfg.mokaPad };
    moka.cup = { x: moka.x + 0.26 * mh, y: moka.y - 0.5 * mh };          // the cup in the idle pose (main / render may refine)
    moka.cupUp = { x: moka.x + 0.24 * mh, y: moka.y - 0.92 * mh };       // the raised cup ("Cheers!")
    moka.mouth = { x: moka.x + 0.16 * mh, y: moka.y - 0.62 * mh };
    // the garland: a vine between the two trunks, below the bubble
    var g = { x0: ins.left + cfg.garlandSide, x1: W - ins.right - cfg.garlandSide, y: bb + (portrait ? cfg.garlandGapPort : cfg.garlandGapLand), sag: cfg.garlandSag, lanterns: [] };
    for (var i = 0; i < 4; i++) {
      var u = cfg.lanternU[0] + (cfg.lanternU[1] - cfg.lanternU[0]) * i / 3, lx = lerp(g.x0, g.x1, u), ly = garlandY(g, u);
      g.lanterns.push({ x: lx, y: ly, u: u, cx: lx, cy: ly + cfg.lanternDrop + cfg.lanternH / 2 });
    }
    g.bottom = g.y + g.sag + cfg.lanternDrop + cfg.lanternH;
    var fu = cfg.fairyHomeU, fairyHome = { x: lerp(g.x0, g.x1, fu), y: garlandY(g, fu) - cfg.fairyPerch };
    // the table (y = top surface where the placemats lie = the things' bottom y)
    var ty, x0, x1;
    if (portrait) {
      ty = Math.max(moka.y - mh - cfg.tableAboveMoka, g.bottom + cfg.tableBelowGarland);
      x0 = ins.left + cfg.tablePortSide; x1 = W - ins.right - cfg.tablePortSide;
    } else {
      ty = groundY - cfg.tableUp;
      x0 = moka.x + cfg.tableX0Moka; x1 = W - ins.right - cfg.tableRight;
    }
    // measured bottom keep-outs (toolbars): resting things stay ≥ 44 px above them
    hk.forEach(function (b) { if (b.y > H / 2 && b.y - cfg.keepGap < ty) ty = b.y - cfg.keepGap; });
    ty = Math.min(ty, groundY - cfg.tableMinUp);
    var table = { y: ty, x0: x0, x1: x1, top: ty, plankX0: x0 - cfg.plankOver, plankX1: x1 + cfg.plankOver, plankH: cfg.plankH,
      legs: [x0 + cfg.legInset, x1 - cfg.legInset], legBottom: groundY };
    var s0 = x0 + cfg.slotInset, s1 = x1 - cfg.slotInset, span = s1 - s0;
    var hitPad = (tall || phone) ? Math.max(cfg.hitPad, cfg.hitDiaPhone / 2 - cfg.hitK * item) : cfg.hitPad;
    var sp = clamp(span / n, spK * item, cfg.spMax * item);
    var L = { W: W, H: H, ins: ins, portrait: portrait, tall: tall, phone: phone, groundY: groundY, bubble: bubble, hud: hud,
      moka: moka, mokaBox: mokaBox, table: table, slots: [], item: item, spK: spK, sp: sp, n: n, span: span, slotX0: s0, slotX1: s1,
      garland: g, fairyHome: fairyHome, entryY: cfg.entryY, hitPad: hitPad, hitR: cfg.hitK * item + hitPad,
      band: { x: x0 - cfg.plankOver, y: ty - item * 1.5, w: x1 - x0 + 2 * cfg.plankOver, h: item * 1.5 + 40 },
      safe: { x: ins.left, y: ins.top, w: W - ins.left - ins.right, h: H - ins.bottom - ins.top } };
    L.keep = [{ x: bubble.x, y: bubble.y, w: bubble.w, h: bubble.h, kind: 'bubble' }, { x: hud.x, y: hud.y, w: hud.w, h: hud.h, kind: 'hud' }];
    hk.forEach(function (b) { b.kind = 'hudKeep'; L.keep.push(b); });
    L.fits = (n - 1) * sp <= span + 0.5;
    L.slots = slotsFor(L, n, cfg);
    return L;
  }
  /** k slot centres {x, y} on the table: centred in [x0 + 40, x1 − 40], spacing clamp(span / k, spK × item, 1.7 × item). */
  function slotsFor(L, k, cfg) {
    cfg = cfg || CONFIG;
    var sp = clamp(L.span / Math.max(1, k), L.spK * L.item, cfg.spMax * L.item), mid = (L.slotX0 + L.slotX1) / 2, out = [];
    for (var i = 0; i < k; i++) out.push({ x: mid + (i - (k - 1) / 2) * sp, y: L.table.y });
    return out;
  }

  // ------------------------------------------------------------------ World
  function World(opts) {
    opts = opts || {};
    this.cfg = merge(CONFIG, opts.config);
    this.seed = opts.seed !== undefined ? opts.seed : 1;
    this.rng = new FT.RNG(this.seed);
    this._crng = new FT.RNG((FT.RNG.hash(this.seed) ^ 0x51ed27) >>> 0);   // cosmetic randomness (fall jitter, look hops, blinks, critters)
    this.age = FT.Content.ageOf(opts.age !== undefined ? opts.age : 4);
    this.lang = opts.lang === 'vi' ? 'vi' : 'en';
    this._pendingAge = this.age; this._pendingLang = this.lang;
    this.state = 'menu'; this.phase = null;
    this.level = 0; this.levels = []; this.topic = null; this.weather = 0; this.wind = 0;
    this.round = 0; this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.stars = 0; this.levelStars = 0; this.roundStars = 0; this.misses = 0; this.streak = 0;
    this.time = 0; this.stateTime = 0; this.phaseTime = 0; this.alpha = 0; this._acc = 0;
    this.cur = null; this.talk = null; this.talkAnswered = null;
    this.members = []; this.puffs = []; this.mats = [];
    this.critter = null; this.hintHand = null; this.assistId = null;
    this.table = { spring: 0, springV: 0, _pspring: 0 };
    this.garland = { x0: 0, x1: 0, y: 0, sag: 0, lanterns: [], badge: null, twinkle: 0, _ptwinkle: 0, lit: 0 };
    this.fairy = { x: 0, y: 0, _px: 0, _py: 0, flap: 0, flapPh: 0, sprinkle: 0, state: 'rest', t: 0, face: 1, vx: 0, vy: 0, id: null };
    this.moka = { x: 0, y: 0, h: 250, w: 175, mood: 'idle', moodT: 0, blinkT: 3, blink: false, look: 0, lookX: 0, bounce: 0, _pbounce: 0, _bT: -1 };
    this.finger = { x: 0, y: 0, down: false };
    this.hudKeep = opts.hudKeep || null; this.lastTopics = null; this.surprise = null; this._surpriseRound = 1;
    this.events = []; this.sessions = 0;
    this._idleN = 0; this._idleT = 0; this._idleGap = this.cfg.idleTime; this._lastHintT = -1e9; this.levelStartTime = 0;
    this._talkAskT = 0; this._talkAsks = 0; this._g = null; this._noProg = 0; this._answered = false;
    this._usedKeys = []; this._usedOdd = []; this._prevRule = null; this._prevRuleRun = 0; this._prevOddSlots = [];
    this._view = null; this._vp = null; this._lookT = 0; this._lookX = 0; this._lookHopT = 3;
    this._surpriseAt = -1; this._chime = null; this._lanternT = -1; this._garlandAt = -1;
    this.setViewport(opts.width || 1280, opts.height || 720, opts.ins || null);
    this._fairyRest(true);
  }
  World.logicalSize = logicalSize;
  World.computeLayout = function (W, H, ins, cfg, age, hudKeep, n) { return computeLayout(W, H, ins, merge(CONFIG, cfg), age === undefined ? 4 : age, hudKeep, n); };
  World.slotsFor = function (L, k, cfg) { return slotsFor(L, k, merge(CONFIG, cfg)); };
  World.kickFor = kickFor;
  World.segHit = segHit;
  World.garlandY = garlandY;

  var P = World.prototype;
  /** true while a first contact on a thing is judged right now (round, play, not answered yet). */
  Object.defineProperty(P, 'interactive', { get: function () { return this.state === 'round' && this.phase === 'play' && !this._answered; } });
  Object.defineProperty(P, 'odd', { get: function () { return this.cur ? this.memberById(this.cur.oddId) : null; } });
  P._emit = function (e) { this.events.push(e); };
  P.drainEvents = function () { var e = this.events; this.events = []; return e; };
  P.setAge = function (a) { this._pendingAge = FT.Content.ageOf(a); };
  P.setLang = function (l) { this._pendingLang = l === 'vi' ? 'vi' : 'en'; };
  /** Breeze 0..1 (main passes weather.ambient.wind): sways falling / sitting things and the lanterns. */
  P.setBreeze = function (w) { this.wind = clamp(+w || 0, 0, 1); };
  P._setState = function (s) { this.state = s; this.stateTime = 0; };
  P._setPhase = function (p) { this.phase = p; this.phaseTime = 0; };
  P._mood = function (m, t) { this.moka.mood = m; this.moka.moodT = t || this.cfg.moodTime[m] || 1; };
  P._bounce = function () { this.moka._bT = 0; };
  P.skipTalk = function () { if (this.state === 'talk') this._levelDone(); };
  P.memberById = function (id) { for (var i = 0; i < this.members.length; i++) if (this.members[i].id === id) return this.members[i]; return null; };
  P._mouth = function () { var m = this.layout.moka.mouth; return { x: m.x, y: m.y }; };
  P._tableCentre = function () { var L = this.layout; return { x: (L.slotX0 + L.slotX1) / 2, y: L.table.y - L.item / 2 }; };

  /** The current question {promptKey, params, rule, nameKind, nameValue} while it can be answered, else null. */
  P.prompt = function () {
    if (!this.interactive || !this.cur) return null;
    var c = this.cur;
    return { promptKey: c.promptKey, params: c.params, rule: c.rule, nameKind: c.rule.nameKind, nameValue: c.rule.value };
  };

  // ---------------------------------------------------------------- geometry + test hooks (logical px)
  P._little = function (m) { return m.thing.big === false; };
  P._drawH = function (m) { return m.size * (this._little(m) ? this.cfg.littleK : 1) * m.scale * m.sy; };
  P._hitR = function (m) { return this.cfg.hitK * m.size * (this._little(m) ? this.cfg.littleHitK : 1) * Math.max(0.85, m.scale) + this.layout.hitPad; };
  P._pose = function (m) { m.cx = m.x; m.cy = m.y - m.lift - this._drawH(m) / 2; };
  /** The thing's hit circle {x, y, r} (body centre where it is now, incl. hops / float), null when gone / in its lantern. */
  P.memberHit = function (id) { var m = this.memberById(id); return m && m.state !== 'gone' && m.state !== 'lantern' ? { x: m.cx, y: m.cy, r: this._hitR(m) } : null; };
  /** The sitting thing nearest to (x, y) within its hit radius, + its distance. */
  P._memberNear = function (x, y) {
    var best = null, bd = 1e9;
    for (var i = 0; i < this.members.length; i++) {
      var m = this.members[i];
      if (m.state !== 'sit') continue;
      var d = hyp(x - m.cx, y - m.cy);
      if (d <= this._hitR(m) && d < bd) { bd = d; best = m; }
    }
    return { m: best, d: bd };
  };
  P._memberAt = function (x, y) { return this._memberNear(x, y).m; };
  /** Moka's tap box {x, y (top-left), w, h, cx, cy}. */
  P.mokaHit = function () { var b = this.layout.mokaBox; return { x: b.x, y: b.y, w: b.w, h: b.h, cx: b.x + b.w / 2, cy: b.y + b.h / 2 }; };
  P._clearOfKeep = function (x, y, r) { var K = this.layout.keep; for (var k = 0; k < K.length; k++) if (inBox(K[k], x, y, r * 0.5)) return false; return true; };
  P._onScreen = function (x, y, m) { var L = this.layout; return x >= L.ins.left + m && x <= L.W - L.ins.right - m && y >= L.ins.top + m && y <= L.H - L.ins.bottom - m; };
  /** The critter's tap circle {x, y, r, kind, i?} when it can be tapped right now (on screen, clear of the HUD / bubble), else null.
   *  For the fairies: the first tappable one (i = its index). */
  P.critterHit = function () {
    var c = this.critter, C = this.cfg, k;
    if (!c) return null;
    if (c.kind === 'fairies') {
      if (c.state !== 'dance') return null;
      for (k = 0; k < c.fairies.length; k++) {
        var f = c.fairies[k];
        if (this._onScreen(f.x, f.y, 10) && this._clearOfKeep(f.x, f.y, C.fairies.r)) return { x: f.x, y: f.y, r: C.fairies.r, kind: 'fairies', i: k };
      }
      return null;
    }
    var ok = c.kind === 'ladybug' ? (c.state === 'walk' || c.state === 'stop') : c.kind === 'butterfly' ? (c.state === 'sit' || c.state === 'loop') : (c.state === 'stay' || c.state === 'peek' || c.state === 'in');
    if (!ok) return null;
    var hy = c.y - (c.kind === 'ladybug' ? C.ladybug.lift : c.kind === 'snail' ? C.snail.lift : 0), r = C[c.kind].r;
    if (!this._onScreen(c.x, hy, 10) || !this._clearOfKeep(c.x, hy, r)) return null;
    return { x: c.x, y: hy, r: r, kind: c.kind };
  };
  /** The critter target under (x, y) {kind, i?, d} or null (fairies: the nearest dancing one). */
  P._critterAt = function (x, y) {
    var c = this.critter, C = this.cfg;
    if (!c) return null;
    if (c.kind === 'fairies') {
      if (c.state !== 'dance') return null;
      var best = null, bd = 1e9;
      for (var k = 0; k < c.fairies.length; k++) { var f = c.fairies[k], d = hyp(x - f.x, y - f.y); if (d <= C.fairies.r && d < bd && this._clearOfKeep(f.x, f.y, 0)) { bd = d; best = { kind: 'fairies', i: k, d: d }; } }
      return best;
    }
    var h = this.critterHit();
    if (!h) return null;
    var dd = hyp(x - h.x, y - h.y);
    return dd <= h.r ? { kind: c.kind, d: dd } : null;
  };
  /** What to touch next: {member: id} in play (the odd one), else null. */
  P.answer = function () { return this.interactive && this.cur ? { member: this.cur.oddId } : null; };

  // ---------------------------------------------------------------- viewport
  P.setViewport = function (W, H, ins) { this._view = { W: W, H: H, ins: insOf(ins) }; this._relayout(false); };
  P._relayout = function (force) {
    var v = this._view, n = this.cur ? this.cur.members.length : 5;
    var key = v.W + 'x' + v.H + ':' + JSON.stringify(v.ins) + ':' + this.age + ':' + n + ':' + JSON.stringify(this.hudKeep || null);
    if (key === this._vp && !force) return false;
    var had = !!this.layout;
    this._vp = key;
    this.layout = computeLayout(v.W, v.H, v.ins, this.cfg, this.age, this.hudKeep, n);
    this.layout.hudKeep = keepBoxes(this.hudKeep);
    var L = this.layout, M = L.moka, g = this.garland, G = L.garland;
    this.moka.x = M.x; this.moka.y = M.y; this.moka.h = M.h; this.moka.w = M.w;
    g.x0 = G.x0; g.x1 = G.x1; g.y = G.y; g.sag = G.sag;
    for (var i = 0; i < 4; i++) {
      var q = g.lanterns[i] || (g.lanterns[i] = { lit: 0, litV: 0, _plit: 0, color: null, thing: null, swing: 0, swingV: 0, _pswing: 0, home: null });
      q.x = G.lanterns[i].x; q.y = G.lanterns[i].y; q.cx = G.lanterns[i].cx; q.cy = G.lanterns[i].cy;
    }
    if (g.badge) { var bl = G.lanterns[g.badge.i]; g.badge.x = bl.cx; g.badge.y = bl.cy + this.cfg.lanternH / 2 + 40; }
    this._placeMats();
    if (had) this._snapAll();
    return true;
  };
  P._placeMats = function () {
    var L = this.layout, n = this.cur ? this.cur.members.length : (this.mats.length || 3), sl = slotsFor(L, n, this.cfg), old = this.mats;
    this.mats = sl.map(function (s, i) { var o = old[i] || { pop: 0, popV: 0, _ppop: 0 }; return { x: s.x, y: L.table.y, w: L.item * 1.25, pop: o.pop, popV: o.popV, _ppop: o._ppop }; });
  };
  /** Rotation / resize mid-round (DESIGN §5.2): cancel the gesture; slots re-placed; sitting things spring to the new slot;
   *  falling things drift to it and land on the new table; a rising thing retargets its lantern; everything clamped on screen. */
  P._snapAll = function () {
    var L = this.layout, cfg = this.cfg, self = this, sl = slotsFor(L, this.members.length, cfg);
    this.cancelDrag();
    this.members.forEach(function (m) {
      m.size = L.item;
      var hw = m.size * 0.5, otx = m.tx;
      m.tx = clamp(sl[m.slot] ? sl[m.slot].x : m.x, L.ins.left + hw, L.W - L.ins.right - hw);
      if (m.state === 'fall') m.fluffX += m.tx - otx;   // the whole scene re-laid out: a falling thing keeps its offset from its placemat
      if (m.state === 'sit' || m.state === 'poof') { m.y = L.table.y; m.x = clamp(m.x, L.ins.left + hw, L.W - L.ins.right - hw); }
      else if (m.state === 'fall') {
        m.fluffX = clamp(m.fluffX, L.ins.left + hw, L.W - L.ins.right - hw);
        m._vT = self._fallV();
        self._hang(m);
        if (m.y >= L.table.y) self._land(m);
      } else if (m.state === 'rise') {
        m.x = clamp(m.x, L.ins.left + hw, L.W - L.ins.right - hw);
        m.y = clamp(m.y, L.ins.top + m.size, L.H - L.ins.bottom);
        if (m._rs !== 'float') m.y = L.table.y;
        else self._riseTarget(m, true);
      }
      if (m.fluff > 0 && m.state !== 'fall') { m.fluffX = clamp(m.fluffX, -60, L.W + 60); m.fluffY = clamp(m.fluffY, -80, L.H); }
      self._pose(m); self._twin(m);
    });
    var f = this.fairy;
    f.x = clamp(f.x, 0, L.W); f.y = clamp(f.y, 0, L.H);
    if (f.state === 'rest') this._fairyRest(true);
    else if (f.state === 'fly' || f.state === 'back') { f._x0 = f.x; f._y0 = f.y; f.t = 0; f._T = Math.max(0.2, (f._T || 0.5) * 0.6); }
    f._px = f.x; f._py = f.y;
    if (this.critter) this._critterRelayout();
    if (this.hintHand) this._stepHint(0);
  };

  // ---------------------------------------------------------------- session flow
  P.newSession = function (opts) {
    this.age = this._pendingAge; this.lang = this._pendingLang;
    this.cur = null;
    this._relayout(false);
    this.sessions++;
    this._clearRound(); this.state = 'menu';
    var last = (opts && opts.lastTopics) || this.lastTopics || null;
    this.levels = FT.Content.topicsFor(this.age, this.rng, last);
    this.stars = 0; this._prevRule = null; this._prevRuleRun = 0; this._prevOddSlots = [];
    this.weather = 0;
    this._emit({ type: 'session', levels: this.levels.slice() });
    this.startLevel(0);
  };
  /** keep = true between two rounds: fluffs drifting away and a critter flying off finish their exit. */
  P._clearRound = function (keep) {
    this.members = []; this._g = null; this.finger.down = false;
    if (!keep || !this.critter || !this._critterLeaving()) this.critter = null;
    this.hintHand = null; this.assistId = null; this._answered = false; this._chime = null;
    this._surpriseAt = -1; this._lanternT = -1; this._garlandAt = -1; this._poofs = null;
    if (!keep) this.puffs = [];
  };
  P._resetLanterns = function () {
    var g = this.garland;
    g.badge = null; g.twinkle = 0; g._ptwinkle = 0; g.lit = 0;
    g.lanterns.forEach(function (q) { q.lit = 0; q._plit = 0; q.litV = 0; q.color = null; q.thing = null; q.home = null; q.target = 0; });
  };
  P.startLevel = function (i) {
    if (!this.levels.length) this.levels = FT.Content.topicsFor(this.age);
    this.level = clamp(i | 0, 0, this.levels.length - 1);
    this.topic = this.levels[this.level];
    this.weather = this.level % 4;
    this.round = 0; this.levelStars = 0; this.levelStartTime = this.time;
    this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.cur = null; this.talk = null; this.talkAnswered = null; this.surprise = null; this._usedKeys = []; this._usedOdd = [];
    var SR = this.cfg.surpriseRounds || [2];
    this._surpriseRound = SR[this.rng.int(0, SR.length - 1)];
    this._clearRound();
    this._resetLanterns();
    this._relayout(false);
    this._setState('intro'); this.phase = null;
    this._mood('wave', 1.6);
    if (this.fairy.state !== 'rest') this._fairyBack();
    var c = this._tableCentre();
    this._emit({ type: 'level', level: this.level, topic: this.topic, weather: this.weather, x: c.x, y: c.y });
  };
  /** The critter of this chapter: ladybug / butterfly / snail / fairies by chapter index. */
  P._critterKind = function () { var K = this.cfg.critters; return K && K.length ? K[this.level % K.length] : null; };

  P._newMember = function (q, i) {
    return { id: q.id, i: i, thing: q.thing, odd: !!q.odd, slot: q.slot, size: 0, x: 0, y: 0, lift: 0, tx: 0, vx: 0, vy: 0, sx: 1, sy: 1,
      rot: 0, rotV: 0, tilt: 0, tiltV: 0, wig: 0, q: 0, qV: 0, spin: 0, swing: 0, swingV: 0,
      fluff: 0, fluffX: 0, fluffY: 0, fluffR: 0, fluffVX: 0, fluffVY: 0, fvx: 0, fvy: 0, Lh: 0, _vT: 300,
      state: 'fall', glow: 0, dim: 0, count: -1, scale: 1, alpha: 1, hop: 0, ring: 0, cx: 0, cy: 0, jump: 0, breath: 0, _breathK: 0,
      _jumpT: -1, _jumpH: 0, _jumpDur: 0.3, _hopHold: 0, _spawnAt: 0, _spawned: false, _lastWrongT: -1e9, _glowT: 0, _flashT: 0,
      _countAt: -1, _countDoneT: -1, _landT: -1e9, _fluffT: 0, _lvT: 0, _rs: null, _rt: 0, _ph: this._crng.float(0, TAU), _swHz: this._crng.float(this.cfg.swingHz[0], this.cfg.swingHz[1]),
      _px: 0, _py: 0, _plift: 0, _prot: 0, _psx: 1, _psy: 1, _pscale: 1, _pfluffX: 0, _pfluffY: 0, _palpha: 1, _pfluff: 0 };
  };
  P._fallV = function () { var L = this.layout, c = this.cfg; return clamp((L.table.y - L.entryY) / c.fallTime, c.fallV[0], c.fallV[1]); };
  /** Puts a falling thing's bottom under its fluff (pendulum of length Lh at angle swing). rot = −swing (rigid hanging body). */
  P._hang = function (m) {
    m.Lh = m.size * (1 + this.cfg.stringK); m.fluffR = m.size * this.cfg.fluffK;
    m.x = m.fluffX + Math.sin(m.swing) * m.Lh; m.y = m.fluffY + Math.cos(m.swing) * m.Lh; m.rot = -m.swing;
  };
  P._beginRound = function () {
    var cfg = this.cfg, self = this;
    var rr = new FT.RNG((this.rng.next() * 4294967296) >>> 0);
    var sp = this.round === this._surpriseRound && this.round > 0 ? this._critterKind() : null;
    var el = this.time - this.levelStartTime, sb = cfg.shortBudget, short = !!(sb && this.round > 0 && el > sb[Math.min(this.round, sb.length - 1)]);
    var cur = FT.Content.makeRound(this.topic, { age: this.age, lang: this.lang, rng: rr, roundIndex: this.round, surprise: sp, short: short, level: this.level,
      usedKeys: this._usedKeys, prevRule: this._prevRule, prevRuleRun: this._prevRuleRun, prevOddSlots: this._prevOddSlots.slice(), usedOdd: this._usedOdd });
    this._usedKeys.push(cur.key);
    if (cur.oddValue != null) this._usedOdd.push(cur.oddValue);
    this._clearRound(true);
    this.cur = cur; this.surprise = cur.surprise;
    this.misses = 0; this.streak = 0; this._noProg = 0; this._roundAssisted = false;
    this._relayout(false);   // item / slots sized for this round's thing count
    this._placeMats();
    var L = this.layout, n = cur.members.length, vT = this._fallV();
    this.members = cur.members.map(function (q, i) { return self._newMember(q, i); });
    var order = this._crng.shuffle(this.members.map(function (m, k) { return k; }));
    this.members.forEach(function (m, k) {
      m.size = L.item; m.tx = L.slots[m.slot].x; m._vT = vT;
      m._spawnAt = order.indexOf(k) * cfg.enterStagger;
      m.swing = self._crng.sign() * cfg.swing0 * self._crng.float(0.6, 1);
      m.fluffX = m.tx + self._crng.float(-cfg.entryJitter, cfg.entryJitter); m.fluffY = 0;
      m.Lh = m.size * (1 + cfg.stringK);
      m.fluffY = L.entryY - Math.cos(m.swing) * m.Lh;
      m.fvx = 0; m.fvy = vT * cfg.fallV0; m.fluff = 0;
      self._hang(m); self._pose(m); self._twin(m);
    });
    this._idleT = 0; this._idleGap = cfg.idleTime; this._idleN = 0;
    this._lookHopT = this._crng.float(cfg.lookHopEvery[0], cfg.lookHopEvery[1]);
    this._setState('round'); this._setPhase('enter');
    if (this.round > 0 && this.weather !== 2) this._mood('sip'); else this._mood('wave', 1.4);
    var c = this._tableCentre();
    this._emit({ type: 'round', round: this.round, topic: this.topic, surprise: cur.surprise, n: n, short: cur.short, key: cur.key, x: c.x, y: c.y });
  };

  P._ask = function (first) {
    var cfg = this.cfg, cur = this.cur;
    this._idleT = 0; this._idleGap = cfg.idleTime; this._idleN = 0;
    this._mood('talk', 1.0);
    var M = this._mouth();
    this._emit({ type: 'ask', promptKey: cur.promptKey, params: cur.params, rule: cur.rule, first: !!first, round: this.round, n: this.members.length, x: M.x, y: M.y });
    if (first && this.surprise) this._surpriseAt = this.time + this._crng.float(cfg.surpriseAt[0], cfg.surpriseAt[1]);
  };

  P._startTalk = function () {
    var rr = new FT.RNG((this.rng.next() * 4294967296) >>> 0);
    this.talk = FT.Content.makeTalk(this.topic, { age: this.age, lang: this.lang, rng: rr, level: this.level });
    this.talk.glowAnswer = false;
    this.talkAnswered = null; this._talkAskT = 0; this._talkAsks = 0;
    this.cur = null; this.phase = null;
    this._clearRound();
    this._placeMats();
    this._setState('talk');
    this._mood('talk', 1.2);
    var M = this._mouth();
    this._emit({ type: 'talk', talk: this.talk, x: M.x, y: M.y });
  };
  P.talkAnswer = function (choiceId, auto) {
    if (this.state !== 'talk' || this.talkAnswered || !this.talk) return false;
    var ok = choiceId === this.talk.answer && !auto;
    this.talkAnswered = { choiceId: choiceId, correct: ok, auto: !!auto };
    if (ok) { this.stars += 1; this.levelStars += 1; this._mood('cheer'); this._bounce(); } else this._mood(auto ? 'happy' : 'think');
    this.stateTime = 0;
    this._emit({ type: 'talkResult', correct: ok, choiceId: choiceId, answerId: this.talk.answer, auto: !!auto });
    return ok;
  };
  P._levelDone = function () { this._setState('levelDone'); this.phase = null; this._emit({ type: 'levelDone', level: this.level, stars: this.levelStars }); };

  // ---------------------------------------------------------------- input (logical px; ONE active pointer; a gesture = down … up)
  P._touch = function () { this._idleT = 0; this._idleGap = this.cfg.idleTime; };
  /**
   * pointerDown(x, y) → 'member' (play: the gesture's first contact, judged right / wrong) | 'brush' (a thing touched outside
   * play: a little hop) | 'critter' | 'moka' (poke fires on release) | 'soft' (nothing: a dust sparkle) | 'early' (enter, nothing
   * under the finger) | null (not in a round). Nearest centre wins; a critter wins only when the press is ≥ critterK × closer to
   * it than to the nearest thing.
   */
  P.pointerDown = function (x, y) {
    if (this._g || (this.state !== 'round' && this.state !== 'roundDone')) return null;
    this.finger.x = x; this.finger.y = y; this.finger.down = true;
    var L = this.layout, ph = this.phase, g = this._g = { x0: x, y0: y, x: x, y: y, t: this.time, judged: false, kind: 'gesture', maxD: 0, result: null, soft: false, contacted: false };
    this._touch();
    var play = this.interactive;
    if (play && this.assistId && inBox(L.band, x, y)) {   // assist: the next press anywhere in the table band picks the odd one
      var a = this.memberById(this.assistId), under = this._memberAt(x, y);
      if (a && a.state === 'sit') { this._contact(a, g, under ? under.id : null); return (g.result = 'member'); }
    }
    var near = this._memberNear(x, y), cr = this._critterAt(x, y);
    if (cr && (!near.m || cr.d * this.cfg.critterK < near.d)) { this._tapCritter(cr); g.kind = 'critter'; g.contacted = true; return (g.result = 'critter'); }
    var m = near.m;
    if (m) {
      if (play) { this._contact(m, g); return (g.result = 'member'); }
      g.contacted = true; this._jump(m, this.cfg.lookHopH, this.cfg.lookHopT);
      this._emit({ type: 'wiggle', id: m.id, early: true, x: m.cx, y: m.cy });
      return (g.result = 'brush');
    }
    if (inBox(L.mokaBox, x, y)) { g.kind = 'moka'; return (g.result = 'moka'); }
    if (this.state === 'round' && ph === 'enter') { this._emit({ type: 'soft', kind: 'early', x: x, y: y }); return (g.result = 'early'); }
    this._puff(x, y);
    this._emit({ type: 'soft', kind: 'table', x: x, y: y });
    g.soft = true;   // counts as a press without progress on release (play), unless the slide goes on to touch a thing
    return (g.result = 'soft');
  };
  /** A finger slide: a press that started on nothing and moves onto a thing within 0.25 s is judged on that thing. */
  P.pointerMove = function (x, y) {
    var g = this._g;
    if (!g) return;
    g.maxD = Math.max(g.maxD, hyp(x - g.x0, y - g.y0));
    this.finger.x = x; this.finger.y = y;
    if (g.soft && !g.contacted && this.time - g.t <= this.cfg.flickTime + 1e-9 && this.interactive) {
      var best = null, bs = 2;
      for (var i = 0; i < this.members.length; i++) {
        var m = this.members[i];
        if (m.state !== 'sit') continue;
        var s = segHit(g.x, g.y, x, y, m.cx, m.cy, this._hitR(m));
        if (s >= 0 && s < bs) { bs = s; best = m; }
      }
      if (best) this._contact(best, g);
    }
    g.x = x; g.y = y;
  };
  /** → 'pokeMoka' | 'up' | null */
  P.pointerUp = function (x, y) {
    var g = this._g;
    this._g = null; this.finger.down = false;
    if (!g) return null;
    if (x === undefined) { x = g.x; y = g.y; }
    var mv = Math.max(g.maxD, hyp(x - g.x0, y - g.y0));
    if (g.soft && !g.contacted && this.interactive) this._noProgress(false);
    if (g.kind === 'moka' && mv < this.cfg.tapMovePx && (this.state === 'round' || this.state === 'roundDone')) return this._pokeMoka() || 'up';
    return 'up';
  };
  /** The finger left (touchcancel / pause / rotation): the gesture ends without a judgement. */
  P.cancelDrag = function () { this._g = null; this.finger.down = false; };

  P._contact = function (m, g, from) {
    g.contacted = true; g.judged = true;
    if (from !== undefined) { this._roundAssisted = true; this._emit({ type: 'assist', id: m.id, from: from, x: m.cx, y: m.cy }); }
    if (m.odd) this._right(m); else this._wrong(m);
    return 'member';
  };
  P._right = function (m) {
    var cur = this.cur, t = m.thing;
    this._answered = true; this.streak = 0; this._touch(); this.assistId = null; this.hintHand = null;
    m._flashT = 1; m._glowT = 0;
    var ev = { type: 'right', id: m.id, thing: t, rule: cur.rule, misses: this.misses, lantern: this.round, x: m.cx, y: m.cy };
    if (t.kind === 'plate') ev.count = { n: t.n, others: cur.rule.value };
    if (cur.rule.kind === 'home') ev.home = t.home;
    this._mood('happy', 1.2); this._bounce();
    this._lookX = m.cx; this._lookT = 1.5;
    this._emit(ev);
    m.state = 'rise'; m._rs = 'wait'; m._rt = 0; m.vx = 0; m.vy = 0; m._jumpT = -1; m.jump = 0;
    this._fairyTo(m);
    this._setPhase('rise');
  };
  P._wrong = function (m) {
    var cfg = this.cfg, cur = this.cur, t = m.thing;
    var dir = m.cx < this._tableCentre().x ? 1 : -1;
    m.rotV += dir * kickFor(cfg.wigPeak, cfg.wigOmega, cfg.wigZeta);
    this._jump(m, cfg.wrongHop, cfg.wrongHopT);
    this._lookX = m.cx; this._lookT = 1.2;
    if (this.time - m._lastWrongT < cfg.sameWrongWindow) {   // the same thing again within 1 s: just wiggles
      m._lastWrongT = this.time;
      this._emit({ type: 'wiggle', id: m.id, repeat: true, x: m.cx, y: m.cy });
      return;
    }
    m._lastWrongT = this.time;
    this.misses++; this.streak++;
    this._mood('oops');
    var ev = { type: 'wrong', id: m.id, thing: t, got: { nameKind: t.nameKind, nameValue: t.nameValue }, want: { kind: cur.rule.kind, value: cur.rule.value,
      nameKind: cur.rule.nameKind, promptKey: cur.promptKey, params: cur.params }, streak: this.streak, misses: this.misses, x: m.cx, y: m.cy };
    this._emit(ev);
    var h0 = this._lastHintT;
    this._noProgress(true);
    if (this._lastHintT !== h0) ev.hint = true;   // this miss triggered the hint
  };
  P._noProgress = function (miss) {
    var cfg = this.cfg;
    this._noProg++;
    if ((miss && this.misses >= cfg.hintAfterMisses) || this._noProg >= cfg.hintAfterSoft) this._autoHint(false);
    if (this._noProg >= cfg.assistAfter && !this.assistId) {
      var a = this.odd;
      if (a && a.state === 'sit') { this.assistId = a.id; this._emit({ type: 'assistArmed', id: a.id, x: a.cx, y: a.cy }); }
    }
  };
  P._pokeMoka = function () {
    var M = this._mouth(), a = this.prompt();
    this._touch();
    this._mood('talk', 1.0); this._bounce();
    var ev = { type: 'pokeMoka', x: M.x, y: M.y };
    if (a) { ev.promptKey = a.promptKey; ev.params = a.params; ev.rule = a.rule; } else ev.busy = true;
    this._emit(ev);
    return 'pokeMoka';
  };
  P._puff = function (x, y) { this.puffs.push({ x: x, y: y, t: 0, T: this.cfg.puffTime, r: 14, alpha: 1, _px: x, _py: y }); };

  // ---------------------------------------------------------------- help
  P.resetNudges = function () {
    this._idleT = 0; this._idleGap = this.cfg.idleTime; this._idleN = 0;
    this._talkAskT = 0; this._talkAsks = 0;
    if (this.talk) this.talk.glowAnswer = false;
  };
  P._glowing = function () { for (var i = 0; i < this.members.length; i++) if (this.members[i]._glowT > 0) return true; return false; };
  P._autoHint = function (fromIdle) {
    if (this._glowing() || this.hintHand || this.time - this._lastHintT < this.cfg.hintCooldown) return null;
    return this._doHint(fromIdle);
  };
  P._doHint = function (fromIdle) {
    var m = this.odd, cfg = this.cfg, cur = this.cur;
    if (!m || !this.interactive || m.state !== 'sit') return null;
    m._glowT = cfg.hintTime;
    this.hintHand = { id: m.id, mode: 'tap', x: m.cx, y: m.cy, _px: m.cx, _py: m.cy, t: 0, press: 0, alpha: 0, time: 0, T: cfg.hintTime };
    this._stepHint(0);
    this._lastHintT = this.time;
    this._mood('point', cfg.hintTime);
    var ev = { type: 'hint', id: m.id, mode: 'tap', x: m.cx, y: m.cy, want: { kind: cur.rule.kind, value: cur.rule.value, nameKind: cur.rule.nameKind, promptKey: cur.promptKey, params: cur.params } };
    if (fromIdle) ev.idle = true;
    this._emit(ev);
    return { member: m.id };
  };
  /** Manual hint (a tap on the bubble): the odd one glows + the ghost hand taps it. */
  P.hint = function () {
    if (!this.interactive) return null;
    if (this.hintHand) return { member: this.hintHand.id };
    return this._doHint(false);
  };
  /** Ghost hand (1.6 s cycle): glides in from below-right, taps the target twice, drifts back fading. Fingertip = (x, y). */
  P._stepHint = function (h) {
    var H = this.hintHand, cfg = this.cfg;
    if (!H) return;
    H.time += h;
    var m = this.memberById(H.id);
    if (!m || m.state !== 'sit' || H.time >= H.T || !this.interactive) { this.hintHand = null; return; }
    var tx = m.cx + 6, ty = m.cy + 10;
    var u = (H.time % cfg.hintCycle) / cfg.hintCycle, ox = tx + 64, oy = ty + 104, x, y, press = 0, fade = 1;
    if (u < 0.25) { var v = smooth(u / 0.25); x = lerp(ox, tx, v); y = lerp(oy, ty, v); }
    else if (u < 0.65) { var k = (u - 0.25) / 0.2, tap = Math.sin(Math.PI * (k % 1)); press = tap; x = tx; y = ty + 8 * (1 - tap); }
    else { var w2 = smooth((u - 0.65) / 0.35); x = lerp(tx, ox, w2); y = lerp(ty, oy, w2); fade = 1 - 0.9 * w2; }
    H.alpha = clamp(H.time / 0.25, 0, 1) * clamp((H.T - H.time) / 0.35, 0, 1) * fade;
    H.x = x; H.y = y; H.t = u; H.press = press;
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
  P._twin = function (m) {
    m._px = m.x; m._py = m.y; m._plift = m.lift; m._prot = m.rot; m._psx = m.sx; m._psy = m.sy; m._pscale = m.scale;
    m._pfluffX = m.fluffX; m._pfluffY = m.fluffY; m._palpha = m.alpha; m._pfluff = m.fluff;
  };
  P._twins = function () {
    var i, o;
    for (i = 0; i < this.members.length; i++) this._twin(this.members[i]);
    for (i = 0; i < this.mats.length; i++) this.mats[i]._ppop = this.mats[i].pop;
    for (i = 0; i < this.puffs.length; i++) { o = this.puffs[i]; o._px = o.x; o._py = o.y; }
    var g = this.garland; g._ptwinkle = g.twinkle;
    for (i = 0; i < g.lanterns.length; i++) { o = g.lanterns[i]; o._plit = o.lit; o._pswing = o.swing; }
    if (g.badge) g.badge._pa = g.badge.a;
    var f = this.fairy; f._px = f.x; f._py = f.y;
    var c = this.critter;
    if (c) { c._px = c.x; c._py = c.y; if (c.fairies) c.fairies.forEach(function (q) { q._px = q.x; q._py = q.y; }); }
    if (this.hintHand) { this.hintHand._px = this.hintHand.x; this.hintHand._py = this.hintHand.y; }
    this.table._pspring = this.table.spring;
    this.moka._pbounce = this.moka.bounce;
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
        } else if (this._talkAsks >= cfg.talkMaxAsks && this._talkAskT >= cfg.talkGiveUp - 1e-9) this.talkAnswer(this.talk.answer, true);   // Moka answers
        break;
      case 'levelDone':
        if (this.stateTime >= cfg.levelDoneTime) {
          if (this.level < this.levels.length - 1) this.startLevel(this.level + 1);
          else {
            this._setState('sessionDone'); this.phase = null;
            this.lastTopics = this.levels.slice();
            this._emit({ type: 'sessionDone', stars: this.stars });
          }
        }
        break;
    }
    if (this.state === 'round' || this.state === 'roundDone') { this._stepMembers(h); this._stepCritter(h); this._stepHint(h); }
    this._stepTable(h); this._stepGarland(h); this._stepFairy(h); this._stepPuffs(h); this._stepMoka(h);
  };

  P._stepRound = function (h) {
    var cfg = this.cfg;
    switch (this.phase) {
      case 'enter': {
        var all = this.members.every(function (m) { return m.state === 'sit'; }), lastLand = -1e9;
        this.members.forEach(function (m) { lastLand = Math.max(lastLand, m._landT); });
        if (this.phaseTime >= cfg.enterMin && all && this.time - lastLand >= cfg.settleTime - 1e-9) { this._setPhase('play'); this._ask(true); }
        break;
      }
      case 'play':
        if (!this._g) {
          this._idleT += h;
          if (this._idleT >= this._idleGap - 1e-9) {
            this._idleT = 0; this._idleGap = Math.min(cfg.idleMax, this._idleGap * cfg.idleBackoff); this._idleN++;
            this._mood('think');
            var M = this._mouth();
            this._emit({ type: 'idle', n: this._idleN, promptKey: this.cur.promptKey, params: this.cur.params, rule: this.cur.rule, x: M.x, y: M.y });
            if (this._idleN >= cfg.idleHintFrom) this._autoHint(true);
          }
        }
        // a sitting thing now and then does a little look-around hop (cosmetic)
        this._lookHopT -= h;
        if (this._lookHopT <= 0) {
          this._lookHopT = this._crng.float(cfg.lookHopEvery[0], cfg.lookHopEvery[1]);
          var st = this.members.filter(function (m) { return m.state === 'sit' && m._jumpT < 0; });
          if (st.length) this._jump(this._crng.pick(st), cfg.lookHopH, cfg.lookHopT);
        }
        break;
      case 'rise':
        if (this._lanternT >= 0 && this.time >= this._lanternT + cfg.lanternHold - 1e-9) this._roundDone();
        break;
    }
  };
  P._starsFor = function (m) { return m <= 0 ? 3 : m === 1 ? 2 : 1; };
  P._roundDone = function () {
    var st = this._starsFor(this.misses), cur = this.cur;
    if (this._roundAssisted) st = Math.min(st, 2);   // an assisted round ≤ 2★
    this.roundStars = st; this.stars += st; this.levelStars += st;
    var rk = cur.rule;
    this._prevRuleRun = this._prevRule && this._prevRule.kind === rk.kind && String(this._prevRule.value) === String(rk.value) ? this._prevRuleRun + 1 : 1;
    this._prevRule = { kind: rk.kind, value: rk.value }; this._prevOddSlots = [cur.oddSlot].concat(this._prevOddSlots).slice(0, 2);
    this.cancelDrag(); this.hintHand = null; this.assistId = null; this._lanternT = -1;
    this._setState('roundDone');
    var c = this._tableCentre();
    this._emit({ type: 'roundDone', round: this.round, stars: st, misses: this.misses, assisted: !!this._roundAssisted, x: c.x, y: c.y });
    this._startChime();
  };
  /** chime: the remaining things hop one after another left → right, each ringing a rising bell note. */
  P._startChime = function () {
    var ms = this.members.filter(function (m) { return m.state === 'sit'; }).sort(function (a, b) { return a.x - b.x; });
    this._chime = { list: ms.map(function (m) { return m.id; }), i: 0 };
    this._setPhase('chime');
    this._mood('happy', 1.4);
    if (this.critter && this.critter.kind === 'butterfly' && this.critter.state === 'sit') this._butterflyOut();
  };
  P._chimeEnd = function () { var c = this.cfg, n = this._chime ? this._chime.list.length : 0; return Math.max(0, n - 1) * c.chimeGap + c.chimeHopT + c.chimeTail; };
  P._stepRoundDone = function () {
    var cfg = this.cfg, self = this;
    if (this.phase === 'chime') {
      var C = this._chime;
      while (C && C.i < C.list.length && this.phaseTime >= C.i * cfg.chimeGap - 1e-9) {
        var m = this.memberById(C.list[C.i]);
        if (m && m.state === 'sit') {
          this._jump(m, cfg.chimeHop, cfg.chimeHopT); m.q = -cfg.chimeLand * 0.75; m.qV = 0; m.ring = 1; m.hop = 1;
          this._emit({ type: 'chime', i: C.i, n: C.list.length, id: m.id, x: m.cx, y: m.cy });
        }
        C.i++;
      }
      if (this.phaseTime >= this._chimeEnd() - 1e-9) {
        this._setPhase('cheers');
        this._mood('cheer', cfg.cheersTime + 0.2); this._bounce();
        var cu = this.layout.moka.cupUp;
        this._emit({ type: 'cheers', round: this.round, x: cu.x, y: cu.y });
        this._fairyLoop();
      }
    } else if (this.phase === 'cheers') {
      if (this.phaseTime >= cfg.cheersTime - 1e-9) {
        this._setPhase('clear');
        this._critterLeave();
        var ms = this.members.filter(function (q) { return q.state === 'sit'; }), x0 = 1e9, x1 = -1e9;
        ms.forEach(function (q) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); });
        this._poofs = ms.map(function (q) { return { id: q.id, at: cfg.poofDelay + cfg.poofSweep * (x1 > x0 ? (q.x - x0) / (x1 - x0) : 0) }; });
      }
    } else if (this.phase === 'clear') {
      (this._poofs || []).forEach(function (p) {
        var q = self.memberById(p.id);
        if (q && q.state === 'sit' && self.phaseTime >= p.at - 1e-9) {
          q.state = 'poof'; q._rt = 0; q.hop = 0;
          self._emit({ type: 'poof', id: q.id, x: q.cx, y: q.cy });
        }
      });
      if (this.phaseTime >= cfg.clearTime - 1e-9 && this.members.every(function (q) { return q.state !== 'poof' && q.state !== 'sit'; })) this._afterClear();
    }
  };
  /** After the clear: the next round, or (round 4 / the chapter ran past 75 s with ≥ 3 rounds) the garland twinkles, then Talk. */
  P._afterClear = function () {
    var cfg = this.cfg, g = this.garland, L = this.layout, self = this;
    var nxt = this.round + 1, el = this.time - this.levelStartTime, long = nxt >= cfg.chapterMinRounds && el > cfg.chapterTimeLimit;
    if (nxt < this.roundsPerLevel && !long) { this._clearRound(true); this.cur = null; this.round = nxt; this._beginRound(); return; }
    if (this._garlandAt < 0) {
      this._garlandAt = this.time;
      // a chapter cut short by the time limit: the fairy lights the lanterns that are still dark (gold), so the garland is full
      g.lanterns.forEach(function (q, i) {
        if (q.target) return;
        q.target = 1; q.color = null; q.thing = null; q.swingV += kickFor(cfg.lswingKick, cfg.lswingOmega, cfg.lswingZeta);
        self._emit({ type: 'lantern', i: i, x: q.cx, y: q.cy, color: null, thing: null, auto: true });
      });
      g.lit = 4;
      this._mood('cheer', cfg.garlandFullTime);
      this._emit({ type: 'garlandFull', n: 4, x: (L.garland.x0 + L.garland.x1) / 2, y: L.garland.y + L.garland.sag });
      return;
    }
    if (this.time - this._garlandAt >= cfg.garlandFullTime - 1e-9) {
      this._clearRound(true); this.cur = null; this.round = nxt;
      if (nxt < this.roundsPerLevel) this.roundsPerLevel = nxt;
      this._startTalk();
    }
  };

  // ---------------------------------------------------------------- things
  P._jump = function (m, H, T) { m._jumpT = 0; m._jumpH = H; m._jumpDur = T; };
  P._land = function (m) {
    var cfg = this.cfg, L = this.layout, mat = this.mats[m.slot];
    m.state = 'sit'; m.y = L.table.y;
    m.tilt = -m.swing; m.tiltV = -m.swingV; m.rot = m.tilt; m.swing = 0; m.swingV = 0;
    m.vx = m.fvx * 0.3; m.vy = 0;
    var vImp = m.fvy;
    m.qV += kickFor(cfg.squashLand * clamp(vImp / cfg.landRef, 0.8, 1.15), cfg.squashOmega, cfg.squashZeta);
    var mass = cfg.mass[m.thing.kind] || 0.8;
    this.table.springV += kickFor(cfg.tableKick * mass * clamp(vImp / cfg.landRef, 0.6, 1.5), cfg.tableOmega, cfg.tableZeta);
    if (mat) mat.popV += kickFor(1, cfg.matOmega, cfg.matZeta);
    // the fluff lets go and drifts away up-left
    m.fluffVX = cfg.fluffAwayV[0] + m.fvx * 0.3 - 30 * this.wind; m.fluffVY = cfg.fluffAwayV[1];
    m._fluffT = 0; m._landT = this.time;
    this._pose(m);
    this._emit({ type: 'land', id: m.id, i: m.slot, x: m.x, y: m.y, kind: m.thing.kind });
  };
  P._stepFall = function (m, h) {
    var cfg = this.cfg, L = this.layout;
    if (!m._spawned) {
      if (this.phaseTime < m._spawnAt) { this._hang(m); return; }
      m._spawned = true;
      this._emit({ type: 'fall', id: m.id, i: m.slot, x: m.tx, y: Math.max(0, L.ins.top) });
    }
    m.fluff = Math.min(1, m.fluff + h * 4);
    // vertical: first-order drag towards the terminal speed; the parachute flares near the table (soft landing)
    var rem = L.table.y - m.y, bd = cfg.brakeK * m._vT, vt = rem < bd ? lerp(cfg.landV, m._vT, clamp(rem / bd, 0, 1)) : m._vT;
    m.fvy += (vt - m.fvy) * Math.min(1, cfg.fallDrag * h);
    // horizontal: the fluff drifts back over its placemat on a soft spring, the breeze pushes it
    var ax = cfg.driftOmega * cfg.driftOmega * (m.tx - m.fluffX) - 2 * cfg.driftZeta * cfg.driftOmega * m.fvx + cfg.windPush * this.wind;
    m.fvx += ax * h;
    m.fluffX += m.fvx * h; m.fluffY += m.fvy * h;
    // the pendulum under the fluff: damped spring + the pivot's acceleration + breeze / per-thing flutter
    var w = cfg.swingOmega, z = cfg.swingZeta;
    var drive = cfg.swingDrive * Math.sin(TAU * m._swHz * this.time + m._ph) + cfg.swingWind * this.wind * (0.7 + 0.3 * Math.sin(1.3 * this.time + m._ph)) - cfg.swingAccK * ax / Math.max(1, m.Lh);
    m.swingV += (-w * w * m.swing - 2 * z * w * m.swingV + drive) * h;
    m.swing += m.swingV * h;
    this._hang(m);
    if (m.y >= L.table.y) this._land(m);
  };
  /** The lantern target of a rising thing: bottom y such that its body centre (at the final scale) is the lantern's centre. */
  P._riseTarget = function (m, keep) {
    var L = this.layout, cfg = this.cfg, q = L.garland.lanterns[clamp(this.round, 0, 3)];
    var dh = m.size * (this._little(m) ? cfg.littleK : 1) * cfg.riseScale;
    m._xT = q.cx; m._yT = q.cy + dh / 2;
    if (keep || m._y0 === undefined) { m._x0 = m.x; m._y0 = m.y; m._s0 = m.scale; }
    m._vR = clamp((m._y0 - m._yT) / cfg.riseTime, cfg.riseV[0], cfg.riseV[1]);
  };
  P._stepRise = function (m, h) {
    var cfg = this.cfg, L = this.layout;
    m._rt += h;
    if (m._rs === 'wait' || m._rs === 'circle' || m._rs === 'count') {
      // levitate a little above the placemat while the fairy circles (gentle bob)
      var lv = cfg.levitate * smooth((m._rs === 'wait' ? 0 : m._lvT += h) / cfg.levitateT);
      if (m._rs === 'wait') m._lvT = 0;
      m.lift = lv + (lv > 0 ? cfg.levBob * Math.sin(TAU * 1.4 * this.time) * smooth(m._lvT / cfg.levitateT) : 0);
      m.x += (m.tx - m.x) * Math.min(1, h * 6); m.y = L.table.y;
      if (m._rs === 'count') {
        if (m.count < m.thing.n && this.time >= m._countAt) {
          var k = Math.min(m.thing.n, Math.floor((this.time - m._countAt) / cfg.countStep + 1e-9) + 1);
          if (k > m.count) {
            m.count = k;
            m.qV += kickFor(0.04, cfg.squashOmega, cfg.squashZeta);
            this._pose(m);
            this._emit({ type: 'count', id: m.id, i: k, n: m.thing.n, x: m.cx, y: m.cy });
            if (k >= m.thing.n) m._countDoneT = this.time;
          }
        }
        if (m._countDoneT >= 0 && this.time >= m._countDoneT + cfg.countTail) this._startFloat(m);
      }
      return;
    }
    if (m._rs !== 'float') return;
    m._ft += h;
    var rem = m.y - m._yT, slow = clamp(rem / cfg.arriveSlow, 0.3, 1);
    m.vy += (-m._vR * slow - m.vy) * Math.min(1, cfg.riseDrag * h);
    m.y += m.vy * h;
    var u = clamp((m._y0 - m.y) / Math.max(1, m._y0 - m._yT), 0, 1), env = (1 - u) * smooth(m._ft / 0.4);
    var base = lerp(m._x0, m._xT, smooth(u));
    m.x = base + cfg.swayAmp * Math.sin(TAU * cfg.swayHz * m._ft) * env;
    m.spin = cfg.riseSpin * Math.sin(TAU * 0.7 * m._ft + 0.5) * env;
    m.scale = lerp(m._s0, cfg.riseScale, smooth(u));
    if (m.y <= m._yT + 0.5) this._intoLantern(m);
  };
  P._startFloat = function (m) {
    m._rs = 'float'; m._ft = 0;
    m.y -= m.lift; m.lift = 0; m.vy = 0;
    this._riseTarget(m, true);
    this._fairy('lead');
    this._emit({ type: 'rise', id: m.id, x: m.cx, y: m.cy });
  };
  P._intoLantern = function (m) {
    var cfg = this.cfg, g = this.garland, i = clamp(this.round, 0, 3), q = g.lanterns[i], t = m.thing;
    m.state = 'lantern'; m.x = m._xT; m.y = m._yT; m.vy = 0; m.glow = 0; m.spin = 0;
    q.target = 1; q.color = t.color || null; q.thing = t; q.home = this.cur && this.cur.rule.kind === 'home' ? t.home : null;
    q.swingV += (m.x >= q.x ? 1 : -1) * kickFor(cfg.lswingKick, cfg.lswingOmega, cfg.lswingZeta);
    g.lit = Math.max(g.lit, i + 1);
    if (q.home) g.badge = { home: q.home, i: i, a: 0, _pa: 0, t: 0, x: q.cx, y: q.cy + cfg.lanternH / 2 + 40 };
    this._lanternT = this.time;
    this._fairyBack();
    this._emit({ type: 'lantern', i: i, x: q.cx, y: q.cy, color: q.color, thing: t, home: q.home || undefined });
  };
  P._stepMembers = function (h) {
    var cfg = this.cfg, L = this.layout, self = this;
    for (var i = 0; i < this.members.length; i++) {
      var m = this.members[i];
      // a fluff that let go drifts up-left and fades (also after its thing is gone)
      if (m.state !== 'fall' && m.fluff > 0) {
        m._fluffT += h; m.fluffX += m.fluffVX * h; m.fluffY += m.fluffVY * h; m.fluffVY -= 8 * h;
        m.fluff = Math.max(0, 1 - m._fluffT / cfg.fluffFade);
      }
      if (m.state === 'gone' || m.state === 'lantern') continue;
      if (m.state === 'fall') { this._stepFall(m, h); this._pose(m); continue; }
      if (m.state === 'rise') this._stepRise(m, h);
      var sitting = m.state === 'sit' || m.state === 'poof';
      if (sitting) {
        // spring to the slot (only moves after a rotation / resize), speed-capped
        m.vx += (cfg.sitOmega * cfg.sitOmega * (m.tx - m.x) - 2 * cfg.sitZeta * cfg.sitOmega * m.vx) * h;
        m.vx = clamp(m.vx, -cfg.sitVMax, cfg.sitVMax);
        m.x += m.vx * h; m.y = L.table.y;
      }
      // ---- tilt (landing wobble settles; breezy: a gentle sway), wiggle, squash, hops, breathing, glow
      var tiltT = sitting ? cfg.breezeRot * this.wind * Math.sin(TAU * cfg.breezeHz * this.time + m._ph) : 0;
      spring(m, 'tilt', 'tiltV', tiltT, cfg.tiltOmega, cfg.tiltZeta, h);
      m.rotV += (-cfg.wigOmega * cfg.wigOmega * m.wig - 2 * cfg.wigZeta * cfg.wigOmega * m.rotV) * h; m.wig += m.rotV * h;
      spring(m, 'q', 'qV', 0, cfg.squashOmega, cfg.squashZeta, h); m.q = clamp(m.q, -cfg.qMax, cfg.qMax);
      m.rot = m.tilt + m.wig + m.spin;
      if (m._jumpT >= 0) {
        m._jumpT += h; var uj = m._jumpT / m._jumpDur;
        if (uj >= 1) { m._jumpT = -1; m.jump = 0; m.qV += kickFor(m.ring > 0 ? cfg.chimeLand : 0.05, cfg.squashOmega, cfg.squashZeta); m._hopHold = cfg.chimeHopHold; }
        else m.jump = m._jumpH * 4 * uj * (1 - uj);
      }
      if (m.state !== 'rise') m.lift = m.jump;
      if (m.hop && m._jumpT < 0) { m._hopHold -= h; if (m._hopHold <= 0) m.hop = 0; }
      if (m.ring > 0) m.ring = Math.max(0, m.ring - h / cfg.chimeRing);
      var still = m.state === 'sit' && m._jumpT < 0 && Math.abs(m.vx) < 20;
      m._breathK = clamp(m._breathK + (still ? h : -h) * 3, 0, 1);
      m.breath = cfg.breathAmp * Math.sin(TAU * cfg.breathHz * this.time + m._ph) * m._breathK;
      var bk = m.breath / Math.max(1, m.size);
      m.sx = 1 + cfg.squashSxK * m.q - 0.5 * bk; m.sy = 1 - m.q + bk;
      if (m.state === 'poof') {
        m._rt += h; var up = clamp(m._rt / cfg.poofTime, 0, 1);
        m.scale = 1 - smooth(up); m.lift = m.jump + cfg.poofLift * up; m.alpha = 1 - up * up;
        if (up >= 1) { m.state = 'gone'; m.scale = 0; m.alpha = 0; }
      }
      if (m._glowT > 0) m._glowT = Math.max(0, m._glowT - h);
      if (m._flashT > 0) m._flashT = Math.max(0, m._flashT - h * 0.6);
      var gT = this.assistId === m.id ? 1 : m._glowT > 0 ? 0.55 + 0.45 * Math.sin(TAU * 1.6 * this.time) : 0;
      if (m.state === 'rise') gT = Math.max(gT, 0.7 + 0.3 * Math.sin(TAU * 2 * this.time));
      gT = Math.max(gT, m._flashT);
      m.glow += (gT - m.glow) * Math.min(1, h * (gT > m.glow ? 10 : 4));
      this._pose(m);
    }
    void self;
  };
  P._stepTable = function (h) {
    var c = this.cfg, t = this.table;
    spring(t, 'spring', 'springV', 0, c.tableOmega, c.tableZeta, h);
    for (var i = 0; i < this.mats.length; i++) spring(this.mats[i], 'pop', 'popV', 0, c.matOmega, c.matZeta, h);
  };
  P._stepGarland = function (h) {
    var c = this.cfg, g = this.garland, self = this;
    g.lanterns.forEach(function (q, i) {
      spring(q, 'lit', 'litV', q.target || 0, c.lanternOmega, c.lanternZeta, h);
      if (q.lit < 0) { q.lit = 0; q.litV = 0; }
      var drive = c.lswingWind * self.wind * Math.sin(1.1 * self.time + i * 1.7);
      q.swingV += (-c.lswingOmega * c.lswingOmega * q.swing - 2 * c.lswingZeta * c.lswingOmega * q.swingV + drive) * h;
      q.swing += q.swingV * h;
    });
    if (g.badge) {
      g.badge.t += h;
      var b = g.badge, T = c.badgeTime;
      b.a = clamp(Math.min(b.t / c.badgeFade, (T - b.t) / c.badgeFade), 0, 1);
      if (b.t >= T) g.badge = null;
    }
    var tw = this._garlandAt >= 0 ? 1 : 0;
    g.twinkle += (tw - g.twinkle) * Math.min(1, h * (tw ? 6 : 2));
  };
  P._stepPuffs = function (h) {
    for (var i = this.puffs.length - 1; i >= 0; i--) {
      var p = this.puffs[i]; p.t += h;
      var u = p.t / p.T; p.alpha = 1 - u; p.r = 14 + 22 * smooth(u);
      if (u >= 1) this.puffs.splice(i, 1);
    }
  };

  // ---------------------------------------------------------------- the fairy
  P._fairy = function (st) { this.fairy.state = st; this.fairy.t = 0; };
  P._fairyRest = function (snap) {
    var H = this.layout.fairyHome, f = this.fairy;
    this._fairy('rest'); f.id = null; f.sprinkle = 0;
    if (snap) { f.x = f._px = H.x; f.y = f._py = H.y; }
  };
  /** The point just above a thing's top where the fairy arrives. */
  P._fairyTarget = function (m) { return { x: m.cx, y: m.cy - this._drawH(m) / 2 - 18 }; };
  P._fairyTo = function (m) {
    var f = this.fairy, cfg = this.cfg;
    this._fairy('fly'); f.id = m.id; f._x0 = f.x; f._y0 = f.y; f._T = cfg.fairyFly;
    this._emit({ type: 'fairyFly', id: m.id, x: f.x, y: f.y });
  };
  P._fairyBack = function () { var f = this.fairy; this._fairy('back'); f._x0 = f.x; f._y0 = f.y; f._T = this.cfg.fairyBack; f.sprinkle = 0; };
  P._fairyLoop = function () {
    var f = this.fairy;
    if (f.state !== 'rest') return;
    this._fairy('loop'); f._T = this.cfg.loopTime;
  };
  P._stepFairy = function (h) {
    var f = this.fairy, cfg = this.cfg, L = this.layout, H = L.fairyHome, px = f.x, py = f.y, m = f.id ? this.memberById(f.id) : null, u, p;
    f.t += h;
    switch (f.state) {
      case 'rest':
        f.x += (H.x - f.x) * Math.min(1, h * 8);
        f.y += (H.y + cfg.fairyBob * Math.sin(TAU * 0.8 * this.time) - f.y) * Math.min(1, h * 8);
        break;
      case 'fly': {
        if (!m) { this._fairyBack(); break; }
        var T = this._fairyTarget(m);
        u = smooth(f.t / f._T);
        p = bez(f._x0, f._y0, (f._x0 + T.x) / 2, Math.min(f._y0, T.y) - cfg.fairyArc, T.x, T.y, u);
        f.x = p.x; f.y = p.y;
        if (f.t >= f._T) {
          this._fairy('circle'); f._T = cfg.fairyCircle; f._dust = 0;
          m._rs = 'circle'; m._lvT = 0;
          this._emit({ type: 'fairyArrive', id: m.id, x: f.x, y: f.y });
        }
        break;
      }
      case 'circle': {
        if (!m) { this._fairyBack(); break; }
        u = clamp(f.t / f._T, 0, 1);
        var R = this._hitR(m) - L.hitPad + 8, a = -Math.PI / 2 + TAU * smooth(u);
        f.x = m.cx + Math.cos(a) * R; f.y = m.cy + Math.sin(a) * R * 0.8;
        f.sprinkle = 1;
        var k = Math.floor(u * cfg.dustN + 1e-9);
        while (f._dust < Math.min(cfg.dustN, k + 1) && u >= f._dust / cfg.dustN) { f._dust++; this._emit({ type: 'dust', id: m.id, x: f.x, y: f.y + 8 }); }
        if (f.t >= f._T) {
          this._fairy('lead'); f.sprinkle = 0;
          if (m.thing.kind === 'plate') { m._rs = 'count'; m.count = 0; m._countAt = this.time + cfg.countDelay; m._countDoneT = -1; }
          else this._startFloat(m);
        }
        break;
      }
      case 'lead': {
        if (!m) { this._fairyBack(); break; }
        var tg = this._fairyTarget(m);
        tg.y -= m._rs === 'float' ? cfg.fairyLead * m.scale : 6;
        if (!f.vx) f.vx = 0; if (!f.vy) f.vy = 0;
        f.vx += (cfg.fairyOmega * cfg.fairyOmega * (tg.x - f.x) - 2 * cfg.fairyZeta * cfg.fairyOmega * f.vx) * h;
        f.vy += (cfg.fairyOmega * cfg.fairyOmega * (tg.y - f.y) - 2 * cfg.fairyZeta * cfg.fairyOmega * f.vy) * h;
        f.x += f.vx * h; f.y += f.vy * h;
        f.sprinkle = m._rs === 'count' ? 0.6 : 0;
        break;
      }
      case 'back':
        u = smooth(f.t / f._T);
        p = bez(f._x0, f._y0, (f._x0 + H.x) / 2, Math.min(f._y0, H.y) - cfg.fairyArc * 0.6, H.x, H.y, u);
        f.x = p.x; f.y = p.y;
        if (f.t >= f._T) { this._fairyRest(false); f.vx = 0; f.vy = 0; }
        break;
      case 'loop': {
        u = clamp(f.t / f._T, 0, 1);
        var an = Math.PI / 2 - TAU * smooth(u);
        f.x = H.x + Math.cos(an) * cfg.loopR; f.y = H.y - cfg.loopR + Math.sin(an) * cfg.loopR;
        if (f.t >= f._T) this._fairyRest(false);
        break;
      }
    }
    var dx = f.x - px;
    if (Math.abs(dx) > 0.15) f.face = dx > 0 ? 1 : -1;
    f.flapPh += h * (f.state === 'rest' ? cfg.flapRest : cfg.flapFly);
    f.flap = (f.flapPh % 1) < 0.5 ? 0 : 1;
    void py;
  };

  // ---------------------------------------------------------------- critters (one round per chapter)
  P._critterLeaving = function () { var c = this.critter; return !!c && (c.state === 'fly' || c.state === 'out'); };
  /** Sitting things other than the odd one (where the butterfly may land), slot order. */
  P._perches = function () { return this.members.filter(function (m) { return m.state === 'sit' && !m.odd; }); };
  P._spawnCritter = function () {
    var cfg = this.cfg, L = this.layout, T = L.table, k = this.surprise, r = this._crng, c;
    if (!k || this.critter) return;
    if (k === 'ladybug') {
      var sl = slotsFor(L, this.members.length, cfg), gaps = [];
      for (var i = 1; i < sl.length; i++) gaps.push((sl[i].x + sl[i - 1].x) / 2);
      var stopX = gaps.length ? gaps[Math.floor(gaps.length / 2)] : (T.x0 + T.x1) / 2;
      c = { kind: 'ladybug', x: T.plankX1 - 10, y: T.y + cfg.ladybug.dy, face: -1, step: 0, stepT: 0, state: 'walk', t: 0, open: 0, stopX: stopX, stopped: false, _f: null };
    } else if (k === 'butterfly') {
      var ps = this._perches();
      if (!ps.length) return;
      var on = r.pick(ps), sx = L.W + 60, sy = L.garland.y + 20;
      c = { kind: 'butterfly', x: sx, y: sy, face: -1, flap: 0, flapPh: 0, state: 'in', t: 0, onId: on.id, _x0: sx, _y0: sy, _T: cfg.butterfly.inT, sitT: 0 };
    } else if (k === 'snail') {
      var lx = T.legs[1];
      c = { kind: 'snail', x: lx, y: T.legBottom - 4, face: 1, state: 'in', t: 0, peek: 0, show: 0, legX: lx, stay: 0 };
    } else if (k === 'fairies') {
      var fs = [];
      for (var j = 0; j < cfg.fairies.n; j++) { var fx = r.float(L.garland.x0, L.garland.x1); fs.push({ x: fx, y: -30, _px: fx, _py: -30, sx: fx, sy: -30, ph: r.float(0, TAU), twirl: 0, twirlT: 0, glow: 0, flap: 0, i: j }); }
      c = { kind: 'fairies', x: fs[0].x, y: fs[0].y, state: 'in', t: 0, fairies: fs };
    }
    c._px = c.x; c._py = c.y;
    this.critter = c;
    this._stepCritter(0);
    var hc = this.critterHit() || c;
    this._emit({ type: 'critter', kind: k, x: hc.x, y: hc.y });
  };
  P._tapCritter = function (cr) {
    var c = this.critter, cfg = this.cfg, h = this.critterHit() || { x: c.x, y: c.y };
    if (!c) return;
    var ev = { type: 'critterTap', kind: c.kind, x: h.x, y: h.y };
    if (c.kind === 'ladybug') { c.state = 'fly'; c.t = 0; c.open = 1; c._f = { x0: c.x, y0: c.y, x1: c.x + (c.x < this.layout.W / 2 ? -1 : 1) * 260, y1: -80 }; }
    else if (c.kind === 'butterfly') { c.state = 'loop'; c.t = 0; c._cx = c.x; c._cy = c.y - cfg.butterfly.loopR; }
    else if (c.kind === 'snail') { c.state = 'peek'; c.t = 0; c.peek = 1; c.stay = Math.min(c.stay, cfg.snail.stay - cfg.snail.peekT - 1); }
    else if (c.kind === 'fairies') { var f = c.fairies[cr.i]; f.twirlT = cfg.fairies.twirlT; f.glow = 1.6; ev.i = cr.i; ev.x = f.x; ev.y = f.y; }
    this._emit(ev);
  };
  /** The round is clearing: a critter still around says goodbye (flies / slides away). */
  P._critterLeave = function () {
    var c = this.critter;
    if (!c || this._critterLeaving()) return;
    if (c.kind === 'ladybug') { c.state = 'fly'; c.t = 0; c.open = 1; c._f = { x0: c.x, y0: c.y, x1: c.x + 220, y1: -80 }; }
    else if (c.kind === 'butterfly') { if (c.state !== 'gone') this._butterflyOut(); }
    else { c.state = 'out'; c.t = 0; c.face = -1; }
  };
  P._butterflyOut = function () { var c = this.critter; c.state = 'out'; c.t = 0; c._x0 = c.x; c._y0 = c.y; c._T = this.cfg.butterfly.outT; };
  P._critterRelayout = function () {
    var c = this.critter, L = this.layout, T = L.table, cfg = this.cfg;
    if (c.kind === 'ladybug') {
      c.y = T.y + cfg.ladybug.dy; c.x = clamp(c.x, T.plankX0, T.plankX1);
      var sl = slotsFor(L, this.members.length, cfg); if (sl.length > 1) c.stopX = (sl[Math.floor(sl.length / 2)].x + sl[Math.floor(sl.length / 2) - 1].x) / 2;
      if (c.state === 'fly') { c._f.x0 = c.x; c._f.y0 = c.y; c.t = 0; }
    } else if (c.kind === 'snail') { c.legX = T.legs[1]; c.y = T.legBottom - 4; c.x = c.legX + cfg.snail.out * smooth(c.show); }
    else if (c.kind === 'butterfly') { if (c.state === 'in' || c.state === 'out') { c._x0 = clamp(c.x, -80, L.W + 80); c._y0 = clamp(c.y, -80, L.H); c.t = 0; } }
    c._px = c.x; c._py = c.y;
  };
  P._stepCritter = function (h) {
    var cfg = this.cfg, L = this.layout, c = this.critter, u, p;
    if (this._surpriseAt >= 0 && this.time >= this._surpriseAt && (this.phase === 'play' || this.phase === 'rise' || this.phase === 'chime')) {
      this._surpriseAt = -1; this._spawnCritter(); c = this.critter;
    }
    if (!c) return;
    c.t += h;
    if (c.kind === 'ladybug') {
      var B = cfg.ladybug;
      if (c.state === 'walk') {
        c.x -= B.speed * h; c.stepT += B.stepRate * h; if (c.stepT >= 1) { c.stepT -= 1; c.step ^= 1; }
        if (!c.stopped && c.x <= c.stopX) { c.x = c.stopX; c.state = 'stop'; c.t = 0; c.stopped = true; c.step = 0; }
        if (c.x <= L.table.plankX0 + 10) { c.state = 'fly'; c.t = 0; c.open = 1; c._f = { x0: c.x, y0: c.y, x1: c.x - 200, y1: -80 }; }
      } else if (c.state === 'stop') { if (c.t >= B.stop) { c.state = 'walk'; c.t = 0; } }
      else if (c.state === 'fly') {
        u = clamp(c.t / B.flyT, 0, 1);
        p = bez(c._f.x0, c._f.y0, c._f.x0 + (c._f.x1 - c._f.x0) * 0.2, c._f.y0 - 120, c._f.x1, c._f.y1, u * u * (2 - u));
        c.face = c._f.x1 < c._f.x0 ? -1 : 1; c.x = p.x; c.y = p.y;
        if (u >= 1) { c.state = 'gone'; this.critter = null; }
      }
    } else if (c.kind === 'butterfly') {
      var Bf = cfg.butterfly, on = this.memberById(c.onId), top = on && on.state === 'sit' ? { x: on.x, y: on.y - on.lift - this._drawH(on) - Bf.gap } : null;
      c.flapPh += h * (c.state === 'sit' ? 1.2 : 9); c.flap = 0.5 + 0.5 * Math.sin(TAU * c.flapPh);
      if (c.state === 'in') {
        if (!top) { this._butterflyOut(); return; }
        u = smooth(c.t / c._T);
        p = bez(c._x0, c._y0, (c._x0 + top.x) / 2, Math.min(c._y0, top.y) - 90, top.x, top.y, u);
        c.x = p.x + 14 * Math.sin(TAU * 1.3 * c.t) * (1 - u); c.y = p.y + 10 * Math.sin(TAU * 2.1 * c.t) * (1 - u);
        if (c.t >= c._T) { c.state = 'sit'; c.t = 0; }
      } else if (c.state === 'sit') {
        if (!top) { this._butterflyOut(); return; }
        c.x = top.x; c.y = top.y; c.sitT += h;
        if (c.sitT >= Bf.sit) this._butterflyOut();
      } else if (c.state === 'loop') {
        u = clamp(c.t / Bf.loopT, 0, 1);
        var a = Math.PI / 2 - TAU * smooth(u);
        c.x = c._cx + Math.cos(a) * Bf.loopR; c.y = c._cy + Math.sin(a) * Bf.loopR;
        if (u >= 1) { if (top && c.sitT < Bf.sit) { c.state = 'in'; c.t = 0; c._x0 = c.x; c._y0 = c.y; c._T = 0.4; } else this._butterflyOut(); }
      } else if (c.state === 'out') {
        u = smooth(c.t / c._T);
        p = bez(c._x0, c._y0, c._x0 - 120, c._y0 - 160, -80, L.garland.y, u);
        c.x = p.x; c.y = p.y;
        if (c.t >= c._T) { c.state = 'gone'; this.critter = null; }
      }
      if (this.critter) { var dx = c.x - c._px; if (Math.abs(dx) > 0.2) c.face = dx > 0 ? 1 : -1; }
    } else if (c.kind === 'snail') {
      var S = cfg.snail;
      // c.show 0..1 = how far it has slid out from behind the leg (linear progress, eased for the position)
      c.show = c.state === 'out' ? Math.max(0, c.show - h / S.outT) : Math.min(1, c.show + h / S.inT);
      if (c.state === 'in') { if (c.show >= 1) { c.state = 'stay'; c.t = 0; } }
      else if (c.state === 'stay') { c.stay += h; if (c.stay >= S.stay) { c.state = 'out'; c.t = 0; c.face = -1; } }
      else if (c.state === 'peek') { c.stay += h; c.peek = clamp(1 - Math.max(0, c.t - S.peekT * 0.6) / (S.peekT * 0.4), 0, 1); if (c.t >= S.peekT) { c.state = c.show >= 1 ? 'stay' : 'in'; c.t = 0; c.peek = 0; } }
      else if (c.state === 'out') { if (c.show <= 0) { c.state = 'gone'; this.critter = null; } }
      c.x = c.legX + S.out * smooth(c.show);
      c.y = L.table.legBottom - 4;
    } else if (c.kind === 'fairies') {
      var F = cfg.fairies, lan = L.garland.lanterns;
      c.fairies.forEach(function (f, j) {
        var q = lan[j % lan.length], ang = f.ph + F.w * c.t * (j % 2 ? -1 : 1);
        var ax = q.cx + Math.cos(ang) * F.orbit, ay = q.cy + Math.sin(ang) * F.orbit * 0.6;
        if (c.state === 'in') { var ui = smooth(c.t / F.inT - j * 0.1); f.x = lerp(f.sx, ax, ui); f.y = lerp(f.sy, ay, ui); }
        else if (c.state === 'dance') { f.x = ax; f.y = ay; }
        else if (c.state === 'out') { f.y -= (160 + 60 * j) * h; f.x += 30 * Math.sin(3 * c.t + j) * h; }
        if (f.twirlT > 0) { f.twirlT = Math.max(0, f.twirlT - h); f.twirl = 1 - f.twirlT / F.twirlT; } else f.twirl = 0;
        f.glow = Math.max(0.6 + 0.4 * Math.sin(TAU * 0.9 * c.t + f.ph), f.glow - h * 1.2);
        f.flap = (Math.floor((c.t + j * 0.05) * 24) % 2);
      });
      if (c.state === 'in' && c.t >= F.inT + 0.3) { c.state = 'dance'; c.t = 0; }
      else if (c.state === 'dance' && c.t >= F.stay) { c.state = 'out'; c.t = 0; }
      else if (c.state === 'out' && c.t >= F.outT) { c.state = 'gone'; this.critter = null; return; }
      c.x = c.fairies[0].x; c.y = c.fairies[0].y;
    }
  };

  // ---------------------------------------------------------------- Moka
  P._stepMoka = function (h) {
    var b = this.moka, cfg = this.cfg, L = this.layout;
    b.x = L.moka.x; b.y = L.moka.y; b.h = L.moka.h; b.w = L.moka.w;
    if (b.moodT > 0) { b.moodT -= h; if (b.moodT <= 0) { b.moodT = 0; b.mood = 'idle'; } }
    b.blinkT -= h;
    if (b.blink && b.blinkT <= 0) { b.blink = false; b.blinkT = this._crng.float(cfg.blink[0], cfg.blink[1]); }
    else if (!b.blink && b.blinkT <= 0) { b.blink = true; b.blinkT = cfg.blinkTime; }
    if (b._bT >= 0) { b._bT += h; var u = b._bT / cfg.bounceT; b.bounce = u < 1 ? Math.sin(Math.PI * u) : 0; if (u >= 1) b._bT = -1; }
    this._lookT -= h;
    var tx = (L.slotX0 + L.slotX1) / 2, f = this.fairy;
    if (this._g) tx = this.finger.x;
    else if (this.hintHand) tx = this.hintHand.x;
    else if (this._lookT > 0) tx = this._lookX;
    else if (f.state !== 'rest') tx = f.x;
    else if (this.critter) tx = this.critter.x;
    b.lookX += (tx - b.lookX) * Math.min(1, h * cfg.lookRate);
    b.look = clamp((b.lookX - b.x) / 500, -1, 1);
  };

  FT.World = World;
})(window.FT = window.FT || {});
