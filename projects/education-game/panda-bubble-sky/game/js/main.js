/* PB main (Bao's Bubble Sky) — boots the game, sizes the canvas for any phone / tablet shape, runs the loop and turns world
 * events (Bao blows the bubbles, a right pop frees the thing inside and it paints a piece of the rainbow, stars are counted,
 * the rainbow shimmers, Bao's whoosh blows the leftovers away, a bird / kite / snowflakes drop by) into voice, sound, effects
 * and UI, following the event → line table in docs/VOICE.md §1.1 and the event list in docs/MECHANICS.md §6 (prompts
 * protected, count runs never cut, praise rate-limited, hints priority). Touches reach the world only through PB.Input (two
 * numbers in logical px; HUD / speech bubble / menus never reach the canvas). */
(function (PB) {
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
  const T1 = (key, p) => (PB.I18N ? PB.I18N.t(curLang(), key, Object.assign({ child: S.name || '' }, p || {})) : key);
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
  const saveSettings = () => PB.Storage.setJSON('settings', S);
  const progress = { totalStars: 0, sessions: 0 };

  let world, weather, render, bot = null, inputCancel = null;
  let mode = 'loading';            // loading | title | play | paused | talk | done
  let speed = FLAGS.speed, autoRestart = FLAGS.autorestart;
  let view = { W: 960, H: 720, s: 1, left: 0, top: 0, ins: { top: 0, right: 0, bottom: 0, left: 0 } };
  const stats = { sessions: 0, rounds: 0, correct: 0, wrong: 0, squish: 0, soft: 0, hints: 0, assists: 0, counts: 0, blows: 0, pops: 0,
    paints: 0, rainbows: 0, whooshes: 0, bumps: 0, gusts: 0, talks: 0, talkRight: 0, surprises: 0, birdTaps: 0, kiteTaps: 0, snowTaps: 0,
    pokes: 0, frames: 0, slowFrames: 0 };
  const eventLog = [];             // the last 300 world events (type + id), for the e2e tests
  let promptUntil = 0, lastWrongSay = -1e9, idleSaid = 0, shownStars = 0, lastPraise = -1e9, lastTapSay = -1e9;
  let sessionThings = [], blowSaid = -1;
  let inputBlockUntil = 0;         // canvas presses right after Resume / Play / Play again are ignored (a double tap falls through)
  let lastRight = null;            // the right answer's line: re-said (short) when a pause cut it while the thing flies
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
    world.setViewport(view.W, view.H, view.ins);    // field, homes, rainbow, Bao re-laid; bubbles drift to their new homes
    weather.resize(view.W, view.H, world.layout && world.layout.groundY);
    placeBubble();
    updateHudStarTarget();
    if (mode === 'done') requestAnimationFrame(measureDonePanel);
  }
  /** the celebration panel's bottom in logical px: the done-scene rainbow keeps clear of it (visual QA P2-7) */
  function measureDonePanel() {
    const p = document.querySelector('#scrDone .done-panel');
    const r = p && mode === 'done' ? p.getBoundingClientRect() : null;
    render.donePanel = r && r.height ? { x: (r.left - view.left) / view.s, y: (r.top - view.top) / view.s, w: r.width / view.s, h: r.height / view.s } : null;
  }
  function placeBubble() {
    const B = world.layout && world.layout.bubble;
    if (!B) return;
    const r = { x: view.left + B.x * view.s, y: view.top + B.y * view.s, w: B.w * view.s, h: B.h * view.s };
    PB.UI.placeBubble(r);
  }
  function updateHudStarTarget() {
    const p = PB.UI.hudStarPoint();
    if (p.x || p.y) render.hudStar = { x: (p.x - view.left) / view.s, y: (p.y - view.top) / view.s };
  }
  let resizeT = 0;
  function onResize() { clearTimeout(resizeT); resizeT = setTimeout(applySize, 120); }

  /* ---------- voice ---------- */
  const voiceOn = () => S.voice && !FLAGS.novoice && speed <= 1.01 && !FLAGS.mute;
  function speak(text, opt) {
    if (!text) return null;
    lastSpoken = text;
    return PB.Voice ? PB.Voice.say(text, opt || {}) : null;
  }
  const speaking = () => !!(PB.Voice && PB.Voice.isSpeaking && PB.Voice.isSpeaking());
  function applyAudio() {
    const vol = S.volume == null ? 1 : S.volume;
    PB.Audio.setOptions({ sfx: S.sfx, music: S.music, muted: FLAGS.mute, volume: vol });
    if (PB.Voice) { PB.Voice.setLang(curLang()); PB.Voice.setEnabled(voiceOn()); if (PB.Voice.setVolume) PB.Voice.setVolume(vol); if (PB.Voice.setSpeed) PB.Voice.setSpeed(speed); }
    const vl = $('volLevel'); if (vl) vl.textContent = Math.round(vol * 100) + '%';
    const vs = $('optVolume'); if (vs && document.activeElement !== vs) vs.value = Math.round(vol * 100);
  }
  // the question is the most important line: praise / hint lines must not cut it off
  let pendingPrompt = null, promptStart = 0;
  const lineMs = txt => 600 + 95 * (txt || '').length;   // voice.js's estimate at rate 0.9
  function speakPrompt(txt, opt) {
    pendingPrompt = txt || null; promptStart = performance.now();
    promptUntil = performance.now() + 6000 + lineMs(txt);
    const p = speak(txt, opt);
    // the line ended (or was dropped / failed) without ever starting: lift the guard so a Bao tap repeats it
    if (p && p.then) p.then(() => { promptQueued = false; if (pendingPrompt === txt) { pendingPrompt = null; promptUntil = Math.min(promptUntil, performance.now() + 300); } }, () => { promptQueued = false; });
    if (!voiceOn()) { pendingPrompt = null; promptQueued = false; promptUntil = performance.now() + lineMs(txt); }
  }
  function onVoiceStart(display) {
    if (pendingPrompt && display === pendingPrompt) { promptStart = performance.now(); promptUntil = promptStart + lineMs(display); pendingPrompt = null; promptQueued = false; }
  }
  // count lines (countPop "One!", the countSel run) have their own guard: a repeated question never lowers it (VOICE §1.1 rule 2)
  let countUntil = 0, promptQueued = false;
  const canInterrupt = () => performance.now() > promptUntil && performance.now() > countUntil;
  /** a count line: priority, never interrupting, never interrupted — queued lines stack their guards */
  function speakCount(txt, extraMs) {
    const now = performance.now();
    countUntil = Math.max(countUntil, now) + lineMs(txt) + (extraMs || 0);
    speak(txt, { priority: true });
  }
  /** feedback (right / wrong) interrupts — but never the prompt while it is protected (then it queues) */
  const feedback = txt => speak(txt, { interrupt: canInterrupt() });
  /** the wrong line carries the goal ("… find a red one!"): protect it like a prompt */
  const protect = (txt, extraMs) => { if (txt) promptUntil = Math.max(promptUntil, performance.now() + lineMs(txt) + (extraMs || 0)); };

  /* ---------- game flow ---------- */
  function startGame() {
    PB.Audio.unlock();
    world.setAge(curAge()); world.setLang(curLang());
    world.lastTopics = PB.Storage.getJSON('lastTopics', null);   // chapters rotate between sessions
    world.newSession({ lastTopics: world.lastTopics });
    if (world.levels) PB.Storage.setJSON('lastTopics', world.levels);
    if (FLAGS.level != null) world.startLevel(Math.max(0, Math.min(3, FLAGS.level | 0)));
    countUntil = 0; promptUntil = 0; promptQueued = false;
    shownStars = 0; PB.UI.setStars(0); lastAsk = null; lastPromptText = ''; sessionThings = []; lastRight = null; blowSaid = -1;
    blockInput();
    render.clearGallery();
    if (weather.setParty) weather.setParty(false);
    mode = 'play';
    $('stage').classList.remove('talking');
    PB.UI.only(); PB.UI.show('hud'); PB.UI.say('');
    PB.Audio.setMood(world.weather || 0); PB.Audio.startMusic(); PB.Audio.setFanfare(false);
    applyAudio();
    stats.sessions++;
    requestAnimationFrame(() => { updateHudStarTarget(); applySize(); });
  }
  function goTitle() {
    mode = 'title';
    $('stage').classList.remove('talking');
    if (PB.Voice) PB.Voice.stop();
    if (inputCancel && inputCancel.cancel) inputCancel.cancel();
    if (world.cancelDrag) world.cancelDrag();
    PB.Audio.stopMusic(); PB.Audio.setFanfare(false);
    PB.UI.only('scrTitle'); PB.UI.show('hud', false); PB.UI.say('');
    PB.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
    weather.setWeather(0, {}); if (weather.setParty) weather.setParty(false);
  }
  function pause() {
    if (mode !== 'play' && mode !== 'talk') return;
    mode = 'paused';
    countUntil = 0; promptQueued = false;   // Voice.stop below ends every line: no guard outlives it
    if (inputCancel && inputCancel.cancel) inputCancel.cancel();
    if (world.cancelDrag) world.cancelDrag();
    if (PB.Voice) { PB.Voice.stop(); if (PB.Voice.stopListening) PB.Voice.stopListening(); }
    PB.Audio.stopMusic();
    PB.UI.only('scrPause');
  }
  function resume() {
    if (mode !== 'paused') return;
    mode = world.state === 'talk' ? 'talk' : 'play';
    blockInput();
    idleSaid = 0;   // a returning child gets the nudges again before the next auto-pause
    if (world.resetNudges) world.resetNudges();
    PB.UI.only(mode === 'talk' ? 'scrTalk' : undefined);
    PB.Audio.startMusic();
    // say the question again so a returning child knows what to do
    if (mode === 'talk' && world.talk && !world.talkAnswered) speak(T(world.talk.promptKey, world.talk.params || {}), { priority: true });
    else if (world.state === 'intro') speak(T('ui.chapter', { n: world.level + 1 }) + '. ' + T('topic.' + world.topic), { priority: true });
    else if (world.interactive) setTimeout(repeatPrompt, 300);
    else if (world.state === 'round' && world.phase === 'play' && lastRight && lastRight.text) {
      // the pause cut the right line while the thing flies to the rainbow: say it again (short)
      PB.UI.say(lastRight.text); speak(lastRight.text, { priority: true });
    }
  }

  let lastPromptText = '', lastAsk = null, lastRound = null;
  function currentPrompt() {   // prompts have several wordings: repeat the one Bao said, word for word
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
  const bubbleOf = id => (world.bubbleById ? world.bubbleById(id) : null);
  /** the event + what main knows (VOICE §1.1): the chapter topic, the round's prompt key / params / rule / mode, the bubble's thing */
  function ev2(e) {
    const c = world.cur, b = bubbleOf(e.id), A = lastAsk || {};
    return Object.assign({ topic: world.topic, promptKey: c ? c.promptKey : A.promptKey, params: c ? c.params : A.params,
      rule: c ? c.rule : A.rule, mode: c ? c.mode : A.mode }, e, { thing: e.thing || (b && b.thing) || undefined });
  }
  function line(fn, e, fallbackKey) {
    const I = PB.I18N;
    if (I && typeof I[fn] === 'function') { try { const t = I[fn](curLang(), e); if (t) return t; } catch (err) { /* fall back */ } }
    return fallbackKey ? T(fallbackKey) : '';
  }
  function baoMood(m, t) { if (world.bao) { world.bao.mood = m; world.bao.moodT = t; } }
  function askText(e) {
    const I = PB.I18N;
    if (I && I.ask) { try { return I.ask(curLang(), e.promptKey, Object.assign({ child: S.name || '' }, e.params || {}), { first: !!e.first }); } catch (err) { /* fall back */ } }
    return T(e.promptKey, e.params || {});
  }
  function flyStars(n, x, y) {
    for (let i = 0; i < n; i++) {
      render.burst('star', x + (i - (n - 1) / 2) * 60, y, { delay: 0.1 + i * 0.2, onDone: () => { shownStars++; PB.UI.setStars(shownStars, true); PB.Audio.play('star', { i }); } });
    }
  }
  /** the chapter's last round (4 rounds, or the 75 s rule ends it after ≥ 3) — the rainbow line is the praise there */
  function lastRoundOfChapter() {
    const C = PB.CONFIG || {}, r = world.round, el = world.time - (world.levelStartTime || 0);
    return r >= (world.roundsPerLevel || 4) - 1 || (r + 1 >= (C.chapterMinRounds || 3) && el > (C.chapterTimeLimit || 75));
  }

  function onEvent(e) {
    switch (e.type) {
      case 'level': {
        const wi = (e.weather != null ? e.weather : e.level) % 4;
        weather.setWeather(wi, {});
        PB.Audio.setMood(wi); PB.Audio.play('chapter');
        PB.UI.setDots(world.roundsPerLevel || 4, 0);
        speak(T('ui.chapter', { n: e.level + 1 }) + '. ' + T('topic.' + e.topic), { interrupt: true });
        speak(T('weather.' + wi));   // queued after the chapter name ("Spring in the clouds!")
        PB.UI.say('');   // the chapter banner shows the topic
        render.prewarm(world.layout, wi);
        break;
      }
      case 'round': {
        PB.UI.fadeBubble(false); PB.Audio.setFanfare(false);
        stats.rounds++; idleSaid = 0; lastAsk = null; lastPromptText = ''; lastRight = null;
        PB.UI.setDots(world.roundsPerLevel || 4, e.round % (world.roundsPerLevel || 4));
        PB.UI.say(T('blow'));   // shown, not spoken: the question follows in a moment
        for (const b of world.bubbles || []) sessionThings.push(b.thing);
        if (sessionThings.length > 40) sessionThings = sessionThings.slice(-40);
        render.prewarmRound(world);
        break;
      }
      case 'blow':
        stats.blows++; PB.Audio.play('blow');
        // rarely: "Here come the bubbles!" — once per chapter, on its first bubble, only when nothing speaks
        if (e.i === 0 && world.round === 0 && blowSaid !== world.level && !speaking() && canInterrupt() && Math.random() < 0.5) { blowSaid = world.level; speak(T('blow')); }
        break;
      case 'bubbleIn': PB.Audio.play('blup'); break;
      case 'bump': stats.bumps++; PB.Audio.play('bump', { v: e.v }); break;
      case 'ask': {
        lastAsk = e; idleSaid = 0; PB.UI.fadeBubble(false); roundMissed = false; hintBySay = false; promptQueued = false;
        // the long "Look at the bubbles! …" form: the world sets first in a chapter's round 0 and the count chapter's first
        // countSel round (MECHANICS fix round 1) — passed straight through
        const txt = askText(Object.assign({}, e, { first: !!e.first }));
        lastPromptText = txt;
        PB.UI.say(txt); speakPrompt(txt, { priority: true });
        break;
      }
      case 'right': {
        stats.correct++;
        // VOICE §1.1 rule 1: the prompt stays protected until heard once — the right line queues behind it
        const th = e.thing || {};
        PB.Audio.play('right');
        render.burst('sparkles', e.x, e.y, { n: 14, color: th.color });
        const txt = line('sayRight', ev2(e), 'praise');
        lastRight = { text: txt };
        if (e.mode === 'countPop') {
          // one count line per pop ("Two!" … "Three! Three bubbles!"): queued + protected, never cut
          const L = world.layout;
          render.burst('count', e.x, e.y - (L ? L.R * 0.2 : 20), { n: e.count });
          PB.Audio.play('pip', { i: e.count || 1 });
          stats.counts++;
          speakCount(txt);
        } else if (e.mode === 'countSel' && th.kind === 'stars') {
          // the count run ("One, two, three, four! Four stars!") is said while the world lights the stars: never cut
          speakCount(txt, 400);
        } else { feedback(txt); protect(txt); }
        PB.UI.say(txt);
        break;
      }
      case 'pop':
        stats.pops++;
        PB.Audio.play('pop', { pitch: 0.85 + Math.random() * 0.35, soft: !!e.soft });
        break;
      case 'homeBadge': PB.Audio.play('badge'); break;
      case 'count': {   // a star lights up on the freed thing: a rising pip + the numeral (the words are the right line's count run)
        stats.counts++;
        PB.Audio.play('pip', { i: e.i });
        // the numeral sits above the (enlarged, fs up to 2.2) star group, never on it
        const L = world.layout, b = bubbleOf(e.id), fs = b && b.fs > 0 ? b.fs : 1;
        render.burst('count', e.x, e.y - (L ? L.thingSize * (0.5 * fs + 0.45) : 80), { n: e.i });
        break;
      }
      case 'fly': break;
      case 'paint':
        stats.paints++;
        PB.Audio.play('paint', { i: e.i });
        if (weather.burst) weather.burst(e.x, e.y, { kind: 'sparkle', n: 8 });
        break;
      case 'wrong': {
        stats.wrong++;
        PB.Audio.play('squish');
        roundMissed = true;
        const now = performance.now();
        if (now - lastWrongSay > 1500) {
          lastWrongSay = now;
          const b = bubbleOf(e.id), ee = ev2(Object.assign({}, e, { thing: (b && b.thing) || e.thing }));
          // the miss that brings the hint: ONE short line that also points at the shiny one
          const wt = e.hint ? line('sayWrongHint', ee, 'hint') : line('sayWrong', ee, 'hint');
          if (e.hint) hintBySay = true;
          feedback(wt); protect(wt); PB.UI.say(wt);
        }
        break;
      }
      case 'squish': stats.squish++; PB.Audio.play('squish'); break;
      case 'soft': stats.soft++; PB.Audio.play('soft'); break;
      case 'hint': {
        stats.hints++;
        PB.Audio.play('hint');
        // the pointer line was already said with the miss; else (3 soft presses) a priority line, never dropped as stale
        if (!e.idle && !hintBySay) speak(T('hint'), { priority: true });
        hintBySay = false;
        break;
      }
      case 'assistArmed': PB.Audio.play('hint'); break;
      case 'assist': stats.assists++; break;
      case 'idle':
        if (++idleSaid <= 4) speak(T('idle') + ' ' + currentPrompt());   // then stay quiet: maybe nobody is there
        else if (idleSaid >= 5 && !bot) pause();   // ≈ 2 min without a touch: nobody is playing — pause
        break;
      case 'pokeBao': {
        stats.pokes++;
        PB.Audio.play('giggle');
        // only a question that can still be answered is repeated: during the blow / rainbow / whoosh / a count run Bao just
        // giggles — and never over another line, so nothing is cut
        if (e.busy || !world.interactive || !lastAsk) { if (!speaking() && canInterrupt()) speak(T('poke')); break; }
        askAgain();
        break;
      }
      case 'roundDone': {
        PB.UI.setDots(world.roundsPerLevel || 4, ((e.round != null ? e.round : world.round) % (world.roundsPerLevel || 4)) + 1);
        lastRound = { round: e.round != null ? e.round : world.round, stars: e.stars || 0, missed: roundMissed || (e.misses || 0) > 0 };
        flyStars(e.stars || 1, e.x, e.y);   // the round's stars fly from the top of the rainbow to the HUD
        break;   // no line: the right line just named the last thing
      }
      case 'rainbowDone': {
        stats.rainbows++;
        PB.Audio.play('rainbow'); PB.Audio.setFanfare(true);
        setTimeout(() => PB.Audio.setFanfare(false), 1500 / Math.max(1, speed));
        if (weather.burst) weather.burst(e.x, e.y, { kind: 'stars', n: 12 });
        render.burst('sparkles', e.x, e.y, { n: 18 });
        // ONE praise, only after a round with a miss, the chapter's 2nd round or its last round (playtest P2-5); droppable
        const lr = lastRound || {};
        if ((lr.missed || lastRoundOfChapter() || world.round === 1) && !speaking() && canInterrupt() && performance.now() - lastPraise > 1200) {
          lastPraise = performance.now(); speak(T(lr.stars >= 3 && Math.random() < 0.5 ? 'great' : 'rainbow'));
        }
        break;
      }
      case 'whoosh': {
        stats.whooshes++;
        PB.Audio.play('whoosh');
        PB.UI.fadeBubble(true);
        // rarely: chapter 1 round 0 names the gesture; later ≤ 1 in 4 rounds; only when nothing speaks
        const first = world.level === 0 && world.round === 0;
        if ((first || Math.random() < 0.25) && !speaking() && canInterrupt()) speak(T('whoosh'));
        break;
      }
      case 'away': break;
      case 'gust': stats.gusts++; PB.Audio.play('gust'); break;
      case 'bird': case 'kite': case 'snow': {
        stats.surprises++;
        PB.Audio.play(e.type === 'bird' ? 'tweet' : e.type === 'kite' ? 'flutter' : 'twinkle');
        if (canInterrupt()) speak(T('surprise.' + e.type));   // queued, never over a protected prompt
        break;
      }
      case 'birdTap': case 'kiteTap': case 'snowTap': {
        const k = e.type.replace('Tap', '');
        stats[k + 'Taps']++;
        PB.Audio.play(k === 'bird' ? 'tweet' : k === 'kite' ? 'flutter' : 'twinkle');
        render.burst('sparkles', e.x, e.y, { n: 8, color: k === 'snow' ? '#FFFFFF' : null });
        const now = performance.now();
        if (now - lastTapSay > 2000 && canInterrupt() && !speaking()) { lastTapSay = now; speak(T(k + '.tap'), { interrupt: true }); }
        break;
      }
      case 'talk': PB.UI.fadeBubble(false); PB.UI.say(''); PB.Audio.setFanfare(false); PB.UI.setDots(world.roundsPerLevel || 4, world.roundsPerLevel || 4); openTalk(e.talk || world.talk); break;
      case 'talkAsk': {   // no answer yet: ask again, and from the 2nd re-ask glow the right answer
        const tk = e.talk || world.talk;
        if (tk && e.n <= 3) speak(T(tk.promptKey, tk.params || {}), { priority: true, interrupt: true });
        if (tk && (e.n >= 2 || e.glowAnswer)) PB.UI.glowTalk(tk.answerId || tk.answer);
        break;
      }
      case 'talkResult': {
        stats.talks++; if (e.correct) stats.talkRight++;
        PB.UI.markTalk(e.choiceId, e.answerId);
        const tk = world.talk, ans = (tk && tk.choices.find(c => c.id === e.answerId)) || {};
        const kind = () => (PB.I18N.talkWrong ? PB.I18N.talkWrong(curLang(), ans, tk) : T('talk.wrong.any'));
        if (e.auto) { speak(kind(), { interrupt: true }); break; }
        if (e.correct) {
          PB.Audio.play('talkRight');
          render.burst('star', view.W / 2, view.H / 2, { onDone: () => { shownStars++; PB.UI.setStars(shownStars, true); PB.Audio.play('star'); } });
          speak(T('talk.right'), { interrupt: true });
        } else {
          PB.Audio.play('gentle');
          speak(kind(), { interrupt: true });
        }
        break;
      }
      case 'levelDone':
        PB.Audio.play('level'); PB.UI.say('');
        if (mode === 'talk') { mode = 'play'; PB.UI.only(); }
        $('stage').classList.remove('talking');
        speak(T('great'));
        break;
      case 'sessionDone': {
        PB.Audio.play('party'); PB.Audio.setFanfare(false);
        if (weather.setParty) weather.setParty(true);
        render.setGallery(pickGallery());
        render.burst('confetti', 0, 0);
        progress.totalStars += e.stars || 0; progress.sessions++;
        PB.Storage.setJSON('progress', progress);
        shownStars = e.stars || shownStars; PB.UI.setStars(shownStars);
        $('doneStars').textContent = e.stars || 0;
        $('doneTitle').textContent = T('session.done', { stars: e.stars || 0 });
        speak(T('party'), { interrupt: true });
        speak(T('session.done', { stars: e.stars || 0 }));
        mode = 'done';
        PB.UI.only('scrDone'); PB.UI.show('hud', false); PB.UI.say('');
        requestAnimationFrame(measureDonePanel);
        if (autoRestart) setTimeout(() => { if (mode === 'done') startGame(); }, 1500 / speed);
        break;
      }
    }
  }
  /** the celebration's bubbles carry one of each friend met this session (animals first), up to 8 */
  function pickGallery() {
    const seen = new Set(), out = [];
    const key = t => t.kind + ':' + (t.animal || t.obj || t.shape || t.n || t.text || '') + ':' + (t.color || '');
    const list = sessionThings.filter(Boolean).slice().sort((a, b) => (b.kind === 'animal') - (a.kind === 'animal'));
    for (const t of list) { const k = key(t); if (seen.has(k)) continue; seen.add(k); out.push(Object.assign({}, t, { big: true })); if (out.length >= 8) break; }
    return out;
  }

  /* ---------- Talk time ---------- */
  function openTalk(talk) {
    if (!talk) return;
    $('stage').classList.add('talking');
    mode = 'talk';
    if (inputCancel && inputCancel.cancel) inputCancel.cancel();
    if (world.cancelDrag) world.cancelDrag();
    const canMic = S.mic && PB.Voice && PB.Voice.canListen && PB.Voice.canListen() && !FLAGS.bot;
    PB.UI.openTalk(talk, curLang(), id => { PB.Audio.play('click'); world.talkAnswer(id); }, canMic, curAge());
    const q = T(talk.promptKey, talk.params || {});
    speakPrompt(T('talk.intro') + ' ' + q, { priority: true });   // queued after the round's praise, not cutting it off
  }
  function listen() {
    const talk = world.talk;
    if (!talk || world.state !== 'talk' || !PB.Voice || !PB.Voice.canListen()) return;
    if (PB.Voice.stop) PB.Voice.stop();
    PB.Audio.play('listen');
    PB.UI.setListening(true, T('ui.listening'));
    const choices = talk.choices.map(c => ({ id: c.id, words: PB.I18N.choiceWords ? PB.I18N.choiceWords(curLang(), c) : [] }));
    PB.Voice.listen({ lang: curLang(), choices, timeoutMs: 6000 }).then(res => {
      PB.UI.setListening(false, T('ui.tapOrSay'));
      if (world.state !== 'talk') return;
      if (res && res.id != null) world.talkAnswer(res.id);
      else if (res && res.reason === 'not-allowed') { $('btnMic').classList.add('hidden'); speak(T('ui.micDenied')); }
      else speak(T('ui.tapOrSay'));
    }).catch(() => PB.UI.setListening(false, T('ui.tapOrSay')));
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
    weather.update(dt * Math.min(speed, 4), {});
    const sp = speaking();
    PB.Audio.duck(sp);
    if (PB.Audio.tick) PB.Audio.tick(dt);
    render.draw(world, weather, { dt: dt * Math.min(speed, 4), lang: curLang(), title: mode === 'title' || mode === 'loading', speaking: sp, done: mode === 'done', debug: FLAGS.debug });
    adapt(raw);
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
  function repeatPrompt() {
    // only while the question can still be answered (never during the blow / a flight: that would cut the right line / count)
    if (!world.interactive || !lastAsk) return;
    PB.Audio.play('click');
    baoMood('talk', 1.0);
    const cp = currentPrompt(); promptUntil = 0; PB.UI.say(cp); speakPrompt(cp, { interrupt: true });
  }
  /** a Bao / speech-bubble tap while the question can be answered (VOICE §1.1 rule 4): never cut a protected prompt, wrong or
   *  count line — queue the question ONCE to follow it; never restart the question while Bao is still saying it */
  function askAgain() {
    if (!world.interactive || !lastAsk) return;
    if (speaking() && lastSpoken === lastPromptText) return;
    if (!canInterrupt()) {
      if (pendingPrompt || promptQueued) return;   // the question is still to come
      const now = performance.now();
      if (now - promptStart < 3000) return;
      promptQueued = true; baoMood('talk', 1.0);
      const cp = currentPrompt(); PB.UI.say(cp); speakPrompt(cp, { priority: true });
      return;
    }
    const since = performance.now() - promptStart;
    const stuck = pendingPrompt && since > 6000;   // the prompt never started (no voice / dropped): don't wait forever
    if (since > 3000 && (!pendingPrompt || stuck)) repeatPrompt();
  }
  function bubbleTap() { askAgain(); }

  function bindUI() {
    PB.Input.kidProof();
    PB.UI.guardScreenClicks();   // a finger held on the canvas never clicks a screen that opens under it (QA-F P2-1)
    // Input passes two NUMBERS in logical px (never a point object) — VOICE §4
    inputCancel = PB.Input.attach($('game'), {
      toLogical,
      down: (x, y) => { if (mode === 'play' && !bot && performance.now() >= inputBlockUntil) world.pointerDown(x, y); },   // judged at once
      move: (x, y) => { if (mode === 'play' && !bot) world.pointerMove(x, y); },   // a quick swipe onto a bubble within 0.25 s
      up: (x, y) => { if (mode === 'play' && !bot) world.pointerUp(x, y); },
      cancel: () => { if (world.cancelDrag) world.cancelDrag(); }
    });
    const unlock = () => { PB.Audio.unlock(); if (PB.Voice) PB.Voice.unlock(); };
    ['touchend', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { capture: true, passive: true }));

    $('btnPlay').addEventListener('click', () => { PB.Audio.play('click'); startGame(); });
    $('bubble').addEventListener('click', bubbleTap);
    $('btnPause').addEventListener('click', () => { PB.Audio.play('click'); pause(); });
    $('btnResume').addEventListener('click', () => { PB.Audio.play('click'); resume(); });
    $('btnHome').addEventListener('click', () => { PB.Audio.play('click'); goTitle(); });
    $('btnAgain').addEventListener('click', () => { PB.Audio.play('click'); startGame(); });
    $('btnDoneHome').addEventListener('click', () => { PB.Audio.play('click'); goTitle(); });
    $('btnMic').addEventListener('click', listen);
    // volume: settings slider + big − / + in the pause menu
    $('optVolume').addEventListener('input', () => { S.volume = +$('optVolume').value / 100; saveSettings(); applyAudio(); });
    $('optVolume').addEventListener('change', () => PB.Audio.play('pop'));
    const vstep = d => { S.volume = Math.max(0, Math.min(1, Math.round(((S.volume == null ? 1 : S.volume) + d) * 20) / 20)); saveSettings(); applyAudio(); PB.Audio.play('pop'); };
    $('btnVolDown').addEventListener('click', () => vstep(-0.1));
    $('btnVolUp').addEventListener('click', () => vstep(0.1));
    document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => {
      S.lang = b.dataset.lang; langOverride = null; saveSettings(); PB.UI.applyLang(curLang()); applyAudio(); PB.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
      updateVoiceInfo();
      PB.Audio.play('click');
      if (mode === 'title') speak(T('ui.welcome'), { interrupt: true });
    }));
    // parent gate: hold the gear for 2 s
    const gear = $('btnParents');
    PB.Input.holdButton(gear, 2000, () => { gear.style.setProperty('--p', 0); openSettings(); },
      p => { gear.style.setProperty('--p', p); gear.classList.toggle('holding', p > 0); });
    gear.addEventListener('click', () => { gear.classList.add('tip'); setTimeout(() => gear.classList.remove('tip'), 1600); });
    PB.UI.bindSettings(S, k => {
      saveSettings();
      if (k === 'sfx' || k === 'music' || k === 'voice') applyAudio();
      if (k === 'age') { ageOverride = null; PB.UI.setTitleInfo(progress.totalStars, curAge(), curLang()); }
      if (k === 'name' && PB.I18N.setChild) PB.I18N.setChild(S.name);
    }, curAge);
    $('btnSettingsDone').addEventListener('click', () => { PB.Audio.play('click'); PB.UI.only('scrTitle'); PB.UI.setTitleInfo(progress.totalStars, curAge(), curLang()); });

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(applySize, 250));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (inputCancel && inputCancel.cancel) inputCancel.cancel(); if (world.cancelDrag) world.cancelDrag(); pause(); PB.Audio.suspend(); if (PB.Voice) PB.Voice.stop(); }
      else PB.Audio.resume();
    });
    window.addEventListener('blur', () => { if (world && world.cancelDrag) world.cancelDrag(); });
  }
  function openSettings() {
    PB.Audio.play('click');
    PB.UI.refreshSettings();
    updateVoiceInfo();
    PB.UI.only('scrSettings');
  }
  function updateVoiceInfo() {
    if (!PB.Voice) return;
    const has = PB.Voice.hasVoice ? PB.Voice.hasVoice(curLang()) : false;
    const nm = PB.Voice.voiceName ? PB.Voice.voiceName(curLang()) : '';
    const mic = PB.Voice.canListen && PB.Voice.canListen();
    const v = has ? (curLang() === 'vi' ? 'Giọng đọc: ' : 'Voice: ') + (nm || '✓') : T('ui.voiceMissing');
    const m = mic ? '' : ' · ' + T('ui.micUnsupported');
    PB.UI.setVoiceInfo(v + m);
  }

  /* ---------- test hooks (DESIGN §5.5) — live getters via defineProperties (never Object.assign) ---------- */
  function hooks() {
    const circ = c => (c ? { x: view.left + c.x * view.s, y: view.top + c.y * view.s, r: (c.r || 0) * view.s, own: (c.own || c.r || 0) * view.s } : null);
    const box = b => (b ? { x: view.left + b.x * view.s, y: view.top + b.y * view.s, w: (b.w || 0) * view.s, h: (b.h || 0) * view.s,
      cx: view.left + (b.cx != null ? b.cx : b.x + b.w / 2) * view.s, cy: view.top + (b.cy != null ? b.cy : b.y + b.h / 2) * view.s } : null);
    const prev = PB.debug || {};
    PB.debug = prev;
    Object.defineProperties(prev, Object.getOwnPropertyDescriptors({
      get world() { return world; }, get weather() { return weather; }, get mode() { return mode; }, stats, events: eventLog,
      get bot() { return bot; },
      get voiceLog() { return (PB.Voice && PB.Voice.log) || []; },
      getState() {
        return { mode, state: world.state, phase: world.phase, level: world.level, topic: world.topic, round: world.round,
          stars: world.stars, misses: world.misses, interactive: world.interactive,
          bubbles: (world.bubbles || []).map(b => ({ id: b.id, state: b.state, target: b.target, fstate: b.fstate, kind: b.thing && b.thing.kind })),
          surprise: world.surprise, weather: weather.ambient && weather.ambient.mood, W: view.W, H: view.H, ins: view.ins, settings: Object.assign({}, S), speed };
      },
      setSpeed(n) { speed = Math.max(0.1, +n || 1); applyAudio(); },
      startGame, goTitle,
      setBot(on, skill) { bot = on ? new PB.Bot(world, { skill: skill == null ? FLAGS.botSkill : skill, seed: 7 }) : null; },
      setAutoRestart(on) { autoRestart = !!on; },
      gotoLevel(i) { world.startLevel(i); },
      view: () => view, render: () => render,
      bubbleScreen(id) { return circ(world.bubbleHit ? world.bubbleHit(id) : null); },
      baoScreen() { return box(world.baoHit ? world.baoHit() : null); },
      birdScreen() { return circ(world.birdHit ? world.birdHit() : null); },
      kiteScreen() { return circ(world.kiteHit ? world.kiteHit() : null); },
      snowScreen() { return circ(world.snowHit ? world.snowHit() : null); },
      answer() { return world.answer ? world.answer() : null; },
      targets() { return world.targets ? world.targets() : []; },
      toScreen(x, y) { return { x: view.left + x * view.s, y: view.top + y * view.s }; },
      audio: () => PB.Audio
    }));
  }

  /* ---------- boot ---------- */
  async function boot() {
    await PB.Storage.init();
    S = Object.assign({}, DEF, PB.Storage.getJSON('settings', {}));
    Object.assign(progress, PB.Storage.getJSON('progress', {}));
    PB.UI.applyLang(curLang());
    if (PB.I18N && PB.I18N.setChild) PB.I18N.setChild(S.name);
    if (PB.Voice) { PB.Voice.init({ lang: curLang(), enabled: voiceOn(), speed }); const prevStart = PB.Voice.onStart; PB.Voice.onStart = d => { onVoiceStart(d); if (prevStart) prevStart(d); }; }
    render = new PB.Renderer($('game')); PB.render = render;
    world = new PB.World({ seed: FLAGS.seed != null ? FLAGS.seed : (Date.now() & 0x7fffffff), age: curAge(), lang: curLang() });
    weather = new PB.Weather({ width: 960, height: 720, seed: 11 });
    weather.windSource = world;   // leaves / petals / snow move with the same gusts as the bubbles (MECHANICS §0.5)
    let popT = 0;
    render.onDonePop = () => { const now = performance.now(); if (now - popT > 120) { popT = now; PB.Audio.play('pop', { soft: true, pitch: 0.9 + Math.random() * 0.4 }); } };
    hooks();
    bindUI();
    applySize();
    weather.setWeather(0, { instant: true });
    await PB.Assets.load();
    render.prewarm(world.layout, 0);
    applyAudio();
    if (FLAGS.bot) bot = new PB.Bot(world, { skill: FLAGS.botSkill, seed: 7 });
    PB.UI.only('scrTitle');
    PB.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
    mode = 'title';
    requestAnimationFrame(frame);
    if (FLAGS.autostart) startGame();
    if (PB.Voice && PB.Voice.onVoicesChanged) PB.Voice.onVoicesChanged(updateVoiceInfo);
  }
  window.addEventListener('DOMContentLoaded', () => boot().catch(e => { console.error(e); }));
})(window.PB = window.PB || {});
