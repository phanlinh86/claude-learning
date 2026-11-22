/* DK main (Mimi's Splash Rocket) — boots the game, sizes the canvas for any phone / tablet shape, runs the loop and turns world
 * events (picnic mats unfold on the meadow, the child taps the mat Mimi asks for, pumps three times, the water rocket whooshes
 * up and floats down under its parachute onto the mat, the thing flies up the camp flagpole as a pennant, the camp counts the
 * pennants while the rocket shoots a fountain, stars fly to the HUD, a weather sweep wipes the round, a marmot / goat / bird
 * drop by) into voice, sound, effects and UI, following the event → line table in docs/VOICE.md §3 and the event list in
 * docs/MECHANICS.md §6 (prompts protected, count lines never cut, the pump count through Voice.sayPump, praise rate-limited,
 * decorative lines rare and droppable). Touches reach the world only through DK.Input (two numbers in logical px; HUD /
 * speech bubble / menus never reach the canvas); in the pump phase every extra finger is a new stomp (rapidTaps). */
(function (DK) {
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
  const T1 = (key, p) => (DK.I18N ? DK.I18N.t(curLang(), key, Object.assign({ child: S.name || '' }, p || {})) : key);
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
  const saveSettings = () => DK.Storage.setJSON('settings', S);
  const progress = { totalStars: 0, sessions: 0 };

  let world, weather, render, bot = null, inputCancel = null;
  let mode = 'loading';            // loading | title | play | paused | talk | done
  let speed = FLAGS.speed, autoRestart = FLAGS.autorestart;
  let view = { W: 960, H: 720, s: 1, left: 0, top: 0, ins: { top: 0, right: 0, bottom: 0, left: 0 } };
  const stats = { sessions: 0, rounds: 0, correct: 0, wrong: 0, squish: 0, soft: 0, hints: 0, assists: 0, counts: 0, unfolds: 0,
    pumps: 0, autoPumps: 0, launches: 0, chutes: 0, lands: 0, pennants: 0, camps: 0, fountains: 0, hopBacks: 0, wipes: 0, gusts: 0,
    talks: 0, talkRight: 0, surprises: 0, marmotTaps: 0, goatTaps: 0, birdTaps: 0, pokes: 0, frames: 0, slowFrames: 0 };
  const eventLog = [];             // the last 300 world events (type + id), for the e2e tests
  let promptUntil = 0, lastWrongSay = -1e9, idleSaid = 0, shownStars = 0, lastPraise = -1e9, lastTapSay = -1e9;
  let sessionPennants = [], unfoldSaid = -1, wipeN = 0, landSaidRound = -1, pumpSeen = 0;
  let inputBlockUntil = 0;         // canvas presses right after Resume / Play / Play again are ignored (a double tap falls through)
  let lastRight = null;            // the right answer's line: re-said (short) when a pause cut it
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
  function windsockKeep() {
    try {
      if (!DK.MeadowArt || !render || !world.layout) return null;
      // the windsock + (QA P3-3) a tent pitched outside the camp column: mats keep clear of every prop on the meadow
      const out = DK.MeadowArt.campProps(render.artLayout(world.layout)).filter(q => q.box && (q.kind === 'windsock' || q.edge))
        .map(p => ({ x: p.box.x - 6, y: p.box.y - 6, w: p.box.w + 12, h: p.box.h + 12 }));
      return out.length ? out : null;
    } catch (e) { return null; }
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
    world.setViewport(view.W, view.H, view.ins);    // camp + meadow re-laid; mats glide to their new homes, Mimi / pad / pole snap
    // the windsock stands on the meadow's far edge (MeadowArt, outside the camp corner): mats and the goat's rock keep clear of it
    const sock = windsockKeep();
    if (sock) { world.hudKeep = world.hudKeep.concat(sock); world.setViewport(view.W, view.H, view.ins); }
    weather.resize(view.W, view.H, world.layout);
    placeBubble();
    updateHudStarTarget();
    if (mode === 'done') requestAnimationFrame(measureDonePanel);
    requestAnimationFrame(measureTitle);
  }
  /** the DOM title (logo, tagline, ▶, star line, language / gear row) in logical px: the title's mats keep clear of it */
  function measureTitle() {
    const out = [];
    for (const sel of ['.logo', '#tagline', '#btnPlay', '.title-info', '.title-top .lang-switch', '#btnParents']) {
      const el = document.querySelector(sel), r = el && el.getBoundingClientRect();
      if (r && r.width > 0) out.push({ x: (r.left - view.left) / view.s - 12, y: (r.top - view.top) / view.s - 12, w: r.width / view.s + 24, h: r.height / view.s + 24 });
    }
    render.titleKeep = out.map(k => ({ x: Math.round(k.x), y: Math.round(k.y), w: Math.round(k.w), h: Math.round(k.h) }));
  }
  /** the celebration panel in logical px (render keeps the golden mats and the garland clear of it) */
  function measureDonePanel() {
    const p = document.querySelector('#scrDone .done-panel');
    const r = p && mode === 'done' ? p.getBoundingClientRect() : null;
    const R = v => Math.round(v);   // whole px: a re-measure with the same box keeps the scene (render keys on it)
    render.donePanel = r && r.height ? { x: R((r.left - view.left) / view.s), y: R((r.top - view.top) / view.s), w: R(r.width / view.s), h: R(r.height / view.s) } : null;
  }
  function placeBubble() {
    const B = world.layout && world.layout.bubble;
    if (!B) return;
    const r = { x: view.left + B.x * view.s, y: view.top + B.y * view.s, w: B.w * view.s, h: B.h * view.s };
    DK.UI.placeBubble(r);
  }
  function updateHudStarTarget() {
    const p = DK.UI.hudStarPoint();
    if (p.x || p.y) render.hudStar = { x: (p.x - view.left) / view.s, y: (p.y - view.top) / view.s };
  }
  let resizeT = 0;
  function onResize() { clearTimeout(resizeT); resizeT = setTimeout(applySize, 120); }

  /* ---------- voice ---------- */
  const voiceOn = () => S.voice && !FLAGS.novoice && speed <= 1.01 && !FLAGS.mute;
  function speak(text, opt) {
    if (!text) return null;
    lastSpoken = text;
    return DK.Voice ? DK.Voice.say(text, opt || {}) : null;
  }
  const speaking = () => !!(DK.Voice && DK.Voice.isSpeaking && DK.Voice.isSpeaking());
  function applyAudio() {
    const vol = S.volume == null ? 1 : S.volume;
    DK.Audio.setOptions({ sfx: S.sfx, music: S.music, muted: FLAGS.mute, volume: vol });
    if (DK.Voice) { DK.Voice.setLang(curLang()); DK.Voice.setEnabled(voiceOn()); if (DK.Voice.setVolume) DK.Voice.setVolume(vol); if (DK.Voice.setSpeed) DK.Voice.setSpeed(speed); }
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
    // the prompt ended (spoken, cut or dropped): lift its guard right away — a Mimi tap may repeat it now
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
    if (!cutOk && DK.Voice && DK.Voice.dropTagged) DK.Voice.dropTagged('right');
    speak(txt, { interrupt: cutOk, tag: 'right' });
  }

  /* ---------- game flow ---------- */
  function startGame() {
    DK.Audio.unlock();
    world.setAge(curAge()); world.setLang(curLang());
    world.lastTopics = DK.Storage.getJSON('lastTopics', null);   // chapters rotate between sessions
    world.newSession({ lastTopics: world.lastTopics });
    if (world.levels) DK.Storage.setJSON('lastTopics', world.levels);
    if (FLAGS.level != null) world.startLevel(Math.max(0, Math.min(3, FLAGS.level | 0)));
    countUntil = 0; promptUntil = 0; promptQueued = false; lineUntil = 0; guarded.length = 0; pendingPrompt = null; promptSpeaking = null;
    shownStars = 0; DK.UI.setStars(0); lastAsk = null; lastPromptText = ''; sessionPennants = []; lastRight = null; unfoldSaid = -1; wipeN = 0;
    if (DK.Voice && DK.Voice.resetPump) DK.Voice.resetPump();
    blockInput();
    render.clearGallery();
    if (weather.setParty) weather.setParty(false);
    mode = 'play';
    $('stage').classList.remove('talking');
    DK.UI.only(); DK.UI.show('hud'); DK.UI.say('');
    DK.Audio.setMood(world.weather || 0); DK.Audio.startMusic(); DK.Audio.setFanfare(false);
    applyAudio();
    stats.sessions++;
    requestAnimationFrame(() => { updateHudStarTarget(); applySize(); });
  }
  function goTitle() {
    mode = 'title';
    $('stage').classList.remove('talking');
    if (DK.Voice) DK.Voice.stop();
    if (inputCancel && inputCancel.cancel) inputCancel.cancel();
    if (world.cancelDrag) world.cancelDrag();
    DK.Audio.stopMusic(); DK.Audio.setFanfare(false);
    DK.UI.only('scrTitle'); DK.UI.show('hud', false); DK.UI.say('');
    DK.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
    weather.setWeather(0, {}); if (weather.setParty) weather.setParty(false);
    requestAnimationFrame(measureTitle);
  }
  function pause() {
    if (mode !== 'play' && mode !== 'talk') return;
    mode = 'paused';
    countUntil = 0; promptQueued = false; lineUntil = 0; guarded.length = 0;   // Voice.stop below ends every line: no guard outlives it
    if (inputCancel && inputCancel.cancel) inputCancel.cancel();
    if (world.cancelDrag) world.cancelDrag();
    if (DK.Voice) { DK.Voice.stop(); if (DK.Voice.stopListening) DK.Voice.stopListening(); }
    DK.Audio.stopMusic();
    DK.UI.only('scrPause');
  }
  function resume() {
    if (mode !== 'paused') return;
    mode = world.state === 'talk' ? 'talk' : 'play';
    blockInput();
    idleSaid = 0;   // a returning child gets the nudges again before the next auto-pause
    if (world.resetNudges) world.resetNudges();
    DK.UI.only(mode === 'talk' ? 'scrTalk' : undefined);
    DK.Audio.startMusic();
    // say the question again so a returning child knows what to do (VOICE §3: pause → resume)
    if (mode === 'talk' && world.talk && !world.talkAnswered) speak(T(world.talk.promptKey, world.talk.params || {}), { priority: true });
    else if (world.state === 'intro') speak(T('ui.chapter', { n: world.level + 1 }) + '. ' + T('topic.' + world.topic), { priority: true });
    else if (world.state === 'round' && world.phase === 'pump' && world.interactive) { const t = T('pumpAsk'); DK.UI.say(t); speak(t, { priority: true, tag: 'pumpAsk' }); }
    else if (world.interactive) setTimeout(repeatPrompt, 300);
    else if (world.state === 'round' && lastRight && lastRight.text && (world.phase === 'aim')) { DK.UI.say(lastRight.text); speak(lastRight.text, { priority: true, tag: 'right' }); }
  }

  let lastPromptText = '', lastAsk = null;
  function currentPrompt() {   // prompts have several wordings: repeat the one Mimi said, word for word
    if (lastPromptText) return lastPromptText;
    const p = world.prompt ? world.prompt() : null;
    return p ? askText(p) : '';
  }
  function handleEvents() {
    const evs = world.drainEvents();
    for (const e of evs) {
      eventLog.push({ type: e.type, id: e.id, t: world.time });
      if (eventLog.length > 300) eventLog.shift();
      if (bot && bot.onEvent) bot.onEvent(e);
      onEvent(e);
    }
  }
  const matOf = id => (world.matById ? world.matById(id) : null);
  /** the event + what main knows (VOICE §1): the chapter topic, the round's prompt key / params / rule / mode, the mat's thing,
   *  the launch (countSeq: the needed number is launch + 1 — the world's rule.value is k) */
  function ev2(e) {
    const c = world.cur, m = matOf(e.id), A = lastAsk || {};
    const o = Object.assign({ topic: world.topic, promptKey: c ? c.promptKey : A.promptKey, params: c ? c.params : A.params,
      rule: c ? c.rule : A.rule, mode: c ? c.mode : A.mode, launch: world.launch, row: world.launch }, e, { thing: e.thing || (m && m.thing) || undefined });
    if (o.mode === 'countSeq' && o.need == null && e.type === 'wrong') o.need = (e.want && e.want.count) || (o.launch != null ? o.launch + 1 : undefined);
    return o;
  }
  function line(fn, e, fallbackKey) {
    const I = DK.I18N;
    if (I && typeof I[fn] === 'function') { try { const t = I[fn](curLang(), e); if (t) return t; } catch (err) { /* fall back */ } }
    return fallbackKey ? T(fallbackKey) : '';
  }
  function mimiMood(m, t) { if (world.mimi && world.interactive) { world.mimi.mood = m; world.mimi.moodT = t; } }
  function askText(e) {
    const I = DK.I18N;
    if (I && I.ask) { try { return I.ask(curLang(), e.promptKey, Object.assign({ child: S.name || '' }, e.params || {}), { first: !!e.first }); } catch (err) { /* fall back */ } }
    return T(e.promptKey, e.params || {});
  }
  function flyStars(n, x, y) {
    for (let i = 0; i < n; i++) {
      render.burst('star', x + (i - (n - 1) / 2) * 60, y, { delay: 0.1 + i * 0.2, onDone: () => { shownStars++; DK.UI.setStars(shownStars, true); DK.Audio.play('star', { i }); } });
    }
  }
  const quiet = () => !speaking() && canInterrupt();
  const isCountSel = () => !!(world.cur && world.cur.mode === 'countSel');

  function onEvent(e) {
    switch (e.type) {
      case 'level': {
        const wi = (e.weather != null ? e.weather : e.level) % 4;
        weather.setWeather(wi, {});
        DK.Audio.setMood(wi); DK.Audio.play('chapter');
        DK.UI.setDots(world.roundsPerLevel || 4, 0);
        speak(T('ui.chapter', { n: e.level + 1 }) + '. ' + T('topic.' + e.topic), { interrupt: true, tag: 'flavour' });
        speak(T('weather.' + wi), { tag: 'flavour' });   // queued after the chapter name ("A sunny day at camp!"); dropped by the ask
        DK.UI.say('');   // the chapter banner shows the topic
        render.prewarm(world.layout, wi);
        break;
      }
      case 'round': {
        DK.UI.fadeBubble(false); DK.Audio.setFanfare(false);
        stats.rounds++; idleSaid = 0; lastAsk = null; lastPromptText = ''; lastRight = null; roundMissed = false;
        DK.UI.setDots(world.roundsPerLevel || 4, e.round % (world.roundsPerLevel || 4));
        DK.UI.say(T('unfold'));   // shown, not spoken: the question follows in a moment
        weather.resize(view.W, view.H, world.layout);
        render.prewarmRound(world);
        break;
      }
      case 'unfold':
        stats.unfolds++; DK.Audio.play('unfold');
        // rarely: "Look, picnic mats!" — once per chapter, on the first mat of round 0, only when nothing speaks
        if (e.launch === 0 && e.i === 0 && world.round === 0 && unfoldSaid !== world.level && quiet() && Math.random() < 0.4) { unfoldSaid = world.level; speak(T('unfold'), { tag: 'flavour' }); }
        break;
      case 'ask': {
        lastAsk = e; idleSaid = 0; DK.UI.fadeBubble(false); hintBySay = false; promptQueued = false;
        if (DK.Voice && DK.Voice.dropTagged) DK.Voice.dropTagged(['flavour', 'right', 'pennant']);   // the question goes first
        const txt = askText(Object.assign({}, e, { first: !!e.first }));
        lastPromptText = txt;
        // the chapter / weather line may still be talking: the question cuts it — never a right / wrong / count line
        const flav = DK.Voice && DK.Voice.currentTag && DK.Voice.currentTag() === 'flavour';
        DK.UI.say(txt); speakPrompt(txt, { priority: true, interrupt: !!flav });
        break;
      }
      case 'next': {   // the reminder before launch j ≥ 1: it is the question for that launch (protected like a prompt)
        idleSaid = 0; DK.UI.fadeBubble(false); hintBySay = false;
        if (DK.Voice && DK.Voice.dropTagged) DK.Voice.dropTagged(['pennant', 'flavour']);
        const txt = line('sayNext', ev2(e), 'next.any');
        lastPromptText = txt; if (!lastAsk) lastAsk = e;
        DK.UI.say(txt); speakPrompt(txt, { priority: true });
        break;
      }
      case 'right': {
        stats.correct++;
        const th = e.thing || {};
        DK.Audio.play('right');
        render.burst('sparkles', e.x, e.y - (world.layout ? world.layout.itemH * 0.5 : 40), { n: 12, color: th.color });
        if (e.mode === 'countSeq' || (world.cur && world.cur.mode === 'countSeq')) render.burst('count', e.x, e.y - (world.layout ? world.layout.itemH * 1.25 : 110), { n: e.count || (e.launch + 1) });
        // QA fix C3: the right line only NAMES the thing ("A purple mug!"); the pump glows and pumpAsk says "stomp" if needed
        const txt = line('sayRight', Object.assign(ev2(e), { pump: false }), 'praise');
        lastRight = { text: txt };
        // QA fix C4: the right tap makes a wrong / hint line moot — the name line may cut it
        const curTag = DK.Voice && DK.Voice.currentTag ? DK.Voice.currentTag() : null;
        if (curTag === 'wrong' || curTag === 'hint') { lineUntil = 0; guarded.length = 0; }
        // the child already answered: a question that has not started yet is no longer needed
        if (pendingPrompt && DK.Voice && DK.Voice.dropTagged) { DK.Voice.dropTagged('prompt'); pendingPrompt = null; promptUntil = Math.min(promptUntil, performance.now()); }
        speakRight(txt);
        DK.UI.say(txt);
        break;
      }
      case 'aim': DK.Audio.play('aim'); break;
      case 'pumpAsk': {
        const p0 = ++pumpSeen, t = T('pumpAsk');
        if (!lastRight) DK.UI.say(t);
        // spoken only if nothing speaks 1.2 s later and no stomp came yet (droppable)
        setTimeout(() => { if (pumpSeen === p0 && mode === 'play' && world.phase === 'pump' && !speaking()) { speak(t, { tag: 'pumpAsk' }); DK.UI.say(t); } }, 1200 / Math.max(1, speed));
        break;
      }
      case 'pump': {
        stats.pumps++; pumpSeen++;
        if (e.auto) stats.autoPumps++;
        DK.Audio.play('pump', { n: e.n });
        render.burst('count', e.x, e.y - (world.layout ? world.layout.mimiH : 180) - 40, { n: e.n, size: 70, disc: true });   // above Mimi's hat, on a cream disc
        // QA fix C3: a name line that has not even started would only be said after the lift-off
        if (e.n === 1 && DK.Voice && DK.Voice.dropTagged) DK.Voice.dropTagged(['right']);
        if (DK.Voice && DK.Voice.sayPump) DK.Voice.sayPump(e.n, { lang: curLang(), auto: !!e.auto });
        else speak(String(e.n), { priority: true, tag: 'pump' });
        if (DK.I18N && DK.I18N.sayPump) DK.UI.say(DK.I18N.sayPump(curLang(), e.n));
        break;
      }
      case 'pumpAuto': break;   // "I'll help!" is the head of Mimi's own first pump line (Voice.sayPump, auto)
      case 'launch':
        stats.launches++; pumpSeen++;
        DK.Audio.play('launch');
        if (DK.Voice && DK.Voice.resetPump) DK.Voice.resetPump();
        break;
      case 'whoosh': break;
      case 'chute':
        stats.chutes++; DK.Audio.play('chute');
        if (world.round === 0 && world.launch === 0 && quiet() && Math.random() < 0.5) speak(T('chute'), { tag: 'chute' });
        break;
      case 'land':
        stats.lands++; DK.Audio.play('land');
        if (landSaidRound !== world.round + world.level * 10 && !isCountSel() && quiet() && Math.random() < 0.3) { landSaidRound = world.round + world.level * 10; speak(T('land'), { tag: 'land' }); }
        break;
      case 'splash': DK.Audio.play('splash'); break;
      case 'fold': DK.Audio.play('fold'); break;
      case 'count': {
        stats.counts++;
        DK.Audio.play('pip', { i: e.i });
        if (e.camp) { render.burst('count', e.x + 30, e.y, { n: e.i, size: 56 }); break; }
        // the collect count of a countSel sign: ONE count line ("One, two, three, four! Four pinecones!") on the first pip
        render.burst('count', e.x, e.y - (world.layout ? world.layout.itemH * 1.15 : 100), { n: e.i });
        if (e.i === 1) { const n = e.n || ((matOf(e.id) || {}).thing || {}).n || 1; const t = DK.I18N.sayCountUp ? DK.I18N.sayCountUp(curLang(), n, 'pinecones') : T('praise'); if (DK.Voice && DK.Voice.dropTagged) DK.Voice.dropTagged(['right']); speakCount(t, 400); DK.UI.say(t); }
        break;
      }
      case 'homeBadge': DK.Audio.play('badge'); break;
      case 'pennant': {
        stats.pennants++;
        if (e.thing) sessionPennants.push(e.thing);
        DK.Audio.play('pennant', { i: e.slot || 0 });
        render.burst('sparkles', e.x + 24, e.y + 16, { n: 8, color: e.thing && e.thing.color });
        // the launch's praise — skipped in countSel (the count run was the praise) and when a question is already waiting
        // QA fix C5: and while another launch of the round follows (its mats unfold, its `next` reminder is due)
        if (!isCountSel() && !pendingPrompt && performance.now() - lastPraise > 1200 && !(world.cur && world.launch < world.cur.k)) {
          lastPraise = performance.now();
          const t = line('sayPennant', ev2(e), 'pennant.any');
          if (DK.Voice && DK.Voice.dropTagged) DK.Voice.dropTagged('right');
          speak(t, { tag: 'pennant' }); DK.UI.say(t);
        }
        break;
      }
      case 'hopBack': stats.hopBacks++; DK.Audio.play('hopBack', { n: e.n }); break;
      case 'camp': {
        stats.camps++;
        DK.Audio.setFanfare(true); setTimeout(() => DK.Audio.setFanfare(false), 2200 / Math.max(1, speed));
        const n = e.n || (world.pennants || []).length;
        // QA fix C6: just the count ("One, two, three! Three flags!") — it fits inside the camp
        const t = DK.I18N.sayCountUp ? DK.I18N.sayCountUp(curLang(), n, 'flags') : T('camp');
        if (DK.Voice && DK.Voice.dropTagged) DK.Voice.dropTagged(['pennant', 'land', 'flavour']);
        speakCount(t, 200); DK.UI.say(t);
        break;
      }
      case 'fountain':
        stats.fountains++; DK.Audio.play('fountain');
        if (weather.burst) weather.burst(e.x, e.y - 120, { kind: 'rainbow', n: 12 });
        break;
      case 'roundDone': {
        DK.UI.setDots(world.roundsPerLevel || 4, ((e.round != null ? e.round : world.round) % (world.roundsPerLevel || 4)) + 1);
        flyStars(e.stars || 1, e.x, e.y);   // the round's stars fly from above Mimi's head to the HUD
        break;   // no line: the camp count was the praise
      }
      case 'wipe': {
        stats.wipes++; wipeN++;
        DK.Audio.play('wipe');
        if (weather.wipeParticles) weather.wipeParticles(e.dir || { x: 1, y: 0 });
        DK.UI.fadeBubble(true);
        // rarely: chapter 1 round 0 names the sweep; later ≤ 1 in 4 rounds; only when nothing speaks
        const first = world.level === 0 && wipeN === 1;
        if ((first || Math.random() < 0.25) && quiet()) speak(T('wipe'), { tag: 'wipe' });
        break;
      }
      case 'wrong': {
        stats.wrong++;
        DK.Audio.play('wrong');
        roundMissed = true;
        const now = performance.now();
        if (now - lastWrongSay > 1500) {
          lastWrongSay = now;
          const ee = ev2(e);
          // the miss that brings the hint: ONE short line that also points at the shiny mat
          const wt = e.hint ? line('sayWrongHint', ee, 'hint') : line('sayWrong', ee, 'hint');
          if (e.hint) hintBySay = true;
          if (DK.Voice && DK.Voice.dropTagged) DK.Voice.dropTagged(['wrong', 'right']);
          speakWrong(wt); DK.UI.say(wt);
        }
        break;
      }
      case 'squish': stats.squish++; DK.Audio.play('squish'); break;
      case 'soft': stats.soft++; DK.Audio.play('soft'); break;
      case 'hint': {
        stats.hints++;
        DK.Audio.play('hint');
        // the pointer line was already said with the miss; else (no-progress presses) a priority line
        if (!e.idle && !hintBySay) speak(T('hint'), { priority: true, tag: 'hint' });
        hintBySay = false;
        break;
      }
      case 'assistArmed': DK.Audio.play('hint'); break;
      case 'assist': stats.assists++; break;
      case 'idle':
        if (++idleSaid <= 4) {
          if (world.phase === 'pump') speak(T('pumpAsk'), { tag: 'idle' });
          else speak(T('idle') + ' ' + currentPrompt(), { tag: 'idle' });
        } else if (idleSaid >= 5 && !bot) pause();   // ≈ 2 min without a touch: nobody is playing — pause
        break;
      case 'pokeMimi': {
        stats.pokes++;
        DK.Audio.play('giggle');
        // only a question that can still be answered is repeated; otherwise Mimi just giggles — never over another line
        const open = !e.busy && !!e.promptKey && world.state === 'round' && world.phase === 'play' && world.launch < (world.cur ? world.cur.k : 0);
        if (!open || !lastAsk) { if (quiet() && performance.now() - lastTapSay > 2000) { lastTapSay = performance.now(); speak(T('poke'), { tag: 'poke' }); } break; }
        askAgain(true);
        break;
      }
      case 'gust': stats.gusts++; DK.Audio.play('gust'); break;
      case 'marmot': case 'goat': case 'bird': {
        stats.surprises++;
        DK.Audio.play(e.type === 'marmot' ? 'whistle' : e.type === 'goat' ? 'bleat' : 'chirp');
        if (canInterrupt()) speak(T('surprise.' + e.type), { tag: 'surprise' });   // queued, never over a protected prompt
        break;
      }
      case 'marmotTap': case 'goatTap': case 'birdTap': {
        const k = e.type.replace('Tap', '');
        stats[k + 'Taps']++;
        DK.Audio.play(k === 'marmot' ? 'whistle' : k === 'goat' ? 'bleat' : 'chirp');
        render.burst('sparkles', e.x, e.y, { n: 8 });
        const now = performance.now();
        if (now - lastTapSay > 2000 && quiet()) { lastTapSay = now; speak(T(k + '.tap'), { tag: 'tap' }); }
        break;
      }
      case 'talk': DK.UI.fadeBubble(false); DK.UI.say(''); DK.Audio.setFanfare(false); DK.UI.setDots(world.roundsPerLevel || 4, world.roundsPerLevel || 4); openTalk(e.talk || world.talk); break;
      case 'talkAsk': {   // no answer yet: ask again, and from the 2nd re-ask glow the right answer
        const tk = e.talk || world.talk;
        if (tk && e.n <= 3) speak(T(tk.promptKey, tk.params || {}), { priority: true, interrupt: true });
        if (tk && (e.n >= 2 || e.glowAnswer)) DK.UI.glowTalk(tk.answerId || tk.answer);
        break;
      }
      case 'talkResult': {
        stats.talks++; if (e.correct) stats.talkRight++;
        DK.UI.markTalk(e.choiceId, e.answerId);
        const tk = world.talk, ans = (tk && tk.choices.find(c => c.id === e.answerId)) || {};
        const kind = () => (DK.I18N.talkWrong ? DK.I18N.talkWrong(curLang(), ans.thing || ans, tk) : T('talk.wrong.any'));
        if (e.auto) { speak(kind(), { interrupt: true }); break; }
        if (e.correct) {
          DK.Audio.play('talkRight');
          render.burst('star', view.W / 2, view.H / 2, { onDone: () => { shownStars++; DK.UI.setStars(shownStars, true); DK.Audio.play('star'); } });
          speak(T('talk.right'), { interrupt: true });
        } else {
          DK.Audio.play('gentle');
          speak(kind(), { interrupt: true });
        }
        break;
      }
      case 'levelDone':
        DK.Audio.play('level'); DK.UI.say('');
        if (mode === 'talk') { mode = 'play'; DK.UI.only(); }
        $('stage').classList.remove('talking');
        speak(T('great'));
        break;
      case 'sessionDone': {
        DK.Audio.play('party'); DK.Audio.setFanfare(false);
        if (weather.setParty) weather.setParty(true);
        render.setGallery(sessionPennants.slice());
        render.burst('confetti', 0, 0);
        progress.totalStars += e.stars || 0; progress.sessions++;
        DK.Storage.setJSON('progress', progress);
        shownStars = e.stars || shownStars; DK.UI.setStars(shownStars);
        $('doneStars').textContent = e.stars || 0;
        $('doneTitle').textContent = T('session.done', { stars: e.stars || 0 });
        speak(T('party'), { interrupt: true });
        speak(T('session.done', { stars: e.stars || 0 }));
        mode = 'done';
        DK.UI.only('scrDone'); DK.UI.show('hud', false); DK.UI.say('');
        requestAnimationFrame(measureDonePanel);
        // the panel pops in (CSS animation, the fonts settle): measure again once it stands still, so the golden mats and the
        // garland keep clear of its real box (visual QA P3-6)
        [350, 900].forEach(ms => setTimeout(() => { if (mode === 'done') measureDonePanel(); }, ms));
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
    const canMic = S.mic && DK.Voice && DK.Voice.canListen && DK.Voice.canListen() && !FLAGS.bot;
    DK.UI.openTalk(talk, curLang(), id => { DK.Audio.play('click'); world.talkAnswer(id); }, canMic, curAge());
    const q = T(talk.promptKey, talk.params || {});
    speakPrompt(T('talk.intro') + ' ' + q, { priority: true });   // queued after the round's praise, not cutting it off
  }
  function listen() {
    const talk = world.talk;
    if (!talk || world.state !== 'talk' || !DK.Voice || !DK.Voice.canListen()) return;
    if (DK.Voice.stop) DK.Voice.stop();
    DK.Audio.play('listen');
    DK.UI.setListening(true, T('ui.listening'));
    const choices = talk.choices.map(c => ({ id: c.id, words: DK.I18N.choiceWords ? DK.I18N.choiceWords(curLang(), c.thing || c) : [] }));
    DK.Voice.listen({ lang: curLang(), choices, timeoutMs: 6000 }).then(res => {
      DK.UI.setListening(false, T('ui.tapOrSay'));
      if (world.state !== 'talk') return;
      if (res && res.id != null) world.talkAnswer(res.id);
      else if (res && res.reason === 'not-allowed') { $('btnMic').classList.add('hidden'); speak(T('ui.micDenied')); }
      else speak(T('ui.tapOrSay'));
    }).catch(() => DK.UI.setListening(false, T('ui.tapOrSay')));
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
    bubbleOverArt();
    weather.update(dt * Math.min(speed, 4), {});
    const sp = speaking();
    DK.Audio.duck(sp);
    if (DK.Audio.tick) DK.Audio.tick(dt);
    render.draw(world, weather, { dt: dt * Math.min(speed, 4), lang: curLang(), title: mode === 'title' || mode === 'loading', speaking: sp, done: mode === 'done', debug: FLAGS.debug });
    adapt(raw);
  }
  /** safety net: the DOM speech bubble steps back while the rocket (+ its canopy) flies under it, or Mimi reaches under it */
  let bubbleUnder = false;
  function bubbleOverArt() {
    let on = false;
    if (mode === 'play' && world.layout && world.layout.bubble && world.state === 'round') {
      const B = world.layout.bubble;
      const bb = $('bubble').offsetHeight ? Math.min(B.h, $('bubble').offsetHeight / view.s) : B.h;   // the bubble's real (shrunk) height
      const r = world.rocket;
      if (r && (r.state === 'boost' || r.state === 'coast' || r.state === 'chute')) {
        const top = r.top != null ? r.top : r.noseY - 120, w = 0.5 * 240 * (r.s || 0.53) * Math.max(0.4, r.chute || 0);
        on = top < B.y + bb && r.noseX + w + 30 > B.x && r.noseX - w - 30 < B.x + B.w;
      }
      const n = world.mimi;
      if (!on && n) {
        const k = (n.h || world.layout.mimiH) / 300, P = DK.MIMI_POINTS || { feet: [150, 290], box: [40, 28, 284, 292] };
        const x0 = n.x - (P.feet[0] - P.box[0]) * k, x1 = n.x + (P.box[2] - P.feet[0]) * k, y0 = n.y - (P.feet[1] - P.box[1]) * k * Math.max(1, n.sy || 1);
        on = y0 < B.y + bb && x1 > B.x && x0 < B.x + B.w && n.y > B.y;
      }
    }
    if (on !== bubbleUnder) { bubbleUnder = on; DK.UI.bubbleUnder(on); }
    // the HUD pills step back too while the canopy floats under them (the flight always stays visible)
    let hu = false;
    const r = world.rocket, Hd = (world.hudKeep && world.hudKeep[0]) || (world.layout && world.layout.hud);
    if (mode === 'play' && Hd && r && (r.state === 'boost' || r.state === 'coast' || r.state === 'chute')) {
      const top = r.top != null ? r.top : r.noseY - 120, w = 0.5 * 240 * (r.s || 0.53) * Math.max(0.4, r.chute || 0);
      hu = top < Hd.y + Hd.h + 10 && r.noseX + w + 20 > Hd.x && r.noseX - w - 20 < Hd.x + Hd.w;
    }
    if (hu !== hudUnder) { hudUnder = hu; $('hud').classList.toggle('under', hu); }
  }
  let hudUnder = false;
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
    // only while the question can still be answered (never during the flight / the camp: that would cut a count)
    if ((!world.interactive && !force) || !lastAsk || world.phase !== 'play') return;
    DK.Audio.play('click');
    mimiMood('talk', 1.0);
    const cp = currentPrompt(); promptUntil = 0; DK.UI.say(cp); speakPrompt(cp, { interrupt: true });
  }
  /** a Mimi / speech-bubble tap while the question can be answered (VOICE §3 rule 4): never cut a protected prompt, wrong,
   *  count or pump line — queue the question ONCE to follow it; never restart the question while Mimi is still saying it */
  function askAgain(force) {
    if ((!world.interactive && !force) || !lastAsk || world.phase !== 'play') return;
    if (speaking() && lastSpoken === lastPromptText) return;
    if (guarded.some(g => g.kind === 'count')) return;   // count numbers still to come: never queue the question behind them
    if (DK.Voice && DK.Voice.currentTag && DK.Voice.currentTag() === 'pump') return;
    if (!canInterrupt()) {
      if (pendingPrompt || promptQueued) return;   // the question is still to come
      const now = performance.now();
      if (now - promptStart < 3000) return;
      promptQueued = true; mimiMood('talk', 1.0);
      const cp = currentPrompt(); DK.UI.say(cp); speakPrompt(cp, { priority: true });
      return;
    }
    const since = performance.now() - promptStart;
    const stuck = pendingPrompt && since > 6000;   // the prompt never started (no voice / dropped): don't wait forever
    if (since > 3000 && (!pendingPrompt || stuck)) repeatPrompt(force);
  }
  function bubbleTap() { askAgain(); }

  function bindUI() {
    DK.Input.kidProof();
    DK.UI.guardScreenClicks();   // a finger held on the canvas never clicks a screen that opens under it
    // Input passes two NUMBERS in logical px (never a point object) — VOICE §5; in the pump phase every finger is a stomp
    inputCancel = DK.Input.attach($('game'), {
      toLogical,
      down: (x, y) => { if (mode === 'play' && !bot && performance.now() >= inputBlockUntil) world.pointerDown(x, y); },   // judged at once
      move: (x, y) => { if (mode === 'play' && !bot) world.pointerMove(x, y); },
      up: (x, y) => { if (mode === 'play' && !bot) world.pointerUp(x, y); },
      cancel: () => { if (world.cancelDrag) world.cancelDrag(); },
      rapidTaps: () => mode === 'play' && world.state === 'round' && world.phase === 'pump'
    });
    const unlock = () => { DK.Audio.unlock(); if (DK.Voice) DK.Voice.unlock(); };
    ['touchend', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { capture: true, passive: true }));

    $('btnPlay').addEventListener('click', () => { DK.Audio.play('click'); startGame(); });
    $('bubble').addEventListener('click', bubbleTap);
    $('btnPause').addEventListener('click', () => { DK.Audio.play('click'); pause(); });
    $('btnResume').addEventListener('click', () => { DK.Audio.play('click'); resume(); });
    $('btnHome').addEventListener('click', () => { DK.Audio.play('click'); goTitle(); });
    $('btnAgain').addEventListener('click', () => { DK.Audio.play('click'); startGame(); });
    $('btnDoneHome').addEventListener('click', () => { DK.Audio.play('click'); goTitle(); });
    $('btnMic').addEventListener('click', listen);
    // volume: settings slider + big − / + in the pause menu
    $('optVolume').addEventListener('input', () => { S.volume = +$('optVolume').value / 100; saveSettings(); applyAudio(); });
    $('optVolume').addEventListener('change', () => DK.Audio.play('land'));
    const vstep = d => { S.volume = Math.max(0, Math.min(1, Math.round(((S.volume == null ? 1 : S.volume) + d) * 20) / 20)); saveSettings(); applyAudio(); DK.Audio.play('land'); };
    $('btnVolDown').addEventListener('click', () => vstep(-0.1));
    $('btnVolUp').addEventListener('click', () => vstep(0.1));
    document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => {
      S.lang = b.dataset.lang; langOverride = null; saveSettings(); DK.UI.applyLang(curLang()); applyAudio(); DK.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
      updateVoiceInfo();
      DK.Audio.play('click');
      if (mode === 'title') speak(T('ui.welcome'), { interrupt: true });
      requestAnimationFrame(measureTitle);
    }));
    // parent gate: hold the gear for 2 s
    const gear = $('btnParents');
    DK.Input.holdButton(gear, 2000, () => { gear.style.setProperty('--p', 0); openSettings(); },
      p => { gear.style.setProperty('--p', p); gear.classList.toggle('holding', p > 0); });
    gear.addEventListener('click', () => { gear.classList.add('tip'); setTimeout(() => gear.classList.remove('tip'), 1600); });
    DK.UI.bindSettings(S, k => {
      saveSettings();
      if (k === 'sfx' || k === 'music' || k === 'voice') applyAudio();
      if (k === 'age') { ageOverride = null; DK.UI.setTitleInfo(progress.totalStars, curAge(), curLang()); }
      if (k === 'name' && DK.I18N.setChild) DK.I18N.setChild(S.name);
    }, curAge);
    $('btnSettingsDone').addEventListener('click', () => { DK.Audio.play('click'); DK.UI.only('scrTitle'); DK.UI.setTitleInfo(progress.totalStars, curAge(), curLang()); });

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(applySize, 250));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (inputCancel && inputCancel.cancel) inputCancel.cancel(); if (world.cancelDrag) world.cancelDrag(); pause(); DK.Audio.suspend(); if (DK.Voice) DK.Voice.stop(); }
      else DK.Audio.resume();
    });
    window.addEventListener('blur', () => { if (world && world.cancelDrag) world.cancelDrag(); });
  }
  function openSettings() {
    DK.Audio.play('click');
    DK.UI.refreshSettings();
    updateVoiceInfo();
    DK.UI.only('scrSettings');
  }
  function updateVoiceInfo() {
    if (!DK.Voice) return;
    const has = DK.Voice.hasVoice ? DK.Voice.hasVoice(curLang()) : false;
    const nm = DK.Voice.voiceName ? DK.Voice.voiceName(curLang()) : '';
    const mic = DK.Voice.canListen && DK.Voice.canListen();
    const v = has ? (curLang() === 'vi' ? 'Giọng đọc: ' : 'Voice: ') + (nm || '✓') : T('ui.voiceMissing');
    const m = mic ? '' : ' · ' + T('ui.micUnsupported');
    DK.UI.setVoiceInfo(v + m);
  }

  /* ---------- test hooks (DESIGN §5.5) — live getters via defineProperties (never Object.assign) ---------- */
  function hooks() {
    const circ = c => (c ? { x: view.left + c.x * view.s, y: view.top + c.y * view.s, r: (c.r || 0) * view.s, own: (c.own || c.r || 0) * view.s } : null);
    const box = b => (b ? { x: view.left + b.x * view.s, y: view.top + b.y * view.s, w: (b.w || 0) * view.s, h: (b.h || 0) * view.s,
      cx: view.left + (b.cx != null ? b.cx : b.x + b.w / 2) * view.s, cy: view.top + (b.cy != null ? b.cy : b.y + b.h / 2) * view.s } : null);
    const prev = DK.debug || {};
    DK.debug = prev;
    Object.defineProperties(prev, Object.getOwnPropertyDescriptors({
      get world() { return world; }, get weather() { return weather; }, get mode() { return mode; }, stats, events: eventLog,
      get bot() { return bot; },
      get voiceLog() { return (DK.Voice && DK.Voice.log) || []; },
      getState() {
        return { mode, state: world.state, phase: world.phase, level: world.level, topic: world.topic, round: world.round,
          stars: world.stars, misses: world.misses, interactive: world.interactive, launch: world.launch, k: world.cur ? world.cur.k : 0,
          mimi: world.mimi ? { state: world.mimi.state, frame: world.mimi.frame, x: world.mimi.x, y: world.mimi.y, onPump: world.mimi.onPump } : null,
          rocket: world.rocket ? { state: world.rocket.state, x: world.rocket.x, y: world.rocket.y, chute: world.rocket.chute } : null,
          mats: (world.mats || []).map(m => ({ id: m.id, launch: m.launch, state: m.state, target: m.target, visited: !!m.visited, kind: m.thing && m.thing.kind })),
          pennants: (world.pennants || []).length, surprise: world.surprise, weather: weather.ambient && weather.ambient.mood,
          W: view.W, H: view.H, ins: view.ins, settings: Object.assign({}, S), speed };
      },
      setSpeed(n) { speed = Math.max(0.1, +n || 1); applyAudio(); },
      startGame, goTitle,
      setBot(on, skill) { bot = on ? new DK.Bot(world, { skill: skill == null ? FLAGS.botSkill : skill, seed: 7 }) : null; },
      setAutoRestart(on) { autoRestart = !!on; },
      gotoLevel(i) { world.startLevel(i); },
      view: () => view, render: () => render,
      matScreen(id) { return circ(world.matHit ? world.matHit(id) : null); },
      mimiScreen() { return box(world.mimiHit ? world.mimiHit() : null); },
      pumpScreen() { return circ(world.pumpHit ? world.pumpHit() : null); },
      marmotScreen() { return circ(world.marmotHit ? world.marmotHit() : null); },
      goatScreen() { return circ(world.goatHit ? world.goatHit() : null); },
      birdScreen() { return circ(world.birdHit ? world.birdHit() : null); },
      answer() { return world.answer ? world.answer() : null; },
      targets() { return world.targets ? world.targets() : []; },
      toScreen(x, y) { return { x: view.left + x * view.s, y: view.top + y * view.s }; },
      audio: () => DK.Audio
    }));
  }

  /* ---------- boot ---------- */
  async function boot() {
    await DK.Storage.init();
    S = Object.assign({}, DEF, DK.Storage.getJSON('settings', {}));
    Object.assign(progress, DK.Storage.getJSON('progress', {}));
    DK.UI.applyLang(curLang());
    if (DK.I18N && DK.I18N.setChild) DK.I18N.setChild(S.name);
    if (DK.Voice) { DK.Voice.init({ lang: curLang(), enabled: voiceOn(), speed }); const prevStart = DK.Voice.onStart; DK.Voice.onStart = d => { onVoiceStart(d); if (prevStart) prevStart(d); }; }
    render = new DK.Renderer($('game')); DK.render = render;
    world = new DK.World({ seed: FLAGS.seed != null ? FLAGS.seed : (Date.now() & 0x7fffffff), age: curAge(), lang: curLang() });
    weather = new DK.Weather({ width: 960, height: 720, seed: 11 });
    weather.windSource = world;   // leaves / petals / rain slant with the same wind and gusts as the parachute
    hooks();
    bindUI();
    applySize();
    weather.setWeather(0, { instant: true });
    await DK.Assets.load();
    render.prewarm(world.layout, 0);
    applyAudio();
    if (FLAGS.bot) bot = new DK.Bot(world, { skill: FLAGS.botSkill, seed: 7 });
    DK.UI.only('scrTitle');
    DK.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
    mode = 'title';
    requestAnimationFrame(measureTitle);
    requestAnimationFrame(frame);
    if (FLAGS.autostart) startGame();
    if (DK.Voice && DK.Voice.onVoicesChanged) DK.Voice.onVoicesChanged(updateVoiceInfo);
  }
  window.addEventListener('DOMContentLoaded', () => boot().catch(e => { console.error(e); }));
})(window.DK = window.DK || {});
