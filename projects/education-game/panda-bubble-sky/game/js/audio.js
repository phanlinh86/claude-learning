/* PB.Audio (Bao's Bubble Sky) — every sound is synthesized with WebAudio (no files to license or download), DESIGN §7.
 * Bubbles: blow (a soft breathy noise swell per bubble on the wand) + a little "blup" when it lets go, bump (a soft wet tick
 * when two bubbles touch, rate-limited), POP (a bright short click + an airy splash, the pitch varies a little each time),
 * paint (a rising glassy chime per rainbow piece, the pitch climbs with the piece), rainbow done (a shimmering arpeggio),
 * wrong squish (a low rubbery boing-wobble, never a buzzer), soft tap (tiny bubbling), count pip (rising), whoosh (a filtered
 * noise sweep), gust (a low wind swell), bird tweet, kite flutter, snow twinkle, Bao's giggle. Ambience per season (spring
 * birds, summer bees + breeze, autumn wind, winter soft chimes) and a gentle kalimba / marimba bed per season, ducked under
 * speech and under the celebration (setFanfare).
 * Chain (skill rule — phones are quiet): sfx / music / amb → master (mute) → compressor (−18 dB, knee 12, 4:1, 4 ms,
 * 180 ms) → user volume × 1.6 makeup → speakers. iOS: unlock() inside the first touchend/click also switches the audio
 * session to 'playback' (media volume, plays with the side switch on). */
