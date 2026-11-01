/* main.js — game controller: boot, loop, input (lane keys / tap the upper or lower half / one-button on Easy), modes,
 * settings, test hooks. Modes: 'title' (bot demo) → 'playing' ⇄ 'paused' → 'over'. World states live in KB.World.
 * Clock: while the AudioContext runs (and the game runs at 1×) the AUDIO clock drives the world, so the backing band,
 * the coins and the judging can never drift apart. Otherwise (muted before any gesture, tests at ?speed=N) rAF time. */
(function (KB) {
  'use strict';
  const params = new URLSearchParams(location.search);
  const num = (k, d) => { const v = parseFloat(params.get(k)); return isFinite(v) ? v : d; };
  const TODS = ['Dawn', 'Noon', 'Sunset', 'Night'];
  const DIFFS = ['easy', 'normal', 'hard'];
  // phone / tablet (coarse pointer); a Windows touch laptop with a mouse keeps the desktop layout
  const isTouch = window.matchMedia ? window.matchMedia('(pointer:coarse)').matches : (('ontouchstart' in window) || navigator.maxTouchPoints > 0);
  const LANE0 = ['ArrowUp', 'KeyW', 'KeyF', 'KeyD', 'KeyE'], LANE1 = ['ArrowDown', 'KeyS', 'KeyJ', 'KeyK', 'KeyX'];

  function difficultyOverrides(d) { return Object.assign({}, (KB.DIFFICULTY && KB.DIFFICULTY[d]) || {}); }

  const Game = {
    mode: 'boot', isTouch,
    isApp: params.get('app') === '1' || typeof window.ffStoreSet === 'function',
    speed: Math.max(0.1, Math.min(64, num('speed', 1))),
    botMode: params.get('bot') === '1',
    autoRestart: params.get('autorestart') === '1',
    seed: params.has('seed') ? num('seed', 1) : null,
    urlDiff: DIFFS.includes(params.get('diff')) ? params.get('diff') : null,   // test flag, never saved
    world: null, weather: null, bot: null, renderer: null,
    settings: { sfx: true, music: true, muted: false, difficulty: 'normal', offset: 0 },
    fullscreen: false, overAt: 0, deadT: -1, clockT: 0,
    stats: { games: 0, scores: [], times: [], levels: [], perfect: 0, good: 0, miss: 0, taps: 0, errors: [] },

    async boot() {
      await KB.Storage.init();
      Object.assign(this.settings, KB.Storage.getJSON('settings', {}));
      if (!DIFFS.includes(this.settings.difficulty)) this.settings.difficulty = 'normal';
      this.urlMute = params.get('mute') === '1';
      KB.Audio.setOptions({ sfx: this.settings.sfx, music: this.settings.music, muted: this.settings.muted || this.urlMute });
      this.renderer = new KB.Renderer(document.getElementById('game'));
      await KB.Assets.loadAll();
      KB.UI.init(this);
      this.bindInput();
      this.relayout();
      // rotation / resize / Safari toolbar changes: re-layout (debounced). The world is screen-independent.
      const onResize = () => { clearTimeout(this._rsz); this._rsz = setTimeout(() => this.relayout(), 120); };
      window.addEventListener('resize', onResize);
      window.addEventListener('orientationchange', onResize);
      if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
      if (params.get('autostart') === '1') this.startGame(); else this.toTitle();
      this.last = performance.now();
      requestAnimationFrame(t => this.frame(t));
    },

    difficulty() { return this.urlDiff || this.settings.difficulty; },
    makeWorld(seed, forTitle) {
      const s = seed != null ? seed : (this.seed != null ? this.seed : (Math.random() * 1e9) | 0);
      const w = new KB.World({ seed: s, config: forTitle ? {} : difficultyOverrides(this.difficulty()) });
      w.reset();
      return w;
    },
    readInsets() {
      const el = document.getElementById('safeProbe'); if (!el) return null;
      const cs = getComputedStyle(el);
      return { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
    },
    relayout() { this.renderer.resize(this.readInsets()); },
    makeWeather() { return new KB.Weather({ width: this.renderer.VW, height: this.renderer.VH, seed: 5 }); },
    _setLevelVisuals(tod, instant) {
      if (this.weather.setLevel) this.weather.setLevel(tod, { instant }); else if (this.weather.setSeason) this.weather.setSeason(tod, { instant });
      this.renderer.setLevel(tod, instant);
      KB.Audio.setLevel(tod, this.world && this.world.lap);
    },

    toTitle() {
      KB.Audio.stopMusic();
      this.mode = 'title';
      this.world = this.makeWorld(this.seed != null ? this.seed + 99 : null, true);
      this.bot = new KB.Bot(this.world, { skill: 0.85, seed: 3 });
      this.weather = this.weather || this.makeWeather();
      this.renderer.attach(this.world, this.weather);
      this._setLevelVisuals(0, true);
      this.deadT = -1;
      KB.UI.setHud(false);
      KB.UI.show('scrTitle');
    },

    startGame() {
      KB.Audio.unlock();
      this.runDifficulty = this.difficulty();   // best score belongs to the difficulty the run started on
      this.world = this.makeWorld();
      const lv = params.has('level') ? Math.max(0, num('level', 0) | 0) : 0;
      if (lv > 0 && this.world.startLevel) this.world.startLevel(lv);
      this.bot = this.botMode ? new KB.Bot(this.world, { skill: num('skill', 1), seed: 11 }) : null;
      if (!this.weather) this.weather = this.makeWeather();
      const tod = this.world.tod || 0;
      this.renderer.attach(this.world, this.weather);
      this._setLevelVisuals(tod, this.renderer.vis.cur === tod);
      this.renderer.showBanner(tod);
      KB.Audio.play('start');
      KB.Audio.startMusic();
      this.mode = 'playing';
      this.deadT = -1; this._lastAc = null; this.runT = 0;
      KB.UI.hideAll(); KB.UI.setHud(true);
      this.canvasFocus();
    },

    pause() {
      if (this.mode !== 'playing') return;
      if (this.world && (this.world.state === 'dead' || this.deadT >= 0)) return;
      this.mode = 'paused';
      KB.UI.setHud(false);
      KB.UI.show('scrPause');
    },
    resume() {
      if (this.mode !== 'paused') return;
      this.mode = 'playing'; this._lastAc = null;
      KB.UI.hideAll(); KB.UI.setHud(true);
      this.last = performance.now();
      this.canvasFocus();
    },
    canvasFocus() { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); },
    canRestart() { return performance.now() - this.overAt > 700; },

    gameOver() {
      const w = this.world, key = 'best_' + (this.runDifficulty || this.difficulty());
      const prev = parseInt(KB.Storage.get(key, '0'), 10) || 0, newBest = w.score > prev;
      if (newBest) KB.Storage.set(key, String(w.score));
      this.mode = 'over'; this.overAt = performance.now();
      KB.Audio.stopMusic();
      KB.UI.setHud(false);
      const s = w.stats || {};
      KB.UI.showGameOver({
        score: w.score, best: Math.max(prev, w.score), newBest: newBest && w.score > 0, cleared: w.levelsCleared != null ? w.levelsCleared : (w.level || 0),
        perfect: s.perfect || 0, good: s.good || 0, miss: s.miss || 0, maxCombo: w.maxCombo || 0, bounced: s.bounced || 0,
        reached: TODS[(w.tod || 0) % 4] + ((w.lap || 0) > 0 ? ' (round ' + (w.lap + 1) + ')' : '')
      });
      if (newBest && w.score > 0) KB.Audio.play('best');
      const st = this.stats;
      st.games++; st.scores.push(w.score); st.times.push(+(this.runT || 0).toFixed(2)); st.levels.push(w.level || 0);
      st.perfect += s.perfect || 0; st.good += s.good || 0; st.miss += s.miss || 0; st.taps += s.taps || 0;
      if (this.autoRestart) setTimeout(() => this.startGame(), 50);
    },

    best() { return parseInt(KB.Storage.get('best_' + this.settings.difficulty, '0'), 10) || 0; },
    resetBest() { DIFFS.forEach(d => KB.Storage.del('best_' + d)); },
    setSetting(k, v) {
      this.settings[k] = v;
      KB.Storage.setJSON('settings', this.settings);
      KB.Audio.setOptions({ sfx: this.settings.sfx, music: this.settings.music, muted: this.settings.muted || this.urlMute });
      if (k === 'music' && v && (this.mode === 'playing' || this.mode === 'paused')) KB.Audio.startMusic();
    },
    toggleMute() {
      const on = !this.settings.muted;
      if (!on) this.urlMute = false;   // unmuting also lifts a ?mute=1 test flag (never saved), so the toast tells the truth
      this.setSetting('muted', on); KB.UI.syncMute(); KB.UI.toast(this.settings.muted || this.urlMute ? 'Sound off' : 'Sound on', 900);
    },
    setFullscreen(on) {
      this.fullscreen = on;
      if (typeof window.ffFullscreen === 'function') window.ffFullscreen(on);
      else if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
      else if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
      setTimeout(() => this.renderer.resize(), 150);
    },
    picturesChanged() { KB.Assets._ver = (KB.Assets._ver || 0) + 1; },
    quit() { if (typeof window.ffQuit === 'function') window.ffQuit(); else window.close(); },

    // ---------------- input ----------------
    playerCanAct() { return this.mode === 'playing' && this.world && this.world.state !== 'dead' && this.deadT < 0 && !this.bot; },
    /* Tap a lane (0 upper, 1 lower, -1 any). The tap is judged at the moment it happened, not at the last frame:
     * delta = time since the world was last advanced, minus the player's timing offset (Bluetooth headphones). */
    tap(lane) {
      KB.Audio.unlock();
      if (!this.playerCanAct()) return;
      const w = this.world;
      const now = this._clockNow();
      const delta = clampNum((now - this.clockT) * (this._audioMaster ? 1 : this.speed), 0, 0.05) - (this.settings.offset || 0) / 1000;
      if (w.cfg && w.cfg.oneButton) lane = -1;
      if (w.tap.length >= 2) { w.tap(lane, delta); return; }
      const st = w.songTime; w.songTime = st + delta;   // judge at the real tap moment
      try { w.tap(lane); } finally { w.songTime = st; }
    },
    _clockNow() { const ac = this._audioMaster ? KB.Audio.clock() : null; return ac != null ? ac : performance.now() / 1000; },
    bindInput() {
      window.addEventListener('keydown', e => {
        if (e.code === 'F11') { e.preventDefault(); this.setFullscreen(!this.fullscreen); KB.UI.syncSettings(); return; }
        if (e.code === 'KeyM' && !e.repeat) { this.toggleMute(); return; }
        const ui = KB.UI.current;
        if (e.code === 'Escape' || e.code === 'KeyP') {
          if (this.mode === 'playing') { this.pause(); e.preventDefault(); return; }
          if (this.mode === 'paused' && ui === 'scrPause') { this.resume(); e.preventDefault(); return; }
          if (ui === 'scrHow' || ui === 'scrSettings' || ui === 'scrCustom') { KB.UI.back(); e.preventDefault(); return; }
          return;
        }
        if (this.mode === 'playing') {
          let lane = null;
          if (LANE0.includes(e.code)) lane = 0; else if (LANE1.includes(e.code)) lane = 1;
          else if (e.code === 'Space' || e.code === 'Enter') lane = -1;
          if (lane !== null) {
            e.preventDefault();
            if (!e.repeat) { if (lane === -1 && !(this.world.cfg && this.world.cfg.oneButton)) lane = this.world.kit ? this.world.kit.lane : 0; this.tap(lane); }
            return;
          }
        }
        if (this.mode === 'over' && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); if (this.canRestart()) this.startGame(); return; }
        if (this.mode === 'title' && ui === 'scrTitle' && e.code === 'Space') {
          const f = document.activeElement;
          if (f && f.tagName === 'BUTTON' && f.id !== 'btnPlay') return;
          e.preventDefault(); this.startGame();
        }
      });
      const stage = document.getElementById('stage');
      stage.addEventListener('pointerdown', e => {
        if (e.target.closest && e.target.closest('button, .screen, #hud, input, label')) return;   // HUD/menu taps never play
        if (this.mode !== 'playing') return;
        if (e.button === 2) return;
        e.preventDefault();
        const p = this.renderer.toLogical(e.clientX, e.clientY);
        this.tap(this.renderer.laneAt(p[1]));
      });
      window.addEventListener('blur', () => { if (this.mode === 'playing') this.pause(); });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) { if (this.mode === 'playing') this.pause(); KB.Audio.suspend(); }
        else KB.Audio.resume();
      });
      // iOS: audio may only start inside a gesture — unlock on the first touchend / click / key
      const unlock = () => KB.Audio.unlock();
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
      document.addEventListener('fullscreenchange', () => { this.fullscreen = !!document.fullscreenElement || (this.fullscreen && typeof window.ffFullscreen === 'function'); this.renderer.resize(); KB.UI.syncSettings(); });
    },

    /* Touch kid-proofing (iPhone / iPad): no pinch or double-tap zoom, no long-press callout, no rubber-band
     * scroll or pull-to-refresh. Scrollable panels opt back in. */
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
      const sound = this.mode !== 'title', A = KB.Audio;
      for (const e of evts) {
        switch (e.type) {
          case 'hit': if (sound && e.kind !== 'pillow') A.play('hit', { pitch: e.pitch, judge: e.judge, gold: e.kind === 'gold' }); break;
          case 'miss': if (sound) A.play('miss'); break;
          case 'empty': if (sound) A.play('empty'); break;
          case 'bounce': if (sound) { A.play('boing'); setTimeout(() => A.play('oof'), 380); } break;
          case 'poof': if (sound) A.play('fwump'); break;
          case 'throw': if (sound) A.play('throw'); break;
          case 'bossin': if (sound) A.play('bossin'); break;
          case 'bossout': if (sound) A.play('bossout'); break;
          case 'multup': if (sound) A.play('multup'); break;
          case 'combobreak': if (sound) A.play('combobreak'); break;
          case 'groovelow': if (sound) A.play('groovelow'); break;
          case 'songdone': if (sound) A.play('songdone'); break;
          case 'cleared': if (sound) A.play('cleared'); break;
          case 'level': {
            this._setLevelVisuals(e.tod != null ? e.tod : (e.level || 0) % 4, false);
            if (sound && (e.level || 0) > 0) A.play('level');
            break;
          }
          case 'dead': if (sound) A.play('dead'); A.stopMusic(); this.deadT = 0; break;
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
      const R = this.renderer, L = R.layout, k = w.kit;
      this.weather.update(h, { beat: w.beat, kitX: L.kitX, kitY: k ? L.coinY[0] + (L.coinY[1] - L.coinY[0]) * (k.pos || 0) : L.coinY[0] });
      if (this.mode === 'playing') this.runT += h;
      if (this.deadT >= 0) this.deadT += h;
      if (this.mode === 'playing' && this.deadT > 1.6) this.gameOver();
      if (this.mode === 'title' && (w.state === 'dead' || (w.level || 0) >= 1) && (this.deadT < 0 || this.deadT > 1.5)) {
        this.world = this.makeWorld(null, true);
        this.bot = new KB.Bot(this.world, { skill: 0.85, seed: (Math.random() * 1e6) | 0 });
        this.renderer.attach(this.world, this.weather); this.deadT = -1;
        this._setLevelVisuals(0, false);
      }
    },

    adapt(real) {
      if (params.get('adaptive') === '0' || this.mode === 'paused' || this.mode === 'boot') return;
      if (this._adaptHold > 0) { this._adaptHold--; return; }
      this._ft = this._ft == null ? real : this._ft + (real - this._ft) * 0.1;
      this._slowT = this._ft > 0.022 ? (this._slowT || 0) + real : 0;
      const R = this.renderer;
      if (this._slowT > 1.5 && R.px > 1.01) { R.maxPx = Math.max(1, R.px * 0.75); R.resize(); this._slowT = 0; this._ft = null; this._adaptHold = 60; }
    },

    frame(ts) {
      try {
        const real = Math.min(0.1, Math.max(0, (ts - this.last) / 1000));
        this.last = ts;
        // master clock: the audio clock while it runs at 1× (rhythm-critical), else rAF time × speed
        const ac = KB.Audio.clock();
        let dt;
        this._audioMaster = ac != null && this.speed === 1;
        if (this._audioMaster) { dt = this._lastAc == null ? real : clampNum(ac - this._lastAc, 0, 0.1); this._lastAc = ac; this.clockT = ac; }
        else { this._lastAc = null; dt = real * this.speed; this.clockT = ts / 1000; }
        if (this.mode !== 'paused' && this.world) {
          const n = Math.max(1, Math.ceil(dt / (1 / 60))), h = dt / n;
          for (let i = 0; i < n; i++) this.step(h);
          this.renderer.update(dt);
          if (this.mode === 'playing') KB.Audio.syncTo(this.world, this.speed);
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
  function clampNum(v, a, b) { return v < a ? a : v > b ? b : v; }

  KB.Game = Game;
  KB.debug = {
    get world() { return Game.world; },
    get weather() { return Game.weather; },
    get mode() { return Game.mode; },
    get stats() { return Game.stats; },
    getState() {
      const w = Game.world; if (!w) return null;
      const st = w.getState ? w.getState() : { state: w.state, level: w.level, tod: w.tod, songTime: +(w.songTime || 0).toFixed(2), score: w.score, groove: +(w.groove || 0).toFixed(3), combo: w.combo, mult: w.mult, boss: w.boss && w.boss.state };
      st.mode = Game.mode; st.particles = Game.weather ? Game.weather.particles.length : 0; st.fx = Game.renderer.fx.length;
      return st;
    },
    setSpeed(n) { Game.speed = n; },
    startGame() { Game.startGame(); },
    tap(lane) { Game.tap(lane); },
    setBot(on, skill) { Game.botMode = on; Game.bot = on ? new KB.Bot(Game.world, { skill: skill == null ? 1 : skill, seed: 11 }) : null; },
    setAutoRestart(on) { Game.autoRestart = on; },
    gotoLevel(i) { Game.world.startLevel(i); },
    bossNow() { const w = Game.world; if (w.bossNow) w.bossNow(); else if (w.boss && w.boss.state === 'away') w.boss.next = 0.01; }
  };

  window.addEventListener('DOMContentLoaded', () => Game.boot().catch(e => {
    console.error(e);
    document.body.insertAdjacentHTML('beforeend', '<pre style="color:#fff;padding:20px">Could not start the game: ' + (e && e.message) + '</pre>');
  }));
})(window.KB = window.KB || {});
