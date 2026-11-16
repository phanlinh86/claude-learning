/* FT main (Moka's Fairy Tea Party) — boots the game, sizes the canvas for any phone / tablet shape, runs the loop and turns
 * world events (tea things float down on fluff and land, the odd one is tapped, the fairy lifts it into the garland and it
 * lights a lantern, berries are counted, the friends ring a chime wave, Moka raises his cup "Cheers!", a fairy-dust puff
 * clears the table) into voice, sound, effects and UI, following the event → line table in docs/VOICE.md §2 (prompts
 * protected, the count run never cut, praise / cheers / lantern lines queued and droppable, hints priority).
 * Touches reach the world only through FT.Input (two numbers in logical px; HUD / bubble / menus never reach the canvas). */
(function (FT) {
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
  const T1 = (key, p) => (FT.I18N ? FT.I18N.t(curLang(), key, Object.assign({ child: S.name || '' }, p || {})) : key);
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
  const saveSettings = () => FT.Storage.setJSON('settings', S);
  const progress = { totalStars: 0, sessions: 0 };

  let world, weather, render, bot = null, inputCancel = null;
  let mode = 'loading';            // loading | title | play | paused | talk | done
  let speed = FLAGS.speed, autoRestart = FLAGS.autorestart;
  let view = { W: 960, H: 720, s: 1, left: 0, top: 0, ins: { top: 0, right: 0, bottom: 0, left: 0 } };
  const stats = { sessions: 0, rounds: 0, falls: 0, lands: 0, correct: 0, wrong: 0, wiggles: 0, soft: 0, hints: 0, assists: 0, counts: 0,
    rises: 0, lanterns: 0, lanternAuto: 0, chimes: 0, cheers: 0, poofs: 0, garlands: 0, talks: 0, talkRight: 0, critters: 0, critterTaps: 0,
    pokes: 0, frames: 0, slowFrames: 0 };
  const eventLog = [];             // the last 300 world events (type + id), for the e2e tests
  let promptUntil = 0, lastWrongSay = -1e9, idleSaid = 0, shownStars = 0, lastPraise = -1e9, lastCritterSay = -1e9;
  let pendingStars = 0, sessionLanterns = [];
  let inputBlockUntil = 0;         // canvas presses right after Resume / Play / Play again are ignored (a double tap falls through)
  let lastRight = null;            // the right answer's line + thing: re-said (short) when a pause cut it during the rise
  let roundMissed = false, hintBySay = false, dustT = 0;
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
  function applyTable() {
    const L = world.layout; if (!L) return;
    weather.resize(view.W, view.H, L.groundY, L.table.y);
    weather.setTable(L.table.plankX0, L.table.plankX1, L.table.y);
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
    world.setViewport(view.W, view.H, view.ins);    // table, slots, garland, Moka re-laid; things re-target their slots
    applyTable();
    placeBubble();
    updateHudStarTarget();
  }
  function placeBubble() {
    const B = world.layout && world.layout.bubble;
    if (!B) return;
    const r = { x: view.left + B.x * view.s, y: view.top + B.y * view.s, w: B.w * view.s, h: B.h * view.s };
    FT.UI.placeBubble(r);
  }
  function updateHudStarTarget() {
    const p = FT.UI.hudStarPoint();
    if (p.x || p.y) render.hudStar = { x: (p.x - view.left) / view.s, y: (p.y - view.top) / view.s };
  }
  let resizeT = 0;
  function onResize() { clearTimeout(resizeT); resizeT = setTimeout(applySize, 120); }

  /* ---------- voice ---------- */
  const voiceOn = () => S.voice && !FLAGS.novoice && speed <= 1.01 && !FLAGS.mute;
  function speak(text, opt) {
    if (!text) return null;
    lastSpoken = text;
    return FT.Voice ? FT.Voice.say(text, opt || {}) : null;
  }
  const speaking = () => !!(FT.Voice && FT.Voice.isSpeaking && FT.Voice.isSpeaking());
  function applyAudio() {
    const vol = S.volume == null ? 1 : S.volume;
    FT.Audio.setOptions({ sfx: S.sfx, music: S.music, muted: FLAGS.mute, volume: vol });
    if (FT.Voice) { FT.Voice.setLang(curLang()); FT.Voice.setEnabled(voiceOn()); if (FT.Voice.setVolume) FT.Voice.setVolume(vol); if (FT.Voice.setSpeed) FT.Voice.setSpeed(speed); }
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
    // the line ended (or was dropped / failed) without ever starting: lift the guard so a Moka tap repeats it
    if (p && p.then) p.then(() => { if (pendingPrompt === txt) { pendingPrompt = null; promptUntil = Math.min(promptUntil, performance.now() + 300); } }, () => {});
    if (!voiceOn()) { pendingPrompt = null; promptUntil = performance.now() + lineMs(txt); }
  }
  function onVoiceStart(display) {
    if (pendingPrompt && display === pendingPrompt) { promptStart = performance.now(); promptUntil = promptStart + lineMs(display); pendingPrompt = null; }
  }
  const canInterrupt = () => performance.now() > promptUntil;
  /** feedback (right / wrong) interrupts — but never the prompt while it is protected (then it queues) */
  const feedback = txt => speak(txt, { interrupt: canInterrupt() });
  /** the wrong line carries the goal ("… which one isn't red?"): protect it like a prompt */
  const protect = txt => { if (txt) promptUntil = Math.max(promptUntil, performance.now() + lineMs(txt)); };

  /* ---------- game flow ---------- */
  function startGame() {
    FT.Audio.unlock();
    world.setAge(curAge()); world.setLang(curLang());
    world.lastTopics = FT.Storage.getJSON('lastTopics', null);   // chapters rotate between sessions
    world.newSession({ lastTopics: world.lastTopics });
    if (world.levels) FT.Storage.setJSON('lastTopics', world.levels);
    if (FLAGS.level != null) world.startLevel(Math.max(0, Math.min(3, FLAGS.level | 0)));
    shownStars = 0; pendingStars = 0; FT.UI.setStars(0); lastAsk = null; lastPromptText = ''; sessionLanterns = []; lastRight = null;
    blockInput();
    render.clearGallery();
    if (weather.party) weather.party(false);
    mode = 'play';
    $('stage').classList.remove('talking');
    FT.UI.only(); FT.UI.show('hud'); FT.UI.say('');
    FT.Audio.setMood(world.level || 0); FT.Audio.startMusic(); FT.Audio.setFanfare(false);
    applyAudio();
    stats.sessions++;
    requestAnimationFrame(() => { updateHudStarTarget(); applySize(); });
  }
  function goTitle() {
    mode = 'title';
    $('stage').classList.remove('talking');
    if (FT.Voice) FT.Voice.stop();
    if (inputCancel && inputCancel.cancel) inputCancel.cancel();
    if (world.cancelDrag) world.cancelDrag();
    FT.Audio.stopMusic();
    FT.UI.only('scrTitle'); FT.UI.show('hud', false); FT.UI.say('');
    FT.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
    weather.setWeather(0, {}); if (weather.party) weather.party(false);
  }
  function pause() {
    if (mode !== 'play' && mode !== 'talk') return;
    mode = 'paused';
    if (inputCancel && inputCancel.cancel) inputCancel.cancel();
    if (world.cancelDrag) world.cancelDrag();
    if (FT.Voice) { FT.Voice.stop(); if (FT.Voice.stopListening) FT.Voice.stopListening(); }
    FT.Audio.stopMusic();
    FT.UI.only('scrPause');
  }
  function resume() {
    if (mode !== 'paused') return;
    mode = world.state === 'talk' ? 'talk' : 'play';
    blockInput();
    idleSaid = 0;   // a returning child gets the nudges again before the next auto-pause
    if (world.resetNudges) world.resetNudges();
    FT.UI.only(mode === 'talk' ? 'scrTalk' : undefined);
    FT.Audio.startMusic();
    // say the question again so a returning child knows what to do
    if (mode === 'talk' && world.talk && !world.talkAnswered) speak(T(world.talk.promptKey, world.talk.params || {}), { priority: true });
    else if (world.interactive) setTimeout(repeatPrompt, 300);
    else if (world.state === 'round' && world.phase === 'rise' && lastRight) {
      // the pause cut the right line: say it again (a count run → just the plate's name, the berries are being counted)
      const t = lastRight.count ? lastRight.name : lastRight.text;
      if (t) { FT.UI.say(t); speak(t, { priority: true }); }
    }
  }

  let lastPromptText = '', lastAsk = null, lastRound = null;
  function currentPrompt() {   // prompts have several wordings: repeat the one Moka said, word for word
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
    const I = FT.I18N;
    if (I && typeof I[fn] === 'function') { try { const t = I[fn](curLang(), e); if (t) return t; } catch (err) { /* fall back */ } }
    return fallbackKey ? T(fallbackKey) : '';
  }
  function mokaMood(m, t) { if (world.moka) { world.moka.mood = m; world.moka.moodT = t; } }
  function askText(e) {
    const I = FT.I18N;
    if (I && I.ask) { try { return I.ask(curLang(), e.promptKey, Object.assign({ child: S.name || '' }, e.params || {}), { first: !!e.first }); } catch (err) { /* fall back */ } }
    return T(e.promptKey, e.params || {});
  }
  function flyStars(n, x, y) {
    for (let i = 0; i < n; i++) {
      render.burst('star', x + (i - (n - 1) / 2) * 60, y, { delay: 0.1 + i * 0.2, onDone: () => { shownStars++; FT.UI.setStars(shownStars, true); FT.Audio.play('star', { i }); } });
    }
  }
  function flushStars() {   // the round's stars never wait for a cheers that will not come (rotation, skip): fly them now
    if (pendingStars > 0) { const c = world.layout.moka.cupUp; flyStars(pendingStars, c.x, c.y); pendingStars = 0; }
  }

  function onEvent(e) {
    const L = world.layout;
    switch (e.type) {
      case 'level': {
        const wi = (e.weather != null ? e.weather : e.level) % 4;
        weather.setWeather(wi, {});
        FT.Audio.setMood(wi); FT.Audio.play('chapter');
        FT.UI.setDots(world.roundsPerLevel || 4, 0);
        speak(T('ui.chapter', { n: e.level + 1 }) + '. ' + T('topic.' + e.topic), { interrupt: true });
        speak(T('weather.' + wi));   // queued after the chapter name ("Pitter-patter, it's raining!")
        FT.UI.say('');   // the chapter banner shows the topic
        render.prewarm(world.layout, wi, world.age);
        break;
      }
      case 'round': {
        flushStars();
        FT.UI.fadeBubble(false); FT.Audio.setFanfare(false);
        stats.rounds++; idleSaid = 0; lastAsk = null; lastPromptText = '';
        FT.UI.setDots(world.roundsPerLevel || 4, e.round % (world.roundsPerLevel || 4));
        FT.UI.say(T('enter'));   // shown, not spoken: the prompt follows in a moment
        applyTable();
        break;
      }
      case 'fall': stats.falls++; FT.Audio.play('whoosh'); break;
      case 'land': {
        stats.lands++;
        FT.Audio.play('plop', { kind: e.kind });
        render.burst('puff', e.x, (L ? L.table.y : e.y) - 2, { n: 6 });
        break;
      }
      case 'ask': {
        lastAsk = e; idleSaid = 0; FT.UI.fadeBubble(false); roundMissed = false; hintBySay = false;
        // the long "…but one!" form only in a chapter's first round; later rounds use the short wordings
        const txt = askText(Object.assign({}, e, { first: !!e.first && e.round === 0 }));
        lastPromptText = txt;
        FT.UI.say(txt); speakPrompt(txt, { priority: true });
        break;
      }
      case 'right': {
        stats.correct++;
        promptUntil = 0; pendingPrompt = null;
        const th = e.thing || {};
        FT.Audio.play('right');
        render.burst('sparkles', e.x, e.y, { n: 16, color: th.color, gold: !th.color });
        // ONE line: "The blue cup! It's not red." / the count run for plates / "The penguin lives on the ice."
        const txt = line('sayRight', ev2(e), 'praise');
        const isCount = th.kind === 'plate' || !!e.count;
        let nm = ''; try { nm = FT.I18N.sayName(curLang(), th) || ''; } catch (err) { nm = ''; }
        lastRight = { text: txt, count: isCount, name: nm ? nm.charAt(0).toUpperCase() + nm.slice(1) + '!' : txt };
        if (isCount) { speak(txt, { interrupt: canInterrupt(), priority: true }); promptUntil = performance.now() + 900 + 650 * ((e.count && e.count.n) || th.n || 1) + lineMs(txt) * 0.3; }
        else { feedback(txt); protect(txt); }
        FT.UI.say(txt);
        break;
      }
      case 'fairyFly': FT.Audio.play('fairy'); break;
      case 'fairyArrive': FT.Audio.play('dust'); break;
      case 'dust': {
        FT.Audio.play('dust');
        const m = memberOf(e.id);
        weather.addDust(e.x, e.y, 6);
        if (m) render.burst('sparkles', e.x, e.y, { n: 4, gold: true, spread: 0.4 });
        break;
      }
      case 'count': {   // one berry lights up: a rising pip + the numeral (the words are the right line's count run)
        stats.counts++;
        FT.Audio.play('pip', { i: e.i });
        render.burst('count', e.x, e.y - 64, { n: e.i });
        break;
      }
      case 'rise': stats.rises++; FT.Audio.play('rise'); FT.UI.fadeBubble(true); break;
      case 'lantern': {
        stats.lanterns++; if (e.auto) stats.lanternAuto++;
        FT.Audio.play('lantern');
        const q = world.garland && world.garland.lanterns[e.i];
        const lx = q ? q.cx : e.x, ly = q ? q.cy : e.y;
        render.burst('sparkles', lx, ly, { n: 14, color: e.color, gold: !e.color, spread: 0.7 });
        render.burst('ring', lx, ly, { size: 120, rgb: '255,236,170', life: 0.5 });
        if (e.thing) { sessionLanterns.push(Object.assign({}, e.thing, { color: e.color || e.thing.color })); if (sessionLanterns.length > 16) sessionLanterns.shift(); }
        // optional line only in the chapter's round 0 or when nothing is speaking — never cuts the right line
        if (!e.auto && (world.round === 0 || !speaking())) speak(T('lantern'));   // queued, droppable
        break;
      }
      case 'roundDone': {
        FT.Audio.play('complete');
        pendingStars += e.stars || 1;   // they fly from Moka's cup at "Cheers!"
        FT.UI.setDots(world.roundsPerLevel || 4, ((e.round != null ? e.round : world.round) % (world.roundsPerLevel || 4)) + 1);
        lastRound = { round: e.round != null ? e.round : world.round, stars: e.stars || 0, missed: roundMissed || (e.misses || 0) > 0 };
        break;   // no line: the right line just said why
      }
      case 'chime': {
        stats.chimes++;
        FT.Audio.play('chime', { i: e.i, n: e.n });
        render.burst('ring', e.x, e.y, { size: 70, rgb: '255,226,140', life: 0.35 });
        break;
      }
      case 'cheers': {
        stats.cheers++;
        const c = L.moka.cupUp;
        FT.Audio.setFanfare(true); FT.Audio.play('cheers');
        setTimeout(() => FT.Audio.setFanfare(false), 1300 / Math.max(1, speed));
        render.burst('clink', c.x, c.y);
        render.burst('sparkles', c.x, c.y, { n: 12, gold: true });
        if (weather.burst) weather.burst(c.x, c.y, { kind: 'stars', n: 6 });
        if (pendingStars > 0) { flyStars(pendingStars, c.x, c.y); pendingStars = 0; }
        // "Cheers!" only if nothing is speaking; ONE praise after a round with a miss or in the chapter's last round, queued
        const lr = lastRound || {}, last = (lr.round % (world.roundsPerLevel || 4)) === (world.roundsPerLevel || 4) - 1;
        if (!speaking() && canInterrupt()) speak(T('cheers'));
        if ((lr.missed || last) && performance.now() - lastPraise > 1200) { lastPraise = performance.now(); speak(T(lr.stars >= 3 ? 'great' : 'praise')); }
        break;
      }
      case 'poof': stats.poofs++; FT.Audio.play('poof'); render.burst('poof', e.x, e.y); break;
      case 'garlandFull': {
        stats.garlands++;
        FT.Audio.play('garland');
        if (weather.burst) weather.burst(e.x, e.y, { kind: 'sparkle', n: 10 });
        speak(T('garland'));
        break;
      }
      case 'wrong': {
        stats.wrong++;
        FT.Audio.play('boop');
        roundMissed = true;
        const now = performance.now();
        if (now - lastWrongSay > 1500) {
          lastWrongSay = now;
          const m = memberOf(e.id), ee = ev2(Object.assign({}, e, { thing: (m && m.thing) || e.thing }));
          // the miss that brings the hint: ONE short line that also points at the glowing one
          const wt = e.hint ? line('sayWrongHint', ee, 'hint') : line('sayWrong', ee, 'hint');
          if (e.hint) hintBySay = true;
          feedback(wt); protect(wt); FT.UI.say(wt);
        }
        break;
      }
      case 'wiggle': stats.wiggles++; FT.Audio.play('wiggle'); break;
      case 'soft': stats.soft++; FT.Audio.play('puff'); break;
      case 'hint': {
        stats.hints++;
        FT.Audio.play('hint');
        // the pointer line was already said with the miss; else (3 soft presses) a priority line, never dropped as stale
        if (!e.idle && !hintBySay) speak(T('hint'), { priority: true });
        hintBySay = false;
        break;
      }
      case 'assistArmed': FT.Audio.play('hint'); break;
      case 'assist': stats.assists++; break;
      case 'idle':
        if (++idleSaid <= 4) speak(T('idle') + ' ' + currentPrompt());   // then stay quiet: maybe nobody is there
        else if (idleSaid >= 5 && !bot) pause();   // ≈ 2 min without a touch: nobody is playing — pause
        break;
      case 'pokeMoka': {
        stats.pokes++;
        FT.Audio.play('giggle');
        // only a question that can still be answered is repeated: during enter / rise / chime Moka just giggles — and never
        // over another line (the count run, the right line), so nothing is cut
        if (e.busy || !world.interactive || !lastAsk) { if (!speaking() && canInterrupt()) speak(T('moka.poke')); break; }
        // never restart the prompt while Moka is still saying it
        if (speaking() && lastSpoken === lastPromptText) break;
        const since = performance.now() - promptStart;
        const stuck = pendingPrompt && since > 6000;   // the prompt never started (no voice / dropped): don't wait forever
        if (since > 3000 && (!pendingPrompt || stuck)) repeatPrompt();
        break;
      }
      case 'critter': {
        stats.critters++;
        FT.Audio.play({ ladybug: 'ladybug', butterfly: 'flutter', snail: 'snail', fairies: 'twinkle' }[e.kind] || 'twinkle');
        if (canInterrupt()) speak(T('surprise.' + e.kind));
        break;
      }
      case 'critterTap': {
        stats.critterTaps++;
        FT.Audio.play({ ladybug: 'ladybugFly', butterfly: 'flutter', snail: 'snail', fairies: 'twinkle' }[e.kind] || 'twinkle');
        render.burst('sparkles', e.x, e.y, { n: 8, gold: e.kind === 'fairies', color: e.kind === 'fairies' ? null : '#FFE7A3' });
        const now = performance.now();
        if (now - lastCritterSay > 2000 && canInterrupt()) { lastCritterSay = now; speak(T('critter.' + e.kind), { interrupt: !speaking() }); }
        break;
      }
      case 'talk': flushStars(); FT.UI.fadeBubble(false); FT.UI.say(''); FT.Audio.setFanfare(false); FT.UI.setDots(world.roundsPerLevel || 4, world.roundsPerLevel || 4); openTalk(e.talk || world.talk); break;
      case 'talkAsk': {   // no answer yet: ask again, and from the 2nd re-ask glow the right answer
        const tk = e.talk || world.talk;
        if (tk && e.n <= 3) speak(T(tk.promptKey, tk.params || {}), { priority: true, interrupt: true });
        if (tk && (e.n >= 2 || e.glowAnswer)) FT.UI.glowTalk(tk.answerId || tk.answer);
        break;
      }
      case 'talkResult': {
        stats.talks++; if (e.correct) stats.talkRight++;
        FT.UI.markTalk(e.choiceId, e.answerId);
        const tk = world.talk, ans = (tk && tk.choices.find(c => c.id === e.answerId)) || {};
        const kind = () => (FT.I18N.talkWrong ? FT.I18N.talkWrong(curLang(), ans, tk) : T('talk.wrong.any'));
        if (e.auto) { speak(kind(), { interrupt: true }); break; }
        if (e.correct) {
          FT.Audio.play('talkRight');
          render.burst('star', view.W / 2, view.H / 2, { onDone: () => { shownStars++; FT.UI.setStars(shownStars, true); FT.Audio.play('star'); } });
          speak(T('talk.right'), { interrupt: true });
        } else {
          FT.Audio.play('soft');
          speak(kind(), { interrupt: true });
        }
        break;
      }
      case 'levelDone':
        flushStars();
        FT.Audio.play('level'); FT.UI.say('');
        if (mode === 'talk') { mode = 'play'; FT.UI.only(); }
        $('stage').classList.remove('talking');
        speak(T('great'));
        break;
      case 'sessionDone': {
        FT.Audio.play('party'); FT.Audio.setFanfare(false);
        if (weather.party) weather.party(true);
        render.setGallery(sessionLanterns.slice());
        render.burst('confetti', 0, 0);
        progress.totalStars += e.stars || 0; progress.sessions++;
        FT.Storage.setJSON('progress', progress);
        shownStars = e.stars || shownStars; FT.UI.setStars(shownStars);
        $('doneStars').textContent = e.stars || 0;
        $('doneTitle').textContent = T('session.done', { stars: e.stars || 0 });
        speak(T('party'), { interrupt: true });
        speak(T('session.done', { stars: e.stars || 0 }));
        mode = 'done';
        FT.UI.only('scrDone'); FT.UI.show('hud', false); FT.UI.say('');
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
    if (inputCancel && inputCancel.cancel) inputCancel.cancel();
    if (world.cancelDrag) world.cancelDrag();
    const canMic = S.mic && FT.Voice && FT.Voice.canListen && FT.Voice.canListen() && !FLAGS.bot;
    FT.UI.openTalk(talk, curLang(), id => { FT.Audio.play('click'); world.talkAnswer(id); }, canMic, curAge());
    const q = T(talk.promptKey, talk.params || {});
    speakPrompt(T('talk.intro') + ' ' + q, { priority: true });   // queued after the round's praise, not cutting it off
  }
  function listen() {
    const talk = world.talk;
    if (!talk || world.state !== 'talk' || !FT.Voice || !FT.Voice.canListen()) return;
    if (FT.Voice.stop) FT.Voice.stop();
    FT.Audio.play('listen');
    FT.UI.setListening(true, T('ui.listening'));
    const choices = talk.choices.map(c => ({ id: c.id, words: FT.I18N.choiceWords ? FT.I18N.choiceWords(curLang(), c) : [] }));
    FT.Voice.listen({ lang: curLang(), choices, timeoutMs: 6000 }).then(res => {
      FT.UI.setListening(false, T('ui.tapOrSay'));
      if (world.state !== 'talk') return;
      if (res && res.id != null) world.talkAnswer(res.id);
      else if (res && res.reason === 'not-allowed') { $('btnMic').classList.add('hidden'); speak(T('ui.micDenied')); }
      else speak(T('ui.tapOrSay'));
    }).catch(() => FT.UI.setListening(false, T('ui.tapOrSay')));
  }

  let boxCache = null, boxT = 0;
  function domBoxes() {   // the title's ▶ and star pill in logical px (the title tea set keeps clear of them)
    const now = performance.now();
    if (boxCache && now - boxT < 500 && boxCache.mode === mode) return boxCache;
    boxT = now;
    const conv = el => { if (!el) return null; const r = el.getBoundingClientRect(); if (!r.width) return null; return { x: (r.left - view.left) / view.s, y: (r.top - view.top) / view.s, w: r.width / view.s, h: r.height / view.s }; };
    boxCache = { mode, title: mode === 'title' ? [conv($('btnPlay')), conv(document.querySelector('.title-info')), conv($('tagline')), conv(document.querySelector('.logo'))].filter(Boolean) : null,
      done: mode === 'done' ? conv(document.querySelector('#scrDone .done-panel')) : null };
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
        world.setBreeze(weather.ambient ? weather.ambient.wind : 0);
        if (bot && (mode === 'play' || mode === 'talk')) bot.step(st);
        world.update(st);
        handleEvents();
        left -= st;
      }
      // a trail of fairy dust while the fairy leads the rising thing up to its lantern
      const f = world.fairy;
      if (f && (f.state === 'lead' || f.state === 'circle') && (dustT -= dt) <= 0) { dustT = 0.09; weather.addDust(f.x, f.y + 12, 1); }
    }
    weather.update(dt * Math.min(speed, 4), {});
    const sp = speaking();
    FT.Audio.duck(sp);
    if (FT.Audio.tick) FT.Audio.tick(dt);
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
    // only while the question can still be answered (never in enter / rise: that would cut the right line / the count run)
    if (!world.interactive || !lastAsk) return;
    FT.Audio.play('click');
    mokaMood('talk', 1.0);
    const cp = currentPrompt(); promptUntil = 0; FT.UI.say(cp); speakPrompt(cp, { interrupt: true });
  }
  function bubbleTap() { if (world.interactive) repeatPrompt(); }

  function bindUI() {
    FT.Input.kidProof();
    // Input passes two NUMBERS in logical px (never a point object) — VOICE §5
    inputCancel = FT.Input.attach($('game'), {
      toLogical,
      down: (x, y) => { if (mode === 'play' && !bot && performance.now() >= inputBlockUntil) world.pointerDown(x, y); },   // judged at once
      move: (x, y) => { if (mode === 'play' && !bot) world.pointerMove(x, y); },   // a slide onto a thing within 0.25 s
      up: (x, y) => { if (mode === 'play' && !bot) world.pointerUp(x, y); },
      cancel: () => { if (world.cancelDrag) world.cancelDrag(); }
    });
    const unlock = () => { FT.Audio.unlock(); if (FT.Voice) FT.Voice.unlock(); };
    ['touchend', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { capture: true, passive: true }));

    $('btnPlay').addEventListener('click', () => { FT.Audio.play('click'); startGame(); });
    $('bubble').addEventListener('click', bubbleTap);
    $('btnPause').addEventListener('click', () => { FT.Audio.play('click'); pause(); });
    $('btnResume').addEventListener('click', () => { FT.Audio.play('click'); resume(); });
    $('btnHome').addEventListener('click', () => { FT.Audio.play('click'); goTitle(); });
    $('btnAgain').addEventListener('click', () => { FT.Audio.play('click'); startGame(); });
    $('btnDoneHome').addEventListener('click', () => { FT.Audio.play('click'); goTitle(); });
    $('btnMic').addEventListener('click', listen);
    // volume: settings slider + big − / + in the pause menu
    $('optVolume').addEventListener('input', () => { S.volume = +$('optVolume').value / 100; saveSettings(); applyAudio(); });
    $('optVolume').addEventListener('change', () => FT.Audio.play('pop'));
    const vstep = d => { S.volume = Math.max(0, Math.min(1, Math.round(((S.volume == null ? 1 : S.volume) + d) * 20) / 20)); saveSettings(); applyAudio(); FT.Audio.play('pop'); };
    $('btnVolDown').addEventListener('click', () => vstep(-0.1));
    $('btnVolUp').addEventListener('click', () => vstep(0.1));
    document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => {
      S.lang = b.dataset.lang; langOverride = null; saveSettings(); FT.UI.applyLang(curLang()); applyAudio(); FT.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
      updateVoiceInfo();
      FT.Audio.play('click');
      if (mode === 'title') speak(T('ui.welcome'), { interrupt: true });
    }));
    // parent gate: hold the gear for 2 s
    const gear = $('btnParents');
    FT.Input.holdButton(gear, 2000, () => { gear.style.setProperty('--p', 0); openSettings(); },
      p => { gear.style.setProperty('--p', p); gear.classList.toggle('holding', p > 0); });
    gear.addEventListener('click', () => { gear.classList.add('tip'); setTimeout(() => gear.classList.remove('tip'), 1600); });
    FT.UI.bindSettings(S, k => {
      saveSettings();
      if (k === 'sfx' || k === 'music' || k === 'voice') applyAudio();
      if (k === 'age') { ageOverride = null; FT.UI.setTitleInfo(progress.totalStars, curAge(), curLang()); }
      if (k === 'name' && FT.I18N.setChild) FT.I18N.setChild(S.name);
    }, curAge);
    $('btnSettingsDone').addEventListener('click', () => { FT.Audio.play('click'); FT.UI.only('scrTitle'); FT.UI.setTitleInfo(progress.totalStars, curAge(), curLang()); });

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(applySize, 250));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (inputCancel && inputCancel.cancel) inputCancel.cancel(); if (world.cancelDrag) world.cancelDrag(); pause(); FT.Audio.suspend(); if (FT.Voice) FT.Voice.stop(); }
      else FT.Audio.resume();
    });
    window.addEventListener('blur', () => { if (world && world.cancelDrag) world.cancelDrag(); });
  }
  function openSettings() {
    FT.Audio.play('click');
    FT.UI.refreshSettings();
    updateVoiceInfo();
    FT.UI.only('scrSettings');
  }
  function updateVoiceInfo() {
    if (!FT.Voice) return;
    const has = FT.Voice.hasVoice ? FT.Voice.hasVoice(curLang()) : false;
    const nm = FT.Voice.voiceName ? FT.Voice.voiceName(curLang()) : '';
    const mic = FT.Voice.canListen && FT.Voice.canListen();
    const v = has ? (curLang() === 'vi' ? 'Giọng đọc: ' : 'Voice: ') + (nm || '✓') : T('ui.voiceMissing');
    const m = mic ? '' : ' · ' + T('ui.micUnsupported');
    FT.UI.setVoiceInfo(v + m);
  }

  /* ---------- test hooks (DESIGN §5.5) — live getters via defineProperties (never Object.assign) ---------- */
  function hooks() {
    const circ = c => (c ? { x: view.left + c.x * view.s, y: view.top + c.y * view.s, r: (c.r || 0) * view.s, kind: c.kind, i: c.i } : null);
    const box = b => (b ? { x: view.left + b.x * view.s, y: view.top + b.y * view.s, w: (b.w || 0) * view.s, h: (b.h || 0) * view.s,
      cx: view.left + (b.cx != null ? b.cx : b.x + b.w / 2) * view.s, cy: view.top + (b.cy != null ? b.cy : b.y + b.h / 2) * view.s } : null);
    const prev = FT.debug || {};
    FT.debug = prev;
    Object.defineProperties(prev, Object.getOwnPropertyDescriptors({
      get world() { return world; }, get weather() { return weather; }, get mode() { return mode; }, stats, events: eventLog,
      get bot() { return bot; },
      get voiceLog() { return (FT.Voice && FT.Voice.log) || []; },
      getState() {
        return { mode, state: world.state, phase: world.phase, level: world.level, topic: world.topic, round: world.round,
          stars: world.stars, misses: world.misses, lit: (world.garland.lanterns || []).filter(q => q.lit > 0.5).length,
          members: (world.members || []).map(m => ({ id: m.id, state: m.state, odd: m.odd, kind: m.thing && m.thing.kind })),
          surprise: world.surprise, critter: world.critter ? world.critter.kind + ':' + world.critter.state : null,
          weather: weather.ambient && weather.ambient.mood, W: view.W, H: view.H, ins: view.ins, settings: Object.assign({}, S), speed };
      },
      setSpeed(n) { speed = Math.max(0.1, +n || 1); applyAudio(); },
      startGame, goTitle,
      setBot(on, skill) { bot = on ? new FT.Bot(world, { skill: skill == null ? FLAGS.botSkill : skill, seed: 7 }) : null; },
      setAutoRestart(on) { autoRestart = !!on; },
      gotoLevel(i) { world.startLevel(i); },
      view: () => view, render: () => render,
      memberScreen(id) { return circ(world.memberHit ? world.memberHit(id) : null); },
      mokaScreen() { return box(world.mokaHit ? world.mokaHit() : null); },
      critterScreen() { return circ(world.critterHit ? world.critterHit() : null); },
      answer() { return world.answer ? world.answer() : null; },
      toScreen(x, y) { return { x: view.left + x * view.s, y: view.top + y * view.s }; },
      audio: () => FT.Audio
    }));
  }

  /* ---------- boot ---------- */
  async function boot() {
    await FT.Storage.init();
    S = Object.assign({}, DEF, FT.Storage.getJSON('settings', {}));
    Object.assign(progress, FT.Storage.getJSON('progress', {}));
    FT.UI.applyLang(curLang());
    if (FT.I18N && FT.I18N.setChild) FT.I18N.setChild(S.name);
    if (FT.Voice) { FT.Voice.init({ lang: curLang(), enabled: voiceOn(), speed }); const prevStart = FT.Voice.onStart; FT.Voice.onStart = d => { onVoiceStart(d); if (prevStart) prevStart(d); }; }
    render = new FT.Renderer($('game')); FT.render = render;
    world = new FT.World({ seed: FLAGS.seed != null ? FLAGS.seed : (Date.now() & 0x7fffffff), age: curAge(), lang: curLang() });
    weather = new FT.Weather({ width: 960, height: 720, seed: 11 });
    hooks();
    bindUI();
    applySize();
    weather.setWeather(0, { instant: true });
    await FT.Assets.load();
    render.prewarm(world.layout, 0, curAge());
    applyAudio();
    if (FLAGS.bot) bot = new FT.Bot(world, { skill: FLAGS.botSkill, seed: 7 });
    FT.UI.only('scrTitle');
    FT.UI.setTitleInfo(progress.totalStars, curAge(), curLang());
    mode = 'title';
    requestAnimationFrame(frame);
    if (FLAGS.autostart) startGame();
    if (FT.Voice && FT.Voice.onVoicesChanged) FT.Voice.onVoicesChanged(updateVoiceInfo);
  }
  window.addEventListener('DOMContentLoaded', () => boot().catch(e => { console.error(e); }));
})(window.FT = window.FT || {});
