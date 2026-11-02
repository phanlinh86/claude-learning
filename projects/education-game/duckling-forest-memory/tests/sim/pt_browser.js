#!/usr/bin/env node
// Real-browser playtest (report-only). Part A: ?speed=8&bot=1&autostart=1&autorestart=1&mute=1 sessions per age on
// iPhone portrait / landscape and iPad (fps, slow frames, sessions completed, console errors). Part B: one session played
// "by hand" with page.touchscreen.tap on DM.debug.cardScreen(id) at speed 1.5 with a kid-like memory (remembers 60 % of
// the faces it sees), screenshots of the key moments → tests/sim/out/pt_browser/*.png, summary → tests/sim/out/pt_browser.md.
//   node tests/sim/pt_browser.js [A|B]   (default both)
'use strict';
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const OUT = path.join(__dirname, 'out', 'pt_browser'); fs.mkdirSync(OUT, { recursive: true });
const DEV = {
  iphoneP: { viewport: { width: 393, height: 852 }, dpr: 3 },
  iphoneL: { viewport: { width: 852, height: 393 }, dpr: 3 },
  ipadL: { viewport: { width: 1180, height: 820 }, dpr: 2 }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const want = process.argv[2] || 'AB';
let md = '## Real-browser playtest (Chromium headless, mobile contexts with touch)\n\n';

(async () => {
  const srv = await serve(), browser = await chromium.launch();
  if (want.includes('A')) {
    md += '### A. speed 8, bot (skill 0.8), autorestart, mute — per device × age (wall cap 70 s)\n\n| device | age | sessions done | rounds | fps | slow frames | errors |\n|---|---|---|---|---|---|---|\n';
    for (const dn of Object.keys(DEV)) for (const age of [3, 4, 5, 6, 7]) {
      const d = DEV[dn];
      const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true });
      const page = await ctx.newPage(), errors = [];
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', e => errors.push(String(e)));
      await page.goto(srv.url + `?speed=8&bot=1&autostart=1&autorestart=1&mute=1&age=${age}&seed=${age * 31}`);
      await page.waitForFunction(() => window.DM && DM.debug && DM.debug.mode === 'play', null, { timeout: 20000 });
      const t0 = Date.now(), f0 = await page.evaluate(() => DM.debug.stats.frames);
      let st;
      while (Date.now() - t0 < 70000) {
        await sleep(2000);
        st = await page.evaluate(() => Object.assign({}, DM.debug.stats));
        if (st.sessions >= 3) break;      // 2 finished + the 3rd started
      }
      const wall = (Date.now() - t0) / 1000, fps = (st.frames - f0) / wall;
      md += `| ${dn} | ${age} | ${st.sessions - 1} | ${st.rounds} | ${fps.toFixed(0)} | ${(100 * st.slowFrames / Math.max(1, st.frames)).toFixed(0)}% | ${errors.length}${errors.length ? ' ' + errors[0].slice(0, 80) : ''} |\n`;
      console.log(dn, age, st.sessions - 1, fps.toFixed(0), errors.length);
      if (age === 4) await page.screenshot({ path: path.join(OUT, `A_${dn}_age4.png`) });
      await ctx.close();
    }
  }
  if (want.includes('B')) {
    md += '\n### B. One session played with real touch taps (iPhone portrait, age 4, speed 1.5, kid memory 60 %)\n\n';
    const d = DEV.iphoneP;
    const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true });
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(srv.url + '?mute=1&age=4&seed=4242&lang=en');
    await page.waitForFunction(() => window.DM && DM.debug && DM.debug.mode === 'title', null, { timeout: 20000 });
    await page.screenshot({ path: path.join(OUT, 'B_00_title.png') });
    await page.evaluate(() => { DM.debug.setSpeed(1.5); DM.debug.startGame(); });
    const shots = new Set(), log = [];
    const snap = async (k) => { if (shots.has(k)) return; shots.add(k); await page.screenshot({ path: path.join(OUT, 'B_' + k + '.png') }); };
    const seen = {}; let taps = 0, lastKey = '', t0 = Date.now(), rng = 12345;
    const rnd = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    while (Date.now() - t0 < 420000) {
      const s = await page.evaluate(() => { const w = DM.debug.world; return { mode: DM.debug.mode, state: w.state, phase: w.phase, level: w.level, round: w.round, open: w.open.slice(), mis: !!w._mis,
        talk: w.talk && !w.talkAnswered ? w.talk.answerId : null, rewards: w.rewards.length,
        cards: w.cards.map(c => ({ id: c.id, key: c.key, state: c.state, flip: c.flip })) }; });
      if (s.mode === 'done' || s.state === 'sessionDone') { await snap('99_done'); break; }
      const rk = s.level + ':' + s.round; if (rk !== lastKey) { lastKey = rk; for (const k in seen) delete seen[k]; }
      for (const c of s.cards) if (c.flip > 0.9 && c.state !== 'gone' && !(c.id in seen) && rnd() < 0.6) seen[c.id] = c.key;
      if (s.state === 'round' && s.phase === 'peek') await snap(`L${s.level}_peek`);
      if (s.state === 'intro' && s.level > 0) await snap(`L${s.level}_intro`);
      if (s.state === 'roundDone' && s.round === 3) await snap(`L${s.level}_r4done_rewards`);
      if (s.state === 'talk' && s.talk) {
        await snap(`L${s.level}_talk`);
        await sleep(1500);
        const box = await page.evaluate((id) => { const el = document.querySelector(`[data-id="${id}"]`) || [...document.querySelectorAll('#scrTalk button, #scrTalk .choice')].find(b => b.dataset && (b.dataset.id === id || b.dataset.choice === id)); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, s.talk);
        if (box) await page.touchscreen.tap(box.x, box.y); else { await page.evaluate((id) => DM.debug.world.talkAnswer(id), s.talk); log.push('talk answered via API (no choice element found)'); }
        await sleep(1500); continue;
      }
      if (s.state === 'round' && s.phase === 'play' && !s.mis && s.open.length < 2) {
        const down = s.cards.filter(c => c.state === 'down');
        let pick = null;
        if (s.open.length === 1) { const k = s.cards.find(c => c.id === s.open[0]).key; pick = down.find(c => seen[c.id] === k); }
        if (!pick) { const by = {}; for (const c of down) if (seen[c.id]) (by[seen[c.id]] = by[seen[c.id]] || []).push(c); const pr = Object.values(by).find(a => a.length >= 2); if (pr && s.open.length === 0) pick = pr[0]; }
        if (!pick) { const un = down.filter(c => !(c.id in seen)); const pool = un.length ? un : down; pick = pool[Math.floor(rnd() * pool.length)]; }
        if (pick) {
          const b = await page.evaluate((id) => DM.debug.cardScreen(id), pick.id);
          await page.touchscreen.tap(b.x + (rnd() - 0.5) * b.w * 0.5, b.y + (rnd() - 0.5) * b.h * 0.5); taps++;
          if (s.open.length === 1) await snap(`L${s.level}_r${s.round}_two_up`); else await snap(`L${s.level}_r${s.round}_one_up`);
          await sleep(900);   // a 4-year-old listens to Dee name the card
          continue;
        }
      }
      await sleep(250);
    }
    const fin = await page.evaluate(() => ({ st: DM.debug.getState(), stats: DM.debug.stats, voice: (DM.debug.voiceLog || []).slice(-400).map(v => v.text || v) }));
    const lines = fin.voice.map(v => String(typeof v === 'object' ? JSON.stringify(v) : v));
    fs.writeFileSync(path.join(OUT, 'B_voicelog.txt'), lines.join('\n'));
    md += `wall ${((Date.now() - t0) / 1000).toFixed(0)} s, ${taps} touch taps, mode ${fin.st.mode}, stars ${fin.st.stars}, rounds ${fin.stats.rounds}, mismatches ${fin.stats.wrong}, ` +
      `matches ${fin.stats.correct}, slow frames ${(100 * fin.stats.slowFrames / Math.max(1, fin.stats.frames)).toFixed(0)}%, errors ${errors.length}${errors.length ? ': ' + errors.slice(0, 2).join(' | ') : ''}. ${log.join(' ')}\n` +
      `Screenshots: ${[...shots].map(k => 'B_' + k + '.png').join(', ')}; voice log: B_voicelog.txt (${lines.length} lines).\n`;
    await ctx.close();
  }
  await browser.close(); srv.close();
  const f = path.join(__dirname, 'out', 'pt_browser.md');
  const prev = fs.existsSync(f) && want !== 'AB' ? fs.readFileSync(f, 'utf8') : '';
  fs.writeFileSync(f, want === 'AB' ? md : prev + '\n' + md);
  console.log(md);
})().catch(e => { console.error(e); process.exit(1); });
