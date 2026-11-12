/* main.js — game controller: boot, loop, input (tap / click / Space / ↑ / W = puff), modes, settings, test hooks.
 * Modes: 'title' (bot demo) → 'ready' (hover until the first tap) → 'playing' ⇄ 'paused' → 'over'. The run lives in BKF.World. */
(function (BKF) {
  'use strict';
  const params = new URLSearchParams(location.search);
  const num = (k, d) => { const v = parseFloat(params.get(k)); return isFinite(v) ? v : d; };
  const DIFFS = ['easy', 'normal', 'hard'];
  const isTouch = window.matchMedia ? window.matchMedia('(pointer:coarse)').matches : (('ontouchstart' in window) || navigator.maxTouchPoints > 0);

  const Game = {
    mode: 'boot', isTouch,
    isApp: params.get('app') === '1' || typeof window.bkStoreSet === 'function',
    speed: Math.max(0.1, Math.min(64, num('speed', 1))),
    botMode: params.get('bot') === '1',
    autoRestart: params.get('autorestart') === '1',
    seed: params.has('seed') ? num('seed', 1) : null,
    urlDiff: DIFFS.includes(params.get('diff')) ? params.get('diff') : null,   // test flag, never saved
    world: null, weather: null, bot: null, renderer: null,
    settings: { sfx: true, music: true, muted: false, difficulty: 'easy' },   // a family game: first run on Easy
    fullscreen: false, overAt: 0, deadT: -1,
    stats: { games: 0, scores: [], times: [], levels: [], leaves: 0, bumps: 0, flaps: 0, errors: [] },
    keys: {}, drag: null,

    async boot() {
      await BKF.Storage.init();
      Object.assign(this.settings, BKF.Storage.getJSON('settings', {}));
      if (!DIFFS.includes(this.settings.difficulty)) this.settings.difficulty = 'easy';
      this.urlMute = params.get('mute') === '1';
      BKF.Audio.setOptions({ sfx: this.settings.sfx, music: this.settings.music, muted: this.settings.muted || this.urlMute });
      this.debugView = params.get('debug') === '1';
      this.renderer = new BKF.Renderer(document.getElementById('game'));
      await BKF.Assets.loadAll();
      BKF.UI.init(this);
      this.bindInput();
      this.relayout();
      const onResize = () => { clearTimeout(this._rsz); this._rsz = setTimeout(() => this.relayout(), 120); };
      window.addEventListener('resize', onResize);
      window.addEventListener('orientationchange', onResize);
      if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
      if (params.get('autostart') === '1') this.startGame(); else this.toTitle();
      this.last = performance.now();
      requestAnimationFrame(t => this.frame(t));
    },

    difficulty() { return this.urlDiff || this.settings.difficulty; },
    makeWorld(seed, forTitle, level) {
      const s = seed != null ? seed : (this.seed != null ? this.seed + this.stats.games : (Math.random() * 1e9) | 0);   // seeded soak runs still vary game to game
      return new BKF.World({ seed: s, difficulty: forTitle ? 'normal' : this.difficulty(), level: level || 0 });
    },
    readInsets() {
      const el = document.getElementById('safeProbe'); if (!el) return null;
      const cs = getComputedStyle(el);
      return { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
    },
    relayout() { this.renderer.resize(this.readInsets()); this.syncRotate(); },
    /* phones held upright: the jungle is tiny, so ask to turn sideways (once dismissed, never again this session) */
    syncRotate() {
      const el = document.getElementById('rotate'); if (!el) return;
      const on = this.isTouch && this.renderer.portrait && Math.min(window.innerWidth, window.innerHeight) < 600 && (this.mode === 'playing' || this.mode === 'ready') && !this._rotOk && !this.botMode;
      this._rotOn = on; el.classList.toggle('hidden', !on);
    },
    makeWeather() { return new BKF.Weather({ width: this.renderer.VW, height: this.renderer.VH, seed: 5 }); },
    _setLevelVisuals(zone, instant) {
      this.weather.setLevel(zone % 4, { instant });
      this.renderer.setLevel(zone % 4, instant);
      BKF.Audio.setLevel(zone % 4, this.world && this.world.loop);
    },

    toTitle() {
      BKF.Audio.stopMusic();
      this.mode = 'title';
      this.world = this.makeWorld(this.seed != null ? this.seed + 99 : null, true);
      this.bot = new BKF.Bot(this.world, { skill: 0.85, seed: 3 });
      this.weather = this.weather || this.makeWeather();
      this.renderer.attach(this.world, this.weather);
      this._setLevelVisuals(0, true);
      this.deadT = -1;
      BKF.UI.setHud(false);
      BKF.UI.show('scrTitle');
    },

    startGame() {
      BKF.Audio.unlock();
      { const t = document.getElementById('toast'); if (t) t.classList.add('hidden'); }
      this.runDifficulty = this.difficulty();
      const lv = params.has('level') ? Math.max(0, num('level', 0) | 0) : 0;
      this.world = this.makeWorld(null, false, lv);
      this.bot = this.botMode ? new BKF.Bot(this.world, { skill: num('skill', 1), seed: 11 }) : null;
      // a run touched by the bot or by test flags never saves a best score
      this.runTainted = this.botMode || params.has('speed') || params.has('level') || !!this.urlDiff;
      if (!this.weather) this.weather = this.makeWeather();
      const z = this.world.zone || 0;
      this.renderer.attach(this.world, this.weather);
      this._setLevelVisuals(z, this.renderer.vis.cur === z % 4);
      this.renderer.showBanner(z);
      BKF.Audio.startMusic();
      this.mode = 'ready';
      this.deadT = -1; this.runT = 0; this.clearInput();
      BKF.UI.hideAll(); BKF.UI.setHud(true);
      this.syncRotate();
      this.canvasFocus();
    },

    pause() {
      if (this.mode !== 'playing' && this.mode !== 'ready') return;
      if (this.world && (this.world.phase === 'over' || this.world.phase === 'down' || this.deadT >= 0)) return;
      this.clearInput();
      this._pausedFrom = this.mode;
      this.mode = 'paused';
      BKF.UI.setHud(false);
      BKF.UI.show('scrPause');
    },
    resume() {
      if (this.mode !== 'paused') return;
      this.mode = this._pausedFrom || 'playing';
      BKF.UI.hideAll(); BKF.UI.setHud(true);
      this.last = performance.now();
      this.canvasFocus();
    },
    canvasFocus() { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); },
    canRestart() { return performance.now() - this.overAt > 700; },

    gameOver() {
      const w = this.world, key = 'best_' + (this.runDifficulty || this.difficulty());
      const prev = parseInt(BKF.Storage.get(key, '0'), 10) || 0, newBest = w.score > prev && !this.botMode && !this.runTainted;
      if (newBest) BKF.Storage.set(key, String(w.score));   // bot / test runs never overwrite a child's best
      this.mode = 'over'; this.overAt = performance.now();
      this.clearInput();
      BKF.Audio.stopMusic();
      BKF.UI.setHud(false);
      const s = w.stats || {}, names = BKF.Renderer.ZONE_INFO.map(z => z.name);
      BKF.UI.showGameOver({
        score: w.score, best: (this.botMode || this.runTainted) ? prev : Math.max(prev, w.score), newBest: newBest && w.score > 0,
        leaves: w.leafCount || 0, passed: w.passed || 0, bumps: s.bumps || 0, clean: s.cleanLevels || 0, time: this.runT || 0,
        reached: names[(w.zone || 0) % 4] + ((w.loop || 0) > 0 ? ' (day ' + (w.loop + 1) + ')' : '')
      });
      if (newBest && w.score > 0) BKF.Audio.play('best');
      const st = this.stats;
      st.games++; st.scores.push(w.score); st.times.push(+(this.runT || 0).toFixed(2)); st.levels.push(w.level || 0);
      st.leaves += w.leafCount || 0; st.bumps += s.bumps || 0; st.flaps += s.flaps || 0;
      if (this.autoRestart) setTimeout(() => this.startGame(), 50);
    },

    best(d) { return parseInt(BKF.Storage.get('best_' + (d || this.difficulty()), '0'), 10) || 0; },
    resetBest() { DIFFS.forEach(d => BKF.Storage.del('best_' + d)); },
    setSetting(k, v) {
      this.settings[k] = v;
      BKF.Storage.setJSON('settings', this.settings);
      BKF.Audio.setOptions({ sfx: this.settings.sfx, music: this.settings.music, muted: this.settings.muted || this.urlMute });
      if (k === 'music' && v && (this.mode === 'playing' || this.mode === 'paused')) BKF.Audio.startMusic();
    },
    toggleMute() {
      if (this.urlMute && !this.settings.muted) {
        this.urlMute = false;
        BKF.Audio.setOptions({ sfx: this.settings.sfx, music: this.settings.music, muted: false });
      } else {
        const on = !this.settings.muted;
        if (!on) this.urlMute = false;
        this.setSetting('muted', on);
      }
      BKF.UI.syncMute(); BKF.UI.toast(this.settings.muted || this.urlMute ? 'Sound off' : 'Sound on', 900);
    },
    setFullscreen(on) {
      this.fullscreen = on;
      if (typeof window.bkFullscreen === 'function') window.bkFullscreen(on);
      else if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
      else if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
      setTimeout(() => this.renderer.resize(), 150);
    },
    picturesChanged() { BKF.Assets._ver = (BKF.Assets._ver || 0) + 1; if (this.renderer) this.renderer._spr.clear(); },
    quit() { if (typeof window.bkQuit === 'function') window.bkQuit(); else window.close(); },

    // ---------------- input: one button (tap / click / Space / ↑ / W) ----------------
    playerCanAct() { return (this.mode === 'playing' || this.mode === 'ready') && this.world && (this.world.phase === 'ready' || this.world.phase === 'playing') && !this.bot; },
    clearInput() { this.keys = {}; },
    flap() { if (!this.playerCanAct()) return false; BKF.Audio.unlock(); return this.world.flap(); },
    bindInput() {
      const FLAP = ['Space', 'ArrowUp', 'KeyW', 'Enter'];
      window.addEventListener('keydown', e => {
        if (e.code === 'F11') { e.preventDefault(); this.setFullscreen(!this.fullscreen); BKF.UI.syncSettings(); return; }
        if (e.code === 'KeyM' && !e.repeat) { this.toggleMute(); return; }
        const ui = BKF.UI.current;
        if (e.code === 'Escape' || e.code === 'KeyP') {
          if (this.mode === 'playing' || this.mode === 'ready') { this.pause(); e.preventDefault(); return; }
          if (this.mode === 'paused' && ui === 'scrPause') { this.resume(); e.preventDefault(); return; }
          if (ui === 'scrHow' || ui === 'scrSettings' || ui === 'scrCustom') { BKF.UI.back(); e.preventDefault(); return; }
          return;
        }
        if ((this.mode === 'playing' || this.mode === 'ready') && FLAP.includes(e.code)) { e.preventDefault(); if (!e.repeat) this.flap(); return; }
        if (this.mode === 'over' && (e.code === 'Enter' || e.code === 'Space')) { const f = document.activeElement; if (f && f.tagName === 'BUTTON' && f.id !== 'btnAgain') return; e.preventDefault(); if (!e.repeat && this.canRestart()) this.startGame(); return; }
        if (this.mode === 'title' && ui === 'scrTitle' && (e.code === 'Space' || e.code === 'Enter')) {
          const f = document.activeElement;
          if (f && f.tagName === 'BUTTON' && f.id !== 'btnPlay') return;
          e.preventDefault(); this.startGame();
        }
      });
      const stage = document.getElementById('stage');
      const onUi = e => e.target.closest && e.target.closest('button, .screen, #hud, #rotate, input, label');
      // every pointerdown on the stage (not on a button or menu) is one puff
      stage.addEventListener('pointerdown', e => {
        BKF.Audio.unlock();
        if (onUi(e)) return;
        if (!this.playerCanAct() || e.button === 2) return;
        e.preventDefault();
        this.flap();
      });
      window.addEventListener('blur', () => { this.clearInput(); if (this.mode === 'playing') this.pause(); });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) { this.clearInput(); if (this.mode === 'playing') this.pause(); BKF.Audio.suspend(); }
        else BKF.Audio.resume();
      });
      const unlock = () => BKF.Audio.unlock();
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
      document.addEventListener('fullscreenchange', () => { this.fullscreen = !!document.fullscreenElement || (this.fullscreen && typeof window.bkFullscreen === 'function'); this.renderer.resize(); BKF.UI.syncSettings(); });
    },
    kidProof() {
      const NP = { passive: false }, prevent = e => { if (e.cancelable) e.preventDefault(); };
      const formy = t => t && t.closest && t.closest('input, textarea, select, .scroll, .panel');
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
      const sound = this.mode !== 'title', A = BKF.Audio;
      for (const e of evts) {
        switch (e.type) {
          case 'start': if (this.mode === 'ready') this.mode = 'playing'; if (sound) A.play('start'); break;
          case 'flap': if (sound) A.play('flap'); break;
          case 'leaf': if (sound) A.play('leaf', { n: this.world.run || 0 }); break;
          case 'pass': if (sound) A.play('pass'); break;
          case 'bump': if (sound) A.play('bump'); break;
          case 'counter': if (sound && e.cost !== false) A.play('counter'); break;
          case 'battery': if (sound) A.play('battery'); break;
          case 'lowBattery': if (sound) A.play('low'); break;
          case 'steam': if (sound) A.play('steam'); break;
          case 'gustWarn': if (sound) A.play('gustWarn'); break;
          case 'gust': if (sound) A.play('gust'); break;
          case 'levelUp': this._setLevelVisuals(e.zone, false); if (sound) setTimeout(() => A.play('level'), 200); break;
          case 'down': if (sound) A.play('down'); A.stopMusic(); this.clearInput(); if (this.mode !== 'title') BKF.UI.setHud(false); break;
          case 'gameOver': if (sound) A.play('over'); this.deadT = 0; break;
        }
      }
      this.renderer.onEvents(evts);
    },

    step(h) {
      const w = this.world;
      if (this.bot && (this.mode === 'playing' || this.mode === 'ready' || this.mode === 'title')) this.bot.step(h);
      w.update(h);
      const ev = w.drainEvents();
      if (ev.length) this.handleEvents(ev);
      if (this.mode === 'playing') this.runT += h;
      if (w.phase === 'over' && this.deadT < 0) this.deadT = 0;
      if (this.deadT >= 0) this.deadT += h;
      if ((this.mode === 'playing' || this.mode === 'ready') && this.deadT > 1.1) this.gameOver();   // let the nap be seen first
      if (this.mode === 'title' && (w.phase === 'over' || (w.level || 0) >= 1 || w.t > 50) && (this.deadT < 0 || this.deadT > 1)) {
        this.world = this.makeWorld(null, true);
        this.bot = new BKF.Bot(this.world, { skill: 0.85, seed: (Math.random() * 1e6) | 0 });
        this.renderer.attach(this.world, this.weather); this.deadT = -1;
        this._setLevelVisuals(0, false);
      }
    },

    /* Adaptive quality: judge the time spent on OUR work (simulate + draw), not the time between frames. */
    adapt(work) {
      if (params.get('adaptive') === '0' || this.mode === 'paused' || this.mode === 'boot' || this.speed !== 1) return;
      if (this._adaptHold > 0) { this._adaptHold--; return; }
      this._wt = this._wt == null ? work : this._wt + (work - this._wt) * 0.05;
      const R = this.renderer, natural = R.cssScale * (window.devicePixelRatio || 1);
      const floor = Math.max(1, this.isTouch ? natural * 0.67 : 1);
      if (this._wt > 0.014) { this._slowN = (this._slowN || 0) + 1; this._fastN = 0; }
      else if (this._wt < 0.006) { this._fastN = (this._fastN || 0) + 1; this._slowN = 0; }
      else { this._slowN = 0; this._fastN = 0; }
      if (this._slowN > 90 && R.px > floor + 0.01) { R.maxPx = Math.max(floor, R.px * 0.8); R.resize(); this._slowN = 0; this._wt = null; this._adaptHold = 60; }
      else if (this._fastN > 300 && R.maxPx && R.px < natural - 0.01) { R.maxPx = Math.min(natural, R.px * 1.2); if (R.maxPx >= natural) R.maxPx = 0; R.resize(); this._fastN = 0; this._wt = null; this._adaptHold = 60; }
    },

    frame(ts) {
      const t0 = performance.now();
      if (this.isTouch) this.syncRotate();
      try {
        const real = Math.min(0.1, Math.max(0, (ts - this.last) / 1000));
        this.last = ts;
        const dt = real * this.speed;
        if (this.mode !== 'paused' && this.world && !this._rotOn) {
          const n = Math.max(1, Math.ceil(dt / (1 / 60))), h = dt / n;
          for (let i = 0; i < n; i++) this.step(h);
          this.renderer.update(dt);
        }
        this.renderer.draw(this.mode);
        this.adapt((performance.now() - t0) / 1000);
      } catch (err) {
        console.error(err);
        if (this.stats.errors.length < 20) this.stats.errors.push(String(err && err.stack || err));
      }
      requestAnimationFrame(t => this.frame(t));
    }
  };

  BKF.Game = Game;
  BKF.debug = {
    get world() { return Game.world; },
    get weather() { return Game.weather; },
    get mode() { return Game.mode; },
    get stats() { return Game.stats; },
    getState() {
      const w = Game.world; if (!w) return null;
      const st = w.getState();
      st.mode = Game.mode; st.particles = Game.weather ? Game.weather.particles.length : 0; st.fx = Game.renderer.texts.length + Game.renderer.rings.length + Game.renderer.flyers.length;
      return st;
    },
    setSpeed(n) { Game.speed = n; if (n !== 1) Game.runTainted = true; },
    startGame() { Game.startGame(); },
    flap() { return Game.flap(); },
    setBot(on, skill) { Game.botMode = on; if (on) Game.runTainted = true; Game.bot = on ? new BKF.Bot(Game.world, { skill: skill == null ? 1 : skill, seed: 11 }) : null; },
    setAutoRestart(on) { Game.autoRestart = on; },
    gotoLevel(i) { Game.world.gotoLevel(i); }   // emits levelUp → visuals, music, banner
  };

  window.addEventListener('DOMContentLoaded', () => Game.boot().catch(e => {
    console.error(e);
    document.body.insertAdjacentHTML('beforeend', '<pre style="color:#fff;padding:20px">Could not start the game: ' + (e && e.message) + '</pre>');
  }));
})(window.BKF = window.BKF || {});
