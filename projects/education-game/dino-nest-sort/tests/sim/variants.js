// Proposed changes, expressed WITHOUT editing game code:
//   config      → passed to new DN.World({ config })            (pure DN.CONFIG overrides)
//   patch(DN)   → monkey-patches inside the sim sandbox only     (stand-in for a small code change, see report)
//   hooks       → per-session hooks used by lib.runSession       (stand-in for a flow change)
//   speechPolicy→ flags for lib.SpeechModel                       (stand-in for a main.js speech-policy change)
'use strict';

const PACE = { roundsPerLevel: 4, roundDoneTime: 1.7, leaveDelay: 1.0, levelDoneTime: 2.0 };
const TOUCH = { nestPadSide: 45, playNestGap: 44 };

const patches = {
  // A tap is not a drop: if the FINGER travelled < 24 px from where it went down and the hold was < 0.35 s,
  // the item just settles back — no 'miss' event, no misses++ → no "Oops!" line and no auto-hint for a kid who
  // taps an item to hear its name. (A quick flick still counts: the finger travels.)
  tapGuard(DN) {
    const P = DN.World.prototype, down = P.pointerDown, drop = P._drop;
    P.pointerDown = function (x, y) { const id = down.call(this, x, y); if (id) { this._downX = x; this._downY = y; } return id; };
    P._drop = function (it, fx, fy) {
      if (Math.hypot(fx - this._downX, fy - this._downY) < 24 && it.t < 0.35) { this._emit({ type: 'drop', id: it.id, basketId: null }); this._planReturn(it, 'miss'); return; }
      return drop.call(this, it, fx, fy);
    };
  },
  // Chapter order easy → hard (content.js DN.AGE_TOPICS); measured chapter difficulty in the report.
  reorder(DN) {
    DN.AGE_TOPICS[4] = ['colors', 'count', 'shapes', 'homes'];
    DN.AGE_TOPICS[5] = ['count', 'letters', 'shapes', 'homes'];
    DN.AGE_TOPICS[6] = ['count', 'initial', 'lower', 'add'];
    DN.AGE_TOPICS[7] = ['initial', 'add', 'sub', 'oddeven'];
  },
  // Auto-hint at most once per 6 s and never while the same nest is still glowing.
  hintCooldown(DN) {
    const P = DN.World.prototype;
    P._autoHint = function (it) {
      if (it.misses < this.cfg.hintAfterMisses) return;
      const b = this.basketById(it.answer);
      if (!b || b._glowT > 0 || (this._lastHintT !== undefined && this.time - this._lastHintT < 6)) return;
      this._lastHintT = this.time; this._glow(b);
    };
  },
  // Idle nudges back off: 12 s, 18 s, 27 s, then every 30 s; any grab resets to 12 s.
  idleBackoff(DN) {
    const P = DN.World.prototype, orig = P._emit;
    P._emit = function (e) {
      if (e.type === 'idle') this.cfg.idleTime = Math.min(30, this.cfg.idleTime * 1.5);
      else if (e.type === 'grab' || e.type === 'round') this.cfg.idleTime = DN.CONFIG.idleTime;
      return orig.call(this, e);
    };
  }
};

// Chapter time-box: after ≥ 3 rounds, a chapter goes to Talk time once it has run > 75 s (slow kids get
// 3 rounds, quick kids keep the full roundsPerLevel). Stand-in for a ~5-line change in World._step('roundDone').
const timeboxHooks = {
  onEvent(e, w, ch) {
    if (e.type === 'level') w.roundsPerLevel = w.cfg.roundsPerLevel;
    if (e.type === 'roundDone' && ch && w.round >= 2 && w.time - ch.start > 75) w.roundsPerLevel = Math.min(w.roundsPerLevel, w.round + 1);
  }
};

const VARIANTS = {
  baseline: {},
  padSide45: { config: { nestPadSide: 45 } },
  gap44: { config: { playNestGap: 44 } },
  touch: { config: TOUCH },
  tapGuard: { patch: ['tapGuard'] },
  hintCooldown: { patch: ['hintCooldown'] },
  idleBackoff: { patch: ['idleBackoff'] },
  rounds4: { config: { roundsPerLevel: 4 } },
  pace: { config: PACE },
  timebox: { config: PACE, hooks: 'timebox' },
  reorder: { patch: ['reorder'] },
  speech: { speechPolicy: { countFinal: true, greatQueued: true, praiseThrottle: 1.2, hintOnce: true } },
  recommended: {
    config: Object.assign({}, PACE, TOUCH),
    patch: ['tapGuard', 'hintCooldown', 'idleBackoff'], hooks: 'timebox',
    speechPolicy: { countFinal: true, greatQueued: true, praiseThrottle: 1.2, hintOnce: true }
  }
};

let applied = null;
function apply(name, DN) {
  if (applied === name) return VARIANTS[name];
  if (applied && applied !== name) throw new Error('variant already applied in this process: ' + applied);
  const v = VARIANTS[name]; if (!v) throw new Error('unknown variant ' + name);
  for (const p of v.patch || []) patches[p](DN);
  applied = name; return v;
}
const HOOKS = { timebox: timeboxHooks };
module.exports = { VARIANTS, apply, PACE, TOUCH, HOOKS };
