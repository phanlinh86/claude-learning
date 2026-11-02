#!/usr/bin/env node
// High-speed playtest v2 (report-only): child models × ages × viewports × langs on all cores, with phase ledger,
// reward crowding, card sizes, dead taps; optional CONFIG overrides and SIM-ONLY code patches (proposals) for
// before/after evidence. Writes tests/sim/out/pt_<name>.{json,md}.
//   node tests/sim/pt_kids.js --name kids_base
//   node tests/sim/pt_kids.js --name kids_prop --config '{"peekByAge":{"4":2.8}}' --patch sameTapHint,flipGap --n4 6 --n 2
// Patches (proposed game changes, applied to DM.World.prototype inside the sim only — game/ is never edited):
//   sameTapHint  3 taps on the one open card → hint its partner; those taps do not reset the idle timer
//   flipGap      a face-down card cannot be turned within 0.30 s of the previous flip (taps during the first turn are ignored)
//   misMin       the third-tap reset needs both mismatched faces shown ≥ 0.5 s (spam can no longer skip seeing them)
//   peekPerCard  peek = peekByAge[age] · (0.6 + 0.1 · cards) → shorter for 4 cards, longer for 8+
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

const DRIVERS = ['typical', 'weak4', 'impatient4', 'toddler', 'slow3', 'repeat4', 'tapper', 'spam4', 'spam4c', 'bot0.6'];
const VPS = ['iphoneP', 'iphoneL', 'wide', 'ipadL', 'ipadP'];

function applyPatches(DM, list) {
  const P = DM.World.prototype;
  if (list.includes('sameTapHint')) {
    const orig = P.pointerDown;
    P.pointerDown = function (x, y) {
      const listening = this.state === 'round' && !this.solved && (this.phase === 'play' || this.phase === 'resolve');
      const c = listening ? this._hit(x, y) : null;
      const same = c && c.state === 'up' && this.open.length === 1 && this.open[0] === c.id;
      const it = this._idleT, ig = this._idleGap;
      const r = orig.call(this, x, y);
      if (same) {
        this._idleT = it; this._idleGap = ig;                 // poking the same card is not "playing"
        this._same = (this._sameId === c.id ? this._same || 0 : 0) + 1; this._sameId = c.id;
        if (this._same >= 3) { this._same = 0; this._autoHint(); }
      } else if (c) { this._same = 0; this._sameId = null; }
      return r;
    };
  }
  if (list.includes('flipGap')) {
    const orig = P.pointerDown;
    P.pointerDown = function (x, y) {
      const listening = this.state === 'round' && !this.solved && (this.phase === 'play' || this.phase === 'resolve');
      const c = listening ? this._hit(x, y) : null;
      if (c && c.state === 'down' && this.time - (this._lastFlipT || -9) < 0.30) return null;
      const n0 = this.events.length, r = orig.call(this, x, y);
      for (let i = n0; i < this.events.length; i++) if (this.events[i].type === 'flip') this._lastFlipT = this.time;
      return r;
    };
  }
  if (list.includes('misMin')) {   // the 3rd-tap reset only once both mismatched faces were shown ≥ 0.5 s
    const orig = P.pointerDown;
    P.pointerDown = function (x, y) {
      const listening = this.state === 'round' && !this.solved && (this.phase === 'play' || this.phase === 'resolve');
      const c = listening ? this._hit(x, y) : null;
      if (c && c.state === 'down' && this.open.length === 2 && (!this._mis || this._mis.t < 0.5)) return null;
      return orig.call(this, x, y);
    };
  }
  if (list.includes('peekPerCard')) {
    const orig = P._beginRound;
    P._beginRound = function () { orig.call(this); const base = (this.cfg.peekByAge || {})[this.age] || 2.2; this.cur.peek = base * (0.6 + 0.1 * this.cards.length); };
  }
}

function compact(m) {
  return { age: m.age, lang: m.lang, vp: m.vp, driver: m.driver, seed: m.seed, done: m.done, sessionTime: m.sessionTime, stars: m.stars,
    ledger: m.ledger, chapters: m.chapters.map(c => ({ topic: c.topic, dur: c.end !== null ? c.end - c.start : null, rounds: c.rounds, stars: c.stars })),
    rounds: m.rounds.map(r => ({ topic: r.topic, pairs: r.pairs, dur: r.end !== null ? r.end - r.start : null, play: r.end !== null && r.playAt !== null ? r.end - r.playAt : null, mm: r.mm, hints: r.hints, idles: r.idles, stars: r.stars })),
    hints: m.hints, idleHints: m.idleHints, idles: m.idles, mismatches: m.mismatches, matches: m.matches, taps: m.taps, deadTaps: m.deadTaps,
    crowd: m.crowd, cards: m.cards, errors: m.errors.slice(0, 1), maxNoHelp: m.maxNoHelp, firstHintAt: m.firstHintAt, simTime: m.simTime };
}

if (!isMainThread) {
  const PT = require('./pt_lib');
  applyPatches(PT.DM, workerData.patches || []);
  parentPort.on('message', (j) => {
    if (j === null) { parentPort.postMessage('bye'); parentPort.close(); return; }
    parentPort.postMessage(compact(PT.run(j)));
  });
} else if (require.main === module) {
  const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
  const name = 'pt_' + get('name', 'kids_base'), config = JSON.parse(get('config', '{}')), patches = get('patch', '').split(',').filter(Boolean);
  const drivers = get('drivers', DRIVERS.join(',')).split(','), ages = get('ages', '3,4,5,6,7').split(',').map(Number);
  const vps = get('vps', VPS.join(',')).split(','), n4 = +get('n4', 10), n = +get('n', 4);
  const jobs = []; let seed = +get('seed0', 20000);
  for (const driver of drivers) for (const age of ages) for (const lang of ['en', 'vi']) for (const vp of vps)
    for (let k = 0; k < (age === 4 ? n4 : n); k++) jobs.push({ age, lang, vp, driver, seed: seed++, config });
  const t0 = Date.now(), res = []; let next = 0, left = Math.min(os.cpus().length, jobs.length);
  for (let k = 0, nw = left; k < nw; k++) {
    const wk = new Worker(__filename, { workerData: { patches } });
    const feed = () => wk.postMessage(next < jobs.length ? jobs[next++] : null);
    wk.on('message', (r) => {
      if (r === 'bye') { if (--left === 0) finish(); return; }
      res.push(r); if (res.length % 500 === 0) console.error(res.length + '/' + jobs.length); feed();
    });
    wk.on('error', (e) => { console.error(e); process.exit(2); });
    feed();
  }
  function finish() {
    const out = path.join(__dirname, 'out'); fs.mkdirSync(out, { recursive: true });
    res.sort((a, b) => a.seed - b.seed);
    fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify({ name, config, patches, sessions: res }));
    const md = require('./pt_summary').report({ name, config, patches, sessions: res }) + `\n_${res.length} sessions, ${((Date.now() - t0) / 1000).toFixed(0)} s wall_\n`;
    fs.writeFileSync(path.join(out, name + '.md'), md);
    console.log(md);
  }
}
module.exports = { applyPatches, DRIVERS, VPS };
