// Visual QA capture (report-only): every screen × device × language, moods, topics × ages, surprises.
//   PART=flow|topics|surprise DEV=iphone-portrait,... LANGS=en,vi node tests/qa/visual.js
// Writes tests/out/qa_visual/<part>/<dev>-<lang>-<name>.png + geo.json (layout / DOM / mat geometry at each shot).
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const PART = process.env.PART || 'flow';
const OUT = path.join(__dirname, '..', 'out', 'qa_visual', PART); fs.mkdirSync(OUT, { recursive: true });
const DEVICES = [
  { name: 'iphone-portrait', viewport: { width: 393, height: 852 }, dpr: 3, n: { t: 59, r: 0, b: 34, l: 0 } },
  { name: 'iphone-landscape', viewport: { width: 852, height: 393 }, dpr: 3, n: { t: 0, r: 59, b: 21, l: 59 } },
  { name: 'ipad-portrait', viewport: { width: 820, height: 1180 }, dpr: 2, n: { t: 24, r: 0, b: 20, l: 0 } },
  { name: 'ipad-landscape', viewport: { width: 1180, height: 820 }, dpr: 2, n: { t: 24, r: 0, b: 20, l: 0 } }
].filter(d => !process.env.DEV || process.env.DEV.split(',').includes(d.name));
const LANGS = (process.env.LANGS || 'en,vi').split(',');
const geo = [];
const errors = [];

async function geometry(page) {
  return page.evaluate(() => {
    const w = DK.debug.world, v = DK.debug.view(), L = w.layout;
    const r = el => { const e = document.getElementById(el); if (!e) return null; const b = e.getBoundingClientRect(); const cs = getComputedStyle(e);
      return { x: b.x, y: b.y, w: b.width, h: b.height, vis: !e.classList.contains('hidden') && cs.display !== 'none' && cs.visibility !== 'hidden', op: +cs.opacity,
        sw: e.scrollWidth, cw: e.clientWidth, sh: e.scrollHeight, ch: e.clientHeight, text: (e.innerText || '').slice(0, 120) }; };
    const toS = (x, y) => ({ x: v.left + x * v.s, y: v.top + y * v.s });
    const mats = (w.mats || []).filter(m => m.state !== 'hidden' && m.state !== 'gone').map(m => {
      const f = DK.World.matFoot(L, m.x, m.y, m.ds); const a = toS(f.x0 != null ? f.x0 : f.x, f.y0 != null ? f.y0 : f.y);
      return { id: m.id, x: m.x, y: m.y, ds: m.ds, state: m.state, target: m.target, thing: m.thing, foot: f, S: L.S * m.ds };
    });
    const props = DK.MeadowArt && DK.MeadowArt.campProps ? DK.MeadowArt.campProps(DK.debug.render().artLayout ? DK.debug.render().artLayout(L) : L).map(p => ({ kind: p.kind, box: p.box })) : [];
    const rk = w.rocket;
    return { W: v.W, H: v.H, s: v.s, left: v.left, top: v.top, ins: v.ins, state: w.state, phase: w.phase, topic: w.topic, mode: w.cur && w.cur.mode,
      layout: { bubble: L.bubble, hud: L.hud, play: L.play, camp: L.camp, meadow: L.meadow, horizon: L.horizon, pole: L.pole, poleBox: L.poleBox, slots: L.slots,
        pad: L.pad, pump: L.pump, mimiHome: L.mimiHome, mimiH: L.mimiH, S: L.S, itemH: L.itemH, hitR: L.hitR, keep: L.keep },
      mats, props, rocket: rk && { state: rk.state, x: rk.x, y: rk.y, rot: rk.rot, chute: rk.chute, top: rk.top, noseX: rk.noseX, noseY: rk.noseY, swing: rk.swing, chuteRot: rk.chuteRot },
      mimi: w.mimi && { x: w.mimi.x, y: w.mimi.y, frame: w.mimi.frame, state: w.mimi.state, onPump: w.mimi.onPump },
      pennants: (w.pennants || []).map(p => ({ x: p.x, y: p.y, w: p.w, h: p.h, thing: p.thing })),
      dom: { bubble: r('bubble'), bubbleText: r('bubbleText'), hud: r('hud'), btnPause: r('btnPause') },
      mode2: DK.debug.mode };
  });
}

