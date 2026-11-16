/* FT.Audio (Moka's Fairy Tea Party) — every sound is synthesized with WebAudio (no files to license or download), DESIGN §7.
 * A thing floats down on its fluff: a soft filtered-noise whoosh; it lands: a little "plop" + a hollow wooden table thunk;
 * right: a twinkle glissando + the fairy's chime; the rise: a rising sine shimmer; the lantern opens: a soft bell "bloom"
 * chord; wrong: a gentle "boop-boop" wobble (never a buzzer); counting: a berry "pip" rising per berry; the chime wave: rising
 * pentatonic bell notes; cheers: a two-glass "clink" (high inharmonic partials) + a little music-box fanfare; the clear: a
 * sparkly noise "poof"; critters (ladybug tick-tick + wing buzz, butterfly flutter, snail squishy bloop, fairy twinkles);
 * ambience per mood (sunny birds, breezy wind + leaf rustle, rain pitter-patter, rainbow birds + a gentle shimmer) and a soft
 * music-box / celesta bed per mood, ducked under speech and during the cheers fanfare.
 * Chain (skill rule — phones are quiet): sfx / music / amb → master (mute) → compressor (−18 dB, knee 12, 4:1, 4 ms, 180 ms)
 * → user volume × 1.6 makeup → speakers. iOS: unlock() inside the first touchend/click also switches the audio session to
 * 'playback' (media volume, plays with the side switch on). gains() → the live gain values (QA). */
