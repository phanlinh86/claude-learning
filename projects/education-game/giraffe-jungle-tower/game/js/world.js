/* Lulu's Jungle Tower — JT.CONFIG + JT.World (headless, deterministic tower-stacking simulation; DESIGN §2, §5.2)
 *
 * ============================== CONVENTIONS ==============================
 *  Units: logical px (short side 720), seconds, radians, y DOWN, rot > 0 clockwise. Screen space = world space (no camera).
 *  update(dt) runs fixed sub-steps of cfg.step (1/120 s); at the START of every sub-step pieces / flying tower blocks / the
 *  monkey / the butterfly store _px/_py/_prot, the tower stores _ptheta, the goal _pswing/_py. Render p = _p + (p − _p)·alpha.
 *
 *  BLOCK SIZE: layout.S = side of a full block. A block's real side = S·(block.size === 'small' ? 0.7 : 1) (`piece.side`).
 *    JT.BlockArt.drawBlock(ctx, block, S·scale, opt) is called with the FULL side — BlockArt itself draws a small block at 0.7.
 *  PIECE (a choice block): (x, y) = CENTRE of the drawn block; draw: translate(x, y) · rotate(rot) · scale(sx, sy) ·
 *    drawBlock(block, S·scale) with globalAlpha = alpha. Squash is about the centre but y already includes the
 *    bottom-anchored offset, so a squashed block stays on the ground. glow 0..1 = hint halo.
 *    Draw order: w.drawOrder() (resting 2nd row → resting 1st row → hopping → the active piece on top, above the tower).
 *  TOWER: w.blockPose(i, alpha) → { x, y (centre), rot, sx, sy, alpha } of tower.blocks[i] (i = 0 is the bottom one);
 *    draw like a piece. The stump top centre is (tower.x, tower.baseTop). Blocks bend like a stack: block i is rotated
 *    θ·(i+1)/n around the stump top chain. glow = count-up glow, bloom 0..1 = the flower beside block i (drawFlower t).
 *  GOAL: bananas.svg (120×130, stem anchor (60, 6)) drawn goal.h px tall with the anchor at (goal.x, goal.y), rotated
 *    goal.swing about it; the stem line goes up from there to (goal.x, goal.stemY) (the branch point). goal.state 'taken' →
 *    not drawn (the monkey carries them). layout.goalY = bottom of the bunch.
 *  MONKEY: monkey_<frame>.svg (160×200, vine anchor (80, 6)) drawn at (monkey.x, monkey.y) rotated monkey.rot about the
 *    anchor; vine from (monkey.vx, monkey.vy) (pivot at the top edge) to the anchor. frame: in → swing, grab|out → grab.
 *  LULU: (x, y) = FEET, height layout.lulu.h (art 300×440, feet (150, 432)).
 * ========================================================================
 */
