#!/usr/bin/env node
// Mimi's Splash Rocket — VOICE-FLOW playtest of the REAL page (report-only). The page runs at game speed 1 (so main.js's real
// speech guards / timers are in force) but on Playwright's FAKE CLOCK, fast-forwarded: a 6-minute session takes ≈ 1–2 min of wall
// time. A fake speechSynthesis speaks every utterance for a realistic time (250 ms + chars / (14.5 cps × rate) + 180 ms per
// sentence stop + 90 ms per comma; onstart after 40 ms; cancel → onerror 'interrupted'), so the queue, the merges, the cuts and the
// drops of voice.js / main.js happen as on a device. DK.Bot plays (toddler pace by default: listens 2.6 s, then 1.4–3.2 s).
//   node tests/sim/hs_voice.js [--sessions 4] [--ages 4] [--vp iphone-portrait,iphone-landscape] [--pace toddler|quick] [--skill 0.8]
// Writes tests/sim/out/hs_voice.json (+ the per-session line logs) and prints a markdown summary.
'use strict';
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const serve = require('../e2e/serve');
const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const SESS = +get('sessions', 4), AGES = get('ages', '4').split(',').map(Number), PACE = get('pace', 'toddler'), SKILL = +get('skill', 0.8);
const ALLVP = { 'iphone-portrait': { viewport: { width: 393, height: 852 }, dpr: 3 }, 'iphone-landscape': { viewport: { width: 852, height: 393 }, dpr: 3 },
  'ipad-landscape': { viewport: { width: 1180, height: 820 }, dpr: 2 } };
const VPS = get('vp', 'iphone-portrait,iphone-landscape').split(',');
// --fix name,…: proposed voice changes simulated IN THE PAGE (wrappers around DK.I18N / DK.Voice; the game files are not edited):
//   short   — the right line names the thing only (main passes pump: false → no "Now pump!" tail; the pump glows + its bubble)
//   nocut   — a stomp never cuts the right line: the pump count waits for it and merges ("One, two!") = 'right' out of PUMP_CUTS
//   stale   — the first stomp drops a right line that is still WAITING (it would be said after the launch)
//   pennant — no pennant line while another launch of the round follows (its `next` reminder is due at the same moment)
//   wrongcut— a right tap cuts a wrong / hint line that is still speaking (its goal is moot)
//   rate12  — the pump count at rate 1.2 instead of Voice.PUMP_RATE 1.0 ("One!" ≈ 0.6 s, "Three! Blast off!" ≈ 1.5 s)
//   camp    — the camp count without its head: "One, two! Two flags!" (= I18N.sayCountUp(lang, n, 'flags'))
const CFG = JSON.parse(get('cfg', '{}'));   // --cfg '{"aimTime":0.8}': world CONFIG overrides set on the live world (sim only)
const FIX = get('fix', '').split(',').filter(Boolean), TAG = get('tag', FIX.length ? 'fix' : 'base');

function fakeSynth() {
  // installed before any page script: a deterministic speechSynthesis with realistic durations on the page's (fake) clock
  const log = window.__synth = [];
  class U { constructor(t) { this.text = t; this.rate = 1; this.pitch = 1; this.volume = 1; this.lang = ''; this.voice = null; } }
  const voices = [{ name: 'Samantha', lang: 'en-US', localService: true, default: true, voiceURI: 'Samantha' }, { name: 'Linh', lang: 'vi-VN', localService: true, voiceURI: 'Linh' }];
  let cur = null; const q = [];
  const dur = u => 250 + 1000 * u.text.length / (14.5 * (u.rate || 1)) + 180 * (u.text.match(/[.!?](\s|$)/g) || []).length + 90 * (u.text.match(/,/g) || []).length;
  function next() {
    if (cur || !q.length) return;
    const u = cur = q.shift(), e = { text: u.text, rate: u.rate, q: u._q, t0: null, t1: null, end: null };
    log.push(e); u._e = e;
    u._s = setTimeout(() => { e.t0 = performance.now(); if (u.onstart) u.onstart({}); u._d = setTimeout(() => { e.t1 = performance.now(); e.end = 'end'; cur = null; if (u.onend) u.onend({}); next(); }, dur(u)); }, 40);
  }
  const S = { get speaking() { return !!cur; }, get pending() { return q.length > 0; }, paused: false,
    getVoices: () => voices, addEventListener() {}, removeEventListener() {}, onvoiceschanged: null, pause() {}, resume() {},
    speak(u) { u._q = performance.now(); q.push(u); next(); },
    cancel() {
      const c = cur; cur = null;
      while (q.length) { const u = q.shift(); log.push({ text: u.text, q: u._q, t0: null, t1: performance.now(), end: 'canceled' }); if (u.onerror) u.onerror({ error: 'canceled' }); }
      if (c) { clearTimeout(c._s); clearTimeout(c._d); c._e.t1 = performance.now(); c._e.end = c._e.t0 == null ? 'canceled' : 'interrupted'; if (c.onerror) c.onerror({ error: c._e.end }); }
    } };
  Object.defineProperty(window, 'speechSynthesis', { value: S, configurable: true });
  window.SpeechSynthesisUtterance = U;
}

