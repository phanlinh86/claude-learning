// QA probe (report-only): what tests/e2e/functional.js does not cover. Real touch (CDP) on isMobile/hasTouch contexts.
//   node tests/qa/probe.js [group ...]   groups: assets swinghit touch critter talk rotate voice
// Writes tests/out/qa/probe.json.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const OUT = path.join(__dirname, '..', 'out', 'qa'); fs.mkdirSync(OUT, { recursive: true });
const DEV = {
  iphoneP: { name: 'iphone-portrait', viewport: { width: 393, height: 852 }, dpr: 3 },
  iphoneL: { name: 'iphone-landscape', viewport: { width: 852, height: 393 }, dpr: 3 },
  ipadP: { name: 'ipad-portrait', viewport: { width: 820, height: 1180 }, dpr: 2 },
  ipadL: { name: 'ipad-landscape', viewport: { width: 1180, height: 820 }, dpr: 2 }
};
const ALL = Object.values(DEV);
const ONLY = process.argv.slice(2), want = g => !ONLY.length || ONLY.includes(g);
const results = []; let G = '';
function check(name, ok, info) {
  results.push({ group: G, name, ok: !!ok, info });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || info == null ? '' : '  -- ' + JSON.stringify(info).slice(0, 600)));
}
const note = (name, info) => { results.push({ group: G, name, note: true, info }); console.log('NOTE ' + name + ' ' + JSON.stringify(info).slice(0, 600)); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const KEYRE = /\b(p|ui|topic|talk|say|session|chapter|weather|name|match|mismatch|flip|critter|walk|peek|hide|cheer|swing|backflip|praise|wrong|idle|hint)\.[a-zA-Z]/;
const bad = s => s == null ? null : /[{}]/.test(s) ? 'brace' : /\bundefined\b|\bNaN\b|\bnull\b|\[object/.test(s) ? 'undef' : KEYRE.test(s) ? 'key' : null;

let srv, browser;
async function open(dev, q = '') {
  const ctx = await browser.newContext({ viewport: dev.viewport, deviceScaleFactor: dev.dpr, isMobile: true, hasTouch: true, locale: 'en-US' });
  const page = await ctx.newPage();
  const errors = [], reqs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  page.on('response', r => reqs.push({ url: r.url(), status: r.status() }));
  page.on('requestfailed', r => reqs.push({ url: r.url(), status: 'failed' }));
  await page.goto(srv.url + (q ? '?' + q : ''));
  await page.waitForFunction(() => window.LL && LL.debug && LL.debug.mode === 'title', null, { timeout: 15000 });
  await page.evaluate(() => {
    window.__ev = []; const w = LL.debug.world, o = w._emit;
    w._emit = function (e) { const r = Object.assign({ wt: this.time, phase: this.phase }, e); delete r.talk; delete r.face; delete r.faceA; delete r.faceB; delete r.building; window.__ev.push(r);
      if (e.type === 'play' && window.__stopNext) { window.__stopNext = 0; LL.debug.setBot(false); LL.debug.setSpeed(1); }
      if (e.type === 'play' && window.__stopAt != null && this.round === window.__stopAt) { LL.debug.setBot(false); LL.debug.setSpeed(1); window.__stopAt = null; }
      return o.call(this, e); };
    const pd = w.pointerDown; window.__hits = [];
    w.pointerDown = function (x, y) { const r = pd.call(this, x, y); window.__hits.push(r); return r; };
  });
  const cdp = await ctx.newCDPSession(page);
  return { ctx, page, errors, reqs, cdp, dev, close: () => ctx.close() };
}
const touch = (cdp, type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p.x, y: p.y, id: typeof p.id === 'number' ? p.id : i, radiusX: 4, radiusY: 4, force: 1 })) });
const evs = (page, t) => page.evaluate(t => window.__ev.filter(e => e.type === t), t);
const waitPlay = (page, t = 30000) => page.waitForFunction(() => { const w = LL.debug.world; return LL.debug.mode === 'play' && w.state === 'round' && w.phase === 'play' && w.open.length === 0 && w.cards.every(c => c.state !== 'down' || c.open < 0.3); }, null, { timeout: t });
async function start(c, speed = 6) { await c.page.evaluate(s => { LL.debug.setSpeed(s); LL.debug.startGame(); }, speed); await waitPlay(c.page); await c.page.evaluate(() => LL.debug.setSpeed(1)); await sleep(200); }
const downs = page => page.evaluate(() => LL.debug.world.cards.filter(c => c.state === 'down').map(c => Object.assign({ id: c.id, key: c.key }, LL.debug.cardScreen(c.id))));
async function ensure(c, n) {
  await c.page.waitForFunction(() => { const w = LL.debug.world; return w.state !== 'round' || w.phase !== 'resolve'; }, null, { timeout: 8000 }).catch(() => {});
  await sleep(300);
  if ((await downs(c.page)).length >= n && await c.page.evaluate(() => LL.debug.world.open.length === 0 && LL.debug.world.phase === 'play')) return;
  await c.page.evaluate(() => { window.__stopNext = 1; LL.debug.setBot(true, 1); LL.debug.setSpeed(8); });
  await c.page.waitForFunction(() => !LL.debug.bot, null, { timeout: 60000 });
  await waitPlay(c.page); await sleep(200);
  if ((await downs(c.page)).length < n) return ensure(c, n);
}
const ctr = r => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const nan = page => page.evaluate(() => {
  const w = LL.debug.world, b = [];
  const f = (o, t) => o && Object.keys(o).forEach(k => { if (typeof o[k] === 'number' && !isFinite(o[k])) b.push(t + '.' + k); });
  (w.cards || []).forEach(c => f(c, 'c' + c.id)); f(w.lolo, 'lolo'); if (w.lolo.vine) f(w.lolo.vine, 'vine'); if (w.critter) f(w.critter, 'critter');
  f(w, 'w'); return b;
});
const inside = page => page.evaluate(() => {
  const w = LL.debug.world, v = LL.debug.view(), out = [];
  if (w.state !== 'round' || w.phase === 'scroll') return out;
  for (const c of w.cards) { const B = LL.World.leafBounds(c); const l = v.left + B.x * v.s, t = v.top + B.y * v.s, r = l + B.w * v.s, bt = t + B.h * v.s;
    if (l < -1 || t < -1 || r > innerWidth + 1 || bt > innerHeight + 1) out.push('leaf ' + c.id + ' out ' + [l, t, r, bt].map(Math.round)); }
  const L = w.loloBox(); const ll = v.left + L.x * v.s, lt = v.top + L.y * v.s;
  if (ll < -2 || lt < -2 || ll + L.w * v.s > innerWidth + 2 || lt + L.h * v.s > innerHeight + 2) out.push('lolo out');
  return out;
});

