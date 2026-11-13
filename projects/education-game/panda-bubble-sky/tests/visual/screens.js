// Visual QA sweep (Bo's Farm Parade): title, every chapter mood (morning / noon / sunset / night) with its topic in play,
// the hop onto the stage, the march, Talk time and settings × 4 device shapes (notch insets emulated) × EN / VI, plus
// in-page geometry checks (bubble vs HUD, Bo vs members, members and barn on screen, bubble text overflow, hit size in pt).
//   node tests/visual/screens.js            -> tests/out/visual/*.png + issues.txt (report-only; exits 1 on an issue)
//   DEV=ip-p,pad-l  LANGS=en  (subsets)
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const OUT = path.join(__dirname, '..', 'out', 'visual'); fs.mkdirSync(OUT, { recursive: true });
// insets in CSS px [top, right, bottom, left]
const DEVS = {
  'ip-p': { vp: [393, 852], ins: [59, 0, 34, 0], dpr: 3 }, 'ip-l': { vp: [852, 393], ins: [0, 59, 21, 59], dpr: 3 },
  'pad-p': { vp: [820, 1180], ins: [24, 0, 20, 0], dpr: 2 }, 'pad-l': { vp: [1180, 820], ins: [24, 0, 20, 0], dpr: 2 },
  'and-p': { vp: [360, 780], ins: [28, 0, 16, 0], dpr: 3 }, 'pro-p': { vp: [1024, 1366], ins: [24, 0, 20, 0], dpr: 2 }
};
const env = (k, d) => (process.env[k] ? process.env[k].split(',') : d);
const DEV_LIST = env('DEV', Object.keys(DEVS)), LANGS = env('LANGS', ['en', 'vi']);
const MOOD_TOPICS = [['colors', 4], ['shapes', 4], ['count', 4], ['animals', 4]];
const until = (page, fn, arg, t = 30000) => page.waitForFunction(fn, arg, { timeout: t, polling: 30 });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const issues = [];

async function open(browser, srv, dev, lang, age = 4, seed = 5) {
  const d = DEVS[dev];
  const ctx = await browser.newContext({ viewport: { width: d.vp[0], height: d.vp[1] }, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page._errs = []; page.on('pageerror', e => page._errs.push(String(e))); page.on('console', m => { if (m.type() === 'error') page._errs.push(m.text()); });
  await page.goto(srv.url + `?mute=1&novoice=1&seed=${seed}&age=${age}&lang=${lang}`);
  await until(page, () => window.PB && PB.debug && PB.debug.mode === 'title');
  await page.addStyleTag({ content: `:root{--sa-t:${d.ins[0]}px!important;--sa-r:${d.ins[1]}px!important;--sa-b:${d.ins[2]}px!important;--sa-l:${d.ins[3]}px!important}` });
  await page.evaluate(() => window.dispatchEvent(new Event('resize'))); await sleep(450);
  return { ctx, page };
}
function geom() {
  const w = PB.debug.world, L = w.layout, v = PB.debug.view(), iss = [];
  const rectL = el => { if (!el) return null; const r = el.getBoundingClientRect(); if (!r.width || el.classList.contains('hidden') || el.closest('.hidden')) return null; return { x: (r.left - v.left) / v.s, y: (r.top - v.top) / v.s, w: r.width / v.s, h: r.height / v.s }; };
  const ov = (a, b) => a && b ? Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)) : 0;
  const hud = rectL(document.getElementById('hud')), bubble = rectL(document.getElementById('bubble'));
  if (ov(hud, bubble) > 0) iss.push('bubble overlaps the HUD');
  const b = document.getElementById('bubble'), bt = document.getElementById('bubbleText');
  if (bubble) { const over = bt.getBoundingClientRect().height - b.clientHeight; if (over > 2) iss.push('bubble text overflows ' + Math.round(over) + ' px'); }
  // Bo's visible box (frame bbox 49…249 × 33…293 of 300, scale 1.06 h / 260)
  const B = L.bo, k = B.h * 1.06 / 260, bo = { x: B.x - 101 * k, y: B.y - 259 * k, w: 200 * k, h: 260 * k };
  for (const m of w.members) {
    if (m.state !== 'stand') continue;
    const r = m.size * 0.42, box = { x: m.cx - r, y: m.cy - r, w: 2 * r, h: 2 * r };
    const f = ov(box, bo) / (box.w * box.h);
    if (f > 0.05) iss.push(`Bo covers member ${m.id} ${Math.round(f * 100)}%`);
    if (ov(box, bubble) > 0) iss.push(`member ${m.id} under the bubble`);
    if (ov(box, hud) > 0) iss.push(`member ${m.id} under the HUD`);
    if (box.x < 0 || box.y < 0 || box.x + box.w > L.W || box.y + box.h > L.H) iss.push(`member ${m.id} off screen`);
    if (2 * w._hitR(m) * v.s < 88) iss.push(`member ${m.id} hit ${Math.round(2 * w._hitR(m) * v.s)} pt < 88`);
  }
  const bb = L.barn.box; if (bb.x < 0 || bb.x + bb.w > L.W + 1 || bb.y < 0) iss.push('barn clipped ' + JSON.stringify(bb));
  const st = w.members.find(m => m.state === 'stage');
  if (st && bubble && st.cy - st.size * 0.5 < bubble.y + bubble.h) iss.push('stage member under the bubble');
  // a hopping member's BODY never goes behind the bubble (visual QA P1-1)
  for (const m of w.members) if (m.state === 'hop' && bubble) {
    const h = w._drawH(m), top = m.y - m.bob - h, hw = m.size * 0.45;
    if (m.x + hw > bubble.x && m.x - hw < bubble.x + bubble.w && top < bubble.y + bubble.h) iss.push(`hop body ${Math.round(bubble.y + bubble.h - top)} px behind the bubble`);
  }
  // the gate: the barn doors are not covered by standing members (visual QA P2-2)
  const a = PB.debug.answer();
  if (a && a.door) { const D = L.barn.door; for (const m of w.members) if (m.state === 'stand' && m.x + m.size * 0.46 > D.l + 2 && m.x - m.size * 0.46 < D.r) iss.push(`member ${m.id} covers the barn doors in the gate`); }
  return iss;
}
async function check(page, tag) {
  const iss = await page.evaluate(geom);
  for (const s of iss) issues.push(`${tag}: ${s}`);
  for (const e of page._errs.splice(0)) issues.push(`${tag}: error ${e}`);
}

