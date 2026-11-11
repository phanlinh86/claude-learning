#!/usr/bin/env node
// Absent child (report-only): nobody touches the screen for 10 minutes. Replays the World and mirrors main.js onEvent's
// speech / pause policy (idle: speak nudges 1–4, pause() at the 5th; talkAsk: speak re-asks 1–3, pause() at the 4th;
// a paused game stops calling world.update). Two cases: the child leaves at the start of play, and during Talk time.
//   node tests/sim/pt_absent.js  → tests/sim/out/pt_absent.md
'use strict';
const fs = require('fs');
const path = require('path');
const { IM } = require('./lib');

function timeline(where, age) {
  const w = new IM.World({ seed: 11, age, lang: 'en' }); w.setViewport(720, 1556, { top: 108, right: 0, bottom: 62, left: 0 });
  w.newSession(); w.drainEvents();
  if (where === 'talk') {   // the child played round 1–3 with a perfect bot, then left as Talk time began
    const bot = new IM.Bot(w, { skill: 1, seed: 5 });
    while (w.state !== 'talk') { bot.step(1 / 30); w.update(1 / 30); w.drainEvents(); }
  } else {
    while (!(w.state === 'round' && w.phase === 'play')) { w.update(1 / 30); w.drainEvents(); }
  }
  const t0 = w.time, log = []; let idleSaid = 0, paused = null, spoken = 0, t = 0;
  while (t < 600) {
    t += 1 / 30;
    if (paused !== null) continue;      // the pause screen is up; the world is frozen
    w.update(1 / 30);
    for (const e of w.drainEvents()) {
      const at = (w.time - t0).toFixed(0) + ' s';
      if (e.type === 'idle') {
        if (++idleSaid <= 4) { spoken++; log.push(`${at} idle #${e.n}: Dee says "Tap a card…" + the prompt${e.n >= 2 ? ' (a pair glows)' : ''}`); }
        else { paused = w.time - t0; log.push(`${at} idle #${e.n}: pause() — music stops, pause menu`); }
      } else if (e.type === 'hint' && e.idle) { /* glow, not spoken */ }
      else if (e.type === 'talkAsk') {
        if (e.n <= 3) { spoken++; log.push(`${at} talkAsk #${e.n}: question re-asked${e.n >= 2 ? ', answer glows' : ''}`); }
        if (e.n >= 4) { paused = w.time - t0; log.push(`${at} talkAsk #${e.n}: pause()`); }
      } else if (['round', 'peek', 'hide', 'play', 'level', 'talk'].includes(e.type)) log.push(`${at} ${e.type}`);
    }
  }
  return { where, age, log, spoken, paused };
}

let md = '## Absent child — nobody taps for 10 minutes (main.js policy mirrored)\n\n';
for (const [where, age] of [['play', 4], ['play', 3], ['talk', 4]]) {
  const r = timeline(where, age);
  md += `### Leaves at ${where === 'play' ? 'the start of play' : 'Talk time'} (age ${age})\n\n` + r.log.map(x => '- ' + x).join('\n') +
    `\n\n**${r.spoken} spoken lines, then paused at ${r.paused !== null ? r.paused.toFixed(0) + ' s' : 'never'}; silent for the remaining ${r.paused !== null ? (600 - r.paused).toFixed(0) : 0} s.**\n\n`;
}
fs.writeFileSync(path.join(__dirname, 'out', 'pt_absent.md'), md);
console.log(md);
