/* main.js — game controller: boot, game loop, input, modes, settings, test hooks.
 * Modes: 'title' (attract demo behind the menu) → 'ready' → 'playing' ⇄ 'paused' → 'over'. */
(function (FF) {
  'use strict';
  const params = new URLSearchParams(location.search);
  const num = (k, d) => { const v = parseFloat(params.get(k)); return isFinite(v) ? v : d; };
  const SEASON_NAMES = ['Spring', 'Summer', 'Autumn', 'Winter'];

  /* Difficulty presets → CONFIG overrides for FF.World (see docs/MECHANICS.md). */
  function difficultyOverrides(d) {
    const C = FF.CONFIG || {};
    const has = k => Object.prototype.hasOwnProperty.call(C, k);
    const o = {};
    const scale = (k, f) => { if (has(k) && typeof C[k] === 'number') o[k] = C[k] * f; };
    if (d === 'easy') {
      // floatier bird, slower world, bigger shells, gentler wind — good for young kids
      scale('gravity', 0.82); scale('flapImpulse', 0.92); scale('maxFall', 0.85);
      scale('scrollSpeedStart', 0.85); scale('scrollSpeedMax', 0.8);
      scale('turtleSpeedMin', 0.75); scale('turtleSpeedMax', 0.75); scale('turtleSpeedMaxHard', 0.75);
      scale('shellForgive', 2.2); scale('windDifficulty', 0.4); scale('dropCooldown', 0.8);
    } else if (d === 'hard') {
      scale('gravity', 1.12); scale('flapImpulse', 1.05);
      scale('scrollSpeedStart', 1.2); scale('scrollSpeedMax', 1.2);
      scale('turtleSpeedMin', 1.3); scale('turtleSpeedMax', 1.35); scale('turtleSpeedMaxHard', 1.3);
      scale('shellForgive', 0.5); scale('windDifficulty', 1.5); scale('dropCooldown', 1.4);
    }
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
    settings: { sfx: true, music: true, muted: false, difficulty: 'normal', seasonPts: 10 },
    fullscreen: false,
    overAt: 0, deadAt: -1, bestCombo: 0,
    stats: { games: 0, scores: [], times: [], hits: 0, drops: 0, seasonsReached: [], errors: [] },

    async boot() {
      await FF.Storage.init();
      Object.assign(this.settings, FF.Storage.getJSON('settings', {}));
      if (params.get('mute') === '1') this.settings.muted = true;
      FF.Audio.setOptions({ sfx: this.settings.sfx, music: this.settings.music, muted: this.settings.muted });
      this.renderer = new FF.Renderer(document.getElementById('game'));
      await FF.Assets.loadAll();
      this.renderer.resize();
      FF.UI.init(this);
      this.bindInput();
      window.addEventListener('resize', () => this.renderer.resize());
      if (params.get('autostart') === '1') this.startGame(); else this.toTitle();
      this.last = performance.now();
      requestAnimationFrame(t => this.frame(t));
    },

    makeWorld(seed) {
      const s = seed != null ? seed : (this.seed != null ? this.seed : (Math.random() * 1e9) | 0);
      const cfg = Object.assign({ pointsPerSeason: this.settings.seasonPts }, difficultyOverrides(this.settings.difficulty));
      const w = new FF.World({ seed: s, config: cfg });
      w.reset();
      return w;
    },
    makeWeather(seed) {
      const wx = new FF.Weather({ width: 960, height: 540, groundY: this.world.groundY, seed: seed || 7 });
      return wx;
    },

    toTitle() {
      this.mode = 'title';
      this.world = this.makeWorld(this.seed != null ? this.seed + 99 : null);
      this.bot = new FF.Bot(this.world, { skill: 0.92, seed: 3 });
      this.world.flap();
      this.weather = this.weather || this.makeWeather(5);
      this.weather.setSeason(0, { instant: true });
      this.renderer.attach(this.world, this.weather);
      this.renderer.pointsPerSeason = this.settings.seasonPts;
      this.renderer.setSeason(0, true);
      FF.Audio.setSeason(0);
      FF.UI.setHud(false);
      FF.UI.show('scrTitle');
    },

    startGame() {
      FF.Audio.unlock();
      this.world = this.makeWorld();
      this.bot = this.botMode ? new FF.Bot(this.world, { skill: num('skill', 1), seed: 11 }) : null;
      if (!this.weather) this.weather = this.makeWeather(5);
      this.weather.setSeason(0, { instant: this.renderer.vis.cur === 0 });
      this.renderer.attach(this.world, this.weather);
      this.renderer.pointsPerSeason = this.settings.seasonPts;
      this.renderer.setSeason(0, this.renderer.vis.cur === 0);
      FF.Audio.setSeason(0);
      if (this.settings.music) FF.Audio.startMusic();
      this.mode = 'ready';
      this.deadAt = -1; this.bestCombo = 0;
      FF.UI.hideAll();
      FF.UI.setHud(true);
      this.canvasFocus();
    },

    flapInput() {
      FF.Audio.unlock();
      if (this.mode === 'ready') { this.mode = 'playing'; this.world.flap(); }
      else if (this.mode === 'playing') this.world.flap();
      else if (this.mode === 'over' && performance.now() - this.overAt > 700) this.startGame();
    },

    pause() {
      if (this.mode !== 'playing' && this.mode !== 'ready') return;
      this.pausedFrom = this.mode;
      this.mode = 'paused';
      FF.UI.show('scrPause');
    },
    resume() {
      if (this.mode !== 'paused') return;
      this.mode = this.pausedFrom || 'playing';
      FF.UI.hideAll();
      this.last = performance.now();
      this.canvasFocus();
    },
    canvasFocus() { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); },

    gameOver() {
      const w = this.world;
      const key = 'best_' + this.settings.difficulty;
      const prev = parseInt(FF.Storage.get(key, '0'), 10) || 0;
      const newBest = w.score > prev;
      if (newBest) FF.Storage.set(key, String(w.score));
      this.mode = 'over';
      this.overAt = performance.now();
      FF.UI.setHud(false);
      FF.UI.showGameOver({
        score: w.score, best: Math.max(prev, w.score), newBest: newBest && w.score > 0,
        hits: w.hits || 0, drops: w.drops_made || 0, bestCombo: this.bestCombo,
        seasonName: SEASON_NAMES[w.season] + ((w.seasonIndex || 0) >= 4 ? ' (lap ' + (Math.floor(w.seasonIndex / 4) + 1) + ')' : '')
      });
      if (newBest && w.score > 0) FF.Audio.play('best');
      // record stats for automated play-testing
      const st = this.stats;
      st.games++; st.scores.push(w.score); st.times.push(+w.time.toFixed(2)); st.hits += w.hits || 0; st.drops += w.drops_made || 0;
      st.seasonsReached.push(w.seasonIndex || 0);
      if (this.autoRestart) setTimeout(() => this.startGame(), 50);
    },

    best() { return parseInt(FF.Storage.get('best_' + this.settings.difficulty, '0'), 10) || 0; },
    resetBest() { ['easy', 'normal', 'hard'].forEach(d => FF.Storage.del('best_' + d)); },

    setSetting(k, v) {
      this.settings[k] = v;
      FF.Storage.setJSON('settings', this.settings);
      FF.Audio.setOptions({ sfx: this.settings.sfx, music: this.settings.music, muted: this.settings.muted });
      if (k === 'music') { if (v && this.mode !== 'title') FF.Audio.startMusic(); if (!v) FF.Audio.stopMusic(); }
      if (k === 'seasonPts') this.renderer.pointsPerSeason = v;
    },
    toggleMute() {
      this.setSetting('muted', !this.settings.muted);
      FF.UI.syncMute();
      FF.UI.toast(this.settings.muted ? 'Sound off' : 'Sound on', 900);
    },
    setFullscreen(on) {
      this.fullscreen = on;
      if (typeof window.ffFullscreen === 'function') window.ffFullscreen(on);
      else if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
      else if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
      setTimeout(() => this.renderer.resize(), 150);
    },
    picturesChanged() { /* sprites are re-read every frame from FF.Assets; nothing else to rebuild */ },
    quit() {
      if (typeof window.ffQuit === 'function') window.ffQuit(); else window.close();
    },

    bindInput() {
      const isFlapKey = e => e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW';
      window.addEventListener('keydown', e => {
        if (e.code === 'F11') { e.preventDefault(); this.setFullscreen(!this.fullscreen); FF.UI.syncSettings(); return; }
        if (e.code === 'KeyM' && !e.repeat) { this.toggleMute(); return; }
        const ui = FF.UI.current;
        if (e.code === 'Escape' || e.code === 'KeyP') {
          if (this.mode === 'playing' || this.mode === 'ready') { this.pause(); e.preventDefault(); return; }
          if (this.mode === 'paused' && ui === 'scrPause') { this.resume(); e.preventDefault(); return; }
          if (ui === 'scrHow' || ui === 'scrSettings' || ui === 'scrCustom') { FF.UI.back(); e.preventDefault(); return; }
          return;
        }
        if (isFlapKey(e)) {
          if (e.repeat) { e.preventDefault(); return; }
          if (this.mode === 'ready' || this.mode === 'playing') { e.preventDefault(); this.flapInput(); return; }
          if (this.mode === 'over' && e.code === 'Space') { e.preventDefault(); this.flapInput(); return; }
          if (this.mode === 'title' && ui === 'scrTitle' && e.code === 'Space') { e.preventDefault(); this.startGame(); return; }
        }
        if (e.code === 'Enter' && this.mode === 'over' && performance.now() - this.overAt > 700) { e.preventDefault(); this.startGame(); }
      });
      const stage = document.getElementById('stage');
      stage.addEventListener('pointerdown', e => {
        if (e.button !== undefined && e.button > 0) return;
        if (this.mode === 'ready' || this.mode === 'playing') { e.preventDefault(); this.flapInput(); }
      });
      window.addEventListener('blur', () => { if (this.mode === 'playing') this.pause(); });
      document.addEventListener('visibilitychange', () => { if (document.hidden && this.mode === 'playing') this.pause(); });
      // a picture dropped outside a slot must not navigate the window away
      window.addEventListener('dragover', e => e.preventDefault());
      window.addEventListener('drop', e => e.preventDefault());
      window.addEventListener('contextmenu', e => e.preventDefault());
      document.addEventListener('fullscreenchange', () => { this.fullscreen = !!document.fullscreenElement || (this.fullscreen && typeof window.ffFullscreen === 'function'); this.renderer.resize(); });
    },

    handleEvents(evts) {
      const sound = this.mode !== 'title';
      for (const e of evts) {
        switch (e.type) {
          case 'flap': if (sound) FF.Audio.play('flap'); break;
          case 'drop': if (sound) FF.Audio.play('drop'); break;
          case 'start': if (sound) FF.Audio.play('start'); break;
          case 'hit': if (sound) FF.Audio.play('hit', { combo: e.combo }); this.bestCombo = Math.max(this.bestCombo, e.combo || 1); break;
          case 'miss': if (sound) FF.Audio.play('miss'); break;
          case 'ceiling': if (sound) FF.Audio.play('ceiling'); break;
          case 'season':
            this.weather.setSeason(e.season);
            FF.Audio.setSeason(e.season);
            if (sound) FF.Audio.play('season');
            break;
          case 'dead':
            if (sound) FF.Audio.play('dead');
            this.deadAt = this.world.time;
            break;
        }
      }
      this.renderer.onEvents(evts);
    },

    step(h) {
      const w = this.world;
      if (this.bot && (this.mode === 'playing' || this.mode === 'title' || (this.mode === 'ready' && this.botMode))) {
        if (this.mode === 'ready') { this.mode = 'playing'; }
        this.bot.step(h);
      }
      w.update(h);
      const ev = w.drainEvents();
      if (ev.length) this.handleEvents(ev);
      this.weather.update(h, { wind: w.wind || 0, scrollSpeed: w.scrollSpeed || 0 });
      if (this.mode === 'playing' && w.state === 'dead' && this.deadAt >= 0 && w.time - this.deadAt > 0.9) this.gameOver();
      if (this.mode === 'title' && w.state === 'dead' && this.deadAt >= 0 && w.time - this.deadAt > 1.5) {
        // restart the attract demo, keep the current season look
        this.world = this.makeWorld(); this.bot = new FF.Bot(this.world, { skill: 0.92, seed: (Math.random() * 1e6) | 0 });
        this.world.flap(); this.renderer.attach(this.world, this.weather); this.deadAt = -1;
        this.weather.setSeason(0); this.renderer.setSeason(0);
      }
    },

    frame(ts) {
      try {
        const real = Math.min(0.1, Math.max(0, (ts - this.last) / 1000));
        this.last = ts;
        const dt = real * this.speed;
        if (this.mode !== 'paused' && this.world) {
          // big time steps (high-speed test mode) are split so the bot can react like a human would
          const n = Math.max(1, Math.ceil(dt / (1 / 60)));
          const h = dt / n;
          for (let i = 0; i < n; i++) this.step(h);
          this.renderer.update(dt);
        }
        this.renderer.draw(this.mode);
      } catch (err) {
        console.error(err);
        if (this.stats.errors.length < 20) this.stats.errors.push(String(err && err.stack || err));
      }
      requestAnimationFrame(t => this.frame(t));
    }
  };

  FF.Game = Game;
  FF.debug = {
    get world() { return Game.world; },
    get weather() { return Game.weather; },
    get mode() { return Game.mode; },
    get stats() { return Game.stats; },
    getState() {
      const w = Game.world;
      return w && { mode: Game.mode, state: w.state, score: w.score, combo: w.combo, season: w.season, time: w.time,
        bird: { x: w.bird.x, y: w.bird.y, vy: w.bird.vy, angle: w.bird.angle }, drops: w.drops.length, turtles: w.turtles.length,
        particles: Game.weather ? Game.weather.particles.length : 0 };
    },
    setSpeed(n) { Game.speed = n; },
    flap() { Game.flapInput(); },
    startGame() { Game.startGame(); },
    setBot(on, skill) { Game.botMode = on; Game.bot = on ? new FF.Bot(Game.world, { skill: skill == null ? 1 : skill, seed: 11 }) : null; },
    setAutoRestart(on) { Game.autoRestart = on; }
  };

  window.addEventListener('DOMContentLoaded', () => Game.boot().catch(e => {
    console.error(e);
    document.body.insertAdjacentHTML('beforeend', '<pre style="color:#fff;padding:20px">Could not start the game: ' + (e && e.message) + '</pre>');
  }));
})(window.FF = window.FF || {});
