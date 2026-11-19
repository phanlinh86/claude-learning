// Full visual-QA sweep (report-only, never edits game/): every screen × viewport × language, every topic of ages 3–7
// mid-trace, all 4 seasons, notch insets, plus a geometry dump (overlaps, target sizes, nozzle-to-finger distance).
//   VP=ip-p LANGS=en,vi OUT=/some/dir node tests/visual/qa_full.js   → <OUT>/<vp>-<lang>-<name>.jpg + <OUT>/<vp>-<lang>.json
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const OUT = process.env.OUT || path.join(__dirname, '..', 'out', 'visual_qa'); fs.mkdirSync(OUT, { recursive: true });
// insets [top, right, bottom, left] in CSS px
const VPS = {
  'ip-p': { vp: [393, 852], ins: [59, 0, 34, 0] }, 'ip-l': { vp: [852, 393], ins: [0, 47, 21, 47] },
  'pad-p': { vp: [820, 1180], ins: [24, 0, 20, 0] }, 'pad-l': { vp: [1180, 820], ins: [24, 0, 20, 0] },
  'tall-p': { vp: [390, 844], ins: [47, 0, 34, 0] }, 'se-p': { vp: [375, 667], ins: [20, 0, 0, 0] },
  'se-l': { vp: [667, 375], ins: [0, 0, 0, 0] }
};
const AGE_TOPICS = { 3: ['colors', 'shapes', 'size', 'animals'], 4: ['colors', 'shapes', 'count', 'animals'],
  5: ['shapes', 'count', 'letters', 'animals'], 6: ['lower', 'initial', 'add', 'count'], 7: ['initial', 'add', 'sub', 'oddeven'] };
const LANGS = (process.env.LANGS || 'en,vi').split(',');
const FULL = process.env.FULL !== '0';
const until = (page, fn, arg, t = 60000) => page.waitForFunction(fn, arg, { timeout: t, polling: 30 });

