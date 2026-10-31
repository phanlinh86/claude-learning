// Visual QA capture for Owlet's Snow Garden: every screen x device x language, times of day, every topic x age,
// planting/bloom layering, Lumi frames, notch insets, motion sheets.
//   node tests/visual/capture.js [section ...]   sections: screens moods topics bloom lumi notch motion  (default: all)
// Output: tests/out/visual/**.png (+ layout.jsonl / bloom.jsonl measurements). Montages: sh tests/visual/sheets.sh
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
const AGE_TOPICS = { 3: ['colors', 'size', 'shapes', 'animals'], 4: ['colors', 'shapes', 'count', 'animals'],
  5: ['shapes', 'count', 'letters', 'animals'], 6: ['lower', 'initial', 'add', 'count'], 7: ['initial', 'add', 'sub', 'oddeven'] };
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
      ? ':root{--sa-t:59px !important;--sa-b:34px !important}#safeProbe{padding:59px 0 34px 0 !important}'
      : ':root{--sa-l:59px !important;--sa-r:59px !important;--sa-b:21px !important}#safeProbe{padding:0 59px 21px 59px !important}';
    await page.addInitScript(c => { document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = c; document.head.appendChild(s); }); }, css);
  }
  await page.goto(srv.url + '?mute=1&novoice=1&seed=' + (opts.seed || 5) + '&' + q);
  await page.waitForFunction(() => window.SG && SG.debug && SG.debug.mode === 'title', null, { timeout: 20000 });
  await sleep(500);
  if (opts.notch) await page.evaluate(n => {   // overlay unsafe zones (Dynamic Island + home bar) so they show in shots
    const add = st => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;z-index:999;pointer-events:none;' + st; document.body.appendChild(d); };
    if (n === 'P') { add('left:0;right:0;top:0;height:59px;background:rgba(255,0,0,.18)'); add('left:50%;top:11px;width:126px;height:37px;margin-left:-63px;border-radius:20px;background:#000');
      add('left:0;right:0;bottom:0;height:34px;background:rgba(255,0,0,.18)'); add('left:50%;bottom:8px;width:140px;height:5px;margin-left:-70px;border-radius:3px;background:#000'); }
    else { add('left:0;top:0;bottom:0;width:59px;background:rgba(255,0,0,.18)'); add('left:11px;top:50%;width:37px;height:126px;margin-top:-63px;border-radius:20px;background:#000');
      add('right:0;top:0;bottom:0;width:59px;background:rgba(255,0,0,.18)'); add('left:0;right:0;bottom:0;height:21px;background:rgba(255,0,0,.18)');
      add('left:50%;bottom:8px;width:200px;height:5px;margin-left:-100px;border-radius:3px;background:#000'); }
  }, opts.notch);
  return { ctx, page };
}
// start a game and jump to (level, topic); wait until the round is interactive, then slow time to ~freeze
async function toRound(page, level = 0, topic = null, roundIdx = 1) {
  await page.evaluate(([level, topic, ri]) => {
    SG.debug.startGame();
    const w = SG.debug.world;
    if (topic) w.levels[level] = topic;
    w.startLevel(level);
    w.round = ri;                       // skip the warm-up round (more seeds = harder layout)
    SG.debug.weather.setWeather(level, { instant: true });
    SG.debug.setSpeed(6);
  }, [level, topic, roundIdx]);
  await page.waitForFunction(() => { const w = SG.debug.world; return w.state === 'round' && w.interactive && w.items.every(i => i.state === 'idle'); }, null, { timeout: 20000 });
  await page.evaluate(() => SG.debug.setSpeed(1));
  await sleep(700);
  await page.evaluate(() => SG.debug.setSpeed(0.1));
  await sleep(150);
}
// plant every seed (or the first k) into its goal pot instantly via the world's pointer API
const plantAll = (page, k = 999) => page.evaluate(k => {
  const w = SG.debug.world; let n = 0;
  for (let guard = 0; guard < 60 && n < k && w.interactive; guard++) {
    const it = w.items.find(i => i.state === 'idle' && w.goalOf(i)); if (!it) break;
    w.pointerDown(it.x, it.y);
    const h = w.itemById(w.held); if (!h) { w.update(0.1); continue; }
    const goal = w.goalOf(h); if (!goal) { w.cancelDrag(); w.update(0.6); continue; }
    const b = w.basketById(goal);
    w.update(0.05); w.pointerMove(b.x, b.top - 30); w.update(0.4); w.pointerUp(b.x, b.top - 30); w.update(0.02);
    n++;
  }
  return n;
}, k);
const shot = (page, f) => page.screenshot({ path: f });
const geom = page => page.evaluate(() => {
  const w = SG.debug.world, v = SG.debug.view(), L = w.layout;
  const R = id => { const e = document.getElementById(id); if (!e || e.offsetParent === null) return null; const b = e.getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) }; };
  return { W: L.W, H: L.H, s: +v.s.toFixed(3), ins: L.ins, groundY: L.groundY, play: w.playRect, shrink: w.packShrink, ok: w.packOk,
    items: w.items.map(i => ({ x: Math.round(i.x), y: Math.round(i.y), s: Math.round(i.size * (i.scale || 1)), text: i.text, color: i.color || i.flower, sprite: i.sprite, shape: i.shape })),
    baskets: w.baskets.map(b => ({ x: Math.round(b.x), top: Math.round(b.top), w: Math.round(b.w), h: Math.round(b.h), label: b.label, need: b.need, slots: b.slots.length, stemH: Math.round(b.stemH), flowerSize: Math.round(b.flowerSize), slotXs: b.slots.map(s => Math.round(s.x)), slotStem: b.slots.map(s => +(s.stem || 1).toFixed(2)) })),
    lumi: L.lumi, bubble: R('bubble'), hud: R('hud'), vw: innerWidth, vh: innerHeight };
});

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
    await page.evaluate(() => { SG.debug.startGame(); });
    await sleep(550);
    await page.evaluate(() => SG.debug.setSpeed(0.1));
    await sleep(100);
    await shot(page, path.join(dir, `${tag}-03-banner.png`));
    await page.evaluate(() => SG.debug.setSpeed(6));
    await page.waitForFunction(() => { const w = SG.debug.world; return w.state === 'round' && w.interactive && w.items.every(i => i.state === 'idle'); });
    await page.evaluate(() => SG.debug.setSpeed(1)); await sleep(600);
    await page.evaluate(() => SG.debug.setSpeed(0.1)); await sleep(100);
    await shot(page, path.join(dir, `${tag}-04-round.png`));
    await page.click('#btnPause'); await sleep(450);
    await shot(page, path.join(dir, `${tag}-05-pause.png`));
    await page.click('#btnResume'); await sleep(200);
    // plant one seed, freeze mid-bloom (petals opening)
    await page.evaluate(() => SG.debug.setSpeed(1));
    await plantAll(page, 1);
    await page.waitForFunction(() => SG.debug.world.items.some(i => i.state === 'in' && i.grow > 0.62), null, { timeout: 8000 });
    await page.evaluate(() => SG.debug.setSpeed(0.1)); await sleep(80);
    await shot(page, path.join(dir, `${tag}-06-blooming.png`));
    await page.evaluate(() => SG.debug.setSpeed(1));
    await plantAll(page);
    await page.waitForFunction(() => SG.debug.world.state === 'roundDone', null, { timeout: 10000 });
    await sleep(300);
    await page.evaluate(() => SG.debug.setSpeed(0.1)); await sleep(80);
    await shot(page, path.join(dir, `${tag}-07-rounddone.png`));
    await page.evaluate(() => { SG.debug.setSpeed(1); SG.debug.world._startTalk(); });
    await sleep(700);
    await shot(page, path.join(dir, `${tag}-08-talk.png`));
    await page.evaluate(() => { const w = SG.debug.world; w.talkAnswer(w.talk.answerId); SG.debug.setSpeed(0.1); });
    await sleep(500);
    await shot(page, path.join(dir, `${tag}-09-talk-right.png`));
    await page.evaluate(() => { SG.debug.setSpeed(1); SG.debug.world._levelDone(); });
    await sleep(700);
    await page.evaluate(() => SG.debug.setSpeed(0.1)); await sleep(80);
    await shot(page, path.join(dir, `${tag}-10-leveldone.png`));
    // next chapter banner (long Vietnamese topic names)
    await page.evaluate(() => { SG.debug.setSpeed(1); const w = SG.debug.world; w.startLevel(2); });
    await sleep(500); await page.evaluate(() => SG.debug.setSpeed(0.1)); await sleep(80);
    await shot(page, path.join(dir, `${tag}-11-banner2.png`));
    await page.evaluate(() => { const w = SG.debug.world; w.level = w.levels.length - 1; w._levelDone(); SG.debug.setSpeed(6); });
    await page.waitForFunction(() => SG.debug.mode === 'done', null, { timeout: 20000 });
    await page.evaluate(() => SG.debug.setSpeed(1)); await sleep(1500);
    await shot(page, path.join(dir, `${tag}-12-done.png`));
    await ctx.close();
    console.log('screens', tag);
  }
}

