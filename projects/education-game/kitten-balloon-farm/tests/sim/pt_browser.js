#!/usr/bin/env node
// Real-browser high-speed playtest (report-only).
//   node tests/sim/pt_browser.js            → A: ?speed=8&bot=1&autostart=1&autorestart=1&mute=1 sessions per age × device
//                                              B: one session played by REAL touch taps (page.touchscreen.tap) at speed 2
// Writes tests/sim/out/pt_browser.md and screenshots to tests/sim/out/pt_shots/.
'use strict';
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const serve = require('../e2e/serve');
const OUT = path.join(__dirname, 'out'), SHOTS = path.join(OUT, 'pt_shots');
fs.mkdirSync(SHOTS, { recursive: true });
const DEVICES = [
  { name: 'iphoneP', viewport: { width: 393, height: 852 }, dpr: 3 },
  { name: 'iphoneL', viewport: { width: 852, height: 393 }, dpr: 3 },
  { name: 'ipadL', viewport: { width: 1180, height: 820 }, dpr: 2 }
];
const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const PER = +get('sessions', 2), AGES = get('ages', '3,4,5').split(',').map(Number), ONLY = get('only', 'AB');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function newPage(browser, d) {
  const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(), errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  return { ctx, page, errors };
}

async function partA(browser, srv) {
  const rows = [];
  for (const d of DEVICES) for (const age of AGES) {
    const { ctx, page, errors } = await newPage(browser, d);
    await page.goto(srv.url + `?speed=8&bot=1&autostart=1&autorestart=1&mute=1&age=${age}&seed=${age * 31 + 7}`);
    await page.waitForFunction(() => window.KB && KB.debug && KB.debug.mode === 'play', null, { timeout: 20000 });
    // page-side fps meter (rAF intervals)
    await page.evaluate(() => { const r = window.__pt = { n: 0, slow: 0, worst: 0, t0: performance.now(), last: 0, sessions: [] }; let s0 = performance.now(), prev = KB.debug.stats.sessions;
      (function f(ts) { if (r.last) { const d = ts - r.last; r.n++; if (d > 22) r.slow++; if (d > r.worst) r.worst = d; } r.last = ts;
        if (KB.debug.stats.sessions !== prev) { r.sessions.push(performance.now() - s0); s0 = performance.now(); prev = KB.debug.stats.sessions; } requestAnimationFrame(f); })(); });
    const t0 = Date.now();
    let shot = false;
    while (Date.now() - t0 < 150000) {
      const st = await page.evaluate(() => ({ s: KB.debug.stats.sessions, mode: KB.debug.mode, w: KB.debug.world.state }));
      if (!shot && st.w === 'round' && Date.now() - t0 > 4000) { await page.screenshot({ path: path.join(SHOTS, `A-${d.name}-age${age}.png`) }); shot = true; }
      if (st.s > PER) break;                      // stats.sessions counts started sessions: > PER means PER finished
      await sleep(1000);
    }
    const res = await page.evaluate(() => ({ stats: Object.assign({}, KB.debug.stats), pt: window.__pt, q: KB.render && KB.render.quality, st: KB.debug.getState() }));
    const fps = res.pt.n / ((performance.now ? 0 : 0) + (res.pt.last - res.pt.t0) / 1000);
    rows.push({ dev: d.name, age, done: res.stats.sessions - 1, wall: (Date.now() - t0) / 1000, fps, slowPct: res.pt.slow / Math.max(1, res.pt.n), worst: res.pt.worst,
      gameSlow: res.stats.slowFrames, frames: res.stats.frames, quality: res.q, correct: res.stats.correct, wrong: res.stats.wrong, rounds: res.stats.rounds,
      sessWall: res.pt.sessions.map(x => (x / 1000).toFixed(1)), errors: errors.slice(0, 3) });
    console.log(JSON.stringify(rows[rows.length - 1]));
    await ctx.close();
  }
  return rows;
}

/* B: a person (me) plays one session with real touch: listens ≈ 1.2 s (game time) then taps the right balloon's centre;
 * on purpose: one wrong tap, one tap on the string (0.7 × size below the centre), one tap on a still-rising balloon. */
