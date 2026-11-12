// Independent functional QA: try to break the game like a 3–5-year-old (real CDP touch). Report-only.
//   node tests/qa/qa_touch.js [ONLY=ipp,padl] [TESTS=a,b]
const L = require('./qa_lib');
const { tap, swipe, touch, tp } = L;
const results = [];
const rec = (dev, test, ok, detail) => { results.push({ dev, test, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${dev.padEnd(16)} ${test}${detail ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); };
const types = evs => evs.map(e => e.type + (e.id != null ? ':' + e.id : '')).join(',');
const NEG = /\b(no|nope|wrong|incorrect|bad|fail|mistake|oops|sorry)\b|\bsai\b|dở|\btệ\b|hỏng|không đúng|chưa đúng|trật|nhầm/i;

const T = {};
T.double_tap_odd = async ({ page, cdp, url }) => {
  await L.setupRound(page, url, { topic: 'colors' });
  const i = await L.info(page), n0 = await L.evLen(page);
  await tap(cdp, page, i.at, 30); await page.waitForTimeout(40); await tap(cdp, page, i.at, 30);
  await page.waitForTimeout(60); await tap(cdp, page, i.at, 30);
  await page.waitForTimeout(400);
  const ev = await L.evSince(page, n0);
  const right = ev.filter(e => e.type === 'right').length, wrong = ev.filter(e => e.type === 'wrong').length;
  return { ok: right === 1 && wrong === 0, detail: `right ${right} wrong ${wrong}: ${types(ev).slice(0, 200)}` };
};
T.same_wrong_repeat = async ({ page, cdp, url }) => {
  await L.setupRound(page, url, { topic: 'colors' });
  const i = await L.info(page), o = i.others[0], s0 = await L.saidLen(page), n0 = await L.evLen(page);
  for (let k = 0; k < 6; k++) { await tap(cdp, page, o.at, 40); await page.waitForTimeout(120); }
  const mid = await page.evaluate(() => FP.debug.world.misses);
  await page.waitForTimeout(1300); await tap(cdp, page, o.at, 40); await page.waitForTimeout(300);
  const st = await page.evaluate(() => ({ misses: FP.debug.world.misses, glow: FP.debug.world.members.filter(m => m._glowT > 0).map(m => m.id), hand: !!FP.debug.world.hintHand }));
  const said = (await L.saidSince(page, s0)).map(s => s.text);
  const ev = await L.evSince(page, n0);
  const wrongEv = ev.filter(e => e.type === 'wrong');
  // the wrong line must name the tapped thing
  const nm = await page.evaluate(id => { const m = FP.debug.world.memberById(id); return FP.I18N.name('en', 'obj', m.thing.obj) || ''; }, o.id);
  const ok = mid === 1 && st.misses === 2 && st.glow.includes(i.a) && said.length >= 1 && said.every(t => !NEG.test(t)) && said.some(t => nm && t.toLowerCase().includes(String(nm).replace(/^the /, '').toLowerCase()));
  return { ok, detail: { midMisses: mid, st, wrongEv: wrongEv.length, said, name: nm } };
};
T.two_fingers = async ({ page, cdp, url }) => {
  await L.setupRound(page, url, { topic: 'colors' });
  const i = await L.info(page), o = i.others[0], n0 = await L.evLen(page);
  // finger 1 on a matching member, finger 2 (held) on the odd one at the same time
  await touch(cdp, 'touchStart', [tp(o.at.x, o.at.y, 1), tp(i.at.x, i.at.y, 2)]);
  await page.waitForTimeout(100);
  await touch(cdp, 'touchEnd');
  await page.waitForTimeout(300);
  // finger 1 held on a matching member, then finger 2 taps the odd one
  await page.waitForTimeout(1200);
  await touch(cdp, 'touchStart', [tp(o.at.x, o.at.y, 3)]);
  await page.waitForTimeout(80);
  await touch(cdp, 'touchStart', [tp(o.at.x, o.at.y, 3), tp(i.at.x, i.at.y, 4)]);
  await page.waitForTimeout(80);
  await touch(cdp, 'touchEnd', [tp(o.at.x, o.at.y, 3)]);
  await page.waitForTimeout(60);
  await touch(cdp, 'touchEnd');
  await page.waitForTimeout(300);
  const ev = await L.evSince(page, n0);
  const judged = ev.filter(e => e.type === 'right' || e.type === 'wrong' || (e.type === 'wiggle' && e.repeat));
  return { ok: !ev.some(e => e.type === 'right'), detail: types(judged) + ' (extra finger on the odd one must be ignored)' };
};
T.second_finger_after_lift = async ({ page, cdp, url }) => {
  // after both fingers are lifted the next tap must work (no stuck active pointer)
  await L.setupRound(page, url, { topic: 'colors' });
  const i = await L.info(page), o = i.others[0];
  await touch(cdp, 'touchStart', [tp(o.at.x, o.at.y, 1), tp(o.at.x + 30, o.at.y, 2)]);
  await page.waitForTimeout(60); await touch(cdp, 'touchEnd'); await page.waitForTimeout(200);
  const n0 = await L.evLen(page);
  await tap(cdp, page, i.at); await page.waitForTimeout(300);
  const ev = await L.evSince(page, n0);
  return { ok: ev.some(e => e.type === 'right'), detail: types(ev).slice(0, 120) };
};
T.long_press = async ({ page, cdp, url }) => {
  await L.setupRound(page, url, { topic: 'colors' });
  const i = await L.info(page), o = i.others[0], n0 = await L.evLen(page);
  await tap(cdp, page, o.at, 2500);
  await page.waitForTimeout(200);
  const ev = await L.evSince(page, n0);
  const st = await page.evaluate(() => ({ misses: FP.debug.world.misses, sel: String(getSelection()), mode: FP.debug.mode }));
  const w = ev.filter(e => e.type === 'wrong').length;
  return { ok: w === 1 && st.sel === '' && st.mode === 'play', detail: { wrong: w, ...st } };
};
T.long_press_bo = async ({ page, cdp, url }) => {
  await L.setupRound(page, url, { topic: 'colors' });
  await page.waitForTimeout(3200);
  const b = await page.evaluate(() => FP.debug.boScreen()), n0 = await L.evLen(page);
  await tap(cdp, page, { x: b.cx, y: b.cy }, 1800);
  await page.waitForTimeout(300);
  const ev = await L.evSince(page, n0);
  return { ok: !ev.some(e => e.type === 'wrong' || e.type === 'right'), detail: types(ev).slice(0, 120) };
};
T.drag_across_all = async ({ page, cdp, url }) => {
  // a slow drag that starts on the first member and sweeps across all of them: only the FIRST contact is judged
  await L.setupRound(page, url, { topic: 'colors' });
  const all = await page.evaluate(() => FP.debug.world.members.filter(m => m.state === 'stand').sort((a, b) => a.x - b.x).map(m => ({ id: m.id, odd: m.odd, at: FP.debug.memberScreen(m.id) })));
  const n0 = await L.evLen(page);
  const a = all[0].at, b = all[all.length - 1].at;
  await swipe(cdp, page, a, b, { n: 20, ms: 600 });
  await page.waitForTimeout(400);
  const ev = await L.evSince(page, n0);
  const j = ev.filter(e => e.type === 'right' || e.type === 'wrong');
  const exp = all[0].odd ? 'right:' + all[0].id : 'wrong:' + all[0].id;
  return { ok: j.length === 1 && (j[0].type + ':' + j[0].id) === exp, detail: `judged ${types(j)} expected ${exp}` };
};
T.flick_from_ground = async ({ page, cdp, url }) => {
  // press on the path below the odd one and flick up quickly onto it → right
  await L.setupRound(page, url, { topic: 'colors' });
  const i = await L.info(page);
  const p0 = await page.evaluate(([x, y, r]) => {
    const v = FP.debug.view(); return { x, y: Math.min(innerHeight - 4, y + r + 30 * v.s) };
  }, [i.at.x, i.at.y, i.at.r]);
  const under = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e && e.id; }, [p0.x, p0.y]);
  const n0 = await L.evLen(page);
  await swipe(cdp, page, p0, i.at, { n: 5, ms: 80 });
  await page.waitForTimeout(300);
  const ev = await L.evSince(page, n0);
  return { ok: ev.some(e => e.type === 'right'), detail: `start on ${under} ` + types(ev).slice(0, 150) };
};
T.slow_drag_from_ground = async ({ page, cdp, url }) => {
  // a slow drag (> 0.25 s) from the ground onto the odd one: not a flick → no judgement, counts one soft
  await L.setupRound(page, url, { topic: 'colors' });
  const i = await L.info(page);
  const p0 = { x: i.at.x, y: Math.min(i.at.y + i.at.r + 60, (await page.viewportSize()).height - 5) };
  const n0 = await L.evLen(page);
  await swipe(cdp, page, p0, i.at, { n: 12, ms: 900 });
  await page.waitForTimeout(300);
  const ev = await L.evSince(page, n0);
  return { ok: true, info: true, detail: 'slow drag ground→odd: ' + types(ev).slice(0, 150) };
};
T.tap_during_enter = async ({ page, cdp, url }) => {
  await L.gotoTitle(page, url + '?mute=1&seed=5&age=4&lang=en');
  await page.evaluate(() => { FP.debug.startGame(); FP.debug.setSpeed(1); });
  await L.waitPhase(page, () => FP.debug.world.state === 'round' && FP.debug.world.phase === 'enter' && FP.debug.world.members.some(m => m.state === 'stand' || (m.cx > 100)));
  const n0 = await L.evLen(page);
  // a kid hammering every member and the ground while they walk in
  for (let k = 0; k < 10; k++) {
    const pts = await page.evaluate(() => FP.debug.world.members.map(m => FP.debug.memberScreen(m.id)).filter(p => p && p.x > 0 && p.x < innerWidth && p.y > 0 && p.y < innerHeight));
    for (const p of pts) await tap(cdp, page, p, 20);
    await page.waitForTimeout(80);
    if (await page.evaluate(() => FP.debug.world.phase !== 'enter')) break;
  }
  const ev = await L.evSince(page, n0);
  const st = await page.evaluate(() => ({ phase: FP.debug.world.phase, misses: FP.debug.world.misses, answered: FP.debug.world._answered }));
  const judged = ev.filter(e => (e.type === 'right' || e.type === 'wrong') && /enter/.test(e._st));
  return { ok: judged.length === 0, detail: { judgedDuringEnter: types(judged), st, kinds: [...new Set(ev.map(e => e.type))].join(',') } };
};
T.tap_during_hop_gate_march = async ({ page, cdp, url }) => {
  await L.setupRound(page, url, { topic: 'colors' });
  const i = await L.info(page);
  const s0 = await L.saidLen(page);
  await tap(cdp, page, i.at);
  const n0 = await L.evLen(page);
  // during the hop: tap every member, the hopping one, Bo, the bubble, the HUD stars
  const log = [];
  for (let k = 0; k < 6; k++) {
    const pts = await page.evaluate(() => FP.debug.world.members.map(m => FP.debug.memberScreen(m.id)).filter(Boolean));
    for (const p of pts) await tap(cdp, page, p, 20);
    log.push(await page.evaluate(() => FP.debug.world.state + '/' + FP.debug.world.phase));
    await page.waitForTimeout(100);
  }
  const ev = await L.evSince(page, n0);
  const extra = ev.filter(e => e.type === 'right' || e.type === 'wrong');
  const st = await page.evaluate(() => ({ misses: FP.debug.world.misses, roundStars: FP.debug.world.roundStars }));
  return { ok: extra.length === 0 && st.misses === 0, detail: { phases: [...new Set(log)].join(','), extra: types(extra), st } };
};
T.bubble_tap_mid_hop = async ({ page, cdp, url }) => {
  // after the right answer, the child taps Bo's bubble (or Bo) while the odd one flies: the question must NOT be asked again
  await L.setupRound(page, url, { topic: 'colors' });
  const i = await L.info(page);
  await page.waitForTimeout(3300);   // > 3 s after the prompt
  await tap(cdp, page, i.at);
  await page.waitForTimeout(150);
  const s0 = await L.saidLen(page);
  const ph = await page.evaluate(() => FP.debug.world.state + '/' + FP.debug.world.phase);
  const bb = await page.evaluate(() => { const r = document.getElementById('bubble').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, vis: !document.getElementById('bubble').classList.contains('hidden') }; });
  await tap(cdp, page, bb);
  await page.waitForTimeout(250);
  const said1 = (await L.saidSince(page, s0)).map(s => s.text);
  const prompt = await page.evaluate(() => (window.__said.filter(s => /\?/.test(s.text)).slice(-1)[0] || {}).text);
  const b = await page.evaluate(() => FP.debug.boScreen());
  const s1 = await L.saidLen(page);
  await tap(cdp, page, { x: b.cx, y: b.cy });
  await page.waitForTimeout(250);
  const said2 = (await L.saidSince(page, s1)).map(s => s.text);
  const repeatedQ = [...said1, ...said2].filter(t => /\?/.test(t) && !/Psst/.test(t));
  return { ok: repeatedQ.length === 0, detail: { phaseAtTap: ph, bubble: said1, bo: said2, lastQ: prompt } };
};
T.bubble_tap_enter = async ({ page, cdp, url }) => {
  // tapping the bubble ("Here comes the parade!") while the parade walks in: the ask must not be said twice
  await L.gotoTitle(page, url + '?mute=1&seed=5&age=4&lang=en');
  await page.evaluate(() => { FP.debug.startGame(); });
  await L.waitPhase(page, () => FP.debug.world.state === 'round' && FP.debug.world.phase === 'enter' && !document.getElementById('bubble').classList.contains('hidden'));
  const s0 = await L.saidLen(page);
  const bb = await page.evaluate(() => { const r = document.getElementById('bubble').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await tap(cdp, page, bb);
  await L.waitPhase(page, () => FP.debug.world.phase === 'play');
  await page.waitForTimeout(400);
  const said = (await L.saidSince(page, s0)).map(s => s.text);
  const q = said.filter(t => /\?/.test(t));
  return { ok: q.length <= 1, detail: said };
};
T.tap_stage_and_barn = async ({ page, cdp, url }) => {
  // barn before the gate (play) → only a soft puff; stage member in the gate → opens the barn
  await L.setupRound(page, url, { topic: 'colors' });
  const d = await page.evaluate(() => FP.debug.doorScreen());
  const n0 = await L.evLen(page);
  await tap(cdp, page, { x: d.cx, y: d.cy });
  await page.waitForTimeout(300);
  const ev0 = await L.evSince(page, n0);
  const i = await L.info(page);
  await tap(cdp, page, i.at);
  await L.waitPhase(page, () => { const a = FP.debug.answer(); return a && a.door; });
  await page.waitForTimeout(100);
  const st = await page.evaluate(() => { const m = FP.debug.world.members.find(q => q.state === 'stage'); return m ? FP.debug.memberScreen(m.id) : null; });
  const n1 = await L.evLen(page);
  if (st) await tap(cdp, page, st);
  await page.waitForTimeout(300);
  const ev1 = await L.evSince(page, n1);
  return { ok: !ev0.some(e => /doorOpen|right|wrong/.test(e.type)) && ev1.some(e => e.type === 'doorOpen'), detail: { beforeGate: types(ev0), stageTap: types(ev1).slice(0, 100) } };
};
T.hud_tap_mid_hop = async ({ page, cdp, url }) => {
  await L.setupRound(page, url, { topic: 'colors' });
  const i = await L.info(page);
  await tap(cdp, page, i.at);
  const n0 = await L.evLen(page);
  const hs = await page.evaluate(() => { const r = document.querySelector('.hud-stars').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await tap(cdp, page, hs); await tap(cdp, page, hs);
  await page.waitForTimeout(200);
  const ev = await L.evSince(page, n0);
  return { ok: !ev.some(e => e.type === 'soft' || e.type === 'wrong'), detail: types(ev.filter(e => !/step|count|gap|hop|land|marchStep/.test(e.type))).slice(0, 100) };
};
T.rotate_phases = async ({ page, cdp, url, d }) => {
  const out = [];
  await L.setupRound(page, url, { topic: 'count', age: 4 });
  // mid-enter of the NEXT round is tested below; first mid-play with a finger down
  const i = await L.info(page);
  await touch(cdp, 'touchStart', [tp(i.others[0].at.x, i.others[0].at.y + 200)]);
  await L.rotate(page); await touch(cdp, 'touchEnd');
  out.push({ at: 'play(finger down)', off: await L.outside(page), st: await page.evaluate(() => FP.debug.world.phase) });
  await page.waitForTimeout(800);
  const i2 = await L.info(page);
  const n0 = await L.evLen(page);
  await tap(cdp, page, i2.at); await page.waitForTimeout(250);
  const r1 = (await L.evSince(page, n0)).some(e => e.type === 'right');
  out.push({ at: 'tap after rotate', right: r1 });
  await page.waitForTimeout(250);
  await L.rotate(page);   // mid-hop / count
  out.push({ at: 'hop', off: await L.outside(page), st: await page.evaluate(() => FP.debug.world.state + '/' + FP.debug.world.phase) });
  await L.waitPhase(page, () => FP.debug.world.phase === 'march');
  await page.waitForTimeout(300);
  await L.rotate(page);   // mid-march
  out.push({ at: 'march', off: await L.outside(page), st: await page.evaluate(() => FP.debug.world.state + '/' + FP.debug.world.phase) });
  await L.waitPhase(page, () => FP.debug.world.state === 'round' && FP.debug.world.phase === 'enter');
  await page.waitForTimeout(400);
  await L.rotate(page);   // mid-enter
  await L.waitPhase(page, () => FP.debug.world.phase === 'play', null, 20000);
  await page.waitForTimeout(800);
  out.push({ at: 'enter→play', off: await L.outside(page) });
  const stars = await page.evaluate(() => ({ w: FP.debug.world.stars, hud: +document.getElementById('hudStars').textContent }));
  out.push({ stars });
  const bad = out.filter(o => (o.off && o.off.length) || o.right === false);
  return { ok: bad.length === 0, detail: out };
};
T.rotate_talk = async ({ page, cdp, url }) => {
  await L.setupRound(page, url, { topic: 'colors' });
  await page.evaluate(() => { const w = FP.debug.world; w.round = w.roundsPerLevel - 1; FP.debug.setBot(true, 1); FP.debug.setSpeed(6); });
  await L.waitPhase(page, () => FP.debug.world.state === 'talk' && FP.debug.mode === 'talk');
  await page.evaluate(() => { FP.debug.setBot(false); FP.debug.setSpeed(1); });
  await page.waitForTimeout(600);
  await L.rotate(page);
  const vis = await page.evaluate(() => {
    const p = document.querySelector('.talk-panel').getBoundingClientRect();
    const b = [...document.querySelectorAll('#talkChoices button')].map(x => { const r = x.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; });
    return { panel: { t: p.top, b: p.bottom, l: p.left, r: p.right }, b, vw: innerWidth, vh: innerHeight };
  });
  const offs = vis.b.filter(r => r.l < 0 || r.t < 0 || r.r > vis.vw || r.b > vis.vh || r.w < 60);
  const ans = await page.evaluate(() => FP.debug.world.talk.answer);
  await page.locator(`#talkChoices button[data-id="${ans}"]`).tap();
  await page.waitForTimeout(300);
  const tr = await page.evaluate(() => window.__ev.filter(e => e.type === 'talkResult').slice(-1)[0]);
  await L.rotate(page);
  return { ok: offs.length === 0 && tr && tr.correct, detail: { offs, n: vis.b.length, tr: tr && tr.correct } };
};
T.visibility_mid_march = async ({ page, cdp, url }) => {
  await L.setupRound(page, url, { topic: 'colors' });
  const i = await L.info(page);
  await tap(cdp, page, i.at);
  await L.waitPhase(page, () => { const a = FP.debug.answer(); return a && a.door; });
  const d = await page.evaluate(() => FP.debug.doorScreen());
  await tap(cdp, page, { x: d.cx, y: d.cy });
  await L.waitPhase(page, () => FP.debug.world.phase === 'march');
  await page.waitForTimeout(300);
  const hide = h => page.evaluate(v => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => v }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v ? 'hidden' : 'visible' }); document.dispatchEvent(new Event('visibilitychange')); }, h);
  await hide(true);
  await page.waitForTimeout(800);
  const a = await page.evaluate(() => ({ mode: FP.debug.mode, pause: !document.getElementById('scrPause').classList.contains('hidden'), ph: FP.debug.world.phase, t: FP.debug.world.time }));
  await hide(false);
  await page.waitForTimeout(500);
  const t1 = await page.evaluate(() => FP.debug.world.time);
  await page.locator('#btnResume').tap();
  await L.waitPhase(page, () => FP.debug.world.state === 'round' && FP.debug.world.phase === 'enter', null, 15000);
  const stars = await page.evaluate(() => ({ w: FP.debug.world.stars, hud: +document.getElementById('hudStars').textContent, aud: FP.debug.audio().ctx && FP.debug.audio().ctx.state }));
  return { ok: a.mode === 'paused' && a.pause && Math.abs(t1 - a.t) < 0.05 && stars.hud === stars.w, detail: { a, t1, stars } };
};
T.pause_each_phase = async ({ page, cdp, url }) => {
  const out = [];
  await L.setupRound(page, url, { topic: 'colors' });
  const pauseResume = async (label) => {
    const st0 = await page.evaluate(() => FP.debug.world.state + '/' + FP.debug.world.phase);
    await page.locator('#btnPause').tap();
    await page.waitForTimeout(400);
    const t0 = await page.evaluate(() => FP.debug.world.time);
    await page.waitForTimeout(600);
    const t1 = await page.evaluate(() => FP.debug.world.time);
    const s0 = await L.saidLen(page);
    await page.locator('#btnResume').tap();
    await page.waitForTimeout(700);
    const said = (await L.saidSince(page, s0)).map(s => s.text);
    const st = await page.evaluate(() => ({ mode: FP.debug.mode, talk: !document.getElementById('scrTalk').classList.contains('hidden'), state: FP.debug.world.state + '/' + FP.debug.world.phase }));
    out.push({ label, st0, frozen: Math.abs(t1 - t0) < 0.01, said, ...st });
  };
  await pauseResume('play');
  const i = await L.info(page);
  await tap(cdp, page, i.at); await page.waitForTimeout(150);
  await pauseResume('hop');
  await L.waitPhase(page, () => { const a = FP.debug.answer(); return a && a.door; });
  await pauseResume('gate');
  const d = await page.evaluate(() => FP.debug.doorScreen());
  await tap(cdp, page, { x: d.cx, y: d.cy });
  await L.waitPhase(page, () => FP.debug.world.phase === 'march');
  await pauseResume('march');
  await L.waitPhase(page, () => FP.debug.world.state === 'round' && FP.debug.world.phase === 'enter');
  await pauseResume('enter');
  // talk: unanswered and answered
  await page.evaluate(() => { const w = FP.debug.world; w.round = w.roundsPerLevel - 1; FP.debug.setBot(true, 1); FP.debug.setSpeed(6); });
  await L.waitPhase(page, () => FP.debug.world.state === 'talk' && FP.debug.mode === 'talk', null, 60000);
  await page.evaluate(() => { FP.debug.setBot(false); FP.debug.setSpeed(1); });
  await page.waitForTimeout(500);
  await pauseResume('talk');
  const ans = await page.evaluate(() => FP.debug.world.talk.answer);
  await page.locator(`#talkChoices button[data-id="${ans}"]`).tap();
  await page.waitForTimeout(200);
  await pauseResume('talk-answered');
  await L.waitPhase(page, () => FP.debug.world.state !== 'talk', null, 15000);
  await pauseResume('levelDone/intro');
  await page.waitForTimeout(500);
  const bad = out.filter(o => !o.frozen || o.mode === 'paused' || (o.label === 'talk' && !o.talk));
  // a question re-asked after the Talk answer was given is wrong
  const ta = out.find(o => o.label === 'talk-answered');
  return { ok: bad.length === 0 && !(ta && ta.said.some(t => /\?/.test(t))), detail: out };
};
T.idle_autopause = async ({ page, cdp, url }) => {
  await L.setupRound(page, url, { topic: 'colors' });
  const s0 = await L.saidLen(page);
  await L.setSpeed(page, 8);
  await L.waitPhase(page, () => FP.debug.mode === 'paused', null, 60000);
  await L.setSpeed(page, 1);
  const said = (await L.saidSince(page, s0)).map(s => s.text);
  return { ok: said.length >= 4, detail: { n: said.length, said: said.slice(0, 6) } };
};
T.safe_areas = async ({ page, cdp, url, d }) => {
  const port = d.viewport.height > d.viewport.width;
  const phone = d.viewport.width < 900 && d.viewport.height < 900 || d.viewport.width === 393;
  const ins = phone ? (port ? { t: 59, r: 0, b: 34, l: 0 } : { t: 0, r: 59, b: 21, l: 59 }) : { t: 24, r: 0, b: 20, l: 0 };
  await L.gotoTitle(page, url + '?mute=1&seed=3&age=4&lang=vi');
  await page.evaluate(i => { const s = document.documentElement.style; s.setProperty('--sa-t', i.t + 'px'); s.setProperty('--sa-r', i.r + 'px'); s.setProperty('--sa-b', i.b + 'px'); s.setProperty('--sa-l', i.l + 'px'); window.dispatchEvent(new Event('resize')); }, ins);
  await page.waitForTimeout(400);
  const chk = async (label) => page.evaluate(([i, label]) => {
    const bad = [];
    const vw = innerWidth, vh = innerHeight;
    const inside = (r, nm) => { if (r.width && (r.left < i.l - 0.5 || r.right > vw - i.r + 0.5 || r.top < i.t - 0.5 || r.bottom > vh - i.b + 0.5)) bad.push(`${label}:${nm} ${Math.round(r.left)},${Math.round(r.top)}-${Math.round(r.right)},${Math.round(r.bottom)}`); };
    document.querySelectorAll('button, input, #bubble, .hud-stars, .hud-dots').forEach(el => {
      if (el.closest('.hidden') || el.offsetParent === null) return;
      inside(el.getBoundingClientRect(), el.id || el.className || el.tagName);
    });
    const w = FP.debug.world;
    if (w && w.state === 'round') {
      for (const m of w.members) if (m.state === 'stand') { const c = FP.debug.memberScreen(m.id); inside({ left: c.x - c.r * 0.6, right: c.x + c.r * 0.6, top: c.y - c.r * 0.6, bottom: c.y + c.r * 0.6, width: 1 }, 'member' + m.id); }
      const b = FP.debug.boScreen(); inside({ left: b.x, right: b.x + b.w, top: b.y, bottom: b.y + b.h, width: 1 }, 'bo');
      const dd = FP.debug.doorScreen(); inside({ left: dd.x + 30, right: dd.x + dd.w - 30, top: dd.y + 30, bottom: dd.y + dd.h - 30, width: 1 }, 'door');
    }
    return bad;
  }, [ins, label]);
  const bad = [...await chk('title')];
  await page.evaluate(() => { FP.debug.startGame(); FP.debug.world.levels[0] = 'colors'; FP.debug.world.startLevel(0); });
  await L.waitReady(page);
  bad.push(...await chk('play'));
  await L.shot(page, 'safe-' + d.name);
  return { ok: bad.length === 0, detail: { ins, bad } };
};

