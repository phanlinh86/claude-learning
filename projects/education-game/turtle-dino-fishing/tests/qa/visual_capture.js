// Visual QA capture (Tibo's Dino Lake Fishing) — screenshots of every screen and every catch phase × 4 device shapes × EN / VI
// with notch insets emulated (CSS --sa-* overrides read by #safeProbe → main.js computes the same `ins` as on a real device),
// every topic at ages 3–7, all 4 moods, every critter, plus numeric checks read from the game canvas (answer colour vs the
// water behind each fish, rod/line/hook geometry, overlaps with the DOM bubble / HUD, lily spacing).
//   node tests/qa/visual_capture.js                 (everything)
//   ONLY=iphone-p node tests/qa/visual_capture.js   (one device)   PASSES=screens,topics,contrast,critters
// Writes PNGs + layout.json + contrast.json + geometry.json + errors.json to tests/out/visual/.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const OUT = path.join(__dirname, '..', 'out', 'visual'); fs.mkdirSync(OUT, { recursive: true });

// notch insets in CSS px (iPhone 15/16 portrait 47–59 top / 34 home bar; landscape 59 L+R, 21 home bar; iPad 24 / 20)
const VPS = [
  { name: 'iphone-p', w: 393, h: 852, dpr: 3, sa: { t: 47, r: 0, b: 34, l: 0 } },
  { name: 'iphone-l', w: 852, h: 393, dpr: 3, sa: { t: 0, r: 59, b: 21, l: 59 } },
  { name: 'ipad-p', w: 820, h: 1180, dpr: 2, sa: { t: 24, r: 0, b: 20, l: 0 } },
  { name: 'ipad-l', w: 1180, h: 820, dpr: 2, sa: { t: 24, r: 0, b: 20, l: 0 } }
].filter(v => !process.env.ONLY || process.env.ONLY.split(',').includes(v.name));
const PASSES = (process.env.PASSES || 'screens,topics,contrast,critters').split(',');
const TOPICS = { 3: ['colors', 'shapes', 'size', 'animals'], 4: ['colors', 'shapes', 'count', 'animals'],
  5: ['shapes', 'count', 'letters', 'animals'], 6: ['lower', 'initial', 'add', 'count'], 7: ['initial', 'add', 'sub', 'oddeven'] };
const ANSWER = { red: '#E84A4A', blue: '#3C8DE8', yellow: '#FFD23F', green: '#4CC26B', orange: '#FF9A2E', purple: '#8E44AD', pink: '#FF8FC0' };
const MOODS = ['morning', 'noon', 'sunset', 'night'];

