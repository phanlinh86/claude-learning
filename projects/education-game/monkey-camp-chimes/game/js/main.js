/* CC main (Kiki's Camp Chimes) — boots the game, sizes the canvas for any phone/tablet shape, runs the loop and turns
 * world events (a chime is struck and rings, the right note flies up and lights a lantern, the bells are counted, the
 * song cascades, Kiki dances) into voice, sound, effects and UI, following the event → line table in docs/VOICE.md §1.1.
 * Touches reach the world only through CC.Input (HUD / bubble / menus never reach the canvas). */
(function (CC) {
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
  const T1 = (key, p) => (CC.I18N ? CC.I18N.t(curLang(), key, Object.assign({ child: S.name || '' }, p || {})) : key);
  // never the same wording twice in a row: re-roll a variant that repeats the line just spoken
  const T = (key, p) => { let r = T1(key, p); for (let k = 0; k < 3 && r && r === lastSpoken; k++) r = T1(key, p); return r; };

  /* ---------- settings (URL flags never saved) ---------- */
  const DEF = { age: 4, lang: (navigator.language || 'en').toLowerCase().startsWith('vi') ? 'vi' : 'en', name: '', sfx: true, music: true, voice: true, mic: true, volume: 1 };
  let S = Object.assign({}, DEF);
  let langOverride = FLAGS.lang === 'vi' || FLAGS.lang === 'en' ? FLAGS.lang : null;   // URL ?lang= is session-only
  const curLang = () => langOverride || S.lang;
  // URL ?age= is session-only; a parent's pick wins. Normalised like the world (CC.Content.ageOf: round, clamp 3–7) so the
  // title shows the age that is really played (functional B1)
  let ageOverride = FLAGS.age ? Math.max(3, Math.min(7, Math.round(FLAGS.age))) : null;
  const curAge = () => ageOverride || S.age;
  const saveSettings = () => CC.Storage.setJSON('settings', S);
  const progress = { totalStars: 0, sessions: 0 };

  let world, weather, render, bot = null, inputCancel = null;
  let mode = 'loading';            // loading | title | play | paused | talk | done
  let speed = FLAGS.speed, autoRestart = FLAGS.autorestart;
  let view = { W: 960, H: 720, s: 1, left: 0, top: 0, ins: { top: 0, right: 0, bottom: 0, left: 0 } };
  const stats = { sessions: 0, rounds: 0, rings: 0, brushes: 0, correct: 0, wrong: 0, soft: 0, hints: 0, assists: 0, counts: 0,
    lanterns: 0, songs: 0, songAuto: 0, talks: 0, talkRight: 0, hedgehogTaps: 0, birdTaps: 0, fireflyTaps: 0, frames: 0, slowFrames: 0 };
  const eventLog = [];             // the last 300 world events (type + id), for the e2e tests
  let promptUntil = 0, lastWrongSay = -1e9, idleSaid = 0, shownStars = 0, lastPraise = -1e9, lastPopSay = -1e9;   // -1e9: never rate-limited at load
  let lastNamed = { id: null, t: -1e9 };

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
  function measureHud() {   // the real DOM HUD and speech bubble in logical px, as TWO boxes (never one merged box)
    const box = (r, pad) => ({ x: (r.left - view.left) / view.s - pad, y: 0, w: r.width / view.s + 2 * pad, h: (r.bottom - view.top) / view.s + pad });
    const h = $('hud').getBoundingClientRect(), b = $('bubble').getBoundingClientRect();
    const out = [h.width > 0 ? box(h, 8) : { x: view.W - view.ins.right - 330, y: 0, w: 330, h: view.ins.top + 100 }];
    if (b.width > 0) out.push(box(b, 6));
    return out;
  }
  function applySize() {
    const prev = view;
    view = computeView();
    // rotation mid-gesture: the finger's old logical point is meaningless now → the gesture ends
    if (world && (prev.W !== view.W || prev.H !== view.H)) { if (inputCancel && inputCancel.cancel) inputCancel.cancel(); if (world.cancelDrag) world.cancelDrag(); }
    const rs = renderScale();
    const c = $('game');
    c.style.width = view.cssW + 'px'; c.style.height = view.cssH + 'px';
    c.style.left = view.left + 'px'; c.style.top = view.top + 'px';
    render.resize(view.W, view.H, rs);
    world.tapMoveMin = Math.max(24, 18 / view.s);   // ≈ 18 pt of finger wobble is still a tap on small phones
    world.setViewport(view.W, view.H, view.ins);    // beam, hooks, garland and Kiki re-laid
    placeBubble();
    world.hudKeep = measureHud();                   // the real HUD (CSS px) may reach lower than the logical keep-out
    world.setViewport(view.W, view.H, view.ins);
    weather.resize(view.W, view.H, world.layout && world.layout.groundY);
    const F = world.layout && world.layout.fire;
    if (F && weather.fireAt) weather.fireAt(F.x, F.y - 30 * (F.s || 1));   // embers rise from the campfire
    placeBubble();
    updateHudStarTarget();
  }
  function placeBubble() {
    const B = world.layout && world.layout.bubble;
    if (!B) return;
    // the world already moved / narrowed the bubble beside or below the measured HUD (computeLayout + hudKeep)
    const r = { x: view.left + B.x * view.s, y: view.top + B.y * view.s, w: B.w * view.s, h: B.h * view.s };
    CC.UI.placeBubble(r);
  }
  function updateHudStarTarget() {
    const p = CC.UI.hudStarPoint();
    if (p.x || p.y) render.hudStar = { x: (p.x - view.left) / view.s, y: (p.y - view.top) / view.s };
  }
  let resizeT = 0;
  function onResize() { clearTimeout(resizeT); resizeT = setTimeout(applySize, 120); }

  /* ---------- voice ---------- */
  const voiceOn = () => S.voice && !FLAGS.novoice && speed <= 1.01 && !FLAGS.mute;
  function speak(text, opt) {
    if (!text) return null;
    lastSpoken = text;
    return CC.Voice ? CC.Voice.say(text, opt || {}) : null;
  }
  const speaking = () => !!(CC.Voice && CC.Voice.isSpeaking && CC.Voice.isSpeaking());
  function applyAudio() {
    CC.Audio.setOptions({ sfx: S.sfx, music: S.music, muted: FLAGS.mute, volume: S.volume == null ? 1 : S.volume });
    if (CC.Voice) { CC.Voice.setLang(curLang()); CC.Voice.setEnabled(voiceOn()); if (CC.Voice.setVolume) CC.Voice.setVolume(S.volume == null ? 1 : S.volume); if (CC.Voice.setSpeed) CC.Voice.setSpeed(speed); }
    const vl = $('volLevel'); if (vl) vl.textContent = Math.round((S.volume == null ? 1 : S.volume) * 100) + '%';
    const vs = $('optVolume'); if (vs && document.activeElement !== vs) vs.value = Math.round((S.volume == null ? 1 : S.volume) * 100);
  }
  // the instruction is the most important line: praise / hint lines must not cut it off
  let pendingPrompt = null, promptStart = 0;
  // how long a line takes to say: voice.js's own estimate at rate 0.9 (600 ms + 85 ms × chars / 0.9 ≈ 95 ms × chars)
  const lineMs = txt => 600 + 95 * (txt || '').length;
  function speakPrompt(txt, opt) {
    // guard until the prompt has started AND finished: queued praise must not cut it off
    pendingPrompt = txt || null; promptStart = performance.now();
    promptUntil = performance.now() + 6000 + lineMs(txt);
    const p = speak(txt, opt);
    // the line ended (or was dropped / failed / interrupted) without ever starting: lift the guard so a Kiki tap repeats it
    if (p && p.then) p.then(() => { if (pendingPrompt === txt) { pendingPrompt = null; promptUntil = Math.min(promptUntil, performance.now() + 300); } }, () => {});
    if (!voiceOn()) { pendingPrompt = null; promptUntil = performance.now() + lineMs(txt); }
  }
  function onVoiceStart(display) {
    if (pendingPrompt && display === pendingPrompt) { promptStart = performance.now(); promptUntil = promptStart + lineMs(display); pendingPrompt = null; }
  }
  const canInterrupt = () => performance.now() > promptUntil;
  /** feedback lines (placed / wrong / near miss) interrupt — but never the prompt while it is protected (then they queue) */
  const feedback = (txt) => speak(txt, { interrupt: canInterrupt() });
  /** wrong / near-miss lines carry the correction ("… let's find the red one!"): protect them like the count run, so the
   *  next pickup only plips instead of cutting them (playtest P2-3 E) */
  const protect = (txt) => { if (txt) promptUntil = Math.max(promptUntil, performance.now() + lineMs(txt)); };

  /* ---------- game flow ---------- */
  function startGame() {
    CC.Audio.unlock();
    world.setAge(curAge()); world.setLang(curLang());
    world.lastTopics = CC.Storage.getJSON('lastTopics', null);   // chapters rotate between sessions
    world.newSession({ lastTopics: world.lastTopics });
    if (world.levels) CC.Storage.setJSON('lastTopics', world.levels);
    if (FLAGS.level != null) world.startLevel(Math.max(0, Math.min(3, FLAGS.level | 0)));
    shownStars = 0; CC.UI.setStars(0); lastAsk = null; lastPromptText = ''; songChapter = -1;
    render.clearGallery();
    if (weather.setParty) weather.setParty(false);
    mode = 'play';
    $('stage').classList.remove('talking');
    CC.UI.only(); CC.UI.show('hud'); CC.UI.say('');
    CC.Audio.setMood(world.level || 0); CC.Audio.startMusic(); CC.Audio.setSong(false);
    applyAudio();
    stats.sessions++;
    requestAnimationFrame(() => { updateHudStarTarget(); applySize(); });
  }
  function goTitle() {
    mode = 'title';
    $('stage').classList.remove('talking');
    if (CC.Voice) CC.Voice.stop();
    if (inputCancel && inputCancel.cancel) inputCancel.cancel();
    if (world.cancelDrag) world.cancelDrag();
    CC.Audio.stopMusic();
    CC.UI.only('scrTitle'); CC.UI.show('hud', false); CC.UI.say('');
    CC.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
    weather.setWeather(0, {}); if (weather.setParty) weather.setParty(false);
  }
  function pause() {
    if (mode !== 'play' && mode !== 'talk') return;
    mode = 'paused';
    if (inputCancel && inputCancel.cancel) inputCancel.cancel();
    if (world.cancelDrag) world.cancelDrag();
    if (CC.Voice) { CC.Voice.stop(); if (CC.Voice.stopListening) CC.Voice.stopListening(); }
    CC.Audio.stopMusic();
    CC.UI.only('scrPause');
  }
  function resume() {
    if (mode !== 'paused') return;
    mode = world.state === 'talk' ? 'talk' : 'play';
    idleSaid = 0;   // a returning child gets the nudges again before the next auto-pause
    if (world.resetNudges) world.resetNudges();
    CC.UI.only(mode === 'talk' ? 'scrTalk' : undefined);
    CC.Audio.startMusic();
    // say the question again so a returning child knows what to do
    if (mode === 'talk' && world.talk) speak(T(world.talk.promptKey, world.talk.params || {}), { priority: true });
    else if (world.state === 'round' && world.phase === 'play') setTimeout(repeatPrompt, 300);
  }

  let lastPromptText = '', lastAsk = null;
  function currentPrompt() {   // prompts have several wordings: repeat the one Kiki said, word for word
    if (lastPromptText) return lastPromptText;
    const p = world.prompt ? world.prompt() : null;
    return p ? askText(Object.assign({ first: true, step: 0 }, p)) : '';
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
  const step = () => world.stepInfo || null;
  const chimeOf = id => (world.chimeById ? world.chimeById(id) : (world.chimes || []).find(p => p.id === id)) || null;
  // the event + what main knows (VOICE §1): the chapter topic, the current step's params / key and the chime's thing
  function ev2(e) {
    const s = step(), p = chimeOf(e.id);
    return Object.assign({ topic: world.topic, params: s ? s.params : (lastAsk && lastAsk.params), promptKey: s ? s.promptKey : (lastAsk && lastAsk.promptKey) },
      e, { thing: e.thing || (p && p.thing) || undefined });
  }
  function line(fn, e, fallbackKey) {
    const I = CC.I18N;
    if (I && typeof I[fn] === 'function') { try { const t = I[fn](curLang(), e); if (t) return t; } catch (err) { /* fall back */ } }
    return fallbackKey ? T(fallbackKey) : '';
  }
  function kikiMood(m, t) { if (world.kiki) { world.kiki.mood = m; world.kiki.moodT = t; } }
  function askText(e) {
    const I = CC.I18N;
    if (I && I.ask) { try { return I.ask(curLang(), e.promptKey, Object.assign({ child: S.name || '' }, e.params || {}), { next: !e.first && e.step > 0 }); } catch (err) { /* fall back */ } }
    return T(e.promptKey, e.params || {});
  }

  let songWords = '', songChapter = -1;
  function onEvent(e) {
    switch (e.type) {
      case 'level': {
        const wi = (e.weather != null ? e.weather : e.level) % 4;
        weather.setWeather(wi, {});
        CC.Audio.setMood(wi); CC.Audio.play('chapter');
        CC.UI.setDots(world.roundsPerLevel || 4, 0);
        speak(T('ui.chapter', { n: e.level + 1 }) + '. ' + T('topic.' + e.topic), { interrupt: true });
        speak(T('weather.' + wi));   // queued after the chapter name
        CC.UI.say('');   // the chapter banner shows the topic (visual P2-5: not twice)
        render.prewarm(world.layout, wi);
        break;
      }
      case 'round': {
        CC.UI.fadeBubble(false); CC.Audio.setSong(false);
        stats.rounds++; idleSaid = 0; lastAsk = null; lastPromptText = '';
        CC.UI.setDots(world.roundsPerLevel || 4, e.round % (world.roundsPerLevel || 4));
        CC.UI.say(T('enter'));   // shown, not spoken: the prompt follows in a second
        break;
      }
      case 'chimeIn': { const c = chimeOf(e.id); CC.Audio.play('clink', { note: c ? c.note : e.i, kind: c && c.thing && c.thing.kind }); break; }
      case 'ask': {
        lastAsk = e; idleSaid = 0; CC.UI.fadeBubble(false);
        const txt = askText(e);
        lastPromptText = txt;
        CC.UI.say(txt); speakPrompt(txt, { priority: true });
        break;
      }
      case 'ring': {   // every strike: the chime's own note (a brush softer, a wrong one dull — its bonk comes with `wrong`)
        stats.rings++; if (e.brush) stats.brushes++;
        const th = e.thing || (chimeOf(e.id) || {}).thing || {};
        if (!e.dull) CC.Audio.play('chime', { note: e.note, kind: th.kind, strength: e.strength || 1, brush: !!e.brush });
        if (!e.brush && !e.dull) render.burst('ring', e.x, e.y, { size: 150, rgb: '255,240,190', life: 0.5 });
        break;
      }
      case 'right': {
        stats.correct++;
        promptUntil = 0; pendingPrompt = null;
        const th = e.thing || {};
        render.burst('sparkles', e.x, e.y, { n: 14, color: th.color });
        if (weather.burst) weather.burst(e.x, e.y, { kind: 'notes', n: 4 });
        kikiMood('happy', 1.0);
        const txt = line('sayRight', ev2(e), 'praise');
        const isCount = !!e.count || th.kind === 'string';
        speak(txt, { interrupt: !isCount || canInterrupt() });
        // a count run ("One, two, three bells!") is the most important line of the round: nothing may cut it
        if (isCount) promptUntil = performance.now() + 900 + 600 * ((e.count && e.count.n) || th.n || 1);
        else protect(txt);
        CC.Audio.play('noteFly');
        break;
      }
      case 'count': {   // a little bell / dot lights: a jingle + the numeral (the words are the right line's run)
        stats.counts++;
        CC.Audio.play('jingle', { i: e.i });
        render.burst('count', e.x, e.y - 30, { n: e.i });
        break;
      }
      case 'lantern': {
        stats.lanterns++;
        CC.Audio.play('lantern', { i: e.i });
        render.burst('sparkles', e.x, e.y, { n: 8, color: e.color || 'yellow' });
        break;
      }
      case 'stepDone': if (!e.last) CC.Audio.play('stepDone'); break;
      case 'wrong': {
        stats.wrong++;
        const c = chimeOf(e.id);
        CC.Audio.play('bonk', { note: c ? c.note : null, kind: c && c.thing && c.thing.kind });
        if (world.kiki && world.kiki.mood !== 'oops') kikiMood('oops', 1.2);
        const now = performance.now();
        if (now - lastWrongSay > 1500) { lastWrongSay = now; const wt = line('sayWrong', ev2(Object.assign({}, e, { thing: c && c.thing })), 'hint'); feedback(wt); protect(wt); }
        break;
      }
      case 'soft': stats.soft++; CC.Audio.play('beam'); break;
      case 'hint': {
        stats.hints++;
        CC.Audio.play('hint');
        if (!e.idle) speak(T('hint'));   // queued: the feedback line goes first
        break;
      }
      case 'assistArmed': CC.Audio.play('hint'); break;
      case 'assist': stats.assists++; speak(T('hint')); break;
      case 'idle':
        if (++idleSaid <= 4) speak(T('idle') + ' ' + currentPrompt());   // then stay quiet: maybe nobody is there
        else if (idleSaid >= 5 && !bot) pause();   // ≈ 2 min without a touch: nobody is playing — pause
        break;
      case 'pokeKiki': {
        if (world.state !== 'round' || !lastAsk) { if (!speaking()) speak(T('kiki.poke'), { interrupt: true }); kikiMood('happy', 0.8); break; }
        // never restart the prompt while Kiki is still saying it
        if (speaking() && lastSpoken === lastPromptText) { kikiMood('idle', 0); break; }
        const since = performance.now() - promptStart;
        const stuck = pendingPrompt && since > 6000;   // the prompt never started (no voice / dropped): don't wait forever
        if (since > 3000 && (!pendingPrompt || stuck)) repeatPrompt();
        else if (world.kiki && world.kiki.mood === 'talk') kikiMood('idle', 0);
        break;
      }
      case 'roundDone': {
        const n = e.stars || 1, B = world.layout && world.layout.beam;
        const fx = B ? (B.x0 + B.x1) / 2 : view.W / 2, fy = B ? B.y - 40 : view.H * 0.3;
        CC.Audio.play('complete');
        for (let i = 0; i < n; i++) {
          render.burst('star', fx + (i - (n - 1) / 2) * 70, fy, { delay: 0.15 + i * 0.22, onDone: () => { shownStars++; CC.UI.setStars(shownStars, true); CC.Audio.play('star', { i }); } });
        }
        CC.UI.setDots(world.roundsPerLevel || 4, ((e.round != null ? e.round : world.round) % (world.roundsPerLevel || 4)) + 1);
        const now = performance.now();
        if (now - lastPraise > 1200) { lastPraise = now; speak(T(e.stars >= 3 ? 'great' : 'praise')); }
        break;
      }
      case 'songAsk': {
        CC.Audio.play('songAsk');
        // the full "swipe across the chimes" ask once per chapter, then a short one (playtest P1-2: less talk per round)
        songWords = T(songChapter === world.level ? 'songShort' : 'song'); songChapter = world.level;
        CC.UI.say(songWords);
        speak(songWords);   // queued after the praise
        break;
      }
      case 'songNote': {
        if (e.i === 0) { stats.songs++; CC.Audio.setSong(true); CC.Audio.play('strum'); kikiMood('dance', 3); }
        const c = chimeOf(e.id);
        CC.Audio.play('chime', { note: e.note, kind: c && c.thing && c.thing.kind, strength: 1.1 });
        render.burst('note', e.x, e.y - 40, { color: c && c.thing && c.thing.color });
        break;
      }
      case 'songDone': {
        if (e.auto) stats.songAuto++;
        CC.Audio.play('songDone');
        setTimeout(() => CC.Audio.setSong(false), 900);   // no line: the cascade is the reward (playtest P1-2)
        break;
      }
      case 'chimesOut': CC.Audio.play('out'); break;
      case 'hedgehog':
        CC.Audio.play('sniff');
        if (canInterrupt()) speak(T('surprise.hedgehog'));
        break;
      case 'hedgehogTap':
        stats.hedgehogTaps++;
        CC.Audio.play('roll');
        if (weather.burst) weather.burst(e.x, e.y, { kind: 'dust', n: 6 });
        if (canInterrupt()) speak(T('hedgehog.tap'), { interrupt: true });
        break;
      case 'bird':
        CC.Audio.play('tweet');
        if (canInterrupt()) speak(T('surprise.bird'));
        break;
      case 'birdTap':
        stats.birdTaps++;
        CC.Audio.play('tweet', { note: e.note });
        render.burst('note', e.x, e.y - 30);
        if (canInterrupt() && !speaking()) speak(T('bird.tap'), { interrupt: true });
        break;
      case 'fireflies':
        CC.Audio.play('twinkle');
        if (canInterrupt()) speak(T('surprise.fireflies'));
        break;
      case 'fireflyTap': {
        stats.fireflyTaps++;
        CC.Audio.play('twinkle');
        render.burst('sparkles', e.x, e.y, { n: 8, color: '#E9F59A' });
        const now = performance.now();
        if (now - lastPopSay > 2000 && canInterrupt()) { lastPopSay = now; speak(T('firefly.tap'), { interrupt: true }); }
        break;
      }
      case 'talk': CC.UI.fadeBubble(false); CC.UI.say(''); CC.Audio.setSong(false); CC.UI.setDots(world.roundsPerLevel || 4, world.roundsPerLevel || 4); openTalk(e.talk || world.talk); break;
      case 'talkAsk': {   // no answer yet: ask again, and from the 2nd re-ask glow the right answer
        const tk = e.talk || world.talk;
        if (tk && e.n <= 3) speak(T(tk.promptKey, tk.params || {}), { priority: true, interrupt: true });
        if (tk && (e.n >= 2 || e.glowAnswer)) CC.UI.glowTalk(tk.answerId || tk.answer);
        break;
      }
      case 'talkResult': {
        stats.talks++; if (e.correct) stats.talkRight++;
        CC.UI.markTalk(e.choiceId, e.answerId);
        const ans = (world.talk && world.talk.choices.find(c => c.id === e.answerId)) || {};
        if (e.auto) { speak(CC.I18N.talkWrong ? CC.I18N.talkWrong(curLang(), ans) : T('talk.wrong.any'), { interrupt: true }); break; }
        if (e.correct) {
          CC.Audio.play('talkRight');
          render.burst('star', view.W / 2, view.H / 2, { onDone: () => { shownStars++; CC.UI.setStars(shownStars, true); CC.Audio.play('star'); } });
          speak(T('talk.right'), { interrupt: true });
        } else {
          CC.Audio.play('soft');
          speak(CC.I18N.talkWrong ? CC.I18N.talkWrong(curLang(), ans) : T('talk.wrong.any'), { interrupt: true });
        }
        break;
      }
      case 'levelDone':
        CC.Audio.play('level'); CC.UI.say('');
        if (mode === 'talk') { mode = 'play'; CC.UI.only(); }
        $('stage').classList.remove('talking');
        speak(T('great'));
        break;
      case 'sessionDone': {
        CC.Audio.play('fanfare'); CC.Audio.setSong(false);
        if (weather.setParty) weather.setParty(true);
        render.setGallery(e.songs || world.songs);
        render.burst('confetti', 0, 0);
        progress.totalStars += e.stars || 0; progress.sessions++;
        CC.Storage.setJSON('progress', progress);
        shownStars = e.stars || shownStars; CC.UI.setStars(shownStars);
        $('doneStars').textContent = e.stars || 0;
        $('doneTitle').textContent = T('session.done', { stars: e.stars || 0 });
        speak(T('party'), { interrupt: true });
        speak(T('session.done', { stars: e.stars || 0 }));
        mode = 'done';
        CC.UI.only('scrDone'); CC.UI.show('hud', false); CC.UI.say('');
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
    const canMic = S.mic && CC.Voice && CC.Voice.canListen && CC.Voice.canListen() && !FLAGS.bot;
    CC.UI.openTalk(talk, curLang(), id => { CC.Audio.play('click'); world.talkAnswer(id); }, canMic, curAge());
    const q = T(talk.promptKey, talk.params || {});
    speakPrompt(T('talk.intro') + ' ' + q, { priority: true });   // queued after the round's praise, not cutting it off
  }
  function listen() {
    const talk = world.talk;
    if (!talk || world.state !== 'talk' || !CC.Voice || !CC.Voice.canListen()) return;
    if (CC.Voice.stop) CC.Voice.stop();
    CC.Audio.play('listen');
    CC.UI.setListening(true, T('ui.listening'));
    const choices = talk.choices.map(c => ({ id: c.id, words: CC.I18N.choiceWords ? CC.I18N.choiceWords(curLang(), c) : [] }));
    CC.Voice.listen({ lang: curLang(), choices, timeoutMs: 6000 }).then(res => {
      CC.UI.setListening(false, T('ui.tapOrSay'));
      if (world.state !== 'talk') return;
      if (res && res.id != null) world.talkAnswer(res.id);
      else if (res && res.reason === 'not-allowed') { $('btnMic').classList.add('hidden'); speak(T('ui.micDenied')); }
      else speak(T('ui.tapOrSay'));
    }).catch(() => CC.UI.setListening(false, T('ui.tapOrSay')));
  }

  let boxCache = null, boxT = 0;
  function domBoxes() {   // logo and done-panel rects in logical px (the title art and the gallery avoid them)
    const now = performance.now();
    if (boxCache && now - boxT < 500 && boxCache.mode === mode) return boxCache;
    boxT = now;
    const conv = el => { if (!el) return null; const r = el.getBoundingClientRect(); if (!r.width) return null; return { x: (r.left - view.left) / view.s, y: (r.top - view.top) / view.s, w: r.width / view.s, h: r.height / view.s }; };
    boxCache = { mode, logo: mode === 'title' ? conv(document.querySelector('.title-wrap')) : null, done: mode === 'done' ? conv(document.querySelector('.done-panel')) : null };
    return boxCache;
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
    CC.Audio.duck(sp);
    if (CC.Audio.tick) CC.Audio.tick(dt);
    render.draw(world, weather, { boxes: domBoxes(), dt: dt * Math.min(speed, 4), lang: curLang(), title: mode === 'title' || mode === 'loading', speaking: sp, done: mode === 'done', debug: FLAGS.debug });
    adapt(raw);
  }
  function adapt(raw) {  // adaptive quality: step the render scale down when frames stay slow
    if (raw > 0.5) return;
    if (raw > 0.022) { slowAcc += raw; stats.slowFrames++; } else slowAcc = Math.max(0, slowAcc - raw * 0.5);
    // only the backing store shrinks: World.setViewport would cancel the child's drag
    if (slowAcc > 1.5 && quality > 0.6) { quality *= 0.85; render.quality = Math.max(0.5, quality); slowAcc = 0; pendingResize = true; }
  }

  /* ---------- input ---------- */
  function toLogical(cx, cy) { return { x: (cx - view.left) / view.s, y: (cy - view.top) / view.s }; }
  function repeatPrompt() {
    if (world.state !== 'round') return;
    CC.Audio.play('click');
    kikiMood('talk', 1.0);
    if (!lastAsk && !(world.prompt && world.prompt())) return;
    const cp = currentPrompt(); promptUntil = 0; speakPrompt(cp, { interrupt: true });
  }

  function bindUI() {
    CC.Input.kidProof();
    // Input passes two NUMBERS in logical px (never a point object) — VOICE §4
    inputCancel = CC.Input.attach($('game'), {
      toLogical,
      down: (x, y) => { if (mode === 'play' && !bot) world.pointerDown(x, y); },   // a chime under the finger is struck at once (judged)
      move: (x, y) => { if (mode === 'play' && !bot) world.pointerMove(x, y); },   // a swipe strikes every chime it crosses (later ones brush)
      up: (x, y) => { if (mode === 'play' && !bot) world.pointerUp(x, y); },       // the gesture ends
      cancel: () => { if (world.cancelDrag) world.cancelDrag(); }
    });
    const unlock = () => { CC.Audio.unlock(); if (CC.Voice) CC.Voice.unlock(); };
    ['touchend', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { capture: true, passive: true }));

    $('btnPlay').addEventListener('click', () => { CC.Audio.play('click'); startGame(); });
    $('bubble').addEventListener('click', repeatPrompt);
    $('btnPause').addEventListener('click', () => { CC.Audio.play('click'); pause(); });
    $('btnResume').addEventListener('click', () => { CC.Audio.play('click'); resume(); });
    $('btnHome').addEventListener('click', () => { CC.Audio.play('click'); goTitle(); });
    $('btnAgain').addEventListener('click', () => { CC.Audio.play('click'); startGame(); });
    $('btnDoneHome').addEventListener('click', () => { CC.Audio.play('click'); goTitle(); });
    $('btnMic').addEventListener('click', listen);
    // volume: settings slider + big − / + in the pause menu
    $('optVolume').addEventListener('input', () => { S.volume = +$('optVolume').value / 100; saveSettings(); applyAudio(); });
    $('optVolume').addEventListener('change', () => CC.Audio.play('pop'));
    const vstep = d => { S.volume = Math.max(0, Math.min(1, Math.round(((S.volume == null ? 1 : S.volume) + d) * 20) / 20)); saveSettings(); applyAudio(); CC.Audio.play('pop'); };
    $('btnVolDown').addEventListener('click', () => vstep(-0.1));
    $('btnVolUp').addEventListener('click', () => vstep(0.1));
    document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => {
      S.lang = b.dataset.lang; langOverride = null; saveSettings(); CC.UI.applyLang(curLang()); applyAudio(); CC.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
      updateVoiceInfo();
      CC.Audio.play('click');
      if (mode === 'title') speak(T('ui.welcome'), { interrupt: true });
    }));
    // parent gate: hold the gear for 2 s
    const gear = $('btnParents');
    CC.Input.holdButton(gear, 2000, () => { gear.style.setProperty('--p', 0); openSettings(); },
      p => { gear.style.setProperty('--p', p); gear.classList.toggle('holding', p > 0); });
    gear.addEventListener('click', () => { gear.classList.add('tip'); setTimeout(() => gear.classList.remove('tip'), 1600); });
    CC.UI.bindSettings(S, k => {
      saveSettings();
      if (k === 'sfx' || k === 'music' || k === 'voice') applyAudio();
      if (k === 'age') { ageOverride = null; CC.UI.setTitleInfo(progress.totalStars, curAge(), curLang()); }
      if (k === 'name' && CC.I18N.setChild) CC.I18N.setChild(S.name);
    }, curAge);
    $('btnSettingsDone').addEventListener('click', () => { CC.Audio.play('click'); CC.UI.only('scrTitle'); CC.UI.setTitleInfo(progress.totalStars, curAge(), curLang()); });

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(applySize, 250));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { pause(); CC.Audio.suspend(); if (CC.Voice) CC.Voice.stop(); }
      else CC.Audio.resume();
    });
    window.addEventListener('blur', () => { if (world && world.cancelDrag) world.cancelDrag(); });
  }
  function openSettings() {
    CC.Audio.play('click');
    CC.UI.refreshSettings();
    updateVoiceInfo();
    CC.UI.only('scrSettings');
  }
  function updateVoiceInfo() {
    if (!CC.Voice) return;
    const has = CC.Voice.hasVoice ? CC.Voice.hasVoice(curLang()) : false;
    const nm = CC.Voice.voiceName ? CC.Voice.voiceName(curLang()) : '';
    const mic = CC.Voice.canListen && CC.Voice.canListen();
    const v = has ? (curLang() === 'vi' ? 'Giọng đọc: ' : 'Voice: ') + (nm || '✓') : T('ui.voiceMissing');
    const m = mic ? '' : ' · ' + T('ui.micUnsupported');
    CC.UI.setVoiceInfo(v + m);
  }

  /* ---------- test hooks (DESIGN §5.5) — live getters via defineProperties (never Object.assign) ---------- */
  function hooks() {
    const pt = p => (p ? { x: view.left + p.x * view.s, y: view.top + p.y * view.s } : null);
    const circ = c => (c ? { x: view.left + c.x * view.s, y: view.top + c.y * view.s, r: (c.r || 0) * view.s } : null);
    const box = b => (b ? { x: view.left + b.x * view.s, y: view.top + b.y * view.s, w: (b.w || 0) * view.s, h: (b.h || 0) * view.s } : null);
    const prev = CC.debug || {};
    CC.debug = prev;
    Object.defineProperties(prev, Object.getOwnPropertyDescriptors({
      get world() { return world; }, get weather() { return weather; }, get mode() { return mode; }, stats, events: eventLog,
      get bot() { return bot; },
      voiceLog: (CC.Voice && CC.Voice.log) || prev.voiceLog || [],
      getState() {
        const s = world.stepInfo;
        return { mode, state: world.state, phase: world.phase, level: world.level, topic: world.topic, round: world.round, step: world.step,
          stepMode: s ? s.mode : null, stars: world.stars, misses: world.misses,
          chimes: (world.chimes || []).map(c => ({ id: c.id, state: c.state, done: !!c.done, target: !!c.target, kind: c.thing && c.thing.kind })),
          lanterns: (world.lanterns || []).map(l => +(l.lit || 0).toFixed(2)),
          surprise: world.cur && world.cur.surprise, songs: (world.songs || []).length,
          weather: weather.ambient && weather.ambient.mood, W: view.W, H: view.H, ins: view.ins, settings: Object.assign({}, S), speed };
      },
      setSpeed(n) { speed = Math.max(0.1, +n || 1); applyAudio(); },
      startGame, goTitle,
      setBot(on, skill) { bot = on ? new CC.Bot(world, { skill: skill == null ? FLAGS.botSkill : skill, seed: 7 }) : null; },
      setAutoRestart(on) { autoRestart = !!on; },
      gotoLevel(i) { world.startLevel(i); },
      view: () => view, render: () => render,
      chimeScreen(id) { return circ(world.chimeHit ? world.chimeHit(id) : null); },
      beamScreen() { const B = world.layout && world.layout.beam; if (!B) return null; const p0 = pt({ x: B.x0, y: B.y }), p1 = pt({ x: B.x1, y: B.y }); return { x0: p0.x, x1: p1.x, y: p0.y }; },
      bandScreen() { return box(world.layout && world.layout.band); },
      kikiScreen() { const k = world.kikiHit ? world.kikiHit() : null; return k ? { x: view.left + (k.cx != null ? k.cx : k.x + k.w / 2) * view.s, y: view.top + (k.cy != null ? k.cy : k.y + k.h / 2) * view.s, w: k.w * view.s, h: k.h * view.s } : null; },   // centre x, y + w, h
      hedgehogScreen() { return circ(world.hedgehogHit ? world.hedgehogHit() : null); },
      birdScreen() { return circ(world.birdHit ? world.birdHit() : null); },
      fireflyScreen() { return circ(world.fireflyHit ? world.fireflyHit() : null); },
      answer() { return world.answer ? world.answer() : null; },
      toScreen(x, y) { return { x: view.left + x * view.s, y: view.top + y * view.s }; },
      audio: () => CC.Audio
    }));
  }

  /* ---------- boot ---------- */
  async function boot() {
    await CC.Storage.init();
    S = Object.assign({}, DEF, CC.Storage.getJSON('settings', {}));
    Object.assign(progress, CC.Storage.getJSON('progress', {}));
    CC.UI.applyLang(curLang());
    if (CC.I18N && CC.I18N.setChild) CC.I18N.setChild(S.name);
    if (CC.Voice) { CC.Voice.init({ lang: curLang(), enabled: voiceOn(), speed }); const prevStart = CC.Voice.onStart; CC.Voice.onStart = d => { onVoiceStart(d); if (prevStart) prevStart(d); }; }
    render = new CC.Renderer($('game')); CC.render = render;
    world = new CC.World({ seed: FLAGS.seed != null ? FLAGS.seed : (Date.now() & 0x7fffffff), age: curAge(), lang: curLang() });
    weather = new CC.Weather({ width: 960, height: 720, seed: 11 });
    hooks();
    bindUI();
    applySize();
    weather.setWeather(0, { instant: true });
    await CC.Assets.load();
    render.prewarm(world.layout, 0);
    applyAudio();
    if (FLAGS.bot) bot = new CC.Bot(world, { skill: FLAGS.botSkill, seed: 7 });
    CC.UI.only('scrTitle');
    CC.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
    mode = 'title';
    requestAnimationFrame(frame);
    if (FLAGS.autostart) startGame();
    if (CC.Voice && CC.Voice.onVoicesChanged) CC.Voice.onVoicesChanged(updateVoiceInfo);
  }
  window.addEventListener('DOMContentLoaded', () => boot().catch(e => { console.error(e); }));
})(window.CC = window.CC || {});
