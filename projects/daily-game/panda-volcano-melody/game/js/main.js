/* main.js — game controller: boot, loop, input (hold a finger / the mouse → Tofu walks there; arrows/WASD),
 * modes, settings, test hooks. Modes: 'title' (bot demo) → 'playing' ⇄ 'paused' → 'over'.
 * The run lives in PVM.World (phases intro → playing → clear/over). */
(function (PVM) {
  'use strict';
  const params = new URLSearchParams(location.search);
  const num = (k, d) => { const v = parseFloat(params.get(k)); return isFinite(v) ? v : d; };
  const DIFFS = ['easy', 'normal', 'hard'];
  const isTouch = window.matchMedia ? window.matchMedia('(pointer:coarse)').matches : (('ontouchstart' in window) || navigator.maxTouchPoints > 0);
  const SEASON_NAMES = ['Spring', 'Summer', 'Autumn', 'Winter'];

  const Game = {
    mode: 'boot', isTouch,
    isApp: params.get('app') === '1' || typeof window.pvStoreSet === 'function',
    speed: Math.max(0.1, Math.min(64, num('speed', 1))),
    botMode: params.get('bot') === '1',
    autoRestart: params.get('autorestart') === '1',
    seed: params.has('seed') ? num('seed', 1) : null,
    urlDiff: DIFFS.includes(params.get('diff')) ? params.get('diff') : null,   // test flag, never saved
    world: null, weather: null, bot: null, renderer: null,
    settings: { sfx: true, music: true, muted: false, difficulty: 'easy' },   // a family game: first run on Easy
    fullscreen: false, overAt: 0, deadT: -1,
    stats: { games: 0, scores: [], times: [], levels: [], notes: 0, pinches: 0, errors: [] },

    async boot() {
      await PVM.Storage.init();
      // copy only known keys with the right type (a corrupted or hand-edited value must never break the game)
      const saved = PVM.Storage.getJSON('settings', {}) || {};
      ['sfx', 'music', 'muted'].forEach(k => { if (typeof saved[k] === 'boolean') this.settings[k] = saved[k]; });
      if (typeof saved.difficulty === 'string') this.settings.difficulty = saved.difficulty;
      if (!DIFFS.includes(this.settings.difficulty)) this.settings.difficulty = 'easy';
      this.urlMute = params.get('mute') === '1';
      PVM.Audio.setOptions({ sfx: this.settings.sfx, music: this.settings.music, muted: this.settings.muted || this.urlMute });
      this.debugView = params.get('debug') === '1';
      this.renderer = new PVM.Renderer(document.getElementById('game'));
      this.renderer.debugView = this.debugView;
      await PVM.Assets.loadAll();
      PVM.UI.init(this);
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
      return new PVM.World({ seed: s, difficulty: forTitle ? 'normal' : this.difficulty(), level: level || 0 });
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
    makeWeather() { return new PVM.Weather({ width: 960, height: 540, seed: 5 }); },
    _setLevelVisuals(season, instant) {
      season = ((season % 4) + 4) % 4;
      this.weather.setLevel(season, { instant });
      this.renderer.setLevel(season, instant);
      PVM.Audio.setLevel(season, this.world && this.world.loop);
    },

    toTitle() {
      PVM.Audio.stopMusic();
      this.mode = 'title';
      this.world = this.makeWorld(this.seed != null ? this.seed + 99 : null, true);
      this.bot = new PVM.Bot(this.world, { skill: 0.8, seed: 3 });
      this.weather = this.weather || this.makeWeather();
      this.renderer.attach(this.world, this.weather);
      this._setLevelVisuals(0, true);
      this.deadT = -1;
      PVM.UI.setHud(false);
      PVM.UI.show('scrTitle');
    },

    startGame() {
      PVM.Audio.unlock();
      { const t = document.getElementById('toast'); if (t) t.classList.add('hidden'); }
      this.runDifficulty = this.difficulty();
      const lv = params.has('level') ? Math.max(0, num('level', 0) | 0) : 0;
      this.world = this.makeWorld(null, false, lv);
      this.bot = this.botMode ? new PVM.Bot(this.world, { skill: num('skill', 1), seed: 11 }) : null;
      // a run touched by the bot or by test flags never saves a best score
      this.runTainted = this.botMode || params.has('speed') || params.has('level') || !!this.urlDiff;
      if (!this.weather) this.weather = this.makeWeather();
      const z = this.world.season || 0;
      this.renderer.attach(this.world, this.weather);
      this._setLevelVisuals(z, this.renderer.vis.cur === z % 4);
      PVM.Audio.startMusic();
      PVM.Audio.play('start');
      this.mode = 'playing';
      this.deadT = -1; this.runT = 0;
      PVM.UI.hideAll(); PVM.UI.setHud(true);
      this._keys = {}; this._ptr = null;
      this.syncRotate();
      this.canvasFocus();
    },

    pause() {
      if (this.mode !== 'playing') return;
      if (this.world && (this.world.phase === 'over' || this.deadT >= 0)) return;
      this.mode = 'paused';
      this._ptr = null; this._keys = {}; if (this.world) { this.world.clearTarget(); this.world.setAxis(0, 0); }
      PVM.UI.setHud(false);
      PVM.UI.show('scrPause');
      PVM.Audio.stopMusic();
    },
    resume() {
      if (this.mode !== 'paused') return;
      this.mode = 'playing';
      PVM.UI.hideAll(); PVM.UI.setHud(true);
      PVM.Audio.startMusic();
      this.last = performance.now();
      this.canvasFocus();
    },
    canvasFocus() { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); },
    canRestart() { return performance.now() - this.overAt > 700; },

    gameOver() {
      const w = this.world, key = 'best_' + (this.runDifficulty || this.difficulty());
      const prev = parseInt(PVM.Storage.get(key, '0'), 10) || 0, newBest = w.score > prev && !this.botMode && !this.runTainted;
      if (newBest) PVM.Storage.set(key, String(w.score));   // bot / test runs never overwrite a child's best
      this.mode = 'over'; this.overAt = performance.now();
      PVM.Audio.stopMusic();
      PVM.UI.setHud(false);
      const s = w.stats || {};
      PVM.UI.showGameOver({
        score: w.score, best: (this.botMode || this.runTainted) ? prev : Math.max(prev, w.score), newBest: newBest && w.score > 0,
        notes: s.notes || 0, bestCombo: s.bestCombo || 0, coco: s.cocoNotes || 0, cleared: s.levelsCleared || 0, perfect: s.perfectLevels || 0, time: this.runT || 0,
        reached: SEASON_NAMES[(w.season || 0) % 4] + ((w.loop || 0) > 0 ? ' (year ' + (w.loop + 1) + ')' : '')
      });
      if (newBest && w.score > 0) PVM.Audio.play('best');
      const st = this.stats;
      st.games++; st.scores.push(w.score); st.times.push(+(this.runT || 0).toFixed(2)); st.levels.push(w.level || 0);
      st.notes += s.notes || 0; st.pinches += s.pinches || 0;
      if (this.autoRestart) setTimeout(() => this.startGame(), 50);
    },

    best(d) { return parseInt(PVM.Storage.get('best_' + (d || this.difficulty()), '0'), 10) || 0; },
    resetBest() { DIFFS.forEach(d => PVM.Storage.del('best_' + d)); },
    setSetting(k, v) {
      this.settings[k] = v;
      PVM.Storage.setJSON('settings', this.settings);
      PVM.Audio.setOptions({ sfx: this.settings.sfx, music: this.settings.music, muted: this.settings.muted || this.urlMute });
      if (k === 'music' && v && this.mode === 'playing') PVM.Audio.startMusic();
    },
    toggleMute() {
      if (this.urlMute && !this.settings.muted) {
        this.urlMute = false;
        PVM.Audio.setOptions({ sfx: this.settings.sfx, music: this.settings.music, muted: false });
      } else {
        const on = !this.settings.muted;
        if (!on) this.urlMute = false;
        this.setSetting('muted', on);
      }
      PVM.UI.syncMute(); PVM.UI.toast(this.settings.muted || this.urlMute ? 'Sound off' : 'Sound on', 900);
    },
    setFullscreen(on) {
      this.fullscreen = on;
      if (typeof window.pvFullscreen === 'function') window.pvFullscreen(on);
      else if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
      else if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
      setTimeout(() => this.renderer.resize(), 150);
    },
    picturesChanged() { PVM.Assets._ver = (PVM.Assets._ver || 0) + 1; if (this.renderer) this.renderer._spr.clear(); },
    quit() { if (typeof window.pvQuit === 'function') window.pvQuit(); else window.close(); },

    // ---------------- input ----------------
    playerCanAct() { return this.mode === 'playing' && this.world && (this.world.phase === 'playing' || this.world.phase === 'intro') && !this.bot; },
    _syncAxis() {
      const k = this._keys || {}, w = this.world; if (!w || this.bot) return;
      const ax = (k.r ? 1 : 0) - (k.l ? 1 : 0), ay = (k.d ? 1 : 0) - (k.u ? 1 : 0);
      w.setAxis(ax, ay);
    },
    bindInput() {
      const DIRS = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd' };
      this._keys = {};
      window.addEventListener('keydown', e => {
        if (e.code === 'F11') { e.preventDefault(); this.setFullscreen(!this.fullscreen); PVM.UI.syncSettings(); return; }
        if (e.code === 'KeyM' && !e.repeat) { this.toggleMute(); return; }
        const ui = PVM.UI.current;
        if (e.code === 'Escape' || e.code === 'KeyP') {
          if (this.mode === 'playing') { this.pause(); e.preventDefault(); return; }
          if (this.mode === 'paused' && ui === 'scrPause') { this.resume(); e.preventDefault(); return; }
          if (ui === 'scrHow' || ui === 'scrSettings' || ui === 'scrCustom') { PVM.UI.back(); e.preventDefault(); return; }
          return;
        }
        if (this.mode === 'playing') {
          if (DIRS[e.code]) { e.preventDefault(); PVM.Audio.unlock(); this._keys[DIRS[e.code]] = true; this._syncAxis(); return; }
          if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); return; }
        }
        if (this.mode === 'over' && (e.code === 'Enter' || e.code === 'Space')) { const f = document.activeElement; if (f && f.tagName === 'BUTTON' && f.id !== 'btnAgain') return; e.preventDefault(); if (!e.repeat && this.canRestart()) this.startGame(); return; }
        if (this.mode === 'title' && ui === 'scrTitle' && (e.code === 'Space' || e.code === 'Enter')) {
          const f = document.activeElement;
          if (f && f.tagName === 'BUTTON' && f.id !== 'btnPlay') return;
          e.preventDefault(); this.startGame();
        }
      });
      window.addEventListener('keyup', e => { if (DIRS[e.code]) { this._keys[DIRS[e.code]] = false; this._syncAxis(); } });
      const stage = document.getElementById('stage'), canvas = document.getElementById('game');
      const onUi = e => e.target.closest && e.target.closest('button, .screen, #hud, #rotate, input, label');
      const aim = e => {
        const r = canvas.getBoundingClientRect();
        const [lx, ly] = this.renderer.toLogical(e.clientX - r.left, e.clientY - r.top);
        // aim at the finger, a little above it on touch so the finger never hides Tofu
        // (the target is Tofu's feet: a mouse points at his belly, a finger stands him just above it)
        const dy = e.pointerType === 'touch' ? -10 : 20;
        if (this.world && !this.bot) this.world.setTarget(lx, ly + dy);
      };
      stage.addEventListener('pointerdown', e => {
        PVM.Audio.unlock();
        if (onUi(e)) return;
        if (e.button === 2 || !this.playerCanAct()) return;
        e.preventDefault();
        this._ptr = e.pointerId;
        try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        aim(e);
      });
      stage.addEventListener('pointermove', e => { if (this._ptr === e.pointerId && this.playerCanAct()) aim(e); });
      const up = e => { if (this._ptr === e.pointerId) { this._ptr = null; if (this.world && !this.bot) this.world.clearTarget(); } };
      stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up); stage.addEventListener('lostpointercapture', up);
      window.addEventListener('blur', () => { this._keys = {}; this._syncAxis(); if (this.mode === 'playing') this.pause(); });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) { if (this.mode === 'playing') this.pause(); PVM.Audio.suspend(); }
        else PVM.Audio.resume();
      });
      const unlock = () => PVM.Audio.unlock();
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
      document.addEventListener('fullscreenchange', () => { this.fullscreen = !!document.fullscreenElement || (this.fullscreen && typeof window.pvFullscreen === 'function'); this.renderer.resize(); PVM.UI.syncSettings(); });
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
      const sound = this.mode !== 'title', A = PVM.Audio;
      for (const e of evts) {
        switch (e.type) {
          case 'intro': if (e.level != null && this.mode !== 'title') { const s = e.season != null ? e.season : e.level % 4; if (s !== this.renderer.vis.cur) this._setLevelVisuals(s, false); } break;
          case 'go': if (sound) A.play('start'); break;
          case 'step': if (sound) A.play('step'); break;
          case 'pop': if (sound) A.play('pop'); break;
          case 'rumble': if (sound) A.play('rumble'); break;
          case 'erupt': if (sound) A.play('erupt'); break;
          case 'land': if (sound) A.play('land'); break;
          case 'note': if (sound) A.songNote(e.idx, e.combo, e.byCoco); break;
          case 'comboEnd': if (sound) A.play('comboEnd', { n: e.n }); break;
          case 'helperIn': if (sound) A.play('helperIn'); break;
          case 'helperOut': if (sound) A.play('helperOut'); break;
          case 'crabIn': if (sound) A.play('crabIn'); break;
          case 'pinch': if (sound) A.play('pinch'); if (navigator.vibrate && this.mode === 'playing') { try { navigator.vibrate(40); } catch (err) { /* ignore */ } } break;
          case 'mangoPop': if (sound) A.play('mangoPop'); break;
          case 'mango': if (sound) A.play('mango'); break;
          case 'fade': if (sound) A.play('fade'); break;
          case 'levelClear': if (sound) A.play('level'); break;
          case 'levelUp': this._setLevelVisuals(e.season != null ? e.season : e.level % 4, false); break;
          case 'gameOver': if (sound) A.play('over'); A.stopMusic(); this.deadT = 0; if (this.mode !== 'title') PVM.UI.setHud(false); break;
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
      if (this.mode === 'playing' && this.deadT > 1.8) this.gameOver();   // let the nap be seen first
      if (this.mode === 'title' && (w.phase === 'over' || (w.level || 0) >= 1 || w.t > 70) && (this.deadT < 0 || this.deadT > 1)) {
        this.world = this.makeWorld(null, true);
        this.bot = new PVM.Bot(this.world, { skill: 0.8, seed: (Math.random() * 1e6) | 0 });
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

  PVM.Game = Game;
  PVM.debug = {
    get world() { return Game.world; },
    get weather() { return Game.weather; },
    get mode() { return Game.mode; },
    get stats() { return Game.stats; },
    getState() {
      const w = Game.world; if (!w) return null;
      const st = w.getState();
      st.mode = Game.mode; st.particles = Game.weather ? Game.weather.particles.length : 0; st.fx = Game.renderer.texts.length + Game.renderer.rings.length;
      st.season = w.season;
      return st;
    },
    setSpeed(n) { Game.speed = n; if (n !== 1) Game.runTainted = true; },
    startGame() { Game.startGame(); },
    setTarget(x, y) { if (Game.world) Game.world.setTarget(x, y); },
    clearTarget() { if (Game.world) Game.world.clearTarget(); },
    setAxis(ax, ay) { if (Game.world) Game.world.setAxis(ax, ay); },
    setBot(on, skill) { Game.botMode = on; if (on) Game.runTainted = true; Game.bot = on ? new PVM.Bot(Game.world, { skill: skill == null ? 1 : skill, seed: 11 }) : null; },
    setAutoRestart(on) { Game.autoRestart = on; },
    gotoLevel(i) { Game.world.gotoLevel(i); }
  };

  window.addEventListener('DOMContentLoaded', () => Game.boot().catch(e => {
    console.error(e);
    document.body.insertAdjacentHTML('beforeend', '<pre style="color:#fff;padding:20px">Could not start the game: ' + (e && e.message) + '</pre>');
  }));
})(window.PVM = window.PVM || {});