const errors = [];
async function newPage(browser, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.dpr, isMobile: true, hasTouch: true });
  await ctx.addInitScript(sa => {
    document.addEventListener('DOMContentLoaded', () => {
      const s = document.createElement('style');
      s.textContent = `:root{--sa-t:${sa.t}px !important;--sa-r:${sa.r}px !important;--sa-b:${sa.b}px !important;--sa-l:${sa.l}px !important}
        .qa-notch{position:fixed;pointer-events:none;z-index:9999;background:rgba(0,0,0,.85)}`;
      document.head.appendChild(s);
    }, { capture: true });
  }, vp.sa);
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(vp.name + ' pageerror: ' + e));
  page.on('console', m => { if (m.type() === 'error') errors.push(vp.name + ' console: ' + m.text()); });
  return { ctx, page };
}
/** draw the Dynamic Island + home indicator so the screenshots show what is under them */
async function notch(page, vp) {
  await page.evaluate(([vp]) => {
    document.querySelectorAll('.qa-notch').forEach(e => e.remove());
    const add = css => { const d = document.createElement('div'); d.className = 'qa-notch'; d.style.cssText = css; document.body.appendChild(d); };
    if (vp.name === 'iphone-p') { add('left:50%;top:11px;width:126px;height:37px;margin-left:-63px;border-radius:19px'); add('left:50%;bottom:8px;width:134px;height:5px;margin-left:-67px;border-radius:3px'); }
    if (vp.name === 'iphone-l') { add('left:11px;top:50%;width:37px;height:126px;margin-top:-63px;border-radius:19px'); add('left:50%;bottom:6px;width:200px;height:5px;margin-left:-100px;border-radius:3px'); }
    if (vp.name.startsWith('ipad')) add('left:50%;bottom:6px;width:300px;height:5px;margin-left:-150px;border-radius:3px');
  }, [vp]);
}
async function boot(page, vp, url, q) {
  await page.goto(url + '?mute=1&novoice=1&' + q);
  await page.waitForFunction(() => window.TL && TL.debug && TL.debug.mode === 'title' && TL.debug.world, null, { timeout: 30000 });
  await page.waitForTimeout(300);
  await notch(page, vp);
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + '.png') }).catch(e => errors.push('shot ' + name + ': ' + e));
const READY = () => { const w = TL.debug.world, a = TL.debug.answer(); return w.interactive && a && a.member != null && w.members.length && w.members.every(m => m.state === 'swim'); };
const waitFn = (page, fn, arg, t = 30000) => page.waitForFunction(fn, arg, { timeout: t, polling: 'raf' }).then(() => true).catch(e => { errors.push('wait: ' + String(fn).slice(0, 90) + ' ' + e.message.split('\n')[0]); return false; });
async function waitReady(page, t = 40000) {
  await page.evaluate(() => TL.debug.setSpeed(4));
  await waitFn(page, READY, null, t);
  await page.evaluate(() => TL.debug.setSpeed(1));
  await page.waitForTimeout(450);
}
/** start chapter lv with topic t (round index r: more fish), wait for the open question */
async function chapter(page, t, lv, r = 0, instant = true) {
  await page.evaluate(([t, lv, r, instant]) => {
    const w = TL.debug.world; TL.debug.setBot(false); TL.debug.setSpeed(1);
    w.levels[lv] = t; w._surpriseRound = 99; w.startLevel(lv); if (r) w.round = r;
    if (instant) TL.debug.weather.setWeather(lv % 4, { instant: true });
  }, [t, lv, r, instant]);
  await waitReady(page);
}
const tapTarget = page => page.evaluate(() => { const w = TL.debug.world, m = w.memberById(TL.debug.answer().member); w.pointerDown(m.x, m.y); w.pointerUp(m.x, m.y); });
const freeze = page => page.evaluate(() => TL.debug.setSpeed(0.1));
const go = (page, s = 1) => page.evaluate(s => TL.debug.setSpeed(s), s);

/** geometry of the catch at this moment: rod tip vs line start, hook vs mouth, fish vs bubble / HUD (logical px) */
async function geom(page) {
  return page.evaluate(() => {
    const w = TL.debug.world, L = w.layout, v = TL.debug.view(), ln = w.line;
    const r = id => { const e = document.getElementById(id); if (!e || e.classList.contains('hidden')) return null; const b = e.getBoundingClientRect(); const op = getComputedStyle(e).opacity;
      return { x: Math.round((b.x - v.left) / v.s), y: Math.round((b.y - v.top) / v.s), w: Math.round(b.width / v.s), h: Math.round(b.height / v.s), op: +op }; };
    const tip = TL.World.rodTip(L.rodBase, L.rodLen, ln.rodAngle, ln.bend);
    const f = w.members.find(m => m.id === ln.id) || w.members.find(m => m.target);
    const mouth = f ? w.mouthOf(f) : null;
    const s = f ? L.size * (f.thing.big === false ? 0.6 : 1) : 0;
    const fbox = f ? { x: Math.round(f.x - 0.75 * s), y: Math.round(f.y - 0.5 * s), w: Math.round(1.5 * s), h: Math.round(s) } : null;
    const B = r('bubble'), H = r('hud');
    const ov = (a, b) => a && b ? Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)) : 0;
    return { phase: w.phase, state: w.state, line: { state: ln.state, tip: [Math.round(ln.tip.x), Math.round(ln.tip.y)], tipFormula: [Math.round(tip.x), Math.round(tip.y)], hook: [Math.round(ln.hook.x), Math.round(ln.hook.y)] },
      fish: f ? { id: f.id, state: f.state, above: f.above, x: Math.round(f.x), y: Math.round(f.y), mouth: [Math.round(mouth.x), Math.round(mouth.y)], box: fbox,
        hookToMouth: Math.round(Math.hypot(ln.hook.x - mouth.x, ln.hook.y - mouth.y)), bubbleOverlapPx2: ov(fbox, B), hudOverlapPx2: ov(fbox, H), alpha: +f.alpha.toFixed(2) } : null,
      bubble: B, hud: H, rodBase: L.rodBase, tibo: { x: L.tibo.x, y: L.tibo.y, h: L.tibo.h }, surfaceY: L.surfaceY, showPt: L.showPt };
  });
}
async function layoutDump(page) {
  return page.evaluate(() => {
    const w = TL.debug.world, L = w.layout, v = TL.debug.view();
    const r = id => { const e = document.getElementById(id); if (!e || e.classList.contains('hidden')) return null; const b = e.getBoundingClientRect(); return { x: Math.round((b.x - v.left) / v.s), y: Math.round((b.y - v.top) / v.s), w: Math.round(b.width / v.s), h: Math.round(b.height / v.s) }; };
    const lil = L.lilies.map(q => [Math.round(q.x), Math.round(q.y)]);
    const gaps = lil.slice(1).map((q, i) => q[0] - lil[i][0]);
    return { view: { W: v.W, H: v.H, s: +v.s.toFixed(4), ins: v.ins, left: v.left, top: v.top }, size: L.size, surfaceY: L.surfaceY, groundY: L.groundY,
      tibo: L.tibo, rock: { x: L.rock.x, y: L.rock.y, w: L.rock.w, h: L.rock.h }, rodBase: L.rodBase, rodLen: L.rodLen, showPt: L.showPt, swim: { x0: L.swim.x0, x1: L.swim.x1, lanes: L.swim.lanes.map(Math.round) },
      lilies: lil, lilyGaps: gaps, bubble: L.bubble, hud: L.hud, sky: L.sky, dom: { hud: r('hud'), bubble: r('bubble') },
      members: w.members.map(m => ({ id: m.id, kind: m.thing.kind, lane: m.lane, x: Math.round(m.x), y: Math.round(m.y), state: m.state })) };
  });
}

