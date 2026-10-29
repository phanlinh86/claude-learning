// Family Flappy — motion-smoothness (judder) simulator. Runs the REAL world.js/bot.js in node with the
// exact frame→step logic of main.js, fed with rAF timestamps of different monitors (60/75/120/144/165 Hz),
// Chrome's 0.1 ms timestamp coarsening and realistic vsync jitter. Measures how evenly the ground scrolls
// per displayed frame (what the eye sees) — FPS can be perfect while motion still judders.
//   node tests/perf/judder.js [gameDir] [--json out.json]
// Modes:
//   base   : what main.js + world.js do today (fixed 1/120 s steps, render latest state)
//   interp : same simulation, rendered position = lerp(prev step, current step, acc/h)   (fix P2)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const args = process.argv.slice(2);
const pos = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--json');
const GAME = path.resolve(pos[0] || path.join(__dirname, '..', '..', 'game'));
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;

function loadFF() {
  const sb = { console, Math, Date, JSON }; sb.window = sb; vm.createContext(sb);
  for (const f of ['rng.js', 'world.js', 'weather.js', 'bot.js']) vm.runInContext(fs.readFileSync(path.join(GAME, 'js', f), 'utf8'), sb, { filename: f });
  return sb.FF;
}
const FF = loadFF();

function gauss(rng) { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function run(hz, jitterMs, mode, seed, seconds) {
  const rng = mulberry(seed);
  const w = new FF.World({ seed: 42 }); w.reset();
  const bot = new FF.Bot(w, { skill: 1, seed: 11 });
  w.flap();
  const period = 1000 / hz;
  let t0 = 1000 + rng() * 50, last = Math.round(t0 * 10) / 10;
  const H = w.cfg.step;
  let prevRendered = null, prevTs = last;
  const ratios = [], stepsPerFrame = [], dpx = [];
  const frames = Math.round(seconds * hz);
  for (let k = 1; k <= frames; k++) {
    // vsync time + jitter, coarsened to 0.1 ms like Chrome's rAF timestamp
    const ts = Math.round((t0 + k * period + gauss(rng) * jitterMs) * 10) / 10;
    const real = Math.min(0.1, Math.max(0, (ts - last) / 1000)); last = ts;
    // --- main.js frame(): split into <=1/60 s calls of step(h); world.update accumulates 1/120 s steps
    const n = Math.max(1, Math.ceil(real / (1 / 60))), h = real / n;
    let steps = 0;
    for (let i = 0; i < n; i++) {
      if (w.state !== 'dead') bot.step(h);
      const before = w.time;
      // capture "previous step" scroll for interpolation (what the fix stores in World._step)
      w.update(h); steps += Math.round((w.time - before) / H);
    }
    if (w.state === 'dead') { w.reset(); bot.reset && bot.reset(); w.flap(); prevRendered = null; continue; }
    const alpha = w._acc / H;
    // interp: use the world's stored previous-step scroll when it has one (fixed world.js), otherwise
    // reconstruct it as scroll − speed·H (speed changes negligibly within one 8 ms step)
    const prevStep = w._pScroll != null ? w._pScroll : w.scroll - w.scrollSpeed * H;
    const rendered = mode === 'interp' ? prevStep + (w.scroll - prevStep) * alpha : w.scroll;
    if (prevRendered != null && w.state === 'playing') {
      const expect = w.scrollSpeed * (ts - prevTs) / 1000;
      const d = rendered - prevRendered;
      if (expect > 0.5) { ratios.push(d / expect); dpx.push(d - expect); }
      stepsPerFrame.push(steps);
    }
    prevRendered = rendered; prevTs = ts;
  }
  const n = ratios.length;
  const mean = ratios.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(ratios.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  const bad = ratios.filter(r => Math.abs(r - 1) > 0.25).length / n;
  const errPx = Math.sqrt(dpx.reduce((a, b) => a + b * b, 0) / n);
  const hist = {}; stepsPerFrame.forEach(s => { hist[s] = (hist[s] || 0) + 1; });
  return { hz, jitterMs, mode, frames: n, speedRatioSD: +sd.toFixed(3), unevenFrames: +(bad * 100).toFixed(1),
    rmsErrPx: +errPx.toFixed(2), maxRatio: +Math.max(...ratios).toFixed(2), minRatio: +Math.min(...ratios).toFixed(2), stepsHist: hist };
}

const rows = [];
for (const hz of [60, 75, 120, 144, 165])
  for (const jit of [0, 0.25])
    for (const mode of ['base', 'interp']) {
      // average over 4 random start phases (the accumulator phase decides whether 60 Hz judders)
      const rs = [1, 2, 3, 4].map(s => run(hz, jit, mode, s * 7919 + hz, 20));
      const avg = k => +(rs.reduce((a, r) => a + r[k], 0) / rs.length).toFixed(2);
      rows.push({ hz, jitterMs: jit, mode, unevenFramesPct: avg('unevenFrames'), speedRatioSD: avg('speedRatioSD'), rmsErrPx: avg('rmsErrPx'),
        worstPhaseUnevenPct: Math.max(...rs.map(r => r.unevenFrames)), minRatio: Math.min(...rs.map(r => r.minRatio)), maxRatio: Math.max(...rs.map(r => r.maxRatio)), stepsHist: rs[0].stepsHist });
    }
console.log('hz  jitter mode    uneven%  worstPhase%  ratioSD  rmsErr(px)  min..max ratio   steps/frame (phase 1)');
for (const r of rows) console.log(`${String(r.hz).padEnd(4)}${String(r.jitterMs).padEnd(7)}${r.mode.padEnd(8)}${String(r.unevenFramesPct).padStart(7)}  ${String(r.worstPhaseUnevenPct).padStart(10)}  ${String(r.speedRatioSD).padStart(7)}  ${String(r.rmsErrPx).padStart(9)}   ${r.minRatio}..${r.maxRatio}   ${JSON.stringify(r.stepsHist)}`);
if (jsonOut) { fs.mkdirSync(path.dirname(jsonOut), { recursive: true }); fs.writeFileSync(jsonOut, JSON.stringify(rows, null, 1)); }
module.exports = { run };