// all 4 times of day, colour rounds at age 3 and 5 (4 colours), plus planted flowers
async function moods() {
  const dir = mk(path.join(OUT, 'moods'));
  for (const dev of ['iphoneL', 'iphoneP', 'ipadL', 'ipadP']) for (const age of [3, 5]) for (let lv = 0; lv < 4; lv++) {
    const { ctx, page } = await open(dev, `age=${age}&lang=en`);
    await toRound(page, lv, 'colors');
    await shot(page, path.join(dir, `${dev}-a${age}-L${lv}-colors.png`));
    if (age === 5) {
      await page.evaluate(() => SG.debug.setSpeed(1));
      await plantAll(page, 3);
      await sleep(1600);
      await page.evaluate(() => SG.debug.setSpeed(0.1)); await sleep(80);
      await shot(page, path.join(dir, `${dev}-a${age}-L${lv}-flowers.png`));
    }
    await ctx.close();
  }
  console.log('moods done');
}

async function topics() {
  const dir = mk(path.join(OUT, 'topics'));
  const plan = [['iphoneL', 'en'], ['iphoneP', 'vi'], ['ipadP', 'en'], ['ipadL', 'vi']];
  for (const [dev, lang] of plan) for (const age of [3, 4, 5, 6, 7]) for (const topic of AGE_TOPICS[age]) {
    const { ctx, page } = await open(dev, `age=${age}&lang=${lang}`);
    await toRound(page, 3, topic, 2);       // level 3 = starry night (worst case for contrast)
    await shot(page, path.join(dir, `${dev}-${lang}-a${age}-${topic}.png`));
    fs.appendFileSync(path.join(dir, 'layout.jsonl'), JSON.stringify({ dev, lang, topic, age, ...(await geom(page)) }) + '\n');
    await ctx.close();
  }
  console.log('topics done');
}