/* ------------------------------------------------------------------ pass 1: every screen and catch phase */
async function screens(browser, url, vp, lang, layouts, geo) {
  const { ctx, page } = await newPage(browser, vp);
  const P = `${vp.name}-${lang}-`;
  const G = async k => { geo[P + k] = await geom(page); };
  try {
    await boot(page, vp, url, `seed=3&age=4&lang=${lang}`);
    await page.waitForTimeout(1200);
    await shot(page, P + '00-title');
    await page.evaluate(() => { TL.UI.refreshSettings(); TL.UI.only('scrSettings'); });
    await page.waitForTimeout(300); await shot(page, P + '01-settings');
    await page.evaluate(() => { const s = document.querySelector('#scrSettings .panel, #scrSettings > div'); if (s) s.scrollTop = 9999; });
    await page.waitForTimeout(150); await shot(page, P + '01b-settings-scrolled');
    await page.evaluate(() => TL.UI.only('scrTitle'));
    await page.evaluate(() => { TL.debug.startGame(); const w = TL.debug.world; w.levels = ['colors', 'shapes', 'count', 'animals']; w._surpriseRound = 99; w.startLevel(0); TL.debug.weather.setWeather(0, { instant: true }); });
    await page.waitForTimeout(700); await shot(page, P + '02-banner');
    // enter: fish swimming in
    await waitFn(page, () => { const w = TL.debug.world; return w.phase === 'enter' && w.members.some(m => m.state === 'enter' && m.x > 0 && m.x < w.layout.W); });
    await freeze(page); await page.waitForTimeout(150); await shot(page, P + '03-enter');
    await waitReady(page);
    layouts[P + 'play'] = await layoutDump(page);
    await shot(page, P + '04-play-morning');
    await page.evaluate(() => document.getElementById('btnPause').click());
    await page.waitForTimeout(300); await shot(page, P + '05-pause');
    await page.evaluate(() => document.getElementById('btnResume').click());
    await page.waitForTimeout(400);
    // wrong → dart
    const okW = await page.evaluate(() => { const w = TL.debug.world, m = w.members.find(m => !m.target && m.state === 'swim'); if (!m) return false; w.pointerDown(m.x, m.y); w.pointerUp(m.x, m.y); return true; });
    if (okW) { await page.waitForTimeout(160); await freeze(page); await page.waitForTimeout(100); await shot(page, P + '06-wrong-dart'); await go(page); }
    // hint hand
    await page.waitForTimeout(500);
    await page.evaluate(() => TL.debug.world.hint());
    await page.waitForTimeout(700); await shot(page, P + '07-hint');
    await page.waitForTimeout(700); await shot(page, P + '07b-hint2');
    // the catch, frozen at each moment
    await page.waitForTimeout(400);
    await tapTarget(page);
    if (await waitFn(page, () => { const l = TL.debug.world.line; return l.state === 'fly' && l.hook.y < l.tip.y - 20; })) { await freeze(page); await page.waitForTimeout(80); await G('08-cast'); await shot(page, P + '08-cast'); await go(page); }
    if (await waitFn(page, () => TL.debug.world.line.state === 'sink')) { await freeze(page); await page.waitForTimeout(80); await G('09-sink'); await shot(page, P + '09-sink'); await go(page); }
    if (await waitFn(page, () => { const w = TL.debug.world; return w.phase === 'reel' && w.phaseTime > 0.35; })) { await freeze(page); await page.waitForTimeout(80); await G('10-reel'); await shot(page, P + '10-reel'); await go(page); }
    if (await waitFn(page, () => { const w = TL.debug.world, m = w.members.find(m => m.state === 'reel' || m.state === 'show'); return w.phase === 'reel' && m && m.above; })) { await page.waitForTimeout(60); await freeze(page); await page.waitForTimeout(80); await G('11-splash'); await shot(page, P + '11-splash'); await go(page); }
    if (await waitFn(page, () => TL.debug.world.phase === 'show' && TL.debug.world.phaseTime > 0.5)) { await freeze(page); await page.waitForTimeout(80); await G('12-show'); await shot(page, P + '12-show'); await go(page); }
    if (await waitFn(page, () => { const m = TL.debug.world.members.find(m => m.state === 'leap'); return m && m._leap && m.vy > -50; })) { await freeze(page); await page.waitForTimeout(80); await G('13-leap'); await shot(page, P + '13-leap'); await go(page); }
    if (await waitFn(page, () => TL.debug.world.lilies.some(q => q.open > 0.9))) { await freeze(page); await page.waitForTimeout(80); await shot(page, P + '14-lily'); await go(page, 0.5); }
    if (await waitFn(page, () => TL.debug.world.members.some(m => m.state === 'joy' && m.above && m.y < TL.debug.world.layout.surfaceY - 30))) { await freeze(page); await page.waitForTimeout(80); await shot(page, P + '15-joy'); await go(page); }
    // count topic: spots counted while hanging (round 2 → 3 fish)
    await chapter(page, 'count', 2, 2);
    await tapTarget(page);
    if (await waitFn(page, () => { const w = TL.debug.world, m = w.members.find(m => m.state === 'show'); return w.phase === 'show' && m && m.count >= Math.min(2, m.thing.mark.n); })) { await freeze(page); await page.waitForTimeout(80); await G('16-count-show-sunset'); await shot(page, P + '16-count-show-sunset'); await go(page); }
    // animals topic: home badge (night)
    await chapter(page, 'animals', 3, 2);
    await shot(page, P + '17-play-night-animals');
    layouts[P + 'night'] = await layoutDump(page);
    await tapTarget(page);
    if (await waitFn(page, () => !!TL.debug.world.badge && TL.debug.world.badge.a > 0.8, null, 20000)) { await freeze(page); await page.waitForTimeout(80); await G('18-badge-night'); await shot(page, P + '18-badge-night'); await go(page); }
    // noon mood, with a crossfade from morning captured halfway
    await chapter(page, 'shapes', 0, 2);
    await page.evaluate(() => { const w = TL.debug.world; w.levels[1] = 'shapes'; w._surpriseRound = 99; w.startLevel(1); });
    await page.waitForTimeout(1250); await shot(page, P + '19-crossfade-morning-noon');
    await waitReady(page);
    await shot(page, P + '20-play-noon');
    await page.evaluate(() => { const w = TL.debug.world; w.levels[3] = 'colors'; w._surpriseRound = 99; w.startLevel(3); });
    await page.waitForTimeout(1250); await shot(page, P + '21-crossfade-sunset-night');
    // Talk time: bot through a chapter, stopped the moment Talk opens
    await page.evaluate(() => {
      const w = TL.debug.world; w.levels[0] = 'colors'; w.startLevel(0); TL.debug.weather.setWeather(0, { instant: true }); TL.debug.setBot(true, 1); TL.debug.setSpeed(10);
      const o = w._emit; w._emit = function (e) { if (e.type === 'talk' || e.type === 'talkAsk') { TL.debug.setBot(false); TL.debug.setSpeed(1); } return o.call(this, e); };
    });
    await waitFn(page, () => TL.debug.world.state === 'talk' && TL.debug.mode === 'talk', null, 120000);
    await page.evaluate(() => { TL.debug.setBot(false); TL.debug.setSpeed(1); });
    await page.waitForTimeout(900); await shot(page, P + '22-talk');
    // the next chapter's banner (talk → levelDone → intro)
    await page.evaluate(() => { TL.debug.setBot(true, 1); TL.debug.setSpeed(3); });
    if (await waitFn(page, () => TL.debug.world.state === 'intro' && TL.debug.world.level === 1, null, 60000)) { await page.evaluate(() => { TL.debug.setBot(false); TL.debug.setSpeed(1); }); await page.waitForTimeout(600); await shot(page, P + '23-chapter-banner'); }
    // session done: last chapter by the bot
    await page.evaluate(() => { const w = TL.debug.world; w.startLevel(w.levels.length - 1); TL.debug.setBot(true, 1); TL.debug.setSpeed(10); });
    await waitFn(page, () => TL.debug.mode === 'done', null, 180000);
    await page.evaluate(() => { TL.debug.setBot(false); TL.debug.setSpeed(1); });
    await page.waitForTimeout(900); await shot(page, P + '24-done');
    await page.waitForTimeout(2000); await shot(page, P + '24b-done');
  } catch (e) { errors.push(P + ' screens: ' + e.message.split('\n')[0]); await shot(page, P + 'ERROR'); }
  await ctx.close();
}

