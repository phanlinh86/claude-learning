/* Momo's Dino Drums — DD.CONFIG + DD.DIFFICULTY + DD.LEVELS + DD.World (headless, deterministic)
 *
 * ============================== CONVENTIONS ==============================
 *  The world is screen-independent: it knows lanes (0 = upper bamboo rail, 1 = lower deck rail)
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
 *  Render interpolation: at the start of each sub-step kit._ppos and helper._px01/_py01 are saved.
 *      pos = _ppos + (pos − _ppos) · (w._acc / w.cfg.step)
 *  Gems need no interpolation: use  songTime + _acc  as the render time.
 *
 *  Pip's HELPER box (helper.x01 / y01). Suggested mapping (render.js layout):
 *      x = ringX   + x01 · 0.5 · (VW − ringX)
 *      y = coinY[0] + (y01 − 0.5) · 2 · (coinY[1] − coinY[0])
 *  so the lane-0 drum is (0, 0.5) and the lane-1 drum is (0, 1). Perch (0.14, 0.12) is above-right of the
 *  upper drum; away (1.15, −1.0) is just off the top edge in every layout. Anchors: DD.World.HELPER.
 *
 *  Song structure: songTime runs from −readyBeats·beatLen (count-in, state 'ready') to songLen.
 *  Notes sit on the beat / half-beat grid: note.beat ∈ ½ℤ, note.time = note.beat · beatLen.
 * ========================================================================
 */
