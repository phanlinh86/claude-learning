// Kit's Toybox Beat — player models for the high-speed playtest (tests/sim/run.js).
//
// Every model plays only through the public input API  w.tap(lane, offset)  and reads the screen state
// (w.notes, w.songTime + w._acc) exactly like KB.Bot does: a tap planned for song time T is fired in the
// frame that contains T with offset = T − now, so results do not depend on the frame rate.
//
//   const p = makePlayer(KB, world, 'kid', seed);   // or 'casual', 'spamBoth', 'bot:0.6', …
//   p.step(dt); world.update(dt);                   // same order as KB.Bot
//   p.desc                                          // the sampled parameters of this run's player
'use strict';

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

/* ------------------------------------------------------------------------------------------------
 * Human-like model (reaction based, not anticipation based).
 *  - Each note is noticed once it is `notice` s from the ring (kids watch the coin come close).
 *  - Tap time = note.time + bias + N(0, σ)  (σ grows a little with tempo: reaction play can't lock to the beat).
 *  - wrongLane: taps the other lane (never in one-button Easy).
 *  - skip: just doesn't tap that note.
 *  - lapses: Poisson attention gaps (rate per second of play, duration range): no taps at all.
 *  - refractory: a tap planned within `refr` s of the previous planned tap is dropped with p = refrSkip
 *    (small hands can't re-trigger fast).
 *  - doubleTap: excited extra tap 0.10–0.20 s after a tap (can early-miss the next coin).
 *  - ignorePillows / onlyLane: exploit / special-behaviour switches.
 * ------------------------------------------------------------------------------------------------ */
const PRESETS = {
  kid(r) {
    return {
      name: 'kid 4–6', sigma: r.range(0.09, 0.14), bias: r.range(0.03, 0.08), wrongLane: r.range(0.15, 0.25),
      skip: 0.05, lapseRate: 1 / 30, lapseDur: [2, 5], refr: 0.30, refrSkip: 0.4, doubleTap: 0.08,
      tempoSigma: 0.5, notice: 0.7
    };
  },
  casual(r) {
    return {
      name: 'casual adult', sigma: r.range(0.04, 0.06), bias: r.range(0.0, 0.02), wrongLane: 0.05,
      skip: 0.02, lapseRate: 1 / 150, lapseDur: [1, 2], refr: 0.15, refrSkip: 0.2, doubleTap: 0.01,
      tempoSigma: 0.25, notice: 1.0
    };
  },
  camper(r) { const p = PRESETS.casual(r); p.name = 'one-lane camper (lane 1 only)'; p.onlyLane = 1; return p; },
  pillowIgnorer(r) { const p = PRESETS.casual(r); p.name = 'pillow ignorer'; p.ignorePillows = true; return p; },
  kidPillowIgnorer(r) { const p = PRESETS.kid(r); p.name = 'kid, ignores pillows'; p.ignorePillows = true; return p; }
};

function Human(KB, world, params, seed) {
  this.w = world; this.p = params; this.r = new KB.RNG(seed);
  this.desc = params;
  this._plans = []; this._seen = {}; this._level = -1; this._lastPlan = -1e9;
  this._lapseUntil = -1; this._nextLapse = params.lapseRate > 0 ? this._exp(1 / params.lapseRate) : 1e12;
}
Human.prototype._exp = function (mean) { return -Math.log(1 - this.r.next()) * mean; };
Human.prototype.step = function (dt) {
  const w = this.w, p = this.p, r = this.r;
  if (w.level !== this._level) { this._level = w.level; this._plans = []; this._seen = {}; this._lastPlan = -1e9; }
  if (w.state !== 'ready' && w.state !== 'playing') return;
  // attention lapses run on absolute play time (w.time)
  if (w.time >= this._nextLapse) {
    this._lapseUntil = w.time + r.range(p.lapseDur[0], p.lapseDur[1]);
    this._nextLapse = this._lapseUntil + this._exp(1 / p.lapseRate);
  }
  const now = w.songTime + (w._acc || 0), oneB = !!w.cfg.oneButton;
  const tempoK = 1 + (p.tempoSigma || 0) * Math.max(0, (w.bpm - 84) / 84);
  const notes = w.notes;
  for (let i = w._first || 0; i < notes.length; i++) {
    const n = notes[i];
    if (n.time > now + dt + p.notice) break;
    if (n.state !== 'live' || this._seen[n.id]) continue;
    this._seen[n.id] = true;
    const absT = w.time + (n.time - now);
    if (absT < this._lapseUntil) continue;                               // looking away
    if (p.ignorePillows && n.kind === 'pillow') continue;
    if (p.onlyLane !== undefined && n.lane !== p.onlyLane) continue;
    if (r.chance(p.skip)) continue;
    let t = n.time + p.bias + r.gauss() * p.sigma * tempoK;
    if (t - this._lastPlan < p.refr && r.chance(p.refrSkip)) continue;
    let lane = oneB ? -1 : n.lane;
    if (!oneB && r.chance(p.wrongLane)) lane = 1 - n.lane;
    this._plans.push({ t, lane }); this._lastPlan = t;
    if (r.chance(p.doubleTap)) this._plans.push({ t: t + r.range(0.10, 0.20), lane });
  }
  this._plans.sort((a, b) => a.t - b.t);
  while (this._plans.length && this._plans[0].t < now + dt) {
    const q = this._plans.shift();
    if (w.state !== 'ready' && w.state !== 'playing') break;
    w.tap(q.lane, q.t - now);
  }
};

