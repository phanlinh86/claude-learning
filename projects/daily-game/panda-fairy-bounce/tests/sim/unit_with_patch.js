#!/usr/bin/env node
// Run tests/unit/run.js with a playtest patch applied (to see which unit tests a proposal would break).
//   node tests/sim/unit_with_patch.js proposed+stall
'use strict';
const path = require('path');
const loadMod = require('../unit/load');
const { apply } = require('./patch');
const name = process.argv[2] || 'proposed+stall';
const orig = loadMod.load;
loadMod.load = function (files) { const MFB = orig(files); if (MFB && MFB.World) apply(MFB, name); return MFB; };
require(path.join(__dirname, '..', 'unit', 'run.js'));
