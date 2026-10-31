// Visual QA capture for Puppy Garden Catch: every screen x device x language, weather chapters,
// every topic for ages 3-7, Pip moods, catch / hint moments, notch insets, DOM geometry.
//   node tests/visual/capture.js [section ...]   sections: screens moods topics pip notch measure extra  (default: all)
// Output: tests/out/visual/<section>/*.png  (+ measure.jsonl, topics/layout.jsonl)
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
const AGES = { 3: ['colors', 'shapes', 'size', 'animals'], 4: ['colors', 'shapes', 'count', 'animals'],
  5: ['shapes', 'count', 'letters', 'animals'], 6: ['lower', 'initial', 'add', 'count'], 7: ['add', 'sub', 'initial', 'oddeven'] };
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
      ? ':root{--sa-t:59px !important;--sa-b:34px !important}'
      : ':root{--sa-l:59px !important;--sa-r:59px !important;--sa-b:21px !important}';
    await page.addInitScript(c => { document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = c; document.head.appendChild(s); }); }, css);
  }
  await page.goto(srv.url + '?mute=1&novoice=1&seed=' + (opts.seed || 5) + '&' + q);
  await page.waitForFunction(() => window.PG && PG.debug && PG.debug.mode === 'title', null, { timeout: 20000 });
  await sleep(400);
  if (opts.notch) await page.evaluate(n => {   // draw the unsafe zones (sensor housing + home bar) so they show in shots
    const add = st => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;z-index:999;pointer-events:none;' + st; document.body.appendChild(d); };
    if (n === 'P') { add('left:0;right:0;top:0;height:59px;background:rgba(255,0,0,.18)'); add('left:50%;top:11px;width:126px;height:37px;margin-left:-63px;border-radius:20px;background:#000');
      add('left:0;right:0;bottom:0;height:34px;background:rgba(255,0,0,.18)'); add('left:50%;bottom:8px;width:140px;height:5px;margin-left:-70px;border-radius:3px;background:#000'); }
    else { add('left:0;top:0;bottom:0;width:59px;background:rgba(255,0,0,.18)'); add('left:11px;top:50%;width:37px;height:126px;margin-top:-63px;border-radius:20px;background:#000');
      add('right:0;top:0;bottom:0;width:59px;background:rgba(255,0,0,.18)'); add('left:0;right:0;bottom:0;height:21px;background:rgba(255,0,0,.18)');
      add('left:50%;bottom:8px;width:200px;height:5px;margin-left:-100px;border-radius:3px;background:#000'); }
  }, opts.notch);
  return { ctx, page };
}
const freeze = page => page.evaluate(() => PG.debug.setSpeed(0.1));
const shot = (page, f) => page.screenshot({ path: f });
/** start (or jump to) a level and wait for bubbles in mid-air: >=2 falling, the lowest past 35 % of the fall */
async function toMidRound(page, level = null, start = true) {
  await page.evaluate(([level, start]) => {
    if (start) PG.debug.startGame();
    if (level != null) PG.debug.gotoLevel(level);
    PG.debug.weather.setWeather(PG.debug.world.level, { instant: true });
    PG.debug.setSpeed(4);
  }, [level, start]);
  await page.waitForFunction(() => {
    const w = PG.debug.world, L = w.layout; if (w.state !== 'round') return false;
    const f = w.items.filter(i => i.state === 'fall');
    const need = Math.min(2, (w.cur && w.cur.maxAir) || 2);
    return f.length >= need && f.some(i => i.y > L.spawnY + 0.35 * (L.sky.bottom - L.spawnY));
  }, null, { timeout: 30000, polling: 30 });
  await freeze(page); await sleep(120);
}
/** CSS rect of a logical rect (for clipped screenshots) */
const cssRect = (page, r) => page.evaluate(r => { const v = PG.debug.view(); return { x: Math.max(0, v.left + r.x * v.s), y: Math.max(0, v.top + r.y * v.s), width: r.w * v.s, height: r.h * v.s }; }, r);

