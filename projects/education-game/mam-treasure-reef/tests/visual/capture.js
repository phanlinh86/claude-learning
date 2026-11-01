// Visual QA capture for Mầm's Treasure Reef: every screen × 4 viewports × 2 languages, play rounds (dig / drag / count /
// ask / letters), 4 times of day, Talk time at ages 3/5/7, notch + home-indicator insets, plus DOM/world geometry
// measurements for the report.
//   node tests/visual/capture.js [section ...]     sections: screens play tod notch   (default: all)
// Output: tests/out/visual/<device>-<lang>-<screen>.png, tests/out/visual/measure.jsonl (one JSON line per shot),
//         tests/out/visual/items.jsonl (item/mound CSS rects + palette colours, for contrast.py).
// Contact sheets: python3 -I tests/visual/sheets.py      CVD: python3 -I tests/visual/colorblind.py <png…>
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const OUT = path.join(__dirname, '..', 'out', 'visual');
fs.mkdirSync(OUT, { recursive: true });
const DEV = {
  iphoneP: { viewport: { width: 393, height: 852 }, dpr: 3 },
  iphoneL: { viewport: { width: 852, height: 393 }, dpr: 3 },
  ipadP: { viewport: { width: 820, height: 1180 }, dpr: 2 },
  ipadL: { viewport: { width: 1180, height: 820 }, dpr: 2 }
};
const LANGS = ['en', 'vi'];
const want = process.argv.slice(2);
const on = s => !want.length || want.includes(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MEAS = fs.createWriteStream(path.join(OUT, 'measure.jsonl'), { flags: want.length ? 'a' : 'w' });
const ITEMS = fs.createWriteStream(path.join(OUT, 'items.jsonl'), { flags: want.length ? 'a' : 'w' });
const errors = [];

let srv, browser;
async function open(dev, lang, opts = {}) {
  const d = DEV[dev];
  const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => { errors.push(`${dev} ${lang} pageerror ${String(e)}`); console.log('  pageerror', dev, lang, String(e)); });
  page.on('console', m => { if (m.type() === 'error') errors.push(`${dev} ${lang} console ${m.text()}`); });
  if (opts.notch) {
    const css = opts.notch === 'P'
      ? ':root{--sa-t:59px !important;--sa-b:34px !important}'
      : ':root{--sa-l:59px !important;--sa-r:59px !important;--sa-b:21px !important}';
    await page.addInitScript(c => { document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.id = 'notchCss'; s.textContent = c; document.head.appendChild(s); }); }, css);
  }
  await page.goto(srv.url + `?mute=1&novoice=1&profile=test&seed=${opts.seed || 5}&lang=${lang}` + (opts.age ? `&age=${opts.age}` : ''));
  await page.waitForFunction(() => window.TR && TR.debug && TR.debug.mode === 'title', null, { timeout: 20000 });
  await sleep(400);
  if (opts.notch) await page.evaluate(n => {   // overlay the unsafe zones (Dynamic Island + home bar) so they show in the shots
    const add = st => { const d = document.createElement('div'); d.className = 'qa-overlay'; d.style.cssText = 'position:fixed;z-index:999;pointer-events:none;' + st; document.body.appendChild(d); };
    if (n === 'P') { add('left:0;right:0;top:0;height:59px;background:rgba(255,0,0,.18)'); add('left:50%;top:11px;width:126px;height:37px;margin-left:-63px;border-radius:20px;background:#000');
      add('left:0;right:0;bottom:0;height:34px;background:rgba(255,0,0,.18)'); add('left:50%;bottom:8px;width:140px;height:5px;margin-left:-70px;border-radius:3px;background:#000'); }
    else { add('left:0;top:0;bottom:0;width:59px;background:rgba(255,0,0,.18)'); add('left:11px;top:50%;width:37px;height:126px;margin-top:-63px;border-radius:20px;background:#000');
      add('right:0;top:0;bottom:0;width:59px;background:rgba(255,0,0,.18)'); add('left:0;right:0;bottom:0;height:21px;background:rgba(255,0,0,.18)');
      add('left:50%;bottom:8px;width:200px;height:5px;margin-left:-100px;border-radius:3px;background:#000'); }
  }, opts.notch);
  return { ctx, page };
}