function hookPage(o) {
  const pace = o.pace, FIX = o.fix || [];
  Object.assign(DK.debug.world.cfg, o.cfg || {});
  // after boot: record every say() / sayPump() request with its tag, the start (Voice.onStart) and how it ended
  const V = DK.Voice, w = DK.debug.world, reqs = window.__req = [], ev = window.__ev = [];
  const wrap = (name) => {
    const f = V[name].bind(V);
    V[name] = function (a, o) {
      const r = { kind: name, t: performance.now(), wt: w.time, tag: name === 'sayPump' ? 'pump' : (o && o.tag) || null, prio: !!(o && (o.priority || o.prompt)), interrupt: !!(o && o.interrupt), n: name === 'sayPump' ? a : undefined };
      const p = f(a, o);
      r.text = name === 'sayPump' ? p.text : String(a);
      reqs.push(r);
      if (p && p.then) p.then(x => { r.done = performance.now(); r.reason = x && x.reason; }, () => { r.done = performance.now(); r.reason = 'reject'; });
      return p;
    };
  };
  window.__lands = [];
  if (FIX.includes('rate12')) { const spr = V.sayPump; V.sayPump = function (n, op) { return spr.call(V, n, Object.assign({}, op || {}, { rate: 1.2 })); }; }
  if (FIX.includes('camp')) DK.I18N.sayCamp = (lang, n) => DK.I18N.sayCountUp(lang, n, 'flags');
  if (FIX.includes('short')) { const sr = DK.I18N.sayRight; DK.I18N.sayRight = (lang, e, r) => sr(lang, Object.assign({}, e, { pump: false }), r); }
  if (FIX.includes('pennant') || FIX.includes('wrongcut')) {
    const say0 = V.say;
    V.say = function (txt, op) {
      op = op || {};
      if (FIX.includes('pennant') && op.tag === 'pennant' && w.cur && w.launch < w.cur.k && w.launch > 0 && w.mats.some(m => m.launch === w.launch && m.state !== 'gone' && m.state !== 'hidden')) { return Promise.resolve({ spoken: false, reason: 'fix-skip' }); }
      if (FIX.includes('wrongcut') && op.tag === 'right' && ['wrong', 'hint'].includes(V.currentTag())) op = Object.assign({}, op, { interrupt: true });
      return say0.call(V, txt, op);
    };
  }
  if (FIX.includes('stale') || FIX.includes('nocut')) {
    const sp0 = V.sayPump; let pend = null;
    const flush = () => { if (pend && V.currentTag() !== 'right') { const q = pend; pend = null; V.sayPump(q.n, { lang: q.lang, auto: q.auto, from: q.from }); } };
    setInterval(flush, 30);
    V.sayPump = function (n, op) {
      op = op || {};
      if (FIX.includes('stale') && n === 1) V.dropTagged(['right']);
      if (FIX.includes('nocut') && V.currentTag() === 'right') {
        if (n === 1 || !pend) pend = { n, from: n === 1 ? 1 : (pend ? pend.from : n), lang: op.lang, auto: op.auto };
        else { pend.n = n; pend.auto = pend.auto || op.auto; }
        const p = Promise.resolve({ spoken: false, reason: 'held' }); p.text = ''; return p;
      }
      if (pend) { const q = pend; pend = null; return sp0.call(V, n, Object.assign({}, op, { from: Math.min(q.from, n) })); }
      return sp0.call(V, n, op);
    };
  }
  wrap('say'); wrap('sayPump');
  const ps = V.onStart, pe = V.onEnd;
  V.onStart = d => { const r = reqs.find(x => x.text === d && x.start == null && x.done == null); if (r) r.start = performance.now(); if (ps) ps(d); };
  V.onEnd = d => { if (pe) pe(d); };
  const emit = w._emit.bind(w);
  w._emit = e => { ev.push({ type: e.type, t: performance.now(), wt: w.time, n: e.n, auto: e.auto, first: e.first, state: w.state, phase: w.phase, launch: w.launch, level: w.level, round: w.round }); return emit(e); };
  V.unlock(); if (DK.Audio && DK.Audio.unlock) DK.Audio.unlock();
  try { const R = DK.debug.render(); R.draw = function () {}; } catch (e) { /* drawing is irrelevant for the voice flow */ }
  DK.debug.setBot(true, window.__skill);
  if (pace && DK.Bot.PACE[pace]) DK.debug.bot.pace = DK.Bot.PACE[pace];
  DK.debug.startGame();
}