async function screens() {
  const dir = mk(path.join(OUT, 'screens'));
  for (const dev of Object.keys(DEV)) for (const lang of ['en', 'vi']) {
    const tag = `${dev}-${lang}`;
    const { ctx, page } = await open(dev, `age=4&lang=${lang}`);
    await sleep(900);
    await shot(page, path.join(dir, `${tag}-01-title.png`));
    await page.evaluate(() => PG.debug.setSpeed(0.1)); await sleep(100);   // let decorative bubbles drift to another spot
    await page.evaluate(() => { PG.UI.refreshSettings(); PG.UI.only('scrSettings'); }); await sleep(450);
    await shot(page, path.join(dir, `${tag}-02-settings.png`));
    await page.evaluate(() => { PG.UI.only('scrTitle'); PG.debug.setSpeed(1); });
    // chapter banner (intro state, banner fully in)
    await page.evaluate(() => PG.debug.startGame());
    await page.waitForFunction(() => PG.debug.world.state === 'intro' && PG.debug.world.stateTime > 0.6);
    await freeze(page); await sleep(80);
    await shot(page, path.join(dir, `${tag}-03-banner.png`));
    await toMidRound(page, null, false);
    await shot(page, path.join(dir, `${tag}-04-round.png`));
    // hint glow on the lowest right bubble
    await page.evaluate(() => { PG.debug.world.hint(); PG.debug.setSpeed(1); }); await sleep(350); await freeze(page); await sleep(60);
    await shot(page, path.join(dir, `${tag}-05-hint.png`));
    // catch moment: bot steers, freeze right after an item lands in the basket
    await page.evaluate(() => { PG.debug.setBot(true, 1); PG.debug.setSpeed(1); });
    await page.waitForFunction(() => PG.debug.world.items.some(i => i.state === 'in' && i.t < 0.25) || PG.debug.world.state !== 'round', null, { timeout: 30000, polling: 16 });
    await freeze(page); await sleep(60);
    await shot(page, path.join(dir, `${tag}-06-catch.png`));
    await page.evaluate(() => PG.debug.setBot(false));
    await page.evaluate(() => PG.debug.setSpeed(1));
    await page.click('#btnPause'); await sleep(450);
    await shot(page, path.join(dir, `${tag}-07-pause.png`));
    await page.click('#btnResume'); await sleep(200);
    // round done
    await page.evaluate(() => { PG.debug.world._endRound(); }); await sleep(450); await freeze(page); await sleep(60);
    await shot(page, path.join(dir, `${tag}-08-rounddone.png`));
    // talk time
    await page.evaluate(() => { PG.debug.setSpeed(1); PG.debug.world._startTalk(); }); await sleep(800);
    await shot(page, path.join(dir, `${tag}-09-talk.png`));
    await page.evaluate(() => { const w = PG.debug.world; w.talkAnswer(w.talk.answerId); PG.debug.setSpeed(0.1); }); await sleep(500);
    await shot(page, path.join(dir, `${tag}-10-talk-right.png`));
    await page.evaluate(() => { PG.debug.setSpeed(1); PG.debug.world._levelDone(); }); await sleep(700); await freeze(page); await sleep(60);
    await shot(page, path.join(dir, `${tag}-11-leveldone.png`));
    await page.evaluate(() => { const w = PG.debug.world; w.level = w.levels.length - 1; w._levelDone(); PG.debug.setSpeed(6); });
    await page.waitForFunction(() => PG.debug.mode === 'done', null, { timeout: 20000 });
    await page.evaluate(() => PG.debug.setSpeed(1)); await sleep(1500);
    await shot(page, path.join(dir, `${tag}-12-done.png`));
    await ctx.close();
    console.log('screens', tag);
  }
}

async function moods() {
  const dir = mk(path.join(OUT, 'moods'));
  for (const dev of Object.keys(DEV)) for (let lv = 0; lv < 4; lv++) {
    const { ctx, page } = await open(dev, `age=4&lang=en&level=${lv}`);
    await toMidRound(page);
    await shot(page, path.join(dir, `${dev}-L${lv}.png`));
    await ctx.close();
  }
  console.log('moods done');
}

