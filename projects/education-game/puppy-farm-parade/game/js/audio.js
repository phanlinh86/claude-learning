/* FP.Audio (Bo's Farm Parade) — every sound is synthesized with WebAudio (no files to license or download), DESIGN §7.
 * Steps: a soft wooden "tok" per animal step, a little rolling rattle per wagon step; hop "boing" (rising) + landing thump;
 * right "ding-ding" + Bo's bark (a formant "woof": a falling saw through two vowel band-passes + a breathy onset);
 * wrong: a gentle "boop-boop" wobble; counting: an apple "pip" rising per apple; barn door: a soft creak (filtered noise
 * sweep + a squeaky resonance) and a wooden clunk; the march: clip-clop in step and a little fanfare at the end; the
 * weathervane whirr; chick peep; rooster crow (a gentle sweep); firefly twinkle. Ambience per mood (morning birds, noon
 * breeze + bees, sunset first crickets, night crickets) and a bouncy marimba / ukulele bed per mood, ducked under speech
 * and under the march fanfare (setFanfare).
 * Chain (skill rule — phones are quiet): sfx / music / amb → master (mute) → compressor (−18 dB, knee 12, 4:1, 4 ms,
 * 180 ms) → user volume × 1.6 makeup → speakers. iOS: unlock() inside the first touchend/click also switches the audio
 * session to 'playback' (media volume, plays with the side switch on). */