(function (PB) {
  'use strict';
  const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);
  // gentle beds, all in C major pentatonic-ish so every reward chime fits
  const MUSIC = [
    { root: 60, tempo: 96, prog: [[0, 4, 7], [5, 9, 12], [-3, 0, 4], [7, 11, 14]], lead: 'marimba', swing: 0.06 },   // spring: marimba
    { root: 60, tempo: 104, prog: [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]], lead: 'kalimba', swing: 0.08 },  // summer: kalimba
    { root: 60, tempo: 88, prog: [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [7, 11, 14]], lead: 'marimba', swing: 0.05 },    // autumn
    { root: 60, tempo: 76, prog: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]], lead: 'bell', swing: 0 }         // winter: soft bells
  ];
  // ambience bed per season: [noise lowpass Hz, gain, LFO depth] — spring air, a summer breeze, autumn wind, still winter
  const AMB = [[600, 0.014, 0.008], [760, 0.024, 0.016], [440, 0.03, 0.024], [360, 0.012, 0.006]];
  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];

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
      this.comp = comp;   // exposed for QA (PB.debug.audio().comp)
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
      // music bed 0.2, ducked 0.06 under speech, 0.04 under the celebration (skill rule)
      const mv = this.musicOn && this._playing ? (this._fan ? 0.04 : this.ducked ? 0.06 : 0.2) : 0;
      this.music.gain.setTargetAtTime(mv, t, this.ducked || this._fan ? 0.08 : 0.5);
      this.amb.gain.setTargetAtTime(this.sfxOn && this._playing ? (this.ducked ? 0.5 : 1) : 0, t, 0.3);
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
    /** the rainbow shimmer / the celebration: the bed steps back so the reward rings out */
    setFanfare(on) { if (this._fan !== !!on) { this._fan = !!on; this.apply(); } },

    /* ---------- ambience: a breathing bed of filtered noise + birds / bees / chimes now and then ---------- */
    _startHum() {
      if (!this.ctx || this._hum) return;
      const c = this.ctx;
      const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
      const am = AMB[this.mood] || AMB[0];
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = am[0]; f.Q.value = 0.5;
      const g = c.createGain(); g.gain.value = am[1];
      const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.11; lg.gain.value = am[2];
      lfo.connect(lg); lg.connect(g.gain);
      const lfo2 = c.createOscillator(), lg2 = c.createGain(); lfo2.frequency.value = 0.07; lg2.gain.value = 80;
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
      this._bubT -= dt || 0;
      if (this._bubT > 0) return;
      if (this.mood === 0) {            // spring: little birds, often
        this._bubT = 2.2 + Math.random() * 3.5;
        this.chirp(2400 + Math.random() * 1200, 2 + (Math.random() * 2 | 0), 0.035);
      } else if (this.mood === 1) {     // summer: a bee buzzes by, or a far bird
        this._bubT = 3 + Math.random() * 4;
        if (Math.random() < 0.55) this.buzz(0.9 + Math.random() * 0.6, { vol: 0.028, dest: this.amb });
        else this.chirp(2600 + Math.random() * 900, 2, 0.028);
      } else if (this.mood === 2) {     // autumn: a soft wind swell now and then
        this._bubT = 4 + Math.random() * 4;
        this.noise(2.2, { vol: 0.03, type: 'lowpass', f0: 280, f1: 620, q: 0.6, attack: 0.9, dest: this.amb });
      } else {                          // winter: a soft high chime, rarely
        this._bubT = 5 + Math.random() * 5;
        const n = [84, 86, 88, 91, 93][(Math.random() * 5) | 0];
        this.bell(NOTE(n), 1.2, { vol: 0.022, dest: this.amb });
      }
    },
    chirp(f, n, vol) { for (let i = 0; i < n; i++) this.tone(f * (1 + i * 0.06), 0.07, { type: 'sine', vol, at: i * 0.11, slideTo: f * 1.35, attack: 0.004, dest: this.amb }); },
    buzz(dur, { vol = 0.05, at = 0, dest = null } = {}) {
      const c = this.ctx; if (!c) return;
      const t = c.currentTime + at, o = c.createOscillator(), bp = c.createBiquadFilter(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
      o.type = 'sawtooth'; o.frequency.value = 210; lfo.frequency.value = 9; lg.gain.value = 18; lfo.connect(lg); lg.connect(o.frequency);
      bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 2;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(bp); bp.connect(g); g.connect(dest || this.sfx);
      o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
    },

    /* ---------- building blocks ---------- */
    tone(freq, dur, { type = 'sine', vol = 0.3, at = 0, slideTo = null, attack = 0.006, dest = null, vib = 0, vibHz = 0 } = {}) {
      const c = this.ctx; if (!c) return;
      const t = c.currentTime + at;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      let l = null;
      if (vib) { l = c.createOscillator(); const lg = c.createGain(); l.frequency.value = vibHz || 12; lg.gain.value = vib; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.05); }
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
      g.gain.exponentialRampToValueAtTime(vol, t + Math.min(attack, dur * 0.9));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(dest || this.sfx);
      s.start(t, Math.random()); s.stop(t + dur + 0.05);
    },
    bell(f, dur, { vol = 0.1, at = 0, dest = null } = {}) {
      this.tone(f, dur, { type: 'sine', vol, at, attack: 0.004, dest });
      this.tone(f * 2.76, dur * 0.5, { type: 'sine', vol: vol * 0.3, at, attack: 0.003, dest });
      this.tone(f * 5.4, dur * 0.2, { type: 'sine', vol: vol * 0.1, at, attack: 0.002, dest });
    },
    /* a glassy chime: a pure sine + an inharmonic shimmer partial, long soft tail */
    glass(f, dur, { vol = 0.14, at = 0, dest = null } = {}) {
      this.tone(f, dur, { type: 'sine', vol, at, attack: 0.003, dest });
      this.tone(f * 3.01, dur * 0.45, { type: 'sine', vol: vol * 0.22, at, attack: 0.002, dest });
      this.tone(f * 4.2, dur * 0.25, { type: 'sine', vol: vol * 0.08, at: at + 0.01, attack: 0.002, dest });
    },
    /* a marimba-ish mallet note: sine fundamental + a quick 4th harmonic "tok" */
    mallet(f, dur, { vol = 0.2, at = 0, dest = null } = {}) {
      this.tone(f, dur, { type: 'sine', vol, at, attack: 0.003, dest });
      this.tone(f * 4, Math.min(0.08, dur * 0.3), { type: 'sine', vol: vol * 0.22, at, attack: 0.002, dest });
      this.tone(f * 2, dur * 0.5, { type: 'triangle', vol: vol * 0.12, at, attack: 0.003, dest });
    },
    /* a kalimba pluck: a sine with a short metallic 5.9× tine partial and a fast decay */
    kalimba(f, dur, { vol = 0.14, at = 0, dest = null } = {}) {
      this.tone(f, dur, { type: 'sine', vol, at, attack: 0.002, dest });
      this.tone(f * 5.93, Math.min(0.06, dur * 0.2), { type: 'sine', vol: vol * 0.3, at, attack: 0.001, dest });
      this.tone(f * 2.01, dur * 0.35, { type: 'sine', vol: vol * 0.14, at, attack: 0.002, dest });
    },

    play(name, opt = {}) {
      if (!this.ctx || this.muted || !this.sfxOn) return;
      const now = this.ctx.currentTime;
      const gap = { blow: 0.12, blup: 0.06, bump: 0.12, pip: 0.08, tweet: 0.15, twinkle: 0.12, squish: 0.18, soft: 0.08, pop: 0.04,
        flutter: 0.3, gust: 1.0, whoosh: 0.5, giggle: 0.3, badge: 0.1 }[name];
      if (gap && now - (this._lastPlay[name] || 0) < gap) return;   // staggered, never a buzz
      this._lastPlay[name] = now;
      const r = 1 + (Math.random() - 0.5) * 0.08;
      switch (name) {
        case 'blow':     // Bao blows a bubble: a soft breathy swell (band-passed noise opening up) + a faint film hum
          this.noise(0.42, { vol: 0.09, type: 'bandpass', f0: 700 * r, f1: 1800 * r, q: 0.9, attack: 0.26 });
          this.tone(180 * r, 0.4, { type: 'sine', vol: 0.025, slideTo: 240 * r, attack: 0.2 }); break;
        case 'blup':     // the bubble lets go of the wand: a little rising "blup"
          this.tone(300 * r, 0.1, { type: 'sine', vol: 0.16, slideTo: 760 * r, attack: 0.004 });
          this.tone(620 * r, 0.06, { type: 'sine', vol: 0.05, slideTo: 1200 * r, attack: 0.003, at: 0.02 }); break;
        case 'bump': {   // two bubbles touch: a soft wet tick, volume ∝ the approach speed
          const v = Math.max(0.02, Math.min(0.09, (opt.v || 80) / 2400));
          this.tone(820 * r, 0.05, { type: 'sine', vol: v, slideTo: 560 * r, attack: 0.002 });
          this.noise(0.03, { vol: v * 0.4, type: 'bandpass', f0: 2600, q: 3, attack: 0.002 }); break; }
        case 'pop': {    // POP: a bright click + an airy splash; the pitch varies (opt.pitch), quieter for a soft pop
          const p = (opt.pitch || 1) * (0.9 + Math.random() * 0.22), s = opt.soft ? 0.5 : 1;
          this.tone(1500 * p, 0.035, { type: 'triangle', vol: 0.26 * s, slideTo: 2600 * p, attack: 0.001 });
          this.tone(620 * p, 0.07, { type: 'sine', vol: 0.18 * s, slideTo: 1300 * p, attack: 0.001 });
          this.noise(0.16, { vol: 0.12 * s, type: 'highpass', f0: 3200, f1: 6000, q: 0.6, attack: 0.002 });
          this.noise(0.22, { vol: 0.05 * s, type: 'bandpass', f0: 1800, f1: 900, q: 0.8, at: 0.02, attack: 0.01 }); break; }
        case 'paint': {  // a rainbow piece painted: a rising glassy chime, the pitch climbs with the piece
          const k = Math.max(0, Math.min(SCALE.length - 1, opt.i || 0)), f = NOTE(79 + SCALE[k]);
          this.glass(f, 0.8, { vol: 0.15 }); this.glass(f * 1.5, 0.5, { vol: 0.05, at: 0.06 }); break; }
        case 'rainbow':  // the rainbow is done: a shimmering arpeggio up the scale
          [0, 2, 4, 7, 9, 12, 14, 16, 19].forEach((n, i) => this.glass(NOTE(79 + n), 0.9, { vol: 0.09, at: i * 0.06 }));
          this.noise(1.1, { vol: 0.03, type: 'highpass', f0: 6000, q: 0.5, attack: 0.3 }); break;
        case 'squish':   // wrong: a low rubbery boing-wobble (jelly), never a buzzer
          this.tone(230 * r, 0.32, { type: 'sine', vol: 0.22, slideTo: 150 * r, attack: 0.01, vib: 22, vibHz: 11 });
          this.tone(460 * r, 0.12, { type: 'triangle', vol: 0.04, slideTo: 300 * r, attack: 0.006 }); break;
        case 'soft':     // a press on the empty sky: tiny bubbling
          for (let i = 0; i < 3; i++) this.tone((600 + i * 180) * r, 0.05, { type: 'sine', vol: 0.06, slideTo: (900 + i * 240) * r, attack: 0.002, at: i * 0.045 });
          break;
        case 'pip': {    // a star / bubble counted: pips rising up the scale
          const k = Math.min(opt.i || 1, 12), f = NOTE(72 + SCALE[Math.min(k - 1, SCALE.length - 1)]);
          this.tone(f, 0.16, { type: 'triangle', vol: 0.2, attack: 0.003 }); this.tone(f * 2, 0.08, { type: 'sine', vol: 0.07, attack: 0.002 }); break; }
        case 'whoosh':   // Bao blows the leftovers away: a filtered noise sweep up
          this.noise(0.9, { vol: 0.13, type: 'bandpass', f0: 380, f1: 2600, q: 0.9, attack: 0.18 });
          this.noise(0.7, { vol: 0.05, type: 'lowpass', f0: 500, f1: 900, q: 0.5, attack: 0.15, at: 0.08 }); break;
        case 'gust':     // an autumn gust: a low wind swell
          this.noise(1.6, { vol: 0.08, type: 'lowpass', f0: 260, f1: 720, q: 0.7, attack: 0.6 }); break;
        case 'tweet':    // the bird: two quick high tweets
          this.tone(2900 * r, 0.07, { type: 'sine', vol: 0.12, slideTo: 3900 * r, attack: 0.004 });
          this.tone(3100 * r, 0.09, { type: 'sine', vol: 0.11, slideTo: 4100 * r, attack: 0.004, at: 0.12 });
          this.tone(2600 * r, 0.06, { type: 'sine', vol: 0.08, slideTo: 3300 * r, attack: 0.004, at: 0.26 }); break;
        case 'flutter':  // the kite: paper fluttering (a few quick band-passed noise flaps)
          for (let i = 0; i < 5; i++) this.noise(0.05, { vol: 0.05, type: 'bandpass', f0: 1400 + i * 120, q: 2, at: i * 0.06, attack: 0.004 });
          break;
        case 'twinkle':  // a snowflake: a tiny high sparkle
          [0, 7, 12, 19].forEach((n, i) => this.tone(NOTE(96 + n), 0.18, { vol: 0.06, at: i * 0.05, attack: 0.002 })); break;
        case 'giggle':   // Bao giggles (poke): "hee-hee" — two little vibrato sweeps
          this.tone(700 * r, 0.12, { type: 'triangle', vol: 0.1, slideTo: 900 * r, attack: 0.01, vib: 30, vibHz: 14 });
          this.tone(760 * r, 0.14, { type: 'triangle', vol: 0.09, slideTo: 980 * r, attack: 0.01, vib: 30, vibHz: 14, at: 0.16 }); break;
        case 'badge': this.tone(880 * r, 0.08, { vol: 0.1, slideTo: 1320 * r, attack: 0.002 }); break;
        case 'right':    // a right pop: a happy two-note ding on top of the pop (the 'pop' event plays the pop itself)
          this.bell(NOTE(84), 0.45, { vol: 0.12, at: 0.05 }); this.bell(NOTE(91), 0.5, { vol: 0.1, at: 0.14 }); break;
        case 'hint': [0, 4, 7, 12].forEach((n, i) => this.tone(NOTE(88 + n), 0.2, { vol: 0.09, at: i * 0.07 })); break;
        case 'star': this.tone(NOTE(84 + (opt.i || 0) * 4), 0.35, { type: 'triangle', vol: 0.2 }); this.tone(NOTE(96 + (opt.i || 0) * 4), 0.3, { vol: 0.08, at: 0.03 }); break;
        case 'level': [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.mallet(NOTE(67 + n), 0.45, { vol: 0.18, at: i * 0.08 })); break;
        case 'party':    // the session celebration: a bubbly rising run, then bells
          for (let i = 0; i < 10; i++) this.play('blup');
          [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.kalimba(NOTE(72 + n), 0.5, { vol: 0.14, at: 0.1 + i * 0.09 }));
          [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.bell(NOTE(84 + n), 0.7, { vol: 0.09, at: 0.9 + i * 0.1 })); break;
        case 'chapter': [0, 7, 12].forEach((n, i) => this.bell(NOTE(79 + n), 0.9, { vol: 0.11, at: i * 0.12 })); break;
        case 'click': this.tone(900, 0.05, { vol: 0.12, slideTo: 1300 }); break;
        case 'gentle': this.tone(520 * r, 0.16, { vol: 0.09, slideTo: 400 * r }); break;   // a Talk answer that is not it
        case 'talkRight': [0, 4, 7, 12].forEach((n, i) => this.kalimba(NOTE(76 + n), 0.35, { vol: 0.2, at: i * 0.08 })); break;
        case 'listen': this.tone(NOTE(81), 0.12, { vol: 0.16 }); this.tone(NOTE(88), 0.12, { vol: 0.16, at: 0.1 }); break;
      }
    },

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
      let seed = 5150 + i * 733;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const notes = []; let deg = 4;
      for (let bar = 0; bar < 4; bar++) for (let s = 0; s < 8; s++) {
        // gentle: notes mostly on the beats, small steps, a held note at the end of the phrase
        const rest = (s % 2 === 1 && rnd() < 0.65) || (bar === 3 && s >= 5);
        deg = Math.max(1, Math.min(8, deg + (rnd() < 0.5 ? -1 : 1) * (rnd() < 0.2 ? 2 : 1)));
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
        const sw = this._step % 2 === 1 ? eighth * m.swing : 0;
        this._playStep(this._step, this._next + sw, m, eighth);
        this._next += eighth;
        this._step = (this._step + 1) % 32;
      }
    },
    _playStep(step, t, m, eighth) {
      if (!this.musicOn) return;
      const bar = Math.floor(step / 8), s = step % 8, chord = m.prog[bar % m.prog.length];
      const at = Math.max(0, t - this.ctx.currentTime), D = this.music;
      // a soft bass on 1 and 5, a rolled chord on 3 and 7 (no drums: a calm, floaty bed)
      if (s === 0 || s === 4) this.tone(NOTE(m.root - 12 + chord[s === 0 ? 0 : 2] - (s === 4 ? 12 : 0)), eighth * 2.2, { type: 'sine', vol: 0.2, at, dest: D, attack: 0.01 });
      if (s === 2 || s === 6) chord.forEach((n, j) => this.tone(NOTE(m.root + n), eighth * 1.4, { type: 'triangle', vol: 0.035, at: at + j * 0.03, dest: D, attack: 0.006 }));
      const deg = this._phrase[step];
      if (deg != null) {
        const f = NOTE(m.root + 12 + SCALE[deg]);
        if (m.lead === 'kalimba') this.kalimba(f, eighth * 2, { vol: 0.12, at, dest: D });
        else if (m.lead === 'bell') this.bell(f * 2, eighth * 3, { vol: 0.045, at, dest: D });
        else this.mallet(f, eighth * 1.8, { vol: 0.11, at, dest: D });
      }
    }
  };
  A.SOUNDS = ['blow', 'blup', 'bump', 'pop', 'paint', 'rainbow', 'squish', 'soft', 'pip', 'whoosh', 'gust', 'tweet', 'flutter', 'twinkle',
    'giggle', 'badge', 'right', 'hint', 'star', 'level', 'party', 'chapter', 'click', 'gentle', 'talkRight', 'listen'];
  PB.Audio = A;
})(window.PB = window.PB || {});
