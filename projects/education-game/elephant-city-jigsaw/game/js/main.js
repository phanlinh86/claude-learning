/* PZ main (Pom's Puzzle Town) — boots the game, sizes the canvas for any phone/tablet shape, runs the loop and turns
 * world events (a piece is picked up, it clicks into its shadow, the balloons are counted, the picture comes alive, Pom
 * toots) into voice, sound, effects and UI, following the event → line table in docs/VOICE.md §1.1.
 * Touches reach the world only through PZ.Input (HUD / bubble / menus never reach the canvas). */
(function (PZ) {
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
  const T1 = (key, p) => (PZ.I18N ? PZ.I18N.t(curLang(), key, Object.assign({ child: S.name || '' }, p || {})) : key);
  // never the same wording twice in a row: re-roll a variant that repeats the line just spoken
  const T = (key, p) => { let r = T1(key, p); for (let k = 0; k < 3 && r && r === lastSpoken; k++) r = T1(key, p); return r; };

  /* ---------- settings (URL flags never saved) ---------- */
  const DEF = { age: 4, lang: (navigator.language || 'en').toLowerCase().startsWith('vi') ? 'vi' : 'en', name: '', sfx: true, music: true, voice: true, mic: true, volume: 1 };
  let S = Object.assign({}, DEF);
  let langOverride = FLAGS.lang === 'vi' || FLAGS.lang === 'en' ? FLAGS.lang : null;   // URL ?lang= is session-only
  const curLang = () => langOverride || S.lang;
  // URL ?age= is session-only; a parent's pick wins. Normalised like the world (PZ.Content.ageOf: round, clamp 3–7) so the
  // title shows the age that is really played (functional B1)
  let ageOverride = FLAGS.age ? Math.max(3, Math.min(7, Math.round(FLAGS.age))) : null;
  const curAge = () => ageOverride || S.age;
  const saveSettings = () => PZ.Storage.setJSON('settings', S);
  const progress = { totalStars: 0, sessions: 0 };

  let world, weather, render, bot = null, inputCancel = null;
  let mode = 'loading';            // loading | title | play | paused | talk | done
  let speed = FLAGS.speed, autoRestart = FLAGS.autorestart;
  let view = { W: 960, H: 720, s: 1, left: 0, top: 0, ins: { top: 0, right: 0, bottom: 0, left: 0 } };
  const stats = { sessions: 0, rounds: 0, pickups: 0, correct: 0, wrong: 0, nearMiss: 0, home: 0, taps: 0, hints: 0, assists: 0,
    counts: 0, toots: 0, talks: 0, talkRight: 0, pigeonTaps: 0, bubblePops: 0, frames: 0, slowFrames: 0 };
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
    PZ.UI.placeBubble(r);
  }
  function updateHudStarTarget() {
    const p = PZ.UI.hudStarPoint();
    if (p.x || p.y) render.hudStar = { x: (p.x - view.left) / view.s, y: (p.y - view.top) / view.s };
  }
  let resizeT = 0;
  function onResize() { clearTimeout(resizeT); resizeT = setTimeout(applySize, 120); }

  /* ---------- voice ---------- */
  const voiceOn = () => S.voice && !FLAGS.novoice && speed <= 1.01 && !FLAGS.mute;
  function speak(text, opt) {
    if (!text) return null;
    lastSpoken = text;
    return PZ.Voice ? PZ.Voice.say(text, opt || {}) : null;
  }
  const speaking = () => !!(PZ.Voice && PZ.Voice.isSpeaking && PZ.Voice.isSpeaking());
  function applyAudio() {
    PZ.Audio.setOptions({ sfx: S.sfx, music: S.music, muted: FLAGS.mute, volume: S.volume == null ? 1 : S.volume });
    if (PZ.Voice) { PZ.Voice.setLang(curLang()); PZ.Voice.setEnabled(voiceOn()); if (PZ.Voice.setVolume) PZ.Voice.setVolume(S.volume == null ? 1 : S.volume); if (PZ.Voice.setSpeed) PZ.Voice.setSpeed(speed); }
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
    // the line ended (or was dropped / failed / interrupted) without ever starting: lift the guard so a Pom tap repeats it
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
    PZ.Audio.unlock();
    world.setAge(curAge()); world.setLang(curLang());
    world.lastTopics = PZ.Storage.getJSON('lastTopics', null);   // chapters rotate between sessions
    world.newSession({ lastTopics: world.lastTopics });
    if (world.levels) PZ.Storage.setJSON('lastTopics', world.levels);
    if (FLAGS.level != null) world.startLevel(Math.max(0, Math.min(3, FLAGS.level | 0)));
    shownStars = 0; PZ.UI.setStars(0); lastAsk = null; lastPromptText = '';
    render.clearGallery();
    if (weather.setParty) weather.setParty(false);
    mode = 'play';
    $('stage').classList.remove('talking');
    PZ.UI.only(); PZ.UI.show('hud'); PZ.UI.say('');
    PZ.Audio.setMood(world.level || 0); PZ.Audio.startMusic();
    applyAudio();
    stats.sessions++;
    requestAnimationFrame(() => { updateHudStarTarget(); applySize(); });
  }
  function goTitle() {
    mode = 'title';
    $('stage').classList.remove('talking');
    if (PZ.Voice) PZ.Voice.stop();
    if (inputCancel && inputCancel.cancel) inputCancel.cancel();
    if (world.cancelDrag) world.cancelDrag();
    PZ.Audio.stopMusic();
    PZ.UI.only('scrTitle'); PZ.UI.show('hud', false); PZ.UI.say('');
    PZ.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
    weather.setWeather(0, {}); if (weather.setParty) weather.setParty(false);
  }
  function pause() {
    if (mode !== 'play' && mode !== 'talk') return;
    mode = 'paused';
    if (inputCancel && inputCancel.cancel) inputCancel.cancel();
    if (world.cancelDrag) world.cancelDrag();
    if (PZ.Voice) { PZ.Voice.stop(); if (PZ.Voice.stopListening) PZ.Voice.stopListening(); }
    PZ.Audio.stopMusic();
    PZ.UI.only('scrPause');
  }
  function resume() {
    if (mode !== 'paused') return;
    mode = world.state === 'talk' ? 'talk' : 'play';
    idleSaid = 0;   // a returning child gets the nudges again before the next auto-pause
    if (world.resetNudges) world.resetNudges();
    PZ.UI.only(mode === 'talk' ? 'scrTalk' : undefined);
    PZ.Audio.startMusic();
    // say the question again so a returning child knows what to do
    if (mode === 'talk' && world.talk) speak(T(world.talk.promptKey, world.talk.params || {}), { priority: true });
    else if (world.state === 'round' && world.phase === 'play') setTimeout(repeatPrompt, 300);
  }

  let lastPromptText = '', lastAsk = null;
  function currentPrompt() {   // prompts have several wordings: repeat the one Pom said, word for word
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
    const I = PZ.I18N;
    if (I && typeof I[fn] === 'function') { try { const t = I[fn](curLang(), e); if (t) return t; } catch (err) { /* fall back */ } }
    return fallbackKey ? T(fallbackKey) : '';
  }
  function pomMood(m, t) { if (world.pom) { world.pom.mood = m; world.pom.moodT = t; } }
  function askText(e) {
    const I = PZ.I18N;
    if (I && I.ask) { try { return I.ask(curLang(), e.promptKey, Object.assign({ child: S.name || '' }, e.params || {}), { next: !e.first && e.step > 0 }); } catch (err) { /* fall back */ } }
    return T(e.promptKey, e.params || {});
  }
  const colorOf = th => (th && th.color) || (th && th.kind === 'bunch' ? 'yellow' : th && th.kind === 'animal' ? 'green' : 'orange');

  function onEvent(e) {
    switch (e.type) {
      case 'level': {
        const wi = (e.weather != null ? e.weather : e.level) % 4;
        weather.setWeather(wi, {});
        PZ.Audio.setMood(wi); PZ.Audio.play('chapter');
        PZ.UI.setDots(world.roundsPerLevel || 4, 0);
        speak(T('ui.chapter', { n: e.level + 1 }) + '. ' + T('topic.' + e.topic), { interrupt: true });
        speak(T('weather.' + wi));   // queued after the chapter name
        PZ.UI.say(T('topic.' + e.topic));
        render.prewarm(world.layout, wi);
        break;
      }
      case 'round': {
        PZ.UI.fadeBubble(false);
        stats.rounds++; idleSaid = 0; lastAsk = null; lastPromptText = '';
        PZ.UI.setDots(world.roundsPerLevel || 4, e.round % (world.roundsPerLevel || 4));
        PZ.UI.say(T('enter'));   // shown, not spoken: the prompt follows in a second
        break;
      }
      case 'boardIn': PZ.Audio.play('swoosh'); break;
      case 'pieceLand': PZ.Audio.play('land', { i: e.i || 0 }); if (weather.addDust) weather.addDust(e.x, e.y, 3); break;
      case 'ask': {
        lastAsk = e; idleSaid = 0; PZ.UI.fadeBubble(false);
        const txt = askText(e);
        lastPromptText = txt;
        PZ.UI.say(txt); speakPrompt(txt, { priority: true });
        break;
      }
      case 'pickup': {
        stats.pickups++;
        PZ.Audio.play('pickup', { color: colorOf(e.thing) });
        const now = performance.now();
        // the piece's name — never over a protected prompt (the plip is enough), not twice for the same piece within 2 s
        if (canInterrupt() && !(lastNamed.id === e.id && now - lastNamed.t < 2000)) {
          lastNamed = { id: e.id, t: now };
          speak(line('sayPickup', ev2(e)), { interrupt: true });
        }
        break;
      }
      case 'tapPiece': {
        stats.taps++;
        PZ.Audio.play('hop');
        const now = performance.now();
        if (canInterrupt() && !(lastNamed.id === e.id && now - lastNamed.t < 1200)) { lastNamed = { id: e.id, t: now }; speak(line('sayTap', ev2(e)), { interrupt: true }); }
        break;
      }
      case 'placed': {
        stats.correct++;
        promptUntil = 0; pendingPrompt = null;
        PZ.Audio.play('snap', { color: colorOf(e.thing) });
        render.burst('sparkles', e.x, e.y, { n: 14, color: e.thing && e.thing.color });
        render.burst('ring', e.x, e.y, { size: 150, rgb: '255,236,170' });
        if (weather.burst) weather.burst(e.x, e.y, { kind: 'sparkle', n: 6 });
        // Pom named this piece at pickup a moment ago: a short "Click! It fits!" (colours / shapes / size / animals; counting,
        // letters and maths keep their long lines) — playtest P3-1
        const named = lastNamed.id === e.id && performance.now() - lastNamed.t < 8000;
        const txt = line('sayPlaced', Object.assign(ev2(e), { named }), 'praise');
        speak(txt, { interrupt: true });
        // a count run ("One, two, three balloons!") is the most important line of the round: nothing may cut it
        if (e.count) promptUntil = performance.now() + 900 + 600 * (e.count.n || 1);
        break;
      }
      case 'count': {   // the world lights balloon / dot i: a rising chime + the numeral (the words are the placed line's run)
        stats.counts++;
        PZ.Audio.play('count', { i: e.i });
        const p = pieceOf(e.id);
        render.burst('count', e.x, e.y - ((p && p.size) || 110) * 0.72, { n: e.i });
        break;
      }
      case 'stepDone': if (!e.last) PZ.Audio.play('stepDone'); break;
      case 'nearMiss': {
        stats.nearMiss++;
        PZ.Audio.play('hm'); PZ.Audio.play('whoosh');
        const nt = T('nearMiss');
        feedback(nt); protect(nt);
        break;
      }
      case 'wrong': {
        stats.wrong++;
        PZ.Audio.play('boing');
        render.burst('ring', e.x, e.y, { size: 120 });
        if (world.pom && world.pom.mood !== 'oops') pomMood('oops', 1.2);
        const now = performance.now();
        if (now - lastWrongSay > 1500) { lastWrongSay = now; const wt = line('sayWrong', ev2(e), 'hint'); feedback(wt); protect(wt); }
        break;
      }
      case 'home': stats.home++; PZ.Audio.play('whoosh'); break;
      case 'soft': PZ.Audio.play('pat'); break;
      case 'hint': {
        stats.hints++;
        PZ.Audio.play('hint');
        if (!e.idle) speak(T('hint'));   // queued: the feedback line goes first
        break;
      }
      case 'assist': stats.assists++; PZ.Audio.play('hint'); speak(T('hint')); break;
      case 'idle':
        if (++idleSaid <= 4) speak(T('idle') + ' ' + currentPrompt());   // then stay quiet: maybe nobody is there
        else if (idleSaid >= 5 && !bot) pause();   // ≈ 2 min without a touch: nobody is playing — pause
        break;
      case 'pokePom': {
        // never restart the prompt while Pom is still saying it
        if (speaking() && lastSpoken === lastPromptText) { pomMood('idle', 0); break; }
        const since = performance.now() - promptStart;
        const stuck = pendingPrompt && since > 6000;   // the prompt never started (no voice / dropped): don't wait forever
        if (since > 3000 && (!pendingPrompt || stuck)) repeatPrompt();
        else if (world.pom && world.pom.mood === 'talk') pomMood('idle', 0);   // no line follows: no silent mouth flaps
        break;
      }
      case 'roundDone': {
        const n = e.stars || 1, B = world.layout && world.layout.board;
        const fx = B ? B.x + B.w / 2 : view.W / 2, fy = B ? B.y + B.h * 0.4 : view.H * 0.45;
        PZ.Audio.play('complete');
        for (let i = 0; i < n; i++) {
          render.burst('star', fx + (i - (n - 1) / 2) * 70, fy, { delay: 0.15 + i * 0.22, onDone: () => { shownStars++; PZ.UI.setStars(shownStars, true); PZ.Audio.play('star', { i }); } });
        }
        PZ.UI.setDots(world.roundsPerLevel || 4, ((e.round != null ? e.round : world.round) % (world.roundsPerLevel || 4)) + 1);
        // ONE spoken line (queued, never cutting the last count run): the praise. "The picture is done — look, it moves!" is
        // only shown in the bubble (playtest P2-3 C: two lines made the praise go stale and get dropped)
        PZ.UI.say(T('alive'));
        const now = performance.now();
        if (now - lastPraise > 1200) { lastPraise = now; speak(T(e.stars >= 3 ? 'great' : 'praise')); }
        break;
      }
      case 'alive': {
        PZ.Audio.play('alive');
        const B = world.layout && world.layout.board;
        if (B) for (let i = 0; i < 3; i++) render.burst('sparkles', B.x + B.w * (0.2 + 0.3 * i), B.y + B.h * 0.3, { n: 6 });
        break;
      }
      case 'toot': {
        stats.toots++;
        PZ.Audio.play('toot');
        render.burst('puff', e.x + 20, e.y, { n: 6, vx: 80 });
        if (!speaking()) speak(T('toot'));   // the trumpet carries it; only when nothing else is being said
        break;
      }
      case 'poof': PZ.Audio.play('poof'); render.burst('puff', e.x, e.y, { n: 8 }); render.burst('sparkles', e.x, e.y, { n: 6 }); break;
      case 'boardOut': PZ.Audio.play('fwip'); break;
      case 'pigeon':
        PZ.Audio.play('coo');
        if (canInterrupt()) speak(T('surprise.pigeon'));
        break;
      case 'pigeonTap':
        stats.pigeonTaps++;
        PZ.Audio.play('flutter'); PZ.Audio.play('coo');
        if (weather.burst) weather.burst(e.x, e.y, { kind: 'feathers', n: 8 });
        if (canInterrupt()) speak(T('pigeon.tap'), { interrupt: true });
        break;
      case 'bubbles':
        PZ.Audio.play('bubbles', { n: 3 });
        if (canInterrupt()) speak(T('surprise.bubbles'));
        break;
      case 'bubblePop': {
        stats.bubblePops++;
        PZ.Audio.play('pop');
        render.burst('sparkles', e.x, e.y, { n: 8 });
        const now = performance.now();
        if (now - lastPopSay > 2000 && canInterrupt()) { lastPopSay = now; speak(T('bubble.pop'), { interrupt: true }); }
        break;
      }
      case 'talk': PZ.UI.fadeBubble(false); PZ.UI.say(''); PZ.UI.setDots(world.roundsPerLevel || 4, world.roundsPerLevel || 4); openTalk(e.talk || world.talk); break;
      case 'talkAsk': {   // no answer yet: ask again, and from the 2nd re-ask glow the right answer
        const tk = e.talk || world.talk;
        if (tk && e.n <= 3) speak(T(tk.promptKey, tk.params || {}), { priority: true, interrupt: true });
        if (tk && (e.n >= 2 || e.glowAnswer)) PZ.UI.glowTalk(tk.answerId || tk.answer);
        break;
      }
      case 'talkResult': {
        stats.talks++; if (e.correct) stats.talkRight++;
        PZ.UI.markTalk(e.choiceId, e.answerId);
        const ans = (world.talk && world.talk.choices.find(c => c.id === e.answerId)) || {};
        if (e.auto) { speak(PZ.I18N.talkWrong ? PZ.I18N.talkWrong(curLang(), ans) : T('talk.wrong.any'), { interrupt: true }); break; }
        if (e.correct) {
          PZ.Audio.play('talkRight');
          render.burst('star', view.W / 2, view.H / 2, { onDone: () => { shownStars++; PZ.UI.setStars(shownStars, true); PZ.Audio.play('star'); } });
          speak(T('talk.right'), { interrupt: true });
        } else {
          PZ.Audio.play('soft');
          speak(PZ.I18N.talkWrong ? PZ.I18N.talkWrong(curLang(), ans) : T('talk.wrong.any'), { interrupt: true });
        }
        break;
      }
      case 'levelDone':
        PZ.Audio.play('level'); PZ.UI.say('');
        if (mode === 'talk') { mode = 'play'; PZ.UI.only(); }
        $('stage').classList.remove('talking');
        speak(T('great'));
        break;
      case 'sessionDone': {
        PZ.Audio.play('fanfare');
        if (weather.setParty) weather.setParty(true);
        render.setGallery(e.pictures || world.pictures);
        render.burst('confetti', 0, 0);
        progress.totalStars += e.stars || 0; progress.sessions++;
        PZ.Storage.setJSON('progress', progress);
        shownStars = e.stars || shownStars; PZ.UI.setStars(shownStars);
        $('doneStars').textContent = e.stars || 0;
        $('doneTitle').textContent = T('session.done', { stars: e.stars || 0 });
        speak(T('party'), { interrupt: true });
        speak(T('session.done', { stars: e.stars || 0 }));
        mode = 'done';
        PZ.UI.only('scrDone'); PZ.UI.show('hud', false); PZ.UI.say('');
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
    const canMic = S.mic && PZ.Voice && PZ.Voice.canListen && PZ.Voice.canListen() && !FLAGS.bot;
    PZ.UI.openTalk(talk, curLang(), id => { PZ.Audio.play('click'); world.talkAnswer(id); }, canMic, curAge());
    const q = T(talk.promptKey, talk.params || {});
    speakPrompt(T('talk.intro') + ' ' + q, { priority: true });   // queued after the round's praise, not cutting it off
  }
  function listen() {
    const talk = world.talk;
    if (!talk || world.state !== 'talk' || !PZ.Voice || !PZ.Voice.canListen()) return;
    if (PZ.Voice.stop) PZ.Voice.stop();
    PZ.Audio.play('listen');
    PZ.UI.setListening(true, T('ui.listening'));
    const choices = talk.choices.map(c => ({ id: c.id, words: PZ.I18N.choiceWords ? PZ.I18N.choiceWords(curLang(), c) : [] }));
    PZ.Voice.listen({ lang: curLang(), choices, timeoutMs: 6000 }).then(res => {
      PZ.UI.setListening(false, T('ui.tapOrSay'));
      if (world.state !== 'talk') return;
      if (res && res.id != null) world.talkAnswer(res.id);
      else if (res && res.reason === 'not-allowed') { $('btnMic').classList.add('hidden'); speak(T('ui.micDenied')); }
      else speak(T('ui.tapOrSay'));
    }).catch(() => PZ.UI.setListening(false, T('ui.tapOrSay')));
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
    if (near !== bubbleFaded) { bubbleFaded = near; PZ.UI.fadeBubble(near); }
    if (!p || p.state !== 'held' || !(dt > 0)) { swishPrev = null; return; }
    if (swishPrev && swishPrev.id === p.id) {
      const v = Math.hypot(p.x - swishPrev.x, p.y - swishPrev.y) / dt;
      if (v > 900) PZ.Audio.play('swish');
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
    PZ.Audio.duck(sp);
    if (PZ.Audio.tick) PZ.Audio.tick(dt);
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
    PZ.Audio.play('click');
    pomMood('talk', 1.0);
    if (!lastAsk && !(world.prompt && world.prompt())) return;
    const cp = currentPrompt(); promptUntil = 0; speakPrompt(cp, { interrupt: true });
  }

  function bindUI() {
    PZ.Input.kidProof();
    // Input passes two NUMBERS in logical px (never a point object) — VOICE §4
    inputCancel = PZ.Input.attach($('game'), {
      toLogical,
      down: (x, y) => { if (mode === 'play' && !bot) world.pointerDown(x, y); },   // a tray piece lifts at once; pigeon / bubbles react on the press
      move: (x, y) => { if (mode === 'play' && !bot) world.pointerMove(x, y); },   // every move: the piece follows on its spring
      up: (x, y) => { if (mode === 'play' && !bot) world.pointerUp(x, y); },       // release: snap / near miss / wrong / home; a quick tap names it
      cancel: () => { if (world.cancelDrag) world.cancelDrag(); }
    });
    const unlock = () => { PZ.Audio.unlock(); if (PZ.Voice) PZ.Voice.unlock(); };
    ['touchend', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { capture: true, passive: true }));

    $('btnPlay').addEventListener('click', () => { PZ.Audio.play('click'); startGame(); });
    $('bubble').addEventListener('click', repeatPrompt);
    $('btnPause').addEventListener('click', () => { PZ.Audio.play('click'); pause(); });
    $('btnResume').addEventListener('click', () => { PZ.Audio.play('click'); resume(); });
    $('btnHome').addEventListener('click', () => { PZ.Audio.play('click'); goTitle(); });
    $('btnAgain').addEventListener('click', () => { PZ.Audio.play('click'); startGame(); });
    $('btnDoneHome').addEventListener('click', () => { PZ.Audio.play('click'); goTitle(); });
    $('btnMic').addEventListener('click', listen);
    // volume: settings slider + big − / + in the pause menu
    $('optVolume').addEventListener('input', () => { S.volume = +$('optVolume').value / 100; saveSettings(); applyAudio(); });
    $('optVolume').addEventListener('change', () => PZ.Audio.play('pop'));
    const vstep = d => { S.volume = Math.max(0, Math.min(1, Math.round(((S.volume == null ? 1 : S.volume) + d) * 20) / 20)); saveSettings(); applyAudio(); PZ.Audio.play('pop'); };
    $('btnVolDown').addEventListener('click', () => vstep(-0.1));
    $('btnVolUp').addEventListener('click', () => vstep(0.1));
    document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => {
      S.lang = b.dataset.lang; langOverride = null; saveSettings(); PZ.UI.applyLang(curLang()); applyAudio(); PZ.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
      updateVoiceInfo();
      PZ.Audio.play('click');
      if (mode === 'title') speak(T('ui.welcome'), { interrupt: true });
    }));
    // parent gate: hold the gear for 2 s
    const gear = $('btnParents');
    PZ.Input.holdButton(gear, 2000, () => { gear.style.setProperty('--p', 0); openSettings(); },
      p => { gear.style.setProperty('--p', p); gear.classList.toggle('holding', p > 0); });
    gear.addEventListener('click', () => { gear.classList.add('tip'); setTimeout(() => gear.classList.remove('tip'), 1600); });
    PZ.UI.bindSettings(S, k => {
      saveSettings();
      if (k === 'sfx' || k === 'music' || k === 'voice') applyAudio();
      if (k === 'age') { ageOverride = null; PZ.UI.setTitleInfo(progress.totalStars, curAge(), curLang()); }
      if (k === 'name' && PZ.I18N.setChild) PZ.I18N.setChild(S.name);
    }, curAge);
    $('btnSettingsDone').addEventListener('click', () => { PZ.Audio.play('click'); PZ.UI.only('scrTitle'); PZ.UI.setTitleInfo(progress.totalStars, curAge(), curLang()); });

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(applySize, 250));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { pause(); PZ.Audio.suspend(); if (PZ.Voice) PZ.Voice.stop(); }
      else PZ.Audio.resume();
    });
    window.addEventListener('blur', () => { if (world && world.cancelDrag) world.cancelDrag(); });
  }
  function openSettings() {
    PZ.Audio.play('click');
    PZ.UI.refreshSettings();
    updateVoiceInfo();
    PZ.UI.only('scrSettings');
  }
  function updateVoiceInfo() {
    if (!PZ.Voice) return;
    const has = PZ.Voice.hasVoice ? PZ.Voice.hasVoice(curLang()) : false;
    const nm = PZ.Voice.voiceName ? PZ.Voice.voiceName(curLang()) : '';
    const mic = PZ.Voice.canListen && PZ.Voice.canListen();
    const v = has ? (curLang() === 'vi' ? 'Giọng đọc: ' : 'Voice: ') + (nm || '✓') : T('ui.voiceMissing');
    const m = mic ? '' : ' · ' + T('ui.micUnsupported');
    PZ.UI.setVoiceInfo(v + m);
  }

  /* ---------- test hooks (DESIGN §5.5) — live getters via defineProperties (never Object.assign) ---------- */
  function hooks() {
    const pt = p => (p ? { x: view.left + p.x * view.s, y: view.top + p.y * view.s } : null);
    const circ = c => (c ? { x: view.left + c.x * view.s, y: view.top + c.y * view.s, r: (c.r || 0) * view.s } : null);
    const box = b => (b ? { x: view.left + b.x * view.s, y: view.top + b.y * view.s, w: (b.w || 0) * view.s, h: (b.h || 0) * view.s } : null);
    const prev = PZ.debug || {};
    PZ.debug = prev;
    Object.defineProperties(prev, Object.getOwnPropertyDescriptors({
      get world() { return world; }, get weather() { return weather; }, get mode() { return mode; }, stats, events: eventLog,
      get bot() { return bot; },
      voiceLog: (PZ.Voice && PZ.Voice.log) || prev.voiceLog || [],
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
      setBot(on, skill) { bot = on ? new PZ.Bot(world, { skill: skill == null ? FLAGS.botSkill : skill, seed: 7 }) : null; },
      setAutoRestart(on) { autoRestart = !!on; },
      gotoLevel(i) { world.startLevel(i); },
      view: () => view, render: () => render,
      pieceScreen(id) { return circ(world.pieceHit ? world.pieceHit(id) : null); },
      slotScreen(id) { return pt(world.slotDrop ? world.slotDrop(id) : null); },
      slotZoneScreen(id) { return box(world.slotZone ? world.slotZone(id) : null); },
      boardScreen() { return box(world.boardZone ? world.boardZone() : null); },
      pomScreen() { return box(world.pomHit ? world.pomHit() : null); },   // centre x, y + w, h
      pigeonScreen() { return circ(world.pigeonHit ? world.pigeonHit() : null); },
      bubbleScreen() { return circ(world.bubbleHit ? world.bubbleHit() : null); },
      answer() { return world.answer ? world.answer() : null; },
      toScreen(x, y) { return { x: view.left + x * view.s, y: view.top + y * view.s }; },
      audio: () => PZ.Audio
    }));
  }

  /* ---------- boot ---------- */
  async function boot() {
    await PZ.Storage.init();
    S = Object.assign({}, DEF, PZ.Storage.getJSON('settings', {}));
    Object.assign(progress, PZ.Storage.getJSON('progress', {}));
    PZ.UI.applyLang(curLang());
    if (PZ.I18N && PZ.I18N.setChild) PZ.I18N.setChild(S.name);
    if (PZ.Voice) { PZ.Voice.init({ lang: curLang(), enabled: voiceOn(), speed }); const prevStart = PZ.Voice.onStart; PZ.Voice.onStart = d => { onVoiceStart(d); if (prevStart) prevStart(d); }; }
    render = new PZ.Renderer($('game')); PZ.render = render;
    world = new PZ.World({ seed: FLAGS.seed != null ? FLAGS.seed : (Date.now() & 0x7fffffff), age: curAge(), lang: curLang() });
    weather = new PZ.Weather({ width: 960, height: 720, seed: 11 });
    hooks();
    bindUI();
    applySize();
    weather.setWeather(0, { instant: true });
    await PZ.Assets.load();
    render.prewarm(world.layout, 0);
    applyAudio();
    if (FLAGS.bot) bot = new PZ.Bot(world, { skill: FLAGS.botSkill, seed: 7 });
    PZ.UI.only('scrTitle');
    PZ.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
    mode = 'title';
    requestAnimationFrame(frame);
    if (FLAGS.autostart) startGame();
    if (PZ.Voice && PZ.Voice.onVoicesChanged) PZ.Voice.onVoicesChanged(updateVoiceInfo);
  }
  window.addEventListener('DOMContentLoaded', () => boot().catch(e => { console.error(e); }));
})(window.PZ = window.PZ || {});
