// Checks the daily-game extras (volume slider, Score Card, loud iOS-ready audio chain) on one game, desktop + phone sizes.
// Usage: node shared/daily-mobile/test_extras.js projects/daily-game/<slug> [outDir]
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const GAME = path.resolve(process.argv[2]), ROOT = path.join(GAME, 'game');
const OUT = process.argv[3] || path.join(GAME, 'tests', 'out', 'extras');
fs.mkdirSync(OUT, { recursive: true });
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => { const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html')); fs.readFile(p, (e, d) => { if (e) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': T[path.extname(p)] || 'application/octet-stream' }); r.end(d); }); });
let fails = 0;
const check = (ok, name, extra) => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) fails++; };
const tag = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').match(/data-ns="([A-Za-z]+)"/);
const NS = tag ? tag[1] : null;

srv.listen(0, async () => {
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  const watch = (p, label) => { p.on('pageerror', e => errors.push(label + ': ' + e)); p.on('console', m => { if (m.type() === 'error') errors.push(label + ': ' + m.text()); }); };
  try {
    check(!!NS, 'index.html loads extras.js with data-ns', NS);
    const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
    const p = await ctx.newPage(); watch(p, 'desktop');
    await p.goto(base + '?seed=3');
    await p.waitForFunction(ns => window[ns] && window[ns].debug && window[ns].debug.mode === 'title', NS, { timeout: 15000 });
    // ---- volume
    await p.click('#btnSettings'); await p.waitForTimeout(300);
    check(await p.isVisible('#setVolume'), 'Settings has a Volume slider');
    await p.screenshot({ path: path.join(OUT, 'settings.png') });
    await p.fill('#setVolume', '40'); await p.dispatchEvent('#setVolume', 'input');
    await p.click('.vol-step[data-d="1"]');
    const v1 = await p.evaluate(() => document.getElementById('setVolume').value);
    check(v1 === '50', 'slider + "+" button → 50 %', v1);
    await p.evaluate(ns => window[ns].Audio.unlock(), NS);
    const chain = await p.evaluate(ns => { const A = window[ns].Audio; return { user: A.user && A.user.gain.value, vol: A.volume, thr: A.ctx && A.ctx.state }; }, NS);
    check(chain.user != null && Math.abs(chain.vol - 0.5) < 0.01, 'Audio chain has the user volume gain, set to 0.5', JSON.stringify(chain));
    await p.reload(); await p.waitForFunction(ns => window[ns].debug && window[ns].debug.mode === 'title', NS, { timeout: 15000 });
    await p.click('#btnSettings'); await p.waitForTimeout(250);
    check(await p.evaluate(() => document.getElementById('setVolume').value) === '50', 'volume is saved across a reload');
    await p.fill('#setVolume', '100'); await p.dispatchEvent('#setVolume', 'input');
    await p.click('#scrSettings .btn-back'); await p.waitForTimeout(250);
    check(await p.isVisible('#scrTitle'), 'back to the title after Settings');
    // ---- play → game over → Score Card
    await p.click('#btnPlay'); await p.waitForTimeout(1500);
    await p.evaluate(ns => { const G = window[ns].Game; if (G.world) G.world.score = Math.max(G.world.score || 0, 123); G.gameOver(); }, NS);
    await p.waitForSelector('#scrOver:not(.hidden)', { timeout: 10000 });
    await p.waitForTimeout(900);
    check(await p.isVisible('#btnScoreCard'), 'game over shows a Score Card button');
    await p.screenshot({ path: path.join(OUT, 'over.png') });
    const modeBefore = await p.evaluate(ns => window[ns].debug.mode, NS);
    await p.click('#btnScoreCard');
    await p.waitForSelector('#scScreen:not(.hidden)', { timeout: 10000 });
    await p.waitForTimeout(400);
    const sc = await p.evaluate(() => window.__scoreCard);
    check(sc && sc.w === 1080 && sc.h === 1350 && sc.bytes > 20000, 'score card picture made (1080×1350)', sc && (sc.bytes + ' bytes'));
    check(sc && /I scored \d+/.test(sc.text) && /https?:\/\//.test(sc.text), 'share text has the score and the play link', sc && sc.text);
    check(await p.evaluate(ns => window[ns].debug.mode, NS) === modeBefore, 'opening the card does not restart the game');
    await p.screenshot({ path: path.join(OUT, 'card_modal.png') });
    const img = await p.evaluate(() => document.getElementById('scImg').src);
    const data = await p.evaluate(async u => { const r = await fetch(u); const bl = await r.blob(); return await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(bl); }); }, img);
    fs.writeFileSync(path.join(OUT, 'score_card.png'), Buffer.from(data.split(',')[1], 'base64'));
    check(await p.evaluate(() => !!document.getElementById('scSave').getAttribute('download')), 'Save picture link is a download');
    await p.click('#scCopy'); await p.waitForTimeout(200);
    const clip = await p.evaluate(() => navigator.clipboard.readText().catch(() => ''));
    check(/I scored/.test(clip), 'Copy text puts the message on the clipboard');
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    check(!(await p.isVisible('#scScreen')), 'Esc closes the card');
    check(await p.isVisible('#scrOver'), 'game over screen still there');
    await p.waitForTimeout(800);
    await p.click('#btnAgain'); await p.waitForTimeout(600);
    check(['playing', 'ready'].includes(await p.evaluate(ns => window[ns].debug.mode, NS)), 'Play Again still works');
    await ctx.close();
    // ---- phones / tablets: card fits, buttons reachable
    for (const [w, h, n] of [[844, 390, 'iphone_land'], [390, 844, 'iphone_port'], [1024, 768, 'ipad_land'], [820, 1180, 'ipad_port']]) {
      const c2 = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      const q = await c2.newPage(); watch(q, n);
      await q.goto(base + '?seed=3&mute=1');
      await q.waitForFunction(ns => window[ns] && window[ns].debug && window[ns].debug.mode === 'title', NS, { timeout: 15000 });
      // Settings (with the new Volume row) must still fit, or scroll to its Done button
      await q.locator('#btnSettings').tap(); await q.waitForTimeout(400);
      const st = await q.evaluate(() => {
        const pn = document.querySelector('#scrSettings .panel'), done = document.querySelector('#scrSettings .btn-back'), vol = document.getElementById('setVolume');
        const r = done.getBoundingClientRect(), v = vol.getBoundingClientRect();
        const scrolls = pn.scrollHeight > pn.clientHeight + 2 && getComputedStyle(pn).overflowY !== 'hidden';
        return { doneVisible: r.top >= 0 && r.bottom <= innerHeight + 1, scrolls, volW: Math.round(v.width), volRight: Math.round(v.right), vw: innerWidth };
      });
      check((st.doneVisible || st.scrolls) && st.volW > 40 && st.volRight <= st.vw, n + ': Settings fits (or scrolls) with the Volume row', JSON.stringify(st));
      await q.screenshot({ path: path.join(OUT, n + '_settings.png') });
      await q.evaluate(() => { const b = document.querySelector('#scrSettings .btn-back'); b.scrollIntoView(); });
      await q.locator('#scrSettings .btn-back').tap(); await q.waitForTimeout(300);
      await q.evaluate(ns => { window[ns].Game.startGame(); }, NS);
      await q.waitForTimeout(800);
      await q.evaluate(ns => { const G = window[ns].Game; G._rotOk = true; if (G.world) G.world.score = Math.max(G.world.score || 0, 77); G.gameOver(); }, NS);
      await q.waitForSelector('#scrOver:not(.hidden)', { timeout: 10000 });
      await q.waitForTimeout(900);
      const bb = await q.locator('#btnScoreCard').boundingBox();
      check(bb && bb.y >= 0 && bb.y + bb.height <= h + 1, n + ': Score Card button on screen', bb && JSON.stringify(bb));
      await q.screenshot({ path: path.join(OUT, n + '_over.png') });
      await q.locator('#btnScoreCard').tap();
      await q.waitForSelector('#scScreen:not(.hidden)', { timeout: 10000 });
      await q.waitForTimeout(400);
      const r = await q.evaluate(() => { const vis = ['scShare', 'scSave', 'scCopy', 'scClose'].map(id => document.getElementById(id)).filter(e => e && !e.classList.contains('hidden')); return vis.map(e => { const k = e.getBoundingClientRect(); return [e.id, Math.round(k.top), Math.round(k.bottom)]; }); });
      check(r.every(x => x[1] >= 0 && x[2] <= h + 1), n + ': card buttons fit the screen', JSON.stringify(r));
      await q.screenshot({ path: path.join(OUT, n + '_card.png') });
      await c2.close();
    }
  } catch (e) { check(false, 'exception', String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')); }
  check(errors.length === 0, 'zero console errors', errors.slice(0, 4).join(' | '));
  await b.close(); srv.close();
  console.log(fails ? 'EXTRAS FAILED (' + fails + ')' : 'EXTRAS PASSED');
  process.exit(fails ? 1 : 0);
});