async function partB(browser, srv, d, age) {
  const { ctx, page, errors } = await newPage(browser, d);
  const SPEED = 2;
  await page.goto(srv.url + `?mute=1&age=${age}&seed=21&speed=${SPEED}`);
  await page.waitForFunction(() => window.KB && KB.debug && KB.debug.mode === 'title', null, { timeout: 20000 });
  await page.screenshot({ path: path.join(SHOTS, `B-${d.name}-0-title.png`) });
  const play = await page.evaluate(() => { const r = document.getElementById('btnPlay').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.touchscreen.tap(play.x, play.y);
  const log = [], shots = {}; let lastKey = '', did = { wrong: false, string: false, rise: false }, t0 = Date.now();
  const snap = async (k) => { if (!shots[k]) { shots[k] = true; await page.screenshot({ path: path.join(SHOTS, `B-${d.name}-${k}.png`) }); } };
  while (Date.now() - t0 < 240000) {
    const s = await page.evaluate(() => {
      const w = KB.debug.world, m = KB.debug.mode;
      const bs = (w.balloons || []).map(b => ({ id: b.id, st: b.state, ok: w.cur && (w.cur.mode === 'count' || (w.cur.mode === 'ask' ? b.id === w.target : b.answer)), tap: w.canTap(b), size: b.size, ru: b.riseU }));
      return { m, ws: w.state, lvl: w.level, rnd: w.round, mode: w.cur && w.cur.mode, topic: w.topic, tgt: w.target, solved: w.solved, bs, stats: Object.assign({}, KB.debug.stats), talk: w.talk && { ans: w.talk.answerId, answered: !!w.talkAnswered }, friends: (w.friends || []).length, s: KB.debug.view().s };
    });
    if (s.m === 'done') { await sleep(800); await snap('9-done'); break; }
    if (s.ws === 'talk' && s.talk && !s.talk.answered) {
      await sleep(1500); await snap('5-talk-' + s.lvl);
      const r = await page.evaluate((id) => { const el = [...document.getElementById("talkChoices").children].find(e => e.dataset.id === String(id)); if (!el) return null; const q = el.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; }, s.talk.ans);
      if (r) { await page.touchscreen.tap(r.x, r.y); log.push(`talk L${s.lvl}: tapped answer`); } else { log.push(`talk L${s.lvl}: answer button not found, skipTalk`); await page.evaluate(() => KB.debug.world.talkAnswer(KB.debug.world.talk.answerId)); }
      await sleep(600); continue;
    }
    if (s.ws !== 'round' || s.solved) { if (s.ws === 'roundDone') await snap(`4-roundDone-${s.topic}`); await sleep(150); continue; }
    const key = s.lvl + ':' + s.rnd + ':' + (s.tgt || '');
    // a tap while the first balloons are still rising (once)
    if (!did.rise && s.lvl === 0 && s.rnd === 1 && s.bs.some(b => b.st === 'rise')) {
      const b = s.bs.find(b => b.st === 'rise' && b.ok && b.ru > 0.05 && b.ru < 0.5);
      if (b) { const p = await page.evaluate(id => KB.debug.balloonScreen(id), b.id); const c0 = s.stats.correct; await page.touchscreen.tap(p.x, p.y); await sleep(60);
        const c1 = await page.evaluate(() => KB.debug.stats.correct); log.push(`tap on rising balloon (riseU ${b.ru.toFixed(2)}): ${c1 > c0 ? 'popped' : 'IGNORED (no feedback)'}`); did.rise = true; await snap('1b-rise-tap'); continue; }
    }
    if (key !== lastKey) { lastKey = key; await sleep(1200 / SPEED * 1.0 + 900); await snap(`1-round-${s.topic}`); continue; }
    const live = s.bs.filter(b => b.tap);
    if (!live.length) { await sleep(100); continue; }
    let b = live.find(b => b.ok), how = 'centre';
    if (!did.wrong && s.lvl === 0 && s.rnd === 2 && live.some(x => !x.ok)) { b = live.find(x => !x.ok); how = 'wrong'; did.wrong = true; }
    else if (!did.string && s.lvl === 1 && s.rnd === 1) { how = 'string'; did.string = true; }
    if (!b) { await sleep(100); continue; }
    const p = await page.evaluate(id => KB.debug.balloonScreen(id), b.id);
    if (!p) continue;
    const yOff = how === 'string' ? 0.7 * b.size * s.s : 0;
    const before = s.stats;
    await page.touchscreen.tap(p.x, p.y + yOff);
    await sleep(80);
    const after = await page.evaluate(() => Object.assign({}, KB.debug.stats));
    if (how !== 'centre') { log.push(`${how} tap L${s.lvl} R${s.rnd} (${s.topic}): correct ${after.correct - before.correct}, wrong ${after.wrong - before.wrong}`); await sleep(150); await snap(`3-${how}`); }
    if (s.mode === 'ask' && s.friends >= 1) await snap('2-friends');
    if (s.mode === 'count' && after.correct > before.correct) await snap('2-count');
    await sleep(1100 / SPEED + 500);
  }
  const fin = await page.evaluate(() => ({ stats: KB.debug.stats, st: KB.debug.getState(), voice: (KB.debug.voiceLog || []).slice(-5) }));
  await ctx.close();
  return { dev: d.name, age, wall: (Date.now() - t0) / 1000, log, stats: fin.stats, state: fin.st.mode, errors };
}

(async () => {
  const srv = await serve();
  const browser = await chromium.launch();
  let md = '## pt_browser: real Chromium (Playwright), mobile emulation with touch\n\n';
  if (ONLY.includes('A')) {
    const A = await partA(browser, srv);
    md += `### A. ?speed=8&bot=1&autostart=1&autorestart=1&mute=1 (bot skill 0.8), ${PER} sessions per device × age\n\n| device | age | sessions finished | wall s | s per session (wall) | rAF fps | frames > 22 ms | worst frame ms | game slowFrames / frames | render quality | rounds | correct / wrong | console errors |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|\n`;
    for (const r of A) md += `| ${r.dev} | ${r.age} | ${r.done} | ${r.wall.toFixed(0)} | ${r.sessWall.join(', ')} | ${r.fps.toFixed(0)} | ${(100 * r.slowPct).toFixed(1)}% | ${r.worst.toFixed(0)} | ${r.gameSlow} / ${r.frames} | ${r.quality} | ${r.rounds} | ${r.correct} / ${r.wrong} | ${r.errors.length ? r.errors.join(' / ') : 0} |\n`;
  }
  if (ONLY.includes('B')) {
    const Bs = [await partB(browser, srv, DEVICES[0], 4), await partB(browser, srv, DEVICES[1], 3)];
    md += '\n### B. Played by real touch taps at speed 2 (page.touchscreen.tap on KB.debug.balloonScreen)\n\n';
    for (const B of Bs) md += `- **${B.dev}, age ${B.age}**: ended in mode \`${B.state}\` after ${B.wall.toFixed(0)} s wall; stats ${JSON.stringify(B.stats)}; console errors ${B.errors.length}${B.errors.length ? ' (' + B.errors.slice(0, 2).join(' / ') + ')' : ''}\n` + B.log.map(l => '  - ' + l).join('\n') + '\n';
  }
  fs.writeFileSync(path.join(OUT, 'pt_browser.md'), md);
  console.log(md);
  await browser.close(); srv.close();
})();
