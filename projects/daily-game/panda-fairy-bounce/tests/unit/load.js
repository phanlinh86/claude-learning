// Mochi's Fairy Bounce — loads the classic browser scripts into a node vm sandbox with a fake `window`.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS = path.join(__dirname, '..', '..', 'game', 'js');

function load(files) {
  const sandbox = { console };        // the context has its own Math/JSON (passing host ones is slower)
  sandbox.window = sandbox;            // window === global, like a browser
  vm.createContext(sandbox);
  for (const f of files || ['rng.js', 'world.js', 'weather.js', 'bot.js']) {
    const p = path.join(JS, f);
    if (!fs.existsSync(p)) continue;
    vm.runInContext(fs.readFileSync(p, 'utf8'), sandbox, { filename: f });
  }
  return sandbox.MFB;
}
module.exports = { load, JS };
