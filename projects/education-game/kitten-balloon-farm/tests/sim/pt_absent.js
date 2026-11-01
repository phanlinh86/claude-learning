#!/usr/bin/env node
// Absent child (report-only): nobody touches the screen for 10 minutes — once in a round, once in Talk time.
// Counts world events and what main.js would actually SPEAK (pt_kids SpeechModel = main.js onEvent throttles).
//   node tests/sim/pt_absent.js [--config '{...}'] [--speech '{"idleSayMax":2}']  → tests/sim/out/pt_absent.md
'use strict';
const fs = require('fs'), path = require('path');
const P = require('./pt_kids');
const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const config = JSON.parse(get('config', '{}')), speech = JSON.parse(get('speech', '{}')), name = get('name', 'absent');

function absent(age, where) {
  const w = new P.KB.World({ seed: 9 + age, age, lang: 'en', config: Object.assign({ strings: false }, config) });
  w.setViewport(720, 1556, { top: 108, right: 0, bottom: 62, left: 0 });
  const sp = new P.SpeechModel(speech), log = [];
  const pump = () => { for (const e of w.drainEvents()) { const before = sp.n.said; sp.onEvent(e, w.time, w); if (['idle', 'talkAsk', 'round', 'talk', 'level', 'hint'].includes(e.type)) log.push({ t: w.time, type: e.type, n: e.n, spoken: sp.n.said > before }); } sp.tick(w.time); };
  w.newSession(); pump();
  if (where === 'talk') { while (w.state !== 'round' || !w.interactive) { w.update(1 / 30); pump(); } w._startTalk(); pump(); }
  const t0 = w.time;
  while (w.time - t0 < 600) { w.update(1 / 30); pump(); }
  const ev = log.filter(e => e.type === (where === 'talk' ? 'talkAsk' : 'idle'));
  const spoken = ev.filter(e => e.spoken);
  return { age, where, events: ev.length, spoken: spoken.length, spokenAt: spoken.map(e => (e.t - t0).toFixed(0)), lastSpoken: spoken.length ? (spoken[spoken.length - 1].t - t0) : 0,
    firstAt: ev.length ? (ev[0].t - t0).toFixed(0) : '–', speechTime: sp.speechTime, state: w.state, glow: w.talk && w.talk.glowAnswer, hints: log.filter(e => e.type === 'hint').length,
    glowingNow: w.balloons.some(b => b.glowT > 0) };
}
const rows = [];
for (const age of [3, 4, 5]) { rows.push(absent(age, 'round')); rows.push(absent(age, 'talk')); }
let md = `## pt_${name}: absent child, 10 minutes without a touch (iPhone portrait)\n\nconfig \`${JSON.stringify(config)}\` speech \`${JSON.stringify(speech)}\`\n\n| age | where | world events (idle / talkAsk) | main.js speaks | spoken at (s) | Miu talking total | after 10 min |\n|---|---|---|---|---|---|---|\n`;
for (const r of rows) md += `| ${r.age} | ${r.where} | ${r.events} (first at ${r.firstAt} s) | ${r.spoken} | ${r.spokenAt.join(', ')} | ${r.speechTime.toFixed(0)} s | state ${r.state}${r.where === 'talk' ? ', answer glows ' + r.glow : ''}, auto hints ${r.hints} |\n`;
md += '\nThe round never ends and nothing pauses: balloons keep bobbing, music keeps playing (main.js has no idle pause); after the last spoken line the game is silent for the rest of the 10 minutes.\n';
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'out', 'pt_' + name + '.md'), md);
console.log(md);
