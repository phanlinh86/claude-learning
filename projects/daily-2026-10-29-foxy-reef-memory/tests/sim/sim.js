// Foxy's Reef Memory — headless game runner for the playtest sim.
//   const { runGame } = require('./sim');
//   runGame({ model: 'kid6', difficulty: 'normal', peek: 1, seed: 7 })
// Uses the real RF.World (game/js/world.js) loaded in a vm sandbox, the same overrides as
// main.js difficultyOverrides(), and a Human model that only acts through world.select().
// `proposal` = experimental rule changes that are simulated here (not in the game yet):
//   proposal.config         extra RF.CONFIG overrides (applied after the difficulty preset)
//   proposal.noGravity      disable the gravity twist (baseline comparison)
//   proposal.mismatchPenalty  air seconds lost on a mismatch where a card had ALREADY been seen
//                             face-up before (no penalty for honest exploration)
'use strict';
const path = require('path');
const { load } = require(path.join(__dirname, '..', 'unit', 'load.js'));
const { MODELS, Human } = require('./players');

const RF = load(['rng.js', 'world.js']);

// same as main.js difficultyOverrides(d, peek)
function difficultyOverrides(d, peek) {
  const o = Object.assign({}, RF.DIFFICULTY[d] || {});
  o.peekTime = peek;
  return o;
}

function runGame(opts) {
  const prop = opts.proposal || {};
  const cfg = Object.assign(difficultyOverrides(opts.difficulty, opts.peek), prop.config || {});
  const w = new RF.World({ seed: opts.seed, config: cfg });
  if (prop.noGravity) {
    w.startLevel = function (i) { RF.World.prototype.startLevel.call(this, i); this.gravity = { x: 0, y: 0 }; return this; };
    w.gravity = { x: 0, y: 0 };
  }
  const rng = new RF.RNG('player' + opts.seed + opts.model);
  const model = typeof opts.model === 'string' ? MODELS[opts.model] : opts.model;
  const p = new Human(w, model, rng);
  const maxLevels = opts.maxLevels || 40, maxTime = opts.maxTime || 3600;
  const dt = 1 / 60;
  const levels = [];
  let cur = null, seen = new Set(), penaltyTotal = 0;
  const startLevelRec = (lv) => {
    cur = { level: lv, season: lv % 4, lap: Math.floor(lv / 4), cleared: false, playTime: 0, air: 0, airMax: w.airMax,
      mistakes: 0, matches: 0, slides: 0, slideMoves: 0, score0: w.score, score: 0, bonus: 0, maxCombo: 0, minAir: Infinity, pairs: w.pairs };
    levels.push(cur); seen = new Set();
  };
  startLevelRec(0);
  // the deal of level 0 was emitted in the constructor
  for (const e of w.drainEvents()) p.onEvent(e);
  while (w.state !== 'dead' && w.time < maxTime && w.level < maxLevels) {
    p.step(dt);
    w.update(dt);
    if (w.state === 'playing' && cur) { cur.playTime += dt; if (w.air < cur.minAir) cur.minAir = w.air; }
    const ev = w.drainEvents();
    for (const e of ev) {
      switch (e.type) {
        case 'deal': if (e.level !== cur.level) startLevelRec(e.level); break;
        case 'flip': break;
        case 'match': cur.matches++; cur.maxCombo = Math.max(cur.maxCombo, e.combo); for (const id of e.ids) seen.add(id); break;
        case 'mismatch': {
          cur.mistakes++;
          if (prop.mismatchPenalty) {
            const pen = typeof prop.mismatchPenalty === 'number' ? prop.mismatchPenalty : prop.mismatchPenalty[opts.difficulty] || 0;
            if (pen && e.ids.some(id => seen.has(id))) { w.air = Math.max(0.01, w.air - pen); penaltyTotal += pen; }
          }
          for (const id of e.ids) seen.add(id);
          break;
        }
        case 'slide': cur.slides++; cur.slideMoves += e.moves.length; break;
        case 'cleared': cur.cleared = true; cur.air = e.air; cur.bonus = e.bonus; cur.score = w.score - cur.score0; break;
        case 'dead': cur.score = w.score - cur.score0; break;
      }
      p.onEvent(e);
    }
  }
  return {
    model: typeof opts.model === 'string' ? opts.model : 'custom', difficulty: opts.difficulty, peek: opts.peek, seed: opts.seed,
    dead: w.state === 'dead', deathLevel: w.state === 'dead' ? w.level : null, levelsCleared: w.levelsCleared,
    score: w.score, time: w.time, matches: w.matches, mistakes: w.mistakes, bestCombo: w.bestCombo, penaltyTotal,
    levels
  };
}

module.exports = { RF, runGame, MODELS, difficultyOverrides };
