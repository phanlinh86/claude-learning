/* FT main (Tumi's Flower Farm) — boots the game, sizes the canvas for any phone/tablet shape, runs the loop and turns
 * world events (pick an icing bag / a cookie, trace the dots, count chips, the cookie hops onto the cooling rack) into voice,
 * sound, effects and UI (docs/VOICE.md §1). Touches reach the world only through FT.Input (HUD / menus never reach the
 * canvas); a trace is fed as continuous moves (world.pointerDown / Move / Up). */
(function (FT) {
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
  // content gives a trace prompt `what` as a name kind ('stroke' | 'shape' | 'number' | 'letter') + `value`; i18n phrases an
  // object {nameKind, nameValue} ("Let's pipe the star!") but would print a bare string as is ("pipe shape")
  const promptParams = (key, p) => (p && /^p\./.test(key) && typeof p.what === 'string' && p.value != null ? Object.assign({}, p, { what: { nameKind: p.what, nameValue: p.value } }) : p);
  const T1 = (key, p) => (FT.I18N ? FT.I18N.t(curLang(), key, Object.assign({ child: S.name || '' }, promptParams(key, p) || {})) : key);
  // never the same wording twice in a row: re-roll a variant that repeats the line just spoken
  const T = (key, p) => { let r = T1(key, p); for (let k = 0; k < 3 && r && r === lastSpoken; k++) r = T1(key, p); return r; };

  /* ---------- settings (URL flags never saved) ---------- */
  const DEF = { age: 4, lang: (navigator.language || 'en').toLowerCase().startsWith('vi') ? 'vi' : 'en', name: '', sfx: true, music: true, voice: true, mic: true, volume: 1 };
  let S = Object.assign({}, DEF);
  let langOverride = FLAGS.lang === 'vi' || FLAGS.lang === 'en' ? FLAGS.lang : null;   // URL ?lang= is session-only
  const curLang = () => langOverride || S.lang;
  let ageOverride = FLAGS.age || null;           // URL ?age= is session-only; a parent's pick wins
  const curAge = () => ageOverride || S.age;
  const saveSettings = () => FT.Storage.setJSON('settings', S);
  const progress = { totalStars: 0, sessions: 0 };

  let world, weather, render, bot = null, inputCancel = null;
  let mode = 'loading';            // loading | title | play | paused | talk | done
  let speed = FLAGS.speed, autoRestart = FLAGS.autorestart;
  let view = { W: 960, H: 720, s: 1, left: 0, top: 0, ins: { top: 0, right: 0, bottom: 0, left: 0 } };
  const stats = { sessions: 0, rounds: 0, correct: 0, wrong: 0, picks: 0, traces: 0, strokes: 0, chips: 0, cookies: 0, talks: 0, talkRight: 0, hints: 0, assists: 0, offPath: 0, frames: 0, slowFrames: 0 };
  // -1e9: a line in the first seconds after page load is not rate-limited
  let promptUntil = 0, lastWrongSay = -1e9, lastSoftSay = -1e9, lastOffSay = -1e9, lastPauseSay = -1e9, idleSaid = 0, shownStars = 0, lastPraise = -1e9;
  let finishSaid = false, progressSaid = false, assistSaid = false, homeSaid = false, traceStartSaid = false, mouseSaid = false, birdSaid = false;
  let pauseAt = 0;

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
    // rotation mid-trace: the finger's old logical point is meaningless now (the trace keeps its progress)
    if (world && (prev.W !== view.W || prev.H !== view.H)) { if (inputCancel && inputCancel.cancel) inputCancel.cancel(); if (world.cancelDrag) world.cancelDrag(); }
    const rs = renderScale();
    const c = $('game');
    c.style.width = view.cssW + 'px'; c.style.height = view.cssH + 'px';
    c.style.left = view.left + 'px'; c.style.top = view.top + 'px';
    render.resize(view.W, view.H, rs);
    world.tapMoveMin = Math.max(24, 18 / view.s);   // ≈ 18 pt of finger wobble is still a tap on small phones
    world.setViewport(view.W, view.H, view.ins);
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
    const r = { x: view.left + B.x * view.s, y: view.top + B.y * view.s, w: B.w * view.s, h: B.h * view.s };
    // the HUD is sized in CSS px, the bubble in logical px: keep them apart on narrow screens
    const hud = $('hud').getBoundingClientRect();
    if (hud.width > 0 && r.x + r.w > hud.left - 10 && r.y < hud.bottom) {
      const roomRight = hud.left - 12 - r.x;
      if (roomRight >= 220) r.w = roomRight;
      else { r.y = hud.bottom + 8; r.w = Math.min(window.innerWidth - r.x - 12 - view.ins.right * view.s, 560); }
    }
    FT.UI.placeBubble(r);
  }
  function updateHudStarTarget() {
    const p = FT.UI.hudStarPoint();
    if (p.x || p.y) render.hudStar = { x: (p.x - view.left) / view.s, y: (p.y - view.top) / view.s };
  }
  let resizeT = 0;
  function onResize() { clearTimeout(resizeT); resizeT = setTimeout(applySize, 120); }

  /* ---------- voice ---------- */
  const voiceOn = () => S.voice && !FLAGS.novoice && speed <= 1.01 && !FLAGS.mute;
  function speak(text, opt) {
    if (!text) return null;
    lastSpoken = text;
    return FT.Voice ? FT.Voice.say(text, opt || {}) : null;
  }
  function applyAudio() {
    FT.Audio.setOptions({ sfx: S.sfx, music: S.music, muted: FLAGS.mute, volume: S.volume == null ? 1 : S.volume });
    if (FT.Voice) { FT.Voice.setLang(curLang()); FT.Voice.setEnabled(voiceOn()); if (FT.Voice.setVolume) FT.Voice.setVolume(S.volume == null ? 1 : S.volume); }
    const vl = $('volLevel'); if (vl) vl.textContent = Math.round((S.volume == null ? 1 : S.volume) * 100) + '%';
    const vs = $('optVolume'); if (vs && document.activeElement !== vs) vs.value = Math.round((S.volume == null ? 1 : S.volume) * 100);
  }
  // the instruction is the most important line: praise / hint lines must not cut it off
  let pendingPrompt = null, promptStart = 0;
  function speakPrompt(txt, opt) {
    // guard until the prompt has started AND finished: queued praise must not cut it off
    pendingPrompt = txt || null; promptStart = performance.now();
    promptUntil = performance.now() + 6000 + 72 * (txt || '').length;
    const p = speak(txt, opt);
    // the line ended (or was dropped / failed / interrupted) without ever starting: lift the guard so a Mochi tap repeats it
    if (p && p.then) p.then(() => { if (pendingPrompt === txt) { pendingPrompt = null; promptUntil = Math.min(promptUntil, performance.now() + 300); } }, () => {});
    if (!voiceOn()) { pendingPrompt = null; promptUntil = performance.now() + 300 + 72 * (txt || '').length; }
  }
  function onVoiceStart(display) {
    if (pendingPrompt && display === pendingPrompt) { promptStart = performance.now(); promptUntil = promptStart + 300 + 72 * display.length; pendingPrompt = null; }
  }
  const canInterrupt = () => performance.now() > promptUntil;
  /** feedback lines (pick / wrong / needPick / offPath …) may interrupt — but never the prompt while it is protected */
  const feedback = (txt) => speak(txt, { interrupt: canInterrupt() });

  /* ---------- game flow ---------- */
  function resetRoundVoice() { finishSaid = false; progressSaid = false; assistSaid = false; homeSaid = false; }
  function startGame() {
    FT.Audio.unlock();
    world.setAge(curAge()); world.setLang(curLang());
    world.lastTopics = FT.Storage.getJSON('lastTopics', null);   // chapters rotate between sessions
    world.newSession({ lastTopics: world.lastTopics });
    if (world.levels) FT.Storage.setJSON('lastTopics', world.levels);
    if (FLAGS.level != null) world.startLevel(Math.max(0, Math.min(3, FLAGS.level | 0)));
    shownStars = 0; FT.UI.setStars(0); lastAsk = null; lastPromptText = ''; traceStartSaid = false; mouseSaid = false; birdSaid = false; resetRoundVoice();
    if (weather.setParty) weather.setParty(false);
    mode = 'play';
    $('stage').classList.remove('talking');
    FT.UI.only(); FT.UI.show('hud'); FT.UI.say('');
    FT.Audio.setMood(world.level || 0); FT.Audio.startMusic();
    applyAudio();
    stats.sessions++;
    requestAnimationFrame(() => { updateHudStarTarget(); applySize(); });
  }
  function goTitle() {
    mode = 'title';
    $('stage').classList.remove('talking');
    if (FT.Voice) FT.Voice.stop();
    FT.Audio.stopMusic();
    FT.UI.only('scrTitle'); FT.UI.show('hud', false); FT.UI.say('');
    FT.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
    weather.setWeather(0, {}); if (weather.setParty) weather.setParty(false);
  }
  function pause() {
    if (mode !== 'play' && mode !== 'talk') return;
    mode = 'paused';
    if (inputCancel && inputCancel.cancel) inputCancel.cancel();
    if (world.cancelDrag) world.cancelDrag();
    if (FT.Voice) { FT.Voice.stop(); if (FT.Voice.stopListening) FT.Voice.stopListening(); }
    FT.Audio.setFlow(false);
    FT.Audio.stopMusic();
    FT.UI.only('scrPause');
  }
  function resume() {
    if (mode !== 'paused') return;
    mode = world.state === 'talk' ? 'talk' : 'play';
    idleSaid = 0;   // a returning child gets the nudges again before the next auto-pause
    if (world.resetNudges) world.resetNudges();
    FT.UI.only(mode === 'talk' ? 'scrTalk' : undefined);
    FT.Audio.startMusic();
    // say the question again so a returning child knows what to do
    if (mode === 'talk' && world.talk) speak(T(world.talk.promptKey, world.talk.params || {}), { priority: true });
    else if (world.state === 'round' && world.phase === 'play') setTimeout(repeatPrompt, 300);
  }

  let lastPromptText = '';
  function currentPrompt() {   // prompts have several wordings: repeat the one Mochi said, word for word
    if (lastPromptText) return lastPromptText;
    const p = world.prompt ? world.prompt() : null;
    return p ? T(p.promptKey, p.params || {}) : '';
  }
  function handleEvents() {
    const evs = world.drainEvents();
    for (const e of evs) onEvent(e);
  }
  let lastAsk = null;
  const step = () => world.stepInfo || null;
  // the event + what main knows: the chapter topic and the step's params (for "2 + 3 is five!")
  function ev2(e) {
    const s = step();
    return Object.assign({ topic: world.topic, params: s ? s.params : (lastAsk && lastAsk.params) }, e);
  }
  function line(fn, e, fallbackKey) {
    const I = FT.I18N;
    if (I && typeof I[fn] === 'function') { try { const t = I[fn](curLang(), e); if (t) return t; } catch (err) { /* fall back */ } }
    return fallbackKey ? T(fallbackKey) : '';
  }
  function mochiMood(m, t) { if (world.mochi) { world.mochi.mood = m; world.mochi.moodT = t; } }

  function onEvent(e) {
    const now = performance.now();
    switch (e.type) {
      case 'level': {
        const wi = e.weather != null ? e.weather : e.level % 4;
        weather.setWeather(wi, {});
        FT.Audio.setMood(wi); FT.Audio.play('chapter');
        FT.UI.setDots(world.roundsPerLevel || 4, 0);
        speak(T('ui.chapter', { n: e.level + 1 }) + '. ' + T('topic.' + e.topic), { interrupt: true });
        speak(T('weather.' + (wi % 4)));   // "Spring blossoms outside!" — queued after the chapter name
        FT.UI.say(T('topic.' + e.topic));
        render.prewarm(world.layout, wi);
        traceStartSaid = false;
        break;
      }
      case 'round': {
        FT.UI.fadeBubble(false);
        stats.rounds++; idleSaid = 0; lastAsk = null; lastPromptText = ''; resetRoundVoice();
        FT.UI.setDots(world.roundsPerLevel || 4, e.round % (world.roundsPerLevel || 4));
        FT.UI.say(T('enter'));   // shown, not spoken: the prompt follows in a second
        break;
      }
      case 'enter': if (e.cookie) FT.Audio.play('whoosh'); break;
      case 'choicePop': FT.Audio.play('pop'); break;
      case 'land': FT.Audio.play('land'); if (e.what === 'tray' && weather.addPuff) weather.addPuff(e.x, e.y + 20, 4); break;
      case 'whoosh': FT.Audio.play('whoosh'); break;
      case 'ask': {
        lastAsk = e; idleSaid = 0; assistSaid = false; progressSaid = false;
        const txt = T(e.promptKey, e.params || {});
        lastPromptText = txt;
        FT.UI.say(txt); speakPrompt(txt, { priority: true });
        if (e.mode === 'trace' && !traceStartSaid && curAge() <= 4 && !/shining|sparkly|chấm sáng|lấp lánh/i.test(txt)) { traceStartSaid = true; speak(T('trace.start')); }   // queued after the prompt
        break;
      }
      case 'pick': {
        stats.picks++; stats.correct++;
        FT.Audio.play(e.kind === 'bag' ? 'squish' : 'pickCookie', { color: e.color });
        if (weather.addSplash && e.kind === 'bag') weather.addSplash(e.x, e.y, e.color, 5);
        const choice = (world.choices || []).find(c => c.id === e.id);
        feedback(line('sayPick', Object.assign(ev2(e), { choice })));
        promptUntil = 0;
        break;
      }
      case 'wrong': {
        stats.wrong++;
        FT.Audio.play('boing');
        render.burst('ring', e.x, e.y, { size: 110 });
        if (now - lastWrongSay > 1500) { lastWrongSay = now; feedback(line('sayWrong', ev2(e), 'hint')); }
        break;
      }
      case 'needPick': {
        FT.Audio.play('soft');
        const s = step();
        if (now - lastSoftSay > 2500) { lastSoftSay = now; feedback(line('sayNeedPick', { mode: s ? s.mode : e.kind === 'bag' ? 'pickBag' : 'pickCookie', color: s ? s.color : null }, 'hint')); }
        break;
      }
      case 'offTap': break;
      case 'traceStart': stats.strokes++; pauseAt = 0; break;
      case 'traceProgress':
        FT.Audio.play('progress', { i: Math.round((e.total || 0) * 4) });
        if (!progressSaid && Math.abs((e.total || 0) - 0.5) < 0.01 && curAge() <= 4 && world.path && world.path.len >= 450) { progressSaid = true; if (canInterrupt()) speak(T('trace.progress')); }
        break;
      case 'strokeDone': FT.Audio.play('stroke'); if ((e.i | 0) === 0) feedback(T('trace.stroke')); break;   // only after the 1st stroke: the chime carries the rest (playtest P3-15)
      case 'tracePause': pauseAt = now; break;
      case 'traceDone': {
        stats.traces++; pauseAt = 0;
        FT.Audio.setFlow(false);
        FT.Audio.play('traceDone');
        render.burst('sparkles', e.x, e.y, { n: 14, color: e.color });
        promptUntil = 0; pendingPrompt = null;   // lift the guard: the praise interrupts
        speak(line('sayTraceDone', Object.assign({ topic: world.topic }, step() || { what: e.what, value: e.value, color: e.color }), 'trace.done.any'), { interrupt: true });
        break;
      }
      case 'offPath':
      case 'traceTap':
        stats.offPath++;
        FT.Audio.play('soft');
        if (now - lastOffSay > 4000) { lastOffSay = now; feedback(T(e.type)); }
        break;
      case 'chipDrop': FT.Audio.play('chipDrop'); break;
      case 'chip': {
        stats.chips++;
        FT.Audio.play('tock'); FT.Audio.play('count', { i: e.i });
        render.burst('count', e.x, e.y - 50, { n: e.i });
        speak(line('sayCount', e.i) || String(e.i) + '!');   // queued, never interrupting: a fast child hears the newest numbers
        promptUntil = now + 700;
        break;
      }
      case 'chipsDone': FT.Audio.play('chipsDone'); speak(line('sayChipsDone', { n: e.n })); break;
      case 'already': {
        FT.Audio.play('soft');
        if (now - lastSoftSay > 2500 && canInterrupt()) { lastSoftSay = now; speak(T('already')); }
        break;
      }
      case 'stepDone': break;
      case 'hint': {
        stats.hints++;
        FT.Audio.play('hint');
        mochiMood('point', 1.6);
        if (e.target === 'path') speak(T('hint.path'));
        else if (!e.idle) speak(T('hint'));   // queued: the feedback line goes first
        break;
      }
      case 'assist':
        stats.assists++;
        FT.Audio.play(e.magic ? 'magic' : 'hint');
        if (!assistSaid) { assistSaid = true; feedback(T('assist')); }
        break;
      case 'idle':
        if (++idleSaid <= 4) speak(T('idle') + ' ' + currentPrompt());   // then stay quiet: maybe nobody is there
        else if (idleSaid >= 5 && !bot) pause();   // ≈ 2 min without a touch: nobody is playing — pause
        break;
      case 'pokeMochi': {
        const since = now - promptStart;
        const stuck = pendingPrompt && since > 6000;   // the prompt never started (no voice / dropped): don't wait forever
        if (since > 3000 && (!pendingPrompt || stuck)) repeatPrompt();
        else if (world.mochi && world.mochi.mood === 'talk') mochiMood('idle', 0);   // no line follows: no silent mouth flaps
        break;
      }
      case 'soft': FT.Audio.play('pat'); break;   // a long press / drag: a gentle pat, no words
      case 'finish':
        FT.Audio.play('finish');
        if (weather.burst) weather.burst(e.x, e.y - 40, { kind: 'sparkle', n: 10 });
        if (!finishSaid) { finishSaid = true; FT.UI.say(T('finish')); }   // bubble only: the traceDone + round praise already speak (playtest P2-9)
        break;
      case 'walk': FT.Audio.play('walk'); break;
      case 'home':
        FT.Audio.play('home');
        render.burst('sparkles', e.x, e.y, { n: 12, color: '#FFE7A8' });
        if (!homeSaid) { homeSaid = true; speak(line('sayHome', { animal: e.animal })); }
        break;
      case 'hop':
        FT.Audio.play(e.to === 'rack' || e.n === 2 ? 'bigHop' : 'hop');
        if (e.to === 'rack' || e.n === 2) { FT.UI.say(T('hop')); FT.UI.fadeBubble(true); }   // the cookie arcs past the bubble's corner
        break;
      case 'rack':
        stats.cookies++;
        FT.Audio.play('rack');
        if (weather.addPuff) weather.addPuff(e.x, e.y + 10, 5);
        break;
      case 'roundDone': {
        FT.Audio.setFlow(false);
        const n = e.stars || 1, fx = view.W / 2, fy = view.H * 0.45;
        for (let i = 0; i < n; i++) {
          render.burst('star', fx + (i - (n - 1) / 2) * 60, fy, { delay: 0.1 + i * 0.22, onDone: () => { shownStars++; FT.UI.setStars(shownStars, true); FT.Audio.play('star', { i }); } });
        }
        FT.UI.setDots(world.roundsPerLevel || 4, ((e.round != null ? e.round : world.round) % (world.roundsPerLevel || 4)) + 1);
        if (now - lastPraise > 1200) { lastPraise = now; speak(T(e.stars >= 3 ? 'great' : 'praise')); }   // queued
        break;
      }
      case 'bird':
        FT.Audio.play('birdIn');
        if (!birdSaid && canInterrupt()) { birdSaid = true; speak(T('surprise.bird')); }
        break;
      case 'birdTap':
        FT.Audio.play('chirp');
        if (weather.addSplash) weather.addSplash(e.x, e.y, null, 16);
        render.burst('sparkles', e.x, e.y, { n: 8 });
        if ((e.taps || 1) <= 2) feedback(T('bird.tap'));
        break;
      case 'sack': break;
      case 'mouse': FT.Audio.play('peek'); if (!mouseSaid && canInterrupt()) { mouseSaid = true; speak(T('surprise.mouse')); } break;
      case 'mouseTap':
        FT.Audio.play('squeak');
        if (weather.addPuff) weather.addPuff(e.x, e.y, 12);
        render.burst('puff', e.x, e.y, { size: 56 });
        if ((e.taps || 1) <= 2) feedback(T('mouse.tap'));
        break;
      case 'talk': FT.UI.fadeBubble(false); FT.UI.say(''); FT.UI.setDots(world.roundsPerLevel || 4, world.roundsPerLevel || 4); openTalk(e.talk || world.talk); break;
      case 'talkAsk': {   // no answer yet: ask again, and from the 2nd re-ask glow the right answer
        const tk = e.talk || world.talk;
        if (tk && e.n <= 3) speak(T(tk.promptKey, tk.params || {}), { priority: true });
        if (tk && (e.n >= 2 || e.glowAnswer)) FT.UI.glowTalk(tk.answerId || tk.answer);
        break;
      }
      case 'talkResult': {
        stats.talks++; if (e.correct) stats.talkRight++;
        FT.UI.markTalk(e.choiceId, e.answerId);
        const ans = (world.talk && world.talk.choices.find(c => c.id === e.answerId)) || {};
        if (e.correct) {
          FT.Audio.play('talkRight');
          render.burst('star', view.W / 2, view.H / 2, { onDone: () => { shownStars++; FT.UI.setStars(shownStars, true); FT.Audio.play('star'); } });
          speak(T('talk.right'), { interrupt: true });
        } else {
          FT.Audio.play('soft');
          speak(FT.I18N.talkWrong ? FT.I18N.talkWrong(curLang(), ans.thing || ans) : T('talk.wrong.any'), { interrupt: true });
        }
        break;
      }
      case 'levelDone':
        FT.Audio.play('ding'); FT.UI.say('');   // the oven timer: this chapter's cookies are baked
        if (mode === 'talk') { mode = 'play'; FT.UI.only(); }
        $('stage').classList.remove('talking');
        break;
      case 'sessionDone': {
        FT.Audio.setFlow(false);
        FT.Audio.play('fanfare');
        if (weather.setParty) weather.setParty(true);
        render.burst('confetti', 0, 0);
        progress.totalStars += e.stars || 0; progress.sessions++;
        FT.Storage.setJSON('progress', progress);
        shownStars = e.stars || shownStars; FT.UI.setStars(shownStars);
        $('doneStars').textContent = e.stars || 0;
        $('doneTitle').textContent = T('session.done', { stars: e.stars || 0 });
        speak(T('party'), { interrupt: true });
        speak(T('session.done', { stars: e.stars || 0 }));
        mode = 'done';
        FT.UI.only('scrDone'); FT.UI.show('hud', false); FT.UI.say('');
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
    FT.Audio.setFlow(false);
    const canMic = S.mic && FT.Voice && FT.Voice.canListen && FT.Voice.canListen() && !FLAGS.bot;
    FT.UI.openTalk(talk, curLang(), id => { FT.Audio.play('click'); world.talkAnswer(id); }, canMic, curAge());
    const q = T(talk.promptKey, talk.params || {});
    speakPrompt(T('talk.intro') + ' ' + q, { priority: true });   // queued after the round's praise, not cutting it off
  }
  function listen() {
    const talk = world.talk;
    if (!talk || world.state !== 'talk' || !FT.Voice || !FT.Voice.canListen()) return;
    if (FT.Voice.stop) FT.Voice.stop();
    FT.Audio.play('listen');
    FT.UI.setListening(true, T('ui.listening'));
    const choices = talk.choices.map(c => ({ id: c.id, words: FT.I18N.choiceWords ? FT.I18N.choiceWords(curLang(), c) : [] }));
    FT.Voice.listen({ lang: curLang(), choices, timeoutMs: 6000 }).then(res => {
      FT.UI.setListening(false, T('ui.tapOrSay'));
      if (world.state !== 'talk') return;
      if (res && res.id != null) world.talkAnswer(res.id);
      else if (res && res.reason === 'not-allowed') { $('btnMic').classList.add('hidden'); speak(T('ui.micDenied')); }
      else speak(T('ui.tapOrSay'));
    }).catch(() => FT.UI.setListening(false, T('ui.tapOrSay')));
  }

  let boxCache = null, boxT = 0;
  function domBoxes() {   // logo and done-panel rects in logical px (the title art and the gallery avoid them)
    const now = performance.now();
    if (boxCache && now - boxT < 500 && boxCache.mode === mode) return boxCache;
    boxT = now;
    const conv = el => { if (!el) return null; const r = el.getBoundingClientRect(); if (!r.width) return null; return { x: (r.left - view.left) / view.s, y: (r.top - view.top) / view.s, w: r.width / view.s, h: r.height / view.s }; };
    boxCache = { mode, logo: mode === 'title' ? conv(document.querySelector('.title-wrap')) : null, info: mode === 'title' ? conv(document.querySelector('.title-info')) : null,
      done: mode === 'done' ? conv(document.querySelector('.done-panel')) : null };
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
    // the icing squeeze follows the flow; a lift that is not followed by a new press gets a gentle "go on" (≤ 1 per 6 s)
    FT.Audio.setFlow(mode === 'play' && !!world.flowing, world.traceState ? world.traceState.total : 0);
    if (pauseAt && performance.now() - pauseAt > 3000) {
      pauseAt = 0;
      const nowp = performance.now();
      if (mode === 'play' && world.interactive && world.stepInfo && world.stepInfo.mode === 'trace' && nowp - lastPauseSay > 6000 && canInterrupt()) { lastPauseSay = nowp; speak(T('trace.pause')); }
    }
    weather.update(dt * Math.min(speed, 4), {});
    const speaking = FT.Voice && FT.Voice.isSpeaking ? FT.Voice.isSpeaking() : false;
    FT.Audio.duck(speaking);
    if (FT.Audio.tick) { FT.Audio.gust = weather.gust || 0; FT.Audio.tick(dt); }
    render.draw(world, weather, { boxes: domBoxes(), dt: dt * Math.min(speed, 4), lang: curLang(), title: mode === 'title' || mode === 'loading', speaking, done: mode === 'done', debug: FLAGS.debug });
    adapt(raw);
  }
  function adapt(raw) {  // adaptive quality: step the render scale down when frames stay slow
    if (raw > 0.5) return;
    if (raw > 0.022) { slowAcc += raw; stats.slowFrames++; } else slowAcc = Math.max(0, slowAcc - raw * 0.5);
    // only the backing store shrinks: World.setViewport would cancel the child's trace
    if (slowAcc > 1.5 && quality > 0.6) { quality *= 0.85; render.quality = Math.max(0.5, quality); slowAcc = 0; pendingResize = true; }
  }

  /* ---------- input ---------- */
  function toLogical(cx, cy) { return { x: (cx - view.left) / view.s, y: (cy - view.top) / view.s }; }
  function repeatPrompt() {
    if (world.state !== 'round') return;
    FT.Audio.play('click');
    mochiMood('talk', 1.0);
    if (!lastAsk && !(world.prompt && world.prompt())) return;
    const cp = currentPrompt(); promptUntil = 0; speakPrompt(cp, { interrupt: true });
  }

  function bindUI() {
    FT.Input.kidProof();
    const live = () => mode === 'play' && !bot;
    inputCancel = FT.Input.attach($('game'), {
      toLogical,
      down: (x, y) => { if (live()) world.pointerDown(x, y); },   // the bird and the mouse react on the press
      move: (x, y) => { if (live()) world.pointerMove(x, y); },   // every (coalesced) sample: the icing follows the finger
      up: (x, y) => { if (live()) world.pointerUp(x, y); },
      cancel: () => { if (world.cancelDrag) world.cancelDrag(); }
    });
    const unlock = () => { FT.Audio.unlock(); if (FT.Voice) FT.Voice.unlock(); };
    ['touchend', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { capture: true, passive: true }));

    $('btnPlay').addEventListener('click', () => { FT.Audio.play('click'); startGame(); });
    $('bubble').addEventListener('click', repeatPrompt);
    $('btnPause').addEventListener('click', () => { FT.Audio.play('click'); pause(); });
    $('btnResume').addEventListener('click', () => { FT.Audio.play('click'); resume(); });
    $('btnHome').addEventListener('click', () => { FT.Audio.play('click'); goTitle(); });
    $('btnAgain').addEventListener('click', () => { FT.Audio.play('click'); startGame(); });
    $('btnDoneHome').addEventListener('click', () => { FT.Audio.play('click'); goTitle(); });
    $('btnMic').addEventListener('click', listen);
    // volume: settings slider + big − / + in the pause menu
    $('optVolume').addEventListener('input', () => { S.volume = +$('optVolume').value / 100; saveSettings(); applyAudio(); });
    $('optVolume').addEventListener('change', () => FT.Audio.play('pop'));
    const vstep = d => { S.volume = Math.max(0, Math.min(1, Math.round(((S.volume == null ? 1 : S.volume) + d) * 20) / 20)); saveSettings(); applyAudio(); FT.Audio.play('pop'); };
    $('btnVolDown').addEventListener('click', () => vstep(-0.1));
    $('btnVolUp').addEventListener('click', () => vstep(0.1));
    document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => {
      S.lang = b.dataset.lang; langOverride = null; saveSettings(); FT.UI.applyLang(curLang()); applyAudio(); FT.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
      updateVoiceInfo();
      FT.Audio.play('click');
      if (mode === 'title') speak(T('ui.welcome'), { interrupt: true });
    }));
    // parent gate: hold the gear for 2 s
    const gear = $('btnParents');
    FT.Input.holdButton(gear, 2000, () => { gear.style.setProperty('--p', 0); openSettings(); },
      p => { gear.style.setProperty('--p', p); gear.classList.toggle('holding', p > 0); });
    gear.addEventListener('click', () => { gear.classList.add('tip'); setTimeout(() => gear.classList.remove('tip'), 1600); });
    FT.UI.bindSettings(S, k => {
      saveSettings();
      if (k === 'sfx' || k === 'music' || k === 'voice') applyAudio();
      if (k === 'age') { ageOverride = null; FT.UI.setTitleInfo(progress.totalStars, curAge(), curLang()); }
      if (k === 'name' && FT.I18N.setChild) FT.I18N.setChild(S.name);
    }, curAge);
    $('btnSettingsDone').addEventListener('click', () => { FT.Audio.play('click'); FT.UI.only('scrTitle'); FT.UI.setTitleInfo(progress.totalStars, curAge(), curLang()); });

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(applySize, 250));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { pause(); FT.Audio.suspend(); if (FT.Voice) FT.Voice.stop(); }
      else FT.Audio.resume();
    });
    window.addEventListener('blur', () => { if (world && world.cancelDrag) world.cancelDrag(); });
  }
  function openSettings() {
    FT.Audio.play('click');
    FT.UI.refreshSettings();
    updateVoiceInfo();
    FT.UI.only('scrSettings');
  }
  function updateVoiceInfo() {
    if (!FT.Voice) return;
    const has = FT.Voice.hasVoice ? FT.Voice.hasVoice(curLang()) : false;
    const nm = FT.Voice.voiceName ? FT.Voice.voiceName(curLang()) : '';
    const mic = FT.Voice.canListen && FT.Voice.canListen();
    const v = has ? (curLang() === 'vi' ? 'Giọng đọc: ' : 'Voice: ') + (nm || '✓') : T('ui.voiceMissing');
    const m = mic ? '' : ' · ' + T('ui.micUnsupported');
    FT.UI.setVoiceInfo(v + m);
  }

  /* ---------- test hooks (DESIGN §5.6) ---------- */
  function hooks() {
    const pt = p => (p ? { x: view.left + p.x * view.s, y: view.top + p.y * view.s } : null);
    const circ = c => (c ? { x: view.left + c.x * view.s, y: view.top + c.y * view.s, r: (c.r || 0) * view.s } : null);
    const prev = FT.debug || {};
    FT.debug = prev;
    Object.defineProperties(prev, Object.getOwnPropertyDescriptors({
      get world() { return world; }, get weather() { return weather; }, get mode() { return mode; }, stats,
      get bot() { return bot; },
      voiceLog: (FT.Voice && FT.Voice.log) || prev.voiceLog || [],
      getState() {
        const s = world.stepInfo;
        return { mode, state: world.state, phase: world.phase, level: world.level, topic: world.topic, round: world.round, step: world.step,
          stepMode: s ? s.mode : null, stars: world.stars, misses: world.misses, interactive: world.interactive,
          bag: world.bag ? { state: world.bag.state, color: world.bag.color } : null,
          trace: world.traceState ? { stroke: world.traceState.stroke, total: world.traceState.total, complete: world.traceState.complete } : null,
          chips: (world.chips || []).length, rack: (world.rackCookies || []).length, cookies: world.cookies,
          choices: (world.choices || []).map(c => c.id), surprise: world.surprise, weather: weather.ambient && weather.ambient.mood,
          W: view.W, H: view.H, ins: view.ins, settings: Object.assign({}, S), speed };
      },
      setSpeed(n) { speed = Math.max(0.1, +n || 1); applyAudio(); },
      startGame, goTitle,
      setBot(on, skill) { bot = on ? new FT.Bot(world, { skill: skill == null ? FLAGS.botSkill : skill, seed: 7 }) : null; },
      setAutoRestart(on) { autoRestart = !!on; },
      gotoLevel(i) { world.startLevel(i); },
      view: () => view, render: () => render,
      choiceScreen(id) { return circ(world.choiceHit ? world.choiceHit(id) : null); },
      /** remaining points of the current stroke, CSS px */
      tracePoints() { return (world.pathScreen ? world.pathScreen() : []).map(p => { const q = pt({ x: p[0], y: p[1] }); return [q.x, q.y]; }); },
      cookieScreen() { const c = world.cookieScreen ? world.cookieScreen() : null; return c ? Object.assign(pt(c), { size: c.size * view.s }) : null; },
      chipScreen() { return pt(world.chipSpot ? world.chipSpot() : null); },
      mochiScreen() { const m = world.mochiHit ? world.mochiHit() : null; return m ? Object.assign(pt(m), { w: m.w * view.s, h: m.h * view.s }) : null; },   // centre + size, CSS px
      birdScreen() { return circ(world.birdHit ? world.birdHit() : null); },
      mouseScreen() { return circ(world.mouseHit ? world.mouseHit() : null); },
      answer() { return world.answer ? world.answer() : null; },
      toScreen(x, y) { return { x: view.left + x * view.s, y: view.top + y * view.s }; },
      audio: () => FT.Audio
    }));
  }

  /* ---------- boot ---------- */
  async function boot() {
    await FT.Storage.init();
    S = Object.assign({}, DEF, FT.Storage.getJSON('settings', {}));
    Object.assign(progress, FT.Storage.getJSON('progress', {}));
    FT.UI.applyLang(curLang());
    if (FT.I18N && FT.I18N.setChild) FT.I18N.setChild(S.name);
    if (FT.Voice) { FT.Voice.init({ lang: curLang(), enabled: voiceOn() }); const prevStart = FT.Voice.onStart; FT.Voice.onStart = d => { onVoiceStart(d); if (prevStart) prevStart(d); }; }
    render = new FT.Renderer($('game')); FT.render = render;
    world = new FT.World({ seed: FLAGS.seed != null ? FLAGS.seed : (Date.now() & 0x7fffffff), age: FLAGS.age || S.age, lang: curLang() });
    weather = new FT.Weather({ width: 960, height: 720, seed: 11 });
    hooks();
    bindUI();
    applySize();
    weather.setWeather(0, { instant: true });
    await FT.Assets.load();
    render.prewarm(world.layout, 0);
    applyAudio();
    if (FLAGS.bot) bot = new FT.Bot(world, { skill: FLAGS.botSkill, seed: 7 });
    FT.UI.only('scrTitle');
    FT.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
    mode = 'title';
    requestAnimationFrame(frame);
    if (FLAGS.autostart) startGame();
    if (FT.Voice && FT.Voice.onVoicesChanged) FT.Voice.onVoicesChanged(updateVoiceInfo);
  }
  window.addEventListener('DOMContentLoaded', () => boot().catch(e => { console.error(e); }));
})(window.FT = window.FT || {});