(async () => {
  const srv = await serve();
  const browser = await chromium.launch();
  for (const d of DEVICES) for (const lang of LANGS) {
    const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true });
    await ctx.addInitScript(n => {
      document.addEventListener('DOMContentLoaded', () => {
        const st = document.createElement('style');
        st.textContent = `:root { --sa-t: ${n.t}px !important; --sa-r: ${n.r}px !important; --sa-b: ${n.b}px !important; --sa-l: ${n.l}px !important; }`;
        document.head.appendChild(st);
      });
    }, d.n);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(d.name + ' ' + lang + ' pageerror: ' + String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(d.name + ' console: ' + m.text()); });
    const tag = `${d.name}-${lang}`;
    const shot = async name => { const f = `${tag}-${name}.png`; await page.screenshot({ path: path.join(OUT, f) }); try { geo.push(Object.assign({ shot: f }, await geometry(page))); } catch (e) { geo.push({ shot: f, err: String(e) }); } };
    const until = (fn, arg, t = 60000) => page.waitForFunction(fn, arg, { timeout: t, polling: 'raf' });
    const speed = n => page.evaluate(n => DK.debug.setSpeed(n), n);
    const boot = async (age, seed, extra = '') => {
      await page.goto(`${srv.url}?mute=1&seed=${seed}&age=${age}&lang=${lang}${extra}`);
      await until(() => window.DK && DK.debug && DK.debug.mode === 'title');
    };
    const tapRight = () => page.evaluate(() => { const w = DK.debug.world, h = w.matHit(w.answer().id); w.pointerDown(h.x, h.y); w.pointerUp(h.x, h.y); });
    const stomp = () => page.evaluate(() => { const w = DK.debug.world, p = w.layout.pump; w.pointerDown(p.x, p.y); w.pointerUp(p.x, p.y); });
    const play = (m, topic) => page.evaluate(([m, t]) => { const w = DK.debug.world; if (t) w.levels[m] = t; w.startLevel(m); DK.debug.weather.setWeather(m % 4, { instant: true }); }, [m, topic]);
    const waitPlay = () => until(() => { const w = DK.debug.world; return w.state === 'round' && w.phase === 'play' && w.phaseTime > 0.6 && w.answer(); }, null, 90000);

    try {
      if (PART === 'flow') {
        await boot(4, 5);
        await page.waitForTimeout(1200); await shot('title');
        await page.evaluate(() => { DK.UI.refreshSettings && DK.UI.refreshSettings(); DK.UI.only('scrSettings'); });
        await page.waitForTimeout(400); await shot('settings');
        await page.evaluate(() => { DK.UI.only('scrTitle'); DK.debug.startGame(); });
        for (let m = 0; m < 4; m++) {
          const topic = ['colors', 'shapes', 'count', 'animals'][m];
          const mt = `m${m}`;
          await play(m, topic);
          await until(() => DK.debug.world.state === 'intro' && DK.debug.world.stateTime > 1.0).catch(() => {});
          await shot(`${mt}-banner`);
          await speed(4); await waitPlay(); await speed(1); await page.waitForTimeout(500);
          await shot(`${mt}-play`);
          if (m === 0) { await page.click('#btnPause'); await page.waitForTimeout(500); await shot('pause'); await page.click('#btnResume'); await page.waitForTimeout(400); }
          await speed(0.3); await tapRight();
          await until(() => DK.debug.world.phase === 'aim' && DK.debug.world.phaseTime > 0.3).catch(() => {});
          await shot(`${mt}-aim`);
          await until(() => DK.debug.world.phase === 'pump'); await speed(1);
          await stomp(); await page.waitForTimeout(300); await stomp(); await page.waitForTimeout(80);
          await shot(`${mt}-pump`);
          await page.waitForTimeout(300); await speed(0.15); await stomp();
          await until(() => DK.debug.world.rocket.state === 'boost' && DK.debug.world.rocket.t > 0.12, null, 20000).catch(() => {});
          await shot(`${mt}-boost`);
          await until(() => DK.debug.world.rocket.state === 'coast' && DK.debug.world.rocket.vy > -250);
          await shot(`${mt}-coast`);
          await until(() => { const r = DK.debug.world.rocket; return r.state === 'chute' && r.chute > 0.9; });
          await shot(`${mt}-chute`);
          await speed(0.5);
          await until(() => { const r = DK.debug.world.rocket, mt = DK.debug.world.matById(DK.debug.world.chosen); return r.state === 'chute' && mt && mt.y - r.y < 200; });
          await speed(0.12); await shot(`${mt}-chutelow`);
          await speed(1);
          await until(() => DK.debug.events.some(e => e.type === 'land' && !e._qa)); await page.evaluate(() => DK.debug.events.forEach(e => e._qa = 1));
          await speed(0.2); await page.waitForTimeout(400); await shot(`${mt}-land`);
          await speed(1);
          await until(() => !!DK.debug.world.flyer); await speed(0.15); await page.waitForTimeout(500); await shot(`${mt}-collect`);
          await speed(1);
          await until(() => DK.debug.events.some(e => e.type === 'pennant' && !e._qa)); await page.evaluate(() => DK.debug.events.forEach(e => e._qa = 1));
          await page.waitForTimeout(500); await shot(`${mt}-pennant`);
          await page.evaluate(() => { DK.debug.setBot(true, 1); DK.debug.setSpeed(3); });
          await until(() => DK.debug.world.phase === 'camp' && DK.debug.world.phaseTime > 0.8);
          await speed(0.5); await until(() => DK.debug.world.fountain && DK.debug.world.fountain.h > 160).catch(() => {});
          await speed(0.1); await shot(`${mt}-camp`);
          await speed(1);
          await until(() => DK.debug.world.wipe && DK.debug.world.wipe.t > 0.3); await speed(0.1); await shot(`${mt}-wipe`);
          await page.evaluate(() => DK.debug.setBot(false)); await speed(1);
          if (m === 1) {
            await page.evaluate(() => { DK.debug.setBot(true, 1); DK.debug.setSpeed(8); });
            await until(() => DK.debug.world.state === 'talk' && !DK.debug.world.talkAnswered, null, 200000);
            await page.evaluate(() => { DK.debug.setBot(false); DK.debug.setSpeed(1); }); await page.waitForTimeout(1200);
            await shot('talk');
            await page.evaluate(() => { DK.debug.setBot(true, 1); DK.debug.setSpeed(8); });
            await until(() => DK.debug.mode === 'play' && DK.debug.world.state === 'round', null, 120000);
            await page.evaluate(() => { DK.debug.setBot(false); DK.debug.setSpeed(1); });
          }
        }
        await page.evaluate(() => { DK.debug.setBot(true, 1); DK.debug.setSpeed(10); });
        await until(() => DK.debug.mode === 'done', null, 400000);
        await speed(1); await page.waitForTimeout(3000); await shot('done');
        await page.waitForTimeout(1800); await shot('done2');
      } else if (PART === 'topics') {
        const ALL = ['colors', 'shapes', 'size', 'animals', 'count', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
        const AGES = (process.env.AGES || '3,4,5,6,7').split(',').map(Number);
        for (const age of AGES) {
          await boot(age, 20 + age);
          await page.evaluate(() => DK.debug.startGame());
          for (const t of ALL) {
            for (const rd of (t === 'count' ? [0, 1, 2] : [0])) {
              try {
                await play(age % 4, t);  // mood rotates with the age
                if (rd) { await page.evaluate(rd => { DK.debug.setBot(true, 1); DK.debug.setSpeed(8); }, rd);
                  await until(rd => DK.debug.world.round >= rd && DK.debug.world.phase === 'unfold', rd, 120000); await page.evaluate(() => DK.debug.setBot(false)); }
                await speed(6); await waitPlay(); await speed(1); await page.waitForTimeout(450);
                await shot(`a${age}-${t}${rd ? '-r' + rd : ''}`);
              } catch (e) { errors.push(`${tag} age ${age} ${t}: ${e.message.split('\n')[0]}`); }
            }
          }
        }
      } else if (PART === 'surprise') {
        for (const [i, kind] of [['0', 'marmot'], ['1', 'goat'], ['3', 'bird']]) {
          await boot(4, 31 + +i);
          await page.evaluate(([lv, kind]) => {
            const w = DK.debug.world; w.cfg.surpriseTypes = [kind === 'bird' ? 'marmot' : kind]; w.cfg.surpriseRounds = [1]; w.cfg.surpriseAt = [0.5, 0.6];
            DK.debug.startGame(); w.levels[lv] = 'colors'; w.startLevel(lv); w._surpriseRound = 1; DK.debug.weather.setWeather(lv, { instant: true });
            DK.debug.setBot(true, 1); DK.debug.setSpeed(6);
          }, [+i, kind]);
          await until(k => { const s = DK.debug.world[k]; return s && (s.state === 'look' || s.state === 'wave' || s.state === 'stand' || s.state === 'perch'); }, kind, 120000);
          await page.evaluate(() => { DK.debug.setBot(false); DK.debug.setSpeed(1); }); await page.waitForTimeout(1500);
          await shot(`surprise-${kind}`);
        }
      }
    } catch (e) { errors.push(`${tag}: ${e.message.split('\n')[0]}`); await shot('fail').catch(() => {}); }
    await ctx.close();
  }
  await browser.close(); srv.close();
  fs.writeFileSync(path.join(OUT, `geo-${process.env.DEV || "all"}-${LANGS.join("")}.json`), JSON.stringify(geo, null, 1));
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'ok → ' + OUT);
})();
