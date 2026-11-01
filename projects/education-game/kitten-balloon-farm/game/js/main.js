/* KB main (Kitten's Balloon Farm) — boots the game, sizes the canvas for any phone/tablet shape, runs the loop and turns
 * world events into voice, sound, effects and UI. */
(function (KB) {
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
  const T = (key, p) => (KB.I18N ? KB.I18N.t(curLang(), key, Object.assign({ child: S.name || '' }, p || {})) : key);
  const NAME = (kind, v) => (KB.I18N ? KB.I18N.name(curLang(), kind, v) : String(v));

  /* ---------- settings (URL flags never saved) ---------- */
  const DEF = { age: 4, lang: (navigator.language || 'en').toLowerCase().startsWith('vi') ? 'vi' : 'en', name: '', sfx: true, music: true, voice: true, mic: true };
  let S = Object.assign({}, DEF);
  let langOverride = FLAGS.lang === 'vi' || FLAGS.lang === 'en' ? FLAGS.lang : null;   // URL ?lang= is session-only
  const curLang = () => langOverride || S.lang;
  let ageOverride = FLAGS.age || null;           // URL ?age= is session-only; a parent's pick wins
  const curAge = () => ageOverride || S.age;
  const saveSettings = () => KB.Storage.setJSON('settings', S);
  const progress = { totalStars: 0, sessions: 0 };

  let world, weather, render, bot = null;
  let mode = 'loading';            // loading | title | play | paused | talk | done
  let speed = FLAGS.speed, autoRestart = FLAGS.autorestart;
  let view = { W: 960, H: 720, s: 1, left: 0, top: 0, ins: { top: 0, right: 0, bottom: 0, left: 0 } };
  const stats = { sessions: 0, rounds: 0, correct: 0, wrong: 0, misses: 0, talks: 0, talkRight: 0, frames: 0, slowFrames: 0 };
  let promptUntil = 0, lastWrongSay = 0, idleSaid = 0, lastName = '', firstAsk = true, shownStars = 0, lastRoundEvt = null, missSay = 0, lastGrabSay = 0, lastPraise = 0;

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
  function applySize() {
    const prev = view;
    view = computeView();
    // rotation while holding an item: the finger's old logical point is meaningless now → put it back quietly
    if (world && world.cancelDrag && (prev.W !== view.W || prev.H !== view.H)) world.cancelDrag();
    const rs = renderScale();
    const c = $('game');
    c.style.width = view.cssW + 'px'; c.style.height = view.cssH + 'px';
    c.style.left = view.left + 'px'; c.style.top = view.top + 'px';
    render.resize(view.W, view.H, rs);
    world.setViewport(view.W, view.H, view.ins);
    // anything still travelling from the old layout starts inside the new screen
    for (const it of world.balloons || []) {
      if (it.state === 'gone' || it.state === 'pop') continue;
      const m = (it.size || 100) / 2;
      const cx = v => Math.max(m, Math.min(view.W - m, v)), cy = v => Math.max(m, Math.min(view.H - m, v));
      it.x = cx(it.x); it.y = cy(it.y);
      if (it._px != null) { it._px = cx(it._px); it._py = cy(it._py); }
    }
    weather.resize(view.W, view.H);
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
    KB.UI.placeBubble(r);
  }
  function updateHudStarTarget() {
    const p = KB.UI.hudStarPoint();
    if (p.x || p.y) render.hudStar = { x: (p.x - view.left) / view.s, y: (p.y - view.top) / view.s };
  }
  let resizeT = 0;
  function onResize() { clearTimeout(resizeT); resizeT = setTimeout(applySize, 120); }

  /* ---------- voice ---------- */
  const voiceOn = () => S.voice && !FLAGS.novoice && speed <= 1.01 && !FLAGS.mute;
  function speak(text, opt) {
    if (!text) return;
    if (KB.Voice) KB.Voice.say(text, opt || {});
  }
  function applyAudio() {
    KB.Audio.setOptions({ sfx: S.sfx, music: S.music, muted: FLAGS.mute });
    if (KB.Voice) { KB.Voice.setLang(curLang()); KB.Voice.setEnabled(voiceOn()); }
  }
  // the instruction is the most important line: praise / wrong lines must not cut it off (playtest P1-2)
  function speakPrompt(txt, opt) { promptUntil = performance.now() + 300 + 72 * (txt || '').length; speak(txt, opt); }
  const canInterrupt = () => performance.now() > promptUntil;
  function promptText(e) {
    return T(e.promptKey, e.params || {});
  }

  /* ---------- game flow ---------- */
  function startGame() {
    KB.Audio.unlock();
    world.setAge(curAge()); world.setLang(curLang());
    world.newSession();
    if (FLAGS.level != null) world.startLevel(Math.max(0, Math.min(3, FLAGS.level | 0)));
    shownStars = 0; KB.UI.setStars(0);
    mode = 'play';
    KB.UI.only(); KB.UI.show('hud'); KB.UI.say('');
    KB.Audio.setMood(world.level || 0); KB.Audio.startMusic();
    applyAudio();
    stats.sessions++;
    requestAnimationFrame(() => { updateHudStarTarget(); placeBubble(); });
  }
  function goTitle() {
    mode = 'title';
    if (KB.Voice) KB.Voice.stop();
    KB.Audio.stopMusic();
    KB.UI.only('scrTitle'); KB.UI.show('hud', false); KB.UI.say('');
    KB.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
    weather.setWeather(0, {});
  }
  function pause() {
    if (mode !== 'play' && mode !== 'talk') return;
    mode = 'paused';
    if (world.cancelDrag) world.cancelDrag();
    if (KB.Voice) { KB.Voice.stop(); if (KB.Voice.stopListening) KB.Voice.stopListening(); }
    KB.Audio.stopMusic();
    KB.UI.only('scrPause');
  }
  function resume() {
    if (mode !== 'paused') return;
    mode = world.state === 'talk' ? 'talk' : 'play';
    KB.UI.only(mode === 'talk' ? 'scrTalk' : undefined);
    KB.Audio.startMusic();
  }

  function currentPrompt() {   // ask mode: the prompt follows the current target pot
    const p = world.prompt ? world.prompt() : null;
    return p ? promptText(p) : (lastRoundEvt ? promptText(lastRoundEvt) : '');
  }
  // names: only when Miu is quiet, and not the same name again within 3 s (playtest M2)
  function sayName(txt, now) {
    if (!txt || (KB.Voice && KB.Voice.isSpeaking())) return;
    if (now - lastGrabSay < 700 || (txt === lastName && now - lastGrabSay < 3000)) return;
    lastGrabSay = now; lastName = txt;
    speak(txt);
  }
  function handleEvents() {
    const evs = world.drainEvents();
    for (const e of evs) onEvent(e);
  }
  function balloonById(id) { return (world.balloons || []).find(b => b.id === id); }

  function onEvent(e) {
    const L = world.layout;
    switch (e.type) {
      case 'level':
        weather.setWeather(e.level, {});
        KB.Audio.setMood(e.level); KB.Audio.play('chapter');
        KB.UI.setDots(world.roundsPerLevel || 5, 0);
        speak(T('ui.chapter', { n: e.level + 1 }) + '. ' + T('topic.' + e.topic), { interrupt: true });
        KB.UI.say(T('topic.' + e.topic));
        render.prewarm(L, e.level + 1);
        break;
      case 'round': {
        lastRoundEvt = e; stats.rounds++; firstAsk = true; idleSaid = 0;
        KB.UI.setDots(world.roundsPerLevel || 5, e.round % (world.roundsPerLevel || 5));
        if (e.mode === 'ask') break;                 // the 'ask' event right after names the first animal
        const txt = promptText(e);
        KB.UI.say(txt); speakPrompt(txt, { priority: true });
        break;
      }
      case 'ask': {
        const full = promptText(e);
        KB.UI.say(full);
        if (firstAsk) speakPrompt(full, { priority: true });
        else {   // queued after the praise; any older waiting line (a stale "Now the …!", a seed name) goes
          if (KB.Voice && KB.Voice.dropQueued) KB.Voice.dropQueued();
          speak(T('p.animalsNext', e.params), {});
        }
        firstAsk = false;
        break;
      }
      case 'appear': KB.Audio.play('rise'); break;
      case 'correct': {
        stats.correct++;
        const lang = curLang();
        if (e.need != null && world.cur && world.cur.mode === 'count') {   // counting: every pop says its number
          speak(KB.I18N.sayCount(lang, e.n, e.need), { interrupt: true });
          break;
        }
        const now = performance.now();
        if (now - lastPraise < 1200) break;          // don't stack praise when pops come fast
        lastPraise = now;
        const ev = Object.assign({ mode: world.cur && world.cur.mode }, e);
        const s1 = KB.I18N.sayCorrect ? KB.I18N.sayCorrect(lang, ev) : '';
        speak(s1 && Math.random() < 0.75 ? s1 : T('praise'), { interrupt: canInterrupt() });
        break;
      }
      case 'pop': {
        const counting = world.cur && world.cur.mode === 'count';
        KB.Audio.play('pop', { count: counting ? e.n : 0 });
        const b = balloonById(e.id);
        render.burst('pop', e.x, e.y, { color: e.color, size: b ? b.size : 110 });
        break;
      }
      case 'wrong': {
        stats.wrong++;
        KB.Audio.play('boing');
        const b = balloonById(e.id);
        render.burst('wrong', e.x, e.y, { size: b ? b.size : 110 });
        const nowW = performance.now();
        if (nowW - lastWrongSay > 2500) {   // the boing always plays; the sentence at most every 2.5 s (playtest P1-3)
          lastWrongSay = nowW;
          speak(KB.I18N.sayWrong ? KB.I18N.sayWrong(curLang(), e) : T('wrong'), { interrupt: canInterrupt() });
        }
        break;
      }
      case 'land': {
        KB.Audio.play('land');
        render.burst('land', e.x, e.y);
        break;
      }
      case 'hint': {
        const b = balloonById(e.id);
        KB.Audio.play('hint');
        if (b) render.burst('hint', b.x, b.y, { size: b.size });
        if (!e.idle) speak(T('hint'));               // hints queue; an idle glow already had its idle line
        break;
      }
      case 'idle':
        if (++idleSaid <= 4) speak(T('idle') + ' ' + currentPrompt());   // then stay quiet: maybe nobody is there
        else if (idleSaid >= 5 && !bot) pause();   // ≈ 2 min without a tap: nobody is playing — pause the music and the game
        break;
      case 'roundDone': {
        KB.Audio.play('round');
        const n = e.stars || 1;
        const from = L.miu;
        for (let i = 0; i < n; i++) {
          render.burst('star', from.x + 60, from.y - from.h * 0.7, {
            delay: i * 0.22, onDone: () => { shownStars++; KB.UI.setStars(shownStars, true); KB.Audio.play('star', { i }); }
          });
        }
        if (!(world.cur && world.cur.mode === 'count')) speak(T('great'));   // queued; count rounds end with "…three balloons!"
        KB.UI.setDots(world.roundsPerLevel || 5, ((e.round != null ? e.round : world.round) % (world.roundsPerLevel || 5)) + 1);
        break;
      }
      case 'talk': openTalk(e.talk || world.talk); break;
      case 'talkAsk': {   // no answer yet: ask again, and after the 2nd re-ask glow the right answer
        const tk = e.talk || world.talk;
        if (tk && e.n <= 3) speak(T(tk.promptKey, tk.params || {}), { priority: true });   // stop talking to an empty room
        if (e.n >= 4 && !bot) { pause(); break; }
        if (e.n >= 2 || (tk && tk.glowAnswer)) KB.UI.glowTalk(tk.answerId);
        break;
      }
      case 'talkResult': {
        stats.talks++; if (e.correct) stats.talkRight++;
        KB.UI.markTalk(e.choiceId, e.answerId);
        const ans = (world.talk && world.talk.choices.find(c => c.id === e.answerId)) || {};
        if (e.correct) {
          KB.Audio.play('talkRight');
          render.burst('star', view.W / 2, view.H / 2, { onDone: () => { shownStars++; KB.UI.setStars(shownStars, true); KB.Audio.play('star'); } });
          speak(T('talk.right'), { interrupt: true });
        } else {
          KB.Audio.play('wrong');
          speak(KB.I18N.talkWrong ? KB.I18N.talkWrong(curLang(), ans.kind, ans.value) : T('talk.wrong', { answer: NAME(ans.kind, ans.value) }), { interrupt: true });
        }
        break;
      }
      case 'levelDone':
        KB.Audio.play('level');
        if (mode === 'talk') { mode = 'play'; KB.UI.only(); }
        break;
      case 'sessionDone': {
        KB.Audio.play('fanfare');
        weather.setWeather(3, {});                 // the night party under the stars and fireflies
        render.burst('confetti', 0, 0);
        progress.totalStars += e.stars || 0; progress.sessions++;
        KB.Storage.setJSON('progress', progress);
        shownStars = e.stars || shownStars; KB.UI.setStars(shownStars);
        $('doneStars').textContent = e.stars || 0;
        $('doneTitle').textContent = T('session.done', { stars: e.stars || 0 });
        speak(T('session.done', { stars: e.stars || 0 }), { interrupt: true });
        mode = 'done';
        KB.UI.only('scrDone'); KB.UI.show('hud', false); KB.UI.say('');
        if (autoRestart) setTimeout(() => { if (mode === 'done') startGame(); }, 1500 / speed);
        break;
      }
    }
  }

  /* ---------- Talk time ---------- */
  function openTalk(talk) {
    if (!talk) return;
    mode = 'talk';
    if (world.cancelDrag) world.cancelDrag();
    const canMic = S.mic && KB.Voice && KB.Voice.canListen && KB.Voice.canListen() && !FLAGS.bot;
    KB.UI.openTalk(talk, curLang(), id => { KB.Audio.play('click'); world.talkAnswer(id); }, canMic, curAge());
    const q = T(talk.promptKey, talk.params || {});
    speakPrompt(T('talk.intro') + ' ' + q, { priority: true });   // queued after the round's praise, not cutting it off
  }
  function listen() {
    const talk = world.talk;
    if (!talk || world.state !== 'talk' || !KB.Voice || !KB.Voice.canListen()) return;
    if (KB.Voice.stop) KB.Voice.stop();
    KB.Audio.play('listen');
    KB.UI.setListening(true, T('ui.listening'));
    const choices = talk.choices.map(c => ({ id: c.id, words: KB.I18N.words(curLang(), c.kind, c.value) }));
    KB.Voice.listen({ lang: curLang(), choices, timeoutMs: 6000 }).then(res => {
      KB.UI.setListening(false, T('ui.tapOrSay'));
      if (world.state !== 'talk') return;
      if (res && res.id != null) world.talkAnswer(res.id);
      else if (res && res.reason === 'not-allowed') { $('btnMic').classList.add('hidden'); speak(T('ui.micDenied')); }
      else speak(T('ui.tapOrSay'));
    }).catch(() => KB.UI.setListening(false, T('ui.tapOrSay')));
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
      world.wind = (weather.ambient && weather.ambient.wind) || 0;   // gusts push the balloons
      while (left > 1e-6) {
        const step = Math.min(left, 1 / 30);
        if (bot && (mode === 'play' || mode === 'talk')) bot.step(step);
        world.update(step);
        handleEvents();
        left -= step;
      }
    }
    weather.update(dt * Math.min(speed, 4), { groundY: world.layout.groundY });
    const speaking = KB.Voice && KB.Voice.isSpeaking ? KB.Voice.isSpeaking() : false;
    KB.Audio.duck(speaking);
    render.draw(world, weather, { dt: dt * Math.min(speed, 4), lang: curLang(), title: mode === 'title' || mode === 'loading', speaking, done: mode === 'done', compact: window.innerWidth > window.innerHeight, debug: FLAGS.debug });
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
    if (world.pointerDown(p.x, p.y) != null) return;           // balloons win over Miu's tap zone
    const L = world.layout.miu, S2 = world.layout.sign;
    // tapping Miu, the sign (or the bubble) repeats the instruction
    if (Math.abs(p.x - L.x) < L.h * 0.45 && p.y < L.y + 10 && p.y > L.y - L.h * 1.05) repeatPrompt();
    else if (S2 && Math.abs(p.x - S2.x) < S2.w * 0.55 && p.y < S2.y && p.y > S2.y - S2.w * 0.9) repeatPrompt();
  }
  function repeatPrompt() {
    if (!lastRoundEvt || world.state !== 'round') return;
    KB.Audio.play('click');
    world.miu && (world.miu.mood = 'think', world.miu.moodT = 1.2);
    const cp = currentPrompt(); promptUntil = 0; speakPrompt(cp, { interrupt: true });
  }

  function bindUI() {
    KB.Input.kidProof();
    KB.Input.attach($('game'), {
      toLogical,
      down: (x, y) => onDown({ x, y }),       // KB.Input calls handlers with (x, y, ev) in logical px
      move: (x, y) => { if (mode === 'play' && !bot) world.pointerMove(x, y); },
      up: (x, y) => { if (mode === 'play' && !bot) world.pointerUp(x, y); },
      cancel: () => { if (world.cancelDrag) world.cancelDrag(); }
    });
    const unlock = () => { KB.Audio.unlock(); if (KB.Voice) KB.Voice.unlock(); };
    ['touchend', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { capture: true, passive: true }));

    $('btnPlay').addEventListener('click', () => { KB.Audio.play('click'); startGame(); });
    $('bubble').addEventListener('click', repeatPrompt);
    $('btnPause').addEventListener('click', () => { KB.Audio.play('click'); pause(); });
    $('btnResume').addEventListener('click', () => { KB.Audio.play('click'); resume(); });
    $('btnHome').addEventListener('click', () => { KB.Audio.play('click'); goTitle(); });
    $('btnAgain').addEventListener('click', () => { KB.Audio.play('click'); startGame(); });
    $('btnDoneHome').addEventListener('click', () => { KB.Audio.play('click'); goTitle(); });
    $('btnMic').addEventListener('click', listen);
    document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => {
      S.lang = b.dataset.lang; langOverride = null; saveSettings(); KB.UI.applyLang(curLang()); applyAudio(); KB.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
      updateVoiceInfo();
      KB.Audio.play('click');
      if (mode === 'title') speak(T('ui.welcome'), { interrupt: true });
    }));
    // parent gate: hold the gear for 2 s
    const gear = $('btnParents');
    KB.Input.holdButton(gear, 2000, () => { gear.style.setProperty('--p', 0); openSettings(); },
      p => { gear.style.setProperty('--p', p); gear.classList.toggle('holding', p > 0); });
    gear.addEventListener('click', () => { gear.classList.add('tip'); setTimeout(() => gear.classList.remove('tip'), 1600); });
    KB.UI.bindSettings(S, k => {
      saveSettings();
      if (k === 'sfx' || k === 'music' || k === 'voice') applyAudio();
      if (k === 'age') { ageOverride = null; KB.UI.setTitleInfo(progress.totalStars, curAge(), curLang()); }
      if (k === 'name' && KB.I18N.setChild) KB.I18N.setChild(S.name);
    }, curAge);
    $('btnSettingsDone').addEventListener('click', () => { KB.Audio.play('click'); KB.UI.only('scrTitle'); KB.UI.setTitleInfo(progress.totalStars, curAge(), curLang()); });

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(applySize, 250));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { pause(); KB.Audio.suspend(); if (KB.Voice) KB.Voice.stop(); }
      else KB.Audio.resume();
    });
    window.addEventListener('blur', () => { if (world && world.cancelDrag) world.cancelDrag(); });
  }
  function openSettings() {
    KB.Audio.play('click');
    KB.UI.refreshSettings();
    updateVoiceInfo();
    KB.UI.only('scrSettings');
  }
  function updateVoiceInfo() {
    if (!KB.Voice) return;
    const has = KB.Voice.hasVoice ? KB.Voice.hasVoice(curLang()) : false;
    const nm = KB.Voice.voiceName ? KB.Voice.voiceName() : '';
    const mic = KB.Voice.canListen && KB.Voice.canListen();
    const v = has ? (curLang() === 'vi' ? 'Giọng đọc: ' : 'Voice: ') + (nm || '✓') : (curLang() === 'vi' ? 'Máy chưa có giọng tiếng Việt — vào Cài đặt › Trợ năng › Nội dung được đọc để tải giọng.' : 'No voice for this language on this device yet.');
    const m = mic ? '' : ' · ' + T('ui.micUnsupported');
    KB.UI.setVoiceInfo(v + m);
  }

  /* ---------- test hooks ---------- */
  function hooks() {
    const prev = KB.debug || {};
    KB.debug = prev;
    Object.defineProperties(prev, Object.getOwnPropertyDescriptors({
      get world() { return world; }, get weather() { return weather; }, get mode() { return mode; }, stats,
      voiceLog: (KB.Voice && KB.Voice.log) || prev.voiceLog || [],
      getState() {
        return { mode, state: world.state, level: world.level, topic: world.topic, round: world.round, stars: world.stars,
          items: (world.items || []).length, held: world.held, W: view.W, H: view.H, ins: view.ins, settings: Object.assign({}, S), speed };
      },
      setSpeed(n) { speed = Math.max(0.1, +n || 1); applyAudio(); },
      startGame, goTitle,
      setBot(on, skill) { bot = on ? new KB.Bot(world, { skill: skill == null ? FLAGS.botSkill : skill, seed: 7 }) : null; },
      setAutoRestart(on) { autoRestart = !!on; },
      gotoLevel(i) { world.startLevel(i); },
      get bot() { return bot; }, view: () => view, render: () => render,
      balloonScreen(id) {
        const b = balloonById(id); if (!b) return null;
        return { x: view.left + b.x * view.s, y: view.top + b.y * view.s, r: (b.size * 0.6 + 14) * view.s };
      }
    }));
  }

  /* ---------- boot ---------- */
  async function boot() {
    await KB.Storage.init();
    S = Object.assign({}, DEF, KB.Storage.getJSON('settings', {}));
    Object.assign(progress, KB.Storage.getJSON('progress', {}));
    KB.UI.applyLang(curLang());
    if (KB.I18N && KB.I18N.setChild) KB.I18N.setChild(S.name);
    if (KB.Voice) KB.Voice.init({ lang: curLang(), enabled: voiceOn() });
    render = new KB.Renderer($('game')); KB.render = render;
    world = new KB.World({ seed: FLAGS.seed != null ? FLAGS.seed : (Date.now() & 0x7fffffff), age: FLAGS.age || S.age, lang: curLang() });
    weather = new KB.Weather({ width: 960, height: 720, seed: 11 });
    hooks();
    bindUI();
    applySize();
    weather.setWeather(0, { instant: true });
    await KB.Assets.load();
    render.prewarm(world.layout, 0);
    applyAudio();
    if (FLAGS.bot) bot = new KB.Bot(world, { skill: FLAGS.botSkill, seed: 7 });
    KB.UI.only('scrTitle');
    KB.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
    mode = 'title';
    requestAnimationFrame(frame);
    if (FLAGS.autostart) startGame();
    if (KB.Voice && KB.Voice.onVoicesChanged) KB.Voice.onVoicesChanged(updateVoiceInfo);
  }
  window.addEventListener('DOMContentLoaded', () => boot().catch(e => { console.error(e); }));
})(window.KB = window.KB || {});
