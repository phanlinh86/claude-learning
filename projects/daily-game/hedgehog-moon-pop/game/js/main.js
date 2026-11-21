/* main.js — game controller: boot, loop, input (keys / horizontal pointer-follow / touch / jump button / second
 * finger / quick tap), modes, settings, test hooks (DESIGN §5.4). Modes: 'title' (bot demo) → 'playing' ⇄ 'paused' → 'over'.
 * World states live in MP.World. */
(function (MP) {
  'use strict';
  const params = new URLSearchParams(location.search);
  const num = (k, d) => { const v = parseFloat(params.get(k)); return isFinite(v) ? v : d; };
  const ZONES = ['Dawn — Earthrise', 'Noon — Bright Moon', 'Sunset — Ringed Planet', 'Night — Starry Bakery'];
  const LENGTH = { short: 0.7, normal: 1, long: 1.4 };   // level length setting: scales the cupcake box target
  const DIFFS = ['easy', 'normal', 'hard'];
  const newRun = () => ({ cupcakes: 0, pops: 0, skyPops: 0, airPops: 0, bonks: 0, jumps: 0, magnets: 0, bestChain: 0, cleared: 0, bestCombo: 0, combo: 0 });
  // phone / tablet (coarse pointer); a Windows touch laptop with a mouse keeps the desktop layout
  const isTouch = window.matchMedia ? window.matchMedia('(pointer:coarse)').matches : (('ontouchstart' in window) || navigator.maxTouchPoints > 0);

  function difficultyOverrides(d) { return Object.assign({}, (MP.DIFFICULTY && MP.DIFFICULTY[d]) || {}); }

  const Game = {
    mode: 'boot', isTouch,
    isApp: params.get('app') === '1' || typeof window.ffStoreSet === 'function',
    speed: Math.max(0.1, Math.min(64, num('speed', 1))),
    botMode: params.get('bot') === '1',
    autoRestart: params.get('autorestart') === '1',
    seed: params.has('seed') ? num('seed', 1) : null,
    // test-URL runs (bot / speed / level / seed) never save best scores (?savebest=1 opts back in for the e2e tests)
    testRun: (params.get('bot') === '1' || params.has('speed') || params.has('level') || params.has('seed')) && params.get('savebest') !== '1',
    world: null, weather: null, bot: null, renderer: null,
    settings: { sfx: true, music: true, muted: false, difficulty: 'normal', length: 'normal' },
    fullscreen: false, overAt: 0, deadAt: -1,
    keys: {}, pointerDown: false, run: newRun(),
    stats: { games: 0, scores: [], times: [], levels: [], cupcakes: 0, pops: 0, skyPops: 0, bonks: 0, jumps: 0, magnets: 0, errors: [] },

    async boot() {
      await MP.Storage.init();
      Object.assign(this.settings, MP.Storage.getJSON('settings', {}));
      this.urlMute = params.get('mute') === '1';
      this.urlDiff = DIFFS.includes(params.get('diff')) ? params.get('diff') : null;   // ?diff= overrides the setting for this session
      if (!LENGTH[this.settings.length]) this.settings.length = 'normal';
      MP.Audio.setOptions({ sfx: this.settings.sfx, music: this.settings.music, muted: this.settings.muted || this.urlMute });
      this.renderer = new MP.Renderer(document.getElementById('game'));
      await MP.Assets.loadAll();
      MP.UI.init(this);
      this.bindInput();
      this.relayout();
      // rotation / resize / Safari toolbar changes: re-layout (debounced); the world keeps running and Bristle is
      // clamped into the new play range. A finger that was steering is released so Bristle doesn't lurch.
      const onResize = () => { clearTimeout(this._rsz); this._rsz = setTimeout(() => this.relayout(), 120); };
      window.addEventListener('resize', onResize);
      window.addEventListener('orientationchange', () => { this.releasePointer(); onResize(); });
      if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
      if (params.get('autostart') === '1') this.startGame(); else this.toTitle();
      this.last = performance.now();
      requestAnimationFrame(t => this.frame(t));
    },

    difficulty() { return this.urlDiff || this.settings.difficulty; },
    makeWorld(seed, forTitle) {
      const s = seed != null ? seed : (this.seed != null ? this.seed : (Math.random() * 1e9) | 0);
      const w = new MP.World({ seed: s, config: forTitle ? {} : difficultyOverrides(this.difficulty()) });
      w._demo = !!forTitle;
      this.applyPlayRange(w);
      w.reset();
      if (!forTitle) this.applyLength(w);
      return w;
    },
    /* Level length (Short / Normal / Long) scales the cupcake box target of each level. */
    applyLength(w) {
      const k = LENGTH[this.settings.length] || 1;
      if (!w || w._lenLevel === w.level) return;   // once per level
      w._lenLevel = w.level;
      if (k !== 1 && w.boxTarget > 0) w.boxTarget = Math.max(6, Math.round(w.boxTarget * k));
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
    applyPlayRange(w) {
      const L = this.renderer && this.renderer.layout; if (!(L && w.setPlayRange)) return;
      let lo = L.playMin;
      // title demo on landscape screens: Bristle skates in the clear right part, not under the menu (visual QA #21)
      if (w._demo && this.renderer.VW >= this.renderer.VH && L.playMax - 580 >= 300) lo = Math.max(lo, 580);
      w.setPlayRange(lo, L.playMax);
    },
    releasePointer() { this.pointerDown = false; this._steerId = null; if (this._touches) this._touches.clear(); if (this.isTouch && this.renderer) this.renderer.pointer = null; },
    makeWeather() { return new MP.Weather({ width: 960, height: 540, seed: 5 }); },

    toTitle() {
      MP.Audio.stopMusic();
      this.mode = 'title';
      this.world = this.makeWorld(this.seed != null ? this.seed + 99 : null, true);
      this.bot = new MP.Bot(this.world, { skill: 0.8, seed: 3 });
      this.weather = this.weather || this.makeWeather();
      this.weather.setSeason(0, { instant: true });
      this.renderer.attach(this.world, this.weather);
      this.renderer.setSeason(0, true);
      MP.Audio.setSeason(0);
      this.deadAt = -1;
      MP.UI.setHud(false); this.showAction(false);
      MP.UI.show('scrTitle');
    },

    /* the Score Card modal (added by extras.js) is open */
    scoreCardOpen() { const m = document.getElementById('scScreen'); return !!(m && !m.classList.contains('hidden')); },
    startGame() {
      MP.Audio.unlock();
      { const m = document.getElementById('scScreen'); if (m) m.classList.add('hidden'); }   // never leave the Score Card over a new run
      { const t = document.getElementById('toast'); if (t) t.classList.add('hidden'); }
      this.runDifficulty = this.difficulty();   // best score belongs to the difficulty the run started on
      this.world = this.makeWorld();
      const lv = params.has('level') ? Math.max(0, num('level', 0) | 0) : 0;
      if (lv > 0 && this.world.startLevel) { this.world.startLevel(lv); this.applyLength(this.world); }
      this.bot = this.botMode ? new MP.Bot(this.world, { skill: num('skill', 1), seed: 11 }) : null;
      if (!this.weather) this.weather = this.makeWeather();
      const b = this.world.zone || 0;
      this.weather.setSeason(b, { instant: this.renderer.vis.cur === b });
      this.renderer.attach(this.world, this.weather);
      this.renderer.setSeason(b, this.renderer.vis.cur === b);
      this.renderer.showBanner(b);
      MP.Audio.setSeason(b); MP.Audio.play('start');
      if (this.settings.music) MP.Audio.startMusic();
      this.mode = 'playing';
      this.deadAt = -1; this.run = newRun();
      this.keys = {}; this.pointerDown = false; this.renderer.pointer = null;
      MP.UI.hideAll(); MP.UI.setHud(true); this.showAction(true);
      this.canvasFocus();
    },
    showAction(on) { const b = document.getElementById('btnAction'); if (b) b.classList.toggle('hidden', !(on && isTouch)); },

    pause() {
      if (this.mode !== 'playing') return;
      if (this.world && this.world.state === 'dead') return;
      this.mode = 'paused'; this.keys = {}; this.pointerDown = false;
      MP.UI.setHud(false); this.showAction(false);
      MP.UI.show('scrPause');
    },
    resume() {
      if (this.mode !== 'paused') return;
      this.mode = 'playing';
      MP.UI.hideAll(); MP.UI.setHud(true); this.showAction(true);
      this.last = performance.now();
      this.canvasFocus();
    },
    canvasFocus() { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); },
    canRestart() { return performance.now() - this.overAt > 700 && !this.scoreCardOpen(); },   // no restart behind the Score Card

    gameOver() {
      const w = this.world, key = 'best_' + (this.runDifficulty || this.difficulty());
      const prev = parseInt(MP.Storage.get(key, '0'), 10) || 0, newBest = w.score > prev;
      if (newBest && !this.testRun) MP.Storage.set(key, String(w.score));
      this.mode = 'over'; this.overAt = performance.now();
      MP.Audio.stopMusic();
      MP.UI.setHud(false); this.showAction(false);
      MP.UI.showGameOver({
        score: w.score, best: Math.max(prev, w.score), newBest: newBest && w.score > 0,
        cupcakes: this.run.cupcakes, skyPops: this.run.skyPops, bonks: this.run.bonks, magnets: this.run.magnets,
        bestChain: Math.max(this.run.bestChain, w.bestChain || 0),
        bestCombo: Math.max(this.run.bestCombo, w.bestCombo || 0), cleared: Math.max(this.run.cleared, w.level || 0),
        zoneName: ZONES[w.zone || 0] + ((w.lap || 0) > 0 ? ' (lap ' + (w.lap + 1) + ')' : '')
      });
      if (newBest && w.score > 0) MP.Audio.play('best');
      const st = this.stats;
      st.games++; st.scores.push(w.score); st.times.push(+w.time.toFixed(2)); st.levels.push(w.level || 0);
      ['cupcakes', 'pops', 'skyPops', 'bonks', 'jumps', 'magnets'].forEach(k => { st[k] += this.run[k]; });
      if (this.autoRestart) setTimeout(() => this.startGame(), 50);
    },

    best() { return parseInt(MP.Storage.get('best_' + this.difficulty(), '0'), 10) || 0; },
    resetBest() { ['easy', 'normal', 'hard'].forEach(d => MP.Storage.del('best_' + d)); },
    setSetting(k, v) {
      this.settings[k] = v;
      MP.Storage.setJSON('settings', this.settings);
      MP.Audio.setOptions({ sfx: this.settings.sfx, music: this.settings.music, muted: this.settings.muted || this.urlMute });
      if (k === 'music') { if (v && this.mode !== 'title') MP.Audio.startMusic(); if (!v) MP.Audio.stopMusic(); }
    },
    /* the volume slider at 0 % counts as muted (HUD icon + M), so a child who slid it to 0 sees why it is silent */
    volumeZero() { return !!(window.DailyExtras && DailyExtras.volume && DailyExtras.volume() === 0); },
    isMuted() { return !!(this.settings.muted || this.urlMute || this.volumeZero()); },
    toggleMute() {
      if (this.urlMute) { this.urlMute = false; MP.Audio.setOptions({ muted: this.settings.muted }); }   // ?mute=1: a session-only switch, never saved
      else if (this.settings.muted) this.setSetting('muted', false);
      else if (!this.volumeZero()) this.setSetting('muted', true);
      if (!this.settings.muted && !this.urlMute && this.volumeZero()) DailyExtras.setVolume(0.5);   // unmuting a 0 % volume restores 50 %
      MP.UI.syncMute(); MP.UI.toast(this.isMuted() ? 'Sound off' : 'Sound on', 900);
    },
    setFullscreen(on) {
      this.fullscreen = on;
      if (typeof window.ffFullscreen === 'function') window.ffFullscreen(on);
      else if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
      else if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
      setTimeout(() => this.renderer.resize(), 150);
    },
    picturesChanged() { MP.Assets._ver = (MP.Assets._ver || 0) + 1; },
    quit() { if (typeof window.ffQuit === 'function') window.ffQuit(); else window.close(); },

    // ---------------- input ----------------
    playerCanAct() { return this.mode === 'playing' && this.world && this.world.state !== 'dead' && !this.bot; },
    action() { MP.Audio.unlock(); if (this.playerCanAct()) this.world.action(); },
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
      const JUMP = ['Space', 'ArrowUp', 'KeyW', 'Enter', 'NumpadEnter', 'ShiftLeft', 'ShiftRight'];   // Moon jump
      window.addEventListener('keydown', e => {
        if (e.code === 'F11') { e.preventDefault(); this.setFullscreen(!this.fullscreen); MP.UI.syncSettings(); return; }
        if (e.code === 'KeyM' && !e.repeat) { this.toggleMute(); return; }
        const ui = MP.UI.current;
        if (e.code === 'Escape' || e.code === 'KeyP') {
          if (this.mode === 'playing') { this.pause(); e.preventDefault(); return; }
          if (this.mode === 'paused' && ui === 'scrPause') { this.resume(); e.preventDefault(); return; }
          if (ui === 'scrHow' || ui === 'scrSettings' || ui === 'scrCustom') { MP.UI.back(); e.preventDefault(); return; }
          return;
        }
        if (this.mode === 'playing') {
          if (MOVE.includes(e.code)) { e.preventDefault(); this.keys[e.code] = true; MP.Audio.unlock(); return; }
          if (JUMP.includes(e.code)) { e.preventDefault(); if (!e.repeat) this.action(); return; }
        }
        if (this.mode === 'over' && (e.code === 'Enter' || e.code === 'Space')) {
          const f = document.activeElement;
          if (f && f.tagName === 'BUTTON' && f.id !== 'btnAgain') return;   // a focused Menu / Score Card button handles its own key
          e.preventDefault(); if (this.canRestart()) this.startGame(); return;
        }
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
        if (e.target.closest && e.target.closest('button, .screen, #hud, input, label')) return;   // HUD/menu clicks never move Bristle
        if (this.mode !== 'playing') return;
        e.preventDefault(); MP.Audio.unlock();
        if (e.button === 2) { this.action(); return; }
        if (e.pointerType === 'touch' && this._touches && this._touches.size >= 1) { this.action(); return; }   // second finger = action
        (this._touches = this._touches || new Set()).add(e.pointerId);
        this._steerId = e.pointerId;   // only this finger / button steers Bristle
        this.pointerDown = true; setPtr(e);
        this._tapStart = { id: e.pointerId, t: performance.now(), x: e.clientX, y: e.clientY, moved: false };
        try { if (e.pointerType === 'touch') stage.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      });
      stage.addEventListener('pointermove', e => {
        if (this.mode !== 'playing') return;
        if (e.pointerType === 'mouse' && e.target.closest && e.target.closest('button, .screen, #hud')) { this._mouseFollow = false; return; }   // hovering the HUD never pulls Bristle
        if (this.pointerDown && e.pointerId !== this._steerId) return;   // a second finger (jump tap) never steers
        if (e.pointerType === 'mouse') { const p0 = this._lastMouse; this._lastMouse = [e.clientX, e.clientY]; if (p0 && Math.abs(p0[0] - e.clientX) + Math.abs(p0[1] - e.clientY) > 2) this._mouseFollow = true; }
        if (this.pointerDown || e.pointerType === 'mouse') setPtr(e);
        const ts = this._tapStart;
        if (ts && ts.id === e.pointerId && Math.abs(e.clientX - ts.x) + Math.abs(e.clientY - ts.y) > 12) ts.moved = true;
      });
      const up = e => {
        if (this._touches) this._touches.delete(e.pointerId);
        // a quick tap (< 0.2 s, < 12 px) on the play area also jumps (touch and mouse)
        const ts = this._tapStart;
        if (ts && ts.id === e.pointerId) {
          this._tapStart = null;
          if (e.type === 'pointerup' && !ts.moved && performance.now() - ts.t < 200 && this.mode === 'playing') this.action();
        }
        // the steering finger lifted: Bristle stops following, even if a second (jump) finger is still down
        if (e.pointerId === this._steerId || !this._touches || !this._touches.size) {
          this._steerId = null; this.pointerDown = false; if (e.pointerType !== 'mouse') this.renderer.pointer = null;
        }
      };
      window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
      const act = document.getElementById('btnAction');
      if (act) act.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.action(); });
      window.addEventListener('blur', () => { this.keys = {}; this.pointerDown = false; if (this.mode === 'playing') this.pause(); });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) { if (this.mode === 'playing') this.pause(); this.releasePointer(); MP.Audio.suspend(); }
        else MP.Audio.resume();
      });
      // iOS: audio may only start inside a gesture — unlock on the first touchend / click / key
      const unlock = () => MP.Audio.unlock();
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
      document.addEventListener('fullscreenchange', () => { this.fullscreen = !!document.fullscreenElement || (this.fullscreen && typeof window.ffFullscreen === 'function'); this.renderer.resize(); MP.UI.syncSettings(); });
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
      const sound = this.mode !== 'title', w = this.world, run = this.run, wx = this.weather;
      for (const e of evts) {
        switch (e.type) {
          case 'start': break;
          case 'puff': if (sound) MP.Audio.play('puff', { kind: e.kind }); if (wx && wx.burst) wx.burst('dust', e.x, 486, 3); break;
          case 'emerge': if (sound) MP.Audio.play('emerge', { kind: e.kind }); break;
          case 'pop':
            if (sound) MP.Audio.play('pop', { tier: e.tier, chain: e.chain, combo: e.combo, kind: e.kind });
            if (wx && wx.burst) { wx.burst('pop', e.x, e.y, 10, e.vx != null ? { vx: e.vx, vy: e.vy } : undefined); if (e.kind === 'cupcake') wx.burst('crumb', e.x, e.y, 5); if (e.tier >= 3) wx.burst('sparkle', e.x, e.y, 6); }
            run.pops++; if (e.kind === 'cupcake') run.cupcakes++;
            if (e.tier >= 3) run.skyPops++;
            if (e.air) run.airPops++;
            run.bestChain = Math.max(run.bestChain, e.chain || 0);
            run.combo = e.combo || 0; run.bestCombo = Math.max(run.bestCombo, run.combo);
            break;
          case 'chain': if (sound) MP.Audio.play('chain', { n: e.n }); break;
          case 'multup': if (sound) MP.Audio.play('multup', { mult: e.mult }); break;
          case 'escape': e.lost = run.combo; run.combo = 0; if (sound) MP.Audio.play('escape'); break;
          case 'magnet': run.magnets++; if (sound) MP.Audio.play('magnet'); break;
          case 'magnetend': if (sound) MP.Audio.play('magnetend'); break;
          case 'pebblewarn': if (sound) MP.Audio.play('pebblewarn'); break;
          case 'bonk':
            if (sound) MP.Audio.play('bonk'); run.bonks++; run.combo = 0;
            if (wx && wx.burst) wx.burst('star', e.x, e.y - 30, 6);
            break;
          case 'pebbleland': if (sound) MP.Audio.play('pebbleland'); if (wx && wx.burst) wx.burst('dust', e.x, 488, 6); break;
          case 'jump': if (sound) MP.Audio.play('jump'); run.jumps++; if (wx && wx.burst) wx.burst('dust', e.x, 490, 5); break;
          case 'land': if (sound) MP.Audio.play('land', { vy: e.vy }); if (wx && wx.burst) wx.burst('dust', e.x, 490, 6); break;
          case 'boxfull': if (sound) MP.Audio.play('boxfull'); break;
          case 'heal': if (sound) MP.Audio.play('heal'); break;
          case 'cleared':
            if (sound) MP.Audio.play('cleared'); run.cleared++;
            if (wx && wx.burst) wx.burst('confetti', 480, 200, 40);
            break;
          case 'zone': case 'season': {
            const b = e.zone != null ? e.zone : e.season;
            this.weather.setSeason(b); MP.Audio.setSeason(b);
            if (this.mode !== 'title' && (e.level || 0) > 0) this.applyLength(w);
            if (sound && (e.level || 0) > 0) MP.Audio.play('season');
            break;
          }
          case 'dead': if (sound) { MP.Audio.play('dead'); MP.Audio.stopMusic(); } this.deadAt = w.time; break;
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
      const wx = this.weather;
      wx.update(h, { hog: w.hog, world: w });
      // (the weather emits the wheel dust itself while Bristle skates fast)
      if (this.mode === 'playing' && w.state === 'dead' && this.deadAt >= 0 && w.time - this.deadAt > 1.4) this.gameOver();
      if (this.mode === 'title' && (w.state === 'dead' || (w.level || 0) >= 2) && (this.deadAt >= 0 ? w.time - this.deadAt > 1.5 : true)) {
        this.world = this.makeWorld(null, true);
        this.bot = new MP.Bot(this.world, { skill: 0.8, seed: (Math.random() * 1e6) | 0 });
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

  MP.Game = Game;
  MP.debug = {
    get world() { return Game.world; },
    get weather() { return Game.weather; },
    get mode() { return Game.mode; },
    get stats() { return Game.stats; },
    getState() {
      const w = Game.world;
      const s = w && w.hog;
      return w && { mode: Game.mode, state: w.state, score: w.score, level: w.level, zone: w.zone, lap: w.lap, hearts: w.hearts, heartsMax: w.heartsMax,
        combo: w.combo, mult: w.mult, bestCombo: w.bestCombo, chain: w.chain, bestChain: w.bestChain, box: w.box, boxTarget: w.boxTarget,
        time: w.time, items: w.items.length, popsTotal: w.popsTotal, airPops: w.airPops, skyPops: w.skyPops, bonks: w.bonks,
        escaped: w.escaped, magnets: w.magnets, difficulty: Game.runDifficulty || Game.difficulty(), testRun: Game.testRun,
        magnet: w.magnet && { t: +(+w.magnet.t || 0).toFixed(2) },
        vents: w.vents ? w.vents.map(v => Math.round(v.x)) : [],
        hog: s && { x: Math.round(s.x), y: Math.round(s.y), lift: Math.round(s.lift || 0), air: !!s.air, frame: s.frame, vx: Math.round(s.vx || 0) },
        run: Object.assign({}, Game.run),
        particles: Game.weather ? Game.weather.particles.length : 0, fx: Game.renderer.fx.length };
    },
    setSpeed(n) { Game.speed = n; },
    startGame() { Game.startGame(); },
    setBot(on, skill) { Game.botMode = on; Game.bot = on ? new MP.Bot(Game.world, { skill: skill == null ? 1 : skill, seed: 11 }) : null; },
    setAutoRestart(on) { Game.autoRestart = on; },
    gotoLevel(i) { Game.world.startLevel(i); if (Game.mode !== 'title') Game.applyLength(Game.world); }
  };

  window.addEventListener('DOMContentLoaded', () => Game.boot().catch(e => {
    console.error(e);
    document.body.insertAdjacentHTML('beforeend', '<pre style="color:#fff;padding:20px">Could not start the game: ' + (e && e.message) + '</pre>');
  }));
})(window.MP = window.MP || {});