/* ------------------------------------------------------------------------------------------------
 * Spam exploit: a tap every U(60,120) ms with no regard to the coins.
 *  mode 'both' = both lanes at once each tick, 'alt' = alternating lanes, 'one' = always lane 0.
 * ------------------------------------------------------------------------------------------------ */
function Spam(KB, world, mode, seed, period) {
  this.w = world; this.mode = mode; this.r = new KB.RNG(seed); this.period = period || [0.06, 0.12];
  this.desc = { name: 'spam ' + mode, period: this.period };
  this._next = null; this._level = -1; this._k = 0;
}
Spam.prototype.step = function (dt) {
  const w = this.w;
  if (w.level !== this._level) { this._level = w.level; this._next = null; }
  if (w.state !== 'ready' && w.state !== 'playing') return;
  const now = w.songTime + (w._acc || 0);
  if (this._next === null) this._next = now;
  while (this._next < now + dt) {
    const off = this._next - now;
    if (this.mode === 'both') { w.tap(0, off); w.tap(1, off); }
    else if (this.mode === 'alt') w.tap((this._k++) & 1, off);
    else w.tap(0, off);
    this._next += this.r.range(this.period[0], this.period[1]);
    if (w.state !== 'ready' && w.state !== 'playing') return;
  }
};

/* ------------------------------------------------------------------------------------------------
 * Metronome exploit: ignore the coins, tap on every beat (σ = 30 ms). 'both' = both lanes each beat
 * (a two-thumb "chord"), 'one' = lane 0 only. Notes all sit on the beat grid, so this needs no reading.
 * ------------------------------------------------------------------------------------------------ */
function Metronome(KB, world, mode, seed) {
  this.w = world; this.mode = mode; this.r = new KB.RNG(seed); this.desc = { name: 'metronome ' + mode };
  this._nb = null; this._level = -1;
}
Metronome.prototype.step = function (dt) {
  const w = this.w;
  if (w.level !== this._level) { this._level = w.level; this._nb = null; }
  if (w.state !== 'ready' && w.state !== 'playing') return;
  const now = w.songTime + (w._acc || 0), bl = w.beatLen;
  if (this._nb === null) this._nb = Math.ceil(now / bl);
  while (true) {
    const t = this._nb * bl + this.r.gauss() * 0.03;
    if (t >= now + dt) break;
    this._nb++;
    if (this.mode === 'both') { w.tap(0, t - now); w.tap(1, t - now); } else w.tap(0, t - now);
    if (w.state !== 'ready' && w.state !== 'playing') return;
  }
};

/* KB.Bot wrapper so all players look the same to run.js. */
function BotP(KB, world, skill, seed) {
  this.b = new KB.Bot(world, { skill, seed }); this.desc = { name: 'bot ' + skill, skill };
}
BotP.prototype.step = function (dt) { this.b.step(dt); };

/* Idle: never taps (sanity: Easy L1 can't be lost; Normal no-tap death time). */
function Idle() { this.desc = { name: 'idle (no taps)' }; }
Idle.prototype.step = function () {};

function makePlayer(KB, world, kind, seed) {
  if (kind.startsWith('bot:')) return new BotP(KB, world, +kind.slice(4), seed);
  if (kind === 'spamBoth') return new Spam(KB, world, 'both', seed);
  if (kind === 'spamAlt') return new Spam(KB, world, 'alt', seed);
  if (kind === 'spamOne') return new Spam(KB, world, 'one', seed);
  if (kind === 'spamFast') return new Spam(KB, world, 'both', seed, [0.04, 0.06]);
  if (kind === 'mashSlow') return new Spam(KB, world, 'one', seed, [0.20, 0.33]);
  if (kind === 'mashSlowBoth') return new Spam(KB, world, 'both', seed, [0.20, 0.33]);
  if (kind === 'beatBoth') return new Metronome(KB, world, 'both', seed);
  if (kind === 'beatOne') return new Metronome(KB, world, 'one', seed);
  if (kind === 'idle') return new Idle();
  const pre = PRESETS[kind];
  if (!pre) throw new Error('unknown player ' + kind);
  const r0 = new KB.RNG(seed * 7919 + 13);
  return new Human(KB, world, pre(r0), seed * 31 + 7);
}

module.exports = { makePlayer, PRESETS, clamp };
