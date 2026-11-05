// Bop's Rainy Band — loads the classic browser scripts into a node `vm` sandbox with a fake `window`
// (no document: headless).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS = path.join(__dirname, '..', '..', 'game', 'js');
const DEFAULT = ['rng.js', 'content.js', 'world.js', 'weather.js', 'bot.js'];

function load(files) {
  const sandbox = { console, Math, Date, JSON };
  sandbox.window = sandbox;            // window === global, like a browser
  vm.createContext(sandbox);
  for (const f of files || DEFAULT) {
    const src = fs.readFileSync(path.join(JS, f), 'utf8');
    vm.runInContext(src, sandbox, { filename: f });
  }
  return sandbox.RB;
}
module.exports = { load, DEFAULT, JS };