(function (DD) {
  'use strict';

  /* All tunables. Override per world with new DD.World({ config: {...} }) (e.g. DD.DIFFICULTY.easy). */
  var CONFIG = {
    name: 'normal',

    // --- timing
    step: 1 / 120,                 // s, fixed simulation sub-step (judging uses the exact call time anyway)
    maxDt: 0.5,                    // s, update() clamps dt (a hidden tab must not run a whole song in one frame)
    readyBeats: 4,                 // beats of count-in (state 'ready'): silence, 3, 2, 1 … Go! on beat 0
    clearedTime: 2.6,              // s in 'cleared' before the world starts the next level by itself
    lapBpm: 8,                     // BPM added per lap (after the Sky Roof the lift goes down and it all starts a bit faster)

    // --- look-ahead (how long a gem is on screen before it reaches the ring)
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
    goldChance: 0.06,              // per gem (rainbow gem) (never in the first 2 bars or the ta-da bar)

    // --- Pip the helper (the twist, docs/MECHANICS.md §5). Times in s of song time.
    helperCombo: 5,                // catches in a row that call Pip (counted since Pip last left, so a long streak
                                   //  calls Pip again after the cooldown: "5 more!"). REQUIREMENT: combo 5
    helperEnter: 1.0,              // s fly-in from off-screen top-right to the perch (eased Bézier arc)
    helperStay: 20,                // s at most on the perch (a third of a song: a treat, not a crutch)
    helperLeave: 1.0,              // s fly-out (same arc reversed, rising first like a take-off)
    helperCooldown: 6,             // s after Pip is gone before the next call (≈ 1.5 bars: the child notices the gap)
    helperMult: 2,                 // × hit points while Pip is entering or perched (REQUIREMENT: "double")
    helperSaveTime: 0.6,           // s of the rescue swoop to the missed gem's drum and back (~1 beat at 96 BPM)
    helperMinLeft: 4,              // s of song that must remain for Pip to come (no arrival during the ta-da)

    // --- judging windows (s, |tap − note.time|)
    perfectWin: 0.075,
    goodWin: 0.17,                 // playtest: 0.15 → 0.17 (kid model clears Normal Dawn 53 % → 98 %; 0.18 lets chord spam through)
    earlyWin: 0.34,                // tap earlier than goodWin but within this → the note is missed early (anti-spam)
    oneButton: false,              // every tap is lane −1 ("any")
    wrongLaneMiss: true,           // a lane tap that hits nothing while the OTHER lane has a note inside goodWin misses that note
                                   //  (Momo swung to the wrong rail). Kills the 'tap both lanes on every beat' exploit.

    // --- groove (rocket fuel 0..1)
    grooveStart: 0.6,
    perfectGain: 0.035,
    goodGain: 0.02,
    missCost: 0.08,                // also for early misses
    firstLevelCostMul: 0.5,        // × miss cost on level 1 (lap 0): very winnable for a 6-year-old
    emptyCost: 0,                  // groove cost (× firstLevelCostMul) of a tap that catches nothing, on the FIRST floor only (Normal: anti-metronome)
    grooveFloor: 0,                // groove can't drop below this…
    grooveFloorLevels: 0,          // …on level indices < this (Easy: 1 → level 1 can't be lost)
    grooveLow: 0.25,               // 'groovelow' when crossing below

    // --- combo / score
    comboStep: 10,                 // catches per multiplier step
    multMax: 4,
    comboBreakMin: 5,              // 'combobreak' only for combos worth mentioning
    perfectPts: 100, goodPts: 50, goldMul: 3,
    clearBonus: 1000,              // × groove × (1 + lap)

    // --- Momo (object name w.kit kept from the sister game)
    kitMoveTime: 0.065,            // s (visual QA: 0.09 arrived ~75 ms after the catch), critically damped spring reaches ≈ 94 % of a lane change in this time
    reachTime: 0.18,               // s of 'reach' frame after a tap
    reachFirst: 0.08,              // s: 'reach' always shows first, even on a perfect (then 'happy')
    happyTime: 0.35,               // s of 'happy' frame after a perfect
    dizzyTime: 0.45                // s of 'dizzy' ("oops") frame after a miss (frames only, input still works)
  };

  /* Per-difficulty overrides of CONFIG keys. */
  var DIFFICULTY = {
    easy: {
      name: 'easy', oneButton: true,
      perfectWin: 0.10, goodWin: 0.22, earlyWin: 0.34, wrongLaneMiss: false,
      missCost: 0.04, firstLevelCostMul: 1,
      helperCombo: 4,                                 // small kids get Pip a little sooner
      grooveFloor: 0.05, grooveFloorLevels: 1,
      minGap: 0.5, eighthsFrom: 99, maxDensity: 4,   // DESIGN said 0.55; 0.5 keeps every quarter of Night (112 BPM = 0.536 s)
      densStart: [1.2, 1.6, 2.0, 2.4], densRamp: 0.8, densLap: 0.3,
      approach: 2.2, approachMin: 1.4
    },
    normal: {
      name: 'normal',
      densStart: [1.5, 1.8, 2.3, 2.9],              // playtest: gentler climb floor 1 → 3 for 4–6-year-olds (was 2.1, 2.5 on floors 2–3)
      emptyCost: 0.02                               // playtest §7 (0.03 cut the 4–6 kid F1 to 86 %): an empty tap on floor 1 costs a little groove; one-rail metronome F1 97 → ~60 %
    },
    hard: {
      name: 'hard',
      perfectWin: 0.055, goodWin: 0.09, earlyWin: 0.28,   // playtest: goodWin 0.11 → 0.09 (adults must lock onto the beat)
      missCost: 0.13, firstLevelCostMul: 1,              // playtest: 0.11 → 0.13 (misses matter on Hard)
      helperCooldown: 12,                                 // playtest: Pip was a crutch on Hard (4.1 → 2.8 saves / song)
      minGap: 0.18, eighthsFrom: 0, crossEighths: true,
      densStart: [2.2, 2.8, 3.2, 3.6], densRamp: 1.4, densLap: 0.4,
      approach: 1.6, approachMin: 0.95
    }
  };

  var LEVELS = [
    { key: 'river', name: 'Riverbank', floor: 1, bpm: 84 },
    { key: 'ferns', name: 'Fern Canopy', floor: 2, bpm: 96 },
    { key: 'nests', name: 'Nest Ledge', floor: 3, bpm: 104 },
    { key: 'sky', name: 'Sky Roof', floor: 4, bpm: 112 }
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
    var h = (DD.RNG ? new DD.RNG(seed).seed : (seed >>> 0)) ^ Math.imul((i + 1) | 0, 0x9e3779b1);
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
    this.deadT = -1;                 // s since the groove ran out (−1 = alive); renderer: Momo dozes off
    this.score = 0;
    this.groove = c.grooveStart;
    this.combo = 0; this.maxCombo = 0; this.mult = 1;
    this.levelsCleared = 0;
    this.stats = { perfect: 0, good: 0, miss: 0, early: 0, gold: 0, saved: 0, helpers: 0, taps: 0 };
    this.kit = { lane: 0, pos: 0, _ppos: 0, vel: 0, frame: 'idle', reach: 99, dizzy: 0, happy: 0 };
    this.helper = { state: 'away', t: 0, x01: AWAY[0], y01: AWAY[1], _px01: AWAY[0], _py01: AWAY[1],
      frame: 'fly', left: 0, cool: 0, saveLane: -1, saveId: 0 };
    this._helperBase = 0;            // combo when Pip last left: Pip comes when combo − base ≥ helperCombo
    this._events = [];
    this._emit({ type: 'start' });
    this.startLevel(0);
  };

  /* Start level i (tod = i % 4 = floor index, lap = i / 4). Keeps score / groove / combo. */
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
    // Pip never carries over into a new song (normally it already left at song end)
    var hp = this.helper;
    if (hp.state === 'enter' || hp.state === 'with' || hp.state === 'save') this._emit({ type: 'helperout' });
    if (hp.state !== 'away') this._helperBase = this.combo;
    this._setHelper('away');
    hp.x01 = hp._px01 = AWAY[0]; hp.y01 = hp._py01 = AWAY[1];
    this.kit.dizzy = 0; this.kit.happy = 0;
    this.progress = 0;
    this._emit({ type: 'level', level: i, tod: this.tod, name: LEVELS[this.tod].name, bpm: this.bpm, lap: this.lap });
  };

  /* ------------------------------ chart ------------------------------ */
  World.prototype._genChart = function () {
    var c = this.cfg, rng = new DD.RNG(mixSeed(this.seed, this.level)), self = this;
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
      // no 0.25 s cross-lane jump: if the previous bar ended on beat 3.5 and this bar starts on its downbeat,
      // keep that first coin in the same lane (unless fast cross-lane eighths are allowed, i.e. Hard)
      if (!allowX && prevPat && bar > 0 && prevPat.p[prevPat.p.length - 1][0] === 3.5 && pat.p[0][0] === 0) {
        var prevLast = prevPat.p[prevPat.p.length - 1][1] === 'A' ? prevA : 1 - prevA;
        var first = pat.p[0][1] === 'A' ? laneA : 1 - laneA;
        if (first !== prevLast) laneA = 1 - laneA;
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
      r.kind = (r.bar >= 2 && r.bar < lastBar && rng.chance(c.goldChance)) ? 'gold' : 'gem';
    }
    // min-gap filter (any lanes): keep the earlier note
    var notes = [], lastT = -1e9;
    for (q = 0; q < raw.length; q++) {
      var t = raw[q].beat * bl;
      if (t - lastT < c.minGap - 1e-9) continue;
      notes.push(raw[q]); lastT = t;
    }
    var songLen = lastBar * 4 * bl + bl;               // ends one beat after the ta-da coin
    this.notes = notes.map(function (r) {
      return {
        id: self._nextId++, lane: r.lane, time: r.beat * bl, beat: r.beat, kind: r.kind, pitch: r.pitch,
        state: 'live', judge: null, err: 0, tDone: 0
      };
    });
    this.songLen = songLen;
    this.bars = bars;
    this._songEnd = notes.length ? notes[notes.length - 1].beat * bl + c.goodWin + bl : songLen;
  };

  /* ------------------------------ input ------------------------------ */
  /* tap(lane [, offset]): lane 0 | 1 | −1 (any). offset (s) is added to the tap time (timing-offset setting).
   * Returns the resulting event ({type:'hit'|'miss'|'helpersave'|'empty'}) or null if ignored. */
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
    // wrong track (playtest §3b): the other lane has a note inside the good window → it is missed now
    if (c.wrongLaneMiss && lane >= 0) {
      for (i = this._first; i < notes.length; i++) {
        n = notes[i];
        if (n.time - t > c.goodWin + 1e-9) break;
        if (n.state === 'live' && n.lane !== lane && Math.abs(t - n.time) <= c.goodWin + 1e-9) return this._miss(n, false, t);
      }
    }
    var e = { type: 'empty', lane: lane };
    this._emit(e);
    if (c.emptyCost > 0 && this.level === 0 && this.state === 'playing') this._addGroove(-c.emptyCost * c.firstLevelCostMul);
    return e;
  };

  World.prototype._hit = function (n, err) {
    var c = this.cfg, k = this.kit, s = this.stats;
    var judge = Math.abs(err) <= c.perfectWin + 1e-9 ? 'perfect' : 'good';
    n.state = 'hit';
    n.judge = judge; n.err = err; n.tDone = this.songTime;
    k.lane = n.lane;
    this.combo++;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    var withPip = this._helperHelps();
    var points = (judge === 'perfect' ? c.perfectPts : c.goodPts) * this.mult * (n.kind === 'gold' ? c.goldMul : 1) *
      (withPip ? c.helperMult : 1);
    s[judge]++;
    if (n.kind === 'gold') s.gold++;
    var e = { type: 'hit', id: n.id, lane: n.lane, judge: judge, err: err, points: points, kind: n.kind, pitch: n.pitch,
      combo: this.combo, mult: this.mult, helper: withPip };
    this.score += points;
    this._addGroove(judge === 'perfect' ? c.perfectGain : c.goodGain);
    if (judge === 'perfect') k.happy = c.happyTime;
    this._emit(e);
    if (this.combo % c.comboStep === 0 && this.mult < c.multMax) {
      this.mult++;
      this._emit({ type: 'multup', mult: this.mult });
    }
    this._helperCall();              // the 5th catch in a row calls Pip right away (not doubled itself)
    return e;
  };

  World.prototype._miss = function (n, early, t) {
    var c = this.cfg, e;
    if (this._helperHelps()) return this._save(n, early, t);
    n.state = 'miss';
    n.judge = null; n.err = t !== undefined ? t - n.time : c.goodWin; n.tDone = this.songTime;
    if (this.combo >= c.comboBreakMin) this._emit({ type: 'combobreak', combo: this.combo });
    this.combo = 0; this.mult = 1; this._helperBase = 0;
    var mul = (this.level === 0) ? c.firstLevelCostMul : 1;
    this.stats.miss++;
    if (early) this.stats.early++;
    this.kit.dizzy = Math.max(this.kit.dizzy, c.dizzyTime);
    e = { type: 'miss', id: n.id, lane: n.lane, kind: n.kind, early: !!early };
    this._emit(e);
    this._addGroove(-c.missCost * mul);
    return e;
  };

  /* Pip catches a gem that would have been missed: no groove loss, combo kept (not increased), no points. */
  World.prototype._save = function (n, early, t) {
    var hp = this.helper;
    n.state = 'saved';
    n.judge = null; n.err = t !== undefined ? t - n.time : this.cfg.goodWin; n.tDone = this.songTime;
    this.stats.saved++;
    this._setHelper('save');
    hp.saveLane = n.lane; hp.saveId = n.id;
    hp._fx = hp.x01; hp._fy = hp.y01;
    var e = { type: 'helpersave', id: n.id, lane: n.lane, early: !!early };
    this._emit(e);
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
    this.deadT = 0;
    this.kit.dizzy = Math.max(this.kit.dizzy, 1e9);   // sleepy for good
    this._helperGo();
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
    var c = this.cfg, k = this.kit, hp = this.helper;
    k._ppos = k.pos; hp._px01 = hp.x01; hp._py01 = hp.y01;
    this.time += h;
    if (this.deadT >= 0) this.deadT += h;
    k.reach += h;
    if (k.dizzy > 0) k.dizzy = Math.max(0, k.dizzy - h);
    if (k.happy > 0) k.happy = Math.max(0, k.happy - h);

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
    } else if (this.state === 'dead') {
      this.beat += h / this.beatLen;   // song clock frozen; keep a beat phase for Pip's flight-out bob
    }
    this._updateHelper(h);
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
    this._helperGo();
    this._emit({ type: 'songdone' });
    this._emit({ type: 'cleared', bonus: bonus, level: this.level });
  };

  /* Momo: critically damped spring toward the target lane (exact solution per step: no overshoot from rest). */
  World.prototype._updateKit = function (h) {
    var c = this.cfg, k = this.kit;
    var om = 4.6 / c.kitMoveTime;                     // 1 − (1 + ωt)e^(−ωt) = 0.944 at ωt = 4.6
    var d = k.pos - k.lane, e = Math.exp(-om * h), v = k.vel;
    var a = v + om * d;
    k.pos = k.lane + (d + a * h) * e;
    k.vel = (v - om * a * h) * e;
    if (k.pos < 0) { k.pos = 0; k.vel = 0; } else if (k.pos > 1) { k.pos = 1; k.vel = 0; }
    k.frame = k.dizzy > 0 ? 'dizzy' : k.reach < c.reachFirst ? 'reach' : k.happy > 0 ? 'happy' : k.reach < c.reachTime ? 'reach' : 'idle';
  };

  /* ------------------------------ Pip the helper ------------------------------
   * State machine (docs/MECHANICS.md §5):
   *   away ──(combo − base ≥ helperCombo, cool ≤ 0, 'playing', ≥ helperMinLeft s left)──▶ enter ─(helperEnter)─▶ with
   *   with ─(helperStay)─▶ leave ;  enter|with ─(a miss)─▶ save ─(helperSaveTime)─▶ leave ─(helperLeave)─▶ away (cool = helperCooldown)
   *   song end / death / startLevel: enter|with|save ─▶ leave (startLevel: straight to away)
   * Coordinates x01/y01 (HELPER box, see the header): drums at x01 = 0; lane 0 drum y01 = 0.5, lane 1 drum y01 = 1.
   */
  World.prototype._helperHelps = function () {
    var s = this.helper.state;
    return s === 'enter' || s === 'with';
  };

  World.prototype._setHelper = function (st) {
    var hp = this.helper;
    if (hp.state !== st) { hp.state = st; hp.t = 0; }
    if (st !== 'save') { hp.saveLane = -1; hp.saveId = 0; }
  };

  World.prototype._helperCanCome = function () {
    var c = this.cfg, hp = this.helper;
    return hp.state === 'away' && hp.cool <= 0 && this.state === 'playing' &&
      this.songLen - this.songTime >= c.helperMinLeft - 1e-9;
  };

  World.prototype._helperEnter = function () {
    var c = this.cfg, hp = this.helper;
    this._setHelper('enter');
    hp.left = c.helperStay;
    hp._fx = hp.x01; hp._fy = hp.y01;
    this.stats.helpers++;
    this._emit({ type: 'helperin' });
  };

  World.prototype._helperCall = function () {
    if (this._helperCanCome() && this.combo - this._helperBase >= this.cfg.helperCombo) this._helperEnter();
  };

  /* Song end / death: Pip waves goodbye (from wherever it is). */
  World.prototype._helperGo = function () {
    var hp = this.helper;
    if (hp.state === 'enter' || hp.state === 'with' || hp.state === 'save') {
      this._setHelper('leave');
      hp._fx = hp.x01; hp._fy = hp.y01;
      hp.left = 0;
      this._helperBase = this.combo;
      this._emit({ type: 'helperout' });
    }
  };

  /* Debug / test hook (main.js helperNow()): Pip comes now, ignoring combo and cooldown. */
  World.prototype.helperNow = function () {
    if (this.state !== 'playing' || this.helper.state !== 'away') return false;
    this.helper.cool = 0;
    this._helperEnter();
    return true;
  };

  // HELPER box anchors (x01, y01)
  var AWAY = [1.15, -1.0];           // just off the top edge in every layout (iPad portrait is the tightest), so Pip shows at once
  var PERCH = [0.14, 0.12];          // above-right of the upper drum, clear of the gems' last hops
  var DRUM_Y = [0.42, 0.92];         // just above each drum (Pip snatches the gem as it lands)
  var BOB = 0.035;                   // perch bob height (y01) on each beat
  World.HELPER = { away: AWAY, perch: PERCH, drumY: DRUM_Y };

  function bez(p0, p1, p2, u) { var v = 1 - u; return v * v * p0 + 2 * v * u * p1 + u * u * p2; }

  World.prototype._perchPos = function (t) {
    // Pip sits on the rail and hops with the beat: highest between beats, lands on every beat.
    // sin²(π·beat) has zero slope at the landing; `ramp` fades the bob in so the landing has no jump.
    var ph = Math.sin(Math.PI * this.beat), ramp = clamp(t / 0.3, 0, 1);
    return [PERCH[0], PERCH[1] - BOB * ph * ph * ramp];
  };

  World.prototype._updateHelper = function (h) {
    var c = this.cfg, hp = this.helper, u, x, y, p;
    if (hp.state === 'away') {
      if (hp.cool > 0) hp.cool = Math.max(0, hp.cool - h);
      this._helperCall();                     // cooldown over while the streak is still running
    }
    if (hp.state !== 'away') hp.t += h;
    switch (hp.state) {
      case 'enter':
        if (hp.t >= c.helperEnter) { this._setHelper('with'); hp.t = 0; }
        break;
      case 'with':
        hp.left = Math.max(0, hp.left - h);
        if (hp.left <= 0) {
          this._setHelper('leave'); hp._fx = hp.x01; hp._fy = hp.y01;
          this._helperBase = this.combo;
          this._emit({ type: 'helperout' });
        }
        break;
      case 'save':
        if (hp.t >= c.helperSaveTime) {
          this._setHelper('leave'); hp._fx = hp.x01; hp._fy = hp.y01; hp.left = 0;
          this._helperBase = this.combo;
          this._emit({ type: 'helperout' });
        }
        break;
      case 'leave':
        if (hp.t >= c.helperLeave) {
          this._setHelper('away'); hp.cool = c.helperCooldown;
        }
        break;
    }
    // --- motion
    switch (hp.state) {
      case 'enter':                            // Bézier arc: glides in high, then drops onto the perch (smoothstep)
        u = ease(hp.t / c.helperEnter); p = this._perchPos(0);
        x = bez(hp._fx, 0.75, p[0], u); y = bez(hp._fy, -0.25, p[1], u);
        break;
      case 'with':
        p = this._perchPos(hp.t); x = p[0]; y = p[1];
        break;
      case 'save': {                           // out-and-back swoop: s = sin²(πu) (0 → 1 → 0, zero speed at both ends),
        u = clamp(hp.t / c.helperSaveTime, 0, 1);   // plus a forward loop so the return is not the same line
        var s = Math.sin(Math.PI * u); s *= s;
        var tx = 0.04, ty = DRUM_Y[hp.saveLane === 1 ? 1 : 0];
        x = hp._fx + (tx - hp._fx) * s + 0.10 * Math.sin(2 * Math.PI * u) * Math.sin(Math.PI * u);
        y = hp._fy + (ty - hp._fy) * s;
        break;
      }
      case 'leave':                            // take-off: rises first, then away to the top-right (smoothstep)
        u = ease(hp.t / c.helperLeave);
        x = bez(hp._fx, hp._fx + 0.15, AWAY[0], u); y = bez(hp._fy, hp._fy - 0.55, AWAY[1], u);
        break;
      default:
        x = AWAY[0]; y = AWAY[1];
    }
    hp.x01 = x; hp.y01 = y;
    hp.frame = hp.state === 'with' ? 'cheer' : 'fly';
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
      notes: this.notes.length, live: live, helper: this.helper.state, levelsCleared: this.levelsCleared,
      stats: JSON.parse(JSON.stringify(this.stats))
    };
  };

  DD.CONFIG = CONFIG;
  DD.DIFFICULTY = DIFFICULTY;
  DD.LEVELS = LEVELS;
  DD.World = World;
})(window.DD = window.DD || {});
