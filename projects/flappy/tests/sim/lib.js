// Family Flappy — headless high-speed play-test harness (shared library).
// Loads the real game scripts (rng/world/weather/bot) in a vm sandbox, applies the
// SAME difficulty presets as game/js/main.js (the function is extracted from the
// source so it never drifts), and plays rounds with several player models.
'use strict';
const fs = require('fs');
const path = require('path');
const { load } = require('../unit/load');

const MAIN_JS = path.join(__dirname, '..', '..', 'game', 'js', 'main.js');

/** Extract `function difficultyOverrides(d) {...}` from main.js and bind it to FF. */
function extractDifficultyOverrides(FF) {
  const src = fs.readFileSync(MAIN_JS, 'utf8');
  const start = src.indexOf('function difficultyOverrides');
  if (start < 0) throw new Error('difficultyOverrides not found in main.js');
  let i = src.indexOf('{', start), depth = 0, end = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  const fnSrc = src.slice(start, end);
  // eslint-disable-next-line no-new-func
  return new Function('FF', fnSrc + '\nreturn difficultyOverrides;')(FF);
}

/* ------------------------------------------------------------------ */
/* Player models. Each: { name, step(dt, world), lastReason }          */
/* ------------------------------------------------------------------ */

function BotPlayer(FF, world, skill, seed) {
  const bot = new FF.Bot(world, { skill, seed });
  const before = () => Object.assign({}, bot.stats);
  return {
    name: 'bot' + skill, lastReason: null, bot,
    lapsing() { return bot._distracted > 0; },
    step(dt) {
      const b = before();
      bot.step(dt);
      for (const k of ['aimed', 'altitude', 'random']) if (bot.stats[k] !== b[k]) this.lastReason = k;
    }
  };
}

/** Young kid: slow reactions (250–400 ms), keeps a loose tap rhythm, taps when the
 *  bird "looks low", gets excited and taps when a turtle is near, does NOT aim, and
 *  now and then looks away (a butterfly!). */
function KidPlayer(FF, world, seed, opt) {
  opt = Object.assign({ delay: [0.25, 0.40], thrMean: 250, thrSd: 40, rhythm: 0.55, rhythmSd: 0.14,
    lapseEvery: 25, lapseFor: [0.6, 1.4], exciteRate: 1.0 }, opt || {});
  const rng = new FF.RNG(seed);
  let t = 0, last = -1e9, pending = [], thr = 0, rhythm = 0, lapse = 0;
  const resample = () => {
    thr = Math.max(170, Math.min(360, opt.thrMean + rng.gauss() * opt.thrSd));
    rhythm = Math.max(0.3, Math.min(0.8, opt.rhythm + rng.gauss() * opt.rhythmSd));
  };
  resample();
  const tap = (why) => { world.flap(); last = t; resample(); P.lastReason = why; };
  const P = {
    name: 'kid', lastReason: null,
    lapsing() { return lapse > 0; },
    step(dt) {
      t += dt;
      const w = world, b = w.bird;
      if (w.state === 'ready') { if (t > 0.8) tap('start'); return; }
      if (w.state !== 'playing') return;
      for (let i = pending.length - 1; i >= 0; i--) if (t >= pending[i].at) { const p = pending.splice(i, 1)[0]; tap(p.why); }
      if (lapse > 0) { lapse -= dt; return; }
      if (rng.chance(dt / opt.lapseEvery)) { lapse = rng.range(opt.lapseFor[0], opt.lapseFor[1]); pending = []; return; }
      if (pending.length || t - last < 0.14) return;
      const seenY = b.y + rng.gauss() * 8;
      if (seenY > thr) {
        pending.push({ at: t + rng.range(opt.delay[0], opt.delay[1]), why: 'low' });
        if (rng.chance(0.2)) pending.push({ at: t + rng.range(opt.delay[0], opt.delay[1]) + rng.range(0.1, 0.2), why: 'double' });
      } else if (t - last > rhythm) {
        tap('rhythm');
      } else {
        const near = w.turtles.some(tt => tt.x > b.x - 40 && tt.x < b.x + 220);
        if (near && b.y > 120 && rng.chance(opt.exciteRate * dt)) tap('excited');
      }
    }
  };
  return P;
}

/** Casual adult: 180–260 ms reactions, keeps the bird in a mid band, tries to aim
 *  ("tap a bit before the turtle") with ~±60 ms timing error, attention 75 %. */
