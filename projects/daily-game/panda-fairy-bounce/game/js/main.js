/* main.js — game controller: boot, loop, input (slide a finger / move the mouse anywhere and Mochi follows; tap or
 * click to serve; keyboard ← → / A D move, Space / Enter serve), modes, settings, test hooks.
 * Modes: 'title' (bot demo) → 'playing' ⇄ 'paused' → 'over'. The run lives in MFB.World. */
(function (MFB) {
  'use strict';
  const params = new URLSearchParams(location.search);
  const num = (k, d) => { const v = parseFloat(params.get(k)); return isFinite(v) ? v : d; };
  const DIFFS = ['easy', 'normal', 'hard'];
  const isTouch = window.matchMedia ? window.matchMedia('(pointer:coarse)').matches : (('ontouchstart' in window) || navigator.maxTouchPoints > 0);
  const MOVE_KEYS = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 };

  const Game = {
    mode: 'boot', isTouch,
    isApp: params.get('app') === '1' || typeof window.mfStoreSet === 'function',
    speed: Math.max(0.1, Math.min(64, num('speed', 1))),
    botMode: params.get('bot') === '1',
    autoRestart: params.get('autorestart') === '1',
    seed: params.has('seed') ? num('seed', 1) : null,
    urlDiff: DIFFS.includes(params.get('diff')) ? params.get('diff') : null,   // test flag, never saved
    world: null, weather: null, bot: null, renderer: null,
    settings: { sfx: true, music: true, muted: false, difficulty: 'easy' },   // a family game: first run on Easy
    fullscreen: false, overAt: 0, deadT: -1,
    stats: { games: 0, scores: [], times: [], levels: [], bricks: 0, stars: 0, lost: 0, errors: [] },
    keys: {}, drag: null,

    async boot() {
      await MFB.Storage.init();
      Object.assign(this.settings, MFB.Storage.getJSON('settings', {}));
      if (!DIFFS.includes(this.settings.difficulty)) this.settings.difficulty = 'easy';
      this.urlMute = params.get('mute') === '1';
      MFB.Audio.setOptions({ sfx: this.settings.sfx, music: this.settings.music, muted: this.settings.muted || this.urlMute });
      this.renderer = new MFB.Renderer(document.getElementById('game'));
      await MFB.Assets.loadAll();
      MFB.UI.init(this);
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
      return new MFB.World({ seed: s, difficulty: forTitle ? 'normal' : this.difficulty(), level: level || 0 });
    },
    readInsets() {
      const el = document.getElementById('safeProbe'); if (!el) return null;
      const cs = getComputedStyle(el);
      return { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
    },
    relayout() { this.renderer.resize(this.readInsets()); this.syncRotate(); },
    /* phones held upright: the 16-unit forest is tiny, so ask to turn sideways (once dismissed, never again this session) */
    syncRotate() {
      const el = document.getElementById('rotate'); if (!el) return;
      const on = this.isTouch && this.renderer.portrait && this.mode === 'playing' && !this._rotOk && !this.botMode;
      this._rotOn = on; el.classList.toggle('hidden', !on);
    },
    makeWeather() { return new MFB.Weather({ width: this.renderer.VW, height: this.renderer.VH, seed: 5 }); },
    _setLevelVisuals(zone, instant) {
      this.weather.setLevel(zone % 4, { instant });
      this.renderer.setLevel(zone % 4, instant);
      MFB.Audio.setLevel(zone % 4, this.world && this.world.loop);
    },

    toTitle() {
      MFB.Audio.stopMusic();
      this.mode = 'title';
      this.world = this.makeWorld(this.seed != null ? this.seed + 99 : null, true);
      this.bot = new MFB.Bot(this.world, { skill: 0.85, seed: 3 });
      this.weather = this.weather || this.makeWeather();
      this.renderer.attach(this.world, this.weather);
      this._setLevelVisuals(0, true);
      this.deadT = -1;
      MFB.UI.setHud(false);
      MFB.UI.show('scrTitle');
    },

    startGame() {
      MFB.Audio.unlock();
      { const t = document.getElementById('toast'); if (t) t.classList.add('hidden'); }
      this.runDifficulty = this.difficulty();
      const lv = params.has('level') ? Math.max(0, num('level', 0) | 0) : 0;
      this.world = this.makeWorld(null, false, lv);
      this.bot = this.botMode ? new MFB.Bot(this.world, { skill: num('skill', 1), seed: 11 }) : null;
      if (!this.weather) this.weather = this.makeWeather();
      const z = this.world.zone || 0;
      this.renderer.attach(this.world, this.weather);
      this._setLevelVisuals(z, this.renderer.vis.cur === z % 4);
      this.renderer.showBanner(z);
      MFB.Audio.play('start');
      MFB.Audio.startMusic();
      this.mode = 'playing';
      this.deadT = -1; this.runT = 0; this._keyDir = 0; this.clearInput();
      MFB.UI.hideAll(); MFB.UI.setHud(true);
      this.syncRotate();
      this.canvasFocus();
    },

    pause() {
      if (this.mode !== 'playing') return;
      if (this.world && (this.world.phase === 'over' || this.deadT >= 0)) return;
      this.clearInput();
      this.mode = 'paused';
      MFB.UI.setHud(false);
      MFB.UI.show('scrPause');
    },
    resume() {
      if (this.mode !== 'paused') return;
      this.mode = 'playing';
      MFB.UI.hideAll(); MFB.UI.setHud(true);
      this.last = performance.now();
      this.canvasFocus();
    },
    canvasFocus() { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); },
    canRestart() { return performance.now() - this.overAt > 700; },

    gameOver() {
      const w = this.world, key = 'best_' + (this.runDifficulty || this.difficulty());
      const prev = parseInt(MFB.Storage.get(key, '0'), 10) || 0, newBest = w.score > prev && !this.botMode;
      if (newBest && !this.botMode) MFB.Storage.set(key, String(w.score));   // bot / test runs never overwrite a child's best
      this.mode = 'over'; this.overAt = performance.now();
      this.clearInput();
      MFB.Audio.stopMusic();
      MFB.UI.setHud(false);
      const s = w.stats || {}, names = MFB.Renderer.ZONE_INFO.map(z => z.name);
      MFB.UI.showGameOver({
        score: w.score, best: this.botMode ? prev : Math.max(prev, w.score), newBest: newBest && w.score > 0, cleared: w.level - (w.startLevel || 0),
        bricks: s.bricks || 0, stars: w.starCount || 0, combo: s.maxCombo || 0, bossHits: s.bossHits || 0, tickles: s.tickles || 0, popped: s.pillowsPopped || 0,
        reached: names[(w.zone || 0) % 4] + ((w.loop || 0) > 0 ? ' (round ' + (w.loop + 1) + ')' : '')
      });
      if (newBest && w.score > 0) MFB.Audio.play('best');
      const st = this.stats;
      st.games++; st.scores.push(w.score); st.times.push(+(this.runT || 0).toFixed(2)); st.levels.push(w.level || 0);
      st.bricks += s.bricks || 0; st.stars += w.starCount || 0; st.lost += s.lost || 0;
      if (this.autoRestart) setTimeout(() => this.startGame(), 50);
    },

    best(d) { return parseInt(MFB.Storage.get('best_' + (d || this.difficulty()), '0'), 10) || 0; },
    resetBest() { DIFFS.forEach(d => MFB.Storage.del('best_' + d)); },
    setSetting(k, v) {
      this.settings[k] = v;
      MFB.Storage.setJSON('settings', this.settings);
      MFB.Audio.setOptions({ sfx: this.settings.sfx, music: this.settings.music, muted: this.settings.muted || this.urlMute });
      if (k === 'music' && v && (this.mode === 'playing' || this.mode === 'paused')) MFB.Audio.startMusic();
    },
    toggleMute() {
      if (this.urlMute && !this.settings.muted) {
        this.urlMute = false;
        MFB.Audio.setOptions({ sfx: this.settings.sfx, music: this.settings.music, muted: false });
      } else {
        const on = !this.settings.muted;
        if (!on) this.urlMute = false;
        this.setSetting('muted', on);
      }
      MFB.UI.syncMute(); MFB.UI.toast(this.settings.muted || this.urlMute ? 'Sound off' : 'Sound on', 900);
    },
    setFullscreen(on) {
      this.fullscreen = on;
      if (typeof window.mfFullscreen === 'function') window.mfFullscreen(on);
      else if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
      else if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
      setTimeout(() => this.renderer.resize(), 150);
    },
    picturesChanged() { MFB.Assets._ver = (MFB.Assets._ver || 0) + 1; if (this.renderer) this.renderer._spr.clear(); },
    quit() { if (typeof window.mfQuit === 'function') window.mfQuit(); else window.close(); },

    // ---------------- input: slide / move anywhere → Mochi follows; tap / click / Space → serve; ← → keys ----------------
    playerCanAct() { return this.mode === 'playing' && this.world && this.world.phase !== 'over' && this.deadT < 0 && !this.bot; },
    clearInput() {
      this.keys = {};
      if (this.world && !this.bot && this.world.movePaddle) this.world.movePaddle(0);
      this.drag = null;
    },
    serve() { if (this.playerCanAct()) return this.world.serve(); return false; },
    syncKeys() {
      if (!this.playerCanAct()) return;
      let d = 0; for (const c in this.keys) if (this.keys[c] && MOVE_KEYS[c]) d += MOVE_KEYS[c];
      d = Math.max(-1, Math.min(1, d));
      if (d !== this._keyDir) { this._keyDir = d; this.world.movePaddle(d); }
    },
    bindInput() {
      window.addEventListener('keydown', e => {
        if (e.code === 'F11') { e.preventDefault(); this.setFullscreen(!this.fullscreen); MFB.UI.syncSettings(); return; }
        if (e.code === 'KeyM' && !e.repeat) { this.toggleMute(); return; }
        const ui = MFB.UI.current;
        if (e.code === 'Escape' || e.code === 'KeyP') {
          if (this.mode === 'playing') { this.pause(); e.preventDefault(); return; }
          if (this.mode === 'paused' && ui === 'scrPause') { this.resume(); e.preventDefault(); return; }
          if (ui === 'scrHow' || ui === 'scrSettings' || ui === 'scrCustom') { MFB.UI.back(); e.preventDefault(); return; }
          return;
        }
        if (this.mode === 'playing' && MOVE_KEYS[e.code]) { e.preventDefault(); this.keys[e.code] = true; this.syncKeys(); return; }
        if (this.mode === 'playing' && (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowUp' || e.code === 'KeyW')) { e.preventDefault(); if (!e.repeat) this.serve(); return; }
        if (this.mode === 'over' && (e.code === 'Enter' || e.code === 'Space')) { const f = document.activeElement; if (f && f.tagName === 'BUTTON' && f.id !== 'btnAgain') return; e.preventDefault(); if (!e.repeat && this.canRestart()) this.startGame(); return; }
        if (this.mode === 'title' && ui === 'scrTitle' && (e.code === 'Space' || e.code === 'Enter')) {
          const f = document.activeElement;
          if (f && f.tagName === 'BUTTON' && f.id !== 'btnPlay') return;
          e.preventDefault(); this.startGame();
        }
      });
      window.addEventListener('keyup', e => { delete this.keys[e.code]; if (MOVE_KEYS[e.code]) this.syncKeys(); });
      const stage = document.getElementById('stage');
      const onUi = e => e.target.closest && e.target.closest('button, .screen, #hud, #rotate, input, label');
      const worldX = e => this.renderer.toWorldX(this.renderer.toLogical(e.clientX, e.clientY)[0]);
      const follow = e => { this._keyDir = 0; this.world.setPaddleTarget(Math.max(0, Math.min(16, worldX(e)))); };
      stage.addEventListener('pointerdown', e => {
        MFB.Audio.unlock();
        if (onUi(e)) return;
        if (!this.playerCanAct() || e.button === 2) return;
        e.preventDefault();
        try { stage.setPointerCapture(e.pointerId); } catch (_) {}
        this.drag = { id: e.pointerId, x0: e.clientX, t0: performance.now(), type: e.pointerType };
        follow(e);
        if (e.pointerType === 'mouse') this.serve();   // a click serves straight away
      });
      stage.addEventListener('pointermove', e => {
        if (!this.playerCanAct()) return;
        const d = this.drag;
        if (d && d.id === e.pointerId) { follow(e); return; }
        if (e.pointerType === 'mouse' && !onUi(e)) follow(e);   // the mouse steers without a button held
      });
      const up = e => {
        const d = this.drag; if (!d || d.id !== e.pointerId) return;
        this.drag = null;
        if (!this.playerCanAct() || e.type !== 'pointerup' || d.type === 'mouse') return;
        // a touch: a short tap serves (a long slide just moves Mochi)
        const moved = Math.abs(e.clientX - d.x0) / Math.max(1, this.renderer.canvas.getBoundingClientRect().width) * 16;
        if (moved < 1.2 || performance.now() - d.t0 < 260) this.serve();
      };
      stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
      window.addEventListener('blur', () => { this.clearInput(); if (this.mode === 'playing') this.pause(); });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) { this.clearInput(); if (this.mode === 'playing') this.pause(); MFB.Audio.suspend(); }
        else MFB.Audio.resume();
      });
      const unlock = () => MFB.Audio.unlock();
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
      document.addEventListener('fullscreenchange', () => { this.fullscreen = !!document.fullscreenElement || (this.fullscreen && typeof window.mfFullscreen === 'function'); this.renderer.resize(); MFB.UI.syncSettings(); });
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
      const sound = this.mode !== 'title', A = MFB.Audio;
      for (const e of evts) {
        switch (e.type) {
          case 'serve': if (sound) A.play('serve'); break;
          case 'paddle': if (sound) A.play('paddle', { off: e.off }); break;
          case 'wall': if (sound) A.play('wall'); break;
          case 'brick': if (sound) A.play('brick', { broken: e.broken, combo: e.combo }); break;
          case 'starSpawn': if (sound) A.play('starSpawn'); break;
          case 'starCatch': if (sound) A.play('starCatch'); break;
          case 'starMiss': if (sound) A.play('starMiss'); break;
          case 'bossThrow': if (sound) A.play('bossThrow'); break;
          case 'bossHit': if (sound) A.play('bossHit'); break;
          case 'bossTickled': if (sound) A.play('bossTickled'); break;
          case 'pillowHit': if (sound) A.play('pillowHit'); break;
          case 'pillowPop': if (sound) A.play('pillowPop'); break;
          case 'pillowLand': if (sound) A.play('pillowLand'); break;
          case 'net': if (sound) A.play('net'); break;
          case 'combo': if (sound) A.play('combo', { n: e.n }); break;
          case 'ballLost': if (sound) A.play('ballLost'); break;
          case 'heartLost': if (sound) A.play('heartLost'); break;
          case 'heartGain': if (sound) A.play('heartGain'); break;
          case 'levelClear': if (sound) A.play('clear'); break;
          case 'levelUp': this._setLevelVisuals(e.zone, false); if (sound) setTimeout(() => A.play('level'), 200); break;
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
      this.weather.update(h);
      if (this.mode === 'playing') this.runT += h;
      if (this.deadT >= 0) this.deadT += h;
      if (this.mode === 'playing' && this.deadT > 1.6) this.gameOver();
      if (this.mode === 'title' && (w.phase === 'over' || (w.level || 0) >= 1 || w.time > 70) && (this.deadT < 0 || this.deadT > 1.5)) {
        this.world = this.makeWorld(null, true);
        this.bot = new MFB.Bot(this.world, { skill: 0.85, seed: (Math.random() * 1e6) | 0 });
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

  MFB.Game = Game;
  MFB.debug = {
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
    serve() { if (Game.playerCanAct()) return Game.world.serve(); return false; },
    setPaddle(x) { if (Game.world) Game.world.setPaddleTarget(x); },
    clearBricks(leave) { if (Game.world) Game.world.debugClear(leave == null ? 1 : leave); },
    bossThrow() { if (Game.world) Game.world.debugThrow(); },
    setBot(on, skill) { Game.botMode = on; Game.bot = on ? new MFB.Bot(Game.world, { skill: skill == null ? 1 : skill, seed: 11 }) : null; },
    setAutoRestart(on) { Game.autoRestart = on; },
    gotoLevel(i) { Game.world.gotoLevel(i); }   // emits levelUp → visuals, music, banner
  };

  window.addEventListener('DOMContentLoaded', () => Game.boot().catch(e => {
    console.error(e);
    document.body.insertAdjacentHTML('beforeend', '<pre style="color:#fff;padding:20px">Could not start the game: ' + (e && e.message) + '</pre>');
  }));
})(window.MFB = window.MFB || {});
