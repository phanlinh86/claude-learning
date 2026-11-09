// Run the existing unit suite (tests/unit/run.js, unchanged) against the RECOMMENDED patch, in memory only:
// fs.readFileSync is hooked so world.js gets the patch's source edits plus its CONFIG/DIFF/LEVELS overrides.
//   node tests/sim/unit-with-patch.js [--stats]
'use strict';
const fs = require('fs'), path = require('path');
const { PATCH } = require('./patch.js');
const real = fs.readFileSync;
fs.readFileSync = function (p, enc) {
  const out = real.apply(fs, arguments);
  if (typeof p === 'string' && path.basename(p) === 'world.js' && p.includes(path.join('game', 'js'))) {
    let code = String(out);
    for (const [file, from, to] of PATCH.src || []) if (file === 'world.js') {
      if (code.indexOf(from) < 0) throw new Error('patch miss: ' + from.slice(0, 60));
      code = code.replace(from, to);
    }
    code += '\n;(function (W) {\n' +
      '  Object.assign(W.CONFIG, ' + JSON.stringify(PATCH.CONFIG || {}) + ');\n' +
      '  var D = ' + JSON.stringify(PATCH.DIFF || {}) + '; for (var k in D) Object.assign(W.DIFF[k], D[k]);\n' +
      '  var L = ' + JSON.stringify(PATCH.LEVELS || []) + '; L.forEach(function (o, i) { if (o) Object.assign(W.LEVELS[i], o); });\n' +
      '})(window.FIF.World);\n';
    return enc ? code : Buffer.from(code);
  }
  return out;
};
process.chdir(path.join(__dirname, '..', '..'));
require('../unit/run.js');
