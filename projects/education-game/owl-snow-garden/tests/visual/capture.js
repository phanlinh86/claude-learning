// Visual QA capture: every screen x device x language, chapter moods, topics, drag, motion sheets, notch.
//   node tests/visual/capture.js [section ...]     sections: screens moods topics drag motion notch  (default: all)
// Output: tests/out/visual/**.png   (motion frames are montaged by tests/visual/sheets.sh)
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const OUT = path.join(__dirname, '..', 'out', 'visual');
const mk = d => { fs.mkdirSync(d, { recursive: true }); return d; };
const DEV = {
  iphoneP: { viewport: { width: 393, height: 852 }, dpr: 3 },
  iphoneL: { viewport: { width: 852, height: 393 }, dpr: 3 },
  ipadP: { viewport: { width: 820, height: 1180 }, dpr: 2 },
  ipadL: { viewport: { width: 1180, height: 820 }, dpr: 2 }
};
const TOPIC_AGE = { colors: 3, shapes: 3, size: 3, homes: 3, count: 4, letters: 5, lower: 6, initial: 6, add: 6, sub: 7, oddeven: 7 };
const want = process.argv.slice(2);
const on = s => !want.length || want.includes(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));

let srv, browser;
async function open(dev, q, opts = {}) {
  const d = DEV[dev];
  const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: opts.dpr || d.dpr, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('  pageerror', dev, String(e)));
  if (opts.notch) {
    const css = opts.notch === 'P'
      ? ':root{--sa-t:47px !important;--sa-b:34px !important}#safeProbe{padding:47px 0 34px 0 !important}'
      : ':root{--sa-l:47px !important;--sa-r:47px !important;--sa-b:21px !important}#safeProbe{padding:0 47px 21px 47px !important}';
    await page.addInitScript(c => { document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = c; document.head.appendChild(s); }); }, css);
  }
  await page.goto(srv.url + '?mute=1&novoice=1&seed=5&' + q);
  await page.waitForFunction(() => window.SG && SG.debug && SG.debug.mode === 'title', null, { timeout: 20000 });
  await sleep(500);
  if (opts.notch) await page.evaluate(n => {   // overlay unsafe zones (sensor housing + home bar) so they show in shots
    const add = st => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;z-index:999;pointer-events:none;' + st; document.body.appendChild(d); };
    if (n === 'P') { add('left:0;right:0;top:0;height:47px;background:rgba(255,0,0,.18)'); add('left:50%;top:11px;width:126px;height:37px;margin-left:-63px;border-radius:20px;background:#000');
      add('left:0;right:0;bottom:0;height:34px;background:rgba(255,0,0,.18)'); add('left:50%;bottom:8px;width:140px;height:5px;margin-left:-70px;border-radius:3px;background:#000'); }
    else { add('left:0;top:0;bottom:0;width:47px;background:rgba(255,0,0,.18)'); add('left:11px;top:50%;width:37px;height:126px;margin-top:-63px;border-radius:20px;background:#000');
      add('right:0;top:0;bottom:0;width:47px;background:rgba(255,0,0,.18)'); add('left:0;right:0;bottom:0;height:21px;background:rgba(255,0,0,.18)');
      add('left:50%;bottom:8px;width:200px;height:5px;margin-left:-100px;border-radius:3px;background:#000'); }
  }, opts.notch);
  return { ctx, page };
}
// start a game and jump to (level, topic); wait until the round is interactive, then slow time to ~freeze
async function toRound(page, level = 0, topic = null) {
  await page.evaluate(([level, topic]) => {
    SG.debug.startGame();
    const w = SG.debug.world;
    if (topic) w.levels[level] = topic;
    if (level || topic) w.startLevel(level);
    SG.debug.weather.setWeather(level, { instant: true });
    SG.debug.setSpeed(6);
  }, [level, topic]);
  await page.waitForFunction(() => { const w = SG.debug.world; return w.state === 'round' && w.interactive && w.items.every(i => i.state === 'idle'); }, null, { timeout: 20000 });
  await page.evaluate(() => SG.debug.setSpeed(1));
  await sleep(700);           // let weather particles populate, bubble pop settle
  await page.evaluate(() => SG.debug.setSpeed(0.1));
  await sleep(150);
}
const shot = (page, f) => page.screenshot({ path: f });

