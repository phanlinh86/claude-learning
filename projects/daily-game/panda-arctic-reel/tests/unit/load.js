// Bao's Arctic Reel — loads the classic browser scripts into a node vm sandbox with a fake `window`.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS = path.join(__dirname, '..', '..', 'game', 'js');

function load(files) {
  const sandbox = { console };        // the context has its own Math/JSON/Date (passing host ones is ~10× slower)
  sandbox.window = sandbox;            // window === global, like a browser
  vm.createContext(sandbox);
  for (const f of files || ['rng.js', 'world.js', 'weather.js', 'bot.js']) {
    const src = fs.readFileSync(path.join(JS, f), 'utf8');
    vm.runInContext(src, sandbox, { filename: f });
  }
  return sandbox.PR;
}
module.exports = { load };
