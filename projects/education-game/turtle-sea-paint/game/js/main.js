/* SP main (Nini's Sea Painting) — boots the game, sizes the canvas for any phone/tablet shape, runs the loop and turns
 * world events (pick a paint shell, tap a part, the colour spreads, the picture comes alive) into voice, sound, effects
 * and UI (docs/VOICE.md §1.2). Taps reach the world only through SP.Input (HUD / menus never reach the canvas). */
(function (SP) {
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
  const T1 = (key, p) => (SP.I18N ? SP.I18N.t(curLang(), key, Object.assign({ child: S.name || '' }, p || {})) : key);
  // never the same wording twice in a row: re-roll a variant that repeats the line just spoken
  const T = (key, p) => { let r = T1(key, p); for (let k = 0; k < 3 && r && r === lastSpoken; k++) r = T1(key, p); return r; };

  /* ---------- settings (URL flags never saved) ---------- */
  const DEF = { age: 4, lang: (navigator.language || 'en').toLowerCase().startsWith('vi') ? 'vi' : 'en', name: '', sfx: true, music: true, voice: true, mic: true, volume: 1 };
  let S = Object.assign({}, DEF);
  let langOverride = FLAGS.lang === 'vi' || FLAGS.lang === 'en' ? FLAGS.lang : null;   // URL ?lang= is session-only
  const curLang = () => langOverride || S.lang;
  let ageOverride = FLAGS.age || null;           // URL ?age= is session-only; a parent's pick wins
  const curAge = () => ageOverride || S.age;
  const saveSettings = () => SP.Storage.setJSON('settings', S);
  const progress = { totalStars: 0, sessions: 0 };

  let world, weather, render, bot = null, inputCancel = null;
  let mode = 'loading';            // loading | title | play | paused | talk | done
  let speed = FLAGS.speed, autoRestart = FLAGS.autorestart;
  let view = { W: 960, H: 720, s: 1, left: 0, top: 0, ins: { top: 0, right: 0, bottom: 0, left: 0 } };
  const stats = { sessions: 0, rounds: 0, correct: 0, wrong: 0, picks: 0, pictures: 0, talks: 0, talkRight: 0, hints: 0, frames: 0, slowFrames: 0 };
  let surpriseLine = '', promptUntil = 0, lastWrongSay = -1e9, idleSaid = 0, shownStars = 0, lastRoundEvt = null, lastPraise = -1e9, lastSoftSay = -1e9, finishSaid = false;   // -1e9: a line in the first 2.5 s after page load is not rate-limited

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
    world.setViewport(view.W, view.H, view.ins);    // picture, shells and brush snap to the new layout; fills keep progress
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
    SP.UI.placeBubble(r);
  }
  function updateHudStarTarget() {
    const p = SP.UI.hudStarPoint();
    if (p.x || p.y) render.hudStar = { x: (p.x - view.left) / view.s, y: (p.y - view.top) / view.s };
  }
  let resizeT = 0;
  function onResize() { clearTimeout(resizeT); resizeT = setTimeout(applySize, 120); }

  /* ---------- voice ---------- */
  const voiceOn = () => S.voice && !FLAGS.novoice && speed <= 1.01 && !FLAGS.mute;
  function speak(text, opt) {
    if (!text) return null;
    lastSpoken = text;
    return SP.Voice ? SP.Voice.say(text, opt || {}) : null;
  }
  function applyAudio() {
    SP.Audio.setOptions({ sfx: S.sfx, music: S.music, muted: FLAGS.mute, volume: S.volume == null ? 1 : S.volume });
    if (SP.Voice) { SP.Voice.setLang(curLang()); SP.Voice.setEnabled(voiceOn()); if (SP.Voice.setVolume) SP.Voice.setVolume(S.volume == null ? 1 : S.volume); }
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
    // the line ended (or was dropped / failed / interrupted) without ever starting: lift the guard so a Nini tap repeats it
    if (p && p.then) p.then(() => { if (pendingPrompt === txt) { pendingPrompt = null; promptUntil = Math.min(promptUntil, performance.now() + 300); } }, () => {});
    if (!voiceOn()) { pendingPrompt = null; promptUntil = performance.now() + 300 + 72 * (txt || '').length; }
  }
  function onVoiceStart(display) {
    if (pendingPrompt && display === pendingPrompt) { promptStart = performance.now(); promptUntil = promptStart + 300 + 72 * display.length; pendingPrompt = null; }
  }
  const canInterrupt = () => performance.now() > promptUntil;
  /** feedback lines (pick / wrong / needPaint / paint) may interrupt — but never the prompt while it is protected */
  const feedback = (txt) => speak(txt, { interrupt: canInterrupt() });

  /* ---------- game flow ---------- */
  function startGame() {
    SP.Audio.unlock();
    world.setAge(curAge()); world.setLang(curLang());
    world.lastTopics = SP.Storage.getJSON('lastTopics', null);   // chapters rotate between sessions
    world.newSession({ lastTopics: world.lastTopics });
    if (world.levels) SP.Storage.setJSON('lastTopics', world.levels);
    if (FLAGS.level != null) world.startLevel(Math.max(0, Math.min(3, FLAGS.level | 0)));
    shownStars = 0; SP.UI.setStars(0); lastAsk = null; lastPromptText = ''; surpriseLine = ''; finishSaid = false;
    render.clearGallery();
    if (weather.setParty) weather.setParty(false);
    mode = 'play';
    $('stage').classList.remove('talking');
    SP.UI.only(); SP.UI.show('hud'); SP.UI.say('');
    SP.Audio.setMood(world.level || 0); SP.Audio.startMusic();
    applyAudio();
    stats.sessions++;
    requestAnimationFrame(() => { updateHudStarTarget(); applySize(); });
  }
  function goTitle() {
    mode = 'title';
    $('stage').classList.remove('talking');
    if (SP.Voice) SP.Voice.stop();
    SP.Audio.stopMusic();
    SP.UI.only('scrTitle'); SP.UI.show('hud', false); SP.UI.say('');
    SP.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
    weather.setWeather(0, {}); if (weather.setParty) weather.setParty(false);
  }
  function pause() {
    if (mode !== 'play' && mode !== 'talk') return;
    mode = 'paused';
    if (inputCancel && inputCancel.cancel) inputCancel.cancel();
    if (world.cancelDrag) world.cancelDrag();
    if (SP.Voice) { SP.Voice.stop(); if (SP.Voice.stopListening) SP.Voice.stopListening(); }
    SP.Audio.stopMusic();
    SP.UI.only('scrPause');
  }
  function resume() {
    if (mode !== 'paused') return;
    mode = world.state === 'talk' ? 'talk' : 'play';
    idleSaid = 0;   // a returning child gets the nudges again before the next auto-pause
    if (world.resetNudges) world.resetNudges();
    SP.UI.only(mode === 'talk' ? 'scrTalk' : undefined);
    SP.Audio.startMusic();
    // say the question again so a returning child knows what to do
    if (mode === 'talk' && world.talk) speak(T(world.talk.promptKey, world.talk.params || {}), { priority: true });
    else if (world.state === 'round' && world.phase === 'paint') setTimeout(repeatPrompt, 300);
  }

  let lastPromptText = '';
  function currentPrompt() {   // prompts have several wordings: repeat the one Nini said, word for word
    if (lastPromptText) return lastPromptText;
    const p = world.prompt ? world.prompt() : null;
    return p ? T(p.promptKey, p.params || {}) : '';
  }
  function handleEvents() {
    const evs = world.drainEvents();
    for (const e of evs) onEvent(e);
  }
  let lastAsk = null;
  const partOf = id => (world.picture && world.picture.parts.find(p => p.id === id)) || null;
  const step = () => world.stepInfo || (world.cur && world.cur.steps && world.cur.steps[Math.max(0, world.step)]) || null;
  // the event + what main knows: the picture part, the chapter topic and the step's params (for "2 + 3 is five!")
  function ev2(e) {
    const s = step();
    return Object.assign({ topic: world.topic, params: s ? s.params : (lastAsk && lastAsk.params) }, e, { part: e.part || partOf(e.partId) || undefined });
  }
  function line(fn, e, fallbackKey) {
    const I = SP.I18N;
    if (I && typeof I[fn] === 'function') { try { const t = I[fn](curLang(), e); if (t) return t; } catch (err) { /* fall back */ } }
    return fallbackKey ? T(fallbackKey) : '';
  }
  // the alive line names the finished picture ("Bye-bye, crab!") — the template comes from the world's current round
  const aliveArg = e => ({ kind: e.kind, templateId: e.templateId || (world.cur && world.cur.templateId) || (lastRoundEvt && lastRoundEvt.templateId) });
  function countWord(i) {
    const I = SP.I18N;
    if (I && typeof I.sayCount === 'function') { try { const t = I.sayCount(curLang(), i); if (t) return t; } catch (err) { /* fall back */ } }
    return String(i) + '!';
  }
  function niniMood(m, t) { if (world.nini) { world.nini.mood = m; world.nini.moodT = t; } }
  const wait = ms => ms / Math.max(0.25, speed);

  function onEvent(e) {
    switch (e.type) {
      case 'level':
        weather.setWeather(e.weather != null ? e.weather : e.level % 4, {});
        SP.Audio.setMood(e.weather != null ? e.weather : e.level); SP.Audio.play('chapter');
        SP.UI.setDots(world.roundsPerLevel || 4, 0);
        speak(T('ui.chapter', { n: e.level + 1 }) + '. ' + T('topic.' + e.topic), { interrupt: true });
        speak(T('weather.' + ((e.weather != null ? e.weather : e.level) % 4)));   // "Spring petals!" — queued after the chapter name
        SP.UI.say(T('topic.' + e.topic));
        render.prewarm(world.layout, e.weather != null ? e.weather : e.level);
        break;
      case 'round': {
        SP.UI.fadeBubble(false);
        lastRoundEvt = e; stats.rounds++; idleSaid = 0; lastAsk = null; lastPromptText = ''; finishSaid = false;
        SP.UI.setDots(world.roundsPerLevel || 4, e.round % (world.roundsPerLevel || 4));
        surpriseLine = e.surprise === 'pearl' ? T('surprise.pearl') : '';   // the fishy is announced when it swims in
        SP.UI.say(T('enter'));   // shown, not spoken: the prompt follows in a second
        break;
      }
      case 'bubbles': SP.Audio.play('bubbles', { n: 3 }); if (weather.addBubbles) weather.addBubbles(e.x, e.y, e.n || 6); break;
      case 'shellPop': SP.Audio.play('shellPop'); break;
      case 'pearl': break;
      case 'ask': {
        lastAsk = e; idleSaid = 0;
        const txt = T(e.promptKey, e.params || {});
        lastPromptText = txt;
        SP.UI.say(txt); speakPrompt(txt, { priority: true });
        if (surpriseLine && e.first) { speak(surpriseLine); surpriseLine = ''; }   // queued after the prompt
        break;
      }
      case 'pick': {
        stats.picks++;
        SP.Audio.play('plip', { color: e.color });
        if (!e.again) { feedback(line('sayPick', ev2(e))); promptUntil = 0; }
        break;
      }
      case 'whoosh': SP.Audio.play('whoosh'); break;
      case 'dip': SP.Audio.play('dip', { color: e.color }); if (weather.addSplash) weather.addSplash(e.x, e.y, e.color, 4); break;
      case 'wrong': {
        stats.wrong++;
        SP.Audio.play('boing');
        render.burst('ring', e.x, e.y, { size: 110 });
        const now = performance.now();
        if (now - lastWrongSay > 1500) { lastWrongSay = now; feedback(line('sayWrong', ev2(e), 'hint')); }
        break;
      }
      case 'needPaint': {
        SP.Audio.play('soft');
        const now = performance.now(), s = step();
        if (now - lastSoftSay > 2500) { lastSoftSay = now; feedback(line('sayNeedPaint', ev2({ color: e.color || (s && s.color) }), 'hint')); }
        break;
      }
      case 'notThis': {
        SP.Audio.play('soft');
        const now = performance.now(), s = step();
        if (now - lastSoftSay > 2500 && s) { lastSoftSay = now; feedback(line('sayNotThis', ev2({ target: { nameKind: s.nameKind, nameValue: s.nameValue } }), 'hint')); }
        break;
      }
      case 'already': {
        SP.Audio.play('soft');
        const now = performance.now();
        if (now - lastSoftSay > 2500 && canInterrupt()) { lastSoftSay = now; speak(T('already')); }
        break;
      }
      case 'paint': {
        stats.correct++;
        promptUntil = 0; pendingPrompt = null;
        SP.Audio.play('splotch', { color: e.color, fill: (SP.CONFIG && SP.CONFIG.fillTime) || 0.7 });
        if (weather.addSplash) weather.addSplash(e.x, e.y, e.hex || e.color, 10);
        if (e.count) {   // the count word: queued, never interrupting, so a fast child hears the newest numbers
          SP.Audio.play('count', { i: e.count.i });
          render.burst('count', e.x, e.y - 50, { n: e.count.i });
          speak(countWord(e.count.i));
          promptUntil = performance.now() + 700;
        } else speak(line('sayPaint', ev2(e)), { interrupt: true });
        break;
      }
      case 'filled': SP.Audio.play('filled', { color: e.color }); if (!e.sweep) render.burst('sparkles', e.x, e.y, { n: 6, color: e.color }); break;
      case 'stepDone': if (!e.last) SP.Audio.play('stepDone'); break;
      case 'hint': {
        stats.hints++;
        SP.Audio.play('hint');
        niniMood('point', 1.6);
        if (!e.idle) speak(T('hint'));   // queued: the feedback line goes first
        break;
      }
      case 'assist': SP.Audio.play('hint'); break;
      case 'idle':
        if (++idleSaid <= 4) speak(T('idle') + ' ' + currentPrompt());   // then stay quiet: maybe nobody is there
        else if (idleSaid >= 5 && !bot) pause();   // ≈ 2 min without a touch: nobody is playing — pause
        break;
      case 'pokeNini': {
        const since = performance.now() - promptStart;
        const stuck = pendingPrompt && since > 6000;   // the prompt never started (no voice / dropped): don't wait forever
        if (since > 3000 && (!pendingPrompt || stuck)) repeatPrompt();
        else if (world.nini && world.nini.mood === 'talk') niniMood('idle', 0);   // no line follows: no silent mouth flaps
        break;
      }
      case 'soft': SP.Audio.play('pat'); break;   // a long press / drag: a gentle pat, no words
      case 'fishy':
        SP.Audio.play('fishy');
        if (canInterrupt()) speak(T('surprise.fishy'));
        break;
      case 'fishyTap':
        SP.Audio.play('giggle');
        if (weather.burst) weather.burst(e.x, e.y, { kind: 'dots', n: 14 });
        render.burst('sparkles', e.x, e.y, { n: 8 });
        speak(T('fishy.tap'), { interrupt: canInterrupt() });
        break;
      case 'pearlTap':
        SP.Audio.play('creak'); SP.Audio.play('chime');
        render.burst('sparkles', e.x, e.y - 20, { n: 12, color: '#FFF4C8' });
        if ((e.taps || 1) <= 2) speak(T('pearl.tap'), { interrupt: canInterrupt() });
        break;
      case 'finish':
        SP.Audio.play('finish');
        // shown, not spoken: the sweep says it visually and the alive line stays in sync (playtest P1-1)
        if (!finishSaid) { finishSaid = true; SP.UI.say(T('finish')); }
        break;
      case 'sweep': SP.Audio.play('sweep', { i: e.i || 0 }); break;
      case 'alive': {
        stats.pictures++;
        SP.Audio.play('alive');
        render.keepPicture(world.picture, world.st);
        if (weather.addBubbles) weather.addBubbles(e.x, e.y, 8);
        const al = line('sayAlive', aliveArg(e)) || T('praise');
        SP.UI.say(al); speak(al);
        SP.UI.fadeBubble(true);   // the picture rises / swims through the bubble's corner: let it show (visual P2-1)
        break;
      }
      case 'hop': SP.Audio.play('hop'); break;
      case 'roundDone': {
        const n = e.stars || 1, fx = view.W / 2, fy = view.H * 0.45;
        for (let i = 0; i < n; i++) {
          render.burst('star', fx + (i - (n - 1) / 2) * 60, fy, { delay: 0.1 + i * 0.22, onDone: () => { shownStars++; SP.UI.setStars(shownStars, true); SP.Audio.play('star', { i }); } });
        }
        SP.UI.setDots(world.roundsPerLevel || 4, ((e.round != null ? e.round : world.round) % (world.roundsPerLevel || 4)) + 1);
        const now = performance.now();
        if (now - lastPraise > 1200) { lastPraise = now; speak(T(e.stars >= 3 ? 'great' : 'praise')); }   // queued
        break;
      }
      case 'talk': SP.UI.fadeBubble(false); SP.UI.say(''); SP.UI.setDots(world.roundsPerLevel || 4, world.roundsPerLevel || 4); openTalk(e.talk || world.talk); break;
      case 'talkAsk': {   // no answer yet: ask again, and from the 2nd re-ask glow the right answer
        const tk = e.talk || world.talk;
        if (tk && e.n <= 3) speak(T(tk.promptKey, tk.params || {}), { priority: true });
        if (tk && (e.n >= 2 || e.glowAnswer)) SP.UI.glowTalk(tk.answerId || tk.answer);
        break;
      }
      case 'talkResult': {
        stats.talks++; if (e.correct) stats.talkRight++;
        SP.UI.markTalk(e.choiceId, e.answerId);
        const ans = (world.talk && world.talk.choices.find(c => c.id === e.answerId)) || {};
        if (e.correct) {
          SP.Audio.play('talkRight');
          render.burst('star', view.W / 2, view.H / 2, { onDone: () => { shownStars++; SP.UI.setStars(shownStars, true); SP.Audio.play('star'); } });
          speak(T('talk.right'), { interrupt: true });
        } else {
          SP.Audio.play('soft');
          speak(SP.I18N.talkWrong ? SP.I18N.talkWrong(curLang(), ans.thing || ans) : T('talk.wrong.any'), { interrupt: true });
        }
        break;
      }
      case 'levelDone':
        SP.Audio.play('level'); SP.UI.say('');
        if (mode === 'talk') { mode = 'play'; SP.UI.only(); }
        $('stage').classList.remove('talking');
        break;
      case 'sessionDone': {
        SP.Audio.play('fanfare');
        if (weather.setParty) weather.setParty(true);
        render.burst('confetti', 0, 0);
        progress.totalStars += e.stars || 0; progress.sessions++;
        SP.Storage.setJSON('progress', progress);
        shownStars = e.stars || shownStars; SP.UI.setStars(shownStars);
        $('doneStars').textContent = e.stars || 0;
        $('doneTitle').textContent = T('session.done', { stars: e.stars || 0 });
        speak(T('party'), { interrupt: true });
        speak(T('session.done', { stars: e.stars || 0 }));
        mode = 'done';
        SP.UI.only('scrDone'); SP.UI.show('hud', false); SP.UI.say('');
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
    const canMic = S.mic && SP.Voice && SP.Voice.canListen && SP.Voice.canListen() && !FLAGS.bot;
    SP.UI.openTalk(talk, curLang(), id => { SP.Audio.play('click'); world.talkAnswer(id); }, canMic, curAge());
    const q = T(talk.promptKey, talk.params || {});
    speakPrompt(T('talk.intro') + ' ' + q, { priority: true });   // queued after the round's praise, not cutting it off
  }
  function listen() {
    const talk = world.talk;
    if (!talk || world.state !== 'talk' || !SP.Voice || !SP.Voice.canListen()) return;
    if (SP.Voice.stop) SP.Voice.stop();
    SP.Audio.play('listen');
    SP.UI.setListening(true, T('ui.listening'));
    const choices = talk.choices.map(c => ({ id: c.id, words: SP.I18N.choiceWords ? SP.I18N.choiceWords(curLang(), c) : [] }));
    SP.Voice.listen({ lang: curLang(), choices, timeoutMs: 6000 }).then(res => {
      SP.UI.setListening(false, T('ui.tapOrSay'));
      if (world.state !== 'talk') return;
      if (res && res.id != null) world.talkAnswer(res.id);
      else if (res && res.reason === 'not-allowed') { $('btnMic').classList.add('hidden'); speak(T('ui.micDenied')); }
      else speak(T('ui.tapOrSay'));
    }).catch(() => SP.UI.setListening(false, T('ui.tapOrSay')));
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
    const speaking = SP.Voice && SP.Voice.isSpeaking ? SP.Voice.isSpeaking() : false;
    SP.Audio.duck(speaking);
    if (SP.Audio.tick) SP.Audio.tick(dt);
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
    SP.Audio.play('click');
    niniMood('talk', 1.0);
    if (!lastAsk && !(world.prompt && world.prompt())) return;
    const cp = currentPrompt(); promptUntil = 0; speakPrompt(cp, { interrupt: true });
  }

  function bindUI() {
    SP.Input.kidProof();
    inputCancel = SP.Input.attach($('game'), {
      toLogical,
      down: (x, y) => { if (mode === 'play' && !bot) world.pointerDown(x, y); },   // the fishy and the clam react on the press
      move: (x, y) => { if (mode === 'play' && !bot) world.pointerMove(x, y); },
      up: (x, y) => { if (mode === 'play' && !bot) world.pointerUp(x, y); },      // a tap: shell, part, Nini (repeat)
      cancel: () => { if (world.cancelDrag) world.cancelDrag(); }
    });
    const unlock = () => { SP.Audio.unlock(); if (SP.Voice) SP.Voice.unlock(); };
    ['touchend', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { capture: true, passive: true }));

    $('btnPlay').addEventListener('click', () => { SP.Audio.play('click'); startGame(); });
    $('bubble').addEventListener('click', repeatPrompt);
    $('btnPause').addEventListener('click', () => { SP.Audio.play('click'); pause(); });
    $('btnResume').addEventListener('click', () => { SP.Audio.play('click'); resume(); });
    $('btnHome').addEventListener('click', () => { SP.Audio.play('click'); goTitle(); });
    $('btnAgain').addEventListener('click', () => { SP.Audio.play('click'); startGame(); });
    $('btnDoneHome').addEventListener('click', () => { SP.Audio.play('click'); goTitle(); });
    $('btnMic').addEventListener('click', listen);
    // volume: settings slider + big − / + in the pause menu
    $('optVolume').addEventListener('input', () => { S.volume = +$('optVolume').value / 100; saveSettings(); applyAudio(); });
    $('optVolume').addEventListener('change', () => SP.Audio.play('pop'));
    const vstep = d => { S.volume = Math.max(0, Math.min(1, Math.round(((S.volume == null ? 1 : S.volume) + d) * 20) / 20)); saveSettings(); applyAudio(); SP.Audio.play('pop'); };
    $('btnVolDown').addEventListener('click', () => vstep(-0.1));
    $('btnVolUp').addEventListener('click', () => vstep(0.1));
    document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => {
      S.lang = b.dataset.lang; langOverride = null; saveSettings(); SP.UI.applyLang(curLang()); applyAudio(); SP.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
      updateVoiceInfo();
      SP.Audio.play('click');
      if (mode === 'title') speak(T('ui.welcome'), { interrupt: true });
    }));
    // parent gate: hold the gear for 2 s
    const gear = $('btnParents');
    SP.Input.holdButton(gear, 2000, () => { gear.style.setProperty('--p', 0); openSettings(); },
      p => { gear.style.setProperty('--p', p); gear.classList.toggle('holding', p > 0); });
    gear.addEventListener('click', () => { gear.classList.add('tip'); setTimeout(() => gear.classList.remove('tip'), 1600); });
    SP.UI.bindSettings(S, k => {
      saveSettings();
      if (k === 'sfx' || k === 'music' || k === 'voice') applyAudio();
      if (k === 'age') { ageOverride = null; SP.UI.setTitleInfo(progress.totalStars, curAge(), curLang()); }
      if (k === 'name' && SP.I18N.setChild) SP.I18N.setChild(S.name);
    }, curAge);
    $('btnSettingsDone').addEventListener('click', () => { SP.Audio.play('click'); SP.UI.only('scrTitle'); SP.UI.setTitleInfo(progress.totalStars, curAge(), curLang()); });

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(applySize, 250));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { pause(); SP.Audio.suspend(); if (SP.Voice) SP.Voice.stop(); }
      else SP.Audio.resume();
    });
    window.addEventListener('blur', () => { if (world && world.cancelDrag) world.cancelDrag(); });
  }
  function openSettings() {
    SP.Audio.play('click');
    SP.UI.refreshSettings();
    updateVoiceInfo();
    SP.UI.only('scrSettings');
  }
  function updateVoiceInfo() {
    if (!SP.Voice) return;
    const has = SP.Voice.hasVoice ? SP.Voice.hasVoice(curLang()) : false;
    const nm = SP.Voice.voiceName ? SP.Voice.voiceName() : '';
    const mic = SP.Voice.canListen && SP.Voice.canListen();
    const v = has ? (curLang() === 'vi' ? 'Giọng đọc: ' : 'Voice: ') + (nm || '✓') : T('ui.voiceMissing');
    const m = mic ? '' : ' · ' + T('ui.micUnsupported');
    SP.UI.setVoiceInfo(v + m);
  }

  /* ---------- test hooks (DESIGN §5.5) ---------- */
  function hooks() {
    const pt = p => (p ? { x: view.left + p.x * view.s, y: view.top + p.y * view.s } : null);
    const circ = c => (c ? { x: view.left + c.x * view.s, y: view.top + c.y * view.s, r: (c.r || 0) * view.s } : null);
    const box = b => (b ? { x: view.left + b.x * view.s, y: view.top + b.y * view.s, w: (b.w || 0) * view.s, h: (b.h || 0) * view.s } : null);
    const prev = SP.debug || {};
    SP.debug = prev;
    Object.defineProperties(prev, Object.getOwnPropertyDescriptors({
      get world() { return world; }, get weather() { return weather; }, get mode() { return mode; }, stats,
      get bot() { return bot; },
      voiceLog: (SP.Voice && SP.Voice.log) || prev.voiceLog || [],
      getState() {
        const s = world.stepInfo;
        return { mode, state: world.state, phase: world.phase, level: world.level, topic: world.topic, round: world.round, step: world.step,
          stepMode: s ? s.mode : null, stars: world.stars, misses: world.misses, brush: world.brush ? { state: world.brush.state, color: world.brush.color } : null,
          painted: world.parts ? world.parts.filter(p => p.painted).length : 0, parts: world.parts ? world.parts.length : 0,
          shells: (world.shells || []).map(x => x.color), surprise: world.surprise, weather: weather.ambient && weather.ambient.mood,
          W: view.W, H: view.H, ins: view.ins, settings: Object.assign({}, S), speed };
      },
      setSpeed(n) { speed = Math.max(0.1, +n || 1); applyAudio(); },
      startGame, goTitle,
      setBot(on, skill) { bot = on ? new SP.Bot(world, { skill: skill == null ? FLAGS.botSkill : skill, seed: 7 }) : null; },
      setAutoRestart(on) { autoRestart = !!on; },
      gotoLevel(i) { world.startLevel(i); },
      view: () => view, render: () => render,
      partScreen(id) { return pt(world.partTap ? world.partTap(id) : null); },
      shellScreen(color) { return circ(world.shellHit ? world.shellHit(color) : null); },
      niniScreen() { return box(world.niniHit ? world.niniHit() : null); },
      ninaScreen() { return box(world.niniHit ? world.niniHit() : null); },   // DESIGN §5.5 spelling
      fishyScreen() { return circ(world.fishyHit ? world.fishyHit() : null); },
      clamScreen() { return circ(world.clamHit ? world.clamHit() : null); },
      answer() { return world.answer ? world.answer() : null; },
      toScreen(x, y) { return { x: view.left + x * view.s, y: view.top + y * view.s }; },
      audio: () => SP.Audio
    }));
  }

  /* ---------- boot ---------- */
  async function boot() {
    await SP.Storage.init();
    S = Object.assign({}, DEF, SP.Storage.getJSON('settings', {}));
    Object.assign(progress, SP.Storage.getJSON('progress', {}));
    SP.UI.applyLang(curLang());
    if (SP.I18N && SP.I18N.setChild) SP.I18N.setChild(S.name);
    if (SP.Voice) { SP.Voice.init({ lang: curLang(), enabled: voiceOn() }); const prevStart = SP.Voice.onStart; SP.Voice.onStart = d => { onVoiceStart(d); if (prevStart) prevStart(d); }; }
    render = new SP.Renderer($('game')); SP.render = render;
    world = new SP.World({ seed: FLAGS.seed != null ? FLAGS.seed : (Date.now() & 0x7fffffff), age: FLAGS.age || S.age, lang: curLang() });
    weather = new SP.Weather({ width: 960, height: 720, seed: 11 });
    hooks();
    bindUI();
    applySize();
    weather.setWeather(0, { instant: true });
    await SP.Assets.load();
    render.prewarm(world.layout, 0);
    applyAudio();
    if (FLAGS.bot) bot = new SP.Bot(world, { skill: FLAGS.botSkill, seed: 7 });
    SP.UI.only('scrTitle');
    SP.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
    mode = 'title';
    requestAnimationFrame(frame);
    if (FLAGS.autostart) startGame();
    if (SP.Voice && SP.Voice.onVoicesChanged) SP.Voice.onVoicesChanged(updateVoiceInfo);
  }
  window.addEventListener('DOMContentLoaded', () => boot().catch(e => { console.error(e); }));
})(window.SP = window.SP || {});
