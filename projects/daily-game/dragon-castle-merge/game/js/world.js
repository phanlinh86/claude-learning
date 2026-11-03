/* Ember's Glow Castle — EG.World (headless, deterministic) + EG.CONFIG
 *
 * Contract: docs/DESIGN.md §5.1. Motion model, rules and tuning notes: docs/MECHANICS.md.
 * Units: px (logical, y down) and seconds. Everything runs in fixed sub-steps of CONFIG.step,
 * so the same seed + the same aim/drop calls give the same game at any frame rate.
 *
 *   var w = new EG.World({ seed: 7, difficulty: 'normal', width: 960, height: 540, level: 0 });
 *   w.aim(2); w.drop(); w.update(1/60); ...
 *   var ev = w.drainEvents();        // [{type:'drop', col, tier, kind}, ...]
 *   // render: lerp prevX/prevY -> x/y with w.alpha
 *
 * The logical board is `_stacks[col]` = array of items, bottom first (gravity always compacts,
 * so a column is a stack). `grid[col][row]` (item id or 0) is rebuilt from it after each change.
 */
(function (EG) {
  'use strict';
  var M = Math;   // cached: one global lookup instead of one per call (matters in node vm tests)

  var CONFIG = {
    step: 1 / 120,          // s      fixed sub-step: a light at 1400 px/s moves 12 px per step (< ¼ cell), no tunnelling
    maxFrame: 0.25,         // s      longest frame simulated (hidden tab → no fast-forward of minutes)

    // ---- board / layout (DESIGN §2) ----
    cols: 5,                // —      columns
    rows: 7,                // —      rows (Hard overrides with difficulty.rows = 6)
    topLandscape: 128,      // px     HUD 56 + Ember 72 above the board in landscape
    topPortrait: 190,       // px     more room for the HUD in portrait
    padLandscape: 22,       // px     gap under the board in landscape
    padPortrait: 60,        // px     home-indicator safe gap in portrait
    sideMargin: 40,         // px     total horizontal margin around the board
    maxCell: 104,           // px     cells never get bigger than this (iPad portrait)
    minCell: 16,            // px     tiny windows stay playable
    emberAbove: 0.95,       // cells  Ember's body centre is this far above the board top
    holdBelow: 0.55,        // cells  the held light hangs this far under Ember's centre
    itemFrac: 0.86,         // cells  drawn size of a light

    // ---- falling lights ----
    refCell: 55,            // px     the cell size the physics constants below are tuned for (scaled by cell/55)
    gravity: 2600,          // px/s²  at cell 55: a full-height drop (6.9 cells) takes ≈0.54 s — weighty, not floaty
    restitution: 0.25,      // —      one soft bounce: 25 % of the impact speed (≈6 % of the height)
    bounceMin: 140,         // px/s   (×cell/55) slower touch-downs don't bounce at all (no micro-jitter)
    glideRate: 18,          // 1/s    a light dropped before Ember was centred eases sideways onto its column
    squashPerSpeed: 1 / 2600, // 1/(px/s) landing squash = speed/2600 (scaled), clamped to the range below
    squashMin: 0.06,        // —      even a short hop gives a visible squish
    squashMax: 0.5,         // —      a full-height drop squashes 50 % wide
    bounceSquash: 0.45,     // ×      the second (post-bounce) touch-down squashes this much of the first
    squashOmega: 30,        // rad/s  squash spring: ≈5 wobbles per second…
    squashZeta: 0.38,       // —      …damped to < 4 % in 0.3 s (a jelly "boing", then still)

    // ---- merges ----
    mergeTime: 0.18,        // s      group members slide into the anchor (ease-in: slow start, quick snap)
    mergeShrink: 0.85,      // ×      members shrink to 85 % as they are pulled in
    popTime: 0.26,          // s      new light pops 0.6 → 1.15 → 1
    popFrom: 0.6,           // ×      pop start scale
    popPeak: 1.15,          // ×      overshoot
    popPeakAt: 0.45,        // frac   of popTime where the overshoot peaks
    basePoints: 5,          // pts    value(t) = 5 · 2^(t−1) (REQUIREMENT)
    groupStep: 0.5,         // ×      +50 % per extra group member above 2
    comboStep: 0.1,         // ×      +10 % per running combo step…
    comboCap: 10,           // —      …up to combo 10 (×2)

    // ---- Ember (the dragon) ----
    emberOmega: 14,         // rad/s  critically damped spring to the column: 1 column in ≈0.2 s, 4 in ≈0.35 s, no overshoot
    emberTiltMax: 0.32,     // rad    she leans into the flight…
    emberTiltSpeed: 650,    // px/s   (×cell/55) …fully at this speed
    emberTiltRate: 10,      // 1/s    tilt eases to its target (no snapping)
    emberBobOmega: 12,      // rad/s  vertical spring back to her hover line
    emberKick: 90,          // px/s   (×cell/55) she bobs up a little when she lets go of the light
    dropSnap: 6,            // px     the light is released once Ember is this close to the column centre…
    dropWait: 0.18,         // s      …or after this long (it then glides sideways while falling)
    animTime: { drop: 0.3, happy: 0.7, oops: 0.6 }, // s  face/pose animations before back to idle

    // ---- Boo (helper) ----
    helperEvery: 5,         // —      combo 5, 10, 15 … calls Boo
    helperCarry: 3,         // —      items Boo lifts away per visit (at most)
    helperMaxTier: 3,       // tier   he only carries pumpkins and fireflies (tiers 1–3): on a tidy board the
                            //        "smallest" lights would be candles/lanterns and Boo would undo progress
    helperPoints: 5,        // pts    per item carried
    booSpeed: 620,          // px/s   (×cell/55) average flight speed between stops
    booMinFlight: 0.3,      // s      shortest hop
    booMaxFlight: 0.8,      // s      longest hop (fly-in from the corner)
    booArc: 0.28,           // ×dist  the curve's control point is raised this much → gentle arcs
    booHover: 0.6,          // cells  he picks an item up from just above it
    booPause: 0.12,         // s      tiny pause at each pick-up (readable)
    carryLife: 0.9,         // s      carried items rise and fade over this time
    carryAccel: 520,        // px/s²  (×cell/55) …accelerating upward

    // ---- pumpkins ----
    pumpkinPoints: 10,      // pts    per woken pumpkin
    rollSpeed: 240,         // px/s   (×cell/55) a woken pumpkin rolls off sideways…
    rollHop: 330,           // px/s   (×cell/55) …after a startled hop
    rollLife: 1.6,          // s      removed after this (it is off the board by then)

    // ---- goal / levels ----
    goals: [5, 6, 7, 8],    // tier   candle, lantern, star, moon (DESIGN: loops stay 8)
    loopGoal: 8,            // tier
    goalTime: 1.2,          // s      the goal light glows and ascends off the top
    goalBonus: 100,         // pts    × (zone+1) × (loop+1)
    tidyTime: 0.7,          // s      level-up tidy-up: tier-1 lights fly up and fade

    // ---- night creeps (rising pumpkins) ----
    riseTime: 0.32,         // s      a column is pushed up one cell (ease-out) as a sleepy pumpkin rises underneath
                            //        (riseFrom / riseEvery / riseCount per difficulty: see CONFIG.difficulty)
    riseSquash: 0.14,       // —      the pushed lights squash a little when they stop
    riseLoopStep: 1,        // drops  each castle loop makes the night creep 1 drop sooner (and +1 pumpkin per rise)…
    riseMin: 3,             // drops  …but never more often than every 3 drops

    // ---- danger meter ----
    dangerFrom: 0.5,        // frac   board fill below this = danger 0
    dangerStep: 0.25,       // —      danger is reported in quarter steps (no event spam)

    difficulty: {
      // spawn[zone] = weights for tiers 1..4, capped at spawn time to tiers ≤ max(2, boardMax − 1).
      //   Progress is "supply bound": a level needs 2^(goal−1) tier-1 units, so the mean units per drop
      //   Σw·2^(t−1)/Σw sets the pace (tuned with the bot; see docs/MECHANICS.md §6).
      // pumpkinChance[zone] = probability that `next` is a pumpkin (never two in a row; zone ≥ 1 only).
      easy: {
        rows: 7,                                   // 35 cells
        spawn: [[3, 2, 0, 0],                      // courtyard: tiers 1–2 only (a 6-year-old's first place), 1.40
                [5, 4, 1, 0],                      // cellar     1.70 units/drop
                [4, 4, 2, 0.5],                    // library    2.29
                [3, 3, 2.5, 1.2]],                 // tower      2.95 (the moon needs 128 units)
        pumpkinChance: [0, 0, 0, 0],               // never pumpkins on Easy (dropped ones; night pumpkins rise from level 2)
        riseFrom: 2,                               // level  the courtyard and cellar are pressure-free
        riseEvery: [9, 9, 5, 4],                   // drops  per zone: the night creeps every N drops…
        riseCount: [1, 1, 2, 2]                    // …lifting this many pumpkins (distinct seeded columns)
      },
      normal: {
        rows: 7,
        spawn: [[5, 3, 1, 0],                      // 1.67 units/drop: candle in ≈20–30 s
                [5, 3, 1.5, 0.3],                  // 1.98
                [4, 3, 2, 0.8],                    // 2.49
                [3, 3, 2.5, 1.5]],                 // 3.10
        pumpkinChance: [0, 0.06, 0.08, 0.1],       // a sleepy pumpkin every 10–16 drops from the cellar on
        riseFrom: 1,                               // from the cellar on
        riseEvery: [5, 4, 4, 3],
        riseCount: [1, 2, 3, 3]
      },
      hard: {
        rows: 6,                                   // 30 cells: less room to park things
        spawn: [[6, 3, 1, 0],                      // 1.60
                [5, 3, 1, 0.3],                    // 1.87
                [5, 3, 2, 0.5],                    // 2.19
                [4, 3, 2, 1]],                     // 2.60
        pumpkinChance: [0, 0.14, 0.18, 0.22],      // pumpkins waste drops and clutter: ≈10–20 % slower than Normal
        riseFrom: 1,
        riseEvery: [5, 5, 4, 4],                   // a touch gentler rhythm than Normal (only 6 rows and more dropped
        riseCount: [1, 2, 2, 3]                    // pumpkins already squeeze it), so skill still reaches the moon
      }
    }
  };

  var OFF = { carried: 1, ascending: 1, rolling: 1, gone: 1 };   // states that are no longer on the board

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function easeOutQuad(t) { return 1 - (1 - t) * (1 - t); }
  function easeInOutSine(t) { return 0.5 - 0.5 * M.cos(M.PI * t); }
  function value(t) { return CONFIG.basePoints * M.pow(2, t - 1); }

  /** Points for making `newTier` from a group of `size` while the combo (before this merge) was `combo`. */
  function points(newTier, size, combo) {
    return M.round(value(newTier) * (1 + CONFIG.groupStep * (size - 2)) * (1 + CONFIG.comboStep * M.min(combo, CONFIG.comboCap)));
  }
  function superPoints(size, combo) {
    return M.round(2 * value(8) * (1 + CONFIG.groupStep * (size - 2)) * (1 + CONFIG.comboStep * M.min(combo, CONFIG.comboCap)));
  }
  function goalFor(level) { return level >= 4 ? CONFIG.loopGoal : CONFIG.goals[level % 4]; }
  function goalBonus(level) { return CONFIG.goalBonus * (level % 4 + 1) * (M.floor(level / 4) + 1); }

  // ------------------------------------------------------------------ shared board logic
  // Works on stacks of "nodes" {kind, tier, row, col, _dirty, _rm} — live items and
  // simulate()'s light-weight copies alike, so the bot sees exactly the real rules.

  function nodeAt(st, c, r) { var s = st[c]; return s && r >= 0 && r < s.length ? s[r] : null; }

  /** 4-connected groups (size ≥ 2) that contain at least one dirty light. Clears all dirty flags. */
  function findGroups(st, rows) {
    var groups = [], vis = [], c, r, n;
    for (c = 0; c < st.length; c++) vis.push([]);
    for (c = 0; c < st.length; c++) {
      for (r = 0; r < st[c].length; r++) {
        n = st[c][r];
        if (!n._dirty || n.kind !== 'light' || vis[c][r]) continue;
        var tier = n.tier, q = [c, r], mem = [], cells = [];
        vis[c][r] = true;
        for (var qi = 0; qi < q.length; qi += 2) {
          var cc = q[qi], rr = q[qi + 1], m = st[cc][rr];
          mem.push(m); cells.push(cc, rr);
          var nb = [cc - 1, rr, cc + 1, rr, cc, rr - 1, cc, rr + 1];
          for (var k = 0; k < 8; k += 2) {
            var o = nodeAt(st, nb[k], nb[k + 1]);
            if (o && o.kind === 'light' && o.tier === tier && !vis[nb[k]][nb[k + 1]]) { vis[nb[k]][nb[k + 1]] = true; q.push(nb[k], nb[k + 1]); }
          }
        }
        if (mem.length < 2) continue;
        // anchor: the dirty member (just landed / created) in the lowest row, then the leftmost column
        var ai = -1;
        for (var j = 0; j < mem.length; j++) {
          if (!mem[j]._dirty) continue;
          if (ai < 0 || cells[2 * j + 1] < cells[2 * ai + 1] || (cells[2 * j + 1] === cells[2 * ai + 1] && cells[2 * j] < cells[2 * ai])) ai = j;
        }
        // a light dropped onto a full column with a matching top sits in the overflow row: anchor = the top light
        if (cells[2 * ai + 1] >= rows) {
          var ac = cells[2 * ai], best = -1;
          for (j = 0; j < mem.length; j++) if (cells[2 * j] === ac && cells[2 * j + 1] < rows && (best < 0 || cells[2 * j + 1] > cells[2 * best + 1])) best = j;
          if (best >= 0) ai = best;
        }
        groups.push({ tier: tier, members: mem, cells: cells, anchor: mem[ai], ac: cells[2 * ai], ar: cells[2 * ai + 1] });
      }
    }
    for (c = 0; c < st.length; c++) for (r = 0; r < st[c].length; r++) st[c][r]._dirty = false;
    return groups;
  }

  /** Pumpkins 4-adjacent to any cell of the group. */
  function pumpkinsNear(st, g) {
    var out = [];
    for (var j = 0; j < g.cells.length; j += 2) {
      var c = g.cells[j], r = g.cells[j + 1], nb = [c - 1, r, c + 1, r, c, r - 1, c, r + 1];
      for (var k = 0; k < 8; k += 2) {
        var o = nodeAt(st, nb[k], nb[k + 1]);
        if (o && o.kind === 'pumpkin' && !o._rm && out.indexOf(o) < 0) out.push(o);
      }
    }
    return out;
  }

  /** Boo's picks: pumpkins first, then the lowest tiers, preferring higher rows, then left columns. */
  function helperTargets(st, n) {
    var all = [], mt = CONFIG.helperMaxTier;
    for (var c = 0; c < st.length; c++) for (var r = 0; r < st[c].length; r++) {
      var x = st[c][r];
      if (!x._rm && (x.kind === 'pumpkin' || x.tier <= mt)) all.push({ n: x, c: c, r: r });
    }
    all.sort(function (a, b) {
      var pa = a.n.kind === 'pumpkin' ? 0 : 1, pb = b.n.kind === 'pumpkin' ? 0 : 1;
      if (pa !== pb) return pa - pb;
      if (a.n.tier !== b.n.tier) return a.n.tier - b.n.tier;
      if (a.r !== b.r) return b.r - a.r;
      return a.c - b.c;
    });
    return all.slice(0, n).map(function (x) { return x.n; });
  }

  /** Drop removed nodes; every node whose row changed is marked dirty. Calls moved(node) for those. */
  function compact(st, moved) {
    for (var c = 0; c < st.length; c++) {
      var s = st[c], k = 0;
      for (var r = 0; r < s.length; r++) {
        var n = s[r];
        if (n._rm) continue;
        s[k] = n;
        if (n.row !== k || n.col !== c) { n.row = k; n.col = c; n._dirty = true; if (moved) moved(n); }
        k++;
      }
      s.length = k;
    }
  }

  function canTake(st, col, tier, kind, rows) {
    var s = st[col];
    if (!s) return false;
    if (s.length < rows) return true;
    if (kind === 'pumpkin' || s.length > rows) return false;
    var top = s[rows - 1];
    return top.kind === 'light' && top.tier === tier;
  }

  // ------------------------------------------------------------------ World
  function World(opts) {
    this.events = [];
    this.reset(opts || {});
  }

  World.computeLayout = function (w, h, cols, rows) {
    var C = CONFIG;
    cols = cols || C.cols; rows = rows || C.rows;
    var portrait = h > w;
    var top = portrait ? C.topPortrait : C.topLandscape, pad = portrait ? C.padPortrait : C.padLandscape;
    var cell = M.floor(M.min((h - top - pad) / rows, (w - C.sideMargin) / cols, C.maxCell));
    if (!(cell >= C.minCell)) cell = C.minCell;
    var boardW = cols * cell, boardH = rows * cell;
    var boardX = M.round((w - boardW) / 2), boardY = h - pad - boardH;
    var emberY = boardY - cell * C.emberAbove;
    return { width: w, height: h, cols: cols, rows: rows, cell: cell, boardX: boardX, boardY: boardY,
      boardW: boardW, boardH: boardH, emberY: emberY, holdY: emberY + cell * C.holdBelow,
      itemSize: cell * C.itemFrac, portrait: portrait, top: top, bottomPad: pad };
  };

  World.prototype.reset = function (opts) {
    opts = opts || {};
    this.seed = opts.seed === undefined ? 1 : opts.seed;
    this.rng = new EG.RNG(this.seed);
    this.difficulty = CONFIG.difficulty[opts.difficulty] ? opts.difficulty : 'normal';
    this.diff = CONFIG.difficulty[this.difficulty];
    this.cols = CONFIG.cols;
    this.rows = this.diff.rows || CONFIG.rows;
    this.time = 0;
    this._acc = 0;
    this.alpha = 0;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this._helperMark = 0;
    this.items = [];
    this._id = 1;
    this.events = [];
    this._stacks = [];
    for (var c = 0; c < this.cols; c++) this._stacks.push([]);
    this.grid = [];
    this.stats = { drops: 0, merges: 0, cascades: 0, biggestGroup: 0, boos: 0, pumpkins: 0, pumpkinsWoken: 0,
      refused: 0, rises: 0, byTier: [0, 0, 0, 0, 0, 0, 0, 0, 0] };
    this.layout = World.computeLayout(opts.width || 960, opts.height || 540, this.cols, this.rows);
    var L = this.layout, mid = M.floor(this.cols / 2);
    this.ember = { x: this.colX(mid), prevX: this.colX(mid), y: L.emberY, prevY: L.emberY, vx: 0, vy: 0,
      col: mid, targetCol: mid, anim: 'idle', animT: 0, tilt: 0 };
    this.boo = { active: false, x: -100, y: -100, prevX: -100, prevY: -100, targets: [], t: 0, state: 'in' };
    this._fl = null; this._booI = 0; this._booWait = 0; this._booCarried = [];
    this._clearFlow();
    this._over = false;
    this._seenTier = [];
    this._danger = 0;
    this.held = null; this.next = null;
    this._setLevel(opts.level | 0);
    this.held = this._spawn();
    this.next = this._spawn();
    this._rebuildGrid();
    this.phase = 'aim';
    return this;
  };

  World.prototype._clearFlow = function () {
    this._busy = false;          // a drop's resolution (fall → merges → cascades → helper → goal) is running
    this._dropping = false;      // Ember is flying to the drop column with the light
    this._dropCol = -1;
    this._dropT = 0;
    this._wantCol = -1;          // aim() during the drop flight is applied after the release
    this._buffer = null;         // buffered drop (column, or -1 = current aim)
    this._merging = [];
    this._mergeT = 0;
    this._round = 0;
    this._mergesThisDrop = 0;
    this._helperPending = false;
    this._goalT = 0;
    this._levelUpPending = false;
    this._rising = 0;
    this._judged = true;
  };

  World.prototype._setLevel = function (level) {
    this.level = M.max(0, level | 0);
    this.zone = this.level % 4;
    this.loop = M.floor(this.level / 4);
    this.goalTier = goalFor(this.level);
    this._goalDone = false;
    this.maxTier = this._boardMax();
    this.riseEvery = this._riseInterval(this.level);
    this.riseIn = this.riseEvery;            // drops until the next night pumpkin (0 = off); restarts each level
  };

  /** Drops between rising pumpkins at `level` (0 = none). */
  World.prototype._riseInterval = function (level) {
    var d = this.diff;
    if (!d.riseEvery || level < d.riseFrom) return 0;
    return M.max(CONFIG.riseMin, d.riseEvery[level % 4] - CONFIG.riseLoopStep * M.floor(level / 4));
  };

  World.prototype.colX = function (c) { var L = this.layout; return L.boardX + (c + 0.5) * L.cell; };
  World.prototype.rowY = function (r) { var L = this.layout; return L.boardY + L.boardH - (r + 0.5) * L.cell; };
  World.prototype._sc = function () { return this.layout.cell / CONFIG.refCell; };
  World.prototype._emit = function (e) { this.events.push(e); };
  World.prototype.drainEvents = function () { var e = this.events; this.events = []; return e; };

  World.prototype._boardMax = function () {
    var m = 0, st = this._stacks;
    if (!st) return 0;
    for (var c = 0; c < st.length; c++) for (var r = 0; r < st[c].length; r++) {
      var n = st[c][r];
      if (n.kind === 'light' && !n._rm && n.tier > m) m = n.tier;
    }
    return m;
  };

  World.prototype._rebuildGrid = function () {
    var g = [];
    for (var c = 0; c < this.cols; c++) {
      var col = [], s = this._stacks[c];
      for (var r = 0; r < this.rows; r++) col.push(r < s.length && !s[r]._rm ? s[r].id : 0);
      g.push(col);
    }
    this.grid = g;
  };

  // ------------------------------------------------------------------ spawns
  World.prototype._spawn = function () {
    var d = this.diff, z = this.zone, r = this.rng;
    var pc = d.pumpkinChance[z] || 0;
    // never two pumpkins in a row: the new `next` follows the current `held`
    if (pc > 0 && !(this.held && this.held.kind === 'pumpkin') && r.next() < pc) return { tier: 0, kind: 'pumpkin' };
    var w = d.spawn[z], n = M.min(4, w.length), cap = M.max(2, this._boardMax() - 1), sum = 0, t;
    for (t = 1; t <= n && t <= cap; t++) sum += w[t - 1] || 0;
    var x = r.next() * sum;
    for (t = 1; t <= n && t <= cap; t++) {
      x -= w[t - 1] || 0;
      if (x < 0) return { tier: t, kind: 'light' };
    }
    return { tier: 1, kind: 'light' };
  };

  World.prototype._newItem = function (kind, tier, col, row, x, y) {
    var it = { id: this._id++, kind: kind, tier: kind === 'pumpkin' ? 0 : tier, col: col, row: row,
      x: x, y: y, prevX: x, prevY: y, vx: 0, vy: 0, state: 'rest', t: 0, scale: 1, squash: 0, sv: 0,
      mergeTo: 0, alpha: 1, rot: 0, popT: -1, touch: 0, life: 0, acc: 0, _sx: x, _sy: y, _ry0: y, _riseT: -1, _dirty: false, _rm: false };
    this.items.push(it);
    return it;
  };

  // ------------------------------------------------------------------ input
  World.prototype.canDrop = function (col, tier) {
    var kind;
    if (tier === undefined) { if (!this.held) return false; tier = this.held.tier; kind = this.held.kind; }
    else kind = tier === 0 ? 'pumpkin' : 'light';
    return canTake(this._stacks, col, tier, kind, this.rows);
  };

  World.prototype._anyCanDrop = function () {
    for (var c = 0; c < this.cols; c++) if (this.canDrop(c)) return true;
    return false;
  };

  World.prototype.aim = function (col) {
    if (this._over) return;
    col = clamp(M.round(+col || 0), 0, this.cols - 1);
    if (this._dropping) { this._wantCol = col; return; }
    if (col !== this.ember.targetCol) { this.ember.targetCol = col; this._emit({ type: 'aim', col: col }); }
  };

  World.prototype.isBusy = function () { return this._busy || this._dropping; };

  /** Drop the held light (into `col`, or the current aim). Returns true if a drop started now. */
  World.prototype.drop = function (col) {
    if (this._over) return false;
    if (col !== undefined && col !== null) col = clamp(M.round(+col || 0), 0, this.cols - 1);
    else col = -1;
    if (this.isBusy()) { this._buffer = col; return false; }
    return this._doDrop(col < 0 ? this.ember.targetCol : col);
  };

  World.prototype._doDrop = function (col) {
    this.aim(col);
    if (!this.canDrop(col)) {
      if (!this._anyCanDrop()) { this._gameOver(); return false; }   // safety net (e.g. a test board): never a stuck state
      this.stats.refused++;
      this._setAnim('oops');
      this._emit({ type: 'refuse', col: col });
      return false;
    }
    this._dropping = true;
    this._dropCol = col;
    this._dropT = 0;
    this.phase = 'drop';
    return true;
  };

  World.prototype._setAnim = function (a) { this.ember.anim = a; this.ember.animT = 0; };

  // ------------------------------------------------------------------ time
  World.prototype.update = function (dt) {
    if (!(dt > 0)) return;
    this._acc += M.min(dt, CONFIG.maxFrame);
    var h = CONFIG.step;
    while (this._acc >= h - 1e-9) { this._acc -= h; this._step(h); }
    if (this._acc < 0) this._acc = 0;
    this.alpha = this._acc / h;
  };

  World.prototype._step = function (h) {
    this.time += h;
    var e = this.ember, b = this.boo, items = this.items, i;
    e.prevX = e.x; e.prevY = e.y;
    b.prevX = b.x; b.prevY = b.y;
    for (i = 0; i < items.length; i++) { items[i].prevX = items[i].x; items[i].prevY = items[i].y; }

    this._stepEmber(h);
    if (this._merging.length) this._mergeT += h;                // advance first: members reach the anchor on the last step
    this._stepItems(h);
    if (b.active) this._stepBoo(h);
    if (this._goalT > 0) this._goalT = M.max(0, this._goalT - h);
    if (this._rising > 0) this._rising = M.max(0, this._rising - h);

    if (!this._over) {
      if (this._dropping) {
        this._dropT += h;
        if (M.abs(e.x - this.colX(this._dropCol)) < CONFIG.dropSnap || this._dropT >= CONFIG.dropWait) this._release();
      } else if (this._busy) this._advance();
    }
    this.phase = this._calcPhase();
  };

  World.prototype._calcPhase = function () {
    if (this._over) return 'over';
    if (this._goalT > 0 || this._levelUpPending) return 'goal';
    if (this.boo.active && this.boo.state !== 'out') return 'helper';
    if (this._merging.length) return 'merge';
    if (this._dropping) return 'drop';
    if (this._busy) return 'fall';
    return 'aim';
  };

  World.prototype._stepEmber = function (h) {
    var C = CONFIG, e = this.ember, L = this.layout, sc = this._sc();
    var tx = this.colX(e.targetCol), w = C.emberOmega;
    e.vx += (w * w * (tx - e.x) - 2 * w * e.vx) * h;           // critically damped spring
    e.x += e.vx * h;
    var wy = C.emberBobOmega;
    e.vy += (wy * wy * (L.emberY - e.y) - 2 * wy * e.vy) * h;
    e.y += e.vy * h;
    var tTarget = clamp(e.vx / (C.emberTiltSpeed * sc), -1, 1) * C.emberTiltMax;
    e.tilt += (tTarget - e.tilt) * (1 - M.exp(-C.emberTiltRate * h));
    e.col = clamp(M.round((e.x - L.boardX) / L.cell - 0.5), 0, this.cols - 1);
    e.animT += h;
    var dur = C.animTime[e.anim];
    if (dur && e.animT >= dur) { e.anim = 'idle'; e.animT = 0; }
  };

  World.prototype._stepItems = function (h) {
    var C = CONFIG, L = this.layout, sc = this._sc(), g = C.gravity * sc, items = this.items;
    var w = C.squashOmega, z = C.squashZeta;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      it.t += h;
      if (it.popT >= 0) {
        it.popT += h;
        var k = it.popT / C.popTime;
        if (k >= 1) { it.popT = -1; it.scale = 1; if (it.state === 'popping') it.state = 'rest'; }
        else if (k < C.popPeakAt) it.scale = C.popFrom + (C.popPeak - C.popFrom) * easeOutQuad(k / C.popPeakAt);
        else it.scale = C.popPeak + (1 - C.popPeak) * easeInOutSine((k - C.popPeakAt) / (1 - C.popPeakAt));
      }
      if (it.squash !== 0 || it.sv !== 0) {                    // damped spring on the squash amount
        it.sv += (-w * w * it.squash - 2 * z * w * it.sv) * h;
        it.squash = clamp(it.squash + it.sv * h, -1, 1);
        if (M.abs(it.squash) < 0.002 && M.abs(it.sv) < 0.05) { it.squash = 0; it.sv = 0; }
      }
      if (it._riseT >= 0) {                                    // pushed up by a rising pumpkin (ease-out)
        it._riseT += h;
        var rk = M.min(1, it._riseT / C.riseTime), ry = this.rowY(it.row);
        if (it.state === 'rest' || it.state === 'popping') it.y = it._ry0 + (ry - it._ry0) * (1 - M.pow(1 - rk, 3));
        if (it.kind === 'pumpkin' && it.alpha < 1) it.alpha = M.min(1, rk * 1.5);
        if (rk >= 1) {
          it._riseT = -1;
          if (it.state === 'rest' || it.state === 'popping') { it.y = ry; it.squash = clamp(it.squash + C.riseSquash, -1, 1); }
        }
      }
      switch (it.state) {
        case 'falling': {
          it.vy += g * h;
          it.y += it.vy * h;
          var cx = this.colX(it.col);
          it.x += (cx - it.x) * (1 - M.exp(-C.glideRate * h));
          var ty = this.rowY(it.row);
          if (it.y >= ty) {
            var speed = it.vy;
            it.y = ty;
            if (it.touch === 0) {
              it.touch = 1;
              this._emit({ type: 'land', item: it, speed: speed });
              it.squash = clamp(speed * C.squashPerSpeed / sc, C.squashMin, C.squashMax); it.sv = 0;
              if (speed > C.bounceMin * sc) { it.vy = -speed * C.restitution; break; }
            } else {
              this._emit({ type: 'bounce', item: it });
              it.squash = clamp(it.squash + speed * C.squashPerSpeed / sc * C.bounceSquash, -1, 1);
            }
            it.vy = 0; it.x = cx; it.touch = 2;
            it.state = it.popT >= 0 ? 'popping' : 'rest';
          }
          break;
        }
        case 'merging': {
          var a = this._byId(it.mergeTo);
          var ax = a ? a.x : it._sx, ay = a ? a.y : it._sy;
          var mk = M.min(1, this._mergeT / C.mergeTime), e2 = mk * mk;   // ease-in
          if (a !== it) { it.x = it._sx + (ax - it._sx) * e2; it.y = it._sy + (ay - it._sy) * e2; }
          it.scale = 1 - (1 - C.mergeShrink) * e2;
          break;
        }
        case 'carried':
          it.vy -= C.carryAccel * sc * h;
          it.y += it.vy * h;
          it.x += M.sin(it.t * 7 + it.id) * 18 * sc * h;
          it.alpha = clamp(1 - it.t / C.carryLife, 0, 1);
          if (it.t >= C.carryLife) it.state = 'gone';
          break;
        case 'ascending':
          it.vy -= it.acc * h;
          it.y += it.vy * h;
          if (it.life < C.goalTime) it.alpha = clamp(1 - it.t / it.life, 0, 1);  // tidy-up fades; the goal light stays bright
          else it.scale = 1 + 0.12 * M.sin(it.t * 9);
          if (it.t >= it.life) it.state = 'gone';
          break;
        case 'rolling':
          it.vy += g * h;
          it.x += it.vx * h;
          it.y += it.vy * h;
          it.rot += it.vx / M.max(8, L.itemSize * 0.5) * h;
          it.alpha = clamp((C.rollLife - it.t) / 0.4, 0, 1);
          if (it.t >= C.rollLife || it.y > L.height + L.cell * 2) it.state = 'gone';
          break;
      }
    }
    var n = 0;
    for (i = 0; i < items.length; i++) if (items[i].state !== 'gone') items[n++] = items[i];
    items.length = n;
  };

  World.prototype._byId = function (id) {
    for (var i = 0; i < this.items.length; i++) if (this.items[i].id === id) return this.items[i];
    return null;
  };

  World.prototype._anyFalling = function () {
    for (var i = 0; i < this.items.length; i++) if (this.items[i].state === 'falling') return true;
    return false;
  };

  // ------------------------------------------------------------------ drop → resolve
  World.prototype._release = function () {
    var col = this._dropCol, e = this.ember, L = this.layout, hd = this.held;
    this._dropping = false;
    var s = this._stacks[col];
    var it = this._newItem(hd.kind, hd.tier, col, s.length, e.x, L.holdY);
    it.state = 'falling'; it._dirty = true;
    s.push(it);
    this.held = this.next;
    this.next = this._spawn();
    this.stats.drops++;
    this._emit({ type: 'drop', col: col, tier: it.tier, kind: it.kind });
    if (it.kind === 'pumpkin') { this.stats.pumpkins++; this._emit({ type: 'pumpkinDrop' }); }
    this._setAnim('drop');
    e.vy = -CONFIG.emberKick * this._sc();
    this._busy = true;
    this._round = 0;
    this._mergesThisDrop = 0;
    this._judged = false;
    if (this.riseIn > 0) this.riseIn--;
    this._rebuildGrid();
    if (this._wantCol >= 0) { var wc = this._wantCol; this._wantCol = -1; this.aim(wc); }
  };

  World.prototype._advance = function () {
    if (this._merging.length) {
      if (this._mergeT >= CONFIG.mergeTime - 1e-9) this._finishMerges();
      return;
    }
    if (this._anyFalling() || this._rising > 0) return;
    if (this.boo.active && this.boo.state !== 'out') return;
    var groups = findGroups(this._stacks, this.rows);
    if (groups.length) { this._startMerges(groups); return; }
    if (this._helperPending) { if (this.boo.active) return; this._helperPending = false; this._startHelper(); return; }
    if (this._goalT > 0) return;
    if (this._levelUpPending) { this._levelUp(); return; }
    this._ready();
  };

  World.prototype._startMerges = function (groups) {
    for (var gi = 0; gi < groups.length; gi++) {
      var g = groups[gi];
      for (var j = 0; j < g.members.length; j++) {
        var m = g.members[j];
        m.state = 'merging'; m.t = 0; m.mergeTo = g.anchor.id; m._sx = m.x; m._sy = m.y;
      }
    }
    this._merging = groups;
    this._mergeT = 0;
  };

  World.prototype._finishMerges = function () {
    var C = CONFIG, st = this._stacks, groups = this._merging, sc = this._sc(), L = this.layout;
    var cascade = this._round++;
    this._merging = [];
    for (var gi = 0; gi < groups.length; gi++) {
      var g = groups[gi], size = g.members.length, a = g.anchor, j;
      var comboBefore = this.combo;
      this.combo++;
      if (this.combo > this.maxCombo) this.maxCombo = this.combo;
      this._mergesThisDrop++;
      this.stats.merges++;
      if (cascade > 0) this.stats.cascades++;
      if (size > this.stats.biggestGroup) this.stats.biggestGroup = size;
      var ax = this.colX(g.ac), ay = this.rowY(M.min(g.ar, this.rows - 1));
      // pumpkins next to the group wake up and roll away
      var pk = pumpkinsNear(st, g);
      for (j = 0; j < pk.length; j++) {
        var p = pk[j];
        p._rm = true; p.state = 'rolling'; p.t = 0;
        var dir = p.col * 2 < this.cols - 1 ? -1 : p.col * 2 > this.cols - 1 ? 1 : (a.col <= p.col ? 1 : -1);
        p.vx = dir * C.rollSpeed * sc; p.vy = -C.rollHop * sc;
        this.score += C.pumpkinPoints;
        this.stats.pumpkinsWoken++;
        this._emit({ type: 'pumpkinWake', item: p });
      }
      for (j = 0; j < size; j++) { g.members[j]._rm = true; g.members[j].state = 'gone'; }
      if (g.tier >= 8) {                                    // super moon: both vanish in a burst
        var sp = superPoints(size, comboBefore);
        this.score += sp;
        this._emit({ type: 'merge', tier: 8, count: size, x: ax, y: ay, points: sp, combo: this.combo, cascade: cascade, super: true });
      } else {
        var nt = g.tier + 1;
        var it = this._newItem('light', nt, g.ac, g.ar, a.x, a.y);
        it.state = 'popping'; it.popT = 0; it.scale = C.popFrom; it._dirty = true;
        st[g.ac][g.ar] = it;                               // takes the anchor's slot; compact() does the rest
        var pts = points(nt, size, comboBefore);
        this.score += pts;
        this.stats.byTier[nt]++;
        if (nt > this.maxTier) this.maxTier = nt;
        this._emit({ type: 'merge', tier: nt, count: size, x: ax, y: ay, points: pts, combo: this.combo, cascade: cascade });
        if (!this._seenTier[nt]) { this._seenTier[nt] = true; this._emit({ type: 'newTier', tier: nt }); }
        if (nt >= this.goalTier && !this._goalDone) {
          this._goalDone = true;
          var bonus = goalBonus(this.level);
          this.score += bonus;
          it._rm = true; it._dirty = false; it.state = 'ascending'; it.t = 0; it.life = C.goalTime;
          it.vy = -40 * sc;
          it.acc = 2 * (it.y + L.cell * 2) / (C.goalTime * C.goalTime);  // leaves the top of the screen at ≈1.2 s
          this._goalT = C.goalTime;
          this._levelUpPending = true;
          this._emit({ type: 'goal', tier: nt, x: ax, y: ay, bonus: bonus });
        }
      }
      if (this.combo >= 2) this._emit({ type: 'combo', combo: this.combo });
      var mark = M.floor(this.combo / C.helperEvery);
      if (mark > this._helperMark) { this._helperMark = mark; this._helperPending = true; }
    }
    if (this.ember.anim !== 'oops') this._setAnim('happy');
    this._compact();
  };

  World.prototype._compact = function () {
    compact(this._stacks, function (n) {
      if (n.state === 'rest' || n.state === 'popping') { n.state = 'falling'; n.vy = 0; n.touch = 0; }
    });
    this._rebuildGrid();
  };

  World.prototype._levelUp = function () {
    var C = CONFIG, st = this._stacks, sc = this._sc();
    this._levelUpPending = false;
    this._setLevel(this.level + 1);
    this._emit({ type: 'levelUp', level: this.level, zone: this.zone });
    for (var c = 0; c < st.length; c++) for (var r = 0; r < st[c].length; r++) {
      var it = st[c][r];
      if (it.kind === 'light' && it.tier === 1) this._liftAway(it, C.tidyTime, 2.2 * this.layout.cell, sc);
    }
    this._compact();
    this.maxTier = this._boardMax();
  };

  /** Fly an item up and fade it (tidy-up / gotoLevel clear). */
  World.prototype._liftAway = function (it, life, dist, sc) {
    it._rm = true; it.state = 'ascending'; it.t = 0; it.life = life; it.popT = -1;
    it.vy = -30 * sc; it.acc = 2 * dist / (life * life);
  };

  World.prototype._ready = function () {
    var C = CONFIG;
    if (!this._judged) {                       // once per drop (a rise re-enters _ready after its own cascades)
      this._judged = true;
      if (this._mergesThisDrop === 0) {
        if (this.combo >= 2) this._emit({ type: 'comboBreak', combo: this.combo });
        this.combo = 0;
        this._helperMark = 0;
      }
    }
    if (this.riseEvery > 0 && this.riseIn === 0) {
      this.riseIn = this.riseEvery;
      if (this._rise()) return;                // board resolves the push (cascades) and comes back here
      this._gameOver();
      return;
    }
    this._busy = false;
    var filled = 0;
    for (var c = 0; c < this.cols; c++) filled += M.min(this.rows, this._stacks[c].length);
    var fill = filled / (this.cols * this.rows);
    var dg = M.floor(clamp((fill - C.dangerFrom) / (1 - C.dangerFrom), 0, 1) / C.dangerStep + 1e-9) * C.dangerStep;
    if (dg !== this._danger) { this._danger = dg; this._emit({ type: 'danger', level: dg }); }
    if (!this._anyCanDrop()) { this._gameOver(); return; }
    this.phase = 'aim';
    if (this._buffer !== null) {
      var b = this._buffer;
      this._buffer = null;
      this._doDrop(b < 0 ? this.ember.targetCol : b);
    }
  };

  World.prototype._gameOver = function () {
    this._busy = false;
    this._over = true;
    this.phase = 'over';
    this._buffer = null;
    this._emit({ type: 'gameOver' });
  };

  /** Night creeps: a sleepy pumpkin rises from the bottom of a seeded random non-full column,
   *  pushing that column up one cell. Returns false when every column is full (→ game over). */
  World.prototype._rise = function () {
    var open = [], c, n = this._riseCount(this.level);
    for (c = 0; c < this.cols; c++) if (this._stacks[c].length < this.rows) open.push(c);
    if (!open.length) return false;
    for (var k = 0; k < n && open.length; k++) {
      var col = open.splice(this.rng.int(open.length), 1)[0], s = this._stacks[col];
      for (var r = 0; r < s.length; r++) {
        var it = s[r];
        it._ry0 = it.y; it.row = r + 1; it._riseT = 0; it._dirty = true;
      }
      var p = this._newItem('pumpkin', 0, col, 0, this.colX(col), this.rowY(-1));
      p._ry0 = p.y; p._riseT = 0; p.alpha = 0;
      s.unshift(p);
      this.stats.rises++;
      this._emit({ type: 'rise', col: col, item: p });
    }
    this._rising = CONFIG.riseTime;
    this._rebuildGrid();
    return true;
  };

  /** Pumpkins per rise at `level` (distinct columns). */
  World.prototype._riseCount = function (level) {
    var d = this.diff, rc = d.riseCount;
    if (!rc) return 1;
    return M.min(this.cols - 1, rc[level % 4] + M.floor(level / 4));
  };

  // ------------------------------------------------------------------ Boo
  World.prototype._startHelper = function () {
    var C = CONFIG, L = this.layout, b = this.boo;
    var targets = helperTargets(this._stacks, C.helperCarry);
    this.stats.boos++;
    this._emit({ type: 'helper', combo: this.combo });
    var fromRight = this.ember.x < L.width / 2;          // come in from the corner away from Ember
    b.active = true; b.state = 'in'; b.t = 0;
    b.x = b.prevX = fromRight ? L.width + L.cell : -L.cell;
    b.y = b.prevY = -L.cell * 0.8;
    b.targets = targets.map(function (n) { return n.id; });
    this._booT = targets;
    this._booI = 0;
    this._booWait = 0;
    this._booFrom = fromRight;
    if (targets.length) this._flyTo(targets[0].x, targets[0].y - C.booHover * L.cell);
    else this._flyTo(L.boardX + L.boardW / 2, L.boardY - L.cell * 1.6);   // nothing small to carry: a friendly fly-by
  };

  World.prototype._flyTo = function (x1, y1) {
    var C = CONFIG, b = this.boo, dx = x1 - b.x, dy = y1 - b.y, d = M.sqrt(dx * dx + dy * dy);
    var T = clamp(d / (C.booSpeed * this._sc()), C.booMinFlight, C.booMaxFlight);
    this._fl = { x0: b.x, y0: b.y, x1: x1, y1: y1, cx: (b.x + x1) / 2, cy: (b.y + y1) / 2 - C.booArc * d, T: T, t: 0 };
  };

  World.prototype._stepBoo = function (h) {
    var C = CONFIG, b = this.boo, f = this._fl;
    b.t += h;
    if (this._booWait > 0) { this._booWait -= h; if (this._booWait > 0) return; this._nextBooLeg(); return; }
    if (!f) return;
    f.t += h;
    var k = M.min(1, f.t / f.T), e = easeInOutSine(k), u = 1 - e;
    b.x = u * u * f.x0 + 2 * u * e * f.cx + e * e * f.x1;     // quadratic Bézier → a soft curved path
    b.y = u * u * f.y0 + 2 * u * e * f.cy + e * e * f.y1;
    if (k < 1) return;
    this._fl = null;
    if (b.state === 'out') { b.active = false; b.state = 'in'; b.targets = []; return; }
    var it = this._booT[this._booI];
    if (it && !it._rm) {
      it._rm = true; it.state = 'carried'; it.t = 0; it.vy = -40 * this._sc(); it.popT = -1; it.scale = 1;
      this.score += C.helperPoints;
      this._emit({ type: 'helperCarry', item: it });
    }
    b.state = 'carry';
    this._booI++;
    this._booWait = C.booPause;
  };

  World.prototype._nextBooLeg = function () {
    var C = CONFIG, L = this.layout, b = this.boo;
    while (this._booI < this._booT.length && this._booT[this._booI]._rm) this._booI++;
    if (this._booI < this._booT.length) {
      var it = this._booT[this._booI];
      this._flyTo(it.x, it.y - C.booHover * L.cell);
      return;
    }
    b.state = 'out';
    this._flyTo(this._booFrom ? -L.cell * 1.2 : L.width + L.cell * 1.2, -L.cell);
    this._compact();                                       // gravity + cascades run as usual from here
    this._emit({ type: 'helperDone' });
  };

  // ------------------------------------------------------------------ simulation (bot)
  World.prototype._tiers = function () {
    return this._stacks.map(function (s) {
      var a = [];
      for (var r = 0; r < s.length; r++) if (!s[r]._rm) a.push(s[r].kind === 'pumpkin' ? 0 : s[r].tier);
      return a;
    });
  };

  World.prototype._simCtx = function () {
    return { combo: this.combo, helperMark: this._helperMark, level: this.level, goalTier: this.goalTier,
      goalDone: this._goalDone, next: this.next, riseIn: this.riseIn };
  };

  /** simulate(col): pure, instant copy of dropping the held light into `col` (no events, no RNG). */
  World.prototype.simulate = function (col) {
    return this.simBoard(this._tiers(), this.held, col, this._simCtx());
  };

  /** The same on any board (array of column arrays of tiers, 0 = pumpkin) — used for the bot's lookahead. */
  World.prototype.simBoard = function (board, held, col, ctx) {
    var C = CONFIG, rows = this.rows, cols = board.length, c, r;
    ctx = ctx || this._simCtx();
    var st = [];
    for (c = 0; c < cols; c++) {
      var s = [];
      for (r = 0; r < board[c].length; r++) s.push({ kind: board[c][r] === 0 ? 'pumpkin' : 'light', tier: board[c][r], row: r, col: c, _dirty: false, _rm: false });
      st.push(s);
    }
    var res = { ok: false, merges: 0, points: 0, maxTier: 0, heights: [], holes: 0, gameOver: false, board: board, combo: ctx.combo, goal: false, boos: 0, woken: 0, pumpkins: 0,
      rise: ctx.riseIn === 1 };   // a night pumpkin rises right after this drop (column unknown: seeded)
    if (!held || col < 0 || col >= cols || !canTake(st, col, held.tier, held.kind, rows)) return res;
    res.ok = true;
    st[col].push({ kind: held.kind, tier: held.kind === 'pumpkin' ? 0 : held.tier, row: st[col].length, col: col, _dirty: true, _rm: false });
    var combo = ctx.combo, mark = ctx.helperMark, goalTier = ctx.goalTier, goalDone = !!ctx.goalDone, level = ctx.level;
    var helper = false, tidy = false, made = 0, guard = 0;
    while (guard++ < 400) {
      var groups = findGroups(st, rows);
      if (groups.length) {
        for (var gi = 0; gi < groups.length; gi++) {
          var g = groups[gi], size = g.members.length, j;
          var pk = pumpkinsNear(st, g);
          for (j = 0; j < pk.length; j++) { pk[j]._rm = true; res.points += C.pumpkinPoints; res.woken++; }
          for (j = 0; j < size; j++) g.members[j]._rm = true;
          if (g.tier >= 8) res.points += superPoints(size, combo);
          else {
            var nt = g.tier + 1, n = { kind: 'light', tier: nt, row: g.ar, col: g.ac, _dirty: true, _rm: false };
            st[g.ac][g.ar] = n;
            res.points += points(nt, size, combo);
            if (nt > made) made = nt;
            if (nt >= goalTier && !goalDone) { goalDone = true; res.goal = true; n._rm = true; res.points += goalBonus(level); }
          }
          combo++; res.merges++;
          var mk = M.floor(combo / C.helperEvery);
          if (mk > mark) { mark = mk; helper = true; }
        }
        compact(st);
        continue;
      }
      if (helper) {
        helper = false; res.boos++;
        var tg = helperTargets(st, C.helperCarry);
        for (var ti = 0; ti < tg.length; ti++) { tg[ti]._rm = true; res.points += C.helperPoints; }
        compact(st);
        continue;
      }
      if (res.goal && !tidy) {
        tidy = true; level++; goalTier = goalFor(level); goalDone = false;
        for (c = 0; c < cols; c++) for (r = 0; r < st[c].length; r++) if (st[c][r].kind === 'light' && st[c][r].tier === 1) st[c][r]._rm = true;
        compact(st);
        continue;
      }
      break;
    }
    var out = [], mx = made;
    for (c = 0; c < cols; c++) {
      var col2 = [], s2 = st[c];
      res.heights.push(s2.length);
      for (r = 0; r < s2.length; r++) {
        col2.push(s2[r].tier);
        if (s2[r].kind === 'light' && s2[r].tier > mx) mx = s2[r].tier;
        if (s2[r].kind === 'pumpkin') res.pumpkins++;
        // a "hole" is a buried thing that is hard to reach: a smaller light under a bigger one, or any covered pumpkin
        if (r + 1 < s2.length && (s2[r].kind === 'pumpkin' || s2[r + 1].tier > s2[r].tier)) res.holes++;
      }
      out.push(col2);
    }
    res.board = out;
    res.maxTier = mx;
    res.combo = res.merges ? combo : 0;
    var nx = ctx.next;
    if (nx) {
      var any = false;
      for (c = 0; c < cols && !any; c++) if (canTake(st, c, nx.tier, nx.kind, rows)) any = true;
      res.gameOver = !any;
    }
    return res;
  };

  // ------------------------------------------------------------------ levels / test helpers
  World.prototype.gotoLevel = function (i) {
    var sc = this._sc(), st = this._stacks, L = this.layout;
    for (var c = 0; c < st.length; c++) for (var r = 0; r < st[c].length; r++) {
      var it = st[c][r];
      if (!it._rm) this._liftAway(it, CONFIG.tidyTime, 2.2 * L.cell, sc);
    }
    for (var k = 0; k < this.items.length; k++) if (this.items[k].state === 'merging' || this.items[k].state === 'falling') this._liftAway(this.items[k], CONFIG.tidyTime, 2.2 * L.cell, sc);
    for (c = 0; c < st.length; c++) st[c].length = 0;
    this._clearFlow();
    this.boo.active = false; this.boo.targets = []; this._fl = null;
    this._over = false;
    this.combo = 0; this._helperMark = 0;
    this._setLevel(i);
    this.held = null;
    this.held = this._spawn();
    this.next = this._spawn();
    this._rebuildGrid();
    this.phase = 'aim';
    this._emit({ type: 'levelUp', level: this.level, zone: this.zone });
  };

  /** Test helper: board from an array of column arrays of tiers (bottom first, 0 = pumpkin). */
  World.prototype.setBoard = function (cols) {
    var st = this._stacks, c, r;
    this.items.length = 0;
    for (c = 0; c < this.cols; c++) {
      st[c].length = 0;
      var a = (cols && cols[c]) || [];
      for (r = 0; r < a.length && r < this.rows; r++) {
        var t = a[r] | 0;
        st[c].push(this._newItem(t === 0 ? 'pumpkin' : 'light', t, c, r, this.colX(c), this.rowY(r)));
      }
    }
    this._clearFlow();
    this.boo.active = false; this._fl = null;
    this._over = false;
    this.maxTier = this._boardMax();
    this._rebuildGrid();
    this.phase = 'aim';
  };

  World.prototype.setLayout = function (w, h) {
    var old = this.layout, L = World.computeLayout(w, h, this.cols, this.rows);
    this.layout = L;
    var items = this.items, i;
    for (i = 0; i < items.length; i++) {
      var it = items[i];
      if (OFF[it.state]) { it.state = 'gone'; continue; }   // exit animations are dropped (they're off the board)
      it.x = it.prevX = it._sx = this.colX(it.col);
      it.y = it.prevY = it._sy = this.rowY(it.row);
      if (it.state === 'falling') { it.state = it.popT >= 0 ? 'popping' : 'rest'; it.vy = 0; it.touch = 2; }
      if (it._riseT >= 0) { it._riseT = -1; it.alpha = 1; }
    }
    var n = 0;
    for (i = 0; i < items.length; i++) if (items[i].state !== 'gone') items[n++] = items[i];
    items.length = n;
    var e = this.ember;
    e.x = e.prevX = this.colX(e.targetCol); e.vx = 0;
    e.y = e.prevY = L.emberY; e.vy = 0;
    e.col = e.targetCol;
    if (old && this.boo.active) {
      var sx = w / old.width, sy = h / old.height, b = this.boo, f = this._fl;
      b.x = b.prevX = b.x * sx; b.y = b.prevY = b.y * sy;
      if (f) {
        f.x0 *= sx; f.cx *= sx; f.y0 *= sy; f.cy *= sy;
        var tgt = this._booT && this._booT[this._booI];
        if (b.state !== 'out' && tgt) { f.x1 = tgt.x; f.y1 = tgt.y - CONFIG.booHover * L.cell; }
        else { f.x1 *= sx; f.y1 *= sy; }
      }
    }
  };

  World.prototype.getState = function () {
    var e = this.ember;
    return {
      time: this.time, phase: this.phase, level: this.level, zone: this.zone, loop: this.loop,
      score: this.score, combo: this.combo, maxCombo: this.maxCombo, difficulty: this.difficulty,
      cols: this.cols, rows: this.rows, goalTier: this.goalTier, maxTier: this.maxTier,
      held: this.held ? { tier: this.held.tier, kind: this.held.kind } : null,
      next: this.next ? { tier: this.next.tier, kind: this.next.kind } : null,
      board: this._tiers(), heights: this._stacks.map(function (s) { return s.length; }),
      grid: this.grid.map(function (c) { return c.slice(); }),
      items: this.items.length, busy: this.isBusy(), buffered: this._buffer,
      ember: { x: e.x, y: e.y, col: e.col, targetCol: e.targetCol, anim: e.anim, tilt: e.tilt },
      boo: { active: this.boo.active, state: this.boo.state },
      danger: this._danger, riseIn: this.riseIn, riseEvery: this.riseEvery,
      stats: JSON.parse(JSON.stringify(this.stats))
    };
  };

  World.points = points;
  World.value = value;
  World.goalFor = goalFor;
  World.goalBonus = goalBonus;
  EG.CONFIG = CONFIG;
  EG.World = World;
})(window.EG = window.EG || {});