async function screens() {
  const dir = mk(path.join(OUT, 'screens'));
  for (const dev of Object.keys(DEV)) for (const lang of ['en', 'vi']) {
    const tag = `${dev}-${lang}`;
    const { ctx, page } = await open(dev, `age=4&lang=${lang}`);
    await sleep(600);
    await shot(page, path.join(dir, `${tag}-01-title.png`));
    await page.evaluate(() => { SG.UI.refreshSettings(); SG.UI.only('scrSettings'); });
    await sleep(500);
    await shot(page, path.join(dir, `${tag}-02-settings.png`));
    await page.evaluate(() => SG.UI.only('scrTitle'));
    // chapter banner
    await page.evaluate(() => { SG.debug.startGame(); });
    await sleep(550);
    await page.evaluate(() => SG.debug.setSpeed(0.1));
    await sleep(100);
    await shot(page, path.join(dir, `${tag}-03-banner.png`));
    await page.evaluate(() => SG.debug.setSpeed(6));
    await page.waitForFunction(() => { const w = SG.debug.world; return w.state === 'round' && w.interactive; });
    await page.evaluate(() => SG.debug.setSpeed(1)); await sleep(600);
    await page.evaluate(() => SG.debug.setSpeed(0.1)); await sleep(100);
    await shot(page, path.join(dir, `${tag}-04-round.png`));
    await page.click('#btnPause'); await sleep(450);
    await shot(page, path.join(dir, `${tag}-05-pause.png`));
    await page.click('#btnResume'); await sleep(200);
    // round done + flying stars
    await page.evaluate(() => { SG.debug.setSpeed(1); SG.debug.world._endRound(); });
    await sleep(420);
    await page.evaluate(() => SG.debug.setSpeed(0.1)); await sleep(80);
    await shot(page, path.join(dir, `${tag}-06-rounddone.png`));
    // talk time
    await page.evaluate(() => { SG.debug.setSpeed(1); SG.debug.world._startTalk(); });
    await sleep(700);
    await shot(page, path.join(dir, `${tag}-07-talk.png`));
    await page.evaluate(() => { const w = SG.debug.world; w.talkAnswer(w.talk.answerId); SG.debug.setSpeed(0.1); });
    await sleep(500);
    await shot(page, path.join(dir, `${tag}-08-talk-right.png`));
    // level done
    await page.evaluate(() => { SG.debug.setSpeed(1); SG.debug.world._levelDone(); });
    await sleep(700);
    await page.evaluate(() => SG.debug.setSpeed(0.1)); await sleep(80);
    await shot(page, path.join(dir, `${tag}-09-leveldone.png`));
    // session done + confetti
    await page.evaluate(() => { const w = SG.debug.world; w.level = w.levels.length - 1; w._levelDone(); SG.debug.setSpeed(6); });
    await page.waitForFunction(() => SG.debug.mode === 'done', null, { timeout: 20000 });
    await page.evaluate(() => SG.debug.setSpeed(1)); await sleep(1500);
    await shot(page, path.join(dir, `${tag}-10-done.png`));
    await ctx.close();
    console.log('screens', tag);
  }
}

async function moods() {
  const dir = mk(path.join(OUT, 'moods'));
  for (const dev of ['iphoneL', 'iphoneP', 'ipadL', 'ipadP']) for (let lv = 0; lv < 4; lv++) {
    const { ctx, page } = await open(dev, `age=3&lang=en`);
    await toRound(page, lv, 'colors');
    await shot(page, path.join(dir, `${dev}-L${lv}-colors.png`));
    await ctx.close();
  }
  console.log('moods done');
}

async function topics() {
  const dir = mk(path.join(OUT, 'topics'));
  const plan = [['iphoneL', 'en'], ['iphoneP', 'vi'], ['ipadP', 'en'], ['ipadL', 'vi']];
  for (const [dev, lang] of plan) for (const [topic, age] of Object.entries(TOPIC_AGE)) {
    const { ctx, page } = await open(dev, `age=${age}&lang=${lang}`);
    await toRound(page, 2, topic);         // level 2 = rain = darkest mood (worst case for contrast)
    await shot(page, path.join(dir, `${dev}-${lang}-${topic}-a${age}.png`));
    const lay = await page.evaluate(() => { const w = SG.debug.world; return { W: w.layout.W, H: w.layout.H, play: w.layout.play, nestTop: w.layout.nest.top, groundY: w.layout.groundY,
      bo: w.layout.bo, sizes: w.items.map(i => Math.round(i.size)), ys: w.items.map(i => Math.round(i.y)), shrink: w.packShrink, n: w.items.length, nests: w.baskets.length, nestW: Math.round(w.baskets[0].w) }; });
    fs.appendFileSync(path.join(dir, 'layout.jsonl'), JSON.stringify({ dev, lang, topic, age, ...lay }) + '\n');
    await ctx.close();
  }
  console.log('topics done');
}

