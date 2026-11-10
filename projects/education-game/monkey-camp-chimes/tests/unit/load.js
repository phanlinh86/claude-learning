// Kiki's Camp Chimes — loads the classic browser scripts into a node `vm` sandbox with a fake `window` (no document: headless).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS = path.join(__dirname, '..', '..', 'game', 'js');
const DEFAULT = ['rng.js', 'content.js', 'world.js', 'weather.js', 'bot.js'];

/** Path of a game script (absolute paths pass through). */
function resolve(f) { return path.isAbsolute(f) ? f : path.join(JS, f); }

function load(files) {
  const sandbox = { console, Math, Date, JSON };
  sandbox.window = sandbox;            // window === global, like a browser
  vm.createContext(sandbox);
  for (const f of files || DEFAULT) {
    const p = resolve(f);
    vm.runInContext(fs.readFileSync(p, 'utf8'), sandbox, { filename: path.basename(p) });
  }
  return sandbox.CC;
}
module.exports = { load, DEFAULT, JS, resolve };