// planting layering: everything planted and fully bloomed; mid-grow; biggest planters (10–12 holes)
async function bloom() {
  const dir = mk(path.join(OUT, 'bloom'));
  const cases = [['colors', 3], ['colors', 5], ['size', 3], ['shapes', 5], ['animals', 5], ['letters', 5], ['add', 7], ['oddeven', 7], ['count', 5], ['count', 7]];
  for (const dev of Object.keys(DEV)) for (const [topic, age] of cases) {
    const { ctx, page } = await open(dev, `age=${age}&lang=en`);
    await toRound(page, 1, topic, 2);
    if (topic === 'count') {   // re-roll until the planter has ≥ 10 holes
      await page.evaluate(() => { const w = SG.debug.world; for (let i = 0; i < 40 && w.baskets[0].need < 10; i++) { w.round = 2; w._beginRound(); } SG.debug.setSpeed(6); });
      await page.waitForFunction(() => SG.debug.world.items.every(i => i.state === 'idle'), null, { timeout: 10000 });
    }
    // half planted, then freeze mid-growth of the last one
    await page.evaluate(() => SG.debug.setSpeed(1));
    const total = await page.evaluate(() => SG.debug.world.items.length);
    await plantAll(page, Math.max(1, Math.floor(total / 2)));
    await sleep(1600);
    await plantAll(page, 1);
    await sleep(380);
    await page.evaluate(() => SG.debug.setSpeed(0.1)); await sleep(80);
    await shot(page, path.join(dir, `${dev}-${topic}-a${age}-half.png`));
    fs.appendFileSync(path.join(dir, 'bloom.jsonl'), JSON.stringify({ dev, topic, age, ...(await geom(page)) }) + '\n');
    await page.evaluate(() => SG.debug.setSpeed(1));
    await plantAll(page);
    await page.waitForFunction(() => { const w = SG.debug.world; return w.state === 'roundDone' || w.items.filter(i => i.state === 'in').every(i => i.grow >= 1); }, null, { timeout: 10000 });
    await page.evaluate(() => SG.debug.setSpeed(0.1)); await sleep(80);
    await shot(page, path.join(dir, `${dev}-${topic}-a${age}-full.png`));
    await ctx.close();
  }
  console.log('bloom done');
}

// Lumi frames at in-game size (crop around Lumi), on morning and night
async function lumi() {
  const dir = mk(path.join(OUT, 'lumi'));
  for (const dev of ['iphoneL', 'iphoneP', 'ipadL']) for (const lv of [0, 3]) {
    const { ctx, page } = await open(dev, 'age=4&lang=en');
    await toRound(page, lv, 'colors');
    for (const f of ['idle', 'talk', 'blink', 'happy', 'cheer', 'think', 'oops']) {
      const clip = await page.evaluate(f => {
        const r = SG.render, w = SG.debug.world, L = w.layout.lumi, v = SG.debug.view();
        r._lumi = function () { this._character('lumi_' + f, L.x, L.y, L.h, 1, L.y, 0); };
        const box = L.h * 1.4;
        return { x: Math.max(0, v.left + (L.x - box * 0.6) * v.s), y: Math.max(0, v.top + (L.y - box) * v.s), width: box * 1.2 * v.s, height: box * 1.08 * v.s };
      }, f);
      await sleep(120);
      await page.screenshot({ path: path.join(dir, `${dev}-L${lv}-${f}.png`), clip });
    }
    await ctx.close();
  }
  console.log('lumi done');
}

