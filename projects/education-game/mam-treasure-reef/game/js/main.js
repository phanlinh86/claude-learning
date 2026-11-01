/* TR main (Mầm's Treasure Reef) — boots the game, sizes the canvas for any phone/tablet shape, runs the loop and turns
 * world events into voice, sound, effects and UI. Flow: title → profiles → reef map → lagoon (4 chapters) → lagoon done → map. */
(function (TR) {
  'use strict';
  const $ = id => document.getElementById(id);
  const Q = new URLSearchParams(location.search);
  const qn = (k, d) => (Q.has(k) && !isNaN(+Q.get(k)) ? +Q.get(k) : d);
  const FLAGS = {
    speed: Math.max(0.1, qn('speed', 1)), bot: Q.get('bot') === '1', autostart: Q.get('autostart') === '1',
    autorestart: Q.get('autorestart') === '1', seed: Q.has('seed') ? qn('seed', 1) : null, mute: Q.get('mute') === '1',
    debug: Q.get('debug') === '1', age: Q.has('age') ? qn('age', 4) : null, lang: Q.get('lang'), level: Q.has('level') ? qn('level', 0) : null,
    lagoon: Q.has('lagoon') ? qn('lagoon', 1) : null, novoice: Q.get('novoice') === '1', botSkill: qn('skill', 0.8),
    testProfile: Q.get('profile') === 'test'
  };
  const T = (key, p) => (TR.I18N ? TR.I18N.t(curLang(), key, Object.assign({ child: childName() }, p || {})) : key);
  const NAME = (kind, v) => (TR.I18N ? TR.I18N.name(curLang(), kind, v) : String(v));

  /* ---------- settings (URL flags never saved) ---------- */
  const DEF = { lang: (navigator.language || 'en').toLowerCase().startsWith('vi') ? 'vi' : 'en', sfx: true, music: true, voice: true, mic: true, volume: 100 };
  let S = Object.assign({}, DEF);
  let langOverride = FLAGS.lang === 'vi' || FLAGS.lang === 'en' ? FLAGS.lang : null;
  const curLang = () => langOverride || S.lang;
  const saveSettings = () => TR.Storage.setJSON('settings', S);
  let profile = null;                       // TR.Progress profile being played
  const curAge = () => FLAGS.age || (profile && profile.age) || 4;
  const childName = () => (profile && profile.name) || '';
  let lagoon = 1, lagoonStars = [0, 0, 0, 0], lagoonPearls0 = 0, playT0 = 0;

  let world, weather, render, bot = null;
  let mode = 'loading';            // loading | title | profiles | map | treasure | settings | play | paused | talk | done
  let speed = FLAGS.speed, autoRestart = FLAGS.autorestart;
  let view = { W: 960, H: 720, s: 1, left: 0, top: 0, ins: { top: 0, right: 0, bottom: 0, left: 0 } };
  const stats = { sessions: 0, rounds: 0, correct: 0, wrong: 0, misses: 0, digs: 0, wrongDigs: 0, crabs: 0, talks: 0, talkRight: 0, frames: 0, slowFrames: 0 };
  let idleSaid = 0, lastName = '', firstAsk = true, shownStars = 0, shownPearls = 0, lastRoundEvt = null, missSay = 0, lastGrabSay = 0, lastPraise = 0, editingId = null;

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
    const ins = { top: Math.max(0, sa.top - top) / s, bottom: Math.max(0, sa.bottom - top) / s, left: Math.max(0, sa.left - left) / s, right: Math.max(0, sa.right - left) / s };
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
    if (world && world.cancelDrag && (prev.W !== view.W || prev.H !== view.H)) world.cancelDrag();
    const rs = renderScale();
    const c = $('game');
    c.style.width = view.cssW + 'px'; c.style.height = view.cssH + 'px';
    c.style.left = view.left + 'px'; c.style.top = view.top + 'px';
    render.resize(view.W, view.H, rs);
    world.setViewport(view.W, view.H, view.ins);
    for (const it of world.items || []) {
      if (it.state === 'in' || it.state === 'buried' || it.state === 'peek') continue;
      const m = (it.size || 100) / 2;
      const cx = v => Math.max(m, Math.min(view.W - m, v)), cy = v => Math.max(m, Math.min(view.H - m, v));
      it.x = cx(it.x); it.y = cy(it.y);
      if (it._px != null) { it._px = cx(it._px); it._py = cy(it._py); }
    }
    weather.resize(view.W, view.H);
    placeBubble();
    updateHudTargets();
    if (mode === 'map' && profile) TR.UI.renderMap(profile, pickLagoon, curLang());
  }
  function placeBubble() {
    const B = world.layout && world.layout.bubble;
    if (!B) return;
    const r = { x: view.left + B.x * view.s, y: view.top + B.y * view.s, w: B.w * view.s, h: B.h * view.s };
    const hud = $('hud').getBoundingClientRect();
    if (hud.width > 0 && r.x + r.w > hud.left - 10 && r.y < hud.bottom) {
      const roomRight = hud.left - 12 - r.x;
      if (roomRight >= 360) r.w = roomRight;
      else { r.y = hud.bottom + 8; r.w = Math.min(window.innerWidth - r.x - 12 - view.ins.right * view.s, 560); }
    }
    TR.UI.placeBubble(r);
  }
  function updateHudTargets() {
    const p = TR.UI.hudStarPoint();
    if (p.x || p.y) render.hudStar = { x: (p.x - view.left) / view.s, y: (p.y - view.top) / view.s };
    const q = TR.UI.hudPearlPoint();
    if (q.x || q.y) render.hudPearl = { x: (q.x - view.left) / view.s, y: (q.y - view.top) / view.s };
  }
  let resizeT = 0;
  function onResize() { clearTimeout(resizeT); resizeT = setTimeout(applySize, 120); }

  /* ---------- voice & audio ---------- */
  const voiceOn = () => S.voice && !FLAGS.novoice && speed <= 1.01 && !FLAGS.mute;
  function speak(text, opt) { if (text && TR.Voice) TR.Voice.say(text, opt || {}); }
  function applyAudio() {
    TR.Audio.setOptions({ sfx: S.sfx, music: S.music, muted: FLAGS.mute, volume: S.volume / 100 });
    if (TR.Voice) { TR.Voice.setLang(curLang()); TR.Voice.setEnabled(voiceOn()); if (TR.Voice.setVolume) TR.Voice.setVolume(S.volume / 100); }
  }
  function applyChild() {
    const c = { name: childName(), sayAs: (profile && profile.sayAs) || '' };
    if (TR.I18N && TR.I18N.setChild) TR.I18N.setChild(c);
    if (TR.Voice && TR.Voice.setChild) TR.Voice.setChild(c);
  }
  function promptText(e) { return T(e.promptKey, e.params || {}); }
  function setVolume(v) { S.volume = Math.max(0, Math.min(100, Math.round(v / 5) * 5)); saveSettings(); applyAudio(); if (TR.UI.refreshSettings) TR.UI.refreshSettings(); TR.UI.setVolumeMeter(S.volume); }
  const lagoonName = i => T('lagoon.' + TR.LAGOON_KEYS[i - 1] + '.name');

  /* ---------- flow ---------- */
  function goTitle() {
    mode = 'title';
    if (TR.Voice) TR.Voice.stop();
    TR.Audio.stopMusic();
    TR.UI.only('scrTitle'); TR.UI.show('hud', false); TR.UI.say('');
    TR.UI.setTitleInfo(profile, curLang());
    weather.setWeather(0, {});
  }
  function goProfiles() {
    const list = TR.Progress.list();
    if (list.length === 1) { selectProfile(list[0].id); return; }   // one child: straight to the map
    mode = 'profiles';
    TR.UI.renderProfiles(list, curLang(), selectProfile, false, null);
    TR.UI.only('scrProfiles');
    speak(T('ui.whoPlays'), { interrupt: true });
  }
  function selectProfile(id) {
    TR.Audio.play('click');
    profile = TR.Progress.setCurrent(id) || TR.Progress.current();
    applyChild();
    goMap(true);
  }
  function goMap(greet) {
    if (!profile) { goProfiles(); return; }
    mode = 'map';
    if (TR.Voice) TR.Voice.stop();
    TR.Audio.stopMusic();
    TR.UI.only('scrMap'); TR.UI.show('hud', false); TR.UI.say('');
    TR.UI.renderMap(profile, pickLagoon, curLang());
    weather.setWeather(0, {});
    if (greet) speak(T('ui.hello') + ' ' + T('ui.pickLagoon'), { interrupt: true });
  }
  TR.UI.onLocked = () => { TR.Audio.play('wrong'); speak(T('ui.locked'), { interrupt: true }); };
  function pickLagoon(i) {
    TR.Audio.play('click');
    const rs = profile.resume;
    startLagoon(i, rs && rs.lagoon === i ? rs : null);
  }
  function goTreasure() {
    mode = 'treasure';
    TR.UI.renderTreasure(profile, curLang());
    TR.UI.only('scrTreasure');
    speak(T('ui.treasureIntro', { stars: profile.totalStars || 0 }), { interrupt: true });
  }

  function startLagoon(i, resume) {
    TR.Audio.unlock();
    lagoon = Math.max(1, Math.min(6, i | 0));
    const age = curAge();
    const plan = TR.Content.planFor(age, lagoon);
    world.setAge(age); world.setLang(curLang());
    lagoonStars = resume && resume.levelStars ? resume.levelStars.slice() : [0, 0, 0, 0];
    lagoonPearls0 = profile.pearls || 0;
    const startLevel = resume ? Math.min(3, resume.level | 0) : (FLAGS.level != null ? Math.max(0, Math.min(3, FLAGS.level | 0)) : 0);
    world.newSession({ lagoon, plan, startLevel });
    if (resume) world.stars = lagoonStars.reduce((a, b) => a + b, 0);
    shownStars = world.stars || 0; TR.UI.setStars(shownStars);
    shownPearls = profile.pearls || 0; TR.UI.setPearls(shownPearls);
    mode = 'play';
    TR.UI.only(); TR.UI.show('hud'); TR.UI.say('');
    TR.Audio.setMood(world.level || 0); TR.Audio.startMusic();
    applyAudio();
    stats.sessions++; playT0 = performance.now();
    requestAnimationFrame(() => { updateHudTargets(); placeBubble(); });
  }
  function pause() {
    if (mode !== 'play' && mode !== 'talk') return;
    mode = 'paused';
    if (world.cancelDrag) world.cancelDrag();
    if (TR.Voice) { TR.Voice.stop(); if (TR.Voice.stopListening) TR.Voice.stopListening(); }
    TR.Audio.stopMusic();
    TR.UI.setVolumeMeter(S.volume);
    TR.UI.only('scrPause');
  }
  function resume() {
    if (mode !== 'paused') return;
    mode = world.state === 'talk' ? 'talk' : 'play';
    TR.UI.only(mode === 'talk' ? 'scrTalk' : undefined);
    TR.Audio.startMusic();
  }
  function saveResume() {
    addPlayTime();
    if (profile && world.level != null && world.state !== 'sessionDone') TR.Progress.setResume(profile, { lagoon, level: world.level, levelStars: lagoonStars.slice(), pearls: profile.pearls || 0 });
  }
  function addPlayTime() {
    if (!profile || !playT0) return;
    TR.Progress.addTime(profile, (performance.now() - playT0) / 1000 * Math.min(speed, 1));
    playT0 = performance.now();
  }

  function currentPrompt() {
    const p = world.prompt ? world.prompt() : null;
    return p ? promptText(p) : (lastRoundEvt ? promptText(lastRoundEvt) : '');
  }
  function sayName(txt, now) {
    if (!txt || (TR.Voice && TR.Voice.isSpeaking())) return;
    if (now - lastGrabSay < 700 || (txt === lastName && now - lastGrabSay < 3000)) return;
    lastGrabSay = now; lastName = txt;
    speak(txt);
  }
  function handleEvents() { for (const e of world.drainEvents()) onEvent(e); }
  function basketById(id) { return (world.baskets || []).find(b => b.id === id); }
  function itemById(id) { return (world.items || []).find(i => i.id === id); }
  function moundById(id) { return (world.mounds || []).find(m => m.id === id); }
  const isDig = () => world.cur && world.cur.mode === 'dig';
  const isCount = () => world.cur && (world.cur.mode === 'count' || (world.cur.mode === 'dig' && world.cur.topic === 'count'));

  function onEvent(e) {
    const L = world.layout;
    switch (e.type) {
      case 'level': {
        weather.setWeather(e.level, {});
        TR.Audio.setMood(e.level); TR.Audio.play('chapter');
        TR.UI.setDots(world.roundsPerLevel || 4, 0);
        const intro = e.level === 0 ? T('lagoon.' + TR.LAGOON_KEYS[lagoon - 1] + '.intro') + ' ' : '';
        speak(intro + T('ui.chapter', { n: e.level + 1 }) + '. ' + T('topic.' + e.topic), { interrupt: true });
        TR.UI.say(T('topic.' + e.topic));
        render.prewarm(L);
        break;
      }
      case 'round': {
        lastRoundEvt = e; stats.rounds++; firstAsk = true; idleSaid = 0;
        TR.UI.setDots(world.roundsPerLevel || 4, e.round % (world.roundsPerLevel || 4));
        if (e.mode === 'ask' || (e.mode === 'dig' && e.queued)) break;   // the ask/next event names the first target
        const txt = promptText(e);
        TR.UI.say(txt); speak(txt, { priority: true });
        break;
      }
      case 'ask': case 'next': {
        const full = promptText(e);
        TR.UI.say(full);
        if (firstAsk) speak(full, { priority: true });
        else { if (TR.Voice && TR.Voice.dropQueued) TR.Voice.dropQueued(); speak(e.nextKey ? T(e.nextKey, e.params) : full, {}); }
        firstAsk = false;
        break;
      }
      case 'appear': TR.Audio.play('appear'); break;
      case 'grab': {
        TR.Audio.play('grab');
        if (e.nameKind) sayName(NAME(e.nameKind, e.nameValue), performance.now());
        break;
      }
      case 'drop': TR.Audio.play('whoosh'); break;
      case 'dig': {
        const m = moundById(e.moundId);
        if (e.correct) {
          stats.digs++;
          TR.Audio.play('dig');
          if (m) render.burst('dig', m.x, m.y - (m.h || 90) * 0.5);
          if (Math.random() < 0.5 && !isCount()) speak(T('say.dig'), { interrupt: true });
        } else {
          stats.wrongDigs++;
          TR.Audio.play('peek');
          if (m) render.burst('sink', m.x, m.y - (m.h || 90) * 0.4);
        }
        break;
      }
      case 'crab': {
        stats.crabs++;
        const m = moundById(e.moundId);
        TR.Audio.play('dig'); TR.Audio.play('crab');
        const x = e.x != null ? e.x : (m ? m.x : view.W / 2), y = e.y != null ? e.y : (m ? m.y - (m.h || 90) * 0.6 : view.H / 2);
        render.burst('dig', x, y + 20); render.crab(x, y);
        speak(T('say.crab'), { interrupt: true });
        break;
      }
      case 'photobomb':
        TR.Audio.play('photobomb');
        render.photobomb(e.dir || 1, e.y);
        if (Math.random() < 0.7) speak(T('say.photobomb'));
        break;
      case 'correct': {
        stats.correct++;
        if (isCount()) break;
        const ev = Object.assign({ label: (basketById(e.basketId) || {}).label }, e);
        const now = performance.now();
        if (now - lastPraise < 1200) break;
        lastPraise = now;
        const s1 = TR.I18N.sayCorrect ? TR.I18N.sayCorrect(curLang(), ev) : '';
        speak(s1 && Math.random() < 0.6 ? s1 : T('praise'), { interrupt: true });
        break;
      }
      case 'land': {
        const b = basketById(e.basketId), it = itemById(e.id);
        TR.Audio.play('land');
        if (b) render.burst('land', it ? it.x : b.x, b.y, { size: b.w * 0.8 });
        break;
      }
      case 'sparkle': {
        const b = basketById(e.basketId), it = itemById(e.id);
        TR.Audio.play('sparkle', { count: isCount() ? e.n : 0 });
        if (b) render.burst('sparkle', it ? it.x : b.x, (it ? it.y : b.y) - 20, { size: b.w * 0.6 });
        break;
      }
      case 'count': if (TR.I18N.sayCount) speak(TR.I18N.sayCount(curLang(), e.n, e.need), { interrupt: true }); break;
      case 'pearl': {
        if (!profile) break;
        const d = e.n || 0;
        if (d > 0) TR.Progress.recordChapter(profile, lagoon, world.level || 0, 0, d);   // pearls now; stars at levelDone
        const from = e.x != null ? { x: e.x, y: e.y } : { x: L.tutu.x + 40, y: L.tutu.y - L.tutu.h * 0.5 };
        if (d >= 5) render.burst('pearl', from.x, from.y, { onDone: () => { shownPearls = profile.pearls || 0; TR.UI.setPearls(shownPearls, true); TR.Audio.play('pearl'); } });
        else { shownPearls = profile.pearls || 0; TR.UI.setPearls(shownPearls, false); }
        break;
      }
      case 'wrong': {
        stats.wrong++;
        const b = e.basketId != null ? basketById(e.basketId) : null;
        if (!isDig()) TR.Audio.play('wrong');
        if (b) render.burst('wrong', b.x, b.y, { size: b.w });
        const tb = e.target != null ? basketById(e.target) : null;
        if (isDig() && e.nameKind) speak(TR.I18N.sayWrongDig ? TR.I18N.sayWrongDig(curLang(), e.nameKind, e.nameValue) : T('wrong'), { interrupt: true });
        else speak(TR.I18N.sayWrong ? TR.I18N.sayWrong(curLang(), { label: b && b.label, target: tb && tb.label }) : T('wrong'), { interrupt: true });
        break;
      }
      case 'miss':
        stats.misses++; TR.Audio.play('miss');
        if (++missSay % 2 === 1) speak(T('miss'));
        break;
      case 'hint': {
        const b = e.basketId != null ? basketById(e.basketId) : null, m = e.moundId != null ? moundById(e.moundId) : null;
        TR.Audio.play('hint');
        if (b) render.burst('hint', b.x, b.y); else if (m) render.burst('hint', m.x, m.y - (m.h || 90) * 0.6);
        speak(T('hint'));
        break;
      }
      case 'idle':
        if (++idleSaid <= 4) speak(T('idle') + ' ' + currentPrompt());
        break;
      case 'roundDone': {
        TR.Audio.play('round');
        const n = e.stars || 1, from = L.tutu;
        for (let i = 0; i < n; i++) {
          render.burst('star', from.x + 60, from.y - from.h * 0.6, { delay: i * 0.22, onDone: () => { shownStars++; TR.UI.setStars(shownStars, true); TR.Audio.play('star', { i }); } });
        }
        if (!isCount()) speak(T('great'));
        TR.UI.setDots(world.roundsPerLevel || 4, ((e.round != null ? e.round : world.round) % (world.roundsPerLevel || 4)) + 1);
        break;
      }
      case 'talk': openTalk(e.talk || world.talk); break;
      case 'talkAsk': {
        const tk = e.talk || world.talk;
        if (tk && e.n <= 3) speak(T(tk.promptKey, tk.params || {}), { priority: true });
        if (e.n >= 2 || (tk && tk.glowAnswer)) TR.UI.glowTalk(tk.answerId);
        break;
      }
      case 'tap':
        if (e.nameKind) sayName(NAME(e.nameKind, e.nameValue), performance.now());
        TR.Audio.play('grab');
        break;
      case 'talkResult': {
        stats.talks++; if (e.correct) stats.talkRight++;
        TR.UI.markTalk(e.choiceId, e.answerId);
        const ans = (world.talk && world.talk.choices.find(c => c.id === e.answerId)) || {};
        if (e.correct) {
          TR.Audio.play('talkRight');
          render.burst('star', view.W / 2, view.H / 2, { onDone: () => { shownStars++; TR.UI.setStars(shownStars, true); TR.Audio.play('star'); } });
          speak(T('talk.right'), { interrupt: true });
        } else {
          TR.Audio.play('wrong');
          speak(TR.I18N.talkWrong ? TR.I18N.talkWrong(curLang(), ans.kind, ans.value) : T('talk.wrong', { answer: NAME(ans.kind, ans.value) }), { interrupt: true });
        }
        break;
      }
      case 'levelDone': {
        TR.Audio.play('level');
        if (mode === 'talk') { mode = 'play'; TR.UI.only(); }
        lagoonStars[e.level] = Math.max(lagoonStars[e.level] || 0, e.stars || 0);
        if (profile) {
          TR.Progress.recordChapter(profile, lagoon, e.level, e.stars || 0, 0);
          if (e.level < 3) TR.Progress.setResume(profile, { lagoon, level: e.level + 1, levelStars: lagoonStars.slice(), pearls: profile.pearls || 0 });
        }
        addPlayTime();
        break;
      }
      case 'sessionDone': {
        TR.Audio.play('fanfare');
        render.burst('confetti', 0, 0);
        const stars = e.stars || lagoonStars.reduce((a, b) => a + b, 0);
        const pearls = Math.max(0, (profile.pearls || 0) - lagoonPearls0);
        TR.Progress.recordLagoon(profile, lagoon, e.levelStars || lagoonStars);
        TR.Progress.setResume(profile, null);
        addPlayTime();
        shownStars = stars; TR.UI.setStars(shownStars);
        const trophy = TR.Progress.trophy(profile, lagoon) || 'bronze';
        const hasNext = lagoon < 6;
        TR.UI.showDone(curLang(), { lagoon, stars, pearls, trophy, hasNext });
        TR.UI.show('hud', false); TR.UI.say('');
        speak(T('session.done', { stars }) + ' ' + (hasNext ? T('ui.unlocked', { lagoon: lagoonName(lagoon + 1) }) : T('ui.allDone')), { interrupt: true });
        mode = 'done';
        if (autoRestart) setTimeout(() => { if (mode === 'done') startLagoon(hasNext ? lagoon + 1 : 1, null); }, 1500 / speed);
        break;
      }
    }
  }

  /* ---------- Talk time ---------- */
  function openTalk(talk) {
    if (!talk) return;
    mode = 'talk';
    if (world.cancelDrag) world.cancelDrag();
    const canMic = S.mic && TR.Voice && TR.Voice.canListen && TR.Voice.canListen() && !FLAGS.bot;
    TR.UI.openTalk(talk, curLang(), id => { TR.Audio.play('click'); world.talkAnswer(id); }, canMic, curAge());
    speak(T('talk.intro') + ' ' + T(talk.promptKey, talk.params || {}), { interrupt: true, priority: true });
  }
  function listen() {
    const talk = world.talk;
    if (!talk || world.state !== 'talk' || !TR.Voice || !TR.Voice.canListen()) return;
    if (TR.Voice.stop) TR.Voice.stop();
    TR.Audio.play('listen');
    TR.UI.setListening(true, T('ui.listening'));
    const choices = talk.choices.map(c => ({ id: c.id, words: TR.I18N.words(curLang(), c.kind, c.value) }));
    TR.Voice.listen({ lang: curLang(), choices, timeoutMs: 6000 }).then(res => {
      TR.UI.setListening(false, T('ui.tapOrSay'));
      if (world.state !== 'talk') return;
      if (res && res.id != null) world.talkAnswer(res.id);
      else if (res && res.reason === 'not-allowed') { $('btnMic').classList.add('hidden'); speak(T('ui.micDenied')); }
      else speak(T('ui.tapOrSay'));
    }).catch(() => TR.UI.setListening(false, T('ui.tapOrSay')));
  }

  /* ---------- loop ---------- */
  let last = 0, slowAcc = 0, pendingResize = false;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (document.hidden) { last = ts; return; }
    let dt = last ? (ts - last) / 1000 : 0.016;
    last = ts;
    const raw = dt;
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
    weather.update(dt * Math.min(speed, 4), { groundY: world.layout.groundY });
    const speaking = TR.Voice && TR.Voice.isSpeaking ? TR.Voice.isSpeaking() : false;
    TR.Audio.duck(speaking);
    const titleLike = mode === 'title' || mode === 'loading' || mode === 'profiles' || mode === 'map' || mode === 'treasure' || mode === 'settings';
    render.draw(world, weather, { dt: dt * Math.min(speed, 4), lang: curLang(), title: titleLike, map: mode === 'map' || mode === 'treasure', speaking, done: mode === 'done', compact: window.innerHeight <= 430 && window.innerWidth > window.innerHeight, debug: FLAGS.debug });
    adapt(raw);
  }
  function adapt(raw) {
    if (raw > 0.5) return;
    if (raw > 0.022) { slowAcc += raw; stats.slowFrames++; } else slowAcc = Math.max(0, slowAcc - raw * 0.5);
    if (slowAcc > 1.5 && quality > 0.6) { quality *= 0.85; render.quality = Math.max(0.5, quality); slowAcc = 0; pendingResize = true; }
  }

  /* ---------- input ---------- */
  function toLogical(cx, cy) { return { x: (cx - view.left) / view.s, y: (cy - view.top) / view.s }; }
  function onDown(p) {
    if (mode !== 'play' || bot) return;
    if (world.pointerDown(p.x, p.y) != null) return;
    const L = world.layout.tutu;
    if (Math.abs(p.x - L.x) < L.h * 0.45 && p.y < L.y + 10 && p.y > L.y - L.h * 1.05) repeatPrompt();
  }
  function repeatPrompt() {
    if (!lastRoundEvt || world.state !== 'round') return;
    TR.Audio.play('click');
    if (world.tutu) { world.tutu.mood = 'think'; world.tutu.moodT = 1.2; }
    speak(currentPrompt(), { interrupt: true });
  }

  function bindUI() {
    TR.Input.kidProof();
    TR.Input.attach($('game'), {
      toLogical,
      down: (x, y) => onDown({ x, y }),
      move: (x, y) => { if (mode === 'play' && !bot) world.pointerMove(x, y); },
      up: (x, y) => { if (mode === 'play' && !bot) world.pointerUp(x, y); },
      cancel: () => { if (world.cancelDrag) world.cancelDrag(); }
    });
    const unlock = () => { TR.Audio.unlock(); if (TR.Voice) TR.Voice.unlock(); };
    ['touchend', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { capture: true, passive: true }));

    $('btnPlay').addEventListener('click', () => { TR.Audio.play('click'); goProfiles(); });
    $('btnProfilesBack').addEventListener('click', () => { TR.Audio.play('click'); goTitle(); });
    $('btnMapHome').addEventListener('click', () => { TR.Audio.play('click'); goTitle(); });
    $('btnTreasure').addEventListener('click', () => { TR.Audio.play('click'); goTreasure(); });
    $('btnTreasureBack').addEventListener('click', () => { TR.Audio.play('click'); goMap(false); });
    $('btnResumeLagoon').addEventListener('click', () => { TR.Audio.play('click'); const rs = profile && profile.resume; if (rs) startLagoon(rs.lagoon, rs); });
    $('bubble').addEventListener('click', repeatPrompt);
    $('btnPause').addEventListener('click', () => { TR.Audio.play('click'); pause(); });
    $('btnResume').addEventListener('click', () => { TR.Audio.play('click'); resume(); });
    $('btnMap').addEventListener('click', () => { TR.Audio.play('click'); saveResume(); goMap(false); });
    $('btnHome').addEventListener('click', () => { TR.Audio.play('click'); saveResume(); goTitle(); });
    $('btnLouder').addEventListener('click', () => { setVolume(S.volume + 10); TR.Audio.play('star', { i: 1 }); });
    $('btnQuieter').addEventListener('click', () => { setVolume(S.volume - 10); TR.Audio.play('click'); });
    $('btnNext').addEventListener('click', () => { TR.Audio.play('click'); startLagoon(lagoon < 6 ? lagoon + 1 : lagoon, null); });
    $('btnDoneMap').addEventListener('click', () => { TR.Audio.play('click'); goMap(false); });
    $('btnMic').addEventListener('click', listen);
    document.querySelectorAll('[data-lang]').forEach(b => b.addEventListener('click', () => {
      S.lang = b.dataset.lang; langOverride = null; saveSettings(); TR.UI.applyLang(curLang()); applyAudio(); TR.UI.setTitleInfo(profile, curLang());
      updateVoiceInfo();
      TR.Audio.play('click');
      if (mode === 'title') speak(T('ui.welcome'), { interrupt: true });
    }));
    // parent gate: hold the gear for 2 s
    const gear = $('btnParents');
    TR.Input.holdButton(gear, 2000, () => { gear.style.setProperty('--p', 0); openSettings(); },
      p => { gear.style.setProperty('--p', p); gear.classList.toggle('holding', p > 0); });
    gear.addEventListener('click', () => { gear.classList.add('tip'); setTimeout(() => gear.classList.remove('tip'), 1600); });
    TR.UI.bindSettings(S, k => { saveSettings(); if (k === 'sfx' || k === 'music' || k === 'voice' || k === 'volume') applyAudio(); });
    $('btnSettingsDone').addEventListener('click', () => { TR.Audio.play('click'); goTitle(); });
    // profile editor
    $('btnProfileSave').addEventListener('click', () => {
      TR.Audio.play('click');
      const v = TR.UI.readProfileEdit();
      if (!v.name) v.name = editingId ? (TR.Progress.get(editingId) || {}).name || 'Bé' : 'Bé';
      if (editingId) TR.Progress.update(editingId, v); else { const np = TR.Progress.create(v); if (np) TR.Progress.setCurrent(np.id); }
      profile = TR.Progress.current(); applyChild();
      openSettings();
    });
    $('btnProfileCancel').addEventListener('click', () => { TR.Audio.play('click'); openSettings(); });
    $('btnProfileDelete').addEventListener('click', () => {
      if (!editingId) return;
      if (!window.confirm(T('ui.deleteConfirm'))) return;
      TR.Audio.play('click');
      TR.Progress.remove(editingId); TR.Progress.ensureDefault();
      profile = TR.Progress.current(); applyChild();
      openSettings();
    });

    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(applySize, 250));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { pause(); TR.Audio.suspend(); if (TR.Voice) TR.Voice.stop(); }
      else TR.Audio.resume();
    });
    window.addEventListener('blur', () => { if (world && world.cancelDrag) world.cancelDrag(); });
  }
  function openSettings() {
    TR.Audio.play('click');
    mode = 'settings';
    TR.UI.refreshSettings();
    updateVoiceInfo();
    const list = TR.Progress.list();
    TR.UI.renderSettingsProfiles(list, curLang(), id => { editingId = id; TR.UI.openProfileEdit(TR.Progress.get(id), curLang(), false); },
      () => { editingId = null; TR.UI.openProfileEdit({ name: '', sayAs: '', age: 4, avatar: 'turtle' }, curLang(), true); }, list.length < (TR.Progress.MAX_PROFILES || 4));
    TR.UI.only('scrSettings');
  }
  function updateVoiceInfo() {
    if (!TR.Voice) return;
    const has = TR.Voice.hasVoice ? TR.Voice.hasVoice(curLang()) : false;
    const nm = TR.Voice.voiceName ? TR.Voice.voiceName() : '';
    const mic = TR.Voice.canListen && TR.Voice.canListen();
    const hasVi = TR.Voice.hasVoice ? TR.Voice.hasVoice('vi') : false;
    let v = has ? (curLang() === 'vi' ? 'Giọng đọc: ' : 'Voice: ') + (nm || '✓') : (curLang() === 'vi' ? 'Máy chưa có giọng tiếng Việt — vào Cài đặt › Trợ năng › Nội dung được đọc để tải giọng.' : 'No voice for this language on this device yet.');
    if (!hasVi && curLang() === 'en') v += ' · No Vietnamese voice: names are read with "Say the name as".';
    const m = mic ? '' : ' · ' + T('ui.micUnsupported');
    TR.UI.setVoiceInfo(v + m);
  }

  /* ---------- test hooks ---------- */
  function hooks() {
    const prev = TR.debug || {};
    TR.debug = prev;
    Object.defineProperties(prev, Object.getOwnPropertyDescriptors({
      get world() { return world; }, get weather() { return weather; }, get mode() { return mode; }, stats,
      voiceLog: (TR.Voice && TR.Voice.log) || prev.voiceLog || [],
      get progress() { return TR.Progress; }, get profile() { return profile; },
      getState() {
        return { mode, state: world.state, lagoon, level: world.level, topic: world.topic, round: world.round, stars: world.stars, mech: world.cur && world.cur.mech, roundMode: world.cur && world.cur.mode,
          items: (world.items || []).length, mounds: (world.mounds || []).length, held: world.held, W: view.W, H: view.H, ins: view.ins, settings: Object.assign({}, S), speed, pearls: profile && profile.pearls };
      },
      setSpeed(n) { speed = Math.max(0.1, +n || 1); applyAudio(); },
      startGame(l) { if (!profile) { profile = TR.Progress.ensureDefault(); applyChild(); } startLagoon(l || FLAGS.lagoon || 1, null); },
      goTitle, goMap: () => goMap(false), goProfiles, pause, resume,
      setBot(on, skill) { bot = on ? new TR.Bot(world, { skill: skill == null ? FLAGS.botSkill : skill, seed: 7 }) : null; },
      setAutoRestart(on) { autoRestart = !!on; },
      gotoLevel(i) { world.startLevel(i); },
      get bot() { return bot; }, view: () => view, render: () => render
    }));
  }

  /* ---------- boot ---------- */
  async function boot() {
    await TR.Storage.init();
    S = Object.assign({}, DEF, TR.Storage.getJSON('settings', {}));
    if (typeof S.volume !== 'number') S.volume = 100;
    if (FLAGS.testProfile && TR.Progress.useMemory) TR.Progress.useMemory(true);
    TR.Progress.load();
    profile = TR.Progress.ensureDefault();
    profile = TR.Progress.current() || profile;
    TR.UI.applyLang(curLang());
    applyChild();
    if (TR.Voice) TR.Voice.init({ lang: curLang(), enabled: voiceOn() });
    render = new TR.Renderer($('game')); TR.render = render;
    world = new TR.World({ seed: FLAGS.seed != null ? FLAGS.seed : (Date.now() & 0x7fffffff), age: curAge(), lang: curLang() });
    weather = new TR.Weather({ width: 960, height: 720, seed: 11 });
    hooks();
    bindUI();
    applySize();
    weather.setWeather(0, { instant: true });
    await TR.Assets.load();
    render.prewarm(world.layout);
    applyAudio();
    if (FLAGS.bot) bot = new TR.Bot(world, { skill: FLAGS.botSkill, seed: 7 });
    TR.UI.only('scrTitle');
    TR.UI.setTitleInfo(profile, curLang());
    mode = 'title';
    requestAnimationFrame(frame);
    if (FLAGS.autostart) startLagoon(FLAGS.lagoon || 1, null);
    if (TR.Voice && TR.Voice.onVoicesChanged) TR.Voice.onVoicesChanged(updateVoiceInfo);
  }
  window.addEventListener('DOMContentLoaded', () => boot().catch(e => { console.error(e); }));
})(window.TR = window.TR || {});
