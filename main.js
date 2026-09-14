/* ============================================================
   RF9 — interactions
   ============================================================ */

/* ------------------------------------------------------------
   LEAD FORM ENDPOINT
   ------------------------------------------------------------
   This form currently has no backend wired up. Point it at
   wherever leads should actually land, e.g.:
     - Your own API:      "https://api.yoursite.com/leads"
     - A Formspree form:  "https://formspree.io/f/xxxxxxx"
     - A CRM webhook, Supabase edge function, Zapier catch hook, etc.
   The form POSTs JSON: { name, phone, email, interest, message }.
   Until this is set, submissions are only logged to the console
   so you can see the shape of the data in devtools.
   ------------------------------------------------------------ */
var RF9_LEAD_ENDPOINT = ''; // <-- set this to your endpoint URL

(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- year ---------- */
  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  /* ---------- nav on scroll ---------- */
  var nav = document.getElementById('nav');
  function onScrollNav() {
    nav.classList.toggle('is-stuck', window.scrollY > 40);
  }
  onScrollNav();
  window.addEventListener('scroll', onScrollNav, { passive: true });

  /* ---------- mobile menu ---------- */
  var burger = document.getElementById('burger');
  var menu = document.getElementById('mobileMenu');

  function setMenu(open) {
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) {
      menu.hidden = false;
      requestAnimationFrame(function () { menu.classList.add('is-open'); });
    } else {
      menu.classList.remove('is-open');
      setTimeout(function () { menu.hidden = true; }, 400);
    }
  }
  burger.addEventListener('click', function () {
    setMenu(burger.getAttribute('aria-expanded') !== 'true');
  });
  menu.addEventListener('click', function (e) {
    if (e.target.tagName === 'A') setMenu(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && burger.getAttribute('aria-expanded') === 'true') setMenu(false);
  });

  /* ---------- scroll reveals ---------- */
  var reveals = document.querySelectorAll('.reveal');
  reveals.forEach(function (el) {
    var d = el.getAttribute('data-delay');
    if (d) el.style.setProperty('--d', d);
  });

  if (reduced || !('IntersectionObserver' in window)) {
    reveals.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var revealIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          revealIO.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
    reveals.forEach(function (el) { revealIO.observe(el); });
  }

  /* ---------- animated counters ---------- */
  var counters = document.querySelectorAll('[data-count]');
  function runCount(el) {
    var target = parseFloat(el.getAttribute('data-count'));
    var suffix = el.getAttribute('data-suffix') || '';
    if (reduced) { el.textContent = target + suffix; return; }
    var dur = 1600, start = performance.now();
    function step(now) {
      var p = Math.min((now - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased) + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  if ('IntersectionObserver' in window) {
    var countIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          runCount(entry.target);
          countIO.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });
    counters.forEach(function (el) { countIO.observe(el); });
  } else {
    counters.forEach(runCount);
  }

  /* ---------- parallax ---------- */
  var parallaxEls = Array.prototype.slice.call(document.querySelectorAll('[data-parallax]'));
  if (!reduced && parallaxEls.length) {
    var ticking = false;
    function applyParallax() {
      var vh = window.innerHeight;
      parallaxEls.forEach(function (el) {
        var rect = el.getBoundingClientRect();
        if (rect.bottom < -200 || rect.top > vh + 200) return;
        var speed = parseFloat(el.getAttribute('data-parallax')) || 0.1;
        var offset = (rect.top + rect.height / 2 - vh / 2) * -speed;
        el.style.transform = 'translate3d(0,' + offset.toFixed(1) + 'px,0)';
      });
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(applyParallax); }
    }, { passive: true });
    window.addEventListener('resize', applyParallax);
    applyParallax();
  }

  /* ---------- magnetic buttons ---------- */
  if (!reduced && window.matchMedia('(hover:hover) and (pointer:fine)').matches) {
    document.querySelectorAll('[data-magnetic]').forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        var x = (e.clientX - r.left - r.width / 2) * 0.22;
        var y = (e.clientY - r.top - r.height / 2) * 0.32;
        el.style.transform = 'translate3d(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px,0)';
      });
      el.addEventListener('pointerleave', function () { el.style.transform = ''; });
    });
  }

  /* ---------- testimonial carousel ---------- */
  var track = document.getElementById('track');
  if (track) {
    var slides = Array.prototype.slice.call(track.children);
    var prev = document.getElementById('prev');
    var next = document.getElementById('next');
    var dotsWrap = document.getElementById('dots');
    var index = 0;
    var pages = 1;

    function perView() {
      var w = window.innerWidth;
      if (w >= 1040) return 3;
      if (w >= 680) return 2;
      return 1;
    }

    function buildDots() {
      pages = Math.max(1, slides.length - perView() + 1);
      dotsWrap.innerHTML = '';
      for (var i = 0; i < pages; i++) {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('aria-label', 'Go to testimonial ' + (i + 1));
        b.addEventListener('click', (function (n) {
          return function () { goTo(n); };
        })(i));
        dotsWrap.appendChild(b);
      }
    }

    function goTo(n) {
      index = Math.max(0, Math.min(n, pages - 1));
      var slide = slides[0];
      var gap = parseFloat(getComputedStyle(track).gap) || 0;
      var step = slide.getBoundingClientRect().width + gap;
      track.style.transform = 'translate3d(' + (-index * step) + 'px,0,0)';
      Array.prototype.forEach.call(dotsWrap.children, function (d, i) {
        d.classList.toggle('is-active', i === index);
      });
      prev.disabled = index === 0;
      next.disabled = index === pages - 1;
    }

    prev.addEventListener('click', function () { goTo(index - 1); });
    next.addEventListener('click', function () { goTo(index + 1); });

    /* touch swipe */
    var startX = 0, dragging = false;
    track.addEventListener('pointerdown', function (e) { dragging = true; startX = e.clientX; });
    window.addEventListener('pointerup', function (e) {
      if (!dragging) return;
      dragging = false;
      var dx = e.clientX - startX;
      if (Math.abs(dx) > 50) goTo(index + (dx < 0 ? 1 : -1));
    });

    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { buildDots(); goTo(Math.min(index, pages - 1)); }, 150);
    });

    /* keep the viewport pinned: focusing a control must not scroll the mask */
    var carousel = document.getElementById('carousel');
    carousel.addEventListener('scroll', function () {
      if (carousel.scrollLeft !== 0) carousel.scrollLeft = 0;
    });

    buildDots();
    goTo(0);
  }

  /* ---------- lead form ---------- */
  var leadForm = document.getElementById('leadForm');
  if (leadForm) {
    var submitBtn = document.getElementById('leadSubmit');
    var statusBox = document.getElementById('leadStatus');
    var phoneRe = /^[+\d][\d\s().-]{6,18}$/;
    var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    function fieldOf(input) {
      return input.closest('.field');
    }

    function setInvalid(input, invalid) {
      fieldOf(input).classList.toggle('is-invalid', invalid);
    }

    function validate() {
      var ok = true;
      var name = leadForm.elements['name'];
      var phone = leadForm.elements['phone'];
      var email = leadForm.elements['email'];
      var interest = leadForm.elements['interest'];

      var nameValid = name.value.trim().length > 1;
      setInvalid(name, !nameValid);
      ok = ok && nameValid;

      var phoneValid = phoneRe.test(phone.value.trim());
      setInvalid(phone, !phoneValid);
      ok = ok && phoneValid;

      var emailValid = email.value.trim() === '' || emailRe.test(email.value.trim());
      setInvalid(email, !emailValid);
      ok = ok && emailValid;

      var interestValid = interest.value.trim() !== '';
      setInvalid(interest, !interestValid);
      ok = ok && interestValid;

      return ok;
    }

    /* clear the invalid state as soon as the visitor fixes a field */
    ['name', 'phone', 'email', 'interest'].forEach(function (key) {
      var el = leadForm.elements[key];
      var evt = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(evt, function () {
        if (fieldOf(el).classList.contains('is-invalid')) validate();
      });
    });

    function showStatus(kind, message) {
      statusBox.hidden = false;
      statusBox.className = 'lead__status is-' + kind;
      statusBox.textContent = message;
    }

    function setLoading(loading) {
      submitBtn.disabled = loading;
      submitBtn.classList.toggle('is-loading', loading);
    }

    leadForm.addEventListener('submit', function (e) {
      e.preventDefault();

      /* honeypot: bots fill every field, humans never see this one */
      if (leadForm.elements['company'] && leadForm.elements['company'].value) {
        return;
      }

      if (!validate()) {
        var firstInvalid = leadForm.querySelector('.field.is-invalid input, .field.is-invalid select');
        if (firstInvalid) firstInvalid.focus();
        showStatus('error', 'Please check the highlighted fields and try again.');
        return;
      }

      var payload = {
        name: leadForm.elements['name'].value.trim(),
        phone: leadForm.elements['phone'].value.trim(),
        email: leadForm.elements['email'].value.trim(),
        interest: leadForm.elements['interest'].value,
        message: leadForm.elements['message'].value.trim(),
        source: 'rf9-website'
      };

      if (!RF9_LEAD_ENDPOINT) {
        /* no backend wired up yet — log so the payload shape is visible, and
           let the visitor know their info was captured locally, not lost */
        console.info('[RF9 lead form] no endpoint configured, payload was:', payload);
        setLoading(false);
        showStatus('success', 'Thanks, ' + payload.name.split(' ')[0] + '! (Demo mode — no backend connected yet, so this wasn’t actually sent. Open the console to see the captured data.)');
        leadForm.reset();
        return;
      }

      setLoading(true);
      statusBox.hidden = true;

      fetch(RF9_LEAD_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function (res) {
          if (!res.ok) throw new Error('Request failed: ' + res.status);
          setLoading(false);
          showStatus('success', 'Thanks, ' + payload.name.split(' ')[0] + '! A coach will reach out shortly.');
          leadForm.reset();
        })
        .catch(function (err) {
          console.error('[RF9 lead form] submit failed:', err);
          setLoading(false);
          showStatus('error', 'Something went wrong sending that. Please call RF9 directly at +20 151 566 2712.');
        });
    });
  }
})();