async function topics() {
  const dir = mk(path.join(OUT, 'topics'));
  const plan = [['iphoneP', 'vi'], ['iphoneL', 'en'], ['ipadP', 'en'], ['ipadL', 'vi']];
  for (const [dev, lang] of plan) for (const age of Object.keys(AGES)) for (let lv = 0; lv < 4; lv++) {
    const topic = AGES[age][lv];
    const { ctx, page } = await open(dev, `age=${age}&lang=${lang}&level=${lv}`, { seed: 3 + lv });
    await toMidRound(page);
    // move Pip a little so he's not exactly under a bubble, and take the shot
    await shot(page, path.join(dir, `${dev}-${lang}-a${age}-L${lv}-${topic}.png`));
    const lay = await page.evaluate(() => { const w = PG.debug.world, L = w.layout;
      return { W: L.W, H: L.H, ins: L.ins, groundY: L.groundY, pupH: L.pup.h, basketW: L.basket.w, spawnY: L.spawnY, rimY: L.sky.bottom,
        sizes: w.items.map(i => Math.round(i.size)), texts: w.items.map(i => i.text).filter(Boolean), bubble: document.getElementById('bubble').getBoundingClientRect().toJSON(),
        bubbleText: document.getElementById('bubbleText').textContent, bubbleFont: document.getElementById('bubbleText').style.fontSize,
        bubbleOverflow: (() => { const b = document.getElementById('bubble'); return b.scrollHeight > b.clientHeight + 1 || b.scrollWidth > b.clientWidth + 1; })(),
        hud: document.getElementById('hud').getBoundingClientRect().toJSON(), s: PG.debug.view().s }; });
    fs.appendFileSync(path.join(dir, 'layout.jsonl'), JSON.stringify({ dev, lang, age, lv, topic, ...lay }) + '\n');
    // close-up of the basket tag
    const b = await page.evaluate(() => { const w = PG.debug.world, b = w.basket; return { x: b.x - b.w * 0.75, y: b.y - b.w * 0.6, w: b.w * 1.5, h: b.w * 1.25 }; });
    await page.screenshot({ path: path.join(dir, `${dev}-${lang}-a${age}-L${lv}-${topic}-basket.png`), clip: await cssRect(page, b) });
    await ctx.close();
  }
  console.log('topics done');
}

/* Pip in every mood + run frames, close-up crops (iPad landscape, sunny and rain) */
async function pip() {
  const dir = mk(path.join(OUT, 'pip'));
  for (const [dev, lv] of [['ipadL', 0], ['iphoneP', 2], ['iphoneL', 3]]) {
    const { ctx, page } = await open(dev, `age=4&lang=en&level=${lv}`);
    await toMidRound(page);
    await page.evaluate(() => { PG.debug.world.items = []; PG.debug.world.cfg.autoSpawn = false; });
    const crop = async () => cssRect(page, await page.evaluate(() => { const w = PG.debug.world, L = w.layout; return { x: w.pup.x - L.pup.h * 1.0, y: L.pup.y - L.pup.h * 1.35, w: L.pup.h * 2.0, h: L.pup.h * 1.45 }; }));
    for (const m of ['idle', 'happy', 'cheer', 'think', 'oops', 'talk', 'blink']) {
      await page.evaluate(m => { const w = PG.debug.world; w._mood(m); w.pup._hopT = -1; w.pup.hop = 0; w.pup.moodT = 99; PG.debug.setSpeed(0.1); }, m);
      await sleep(120);
      await page.screenshot({ path: path.join(dir, `${dev}-mood-${m}.png`), clip: await crop() });
    }
    // run: steer to the right edge and freeze mid-run (two shots for both stride frames)
    await page.evaluate(() => { const w = PG.debug.world; w.pup.mood = 'idle'; w.pup.moodT = 0; PG.debug.setSpeed(1); w.pointerDown(w.layout.W * 0.15, w.layout.groundY - 200); });
    await sleep(220); await freeze(page);
    await page.screenshot({ path: path.join(dir, `${dev}-run-left.png`), clip: await crop() });
    await page.evaluate(() => { const w = PG.debug.world; PG.debug.setSpeed(1); w.pointerMove(w.layout.W * 0.85, w.layout.groundY - 200); });
    await sleep(260); await freeze(page);
    await page.screenshot({ path: path.join(dir, `${dev}-run-right.png`), clip: await crop() });
    await page.evaluate(() => { const w = PG.debug.world; w.pointerUp(); });
    await ctx.close();
  }
  console.log('pip done');
}