(async () => {
  const srv = await serve();
  const browser = await chromium.launch();
  for (const dev of DEV_LIST) for (const lang of LANGS) {
    const { ctx, page } = await open(browser, srv, dev, lang);
    const tag = `${dev}-${lang}`;
    try {
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT, `${tag}-0-title.png`) });
      await page.evaluate(() => PB.debug.startGame());
      for (let lv = 0; lv < 4; lv++) {
        const [topic] = MOOD_TOPICS[lv];
        await page.evaluate(([lv, t]) => { const w = PB.debug.world; w.levels[lv] = t; w.startLevel(lv); PB.debug.weather.setWeather(lv, { instant: true }); PB.debug.setSpeed(4); }, [lv, topic]);
        // a later round (4–5 members) of the chapter
        for (let r = 0; r < (lv === 3 ? 3 : 2); r++) {
          await until(page, () => { const w = PB.debug.world; return w.interactive && w.members.every(m => m.state === 'stand' && !m.walking); });
          if (r < (lv === 3 ? 2 : 1)) { await page.evaluate(() => { PB.debug.setBot(true, 1); PB.debug.setSpeed(8); }); const r0 = await page.evaluate(() => PB.debug.world.round); await until(page, r0 => PB.debug.world.state === 'round' && PB.debug.world.round !== r0, r0); await page.evaluate(() => { PB.debug.setBot(false); PB.debug.setSpeed(4); }); }
        }
        await page.evaluate(() => PB.debug.setSpeed(1)); await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(OUT, `${tag}-${lv + 1}-${topic}.png`) });
        await check(page, `${tag} ${topic}`);
        if (lv === 0 || lv === 3) {   // the odd one mid-hop (slow motion, near the apex), on the stage, the gate, then the march
          await page.evaluate(() => { PB.debug.setSpeed(0.12); const w = PB.debug.world, a = w.answer(), h = w.memberHit(a.member); w.pointerDown(h.x, h.y); w.pointerUp(h.x, h.y); });
          await until(page, () => { const w = PB.debug.world, m = w.members.find(q => q.state === 'hop'); return m && m._f && m._ft >= m._f.T * 0.42; });
          await page.evaluate(() => PB.debug.setSpeed(0.0001));
          await page.waitForTimeout(150);
          await page.screenshot({ path: path.join(OUT, `${tag}-${lv + 1}a-hop.png`) });
          await check(page, `${tag} ${topic} hop`);
          await page.evaluate(() => PB.debug.setSpeed(1));
          await page.waitForTimeout(1500);
          await page.screenshot({ path: path.join(OUT, `${tag}-${lv + 1}b-stage.png`) });
          await check(page, `${tag} ${topic} stage`);
          await until(page, () => { const a = PB.debug.answer(); return a && a.door; });
          await page.waitForTimeout(500);
          await page.screenshot({ path: path.join(OUT, `${tag}-${lv + 1}d-gate.png`) });
          await check(page, `${tag} ${topic} gate`);
          await page.evaluate(() => { const w = PB.debug.world, d = w.doorHit(); w.pointerDown(d.cx, d.cy); w.pointerUp(d.cx, d.cy); });
          await page.waitForTimeout(1100);
          await page.screenshot({ path: path.join(OUT, `${tag}-${lv + 1}c-march.png`) });
        }
      }
      // night colours: purple friends + a yellow odd one (the weakest contrast pair on the night path, visual QA P2-6)
      await page.evaluate(() => { const w = PB.debug.world; w.levels[3] = 'colors'; w.startLevel(3); PB.debug.weather.setWeather(3, { instant: true }); PB.debug.setSpeed(4); });
      await until(page, () => { const w = PB.debug.world; return w.interactive && w.members.every(m => m.state === 'stand' && !m.walking); });
      await page.evaluate(() => { PB.debug.setSpeed(1); for (const m of PB.debug.world.members) m.thing.color = m.odd ? 'yellow' : 'purple'; });
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT, `${tag}-4n-night-colors.png`) });
      // Talk time of the night chapter
      await page.evaluate(() => { PB.debug.setBot(true, 1); PB.debug.setSpeed(8); });
      await until(page, () => PB.debug.world.state === 'talk', null, 120000);
      await page.evaluate(() => { PB.debug.setBot(false); PB.debug.setSpeed(1); });
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(OUT, `${tag}-5-talk.png`) });
      const tov = await page.evaluate(() => { const p = document.querySelector('.talk-panel'); const r = p.getBoundingClientRect(); return r.bottom > innerHeight + 1 || r.top < 0 || p.scrollHeight > p.clientHeight + 4; });
      if (tov) issues.push(`${tag}: Talk panel overflows the screen`);
      // the celebration (session done): the panel must leave the barn and the path visible (visual QA P2-3)
      await page.evaluate(() => { PB.debug.setBot(true, 1); PB.debug.setSpeed(8); });
      await until(page, () => PB.debug.mode === 'done', null, 60000);
      await page.evaluate(() => { PB.debug.setBot(false); PB.debug.setSpeed(1); });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(OUT, `${tag}-7-done.png`) });
      const dov = await page.evaluate(() => { const v = PB.debug.view(), L = PB.debug.world.layout, r = document.querySelector('#scrDone .done-panel').getBoundingClientRect();
        const toL = (x, y) => ({ x: (x - v.left) / v.s, y: (y - v.top) / v.s }), a = toL(r.left, r.top), b = toL(r.right, r.bottom), bb = L.barn.box;
        return { coversDoor: a.x < L.barn.door.r && b.x > L.barn.door.l && a.y < L.barn.door.y && b.y > L.barn.door.top, coversPath: b.y > L.line.y - 20 }; });
      if (dov.coversDoor || dov.coversPath) issues.push(`${tag}: done panel covers ${dov.coversDoor ? 'the barn doors' : ''} ${dov.coversPath ? 'the path' : ''}`);
      // settings
      await page.evaluate(() => { PB.debug.goTitle(); PB.UI.refreshSettings(); PB.UI.only('scrSettings'); });
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT, `${tag}-6-settings.png`) });
    } catch (e) { issues.push(`${tag}: exception ${e.message.split('\n')[0]}`); await page.screenshot({ path: path.join(OUT, `${tag}-fail.png`) }); }
    await ctx.close();
    console.log('done', tag);
  }
  await browser.close(); srv.close();
  fs.writeFileSync(path.join(OUT, 'issues.txt'), issues.join('\n') + '\n');
  console.log(issues.length ? 'ISSUES:\n' + issues.join('\n') : 'no geometry issues');
  process.exit(issues.length ? 1 : 0);
})();
