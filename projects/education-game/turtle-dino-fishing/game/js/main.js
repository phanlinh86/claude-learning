/* TL main (Tibo's Dino Lake Fishing) — boots the game, sizes the canvas for any phone / tablet shape, runs the loop and turns
 * world events (fish swim in, the asked fish is tapped, Tibo casts — plop, bite, reel, splash, the fish swings on the line —
 * spots are counted, the fish is released with a leap and a water lily blooms, the others jump for joy) into voice, sound,
 * effects and UI, following the event → line table in docs/VOICE.md §2 (prompts protected, the count run never cut,
 * praise / lily / release lines queued and droppable, hints priority).
 * Touches reach the world only through TL.Input (two numbers in logical px; HUD / bubble / menus never reach the canvas). */
(function (TL) {
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
  const T1 = (key, p) => (TL.I18N ? TL.I18N.t(curLang(), key, Object.assign({ child: S.name || '' }, p || {})) : key);
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
  const saveSettings = () => TL.Storage.setJSON('settings', S);
  const progress = { totalStars: 0, sessions: 0 };

  let world, weather, render, bot = null, inputCancel = null;
  let mode = 'loading';            // loading | title | play | paused | talk | done
  let speed = FLAGS.speed, autoRestart = FLAGS.autorestart;
  let view = { W: 960, H: 720, s: 1, left: 0, top: 0, ins: { top: 0, right: 0, bottom: 0, left: 0 } };
  const stats = { sessions: 0, rounds: 0, swims: 0, correct: 0, wrong: 0, wiggles: 0, soft: 0, hints: 0, assists: 0, counts: 0,
    casts: 0, splashes: 0, releases: 0, lilies: 0, lilyAuto: 0, joys: 0, ponds: 0, talks: 0, talkRight: 0, critters: 0, critterTaps: 0,
    pokes: 0, frames: 0, slowFrames: 0 };
  const eventLog = [];             // the last 300 world events (type + id), for the e2e tests
  let promptUntil = 0, lastWrongSay = -1e9, shownStars = 0, lastPraise = -1e9, lastCritterSay = -1e9;
  let pendingStars = 0, sessionLilies = [], lastCaught = null, countSaid = false;
  let inputBlockUntil = 0;         // canvas presses right after Resume / Play / Play again are ignored (a double tap falls through)
  let lastRight = null;            // the right answer's line + thing: re-said (short) when a pause cut it during the rise
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
  function measureHud() {   // the real DOM HUD in logical px (the bubble is placed BY the world, so it is not a keep-out here)
    const box = (r, pad) => ({ x: (r.left - view.left) / view.s - pad, y: 0, w: r.width / view.s + 2 * pad, h: (r.bottom - view.top) / view.s + pad });
    const h = $('hud').getBoundingClientRect();
    return [h.width > 0 ? box(h, 8) : { x: view.W - view.ins.right - 330, y: 0, w: 330, h: view.ins.top + 100 }];
  }
  function applyTable() {
    const L = world.layout; if (!L) return;
    weather.resize(L.W, L.H, L.surfaceY, L.groundY);
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
    world.setViewport(view.W, view.H, view.ins);    // lake, lanes, lilies, Tibo re-laid; fish move to their new lanes
    if (world.setViewScale) world.setViewScale(view.s);   // the tap-vs-move threshold is 24 CSS px
    applyTable();
    placeBubble();
    updateHudStarTarget();
  }
  function placeBubble() {
    const B = world.layout && world.layout.bubble;
    if (!B) return;
    const r = { x: view.left + B.x * view.s, y: view.top + B.y * view.s, w: B.w * view.s, h: B.h * view.s };
    TL.UI.placeBubble(r);
  }
  function updateHudStarTarget() {
    const p = TL.UI.hudStarPoint();
    if (p.x || p.y) render.hudStar = { x: (p.x - view.left) / view.s, y: (p.y - view.top) / view.s };
  }
  let resizeT = 0;
  function onResize() { clearTimeout(resizeT); resizeT = setTimeout(applySize, 120); }

  /* ---------- voice ---------- */
  const voiceOn = () => S.voice && !FLAGS.novoice && speed <= 1.01 && !FLAGS.mute;
  function speak(text, opt) {
    if (!text) return null;
    lastSpoken = text;
    return TL.Voice ? TL.Voice.say(text, opt || {}) : null;
  }
  const speaking = () => !!(TL.Voice && TL.Voice.isSpeaking && TL.Voice.isSpeaking());
  function applyAudio() {
    const vol = S.volume == null ? 1 : S.volume;
    TL.Audio.setOptions({ sfx: S.sfx, music: S.music, muted: FLAGS.mute, volume: vol });
    if (TL.Voice) { TL.Voice.setLang(curLang()); TL.Voice.setEnabled(voiceOn()); if (TL.Voice.setVolume) TL.Voice.setVolume(vol); if (TL.Voice.setSpeed) TL.Voice.setSpeed(speed); }
    const vl = $('volLevel'); if (vl) vl.textContent = Math.round(vol * 100) + '%';
    const vs = $('optVolume'); if (vs && document.activeElement !== vs) vs.value = Math.round(vol * 100);
  }
  // the instruction is the most important line: praise / hint lines must not cut it off
  let pendingPrompt = null, promptStart = 0;
  const lineMs = txt => 600 + 95 * (txt || '').length;   // voice.js's estimate at rate 0.9
  function speakPrompt(txt, opt) {
    pendingPrompt = txt || null; promptStart = performance.now();
    promptUntil = performance.now() + 6000 + lineMs(txt);
    const p = speak(txt, opt);
    // the line ended (or was dropped / failed) without ever starting: lift the guard so a Tibo tap repeats it
    if (p && p.then) p.then(() => { if (pendingPrompt === txt) { pendingPrompt = null; promptUntil = Math.min(promptUntil, performance.now() + 300); } }, () => {});
    if (!voiceOn()) { pendingPrompt = null; promptUntil = performance.now() + lineMs(txt); }
    return p;
  }
  let talkGateUntil = 0, talkPromptText = '';
  function onVoiceStart(display) {
    if (talkPromptText && display === talkPromptText) { talkGateUntil = performance.now() + 1000; talkPromptText = ''; }
    if (pendingPrompt && display === pendingPrompt) { promptStart = performance.now(); promptUntil = promptStart + lineMs(display); pendingPrompt = null; }
  }
  const canInterrupt = () => performance.now() > promptUntil;
  /** feedback (right / wrong) interrupts — but never the prompt while it is protected (then it queues) */
  const feedback = txt => speak(txt, { interrupt: canInterrupt() });
  /** the wrong line carries the goal ("… which one isn't red?"): protect it like a prompt */
  const protect = txt => { if (txt) promptUntil = Math.max(promptUntil, performance.now() + lineMs(txt)); };

  /* ---------- game flow ---------- */
  function startGame() {
    TL.Audio.unlock();
    world.setAge(curAge()); world.setLang(curLang());
    world.lastTopics = TL.Storage.getJSON('lastTopics', null);   // chapters rotate between sessions
    world.newSession({ lastTopics: world.lastTopics });
    if (world.levels) TL.Storage.setJSON('lastTopics', world.levels);
    if (FLAGS.level != null) world.startLevel(Math.max(0, Math.min(3, FLAGS.level | 0)));
    shownStars = 0; pendingStars = 0; TL.UI.setStars(0); lastAsk = null; lastPromptText = ''; sessionLilies = []; lastRight = null; lastCaught = null;
    blockInput();
    render.clearGallery();
    weather.setParty(false);
    mode = 'play';
    $('stage').classList.remove('talking');
    TL.UI.only(); TL.UI.show('hud'); TL.UI.say('');
    TL.Audio.setMood(world.level || 0); TL.Audio.startMusic(); TL.Audio.setFanfare(false);
    applyAudio();
    stats.sessions++;
    requestAnimationFrame(() => { updateHudStarTarget(); applySize(); });
  }
  function goTitle() {
    mode = 'title';
    $('stage').classList.remove('talking');
    if (TL.Voice) TL.Voice.stop();
    if (inputCancel && inputCancel.cancel) inputCancel.cancel();
    if (world.cancelDrag) world.cancelDrag();
    TL.Audio.stopMusic();
    TL.UI.only('scrTitle'); TL.UI.show('hud', false); TL.UI.say('');
    TL.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
    weather.setWeather(0, {}); weather.setParty(false);
  }
  function pause() {
    if (mode !== 'play' && mode !== 'talk') return;
    mode = 'paused';
    $('stage').classList.remove('talking');   // the HUD steps back under the pause menu (functional QA P3-1)
    if (inputCancel && inputCancel.cancel) inputCancel.cancel();
    if (world.cancelDrag) world.cancelDrag();
    if (TL.Voice) { TL.Voice.stop(); if (TL.Voice.stopListening) TL.Voice.stopListening(); }
    TL.Audio.stopMusic();
    TL.UI.only('scrPause');
  }
  function resume() {
    if (mode !== 'paused') return;
    mode = world.state === 'talk' ? 'talk' : 'play';
    if (mode === 'talk') $('stage').classList.add('talking');
    blockInput();
    if (world.resetNudges) world.resetNudges();
    TL.UI.only(mode === 'talk' ? 'scrTalk' : undefined);
    TL.Audio.startMusic();
    // say the question again so a returning child knows what to do
    if (mode === 'talk' && world.talk && !world.talkAnswered) speak(T(world.talk.promptKey, world.talk.params || {}), { priority: true });
    else if (world.interactive) setTimeout(repeatPrompt, 300);
    else if (world.state === 'round' && (world.phase === 'cast' || world.phase === 'reel' || world.phase === 'show') && lastRight) {
      // the pause cut the right line: say just the caught fish's name again
      const t = lastRight.name;
      if (t) { TL.UI.say(t); speak(t, { priority: true }); }
    }
  }

  let lastPromptText = '', lastAsk = null, lastRound = null;
  function currentPrompt() {   // prompts have several wordings: repeat the one Tibo said, word for word
    if (lastPromptText) return lastPromptText;
    const p = world.prompt ? world.prompt() : null;
    return p ? askText(Object.assign({ first: true }, p)) : '';
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
  const memberOf = id => (world.memberById ? world.memberById(id) : null);
  /** the event + what main knows (VOICE §1): the chapter topic, the round's prompt key / params / rule, the member's thing */
  function ev2(e) {
    const c = world.cur, m = memberOf(e.id);
    return Object.assign({ topic: world.topic, promptKey: c ? c.promptKey : (lastAsk && lastAsk.promptKey), params: c ? c.params : (lastAsk && lastAsk.params),
      rule: c ? c.rule : (lastAsk && lastAsk.rule) }, e, { thing: e.thing || (m && m.thing) || undefined });
  }
  function line(fn, e, fallbackKey) {
    const I = TL.I18N;
    if (I && typeof I[fn] === 'function') { try { const t = I[fn](curLang(), e); if (t) return t; } catch (err) { /* fall back */ } }
    return fallbackKey ? T(fallbackKey) : '';
  }
  function tiboMood(m, t) { if (world.tibo) { world.tibo.mood = m; world.tibo.moodT = t; } }
  function askText(e) {
    const I = TL.I18N;
    if (I && I.ask) { try { return I.ask(curLang(), e.promptKey, Object.assign({ child: S.name || '' }, e.params || {}), { first: !!e.first }); } catch (err) { /* fall back */ } }
    return T(e.promptKey, e.params || {});
  }
  function flyStars(n, x, y) {
    for (let i = 0; i < n; i++) {
      render.burst('star', x + (i - (n - 1) / 2) * 60, y, { delay: 0.1 + i * 0.2, onDone: () => { shownStars++; TL.UI.setStars(shownStars, true); TL.Audio.play('star', { i }); } });
    }
  }
  function flushStars() {   // stars still waiting (rotation, skip): fly them now from Tibo
    if (pendingStars > 0) { const c = world.layout.tibo; flyStars(pendingStars, c.x, c.y - c.h * 0.7); pendingStars = 0; }
  }

  function onEvent(e) {
    const L = world.layout;
    switch (e.type) {
      case 'level': {
        const wi = (e.weather != null ? e.weather : e.level) % 4;
        weather.setWeather(wi, {});
        TL.Audio.setMood(wi); TL.Audio.play('chapter');
        TL.UI.setDots(world.roundsPerLevel || 4, 0);
        speak(T('ui.chapter', { n: e.level + 1 }) + '. ' + T('topic.' + e.topic), { interrupt: canInterrupt(), priority: !canInterrupt() });
        speak(T('weather.' + wi));
        TL.UI.say('');
        render.prewarm(world.layout, wi, world.age);
        break;
      }
      case 'round': {
        flushStars();
        TL.UI.fadeBubble(false); TL.Audio.setFanfare(false);
        stats.rounds++; lastAsk = null; lastPromptText = '';
        TL.UI.setDots(world.roundsPerLevel || 4, e.round % (world.roundsPerLevel || 4));
        TL.UI.say(T('enter'));   // shown, not spoken: the prompt follows in a moment
        break;
      }
      case 'enterSwim': stats.swims++; TL.Audio.play('swim'); break;
      case 'ask': {
        lastAsk = e; TL.UI.fadeBubble(false); roundMissed = false; hintBySay = false; countSaid = false;
        const txt = askText(Object.assign({}, e, { first: !!e.first && e.round === 0 }));
        lastPromptText = txt;
        TL.UI.say(txt); speakPrompt(txt, { priority: true });
        break;
      }
      case 'assist': stats.assists++; break;   // a 'right' event follows
      case 'right': {
        stats.correct++;
        promptUntil = 0; pendingPrompt = null;
        const m = memberOf(e.id), th = e.thing || (m && m.thing) || {};
        lastCaught = th;
        TL.Audio.play('right');
        render.burst('sparkles', e.x, e.y, { n: 14, color: th.color, gold: !th.color });
        const txt = line('sayRight', ev2(Object.assign({}, e, { thing: th })), 'praise');
        let nm = ''; try { nm = TL.I18N.sayName(curLang(), th) || ''; } catch (err) { nm = ''; }
        lastRight = { text: txt, name: nm ? nm.charAt(0).toUpperCase() + nm.slice(1) + '!' : txt };
        feedback(txt); protect(txt);
        TL.UI.say(txt);
        // landscape: the line flies out over the lake and may pass behind the bubble — fade it until the next question
        if (!L.portrait) TL.UI.fadeBubble(true);
        break;
      }
      case 'cast': stats.casts++; TL.Audio.play('cast'); break;
      case 'plop': TL.Audio.play('plop'); weather.addDrops(e.x, e.y, 4); break;
      case 'bite': TL.Audio.play('bite'); if (!speaking() && canInterrupt()) speak(T('bite')); break;
      case 'reel': TL.Audio.play('reel'); break;
      case 'surface': break;
      case 'splash': {
        stats.splashes++;
        TL.Audio.play('splash', { big: !!e.big });
        weather.addDrops(e.x, e.y, e.big ? 12 : 5);
        break;
      }
      case 'show': TL.Audio.play('show'); break;
      case 'count': {   // one spot lights up: a rising pip + the numeral; the words are ONE protected run at the first spot
        stats.counts++;
        TL.Audio.play('pip', { i: e.i });
        render.burst('count', e.x, e.y - 74, { n: e.i });
        const th = lastCaught || {}, n = e.n || (th.mark && th.mark.n) || (world.cur && world.cur.rule && world.cur.rule.value) || 1;
        if (!countSaid) {
          countSaid = true;
          const run = TL.I18N.sayCountRun ? TL.I18N.sayCountRun(curLang(), n) : String(n);
          speak(run, { priority: true });
          promptUntil = performance.now() + 900 + 650 * n;
        }
        // the bubble counts along with the spots (1 → 1, 2 → …), the whole run once the last spot lights
        if (e.i >= n && TL.I18N.sayCountRun) TL.UI.say(TL.I18N.sayCountRun(curLang(), n));
        else TL.UI.say(Array.from({ length: e.i }, (_, k) => k + 1).join(', ') + '…');
        break;
      }
      case 'home': TL.Audio.play('badge'); break;
      case 'roundDone': {
        TL.Audio.play('complete');
        pendingStars += e.stars || 1;
        flyStars(pendingStars, L.tibo.x, L.tibo.y - L.tibo.h * 0.7); pendingStars = 0;
        TL.UI.setDots(world.roundsPerLevel || 4, ((e.round != null ? e.round : world.round) % (world.roundsPerLevel || 4)) + 1);
        lastRound = { round: e.round != null ? e.round : world.round, stars: e.stars || 0, missed: roundMissed || (e.misses || 0) > 0 };
        break;
      }
      case 'release': stats.releases++; TL.Audio.play('whee'); break;
      case 'dive': {
        TL.Audio.play('splash', { big: true });
        const th = lastCaught || {};
        // "Bye bye, little fish!" now and then, not every round (playtest P3)
        if (!speaking() && canInterrupt() && (world.round % (world.roundsPerLevel || 4) === 0 || Math.random() < 0.3)) speak(T(th.kind === 'bubble' ? 'releaseFriend' : 'release'));
        break;
      }
      case 'lily': {
        stats.lilies++; if (e.auto) stats.lilyAuto++;
        TL.Audio.play('lily');
        weather.burst(e.x, e.y, { kind: 'sparkle', n: 8 });
        render.burst('ring', e.x, e.y, { size: 110, rgb: '255,246,210', life: 0.5 });
        if (!e.auto) sessionLilies.push({ color: e.color || null });
        if (!e.auto && (world.round % (world.roundsPerLevel || 4) === 0 || !speaking())) speak(T('lily'));
        break;
      }
      case 'joy': {
        stats.joys++;
        TL.Audio.play('joy', { i: e.i, n: e.n });
        if (e.i === 0) {
          const lr = lastRound || {}, last = (lr.round % (world.roundsPerLevel || 4)) === (world.roundsPerLevel || 4) - 1;
          if ((lr.missed || last) && performance.now() - lastPraise > 1200) { lastPraise = performance.now(); speak(T(lr.stars >= 3 ? 'great' : 'praise')); }
          else if (!speaking() && canInterrupt()) speak(T('joy'));
        }
        break;
      }
      case 'leave': TL.Audio.play('swim'); break;
      case 'pondFull': {
        stats.ponds++;
        TL.Audio.play('pond');
        for (const q of (world.lilies || [])) weather.burst(q.x, q.y - 20, { kind: 'stars', n: 3 });
        speak(T('pond'));
        break;
      }
      case 'wrong': {
        stats.wrong++;
        TL.Audio.play('boop');
        roundMissed = true;
        const now = performance.now();
        if (now - lastWrongSay > 1500) {
          lastWrongSay = now;
          const m = memberOf(e.id), ee = ev2(Object.assign({}, e, { thing: (m && m.thing) || e.thing }));
          const say = () => (e.hint ? line('sayWrongHint', ee, 'hint') : line('sayWrong', ee, 'hint'));
          let wt = say();
          for (let k = 0; k < 3 && wt === lastSpoken; k++) wt = say();
          if (e.hint) hintBySay = true;
          feedback(wt); protect(wt); TL.UI.say(wt);
        }
        break;
      }
      case 'wiggle': stats.wiggles++; TL.Audio.play('wiggle'); break;
      case 'soft': stats.soft++; TL.Audio.play(e.kind === 'water' ? 'bloop' : 'puff'); break;
      case 'hint': {
        stats.hints++;
        TL.Audio.play('hint');
        if (!e.idle && !hintBySay) speak(T('hint'), { priority: true });
        hintBySay = false;
        break;
      }
      case 'assistArmed': TL.Audio.play('hint'); break;
      case 'idle': {
        if (e.n <= 4) {
          const cp = currentPrompt();
          let il = T1('idle') + ' ' + cp;
          for (let k = 0; k < 3 && il === lastSpoken; k++) il = T1('idle') + ' ' + cp;
          speak(il);
        } else if (!bot) pause();
        break;
      }
      case 'pokeTibo': {
        stats.pokes++;
        TL.Audio.play('giggle');
        if (e.busy || !world.interactive || !lastAsk) { if (!speaking() && canInterrupt()) speak(T('tibo.poke')); break; }
        if (speaking() && lastSpoken === lastPromptText) break;
        const since = performance.now() - promptStart;
        const stuck = pendingPrompt && since > 6000;
        if (since > 3000 && (!pendingPrompt || stuck)) repeatPrompt();
        break;
      }
      case 'critter': {
        stats.critters++;
        TL.Audio.play({ ptero: 'chirp', bronto: 'honk', frog: 'ribbit', fireflies: 'twinkle' }[e.kind] || 'twinkle');
        if (canInterrupt()) speak(T('surprise.' + e.kind));
        break;
      }
      case 'critterTap': {
        stats.critterTaps++;
        TL.Audio.play({ ptero: 'chirp', bronto: 'spray', frog: 'ribbit', fireflies: 'twinkle' }[e.kind] || 'twinkle');
        if (e.spray) weather.addDrops(e.spray.x, e.spray.y, 14);
        render.burst('sparkles', e.x, e.y, { n: 8, gold: true });
        const now = performance.now();
        if (now - lastCritterSay > 2000 && canInterrupt()) { lastCritterSay = now; speak(T('critter.' + e.kind), { interrupt: !speaking() }); }
        break;
      }
      case 'talk': flushStars(); TL.UI.fadeBubble(false); TL.UI.say(''); TL.Audio.setFanfare(false); TL.UI.setDots(world.roundsPerLevel || 4, world.roundsPerLevel || 4); openTalk(e.talk || world.talk); break;
      case 'talkAsk': {
        const tk = e.talk || world.talk;
        if (tk && e.n <= 3) speak(T(tk.promptKey, tk.params || {}), { priority: true, interrupt: true });
        if (tk && (e.n >= 2 || e.glowAnswer)) TL.UI.glowTalk(tk.answerId || tk.answer);
        break;
      }
      case 'talkResult': {
        stats.talks++; if (e.correct) stats.talkRight++;
        TL.UI.markTalk(e.choiceId, e.answerId);
        const tk = world.talk, ans = (tk && tk.choices.find(c => c.id === e.answerId)) || {};
        const kind = () => (TL.I18N.talkWrong ? TL.I18N.talkWrong(curLang(), ans, tk) : T('talk.wrong.any'));
        if (e.auto) { speak(kind(), { interrupt: true }); break; }
        if (e.correct) {
          TL.Audio.play('talkRight');
          render.burst('star', view.W / 2, view.H / 2, { onDone: () => { shownStars++; TL.UI.setStars(shownStars, true); TL.Audio.play('star'); } });
          speak(T('talk.right'), { interrupt: true });
        } else {
          TL.Audio.play('soft');
          speak(kind(), { interrupt: true });
        }
        break;
      }
      case 'levelDone':
        flushStars();
        TL.Audio.play('level'); TL.UI.say('');
        if (mode === 'talk') { mode = 'play'; TL.UI.only(); }
        $('stage').classList.remove('talking');
        speakPrompt(T('great'));
        break;
      case 'sessionDone': {
        TL.Audio.play('party'); TL.Audio.setFanfare(false);
        weather.setParty(true);
        render.setGallery(sessionLilies.slice());
        render.burst('confetti', 0, 0);
        progress.totalStars += e.stars || 0; progress.sessions++;
        TL.Storage.setJSON('progress', progress);
        shownStars = e.stars || shownStars; TL.UI.setStars(shownStars);
        $('doneStars').textContent = e.stars || 0;
        $('doneTitle').textContent = T('session.done', { stars: e.stars || 0 });
        speak(T('party'), { interrupt: canInterrupt(), priority: !canInterrupt() });
        speak(T('session.done', { stars: e.stars || 0 }));
        mode = 'done';
        TL.UI.only('scrDone'); TL.UI.show('hud', false); TL.UI.say('');
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
    const canMic = S.mic && TL.Voice && TL.Voice.canListen && TL.Voice.canListen() && !FLAGS.bot;
    // choices answer only once the question has started + 1 s (a finger still mashing from the last clear never answers it)
    talkGateUntil = voiceOn() ? performance.now() + 8000 : 0;
    TL.UI.openTalk(talk, curLang(), id => {
      if (performance.now() < talkGateUntil || world.state !== 'talk' || world.talkAnswered || !world.talkOpen()) return;
      TL.Audio.play('click'); world.talkAnswer(id);
    }, canMic, curAge());
    const q = T(talk.promptKey, talk.params || {});
    talkPromptText = T('talk.intro') + ' ' + q;
    const tp = speakPrompt(talkPromptText, { priority: true });   // queued after the round's praise, not cutting it off
    const asked = talkPromptText;   // dropped / failed without ever starting: open the choices now
    if (tp && tp.then) tp.then(() => { if (talkPromptText === asked) { talkPromptText = ''; talkGateUntil = 0; } }, () => { if (talkPromptText === asked) { talkPromptText = ''; talkGateUntil = 0; } });
  }
  function listen() {
    const talk = world.talk;
    if (!talk || world.state !== 'talk' || !TL.Voice || !TL.Voice.canListen()) return;
    if (TL.Voice.stop) TL.Voice.stop();
    TL.Audio.play('listen');
    TL.UI.setListening(true, T('ui.listening'));
    const choices = talk.choices.map(c => ({ id: c.id, words: TL.I18N.choiceWords ? TL.I18N.choiceWords(curLang(), c) : [] }));
    TL.Voice.listen({ lang: curLang(), choices, timeoutMs: 6000 }).then(res => {
      TL.UI.setListening(false, T('ui.tapOrSay'));
      if (world.state !== 'talk') return;
      if (res && res.id != null) world.talkAnswer(res.id);
      else if (res && res.reason === 'not-allowed') { $('btnMic').classList.add('hidden'); speak(T('ui.micDenied')); }
      else speak(T('ui.tapOrSay'));
    }).catch(() => TL.UI.setListening(false, T('ui.tapOrSay')));
  }

  let boxCache = null, boxT = 0;
  function domBoxes() {   // the title's ▶ and star pill in logical px (the title fish keep clear of them)
    const now = performance.now();
    if (boxCache && now - boxT < 500 && boxCache.mode === mode) return boxCache;
    boxT = now;
    const conv = el => { if (!el) return null; const r = el.getBoundingClientRect(); if (!r.width) return null; return { x: (r.left - view.left) / view.s, y: (r.top - view.top) / view.s, w: r.width / view.s, h: r.height / view.s }; };
    boxCache = { mode, title: mode === 'title' ? [conv($('btnPlay')), conv(document.querySelector('.title-info')), conv($('tagline')), conv(document.querySelector('.logo'))].filter(Boolean) : null,
      done: mode === 'done' ? conv(document.querySelector('#scrDone .done-panel')) : null };
    return boxCache;
  }
  /* ---------- loop ---------- */
  let last = 0, slowAcc = 0, fastT = 0, pendingResize = false;
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
    TL.Audio.duck(sp);
    if (TL.Audio.tick) TL.Audio.tick(dt);
    render.draw(world, weather, { boxes: domBoxes(), dt: dt * Math.min(speed, 4), lang: curLang(), title: mode === 'title' || mode === 'loading', speaking: sp, done: mode === 'done', debug: FLAGS.debug });
    adapt(raw);
  }
  function adapt(raw) {  // adaptive quality: step the render scale down when frames stay slow
    if (raw > 0.5) return;
    if (raw > 0.022) { slowAcc += raw; stats.slowFrames++; fastT = 0; } else { slowAcc = Math.max(0, slowAcc - raw * 0.5); fastT += raw; }
    // only the backing store changes: World.setViewport would cancel the child's gesture
    if (slowAcc > 1.5 && quality > 0.6) { quality *= 0.85; render.quality = Math.max(0.5, quality); slowAcc = 0; fastT = 0; pendingResize = true; }
    // and it steps back up after 8 s without a slow frame (playtest P2: a hiccup must not leave it blurry for good)
    else if (fastT > 8 && quality < 1) { quality = Math.min(1, quality / 0.85); render.quality = quality; fastT = 0; pendingResize = true; }
  }

  /* ---------- input ---------- */
  function toLogical(cx, cy) { return { x: (cx - view.left) / view.s, y: (cy - view.top) / view.s }; }
  function repeatPrompt() {
    // only while the question can still be answered (never in enter / cast / reel: that would cut the right line / the count run)
    if (!world.interactive || !lastAsk) return;
    TL.Audio.play('click');
    tiboMood('talk', 1.0);
    const cp = currentPrompt(); promptUntil = 0; TL.UI.say(cp); speakPrompt(cp, { interrupt: true });
  }
  function bubbleTap() { if (world.interactive) repeatPrompt(); }

  function bindUI() {
    TL.Input.kidProof();
    // Input passes two NUMBERS in logical px (never a point object) — VOICE §5
    inputCancel = TL.Input.attach($('game'), {
      toLogical,
      down: (x, y) => { if (mode === 'play' && !bot && performance.now() >= inputBlockUntil) world.pointerDown(x, y); },   // judged at once (moving fish)
      move: (x, y) => { if (mode === 'play' && !bot) world.pointerMove(x, y); },   // a slide onto a fish within 0.25 s
      up: (x, y) => { if (mode === 'play' && !bot) world.pointerUp(x, y); },
      cancel: () => { if (world.cancelDrag) world.cancelDrag(); }
    });
    const unlock = () => { TL.Audio.unlock(); if (TL.Voice) TL.Voice.unlock(); };
    ['touchend', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { capture: true, passive: true }));

    $('btnPlay').addEventListener('click', () => { TL.Audio.play('click'); startGame(); });
    $('bubble').addEventListener('click', bubbleTap);
    $('btnPause').addEventListener('click', () => { TL.Audio.play('click'); pause(); });
    $('btnResume').addEventListener('click', () => { TL.Audio.play('click'); resume(); });
    $('btnHome').addEventListener('click', () => { TL.Audio.play('click'); goTitle(); });
    $('btnAgain').addEventListener('click', () => { TL.Audio.play('click'); startGame(); });
    $('btnDoneHome').addEventListener('click', () => { TL.Audio.play('click'); goTitle(); });
    $('btnMic').addEventListener('click', listen);
    // volume: settings slider + big − / + in the pause menu
    $('optVolume').addEventListener('input', () => { S.volume = +$('optVolume').value / 100; saveSettings(); applyAudio(); });
    $('optVolume').addEventListener('change', () => TL.Audio.play('pop'));
    const vstep = d => { S.volume = Math.max(0, Math.min(1, Math.round(((S.volume == null ? 1 : S.volume) + d) * 20) / 20)); saveSettings(); applyAudio(); TL.Audio.play('pop'); };
    $('btnVolDown').addEventListener('click', () => vstep(-0.1));
    $('btnVolUp').addEventListener('click', () => vstep(0.1));
    document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => {
      S.lang = b.dataset.lang; langOverride = null; saveSettings(); TL.UI.applyLang(curLang()); applyAudio(); TL.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
      updateVoiceInfo();
      TL.Audio.play('click');
      if (mode === 'title') speak(T('ui.welcome'), { interrupt: true });
    }));
    // parent gate: hold the gear for 2 s
    const gear = $('btnParents');
    TL.Input.holdButton(gear, 2000, () => { gear.style.setProperty('--p', 0); openSettings(); },
      p => { gear.style.setProperty('--p', p); gear.classList.toggle('holding', p > 0); });
    gear.addEventListener('click', () => { gear.classList.add('tip'); setTimeout(() => gear.classList.remove('tip'), 1600); });
    TL.UI.bindSettings(S, k => {
      saveSettings();
      if (k === 'sfx' || k === 'music' || k === 'voice') applyAudio();
      if (k === 'age') { ageOverride = null; TL.UI.setTitleInfo(progress.totalStars, curAge(), curLang()); }
      if (k === 'name' && TL.I18N.setChild) TL.I18N.setChild(S.name);
    }, curAge);
    $('btnSettingsDone').addEventListener('click', () => { TL.Audio.play('click'); TL.UI.only('scrTitle'); TL.UI.setTitleInfo(progress.totalStars, curAge(), curLang()); });

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(applySize, 250));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (inputCancel && inputCancel.cancel) inputCancel.cancel(); if (world.cancelDrag) world.cancelDrag(); pause(); TL.Audio.suspend(); if (TL.Voice) TL.Voice.stop(); }
      else TL.Audio.resume();
    });
    window.addEventListener('blur', () => { if (world && world.cancelDrag) world.cancelDrag(); });
  }
  function openSettings() {
    TL.Audio.play('click');
    TL.UI.refreshSettings();
    updateVoiceInfo();
    TL.UI.only('scrSettings');
  }
  function updateVoiceInfo() {
    if (!TL.Voice) return;
    const has = TL.Voice.hasVoice ? TL.Voice.hasVoice(curLang()) : false;
    const nm = TL.Voice.voiceName ? TL.Voice.voiceName(curLang()) : '';
    const mic = TL.Voice.canListen && TL.Voice.canListen();
    const v = has ? (curLang() === 'vi' ? 'Giọng đọc: ' : 'Voice: ') + (nm || '✓') : T('ui.voiceMissing');
    const m = mic ? '' : ' · ' + T('ui.micUnsupported');
    TL.UI.setVoiceInfo(v + m);
  }

  /* ---------- test hooks (DESIGN §5.5) — live getters via defineProperties (never Object.assign) ---------- */
  function hooks() {
    const circ = c => (c ? { x: view.left + c.x * view.s, y: view.top + c.y * view.s, r: (c.r || 0) * view.s, kind: c.kind, i: c.i } : null);
    const box = b => (b ? { x: view.left + b.x * view.s, y: view.top + b.y * view.s, w: (b.w || 0) * view.s, h: (b.h || 0) * view.s,
      cx: view.left + (b.cx != null ? b.cx : b.x + b.w / 2) * view.s, cy: view.top + (b.cy != null ? b.cy : b.y + b.h / 2) * view.s } : null);
    const prev = TL.debug || {};
    TL.debug = prev;
    Object.defineProperties(prev, Object.getOwnPropertyDescriptors({
      get world() { return world; }, get weather() { return weather; }, get mode() { return mode; }, stats, events: eventLog,
      get bot() { return bot; },
      get voiceLog() { return (TL.Voice && TL.Voice.log) || []; },
      getState() {
        return { mode, state: world.state, phase: world.phase, level: world.level, topic: world.topic, round: world.round,
          stars: world.stars, misses: world.misses, lilies: (world.lilies || []).filter(q => q.open > 0.5).length,
          members: (world.members || []).map(m => ({ id: m.id, state: m.state, target: m.target, kind: m.thing && m.thing.kind })),
          surprise: world.surprise, critter: world.critter ? world.critter.kind + ':' + world.critter.state : null,
          weather: weather.ambient && weather.ambient.mood, W: view.W, H: view.H, ins: view.ins, settings: Object.assign({}, S), speed };
      },
      setSpeed(n) { speed = Math.max(0.1, +n || 1); applyAudio(); },
      startGame, goTitle,
      setBot(on, skill) { bot = on ? new TL.Bot(world, { skill: skill == null ? FLAGS.botSkill : skill, seed: 7 }) : null; },
      setAutoRestart(on) { autoRestart = !!on; },
      gotoLevel(i) { world.startLevel(i); },
      view: () => view, render: () => render,
      memberScreen(id) { return circ(world.memberHit ? world.memberHit(id) : null); },
      tiboScreen() { return box(world.tiboHit ? world.tiboHit() : null); },
      critterScreen() { return circ(world.critterHit ? world.critterHit() : null); },
      answer() { return world.answer ? world.answer() : null; },
      toScreen(x, y) { return { x: view.left + x * view.s, y: view.top + y * view.s }; },
      audio: () => TL.Audio
    }));
  }

  /* ---------- boot ---------- */
  async function boot() {
    await TL.Storage.init();
    S = Object.assign({}, DEF, TL.Storage.getJSON('settings', {}));
    Object.assign(progress, TL.Storage.getJSON('progress', {}));
    TL.UI.applyLang(curLang());
    if (TL.I18N && TL.I18N.setChild) TL.I18N.setChild(S.name);
    if (TL.Voice) { TL.Voice.init({ lang: curLang(), enabled: voiceOn(), speed }); const prevStart = TL.Voice.onStart; TL.Voice.onStart = d => { onVoiceStart(d); if (prevStart) prevStart(d); }; }
    render = new TL.Renderer($('game')); TL.render = render;
    world = new TL.World({ seed: FLAGS.seed != null ? FLAGS.seed : (Date.now() & 0x7fffffff), age: curAge(), lang: curLang() });
    weather = new TL.Weather({ width: 960, height: 720, seed: 11, surfaceY: 288, groundY: 706 });
    hooks();
    bindUI();
    applySize();
    weather.setWeather(0, { instant: true });
    await TL.Assets.load();
    render.prewarm(world.layout, 0, curAge());
    applyAudio();
    if (FLAGS.bot) bot = new TL.Bot(world, { skill: FLAGS.botSkill, seed: 7 });
    TL.UI.only('scrTitle');
    TL.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
    mode = 'title';
    requestAnimationFrame(frame);
    if (FLAGS.autostart) startGame();
    if (TL.Voice && TL.Voice.onVoicesChanged) TL.Voice.onVoicesChanged(updateVoiceInfo);
  }
  window.addEventListener('DOMContentLoaded', () => boot().catch(e => { console.error(e); }));
})(window.TL = window.TL || {});
