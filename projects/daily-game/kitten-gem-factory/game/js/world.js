/* Comet's Gem Factory — CGF.CONFIG, CGF.DIFFICULTY, CGF.GEMS, CGF.LEVELS, CGF.World
 * Headless, deterministic simulation (no DOM). Contract: docs/DESIGN.md §5. Motion: docs/MECHANICS.md.
 *
 * ============================== CONVENTIONS ==============================
 *  Units: logical px on the 960×540 stage, seconds, radians. y grows DOWN.
 *  update(dt) accepts any dt and runs fixed sub-steps of CONFIG.step (1/120 s) with an accumulator.
 *  After update, w.alpha = leftover/step in [0,1): draw  prev + (cur − prev) · alpha  for comet and
 *  flyers (prevX/prevY/prevRot are saved at the START of every sub-step).
 *  The result depends only on the seed and on the sub-step at which taps arrive.
 *
 *  Cards: x, y = TOP-LEFT of the card rect in its final place, w × h its size (like BOARD).
 *    (added) cx, cy = centre.  Draw at x + dealX + wiggleX, y − lift.
 *    flip 0 = back … 1 = face (already eased); squash = |cos(π·flip)|; back when flip < 0.5.
 *    (added) lift  px, 0 … CONFIG.flipLift, peaks mid-flip.
 *    (added) wiggleX px (damped sine, ±CONFIG.wiggleAmp), wiggleRot rad (small tilt).
 *    (added) pop 0..1 = popT / popTime (for the matched glow → pop-away animation).
 *  Comet: body centre (x, y), rotate(rot), sprite by state (+ flame 0..1 for the flame frames).
 * ========================================================================
 */
