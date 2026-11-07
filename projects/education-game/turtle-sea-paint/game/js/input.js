/* Nini's Sea Painting — SP.Input: one-finger TAP input (drag-safe) + kid-proofing + parent hold-gate.
 *
 * The child taps a paint shell, then taps a part of the line drawing; also taps Nini / the little fish / the clam. Tap vs
 * drag (down + up within 0.6 s and < 40 px move, CONFIG) is decided by SP.World.pointerUp; this module guarantees ONE
 * active finger whose whole life reaches the world, in order, exactly once:
 *   - `down(x, y, ev)`  fires SYNCHRONOUSLY inside pointerdown (the shell lifts / the part glows at once; the canvas has
 *     `touch-action: none`, pointerdown is preventDefault'ed, pointer capture is taken);
 *   - `move(x, y, ev)`  every pointermove of THAT finger, synchronously, unthrottled (the world measures the move);
 *   - `up(x, y, ev)`    pointerup of THAT finger — also when lifted outside the canvas or over the HUD / bubble
 *     (pointer capture; without capture the window listeners deliver it, exactly once);
 *   - `cancel()`        instead of up() when the touch is taken away: pointercancel (iOS system gesture, Control Centre,
 *     a call), lost capture while down, window blur, page hidden, detach.cancel() (main: resize / rotation / pause).
 *
 *   const detach = SP.Input.attach(canvas, {
 *     toLogical(clientX, clientY) → {x, y},          // CSS client px → logical world px
 *     down(x, y, ev), move(x, y, ev), up(x, y, ev), cancel(), hover?(x, y)   // hover: mouse without a button
 *   });
 *   detach.cancel()     // end the active finger now (fires cancel() once); its later moves/ups are dropped
 *   detach.isActive()   // a finger (or the mouse button) is down
 *   detach()            // remove every listener
 *
 * CALLBACK SIGNATURE: every handler receives two NUMBERS (x, y) in LOGICAL px (whatever toLogical returned), then the raw
 * DOM event — NOT a point object.  Write:  down: (x, y) => world.pointerDown(x, y)     (never  p => world.pointerDown(p.x, p.y))
 * Points whose x/y are not finite numbers (toLogical failed) are dropped (an `up` without a point → cancel()).
 *
 *   SP.Input.kidProof();                                  // once at boot; idempotent
 *   const off = SP.Input.holdButton(el, 2000, onDone, onProgress);   // parent gate; onProgress(p), p = 0..1
 *
 * ONE FINGER: while a finger is down, EXTRA fingers are IGNORED (a second hand resting on the screen must not paint by
 * accident or steal the tap). Exceptions — the old finger is known to be gone, so it ends with cancel() and the new one begins:
 *   - Pointer Events: the new touch is `isPrimary` (iOS marks a touch primary only when no other touch is down → the old
 *     finger's pointerup was swallowed by a system gesture), or a mouse press replaces a stuck touch;
 *   - touch fallback: the active touch is no longer in `e.touches`;
 *   - the active pointer has been silent for ≥ Input.STALE_MS (6 s).
 * Targets matching IGNORE (`button, .screen, #hud, .no-game-input`) are skipped on press. Falls back to touch + mouse
 * events when PointerEvent is missing.
 */
