/* Foxy's Reef Memory — RF.CONFIG + RF.World (headless, deterministic simulation)
 *
 * ============================== CONVENTIONS ==============================
 *  Units: logical px (960×540 canvas), seconds, radians. y grows DOWN.
 *  update(dt) accepts any dt and runs fixed sub-steps of cfg.step (1/120 s)
 *  with an accumulator (w._acc = leftover time, 0..step). Results depend only
 *  on the seed and on the sub-step index at which select()/moveCursor() are called.
 *
 *  Render interpolation: at the START of every sub-step the previous position
 *  is saved as `_px,_py` on every card, on the fox and on every cupcake.
 *  Renderer: drawX = _px + (x - _px) * (w._acc / w.cfg.step).
 *
 *  Card drawing: centre (x,y), size cardW×cardH × scale, rotate(rot), alpha.
 *  flip 0 = back, 1 = face (draw back when flip < 0.5, face when ≥ 0.5;
 *  horizontal squash = |1 − 2·flip|). wiggle 0..1 (rot already includes it),
 *  glow 0..1 (match halo).
 *
 *  Fox drawing: translate(x, y + bob) → rotate(angle) → scale(flipX, 1) →
 *  draw the right-facing sprite `fox_<frame>` centred.
 *
 *  Board cells: card.col / card.row are ALWAYS the card's target cell. During a
 *  gravity slide card.moving is true and x,y travel toward that cell.
 * ========================================================================
 */