/* ---------- measurement helpers (run in the page) ---------- */
const MEASURE_FN = () => {
  const R = el => { const b = el.getBoundingClientRect(); return { l: +b.left.toFixed(1), t: +b.top.toFixed(1), r: +b.right.toFixed(1), b: +b.bottom.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
  const vis = el => { if (!el) return false; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && el.closest('.hidden') == null; };
  const vw = innerWidth, vh = innerHeight;
  const out = { vw, vh, buttons: [], smallText: [], overflow: [], offscreen: [] };
  // every visible button / chip / card: touch size ≥ 44 css px
  document.querySelectorAll('button, input[type=range], input[type=checkbox], label.toggle').forEach(el => {
    if (!vis(el)) return;
    const r = R(el), txt = (el.textContent || el.getAttribute('aria-label') || el.id || el.className).trim().replace(/\s+/g, ' ').slice(0, 40);
    const id = el.id || el.className.toString().split(' ')[0] || el.tagName;
    out.buttons.push({ id, txt, w: r.w, h: r.h });
    if (r.l < -1 || r.t < -1 || r.r > vw + 1 || r.b > vh + 1) out.offscreen.push({ id, txt, ...r });
  });
  // text: font size ≥ 15 px, clipping (scrollWidth > clientWidth with overflow hidden / nowrap) for every visible text-bearing element
  const seen = new Set();
  document.querySelectorAll('#stage *').forEach(el => {
    if (!vis(el) || el.tagName === 'CANVAS' || el.tagName === 'SVG' || el.tagName === 'IMG' || el.tagName === 'PATH') return;
    const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!hasText) return;
    const cs = getComputedStyle(el), fs = parseFloat(cs.fontSize);
    const key = (el.id || el.className || el.tagName) + ':' + el.textContent.trim().slice(0, 30);
    if (seen.has(key)) return; seen.add(key);
    const txt = el.textContent.trim().replace(/\s+/g, ' ').slice(0, 60);
    const id = el.id || (el.className && el.className.toString().split(' ')[0]) || el.tagName.toLowerCase();
    if (fs < 15) out.smallText.push({ id, txt, fs: +fs.toFixed(1) });
    // overflow: content wider / taller than the box (text clipped by overflow hidden or escaping the box)
    const ow = el.scrollWidth - el.clientWidth, oh = el.scrollHeight - el.clientHeight;
    if ((ow > 1 && el.clientWidth > 0) || (oh > 2 && el.clientHeight > 0 && cs.overflowY !== 'auto' && cs.overflowY !== 'scroll' && !el.closest('.scroll')))
      out.overflow.push({ id, txt, ow: +ow.toFixed(1), oh: +oh.toFixed(1), fs: +fs.toFixed(1), cw: el.clientWidth, sw: el.scrollWidth });
    // text escaping its parent's box horizontally (inline-block inside a flex row)
    const p = el.parentElement; if (p && p.id !== 'stage') { const pr = p.getBoundingClientRect(), r = el.getBoundingClientRect(); if (r.right > pr.right + 2 || r.left < pr.left - 2) out.overflow.push({ id, txt, escapes: id, by: +Math.max(r.right - pr.right, pr.left - r.left).toFixed(1) }); }
  });
  // scroll panels: can the Done / Save button be reached (panel content taller than the panel)?
  document.querySelectorAll('.panel').forEach(p => { if (vis(p)) out.panel = { id: p.className, ...R(p), scrollH: p.scrollHeight, clientH: p.clientHeight }; });
  const g = id => { const el = document.getElementById(id); return vis(el) ? R(el) : null; };
  out.hud = g('hud'); out.bubble = g('bubble'); out.mapTop = document.querySelector('.map-top') && vis(document.querySelector('.map-top')) ? R(document.querySelector('.map-top')) : null;
  out.resumeBar = g('resumeBar');
  if (out.bubble) { const b = document.getElementById('bubble'), t = document.getElementById('bubbleText'); out.bubbleFont = parseFloat(getComputedStyle(t).fontSize); out.bubbleScrollH = b.scrollHeight; out.bubbleClientH = b.clientHeight; out.bubbleText = t.textContent; out.bubbleLines = Math.round(t.getBoundingClientRect().height / (parseFloat(getComputedStyle(t).fontSize) * 1.15)); }
  // reef map badges
  const lag = [...document.querySelectorAll('.lagoon')].filter(vis);
  if (lag.length) out.lagoons = lag.map(el => { const b = el.querySelector('b'), img = el.querySelector('img.badge'), st = el.querySelector('.stars'), lk = el.querySelector('.lock'), tr = el.querySelector('.trophy');
    return { id: el.dataset.lagoon, el: R(el), badge: R(img), name: b.textContent, nameBox: R(b), nameFs: parseFloat(getComputedStyle(b).fontSize), lines: Math.round(b.getBoundingClientRect().height / (parseFloat(getComputedStyle(b).fontSize) * 1.05)), stars: st ? R(st) : null, lock: lk ? R(lk) : null, lockNatural: lk ? lk.naturalWidth : null, trophy: tr ? R(tr) : null, trophyNatural: tr ? tr.naturalWidth : null, badgeNatural: img.naturalWidth, locked: el.classList.contains('locked') }; });
  const tslots = [...document.querySelectorAll('.trophy-slot')].filter(vis);
  if (tslots.length) out.trophySlots = tslots.map(d => { const b = d.querySelector('b'), s = d.querySelector('small'), img = d.querySelector('img'); return { ...R(d), name: b.textContent, nameW: b.scrollWidth, cellW: d.clientWidth, lines: Math.round(b.getBoundingClientRect().height / (parseFloat(getComputedStyle(b).fontSize) * 1.2)), imgNatural: img.naturalWidth, imgW: R(img).w }; });
  const choices = [...document.querySelectorAll('#talkChoices button')].filter(vis);
  if (choices.length) out.talkChoices = choices.map(b => ({ txt: b.textContent.trim(), ...R(b), hasCanvas: !!b.querySelector('canvas') }));
  const tp = document.querySelector('.talk-panel'); if (tp && vis(tp)) out.talkPanel = { ...R(tp), scrollH: tp.scrollHeight, clientH: tp.clientHeight };
  const dp = document.querySelector('.done-panel'); if (dp && vis(dp)) out.donePanel = R(dp);
  const logo = document.querySelector('.logo'); if (logo && vis(logo)) { out.logo = { ...R(logo), fs: parseFloat(getComputedStyle(logo).fontSize), l1: R(document.getElementById('logo1')), l2: R(document.getElementById('logo2')), sw: logo.scrollWidth, cw: logo.clientWidth }; }
  // world geometry → CSS px
  const w = TR.debug.world, v = TR.debug.view(), L = w.layout;
  const cssX = x => v.left + x * v.s, cssY = y => v.top + y * v.s;
  out.view = { W: v.W, H: v.H, s: +v.s.toFixed(4), left: +v.left.toFixed(1), top: +v.top.toFixed(1), ins: v.ins };
  out.mode = TR.debug.mode; out.state = w.state; out.topic = w.topic; out.mech = w.mech; out.roundMode = w.cur && w.cur.mode; out.level = w.level;
  if (L && L.tutu) out.tutu = { l: +cssX(L.tutu.x - L.tutu.h * 0.45).toFixed(1), r: +cssX(L.tutu.x + L.tutu.h * 0.45).toFixed(1), t: +cssY(L.tutu.y - L.tutu.h).toFixed(1), b: +cssY(L.tutu.y).toFixed(1) };
  const PR = (w.playRect && w.playRect.w) ? w.playRect : (L && L.play);   // the band the world actually packed into (landscape: playAlt)
  if (PR) out.play = { l: +cssX(PR.x).toFixed(1), t: +cssY(PR.y).toFixed(1), r: +cssX(PR.x + PR.w).toFixed(1), b: +cssY(PR.y + PR.h).toFixed(1), alt: PR !== (L && L.play) };
  if (w.state === 'round' && w.cur) {
    out.items = (w.items || []).map(i => { const s = i.size * (i.scale || 1); return { id: i.id, sprite: i.sprite, shape: i.shape, color: i.color, text: i.text, state: i.state, cx: +cssX(i.x).toFixed(1), cy: +cssY(i.y).toFixed(1), size: +(s * v.s).toFixed(1), sizeLogical: +s.toFixed(1), touchLogical: +(0.6 * s + 14).toFixed(1), mound: i.moundId }; });
    out.chests = (w.baskets || []).map(b => ({ id: b.id, kind: b.kind, label: b.label, l: +cssX(b.x - b.w / 2).toFixed(1), r: +cssX(b.x + b.w / 2).toFixed(1), t: +cssY(b.top).toFixed(1), b: +cssY(b.bottom).toFixed(1), wLogical: b.w }));
    out.mounds = (w.mounds || []).map(m => ({ id: m.id, l: +cssX(m.x - m.w / 2).toFixed(1), r: +cssX(m.x + m.w / 2).toFixed(1), t: +cssY(m.y - m.h).toFixed(1), b: +cssY(m.y).toFixed(1), wLogical: m.w, item: m.itemId, crab: m.crab }));
    out.groundY = +cssY(L.groundY).toFixed(1);
    out.ambient = TR.debug.weather && TR.debug.weather.ambient ? { skyTop: TR.debug.weather.ambient.skyTop, skyBottom: TR.debug.weather.ambient.skyBottom, darkness: TR.debug.weather.ambient.darkness } : null;
    out.weatherLevel = TR.debug.weather ? TR.debug.weather.level : null;
  }
  return out;
};
async function snap(page, dev, lang, name, extra = {}) {
  const f = path.join(OUT, `${dev}-${lang}-${name}.png`);
  await page.screenshot({ path: f });
  const m = await page.evaluate(MEASURE_FN);
  const dpr = DEV[dev].dpr;
  MEAS.write(JSON.stringify({ shot: `${dev}-${lang}-${name}`, dev, lang, name, dpr, ...extra, ...m }) + '\n');
  if (m.items) ITEMS.write(JSON.stringify({ shot: `${dev}-${lang}-${name}`, file: f, dpr, items: m.items, mounds: m.mounds, chests: m.chests, play: m.play, groundY: m.groundY, level: m.level, mech: m.mech, vw: m.vw, vh: m.vh }) + '\n');
  return m;
}

/* ---------- round helpers ---------- */
// start chapter `level` with {topic, mech}, optionally at round index ri; wait until interactive and freeze
async function toRound(page, level, topic, mech, ri = 1, age = null) {
  await page.evaluate(([level, topic, mech, ri, age]) => {
    const w = TR.debug.world;
    if (TR.debug.mode !== 'play') TR.debug.startGame(1);
    if (age) w.age = age;
    if (topic) w.plan[level] = { topic, mech: mech || w.plan[level].mech };
    else if (mech) w.plan[level].mech = mech;
    w.levels = w.plan.map(c => c.topic);
    TR.debug.gotoLevel(level);
    w.round = ri;
    TR.debug.weather.setWeather(level, { instant: true });
    TR.debug.setSpeed(6);
  }, [level, topic, mech, ri, age]);
  await page.waitForFunction(() => { const w = TR.debug.world; return w.state === 'round' && w.interactive && w.items.every(i => i.state === 'idle' || i.state === 'buried'); }, null, { timeout: 20000 });
  await page.evaluate(() => TR.debug.setSpeed(1));
  await sleep(600);
  await page.evaluate(() => TR.debug.setSpeed(0.1));
  await sleep(150);
}
// a round of the wanted mode (count → long chest, ask → animals ask); re-rolls round indices until it matches
async function toRoundMode(page, level, topic, mech, pred, age = null) {
  for (let ri = 1; ri < 6; ri++) {
    await toRound(page, level, topic, mech, ri, age);
    const ok = await page.evaluate(pred);
    if (ok) return true;
  }
  return false;
}
async function seedProgress(page) {
  await page.evaluate(() => { const P = TR.Progress, p = P.current(); P.recordLagoon(p, 1, [11, 12, 13, 7]); P.recordChapter(p, 2, 0, 8, 40); P.setResume(p, { lagoon: 2, level: 1, levelStars: [8, 0, 0, 0], pearls: p.pearls }); });
}

/* ================= sections ================= */
async function screens(dev, lang) {
  const { ctx, page } = await open(dev, lang);
  const S = (n, x) => snap(page, dev, lang, n, x);
  try {
    await S('01-title');
    await page.evaluate(() => { TR.Progress.create({ name: 'Bống Bống', age: 6, avatar: 'crab', sayAs: 'Bong' }); TR.debug.goProfiles(); }); await sleep(400);
    await S('02-profiles');
    await page.evaluate(() => { const l = TR.Progress.list(); TR.Progress.setCurrent(l[0].id); });
    await seedProgress(page);
    await page.evaluate(() => TR.debug.goMap()); await sleep(500);
    await S('03-map');
    await page.click('#btnTreasure'); await sleep(400); await S('04-treasure');
    await page.click('#btnTreasureBack'); await sleep(200);
    await page.evaluate(() => TR.debug.goTitle()); await sleep(200);
    const gear = await page.$('#btnParents'); const bb = await gear.boundingBox();
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await sleep(2300); await page.mouse.up(); await sleep(400);
    await S('05-settings');
    const addBtn = await page.$('#settingsProfiles button:last-child');
    if (addBtn) { await addBtn.click(); await sleep(400); await page.fill('#inpName', lang === 'vi' ? 'Nguyễn Bảo An' : 'Alexander'); await S('06-profile-edit'); await page.click('#btnProfileCancel'); await sleep(200); }
    await page.click('#btnSettingsDone'); await sleep(200);
    // chapter banner (intro state, mid-animation)
    await page.evaluate(() => { TR.debug.setSpeed(1); TR.debug.startGame(1); }); await sleep(700);
    await S('07-banner');
    // dig round (lagoon 1 chapter 0 is dig)
    await toRound(page, 0, 'colors', 'dig', 1);
    await S('08-play-dig');
    await page.evaluate(() => TR.debug.pause()); await sleep(400); await S('09-pause'); await page.evaluate(() => TR.debug.resume());
    await toRound(page, 1, 'shapes', 'drag', 1); await S('10-play-drag');
    const okCount = await toRoundMode(page, 2, 'count', 'drag', () => TR.debug.world.baskets[0].kind === 'long' && TR.debug.world.baskets[0].need >= 3);
    await S('11-play-count-long', { wanted: 'long chest need>=3', ok: okCount });
    const okAsk = await toRoundMode(page, 3, 'animals', 'drag', () => TR.debug.world.cur.mode === 'ask');
    await S('12-play-animals-ask', { wanted: 'ask', ok: okAsk });
    await toRound(page, 1, 'letters', 'drag', 1, 5); await S('13-play-letters-age5');
    await toRound(page, 2, 'letters', 'dig', 1, 5); await S('14-play-dig-letters-age5');
    await toRound(page, 0, 'count', 'dig', 2, 4); await S('15-play-dig-count');
    // Talk time at ages 3 / 5 / 7 (picture choices for ≤ 5); the last one (level 3) ends the lagoon → done screen
    for (const [age, topic, level] of [[3, 'animals', 0], [5, 'count', 1], [5, 'shapes', 2], [7, 'add', 3]]) {
      await page.evaluate(([age, topic, level]) => { const w = TR.debug.world; w.age = age; w.plan[level] = { topic, mech: 'drag' }; w.levels = w.plan.map(c => c.topic); TR.debug.setSpeed(1); TR.debug.gotoLevel(level); w._startTalk(); }, [age, topic, level]);
      await page.waitForFunction(() => TR.debug.mode === 'talk', null, { timeout: 5000 }); await sleep(500);
      await S(`16-talk-age${age}-${topic}`);
      await page.evaluate(() => { const w = TR.debug.world; w.talkAnswer(w.talk.answerId); TR.debug.setSpeed(8); });
      await page.waitForFunction(() => TR.debug.mode === 'play' || TR.debug.mode === 'done', null, { timeout: 10000 });
      await page.evaluate(() => TR.debug.setSpeed(1));
    }
    await page.waitForFunction(() => TR.debug.mode === 'done', null, { timeout: 10000 }); await sleep(900);
    await S('17-done');
    await page.click('#btnDoneMap'); await sleep(500); await S('18-map-after');
  } catch (e) { errors.push(`${dev} ${lang} screens: ${e.message}`); console.log('  ERR screens', dev, lang, e.message); }
  await ctx.close();
}

async function tod(dev) {
  const lang = 'en';
  const { ctx, page } = await open(dev, lang, { age: 5, seed: 7 });
  const S = (n, x) => snap(page, dev, lang, n, x);
  try {
    for (let lv = 0; lv < 4; lv++) { await toRound(page, lv, 'colors', 'dig', 2); await S(`tod${lv}-dig-colors`); }
    for (let lv = 0; lv < 4; lv++) { await toRound(page, lv, 'colors', 'drag', 2); await S(`tod${lv}-drag-colors`); }
    for (let lv = 0; lv < 4; lv++) { await toRound(page, lv, 'shapes', 'drag', 1); await S(`tod${lv}-drag-shapes`); }
    await toRound(page, 3, 'letters', 'drag', 1); await S('tod3-drag-letters');
    await toRound(page, 3, 'animals', 'dig', 2); await S('tod3-dig-animals');
  } catch (e) { errors.push(`${dev} tod: ${e.message}`); console.log('  ERR tod', dev, e.message); }
  await ctx.close();
}

async function notch(dev, lang) {
  const kind = dev.endsWith('P') ? 'P' : 'L';
  const { ctx, page } = await open(dev, lang, { notch: kind });
  const S = (n, x) => snap(page, dev, lang, n, x);
  try {
    await S('notch-title');
    await seedProgress(page);
    await page.evaluate(() => TR.debug.goMap()); await sleep(500); await S('notch-map');
    await toRound(page, 0, 'colors', 'dig', 1); await S('notch-play-dig');
    await toRound(page, 1, 'colors', 'drag', 1); await S('notch-play-drag');
    await toRound(page, 2, 'count', 'drag', 2); await S('notch-play-count');
    await page.evaluate(() => { const w = TR.debug.world; w.age = 4; w.plan[2] = { topic: 'animals', mech: 'drag' }; TR.debug.setSpeed(1); TR.debug.gotoLevel(2); w._startTalk(); });
    await page.waitForFunction(() => TR.debug.mode === 'talk', null, { timeout: 5000 }); await sleep(500); await S('notch-talk');
    await page.evaluate(() => TR.debug.pause()); await sleep(300); await S('notch-pause');
  } catch (e) { errors.push(`${dev} ${lang} notch: ${e.message}`); console.log('  ERR notch', dev, lang, e.message); }
  await ctx.close();
}

(async () => {
  srv = await serve();
  browser = await chromium.launch();
  const t0 = Date.now();
  if (on('screens')) for (const dev of Object.keys(DEV)) for (const lang of LANGS) { console.log('screens', dev, lang); await screens(dev, lang); }
  if (on('tod')) for (const dev of Object.keys(DEV)) { console.log('tod', dev); await tod(dev); }
  if (on('notch')) for (const dev of ['iphoneP', 'iphoneL', 'ipadL']) for (const lang of LANGS) { console.log('notch', dev, lang); await notch(dev, lang); }
  await browser.close(); srv.close();
  MEAS.end(); ITEMS.end();
  fs.writeFileSync(path.join(OUT, 'errors.txt'), errors.join('\n'));
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s, ${errors.length} errors`);
})();
