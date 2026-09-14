/* ============================================================
   RF9 — custom cursor system
   ------------------------------------------------------------
   Desktop / fine-pointer only. Purely additive: the native cursor
   is never hidden until this has actually initialised, and touch
   devices / prefers-reduced-motion never load it at all (the whole
   point of this cursor is motion — under reduced motion we simply
   keep the native system cursor rather than ship a half-animated
   version of it).
   ============================================================ */
(function () {
  'use strict';

  var fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  if (!fine.matches || reduced.matches) return;
  if (!document.body) return;

  /* ------------------------------------------------------------
     BUILD
     ------------------------------------------------------------ */
  var root = document.createElement('div');
  root.id = 'rf9-cursor';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML =
    '<div class="rfc-ring">' +
      '<span class="rfc-cross"><i></i><i></i><i></i><i></i></span>' +
      '<span class="rfc-corners"><span></span><span></span><span></span><span></span></span>' +
    '</div>' +
    '<div class="rfc-dot"></div>' +
    '<svg class="rfc-mono" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M62 8a34 34 0 1 1-24 58" fill="none" stroke="#F4512A" stroke-width="11" stroke-linecap="round"/>' +
      '<path d="M20 92 60 40 88 92" fill="none" stroke="#EEF1FA" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>' +
    '<div class="rfc-label"></div>' +
    '<div class="rfc-swipe"><b>&#8249;</b><span>Swipe</span><b>&#8250;</b></div>';
  document.body.appendChild(root);

  var ring = root.querySelector('.rfc-ring');
  var dot = root.querySelector('.rfc-dot');
  var label = root.querySelector('.rfc-label');
  var swipe = root.querySelector('.rfc-swipe');

  document.documentElement.classList.add('rf9-cursor-on');

  /* ------------------------------------------------------------
     STATE
     ------------------------------------------------------------ */
  var rawX = window.innerWidth / 2, rawY = window.innerHeight / 2;
  var dotX = rawX, dotY = rawY;
  var ringX = rawX, ringY = rawY;
  var prevRingX = ringX, prevRingY = ringY;
  var currentType = 'default';
  var lastHitTestX = null, lastHitTestY = null;
  var pointerActive = false;

  var TEXT_SELECTOR = 'input:not([type="submit"]):not([type="button"]), textarea, select';

  window.addEventListener('pointermove', function (e) {
    rawX = e.clientX;
    rawY = e.clientY;
    pointerActive = true;
    root.classList.remove('is-hidden');
  }, { passive: true });

  window.addEventListener('pointerdown', function () { root.classList.add('is-down'); }, { passive: true });
  window.addEventListener('pointerup', function () { root.classList.remove('is-down'); }, { passive: true });

  document.addEventListener('mouseleave', function () { root.classList.add('is-hidden'); });
  window.addEventListener('blur', function () { root.classList.add('is-hidden'); });

  /* ------------------------------------------------------------
     PHONE TILT (RF9 App mockup)
     ------------------------------------------------------------ */
  var phoneTilt = (function () {
    var el = null;
    var MAX_TILT = 7; // degrees — restrained, not a gimmick
    return {
      engage: function (target) {
        el = target;
        el.classList.add('is-tilting');
      },
      move: function (x, y) {
        if (!el) return;
        var r = el.getBoundingClientRect();
        var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        var nx = Math.max(-1, Math.min(1, (x - cx) / (r.width / 2)));
        var ny = Math.max(-1, Math.min(1, (y - cy) / (r.height / 2)));
        el.style.transform =
          'perspective(900px) rotateX(' + (-ny * MAX_TILT).toFixed(2) + 'deg) ' +
          'rotateY(' + (nx * MAX_TILT).toFixed(2) + 'deg) scale(1.015)';
      },
      release: function () {
        if (!el) return;
        el.classList.remove('is-tilting');
        el.style.transform = '';
        el = null;
      }
    };
  })();

  /* ------------------------------------------------------------
     HOVER CLASSIFICATION
     ------------------------------------------------------------ */
  function classify(el) {
    if (!el) return { type: 'default' };
    if (el.closest && el.matches && el.matches(TEXT_SELECTOR)) return { type: 'text' };

    var logoEl = el.closest('[data-cursor="logo"]');
    if (logoEl) return { type: 'logo' };

    var phoneEl = el.closest('[data-cursor="phone"]');
    if (phoneEl) return { type: 'phone', el: phoneEl, label: phoneEl.getAttribute('data-cursor-label') };

    var ctaEl = el.closest('[data-cursor="cta"]');
    if (ctaEl) return { type: 'cta', label: ctaEl.getAttribute('data-cursor-label') };

    var interEl = el.closest('a, button, [data-cursor="interactive"]');
    if (interEl) return { type: 'active', label: interEl.getAttribute('data-cursor-label') };

    return { type: 'default' };
  }

  function applyState(next) {
    if (next.type === currentType && next.type !== 'cta' && next.type !== 'active') {
      // still update label text even if type unchanged (moving between
      // two adjacent CTAs re-triggers below, this branch just skips
      // redundant class churn for the common default/default case)
    }

    root.classList.remove('is-active', 'is-cta', 'is-logo', 'is-phone', 'has-label');

    if (next.type === 'text') {
      root.classList.add('is-hidden');
    } else {
      root.classList.remove('is-hidden');
    }

    if (next.type === 'active') root.classList.add('is-active');
    if (next.type === 'cta') root.classList.add('is-active', 'is-cta');
    if (next.type === 'logo') root.classList.add('is-logo');
    if (next.type === 'phone') root.classList.add('is-phone');

    var showLabel = (next.type === 'active' || next.type === 'cta') && next.label;
    if (showLabel) {
      label.textContent = next.label;
      root.classList.add('has-label');
    }

    // engage / release the phone tilt effect on transition edges only
    if (next.type === 'phone' && currentType !== 'phone') {
      phoneTilt.engage(next.el);
    } else if (next.type !== 'phone' && currentType === 'phone') {
      phoneTilt.release();
    }

    currentType = next.type;
  }

  /* ------------------------------------------------------------
     RENDER LOOP
     ------------------------------------------------------------ */
  var DOT_EASE = 0.35;   // fast — the dot leads
  var RING_EASE = 0.14;  // slower — gives the ring physical "weight"
  var MAX_STRETCH = 0.16;

  function frame() {
    dotX += (rawX - dotX) * DOT_EASE;
    dotY += (rawY - dotY) * DOT_EASE;
    ringX += (rawX - ringX) * RING_EASE;
    ringY += (rawY - ringY) * RING_EASE;

    var vx = ringX - prevRingX, vy = ringY - prevRingY;
    prevRingX = ringX; prevRingY = ringY;

    dot.style.transform = 'translate3d(' + dotX.toFixed(1) + 'px,' + dotY.toFixed(1) + 'px,0)';

    var speed = Math.min(Math.sqrt(vx * vx + vy * vy), 28);
    var stretch = (speed / 28) * MAX_STRETCH;
    var angle = (speed > 0.4) ? Math.atan2(vy, vx) * (180 / Math.PI) : 0;

    var ringTransform = 'translate3d(' + ringX.toFixed(1) + 'px,' + ringY.toFixed(1) + 'px,0)';
    // only the base/interactive rings get velocity stretch — cta/logo/
    // phone states keep their shape stable and legible
    if (currentType === 'default' || currentType === 'active') {
      ringTransform += ' rotate(' + angle.toFixed(1) + 'deg) scale(' +
        (1 + stretch).toFixed(3) + ',' + (1 - stretch * 0.55).toFixed(3) + ')';
    }
    ring.style.transform = ringTransform;
    label.style.transform = 'translate3d(' + ringX.toFixed(1) + 'px,' + ringY.toFixed(1) + 'px,0)';
    swipe.style.transform = 'translate3d(' + ringX.toFixed(1) + 'px,' + ringY.toFixed(1) + 'px,0)';

    if (pointerActive && (rawX !== lastHitTestX || rawY !== lastHitTestY)) {
      lastHitTestX = rawX; lastHitTestY = rawY;
      var el = document.elementFromPoint(rawX, rawY);
      applyState(classify(el));
      if (currentType === 'phone') phoneTilt.move(rawX, rawY);
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ------------------------------------------------------------
     GRACEFUL DEGRADATION: if the device characteristics change
     (e.g. a convertible laptop switching to touch), hand back the
     native cursor rather than leaving a stranded custom one.
     ------------------------------------------------------------ */
  function handleCapabilityChange() {
    if (!fine.matches || reduced.matches) {
      document.documentElement.classList.remove('rf9-cursor-on');
      root.classList.add('is-hidden');
    }
  }
  if (fine.addEventListener) fine.addEventListener('change', handleCapabilityChange);
  if (reduced.addEventListener) reduced.addEventListener('change', handleCapabilityChange);
})();
