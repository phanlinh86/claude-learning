/* RR main (Bim's Rainbow Rocket) — boots the game, sizes the canvas for any phone/tablet shape, runs the loop and turns
 * world events into voice, sound, effects and UI. */
(function (RR) {
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
  const T = (key, p) => (RR.I18N ? RR.I18N.t(curLang(), key, Object.assign({ child: S.name || '' }, p || {})) : key);
  const NAME = (kind, v) => (RR.I18N ? RR.I18N.name(curLang(), kind, v) : String(v));

  /* ---------- settings (URL flags never saved) ---------- */
  const DEF = { age: 4, lang: (navigator.language || 'en').toLowerCase().startsWith('vi') ? 'vi' : 'en', name: '', sfx: true, music: true, voice: true, mic: true, volume: 1 };
  let S = Object.assign({}, DEF);
  let langOverride = FLAGS.lang === 'vi' || FLAGS.lang === 'en' ? FLAGS.lang : null;   // URL ?lang= is session-only
  const curLang = () => langOverride || S.lang;
  let ageOverride = FLAGS.age || null;           // URL ?age= is session-only; a parent's pick wins
  const curAge = () => ageOverride || S.age;
  const saveSettings = () => RR.Storage.setJSON('settings', S);
  const progress = { totalStars: 0, sessions: 0 };

  let world, weather, render, bot = null;
  let mode = 'loading';            // loading | title | play | paused | talk | done
  let speed = FLAGS.speed, autoRestart = FLAGS.autorestart;
  let view = { W: 960, H: 720, s: 1, left: 0, top: 0, ins: { top: 0, right: 0, bottom: 0, left: 0 } };
  const stats = { sessions: 0, rounds: 0, correct: 0, wrong: 0, misses: 0, talks: 0, talkRight: 0, frames: 0, slowFrames: 0 };
  let surpriseLine = '', promptUntil = 0, lastWrongSay = 0, idleSaid = 0, lastName = '', firstAsk = true, shownStars = 0, lastRoundEvt = null, missSay = 0, lastGrabSay = 0, lastPraise = 0;

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
  function measureHud() {   // the real DOM HUD and speech bubble in logical px, as TWO boxes (a merged box pushed islands onto the rocket)
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
    // rotation while holding an item: the finger's old logical point is meaningless now → put it back quietly
    if (world && world.cancelDrag && (prev.W !== view.W || prev.H !== view.H)) world.cancelDrag();
    const rs = renderScale();
    const c = $('game');
    c.style.width = view.cssW + 'px'; c.style.height = view.cssH + 'px';
    c.style.left = view.left + 'px'; c.style.top = view.top + 'px';
    render.resize(view.W, view.H, rs);
    world.setViewport(view.W, view.H, view.ins);
    // the world re-lays out islands, flights and the wagon itself in setViewport (rotation mid-flight is safe)
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
    RR.UI.placeBubble(r);
  }
  function updateHudStarTarget() {
    const p = RR.UI.hudStarPoint();
    if (p.x || p.y) render.hudStar = { x: (p.x - view.left) / view.s, y: (p.y - view.top) / view.s };
  }
  let resizeT = 0;
  function onResize() { clearTimeout(resizeT); resizeT = setTimeout(applySize, 120); }

  /* ---------- voice ---------- */
  const voiceOn = () => S.voice && !FLAGS.novoice && speed <= 1.01 && !FLAGS.mute;
  function speak(text, opt) {
    if (!text) return;
    if (RR.Voice) RR.Voice.say(text, opt || {});
  }
  function applyAudio() {
    RR.Audio.setOptions({ sfx: S.sfx, music: S.music, muted: FLAGS.mute, volume: S.volume == null ? 1 : S.volume });
    if (RR.Voice) { RR.Voice.setLang(curLang()); RR.Voice.setEnabled(voiceOn()); if (RR.Voice.setVolume) RR.Voice.setVolume(S.volume == null ? 1 : S.volume); }
    const vl = $('volLevel'); if (vl) vl.textContent = Math.round((S.volume == null ? 1 : S.volume) * 100) + '%';
    const vs = $('optVolume'); if (vs && document.activeElement !== vs) vs.value = Math.round((S.volume == null ? 1 : S.volume) * 100);
  }
  // the instruction is the most important line: praise / wrong lines must not cut it off (playtest P1-2)
  function speakPrompt(txt, opt) { promptUntil = performance.now() + 300 + 72 * (txt || '').length; speak(txt, opt); }
  const canInterrupt = () => performance.now() > promptUntil;
  function promptText(e) {
    return T(e.promptKey, e.params || {});
  }

  /* ---------- game flow ---------- */
  function startGame() {
    RR.Audio.unlock();
    world.setAge(curAge()); world.setLang(curLang());
    world.lastTopics = RR.Storage.getJSON('lastTopics', null);   // chapters rotate between sessions
    world.newSession({ lastTopics: world.lastTopics });
    if (world.levels) RR.Storage.setJSON('lastTopics', world.levels);
    if (FLAGS.level != null) world.startLevel(Math.max(0, Math.min(3, FLAGS.level | 0)));
    shownStars = 0; RR.UI.setStars(0); lastAsk = null; lastPromptText = ''; surpriseLine = ''; lastCamY = null;
    mode = 'play';
    RR.UI.only(); RR.UI.show('hud'); RR.UI.say('');
    RR.Audio.setMood(world.level || 0); RR.Audio.startMusic();
    applyAudio();
    stats.sessions++;
    requestAnimationFrame(() => { updateHudStarTarget(); placeBubble(); applySize(); });
  }
  function goTitle() {
    mode = 'title';
    if (RR.Voice) RR.Voice.stop();
    RR.Audio.stopMusic();
    RR.UI.only('scrTitle'); RR.UI.show('hud', false); RR.UI.say('');
    RR.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
    weather.setWeather(0, {});
  }
  function pause() {
    if (mode !== 'play' && mode !== 'talk') return;
    mode = 'paused';
    if (world.cancelDrag) world.cancelDrag();
    if (RR.Voice) { RR.Voice.stop(); if (RR.Voice.stopListening) RR.Voice.stopListening(); }
    RR.Audio.stopMusic();
    RR.UI.only('scrPause');
  }
  function resume() {
    if (mode !== 'paused') return;
    mode = world.state === 'talk' ? 'talk' : 'play';
    idleSaid = 0;   // a returning child gets the nudges again before the next auto-pause
    if (world.resetNudges) world.resetNudges();
    RR.UI.only(mode === 'talk' ? 'scrTalk' : undefined);
    RR.Audio.startMusic();
    // say the question again so a returning child knows what to do
    if (mode === 'talk' && world.talk) speak(T(world.talk.promptKey, world.talk.params || {}), { priority: true });
    else if (world.state === 'round' && world.phase === 'ask') setTimeout(repeatPrompt, 300);
  }

  let lastPromptText = '';
  function currentPrompt() {   // prompts have several wordings: repeat the one Bim said, word for word
    if (lastPromptText) return lastPromptText;
    const p = world.prompt ? world.prompt() : null;
    return p ? promptText(p) : (lastRoundEvt ? promptText(lastRoundEvt) : '');
  }
  // names: only when Bim is quiet, and not the same name again within 3 s (playtest M2)
  function sayName(txt, now) {
    if (!txt || (RR.Voice && RR.Voice.isSpeaking())) return;
    if (now - lastGrabSay < 700 || (txt === lastName && now - lastGrabSay < 3000)) return;
    lastGrabSay = now; lastName = txt;
    speak(txt);
  }
  function handleEvents() {
    const evs = world.drainEvents();
    for (const e of evs) onEvent(e);
  }
  let lastAsk = null, lastAppearSnd = 0;
  function islandById(id) { return (world.islands || []).find(i => i.id === id); }
  function scr(i) { return { x: i.x, y: i.y - (world.camY || 0) }; }
  function ev2(e) { return Object.assign({ topic: world.topic }, lastAsk ? { promptKey: lastAsk.promptKey, params: lastAsk.params } : {}, e); }

  function onEvent(e) {
    switch (e.type) {
      case 'level':
        weather.setWeather(e.level, {});
        RR.Audio.setMood(e.level); RR.Audio.play('chapter');
        RR.UI.setDots(world.roundsPerLevel || 4, 0);
        speak(T('ui.chapter', { n: e.level + 1 }) + '. ' + T('topic.' + e.topic), { interrupt: true });
        speak(T('weather.' + e.level));   // "Good morning, sky!" — queued after the chapter name
        RR.UI.say(T('topic.' + e.topic));
        render.prewarm(world.layout, e.level);
        break;
      case 'round': {
        lastRoundEvt = e; stats.rounds++; idleSaid = 0;
        RR.UI.setDots(world.roundsPerLevel || 4, e.round % (world.roundsPerLevel || 4));
        if (e.surprise) { RR.Audio.play('surprise'); surpriseLine = T('surprise.' + e.surprise); }
        break;
      }
      case 'appear': {
        const now = performance.now();
        if (now - lastAppearSnd > 70) { lastAppearSnd = now; RR.Audio.play('appear'); }
        break;
      }
      case 'ask': {
        lastAsk = e; idleSaid = 0;
        let key = e.promptKey;
        if (key === 'p.colors' && (world.level | 0) === 3 && RR.I18N.has && RR.I18N.has(curLang(), 'p.colors.night')) key = 'p.colors.night';
        const txt = T(key, e.params || {});
        lastPromptText = txt;
        RR.UI.say(txt); speakPrompt(txt, { priority: true });
        if (surpriseLine) { speak(surpriseLine); surpriseLine = ''; }
        break;
      }
      case 'go': {
        stats.correct++;
        RR.Audio.play('go');
        promptUntil = 0;
        speak(RR.I18N.sayGo ? RR.I18N.sayGo(curLang(), ev2(e)) : T('praise'), { interrupt: true });
        break;
      }
      case 'ignite': RR.Audio.play('rumble'); break;
      case 'liftoff': RR.Audio.play('whoosh'); break;
      case 'land': {
        RR.Audio.play('land');
        const i = islandById(e.id); if (i) { const p = scr(i); render.burst('land', p.x, p.y); }
        break;
      }
      case 'collect': {
        RR.Audio.play('collect', { i: e.hop || e.n || 0 });
        const wg = world.wagon;
        if (wg) render.burst('collect', wg.x, wg.y - (world.camY || 0) + 30, { color: e.token && e.token.kind === 'color' ? e.token.value : null, size: 70 });
        const counting = e.token && (e.token.kind === 'stars' || e.token.kind === 'number' || e.token.kind === 'animal');
        if (counting || !(RR.Voice && RR.Voice.isSpeaking())) speak(RR.I18N.sayCollect ? RR.I18N.sayCollect(curLang(), ev2(e)) : '');
        break;
      }
      case 'wrong': {
        stats.wrong++;
        RR.Audio.play('wrong');
        const i = islandById(e.id); if (i) { const p = scr(i); render.burst('wrong', p.x, p.y - 20, { size: i.w }); }
        const nowW = performance.now();
        if (nowW - lastWrongSay > 1500) {
          lastWrongSay = nowW;
          speak(RR.I18N.sayWrong ? RR.I18N.sayWrong(curLang(), ev2(e)) : T('hint'), { interrupt: canInterrupt() });
        }
        break;
      }
      case 'hint': {
        RR.Audio.play('hint');
        const i = islandById(e.id); if (i) { const p = scr(i); render.burst('hint', p.x, p.y - 30, { size: i.w }); }
        if (!e.idle) speak(T('hint'));
        break;
      }
      case 'idle':
        if (++idleSaid <= 4) speak(T('idle') + ' ' + currentPrompt());   // then stay quiet: maybe nobody is there
        else if (idleSaid >= 5 && !bot) pause();   // ≈ 2 min without a tap: nobody is playing — pause
        break;
      case 'pokeBim': case 'tapPad': repeatPrompt(); break;
      case 'roundDone': {
        RR.Audio.play('round');
        const n = e.stars || 1, wg = world.wagon;
        const fx = wg ? wg.x : view.W / 2, fy = wg ? wg.y - (world.camY || 0) + 30 : view.H / 2;
        render.burst('sparkles', fx, fy);
        for (let i = 0; i < n; i++) {
          render.burst('star', fx, fy, { delay: 0.15 + i * 0.22, onDone: () => { shownStars++; RR.UI.setStars(shownStars, true); RR.Audio.play('star', { i }); } });
        }
        speak(T('great'));   // queued after the collect line
        RR.UI.setDots(world.roundsPerLevel || 4, ((e.round != null ? e.round : world.round) % (world.roundsPerLevel || 4)) + 1);
        break;
      }
      case 'boostReady': RR.Audio.play('ready'); speak(T('boost')); RR.UI.say(T('boost')); break;
      case 'boost': { RR.Audio.play('boost'); const bg = T('boostGo'); RR.UI.say(bg); speak(bg, { interrupt: true }); break; }
      case 'locked': RR.Audio.play('boop'); break;     // tap lock after a wrong island: no reward for spamming
      case 'dragMiss': RR.Audio.play('boop'); repeatPrompt(); break;
      case 'boostEnd': RR.Audio.play('land'); break;
      case 'shooting': RR.Audio.play('twinkle'); break;
      case 'shootingTap': RR.Audio.play('sparkle'); render.burst('sparkles', e.x, e.y); speak(T('shooting.tap'), { interrupt: canInterrupt() }); break;
      case 'talk': RR.UI.say(''); RR.UI.setDots(world.roundsPerLevel || 4, world.roundsPerLevel || 4); openTalk(e.talk || world.talk); break;
      case 'talkAsk': {   // no answer yet: ask again, and after the 2nd re-ask glow the right answer
        const tk = e.talk || world.talk;
        if (tk && e.n <= 3) speak(T(tk.promptKey, tk.params || {}), { priority: true });   // stop talking to an empty room
        if (e.n >= 4 && !bot) { pause(); break; }
        if (e.n >= 2 || (tk && tk.glowAnswer) || e.glowAnswer) RR.UI.glowTalk(tk.answerId);
        break;
      }
      case 'talkResult': {
        stats.talks++; if (e.correct) stats.talkRight++;
        RR.UI.markTalk(e.choiceId, e.answerId);
        const ans = (world.talk && world.talk.choices.find(c => c.id === e.answerId)) || {};
        if (e.correct) {
          RR.Audio.play('talkRight');
          render.burst('star', view.W / 2, view.H / 2, { onDone: () => { shownStars++; RR.UI.setStars(shownStars, true); RR.Audio.play('star'); } });
          speak(T('talk.right'), { interrupt: true });
        } else {
          RR.Audio.play('wrong');
          speak(RR.I18N.talkWrong ? RR.I18N.talkWrong(curLang(), ans.kind, ans.value) : T('talk.wrong', { answer: NAME(ans.kind, ans.value) }), { interrupt: true });
        }
        break;
      }
      case 'levelDone':
        RR.Audio.play('level'); RR.UI.say('');
        if (mode === 'talk') { mode = 'play'; RR.UI.only(); }
        break;
      case 'sessionDone': {
        RR.Audio.play('fanfare');
        weather.setWeather(3, {});                 // the party on the moon under the stars
        render.burst('confetti', 0, 0);
        progress.totalStars += e.stars || 0; progress.sessions++;
        RR.Storage.setJSON('progress', progress);
        shownStars = e.stars || shownStars; RR.UI.setStars(shownStars);
        $('doneStars').textContent = e.stars || 0;
        $('doneTitle').textContent = T('session.done', { stars: e.stars || 0 });
        speak(T('session.done', { stars: e.stars || 0 }), { interrupt: true });
        mode = 'done';
        RR.UI.only('scrDone'); RR.UI.show('hud', false); RR.UI.say('');
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
    const canMic = S.mic && RR.Voice && RR.Voice.canListen && RR.Voice.canListen() && !FLAGS.bot;
    RR.UI.openTalk(talk, curLang(), id => { RR.Audio.play('click'); world.talkAnswer(id); }, canMic, curAge());
    const q = T(talk.promptKey, talk.params || {});
    speakPrompt(T('talk.intro') + ' ' + q, { priority: true });   // queued after the round's praise, not cutting it off
  }
  function listen() {
    const talk = world.talk;
    if (!talk || world.state !== 'talk' || !RR.Voice || !RR.Voice.canListen()) return;
    if (RR.Voice.stop) RR.Voice.stop();
    RR.Audio.play('listen');
    RR.UI.setListening(true, T('ui.listening'));
    const choices = talk.choices.map(c => ({ id: c.id, words: RR.I18N.words(curLang(), c.kind, c.value) }));
    RR.Voice.listen({ lang: curLang(), choices, timeoutMs: 6000 }).then(res => {
      RR.UI.setListening(false, T('ui.tapOrSay'));
      if (world.state !== 'talk') return;
      if (res && res.id != null) world.talkAnswer(res.id);
      else if (res && res.reason === 'not-allowed') { $('btnMic').classList.add('hidden'); speak(T('ui.micDenied')); }
      else speak(T('ui.tapOrSay'));
    }).catch(() => RR.UI.setListening(false, T('ui.tapOrSay')));
  }

  /* ---------- loop ---------- */
  let lastCamY = null, last = 0, slowAcc = 0, fastAcc = 0, pendingResize = false;
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
    const cy = world.camY || 0; weather.update(dt * Math.min(speed, 4), { camDY: cy - (lastCamY == null ? cy : lastCamY) }); lastCamY = cy;
    const speaking = RR.Voice && RR.Voice.isSpeaking ? RR.Voice.isSpeaking() : false;
    RR.Audio.duck(speaking);
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
    world.pointerDown(p.x, p.y);   // islands, the rocket (aim / poke Bim), the boost, the shooting star
  }
  function repeatPrompt() {
    if (!lastAsk || world.state !== 'round') return;
    RR.Audio.play('click');
    if (world.bim) { world.bim.mood = 'think'; world.bim.moodT = 1.2; }
    const cp = currentPrompt(); promptUntil = 0; speakPrompt(cp, { interrupt: true });
  }

  function bindUI() {
    RR.Input.kidProof();
    RR.Input.attach($('game'), {
      toLogical,
      down: (x, y) => onDown({ x, y }),       // RR.Input calls handlers with (x, y, ev) in logical px
      move: (x, y) => { if (mode === 'play' && !bot) world.pointerMove(x, y); },
      up: (x, y) => { if (mode === 'play' && !bot) world.pointerUp(x, y); },
      cancel: () => { if (world.cancelDrag) world.cancelDrag(); }
    });
    const unlock = () => { RR.Audio.unlock(); if (RR.Voice) RR.Voice.unlock(); };
    ['touchend', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { capture: true, passive: true }));

    $('btnPlay').addEventListener('click', () => { RR.Audio.play('click'); startGame(); });
    $('bubble').addEventListener('click', repeatPrompt);
    $('btnPause').addEventListener('click', () => { RR.Audio.play('click'); pause(); });
    $('btnResume').addEventListener('click', () => { RR.Audio.play('click'); resume(); });
    $('btnHome').addEventListener('click', () => { RR.Audio.play('click'); goTitle(); });
    $('btnAgain').addEventListener('click', () => { RR.Audio.play('click'); startGame(); });
    $('btnDoneHome').addEventListener('click', () => { RR.Audio.play('click'); goTitle(); });
    $('btnMic').addEventListener('click', listen);
    // volume: settings slider + big − / + in the pause menu
    $('optVolume').addEventListener('input', () => { S.volume = +$('optVolume').value / 100; saveSettings(); applyAudio(); });
    $('optVolume').addEventListener('change', () => RR.Audio.play('pop'));
    const step = d => { S.volume = Math.max(0, Math.min(1, Math.round(((S.volume == null ? 1 : S.volume) + d) * 10) / 10)); saveSettings(); applyAudio(); RR.Audio.play('pop'); };
    $('btnVolDown').addEventListener('click', () => step(-0.1));
    $('btnVolUp').addEventListener('click', () => step(0.1));
    document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => {
      S.lang = b.dataset.lang; langOverride = null; saveSettings(); RR.UI.applyLang(curLang()); applyAudio(); RR.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
      updateVoiceInfo();
      RR.Audio.play('click');
      if (mode === 'title') speak(T('ui.welcome'), { interrupt: true });
    }));
    // parent gate: hold the gear for 2 s
    const gear = $('btnParents');
    RR.Input.holdButton(gear, 2000, () => { gear.style.setProperty('--p', 0); openSettings(); },
      p => { gear.style.setProperty('--p', p); gear.classList.toggle('holding', p > 0); });
    gear.addEventListener('click', () => { gear.classList.add('tip'); setTimeout(() => gear.classList.remove('tip'), 1600); });
    RR.UI.bindSettings(S, k => {
      saveSettings();
      if (k === 'sfx' || k === 'music' || k === 'voice') applyAudio();
      if (k === 'age') { ageOverride = null; RR.UI.setTitleInfo(progress.totalStars, curAge(), curLang()); }
      if (k === 'name' && RR.I18N.setChild) RR.I18N.setChild(S.name);
    }, curAge);
    $('btnSettingsDone').addEventListener('click', () => { RR.Audio.play('click'); RR.UI.only('scrTitle'); RR.UI.setTitleInfo(progress.totalStars, curAge(), curLang()); });

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(applySize, 250));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { pause(); RR.Audio.suspend(); if (RR.Voice) RR.Voice.stop(); }
      else RR.Audio.resume();
    });
    window.addEventListener('blur', () => { if (world && world.cancelDrag) world.cancelDrag(); });
  }
  function openSettings() {
    RR.Audio.play('click');
    RR.UI.refreshSettings();
    updateVoiceInfo();
    RR.UI.only('scrSettings');
  }
  function updateVoiceInfo() {
    if (!RR.Voice) return;
    const has = RR.Voice.hasVoice ? RR.Voice.hasVoice(curLang()) : false;
    const nm = RR.Voice.voiceName ? RR.Voice.voiceName() : '';
    const mic = RR.Voice.canListen && RR.Voice.canListen();
    const v = has ? (curLang() === 'vi' ? 'Giọng đọc: ' : 'Voice: ') + (nm || '✓') : (curLang() === 'vi' ? 'Máy chưa có giọng tiếng Việt — vào Cài đặt › Trợ năng › Nội dung được đọc để tải giọng.' : 'No voice for this language on this device yet.');
    const m = mic ? '' : ' · ' + T('ui.micUnsupported');
    RR.UI.setVoiceInfo(v + m);
  }

  /* ---------- test hooks ---------- */
  function hooks() {
    const prev = RR.debug || {};
    RR.debug = prev;
    Object.defineProperties(prev, Object.getOwnPropertyDescriptors({
      get world() { return world; }, get weather() { return weather; }, get mode() { return mode; }, stats,
      voiceLog: (RR.Voice && RR.Voice.log) || prev.voiceLog || [],
      getState() {
        return { mode, state: world.state, level: world.level, topic: world.topic, round: world.round, stars: world.stars,
          phase: world.phase, hop: world.hop, camY: world.camY, islands: (world.islands || []).length, W: view.W, H: view.H, ins: view.ins, settings: Object.assign({}, S), speed };
      },
      setSpeed(n) { speed = Math.max(0.1, +n || 1); applyAudio(); },
      startGame, goTitle,
      setBot(on, skill) { bot = on ? new RR.Bot(world, { skill: skill == null ? FLAGS.botSkill : skill, seed: 7 }) : null; },
      setAutoRestart(on) { autoRestart = !!on; },
      gotoLevel(i) { world.startLevel(i); },
      get bot() { return bot; }, view: () => view, render: () => render,
      islandScreen(id) {
        const b = world.islandHit ? world.islandHit(id) : null; if (!b) return null;
        return { x: view.left + b.x * view.s, y: view.top + b.y * view.s, w: b.w * view.s, h: b.h * view.s };
      },
      rocketScreen() {
        const b = world.rocketHit ? world.rocketHit() : null; if (!b) return null;
        return { x: view.left + b.x * view.s, y: view.top + b.y * view.s, w: b.w * view.s, h: b.h * view.s };
      },
      answerId() { return world.answerId ? world.answerId() : null; },
      toScreen(x, y) { return { x: view.left + x * view.s, y: view.top + y * view.s }; },
      audio: () => RR.Audio
    }));
  }

  /* ---------- boot ---------- */
  async function boot() {
    await RR.Storage.init();
    S = Object.assign({}, DEF, RR.Storage.getJSON('settings', {}));
    Object.assign(progress, RR.Storage.getJSON('progress', {}));
    RR.UI.applyLang(curLang());
    if (RR.I18N && RR.I18N.setChild) RR.I18N.setChild(S.name);
    if (RR.Voice) RR.Voice.init({ lang: curLang(), enabled: voiceOn() });
    render = new RR.Renderer($('game')); RR.render = render;
    world = new RR.World({ seed: FLAGS.seed != null ? FLAGS.seed : (Date.now() & 0x7fffffff), age: FLAGS.age || S.age, lang: curLang() });
    weather = new RR.Weather({ width: 960, height: 720, seed: 11 });
    hooks();
    bindUI();
    applySize();
    weather.setWeather(0, { instant: true });
    await RR.Assets.load();
    render.prewarm(world.layout, 0);
    applyAudio();
    if (FLAGS.bot) bot = new RR.Bot(world, { skill: FLAGS.botSkill, seed: 7 });
    RR.UI.only('scrTitle');
    RR.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
    mode = 'title';
    requestAnimationFrame(frame);
    if (FLAGS.autostart) startGame();
    if (RR.Voice && RR.Voice.onVoicesChanged) RR.Voice.onVoicesChanged(updateVoiceInfo);
  }
  window.addEventListener('DOMContentLoaded', () => boot().catch(e => { console.error(e); }));
})(window.RR = window.RR || {});
