/* OD.Audio — every sound is synthesized with WebAudio (no audio files, nothing to license).
 * SFX for lane zips, jumps (pitch follows the biome's gravity), wooden acorn "toks" (climbing with the streak), bumps,
 * bouncy balls and the gravity change; a soft toy-box loop per biome (music box, celesta waltz, xylophone, lullaby bells)
 * over a little woodblock tick (DESIGN §7), scheduled ahead with a lookahead timer.
 * Unlocks on the first user gesture (iOS). */
(function (OD) {
  'use strict';
  const NOTE = n => 440 * Math.pow(2, (n - 69) / 12);
  // per biome: root (MIDI), bar chords (semitones), tempo, beats per bar, lead wave, extras (DESIGN §7)
  const ZONE_MUSIC = [
    { root: 72, prog: [[0, 4, 7], [5, 9, 12], [-3, 0, 4], [7, 11, 14]], bpm: 96, beats: 4, lead: 'sine', bell: true, plink: true }, // Felt Meadow: music box + glockenspiel, C
    { root: 70, prog: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]], bpm: 84, beats: 3, lead: 'sine', bell: true, plink: true }, // Pillow Mountains: soft celesta waltz, Bb
    { root: 67, prog: [[0, 4, 7], [-2, 2, 5], [5, 9, 12], [7, 11, 14]], bpm: 108, beats: 4, lead: 'triangle', bounce: true, wood: true }, // Crayon Jungle: xylophone + woodblock, G
    { root: 69, prog: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -2, 2]], bpm: 76, beats: 3, lead: 'sine', bell: true, plink: true }  // Glow-Star Galaxy: lullaby bells in 3/4, A minor
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
        case 'lane': T(o.dir > 0 ? 520 : 460, 0.09, { type: 'triangle', vol: 0.05, slideTo: o.dir > 0 ? 760 : 320 }); this.noise(0.08, { vol: 0.04, freq: o.dir > 0 ? 1800 : 1300, slideTo: o.dir > 0 ? 3000 : 900, q: 1.5 }); break;   // zip
        case 'jump': { const k = Math.pow(o.gk || 1, 0.5), d = 0.22 / k; T(260 * k, d, { type: 'sine', vol: 0.12, slideTo: 720 * k }); T(390 * k, d * 0.75, { type: 'triangle', vol: 0.04, at: 0.03, slideTo: 980 * k }); break; }   // springy boing: lower and longer when floaty
        case 'land': T(140, 0.1, { type: 'sine', vol: 0.1, slideTo: 70 }); this.noise(0.07, { vol: 0.04, freq: 500, q: 0.8 }); break;   // soft thup on the rug
        case 'acorn': { const c = Math.min(7, Math.max(0, (o.combo || 1) - 1)) % 8; const n = 84 + PENTA[c]; T(NOTE(n - 12) * 1.5, 0.05, { type: 'square', vol: 0.025 }); T(NOTE(n), 0.16, { type: 'sine', vol: 0.09, at: 0.01 }); T(NOTE(n + 12), 0.1, { type: 'triangle', vol: 0.03, at: 0.02 }); break; }   // wooden tok + bell, climbing the scale with the streak
        case 'combo': { const c = Math.min(6, Math.floor((o.combo || 10) / 10)); [0, 4, 7, 12].forEach((s, i) => T(NOTE(79 + c * 2 + s), 0.12, { type: 'triangle', vol: 0.08, at: 0.08 + i * 0.05 })); break; }
        case 'bump': T(330, 0.26, { type: 'sine', vol: 0.15, slideTo: 140 }); T(200, 0.22, { type: 'triangle', vol: 0.06, at: 0.1, slideTo: 440 }); this.noise(0.08, { vol: 0.06, freq: 700 }); break;   // bonk-boing
        case 'ball': { const v = 0.07 * (1 - 0.6 * (o.far || 0)); T(240, 0.1, { type: 'sine', vol: v, slideTo: 420 }); T(160, 0.08, { type: 'sine', vol: v * 0.5, slideTo: 90 }); break; }   // bwop
        case 'gravity': { const up = !!o.up; this.noise(0.5, { vol: 0.05, freq: up ? 500 : 1800, slideTo: up ? 1800 : 500, q: 1.1 });
          for (let i = 0; i < 6; i++) T(NOTE((up ? 64 : 76) + (up ? i : -i) * 2), 0.09, { type: 'sine', vol: 0.06, at: i * 0.06 }); break; }   // wobble-whoosh: slides down for floaty, up for heavy
        case 'heartLost': T(NOTE(69), 0.18, { type: 'sine', vol: 0.1 }); T(NOTE(65), 0.3, { type: 'sine', vol: 0.1, at: 0.16 }); break;
        case 'heartGain': [0, 4, 7].forEach((s, i) => T(NOTE(79 + s), 0.18, { type: 'sine', vol: 0.1, at: 0.4 + i * 0.07 })); break;
        case 'level': this.noise(0.45, { vol: 0.07, freq: 2500, slideTo: 900, q: 0.6 }); [0, 4, 7, 12, 7, 12, 16].forEach((s, i) => T(NOTE(72 + s), 0.24, { type: 'triangle', vol: 0.18, at: 0.3 + i * 0.1 })); break;
        case 'over': [12, 7, 4, 0].forEach((s, i) => T(NOTE(67 + s), 0.4, { type: 'sine', vol: 0.18, at: i * 0.2 })); break;
        case 'best': [0, 4, 7, 12, 16].forEach((s, i) => T(NOTE(84 + s), 0.3, { type: 'triangle', vol: 0.16, at: 0.6 + i * 0.08 })); break;
      }
    },

    // ---------- music ----------
    setLevel(zone, loop) { this.zone = ((zone || 0) % 4 + 4) % 4; this.loop = loop || 0; },
    _rainBed() {   // a very quiet, looping room-hush noise under the music
      const c = this.ctx; if (!c || this._rain) return;
      const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.5;
      const g = c.createGain(); g.gain.value = 0.02;
      s.connect(f); f.connect(g); g.connect(this.music); s.start();
      this._rain = s;
    },
    startMusic() {
      if (!this.ensure()) return;
      this._rainBed();
      this._musicPlaying = true; this.applyMute();
      if (this._timer) return;
      this._next = null; this._beat = 0;
      this._timer = setInterval(() => this._schedule(), 90);
    },
    stopMusic() {
      this._musicPlaying = false; this.applyMute();
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
    },
    _tek(t, vol) {
      const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noiseBuf;
      const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3200;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      s.connect(f); f.connect(g); g.connect(this.music); s.start(t, Math.random() * 0.5); s.stop(t + 0.1);
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
        // soft toy drum: "dum" on 1, a woodblock tick on the off-beats
        if (inBar === 0) { this.tone(95, 0.22, { type: 'sine', vol: 0.12, slideTo: 60, dest: this.music, when: t }); }
        else if (m.beats === 4 && inBar === 2) this.tone(110, 0.16, { type: 'sine', vol: 0.07, slideTo: 70, dest: this.music, when: t });
        this._tek(t + spb / 2, inBar === m.beats - 1 ? 0.05 : 0.03);
        if (m.wood) this.tone(NOTE(m.root + 24 + chord[(inBar + 1) % 3]), 0.06, { type: 'square', vol: 0.012, dest: this.music, when: t + spb * 0.75 });
        if (m.bounce) { this.tone(NOTE(m.root - 12 + chord[inBar % 3]), spb * 0.35, { type: 'triangle', vol: 0.04, dest: this.music, when: t + spb / 2 }); }
        if (m.plink && inBar === 2) this.tone(NOTE(m.root + 24 + chord[1]), 0.12, { type: 'sine', vol: 0.03, dest: this.music, when: t + spb / 2 });
        if (m.beats === 6 && inBar === 3) this.tone(NOTE(m.root - 24 + chord[0]), spb * 2, { type: 'triangle', vol: 0.07, dest: this.music, when: t });
        // music-box melody: a deterministic but varied walk on the pentatonic scale
        const h = Math.sin(b * 12.9898 + this.zone * 78.233) * 43758.5453, r = h - Math.floor(h);
        if (r < 0.62 || inBar === 0) {
          const s = PENTA[Math.floor(r * 997) % PENTA.length];
          this.tone(NOTE(m.root + 12 + s), spb * 1.4, { type: m.lead, vol: 0.07, dest: this.music, when: t });
        }
        if (m.bell && r > 0.8) this.tone(NOTE(m.root + 31), spb * 2, { type: 'sine', vol: 0.03, dest: this.music, when: t + spb / 2 });
        this._next += spb; this._beat++;
      }
    }
  };
  OD.Audio = A;
})(window.OD = window.OD || {});