function AdultPlayer(FF, world, seed, opt) {
  opt = Object.assign({ delay: [0.18, 0.26], thrMean: 310, thrSd: 25, timingSd: 0.06, attention: 0.75,
    lapseEvery: 60, lapseFor: [0.3, 0.8] }, opt || {});
  const rng = new FF.RNG(seed);
  let t = 0, last = -1e9, pending = null, thr = 0, lapse = 0;
  const attending = new Map();   // turtle id -> will I try to aim at it?
  const resample = () => { thr = Math.max(240, Math.min(380, opt.thrMean + rng.gauss() * opt.thrSd)); };
  resample();
  const tap = (why) => { world.flap(); last = t; resample(); P.lastReason = why; };
  const P = {
    name: 'adult', lastReason: null,
    lapsing() { return lapse > 0; },
    step(dt) {
      t += dt;
      const w = world, b = w.bird;
      if (w.state === 'ready') { if (t > 0.6) tap('start'); return; }
      if (w.state !== 'playing') return;
      if (pending) { if (t >= pending.at) { const p = pending; pending = null; tap(p.why); } return; }
      if (lapse > 0) { lapse -= dt; return; }
      if (rng.chance(dt / opt.lapseEvery)) { lapse = rng.range(opt.lapseFor[0], opt.lapseFor[1]); return; }
      if (t - last < 0.13) return;
      const seenY = b.y + rng.gauss() * 6;
      // an adult anticipates a little: looks at where the bird is heading
      if (seenY + b.vy * 0.12 > thr) { pending = { at: t + rng.range(opt.delay[0], opt.delay[1]) * 0.6, why: 'altitude' }; return; }
      if (b.y < 95) return;                         // don't tap near the top
      if (!w.canDrop()) return;
      const p = w.predictDrop(b.vy);
      if (p.hitId !== null && p.margin >= 6) {
        if (!attending.has(p.hitId)) attending.set(p.hitId, rng.chance(opt.attention));
        if (attending.get(p.hitId)) {
          // timing error: positive = late (executes later), negative ≈ early (we only model late part
          // as a delay; early taps are modelled by a symmetric x-offset through the delay sign)
          const e = rng.gauss() * opt.timingSd;
          pending = { at: t + Math.max(0, e + 0.03), why: 'aimed' };
        }
      }
    }
  };
  return P;
}

/** Spam flapper: taps at a fixed rate, nothing else (the exploit check). */
function SpamPlayer(FF, world, hz) {
  let t = 0, acc = 0;
  return {
    name: 'spam' + hz, lastReason: 'spam', lapsing() { return false; },
    step(dt) {
      t += dt;
      if (world.state === 'ready') { world.flap(); return; }
      if (world.state !== 'playing') return;
      acc += dt;
      if (acc >= 1 / hz) { acc -= 1 / hz; world.flap(); }
    }
  };
}

/** Ceiling hugger: taps whenever the bird is lower than 90 px from the top. */
function HuggerPlayer(FF, world) {
  let last = -1e9, t = 0;
  return {
    name: 'hugger', lastReason: 'hug', lapsing() { return false; },
    step(dt) {
      t += dt;
      if (world.state === 'ready') { world.flap(); return; }
      if (world.state !== 'playing') return;
      if (world.bird.y > 90 && t - last > 0.1) { world.flap(); last = t; }
    }
  };
}

/** Mid-hover spammer: rhythmic tapper that holds mid-screen (taps when y > 230). */
function HoverSpamPlayer(FF, world) {
  let last = -1e9, t = 0;
  return {
    name: 'hoverspam', lastReason: 'hover', lapsing() { return false; },
    step(dt) {
      t += dt;
      if (world.state === 'ready') { world.flap(); return; }
      if (world.state !== 'playing') return;
      if (world.bird.y > 230 && t - last > 0.1) { world.flap(); last = t; }
    }
  };
}

function makePlayer(FF, world, spec, seed) {
  const [kind, arg] = spec.split(':');
  switch (kind) {
    case 'bot': return BotPlayer(FF, world, parseFloat(arg), seed);
    case 'kid': return KidPlayer(FF, world, seed, arg === 'young' ? { delay: [0.3, 0.45], thrMean: 230 } : undefined);
    case 'adult': return AdultPlayer(FF, world, seed);
    case 'spam': return SpamPlayer(FF, world, parseFloat(arg));
    case 'hugger': return HuggerPlayer(FF, world);
    case 'hoverspam': return HoverSpamPlayer(FF, world);
    default: throw new Error('unknown player ' + spec);
  }
}

/* ------------------------------------------------------------------ */
/* One round                                                           */
/* ------------------------------------------------------------------ */

