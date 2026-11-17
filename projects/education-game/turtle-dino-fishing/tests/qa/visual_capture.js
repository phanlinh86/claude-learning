// Visual QA capture (Moka's Fairy Tea Party) — screenshots of every screen × 4 device shapes × EN / VI with notch insets
// emulated (the CSS --sa-* variables that #safeProbe reads, so main.js computes the same `ins` as on a real iPhone / iPad),
// every topic at every age 3–7, berry plates up to 12, plus numeric colour checks read from the game canvas.
//   node tests/qa/visual_capture.js                 (everything)
//   ONLY=iphone-p node tests/qa/visual_capture.js   (one device)   PASSES=screens,topics,contrast
// Writes PNGs + layout.json + contrast.json to tests/out/visual/.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const OUT = path.join(__dirname, '..', 'out', 'visual'); fs.mkdirSync(OUT, { recursive: true });

// notch insets in CSS px (iPhone 15/16 portrait: 59 / 34; landscape: 59 L+R, 21 home bar; iPad Pro/Air: 24 top, 20 bottom)
const VPS = [
  { name: 'iphone-p', w: 393, h: 852, sa: { t: 59, r: 0, b: 34, l: 0 } },
  { name: 'iphone-l', w: 852, h: 393, sa: { t: 0, r: 59, b: 21, l: 59 } },
  { name: 'ipad-p', w: 820, h: 1180, sa: { t: 24, r: 0, b: 20, l: 0 } },
  { name: 'ipad-l', w: 1180, h: 820, sa: { t: 24, r: 0, b: 20, l: 0 } }
].filter(v => !process.env.ONLY || process.env.ONLY.split(',').includes(v.name));
const PASSES = (process.env.PASSES || 'screens,topics,contrast').split(',');
const POOLS = { 3: ['colors', 'shapes', 'size', 'animals', 'count'], 4: ['colors', 'size', 'shapes', 'count', 'animals'],
  5: ['colors', 'shapes', 'count', 'letters', 'animals'], 6: ['letters', 'lower', 'initial', 'add', 'count'],
  7: ['count', 'initial', 'add', 'sub', 'oddeven'] };
const ANSWER = { red: '#E84A4A', blue: '#3C8DE8', yellow: '#FFD23F', green: '#4CC26B', orange: '#FF9A2E', purple: '#8E44AD', pink: '#FF8FC0' };
const MOODS = ['sunny', 'breezy', 'rain', 'rainbow'];

const errors = [];
async function newPage(browser, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
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
/** draw the notch / Dynamic Island + home indicator so the screenshots show what is under them */
async function notch(page, vp) {
  await page.evaluate(([vp]) => {
    document.querySelectorAll('.qa-notch').forEach(e => e.remove());
    const add = (css) => { const d = document.createElement('div'); d.className = 'qa-notch'; d.style.cssText = css; document.body.appendChild(d); };
    if (vp.name === 'iphone-p') { add('left:50%;top:11px;width:126px;height:37px;margin-left:-63px;border-radius:19px'); add('left:50%;bottom:8px;width:134px;height:5px;margin-left:-67px;border-radius:3px'); }
    if (vp.name === 'iphone-l') { add('left:11px;top:50%;width:37px;height:126px;margin-top:-63px;border-radius:19px'); add('left:50%;bottom:6px;width:200px;height:5px;margin-left:-100px;border-radius:3px'); }
    if (vp.name.startsWith('ipad')) add('left:50%;bottom:6px;width:300px;height:5px;margin-left:-150px;border-radius:3px');
  }, [vp]);
}
async function boot(page, vp, url, q) {
  await page.goto(url + '?mute=1&novoice=1&debug=0&' + q);
  await page.waitForFunction(() => window.TL && TL.debug && TL.debug.mode === 'title' && TL.debug.world, null, { timeout: 30000 });
  await page.waitForTimeout(300);
  await notch(page, vp);
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + '.png') }).catch(e => errors.push('shot ' + name + ': ' + e));
const READY = () => { const w = TL.debug.world, a = TL.debug.answer(); return w.interactive && a && a.member != null && w.members.length && w.members.every(m => m.state === 'sit'); };
async function waitReady(page, t = 40000) {
  await page.evaluate(() => TL.debug.setSpeed(4));
  await page.waitForFunction(READY, null, { timeout: t, polling: 'raf' });
  await page.evaluate(() => TL.debug.setSpeed(1));
  await page.waitForTimeout(450);
}
/** start chapter lv with topic t (round index r: more things), wait for the open question */
async function chapter(page, t, lv, r = 0, prep = '') {
  await page.evaluate(([t, lv, r, prep]) => {
    const w = TL.debug.world; TL.debug.setBot(false);
    w.levels[lv] = t; w.startLevel(lv); if (r) w.round = r;
    if (prep) (new Function('w', prep))(w);
    TL.debug.weather.setWeather(lv % 4, { instant: true });
  }, [t, lv, r, prep]);
  await waitReady(page);
}
async function tapOdd(page) {
  await page.evaluate(() => { const w = TL.debug.world, m = w.memberById(TL.debug.answer().member); w.pointerDown(m.cx, m.cy); w.pointerUp(m.cx, m.cy); });
}
const waitFn = (page, fn, arg, t = 30000) => page.waitForFunction(fn, arg, { timeout: t, polling: 'raf' }).catch(e => errors.push('wait: ' + String(fn).slice(0, 80) + ' ' + e.message.split('\n')[0]));