(function (CGF) {
  'use strict';

  var CONFIG = {
    // ---- stage / timing
    width: 960, height: 540,          // px, logical stage (DESIGN §2)
    step: 1 / 120,                    // s, fixed sub-step: stable springs, frame-rate independent
    maxSteps: 240,                    // sub-steps per update() call at most (2 s): a long tab-out never freezes the page

    // ---- geometry (DESIGN §2)
    FLOOR_Y: 478,
    BOARD: { x: 180, y: 76, w: 720, h: 392 },
    GIZMO: { x: 92, y: 478 },
    HOPPER: { x: 92, y: 322 },
    HOME: { x: 120, y: 200 },
    cardGap: 12,                      // px between cards
    cardMaxH: 124,                    // px, so the 4×3 board does not look bloated
    cardAspect: 0.86,                 // w/h for big cards (DESIGN allows 0.8…1.0): a slightly tall tile, like a real card
    cardAspectSmall: 1.0,             // w/h when cards are shorter than cardSmallH: square = the biggest finger target
    cardSmallH: 100,                  // px
    cardAspectMin: 0.8, cardAspectMax: 1.0,
    tapPad: 6,                        // px, hit-test grows each card by this (half the gap): forgiving for small fingers

    // ---- deal (cards slide in from the right along the conveyor)
    dealSlide: 0.55,                  // s, one card's slide (ease-out + small overshoot and settle)
    dealColStagger: 0.07,             // s between columns (left column first: it has the longest way)
    dealRowStagger: 0.03,             // s between rows inside a column
    dealFromX: 1000,                  // px, card's left edge starts here (just off the right edge)
    dealOvershoot: 9,                 // px past the slot before settling back
    dealSettle: 0.25,                 // fraction of dealSlide used to settle back from the overshoot

    // ---- cards
    flipTime: 0.22,                   // s, one flip (ease-in-out); the pair is judged when it ends
    flipLift: 6,                      // px, card lifts at mid-flip
    wiggleTime: 0.45,                 // s, wrong-pair shake
    wiggleAmp: 10,                    // px, peak shake amplitude
    wiggleFreq: 7,                    // Hz, ≈ 3 visible shakes
    wiggleDecay: 0.2,                 // s, exponential decay constant of the shake
    wiggleRot: 0.09,                  // rad, tilt that accompanies the shake
    popTime: 0.5,                     // s, matched card glows, then pops away → 'gone'

    // ---- rules
    pointsPerMatch: 10,
    multMax: 5,
    clearPerSecond: 5,                // points per whole second left on clear
    perfectBonus: 50,
    clearTime: 2.4,                   // s, celebration before the next season
    hurryAt: 10,                      // s left → 'hurry' (once per level)
    tickFrom: 5,                      // s left → 'tick' every whole second
    loopMul: 0.88, loopMin: 0.6,      // timeLimit × max(loopMin, loopMul^loop)

    // ---- Comet (damped spring steering)
    cometK: 34,                       // 1/s², spring stiffness → ω ≈ 5.8 rad/s (≈ 0.93 Hz): snappy but soft
    cometZeta: 0.78,                  // damping ratio: one tiny overshoot, then settles; no ringing
    cometAccelMax: 2400,              // px/s², rocket thrust limit: far trips accelerate, they don't teleport
    cometMaxSpeed: 680,               // px/s: crosses the board in ≈ 1.3 s
    cometHoverDY: -6,                 // px, hover target: at the card's top corner, in the gutter
    cometMinY: 96, cometMaxY: 446,    // px, keep the kitten on the stage (below the HUD)
    cometMinX: 40, cometMaxX: 920,
    cometIdle: 2.0,                   // s without a tap → back HOME
    cometBobAmp: 4,                   // px, gentle hover bob (target moves, the spring follows: smooth)
    cometBobFreq: 0.8,                // Hz
    cometRotMax: 0.35,                // rad, banking limit
    cometRotGain: 0.55,               // rad of bank at max speed (before the clamp)
    cometRotResp: 8,                  // 1/s, banking smoothing
    cometFlameResp: 10,               // 1/s, flame smoothing
    cometHappyTime: 0.9,              // s, one happy loop
    cometLoopR: 20,                   // px, loop radius
    cometHappyStiff: 5,               // × spring stiffness during the loop (so it really traces it)
    cometOopsTime: 0.8,               // s
    cometOopsKick: { vx: 0, vy: -220 },  // px/s, little startled hop
    cometSleep: { x: 196, y: 440 },   // px, naps on the floor next to Gizmo

    // ---- flyers (matched gems → Gizmo's hopper)
    flyApexMinY: 96,                  // px, the arc never rises into the HUD band
    flyApexRise: 70,                  // px, apex this far above the higher of start / hopper
    flyG: 1500,                       // px/s², gravity of the arc (a bit "toy-like", stronger than real scale)
    flyT0: 0.62,                      // s, base flight time …
    flyTPerPx: 1 / 1700,              // … + this per px of distance → 0.7–1.1 s
    flyStagger: 0.12,                 // s, the twin gem leaves a moment later
    flySpin: [5, 9],                  // rad/s, random spin speed (random sign)

    // ---- Gizmo
    gizmoEatTime: 0.45                // s, chomp after a gem lands
  };

  /* Difficulty presets. time[] per season (spring, summer, autumn, winter), seconds.
   * Rationale (docs/MECHANICS.md §6): a 4-year-old ≈ 2.5 s per tap and ≈ 2.2 attempts per pair. */
  var DIFFICULTY = {
    // Tuned by the high-speed playtest (docs/reports/playtest.md): 4-year-old model on Easy clears 97/87/79/69 %;
    // missLock (s) = a wrong pair can't be skipped by mashing a 3rd card for this long; loopMul/loopMin = next-year squeeze.
    easy:   { time: [105, 160, 215, 275], matchBonus: 6,   missDelay: 1.0, peek: 2.5, peekPerPair: 0.25, missPenalty: 1,        missLock: 1.0,  loopMul: 0.9,  loopMin: 0.75 },
    normal: { time: [60, 80, 100, 120],   matchBonus: 1.5, missDelay: 0.8, peek: 1.8, peekPerPair: 0.15, missPenalty: 2,        missLock: 0.6,  loopMul: 0.6,  loopMin: 0.5 },
    hard:   { time: [22, 28, 35, 42],     matchBonus: 1,   missDelay: 0.6, peek: 1.2, peekPerPair: 0.10, missPenalty: Infinity, missLock: 0.45, loopMul: 0.85, loopMin: 0.6 }
  };

  var GEMS = ['heart', 'drop', 'square', 'star', 'diamond', 'hexagon', 'round', 'triangle', 'moon', 'clover', 'octagon', 'bolt'];
  var LEVELS = [{ cols: 4, rows: 3 }, { cols: 4, rows: 4 }, { cols: 5, rows: 4 }, { cols: 6, rows: 4 }];

  /* ---------- helpers ---------- */
  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function easeInOut(p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }   // cubic
  function merge(base, over) {
    var o = {}, k;
    for (k in base) o[k] = base[k];
    if (over) for (k in over) if (over[k] !== undefined) o[k] = over[k];
    return o;
  }

  /* Deal slide offset for progress p ∈ [0,1] (px to the right of the slot).
   * 0 … 1−s : ease-out cubic from D to −O (arrives at the overshoot with zero speed)
   * 1−s … 1 : half-cosine from −O back to 0 (zero speed at both ends) → C¹-continuous. */
  function dealOffset(p, D, O, s) {
    if (p <= 0) return D;
    if (p >= 1) return 0;
    var a = 1 - s;
    if (p < a) { var u = 1 - p / a; return -O + (D + O) * u * u * u; }
    var q = (p - a) / s;
    return -O * (0.5 + 0.5 * Math.cos(Math.PI * q));
  }

  /* ================================ World ================================ */
  function World(opts) {
    opts = opts || {};
    this.cfg = merge(CONFIG, opts.config);
    this.difficulty = DIFFICULTY[opts.difficulty] ? opts.difficulty : 'easy';
    this.diff = merge(DIFFICULTY[this.difficulty], opts.diffConfig);       // (added) per-world overrides
    this.seed = opts.seed !== undefined ? opts.seed : 1;
    this.startLevel = Math.max(0, (opts.level | 0));
    this.customGem = !!opts.customGem;
    this.reset();
  }

  /** reset([seed]) — new game from the start level, score 0. */
  World.prototype.reset = function (seed) {
    var c = this.cfg;
    if (seed !== undefined) this.seed = seed;
    this.rng = CGF.RNG(this.seed);
    this.fx = this.rng.fork('fx');             // spin etc.: never shifts the decks
    this.t = 0;
    this._acc = 0;
    this.alpha = 0;
    this._events = [];
    this.score = 0;
    this.streak = 0;
    this.mult = 1;
    this.combo01 = 0;
    this.cursor = 0;
    this.cursorOn = false;
    this.stats = { flips: 0, matches: 0, misses: 0, brokenMisses: 0, levelsCleared: 0, perfectLevels: 0, bestStreak: 0, timeBonus: 0 };
    this.comet = { x: c.HOME.x, y: c.HOME.y, prevX: c.HOME.x, prevY: c.HOME.y, vx: 0, vy: 0, rot: 0, prevRot: 0,
      flame: 0.3, state: 'fly', stateT: 0,
      tx: c.HOME.x, ty: c.HOME.y };           // (added) current target
    this.gizmo = { state: 'idle', stateT: 0, eaten: 0 };
    this._gizmoBase = 'idle';
    this.flyers = [];
    this._pendingFly = [];
    this._flyerId = 1;
    this._loadLevel(this.startLevel);
    return this;
  };

  World.prototype._emit = function (e) { this._events.push(e); };
  World.prototype.drainEvents = function () { var e = this._events; this._events = []; return e; };

  /* ------------------------------ level setup ------------------------------ */
  World.prototype.loopFactor = function (level) {
    var c = this.cfg, d = this.diff || {};
    var mul = d.loopMul != null ? d.loopMul : c.loopMul, min = d.loopMin != null ? d.loopMin : c.loopMin;
    return Math.max(min, Math.pow(mul, Math.floor(level / 4)));
  };
  World.prototype.timeLimitFor = function (level) { return this.diff.time[level % 4] * this.loopFactor(level); };

  /* Card size for a cols×rows grid inside BOARD (gap, aspect 0.8…1.0, max h). */
  World.prototype.layoutFor = function (cols, rows) {
    var c = this.cfg, B = c.BOARD, g = c.cardGap;
    var availW = (B.w - g * (cols - 1)) / cols, availH = (B.h - g * (rows - 1)) / rows;
    var h = Math.min(c.cardMaxH, availH);
    var w = Math.min(availW, h * (h < c.cardSmallH ? c.cardAspectSmall : c.cardAspect));
    if (w / h < c.cardAspectMin) h = w / c.cardAspectMin;
    w = Math.floor(w); h = Math.floor(h);
    if (w / h > c.cardAspectMax) w = h;
    var gw = cols * w + (cols - 1) * g, gh = rows * h + (rows - 1) * g;
    return { cardW: w, cardH: h, gap: g, x0: Math.round(B.x + (B.w - gw) / 2), y0: Math.round(B.y + (B.h - gh) / 2), gridW: gw, gridH: gh };
  };

  World.prototype._loadLevel = function (level) {
    var c = this.cfg, d = this.diff;
    this.level = level;
    this.season = level % 4;
    this.loop = Math.floor(level / 4);
    var L = LEVELS[this.season];
    this.cols = L.cols; this.rows = L.rows;
    this.pairs = (L.cols * L.rows) / 2;
    this.pairsLeft = this.pairs;
    this.timeLimit = this.timeLimitFor(level);
    this.timeLeft = this.timeLimit;
    this.peekT = d.peek + d.peekPerPair * (this.pairs - 6);
    this.phase = 'deal';
    this.phaseT = 0;
    this._open = [];
    this._wrong = null;
    this._broken = false;          // a combo-breaking miss this level?
    this._levelFlips = 0;          // flips this level (tidy bonus)
    this._hurry = false;
    this._lastTapT = -1e9;
    this._lastCard = -1;
    this.cursor = Math.min(this.cursor, L.cols * L.rows - 1);
    if (this.cursor < 0) this.cursor = 0;

    // deck: `pairs` distinct kinds, two of each, shuffled
    var kinds = this.rng.shuffle(GEMS.slice()).slice(0, this.pairs);
    if (this.customGem) kinds[kinds.length - 1] = 'custom';
    var deck = this.rng.shuffle(kinds.concat(kinds));

    var lay = this.layout = this.layoutFor(L.cols, L.rows);
    this.cards = [];
    var maxDeal = 0;
    for (var i = 0; i < deck.length; i++) {
      var col = i % L.cols, row = Math.floor(i / L.cols);
      var x = lay.x0 + col * (lay.cardW + lay.gap), y = lay.y0 + row * (lay.cardH + lay.gap);
      var dealT = col * c.dealColStagger + row * c.dealRowStagger + c.dealSlide;
      if (dealT > maxDeal) maxDeal = dealT;
      this.cards.push({
        id: i, kind: deck[i], col: col, row: row, x: x, y: y, w: lay.cardW, h: lay.cardH,
        cx: x + lay.cardW / 2, cy: y + lay.cardH / 2,
        state: 'down', flip: 0, seen: false, wiggleT: 0, popT: 0,
        dealT: dealT, dealX: c.dealFromX - x,
        lift: 0, wiggleX: 0, wiggleRot: 0, pop: 0,
        _fl: 0, _ft: 0, _wasSeen: false
      });
    }
    this._dealTotal = maxDeal;
    this.comet.state = 'fly'; this.comet.stateT = 0;
    this._gizmoBase = 'idle'; this.gizmo.state = 'idle'; this.gizmo.stateT = 0;
    this._emit({ type: 'deal', level: level, season: this.season });
  };

  /** gotoLevel(i) — jump to a level (debug / level select). Score and stats are kept. */
  World.prototype.gotoLevel = function (i) { this._loadLevel(Math.max(0, i | 0)); };

  /* ------------------------------ input ------------------------------ */
  World.prototype.cardAt = function (x, y) {
    var p = this.cfg.tapPad;
    for (var i = 0; i < this.cards.length; i++) {
      var k = this.cards[i];
      if (k.state === 'gone') continue;
      if (x >= k.x - p && x < k.x + k.w + p && y >= k.y - p && y < k.y + k.h + p) return i;
    }
    return -1;
  };

  World.prototype.tapAt = function (x, y) {
    this.cursorOn = false;
    var i = this.cardAt(x, y);
    return i >= 0 ? this.tap(i) : false;
  };

  World.prototype.moveCursor = function (dx, dy) {
    if (!this.cursorOn) { this.cursorOn = true; return; }     // first key press only shows the highlight
    var col = this.cursor % this.cols, row = Math.floor(this.cursor / this.cols);
    col = clamp(col + (dx | 0), 0, this.cols - 1);
    row = clamp(row + (dy | 0), 0, this.rows - 1);
    this.cursor = row * this.cols + col;
  };

  World.prototype.tapCursor = function () { this.cursorOn = true; return this.tap(this.cursor); };

  World.prototype.tap = function (i) {
    if (this.phase !== 'playing') return false;
    var k = this.cards[i];
    // a card still closing (e.g. right after "Go!") may be tapped: it simply turns back up
    if (!k || k.state !== 'down' || (k.flip >= 0.05 && k._ft !== 0) || k.wiggleT > 0) return false;
    if (this._open.length >= 2) return false;               // pair still flipping / being judged (≤ 0.22 s)
    // a 3rd tap closes a wrong pair at once, but only after missLock s, so mashing can't skip misses for free
    if (this._wrong && this._wrongT0 - this._wrong.t < (this.diff.missLock || 0)) return false;
    if (this._wrong) this._closeWrong();
    k.state = 'up'; k._ft = 1;
    k._wasSeen = k.seen; k.seen = true;
    this._open.push(i);
    this.stats.flips++; this._levelFlips = (this._levelFlips || 0) + 1;
    this._lastTapT = this.t; this._lastCard = i;
    this._emit({ type: 'flip', id: k.id, x: k.cx, y: k.cy });
    return true;
  };

  World.prototype._closeWrong = function () {
    var ids = this._wrong.ids;
    for (var j = 0; j < ids.length; j++) {
      var k = this.cards[ids[j]];
      k.state = 'down'; k._ft = 0; k.wiggleT = 0; k.wiggleX = 0; k.wiggleRot = 0;
    }
    this._wrong = null;
    this._emit({ type: 'flipBack', ids: ids.slice() });
  };

  /* ------------------------------ rules ------------------------------ */
  World.prototype._setStreak = function (s) {
    var old = this.mult;
    this.streak = Math.max(0, s);
    if (this.streak > this.stats.bestStreak) this.stats.bestStreak = this.streak;
    this.mult = Math.min(this.cfg.multMax, Math.max(1, this.streak));
    this.combo01 = Math.min(1, this.streak / this.cfg.multMax);
    if (this.mult > old) this._emit({ type: 'comboUp', mult: this.mult });
    else if (this.mult < old) this._emit({ type: 'comboDown', mult: this.mult });
  };

  World.prototype._judge = function () {
    var c = this.cfg, a = this.cards[this._open[0]], b = this.cards[this._open[1]];
    this._open = [];
    var ids = [a.id, b.id];
    if (a.kind === b.kind) {
      a.state = b.state = 'matched'; a.popT = b.popT = 0;
      this.stats.matches++;
      this._setStreak(this.streak + 1);
      var pts = c.pointsPerMatch * this.mult;
      this.score += pts;
      this.pairsLeft--;
      this._emit({ type: 'match', ids: ids, kind: a.kind, x: (a.cx + b.cx) / 2, y: (a.cy + b.cy) / 2, score: pts, mult: this.mult, total: this.score });
      var bonus = this.diff.matchBonus;
      this.timeLeft = Math.min(this.timeLimit, this.timeLeft + bonus);
      this.stats.timeBonus += bonus;
      this._emit({ type: 'timeBonus', s: bonus });
      this._launch(a, 0); this._launch(b, c.flyStagger);
      this._cometState('happy');
      if (this.pairsLeft <= 0) this._clear();
    } else {
      var broke = a._wasSeen || b._wasSeen;
      this.stats.misses++;
      a.wiggleT = b.wiggleT = c.wiggleTime;
      this._wrong = { ids: ids, t: Math.max(this.diff.missDelay, c.wiggleTime) };
      this._wrongT0 = this._wrong.t;
      this._emit({ type: 'miss', ids: ids, broke: broke });
      if (broke) {
        this.stats.brokenMisses++;
        this._broken = true;
        var pen = this.diff.missPenalty;
        this._setStreak(pen === Infinity ? 0 : this.streak - pen);
        this._cometState('oops');
      }
    }
  };

  World.prototype._clear = function () {
    var c = this.cfg;
    var perfect = !this._broken;
    // tidy bonus: the time bonus is scaled by accuracy (pairs / pair-attempts), so a random sweep can't out-score memory
    var acc = Math.min(1, this.pairs / Math.max(1, (this._levelFlips || 0) / 2));
    var tb = Math.round(c.clearPerSecond * Math.ceil(Math.max(0, this.timeLeft)) * acc);
    var bonus = tb + (perfect ? c.perfectBonus : 0);
    this.score += bonus;
    this.stats.levelsCleared++;
    if (perfect) this.stats.perfectLevels++;
    this.phase = 'clear'; this.phaseT = 0;
    this._gizmoBase = 'happy';
    if (this.gizmo.state !== 'eat') { this.gizmo.state = 'happy'; this.gizmo.stateT = 0; }
    this._emit({ type: 'levelClear', level: this.level, bonus: bonus, perfect: perfect, timeBonus: tb, perfectBonus: perfect ? c.perfectBonus : 0 });
  };

  World.prototype._over = function () {
    this.timeLeft = 0;
    this.phase = 'over'; this.phaseT = 0;
    this._gizmoBase = 'sleep'; this.gizmo.state = 'sleep'; this.gizmo.stateT = 0;
    this._cometState('sleep');
    this._emit({ type: 'gameOver', score: this.score });
  };

  /* ------------------------------ flyers ------------------------------ */
  World.prototype._launch = function (card, delay) {
    this._pendingFly.push({ kind: card.kind, x: card.cx, y: card.cy, size: Math.min(card.w, card.h) * 0.74, delay: delay });
  };

  World.prototype._spawnFlyer = function (p) {
    var c = this.cfg, H = c.HOPPER;
    var dx = H.x - p.x, dy = H.y - p.y, dist = Math.sqrt(dx * dx + dy * dy);
    // pick the apex first (never up into the HUD band: apex ≥ flyApexMinY), then derive the throw
    var g = c.flyG;
    var apexY = Math.max(c.flyApexMinY, Math.min(p.y, H.y) - c.flyApexRise);
    if (apexY > p.y - 12) apexY = p.y - 12;                     // always rise a little first
    var vy = -Math.sqrt(2 * g * (p.y - apexY));
    var T = (-vy + Math.sqrt(vy * vy + 2 * g * dy)) / g;
    var vx = dx / T;
    var spin = this.fx.range(c.flySpin[0], c.flySpin[1]) * this.fx.sign();
    this.flyers.push({ id: this._flyerId++, kind: p.kind, x: p.x, y: p.y, prevX: p.x, prevY: p.y, vx: vx, vy: vy,
      rot: 0, prevRot: 0, t: 0, T: T, size: p.size || 56,
      x0: p.x, y0: p.y, vx0: vx, vy0: vy, g: g, spin: spin });      // (added) launch data
  };

  World.prototype._stepFlyers = function (dt) {
    var i, c = this.cfg;
    for (i = this._pendingFly.length - 1; i >= 0; i--) {
      var p = this._pendingFly[i];
      p.delay -= dt;
      if (p.delay <= 0) { this._pendingFly.splice(i, 1); this._spawnFlyer(p); }
    }
    for (i = this.flyers.length - 1; i >= 0; i--) {
      var f = this.flyers[i];
      f.prevX = f.x; f.prevY = f.y; f.prevRot = f.rot;
      f.t += dt;
      if (f.t >= f.T) {
        f.t = f.T; f.x = c.HOPPER.x; f.y = c.HOPPER.y;
        f.vy = f.vy0 + f.g * f.T;
        this.flyers.splice(i, 1);
        this.gizmo.eaten++;
        if (this._gizmoBase !== 'sleep') { this.gizmo.state = 'eat'; this.gizmo.stateT = 0; }
        this._emit({ type: 'gemLand', kind: f.kind });
        continue;
      }
      // exact ballistic solution (no integration drift)
      f.x = f.x0 + f.vx0 * f.t;
      f.y = f.y0 + f.vy0 * f.t + 0.5 * f.g * f.t * f.t;
      f.vy = f.vy0 + f.g * f.t;
      f.rot += f.spin * dt;
    }
  };

  /* ------------------------------ Comet ------------------------------ */
  World.prototype._cometState = function (s) {
    var m = this.comet;
    if (m.state === 'sleep' && s !== 'sleep') return;
    m.state = s; m.stateT = 0;
    if (s === 'oops') { m.vx += this.cfg.cometOopsKick.vx; m.vy += this.cfg.cometOopsKick.vy; }
  };

  World.prototype._stepComet = function (dt) {
    var c = this.cfg, m = this.comet;
    m.prevX = m.x; m.prevY = m.y; m.prevRot = m.rot;
    m.stateT += dt;
    if (m.state === 'happy' && m.stateT >= c.cometHappyTime && this.phase !== 'clear') { m.state = 'fly'; m.stateT = 0; }
    if (m.state === 'oops' && m.stateT >= c.cometOopsTime) { m.state = 'fly'; m.stateT = 0; }

    // ---- target
    var tx, ty, k = c.cometK, amax = c.cometAccelMax;
    if (m.state === 'sleep') { tx = c.cometSleep.x; ty = c.cometSleep.y; }
    else {
      var card = this._lastCard >= 0 ? this.cards[this._lastCard] : null;
      if (this.phase === 'playing' && card && this.t - this._lastTapT < c.cometIdle) {
        // hover at the gutter corner beside the card, never over a gem
        tx = card.cx < 540 ? card.x + card.w + 6 : card.x - 6; ty = card.y + c.cometHoverDY;
      } else { tx = c.HOME.x; ty = c.HOME.y; }
      tx = clamp(tx, c.cometMinX, c.cometMaxX); ty = clamp(ty, c.cometMinY, c.cometMaxY);
      ty += Math.sin(this.t * TAU * c.cometBobFreq) * c.cometBobAmp;     // hover bob
      if (m.state === 'happy') {                                       // loop-the-loop offset
        var th = TAU * ((m.stateT % c.cometHappyTime) / c.cometHappyTime);
        var up = ty - 2 * c.cometLoopR >= c.cometMinY - c.cometBobAmp ? -1 : 1;   // no room above → loop downwards
        tx += c.cometLoopR * Math.sin(th);
        ty += up * c.cometLoopR * (1 - Math.cos(th));
        k *= c.cometHappyStiff; amax *= 2;
      }
    }
    m.tx = tx; m.ty = ty;

    // ---- damped spring:  a = k·(target − x) − 2ζ√k·v, thrust-limited
    var cd = 2 * c.cometZeta * Math.sqrt(k);
    var ax = k * (tx - m.x) - cd * m.vx, ay = k * (ty - m.y) - cd * m.vy;
    var am = Math.sqrt(ax * ax + ay * ay);
    if (am > amax) { ax *= amax / am; ay *= amax / am; am = amax; }
    m.vx += ax * dt; m.vy += ay * dt;
    var sp = Math.sqrt(m.vx * m.vx + m.vy * m.vy);
    if (sp > c.cometMaxSpeed) { m.vx *= c.cometMaxSpeed / sp; m.vy *= c.cometMaxSpeed / sp; }
    m.x += m.vx * dt; m.y += m.vy * dt;
    if (m.x < c.cometMinX - 20) { m.x = c.cometMinX - 20; m.vx = 0; }
    if (m.x > c.cometMaxX + 20) { m.x = c.cometMaxX + 20; m.vx = 0; }
    if (m.y < c.cometMinY - 20) { m.y = c.cometMinY - 20; m.vy = 0; }
    if (m.y > c.cometMaxY + 20) { m.y = c.cometMaxY + 20; m.vy = 0; }

    // ---- banking + flame (exponential smoothing; frame-rate independent)
    var rt = clamp(m.vx / c.cometMaxSpeed * c.cometRotGain, -c.cometRotMax, c.cometRotMax);
    m.rot += (rt - m.rot) * (1 - Math.exp(-c.cometRotResp * dt));
    m.rot = clamp(m.rot, -c.cometRotMax, c.cometRotMax);
    var ft = m.state === 'sleep' ? 0 : 0.25 + 0.75 * Math.min(1, am / c.cometAccelMax);
    m.flame += (ft - m.flame) * (1 - Math.exp(-c.cometFlameResp * dt));
  };

  /* ------------------------------ step ------------------------------ */
  World.prototype._stepCards = function (dt) {
    var c = this.cfg, rate = dt / c.flipTime;
    for (var i = 0; i < this.cards.length; i++) {
      var k = this.cards[i];
      k.prevDealX = k.dealX;                          // renderer interpolates the slide with w.alpha
      if (k.dealT > 0) {
        k.dealT -= dt;
        var p = 1 - Math.max(0, k.dealT) / c.dealSlide;
        k.dealX = dealOffset(p, c.dealFromX - k.x, c.dealOvershoot, c.dealSettle);
        if (k.dealT <= 0) { k.dealT = 0; k.dealX = 0; }
      }
      if (k._fl < k._ft) k._fl = Math.min(k._ft, k._fl + rate);
      else if (k._fl > k._ft) k._fl = Math.max(k._ft, k._fl - rate);
      k.flip = easeInOut(k._fl);
      k.lift = c.flipLift * Math.sin(Math.PI * k._fl);
      if (k.wiggleT > 0) {
        k.wiggleT = Math.max(0, k.wiggleT - dt);
        var tau = c.wiggleTime - k.wiggleT, env = Math.exp(-tau / c.wiggleDecay) * (k.wiggleT / c.wiggleTime);
        var s = Math.sin(TAU * c.wiggleFreq * tau);
        k.wiggleX = c.wiggleAmp * env * s;          // |wiggleX| ≤ wiggleAmp
        k.wiggleRot = c.wiggleRot * env * s;
      } else { k.wiggleX = 0; k.wiggleRot = 0; }
      if (k.state === 'matched') {
        k.popT += dt;
        k.pop = Math.min(1, k.popT / c.popTime);
        if (k.popT >= c.popTime) k.state = 'gone';
      }
    }
  };

  World.prototype._step = function (dt) {
    var c = this.cfg, i;
    this.t += dt;
    this.phaseT += dt;
    this._stepCards(dt);

    if (this.phase === 'deal') {
      if (this.phaseT >= this._dealTotal) {
        this.phase = 'peek'; this.phaseT = 0;
        for (i = 0; i < this.cards.length; i++) this.cards[i]._ft = 1;
        this._emit({ type: 'peekStart' });
      }
    } else if (this.phase === 'peek') {
      if (this.phaseT >= c.flipTime + this.peekT) {
        for (i = 0; i < this.cards.length; i++) this.cards[i]._ft = 0;
        this.phase = 'playing'; this.phaseT = 0;
        this._emit({ type: 'peekEnd' });
      }
    } else if (this.phase === 'playing') {
      // judge the open pair once both flips are done
      if (this._open.length === 2 && this.cards[this._open[0]]._fl >= 1 && this.cards[this._open[1]]._fl >= 1) this._judge();
      if (this._wrong) { this._wrong.t -= dt; if (this._wrong.t <= 0) this._closeWrong(); }
      if (this.phase === 'playing') {
        var prev = this.timeLeft;
        this.timeLeft -= dt;
        if (!this._hurry && prev > c.hurryAt && this.timeLeft <= c.hurryAt) { this._hurry = true; this._emit({ type: 'hurry' }); }
        for (var s = c.tickFrom; s >= 1; s--) if (prev > s && this.timeLeft <= s) this._emit({ type: 'tick', s: s });
        if (this.timeLeft <= 0) this._over();
      }
    } else if (this.phase === 'clear') {
      if (this.phaseT >= c.clearTime) {
        this._loadLevel(this.level + 1);
        this._emit({ type: 'levelUp', level: this.level, season: this.season });
      }
    }

    this._stepFlyers(dt);
    this._stepComet(dt);
    var gz = this.gizmo;
    gz.stateT += dt;
    if (gz.state === 'eat' && gz.stateT >= c.gizmoEatTime) { gz.state = this._gizmoBase; gz.stateT = 0; }
  };

  World.prototype.update = function (dt) {
    var step = this.cfg.step;
    if (!(dt > 0)) { this.alpha = this._acc / step; return; }
    this._acc += dt;
    var n = 0;
    while (this._acc >= step && n < this.cfg.maxSteps) { this._step(step); this._acc -= step; n++; }
    if (n >= this.cfg.maxSteps) this._acc = Math.min(this._acc, step * 0.999);
    this.alpha = this._acc / step;
  };

  /** Snapshot of scalars + live references to cards / comet / gizmo / flyers / stats (read-only!). */
  World.prototype.getState = function () {
    return {
      t: this.t, phase: this.phase, phaseT: this.phaseT, peekT: this.peekT,
      level: this.level, season: this.season, loop: this.loop,
      timeLeft: this.timeLeft, timeLimit: this.timeLimit,
      score: this.score, streak: this.streak, mult: this.mult, combo01: this.combo01,
      pairs: this.pairs, pairsLeft: this.pairsLeft, cols: this.cols, rows: this.rows,
      cursor: this.cursor, cursorOn: this.cursorOn, difficulty: this.difficulty, alpha: this.alpha,
      cards: this.cards, comet: this.comet, gizmo: this.gizmo, flyers: this.flyers, stats: this.stats,
      layout: this.layout
    };
  };

  CGF.CONFIG = CONFIG;
  CGF.DIFFICULTY = DIFFICULTY;
  CGF.GEMS = GEMS;
  CGF.LEVELS = LEVELS;
  CGF.World = World;
  CGF._dealOffset = dealOffset;     // exposed for tests / docs
})(window.CGF = window.CGF || {});
