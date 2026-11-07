// Nini's Sea Painting — loads the classic browser scripts into a node `vm` sandbox with a fake `window` (no document:
// headless). pictures.js is the real game/js/pictures.js when it exists, else the test stub tests/unit/stub_pictures.js.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS = path.join(__dirname, '..', '..', 'game', 'js');
const STUB = path.join(__dirname, 'stub_pictures.js');
const DEFAULT = ['rng.js', 'pictures.js', 'content.js', 'world.js', 'weather.js', 'bot.js'];

/** Path of a game script; 'pictures.js' falls back to the stub (or is forced to it with SP_STUB_PICTURES=1). */
function resolve(f) {
  if (path.isAbsolute(f)) return f;
  const p = path.join(JS, f);
  if (f === 'pictures.js' && (process.env.SP_STUB_PICTURES === '1' || !fs.existsSync(p))) return STUB;
  return p;
}
function usingStub() { return resolve('pictures.js') === STUB; }

function load(files) {
  const sandbox = { console, Math, Date, JSON };
  sandbox.window = sandbox;            // window === global, like a browser
  vm.createContext(sandbox);
  for (const f of files || DEFAULT) {
    const p = resolve(f);
    vm.runInContext(fs.readFileSync(p, 'utf8'), sandbox, { filename: path.basename(p) });
  }
  return sandbox.SP;
}
module.exports = { load, DEFAULT, JS, resolve, usingStub };
