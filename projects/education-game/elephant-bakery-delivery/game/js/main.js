/* BD main (Tupi's Bakery Delivery) — boots the game, sizes the canvas for any phone / tablet shape, runs the loop and turns
 * world events (the icing road pours out, houses pop up, the oven dings a treat into Tupi's cart, the child drives the cart
 * along the road, the right house opens and a friend says thank you, a wrong house shakes its head and the cart backs up, the
 * trunk fountain, stars fly to the HUD, a seasonal swirl wipes the map, a mouse / bird / snowflakes drop by) into voice, sound,
 * effects and UI, following the event → line table in
 * docs/VOICE.md §1.1 and the event list in docs/MECHANICS.md §6 (prompts protected, count lines never cut, praise
 * rate-limited, hints priority). Touches reach the world only through BD.Input (two numbers in logical px; HUD / speech
 * bubble / menus never reach the canvas). */
(function (BD) {
  'use strict';
  const $ = id => document.getElementById(id);
  const Q = new URLSearchParams(location.search);
  const qn = (k, d) => (Q.has(k) && !isNaN(+Q.get(k)) ? +Q.get(k) : d);
  const FLAGS = {
    speed: Math.max(0.1, qn('speed', 1)), bot: Q.get('bot') === '1', autostart: Q.get('autostart') === '1',
    autorestart: Q.get('autorestart') === '1', seed: Q.has('seed') ? qn('seed', 1) : null, mute: Q.get('mute') === '1',
    debug: Q.get('debug') === '1', age: Q.has('age') ? qn('age', 4) : null, lang: Q.get('lang'), level: Q.has('level') ? qn('level', 0) : null,
    novoice: Q.get('novoice') === '1', botSkill: qn('skill', 0.8)
  };
  let lastSpoken = '';
  const T1 = (key, p) => (BD.I18N ? BD.I18N.t(curLang(), key, Object.assign({ child: S.name || '' }, p || {})) : key);
  // never the same wording twice in a row: re-roll a variant that repeats the line just spoken
  const T = (key, p) => { let r = T1(key, p); for (let k = 0; k < 3 && r && r === lastSpoken; k++) r = T1(key, p); return r; };

  /* ---------- settings (URL flags never saved: they live in session-only overrides) ---------- */
  const DEF = { age: 4, lang: (navigator.language || 'en').toLowerCase().startsWith('vi') ? 'vi' : 'en', name: '', sfx: true, music: true, voice: true, mic: true, volume: 1 };
  let S = Object.assign({}, DEF);
  let langOverride = FLAGS.lang === 'vi' || FLAGS.lang === 'en' ? FLAGS.lang : null;
  const curLang = () => langOverride || S.lang;
  // ?age= is session-only and normalised like the world (round, clamp 3–7) so the title shows the age really played
  let ageOverride = FLAGS.age ? Math.max(3, Math.min(7, Math.round(FLAGS.age))) : null;
  const curAge = () => ageOverride || S.age;
  const saveSettings = () => BD.Storage.setJSON('settings', S);
  const progress = { totalStars: 0, sessions: 0 };

  let world, weather, render, bot = null, inputCancel = null;
  let mode = 'loading';            // loading | title | play | paused | talk | done
  let speed = FLAGS.speed, autoRestart = FLAGS.autorestart;
  let view = { W: 960, H: 720, s: 1, left: 0, top: 0, ins: { top: 0, right: 0, bottom: 0, left: 0 } };
  const stats = { sessions: 0, rounds: 0, correct: 0, wrong: 0, soft: 0, hints: 0, assists: 0, counts: 0, loads: 0, grabs: 0,
    bumps: 0, autoDrives: 0, deliveries: 0, honks: 0, housePops: 0, wipes: 0, gusts: 0, talks: 0, talkRight: 0, surprises: 0,
    mouseTaps: 0, birdTaps: 0, snowTaps: 0, pokes: 0, frames: 0, slowFrames: 0 };
  const eventLog = [];             // the last 300 world events (type + id), for the e2e tests
  let promptUntil = 0, lastWrongSay = -1e9, idleSaid = 0, shownStars = 0, lastPraise = -1e9, lastTapSay = -1e9;
  let wipeN = 0;
  let inputBlockUntil = 0;         // canvas presses right after Resume / Play / Play again are ignored (a double tap falls through)
  let lastRight = null;            // the right answer's line: re-said (short) when a pause cut it during the delivery
  let roundMissed = false, hintBySay = false;
  const blockInput = () => { inputBlockUntil = performance.now() + 250; };

  /* ---------- sizing ---------- */
  function readInsets() {
    const cs = getComputedStyle($('safeProbe'));
    return { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
  }
  function computeView() {
    const vw = window.innerWidth, vh = window.innerHeight, ar = vw / vh;
    let W, H;
    if (ar >= 1) { H = 720; W = Math.max(960, Math.min(1600, Math.round(720 * ar))); }
    else { W = 720; H = Math.max(960, Math.min(1600, Math.round(720 / ar))); }
    const s = Math.min(vw / W, vh / H);
    const cssW = W * s, cssH = H * s, left = (vw - cssW) / 2, top = (vh - cssH) / 2;
    const sa = readInsets();
    const ins = {
      top: Math.max(0, sa.top - top) / s, bottom: Math.max(0, sa.bottom - top) / s,
      left: Math.max(0, sa.left - left) / s, right: Math.max(0, sa.right - left) / s
    };
    return { W, H, s, left, top, cssW, cssH, ins };
  }
  let quality = 1;
  function maxPixels() { return (('ontouchstart' in window) || navigator.maxTouchPoints > 0) ? 3.2e6 : 2.2e6; }
  function renderScale() {
    const dpr = window.devicePixelRatio || 1;
    let rs = view.s * dpr * quality;
    const px = view.W * rs * view.H * rs, cap = maxPixels();
    if (px > cap) rs *= Math.sqrt(cap / px);
    return Math.max(0.5, rs);
  }
  function measureHud() {   // the real DOM HUD in logical px (the speech bubble is placed BY the world, so it is not a keep-out here)
    const box = (r, pad) => ({ x: (r.left - view.left) / view.s - pad, y: 0, w: r.width / view.s + 2 * pad, h: (r.bottom - view.top) / view.s + pad });
    const h = $('hud').getBoundingClientRect();
    return [h.width > 0 ? box(h, 8) : { x: view.W - view.ins.right - 330, y: 0, w: 330, h: view.ins.top + 100 }];
  }
  function applySize() {
    const prev = view;
    view = computeView();
    // rotation mid-gesture: the finger's old logical point is meaningless now → the gesture ends (skill pitfall)
    if (world && (prev.W !== view.W || prev.H !== view.H)) { if (inputCancel && inputCancel.cancel) inputCancel.cancel(); if (world.cancelDrag) world.cancelDrag(); }
    const rs = renderScale();
    const c = $('game');
    c.style.width = view.cssW + 'px'; c.style.height = view.cssH + 'px';
    c.style.left = view.left + 'px'; c.style.top = view.top + 'px';
    render.resize(view.W, view.H, rs);
    world.hudKeep = measureHud();                   // the real HUD (CSS px) may reach lower than the logical keep-out
    world.setViewport(view.W, view.H, view.ins);    // table, roads and houses re-laid for the new shape; the cart keeps its place on the road
    weather.resize(view.W, view.H, world.layout);
    placeBubble();
    updateHudStarTarget();
    if (mode === 'done') requestAnimationFrame(measureDonePanel);
    requestAnimationFrame(measureTitle);
  }
  /** the DOM title (logo, tagline, ▶, star line) in logical px: the title's town keeps clear of it */
  function measureTitle() {
    const out = [];
    for (const sel of ['.logo', '#tagline', '#btnPlay', '.title-info']) {
      const el = document.querySelector(sel), r = el && el.getBoundingClientRect();
      if (r && r.width > 0) out.push({ x: (r.left - view.left) / view.s - 12, y: (r.top - view.top) / view.s - 12, w: r.width / view.s + 24, h: r.height / view.s + 24 });
    }
    render.titleKeep = out.map(k => ({ x: Math.round(k.x), y: Math.round(k.y), w: Math.round(k.w), h: Math.round(k.h) }));
  }
  /** the celebration panel in logical px (render keeps the lit houses in view) */
  function measureDonePanel() {
    const p = document.querySelector('#scrDone .done-panel');
    const r = p && mode === 'done' ? p.getBoundingClientRect() : null;
    render.donePanel = r && r.height ? { x: (r.left - view.left) / view.s, y: (r.top - view.top) / view.s, w: r.width / view.s, h: r.height / view.s } : null;
  }
  function placeBubble() {
    const B = world.layout && world.layout.bubble;
    if (!B) return;
    const r = { x: view.left + B.x * view.s, y: view.top + B.y * view.s, w: B.w * view.s, h: B.h * view.s };
    BD.UI.placeBubble(r);
  }
  function updateHudStarTarget() {
    const p = BD.UI.hudStarPoint();
    if (p.x || p.y) render.hudStar = { x: (p.x - view.left) / view.s, y: (p.y - view.top) / view.s };
  }
  let resizeT = 0;
  function onResize() { clearTimeout(resizeT); resizeT = setTimeout(applySize, 120); }

  /* ---------- voice ---------- */
  const voiceOn = () => S.voice && !FLAGS.novoice && speed <= 1.01 && !FLAGS.mute;
  function speak(text, opt) {
    if (!text) return null;
    lastSpoken = text;
    return BD.Voice ? BD.Voice.say(text, opt || {}) : null;
  }
  const speaking = () => !!(BD.Voice && BD.Voice.isSpeaking && BD.Voice.isSpeaking());
  function applyAudio() {
    const vol = S.volume == null ? 1 : S.volume;
    BD.Audio.setOptions({ sfx: S.sfx, music: S.music, muted: FLAGS.mute, volume: vol });
    if (BD.Voice) { BD.Voice.setLang(curLang()); BD.Voice.setEnabled(voiceOn()); if (BD.Voice.setVolume) BD.Voice.setVolume(vol); if (BD.Voice.setSpeed) BD.Voice.setSpeed(speed); }
    const vl = $('volLevel'); if (vl) vl.textContent = Math.round(vol * 100) + '%';
    const vs = $('optVolume'); if (vs && document.activeElement !== vs) vs.value = Math.round(vol * 100);
  }
  // the question is the most important line: praise / hint lines must not cut it off.
  // Fix round 1 (QA P2-1/2/3, playtest P1): every guard starts when its line really STARTS (Voice.onStart), the prompt's guard
  // holds until the prompt really ENDS (its promise), and a guarded line still waiting in the queue blocks interrupts too.
  let pendingPrompt = null, promptStart = 0, promptSpeaking = null, lineUntil = 0, rightStartAt = -1e9, lastRightTxt = '';
  const guarded = [];   // queued lines whose guard starts with them: {display, kind 'count'|'line', extra}
  const lineMs = txt => 600 + 95 * (txt || '').length;   // voice.js's estimate at rate 0.9 (only a fallback now)
  function speakPrompt(txt, opt) {
    pendingPrompt = txt || null; promptStart = performance.now(); promptSpeaking = null;
    promptUntil = performance.now() + 6000 + lineMs(txt);   // until it starts (if it never does, 6 s + its length)
    const p = speak(txt, Object.assign({ priority: true, prompt: true, tag: 'prompt' }, opt || {}));
    // the prompt ended (spoken, cut or dropped): lift its guard right away — a Tupi tap may repeat it now
    if (p && p.then) p.then(() => {
      promptQueued = false;
      if (pendingPrompt === txt || promptSpeaking === txt) { pendingPrompt = null; promptSpeaking = null; promptUntil = Math.min(promptUntil, performance.now() + 150); }
    }, () => { promptQueued = false; });
    if (!voiceOn()) { pendingPrompt = null; promptQueued = false; promptUntil = performance.now() + lineMs(txt); }
  }
  function onVoiceStart(display) {
    const now = performance.now();
    if (pendingPrompt && display === pendingPrompt) { promptStart = now; promptSpeaking = display; promptUntil = now + 30000; pendingPrompt = null; promptQueued = false; }
    for (let i = 0; i < guarded.length; i++) {
      const g = guarded[i];
      if (g.display !== display) continue;
      guarded.splice(i, 1);
      if (g.kind === 'count') countUntil = Math.max(countUntil, now + lineMs(display) + g.extra);
      else lineUntil = Math.max(lineUntil, now + lineMs(display) + g.extra);
      break;
    }
    if (display === lastRightTxt) rightStartAt = now;
  }
  // count lines (countSeq "One!", the countSel run) have their own guard: a repeated question never lowers it (VOICE §1.1 rule 2)
  let countUntil = 0, promptQueued = false;
  const canInterrupt = () => { const n = performance.now(); return n > promptUntil && n > countUntil && n > lineUntil && guarded.length === 0; };
  /** a line whose guard starts when it starts (count numbers, the wrong / teaching line) */
  function speakGuarded(txt, kind, extra, opt) {
    if (!txt) return;
    const g = { display: txt, kind, extra: extra || 0 };
    if (!voiceOn()) {   // log only: the estimate from now
      const until = performance.now() + lineMs(txt) + g.extra;
      if (kind === 'count') countUntil = Math.max(countUntil, until); else lineUntil = Math.max(lineUntil, until);
      speak(txt, opt);
      return;
    }
    guarded.push(g);
    const p = speak(txt, opt);
    const drop = () => { const i = guarded.indexOf(g); if (i >= 0) guarded.splice(i, 1); };
    if (p && p.then) p.then(drop, drop); else drop();
  }
  /** a count line: priority, never interrupting, never interrupted */
  const speakCount = (txt, extraMs) => speakGuarded(txt, 'count', extraMs, { priority: true, tag: 'count' });
  /** the wrong line carries the goal ("… find a red one!"): priority, protected from its start; it cuts only an unprotected line */
  const speakWrong = txt => speakGuarded(txt, 'line', 0, { priority: true, tag: 'wrong', interrupt: canInterrupt() });
  /** a right line: never cuts a protected line, nor a right line that started < 1.5 s ago (it waits; only the newest waits) */
  function speakRight(txt) {
    if (!txt) return;
    lastRightTxt = txt;
    const cutOk = canInterrupt() && performance.now() - rightStartAt > 1500;
    if (!cutOk && BD.Voice && BD.Voice.dropTagged) BD.Voice.dropTagged('right');
    speak(txt, { interrupt: cutOk, tag: 'right' });
  }

  /* ---------- game flow ---------- */
  function startGame() {
    BD.Audio.unlock();
    world.setAge(curAge()); world.setLang(curLang());
    world.lastTopics = BD.Storage.getJSON('lastTopics', null);   // chapters rotate between sessions
    world.newSession({ lastTopics: world.lastTopics });
    if (world.levels) BD.Storage.setJSON('lastTopics', world.levels);
    if (FLAGS.level != null) world.startLevel(Math.max(0, Math.min(3, FLAGS.level | 0)));
    countUntil = 0; promptUntil = 0; promptQueued = false; lineUntil = 0; guarded.length = 0; pendingPrompt = null; promptSpeaking = null;
    shownStars = 0; BD.UI.setStars(0); lastAsk = null; lastPromptText = ''; lastRight = null; wipeN = 0; lastHonk = -1e9;
    blockInput();
    render.clearGallery();
    if (weather.setParty) weather.setParty(false);
    mode = 'play';
    $('stage').classList.remove('talking');
    BD.UI.only(); BD.UI.show('hud'); BD.UI.say('');
    BD.Audio.setMood(world.weather || 0); BD.Audio.startMusic(); BD.Audio.setFanfare(false);
    applyAudio();
    stats.sessions++;
    requestAnimationFrame(() => { updateHudStarTarget(); applySize(); });
  }
  function goTitle() {
    mode = 'title';
    $('stage').classList.remove('talking');
    if (BD.Voice) BD.Voice.stop();
    if (inputCancel && inputCancel.cancel) inputCancel.cancel();
    if (world.cancelDrag) world.cancelDrag();
    BD.Audio.stopMusic(); BD.Audio.setFanfare(false); BD.Audio.setDrive(false);
    BD.UI.only('scrTitle'); BD.UI.show('hud', false); BD.UI.say('');
    BD.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
    weather.setWeather(0, {}); if (weather.setParty) weather.setParty(false);
    requestAnimationFrame(measureTitle);
  }
  function pause() {
    if (mode !== 'play' && mode !== 'talk') return;
    mode = 'paused';
    countUntil = 0; promptQueued = false; lineUntil = 0; guarded.length = 0;   // Voice.stop below ends every line: no guard outlives it
    if (inputCancel && inputCancel.cancel) inputCancel.cancel();
    if (world.cancelDrag) world.cancelDrag();
    if (BD.Voice) { BD.Voice.stop(); if (BD.Voice.stopListening) BD.Voice.stopListening(); }
    BD.Audio.stopMusic(); BD.Audio.setDrive(false);
    BD.UI.only('scrPause');
  }
  function resume() {
    if (mode !== 'paused') return;
    mode = world.state === 'talk' ? 'talk' : 'play';
    blockInput();
    idleSaid = 0;   // a returning child gets the nudges again before the next auto-pause
    if (world.resetNudges) world.resetNudges();
    BD.UI.only(mode === 'talk' ? 'scrTalk' : undefined);
    BD.Audio.startMusic();
    // say the question again so a returning child knows what to do
    if (mode === 'talk' && world.talk && !world.talkAnswered) speak(T(world.talk.promptKey, world.talk.params || {}), { priority: true });
    else if (world.state === 'intro') speak(T('ui.chapter', { n: world.level + 1 }) + '. ' + T('topic.' + world.topic), { priority: true });
    else if (world.interactive) setTimeout(repeatPrompt, 300);
    else if (world.state === 'round' && world.phase === 'arrive' && lastRight && lastRight.text) {
      // the pause cut the right line during the delivery: say it again (short)
      BD.UI.say(lastRight.text); speak(lastRight.text, { priority: true });
    }
  }

  let lastPromptText = '', lastAsk = null;
  let lastHonk = -1e9, grabbedThisRound = false, deliverSaid = -1, forkSaid = -1;
  function currentPrompt() {   // prompts have several wordings: repeat the one Tupi said, word for word
    if (lastPromptText) return lastPromptText;
    const p = world.prompt ? world.prompt() : null;
    return p ? askText(p) : '';
  }
  function handleEvents() {
    const evs = world.drainEvents();
    for (const e of evs) {
      eventLog.push({ type: e.type, id: e.houseId || e.id, t: world.time });
      if (eventLog.length > 300) eventLog.shift();
      if (bot && bot.onEvent) bot.onEvent(e);
      onEvent(e);
    }
  }
  /** the event + what main knows (VOICE §1.1): topic, the order's prompt key / params / cargo, the house's sign */
  function ev2(e) {
    const o = world.orderObj || lastAsk || {}, H = e.houseId && world.houseById ? world.houseById(e.houseId) : null;
    return Object.assign({ topic: world.topic, promptKey: o.promptKey, params: o.params, cargo: o.cargo, rule: o.rule }, e, H ? { sign: H.sign } : {});
  }
  function line(fn, e, fallbackKey) {
    const I = BD.I18N;
    if (I && typeof I[fn] === 'function') { try { const t = I[fn](curLang(), e); if (t) return t; } catch (err) { /* fall back */ } }
    return fallbackKey ? T(fallbackKey) : '';
  }
  function tupiMood(m, t) { if (world.tupi && world.interactive) { world.tupi.mood = m; world.tupi.moodT = t; } }
  function askText(e) {
    const I = BD.I18N, cargo = e.cargo || (world.orderObj && world.orderObj.cargo);
    if (I && I.ask) { try { return I.ask(curLang(), e.promptKey, Object.assign({ child: S.name || '' }, e.params || {}), { first: !!e.first, cargo }); } catch (err) { /* fall back */ } }
    return T(e.promptKey, e.params || {});
  }
  const thr = (name, ms) => !BD.Voice || !BD.Voice.throttle || BD.Voice.throttle(name, ms);
  function flyStars(n, x, y) {
    for (let i = 0; i < n; i++) {
      render.burst('star', x + (i - (n - 1) / 2) * 60, y, { delay: 0.1 + i * 0.2, onDone: () => { shownStars++; BD.UI.setStars(shownStars, true); BD.Audio.play('star', { i }); } });
    }
  }

  function onEvent(e) {
    switch (e.type) {
      case 'level': {
        const wi = (e.weather != null ? e.weather : e.level) % 4;
        weather.setWeather(wi, {});
        BD.Audio.setMood(wi); BD.Audio.play('chapter');
        BD.UI.setDots(world.roundsPerLevel || 4, 0);
        speak(T('ui.chapter', { n: e.level + 1 }) + '. ' + T('topic.' + e.topic), { interrupt: true, tag: 'flavour' });
        speak(T('weather.' + wi), { tag: 'flavour' });
        BD.UI.say('');
        render.prewarm(world.layout, wi);
        break;
      }
      case 'round': {
        BD.UI.fadeBubble(false); BD.Audio.setFanfare(false);
        stats.rounds++; idleSaid = 0; lastAsk = null; lastPromptText = ''; lastRight = null; roundMissed = false; grabbedThisRound = false;
        BD.UI.setDots(world.roundsPerLevel || 4, e.round % (world.roundsPerLevel || 4));
        BD.UI.say(T('roadDone'));   // shown, not spoken: the question follows in a moment
        BD.Audio.play('pour');
        render.prewarmRound(world);
        break;
      }
      case 'house': BD.Audio.play('plop', { pitch: 1 + 0.12 * (stats.housePops++ % 4) }); break;
      case 'rollOut': BD.Audio.play('bell'); break;
      case 'load': stats.loads++; BD.Audio.play('ding'); if (weather.burst) weather.burst(e.x, e.y, { kind: 'sparkle', n: 6 }); break;
      case 'count': {   // a cookie hops into the tray: a rising pip + its number, aloud
        stats.counts++;
        BD.Audio.play('pip', { i: e.i });
        render.burst('count', e.x, e.y - 60, { n: e.i });
        const I = BD.I18N;
        if (I && I.sayCount) speakCount(I.sayCount(curLang(), e.i));
        if (e.n && e.i === e.n && I && I.sayCountRun) speakCount(I.sayCountRun(curLang(), e.n, 'cookies'), 200);
        break;
      }
      case 'ask': {
        lastAsk = Object.assign({}, e); idleSaid = 0; BD.UI.fadeBubble(false); hintBySay = false; promptQueued = false;
        if (BD.Voice && BD.Voice.dropTagged) BD.Voice.dropTagged(['flavour', 'right']);
        const txt = askText(e);
        lastPromptText = txt;
        const flav = BD.Voice && BD.Voice.currentTag && BD.Voice.currentTag() === 'flavour';
        BD.UI.say(txt); speakPrompt(txt, { priority: true, interrupt: !!flav });
        if (world.level === 0 && world.round === 0 && (e.orderIndex | 0) === 0 && thr('drag', 12000)) speak(T('drag'), { priority: true, tag: 'drag' });
        break;
      }
      case 'grab': stats.grabs++; grabbedThisRound = true; BD.Audio.play('grab'); break;
      case 'drive': BD.Audio.setDrive(!!e.on, 420); break;
      case 'bump': stats.bumps++; BD.Audio.play('bump'); break;
      case 'fork':
        BD.Audio.play('fork');
        if (curAge() <= 4 && world.round === 0 && forkSaid !== world.round + world.level * 10 && !speaking() && canInterrupt() && thr('fork', 8000)) { forkSaid = world.round + world.level * 10; speak(T('fork'), { tag: 'flavour' }); }
        break;
      case 'autoDrive': stats.autoDrives++; BD.Audio.play('grab'); break;
      case 'right': {
        stats.correct++;
        BD.Audio.setDrive(false); BD.Audio.play('brake'); BD.Audio.play('right');
        setTimeout(() => BD.Audio.play('door'), 150 / Math.max(1, speed));
        const txt = line('sayRight', ev2(e), 'praise');
        lastRight = { text: txt };
        if (pendingPrompt && BD.Voice && BD.Voice.dropTagged) { BD.Voice.dropTagged('prompt'); pendingPrompt = null; promptUntil = Math.min(promptUntil, performance.now()); }
        speakRight(txt);
        BD.UI.say(txt);
        break;
      }
      case 'deliver': {
        stats.deliveries++;
        BD.Audio.play('deliver');
        render.burst('sparkles', e.x, e.y - 30, { n: 14, color: e.cargo && e.cargo.color });
        const key = world.level * 100 + world.round * 10 + (world.order | 0);
        if (deliverSaid !== key && !speaking() && canInterrupt()) { deliverSaid = key; speak(T('thanks'), { tag: 'thanks', pitch: 1.35 }); }
        break;
      }
      case 'hearts': BD.Audio.play('hearts'); if (weather.burst) weather.burst(e.x, e.y, { kind: 'hearts', n: 3 }); break;
      case 'back': if (Math.random() < 0.15 && !speaking() && canInterrupt()) speak(T('back'), { tag: 'flavour' }); break;
      case 'party': {
        BD.Audio.play('honk'); BD.Audio.setFanfare(true);
        setTimeout(() => BD.Audio.setFanfare(false), 2200 / Math.max(1, speed));
        if (performance.now() - lastPraise > 1200) { lastPraise = performance.now(); const t = T('party'); if (BD.Voice && BD.Voice.dropTagged) BD.Voice.dropTagged(['thanks', 'flavour']); speak(t, { tag: 'party' }); BD.UI.say(t); }
        break;
      }
      case 'spray': BD.Audio.play('spray'); if (weather.burst) weather.burst(e.x, e.y, { kind: 'stars', n: 6 }); break;
      case 'roundDone': {
        BD.UI.setDots(world.roundsPerLevel || 4, ((e.round != null ? e.round : world.round) % (world.roundsPerLevel || 4)) + 1);
        flyStars(e.stars || 1, e.x, e.y);
        break;
      }
      case 'wipe': {
        stats.wipes++; wipeN++;
        BD.Audio.play('wipe'); BD.Audio.setDrive(false);
        if (weather.wipeParticles) weather.wipeParticles(e.dir || { x: 1, y: 0 });
        BD.UI.fadeBubble(true);
        const first = world.level === 0 && wipeN === 1;
        if ((first || Math.random() < 0.25) && !speaking() && canInterrupt()) speak(T('wipe'));
        break;
      }
      case 'wrong': {
        stats.wrong++;
        BD.Audio.setDrive(false); BD.Audio.play('boing');
        roundMissed = true;
        const now = performance.now();
        if (now - lastWrongSay > 1500) {
          lastWrongSay = now;
          const ee = ev2(e);
          const wt = e.hint ? line('sayWrongHint', ee, 'hint') : line('sayWrong', ee, 'hint');
          if (e.hint) hintBySay = true;
          if (BD.Voice && BD.Voice.dropTagged) BD.Voice.dropTagged(['wrong', 'right', 'thanks']);
          speakWrong(wt); BD.UI.say(wt);
        }
        break;
      }
      case 'reverse': BD.Audio.play('reverse'); break;
      case 'honk': {   // a tap on the cart: Tupi toots and says the question again (2nd tap within 6 s: how to drive)
        stats.honks++;
        BD.Audio.play('honk', { pitch: 1.15 });
        const now = performance.now(), again = now - lastHonk < 6000;
        lastHonk = now;
        if (again && thr('drag', 12000)) { speak(T('drag'), { priority: true, tag: 'drag' }); BD.UI.say(T('drag')); break; }
        if (canInterrupt() && thr('honk', 2000)) speak(T('honk'), { tag: 'honk' });
        askAgain(true);
        break;
      }
      case 'soft': stats.soft++; BD.Audio.play('soft'); render.burst('crumbs', e.x, e.y); break;
      case 'hint': {
        stats.hints++;
        BD.Audio.play('hint');
        if (e.demo) break;   // the warm-up demo: the drag line was queued with the ask
        if (!e.idle && !hintBySay) speak(T('hint'), { priority: true });
        hintBySay = false;
        break;
      }
      case 'assistArmed': BD.Audio.play('hint'); break;
      case 'assist': stats.assists++; break;
      case 'idle':
        if (++idleSaid <= 4) speak((idleSaid === 1 && !grabbedThisRound ? T('drag') : T('idle')) + ' ' + currentPrompt());
        else if (idleSaid >= 5 && !bot) pause();   // ≈ 2 min without a touch: nobody is playing — pause
        break;
      case 'pokeTupi': {
        stats.pokes++;
        BD.Audio.play('giggle');
        if (!speaking() && canInterrupt() && thr('poke', 2000)) speak(T('poke'));
        break;
      }
      case 'gust': stats.gusts++; BD.Audio.play('gust'); break;
      case 'mouse': case 'bird': case 'snow': {
        stats.surprises++;
        BD.Audio.play(e.type === 'mouse' ? 'squeak' : e.type === 'bird' ? 'song' : 'twinkle');
        if (canInterrupt()) speak(T('surprise.' + e.type));
        break;
      }
      case 'mouseTap': case 'birdTap': case 'snowTap': {
        const k = e.type.replace('Tap', '');
        stats[k + 'Taps']++;
        BD.Audio.play(k === 'mouse' ? 'squeak' : k === 'bird' ? 'song' : 'twinkle');
        render.burst('sparkles', e.x, e.y, { n: 8, color: k === 'snow' ? '#FFFFFF' : null });
        if (k === 'mouse' && weather.burst) weather.burst(e.x, e.y, { kind: 'crumbs', n: 5 });
        if (canInterrupt() && !speaking() && thr(k + '.tap', 2000)) speak(T(k + '.tap'), { interrupt: true });
        break;
      }
      case 'talk': BD.UI.fadeBubble(false); BD.UI.say(''); BD.Audio.setFanfare(false); BD.Audio.setDrive(false); BD.UI.setDots(world.roundsPerLevel || 4, world.roundsPerLevel || 4); openTalk(e.talk || world.talk); break;
      case 'talkAsk': {
        const tk = e.talk || world.talk;
        if (tk && e.n <= 3) speak(T(tk.promptKey, tk.params || {}), { priority: true, interrupt: true });
        if (tk && (e.n >= 2 || e.glowAnswer)) BD.UI.glowTalk(tk.answerId || tk.answer);
        break;
      }
      case 'talkResult': {
        stats.talks++; if (e.correct) stats.talkRight++;
        BD.UI.markTalk(e.choiceId, e.answerId);
        const tk = world.talk, ans = (tk && tk.choices.find(c => c.id === e.answerId)) || {};
        const kind = () => (BD.I18N.talkWrong ? BD.I18N.talkWrong(curLang(), ans, tk) : T('talk.wrong.any'));
        if (e.auto) { speak(kind(), { interrupt: true }); break; }
        if (e.correct) {
          BD.Audio.play('talkRight');
          render.burst('star', view.W / 2, view.H / 2, { onDone: () => { shownStars++; BD.UI.setStars(shownStars, true); BD.Audio.play('star'); } });
          speak(T('talk.right'), { interrupt: true });
        } else {
          BD.Audio.play('gentle');
          speak(kind(), { interrupt: true });
        }
        break;
      }
      case 'levelDone':
        BD.Audio.play('level'); BD.UI.say('');
        if (mode === 'talk') { mode = 'play'; BD.UI.only(); }
        $('stage').classList.remove('talking');
        speak(T('great'));
        break;
      case 'sessionDone': {
        BD.Audio.play('party'); BD.Audio.setFanfare(false); BD.Audio.setDrive(false);
        if (weather.setParty) weather.setParty(true);
        render.burst('confetti', 0, 0);
        progress.totalStars += e.stars || 0; progress.sessions++;
        BD.Storage.setJSON('progress', progress);
        shownStars = e.stars || shownStars; BD.UI.setStars(shownStars);
        $('doneStars').textContent = e.stars || 0;
        $('doneTitle').textContent = T('session.done', { stars: e.stars || 0 });
        speak(T('party'), { interrupt: true });
        speak(T('session.done', { stars: e.stars || 0 }));
        mode = 'done';
        BD.UI.only('scrDone'); BD.UI.show('hud', false); BD.UI.say('');
        requestAnimationFrame(measureDonePanel);
        if (autoRestart) setTimeout(() => { if (mode === 'done') startGame(); }, 1500 / speed);
        break;
      }
    }
  }

  /* ---------- Talk time ---------- */
  function openTalk(talk) {
    if (!talk) return;
    $('stage').classList.add('talking');
    mode = 'talk';
    if (inputCancel && inputCancel.cancel) inputCancel.cancel();
    if (world.cancelDrag) world.cancelDrag();
    const canMic = S.mic && BD.Voice && BD.Voice.canListen && BD.Voice.canListen() && !FLAGS.bot;
    BD.UI.openTalk(talk, curLang(), id => { BD.Audio.play('click'); world.talkAnswer(id); }, canMic, curAge());
    const q = T(talk.promptKey, talk.params || {});
    speakPrompt(T('talk.intro') + ' ' + q, { priority: true });   // queued after the round's praise, not cutting it off
  }
  function listen() {
    const talk = world.talk;
    if (!talk || world.state !== 'talk' || !BD.Voice || !BD.Voice.canListen()) return;
    if (BD.Voice.stop) BD.Voice.stop();
    BD.Audio.play('listen');
    BD.UI.setListening(true, T('ui.listening'));
    const choices = talk.choices.map(c => ({ id: c.id, words: BD.I18N.choiceWords ? BD.I18N.choiceWords(curLang(), c) : [] }));
    BD.Voice.listen({ lang: curLang(), choices, timeoutMs: 6000 }).then(res => {
      BD.UI.setListening(false, T('ui.tapOrSay'));
      if (world.state !== 'talk') return;
      if (res && res.id != null) world.talkAnswer(res.id);
      else if (res && res.reason === 'not-allowed') { $('btnMic').classList.add('hidden'); speak(T('ui.micDenied')); }
      else speak(T('ui.tapOrSay'));
    }).catch(() => BD.UI.setListening(false, T('ui.tapOrSay')));
  }

  /* ---------- loop ---------- */
  let last = 0, slowAcc = 0, pendingResize = false;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (document.hidden) { last = ts; return; }
    let dt = last ? (ts - last) / 1000 : 0.016;
    last = ts;
    const raw = dt;
    // a backing-store resize clears the canvas: do it before drawing, never between draw and present
    if (pendingResize) { pendingResize = false; render.resize(view.W, view.H, renderScale()); }
    dt = Math.min(dt, 0.1);
    stats.frames++;
    if (mode === 'play' || mode === 'talk' || mode === 'done') {
      let left = dt * speed;
      while (left > 1e-6) {
        const st = Math.min(left, 1 / 30);
        if (bot && (mode === 'play' || mode === 'talk')) bot.step(st);
        world.update(st);
        handleEvents();
        left -= st;
      }
    }
    bubbleOverTupi();
    weather.update(dt * Math.min(speed, 4), {});
    const sp = speaking();
    BD.Audio.duck(sp);
    if (BD.Audio.tick) BD.Audio.tick(dt);
    render.draw(world, weather, { dt: dt * Math.min(speed, 4), lang: curLang(), title: mode === 'title' || mode === 'loading', speaking: sp, done: mode === 'done', debug: FLAGS.debug });
    adapt(raw);
  }
  /** safety net: the DOM speech bubble fades while Tupi's art passes under it (MECHANICS §0.6) */
  let bubbleUnder = false;
  function bubbleOverTupi() {
    const on = mode === 'play' && !!world.cartUnderBubble && !!world.cartUnderBubble();
    if (on !== bubbleUnder) { bubbleUnder = on; BD.UI.bubbleUnder(on); }
  }
  let fastAcc = 0;
  function adapt(raw) {  // adaptive quality: step the render scale down when frames stay slow, back up after 10 s of fast ones
    if (raw > 0.5) return;
    if (raw > 0.022) { slowAcc += raw; stats.slowFrames++; fastAcc = 0; } else { slowAcc = Math.max(0, slowAcc - raw * 0.5); fastAcc += raw; }
    // only the backing store changes: World.setViewport would cancel the child's gesture
    if (slowAcc > 1.5 && quality > 0.6) { quality *= 0.85; render.quality = Math.max(0.5, quality); slowAcc = 0; fastAcc = 0; pendingResize = true; }
    else if (fastAcc > 10 && quality < 1) { quality = Math.min(1, quality / 0.85); render.quality = quality; fastAcc = 0; pendingResize = true; }
  }

  /* ---------- input ---------- */
  function toLogical(cx, cy) { return { x: (cx - view.left) / view.s, y: (cy - view.top) / view.s }; }
  function repeatPrompt(force) {
    // only while the question can still be answered (never during a hop / the bank: that would cut the right line / count)
    if ((!world.interactive && !force) || !lastAsk) return;
    BD.Audio.play('click');
    tupiMood('talk', 1.0);
    const cp = currentPrompt(); promptUntil = 0; BD.UI.say(cp); speakPrompt(cp, { interrupt: true });
  }
  /** a cart / speech-bubble tap while the question can be answered (VOICE §1.1 rule 4): never cut a protected prompt, wrong or
   *  count line — queue the question ONCE to follow it; never restart the question while Tupi is still saying it */
  function askAgain(force) {
    if ((!world.interactive && !force) || !lastAsk) return;
    if (speaking() && lastSpoken === lastPromptText) return;
    if (guarded.some(g => g.kind === 'count')) return;   // count numbers still to come: never queue the question behind them
    if (!canInterrupt()) {
      if (pendingPrompt || promptQueued) return;   // the question is still to come
      const now = performance.now();
      if (now - promptStart < 3000) return;
      promptQueued = true; tupiMood('talk', 1.0);
      const cp = currentPrompt(); BD.UI.say(cp); speakPrompt(cp, { priority: true });
      return;
    }
    const since = performance.now() - promptStart;
    const stuck = pendingPrompt && since > 6000;   // the prompt never started (no voice / dropped): don't wait forever
    if (since > 3000 && (!pendingPrompt || stuck)) repeatPrompt(force);
  }
  function bubbleTap() { askAgain(); }

  function bindUI() {
    BD.Input.kidProof();
    BD.UI.guardScreenClicks();   // a finger held on the canvas never clicks a screen that opens under it (QA-F P2-1)
    // Input passes two NUMBERS in logical px (never a point object) — VOICE §4
    inputCancel = BD.Input.attach($('game'), {
      toLogical,
      down: (x, y) => { if (mode === 'play' && !bot && performance.now() >= inputBlockUntil) world.pointerDown(x, y); },   // judged at once
      move: (x, y) => { if (mode === 'play' && !bot) world.pointerMove(x, y); },   // delivered (the world ignores it in play)
      up: (x, y) => { if (mode === 'play' && !bot) world.pointerUp(x, y); },
      cancel: () => { if (world.cancelDrag) world.cancelDrag(); }
    });
    const unlock = () => { BD.Audio.unlock(); if (BD.Voice) BD.Voice.unlock(); };
    ['touchend', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { capture: true, passive: true }));

    $('btnPlay').addEventListener('click', () => { BD.Audio.play('click'); startGame(); });
    $('bubble').addEventListener('click', bubbleTap);
    $('btnPause').addEventListener('click', () => { BD.Audio.play('click'); pause(); });
    $('btnResume').addEventListener('click', () => { BD.Audio.play('click'); resume(); });
    $('btnHome').addEventListener('click', () => { BD.Audio.play('click'); goTitle(); });
    $('btnAgain').addEventListener('click', () => { BD.Audio.play('click'); startGame(); });
    $('btnDoneHome').addEventListener('click', () => { BD.Audio.play('click'); goTitle(); });
    $('btnMic').addEventListener('click', listen);
    // volume: settings slider + big − / + in the pause menu
    $('optVolume').addEventListener('input', () => { S.volume = +$('optVolume').value / 100; saveSettings(); applyAudio(); });
    $('optVolume').addEventListener('change', () => BD.Audio.play('land'));
    const vstep = d => { S.volume = Math.max(0, Math.min(1, Math.round(((S.volume == null ? 1 : S.volume) + d) * 20) / 20)); saveSettings(); applyAudio(); BD.Audio.play('land'); };
    $('btnVolDown').addEventListener('click', () => vstep(-0.1));
    $('btnVolUp').addEventListener('click', () => vstep(0.1));
    document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => {
      S.lang = b.dataset.lang; langOverride = null; saveSettings(); BD.UI.applyLang(curLang()); applyAudio(); BD.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
      updateVoiceInfo();
      BD.Audio.play('click');
      if (mode === 'title') speak(T('ui.welcome'), { interrupt: true });
      requestAnimationFrame(measureTitle);
    }));
    // parent gate: hold the gear for 2 s
    const gear = $('btnParents');
    BD.Input.holdButton(gear, 2000, () => { gear.style.setProperty('--p', 0); openSettings(); },
      p => { gear.style.setProperty('--p', p); gear.classList.toggle('holding', p > 0); });
    gear.addEventListener('click', () => { gear.classList.add('tip'); setTimeout(() => gear.classList.remove('tip'), 1600); });
    BD.UI.bindSettings(S, k => {
      saveSettings();
      if (k === 'sfx' || k === 'music' || k === 'voice') applyAudio();
      if (k === 'age') { ageOverride = null; BD.UI.setTitleInfo(progress.totalStars, curAge(), curLang()); }
      if (k === 'name' && BD.I18N.setChild) BD.I18N.setChild(S.name);
    }, curAge);
    $('btnSettingsDone').addEventListener('click', () => { BD.Audio.play('click'); BD.UI.only('scrTitle'); BD.UI.setTitleInfo(progress.totalStars, curAge(), curLang()); });

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(applySize, 250));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (inputCancel && inputCancel.cancel) inputCancel.cancel(); if (world.cancelDrag) world.cancelDrag(); pause(); BD.Audio.suspend(); if (BD.Voice) BD.Voice.stop(); }
      else BD.Audio.resume();
    });
    window.addEventListener('blur', () => { if (world && world.cancelDrag) world.cancelDrag(); });
  }
  function openSettings() {
    BD.Audio.play('click');
    BD.UI.refreshSettings();
    updateVoiceInfo();
    BD.UI.only('scrSettings');
  }
  function updateVoiceInfo() {
    if (!BD.Voice) return;
    const has = BD.Voice.hasVoice ? BD.Voice.hasVoice(curLang()) : false;
    const nm = BD.Voice.voiceName ? BD.Voice.voiceName(curLang()) : '';
    const mic = BD.Voice.canListen && BD.Voice.canListen();
    const v = has ? (curLang() === 'vi' ? 'Giọng đọc: ' : 'Voice: ') + (nm || '✓') : T('ui.voiceMissing');
    const m = mic ? '' : ' · ' + T('ui.micUnsupported');
    BD.UI.setVoiceInfo(v + m);
  }

  /* ---------- test hooks (DESIGN §5.5) — live getters via defineProperties (never Object.assign) ---------- */
  function hooks() {
    const circ = c => (c ? { x: view.left + c.x * view.s, y: view.top + c.y * view.s, r: (c.r || 0) * view.s, own: (c.own || c.r || 0) * view.s } : null);
    const box = b => (b ? { x: view.left + b.x * view.s, y: view.top + b.y * view.s, w: (b.w || 0) * view.s, h: (b.h || 0) * view.s,
      cx: view.left + (b.cx != null ? b.cx : b.x + b.w / 2) * view.s, cy: view.top + (b.cy != null ? b.cy : b.y + b.h / 2) * view.s } : null);
    const prev = BD.debug || {};
    BD.debug = prev;
    Object.defineProperties(prev, Object.getOwnPropertyDescriptors({
      get world() { return world; }, get weather() { return weather; }, get mode() { return mode; }, stats, events: eventLog,
      get bot() { return bot; },
      get voiceLog() { return (BD.Voice && BD.Voice.log) || []; },
      getState() {
        const c = world.cart;
        return { mode, state: world.state, phase: world.phase, level: world.level, topic: world.topic, round: world.round,
          stars: world.stars, misses: world.misses, interactive: world.interactive, order: world.order,
          cart: c ? { state: c.state, x: c.x, y: c.y, edge: c.edge, s: c.s } : null,
          houses: (world.houses || []).map(h => ({ id: h.id, x: h.x, y: h.y, target: !!(world.answer && world.answer() && world.answer().houseId === h.id), kind: h.sign && h.sign.kind, delivered: !!h.delivered })),
          surprise: world.surprise, weather: weather.ambient && weather.ambient.mood, W: view.W, H: view.H, ins: view.ins, settings: Object.assign({}, S), speed };
      },
      setSpeed(n) { speed = Math.max(0.1, +n || 1); applyAudio(); },
      startGame, goTitle,
      setBot(on, skill) { bot = on ? new BD.Bot(world, { skill: skill == null ? FLAGS.botSkill : skill, seed: 7 }) : null; },
      setAutoRestart(on) { autoRestart = !!on; },
      gotoLevel(i) { world.startLevel(i); },
      view: () => view, render: () => render,
      cartScreen() { return circ(world.cartHit ? world.cartHit() : null); },
      houseScreen(id) { const h = world.houseHit ? world.houseHit(id) : null; return h ? box({ x: h.x0, y: h.y0, w: h.x1 - h.x0, h: h.y1 - h.y0, cx: h.cx, cy: h.cy }) : null; },
      routeScreen(id) { const r = world.route ? world.route(id) : null; return r ? r.map(p => { const q = Array.isArray(p) ? p : [p.x, p.y]; return [view.left + q[0] * view.s, view.top + q[1] * view.s]; }) : null; },
      mouseScreen() { return circ(world.mouseHit ? world.mouseHit() : null); },
      birdScreen() { return circ(world.birdHit ? world.birdHit() : null); },
      snowScreen() { return circ(world.snowHit ? world.snowHit() : null); },
      answer() { return world.answer ? world.answer() : null; },
      targets() { return world.targets ? world.targets() : []; },
      toScreen(x, y) { return { x: view.left + x * view.s, y: view.top + y * view.s }; },
      audio: () => BD.Audio
    }));
  }

  /* ---------- boot ---------- */
  async function boot() {
    await BD.Storage.init();
    S = Object.assign({}, DEF, BD.Storage.getJSON('settings', {}));
    Object.assign(progress, BD.Storage.getJSON('progress', {}));
    BD.UI.applyLang(curLang());
    if (BD.I18N && BD.I18N.setChild) BD.I18N.setChild(S.name);
    if (BD.Voice) { BD.Voice.init({ lang: curLang(), enabled: voiceOn(), speed }); const prevStart = BD.Voice.onStart; BD.Voice.onStart = d => { onVoiceStart(d); if (prevStart) prevStart(d); }; }
    render = new BD.Renderer($('game')); BD.render = render;
    world = new BD.World({ seed: FLAGS.seed != null ? FLAGS.seed : (Date.now() & 0x7fffffff), age: curAge(), lang: curLang() });
    weather = new BD.Weather({ width: 960, height: 720, seed: 11 });
    weather.windSource = world;   // leaves / petals / snow move with the same gusts
    hooks();
    bindUI();
    applySize();
    weather.setWeather(0, { instant: true });
    await BD.Assets.load();
    render.prewarm(world.layout, 0);
    applyAudio();
    if (FLAGS.bot) bot = new BD.Bot(world, { skill: FLAGS.botSkill, seed: 7 });
    BD.UI.only('scrTitle');
    BD.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
    mode = 'title';
    requestAnimationFrame(measureTitle);
    requestAnimationFrame(frame);
    if (FLAGS.autostart) startGame();
    if (BD.Voice && BD.Voice.onVoicesChanged) BD.Voice.onVoicesChanged(updateVoiceInfo);
  }
  window.addEventListener('DOMContentLoaded', () => boot().catch(e => { console.error(e); }));
})(window.BD = window.BD || {});
