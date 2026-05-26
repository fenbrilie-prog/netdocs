/* ============================================================
   Checkbox × NetDocuments — Page-specific JS

   Drives the interactive lifecycle player in §3 (the dot-grid
   animation with play/pause/prev/next controls).

   Sits on top of the existing Checkbox landing JS
   (repettive-request js.js, which handles modal + smooth scroll).
   Load this AFTER the main JS in your Webflow embed.

   Self-contained IIFE. Safe to inline or load via <script src>.
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