(function (FT) {
  'use strict';
  const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];
  // music-box beds per mood (all in F so every reward jingle fits): tempo, progression (semitones above root), lead timbre
  const MUSIC = [
    { root: 65, tempo: 96, prog: [[0, 4, 7], [5, 9, 12], [-3, 0, 4], [7, 11, 14]], lead: 'box', arp: 1 },        // sunny: music box
    { root: 65, tempo: 108, prog: [[0, 4, 7], [2, 5, 9], [5, 9, 12], [7, 11, 14]], lead: 'celesta', arp: 2 },    // breezy: lighter, quicker
    { root: 65, tempo: 80, prog: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]], lead: 'celesta', arp: 0 },   // rain: slower, cosy
    { root: 65, tempo: 100, prog: [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]], lead: 'box', arp: 1 }       // rainbow: bright
  ];
  // ambience bed per mood: [noise lowpass Hz, gain, LFO depth] — forest hush, breeze, rain bed, soft hush
  const AMB = [[600, 0.010, 0.006], [900, 0.034, 0.024], [2600, 0.030, 0.008], [560, 0.010, 0.006]];

  const A = {
    ctx: null, master: null, comp: null, user: null, sfx: null, music: null, amb: null, noiseBuf: null,
    sfxOn: true, musicOn: true, muted: false, ducked: false, volume: 1,
    mood: 0, _timer: null, _next: 0, _step: 0, _phrase: null, _playing: false, _hum: null, _lastPlay: {}, _bubT: 0, _fan: false,

    ensure() {
      if (this.ctx) return true;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try { this.ctx = new AC(); } catch (e) { return false; }
      const c = this.ctx;
      this.master = c.createGain(); this.master.gain.value = 1;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.18;
      this.comp = comp;   // exposed for QA (FT.debug.audio().comp)
      this.user = c.createGain(); this.user.gain.value = this.volume * 1.6;
      this.master.connect(comp); comp.connect(this.user); this.user.connect(c.destination);
      this.sfx = c.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
      this.music = c.createGain(); this.music.gain.value = 0; this.music.connect(this.master);
      this.amb = c.createGain(); this.amb.gain.value = 0; this.amb.connect(this.master);
      const len = c.sampleRate * 2;
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.apply();
      return true;
    },
    unlock() {
      try { if (navigator.audioSession && navigator.audioSession.type !== 'playback' && navigator.audioSession.type !== 'play-and-record') navigator.audioSession.type = 'playback'; } catch (e) {}
      if (!this.ensure()) return;
      const c = this.ctx;
      if (c.state !== 'running') c.resume().catch(() => {});
      try { const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); } catch (e) {}
    },
    suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); },
    resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); },
    apply() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.03);
      this.user.gain.setTargetAtTime(Math.max(0, Math.min(1, this.volume)) * 1.6, t, 0.03);
      this.sfx.gain.setTargetAtTime(this.sfxOn ? 0.9 : 0, t, 0.03);
      // music bed 0.22, ducked 0.07 under speech, 0.05 under the cheers fanfare (skill rule)
      const mv = this.musicOn && this._playing ? (this._fan ? 0.05 : this.ducked ? 0.07 : 0.22) : 0;
      this.music.gain.setTargetAtTime(mv, t, this.ducked || this._fan ? 0.08 : 0.5);
      this.amb.gain.setTargetAtTime(this.sfxOn && this._playing ? (this.ducked ? 0.55 : 1) : 0, t, 0.3);
    },
    /** QA: the live gain values of the chain */
    gains() {
      if (!this.ctx) return null;
      return { master: this.master.gain.value, user: this.user.gain.value, sfx: this.sfx.gain.value, music: this.music.gain.value, amb: this.amb.gain.value,
        threshold: this.comp.threshold.value, knee: this.comp.knee.value, ratio: this.comp.ratio.value, attack: this.comp.attack.value, release: this.comp.release.value,
        volume: this.volume, ducked: this.ducked, state: this.ctx.state };
    },
    setVolume(v) { this.setOptions({ volume: v }); },
    setOptions({ sfx, music, muted, volume }) {
      if (volume !== undefined) this.volume = Math.max(0, Math.min(1, +volume || 0));
      if (sfx !== undefined) this.sfxOn = sfx;
      if (music !== undefined) this.musicOn = music;
      if (muted !== undefined) this.muted = muted;
      this.apply();
    },
    duck(on) { if (this.ducked !== !!on) { this.ducked = !!on; this.apply(); } },
    /** the cheers fanfare: the bed steps back so the clink and the fanfare ring out */
    setFanfare(on) { if (this._fan !== !!on) { this._fan = !!on; this.apply(); } },

    /* ---------- ambience: a breathing bed of filtered noise + birds / leaves / raindrops / shimmer now and then ---------- */
    _startHum() {
      if (!this.ctx || this._hum) return;
      const c = this.ctx;
      const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
      const am = AMB[this.mood] || AMB[0];
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = am[0]; f.Q.value = 0.5;
      const g = c.createGain(); g.gain.value = am[1];
      const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.13; lg.gain.value = am[2];
      lfo.connect(lg); lg.connect(g.gain);
      const lfo2 = c.createOscillator(), lg2 = c.createGain(); lfo2.frequency.value = 0.07; lg2.gain.value = 120;
      lfo2.connect(lg2); lg2.connect(f.frequency);
      s.connect(f); f.connect(g); g.connect(this.amb);
      s.start(); lfo.start(); lfo2.start();
      this._hum = { s, lfo, lfo2, f, g, lg };
    },
    _stopHum() {
      const h = this._hum; if (!h) return;
      try { h.s.stop(); h.lfo.stop(); h.lfo2.stop(); } catch (e) {}
      this._hum = null;
    },
    /* call every frame (real seconds) */
    tick(dt) {
      if (!this.ctx || !this._playing || this.muted || !this.sfxOn) return;
      dt = dt || 0;
      this._bubT -= dt; this._dropT = (this._dropT || 0) - dt;
      if (this.mood === 2 && this._dropT <= 0) {   // rain: pitter-patter — little drips on leaves and the table
        this._dropT = 0.05 + Math.random() * 0.14;
        const f = 1800 + Math.random() * 2600;
        this.tone(f, 0.03, { type: 'sine', vol: 0.012 + Math.random() * 0.016, slideTo: f * 0.6, attack: 0.002, dest: this.amb });
        if (Math.random() < 0.2) this.noise(0.03, { vol: 0.018, type: 'bandpass', f0: 3200 + Math.random() * 2000, q: 3, attack: 0.002, dest: this.amb });
      }
      if (this._bubT > 0) return;
      if (this.mood === 0) {            // sunny: little forest birds, often
        this._bubT = 1.8 + Math.random() * 3.2;
        this.chirp(2400 + Math.random() * 1200, 2 + (Math.random() * 2 | 0), 0.036);
      } else if (this.mood === 1) {     // breezy: a gust of leaves rustling, a bird now and then
        this._bubT = 2.2 + Math.random() * 3;
        this.noise(1.1 + Math.random() * 0.6, { vol: 0.03, type: 'bandpass', f0: 1600, f1: 3400, q: 0.8, attack: 0.35, dest: this.amb });
        if (Math.random() < 0.35) this.chirp(2600 + Math.random() * 800, 2, 0.026);
      } else if (this.mood === 2) {     // rain: a soft far roll of drops on the canopy
        this._bubT = 4 + Math.random() * 4;
        this.noise(1.6, { vol: 0.018, type: 'lowpass', f0: 1200, q: 0.5, attack: 0.6, dest: this.amb });
      } else {                          // rainbow: birds + a gentle shimmer
        this._bubT = 2.4 + Math.random() * 3.2;
        if (Math.random() < 0.55) this.chirp(2300 + Math.random() * 1100, 2 + (Math.random() * 2 | 0), 0.032);
        else [0, 4, 7, 12].forEach((n, i) => this.tone(NOTE(96 + n), 0.5, { vol: 0.012, at: i * 0.09, attack: 0.02, dest: this.amb }));
      }
    },
    chirp(f, n, vol) { for (let i = 0; i < n; i++) this.tone(f * (1 + i * 0.06), 0.07, { type: 'sine', vol, at: i * 0.11, slideTo: f * 1.35, attack: 0.004, dest: this.amb }); },

    /* ---------- building blocks ---------- */
    tone(freq, dur, { type = 'sine', vol = 0.3, at = 0, slideTo = null, attack = 0.006, dest = null } = {}) {
      const c = this.ctx; if (!c) return;
      const t = c.currentTime + at;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest || this.sfx);
      o.start(t); o.stop(t + dur + 0.05);
    },
    noise(dur, { vol = 0.2, at = 0, type = 'bandpass', f0 = 1200, f1 = null, q = 1.2, dest = null, attack = 0.012 } = {}) {
      const c = this.ctx; if (!c) return;
      const t = c.currentTime + at;
      const s = c.createBufferSource(); s.buffer = this.noiseBuf;
      const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
      f.frequency.setValueAtTime(f0, t);
      if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + Math.min(attack, dur * 0.8));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(dest || this.sfx);
      s.start(t, Math.random()); s.stop(t + dur + 0.05);
    },
    bell(f, dur, { vol = 0.1, at = 0, dest = null } = {}) {
      this.tone(f, dur, { type: 'sine', vol, at, attack: 0.004, dest });
      this.tone(f * 2.76, dur * 0.5, { type: 'sine', vol: vol * 0.3, at, attack: 0.003, dest });
      this.tone(f * 5.4, dur * 0.2, { type: 'sine', vol: vol * 0.1, at, attack: 0.002, dest });
    },
    /* a music-box tine: a pure sine + a bright, quickly fading 4th / 7th partial */
    box(f, dur, { vol = 0.12, at = 0, dest = null } = {}) {
      this.tone(f, dur, { type: 'sine', vol, at, attack: 0.002, dest });
      this.tone(f * 4.01, Math.min(0.12, dur * 0.3), { type: 'sine', vol: vol * 0.25, at, attack: 0.001, dest });
      this.tone(f * 7.1, 0.05, { type: 'sine', vol: vol * 0.08, at, attack: 0.001, dest });
    },
    /* a celesta-ish note: sine + triangle octave, a softer bell */
    celesta(f, dur, { vol = 0.11, at = 0, dest = null } = {}) {
      this.tone(f, dur, { type: 'sine', vol, at, attack: 0.003, dest });
      this.tone(f * 2, dur * 0.5, { type: 'triangle', vol: vol * 0.2, at, attack: 0.002, dest });
      this.tone(f * 3.01, dur * 0.25, { type: 'sine', vol: vol * 0.1, at, attack: 0.002, dest });
    },
    /* glass "clink": two short inharmonic high partials per glass, two glasses a hair apart */
    clink({ at = 0, vol = 0.22 } = {}) {
      for (const [d, f] of [[0, 2093], [0.035, 2349]]) {
        this.tone(f, 0.5, { type: 'sine', vol, at: at + d, attack: 0.001 });
        this.tone(f * 2.32, 0.3, { type: 'sine', vol: vol * 0.45, at: at + d, attack: 0.001 });
        this.tone(f * 3.7, 0.16, { type: 'sine', vol: vol * 0.2, at: at + d, attack: 0.001 });
      }
      this.noise(0.03, { vol: vol * 0.3, type: 'highpass', f0: 5000, q: 0.7, at, attack: 0.001 });
    },

    play(name, opt = {}) {
      if (!this.ctx || this.muted || !this.sfxOn) return;
      const now = this.ctx.currentTime;
      const gap = { whoosh: 0.12, plop: 0.06, pip: 0.08, dust: 0.12, boop: 0.25, puff: 0.08, chime: 0.06, poof: 0.05, pop: 0.05, tick: 0.1, flutter: 0.3, twinkle: 0.15 }[name];
      if (gap && now - (this._lastPlay[name] || 0) < gap) return;   // staggered, never a buzz
      this._lastPlay[name] = now;
      const r = 1 + (Math.random() - 0.5) * 0.08;
      switch (name) {
        case 'whoosh':   // a thing floats down on its dandelion fluff: a soft airy filtered-noise sweep
          this.noise(0.7, { vol: 0.07, type: 'bandpass', f0: 700 * r, f1: 1500 * r, q: 0.9, attack: 0.25 }); break;
        case 'plop': {   // it lands: a little "plop" + a hollow wooden table thunk (heavier things lower)
          const lo = { guest: 0.85, obj: 1, plate: 1.05, cookie: 1.12, card: 1.2 }[opt.kind] || 1;
          this.tone(520 * r * lo, 0.09, { type: 'sine', vol: 0.2, slideTo: 260 * r * lo, attack: 0.002 });
          this.tone(140 * r * lo, 0.16, { type: 'triangle', vol: 0.26, slideTo: 90 * lo, attack: 0.002, at: 0.01 });
          this.noise(0.05, { vol: 0.06, type: 'bandpass', f0: 900, q: 2, attack: 0.002, at: 0.01 }); break; }
        case 'right':    // a twinkle glissando up + the fairy's chime
          [0, 2, 4, 7, 9, 12, 14, 16].forEach((n, i) => this.tone(NOTE(84 + n), 0.22, { vol: 0.09, at: i * 0.035, attack: 0.003 }));
          this.bell(NOTE(96), 0.7, { vol: 0.16, at: 0.3 }); this.bell(NOTE(103), 0.8, { vol: 0.13, at: 0.42 }); break;
        case 'fairy':    // the fairy sets off / arrives: a tiny wing flutter + two high chimes
          for (let i = 0; i < 4; i++) this.noise(0.04, { vol: 0.03, type: 'bandpass', f0: 2600, q: 2, at: i * 0.05, attack: 0.004 });
          this.bell(NOTE(100) * r, 0.4, { vol: 0.08, at: 0.05 }); this.bell(NOTE(105) * r, 0.4, { vol: 0.07, at: 0.14 }); break;
        case 'dust': [0, 5, 9].forEach((n, i) => this.tone(NOTE(98 + n) * r, 0.12, { vol: 0.045, at: i * 0.04, attack: 0.002 })); break;
        case 'rise':     // the thing floats up: a rising sine shimmer
          this.tone(NOTE(72), 1.3, { type: 'sine', vol: 0.1, slideTo: NOTE(91), attack: 0.2 });
          this.tone(NOTE(79), 1.2, { type: 'sine', vol: 0.06, slideTo: NOTE(98), attack: 0.25, at: 0.08 });
          this.noise(1.1, { vol: 0.025, type: 'bandpass', f0: 3000, f1: 7000, q: 2, attack: 0.3 }); break;
        case 'lantern':  // the lantern opens: a soft bell "bloom" chord
          [0, 4, 7, 12].forEach((n, i) => this.bell(NOTE(77 + n), 1.4, { vol: 0.11, at: i * 0.045 }));
          this.tone(NOTE(53), 0.9, { type: 'sine', vol: 0.12, attack: 0.05 }); break;
        case 'boop':     // wrong: a gentle wobbly "boop-boop" (never a buzzer)
          this.tone(392 * r, 0.14, { type: 'sine', vol: 0.2, slideTo: 330 * r, attack: 0.01 });
          this.tone(330 * r, 0.18, { type: 'sine', vol: 0.18, slideTo: 300 * r, attack: 0.01, at: 0.17 }); break;
        case 'wiggle': this.tone(500 * r, 0.08, { type: 'sine', vol: 0.08, slideTo: 440 * r, attack: 0.004 }); break;
        case 'puff': this.noise(0.12, { vol: 0.06, type: 'lowpass', f0: 1400, q: 0.7, attack: 0.006 }); this.tone(NOTE(100), 0.1, { vol: 0.03, attack: 0.002 }); break;
        case 'pip': {    // a berry counted: pips rising up the scale
          const k = Math.min(opt.i || 1, 12), f = NOTE(72 + PENTA[Math.min(k - 1, PENTA.length - 1)]);
          this.tone(f, 0.16, { type: 'triangle', vol: 0.22, attack: 0.003 }); this.tone(f * 2, 0.08, { type: 'sine', vol: 0.07, attack: 0.002 }); break; }
        case 'chime': {  // the chime wave: each friend rings the next note of a rising pentatonic scale
          const f = NOTE(77 + PENTA[Math.min(opt.i || 0, PENTA.length - 1)]);
          this.bell(f, 0.8, { vol: 0.18 }); this.tone(f * 2, 0.15, { type: 'sine', vol: 0.04, attack: 0.002 }); break; }
        case 'cheers':   // Moka raises his cup: clink + a little music-box fanfare
          this.clink({ vol: 0.24 });
          [[0, 0.18, 0.2], [4, 0.3, 0.2], [7, 0.42, 0.2], [12, 0.56, 0.6]].forEach(([n, t, d]) => { this.box(NOTE(77 + n), d + 0.4, { vol: 0.16, at: t }); this.celesta(NOTE(65 + n), d + 0.3, { vol: 0.08, at: t }); });
          break;
        case 'poof':     // the clear: a sparkly noise burst
          this.noise(0.22, { vol: 0.08, type: 'highpass', f0: 3500, q: 0.8, attack: 0.004 });
          this.tone(NOTE(100 + (Math.random() * 5 | 0)), 0.14, { vol: 0.05, attack: 0.002, at: 0.03 }); break;
        case 'garland':  // all the lanterns are glowing: a cascade of bells
          [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24].forEach((n, i) => this.bell(NOTE(77 + n), 0.9, { vol: 0.07, at: i * 0.07 })); break;
        case 'tick':     // the ladybug's tiny steps
          this.tone(3200 * r, 0.02, { type: 'sine', vol: 0.06, attack: 0.001 }); this.tone(3600 * r, 0.02, { type: 'sine', vol: 0.05, attack: 0.001, at: 0.07 }); break;
        case 'ladybug':  // a ladybug arrives: tick-tick + a happy "bip-bip"
          this.play('tick'); this.tone(1900 * r, 0.08, { vol: 0.1, slideTo: 2400 * r, attack: 0.004, at: 0.2 }); this.tone(2100 * r, 0.09, { vol: 0.09, slideTo: 2700 * r, attack: 0.004, at: 0.33 }); break;
        case 'ladybugFly': {   // shell opens, wings buzz away
          const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain(), bp = c.createBiquadFilter();
          o.type = 'sawtooth'; o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(320, t + 0.8);
          lfo.frequency.value = 38; lg.gain.value = 30; lfo.connect(lg); lg.connect(o.frequency);
          bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 2.5;
          g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.08, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
          o.connect(bp); bp.connect(g); g.connect(this.sfx); o.start(t); lfo.start(t); o.stop(t + 1); lfo.stop(t + 1); break; }
        case 'flutter':  // the butterfly: soft wing flutters + a little chime
          for (let i = 0; i < 6; i++) this.noise(0.05, { vol: 0.04, type: 'bandpass', f0: 1400 + i * 80, q: 1.2, at: i * 0.08, attack: 0.01 });
          this.bell(NOTE(93) * r, 0.5, { vol: 0.07, at: 0.2 }); break;
        case 'snail':    // a squishy "bloop" + a curious rising "hm?"
          this.tone(260 * r, 0.22, { type: 'sine', vol: 0.16, slideTo: 520 * r, attack: 0.02 });
          this.tone(330 * r, 0.18, { type: 'triangle', vol: 0.06, slideTo: 620 * r, attack: 0.02, at: 0.24 }); break;
        case 'twinkle': [0, 7, 12, 16].forEach((n, i) => this.tone(NOTE(96 + n), 0.18, { vol: 0.07, at: i * 0.06 })); break;
        case 'giggle':   // Moka poked: a soft "hee-hee" (two little sine wobbles)
          for (let i = 0; i < 2; i++) this.tone(NOTE(76 + i * 2) * r, 0.12, { type: 'triangle', vol: 0.13, slideTo: NOTE(72 + i * 2) * r, attack: 0.01, at: i * 0.16 }); break;
        case 'pop': this.tone(520 * r, 0.08, { vol: 0.16, slideTo: 1100 * r, attack: 0.002 }); this.noise(0.03, { vol: 0.06, type: 'highpass', f0: 3000, q: 0.7 }); break;
        case 'complete': [0, 4, 7, 12, 16].forEach((n, i) => this.box(NOTE(77 + n), 0.4, { vol: 0.16, at: i * 0.07 })); break;
        case 'hint': [0, 4, 7, 12].forEach((n, i) => this.tone(NOTE(88 + n), 0.2, { vol: 0.1, at: i * 0.07 })); break;
        case 'star': this.tone(NOTE(84 + (opt.i || 0) * 4), 0.35, { type: 'triangle', vol: 0.22 }); this.tone(NOTE(96 + (opt.i || 0) * 4), 0.3, { vol: 0.09, at: 0.03 }); break;
        case 'level': [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.box(NOTE(72 + n), 0.5, { vol: 0.18, at: i * 0.08 })); break;
        case 'party':    // the session celebration: clink, the fanfare, then a rising cascade of bells
          this.play('cheers');
          [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.bell(NOTE(84 + n), 0.8, { vol: 0.1, at: 0.9 + i * 0.1 }));
          this.clink({ at: 1.8, vol: 0.2 }); break;
        case 'chapter': [0, 7, 12].forEach((n, i) => this.bell(NOTE(77 + n), 0.9, { vol: 0.12, at: i * 0.12 })); break;
        case 'click': this.tone(900, 0.05, { vol: 0.14, slideTo: 1300 }); break;
        case 'soft': this.tone(500 * r, 0.16, { vol: 0.1, slideTo: 380 * r }); break;
        case 'talkRight': [0, 4, 7, 12].forEach((n, i) => this.box(NOTE(77 + n), 0.4, { vol: 0.2, at: i * 0.08 })); this.clink({ at: 0.36, vol: 0.14 }); break;
        case 'listen': this.tone(NOTE(81), 0.12, { vol: 0.18 }); this.tone(NOTE(88), 0.12, { vol: 0.18, at: 0.1 }); break;
      }
    },
    /** every sound name (QA plays them all) */
    NAMES: ['whoosh', 'plop', 'right', 'fairy', 'dust', 'rise', 'lantern', 'boop', 'wiggle', 'puff', 'pip', 'chime', 'cheers', 'poof', 'garland',
      'tick', 'ladybug', 'ladybugFly', 'flutter', 'snail', 'twinkle', 'giggle', 'pop', 'complete', 'hint', 'star', 'level', 'party', 'chapter',
      'click', 'soft', 'talkRight', 'listen'],

    setMood(i) {
      i = ((i % 4) + 4) % 4;
      if (i === this.mood && this._phrase) return;
      this.mood = i;
      this._phrase = this._makePhrase(i);
      const h = this._hum, am = AMB[i];
      if (h && this.ctx) { const t = this.ctx.currentTime; h.f.frequency.setTargetAtTime(am[0], t, 1); h.g.gain.setTargetAtTime(am[1], t, 1); h.lg.gain.setTargetAtTime(am[2], t, 1); }
      this.apply();
    },
    _makePhrase(i) {
      let seed = 5150 + i * 977;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const notes = []; let deg = 4;
      for (let bar = 0; bar < 4; bar++) for (let s = 0; s < 8; s++) {
        // a gentle lullaby line: stepwise, many rests, a held note at the end of the phrase
        const rest = (s % 2 === 1 && rnd() < 0.6) || (bar === 3 && s >= 5);
        deg = Math.max(2, Math.min(9, deg + (rnd() < 0.5 ? -1 : 1) * (rnd() < 0.25 ? 2 : 1)));
        notes.push(rest ? null : deg);
      }
      return notes;
    },
    startMusic() {
      if (!this.ensure()) return;
      if (!this._phrase) this._phrase = this._makePhrase(this.mood);
      this._playing = true;
      this._startHum();
      if (!this._timer) { this._next = this.ctx.currentTime + 0.15; this._step = 0; this._timer = setInterval(() => this._schedule(), 40); }
      this.apply();
    },
    stopMusic() {
      this._playing = false;
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
      this.apply();
      setTimeout(() => { if (!this._playing) this._stopHum(); }, 900);
    },
    _schedule() {
      const c = this.ctx; if (!c) return;
      if (c.state !== 'running') { this._next = c.currentTime + 0.1; return; }
      const m = MUSIC[this.mood];
      const eighth = 60 / m.tempo / 2;
      while (this._next < c.currentTime + 0.2) {
        this._playStep(this._step, this._next, m, eighth);
        this._next += eighth;
        this._step = (this._step + 1) % 32;
      }
    },
    _playStep(step, t, m, eighth) {
      if (!this.musicOn) return;
      const bar = Math.floor(step / 8) % m.prog.length, s = step % 8, chord = m.prog[bar];
      const at = Math.max(0, t - this.ctx.currentTime), D = this.music;
      // a soft low note on 1, a rolling music-box arpeggio of the chord, the lullaby line on top
      if (s === 0) this.tone(NOTE(m.root - 12 + chord[0]), eighth * 6, { type: 'sine', vol: 0.16, at, dest: D, attack: 0.02 });
      if (m.arp && (s % 2 === 0 || m.arp === 2)) { const n = chord[(s >> (m.arp === 2 ? 0 : 1)) % 3]; this.box(NOTE(m.root + n), eighth * 2.5, { vol: 0.05, at, dest: D }); }
      else if (!m.arp && s % 4 === 2) chord.forEach(n => this.celesta(NOTE(m.root + n), eighth * 3, { vol: 0.03, at, dest: D }));
      const deg = this._phrase[step];
      if (deg != null) {
        const f = NOTE(m.root + 12 + PENTA[deg]);
        if (m.lead === 'celesta') this.celesta(f, eighth * 2.6, { vol: 0.1, at, dest: D });
        else this.box(f, eighth * 2.4, { vol: 0.11, at, dest: D });
      }
    }
  };
  FT.Audio = A;
})(window.FT = window.FT || {});