(function (RF) {
  'use strict';

  /* All tunables. Override per-world with new RF.World({ config: {...} }). */
  var CONFIG = {
    // --- screen / timing
    width: 960, height: 540,
    step: 1 / 120,            // s, fixed simulation sub-step

    // --- board layout (DESIGN §2)
    trayX: 585, trayY: 305,   // px, tray centre (below the HUD band)
    trayMaxW: 590, trayMaxH: 430,
    trayPad: 16,              // px, tray padding around the grid (clamped to max size)
    cardW: 76, cardH: 88, cardGap: 8,    // 6×4 grid → 496×376, clear of the HUD
    grids: [[4, 3], [4, 4], [5, 4], [6, 4]],   // [cols, rows] per season
    faceCount: 12,

    // --- deal / peek
    introDelay: 1.4,          // s, empty tray while the season banner shows, then the deal
    dealTotal: 0.9,           // s, first card starts → last card lands
    dealFly: 0.45,            // s, one card's flight
    dealFromY: 640,           // px, cards rise in from below the screen…
    dealSpread: 0.35,         // …fanned out sideways by this fraction of their x-offset
    peekTime: 0,              // s, all faces shown after the deal (Easy: 2)

    // --- card timings
    flipTime: 0.18,           // s, eased flip
    matchGlow: 0.25,          // s, glow before the pop
    matchPop: 0.35,           // s, pop up then shrink to 0
    mismatchWiggle: 0.4,      // s, shake duration
    mismatchShow: 0.8,        // s, mismatched pair stays visible (3rd tap closes early)

    // --- gravity slide (the twist)
    slideAccel: 900,          // px/s², start-up acceleration
    slideMaxSpeed: 260,       // px/s
    slideBrake: 1600,         // px/s², braking into the cell
    slideArrive: 70,          // px/s, speed kept on arrival → small spring overshoot
    settleFreq: 3.4,          // Hz, settle spring natural frequency
    settleDamp: 0.5,          // settle spring damping ratio (≈ 2–3 px overshoot)

    // --- air (timer)
    airMax: [60, 75, 95, 115],// s per season, lap 0
    lapAirMul: 0.7,           // airMax and airPerMatch × lapAirMul^lap (endless laps get tight) …
    lapAirMin: 0.15,          // … but never below this fraction
    airPerMatch: 3,           // s refilled on each match (capped at airMax), lap 0
    airLowFrac: 0.25,         // 'airlow' event below this fraction
    airLowRearm: 0.4,         // re-armed once air climbs back above this fraction
    airDrainInSlides: true,   // documented choice: air drains while cards slide

    // --- score
    pointsPerMatch: 10,
    comboCap: 5,
    airBonusPerSec: 1,
    mismatchPenalty: 1,       // s of air lost when a mismatch re-flips an already-seen card
    penaltyFloor: 1,          // s, the penalty never takes air below this
    cheerCombo: 3,            // Foxy cheers at combo ≥ this
    clearTime: 2.5,           // s, 'cleared' celebration before the next level

    // --- Foxy
    foxZone: { x0: 20, x1: 250, y0: 90, y1: 470 },
    foxBounds: { x0: 20, x1: 940, y0: 70, y1: 480 },
    foxStartX: 135, foxStartY: 280,
    foxIdleSpeed: 55,         // px/s wander
    foxFetchSpeed: 190,       // px/s swimming to a cupcake
    foxAccel: 420,            // px/s², max steering force → smooth turns
    foxArrive: 70,            // px, slow-down radius (arrive behaviour)
    foxWander: [1.8, 3.6],    // s between new wander points
    foxEatRadius: 28,         // px
    foxEatTime: 0.4, foxOopsTime: 0.6, foxCheerTime: 0.9,
    foxBobAmp: 4, foxBobFreq: 0.6,
    foxTurnRate: 4.5,          // 1/s, angle smoothing
    foxMaxTilt: 0.35,         // rad
    foxSurfaceSpeed: 110,      // px/s, floats up when out of air

    // --- cupcakes
    cupcakeRise: 22,          // px/s terminal buoyant rise
    cupcakeDrift: 220,        // px/s max drift toward Foxy (she waits until it leaves the card area)
    cupcakePopVy: -70,        // px/s initial upward pop
    cupcakeEase: 2,           // 1/s velocity relaxation (water drag)
    cupcakeWobble: 10,        // px sway amplitude
    cupcakeWobbleFreq: 1.6,   // Hz
    cupcakeTopY: 150,         // px, stops rising here
    cupcakeLife: 12           // s, then it just pops (no points)
  };

  /* Difficulty presets (suggestions — integrator maps menu choice to these overrides). */
  var DIFFICULTY = {
    easy:   { peekTime: 2, airMax: [90, 110, 135, 160], airPerMatch: 4, mismatchShow: 1.0, lapAirMul: 0.85, lapAirMin: 0.4, mismatchPenalty: 0.5 },
    normal: { peekTime: 1 },
    hard:   { peekTime: 0, airMax: [40, 50, 62, 75], airPerMatch: 2, mismatchShow: 0.6, lapAirMul: 0.7, lapAirMin: 0.12, mismatchPenalty: 1.5 }
  };

  /* ---------- helpers ---------- */
  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOutCubic(t) { var u = 1 - t; return 1 - u * u * u; }
  function easeOutBack(t) { var c1 = 1.4, c3 = c1 + 1, u = t - 1; return 1 + c3 * u * u * u + c1 * u * u; }
  function easeInOutSine(t) { return 0.5 - 0.5 * Math.cos(Math.PI * t); }
  function merge(base, over) {
    var o = {}, k;
    for (k in base) o[k] = base[k];
    if (over) for (k in over) if (over[k] !== undefined) o[k] = over[k];
    return o;
  }
  var SWIM = ['swim1', 'swim2', 'swim3', 'swim2'];

  /* ================================ World ================================ */
  function World(opts) {
    opts = opts || {};
    this.cfg = merge(CONFIG, opts.config);
    this.seed = opts.seed !== undefined ? opts.seed : 1;
    this.width = this.cfg.width;
    this.height = this.cfg.height;
    this.reset();
  }

  /** reset([seed]) — new game: level 0 (spring), score 0, full air, state 'ready' (dealing). */
  World.prototype.reset = function (seed) {
    var c = this.cfg;
    if (seed !== undefined) this.seed = seed;
    this.rng = new RF.RNG(this.seed);
    this._fxRng = this.rng.fork('fx');            // fox/cupcake randomness (independent of boards)
    this._autumnSign = this.rng.chance(0.5) ? 1 : -1;
    this.time = 0;
    this.score = 0; this.combo = 0; this.bestCombo = 0;
    this.matches = 0; this.mistakes = 0; this.cupcakesEaten = 0;
    this.moves = 0;                              // added: pair attempts (2nd card flipped)
    this.levelsCleared = 0;                      // added
    this._acc = 0;
    this._events = [];
    this._nextId = 1;
    this.cards = [];
    this.fox = {
      x: c.foxStartX, y: c.foxStartY, vx: 0, vy: 0, angle: 0, flipX: 1,
      frame: 'swim1', mood: 'idle', bob: 0, _px: c.foxStartX, _py: c.foxStartY,
      target: { x: c.foxStartX, y: c.foxStartY }, // added: current steering target
      _act: null, _actT: 0, _swim: 0, _wanderT: 0
    };
    // NOTE: DESIGN §5.1 uses `w.cupcakes` for both the list and the counter.
    // w.cupcakes = the LIST of floating cupcakes; w.cupcakesEaten = the counter.
    this.cupcakes = [];
    // interop: code that treats w.cupcakes as the counter ('× ' + w.cupcakes, `${w.cupcakes}`)
    // still shows the eaten count. Prefer w.cupcakesEaten for the number.
    var self = this;
    Object.defineProperty(this.cupcakes, 'valueOf', { value: function () { return self.cupcakesEaten; } });
    Object.defineProperty(this.cupcakes, 'toString', { value: function () { return String(self.cupcakesEaten); } });
    this.startLevel(0);
    return this;
  };

  World.prototype._emit = function (e) { this._events.push(e); };
  World.prototype.drainEvents = function () { var e = this._events; this._events = []; return e; };

  /* ------------------------------ level setup ------------------------------ */
  World.prototype.lapFactor = function (i) {
    var c = this.cfg;
    return Math.max(c.lapAirMin, Math.pow(c.lapAirMul, Math.floor(i / 4)));
  };
  World.prototype.levelAirMax = function (i) { return this.cfg.airMax[i % 4] * this.lapFactor(i); };

  World.prototype.cellPos = function (col, row) {
    var c = this.cfg, gw = this.cols * c.cardW + (this.cols - 1) * c.cardGap,
      gh = this.rows * c.cardH + (this.rows - 1) * c.cardGap;
    return {
      x: c.trayX - gw / 2 + c.cardW / 2 + col * (c.cardW + c.cardGap),
      y: c.trayY - gh / 2 + c.cardH / 2 + row * (c.cardH + c.cardGap)
    };
  };

  World.prototype.startLevel = function (i) {
    var c = this.cfg;
    i = Math.max(0, i | 0);
    this.level = i;
    this._seen = {};              // card ids the player has already looked at this level (for the mismatch penalty)
    this.season = i % 4;
    this.lap = Math.floor(i / 4);
    this.levelTime = 0;
    var g = c.grids[this.season];
    this.cols = g[0]; this.rows = g[1];
    this.pairs = (this.cols * this.rows) / 2;          // added
    this.airMax = this.levelAirMax(i);
    this.air = this.airMax;
    this.airPerMatch = this.cfg.airPerMatch * this.lapFactor(i);   // added: refill for this level
    this._airLowArmed = true;
    this.combo = 0;
    this.gravity = this.season === 0 ? { x: 0, y: -1 } :
      this.season === 1 ? { x: 0, y: 0 } :
      this.season === 2 ? { x: this._autumnSign * (this.lap % 2 === 0 ? 1 : -1), y: 0 } : { x: 0, y: 1 };
    var gw = this.cols * c.cardW + (this.cols - 1) * c.cardGap,
      gh = this.rows * c.cardH + (this.rows - 1) * c.cardGap;
    var tw = Math.min(gw + 2 * c.trayPad, c.trayMaxW), th = Math.min(gh + 2 * c.trayPad, c.trayMaxH);
    this.tray = { x: c.trayX - tw / 2, y: c.trayY - th / 2, w: tw, h: th, cx: c.trayX, cy: c.trayY };
    this.cursor = { col: 0, row: 0 };
    this.open = [];               // added: ids face-up and not yet resolved (0..2)
    this._mismatch = null;        // { ids, timer }
    this._allMatched = false;
    this.peeking = false;         // added: true while peek shows all faces
    this.phase = 'deal';          // added: 'deal' | 'peek' | 'peekEnd' | 'play' | 'cleared' | 'dead'
    this._phaseT = 0;
    this._clearT = 0;

    // faces: random pairs from the 12, positions shuffled — board RNG depends only on seed + level
    var r = new RF.RNG(this.seed).fork('level' + i);
    var faces = [], k;
    for (k = 0; k < c.faceCount; k++) faces.push(k);
    shuffle(faces, r);
    var deck = [];
    for (k = 0; k < this.pairs; k++) { deck.push(faces[k % faces.length]); deck.push(faces[k % faces.length]); }
    shuffle(deck, r);

    this.cards = [];
    var n = deck.length, stagger = n > 1 ? (c.dealTotal - c.dealFly) / (n - 1) : 0;
    for (k = 0; k < n; k++) {
      var col = k % this.cols, row = Math.floor(k / this.cols), p = this.cellPos(col, row);
      var sx = c.trayX + (p.x - c.trayX) * (1 + c.dealSpread), sy = c.dealFromY + row * 12;
      this.cards.push({
        id: this._nextId++, face: deck[k], col: col, row: row,
        x: sx, y: sy, vx: 0, vy: 0, _px: sx, _py: sy,
        flip: 0, state: 'down', wiggle: 0, glow: 0, scale: 1, alpha: 0,
        rot: 0,                    // added: radians (deal spin + mismatch wiggle)
        moving: false,             // added: travelling in a gravity slide (not selectable)
        settling: false,           // added: small overshoot bob after a slide (selectable)
        _sx: sx, _sy: sy, _dealDelay: k * stagger, _dealSpin: (r.next() - 0.5) * 0.5,
        _fp: 0, _ft: 0, _mode: 'idle', _spd: 0, _mt: 0, _wt: 1, _mid: null, _release: false
      });
    }
    this._emit({ type: 'season', season: this.season, level: i });
    this._emit({ type: 'deal', level: i, count: n });
    this.state = 'ready';
    return this;
  };

  function shuffle(a, r) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(r.next() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ------------------------------ queries ------------------------------ */
  World.prototype.card = function (id) {
    for (var i = 0; i < this.cards.length; i++) if (this.cards[i].id === id) return this.cards[i];
    return null;
  };
  World.prototype._cardIn = function (col, row) {
    for (var i = 0; i < this.cards.length; i++) {
      var k = this.cards[i];
      if (k.state !== 'gone' && k.col === col && k.row === row) return k;
    }
    return null;
  };

  /** True if select(id) would flip this card now (ignoring the "3rd tap closes" rule). */
  World.prototype.isSelectable = function (id) {
    var k = typeof id === 'object' ? id : this.card(id);
    return !!k && this.state === 'playing' && k.state === 'down' && k._mode !== 'travel' &&
      this.open.length < 2;
  };

  /** Hit test in logical coords, using current animated positions. */
  World.prototype.cardAt = function (x, y) {
    var c = this.cfg;
    for (var i = this.cards.length - 1; i >= 0; i--) {
      var k = this.cards[i];
      if (k.state === 'gone' || k.alpha <= 0.05) continue;
      var hw = c.cardW / 2 * k.scale, hh = c.cardH / 2 * k.scale;
      if (Math.abs(x - k.x) <= hw && Math.abs(y - k.y) <= hh) return k.id;
    }
    return null;
  };

  /* ------------------------------ input ------------------------------ */
  World.prototype.select = function (id) {
    if (this.state !== 'playing') return false;
    var closed = null;
    if (this._mismatch) closed = this._closeMismatch();
    var k = this.card(id);
    if (!k) return false;
    if (closed && closed.indexOf(k.id) >= 0) return false;   // tapping the open pair just closes it
    if (!this.isSelectable(k)) return false;
    k.state = 'up';
    k._ft = 1;
    this.open.push(k.id);
    if (this.open.length === 2) this.moves++;
    this._emit({ type: 'flip', id: k.id });
    return true;
  };

  World.prototype.moveCursor = function (dx, dy) {
    dx = Math.sign(dx || 0); dy = Math.sign(dy || 0);
    if (!dx && !dy) return;
    var cur = this.cursor, best = null, bestScore = 1e9;
    for (var i = 0; i < this.cards.length; i++) {
      var k = this.cards[i];
      if (k.state === 'gone') continue;
      var ox = k.col - cur.col, oy = k.row - cur.row;
      var along = ox * dx + oy * dy;
      if (along <= 0) continue;
      var perp = Math.abs(dx ? oy : ox);
      var s = along + perp * 2.1 + (perp ? 0.5 : 0);   // prefer straight line, then nearest diagonal
      if (s < bestScore) { bestScore = s; best = k; }
    }
    if (best) { cur.col = best.col; cur.row = best.row; this._emit({ type: 'cursor', col: cur.col, row: cur.row }); }
  };

  World.prototype.selectCursor = function () {
    this._fixCursor();
    var k = this._cardIn(this.cursor.col, this.cursor.row);
    return k ? this.select(k.id) : (this._mismatch ? (this._closeMismatch(), false) : false);
  };

  World.prototype._fixCursor = function () {
    if (this._cardIn(this.cursor.col, this.cursor.row)) return;
    var best = null, bd = 1e9;
    for (var i = 0; i < this.cards.length; i++) {
      var k = this.cards[i];
      if (k.state === 'gone') continue;
      var d = Math.abs(k.col - this.cursor.col) + Math.abs(k.row - this.cursor.row) + k.row * 1e-3 + k.col * 1e-4;
      if (d < bd) { bd = d; best = k; }
    }
    if (best) { this.cursor.col = best.col; this.cursor.row = best.row; }
  };

  /* ------------------------------ rules ------------------------------ */
  World.prototype._closeMismatch = function () {
    var m = this._mismatch;
    if (!m) return null;
    for (var i = 0; i < m.ids.length; i++) {
      var k = this.card(m.ids[i]);
      if (k && k.state === 'up') { k.state = 'down'; k._ft = 0; }
    }
    this.open = [];
    this._mismatch = null;
    this._emit({ type: 'unflip', ids: m.ids.slice() });
    return m.ids;
  };

  World.prototype._resolve = function () {
    var c = this.cfg, a = this.card(this.open[0]), b = this.card(this.open[1]);
    if (a.face === b.face) {
      var mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      a.state = b.state = 'matched';
      a._mt = b._mt = 0;
      a._mid = b._mid = mid;
      a._release = true; b._release = false;
      this.open = [];
      this.combo++;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      this.matches++;
      if (this._seen) this._seen[a.id] = this._seen[b.id] = true;
      var pts = c.pointsPerMatch * Math.min(this.combo, c.comboCap);
      this.score += pts;
      this.air = Math.min(this.airMax, this.air + this.airPerMatch);
      this._emit({ type: 'match', ids: [a.id, b.id], x: mid.x, y: mid.y, points: pts, combo: this.combo, face: a.face });
      if (this.combo >= c.cheerCombo) this._foxAct('cheer', c.foxCheerTime);
      var left = 0;
      for (var i = 0; i < this.cards.length; i++) {
        var s = this.cards[i].state;
        if (s === 'down' || s === 'up') left++;
      }
      if (!left) this._allMatched = true;
    } else {
      this.mistakes++;
      this.combo = 0;
      a._wt = b._wt = 0;
      // Careless mismatch: re-flipping a card you had already seen costs a little air (honest exploration is free).
      // Stops random mashing from beating real memory play (playtest report, change 1).
      var seen = this._seen || (this._seen = {});
      if (c.mismatchPenalty > 0 && (seen[a.id] || seen[b.id])) {
        var a0 = this.air;
        this.air = Math.max(Math.min(a0, c.penaltyFloor), a0 - c.mismatchPenalty);
        if (a0 - this.air > 0) this._emit({ type: 'penalty', amount: a0 - this.air, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      }
      seen[a.id] = seen[b.id] = true;
      this._mismatch = { ids: [a.id, b.id], timer: c.mismatchShow };
      this._emit({ type: 'mismatch', ids: [a.id, b.id] });
      this._foxAct('oops', c.foxOopsTime);
    }
  };

  /** Compact every column (vertical gravity) or row (horizontal) toward the gravity side. */
  World.prototype._applyGravity = function () {
    var g = this.gravity, moves = [], i, j, k, line;
    if (!g.x && !g.y) return moves;
    var vertical = g.y !== 0, nLines = vertical ? this.cols : this.rows, len = vertical ? this.rows : this.cols;
    for (i = 0; i < nLines; i++) {
      line = [];
      for (j = 0; j < this.cards.length; j++) {
        k = this.cards[j];
        if (k.state !== 'gone' && (vertical ? k.col : k.row) === i) line.push(k);
      }
      line.sort(vertical ? function (a, b) { return a.row - b.row; } : function (a, b) { return a.col - b.col; });
      var toEnd = vertical ? g.y > 0 : g.x > 0;
      for (j = 0; j < line.length; j++) {
        k = line[j];
        var idx = toEnd ? len - line.length + j : j;
        var fc = k.col, fr = k.row;
        if (vertical) k.row = idx; else k.col = idx;
        if (k.col !== fc || k.row !== fr) {
          moves.push({ id: k.id, fromCol: fc, fromRow: fr, col: k.col, row: k.row });
          if (k._mode !== 'travel') {
            // keep any settle velocity that points along the new direction
            var p = this.cellPos(k.col, k.row), dx = p.x - k.x, dy = p.y - k.y, d = Math.hypot(dx, dy) || 1;
            k._spd = Math.max(0, (k.vx * dx + k.vy * dy) / d);
          }
          k._mode = 'travel'; k.moving = true; k.settling = false;
        }
      }
    }
    if (moves.length) {
      this._emit({ type: 'slide', ids: moves.map(function (m) { return m.id; }), moves: moves, gravity: { x: g.x, y: g.y } });
      if (this.cursor) this._fixCursor();
    }
    return moves;
  };

  World.prototype._levelCleared = function () {
    var c = this.cfg, bonus = Math.round(Math.max(0, this.air)) * c.airBonusPerSec;
    this.score += bonus;
    this.state = 'cleared';
    this.phase = 'cleared';
    this._clearT = c.clearTime;
    this.levelsCleared++;
    this._emit({ type: 'cleared', bonus: bonus, level: this.level, air: this.air });
    this._foxAct('cheer', c.clearTime);
  };

  /* ------------------------------ simulation ------------------------------ */
  World.prototype.update = function (dt) {
    if (!(dt > 0)) return;
    var h = this.cfg.step;
    this._acc += dt;
    while (this._acc >= h - 1e-12) {
      this._acc -= h;
      this._step(h);
    }
    if (this._acc < 0) this._acc = 0;
  };

  World.prototype._step = function (h) {
    var c = this.cfg, i;
    // previous positions for render interpolation
    for (i = 0; i < this.cards.length; i++) { this.cards[i]._px = this.cards[i].x; this.cards[i]._py = this.cards[i].y; }
    this.fox._px = this.fox.x; this.fox._py = this.fox.y;
    for (i = 0; i < this.cupcakes.length; i++) { this.cupcakes[i]._px = this.cupcakes[i].x; this.cupcakes[i]._py = this.cupcakes[i].y; }

    this.time += h;
    this.levelTime += h;
    this._phaseT += h;

    if (this.state === 'ready') this._stepIntro(h);
    else if (this.state === 'playing') {
      if (!this._allMatched) this.air -= h;
      if (this._airLowArmed && this.air <= this.airMax * c.airLowFrac && this.air > 0) {
        this._airLowArmed = false;
        this._emit({ type: 'airlow', air: this.air });
      } else if (!this._airLowArmed && this.air > this.airMax * c.airLowRearm) this._airLowArmed = true;
      if (this._mismatch) {
        this._mismatch.timer -= h;
        if (this._mismatch.timer <= 0) this._closeMismatch();
      }
      if (this.air <= 0) {
        this.air = 0;
        this.state = 'dead';
        this.phase = 'dead';
        this._emit({ type: 'dead', score: this.score, level: this.level });
      }
    } else if (this.state === 'cleared') {
      this._clearT -= h;
      if (this._clearT <= 0) { this.startLevel(this.level + 1); }
    }
    this._stepCards(h);
    this._stepCupcakes(h);
    this._stepFox(h);
  };

  World.prototype._stepIntro = function (h) {
    var c = this.cfg, i, k, t = this._phaseT;
    if (this.phase === 'deal') {
      t -= c.introDelay || 0;   // banner first, then the cards fly in
      var end = 0;
      for (i = 0; i < this.cards.length; i++) {
        k = this.cards[i];
        var u = clamp((t - k._dealDelay) / c.dealFly, 0, 1), p = this.cellPos(k.col, k.row);
        k.x = lerp(k._sx, p.x, easeOutCubic(u));
        k.y = lerp(k._sy, p.y, easeOutBack(u));
        k.alpha = clamp(u * 3, 0, 1);
        k.rot = (1 - easeOutCubic(u)) * k._dealSpin;
        end = Math.max(end, k._dealDelay + c.dealFly);
      }
      if (t >= end - 1e-9) {
        for (i = 0; i < this.cards.length; i++) {
          k = this.cards[i]; var q = this.cellPos(k.col, k.row);
          k.x = q.x; k.y = q.y; k.alpha = 1; k.rot = 0;
        }
        if (c.peekTime > 0) {
          this.phase = 'peek'; this._phaseT = 0; this.peeking = true;
          for (i = 0; i < this.cards.length; i++) this.cards[i]._ft = 1;
          this._emit({ type: 'peek', on: true });
        } else this._beginPlay();
      }
    } else if (this.phase === 'peek') {
      if (t >= c.flipTime + c.peekTime) {
        for (i = 0; i < this.cards.length; i++) this.cards[i]._ft = 0;
        this.phase = 'peekEnd'; this._phaseT = 0;
        this._emit({ type: 'peek', on: false });
      }
    } else if (this.phase === 'peekEnd') {
      if (t >= c.flipTime) { this.peeking = false; this._beginPlay(); }
    }
  };

  World.prototype._beginPlay = function () {
    this.state = 'playing';
    this.phase = 'play';
    this._phaseT = 0;
    this._emit({ type: 'play', level: this.level });
  };

  World.prototype._stepCards = function (h) {
    var c = this.cfg, i, k, gone = [];
    var w0 = TAU * c.settleFreq, kS = w0 * w0, cS = 2 * c.settleDamp * w0;
    for (i = 0; i < this.cards.length; i++) {
      k = this.cards[i];
      if (k.state === 'gone') continue;
      // flip animation
      if (k._fp !== k._ft) {
        var df = h / c.flipTime;
        k._fp = k._ft > k._fp ? Math.min(k._ft, k._fp + df) : Math.max(k._ft, k._fp - df);
      }
      k.flip = easeInOutSine(k._fp);
      // mismatch wiggle (damped shake)
      if (k._wt < 1) {
        k._wt = Math.min(1, k._wt + h / c.mismatchWiggle);
        k.wiggle = 1 - k._wt;
      } else k.wiggle = 0;
      if (this.phase !== 'deal') k.rot = Math.sin(k._wt * c.mismatchWiggle * TAU * 7) * 0.12 * k.wiggle;
      // match glow + pop
      if (k.state === 'matched') {
        k._mt += h;
        if (k._mt < c.matchGlow) {
          k.glow = k._mt / c.matchGlow;
          k.scale = 1 + 0.06 * k.glow;
        } else {
          var u = clamp((k._mt - c.matchGlow) / c.matchPop, 0, 1);
          k.glow = 1;
          k.scale = u < 0.3 ? 1.06 + 0.14 * (u / 0.3) : 1.2 * Math.pow(1 - (u - 0.3) / 0.7, 2);
          k.alpha = 1 - u * u;
          if (u >= 1) {
            k.state = 'gone'; k.scale = 0; k.alpha = 0; k.glow = 0;
            k.moving = false; k.settling = false; k._mode = 'idle'; k.vx = k.vy = 0;
            gone.push(k);
          }
        }
      }
      // gravity slide motion
      if (k._mode === 'travel' || k._mode === 'settle') {
        var p = this.cellPos(k.col, k.row), dx = p.x - k.x, dy = p.y - k.y, d = Math.hypot(dx, dy);
        if (k._mode === 'travel') {
          var s = Math.min(k._spd + c.slideAccel * h, c.slideMaxSpeed, Math.sqrt(2 * c.slideBrake * d) + c.slideArrive);
          if (d <= s * h || d < 1e-6) {
            var ux = d > 1e-6 ? dx / d : 0, uy = d > 1e-6 ? dy / d : 0;
            k.x = p.x; k.y = p.y;
            k.vx = ux * s; k.vy = uy * s;
            k._spd = 0; k._mode = 'settle'; k.moving = false; k.settling = true;
          } else {
            k.vx = dx / d * s; k.vy = dy / d * s; k._spd = s;
            k.x += k.vx * h; k.y += k.vy * h;
          }
        } else {
          var ox = k.x - p.x, oy = k.y - p.y;
          k.vx += (-kS * ox - cS * k.vx) * h; k.vy += (-kS * oy - cS * k.vy) * h;
          k.x += k.vx * h; k.y += k.vy * h;
          if (Math.abs(k.x - p.x) < 0.15 && Math.abs(k.y - p.y) < 0.15 && Math.abs(k.vx) < 4 && Math.abs(k.vy) < 4) {
            k.x = p.x; k.y = p.y; k.vx = k.vy = 0; k._mode = 'idle'; k.settling = false;
          }
        }
      }
    }
    // resolve the open pair once both flips are complete
    if (this.state === 'playing' && this.open.length === 2 && !this._mismatch) {
      var a = this.card(this.open[0]), b = this.card(this.open[1]);
      if (a._fp >= 1 && b._fp >= 1) this._resolve();
    }
    if (gone.length) {
      for (i = 0; i < gone.length; i++) if (gone[i]._release) this._releaseCupcake(gone[i]._mid.x, gone[i]._mid.y);
      var any = false;
      for (i = 0; i < this.cards.length; i++) if (this.cards[i].state !== 'gone') { any = true; break; }
      if (!any) { if (this.state === 'playing') this._levelCleared(); }
      else this._applyGravity();
      this._fixCursor();
    }
  };

  /* ------------------------------ cupcakes ------------------------------ */
  World.prototype._releaseCupcake = function (x, y) {
    var c = this.cfg, r = this._fxRng;
    this.cupcakes.push({
      id: this._nextId++, x: x, y: y, vx: r.range(-20, 20), vy: c.cupcakePopVy, rot: 0, alive: true,
      scale: 0.3, _px: x, _py: y, age: 0, phase: r.range(0, TAU)
    });
    this._emit({ type: 'cupcake', x: x, y: y });
  };

  World.prototype._stepCupcakes = function (h) {
    var c = this.cfg, f = this.fox, i, t;
    var ease = 1 - Math.exp(-c.cupcakeEase * h), om = TAU * c.cupcakeWobbleFreq;
    for (i = this.cupcakes.length - 1; i >= 0; i--) {
      t = this.cupcakes[i];
      t.age += h;
      if (!t.alive) {
        t.scale -= h / 0.15;
        if (t.scale <= 0) this.cupcakes.splice(i, 1);
        continue;
      }
      t.scale = Math.min(1, t.scale + h / 0.25);
      var tvx = clamp((f.x - t.x) * 0.9, -c.cupcakeDrift, c.cupcakeDrift);
      var tvy = t.y > c.cupcakeTopY ? -c.cupcakeRise : (c.cupcakeTopY - t.y) * 0.5;
      t.vx += (tvx - t.vx) * ease;
      t.vy += (tvy - t.vy) * ease;
      // sway as a velocity term (smooth, no position jumps)
      var sway = c.cupcakeWobble * om * Math.cos(om * t.age + t.phase) * 0.5;
      t.x += (t.vx + sway) * h;
      t.y += t.vy * h;
      t.rot = 0.15 * Math.sin(om * t.age + t.phase);
      if (t.age > c.cupcakeLife) { t.alive = false; this._emit({ type: 'cupcakepop', x: t.x, y: t.y }); }
    }
  };

  /* ------------------------------ Foxy ------------------------------ */
  World.prototype._foxAct = function (frame, time) {
    var f = this.fox;
    // a happy chomp is never interrupted by an 'oops'
    if (frame === 'oops' && f._act === 'eat' && f._actT > 0) return;
    f._act = frame; f._actT = time;
  };

  World.prototype._stepFox = function (h) {
    var c = this.cfg, f = this.fox, Z = c.foxZone, B = c.foxBounds, r = this._fxRng, i;
    var tx, ty, maxS;
    var best = null, bd = 1e18;
    if (this.state !== 'dead') {
      for (i = 0; i < this.cupcakes.length; i++) {
        var t = this.cupcakes[i];
        if (!t.alive || t.age < 0.15 || t.x > this.tray.x) continue;   // fetch once it leaves the card tray   // wait until it drifts out of the card area
        var dd = (t.x - f.x) * (t.x - f.x) + (t.y - f.y) * (t.y - f.y);
        if (dd < bd) { bd = dd; best = t; }
      }
    }
    if (this.state === 'dead') {
      tx = f.x; ty = B.y0; maxS = c.foxSurfaceSpeed;
    } else if (best) {
      tx = best.x; ty = best.y; maxS = c.foxFetchSpeed;
    } else {
      f._wanderT -= h;
      var dw = Math.hypot(f.target.x - f.x, f.target.y - f.y);
      var outside = f.target.x < Z.x0 || f.target.x > Z.x1 || f.target.y < Z.y0 || f.target.y > Z.y1;
      if (f._wanderT <= 0 || dw < 12 || outside) {
        f.target = { x: r.range(Z.x0 + 50, Z.x1 - 50), y: r.range(Z.y0 + 60, Z.y1 - 80) };
        f._wanderT = r.range(c.foxWander[0], c.foxWander[1]);
      }
      tx = f.target.x; ty = f.target.y; maxS = c.foxIdleSpeed;
    }
    if (best || this.state === 'dead') f.target = { x: tx, y: ty };
    // seek + arrive steering with a force limit (smooth turns, no teleport)
    var dx = tx - f.x, dy = ty - f.y, d = Math.hypot(dx, dy);
    var want = best ? maxS : maxS * Math.min(1, d / c.foxArrive);
    var dvx = d > 1e-6 ? dx / d * want - f.vx : -f.vx, dvy = d > 1e-6 ? dy / d * want - f.vy : -f.vy;
    var dv = Math.hypot(dvx, dvy), lim = c.foxAccel * h;
    if (dv > lim) { dvx *= lim / dv; dvy *= lim / dv; }
    f.vx += dvx; f.vy += dvy;
    f.x += f.vx * h; f.y += f.vy * h;
    if (f.x < B.x0) { f.x = B.x0; f.vx = Math.max(0, f.vx); }
    if (f.x > B.x1) { f.x = B.x1; f.vx = Math.min(0, f.vx); }
    if (f.y < B.y0) { f.y = B.y0; f.vy = Math.max(0, f.vy); }
    if (f.y > B.y1) { f.y = B.y1; f.vy = Math.min(0, f.vy); }
    // eat
    if (this.state !== 'dead') {
      for (i = 0; i < this.cupcakes.length; i++) {
        var q = this.cupcakes[i];
        if (q.alive && Math.hypot(q.x - f.x, q.y - f.y) <= c.foxEatRadius) {
          q.alive = false;
          this.cupcakesEaten++;
          this._emit({ type: 'eat', x: q.x, y: q.y });
          f._act = 'eat'; f._actT = c.foxEatTime;
        }
      }
    }
    // facing (with hysteresis), tilt, bob, frames
    var oldFlip = f.flipX;
    if (f.vx > 12) f.flipX = 1; else if (f.vx < -12) f.flipX = -1;
    if (f.flipX !== oldFlip) f.angle = -f.angle;   // mirror the tilt with the sprite (nose stays up)
    var sp = Math.hypot(f.vx, f.vy);
    var tilt = clamp(Math.atan2(f.vy, Math.abs(f.vx) + 40) * 0.8, -c.foxMaxTilt, c.foxMaxTilt) * Math.min(1, sp / 40) * f.flipX;
    f.angle += (tilt - f.angle) * (1 - Math.exp(-c.foxTurnRate * h));
    f.bob = Math.sin(TAU * c.foxBobFreq * this.time) * c.foxBobAmp * (this.state === 'dead' ? 0.4 : 1);
    f._swim += h * (1.2 + sp / 45);
    if (f._actT > 0) f._actT -= h;
    if (this.state === 'dead') { f.frame = 'oops'; f.mood = 'surface'; }
    else if (f._actT > 0 && f._act) { f.frame = f._act; f.mood = f._act === 'oops' ? 'oops' : 'happy'; }
    else {
      f._act = null;
      f.frame = SWIM[Math.floor(f._swim * 4) % 4];
      f.mood = this.state === 'playing' && this.air < this.airMax * c.airLowFrac ? 'worried' : 'idle';
    }
  };

  /* ------------------------------ debug / tests ------------------------------ */
  World.prototype.snapshot = function () {
    return JSON.parse(JSON.stringify({
      state: this.state, phase: this.phase, time: this.time, level: this.level, score: this.score,
      combo: this.combo, matches: this.matches, mistakes: this.mistakes, cupcakesEaten: this.cupcakesEaten,
      air: this.air, cards: this.cards, fox: this.fox, cupcakes: this.cupcakes, cursor: this.cursor
    }));
  };

  RF.CONFIG = CONFIG;
  RF.DIFFICULTY = DIFFICULTY;
  RF.World = World;
})(window.RF = window.RF || {});
