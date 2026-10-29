// Loads the classic browser scripts into a vm sandbox with a fake `window`.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS = path.join(__dirname, '..', '..', 'game', 'js');

function load(files) {
  const sandbox = { console, Math, Date, JSON };
  sandbox.window = sandbox;            // window === global, like a browser
  vm.createContext(sandbox);
  for (const f of files || ['rng.js', 'world.js', 'weather.js', 'bot.js']) {
    const src = fs.readFileSync(path.join(JS, f), 'utf8');
    vm.runInContext(src, sandbox, { filename: f });
  }
  return sandbox.FF;
}
module.exports = { load };