function analyse(d) {
  const { reqs, ev, synth, wall } = d, out = {};
  const T = reqs.length ? Math.max(...ev.map(e => e.t)) - ev[0].t : 1;
  const spoken = reqs.filter(r => r.reason === 'end');
  out.minutes = T / 60000;
  out.requested = reqs.length; out.spoken = spoken.length;
  out.linesPerMin = spoken.length / out.minutes;
  out.wordsPerMin = spoken.reduce((a, r) => a + r.text.split(/\s+/).length, 0) / out.minutes;
  const talkMs = synth.filter(s => s.t0 != null && s.t1 != null).reduce((a, s) => a + (s.t1 - s.t0), 0);
  out.duty = talkMs / T * 100;
  const by = {};
  for (const r of reqs) { const k = r.tag || 'untagged'; const b = by[k] = by[k] || { n: 0, end: 0, interrupted: 0, dropped: 0, stale: 0, merged: 0, other: 0, wait: [] };
    b.n++; if (r.reason === 'end') b.end++; else if (r.reason === 'interrupted') b.interrupted++; else if (r.reason === 'dropped' || r.reason === 'stopped') b.dropped++; else if (r.reason === 'stale') b.stale++; else if (r.reason === 'merged') b.merged++; else b.other++;
    if (r.start != null) b.wait.push(r.start - r.t); }
  out.byTag = by;
  // prompts: ask / next → the prompt line; when did it start / end; did the child tap before the end?
  const prompts = [];
  const taps = ev.filter(e => e.type === 'right' || e.type === 'wrong');
  for (const e of ev.filter(x => x.type === 'ask' || x.type === 'next')) {
    const r = reqs.find(x => x.tag === 'prompt' && Math.abs(x.t - e.t) < 50);
    const tap = taps.find(x => x.t > e.t);
    prompts.push({ type: e.type, spoken: r ? r.reason : 'none', wait: r && r.start != null ? r.start - e.t : null, len: r && r.start != null && r.done ? r.done - r.start : null,
      tapBeforeEnd: !!(r && r.done && tap && tap.t < r.done), tapAfter: tap ? tap.t - e.t : null, text: r ? r.text : '' });
  }
  out.prompts = { n: prompts.length, ask: prompts.filter(p => p.type === 'ask').length, notSpoken: prompts.filter(p => p.spoken !== 'end').length,
    cut: prompts.filter(p => p.spoken === 'interrupted').length, waitMean: mean(prompts.filter(p => p.wait != null).map(p => p.wait)), waitMax: Math.max(0, ...prompts.filter(p => p.wait != null).map(p => p.wait)),
    lenMean: mean(prompts.filter(p => p.len != null).map(p => p.len)), tapBeforeEnd: prompts.filter(p => p.tapBeforeEnd).length,
    notSpokenList: prompts.filter(p => p.spoken !== 'end').slice(0, 6).map(p => p.type + ':' + p.spoken + ':' + p.text) };
  // pump counts per launch: the union of numbers in the pump lines that were really spoken to the end
  const launches = ev.filter(e => e.type === 'launch'), pumpReq = reqs.filter(r => r.kind === 'sayPump');
  let prevT = -1, complete = 0, blast = 0, lateBlast = [], missing = [];
  for (const L of launches) {
    const ls = pumpReq.filter(r => r.t > prevT && r.t <= L.t + 5000);
    const said = new Set(); let b = false, bEnd = null;
    for (const r of ls) if (r.reason === 'end') { (r.text.match(/One|Two|Three|Một|Hai|Ba\b/gi) || []).forEach(x => said.add(x.toLowerCase())); if (/Blast off|Bay nào/i.test(r.text)) { b = true; bEnd = r.done; } }
    if (said.size >= 3) complete++; else missing.push([...said].join(',') + ' ← ' + ls.map(r => r.text + '[' + r.reason + ']').join(' | '));
    if (b) { blast++; lateBlast.push((bEnd - L.t) / 1000); }
    prevT = L.t + 5000;
  }
  let rightAfterLand = 0, blastAfterLand = 0, rightHeard = 0, rightN = 0;
  const lands = ev.filter(e => e.type === 'land'), rights = ev.filter(e => e.type === 'right');
  for (const R of rights) {
    const L1 = launches.find(x => x.t > R.t), Ld = lands.find(x => x.t > R.t);
    const rr = reqs.find(x => x.tag === 'right' && Math.abs(x.t - R.t) < 50);
    if (rr) { rightN++; if (rr.reason === 'end') rightHeard++; if (Ld && rr.reason === 'end' && rr.done > Ld.t) rightAfterLand++; }
    const bl = pumpReq.filter(x => L1 && x.t > R.t && x.t <= L1.t + 5000 && x.reason === 'end' && /Blast off|Bay nào/i.test(x.text));
    if (bl.length && Ld && bl[0].done > Ld.t) blastAfterLand++;
  }
  out.right = { n: rightN, heard: rightHeard, afterLand: rightAfterLand, blastAfterLand };
  out.pump = { launches: launches.length, complete, blast, blastEndAfterLaunch: mean(lateBlast), blastEndMax: Math.max(0, ...lateBlast), missing: missing.slice(0, 5) };
  // camp / count lines
  out.camp = { camps: ev.filter(e => e.type === 'camp').length, campLines: reqs.filter(r => r.tag === 'count').length, campSpoken: reqs.filter(r => r.tag === 'count' && r.reason === 'end').length };
  // the longest silence while the child can act (phase play) and Mimi's backlog (max lines waiting)
  let maxQ = 0; const ts = [];
  for (const r of reqs) { ts.push([r.t, 1]); ts.push([r.start != null ? r.start : (r.done || r.t), -1]); }
  ts.sort((a, b) => a[0] - b[0]); let qn = 0; for (const [, d2] of ts) { qn += d2; maxQ = Math.max(maxQ, qn); }
  out.maxWaiting = maxQ;
  out.session = d.session; out.wall = wall; out.errors = d.errors;
  return out;
}
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