/** Whether a drop released now could hit ANY turtle, whatever the turtles do. */
function dropPossible(w, maxSpeed) {
  const p = w.predictDrop(w.bird.vy);           // with turtles as they will move
  if (p.hitId !== null) return { possible: true, predicted: true };
  // ground landing point & time: ignore turtles
  const c = w.cfg, h = 1 / 60;
  const d = w.dropInit(w.bird.vy);
  let time = 0;
  while (d.y + c.dropRadius < w.groundY && time < 3) { FFstep(d, h, w.scrollSpeed, w.wind, c); time += h; }
  for (const t of w.turtles) {
    const box = w.shellBox(t);
    const half = box.w / 2, cx = box.x + half;
    const lo = cx - w.scrollSpeed * time - maxSpeed * time - half;
    const hi = cx - w.scrollSpeed * time + maxSpeed * time + half;
    if (d.x >= lo && d.x <= hi) return { possible: true, predicted: false };
  }
  return { possible: false, predicted: false };
}
let FFstep = null;

/**
 * Play one round. opts: { FF, config, player, seed, cap (s of play), sampleOpp (bool) }
 * returns metrics object.
 */
function playRound(opts) {
  const FF = opts.FF;
  FFstep = FF.World.stepDropAir;
  const w = new FF.World({ seed: opts.seed, config: opts.config });
  w._preset = opts.preset;
  if (opts.patch) opts.patch(w, FF);
  const player = makePlayer(FF, w, opts.player, opts.seed * 7 + 3);
  const cap = opts.cap || 300, dt = 1 / 60;
  const c = w.cfg;
  const maxTurtleSpeed = Math.max(c.turtleSpeedMax, c.turtleSpeedMaxHard);
  const m = {
    player: opts.player, seed: opts.seed, survived: false, playTime: 0, score: 0, hits: 0, drops: 0, misses: 0,
    flaps: 0, bestCombo: 0, seasonIndex: 0, firstPointAt: null, seasonAt: [], deathCause: null,
    emptyTime: 0, oppTime: 0, oppSamples: 0, dropsImpossible: 0, dropsPredictedHit: 0,
    ceilingHits: 0, comboPoints: 0, highDrops: 0, highDropHits: 0, deathScore: null, deathSpeed: null,
    deathSinceSeason: null, lastFlapY: null, maxSpeedJump: 0, deathWind: null
  };
  let lastCeiling = -1e9, lastFlapAt = 0, sampleClock = 0, prevSpeed = w.scrollSpeed;
  const dropMeta = new Map();
  let lastSeasonAt = 0;
  let guard = 0;
  while (guard++ < (cap + 5) * 60) {
    player.step(dt, w);
    w.update(dt);
    if (w.state === 'playing') {
      const jump = Math.abs(w.scrollSpeed - prevSpeed) / dt;
      if (jump > m.maxSpeedJump) m.maxSpeedJump = jump;
    }
    prevSpeed = w.scrollSpeed;
    for (const e of w.drainEvents()) {
      if (e.type === 'flap') { lastFlapAt = w.playTime; m.lastFlapY = e.y; }
      else if (e.type === 'drop') {
        const meta = { high: w.bird.y < 120 };
        if (opts.sampleOpp !== false) {
          // evaluated right after spawn: use the drop's own state = the predict from just before is equivalent
          // enough; we re-evaluate possibility from current state with the new drop's init
        }
        dropMeta.set(e.id, meta);
        if (meta.high) m.highDrops++;
      } else if (e.type === 'hit') {
        if (m.firstPointAt === null) m.firstPointAt = w.playTime;
        if (e.points > c.pointsPerHit) m.comboPoints += e.points - c.pointsPerHit;
        const meta = dropMeta.get(e.id); if (meta && meta.high) m.highDropHits++;
      } else if (e.type === 'season') {
        m.seasonAt.push(+w.playTime.toFixed(2)); lastSeasonAt = w.playTime;
      } else if (e.type === 'ceiling') { m.ceilingHits++; lastCeiling = w.playTime; }
      else if (e.type === 'dead') {
        const since = w.playTime - lastCeiling;
        const lapse = player.lapsing && player.lapsing();
        m.deathCause = since < 1.2 ? 'ceiling-rebound' : lapse ? 'lapse/distracted'
          : (w.playTime - lastFlapAt > 1.0 ? 'no-flap>1s' : 'late-flap');
        m.deathScore = w.score; m.deathSpeed = +w.scrollSpeed.toFixed(1); m.deathWind = +w.wind.toFixed(1);
        m.deathSinceSeason = +(w.playTime - lastSeasonAt).toFixed(2);
      }
    }
    if (w.state === 'playing') {
      // turtle availability
      const onScreen = w.turtles.some(t => t.x > -t.w / 2 && t.x < w.width + t.w / 2);
      if (!onScreen) m.emptyTime += dt;
      sampleClock += dt;
      if (opts.sampleOpp !== false && sampleClock >= 0.1) {
        sampleClock = 0; m.oppSamples++;
        const p = dropPossible(w, maxTurtleSpeed);
        if (p.predicted) m.oppTime++;
        if (!p.possible) m.dropsImpossible++;      // here: "a drop now could not possibly hit"
      }
    }
    if (w.state === 'dead') break;
    if (w.playTime >= cap) { m.survived = true; break; }
  }
  m.playTime = +w.playTime.toFixed(2);
  m.score = w.score; m.hits = w.hits; m.drops = w.drops_made; m.misses = w.misses; m.flaps = w.flaps;
  m.bestCombo = w.bestCombo; m.seasonIndex = w.seasonIndex; m.livesUsed = w.livesUsed || 0;
  m.oppFrac = m.oppSamples ? m.oppTime / m.oppSamples : 0;
  m.impossibleFrac = m.oppSamples ? m.dropsImpossible / m.oppSamples : 0;
  delete m.oppTime; delete m.dropsImpossible;
  m.emptyTime = +m.emptyTime.toFixed(2);
  return m;
}

