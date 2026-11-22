// Otto's Playroom Dash — runs the unit suite (tests/unit/run.js) against a PATCHED copy of CONFIG, without touching game/js.
//   node tests/sim/unit-patched.js tests/sim/patches/<x>.json
'use strict';
const path = require('path');
const fs = require('fs');
const patch = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const loadMod = require('../unit/load');
const { deepMerge } = require('./playtest');
const orig = loadMod.load;
loadMod.load = function (files) { const OD = orig(files); if (OD && OD.World) deepMerge(OD.World.CONFIG, JSON.parse(JSON.stringify(patch))); return OD; };
require(path.join(__dirname, '..', 'unit', 'run.js'));