(function (JT) {
  'use strict';

  var CONFIG = {
    // ---- timing / state machine (s)
    step: 1 / 120,             // fixed simulation sub-step (≤ 1/120 per DESIGN)
    maxFrame: 1.0,             // largest dt accepted per update() (speed mode passes big dt)
    roundsPerLevel: 4,         // towers per chapter
    chapterTimeLimit: 80,      // s since the chapter began: after ≥ chapterMinRounds towers go to Talk time once exceeded
    chapterMinRounds: 2,       // QA: 3 forced slow children past 8 min (slow3 age 4: session p90 637 s)
    chapterBudget: 100,        // … and also when this chapter's pace (s per stacked block) says the next tower would end past 100 s
    introTime: 2.5,            // chapter banner + time-of-day line (the 2.5 s weather crossfade)
    talkAfterAnswer: 1.6,
    levelDoneTime: 1.8,
    talkAskTime: 12,           // s without an answer → talkAsk (re-ask), repeating
    talkGlowAfterAsks: 2,

    // ---- layout (DESIGN §2; px)
    shortSide: 720, minLong: 960, maxLong: 1600, tallRatio: 1.6,
    wideRatio: 1.9, baseDyWide: 52, topRoomWide: 116,
    baseDyPortShort: 90, topRoomPortShort: 266,   // short portraits (iPad): bubble on the HUD row; sky = bubble bottom 142 + 12 + bananas 104 + 8   // phone landscape (W/H > 1.9): lower stump margin + less sky → S ≥ 97 at ages 5–7
    groundLand: 28, groundPort: 40,
    blockS: { 3: 112, 4: 112, 5: 100, 6: 100, 7: 100 }, blockMin: 84,
    topRoomLand: 150, topRoomPort: 260,      // the tallest tower top stays this far below ins.top
    towerFracLand: 0.45, towerMinLand: 360, towerFracPort: 0.58,
    baseDyLand: 64, baseDyPort: 150, baseExtra: 70,
    dropPad: 60, dropBelow: 10,
    goalGap: 8, goalH: 104,                  // bananas drawn 104 px tall (≈ 96 wide)
    branchDy: 16,                            // branch point (top of the banana stem) = ins.top + 16
    luluXLand: 120, luluHLand: 420, luluHSmall: 380, luluSmallW: 1100, luluXPort: 115, luluDyPort: 70, luluHPort: 400,
    luluHalfW: 0.3, luluPad: 20,             // Lulu's hit box: feet x ± 0.3·h, h tall (+ 20 px)
    slotGap: 26, slotEdge: 20, slotDropGap: 44, slotLift: 6, slotLiftPort: 8, row2Gap: 36, slotMaxGap: 70,
    bubbleX: 24, bubbleYLand: 18, bubbleMaxW: 560, bubbleHLand: 122, bubbleYPort: 110, bubbleHPort: 124,
    hudW: 160, hudH: 96,
    monkeyOff: 90,             // the monkey's swing starts this far beyond the right screen edge
    hitFrac: 0.6, hitPad: 14,  // piece hit box: centre ± (0.6·S + 14)

    // ---- motion (physics)
    g: 2600,                   // px/s² gravity (falls, hops, bounces)
    dragOmega: 30, dragZeta: 0.8, dragLift: 1.08, liftOmega: 18, liftZeta: 0.6, grabClamp: 0.35,
    tiltK: 0.0007, tiltMax: 0.35, tiltOmega: 14, tiltZeta: 0.45,   // pendulum tilt while dragged (rad per px/s)
    tapMovePx: 24, tapTime: 0.35,   // tap = < max(tapMovePx, w.tapMoveMin) px and < 0.35 s (main sets tapMoveMin = 18 CSS px in logical px)
    stillMove: 10, stillTime: 6,  // a drag that moved < 10 px for 6 s is cancelled (stillDrag): a resting thumb never freezes the game
    fallKeepVx: 0.4, fallOmega: 10, fallZeta: 0.9, landWithin: 0.18, fallRotRate: 8, fallLift: 30,
    landSquash: 0.18, squashOmega: 22, squashZeta: 0.32, belowSquash: 0.06,
    swayK: 26, swayC: 3.2, swayMax: 0.12,                    // tower: θ'' = −k·θ − c·ω + torque
    swayBase: 0.02, swayOffset: 0.03, swayImpact: 0.03, swayPeakMax: 0.07, centreRate: 0.6,   // QA: 0.1 / 0.06 sat at the cap on 86 % of landings
    restitution: 0.45, bounceKick: 260, bounceSpin: 7, bounceSway: 0.025, bounceApex: 6,
    homeApex: 50, tapApex: 22,
    dealStagger: 0.08, dealFallTime: 0.45, dealBounce: 0.28, dealDelay: 0.35, dealSettle: 0.08, nextDealDelay: 0.15,
    outTime: 0.35, outVx: [180, 320], outVy: -360, tossApex: 1.2,
    bobAmp: 2, bobHz: 0.7, wiggleAmp: 0.07, wiggleHz: 2.2,
    goalOmega: 14, goalZeta: 0.3, goalCatch: 0.35, swingOmega: 4.2, swingZeta: 0.18, swingKick: 0.05, swingNear: 1.5,

    // ---- tower done → clear
    countAt: 0.25, countStep: 0.45,   // 0.45: room for a spoken number per block (QA)
    bloomAfter: 0.1, bloomStagger: 0.12, bloomTime: 0.45,
    monkeyG: 7000, grabHold: 0.3, roundDoneAfterGrab: 0.4, monkeyPush: 1.4, doneMax: 6,
    clearStagger: 0.1, clearTime: 0.55, clearVy: -680, clearFade: 0.25, clearAfter: 0.1,

    // ---- help
    hintAfterMisses: 2,        // the 2nd miss on an ask always hints
    hintCooldown: 6,
    wrongLock: 0.7,            // s: grabs ignored after a wrong bounce → event 'locked'
    hintTime: 4, hintStroke: 1.6,
    idleTime: 12, idleBackoff: 1.5, idleMax: 20, idleHintFrom: 1,   // QA: the 1st idle already shows the hand; gaps 12, 18, 20, 20 …
    graceAssist: true,         // once hinted, letting go of the right block ANYWHERE off the tower tosses it on (swipers / never-let-go)
    freeSlipFrom: 4,           // towers of ≥ 4 blocks forgive 1 slip: 3★ with ≤ 1 miss
    softTapHint: 3,            // every 3rd tap on Lulu / on a block within one ask hints (taps do not reset idle)
    tapAssist: true,           // once hinted, a TAP on the right block — or on the tower / drop zone — hops it onto the tower (a child who only taps still builds)

    // ---- surprise round: one per chapter, the type rotates per chapter from a random start per session
    surpriseRound: 1,          // QA: with chapterMinRounds 2 the surprise must come early
    surpriseTypes: ['breeze', 'butterfly'],
    gustAfter: 0.6, gustPeak: 0.1, gustDir: -1, holdDelay: 0.3, holdTime: 1.5, holdDamp: 3, holdStiff: 1.5, windDecay: 1.2,
    butterflyDelay: [1.0, 2.0], butterflyIn: 1.6, butterflySit: 4, butterflyOut: 1.2, butterflyR: 64,

    // ---- Lulu
    moodTime: { happy: 0.9, cheer: 1.6, oops: 0.8, think: 1.4, talk: 1.0, hold: 1.5 }, lookRate: 6, blink: [2.2, 5], blinkTime: 0.13
  };
  JT.CONFIG = CONFIG;

  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hyp(x, y) { return Math.sqrt(x * x + y * y); }
  function smooth(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }
  function lerp(a, b, u) { return a + (b - a) * u; }
  function merge(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; if (b) for (k in b) o[k] = b[k]; return o; }
  function sgn(v) { return v < 0 ? -1 : 1; }
  /** Initial velocity that makes a damped spring (from rest at 0) peak at `peak`. */
  function kickFor(peak, w, z) { var s = Math.sqrt(1 - z * z); return peak * w * Math.exp(z / s * Math.atan2(s, z)); }
  function keepBoxes(hk) {
    var a = Array.isArray(hk) ? hk : hk ? [hk] : [], out = [];
    for (var i = 0; i < a.length; i++) { var b = a[i]; if (b && b.w > 0 && b.h > 0) out.push({ x: +b.x, y: +b.y, w: +b.w, h: +b.h }); }
    return out;
  }
  function insOf(ins) {
    return { top: +(ins && ins.top) || 0, right: +(ins && ins.right) || 0, bottom: +(ins && ins.bottom) || 0, left: +(ins && ins.left) || 0 };
  }

  /** DESIGN §2 short-side rule: CSS viewport → logical W×H. */
  function logicalSize(cssW, cssH, cfg) {
    cfg = cfg || CONFIG;
    var S = cfg.shortSide, aspect = cssW / Math.max(1, cssH);
    if (cssW >= cssH) return { W: clamp(Math.round(S * aspect), cfg.minLong, cfg.maxLong), H: S };
    return { W: S, H: clamp(Math.round(S / aspect), cfg.minLong, cfg.maxLong) };
  }

  /** DESIGN §2 layout. maxN = the most blocks a tower of this age has (S is fixed for the session). */
  function computeLayout(W, H, ins, cfg, age, maxN) {
    ins = insOf(ins);
    var portrait = H > W, tall = H / W > cfg.tallRatio;
    var groundY = H - ins.bottom - (portrait ? cfg.groundPort : cfg.groundLand);
    var S0 = cfg.blockS[age] || cfg.blockS[5], S, baseTop, tx;
    if (portrait) {
      tx = cfg.towerFracPort * W;
      var bdy = tall ? cfg.baseDyPort : cfg.baseDyPortShort, room = tall ? cfg.topRoomPort : cfg.topRoomPortShort;
      S = Math.min(S0, (groundY - bdy - ins.top - room) / (maxN + 1));
      S = Math.max(cfg.blockMin, Math.floor(S));
      baseTop = groundY - S - bdy;
    } else {
      tx = Math.max(ins.left + cfg.towerFracLand * (W - ins.left - ins.right), ins.left + cfg.towerMinLand);
      var wide = W / H > cfg.wideRatio;
      baseTop = groundY - (wide ? cfg.baseDyWide : cfg.baseDyLand);
      S = Math.max(cfg.blockMin, Math.floor(Math.min(S0, (baseTop - ins.top - (wide ? cfg.topRoomWide : cfg.topRoomLand)) / maxN)));
    }
    var tower = { x: tx, baseTop: baseTop, baseW: S + cfg.baseExtra };
    var drop = { x0: tx - (S / 2 + cfg.dropPad), x1: tx + S / 2 + cfg.dropPad, y1: baseTop + cfg.dropBelow };
    var lulu = portrait
      ? { x: ins.left + cfg.luluXPort, y: baseTop + cfg.luluDyPort, h: cfg.luluHPort }
      : { x: ins.left + cfg.luluXLand, y: groundY - 4, h: W < cfg.luluSmallW ? cfg.luluHSmall : cfg.luluHLand };
    var bx = ins.left + cfg.bubbleX;
    // portrait: tall phones put the bubble under the HUD row; short portraits (iPads) on the HUD row, left of the HUD, so the
    // bananas above a full tower stay visible (QA visual P1, 820×1180)
    var bubble = portrait
      ? (tall ? { x: bx, y: ins.top + cfg.bubbleYPort, w: W - bx - ins.right - cfg.bubbleX, h: cfg.bubbleHPort }
              : { x: bx, y: ins.top + cfg.bubbleYLand, w: W - ins.right - cfg.hudW - 14 - bx, h: cfg.bubbleHPort })
      : { x: bx, y: ins.top + cfg.bubbleYLand, w: Math.min(cfg.bubbleMaxW, drop.x0 - 20 - bx), h: cfg.bubbleHLand };
    bubble.w = Math.max(0, bubble.w);
    var hud = { x: W - ins.right - cfg.hudW, y: 0, w: cfg.hudW + ins.right, h: ins.top + cfg.hudH };
    // the monkey's vine pivot: on the top edge right of the tower, so that the mirror point of the bananas (where the swing
    // starts from rest) lies beyond the right edge → it swings in from off screen and stops exactly at the bananas
    var mx = tx + Math.max(150, (W + cfg.monkeyOff - tx) / 2);
    var L = {
      W: W, H: H, ins: ins, portrait: portrait, tall: tall, groundY: groundY, S: S, maxN: maxN, tower: tower, drop: drop,
      lulu: lulu, bubble: bubble, hud: hud, monkeyFrom: { x: Math.min(mx, W - ins.right - 20), y: -20 },
      branch: { x: tx, y: ins.top + cfg.branchDy }, goalH: cfg.goalH,
      safe: { x: ins.left, y: ins.top, w: W - ins.left - ins.right, h: H - ins.top - ins.bottom }
    };
    L.goalY = goalYFor(L, cfg, maxN);
    L.slots = slotsFor(L, cfg, 3);
    return L;
  }
  function goalYFor(L, cfg, n) { return L.tower.baseTop - n * L.S - cfg.goalGap; }

  /** Resting centres of k choice blocks (full-size block centres; a small block sits lower, bottom-aligned). */
  function slotsFor(L, cfg, k) {
    var S = L.S, ins = L.ins, out = [], i;
    if (L.portrait) {
      var y = L.groundY - S / 2 - cfg.slotLiftPort, x0 = ins.left + S / 2 + cfg.slotEdge, x1 = L.W - ins.right - S / 2 - cfg.slotEdge;
      for (i = 0; i < k; i++) out.push({ x: x0 + (x1 - x0) * (i + 0.5) / k, y: y, row: 0 });
      return out;
    }
    var yr = L.groundY - S / 2 - cfg.slotLift, a = L.drop.x1 + cfg.slotDropGap + S / 2, b = L.W - ins.right - S / 2 - cfg.slotEdge;
    var sp = S + cfg.slotGap, fit = Math.max(1, Math.floor((b - a) / sp + 1e-9) + 1);
    function row(m, y, r) {
      var gap = m > 1 ? Math.min(S + cfg.slotMaxGap, (b - a) / (m - 1)) : 0, w = gap * (m - 1), c = (a + b) / 2;
      for (var j = 0; j < m; j++) out.push({ x: c - w / 2 + j * gap, y: y, row: r });
    }
    if (k <= fit) row(k, yr, 0);
    else { row(fit, yr, 0); row(Math.min(fit, k - fit), yr - S - cfg.row2Gap, 1); }
    return out;
  }

  // ------------------------------------------------------------------ World
  function World(opts) {
    opts = opts || {};
    this.cfg = merge(CONFIG, opts.config);
    this.seed = opts.seed !== undefined ? opts.seed : 1;
    this.rng = new JT.RNG(this.seed);
    this._crng = new JT.RNG((JT.RNG.hash(this.seed) ^ 0x51ed27) >>> 0);   // cosmetic randomness (spins, blinks, kicks)
    this.age = JT.Content.ageOf(opts.age !== undefined ? opts.age : 4);
    this.lang = opts.lang === 'vi' ? 'vi' : 'en';
    this._pendingAge = this.age; this._pendingLang = this.lang;
    this.state = 'menu'; this.phase = null;
    this.level = 0; this.levels = []; this.topic = null; this.weather = 0;
    this.round = 0; this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.stars = 0; this.levelStars = 0; this.roundStars = 0; this.towers = 0;
    this.ask = 0; this.asks = 0; this.misses = 0; this.assists = 0; this.askMisses = 0; this.streak = 0;
    this.time = 0; this.stateTime = 0; this.phaseTime = 0; this.alpha = 0; this._acc = 0;
    this.cur = null; this.pieces = []; this.talk = null; this.talkAnswered = null; this.wind = 0;
    this.hudKeep = opts.hudKeep || null; this.lastTopics = null; this.surprise = null; this._surpriseOff = 0;
    this.tower = { x: 0, baseTop: 0, blocks: [], theta: 0, _ptheta: 0, omega: 0, n: 0 };
    this.goal = null; this.monkey = null; this.butterfly = null; this.hintHand = null;
    this.lulu = { x: 0, y: 0, mood: 'idle', moodT: 0, blinkT: 3, blink: false, look: 0, lookX: 0, lookY: 0 };
    this.events = []; this.sessions = 0; this._idN = 0;
    this._idleN = 0; this._idleT = 0; this._idleGap = this.cfg.idleTime; this._lastHintT = -1e9; this.levelStartTime = 0;
    this._talkAskT = 0; this._talkAsks = 0; this._lockUntil = -1; this._press = null; this._softN = 0;
    this._vp = null; this.tapMoveMin = 0;
    this.setViewport(opts.width || 1280, opts.height || 720, opts.ins || null);
  }
  World.logicalSize = logicalSize;
  World.computeLayout = function (W, H, ins, cfg, age) {
    var c = merge(CONFIG, cfg), a = JT.Content.ageOf(age || 4);
    return computeLayout(W, H, ins, c, a, JT.Content.maxBlocks(a));
  };
  World.slotsFor = slotsFor;
  World.kickFor = kickFor;

  var P = World.prototype;
  Object.defineProperty(P, 'interactive', { get: function () { return this.state === 'round' && this.phase === 'ask'; } });
  P._emit = function (e) { this.events.push(e); };
  P.drainEvents = function () { var e = this.events; this.events = []; return e; };
  P.setAge = function (a) { this._pendingAge = JT.Content.ageOf(a); };
  P.setLang = function (l) { this._pendingLang = l === 'vi' ? 'vi' : 'en'; };
  P.pieceById = function (id) { for (var i = 0; i < this.pieces.length; i++) if (this.pieces[i].id === id) return this.pieces[i]; return null; };
  P._setState = function (s) { this.state = s; this.stateTime = 0; };
  P._setPhase = function (p) { this.phase = p; this.phaseTime = 0; };
  P._mood = function (m, t) { this.lulu.mood = m; this.lulu.moodT = t || this.cfg.moodTime[m] || 1; };
  P.skipTalk = function () { if (this.state === 'talk') this._levelDone(); };
  P._askObj = function () { return this.cur && this.ask < this.cur.asks.length ? this.cur.asks[this.ask] : null; };
  P._rightPiece = function () {
    for (var i = 0; i < this.pieces.length; i++) { var p = this.pieces[i]; if (p.right && p.askIdx === this.ask && p.state !== 'out' && p.state !== 'gone') return p; }
    return null;
  };
  /** The current question {promptKey, params} (null before the first ask / outside a round). */
  P.prompt = function () {
    if (this.state !== 'round' || !this.cur || !this._asked || this.phase === 'done' || this._openAsk !== this.ask) return null;
    var a = this._askObj();
    return a ? { promptKey: a.promptKey, params: a.params } : null;
  };
  /** Id of the right piece of the current ask (null when no ask is open). */
  P.answerId = function () {
    if (this.state !== 'round' || !this._asked || (this.phase !== 'ask' && this.phase !== 'bounce' && this.phase !== 'drop')) return null;
    var p = this._rightPiece();
    return p ? p.id : null;
  };

  // ---------------------------------------------------------------- geometry
  P._hitHalf = function () { return this.cfg.hitFrac * this.layout.S + this.cfg.hitPad; };
  /** Hit box of a piece: {x, y (centre), w, h} logical px. */
  P.pieceHit = function (id) {
    var p = typeof id === 'object' ? id : this.pieceById(id);
    if (!p) return null;
    var h = this._hitHalf();
    return { x: p.x, y: p.y, w: 2 * h, h: 2 * h };
  };
  P._luluBox = function () { var Q = this.layout.lulu, hw = this.cfg.luluHalfW * Q.h; return { l: Q.x - hw, t: Q.y - Q.h, r: Q.x + hw, b: Q.y }; };
  P.luluHit = function () { var b = this._luluBox(); return { x: (b.l + b.r) / 2, y: (b.t + b.b) / 2, w: b.r - b.l, h: b.b - b.t }; };
  /** Top surface centre of the tower (stump top when empty) → {x, y, rot}. */
  P.towerTop = function (alpha) {
    var T = this.tower, live = this._liveCount();
    if (!live) return { x: T.x, y: T.baseTop, rot: 0 };
    var c = this._chain(alpha === undefined ? 1 : alpha), q = c[live - 1];
    return { x: q.tx, y: q.ty, rot: q.rot };
  };
  /** Logical point 1.2·S above the tower top (where a finger lets go of a block). */
  P.dropPoint = function () { var t = this.towerTop(); return { x: t.x, y: t.y - 1.2 * this.layout.S }; };
  P._liveCount = function () { var b = this.tower.blocks, n = 0; while (n < b.length && !b[n].fly) n++; return n; };
  /** The bending chain of the stacked blocks: centre, rotation, top point of every non-flying block. */
  P._chain = function (alpha) {
    var T = this.tower, S = this.layout.S, n = this._liveCount(), th = lerp(T._ptheta, T.theta, alpha), out = [];
    var ax = T.x, ay = T.baseTop;
    for (var i = 0; i < n; i++) {
      var b = T.blocks[i], r = th * (i + 1) / n, h = b.side * b.sy, s = Math.sin(r), c = Math.cos(r);
      // centre = axis point + R(r)·(dx, −h/2); next axis point = axis + R(r)·(0, −h)
      var cx = ax + c * b.dx + s * h / 2, cy = ay + s * b.dx - c * h / 2;
      var nx = ax + s * h, ny = ay - c * h;
      out.push({ x: cx, y: cy, rot: r, tx: cx + s * h / 2, ty: cy - c * h / 2 });
      ax = nx; ay = ny;
    }
    return out;
  };
  /** Pose of tower block i for render: {x, y (centre), rot, sx, sy, alpha}. */
  P.blockPose = function (i, alpha) {
    var b = this.tower.blocks[i];
    if (!b) return null;
    alpha = alpha === undefined ? this.alpha : alpha;
    if (b.fly) {
      var F = b.fly;
      return { x: lerp(F._px, F.x, alpha), y: lerp(F._py, F.y, alpha), rot: lerp(F._prot, F.rot, alpha), sx: 1, sy: 1, alpha: F.alpha };
    }
    var c = this._chain(alpha)[i];
    return { x: c.x, y: c.y, rot: c.rot, sx: b.sx, sy: b.sy, alpha: 1 };
  };
  /** Render order of the pieces: resting 2nd row, resting 1st row, moving, then the active (dragged / falling) one. */
  P.drawOrder = function () {
    return this.pieces.filter(function (p) { return p.state !== 'gone'; }).sort(function (a, b) { return a.z - b.z || a.slot - b.slot; });
  };

  /** What is under (x, y)? the butterfly, the nearest resting piece (centre ± (0.6·S + 14)), Lulu (+ 20 px). */
  P._hit = function (x, y) {
    var Bf = this.butterfly, i;
    if (Bf && (Bf.state === 'in' || Bf.state === 'sit') && hyp(x - Bf.x, y - Bf.y) <= this.cfg.butterflyR) return 'butterfly';
    var hh = this._hitHalf(), best = null, bd = 1e9;
    for (i = 0; i < this.pieces.length; i++) {
      var p = this.pieces[i];
      if (p.state !== 'rest' && p.state !== 'home' && p.state !== 'bounce' && p.state !== 'in') continue;
      if (Math.abs(x - p.x) > hh || Math.abs(y - p.y) > hh) continue;
      var d = hyp(x - p.x, y - p.y);
      if (d < bd) { bd = d; best = p; }
    }
    if (best) return best;
    var b = this._luluBox(), pad = this.cfg.luluPad;
    if (x >= b.l - pad && x <= b.r + pad && y >= b.t - pad && y <= b.b + pad) return 'lulu';
    return null;
  };

  // ---------------------------------------------------------------- viewport
  P.setViewport = function (W, H, ins) {
    var key = W + 'x' + H + ':' + JSON.stringify(insOf(ins)) + ':' + this.age + ':' + JSON.stringify(this.hudKeep || null);
    if (key === this._vp) return;
    this._vp = key;
    var oldS = this.layout ? this.layout.S : 0;
    this.layout = computeLayout(W, H, ins, this.cfg, this.age, JT.Content.maxBlocks(this.age));
    this.layout.hudKeep = keepBoxes(this.hudKeep);
    this.lulu.x = this.layout.lulu.x; this.lulu.y = this.layout.lulu.y;
    this.tower.x = this.layout.tower.x; this.tower.baseTop = this.layout.tower.baseTop;
    if (oldS) this._snapAll(oldS);
  };
  P._slots = function (k) { return slotsFor(this.layout, this.cfg, k); };
  P._home = function (p) {
    var s = this._slots(p.k)[p.slot] || { x: this.layout.W / 2, y: this.layout.groundY - this.layout.S / 2, row: 0 };
    p.side = this.layout.S * (p.block.size === 'small' ? JT.Content.SMALL_SCALE : 1);
    p.homeX = s.x; p.homeY = s.y + (this.layout.S - p.side) / 2; p.row = s.row;
  };
  /** Rotation / resize mid-round: cancel the drag, re-layout, finish running motions, snap everything. */
  P._snapAll = function (oldS) {
    var self = this, L = this.layout, k = L.S / (oldS || L.S);
    this._press = null;
    this.tower.blocks.forEach(function (b) { b.dx *= k; b.side = L.S * (b.block.size === 'small' ? JT.Content.SMALL_SCALE : 1); });
    var ps = this.pieces.slice();
    ps.forEach(function (p) {
      self._home(p);
      if (p.state === 'fall') {
        if (p.right) { self._land(p, 0.3); return; }
        self._bounce(p, 0.3);
      }
      if (p.state === 'out') p.state = 'gone';
      if (p.state !== 'gone') self._rest(p, true);
    });
    this.pieces = this.pieces.filter(function (p) { return p.state !== 'gone'; });
    if (this.tower.blocks.some(function (b) { return b.fly; })) this.tower.blocks = this.tower.blocks.filter(function (b) { return !b.fly; });
    if (this.goal) this._placeGoal(true);
    if (this.monkey) {
      if (this.monkey.state === 'in') this._monkeyGrab();
      if (this.monkey && this.monkey.state === 'out') this.monkey = null;
      if (this.monkey) { this._monkeyGeo(); this.monkey.phi = this.monkey.phiT; this.monkey.omega = 0; this._monkeyPose(); }
    }
    this.butterfly = null;
    if (this.hintHand) this._hintGeo();
    if (this.phase === 'bounce') this._setPhase('ask');
  };

  // ---------------------------------------------------------------- session flow
  P._newId = function (p) { return p + (this._idN++); };

  P.newSession = function (opts) {
    this.age = this._pendingAge; this.lang = this._pendingLang;
    this.sessions++;
    var L = this.layout;
    this._clearRound(); this.cur = null; this.state = 'menu';
    this._vp = null;
    this.setViewport(L.W, L.H, L.ins);
    var last = (opts && opts.lastTopics) || this.lastTopics || null;
    this.levels = JT.Content.topicsFor(this.age, this.rng, last);
    this._surpriseOff = this.rng.int(0, Math.max(0, this.cfg.surpriseTypes.length - 1));
    this.stars = 0; this.towers = 0; this.cur = null;
    this.weather = 0;
    this._emit({ type: 'session', levels: this.levels.slice() });
    this.startLevel(0);
  };

  P._clearRound = function () {
    this.pieces = []; this.tower.blocks = []; this.tower.theta = this.tower._ptheta = this.tower.omega = 0;
    this.goal = null; this.monkey = null; this.butterfly = null; this.hintHand = null; this._press = null; this.wind = 0;
  };

  P.startLevel = function (i) {
    if (!this.levels.length) this.levels = JT.Content.topicsFor(this.age);
    this.level = clamp(i | 0, 0, this.levels.length - 1);
    this.topic = this.levels[this.level];
    this.weather = this.level % 4;
    this.round = 0; this.levelStars = 0; this.levelStartTime = this.time; this._chapBlocks = 0;
    this.roundsPerLevel = this.cfg.roundsPerLevel;
    this.cur = null; this.talk = null; this.talkAnswered = null; this.surprise = null; this._lastAskOf = null; this._asked = false;
    this._clearRound();
    this._setState('intro'); this.phase = null;
    this._mood('idle', 0.01);
    this._emit({ type: 'level', level: this.level, topic: this.topic, weather: this.weather });
  };

  P._beginRound = function () {
    var cfg = this.cfg;
    var rr = new JT.RNG((this.rng.next() * 4294967296) >>> 0);
    var ST = cfg.surpriseTypes, sp = ST && ST.length && this.round === cfg.surpriseRound ? ST[(this.level + this._surpriseOff) % ST.length] : null;
    this.cur = JT.Content.makeRound(this.topic, { age: this.age, lang: this.lang, rng: rr, roundIndex: this.round, surprise: sp,
      avoid: this._lastAskOf || null, blocks: cfg.blocksByRound ? cfg.blocksByRound[this.round] : undefined });
    if (sp === 'breeze' && this.cur.n < 3) sp = 'butterfly';   // the breeze needs a 3rd block after the gust
    if (sp === 'butterfly' && this.cur.n < 2) sp = null;
    this.cur.surprise = sp;
    this._lastAskOf = this.cur.asks[this.cur.asks.length - 1];
    this.surprise = sp;
    this.ask = 0; this.asks = this.cur.n; this.misses = 0; this.assists = 0; this.askMisses = 0; this.streak = 0; this._asked = false; this._openAsk = -1;
    this._gustAt = -1; this._gustDone = false; this._holdAt = -1; this._bfAt = -1; this._bfDone = false; this._done = null; this._clearT = 0;
    this._clearRound();
    this.tower.n = this.cur.n;
    this.layout.goalY = goalYFor(this.layout, cfg, this.cur.n);
    this.goal = { x: 0, y: 0, _py: 0, h: this.layout.goalH, stemX: 0, stemY: 0, state: 'drop', dy: 0, vy: 0, swing: 0, _pswing: 0, sv: 0 };
    this._placeGoal(false);
    this._setState('round'); this._setPhase('deal');
    this._dealAt = this.time + cfg.dealDelay;
    this._mood('happy', 1.0);
    this._emit({ type: 'round', round: this.round, topic: this.topic, n: this.cur.n, asks: this.asks, surprise: sp });
  };

  /** Goal position for the current layout (snap: no drop animation). */
  P._placeGoal = function (snap) {
    var G = this.goal, L = this.layout, n = this.cur ? this.cur.n : L.maxN;
    L.goalY = goalYFor(L, this.cfg, n);
    G.x = L.tower.x; G.h = L.goalH; G.stemX = L.branch.x; G.stemY = L.branch.y;
    G.baseY = L.goalY - G.h * (124 / 130);   // stem anchor (60, 6) → bottom (y 130): the bunch bottom sits at goalY
    G.bottom = L.goalY;
    if (snap || G.state !== 'drop') { if (G.state === 'drop') G.state = 'hang'; G.dy = 0; G.vy = 0; }
    else { G.dy = -(G.baseY + G.h + 60); G.vy = 0; }
    G.y = G.baseY + G.dy; G._py = G.y;
  };

  P._deal = function () {
    var cfg = this.cfg, self = this, a = this._askObj(), k = a.choices.length, ids = [];
    a.choices.forEach(function (b, i) {
      var p = { id: self._newId('b'), block: b, askIdx: self.ask, choice: i, right: i === a.answer, slot: i, k: k,
        homeX: 0, homeY: 0, row: 0, side: 0, x: 0, y: 0, _px: 0, _py: 0, vx: 0, vy: 0, rot: 0, _prot: 0, rv: 0,
        sx: 1, sy: 1, _q: 0, _qv: 0, scale: 1, _sv: 0, alpha: 1, state: 'in', glow: 0, _glowT: 0, t: 0, z: 2,
        delay: i * cfg.dealStagger, bounces: 0, arc: null };
      self._home(p);
      p.x = p._px = p.homeX; p.y = p._py = p._fy = -p.side;
      p.rot = p._prot = self._crng.float(-0.2, 0.2);
      var dist = p.homeY - p.y;
      p.gIn = Math.max(cfg.g, 2 * dist / (cfg.dealFallTime * cfg.dealFallTime));
      self.pieces.push(p); ids.push(p.id);
    });
    this._emit({ type: 'deal', ask: this.ask, n: k, pieces: ids });
  };

  P._startAsk = function () {
    var a = this._askObj(), r = this._rightPiece();
    this._setPhase('ask');
    this._asked = true; this._openAsk = this.ask;
    this.askMisses = 0; this._lockUntil = -1; this._softN = 0;
    this._idleT = 0; this._idleGap = this.cfg.idleTime; this._idleN = 0;
    this._emit({ type: 'ask', ask: this.ask, asks: this.asks, promptKey: a.promptKey, params: a.params, answerId: r ? r.id : null,
      nameKind: a.nameKind, nameValue: a.nameValue, first: this.ask === 0 });
    if (this.surprise === 'butterfly' && !this._bfDone && this._bfAt < 0 && this.ask >= 1) {
      this._bfAt = this.time + this.rng.float(this.cfg.butterflyDelay[0], this.cfg.butterflyDelay[1]);
    }
  };

  P._startTalk = function () {
    var rr = new JT.RNG((this.rng.next() * 4294967296) >>> 0);
    this.talk = JT.Content.makeTalk(this.topic, { age: this.age, lang: this.lang, rng: rr });
    this.talk.glowAnswer = false;
    this.talkAnswered = null; this._talkAskT = 0; this._talkAsks = 0;
    this.cur = null; this.phase = null;
    this._clearRound();
    this._setState('talk');
    this._mood('talk', 1.2);
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

  // ---------------------------------------------------------------- input (SCREEN logical px; ONE active pointer)
  P._tapMove = function () { return Math.max(this.cfg.tapMovePx, +this.tapMoveMin || 0); };
  P._locked = function () { return this.time < this._lockUntil; };
  P._touch = function () { this._idleT = 0; this._idleGap = this.cfg.idleTime; };
  P._askEvFields = function (e) { var a = this._askObj(); if (a) { e.promptKey = a.promptKey; e.params = a.params; } return e; };
  /** → piece id | 'locked' | 'lulu' | 'butterfly' | null */
  P.pointerDown = function (x, y) {
    // one active pointer: input.js forwards only one, so a new press while a drag is open means the old finger was lost —
    // its block flies home and the new press is handled normally (a stale tap press on Lulu / the grass is just replaced)
    if (this._press && this._press.kind === 'piece') this.cancelDrag();
    this._press = null;
    if (this.state !== 'round') return null;
    var hit = this._hit(x, y);
    if (hit === 'butterfly') {
      var Bf = this.butterfly;
      Bf.state = 'away'; Bf.t = 0; Bf.tapped = true; this._bfAway(Bf);
      this._emit({ type: 'butterflyTap', x: Bf.x, y: Bf.y });
      return 'butterfly';
    }
    if (hit === 'lulu') {
      if (!this.prompt()) return null;
      this._press = { kind: 'lulu', x0: x, y0: y, t0: this.time, moved: false, maxD: 0, fx: x, fy: y };
      return 'lulu';
    }
    if (!hit) {   // grass / sky / the tower: a soft tap (and, once the block was hinted, a tap on the tower stacks it)
      if (this.phase === 'ask' && this._openAsk === this.ask) this._press = { kind: 'grass', x0: x, y0: y, t0: this.time, moved: false, maxD: 0, fx: x, fy: y };
      return null;
    }
    var p = hit;
    var free = p.state === 'rest' || (p.state === 'home' && !p._wrong);
    if (this.phase !== 'ask' || !free || this._locked()) {
      if (p.askIdx === this.ask && (this.phase === 'ask' || this.phase === 'bounce')) { this._emit({ type: 'locked', pieceId: p.id }); return 'locked'; }
      return null;
    }
    var S = this.layout.S, cl = this.cfg.grabClamp * S;
    p.state = 'drag'; p.z = 4; p.vx = 0; p.vy = 0; p.arc = null;
    this._press = { kind: 'piece', id: p.id, x0: x, y0: y, t0: this.time, moved: false, maxD: 0,
      ox: clamp(x - p.x, -cl, cl), oy: clamp(y - p.y, -cl, cl), fx: x, fy: y, grabbed: false, sx: x, sy: y, st: this.time };
    this.lulu.lookX = p.x;
    return p.id;
  };
  P.pointerMove = function (x, y) {
    var d = this._press;
    if (!d) return;
    d.fx = x; d.fy = y;
    var m = hyp(x - d.x0, y - d.y0);
    if (m > d.maxD) d.maxD = m;
    if (m >= this._tapMove()) d.moved = true;
    if (d.kind === 'piece' && hyp(x - d.sx, y - d.sy) >= this.cfg.stillMove) { d.sx = x; d.sy = y; d.st = this.time; }
    if (d.kind === 'piece') this._confirmGrab(d);
  };
  /** A press on a piece becomes a real grab once it moved ≥ 24 px or lasted ≥ 0.35 s → event 'grab' (resets the idle help). */
  P._confirmGrab = function (d) {
    if (d.grabbed || !(d.moved || this.time - d.t0 >= this.cfg.tapTime)) return;
    var p = this.pieceById(d.id);
    if (!p) return;
    d.grabbed = true;
    this._touch();
    if (p.right && this.hintHand) this.hintHand = null;
    this._emit({ type: 'grab', pieceId: p.id, nameKind: p.block.nameKind, nameValue: p.block.nameValue, block: p.block, right: p.right, x: p.x, y: p.y });
  };
  /** → 'tap' | 'drop' | 'miss' | 'pokeLulu' | null */
  P.pointerUp = function (x, y) {
    var d = this._press;
    this._press = null;
    if (!d) return null;
    if (x === undefined) { x = d.fx; y = d.fy; }
    var m = Math.max(d.maxD, hyp(x - d.x0, y - d.y0)), tap = !d.moved && m < this._tapMove() && this.time - d.t0 < this.cfg.tapTime;
    if (d.kind === 'grass') {
      if (!tap || this.phase !== 'ask') return null;
      var R = this._rightPiece(), D0 = this.layout.drop;
      if (this.cfg.tapAssist && R && R._hinted && R.state === 'rest' && x >= D0.x0 && x <= D0.x1 && y < this.layout.groundY) {
        this._touch();
        this._toss(R);
        this._emit({ type: 'drop', pieceId: R.id, x: R.x, y: R.y, right: true, assisted: true, via: 'tower' });
        return 'drop';
      }
      this._softTap();
      return null;
    }
    if (d.kind === 'lulu') {
      if (!tap || this.state !== 'round') return null;
      var a = this.prompt();
      if (!a) return null;
      this._mood('talk', 1.0);
      this._emit({ type: 'pokeLulu', promptKey: a.promptKey, params: a.params });
      this._softTap();
      return 'pokeLulu';
    }
    var p = this.pieceById(d.id);
    if (!p || p.state !== 'drag') return null;
    if (tap) {
      var assist = this.cfg.tapAssist && p.right && p._hinted;
      this._emit({ type: 'tapPiece', pieceId: p.id, nameKind: p.block.nameKind, nameValue: p.block.nameValue, block: p.block, x: p.x, y: p.y, assist: !!assist });
      if (assist) {   // the hinted right block: one tap and it hops onto the tower
        this._touch();
        this._toss(p);
        this._emit({ type: 'drop', pieceId: p.id, x: p.x, y: p.y, right: true, assisted: true });
        return 'drop';
      }
      this._arcHome(p, this.cfg.tapApex);
      this._softTap();
      return 'tap';
    }
    this._confirmGrab(d);
    // inside the drop zone: the block's centre OR where the finger holds it (the spring lags a fast flick a little)
    var D = this.layout.drop, hx = d.fx - d.ox, hy = d.fy - d.oy;
    if ((p.x >= D.x0 && p.x <= D.x1 && p.y < D.y1) || (hx >= D.x0 && hx <= D.x1 && hy < D.y1)) {
      this._startFall(p);
      this._emit({ type: 'drop', pieceId: p.id, x: p.x, y: p.y, right: p.right });
      return 'drop';
    }
    if (this.cfg.graceAssist && p.right && p._hinted) {   // the hinted block let go off the tower: it hops on anyway
      this._touch();
      this._toss(p);
      this._emit({ type: 'drop', pieceId: p.id, x: p.x, y: p.y, right: true, assisted: true, via: 'grace' });
      return 'drop';
    }
    this._arcHome(p, this.cfg.homeApex);
    this._emit({ type: 'miss', pieceId: p.id, x: p.x, y: p.y });
    this._softTap();   // a block let go on the grass: also a sign the child needs a hand
    return 'miss';
  };
  /** The finger left (touchcancel / pause): the dragged piece flies home, no event. */
  P.cancelDrag = function () {
    var d = this._press;
    this._press = null;
    if (d && d.kind === 'piece') { var p = this.pieceById(d.id); if (p && p.state === 'drag') this._arcHome(p, this.cfg.homeApex); }
  };

  // ---------------------------------------------------------------- piece motion
  /** Ballistic arc (gravity g) from the piece's position to its slot, apex `apexAbove` px over the higher end. */
  P._arcHome = function (p, apexAbove) {
    var g = this.cfg.g, apexY = Math.min(p.y, p.homeY) - apexAbove;
    var t1 = Math.sqrt(2 * Math.max(0, p.y - apexY) / g), t2 = Math.sqrt(2 * Math.max(0, p.homeY - apexY) / g);
    p.arc = { x0: p.x, y0: p.y, x1: p.homeX, y1: p.homeY, t1: t1, T: Math.max(0.05, t1 + t2), t: 0, rot0: p.rot };
    p.state = 'home'; p.z = 3;
  };
  P._rest = function (p, snap) {
    p.state = 'rest'; p.arc = null; p.vx = p.vy = 0; p.z = p.row ? 0 : 1;
    if (snap) { p.x = p._px = p.homeX; p.y = p._py = p.homeY; p.rot = p._prot = 0; p.rv = 0; p.scale = 1; p._sv = 0; p._q = p._qv = 0; p.sx = p.sy = 1; p.alpha = 1; }
  };
  /** Taps on Lulu / blocks are not grabs: every softTapHint-th one in an ask hints (the first at once, later ones with the cooldown). */
  P._softTap = function () {
    if (this.phase !== 'ask') return;
    var n = ++this._softN, k = this.cfg.softTapHint;
    if (n === k) this._doHint(false); else if (n > k && n % k === 0) this._autoHint(false);
  };
  /** Assisted stack: a ballistic hop from the slot to above the tower top (apex tossApex·S over it), then the normal fall. */
  P._toss = function (p) {
    var cfg = this.cfg, g = cfg.g, top = this.towerTop(), S = this.layout.S;
    var landY = top.y - p.side / 2, apexY = Math.min(p.y, landY) - cfg.tossApex * S;
    var t1 = Math.sqrt(2 * (p.y - apexY) / g), t2 = Math.sqrt(2 * (landY - apexY) / g);
    p.arc = null; p.state = 'fall'; p.z = 4; p._toss = true;
    this.assists++;
    p.vx = (top.x - p.x) / (t1 + t2); p.vy = -g * t1; p.fallOff = 0; p.rv = 0;
    this._setPhase('drop');
    if (this.butterfly && this.butterfly.state !== 'away') { this.butterfly.state = 'away'; this.butterfly.t = 0; this._bfAway(this.butterfly); }
  };
  P._startFall = function (p) {
    var cfg = this.cfg, top = this.towerTop(), S = this.layout.S;
    p.state = 'fall'; p.z = 4;
    p.vx *= cfg.fallKeepVx;
    var bottom = p.y + p.side / 2;
    // released lower than the tower top (beside / over the stack): a little toss up so it falls ON the top
    if (bottom > top.y - 4) p.vy = -Math.sqrt(2 * cfg.g * (bottom - top.y + cfg.fallLift));
    else p.vy = Math.min(p.vy, 0) * 0.3;
    p.fallOff = clamp(p.x - top.x, -cfg.landWithin * S, cfg.landWithin * S);
    p.rv = 0;
    this._setPhase('drop');
    if (this.butterfly && this.butterfly.state !== 'away') { this.butterfly.state = 'away'; this.butterfly.t = 0; this._bfAway(this.butterfly); }
  };

  P._stepPiece = function (p, h) {
    var cfg = this.cfg, g = cfg.g, w, z, ax;
    p.t += h;
    var liftT = 1;
    switch (p.state) {
      case 'in': {
        if (p.t < p.delay) { p.alpha = 0; break; }
        p.alpha = 1;
        p.vy += p.gIn * h; p._fy += p.vy * h; p.y = p._fy;
        p.rot *= Math.exp(-4 * h);
        if (p._fy >= p.homeY) {
          p.y = p._fy = p.homeY;
          var vImp = p.vy;
          p._q = cfg.landSquash * clamp(vImp / 1800, 0.3, 1); p._qv = 0;
          if (p.bounces < 1 && vImp > 300) { p.vy = -vImp * cfg.dealBounce * Math.sqrt(cfg.g / p.gIn); p.gIn = cfg.g; p.bounces++; }
          else { p.rot = 0; this._rest(p, false); }
        }
        break;
      }
      case 'rest': {
        var bob = cfg.bobAmp * Math.sin(TAU * cfg.bobHz * (this.time + p.slot * 0.37));
        p.x = p.homeX; p.y = p.homeY - Math.max(0, bob) - p.glow * 6 * (0.5 + 0.5 * Math.sin(TAU * 1.6 * this.time));
        var wig = p.glow * cfg.wiggleAmp * Math.sin(TAU * cfg.wiggleHz * this.time);
        p.rv += (cfg.tiltOmega * cfg.tiltOmega * (wig - p.rot) - 2 * 0.7 * cfg.tiltOmega * p.rv) * h; p.rot += p.rv * h;
        break;
      }
      case 'drag': {
        var d = this._press;
        if (d && d.id === p.id) {
          var tx = d.fx - d.ox, ty = d.fy - d.oy;
          w = cfg.dragOmega; z = cfg.dragZeta;
          p.vx += (w * w * (tx - p.x) - 2 * z * w * p.vx) * h; p.vy += (w * w * (ty - p.y) - 2 * z * w * p.vy) * h;
          p.x += p.vx * h; p.y += p.vy * h;
          if (!d.grabbed) this._confirmGrab(d);
        }
        // pendulum tilt: the block lags behind the finger (top leads), springs back and swings a little
        var tr = clamp(p.vx * cfg.tiltK, -cfg.tiltMax, cfg.tiltMax);
        p.rv += (cfg.tiltOmega * cfg.tiltOmega * (tr - p.rot) - 2 * cfg.tiltZeta * cfg.tiltOmega * p.rv) * h; p.rot += p.rv * h;
        p.rot = clamp(p.rot, -cfg.tiltMax, cfg.tiltMax);
        liftT = cfg.dragLift;
        break;
      }
      case 'fall': {
        var top = this.towerTop(), txf = top.x + p.fallOff;
        w = cfg.fallOmega; z = cfg.fallZeta;
        p.vy += g * h;
        ax = p._toss && p.vy < 0 ? 0 : w * w * (txf - p.x) - 2 * z * w * p.vx;   // a toss flies freely up to its apex
        p.vx += ax * h;
        p.x += p.vx * h; p.y += p.vy * h;
        p.rot *= Math.exp(-cfg.fallRotRate * h); p.rv = 0;
        if (p.vy > 0 && p.y + p.side / 2 >= top.y) {
          p.y = top.y - p.side / 2;
          if (p.right) this._land(p, clamp(p.vy / 1600, 0, 1));
          else this._bounce(p, clamp(p.vy / 1600, 0, 1));
        }
        break;
      }
      case 'bounce': {
        p.vy += g * h; p.x += p.vx * h; p.y += p.vy * h; p.rot += p.rv * h;
        if (p.vy >= 0) this._arcHome(p, cfg.bounceApex);
        break;
      }
      case 'home': {
        var A = p.arc;
        A.t += h;
        var tt = Math.min(A.t, A.T);
        p.x = A.x0 + (A.x1 - A.x0) * tt / A.T;
        p.y = A.y0 - g * A.t1 * tt + 0.5 * g * tt * tt;
        p.vy = -g * A.t1 + g * tt; p.vx = (A.x1 - A.x0) / A.T;
        p.rot = A.rot0 * (1 - smooth(tt / A.T)); p.rv = 0;
        if (A.t >= A.T) {
          p.x = A.x1; p.y = A.y1;
          p._q = cfg.landSquash * clamp(p.vy / 1400, 0.25, 1); p._qv = 0;
          this._rest(p, false); p.rot = 0;
          if (this.phase === 'bounce' && !this.pieces.some(function (q) { return q.state === 'bounce' || (q.state === 'home' && q._wrong); })) this._setPhase('ask');
          p._wrong = false;
        }
        break;
      }
      case 'out': {
        p.vy += g * h; p.x += p.vx * h; p.y += p.vy * h; p.rot += p.rv * h;
        p.alpha = clamp(1 - p.t / cfg.outTime, 0, 1);
        liftT = 0.8;
        if (p.t >= cfg.outTime) p.state = 'gone';
        break;
      }
    }
    // squash & stretch (landing 1 − q → overshoot → 1) and the lift scale
    p._qv += (-cfg.squashOmega * cfg.squashOmega * p._q - 2 * cfg.squashZeta * cfg.squashOmega * p._qv) * h; p._q += p._qv * h;
    p.sy = 1 - p._q; p.sx = 1 + 0.5 * p._q;
    if (p.state === 'rest' || p.state === 'in' || p.state === 'home') p.y += p.side * p._q / 2;   // squash about the bottom
    p._sv += (cfg.liftOmega * cfg.liftOmega * (liftT - p.scale) - 2 * cfg.liftZeta * cfg.liftOmega * p._sv) * h; p.scale += p._sv * h;
    // hint glow
    if (p._glowT > 0) p._glowT = Math.max(0, p._glowT - h);
    var gT = p._glowT > 0 ? 1 : 0;
    p.glow += (gT - p.glow) * Math.min(1, h * (gT ? 6 : 3));
  };

  /** The right block lands on the tower top: joins the stack, squash, the stack sways. */
  P._land = function (p, impact) {
    var cfg = this.cfg, T = this.tower, S = this.layout.S, live = this._liveCount();
    var top = this.towerTop(), a = this._askObj();
    var off = clamp(p.x - top.x, -cfg.landWithin * S, cfg.landWithin * S);
    var dx0 = live ? T.blocks[live - 1].dx : 0;
    var nb = { id: p.id, block: p.block, dx: dx0 + off, side: p.side, sy: 1 - cfg.landSquash, sx: 1 + 0.5 * cfg.landSquash, _q: cfg.landSquash, _qv: 0,
      glow: 0, _glowT: 0, counted: false, bloom: 0, _bloomT: null, fly: null };
    // the blocks below compress a little (falloff with depth)
    for (var i = live - 1, dep = 0; i >= 0 && dep < 4; i--, dep++) T.blocks[i]._q += cfg.belowSquash * (1 - 0.25 * dep) * (0.5 + 0.5 * impact);
    T.blocks.splice(live, 0, nb);
    var n = live + 1;
    // sway impulse ∝ landing offset and fall speed (direction of the offset; a dead-centre landing still rocks a little)
    var dir = Math.abs(off) > 0.02 * S ? sgn(off) : (this._crng.chance(0.5) ? 1 : -1);
    var peak = Math.min(cfg.swayPeakMax, (cfg.swayBase + cfg.swayOffset * Math.abs(off) / (cfg.landWithin * S) + cfg.swayImpact * impact) * (0.8 + 0.1 * n));
    this._swayKick(dir * peak);
    // bananas tremble when the tower gets close
    if (this.goal) {
      var gap = (top.y - p.side) - this.goal.bottom;
      if (gap < cfg.swingNear * S) this.goal.sv += dir * kickFor(cfg.swingKick * (1 - Math.max(0, gap) / (cfg.swingNear * S)) + 0.01, cfg.swingOmega, cfg.swingZeta);
    }
    p.state = 'gone';
    this._chapBlocks++;
    var pose = this.blockPose(n - 1, 1);
    this.streak = 0;
    this._mood('happy');
    this.hintHand = null;
    this._emit({ type: 'land', pieceId: p.id, n: n, impact: impact, x: pose.x, y: pose.y + p.side / 2, right: true });
    this._emit({ type: 'stack', n: n, nameKind: p.block.nameKind, nameValue: p.block.nameValue, block: p.block, ask: this.ask, asks: this.asks,
      promptKey: a.promptKey, params: a.params, topic: this.topic, x: pose.x, y: pose.y });
    // the other choices hop away
    var self = this;
    this.pieces.forEach(function (q) { if (q !== p && q.state !== 'gone' && q.state !== 'out') self._out(q); });
    if (this.surprise === 'breeze' && n === 2 && !this._gustDone) this._gustAt = this.time + cfg.gustAfter;
    if (n >= this.cur.n) { this.ask++; this._startDone(); return; }
    this.ask++;
    this._setPhase('deal');
    this._dealAt = this.time + cfg.nextDealDelay;   // the new choices drop in while the old ones hop away
  };
  P._out = function (q) {
    var cfg = this.cfg, L = this.layout, dir = q.homeX >= L.tower.x ? 1 : -1;
    if (q === this.pieceById(this._press && this._press.id)) this._press = null;
    q.state = 'out'; q.t = 0; q.z = 2; q.arc = null;
    q.vx = dir * this._crng.float(cfg.outVx[0], cfg.outVx[1]); q.vy = cfg.outVy; q.rv = dir * this._crng.float(2, 5);
  };
  /** A wrong block bounces off the top (restitution, sideways kick towards its home side, spin) and flies home. */
  P._bounce = function (p, impact) {
    var cfg = this.cfg, a = this._askObj(), top = this.towerTop(), R = this._rightPiece();
    var dir = p.homeX >= top.x ? 1 : -1;
    p.state = 'bounce'; p.z = 4; p._wrong = true;
    p.vy = -Math.abs(p.vy) * cfg.restitution;
    p.vx = dir * cfg.bounceKick; p.rv = dir * cfg.bounceSpin;
    p._q = cfg.landSquash * 0.7; p._qv = 0;
    this._swayKick(-dir * cfg.bounceSway * (0.5 + impact));
    var T = this.tower, live = this._liveCount();
    if (live) T.blocks[live - 1]._q += cfg.belowSquash * 0.6;
    this.misses++; this.askMisses++; this.streak++;
    this._lockUntil = this.time + cfg.wrongLock;
    this._mood('oops');
    var want = { kind: a.nameKind, value: a.nameValue };
    if (R) { want.block = R.block; ['color', 'shape', 'animal', 'size', 'n', 'text'].forEach(function (k) { if (R.block[k] !== undefined) want[k] = R.block[k]; }); }
    this._setPhase('bounce');
    this._emit({ type: 'wrong', pieceId: p.id, nameKind: p.block.nameKind, nameValue: p.block.nameValue, block: p.block, want: want,
      streak: this.streak, misses: this.askMisses, x: p.x, y: p.y + p.side / 2, promptKey: a.promptKey, params: a.params });
    if (this.askMisses === cfg.hintAfterMisses) this._doHint(false);   // the 2nd miss always hints
    else if (this.askMisses > cfg.hintAfterMisses) this._autoHint();
  };
  P._swayKick = function (peak) {
    var cfg = this.cfg, T = this.tower, w = Math.sqrt(cfg.swayK), z = cfg.swayC / (2 * w);
    T.omega += kickFor(peak, w, z);
  };

  // ---------------------------------------------------------------- help
  P.resetNudges = function () {
    this._idleT = 0; this._idleGap = this.cfg.idleTime; this._idleN = 0;
    this._talkAskT = 0; this._talkAsks = 0;
    if (this.talk) this.talk.glowAnswer = false;
  };
  P._autoHint = function (fromIdle) {
    if (this.time - this._lastHintT < this.cfg.hintCooldown) return null;
    return this._doHint(!!fromIdle);
  };
  P._hintGeo = function () {
    var H = this.hintHand, p = this.pieceById(H.pieceId);
    if (!p) { this.hintHand = null; return; }
    var dp = this.dropPoint();
    H.fromX = p.homeX; H.fromY = p.homeY; H.toX = dp.x; H.toY = dp.y;
  };
  P._doHint = function (fromIdle) {
    var p = this._rightPiece();
    if (!p) return null;
    p._glowT = this.cfg.hintTime; p._hinted = true;
    this._lastHintT = this.time;
    this._mood('think');
    this.hintHand = { pieceId: p.id, fromX: 0, fromY: 0, toX: 0, toY: 0, t: 0, x: p.homeX, y: p.homeY, alpha: 0, T: this.cfg.hintTime, time: 0 };
    this._hintGeo();
    var ev = { type: 'hint', pieceId: p.id, x: p.homeX, y: p.homeY };
    if (fromIdle) ev.idle = true;
    this._emit(ev);
    return p.id;
  };
  /** Manual hint (tap on the bubble): the right piece glows + the ghost hand (no event while it already glows). */
  P.hint = function () {
    if (this.state !== 'round' || this.phase !== 'ask') return null;
    var p = this._rightPiece();
    if (!p) return null;
    if (p._glowT > 0) return p.id;
    return this._doHint(false);
  };
  /** Ghost hand: strokes of hintStroke s from the right piece up to the drop point (ease in-out, a little arc). */
  P._stepHint = function (h) {
    var H = this.hintHand;
    if (!H) return;
    H.time += h;
    if (H.time >= H.T || this.phase === 'done') { this.hintHand = null; return; }
    var st = this.cfg.hintStroke, u = (H.time % st) / st, m = smooth(clamp(u / 0.8, 0, 1));
    this._hintGeo();
    if (!this.hintHand) return;
    H.t = u;
    H.x = lerp(H.fromX, H.toX, m);
    H.y = lerp(H.fromY, H.toY, m) - Math.sin(Math.PI * m) * 40;   // a gentle arc up to the drop point
    H.alpha = u < 0.12 ? u / 0.12 : u > 0.85 ? Math.max(0, 1 - (u - 0.85) / 0.15) : 1;
    H.press = u > 0.06 && u < 0.8;   // the hand "holds" the block during the stroke
  };

  // ---------------------------------------------------------------- tower done / monkey / clear
  /** 3 / 2 / 1 stars for 0 / 1 / ≥ 2 misses; towers of ≥ freeSlipFrom blocks forgive one slip. */
  P._starsFor = function (m) {
    var free = this.cur && this.cur.n >= this.cfg.freeSlipFrom ? 1 : 0;
    return m <= free ? 3 : m <= free + 1 ? 2 : 1;
  };
  P._startDone = function () {
    this._setPhase('done');
    this.hintHand = null;
    this._done = { counted: 0, bloom: false, monkey: false, grabAt: -1, roundDone: false };
    this._mood('cheer', 3);   // never left in 'oops' / 'think' from the last ask
    this.lulu.moodT = 3;
    this.towers++;
    this._emit({ type: 'towerDone', n: this._liveCount() });
  };
  P._stepDone = function (h) {
    var cfg = this.cfg, D = this._done, T = this.tower, n = this._liveCount(), t = this.phaseTime;
    while (D.counted < n && t >= cfg.countAt + cfg.countStep * D.counted) {
      var i = D.counted++, b = T.blocks[i], pose = this.blockPose(i, 1);
      b._glowT = 0.6; b.counted = true;
      this._emit({ type: 'count', i: i + 1, n: n, x: pose.x, y: pose.y });
    }
    var tB = cfg.countAt + cfg.countStep * (n - 1) + cfg.bloomAfter;
    if (!D.bloom && D.counted >= n && t >= tB) {
      D.bloom = true;
      T.blocks.forEach(function (b, j) { b._bloomT = j * cfg.bloomStagger; });
      this._emit({ type: 'bloom', n: n });
    }
    if (D.bloom && !D.monkey) { D.monkey = true; this._monkeyIn(); }   // the monkey swings in while the flowers bloom
    if (D.grabAt >= 0 && !D.roundDone && this.time >= D.grabAt + cfg.roundDoneAfterGrab) {
      D.roundDone = true;
      var m = this.misses + this.assists, st = this._starsFor(m);   // an assisted stack counts like a miss
      this.roundStars = st; this.stars += st; this.levelStars += st;
      this._emit({ type: 'roundDone', round: this.round, stars: st, misses: this.misses, assists: this.assists });
    }
    if ((D.roundDone && (!this.monkey || this.monkey.state === 'out')) || t >= cfg.doneMax) {   // blocks hop off while the monkey leaves
      if (!D.roundDone) {   // safety (never in tests): finish the round anyway
        D.roundDone = true; var m2 = this.misses + this.assists, s2 = this._starsFor(m2);
        this.roundStars = s2; this.stars += s2; this.levelStars += s2;
        this._emit({ type: 'roundDone', round: this.round, stars: s2, misses: this.misses, assists: this.assists });
      }
      if (this.monkey && this.monkey.state !== 'out') this.monkey = null;
      this._startClear();
    }
  };
  P._monkeyGeo = function () {
    var M = this.monkey, L = this.layout, G = this.goal;
    M.px = L.monkeyFrom.x; M.py = L.monkeyFrom.y;
    var tx = G.x + 0.18 * G.h, ty = G.baseY + 0.1 * G.h;   // the free hand reaches the stem
    M.L = Math.max(40, hyp(tx - M.px, ty - M.py));
    M.phiT = Math.atan2(tx - M.px, ty - M.py);              // < 0: the bananas are left of the pivot
    M.phi0 = -M.phiT;
  };
  P._monkeyPose = function () {
    var M = this.monkey;
    M.x = M.px + M.L * Math.sin(M.phi); M.y = M.py + M.L * Math.cos(M.phi); M.rot = -M.phi;
    M.vx = M.px; M.vy = M.py;
  };
  P._monkeyIn = function () {
    this.monkey = { x: 0, y: 0, _px: 0, _py: 0, rot: 0, _prot: 0, state: 'in', t: 0, phi: 0, omega: 0, L: 0, px: 0, py: 0, vx: 0, vy: 0, phiT: 0, phi0: 0 };
    this._monkeyGeo();
    var M = this.monkey;
    M.phi = M.phi0; M.omega = 0;
    this._monkeyPose(); M._px = M.x; M._py = M.y; M._prot = M.rot;
    this._emit({ type: 'monkey', x: M.x, y: M.y });
  };
  P._monkeyGrab = function () {
    var M = this.monkey, G = this.goal;
    M.state = 'grab'; M.t = 0; M.phi = M.phiT; M.omega = 0;
    this._monkeyPose();
    G.state = 'taken';
    this._done && (this._done.grabAt = this.time);
    this._mood('cheer', 2);
    this._emit({ type: 'bananas', x: G.x, y: G.y + G.h / 2 });
  };
  /** Pendulum: φ'' = −(g/L)·sin φ. Released from rest at the mirror angle φ0 it reaches the bananas (φT) exactly at its turn. */
  P._stepMonkey = function (h) {
    var M = this.monkey, cfg = this.cfg;
    if (!M) return;
    M.t += h;
    if (M.state === 'grab') { if (M.t >= cfg.grabHold) { M.state = 'out'; M.t = 0; M.omega = cfg.monkeyPush; } this._monkeyPose(); return; }
    M.omega += -(cfg.monkeyG / M.L) * Math.sin(M.phi) * h; M.phi += M.omega * h;
    if (M.state === 'in' && M.omega >= 0 && M.t > 0.05) { this._monkeyGrab(); return; }
    if (M.state === 'in' && M.phi <= M.phiT) { this._monkeyGrab(); return; }
    this._monkeyPose();
    if (M.state === 'out' && (M.phi >= M.phi0 || M.x > this.layout.W + 120 || M.t > 2.5)) this.monkey = null;
  };
  P._startClear = function () {
    this._setState('roundDone'); this.phase = 'clear'; this.phaseTime = 0;
    var cfg = this.cfg, T = this.tower, n = this._liveCount();
    T.blocks.forEach(function (b, i) { b._clearAt = (n - 1 - i) * cfg.clearStagger; });
    this.pieces.forEach(function (p) { if (p.state !== 'gone') p.state = 'gone'; });
    this._mood('happy', 1.0);
  };
  P._stepClear = function (h) {
    var cfg = this.cfg, T = this.tower, L = this.layout, g = cfg.g, self = this, live = this._liveCount();
    for (var i = live - 1; i >= 0; i--) {
      var b = T.blocks[i];
      if (i !== live - 1 || this.phaseTime < b._clearAt) break;
      var pose = this.blockPose(i, 1);
      b.fly = { x: pose.x, y: pose.y, _px: pose.x, _py: pose.y, rot: pose.rot, _prot: pose.rot, vx: (L.W + L.S - pose.x) / cfg.clearTime,
        vy: cfg.clearVy, rv: 5 + this._crng.float(0, 3), alpha: 1, t: 0 };
      this._emit({ type: 'clearBlock', i: i + 1, x: pose.x, y: pose.y });
      live--;
    }
    T.blocks.forEach(function (b) {
      var F = b.fly; if (!F) return;
      F.t += h; F.vy += g * h; F.x += F.vx * h; F.y += F.vy * h; F.rot += F.rv * h;
      F.alpha = clamp(1 - (F.t - (cfg.clearTime - cfg.clearFade)) / cfg.clearFade, 0, 1);
    });
    T.blocks = T.blocks.filter(function (b) { return !b.fly || b.fly.t < cfg.clearTime; });
    if (!T.blocks.length) { this._clearT += h; if (this._clearT >= cfg.clearAfter) self._nextRound(); }
  };
  P._nextRound = function () {
    var cfg = this.cfg;
    this._clearRound();
    this.round++;
    var el = this.time - this.levelStartTime, nNext = this.round < this.roundsPerLevel ? JT.Content.blocksFor(this.topic, this.age, this.round) : 0;
    var pace = this._chapBlocks ? (el - cfg.introTime) / this._chapBlocks : 0;
    var long = this.round >= cfg.chapterMinRounds && (el > cfg.chapterTimeLimit || el + pace * nNext > cfg.chapterBudget);
    if (this.round < this.roundsPerLevel && !long) this._beginRound();
    else { if (this.round < this.roundsPerLevel) this.roundsPerLevel = this.round; this._startTalk(); }   // a cut chapter: the HUD dots fill
  };

  // ---------------------------------------------------------------- tower / goal / surprises
  P._stepTower = function (h) {
    var cfg = this.cfg, T = this.tower, S = this.layout.S, hold = this.lulu.mood === 'hold';
    var k = cfg.swayK * (hold ? cfg.holdStiff : 1), c = cfg.swayC * (hold ? cfg.holdDamp : 1);
    T.omega += (-k * T.theta - c * T.omega) * h; T.theta += T.omega * h;   // (the gust acts as a kick: _stepGust)
    if (Math.abs(T.theta) > cfg.swayMax) { T.theta = sgn(T.theta) * cfg.swayMax; if (T.omega * T.theta > 0) T.omega *= -0.3; }
    var rate = cfg.centreRate * S * h;
    for (var i = 0; i < T.blocks.length; i++) {
      var b = T.blocks[i];
      if (b.fly) continue;
      // self-centring: ease towards the axis, never faster than centreRate·S per second
      var stp = Math.min(rate, Math.max(rate * 0.25, Math.abs(b.dx) * 4 * h));
      b.dx -= sgn(b.dx) * Math.min(Math.abs(b.dx), stp);
      b._qv += (-cfg.squashOmega * cfg.squashOmega * b._q - 2 * cfg.squashZeta * cfg.squashOmega * b._qv) * h; b._q += b._qv * h;
      b.sy = 1 - b._q; b.sx = 1 + 0.5 * b._q;
      if (b._glowT > 0) { b._glowT = Math.max(0, b._glowT - h); b.glow = Math.min(1, b.glow + h * 10); }
      else b.glow = Math.max(b.counted ? 0.3 : 0, b.glow - h * 2.5);   // a counted block keeps a soft glow
      if (b._bloomT !== null) { b._bloomT -= h; if (b._bloomT <= 0) b.bloom = Math.min(1, b.bloom + h / cfg.bloomTime); }
    }
  };
  P._stepGoal = function (h) {
    var G = this.goal, cfg = this.cfg;
    if (!G) return;
    if (G.state === 'drop') {
      G.vy += cfg.g * h; G.dy += G.vy * h;
      if (G.dy >= 0) { G.state = 'hang'; G.vy *= cfg.goalCatch; G.sv += (this._crng.chance(0.5) ? 1 : -1) * 0.3; }
    } else {
      var w = cfg.goalOmega, z = cfg.goalZeta;
      G.vy += (-w * w * G.dy - 2 * z * w * G.vy) * h; G.dy += G.vy * h;
    }
    // swing: a lightly damped pendulum spring; it trembles when the tower top is close
    var top = this.towerTop(), gap = top.y - G.bottom, S = this.layout.S;
    var near = clamp(1 - gap / (cfg.swingNear * S), 0, 1) * (this.phase === 'done' ? 0 : 1);
    var drive = near * 0.6 * Math.sin(TAU * 0.9 * this.time) + this.wind * 0.8;
    G.sv += (-cfg.swingOmega * cfg.swingOmega * G.swing - 2 * cfg.swingZeta * cfg.swingOmega * G.sv + drive) * h; G.swing += G.sv * h;
    G.swing = clamp(G.swing, -0.35, 0.35);
    G.y = G.baseY + G.dy;
  };
  P._stepButterfly = function (h) {
    var cfg = this.cfg, L = this.layout;
    if (this._bfAt > 0 && this.time >= this._bfAt && !this.butterfly && !this._bfDone) {
      this._bfAt = -1;
      if (this.phase === 'ask' && this._liveCount() > 0) {
        this._bfDone = true;
        var fromLeft = this._crng.chance(0.5), sx = fromLeft ? -60 : L.W + 60, sy = L.ins.top + 0.3 * (L.H - L.ins.top);
        this.butterfly = { x: sx, y: sy, _px: sx, _py: sy, sx: sx, sy: sy, t: 0, state: 'in', flip: fromLeft ? 1 : -1, flap: 0, rot: 0 };
        this._emit({ type: 'butterfly', x: sx, y: sy });
      } else this._bfAt = this.time + 0.5;   // wait for a calm moment (an ask with a block on the tower)
    }
    var B = this.butterfly;
    if (!B) return;
    B._px = B.x; B._py = B.y;
    B.t += h;
    var top = this.towerTop(), tx = top.x + Math.sin(top.rot) * 8, ty = top.y - 10;
    switch (B.state) {
      case 'in': {
        var u = smooth(B.t / cfg.butterflyIn);
        // a curved, fluttering path towards the tower top
        B.x = lerp(B.sx, tx, u) + Math.sin(B.t * 5.3) * 18 * (1 - u);
        B.y = lerp(B.sy, ty, u) - Math.sin(Math.PI * u) * 90 + Math.sin(B.t * 11) * 8 * (1 - u);
        B.flip = tx >= B.x ? 1 : -1; B.flap = (B.t * 9) % 1; B.rot = 0;
        if (B.t >= cfg.butterflyIn) { B.state = 'sit'; B.t = 0; }
        break;
      }
      case 'sit':
        B.x = tx; B.y = ty; B.rot = top.rot; B.flap = (B.t * 1.2) % 1;
        if (B.t >= cfg.butterflySit) { B.state = 'away'; B.t = 0; this._bfAway(B); }
        break;
      case 'away': {
        var v = B.t / cfg.butterflyOut;
        B.x = B.ax + B.dir * 420 * v * v + Math.sin(B.t * 6) * 14;
        B.y = B.ay - 360 * v + Math.sin(B.t * 10) * 10;
        B.flip = B.dir; B.flap = (B.t * 10) % 1; B.rot = 0;
        if (B.t >= cfg.butterflyOut) this.butterfly = null;
        break;
      }
    }
  };
  P._bfAway = function (B) { B.ax = B.x; B.ay = B.y; B.t = 0; B.dir = B.x < this.layout.W / 2 ? -1 : 1; };
  P._stepGust = function (h) {
    var cfg = this.cfg;
    if (this._gustAt > 0 && this.time >= this._gustAt && !this._gustDone) {
      this._gustAt = -1; this._gustDone = true;
      this.wind = cfg.gustDir;
      var T = this.tower;
      // the gust tips the whole stack (to the peak the springs allow), then Lulu steadies it with her head
      T.omega = 0;
      this._swayKick(cfg.gustDir * cfg.gustPeak - T.theta * 0.5);
      this._holdAt = this.time + cfg.holdDelay;   // the stack tips first, then Lulu leans in and steadies it
      this._emit({ type: 'gust', dir: cfg.gustDir, strength: 1 });
    }
    if (this._holdAt > 0 && this.time >= this._holdAt) { this._holdAt = -1; this._mood('hold', cfg.holdTime); }
    if (this.wind) { var d = h / cfg.windDecay; this.wind = Math.abs(this.wind) <= d ? 0 : this.wind - sgn(this.wind) * d; }
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
    var cfg = this.cfg, i, T = this.tower;
    for (i = 0; i < this.pieces.length; i++) { var p = this.pieces[i]; p._px = p.x; p._py = p.y; p._prot = p.rot; }
    for (i = 0; i < T.blocks.length; i++) { var F = T.blocks[i].fly; if (F) { F._px = F.x; F._py = F.y; F._prot = F.rot; } }
    T._ptheta = T.theta;
    if (this.goal) { this.goal._pswing = this.goal.swing; this.goal._py = this.goal.y; }
    if (this.monkey) { this.monkey._px = this.monkey.x; this.monkey._py = this.monkey.y; this.monkey._prot = this.monkey.rot; }
    this.time += h; this.stateTime += h; this.phaseTime += h;

    switch (this.state) {
      case 'intro': if (this.stateTime >= cfg.introTime) this._beginRound(); break;
      case 'round': this._stepRound(h); break;
      case 'roundDone': this._stepClear(h); break;
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
            this._emit({ type: 'sessionDone', stars: this.stars, towers: this.towers });
          }
        }
        break;
    }
    for (i = 0; i < this.pieces.length; i++) this._stepPiece(this.pieces[i], h);
    this.pieces = this.pieces.filter(function (q) { return q.state !== 'gone'; });
    if (this.state === 'round' || this.state === 'roundDone') {
      this._stepTower(h); this._stepGoal(h); this._stepMonkey(h); this._stepButterfly(h); this._stepGust(h); this._stepHint(h);
    }
    this._stepLulu(h);
  };

  P._stepRound = function (h) {
    var cfg = this.cfg;
    switch (this.phase) {
      case 'deal': {
        if (this._dealAt > 0 && this.time >= this._dealAt) { this._dealAt = -1; this._deal(); this._settleT = 0; }
        if (this._dealAt < 0) {
          var a = this.ask, all = this.pieces.some(function (p) { return p.askIdx === a; }) &&
            this.pieces.every(function (p) { return p.askIdx !== a || p.state === 'rest'; });
          if (all) { this._settleT += h; if (this._settleT >= cfg.dealSettle) this._startAsk(); }
        }
        break;
      }
      case 'ask': {
        var d = this._press, dragging = d && d.kind === 'piece', still = dragging && this.time - d.st >= 1;
        if (!dragging || still) this._idleT += h;   // a drag that does not move is not play
        if (dragging && this.time - d.st >= cfg.stillTime) {
          var sp0 = d.id;
          this.cancelDrag();
          this._emit({ type: 'stillDrag', pieceId: sp0 });   // main: "Let go over the tower!"
          break;
        }
        if (this._idleT >= this._idleGap - 1e-9) {
          this._idleT = 0;
          this._idleGap = Math.min(cfg.idleMax, this._idleGap * cfg.idleBackoff);
          this._idleN++;
          this._mood('think');
          var q = this._askObj();
          this._emit({ type: 'idle', n: this._idleN, promptKey: q.promptKey, params: q.params });
          if (this._idleN >= cfg.idleHintFrom) this._autoHint(true);
        }
        break;
      }
      case 'drop': case 'bounce': break;   // the falling / bouncing piece resolves it
      case 'done': this._stepDone(h); break;
    }
  };

  P._stepLulu = function (h) {
    var b = this.lulu, cfg = this.cfg, L = this.layout;
    b.x = L.lulu.x; b.y = L.lulu.y;
    if (b.moodT > 0) { b.moodT -= h; if (b.moodT <= 0) { b.moodT = 0; b.mood = 'idle'; } }
    b.blinkT -= h;
    if (b.blink && b.blinkT <= 0) { b.blink = false; b.blinkT = this._crng.float(cfg.blink[0], cfg.blink[1]); }
    else if (!b.blink && b.blinkT <= 0) { b.blink = true; b.blinkT = cfg.blinkTime; }
    // look: the dragged / flying piece, the monkey, else the tower top
    var tx = L.tower.x, ty = this.towerTop().y, act = null;
    for (var i = 0; i < this.pieces.length; i++) if (this.pieces[i].z >= 3) act = this.pieces[i];
    if (act) { tx = act.x; ty = act.y; } else if (this.monkey) { tx = this.monkey.x; ty = this.monkey.y; }
    else if (this.butterfly) { tx = this.butterfly.x; ty = this.butterfly.y; }
    b.lookX += (tx - b.lookX) * Math.min(1, h * cfg.lookRate);
    b.lookY += (ty - b.lookY) * Math.min(1, h * cfg.lookRate);
    b.look = clamp((b.lookX - b.x) / 500, -1, 1);
  };

  JT.World = World;
})(window.JT = window.JT || {});
