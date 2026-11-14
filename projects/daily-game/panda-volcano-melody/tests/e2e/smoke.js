// Smoke test: boot, title, every menu, walking with mouse + keys, a bot game at speed 8, game over. Zero console errors.
// Usage: node tests/e2e/smoke.js [outDir]   (serves game/ itself on a free port)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', 'game');
const OUT = process.argv[2] || path.join(__dirname, '..', 'out', 'smoke');
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
});
let fails = 0;
const check = (ok, name, extra) => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) fails++; };
server.listen(0, async () => {
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const b = await chromium.launch();
  const errors = [];
  try {
    const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    p.on('pageerror', e => errors.push(String(e)));
    p.on('requestfailed', r => errors.push('request failed ' + r.url()));
    p.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
    await p.goto(base + '?mute=1&seed=7');
    await p.waitForFunction(() => window.PVM && PVM.debug && PVM.debug.mode === 'title', null, { timeout: 10000 });
    await p.waitForTimeout(2500);
    await p.screenshot({ path: path.join(OUT, '01_title.png') });
    check(await p.isVisible('#scrTitle'), 'title screen visible');
    for (const [btn, scr] of [['#btnHow', '#scrHow'], ['#btnSettings', '#scrSettings'], ['#btnCustomize', '#scrCustom']]) {
      await p.click(btn); await p.waitForTimeout(400);
      check(await p.isVisible(scr), scr + ' opens');
      await p.screenshot({ path: path.join(OUT, '02_' + scr.slice(4) + '.png') });
      await p.click(scr + ' .btn-back'); await p.waitForTimeout(300);
      check(await p.isVisible('#scrTitle'), scr + ' back to title');
    }
    // manual game: hold the mouse to the right of Tofu → he walks there; arrow keys move him too
    await p.click('#btnPlay');
    await p.waitForFunction(() => PVM.debug.world.phase === 'playing', null, { timeout: 15000 });
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(OUT, '03_playing.png') });
    const box = await p.locator('#game').boundingBox();
    const cs = await p.evaluate(() => ({ s: PVM.Game.renderer.cssScale, ox: PVM.Game.renderer.ox, oy: PVM.Game.renderer.oy }));
    const x0 = await p.evaluate(() => PVM.debug.world.tofu.x);
    await p.mouse.move(box.x + (760 + cs.ox) * cs.s, box.y + (450 + cs.oy) * cs.s);
    await p.mouse.down(); await p.waitForTimeout(700); await p.mouse.up();
    const x1 = await p.evaluate(() => PVM.debug.world.tofu.x);
    check(x1 > x0 + 60, 'holding the mouse walks Tofu', x0.toFixed(0) + ' -> ' + x1.toFixed(0));
    await p.keyboard.down('ArrowLeft'); await p.waitForTimeout(500); await p.keyboard.up('ArrowLeft');
    const x2 = await p.evaluate(() => PVM.debug.world.tofu.x);
    check(x2 < x1 - 40, 'arrow key walks Tofu', x1.toFixed(0) + ' -> ' + x2.toFixed(0));
    await p.screenshot({ path: path.join(OUT, '04_walked.png') });
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    check(await p.isVisible('#scrPause'), 'Esc pauses');
    await p.click('#btnResume'); await p.waitForTimeout(300);
    check(await p.evaluate(() => PVM.debug.mode) === 'playing', 'resume');
    // bot game at speed 8
    await p.goto(base + '?autostart=1&bot=1&speed=8&mute=1&seed=3&diff=normal');
    await p.waitForFunction(() => PVM.debug && PVM.debug.mode === 'playing', null, { timeout: 10000 });
    let shot = 0;
    for (let i = 0; i < 40; i++) {
      await p.waitForTimeout(1000);
      if (i % 8 === 3) await p.screenshot({ path: path.join(OUT, '05_bot_' + (shot++) + '.png') });
      if (await p.evaluate(() => PVM.debug.mode === 'over')) break;
    }
    const st = await p.evaluate(() => ({ s: PVM.debug.getState(), mode: PVM.debug.mode, errs: PVM.debug.stats.errors }));
    check(st.s.score > 0, 'bot scores', 'score=' + st.s.score + ' level=' + st.s.level + ' mode=' + st.mode);
    check(st.s.level >= 1 || st.mode === 'over', 'bot reaches season 2 or game over', 'level=' + st.s.level);
    check(st.errs.length === 0, 'no frame errors', st.errs.slice(0, 2).join(' | '));
    // force game over quickly
    await p.evaluate(() => { PVM.debug.setBot(false); const w = PVM.debug.world; w.hearts = 1; w.invulnT = 0; const c = w.crabs[0]; if (c) { c.state = 'chase'; c.x = w.tofu.x + 4; c.y = w.tofu.y; } });
    await p.waitForFunction(() => PVM.debug.mode === 'over', null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(600);
    await p.screenshot({ path: path.join(OUT, '06_over.png') });
    check(await p.isVisible('#scrOver'), 'game over screen');
    // phone sizes
    for (const [w, h, n] of [[844, 390, 'iphone_land'], [1024, 768, 'ipad'], [390, 844, 'iphone_port']]) {
      const q = await b.newPage({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      q.on('pageerror', e => errors.push(n + ': ' + e));
      await q.goto(base + '?autostart=1&bot=1&speed=4&mute=1&seed=5');
      await q.waitForTimeout(4500);
      await q.screenshot({ path: path.join(OUT, '07_' + n + '.png') });
      await q.close();
    }
  } catch (e) { check(false, 'exception', String(e)); }
  check(errors.length === 0, 'zero console errors', errors.slice(0, 5).join(' | '));
  await b.close(); server.close();
  console.log(fails ? `SMOKE FAILED (${fails})` : 'SMOKE PASSED');
  process.exit(fails ? 1 : 0);
});
