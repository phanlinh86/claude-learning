/* FP main (Bo's Farm Parade) — boots the game, sizes the canvas for any phone / tablet shape, runs the loop and turns world
 * events (the parade walks in, the odd one boings onto the hay bale, apples are counted, the barn doors open, the friends
 * march in step, the weathervane spins, stars burst from the roof) into voice, sound, effects and UI, following the
 * event → line table in docs/VOICE.md §1.1 (prompts protected, the count run never cut, praise / hints / gate queued).
 * Touches reach the world only through FP.Input (two numbers in logical px; HUD / bubble / menus never reach the canvas). */
(function (FP) {
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
  const T1 = (key, p) => (FP.I18N ? FP.I18N.t(curLang(), key, Object.assign({ child: S.name || '' }, p || {})) : key);
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
  const saveSettings = () => FP.Storage.setJSON('settings', S);
  const progress = { totalStars: 0, sessions: 0 };

  let world, weather, render, bot = null, inputCancel = null;
  let mode = 'loading';            // loading | title | play | paused | talk | done
  let speed = FLAGS.speed, autoRestart = FLAGS.autorestart;
  let view = { W: 960, H: 720, s: 1, left: 0, top: 0, ins: { top: 0, right: 0, bottom: 0, left: 0 } };
  const stats = { sessions: 0, rounds: 0, correct: 0, wrong: 0, wiggles: 0, soft: 0, hints: 0, assists: 0, counts: 0, hops: 0, lands: 0,
    doors: 0, doorAuto: 0, marches: 0, parades: 0, steps: 0, talks: 0, talkRight: 0, chickTaps: 0, roosterTaps: 0, fireflyTaps: 0,
    surprises: 0, pokes: 0, frames: 0, slowFrames: 0 };
  const eventLog = [];             // the last 300 world events (type + id), for the e2e tests
  let promptUntil = 0, lastWrongSay = -1e9, idleSaid = 0, shownStars = 0, lastPraise = -1e9, lastPopSay = -1e9;
  let pendingStars = 0, sessionThings = [];
  let inputBlockUntil = 0;         // canvas presses right after Resume / Play / Play again are ignored (a double tap falls through)
  let lastRight = null;            // the right answer's line + thing: re-said (short) when a pause cut it during the hop
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
    world.setViewport(view.W, view.H, view.ins);    // line, slots, barn, stage, Bo re-laid; members re-target and walk
    weather.resize(view.W, view.H, world.layout && world.layout.groundY);
    placeBubble();
    updateHudStarTarget();
  }
  function placeBubble() {
    const B = world.layout && world.layout.bubble;
    if (!B) return;
    const r = { x: view.left + B.x * view.s, y: view.top + B.y * view.s, w: B.w * view.s, h: B.h * view.s };
    FP.UI.placeBubble(r);
  }
  function updateHudStarTarget() {
    const p = FP.UI.hudStarPoint();
    if (p.x || p.y) render.hudStar = { x: (p.x - view.left) / view.s, y: (p.y - view.top) / view.s };
  }
  let resizeT = 0;
  function onResize() { clearTimeout(resizeT); resizeT = setTimeout(applySize, 120); }

  /* ---------- voice ---------- */
  const voiceOn = () => S.voice && !FLAGS.novoice && speed <= 1.01 && !FLAGS.mute;
  function speak(text, opt) {
    if (!text) return null;
    lastSpoken = text;
    return FP.Voice ? FP.Voice.say(text, opt || {}) : null;
  }
  const speaking = () => !!(FP.Voice && FP.Voice.isSpeaking && FP.Voice.isSpeaking());
  function applyAudio() {
    const vol = S.volume == null ? 1 : S.volume;
    FP.Audio.setOptions({ sfx: S.sfx, music: S.music, muted: FLAGS.mute, volume: vol });
    if (FP.Voice) { FP.Voice.setLang(curLang()); FP.Voice.setEnabled(voiceOn()); if (FP.Voice.setVolume) FP.Voice.setVolume(vol); if (FP.Voice.setSpeed) FP.Voice.setSpeed(speed); }
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
    // the line ended (or was dropped / failed) without ever starting: lift the guard so a Bo tap repeats it
    if (p && p.then) p.then(() => { if (pendingPrompt === txt) { pendingPrompt = null; promptUntil = Math.min(promptUntil, performance.now() + 300); } }, () => {});
    if (!voiceOn()) { pendingPrompt = null; promptUntil = performance.now() + lineMs(txt); }
  }
  function onVoiceStart(display) {
    if (pendingPrompt && display === pendingPrompt) { promptStart = performance.now(); promptUntil = promptStart + lineMs(display); pendingPrompt = null; }
  }
  const canInterrupt = () => performance.now() > promptUntil;
  /** feedback (right / wrong) interrupts — but never the prompt while it is protected (then it queues) */
  const feedback = txt => speak(txt, { interrupt: canInterrupt() });
  /** the wrong line carries the goal ("… find the one that's not red!"): protect it like a prompt */
  const protect = txt => { if (txt) promptUntil = Math.max(promptUntil, performance.now() + lineMs(txt)); };

  /* ---------- game flow ---------- */
  function startGame() {
    FP.Audio.unlock();
    world.setAge(curAge()); world.setLang(curLang());
    world.lastTopics = FP.Storage.getJSON('lastTopics', null);   // chapters rotate between sessions
    world.newSession({ lastTopics: world.lastTopics });
    if (world.levels) FP.Storage.setJSON('lastTopics', world.levels);
    if (FLAGS.level != null) world.startLevel(Math.max(0, Math.min(3, FLAGS.level | 0)));
    shownStars = 0; pendingStars = 0; FP.UI.setStars(0); lastAsk = null; lastPromptText = ''; sessionThings = []; lastRight = null;
    blockInput();
    render.clearGallery();
    if (weather.setParty) weather.setParty(false);
    mode = 'play';
    $('stage').classList.remove('talking');
    FP.UI.only(); FP.UI.show('hud'); FP.UI.say('');
    FP.Audio.setMood(world.level || 0); FP.Audio.startMusic(); FP.Audio.setFanfare(false);
    applyAudio();
    stats.sessions++;
    requestAnimationFrame(() => { updateHudStarTarget(); applySize(); });
  }
  function goTitle() {
    mode = 'title';
    $('stage').classList.remove('talking');
    if (FP.Voice) FP.Voice.stop();
    if (inputCancel && inputCancel.cancel) inputCancel.cancel();
    if (world.cancelDrag) world.cancelDrag();
    FP.Audio.stopMusic();
    FP.UI.only('scrTitle'); FP.UI.show('hud', false); FP.UI.say('');
    FP.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
    weather.setWeather(0, {}); if (weather.setParty) weather.setParty(false);
  }
  function pause() {
    if (mode !== 'play' && mode !== 'talk') return;
    mode = 'paused';
    if (inputCancel && inputCancel.cancel) inputCancel.cancel();
    if (world.cancelDrag) world.cancelDrag();
    if (FP.Voice) { FP.Voice.stop(); if (FP.Voice.stopListening) FP.Voice.stopListening(); }
    FP.Audio.stopMusic();
    FP.UI.only('scrPause');
  }
  function resume() {
    if (mode !== 'paused') return;
    mode = world.state === 'talk' ? 'talk' : 'play';
    blockInput();
    idleSaid = 0;   // a returning child gets the nudges again before the next auto-pause
    if (world.resetNudges) world.resetNudges();
    FP.UI.only(mode === 'talk' ? 'scrTalk' : undefined);
    FP.Audio.startMusic();
    // say the question again so a returning child knows what to do
    if (mode === 'talk' && world.talk && !world.talkAnswered) speak(T(world.talk.promptKey, world.talk.params || {}), { priority: true });
    else if (world.interactive) setTimeout(repeatPrompt, 300);
    else if (world.state === 'round' && world.phase === 'hop' && lastRight) {
      // the pause cut the right line: say it again (a count run → just the crate's name, the apples are already counted)
      const t = lastRight.count ? lastRight.name : lastRight.text;
      if (t) { FP.UI.say(t); speak(t, { priority: true }); }
    } else { const an = world.answer ? world.answer() : null; if (an && an.door) speak(T('gateShort')); }
  }

  let lastPromptText = '', lastAsk = null, lastRound = null;
  function currentPrompt() {   // prompts have several wordings: repeat the one Bo said, word for word
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
    const I = FP.I18N;
    if (I && typeof I[fn] === 'function') { try { const t = I[fn](curLang(), e); if (t) return t; } catch (err) { /* fall back */ } }
    return fallbackKey ? T(fallbackKey) : '';
  }
  function boMood(m, t) { if (world.bo) { world.bo.mood = m; world.bo.moodT = t; } }
  function askText(e) {
    const I = FP.I18N;
    if (I && I.ask) { try { return I.ask(curLang(), e.promptKey, Object.assign({ child: S.name || '' }, e.params || {}), { first: !!e.first }); } catch (err) { /* fall back */ } }
    return T(e.promptKey, e.params || {});
  }
  const boMouth = () => { const B = world.layout.bo; return { x: B.x + 0.24 * B.h, y: B.y - 0.6 * B.h }; };
  function flyStars(n, x, y) {
    for (let i = 0; i < n; i++) {
      render.burst('star', x + (i - (n - 1) / 2) * 60, y, { delay: 0.1 + i * 0.2, onDone: () => { shownStars++; FP.UI.setStars(shownStars, true); FP.Audio.play('star', { i }); } });
    }
  }
  function flushStars() {   // the round's stars never wait for a parade that will not come (rotation, skip): fly them now
    if (pendingStars > 0) { const L = world.layout; flyStars(pendingStars, L.stage.x, L.stage.y - 60); pendingStars = 0; }
  }

  function onEvent(e) {
    switch (e.type) {
      case 'level': {
        const wi = (e.weather != null ? e.weather : e.level) % 4;
        weather.setWeather(wi, {});
        FP.Audio.setMood(wi); FP.Audio.play('chapter');
        FP.UI.setDots(world.roundsPerLevel || 4, 0);
        speak(T('ui.chapter', { n: e.level + 1 }) + '. ' + T('topic.' + e.topic), { interrupt: true });
        speak(T('weather.' + wi));   // queued after the chapter name ("Good morning, farm!")
        FP.UI.say('');   // the chapter banner shows the topic
        render.prewarm(world.layout, wi);
        break;
      }
      case 'round': {
        flushStars();
        FP.UI.fadeBubble(false); FP.Audio.setFanfare(false);
        stats.rounds++; idleSaid = 0; lastAsk = null; lastPromptText = '';
        FP.UI.setDots(world.roundsPerLevel || 4, e.round % (world.roundsPerLevel || 4));
        FP.UI.say(T('enter'));   // shown, not spoken: the prompt follows in a second
        if (world.cur) for (const q of world.cur.members) sessionThings.push(q.thing);
        if (sessionThings.length > 40) sessionThings = sessionThings.slice(-40);
        break;
      }
      case 'step': stats.steps++; FP.Audio.play(e.kind === 'animal' ? 'step' : 'rattle'); break;
      case 'memberIn': FP.Audio.play('settle'); break;
      case 'ask': {
        lastAsk = e; idleSaid = 0; FP.UI.fadeBubble(false); roundMissed = false; hintBySay = false;
        // the long "…but one!" form only in a chapter's first round; later rounds use the short wordings
        const txt = askText(Object.assign({}, e, { first: !!e.first && e.round === 0 }));
        lastPromptText = txt;
        FP.UI.say(txt); speakPrompt(txt, { priority: true });
        break;
      }
      case 'right': {
        stats.correct++;
        promptUntil = 0; pendingPrompt = null;
        const th = e.thing || {};
        FP.Audio.play('right');
        render.burst('sparkles', e.x, e.y, { n: 16, color: th.color });
        const M = boMouth(); render.burst('woof', M.x + 20, M.y);
        // ONE line: "The blue bucket! It's not red." / the count run for crates (never "Woof!" on top: the bark is the sound)
        const txt = line('sayRight', ev2(e), 'praise');
        const isCount = th.kind === 'crate' || !!e.count;
        let nm = ''; try { nm = FP.I18N.sayName(curLang(), th) || ''; } catch (err) { nm = ''; }
        lastRight = { text: txt, count: isCount, name: nm ? nm.charAt(0).toUpperCase() + nm.slice(1) + '!' : txt };
        if (isCount) { speak(txt, { interrupt: canInterrupt(), priority: true }); promptUntil = performance.now() + 900 + 650 * ((e.count && e.count.n) || th.n || 1) + lineMs(txt) * 0.3; }
        else { feedback(txt); protect(txt); }
        FP.UI.say(txt);
        break;
      }
      case 'hop': stats.hops++; FP.Audio.play('boing'); break;
      case 'land': {
        stats.lands++;
        FP.Audio.play('thump');
        render.burst('puff', e.x, e.y + 4, { n: 8, color: '#F6E2A6' });
        if (world.stage && world.stage.badge) setTimeout(() => FP.Audio.play('pop'), 120 / speed);
        break;
      }
      case 'count': {   // one apple lights up: a rising pip + the numeral (the words are the right line's count run)
        stats.counts++;
        FP.Audio.play('pip', { i: e.i });
        const L = world.layout;
        render.burst('count', e.x, e.y - (L ? L.item * 0.75 : 80), { n: e.i });
        break;
      }
      case 'wrong': {
        stats.wrong++;
        FP.Audio.play('boop');
        roundMissed = true;
        const now = performance.now();
        if (now - lastWrongSay > 1500) {
          lastWrongSay = now;
          const m = memberOf(e.id), ee = ev2(Object.assign({}, e, { thing: (m && m.thing) || e.thing }));
          // the miss that brings the hint: ONE short line that also points at the glowing one
          const wt = e.hint ? line('sayWrongHint', ee, 'hint') : line('sayWrong', ee, 'hint');
          if (e.hint) hintBySay = true;
          feedback(wt); protect(wt); FP.UI.say(wt);
        }
        break;
      }
      case 'wiggle': stats.wiggles++; FP.Audio.play('wiggle'); break;
      case 'soft': stats.soft++; FP.Audio.play('puff'); break;
      case 'hint': {
        stats.hints++;
        FP.Audio.play('hint');
        // the pointer line was already said with the miss; else (3 soft presses) a priority line, never dropped as stale
        if (!e.idle && !hintBySay) speak(T('hint'), { priority: true });
        hintBySay = false;
        break;
      }
      case 'gateHint':
        FP.Audio.play('hint');
        // chapter 1 only: a short spoken nudge with the ghost hand (later chapters: the hand + the creak say it)
        if (world.level === 0 && !speaking()) { const g = T('gateShort'); FP.UI.say(g); speak(g); }
        break;
      case 'assistArmed': FP.Audio.play('hint'); break;
      case 'assist': stats.assists++; break;
      case 'idle':
        if (++idleSaid <= 4) speak(T('idle') + ' ' + currentPrompt());   // then stay quiet: maybe nobody is there
        else if (idleSaid >= 5 && !bot) pause();   // ≈ 2 min without a touch: nobody is playing — pause
        break;
      case 'pokeBo': {
        stats.pokes++;
        FP.Audio.play('woof', { pitch: 1.1 });
        if (e.gate) { if (!speaking()) { const g = T('gateShort'); FP.UI.say(g); speak(g, { interrupt: true }); } break; }
        // only a question that can still be answered is repeated: during enter / hop / march Bo just giggles — and never
        // over another line (the count run, the right line), so nothing is cut
        if (!world.interactive || !lastAsk) { if (!speaking() && canInterrupt()) speak(T('bo.poke')); boMood('happy', 0.8); break; }
        // never restart the prompt while Bo is still saying it
        if (speaking() && lastSpoken === lastPromptText) { boMood('idle', 0); break; }
        const since = performance.now() - promptStart;
        const stuck = pendingPrompt && since > 6000;   // the prompt never started (no voice / dropped): don't wait forever
        if (since > 3000 && (!pendingPrompt || stuck)) repeatPrompt();
        else if (world.bo && world.bo.mood === 'talk') boMood('idle', 0);
        break;
      }
      case 'roundDone': {
        FP.Audio.play('complete');
        pendingStars += e.stars || 1;   // they fly from the barn roof at the parade
        FP.UI.setDots(world.roundsPerLevel || 4, ((e.round != null ? e.round : world.round) % (world.roundsPerLevel || 4)) + 1);
        lastRound = { round: e.round != null ? e.round : world.round, stars: e.stars || 0, missed: roundMissed || (e.misses || 0) > 0 };
        break;   // no line: the right line just said why; one praise comes at the parade (after a miss / the last round)
      }
      case 'gateAsk': {
        // spoken only in chapter 1 round 0 (the long "Open the barn!"); every other gate is silent: bubble, hand + creak
        const first = world.level === 0 && world.round === 0;
        const g = T(first ? 'gate' : 'gateShort');
        FP.UI.say(g);
        if (first) { speak(g); protect(g); }   // queued after the right line
        break;
      }
      case 'doorOpen': {
        stats.doors++; if (e.auto) stats.doorAuto++;
        FP.Audio.play('creak');
        setTimeout(() => FP.Audio.play('clunk'), 420 / Math.max(1, speed));
        if (!e.auto && e.tapX != null) render.burst('ring', e.tapX, e.tapY, { size: 110, rgb: '255,240,200', life: 0.4 });
        FP.UI.fadeBubble(true);
        break;
      }
      case 'marchStart': stats.marches++; break;
      case 'marchStep': FP.Audio.play('march', { i: e.i }); break;
      case 'inBarn': break;
      case 'parade': {
        stats.parades++;
        const grand = !!e.grand;   // the chapter's last round: the long fanfare, a confetti burst, Bo dances (world mood)
        if (grand) stats.grand = (stats.grand || 0) + 1;
        FP.Audio.setFanfare(true); FP.Audio.play(grand ? 'fanfareBig' : 'fanfare'); FP.Audio.play('whirr');
        setTimeout(() => FP.Audio.setFanfare(false), (grand ? 2600 : 1500) / Math.max(1, speed));
        if (weather.burst) weather.burst(e.x, e.y, { kind: 'stars', n: 12 });
        render.burst('sparkles', e.x, e.y, { n: grand ? 24 : 14 });
        if (grand) render.burst('confetti', 0, 0, { n: 40, life: 2.6 });
        if (pendingStars > 0) { flyStars(pendingStars, e.x, e.y); pendingStars = 0; }
        // ONE praise, only after a round with a miss or in the chapter's last round (no "march" line); droppable
        const lr = lastRound || {};
        if ((lr.missed || grand) && !speaking() && canInterrupt() && performance.now() - lastPraise > 1200) {
          lastPraise = performance.now(); speak(T(lr.stars >= 3 ? 'great' : 'praise'));
        }
        break;
      }
      case 'leave': FP.Audio.play('boing'); break;
      case 'doorClose': FP.Audio.play('creak'); setTimeout(() => FP.Audio.play('clunk'), 380 / Math.max(1, speed)); break;
      case 'chick':
        stats.surprises++; FP.Audio.play('peep');
        if (canInterrupt()) speak(T('surprise.chick'));
        break;
      case 'chickTap':
        stats.chickTaps++;
        FP.Audio.play('peep'); FP.Audio.play('flap');
        render.burst('feathers', e.x, e.y, { n: 6 });
        if (canInterrupt() && !speaking()) speak(T('chick.tap'), { interrupt: true });
        break;
      case 'rooster':
        stats.surprises++; FP.Audio.play('flap');
        if (canInterrupt()) speak(T('surprise.rooster'));
        break;
      case 'roosterTap': {
        stats.roosterTaps++;
        FP.Audio.play('crow');
        render.burst('feathers', e.x, e.y + 20, { n: 4 });
        const now = performance.now();
        if (now - lastPopSay > 2000 && canInterrupt()) { lastPopSay = now; speak(T('rooster.tap'), { interrupt: true }); }
        break;
      }
      case 'fireflies':
        stats.surprises++; FP.Audio.play('twinkle');
        if (canInterrupt()) speak(T('surprise.fireflies'));
        break;
      case 'fireflyTap': {
        stats.fireflyTaps++;
        FP.Audio.play('twinkle');
        render.burst('sparkles', e.x, e.y, { n: 8, color: '#E9F59A' });
        const now = performance.now();
        if (now - lastPopSay > 2000 && canInterrupt()) { lastPopSay = now; speak(T('firefly.tap'), { interrupt: true }); }
        break;
      }
      case 'talk': flushStars(); FP.UI.fadeBubble(false); FP.UI.say(''); FP.Audio.setFanfare(false); FP.UI.setDots(world.roundsPerLevel || 4, world.roundsPerLevel || 4); openTalk(e.talk || world.talk); break;
      case 'talkAsk': {   // no answer yet: ask again, and from the 2nd re-ask glow the right answer
        const tk = e.talk || world.talk;
        if (tk && e.n <= 3) speak(T(tk.promptKey, tk.params || {}), { priority: true, interrupt: true });
        if (tk && (e.n >= 2 || e.glowAnswer)) FP.UI.glowTalk(tk.answerId || tk.answer);
        break;
      }
      case 'talkResult': {
        stats.talks++; if (e.correct) stats.talkRight++;
        FP.UI.markTalk(e.choiceId, e.answerId);
        const tk = world.talk, ans = (tk && tk.choices.find(c => c.id === e.answerId)) || {};
        const kind = () => (FP.I18N.talkWrong ? FP.I18N.talkWrong(curLang(), ans, tk) : T('talk.wrong.any'));
        if (e.auto) { speak(kind(), { interrupt: true }); break; }
        if (e.correct) {
          FP.Audio.play('talkRight');
          render.burst('star', view.W / 2, view.H / 2, { onDone: () => { shownStars++; FP.UI.setStars(shownStars, true); FP.Audio.play('star'); } });
          speak(T('talk.right'), { interrupt: true });
        } else {
          FP.Audio.play('soft');
          speak(kind(), { interrupt: true });
        }
        break;
      }
      case 'levelDone':
        flushStars();
        FP.Audio.play('level'); FP.UI.say('');
        if (mode === 'talk') { mode = 'play'; FP.UI.only(); }
        $('stage').classList.remove('talking');
        speak(T('great'));
        break;
      case 'sessionDone': {
        FP.Audio.play('party'); FP.Audio.setFanfare(false);
        if (weather.setParty) weather.setParty(true);
        render.setGallery(pickGallery());
        render.burst('confetti', 0, 0);
        progress.totalStars += e.stars || 0; progress.sessions++;
        FP.Storage.setJSON('progress', progress);
        shownStars = e.stars || shownStars; FP.UI.setStars(shownStars);
        $('doneStars').textContent = e.stars || 0;
        $('doneTitle').textContent = T('session.done', { stars: e.stars || 0 });
        speak(T('party'), { interrupt: true });
        speak(T('session.done', { stars: e.stars || 0 }));
        mode = 'done';
        FP.UI.only('scrDone'); FP.UI.show('hud', false); FP.UI.say('');
        if (autoRestart) setTimeout(() => { if (mode === 'done') startGame(); }, 1500 / speed);
        break;
      }
    }
  }
  /** the done parade: one of each kind of friend met this session (animals first), up to 8 */
  function pickGallery() {
    const seen = new Set(), out = [];
    const key = t => t.kind + ':' + (t.animal || t.obj || t.shape || t.n || t.text || '') + ':' + (t.color || '');
    const list = sessionThings.slice().sort((a, b) => (b.kind === 'animal') - (a.kind === 'animal'));
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
    const canMic = S.mic && FP.Voice && FP.Voice.canListen && FP.Voice.canListen() && !FLAGS.bot;
    FP.UI.openTalk(talk, curLang(), id => { FP.Audio.play('click'); world.talkAnswer(id); }, canMic, curAge());
    const q = T(talk.promptKey, talk.params || {});
    speakPrompt(T('talk.intro') + ' ' + q, { priority: true });   // queued after the round's praise, not cutting it off
  }
  function listen() {
    const talk = world.talk;
    if (!talk || world.state !== 'talk' || !FP.Voice || !FP.Voice.canListen()) return;
    if (FP.Voice.stop) FP.Voice.stop();
    FP.Audio.play('listen');
    FP.UI.setListening(true, T('ui.listening'));
    const choices = talk.choices.map(c => ({ id: c.id, words: FP.I18N.choiceWords ? FP.I18N.choiceWords(curLang(), c) : [] }));
    FP.Voice.listen({ lang: curLang(), choices, timeoutMs: 6000 }).then(res => {
      FP.UI.setListening(false, T('ui.tapOrSay'));
      if (world.state !== 'talk') return;
      if (res && res.id != null) world.talkAnswer(res.id);
      else if (res && res.reason === 'not-allowed') { $('btnMic').classList.add('hidden'); speak(T('ui.micDenied')); }
      else speak(T('ui.tapOrSay'));
    }).catch(() => FP.UI.setListening(false, T('ui.tapOrSay')));
  }

  let boxCache = null, boxT = 0;
  function domBoxes() {   // the title's ▶ and star pill in logical px (the title parade keeps clear of them)
    const now = performance.now();
    if (boxCache && now - boxT < 500 && boxCache.mode === mode) return boxCache;
    boxT = now;
    const conv = el => { if (!el) return null; const r = el.getBoundingClientRect(); if (!r.width) return null; return { x: (r.left - view.left) / view.s, y: (r.top - view.top) / view.s, w: r.width / view.s, h: r.height / view.s }; };
    boxCache = { mode, title: mode === 'title' ? [conv($('btnPlay')), conv(document.querySelector('.title-info'))].filter(Boolean) : null };
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
    FP.Audio.duck(sp);
    if (FP.Audio.tick) FP.Audio.tick(dt);
    render.draw(world, weather, { boxes: domBoxes(), dt: dt * Math.min(speed, 4), lang: curLang(), title: mode === 'title' || mode === 'loading', speaking: sp, done: mode === 'done', debug: FLAGS.debug });
    adapt(raw);
  }
  function adapt(raw) {  // adaptive quality: step the render scale down when frames stay slow
    if (raw > 0.5) return;
    if (raw > 0.022) { slowAcc += raw; stats.slowFrames++; } else slowAcc = Math.max(0, slowAcc - raw * 0.5);
    // only the backing store shrinks: World.setViewport would cancel the child's gesture
    if (slowAcc > 1.5 && quality > 0.6) { quality *= 0.85; render.quality = Math.max(0.5, quality); slowAcc = 0; pendingResize = true; }
  }

  /* ---------- input ---------- */
  function toLogical(cx, cy) { return { x: (cx - view.left) / view.s, y: (cy - view.top) / view.s }; }
  function repeatPrompt() {
    // only while the question can still be answered (never in enter / hop: that would cut the right line / the count run)
    if (!world.interactive || !lastAsk) return;
    FP.Audio.play('click');
    boMood('talk', 1.0);
    const cp = currentPrompt(); promptUntil = 0; FP.UI.say(cp); speakPrompt(cp, { interrupt: true });
  }
  function bubbleTap() {
    const a = world.answer ? world.answer() : null;
    if (a && a.door) { if (!speaking()) { const g = T('gateShort'); FP.UI.say(g); speak(g, { interrupt: true }); } if (world.hint) world.hint(); return; }
    if (world.interactive) repeatPrompt();
  }

  function bindUI() {
    FP.Input.kidProof();
    // Input passes two NUMBERS in logical px (never a point object) — VOICE §4
    inputCancel = FP.Input.attach($('game'), {
      toLogical,
      down: (x, y) => { if (mode === 'play' && !bot && performance.now() >= inputBlockUntil) world.pointerDown(x, y); },   // judged at once
      move: (x, y) => { if (mode === 'play' && !bot) world.pointerMove(x, y); },   // a flick onto a member within 0.25 s
      up: (x, y) => { if (mode === 'play' && !bot) world.pointerUp(x, y); },
      cancel: () => { if (world.cancelDrag) world.cancelDrag(); }
    });
    const unlock = () => { FP.Audio.unlock(); if (FP.Voice) FP.Voice.unlock(); };
    ['touchend', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { capture: true, passive: true }));

    $('btnPlay').addEventListener('click', () => { FP.Audio.play('click'); startGame(); });
    $('bubble').addEventListener('click', bubbleTap);
    $('btnPause').addEventListener('click', () => { FP.Audio.play('click'); pause(); });
    $('btnResume').addEventListener('click', () => { FP.Audio.play('click'); resume(); });
    $('btnHome').addEventListener('click', () => { FP.Audio.play('click'); goTitle(); });
    $('btnAgain').addEventListener('click', () => { FP.Audio.play('click'); startGame(); });
    $('btnDoneHome').addEventListener('click', () => { FP.Audio.play('click'); goTitle(); });
    $('btnMic').addEventListener('click', listen);
    // volume: settings slider + big − / + in the pause menu
    $('optVolume').addEventListener('input', () => { S.volume = +$('optVolume').value / 100; saveSettings(); applyAudio(); });
    $('optVolume').addEventListener('change', () => FP.Audio.play('pop'));
    const vstep = d => { S.volume = Math.max(0, Math.min(1, Math.round(((S.volume == null ? 1 : S.volume) + d) * 20) / 20)); saveSettings(); applyAudio(); FP.Audio.play('pop'); };
    $('btnVolDown').addEventListener('click', () => vstep(-0.1));
    $('btnVolUp').addEventListener('click', () => vstep(0.1));
    document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => {
      S.lang = b.dataset.lang; langOverride = null; saveSettings(); FP.UI.applyLang(curLang()); applyAudio(); FP.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
      updateVoiceInfo();
      FP.Audio.play('click');
      if (mode === 'title') speak(T('ui.welcome'), { interrupt: true });
    }));
    // parent gate: hold the gear for 2 s
    const gear = $('btnParents');
    FP.Input.holdButton(gear, 2000, () => { gear.style.setProperty('--p', 0); openSettings(); },
      p => { gear.style.setProperty('--p', p); gear.classList.toggle('holding', p > 0); });
    gear.addEventListener('click', () => { gear.classList.add('tip'); setTimeout(() => gear.classList.remove('tip'), 1600); });
    FP.UI.bindSettings(S, k => {
      saveSettings();
      if (k === 'sfx' || k === 'music' || k === 'voice') applyAudio();
      if (k === 'age') { ageOverride = null; FP.UI.setTitleInfo(progress.totalStars, curAge(), curLang()); }
      if (k === 'name' && FP.I18N.setChild) FP.I18N.setChild(S.name);
    }, curAge);
    $('btnSettingsDone').addEventListener('click', () => { FP.Audio.play('click'); FP.UI.only('scrTitle'); FP.UI.setTitleInfo(progress.totalStars, curAge(), curLang()); });

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(applySize, 250));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (inputCancel && inputCancel.cancel) inputCancel.cancel(); if (world.cancelDrag) world.cancelDrag(); pause(); FP.Audio.suspend(); if (FP.Voice) FP.Voice.stop(); }
      else FP.Audio.resume();
    });
    window.addEventListener('blur', () => { if (world && world.cancelDrag) world.cancelDrag(); });
  }
  function openSettings() {
    FP.Audio.play('click');
    FP.UI.refreshSettings();
    updateVoiceInfo();
    FP.UI.only('scrSettings');
  }
  function updateVoiceInfo() {
    if (!FP.Voice) return;
    const has = FP.Voice.hasVoice ? FP.Voice.hasVoice(curLang()) : false;
    const nm = FP.Voice.voiceName ? FP.Voice.voiceName(curLang()) : '';
    const mic = FP.Voice.canListen && FP.Voice.canListen();
    const v = has ? (curLang() === 'vi' ? 'Giọng đọc: ' : 'Voice: ') + (nm || '✓') : T('ui.voiceMissing');
    const m = mic ? '' : ' · ' + T('ui.micUnsupported');
    FP.UI.setVoiceInfo(v + m);
  }

  /* ---------- test hooks (DESIGN §5.5) — live getters via defineProperties (never Object.assign) ---------- */
  function hooks() {
    const circ = c => (c ? { x: view.left + c.x * view.s, y: view.top + c.y * view.s, r: (c.r || 0) * view.s } : null);
    const box = b => (b ? { x: view.left + b.x * view.s, y: view.top + b.y * view.s, w: (b.w || 0) * view.s, h: (b.h || 0) * view.s,
      cx: view.left + (b.cx != null ? b.cx : b.x + b.w / 2) * view.s, cy: view.top + (b.cy != null ? b.cy : b.y + b.h / 2) * view.s } : null);
    const prev = FP.debug || {};
    FP.debug = prev;
    Object.defineProperties(prev, Object.getOwnPropertyDescriptors({
      get world() { return world; }, get weather() { return weather; }, get mode() { return mode; }, stats, events: eventLog,
      get bot() { return bot; },
      get voiceLog() { return (FP.Voice && FP.Voice.log) || []; },
      getState() {
        return { mode, state: world.state, phase: world.phase, level: world.level, topic: world.topic, round: world.round,
          stars: world.stars, misses: world.misses, door: +(world.barn.door || 0).toFixed(2),
          members: (world.members || []).map(m => ({ id: m.id, state: m.state, odd: m.odd, kind: m.thing && m.thing.kind })),
          surprise: world.surprise, weather: weather.ambient && weather.ambient.mood, W: view.W, H: view.H, ins: view.ins, settings: Object.assign({}, S), speed };
      },
      setSpeed(n) { speed = Math.max(0.1, +n || 1); applyAudio(); },
      startGame, goTitle,
      setBot(on, skill) { bot = on ? new FP.Bot(world, { skill: skill == null ? FLAGS.botSkill : skill, seed: 7 }) : null; },
      setAutoRestart(on) { autoRestart = !!on; },
      gotoLevel(i) { world.startLevel(i); },
      view: () => view, render: () => render,
      memberScreen(id) { return circ(world.memberHit ? world.memberHit(id) : null); },
      doorScreen() { return box(world.doorHit ? world.doorHit() : null); },
      boScreen() { return box(world.boHit ? world.boHit() : null); },
      chickScreen() { return circ(world.chickHit ? world.chickHit() : null); },
      roosterScreen() { return circ(world.roosterHit ? world.roosterHit() : null); },
      fireflyScreen() { return circ(world.fireflyHit ? world.fireflyHit() : null); },
      answer() { return world.answer ? world.answer() : null; },
      toScreen(x, y) { return { x: view.left + x * view.s, y: view.top + y * view.s }; },
      audio: () => FP.Audio
    }));
  }

  /* ---------- boot ---------- */
  async function boot() {
    await FP.Storage.init();
    S = Object.assign({}, DEF, FP.Storage.getJSON('settings', {}));
    Object.assign(progress, FP.Storage.getJSON('progress', {}));
    FP.UI.applyLang(curLang());
    if (FP.I18N && FP.I18N.setChild) FP.I18N.setChild(S.name);
    if (FP.Voice) { FP.Voice.init({ lang: curLang(), enabled: voiceOn(), speed }); const prevStart = FP.Voice.onStart; FP.Voice.onStart = d => { onVoiceStart(d); if (prevStart) prevStart(d); }; }
    render = new FP.Renderer($('game')); FP.render = render;
    world = new FP.World({ seed: FLAGS.seed != null ? FLAGS.seed : (Date.now() & 0x7fffffff), age: curAge(), lang: curLang() });
    weather = new FP.Weather({ width: 960, height: 720, seed: 11 });
    hooks();
    bindUI();
    applySize();
    weather.setWeather(0, { instant: true });
    await FP.Assets.load();
    render.prewarm(world.layout, 0);
    applyAudio();
    if (FLAGS.bot) bot = new FP.Bot(world, { skill: FLAGS.botSkill, seed: 7 });
    FP.UI.only('scrTitle');
    FP.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
    mode = 'title';
    requestAnimationFrame(frame);
    if (FLAGS.autostart) startGame();
    if (FP.Voice && FP.Voice.onVoicesChanged) FP.Voice.onVoicesChanged(updateVoiceInfo);
  }
  window.addEventListener('DOMContentLoaded', () => boot().catch(e => { console.error(e); }));
})(window.FP = window.FP || {});
