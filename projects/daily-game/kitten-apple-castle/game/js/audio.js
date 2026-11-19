/* AC.Audio — every sound is synthesized with WebAudio (no audio files, nothing to license).
 * SFX (DESIGN §8): drop whoop, wooden crate thunk, perfect clunk-ding rising with combo + a lantern bloom chime, apple
 * crunch-pling (brighter for glow apples), pie oven-ding fanfare, Granny Boo's friendly "woo-hoo"; plus a cosy generative
 * castle tune per time of day (dawn music box + birds, noon marimba, sunset accordion pad, night celesta lullaby + owl),
 * scheduled a little ahead with a lookahead timer and crossfaded on level change. Unlocks on the first gesture (iOS). */
(function (AC) {
  'use strict';
  const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);
  // per time of day: root (MIDI), bar chords (semitones), tempo, beats per bar, lead wave, extras
  const ZONE_MUSIC = [
    { root: 67, prog: [[0, 4, 7], [5, 9, 12], [-3, 0, 4], [-5, -1, 2]], bpm: 88, beats: 3, lead: 'sine', bell: true, birds: true },          // Dawn: music-box waltz, G
    { root: 65, prog: [[0, 4, 7], [5, 9, 12], [-2, 2, 5], [7, 11, 14]], bpm: 112, beats: 4, lead: 'triangle', plink: true, pluck: true },   // Noon: bouncy marimba, F
    { root: 62, prog: [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [7, 11, 14]], bpm: 92, beats: 4, lead: 'triangle', accordion: true },            // Sunset: warm accordion pad, D
    { root: 64, prog: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]], bpm: 76, beats: 3, lead: 'sine', bell: true, owl: true }           // Night: celesta lullaby, E
  ];
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];

  const A = {
    ctx: null, master: null, sfx: null, music: null, noiseBuf: null,
    sfxOn: true, musicOn: true, muted: false, zone: 0, loop: 0, _musicPlaying: false,

    ensure() {
      if (this.ctx) return true;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try { this.ctx = new AC(); } catch (e) { return false; }
      const c = this.ctx;
      this.master = c.createGain(); this.master.gain.value = 1;
      const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
      // phones are quiet: compressor (−18 dB, knee 12, 4:1) then a make-up gain = the player's volume × 1.7
      comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.18;
      this.user = c.createGain(); this.user.gain.value = (this.volume == null ? 1 : this.volume) * 1.7;
      this.master.connect(comp); comp.connect(this.user); this.user.connect(c.destination);
      this.sfx = c.createGain(); this.sfx.gain.value = 0.8; this.sfx.connect(this.master);
      this.music = c.createGain(); this.music.gain.value = 0; this.music.connect(this.master);
      const len = c.sampleRate;
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applyMute();
      return true;
    },
    /* the player's volume 0..1 (Settings slider), applied after the compressor */
    setVolume(v) {
      this.volume = Math.max(0, Math.min(1, +v || 0));
      if (this.user && this.ctx) this.user.gain.setTargetAtTime(this.volume * 1.7, this.ctx.currentTime, 0.03);
    },
    /* iOS Safari: Web Audio defaults to the quiet 'ambient' channel that the side switch silences; ask for 'playback'
     * (Safari 16.4+) and play a silent buffer inside the gesture so the output really wakes up. */
    _iosKick() {
      try { if (navigator.audioSession && navigator.audioSession.type !== 'playback' && navigator.audioSession.type !== 'play-and-record') navigator.audioSession.type = 'playback'; } catch (e) { /* older Safari */ }
      if (!this.ensure()) return;
      if (this.ctx.state !== 'running' && !this._hidden) this.ctx.resume().catch(() => {});
      if (!this._kicked) { try { const b = this.ctx.createBuffer(1, 1, 22050), s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.ctx.destination); s.start(0); this._kicked = true; } catch (e) { /* ignore */ } }
    },
    unlock() {
      this._iosKick();
      if (!this.ensure()) return;
      const c = this.ctx;
      if (c.state !== 'running' && !this._hidden) c.resume().catch(() => {});
      if (!this._silentDone || c.state !== 'running') {
        try { const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); this._silentDone = true; } catch (e) {}
      }
    },
    suspend() { this._hidden = true; if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); },
    resume() { this._hidden = false; if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); },
    applyMute() {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.master.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.03);
      this.sfx.gain.setTargetAtTime(this.sfxOn ? 0.8 : 0, t, 0.03);
      this.music.gain.setTargetAtTime(this.musicOn && this._musicPlaying ? 0.3 : 0, t, 0.2);
    },
    setOptions({ sfx, music, muted }) {
      if (sfx !== undefined) this.sfxOn = sfx;
      if (music !== undefined) this.musicOn = music;
      if (muted !== undefined) this.muted = muted;
      this.applyMute();
    },
    running() { return this.ctx && this.ctx.state === 'running'; },

    // ---------- primitives ----------
    tone(freq, dur, { type = 'sine', vol = 0.3, at = 0, slideTo = null, attack = 0.005, dest = null, when = null } = {}) {
      const c = this.ctx; if (!c) return;
      const t = when != null ? when : c.currentTime + at;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(dest || this.sfx);
      o.start(t); o.stop(t + dur + 0.05);
    },
    noise(dur, { vol = 0.2, at = 0, freq = 1200, q = 1, type = 'bandpass', slideTo = null, dest = null } = {}) {
      const c = this.ctx; if (!c) return;
      const t = c.currentTime + at;
      const s = c.createBufferSource(); s.buffer = this.noiseBuf;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
      if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(dest || this.sfx);
      s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
    },

    play(name, o = {}) {
      if (!this.ctx || this.muted || !this.sfxOn || !this.running()) return;
      const T = (f, d, p) => this.tone(f, d, p);
      switch (name) {
        case 'click': T(880, 0.06, { type: 'triangle', vol: 0.18 }); break;
        case 'start': [0, 4, 7, 12].forEach((s, i) => T(NOTE(72 + s), 0.18, { type: 'triangle', vol: 0.2, at: i * 0.07 })); break;
        case 'spawn': T(NOTE(91), 0.08, { type: 'sine', vol: 0.04 }); break;
        case 'drop': this.noise(0.2, { vol: 0.09, freq: 1800, slideTo: 500, q: 0.8 }); T(880, 0.16, { type: 'sine', vol: 0.08, slideTo: 330 }); break;
        case 'land': {   // a wooden crate thunk: heavier with speed
          const v = Math.min(1, (o.speed || 600) / 1200);
          T(110 + 45 * (1 - v), 0.16, { type: 'sine', vol: 0.12 + 0.16 * v, slideTo: 58 });
          this.noise(0.07, { vol: 0.06 + 0.08 * v, freq: 420, q: 1.4 });
          this.noise(0.04, { vol: 0.04, freq: 1800, q: 2, at: 0.01 }); break;   // the plank "tock"
        }
        case 'perfect': {   // clunk-ding: pitch rises with combo
          const n = 76 + Math.min(8, o.combo || 1) * 2;
          T(NOTE(n), 0.35, { type: 'triangle', vol: 0.18, at: 0.03 });
          T(NOTE(n + 7), 0.4, { type: 'sine', vol: 0.12, at: 0.08 });
          if ((o.combo || 0) >= 3) T(NOTE(n + 12), 0.4, { type: 'sine', vol: 0.09, at: 0.13 });
          break;
        }
        case 'lantern': {   // a soft "bloom": a warm swell and two glassy chimes
          T(NOTE(79), 0.7, { type: 'sine', vol: 0.06, at: 0.16, attack: 0.12 });
          T(NOTE(88), 0.5, { type: 'sine', vol: 0.05, at: 0.24 });
          T(NOTE(95), 0.45, { type: 'sine', vol: 0.035, at: 0.3 });
          break;
        }
        case 'edge': T(330, 0.25, { type: 'triangle', vol: 0.07, slideTo: 300 }); T(300, 0.25, { type: 'triangle', vol: 0.06, at: 0.18, slideTo: 340 }); break;   // wobble creak
        case 'miss': T(520, 0.45, { type: 'sine', vol: 0.16, slideTo: 140 }); T(NOTE(64), 0.15, { type: 'triangle', vol: 0.08, at: 0.45 }); T(NOTE(60), 0.25, { type: 'triangle', vol: 0.08, at: 0.6 }); break;   // boing-tumble + "oh-oh"
        case 'topple': for (let i = 0; i < 4; i++) { T(140 - i * 12, 0.12, { type: 'sine', vol: 0.1, at: i * 0.11, slideTo: 70 }); this.noise(0.06, { vol: 0.05, freq: 600, at: i * 0.11 }); } break;
        case 'heartLost': T(NOTE(69), 0.18, { type: 'sine', vol: 0.1 }); T(NOTE(65), 0.3, { type: 'sine', vol: 0.1, at: 0.16 }); break;
        case 'apple': {   // crunch + pling; a glow apple adds a bright sparkle on top
          const n = 84 + ((o.total || 0) % 5);
          this.noise(0.06, { vol: 0.08, freq: 2600, q: 1.5 });
          T(NOTE(n), 0.16, { type: 'triangle', vol: 0.12, at: 0.04 });
          T(NOTE(n + 7), 0.22, { type: 'sine', vol: 0.1, at: 0.09 });
          if (o.glow) { T(NOTE(n + 19), 0.3, { type: 'sine', vol: 0.07, at: 0.14 }); T(NOTE(n + 24), 0.35, { type: 'sine', vol: 0.05, at: 0.2 }); }
          break;
        }
        case 'pie': {   // the oven "ding!" then a happy little fanfare
          T(NOTE(96), 0.6, { type: 'sine', vol: 0.12 }); T(NOTE(103), 0.5, { type: 'sine', vol: 0.05, at: 0.01 });
          [0, 4, 7, 12, 16].forEach((s, i) => T(NOTE(72 + s), 0.18, { type: 'triangle', vol: 0.14, at: 0.3 + i * 0.07 }));
          if (o.gained) T(NOTE(91), 0.4, { type: 'sine', vol: 0.08, at: 0.68 });
          break;
        }
        case 'ghost': {   // Granny Boo's friendly "woo-hoo": two soft vibrato glides
          const c = this.ctx, t = c.currentTime;
          [[0, 520, 700, 0.42], [0.5, 640, 900, 0.5]].forEach(([at, f0, f1, d]) => {
            const o1 = c.createOscillator(), g1 = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
            o1.type = 'sine'; o1.frequency.setValueAtTime(f0, t + at); o1.frequency.exponentialRampToValueAtTime(f1, t + at + d * 0.6); o1.frequency.exponentialRampToValueAtTime(f0 * 0.9, t + at + d);
            lfo.frequency.value = 6; lg.gain.value = 14; lfo.connect(lg); lg.connect(o1.frequency);
            g1.gain.setValueAtTime(0.0001, t + at); g1.gain.exponentialRampToValueAtTime(0.11, t + at + 0.08); g1.gain.exponentialRampToValueAtTime(0.0001, t + at + d);
            o1.connect(g1); g1.connect(this.sfx); o1.start(t + at); lfo.start(t + at); o1.stop(t + at + d + 0.05); lfo.stop(t + at + d + 0.05);
          });
          break;
        }
        case 'combo': { const c = Math.min(8, o.combo || 2); [0, 4, 7].forEach((s, i) => T(NOTE(84 + c + s), 0.12, { type: 'sine', vol: 0.06, at: 0.25 + i * 0.05 })); break; }
        case 'goal': [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => T(NOTE(72 + s), 0.3, { type: 'triangle', vol: 0.16, at: i * 0.08 })); break;
        case 'level': [0, 4, 7, 12, 7, 12, 16].forEach((s, i) => T(NOTE(72 + s), 0.24, { type: 'triangle', vol: 0.18, at: i * 0.1 })); break;
        case 'over': [12, 7, 4, 0].forEach((s, i) => T(NOTE(67 + s), 0.4, { type: 'sine', vol: 0.18, at: i * 0.2 })); break;
        case 'best': [0, 4, 7, 12, 16].forEach((s, i) => T(NOTE(84 + s), 0.3, { type: 'triangle', vol: 0.16, at: 0.6 + i * 0.08 })); break;
      }
    },

    // ---------- music ----------
    setLevel(zone, loop) {
      const z = ((zone || 0) % 4 + 4) % 4;
      if (z !== this.zone && this.ctx && this._musicPlaying && this.musicOn) {   // crossfade: dip, switch, swell back
        const t = this.ctx.currentTime, gn = this.music.gain;
        gn.cancelScheduledValues(t); gn.setValueAtTime(gn.value, t); gn.linearRampToValueAtTime(0.02, t + 0.45); gn.linearRampToValueAtTime(0.3, t + 1.6);
      }
      this.zone = z; this.loop = loop || 0;
    },
    startMusic() {
      if (!this.ensure()) return;
      this._musicPlaying = true; this.applyMute();
      if (this._timer) return;
      this._next = null; this._beat = 0;
      this._timer = setInterval(() => this._schedule(), 90);
    },
    stopMusic() {
      this._musicPlaying = false; this.applyMute();
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
    },
    _schedule() {
      const c = this.ctx; if (!c || !this._musicPlaying || c.state !== 'running') { this._next = null; return; }
      const m = ZONE_MUSIC[this.zone], spb = 60 / (m.bpm * (1 + Math.min(0.2, this.loop * 0.05)));
      if (this._next == null || this._next < c.currentTime) this._next = c.currentTime + 0.08;
      while (this._next < c.currentTime + 0.4) {
        const t = this._next, b = this._beat, bar = Math.floor(b / m.beats), inBar = b % m.beats;
        const chord = m.prog[bar % m.prog.length];
        if (inBar === 0) {   // soft pad: chord tones
          chord.forEach(s => this.tone(NOTE(m.root - 12 + s), spb * m.beats * 0.95, { type: 'sine', vol: 0.05, attack: 0.25, dest: this.music, when: t }));
          this.tone(NOTE(m.root - 24 + chord[0]), spb * 2, { type: 'triangle', vol: 0.09, attack: 0.02, dest: this.music, when: t });
        }
        if (m.plink && inBar === 2) this.tone(NOTE(m.root + 24 + chord[1]), 0.12, { type: 'sine', vol: 0.03, dest: this.music, when: t + spb / 2 });
        if (m.beats === 6 && inBar === 3) this.tone(NOTE(m.root - 24 + chord[0]), spb * 2, { type: 'triangle', vol: 0.07, dest: this.music, when: t });
        // music-box melody: a deterministic but varied walk on the pentatonic scale
        const h = Math.sin(b * 12.9898 + this.zone * 78.233) * 43758.5453, r = h - Math.floor(h);
        if (r < 0.62 || inBar === 0) {
          const s = PENTA[Math.floor(r * 997) % PENTA.length];
          this.tone(NOTE(m.root + 12 + s), spb * 1.4, { type: m.lead, vol: 0.07, dest: this.music, when: t });
        }
        if (m.bell && r > 0.8) this.tone(NOTE(m.root + 31), spb * 2, { type: 'sine', vol: 0.03, dest: this.music, when: t + spb / 2 });
        if (m.pluck && inBar % 2 === 1) this.tone(NOTE(m.root - 12 + chord[2]), 0.09, { type: 'triangle', vol: 0.05, dest: this.music, when: t });   // pizzicato off-beats
        if (m.accordion && inBar === 0) chord.forEach(s => this.tone(NOTE(m.root + s), spb * m.beats * 0.9, { type: 'sawtooth', vol: 0.012, attack: 0.3, dest: this.music, when: t }));
        if (m.birds && b % 16 === 9) for (let i = 0; i < 3; i++) this.tone(NOTE(98 + (i % 2) * 3), 0.07, { type: 'sine', vol: 0.025, slideTo: NOTE(101), dest: this.music, when: t + i * 0.11 });
        if (m.owl && b % 24 === 13) { this.tone(NOTE(62), 0.32, { type: 'sine', vol: 0.05, slideTo: NOTE(60), attack: 0.05, dest: this.music, when: t }); this.tone(NOTE(62), 0.5, { type: 'sine', vol: 0.05, slideTo: NOTE(59), attack: 0.05, dest: this.music, when: t + 0.42 }); }
        this._next += spb; this._beat++;
      }
    }
  };
  AC.Audio = A;
})(window.AC = window.AC || {});
