/* RB main (Bop's Rainy Band) — boots the game, sizes the canvas for any phone/tablet shape, runs the loop and turns
 * world events into voice, sound, effects and UI. */
(function (RB) {
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
  const T = (key, p) => (RB.I18N ? RB.I18N.t(curLang(), key, Object.assign({ child: S.name || '' }, p || {})) : key);
  const NAME = (kind, v) => (RB.I18N ? RB.I18N.name(curLang(), kind, v) : String(v));

  /* ---------- settings (URL flags never saved) ---------- */
  const DEF = { age: 4, lang: (navigator.language || 'en').toLowerCase().startsWith('vi') ? 'vi' : 'en', name: '', sfx: true, music: true, voice: true, mic: true, volume: 1 };
  let S = Object.assign({}, DEF);
  let langOverride = FLAGS.lang === 'vi' || FLAGS.lang === 'en' ? FLAGS.lang : null;   // URL ?lang= is session-only
  const curLang = () => langOverride || S.lang;
  let ageOverride = FLAGS.age || null;           // URL ?age= is session-only; a parent's pick wins
  const curAge = () => ageOverride || S.age;
  const saveSettings = () => RB.Storage.setJSON('settings', S);
  const progress = { totalStars: 0, sessions: 0 };

  let world, weather, render, bot = null;
  let mode = 'loading';            // loading | title | play | paused | talk | done
  let speed = FLAGS.speed, autoRestart = FLAGS.autorestart;
  let view = { W: 960, H: 720, s: 1, left: 0, top: 0, ins: { top: 0, right: 0, bottom: 0, left: 0 } };
  const stats = { sessions: 0, rounds: 0, correct: 0, wrong: 0, misses: 0, talks: 0, talkRight: 0, frames: 0, slowFrames: 0 };
  let lastBoop = 0, surpriseLine = '', promptUntil = 0, lastWrongSay = 0, idleSaid = 0, lastName = '', shownStars = 0, lastRoundEvt = null, lastGrabSay = 0, lastPraise = 0, lastMissSay = 0;

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
    const out = [h.width > 0 ? box(h, 8) : { x: view.W - view.ins.right - 430, y: 0, w: 430, h: view.ins.top + 115 }];
    if (b.width > 0) out.push(box(b, 10));
    return out;
  }
  function applySize() {
    const prev = view;
    view = computeView();
    if (world) world.hudKeep = measureHud();
    // rotation mid-tap: the finger's old logical point is meaningless now
    if (world && world.cancelDrag && (prev.W !== view.W || prev.H !== view.H)) world.cancelDrag();
    const rs = renderScale();
    const c = $('game');
    c.style.width = view.cssW + 'px'; c.style.height = view.cssH + 'px';
    c.style.left = view.left + 'px'; c.style.top = view.top + 'px';
    render.resize(view.W, view.H, rs);
    world.tapMoveMin = Math.max(24, 18 / view.s);   // ≈ 18 pt of finger wobble is still a tap on small phones
    world.setViewport(view.W, view.H, view.ins);
    // the world re-lays out the stage, the band and the song sheet itself in setViewport (rotation mid-tap is safe)
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
      if (roomRight >= 260) r.w = roomRight;
      else { r.y = hud.bottom + 8; r.w = Math.min(window.innerWidth - r.x - 12 - view.ins.right * view.s, 560); }
    }
    RB.UI.placeBubble(r);
  }
  function updateHudStarTarget() {
    const p = RB.UI.hudStarPoint();
    if (p.x || p.y) render.hudStar = { x: (p.x - view.left) / view.s, y: (p.y - view.top) / view.s };
  }
  let resizeT = 0;
  function onResize() { clearTimeout(resizeT); resizeT = setTimeout(applySize, 120); }

  /* ---------- voice ---------- */
  const voiceOn = () => S.voice && !FLAGS.novoice && speed <= 1.01 && !FLAGS.mute;
  function speak(text, opt) {
    if (!text) return;
    if (RB.Voice) RB.Voice.say(text, opt || {});
  }
  function applyAudio() {
    RB.Audio.setOptions({ sfx: S.sfx, music: S.music, muted: FLAGS.mute, volume: S.volume == null ? 1 : S.volume });
    if (RB.Voice) { RB.Voice.setLang(curLang()); RB.Voice.setEnabled(voiceOn()); if (RB.Voice.setVolume) RB.Voice.setVolume(S.volume == null ? 1 : S.volume); }
    const vl = $('volLevel'); if (vl) vl.textContent = Math.round((S.volume == null ? 1 : S.volume) * 100) + '%';
    const vs = $('optVolume'); if (vs && document.activeElement !== vs) vs.value = Math.round((S.volume == null ? 1 : S.volume) * 100);
  }
  // the instruction is the most important line: praise / wrong lines must not cut it off (playtest P1-2)
  let pendingPrompt = null, promptStart = 0;
  function speakPrompt(txt, opt) {
    // guard until the prompt has started AND finished: queued praise must not cut it off (playtest P1-1)
    pendingPrompt = txt || null; promptStart = performance.now();
    promptUntil = performance.now() + 6000 + 72 * (txt || '').length;
    speak(txt, opt);
    if (!voiceOn()) { pendingPrompt = null; promptUntil = performance.now() + 300 + 72 * (txt || '').length; }
  }
  function onVoiceStart(display) {
    if (pendingPrompt && display === pendingPrompt) { promptStart = performance.now(); promptUntil = promptStart + 300 + 72 * display.length; pendingPrompt = null; }
  }
  const canInterrupt = () => performance.now() > promptUntil;
  function promptText(e) {
    return T(e.promptKey, e.params || {});
  }

  /* ---------- game flow ---------- */
  function startGame() {
    RB.Audio.unlock();
    world.setAge(curAge()); world.setLang(curLang());
    world.lastTopics = RB.Storage.getJSON('lastTopics', null);   // chapters rotate between sessions
    world.newSession({ lastTopics: world.lastTopics });
    if (world.levels) RB.Storage.setJSON('lastTopics', world.levels);
    if (FLAGS.level != null) world.startLevel(Math.max(0, Math.min(3, FLAGS.level | 0)));
    shownStars = 0; RB.UI.setStars(0); lastAsk = null; lastPromptText = ''; surpriseLine = '';
    mode = 'play';
    RB.UI.only(); RB.UI.show('hud'); RB.UI.say('');
    RB.Audio.setMood(world.level || 0); RB.Audio.startMusic();
    applyAudio();
    stats.sessions++;
    requestAnimationFrame(() => { updateHudStarTarget(); placeBubble(); applySize(); });
  }
  function goTitle() {
    mode = 'title';
    $('stage').classList.remove('talking');
    if (RB.Voice) RB.Voice.stop();
    RB.Audio.stopMusic();
    RB.UI.only('scrTitle'); RB.UI.show('hud', false); RB.UI.say('');
    RB.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
    weather.setWeather(0, {}); if (weather.setShower) weather.setShower(0);
    RB.Audio.setSong(false);
  }
  function pause() {
    if (mode !== 'play' && mode !== 'talk') return;
    mode = 'paused';
    if (world.cancelDrag) world.cancelDrag();
    if (RB.Voice) { RB.Voice.stop(); if (RB.Voice.stopListening) RB.Voice.stopListening(); }
    RB.Audio.stopMusic(); RB.Audio.setSong(false);
    RB.UI.only('scrPause');
  }
  function resume() {
    if (mode !== 'paused') return;
    mode = world.state === 'talk' ? 'talk' : 'play';
    idleSaid = 0;   // a returning child gets the nudges again before the next auto-pause
    if (world.resetNudges) world.resetNudges();
    RB.UI.only(mode === 'talk' ? 'scrTalk' : undefined);
    RB.Audio.startMusic();
    if (world.phase === 'song' && RB.Audio.setSong) RB.Audio.setSong(true);
    // say the question again so a returning child knows what to do
    if (mode === 'talk' && world.talk) speak(T(world.talk.promptKey, world.talk.params || {}), { priority: true });
    else if (world.state === 'round' && world.phase === 'ask') setTimeout(repeatPrompt, 300);
  }

  let lastPromptText = '', holdPrompt = null;
  function currentPrompt() {   // prompts have several wordings: repeat the one Bop said, word for word
    if (lastPromptText) return lastPromptText;
    const p = world.prompt ? world.prompt() : null;
    return p ? promptText(p) : (lastRoundEvt ? promptText(lastRoundEvt) : '');
  }
  // names: only when Bop is quiet, and not the same name again within 3 s (playtest M2)
  function sayName(txt, now) {
    if (!txt || (RB.Voice && RB.Voice.isSpeaking())) return;
    if (now - lastGrabSay < 700 || (txt === lastName && now - lastGrabSay < 3000)) return;
    lastGrabSay = now; lastName = txt;
    speak(txt);
  }
  function handleEvents() {
    const evs = world.drainEvents();
    for (const e of evs) onEvent(e);
  }
  let lastAsk = null;
  function ev2(e) { return Object.assign({ topic: world.topic }, lastAsk ? { promptKey: lastAsk.promptKey, params: lastAsk.params, mode: lastAsk.mode, n: lastAsk.n } : {}, e); }
  // a voice helper the voice engineer provides, or a gentle fallback line
  function line(fn, e, fallbackKey) {
    const I = RB.I18N;
    if (I && typeof I[fn] === 'function') { try { const t = I[fn](curLang(), ev2(e)); if (t) return t; } catch (err) { /* fall back */ } }
    return fallbackKey ? T(fallbackKey) : (e && e.nameKind ? NAME(e.nameKind, e.nameValue) : '');
  }
  const hasKey = k => RB.I18N && (RB.I18N.has ? RB.I18N.has(curLang(), k) : T(k) !== k);

  // a count word ("One!", "Two!" …) — the i18n helper, the count.<n> key, or the plain number name
  function countWord(i) {
    const I = RB.I18N;
    if (I && typeof I.sayCount === 'function') { try { const t = I.sayCount(curLang(), i); if (t) return t; } catch (err) { /* fall back */ } }
    const k = 'count.' + i; if (hasKey(k)) return T(k);
    return NAME('number', i) + '!';
  }
  const memberById = id => (world.members || []).find(m => m.id === id) || null;
  function playItem(item, pitch, vol) {   // a member's own sound: its drum note, or the animal's voice
    if (item && item.kind === 'animal') RB.Audio.play('note', { animal: item.animal || item.value, pitch });
    else RB.Audio.play('note', { pitch: pitch || (item && item.pitch) || 64, vol });
  }

  function onEvent(e) {
    const L = world.layout || {}, S0 = L.S || 150;
    switch (e.type) {
      case 'level':
        weather.setWeather(e.level, {});
        if (weather.setShower) weather.setShower(0);
        RB.Audio.setMood(e.level); RB.Audio.play('chapter');
        RB.UI.setDots(world.roundsPerLevel || 4, 0);
        speak(T('ui.chapter', { n: e.level + 1 }) + '. ' + T('topic.' + e.topic), { interrupt: true });
        speak(T('weather.' + e.level));   // "Hello, spring rain!" — queued after the chapter name
        RB.UI.say(T('topic.' + e.topic));
        render.prewarm(world.layout, e.level);
        break;
      case 'round': {
        lastRoundEvt = e; stats.rounds++; idleSaid = 0; lastAsk = null; lastPromptText = '';
        RB.UI.setDots(world.roundsPerLevel || 4, e.round % (world.roundsPerLevel || 4));
        surpriseLine = e.surprise ? T('surprise.' + e.surprise) : '';
        if ((e.round % (world.roundsPerLevel || 4)) === 0) { const d = T('deal'); if (d && d !== 'deal') { RB.UI.say(d); speak(d); } }
        break;
      }
      case 'deal': RB.Audio.play('hop'); break;
      case 'memberIn': RB.Audio.play('appear'); break;
      case 'ask': {
        lastAsk = e; idleSaid = 0;
        const txt = T(e.promptKey, e.params || {});
        lastPromptText = txt;
        RB.UI.say(txt); speakPrompt(txt, { priority: true });
        // listen asks: the beats wait until Bop has finished saying the prompt (playtest P1-1); world falls back after 8 s
        if (e.mode === 'listen' && voiceOn() && world.holdBeats) { holdPrompt = txt; world.holdBeats(true); } else holdPrompt = null;
        break;
      }
      case 'press': RB.Audio.play('press'); break;
      case 'play': {   // the right member plays: its sound, a note flies to the song sheet
        stats.correct++;
        promptUntil = 0; pendingPrompt = null;
        const m = memberById(e.memberId), item = e.item || (m && m.item) || {};
        playItem(item, e.pitch);
        RB.Audio.play('flyNote');
        render.burst('notes', e.x, e.y - S0 * 0.4, { n: 5, color: item.color });
        if (world.bop) { world.bop.mood = 'happy'; world.bop.moodT = 1.0; }
        speak(line('sayPlay', e, 'praise'), { interrupt: true });
        break;
      }
      case 'note': RB.Audio.play('noteIn', { i: e.i || 0 }); if (e.x != null) render.burst('sparkles', e.x, e.y); break;
      case 'wrong': {
        stats.wrong++;
        const m = memberById(e.memberId), item = e.item || (m && m.item) || {};
        playItem(item, e.pitch, 0.18);
        RB.Audio.play('boing');
        render.burst('wrong', e.x, e.y, { size: S0 * 0.9 });
        if (world.bop) { world.bop.mood = 'oops'; world.bop.moodT = 1.0; }
        const nowW = performance.now();
        if (nowW - lastWrongSay > 1500) { lastWrongSay = nowW; speak(line('sayWrong', e, 'hint'), { interrupt: canInterrupt() }); }
        break;
      }
      case 'locked': { const nl = performance.now(); if (nl - lastBoop > 400) { lastBoop = nl; RB.Audio.play('boop'); } break; }
      case 'hint': {
        RB.Audio.play('hint');
        render.burst('hint', e.x, e.y, { size: S0 });
        if (!e.idle) speak(T('hint'));
        break;
      }
      case 'idle':
        if (e.short) { const h = hasKey('hint.drum') ? T('hint.drum') : T('hint'); speak(h, { interrupt: canInterrupt() }); break; }   // counted some, stopped short
        if (++idleSaid <= 4) speak(T('idle') + ' ' + currentPrompt());   // then stay quiet: maybe nobody is there
        else if (idleSaid >= 5 && !bot) pause();   // ≈ 2 min without a tap: nobody is playing — pause
        break;
      case 'pokeBop': case 'pokeLulu':
        if (e.replay) { const r = hasKey('replay') ? T('replay') : ''; if (r) speak(r, { interrupt: true }); }   // the world replays the beats
        else if (performance.now() - promptStart > 3000 && !pendingPrompt) repeatPrompt();
        else if (world.bop) { world.bop.mood = 'happy'; world.bop.moodT = 0.6; }
        break;
      case 'replayBeats': if (world.bop) { world.bop.mood = 'drum_up'; world.bop.moodT = 0.4; } break;
      case 'drumTap': {   // a counting tap on the big drum: boom + the count word (interrupts the last one)
        RB.Audio.play('boom'); RB.Audio.play('count', { i: e.i });
        render.burst('count', e.x + (L.bigDrum ? L.bigDrum.r : 92) * 0.9, e.y - 40, { n: e.i });
        if (world.bop) { world.bop.mood = 'drum'; world.bop.moodT = 0.25; }
        speak(countWord(e.i), { interrupt: true });
        break;
      }
      case 'drumDone': {  // the drum ask is complete: praise after the last count word (queued, never cutting it)
        stats.correct++; promptUntil = 0; pendingPrompt = null;
        RB.Audio.play('flyNote');
        if (world.bop) { world.bop.mood = 'happy'; world.bop.moodT = 1.0; }
        speak(line('sayPlay', Object.assign({ mode: 'drum', promptKey: 'p.drum', params: { n: e.n } }, e), 'praise'));
        break;
      }
      case 'beat': {      // Bop plays the beats in a listen ask: the child counts along (no number shown)
        RB.Audio.play('beat');
        if (world.bop) { world.bop.mood = 'drum'; world.bop.moodT = 0.25; }
        if (e.x != null) render.burst('notes', e.x, e.y - 60, { n: 2 });
        break;
      }
      case 'boom': RB.Audio.play('boom'); if (e.x != null) render.burst('notes', e.x, e.y - 60, { n: 2 }); break;
      case 'songStart': {
        RB.Audio.setSong(true);
        const t = line('saySongStart', e, 'songStart'); if (t && t !== 'songStart') { RB.UI.say(t); speak(t); }   // queued: never cut the last praise
        if (world.bop) { world.bop.mood = 'drum_up'; world.bop.moodT = 0.4; }
        break;
      }
      case 'songNote': {
        const m = e.memberId != null ? memberById(e.memberId) : null;
        if (m) playItem(m.item, e.pitch || m.item.pitch);
        else RB.Audio.play('boom');
        if (e.x != null) render.burst('notes', e.x, e.y - S0 * 0.4, { n: 2, color: m && m.item && m.item.color });
        if (world.bop) { world.bop.mood = (e.i % 2) ? 'drum_up' : 'drum'; world.bop.moodT = 0.3; }
        break;
      }
      case 'songEnd': {
        RB.Audio.setSong(false);
        RB.Audio.play('round');
        if (world.bop) { world.bop.mood = 'cheer'; world.bop.moodT = 2.4; }
        const t = line('saySongEnd', e, 'songEnd'); if (t && t !== 'songEnd') { RB.UI.say(t); speak(t); }
        break;
      }
      case 'roundDone': {
        RB.Audio.setSong(false);
        const n = e.stars || 1, sh = L.sheet || {}, fx = e.x || ((sh.x0 + sh.x1) / 2) || view.W / 2, fy = e.y || sh.y || view.H / 3;
        for (let i = 0; i < n; i++) {
          render.burst('star', fx, fy, { delay: 0.15 + i * 0.22, onDone: () => { shownStars++; RB.UI.setStars(shownStars, true); RB.Audio.play('star', { i }); } });
        }
        RB.UI.setDots(world.roundsPerLevel || 4, ((e.round != null ? e.round : world.round) % (world.roundsPerLevel || 4)) + 1);
        break;
      }
      case 'clearNote': RB.Audio.play('twinkle'); if (e.x != null) render.burst('sparkles', e.x, e.y); break;
      case 'memberOut': RB.Audio.play('hop'); break;
      case 'snail': {
        RB.Audio.play('bell');
        const sl = T('surprise.snail'); if (sl && sl !== 'surprise.snail') speak(sl, { interrupt: canInterrupt() });
        break;
      }
      case 'snailTap': {
        RB.Audio.play('bell'); RB.Audio.play('sparkle');
        render.burst('sparkles', e.x, e.y);
        speak(T('snail.tap'), { interrupt: canInterrupt() });
        break;
      }
      case 'snailRing': RB.Audio.play('bell'); break;
      case 'shower': {
        RB.Audio.play('shower'); RB.Audio.play('umbrella');
        if (weather.setShower) weather.setShower(1);
        setTimeout(() => { if (weather.setShower) weather.setShower(0); }, 4000 / Math.max(0.25, speed));
        if (world.bop) { world.bop.mood = 'umbrella'; world.bop.moodT = 2.5; }
        const gl = T('surprise.shower'); if (gl && gl !== 'surprise.shower') speak(gl, { interrupt: canInterrupt() });
        break;
      }
      case 'raindrop': RB.Audio.play('plink', { pitch: e.pitch || 72 }); if (e.x != null) render.burst('splash', e.x, e.y - S0 * 0.3, { size: 30 }); break;
      case 'talk': RB.UI.say(''); RB.UI.setDots(world.roundsPerLevel || 4, world.roundsPerLevel || 4); openTalk(e.talk || world.talk); break;
      case 'talkAsk': {   // no answer yet: ask again, and after the 2nd re-ask glow the right answer
        const tk = e.talk || world.talk;
        if (tk && e.n <= 3) speak(T(tk.promptKey, tk.params || {}), { priority: true });   // stop talking to an empty room
        if (e.n >= 4 && !bot) { pause(); break; }
        if (tk && (e.n >= 2 || tk.glowAnswer || e.glowAnswer)) RB.UI.glowTalk(tk.answerId);
        break;
      }
      case 'talkResult': {
        stats.talks++; if (e.correct) stats.talkRight++;
        RB.UI.markTalk(e.choiceId, e.answerId);
        const ans = (world.talk && world.talk.choices.find(c => c.id === e.answerId)) || {};
        if (e.correct) {
          RB.Audio.play('talkRight');
          render.burst('star', view.W / 2, view.H / 2, { onDone: () => { shownStars++; RB.UI.setStars(shownStars, true); RB.Audio.play('star'); } });
          speak(T('talk.right'), { interrupt: true });
        } else {
          RB.Audio.play('boing');
          speak(RB.I18N.talkWrong ? RB.I18N.talkWrong(curLang(), ans.kind, ans.value) : T('talk.wrong', { answer: NAME(ans.kind, ans.value) }), { interrupt: true });
        }
        break;
      }
      case 'levelDone':
        RB.Audio.play('level'); RB.UI.say('');
        if (mode === 'talk') { mode = 'play'; RB.UI.only(); }
        $('stage').classList.remove('talking');
        break;
      case 'sessionDone': {
        RB.Audio.setSong(false);
        RB.Audio.play('fanfare');
        weather.setWeather(3, {});                 // the winter party
        if (weather.setShower) weather.setShower(0);
        render.burst('confetti', 0, 0);
        progress.totalStars += e.stars || 0; progress.sessions++;
        RB.Storage.setJSON('progress', progress);
        shownStars = e.stars || shownStars; RB.UI.setStars(shownStars);
        $('doneStars').textContent = e.stars || 0;
        $('doneTitle').textContent = T('session.done', { stars: e.stars || 0 });
        const party = T('party'); if (party && party !== 'party') speak(party, { interrupt: true });
        speak(T('session.done', { stars: e.stars || 0 }));
        mode = 'done';
        RB.UI.only('scrDone'); RB.UI.show('hud', false); RB.UI.say('');
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
    if (world.cancelDrag) world.cancelDrag();
    const canMic = S.mic && RB.Voice && RB.Voice.canListen && RB.Voice.canListen() && !FLAGS.bot;
    RB.UI.openTalk(talk, curLang(), id => { RB.Audio.play('click'); world.talkAnswer(id); }, canMic, curAge());
    const q = T(talk.promptKey, talk.params || {});
    speakPrompt(T('talk.intro') + ' ' + q, { priority: true });   // queued after the round's praise, not cutting it off
  }
  function listen() {
    const talk = world.talk;
    if (!talk || world.state !== 'talk' || !RB.Voice || !RB.Voice.canListen()) return;
    if (RB.Voice.stop) RB.Voice.stop();
    RB.Audio.play('listen');
    RB.UI.setListening(true, T('ui.listening'));
    const choices = talk.choices.map(c => ({ id: c.id, words: RB.I18N.words(curLang(), c.kind, c.value) }));
    RB.Voice.listen({ lang: curLang(), choices, timeoutMs: 6000 }).then(res => {
      RB.UI.setListening(false, T('ui.tapOrSay'));
      if (world.state !== 'talk') return;
      if (res && res.id != null) world.talkAnswer(res.id);
      else if (res && res.reason === 'not-allowed') { $('btnMic').classList.add('hidden'); speak(T('ui.micDenied')); }
      else speak(T('ui.tapOrSay'));
    }).catch(() => RB.UI.setListening(false, T('ui.tapOrSay')));
  }

  let boxCache = null, boxT = 0;
  function domBoxes() {   // logo and done-panel rects in logical px (the title band and the done scene avoid them)
    const now = performance.now();
    if (boxCache && now - boxT < 500) return boxCache;
    boxT = now;
    const conv = el => { if (!el) return null; const r = el.getBoundingClientRect(); if (!r.width) return null; return { x: (r.left - view.left) / view.s, y: (r.top - view.top) / view.s, w: r.width / view.s, h: r.height / view.s }; };
    boxCache = { logo: mode === 'title' ? conv(document.querySelector('.logo')) : null, done: mode === 'done' ? conv(document.querySelector('.done-panel')) : null };
    return boxCache;
  }
  /* ---------- loop ---------- */
  let last = 0, slowAcc = 0, fastAcc = 0, pendingResize = false;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (document.hidden) { last = ts; return; }
    let dt = last ? (ts - last) / 1000 : 0.016;
    last = ts;
    const raw = dt;
    // a backing-store resize clears the canvas: do it before drawing, never between draw and present (pink flash)
    if (pendingResize) { pendingResize = false; render.resize(view.W, view.H, renderScale()); }
    dt = Math.min(dt, 0.1);
    stats.frames++;
    if (mode === 'play' || mode === 'talk' || mode === 'done') {
      let left = dt * speed;
      world.wind = (weather.ambient && weather.ambient.wind) || 0;
      while (left > 1e-6) {
        const step = Math.min(left, 1 / 30);
        if (bot && (mode === 'play' || mode === 'talk')) bot.step(step);
        world.update(step);
        handleEvents();
        left -= step;
      }
    }
    weather.update(dt * Math.min(speed, 4), {});
    const speaking = RB.Voice && RB.Voice.isSpeaking ? RB.Voice.isSpeaking() : false;
    RB.Audio.duck(speaking);
    const am = weather.ambient || {}; RB.Audio.setWeatherLevels(am.rain || 0, am.snow || 0);
    render.draw(world, weather, { boxes: domBoxes(), dt: dt * Math.min(speed, 4), lang: curLang(), title: mode === 'title' || mode === 'loading', speaking, done: mode === 'done', compact: window.innerWidth > window.innerHeight, debug: FLAGS.debug });
    adapt(raw);
  }
  function adapt(raw) {  // adaptive quality: step the render scale down when frames stay slow
    if (raw > 0.5) return;
    if (raw > 0.022) { slowAcc += raw; fastAcc = 0; stats.slowFrames++; } else { slowAcc = Math.max(0, slowAcc - raw * 0.5); fastAcc += raw; }
    // only the backing store shrinks: World.setViewport would cancel the child's drag (sister-game lesson)
    if (slowAcc > 1.5 && quality > 0.6) { quality *= 0.85; render.quality = Math.max(0.5, quality); slowAcc = 0; pendingResize = true; }
  }

  /* ---------- input ---------- */
  function toLogical(cx, cy) { return { x: (cx - view.left) / view.s, y: (cy - view.top) / view.s }; }
  function onDown(p) {
    if (mode !== 'play' || bot) return;
    world.pointerDown(p.x, p.y);   // band members, the big drum, Bop (repeat), the snail
  }
  function repeatPrompt() {
    if (!lastAsk || world.state !== 'round') return;
    RB.Audio.play('click');
    if (world.bop) { world.bop.mood = 'think'; world.bop.moodT = 1.2; }
    if (world._mode && world._mode() === 'listen' && world.phase === 'ask' && world.replayBeats) {   // bubble tap: hear the booms again
      const r = hasKey('replay') ? T('replay') : ''; if (r) speak(r, { interrupt: true });
      world.replayBeats(); return;
    }
    const cp = currentPrompt(); promptUntil = 0; speakPrompt(cp, { interrupt: true });
  }

  function bindUI() {
    RB.Input.kidProof();
    RB.Input.attach($('game'), {
      toLogical,
      down: (x, y) => onDown({ x, y }),       // RB.Input calls handlers with (x, y, ev) in logical px
      move: (x, y) => { if (mode === 'play' && !bot) world.pointerMove(x, y); },
      up: (x, y) => { if (mode === 'play' && !bot) world.pointerUp(x, y); },
      cancel: () => { if (world.cancelDrag) world.cancelDrag(); }
    });
    const unlock = () => { RB.Audio.unlock(); if (RB.Voice) RB.Voice.unlock(); };
    ['touchend', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { capture: true, passive: true }));

    $('btnPlay').addEventListener('click', () => { RB.Audio.play('click'); startGame(); });
    $('bubble').addEventListener('click', repeatPrompt);
    $('btnPause').addEventListener('click', () => { RB.Audio.play('click'); pause(); });
    $('btnResume').addEventListener('click', () => { RB.Audio.play('click'); resume(); });
    $('btnHome').addEventListener('click', () => { RB.Audio.play('click'); goTitle(); });
    $('btnAgain').addEventListener('click', () => { RB.Audio.play('click'); startGame(); });
    $('btnDoneHome').addEventListener('click', () => { RB.Audio.play('click'); goTitle(); });
    $('btnMic').addEventListener('click', listen);
    // volume: settings slider + big − / + in the pause menu
    $('optVolume').addEventListener('input', () => { S.volume = +$('optVolume').value / 100; saveSettings(); applyAudio(); });
    $('optVolume').addEventListener('change', () => RB.Audio.play('pop'));
    const step = d => { S.volume = Math.max(0, Math.min(1, Math.round(((S.volume == null ? 1 : S.volume) + d) * 20) / 20)); saveSettings(); applyAudio(); RB.Audio.play('pop'); };
    $('btnVolDown').addEventListener('click', () => step(-0.1));
    $('btnVolUp').addEventListener('click', () => step(0.1));
    document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => {
      S.lang = b.dataset.lang; langOverride = null; saveSettings(); RB.UI.applyLang(curLang()); applyAudio(); RB.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
      updateVoiceInfo();
      RB.Audio.play('click');
      if (mode === 'title') speak(T('ui.welcome'), { interrupt: true });
    }));
    // parent gate: hold the gear for 2 s
    const gear = $('btnParents');
    RB.Input.holdButton(gear, 2000, () => { gear.style.setProperty('--p', 0); openSettings(); },
      p => { gear.style.setProperty('--p', p); gear.classList.toggle('holding', p > 0); });
    gear.addEventListener('click', () => { gear.classList.add('tip'); setTimeout(() => gear.classList.remove('tip'), 1600); });
    RB.UI.bindSettings(S, k => {
      saveSettings();
      if (k === 'sfx' || k === 'music' || k === 'voice') applyAudio();
      if (k === 'age') { ageOverride = null; RB.UI.setTitleInfo(progress.totalStars, curAge(), curLang()); }
      if (k === 'name' && RB.I18N.setChild) RB.I18N.setChild(S.name);
    }, curAge);
    $('btnSettingsDone').addEventListener('click', () => { RB.Audio.play('click'); RB.UI.only('scrTitle'); RB.UI.setTitleInfo(progress.totalStars, curAge(), curLang()); });

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(applySize, 250));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { pause(); RB.Audio.suspend(); if (RB.Voice) RB.Voice.stop(); }
      else RB.Audio.resume();
    });
    window.addEventListener('blur', () => { if (world && world.cancelDrag) world.cancelDrag(); });
  }
  function openSettings() {
    RB.Audio.play('click');
    RB.UI.refreshSettings();
    updateVoiceInfo();
    RB.UI.only('scrSettings');
  }
  function updateVoiceInfo() {
    if (!RB.Voice) return;
    const has = RB.Voice.hasVoice ? RB.Voice.hasVoice(curLang()) : false;
    const nm = RB.Voice.voiceName ? RB.Voice.voiceName() : '';
    const mic = RB.Voice.canListen && RB.Voice.canListen();
    const v = has ? (curLang() === 'vi' ? 'Giọng đọc: ' : 'Voice: ') + (nm || '✓') : (curLang() === 'vi' ? 'Máy chưa có giọng tiếng Việt — vào Cài đặt › Trợ năng › Nội dung được đọc để tải giọng.' : 'No voice for this language on this device yet.');
    const m = mic ? '' : ' · ' + T('ui.micUnsupported');
    RB.UI.setVoiceInfo(v + m);
  }

  /* ---------- test hooks ---------- */
  function hooks() {
    const box = b => (b ? { x: view.left + b.x * view.s, y: view.top + b.y * view.s, w: b.w * view.s, h: b.h * view.s } : null);
    const prev = RB.debug || {};
    RB.debug = prev;
    Object.defineProperties(prev, Object.getOwnPropertyDescriptors({
      get world() { return world; }, get weather() { return weather; }, get mode() { return mode; }, stats,
      voiceLog: (RB.Voice && RB.Voice.log) || prev.voiceLog || [],
      getState() {
        return { mode, state: world.state, level: world.level, topic: world.topic, round: world.round, stars: world.stars,
          phase: world.phase, ask: world.ask, askMode: world._mode ? world._mode() : (world.prompt && world.prompt() ? world.prompt().mode : null), members: (world.members || []).length,
          notes: world.sheet && world.sheet.notes ? world.sheet.notes.filter(Boolean).length : 0, sheetN: world.sheet ? world.sheet.n : 0, W: view.W, H: view.H, ins: view.ins, settings: Object.assign({}, S), speed };
      },
      setSpeed(n) { speed = Math.max(0.1, +n || 1); applyAudio(); },
      startGame, goTitle,
      setBot(on, skill) { bot = on ? new RB.Bot(world, { skill: skill == null ? FLAGS.botSkill : skill, seed: 7 }) : null; },
      setAutoRestart(on) { autoRestart = !!on; },
      gotoLevel(i) { world.startLevel(i); },
      get bot() { return bot; }, view: () => view, render: () => render,
      memberScreen(id) { return box(world.memberHit ? world.memberHit(id) : null); },
      bigDrumScreen() { return box(world.bigDrumHit ? world.bigDrumHit() : null); },
      bopScreen() { return box(world.bopHit ? world.bopHit() : null); },
      snailScreen() { return box(world.snailHit ? world.snailHit() : null); },
      answerId() { return world.answerId ? world.answerId() : null; },
      toScreen(x, y) { return { x: view.left + x * view.s, y: view.top + y * view.s }; },
      audio: () => RB.Audio
    }));
  }

  /* ---------- boot ---------- */
  async function boot() {
    await RB.Storage.init();
    S = Object.assign({}, DEF, RB.Storage.getJSON('settings', {}));
    Object.assign(progress, RB.Storage.getJSON('progress', {}));
    RB.UI.applyLang(curLang());
    if (RB.I18N && RB.I18N.setChild) RB.I18N.setChild(S.name);
    if (RB.Voice) { RB.Voice.init({ lang: curLang(), enabled: voiceOn() }); const prevStart = RB.Voice.onStart; RB.Voice.onStart = d => { onVoiceStart(d); if (prevStart) prevStart(d); };
      const prevEnd = RB.Voice.onEnd; RB.Voice.onEnd = d => { if (holdPrompt && d === holdPrompt && world && world.holdBeats) { holdPrompt = null; world.holdBeats(false); } if (prevEnd) prevEnd(d); }; }
    render = new RB.Renderer($('game')); RB.render = render;
    world = new RB.World({ seed: FLAGS.seed != null ? FLAGS.seed : (Date.now() & 0x7fffffff), age: FLAGS.age || S.age, lang: curLang() });
    weather = new RB.Weather({ width: 960, height: 720, seed: 11 });
    hooks();
    bindUI();
    applySize();
    weather.setWeather(0, { instant: true });
    await RB.Assets.load();
    render.prewarm(world.layout, 0);
    applyAudio();
    if (FLAGS.bot) bot = new RB.Bot(world, { skill: FLAGS.botSkill, seed: 7 });
    RB.UI.only('scrTitle');
    RB.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
    mode = 'title';
    requestAnimationFrame(frame);
    if (FLAGS.autostart) startGame();
    if (RB.Voice && RB.Voice.onVoicesChanged) RB.Voice.onVoicesChanged(updateVoiceInfo);
  }
  window.addEventListener('DOMContentLoaded', () => boot().catch(e => { console.error(e); }));
})(window.RB = window.RB || {});
