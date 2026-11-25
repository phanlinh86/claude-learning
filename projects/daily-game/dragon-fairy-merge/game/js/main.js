/* main.js — game controller: boot, loop, input (slide anywhere to move Mossy, let go to drop the egg; a tap moves
 * Mossy there and drops; keyboard ← → move, Space / ↓ / Enter drop), modes, settings, test hooks.
 * Modes: 'title' (bot demo) → 'playing' ⇄ 'paused' → 'over'. The run lives in MEG.World. */
(function (MEG) {
  'use strict';
  const params = new URLSearchParams(location.search);
  const num = (k, d) => { const v = parseFloat(params.get(k)); return isFinite(v) ? v : d; };
  const DIFFS = ['easy', 'normal', 'hard'];
  const isTouch = window.matchMedia ? window.matchMedia('(pointer:coarse)').matches : (('ontouchstart' in window) || navigator.maxTouchPoints > 0);
  const MOVE_KEYS = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 };
  const DROP_KEYS = { Space: 1, Enter: 1, ArrowDown: 1, KeyS: 1 };

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
    stats: { games: 0, scores: [], times: [], levels: [], drops: 0, merges: 0, maxKind: 0, hatches: 0, rescues: 0, errors: [] },
    keys: {}, drag: null,

    async boot() {
      await MEG.Storage.init();
      Object.assign(this.settings, MEG.Storage.getJSON('settings', {}));
      if (!DIFFS.includes(this.settings.difficulty)) this.settings.difficulty = 'easy';
      this.urlMute = params.get('mute') === '1';
      MEG.Audio.setOptions({ sfx: this.settings.sfx, music: this.settings.music, muted: this.settings.muted || this.urlMute });
      this.renderer = new MEG.Renderer(document.getElementById('game'));
      await MEG.Assets.loadAll();
      MEG.UI.init(this);
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
      return new MEG.World({ seed: s, difficulty: forTitle ? 'normal' : this.difficulty(), level: level || 0 });
    },
    readInsets() {
      const el = document.getElementById('safeProbe'); if (!el) return null;
      const cs = getComputedStyle(el);
      return { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
    },
    relayout() { this.renderer.resize(this.readInsets()); this.syncRotate(); },
    /* the nest is tall: portrait is the natural phone layout, landscape works too — no rotate prompt needed */
    syncRotate() { const el = document.getElementById('rotate'); if (el) el.classList.add('hidden'); this._rotOn = false; },
    makeWeather() { return new MEG.Weather({ width: this.renderer.VW, height: this.renderer.VH, seed: 5 }); },
    _setLevelVisuals(zone, instant) {
      this.weather.setLevel(zone, { instant });
      this.renderer.setLevel(zone, instant);
      MEG.Audio.setLevel(zone, this.world && this.world.loop);
    },

    toTitle() {
      MEG.Audio.stopMusic();
      this.mode = 'title';
      this.world = this.makeWorld(this.seed != null ? this.seed + 99 : null, true);
      this.bot = new MEG.Bot(this.world, { skill: 0.85, seed: 3 });
      this.weather = this.weather || this.makeWeather();
      this.renderer.attach(this.world, this.weather);
      this._setLevelVisuals(0, true);
      this.deadT = -1;
      MEG.UI.setHud(false);
      MEG.UI.show('scrTitle');
    },

    startGame() {
      MEG.Audio.unlock();
      { const t = document.getElementById('toast'); if (t) t.classList.add('hidden'); }
      this.runDifficulty = this.difficulty();
      const lv = params.has('level') ? Math.max(0, num('level', 0) | 0) : 0;
      this.world = this.makeWorld(null, false, lv);
      this.bot = this.botMode ? new MEG.Bot(this.world, { skill: num('skill', 1), seed: 11 }) : null;
      if (!this.weather) this.weather = this.makeWeather();
      const z = this.world.zone || 0;
      this.renderer.attach(this.world, this.weather);
      this._setLevelVisuals(z, this.renderer.vis.cur === z);
      this.renderer.showBanner(z);
      MEG.Audio.play('start');
      MEG.Audio.startMusic();
      this.mode = 'playing';
      this.deadT = -1; this.runT = 0; this.clearInput();
      MEG.UI.hideAll(); MEG.UI.setHud(true);
      this.syncRotate();
      this.canvasFocus();
    },

    pause() {
      if (this.mode !== 'playing') return;
      if (this.world && (this.world.phase === 'over' || this.deadT >= 0)) return;
      this.clearInput();
      this.mode = 'paused';
      MEG.UI.setHud(false);
      MEG.UI.show('scrPause');
    },
    resume() {
      if (this.mode !== 'paused') return;
      this.mode = 'playing';
      MEG.UI.hideAll(); MEG.UI.setHud(true);
      this.last = performance.now();
      this.canvasFocus();
    },
    canvasFocus() { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); },
    canRestart() { return performance.now() - this.overAt > 700; },

    gameOver() {
      const w = this.world, key = 'best_' + (this.runDifficulty || this.difficulty());
      const prev = parseInt(MEG.Storage.get(key, '0'), 10) || 0, newBest = w.score > prev && !this.botMode;
      if (newBest && !this.botMode) MEG.Storage.set(key, String(w.score));   // bot / test runs never overwrite a child's best
      this.mode = 'over'; this.overAt = performance.now();
      this.clearInput();
      MEG.Audio.stopMusic();
      MEG.UI.setHud(false);
      const s = w.stats || {}, names = MEG.Renderer.ZONE_INFO.map(z => z.name);
      MEG.UI.showGameOver({
        score: w.score, best: this.botMode ? prev : Math.max(prev, w.score), newBest: newBest && w.score > 0, cleared: w.level || 0,
        maxKind: s.maxKind || w.maxKind || 1, merges: s.merges || w.merges || 0, combo: s.maxCombo || w.bestCombo || 0,
        hatches: s.hatches || 0, drops: s.drops || w.drops || 0, rescues: s.rescues || 0,
        reached: names[(w.zone || 0) % 4] + ((w.loop || 0) > 0 ? ' (round ' + (w.loop + 1) + ')' : '')
      });
      if (newBest && w.score > 0) MEG.Audio.play('best');
      const st = this.stats;
      st.games++; st.scores.push(w.score); st.times.push(+(this.runT || 0).toFixed(2)); st.levels.push(w.level || 0);
      st.drops += s.drops || 0; st.merges += s.merges || 0; st.maxKind = Math.max(st.maxKind, s.maxKind || w.maxKind || 0); st.hatches += s.hatches || 0; st.rescues += s.rescues || 0;
      if (this.autoRestart) setTimeout(() => this.startGame(), 50);
    },

    best(d) { return parseInt(MEG.Storage.get('best_' + (d || this.difficulty()), '0'), 10) || 0; },
    resetBest() { DIFFS.forEach(d => MEG.Storage.del('best_' + d)); },
    setSetting(k, v) {
      this.settings[k] = v;
      MEG.Storage.setJSON('settings', this.settings);
      MEG.Audio.setOptions({ sfx: this.settings.sfx, music: this.settings.music, muted: this.settings.muted || this.urlMute });
      if (k === 'music' && v && (this.mode === 'playing' || this.mode === 'paused')) MEG.Audio.startMusic();
    },
    toggleMute() {
      if (this.urlMute && !this.settings.muted) {
        this.urlMute = false;
        MEG.Audio.setOptions({ sfx: this.settings.sfx, music: this.settings.music, muted: false });
      } else {
        const on = !this.settings.muted;
        if (!on) this.urlMute = false;
        this.setSetting('muted', on);
      }
      MEG.UI.syncMute(); MEG.UI.toast(this.settings.muted || this.urlMute ? 'Sound off' : 'Sound on', 900);
    },
    setFullscreen(on) {
      this.fullscreen = on;
      if (typeof window.ffFullscreen === 'function') window.ffFullscreen(on);
      else if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
      else if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
      setTimeout(() => this.renderer.resize(), 150);
    },
    picturesChanged() { MEG.Assets._ver = (MEG.Assets._ver || 0) + 1; if (this.renderer) this.renderer._spr.clear(); },
    quit() { if (typeof window.ffQuit === 'function') window.ffQuit(); else window.close(); },

    // ---------------- input: slide to move Mossy, let go to drop; keys move + drop ----------------
    playerCanAct() { return this.mode === 'playing' && this.world && this.world.phase !== 'over' && this.deadT < 0 && !this.bot; },
    clearInput() { this.keys = {}; this.drag = null; this.pendingDrop = null; if (this.world && this.world.nudge) this.world.nudge(0); },
    dropNow() { const w = this.world; if (!this.playerCanAct()) return false; return !!w.drop(); },   // false = cooldown or 'blocked': not an error
    bindInput() {
      window.addEventListener('keydown', e => {
        if (e.code === 'F11') { e.preventDefault(); this.setFullscreen(!this.fullscreen); MEG.UI.syncSettings(); return; }
        if (e.code === 'KeyM' && !e.repeat) { this.toggleMute(); return; }
        const ui = MEG.UI.current;
        if (e.code === 'Escape' || e.code === 'KeyP') {
          if (this.mode === 'playing') { this.pause(); e.preventDefault(); return; }
          if (this.mode === 'paused' && ui === 'scrPause') { this.resume(); e.preventDefault(); return; }
          if (ui === 'scrHow' || ui === 'scrSettings' || ui === 'scrCustom') { MEG.UI.back(); e.preventDefault(); return; }
          return;
        }
        if (this.mode === 'playing' && MOVE_KEYS[e.code]) { e.preventDefault(); this.keys[e.code] = true; this.syncNudge(); return; }
        if (this.mode === 'playing' && DROP_KEYS[e.code]) { e.preventDefault(); if (!e.repeat) this.dropNow(); return; }
        if (this.mode === 'over' && (e.code === 'Enter' || e.code === 'Space')) { const f = document.activeElement; if (f && f.tagName === 'BUTTON' && f.id !== 'btnAgain') return; e.preventDefault(); if (!e.repeat && this.canRestart()) this.startGame(); return; }
        if (this.mode === 'title' && ui === 'scrTitle' && (e.code === 'Space' || e.code === 'Enter')) {
          const f = document.activeElement;
          if (f && f.tagName === 'BUTTON' && f.id !== 'btnPlay') return;
          e.preventDefault(); this.startGame();
        }
      });
      window.addEventListener('keyup', e => { delete this.keys[e.code]; if (MOVE_KEYS[e.code]) this.syncNudge(); });
      const stage = document.getElementById('stage');
      const onUi = e => e.target.closest && e.target.closest('button, .screen, #hud, #rotate, input, label');
      const logical = e => this.renderer.toLogical(e.clientX, e.clientY);
      // mouse without a button pressed: Mossy follows the pointer (desktop); a click drops
      stage.addEventListener('pointerdown', e => {
        MEG.Audio.unlock();
        if (onUi(e)) return;
        if (!this.playerCanAct() || e.button === 2) return;
        e.preventDefault();
        if (this.drag) return;
        this.pendingDrop = null;
        try { stage.setPointerCapture(e.pointerId); } catch (_) {}
        const [x] = logical(e);
        this.drag = { id: e.pointerId };
        this.world.moveTo(this.renderer.worldX(x));
      });
      stage.addEventListener('pointermove', e => {
        if (!this.playerCanAct()) return;
        const d = this.drag;
        if (d && d.id !== e.pointerId) return;
        if (!d && (e.pointerType !== 'mouse' || onUi(e))) return;   // touch/pen move only while pressed
        const [x] = logical(e);
        this.world.moveTo(this.renderer.worldX(x));
      });
      const up = e => {
        const d = this.drag; if (!d || d.id !== e.pointerId) return;
        this.drag = null;
        if (!this.playerCanAct()) return;
        // a tap far from Mossy: he flies there first, the egg drops when he has arrived (it lands where the finger was)
        if (e.type === 'pointerup') { const [x] = logical(e); this.world.moveTo(this.renderer.worldX(x)); this.pendingDrop = this.world.canDrop ? { t: 0 } : null; }   // a tap during the cooldown is ignored, as before
      };
      stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
      window.addEventListener('blur', () => { this.clearInput(); if (this.mode === 'playing') this.pause(); });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) { this.clearInput(); if (this.mode === 'playing') this.pause(); MEG.Audio.suspend(); }
        else MEG.Audio.resume();
      });
      const unlock = () => MEG.Audio.unlock();
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
      document.addEventListener('fullscreenchange', () => { this.fullscreen = !!document.fullscreenElement || (this.fullscreen && typeof window.ffFullscreen === 'function'); this.renderer.resize(); MEG.UI.syncSettings(); });
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

    syncNudge() {
      const K = this.keys; let d = 0;
      for (const c in K) if (K[c] && MOVE_KEYS[c]) d += MOVE_KEYS[c];
      if (this.world && this.world.nudge) this.world.nudge(Math.sign(d));
    },
    handleEvents(evts) {
      const sound = this.mode !== 'title', A = MEG.Audio;
      for (const e of evts) {
        switch (e.type) {
          case 'drop': if (sound) A.play('drop', { kind: e.kind }); break;
          case 'blocked': if (sound) A.play('blocked'); break;
          case 'land': if (sound) A.play('land', { speed: e.speed, kind: e.kind }); break;
          case 'bump': if (sound) A.play('bump', { speed: e.speed }); break;
          case 'merge': if (sound) A.play('merge', { kind: e.kind, combo: e.combo }); break;
          case 'combo': if (sound) A.play('combo', { n: e.n }); break;
          case 'hatch': if (sound) A.play('hatch'); break;
          case 'newKind': if (sound && e.kind >= 3) setTimeout(() => A.play('newKind', { kind: e.kind }), 160); break;
          case 'windWarn': if (sound) A.play('windWarn', { dir: e.dir }); break;
          case 'gust': if (sound) A.play('gust', { strength: e.strength }); break;
          case 'warnOn': if (sound) A.play('warn'); break;
          case 'rescue': if (sound) A.play('rescue'); break;
          case 'levelUp': this._setLevelVisuals(e.zone, false); if (sound) setTimeout(() => A.play('level'), 200); break;
          case 'gameOver': if (sound) A.play('over'); A.stopMusic(); this.deadT = 0; this.clearInput(); break;
        }
      }
      this.renderer.onEvents(evts);
    },

    step(h) {
      const w = this.world;
      if (this.bot && (this.mode === 'playing' || this.mode === 'title')) this.bot.step(h);
      const pd = this.pendingDrop;
      if (pd) {
        pd.t += h;
        const m = w.mossy;
        if (!this.playerCanAct() || pd.t > 2) this.pendingDrop = null;
        else if (w.canDrop && Math.abs(m.x - m.tx) < 0.08 && Math.abs(m.vx || 0) < 0.6) { this.pendingDrop = null; this.dropNow(); }
      }
      w.update(h);
      const ev = w.drainEvents();
      if (ev.length) this.handleEvents(ev);
      this.weather.update(h);
      if (this.mode === 'playing') this.runT += h;
      if (this.deadT >= 0) this.deadT += h;
      if (this.mode === 'playing' && this.deadT > 1.6) this.gameOver();
      if (this.mode === 'title' && (w.phase === 'over' || (w.level || 0) >= 1 || w.time > 90) && (this.deadT < 0 || this.deadT > 1.5)) {
        this.world = this.makeWorld(null, true);
        this.bot = new MEG.Bot(this.world, { skill: 0.85, seed: (Math.random() * 1e6) | 0 });
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

  MEG.Game = Game;
  MEG.debug = {
    get world() { return Game.world; },
    get weather() { return Game.weather; },
    get mode() { return Game.mode; },
    get stats() { return Game.stats; },
    getState() {
      const w = Game.world; if (!w) return null;
      const st = w.getState();
      st.mode = Game.mode; st.particles = Game.weather ? Game.weather.particles.length : 0; st.fx = Game.renderer.texts.length + Game.renderer.rings.length + Game.renderer.hatches.length + Game.renderer.fairies.length;
      return st;
    },
    setSpeed(n) { Game.speed = n; },
    startGame() { Game.startGame(); },
    moveTo(x) { if (Game.playerCanAct()) Game.world.moveTo(x); },
    drop() { if (Game.playerCanAct()) return Game.world.drop(); },
    get pendingDrop() { return Game.pendingDrop; },
    spawnEgg(kind, x, y) { if (Game.world) return Game.world.spawnEgg(kind, x, y); },
    setWind(dir, strength) { if (Game.world) Game.world.setWind(dir, strength); },
    setBot(on, skill) { Game.botMode = on; Game.bot = on ? new MEG.Bot(Game.world, { skill: skill == null ? 1 : skill, seed: 11 }) : null; },
    setAutoRestart(on) { Game.autoRestart = on; },
    gotoLevel(i) { Game.world.gotoLevel(i); }   // emits levelUp → visuals, music, banner
  };

  window.addEventListener('DOMContentLoaded', () => Game.boot().catch(e => {
    console.error(e);
    document.body.insertAdjacentHTML('beforeend', '<pre style="color:#fff;padding:20px">Could not start the game: ' + (e && e.message) + '</pre>');
  }));
})(window.MEG = window.MEG || {});
