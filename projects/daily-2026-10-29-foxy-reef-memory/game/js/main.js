/* main.js — game controller: boot, loop, input (mouse/touch/keyboard), modes, settings, test hooks.
 * Modes: 'title' (bot demo behind the menu) → 'playing' ⇄ 'paused' → 'over'. World states live inside RF.World. */
(function (RF) {
  'use strict';
  const params = new URLSearchParams(location.search);
  const num = (k, d) => { const v = parseFloat(params.get(k)); return isFinite(v) ? v : d; };
  const SEASON_NAMES = ['Spring', 'Summer', 'Autumn', 'Winter'];

  /* Difficulty presets → CONFIG overrides (see docs/MECHANICS.md). Unknown keys are skipped safely. */
  function difficultyOverrides(d, peek) {
    const o = Object.assign({}, (RF.DIFFICULTY && RF.DIFFICULTY[d]) || {});
    o.peekTime = peek;   // the Settings "Peek at start" choice always wins
    return o;
  }

  const Game = {
    mode: 'boot',
    isApp: params.get('app') === '1' || typeof window.ffStoreSet === 'function',
    speed: Math.max(0.1, Math.min(64, num('speed', 1))),
    botMode: params.get('bot') === '1',
    autoRestart: params.get('autorestart') === '1',
    seed: params.has('seed') ? num('seed', 1) : null,
    world: null, weather: null, bot: null, renderer: null,
    settings: { sfx: true, music: true, muted: false, difficulty: 'normal', peek: 1 },
    fullscreen: false, overAt: 0, deadAt: -1,
    stats: { games: 0, scores: [], times: [], levels: [], matches: 0, mistakes: 0, errors: [] },

    async boot() {
      await RF.Storage.init();
      Object.assign(this.settings, RF.Storage.getJSON('settings', {}));
      this.urlMute = params.get('mute') === '1';
      RF.Audio.setOptions({ sfx: this.settings.sfx, music: this.settings.music, muted: this.settings.muted || this.urlMute });
      this.renderer = new RF.Renderer(document.getElementById('game'));
      await RF.Assets.loadAll();
      this.renderer.resize();
      RF.UI.init(this);
      this.bindInput();
      window.addEventListener('resize', () => { clearTimeout(this._rsz); this._rsz = setTimeout(() => this.renderer.resize(), 120); });
      if (params.get('autostart') === '1') this.startGame(); else this.toTitle();
      this.last = performance.now();
      requestAnimationFrame(t => this.frame(t));
    },

    makeWorld(seed, forTitle) {
      const s = seed != null ? seed : (this.seed != null ? this.seed : (Math.random() * 1e9) | 0);
      const cfg = forTitle ? { peekTime: 0 } : difficultyOverrides(this.settings.difficulty, this.settings.peek);
      const w = new RF.World({ seed: s, config: cfg });
      w.reset();
      return w;
    },
    makeWeather() { return new RF.Weather({ width: 960, height: 540, seed: 5 }); },

    toTitle() {
      RF.Audio.stopMusic();
      this.mode = 'title';
      this.world = this.makeWorld(this.seed != null ? this.seed + 99 : null, true);
      this.bot = new RF.Bot(this.world, { skill: 0.85, seed: 3 });
      this.weather = this.weather || this.makeWeather();
      this.weather.setSeason(0, { instant: true });
      this.renderer.attach(this.world, this.weather);
      this.renderer.setSeason(0, true);
      RF.Audio.setSeason(0);
      this.deadAt = -1;
      RF.UI.setHud(false);
      RF.UI.show('scrTitle');
    },

    startGame() {
      RF.Audio.unlock();
      this.world = this.makeWorld();
      const lv = params.has('level') ? Math.max(0, num('level', 0) | 0) : 0;
      if (lv > 0 && this.world.startLevel) this.world.startLevel(lv);
      this.bot = this.botMode ? new RF.Bot(this.world, { skill: num('skill', 1), seed: 11 }) : null;
      if (!this.weather) this.weather = this.makeWeather();
      const s = this.world.season || 0;
      this.weather.setSeason(s, { instant: this.renderer.vis.cur === s });
      this.renderer.attach(this.world, this.weather);
      this.renderer.setSeason(s, this.renderer.vis.cur === s);
      this.renderer.showBanner(s);
      RF.Audio.setSeason(s);
      RF.Audio.play('start');
      if (this.settings.music) RF.Audio.startMusic();
      this.mode = 'playing';
      this.deadAt = -1;
      RF.UI.hideAll(); RF.UI.setHud(true);
      this.canvasFocus();
    },

    pause() {
      if (this.mode !== 'playing') return;
      if (this.world && this.world.state === 'dead') return;
      this.mode = 'paused';
      RF.UI.setHud(false);
      RF.UI.show('scrPause');
    },
    resume() {
      if (this.mode !== 'paused') return;
      this.mode = 'playing';
      RF.UI.hideAll(); RF.UI.setHud(true);
      this.last = performance.now();
      this.canvasFocus();
    },
    canvasFocus() { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); },
    canRestart() { return performance.now() - this.overAt > 700; },

    gameOver() {
      const w = this.world;
      const key = 'best_' + this.settings.difficulty;
      const prev = parseInt(RF.Storage.get(key, '0'), 10) || 0;
      const newBest = w.score > prev;
      if (newBest) RF.Storage.set(key, String(w.score));
      this.mode = 'over';
      this.overAt = performance.now();
      RF.UI.setHud(false);
      RF.UI.showGameOver({
        score: w.score, best: Math.max(prev, w.score), newBest: newBest && w.score > 0,
        matches: w.matches || 0, mistakes: w.mistakes || 0, bestCombo: w.bestCombo || 0, cupcakes: w.cupcakesEaten || 0,
        cleared: w.level || 0,
        seasonName: SEASON_NAMES[w.season || 0] + ((w.lap || 0) > 0 ? ' (lap ' + (w.lap + 1) + ')' : '') + ' · level ' + ((w.level || 0) + 1)
      });
      if (newBest && w.score > 0) RF.Audio.play('best');
      const st = this.stats;
      st.games++; st.scores.push(w.score); st.times.push(+w.time.toFixed(2)); st.levels.push(w.level || 0);
      st.matches += w.matches || 0; st.mistakes += w.mistakes || 0;
      if (this.autoRestart) setTimeout(() => this.startGame(), 50);
    },

    best() { return parseInt(RF.Storage.get('best_' + this.settings.difficulty, '0'), 10) || 0; },
    resetBest() { ['easy', 'normal', 'hard'].forEach(d => RF.Storage.del('best_' + d)); },
    setSetting(k, v) {
      this.settings[k] = v;
      RF.Storage.setJSON('settings', this.settings);
      RF.Audio.setOptions({ sfx: this.settings.sfx, music: this.settings.music, muted: this.settings.muted || this.urlMute });
      if (k === 'music') { if (v && this.mode !== 'title') RF.Audio.startMusic(); if (!v) RF.Audio.stopMusic(); }
    },
    toggleMute() {
      this.setSetting('muted', !this.settings.muted);
      RF.UI.syncMute();
      RF.UI.toast(this.settings.muted ? 'Sound off' : 'Sound on', 900);
    },
    setFullscreen(on) {
      this.fullscreen = on;
      if (typeof window.ffFullscreen === 'function') window.ffFullscreen(on);
      else if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
      else if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
      setTimeout(() => this.renderer.resize(), 150);
    },
    picturesChanged() { RF.Assets._ver = (RF.Assets._ver || 0) + 1; },
    quit() { if (typeof window.ffQuit === 'function') window.ffQuit(); else window.close(); },

    // ---------------- input ----------------
    playerCanAct() { return this.mode === 'playing' && this.world && this.world.state !== 'dead' && !this.bot; },
    tapAt(clientX, clientY) {
      RF.Audio.unlock();
      if (!this.playerCanAct()) return;
      const [x, y] = this.renderer.toLogical(clientX, clientY);
      const id = this.world.cardAt(x, y);
      this.renderer.showCursor = false;
      if (id != null) this.world.select(id);
    },
    bindInput() {
      window.addEventListener('keydown', e => {
        if (e.code === 'F11') { e.preventDefault(); this.setFullscreen(!this.fullscreen); RF.UI.syncSettings(); return; }
        if (e.code === 'KeyM' && !e.repeat) { this.toggleMute(); return; }
        const ui = RF.UI.current;
        if (e.code === 'Escape' || e.code === 'KeyP') {
          if (this.mode === 'playing') { this.pause(); e.preventDefault(); return; }
          if (this.mode === 'paused' && ui === 'scrPause') { this.resume(); e.preventDefault(); return; }
          if (ui === 'scrHow' || ui === 'scrSettings' || ui === 'scrCustom') { RF.UI.back(); e.preventDefault(); return; }
          return;
        }
        if (this.mode === 'playing') {
          const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], KeyA: [-1, 0], KeyD: [1, 0], KeyW: [0, -1], KeyS: [0, 1] };
          if (dirs[e.code]) { e.preventDefault(); if (this.playerCanAct()) { this.renderer.showCursor = true; this.world.moveCursor(...dirs[e.code]); } return; }
          if (e.code === 'Space' || e.code === 'Enter') {
            e.preventDefault();
            if (e.repeat || !this.playerCanAct()) return;
            RF.Audio.unlock();
            if (!this.renderer.showCursor) { this.renderer.showCursor = true; return; }   // first press just shows the cursor
            this.world.selectCursor();
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
        if (e.button !== undefined && e.button > 0) return;
        if (e.target.closest && e.target.closest('button, .screen, #hud, input, label')) return;   // HUD/menu clicks never flip cards
        if (this.mode === 'playing') { e.preventDefault(); this.tapAt(e.clientX, e.clientY); }
      });
      stage.addEventListener('pointermove', e => {
        if (this.mode !== 'playing' || !this.world) { this.renderer.hoverId = null; return; }
        const [x, y] = this.renderer.toLogical(e.clientX, e.clientY);
        const id = this.world.cardAt(x, y);
        this.renderer.hoverId = id;
        document.getElementById('game').style.cursor = id != null ? 'pointer' : 'default';
      });
      window.addEventListener('blur', () => { if (this.mode === 'playing') this.pause(); });
      document.addEventListener('visibilitychange', () => { if (document.hidden && this.mode === 'playing') this.pause(); });
      window.addEventListener('dragover', e => e.preventDefault());
      window.addEventListener('drop', e => e.preventDefault());
      window.addEventListener('contextmenu', e => e.preventDefault());
      window.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
      window.addEventListener('keydown', e => {
        const k = e.key;
        if (k === 'F5' || ((e.ctrlKey || e.metaKey) && ['r', 'R', '+', '=', '-', '_', '0', 'p', 'P', 'f', 'F', 'g', 'G', 'u', 'U'].includes(k))) e.preventDefault();
      }, true);
      document.addEventListener('fullscreenchange', () => { this.fullscreen = !!document.fullscreenElement || (this.fullscreen && typeof window.ffFullscreen === 'function'); this.renderer.resize(); RF.UI.syncSettings(); });
    },

    handleEvents(evts) {
      const sound = this.mode !== 'title';
      for (const e of evts) {
        switch (e.type) {
          case 'flip': if (sound) RF.Audio.play('flip'); break;
          case 'match': if (sound) RF.Audio.play('match', { combo: e.combo }); break;
          case 'mismatch': if (sound) RF.Audio.play('mismatch'); break;
          case 'slide': if (sound) RF.Audio.play('slide'); break;
          case 'eat': if (sound) RF.Audio.play('eat'); break;
          case 'cupcake': if (sound) RF.Audio.play('bubble'); break;
          case 'airlow': if (sound) RF.Audio.play('airlow'); break;
          case 'cleared': if (sound) RF.Audio.play('cleared'); break;
          case 'season':
            this.weather.setSeason(e.season);
            RF.Audio.setSeason(e.season);
            if (sound) RF.Audio.play('season');
            break;
          case 'dead': if (sound) RF.Audio.play('dead'); this.deadAt = this.world.time; break;
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
      this.weather.update(h, { current: (w.gravity && w.gravity.x) || 0 });
      if (this.mode === 'playing' && w.state === 'dead' && this.deadAt >= 0 && w.time - this.deadAt > 1.2) this.gameOver();
      if (this.mode === 'title' && (w.state === 'dead' || (w.level || 0) >= 2) && (this.deadAt >= 0 ? w.time - this.deadAt > 1.5 : true)) {
        this.world = this.makeWorld(null, true);
        this.bot = new RF.Bot(this.world, { skill: 0.85, seed: (Math.random() * 1e6) | 0 });
        this.renderer.attach(this.world, this.weather); this.deadAt = -1;
        this.weather.setSeason(0); this.renderer.setSeason(0);
      }
    },

    /* adaptive quality: if frames keep taking > 22 ms, render fewer pixels (steps down only; ?adaptive=0 disables) */
    adapt(real) {
      if (params.get('adaptive') === '0' || this.mode === 'paused' || this.mode === 'boot') return;
      if (this._adaptHold > 0) { this._adaptHold--; return; }
      this._slow = real > 0.022 ? (this._slow || 0) + 1 : Math.max(0, (this._slow || 0) - 2);
      const R = this.renderer;
      if (this._slow > 70 && R.px > 1.01) { R.maxPx = Math.max(1, R.px * 0.75); R.resize(); this._slow = 0; this._adaptHold = 60; }
    },

    frame(ts) {
      try {
        const real = Math.min(0.1, Math.max(0, (ts - this.last) / 1000));
        this.last = ts;
        const dt = real * this.speed;
        if (this.mode !== 'paused' && this.world) {
          const n = Math.max(1, Math.ceil(dt / (1 / 60)));
          const h = dt / n;
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

  RF.Game = Game;
  RF.debug = {
    get world() { return Game.world; },
    get weather() { return Game.weather; },
    get mode() { return Game.mode; },
    get stats() { return Game.stats; },
    getState() {
      const w = Game.world;
      return w && { mode: Game.mode, state: w.state, score: w.score, combo: w.combo, level: w.level, season: w.season, lap: w.lap,
        air: +(w.air || 0).toFixed(2), airMax: w.airMax, time: w.time, cards: w.cards.filter(c => c.state !== 'gone').length,
        cupcakes: w.cupcakesEaten, particles: Game.weather ? Game.weather.particles.length : 0, fx: Game.renderer.fx.length };
    },
    setSpeed(n) { Game.speed = n; },
    select(id) { return Game.world.select(id); },
    startGame() { Game.startGame(); },
    setBot(on, skill) { Game.botMode = on; Game.bot = on ? new RF.Bot(Game.world, { skill: skill == null ? 1 : skill, seed: 11 }) : null; },
    setAutoRestart(on) { Game.autoRestart = on; },
    gotoLevel(i) { Game.world.startLevel(i); }
  };

  window.addEventListener('DOMContentLoaded', () => Game.boot().catch(e => {
    console.error(e);
    document.body.insertAdjacentHTML('beforeend', '<pre style="color:#fff;padding:20px">Could not start the game: ' + (e && e.message) + '</pre>');
  }));
})(window.RF = window.RF || {});
