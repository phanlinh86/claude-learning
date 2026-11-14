/* main.js — game controller: boot, loop, input (keys / pointer-follow / touch / action button), modes,
 * settings, test hooks. Modes: 'title' (bot demo) → 'playing' ⇄ 'paused' → 'over'. World states live in CD.World. */
(function (CD) {
  'use strict';
  const params = new URLSearchParams(location.search);
  const num = (k, d) => { const v = parseFloat(params.get(k)); return isFinite(v) ? v : d; };
  const BIOMES = ['Gumdrop Meadow', 'Chocolate River', 'Cotton Candy Clouds', 'Ice-Cream Glacier'];
  // phone / tablet (coarse pointer); a Windows touch laptop with a mouse keeps the desktop layout
  const isTouch = window.matchMedia ? window.matchMedia('(pointer:coarse)').matches : (('ontouchstart' in window) || navigator.maxTouchPoints > 0);
  // a finger aims Pip's feet this far (logical px) ABOVE the fingertip, so the finger never hides him
  const TOUCH_AIM = -30;

  function difficultyOverrides(d) { return Object.assign({}, (CD.DIFFICULTY && CD.DIFFICULTY[d]) || {}); }

  const Game = {
    mode: 'boot', isTouch, TOUCH_AIM,
    isApp: params.get('app') === '1' || typeof window.ffStoreSet === 'function',
    speed: Math.max(0.1, Math.min(64, num('speed', 1))),
    botMode: params.get('bot') === '1',
    autoRestart: params.get('autorestart') === '1',
    seed: params.has('seed') ? num('seed', 1) : null,
    world: null, weather: null, bot: null, renderer: null,
    settings: { sfx: true, music: true, muted: false, difficulty: 'normal' },
    fullscreen: false, overAt: 0, deadAt: -1,
    keys: {}, pointerDown: false, run: { gems: 0, pops: 0, bumps: 0, maxSize: 1 },
    stats: { games: 0, scores: [], times: [], levels: [], gems: 0, pops: 0, bumps: 0, errors: [] },

    async boot() {
      await CD.Storage.init();
      Object.assign(this.settings, CD.Storage.getJSON('settings', {}));
      this.urlMute = params.get('mute') === '1';
      CD.Audio.setOptions({ sfx: this.settings.sfx, music: this.settings.music, muted: this.settings.muted || this.urlMute });
      document.body.classList.toggle('touch', isTouch);
      this.renderer = new CD.Renderer(document.getElementById('game'));
      await CD.Assets.loadAll();
      CD.UI.init(this);
      this.bindInput();
      this.relayout();
      // rotation / resize / Safari toolbar changes / Split View: re-layout (debounced). The world keeps its
      // 960×540 arena; only the view around it changes. A finger that was steering is released so Pip doesn't jump.
      const onResize = () => { clearTimeout(this._rsz); this._rsz = setTimeout(() => this.relayout(), 120); };
      window.addEventListener('resize', onResize);
      window.addEventListener('orientationchange', () => { this.releasePointer(); onResize(); });
      if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
      if (params.get('autostart') === '1') this.startGame(); else this.toTitle();
      this.last = performance.now();
      requestAnimationFrame(t => this.frame(t));
    },

    makeWorld(seed, forTitle) {
      const s = seed != null ? seed : (this.seed != null ? this.seed : (Math.random() * 1e9) | 0);
      const w = new CD.World({ seed: s, config: forTitle ? {} : difficultyOverrides(this.settings.difficulty) });
      w.reset();
      return w;
    },
    /* safe-area insets (CSS px) read from a hidden element padded with env(safe-area-inset-*) */
    readInsets() {
      const el = document.getElementById('safeProbe'); if (!el) return null;
      const cs = getComputedStyle(el);
      return { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
    },
    relayout() {
      if (this._lastW != null && this._lastW !== window.innerWidth) this.releasePointer();   // rotation / Split View
      this._lastW = window.innerWidth;
      this.renderer.resize(this.readInsets());
      this.syncRotate();
    },
    releasePointer() {
      this.pointerDown = false; this._steerId = null;
      if (this._touches) this._touches.clear();
      if (this.renderer) this.renderer.pointer = null;
      if (this.world && this.world.setTarget) this.world.setTarget(null);
    },
    /* phones held upright: the 16:9 Candy Land gets small, so ask to turn sideways (dismissable for the session) */
    syncRotate() {
      const el = document.getElementById('rotate'); if (!el || !this.renderer) return;
      const on = this.isTouch && this.renderer.portrait && Math.min(window.innerWidth, window.innerHeight) < 600 && this.mode === 'playing' && !this._rotOk && !this.botMode;
      if (on && !this._rotOn) { this.releasePointer(); this.keys = {}; }
      this._rotOn = on; el.classList.toggle('hidden', !on);
    },
    makeWeather() { return new CD.Weather({ width: 960, height: 540, seed: 5 }); },

    toTitle() {
      CD.Audio.stopMusic();
      this.mode = 'title';
      this.world = this.makeWorld(this.seed != null ? this.seed + 99 : null, true);
      this.bot = new CD.Bot(this.world, { skill: 0.8, seed: 3 });
      this.weather = this.weather || this.makeWeather();
      this.weather.setSeason(0, { instant: true });
      this.renderer.attach(this.world, this.weather);
      this.renderer.setSeason(0, true);
      CD.Audio.setSeason(0);
      this.deadAt = -1;
      CD.UI.setHud(false); this.showAction(false);
      CD.UI.show('scrTitle');
    },

    startGame() {
      CD.Audio.unlock();
      this.runDifficulty = this.settings.difficulty;   // best score belongs to the difficulty the run started on
      this.world = this.makeWorld();
      const lv = params.has('level') ? Math.max(0, num('level', 0) | 0) : 0;
      if (lv > 0 && this.world.startLevel) this.world.startLevel(lv);
      this.bot = this.botMode ? new CD.Bot(this.world, { skill: num('skill', 1), seed: 11 }) : null;
      if (!this.weather) this.weather = this.makeWeather();
      const b = this.world.biome || 0;
      this.weather.setSeason(b, { instant: this.renderer.vis.cur === b });
      this.renderer.attach(this.world, this.weather);
      this.renderer.setSeason(b, this.renderer.vis.cur === b);
      this.renderer.showBanner(b);
      CD.Audio.setSeason(b); CD.Audio.play('start');
      if (this.settings.music) CD.Audio.startMusic();
      this.mode = 'playing';
      this.deadAt = -1; this.run = { gems: 0, pops: 0, bumps: 0, maxSize: 1 };
      this.keys = {}; this.pointerDown = false; this.renderer.pointer = null;
      CD.UI.hideAll(); CD.UI.setHud(true); this.showAction(true);
      this.syncRotate();
      this.canvasFocus();
    },
    showAction(on) { const b = document.getElementById('btnAction'); if (b) b.classList.toggle('hidden', !(on && isTouch)); },

    pause() {
      if (this.mode !== 'playing') return;
      if (this.world && this.world.state === 'dead') return;
      this.mode = 'paused'; this.keys = {}; this.releasePointer();
      CD.UI.setHud(false); this.showAction(false);
      CD.UI.show('scrPause');
    },
    resume() {
      if (this.mode !== 'paused') return;
      this.mode = 'playing';
      CD.UI.hideAll(); CD.UI.setHud(true); this.showAction(true);
      this.last = performance.now();
      this.canvasFocus();
    },
    canvasFocus() { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); },
    canRestart() { return performance.now() - this.overAt > 700; },

    gameOver() {
      const w = this.world, key = 'best_' + (this.runDifficulty || this.settings.difficulty);
      const prev = parseInt(CD.Storage.get(key, '0'), 10) || 0, newBest = w.score > prev;
      if (newBest) CD.Storage.set(key, String(w.score));
      this.mode = 'over'; this.overAt = performance.now();
      CD.UI.setHud(false); this.showAction(false);
      CD.UI.showGameOver({
        score: w.score, best: Math.max(prev, w.score), newBest: newBest && w.score > 0,
        gems: this.run.gems, pops: this.run.pops, bumps: this.run.bumps, maxSize: this.run.maxSize, cleared: w.level || 0,
        biomeName: BIOMES[w.biome || 0] + ((w.lap || 0) > 0 ? ' (lap ' + (w.lap + 1) + ')' : '')
      });
      if (newBest && w.score > 0) CD.Audio.play('best');
      const st = this.stats;
      st.games++; st.scores.push(w.score); st.times.push(+w.time.toFixed(2)); st.levels.push(w.level || 0);
      st.gems += this.run.gems; st.pops += this.run.pops; st.bumps += this.run.bumps;
      if (this.autoRestart) setTimeout(() => this.startGame(), 50);
    },

    best() { return parseInt(CD.Storage.get('best_' + this.settings.difficulty, '0'), 10) || 0; },
    resetBest() { ['easy', 'normal', 'hard'].forEach(d => CD.Storage.del('best_' + d)); },
    setSetting(k, v) {
      this.settings[k] = v;
      CD.Storage.setJSON('settings', this.settings);
      CD.Audio.setOptions({ sfx: this.settings.sfx, music: this.settings.music, muted: this.settings.muted || this.urlMute });
      if (k === 'music') { if (v && this.mode !== 'title') CD.Audio.startMusic(); if (!v) CD.Audio.stopMusic(); }
    },
    toggleMute() { this.setSetting('muted', !this.settings.muted); CD.UI.syncMute(); CD.UI.toast(this.settings.muted ? 'Sound off' : 'Sound on', 900); },
    setFullscreen(on) {
      this.fullscreen = on;
      if (typeof window.ffFullscreen === 'function') window.ffFullscreen(on);
      else if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
      else if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
      setTimeout(() => this.renderer.resize(), 150);
    },
    picturesChanged() { CD.Assets._ver = (CD.Assets._ver || 0) + 1; },
    quit() { if (typeof window.ffQuit === 'function') window.ffQuit(); else window.close(); },

    // ---------------- input ----------------
    playerCanAct() { return this.mode === 'playing' && this.world && this.world.state !== 'dead' && !this.bot; },
    action() { CD.Audio.unlock(); if (this.playerCanAct()) this.world.action(); },
    applyMove() {
      this.renderer.pointerHeld = this.pointerDown;
      if (!this.playerCanAct()) return;
      const k = this.keys;
      const mx = (k.ArrowRight || k.KeyD ? 1 : 0) - (k.ArrowLeft || k.KeyA ? 1 : 0);
      const my = (k.ArrowDown || k.KeyS ? 1 : 0) - (k.ArrowUp || k.KeyW ? 1 : 0);
      if (mx || my) { const l = Math.hypot(mx, my); this.world.setMove(mx / l, my / l); this.world.setTarget(null); this.renderer.pointer = null; }
      else {
        this.world.setMove(0, 0);
        if (this.pointerDown && this.renderer.pointer) this.world.setTarget(this.renderer.pointer[0], this.renderer.pointer[1]);
        else this.world.setTarget(null);
      }
    },
    bindInput() {
      const MOVE = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'];
      window.addEventListener('keydown', e => {
        if (e.code === 'F11') { e.preventDefault(); this.setFullscreen(!this.fullscreen); CD.UI.syncSettings(); return; }
        if (e.code === 'KeyM' && !e.repeat) { this.toggleMute(); return; }
        const ui = CD.UI.current;
        if (e.code === 'Escape' || e.code === 'KeyP') {
          if (this.mode === 'playing') { this.pause(); e.preventDefault(); return; }
          if (this.mode === 'paused' && ui === 'scrPause') { this.resume(); e.preventDefault(); return; }
          if (ui === 'scrHow' || ui === 'scrSettings' || ui === 'scrCustom') { CD.UI.back(); e.preventDefault(); return; }
          return;
        }
        if (this.mode === 'playing') {
          if (MOVE.includes(e.code)) { e.preventDefault(); this.keys[e.code] = true; CD.Audio.unlock(); return; }
          if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') { e.preventDefault(); if (!e.repeat) this.action(); return; }
        }
        if (this.mode === 'over' && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); if (this.canRestart()) this.startGame(); return; }
        if (this.mode === 'title' && ui === 'scrTitle' && e.code === 'Space') {
          const f = document.activeElement;
          if (f && f.tagName === 'BUTTON' && f.id !== 'btnPlay') return;
          e.preventDefault(); this.startGame();
        }
      });
      window.addEventListener('keyup', e => { delete this.keys[e.code]; });
      const stage = document.getElementById('stage');
      // the finger aims a bit above itself (Pip stays visible); the mouse aims exactly at the cursor
      const setPtr = e => {
        const p = this.renderer.toLogical(e.clientX, e.clientY);
        if (e.pointerType === 'touch' || e.pointerType === 'pen') p[1] += TOUCH_AIM;
        this.renderer.pointer = p;
      };
      stage.addEventListener('pointerdown', e => {
        if (e.target.closest && e.target.closest('button, .screen, #hud, #rotate, input, label')) return;   // HUD/menu taps never move Pip
        if (this.mode !== 'playing' || this._rotOn) return;
        e.preventDefault(); CD.Audio.unlock();
        if (e.button === 2) { this.action(); return; }
        if (e.pointerType === 'touch' && this._touches && this._touches.size >= 1) { this.action(); return; }   // second finger = action
        (this._touches = this._touches || new Set()).add(e.pointerId);
        this._steerId = e.pointerId;   // only this finger / button steers Pip
        this.pointerDown = true; setPtr(e);
        // keep receiving moves even if the finger slides over the ★ / HUD or off the screen edge
        try { if (e.pointerType === 'touch') stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      });
      stage.addEventListener('pointermove', e => {
        if (this.mode !== 'playing') return;
        if (e.pointerType === 'mouse') { if (!this.pointerDown || e.pointerId === this._steerId) setPtr(e); return; }
        if (this.pointerDown && e.pointerId === this._steerId) setPtr(e);
      });
      const up = e => {
        if (this._touches) this._touches.delete(e.pointerId);
        // the steering finger lifted: Pip stops following, even if a second (action) finger is still down
        if (e.pointerId === this._steerId || !this._touches || !this._touches.size) {
          this._steerId = null; this.pointerDown = false; if (e.pointerType !== 'mouse') this.renderer.pointer = null;
        }
      };
      window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
      const act = document.getElementById('btnAction');
      if (act) act.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.action(); });
      window.addEventListener('blur', () => { this.keys = {}; this.pointerDown = false; if (this.mode === 'playing') this.pause(); });
      // home button / app switch / screen lock: pause, let go of the finger, and stop the audio clock
      document.addEventListener('visibilitychange', () => {
        const A = CD.Audio;
        if (document.hidden) {
          if (this.mode === 'playing') this.pause();
          this.releasePointer();
          A._hidden = true; if (A.ctx && A.ctx.state === 'running') A.ctx.suspend().catch(() => {});
        } else {
          A._hidden = false; if (A.ctx && A.ctx.state !== 'running') A.ctx.resume().catch(() => {});
        }
      });
      // iOS: audio may only start inside a gesture: unlock on the first touchend / click / key
      const unlock = () => CD.Audio.unlock();
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
      document.addEventListener('fullscreenchange', () => { this.fullscreen = !!document.fullscreenElement || (this.fullscreen && typeof window.ffFullscreen === 'function'); this.renderer.resize(); CD.UI.syncSettings(); });
    },

    /* Touch kid-proofing (iPhone / iPad): no pinch or double-tap zoom, no long-press callout, no rubber-band
     * scroll or pull-to-refresh. Menu panels (which may scroll on a small phone) opt back in. */
    kidProof() {
      const NP = { passive: false }, prevent = e => { if (e.cancelable) e.preventDefault(); };
      const formy = t => t && t.closest && t.closest('input, textarea, select, .scroll, .panel');
      ['gesturestart', 'gesturechange', 'gestureend'].forEach(t => document.addEventListener(t, prevent, NP));
      document.addEventListener('touchmove', e => { if (!formy(e.target) || e.touches.length > 1) prevent(e); }, NP);
      let lastEnd = 0;
      document.addEventListener('touchend', e => {
        const t = Date.now();
        if (t - lastEnd < 320 && !(e.target.closest && e.target.closest('button, a, input, label, select, .scroll, .prev, .slot'))) prevent(e);
        lastEnd = t;
      }, NP);
      document.addEventListener('dblclick', e => { if (!formy(e.target)) prevent(e); }, NP);
    },

    handleEvents(evts) {
      const sound = this.mode !== 'title', w = this.world;
      for (const e of evts) {
        switch (e.type) {
          case 'gem': if (sound) CD.Audio.play('gem', { size: e.size }); this.run.gems++; break;
          case 'grow': if (sound) CD.Audio.play('grow'); this.run.maxSize = Math.max(this.run.maxSize, e.size || w.size); break;
          case 'maxsize': if (sound) CD.Audio.play('maxsize'); break;
          case 'pop': if (sound) CD.Audio.play('pop'); this.run.pops++; break;
          case 'dash': if (sound) CD.Audio.play('dash'); break;
          case 'bump': if (sound) CD.Audio.play('bump'); this.run.bumps++; break;
          case 'drop': if (sound) CD.Audio.play('drop'); break;
          case 'jarfull': if (sound) CD.Audio.play('jarfull'); break;
          case 'gateopen': if (sound) CD.Audio.play('gateopen'); break;
          case 'cleared': if (sound) CD.Audio.play('cleared'); break;
          case 'biome': case 'season': {
            const b = e.biome != null ? e.biome : e.season;
            this.weather.setSeason(b); CD.Audio.setSeason(b);
            if (sound && (e.level || 0) > 0) CD.Audio.play('season');
            break;
          }
          case 'dead': if (sound) CD.Audio.play('dead'); this.deadAt = w.time; break;
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
      this.weather.update(h, {});
      if (this.mode === 'playing' && w.state === 'dead' && this.deadAt >= 0 && w.time - this.deadAt > 1.4) this.gameOver();
      if (this.mode === 'title' && (w.state === 'dead' || (w.level || 0) >= 2) && (this.deadAt >= 0 ? w.time - this.deadAt > 1.5 : true)) {
        this.world = this.makeWorld(null, true);
        this.bot = new CD.Bot(this.world, { skill: 0.8, seed: (Math.random() * 1e6) | 0 });
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
        if (this.isTouch) this.syncRotate();
        if (this.mode !== 'paused' && this.world && !this._rotOn) {
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

  CD.Game = Game;
  CD.debug = {
    get world() { return Game.world; },
    get weather() { return Game.weather; },
    get mode() { return Game.mode; },
    get stats() { return Game.stats; },
    getState() {
      const w = Game.world;
      return w && { mode: Game.mode, state: w.state, score: w.score, level: w.level, biome: w.biome, lap: w.lap, hearts: w.hearts,
        size: w.size, jar: w.jar, jarTarget: w.jarTarget, time: w.time, bears: w.bears.length, gems: w.gems.length,
        pip: w.pip && { x: Math.round(w.pip.x), y: Math.round(w.pip.y) }, particles: Game.weather ? Game.weather.particles.length : 0, fx: Game.renderer.fx.length };
    },
    setSpeed(n) { Game.speed = n; },
    startGame() { Game.startGame(); },
    setBot(on, skill) { Game.botMode = on; Game.bot = on ? new CD.Bot(Game.world, { skill: skill == null ? 1 : skill, seed: 11 }) : null; },
    setAutoRestart(on) { Game.autoRestart = on; },
    gotoLevel(i) { Game.world.startLevel(i); }
  };

  window.addEventListener('DOMContentLoaded', () => Game.boot().catch(e => {
    console.error(e);
    document.body.insertAdjacentHTML('beforeend', '<pre style="color:#fff;padding:20px">Could not start the game: ' + (e && e.message) + '</pre>');
  }));
})(window.CD = window.CD || {});
