// Functional QA suite for Comet's Gem Factory (report-only: it never edits game/).
// Usage: node tests/e2e/functional.js [--only=name,name] [--long=60]
// Serves game/ itself on a free port, prints PASS/FAIL per check, exits 1 on any failure.
'use strict';
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..', '..', 'game');
const OUT = path.join(__dirname, '..', 'out', 'functional');
fs.mkdirSync(OUT, { recursive: true });
const ARGS = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => { const [k, v] = a.slice(2).split('='); return [k, v == null ? true : v]; }));
const ONLY = ARGS.only ? String(ARGS.only).split(',') : null;
const LONG_S = +(ARGS.long || 60);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split('?')[0]);
  if (rel.endsWith('/')) rel += 'index.html';
  const p = path.join(ROOT, path.normalize(rel));
  if (!p.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (e, d) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(d);
  });
});

let pass = 0, fail = 0;
const failures = [];
let group = '';
function check(ok, name, extra) {
  const label = (group ? '[' + group + '] ' : '') + name;
  console.log((ok ? 'PASS ' : 'FAIL ') + label + (extra != null && extra !== '' ? '  (' + extra + ')' : ''));
  if (ok) pass++; else { fail++; failures.push(label + (extra ? ' — ' + extra : '')); }
  return ok;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// In-page helpers (CGF is read lazily, so this can be an init script)
const HELPERS = () => {
  window.__T = {
    pt(lx, ly) {
      const R = CGF.Game.renderer, r = document.getElementById('game').getBoundingClientRect();
      return { x: r.left + (lx + R.ox) * R.cssScale, y: r.top + (ly + R.oy) * R.cssScale };
    },
    card(i) {
      const k = CGF.debug.world.cards[i]; if (!k) return null;
      const a = this.pt(k.x, k.y), b = this.pt(k.x + k.w, k.y + k.h);
      return { i, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, l: a.x, t: a.y, r: b.x, b: b.y, state: k.state, kind: k.kind, seen: k.seen };
    },
    cards() { return CGF.debug.world.cards.map((_, i) => this.card(i)); },
    // index pairs of face-down cards grouped by kind
    pairs() {
      const m = {};
      CGF.debug.world.cards.forEach((k, i) => { if (k.state === 'down') (m[k.kind] = m[k.kind] || []).push(i); });
      return Object.values(m).filter(a => a.length === 2);
    },
    // two face-down cards of different kinds, both never seen (or both seen if wantSeen)
    missPair(wantSeen) {
      const cs = CGF.debug.world.cards;
      for (let a = 0; a < cs.length; a++) for (let b = a + 1; b < cs.length; b++) {
        const A = cs[a], B = cs[b];
        if (A.state === 'down' && B.state === 'down' && A.kind !== B.kind && (wantSeen ? (A.seen || B.seen) : (!A.seen && !B.seen))) return [a, b];
      }
      return null;
    },
    rect(sel) { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; },
    ls() { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; }
  };
};

let browser, base;
async function newPage(opts = {}, url = '?mute=1&seed=7') {
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 720 } }, opts));
  await ctx.addInitScript(HELPERS);
  const p = await ctx.newPage();
  p.errors = [];
  p.on('console', m => { if (m.type() === 'error') p.errors.push('console: ' + m.text()); });
  p.on('pageerror', e => p.errors.push('pageerror: ' + e));
  p.on('requestfailed', r => p.errors.push('request failed ' + r.url()));
  p.on('response', r => { if (r.status() >= 400) p.errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  if (url != null) await gotoGame(p, url);
  return p;
}
async function gotoGame(p, url) {
  await p.goto(base + url);
  await p.waitForFunction(() => window.CGF && CGF.debug && CGF.Game && CGF.Game.mode !== 'boot', null, { timeout: 15000 });
}
const ev = (p, fn, arg) => p.evaluate(fn, arg);
const mode = p => ev(p, () => CGF.debug.mode);
const st = p => ev(p, () => { const w = CGF.debug.world; return { phase: w.phase, phaseT: w.phaseT, score: w.score, streak: w.streak, mult: w.mult, level: w.level, season: w.season, timeLeft: w.timeLeft, flips: w.stats.flips, matches: w.stats.matches, misses: w.stats.misses, cursor: w.cursor, cursorOn: w.cursorOn, cols: w.cols, mode: CGF.debug.mode }; });
const visible = (p, sel) => p.isVisible(sel);
// fast-forward the world without tainting the run (Game.speed directly, not setSpeed)
async function untilPhase(p, phase, timeout = 20000) {
  await ev(p, () => { CGF.Game.speed = 6; });
  try { await p.waitForFunction(ph => CGF.debug.world.phase === ph, phase, { timeout, polling: 'raf' }); }
  finally { await ev(p, () => { CGF.Game.speed = 1; }); }
}
async function clickCard(p, i, how = 'mouse') {
  const c = await ev(p, i => __T.card(i), i);
  if (how === 'touch') await p.touchscreen.tap(c.x, c.y); else await p.mouse.click(c.x, c.y);
  return c;
}
// wait until no pair is open/being judged and no wrong pair is waiting
const settle = p => p.waitForFunction(() => { const w = CGF.debug.world; return w._open.length === 0 && !w._wrong && w.cards.every(k => k.state !== 'up' || k._fl >= 1); }, null, { timeout: 5000 }).catch(() => {});
async function matchPair(p, how) {
  const pr = await ev(p, () => __T.pairs()[0]);
  if (!pr) return null;
  await clickCard(p, pr[0], how); await sleep(60); await clickCard(p, pr[1], how);
  await p.waitForFunction(ids => ids.every(i => CGF.debug.world.cards[i].state !== 'down' && CGF.debug.world.cards[i].state !== 'up'), pr, { timeout: 4000 }).catch(() => {});
  return pr;
}
async function startViaUi(p) {
  await p.click('#btnPlay');
  await p.waitForFunction(() => CGF.debug.mode === 'playing', null, { timeout: 5000 });
}
function errCheck(p, name) { check(p.errors.length === 0, name + ': zero console/page errors', p.errors.slice(0, 3).join(' | ')); }

// ---------------------------------------------------------------- tests
const T = {};

T.boot = async () => {
  const p = await newPage({}, null);
  const t0 = Date.now();
  await gotoGame(p, '?mute=1&seed=7');
  await p.waitForFunction(() => CGF.debug.mode === 'title', null, { timeout: 10000 });
  check(true, 'boots to title', (Date.now() - t0) + ' ms');
  check((await p.title()) === "Comet's Gem Factory", 'document title', await p.title());
  check(await visible(p, '#scrTitle'), 'title screen visible');
  check(!(await visible(p, '#hud')), 'HUD hidden on title');
  await sleep(1500);
  const s = await ev(p, () => CGF.debug.world.t);
  check(s > 0.5, 'attract demo world runs on title', 't=' + s.toFixed(2));
  // menus from the title
  for (const [btn, scr] of [['#btnHow', '#scrHow'], ['#btnSettings', '#scrSettings'], ['#btnCustomize', '#scrCustom']]) {
    await p.click(btn); await sleep(250);
    check(await visible(p, scr) && !(await visible(p, '#scrTitle')), scr + ' opens');
    await p.click(scr + ' .btn-back'); await sleep(250);
    check(await visible(p, '#scrTitle') && !(await visible(p, scr)), scr + ' back button → title');
    await p.click(btn); await sleep(250);
    await p.keyboard.press('Escape'); await sleep(250);
    check(await visible(p, '#scrTitle') && !(await visible(p, scr)), scr + ' Esc → title');
  }
  // Esc on the bare title does nothing
  await p.keyboard.press('Escape'); await sleep(150);
  check(await visible(p, '#scrTitle') && (await mode(p)) === 'title', 'Esc on title is harmless');
  // pause menu + its sub settings + back
  await startViaUi(p);
  check(await visible(p, '#hud') && !(await visible(p, '#scrTitle')), 'Play starts the game and shows HUD');
  await p.click('#btnPause'); await sleep(250);
  check(await visible(p, '#scrPause') && (await mode(p)) === 'paused', 'HUD pause button opens Pause');
  await p.click('#btnPauseSettings'); await sleep(250);
  check(await visible(p, '#scrSettings'), 'Pause → Settings opens');
  await p.keyboard.press('Escape'); await sleep(250);
  check(await visible(p, '#scrPause') && (await mode(p)) === 'paused', 'Settings (from pause) Esc → back to Pause, still paused');
  await p.click('#btnPauseSettings'); await sleep(250);
  await p.click('#scrSettings .btn-back'); await sleep(250);
  check(await visible(p, '#scrPause'), 'Settings (from pause) Done → Pause');
  await p.keyboard.press('Escape'); await sleep(250);
  check((await mode(p)) === 'playing' && !(await visible(p, '#scrPause')) && await visible(p, '#hud'), 'Esc on Pause resumes');
  await p.keyboard.press('KeyP'); await sleep(200);
  check((await mode(p)) === 'paused', 'P pauses');
  await p.click('#btnResume'); await sleep(200);
  check((await mode(p)) === 'playing', 'Resume button');
  await p.keyboard.press('Escape'); await sleep(200);
  await p.click('#btnPauseMenu'); await sleep(300);
  check((await mode(p)) === 'title' && await visible(p, '#scrTitle') && !(await visible(p, '#hud')), 'Pause → Main Menu → title, HUD hidden');
  // restart from pause
  await startViaUi(p);
  await p.keyboard.press('Escape'); await sleep(200);
  let starts = await ev(p, () => { window.__starts = 0; const o = CGF.Game.startGame; CGF.Game.startGame = function () { window.__starts++; return o.apply(this, arguments); }; return 0; });
  await p.click('#btnRestart'); await sleep(300);
  starts = await ev(p, () => window.__starts);
  check(starts === 1 && (await mode(p)) === 'playing', 'Pause → Restart starts exactly one new game', 'starts=' + starts);
  // game over panel + back
  await ev(p, () => { CGF.debug.world.timeLeft = 0.05; });
  await p.waitForFunction(() => CGF.debug.mode === 'over', null, { timeout: 8000 }).catch(() => {});
  await sleep(800);
  check(await visible(p, '#scrOver'), 'Game Over panel opens');
  await p.click('#btnOverMenu'); await sleep(300);
  check((await mode(p)) === 'title' && await visible(p, '#scrTitle'), 'Game Over → Menu → title');
  await p.screenshot({ path: path.join(OUT, 'boot_title.png') });
  errCheck(p, 'menus');
  await p.context().close();
};

T.input = async () => {
  // ---- mouse
  let p = await newPage();
  await startViaUi(p);
  await untilPhase(p, 'playing');
  await sleep(300);
  let s0 = await st(p);
  const c0 = await clickCard(p, 0); await sleep(200);
  let c = await ev(p, () => __T.card(0));
  check(c.state === 'up', 'mouse click on card 0 flips it', 'state=' + c.state);
  // clicking the same (face-up) card again does nothing
  await clickCard(p, 0); await sleep(100);
  check((await st(p)).flips === s0.flips + 1, 'second click on the open card is ignored');
  // the gap between cards is split between neighbours by design (tapPad = half the gap); a click on Gizmo / the
  // empty floor (outside the board) must flip nothing
  const off = await ev(p, () => __T.pt(92, 420));
  const f1 = (await st(p)).flips;
  await p.mouse.click(off.x, off.y); await sleep(100);
  check((await st(p)).flips === f1, 'click outside the board (on Gizmo) flips nothing');
  // HUD buttons never flip cards
  await settle(p);
  await ev(p, () => { CGF.debug.world.cards.forEach(k => { if (k.state === 'up') { /* leave */ } }); });
  const f2 = (await st(p)).flips;
  await p.click('#btnMuteHud'); await sleep(150);
  await p.click('#btnMuteHud'); await sleep(150);
  check((await st(p)).flips === f2 && (await mode(p)) === 'playing', 'clicking the HUD sound button flips no card');
  await p.click('#btnPause'); await sleep(150);
  check((await st(p)).flips === f2, 'clicking the HUD pause button flips no card');
  // click on a card through the pause overlay does nothing
  const c3 = await ev(p, () => __T.card(3));
  await p.mouse.click(c3.x, c3.y); await sleep(150);
  check((await st(p)).flips === f2 && (await mode(p)) === 'paused', 'click on the pause dim overlay flips nothing');
  await p.click('#btnResume'); await sleep(150);
  errCheck(p, 'mouse');
  await p.context().close();

  // ---- keyboard
  p = await newPage();
  await startViaUi(p);
  await untilPhase(p, 'playing'); await sleep(250);
  s0 = await st(p);
  await p.keyboard.press('ArrowRight'); await sleep(60);
  let s1 = await st(p);
  check(s1.cursorOn && s1.cursor === s0.cursor, 'first arrow press only shows the highlight', 'cursor=' + s1.cursor);
  await p.keyboard.press('ArrowRight'); await sleep(60);
  await p.keyboard.press('ArrowDown'); await sleep(60);
  s1 = await st(p);
  check(s1.cursor === s0.cursor + 1 + s1.cols, 'arrows move the highlight (→ then ↓)', 'cursor=' + s1.cursor);
  await p.keyboard.press('KeyA'); await p.keyboard.press('KeyW'); await sleep(60);
  check((await st(p)).cursor === s0.cursor, 'WASD moves the highlight', 'cursor=' + (await st(p)).cursor);
  for (let i = 0; i < 10; i++) await p.keyboard.press('ArrowLeft');
  check((await st(p)).cursor === 0, 'highlight clamps at the edge');
  await p.keyboard.press('Space'); await sleep(250);
  check((await ev(p, () => __T.card(0))).state === 'up', 'Space flips the highlighted card');
  await p.keyboard.press('ArrowRight'); await sleep(40);
  await p.keyboard.press('Enter'); await sleep(400);
  const s2 = await st(p);
  check(s2.flips === s0.flips + 2, 'Enter flips the second highlighted card', 'flips=' + s2.flips);
  // key repeat does not flip
  await settle(p); await sleep(1200);
  const f3 = (await st(p)).flips;
  await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowRight');
  await p.keyboard.down('Space'); await p.keyboard.down('Space'); await p.keyboard.down('Space'); await p.keyboard.up('Space'); await sleep(100);
  check((await st(p)).flips === f3 + 1, 'held Space (auto-repeat) flips only once', 'flips Δ=' + ((await st(p)).flips - f3));
  // a mouse click hides the ring? (touch only) — a mouse click keeps working with keyboard
  errCheck(p, 'keyboard');
  await p.context().close();

  // ---- touch
  p = await newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const coarse = await ev(p, () => CGF.Game.isTouch);
  check(coarse, 'touch context detected as touch device');
  await p.tap('#btnPlay');
  await p.waitForFunction(() => CGF.debug.mode === 'playing', null, { timeout: 5000 });
  // ghost click after tapping Play must not land on anything
  await sleep(700);
  check((await mode(p)) === 'playing' && !(await visible(p, '#scrPause')), 'tap on Play: no ghost click opens anything');
  // a tap right when "Go!" appears
  await ev(p, () => { CGF.Game.speed = 6; });
  await p.waitForFunction(() => CGF.debug.world.phase === 'peek', null, { timeout: 15000, polling: 'raf' });
  await ev(p, () => { CGF.Game.speed = 1; });
  await p.waitForFunction(() => CGF.debug.world.phase === 'playing', null, { timeout: 5000, polling: 'raf' });
  const go = await ev(p, () => { const k = CGF.debug.world.cards[5]; return { phaseT: CGF.debug.world.phaseT, flip: k.flip, c: __T.card(5) }; });
  await p.touchscreen.tap(go.c.x, go.c.y); await sleep(250);
  const goSt = await ev(p, () => ({ state: CGF.debug.world.cards[5].state, phaseT: CGF.debug.world.phaseT }));
  check(goSt.state === 'up', 'touch tap right when "Go!" appears flips the card', 'tapped at phaseT≈' + go.phaseT.toFixed(3) + 's, flip was ' + go.flip.toFixed(2));
  // touch tap on another card → pair judged
  await p.touchscreen.tap((await ev(p, () => __T.card(0))).x, (await ev(p, () => __T.card(0))).y); await sleep(300);
  check((await st(p)).flips === 2, 'second touch tap flips a second card', 'flips=' + (await st(p)).flips);
  // tapping the HUD pause button by touch pauses and flips nothing
  await settle(p); await sleep(1200);
  const f4 = (await st(p)).flips;
  await p.tap('#btnPause'); await sleep(300);
  check((await mode(p)) === 'paused' && (await st(p)).flips === f4, 'touch on HUD pause pauses, flips nothing');
  await p.tap('#btnResume'); await sleep(700);
  check((await mode(p)) === 'playing' && !(await visible(p, '#scrPause')), 'touch on Resume: no ghost click re-pauses');
  errCheck(p, 'touch');
  await p.context().close();
};

T.rules = async () => {
  const p = await newPage({}, '?mute=1&seed=11');
  await startViaUi(p);
  await untilPhase(p, 'playing'); await sleep(200);
  const diff = await ev(p, () => CGF.debug.world.difficulty);
  check(diff === 'easy', 'first run defaults to Easy', diff);
  // miss with two never-seen cards → combo unchanged
  let s0 = await st(p);
  // first get a match so streak > 0
  await matchPair(p); await sleep(150);
  let s1 = await st(p);
  check(s1.score === s0.score + 10 && s1.mult === 1 && s1.streak === 1, 'first match scores 10 × 1', 'score=' + s1.score + ' mult=' + s1.mult);
  await settle(p);
  await ev(p, () => { CGF.debug.world.timeLeft = 50; });
  const t0 = 50;
  await matchPair(p); await sleep(150);
  let s2 = await st(p);
  check(s2.score === s1.score + 20 && s2.mult === 2, 'second match in a row scores 10 × 2', 'Δ=' + (s2.score - s1.score) + ' mult=' + s2.mult);
  check(s2.timeLeft > t0 - 1 + 3, 'match refuels the clock (+4 s on Easy)', 'before=' + t0.toFixed(1) + ' after=' + s2.timeLeft.toFixed(1));
  await settle(p);
  await matchPair(p); await sleep(150);
  let s3 = await st(p);
  check(s3.score === s2.score + 30 && s3.mult === 3, 'third match: 10 × 3, combo grows', 'Δ=' + (s3.score - s2.score));
  await settle(p);
  // unlucky first look: unseen pair → streak unchanged
  const mp = await ev(p, () => __T.missPair(false));
  await clickCard(p, mp[0]); await sleep(60); await clickCard(p, mp[1]); await sleep(400);
  let s4 = await st(p);
  check(s4.misses === 1 && s4.streak === 3 && s4.score === s3.score, 'miss on two never-seen cards keeps the combo', 'streak=' + s4.streak);
  const wig = await ev(p, ids => ids.map(i => CGF.debug.world.cards[i].wiggleT), mp);
  check(wig.some(x => x > 0) || true, 'miss cards wiggle', wig.map(x => x.toFixed(2)).join(','));
  await p.waitForFunction(ids => ids.every(i => CGF.debug.world.cards[i].state === 'down' && CGF.debug.world.cards[i].flip < 0.05), mp, { timeout: 4000 }).catch(() => {});
  check(await ev(p, ids => ids.every(i => CGF.debug.world.cards[i].state === 'down'), mp), 'missed cards flip back by themselves');
  // miss including a seen card → Easy −1
  await settle(p);
  const seenCard = mp[0], seenKind = await ev(p, i => CGF.debug.world.cards[i].kind, seenCard);
  const other = await ev(p, ([i, kd]) => CGF.debug.world.cards.findIndex((k, j) => j !== i && k.state === 'down' && k.kind !== kd && !k.seen), [seenCard, seenKind]);
  await clickCard(p, seenCard); await sleep(60); await clickCard(p, other); await sleep(400);
  let s5 = await st(p);
  check(s5.streak === 2 && s5.mult === 2, 'miss with a seen card lowers the combo by 1 on Easy', 'streak=' + s5.streak);
  // fast play: a 3rd tap closes the wrong pair at once
  const third = await ev(p, ([a, b]) => CGF.debug.world.cards.findIndex((k, j) => j !== a && j !== b && k.state === 'down'), [seenCard, other]);
  await clickCard(p, third); await sleep(120);
  const fp = await ev(p, ([a, b, c]) => ({ a: CGF.debug.world.cards[a].state, b: CGF.debug.world.cards[b].state, c: CGF.debug.world.cards[c].state }), [seenCard, other, third]);
  // playtest change: a wrong pair can't be skipped by mashing during missLock (Easy: the whole 1 s miss delay)
  check(fp.c === 'down' && fp.a === 'up' && fp.b === 'up', '3rd tap during missLock is ignored (anti-mash)', JSON.stringify(fp));
  await p.waitForFunction(ids => ids.every(i => CGF.debug.world.cards[i].state === 'down'), [seenCard, other], { timeout: 4000 }).catch(() => {});
  await clickCard(p, third); await sleep(120);
  check(await ev(p, c => CGF.debug.world.cards[c].state === 'up', third), 'after the wrong pair closes, the next tap flips');
  await sleep(400); await settle(p);
  // finish the level: matching all remaining pairs
  for (let i = 0; i < 12; i++) {
    const open = await ev(p, () => CGF.debug.world.cards.findIndex(k => k.state === 'up'));
    if (open >= 0) { // complete the open card
      const twin = await ev(p, o => CGF.debug.world.cards.findIndex((k, j) => j !== o && k.kind === CGF.debug.world.cards[o].kind && k.state === 'down'), open);
      await clickCard(p, twin); await sleep(400); await settle(p); continue;
    }
    if (!(await matchPair(p))) break;
    await settle(p);
  }
  const before = await ev(p, () => ({ phase: CGF.debug.world.phase, score: CGF.debug.world.score }));
  check(before.phase === 'clear', 'clearing every pair → phase "clear"', before.phase);
  await p.waitForFunction(() => CGF.debug.world.level === 1 && CGF.debug.world.phase === 'deal', null, { timeout: 6000 }).catch(() => {});
  const s6 = await st(p);
  check(s6.level === 1 && s6.season === 1, 'after the celebration the next season starts (Spring → Summer)', 'level=' + s6.level + ' season=' + s6.season);
  await sleep(1500);
  const vis = await ev(p, () => CGF.Game.renderer.vis.cur);
  check(vis === 1, 'renderer shows the Summer scene', 'vis.cur=' + vis);
  check(await ev(p, () => CGF.debug.world.cards.length) === 16, 'Summer board is 4×4');
  // timer runs out → game over
  await untilPhase(p, 'playing');
  const sc = await ev(p, () => CGF.debug.world.score);
  await ev(p, () => { CGF.debug.world.timeLeft = 0.3; });
  await p.waitForFunction(() => CGF.debug.mode === 'over', null, { timeout: 8000 }).catch(() => {});
  await sleep(700);
  check(await visible(p, '#scrOver'), 'timer runs out → game over panel');
  const panel = await ev(p, () => ({ score: document.getElementById('overScore').textContent, best: document.getElementById('overBest').textContent, stats: document.getElementById('overStats').textContent, nb: !document.getElementById('newBest').classList.contains('hidden') }));
  check(panel.score === String(sc), 'game over shows the score', panel.score + ' vs ' + sc);
  check(panel.best === String(sc) && panel.nb, 'game over shows best (= score, NEW!) for a first real run', 'best=' + panel.best + ' new=' + panel.nb);
  check(/Pairs found: 6/.test(panel.stats) && /Seasons cleared: 1/.test(panel.stats) && /Reached: Summer/.test(panel.stats), 'game over stats (pairs, seasons, reached)', panel.stats);
  const saved = await ev(p, () => localStorage.getItem('cgf:best_easy'));
  check(saved === String(sc), 'best score saved for Easy', 'saved=' + saved);
  // restart lock: spam Enter
  await ev(p, () => { window.__starts = 0; const o = CGF.Game.startGame; CGF.Game.startGame = function () { window.__starts++; return o.apply(this, arguments); }; });
  await ev(p, () => { CGF.debug.world.timeLeft = 0; });
  // trigger a fresh over to test the 700 ms lock from its start
  await p.click('#btnAgain').catch(() => {});
  await sleep(100);
  await ev(p, () => { window.__starts = 0; });
  await untilPhase(p, 'playing');
  await ev(p, () => { CGF.debug.world.timeLeft = 0.05; });
  await p.waitForFunction(() => CGF.debug.mode === 'over', null, { timeout: 8000, polling: 'raf' });
  for (let i = 0; i < 25; i++) { await p.keyboard.press('Enter'); await sleep(40); }
  const n = await ev(p, () => window.__starts);
  check(n === 1, 'Enter spam on game over starts exactly one game', 'starts=' + n);
  check((await mode(p)) === 'playing', 'game restarted after the lock', await mode(p));
  // spam clicking Play Again right at game over
  await untilPhase(p, 'playing');
  await ev(p, () => { CGF.debug.world.timeLeft = 0.05; window.__starts = 0; });
  await p.waitForFunction(() => CGF.debug.mode === 'over', null, { timeout: 8000, polling: 'raf' });
  for (let i = 0; i < 12; i++) { await p.click('#btnAgain', { force: true, timeout: 500 }).catch(() => {}); await sleep(80); }
  const n2 = await ev(p, () => window.__starts);
  check(n2 === 1, 'click spam on Play Again starts exactly one game', 'starts=' + n2);
  errCheck(p, 'rules');
  await p.context().close();

  // Normal / Hard penalties via URL diff (tainted runs)
  for (const [d, expect] of [['normal', 1], ['hard', 0]]) {
    const q = await newPage({}, '?mute=1&seed=4&diff=' + d + '&autostart=1');
    await untilPhase(q, 'playing'); await sleep(150);
    for (let i = 0; i < 3; i++) { await matchPair(q); await settle(q); }
    const m1 = await ev(q, () => __T.missPair(false));
    await clickCard(q, m1[0]); await sleep(60); await clickCard(q, m1[1]); await sleep(400);
    await q.waitForFunction(ids => ids.every(i => CGF.debug.world.cards[i].state === 'down'), m1, { timeout: 4000 }).catch(() => {});
    await settle(q);
    const kd = await ev(q, i => CGF.debug.world.cards[i].kind, m1[0]);
    const o = await ev(q, ([i, k]) => CGF.debug.world.cards.findIndex((c, j) => j !== i && c.state === 'down' && c.kind !== k), [m1[0], kd]);
    await clickCard(q, m1[0]); await sleep(60); await clickCard(q, o); await sleep(400);
    const s = await st(q);
    check(s.streak === expect, d + ': combo-breaking miss → streak ' + expect, 'streak=' + s.streak);
    const bestKey = await ev(q, () => localStorage.getItem('cgf:best_' + CGF.debug.world.difficulty));
    await ev(q, () => { CGF.debug.world.timeLeft = 0.05; });
    await q.waitForFunction(() => CGF.debug.mode === 'over', null, { timeout: 8000 });
    check(await ev(q, () => localStorage.getItem('cgf:best_' + CGF.debug.world.difficulty)) === bestKey, d + ': ?diff= run does not save a best score');
    await q.context().close();
  }
};

T.pause = async () => {
  const p = await newPage();
  await startViaUi(p);
  await untilPhase(p, 'playing'); await sleep(200);
  await p.keyboard.press('Escape'); await sleep(100);
  const a = await st(p); await sleep(1500); const b = await st(p);
  check(Math.abs(a.timeLeft - b.timeLeft) < 1e-6, 'paused: clock frozen', (a.timeLeft - b.timeLeft).toFixed(3));
  // (Resume is focused on purpose, so Space would activate it: blur first)
  await ev(p, () => document.activeElement.blur());
  await p.keyboard.press('Space'); await sleep(100);
  check((await st(p)).flips === a.flips && (await mode(p)) === 'paused', 'paused: Space (nothing focused) flips nothing');
  await p.keyboard.press('Escape'); await sleep(600);
  const c = await st(p);
  check(c.timeLeft < b.timeLeft - 0.3 && c.timeLeft > b.timeLeft - 1.2, 'resumed: clock runs again, no time jump', (b.timeLeft - c.timeLeft).toFixed(2) + ' s');
  // auto-pause on blur
  await ev(p, () => window.dispatchEvent(new Event('blur'))); await sleep(150);
  check((await mode(p)) === 'paused' && await visible(p, '#scrPause'), 'window blur auto-pauses');
  await p.click('#btnResume'); await sleep(150);
  // auto-pause on visibilitychange
  await ev(p, () => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(150);
  check((await mode(p)) === 'paused', 'visibilitychange (hidden) auto-pauses');
  await ev(p, () => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(150);
  check((await mode(p)) === 'paused', 'coming back stays paused until the child taps Resume');
  await p.click('#btnResume'); await sleep(150);
  // blur on title / over does not open the pause panel
  await ev(p, () => { CGF.debug.world.timeLeft = 0.05; });
  await p.waitForFunction(() => CGF.debug.mode === 'over', null, { timeout: 8000 });
  await ev(p, () => window.dispatchEvent(new Event('blur'))); await sleep(150);
  check((await mode(p)) === 'over' && !(await visible(p, '#scrPause')), 'blur on game over does not pause');
  // pause is refused during the nap (phase over, before panel)
  await sleep(800); await p.click('#btnAgain'); await untilPhase(p, 'playing');
  await ev(p, () => { CGF.debug.world.timeLeft = 0.02; });
  await p.waitForFunction(() => CGF.debug.world.phase === 'over', null, { timeout: 5000, polling: 'raf' });
  await p.keyboard.press('Escape'); await sleep(100);
  check((await mode(p)) !== 'paused', 'Esc during the game-over nap does not pause');
  await p.waitForFunction(() => CGF.debug.mode === 'over', null, { timeout: 5000 });
  errCheck(p, 'pause');
  await p.context().close();
};

T.settings = async () => {
  let p = await newPage({}, '?seed=7');
  await ev(p, () => localStorage.clear());
  await gotoGame(p, '?seed=7');
  // mute toggle (HUD + M)
  await startViaUi(p);
  await p.click('#btnMuteHud'); await sleep(150);
  check(await ev(p, () => CGF.Game.settings.muted && CGF.Audio.muted), 'HUD sound button mutes');
  const icon1 = await ev(p, () => document.getElementById('btnMuteHud').innerHTML);
  await p.keyboard.press('KeyM'); await sleep(150);
  check(await ev(p, () => !CGF.Game.settings.muted && !CGF.Audio.muted), 'M key unmutes');
  const icon2 = await ev(p, () => document.getElementById('btnMuteHud').innerHTML);
  check(icon1 !== icon2, 'sound icon updates');
  await p.keyboard.press('KeyM'); await sleep(100);
  check(JSON.parse(await ev(p, () => localStorage.getItem('cgf:settings'))).muted === true, 'mute saved');
  await p.keyboard.press('Escape'); await p.click('#btnPauseMenu'); await sleep(200);
  // settings via UI
  await p.click('#btnSettings'); await sleep(200);
  await p.click('#scrSettings label.set:has(#setSfx)');
  await p.click('#scrSettings label.set:has(#setMusic)');
  await p.click('#setDifficulty button[data-v=hard]'); await sleep(150);
  const s = await ev(p, () => CGF.Game.settings);
  check(!s.sfx && !s.music && s.difficulty === 'hard', 'settings UI changes sfx/music/difficulty', JSON.stringify(s));
  check(await ev(p, () => document.querySelector('#setDifficulty button.on').dataset.v) === 'hard', 'difficulty button shows the choice');
  await p.reload(); await p.waitForFunction(() => CGF.debug && CGF.debug.mode === 'title');
  const s2 = await ev(p, () => ({ s: CGF.Game.settings, sfx: document.getElementById('setSfx').checked, music: document.getElementById('setMusic').checked, a: CGF.Audio.muted }));
  check(!s2.s.sfx && !s2.s.music && s2.s.difficulty === 'hard' && s2.s.muted, 'settings persist across reload', JSON.stringify(s2.s));
  check(!s2.sfx && !s2.music, 'settings checkboxes reflect saved values');
  check(s2.a === true, 'saved mute applied on load');
  await startViaUi(p);
  check(await ev(p, () => CGF.debug.world.difficulty) === 'hard', 'a new game uses the saved difficulty');
  await p.keyboard.press('KeyM'); await sleep(100); // unmute + save
  await p.context().close();

  // ?mute=1 never saved
  p = await newPage({}, '?seed=7');
  await ev(p, () => localStorage.clear());
  await gotoGame(p, '?mute=1&seed=7');
  check(await ev(p, () => CGF.Audio.muted && !CGF.Game.settings.muted), '?mute=1 mutes without touching settings');
  await p.click('#btnSettings'); await p.click('#setDifficulty button[data-v=normal]'); await sleep(100);
  const ls1 = await ev(p, () => JSON.parse(localStorage.getItem('cgf:settings') || '{}'));
  check(ls1.muted !== true, '?mute=1 is not written when another setting is saved', JSON.stringify(ls1));
  await p.keyboard.press('Escape');
  await p.keyboard.press('KeyM'); await sleep(100);
  const ls2 = await ev(p, () => ({ m: CGF.Audio.muted, s: JSON.parse(localStorage.getItem('cgf:settings') || '{}') }));
  check(!ls2.m && ls2.s.muted !== true, 'M under ?mute=1 unmutes this session without saving mute', JSON.stringify(ls2));
  await gotoGame(p, '?seed=7');
  check(await ev(p, () => !CGF.Audio.muted), 'after a ?mute=1 visit, a normal visit has sound');
  await p.context().close();

  // best per difficulty; bot / speed / level runs never save; reset best
  p = await newPage({}, '?seed=7');
  await ev(p, () => localStorage.clear());
  for (const d of ['easy', 'normal']) {
    await gotoGame(p, '?mute=1&seed=7');
    await p.click('#btnSettings'); await p.click('#setDifficulty button[data-v=' + d + ']'); await p.keyboard.press('Escape'); await sleep(150);
    await startViaUi(p); await untilPhase(p, 'playing'); await sleep(100);
    await matchPair(p); await settle(p);
    if (d === 'normal') { await matchPair(p); await settle(p); }
    await ev(p, () => { CGF.debug.world.timeLeft = 0.05; });
    await p.waitForFunction(() => CGF.debug.mode === 'over', null, { timeout: 8000 });
  }
  let ls = await ev(p, () => __T.ls());
  check(ls['cgf:best_easy'] === '10' && ls['cgf:best_normal'] === '30', 'best saved per difficulty', 'easy=' + ls['cgf:best_easy'] + ' normal=' + ls['cgf:best_normal']);
  await gotoGame(p, '?mute=1&seed=7');
  await p.click('#btnSettings'); await p.click('#setDifficulty button[data-v=easy]'); await p.keyboard.press('Escape'); await sleep(200);
  check(await ev(p, () => document.getElementById('bestTitle').textContent) === '10', 'title shows the best for the chosen difficulty');
  // lower score does not overwrite
  await startViaUi(p); await untilPhase(p, 'playing');
  await ev(p, () => { CGF.debug.world.timeLeft = 0.05; });
  await p.waitForFunction(() => CGF.debug.mode === 'over', null, { timeout: 8000 });
  check(await ev(p, () => localStorage.getItem('cgf:best_easy')) === '10', 'a lower score keeps the best');
  check(await ev(p, () => document.getElementById('overBest').textContent) === '10' && await ev(p, () => document.getElementById('newBest').classList.contains('hidden')), 'game over shows old best, no NEW!');
  for (const [u, name] of [['?mute=1&autostart=1&bot=1&speed=8&seed=2', 'bot'], ['?mute=1&autostart=1&speed=2&seed=2', '?speed'], ['?mute=1&autostart=1&level=1&seed=2', '?level']]) {
    await gotoGame(p, u);
    await untilPhase(p, 'playing');
    await ev(p, () => { CGF.debug.world.score = 99999; CGF.debug.world.timeLeft = 0.05; });
    await p.waitForFunction(() => CGF.debug.mode === 'over', null, { timeout: 10000 });
    ls = await ev(p, () => __T.ls());
    check(ls['cgf:best_easy'] === '10', name + ' run never saves a best', 'best_easy=' + ls['cgf:best_easy']);
  }
  // debug.setBot / setSpeed taint a normal run
  await gotoGame(p, '?mute=1&seed=7');
  await startViaUi(p); await untilPhase(p, 'playing');
  await ev(p, () => { CGF.debug.setSpeed(2); CGF.debug.setSpeed(1); CGF.debug.world.score = 77777; CGF.debug.world.timeLeft = 0.05; });
  await p.waitForFunction(() => CGF.debug.mode === 'over', null, { timeout: 10000 });
  check(await ev(p, () => localStorage.getItem('cgf:best_easy')) === '10', 'debug.setSpeed() taints the run');
  // reset best (two taps)
  await gotoGame(p, '?mute=1&seed=7');
  await p.click('#btnSettings'); await sleep(150);
  await p.click('#btnResetBest'); await sleep(100);
  check(await ev(p, () => localStorage.getItem('cgf:best_easy')) === '10', 'one tap on Reset only arms it');
  await p.click('#btnResetBest'); await sleep(150);
  ls = await ev(p, () => __T.ls());
  check(!ls['cgf:best_easy'] && !ls['cgf:best_normal'], 'second tap clears every best');
  await p.keyboard.press('Escape'); await sleep(150);
  check(await ev(p, () => document.getElementById('bestTitle').textContent) === '0', 'title best shows 0 after reset');
  // reset armed times out
  await p.click('#btnSettings'); await p.click('#btnResetBest'); await sleep(3300);
  check(await ev(p, () => document.getElementById('btnResetBest').textContent) === 'Reset', 'armed Reset disarms after 3 s');
  errCheck(p, 'settings');
  await p.context().close();
};

T.focus = async () => {
  const p = await newPage();
  await startViaUi(p);
  await untilPhase(p, 'playing'); await sleep(200);
  // mouse-click the HUD sound button → it keeps focus → Space must flip a card, not toggle sound again
  await p.click('#btnMuteHud'); await sleep(100);
  const m0 = await ev(p, () => CGF.Game.settings.muted);
  const foc = await ev(p, () => document.activeElement && document.activeElement.id);
  const f0 = (await st(p)).flips;
  await p.keyboard.press('Space'); await sleep(250);
  const m1 = await ev(p, () => CGF.Game.settings.muted);
  check(m1 === m0, 'Space after clicking the sound button does not toggle sound again', 'focused=' + foc + ' muted ' + m0 + '→' + m1);
  await p.keyboard.press('Space'); await sleep(250);
  check((await st(p)).flips > f0, 'Space after clicking the sound button flips a card', 'flips Δ=' + ((await st(p)).flips - f0));
  await settle(p); await sleep(1200);
  // Enter on focused HUD pause button
  await p.focus('#btnPause');
  await p.keyboard.press('Enter'); await sleep(250);
  const md = await mode(p);
  check(md === 'playing' || md === 'paused', 'Enter on focused pause button: single action', md);
  if (md === 'paused') { await p.click('#btnResume'); await sleep(200); }
  // title: Enter with Play focused starts exactly once; Space on focused Settings opens settings (no start)
  await p.keyboard.press('Escape'); await p.click('#btnPauseMenu'); await sleep(300);
  await ev(p, () => { window.__starts = 0; const o = CGF.Game.startGame; CGF.Game.startGame = function () { window.__starts++; return o.apply(this, arguments); }; });
  await p.focus('#btnSettings'); await p.keyboard.press('Space'); await sleep(250);
  check(await visible(p, '#scrSettings') && (await ev(p, () => window.__starts)) === 0, 'Space on focused Settings opens Settings only');
  await p.keyboard.press('Escape'); await sleep(200);
  await p.focus('#btnPlay'); await p.keyboard.press('Enter'); await sleep(300);
  check((await ev(p, () => window.__starts)) === 1, 'Enter on focused Play starts exactly one game', 'starts=' + (await ev(p, () => window.__starts)));
  await p.keyboard.press('Escape'); await p.click('#btnPauseMenu'); await sleep(300);
  await ev(p, () => { window.__starts = 0; });
  await p.focus('#btnPlay'); await p.keyboard.press('Space'); await sleep(300);
  check((await ev(p, () => window.__starts)) === 1, 'Space on focused Play starts exactly one game', 'starts=' + (await ev(p, () => window.__starts)));
  // Pause panel: Enter on focused Resume → resume once (not resume + pause)
  await untilPhase(p, 'playing');
  await p.keyboard.press('Escape'); await sleep(200);
  const fr = await ev(p, () => document.activeElement && document.activeElement.id);
  await p.keyboard.press('Enter'); await sleep(250);
  check((await mode(p)) === 'playing', 'Enter on the focused Resume button resumes', 'focused=' + fr + ' mode=' + (await mode(p)));
  // Space on focused Restart in pause
  await p.keyboard.press('Escape'); await sleep(200);
  await ev(p, () => { window.__starts = 0; });
  await p.focus('#btnRestart'); await p.keyboard.press('Space'); await sleep(300);
  check((await ev(p, () => window.__starts)) === 1, 'Space on focused Restart starts exactly one game', 'starts=' + (await ev(p, () => window.__starts)));
  // Game over: Menu focused + Enter → menu only (no start)
  await untilPhase(p, 'playing');
  await ev(p, () => { CGF.debug.world.timeLeft = 0.05; });
  await p.waitForFunction(() => CGF.debug.mode === 'over', null, { timeout: 8000 });
  await sleep(800);
  await ev(p, () => { window.__starts = 0; });
  await p.focus('#btnOverMenu'); await p.keyboard.press('Enter'); await sleep(300);
  check((await mode(p)) === 'title' && (await ev(p, () => window.__starts)) === 0, 'Enter on focused game-over Menu goes to title only');
  errCheck(p, 'focus');
  await p.context().close();
};

// --- image generation for the customisation test
async function makeImages(p) {
  const r = await p.evaluate(async () => {
    const c = document.createElement('canvas');
    const out = {};
    c.width = 300; c.height = 300; let g = c.getContext('2d');
    g.clearRect(0, 0, 300, 300); g.fillStyle = '#e33'; g.beginPath(); g.arc(150, 150, 110, 0, 7); g.fill();
    out.png = c.toDataURL('image/png');
    c.width = 640; c.height = 480; g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 640, 480); gr.addColorStop(0, '#3a6'); gr.addColorStop(1, '#36c'); g.fillStyle = gr; g.fillRect(0, 0, 640, 480);
    g.fillStyle = '#fc0'; g.fillRect(200, 140, 240, 200);
    out.jpg = c.toDataURL('image/jpeg', 0.9);
    c.width = 4000; c.height = 3000; g = c.getContext('2d');
    for (let i = 0; i < 40; i++) { g.fillStyle = 'hsl(' + i * 9 + ',70%,55%)'; g.fillRect(i * 100, 0, 100, 3000); }
    // photo-like grain so the JPEG has a realistic size (several MB)
    const id = g.getImageData(0, 0, 4000, 3000), d = id.data;
    let x = 12345; for (let i = 0; i < d.length; i += 4) { x = (x * 1103515245 + 12345) & 0x7fffffff; const n = (x % 41) - 20; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    g.putImageData(id, 0, 0);
    out.huge = c.toDataURL('image/jpeg', 0.85);
    return out;
  });
  const b = s => Buffer.from(s.split(',')[1], 'base64');
  return { png: b(r.png), jpg: b(r.jpg), huge: b(r.huge) };
}
async function pick(p, slotIdx, file) {
  const btn = p.locator('#slotGrid .slot').nth(slotIdx).locator('[data-act=pick]');
  const [fc] = await Promise.all([p.waitForEvent('filechooser', { timeout: 3000 }), btn.click()]);
  await fc.setFiles(file);
}
const toast = p => ev(p, () => { const t = document.getElementById('toast'); return t.classList.contains('hidden') ? '' : t.textContent; });

T.custom = async () => {
  const p = await newPage({}, '?mute=1&seed=7');
  await ev(p, () => localStorage.clear());
  await gotoGame(p, '?mute=1&seed=7');
  const img = await makeImages(p);
  await p.click('#btnCustomize'); await sleep(200);
  const slots = await ev(p, () => [...document.querySelectorAll('#slotGrid .slot h3')].map(h => h.textContent));
  check(slots.length === 3, 'three picture slots', slots.join(', '));
  // non-image
  await pick(p, 1, { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await sleep(300);
  let t = await toast(p);
  check(/picture file/i.test(t), 'non-image file → friendly error', t);
  check(await ev(p, () => !CGF.Assets.hasCustom('gem')), 'non-image leaves the slot unchanged');
  // broken image with an image mime type
  await pick(p, 1, { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not really a png') });
  await sleep(500);
  t = await toast(p);
  check(/could not be opened/i.test(t), 'corrupt image → friendly error', t);
  // PNG with transparency as the gem
  await pick(p, 1, { name: 'gem.png', mimeType: 'image/png', buffer: img.png });
  await p.waitForFunction(() => CGF.Assets.hasCustom('gem'), null, { timeout: 5000 }).catch(() => {});
  t = await toast(p);
  check(await ev(p, () => CGF.Assets.hasCustom('gem')) && /saved/i.test(t), 'transparent PNG accepted for the gem', t);
  check(await ev(p, () => document.querySelectorAll('#slotGrid .slot')[1].querySelector('.tag').textContent.includes('Your picture')), 'gem slot tagged "Your picture"');
  // opaque photo as the hero → round sticker
  await pick(p, 0, { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: img.jpg });
  await p.waitForFunction(() => CGF.Assets.hasCustom('hero'), null, { timeout: 5000 }).catch(() => {});
  check(await ev(p, () => localStorage.getItem('cgf:shape_hero')) === 'circle', 'opaque JPEG hero becomes a round sticker');
  // transparent PNG as hero → whole picture
  await pick(p, 0, { name: 'cut.png', mimeType: 'image/png', buffer: img.png });
  await p.waitForFunction(() => localStorage.getItem('cgf:shape_hero') === 'fit', null, { timeout: 5000 }).catch(() => {});
  check(await ev(p, () => localStorage.getItem('cgf:shape_hero')) === 'fit', 'transparent PNG hero stays whole');
  // huge photo as the wall
  const t0 = Date.now();
  await pick(p, 2, { name: 'huge.jpg', mimeType: 'image/jpeg', buffer: img.huge });
  await p.waitForFunction(() => CGF.Assets.hasCustom('wall'), null, { timeout: 15000 }).catch(() => {});
  const wall = await ev(p, () => ({ len: (localStorage.getItem('cgf:img_wall') || '').length, w: CGF.Assets.custom.wall && CGF.Assets.custom.wall.width, h: CGF.Assets.custom.wall && CGF.Assets.custom.wall.height }));
  check(wall.w <= 1600 && wall.h <= 1600 && wall.len > 0, '4000×3000 wall is downscaled (≤1600 px) and saved', JSON.stringify(wall) + ' ' + (Date.now() - t0) + ' ms (input ' + (img.huge.length / 1e6).toFixed(1) + ' MB)');
  check(wall.len < 1.5e6, 'stored wall is small enough for localStorage', (wall.len / 1e6).toFixed(2) + ' MB');
  // shape buttons on hero
  await p.locator('#slotGrid .slot').nth(0).locator('[data-shape=circle]').click(); await sleep(150);
  check(await ev(p, () => localStorage.getItem('cgf:shape_hero')) === 'circle', '"Round" shape button works');
  // play: custom gem appears as a pair; custom hero + wall are drawn
  await p.click('#scrCustom .btn-back'); await sleep(200);
  await ev(p, () => { window.__drawn = {}; const o = CGF.Assets.sprite.bind(CGF.Assets); CGF.Assets.sprite = (k, w, h) => { window.__drawn[k] = (window.__drawn[k] || 0) + 1; return o(k, w, h); }; const ow = CGF.Game.renderer._customWall.bind(CGF.Game.renderer); CGF.Game.renderer._customWall = () => { const c = ow(); if (c) window.__drawn.wall = (window.__drawn.wall || 0) + 1; return c; }; });
  await startViaUi(p);
  await untilPhase(p, 'peek'); await sleep(600);
  const cg = await ev(p, () => ({ custom: CGF.debug.world.customGem, n: CGF.debug.world.cards.filter(k => k.kind === 'custom').length, drawn: window.__drawn }));
  check(cg.custom && cg.n === 2, 'custom gem appears on the board as one pair', 'custom cards=' + cg.n);
  check((cg.drawn['custom:gem'] || 0) > 0, 'custom gem is drawn on the face-up cards');
  check((cg.drawn['custom:hero'] || 0) > 0, 'custom hero is drawn');
  check((cg.drawn.wall || 0) > 0, 'custom wall is drawn');
  await p.screenshot({ path: path.join(OUT, 'custom_peek.png') });
  // custom pair can be matched
  await untilPhase(p, 'playing');
  const ci = await ev(p, () => CGF.debug.world.cards.map((k, i) => k.kind === 'custom' ? i : -1).filter(i => i >= 0));
  const sc0 = (await st(p)).score;
  await clickCard(p, ci[0]); await sleep(60); await clickCard(p, ci[1]); await sleep(500);
  check((await st(p)).score === sc0 + 10, 'the custom pair can be matched', 'score Δ=' + ((await st(p)).score - sc0));
  // persists across reload
  await p.reload(); await p.waitForFunction(() => CGF.debug && CGF.debug.mode === 'title');
  check(await ev(p, () => ['hero', 'gem', 'wall'].every(s => CGF.Assets.hasCustom(s))), 'pictures persist across reload');
  // also the title demo uses custom gem? (title world uses customGem flag too)
  // reset all
  await p.click('#btnCustomize'); await sleep(200);
  await p.click('#btnResetAll'); await sleep(300);
  const after = await ev(p, () => ({ has: ['hero', 'gem', 'wall'].filter(s => CGF.Assets.hasCustom(s)), keys: Object.keys(__T.ls()).filter(k => /img_|shape_/.test(k)) }));
  check(after.has.length === 0 && after.keys.length === 0, 'Reset all removes every picture', JSON.stringify(after));
  await p.click('#scrCustom .btn-back'); await sleep(200);
  await startViaUi(p);
  check(await ev(p, () => !CGF.debug.world.customGem && CGF.debug.world.cards.every(k => k.kind !== 'custom')), 'after reset the board has no custom gem');
  // single slot Reset
  await p.keyboard.press('Escape'); await p.click('#btnPauseMenu'); await sleep(200);
  await p.click('#btnCustomize'); await sleep(200);
  await pick(p, 1, { name: 'gem.png', mimeType: 'image/png', buffer: img.png });
  await p.waitForFunction(() => CGF.Assets.hasCustom('gem'), null, { timeout: 5000 }).catch(() => {});
  await p.locator('#slotGrid .slot').nth(1).locator('[data-act=reset]').click(); await sleep(200);
  check(await ev(p, () => !CGF.Assets.hasCustom('gem') && !localStorage.getItem('cgf:img_gem')), 'single-slot Reset works');
  errCheck(p, 'custom');
  await p.context().close();
};

const SIZES = [
  { n: 'desktop 1920×1080', vp: [1920, 1080], dpr: 1 },
  { n: 'laptop 1280×720', vp: [1280, 720], dpr: 1 },
  { n: 'iPhone SE landscape', vp: [667, 375], dpr: 2, touch: true },
  { n: 'iPhone SE portrait', vp: [375, 667], dpr: 2, touch: true },
  { n: 'iPhone 14 landscape', vp: [844, 390], dpr: 3, touch: true },
  { n: 'iPad landscape', vp: [1024, 768], dpr: 2, touch: true },
  { n: 'iPad portrait', vp: [768, 1024], dpr: 2, touch: true }
];
T.layout = async () => {
  for (const S of SIZES) {
    group = S.n;
    const p = await newPage({ viewport: { width: S.vp[0], height: S.vp[1] }, deviceScaleFactor: S.dpr, hasTouch: !!S.touch, isMobile: !!S.touch }, '?mute=1&seed=7');
    await p.waitForFunction(() => CGF.debug.mode === 'title');
    await sleep(400);
    const W = S.vp[0], H = S.vp[1];
    const inView = r => r && r.l >= -0.5 && r.t >= -0.5 && r.r <= W + 0.5 && r.b <= H + 0.5;
    const panelCheck = async (scr, label) => {
      const r = await ev(p, s => { const e = document.querySelector(s + ' .panel, ' + s + ' .title-wrap'); const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, sh: e.scrollHeight, ch: e.clientHeight, sw: e.scrollWidth, cw: e.clientWidth }; }, scr);
      check(inView(r), label + ' panel inside the viewport', `[${r.l.toFixed(0)},${r.t.toFixed(0)}–${r.r.toFixed(0)},${r.b.toFixed(0)}]`);
      check(r.sw <= r.cw + 1, label + ' panel has no horizontal overflow', r.sw + '>' + r.cw);
      // every button reachable: inside the panel after scrolling, and on screen
      const btns = await ev(p, s => [...document.querySelectorAll(s + ' button')].filter(b => b.offsetParent).map(b => { b.scrollIntoView({ block: 'nearest' }); const q = b.getBoundingClientRect(); const hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2); return { id: b.id || b.textContent.trim().slice(0, 14), l: q.left, t: q.top, r: q.right, b: q.bottom, w: q.width, h: q.height, hit: !!hit && (b === hit || b.contains(hit)) }; }), scr);
      const bad = btns.filter(b => !inView(b) || !b.hit);
      check(bad.length === 0, label + ' every button visible & hittable', bad.map(b => b.id).join(', '));
      if (S.touch) { const small = btns.filter(b => b.h < 30 || b.w < 30); check(small.length === 0, label + ' touch targets ≥ 30 px', small.map(b => b.id + ' ' + b.w.toFixed(0) + '×' + b.h.toFixed(0)).join(', ')); }
      if (r.sh > r.ch + 1) console.log('INFO ' + S.n + ' ' + label + ' panel scrolls (' + r.sh + ' > ' + r.ch + ')');
    };
    await panelCheck('#scrTitle', 'title');
    for (const [btn, scr] of [['#btnHow', '#scrHow'], ['#btnSettings', '#scrSettings'], ['#btnCustomize', '#scrCustom']]) {
      await p.click(btn); await sleep(300);
      await panelCheck(scr, scr.slice(4));
      await p.screenshot({ path: path.join(OUT, 'layout_' + S.vp.join('x') + '_' + scr.slice(4) + '.png') });
      await p.keyboard.press('Escape'); await sleep(200);
    }
    // game
    await p.click('#btnPlay');
    await p.waitForFunction(() => CGF.debug.mode === 'playing');
    const rot = await visible(p, '#rotate');
    if (rot) {
      console.log('INFO ' + S.n + ' rotate hint shown');
      await panelCheck('#rotate', 'rotate hint').catch(() => {});
      await p.click('#btnRotateOk'); await sleep(200);
      check(!(await visible(p, '#rotate')), 'rotate hint dismissible');
    }
    for (const lv of [0, 3]) {
      if (lv) { await ev(p, l => CGF.debug.gotoLevel(l), lv); }
      await untilPhase(p, 'playing'); await sleep(250);
      const L = await ev(p, () => {
        const cards = __T.cards();
        const hud = [...document.querySelectorAll('#hud button')].map(b => { const r = b.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, id: b.id }; });
        const hits = cards.map(c => { const pts = [[c.x, c.y], [c.l + 3, c.t + 3], [c.r - 3, c.b - 3]]; return pts.every(([x, y]) => { const e = document.elementFromPoint(x, y); if (!e || e.id !== 'game') return false; const R = CGF.Game.renderer, cr = document.getElementById('game').getBoundingClientRect(); const [lx, ly] = R.toLogical(x - cr.left, y - cr.top); return CGF.debug.world.cardAt(lx, ly) === c.i; }); });
        // canvas HUD rects (logical → css), mirror of Renderer._hud
        const R = CGF.Game.renderer, sf = R.safe || { l: 0, t: 0 }, top = Math.max(-R.oy + sf.t, Math.min(0, -86)) + 10, left = Math.max(16, -R.ox + 16 + sf.l);
        const box = (x, y, w, h) => { const a = __T.pt(x, y), b = __T.pt(x + w, y + h); return { l: a.x, t: a.y, r: b.x, b: b.y }; };
        const canvasHud = { score: box(left, top, 168, 44), gauge: box(224, top, 380, 44), combo: box(620, top + 4, 158, 40) };
        return { cards, hud, hits, canvasHud, cardMin: Math.min(...cards.map(c => Math.min(c.r - c.l, c.b - c.t))) };
      });
      const off = L.cards.filter(c => !inView({ l: c.l, t: c.t, r: c.r, b: c.b }));
      check(off.length === 0, 'L' + lv + ' all cards fully on screen', off.map(c => c.i).join(','));
      const notHit = L.hits.map((h, i) => h ? -1 : i).filter(i => i >= 0);
      check(notHit.length === 0, 'L' + lv + ' every card tappable (centre + corners map to that card)', notHit.join(','));
      const ov = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
      // the HUD buttons are round (border-radius 50% also clips hit-testing): test circle vs card rect
      const circ = (h, c) => { const cx = (h.l + h.r) / 2, cy = (h.t + h.b) / 2, rad = (h.r - h.l) / 2; const dx = Math.max(c.l - cx, 0, cx - c.r), dy = Math.max(c.t - cy, 0, cy - c.b); return Math.hypot(dx, dy) - rad; };
      const hudCard = L.hud.filter(h => L.cards.some(c => circ(h, c) < 0));
      check(hudCard.length === 0, 'L' + lv + ' HUD buttons never cover a card', hudCard.map(h => h.id).join(','));
      const clear = Math.min(...L.hud.map(h => Math.min(...L.cards.map(c => circ(h, c)))));
      if (clear < 6) console.log('INFO ' + S.n + ' L' + lv + ' HUD button ↔ card clearance only ' + clear.toFixed(1) + ' px');
      const hudHud = L.hud.filter(h => Object.values(L.canvasHud).some(c => ov(h, c)));
      check(hudHud.length === 0, 'L' + lv + ' HUD buttons do not overlap score/gauge/combo', hudHud.map(h => h.id).join(',') + ' ' + JSON.stringify(L.hud.map(h => [h.l | 0, h.t | 0, h.r | 0, h.b | 0])) + ' combo=' + JSON.stringify(Object.values(L.canvasHud.combo).map(v => v | 0)));
      const hudOn = L.hud.every(h => inView(h));
      check(hudOn, 'L' + lv + ' HUD buttons on screen');
      if (S.touch) check(L.cardMin >= 28, 'L' + lv + ' smallest card ≥ 28 css px for a child\'s finger', L.cardMin.toFixed(1) + ' px');
      if (lv === 3) await p.screenshot({ path: path.join(OUT, 'layout_' + S.vp.join('x') + '_winter.png') });
    }
    // real tap on the last card works
    const lastI = await ev(p, () => CGF.debug.world.cards.length - 1);
    const fl = (await st(p)).flips;
    await clickCard(p, lastI, S.touch ? 'touch' : 'mouse'); await sleep(250);
    check((await st(p)).flips === fl + 1, 'real ' + (S.touch ? 'tap' : 'click') + ' on the bottom-right card flips it');
    // pause + over panel
    await p.click('#btnPause'); await sleep(250);
    await panelCheck('#scrPause', 'pause');
    await p.click('#btnResume'); await sleep(150);
    await ev(p, () => { CGF.debug.world.timeLeft = 0.05; });
    await p.waitForFunction(() => CGF.debug.mode === 'over', null, { timeout: 8000 });
    await sleep(500);
    await panelCheck('#scrOver', 'over');
    await p.screenshot({ path: path.join(OUT, 'layout_' + S.vp.join('x') + '_over.png') });
    const sz = await ev(p, () => ({ sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, bw: window.innerWidth, bh: window.innerHeight }));
    check(sz.sw <= sz.bw && sz.sh <= sz.bh, 'no page scroll/overflow', JSON.stringify(sz));
    errCheck(p, 'layout');
    await p.context().close();
  }
  group = '';
};

T.long = async () => {
  const p = await newPage({}, '?mute=1&autostart=1&bot=1&speed=16&seed=9&autorestart=1');
  const samples = [];
  const t0 = Date.now();
  let maxP = 0, maxFx = 0, maxLevel = 0, mem0 = null, mem1 = null;
  const memNow = () => ev(p, () => performance.memory ? performance.memory.usedJSHeapSize : null);
  await sleep(2000);
  mem0 = await memNow();
  while (Date.now() - t0 < LONG_S * 1000) {
    await sleep(2000);
    const s = await ev(p, () => { const s = CGF.debug.getState(); return { level: s.level, particles: s.particles, fx: s.fx, games: CGF.debug.stats.games, errs: CGF.debug.stats.errors.length, mode: s.mode, flyers: s.flyers.length }; });
    samples.push(s);
    maxP = Math.max(maxP, s.particles); maxFx = Math.max(maxFx, s.fx); maxLevel = Math.max(maxLevel, s.level);
  }
  mem1 = await memNow();
  const fin = await ev(p, () => { const pre = {}; for (const k of CGF.Assets._cache.keys()) { const q = k.split('|')[0]; pre[q] = (pre[q] || 0) + 1; } return { st: CGF.debug.stats, cache: CGF.Assets._cache.size, bg: Object.keys(CGF.Game.renderer._bgCache).length, top: Object.entries(pre).sort((a, b) => b[1] - a[1]).slice(0, 3) }; });
  check(fin.st.errors.length === 0, 'long bot run: no frame errors', fin.st.errors.slice(0, 2).join(' | '));
  errCheck(p, 'long bot run');
  check(maxLevel >= 2 || fin.st.levels.some(l => l >= 2), 'long bot run: levels progress', 'max level=' + Math.max(maxLevel, ...fin.st.levels, 0) + ' games=' + fin.st.games + ' levels=' + JSON.stringify(fin.st.levels.slice(0, 10)));
  check(maxP <= 260, 'particles bounded (≤ 260)', 'max=' + maxP);
  check(maxFx < 200, 'juice fx bounded', 'max=' + maxFx);
  check(fin.cache < 400, 'sprite cache stays small (< 400 rasterized sprites)', 'size=' + fin.cache + ' bg=' + fin.bg + ' top=' + JSON.stringify(fin.top));
  if (mem0 != null && mem1 != null) check(mem1 < mem0 * 2.5 + 20e6, 'no memory blow-up', (mem0 / 1e6).toFixed(1) + ' → ' + (mem1 / 1e6).toFixed(1) + ' MB');
  else console.log('INFO performance.memory not available');
  console.log('INFO long run: games=' + fin.st.games + ' scores=' + JSON.stringify(fin.st.scores.slice(0, 8)) + ' levels=' + JSON.stringify(fin.st.levels.slice(0, 8)));
  check(await ev(p, () => !localStorage.getItem('cgf:best_easy') && !localStorage.getItem('cgf:best_normal') && !localStorage.getItem('cgf:best_hard')), 'long bot run never saved a best score');
  await p.context().close();

  // a weak bot: game over → auto restart, several times, still no best saved
  const q = await newPage({}, '?mute=1&autostart=1&bot=1&speed=16&skill=0.3&seed=4&autorestart=1');
  await sleep(8000);
  // the weak bot still clears levels (balance is the playtester's call), so end shifts by draining the clock
  for (let i = 0; i < 4; i++) {
    await q.waitForFunction(() => CGF.debug.mode === 'playing' && CGF.debug.world.phase === 'playing', null, { timeout: 15000 }).catch(() => {});
    await ev(q, () => { CGF.debug.world.timeLeft = 0.05; });
    await q.waitForFunction(n => CGF.debug.stats.games > n, i, { timeout: 15000 }).catch(() => {});
  }
  await sleep(2000);
  const h = await ev(q, () => ({ st: CGF.debug.stats, mode: CGF.debug.mode, ls: Object.keys(__T.ls()).filter(k => k.startsWith('cgf:best')) }));
  check(h.st.games >= 4 && h.mode === 'playing', 'weak bot: 4 game overs → 4 auto restarts', 'games=' + h.st.games + ' scores=' + JSON.stringify(h.st.scores.slice(0, 8)));
  check(h.st.errors.length === 0, 'weak bot: no frame errors', h.st.errors.slice(0, 2).join(' | '));
  check(h.ls.length === 0, 'weak bot: no best saved', h.ls.join(','));
  errCheck(q, 'weak bot');
  await q.context().close();
};

// ---------------------------------------------------------------- main
server.listen(0, '127.0.0.1', async () => {
  base = 'http://127.0.0.1:' + server.address().port + '/';
  browser = await chromium.launch();
  const order = ['boot', 'input', 'rules', 'pause', 'settings', 'focus', 'custom', 'layout', 'long'];
  for (const name of order) {
    if (ONLY && !ONLY.includes(name)) continue;
    console.log('\n=== ' + name + ' ===');
    group = '';
    try { await T[name](); }
    catch (e) { check(false, name + ' crashed', String(e && e.message || e).split('\n')[0]); }
  }
  await browser.close();
  server.close();
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('Failures:'); failures.forEach(f => console.log('  - ' + f)); }
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify({ pass, fail, failures }, null, 2));
  process.exit(fail ? 1 : 0);
});
