/* Lulu's Jungle Tower — JT.Input: one-finger drag (and tap) input + kid-proofing + parent hold-gate.
 *
 * The child grabs a block, drags it UP over the tower and lets go; a short touch is a tap (hop + name; tap Lulu to
 * hear the prompt again; tap the butterfly). Tap vs drag (< 24 px, < 0.35 s) is decided by JT.World.pointerUp.
 * `down(x, y, ev)` fires SYNCHRONOUSLY inside pointerdown (no tap-vs-drag wait, no click delay); EVERY move of the SAME
 * finger then fires `move(x, y, ev)` synchronously — no throttling, no rAF batching, so the block's spring-follow and
 * the velocity the world measures for the throw / pendulum tilt see every point the browser delivers (60 Hz, 120 Hz on
 * ProMotion iPads). Coalesced sub-frame points are NOT replayed: they would arrive with the same world time and a zero
 * dt would spike the measured velocity. `ev.timeStamp` is passed along for anyone who wants it. Lifting fires
 * `up(x, y, ev)` at the release point. The world decides what a press means (JT.World.pointerDown/Move/Up/cancelDrag).
 *
 *   const detach = JT.Input.attach(canvas, {
 *     toLogical(clientX, clientY) → {x, y},
 *     down(x, y, ev), move(x, y, ev), up(x, y, ev), cancel(), hover?(x, y)   // hover: mouse without a button
 *   });
 *   detach.cancel()     // end the active finger now (fires cancel() once) — call on resize / rotation / pause so a
 *                       // later move/up of that finger can never reach a world that already dropped the drag
 *   detach.isActive()   // a finger (or the mouse button) is down
 *   detach()            // remove every listener
 *
 * CALLBACK SIGNATURE: every handler receives two NUMBERS (x, y) in LOGICAL px (whatever toLogical returned),
 * then the raw DOM event — NOT a point object. Write  down: (x, y) => world.pointerDown(x, y)
 * Points whose x/y are not finite numbers (toLogical failed) are dropped (an `up` without a point → cancel()).
 *
 *   JT.Input.kidProof();                                  // once at boot; idempotent
 *   const off = JT.Input.holdButton(el, 1500, onDone, onProgress);   // onProgress(p), p = 0..1
 *
 * Still drag (playtest P1-2): when the active finger has moved < 20 px for 1.5 s (a thumb resting on a block), a NEW
 * touch — even a second finger — takes over: cancel() fires for the old drag, then down() for the new finger. (The world
 * itself also cancels a drag held still for 6 s and emits `stillDrag`.)
 *
 * attach(): Pointer Events with pointer capture (a drag that leaves the canvas, crosses the HUD or the speech bubble
 * keeps flowing to the canvas); only ONE active pointer (extra fingers are ignored, they never steal a MOVING drag); targets
 * matching IGNORE (buttons, menus, HUD) are skipped on press; pointercancel / lostpointercapture / window blur / page
 * hide → cancel() exactly once (iOS fires pointercancel on system gestures: Control Centre, home swipe, a call) — the
 * world then sends the dragged block home. If pointer capture is unavailable, moves/ups of the active finger that land
 * on other elements are still delivered through window listeners, so a drag never gets stuck.
 * Falls back to touch + mouse events when PointerEvent is missing.
 */
