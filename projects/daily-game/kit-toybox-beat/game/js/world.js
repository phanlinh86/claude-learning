/* Kit's Toybox Beat — KB.CONFIG + KB.DIFFICULTY + KB.LEVELS + KB.World (headless, deterministic)
 *
 * ============================== CONVENTIONS ==============================
 *  The world is screen-independent: it knows lanes (0 = upper shelf track, 1 = lower floor track)
 *  and times (seconds). The renderer maps time to x (docs/DESIGN.md §2):
 *      x = kitX + (note.time − songTime) / w.approach × (VW + 40 − kitX)
 *
 *  update(dt) accepts any dt and runs fixed sub-steps of cfg.step (1/120 s) with an accumulator
 *  (w._acc = leftover time, 0..step). Same seed + same inputs at the same sub-step → same result.
 *  The CHART of level i depends only on (seed, i, difficulty config), never on how you played.
 *
 *  Tap timing: tap(lane, offset) judges at  t = songTime + _acc + offset, i.e. the real time of
 *  the call between two sub-steps (no 8 ms quantisation) plus the timing-offset setting.
 *
 *  Render interpolation: at the start of each sub-step kit._ppos and boss._px01/_py01 are saved.
 *      pos = _ppos + (pos − _ppos) · (w._acc / w.cfg.step)
 *  Coins need no interpolation: use  songTime + _acc  as the render time.
 *
 *  Song structure: songTime runs from −readyBeats·beatLen (count-in, state 'ready') to songLen.
 *  Notes sit on the beat / half-beat grid: note.beat ∈ ½ℤ, note.time = note.beat · beatLen.
 * ========================================================================
 */