(function (SP) {
  'use strict';
  var W = (typeof window !== 'undefined') ? window : {};
  var IGNORE = 'button, .screen, #hud, .no-game-input';
  var STALE_MS = 6000;               // an active pointer silent this long is presumed lost (swallowed pointerup)
  var HOLD_MS = 2000;                // parent gate
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
    var activeType = null;             // 'touch' | 'pen' | 'mouse'
    var seen = 0;                      // time of the active pointer's last event
    function now() { return Input._now ? Input._now() : Date.now(); }
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
    function release(id) {
      if (W.PointerEvent && typeof id === 'number') { try { canvas.releasePointerCapture(id); } catch (err) { /* ignore */ } }
    }
    function cancelActive() {
      if (active === null) return;
      var id = active;
      active = null; activeType = null;
      release(id);
      fire.cancel();
    }
    function begin(id, type, cx, cy, e) {
      active = id; activeType = type; seen = now();
      fire.down(pt(cx, cy), e);
    }
    function stale() { return now() - seen >= STALE_MS; }

    if (canvas.style) {
      canvas.style.touchAction = 'none'; canvas.style.webkitUserSelect = 'none'; canvas.style.userSelect = 'none';
      canvas.style.webkitTouchCallout = 'none'; canvas.style.webkitTapHighlightColor = 'transparent';
    }

    if (W.PointerEvent) {
      on(canvas, 'pointerdown', function (e) {
        if (ignored(e.target)) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (active !== null) {
          if (e.pointerId === active) { if (e.cancelable) e.preventDefault(); return; }   // duplicate down of the same finger
          var oldGone = stale() ||
            (e.pointerType === 'touch' && activeType === 'touch' && e.isPrimary === true) ||
            (e.pointerType === 'mouse' && activeType !== 'mouse');
          if (!oldGone) { if (e.cancelable) e.preventDefault(); return; }               // an extra finger: ignored
          cancelActive();
        }
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        if (e.cancelable) e.preventDefault();
        begin(e.pointerId, e.pointerType || 'touch', e.clientX, e.clientY, e);
      });
      on(canvas, 'pointermove', function (e) {
        if (active === null) { if (e.pointerType === 'mouse') fire.hover(pt(e.clientX, e.clientY)); return; }
        if (e.pointerId !== active) return;
        e._ttSeen = true;
        if (e.cancelable) e.preventDefault();
        seen = now();
        fire.move(pt(e.clientX, e.clientY), e);
      });
      var end = function (e) {
        if (active === null || e.pointerId !== active) return;
        e._ttSeen = true;
        active = null; activeType = null;
        release(e.pointerId);
        fire.up(pt(e.clientX, e.clientY), e);
      };
      on(canvas, 'pointerup', end);
      on(canvas, 'pointercancel', function (e) { if (e.pointerId === active) cancelActive(); });
      // lostpointercapture comes right AFTER pointerup (active is already null then) — only a capture lost while the
      // finger is still down (the element was hidden / re-parented) ends the touch.
      on(canvas, 'lostpointercapture', function (e) { if (e.pointerId === active) cancelActive(); });
      // capture fallback: the same event bubbles from the canvas to the window — handle each event only once
      on(W, 'pointermove', function (e) {
        if (active === null || e.pointerId !== active || e.target === canvas || e._ttSeen) return;
        e._ttSeen = true;
        seen = now();
        fire.move(pt(e.clientX, e.clientY), e);
      });
      on(W, 'pointerup', function (e) { if (e.target !== canvas && !e._ttSeen) end(e); });
      on(W, 'pointercancel', function (e) { if (e.pointerId === active) cancelActive(); });
    } else {
      // ---- touch fallback (old iOS) ----
      var findTouch = function (list, id) {
        if (!list) return null;
        for (var i = 0; i < list.length; i++) if ('touch:' + list[i].identifier === id) return list[i];
        return null;
      };
      on(canvas, 'touchstart', function (e) {
        if (ignored(e.target)) return;
        if (e.cancelable) e.preventDefault();
        var t = e.changedTouches[0];
        if (!t || 'touch:' + t.identifier === active) return;
        if (active !== null) {
          var gone = active === 'mouse' || !findTouch(e.touches, active) || stale();
          if (!gone) return;                                        // an extra finger: ignored
          cancelActive();
        }
        begin('touch:' + t.identifier, 'touch', t.clientX, t.clientY, e);
      }, { passive: false });
      on(canvas, 'touchmove', function (e) {
        if (active === null) return;
        var t = findTouch(e.changedTouches, active);
        if (!t) return;
        if (e.cancelable) e.preventDefault();
        seen = now();
        fire.move(pt(t.clientX, t.clientY), e);
      }, { passive: false });
      on(canvas, 'touchend', function (e) {
        var t = findTouch(e.changedTouches, active);
        if (!t) { if (e.cancelable) e.preventDefault(); return; }
        if (e.cancelable) e.preventDefault();   // no synthetic mouse events / click 300 ms later
        active = null; activeType = null;
        fire.up(pt(t.clientX, t.clientY), e);
      }, { passive: false });
      on(canvas, 'touchcancel', function (e) { if (findTouch(e.changedTouches, active)) cancelActive(); }, { passive: false });
      // ---- mouse fallback ----
      on(canvas, 'mousedown', function (e) {
        if (ignored(e.target) || e.button !== 0 || active !== null) return;
        e.preventDefault();
        begin('mouse', 'mouse', e.clientX, e.clientY, e);
      });
      on(W, 'mousemove', function (e) {
        if (active === 'mouse') { seen = now(); fire.move(pt(e.clientX, e.clientY), e); }
        else if (active === null && e.target === canvas) fire.hover(pt(e.clientX, e.clientY));
      });
      on(W, 'mouseup', function (e) {
        if (active !== 'mouse') return;
        active = null; activeType = null;
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
    ms = ms || HOLD_MS;
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
  Input.STALE_MS = STALE_MS;
  Input.HOLD_MS = HOLD_MS;
  Input._now = null;                     // tests replace the clock
  SP.Input = Input;
})(window.SP = window.SP || {});
