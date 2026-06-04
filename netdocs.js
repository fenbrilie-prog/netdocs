/*!
 * Checkbox × NetDocuments — Integration landing page
 *
 * Self-contained JS file. No external dependencies.
 *
 * Handles:
 *   1. Smooth scroll for in-page anchor links
 *   2. Single-open behaviour on the FAQ accordion
 *   3. "Book a demo" modal: open / close / Escape / outside-click
 *   4. Interactive lifecycle player in §3 (5-stage walkthrough with
 *      play / pause / prev / next / replay controls)
 *
 * Pair with: checkbox-netdocs-page.css
 * Used by:   /solution/netdocs page on checkbox.ai
 */

/* ============================================================
   PART 1 — Shared page behaviours (scroll, accordion, modal)
   ============================================================ */

(function() {
  var anchors = document.querySelectorAll('.cbx-r a[href^="#"]');
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  anchors.forEach(function(link) {
    link.addEventListener('click', function(e) {
      var hash = link.getAttribute('href');
      if (!hash || hash === '#') return;
      var target = document.querySelector(hash);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    });
  });

  // Problem section: enforce only one open at a time
  var problemItems = document.querySelectorAll('.cbx-r__problem-item');
  problemItems.forEach(function(item) {
    item.addEventListener('toggle', function() {
      if (item.open) {
        problemItems.forEach(function(other) {
          if (other !== item && other.open) other.open = false;
        });
      }
    });
  });

  // Book a demo modal: open / close / Escape / outside-click
  var modal = document.querySelector('[data-cbx-r-modal]');
  var openTriggers = document.querySelectorAll('[data-cbx-r-open-modal]');
  var closeTrigger = modal ? modal.querySelector('[data-cbx-r-close-modal]') : null;
  var lastFocused = null;

  function openModal() {
    if (!modal) return;
    lastFocused = document.activeElement;
    modal.dataset.open = 'true';
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('cbx-r-modal-open');
    if (closeTrigger) closeTrigger.focus({ preventScroll: true });
  }
  function closeModal() {
    if (!modal) return;
    modal.dataset.open = 'false';
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('cbx-r-modal-open');
    if (lastFocused && typeof lastFocused.focus === 'function') {
      lastFocused.focus({ preventScroll: true });
    }
  }

  openTriggers.forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      openModal();
    });
  });
  if (closeTrigger) closeTrigger.addEventListener('click', closeModal);
  if (modal) {
    modal.addEventListener('click', function(e) {
      if (e.target === modal) closeModal();
    });
  }
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && modal && modal.dataset.open === 'true') closeModal();
  });
})();


/* ============================================================
   PART 2 — Lifecycle track player (§3 interactive walkthrough)
   ============================================================ */

