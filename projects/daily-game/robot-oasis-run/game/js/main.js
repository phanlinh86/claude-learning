/* main.js — game controller: boot, loop, input (swipes / tap zones / arrow keys move Pebble between lanes and jump),
 * modes, settings, test hooks. Modes: 'title' (bot demo) → 'playing' ⇄ 'paused' → 'over'. The run lives in PO.World. */
(function (PO) {
  'use strict';
  const params = new URLSearchParams(location.search);
  const num = (k, d) => { const v = parseFloat(params.get(k)); return isFinite(v) ? v : d; };
  const DIFFS = ['easy', 'normal', 'hard'];
  const isTouch = window.matchMedia ? window.matchMedia('(pointer:coarse)').matches : (('ontouchstart' in window) || navigator.maxTouchPoints > 0);
  const LANE_KEYS = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 }, JUMP_KEYS = { ArrowUp: 1, KeyW: 1, Space: 1 };

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
    stats: { games: 0, scores: [], times: [], levels: [], shells: 0, bumps: 0, pillowHits: 0, bossPerfect: 0, errors: [] },

    async boot() {
      await PO.Storage.init();
      Object.assign(this.settings, PO.Storage.getJSON('settings', {}));
      if (!DIFFS.includes(this.settings.difficulty)) this.settings.difficulty = 'easy';
      this.urlMute = params.get('mute') === '1';
      PO.Audio.setOptions({ sfx: this.settings.sfx, music: this.settings.music, muted: this.settings.muted || this.urlMute });
      this.renderer = new PO.Renderer(document.getElementById('game'));
      await PO.Assets.loadAll();
      PO.UI.init(this);
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
      return new PO.World({ seed: s, difficulty: forTitle ? 'normal' : this.difficulty(), level: level || 0 });
    },
    readInsets() {
      const el = document.getElementById('safeProbe'); if (!el) return null;
      const cs = getComputedStyle(el);
      return { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
    },
    relayout() { this.renderer.resize(this.readInsets()); },
    makeWeather() { const wx = new PO.Weather({ width: this.renderer.VW, height: this.renderer.VH, seed: 5 }); wx.setHorizon(this.renderer.horizonY); return wx; },
    _setLevelVisuals(zone, instant) {
      this.weather.setLevel(zone, { instant });
      this.renderer.setLevel(zone, instant);
      PO.Audio.setLevel(zone, this.world && this.world.loop);
    },

    toTitle() {
      PO.Audio.stopMusic();
      this.mode = 'title';
      this.world = this.makeWorld(this.seed != null ? this.seed + 99 : null, true);
      this.bot = new PO.Bot(this.world, { skill: 0.85, seed: 3 });
      this.weather = this.weather || this.makeWeather();
      this.renderer.attach(this.world, this.weather);
      this._setLevelVisuals(0, true);
      this.deadT = -1;
      PO.UI.setHud(false);
      PO.UI.show('scrTitle');
    },

    startGame() {
      PO.Audio.unlock();
      { const t = document.getElementById('toast'); if (t) t.classList.add('hidden'); }
      this.runDifficulty = this.difficulty();
      const lv = params.has('level') ? Math.max(0, num('level', 0) | 0) : 0;
      this.world = this.makeWorld(null, false, lv);
      this.bot = this.botMode ? new PO.Bot(this.world, { skill: num('skill', 1), seed: 11 }) : null;
      if (!this.weather) this.weather = this.makeWeather();
      const z = this.world.zone || 0;
      this.renderer.attach(this.world, this.weather);
      this._setLevelVisuals(z, this.renderer.vis.cur === z);
      this.renderer.showBanner(z);
      PO.Audio.play('start');
      PO.Audio.startMusic();
      this.mode = 'playing';
      this.deadT = -1; this.runT = 0; this._swipe = null;
      PO.UI.hideAll(); PO.UI.setHud(true);
      this.canvasFocus();
    },

    pause() {
      if (this.mode !== 'playing') return;
      if (this.world && (this.world.phase === 'over' || this.deadT >= 0)) return;
      this._swipe = null;
      this.mode = 'paused';
      PO.UI.setHud(false);
      PO.UI.show('scrPause');
    },
    resume() {
      if (this.mode !== 'paused') return;
      this.mode = 'playing';
      PO.UI.hideAll(); PO.UI.setHud(true);
      this.last = performance.now();
      this.canvasFocus();
    },
    canvasFocus() { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); },
    canRestart() { return performance.now() - this.overAt > 700; },

    gameOver() {
      const w = this.world, key = 'best_' + (this.runDifficulty || this.difficulty());
      const prev = parseInt(PO.Storage.get(key, '0'), 10) || 0, newBest = w.score > prev;
      if (newBest) PO.Storage.set(key, String(w.score));
      this.mode = 'over'; this.overAt = performance.now();
      this._swipe = null;
      PO.Audio.stopMusic();
      PO.UI.setHud(false);
      const s = w.stats || {}, names = PO.Renderer.ZONE_INFO.map(z => z.name);
      PO.UI.showGameOver({
        score: w.score, best: Math.max(prev, w.score), newBest: newBest && w.score > 0, cleared: w.level || 0,
        shells: w.shells || 0, combo: w.maxCombo || 0, dist: Math.round(w.dist || 0), dodged: s.pillowsDodged || 0, perfect: s.bossPerfect || 0, bumps: s.bumps || 0,
        reached: names[(w.zone || 0) % 4] + ((w.loop || 0) > 0 ? ' (book ' + (w.loop + 1) + ')' : '')
      });
      if (newBest && w.score > 0) PO.Audio.play('best');
      const st = this.stats;
      st.games++; st.scores.push(w.score); st.times.push(+(this.runT || 0).toFixed(2)); st.levels.push(w.level || 0);
      st.shells += w.shells || 0; st.bumps += s.bumps || 0; st.pillowHits += s.pillowHits || 0; st.bossPerfect += s.bossPerfect || 0;
      if (this.autoRestart) setTimeout(() => this.startGame(), 50);
    },

    best(d) { return parseInt(PO.Storage.get('best_' + (d || this.difficulty()), '0'), 10) || 0; },
    resetBest() { DIFFS.forEach(d => PO.Storage.del('best_' + d)); },
    setSetting(k, v) {
      this.settings[k] = v;
      PO.Storage.setJSON('settings', this.settings);
      PO.Audio.setOptions({ sfx: this.settings.sfx, music: this.settings.music, muted: this.settings.muted || this.urlMute });
      if (k === 'music' && v && (this.mode === 'playing' || this.mode === 'paused')) PO.Audio.startMusic();
    },
    toggleMute() {
      if (this.urlMute && !this.settings.muted) {
        this.urlMute = false;
        PO.Audio.setOptions({ sfx: this.settings.sfx, music: this.settings.music, muted: false });
      } else {
        const on = !this.settings.muted;
        if (!on) this.urlMute = false;
        this.setSetting('muted', on);
      }
      PO.UI.syncMute(); PO.UI.toast(this.settings.muted || this.urlMute ? 'Sound off' : 'Sound on', 900);
    },
    setFullscreen(on) {
      this.fullscreen = on;
      if (typeof window.ffFullscreen === 'function') window.ffFullscreen(on);
      else if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
      else if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
      setTimeout(() => this.renderer.resize(), 150);
    },
    picturesChanged() { PO.Assets._ver = (PO.Assets._ver || 0) + 1; },
    quit() { if (typeof window.ffQuit === 'function') window.ffQuit(); else window.close(); },

    // ---------------- input: swipes, tap zones (left / middle / right third) and keys ----------------
    playerCanAct() { return this.mode === 'playing' && this.world && this.world.phase !== 'over' && this.deadT < 0 && !this.bot; },
    act(kind) {
      if (!this.playerCanAct()) return;
      if (kind === 'jump') this.world.jump(); else this.world.move(kind);
    },
    bindInput() {
      window.addEventListener('keydown', e => {
        if (e.code === 'F11') { e.preventDefault(); this.setFullscreen(!this.fullscreen); PO.UI.syncSettings(); return; }
        if (e.code === 'KeyM' && !e.repeat) { this.toggleMute(); return; }
        const ui = PO.UI.current;
        if (e.code === 'Escape' || e.code === 'KeyP') {
          if (this.mode === 'playing') { this.pause(); e.preventDefault(); return; }
          if (this.mode === 'paused' && ui === 'scrPause') { this.resume(); e.preventDefault(); return; }
          if (ui === 'scrHow' || ui === 'scrSettings' || ui === 'scrCustom') { PO.UI.back(); e.preventDefault(); return; }
          return;
        }
        if (this.mode === 'playing' && LANE_KEYS[e.code]) { e.preventDefault(); if (!e.repeat) this.act(LANE_KEYS[e.code]); return; }
        if (this.mode === 'playing' && JUMP_KEYS[e.code]) { e.preventDefault(); if (!e.repeat) this.act('jump'); return; }
        if (this.mode === 'playing' && (e.code === 'Enter' || e.code === 'ArrowDown' || e.code === 'KeyS')) { e.preventDefault(); return; }
        if (this.mode === 'over' && (e.code === 'Enter' || e.code === 'Space')) { const f = document.activeElement; if (f && f.tagName === 'BUTTON' && f.id !== 'btnAgain') return; e.preventDefault(); if (!e.repeat && this.canRestart()) this.startGame(); return; }
        if (this.mode === 'title' && ui === 'scrTitle' && e.code === 'Space') {
          const f = document.activeElement;
          if (f && f.tagName === 'BUTTON' && f.id !== 'btnPlay') return;
          e.preventDefault(); this.startGame();
        }
      });
      const stage = document.getElementById('stage');
      const onUi = e => e.target.closest && e.target.closest('button, .screen, #hud, input, label');
      // a swipe fires as soon as it crosses the threshold (not on release); a short tap acts on pointerup by screen third
      stage.addEventListener('pointerdown', e => {
        PO.Audio.unlock();
        if (onUi(e)) return;
        if (this.mode !== 'playing' || e.button === 2) return;
        e.preventDefault();
        this._swipe = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), done: false };
      });
      stage.addEventListener('pointermove', e => {
        const s = this._swipe; if (!s || s.id !== e.pointerId || s.done || this.mode !== 'playing') return;
        const dx = e.clientX - s.x, dy = e.clientY - s.y, th = 24;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < th) return;
        if (performance.now() - s.t > 600) { s.done = true; return; }
        s.done = true;
        if (Math.abs(dx) > Math.abs(dy)) this.act(dx > 0 ? 1 : -1);
        else if (dy < 0) this.act('jump');
      });
      const up = e => {
        const s = this._swipe; if (!s || s.id !== e.pointerId) return;
        this._swipe = null;
        if (s.done || e.type === 'pointercancel' || this.mode !== 'playing') return;
        const [x] = this.renderer.toLogical(s.x, s.y), VW = this.renderer.VW;
        this.act(x < VW / 3 ? -1 : x > VW * 2 / 3 ? 1 : 'jump');
      };
      stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
      window.addEventListener('blur', () => { this._swipe = null; if (this.mode === 'playing') this.pause(); });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) { if (this.mode === 'playing') this.pause(); PO.Audio.suspend(); }
        else PO.Audio.resume();
      });
      const unlock = () => PO.Audio.unlock();
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
      document.addEventListener('fullscreenchange', () => { this.fullscreen = !!document.fullscreenElement || (this.fullscreen && typeof window.ffFullscreen === 'function'); this.renderer.resize(); PO.UI.syncSettings(); });
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
      const sound = this.mode !== 'title', A = PO.Audio;
      for (const e of evts) {
        switch (e.type) {
          case 'shell': if (sound) A.play('shell', { combo: e.combo }); break;
          case 'combo': if (sound) A.play('combo', { combo: e.combo }); break;
          case 'lane': if (sound) A.play('lane', { dir: e.to - e.from }); break;
          case 'jump': if (sound) A.play('jump'); break;
          case 'land': if (sound) A.play('land'); break;
          case 'bump': if (sound) A.play(e.kind === 'pillow' ? 'pillow' : 'bump'); if (sound && e.kind === 'pillow') A.play('bump'); break;
          case 'throw': if (sound) A.play('throw'); break;
          case 'pillowLand': if (sound) A.play('pillow'); break;
          case 'bossEnter': if (sound) A.play('bossEnter'); break;
          case 'bossLeave': if (sound) { A.play('hmph'); if (e.perfect) A.play('perfect'); } break;
          case 'tumbleBounce': if (sound) A.play('tumble'); break;
          case 'heartLost': if (sound) A.play('heartLost'); break;
          case 'heartGain': if (sound) A.play('heartGain'); break;
          case 'levelUp': this._setLevelVisuals(e.zone, false); if (sound) setTimeout(() => A.play('level'), 200); break;
          case 'gameOver': if (sound) A.play('over'); A.stopMusic(); this.deadT = 0; this._swipe = null; break;
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
      this.weather.update(h, this.mode === 'paused' ? 0 : (w.speed || 0));
      if (this.mode === 'playing') this.runT += h;
      if (this.deadT >= 0) this.deadT += h;
      if (this.mode === 'playing' && this.deadT > 1.6) this.gameOver();
      if (this.mode === 'title' && (w.phase === 'over' || (w.level || 0) >= 1) && (this.deadT < 0 || this.deadT > 1.5)) {
        this.world = this.makeWorld(null, true);
        this.bot = new PO.Bot(this.world, { skill: 0.85, seed: (Math.random() * 1e6) | 0 });
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

  PO.Game = Game;
  PO.debug = {
    get world() { return Game.world; },
    get weather() { return Game.weather; },
    get mode() { return Game.mode; },
    get stats() { return Game.stats; },
    getState() {
      const w = Game.world; if (!w) return null;
      const st = w.getState();
      st.mode = Game.mode; st.particles = Game.weather ? Game.weather.particles.length : 0; st.fx = Game.renderer.fx.length;
      return st;
    },
    setSpeed(n) { Game.speed = n; },
    startGame() { Game.startGame(); },
    move(d) { Game.act(d); },
    jump() { Game.act('jump'); },
    summonBoss() { if (Game.world) Game.world.summonBoss(); },
    setBot(on, skill) { Game.botMode = on; Game.bot = on ? new PO.Bot(Game.world, { skill: skill == null ? 1 : skill, seed: 11 }) : null; },
    setAutoRestart(on) { Game.autoRestart = on; },
    gotoLevel(i) { Game.world.gotoLevel(i); }   // emits levelUp → visuals, music, banner
  };

  window.addEventListener('DOMContentLoaded', () => Game.boot().catch(e => {
    console.error(e);
    document.body.insertAdjacentHTML('beforeend', '<pre style="color:#fff;padding:20px">Could not start the game: ' + (e && e.message) + '</pre>');
  }));
})(window.PO = window.PO || {});
