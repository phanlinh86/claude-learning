/* main.js — game controller: boot, loop, input (keys / horizontal pointer-follow / touch / Cool Rain button), modes,
 * settings, test hooks. Modes: 'title' (bot demo) → 'playing' ⇄ 'paused' → 'over'. World states live in VC.World. */
(function (VC) {
  'use strict';
  const params = new URLSearchParams(location.search);
  const num = (k, d) => { const v = parseFloat(params.get(k)); return isFinite(v) ? v : d; };
  const ZONES = ['Sunny Beach', 'Jungle Slopes', 'Ash Fields', 'Crater Rim'];
  // phone / tablet (coarse pointer); a Windows touch laptop with a mouse keeps the desktop layout
  const isTouch = window.matchMedia ? window.matchMedia('(pointer:coarse)').matches : (('ontouchstart' in window) || navigator.maxTouchPoints > 0);

  function difficultyOverrides(d) { return Object.assign({}, (VC.DIFFICULTY && VC.DIFFICULTY[d]) || {}); }

  const Game = {
    mode: 'boot', isTouch,
    isApp: params.get('app') === '1' || typeof window.ffStoreSet === 'function',
    speed: Math.max(0.1, Math.min(64, num('speed', 1))),
    botMode: params.get('bot') === '1',
    autoRestart: params.get('autorestart') === '1',
    seed: params.has('seed') ? num('seed', 1) : null,
    world: null, weather: null, bot: null, renderer: null,
    settings: { sfx: true, music: true, muted: false, difficulty: 'normal' },
    fullscreen: false, overAt: 0, deadAt: -1,
    keys: {}, pointerDown: false, run: { coins: 0, rains: 0, ouches: 0, steamed: 0, bestCombo: 0 },
    stats: { games: 0, scores: [], times: [], levels: [], coins: 0, rains: 0, ouches: 0, errors: [] },

    async boot() {
      await VC.Storage.init();
      Object.assign(this.settings, VC.Storage.getJSON('settings', {}));
      this.urlMute = params.get('mute') === '1';
      VC.Audio.setOptions({ sfx: this.settings.sfx, music: this.settings.music, muted: this.settings.muted || this.urlMute });
      this.renderer = new VC.Renderer(document.getElementById('game'));
      await VC.Assets.loadAll();
      VC.UI.init(this);
      this.bindInput();
      this.relayout();
      // rotation / resize / Safari toolbar changes: re-layout (debounced); the world keeps running and Puff is
      // clamped into the new shore range. A finger that was steering is released so Puff doesn't jump.
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
      const w = new VC.World({ seed: s, config: forTitle ? {} : difficultyOverrides(this.settings.difficulty) });
      this.applyPlayRange(w);
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
      if (this._lastW != null && this._lastW !== window.innerWidth) this.releasePointer();   // Split View / Stage Manager
      this._lastW = window.innerWidth;
      this.renderer.resize(this.readInsets());
      if (this.world) this.applyPlayRange(this.world);
      if (this.world) { const c = this.world.cfg; if (this.renderer.pointer) this.renderer.pointer[0] = Math.max(c.xMin, Math.min(c.xMax, this.renderer.pointer[0])); }
    },
    applyPlayRange(w) { const L = this.renderer && this.renderer.layout; if (L && w.setPlayRange) w.setPlayRange(L.playMin, L.playMax); },
    releasePointer() { this.pointerDown = false; this._steerId = null; if (this._touches) this._touches.clear(); if (this.isTouch && this.renderer) this.renderer.pointer = null; },
    makeWeather() { return new VC.Weather({ width: 960, height: 540, seed: 5 }); },

    toTitle() {
      VC.Audio.stopMusic();
      this.mode = 'title';
      this.world = this.makeWorld(this.seed != null ? this.seed + 99 : null, true);
      this.bot = new VC.Bot(this.world, { skill: 0.8, seed: 3 });
      this.weather = this.weather || this.makeWeather();
      this.weather.setSeason(0, { instant: true });
      this.renderer.attach(this.world, this.weather);
      this.renderer.setSeason(0, true);
      VC.Audio.setSeason(0);
      this.deadAt = -1;
      VC.UI.setHud(false); this.showAction(false);
      VC.UI.show('scrTitle');
    },

    startGame() {
      VC.Audio.unlock();
      this.runDifficulty = this.settings.difficulty;   // best score belongs to the difficulty the run started on
      this.world = this.makeWorld();
      const lv = params.has('level') ? Math.max(0, num('level', 0) | 0) : 0;
      if (lv > 0 && this.world.startLevel) this.world.startLevel(lv);
      this.bot = this.botMode ? new VC.Bot(this.world, { skill: num('skill', 1), seed: 11 }) : null;
      if (!this.weather) this.weather = this.makeWeather();
      const b = this.world.zone || 0;
      this.weather.setSeason(b, { instant: this.renderer.vis.cur === b });
      this.renderer.attach(this.world, this.weather);
      this.renderer.setSeason(b, this.renderer.vis.cur === b);
      this.renderer.showBanner(b);
      VC.Audio.setSeason(b); VC.Audio.play('start');
      if (this.settings.music) VC.Audio.startMusic();
      this.mode = 'playing';
      this.deadAt = -1; this.run = { coins: 0, rains: 0, ouches: 0, steamed: 0, bestCombo: 0 };
      this.keys = {}; this.pointerDown = false; this.renderer.pointer = null;
      VC.UI.hideAll(); VC.UI.setHud(true); this.showAction(true);
      this.canvasFocus();
    },
    showAction(on) { const b = document.getElementById('btnAction'); if (b) b.classList.toggle('hidden', !(on && isTouch)); },

    pause() {
      if (this.mode !== 'playing') return;
      if (this.world && this.world.state === 'dead') return;
      this.mode = 'paused'; this.keys = {}; this.pointerDown = false;
      VC.UI.setHud(false); this.showAction(false);
      VC.UI.show('scrPause');
    },
    resume() {
      if (this.mode !== 'paused') return;
      this.mode = 'playing';
      VC.UI.hideAll(); VC.UI.setHud(true); this.showAction(true);
      this.last = performance.now();
      this.canvasFocus();
    },
    canvasFocus() { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); },
    canRestart() { return performance.now() - this.overAt > 700; },

    gameOver() {
      const w = this.world, key = 'best_' + (this.runDifficulty || this.settings.difficulty);
      const prev = parseInt(VC.Storage.get(key, '0'), 10) || 0, newBest = w.score > prev;
      if (newBest) VC.Storage.set(key, String(w.score));
      this.mode = 'over'; this.overAt = performance.now();
      VC.UI.setHud(false); this.showAction(false);
      VC.UI.showGameOver({
        score: w.score, best: Math.max(prev, w.score), newBest: newBest && w.score > 0,
        coins: this.run.coins, steamed: this.run.steamed, ouches: this.run.ouches, bestCombo: Math.max(this.run.bestCombo, w.bestCombo || 0), cleared: w.level || 0,
        zoneName: ZONES[w.zone || 0] + ((w.lap || 0) > 0 ? ' (lap ' + (w.lap + 1) + ')' : '')
      });
      if (newBest && w.score > 0) VC.Audio.play('best');
      const st = this.stats;
      st.games++; st.scores.push(w.score); st.times.push(+w.time.toFixed(2)); st.levels.push(w.level || 0);
      st.coins += this.run.coins; st.rains += this.run.rains; st.ouches += this.run.ouches;
      if (this.autoRestart) setTimeout(() => this.startGame(), 50);
    },

    best() { return parseInt(VC.Storage.get('best_' + this.settings.difficulty, '0'), 10) || 0; },
    resetBest() { ['easy', 'normal', 'hard'].forEach(d => VC.Storage.del('best_' + d)); },
    setSetting(k, v) {
      this.settings[k] = v;
      VC.Storage.setJSON('settings', this.settings);
      VC.Audio.setOptions({ sfx: this.settings.sfx, music: this.settings.music, muted: this.settings.muted || this.urlMute });
      if (k === 'music') { if (v && this.mode !== 'title') VC.Audio.startMusic(); if (!v) VC.Audio.stopMusic(); }
    },
    toggleMute() { this.setSetting('muted', !this.settings.muted); VC.UI.syncMute(); VC.UI.toast(this.settings.muted ? 'Sound off' : 'Sound on', 900); },
    setFullscreen(on) {
      this.fullscreen = on;
      if (typeof window.ffFullscreen === 'function') window.ffFullscreen(on);
      else if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
      else if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
      setTimeout(() => this.renderer.resize(), 150);
    },
    picturesChanged() { VC.Assets._ver = (VC.Assets._ver || 0) + 1; },
    quit() { if (typeof window.ffQuit === 'function') window.ffQuit(); else window.close(); },

    // ---------------- input ----------------
    playerCanAct() { return this.mode === 'playing' && this.world && this.world.state !== 'dead' && !this.bot; },
    action() { VC.Audio.unlock(); if (this.playerCanAct()) this.world.action(); },
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
      window.addEventListener('keydown', e => {
        if (e.code === 'F11') { e.preventDefault(); this.setFullscreen(!this.fullscreen); VC.UI.syncSettings(); return; }
        if (e.code === 'KeyM' && !e.repeat) { this.toggleMute(); return; }
        const ui = VC.UI.current;
        if (e.code === 'Escape' || e.code === 'KeyP') {
          if (this.mode === 'playing') { this.pause(); e.preventDefault(); return; }
          if (this.mode === 'paused' && ui === 'scrPause') { this.resume(); e.preventDefault(); return; }
          if (ui === 'scrHow' || ui === 'scrSettings' || ui === 'scrCustom') { VC.UI.back(); e.preventDefault(); return; }
          return;
        }
        if (this.mode === 'playing') {
          if (MOVE.includes(e.code)) { e.preventDefault(); this.keys[e.code] = true; VC.Audio.unlock(); return; }
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
      const setPtr = e => { this.renderer.pointer = this.renderer.toLogical(e.clientX, e.clientY); };
      stage.addEventListener('pointerdown', e => {
        if (e.target.closest && e.target.closest('button, .screen, #hud, input, label')) return;   // HUD/menu clicks never move Puff
        if (this.mode !== 'playing') return;
        e.preventDefault(); VC.Audio.unlock();
        if (e.button === 2) { this.action(); return; }
        if (e.pointerType === 'touch' && this._touches && this._touches.size >= 1) { this.action(); return; }   // second finger = action
        (this._touches = this._touches || new Set()).add(e.pointerId);
        this._steerId = e.pointerId;   // only this finger / button steers Puff
        this.pointerDown = true; setPtr(e);
        try { if (e.pointerType === 'touch') stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      });
      stage.addEventListener('pointermove', e => {
        if (this.mode !== 'playing') return;
        if (e.pointerType === 'mouse' && e.target.closest && e.target.closest('button, .screen, #hud')) { this._mouseFollow = false; return; }   // hovering the HUD never pulls Puff
        if (this.pointerDown && e.pointerId !== this._steerId) return;   // a second finger (rain tap) never steers
        if (e.pointerType === 'mouse') { const p0 = this._lastMouse; this._lastMouse = [e.clientX, e.clientY]; if (p0 && Math.abs(p0[0] - e.clientX) + Math.abs(p0[1] - e.clientY) > 2) this._mouseFollow = true; }
        if (this.pointerDown || e.pointerType === 'mouse') setPtr(e);
      });
      const up = e => {
        if (this._touches) this._touches.delete(e.pointerId);
        // the steering finger lifted: Puff stops following, even if a second (rain) finger is still down
        if (e.pointerId === this._steerId || !this._touches || !this._touches.size) {
          this._steerId = null; this.pointerDown = false; if (e.pointerType !== 'mouse') this.renderer.pointer = null;
        }
      };
      window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
      const act = document.getElementById('btnAction');
      if (act) act.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.action(); });
      window.addEventListener('blur', () => { this.keys = {}; this.pointerDown = false; if (this.mode === 'playing') this.pause(); });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) { if (this.mode === 'playing') this.pause(); this.releasePointer(); VC.Audio.suspend(); }
        else VC.Audio.resume();
      });
      // iOS: audio may only start inside a gesture — unlock on the first touchend / click / key
      const unlock = () => VC.Audio.unlock();
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
      document.addEventListener('fullscreenchange', () => { this.fullscreen = !!document.fullscreenElement || (this.fullscreen && typeof window.ffFullscreen === 'function'); this.renderer.resize(); VC.UI.syncSettings(); });
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
      const sound = this.mode !== 'title', w = this.world;
      for (const e of evts) {
        switch (e.type) {
          case 'rumble': if (sound) VC.Audio.play('rumble'); break;
          case 'erupt': if (sound) VC.Audio.play('erupt', { n: e.n }); break;
          case 'catch': if (sound) VC.Audio.play('catch', { mult: e.mult, metal: e.metal }); this.run.coins++; this.run.bestCombo = Math.max(this.run.bestCombo, e.combo || 0); break;
          case 'multup': if (sound) VC.Audio.play('multup', { mult: e.mult }); break;
          case 'miss': if (sound) VC.Audio.play('miss', { combo: e.combo }); break;
          case 'ouch': if (sound) VC.Audio.play('ouch'); this.run.ouches++; break;
          case 'rockland': if (sound) VC.Audio.play('thud'); break;
          case 'rain': if (sound) VC.Audio.play('rain'); this.run.rains++; break;
          case 'steam': if (sound) VC.Audio.play('steam'); this.run.steamed++; break;
          case 'raincharged': if (sound) VC.Audio.play('charged'); break;
          case 'pouchfull': if (sound) VC.Audio.play('pouchfull'); break;
          case 'cleared': if (sound) VC.Audio.play('cleared'); break;
          case 'heal': if (sound) VC.Audio.play('heal'); break;
          case 'zone': case 'season': {
            const b = e.zone != null ? e.zone : e.season;
            this.weather.setSeason(b); VC.Audio.setSeason(b);
            if (sound && (e.level || 0) > 0) VC.Audio.play('season');
            break;
          }
          case 'dead': if (sound) VC.Audio.play('dead'); this.deadAt = w.time; break;
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
      this.weather.update(h, { volcano: w.volcano, rain: w.rain });
      if (this.mode === 'playing' && w.state === 'dead' && this.deadAt >= 0 && w.time - this.deadAt > 1.4) this.gameOver();
      if (this.mode === 'title' && (w.state === 'dead' || (w.level || 0) >= 2) && (this.deadAt >= 0 ? w.time - this.deadAt > 1.5 : true)) {
        this.world = this.makeWorld(null, true);
        this.bot = new VC.Bot(this.world, { skill: 0.8, seed: (Math.random() * 1e6) | 0 });
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

  VC.Game = Game;
  VC.debug = {
    get world() { return Game.world; },
    get weather() { return Game.weather; },
    get mode() { return Game.mode; },
    get stats() { return Game.stats; },
    getState() {
      const w = Game.world;
      return w && { mode: Game.mode, state: w.state, score: w.score, level: w.level, zone: w.zone, lap: w.lap, hearts: w.hearts,
        combo: w.combo, mult: w.mult, pouch: w.pouch, pouchTarget: w.pouchTarget, time: w.time, items: w.items.length,
        rain: w.rain && { charge: +w.rain.charge.toFixed(2), active: w.rain.active }, puff: w.puff && { x: Math.round(w.puff.x), y: Math.round(w.puff.y) },
        particles: Game.weather ? Game.weather.particles.length : 0, fx: Game.renderer.fx.length };
    },
    setSpeed(n) { Game.speed = n; },
    startGame() { Game.startGame(); },
    setBot(on, skill) { Game.botMode = on; Game.bot = on ? new VC.Bot(Game.world, { skill: skill == null ? 1 : skill, seed: 11 }) : null; },
    setAutoRestart(on) { Game.autoRestart = on; },
    gotoLevel(i) { Game.world.startLevel(i); }
  };

  window.addEventListener('DOMContentLoaded', () => Game.boot().catch(e => {
    console.error(e);
    document.body.insertAdjacentHTML('beforeend', '<pre style="color:#fff;padding:20px">Could not start the game: ' + (e && e.message) + '</pre>');
  }));
})(window.VC = window.VC || {});
