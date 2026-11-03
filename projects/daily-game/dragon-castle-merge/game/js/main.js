/* main.js — game controller: boot, loop, input (aim + drop), modes, settings, test hooks.
 * Modes: 'title' (bot demo) → 'playing' ⇄ 'paused' → 'over'. Board phases live in EG.World. */
(function (EG) {
  'use strict';
  const params = new URLSearchParams(location.search);
  const num = (k, d) => { const v = parseFloat(params.get(k)); return isFinite(v) ? v : d; };
  const DIFFS = ['easy', 'normal', 'hard'];
  const isTouch = window.matchMedia ? window.matchMedia('(pointer:coarse)').matches : (('ontouchstart' in window) || navigator.maxTouchPoints > 0);
  const DROP_KEYS = ['Space', 'ArrowDown', 'KeyS', 'Enter', 'NumpadEnter'];
  const LEFT_KEYS = ['ArrowLeft', 'KeyA'], RIGHT_KEYS = ['ArrowRight', 'KeyD'];

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
    stats: { games: 0, scores: [], times: [], levels: [], merges: 0, boos: 0, maxTier: [], errors: [] },

    async boot() {
      await EG.Storage.init();
      Object.assign(this.settings, EG.Storage.getJSON('settings', {}));
      if (!DIFFS.includes(this.settings.difficulty)) this.settings.difficulty = 'easy';
      this.urlMute = params.get('mute') === '1';
      EG.Audio.setOptions({ sfx: this.settings.sfx, music: this.settings.music, muted: this.settings.muted || this.urlMute });
      this.renderer = new EG.Renderer(document.getElementById('game'));
      await EG.Assets.loadAll();
      EG.UI.init(this);
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
      const R = this.renderer;
      return new EG.World({ seed: s, difficulty: forTitle ? 'normal' : this.difficulty(), width: R.VW, height: R.VH, level: level || 0 });
    },
    readInsets() {
      const el = document.getElementById('safeProbe'); if (!el) return null;
      const cs = getComputedStyle(el);
      return { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
    },
    relayout() { this.renderer.resize(this.readInsets()); },
    makeWeather() { return new EG.Weather({ width: this.renderer.VW, height: this.renderer.VH, seed: 5 }); },
    _setLevelVisuals(zone, instant) {
      this.weather.setLevel(zone, { instant });
      this.renderer.setLevel(zone, instant);
      EG.Audio.setLevel(zone, this.world && this.world.loop);
    },

    toTitle() {
      EG.Audio.stopMusic();
      this.mode = 'title';
      this.world = this.makeWorld(this.seed != null ? this.seed + 99 : null, true);
      this.bot = new EG.Bot(this.world, { skill: 0.85, seed: 3 });
      this.weather = this.weather || this.makeWeather();
      this.renderer.attach(this.world, this.weather);
      this._setLevelVisuals(0, true);
      this.deadT = -1;
      EG.UI.setHud(false);
      EG.UI.show('scrTitle');
    },

    startGame() {
      EG.Audio.unlock();
      { const t = document.getElementById('toast'); if (t) t.classList.add('hidden'); }
      this.runDifficulty = this.difficulty();
      const lv = params.has('level') ? Math.max(0, num('level', 0) | 0) : 0;
      this.world = this.makeWorld(null, false, lv);
      this.bot = this.botMode ? new EG.Bot(this.world, { skill: num('skill', 1), seed: 11 }) : null;
      if (!this.weather) this.weather = this.makeWeather();
      const z = this.world.zone || 0;
      this.renderer.attach(this.world, this.weather);
      this._setLevelVisuals(z, this.renderer.vis.cur === z);
      this.renderer.showBanner(z);
      EG.Audio.play('start');
      EG.Audio.startMusic();
      this.mode = 'playing';
      this.deadT = -1; this.runT = 0; this._dragging = false;
      EG.UI.hideAll(); EG.UI.setHud(true);
      this.canvasFocus();
    },

    pause() {
      if (this.mode !== 'playing') return;
      if (this.world && (this.world.phase === 'over' || this.deadT >= 0)) return;
      this._dragging = false;
      this.mode = 'paused';
      EG.UI.setHud(false);
      EG.UI.show('scrPause');
    },
    resume() {
      if (this.mode !== 'paused') return;
      this.mode = 'playing';
      EG.UI.hideAll(); EG.UI.setHud(true);
      this.last = performance.now();
      this.canvasFocus();
    },
    canvasFocus() { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); },
    canRestart() { return performance.now() - this.overAt > 700; },

    gameOver() {
      const w = this.world, key = 'best_' + (this.runDifficulty || this.difficulty());
      const prev = parseInt(EG.Storage.get(key, '0'), 10) || 0, newBest = w.score > prev;
      if (newBest) EG.Storage.set(key, String(w.score));
      this.mode = 'over'; this.overAt = performance.now();
      this._dragging = false;
      EG.Audio.stopMusic();
      EG.UI.setHud(false);
      const s = w.stats || {}, T = EG.Renderer.TIER, names = EG.Renderer.ZONE_INFO.map(z => z.name);
      let top = 0; (s.byTier || []).forEach((n, t) => { if (n > 0 && t > top) top = t; });
      top = Math.max(top, w.maxTier || 0);
      EG.UI.showGameOver({
        score: w.score, best: Math.max(prev, w.score), newBest: newBest && w.score > 0, cleared: w.level || 0,
        biggest: top ? T[Math.min(8, top)].name : '—', combo: w.maxCombo || 0, merges: s.merges || 0, boos: s.boos || 0,
        woken: s.pumpkinsWoken || 0,
        reached: names[(w.zone || 0) % 4] + ((w.loop || 0) > 0 ? ' (round ' + (w.loop + 1) + ')' : '')
      });
      if (newBest && w.score > 0) EG.Audio.play('best');
      const st = this.stats;
      st.games++; st.scores.push(w.score); st.times.push(+(this.runT || 0).toFixed(2)); st.levels.push(w.level || 0);
      st.merges += s.merges || 0; st.boos += s.boos || 0; st.maxTier.push(top);
      if (this.autoRestart) setTimeout(() => this.startGame(), 50);
    },

    best() { return parseInt(EG.Storage.get('best_' + this.difficulty(), '0'), 10) || 0; },
    resetBest() { DIFFS.forEach(d => EG.Storage.del('best_' + d)); },
    setSetting(k, v) {
      this.settings[k] = v;
      EG.Storage.setJSON('settings', this.settings);
      EG.Audio.setOptions({ sfx: this.settings.sfx, music: this.settings.music, muted: this.settings.muted || this.urlMute });
      if (k === 'music' && v && (this.mode === 'playing' || this.mode === 'paused')) EG.Audio.startMusic();
    },
    toggleMute() {
      if (this.urlMute && !this.settings.muted) {
        this.urlMute = false;
        EG.Audio.setOptions({ sfx: this.settings.sfx, music: this.settings.music, muted: false });
      } else {
        const on = !this.settings.muted;
        if (!on) this.urlMute = false;
        this.setSetting('muted', on);
      }
      EG.UI.syncMute(); EG.UI.toast(this.settings.muted || this.urlMute ? 'Sound off' : 'Sound on', 900);
    },
    setFullscreen(on) {
      this.fullscreen = on;
      if (typeof window.ffFullscreen === 'function') window.ffFullscreen(on);
      else if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
      else if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
      setTimeout(() => this.renderer.resize(), 150);
    },
    picturesChanged() { EG.Assets._ver = (EG.Assets._ver || 0) + 1; },
    quit() { if (typeof window.ffQuit === 'function') window.ffQuit(); else window.close(); },

    // ---------------- input: aim with the pointer / arrows, drop with a tap / Space ----------------
    playerCanAct() { return this.mode === 'playing' && this.world && this.world.phase !== 'over' && this.deadT < 0 && !this.bot; },
    aim(col) { if (this.playerCanAct()) this.world.aim(col); },
    drop(col) {
      EG.Audio.unlock();
      if (!this.playerCanAct()) return;
      this.world.drop(col);
    },
    colFromEvent(e) { const [lx] = this.renderer.toLogical(e.clientX, e.clientY); return this.renderer.colAt(lx); },
    bindInput() {
      window.addEventListener('keydown', e => {
        if (e.code === 'F11') { e.preventDefault(); this.setFullscreen(!this.fullscreen); EG.UI.syncSettings(); return; }
        if (e.code === 'KeyM' && !e.repeat) { this.toggleMute(); return; }
        const ui = EG.UI.current;
        if (e.code === 'Escape' || e.code === 'KeyP') {
          if (this.mode === 'playing') { this.pause(); e.preventDefault(); return; }
          if (this.mode === 'paused' && ui === 'scrPause') { this.resume(); e.preventDefault(); return; }
          if (ui === 'scrHow' || ui === 'scrSettings' || ui === 'scrCustom') { EG.UI.back(); e.preventDefault(); return; }
          return;
        }
        if (this.mode === 'playing') {
          const w = this.world;
          if (LEFT_KEYS.includes(e.code) || RIGHT_KEYS.includes(e.code)) {
            e.preventDefault();
            const d = LEFT_KEYS.includes(e.code) ? -1 : 1;
            const base = w._wantCol >= 0 && w._dropping ? w._wantCol : w.ember.targetCol;
            this.aim(base + d);
            return;
          }
          if (DROP_KEYS.includes(e.code)) { e.preventDefault(); if (!e.repeat) this.drop(); return; }
          const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
          if (m && +m[1] <= w.cols) { e.preventDefault(); if (!e.repeat) this.drop(+m[1] - 1); return; }
        }
        if (this.mode === 'over' && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); if (!e.repeat && this.canRestart()) this.startGame(); return; }
        if (this.mode === 'title' && ui === 'scrTitle' && e.code === 'Space') {
          const f = document.activeElement;
          if (f && f.tagName === 'BUTTON' && f.id !== 'btnPlay') return;
          e.preventDefault(); this.startGame();
        }
      });
      const stage = document.getElementById('stage');
      const onUi = e => e.target.closest && e.target.closest('button, .screen, #hud, input, label');
      stage.addEventListener('pointerdown', e => {
        if (onUi(e)) return;   // HUD/menu taps never play
        if (this.mode !== 'playing' || e.button === 2) return;
        e.preventDefault();
        this._dragging = e.pointerId;
        try { stage.setPointerCapture(e.pointerId); } catch (err) {}
        this.aim(this.colFromEvent(e));
      });
      stage.addEventListener('pointermove', e => {
        if (this.mode !== 'playing') return;
        if (e.pointerType === 'mouse' ? !onUi(e) : this._dragging === e.pointerId) this.aim(this.colFromEvent(e));
      });
      stage.addEventListener('pointerup', e => {
        if (this._dragging !== e.pointerId) return;
        this._dragging = false;
        if (this.mode !== 'playing') return;
        e.preventDefault();
        this.drop(this.colFromEvent(e));
      });
      ['pointercancel', 'lostpointercapture'].forEach(t => stage.addEventListener(t, e => { if (this._dragging === e.pointerId) this._dragging = false; }));
      window.addEventListener('blur', () => { this._dragging = false; if (this.mode === 'playing') this.pause(); });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) { if (this.mode === 'playing') this.pause(); EG.Audio.suspend(); }
        else EG.Audio.resume();
      });
      const unlock = () => EG.Audio.unlock();
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
      document.addEventListener('fullscreenchange', () => { this.fullscreen = !!document.fullscreenElement || (this.fullscreen && typeof window.ffFullscreen === 'function'); this.renderer.resize(); EG.UI.syncSettings(); });
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
      const sound = this.mode !== 'title', A = EG.Audio;
      for (const e of evts) {
        switch (e.type) {
          case 'aim': if (sound) A.play('aim'); break;
          case 'drop': if (sound) A.play('drop'); break;
          case 'land': if (sound) A.play('land', { speed: e.speed }); break;
          case 'bounce': if (sound) A.play('bounce'); break;
          case 'merge': if (sound) A.play('merge', { tier: e.tier, combo: e.combo, cascade: e.cascade, super: e.super }); break;
          case 'combo': if (sound && e.combo >= 3) A.play('combo', { combo: e.combo }); break;
          case 'comboBreak': if (sound) A.play('comboBreak'); break;
          case 'helper': if (sound) A.play('helper'); break;
          case 'helperCarry': if (sound) A.play('helperCarry'); break;
          case 'pumpkinDrop': if (sound) A.play('pumpkinDrop'); break;
          case 'pumpkinWake': if (sound) A.play('pumpkinWake'); break;
          case 'rise': if (sound && !this._riseSnd) { A.play('rise'); this._riseSnd = true; setTimeout(() => { this._riseSnd = false; }, 120); } break;
          case 'refuse': { const n = performance.now(); if (sound && !(n - (this._refuseAt || 0) < 300)) { A.play('refuse'); this._refuseAt = n; } break; }   // mashing a full column: at most one 'nuh-uh' per 0.3 s
          case 'newTier': if (sound && e.tier >= 4) A.play('newTier'); break;
          case 'goal': if (sound) A.play('goal'); break;
          case 'danger': if (sound && e.level >= 0.75) A.play('danger'); break;
          case 'levelUp': this._setLevelVisuals(e.zone, false); if (sound) setTimeout(() => A.play('level'), 150); break;
          case 'gameOver': if (sound) A.play('over'); A.stopMusic(); this.deadT = 0; break;
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
      this.weather.update(h, w.layout);
      if (this.mode === 'playing') this.runT += h;
      if (this.deadT >= 0) this.deadT += h;
      if (this.mode === 'playing' && this.deadT > 1.6) this.gameOver();
      if (this.mode === 'title' && (w.phase === 'over' || (w.level || 0) >= 2) && (this.deadT < 0 || this.deadT > 1.5)) {
        this.world = this.makeWorld(null, true);
        this.bot = new EG.Bot(this.world, { skill: 0.85, seed: (Math.random() * 1e6) | 0 });
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

  EG.Game = Game;
  EG.debug = {
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
    drop(col) { Game.drop(col); },
    aim(col) { Game.aim(col); },
    setBot(on, skill) { Game.botMode = on; Game.bot = on ? new EG.Bot(Game.world, { skill: skill == null ? 1 : skill, seed: 11 }) : null; },
    setAutoRestart(on) { Game.autoRestart = on; },
    gotoLevel(i) { Game.world.gotoLevel(i); },   // emits levelUp → visuals, music, banner
    fillBoard(cols) { Game.world.setBoard(cols); }
  };

  window.addEventListener('DOMContentLoaded', () => Game.boot().catch(e => {
    console.error(e);
    document.body.insertAdjacentHTML('beforeend', '<pre style="color:#fff;padding:20px">Could not start the game: ' + (e && e.message) + '</pre>');
  }));
})(window.EG = window.EG || {});