/* ------------------------------------------------------------------ pass 2: every topic × age (round 3 = most fish) */
async function topics(browser, url, vp, lang, layouts) {
  const { ctx, page } = await newPage(browser, vp);
  try {
    for (const age of [3, 4, 5, 6, 7]) {
      await boot(page, vp, url, `seed=${20 + age}&age=${age}&lang=${lang}`);
      await page.evaluate(() => TL.debug.startGame());
      for (const [i, t] of TOPICS[age].entries()) {
        await chapter(page, t, i % 4, 3);
        await shot(page, `${vp.name}-${lang}-t-age${age}-${t}-${MOODS[i % 4]}`);
        if (lang === 'en') layouts[`${vp.name}-t-age${age}-${t}`] = await layoutDump(page);
      }
      if (age === 6) {   // the densest spots: 9…12
        await chapter(page, 'count', 3, 3);
        await page.evaluate(() => { const ns = [12, 11, 10, 9, 8]; TL.debug.world.members.forEach((m, i) => { m.thing = Object.assign({}, m.thing, { mark: { n: ns[i % 5] } }); }); TL.debug.setSpeed(0.1); });
        await page.waitForTimeout(300);
        await shot(page, `${vp.name}-${lang}-t-age6-spots12-night`);
      }
    }
  } catch (e) { errors.push(vp.name + lang + ' topics: ' + e.message.split('\n')[0]); await shot(page, `${vp.name}-${lang}-t-ERROR`); }
  await ctx.close();
}

