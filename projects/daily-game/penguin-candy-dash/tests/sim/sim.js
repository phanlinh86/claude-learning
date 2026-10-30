// Pip's Candy Dash — one headless game with a player model; returns per-level records.
//   runGame({ model, difficulty, seed, maxTime, maxLevels, proposal, noTerrain })
'use strict';
const path = require('path');
const { load } = require(path.join(__dirname, '..', 'unit', 'load.js'));
const { makePlayer } = require('./players');
const PROPOSALS = require('./proposals');

const CD = load();
const DT = 1 / 60;

function configFor(job) {
  const cfg = Object.assign({}, CD.DIFFICULTY[job.difficulty] || {});
  const prop = job.proposal ? PROPOSALS[job.proposal] : null;
  if (prop) Object.assign(cfg, prop.all || {}, prop[job.difficulty] || {});
  if (job.noTerrain) cfg.zonesByBiome = [[], [], [], []];
  return cfg;
}

function runGame(job) {
  const w = new CD.World({ seed: job.seed, config: configFor(job) });
  const pl = makePlayer(CD, w, job.model, job.seed * 31 + 7);
  const maxTime = job.maxTime || 1800, maxLevels = job.maxLevels || 24;
  const levels = [];
  let L = null, popPts = 0, gemPts = 0, clearPts = 0;
  const newLevel = (e) => {
    L = { level: e.level, biome: e.biome, lap: e.lap, playTime: 0, cleared: false, bumps: [], gems: 0, gemPts: 0, popPts: 0, pops: 0,
      stunned: 0, clearBonus: 0, maxSizeT: 0, sizeT: 0, jarAtGateOpen: 0, gateTime: 0 };
    levels.push(L);
  };
  newLevel({ level: 0, biome: 0, lap: 0 });
  w.drainEvents();
  while (w.state !== 'dead' && w.time < maxTime && w.level < maxLevels) {
    pl.step(DT);
    w.update(DT);
    if (w.state === 'playing' && L) {
      L.playTime += DT; L.sizeT += w.size * DT;
      if (w.size >= w.sizeMax) L.maxSizeT += DT;
      if (w.gate.open) L.gateTime += DT;
    }
    for (const e of w.drainEvents()) {
      if (e.type === 'biome') { if (e.level !== L.level) newLevel(e); }
      else if (e.type === 'gem') { L.gems++; L.gemPts += e.points; gemPts += e.points; }
      else if (e.type === 'pop') { L.pops++; L.popPts += e.points; L.stunned += e.stunned; popPts += e.points; }
      else if (e.type === 'cleared') { L.cleared = true; L.clearBonus = e.bonus; clearPts += e.bonus; }
      else if (e.type === 'bump') {
        const t = w.terrainAt(e.x, e.y);
        L.bumps.push({ kind: e.kind, ter: t.ice ? 'ice' : t.slow ? 'slow' : t.puff >= 0 ? 'puff' : 'plain', size: w.size + 1, gate: w.gate.open });
      }
    }
  }
  return {
    model: job.model, difficulty: job.difficulty, seed: job.seed,
    dead: w.state === 'dead', deathLevel: w.level, time: w.time, score: w.score,
    gemPts, popPts, clearPts, capped: w.state !== 'dead',
    levels
  };
}

module.exports = { runGame, CD, configFor };