async function notch() {
  const dir = mk(path.join(OUT, 'notch'));
  for (const [dev, n] of [['iphoneP', 'P'], ['iphoneL', 'L']]) for (const lang of ['en', 'vi']) {
    const { ctx, page } = await open(dev, `age=6&lang=${lang}`, { notch: n });
    await sleep(500);
    await shot(page, path.join(dir, `${dev}-${lang}-title.png`));
    await page.evaluate(() => { PG.UI.refreshSettings(); PG.UI.only('scrSettings'); }); await sleep(450);
    await shot(page, path.join(dir, `${dev}-${lang}-settings.png`));
    await page.evaluate(() => PG.UI.only('scrTitle'));
    await toMidRound(page, 2);
    await shot(page, path.join(dir, `${dev}-${lang}-round.png`));
    const ins = await page.evaluate(() => ({ ins: PG.debug.world.layout.ins, hud: document.getElementById('hud').getBoundingClientRect().toJSON(), bubble: document.getElementById('bubble').getBoundingClientRect().toJSON() }));
    fs.appendFileSync(path.join(dir, 'insets.jsonl'), JSON.stringify({ dev, lang, ...ins }) + '\n');
    await page.evaluate(() => { PG.debug.setSpeed(1); PG.debug.world._startTalk(); }); await sleep(800);
    await shot(page, path.join(dir, `${dev}-${lang}-talk.png`));
    await page.evaluate(() => { const w = PG.debug.world; w.level = w.levels.length - 1; w._levelDone(); PG.debug.setSpeed(6); });
    await page.waitForFunction(() => PG.debug.mode === 'done', null, { timeout: 20000 });
    await page.evaluate(() => PG.debug.setSpeed(1)); await sleep(1300);
    await shot(page, path.join(dir, `${dev}-${lang}-done.png`));
    await ctx.close();
  }
  console.log('notch done');
}

/* Later rounds (past the all-right warm-up): mixed right/wrong colours/shapes, count basket filling up */
async function extra() {
  const dir = mk(path.join(OUT, 'extra'));
  const plan = [['iphoneP', 3, 0], ['iphoneL', 4, 0], ['ipadL', 4, 1], ['iphoneP', 5, 0], ['ipadP', 4, 2], ['iphoneL', 6, 3], ['ipadL', 3, 2]];
  for (const [dev, age, lv] of plan) for (const rd of [2, 4]) {
    const { ctx, page } = await open(dev, `age=${age}&lang=en&level=${lv}`, { seed: 11 + rd });
    await page.evaluate(() => { PG.debug.startGame(); PG.debug.setSpeed(6); });
    await page.waitForFunction(() => PG.debug.world.state === 'round');
    await page.evaluate(rd => { const w = PG.debug.world; w.round = rd; w._beginRound(); }, rd);
    // let the bot catch a couple so the basket shows items inside
    await page.evaluate(() => { PG.debug.setBot(true, 1); PG.debug.setSpeed(3); });
    await page.waitForFunction(() => { const w = PG.debug.world; return w.basket.count >= Math.min(2, w.basket.need - 1) || w.state !== 'round'; }, null, { timeout: 40000, polling: 30 }).catch(() => {});
    await page.evaluate(() => PG.debug.setBot(false));
    await page.waitForFunction(() => { const w = PG.debug.world; return w.state !== 'round' || w.items.filter(i => i.state === 'fall').length >= 2; }, null, { timeout: 20000, polling: 30 }).catch(() => {});
    await freeze(page); await sleep(100);
    const tag = `${dev}-a${age}-L${lv}-r${rd}`;
    await shot(page, path.join(dir, `${tag}.png`));
    const info = await page.evaluate(() => { const w = PG.debug.world; return { topic: w.topic, state: w.state, count: w.basket.count, need: w.basket.need,
      pool: (w.cur.pool || []).map(p => p.color || p.sprite || p.text) }; });
    fs.appendFileSync(path.join(dir, 'extra.jsonl'), JSON.stringify({ tag, ...info }) + '\n');
    await ctx.close();
  }
  console.log('extra done');
}