/* ------------------------------------------------------------------ pass 3: every critter (spawned in a play round) */
async function critters(browser, url, vp, lang) {
  const { ctx, page } = await newPage(browser, vp);
  try {
    await boot(page, vp, url, `seed=7&age=4&lang=${lang}`);
    await page.evaluate(() => TL.debug.startGame());
    const K = ['ptero', 'bronto', 'frog', 'fireflies'];
    for (let lv = 0; lv < 4; lv++) {
      await chapter(page, 'colors', lv, 2);
      if (K[lv] === 'frog') {   // open a lily first so the frog sits on a flower
        await page.evaluate(() => { const q = TL.debug.world.lilies[1]; q.open = q._popen = 1; q.target = 1; q.color = 'red'; });
      }
      await page.evaluate(k => { const w = TL.debug.world; w.surprise = k; w.critter = null; w._spawnCritter(); }, K[lv]);
      const st = { ptero: 'glide', bronto: 'stay', frog: 'sit', fireflies: 'dance' }[K[lv]];
      if (K[lv] === 'ptero') await waitFn(page, () => { const c = TL.debug.world.critter; return c && (c.state === 'dip' || c.state === 'in') && c.t > 1.2; }, null, 10000);
      else await waitFn(page, s => { const c = TL.debug.world.critter; return c && c.state === s; }, st, 10000);
      await page.waitForTimeout(300);
      await shot(page, `${vp.name}-${lang}-c-${K[lv]}-${MOODS[lv]}`);
      if (K[lv] === 'bronto' || K[lv] === 'frog' || K[lv] === 'fireflies') {
        await page.evaluate(() => { const w = TL.debug.world, h = w.critterHit(); if (h) { w.pointerDown(h.x, h.y); w.pointerUp(h.x, h.y); } });
        await page.waitForTimeout(K[lv] === 'bronto' ? 700 : 350); await shot(page, `${vp.name}-${lang}-c-${K[lv]}-tap`);
      }
    }
  } catch (e) { errors.push(vp.name + lang + ' critters: ' + e.message.split('\n')[0]); }
  await ctx.close();
}

