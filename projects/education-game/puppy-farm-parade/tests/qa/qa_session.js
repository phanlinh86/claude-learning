// Independent QA: long bot sessions at speed 8 for ages 3–7 × EN/VI on the real page. Checks invariants and the voice log.
//   node tests/qa/qa_session.js [SESS=2 sessions per run via autorestart]
const L = require('./qa_lib');
const NEG = /\b(no|nope|wrong|incorrect|bad|fail|mistake|oops|sorry)\b|\bsai\b|\bdở\b|\btệ\b|\bhỏng\b|không đúng|chưa đúng|\btrật\b|\bnhầm\b/i;
const VI = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i;
const RAW = /\{|\}|undefined|NaN|\bnull\b|\[object/;
const SESS = +process.env.SESS || 2;
const EXTRA = () => {
  window.__wr = []; window.__rr = []; window.__hud = []; window.__dots = [];
  let i18n;
  Object.defineProperty(window.FP, 'I18N', { configurable: true, get: () => i18n, set: v => {
    i18n = v;
    if (v && v.sayWrong && !v.sayWrong.__w) { const o = v.sayWrong; v.sayWrong = function (lang, e) { const r = o.apply(this, arguments); window.__wr.push({ lang, id: e.id, thing: e.thing && JSON.parse(JSON.stringify(e.thing)), rule: e.rule, text: r }); return r; }; v.sayWrong.__w = true; }
    if (v && v.sayRight && !v.sayRight.__w) { const o = v.sayRight; v.sayRight = function (lang, e) { const r = o.apply(this, arguments); window.__rr.push({ lang, id: e.id, thing: e.thing && JSON.parse(JSON.stringify(e.thing)), count: e.count, rule: e.rule, text: r }); return r; }; v.sayRight.__w = true; }
  } });
  window.addEventListener('DOMContentLoaded', () => {
    const hs = document.getElementById('hudStars');
    new MutationObserver(() => window.__hud.push({ v: +hs.textContent, s: window.FP.debug && FP.debug.stats.sessions })).observe(hs, { childList: true, characterData: true, subtree: true });
    const dots = document.getElementById('hudDots');
    new MutationObserver(() => { const w = FP.debug && FP.debug.world; if (!w) return; const ch = [...dots.children]; window.__dots.push({ st: w.state + '/' + w.phase, round: w.round, n: ch.length, done: ch.filter(c => c.className === 'done').length, now: ch.findIndex(c => c.className === 'now') }); }).observe(dots, { attributes: true, subtree: true, childList: true });
  });
};

async function run(browser, url, age, lang, dk, seed) {
  const d = L.DEVICES[dk], errors = [];
  const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { window.FP = window.FP || {}; });
  await ctx.addInitScript(EXTRA);
  const page = await ctx.newPage();
  // INIT from qa_lib (voice + event hooks) — re-declare FP.Voice wrapper
  await page.addInitScript(() => {
    window.__said = []; window.__ev = []; window.__inv = [];
    let voice;
    Object.defineProperty(window.FP, 'Voice', { configurable: true, get: () => voice, set: v => { voice = v; if (v && v.say && !v.say.__wrapped) { const o = v.say; v.say = function (text, opts) { const w = window.FP.debug && FP.debug.world; window.__said.push({ text: String(text), lang: v._lang, wt: w ? w.time : 0, st: w ? w.state + '/' + w.phase : '', s: FP.debug ? FP.debug.stats.sessions : 0 }); return o.apply(this, arguments); }; v.say.__wrapped = true; } } });
  });
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + String(e)));
  const t0 = Date.now();
  await page.goto(`${url}?mute=1&seed=${seed}&age=${age}&lang=${lang}&speed=8&bot=1&autostart=1&autorestart=1`);
  await page.waitForFunction(() => window.FP && FP.debug && FP.debug.world, null, { timeout: 20000 });
  // install the invariant sampler from qa_lib (it is defined by its INIT; re-create minimal one here)
  await page.evaluate(() => {
    const w = FP.debug.world; const ou = w.update; let lastKey = '', since = 0, lastStars = 0;
    window.__phaseMax = {};
    const oe = w._emit; w._emit = function (e) { const c = {}; for (const k in e) { const v = e[k]; try { c[k] = (v && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v; } catch (er) { c[k] = '?'; } } c._t = w.time; c._s = FP.debug.stats.sessions; window.__ev.push(c); return oe.call(this, e); };
    w.update = function (dt) {
      const r = ou.call(this, dt);
      const k = this.state + '/' + this.phase;
      const key = k + '/' + this.level + '/' + this.round;
      if (key === lastKey) since += dt; else { lastKey = key; since = 0; }
      if (this.state !== 'menu' && this.state !== 'sessionDone') window.__phaseMax[k] = Math.max(window.__phaseMax[k] || 0, since);
      if (since > 70 && this.state !== 'sessionDone' && this.state !== 'menu') window.__inv.push('stuck ' + key);
      if (this.state === 'intro' && this.level === 0) lastStars = 0;
      if (this.stars < lastStars) window.__inv.push(`stars down ${lastStars}→${this.stars} at ${key}`);
      lastStars = this.stars;
      for (const m of this.members) for (const f of ['x', 'y', 'cx', 'cy', 'rot', 'sx', 'sy', 'scale', 'bob', 'alpha']) if (m[f] !== undefined && !isFinite(m[f])) { window.__inv.push(`NaN ${m.id}.${f} at ${key}`); break; }
      if (this.state === 'round' && this.phase === 'play') { const odd = this.members.filter(m => m.odd).length; if (odd !== 1) window.__inv.push(`odd ${odd} at ${key}`); }
      if (window.__inv.length > 100) window.__inv.length = 100;
      return r;
    };
  });
  let ok = true;
  try {
    await page.waitForFunction(n => FP.debug.stats.sessions > n || (FP.debug.stats.sessions === n && FP.debug.mode === 'done'), SESS, { timeout: 600000, polling: 500 });
  } catch (e) { ok = false; errors.push('session did not finish: ' + JSON.stringify(await page.evaluate(() => FP.debug.getState()))); }
  const R = await page.evaluate(() => ({ ev: window.__ev, said: window.__said, inv: window.__inv, wr: window.__wr, rr: window.__rr, hud: window.__hud, dots: window.__dots, phaseMax: window.__phaseMax, stats: FP.debug.stats, done: document.getElementById('doneStars').textContent }));
  // helper names in page
  const names = await page.evaluate(([wr, lang]) => wr.map(w => {
    const t = w.thing || {}; const I = FP.I18N, out = [];
    const tryN = (k, v) => { try { const s = I.name(lang, k, v); if (s && typeof s === 'string') out.push(s.replace(/^(the |a |an )/i, '')); } catch (e) { /* */ } };
    if (t.obj) tryN('obj', t.obj); if (t.animal) tryN('animal', t.animal); if (t.shape) tryN('shape', t.shape);
    if (t.n != null) tryN('number', t.n); if (t.text) out.push(String(t.text));
    try { const p = I.phrase(lang, t); if (p) out.push(p); } catch (e) { /* */ }
    for (const [k, v] of [['animal', t.animal], ['obj', t.obj]]) if (v) { try { const b = I.bareWord(lang, k, v); if (b) out.push(b); } catch (e) { /* */ } }
    if (t.letter && t.kind === 'tile') out.push(t.letter);
    return out;
  }), [R.wr, lang]);
  await ctx.close();
  const P = [];
  if (errors.length) P.push(...errors.slice(0, 3));
  if (R.inv.length) P.push('invariants: ' + R.inv.slice(0, 4).join(' | '));
  // per session checks
  for (let s = 1; s <= SESS; s++) {
    const starts = R.ev.map((e, i) => e.type === 'session' ? i : -1).filter(i => i >= 0);
    if (s > starts.length) continue;
    const ev = R.ev.slice(starts[s - 1], starts[s] != null ? starts[s] : R.ev.length);
    if (!ev.some(e => e.type === 'sessionDone')) continue;
    const lv = ev.filter(e => e.type === 'level').length, tk = ev.filter(e => e.type === 'talk').length, rounds = ev.filter(e => e.type === 'round').length, rights = ev.filter(e => e.type === 'right').length;
    if (lv !== 4 || tk !== 4) P.push(`s${s}: levels ${lv} talks ${tk}`);
    // each round exactly one right
    let cur = 0, bad = 0;
    for (const e of ev) { if (e.type === 'round') { if (cur > 0 && cur !== 1) bad++; cur = 0; } if (e.type === 'right') cur++; }
    if (bad || (rounds && rights !== rounds)) P.push(`s${s}: rounds ${rounds} rights ${rights}`);
  }
  // HUD stars: only go up within a session (reset to 0 at Play again); the value shown before the reset = the session's stars
  { const hv = R.hud.map(h => h.v), peaks = [];
    for (let i = 1; i < hv.length; i++) { if (hv[i] === 0) { peaks.push(hv[i - 1]); continue; } if (hv[i] < hv[i - 1]) P.push(`HUD stars went down ${hv[i - 1]}→${hv[i]} (#${i})`); }
    const sds = R.ev.filter(e => e.type === 'sessionDone').map(e => e.stars);
    const sdsFull = await Promise.resolve(sds);
    // the HUD peak of a finished session should equal its sessionDone stars
    const mism = peaks.filter(p => !sdsFull.includes(p));
    if (mism.length) P.push(`HUD peak ${mism.join(',')} not equal to any session's stars ${sdsFull.join(',')}`);
  }
  // dots: during a round 'now' = round % 4, done = round % 4; at roundDone done = round%4 + 1
  const dotBad = R.dots.filter(x => x.n === 4 && x.st.startsWith('round/') && x.done !== (x.round % 4) && x.done !== (x.round % 4) + 1);
  if (dotBad.length) P.push('dots: ' + JSON.stringify(dotBad.slice(0, 2)));
  // voice log
  const said = R.said.map(x => x.text);
  const raw = said.filter(t => !t || RAW.test(t)); if (raw.length) P.push('raw lines: ' + raw.slice(0, 3).join(' | '));
  const neg = said.filter(t => NEG.test(t)); if (neg.length) P.push('negative words: ' + [...new Set(neg)].slice(0, 3).join(' | '));
  const langBad = lang === 'vi' ? said.filter(t => !VI.test(t) && !/^[\d\s+\-=,.!?…]+$/.test(t)) : said.filter(t => VI.test(t));
  if (langBad.length) P.push(`lines not in ${lang}: ` + [...new Set(langBad)].slice(0, 4).join(' | '));
  const dup = []; for (let i = 1; i < said.length; i++) if (said[i] === said[i - 1]) dup.push(said[i]);
  if (dup.length) P.push(`same line twice in a row ×${dup.length}: ` + [...new Set(dup)].slice(0, 3).join(' | '));
  // asks: each ask event produced a spoken line
  const asks = R.ev.filter(e => e.type === 'ask').length;
  // count runs
  const nums = lang === 'vi' ? ['một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín', 'mười', 'mười một', 'mười hai'] : ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  for (const r of R.rr.filter(r => r.count)) {
    const n = r.count.n, txt = r.text.toLowerCase();
    const run = nums.slice(0, n);
    let pos = 0, okRun = true;
    for (const w of run) { const i = txt.indexOf(w, pos); if (i < 0) { okRun = false; break; } pos = i + w.length; }
    if (!okRun) { P.push(`count run incomplete n=${n}: ${r.text}`); break; }
    const spoken = said.includes(r.text); if (!spoken) { P.push('count run not spoken: ' + r.text); break; }
  }
  // sayWrong names the tapped thing
  let wrongBad = 0; const wbEx = [];
  R.wr.forEach((w, i) => { const c = names[i] || []; const t = (w.text || '').toLowerCase(); if (!c.some(x => x && t.includes(String(x).toLowerCase()))) { wrongBad++; if (wbEx.length < 3) wbEx.push({ text: w.text, cands: c }); } });
  if (wrongBad) P.push(`sayWrong lines not naming the tapped thing: ${wrongBad}/${R.wr.length} e.g. ${JSON.stringify(wbEx)}`);
  // right lines must name the odd thing
  const sec = ((Date.now() - t0) / 1000).toFixed(0);
  const pm = Object.entries(R.phaseMax).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => k + ' ' + v.toFixed(1) + 's').join(', ');
  return { age, lang, dev: d.name, ok: ok && P.length === 0, problems: P, summary: `${sec}s wall, sessions ${R.stats.sessions}, rounds ${R.stats.rounds}, right ${R.stats.correct}, wrong ${R.stats.wrong} (lines ${R.wr.length}), talks ${R.stats.talks}, asks ${asks}, lines ${said.length}, longest phase ${pm}` };
}

(async () => {
  const srv = await L.serve(), browser = await L.chromium.launch();
  const runs = [];
  const devs = ['ipp', 'ipl', 'padp', 'padl'];
  [3, 4, 5, 6, 7].forEach((age, i) => ['en', 'vi'].forEach((lang, j) => runs.push({ age, lang, dk: devs[(i * 2 + j) % 4], seed: 100 + age * 10 + j })));
  const out = [];
  const PAR = +process.env.PAR || 3;
  let k = 0;
  await Promise.all(Array.from({ length: PAR }, async () => {
    while (k < runs.length) {
      const r = runs[k++];
      try { const res = await run(browser, srv.url, r.age, r.lang, r.dk, r.seed); out.push(res); console.log(`${res.ok ? 'PASS' : 'FAIL'} age ${r.age} ${r.lang} ${res.dev}: ${res.summary}${res.ok ? '' : '\n   ' + res.problems.join('\n   ')}`); }
      catch (e) { out.push({ ...r, ok: false, problems: [e.message] }); console.log('FAIL', r, e.message); }
    }
  }));
  await browser.close(); srv.close();
  L.fs.writeFileSync(L.path.join(L.OUT, 'qa_session.json'), JSON.stringify(out, null, 1));
})();