(function (FP) {
  'use strict';
  const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);
  // bouncy beds, all in C so every reward jingle fits
  const MUSIC = [
    { root: 60, tempo: 112, prog: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]], lead: 'marimba', swing: 0.08 },   // morning: marimba
    { root: 60, tempo: 124, prog: [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]], lead: 'uke', swing: 0.1 },     // noon: ukulele
    { root: 60, tempo: 104, prog: [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [7, 11, 14]], lead: 'marimba', swing: 0.06 },  // sunset
    { root: 60, tempo: 88, prog: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]], lead: 'bell', swing: 0 }        // night: soft bells
  ];
  // ambience bed per mood: [noise lowpass Hz, gain, LFO depth] — morning hush, a noon breeze, evening air, still night
  const AMB = [[520, 0.012, 0.008], [760, 0.028, 0.02], [560, 0.016, 0.01], [360, 0.012, 0.006]];
  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

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
      this.comp = comp;   // exposed for QA (FP.debug.audio().comp)
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
      // music bed 0.22, ducked 0.07 under speech, 0.04 under the march fanfare (skill rule)
      const mv = this.musicOn && this._playing ? (this._fan ? 0.04 : this.ducked ? 0.07 : 0.22) : 0;
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
    /** the march fanfare: the bed steps back so the parade's own clip-clop and fanfare ring out */
    setFanfare(on) { if (this._fan !== !!on) { this._fan = !!on; this.apply(); } },

    /* ---------- ambience: a breathing bed of filtered noise + birds / bees / crickets now and then ---------- */
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
      dt = dt || 0;
      this._bubT -= dt; this._crT = (this._crT || 0) - dt;
      if (this.mood >= 2 && this._crT <= 0) {   // crickets: a quick trill of 3–5 tiny high pulses (sunset: rarely)
        this._crT = (this.mood === 3 ? 1.4 : 3.2) + Math.random() * 2.4;
        const f = 4300 + Math.random() * 500, n = 3 + (Math.random() * 3 | 0);
        for (let i = 0; i < n; i++) this.tone(f, 0.025, { type: 'sine', vol: this.mood === 3 ? 0.024 : 0.016, at: i * 0.05, attack: 0.003, dest: this.amb });
      }
      if (this._bubT > 0) return;
      if (this.mood === 1) {            // noon: a bee buzzes by (a wobbly low saw through a band-pass) or a bird
        this._bubT = 3 + Math.random() * 4;
        if (Math.random() < 0.5) this.buzz(0.9 + Math.random() * 0.6, { vol: 0.03, dest: this.amb });
        else this.chirp(2600 + Math.random() * 900, 2, 0.032);
      } else if (this.mood === 0) {     // morning: little birds, often
        this._bubT = 1.8 + Math.random() * 3.5;
        this.chirp(2400 + Math.random() * 1200, 2 + (Math.random() * 2 | 0), 0.04);
      } else if (this.mood === 2) {     // sunset: a far bird now and then
        this._bubT = 4 + Math.random() * 4;
        this.chirp(1900 + Math.random() * 500, 2, 0.026);
      } else {                          // night: a soft owl-ish hoo-hoo, rarely
        this._bubT = 7 + Math.random() * 6;
        this.tone(420, 0.28, { type: 'sine', vol: 0.03, slideTo: 380, attack: 0.05, dest: this.amb });
        this.tone(400, 0.36, { type: 'sine', vol: 0.028, slideTo: 350, attack: 0.05, at: 0.42, dest: this.amb });
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
      g.gain.exponentialRampToValueAtTime(vol, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(dest || this.sfx);
      s.start(t, Math.random()); s.stop(t + dur + 0.05);
    },
    bell(f, dur, { vol = 0.1, at = 0, dest = null } = {}) {
      this.tone(f, dur, { type: 'sine', vol, at, attack: 0.004, dest });
      this.tone(f * 2.76, dur * 0.5, { type: 'sine', vol: vol * 0.3, at, attack: 0.003, dest });
      this.tone(f * 5.4, dur * 0.2, { type: 'sine', vol: vol * 0.1, at, attack: 0.002, dest });
    },
    /* a marimba-ish mallet note: sine fundamental + a quick 4th harmonic "tok" */
    mallet(f, dur, { vol = 0.2, at = 0, dest = null } = {}) {
      this.tone(f, dur, { type: 'sine', vol, at, attack: 0.003, dest });
      this.tone(f * 4, Math.min(0.08, dur * 0.3), { type: 'sine', vol: vol * 0.22, at, attack: 0.002, dest });
      this.tone(f * 2, dur * 0.5, { type: 'triangle', vol: vol * 0.12, at, attack: 0.003, dest });
    },
    /* a ukulele-ish pluck: a triangle + a quick bright saw transient, fast decay */
    pluck(f, dur, { vol = 0.12, at = 0, dest = null } = {}) {
      this.tone(f, dur, { type: 'triangle', vol, at, attack: 0.002, dest });
      this.tone(f * 2, Math.min(0.12, dur * 0.4), { type: 'sawtooth', vol: vol * 0.12, at, attack: 0.001, dest });
    },
    /* a little brass note for the fanfare (saw through an opening low-pass) */
    brass(f, dur, { vol = 0.14, at = 0, dest = null } = {}) {
      const c = this.ctx; if (!c) return;
      const t = c.currentTime + at, o = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(f * 0.97, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.04);
      lp.type = 'lowpass'; lp.Q.value = 1.5; lp.frequency.setValueAtTime(500, t); lp.frequency.exponentialRampToValueAtTime(2800, t + 0.05); lp.frequency.exponentialRampToValueAtTime(1000, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.025); g.gain.setValueAtTime(vol, t + dur * 0.6); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(lp); lp.connect(g); g.connect(dest || this.sfx);
      o.start(t); o.stop(t + dur + 0.05);
    },
    /** Bo's bark: a short formant "woof" — a saw falling 620 → 300 Hz through two vowel band-passes ("oo" ≈ 450 / 1000 Hz)
     *  with a breathy noise onset ("w"); `small` = the second, shorter "wuf" */
    woof({ at = 0, vol = 0.3, pitch = 1, small = false } = {}) {
      const c = this.ctx; if (!c) return;
      const t = c.currentTime + at, dur = small ? 0.13 : 0.19;
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(560 * pitch, t); o.frequency.linearRampToValueAtTime(680 * pitch, t + 0.025); o.frequency.exponentialRampToValueAtTime(290 * pitch, t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.018); g.gain.exponentialRampToValueAtTime(vol * 0.5, t + dur * 0.55); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const out = c.createGain(); out.gain.value = 1;
      for (const [fq, q, k] of [[480, 5, 1], [1050, 6, 0.55], [2400, 8, 0.18]]) {
        const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = q;
        bp.frequency.setValueAtTime(fq * 1.25 * pitch, t); bp.frequency.exponentialRampToValueAtTime(fq * pitch, t + dur);
        const kg = c.createGain(); kg.gain.value = k * 2.2;
        g.connect(bp); bp.connect(kg); kg.connect(out);
      }
      o.connect(g); out.connect(this.sfx);
      o.start(t); o.stop(t + dur + 0.05);
      this.noise(0.05, { vol: vol * 0.35, type: 'bandpass', f0: 1500 * pitch, q: 1.2, at, attack: 0.004 });
    },

    play(name, opt = {}) {
      if (!this.ctx || this.muted || !this.sfxOn) return;
      const now = this.ctx.currentTime;
      const gap = { step: 0.06, rattle: 0.07, pip: 0.08, peep: 0.15, twinkle: 0.15, boop: 0.25, puff: 0.08, march: 0.12, pop: 0.05, creak: 0.4, whirr: 0.6 }[name];
      if (gap && now - (this._lastPlay[name] || 0) < gap) return;   // staggered, never a buzz
      this._lastPlay[name] = now;
      const r = 1 + (Math.random() - 0.5) * 0.08;
      switch (name) {
        case 'step':     // an animal's step: a soft wooden "tok" (hollow, a touch of pitch per member)
          this.tone(330 * r * (opt.pitch || 1), 0.06, { type: 'triangle', vol: 0.12, slideTo: 260 * r, attack: 0.002 });
          this.noise(0.025, { vol: 0.05, type: 'bandpass', f0: 1800, q: 4, attack: 0.001 }); break;
        case 'rattle':   // a wagon rolls a little: two quick wooden clicks + a short rumble
          this.noise(0.02, { vol: 0.07, type: 'bandpass', f0: 2600 * r, q: 6, attack: 0.001 });
          this.noise(0.02, { vol: 0.05, type: 'bandpass', f0: 2200 * r, q: 6, at: 0.04, attack: 0.001 });
          this.noise(0.09, { vol: 0.035, type: 'lowpass', f0: 380, q: 0.7, attack: 0.01 }); break;
        case 'settle': this.tone(240 * r, 0.07, { type: 'sine', vol: 0.08, slideTo: 200 * r, attack: 0.002 }); break;
        case 'boing':    // take-off: a rising springy boing (sine with vibrato-ish slide)
          this.tone(260 * r, 0.32, { type: 'sine', vol: 0.24, slideTo: 760 * r, attack: 0.004 });
          this.tone(520 * r, 0.22, { type: 'triangle', vol: 0.06, slideTo: 1400 * r, attack: 0.004, at: 0.02 }); break;
        case 'thump':    // landing on the hay bale: a soft low thump + straw rustle
          this.tone(130 * r, 0.16, { type: 'sine', vol: 0.3, slideTo: 70, attack: 0.003 });
          this.noise(0.14, { vol: 0.07, type: 'highpass', f0: 2500, q: 0.6, attack: 0.004 }); break;
        case 'right':    // ding-ding + Bo's bark "woof woof"
          this.bell(NOTE(84), 0.5, { vol: 0.2 }); this.bell(NOTE(91), 0.6, { vol: 0.18, at: 0.11 });
          this.woof({ at: 0.06, vol: 0.32 }); this.woof({ at: 0.3, vol: 0.26, small: true, pitch: 1.06 }); break;
        case 'woof': this.woof({ vol: 0.3, pitch: opt.pitch || 1 }); break;
        case 'boop':     // wrong: a gentle wobbly "boop-boop" (never a buzzer)
          this.tone(392 * r, 0.14, { type: 'sine', vol: 0.2, slideTo: 330 * r, attack: 0.01 });
          this.tone(330 * r, 0.18, { type: 'sine', vol: 0.18, slideTo: 300 * r, attack: 0.01, at: 0.17 }); break;
        case 'wiggle': this.tone(500 * r, 0.08, { type: 'sine', vol: 0.08, slideTo: 440 * r, attack: 0.004 }); break;
        case 'puff': this.noise(0.12, { vol: 0.06, type: 'lowpass', f0: 900, q: 0.7, attack: 0.006 }); break;
        case 'pip': {    // an apple counted: pips rising up the scale
          const k = Math.min(opt.i || 1, 12), f = NOTE(72 + SCALE[Math.min(k - 1, SCALE.length - 1)]);
          this.tone(f, 0.16, { type: 'triangle', vol: 0.22, attack: 0.003 }); this.tone(f * 2, 0.08, { type: 'sine', vol: 0.07, attack: 0.002 }); break; }
        case 'creak':    // the barn doors: a soft creak (a narrow noise sweep + a squeaky resonance)
          this.noise(0.42, { vol: 0.07, type: 'bandpass', f0: 700, f1: 1500, q: 9, attack: 0.04 });
          this.tone(560 * r, 0.32, { type: 'triangle', vol: 0.04, slideTo: 760 * r, attack: 0.05 }); break;
        case 'clunk': this.tone(150 * r, 0.14, { type: 'triangle', vol: 0.22, slideTo: 95, attack: 0.002 }); this.noise(0.06, { vol: 0.08, type: 'lowpass', f0: 700, q: 0.8, attack: 0.002 }); break;
        case 'march': {  // a clip-clop in step (alternating high / low hoof)
          const hi = (opt.i || 0) % 2 === 0;
          this.tone((hi ? 880 : 660) * r, 0.05, { type: 'triangle', vol: 0.16, slideTo: (hi ? 700 : 520) * r, attack: 0.001 });
          this.noise(0.03, { vol: 0.07, type: 'bandpass', f0: hi ? 3200 : 2400, q: 5, attack: 0.001 }); break; }
        case 'fanfare':  // the little parade fanfare at the end of the march
          [[0, 0, 0.18], [4, 0.13, 0.13], [7, 0.26, 0.13], [12, 0.4, 0.5]].forEach(([n, t, d]) => { this.brass(NOTE(72 + n), d, { vol: 0.12, at: t }); this.mallet(NOTE(84 + n), d + 0.2, { vol: 0.1, at: t }); });
          break;
        case 'fanfareBig':   // the chapter's grand parade: the fanfare, then a second rising phrase + a bark
          this.play('fanfare');
          [[0, 0.75, 0.12], [4, 0.87, 0.12], [7, 0.99, 0.12], [12, 1.11, 0.12], [16, 1.23, 0.12], [19, 1.35, 0.7]].forEach(([n, t, d]) => { this.brass(NOTE(72 + n), d, { vol: 0.11, at: t }); this.mallet(NOTE(84 + n), d + 0.2, { vol: 0.09, at: t }); });
          this.woof({ at: 2.0, vol: 0.24, small: true, pitch: 1.08 }); break;
        case 'whirr': this.noise(0.9, { vol: 0.05, type: 'bandpass', f0: 1400, f1: 500, q: 3, attack: 0.05 }); break;
        case 'peep':     // the chick: two high peeps
          this.tone(2800 * r, 0.08, { type: 'sine', vol: 0.14, slideTo: 3600 * r, attack: 0.004 });
          this.tone(2900 * r, 0.09, { type: 'sine', vol: 0.12, slideTo: 3800 * r, attack: 0.004, at: 0.13 }); break;
        case 'flap': for (let i = 0; i < 3; i++) this.noise(0.05, { vol: 0.05, type: 'bandpass', f0: 1200, q: 1.5, at: i * 0.07, attack: 0.005 }); break;
        case 'crow': {   // the rooster: a gentle "cock-a-doodle-doo" (four sung sweeps, soft triangle + nasal band-pass)
          const seg = [[620, 760, 0.12], [700, 820, 0.1], [780, 920, 0.12], [900, 640, 0.42]];
          let t = 0;
          seg.forEach(([a, b, d]) => { this.tone(a * r, d, { type: 'triangle', vol: 0.12, slideTo: b * r, attack: 0.02, at: t }); this.tone(a * 2 * r, d, { type: 'sine', vol: 0.03, slideTo: b * 2 * r, attack: 0.02, at: t }); t += d + 0.03; });
          break; }
        case 'twinkle': [0, 7, 12].forEach((n, i) => this.tone(NOTE(96 + n), 0.15, { vol: 0.07, at: i * 0.06 })); break;
        case 'pop': this.tone(520 * r, 0.08, { vol: 0.16, slideTo: 1100 * r, attack: 0.002 }); this.noise(0.03, { vol: 0.06, type: 'highpass', f0: 3000, q: 0.7 }); break;
        case 'complete': [0, 4, 7, 12, 16].forEach((n, i) => this.mallet(NOTE(72 + n), 0.35, { vol: 0.18, at: i * 0.07 })); break;
        case 'hint': [0, 4, 7, 12].forEach((n, i) => this.tone(NOTE(88 + n), 0.2, { vol: 0.1, at: i * 0.07 })); break;
        case 'star': this.tone(NOTE(84 + (opt.i || 0) * 4), 0.35, { type: 'triangle', vol: 0.22 }); this.tone(NOTE(96 + (opt.i || 0) * 4), 0.3, { vol: 0.09, at: 0.03 }); break;
        case 'level': [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.mallet(NOTE(67 + n), 0.45, { vol: 0.2, at: i * 0.08 })); break;
        case 'party':    // the session celebration: the fanfare twice + bells
          this.play('fanfare');
          [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.bell(NOTE(84 + n), 0.7, { vol: 0.1, at: 0.9 + i * 0.1 }));
          this.woof({ at: 1.7, vol: 0.28 }); this.woof({ at: 1.95, vol: 0.24, small: true, pitch: 1.08 }); break;
        case 'chapter': [0, 7, 12].forEach((n, i) => this.bell(NOTE(79 + n), 0.9, { vol: 0.12, at: i * 0.12 })); break;
        case 'click': this.tone(900, 0.05, { vol: 0.14, slideTo: 1300 }); break;
        case 'soft': this.tone(500 * r, 0.16, { vol: 0.1, slideTo: 380 * r }); break;
        case 'talkRight': [0, 4, 7, 12].forEach((n, i) => this.mallet(NOTE(76 + n), 0.3, { vol: 0.22, at: i * 0.08 })); this.woof({ at: 0.3, vol: 0.22, small: true }); break;
        case 'listen': this.tone(NOTE(81), 0.12, { vol: 0.18 }); this.tone(NOTE(88), 0.12, { vol: 0.18, at: 0.1 }); break;
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
      let seed = 4242 + i * 911;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const notes = []; let deg = 4;
      for (let bar = 0; bar < 4; bar++) for (let s = 0; s < 8; s++) {
        // bouncy: a note on most beats, skips up / down, a held note at the end of the phrase
        const rest = (s % 2 === 1 && rnd() < 0.45) || (bar === 3 && s >= 6);
        deg = Math.max(1, Math.min(8, deg + (rnd() < 0.5 ? -1 : 1) * (rnd() < 0.3 ? 2 : 1)));
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
      const bar = Math.floor(step / 8), s = step % 8, chord = m.prog[bar];
      const at = Math.max(0, t - this.ctx.currentTime), D = this.music;
      // oom-pah: bass on 1 and 3, the chord on the off-beats, a little woodblock tick on 2 and 4
      if (s === 0 || s === 4) this.tone(NOTE(m.root - 12 + chord[s === 0 ? 0 : 2] - (s === 4 ? 12 : 0)), eighth * 1.6, { type: 'triangle', vol: 0.24, at, dest: D, attack: 0.006 });
      if (s === 2 || s === 6) chord.forEach(n => this.tone(NOTE(m.root + n), eighth * 0.9, { type: 'triangle', vol: 0.045, at, dest: D, attack: 0.004 }));
      if ((s === 2 || s === 6) && this.mood !== 3) this.noise(0.025, { vol: 0.03, type: 'bandpass', f0: 2200, q: 6, at, attack: 0.001, dest: D });
      const deg = this._phrase[step];
      if (deg != null) {
        const f = NOTE(m.root + 12 + SCALE[deg]);
        if (m.lead === 'uke') this.pluck(f, eighth * 1.5, { vol: 0.12, at, dest: D });
        else if (m.lead === 'bell') this.bell(f * 2, eighth * 3, { vol: 0.05, at, dest: D });
        else this.mallet(f, eighth * 1.6, { vol: 0.12, at, dest: D });
      }
    }
  };
  FP.Audio = A;
})(window.FP = window.FP || {});
