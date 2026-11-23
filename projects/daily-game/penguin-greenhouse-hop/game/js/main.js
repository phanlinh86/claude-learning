/* main.js — game controller: boot, loop, input (hold ← / → or the left / right half of the screen to steer Puddle;
 * she bounces by herself), modes, settings, test hooks. Modes: 'title' (bot demo) → 'playing' ⇄ 'paused' → 'over'.
 * The run lives in PH.World. */
(function (PH) {
  'use strict';
  const params = new URLSearchParams(location.search);
  const num = (k, d) => { const v = parseFloat(params.get(k)); return isFinite(v) ? v : d; };
  const DIFFS = ['easy', 'normal', 'hard'];
  const isTouch = window.matchMedia ? window.matchMedia('(pointer:coarse)').matches : (('ontouchstart' in window) || navigator.maxTouchPoints > 0);
  const STEER_KEYS = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 };

  const Game = {
    mode: 'boot', isTouch,
    isApp: params.get('app') === '1' || typeof window.ffStoreSet === 'function',
    speed: Math.max(0.1, Math.min(64, num('speed', 1))),
    botMode: params.get('bot') === '1',
    autoRestart: params.get('autorestart') === '1',
    seed: params.has('seed') ? num('seed', 1) : null,
    urlDiff: DIFFS.includes(params.get('diff')) ? params.get('diff') : null,   // test flag, never saved
    world: null, weather: null, bot: null, renderer: null,
    settings: { sfx: true, music: true, muted: false, difficulty: 'easy' },   // a family game: first run on Easy
    fullscreen: false, overAt: 0, deadT: -1,
    stats: { games: 0, scores: [], times: [], levels: [], heights: [], fireflies: 0, falls: 0, errors: [] },
    keys: {}, pointers: new Map(),

    async boot() {
      await PH.Storage.init();
      Object.assign(this.settings, PH.Storage.getJSON('settings', {}));
      if (!DIFFS.includes(this.settings.difficulty)) this.settings.difficulty = 'easy';
      this.urlMute = params.get('mute') === '1';
      PH.Audio.setOptions({ sfx: this.settings.sfx, music: this.settings.music, muted: this.settings.muted || this.urlMute });
      this.renderer = new PH.Renderer(document.getElementById('game'));
      await PH.Assets.loadAll();
      PH.UI.init(this);
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
      return new PH.World({ seed: s, difficulty: forTitle ? 'normal' : this.difficulty(), level: level || 0 });
    },
    readInsets() {
      const el = document.getElementById('safeProbe'); if (!el) return null;
      const cs = getComputedStyle(el);
      return { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
    },
    relayout() { this.renderer.resize(this.readInsets()); },
    makeWeather() { return new PH.Weather({ width: this.renderer.VW, height: this.renderer.VH, seed: 5 }); },
    _setLevelVisuals(zone, instant) {
      this.weather.setLevel(zone, { instant });
      this.renderer.setLevel(zone, instant);
      PH.Audio.setLevel(zone, this.world && this.world.loop);
    },

    toTitle() {
      PH.Audio.stopMusic();
      this.mode = 'title';
      this.world = this.makeWorld(this.seed != null ? this.seed + 99 : null, true);
      this.bot = new PH.Bot(this.world, { skill: 0.85, seed: 3 });
      this.weather = this.weather || this.makeWeather();
      this.renderer.attach(this.world, this.weather);
      this._setLevelVisuals(0, true);
      this.deadT = -1;
      PH.UI.setHud(false);
      PH.UI.show('scrTitle');
    },

    startGame() {
      PH.Audio.unlock();
      { const t = document.getElementById('toast'); if (t) t.classList.add('hidden'); }
      this.runDifficulty = this.difficulty();
      const lv = params.has('level') ? Math.max(0, num('level', 0) | 0) : 0;
      this.world = this.makeWorld(null, false, lv);
      this.bot = this.botMode ? new PH.Bot(this.world, { skill: num('skill', 1), seed: 11 }) : null;
      if (!this.weather) this.weather = this.makeWeather();
      const z = this.world.zone || 0;
      this.renderer.attach(this.world, this.weather);
      this._setLevelVisuals(z, this.renderer.vis.cur === z);
      this.renderer.showBanner(z);
      PH.Audio.play('start');
      PH.Audio.startMusic();
      this.mode = 'playing';
      this.deadT = -1; this.runT = 0; this.clearInput();
      PH.UI.hideAll(); PH.UI.setHud(true);
      this.canvasFocus();
    },

    pause() {
      if (this.mode !== 'playing') return;
      if (this.world && (this.world.phase === 'over' || this.deadT >= 0)) return;
      this.clearInput();
      this.mode = 'paused';
      PH.UI.setHud(false);
      PH.UI.show('scrPause');
    },
    resume() {
      if (this.mode !== 'paused') return;
      this.mode = 'playing';
      PH.UI.hideAll(); PH.UI.setHud(true);
      this.last = performance.now();
      this.canvasFocus();
    },
    canvasFocus() { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); },
    canRestart() { return performance.now() - this.overAt > 700; },

    gameOver() {
      const w = this.world, key = 'best_' + (this.runDifficulty || this.difficulty());
      const prev = parseInt(PH.Storage.get(key, '0'), 10) || 0, newBest = w.score > prev;
      if (newBest && !this.botMode) PH.Storage.set(key, String(w.score));   // bot / test runs never overwrite a child's best
      this.mode = 'over'; this.overAt = performance.now();
      this.clearInput();
      PH.Audio.stopMusic();
      PH.UI.setHud(false);
      const s = w.stats || {}, names = PH.Renderer.ZONE_INFO.map(z => z.name);
      PH.UI.showGameOver({
        score: w.score, best: this.botMode ? prev : Math.max(prev, w.score), newBest: newBest && w.score > 0 && !this.botMode, cleared: w.level || 0,
        height: Math.floor(w.maxY || 0), fireflies: w.fireflyCount || 0, lanterns: s.lanterns || 0, bounces: s.bounces || 0,
        springs: s.springs || 0, maxSize: +(s.maxSize || 1).toFixed(2), falls: s.falls || 0,
        reached: names[(w.zone || 0) % 4] + ((w.loop || 0) > 0 ? ' (round ' + (w.loop + 1) + ')' : '')
      });
      if (newBest && w.score > 0) PH.Audio.play('best');
      const st = this.stats;
      st.games++; st.scores.push(w.score); st.times.push(+(this.runT || 0).toFixed(2)); st.levels.push(w.level || 0);
      st.heights.push(Math.floor(w.maxY || 0)); st.fireflies += w.fireflyCount || 0; st.falls += s.falls || 0;
      if (this.autoRestart) setTimeout(() => this.startGame(), 50);
    },

    best(d) { return parseInt(PH.Storage.get('best_' + (d || this.difficulty()), '0'), 10) || 0; },
    resetBest() { DIFFS.forEach(d => PH.Storage.del('best_' + d)); },
    setSetting(k, v) {
      this.settings[k] = v;
      if (k === 'difficulty') this.urlDiff = null;   // a tap in Settings beats ?diff= for the next run
      PH.Storage.setJSON('settings', this.settings);
      PH.Audio.setOptions({ sfx: this.settings.sfx, music: this.settings.music, muted: this.settings.muted || this.urlMute });
      if (k === 'music' && v && (this.mode === 'playing' || this.mode === 'paused')) PH.Audio.startMusic();
    },
    toggleMute() {
      if (this.urlMute && !this.settings.muted) {
        this.urlMute = false;
        PH.Audio.setOptions({ sfx: this.settings.sfx, music: this.settings.music, muted: false });
      } else {
        const on = !this.settings.muted;
        if (!on) this.urlMute = false;
        this.setSetting('muted', on);
      }
      PH.UI.syncMute(); PH.UI.toast(this.settings.muted || this.urlMute ? 'Sound off' : 'Sound on', 900);
    },
    setFullscreen(on) {
      this.fullscreen = on;
      if (typeof window.ffFullscreen === 'function') window.ffFullscreen(on);
      else if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
      else if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
      setTimeout(() => this.renderer.resize(), 150);
    },
    picturesChanged() { PH.Assets._ver = (PH.Assets._ver || 0) + 1; if (this.renderer) this.renderer._spr.clear(); },
    quit() { if (typeof window.ffQuit === 'function') window.ffQuit(); else window.close(); },

    // ---------------- input: hold keys / hold the left or right half of the screen ----------------
    playerCanAct() { return this.mode === 'playing' && this.world && this.world.phase !== 'over' && this.deadT < 0 && !this.bot; },
    clearInput() { this.keys = {}; this.pointers.clear(); this._order = []; if (this.world && !this.bot) this.world.steer(0); },
    /* the held direction: the most recent key or pointer still down wins */
    applySteer() {
      if (!this.playerCanAct()) return;
      const o = this._order || [];
      this.world.steer(o.length ? o[o.length - 1].d : 0);
    },
    _press(id, d) { this._order = (this._order || []).filter(e => e.id !== id); this._order.push({ id, d }); this.applySteer(); },
    _release(id) { this._order = (this._order || []).filter(e => e.id !== id); this.applySteer(); },
    bindInput() {
      window.addEventListener('keydown', e => {
        if (e.code === 'F11') { e.preventDefault(); this.setFullscreen(!this.fullscreen); PH.UI.syncSettings(); return; }
        if (e.code === 'KeyM' && !e.repeat) { this.toggleMute(); return; }
        const ui = PH.UI.current;
        if (e.code === 'Escape' || e.code === 'KeyP') {
          if (this.mode === 'playing') { this.pause(); e.preventDefault(); return; }
          if (this.mode === 'paused' && ui === 'scrPause') { this.resume(); e.preventDefault(); return; }
          if (ui === 'scrHow' || ui === 'scrSettings' || ui === 'scrCustom') { PH.UI.back(); e.preventDefault(); return; }
          return;
        }
        if (this.mode === 'playing' && STEER_KEYS[e.code]) { e.preventDefault(); if (!e.repeat || !(this._order || []).some(o => o.id === 'k' + e.code)) this._press('k' + e.code, STEER_KEYS[e.code]); return; }   // a key still held after Resume steers again on its auto-repeat
        if (this.mode === 'playing' && ['Space', 'Enter', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyS'].includes(e.code)) { e.preventDefault(); return; }
        if (this.mode === 'over' && (e.code === 'Enter' || e.code === 'Space')) { const f = document.activeElement; if (f && f.tagName === 'BUTTON' && f.id !== 'btnAgain') return; e.preventDefault(); if (!e.repeat && this.canRestart()) this.startGame(); return; }
        if (this.mode === 'title' && ui === 'scrTitle' && (e.code === 'Space' || e.code === 'Enter')) {
          const f = document.activeElement;
          if (f && f.tagName === 'BUTTON' && f.id !== 'btnPlay') return;
          e.preventDefault(); this.startGame();
        }
      });
      window.addEventListener('keyup', e => { if (STEER_KEYS[e.code]) this._release('k' + e.code); });
      const stage = document.getElementById('stage');
      const onUi = e => e.target.closest && e.target.closest('button, .screen, #hud, input, label');
      const side = e => { const [x] = this.renderer.toLogical(e.clientX, e.clientY); return x < this.renderer.VW / 2 ? -1 : 1; };
      stage.addEventListener('pointerdown', e => {
        PH.Audio.unlock();
        if (onUi(e)) return;
        if (this.mode !== 'playing' || e.button === 2) return;
        e.preventDefault();
        try { stage.setPointerCapture(e.pointerId); } catch (_) {}
        this.pointers.set(e.pointerId, side(e));
        this._press('p' + e.pointerId, side(e));
      });
      stage.addEventListener('pointermove', e => {   // sliding a finger across the middle switches direction
        if (!this.pointers.has(e.pointerId) || this.mode !== 'playing') return;
        const d = side(e);
        if (d !== this.pointers.get(e.pointerId)) { this.pointers.set(e.pointerId, d); this._press('p' + e.pointerId, d); }
      });
      const up = e => { if (!this.pointers.has(e.pointerId)) return; this.pointers.delete(e.pointerId); this._release('p' + e.pointerId); };
      stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up); stage.addEventListener('lostpointercapture', up);
      window.addEventListener('blur', () => { this.clearInput(); if (this.mode === 'playing') this.pause(); });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) { this.clearInput(); if (this.mode === 'playing') this.pause(); PH.Audio.suspend(); }
        else PH.Audio.resume();
      });
      const unlock = () => PH.Audio.unlock();
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
      document.addEventListener('fullscreenchange', () => { this.fullscreen = !!document.fullscreenElement || (this.fullscreen && typeof window.ffFullscreen === 'function'); this.renderer.resize(); PH.UI.syncSettings(); });
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
      const sound = this.mode !== 'title', A = PH.Audio, w = this.world;
      for (const e of evts) {
        switch (e.type) {
          case 'bounce': if (sound) {
            const size = w ? w.hero.size || 1 : 1;
            if (e.kind === 'leaf' && !e.spring) A.play('leaf', { size });
            else A.play(e.kind === 'rescue' ? 'rescue' : e.spring ? 'spring' : 'bounce', { h: w ? w.maxY - w.levelY0 : 0, size });
            if (e.kind === 'basket') A.play('basket');
          } break;
          case 'grow': if (sound) A.play('grow', { size: e.size }); break;
          case 'big': if (sound) A.play('big'); break;
          case 'rescue': if (sound) A.play('rescue'); break;
          case 'firefly': if (sound) A.play('firefly', { combo: e.combo }); break;
          case 'lantern': if (sound) A.play('lantern'); break;
          case 'wall': if (sound) A.play('wall'); break;
          case 'fall': if (sound) A.play('fall'); break;
          case 'heartGain': if (sound) A.play('heartGain'); break;
          case 'levelUp': this._setLevelVisuals(e.zone, false); if (sound) { if ((e.size || 1) > 1.02) A.play('shake'); setTimeout(() => A.play('level'), 200); } break;
          case 'gameOver': if (sound) A.play('over'); A.stopMusic(); this.deadT = 0; this.clearInput(); break;
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
      this.weather.update(h, this.mode === 'paused' ? 0 : (this.renderer._climbVy || 0));
      if (this.mode === 'playing') this.runT += h;
      if (this.deadT >= 0) this.deadT += h;
      if (this.mode === 'playing' && this.deadT > 1.6) this.gameOver();
      if (this.mode === 'title' && (w.phase === 'over' || (w.level || 0) >= 1 || w.maxY > 90) && (this.deadT < 0 || this.deadT > 1.5)) {
        this.world = this.makeWorld(null, true);
        this.bot = new PH.Bot(this.world, { skill: 0.85, seed: (Math.random() * 1e6) | 0 });
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
        this.adapt((performance.now() - t0) / 1000);
      } catch (err) {
        console.error(err);
        if (this.stats.errors.length < 20) this.stats.errors.push(String(err && err.stack || err));
      }
      requestAnimationFrame(t => this.frame(t));
    }
  };

  PH.Game = Game;
  PH.debug = {
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
    setSpeed(n) { Game.speed = n; },
    startGame() { Game.startGame(); },
    steer(d) { if (Game.playerCanAct()) Game.world.steer(d); },
    grow(n) { if (Game.world) Game.world.grow(n); },
    setSize(v) { if (Game.world) Game.world.setSize(v); },
    setBot(on, skill) { Game.botMode = on; Game.bot = on ? new PH.Bot(Game.world, { skill: skill == null ? 1 : skill, seed: 11 }) : null; },
    setAutoRestart(on) { Game.autoRestart = on; },
    gotoLevel(i) { Game.world.gotoLevel(i); }   // emits levelUp → visuals, music, banner
  };

  window.addEventListener('DOMContentLoaded', () => Game.boot().catch(e => {
    console.error(e);
    document.body.insertAdjacentHTML('beforeend', '<pre style="color:#fff;padding:20px">Could not start the game: ' + (e && e.message) + '</pre>');
  }));
})(window.PH = window.PH || {});