/** geometry probe in CSS px: tray, choices, mochi, rack, bubble/HUD DOM rects, insets, bag vs finger, overlaps */
async function probe(page, tag) {
  return page.evaluate(tag => {
    const w = IB.debug.world, v = IB.debug.view(), L = w.layout, s = v.s;
    const R = (x, y, ww, hh) => ({ x: v.left + x * s, y: v.top + y * s, w: ww * s, h: hh * s });
    const dom = id => { const e = document.getElementById(id); if (!e || e.classList.contains('hidden')) return null; const r = e.getBoundingClientRect(); return r.width ? { x: r.left, y: r.top, w: r.width, h: r.height } : null; };
    const F = L.frame || 0;
    const tray = R(L.tray.x - F, L.tray.y - F, L.tray.w + 2 * F, L.tray.h + 2 * F);
    const mb = w._mochiBox ? w._mochiBox() : null; const mochi = mb ? R(mb.x, mb.y, mb.w, mb.h) : null;
    const choices = (w.choices || []).filter(c => !c.gone).map(c => ({ id: c.id, x: v.left + c.x * s, y: v.top + c.y * s, r: L.choices.r * s, hitR: L.choices.hitR * s }));
    const rack = L.rack ? R(L.rack.x, L.rack.y, L.rack.w, L.rack.h) : null;
    const ov = (a, b) => a && b ? Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)) : 0;
    const bubble = dom('bubble'), hud = dom('hud');
    const bt = document.getElementById('bubbleText');
    const bubbleOverflow = bubble && bt ? { sw: bt.scrollWidth, cw: bt.clientWidth, sh: bt.scrollHeight, ch: bt.clientHeight, text: bt.textContent } : null;
    const ins = { t: v.ins ? v.ins.top : null, raw: v.ins };
    const cbox = c => ({ x: c.x - c.r, y: c.y - c.r, w: 2 * c.r, h: 2 * c.r });
    const issues = [];
    if (ov(mochi, tray) > 0) issues.push('mochi∩tray ' + Math.round(ov(mochi, tray)) + 'px²');
    choices.forEach(c => { if (ov(mochi, cbox(c)) > 0) issues.push('mochi∩choice ' + c.id + ' ' + Math.round(ov(mochi, cbox(c)))); if (ov(bubble, cbox(c)) > 0) issues.push('bubble∩choice ' + c.id); if (ov(hud, cbox(c)) > 0) issues.push('hud∩choice ' + c.id); if (2 * c.r < 100) issues.push('choice ' + c.id + ' diam ' + (2 * c.r).toFixed(1)); });
    if (ov(bubble, tray) > 0) issues.push('bubble∩tray ' + Math.round(ov(bubble, tray)));
    if (ov(hud, tray) > 0) issues.push('hud∩tray ' + Math.round(ov(hud, tray)));
    if (ov(bubble, rack) > 0) issues.push('bubble∩rack ' + Math.round(ov(bubble, rack)));
    if (ov(hud, rack) > 0) issues.push('hud∩rack ' + Math.round(ov(hud, rack)));
    if (ov(bubble, mochi) > 0) issues.push('bubble∩mochi ' + Math.round(ov(bubble, mochi)));
    const sa = getComputedStyle(document.documentElement);
    const saT = parseFloat(sa.getPropertyValue('--sa-t')) || 0, saB = parseFloat(sa.getPropertyValue('--sa-b')) || 0, saL = parseFloat(sa.getPropertyValue('--sa-l')) || 0, saR = parseFloat(sa.getPropertyValue('--sa-r')) || 0;
    const VW = innerWidth, VH = innerHeight;
    const inNotch = b => b && (b.y < saT || b.y + b.h > VH - saB || b.x < saL || b.x + b.w > VW - saR);
    choices.forEach(c => { if (inNotch(cbox(c))) issues.push('choice ' + c.id + ' in safe-area'); });
    if (inNotch(tray)) issues.push('tray in safe-area ' + JSON.stringify(tray));
    if (inNotch(bubble)) issues.push('bubble in safe-area');
    if (bubbleOverflow && (bubbleOverflow.sh > bubbleOverflow.ch + 2 || bubbleOverflow.sw > bubbleOverflow.cw + 2)) issues.push('bubble text overflow');
    let bag = null;
    if (w.bag && window.__finger) { const f = window.__finger; bag = { state: w.bag.state, dx: (w.bag.x - f[0]) * s, dy: (w.bag.y - f[1]) * s }; }
    const ck = w.cookie ? { x: v.left + w.cookie.x * s, y: v.top + w.cookie.y * s, size: w.cookie.size * s } : null;
    return { tag, W: v.W, H: v.H, s, tray, mochi, rack, choices, bubble, hud, bubbleOverflow, sa: [saT, saR, saB, saL], bag, cookie: ck, issues, topic: w.topic, age: w.age, mood: IB.debug.weather.ambient && IB.debug.weather.ambient.mood };
  }, tag);
}

async function toTrace(page, topic, age, season) {
  await page.evaluate(({ topic, age, season }) => {
    IB.debug.setBot(false); const w = IB.debug.world; w.setAge(age); w.age = age; w.cfg.surpriseTypes = [];
    w.levels[1] = topic; w.startLevel(1); IB.debug.setSpeed(6);
    window.__season = season;
  }, { topic, age, season });
  for (let k = 0; k < 5; k++) {
    await until(page, () => IB.debug.world.interactive, null, 20000);
    const m = await page.evaluate(() => IB.debug.world.stepInfo.mode);
    if (m === 'trace') break;
    await page.evaluate(() => { const w = IB.debug.world, a = w.answer(); if (a && a.choice) { const h = w.choiceHit(a.choice); w.tap(h.x, h.y); } });
    await page.waitForTimeout(150);
  }
  await page.evaluate(() => { IB.debug.setSpeed(1); if (window.__season != null) IB.debug.weather.setWeather(window.__season, { instant: true }); });
}
async function midTrace(page, topic, age, frac, season) {
  await toTrace(page, topic, age, season);
  await page.evaluate(f => {
    const w = IB.debug.world, pts = w.pathScreen(); if (!pts.length) return;
    w.pointerDown(pts[0][0], pts[0][1]);
    const n = Math.floor(pts.length * f);
    for (let i = 1; i <= n; i++) w.pointerMove(pts[i][0], pts[i][1]);
    window.__finger = pts[n];
  }, frac);
  await page.waitForTimeout(350);
  await page.evaluate(() => { const w = IB.debug.world, p = window.__finger; if (p) w.pointerMove(p[0] + 0.5, p[1] + 0.5); });
  await page.waitForTimeout(120);
}
async function release(page) { await page.evaluate(() => { const w = IB.debug.world; if (w._press && window.__finger) w.pointerUp(window.__finger[0], window.__finger[1]); window.__finger = null; }); }