/* ---------------------------------------------------------------- groups */
async function gAssets() {
  const c = await open(DEV.iphoneP, 'mute=1');
  await sleep(500);
  const a = await c.page.evaluate(() => ({ files: LL.Assets.files, missing: Object.keys(LL.Assets.files).filter(n => !LL.Assets.images[n]), n: Object.keys(LL.Assets.files).length }));
  check(`assets: all ${a.n} assets.js files decoded`, a.missing.length === 0, a.missing);
  const badR = c.reqs.filter(r => r.status === 'failed' || r.status >= 400);
  check('assets: no 4xx / failed requests at boot', badR.length === 0, badR);
  const notReq = Object.values(a.files).filter(f => !c.reqs.some(r => r.url.endsWith(f)));
  check('assets: every asset actually requested over the network', notReq.length === 0, notReq);
  const ext = c.reqs.filter(r => !r.url.startsWith(srv.url));
  check('assets: no off-device requests', ext.length === 0, ext);
  const m = await c.page.evaluate(async () => {
    const man = await (await fetch('manifest.webmanifest')).json(); const out = { name: man.name, icons: [] };
    for (const i of man.icons.concat([{ src: 'assets/icons/apple-touch-icon.png' }, { src: 'assets/default/icon.svg' }])) {
      const img = new Image(); img.src = i.src; await img.decode().catch(() => {}); out.icons.push({ src: i.src, sizes: i.sizes, w: img.naturalWidth, h: img.naturalHeight });
    }
    out.meta = [...document.querySelectorAll('meta')].map(x => (x.name || x.getAttribute('property') || '') + '=' + x.content).filter(x => /viewport|apple|theme/.test(x));
    return out;
  });
  const iconOk = m.icons.every(i => i.w > 0 && (!i.sizes || i.sizes === i.w + 'x' + i.h));
  check('assets: manifest icons + apple-touch-icon load with declared sizes', iconOk, m.icons);
  note('assets: meta tags', m.meta);
  check('assets: zero console errors / warnings', c.errors.length === 0, c.errors);
  await c.close();
}

