// Sim ≈ game check: play the real page in Chromium at ?speed=8&bot=1, sample the world every few game-seconds,
// then replay the same seed / difficulty / layout / bot in the headless sim and compare.
//   node tests/sim/browser.js        (needs playwright; writes tests/sim/results/browser.md)
'use strict';
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const L = require('./lib');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.join(__dirname, 'results');
const SHOTS = path.join(__dirname, '..', 'out');   // gitignored

async function browserRun(b, q, vp, until) {
  const p = await b.newPage({ viewport: vp });
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(GAME + '?mute=1&autostart=1&bot=1&speed=8&' + q);
  await p.waitForFunction(() => window.OF && OF.debug && OF.debug.mode === 'playing', null, { timeout: 20000 });
  const meta = await p.evaluate(() => { const w = OF.debug.world; return { seed: w.seed, diff: w.difficulty, W: w.layout.width, H: w.layout.height }; });
  const samples = []; const t0 = Date.now(); let fps = [];
  while (Date.now() - t0 < 200000) {
    const s = await p.evaluate(() => { const w = OF.debug.world; return { t: w.time, score: w.score, level: w.level, hearts: w.hearts, caught: w.stats.caught, flips: w.stats.flips, bumps: w.stats.bumps, falls: w.stats.falls, mode: OF.debug.mode, phase: w.phase }; });
    samples.push(s);
    if (s.t >= until || s.phase === 'over') break;
    await p.waitForTimeout(1000);
  }
  const wall = (Date.now() - t0) / 1000;
  await p.screenshot({ path: path.join(SHOTS, 'browser_' + meta.diff + '_' + meta.W + 'x' + meta.H + '.png') });
  await p.close();
  return { meta, samples, errs, wall };
}

function simRun(meta, skill, until, dt) {
  const OF = L.makeRF();
  const w = new OF.World({ seed: meta.seed, difficulty: meta.diff, width: meta.W, height: meta.H });
  const bot = new OF.Bot(w, { skill, seed: 11 });
  const out = []; let t = 0;
  while (w.time < until && w.phase === 'run') {
    bot.step(dt); w.update(dt); t += dt; w.drainEvents();
    out.push({ t: w.time, score: w.score, level: w.level, hearts: w.hearts, caught: w.stats.caught, flips: w.stats.flips, bumps: w.stats.bumps, falls: w.stats.falls });
  }
  return out;
}
const at = (arr, t) => arr.reduce((best, s) => (Math.abs(s.t - t) < Math.abs(best.t - t) ? s : best), arr[0]);

(async () => {
  fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(SHOTS, { recursive: true });
  const b = await chromium.launch();
  const runs = [
    ['seed=7&diff=normal', { width: 960, height: 540 }, 1, 400],
    ['seed=7&diff=easy', { width: 960, height: 540 }, 1, 300],
    ['seed=5&diff=hard&skill=0.5', { width: 960, height: 540 }, 0.5, 400],
    ['seed=3&diff=easy', { width: 390, height: 844 }, 1, 300]
  ];
  const md = ['# Browser (speed 8, bot) vs headless sim', ''];
  for (const [q, vp, skill, until] of runs) {
    const r = await browserRun(b, q, vp, until);
    const last = r.samples[r.samples.length - 1];
    const s60 = simRun(r.meta, skill, last.t + 0.01, 1 / 60), s30 = simRun(r.meta, skill, last.t + 0.01, 1 / 30);
    md.push('## ' + q + ' @ ' + r.meta.W + '×' + r.meta.H + ' (seed ' + r.meta.seed + ', bot skill ' + skill + '; ' + r.wall.toFixed(0) + ' s wall for ' + last.t.toFixed(0) + ' s game = ×' + (last.t / r.wall).toFixed(1) + ')', '',
      '| game s | browser score / level / hearts / caught / flips / bumps+falls | sim 1/60 | sim 1/30 |', '|---|---|---|---|');
    const marks = r.samples.filter((s, i) => i % Math.max(1, Math.floor(r.samples.length / 8)) === 0 || i === r.samples.length - 1);
    const fmt = s => [s.score, s.level, s.hearts, s.caught, s.flips, s.bumps + s.falls].join(' / ');
    for (const s of marks) md.push('| ' + s.t.toFixed(1) + ' | ' + fmt(s) + ' | ' + fmt(at(s60, s.t)) + ' | ' + fmt(at(s30, s.t)) + ' |');
    md.push('', 'console/page errors: ' + (r.errs.length ? r.errs.join('; ') : 'none'), '');
    console.error(q, 'done');
  }
  await b.close();
  fs.writeFileSync(path.join(OUT, 'browser.md'), md.join('\n') + '\n');
  console.log(md.join('\n'));
})();