async function notch() {
  const dir = mk(path.join(OUT, 'notch'));
  for (const [dev, n] of [['iphoneP', 'P'], ['iphoneL', 'L']]) for (const lang of ['en', 'vi']) {
    const { ctx, page } = await open(dev, `age=5&lang=${lang}`, { notch: n });
    await shot(page, path.join(dir, `${dev}-${lang}-title.png`));
    await toRound(page, 0, 'animals');
    await shot(page, path.join(dir, `${dev}-${lang}-round.png`));
    fs.appendFileSync(path.join(dir, 'notch.jsonl'), JSON.stringify({ dev, lang, ...(await geom(page)) }) + '\n');
    await page.evaluate(() => { SG.debug.setSpeed(1); SG.debug.world._startTalk(); }); await sleep(700);
    await shot(page, path.join(dir, `${dev}-${lang}-talk.png`));
    await page.evaluate(() => SG.UI.only()); await page.click('#btnPause').catch(() => {}); await sleep(400);
    await shot(page, path.join(dir, `${dev}-${lang}-pause.png`));
    await page.evaluate(() => { const w = SG.debug.world; w.level = w.levels.length - 1; w._levelDone(); SG.debug.setSpeed(6); });
    await page.waitForFunction(() => SG.debug.mode === 'done', null, { timeout: 20000 }).catch(() => {});
    await page.evaluate(() => SG.debug.setSpeed(1)); await sleep(1200);
    await shot(page, path.join(dir, `${dev}-${lang}-done.png`));
    await ctx.close();
  }
  console.log('notch done');
}

/* Motion contact sheet: the grow/bloom animation, frames every 50 ms of game time around one pot. */
async function motion() {
  const dir = mk(path.join(OUT, 'motion'));
  const { ctx, page } = await open('iphoneL', 'age=3&lang=en', { dpr: 2 });
  await toRound(page, 0, 'colors');
  const frames = await page.evaluate(() => new Promise(res => {
    const w = SG.debug.world, cv = document.getElementById('game'), it = w.items[0], b = w.basketById(w.goalOf(it));
    const crop = { x: b.x - b.w * 0.8, y: b.top - b.w * 1.1, w: b.w * 1.6, h: b.w * 1.1 + b.h + 10 };
    SG.debug.setSpeed(0.25);
    w.pointerDown(it.x, it.y); w.update(0.05); w.pointerMove(b.x, b.top - 30); w.update(0.4); w.pointerUp(b.x, b.top - 30);
    const out = [], t0 = w.time; let next = 0;
    (function tick() {
      const t = w.time - t0;
      if (t >= next) { const rs = cv.width / w.layout.W; const c = document.createElement('canvas'); c.width = 300; c.height = Math.round(300 * crop.h / crop.w);
        c.getContext('2d').drawImage(cv, crop.x * rs, crop.y * rs, crop.w * rs, crop.h * rs, 0, 0, c.width, c.height);
        out.push({ t: Math.round(t * 1000), url: c.toDataURL('image/png') }); next += 0.05; }
      if (t < 1.8) requestAnimationFrame(tick); else res(out);
    })();
  }));
  const d = mk(path.join(dir, 'grow')); fs.readdirSync(d).forEach(f => fs.unlinkSync(path.join(d, f)));
  frames.forEach((f, i) => fs.writeFileSync(path.join(d, `${String(i).padStart(3, '0')}_${f.t}ms.png`), Buffer.from(f.url.split(',')[1], 'base64')));
  console.log('motion grow', frames.length);
  await ctx.close();
}

(async () => {
  srv = await serve(); browser = await chromium.launch();
  mk(OUT);
  try {
    if (on('screens')) await screens();
    if (on('moods')) await moods();
    if (on('topics')) { try { fs.unlinkSync(path.join(OUT, 'topics', 'layout.jsonl')); } catch (e) {} await topics(); }
    if (on('bloom')) { try { fs.unlinkSync(path.join(OUT, 'bloom', 'bloom.jsonl')); } catch (e) {} await bloom(); }
    if (on('lumi')) await lumi();
    if (on('notch')) { try { fs.unlinkSync(path.join(OUT, 'notch', 'notch.jsonl')); } catch (e) {} await notch(); }
    if (on('motion')) await motion();
  } catch (e) { console.error(e); process.exitCode = 1; }
  await browser.close(); srv.close();
})();
