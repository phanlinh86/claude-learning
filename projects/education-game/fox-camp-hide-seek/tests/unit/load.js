// Pip's Camp Hide & Seek — loads the classic browser scripts into a node `vm` sandbox with a fake `window`
// (no document: headless). When the artist's game/assets/default/spots/spots.json exists, its peekY values are applied
// to FC.CONFIG.peekY (FC.World.applySpots), exactly as main.js does in the browser.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS = path.join(__dirname, '..', '..', 'game', 'js');
const SPOTS = path.join(__dirname, '..', '..', 'game', 'assets', 'default', 'spots', 'spots.json');
const DEFAULT = ['rng.js', 'content.js', 'world.js', 'weather.js', 'bot.js'];

function spotsJson() {
  try { return JSON.parse(fs.readFileSync(SPOTS, 'utf8')); } catch (e) { return null; }
}
function load(files) {
  const sandbox = { console, Math, Date, JSON };
  sandbox.window = sandbox;            // window === global, like a browser
  vm.createContext(sandbox);
  for (const f of files || DEFAULT) {
    const src = fs.readFileSync(path.join(JS, f), 'utf8');
    vm.runInContext(src, sandbox, { filename: f });
  }
  const FC = sandbox.FC;
  if (FC.World && FC.World.applySpots) FC.World.applySpots(spotsJson());
  return FC;
}
module.exports = { load, DEFAULT, spotsJson, SPOTS };