(async () => {
  const srv = await serve(), browser = await chromium.launch();
  const errors = [];
  const only = process.env.VP ? process.env.VP.split(',') : Object.keys(VPS);
  for (const vp of only) for (const lang of LANGS) {
    const d = VPS[vp];
    const ctx = await browser.newContext({ viewport: { width: d.vp[0], height: d.vp[1] }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error') errors.push(vp + ' ' + m.text()); });
    page.on('pageerror', e => errors.push(vp + ' ' + String(e)));
    const key = vp + '-' + lang, geo = [];
    const shot = async n => { await page.screenshot({ path: path.join(OUT, `${key}-${n}.jpg`), type: 'jpeg', quality: 72 }); geo.push(await probe(page, n)); };
    try {
      await page.goto(srv.url + `?mute=1&novoice=1&seed=5&age=4&lang=${lang}`);
      await until(page, () => window.IB && IB.debug && IB.debug.mode === 'title');
      await page.addStyleTag({ content: `:root{--sa-t:${d.ins[0]}px!important;--sa-r:${d.ins[1]}px!important;--sa-b:${d.ins[2]}px!important;--sa-l:${d.ins[3]}px!important}` });
      await page.evaluate(() => window.dispatchEvent(new Event('resize'))); await page.waitForTimeout(600);
      await shot('01-title');
      await page.evaluate(() => { document.getElementById('scrTitle').classList.add('hidden'); IB.UI.refreshSettings(); document.getElementById('scrSettings').classList.remove('hidden'); });
      await page.waitForTimeout(400); await shot('02-settings');
      await page.evaluate(() => { document.getElementById('scrSettings').classList.add('hidden'); });
      await page.evaluate(() => { IB.debug.startGame(); const w = IB.debug.world; w.cfg.surpriseTypes = []; w.levels[0] = 'colors'; w.startLevel(0); });
      await page.waitForTimeout(700); await shot('03-banner');
      await page.evaluate(() => IB.debug.setSpeed(4));
      await until(page, () => IB.debug.world.interactive);
      await page.evaluate(() => IB.debug.setSpeed(1)); await page.waitForTimeout(400); await shot('04-pick');
      // pause
      await page.tap('#btnPause').catch(() => page.click('#btnPause'));
      await page.waitForTimeout(400); await shot('05-pause');
      await page.tap('#btnResume').catch(() => page.click('#btnResume'));
      await page.waitForTimeout(300);
      // seasons (colors, age 4)
      for (let s = 0; s < 4; s++) { await midTrace(page, 'colors', 4, 0.5, s); await shot('06-season' + s); await release(page); }
      // every topic of every age, mid-trace (summer = level 1 default) — VI only age 4 + 7 unless FULL
      const ages = (lang === 'en' || FULL) ? [3, 4, 5, 6, 7] : [4, 7];
      for (const age of ages) for (const topic of AGE_TOPICS[age]) {
        await midTrace(page, topic, age, topic === 'animals' ? 0.5 : 0.45, null);
        await shot(`07-a${age}-${topic}`); await release(page);
      }
      // chips
      await page.evaluate(() => { const w = IB.debug.world; w.setAge(4); w.age = 4; w.levels[2] = 'count'; w.startLevel(2); IB.debug.setBot(true, 1); IB.debug.setSpeed(4); });
      await until(page, () => { const w = IB.debug.world; return w.stepInfo && w.stepInfo.mode === 'chips' && w.chips.length >= 2; });
      await page.evaluate(() => { IB.debug.setBot(false); IB.debug.setSpeed(1); }); await page.waitForTimeout(500); await shot('08-chips');
      await page.evaluate(() => { IB.debug.setBot(true, 1); IB.debug.setSpeed(1); });
      try {
        await until(page, () => IB.debug.world.phase === 'finish' && IB.debug.world.phaseTime > 0.5, null, 20000);
        await page.evaluate(() => IB.debug.setSpeed(0.15)); await page.waitForTimeout(300); await shot('09-finish');
        await page.evaluate(() => IB.debug.setSpeed(1));
        await until(page, () => IB.debug.world.phase === 'hop' && IB.debug.world.phaseTime > 0.7, null, 20000);
        await page.evaluate(() => IB.debug.setSpeed(0.1)); await page.waitForTimeout(200); await shot('10-hop');
      } catch (e) { console.log('  missed finish/hop ' + key); }
      // animal walking home
      await page.evaluate(() => { IB.debug.setSpeed(1); const w = IB.debug.world; w.levels[3] = 'animals'; w.startLevel(3); IB.debug.setBot(true, 1); IB.debug.setSpeed(4); });
      try {
        await until(page, () => IB.debug.world.topic === 'animals' && IB.debug.world.phase === 'hop' && IB.debug.world.phaseTime > 0.35, null, 30000);
        await page.evaluate(() => IB.debug.setSpeed(0.1)); await page.waitForTimeout(200); await shot('11-walkhome');
      } catch (e) { console.log('  missed walkhome ' + key); }
      // rack full-ish: run a few rounds then look at the rack
      await page.evaluate(() => IB.debug.setSpeed(8));
      try { await until(page, () => (IB.debug.world.rackCookies || []).length >= 3 && IB.debug.world.interactive, null, 40000); } catch (e) {}
      await page.evaluate(() => { IB.debug.setBot(false); IB.debug.setSpeed(1); }); await page.waitForTimeout(400); await shot('12-rack');
      // Talk
      await page.evaluate(() => { IB.debug.setSpeed(1); const w = IB.debug.world; w.levels[1] = 'shapes'; w.startLevel(1); IB.debug.setSpeed(6); });
      await until(page, () => IB.debug.world.state === 'round');
      await page.evaluate(() => { IB.debug.world._startTalk(); IB.debug.setSpeed(1); });
      await page.waitForTimeout(900); await shot('13-talk');
      // a counting Talk (age 5 dots)
      await page.evaluate(() => { const w = IB.debug.world; w.setAge(5); w.age = 5; w.levels[1] = 'count'; w.startLevel(1); IB.debug.setSpeed(6); });
      await until(page, () => IB.debug.world.state === 'round');
      await page.evaluate(() => { IB.debug.world._startTalk(); IB.debug.setSpeed(1); });
      await page.waitForTimeout(900); await shot('14-talk2');
      // done
      await page.evaluate(() => { const w = IB.debug.world; w.setAge(4); IB.debug.setBot(true, 0.85); IB.debug.setSpeed(30); IB.debug.startGame(); });
      await until(page, () => IB.debug.mode === 'done', null, 300000);
      await page.evaluate(() => IB.debug.setSpeed(1)); await page.waitForTimeout(1500); await shot('15-done');
    } catch (e) { console.log('FAIL ' + key + ': ' + e.message.split('\n')[0]); errors.push(key + ' ' + e.message.split('\n')[0]); }
    fs.writeFileSync(path.join(OUT, key + '.json'), JSON.stringify(geo, null, 1));
    await ctx.close();
    console.log('done', key);
  }
  await browser.close(); srv.close();
  console.log(errors.length ? 'ERRORS\n' + errors.join('\n') : 'no console errors');
})();
