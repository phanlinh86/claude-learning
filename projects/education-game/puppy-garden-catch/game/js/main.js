/* PG main (Puppy Garden Catch) — boots the game, sizes the canvas for any phone/tablet shape, runs the loop and turns
 * world events into voice, sound, effects and UI. */
(function (PG) {
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
  const T = (key, p) => (PG.I18N ? PG.I18N.t(curLang(), key, Object.assign({ child: S.name || '' }, p || {})) : key);
  const NAME = (kind, v) => (PG.I18N ? PG.I18N.name(curLang(), kind, v) : String(v));

  /* ---------- settings (URL flags never saved) ---------- */
  const DEF = { age: 4, lang: (navigator.language || 'en').toLowerCase().startsWith('vi') ? 'vi' : 'en', name: '', sfx: true, music: true, voice: true, mic: true };
  let S = Object.assign({}, DEF);
  let langOverride = FLAGS.lang === 'vi' || FLAGS.lang === 'en' ? FLAGS.lang : null;   // URL ?lang= is session-only
  const curLang = () => langOverride || S.lang;
  const curAge = () => FLAGS.age || S.age;
  const saveSettings = () => PG.Storage.setJSON('settings', S);
  const progress = { totalStars: 0, sessions: 0 };

  let world, weather, render, bot = null;
  let mode = 'loading';            // loading | title | play | paused | talk | done
  let speed = FLAGS.speed, autoRestart = FLAGS.autorestart;
  let view = { W: 960, H: 720, s: 1, left: 0, top: 0, ins: { top: 0, right: 0, bottom: 0, left: 0 } };
  const stats = { sessions: 0, rounds: 0, correct: 0, wrong: 0, misses: 0, talks: 0, talkRight: 0, frames: 0, slowFrames: 0 };
  let shownStars = 0, lastRoundEvt = null, missSay = 0, lastGrabSay = 0, lastPraise = 0;

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
  function applySize() {
    const prev = view;
    view = computeView();
    const ins0 = prev.ins || {}, ins1 = view.ins;
    const geomChanged = !layoutDone || prev.W !== view.W || prev.H !== view.H ||
      ['top', 'right', 'bottom', 'left'].some(k => Math.abs((ins0[k] || 0) - ins1[k]) > 0.5);
    const dpr = window.devicePixelRatio || 1;
    let rs = view.s * dpr * quality;
    const px = view.W * rs * view.H * rs, cap = maxPixels();
    if (px > cap) rs *= Math.sqrt(cap / px);
    rs = Math.max(0.5, rs);
    const c = $('game');
    c.style.width = view.cssW + 'px'; c.style.height = view.cssH + 'px';
    c.style.left = view.left + 'px'; c.style.top = view.top + 'px';
    render.resize(view.W, view.H, rs);
    // only a real size/inset change re-lays the world out (setViewport cancels the child's steer);
    // a render-quality step only resizes the backing store
    if (geomChanged) { world.setViewport(view.W, view.H, view.ins); weather.resize(view.W, view.H); layoutDone = true; }
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
    PG.UI.placeBubble(r);
    // new bubbles must be born below the speech bubble (it drops under the HUD on narrow phones)
    if (world.setTopReserve) world.setTopReserve((r.y + r.h - view.top) / view.s);
  }
  function updateHudStarTarget() {
    const p = PG.UI.hudStarPoint();
    if (p.x || p.y) render.hudStar = { x: (p.x - view.left) / view.s, y: (p.y - view.top) / view.s };
  }
  let resizeT = 0, layoutDone = false, needResize = false;
  function onResize() { clearTimeout(resizeT); resizeT = setTimeout(applySize, 120); }

  /* ---------- voice ---------- */
  const voiceOn = () => S.voice && !FLAGS.novoice && speed <= 1.01 && !FLAGS.mute;
  function speak(text, opt) {
    if (!text) return;
    if (PG.Voice) PG.Voice.say(text, opt || {});
  }
  function applyAudio() {
    PG.Audio.setOptions({ sfx: S.sfx, music: S.music, muted: FLAGS.mute });
    if (PG.Voice) { PG.Voice.setLang(curLang()); PG.Voice.setEnabled(voiceOn()); }
  }
  function promptText(e) { return T(e.promptKey, e.params || {}); }
  function itemEv(id, extra) {
    const it = itemById(id) || {}, cur = world.cur || {};
    return Object.assign({ nameKind: it.nameKind, nameValue: it.nameValue, target: cur.target, params: cur.params,
      need: cur.need, bySound: cur.promptKey === 'p.animalsSound' }, extra || {});
  }

  /* ---------- game flow ---------- */
  function startGame() {
    PG.Audio.unlock();
    world.setAge(curAge()); world.setLang(curLang());
    world.newSession();
    if (FLAGS.level != null) world.startLevel(Math.max(0, Math.min(3, FLAGS.level | 0)));
    shownStars = 0; PG.UI.setStars(0);
    mode = 'play';
    PG.UI.only(); PG.UI.show('hud'); PG.UI.say('');
    PG.Audio.setMood(world.level || 0); PG.Audio.startMusic();
    applyAudio();
    stats.sessions++;
    requestAnimationFrame(() => { updateHudStarTarget(); placeBubble(); });
  }
  function goTitle() {
    mode = 'title';
    if (PG.Voice) PG.Voice.stop();
    PG.Audio.stopMusic();
    PG.UI.only('scrTitle'); PG.UI.show('hud', false); PG.UI.say('');
    PG.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
    weather.setWeather(0, {});
  }
  function pause() {
    if (mode !== 'play') return;
    mode = 'paused';
    if (world.cancelDrag) world.cancelDrag();
    if (PG.Voice) PG.Voice.stop();
    PG.Audio.stopMusic();
    PG.UI.only('scrPause');
  }
  function resume() {
    if (mode !== 'paused') return;
    mode = world.state === 'talk' ? 'talk' : 'play';
    PG.UI.only(mode === 'talk' ? 'scrTalk' : undefined);
    PG.Audio.startMusic();
  }

  function handleEvents() {
    const evs = world.drainEvents();
    for (const e of evs) onEvent(e);
  }
  function basketById(id) { return (world.baskets || []).find(b => b.id === id); }
  function itemById(id) { return (world.items || []).find(i => i.id === id); }

  function onEvent(e) {
    const L = world.layout;
    switch (e.type) {
      case 'level':
        weather.setWeather(e.level, {});
        PG.Audio.setMood(e.level); PG.Audio.play('chapter');
        PG.UI.setDots(world.roundsPerLevel || 5, 0);
        speak(T('ui.chapter', { n: e.level + 1 }) + '. ' + T('topic.' + e.topic), { interrupt: true });
        PG.UI.say(T('topic.' + e.topic));
        render.prewarm(L, e.level + 1);
        break;
      case 'round': {
        lastRoundEvt = e; stats.rounds++;
        PG.UI.setDots(world.roundsPerLevel || 5, e.round % (world.roundsPerLevel || 5));
        const txt = promptText(e);
        PG.UI.say(txt); speak(txt, { priority: true });
        break;
      }
      case 'appear': { PG.Audio.play('appear'); break; }
      case 'pop': {
        const it = itemById(e.id);
        PG.Audio.play('pop');
        render.burst('pop', e.x, e.y, { size: it ? it.size * 1.35 : 120 });
        break;
      }
      case 'correct': {
        stats.correct++;
        if (world.cur && world.cur.mode === 'count') break;      // counting speaks the number on landing
        const now = performance.now();
        if (now - lastPraise < 1200) break;          // don't stack praise when catches come fast
        lastPraise = now;
        const s1 = PG.I18N.sayCorrect ? PG.I18N.sayCorrect(curLang(), itemEv(e.id, e)) : '';
        speak(s1 && Math.random() < 0.7 ? s1 : T('praise'), { interrupt: true });
        break;
      }
      case 'land': {
        const b = world.basket;
        const counting = world.cur && world.cur.mode === 'count';
        PG.Audio.play('land', { count: counting ? e.count : 0 });
        if (b) render.burst('land', b.x, b.y, { size: b.w });
        if (counting) {
          const line = PG.I18N.sayCorrect ? PG.I18N.sayCorrect(curLang(), itemEv(e.id, { count: e.count, need: e.need })) : NAME('number', e.count);
          speak(line || NAME('number', e.count), { interrupt: true });
        }
        break;
      }
      case 'wrong': {
        stats.wrong++;
        PG.Audio.play('wrong'); PG.Audio.play('hop');
        const line = PG.I18N.sayWrong ? PG.I18N.sayWrong(curLang(), itemEv(e.id, e)) : T('wrong');
        speak(line || T('wrong'), { interrupt: true });
        break;
      }
      case 'miss':
        stats.misses++; PG.Audio.play('miss');
        if (++missSay % 2 === 1) speak(T('miss'));
        break;
      case 'bounce': {
        const it = itemById(e.id);
        PG.Audio.play('bounce');
        if (it) render.burst('bounce', it.x, world.layout.groundY);
        break;
      }
      case 'hint': {
        const it = itemById(e.id);
        PG.Audio.play('hint');
        if (it) render.burst('hint', it.x, it.y);
        speak(T('hint'));                            // hints queue, they never cut each other off
        break;
      }
      case 'idle':
        speak(T('idle') + ' ' + (lastRoundEvt ? promptText(lastRoundEvt) : ''));
        break;
      case 'tapPup': repeatPrompt(); break;
      case 'roundDone': {
        PG.Audio.play('round');
        const n = e.stars || 1;
        const from = world.pup, ph = L.pup.h;
        for (let i = 0; i < n; i++) {
          render.burst('star', from.x, L.pup.y - ph * 1.05, {
            delay: i * 0.22, onDone: () => { shownStars++; PG.UI.setStars(shownStars, true); PG.Audio.play('star', { i }); }
          });
        }
        speak(T('great'));                           // queued: never cuts off the last count / praise
        PG.UI.setDots(world.roundsPerLevel || 5, ((e.round != null ? e.round : world.round) % (world.roundsPerLevel || 5)) + 1);
        break;
      }
      case 'talk': openTalk(e.talk || world.talk); break;
      case 'talkAsk': {   // no answer yet: ask again, and after the 2nd re-ask glow the right answer
        const tk = e.talk || world.talk;
        if (tk && e.n <= 3) speak(T(tk.promptKey, tk.params || {}), { priority: true });   // stop talking to an empty room
        if (e.n >= 2 || (tk && tk.glowAnswer)) PG.UI.glowTalk(tk.answerId);
        break;
      }
      case 'tap':         // a quick tap on an item: Bo just says its name
        if (e.nameKind) speak(NAME(e.nameKind, e.nameValue), { interrupt: true });
        PG.Audio.play('grab');
        break;
      case 'talkResult': {
        stats.talks++; if (e.correct) stats.talkRight++;
        PG.UI.markTalk(e.choiceId, e.answerId);
        const ans = (world.talk && world.talk.choices.find(c => c.id === e.answerId)) || {};
        if (e.correct) {
          PG.Audio.play('talkRight');
          render.burst('star', view.W / 2, view.H / 2, { onDone: () => { shownStars++; PG.UI.setStars(shownStars, true); PG.Audio.play('star'); } });
          speak(T('talk.right'), { interrupt: true });
        } else {
          PG.Audio.play('wrong');
          speak(PG.I18N.talkWrong ? PG.I18N.talkWrong(curLang(), ans.kind, ans.value) : T('talk.wrong', { answer: NAME(ans.kind, ans.value) }), { interrupt: true });
        }
        break;
      }
      case 'levelDone':
        PG.Audio.play('level');
        if (mode === 'talk') { mode = 'play'; PG.UI.only(); }
        break;
      case 'sessionDone': {
        PG.Audio.play('fanfare');
        render.burst('confetti', 0, 0);
        progress.totalStars += e.stars || 0; progress.sessions++;
        PG.Storage.setJSON('progress', progress);
        shownStars = e.stars || shownStars; PG.UI.setStars(shownStars);
        $('doneStars').textContent = e.stars || 0;
        $('doneTitle').textContent = T('session.done', { stars: e.stars || 0 });
        speak(T('session.done', { stars: e.stars || 0 }), { interrupt: true });
        mode = 'done';
        PG.UI.only('scrDone'); PG.UI.show('hud', false); PG.UI.say('');
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
    const canMic = S.mic && PG.Voice && PG.Voice.canListen && PG.Voice.canListen() && !FLAGS.bot;
    PG.UI.openTalk(talk, curLang(), id => { PG.Audio.play('click'); world.talkAnswer(id); }, canMic, curAge());
    const q = T(talk.promptKey, talk.params || {});
    speak(T('talk.intro') + ' ' + q, { interrupt: true, priority: true });
  }
  function listen() {
    const talk = world.talk;
    if (!talk || world.state !== 'talk' || !PG.Voice || !PG.Voice.canListen()) return;
    if (PG.Voice.stop) PG.Voice.stop();
    PG.Audio.play('listen');
    PG.UI.setListening(true, T('ui.listening'));
    const choices = talk.choices.map(c => ({ id: c.id, words: PG.I18N.words(curLang(), c.kind, c.value) }));
    PG.Voice.listen({ lang: curLang(), choices, timeoutMs: 6000 }).then(res => {
      PG.UI.setListening(false, T('ui.tapOrSay'));
      if (world.state !== 'talk') return;
      if (res && res.id != null) world.talkAnswer(res.id);
      else if (res && res.reason === 'not-allowed') { $('btnMic').classList.add('hidden'); speak(T('ui.micDenied')); }
      else speak(T('ui.tapOrSay'));
    }).catch(() => PG.UI.setListening(false, T('ui.tapOrSay')));
  }

  /* ---------- loop ---------- */
  let last = 0, slowAcc = 0, fastAcc = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (document.hidden) { last = ts; return; }
    if (needResize) { needResize = false; applySize(); }   // before drawing: resizing clears the canvas
    let dt = last ? (ts - last) / 1000 : 0.016;
    last = ts;
    const raw = dt;
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
    weather.update(dt * Math.min(speed, 4), { groundY: world.layout.groundY });
    const speaking = PG.Voice && PG.Voice.isSpeaking ? PG.Voice.isSpeaking() : false;
    PG.Audio.duck(speaking);
    render.draw(world, weather, { dt: dt * Math.min(speed, 4), lang: curLang(), title: mode === 'title' || mode === 'loading', speaking, done: mode === 'done', debug: FLAGS.debug });
    adapt(raw);
  }
  function adapt(raw) {  // adaptive quality: step the render scale down when frames stay slow
    if (raw > 0.5) return;
    if (raw > 0.022) { slowAcc += raw; fastAcc = 0; stats.slowFrames++; } else { slowAcc = Math.max(0, slowAcc - raw * 0.5); fastAcc += raw; }
    if (slowAcc > 1.5 && quality > 0.6) { quality *= 0.85; render.quality = Math.max(0.5, quality); slowAcc = 0; needResize = true; }
  }

  /* ---------- input ---------- */
  function toLogical(cx, cy) { return { x: (cx - view.left) / view.s, y: (cy - view.top) / view.s }; }
  function onDown(p) {
    if (mode !== 'play' || bot) return;
    world.pointerDown(p.x, p.y);       // steer Pip; a tap on a bubble names it, a tap on Pip repeats (world events)
  }
  function repeatPrompt() {
    if (!lastRoundEvt || world.state !== 'round') return;
    PG.Audio.play('click');
    world.pup && (world.pup.mood = 'think', world.pup.moodT = 1.2);
    speak(promptText(lastRoundEvt), { interrupt: true });
  }

  function bindUI() {
    PG.Input.kidProof();
    PG.Input.attach($('game'), {
      toLogical,
      down: (x, y) => onDown({ x, y }),       // PG.Input calls handlers with (x, y, ev) in logical px
      move: (x, y) => { if (mode === 'play' && !bot) world.pointerMove(x, y); },
      up: (x, y) => { if (mode === 'play' && !bot) world.pointerUp(x, y); },
      cancel: () => { if (world.cancelDrag) world.cancelDrag(); }
    });
    const unlock = () => { PG.Audio.unlock(); if (PG.Voice) PG.Voice.unlock(); };
    ['touchend', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { capture: true, passive: true }));

    $('btnPlay').addEventListener('click', () => { PG.Audio.play('click'); startGame(); });
    $('bubble').addEventListener('click', repeatPrompt);
    $('btnPause').addEventListener('click', () => { PG.Audio.play('click'); pause(); });
    $('btnResume').addEventListener('click', () => { PG.Audio.play('click'); resume(); });
    $('btnHome').addEventListener('click', () => { PG.Audio.play('click'); goTitle(); });
    $('btnAgain').addEventListener('click', () => { PG.Audio.play('click'); startGame(); });
    $('btnDoneHome').addEventListener('click', () => { PG.Audio.play('click'); goTitle(); });
    $('btnMic').addEventListener('click', listen);
    document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => {
      S.lang = b.dataset.lang; langOverride = null; saveSettings(); PG.UI.applyLang(curLang()); applyAudio(); PG.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
      updateVoiceInfo();
      PG.Audio.play('click');
      if (mode === 'title') speak(T('ui.welcome'), { interrupt: true });
    }));
    // parent gate: hold the gear for 2 s
    const gear = $('btnParents');
    PG.Input.holdButton(gear, 2000, () => { gear.style.setProperty('--p', 0); openSettings(); },
      p => { gear.style.setProperty('--p', p); gear.classList.toggle('holding', p > 0); });
    gear.addEventListener('click', () => { gear.classList.add('tip'); setTimeout(() => gear.classList.remove('tip'), 1600); });
    PG.UI.bindSettings(S, k => {
      saveSettings();
      if (k === 'sfx' || k === 'music' || k === 'voice') applyAudio();
      if (k === 'age') PG.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
      if (k === 'name' && PG.I18N.setChild) PG.I18N.setChild(S.name);
    });
    $('btnSettingsDone').addEventListener('click', () => { PG.Audio.play('click'); PG.UI.only('scrTitle'); PG.UI.setTitleInfo(progress.totalStars, curAge(), curLang()); });

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(applySize, 250));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { pause(); PG.Audio.suspend(); if (PG.Voice) PG.Voice.stop(); }
      else PG.Audio.resume();
    });
    window.addEventListener('blur', () => { if (world && world.cancelDrag) world.cancelDrag(); });
  }
  function openSettings() {
    PG.Audio.play('click');
    PG.UI.refreshSettings();
    updateVoiceInfo();
    PG.UI.only('scrSettings');
  }
  function updateVoiceInfo() {
    if (!PG.Voice) return;
    const has = PG.Voice.hasVoice ? PG.Voice.hasVoice(curLang()) : false;
    const nm = PG.Voice.voiceName ? PG.Voice.voiceName() : '';
    const mic = PG.Voice.canListen && PG.Voice.canListen();
    const v = has ? (curLang() === 'vi' ? 'Giọng đọc: ' : 'Voice: ') + (nm || '✓') : (curLang() === 'vi' ? 'Máy chưa có giọng tiếng Việt — vào Cài đặt › Trợ năng › Nội dung được đọc để tải giọng.' : 'No voice for this language on this device yet.');
    const m = mic ? '' : ' · ' + T('ui.micUnsupported');
    PG.UI.setVoiceInfo(v + m);
  }

  /* ---------- test hooks ---------- */
  function hooks() {
    const prev = PG.debug || {};
    PG.debug = prev;
    Object.defineProperties(prev, Object.getOwnPropertyDescriptors({
      get world() { return world; }, get weather() { return weather; }, get mode() { return mode; }, stats,
      voiceLog: (PG.Voice && PG.Voice.log) || prev.voiceLog || [],
      getState() {
        return { mode, state: world.state, level: world.level, topic: world.topic, round: world.round, stars: world.stars,
          items: (world.items || []).length, held: world.held, W: view.W, H: view.H, ins: view.ins, settings: Object.assign({}, S), speed };
      },
      setSpeed(n) { speed = Math.max(0.1, +n || 1); applyAudio(); },
      startGame, goTitle,
      setBot(on, skill) { bot = on ? new PG.Bot(world, { skill: skill == null ? FLAGS.botSkill : skill, seed: 7 }) : null; },
      setAutoRestart(on) { autoRestart = !!on; },
      gotoLevel(i) { world.startLevel(i); },
      get bot() { return bot; }, view: () => view, render: () => render
    }));
  }

  /* ---------- boot ---------- */
  async function boot() {
    await PG.Storage.init();
    S = Object.assign({}, DEF, PG.Storage.getJSON('settings', {}));
    Object.assign(progress, PG.Storage.getJSON('progress', {}));
    PG.UI.applyLang(curLang());
    if (PG.I18N && PG.I18N.setChild) PG.I18N.setChild(S.name);
    if (PG.Voice) PG.Voice.init({ lang: curLang(), enabled: voiceOn() });
    render = new PG.Renderer($('game')); PG.render = render;
    world = new PG.World({ seed: FLAGS.seed != null ? FLAGS.seed : (Date.now() & 0x7fffffff), age: FLAGS.age || S.age, lang: curLang() });
    weather = new PG.Weather({ width: 960, height: 720, seed: 11 });
    hooks();
    bindUI();
    applySize();
    weather.setWeather(0, { instant: true });
    await PG.Assets.load();
    render.prewarm(world.layout, 0);
    applyAudio();
    if (FLAGS.bot) bot = new PG.Bot(world, { skill: FLAGS.botSkill, seed: 7 });
    PG.UI.only('scrTitle');
    PG.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
    mode = 'title';
    requestAnimationFrame(frame);
    if (FLAGS.autostart) startGame();
    if (PG.Voice && PG.Voice.onVoicesChanged) PG.Voice.onVoicesChanged(updateVoiceInfo);
  }
  window.addEventListener('DOMContentLoaded', () => boot().catch(e => { console.error(e); }));
})(window.PG = window.PG || {});
