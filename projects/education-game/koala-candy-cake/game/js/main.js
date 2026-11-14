/* CK main (Koko's Cake Tower) — boots the game, sizes the canvas for any phone/tablet shape, runs the loop and turns
 * world events into voice, sound, effects and UI. */
(function (CK) {
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
  const T = (key, p) => (CK.I18N ? CK.I18N.t(curLang(), key, Object.assign({ child: S.name || '' }, p || {})) : key);
  const NAME = (kind, v) => (CK.I18N ? CK.I18N.name(curLang(), kind, v) : String(v));

  /* ---------- settings (URL flags never saved) ---------- */
  const DEF = { age: 4, lang: (navigator.language || 'en').toLowerCase().startsWith('vi') ? 'vi' : 'en', name: '', sfx: true, music: true, voice: true, mic: true, volume: 1 };
  let S = Object.assign({}, DEF);
  let langOverride = FLAGS.lang === 'vi' || FLAGS.lang === 'en' ? FLAGS.lang : null;   // URL ?lang= is session-only
  const curLang = () => langOverride || S.lang;
  let ageOverride = FLAGS.age || null;           // URL ?age= is session-only; a parent's pick wins
  const curAge = () => ageOverride || S.age;
  const saveSettings = () => CK.Storage.setJSON('settings', S);
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
    // the world re-lays out the tray, the tower and the goal itself in setViewport (rotation mid-drag is safe)
    weather.resize(view.W, view.H);
    if (world.layout && world.layout.groundY) weather.groundY = world.layout.groundY;
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
    CK.UI.placeBubble(r);
  }
  function updateHudStarTarget() {
    const p = CK.UI.hudStarPoint();
    if (p.x || p.y) render.hudStar = { x: (p.x - view.left) / view.s, y: (p.y - view.top) / view.s };
  }
  let resizeT = 0;
  function onResize() { clearTimeout(resizeT); resizeT = setTimeout(applySize, 120); }

  /* ---------- voice ---------- */
  const voiceOn = () => S.voice && !FLAGS.novoice && speed <= 1.01 && !FLAGS.mute;
  function speak(text, opt) {
    if (!text) return;
    if (CK.Voice) CK.Voice.say(text, opt || {});
  }
  function applyAudio() {
    CK.Audio.setOptions({ sfx: S.sfx, music: S.music, muted: FLAGS.mute, volume: S.volume == null ? 1 : S.volume });
    if (CK.Voice) { CK.Voice.setLang(curLang()); CK.Voice.setEnabled(voiceOn()); if (CK.Voice.setVolume) CK.Voice.setVolume(S.volume == null ? 1 : S.volume); }
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
    CK.Audio.unlock();
    world.setAge(curAge()); world.setLang(curLang());
    world.lastTopics = CK.Storage.getJSON('lastTopics', null);   // chapters rotate between sessions
    world.newSession({ lastTopics: world.lastTopics });
    if (world.levels) CK.Storage.setJSON('lastTopics', world.levels);
    if (FLAGS.level != null) world.startLevel(Math.max(0, Math.min(3, FLAGS.level | 0)));
    shownStars = 0; CK.UI.setStars(0); lastAsk = null; lastPromptText = ''; surpriseLine = '';
    mode = 'play';
    CK.UI.only(); CK.UI.show('hud'); CK.UI.say('');
    CK.Audio.setMood(world.level || 0); CK.Audio.startMusic();
    applyAudio();
    stats.sessions++;
    requestAnimationFrame(() => { updateHudStarTarget(); placeBubble(); applySize(); });
  }
  function goTitle() {
    mode = 'title';
    if (CK.Voice) CK.Voice.stop();
    CK.Audio.stopMusic();
    CK.UI.only('scrTitle'); CK.UI.show('hud', false); CK.UI.say('');
    CK.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
    weather.setWeather(0, {}); if (weather.party) weather.party(false);
  }
  function pause() {
    if (mode !== 'play' && mode !== 'talk') return;
    mode = 'paused';
    if (world.cancelDrag) world.cancelDrag();
    if (CK.Voice) { CK.Voice.stop(); if (CK.Voice.stopListening) CK.Voice.stopListening(); }
    CK.Audio.stopMusic();
    CK.UI.only('scrPause');
  }
  function resume() {
    if (mode !== 'paused') return;
    mode = world.state === 'talk' ? 'talk' : 'play';
    idleSaid = 0;   // a returning child gets the nudges again before the next auto-pause
    if (world.resetNudges) world.resetNudges();
    CK.UI.only(mode === 'talk' ? 'scrTalk' : undefined);
    CK.Audio.startMusic();
    // say the question again so a returning child knows what to do
    if (mode === 'talk' && world.talk) speak(T(world.talk.promptKey, world.talk.params || {}), { priority: true });
    else if (world.state === 'round' && world.phase === 'ask') setTimeout(repeatPrompt, 300);
  }

  let lastPromptText = '';
  function currentPrompt() {   // prompts have several wordings: repeat the one Koko said, word for word
    if (lastPromptText) return lastPromptText;
    const p = world.prompt ? world.prompt() : null;
    return p ? promptText(p) : (lastRoundEvt ? promptText(lastRoundEvt) : '');
  }
  // names: only when Koko is quiet, and not the same name again within 3 s (playtest M2)
  function sayName(txt, now) {
    if (!txt || (CK.Voice && CK.Voice.isSpeaking())) return;
    if (now - lastGrabSay < 700 || (txt === lastName && now - lastGrabSay < 3000)) return;
    lastGrabSay = now; lastName = txt;
    speak(txt);
  }
  function handleEvents() {
    const evs = world.drainEvents();
    for (const e of evs) onEvent(e);
  }
  let lastAsk = null;
  function ev2(e) { return Object.assign({ topic: world.topic }, lastAsk ? { promptKey: lastAsk.promptKey, params: lastAsk.params } : {}, e); }
  // a voice helper the voice engineer provides, or a gentle fallback line
  function line(fn, e, fallbackKey) {
    const I = CK.I18N;
    if (I && typeof I[fn] === 'function') { try { const t = I[fn](curLang(), ev2(e)); if (t) return t; } catch (err) { /* fall back */ } }
    return fallbackKey ? T(fallbackKey) : (e && e.nameKind ? NAME(e.nameKind, e.nameValue) : '');
  }
  const hasKey = k => CK.I18N && (CK.I18N.has ? CK.I18N.has(curLang(), k) : T(k) !== k);

  function onEvent(e) {
    const L = world.layout || {};
    switch (e.type) {
      case 'level':
        weather.setWeather(e.level, {});
        if (weather.party) weather.party(false);
        CK.Audio.setMood(e.level); CK.Audio.play('chapter');
        CK.UI.setDots(world.roundsPerLevel || 4, 0);
        speak(T('ui.chapter', { n: e.level + 1 }) + '. ' + T('topic.' + e.topic), { interrupt: true });
        speak(T('weather.' + e.level));   // "Good morning, jungle!" — queued after the chapter name
        CK.UI.say(T('topic.' + e.topic));
        render.prewarm(world.layout, e.level);
        break;
      case 'round': {
        lastRoundEvt = e; stats.rounds++; idleSaid = 0; lastAsk = null; lastPromptText = '';
        CK.UI.setDots(world.roundsPerLevel || 4, e.round % (world.roundsPerLevel || 4));
        surpriseLine = e.surprise ? T('surprise.' + e.surprise) : '';
        if (stats.rounds === 1) { const d = T('deal'); if (d && d !== 'deal') { CK.UI.say(d); speak(d); } }
        break;
      }
      case 'deal': CK.Audio.play('appear'); break;
      case 'ask': {
        lastAsk = e; idleSaid = 0;
        const txt = T(e.promptKey, e.params || {});
        lastPromptText = txt;
        CK.UI.say(txt); speakPrompt(txt, { priority: true });
        if (surpriseLine && lastRoundEvt && lastRoundEvt.surprise === 'bee' && e.first) { /* said when it lands */ }
        break;
      }
      case 'grab': {
        CK.Audio.play('pick');
        sayName(line('sayTap', e, null), performance.now());
        break;
      }
      case 'tapPiece': {
        CK.Audio.play('hop');
        if (!e.assist) sayName(line('sayTap', e, null), performance.now());
        break;
      }
      case 'drop': CK.Audio.play('drop'); break;
      case 'miss': {
        CK.Audio.play('miss');
        const nm = performance.now();
        if (nm - lastMissSay > 6000 && hasKey('miss')) { lastMissSay = nm; speak(T('miss'), { interrupt: canInterrupt() }); }
        break;
      }
      case 'land': {
        CK.Audio.play('flump', { i: e.n || 1 }); if ((e.impact || 0) > 0.25) CK.Audio.play('wobble');
        render.burst('land', e.x, e.y, {});
        break;
      }
      case 'stack': {
        stats.correct++;
        promptUntil = 0; pendingPrompt = null;
        render.burst('pop', e.x, e.y - (L.LH || 97) * 0.5, { size: L.S || 124, color: e.block && e.block.kind === 'color' ? e.block.color : null });
        if (world.koko) { world.koko.mood = 'happy'; world.koko.moodT = 1.1; }
        const last = world.tower && e.n >= (world.tower.n || 99);
        if (last && CK.I18N.sayTowerDone) speak(CK.I18N.sayTowerDone(curLang(), e.n), { interrupt: true });   // one line: count + cherry
        else speak(line('sayStack', e, 'praise'), { interrupt: true });
        break;
      }
      case 'wrong': {
        stats.wrong++;
        CK.Audio.play('boing');
        render.burst('wrong', e.x, e.y, { size: (L.LW || 161) * 0.8 });
        if (world.koko) { world.koko.mood = 'oops'; world.koko.moodT = 1.0; }
        const nowW = performance.now();
        if (nowW - lastWrongSay > 1500) { lastWrongSay = nowW; speak(line('sayWrong', e, 'hint'), { interrupt: canInterrupt() }); }
        break;
      }
      case 'locked': { const nl = performance.now(); if (nl - lastBoop > 400) { lastBoop = nl; CK.Audio.play('boop'); } break; }
      case 'hint': {
        CK.Audio.play('hint');
        render.burst('hint', e.x, e.y, { size: L.LW || 161 });
        if (!e.idle) speak(T('hint'));
        break;
      }
      case 'idle':
        if (++idleSaid <= 4) speak(T('idle') + ' ' + currentPrompt());   // then stay quiet: maybe nobody is there
        else if (idleSaid >= 5 && !bot) pause();   // ≈ 2 min without a grab: nobody is playing — pause
        break;
      case 'pokeKoko': if (performance.now() - promptStart > 3000 && !pendingPrompt) repeatPrompt(); else if (world.koko) { world.koko.mood = 'happy'; world.koko.moodT = 0.6; } break;
      case 'stillDrag': { const sl = T('stillDrag'); if (sl && sl !== 'stillDrag') { CK.UI.say(sl); speak(sl, { interrupt: canInterrupt() }); } break; }
      case 'towerDone': {
        CK.Audio.play('round');
        const t = CK.I18N.sayTowerDone ? CK.I18N.sayTowerDone(curLang(), e.n) : T('towerDone'); if (t) CK.UI.say(t);
        if (world.koko) { world.koko.mood = 'cheer'; world.koko.moodT = 3; }
        break;
      }
      case 'count': {
        CK.Audio.play('count', { i: e.i });
        if (e.cx != null) { CK.Audio.play('candle'); render.burst('flame', e.cx, e.cy - 30, {}); }
        render.burst('count', e.x + (L.LW || 161) * 0.75, e.y, { n: e.i });
        break;
      }
      case 'cherry': CK.Audio.play('drop'); render.burst('land', e.x, e.y + 30, {}); break;
      case 'cherryOn': CK.Audio.play('plop'); render.burst('sparkles', e.x, e.y - 80); break;
      case 'fadeWrong': CK.Audio.play('puffOut'); for (const id of e.pieces || []) { const p = world.pieceById && world.pieceById(id); if (p) render.burst('land', p.x, p.y + 20, {}); } break;
      case 'blow': {
        CK.Audio.play('blow');
        render.burst('breath', e.x, e.y, { tx: e.tx, ty: e.ty });
        if (world.koko) { world.koko.mood = 'blow'; world.koko.moodT = 0.9; }
        // no spoken line here: the blow sound + animation carry it (a TTS "fffff" arrived 2 s late — playtest P2-2)
        break;
      }
      case 'candlesOut': { CK.Audio.play('puffOut'); const n = e.n || 3; render.burst('smoke', e.x, e.y, { n, gap: (L.LW || 161) * 0.7 / Math.max(1, n - 1) }); break; }
      case 'sprinkles':
        CK.Audio.play('sparkle'); CK.Audio.play('collect', { i: 3 });
        if (weather.burst) weather.burst(e.x, e.y, { kind: 'sprinkles', n: 40 });
        if (world.koko) { world.koko.mood = 'cheer'; world.koko.moodT = 1.4; }
        { const gr = T('great'); if (gr && gr !== 'great') speak(gr); }   // praise with the child's name at every finished cake
        break;
      case 'roundDone': {
        const n = e.stars || 1, fx = e.x || (world.tower ? world.tower.x : view.W / 2), fy = e.y || (L.goalY || view.H / 3);
        for (let i = 0; i < n; i++) {
          render.burst('star', fx, fy, { delay: 0.15 + i * 0.22, onDone: () => { shownStars++; CK.UI.setStars(shownStars, true); CK.Audio.play('star', { i }); } });
        }
        CK.UI.setDots(world.roundsPerLevel || 4, ((e.round != null ? e.round : world.round) % (world.roundsPerLevel || 4)) + 1);
        break;
      }
      case 'clearBlock': CK.Audio.play('hop'); render.burst('rustle', e.x, e.y, { n: 5, size: L.LW || 161 }); break;
      case 'gust': {
        CK.Audio.play('gust');
        if (world.koko) { world.koko.mood = 'hold'; world.koko.moodT = 1.8; }
        const gl = T('gust'); if (gl && gl !== 'gust') speak(gl, { interrupt: canInterrupt() });
        break;
      }
      case 'bee': {
        CK.Audio.play('buzz');
        const bl = T('bee'); if (bl && bl !== 'bee') speak(bl, { interrupt: canInterrupt() });
        break;
      }
      case 'beeTap': {
        CK.Audio.play('sparkle'); CK.Audio.play('buzz');
        render.burst('sparkles', e.x, e.y);
        speak(T('bee.tap'), { interrupt: canInterrupt() });
        break;
      }
      case 'talk': CK.UI.say(''); CK.UI.setDots(world.roundsPerLevel || 4, world.roundsPerLevel || 4); openTalk(e.talk || world.talk); break;
      case 'talkAsk': {   // no answer yet: ask again, and after the 2nd re-ask glow the right answer
        const tk = e.talk || world.talk;
        if (tk && e.n <= 3) speak(T(tk.promptKey, tk.params || {}), { priority: true });   // stop talking to an empty room
        if (e.n >= 4 && !bot) { pause(); break; }
        if (tk && (e.n >= 2 || tk.glowAnswer || e.glowAnswer)) CK.UI.glowTalk(tk.answerId);
        break;
      }
      case 'talkResult': {
        stats.talks++; if (e.correct) stats.talkRight++;
        CK.UI.markTalk(e.choiceId, e.answerId);
        const ans = (world.talk && world.talk.choices.find(c => c.id === e.answerId)) || {};
        if (e.correct) {
          CK.Audio.play('talkRight');
          render.burst('star', view.W / 2, view.H / 2, { onDone: () => { shownStars++; CK.UI.setStars(shownStars, true); CK.Audio.play('star'); } });
          speak(T('talk.right'), { interrupt: true });
        } else {
          CK.Audio.play('wrong');
          speak(CK.I18N.talkWrong ? CK.I18N.talkWrong(curLang(), ans.kind, ans.value) : T('talk.wrong', { answer: NAME(ans.kind, ans.value) }), { interrupt: true });
        }
        break;
      }
      case 'levelDone':
        CK.Audio.play('level'); CK.UI.say('');
        if (mode === 'talk') { mode = 'play'; CK.UI.only(); }
        break;
      case 'sessionDone': {
        CK.Audio.play('fanfare');
        weather.setWeather(3, {});                 // the rainbow party
        if (weather.party) weather.party(true);
        render.burst('confetti', 0, 0);
        progress.totalStars += e.stars || 0; progress.sessions++;
        CK.Storage.setJSON('progress', progress);
        shownStars = e.stars || shownStars; CK.UI.setStars(shownStars);
        $('doneStars').textContent = e.stars || 0;
        $('doneTitle').textContent = T('session.done', { stars: e.stars || 0 });
        const party = T('party'); if (party && party !== 'party') speak(party, { interrupt: true });
        speak(T('session.done', { stars: e.stars || 0 }));
        mode = 'done';
        CK.UI.only('scrDone'); CK.UI.show('hud', false); CK.UI.say('');
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
    const canMic = S.mic && CK.Voice && CK.Voice.canListen && CK.Voice.canListen() && !FLAGS.bot;
    CK.UI.openTalk(talk, curLang(), id => { CK.Audio.play('click'); world.talkAnswer(id); }, canMic, curAge());
    const q = T(talk.promptKey, talk.params || {});
    speakPrompt(T('talk.intro') + ' ' + q, { priority: true });   // queued after the round's praise, not cutting it off
  }
  function listen() {
    const talk = world.talk;
    if (!talk || world.state !== 'talk' || !CK.Voice || !CK.Voice.canListen()) return;
    if (CK.Voice.stop) CK.Voice.stop();
    CK.Audio.play('listen');
    CK.UI.setListening(true, T('ui.listening'));
    const choices = talk.choices.map(c => ({ id: c.id, words: CK.I18N.words(curLang(), c.kind, c.value) }));
    CK.Voice.listen({ lang: curLang(), choices, timeoutMs: 6000 }).then(res => {
      CK.UI.setListening(false, T('ui.tapOrSay'));
      if (world.state !== 'talk') return;
      if (res && res.id != null) world.talkAnswer(res.id);
      else if (res && res.reason === 'not-allowed') { $('btnMic').classList.add('hidden'); speak(T('ui.micDenied')); }
      else speak(T('ui.tapOrSay'));
    }).catch(() => CK.UI.setListening(false, T('ui.tapOrSay')));
  }

  let boxCache = null, boxT = 0;
  function domBoxes() {   // logo and done-panel rects in logical px (the title tower and the done scene avoid them)
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
      if (world.setBreeze) world.setBreeze((weather.ambient && weather.ambient.wind) || 0);
      while (left > 1e-6) {
        const step = Math.min(left, 1 / 30);
        if (bot && (mode === 'play' || mode === 'talk')) bot.step(step);
        world.update(step);
        handleEvents();
        left -= step;
      }
    }
    weather.update(dt * Math.min(speed, 4), {});
    const speaking = CK.Voice && CK.Voice.isSpeaking ? CK.Voice.isSpeaking() : false;
    CK.Audio.duck(speaking);
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
    world.pointerDown(p.x, p.y);   // layers, Koko (repeat), the bee
  }
  function repeatPrompt() {
    if (!lastAsk || world.state !== 'round') return;
    CK.Audio.play('click');
    if (world.koko) { world.koko.mood = 'think'; world.koko.moodT = 1.2; }
    const cp = currentPrompt(); promptUntil = 0; speakPrompt(cp, { interrupt: true });
  }

  function bindUI() {
    CK.Input.kidProof();
    CK.Input.attach($('game'), {
      toLogical,
      down: (x, y) => onDown({ x, y }),       // CK.Input calls handlers with (x, y, ev) in logical px
      move: (x, y) => { if (mode === 'play' && !bot) world.pointerMove(x, y); },
      up: (x, y) => { if (mode === 'play' && !bot) world.pointerUp(x, y); },
      cancel: () => { if (world.cancelDrag) world.cancelDrag(); }
    });
    const unlock = () => { CK.Audio.unlock(); if (CK.Voice) CK.Voice.unlock(); };
    ['touchend', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { capture: true, passive: true }));

    $('btnPlay').addEventListener('click', () => { CK.Audio.play('click'); startGame(); });
    $('bubble').addEventListener('click', repeatPrompt);
    $('btnPause').addEventListener('click', () => { CK.Audio.play('click'); pause(); });
    $('btnResume').addEventListener('click', () => { CK.Audio.play('click'); resume(); });
    $('btnHome').addEventListener('click', () => { CK.Audio.play('click'); goTitle(); });
    $('btnAgain').addEventListener('click', () => { CK.Audio.play('click'); startGame(); });
    $('btnDoneHome').addEventListener('click', () => { CK.Audio.play('click'); goTitle(); });
    $('btnMic').addEventListener('click', listen);
    // volume: settings slider + big − / + in the pause menu
    $('optVolume').addEventListener('input', () => { S.volume = +$('optVolume').value / 100; saveSettings(); applyAudio(); });
    $('optVolume').addEventListener('change', () => CK.Audio.play('pop'));
    const step = d => { S.volume = Math.max(0, Math.min(1, Math.round(((S.volume == null ? 1 : S.volume) + d) * 10) / 10)); saveSettings(); applyAudio(); CK.Audio.play('pop'); };
    $('btnVolDown').addEventListener('click', () => step(-0.1));
    $('btnVolUp').addEventListener('click', () => step(0.1));
    document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => {
      S.lang = b.dataset.lang; langOverride = null; saveSettings(); CK.UI.applyLang(curLang()); applyAudio(); CK.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
      updateVoiceInfo();
      CK.Audio.play('click');
      if (mode === 'title') speak(T('ui.welcome'), { interrupt: true });
    }));
    // parent gate: hold the gear for 2 s
    const gear = $('btnParents');
    CK.Input.holdButton(gear, 2000, () => { gear.style.setProperty('--p', 0); openSettings(); },
      p => { gear.style.setProperty('--p', p); gear.classList.toggle('holding', p > 0); });
    gear.addEventListener('click', () => { gear.classList.add('tip'); setTimeout(() => gear.classList.remove('tip'), 1600); });
    CK.UI.bindSettings(S, k => {
      saveSettings();
      if (k === 'sfx' || k === 'music' || k === 'voice') applyAudio();
      if (k === 'age') { ageOverride = null; CK.UI.setTitleInfo(progress.totalStars, curAge(), curLang()); }
      if (k === 'name' && CK.I18N.setChild) CK.I18N.setChild(S.name);
    }, curAge);
    $('btnSettingsDone').addEventListener('click', () => { CK.Audio.play('click'); CK.UI.only('scrTitle'); CK.UI.setTitleInfo(progress.totalStars, curAge(), curLang()); });

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(applySize, 250));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { pause(); CK.Audio.suspend(); if (CK.Voice) CK.Voice.stop(); }
      else CK.Audio.resume();
    });
    window.addEventListener('blur', () => { if (world && world.cancelDrag) world.cancelDrag(); });
  }
  function openSettings() {
    CK.Audio.play('click');
    CK.UI.refreshSettings();
    updateVoiceInfo();
    CK.UI.only('scrSettings');
  }
  function updateVoiceInfo() {
    if (!CK.Voice) return;
    const has = CK.Voice.hasVoice ? CK.Voice.hasVoice(curLang()) : false;
    const nm = CK.Voice.voiceName ? CK.Voice.voiceName() : '';
    const mic = CK.Voice.canListen && CK.Voice.canListen();
    const v = has ? (curLang() === 'vi' ? 'Giọng đọc: ' : 'Voice: ') + (nm || '✓') : (curLang() === 'vi' ? 'Máy chưa có giọng tiếng Việt — vào Cài đặt › Trợ năng › Nội dung được đọc để tải giọng.' : 'No voice for this language on this device yet.');
    const m = mic ? '' : ' · ' + T('ui.micUnsupported');
    CK.UI.setVoiceInfo(v + m);
  }

  /* ---------- test hooks ---------- */
  function hooks() {
    const prev = CK.debug || {};
    CK.debug = prev;
    Object.defineProperties(prev, Object.getOwnPropertyDescriptors({
      get world() { return world; }, get weather() { return weather; }, get mode() { return mode; }, stats,
      voiceLog: (CK.Voice && CK.Voice.log) || prev.voiceLog || [],
      getState() {
        return { mode, state: world.state, level: world.level, topic: world.topic, round: world.round, stars: world.stars,
          phase: world.phase, ask: world.ask, pieces: (world.pieces || []).length, tower: world.tower ? world.tower.blocks.length : 0, W: view.W, H: view.H, ins: view.ins, settings: Object.assign({}, S), speed };
      },
      setSpeed(n) { speed = Math.max(0.1, +n || 1); applyAudio(); },
      startGame, goTitle,
      setBot(on, skill) { bot = on ? new CK.Bot(world, { skill: skill == null ? FLAGS.botSkill : skill, seed: 7 }) : null; },
      setAutoRestart(on) { autoRestart = !!on; },
      gotoLevel(i) { world.startLevel(i); },
      get bot() { return bot; }, view: () => view, render: () => render,
      pieceScreen(id) {
        const b = world.pieceHit ? world.pieceHit(id) : null; if (!b) return null;
        return { x: view.left + b.x * view.s, y: view.top + b.y * view.s, w: b.w * view.s, h: b.h * view.s };
      },
      dropScreen() { const p = world.dropPoint ? world.dropPoint() : null; return p ? { x: view.left + p.x * view.s, y: view.top + p.y * view.s } : null; },
      beeScreen() { const b = world.beePos ? world.beePos() : (world.bee ? { x: world.bee.x, y: world.bee.y } : null); return b ? { x: view.left + b.x * view.s, y: view.top + b.y * view.s } : null; },
      kokoScreen() {
        const b = world.kokoHit ? world.kokoHit() : null; if (!b) return null;
        return { x: view.left + b.x * view.s, y: view.top + b.y * view.s, w: b.w * view.s, h: b.h * view.s };
      },
      answerId() { return world.answerId ? world.answerId() : null; },
      toScreen(x, y) { return { x: view.left + x * view.s, y: view.top + y * view.s }; },
      audio: () => CK.Audio
    }));
  }

  /* ---------- boot ---------- */
  async function boot() {
    await CK.Storage.init();
    S = Object.assign({}, DEF, CK.Storage.getJSON('settings', {}));
    Object.assign(progress, CK.Storage.getJSON('progress', {}));
    CK.UI.applyLang(curLang());
    if (CK.I18N && CK.I18N.setChild) CK.I18N.setChild(S.name);
    if (CK.Voice) { CK.Voice.init({ lang: curLang(), enabled: voiceOn() }); const prevStart = CK.Voice.onStart; CK.Voice.onStart = d => { onVoiceStart(d); if (prevStart) prevStart(d); }; }
    render = new CK.Renderer($('game')); CK.render = render;
    world = new CK.World({ seed: FLAGS.seed != null ? FLAGS.seed : (Date.now() & 0x7fffffff), age: FLAGS.age || S.age, lang: curLang() });
    weather = new CK.Weather({ width: 960, height: 720, seed: 11 });
    hooks();
    bindUI();
    applySize();
    weather.setWeather(0, { instant: true });
    await CK.Assets.load();
    render.prewarm(world.layout, 0);
    applyAudio();
    if (FLAGS.bot) bot = new CK.Bot(world, { skill: FLAGS.botSkill, seed: 7 });
    CK.UI.only('scrTitle');
    CK.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
    mode = 'title';
    requestAnimationFrame(frame);
    if (FLAGS.autostart) startGame();
    if (CK.Voice && CK.Voice.onVoicesChanged) CK.Voice.onVoicesChanged(updateVoiceInfo);
  }
  window.addEventListener('DOMContentLoaded', () => boot().catch(e => { console.error(e); }));
})(window.CK = window.CK || {});