/** full layout + DOM boxes (logical px and CSS px) for the report */
async function layoutDump(page) {
  return page.evaluate(() => {
    const w = TL.debug.world, L = w.layout, v = TL.debug.view();
    const r = id => { const e = document.getElementById(id); if (!e || e.classList.contains('hidden')) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
    const env = TL.render && TL.render._env ? TL.render._env : null;
    return { view: { W: v.W, H: v.H, s: +v.s.toFixed(4), ins: v.ins }, groundY: L.groundY, item: L.item, tier: L.tier, table: L.table, slots: L.slots.map(s => Math.round(s.x)),
      moka: L.moka, mokaBox: L.mokaBox, garland: { x0: L.garland.x0, x1: L.garland.x1, y: L.garland.y, bottom: L.garland.bottom, lanterns: L.garland.lanterns.map(q => [Math.round(q.cx), Math.round(q.cy)]) },
      bubble: L.bubble, hud: L.hud, keep: L.keep, dom: { hud: r('hud'), bubble: r('bubble') },
      members: w.members.map(m => ({ id: m.id, kind: m.thing.kind, cx: Math.round(m.cx), cy: Math.round(m.cy), size: m.size, x: Math.round(m.x), y: Math.round(m.y) })) };
  });
}

/* ------------------------------------------------------------------ pass 1: every screen */
async function screens(browser, url, vp, lang, layouts) {
  const { ctx, page } = await newPage(browser, vp);
  const P = `${vp.name}-${lang}-`;
  try {
    await boot(page, vp, url, `seed=3&age=4&lang=${lang}`);
    await page.waitForTimeout(900);
    await shot(page, P + '00-title');
    await page.evaluate(() => { TL.UI.refreshSettings(); TL.UI.only('scrSettings'); });
    await page.waitForTimeout(300); await shot(page, P + '01-settings');
    // the longest settings content: scroll to the bottom too
    await page.evaluate(() => { const s = document.querySelector('#scrSettings .panel, #scrSettings > div'); if (s) s.scrollTop = 9999; });
    await page.waitForTimeout(150); await shot(page, P + '01b-settings-scrolled');
    await page.evaluate(() => TL.UI.only('scrTitle'));
    await page.evaluate(() => { TL.debug.startGame(); const w = TL.debug.world; w.levels = ['colors', 'shapes', 'count', 'animals']; w.startLevel(0); TL.debug.weather.setWeather(0, { instant: true }); });
    await page.waitForTimeout(700); await shot(page, P + '02-banner');
    // fall (enter, things mid-air under their fluffs)
    await page.evaluate(() => TL.debug.setSpeed(1));
    await waitFn(page, () => { const w = TL.debug.world; return w.phase === 'enter' && w.members.length && w.members.filter(m => m.state === 'fall' && m.y > w.layout.table.y * 0.45).length >= 2; });
    await page.evaluate(() => TL.debug.setSpeed(0.1));
    await page.waitForTimeout(150); await shot(page, P + '03-fall');
    await waitReady(page);
    layouts[P + 'play'] = await layoutDump(page);
    await shot(page, P + '04-mood-sunny');
    // pause
    await page.evaluate(() => document.getElementById('btnPause').click());
    await page.waitForTimeout(300); await shot(page, P + '05-pause');
    await page.evaluate(() => document.getElementById('btnResume').click());
    await page.waitForTimeout(400);
    // right → fairy / rise / lantern / chime / cheers (slow motion)
    await page.evaluate(() => TL.debug.setSpeed(0.6));
    await tapOdd(page);
    await waitFn(page, () => { const w = TL.debug.world; return w.fairy.state === 'circle'; });
    await shot(page, P + '06-fairy-circle');
    await waitFn(page, () => { const w = TL.debug.world; const m = w.members.find(m => m.state === 'rise' && m._rs === 'float'); return m && m.y < (w.layout.table.y + w.layout.garland.bottom) / 2; });
    await shot(page, P + '07-rise');
    await waitFn(page, () => { const w = TL.debug.world; return w.garland.lanterns.some(q => q.lit > 0.9); });
    await page.waitForTimeout(250); await shot(page, P + '08-lantern-lit');
    await waitFn(page, () => TL.debug.world.phase === 'chime' && TL.debug.world.members.some(m => m.hop > 0.3 || m.ring > 0.3));
    await shot(page, P + '09-chime');
    await waitFn(page, () => TL.debug.world.phase === 'cheers' && TL.debug.world.phaseTime > 0.3);
    await shot(page, P + '10-cheers');
    // the other moods mid-round (round 2 → 4–5 things), rain with the hint hand
    for (let lv = 1; lv < 4; lv++) {
      await chapter(page, ['shapes', 'count', 'animals'][lv - 1], lv, 2);
      await shot(page, P + `11-mood-${MOODS[lv]}`);
      layouts[P + MOODS[lv]] = await layoutDump(page);
      if (lv === 2) {
        await page.evaluate(() => TL.debug.world.hint());
        await page.waitForTimeout(900); await shot(page, P + '12-rain-hint');
        await page.waitForTimeout(700); await shot(page, P + '12b-rain-hint2');
      }
      if (lv === 3) {   // the badge after a non-forest guest
        await page.evaluate(() => TL.debug.setSpeed(0.7));
        await tapOdd(page);
        await waitFn(page, () => !!TL.debug.world.garland.badge && TL.debug.world.garland.badge.a > 0.8, null, 20000);
        await shot(page, P + '13-home-badge');
      }
    }
    // Talk time: bot through chapter 0
    await page.evaluate(() => {
      const w = TL.debug.world; w.levels[0] = 'colors'; w.startLevel(0); TL.debug.weather.setWeather(0, { instant: true }); TL.debug.setBot(true, 1); TL.debug.setSpeed(10);
      // stop the bot the moment Talk time opens (it would answer within a frame at speed 10)
      const o = w._emit; w._emit = function (e) { if (e.type === 'talk' || e.type === 'talkAsk') { TL.debug.setBot(false); TL.debug.setSpeed(1); } return o.call(this, e); };
    });
    await waitFn(page, () => TL.debug.world.state === 'talk' && TL.debug.mode === 'talk', null, 120000);
    await page.evaluate(() => { TL.debug.setBot(false); TL.debug.setSpeed(1); });
    await page.waitForTimeout(900); await shot(page, P + '14-talk');
    // session done: last chapter by the bot
    await page.evaluate(() => { const w = TL.debug.world; w.startLevel(w.levels.length - 1); TL.debug.setBot(true, 1); TL.debug.setSpeed(10); });
    await waitFn(page, () => TL.debug.mode === 'done', null, 180000);
    await page.evaluate(() => { TL.debug.setBot(false); TL.debug.setSpeed(1); });
    await page.waitForTimeout(1600); await shot(page, P + '15-done');
    await page.waitForTimeout(1500); await shot(page, P + '15b-done');
  } catch (e) { errors.push(P + ' screens: ' + e.message.split('\n')[0]); await shot(page, P + 'ERROR'); }
  await ctx.close();
}

/* ------------------------------------------------------------------ pass 2: every topic × age */
async function topics(browser, url, vp, lang) {
  const { ctx, page } = await newPage(browser, vp);
  try {
    for (const age of [3, 4, 5, 6, 7]) {
      await boot(page, vp, url, `seed=${20 + age}&age=${age}&lang=${lang}`);
      await page.evaluate(() => TL.debug.startGame());
      for (const t of POOLS[age]) {
        await chapter(page, t, 0, 3);   // round 3: the most things of the age
        await shot(page, `${vp.name}-${lang}-t-age${age}-${t}`);
      }
      if (age === 7) {   // berry plates 9…12 (the densest layouts)
        await chapter(page, 'count', 0, 3);
        await page.evaluate(() => { const ns = [12, 11, 10, 9, 12]; TL.debug.world.members.forEach((m, i) => { m.thing = Object.assign({}, m.thing, { n: ns[i % 5] }); }); });
        await page.waitForTimeout(200);
        await shot(page, `${vp.name}-${lang}-t-age7-plates12`);
      }
    }
  } catch (e) { errors.push(vp.name + lang + ' topics: ' + e.message.split('\n')[0]); await shot(page, `${vp.name}-${lang}-t-ERROR`); }
  await ctx.close();
}

/* ------------------------------------------------------------------ pass 3: numeric colour check from the canvas */
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
function lin(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
function lab([r, g, b]) {
  let X = (lin(r) * 0.4124 + lin(g) * 0.3576 + lin(b) * 0.1805) / 0.95047, Y = lin(r) * 0.2126 + lin(g) * 0.7152 + lin(b) * 0.0722, Z = (lin(r) * 0.0193 + lin(g) * 0.1192 + lin(b) * 0.9505) / 1.08883;
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
async function contrastPass(browser, url, vp, out) {
  const { ctx, page } = await newPage(browser, vp);
  try {
    await boot(page, vp, url, 'seed=5&age=4&lang=en');
    await page.evaluate(() => TL.debug.startGame());
    for (let lv = 0; lv < 4; lv++) {
      await chapter(page, 'colors', lv, 2);
      await page.waitForTimeout(600);
      // the background behind the things: pause, hide the things + the pause panel, read the canvas
      const res = await page.evaluate(async () => {
        const w = TL.debug.world, L = w.layout, c = document.getElementById('game'), g = c.getContext('2d'), k = c.width / L.W;
        const thingPx = [];
        // actual painted colour at each thing's body centre (median of a 9×9 box), with the thing visible
        const med = (x, y, r) => { const d = g.getImageData(Math.round(x * k - r), Math.round(y * k - r), 2 * r + 1, 2 * r + 1).data, rs = [], gs = [], bs = []; for (let i = 0; i < d.length; i += 4) { rs.push(d[i]); gs.push(d[i + 1]); bs.push(d[i + 2]); } const m = a => a.sort((p, q) => p - q)[a.length >> 1]; return [m(rs), m(gs), m(bs)]; };
        document.getElementById('btnPause').click();
        await new Promise(r => setTimeout(r, 120));
        document.getElementById('scrPause').classList.add('hidden');
        await new Promise(r => setTimeout(r, 120));
        for (const m of w.members) thingPx.push({ color: m.thing.color, obj: m.thing.obj, px: med(m.x, m.y - m.size * 0.42, 4) });
        const keep = w.members.map(m => [m.alpha, m._palpha]);
        w.members.forEach(m => { m.alpha = 0; m._palpha = 0; });
        await new Promise(r => setTimeout(r, 150));
        // background patches: each thing's body box
        const patches = w.members.map(m => {
          const x0 = Math.round((m.x - m.size * 0.45) * k), y0 = Math.round((m.y - m.size) * k), ww = Math.round(m.size * 0.9 * k), hh = Math.round(m.size * k);
          const d = g.getImageData(x0, y0, ww, hh).data; const px = [];
          for (let i = 0; i < d.length; i += 16) px.push([d[i], d[i + 1], d[i + 2]]);
          return px;
        });
        // the ring just outside the things (what the eye compares an edge with) + the table plank
        w.members.forEach((m, i) => { m.alpha = keep[i][0]; m._palpha = keep[i][1]; });
        document.getElementById('btnResume').click();
        return { thingPx, patches, mood: TL.debug.weather.ambient.mood, darkness: TL.debug.weather.ambient.darkness };
      });
      // reduce in node: mean bg colour + the 10th / 90th percentile luminance pixel
      const all = res.patches.flat();
      const mean = [0, 1, 2].map(j => Math.round(all.reduce((s, p) => s + p[j], 0) / all.length));
      const byL = all.slice().sort((a, b) => lum(a) - lum(b)), p10 = byL[Math.floor(byL.length * 0.1)], p90 = byL[Math.floor(byL.length * 0.9)];
      const rows = {};
      for (const [nm, h] of Object.entries(ANSWER)) {
        const c = hex(h);
        rows[nm] = { hex: h, crMean: +contrast(c, mean).toFixed(2), crDark: +contrast(c, p10).toFixed(2), crLight: +contrast(c, p90).toFixed(2), dE00Mean: +dE00(c, mean).toFixed(1), dE00Min: +Math.min(dE00(c, p10), dE00(c, p90), dE00(c, mean)).toFixed(1) };
      }
      // painted vs palette (does the mood tint / rain darken the answer colours?)
      const painted = res.thingPx.map(t => ({ color: t.color, obj: t.obj, px: '#' + t.px.map(v => v.toString(16).padStart(2, '0')).join(''), dE: t.color && ANSWER[t.color] ? +dE00(hex(ANSWER[t.color]), t.px).toFixed(1) : null }));
      out[`${vp.name}-${MOODS[lv]}`] = { mood: res.mood, darkness: res.darkness, bgMean: '#' + mean.map(v => v.toString(16).padStart(2, '0')).join(''), bgP10: p10, bgP90: p90, rows, painted };
      await shot(page, `${vp.name}-en-c-${MOODS[lv]}`);
    }
  } catch (e) { errors.push(vp.name + ' contrast: ' + e.message.split('\n')[0]); }
  await ctx.close();
}

(async () => {
  const srv = await serve();
  const browser = await chromium.launch();
  const layouts = {}, cont = {};
  const jobs = [];
  for (const vp of VPS) {
    for (const lang of ['en', 'vi']) {
      if (PASSES.includes('screens')) jobs.push(() => screens(browser, srv.url, vp, lang, layouts));
      if (PASSES.includes('topics') && (lang === 'en' || vp.name === 'iphone-p' || vp.name === 'ipad-l')) jobs.push(() => topics(browser, srv.url, vp, lang));
    }
    if (PASSES.includes('contrast')) jobs.push(() => contrastPass(browser, srv.url, vp, cont));
  }
  const PAR = +process.env.PAR || 4; let next = 0;
  await Promise.all(Array.from({ length: PAR }, async () => { while (next < jobs.length) { const j = jobs[next++]; await j(); } }));
  fs.writeFileSync(path.join(OUT, 'layout.json'), JSON.stringify(layouts, null, 1));
  fs.writeFileSync(path.join(OUT, 'contrast.json'), JSON.stringify(cont, null, 1));
  fs.writeFileSync(path.join(OUT, 'errors.json'), JSON.stringify(errors, null, 1));
  console.log('errors:', errors.length); errors.slice(0, 30).forEach(e => console.log('  ' + e));
  await browser.close(); srv.close();
})();
