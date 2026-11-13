/* main.js — game controller: boot, loop, input (tap / click a card; arrows/WASD + Space/Enter), modes, settings, test hooks.
 * Modes: 'title' (bot demo) → 'playing' ⇄ 'paused' → 'over'. The run lives in CGF.World (phases deal → peek → playing → clear/over). */
(function (CGF) {
  'use strict';
  const params = new URLSearchParams(location.search);
  const num = (k, d) => { const v = parseFloat(params.get(k)); return isFinite(v) ? v : d; };
  const DIFFS = ['easy', 'normal', 'hard'];
  const isTouch = window.matchMedia ? window.matchMedia('(pointer:coarse)').matches : (('ontouchstart' in window) || navigator.maxTouchPoints > 0);
  const SEASON_NAMES = ['Spring', 'Summer', 'Autumn', 'Winter'];

  const Game = {
    mode: 'boot', isTouch,
    isApp: params.get('app') === '1' || typeof window.cgStoreSet === 'function',
    speed: Math.max(0.1, Math.min(64, num('speed', 1))),
    botMode: params.get('bot') === '1',
    autoRestart: params.get('autorestart') === '1',
    seed: params.has('seed') ? num('seed', 1) : null,
    urlDiff: DIFFS.includes(params.get('diff')) ? params.get('diff') : null,   // test flag, never saved
    world: null, weather: null, bot: null, renderer: null,
    settings: { sfx: true, music: true, muted: false, difficulty: 'easy' },   // a family game: first run on Easy
    fullscreen: false, overAt: 0, deadT: -1,
    stats: { games: 0, scores: [], times: [], levels: [], matches: 0, misses: 0, flips: 0, errors: [] },

    async boot() {
      await CGF.Storage.init();
      // copy only known keys with the right type (a corrupted or hand-edited value must never break the game)
      const saved = CGF.Storage.getJSON('settings', {}) || {};
      ['sfx', 'music', 'muted'].forEach(k => { if (typeof saved[k] === 'boolean') this.settings[k] = saved[k]; });
      if (typeof saved.difficulty === 'string') this.settings.difficulty = saved.difficulty;
      if (!DIFFS.includes(this.settings.difficulty)) this.settings.difficulty = 'easy';
      this.urlMute = params.get('mute') === '1';
      CGF.Audio.setOptions({ sfx: this.settings.sfx, music: this.settings.music, muted: this.settings.muted || this.urlMute });
      this.debugView = params.get('debug') === '1';
      this.renderer = new CGF.Renderer(document.getElementById('game'));
      await CGF.Assets.loadAll();
      CGF.UI.init(this);
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
      const s = seed != null ? seed : (this.seed != null ? this.seed + this.stats.games : (Math.random() * 1e9) | 0);
      return new CGF.World({ seed: s, difficulty: forTitle ? 'normal' : this.difficulty(), level: level || 0, customGem: CGF.Assets.hasCustom('gem') });
    },
    readInsets() {
      const el = document.getElementById('safeProbe'); if (!el) return null;
      const cs = getComputedStyle(el);
      return { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
    },
    relayout() { this.renderer.resize(this.readInsets()); this.syncRotate(); },
    /* phones held upright: the cards get tiny, so ask to turn sideways (once dismissed, never again this session) */
    syncRotate() {
      const el = document.getElementById('rotate'); if (!el) return;
      const on = this.isTouch && this.renderer.portrait && Math.min(window.innerWidth, window.innerHeight) < 600 && this.mode === 'playing' && !this._rotOk && !this.botMode;
      this._rotOn = on; el.classList.toggle('hidden', !on);
    },
    makeWeather() { return new CGF.Weather({ width: this.renderer.VW, height: this.renderer.VH, seed: 5 }); },
    _setLevelVisuals(season, instant) {
      season = ((season % 4) + 4) % 4;
      this.weather.setLevel(season, { instant });
      this.renderer.setLevel(season, instant);
      CGF.Audio.setLevel(season, this.world && this.world.loop);
    },

    toTitle() {
      CGF.Audio.stopMusic();
      this.mode = 'title';
      this.world = this.makeWorld(this.seed != null ? this.seed + 99 : null, true);
      this.bot = new CGF.Bot(this.world, { skill: 0.8, seed: 3 });
      this.weather = this.weather || this.makeWeather();
      this.renderer.attach(this.world, this.weather);
      this._setLevelVisuals(0, true);
      this.deadT = -1;
      CGF.UI.setHud(false);
      CGF.UI.show('scrTitle');
    },

    startGame() {
      CGF.Audio.unlock();
      { const t = document.getElementById('toast'); if (t) t.classList.add('hidden'); }
      this.runDifficulty = this.difficulty();
      const lv = params.has('level') ? Math.max(0, num('level', 0) | 0) : 0;
      this.world = this.makeWorld(null, false, lv);
      this.bot = this.botMode ? new CGF.Bot(this.world, { skill: num('skill', 1), seed: 11 }) : null;
      // a run touched by the bot or by test flags never saves a best score
      this.runTainted = this.botMode || params.has('speed') || params.has('level') || !!this.urlDiff;
      if (!this.weather) this.weather = this.makeWeather();
      const z = this.world.season || 0;
      this.renderer.attach(this.world, this.weather);
      this._setLevelVisuals(z, this.renderer.vis.cur === z % 4);
      CGF.Audio.startMusic();
      CGF.Audio.play('start');
      this.mode = 'playing';
      this.deadT = -1; this.runT = 0;
      CGF.UI.hideAll(); CGF.UI.setHud(true);
      // the world emits its first 'deal' on the first update; make sure the renderer sees the season banner
      this.syncRotate();
      this.canvasFocus();
    },

    pause() {
      if (this.mode !== 'playing') return;
      if (this.world && (this.world.phase === 'over' || this.deadT >= 0)) return;
      this.mode = 'paused';
      CGF.UI.setHud(false);
      CGF.UI.show('scrPause');
      CGF.Audio.stopMusic();
    },
    resume() {
      if (this.mode !== 'paused') return;
      this.mode = 'playing';
      CGF.UI.hideAll(); CGF.UI.setHud(true);
      CGF.Audio.startMusic();
      this.last = performance.now();
      this.canvasFocus();
    },
    canvasFocus() { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); },
    canRestart() { return performance.now() - this.overAt > 700; },

    gameOver() {
      const w = this.world, key = 'best_' + (this.runDifficulty || this.difficulty());
      const prev = parseInt(CGF.Storage.get(key, '0'), 10) || 0, newBest = w.score > prev && !this.botMode && !this.runTainted;
      if (newBest) CGF.Storage.set(key, String(w.score));   // bot / test runs never overwrite a child's best
      this.mode = 'over'; this.overAt = performance.now();
      CGF.Audio.stopMusic();
      CGF.UI.setHud(false);
      const s = w.stats || {};
      const bestMult = Math.max(1, Math.min(5, s.bestStreak || 0));
      CGF.UI.showGameOver({
        score: w.score, best: (this.botMode || this.runTainted) ? prev : Math.max(prev, w.score), newBest: newBest && w.score > 0,
        matches: s.matches || 0, bestMult, cleared: s.levelsCleared || 0, perfect: s.perfectLevels || 0, time: this.runT || 0,
        reached: SEASON_NAMES[(w.season || 0) % 4] + ((w.loop || 0) > 0 ? ' (year ' + (w.loop + 1) + ')' : '')
      });
      if (newBest && w.score > 0) CGF.Audio.play('best');
      const st = this.stats;
      st.games++; st.scores.push(w.score); st.times.push(+(this.runT || 0).toFixed(2)); st.levels.push(w.level || 0);
      st.matches += s.matches || 0; st.misses += s.misses || 0; st.flips += s.flips || 0;
      if (this.autoRestart) setTimeout(() => this.startGame(), 50);
    },

    best(d) { return parseInt(CGF.Storage.get('best_' + (d || this.difficulty()), '0'), 10) || 0; },
    resetBest() { DIFFS.forEach(d => CGF.Storage.del('best_' + d)); },
    setSetting(k, v) {
      this.settings[k] = v;
      CGF.Storage.setJSON('settings', this.settings);
      CGF.Audio.setOptions({ sfx: this.settings.sfx, music: this.settings.music, muted: this.settings.muted || this.urlMute });
      if (k === 'music' && v && this.mode === 'playing') CGF.Audio.startMusic();
    },
    toggleMute() {
      if (this.urlMute && !this.settings.muted) {
        this.urlMute = false;
        CGF.Audio.setOptions({ sfx: this.settings.sfx, music: this.settings.music, muted: false });
      } else {
        const on = !this.settings.muted;
        if (!on) this.urlMute = false;
        this.setSetting('muted', on);
      }
      CGF.UI.syncMute(); CGF.UI.toast(this.settings.muted || this.urlMute ? 'Sound off' : 'Sound on', 900);
    },
    setFullscreen(on) {
      this.fullscreen = on;
      if (typeof window.cgFullscreen === 'function') window.cgFullscreen(on);
      else if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
      else if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
      setTimeout(() => this.renderer.resize(), 150);
    },
    picturesChanged() { CGF.Assets._ver = (CGF.Assets._ver || 0) + 1; if (this.renderer) this.renderer._spr.clear(); },
    quit() { if (typeof window.cgQuit === 'function') window.cgQuit(); else window.close(); },

    // ---------------- input ----------------
    playerCanAct() { return this.mode === 'playing' && this.world && this.world.phase === 'playing' && !this.bot; },
    tapAt(lx, ly) { if (!this.playerCanAct()) return false; CGF.Audio.unlock(); return this.world.tapAt(lx, ly); },
    bindInput() {
      const MOVES = { ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1] };
      window.addEventListener('keydown', e => {
        if (e.code === 'F11') { e.preventDefault(); this.setFullscreen(!this.fullscreen); CGF.UI.syncSettings(); return; }
        if (e.code === 'KeyM' && !e.repeat) { this.toggleMute(); return; }
        const ui = CGF.UI.current;
        if (e.code === 'Escape' || e.code === 'KeyP') {
          if (this.mode === 'playing') { this.pause(); e.preventDefault(); return; }
          if (this.mode === 'paused' && ui === 'scrPause') { this.resume(); e.preventDefault(); return; }
          if (ui === 'scrHow' || ui === 'scrSettings' || ui === 'scrCustom') { CGF.UI.back(); e.preventDefault(); return; }
          return;
        }
        if (this.mode === 'playing') {
          if (MOVES[e.code]) { e.preventDefault(); if (this.world && !this.bot) this.world.moveCursor(MOVES[e.code][0], MOVES[e.code][1]); return; }
          if (e.code === 'Space' || e.code === 'Enter') {
            e.preventDefault();
            if (!e.repeat && this.playerCanAct()) { CGF.Audio.unlock(); if (!this.world.cursorOn) this.world.moveCursor(0, 0); else this.world.tapCursor(); }
            return;
          }
        }
        if (this.mode === 'over' && (e.code === 'Enter' || e.code === 'Space')) { const f = document.activeElement; if (f && f.tagName === 'BUTTON' && f.id !== 'btnAgain') return; e.preventDefault(); if (!e.repeat && this.canRestart()) this.startGame(); return; }
        if (this.mode === 'title' && ui === 'scrTitle' && (e.code === 'Space' || e.code === 'Enter')) {
          const f = document.activeElement;
          if (f && f.tagName === 'BUTTON' && f.id !== 'btnPlay') return;
          e.preventDefault(); this.startGame();
        }
      });
      const stage = document.getElementById('stage'), canvas = document.getElementById('game');
      const onUi = e => e.target.closest && e.target.closest('button, .screen, #hud, #rotate, input, label');
      stage.addEventListener('pointerdown', e => {
        CGF.Audio.unlock();
        if (onUi(e)) return;
        if (e.button === 2 || !this.playerCanAct()) return;
        e.preventDefault();
        const r = canvas.getBoundingClientRect();
        const [lx, ly] = this.renderer.toLogical(e.clientX - r.left, e.clientY - r.top);
        if (this.world.cursorOn && e.pointerType !== 'mouse') this.world.cursorOn = false;   // a finger hides the keyboard ring
        this.tapAt(lx, ly);
      });
      window.addEventListener('blur', () => { if (this.mode === 'playing') this.pause(); });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) { if (this.mode === 'playing') this.pause(); CGF.Audio.suspend(); }
        else CGF.Audio.resume();
      });
      const unlock = () => CGF.Audio.unlock();
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
      document.addEventListener('fullscreenchange', () => { this.fullscreen = !!document.fullscreenElement || (this.fullscreen && typeof window.cgFullscreen === 'function'); this.renderer.resize(); CGF.UI.syncSettings(); });
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
      const sound = this.mode !== 'title', A = CGF.Audio, wx = this.weather;
      for (const e of evts) {
        switch (e.type) {
          case 'deal': if (sound) A.play('deal'); if (e.level != null && this.mode !== 'title') { const s = e.season != null ? e.season : e.level % 4; if (s !== this.renderer.vis.cur) this._setLevelVisuals(s, false); } break;
          case 'flip': if (sound) A.play('flip'); break;
          case 'match': if (sound) A.play('match', { mult: e.mult }); break;
          case 'miss': if (sound) A.play('miss'); break;
          case 'comboUp': if (sound) A.play('comboUp', { mult: e.mult }); break;
          case 'comboDown': if (sound) A.play('comboDown'); break;
          case 'gemLand': if (sound) A.play('gemLand'); break;
          case 'timeBonus': if (sound) A.play('timeBonus'); break;
          case 'hurry': if (sound) A.play('hurry'); break;
          case 'tick': if (sound) A.play('tick', { s: e.s }); break;
          case 'levelClear': if (sound) A.play('level'); break;
          case 'levelUp': this._setLevelVisuals(e.season != null ? e.season : e.level % 4, false); break;
          case 'gameOver': if (sound) A.play('over'); A.stopMusic(); this.deadT = 0; if (this.mode !== 'title') CGF.UI.setHud(false); break;
        }
      }
      this.renderer.onEvents(evts);
    },

    step(h) {
      const w = this.world;
      if (this.bot && (this.mode === 'playing' || this.mode === 'title')) this.bot.step(h);
      w.update(h);
      const ev = w.drainEvents();
      if (ev.length) this.handleEvents(ev);
      if (this.mode === 'playing') this.runT += h;
      if (w.phase === 'over' && this.deadT < 0) this.deadT = 0;
      if (this.deadT >= 0) this.deadT += h;
      if (this.mode === 'playing' && this.deadT > 1.6) this.gameOver();   // let the nap be seen first
      if (this.mode === 'title' && (w.phase === 'over' || (w.level || 0) >= 1 || w.t > 70) && (this.deadT < 0 || this.deadT > 1)) {
        this.world = this.makeWorld(null, true);
        this.bot = new CGF.Bot(this.world, { skill: 0.8, seed: (Math.random() * 1e6) | 0 });
        this.renderer.attach(this.world, this.weather); this.deadT = -1;
        this._setLevelVisuals(0, false);
      }
    },

    /* Adaptive quality: judge the time spent on OUR work (simulate + draw) AND the real frame interval.
     * Canvas 2D records our draw calls and rasterizes them after the script returns, so JS time alone stays
     * at ~1–5 ms while the frame really takes 30–100 ms on a slow device. The interval is compared with the
     * fastest interval seen, so a 30 Hz Low Power Mode cap or a 120 Hz screen never counts as "slow". */
    adapt(work, iv) {
      if (params.get('adaptive') === '0' || this.mode === 'paused' || this.mode === 'boot' || this.speed !== 1 || document.hidden) return;
      if (this._adaptHold > 0) { this._adaptHold--; return; }
      this._wt = this._wt == null ? work : this._wt + (work - this._wt) * 0.05;
      if (iv > 0.004 && iv < 0.25) {
        this._ivMin = Math.min(iv, this._ivMin == null ? iv : this._ivMin + 0.00002);   // relaxes ~1 ms/s
        this._iv = this._iv == null ? iv : this._iv + (iv - this._iv) * 0.05;
      }
      const ivSlow = this._iv != null && this._iv > Math.max(1.5 * this._ivMin, 0.025);
      const ivFast = this._iv == null || this._iv < 1.2 * this._ivMin + 0.002;
      const R = this.renderer, natural = R.cssScale * (window.devicePixelRatio || 1);
      const floor = Math.max(1, this.isTouch ? natural * 0.67 : 1);
      if (this._wt > 0.014 || ivSlow) { this._slowN = (this._slowN || 0) + 1; this._fastN = 0; }
      else if (this._wt < 0.006 && ivFast) { this._fastN = (this._fastN || 0) + 1; this._slowN = 0; }
      else { this._slowN = 0; this._fastN = 0; }
      if (this._slowN > 90 && R.px > floor + 0.01) { R.maxPx = Math.max(floor, R.px * 0.8); R.resize(); this._slowN = 0; this._wt = null; this._iv = null; this._adaptHold = 60; }
      else if (this._fastN > 300 && R.maxPx && R.px < natural - 0.01) { R.maxPx = Math.min(natural, R.px * 1.2); if (R.maxPx >= natural) R.maxPx = 0; R.resize(); this._fastN = 0; this._wt = null; this._iv = null; this._adaptHold = 60; }
    },

    frame(ts) {
      const t0 = performance.now();
      if (this.isTouch) this.syncRotate();
      let iv = 0;
      try {
        iv = Math.max(0, (ts - this.last) / 1000);
        const real = Math.min(0.1, iv);
        this.last = ts;
        const dt = real * this.speed;
        if (this.mode !== 'paused' && this.world && !this._rotOn) {
          const n = Math.max(1, Math.ceil(dt / (1 / 60))), h = dt / n;
          for (let i = 0; i < n; i++) this.step(h);
          this.renderer.update(dt);
        }
        this.renderer.draw(this.mode);
        this.adapt((performance.now() - t0) / 1000, iv);
      } catch (err) {
        console.error(err);
        if (this.stats.errors.length < 20) this.stats.errors.push(String(err && err.stack || err));
      }
      requestAnimationFrame(t => this.frame(t));
    }
  };

  CGF.Game = Game;
  CGF.debug = {
    get world() { return Game.world; },
    get weather() { return Game.weather; },
    get mode() { return Game.mode; },
    get stats() { return Game.stats; },
    getState() {
      const w = Game.world; if (!w) return null;
      const st = w.getState();
      st.mode = Game.mode; st.particles = Game.weather ? Game.weather.particles.length : 0; st.fx = Game.renderer.texts.length + Game.renderer.rings.length;
      return st;
    },
    setSpeed(n) { Game.speed = n; if (n !== 1) Game.runTainted = true; },
    startGame() { Game.startGame(); },
    tap(i) { if (!Game.playerCanAct()) return false; CGF.Audio.unlock(); return Game.world.tap(i); },
    setBot(on, skill) { Game.botMode = on; if (on) Game.runTainted = true; Game.bot = on ? new CGF.Bot(Game.world, { skill: skill == null ? 1 : skill, seed: 11 }) : null; },
    setAutoRestart(on) { Game.autoRestart = on; },
    gotoLevel(i) { Game.world.gotoLevel(i); }
  };

  window.addEventListener('DOMContentLoaded', () => Game.boot().catch(e => {
    console.error(e);
    document.body.insertAdjacentHTML('beforeend', '<pre style="color:#fff;padding:20px">Could not start the game: ' + (e && e.message) + '</pre>');
  }));
})(window.CGF = window.CGF || {});