async function drag() {
  const dir = mk(path.join(OUT, 'drag'));
  for (const dev of ['iphoneL', 'iphoneP', 'ipadL']) {
    const { ctx, page } = await open(dev, 'age=3&lang=en');
    await toRound(page, 0, 'colors');
    await page.evaluate(() => SG.debug.setSpeed(1));
    // grab first item and sweep it right/left so it tilts; screenshot mid-sweep
    await page.evaluate(() => {
      const w = SG.debug.world, it = w.items[0];
      const x0 = it.x, y0 = it.y; w.pointerDown(x0, y0);
      const t0 = w.time;
      window.__drag = () => { const t = w.time - t0; w.pointerMove(x0 + 220 * Math.sin(t * 3.2), y0 - 60 - 40 * Math.min(1, t)); if (w.held && window.__drag) requestAnimationFrame(window.__drag); };
      requestAnimationFrame(window.__drag);
    });
    await sleep(380);
    await page.evaluate(() => SG.debug.setSpeed(0.1));
    await sleep(60);
    await shot(page, path.join(dir, `${dev}-held-swing.png`));
    // held over the correct nest (shows drop target / lift shadow over the nest)
    await page.evaluate(() => { const w = SG.debug.world, it = w.itemById(w.held), b = w.basketById(it.answer); window.__drag = null; w.pointerMove(b.x, b.y - b.w * 0.45); SG.debug.setSpeed(1); });
    await sleep(500);
    await page.evaluate(() => SG.debug.setSpeed(0.1)); await sleep(60);
    await shot(page, path.join(dir, `${dev}-held-overnest.png`));
    await ctx.close();
  }
  console.log('drag done');
}

