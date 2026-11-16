/* starnet-berries: hosted browser build.
   1. Locks browser zoom: pinch, double-tap, ctrl+wheel, ctrl +/-/0, Safari gestures.
   2. Touch controls on the station canvases:
        one finger drag  -> pan (sent as mouse drag)
        tap              -> click
        long press       -> right-click (contextmenu)
        two-finger pinch -> zoom (sent as wheel at the pinch midpoint)
   The page's own handlers stay in charge; we only translate touch into the
   mouse/wheel events they already understand. */
(function () {
  'use strict';
  var opt = { passive: false, capture: true };

  // ---- zoom lock --------------------------------------------------------
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (t) {
    document.addEventListener(t, function (e) { e.preventDefault(); }, opt);
  });
  document.addEventListener('touchmove', function (e) {
    if (e.touches.length > 1 || (e.scale !== undefined && e.scale !== 1)) e.preventDefault();
  }, opt);
  // double-tap zoom is already off via touch-action in mobile.css
  // desktop browser zoom: preventDefault only, so canvases still get their wheel
  window.addEventListener('wheel', function (e) { if (e.ctrlKey || e.metaKey) e.preventDefault(); }, opt);
  window.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && ['+', '=', '-', '_', '0'].indexOf(e.key) !== -1) e.preventDefault();
  }, true);

  // ---- touch -> mouse for canvases ---------------------------------------
  function fire(target, type, t, extra) {
    var init = {
      bubbles: true, cancelable: true, view: window, detail: 1,
      clientX: t.clientX, clientY: t.clientY, screenX: t.screenX || t.clientX, screenY: t.screenY || t.clientY,
      button: (extra && extra.button) || 0, buttons: type === 'mouseup' || type === 'click' ? 0 : 1
    };
    target.dispatchEvent(new MouseEvent(type, init));
  }
  function fireWheel(target, x, y, deltaY) {
    target.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, deltaY: deltaY, deltaMode: 0 }));
  }
  function dist(a, b) { return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }
  function mid(a, b) { return { clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2 }; }

  var st = null;   // { cv, mode:'one'|'pinch', last, d, pressTimer, longPressed }

  function clearPress() { if (st && st.pressTimer) { clearTimeout(st.pressTimer); st.pressTimer = null; } }

  document.addEventListener('touchstart', function (e) {
    var cv = e.target;
    if (!cv || cv.tagName !== 'CANVAS') return;
    e.preventDefault();                              // stop the browser's own scroll/zoom and ghost mouse events
    if (e.touches.length === 1) {
      var t = e.touches[0];
      st = { cv: cv, mode: 'one', last: t, start: t, moved: false, longPressed: false };
      fire(cv, 'mousemove', t); fire(cv, 'mousedown', t);
      st.pressTimer = setTimeout(function () {
        if (!st || st.moved) return;
        st.longPressed = true;
        fire(cv, 'mouseup', st.last);
        cv.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, view: window, clientX: st.last.clientX, clientY: st.last.clientY, button: 2 }));
      }, 550);
    } else if (e.touches.length === 2 && st) {
      clearPress();
      if (st.mode === 'one' && !st.longPressed) {
        // end the one-finger press without it reading as a click: move it far enough to count as a drag first
        fire(st.cv, 'mouseup', st.last);
      }
      st.mode = 'pinch';
      st.d = dist(e.touches[0], e.touches[1]);
    }
  }, opt);

  document.addEventListener('touchmove', function (e) {
    if (!st) return;
    e.preventDefault();
    if (st.mode === 'one' && e.touches.length === 1) {
      var t = e.touches[0];
      if (!st.moved && dist(t, st.start) > 8) { st.moved = true; clearPress(); }
      st.last = t;
      if (!st.longPressed) fire(st.cv, 'mousemove', t);
    } else if (st.mode === 'pinch' && e.touches.length >= 2) {
      var d = dist(e.touches[0], e.touches[1]);
      if (st.d > 0 && d > 0) {
        var m = mid(e.touches[0], e.touches[1]);
        // world.js zooms by exp(-deltaY * 0.0015); pick deltaY so the zoom tracks the fingers
        fireWheel(st.cv, m.clientX, m.clientY, -Math.log(d / st.d) / 0.0015);
      }
      st.d = d;
    }
  }, opt);

  function end(e) {
    if (!st) return;
    e.preventDefault();
    if (e.touches.length > 0) return;               // wait until every finger is up
    clearPress();
    if (st.mode === 'one' && !st.longPressed) {
      fire(st.cv, 'mouseup', st.last);
      if (!st.moved) fire(st.cv, 'click', st.last);
    }
    st = null;
  }
  document.addEventListener('touchend', end, opt);
  document.addEventListener('touchcancel', end, opt);
  // ---- COMMS full screen (phones) ----------------------------------------
  // The stacked phone layout leaves the transcript a few lines tall. Tapping into the
  // message box lifts COMMS over the whole screen (mobile.css body.sn-comms-full); the
  // header key toggles it either way. Leaving it is always explicit: a dismissed
  // keyboard blurs the box, and that must not fold away the reply being read.
  var narrow = window.matchMedia ? window.matchMedia('(max-width: 760px)') : { matches: false };
  var vv = window.visualViewport;
  function fitViewport() {
    var b = document.body;
    if (!b || !b.classList.contains('sn-comms-full') || !vv) return;
    // the body is zoomed (TEXT SIZE), so visual px -> the panel's own px
    var z = parseFloat(getComputedStyle(b).zoom) || 1;
    b.style.setProperty('--sn-vvh', (vv.height / z) + 'px');
    b.style.setProperty('--sn-vvt', (vv.offsetTop / z) + 'px');
  }
  function setCommsFull(on) {
    var b = document.body;
    if (!b) return;
    on = !!on && narrow.matches;
    b.classList.toggle('sn-comms-full', on);
    if (!on) { b.style.removeProperty('--sn-vvh'); b.style.removeProperty('--sn-vvt'); }
    fitViewport();
    var key = document.getElementById('comms-full');
    if (key) {
      key.textContent = on ? '⤡' : '⤢';
      key.setAttribute('aria-pressed', on ? 'true' : 'false');
      key.setAttribute('aria-label', on ? 'Shrink COMMS' : 'Expand COMMS to full screen');
      key.title = on ? 'Shrink COMMS' : 'Expand COMMS to full screen';
    }
    if (on) {
      var log = document.getElementById('chat-log');
      if (log) requestAnimationFrame(function () { log.scrollTop = log.scrollHeight; });
    }
  }
  function mountCommsFull() {
    var right = document.querySelector('#chat-panel h3 .h3-right');
    if (!right || document.getElementById('comms-full')) return;
    var key = document.createElement('button');
    key.id = 'comms-full'; key.type = 'button'; key.setAttribute('data-no-tip', '');
    key.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      setCommsFull(!document.body.classList.contains('sn-comms-full'));
    });
    right.appendChild(key);
    setCommsFull(false);
    document.addEventListener('focusin', function (e) {
      if (e.target && e.target.id === 'chat-input' && narrow.matches) setCommsFull(true);
    });
    if (vv) { vv.addEventListener('resize', fitViewport); vv.addEventListener('scroll', fitViewport); }
    var onNarrow = function () { if (!narrow.matches) setCommsFull(false); };
    if (narrow.addEventListener) narrow.addEventListener('change', onNarrow); else if (narrow.addListener) narrow.addListener(onNarrow);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountCommsFull);
  else mountCommsFull();
})();