(async () => {
  const srv = await serve(), browser = await chromium.launch(), res = [];
  for (const age of AGES) for (let s = 0; s < SESS; s++) {
    const vpn = VPS[s % VPS.length], vp = ALLVP[vpn], lang = s % 2 ? 'vi' : 'en';
    const ctx = await browser.newContext({ viewport: vp.viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await ctx.addInitScript(fakeSynth);
    await ctx.addInitScript(`window.__skill = ${SKILL};`);
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.clock.install();
    const t0 = Date.now();
    await page.goto(`${srv.url}?age=${age}&seed=${21 + s * 13 + age}&lang=${lang}`);
    for (let i = 0; i < 400; i++) { await page.clock.runFor(100); if (await page.evaluate(() => !!(window.DK && DK.debug && DK.debug.mode === 'title'))) break; }
    await page.evaluate(hookPage, { pace: PACE, fix: FIX, cfg: CFG });
    let done = false;
    for (let i = 0; i < 240 && !done; i++) {   // ≤ 20 min of game time, 5 s per step
      await page.clock.runFor(5000);
      if (i % 12 === 0) console.error('  …', vpn, lang, 'game s', await page.evaluate(() => DK.debug.world.time.toFixed(0)), 'wall s', ((Date.now() - t0) / 1000).toFixed(0));
      done = await page.evaluate(() => DK.debug.mode === 'done');
    }
    const d = await page.evaluate(() => ({ reqs: window.__req, ev: window.__ev, synth: window.__synth, session: DK.debug.world.time, stars: DK.debug.world.stars }));
    d.wall = (Date.now() - t0) / 1000; d.errors = errors.slice(0, 3);
    const a = analyse(d); a.age = age; a.vp = vpn; a.lang = lang; a.done = done; a.stars = d.stars;
    res.push(a);
    fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
    fs.writeFileSync(path.join(__dirname, 'out', `hs_voice_${TAG}_${age}_${s}.log.json`), JSON.stringify({ reqs: d.reqs.map(r => ({ t: +(r.t / 1000).toFixed(2), tag: r.tag, text: r.text, start: r.start != null ? +((r.start - r.t) / 1000).toFixed(2) : null, end: r.done != null ? +((r.done - r.t) / 1000).toFixed(2) : null, reason: r.reason })), ev: d.ev.map(e => [+(e.t / 1000).toFixed(2), e.type, e.phase, e.n]) }, null, 0));
    console.log(JSON.stringify({ age, vp: vpn, lang, done, session: +(a.session / 60).toFixed(2), wall: a.wall, linesPerMin: +a.linesPerMin.toFixed(1), duty: +a.duty.toFixed(0), prompts: a.prompts, pump: a.pump, errors: a.errors }));
    await ctx.close();
  }
  await browser.close(); srv.close();
  fs.writeFileSync(path.join(__dirname, 'out', 'hs_voice_' + TAG + '.json'), JSON.stringify(res, null, 1));
  // markdown summary
  const f = x => (+x).toFixed(1);
  const o = ['| age | viewport | lang | done | session min | lines / min (words / min) | Mimi talks % of the time | prompts: n · not heard · cut · start delay s mean (max) · length s · tapped before it ended | pump: launches · 1-2-3 complete · "Blast off!" said · its end after the launch s mean (max) | right lines heard to the end / n · ended after the landing · "Blast off!" ended after the landing | camp lines spoken / camps | max lines waiting | errors |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const a of res) o.push(`| ${a.age} | ${a.vp} | ${a.lang} | ${a.done} | ${f(a.session / 60)} | ${f(a.linesPerMin)} (${f(a.wordsPerMin)}) | ${f(a.duty)} | ${a.prompts.n} · ${a.prompts.notSpoken} · ${a.prompts.cut} · ${(a.prompts.waitMean / 1000).toFixed(2)} (${(a.prompts.waitMax / 1000).toFixed(2)}) · ${(a.prompts.lenMean / 1000).toFixed(2)} · ${a.prompts.tapBeforeEnd} | ${a.pump.launches} · ${a.pump.complete} · ${a.pump.blast} · ${a.pump.blastEndAfterLaunch.toFixed(2)} (${a.pump.blastEndMax.toFixed(2)}) | ${a.right.heard} / ${a.right.n} · ${a.right.afterLand} · ${a.right.blastAfterLand} | ${a.camp.campSpoken} / ${a.camp.camps} | ${a.maxWaiting} | ${a.errors.length} |`);
  const tags = {};
  for (const a of res) for (const k in a.byTag) { const b = tags[k] = tags[k] || { n: 0, end: 0, interrupted: 0, dropped: 0, stale: 0, merged: 0, other: 0, wait: [] }; const c = a.byTag[k]; for (const z of ['n', 'end', 'interrupted', 'dropped', 'stale', 'merged', 'other']) b[z] += c[z]; b.wait.push(...c.wait); }
  o.push('', '| tag | requested | spoken to the end | cut while speaking | dropped / stopped | stale | merged | start delay s mean (p90) |', '|---|---|---|---|---|---|---|---|');
  const p90 = a => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(0.9 * (s.length - 1))]; };
  for (const k of Object.keys(tags).sort((a, b) => tags[b].n - tags[a].n)) { const b = tags[k]; o.push(`| ${k} | ${b.n} | ${b.end} | ${b.interrupted} | ${b.dropped} | ${b.stale} | ${b.merged} | ${(mean(b.wait) / 1000).toFixed(2)} (${(p90(b.wait) / 1000).toFixed(2)}) |`); }
  const md = `# hs_voice ${TAG} (fix: ${FIX.join(',') || 'none'}, cfg ${JSON.stringify(CFG)}, pace ${PACE}, skill ${SKILL})\n\n` + o.join('\n');
  console.log('\n' + md);
  fs.writeFileSync(path.join(__dirname, 'out', 'hs_voice_' + TAG + '.md'), md + '\n');
  for (const a of res) if (a.prompts.notSpokenList.length || a.pump.missing.length) console.log('\n' + a.vp + ' ' + a.lang + ' not heard:', JSON.stringify(a.prompts.notSpokenList), '\npump missing:', JSON.stringify(a.pump.missing));
  process.exit(0);
})();
