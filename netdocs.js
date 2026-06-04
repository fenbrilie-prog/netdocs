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
      desc:  'Checkbox connects to NetDocuments. Matter types, folder templates, security profiles, and owner assignments are all set automatically.'
    },
    {
      title: '38 structured matters now live in NetDocuments',
      desc:  'Every matter arrives with the right folders, the right type, and the right owner. The lawyer just opens it and starts work.'
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


/* ============================================================
   PART 4 — Legal Front Door (request → record) selectable journeys
   ============================================================ */

/* ============================================================
   LEGAL FRONT DOOR - selectable request journeys
   Pick a channel card, watch that request play out step by step
   to its outcome (self-serve / deflected, or becomes a matter).
   ============================================================ */
(function () {
  var root = document.querySelector('[data-cbx-r-fd]');
  if (!root) return;

  var STEP_MS = 2600;

  // ----- Icons (stroke glyphs) -----
  var IC = {
    email:    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/></svg>',
    teams:    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    slack:    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>',
    capture:  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>',
    triage:   '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17l-1.9-5.1L4.5 10l5.6-1.4z"/><path d="M19 3v3M20.5 4.5h-3"/></svg>',
    template: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="m9 15 2 2 4-4"/></svg>',
    aichat:   '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5z"/><path d="M12 8v.01M12 11v3"/></svg>',
    resolved: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m8 12 2.5 2.5L16 9"/></svg>',
    lawyer:   '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    handoff:  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
    matter:   '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>'
  };

  // ----- The three journeys -----
  var PATHS = {
    email: {
      tile: 'cbx-r__fd-tile--email',
      tileIcon: IC.email,
      reqText: '<b>Email</b> &middot; &ldquo;urgent contract for sales&rdquo;',
      outcome: 'deflected',
      payoffNum: '62',
      payoffText: 'About <b>62 of every 100</b> requests resolve like this, deflected before they ever reach a lawyer.',
      steps: [
        { ic: 'capture',  title: 'Captured at the door',        desc: 'The email hits the Legal Front Door. Checkbox catches it from Outlook. No shared inbox, no lost thread.' },
        { ic: 'triage',   title: 'AI triages it',                desc: 'Checkbox reads the request: a standard contract, low risk. It matches a self&#8209;serve template in seconds.' },
        { ic: 'template', title: 'Self&#8209;serve template',   desc: 'Sales gets a guided template and generates the contract themselves, with the right clauses already in place.' },
        { ic: 'resolved', title: 'Resolved, no lawyer needed', desc: 'Closed in minutes. No matter opened, no lawyer involved. The audit trail is captured automatically.', isOutcome: true }
      ]
    },
    teams: {
      tile: 'cbx-r__fd-tile--teams',
      tileIcon: IC.teams,
      reqText: '<b>Teams</b> &middot; &ldquo;Do I need an NDA?&rdquo;',
      outcome: 'deflected',
      payoffNum: '62',
      payoffText: 'A question and a document request, both answered and generated without a lawyer. Most requests look like this.',
      steps: [
        { ic: 'capture', title: 'Captured at the door',     desc: 'The Teams message hits the Legal Front Door. Checkbox picks it up where the work already happens.' },
        { ic: 'triage',  title: 'AI triages it',             desc: 'Checkbox spots two things: a common question, and a request to generate a document.' },
        { ic: 'aichat',  title: 'AI answers from your sources', desc: 'The assistant answers &ldquo;do I need an NDA&rdquo; from your approved policies, not the open internet, and offers to draft one.' },
        { ic: 'resolved', title: 'NDA generated, self&#8209;served', desc: 'Marketing gets the NDA from an approved template. Resolved at the door, no lawyer needed.', isOutcome: true }
      ]
    },
    slack: {
      tile: 'cbx-r__fd-tile--slack',
      tileIcon: IC.slack,
      reqText: '<b>Slack</b> &middot; &ldquo;Need your eyes to review&rdquo;',
      outcome: 'matter',
      payoffNum: '38',
      payoffText: 'About <b>38 of every 100</b> need a lawyer, and each one becomes a structured matter in NetDocuments.',
      steps: [
        { ic: 'capture', title: 'Captured at the door',   desc: 'The Slack DM hits the Legal Front Door instead of a lawyer&rsquo;s inbox at 6pm. Checkbox catches it.' },
        { ic: 'triage',  title: 'AI triages it',           desc: 'Checkbox reads it: this one needs real legal judgement. It routes to the right lawyer with full context.' },
        { ic: 'lawyer',  title: 'Lands as clean intake',   desc: 'The lawyer sees a ready&#8209;to&#8209;review request in their queue, pre&#8209;classified, not a vague message.' },
        { ic: 'handoff', title: 'The integration fires',   desc: 'Checkbox calls NetDocuments. A matter is created automatically: folders, matter type, and owner all set.' },
        { ic: 'matter',  title: 'Lives in NetDocuments',   desc: 'A structured matter, single source of truth, with retention and security applied. There for the rest of its life.', isOutcome: true }
      ]
    }
  };

  // ----- Elements -----
  var cards      = root.querySelectorAll('[data-cbx-r-fd-card]');
  var journey    = root.querySelector('[data-cbx-r-fd-journey]');
  var reqTile    = root.querySelector('[data-cbx-r-fd-reqtile]');
  var reqText    = root.querySelector('[data-cbx-r-fd-reqtext]');
  var timelineEl = root.querySelector('[data-cbx-r-fd-timeline]');
  var payoff     = root.querySelector('[data-cbx-r-fd-payoff]');
  var payoffNum  = root.querySelector('[data-cbx-r-fd-payoff-num]');
  var payoffText = root.querySelector('[data-cbx-r-fd-payoff-text]');
  var progressEl = root.querySelector('[data-cbx-r-fd-progress]');
  var prevBtn    = root.querySelector('[data-cbx-r-fd-prev]');
  var playBtn    = root.querySelector('[data-cbx-r-fd-playpause]');
  var nextBtn    = root.querySelector('[data-cbx-r-fd-next]');

  // ----- State -----
  var pathKey = 'email';
  var step = 1;        // 1-based active step
  var playing = false;
  var ended = false;
  var timer = null;

  function path() { return PATHS[pathKey]; }
  function stepCount() { return path().steps.length; }

  // Build the timeline DOM + req chip + payoff text for a path
  function renderPath() {
    var p = path();
    journey.setAttribute('data-outcome', p.outcome);

    reqTile.className = 'cbx-r__fd-reqchip-tile ' + p.tile;
    reqTile.innerHTML = p.tileIcon;
    reqText.innerHTML = p.reqText;

    payoffNum.textContent = p.payoffNum;
    payoffText.innerHTML = p.payoffText;

    // Timeline rows
    var html = '';
    for (var i = 0; i < p.steps.length; i++) {
      var s = p.steps[i];
      html += '<li class="cbx-r__fd-tl-step' + (s.isOutcome ? ' is-outcome' : '') + '">' +
                '<span class="cbx-r__fd-tl-dot" aria-hidden="true">' + IC[s.ic] + '</span>' +
                '<div class="cbx-r__fd-tl-body">' +
                  '<div class="cbx-r__fd-tl-title">' + s.title + '</div>' +
                  '<div class="cbx-r__fd-tl-desc">' + s.desc + '</div>' +
                '</div>' +
              '</li>';
    }
    timelineEl.innerHTML = html;

    // Progress dots
    var pg = '';
    for (var j = 0; j < p.steps.length; j++) pg += '<span></span>';
    progressEl.innerHTML = pg;
  }

  function renderStep() {
    var rows = timelineEl.querySelectorAll('.cbx-r__fd-tl-step');
    for (var i = 0; i < rows.length; i++) {
      rows[i].classList.remove('is-active', 'is-done');
      if (i + 1 < step) rows[i].classList.add('is-done');
      else if (i + 1 === step) rows[i].classList.add('is-active');
    }
    var dots = progressEl.querySelectorAll('span');
    for (var k = 0; k < dots.length; k++) {
      if (k < step) dots[k].classList.add('is-on');
      else dots[k].classList.remove('is-on');
    }
    // Reveal payoff on the final step
    if (step >= stepCount()) payoff.classList.add('is-revealed');
    else payoff.classList.remove('is-revealed');

    prevBtn.disabled = (step <= 1) && !playing;
    setPlayIcon();
  }

  function setPlayIcon() {
    var state = ended ? 'replay' : (playing ? 'pause' : 'play');
    playBtn.setAttribute('data-state', state);
    var labels = { play: 'Play walkthrough', pause: 'Pause', replay: 'Replay' };
    playBtn.setAttribute('aria-label', labels[state]);
    playBtn.setAttribute('title', labels[state]);
  }

  function goToStep(n, keepPlaying) {
    step = Math.max(1, Math.min(stepCount(), n));
    if (step >= stepCount()) { ended = true; playing = false; clearTimeout(timer); }
    renderStep();
    if (keepPlaying && playing && step < stepCount()) {
      timer = setTimeout(function () { goToStep(step + 1, true); }, STEP_MS);
    }
  }

  function selectPath(key) {
    if (!PATHS[key]) return;
    pathKey = key;
    cards.forEach(function (c) {
      c.setAttribute('aria-selected', c.getAttribute('data-cbx-r-fd-card') === key ? 'true' : 'false');
    });
    clearTimeout(timer);
    playing = false;
    ended = false;
    step = 1;
    renderPath();
    renderStep();
  }

  function play() {
    if (ended) { // replay
      ended = false;
      step = 1;
      renderStep();
    }
    playing = true;
    setPlayIcon();
    if (step >= stepCount()) { goToStep(stepCount()); return; }
    timer = setTimeout(function () { goToStep(step + 1, true); }, STEP_MS);
  }

  function pause() {
    playing = false;
    clearTimeout(timer);
    setPlayIcon();
    renderStep();
  }

  // ----- Events -----
  cards.forEach(function (c) {
    c.addEventListener('click', function () { selectPath(c.getAttribute('data-cbx-r-fd-card')); });
  });

  playBtn.addEventListener('click', function () {
    if (playing) pause(); else play();
  });
  prevBtn.addEventListener('click', function () {
    pause();
    ended = false;
    goToStep(step - 1);
  });
  nextBtn.addEventListener('click', function () {
    pause();
    if (step < stepCount()) goToStep(step + 1);
    else { ended = true; goToStep(stepCount()); }
  });

  // ----- Init ----- (default to the NetDocuments path so it's always seen)
  selectPath('slack');
})();