/* DOM geometry: bubble vs HUD overlap, text overflow, talk choices size, title bubbles vs logo/Play */
async function measure() {
  const f = path.join(OUT, 'measure.jsonl'); try { fs.unlinkSync(f); } catch (e) {}
  for (const dev of Object.keys(DEV)) for (const lang of ['en', 'vi']) for (const age of [3, 5, 7]) {
    const { ctx, page } = await open(dev, `age=${age}&lang=${lang}`);
    const title = await page.evaluate(() => { const R = s => document.querySelector(s).getBoundingClientRect().toJSON(); return { logo: R('.logo'), play: R('#btnPlay'), tagline: R('#tagline'), info: R('.title-info'), top: R('.title-top') }; });
    const rounds = [];
    for (let lv = 0; lv < 4; lv++) {
      await toMidRound(page, lv, lv === 0);
      rounds.push(await page.evaluate(() => {
        const R = id => document.getElementById(id).getBoundingClientRect(), b = R('bubble'), h = R('hud'), bt = document.getElementById('bubbleText'), be = document.getElementById('bubble');
        return { topic: PG.debug.world.topic, text: bt.textContent, font: bt.style.fontSize, bubble: [b.left, b.top, b.right, b.bottom].map(Math.round), hud: [h.left, h.top, h.right, h.bottom].map(Math.round),
          overlapHud: !(b.right <= h.left || b.bottom <= h.top || b.top >= h.bottom || b.left >= h.right),
          overflow: be.scrollHeight > be.clientHeight + 1 || be.scrollWidth > be.clientWidth + 1 || bt.scrollWidth > be.clientWidth };
      }));
    }
    await page.evaluate(() => { PG.debug.setSpeed(1); PG.debug.world._startTalk(); }); await sleep(600);
    const talk = await page.evaluate(() => {
      const p = document.querySelector('.talk-panel'), pr = p.getBoundingClientRect();
      const ch = [...document.querySelectorAll('#talkChoices button')].map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; });
      return { panel: [pr.left, pr.top, pr.right, pr.bottom].map(Math.round), scroll: p.scrollHeight > p.clientHeight + 1, choices: ch, q: document.getElementById('talkQ').textContent, vh: innerHeight, vw: innerWidth };
    });
    fs.appendFileSync(f, JSON.stringify({ dev, lang, age, title, rounds, talk }) + '\n');
    await ctx.close();
  }
  console.log('measure done');
}

(async () => {
  srv = await serve(); browser = await chromium.launch();
  mk(OUT);
  try {
    if (on('screens')) await screens();
    if (on('moods')) await moods();
    if (on('topics')) { try { fs.unlinkSync(path.join(OUT, 'topics', 'layout.jsonl')); } catch (e) {} await topics(); }
    if (on('pip')) await pip();
    if (on('notch')) { try { fs.unlinkSync(path.join(OUT, 'notch', 'insets.jsonl')); } catch (e) {} await notch(); }
    if (on('measure')) await measure();
    if (on('extra')) { try { fs.unlinkSync(path.join(OUT, 'extra', 'extra.jsonl')); } catch (e) {} await extra(); }
  } catch (e) { console.error(e); process.exitCode = 1; }
  await browser.close(); srv.close();
})();
