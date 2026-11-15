/* main.js — game controller: boot, loop, input (keys / horizontal pointer-follow / touch / 🚀 Jet Hop button / second
 * finger), modes, settings, test hooks (DESIGN §5.4). Modes: 'title' (bot demo) → 'playing' ⇄ 'paused' → 'over'.
 * World states live in SC.World. */
(function (SC) {
  'use strict';
  const params = new URLSearchParams(location.search);
  const num = (k, d) => { const v = parseFloat(params.get(k)); return isFinite(v) ? v : d; };
  const ZONES = ['Sunny Skies', 'Rainy Clouds', 'Windy Heights', 'Snowy Towers'];
  const LENGTH = { short: 0.7, normal: 1, long: 1.4 };   // level length setting: scales the star jar target
  const DIFFS = ['easy', 'normal', 'hard'];
  const newRun = () => ({ stars: 0, gold: 0, zaps: 0, jets: 0, cleared: 0, bestCombo: 0, combo: 0 });
  // phone / tablet (coarse pointer); a Windows touch laptop with a mouse keeps the desktop layout
  const isTouch = window.matchMedia ? window.matchMedia('(pointer:coarse)').matches : (('ontouchstart' in window) || navigator.maxTouchPoints > 0);

  function difficultyOverrides(d) { return Object.assign({}, (SC.DIFFICULTY && SC.DIFFICULTY[d]) || {}); }

  const Game = {
    mode: 'boot', isTouch,
    isApp: params.get('app') === '1' || typeof window.ffStoreSet === 'function',
    speed: Math.max(0.1, Math.min(64, num('speed', 1))),
    botMode: params.get('bot') === '1',
    autoRestart: params.get('autorestart') === '1',
    seed: params.has('seed') ? num('seed', 1) : null,
    world: null, weather: null, bot: null, renderer: null,
    settings: { sfx: true, music: true, muted: false, difficulty: 'normal', length: 'normal' },
    fullscreen: false, overAt: 0, deadAt: -1,
    keys: {}, pointerDown: false, run: newRun(),
    stats: { games: 0, scores: [], times: [], levels: [], stars: 0, gold: 0, zaps: 0, jets: 0, errors: [] },

    async boot() {
      await SC.Storage.init();
      Object.assign(this.settings, SC.Storage.getJSON('settings', {}));
      this.urlMute = params.get('mute') === '1';
      this.urlDiff = DIFFS.includes(params.get('diff')) ? params.get('diff') : null;   // ?diff= overrides the setting for this session
      if (!LENGTH[this.settings.length]) this.settings.length = 'normal';
      SC.Audio.setOptions({ sfx: this.settings.sfx, music: this.settings.music, muted: this.settings.muted || this.urlMute });
      this.renderer = new SC.Renderer(document.getElementById('game'));
      await SC.Assets.loadAll();
      SC.UI.init(this);
      this.bindInput();
      this.relayout();
      // rotation / resize / Safari toolbar changes: re-layout (debounced); the world keeps running and Shelly is
      // clamped into the new play range. A finger that was steering is released so Shelly doesn't jump.
      const onResize = () => { clearTimeout(this._rsz); this._rsz = setTimeout(() => this.relayout(), 120); };
      window.addEventListener('resize', onResize);
      window.addEventListener('orientationchange', () => { this.releasePointer(); onResize(); });
      if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
      if (params.get('autostart') === '1') this.startGame(); else this.toTitle();
      this.last = performance.now();
      requestAnimationFrame(t => this.frame(t));
    },

    difficulty() { return this.urlDiff || this.settings.difficulty; },
    makeWorld(seed, forTitle) {
      const s = seed != null ? seed : (this.seed != null ? this.seed : (Math.random() * 1e9) | 0);
      const w = new SC.World({ seed: s, config: forTitle ? {} : difficultyOverrides(this.difficulty()) });
      this.applyPlayRange(w);
      w.reset();
      if (!forTitle) this.applyLength(w);
      return w;
    },
    /* Level length (Short / Normal / Long) scales the star jar target of each level. */
    applyLength(w) {
      const k = LENGTH[this.settings.length] || 1;
      if (!w || w._lenLevel === w.level) return;   // once per level
      w._lenLevel = w.level;
      if (k !== 1 && w.jarTarget > 0) w.jarTarget = Math.max(6, Math.round(w.jarTarget * k));
    },
    /* safe-area insets (CSS px) read from a hidden element padded with env(safe-area-inset-*) */
    readInsets() {
      const el = document.getElementById('safeProbe'); if (!el) return null;
      const cs = getComputedStyle(el);
      return { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
    },
    relayout() {
      if (this._lastW != null && this._lastW !== window.innerWidth) this.releasePointer();   // Split View / Stage Manager
      this._lastW = window.innerWidth;
      this.renderer.resize(this.readInsets());
      if (this.world) this.applyPlayRange(this.world);
      if (this.world) { const c = this.world.cfg; if (this.renderer.pointer) this.renderer.pointer[0] = Math.max(c.xMin, Math.min(c.xMax, this.renderer.pointer[0])); }
    },
    applyPlayRange(w) { const L = this.renderer && this.renderer.layout; if (L && w.setPlayRange) w.setPlayRange(L.playMin, L.playMax); },
    releasePointer() { this.pointerDown = false; this._steerId = null; if (this._touches) this._touches.clear(); if (this.isTouch && this.renderer) this.renderer.pointer = null; },
    makeWeather() { return new SC.Weather({ width: 960, height: 540, seed: 5 }); },

    toTitle() {
      SC.Audio.stopMusic();
      this.mode = 'title';
      this.world = this.makeWorld(this.seed != null ? this.seed + 99 : null, true);
      this.bot = new SC.Bot(this.world, { skill: 0.8, seed: 3 });
      this.weather = this.weather || this.makeWeather();
      this.weather.setSeason(0, { instant: true });
      this.renderer.attach(this.world, this.weather);
      this.renderer.setSeason(0, true);
      SC.Audio.setSeason(0);
      this.deadAt = -1;
      SC.UI.setHud(false); this.showAction(false);
      SC.UI.show('scrTitle');
    },

    startGame() {
      SC.Audio.unlock();
      this.runDifficulty = this.difficulty();   // best score belongs to the difficulty the run started on
      this.world = this.makeWorld();
      const lv = params.has('level') ? Math.max(0, num('level', 0) | 0) : 0;
      if (lv > 0 && this.world.startLevel) { this.world.startLevel(lv); this.applyLength(this.world); }
      this.bot = this.botMode ? new SC.Bot(this.world, { skill: num('skill', 1), seed: 11 }) : null;
      if (!this.weather) this.weather = this.makeWeather();
      const b = this.world.zone || 0;
      this.weather.setSeason(b, { instant: this.renderer.vis.cur === b });
      this.renderer.attach(this.world, this.weather);
      this.renderer.setSeason(b, this.renderer.vis.cur === b);
      this.renderer.showBanner(b);
      SC.Audio.setSeason(b); SC.Audio.play('start');
      if (this.settings.music) SC.Audio.startMusic();
      this.mode = 'playing';
      this.deadAt = -1; this.run = newRun();
      this.keys = {}; this.pointerDown = false; this.renderer.pointer = null;
      SC.UI.hideAll(); SC.UI.setHud(true); this.showAction(true);
      this.canvasFocus();
    },
    showAction(on) { const b = document.getElementById('btnAction'); if (b) b.classList.toggle('hidden', !(on && isTouch)); },

    pause() {
      if (this.mode !== 'playing') return;
      if (this.world && this.world.state === 'dead') return;
      this.mode = 'paused'; this.keys = {}; this.pointerDown = false;
      SC.UI.setHud(false); this.showAction(false);
      SC.UI.show('scrPause');
    },
    resume() {
      if (this.mode !== 'paused') return;
      this.mode = 'playing';
      SC.UI.hideAll(); SC.UI.setHud(true); this.showAction(true);
      this.last = performance.now();
      this.canvasFocus();
    },
    canvasFocus() { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); },
    canRestart() { return performance.now() - this.overAt > 700; },

    gameOver() {
      const w = this.world, key = 'best_' + (this.runDifficulty || this.difficulty());
      const prev = parseInt(SC.Storage.get(key, '0'), 10) || 0, newBest = w.score > prev;
      if (newBest) SC.Storage.set(key, String(w.score));
      this.mode = 'over'; this.overAt = performance.now();
      SC.UI.setHud(false); this.showAction(false);
      SC.UI.showGameOver({
        score: w.score, best: Math.max(prev, w.score), newBest: newBest && w.score > 0,
        stars: this.run.stars, gold: this.run.gold, zaps: this.run.zaps, jets: this.run.jets,
        bestCombo: Math.max(this.run.bestCombo, w.bestCombo || 0), cleared: Math.max(this.run.cleared, w.level || 0),
        zoneName: ZONES[w.zone || 0] + ((w.lap || 0) > 0 ? ' (lap ' + (w.lap + 1) + ')' : '')
      });
      if (newBest && w.score > 0) SC.Audio.play('best');
      const st = this.stats;
      st.games++; st.scores.push(w.score); st.times.push(+w.time.toFixed(2)); st.levels.push(w.level || 0);
      st.stars += this.run.stars; st.gold += this.run.gold; st.zaps += this.run.zaps; st.jets += this.run.jets;
      if (this.autoRestart) setTimeout(() => this.startGame(), 50);
    },

    best() { return parseInt(SC.Storage.get('best_' + this.difficulty(), '0'), 10) || 0; },
    resetBest() { ['easy', 'normal', 'hard'].forEach(d => SC.Storage.del('best_' + d)); },
    setSetting(k, v) {
      this.settings[k] = v;
      SC.Storage.setJSON('settings', this.settings);
      SC.Audio.setOptions({ sfx: this.settings.sfx, music: this.settings.music, muted: this.settings.muted || this.urlMute });
      if (k === 'music') { if (v && this.mode !== 'title') SC.Audio.startMusic(); if (!v) SC.Audio.stopMusic(); }
    },
    /* the volume slider at 0 % counts as muted (HUD icon + M), so a child who slid it to 0 sees why it is silent */
    volumeZero() { return !!(window.DailyExtras && DailyExtras.volume && DailyExtras.volume() === 0); },
    isMuted() { return !!(this.settings.muted || this.urlMute || this.volumeZero()); },
    toggleMute() {
      if (this.urlMute) { this.urlMute = false; SC.Audio.setOptions({ muted: this.settings.muted }); }   // ?mute=1: a session-only switch, never saved
      else if (this.settings.muted) this.setSetting('muted', false);
      else if (!this.volumeZero()) this.setSetting('muted', true);
      if (!this.settings.muted && !this.urlMute && this.volumeZero()) DailyExtras.setVolume(0.5);   // unmuting a 0 % volume restores 50 %
      SC.UI.syncMute(); SC.UI.toast(this.isMuted() ? 'Sound off' : 'Sound on', 900);
    },
    setFullscreen(on) {
      this.fullscreen = on;
      if (typeof window.ffFullscreen === 'function') window.ffFullscreen(on);
      else if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
      else if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
      setTimeout(() => this.renderer.resize(), 150);
    },
    picturesChanged() { SC.Assets._ver = (SC.Assets._ver || 0) + 1; },
    quit() { if (typeof window.ffQuit === 'function') window.ffQuit(); else window.close(); },

    // ---------------- input ----------------
    playerCanAct() { return this.mode === 'playing' && this.world && this.world.state !== 'dead' && !this.bot; },
    action() { SC.Audio.unlock(); if (this.playerCanAct()) this.world.action(); },
    applyMove() {
      this.renderer.pointerHeld = this.pointerDown;
      if (!this.playerCanAct()) return;
      const k = this.keys;
      const mx = (k.ArrowRight || k.KeyD ? 1 : 0) - (k.ArrowLeft || k.KeyA ? 1 : 0);
      if (mx) { this.world.setMove(mx); this.world.setTarget(null); this.renderer.pointer = null; this._mouseFollow = false; }
      else {
        this.world.setMove(0);
        // touch: follow while the finger is down; mouse: follow the cursor once it has moved over the game
        if (this.renderer.pointer && (this.pointerDown || this._mouseFollow)) this.world.setTarget(this.renderer.pointer[0]);
        else this.world.setTarget(null);
      }
    },
    bindInput() {
      const MOVE = ['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'];
      const JET = ['Space', 'ArrowUp', 'KeyW', 'Enter', 'NumpadEnter', 'ShiftLeft', 'ShiftRight'];   // Jet Hop
      window.addEventListener('keydown', e => {
        if (e.code === 'F11') { e.preventDefault(); this.setFullscreen(!this.fullscreen); SC.UI.syncSettings(); return; }
        if (e.code === 'KeyM' && !e.repeat) { this.toggleMute(); return; }
        const ui = SC.UI.current;
        if (e.code === 'Escape' || e.code === 'KeyP') {
          if (this.mode === 'playing') { this.pause(); e.preventDefault(); return; }
          if (this.mode === 'paused' && ui === 'scrPause') { this.resume(); e.preventDefault(); return; }
          if (ui === 'scrHow' || ui === 'scrSettings' || ui === 'scrCustom') { SC.UI.back(); e.preventDefault(); return; }
          return;
        }
        if (this.mode === 'playing') {
          if (MOVE.includes(e.code)) { e.preventDefault(); this.keys[e.code] = true; SC.Audio.unlock(); return; }
          if (JET.includes(e.code)) { e.preventDefault(); if (!e.repeat) this.action(); return; }
        }
        if (this.mode === 'over' && (e.code === 'Enter' || e.code === 'Space')) {
          const f = document.activeElement;
          if (f && f.tagName === 'BUTTON' && f.id !== 'btnAgain') return;   // a focused Menu / Score Card button handles its own key
          e.preventDefault(); if (this.canRestart()) this.startGame(); return;
        }
        if (this.mode === 'title' && ui === 'scrTitle' && e.code === 'Space') {
          const f = document.activeElement;
          if (f && f.tagName === 'BUTTON' && f.id !== 'btnPlay') return;
          e.preventDefault(); this.startGame();
        }
      });
      window.addEventListener('keyup', e => { delete this.keys[e.code]; });
      const stage = document.getElementById('stage');
      const setPtr = e => { this.renderer.pointer = this.renderer.toLogical(e.clientX, e.clientY); };
      stage.addEventListener('pointerdown', e => {
        if (e.target.closest && e.target.closest('button, .screen, #hud, input, label')) return;   // HUD/menu clicks never move Shelly
        if (this.mode !== 'playing') return;
        e.preventDefault(); SC.Audio.unlock();
        if (e.button === 2) { this.action(); return; }
        if (e.pointerType === 'touch' && this._touches && this._touches.size >= 1) { this.action(); return; }   // second finger = action
        (this._touches = this._touches || new Set()).add(e.pointerId);
        this._steerId = e.pointerId;   // only this finger / button steers Shelly
        this.pointerDown = true; setPtr(e);
        try { if (e.pointerType === 'touch') stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      });
      stage.addEventListener('pointermove', e => {
        if (this.mode !== 'playing') return;
        if (e.pointerType === 'mouse' && e.target.closest && e.target.closest('button, .screen, #hud')) { this._mouseFollow = false; return; }   // hovering the HUD never pulls Shelly
        if (this.pointerDown && e.pointerId !== this._steerId) return;   // a second finger (jet tap) never steers
        if (e.pointerType === 'mouse') { const p0 = this._lastMouse; this._lastMouse = [e.clientX, e.clientY]; if (p0 && Math.abs(p0[0] - e.clientX) + Math.abs(p0[1] - e.clientY) > 2) this._mouseFollow = true; }
        if (this.pointerDown || e.pointerType === 'mouse') setPtr(e);
      });
      const up = e => {
        if (this._touches) this._touches.delete(e.pointerId);
        // the steering finger lifted: Shelly stops following, even if a second (jet) finger is still down
        if (e.pointerId === this._steerId || !this._touches || !this._touches.size) {
          this._steerId = null; this.pointerDown = false; if (e.pointerType !== 'mouse') this.renderer.pointer = null;
        }
      };
      window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
      const act = document.getElementById('btnAction');
      if (act) act.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.action(); });
      window.addEventListener('blur', () => { this.keys = {}; this.pointerDown = false; if (this.mode === 'playing') this.pause(); });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) { if (this.mode === 'playing') this.pause(); this.releasePointer(); SC.Audio.suspend(); }
        else SC.Audio.resume();
      });
      // iOS: audio may only start inside a gesture — unlock on the first touchend / click / key
      const unlock = () => SC.Audio.unlock();
      ['touchend', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { capture: true, passive: true }));
      this.kidProof();
      window.addEventListener('dragover', e => e.preventDefault());
      window.addEventListener('drop', e => e.preventDefault());
      window.addEventListener('contextmenu', e => e.preventDefault());
      window.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
      window.addEventListener('keydown', e => {
        const k = e.key;
        if (k === 'F5' || ((e.ctrlKey || e.metaKey) && ['r', 'R', '+', '=', '-', '_', '0', 'p', 'P', 'f', 'F', 'g', 'G', 'u', 'U'].includes(k))) e.preventDefault();
      }, true);
      document.addEventListener('fullscreenchange', () => { this.fullscreen = !!document.fullscreenElement || (this.fullscreen && typeof window.ffFullscreen === 'function'); this.renderer.resize(); SC.UI.syncSettings(); });
    },

    /* Touch kid-proofing (iPhone / iPad): no pinch or double-tap zoom, no long-press callout, no rubber-band
     * scroll or pull-to-refresh. Scrollable panels opt back in with the .scroll class. */
    kidProof() {
      const NP = { passive: false }, prevent = e => { if (e.cancelable) e.preventDefault(); };
      const formy = t => t && t.closest && t.closest('input, textarea, select, .scroll, .panel');   // panels may scroll
      ['gesturestart', 'gesturechange', 'gestureend'].forEach(t => document.addEventListener(t, prevent, NP));
      document.addEventListener('touchmove', e => { if (!formy(e.target)) prevent(e); }, NP);
      let lastEnd = 0;
      document.addEventListener('touchend', e => {
        const t = Date.now();
        if (t - lastEnd < 320 && !(e.target.closest && e.target.closest('button, a, input, label, select, .scroll, .prev, .slot'))) prevent(e);
        lastEnd = t;
      }, NP);
      document.addEventListener('dblclick', e => { if (!formy(e.target)) prevent(e); }, NP);
    },

    handleEvents(evts) {
      const sound = this.mode !== 'title', w = this.world, run = this.run, wx = this.weather;
      for (const e of evts) {
        switch (e.type) {
          case 'start': break;
          case 'peek': if (sound) SC.Audio.play('peek', { kind: e.kind }); break;
          case 'catch':
            if (sound) SC.Audio.play('catch', { combo: e.combo, mult: e.mult, kind: e.kind });
            if (e.kind === 'gold') { run.gold++; if (wx && wx.burst) wx.burst('sparkle', e.x, e.y, 10); }
            run.stars++; run.combo = e.combo || 0; run.bestCombo = Math.max(run.bestCombo, run.combo);
            break;
          case 'multup': if (sound) SC.Audio.play('multup', { mult: e.mult }); break;
          case 'miss': e.lost = run.combo; run.combo = 0; if (sound) SC.Audio.play('miss'); break;
          case 'zap':
            if (sound) SC.Audio.play('zap'); run.zaps++; run.combo = 0;
            if (wx && wx.burst) wx.burst('zap', e.x, e.y, 6);
            break;
          case 'pop': if (sound) SC.Audio.play('pop'); break;
          case 'heal': if (sound) SC.Audio.play('charged'); break;
          case 'puffland': if (sound) SC.Audio.play('pop'); if (wx && wx.burst) wx.burst('puff', e.x, e.y, 5); break;
          case 'jet': {
            if (sound) SC.Audio.play('jet'); run.jets++;
            const s = w.snail;   // an extra burst of puffs at take-off
            if (s && wx && wx.jet) { const n = this.renderer.nozzle(s); for (let i = 0; i < 2; i++) wx.jet(n[0], n[1], 1, { face: s.face, vx: s.vx, vy: s.vy }); }
            break;
          }
          case 'jetland': if (sound) SC.Audio.play('land'); if (wx && wx.burst) wx.burst('puff', e.x, 490, 4); break;
          case 'jetcharged': if (sound) SC.Audio.play('charged'); break;
          case 'gustwarn': if (sound) SC.Audio.play('gustwarn'); break;
          case 'gust': if (sound) SC.Audio.play('gust'); break;
          case 'jarfull': if (sound) SC.Audio.play('jarfull'); break;
          case 'cleared':
            if (sound) SC.Audio.play('cleared'); run.cleared++;
            if (wx && wx.burst) wx.burst('confetti', 480, 200, 40);
            break;
          case 'zone': case 'season': {
            const b = e.zone != null ? e.zone : e.season;
            this.weather.setSeason(b); SC.Audio.setSeason(b);
            if (this.mode !== 'title' && (e.level || 0) > 0) this.applyLength(w);
            if (sound && (e.level || 0) > 0) SC.Audio.play('season');
            break;
          }
          case 'dead': if (sound) SC.Audio.play('dead'); this.deadAt = w.time; break;
        }
      }
      this.renderer.onEvents(evts);
    },

    step(h) {
      const w = this.world;
      if (this.bot && (this.mode === 'playing' || this.mode === 'title')) this.bot.step(h);
      else if (this.mode === 'playing') this.applyMove();
      w.update(h);
      const ev = w.drainEvents();
      if (ev.length) this.handleEvents(ev);
      const wx = this.weather;
      wx.update(h, { wind: w.wind, snail: w.snail, world: w });
      // (the weather emits the jet puffs from the nozzle itself while snail.flame > 0)
      if (this.mode === 'playing' && w.state === 'dead' && this.deadAt >= 0 && w.time - this.deadAt > 1.4) this.gameOver();
      if (this.mode === 'title' && (w.state === 'dead' || (w.level || 0) >= 2) && (this.deadAt >= 0 ? w.time - this.deadAt > 1.5 : true)) {
        this.world = this.makeWorld(null, true);
        this.bot = new SC.Bot(this.world, { skill: 0.8, seed: (Math.random() * 1e6) | 0 });
        this.renderer.attach(this.world, this.weather); this.deadAt = -1;
        this.weather.setSeason(0); this.renderer.setSeason(0);
      }
    },

    adapt(real) {
      if (params.get('adaptive') === '0' || this.mode === 'paused' || this.mode === 'boot') return;
      if (this._adaptHold > 0) { this._adaptHold--; return; }
      this._ft = this._ft == null ? real : this._ft + (real - this._ft) * 0.1;
      this._slowT = this._ft > 0.020 ? (this._slowT || 0) + real : 0;
      const R = this.renderer;
      if (this._slowT > 1.5 && R.px > 1.01) { R.maxPx = Math.max(1, R.px * 0.75); R.resize(); this._slowT = 0; this._ft = null; this._adaptHold = 60; }
    },

    frame(ts) {
      try {
        const real = Math.min(0.1, Math.max(0, (ts - this.last) / 1000));
        this.last = ts;
        const dt = real * this.speed;
        if (this.mode !== 'paused' && this.world) {
          const n = Math.max(1, Math.ceil(dt / (1 / 60))), h = dt / n;
          for (let i = 0; i < n; i++) this.step(h);
          this.renderer.update(dt);
        }
        this.renderer.draw(this.mode);
        this.adapt(real);
      } catch (err) {
        console.error(err);
        if (this.stats.errors.length < 20) this.stats.errors.push(String(err && err.stack || err));
      }
      requestAnimationFrame(t => this.frame(t));
    }
  };

  SC.Game = Game;
  SC.debug = {
    get world() { return Game.world; },
    get weather() { return Game.weather; },
    get mode() { return Game.mode; },
    get stats() { return Game.stats; },
    getState() {
      const w = Game.world;
      const s = w && w.snail;
      return w && { mode: Game.mode, state: w.state, score: w.score, level: w.level, zone: w.zone, lap: w.lap, hearts: w.hearts, heartsMax: w.heartsMax,
        combo: w.combo, mult: w.mult, bestCombo: w.bestCombo, jar: w.jar, jarTarget: w.jarTarget, time: w.time, items: w.items.length,
        starsTotal: w.starsTotal, goldTotal: w.goldTotal, zaps: w.zaps, missed: w.missed, difficulty: Game.runDifficulty || Game.difficulty(),
        jet: w.jet && { charge: +(+w.jet.charge || 0).toFixed(2), air: !!w.jet.air },
        wind: w.wind && { x: +(+w.wind.x || 0).toFixed(1), warn: +(+w.wind.warn || 0).toFixed(2) },
        snail: s && { x: Math.round(s.x), y: Math.round(s.y), hop: Math.round(s.hop || 0), frame: s.frame, rimX: Math.round(s.rimX), rimY: Math.round(s.rimY) },
        run: Object.assign({}, Game.run),
        particles: Game.weather ? Game.weather.particles.length : 0, fx: Game.renderer.fx.length };
    },
    setSpeed(n) { Game.speed = n; },
    startGame() { Game.startGame(); },
    setBot(on, skill) { Game.botMode = on; Game.bot = on ? new SC.Bot(Game.world, { skill: skill == null ? 1 : skill, seed: 11 }) : null; },
    setAutoRestart(on) { Game.autoRestart = on; },
    gotoLevel(i) { Game.world.startLevel(i); if (Game.mode !== 'title') Game.applyLength(Game.world); }
  };

  window.addEventListener('DOMContentLoaded', () => Game.boot().catch(e => {
    console.error(e);
    document.body.insertAdjacentHTML('beforeend', '<pre style="color:#fff;padding:20px">Could not start the game: ' + (e && e.message) + '</pre>');
  }));
})(window.SC = window.SC || {});