(function () {
  'use strict';

  // Each stage gets 5 seconds — comfortable reading window for the description.
  // Users who need more time can pause. Users who want to skip can use prev/next.
  var STAGE_DURATION_MS = 5000;

  var STAGES = [
    {
      title: 'Every request lands in Checkbox first',
      desc:  '100 requests come in this week — across email, Slack, Teams, the legal portal, and intake forms. They all arrive in one queue.'
    },
    {
      title: '62 are resolved without a lawyer',
      desc:  'Self-serve answers, AI legal assistant, guided templates, or automation. Most requests never need to become a formal matter.'
    },
    {
      title: 'The other 38 become matters',
      desc:  'These need legal judgement. Checkbox classifies each one — matter type, urgency, business unit — and tags them for handoff.'
    },
    {
      title: 'The integration creates each matter in NetDocs',
      desc:  'Checkbox calls the NetDocuments API. Matter codes, folder templates, security profiles, and owner assignments are all set automatically.'
    },
    {
      title: '38 structured matters now live in NetDocuments',
      desc:  'Every matter arrives with the right folders, the right codes, and the right owner. The lawyer just opens it and starts work.'
    }
  ];

  var track       = document.querySelector('[data-cbx-r-track]');
  if (!track) return;

  var overlay     = track.querySelector('[data-cbx-r-track-play]');
  var annotation  = document.querySelector('[data-cbx-r-track-annotation]');
  if (!annotation) return;

  var stepEl      = annotation.querySelector('[data-cbx-r-track-step]');
  var bodyEl      = annotation.querySelector('[data-cbx-r-track-body]');
  var titleEl     = annotation.querySelector('[data-cbx-r-track-title]');
  var descEl      = annotation.querySelector('[data-cbx-r-track-desc]');
  var progressBars = annotation.querySelectorAll('[data-cbx-r-track-progress] span');
  var prevBtn     = annotation.querySelector('[data-cbx-r-track-prev]');
  var playPauseBtn = annotation.querySelector('[data-cbx-r-track-playpause]');
  var nextBtn     = annotation.querySelector('[data-cbx-r-track-next]');

  // Playback state
  var currentStage = 0;        // 1-based; 0 = not started
  var isPaused = false;
  var hasStarted = false;
  var stageTimerId = null;
  var stageStartedAt = 0;
  var stageRemainingMs = STAGE_DURATION_MS;

  // ----- Stage rendering -----
  function setStageClass(stageIndex) {
    for (var i = 1; i <= 5; i++) {
      track.classList.remove('is-stage-' + i);
    }
    track.classList.remove('is-paused-final');
    if (stageIndex >= 1 && stageIndex <= 5) {
      track.classList.add('is-stage-' + stageIndex);
    }
  }

  function setProgress(stageIndex) {
    for (var i = 0; i < progressBars.length; i++) {
      progressBars[i].classList.remove('is-active', 'is-done');
      if (i < stageIndex - 1) progressBars[i].classList.add('is-done');
      if (i === stageIndex - 1) progressBars[i].classList.add('is-active');
    }
  }

  // ----- Counter animations -----
  // Each [data-cbx-r-counter] element declares its own target value and
  // the stage at which it should start counting. When that stage fires,
  // we animate 0 -> target. Going below that stage resets to 0.
  var counterEls = document.querySelectorAll('[data-cbx-r-counter]');
  var counters = [];
  for (var ci = 0; ci < counterEls.length; ci++) {
    var el = counterEls[ci];
    counters.push({
      el: el,
      target: parseInt(el.getAttribute('data-cbx-r-counter-target'), 10) || 0,
      triggerStage: parseInt(el.getAttribute('data-cbx-r-counter-stage'), 10) || 1,
      rafId: null,
      hasFired: false
    });
  }

  function animateCounter(counter) {
    cancelAnimationFrame(counter.rafId);
    var startTime = null;
    var duration = 1100; // ms — feels confident, not slow
    var fromVal = 0;
    var toVal = counter.target;

    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      var elapsed = timestamp - startTime;
      var progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic — fast start, gentle landing
      var eased = 1 - Math.pow(1 - progress, 3);
      var current = Math.round(fromVal + (toVal - fromVal) * eased);
      counter.el.textContent = current;
      if (progress < 1) {
        counter.rafId = requestAnimationFrame(step);
      } else {
        counter.el.textContent = toVal;
      }
    }
    counter.rafId = requestAnimationFrame(step);
  }

  function resetCounter(counter) {
    cancelAnimationFrame(counter.rafId);
    counter.el.textContent = '0';
  }

  function updateCountersForStage(stageIndex) {
    for (var i = 0; i < counters.length; i++) {
      var c = counters[i];
      if (stageIndex >= c.triggerStage) {
        if (!c.hasFired) {
          // Small delay so any CSS fade-in lands before digits start spinning
          (function (counter) {
            setTimeout(function () { animateCounter(counter); }, 300);
          })(c);
          c.hasFired = true;
        }
      } else {
        resetCounter(c);
        c.hasFired = false;
      }
    }
  }

  function renderStage(stageIndex) {
    var stage = STAGES[stageIndex - 1];
    if (!stage) return;

    // Quick fade-out for content swap (only if content is actually changing)
    bodyEl.classList.add('cbx-r__nd-track-annotation-body--switching');
    setTimeout(function () {
      stepEl.innerHTML = '<b>' + stageIndex + '</b> / 5';
      titleEl.textContent = stage.title;
      descEl.textContent = stage.desc;
      bodyEl.classList.remove('cbx-r__nd-track-annotation-body--switching');
    }, 180);

    setStageClass(stageIndex);
    setProgress(stageIndex);
    updateCountersForStage(stageIndex);

    // Update prev/next button enabled states
    if (prevBtn) prevBtn.disabled = (stageIndex <= 1);
    if (nextBtn) nextBtn.disabled = (stageIndex >= 5);
  }

  // ----- Playback control -----
  function startStageTimer(durationMs) {
    clearTimeout(stageTimerId);
    stageStartedAt = Date.now();
    stageRemainingMs = durationMs;
    stageTimerId = setTimeout(advanceToNextStage, durationMs);
  }

  function advanceToNextStage() {
    if (currentStage < STAGES.length) {
      currentStage++;
      renderStage(currentStage);
      startStageTimer(STAGE_DURATION_MS);
    } else {
      endPlayback();
    }
  }

  function endPlayback() {
    clearTimeout(stageTimerId);
    track.classList.remove('is-playing', 'is-paused-anim');
    for (var i = 1; i <= 5; i++) track.classList.remove('is-stage-' + i);
    track.classList.add('is-paused-final');
    annotation.classList.add('cbx-r__nd-track-annotation--ended');
    annotation.classList.remove('is-playing-active', 'is-paused-state');
    // Update accessibility labels
    if (playPauseBtn) {
      playPauseBtn.setAttribute('aria-label', 'Replay');
      playPauseBtn.setAttribute('title', 'Replay');
    }
    if (prevBtn) prevBtn.disabled = false;  // allow user to step back from final
    if (nextBtn) nextBtn.disabled = true;
    isPaused = false;
  }

  function pausePlayback() {
    if (isPaused || !hasStarted) return;
    clearTimeout(stageTimerId);
    // Record how much time is left in the current stage
    var elapsed = Date.now() - stageStartedAt;
    stageRemainingMs = Math.max(0, stageRemainingMs - elapsed);
    isPaused = true;
    track.classList.add('is-paused-anim');
    annotation.classList.remove('is-playing-active');
    annotation.classList.add('is-paused-state');
    if (playPauseBtn) {
      playPauseBtn.setAttribute('aria-label', 'Resume');
      playPauseBtn.setAttribute('title', 'Resume');
    }
  }

  function resumePlayback() {
    if (!isPaused) return;
    isPaused = false;
    track.classList.remove('is-paused-anim');
    annotation.classList.add('is-playing-active');
    annotation.classList.remove('is-paused-state');
    if (playPauseBtn) {
      playPauseBtn.setAttribute('aria-label', 'Pause');
      playPauseBtn.setAttribute('title', 'Pause');
    }
    startStageTimer(stageRemainingMs);
  }

  function jumpToStage(stageIndex) {
    if (stageIndex < 1 || stageIndex > STAGES.length) return;
    clearTimeout(stageTimerId);
    currentStage = stageIndex;
    // Clear "ended" state if user navigates back from end
    annotation.classList.remove('cbx-r__nd-track-annotation--ended');
    if (playPauseBtn) {
      playPauseBtn.setAttribute('aria-label', isPaused ? 'Resume' : 'Pause');
      playPauseBtn.setAttribute('title', isPaused ? 'Resume' : 'Pause');
    }
    renderStage(stageIndex);
    // Reset the per-stage clock and respect paused state
    stageRemainingMs = STAGE_DURATION_MS;
    if (!isPaused) {
      startStageTimer(STAGE_DURATION_MS);
    }
  }

  function startFromBeginning() {
    hasStarted = true;
    overlay.classList.add('cbx-r__nd-track-overlay--hidden');
    annotation.classList.add('is-visible', 'is-playing-active');
    annotation.classList.remove('is-paused-state', 'cbx-r__nd-track-annotation--ended');
    track.classList.remove('is-resting', 'is-paused-final', 'is-paused-anim');
    track.classList.add('is-playing');
    currentStage = 1;
    isPaused = false;
    renderStage(currentStage);
    startStageTimer(STAGE_DURATION_MS);
  }

  function replay() {
    // Force a clean reset before replay so animations restart
    clearTimeout(stageTimerId);
    track.classList.remove('is-playing', 'is-paused-final', 'is-paused-anim');
    for (var i = 1; i <= 5; i++) track.classList.remove('is-stage-' + i);
    annotation.classList.remove('cbx-r__nd-track-annotation--ended', 'is-paused-state');
    track.classList.add('is-resting');
    void track.offsetWidth; // force reflow
    track.classList.remove('is-resting');
    setTimeout(startFromBeginning, 80);
  }

  // ----- Events -----
  if (overlay) {
    overlay.addEventListener('click', startFromBeginning);
    overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        startFromBeginning();
      }
    });
  }

  if (playPauseBtn) {
    playPauseBtn.addEventListener('click', function () {
      // 3 modes: paused → resume, playing → pause, ended → replay
      if (annotation.classList.contains('cbx-r__nd-track-annotation--ended')) {
        replay();
      } else if (isPaused) {
        resumePlayback();
      } else {
        pausePlayback();
      }
    });
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', function () {
      if (currentStage > 1) jumpToStage(currentStage - 1);
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', function () {
      if (currentStage < STAGES.length) {
        jumpToStage(currentStage + 1);
      } else {
        endPlayback();
      }
    });
  }
})();


