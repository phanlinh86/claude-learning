// Foxy's Reef Memory — headless game runner for the playtest sim.
//   const { runGame } = require('./sim');
//   runGame({ model: 'kid6', difficulty: 'normal', peek: 1, seed: 7 })
// Uses the real RF.World (game/js/world.js) loaded in a vm sandbox, the same overrides as
// main.js difficultyOverrides(), and a Human model that only acts through world.select().
// `proposal` = experimental rule changes that are simulated here (not in the game yet):
//   proposal.config         extra RF.CONFIG overrides (applied after the difficulty preset)
//   proposal.byDifficulty   { easy: {...}, normal: {...}, hard: {...} } overrides per difficulty
//   proposal.noGravity      disable the gravity twist (baseline comparison)
//   proposal.mismatchPenalty  air seconds lost on a mismatch where a card had ALREADY been seen
//                             face-up before (no penalty for honest exploration)
//   proposal.flowFromLap    from this lap index on, removals compact the whole board (see below)
//   proposal.penaltyFloor   the penalty never takes air below this (default 0.01 s)
'use strict';
const path = require('path');
const { load } = require(path.join(__dirname, '..', 'unit', 'load.js'));
const { MODELS, Human } = require('./players');

const RF = load(['rng.js', 'world.js']);
// Speed-up: Foxy and the cupcakes are pure presentation (no effect on air, score or cards),
// so the sim skips them (~25 % faster). Set SIM_FULL=1 to simulate them anyway.
if (!process.env.SIM_FULL) {
  RF.World.prototype._stepFox = function () {};
  RF.World.prototype._stepCupcakes = function () { this.cupcakes.length = 0; };
}

// same as main.js difficultyOverrides(d, peek)
function difficultyOverrides(d, peek) {
  const o = Object.assign({}, RF.DIFFICULTY[d] || {});
  o.peekTime = peek;
  return o;
}

function runGame(opts) {
  const prop = opts.proposal || {};
  const cfg = Object.assign(difficultyOverrides(opts.difficulty, opts.peek), prop.config || {},
    (prop.byDifficulty && prop.byDifficulty[opts.difficulty]) || {});
  const w = new RF.World({ seed: opts.seed, config: cfg });
  if (prop.noGravity) {
    w.startLevel = function (i) { RF.World.prototype.startLevel.call(this, i); this.gravity = { x: 0, y: 0 }; return this; };
    w.gravity = { x: 0, y: 0 };
  }
  if (prop.flowFromLap !== undefined) {
    // "whirlpool" idea: from lap N, a removal compacts the WHOLE board along the gravity
    // (reading order for up/down, column order for sideways), so cards also hop between lines.
    const base = w._applyGravity;
    w._applyGravity = function () {
      const g = this.gravity;
      if (this.lap < prop.flowFromLap || (!g.x && !g.y)) return base.call(this);
      const vertical = g.y !== 0, C = this.cols, R = this.rows;
      const idx = (k) => vertical ? k.row * C + k.col : k.col * R + k.row;
      const live = this.cards.filter(k => k.state !== 'gone').sort((a, b) => idx(a) - idx(b));
      const toEnd = vertical ? g.y > 0 : g.x > 0, N = C * R, moves = [];
      live.forEach((k, j) => {
        const t = toEnd ? N - live.length + j : j;
        const col = vertical ? t % C : Math.floor(t / R), row = vertical ? Math.floor(t / C) : t % R;
        if (col !== k.col || row !== k.row) {
          moves.push({ id: k.id, fromCol: k.col, fromRow: k.row, col, row });
          k.col = col; k.row = row; k._spd = 0; k._mode = 'travel'; k.moving = true; k.settling = false;
        }
      });
      if (moves.length) { this._emit({ type: 'slide', ids: moves.map(m => m.id), moves, gravity: { x: g.x, y: g.y } }); this._fixCursor(); }
      return moves;
    };
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
            if (pen && e.ids.some(id => seen.has(id))) { const a0 = w.air; w.air = Math.max(Math.min(a0, prop.penaltyFloor || 0.01), a0 - pen); penaltyTotal += a0 - w.air; }
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