async function gSwingHit() {
  for (const d of [DEV.iphoneP, DEV.ipadL]) {
    const c = await open(d, 'mute=1&seed=5&age=5');
    await start(c);
    // open a non-matching pair so both leaves get the close kick, then measure the visible leaf area that hits
    const ds = await downs(c.page); const a = ds[0], b = ds.find(x => x.key !== a.key);
    await c.page.touchscreen.tap(ctr(a).x, ctr(a).y); await sleep(150); await c.page.touchscreen.tap(ctr(b).x, ctr(b).y);
    let worst = { frac: 1 }, maxSw = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 5000) {
      const r = await c.page.evaluate(() => {
        const w = LL.debug.world, out = [];
        for (const c of w.cards) {
          const cs = Math.cos(c.swing), sn = Math.sin(c.swing); let hit = 0, n = 0, other = 0;
          for (let u = -0.45; u <= 0.451; u += 0.1) for (let v = -0.45; v <= 0.451; v += 0.1) {
            const lx = u * c.w, ly = (c.y - c.py) + v * c.h;               // relative to pivot, unrotated
            const X = c.px + cs * lx - sn * ly, Y = c.py + sn * lx + cs * ly;
            const h = w._hit(X, Y); n++; if (h === c) hit++; else if (h) other++;
          }
          out.push({ id: c.id, sw: c.swing, frac: hit / n, other: other / n, state: c.state });
        }
        return out;
      });
      for (const x of r) { maxSw = Math.max(maxSw, Math.abs(x.sw)); if (x.frac < worst.frac) worst = x; }
      await sleep(40);
    }
    note(`swinghit/${d.name}: max |swing| ${maxSw.toFixed(3)} rad; worst visible-leaf hit fraction`, worst);
    check(`swinghit/${d.name}: ≥ 90 % of the drawn (swung) leaf hits that leaf`, worst.frac >= 0.9, worst);
    // real tap on the drawn lower corner of the most-swung down leaf
    await waitPlay(c.page);
    const p = await c.page.evaluate(() => {
      const w = LL.debug.world, v = LL.debug.view();
      const c = w.cards.filter(c => c.state === 'down').sort((a, b) => Math.abs(b.swing) - Math.abs(a.swing))[0];
      const s = c.swing, lx = (s > 0 ? -0.4 : 0.4) * c.w, ly = (c.y - c.py) + 0.42 * c.h;
      const X = c.px + Math.cos(s) * lx - Math.sin(s) * ly, Y = c.py + Math.sin(s) * lx + Math.cos(s) * ly;
      return { id: c.id, sw: s, x: v.left + X * v.s, y: v.top + Y * v.s };
    });
    await c.page.evaluate(() => { window.__hits = []; });
    await touch(c.cdp, 'touchStart', [p]); await touch(c.cdp, 'touchEnd', []); await sleep(100);
    const h = await c.page.evaluate(() => window.__hits);
    note(`swinghit/${d.name}: real tap on the swung leaf's lower outer corner (sw ${p.sw.toFixed(3)})`, { want: p.id, got: h });
    check(`swinghit/${d.name}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
}

async function gTouch() {
  for (const d of ALL) {
    const c = await open(d, 'mute=1&seed=9&age=5');
    await start(c);
    const tag = 'touch/' + d.name;
    // two fingers at once on two leaves
    let ds = await downs(c.page);
    await c.page.evaluate(() => { window.__ev = []; });
    await touch(c.cdp, 'touchStart', [ctr(ds[0]), ctr(ds[1])]); await sleep(60); await touch(c.cdp, 'touchEnd', []); await sleep(200);
    let fl = await evs(c.page, 'flip');
    check(`${tag}: two fingers down together → exactly one flip`, fl.length === 1, fl.map(f => f.id));
    // let the leaf close or pair it: wait for play with nothing open
    await sleep(3500); await ensure(c, 4);
    // a second finger lands while the first is held
    ds = await downs(c.page);
    await c.page.evaluate(() => { window.__ev = []; });
    const A = ctr(ds[0]), B = ctr(ds.find(x => x.key !== ds[0].key));
    await touch(c.cdp, 'touchStart', [{ ...A, id: 1 }]); await sleep(80);
    await touch(c.cdp, 'touchStart', [{ ...A, id: 1 }, { ...B, id: 2 }]); await sleep(80);
    await touch(c.cdp, 'touchEnd', [{ ...A, id: 1 }]); await sleep(80); await touch(c.cdp, 'touchEnd', []); await sleep(200);
    fl = await evs(c.page, 'flip');
    check(`${tag}: second finger while the first is held is ignored`, fl.length === 1, fl.map(f => f.id));
    await sleep(3500); await ensure(c, 4);
    // a finger that moves onto another leaf and lifts there → one flip only (the first leaf)
    ds = await downs(c.page);
    await c.page.evaluate(() => { window.__ev = []; });
    const P0 = ctr(ds[0]), P1 = ctr(ds[ds.length - 1]);
    await touch(c.cdp, 'touchStart', [P0]);
    for (let i = 1; i <= 12; i++) { await touch(c.cdp, 'touchMove', [{ x: P0.x + (P1.x - P0.x) * i / 12, y: P0.y + (P1.y - P0.y) * i / 12 }]); await sleep(16); }
    await touch(c.cdp, 'touchEnd', []); await sleep(250);
    fl = await evs(c.page, 'flip');
    check(`${tag}: drag across leaves then release → exactly one flip (the start leaf)`, fl.length === 1 && fl[0].id === ds[0].id, fl.map(f => f.id));
    await sleep(3500); await ensure(c, 6);
    // rapid 6-tap burst on 6 different leaves (≈ 25 ms apart)
    ds = await downs(c.page);
    await c.page.evaluate(() => { window.__ev = []; });
    const m0 = await c.page.evaluate(() => LL.debug.world.mismatches);
    for (const x of ds.slice(0, 6)) { await touch(c.cdp, 'touchStart', [ctr(x)]); await touch(c.cdp, 'touchEnd', []); await sleep(25); }
    await sleep(300);
    const s = await c.page.evaluate(() => ({ open: LL.debug.world.open.length, mm: LL.debug.world.mismatches, phase: LL.debug.world.phase }));
    fl = await evs(c.page, 'flip');
    const ms = (await evs(c.page, 'match')).length, mms = (await evs(c.page, 'mismatch')).length;
    check(`${tag}: rapid burst → flips ≤ 2·matches + 2, ≤ 1 mismatch, ≤ 2 open`, fl.length <= 2 * ms + 2 && mms <= 1 && s.open <= 2 && s.mm - m0 <= 1, { flips: fl.length, matches: ms, mismatchEv: mms, ...s, m0 });
    await sleep(4000);
    const ok = await c.page.waitForFunction(() => (LL.debug.world.phase === 'play' && LL.debug.world.open.length <= 1) || LL.debug.world.state !== 'round', null, { timeout: 8000 }).then(() => true, () => false);
    check(`${tag}: game recovers to play after the burst`, ok);
    check(`${tag}: no NaN`, (await nan(c.page)).length === 0, await nan(c.page));
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
}

async function gCritter() {
  const seen = {};
  for (const d of [DEV.iphoneP, DEV.ipadL]) {
    for (let lvl = 0; lvl < 3; lvl++) {
      const c = await open(d, `mute=1&seed=31&age=4&level=${lvl}`);
      await c.page.evaluate(() => { window.__stopAt = 2; LL.debug.setBot(true, 1); LL.debug.setSpeed(12); LL.debug.startGame(); });
      await c.page.waitForFunction(() => !LL.debug.bot && LL.debug.world.round === 2 && LL.debug.world.phase === 'play', null, { timeout: 90000 });
      await sleep(1500);
      // find a point that is inside both the critter's tight box and a leaf
      await c.page.evaluate(() => LL.debug.setSpeed(0.02));
      let r = null; const t0 = Date.now();
      while (!r && Date.now() - t0 < 12000) {
        r = await c.page.evaluate(() => {
          const w = LL.debug.world, k = w.critterRect(), v = LL.debug.view(); if (!k || !w.critter) return null;
          if (w.critter.type === 'frog') { const L = w.loloBox(); const x0 = Math.max(k.x, L.x), x1 = Math.min(k.x + k.w, L.x + L.w), y0 = Math.max(k.y, L.y), y1 = Math.min(k.y + k.h, L.y + L.h);
            return x1 > x0 && y1 > y0 ? { type: 'frog', on: 'lolo', x: v.left + (x0 + x1) / 2 * v.s, y: v.top + (y0 + y1) / 2 * v.s } : null; }
          for (const c of w.cards) { const R = w.cardRect(c); const x0 = Math.max(k.x, R.x - 10), x1 = Math.min(k.x + k.w, R.x + R.w + 10), y0 = Math.max(k.y, R.y - 10), y1 = Math.min(k.y + k.h, R.y + R.h + 10);
            if (x1 - x0 > 6 && y1 - y0 > 6) return { type: w.critter.type, on: c.id, state: c.state, x: v.left + (x0 + x1) / 2 * v.s, y: v.top + (y0 + y1) / 2 * v.s }; }
          return null;
        });
        if (!r) { await c.page.evaluate(() => LL.debug.setSpeed(1)); await sleep(60); await c.page.evaluate(() => LL.debug.setSpeed(0.02)); await sleep(40); }
      }
      const type = await c.page.evaluate(() => LL.debug.world.critter && LL.debug.world.critter.type);
      if (!r) { note(`critter/${d.name}/L${lvl}: ${type} never overlapped a leaf/Lolo in 12 s`, null); await c.close(); continue; }
      seen[r.type] = 1;
      await c.page.evaluate(() => { window.__hits = []; window.__ev = []; });
      const inK = await c.page.evaluate(p => { const w = LL.debug.world, v = LL.debug.view(), k = w.critterRect(); const x = (p.x - v.left) / v.s, y = (p.y - v.top) / v.s; return { st: w.critter.state, inside: !!k && x >= k.x && x <= k.x + k.w && y >= k.y && y <= k.y + k.h }; }, r);
      r.st = inK.st; r.stillInside = inK.inside;
      await touch(c.cdp, 'touchStart', [r]); await touch(c.cdp, 'touchEnd', []); await sleep(200);
      const h = await c.page.evaluate(() => ({ hits: window.__hits, flips: window.__ev.filter(e => e.type === 'flip').length, mm: window.__ev.filter(e => e.type === 'mismatch').length }));
      if (r.type === 'frog') note(`critter/${d.name}: tap where the frog overlaps Lolo`, { r, h });
      else check(`critter/${d.name}: tap where the ${r.type} overlaps leaf ${r.on} → critter, no flip`, h.hits[0] === 'critter' && h.flips === 0, { r, h });
      check(`critter/${d.name}/L${lvl}: zero console errors`, c.errors.length === 0, c.errors);
      await c.close();
    }
  }
  note('critter: overlap types exercised', Object.keys(seen));
}

async function gTalk() {
  const POOLS = { 3: ['colors', 'shapes', 'size', 'animals', 'count'], 4: ['colors', 'shapes', 'count', 'food', 'animals', 'size'], 5: ['shapes', 'count', 'letters', 'food', 'animals', 'colors'], 6: ['lower', 'initial', 'add', 'count', 'letters'], 7: ['initial', 'add', 'sub', 'oddeven', 'count'] };
  for (const lang of (process.env.QA_LANGS || 'en,vi').split(',')) for (const age of (process.env.QA_AGES || '3,4,5,6,7').split(',').map(Number)) {
    const d = ALL[age % 4];
    const c = await open(d, `mute=1&age=${age}&lang=${lang}&seed=${age * 7}`);
    await start(c);
    const fails = [];
    for (const topic of POOLS[age].concat(age < 6 ? [] : ['food'])) {   // food also tried at 6–7 (not in pool: must not crash)
      await c.page.evaluate(t => { const w = LL.debug.world; w.topic = t; w._startTalk(); }, topic);
      const opened = await c.page.waitForFunction(() => LL.debug.mode === 'talk', null, { timeout: 4000 }).then(() => true, () => false);
      await sleep(300);
      const s = await c.page.evaluate(() => {
        const t = LL.debug.world.talk, bs = [...document.querySelectorAll('#talkChoices button')].map(b => { const r = b.getBoundingClientRect(); return { id: b.dataset.id, w: r.width, h: r.height, x: r.x + r.width / 2, y: r.y + r.height / 2, t: b.textContent, vis: r.bottom <= innerHeight && r.right <= innerWidth && r.top >= 0 && r.left >= 0 }; });
        return { q: document.getElementById('talkQ').textContent, title: document.getElementById('talkTitle').textContent, ans: t && String(t.answerId), bs, last: LL.debug.voiceLog.slice(-2).map(l => l.text) };
      });
      const right = s.bs.find(b => b.id === s.ans);
      const probs = [];
      if (!opened) probs.push('no talk mode');
      if (bad(s.q) || bad(s.title)) probs.push('text ' + s.q);
      if (lang === 'vi' && !/[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũ]/i.test(s.q + s.title)) probs.push('not VI: ' + s.q);
      if (s.bs.length < 2 || s.bs.length > 4 || s.bs.some(b => b.w < 64 || b.h < 64 || !b.vis)) probs.push('buttons ' + JSON.stringify(s.bs.map(b => [b.w | 0, b.h | 0, b.vis])));
      if (s.bs.some(b => bad(b.t))) probs.push('btn text');
      if (!right) probs.push('no right button');
      if (s.last.some(bad)) probs.push('voice ' + s.last);
      if (right) {
        await c.page.evaluate(() => { window.__ev = []; });
        await c.page.touchscreen.tap(right.x, right.y); await sleep(250);
        const tr = await evs(c.page, 'talkResult');
        if (!(tr.length === 1 && tr[0].correct)) probs.push('tap result ' + JSON.stringify(tr));
        const vl = await c.page.evaluate(() => LL.debug.voiceLog.slice(-1)[0]);
        if (vl && bad(vl.text)) probs.push('result line ' + vl.text);
      }
      if (probs.length) fails.push(topic + ': ' + probs.join('; '));
      else if (topic === 'food') note(`talk/${lang}/age${age}: food`, { q: s.q, choices: s.bs.map(b => b.t) });
      // back to a playing round for the next topic
      await c.page.evaluate(() => { LL.debug.setSpeed(16); });
      await c.page.waitForFunction(() => LL.debug.mode === 'play' && LL.debug.world.state === 'round', null, { timeout: 30000 }).catch(() => {});
      await c.page.evaluate(() => LL.debug.setSpeed(1));
    }
    check(`talk/${lang}/age${age} (${d.name}): every pool topic opens, clean, ≥ 64 px, right answer by tap`, fails.length === 0, fails);
    check(`talk/${lang}/age${age}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
}

async function gRotate() {
  for (const [a, b, phase] of [[DEV.iphoneL, DEV.iphoneP, 'grab'], [DEV.iphoneP, DEV.iphoneL, 'release'], [DEV.ipadL, DEV.ipadP, 'leap'], [DEV.ipadP, DEV.ipadL, 'grab']]) {
    const c = await open(a, 'mute=1&seed=3&age=4');
    await c.page.evaluate(ph => {
      window.__rot = null; const w = LL.debug.world, o = w._emit;
      w._emit = function (e) { if (e.type === 'swing' && e.phase === ph && this.round === 1 && !window.__rot) { window.__rot = 1; LL.debug.setSpeed(0.25); } return o.call(this, e); };
      LL.debug.setBot(true, 1); LL.debug.setSpeed(6); LL.debug.startGame();
    }, phase);
    await c.page.waitForFunction(() => window.__rot === 1, null, { timeout: 60000 });
    const before = await c.page.evaluate(() => ({ hang: LL.debug.world.lolo.hang, vp: LL.debug.world.lolo.vine && LL.debug.world.lolo.vine.phase }));
    await c.page.setViewportSize(b.viewport); await sleep(400);
    const tag = `rotate/${a.name}→${b.name} at ${phase} (${before.vp})`;
    const nn = new Set(); const t0 = Date.now(); let lolo = [];
    while (Date.now() - t0 < 6000) {
      (await nan(c.page)).forEach(x => nn.add(x));
      lolo.push(await c.page.evaluate(() => { const w = LL.debug.world, v = LL.debug.view(), L = w.loloBox(); return { ph: w.phase, x: v.left + L.x * v.s, y: v.top + L.y * v.s, r: v.left + (L.x + L.w) * v.s, b: v.top + (L.y + L.h) * v.s, iw: innerWidth, ih: innerHeight }; }));
      await sleep(60);
    }
    await c.page.evaluate(() => { LL.debug.setBot(false); LL.debug.setSpeed(1); });
    const ok = await c.page.waitForFunction(() => LL.debug.world.phase === 'play', null, { timeout: 15000 }).then(() => true, () => false);
    await sleep(300);
    const st = await c.page.evaluate(() => { const w = LL.debug.world; return { phase: w.phase, hang: w.lolo.hang, dx: w.lolo.dx, bdx: w.buildingDx, vine: !!w.lolo.vine, W: w.layout.W, H: w.layout.H }; });
    const sw = (await evs(c.page, 'swing')).filter(e => e.wt > 0).map(e => e.phase).join(',');
    check(`${tag}: no NaN during/after`, nn.size === 0, [...nn]);
    const offs = lolo.filter(l => l.ph === 'scroll' && (l.y < -40 || l.b > l.ih + 40));
    check(`${tag}: Lolo stays on screen vertically while swinging`, offs.length === 0, offs.slice(0, 3));
    check(`${tag}: lands, play starts, nothing hanging, dx 0`, ok && !st.hang && Math.abs(st.dx) < 0.5 && Math.abs(st.bdx || 0) < 0.5 && !st.vine, st);
    check(`${tag}: leaves + Lolo inside the new screen`, (await inside(c.page)).length === 0, await inside(c.page));
    note(`${tag}: swing events`, sw);
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
}

async function gVoice() {
  for (const lang of ['en', 'vi']) {
    const c = await open(DEV.iphoneP, `mute=1&age=4&lang=${lang}&seed=17`);
    await c.page.evaluate(() => { LL.debug.setBot(true, 0.7); LL.debug.setSpeed(20); LL.debug.startGame(); });
    await c.page.waitForFunction(() => LL.debug.world.state === 'round', null, { timeout: 15000 });
    await c.page.evaluate(() => { const w = LL.debug.world; w.levels = ['food', 'colors', 'food', 'count']; });
    await c.page.evaluate(() => LL.debug.world.startLevel(0));
    await c.page.waitForFunction(() => LL.debug.mode === 'done', null, { timeout: 240000 });
    const r = await c.page.evaluate(() => ({ log: LL.debug.voiceLog.map(l => l.lang + '|' + l.text), ev: window.__ev.filter(e => ['match', 'backflip', 'swing', 'mismatch'].includes(e.type)).map(e => e.type + (e.phase ? ':' + e.phase : '') + (e.animal ? ':' + e.animal + '>' + e.food : '')) }));
    const T = await c.page.evaluate(l => { const a = new Set(), b = new Set(); for (let i = 0; i < 300; i++) { a.add(LL.I18N.t(l, 'swing', { child: '' })); b.add(LL.I18N.t(l, 'backflip', { child: '' })); } return { sws: [...a], bfs: [...b], bf: [...b][0] }; }, lang);
    const foodM = r.ev.filter(e => /^match:/.test(e) && e.includes('>'));
    const foodLines = r.log.filter(l => lang === 'en' ? /loves? (to eat )?(bamboo|peanuts?|carrots?|acorns?|honey|worms?|watermelon|cheese)/i.test(l) : /thích ăn/.test(l));
    note(`voice/${lang}: food match events / food match lines`, { events: foodM.length, lines: foodLines.length, sample: foodLines.slice(0, 4) });
    check(`voice/${lang}: food match line logged for food matches`, foodM.length > 0 && foodLines.length >= Math.min(foodM.length, 3), { foodM: foodM.slice(0, 3), lines: foodLines.slice(0, 3) });
    const badL = r.log.filter(l => bad(l.split('|').slice(1).join('|')));
    check(`voice/${lang}: no raw keys / braces / undefined in the whole voice log`, badL.length === 0, badL.slice(0, 5));
    check(`voice/${lang}: every logged line in ${lang}`, r.log.every(l => l.startsWith(lang + '|')), r.log.filter(l => !l.startsWith(lang + '|')).slice(0, 4));
    const swLines = r.log.filter(l => T.sws.includes(l.slice(3)));
    const bfLines = r.log.filter(l => T.bfs.includes(l.slice(3)));
    const nSwing = r.ev.filter(e => e === 'swing:grab').length, nBf = r.ev.filter(e => e.startsWith('backflip')).length;
    note(`voice/${lang}: swing grabs ${nSwing}, swing lines ${swLines.length}; backflips ${nBf}, backflip lines ${bfLines.length}`, { sw: swLines.slice(0, 2), bf: bfLines.slice(0, 2), keyBf: T.bf });
    check(`voice/${lang}: swing line spoken at least once per session`, swLines.length > 0, null);
    check(`voice/${lang}: backflip line spoken at least once per session`, bfLines.length > 0, { backflips: nBf });
    // recogniser on the food talk choices
    const rec = await c.page.evaluate(l => {
      const ch = ['bamboo', 'carrot', 'watermelon', 'honey', 'cheese', 'acorn', 'peanut', 'worm'].map((v, i) => ({ id: i, kind: 'food', value: v }));
      const tests = l === 'en' ? [['bamboo', 0], ['carrots', 1], ['a watermelon', 2], ['honey', 3], ['cheese please', 4], ['acorn', 5], ['peanuts', 6], ['worm', 7]]
        : [['cây tre', 0], ['cà rốt', 1], ['dưa hấu', 2], ['mật ong', 3], ['phô mai', 4], ['hạt dẻ', 5], ['đậu phộng', 6], ['con sâu', 7], ['lạc', 6], ['phomai', 4]];
      return tests.map(([s, id]) => ({ s, want: id, got: LL.Voice.match([s], ch, l) }));
    }, lang);
    const miss = rec.filter(x => x.got !== x.want);
    check(`voice/${lang}: LL.Voice.match maps spoken food words to the right choice`, miss.length === 0, miss);
    check(`voice/${lang}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
}

(async () => {
  srv = await serve(); browser = await chromium.launch();
  const groups = { assets: gAssets, swinghit: gSwingHit, touch: gTouch, critter: gCritter, talk: gTalk, rotate: gRotate, voice: gVoice };
  for (const [g, fn] of Object.entries(groups)) {
    if (!want(g)) continue; G = g; console.log('== ' + g);
    try { await fn(); } catch (e) { check(g + ': group crashed', false, String(e && e.stack || e).slice(0, 500)); }
  }
  await browser.close(); srv.close();
  fs.writeFileSync(path.join(OUT, 'probe.json'), JSON.stringify(results, null, 1));
  const ch = results.filter(r => !r.note);
  console.log(`\nSUMMARY ${ch.filter(r => r.ok).length}/${ch.length} pass`);
})();