/* ============================================================
   PART 3 — Tabbed showcase ("What legal teams can now do")
   Three tabs, one panel visible at a time. Clean ARIA toggling.
   ============================================================ */
(function () {
  var section = document.querySelector('[data-cbx-r-tabs]');
  if (!section) return;

  var tabs = section.querySelectorAll('.cbx-r__nd-tab');
  var panels = section.querySelectorAll('.cbx-r__nd-panel');
  if (!tabs.length || !panels.length) return;

  function activate(tabIndex) {
    // tabIndex is 1-based to match data-tab attribute
    var idStr = String(tabIndex);
    section.setAttribute('data-active', idStr);

    tabs.forEach(function (t) {
      var isActive = t.getAttribute('data-tab') === idStr;
      t.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    panels.forEach(function (p) {
      var isActive = p.getAttribute('data-panel') === idStr;
      p.setAttribute('data-panel-active', isActive ? 'true' : 'false');
    });
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var id = tab.getAttribute('data-tab');
      activate(parseInt(id, 10));
    });

    // Keyboard arrow navigation (left/right)
    tab.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      var current = parseInt(tab.getAttribute('data-tab'), 10);
      var next = e.key === 'ArrowRight' ? current + 1 : current - 1;
      if (next < 1) next = tabs.length;
      if (next > tabs.length) next = 1;
      activate(next);
      var nextTab = section.querySelector('.cbx-r__nd-tab[data-tab="' + next + '"]');
      if (nextTab) nextTab.focus();
    });
  });
})();
