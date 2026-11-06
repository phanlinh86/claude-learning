/* TT main (Momo's Toy Train) — boots the game, sizes the canvas for any phone/tablet shape, runs the loop and turns
 * world events (drag cargo into cars, whistle, train departs) into voice, sound, effects and UI. */
(function (TT) {
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
  const T1 = (key, p) => (TT.I18N ? TT.I18N.t(curLang(), key, Object.assign({ child: S.name || '' }, p || {})) : key);
  // never the same wording twice in a row (playtest P3): re-roll a variant that repeats the line just spoken
  const T = (key, p) => { let r = T1(key, p); for (let k = 0; k < 3 && r && r === lastSpoken; k++) r = T1(key, p); return r; };
  const NAME = (kind, v) => (TT.I18N ? TT.I18N.name(curLang(), kind, v) : String(v));

  /* ---------- settings (URL flags never saved) ---------- */
  const DEF = { age: 4, lang: (navigator.language || 'en').toLowerCase().startsWith('vi') ? 'vi' : 'en', name: '', sfx: true, music: true, voice: true, mic: true, volume: 1 };
  let S = Object.assign({}, DEF);
  let langOverride = FLAGS.lang === 'vi' || FLAGS.lang === 'en' ? FLAGS.lang : null;   // URL ?lang= is session-only
  const curLang = () => langOverride || S.lang;
  let ageOverride = FLAGS.age || null;           // URL ?age= is session-only; a parent's pick wins
  const curAge = () => ageOverride || S.age;
  const saveSettings = () => TT.Storage.setJSON('settings', S);
  const progress = { totalStars: 0, sessions: 0 };

  let world, weather, render, bot = null, inputCancel = null;
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
    if (world && (prev.W !== view.W || prev.H !== view.H)) { if (inputCancel && inputCancel.cancel) inputCancel.cancel(); if (world.cancelDrag) world.cancelDrag(); }
    const rs = renderScale();
    const c = $('game');
    c.style.width = view.cssW + 'px'; c.style.height = view.cssH + 'px';
    c.style.left = view.left + 'px'; c.style.top = view.top + 'px';
    render.resize(view.W, view.H, rs);
    world.tapMoveMin = Math.max(24, 18 / view.s);   // ≈ 18 pt of finger wobble is still a tap on small phones
    world.setViewport(view.W, view.H, view.ins);
    // the world re-lays out the train, the cars and the rug itself in setViewport (rotation mid-drag is safe)
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
    TT.UI.placeBubble(r);
  }
  function updateHudStarTarget() {
    const p = TT.UI.hudStarPoint();
    if (p.x || p.y) render.hudStar = { x: (p.x - view.left) / view.s, y: (p.y - view.top) / view.s };
  }
  let resizeT = 0;
  function onResize() { clearTimeout(resizeT); resizeT = setTimeout(applySize, 120); }

  /* ---------- voice ---------- */
  const voiceOn = () => S.voice && !FLAGS.novoice && speed <= 1.01 && !FLAGS.mute;
  function speak(text, opt) {
    if (!text) return;
    lastSpoken = text;
    if (TT.Voice) TT.Voice.say(text, opt || {});
  }
  function applyAudio() {
    TT.Audio.setOptions({ sfx: S.sfx, music: S.music, muted: FLAGS.mute, volume: S.volume == null ? 1 : S.volume });
    if (TT.Voice) { TT.Voice.setLang(curLang()); TT.Voice.setEnabled(voiceOn()); if (TT.Voice.setVolume) TT.Voice.setVolume(S.volume == null ? 1 : S.volume); }
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
    TT.Audio.unlock();
    world.setAge(curAge()); world.setLang(curLang());
    world.lastTopics = TT.Storage.getJSON('lastTopics', null);   // chapters rotate between sessions
    world.newSession({ lastTopics: world.lastTopics });
    if (world.levels) TT.Storage.setJSON('lastTopics', world.levels);
    if (FLAGS.level != null) world.startLevel(Math.max(0, Math.min(3, FLAGS.level | 0)));
    shownStars = 0; TT.UI.setStars(0); lastAsk = null; lastPromptText = ''; surpriseLine = '';
    mode = 'play';
    TT.UI.only(); TT.UI.show('hud'); TT.UI.say('');
    TT.Audio.setMood(world.level || 0); TT.Audio.startMusic();
    applyAudio();
    stats.sessions++;
    requestAnimationFrame(() => { updateHudStarTarget(); placeBubble(); applySize(); });
  }
  function goTitle() {
    mode = 'title';
    $('stage').classList.remove('talking');
    if (TT.Voice) TT.Voice.stop();
    TT.Audio.stopMusic();
    TT.UI.only('scrTitle'); TT.UI.show('hud', false); TT.UI.say('');
    TT.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
    weather.setWeather(0, {}); if (weather.setParty) weather.setParty(false);
  }
  function pause() {
    if (mode !== 'play' && mode !== 'talk') return;
    mode = 'paused';
    if (inputCancel && inputCancel.cancel) inputCancel.cancel();
    if (world.cancelDrag) world.cancelDrag();
    if (TT.Voice) { TT.Voice.stop(); if (TT.Voice.stopListening) TT.Voice.stopListening(); }
    TT.Audio.stopMusic();
    TT.UI.only('scrPause');
  }
  function resume() {
    if (mode !== 'paused') return;
    mode = world.state === 'talk' ? 'talk' : 'play';
    idleSaid = 0;   // a returning child gets the nudges again before the next auto-pause
    if (world.resetNudges) world.resetNudges();
    TT.UI.only(mode === 'talk' ? 'scrTalk' : undefined);
    TT.Audio.startMusic();
    // say the question again so a returning child knows what to do
    if (mode === 'talk' && world.talk) speak(T(world.talk.promptKey, world.talk.params || {}), { priority: true });
    else if (world.state === 'round' && (world.phase === 'load' || world.phase === 'whistle')) setTimeout(repeatPrompt, 300);
  }

  let lastPromptText = '';
  function currentPrompt() {   // prompts have several wordings: repeat the one Momo said, word for word
    if (lastPromptText) return lastPromptText;
    const p = world.prompt ? world.prompt() : null;
    if (p && p.promptKey === 'loaded') return T('loaded');
    return p ? promptText(p) : (lastRoundEvt && lastRoundEvt.promptKey ? promptText(lastRoundEvt) : '');
  }
  // names: only when Momo is quiet, and not the same name again within 3 s (playtest M2)
  function sayName(txt, now) {
    if (!txt || (TT.Voice && TT.Voice.isSpeaking())) return;
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
    const I = TT.I18N;
    if (I && typeof I[fn] === 'function') { try { const t = I[fn](curLang(), ev2(e)); if (t) return t; } catch (err) { /* fall back */ } }
    return fallbackKey ? T(fallbackKey) : (e && e.nameKind ? NAME(e.nameKind, e.nameValue) : '');
  }
  const hasKey = k => TT.I18N && (TT.I18N.has ? TT.I18N.has(curLang(), k) : T(k) !== k);

  // a count word ("One!", "Two!" …) — the i18n helper, the count.<n> key, or the plain number name
  function countWord(i) {
    const I = TT.I18N;
    if (I && typeof I.sayCount === 'function') { try { const t = I.sayCount(curLang(), i); if (t) return t; } catch (err) { /* fall back */ } }
    const k = 'count.' + i; if (hasKey(k)) return T(k);
    return NAME('number', i) + '!';
  }
  const carById = id => (world.cars || []).find(c => c.id === id) || null;
  const itemById = id => (world.items || []).find(i => i.id === id) || null;
  const carIndex = id => Math.max(0, (world.cars || []).findIndex(c => c.id === id));
  const roundItem = e => e.item || (itemById(e.id) || {}).item || null;
  function carTop(c) {   // a point just above a car's rim (current position), for effects
    if (!c) return { x: view.W / 2, y: view.H / 2 };
    const b = world.carBox ? world.carBox(c.id) : null;
    return b ? { x: b.x, y: (b.y0 != null ? b.y0 : b.y - b.h / 2) - 10 } : { x: (c.x0 + c.x1) / 2, y: c.y0 };
  }
  function animalOf(it) { return it && (it.animal || (it.sprite && it.sprite.indexOf('animal_') === 0 ? it.sprite.slice(7) : null)); }
  function momoMood(m, t) { if (world.momo) { world.momo.mood = m; world.momo.moodT = t; } }
  let lastTapSay = 0, lastDragHint = 0, lastFull = 0, lastLoadedSay = 0;

  function onEvent(e) {
    const L = world.layout || {}, S0 = L.S || 104;
    switch (e.type) {
      case 'level':
        weather.setWeather(e.level, {});
        TT.Audio.setMood(e.level); TT.Audio.play('chapter');
        TT.UI.setDots(world.roundsPerLevel || 4, 0);
        speak(T('ui.chapter', { n: e.level + 1 }) + '. ' + T('topic.' + e.topic), { interrupt: true });
        speak(T('weather.' + e.level));   // "Good morning, train!" — queued after the chapter name
        TT.UI.say(T('topic.' + e.topic));
        render.prewarm(world.layout, e.level);
        break;
      case 'round': {
        lastRoundEvt = e; stats.rounds++; idleSaid = 0; lastAsk = null; lastPromptText = '';
        TT.UI.setDots(world.roundsPerLevel || 4, e.round % (world.roundsPerLevel || 4));
        surpriseLine = e.surprise ? T('surprise.' + e.surprise) : '';
        TT.UI.say(T('deal'));   // shown, not spoken (Momo talked too much, playtest P1-2); also clears the old depart line (QA P2-1)
        TT.Audio.play('whoosh');
        break;
      }
      case 'arrive': TT.Audio.play('brake'); TT.Audio.play('hiss'); break;
      case 'clack': TT.Audio.play('clack', { hard: e.hard, i: e.i || 0 }); break;
      case 'rail': TT.Audio.play('rail'); break;
      case 'pop': TT.Audio.play('pop'); break;
      case 'ask': {
        lastAsk = e; idleSaid = 0;
        const txt = T(e.promptKey, e.params || {});
        lastPromptText = txt;
        TT.UI.say(txt); speakPrompt(txt, { priority: true });
        if (surpriseLine && e.first) { /* told when the surprise appears */ }
        break;
      }
      case 'grab': {
        TT.Audio.play('grab');
        const it = roundItem(e);
        if (it && it.kind === 'sprite' && animalOf(it) && it.nameKind === 'animal') TT.Audio.play('animal', { animal: animalOf(it) });
        const wi = itemById(e.id);   // names only once a toy has missed (playtest P1-2: fewer lines)
        if (wi && wi.misses > 0 && canInterrupt()) sayName(line('sayGrab', Object.assign({}, e, { item: it })), performance.now());
        break;
      }
      case 'tap': {   // a tap is not a drop: the toy hops home; Momo names it and (now and then) shows how to drag
        TT.Audio.play('tap');
        const now = performance.now(), it = roundItem(e);
        if (canInterrupt()) sayName(line('sayGrab', Object.assign({}, e, { item: it })), now);
        if (now - lastDragHint > 9000 && canInterrupt()) { lastDragHint = now; speak(T('dragHint')); }
        break;
      }
      case 'drop': TT.Audio.play('whoosh'); break;
      case 'miss': {
        TT.Audio.play('miss');
        const now = performance.now();
        if (now - lastMissSay > 6000 && canInterrupt()) { lastMissSay = now; speak(T('miss')); }
        break;
      }
      case 'correct': {
        stats.correct++;
        promptUntil = 0; pendingPrompt = null;
        const c = carById(e.carId), it = roundItem(e) || {};
        momoMood('happy', 1.0);
        const ev = Object.assign({}, e, { item: it });
        if (e.count) { speak(countWord(e.count.i), { interrupt: true }); promptUntil = performance.now() + 900; }   // the count word is the most important word: nothing cuts it (playtest P1-3)
        else speak(line('sayCorrect', Object.assign(ev, { label: c && c.label })), { interrupt: true });
        const tp = carTop(c);
        if (e.count) render.burst('count', tp.x, tp.y - 30, { n: e.count.i });
        break;
      }
      case 'land': {
        const c = carById(e.carId), tp = carTop(c);
        TT.Audio.play('clonk', { car: carIndex(e.carId), i: e.i || 0 });
        if (e.count || (c && c.need)) TT.Audio.play('count', { i: e.i || 1 });
        const it = itemById(e.id);
        render.burst('land', it ? it.x : tp.x, it ? it.y + (it.size || S0) * 0.4 : tp.y + 20, { size: S0 * 0.8 });
        if (!e.quiet) render.burst('correct', tp.x, tp.y, { color: c && c.label && c.label.type === 'color' ? c.label.value : null });
        break;
      }
      case 'carDone': {
        const c = carById(e.carId), tp = carTop(c);
        TT.Audio.play('carDone');
        render.burst('sparkles', tp.x, tp.y, { n: 12 });
        if (c && c.need && world.cur && world.cur.mode === 'count') speak(line('sayCarDone', Object.assign({}, e, { item: (itemById((c.items || [])[0]) || {}).item, label: c.label })));
        break;
      }
      case 'full': {
        TT.Audio.play('full');
        const now = performance.now();
        if (now - lastFull > 2500) { lastFull = now; speak(T('full'), { interrupt: canInterrupt() }); }
        break;
      }
      case 'bye': TT.Audio.play('bye'); for (const id of e.ids || []) { const it = itemById(id); if (it) render.burst('bye', it.x, it.y); } break;
      case 'wrong': {
        stats.wrong++;
        const c = carById(e.carId), tp = carTop(c);
        TT.Audio.play('boing');
        render.burst('wrong', tp.x, tp.y + 40, { size: S0 * 1.2 });
        momoMood('oops', 1.0);
        const nowW = performance.now();
        if (nowW - lastWrongSay > 1500) {
          lastWrongSay = nowW;
          const ev = Object.assign({}, e, { got: curAge() <= 4 ? null : (c ? c.label : e.got), item: Object.assign({}, roundItem(e) || {}, e.item || {}) });   // ≤ 4: no "That's the X car." (shorter)
          speak(line('sayWrong', ev, 'hint'), { interrupt: canInterrupt() });
        }
        break;
      }
      case 'hint': {
        TT.Audio.play('hint');
        const c = carById(e.carId), tp = carTop(c);
        render.burst('hint', tp.x, tp.y + 50, { size: S0 * 1.4 });
        momoMood('point', 1.6);
        if (!e.idle) speak(T('hint'));
        break;
      }
      case 'idle':
        if (++idleSaid <= 4) speak(T('idle') + ' ' + currentPrompt());   // then stay quiet: maybe nobody is there
        else if (idleSaid >= 5 && !bot) pause();   // ≈ 2 min without a touch: nobody is playing — pause
        break;
      case 'stillDrag': break;
      case 'pokeMomo':
        if (e.phase === 'whistle') { speak(T('loaded'), { interrupt: true }); momoMood('point', 1.2); }
        else if (performance.now() - promptStart > 3000 && !pendingPrompt) repeatPrompt();
        else momoMood('happy', 0.6);
        break;
      case 'loaded': {
        TT.Audio.play('loaded');
        momoMood('point', 2.0);
        const t = T('loaded'); lastPromptText = t; lastLoadedSay = performance.now();
        TT.UI.say(t); speak(t);   // queued: the last count / praise is heard first
        break;
      }
      case 'whistleHint': {
        TT.Audio.play('hint');
        speak(T('whistleHint'), { interrupt: canInterrupt() });
        break;
      }
      case 'whistle': {
        TT.Audio.play('whistle');
        momoMood('whistle', 1.0);
        const geo = L.whistle || { x: 200, y: 300 }, tx = world.train ? world.train.x : 0;
        for (let i = 0; i < 3; i++) setTimeout(() => render.burst('ring', geo.x + tx, geo.y - 20 - i * 18, { size: 60 + i * 22 }), i * 140 / Math.max(0.25, speed));
        render.burst('steam', geo.x + tx, geo.y - 10, { n: 5 });
        const t = e.auto ? T('whistleAuto') : T('depart');
        TT.UI.say(t); speak(t, { interrupt: true });
        break;
      }
      case 'toot': TT.Audio.play('toot'); momoMood('whistle', 0.5); if (Math.random() < 0.25 && canInterrupt()) speak(T('toot')); break;
      case 'depart': {   // a bigger send-off: Momo cheers, a second TOOT as the train pulls away
        momoMood('cheer', 1.4); setTimeout(() => momoMood('wave', 2), 1400 / Math.max(0.25, speed));
        TT.Audio.play('hiss');
        setTimeout(() => { if (mode === 'play') { TT.Audio.play('toot'); if (world.train) world.train.whistle = 1; } }, 650 / Math.max(0.25, speed));
        break;
      }
      case 'puff': if (weather.addPuff) weather.addPuff(e.x, e.y, e.v, e.small); if (!e.small) TT.Audio.play('puff'); break;
      case 'departed': break;
      case 'roundDone': {
        const n = e.stars || 1, fx = view.W / 2, fy = view.H * 0.45;
        for (let i = 0; i < n; i++) {
          render.burst('star', fx + (i - (n - 1) / 2) * 60, fy, { delay: 0.1 + i * 0.22, onDone: () => { shownStars++; TT.UI.setStars(shownStars, true); TT.Audio.play('star', { i }); } });
        }
        TT.UI.setDots(world.roundsPerLevel || 4, ((e.round != null ? e.round : world.round) % (world.roundsPerLevel || 4)) + 1);
        const now = performance.now();
        if (now - lastPraise > 1200) { lastPraise = now; speak(T(e.stars >= 3 ? 'great' : 'praise')); }
        break;
      }
      case 'hitch': case 'balloon': {
        TT.Audio.play(e.type === 'hitch' ? 'hop' : 'squeak');
        const sl = T('surprise.' + e.type); speak(sl, { interrupt: canInterrupt() });
        break;
      }
      case 'hitchHop': TT.Audio.play('hop'); break;
      case 'hitchSit': TT.Audio.play('clonk', { car: 4 }); break;
      case 'hitchTap': {
        TT.Audio.play('giggle');
        const h = world.hitch; if (h) render.burst('sparkles', h.x, h.y - 60, { n: 10 });
        speak(T('hitch.tap'), { interrupt: canInterrupt() });
        break;
      }
      case 'balloonTap': {
        TT.Audio.play('squeak'); TT.Audio.play('sparkle');
        const b = world.balloon; if (b) render.burst('sparkles', b.x, b.y - (b.size || 160) * 0.7, { n: 16 });
        if ((e.taps || 1) <= 2) speak(T('balloon.tap'), { interrupt: canInterrupt() });
        break;
      }
      case 'talk': TT.UI.say(''); TT.UI.setDots(world.roundsPerLevel || 4, world.roundsPerLevel || 4); openTalk(e.talk || world.talk); break;
      case 'talkAsk': {   // no answer yet: ask again, and after the 2nd re-ask glow the right answer
        const tk = e.talk || world.talk;
        if (tk && e.n <= 3) speak(T(tk.promptKey, tk.params || {}), { priority: true });   // stop talking to an empty room
        if (e.n >= 4 && !bot) { pause(); break; }
        if (tk && (e.n >= 2 || tk.glowAnswer || e.glowAnswer)) TT.UI.glowTalk(tk.answerId);
        break;
      }
      case 'talkResult': {
        stats.talks++; if (e.correct) stats.talkRight++;
        TT.UI.markTalk(e.choiceId, e.answerId);
        const ans = (world.talk && world.talk.choices.find(c => c.id === e.answerId)) || {};
        if (e.correct) {
          TT.Audio.play('talkRight');
          render.burst('star', view.W / 2, view.H / 2, { onDone: () => { shownStars++; TT.UI.setStars(shownStars, true); TT.Audio.play('star'); } });
          speak(T('talk.right'), { interrupt: true });
        } else {
          TT.Audio.play('boing');
          const k = ans.nameKind || ans.kind, v = ans.nameValue != null ? ans.nameValue : ans.value;
          speak(TT.I18N.talkWrong ? TT.I18N.talkWrong(curLang(), k, v) : T('talk.wrong', { answer: NAME(k, v) }), { interrupt: true });
        }
        break;
      }
      case 'levelDone':
        TT.Audio.play('level'); TT.UI.say('');
        if (mode === 'talk') { mode = 'play'; TT.UI.only(); }
        $('stage').classList.remove('talking');
        break;
      case 'sessionDone': {
        TT.Audio.play('fanfare');
        weather.setWeather(3, {});                 // the night party
        if (weather.setParty) weather.setParty(true);
        render.burst('confetti', 0, 0);
        progress.totalStars += e.stars || 0; progress.sessions++;
        TT.Storage.setJSON('progress', progress);
        shownStars = e.stars || shownStars; TT.UI.setStars(shownStars);
        $('doneStars').textContent = e.stars || 0;
        $('doneTitle').textContent = T('session.done', { stars: e.stars || 0 });
        speak(T('party'), { interrupt: true });
        speak(T('session.done', { stars: e.stars || 0 }));
        mode = 'done';
        TT.UI.only('scrDone'); TT.UI.show('hud', false); TT.UI.say('');
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
    const canMic = S.mic && TT.Voice && TT.Voice.canListen && TT.Voice.canListen() && !FLAGS.bot;
    TT.UI.openTalk(talk, curLang(), id => { TT.Audio.play('click'); world.talkAnswer(id); }, canMic, curAge());
    const q = T(talk.promptKey, talk.params || {});
    speakPrompt(T('talk.intro') + ' ' + q, { priority: true });   // queued after the round's praise, not cutting it off
  }
  function listen() {
    const talk = world.talk;
    if (!talk || world.state !== 'talk' || !TT.Voice || !TT.Voice.canListen()) return;
    if (TT.Voice.stop) TT.Voice.stop();
    TT.Audio.play('listen');
    TT.UI.setListening(true, T('ui.listening'));
    const choices = talk.choices.map(c => ({ id: c.id, words: TT.I18N.words(curLang(), c.nameKind || c.kind, c.nameValue != null ? c.nameValue : c.value) }));
    TT.Voice.listen({ lang: curLang(), choices, timeoutMs: 6000 }).then(res => {
      TT.UI.setListening(false, T('ui.tapOrSay'));
      if (world.state !== 'talk') return;
      if (res && res.id != null) world.talkAnswer(res.id);
      else if (res && res.reason === 'not-allowed') { $('btnMic').classList.add('hidden'); speak(T('ui.micDenied')); }
      else speak(T('ui.tapOrSay'));
    }).catch(() => TT.UI.setListening(false, T('ui.tapOrSay')));
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
        while (left > 1e-6) {
        const step = Math.min(left, 1 / 30);
        if (bot && (mode === 'play' || mode === 'talk')) bot.step(step);
        world.update(step);
        handleEvents();
        left -= step;
      }
    }
    weather.update(dt * Math.min(speed, 4), {});
    const speaking = TT.Voice && TT.Voice.isSpeaking ? TT.Voice.isSpeaking() : false;
    TT.Audio.duck(speaking);
    if (mode === 'play' && world.train) TT.Audio.setChug(world.train.v, dt * speed); else TT.Audio.setChug(0, dt);
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
    world.pointerDown(p.x, p.y);   // cargo, the whistle (and extra toots), Momo (repeat), the bunny, the balloon
  }
  function repeatPrompt() {
    if (world.state !== 'round') return;
    TT.Audio.play('click');
    momoMood('think', 1.2);
    if (world.phase === 'whistle') { speak(T('loaded'), { interrupt: true }); return; }
    if (!lastAsk) return;
    const cp = currentPrompt(); promptUntil = 0; speakPrompt(cp, { interrupt: true });
  }

  function bindUI() {
    TT.Input.kidProof();
    inputCancel = TT.Input.attach($('game'), {
      toLogical,
      down: (x, y) => onDown({ x, y }),       // TT.Input calls handlers with (x, y, ev) in logical px
      move: (x, y) => { if (mode === 'play' && !bot) world.pointerMove(x, y); },
      up: (x, y) => { if (mode === 'play' && !bot) world.pointerUp(x, y); },
      cancel: () => { if (world.cancelDrag) world.cancelDrag(); }
    });
    const unlock = () => { TT.Audio.unlock(); if (TT.Voice) TT.Voice.unlock(); };
    ['touchend', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { capture: true, passive: true }));

    $('btnPlay').addEventListener('click', () => { TT.Audio.play('click'); startGame(); });
    $('bubble').addEventListener('click', repeatPrompt);
    $('btnPause').addEventListener('click', () => { TT.Audio.play('click'); pause(); });
    $('btnResume').addEventListener('click', () => { TT.Audio.play('click'); resume(); });
    $('btnHome').addEventListener('click', () => { TT.Audio.play('click'); goTitle(); });
    $('btnAgain').addEventListener('click', () => { TT.Audio.play('click'); startGame(); });
    $('btnDoneHome').addEventListener('click', () => { TT.Audio.play('click'); goTitle(); });
    $('btnMic').addEventListener('click', listen);
    // volume: settings slider + big − / + in the pause menu
    $('optVolume').addEventListener('input', () => { S.volume = +$('optVolume').value / 100; saveSettings(); applyAudio(); });
    $('optVolume').addEventListener('change', () => TT.Audio.play('pop'));
    const step = d => { S.volume = Math.max(0, Math.min(1, Math.round(((S.volume == null ? 1 : S.volume) + d) * 20) / 20)); saveSettings(); applyAudio(); TT.Audio.play('pop'); };
    $('btnVolDown').addEventListener('click', () => step(-0.1));
    $('btnVolUp').addEventListener('click', () => step(0.1));
    document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => {
      S.lang = b.dataset.lang; langOverride = null; saveSettings(); TT.UI.applyLang(curLang()); applyAudio(); TT.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
      updateVoiceInfo();
      TT.Audio.play('click');
      if (mode === 'title') speak(T('ui.welcome'), { interrupt: true });
    }));
    // parent gate: hold the gear for 2 s
    const gear = $('btnParents');
    TT.Input.holdButton(gear, 2000, () => { gear.style.setProperty('--p', 0); openSettings(); },
      p => { gear.style.setProperty('--p', p); gear.classList.toggle('holding', p > 0); });
    gear.addEventListener('click', () => { gear.classList.add('tip'); setTimeout(() => gear.classList.remove('tip'), 1600); });
    TT.UI.bindSettings(S, k => {
      saveSettings();
      if (k === 'sfx' || k === 'music' || k === 'voice') applyAudio();
      if (k === 'age') { ageOverride = null; TT.UI.setTitleInfo(progress.totalStars, curAge(), curLang()); }
      if (k === 'name' && TT.I18N.setChild) TT.I18N.setChild(S.name);
    }, curAge);
    $('btnSettingsDone').addEventListener('click', () => { TT.Audio.play('click'); TT.UI.only('scrTitle'); TT.UI.setTitleInfo(progress.totalStars, curAge(), curLang()); });

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(applySize, 250));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { pause(); TT.Audio.suspend(); if (TT.Voice) TT.Voice.stop(); }
      else TT.Audio.resume();
    });
    window.addEventListener('blur', () => { if (world && world.cancelDrag) world.cancelDrag(); });
  }
  function openSettings() {
    TT.Audio.play('click');
    TT.UI.refreshSettings();
    updateVoiceInfo();
    TT.UI.only('scrSettings');
  }
  function updateVoiceInfo() {
    if (!TT.Voice) return;
    const has = TT.Voice.hasVoice ? TT.Voice.hasVoice(curLang()) : false;
    const nm = TT.Voice.voiceName ? TT.Voice.voiceName() : '';
    const mic = TT.Voice.canListen && TT.Voice.canListen();
    const v = has ? (curLang() === 'vi' ? 'Giọng đọc: ' : 'Voice: ') + (nm || '✓') : (curLang() === 'vi' ? 'Máy chưa có giọng tiếng Việt — vào Cài đặt › Trợ năng › Nội dung được đọc để tải giọng.' : 'No voice for this language on this device yet.');
    const m = mic ? '' : ' · ' + T('ui.micUnsupported');
    TT.UI.setVoiceInfo(v + m);
  }

  /* ---------- test hooks ---------- */
  function hooks() {
    const box = b => (b ? { x: view.left + b.x * view.s, y: view.top + b.y * view.s, w: b.w * view.s, h: b.h * view.s } : null);
    const prev = TT.debug || {};
    TT.debug = prev;
    Object.defineProperties(prev, Object.getOwnPropertyDescriptors({
      get world() { return world; }, get weather() { return weather; }, get mode() { return mode; }, stats,
      voiceLog: (TT.Voice && TT.Voice.log) || prev.voiceLog || [],
      getState() {
        return { mode, state: world.state, level: world.level, topic: world.topic, round: world.round, stars: world.stars,
          phase: world.phase, askMode: world.prompt && world.prompt() ? world.prompt().mode : null,
          cars: (world.cars || []).length, items: (world.items || []).length, loaded: (world.items || []).filter(i => i.state === 'in').length,
          trainX: world.train ? world.train.x : 0, W: view.W, H: view.H, ins: view.ins, settings: Object.assign({}, S), speed };
      },
      setSpeed(n) { speed = Math.max(0.1, +n || 1); applyAudio(); },
      startGame, goTitle,
      setBot(on, skill) { bot = on ? new TT.Bot(world, { skill: skill == null ? FLAGS.botSkill : skill, seed: 7 }) : null; },
      setAutoRestart(on) { autoRestart = !!on; },
      gotoLevel(i) { world.startLevel(i); },
      get bot() { return bot; }, view: () => view, render: () => render,
      itemScreen(id) { return box(world.itemHit ? world.itemHit(id) : null); },
      carScreen(id) { return box(world.carBox ? world.carBox(id) : null); },
      whistleScreen() { return box(world.whistleHit ? world.whistleHit() : null); },
      momoScreen() { return box(world.momoHit ? world.momoHit() : null); },
      hitchScreen() { return box(world.hitchHit ? world.hitchHit() : null); },
      balloonScreen() { return box(world.balloonHit ? world.balloonHit() : null); },
      answerCarId(itemId) { return world.answerCarId ? world.answerCarId(itemId) : null; },
      toScreen(x, y) { return { x: view.left + x * view.s, y: view.top + y * view.s }; },
      audio: () => TT.Audio
    }));
  }

  /* ---------- boot ---------- */
  async function boot() {
    await TT.Storage.init();
    S = Object.assign({}, DEF, TT.Storage.getJSON('settings', {}));
    Object.assign(progress, TT.Storage.getJSON('progress', {}));
    TT.UI.applyLang(curLang());
    if (TT.I18N && TT.I18N.setChild) TT.I18N.setChild(S.name);
    if (TT.Voice) { TT.Voice.init({ lang: curLang(), enabled: voiceOn() }); const prevStart = TT.Voice.onStart; TT.Voice.onStart = d => { onVoiceStart(d); if (prevStart) prevStart(d); }; }
    render = new TT.Renderer($('game')); TT.render = render;
    world = new TT.World({ seed: FLAGS.seed != null ? FLAGS.seed : (Date.now() & 0x7fffffff), age: FLAGS.age || S.age, lang: curLang() });
    weather = new TT.Weather({ width: 960, height: 720, seed: 11 });
    hooks();
    bindUI();
    applySize();
    weather.setWeather(0, { instant: true });
    await TT.Assets.load();
    render.prewarm(world.layout, 0);
    applyAudio();
    if (FLAGS.bot) bot = new TT.Bot(world, { skill: FLAGS.botSkill, seed: 7 });
    TT.UI.only('scrTitle');
    TT.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
    mode = 'title';
    requestAnimationFrame(frame);
    if (FLAGS.autostart) startGame();
    if (TT.Voice && TT.Voice.onVoicesChanged) TT.Voice.onVoicesChanged(updateVoiceInfo);
  }
  window.addEventListener('DOMContentLoaded', () => boot().catch(e => { console.error(e); }));
})(window.TT = window.TT || {});
