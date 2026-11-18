/* GW main (Gigi's Peekaboo Windows) — boots the game, sizes the canvas for any phone/tablet shape, runs the loop and turns
 * world events into voice, sound, effects and UI. */
(function (GW) {
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
  const T = (key, p) => (GW.I18N ? GW.I18N.t(curLang(), key, Object.assign({ child: S.name || '' }, p || {})) : key);
  const NAME = (kind, v) => (GW.I18N ? GW.I18N.name(curLang(), kind, v) : String(v));

  /* ---------- settings (URL flags never saved) ---------- */
  const DEF = { age: 4, lang: (navigator.language || 'en').toLowerCase().startsWith('vi') ? 'vi' : 'en', name: '', sfx: true, music: true, voice: true, mic: true, volume: 1 };
  let S = Object.assign({}, DEF);
  let langOverride = FLAGS.lang === 'vi' || FLAGS.lang === 'en' ? FLAGS.lang : null;   // URL ?lang= is session-only
  const curLang = () => langOverride || S.lang;
  let ageOverride = FLAGS.age || null;           // URL ?age= is session-only; a parent's pick wins
  const curAge = () => ageOverride || S.age;
  const saveSettings = () => GW.Storage.setJSON('settings', S);
  const progress = { totalStars: 0, sessions: 0 };

  let world, weather, render, bot = null;
  let mode = 'loading';            // loading | title | play | paused | talk | done
  let speed = FLAGS.speed, autoRestart = FLAGS.autorestart;
  let view = { W: 960, H: 720, s: 1, left: 0, top: 0, ins: { top: 0, right: 0, bottom: 0, left: 0 } };
  const stats = { sessions: 0, rounds: 0, correct: 0, wrong: 0, misses: 0, talks: 0, talkRight: 0, frames: 0, slowFrames: 0 };
  let rewardSaid = false, lastMatchAt = 0, promptUntil = 0, lastWrongSay = 0, idleSaid = 0, lastName = '', firstAsk = true, shownStars = 0, lastRoundEvt = null, missSay = 0, lastGrabSay = 0, lastPraise = 0;

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
  function measureHud() {   // the real DOM HUD + speech bubble in logical px (rewards must not perch under them)
    const box = (r, pad) => ({ x: (r.left - view.left) / view.s - pad, y: 0, w: r.width / view.s + 2 * pad, h: (r.bottom - view.top) / view.s + pad });
    const h = $('hud').getBoundingClientRect(), b = $('bubble').getBoundingClientRect();
    let k = h.width > 0 ? box(h, 8) : { x: view.W - view.ins.right - 430, y: 0, w: 430, h: view.ins.top + 115 };   // hidden: estimate
    if (b.width > 0) {   // union with the bubble (on phones it sits below the HUD, lower than the world's own estimate)
      const bb = box(b, 10), x0 = Math.min(k.x, bb.x), x1 = Math.max(k.x + k.w, bb.x + bb.w);
      k = { x: x0, y: 0, w: x1 - x0, h: Math.max(k.h, bb.h) };
    }
    return k;
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
    // anything still travelling from the old layout starts inside the new screen
    for (const it of []) {   // the card world re-lays itself out in setViewport
      const m = 50;
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
    GW.UI.placeBubble(r);
  }
  function updateHudStarTarget() {
    const p = GW.UI.hudStarPoint();
    if (p.x || p.y) render.hudStar = { x: (p.x - view.left) / view.s, y: (p.y - view.top) / view.s };
  }
  let resizeT = 0;
  function onResize() { clearTimeout(resizeT); resizeT = setTimeout(applySize, 120); }

  /* ---------- voice ---------- */
  const voiceOn = () => S.voice && !FLAGS.novoice && speed <= 1.01 && !FLAGS.mute;
  function speak(text, opt) {
    if (!text) return;
    if (GW.Voice) GW.Voice.say(text, opt || {});
  }
  function applyAudio() {
    GW.Audio.setOptions({ sfx: S.sfx, music: S.music, muted: FLAGS.mute, volume: S.volume == null ? 1 : S.volume });
    if (GW.Voice) { GW.Voice.setLang(curLang()); GW.Voice.setEnabled(voiceOn()); if (GW.Voice.setVolume) GW.Voice.setVolume(S.volume == null ? 1 : S.volume); }
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
    GW.Audio.unlock();
    world.setAge(curAge()); world.setLang(curLang());
    world.lastTopics = GW.Storage.getJSON('lastTopics', null);   // chapters rotate between sessions
    world.newSession({ lastTopics: world.lastTopics });
    if (world.levels) GW.Storage.setJSON('lastTopics', world.levels);
    if (FLAGS.level != null) world.startLevel(Math.max(0, Math.min(3, FLAGS.level | 0)));
    shownStars = 0; GW.UI.setStars(0);
    mode = 'play';
    GW.UI.only(); GW.UI.show('hud'); GW.UI.say('');
    GW.Audio.setMood(world.level || 0); GW.Audio.startMusic();
    applyAudio();
    stats.sessions++;
    requestAnimationFrame(() => { updateHudStarTarget(); placeBubble(); applySize(); });
  }
  function goTitle() {
    mode = 'title';
    if (GW.Voice) GW.Voice.stop();
    GW.Audio.stopMusic();
    GW.UI.only('scrTitle'); GW.UI.show('hud', false); GW.UI.say('');
    GW.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
    weather.setWeather(0, {});
  }
  function pause() {
    if (mode !== 'play' && mode !== 'talk') return;
    mode = 'paused';
    if (world.cancelDrag) world.cancelDrag();
    if (GW.Voice) { GW.Voice.stop(); if (GW.Voice.stopListening) GW.Voice.stopListening(); }
    GW.Audio.stopMusic();
    GW.UI.only('scrPause');
  }
  function resume() {
    if (mode !== 'paused') return;
    mode = world.state === 'talk' ? 'talk' : 'play';
    idleSaid = 0;   // a returning child gets the nudges again before the next auto-pause
    GW.UI.only(mode === 'talk' ? 'scrTalk' : undefined);
    GW.Audio.startMusic();
  }

  let lastPromptText = '';
  function currentPrompt() {   // prompts have several wordings: repeat the one Dee said, word for word
    if (lastPromptText) return lastPromptText;
    const p = world.prompt ? world.prompt() : null;
    return p ? promptText(p) : (lastRoundEvt ? promptText(lastRoundEvt) : '');
  }
  // names: only when Dee is quiet, and not the same name again within 3 s (playtest M2)
  function sayName(txt, now) {
    if (!txt || (GW.Voice && GW.Voice.isSpeaking())) return;
    if (now - lastGrabSay < 700 || (txt === lastName && now - lastGrabSay < 3000)) return;
    lastGrabSay = now; lastName = txt;
    speak(txt);
  }
  function handleEvents() {
    const evs = world.drainEvents();
    for (const e of evs) onEvent(e);
  }
  function cardById(id) { return (world.cards || []).find(c => c.id === id); }
  const toCss = r => r && ({ x: view.left + r.x * view.s, y: view.top + r.y * view.s, w: r.w * view.s, h: r.h * view.s });

  function onEvent(e) {
    const L = world.layout;
    switch (e.type) {
      case 'level':
        weather.setWeather(e.level, {});
        GW.Audio.setMood(e.level); GW.Audio.play('chapter');
        GW.UI.setDots(world.roundsPerLevel || 5, 0);
        speak(T('ui.chapter', { n: e.level + 1 }) + '. ' + T('topic.' + e.topic), { interrupt: true });
        speak(T('weather.' + e.level));   // "Spring is here!" — queued after the chapter name
        GW.UI.say(T('topic.' + e.topic));
        render.prewarm(L, e.level + 1);
        if (e.level === 2) GW.Audio.play('whoosh');
        break;
      case 'round': {
        lastRoundEvt = e; stats.rounds++; idleSaid = 0;
        GW.UI.setDots(world.roundsPerLevel || 5, e.round % (world.roundsPerLevel || 5));
        const txt = promptText(e);
        lastPromptText = txt; rewardSaid = false;
        GW.UI.say(txt); speakPrompt(txt, { priority: true });
        break;
      }
      case 'scroll':   // Gigi trots on to the next building
        GW.Audio.play('whoosh');
        if (!e.first) speak(T('walk'));
        break;
      case 'walk': GW.Audio.play('step', { foot: e.foot }); break;
      case 'critter': {   // surprise friends: a pigeon on a sill, the little bus, a balloon — never a mistake
        const sound = { pigeon: e.action === 'tap' || e.action === 'leave' ? 'flutter' : 'coo', bus: 'beep', balloon: 'squeak' }[e.critter];
        if (e.action === 'enter') {
          GW.Audio.play('surprise');
          if (e.critter === 'bus') GW.Audio.play('car');
          if (GW.I18N.sayCritter) speak(GW.I18N.sayCritter(curLang(), e.critter));
        } else if (e.action === 'land') GW.Audio.play('coo');
        else if (e.action === 'stop') GW.Audio.play('beep');
        else if (e.action === 'tap') {
          GW.Audio.play(sound); if (e.critter === 'pigeon') GW.Audio.play('coo');
          render.burst('sparkle', e.x, e.y);
          if (canInterrupt() && GW.I18N.sayCritter) speak(GW.I18N.sayCritter(curLang(), e.critter, 'tap'), { interrupt: !(GW.Voice && GW.Voice.isSpeaking()) });
        }
        break;
      }
      case 'peek': GW.Audio.play('peek'); speak(T('peek')); break;          // queued after the prompt
      case 'hide': speak(T('hide')); break;
      case 'clack': GW.Audio.play('clack', { v: e.v }); break;
      case 'bloom': GW.Audio.play('pop'); render.burst('bloom', e.x, e.y); break;
      case 'cheer':
        GW.Audio.play('cheer');
        render.burst('roof', e.x, e.y, { w: (world.layout.grid && world.layout.grid.building ? world.layout.grid.building.w : 300) * 0.8 });
        speak(T('cheer'));   // queued after the last match line
        break;
      case 'flip': {
        GW.Audio.play('flip');
        if (e.open === 2) lastPraise = 0;
        const line = GW.I18N.sayFlip ? GW.I18N.sayFlip(curLang(), Object.assign({ topic: world.topic }, e)) : '';
        speak(line, { interrupt: canInterrupt() });   // the card's name is the lesson; it never cuts the instruction
        break;
      }
      case 'tap': {
        const now = performance.now();
        if (now - lastGrabSay < 900) break;
        lastGrabSay = now;
        GW.Audio.play('tapcard');
        speak(GW.I18N.sayFlip ? GW.I18N.sayFlip(curLang(), Object.assign({ topic: world.topic }, e)) : '', { interrupt: canInterrupt() });
        break;
      }
      case 'match': {
        stats.correct++;
        GW.Audio.play('match', { count: e.found || 0 });
        const ca = cardById(e.a), cb = cardById(e.b);
        for (const c of [ca, cb]) if (c) render.burst('pop', c.x, c.y, { color: (c.face && c.face.color) || null, size: c.w * 1.2 });
        lastMatchAt = performance.now();
        speak(GW.I18N.sayMatch ? GW.I18N.sayMatch(curLang(), Object.assign({ topic: world.topic }, e)) : T('praise'), { interrupt: true });
        break;
      }
      case 'mismatch': {
        stats.wrong++;
        GW.Audio.play('hmm');
        const nowW = performance.now();
        if (nowW - lastWrongSay > 1500) {
          lastWrongSay = nowW;
          speak(GW.I18N.sayMismatch ? GW.I18N.sayMismatch(curLang(), Object.assign({ topic: world.topic }, e)) : T('wrong'), { interrupt: canInterrupt() });
        }
        break;
      }
      case 'hint': {
        GW.Audio.play('hint');
        for (const id of [e.a, e.b]) { const c = cardById(id); if (c) render.burst('hint', c.x, c.y, { size: c.w }); }
        if (!e.idle) speak(T('hint'));
        break;
      }
      case 'idle':
        if (++idleSaid <= 4) speak(T('idle') + ' ' + currentPrompt());   // then stay quiet: maybe nobody is there
        else if (idleSaid >= 5 && !bot) pause();   // ≈ 2 min without a tap: nobody is playing — pause the music and the game
        break;
      case 'roundDone': {
        GW.Audio.play('round');
        const n = e.stars || 1;
        const hb = GW.World.gigiHead ? GW.World.gigiHead(world) : null;
        const sx = hb ? hb.x + hb.w / 2 : L.gigi.x, sy = hb ? hb.y : L.gigi.y - L.gigi.h;
        for (let i = 0; i < n; i++) {
          render.burst('star', sx, sy, {
            delay: i * 0.22, onDone: () => { shownStars++; GW.UI.setStars(shownStars, true); GW.Audio.play('star', { i }); }
          });
        }
        if (e.stars >= 3 && Math.random() < 0.5) speak(T('great'));   // the building's cheer line already praised
        GW.UI.setDots(world.roundsPerLevel || 5, ((e.round != null ? e.round : world.round) % (world.roundsPerLevel || 5)) + 1);
        break;
      }
      case 'talk': openTalk(e.talk || world.talk); break;
      case 'talkAsk': {   // no answer yet: ask again, and after the 2nd re-ask glow the right answer
        const tk = e.talk || world.talk;
        if (tk && e.n <= 3) speak(T(tk.promptKey, tk.params || {}), { priority: true });   // stop talking to an empty room
        if (e.n >= 4 && !bot) { pause(); break; }
        if (e.n >= 2 || (tk && tk.glowAnswer)) GW.UI.glowTalk(tk.answerId);
        break;
      }
      case 'talkResult': {
        stats.talks++; if (e.correct) stats.talkRight++;
        GW.UI.markTalk(e.choiceId, e.answerId);
        const ans = (world.talk && world.talk.choices.find(c => c.id === e.answerId)) || {};
        if (e.correct) {
          GW.Audio.play('talkRight');
          render.burst('star', view.W / 2, view.H / 2, { onDone: () => { shownStars++; GW.UI.setStars(shownStars, true); GW.Audio.play('star'); } });
          speak(T('talk.right'), { interrupt: true });
        } else {
          GW.Audio.play('wrong');
          speak(GW.I18N.talkWrong ? GW.I18N.talkWrong(curLang(), ans.kind, ans.value) : T('talk.wrong', { answer: NAME(ans.kind, ans.value) }), { interrupt: true });
        }
        break;
      }
      case 'levelDone':
        GW.Audio.play('level');
        if (mode === 'talk') { mode = 'play'; GW.UI.only(); }
        break;
      case 'sessionDone': {
        GW.Audio.play('fanfare');
        weather.setWeather(3, {});                 // the street party under the rainbow
        render.burst('confetti', 0, 0);
        progress.totalStars += e.stars || 0; progress.sessions++;
        GW.Storage.setJSON('progress', progress);
        shownStars = e.stars || shownStars; GW.UI.setStars(shownStars);
        $('doneStars').textContent = e.stars || 0;
        $('doneTitle').textContent = T('session.done', { stars: e.stars || 0 });
        speak(T('session.done', { stars: e.stars || 0 }), { interrupt: true });
        mode = 'done';
        GW.UI.only('scrDone'); GW.UI.show('hud', false); GW.UI.say('');
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
    const canMic = S.mic && GW.Voice && GW.Voice.canListen && GW.Voice.canListen() && !FLAGS.bot;
    GW.UI.openTalk(talk, curLang(), id => { GW.Audio.play('click'); world.talkAnswer(id); }, canMic, curAge());
    const q = T(talk.promptKey, talk.params || {});
    speakPrompt(T('talk.intro') + ' ' + q, { priority: true });   // queued after the round's praise, not cutting it off
  }
  function listen() {
    const talk = world.talk;
    if (!talk || world.state !== 'talk' || !GW.Voice || !GW.Voice.canListen()) return;
    if (GW.Voice.stop) GW.Voice.stop();
    GW.Audio.play('listen');
    GW.UI.setListening(true, T('ui.listening'));
    const choices = talk.choices.map(c => ({ id: c.id, words: GW.I18N.words(curLang(), c.kind, c.value) }));
    GW.Voice.listen({ lang: curLang(), choices, timeoutMs: 6000 }).then(res => {
      GW.UI.setListening(false, T('ui.tapOrSay'));
      if (world.state !== 'talk') return;
      if (res && res.id != null) world.talkAnswer(res.id);
      else if (res && res.reason === 'not-allowed') { $('btnMic').classList.add('hidden'); speak(T('ui.micDenied')); }
      else speak(T('ui.tapOrSay'));
    }).catch(() => GW.UI.setListening(false, T('ui.tapOrSay')));
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
      world.wind = (weather.ambient && weather.ambient.wind) || 0;   // the breeze sways open shutters
      while (left > 1e-6) {
        const step = Math.min(left, 1 / 30);
        if (bot && (mode === 'play' || mode === 'talk')) bot.step(step);
        world.update(step);
        handleEvents();
        left -= step;
      }
    }
    weather.update(dt * Math.min(speed, 4), { groundY: world.layout.groundY });
    const speaking = GW.Voice && GW.Voice.isSpeaking ? GW.Voice.isSpeaking() : false;
    GW.Audio.duck(speaking);
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
    const hit = world.pointerDown(p.x, p.y);   // a window, a surprise friend, or Gigi
    if (hit === 'gigi') repeatPrompt();         // tapping Gigi (or the bubble) repeats the instruction
  }
  function repeatPrompt() {
    if (!lastRoundEvt || world.state !== 'round') return;
    GW.Audio.play('click');
    world.dee && (world.dee.mood = 'think', world.dee.moodT = 1.2);
    const cp = currentPrompt(); promptUntil = 0; speakPrompt(cp, { interrupt: true });
  }

  function bindUI() {
    GW.Input.kidProof();
    GW.Input.attach($('game'), {
      toLogical,
      down: (x, y) => onDown({ x, y }),       // GW.Input calls handlers with (x, y, ev) in logical px
      move: (x, y) => { if (mode === 'play' && !bot) world.pointerMove(x, y); },
      up: (x, y) => { if (mode === 'play' && !bot) world.pointerUp(x, y); },
      cancel: () => { if (world.cancelDrag) world.cancelDrag(); }
    });
    const unlock = () => { GW.Audio.unlock(); if (GW.Voice) GW.Voice.unlock(); };
    ['touchend', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { capture: true, passive: true }));

    $('btnPlay').addEventListener('click', () => { GW.Audio.play('click'); startGame(); });
    $('bubble').addEventListener('click', repeatPrompt);
    $('btnPause').addEventListener('click', () => { GW.Audio.play('click'); pause(); });
    $('btnResume').addEventListener('click', () => { GW.Audio.play('click'); resume(); });
    $('btnHome').addEventListener('click', () => { GW.Audio.play('click'); goTitle(); });
    $('btnAgain').addEventListener('click', () => { GW.Audio.play('click'); startGame(); });
    $('btnDoneHome').addEventListener('click', () => { GW.Audio.play('click'); goTitle(); });
    $('btnMic').addEventListener('click', listen);
    // volume: settings slider + big − / + in the pause menu
    $('optVolume').addEventListener('input', () => { S.volume = +$('optVolume').value / 100; saveSettings(); applyAudio(); });
    $('optVolume').addEventListener('change', () => GW.Audio.play('pop'));
    const step = d => { S.volume = Math.max(0, Math.min(1, Math.round(((S.volume == null ? 1 : S.volume) + d) * 10) / 10)); saveSettings(); applyAudio(); GW.Audio.play('pop'); };
    $('btnVolDown').addEventListener('click', () => step(-0.1));
    $('btnVolUp').addEventListener('click', () => step(0.1));
    document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => {
      S.lang = b.dataset.lang; langOverride = null; saveSettings(); GW.UI.applyLang(curLang()); applyAudio(); GW.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
      updateVoiceInfo();
      GW.Audio.play('click');
      if (mode === 'title') speak(T('ui.welcome'), { interrupt: true });
    }));
    // parent gate: hold the gear for 2 s
    const gear = $('btnParents');
    GW.Input.holdButton(gear, 2000, () => { gear.style.setProperty('--p', 0); openSettings(); },
      p => { gear.style.setProperty('--p', p); gear.classList.toggle('holding', p > 0); });
    gear.addEventListener('click', () => { gear.classList.add('tip'); setTimeout(() => gear.classList.remove('tip'), 1600); });
    GW.UI.bindSettings(S, k => {
      saveSettings();
      if (k === 'sfx' || k === 'music' || k === 'voice') applyAudio();
      if (k === 'age') { ageOverride = null; GW.UI.setTitleInfo(progress.totalStars, curAge(), curLang()); }
      if (k === 'name' && GW.I18N.setChild) GW.I18N.setChild(S.name);
    }, curAge);
    $('btnSettingsDone').addEventListener('click', () => { GW.Audio.play('click'); GW.UI.only('scrTitle'); GW.UI.setTitleInfo(progress.totalStars, curAge(), curLang()); });

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(applySize, 250));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { pause(); GW.Audio.suspend(); if (GW.Voice) GW.Voice.stop(); }
      else GW.Audio.resume();
    });
    window.addEventListener('blur', () => { if (world && world.cancelDrag) world.cancelDrag(); });
  }
  function openSettings() {
    GW.Audio.play('click');
    GW.UI.refreshSettings();
    updateVoiceInfo();
    GW.UI.only('scrSettings');
  }
  function updateVoiceInfo() {
    if (!GW.Voice) return;
    const has = GW.Voice.hasVoice ? GW.Voice.hasVoice(curLang()) : false;
    const nm = GW.Voice.voiceName ? GW.Voice.voiceName() : '';
    const mic = GW.Voice.canListen && GW.Voice.canListen();
    const v = has ? (curLang() === 'vi' ? 'Giọng đọc: ' : 'Voice: ') + (nm || '✓') : (curLang() === 'vi' ? 'Máy chưa có giọng tiếng Việt — vào Cài đặt › Trợ năng › Nội dung được đọc để tải giọng.' : 'No voice for this language on this device yet.');
    const m = mic ? '' : ' · ' + T('ui.micUnsupported');
    GW.UI.setVoiceInfo(v + m);
  }

  /* ---------- test hooks ---------- */
  function hooks() {
    const prev = GW.debug || {};
    GW.debug = prev;
    Object.defineProperties(prev, Object.getOwnPropertyDescriptors({
      get world() { return world; }, get weather() { return weather; }, get mode() { return mode; }, stats,
      voiceLog: (GW.Voice && GW.Voice.log) || prev.voiceLog || [],
      getState() {
        return { mode, state: world.state, level: world.level, topic: world.topic, round: world.round, stars: world.stars,
          items: (world.items || []).length, held: world.held, W: view.W, H: view.H, ins: view.ins, settings: Object.assign({}, S), speed };
      },
      setSpeed(n) { speed = Math.max(0.1, +n || 1); applyAudio(); },
      startGame, goTitle,
      setBot(on, skill) { bot = on ? new GW.Bot(world, { skill: skill == null ? FLAGS.botSkill : skill, seed: 7 }) : null; },
      setAutoRestart(on) { autoRestart = !!on; },
      gotoLevel(i) { world.startLevel(i); },
      get bot() { return bot; }, view: () => view, render: () => render,
      cardScreen(id) {
        const c = cardById(id); if (!c) return null;
        const dx = world.buildingDx || 0;
        return { x: view.left + (c.x + dx) * view.s, y: view.top + c.y * view.s, w: c.w * view.s, h: c.h * view.s };
      },
      gigiScreen() {
        const r = world.layout.gigiRect, hb = GW.World.gigiHead(world);
        if (!r) return null;
        const x0 = Math.min(r.x, hb.x), y0 = Math.min(r.y, hb.y), x1 = Math.max(r.x + r.w, hb.x + hb.w), y1 = Math.max(r.y + r.h, hb.y + hb.h);
        return Object.assign(toCss({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }), { body: toCss(r), head: toCss(hb) });
      },
      critterScreen() { return toCss(world.critterRect ? world.critterRect() : null); },
      audio: () => GW.Audio
    }));
  }

  /* ---------- boot ---------- */
  async function boot() {
    await GW.Storage.init();
    S = Object.assign({}, DEF, GW.Storage.getJSON('settings', {}));
    Object.assign(progress, GW.Storage.getJSON('progress', {}));
    GW.UI.applyLang(curLang());
    if (GW.I18N && GW.I18N.setChild) GW.I18N.setChild(S.name);
    if (GW.Voice) GW.Voice.init({ lang: curLang(), enabled: voiceOn() });
    render = new GW.Renderer($('game')); GW.render = render;
    world = new GW.World({ seed: FLAGS.seed != null ? FLAGS.seed : (Date.now() & 0x7fffffff), age: FLAGS.age || S.age, lang: curLang() });
    weather = new GW.Weather({ width: 960, height: 720, seed: 11 });
    hooks();
    bindUI();
    applySize();
    weather.setWeather(0, { instant: true });
    await GW.Assets.load();
    render.prewarm(world.layout, 0);
    applyAudio();
    if (FLAGS.bot) bot = new GW.Bot(world, { skill: FLAGS.botSkill, seed: 7 });
    GW.UI.only('scrTitle');
    GW.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
    mode = 'title';
    requestAnimationFrame(frame);
    if (FLAGS.autostart) startGame();
    if (GW.Voice && GW.Voice.onVoicesChanged) GW.Voice.onVoicesChanged(updateVoiceInfo);
  }
  window.addEventListener('DOMContentLoaded', () => boot().catch(e => { console.error(e); }));
})(window.GW = window.GW || {});