(function (JT) {
  'use strict';
  var W = (typeof window !== 'undefined') ? window : {};
  var IGNORE = 'button, .screen, #hud, .no-game-input';
  // A finger resting on a block (an iPad thumb in the bottom row) must not freeze the game: once the active pointer has
  // moved < STILL_PX for STILL_MS, a NEW touch (even a second finger) takes over — the old drag is cancelled first.
  var STILL_MS = 1500, STILL_PX = 20;
  var FORM = 'input, textarea, select, [contenteditable="true"]';

  function closest(el, sel) {
    while (el && el.nodeType === 1) {
      if (el.matches ? el.matches(sel) : (el.webkitMatchesSelector && el.webkitMatchesSelector(sel))) return el;
      el = el.parentElement;
    }
    return null;
  }
  function ignored(target) { return !!closest(target, IGNORE); }
  function safe(fn) {
    return function () { try { return fn.apply(this, arguments); } catch (e) { if (W.console) W.console.error(e); } };
  }

  var Input = {};

  Input.attach = function (canvas, h) {
    h = h || {};
    var active = null;                 // pointerId, 'touch:<id>' or 'mouse'
    var activeType = null;             // pointerType of the active pointer
    var anchor = null;                 // { x, y, t }: where/when the active pointer last moved ≥ STILL_PX
    function now() { return Input._now ? Input._now() : Date.now(); }
    function track(cx, cy) {
      if (!anchor || Math.abs(cx - anchor.x) >= STILL_PX || Math.abs(cy - anchor.y) >= STILL_PX) anchor = { x: cx, y: cy, t: now() };
    }
    function isStill() { return active !== null && !!anchor && now() - anchor.t >= STILL_MS; }
    var offs = [];
    function on(el, type, fn, opt) { el.addEventListener(type, fn, opt || false); offs.push([el, type, fn, opt || false]); }
    function pt(cx, cy) { return h.toLogical ? h.toLogical(cx, cy) : { x: cx, y: cy }; }
    function okp(p) { return !!p && isFinite(p.x) && isFinite(p.y); }
    var fire = {
      down: safe(function (p, e) { if (h.down && okp(p)) h.down(+p.x, +p.y, e); }),
      move: safe(function (p, e) { if (h.move && okp(p)) h.move(+p.x, +p.y, e); }),
      up: safe(function (p, e) { if (h.up) { if (okp(p)) h.up(+p.x, +p.y, e); else if (h.cancel) h.cancel(); } }),
      hover: safe(function (p) { if (h.hover && okp(p)) h.hover(+p.x, +p.y); }),
      cancel: safe(function () { if (h.cancel) h.cancel(); })
    };
    function cancelActive() { if (active !== null) { active = null; anchor = null; fire.cancel(); } }

    if (canvas.style) { canvas.style.touchAction = 'none'; canvas.style.webkitUserSelect = 'none'; canvas.style.userSelect = 'none'; }

    if (W.PointerEvent) {
      on(canvas, 'pointerdown', function (e) {
        if (ignored(e.target)) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (active !== null && e.pointerId !== active && isStill()) {
          cancelActive();                                                  // a resting finger: the new touch takes over
        } else {
          if (e.isPrimary === false && e.pointerType === 'touch') return;   // a second finger: ignore it
          if (active !== null) {
            // A new PRIMARY pointer of the same type means the old one ended without an up/cancel reaching us
            // (iOS can swallow them during system gestures). Recover instead of ignoring every tap from now on.
            if (e.isPrimary !== false && e.pointerType === activeType && e.pointerId !== active) cancelActive();
            else return;
          }
        }
        active = e.pointerId; activeType = e.pointerType; anchor = null; track(e.clientX, e.clientY);
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        if (e.cancelable) e.preventDefault();
        fire.down(pt(e.clientX, e.clientY), e);
      });
      on(canvas, 'pointermove', function (e) {
        if (active === null) { if (e.pointerType === 'mouse') fire.hover(pt(e.clientX, e.clientY)); return; }
        if (e.pointerId !== active) return;
        if (e.cancelable) e.preventDefault();
        track(e.clientX, e.clientY);
        fire.move(pt(e.clientX, e.clientY), e);
      });
      var end = function (e) {
        if (e.pointerId !== active) return;
        active = null;
        try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        fire.up(pt(e.clientX, e.clientY), e);
      };
      on(canvas, 'pointerup', end);
      on(canvas, 'pointercancel', function (e) { if (e.pointerId === active) cancelActive(); });
      on(canvas, 'lostpointercapture', function (e) { if (e.pointerId === active) cancelActive(); });
      // capture fallback: the same event bubbles from the canvas to the window — handle each event only once
      on(W, 'pointermove', function (e) {
        if (active === null || e.pointerId !== active || e.target === canvas || e._rrSeen) return;
        e._rrSeen = true;
        track(e.clientX, e.clientY);
        fire.move(pt(e.clientX, e.clientY), e);
      });
      on(W, 'pointerup', function (e) { if (e.target !== canvas && !e._rrSeen) { e._rrSeen = true; end(e); } });
      on(W, 'pointercancel', function (e) { if (e.pointerId === active) cancelActive(); });
    } else {
      // ---- touch fallback (old iOS) ----
      var findTouch = function (list, id) {
        for (var i = 0; i < list.length; i++) if ('touch:' + list[i].identifier === id) return list[i];
        return null;
      };
      on(canvas, 'touchstart', function (e) {
        if (ignored(e.target)) return;
        if (e.cancelable) e.preventDefault();
        if (active !== null) {
          if ((e.touches && e.touches.length === 1) || isStill()) cancelActive();   // old finger gone / resting: recover
          else return;                                                // a second finger: ignore it
        }
        var t = e.changedTouches[0];
        active = 'touch:' + t.identifier; anchor = null; track(t.clientX, t.clientY);
        fire.down(pt(t.clientX, t.clientY), e);
      }, { passive: false });
      on(canvas, 'touchmove', function (e) {
        if (active === null) return;
        var t = findTouch(e.changedTouches, active);
        if (!t) return;
        if (e.cancelable) e.preventDefault();
        track(t.clientX, t.clientY);
        fire.move(pt(t.clientX, t.clientY), e);
      }, { passive: false });
      on(canvas, 'touchend', function (e) {
        var t = findTouch(e.changedTouches, active);
        if (!t) return;
        if (e.cancelable) e.preventDefault();   // no synthetic mouse events afterwards
        active = null;
        fire.up(pt(t.clientX, t.clientY), e);
      }, { passive: false });
      on(canvas, 'touchcancel', function (e) { if (findTouch(e.changedTouches, active)) cancelActive(); }, { passive: false });
      // ---- mouse fallback ----
      on(canvas, 'mousedown', function (e) {
        if (ignored(e.target) || e.button !== 0 || active !== null) return;
        active = 'mouse'; anchor = null; track(e.clientX, e.clientY);
        e.preventDefault();
        fire.down(pt(e.clientX, e.clientY), e);
      });
      on(W, 'mousemove', function (e) {
        if (active === 'mouse') fire.move(pt(e.clientX, e.clientY), e);
        else if (active === null && e.target === canvas) fire.hover(pt(e.clientX, e.clientY));
      });
      on(W, 'mouseup', function (e) {
        if (active !== 'mouse') return;
        active = null;
        fire.up(pt(e.clientX, e.clientY), e);
      });
    }
    on(W, 'blur', cancelActive);
    if (W.document) on(W.document, 'visibilitychange', function () { if (W.document.hidden) cancelActive(); });

    function detach() {
      cancelActive();
      offs.forEach(function (o) { o[0].removeEventListener(o[1], o[2], o[3]); });
      offs = [];
    }
    detach.cancel = cancelActive;
    detach.isActive = function () { return active !== null; };
    return detach;
  };

  // ------------------------------------------------------------------ kid-proofing
  var proofed = false;
  Input.kidProof = function () {
    if (proofed || !W.document) return;
    proofed = true;
    var doc = W.document;
    var NP = { passive: false };
    function prevent(e) { if (e.cancelable !== false) e.preventDefault(); }
    function inForm(t) { return !!closest(t, FORM); }

    // CSS: no callout, no selection, no double-tap zoom, no rubber-band / pull-to-refresh
    try {
      var st = doc.createElement('style');
      st.textContent = 'html,body{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;' +
        '-webkit-tap-highlight-color:transparent;touch-action:manipulation;overscroll-behavior:none;}' +
        'input,textarea,[contenteditable="true"]{-webkit-user-select:text;user-select:text;-webkit-touch-callout:default;}' +
        'img,svg,canvas{-webkit-user-drag:none;user-drag:none;}';
      (doc.head || doc.documentElement).appendChild(st);
    } catch (e) { /* ignore */ }

    // Safari pinch-zoom / rotate gestures
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (t) { doc.addEventListener(t, prevent, NP); });

    // multi-finger touches never zoom; single-finger drags never scroll except inside .scroll / form controls
    doc.addEventListener('touchstart', function (e) { if (e.touches && e.touches.length > 1) prevent(e); }, NP);
    doc.addEventListener('touchmove', function (e) {
      if (e.touches && e.touches.length > 1) { prevent(e); return; }
      if (closest(e.target, '.scroll') || closest(e.target, 'input[type="range"]')) return;
      prevent(e);
    }, NP);

    // double-tap zoom on non-interactive areas (touch-action:manipulation covers modern iOS; this covers the rest)
    var lastEnd = 0;
    doc.addEventListener('touchend', function (e) {
      var t = Date.now();
      if (t - lastEnd < 320 && !closest(e.target, 'button, a, input, textarea, select, label, .scroll, [role="button"]')) prevent(e);
      lastEnd = t;
    }, NP);
    doc.addEventListener('dblclick', function (e) { if (!inForm(e.target)) prevent(e); }, NP);

    // long-press menus, text selection, image drag
    doc.addEventListener('contextmenu', function (e) { if (!inForm(e.target)) prevent(e); }, NP);
    doc.addEventListener('selectstart', function (e) { if (!inForm(e.target)) prevent(e); }, NP);
    doc.addEventListener('dragstart', prevent, NP);

    // desktop: Ctrl+wheel zoom, Ctrl +/−/0, refresh keys
    W.addEventListener('wheel', function (e) { if (e.ctrlKey || e.metaKey) prevent(e); }, NP);
    W.addEventListener('keydown', function (e) {
      var k = e.key, mod = e.ctrlKey || e.metaKey;
      if (mod && (k === '+' || k === '=' || k === '-' || k === '_' || k === '0')) { prevent(e); return; }
      if (k === 'F5' || (mod && (k === 'r' || k === 'R'))) { prevent(e); return; }
    }, NP);
  };

  // ------------------------------------------------------------------ parent gate
  Input.holdButton = function (el, ms, onDone, onProgress) {
    ms = ms || 1500;
    var start = 0, raf = 0, holding = false, pid = null, offs = [];
    var rq = W.requestAnimationFrame ? W.requestAnimationFrame.bind(W) : function (f) { return setTimeout(function () { f(Date.now()); }, 16); };
    var cq = W.cancelAnimationFrame ? W.cancelAnimationFrame.bind(W) : clearTimeout;
    function on(type, fn, opt, target) { (target || el).addEventListener(type, fn, opt || false); offs.push([target || el, type, fn, opt || false]); }
    function prog(p) { try { if (onProgress) onProgress(p); } catch (e) { /* ignore */ } }
    function tick() {
      if (!holding) return;
      var p = Math.min(1, (Date.now() - start) / ms);
      prog(p);
      if (p >= 1) {
        holding = false; pid = null;
        try { if (onDone) onDone(); } catch (e) { if (W.console) W.console.error(e); }
        prog(0);
        return;
      }
      raf = rq(tick);
    }
    function begin(e, id) {
      if (holding) return;
      if (e && e.cancelable) e.preventDefault();
      holding = true; pid = id; start = Date.now();
      prog(0);
      raf = rq(tick);
    }
    function stop() {
      if (!holding) return;
      holding = false; pid = null;
      cq(raf);
      prog(0);
    }
    function outside(cx, cy) {
      var r = el.getBoundingClientRect(), pad = 24;
      return cx < r.left - pad || cx > r.right + pad || cy < r.top - pad || cy > r.bottom + pad;
    }
    if (el.style) { el.style.touchAction = 'none'; el.style.webkitUserSelect = 'none'; el.style.webkitTouchCallout = 'none'; }

    if (W.PointerEvent) {
      on('pointerdown', function (e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        begin(e, e.pointerId);
      });
      on('pointermove', function (e) { if (holding && e.pointerId === pid && outside(e.clientX, e.clientY)) stop(); });
      on('pointerup', function (e) { if (e.pointerId === pid) stop(); });
      on('pointercancel', function (e) { if (e.pointerId === pid) stop(); });
      on('pointerleave', function (e) { if (e.pointerId === pid && e.pointerType === 'mouse') stop(); });
      on('lostpointercapture', function (e) { if (e.pointerId === pid) stop(); });
    } else {
      on('touchstart', function (e) { begin(e, 'touch'); }, { passive: false });
      on('touchmove', function (e) {
        var t = e.touches[0];
        if (t && outside(t.clientX, t.clientY)) stop();
      }, { passive: true });
      on('touchend', function (e) { if (e.cancelable) e.preventDefault(); stop(); }, { passive: false });
      on('touchcancel', stop);
      on('mousedown', function (e) { if (e.button === 0) begin(e, 'mouse'); });
      on('mouseup', stop);
      on('mouseleave', stop);
    }
    // keyboard: hold Enter / Space
    on('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) begin(e, 'key'); });
    on('keyup', function (e) { if (e.key === 'Enter' || e.key === ' ') stop(); });
    on('contextmenu', function (e) { e.preventDefault(); });
    on('click', function (e) { e.preventDefault(); });   // a quick tap must not act as a click
    on('blur', stop, false, W);

    return function off() {
      stop();
      offs.forEach(function (o) { o[0].removeEventListener(o[1], o[2], o[3]); });
      offs = [];
    };
  };

  Input.IGNORE = IGNORE;
  Input.STILL_MS = STILL_MS; Input.STILL_PX = STILL_PX;
  Input._now = null;                     // tests replace the clock
  JT.Input = Input;
})(window.JT = window.JT || {});