// (appended) Bo tap alone while the odd crate is being counted: must not cut the count run with the question
T.bo_tap_mid_count = async ({ page, cdp, url }) => {
  await L.setupRound(page, url, { topic: 'count' });
  await page.waitForTimeout(3300);
  const i = await L.info(page);
  await tap(cdp, page, i.at);
  await page.waitForTimeout(900);
  const s0 = await L.saidLen(page);
  const ph = await page.evaluate(() => FP.debug.world.state + '/' + FP.debug.world.phase);
  const b = await page.evaluate(() => FP.debug.boScreen());
  await tap(cdp, page, { x: b.cx, y: b.cy });
  await page.waitForTimeout(300);
  const said = await L.saidSince(page, s0);
  return { ok: !said.some(s => /\?/.test(s.text)), detail: { phaseAtTap: ph, said } };
};

(async () => {
  const srv = await L.serve(), browser = await L.chromium.launch();
  const only = (process.env.ONLY || 'ipp,ipl,padp,padl').split(',');
  const tests = process.env.TESTS ? process.env.TESTS.split(',') : Object.keys(T);
  for (const k of only) {
    const d = L.DEVICES[k];
    for (const t of tests) {
      const errors = [];
      const { ctx, page, cdp } = await L.newPage(browser, d, errors);
      try {
        const r = await Promise.race([T[t]({ page, cdp, url: srv.url, d, errors }), new Promise((_, j) => setTimeout(() => j(new Error('timeout 120 s')), 120000))]);
        const inv = await page.evaluate(() => window.__inv || []);
        rec(d.name, t, r.ok && !errors.length && !inv.length, Object.assign({}, typeof r.detail === 'object' ? r.detail : { d: r.detail }, errors.length ? { errors } : {}, inv.length ? { inv: inv.slice(0, 5) } : {}));
      } catch (e) {
        let st = null; try { st = await page.evaluate(() => FP.debug.getState()); } catch (er) { /* */ }
        rec(d.name, t, false, { exc: e.message.split('\n')[0], st: st && { mode: st.mode, state: st.state, phase: st.phase }, errors });
      }
      await ctx.close();
    }
  }
  await browser.close(); srv.close();
  L.fs.writeFileSync(L.path.join(L.OUT, 'qa_touch.json'), JSON.stringify(results, null, 1));
  console.log(`\n${results.filter(r => r.ok).length}/${results.length} passed`);
})();
