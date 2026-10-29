// Tuning variants compared by `node tests/sim/run.js tuning`.
'use strict';
const variants = {
  current: {}
};
// peek used for each variant/difficulty (current: the shipped Settings default is 1 s for every difficulty)
function peekFor(name, d) { return 1; }
module.exports = { variants, peekFor };
