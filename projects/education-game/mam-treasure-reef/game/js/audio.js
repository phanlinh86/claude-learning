/* TR.Audio — every sound is synthesized with WebAudio (no files to license or download).
 * Funny, kid-pleasing SFX (boing, kazoo, slide whistle, bubbles, sand poof), a bouncy generative music loop per time of
 * day, a bubbling ambience, ducking while Tutu speaks, and a LOUD master: gain → compressor (−18 dB, 4:1) → makeup gain,
 * with a user volume 0..1 (default 1). iOS: call unlock() inside the first touchend/click. */
(function (TR) {
  'use strict';
  const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);
  const MUSIC = [
    { root: 60, tempo: 112, prog: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]], lead: 'triangle', swing: true },   // morning: C, waking reef
    { root: 62, tempo: 126, prog: [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]], lead: 'square', swing: true },    // noon: D, bouncy marimba
    { root: 65, tempo: 100, prog: [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [7, 11, 14]], lead: 'triangle', swing: false },  // sunset: F, warm
    { root: 67, tempo: 84, prog: [[0, 4, 7], [-5, -1, 2], [-3, 0, 4], [-7, -3, 0]], lead: 'sine', swing: false }       // night: G music box
  ];
  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

  const A = {
    ctx: null, master: null, user: null, sfx: null, music: null, amb: null, noiseBuf: null,
    sfxOn: true, musicOn: true, muted: false, ducked: false, volume: 1,
    mood: 0, _timer: null, _next: 0, _step: 0, _phrase: null, _playing: false, _bub: null, _lastPlay: {},

    ensure() {
      if (this.ctx) return true;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try { this.ctx = new AC(); } catch (e) { return false; }
      const c = this.ctx;
      // chain: sfx/music/amb → master (mute/duck) → compressor → user volume (+ makeup) → destination
      this.master = c.createGain(); this.master.gain.value = 1;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.18;
      this.user = c.createGain(); this.user.gain.value = this.volume * 1.6;   // makeup: phones are quiet
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
      const mv = this.musicOn && this._playing ? (this.ducked ? 0.07 : 0.22) : 0;
      this.music.gain.setTargetAtTime(mv, t, this.ducked ? 0.08 : 0.5);
      const av = this.sfxOn && this._playing ? (this.ducked ? 0.015 : 0.045) : 0;   // soft bubbling
      this.amb.gain.setTargetAtTime(av, t, 0.8);
    },
    setOptions({ sfx, music, muted, volume }) {
      if (sfx !== undefined) this.sfxOn = sfx;
      if (music !== undefined) this.musicOn = music;
      if (muted !== undefined) this.muted = muted;
      if (volume !== undefined) this.volume = Math.max(0, Math.min(1, +volume || 0));
      this.apply();
    },
    setVolume(v) { this.setOptions({ volume: v }); },
    duck(on) { if (this.ducked !== !!on) { this.ducked = !!on; this.apply(); } },

    tone(freq, dur, { type = 'sine', vol = 0.3, at = 0, slideTo = null, attack = 0.006, dest = null, vib = 0, vibHz = 7 } = {}) {
      const c = this.ctx; if (!c) return;
      const t = c.currentTime + at;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      if (vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = vibHz; lg.gain.value = vib; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.05); }
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest || this.sfx);
      o.start(t); o.stop(t + dur + 0.05);
    },
    noise(dur, { vol = 0.2, at = 0, type = 'bandpass', f0 = 1200, f1 = null, q = 1.2, dest = null } = {}) {
      const c = this.ctx; if (!c) return;
      const t = c.currentTime + at;
      const s = c.createBufferSource(); s.buffer = this.noiseBuf;
      const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
      f.frequency.setValueAtTime(f0, t);
      if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(dest || this.sfx);
      s.start(t, Math.random()); s.stop(t + dur + 0.05);
    },
    kazoo(freq, dur, at = 0, vol = 0.1) {   // saw through a nasal band-pass, with a vibrato wobble
      const c = this.ctx; if (!c) return;
      const t = c.currentTime + at;
      const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(freq, t);
      const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 9; lg.gain.value = freq * 0.03; l.connect(lg); lg.connect(o.frequency);
      f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 2.5;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.03); g.gain.setValueAtTime(vol, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f); f.connect(g); g.connect(this.sfx);
      o.start(t); l.start(t); o.stop(t + dur + 0.05); l.stop(t + dur + 0.05);
    },

    play(name, opt = {}) {
      if (!this.ctx || this.muted || !this.sfxOn) return;
      const now = this.ctx.currentTime;
      if (name === 'appear' && now - (this._lastPlay.appear || 0) < 0.06) return;
      if (name === 'bubble' && now - (this._lastPlay.bubble || 0) < 0.12) return;
      this._lastPlay[name] = now;
      const r = 1 + (Math.random() - 0.5) * 0.08;
      switch (name) {
        case 'appear': this.tone(520 * r, 0.09, { vol: 0.09, slideTo: 880 * r }); break;
        case 'grab': this.tone(NOTE(76) * r, 0.08, { type: 'triangle', vol: 0.14, slideTo: NOTE(83) * r }); break;
        case 'whoosh': this.noise(0.22, { vol: 0.07, f0: 500, f1: 1800, q: 0.8 }); break;
        case 'land':     // treasure drops into the chest: wooden "tok" + a little jingle
          this.tone(240 * r, 0.1, { type: 'triangle', vol: 0.18, slideTo: 140 * r });
          this.noise(0.06, { vol: 0.06, f0: 900, f1: 400, q: 0.8 });
          this.tone(NOTE(88), 0.18, { vol: 0.07, at: 0.05 }); this.tone(NOTE(95), 0.16, { vol: 0.05, at: 0.1 });
          break;
        case 'sparkle': {   // count rounds climb the scale with the count
          const n = opt.count ? SCALE[Math.min(SCALE.length - 1, opt.count - 1)] : 7;
          this.tone(NOTE(72 + n), 0.4, { type: 'triangle', vol: 0.16, at: 0.02 });
          this.tone(NOTE(84 + n), 0.35, { type: 'sine', vol: 0.07, at: 0.06 });
          break;
        }
        case 'dig':      // sand poof + a springy BOING as the treasure pops out
          this.noise(0.28, { vol: 0.16, f0: 600, f1: 180, q: 0.6, type: 'lowpass' });
          this.noise(0.12, { vol: 0.07, f0: 2500, f1: 900, q: 1 });
          this.tone(220 * r, 0.34, { type: 'triangle', vol: 0.16, slideTo: 760 * r, at: 0.06, vib: 18, vibHz: 11 });
          break;
        case 'boing': this.tone(180 * r, 0.3, { type: 'triangle', vol: 0.16, slideTo: 620 * r, vib: 20, vibHz: 12 }); break;
        case 'peek':     // wrong mound: a wobbly "hmm?" slide whistle up and down
          this.tone(500 * r, 0.16, { type: 'sine', vol: 0.11, slideTo: 760 * r });
          this.tone(760 * r, 0.22, { type: 'sine', vol: 0.11, slideTo: 420 * r, at: 0.17 });
          break;
        case 'sink': this.noise(0.2, { vol: 0.08, f0: 500, f1: 150, q: 0.6, type: 'lowpass' }); break;
        case 'crab':     // giggle: three quick kazoo hiccups
          [0, 0.13, 0.26, 0.42].forEach((t, i) => this.kazoo(NOTE(79 + [0, 3, 5, 7][i]) * r, 0.11, t, 0.09));
          this.tone(NOTE(91), 0.3, { type: 'triangle', vol: 0.05, at: 0.55, slideTo: NOTE(96) });
          break;
        case 'photobomb':   // slide whistle swoop + a wet "blub"
          this.tone(380 * r, 0.45, { type: 'sine', vol: 0.12, slideTo: 1200 * r, vib: 10, vibHz: 6 });
          this.tone(180, 0.09, { type: 'sine', vol: 0.12, slideTo: 90, at: 0.5 }); this.noise(0.08, { vol: 0.05, f0: 400, f1: 1500, at: 0.5 });
          break;
        case 'bubble': this.tone(600 * r, 0.07, { vol: 0.05, slideTo: 1500 * r }); break;
        case 'wrong':    // soft "boop-boop", never a buzzer
          this.tone(392, 0.12, { vol: 0.11 }); this.tone(330, 0.18, { vol: 0.11, at: 0.13 });
          break;
        case 'miss': this.tone(500 * r, 0.25, { vol: 0.07, slideTo: 300 * r }); break;
        case 'hint': [0, 4, 7, 12].forEach((n, i) => this.tone(NOTE(88 + n), 0.2, { vol: 0.06, at: i * 0.07 })); break;
        case 'star': this.tone(NOTE(84 + (opt.i || 0) * 4), 0.35, { type: 'triangle', vol: 0.15 }); this.tone(NOTE(96 + (opt.i || 0) * 4), 0.3, { vol: 0.06, at: 0.03 }); break;
        case 'pearl': this.tone(NOTE(96) * r, 0.12, { vol: 0.06, slideTo: NOTE(103) * r }); break;
        case 'round': [0, 4, 7, 12].forEach((n, i) => this.tone(NOTE(72 + n), 0.3, { type: 'triangle', vol: 0.14, at: i * 0.09 })); break;
        case 'level': {  // chapter done: a fast 2-bar dance tune (kazoo lead + bass) for Tutu's wiggle
          const mel = [0, 4, 7, 4, 9, 7, 4, 0, 5, 9, 12, 9, 7, 4, 0, 0], st = 0.11;
          mel.forEach((n, i) => { this.kazoo(NOTE(72 + n), st * 0.9, i * st, 0.07); if (i % 2 === 0) this.tone(NOTE(48 + [0, 0, 5, 7][Math.floor(i / 4)]), st * 1.6, { type: 'triangle', vol: 0.14, at: i * st }); });
          break;
        }
        case 'fanfare':
          [[0, 0], [4, .14], [7, .28], [12, .42], [7, .62], [12, .76], [16, .9], [19, 1.08], [24, 1.3]].forEach(([n, t]) => {
            this.tone(NOTE(72 + n), 0.42, { type: 'square', vol: 0.06, at: t }); this.tone(NOTE(60 + n), 0.42, { type: 'triangle', vol: 0.12, at: t });
          });
          this.noise(0.6, { vol: 0.08, f0: 3000, f1: 800, at: 1.3 });
          break;
        case 'chapter': [0, 7, 12].forEach((n, i) => this.tone(NOTE(79 + n), 0.8, { vol: 0.09, at: i * 0.12 })); break;
        case 'pop': this.tone(1400 * r, 0.05, { vol: 0.08, slideTo: 2200 * r }); this.noise(0.08, { vol: 0.06, f0: 2500, f1: 5000, q: 1.2 }); break;
        case 'bounce': this.tone(260 * r, 0.18, { vol: 0.08, slideTo: 420 * r }); break;
        case 'hop': this.tone(330 * r, 0.16, { vol: 0.08, slideTo: 620 * r, type: 'triangle' }); break;
        case 'click': this.tone(900, 0.05, { vol: 0.09, slideTo: 1300 }); break;
        case 'unlock': [0, 5, 9, 12, 16].forEach((n, i) => this.tone(NOTE(76 + n), 0.3, { type: 'triangle', vol: 0.12, at: i * 0.09 })); this.noise(0.4, { vol: 0.05, f0: 2000, f1: 6000, at: 0.4 }); break;
        case 'talkRight': [0, 4, 7, 12].forEach((n, i) => this.tone(NOTE(76 + n), 0.3, { type: 'triangle', vol: 0.15, at: i * 0.08 })); break;
        case 'listen': this.tone(NOTE(81), 0.12, { vol: 0.11 }); this.tone(NOTE(88), 0.12, { vol: 0.11, at: 0.1 }); break;
      }
    },

    setMood(i) {
      i = ((i % 4) + 4) % 4;
      if (i === this.mood && this._phrase) return;
      this.mood = i;
      this._phrase = this._makePhrase(i);
      this._ensureBubbles();
      this.apply();
    },
    _makePhrase(i) {
      let seed = 4242 + i * 811;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const notes = []; let deg = 4;
      for (let bar = 0; bar < 4; bar++) for (let s = 0; s < 8; s++) {
        const rest = (s % 2 === 1 && rnd() < 0.45) || (bar === 3 && s >= 6);
        deg = Math.max(1, Math.min(8, deg + Math.round((rnd() - 0.5) * 3)));
        notes.push(rest ? null : deg);
      }
      return notes;
    },
    _ensureBubbles() {   // bubbling ambience: filtered noise + random little blips
      if (!this.ctx || this._bub) return;
      const c = this.ctx;
      const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.5;
      s.connect(f); f.connect(this.amb); s.start();
      this._bub = s;
    },
    startMusic() {
      if (!this.ensure()) return;
      if (!this._phrase) this._phrase = this._makePhrase(this.mood);
      this._ensureBubbles();
      this._playing = true;
      if (!this._timer) { this._next = this.ctx.currentTime + 0.15; this._step = 0; this._timer = setInterval(() => this._schedule(), 40); }
      this.apply();
    },
    stopMusic() {
      this._playing = false;
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
      this.apply();
    },
    _schedule() {
      const c = this.ctx; if (!c) return;
      if (c.state !== 'running') { this._next = c.currentTime + 0.1; return; }
      const m = MUSIC[this.mood];
      const eighth = 60 / m.tempo / 2;
      while (this._next < c.currentTime + 0.2) {
        this._playStep(this._step, this._next, m, eighth);
        this._next += eighth * (m.swing ? (this._step % 2 ? 0.86 : 1.14) : 1);
        this._step = (this._step + 1) % 32;
      }
    },
    _playStep(step, t, m, eighth) {
      if (!this.musicOn) return;
      const bar = Math.floor(step / 8), s = step % 8, chord = m.prog[bar];
      const at = Math.max(0, t - this.ctx.currentTime);
      if (s === 0 || s === 4) this.tone(NOTE(m.root - 12 + chord[0]), eighth * 3, { vol: 0.3, at, dest: this.music, attack: 0.01 });
      if (s === 2 || s === 6) chord.forEach(n => this.tone(NOTE(m.root + n), eighth * 1.6, { vol: 0.06, at, dest: this.music, attack: 0.01 }));
      if (m.swing && (s === 3 || s === 7)) this.noise(0.05, { vol: 0.03, f0: 4000, f1: 2500, at, dest: this.music });   // tiny shaker
      const deg = this._phrase[step];
      if (deg != null) this.tone(NOTE(m.root + 12 + SCALE[deg]), eighth * 1.8, { type: m.lead, vol: m.lead === 'square' ? 0.05 : 0.11, at, dest: this.music, attack: 0.01 });
      if (this.mood !== 3 && Math.random() < 0.06) this.tone(600 + Math.random() * 400, 0.06, { vol: 0.02, slideTo: 1800, at, dest: this.amb });   // random bubble blip
    }
  };
  TR.Audio = A;
})(window.TR = window.TR || {});