(function (KB) {
  'use strict';

  /* All tunables. Override per world with new KB.World({ config: {...} }) (e.g. KB.DIFFICULTY.easy). */
  var CONFIG = {
    name: 'normal',

    // --- timing
    step: 1 / 120,                 // s, fixed simulation sub-step (judging uses the exact call time anyway)
    maxDt: 0.5,                    // s, update() clamps dt (a hidden tab must not run a whole song in one frame)
    readyBeats: 4,                 // beats of count-in (state 'ready'): silence, 3, 2, 1 … Go! on beat 0
    clearedTime: 2.6,              // s in 'cleared' before the world starts the next level by itself
    lapBpm: 8,                     // BPM added per lap (after Night the day starts again a bit faster)

    // --- look-ahead (how long a coin is on screen before it reaches the ring)
    approach: 1.8,                 // s at the reference tempo: ≈ 2.5 beats at 84 BPM, a calm read for a 6-year-old
    approachRefBpm: 84,
    approachTempoExp: 0.5,         // approach ∝ (ref/bpm)^0.5: faster songs scroll faster, but not ∝ bpm (stays readable)
    approachMin: 1.05,             // s, floor for very fast laps

    // --- chart (docs/MECHANICS.md §2)
    songSec: 60,                   // s target song length on lap 0 (bars = round(songSec / barLen))
    lapBars: 4,                    // extra bars per lap…
    songMaxSec: 75,                // …but never longer than this
    minGap: 0.24,                  // s, no two notes (any lanes) closer than this. 0.24 keeps the eighths of
                                   //  Night (112 BPM → 0.268 s) and thins them only from lap 2 on
    eighthsFrom: 1,                // level index from which eighth-note pairs may appear (Normal: level 2)
    crossEighths: false,           // eighth pairs that jump lanes (hard only: too fast for small hands)
    maxDensity: 6,                 // notes per bar cap
    densStart: [1.5, 2.1, 2.5, 2.9], // avg notes / bar at the start of each time of day (lap 0)
    densRamp: 1.2,                 // + this much by the end of the song
    densLap: 0.4,                  // + per lap
    repeatChance: 0.35,            // call-and-response: a bar repeats the previous rhythm with lanes swapped
    laneKeep: 0.55,                // chance a bar keeps the previous bar's main lane (runs feel calmer)
    goldChance: 0.06,              // per coin (never in the first 2 bars or the ta-da bar)

    // --- Baron Fluff (boss)
    bossFirst: 12,                 // s into the song: first visit (he starts entering here)
    bossEvery: 30,                 // s between visit starts
    bossMinLeft: 8,                // s of song that must remain when a visit starts
    bossEnter: 1.2,                // s fly-in (ease in/out)
    bossSettle: 0.4,               // s hover before the first throw
    bossLinger: 0.5,               // s after the last pillow resolves before he leaves
    bossLeave: 1.2,                // s fly-out
    pillowsPerVisit: 3,
    pillowGapBeats: 4,             // one bar between pillows
    pillowAir: 2,                  // beats from the throw to the hit time (renderer arcs it from the basket)
    pillowClear: 1,                // beats: coins within ± this of a pillow are removed (it replaces them)
    oofTime: 0.8,                  // s of 'oof' frame after a pillow is bopped back
    throwFrame: 0.35,              // s of 'throw' frame (from 0.12 s before the throw)

    // --- judging windows (s, |tap − note.time|)
    perfectWin: 0.075,
    goodWin: 0.15,
    earlyWin: 0.30,                // tap earlier than goodWin but within this → the note is missed early (anti-spam)
    oneButton: false,              // every tap is lane −1 ("any")

    // --- groove (rocket fuel 0..1)
    grooveStart: 0.6,
    perfectGain: 0.035,
    goodGain: 0.02,
    missCost: 0.08,                // also for early misses
    poofCost: 0.08,
    firstLevelCostMul: 0.75,       // × miss/poof cost on level 1 (lap 0): very winnable for a 6-year-old
    grooveFloor: 0,                // groove can't drop below this…
    grooveFloorLevels: 0,          // …on level indices < this (Easy: 1 → level 1 can't be lost)
    grooveLow: 0.25,               // 'groovelow' when crossing below

    // --- combo / score
    comboStep: 10,                 // catches per multiplier step
    multMax: 4,
    comboBreakMin: 5,              // 'combobreak' only for combos worth mentioning
    perfectPts: 100, goodPts: 50, goldMul: 3, bouncePts: 250,
    clearBonus: 1000,              // × groove × (1 + lap)

    // --- Kit
    kitMoveTime: 0.09,             // s, critically damped spring reaches ≈ 94 % of a lane change in this time
    reachTime: 0.18,               // s of 'reach' frame after a tap
    happyTime: 0.35,               // s of 'happy' frame after a perfect
    dizzyTime: 0.9                 // s of 'dizzy' frame after a poof (frames only, input still works)
  };

  /* Per-difficulty overrides of CONFIG keys. */
  var DIFFICULTY = {
    easy: {
      name: 'easy', oneButton: true,
      perfectWin: 0.10, goodWin: 0.22, earlyWin: 0.30,
      missCost: 0.04, poofCost: 0.03, firstLevelCostMul: 1,
      grooveFloor: 0.05, grooveFloorLevels: 1,
      minGap: 0.5, eighthsFrom: 99,   // DESIGN said 0.55; 0.5 keeps every quarter of Night (112 BPM = 0.536 s) maxDensity: 4,
      densStart: [1.2, 1.6, 2.0, 2.4], densRamp: 0.8, densLap: 0.3,
      approach: 2.2, approachMin: 1.4
    },
    normal: { name: 'normal' },
    hard: {
      name: 'hard',
      perfectWin: 0.055, goodWin: 0.11, earlyWin: 0.28,
      missCost: 0.11, poofCost: 0.10, firstLevelCostMul: 1,
      minGap: 0.18, eighthsFrom: 0, crossEighths: true,
      densStart: [2.2, 2.8, 3.2, 3.6], densRamp: 1.4, densLap: 0.4,
      approach: 1.6, approachMin: 0.95
    }
  };

  var LEVELS = [
    { key: 'dawn', name: 'Dawn', bpm: 84 },
    { key: 'noon', name: 'Noon', bpm: 96 },
    { key: 'sunset', name: 'Sunset', bpm: 104 },
    { key: 'night', name: 'Night', bpm: 112 }
  ];

  /* 1-bar rhythm patterns. [beatOffset, 'A'|'B'] — A = this bar's main lane, B = the other lane.
   * e = has eighths, x = has an eighth that jumps lanes (hard only). */
  var PATTERNS = [
    { e: 0, p: [[0, 'A']] },
    { e: 0, p: [[0, 'A'], [2, 'A']] },
    { e: 0, p: [[0, 'A'], [2, 'B']] },
    { e: 0, p: [[0, 'A'], [3, 'A']] },
    { e: 0, p: [[1, 'A'], [3, 'A']] },
    { e: 0, p: [[0, 'A'], [1, 'A'], [2, 'A']] },
    { e: 0, p: [[0, 'A'], [2, 'A'], [3, 'B']] },
    { e: 0, p: [[0, 'A'], [1, 'B'], [2, 'A']] },
    { e: 0, p: [[0, 'A'], [2, 'B'], [3, 'B']] },
    { e: 0, p: [[0, 'A'], [1, 'A'], [3, 'B']] },
    { e: 0, p: [[0, 'A'], [1, 'A'], [2, 'A'], [3, 'A']] },
    { e: 0, p: [[0, 'A'], [1, 'B'], [2, 'A'], [3, 'B']] },
    { e: 0, p: [[0, 'A'], [1, 'A'], [2, 'B'], [3, 'B']] },
    { e: 0, p: [[0, 'A'], [1, 'A'], [2, 'A'], [3, 'B']] },
    { e: 0, p: [[0, 'A'], [1, 'B'], [2, 'B'], [3, 'A']] },
    { e: 1, p: [[0, 'A'], [1, 'A'], [1.5, 'A'], [2, 'A']] },
    { e: 1, p: [[0, 'A'], [2, 'B'], [2.5, 'B'], [3, 'B']] },
    { e: 1, p: [[0, 'A'], [0.5, 'A'], [2, 'B'], [3, 'B']] },
    { e: 1, p: [[0, 'A'], [1, 'A'], [2, 'B'], [2.5, 'B'], [3, 'B']] },
    { e: 1, p: [[0, 'A'], [0.5, 'A'], [1, 'A'], [2, 'B'], [3, 'B']] },
    { e: 1, p: [[0, 'A'], [1, 'B'], [1.5, 'B'], [3, 'A'], [3.5, 'A']] },
    { e: 1, p: [[0, 'A'], [0.5, 'A'], [1, 'A'], [2, 'B'], [2.5, 'B'], [3, 'B']] },
    { e: 1, p: [[0, 'A'], [1, 'A'], [1.5, 'A'], [2, 'B'], [3, 'B'], [3.5, 'B']] },
    { e: 1, x: 1, p: [[0, 'A'], [0.5, 'B'], [2, 'A'], [2.5, 'B']] },
    { e: 1, x: 1, p: [[0, 'A'], [1, 'A'], [1.5, 'B'], [2, 'B'], [3, 'A'], [3.5, 'B']] }
  ];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function ease(u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); }          // smoothstep ease in/out
  function mixSeed(seed, i) {
    var h = (KB.RNG ? new KB.RNG(seed).seed : (seed >>> 0)) ^ Math.imul((i + 1) | 0, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h ^= h >>> 13;
    return (h >>> 0) || 1;
  }

  /* ======================================================================= */
  function World(opts) {
    opts = opts || {};
    var cfg = {}, k;
    for (k in CONFIG) cfg[k] = CONFIG[k];
    if (opts.config) for (k in opts.config) cfg[k] = opts.config[k];
    this.cfg = cfg;
    this.seed = opts.seed !== undefined ? opts.seed : 1;
    this._events = [];
    this._nextId = 1;
    this.reset();
  }
  World.CONFIG = CONFIG;
  World.PATTERNS = PATTERNS;

  World.prototype._emit = function (e) { this._events.push(e); };
  World.prototype.drainEvents = function () { var e = this._events; this._events = []; return e; };

  World.prototype.reset = function () {
    var c = this.cfg;
    this.time = 0;
    this._acc = 0;
    this.score = 0;
    this.groove = c.grooveStart;
    this.combo = 0; this.maxCombo = 0; this.mult = 1;
    this.levelsCleared = 0;
    this.stats = { perfect: 0, good: 0, miss: 0, early: 0, gold: 0, bounced: 0, poofed: 0, taps: 0 };
    this.kit = { lane: 0, pos: 0, _ppos: 0, vel: 0, frame: 'idle', reach: 99, dizzy: 0, happy: 0 };
    this.boss = { state: 'away', x01: 1.3, y01: 0.12, _px01: 1.3, _py01: 0.12, t: 0, frame: 'idle', next: 999, oof: 0 };
    this._events = [];
    this._emit({ type: 'start' });
    this.startLevel(0);
  };

  /* Start level i (tod = i % 4, lap = i / 4). Keeps score / groove / combo. */
  World.prototype.startLevel = function (i) {
    var c = this.cfg;
    i = Math.max(0, i | 0);
    this.level = i;
    this.tod = i % 4;
    this.lap = Math.floor(i / 4);
    this.bpm = LEVELS[this.tod].bpm + c.lapBpm * this.lap;
    this.beatLen = 60 / this.bpm;
    this.approach = Math.max(c.approachMin, c.approach * Math.pow(c.approachRefBpm / this.bpm, c.approachTempoExp));
    this.songTime = -c.readyBeats * this.beatLen;
    this.beat = this.songTime / this.beatLen;
    this._nextBeat = -c.readyBeats;
    this.state = c.readyBeats > 0 ? 'ready' : 'playing';
    this._clearT = 0;
    this._first = 0;                 // index of the first note that may still be live
    this._done = false;
    this._genChart();
    var b = this.boss;
    b.state = 'away'; b.t = 0; b.frame = 'idle'; b.oof = 0; b.x01 = b._px01 = 1.3; b.y01 = b._py01 = 0.12;
    this._visit = -1;
    this._updateBoss(0);
    this.kit.dizzy = 0; this.kit.happy = 0;
    this.progress = 0;
    this._emit({ type: 'level', level: i, tod: this.tod, name: LEVELS[this.tod].name, bpm: this.bpm, lap: this.lap });
  };

  /* ------------------------------ chart ------------------------------ */
  World.prototype._genChart = function () {
    var c = this.cfg, rng = new KB.RNG(mixSeed(this.seed, this.level)), self = this;
    var bl = this.beatLen, barLen = 4 * bl, lap = this.lap, tod = this.tod, L = this.level;
    var bars = Math.round(c.songSec / barLen) + c.lapBars * lap;
    bars = clamp(bars, 6, Math.floor(c.songMaxSec / barLen));
    var lastBar = bars - 1;
    var allowE = L >= c.eighthsFrom, allowX = allowE && c.crossEighths;
    var d0 = c.densStart[Math.min(tod, 3)] + c.densLap * lap, d1 = d0 + c.densRamp;
    var pool = {};                                       // count → patterns allowed
    PATTERNS.forEach(function (p) {
      if (p.e && !allowE) return;
      if (p.x && !allowX) return;
      var n = p.p.length; if (n > c.maxDensity) return;
      (pool[n] = pool[n] || []).push(p);
    });
    function pickN(n) {
      while (n > 1 && !pool[n]) n--;
      return rng.pick(pool[n]);
    }
    var raw = [], A = rng.int(2), prevPat = null, prevA = 0;
    for (var bar = 0; bar < bars; bar++) {
      var pat, laneA, n;
      if (bar === 0 || bar === lastBar) { pat = PATTERNS[0]; laneA = bar === 0 ? A : rng.int(2); }
      else if (bar === 1 && L === 0) { pat = PATTERNS[rng.chance(0.5) ? 1 : 2]; laneA = A; }
      else {
        var u = bar / lastBar, target = d0 + (d1 - d0) * u;
        var ph = bar % 8;
        if (ph === 6 || ph === 7) target += 0.5;          // build-up at the end of an 8-bar phrase
        else if (ph === 0) target -= 0.5;                  // breather at the start of the next
        n = clamp(Math.round(target + rng.range(-0.5, 0.5)), 1, c.maxDensity);
        if (bar === 1) n = Math.min(n, 3);
        if (prevPat && rng.chance(c.repeatChance) && Math.abs(prevPat.p.length - n) <= 1 && bar > 1) {
          pat = prevPat; laneA = 1 - prevA;                // call-and-response: same rhythm, other lane
        } else {
          pat = pickN(n);
          laneA = rng.chance(c.laneKeep) ? prevA : 1 - prevA;
        }
      }
      prevPat = pat; prevA = laneA;
      for (var j = 0; j < pat.p.length; j++) {
        var off = pat.p[j][0], lane = pat.p[j][1] === 'A' ? laneA : 1 - laneA;
        raw.push({ beat: bar * 4 + off, lane: lane, bar: bar });
      }
    }
    raw.sort(function (a, b) { return a.beat - b.beat || a.lane - b.lane; });
    // pitch: a gentle random walk on the scale (0..7); upper lane leans up; downbeats snap to chord tones
    var pitch = 0, CHORD = [0, 2, 4, 7];
    for (var q = 0; q < raw.length; q++) {
      var r = raw[q];
      if (q > 0) {
        var step = rng.pick([-2, -1, -1, 0, 1, 1, 2]) + (r.lane === 0 ? 0.4 : -0.4);
        pitch = clamp(Math.round(pitch + step), 0, 7);
        if (r.beat % 4 === 0) {
          var best = 0; for (var cc = 0; cc < 4; cc++) if (Math.abs(CHORD[cc] - pitch) < Math.abs(best - pitch)) best = CHORD[cc];
          pitch = best;
        }
      }
      r.pitch = r.bar === lastBar ? 7 : pitch;
      r.kind = (r.bar >= 2 && r.bar < lastBar && rng.chance(c.goldChance)) ? 'gold' : 'coin';
    }
    // min-gap filter (any lanes): keep the earlier note
    var notes = [], lastT = -1e9;
    for (q = 0; q < raw.length; q++) {
      var t = raw[q].beat * bl;
      if (t - lastT < c.minGap - 1e-9) continue;
      notes.push(raw[q]); lastT = t;
    }
    var songLen = lastBar * 4 * bl + bl;               // ends one beat after the ta-da coin
    // boss visits (decided here → deterministic)
    var visits = [], brng = rng.fork('boss');
    var lastBarBeat = lastBar * 4;
    for (var vs = c.bossFirst; vs <= songLen - c.bossMinLeft + 1e-9; vs += c.bossEvery) {
      var pb0 = Math.ceil((vs + c.bossEnter + c.bossSettle) / bl + c.pillowAir - 1e-9);
      var pbl = pb0 + (c.pillowsPerVisit - 1) * c.pillowGapBeats;
      if (pbl > lastBarBeat - 2) break;                  // must finish before the ta-da bar
      var v = { tEnter: vs, tHover: vs + c.bossEnter, pillows: [] };
      for (var pi = 0; pi < c.pillowsPerVisit; pi++) {
        var pbeat = pb0 + pi * c.pillowGapBeats;
        v.pillows.push({ beat: pbeat, lane: brng.int(2), kind: 'pillow', pitch: 0 });
      }
      var lastP = v.pillows[v.pillows.length - 1];
      v.tLeave = lastP.beat * bl + c.goodWin + c.bossLinger;
      v.tOut = v.tLeave + c.bossLeave;
      visits.push(v);
    }
    // pillows replace coins within ± pillowClear beats (and ± minGap)
    visits.forEach(function (v) {
      v.pillows.forEach(function (p) {
        var tp = p.beat * bl, clr = Math.max(c.pillowClear * bl, c.minGap) + 1e-6;
        notes = notes.filter(function (n) { return Math.abs(n.beat * bl - tp) > clr; });
      });
    });
    visits.forEach(function (v) { v.pillows.forEach(function (p) { notes.push(p); }); });
    notes.sort(function (a, b) { return a.beat - b.beat || a.lane - b.lane; });
    this.notes = notes.map(function (r) {
      var n = {
        id: self._nextId++, lane: r.lane, time: r.beat * bl, beat: r.beat, kind: r.kind, pitch: r.pitch,
        state: 'live', judge: null, err: 0, tDone: 0
      };
      if (r.kind === 'pillow') { n.tThrow = (r.beat - c.pillowAir) * bl; r.note = n; }
      return n;
    });
    this._visits = visits.map(function (v) {
      return { tEnter: v.tEnter, tHover: v.tHover, tLeave: v.tLeave, tOut: v.tOut,
        ids: v.pillows.map(function (p) { return p.note.id; }),
        throws: v.pillows.map(function (p) { return p.note.tThrow; }), thrown: 0, inDone: false, outDone: false };
    });
    this.songLen = songLen;
    this.bars = bars;
    this._songEnd = notes.length ? notes[notes.length - 1].beat * bl + c.goodWin + bl : songLen;
  };

  /* Debug / test hook: Baron Fluff comes now (inserts a visit at the current song time). */
  World.prototype.bossNow = function () {
    var c = this.cfg, bl = this.beatLen;
    if (this.state !== 'playing' || this.boss.state !== 'away') return false;
    var vs = this.songTime;
    var pb0 = Math.ceil((vs + c.bossEnter + c.bossSettle) / bl + c.pillowAir - 1e-9);
    var pbl = pb0 + (c.pillowsPerVisit - 1) * c.pillowGapBeats;
    var lastNoteBeat = this.notes.length ? this.notes[this.notes.length - 1].beat : 0;
    if (pbl > lastNoteBeat - 2) return false;
    var rng = new KB.RNG(mixSeed(this.seed, 1000 + Math.round(vs * 10))), self = this;
    var v = { tEnter: vs, tHover: vs + c.bossEnter, ids: [], throws: [], thrown: 0, inDone: false, outDone: false };
    var tOutNew = (pbl * bl) + c.goodWin + c.bossLinger + c.bossLeave;
    // drop scheduled visits that would overlap
    this._visits = this._visits.filter(function (o) {
      if (o.tEnter > vs - 1e-9 && o.tEnter < tOutNew + 1) {
        self.notes = self.notes.filter(function (n) { return o.ids.indexOf(n.id) < 0; });
        return false;
      }
      return true;
    });
    for (var i = 0; i < c.pillowsPerVisit; i++) {
      var pb = pb0 + i * c.pillowGapBeats, tp = pb * bl, clr = Math.max(c.pillowClear * bl, c.minGap) + 1e-6;
      this.notes = this.notes.filter(function (n) { return n.state !== 'live' || Math.abs(n.time - tp) > clr; });
      var n = { id: this._nextId++, lane: rng.int(2), time: tp, beat: pb, kind: 'pillow', pitch: 0,
        state: 'live', judge: null, err: 0, tDone: 0, tThrow: (pb - c.pillowAir) * bl };
      this.notes.push(n); v.ids.push(n.id); v.throws.push(n.tThrow);
    }
    v.tLeave = pbl * bl + c.goodWin + c.bossLinger; v.tOut = v.tLeave + c.bossLeave;
    this.notes.sort(function (a, b) { return a.time - b.time || a.lane - b.lane; });
    this._visits.push(v);
    this._visits.sort(function (a, b) { return a.tEnter - b.tEnter; });
    this._first = 0;
    this._updateBoss(0);
    return true;
  };

  /* ------------------------------ input ------------------------------ */
  /* tap(lane [, offset]): lane 0 | 1 | −1 (any). offset (s) is added to the tap time (timing-offset setting).
   * Returns the resulting event ({type:'hit'|'miss'|'bounce'|'poof'|'empty'}) or null if ignored. */
  World.prototype.tap = function (lane, offset) {
    var c = this.cfg;
    if (this.state !== 'playing' && this.state !== 'ready') return null;
    lane = c.oneButton || lane === undefined || lane === null ? -1 : (lane < 0 ? -1 : (lane ? 1 : 0));
    var t = this.songTime + this._acc + (+offset || 0);
    var k = this.kit, notes = this.notes, i, n, best = null;
    this.stats.taps++;
    k.reach = 0;
    if (lane >= 0) k.lane = lane;
    this._emit({ type: 'tap', lane: lane });
    for (i = this._first; i < notes.length; i++) {
      n = notes[i];
      if (n.time - t > c.earlyWin) break;
      if (n.state !== 'live' || (lane >= 0 && n.lane !== lane)) continue;
      if (Math.abs(t - n.time) <= c.goodWin + 1e-9) { best = n; break; }
    }
    if (best) return this._hit(best, t - best.time);
    // too early? (anti-spam): the earliest live note (in the lane) that is earlyWin-near → missed early
    for (i = this._first; i < notes.length; i++) {
      n = notes[i];
      if (n.time - t > c.earlyWin + 1e-9) break;
      if (n.state !== 'live' || (lane >= 0 && n.lane !== lane)) continue;
      if (n.time - t > c.goodWin) {
        if (lane < 0) k.lane = n.lane;
        return this._miss(n, true, t);
      }
    }
    var e = { type: 'empty', lane: lane };
    this._emit(e);
    return e;
  };

  World.prototype._hit = function (n, err) {
    var c = this.cfg, k = this.kit, s = this.stats;
    var judge = Math.abs(err) <= c.perfectWin + 1e-9 ? 'perfect' : 'good';
    n.state = n.kind === 'pillow' ? 'bounced' : 'hit';
    n.judge = judge; n.err = err; n.tDone = this.songTime;
    k.lane = n.lane;
    this.combo++;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    var points, e;
    if (n.kind === 'pillow') {
      points = c.bouncePts * this.mult;
      s.bounced++;
      this.boss.oof = c.oofTime;
      e = { type: 'bounce', id: n.id, lane: n.lane, points: points, judge: judge, err: err, combo: this.combo, mult: this.mult };
    } else {
      points = (judge === 'perfect' ? c.perfectPts : c.goodPts) * this.mult * (n.kind === 'gold' ? c.goldMul : 1);
      s[judge]++;
      if (n.kind === 'gold') s.gold++;
      e = { type: 'hit', id: n.id, lane: n.lane, judge: judge, err: err, points: points, kind: n.kind, pitch: n.pitch, combo: this.combo, mult: this.mult };
    }
    this.score += points;
    this._addGroove(judge === 'perfect' ? c.perfectGain : c.goodGain);
    if (judge === 'perfect') k.happy = c.happyTime;
    this._emit(e);
    if (this.combo % c.comboStep === 0 && this.mult < c.multMax) {
      this.mult++;
      this._emit({ type: 'multup', mult: this.mult });
    }
    return e;
  };

  World.prototype._miss = function (n, early, t) {
    var c = this.cfg, e;
    n.state = n.kind === 'pillow' ? 'poof' : 'miss';
    n.judge = null; n.err = t !== undefined ? t - n.time : c.goodWin; n.tDone = this.songTime;
    if (this.combo >= c.comboBreakMin) this._emit({ type: 'combobreak', combo: this.combo });
    this.combo = 0; this.mult = 1;
    var mul = (this.level === 0) ? c.firstLevelCostMul : 1;
    if (n.kind === 'pillow') {
      this.stats.poofed++;
      this.kit.dizzy = c.dizzyTime;
      e = { type: 'poof', id: n.id, lane: n.lane, early: !!early };
      this._emit(e);
      this._addGroove(-c.poofCost * mul);
    } else {
      this.stats.miss++;
      if (early) this.stats.early++;
      e = { type: 'miss', id: n.id, lane: n.lane, kind: n.kind, early: !!early };
      this._emit(e);
      this._addGroove(-c.missCost * mul);
    }
    return e;
  };

  World.prototype._addGroove = function (d) {
    var c = this.cfg, g0 = this.groove;
    var floor = this.level < c.grooveFloorLevels ? c.grooveFloor : 0;
    var g = clamp(g0 + d, 0, 1);
    if (d < 0 && g < floor) g = Math.min(g0, floor);
    this.groove = g;
    if (g0 >= c.grooveLow && g < c.grooveLow) this._emit({ type: 'groovelow' });
    if (g <= 0 && this.state !== 'dead') this._setDead();
  };

  World.prototype._setDead = function () {
    this.groove = 0;
    this.state = 'dead';
    this.kit.dizzy = Math.max(this.kit.dizzy, 1e9);   // dizzy for good (renderer: rocket sputters)
    this._emit({ type: 'dead', score: this.score });
  };
  /* Test helper: empty the groove → 'dead' (emits 'dead' once). */
  World.prototype._die = function () { if (this.state !== 'dead') { this.groove = 0; this._setDead(); } };

  /* ------------------------------ simulation ------------------------------ */
  World.prototype.update = function (dt) {
    var h = this.cfg.step;
    dt = clamp(+dt || 0, 0, this.cfg.maxDt);
    this._acc += dt;
    while (this._acc >= h - 1e-9) { this._acc -= h; this._step(h); }
    if (this._acc < 0) this._acc = 0;
  };

  World.prototype._step = function (h) {
    var c = this.cfg, k = this.kit, b = this.boss;
    k._ppos = k.pos; b._px01 = b.x01; b._py01 = b.y01;
    // external `boss.next` poke (main.js debug bossNow()) → real visit
    if (b.state === 'away' && b.next !== this._bossNextOut && b.next < 0.5) this.bossNow();
    this.time += h;
    k.reach += h;
    if (k.dizzy > 0) k.dizzy = Math.max(0, k.dizzy - h);
    if (k.happy > 0) k.happy = Math.max(0, k.happy - h);
    if (b.oof > 0) b.oof = Math.max(0, b.oof - h);

    if (this.state === 'ready' || this.state === 'playing') {
      this.songTime += h;
      this.beat = this.songTime / this.beatLen;
      while (this._nextBeat * this.beatLen <= this.songTime + 1e-9) {
        var nb = this._nextBeat++;
        if (nb >= -3 && nb <= 0) this._emit({ type: 'count', n: nb === 0 ? 0 : -nb });
        if (nb >= 0 && this.state === 'ready') this.state = 'playing';
        this._emit({ type: 'beat', beat: nb, bar: Math.floor(nb / 4), down: ((nb % 4) + 4) % 4 === 0 });
      }
      if (this.state === 'ready' && this.songTime >= 0) this.state = 'playing';
      this._resolveMisses();
      this.progress = clamp(this.songTime / this.songLen, 0, 1);
      if (this.state === 'playing' && !this._done && this.songTime >= this._songEnd) this._finishSong();
    } else if (this.state === 'cleared') {
      this.songTime += h;
      this.beat = this.songTime / this.beatLen;
      this._clearT += h;
      if (this._clearT >= c.clearedTime) this.startLevel(this.level + 1);
    }
    this._updateBoss(h);
    this._updateKit(h);
  };

  World.prototype._resolveMisses = function () {
    var c = this.cfg, notes = this.notes, t = this.songTime;
    while (this._first < notes.length && notes[this._first].state !== 'live') this._first++;
    for (var i = this._first; i < notes.length; i++) {
      var n = notes[i];
      if (n.time + c.goodWin >= t) break;
      if (n.state === 'live') { this._miss(n, false); if (this.state === 'dead') return; }
    }
  };

  World.prototype._finishSong = function () {
    this._done = true;
    var bonus = Math.round(this.groove * this.cfg.clearBonus) * (1 + this.lap);
    this.score += bonus;
    this.state = 'cleared';
    this._clearT = 0;
    this.levelsCleared++;
    this._emit({ type: 'songdone' });
    this._emit({ type: 'cleared', bonus: bonus, level: this.level });
  };

  /* Kit: critically damped spring toward the target lane (exact solution per step: no overshoot from rest). */
  World.prototype._updateKit = function (h) {
    var c = this.cfg, k = this.kit;
    var om = 4.6 / c.kitMoveTime;                     // 1 − (1 + ωt)e^(−ωt) = 0.944 at ωt = 4.6
    var d = k.pos - k.lane, e = Math.exp(-om * h), v = k.vel;
    var a = v + om * d;
    k.pos = k.lane + (d + a * h) * e;
    k.vel = (v - om * a * h) * e;
    if (k.pos < 0) { k.pos = 0; k.vel = 0; } else if (k.pos > 1) { k.pos = 1; k.vel = 0; }
    k.frame = k.dizzy > 0 ? 'dizzy' : k.happy > 0 ? 'happy' : k.reach < c.reachTime ? 'reach' : 'idle';
  };

  /* Baron Fluff: state machine from the visit schedule, smooth eased path, gentle bob on the beat. */
  var AWAY_X = 1.3, AWAY_Y = 0.12, ENTER_Y = 0.04, EXIT_Y = 0.0;
  World.prototype._hoverPos = function (t) {
    var bl = this.beatLen;
    return [0.80 + 0.03 * Math.sin(2 * Math.PI * t / (8 * bl)),      // slow sway over two bars
            0.22 + 0.02 * Math.sin(Math.PI * t / bl)];                // bob once every two beats
  };
  World.prototype._updateBoss = function (h) {
    var c = this.cfg, b = this.boss, t = this.songTime, vs = this._visits, i, v = null;
    var active = this.state === 'ready' || this.state === 'playing';
    if (active) {
      for (i = 0; i < vs.length; i++) {
        var o = vs[i];
        if (!o.inDone && t >= o.tEnter) { o.inDone = true; this._emit({ type: 'bossin' }); }
        while (o.thrown < o.throws.length && t >= o.throws[o.thrown]) {
          var id = o.ids[o.thrown++], n = this._noteById(id);
          if (n) this._emit({ type: 'throw', id: id, lane: n.lane });
        }
        if (o.inDone && !o.outDone && t >= o.tLeave) { o.outDone = true; this._emit({ type: 'bossout' }); }
        if (t >= o.tEnter && t < o.tOut) v = o;
      }
    }
    var st = 'away', x = AWAY_X, y = AWAY_Y, stT = 0, hp;
    if (v) {
      if (t < v.tHover) {
        st = 'enter'; stT = t - v.tEnter; hp = this._hoverPos(t);
        var u = ease(stT / c.bossEnter);
        x = AWAY_X + (hp[0] - AWAY_X) * u; y = ENTER_Y + (hp[1] - ENTER_Y) * u;
      } else if (t < v.tLeave) {
        st = 'hover'; stT = t - v.tHover; hp = this._hoverPos(t); x = hp[0]; y = hp[1];
      } else {
        st = 'leave'; stT = t - v.tLeave; hp = this._hoverPos(t);
        var w2 = ease(stT / c.bossLeave);
        x = hp[0] + (AWAY_X - hp[0]) * w2; y = hp[1] + (EXIT_Y - hp[1]) * w2;
      }
    }
    if (b.oof > 0) {                                     // knocked back a little by the bopped pillow
      var kk = Math.sin(Math.PI * (1 - b.oof / c.oofTime));
      x += 0.035 * kk; y -= 0.015 * kk;
    }
    if (st !== b.state) b.t = 0; else b.t += h;
    if (st === 'enter' || st === 'hover' || st === 'leave') b.t = stT;
    b.state = st; b.x01 = x; b.y01 = y;
    var throwing = false;
    if (v) for (i = 0; i < v.throws.length; i++) if (t >= v.throws[i] - 0.12 && t < v.throws[i] - 0.12 + c.throwFrame) throwing = true;
    b.frame = b.oof > 0 ? 'oof' : throwing ? 'throw' : 'idle';
    // seconds until the next visit starts
    var nx = 999;
    if (active && !v) for (i = 0; i < vs.length; i++) if (vs[i].tEnter > t) { nx = vs[i].tEnter - t; break; }
    if (v) nx = 0;
    b.next = nx; this._bossNextOut = nx;
  };

  World.prototype._noteById = function (id) {
    for (var i = 0; i < this.notes.length; i++) if (this.notes[i].id === id) return this.notes[i];
    return null;
  };

  World.prototype.getState = function () {
    var live = 0;
    for (var i = 0; i < this.notes.length; i++) if (this.notes[i].state === 'live') live++;
    return {
      state: this.state, level: this.level, tod: this.tod, lap: this.lap, bpm: this.bpm,
      songTime: this.songTime, songLen: this.songLen, progress: this.progress,
      score: this.score, groove: this.groove, combo: this.combo, maxCombo: this.maxCombo, mult: this.mult,
      notes: this.notes.length, live: live, boss: this.boss.state, levelsCleared: this.levelsCleared,
      stats: JSON.parse(JSON.stringify(this.stats))
    };
  };

  KB.CONFIG = CONFIG;
  KB.DIFFICULTY = DIFFICULTY;
  KB.LEVELS = LEVELS;
  KB.World = World;
})(window.KB = window.KB || {});