/* Motion contact sheets: frames every 50 ms of game time, cropped around the action (logical rect). */
async function motion() {
  const dir = mk(path.join(OUT, 'motion'));
  const { ctx, page } = await open('iphoneL', 'age=3&lang=en', { dpr: 2 });
  await toRound(page, 0, 'colors');
  await page.evaluate(() => {
    const w = SG.debug.world, cv = document.getElementById('game');
    window.__rec = function (dur, crop, script) {
      return new Promise(res => {
        const frames = [], rs = cv.width / w.layout.W, t0 = w.time; let next = 0;
        const sc = 340 / (crop.w * rs);
        function tick() {
          const t = w.time - t0;
          if (script) script(t);
          if (t >= next - 1e-6) {
            const c = document.createElement('canvas'); c.width = Math.round(crop.w * rs * sc); c.height = Math.round(crop.h * rs * sc);
            c.getContext('2d').drawImage(cv, crop.x * rs, crop.y * rs, crop.w * rs, crop.h * rs, 0, 0, c.width, c.height);
            frames.push({ t: Math.round(t * 1000), url: c.toDataURL('image/png') }); next += 0.05;
          }
          if (t < dur) requestAnimationFrame(tick); else res(frames);
        }
        requestAnimationFrame(tick);
      });
    };
  });
  const save = async (name, frames) => {
    const d = mk(path.join(dir, name)); fs.readdirSync(d).forEach(f => fs.unlinkSync(path.join(d, f)));
    frames.forEach((f, i) => fs.writeFileSync(path.join(d, `${String(i).padStart(3, '0')}_${f.t}ms.png`), Buffer.from(f.url.split(',')[1], 'base64')));
    console.log('motion', name, frames.length);
  };
  const run = (dur, crop, scriptSrc) => page.evaluate(([dur, crop, s]) => { SG.debug.setSpeed(0.25); return window.__rec(dur, crop, s ? eval('(' + s + ')') : null); }, [dur, crop, scriptSrc]);
  // 1 drag swing: grab, fling right over 0.35 s, hold still (pendulum settle)
  const crop1 = await page.evaluate(() => { const w = SG.debug.world, it = w.items[0]; window.__it = it; window.__x0 = it.x; window.__y0 = it.y;
    return { x: Math.max(0, it.x - 120), y: Math.max(0, it.y - 160), w: 520, h: 280 }; });
  await save('1_drag_swing', await run(1.6, crop1, `t => { const w = SG.debug.world; if (!w.held && t < 0.02) w.pointerDown(__x0, __y0);
    const u = Math.min(1, t / 0.35), e = u * u * (3 - 2 * u); w.pointerMove(__x0 + 280 * e, __y0 - 50 * e); }`));
  // 2 flight into nest + landing squash: release the held item over its nest
  const crop2 = await page.evaluate(() => { const w = SG.debug.world, it = w.itemById(w.held), b = w.basketById(it.answer);
    window.__b = b; w.pointerMove(b.x, b.y - 140); return { x: Math.max(0, Math.min(it.x, b.x) - 160), y: Math.max(0, Math.min(it.y, b.y) - 200), w: Math.abs(it.x - b.x) + 320, h: Math.abs(it.y - b.y) + 320 }; });
  await save('2_fly_land', await run(1.1, crop2, `t => { const w = SG.debug.world; if (w.held && t > 0.1) w.pointerUp(__b.x, __b.y - 140); }`));
  // 3 wrong drop: shake + return
  const crop3 = await page.evaluate(() => { const w = SG.debug.world, it = w.items.find(i => i.state === 'idle'), b = w.baskets.find(b => b.id !== it.answer);
    window.__x0 = it.x; window.__y0 = it.y; window.__b = b; return { x: Math.max(0, Math.min(it.x, b.x) - 160), y: Math.max(0, Math.min(it.y, b.y) - 200), w: Math.abs(it.x - b.x) + 320, h: Math.abs(it.y - b.y) + 320 }; });
  await save('3_wrong_return', await run(1.6, crop3, `t => { const w = SG.debug.world;
    if (t < 0.02 && !w.held) w.pointerDown(__x0, __y0);
    if (t < 0.3) { const u = t / 0.3; w.pointerMove(__x0 + (__b.x - __x0) * u, __y0 + (__b.y - 110 - __y0) * u); }
    else if (w.held) w.pointerUp(__b.x, __b.y - 110); }`));
  // 4 appear pop: start a fresh round
  const crop4 = await page.evaluate(() => { const w = SG.debug.world; w._beginRound(); const P = w.layout.play; return { x: P.x, y: P.y, w: P.w, h: P.h }; });
  await save('4_appear_pop', await run(0.9, crop4, null));
  // 5 Bo cheer / hop
  const crop5 = await page.evaluate(() => { const w = SG.debug.world, L = w.layout.bo; w._mood('cheer'); return { x: Math.max(0, L.x - 140), y: Math.max(0, L.y - L.h * 1.35), w: 280, h: L.h * 1.5 }; });
  await save('5_bo_cheer', await run(1.4, crop5, null));
  await ctx.close();
}

async function notch() {
  const dir = mk(path.join(OUT, 'notch'));
  for (const [dev, n] of [['iphoneP', 'P'], ['iphoneL', 'L']]) for (const lang of ['en', 'vi']) {
    const { ctx, page } = await open(dev, `age=6&lang=${lang}`, { notch: n });
    await shot(page, path.join(dir, `${dev}-${lang}-title.png`));
    await toRound(page, 0, 'add');
    await shot(page, path.join(dir, `${dev}-${lang}-round.png`));
    await page.evaluate(() => { SG.debug.setSpeed(1); SG.debug.world._startTalk(); }); await sleep(700);
    await shot(page, path.join(dir, `${dev}-${lang}-talk.png`));
    await page.evaluate(() => { const w = SG.debug.world; w.level = w.levels.length - 1; w._levelDone(); SG.debug.setSpeed(6); });
    await page.waitForFunction(() => SG.debug.mode === 'done', null, { timeout: 20000 });
    await page.evaluate(() => SG.debug.setSpeed(1)); await sleep(1200);
    await shot(page, path.join(dir, `${dev}-${lang}-done.png`));
    await ctx.close();
  }
  console.log('notch done');
}

(async () => {
  srv = await serve(); browser = await chromium.launch();
  mk(OUT);
  try {
    if (on('screens')) await screens();
    if (on('moods')) await moods();
    if (on('topics')) { try { fs.unlinkSync(path.join(OUT, 'topics', 'layout.jsonl')); } catch (e) {} await topics(); }
    if (on('drag')) await drag();
    if (on('motion')) await motion();
    if (on('notch')) await notch();
  } catch (e) { console.error(e); process.exitCode = 1; }
  await browser.close(); srv.close();
})();
