/* TM main (Mit's Treasure Map) — boots the game, sizes the canvas for any phone/tablet shape, runs the loop and turns
 * world events (a piece is picked up, it clicks into its shadow, the coins are counted, the picture comes alive, Mit
 * woofs) into voice, sound, effects and UI, following the event → line table in docs/VOICE.md §1.1.
 * Touches reach the world only through TM.Input (HUD / bubble / menus never reach the canvas). */
(function (TM) {
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
  const T1 = (key, p) => (TM.I18N ? TM.I18N.t(curLang(), key, Object.assign({ child: S.name || '' }, p || {})) : key);
  // never the same wording twice in a row: re-roll a variant that repeats the line just spoken
  const T = (key, p) => { let r = T1(key, p); for (let k = 0; k < 3 && r && r === lastSpoken; k++) r = T1(key, p); return r; };

  /* ---------- settings (URL flags never saved) ---------- */
  const DEF = { age: 4, lang: (navigator.language || 'en').toLowerCase().startsWith('vi') ? 'vi' : 'en', name: '', sfx: true, music: true, voice: true, mic: true, volume: 1 };
  let S = Object.assign({}, DEF);
  let langOverride = FLAGS.lang === 'vi' || FLAGS.lang === 'en' ? FLAGS.lang : null;   // URL ?lang= is session-only
  const curLang = () => langOverride || S.lang;
  // URL ?age= is session-only; a parent's pick wins. Normalised like the world (TM.Content.ageOf: round, clamp 3–7) so the
  // title shows the age that is really played (functional B1)
  let ageOverride = FLAGS.age ? Math.max(3, Math.min(7, Math.round(FLAGS.age))) : null;
  const curAge = () => ageOverride || S.age;
  const saveSettings = () => TM.Storage.setJSON('settings', S);
  const progress = { totalStars: 0, sessions: 0 };

  let world, weather, render, bot = null, inputCancel = null;
  let mode = 'loading';            // loading | title | play | paused | talk | done
  let speed = FLAGS.speed, autoRestart = FLAGS.autorestart;
  let view = { W: 960, H: 720, s: 1, left: 0, top: 0, ins: { top: 0, right: 0, bottom: 0, left: 0 } };
  const stats = { sessions: 0, rounds: 0, pickups: 0, correct: 0, wrong: 0, nearMiss: 0, home: 0, taps: 0, hints: 0, assists: 0,
    counts: 0, woofs: 0, talks: 0, talkRight: 0, crabTaps: 0, bubblePops: 0, frames: 0, slowFrames: 0 };
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
    // rotation mid-drag: the finger's old logical point is meaningless now → the piece glides home
    if (world && (prev.W !== view.W || prev.H !== view.H)) { if (inputCancel && inputCancel.cancel) inputCancel.cancel(); if (world.cancelDrag) world.cancelDrag(); }
    const rs = renderScale();
    const c = $('game');
    c.style.width = view.cssW + 'px'; c.style.height = view.cssH + 'px';
    c.style.left = view.left + 'px'; c.style.top = view.top + 'px';
    render.resize(view.W, view.H, rs);
    world.tapMoveMin = Math.max(24, 18 / view.s);   // ≈ 18 pt of finger wobble is still a tap on small phones
    world.setViewport(view.W, view.H, view.ins);    // board, slots (u, v) and tray spots re-laid
    placeBubble();
    world.hudKeep = measureHud();                   // the real HUD (CSS px) may reach lower than the logical keep-out
    world.setViewport(view.W, view.H, view.ins);
    weather.resize(view.W, view.H, world.layout && world.layout.groundY);
    placeBubble();
    updateHudStarTarget();
  }
  function placeBubble() {
    const B = world.layout && world.layout.bubble;
    if (!B) return;
    // the world already moved / narrowed the bubble beside or below the measured HUD (computeLayout + hudKeep)
    const r = { x: view.left + B.x * view.s, y: view.top + B.y * view.s, w: B.w * view.s, h: B.h * view.s };
    TM.UI.placeBubble(r);
  }
  function updateHudStarTarget() {
    const p = TM.UI.hudStarPoint();
    if (p.x || p.y) render.hudStar = { x: (p.x - view.left) / view.s, y: (p.y - view.top) / view.s };
  }
  let resizeT = 0;
  function onResize() { clearTimeout(resizeT); resizeT = setTimeout(applySize, 120); }

  /* ---------- voice ---------- */
  const voiceOn = () => S.voice && !FLAGS.novoice && speed <= 1.01 && !FLAGS.mute;
  function speak(text, opt) {
    if (!text) return null;
    lastSpoken = text;
    return TM.Voice ? TM.Voice.say(text, opt || {}) : null;
  }
  const speaking = () => !!(TM.Voice && TM.Voice.isSpeaking && TM.Voice.isSpeaking());
  function applyAudio() {
    TM.Audio.setOptions({ sfx: S.sfx, music: S.music, muted: FLAGS.mute, volume: S.volume == null ? 1 : S.volume });
    if (TM.Voice) { TM.Voice.setLang(curLang()); TM.Voice.setEnabled(voiceOn()); if (TM.Voice.setVolume) TM.Voice.setVolume(S.volume == null ? 1 : S.volume); if (TM.Voice.setSpeed) TM.Voice.setSpeed(speed); }
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
    // the line ended (or was dropped / failed / interrupted) without ever starting: lift the guard so a Mit tap repeats it
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
    TM.Audio.unlock();
    world.setAge(curAge()); world.setLang(curLang());
    world.lastTopics = TM.Storage.getJSON('lastTopics', null);   // chapters rotate between sessions
    world.newSession({ lastTopics: world.lastTopics });
    if (world.levels) TM.Storage.setJSON('lastTopics', world.levels);
    if (FLAGS.level != null) world.startLevel(Math.max(0, Math.min(3, FLAGS.level | 0)));
    shownStars = 0; TM.UI.setStars(0); lastAsk = null; lastPromptText = '';
    render.clearGallery();
    if (weather.setParty) weather.setParty(false);
    mode = 'play';
    $('stage').classList.remove('talking');
    TM.UI.only(); TM.UI.show('hud'); TM.UI.say('');
    TM.Audio.setMood(world.level || 0); TM.Audio.startMusic();
    applyAudio();
    stats.sessions++;
    requestAnimationFrame(() => { updateHudStarTarget(); applySize(); });
  }
  function goTitle() {
    mode = 'title';
    $('stage').classList.remove('talking');
    if (TM.Voice) TM.Voice.stop();
    if (inputCancel && inputCancel.cancel) inputCancel.cancel();
    if (world.cancelDrag) world.cancelDrag();
    TM.Audio.stopMusic();
    TM.UI.only('scrTitle'); TM.UI.show('hud', false); TM.UI.say('');
    TM.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
    weather.setWeather(0, {}); if (weather.setParty) weather.setParty(false);
  }
  function pause() {
    if (mode !== 'play' && mode !== 'talk') return;
    mode = 'paused';
    if (inputCancel && inputCancel.cancel) inputCancel.cancel();
    if (world.cancelDrag) world.cancelDrag();
    if (TM.Voice) { TM.Voice.stop(); if (TM.Voice.stopListening) TM.Voice.stopListening(); }
    TM.Audio.stopMusic();
    TM.UI.only('scrPause');
  }
  function resume() {
    if (mode !== 'paused') return;
    mode = world.state === 'talk' ? 'talk' : 'play';
    idleSaid = 0;   // a returning child gets the nudges again before the next auto-pause
    if (world.resetNudges) world.resetNudges();
    TM.UI.only(mode === 'talk' ? 'scrTalk' : undefined);
    TM.Audio.startMusic();
    // say the question again so a returning child knows what to do
    if (mode === 'talk' && world.talk) speak(T(world.talk.promptKey, world.talk.params || {}), { priority: true });
    else if (world.state === 'round' && world.phase === 'play') setTimeout(repeatPrompt, 300);
  }

  let lastPromptText = '', lastAsk = null;
  function currentPrompt() {   // prompts have several wordings: repeat the one Mit said, word for word
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
  const pieceOf = id => (world.pieceById ? world.pieceById(id) : (world.pieces || []).find(p => p.id === id)) || null;
  // the event + what main knows (VOICE §1): the chapter topic, the current step's params / key and the piece's thing
  function ev2(e) {
    const s = step(), p = pieceOf(e.id);
    return Object.assign({ topic: world.topic, params: s ? s.params : (lastAsk && lastAsk.params), promptKey: s ? s.promptKey : (lastAsk && lastAsk.promptKey) },
      e, { thing: e.thing || (p && p.thing) || undefined });
  }
  function line(fn, e, fallbackKey) {
    const I = TM.I18N;
    if (I && typeof I[fn] === 'function') { try { const t = I[fn](curLang(), e); if (t) return t; } catch (err) { /* fall back */ } }
    return fallbackKey ? T(fallbackKey) : '';
  }
  function mitMood(m, t) { if (world.mit) { world.mit.mood = m; world.mit.moodT = t; } }
  function askText(e) {
    const I = TM.I18N;
    if (I && I.ask) { try { return I.ask(curLang(), e.promptKey, Object.assign({ child: S.name || '' }, e.params || {}), { next: !e.first && e.step > 0 }); } catch (err) { /* fall back */ } }
    return T(e.promptKey, e.params || {});
  }
  const colorOf = th => (th && th.color) || (th && (th.kind === 'bunch' || th.kind === 'coins') ? 'yellow' : th && th.kind === 'animal' ? 'green' : 'orange');

  function onEvent(e) {
    switch (e.type) {
      case 'level': {
        const wi = (e.weather != null ? e.weather : e.level) % 4;
        weather.setWeather(wi, {});
        TM.Audio.setMood(wi); TM.Audio.play('chapter');
        TM.UI.setDots(world.roundsPerLevel || 4, 0);
        speak(T('ui.chapter', { n: e.level + 1 }) + '. ' + T('topic.' + e.topic), { interrupt: e.level === 0 });   // queued after the chapter's praise
        speak(T('weather.' + wi));   // queued after the chapter name
        TM.UI.say(T('topic.' + e.topic));
        render.prewarm(world.layout, wi);
        break;
      }
      case 'round': {
        TM.UI.fadeBubble(false);
        stats.rounds++; idleSaid = 0; lastAsk = null; lastPromptText = '';
        TM.UI.setDots(world.roundsPerLevel || 4, e.round % (world.roundsPerLevel || 4));
        TM.UI.say(T('enter'));   // shown, not spoken: the prompt follows in a second
        break;
      }
      case 'boardIn': TM.Audio.play('unroll'); break;
      case 'wave': TM.Audio.play('wave'); break;
      case 'pieceLand': TM.Audio.play('splash', { i: e.i || 0, soft: true }); if (weather.burst) weather.burst(e.x, e.y + 20, { kind: 'splash', n: 3 }); break;
      case 'splash': TM.Audio.play('splash', { soft: e.kind === 'tap' }); if (weather.burst) weather.burst(e.x, e.y + 20, { kind: 'splash', n: 4 }); render.burst('ring', e.x, e.y + 26, { size: 90, rgb: '230,250,255', life: 0.5 }); break;
      case 'ask': {
        lastAsk = e; idleSaid = 0; TM.UI.fadeBubble(false);
        const txt = askText(e);
        lastPromptText = txt;
        TM.UI.say(txt); speakPrompt(txt, { priority: true });
        break;
      }
      case 'pickup': {
        stats.pickups++;
        TM.Audio.play('pickup', { color: colorOf(e.thing) }); TM.Audio.play('drip');
        const now = performance.now();
        // the piece's name — never over a protected prompt (the plip is enough), not twice for the same piece within 2 s
        const oneCoin = e.thing && (e.thing.kind === 'coins' || e.thing.kind === 'bunch') && e.thing.n === 1;   // 'One coin!' is said when it fits
        if (!oneCoin && canInterrupt() && !(lastNamed.id === e.id && now - lastNamed.t < 2000)) {
          lastNamed = { id: e.id, t: now };
          speak(line('sayPickup', ev2(e)), { interrupt: true });
        }
        break;
      }
      case 'tapPiece': {
        stats.taps++;
        TM.Audio.play('hop');
        const now = performance.now();
        if (canInterrupt() && !(lastNamed.id === e.id && now - lastNamed.t < 1200)) { lastNamed = { id: e.id, t: now }; speak(line('sayTap', ev2(e)), { interrupt: true }); }
        break;
      }
      case 'placed': {
        stats.correct++;
        promptUntil = 0; pendingPrompt = null;
        TM.Audio.play('snap', { color: colorOf(e.thing) });
        render.burst('sparkles', e.x, e.y, { n: 14, color: e.thing && e.thing.color });
        render.burst('ring', e.x, e.y, { size: 150, rgb: '255,236,170' });
        if (weather.burst) weather.burst(e.x, e.y, { kind: 'sparkle', n: 6 });
        // Mit named this piece at pickup a moment ago: a short "Click! It fits!" (colours / shapes / size / animals; counting,
        // letters and maths keep their long lines) — playtest P3-1
        const named = lastNamed.id === e.id && performance.now() - lastNamed.t < 8000;
        const txt = line('sayPlaced', Object.assign(ev2(e), { named }), 'praise');
        speak(txt, { interrupt: true });
        // a count run ("One, two, three coins!") is the most important line of the round: nothing may cut it
        if (e.count) promptUntil = performance.now() + 900 + 600 * (e.count.n || 1);
        break;
      }
      case 'count': {   // the world lights coin / dot i: a rising chime + the numeral (the words are the placed line's run)
        stats.counts++;
        TM.Audio.play('count', { i: e.i });
        const p = pieceOf(e.id);
        render.burst('count', e.x, e.y - ((p && p.size) || 110) * 0.72, { n: e.i });
        break;
      }
      case 'stepDone': if (!e.last) TM.Audio.play('stepDone'); break;
      case 'nearMiss': {
        stats.nearMiss++;
        TM.Audio.play('hm'); TM.Audio.play('whoosh');
        const nt = T('nearMiss');
        feedback(nt); protect(nt);
        break;
      }
      case 'wrong': {
        stats.wrong++;
        TM.Audio.play('boing');
        render.burst('ring', e.x, e.y, { size: 120 });
        if (world.mit && world.mit.mood !== 'oops') mitMood('oops', 1.2);
        const now = performance.now();
        if (now - lastWrongSay > 1500) { lastWrongSay = now; const wt = line('sayWrong', ev2(e), 'hint'); feedback(wt); protect(wt); }
        break;
      }
      case 'home': stats.home++; TM.Audio.play('whoosh'); break;
      case 'soft': TM.Audio.play('pat'); break;
      case 'hint': {
        stats.hints++;
        TM.Audio.play('hint');
        if (!e.idle) speak(T('hint'));   // queued: the feedback line goes first
        break;
      }
      case 'assist': stats.assists++; TM.Audio.play('hint'); speak(T('hint')); break;
      case 'idle':
        if (++idleSaid <= 4) speak(T('idle') + ' ' + currentPrompt());   // then stay quiet: maybe nobody is there
        else if (idleSaid >= 5 && !bot) pause();   // ≈ 2 min without a touch: nobody is playing — pause
        break;
      case 'pokeMit': {
        // never restart the prompt while Mit is still saying it
        if (speaking() && lastSpoken === lastPromptText) { mitMood('idle', 0); break; }
        const since = performance.now() - promptStart;
        const stuck = pendingPrompt && since > 6000;   // the prompt never started (no voice / dropped): don't wait forever
        if (since > 3000 && (!pendingPrompt || stuck)) repeatPrompt();
        else if (world.mit && world.mit.mood === 'talk') mitMood('idle', 0);   // no line follows: no silent mouth flaps
        break;
      }
      case 'roundDone': {
        const n = e.stars || 1, B = world.layout && world.layout.board;
        const fx = B ? B.x + B.w / 2 : view.W / 2, fy = B ? B.y + B.h * 0.4 : view.H * 0.45;
        TM.Audio.play('complete');
        for (let i = 0; i < n; i++) {
          render.burst('star', fx + (i - (n - 1) / 2) * 70, fy, { delay: 0.15 + i * 0.22, onDone: () => { shownStars++; TM.UI.setStars(shownStars, true); TM.Audio.play('star', { i }); } });
        }
        TM.UI.setDots(world.roundsPerLevel || 4, ((e.round != null ? e.round : world.round) % (world.roundsPerLevel || 4)) + 1);
        // ONE spoken line (queued, never cutting the last count run): the praise. "The picture is done — look, it moves!" is
        // only shown in the bubble (playtest P2-3 C: two lines made the praise go stale and get dropped)
        TM.UI.say(T('alive'));
        const now = performance.now();
        if (now - lastPraise > 1200) { lastPraise = now; speak(T(e.stars >= 3 ? 'great' : 'praise')); }
        break;
      }
      case 'alive': {
        TM.Audio.play('alive');
        const B = world.layout && world.layout.board;
        if (B) for (let i = 0; i < 3; i++) render.burst('sparkles', B.x + B.w * (0.2 + 0.3 * i), B.y + B.h * 0.3, { n: 6 });
        break;
      }
      case 'woof': {
        stats.woofs++;
        TM.Audio.play('woof');
        render.burst('puff', e.x + 20, e.y, { n: 6, vx: 80 });
        if (!speaking()) speak(T('woof'));   // the bark carries it; only when nothing else is being said
        break;
      }
      case 'poof': TM.Audio.play('poof'); render.burst('puff', e.x, e.y, { n: 8 }); render.burst('sparkles', e.x, e.y, { n: 6 }); break;
      case 'boardOut': TM.Audio.play('fwip'); if (!speaking()) { const rt = T('rollup'); TM.UI.say(rt); speak(rt); } break;
      case 'scrollCatch': TM.Audio.play('pat'); render.caught = 0.8; break;
      case 'chest': TM.Audio.play('creak'); break;
      case 'chestOpen': {
        TM.Audio.play('jingle');
        const cp = render._chestPos || { x: e.x, y: e.y };
        if (weather.burst) weather.burst(cp.x, cp.y, { kind: 'coins', n: 16 });
        render.burst('sparkles', cp.x, cp.y, { n: 24, color: '#F2C14E' });
        speak(T('chest'), { interrupt: true });
        speak(T('session.done', { stars: world.stars || 0 }));
        break;
      }
      case 'crab':
        TM.Audio.play('clack');
        if (canInterrupt()) speak(T('surprise.crab'));
        break;
      case 'crabTap':
        stats.crabTaps++;
        TM.Audio.play('clack'); TM.Audio.play('hop');
        if (weather.burst) weather.burst(e.x, e.y - 40, { kind: 'sparkle', n: 8 });
        if (canInterrupt()) speak(T('crab.tap'), { interrupt: true });
        break;
      case 'bubbles':
        TM.Audio.play('bubbles', { n: 3 });
        if (canInterrupt()) speak(T('surprise.bubbles'));
        break;
      case 'bubblePop': {
        stats.bubblePops++;
        TM.Audio.play('pop');
        render.burst('sparkles', e.x, e.y, { n: 8 });
        const now = performance.now();
        if (now - lastPopSay > 2000 && canInterrupt()) { lastPopSay = now; speak(T('bubble.pop'), { interrupt: true }); }
        break;
      }
      case 'talk': TM.UI.fadeBubble(false); TM.UI.say(''); TM.UI.setDots(world.roundsPerLevel || 4, world.roundsPerLevel || 4); openTalk(e.talk || world.talk); break;
      case 'talkAsk': {   // no answer yet: ask again, and from the 2nd re-ask glow the right answer
        const tk = e.talk || world.talk;
        if (tk && e.n <= 3) speak(T(tk.promptKey, tk.params || {}), { priority: true, interrupt: true });
        if (tk && (e.n >= 2 || e.glowAnswer)) TM.UI.glowTalk(tk.answerId || tk.answer);
        break;
      }
      case 'talkResult': {
        stats.talks++; if (e.correct) stats.talkRight++;
        TM.UI.markTalk(e.choiceId, e.answerId);
        const ans = (world.talk && world.talk.choices.find(c => c.id === e.answerId)) || {};
        if (e.auto) { speak(TM.I18N.talkWrong ? TM.I18N.talkWrong(curLang(), ans) : T('talk.wrong.any'), { interrupt: true }); break; }
        if (e.correct) {
          TM.Audio.play('talkRight');
          render.burst('star', view.W / 2, view.H / 2, { onDone: () => { shownStars++; TM.UI.setStars(shownStars, true); TM.Audio.play('star'); } });
          speak(T('talk.right'), { interrupt: true });
        } else {
          TM.Audio.play('soft');
          speak(TM.I18N.talkWrong ? TM.I18N.talkWrong(curLang(), ans) : T('talk.wrong.any'), { interrupt: true });
        }
        break;
      }
      case 'levelDone':
        TM.Audio.play('level'); TM.UI.say('');
        if (mode === 'talk') { mode = 'play'; TM.UI.only(); }
        $('stage').classList.remove('talking');
        speak(T('great'));
        break;
      case 'sessionDone': {
        TM.Audio.play('fanfare');
        if (weather.setParty) weather.setParty(true);
        render.setGallery(e.pictures || world.pictures);
        render.burst('confetti', 0, 0);
        progress.totalStars += e.stars || 0; progress.sessions++;
        TM.Storage.setJSON('progress', progress);
        shownStars = e.stars || shownStars; TM.UI.setStars(shownStars);
        $('doneStars').textContent = e.stars || 0;
        $('doneTitle').textContent = T('session.done', { stars: e.stars || 0 }).replace(/(\d+) (\S+)/, '$1\u00a0$2');   // keep "39 stars" together
        TM.UI.say(T('party'));   // shown only: 'chest' + 'session.done' are spoken when the chest opens (playtest P2-1)
        mode = 'done';
        TM.UI.only('scrDone'); TM.UI.show('hud', false); TM.UI.say('');
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
    const canMic = S.mic && TM.Voice && TM.Voice.canListen && TM.Voice.canListen() && !FLAGS.bot;
    TM.UI.openTalk(talk, curLang(), id => { TM.Audio.play('click'); world.talkAnswer(id); }, canMic, curAge());
    const q = T(talk.promptKey, talk.params || {});
    speakPrompt(T('talk.intro') + ' ' + q, { priority: true });   // queued after the round's praise, not cutting it off
  }
  function listen() {
    const talk = world.talk;
    if (!talk || world.state !== 'talk' || !TM.Voice || !TM.Voice.canListen()) return;
    if (TM.Voice.stop) TM.Voice.stop();
    TM.Audio.play('listen');
    TM.UI.setListening(true, T('ui.listening'));
    const choices = talk.choices.map(c => ({ id: c.id, words: TM.I18N.choiceWords ? TM.I18N.choiceWords(curLang(), c) : [] }));
    TM.Voice.listen({ lang: curLang(), choices, timeoutMs: 6000 }).then(res => {
      TM.UI.setListening(false, T('ui.tapOrSay'));
      if (world.state !== 'talk') return;
      if (res && res.id != null) world.talkAnswer(res.id);
      else if (res && res.reason === 'not-allowed') { $('btnMic').classList.add('hidden'); speak(T('ui.micDenied')); }
      else speak(T('ui.tapOrSay'));
    }).catch(() => TM.UI.setListening(false, T('ui.tapOrSay')));
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
  let last = 0, slowAcc = 0, pendingResize = false, swishPrev = null, bubbleFaded = false;
  function dragSwish(dt) {   // a soft swish while a held piece moves fast (Audio rate-limits it)
    const p = world.held && pieceOf(world.held);
    // a piece carried up under the (DOM) speech bubble: the bubble steps back so the piece stays visible
    const Bb = world.layout && world.layout.bubble, near = !!(p && Bb && p.y - p.size * 0.6 < Bb.y + Bb.h && p.x + p.size * 0.6 > Bb.x && p.x - p.size * 0.6 < Bb.x + Bb.w);
    if (near !== bubbleFaded) { bubbleFaded = near; TM.UI.fadeBubble(near); }
    if (!p || p.state !== 'held' || !(dt > 0)) { swishPrev = null; return; }
    if (swishPrev && swishPrev.id === p.id) {
      const v = Math.hypot(p.x - swishPrev.x, p.y - swishPrev.y) / dt;
      if (v > 900) TM.Audio.play('swish');
    }
    swishPrev = { id: p.id, x: p.x, y: p.y };
  }
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
      if (mode === 'play') dragSwish(dt);
    }
    weather.update(dt * Math.min(speed, 4), {});
    const sp = speaking();
    TM.Audio.duck(sp);
    if (TM.Audio.tick) TM.Audio.tick(dt);
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
    TM.Audio.play('click');
    mitMood('talk', 1.0);
    if (!lastAsk && !(world.prompt && world.prompt())) return;
    const cp = currentPrompt(); promptUntil = 0; speakPrompt(cp, { interrupt: true });
  }

  function bindUI() {
    TM.Input.kidProof();
    // Input passes two NUMBERS in logical px (never a point object) — VOICE §4
    inputCancel = TM.Input.attach($('game'), {
      toLogical,
      down: (x, y) => { if (mode === 'play' && !bot) world.pointerDown(x, y); },   // a tray piece lifts at once; crab / bubbles react on the press
      move: (x, y) => { if (mode === 'play' && !bot) world.pointerMove(x, y); },   // every move: the piece follows on its spring
      up: (x, y) => { if (mode === 'play' && !bot) world.pointerUp(x, y); },       // release: snap / near miss / wrong / home; a quick tap names it
      cancel: () => { if (world.cancelDrag) world.cancelDrag(); }
    });
    const unlock = () => { TM.Audio.unlock(); if (TM.Voice) TM.Voice.unlock(); };
    ['touchend', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { capture: true, passive: true }));

    $('btnPlay').addEventListener('click', () => { TM.Audio.play('click'); startGame(); });
    $('bubble').addEventListener('click', repeatPrompt);
    $('btnPause').addEventListener('click', () => { TM.Audio.play('click'); pause(); });
    $('btnResume').addEventListener('click', () => { TM.Audio.play('click'); resume(); });
    $('btnHome').addEventListener('click', () => { TM.Audio.play('click'); goTitle(); });
    $('btnAgain').addEventListener('click', () => { TM.Audio.play('click'); startGame(); });
    $('btnDoneHome').addEventListener('click', () => { TM.Audio.play('click'); goTitle(); });
    $('btnMic').addEventListener('click', listen);
    // volume: settings slider + big − / + in the pause menu
    $('optVolume').addEventListener('input', () => { S.volume = +$('optVolume').value / 100; saveSettings(); applyAudio(); });
    $('optVolume').addEventListener('change', () => TM.Audio.play('pop'));
    const vstep = d => { S.volume = Math.max(0, Math.min(1, Math.round(((S.volume == null ? 1 : S.volume) + d) * 20) / 20)); saveSettings(); applyAudio(); TM.Audio.play('pop'); };
    $('btnVolDown').addEventListener('click', () => vstep(-0.1));
    $('btnVolUp').addEventListener('click', () => vstep(0.1));
    document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => {
      S.lang = b.dataset.lang; langOverride = null; saveSettings(); TM.UI.applyLang(curLang()); applyAudio(); TM.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
      updateVoiceInfo();
      TM.Audio.play('click');
      if (mode === 'title') speak(T('ui.welcome'), { interrupt: true });
    }));
    // parent gate: hold the gear for 2 s
    const gear = $('btnParents');
    TM.Input.holdButton(gear, 2000, () => { gear.style.setProperty('--p', 0); openSettings(); },
      p => { gear.style.setProperty('--p', p); gear.classList.toggle('holding', p > 0); });
    gear.addEventListener('click', () => { gear.classList.add('tip'); setTimeout(() => gear.classList.remove('tip'), 1600); });
    TM.UI.bindSettings(S, k => {
      saveSettings();
      if (k === 'sfx' || k === 'music' || k === 'voice') applyAudio();
      if (k === 'age') { ageOverride = null; TM.UI.setTitleInfo(progress.totalStars, curAge(), curLang()); }
      if (k === 'name' && TM.I18N.setChild) TM.I18N.setChild(S.name);
    }, curAge);
    $('btnSettingsDone').addEventListener('click', () => { TM.Audio.play('click'); TM.UI.only('scrTitle'); TM.UI.setTitleInfo(progress.totalStars, curAge(), curLang()); });

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(applySize, 250));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { pause(); TM.Audio.suspend(); if (TM.Voice) TM.Voice.stop(); }
      else TM.Audio.resume();
    });
    window.addEventListener('blur', () => { if (world && world.cancelDrag) world.cancelDrag(); });
  }
  function openSettings() {
    TM.Audio.play('click');
    TM.UI.refreshSettings();
    updateVoiceInfo();
    TM.UI.only('scrSettings');
  }
  function updateVoiceInfo() {
    if (!TM.Voice) return;
    const has = TM.Voice.hasVoice ? TM.Voice.hasVoice(curLang()) : false;
    const nm = TM.Voice.voiceName ? TM.Voice.voiceName(curLang()) : '';
    const mic = TM.Voice.canListen && TM.Voice.canListen();
    const v = has ? (curLang() === 'vi' ? 'Giọng đọc: ' : 'Voice: ') + (nm || '✓') : T('ui.voiceMissing');
    const m = mic ? '' : ' · ' + T('ui.micUnsupported');
    TM.UI.setVoiceInfo(v + m);
  }

  /* ---------- test hooks (DESIGN §5.5) — live getters via defineProperties (never Object.assign) ---------- */
  function hooks() {
    const pt = p => (p ? { x: view.left + p.x * view.s, y: view.top + p.y * view.s } : null);
    const circ = c => (c ? { x: view.left + c.x * view.s, y: view.top + c.y * view.s, r: (c.r || 0) * view.s } : null);
    const box = b => (b ? { x: view.left + b.x * view.s, y: view.top + b.y * view.s, w: (b.w || 0) * view.s, h: (b.h || 0) * view.s } : null);
    const prev = TM.debug || {};
    TM.debug = prev;
    Object.defineProperties(prev, Object.getOwnPropertyDescriptors({
      get world() { return world; }, get weather() { return weather; }, get mode() { return mode; }, stats, events: eventLog,
      get bot() { return bot; },
      voiceLog: (TM.Voice && TM.Voice.log) || prev.voiceLog || [],
      getState() {
        const s = world.stepInfo;
        return { mode, state: world.state, phase: world.phase, level: world.level, topic: world.topic, round: world.round, step: world.step,
          stepMode: s ? s.mode : null, stars: world.stars, misses: world.misses, held: world.held || null, magnet: !!world.magnet,
          pieces: (world.pieces || []).map(p => ({ id: p.id, state: p.state, slot: p.slot })), slots: (world.slots || []).map(q => ({ id: q.id, filled: q.filled })),
          surprise: world.cur && world.cur.surprise, pictures: (world.pictures || []).length,
          weather: weather.ambient && weather.ambient.mood, W: view.W, H: view.H, ins: view.ins, settings: Object.assign({}, S), speed };
      },
      setSpeed(n) { speed = Math.max(0.1, +n || 1); applyAudio(); },
      startGame, goTitle,
      setBot(on, skill) { bot = on ? new TM.Bot(world, { skill: skill == null ? FLAGS.botSkill : skill, seed: 7 }) : null; },
      setAutoRestart(on) { autoRestart = !!on; },
      gotoLevel(i) { world.startLevel(i); },
      view: () => view, render: () => render,
      pieceScreen(id) { return circ(world.pieceHit ? world.pieceHit(id) : null); },
      slotScreen(id) { return pt(world.slotDrop ? world.slotDrop(id) : null); },
      slotZoneScreen(id) { return box(world.slotZone ? world.slotZone(id) : null); },
      boardScreen() { return box(world.boardZone ? world.boardZone() : null); },
      mitScreen() { return box(world.mitHit ? world.mitHit() : null); },   // centre x, y + w, h
      crabScreen() { return circ(world.crabHit ? world.crabHit() : null); },
      bubbleScreen() { return circ(world.bubbleHit ? world.bubbleHit() : null); },
      answer() { return world.answer ? world.answer() : null; },
      toScreen(x, y) { return { x: view.left + x * view.s, y: view.top + y * view.s }; },
      audio: () => TM.Audio
    }));
  }

  /* ---------- boot ---------- */
  async function boot() {
    await TM.Storage.init();
    S = Object.assign({}, DEF, TM.Storage.getJSON('settings', {}));
    Object.assign(progress, TM.Storage.getJSON('progress', {}));
    TM.UI.applyLang(curLang());
    if (TM.I18N && TM.I18N.setChild) TM.I18N.setChild(S.name);
    if (TM.Voice) { TM.Voice.init({ lang: curLang(), enabled: voiceOn(), speed }); const prevStart = TM.Voice.onStart; TM.Voice.onStart = d => { onVoiceStart(d); if (prevStart) prevStart(d); }; }
    render = new TM.Renderer($('game')); TM.render = render;
    world = new TM.World({ seed: FLAGS.seed != null ? FLAGS.seed : (Date.now() & 0x7fffffff), age: curAge(), lang: curLang() });
    weather = new TM.Weather({ width: 960, height: 720, seed: 11 });
    hooks();
    bindUI();
    applySize();
    weather.setWeather(0, { instant: true });
    await TM.Assets.load();
    render.prewarm(world.layout, 0);
    applyAudio();
    if (FLAGS.bot) bot = new TM.Bot(world, { skill: FLAGS.botSkill, seed: 7 });
    TM.UI.only('scrTitle');
    TM.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
    mode = 'title';
    requestAnimationFrame(frame);
    if (FLAGS.autostart) startGame();
    if (TM.Voice && TM.Voice.onVoicesChanged) TM.Voice.onVoicesChanged(updateVoiceInfo);
  }
  window.addEventListener('DOMContentLoaded', () => boot().catch(e => { console.error(e); }));
})(window.TM = window.TM || {});