/* ------------------------------------------------------------------ pass 4: numeric colour check from the canvas */
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
function lab([r, g, b]) {
  const X = (lin(r) * 0.4124 + lin(g) * 0.3576 + lin(b) * 0.1805) / 0.95047, Y = lin(r) * 0.2126 + lin(g) * 0.7152 + lin(b) * 0.0722, Z = (lin(r) * 0.0193 + lin(g) * 0.1192 + lin(b) * 0.9505) / 1.08883;
  const f = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
function dE00(c1, c2) {   // CIEDE2000
  const [L1, a1, b1] = lab(c1), [L2, a2, b2] = lab(c2), rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2, G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = a1 * (1 + G), a2p = a2 * (1 + G), C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h = (b, a) => { const v = Math.atan2(b, a) / rad; return v < 0 ? v + 360 : v; }, h1 = h(b1, a1p), h2 = h(b2, a2p);
  const dL = L2 - L1, dC = C2p - C1p; let dh = h2 - h1; if (C1p * C2p === 0) dh = 0; else if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin(dh / 2 * rad), Lb = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hb = h1 + h2; if (C1p * C2p !== 0) hb = Math.abs(h1 - h2) > 180 ? (h1 + h2 + 360) / 2 : (h1 + h2) / 2;
  const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.2 * Math.cos((4 * hb - 63) * rad);
  const SL = 1 + 0.015 * (Lb - 50) ** 2 / Math.sqrt(20 + (Lb - 50) ** 2), SC = 1 + 0.045 * Cbp, SH = 1 + 0.015 * Cbp * T;
  const RT = -2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7)) * Math.sin(60 * Math.exp(-(((hb - 275) / 25) ** 2)) * rad);
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}
const toHex = p => '#' + p.map(v => v.toString(16).padStart(2, '0')).join('');
async function contrastPass(browser, url, vp, out) {
  const { ctx, page } = await newPage(browser, vp);
  try {
    await boot(page, vp, url, 'seed=5&age=6&lang=en');   // age 6: 4 colours per round, every answer colour shows up over the moods
    await page.evaluate(() => TL.debug.startGame());
    for (let lv = 0; lv < 4; lv++) {
      await chapter(page, 'colors', lv, 3);
      await page.waitForTimeout(400);
      const res = await page.evaluate(async () => {
        const w = TL.debug.world, c = document.getElementById('game'), g = c.getContext('2d'), v = TL.debug.view();
        const kx = c.width / c.clientWidth;
        const P = (x, y) => [(v.left + x * v.s) * kx - c.offsetLeft * kx, (v.top + y * v.s) * kx - c.offsetTop * kx];
        TL.debug.setSpeed(0.0001);
        await new Promise(r => setTimeout(r, 120));
        const med = (x, y, rr) => { const [px, py] = P(x, y); const d = g.getImageData(Math.round(px - rr), Math.round(py - rr), 2 * rr + 1, 2 * rr + 1).data, rs = [], gs = [], bs = []; for (let i = 0; i < d.length; i += 4) { rs.push(d[i]); gs.push(d[i + 1]); bs.push(d[i + 2]); } const m = a => a.sort((p, q) => p - q)[a.length >> 1]; return [m(rs), m(gs), m(bs)]; };
        const S = w.layout.size;
        const thingPx = w.members.map(m => ({ color: m.thing.color, px: med(m.x - m.face * 0.15 * S, m.y - 0.18 * S, 4) }));  // upper body (above the cream belly)
        const keep = w.members.map(m => [m.alpha, m._palpha]);
        w.members.forEach(m => { m.alpha = 0; m._palpha = 0; });
        await new Promise(r => setTimeout(r, 150));
        const patches = w.members.map(m => {
          const [x0, y0] = P(m.x - 0.75 * S, m.y - 0.5 * S), ww = Math.round(1.5 * S * v.s * kx), hh = Math.round(S * v.s * kx);
          const d = g.getImageData(Math.round(x0), Math.round(y0), ww, hh).data; const px = [];
          for (let i = 0; i < d.length; i += 32) px.push([d[i], d[i + 1], d[i + 2]]);
          return px;
        });
        w.members.forEach((m, i) => { m.alpha = keep[i][0]; m._palpha = keep[i][1]; });
        TL.debug.setSpeed(1);
        return { thingPx, patches, mood: TL.debug.weather.ambient.mood, night: TL.debug.weather.ambient.night };
      });
      const all = res.patches.flat();
      const mean = [0, 1, 2].map(j => Math.round(all.reduce((s, p) => s + p[j], 0) / all.length));
      const byL = all.slice().sort((a, b) => lum(a) - lum(b)), p10 = byL[Math.floor(byL.length * 0.1)], p90 = byL[Math.floor(byL.length * 0.9)];
      const rows = {};
      for (const [nm, h] of Object.entries(ANSWER)) {
        const c = hex(h);
        rows[nm] = { hex: h, crMean: +contrast(c, mean).toFixed(2), crDark: +contrast(c, p10).toFixed(2), crLight: +contrast(c, p90).toFixed(2), dE00Mean: +dE00(c, mean).toFixed(1), dE00Min: +Math.min(dE00(c, p10), dE00(c, p90), dE00(c, mean)).toFixed(1) };
      }
      const painted = res.thingPx.map(t => ({ color: t.color, px: toHex(t.px), dE: t.color && ANSWER[t.color] ? +dE00(hex(ANSWER[t.color]), t.px).toFixed(1) : null, crVsWater: +contrast(t.px, mean).toFixed(2), dEvsWater: +dE00(t.px, mean).toFixed(1) }));
      out[`${vp.name}-${MOODS[lv]}`] = { mood: res.mood, night: res.night, waterMean: toHex(mean), waterP10: toHex(p10), waterP90: toHex(p90), rows, painted };
      await shot(page, `${vp.name}-en-k-${MOODS[lv]}`);
    }
  } catch (e) { errors.push(vp.name + ' contrast: ' + e.message.split('\n')[0]); }
  await ctx.close();
}

