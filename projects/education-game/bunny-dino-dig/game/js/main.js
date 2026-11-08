/* DD main (Bun's Dino Dig) — boots the game, sizes the canvas for any phone/tablet shape, runs the loop and turns
 * world events (tap a sand mound, the shovel scoops, the thing pops out, an egg hatches, finds hop onto the shelf) into
 * voice, sound, effects and UI (docs/VOICE.md §1.2). Taps reach the world only through DD.Input (HUD / menus never reach the canvas). */
(function (DD) {
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
  const T1 = (key, p) => (DD.I18N ? DD.I18N.t(curLang(), key, Object.assign({ child: S.name || '' }, p || {})) : key);
  // never the same wording twice in a row: re-roll a variant that repeats the line just spoken
  const T = (key, p) => { let r = T1(key, p); for (let k = 0; k < 3 && r && r === lastSpoken; k++) r = T1(key, p); return r; };

  /* ---------- settings (URL flags never saved) ---------- */
  const DEF = { age: 4, lang: (navigator.language || 'en').toLowerCase().startsWith('vi') ? 'vi' : 'en', name: '', sfx: true, music: true, voice: true, mic: true, volume: 1 };
  let S = Object.assign({}, DEF);
  let langOverride = FLAGS.lang === 'vi' || FLAGS.lang === 'en' ? FLAGS.lang : null;   // URL ?lang= is session-only
  const curLang = () => langOverride || S.lang;
  let ageOverride = FLAGS.age || null;           // URL ?age= is session-only; a parent's pick wins
  const curAge = () => ageOverride || S.age;
  const saveSettings = () => DD.Storage.setJSON('settings', S);
  const progress = { totalStars: 0, sessions: 0 };

  let world, weather, render, bot = null, inputCancel = null;
  let mode = 'loading';            // loading | title | play | paused | talk | done
  let speed = FLAGS.speed, autoRestart = FLAGS.autorestart;
  let view = { W: 960, H: 720, s: 1, left: 0, top: 0, ins: { top: 0, right: 0, bottom: 0, left: 0 } };
  const stats = { sessions: 0, rounds: 0, correct: 0, wrong: 0, digs: 0, talks: 0, talkRight: 0, hints: 0, frames: 0, slowFrames: 0 };
  let surpriseLine = '', promptUntil = 0, lastWrongSay = -1e9, idleSaid = 0, shownStars = 0, lastRoundEvt = null, lastPraise = -1e9, lastSoftSay = -1e9;   // -1e9: a line in the first 2.5 s after page load is not rate-limited

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
    // rotation mid-tap: the finger's old logical point is meaningless now
    if (world && (prev.W !== view.W || prev.H !== view.H)) { if (inputCancel && inputCancel.cancel) inputCancel.cancel(); if (world.cancelDrag) world.cancelDrag(); }
    const rs = renderScale();
    const c = $('game');
    c.style.width = view.cssW + 'px'; c.style.height = view.cssH + 'px';
    c.style.left = view.left + 'px'; c.style.top = view.top + 'px';
    render.resize(view.W, view.H, rs);
    world.tapMoveMin = Math.max(24, 18 / view.s);   // ≈ 18 pt of finger wobble is still a tap on small phones
    world.setViewport(view.W, view.H, view.ins);    // mounds re-placed into the new field, keeping their dig state
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
    DD.UI.placeBubble(r);
  }
  function updateHudStarTarget() {
    const p = DD.UI.hudStarPoint();
    if (p.x || p.y) render.hudStar = { x: (p.x - view.left) / view.s, y: (p.y - view.top) / view.s };
  }
  let resizeT = 0;
  function onResize() { clearTimeout(resizeT); resizeT = setTimeout(applySize, 120); }

  /* ---------- voice ---------- */
  const voiceOn = () => S.voice && !FLAGS.novoice && speed <= 1.01 && !FLAGS.mute;
  function speak(text, opt) {
    if (!text) return null;
    lastSpoken = text;
    return DD.Voice ? DD.Voice.say(text, opt || {}) : null;
  }
  function applyAudio() {
    DD.Audio.setOptions({ sfx: S.sfx, music: S.music, muted: FLAGS.mute, volume: S.volume == null ? 1 : S.volume });
    if (DD.Voice) { DD.Voice.setLang(curLang()); DD.Voice.setEnabled(voiceOn()); if (DD.Voice.setVolume) DD.Voice.setVolume(S.volume == null ? 1 : S.volume); }
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
    // the line ended (or was dropped / failed / interrupted) without ever starting: lift the guard so a Bun tap repeats it
    if (p && p.then) p.then(() => { if (pendingPrompt === txt) { pendingPrompt = null; promptUntil = Math.min(promptUntil, performance.now() + 300); } }, () => {});
    if (!voiceOn()) { pendingPrompt = null; promptUntil = performance.now() + 300 + 72 * (txt || '').length; }
  }
  function onVoiceStart(display) {
    if (pendingPrompt && display === pendingPrompt) { promptStart = performance.now(); promptUntil = promptStart + 300 + 72 * display.length; pendingPrompt = null; }
  }
  const canInterrupt = () => performance.now() > promptUntil;
  /** feedback lines (found / wrong) may interrupt — but never the prompt while it is protected */
  const feedback = (txt) => speak(txt, { interrupt: canInterrupt() });

  /* ---------- game flow ---------- */
  function startGame() {
    DD.Audio.unlock();
    world.setAge(curAge()); world.setLang(curLang());
    world.lastTopics = DD.Storage.getJSON('lastTopics', null);   // chapters rotate between sessions
    world.newSession({ lastTopics: world.lastTopics });
    if (world.levels) DD.Storage.setJSON('lastTopics', world.levels);
    if (FLAGS.level != null) world.startLevel(Math.max(0, Math.min(3, FLAGS.level | 0)));
    shownStars = 0; DD.UI.setStars(0); lastAsk = null; lastPromptText = ''; surpriseLine = '';
    render.clearGallery();
    if (weather.setParty) weather.setParty(false);
    mode = 'play';
    $('stage').classList.remove('talking');
    DD.UI.only(); DD.UI.show('hud'); DD.UI.say('');
    DD.Audio.setMood(world.level || 0); DD.Audio.startMusic();
    applyAudio();
    stats.sessions++;
    requestAnimationFrame(() => { updateHudStarTarget(); applySize(); });
  }
  function goTitle() {
    mode = 'title';
    $('stage').classList.remove('talking');
    if (DD.Voice) DD.Voice.stop();
    DD.Audio.stopMusic();
    DD.UI.only('scrTitle'); DD.UI.show('hud', false); DD.UI.say('');
    DD.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
    weather.setWeather(0, {}); if (weather.setParty) weather.setParty(false);
  }
  function pause() {
    if (mode !== 'play' && mode !== 'talk') return;
    mode = 'paused';
    if (inputCancel && inputCancel.cancel) inputCancel.cancel();
    if (world.cancelDrag) world.cancelDrag();
    if (DD.Voice) { DD.Voice.stop(); if (DD.Voice.stopListening) DD.Voice.stopListening(); }
    DD.Audio.stopMusic();
    DD.UI.only('scrPause');
  }
  function resume() {
    if (mode !== 'paused') return;
    mode = world.state === 'talk' ? 'talk' : 'play';
    idleSaid = 0;   // a returning child gets the nudges again before the next auto-pause
    if (world.resetNudges) world.resetNudges();
    DD.UI.only(mode === 'talk' ? 'scrTalk' : undefined);
    DD.Audio.startMusic();
    // say the question again so a returning child knows what to do
    if (mode === 'talk' && world.talk) speak(T(world.talk.promptKey, world.talk.params || {}), { priority: true });
    else if (world.state === 'round' && world.phase === 'dig') setTimeout(repeatPrompt, 300);
  }

  let lastPromptText = '';
  function currentPrompt() {   // prompts have several wordings: repeat the one Bun said, word for word
    if (lastPromptText) return lastPromptText;
    const p = world.prompt ? world.prompt() : null;
    return p ? T(p.promptKey, p.params || {}) : '';
  }
  function handleEvents() {
    const evs = world.drainEvents();
    for (const e of evs) onEvent(e);
  }
  let lastAsk = null, lastFoundAt = -1e9, scoopSaid = 0;
  const step = () => world.stepInfo || (world.cur && world.cur.steps && world.cur.steps[Math.max(0, world.step)]) || null;
  const moundOf = id => (world.mounds || []).find(m => m.id === id) || null;
  // the event + what main knows: the chapter topic, the step's params (for "2 + 3 is five!") and the mound's thing
  function ev2(e) {
    const s = step(), m = moundOf(e.id);
    return Object.assign({ topic: world.topic, params: s ? s.params : (lastAsk && lastAsk.params) }, e, { thing: e.thing || (m && m.thing) || undefined });
  }
  function line(fn, e, fallbackKey) {
    const I = DD.I18N;
    if (I && typeof I[fn] === 'function') { try { const t = I[fn](curLang(), e); if (t) return t; } catch (err) { /* fall back */ } }
    return fallbackKey ? T(fallbackKey) : '';
  }
  function countWord(i) {
    const I = DD.I18N;
    if (I && typeof I.sayCount === 'function') { try { const t = I.sayCount(curLang(), i); if (t) return t; } catch (err) { /* fall back */ } }
    return String(i) + '!';
  }
  const wait = ms => ms / Math.max(0.25, speed);
  function bunMood(m, t) { if (world.bun) { world.bun.mood = m; world.bun.moodT = t; } }
  function askText(e) {
    const I = DD.I18N;
    if (I && I.ask) { try { return I.ask(curLang(), e.promptKey, Object.assign({ child: S.name || '' }, e.params || {}), { next: !e.first && e.step > 0 }); } catch (err) { /* fall back */ } }
    return T(e.promptKey, e.params || {});
  }

  function onEvent(e) {
    switch (e.type) {
      case 'level':
        weather.setWeather(e.weather != null ? e.weather : e.level % 4, {});
        DD.Audio.setMood(e.weather != null ? e.weather : e.level); DD.Audio.play('chapter');
        DD.UI.setDots(world.roundsPerLevel || 4, 0);
        speak(T('ui.chapter', { n: e.level + 1 }) + '. ' + T('topic.' + e.topic), { interrupt: true });
        speak(T('weather.' + ((e.weather != null ? e.weather : e.level) % 4)));   // queued after the chapter name
        DD.UI.say(T('topic.' + e.topic));
        render.prewarm(world.layout, e.weather != null ? e.weather : e.level);
        scoopSaid = 0;
        break;
      case 'round': {
        DD.UI.fadeBubble(false);
        lastRoundEvt = e; stats.rounds++; idleSaid = 0; lastAsk = null; lastPromptText = '';
        DD.UI.setDots(world.roundsPerLevel || 4, e.round % (world.roundsPerLevel || 4));
        surpriseLine = '';
        DD.UI.say(T('enter'));   // shown, not spoken: the prompt follows in a second
        break;
      }
      case 'puff': DD.Audio.play('puff'); if (weather.addDust) weather.addDust(e.x, e.y, 4); break;
      case 'ask': {
        lastAsk = e; idleSaid = 0; DD.UI.fadeBubble(false);
        const txt = askText(e);
        lastPromptText = txt;
        DD.UI.say(txt); speakPrompt(txt, { priority: true });
        break;
      }
      case 'dig': if (!e.again) stats.digs++; if (!e.again) bunMood('dig', 1.2); break;
      case 'scoop': {
        DD.Audio.play('scoop', { i: e.i || 0 });
        if ((e.i || 0) === 0 && scoopSaid < 1 && canInterrupt() && !e.again) { scoopSaid++; speak(T('scoop')); }
        break;
      }
      case 'fling': DD.Audio.play('fling'); if (weather.addSand) weather.addSand(e.x, e.y, 3); break;
      case 'sandLand': DD.Audio.play('sandLand'); if (weather.addDust) weather.addDust(e.x, e.y, 2); break;
      case 'reveal': DD.Audio.play('reveal'); break;
      case 'found': {
        stats.correct++;
        promptUntil = 0; pendingPrompt = null;
        DD.Audio.play('found');
        render.burst('sparkles', e.x, e.y - 40, { n: 10, color: e.thing && e.thing.color });
        bunMood('happy', 1.2);
        if (e.count) {   // the count word: queued, never interrupting, so a fast child hears the newest numbers
          DD.Audio.play('count', { i: e.count.i });
          render.burst('count', e.x, e.y - 120, { n: e.count.i });
          speak(countWord(e.count.i));
          promptUntil = performance.now() + 700;
        } else { lastFoundAt = performance.now(); speak(line('sayFound', ev2(e)), { interrupt: true }); }
        break;
      }
      case 'hatch': {
        DD.Audio.play('crack'); setTimeout(() => DD.Audio.play('chirp'), wait(250));
        render.burst('sparkles', e.x, e.y - 50, { n: 14, color: e.color });
        if (weather.burst) weather.burst(e.x, e.y - 40, { kind: 'stars', n: 6 });
        if (performance.now() - lastFoundAt > 1800 || !(DD.Voice && DD.Voice.isSpeaking && DD.Voice.isSpeaking())) speak(line('sayHatch', e));
        break;
      }
      case 'hop': DD.Audio.play('hopUp'); DD.UI.fadeBubble(true); break;   // the find may fly past the bubble (visual P2-3)
      case 'shelved': DD.Audio.play('clonk'); render.burst('sparkles', e.x, e.y - 30, { n: 5 }); break;
      case 'stepDone': {
        if (!e.last) DD.Audio.play('stepDone');
        const s = world.cur && world.cur.steps && world.cur.steps[e.step];
        if (s && s.mode === 'count') speak(DD.I18N.sayCountDone ? DD.I18N.sayCountDone(curLang(), s.need) : T('praise'));
        break;
      }
      case 'wrong': {
        stats.wrong++;
        DD.Audio.play('boing');
        render.burst('ring', e.x, e.y - 40, { size: 110 });
        bunMood('oops', 1.2);
        const now = performance.now();
        if (now - lastWrongSay > 1500) { lastWrongSay = now; feedback(line('sayWrong', ev2(e), 'hint')); }
        break;
      }
      case 'already': {
        DD.Audio.play('soft');
        const now = performance.now();
        if (now - lastSoftSay > 3000 && canInterrupt()) { lastSoftSay = now; speak(T('already')); }
        break;
      }
      case 'busy': DD.Audio.play('pat'); break;
      case 'sandTap': DD.Audio.play('pat'); if (weather.addDust) weather.addDust(e.x, e.y, 3); break;
      case 'shelfTap': DD.Audio.play('clonk'); break;
      case 'hint': {
        stats.hints++;
        DD.Audio.play('hint');
        bunMood('point', 1.6);
        if (!e.idle) speak(T('hint'));   // queued: the feedback line goes first
        break;
      }
      case 'assist': DD.Audio.play('hint'); speak(T('hint')); break;
      case 'idle':
        if (++idleSaid <= 4) speak(T('idle') + ' ' + currentPrompt());   // then stay quiet: maybe nobody is there
        else if (idleSaid >= 5 && !bot) pause();   // ≈ 2 min without a touch: nobody is playing — pause
        break;
      case 'pokeBun': {
        // never restart the prompt while Bun is still saying it (playtest P2)
        if (DD.Voice && DD.Voice.isSpeaking && DD.Voice.isSpeaking() && lastSpoken === lastPromptText) { bunMood('idle', 0); break; }
        const since = performance.now() - promptStart;
        const stuck = pendingPrompt && since > 6000;   // the prompt never started (no voice / dropped): don't wait forever
        if (since > 3000 && (!pendingPrompt || stuck)) repeatPrompt();
        else if (world.bun && world.bun.mood === 'talk') bunMood('idle', 0);   // no line follows: no silent mouth flaps
        break;
      }
      case 'soft': DD.Audio.play('pat'); break;   // a long press / drag: a gentle pat, no words
      case 'mole':
        DD.Audio.play('mole'); if (weather.addDust) weather.addDust(e.x, e.y, 5);
        if (canInterrupt()) speak(T('surprise.mole'));
        break;
      case 'moleTap':
        DD.Audio.play('giggle');
        render.burst('sparkles', e.x, e.y - 40, { n: 10 });
        speak(T('mole.tap'), { interrupt: canInterrupt() });
        break;
      case 'ptero':
        DD.Audio.play('flutter');
        if (canInterrupt()) speak(T('surprise.ptero'));
        break;
      case 'pteroTap':
        DD.Audio.play('flutter'); DD.Audio.play('giggle');
        if (weather.burst) weather.burst(e.x, e.y, { kind: 'feathers', n: 8 });
        render.burst('sparkles', e.x, e.y, { n: 8 });
        speak(T('ptero.tap'), { interrupt: canInterrupt() });
        break;
      case 'roundDone': {
        const n = e.stars || 1, fx = view.W / 2, fy = view.H * 0.45;
        bunMood('cheer', 1.4);
        for (let i = 0; i < n; i++) {
          render.burst('star', fx + (i - (n - 1) / 2) * 60, fy, { delay: 0.1 + i * 0.22, onDone: () => { shownStars++; DD.UI.setStars(shownStars, true); DD.Audio.play('star', { i }); } });
        }
        DD.UI.setDots(world.roundsPerLevel || 4, ((e.round != null ? e.round : world.round) % (world.roundsPerLevel || 4)) + 1);
        const now = performance.now();
        if (now - lastPraise > 1200) { lastPraise = now; speak(T(e.stars >= 3 ? 'great' : 'praise')); }   // queued
        break;
      }
      case 'shelfLeave': DD.Audio.play('sweep', { i: 2 }); break;
      case 'talk': DD.UI.fadeBubble(false); DD.UI.say(''); DD.UI.setDots(world.roundsPerLevel || 4, world.roundsPerLevel || 4); openTalk(e.talk || world.talk); break;
      case 'talkAsk': {   // no answer yet: ask again, and from the 2nd re-ask glow the right answer
        const tk = e.talk || world.talk;
        if (tk && e.n <= 3) speak(T(tk.promptKey, tk.params || {}), { priority: true });
        if (tk && (e.n >= 2 || e.glowAnswer)) DD.UI.glowTalk(tk.answerId || tk.answer);
        break;
      }
      case 'talkResult': {
        stats.talks++; if (e.correct) stats.talkRight++;
        DD.UI.markTalk(e.choiceId, e.answerId);
        const ans = (world.talk && world.talk.choices.find(c => c.id === e.answerId)) || {};
        if (e.auto) { speak(DD.I18N.talkWrong ? DD.I18N.talkWrong(curLang(), ans) : T('talk.wrong.any'), { interrupt: true }); break; }
        if (e.correct) {
          DD.Audio.play('talkRight');
          render.burst('star', view.W / 2, view.H / 2, { onDone: () => { shownStars++; DD.UI.setStars(shownStars, true); DD.Audio.play('star'); } });
          speak(T('talk.right'), { interrupt: true });
        } else {
          DD.Audio.play('soft');
          speak(DD.I18N.talkWrong ? DD.I18N.talkWrong(curLang(), ans) : T('talk.wrong.any'), { interrupt: true });
        }
        break;
      }
      case 'levelDone':
        DD.Audio.play('level'); DD.UI.say('');
        if (mode === 'talk') { mode = 'play'; DD.UI.only(); }
        $('stage').classList.remove('talking');
        break;
      case 'sessionDone': {
        DD.Audio.play('fanfare');
        if (weather.setParty) weather.setParty(true);
        render.setGallery(e.treasures || world.treasures);
        render.burst('confetti', 0, 0);
        progress.totalStars += e.stars || 0; progress.sessions++;
        DD.Storage.setJSON('progress', progress);
        shownStars = e.stars || shownStars; DD.UI.setStars(shownStars);
        $('doneStars').textContent = e.stars || 0;
        $('doneTitle').textContent = T('session.done', { stars: e.stars || 0 });
        speak(T('party'), { interrupt: true });
        speak(T('session.done', { stars: e.stars || 0 }));
        mode = 'done';
        DD.UI.only('scrDone'); DD.UI.show('hud', false); DD.UI.say('');
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
    const canMic = S.mic && DD.Voice && DD.Voice.canListen && DD.Voice.canListen() && !FLAGS.bot;
    DD.UI.openTalk(talk, curLang(), id => { DD.Audio.play('click'); world.talkAnswer(id); }, canMic, curAge());
    const q = T(talk.promptKey, talk.params || {});
    speakPrompt(T('talk.intro') + ' ' + q, { priority: true });   // queued after the round's praise, not cutting it off
  }
  function listen() {
    const talk = world.talk;
    if (!talk || world.state !== 'talk' || !DD.Voice || !DD.Voice.canListen()) return;
    if (DD.Voice.stop) DD.Voice.stop();
    DD.Audio.play('listen');
    DD.UI.setListening(true, T('ui.listening'));
    const choices = talk.choices.map(c => ({ id: c.id, words: DD.I18N.choiceWords ? DD.I18N.choiceWords(curLang(), c) : [] }));
    DD.Voice.listen({ lang: curLang(), choices, timeoutMs: 6000 }).then(res => {
      DD.UI.setListening(false, T('ui.tapOrSay'));
      if (world.state !== 'talk') return;
      if (res && res.id != null) world.talkAnswer(res.id);
      else if (res && res.reason === 'not-allowed') { $('btnMic').classList.add('hidden'); speak(T('ui.micDenied')); }
      else speak(T('ui.tapOrSay'));
    }).catch(() => DD.UI.setListening(false, T('ui.tapOrSay')));
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
    const speaking = DD.Voice && DD.Voice.isSpeaking ? DD.Voice.isSpeaking() : false;
    DD.Audio.duck(speaking);
    if (DD.Audio.tick) DD.Audio.tick(dt);
    render.draw(world, weather, { boxes: domBoxes(), dt: dt * Math.min(speed, 4), lang: curLang(), title: mode === 'title' || mode === 'loading', speaking, done: mode === 'done', debug: FLAGS.debug });
    adapt(raw);
  }
  function adapt(raw) {  // adaptive quality: step the render scale down when frames stay slow
    if (raw > 0.5) return;
    if (raw > 0.022) { slowAcc += raw; stats.slowFrames++; } else slowAcc = Math.max(0, slowAcc - raw * 0.5);
    // only the backing store shrinks: World.setViewport would cancel the child's tap
    if (slowAcc > 1.5 && quality > 0.6) { quality *= 0.85; render.quality = Math.max(0.5, quality); slowAcc = 0; pendingResize = true; }
  }

  /* ---------- input ---------- */
  function toLogical(cx, cy) { return { x: (cx - view.left) / view.s, y: (cy - view.top) / view.s }; }
  function repeatPrompt() {
    if (world.state !== 'round') return;
    DD.Audio.play('click');
    bunMood('talk', 1.0);
    if (!lastAsk && !(world.prompt && world.prompt())) return;
    const cp = currentPrompt(); promptUntil = 0; speakPrompt(cp, { interrupt: true });
  }

  function bindUI() {
    DD.Input.kidProof();
    inputCancel = DD.Input.attach($('game'), {
      toLogical,
      down: (x, y) => { if (mode === 'play' && !bot) world.pointerDown(x, y); },   // the mole and the pterosaur react on the press
      move: (x, y) => { if (mode === 'play' && !bot) world.pointerMove(x, y); },
      up: (x, y) => { if (mode === 'play' && !bot) world.pointerUp(x, y); },      // a tap: dig a mound, Bun (repeat)
      cancel: () => { if (world.cancelDrag) world.cancelDrag(); }
    });
    const unlock = () => { DD.Audio.unlock(); if (DD.Voice) DD.Voice.unlock(); };
    ['touchend', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { capture: true, passive: true }));

    $('btnPlay').addEventListener('click', () => { DD.Audio.play('click'); startGame(); });
    $('bubble').addEventListener('click', repeatPrompt);
    $('btnPause').addEventListener('click', () => { DD.Audio.play('click'); pause(); });
    $('btnResume').addEventListener('click', () => { DD.Audio.play('click'); resume(); });
    $('btnHome').addEventListener('click', () => { DD.Audio.play('click'); goTitle(); });
    $('btnAgain').addEventListener('click', () => { DD.Audio.play('click'); startGame(); });
    $('btnDoneHome').addEventListener('click', () => { DD.Audio.play('click'); goTitle(); });
    $('btnMic').addEventListener('click', listen);
    // volume: settings slider + big − / + in the pause menu
    $('optVolume').addEventListener('input', () => { S.volume = +$('optVolume').value / 100; saveSettings(); applyAudio(); });
    $('optVolume').addEventListener('change', () => DD.Audio.play('pop'));
    const vstep = d => { S.volume = Math.max(0, Math.min(1, Math.round(((S.volume == null ? 1 : S.volume) + d) * 20) / 20)); saveSettings(); applyAudio(); DD.Audio.play('pop'); };
    $('btnVolDown').addEventListener('click', () => vstep(-0.1));
    $('btnVolUp').addEventListener('click', () => vstep(0.1));
    document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => {
      S.lang = b.dataset.lang; langOverride = null; saveSettings(); DD.UI.applyLang(curLang()); applyAudio(); DD.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
      updateVoiceInfo();
      DD.Audio.play('click');
      if (mode === 'title') speak(T('ui.welcome'), { interrupt: true });
    }));
    // parent gate: hold the gear for 2 s
    const gear = $('btnParents');
    DD.Input.holdButton(gear, 2000, () => { gear.style.setProperty('--p', 0); openSettings(); },
      p => { gear.style.setProperty('--p', p); gear.classList.toggle('holding', p > 0); });
    gear.addEventListener('click', () => { gear.classList.add('tip'); setTimeout(() => gear.classList.remove('tip'), 1600); });
    DD.UI.bindSettings(S, k => {
      saveSettings();
      if (k === 'sfx' || k === 'music' || k === 'voice') applyAudio();
      if (k === 'age') { ageOverride = null; DD.UI.setTitleInfo(progress.totalStars, curAge(), curLang()); }
      if (k === 'name' && DD.I18N.setChild) DD.I18N.setChild(S.name);
    }, curAge);
    $('btnSettingsDone').addEventListener('click', () => { DD.Audio.play('click'); DD.UI.only('scrTitle'); DD.UI.setTitleInfo(progress.totalStars, curAge(), curLang()); });

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(applySize, 250));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { pause(); DD.Audio.suspend(); if (DD.Voice) DD.Voice.stop(); }
      else DD.Audio.resume();
    });
    window.addEventListener('blur', () => { if (world && world.cancelDrag) world.cancelDrag(); });
  }
  function openSettings() {
    DD.Audio.play('click');
    DD.UI.refreshSettings();
    updateVoiceInfo();
    DD.UI.only('scrSettings');
  }
  function updateVoiceInfo() {
    if (!DD.Voice) return;
    const has = DD.Voice.hasVoice ? DD.Voice.hasVoice(curLang()) : false;
    const nm = DD.Voice.voiceName ? DD.Voice.voiceName() : '';
    const mic = DD.Voice.canListen && DD.Voice.canListen();
    const v = has ? (curLang() === 'vi' ? 'Giọng đọc: ' : 'Voice: ') + (nm || '✓') : T('ui.voiceMissing');
    const m = mic ? '' : ' · ' + T('ui.micUnsupported');
    DD.UI.setVoiceInfo(v + m);
  }

  /* ---------- test hooks (DESIGN §5.5) ---------- */
  function hooks() {
        const circ = c => (c ? { x: view.left + c.x * view.s, y: view.top + c.y * view.s, r: (c.r || 0) * view.s } : null);
    const box = b => (b ? { x: view.left + b.x * view.s, y: view.top + b.y * view.s, w: (b.w || 0) * view.s, h: (b.h || 0) * view.s } : null);
    const prev = DD.debug || {};
    DD.debug = prev;
    Object.defineProperties(prev, Object.getOwnPropertyDescriptors({
      get world() { return world; }, get weather() { return weather; }, get mode() { return mode; }, stats,
      get bot() { return bot; },
      voiceLog: (DD.Voice && DD.Voice.log) || prev.voiceLog || [],
      getState() {
        const s = world.stepInfo;
        return { mode, state: world.state, phase: world.phase, level: world.level, topic: world.topic, round: world.round, step: world.step,
          stepMode: s ? s.mode : null, stars: world.stars, misses: world.misses, digging: !!world.dig,
          mounds: (world.mounds || []).map(m => m.state), shelf: (world.shelfItems || []).length, surprise: world.cur && world.cur.surprise,
          weather: weather.ambient && weather.ambient.mood, W: view.W, H: view.H, ins: view.ins, settings: Object.assign({}, S), speed };
      },
      setSpeed(n) { speed = Math.max(0.1, +n || 1); applyAudio(); },
      startGame, goTitle,
      setBot(on, skill) { bot = on ? new DD.Bot(world, { skill: skill == null ? FLAGS.botSkill : skill, seed: 7 }) : null; },
      setAutoRestart(on) { autoRestart = !!on; },
      gotoLevel(i) { world.startLevel(i); },
      view: () => view, render: () => render,
      moundScreen(id) { const p = world.moundTap ? world.moundTap(id) : null; const h = world.moundHit ? world.moundHit(id) : null; return p ? { x: view.left + p.x * view.s, y: view.top + p.y * view.s, r: ((h && h.r) || 0) * view.s } : null; },
      bunScreen() { return box(world.bunHit ? world.bunHit() : null); },
      moleScreen() { return circ(world.moleHit ? world.moleHit() : null); },
      pteroScreen() { return circ(world.pteroHit ? world.pteroHit() : null); },
      answer() { return world.answer ? world.answer() : null; },
      toScreen(x, y) { return { x: view.left + x * view.s, y: view.top + y * view.s }; },
      audio: () => DD.Audio
    }));
  }

  /* ---------- boot ---------- */
  async function boot() {
    await DD.Storage.init();
    S = Object.assign({}, DEF, DD.Storage.getJSON('settings', {}));
    Object.assign(progress, DD.Storage.getJSON('progress', {}));
    DD.UI.applyLang(curLang());
    if (DD.I18N && DD.I18N.setChild) DD.I18N.setChild(S.name);
    if (DD.Voice) { DD.Voice.init({ lang: curLang(), enabled: voiceOn() }); const prevStart = DD.Voice.onStart; DD.Voice.onStart = d => { onVoiceStart(d); if (prevStart) prevStart(d); }; }
    render = new DD.Renderer($('game')); DD.render = render;
    world = new DD.World({ seed: FLAGS.seed != null ? FLAGS.seed : (Date.now() & 0x7fffffff), age: FLAGS.age || S.age, lang: curLang() });
    weather = new DD.Weather({ width: 960, height: 720, seed: 11 });
    hooks();
    bindUI();
    applySize();
    weather.setWeather(0, { instant: true });
    await DD.Assets.load();
    render.prewarm(world.layout, 0);
    applyAudio();
    if (FLAGS.bot) bot = new DD.Bot(world, { skill: FLAGS.botSkill, seed: 7 });
    DD.UI.only('scrTitle');
    DD.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
    mode = 'title';
    requestAnimationFrame(frame);
    if (FLAGS.autostart) startGame();
    if (DD.Voice && DD.Voice.onVoicesChanged) DD.Voice.onVoicesChanged(updateVoiceInfo);
  }
  window.addEventListener('DOMContentLoaded', () => boot().catch(e => { console.error(e); }));
})(window.DD = window.DD || {});
