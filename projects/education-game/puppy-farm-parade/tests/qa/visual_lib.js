// Visual QA helpers (report-only): device table with emulated notch insets, page open, geometry dump in logical px.
const path = require('path'), fs = require('fs');
const OUT = path.join(__dirname, '..', 'out', 'qa_visual'); fs.mkdirSync(OUT, { recursive: true });
// insets in CSS px [top, right, bottom, left]
const DEVS = {
  'ip-p': { vp: [393, 852], ins: [59, 0, 34, 0], dpr: 3 },
  'ip-l': { vp: [852, 393], ins: [0, 59, 21, 59], dpr: 3 },
  'pad-p': { vp: [820, 1180], ins: [24, 0, 20, 0], dpr: 2 },
  'pad-l': { vp: [1180, 820], ins: [24, 0, 20, 0], dpr: 2 },
  'and-p': { vp: [360, 780], ins: [28, 0, 16, 0], dpr: 3 },
  'pro-p': { vp: [1024, 1366], ins: [24, 0, 20, 0], dpr: 2 }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = (page, fn, arg, t = 40000) => page.waitForFunction(fn, arg, { timeout: t, polling: 20 });
const env = (k, d) => (process.env[k] ? process.env[k].split(',') : d);

async function open(browser, srv, dev, lang, age = 4, seed = 5, extra = '') {
  const d = DEVS[dev];
  const ctx = await browser.newContext({ viewport: { width: d.vp[0], height: d.vp[1] }, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page._errs = []; page.on('pageerror', e => page._errs.push(String(e))); page.on('console', m => { if (m.type() === 'error') page._errs.push(m.text()); });
  await page.goto(srv.url + `?mute=1&novoice=1&seed=${seed}&age=${age}&lang=${lang}${extra}`);
  await until(page, () => window.FP && FP.debug && FP.debug.mode === 'title');
  await page.addStyleTag({ content: `:root{--sa-t:${d.ins[0]}px!important;--sa-r:${d.ins[1]}px!important;--sa-b:${d.ins[2]}px!important;--sa-l:${d.ins[3]}px!important}` });
  await page.evaluate(() => window.dispatchEvent(new Event('resize'))); await sleep(500);
  return { ctx, page };
}

// geometry snapshot (logical px) — run in the page
function geomSnap() {
  const w = FP.debug.world, L = w.layout, v = FP.debug.view();
  const rectL = el => { if (!el) return null; const r = el.getBoundingClientRect(); if (!r.width || el.classList.contains('hidden') || el.closest('.hidden')) return null; return { x: +((r.left - v.left) / v.s).toFixed(1), y: +((r.top - v.top) / v.s).toFixed(1), w: +(r.width / v.s).toFixed(1), h: +(r.height / v.s).toFixed(1) }; };
  const B = L.bo, k = B.h * 1.06 / 260;
  const r1 = n => Math.round(n);
  return {
    W: L.W, H: L.H, s: +v.s.toFixed(3), ins: L.ins, tier: L.tier, item: L.item, sp: +L.sp.toFixed(1), phase: w.phase, state: w.state, topic: w.topic, round: w.round,
    bubble: rectL(document.getElementById('bubble')), hud: rectL(document.getElementById('hud')), bubbleText: rectL(document.getElementById('bubbleText')),
    bubbleLayout: L.bubble, bo: { x: r1(B.x - 101 * k), y: r1(B.y - 259 * k), w: r1(200 * k), h: r1(260 * k) },
    line: L.line, groundY: L.groundY, stage: w.stage && { x: r1(w.stage.x), y: r1(w.stage.y), s: w.stage.s, id: w.stage.memberId, badge: w.stage.badge },
    homeBadge: L.homeBadge, barn: L.barn.box, door: L.barn.door.box, fenceY: L.fenceY, hopMinY: L.hopMinY,
    members: w.members.map(m => ({ id: m.id, kind: m.thing.kind, col: m.thing.color, obj: m.thing.obj || m.thing.shape || m.thing.animal || m.thing.text || m.thing.n, big: m.thing.big, odd: m.odd, state: m.state, x: r1(m.x), y: r1(m.y), bob: r1(m.bob), cx: r1(m.cx), cy: r1(m.cy), size: r1(m.size), scale: +(m.scale || 1).toFixed(2), rot: +(m.rot || 0).toFixed(2), hitPt: r1(2 * w._hitR(m) * v.s) })),
    hint: w.hintHand && { x: r1(w.hintHand.x), y: r1(w.hintHand.y), mode: w.hintHand.mode },
    chick: w.chick && { x: r1(w.chick.x), y: r1(w.chick.y), st: w.chick.state }, rooster: w.rooster && { x: r1(w.rooster.x), y: r1(w.rooster.y) },
    door01: +(w.barn.door || 0).toFixed(2)
  };
}
module.exports = { DEVS, OUT, sleep, until, env, open, geomSnap };
