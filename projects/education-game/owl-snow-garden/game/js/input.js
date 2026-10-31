/* Owlet's Snow Garden — SG.Input: one-finger drag/tap input (seeds → flower pots) + kid-proofing + parent hold-gate.
 *
 *   const detach = SG.Input.attach(canvas, {
 *     toLogical(clientX, clientY) → {x, y},
 *     down(x, y, ev), move(x, y, ev), up(x, y, ev), cancel(), hover?(x, y)   // hover: mouse without a button
 *   });
 *
 * CALLBACK SIGNATURE: every handler receives two NUMBERS (x, y) in LOGICAL px (whatever toLogical returned),
 * then the raw DOM event — NOT a point object. Write  down: (x, y) => world.pointerDown(x, y)
 * (the sister game once read `p.x` from the first argument, which is a number → undefined).
 * Points whose x/y are not finite numbers (toLogical failed) are dropped.
 *
 *   SG.Input.kidProof();                                  // once at boot; idempotent
 *   const off = SG.Input.holdButton(el, 1500, onDone, onProgress);   // onProgress(p), p = 0..1
 *
 * attach(): Pointer Events with pointer capture; only ONE active pointer (extra fingers are ignored);
 * targets matching IGNORE are skipped; pointercancel / lostpointercapture / blur / page hide → cancel()
 * (iOS fires pointercancel on system gestures: Control Centre, home swipe, incoming call).
 * Falls back to touch + mouse events when PointerEvent is missing.
 */
(function (SG) {
  'use strict';
  var W = (typeof window !== 'undefined') ? window : {};
  var IGNORE = 'button, .screen, #hud, .no-game-input';
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
    function cancelActive() { if (active !== null) { active = null; fire.cancel(); } }

    if (canvas.style) { canvas.style.touchAction = 'none'; canvas.style.webkitUserSelect = 'none'; canvas.style.userSelect = 'none'; }

    if (W.PointerEvent) {
      on(canvas, 'pointerdown', function (e) {
        if (ignored(e.target)) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (active !== null) return;             // a second finger: ignore it
        if (e.isPrimary === false && e.pointerType === 'touch') return;
        active = e.pointerId;
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        if (e.cancelable) e.preventDefault();
        fire.down(pt(e.clientX, e.clientY), e);
      });
      on(canvas, 'pointermove', function (e) {
        if (active === null) { if (e.pointerType === 'mouse') fire.hover(pt(e.clientX, e.clientY)); return; }
        if (e.pointerId !== active) return;
        if (e.cancelable) e.preventDefault();
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
    } else {
      // ---- touch fallback (old iOS) ----
      var findTouch = function (list, id) {
        for (var i = 0; i < list.length; i++) if ('touch:' + list[i].identifier === id) return list[i];
        return null;
      };
      on(canvas, 'touchstart', function (e) {
        if (ignored(e.target)) return;
        if (e.cancelable) e.preventDefault();
        if (active !== null) return;
        var t = e.changedTouches[0];
        active = 'touch:' + t.identifier;
        fire.down(pt(t.clientX, t.clientY), e);
      }, { passive: false });
      on(canvas, 'touchmove', function (e) {
        if (active === null) return;
        var t = findTouch(e.changedTouches, active);
        if (!t) return;
        if (e.cancelable) e.preventDefault();
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
        active = 'mouse';
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

    return function detach() {
      cancelActive();
      offs.forEach(function (o) { o[0].removeEventListener(o[1], o[2], o[3]); });
      offs = [];
    };
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
  SG.Input = Input;
})(window.SG = window.SG || {});