/* ------------------------------------------------------------------ */
/* Aggregation                                                         */
/* ------------------------------------------------------------------ */
function pct(arr, p) {
  if (!arr.length) return null;
  const s = arr.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))];
}
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;

function summarize(rounds) {
  const T = rounds.map(r => r.playTime), S = rounds.map(r => r.score);
  const totalTime = T.reduce((a, b) => a + b, 0);
  const totalScore = S.reduce((a, b) => a + b, 0);
  const drops = rounds.reduce((a, r) => a + r.drops, 0), hits = rounds.reduce((a, r) => a + r.hits, 0);
  const causes = {};
  rounds.forEach(r => { if (r.deathCause) causes[r.deathCause] = (causes[r.deathCause] || 0) + 1; });
  const fp = rounds.filter(r => r.firstPointAt !== null).map(r => r.firstPointAt);
  // season lengths: season k lasted seasonAt[k] - seasonAt[k-1] (season 0 from 0)
  const seasonLen = [];
  rounds.forEach(r => { let prev = 0; r.seasonAt.forEach(t => { seasonLen.push(t - prev); prev = t; }); });
  const firstSeasonLen = rounds.filter(r => r.seasonAt.length).map(r => r.seasonAt[0]);
  return {
    n: rounds.length,
    survivedCapPct: 100 * rounds.filter(r => r.survived).length / rounds.length,
    timeP10: pct(T, 0.1), timeMed: pct(T, 0.5), timeP90: pct(T, 0.9), timeMean: mean(T),
    scoreP10: pct(S, 0.1), scoreMed: pct(S, 0.5), scoreP90: pct(S, 0.9), scoreMean: mean(S),
    ppm: totalTime ? totalScore / (totalTime / 60) : 0,
    accuracy: drops ? hits / drops : 0,
    dropsPerMin: totalTime ? drops / (totalTime / 60) : 0,
    comboShare: totalScore ? rounds.reduce((a, r) => a + r.comboPoints, 0) / totalScore : 0,
    bestComboMed: pct(rounds.map(r => r.bestCombo), 0.5),
    seasonMed: pct(rounds.map(r => r.seasonIndex), 0.5),
    reachSummerPct: 100 * rounds.filter(r => r.seasonIndex >= 1).length / rounds.length,
    reachWinterPct: 100 * rounds.filter(r => r.seasonIndex >= 3).length / rounds.length,
    firstPointMed: pct(fp, 0.5), firstPointP90: pct(fp, 0.9),
    noPointPct: 100 * (rounds.length - fp.length) / rounds.length,
    seasonLenMed: pct(seasonLen, 0.5), firstSeasonLenMed: pct(firstSeasonLen, 0.5),
    emptyFrac: totalTime ? rounds.reduce((a, r) => a + r.emptyTime, 0) / totalTime : 0,
    oppFrac: mean(rounds.map(r => r.oppFrac)),
    impossibleFrac: mean(rounds.map(r => r.impossibleFrac)),
    ceilingPerMin: totalTime ? rounds.reduce((a, r) => a + r.ceilingHits, 0) / (totalTime / 60) : 0,
    highDropAcc: (() => { const hd = rounds.reduce((a, r) => a + r.highDrops, 0); return hd ? rounds.reduce((a, r) => a + r.highDropHits, 0) / hd : null; })(),
    causes,
    deathSinceSeasonMed: pct(rounds.filter(r => r.deathSinceSeason !== null).map(r => r.deathSinceSeason), 0.5),
    maxSpeedJump: Math.max.apply(null, rounds.map(r => r.maxSpeedJump)),
    livesUsedMean: mean(rounds.map(r => r.livesUsed || 0))
  };
}

module.exports = { load, extractDifficultyOverrides, playRound, summarize, pct, mean, makePlayer };
