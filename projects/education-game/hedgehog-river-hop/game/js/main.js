/* NH main (Nim's River Hop) — boots the game, sizes the canvas for any phone / tablet shape, runs the loop and turns world
 * events (stepping stones rise out of the brook, Nim hops row by row onto the stone asked for, a wrong stone wobbles, on the
 * far bank he curls up and rolls over a fruit that sticks on his spines, stars fly to the HUD, a seasonal swirl wipes the
 * crossing, a fish / frog / snowflakes drop by) into voice, sound, effects and UI, following the event → line table in
 * docs/VOICE.md §1.1 and the event list in docs/MECHANICS.md §6 (prompts protected, count lines never cut, praise
 * rate-limited, hints priority). Touches reach the world only through NH.Input (two numbers in logical px; HUD / speech
 * bubble / menus never reach the canvas). */
(function (NH) {
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
  const T1 = (key, p) => (NH.I18N ? NH.I18N.t(curLang(), key, Object.assign({ child: S.name || '' }, p || {})) : key);
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
  const saveSettings = () => NH.Storage.setJSON('settings', S);
  const progress = { totalStars: 0, sessions: 0 };

  let world, weather, render, bot = null, inputCancel = null;
  let mode = 'loading';            // loading | title | play | paused | talk | done
  let speed = FLAGS.speed, autoRestart = FLAGS.autorestart;
  let view = { W: 960, H: 720, s: 1, left: 0, top: 0, ins: { top: 0, right: 0, bottom: 0, left: 0 } };
  const stats = { sessions: 0, rounds: 0, correct: 0, wrong: 0, squish: 0, soft: 0, ahead: 0, hints: 0, assists: 0, counts: 0, rises: 0,
    hops: 0, lands: 0, crossings: 0, fruits: 0, wipes: 0, gusts: 0, talks: 0, talkRight: 0, surprises: 0, fishTaps: 0, frogTaps: 0,
    snowTaps: 0, pokes: 0, frames: 0, slowFrames: 0 };
  const eventLog = [];             // the last 300 world events (type + id), for the e2e tests
  let promptUntil = 0, lastWrongSay = -1e9, idleSaid = 0, shownStars = 0, lastPraise = -1e9, lastTapSay = -1e9;
  let sessionFruits = [], riseSaid = -1, lastAhead = -1e9, wipeN = 0;
  let inputBlockUntil = 0;         // canvas presses right after Resume / Play / Play again are ignored (a double tap falls through)
  let lastRight = null;            // the right answer's line: re-said (short) when a pause cut it while Nim hops
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
    world.setViewport(view.W, view.H, view.ins);    // river, banks, rows re-laid; stones glide to their new homes, Nim snaps
    weather.resize(view.W, view.H, world.layout);
    placeBubble();
    updateHudStarTarget();
    if (mode === 'done') requestAnimationFrame(measureDonePanel);
    requestAnimationFrame(measureTitle);
  }
  /** the DOM title (logo, tagline, ▶, star line) in logical px: the title's stepping stones keep clear of it */
  function measureTitle() {
    const out = [];
    for (const sel of ['.logo', '#tagline', '#btnPlay', '.title-info']) {
      const el = document.querySelector(sel), r = el && el.getBoundingClientRect();
      if (r && r.width > 0) out.push({ x: (r.left - view.left) / view.s - 12, y: (r.top - view.top) / view.s - 12, w: r.width / view.s + 24, h: r.height / view.s + 24 });
    }
    render.titleKeep = out.map(k => ({ x: Math.round(k.x), y: Math.round(k.y), w: Math.round(k.w), h: Math.round(k.h) }));
  }
  /** the celebration panel in logical px (render keeps the golden stones in view) */
  function measureDonePanel() {
    const p = document.querySelector('#scrDone .done-panel');
    const r = p && mode === 'done' ? p.getBoundingClientRect() : null;
    render.donePanel = r && r.height ? { x: (r.left - view.left) / view.s, y: (r.top - view.top) / view.s, w: r.width / view.s, h: r.height / view.s } : null;
  }
  function placeBubble() {
    const B = world.layout && world.layout.bubble;
    if (!B) return;
    const r = { x: view.left + B.x * view.s, y: view.top + B.y * view.s, w: B.w * view.s, h: B.h * view.s };
    NH.UI.placeBubble(r);
  }
  function updateHudStarTarget() {
    const p = NH.UI.hudStarPoint();
    if (p.x || p.y) render.hudStar = { x: (p.x - view.left) / view.s, y: (p.y - view.top) / view.s };
  }
  let resizeT = 0;
  function onResize() { clearTimeout(resizeT); resizeT = setTimeout(applySize, 120); }

  /* ---------- voice ---------- */
  const voiceOn = () => S.voice && !FLAGS.novoice && speed <= 1.01 && !FLAGS.mute;
  function speak(text, opt) {
    if (!text) return null;
    lastSpoken = text;
    return NH.Voice ? NH.Voice.say(text, opt || {}) : null;
  }
  const speaking = () => !!(NH.Voice && NH.Voice.isSpeaking && NH.Voice.isSpeaking());
  function applyAudio() {
    const vol = S.volume == null ? 1 : S.volume;
    NH.Audio.setOptions({ sfx: S.sfx, music: S.music, muted: FLAGS.mute, volume: vol });
    if (NH.Voice) { NH.Voice.setLang(curLang()); NH.Voice.setEnabled(voiceOn()); if (NH.Voice.setVolume) NH.Voice.setVolume(vol); if (NH.Voice.setSpeed) NH.Voice.setSpeed(speed); }
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
    // the prompt ended (spoken, cut or dropped): lift its guard right away — a Nim tap may repeat it now
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
    if (!cutOk && NH.Voice && NH.Voice.dropTagged) NH.Voice.dropTagged('right');
    speak(txt, { interrupt: cutOk, tag: 'right' });
  }

  /* ---------- game flow ---------- */
  function startGame() {
    NH.Audio.unlock();
    world.setAge(curAge()); world.setLang(curLang());
    world.lastTopics = NH.Storage.getJSON('lastTopics', null);   // chapters rotate between sessions
    world.newSession({ lastTopics: world.lastTopics });
    if (world.levels) NH.Storage.setJSON('lastTopics', world.levels);
    if (FLAGS.level != null) world.startLevel(Math.max(0, Math.min(3, FLAGS.level | 0)));
    countUntil = 0; promptUntil = 0; promptQueued = false; lineUntil = 0; guarded.length = 0; pendingPrompt = null; promptSpeaking = null;
    shownStars = 0; NH.UI.setStars(0); lastAsk = null; lastPromptText = ''; sessionFruits = []; lastRight = null; riseSaid = -1; wipeN = 0; lastAhead = -1e9;
    blockInput();
    render.clearGallery();
    if (weather.setParty) weather.setParty(false);
    mode = 'play';
    $('stage').classList.remove('talking');
    NH.UI.only(); NH.UI.show('hud'); NH.UI.say('');
    NH.Audio.setMood(world.weather || 0); NH.Audio.startMusic(); NH.Audio.setFanfare(false);
    applyAudio();
    stats.sessions++;
    requestAnimationFrame(() => { updateHudStarTarget(); applySize(); });
  }
  function goTitle() {
    mode = 'title';
    $('stage').classList.remove('talking');
    if (NH.Voice) NH.Voice.stop();
    if (inputCancel && inputCancel.cancel) inputCancel.cancel();
    if (world.cancelDrag) world.cancelDrag();
    NH.Audio.stopMusic(); NH.Audio.setFanfare(false);
    NH.UI.only('scrTitle'); NH.UI.show('hud', false); NH.UI.say('');
    NH.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
    weather.setWeather(0, {}); if (weather.setParty) weather.setParty(false);
    requestAnimationFrame(measureTitle);
  }
  function pause() {
    if (mode !== 'play' && mode !== 'talk') return;
    mode = 'paused';
    countUntil = 0; promptQueued = false; lineUntil = 0; guarded.length = 0;   // Voice.stop below ends every line: no guard outlives it
    if (inputCancel && inputCancel.cancel) inputCancel.cancel();
    if (world.cancelDrag) world.cancelDrag();
    if (NH.Voice) { NH.Voice.stop(); if (NH.Voice.stopListening) NH.Voice.stopListening(); }
    NH.Audio.stopMusic();
    NH.UI.only('scrPause');
  }
  function resume() {
    if (mode !== 'paused') return;
    mode = world.state === 'talk' ? 'talk' : 'play';
    blockInput();
    idleSaid = 0;   // a returning child gets the nudges again before the next auto-pause
    if (world.resetNudges) world.resetNudges();
    NH.UI.only(mode === 'talk' ? 'scrTalk' : undefined);
    NH.Audio.startMusic();
    // say the question again so a returning child knows what to do
    if (mode === 'talk' && world.talk && !world.talkAnswered) speak(T(world.talk.promptKey, world.talk.params || {}), { priority: true });
    else if (world.state === 'intro') speak(T('ui.chapter', { n: world.level + 1 }) + '. ' + T('topic.' + world.topic), { priority: true });
    else if (world.interactive) setTimeout(repeatPrompt, 300);
    else if (world.state === 'round' && world.phase === 'play' && lastRight && lastRight.text) {
      // the pause cut the right line while Nim hops: say it again (short)
      NH.UI.say(lastRight.text); speak(lastRight.text, { priority: true });
    }
  }

  let lastPromptText = '', lastAsk = null, lastRound = null;
  function currentPrompt() {   // prompts have several wordings: repeat the one Nim said, word for word
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
  const stoneOf = id => (world.stoneById ? world.stoneById(id) : null);
  /** the event + what main knows (VOICE §1.1): the chapter topic, the round's prompt key / params / rule / mode, the stone's thing,
   *  the row (countSeq: the needed number is row + 1 — the world's want.rule.value is k) */
  function ev2(e) {
    const c = world.cur, st = stoneOf(e.id), A = lastAsk || {};
    const o = Object.assign({ topic: world.topic, promptKey: c ? c.promptKey : A.promptKey, params: c ? c.params : A.params,
      rule: c ? c.rule : A.rule, mode: c ? c.mode : A.mode, row: world.row }, e, { thing: e.thing || (st && st.thing) || undefined });
    if (o.mode === 'countSeq' && o.need == null && e.type === 'wrong') o.need = (e.want && e.want.count) || (o.row != null ? o.row + 1 : undefined);
    return o;
  }
  function line(fn, e, fallbackKey) {
    const I = NH.I18N;
    if (I && typeof I[fn] === 'function') { try { const t = I[fn](curLang(), e); if (t) return t; } catch (err) { /* fall back */ } }
    return fallbackKey ? T(fallbackKey) : '';
  }
  function nimMood(m, t) { if (world.nim && world.interactive) { world.nim.mood = m; world.nim.moodT = t; } }
  function askText(e) {
    const I = NH.I18N;
    if (I && I.ask) { try { return I.ask(curLang(), e.promptKey, Object.assign({ child: S.name || '' }, e.params || {}), { first: !!e.first }); } catch (err) { /* fall back */ } }
    return T(e.promptKey, e.params || {});
  }
  function flyStars(n, x, y) {
    for (let i = 0; i < n; i++) {
      render.burst('star', x + (i - (n - 1) / 2) * 60, y, { delay: 0.1 + i * 0.2, onDone: () => { shownStars++; NH.UI.setStars(shownStars, true); NH.Audio.play('star', { i }); } });
    }
  }

  function onEvent(e) {
    switch (e.type) {
      case 'level': {
        const wi = (e.weather != null ? e.weather : e.level) % 4;
        weather.setWeather(wi, {});
        NH.Audio.setMood(wi); NH.Audio.play('chapter');
        NH.UI.setDots(world.roundsPerLevel || 4, 0);
        speak(T('ui.chapter', { n: e.level + 1 }) + '. ' + T('topic.' + e.topic), { interrupt: true, tag: 'flavour' });
        speak(T('weather.' + wi), { tag: 'flavour' });   // queued after the chapter name ("Spring by the brook!"); dropped by the ask
        NH.UI.say('');   // the chapter banner shows the topic
        render.prewarm(world.layout, wi);
        break;
      }
      case 'round': {
        NH.UI.fadeBubble(false); NH.Audio.setFanfare(false);
        stats.rounds++; idleSaid = 0; lastAsk = null; lastPromptText = ''; lastRight = null; roundMissed = false;
        NH.UI.setDots(world.roundsPerLevel || 4, e.round % (world.roundsPerLevel || 4));
        NH.UI.say(T('rise'));   // shown, not spoken: the question follows in a moment
        weather.resize(view.W, view.H, world.layout);   // the river may be re-laid for this round's rows
        render.prewarmRound(world);
        break;
      }
      case 'rise':
        stats.rises++; NH.Audio.play('rise');
        // rarely: "Look, stepping stones!" — once per chapter, on its first stone of round 0, only when nothing speaks
        if (e.row === 0 && e.i === 0 && world.round === 0 && riseSaid !== world.level && !speaking() && canInterrupt() && Math.random() < 0.4) { riseSaid = world.level; speak(T('rise')); }
        break;
      case 'ask': {
        lastAsk = e; idleSaid = 0; NH.UI.fadeBubble(false); hintBySay = false; promptQueued = false;
        if (NH.Voice && NH.Voice.dropTagged) NH.Voice.dropTagged(['flavour', 'right']);   // the question goes first (QA P2-2)
        const txt = askText(Object.assign({}, e, { first: !!e.first }));
        lastPromptText = txt;
        // the chapter / weather line may still be talking: the question cuts it (QA P2-2) — never a right / wrong / count line
        const flav = NH.Voice && NH.Voice.currentTag && NH.Voice.currentTag() === 'flavour';
        NH.UI.say(txt); speakPrompt(txt, { priority: true, interrupt: !!flav });
        break;
      }
      case 'right': {
        stats.correct++;
        // VOICE §1.1 rule 1: the prompt stays protected until heard once — the right line queues behind it
        const th = e.thing || {};
        NH.Audio.play('right');
        render.burst('sparkles', e.x, e.y - (world.layout ? world.layout.itemH * 0.5 : 40), { n: 12, color: th.color });
        const txt = line('sayRight', ev2(e), 'praise');
        lastRight = { text: txt };
        // the child already answered row 0: a question that has not started yet is no longer needed (QA P2-1)
        if (pendingPrompt && NH.Voice && NH.Voice.dropTagged) { NH.Voice.dropTagged('prompt'); pendingPrompt = null; promptUntil = Math.min(promptUntil, performance.now()); }
        if (e.mode === 'countSeq') {
          // one count line per hop ("One!" "Two!" "Three!"): queued + protected, never cut
          render.burst('count', e.x, e.y - (world.layout ? world.layout.itemH * 1.25 : 110), { n: e.count || (e.row + 1) });
          NH.Audio.play('pip', { i: e.count || 1 });
          stats.counts++;
          speakCount(txt);
        } else if (e.mode === 'countSel') {
          // the count run ("One, two, three, four! Four dots!") is said while the world lights the dots: never cut
          speakCount(txt, 400);
        } else speakRight(txt);
        NH.UI.say(txt);
        break;
      }
      case 'hop':
        stats.hops++;
        NH.Audio.play('hop', { pitch: 1 + 0.08 * Math.max(0, (e.to | 0)) });
        break;
      case 'land': stats.lands++; NH.Audio.play('land'); break;
      case 'splash': NH.Audio.play('splash', { big: !!e.fish }); break;
      case 'thingAway':
        NH.Audio.play('sparkle');
        if (weather.burst) weather.burst(e.x, e.y, { kind: 'sparkle', n: 8 });
        break;
      case 'homeBadge': NH.Audio.play('badge'); break;
      case 'count': {   // a dot lights up on the counted sign: a rising pip + the numeral (the words are the right line's count run)
        stats.counts++;
        NH.Audio.play('pip', { i: e.i });
        render.burst('count', e.x, e.y - (world.layout ? world.layout.itemH * 0.75 : 70), { n: e.i });
        break;
      }
      case 'bankLand':
        stats.crossings++;
        NH.Audio.play('land', { bank: true });
        // "We crossed the brook!" only in a chapter's round 0 or after a round with a miss, and only when nothing speaks
        if ((world.round === 0 || roundMissed) && !speaking() && canInterrupt()) speak(T('bank'));
        break;
      case 'curl': NH.Audio.play('curl'); break;
      case 'stick': {
        stats.fruits++;
        NH.Audio.play('stick'); NH.Audio.setFanfare(true);
        setTimeout(() => NH.Audio.setFanfare(false), 1200 / Math.max(1, speed));
        if (e.fruit) sessionFruits.push(e.fruit);
        render.burst('sparkles', e.x, e.y + (world.layout ? world.layout.fruitR : 20), { n: 8 });   // low, by the fruit — never over his face
        // the fruit IS the round's praise ("Yum, an apple!"); rate-limited
        // queued (never cutting), so it is heard after the last right line (playtest P1: it used to be skipped 80 % of the time)
        if (performance.now() - lastPraise > 1200) { lastPraise = performance.now(); const t = line('sayFruit', e.fruit) || T('fruit.any'); if (NH.Voice && NH.Voice.dropTagged) NH.Voice.dropTagged('right'); speak(t, { tag: 'fruit' }); NH.UI.say(t); }
        break;
      }
      case 'uncurl': {
        NH.Audio.play('uncurl');
        const n = world.nim, sl = n && n.backSlots && n.backSlots[Math.max(0, (n.fruits.length || 1) - 1) % 4];   // by the new fruit on his back
        if (weather.burst) weather.burst(sl ? sl.x : e.x, sl ? sl.y - 10 : e.y, { kind: 'stars', n: 8 });
        break;
      }
      case 'roundDone': {
        NH.UI.setDots(world.roundsPerLevel || 4, ((e.round != null ? e.round : world.round) % (world.roundsPerLevel || 4)) + 1);
        flyStars(e.stars || 1, e.x, e.y);   // the round's stars fly from above Nim's head to the HUD
        break;   // no line: the fruit line was the praise
      }
      case 'wipe': {
        stats.wipes++; wipeN++;
        NH.Audio.play('wipe');
        if (weather.wipeParticles) weather.wipeParticles(e.dir || (world.layout && world.layout.ax) || { x: 1, y: 0 });
        NH.UI.fadeBubble(true);
        // rarely: chapter 1 round 0 names the swirl; later ≤ 1 in 4 rounds; only when nothing speaks
        const first = world.level === 0 && wipeN === 1;
        if ((first || Math.random() < 0.25) && !speaking() && canInterrupt()) speak(T('wipe'));
        break;
      }
      case 'wrong': {
        stats.wrong++;
        NH.Audio.play('wrong');
        roundMissed = true;
        const now = performance.now();
        if (now - lastWrongSay > 1500) {
          lastWrongSay = now;
          const ee = ev2(e);
          // the miss that brings the hint: ONE short line that also points at the shiny one
          const wt = e.hint ? line('sayWrongHint', ee, 'hint') : line('sayWrong', ee, 'hint');
          if (e.hint) hintBySay = true;
          if (NH.Voice && NH.Voice.dropTagged) NH.Voice.dropTagged(['wrong', 'right']);
          speakWrong(wt); NH.UI.say(wt);
        }
        break;
      }
      case 'squish': stats.squish++; NH.Audio.play('squish'); break;
      case 'ahead': {
        stats.ahead++;
        NH.Audio.play('ahead');
        // "One at a time!" ≤ once per 6 s, never over a protected / count line
        const now = performance.now();
        if (now - lastAhead > 6000 && canInterrupt()) { lastAhead = now; const t = T('ahead'); speak(t, { interrupt: !speaking() || canInterrupt() }); }
        break;
      }
      case 'soft': stats.soft++; NH.Audio.play('soft'); break;
      case 'hint': {
        stats.hints++;
        NH.Audio.play('hint');
        // the pointer line was already said with the miss; else (3 soft presses) a priority line, never dropped as stale
        if (!e.idle && !hintBySay) speak(T('hint'), { priority: true });
        hintBySay = false;
        break;
      }
      case 'assistArmed': NH.Audio.play('hint'); break;
      case 'assist': stats.assists++; break;
      case 'idle':
        if (++idleSaid <= 4) speak(T('idle') + ' ' + currentPrompt());   // then stay quiet: maybe nobody is there
        else if (idleSaid >= 5 && !bot) pause();   // ≈ 2 min without a touch: nobody is playing — pause
        break;
      case 'pokeNim': {
        stats.pokes++;
        NH.Audio.play('giggle');
        // only a question that can still be answered is repeated: during the rise / a hop / the bank / the wipe / a count line
        // Nim just giggles — and never over another line, so nothing is cut
        // (the world sends the question's fields when it can still be answered; Nim's own little poke hop is under way by now,
        // so world.interactive is false for a moment — the event itself says the question is open)
        const open = !e.busy && !!e.promptKey && world.state === 'round' && world.phase === 'play' && world.row < (world.cur ? world.cur.k : 0);
        if (!open || !lastAsk) { if (!speaking() && canInterrupt() && performance.now() - lastTapSay > 2000) { lastTapSay = performance.now(); speak(T('poke')); } break; }
        askAgain(true);
        break;
      }
      case 'gust': stats.gusts++; NH.Audio.play('gust'); break;
      case 'fish': case 'frog': case 'snow': {
        if (e.type === 'fish' && e.n > 1) { NH.Audio.play('splash', { big: true }); break; }   // the 2nd leap: only the splash
        stats.surprises++;
        NH.Audio.play(e.type === 'fish' ? 'splash' : e.type === 'frog' ? 'croak' : 'twinkle', { big: true });
        if (canInterrupt()) speak(T('surprise.' + e.type));   // queued, never over a protected prompt
        break;
      }
      case 'fishTap': case 'frogTap': case 'snowTap': {
        const k = e.type.replace('Tap', '');
        stats[k + 'Taps']++;
        NH.Audio.play(k === 'fish' ? 'splash' : k === 'frog' ? 'croak' : 'twinkle', { big: true });
        render.burst('sparkles', e.x, e.y, { n: 8, color: k === 'snow' ? '#FFFFFF' : null });
        const now = performance.now();
        if (now - lastTapSay > 2000 && canInterrupt() && !speaking()) { lastTapSay = now; speak(T(k + '.tap'), { interrupt: true }); }
        break;
      }
      case 'talk': NH.UI.fadeBubble(false); NH.UI.say(''); NH.Audio.setFanfare(false); NH.UI.setDots(world.roundsPerLevel || 4, world.roundsPerLevel || 4); openTalk(e.talk || world.talk); break;
      case 'talkAsk': {   // no answer yet: ask again, and from the 2nd re-ask glow the right answer
        const tk = e.talk || world.talk;
        if (tk && e.n <= 3) speak(T(tk.promptKey, tk.params || {}), { priority: true, interrupt: true });
        if (tk && (e.n >= 2 || e.glowAnswer)) NH.UI.glowTalk(tk.answerId || tk.answer);
        break;
      }
      case 'talkResult': {
        stats.talks++; if (e.correct) stats.talkRight++;
        NH.UI.markTalk(e.choiceId, e.answerId);
        const tk = world.talk, ans = (tk && tk.choices.find(c => c.id === e.answerId)) || {};
        const kind = () => (NH.I18N.talkWrong ? NH.I18N.talkWrong(curLang(), ans, tk) : T('talk.wrong.any'));
        if (e.auto) { speak(kind(), { interrupt: true }); break; }
        if (e.correct) {
          NH.Audio.play('talkRight');
          render.burst('star', view.W / 2, view.H / 2, { onDone: () => { shownStars++; NH.UI.setStars(shownStars, true); NH.Audio.play('star'); } });
          speak(T('talk.right'), { interrupt: true });
        } else {
          NH.Audio.play('gentle');
          speak(kind(), { interrupt: true });
        }
        break;
      }
      case 'levelDone':
        NH.Audio.play('level'); NH.UI.say('');
        if (mode === 'talk') { mode = 'play'; NH.UI.only(); }
        $('stage').classList.remove('talking');
        speak(T('great'));
        break;
      case 'sessionDone': {
        NH.Audio.play('party'); NH.Audio.setFanfare(false);
        if (weather.setParty) weather.setParty(true);
        render.setGallery(sessionFruits.slice());
        render.burst('confetti', 0, 0);
        progress.totalStars += e.stars || 0; progress.sessions++;
        NH.Storage.setJSON('progress', progress);
        shownStars = e.stars || shownStars; NH.UI.setStars(shownStars);
        $('doneStars').textContent = e.stars || 0;
        $('doneTitle').textContent = T('session.done', { stars: e.stars || 0 });
        speak(T('party'), { interrupt: true });
        speak(T('session.done', { stars: e.stars || 0 }));
        mode = 'done';
        NH.UI.only('scrDone'); NH.UI.show('hud', false); NH.UI.say('');
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
    const canMic = S.mic && NH.Voice && NH.Voice.canListen && NH.Voice.canListen() && !FLAGS.bot;
    NH.UI.openTalk(talk, curLang(), id => { NH.Audio.play('click'); world.talkAnswer(id); }, canMic, curAge());
    const q = T(talk.promptKey, talk.params || {});
    speakPrompt(T('talk.intro') + ' ' + q, { priority: true });   // queued after the round's praise, not cutting it off
  }
  function listen() {
    const talk = world.talk;
    if (!talk || world.state !== 'talk' || !NH.Voice || !NH.Voice.canListen()) return;
    if (NH.Voice.stop) NH.Voice.stop();
    NH.Audio.play('listen');
    NH.UI.setListening(true, T('ui.listening'));
    const choices = talk.choices.map(c => ({ id: c.id, words: NH.I18N.choiceWords ? NH.I18N.choiceWords(curLang(), c) : [] }));
    NH.Voice.listen({ lang: curLang(), choices, timeoutMs: 6000 }).then(res => {
      NH.UI.setListening(false, T('ui.tapOrSay'));
      if (world.state !== 'talk') return;
      if (res && res.id != null) world.talkAnswer(res.id);
      else if (res && res.reason === 'not-allowed') { $('btnMic').classList.add('hidden'); speak(T('ui.micDenied')); }
      else speak(T('ui.tapOrSay'));
    }).catch(() => NH.UI.setListening(false, T('ui.tapOrSay')));
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
    bubbleOverNim();
    weather.update(dt * Math.min(speed, 4), {});
    const sp = speaking();
    NH.Audio.duck(sp);
    if (NH.Audio.tick) NH.Audio.tick(dt);
    render.draw(world, weather, { dt: dt * Math.min(speed, 4), lang: curLang(), title: mode === 'title' || mode === 'loading', speaking: sp, done: mode === 'done', debug: FLAGS.debug });
    adapt(raw);
  }
  /** safety net (visual QA P1-1): the DOM speech bubble fades while Nim's art reaches under it (a top-row stone, a high hop) */
  let bubbleUnder = false;
  function bubbleOverNim() {
    let on = false;
    if (mode === 'play' && world.nim && world.layout && world.layout.bubble) {
      const n = world.nim, B = world.layout.bubble, k = (n.h || world.layout.nimH) / 300, P = NH.NIM_POINTS || { feet: [150, 290], box: [14, 50, 296, 292] };
      const x0 = n.x - (P.feet[0] - P.box[0]) * k, x1 = n.x + (P.box[2] - P.feet[0]) * k, y0 = n.y - (P.feet[1] - P.box[1]) * k * Math.max(1, n.sy || 1);
      const bb = $('bubble').offsetHeight ? Math.min(B.h, $('bubble').offsetHeight / view.s) : B.h;   // the bubble's real (shrunk) height
      on = y0 < B.y + bb && x1 > B.x && x0 < B.x + B.w && n.y > B.y;
    }
    if (on !== bubbleUnder) { bubbleUnder = on; NH.UI.bubbleUnder(on); }
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
    NH.Audio.play('click');
    nimMood('talk', 1.0);
    const cp = currentPrompt(); promptUntil = 0; NH.UI.say(cp); speakPrompt(cp, { interrupt: true });
  }
  /** a Nim / speech-bubble tap while the question can be answered (VOICE §1.1 rule 4): never cut a protected prompt, wrong or
   *  count line — queue the question ONCE to follow it; never restart the question while Nim is still saying it */
  function askAgain(force) {
    if ((!world.interactive && !force) || !lastAsk) return;
    if (speaking() && lastSpoken === lastPromptText) return;
    if (guarded.some(g => g.kind === 'count')) return;   // count numbers still to come: never queue the question behind them
    if (!canInterrupt()) {
      if (pendingPrompt || promptQueued) return;   // the question is still to come
      const now = performance.now();
      if (now - promptStart < 3000) return;
      promptQueued = true; nimMood('talk', 1.0);
      const cp = currentPrompt(); NH.UI.say(cp); speakPrompt(cp, { priority: true });
      return;
    }
    const since = performance.now() - promptStart;
    const stuck = pendingPrompt && since > 6000;   // the prompt never started (no voice / dropped): don't wait forever
    if (since > 3000 && (!pendingPrompt || stuck)) repeatPrompt(force);
  }
  function bubbleTap() { askAgain(); }

  function bindUI() {
    NH.Input.kidProof();
    NH.UI.guardScreenClicks();   // a finger held on the canvas never clicks a screen that opens under it (QA-F P2-1)
    // Input passes two NUMBERS in logical px (never a point object) — VOICE §4
    inputCancel = NH.Input.attach($('game'), {
      toLogical,
      down: (x, y) => { if (mode === 'play' && !bot && performance.now() >= inputBlockUntil) world.pointerDown(x, y); },   // judged at once
      move: (x, y) => { if (mode === 'play' && !bot) world.pointerMove(x, y); },   // delivered (the world ignores it in play)
      up: (x, y) => { if (mode === 'play' && !bot) world.pointerUp(x, y); },
      cancel: () => { if (world.cancelDrag) world.cancelDrag(); }
    });
    const unlock = () => { NH.Audio.unlock(); if (NH.Voice) NH.Voice.unlock(); };
    ['touchend', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { capture: true, passive: true }));

    $('btnPlay').addEventListener('click', () => { NH.Audio.play('click'); startGame(); });
    $('bubble').addEventListener('click', bubbleTap);
    $('btnPause').addEventListener('click', () => { NH.Audio.play('click'); pause(); });
    $('btnResume').addEventListener('click', () => { NH.Audio.play('click'); resume(); });
    $('btnHome').addEventListener('click', () => { NH.Audio.play('click'); goTitle(); });
    $('btnAgain').addEventListener('click', () => { NH.Audio.play('click'); startGame(); });
    $('btnDoneHome').addEventListener('click', () => { NH.Audio.play('click'); goTitle(); });
    $('btnMic').addEventListener('click', listen);
    // volume: settings slider + big − / + in the pause menu
    $('optVolume').addEventListener('input', () => { S.volume = +$('optVolume').value / 100; saveSettings(); applyAudio(); });
    $('optVolume').addEventListener('change', () => NH.Audio.play('land'));
    const vstep = d => { S.volume = Math.max(0, Math.min(1, Math.round(((S.volume == null ? 1 : S.volume) + d) * 20) / 20)); saveSettings(); applyAudio(); NH.Audio.play('land'); };
    $('btnVolDown').addEventListener('click', () => vstep(-0.1));
    $('btnVolUp').addEventListener('click', () => vstep(0.1));
    document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => {
      S.lang = b.dataset.lang; langOverride = null; saveSettings(); NH.UI.applyLang(curLang()); applyAudio(); NH.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
      updateVoiceInfo();
      NH.Audio.play('click');
      if (mode === 'title') speak(T('ui.welcome'), { interrupt: true });
      requestAnimationFrame(measureTitle);
    }));
    // parent gate: hold the gear for 2 s
    const gear = $('btnParents');
    NH.Input.holdButton(gear, 2000, () => { gear.style.setProperty('--p', 0); openSettings(); },
      p => { gear.style.setProperty('--p', p); gear.classList.toggle('holding', p > 0); });
    gear.addEventListener('click', () => { gear.classList.add('tip'); setTimeout(() => gear.classList.remove('tip'), 1600); });
    NH.UI.bindSettings(S, k => {
      saveSettings();
      if (k === 'sfx' || k === 'music' || k === 'voice') applyAudio();
      if (k === 'age') { ageOverride = null; NH.UI.setTitleInfo(progress.totalStars, curAge(), curLang()); }
      if (k === 'name' && NH.I18N.setChild) NH.I18N.setChild(S.name);
    }, curAge);
    $('btnSettingsDone').addEventListener('click', () => { NH.Audio.play('click'); NH.UI.only('scrTitle'); NH.UI.setTitleInfo(progress.totalStars, curAge(), curLang()); });

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(applySize, 250));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (inputCancel && inputCancel.cancel) inputCancel.cancel(); if (world.cancelDrag) world.cancelDrag(); pause(); NH.Audio.suspend(); if (NH.Voice) NH.Voice.stop(); }
      else NH.Audio.resume();
    });
    window.addEventListener('blur', () => { if (world && world.cancelDrag) world.cancelDrag(); });
  }
  function openSettings() {
    NH.Audio.play('click');
    NH.UI.refreshSettings();
    updateVoiceInfo();
    NH.UI.only('scrSettings');
  }
  function updateVoiceInfo() {
    if (!NH.Voice) return;
    const has = NH.Voice.hasVoice ? NH.Voice.hasVoice(curLang()) : false;
    const nm = NH.Voice.voiceName ? NH.Voice.voiceName(curLang()) : '';
    const mic = NH.Voice.canListen && NH.Voice.canListen();
    const v = has ? (curLang() === 'vi' ? 'Giọng đọc: ' : 'Voice: ') + (nm || '✓') : T('ui.voiceMissing');
    const m = mic ? '' : ' · ' + T('ui.micUnsupported');
    NH.UI.setVoiceInfo(v + m);
  }

  /* ---------- test hooks (DESIGN §5.5) — live getters via defineProperties (never Object.assign) ---------- */
  function hooks() {
    const circ = c => (c ? { x: view.left + c.x * view.s, y: view.top + c.y * view.s, r: (c.r || 0) * view.s, own: (c.own || c.r || 0) * view.s } : null);
    const box = b => (b ? { x: view.left + b.x * view.s, y: view.top + b.y * view.s, w: (b.w || 0) * view.s, h: (b.h || 0) * view.s,
      cx: view.left + (b.cx != null ? b.cx : b.x + b.w / 2) * view.s, cy: view.top + (b.cy != null ? b.cy : b.y + b.h / 2) * view.s } : null);
    const prev = NH.debug || {};
    NH.debug = prev;
    Object.defineProperties(prev, Object.getOwnPropertyDescriptors({
      get world() { return world; }, get weather() { return weather; }, get mode() { return mode; }, stats, events: eventLog,
      get bot() { return bot; },
      get voiceLog() { return (NH.Voice && NH.Voice.log) || []; },
      getState() {
        return { mode, state: world.state, phase: world.phase, level: world.level, topic: world.topic, round: world.round,
          stars: world.stars, misses: world.misses, interactive: world.interactive,
          row: world.row, nim: world.nim ? { state: world.nim.state, onRow: world.nim.onRow, x: world.nim.x, y: world.nim.y } : null,
          stones: (world.stones || []).map(s => ({ id: s.id, row: s.row, state: s.state, target: s.target, visited: !!s.visited, kind: s.thing && s.thing.kind })),
          surprise: world.surprise, weather: weather.ambient && weather.ambient.mood, W: view.W, H: view.H, ins: view.ins, settings: Object.assign({}, S), speed };
      },
      setSpeed(n) { speed = Math.max(0.1, +n || 1); applyAudio(); },
      startGame, goTitle,
      setBot(on, skill) { bot = on ? new NH.Bot(world, { skill: skill == null ? FLAGS.botSkill : skill, seed: 7 }) : null; },
      setAutoRestart(on) { autoRestart = !!on; },
      gotoLevel(i) { world.startLevel(i); },
      view: () => view, render: () => render,
      stoneScreen(id) { return circ(world.stoneHit ? world.stoneHit(id) : null); },
      nimScreen() { return box(world.nimHit ? world.nimHit() : null); },
      fishScreen() { return circ(world.fishHit ? world.fishHit() : null); },
      frogScreen() { return circ(world.frogHit ? world.frogHit() : null); },
      snowScreen() { return circ(world.snowHit ? world.snowHit() : null); },
      answer() { return world.answer ? world.answer() : null; },
      targets() { return world.targets ? world.targets() : []; },
      toScreen(x, y) { return { x: view.left + x * view.s, y: view.top + y * view.s }; },
      audio: () => NH.Audio
    }));
  }

  /* ---------- boot ---------- */
  async function boot() {
    await NH.Storage.init();
    S = Object.assign({}, DEF, NH.Storage.getJSON('settings', {}));
    Object.assign(progress, NH.Storage.getJSON('progress', {}));
    NH.UI.applyLang(curLang());
    if (NH.I18N && NH.I18N.setChild) NH.I18N.setChild(S.name);
    if (NH.Voice) { NH.Voice.init({ lang: curLang(), enabled: voiceOn(), speed }); const prevStart = NH.Voice.onStart; NH.Voice.onStart = d => { onVoiceStart(d); if (prevStart) prevStart(d); }; }
    render = new NH.Renderer($('game')); NH.render = render;
    world = new NH.World({ seed: FLAGS.seed != null ? FLAGS.seed : (Date.now() & 0x7fffffff), age: curAge(), lang: curLang() });
    weather = new NH.Weather({ width: 960, height: 720, seed: 11 });
    weather.windSource = world;   // leaves / petals / snow move with the same gusts as the stones
    hooks();
    bindUI();
    applySize();
    weather.setWeather(0, { instant: true });
    await NH.Assets.load();
    render.prewarm(world.layout, 0);
    applyAudio();
    if (FLAGS.bot) bot = new NH.Bot(world, { skill: FLAGS.botSkill, seed: 7 });
    NH.UI.only('scrTitle');
    NH.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
    mode = 'title';
    requestAnimationFrame(measureTitle);
    requestAnimationFrame(frame);
    if (FLAGS.autostart) startGame();
    if (NH.Voice && NH.Voice.onVoicesChanged) NH.Voice.onVoicesChanged(updateVoiceInfo);
  }
  window.addEventListener('DOMContentLoaded', () => boot().catch(e => { console.error(e); }));
})(window.NH = window.NH || {});
