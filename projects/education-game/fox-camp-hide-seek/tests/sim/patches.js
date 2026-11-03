// Pip's Camp Hide & Seek — candidate CODE changes, applied to the loaded FC in the sim process only (never to game/js), so the
// playtest can measure a proposal before the team adopts it.   --patch realTap,noRepeat  (hs_extra.js / hs_playtest.js)
//   realTap  : a tap on an already-found (empty) place or on Pip no longer resets the idle clock (world.js pointerDown:
//              call this._touch() only for a peek / the squirrel). Pip still repeats the prompt; the idle nudge + hint still come.
//   emptyHint: like realTap, and the 3rd empty/Pip tap in one ask glows the answer (this._doHint(true)).
//   noRepeat : a round's FIRST ask never repeats the previous round's LAST ask (same promptKey + params), except p.countUp
//              (content.js makeRound: o.avoid → reject the attempt; world.js passes its last ask).
'use strict';
function apply(FC, names) {
  names = (names || '').split(',').filter(Boolean);
  const P = FC.World.prototype;
  if (names.includes('realTap') || names.includes('emptyHint')) {
    const hintToo = names.includes('emptyHint'), down = P.pointerDown;
    P.pointerDown = function (x, y) {
      const t = this._idleT, g = this._idleGap, ask = this.ask, ph = this.phase;
      const r = down.call(this, x, y);
      if ((r === 'empty' || r === 'pip') && ph === 'ask') {
        this._idleT = t; this._idleGap = g;
        if (hintToo) { const k = this.round + ':' + ask; if (this._softKey !== k) { this._softKey = k; this._soft = 0; } if (++this._soft === 3) this._doHint(true); }
      }
      return r;
    };
  }
  if (names.includes('noRepeat')) {
    const mk = FC.Content.makeRound, key = a => a.promptKey + JSON.stringify(a.params);
    const begin = P._beginRound;
    P._beginRound = function () {
      const self = this, orig = FC.Content.makeRound;
      FC.Content.makeRound = function (topic, o) {
        let r = mk(topic, o);
        for (let i = 0; i < 12 && self._lastAskKey && r.asks[0].promptKey !== 'p.countUp' && key(r.asks[0]) === self._lastAskKey; i++) r = mk(topic, o);
        return r;
      };
      try { begin.call(this); } finally { FC.Content.makeRound = orig; }
      this._lastAskKey = key(this.cur.asks[this.cur.asks.length - 1]);
    };
  }
  return names;
}
module.exports = { apply };