(async () => {
  const srv = await serve();
  const browser = await chromium.launch();
  const layouts = {}, cont = {}, geo = {};
  const jobs = [];
  for (const vp of VPS) {
    for (const lang of ['en', 'vi']) {
      if (PASSES.includes('screens')) jobs.push(() => screens(browser, srv.url, vp, lang, layouts, geo));
      if (PASSES.includes('topics') && (lang === 'en' || vp.name === 'iphone-p' || vp.name === 'ipad-l')) jobs.push(() => topics(browser, srv.url, vp, lang, layouts));
      if (PASSES.includes('critters') && (lang === 'en' || vp.name === 'iphone-p')) jobs.push(() => critters(browser, srv.url, vp, lang));
    }
    if (PASSES.includes('contrast')) jobs.push(() => contrastPass(browser, srv.url, vp, cont));
  }
  const PAR = +process.env.PAR || 4; let next = 0;
  await Promise.all(Array.from({ length: PAR }, async () => { while (next < jobs.length) { const j = jobs[next++]; await j(); } }));
  const wr = (f, o) => { if (Object.keys(o).length) fs.writeFileSync(path.join(OUT, f), JSON.stringify(o, null, 1)); };
  wr('layout.json', layouts); wr('contrast.json', cont); wr('geometry.json', geo);
  fs.writeFileSync(path.join(OUT, 'errors.json'), JSON.stringify(errors, null, 1));
  console.log('errors:', errors.length); errors.slice(0, 30).forEach(e => console.log('  ' + e));
  await browser.close(); srv.close();
})();
