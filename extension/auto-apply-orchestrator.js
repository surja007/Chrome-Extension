// ============================================================================
// AUTO-APPLY ORCHESTRATOR (background service worker)
// ----------------------------------------------------------------------------
// Drives the job queue: opens each job in a background tab, tells the content
// script to apply, records the result, waits a human-like delay, and moves on.
//
// Why it is built this way:
//  - Manifest V3 kills the service worker after ~30s idle, so ALL state lives
//    in chrome.storage.local and every wait is backed by a chrome.alarms
//    watchdog. If the worker is killed mid-job, the alarm wakes it up and
//    processing resumes (or the stuck job is failed and skipped).
//  - No long-running loops in popup/queue pages: those die when the tab closes.
// ============================================================================

const AUTO_APPLY_ALARM = 'jobpilot-auto-apply';
const STATE_KEY = 'autoApplyState';

const STAGE = {
  IDLE: 'idle',         // ready to start the next job
  LOADING: 'loading',   // tab opened, waiting for page load
  APPLYING: 'applying', // content script is filling/submitting
  WAITING: 'waiting',   // sleeping between jobs (or waiting out the rate limit)
  DONE: 'done'
};

// How long a job may stay in a stage before the watchdog recovers it
const STUCK_LIMITS = {
  [STAGE.LOADING]: 90 * 1000,
  [STAGE.APPLYING]: 180 * 1000
};

class AutoApplyOrchestrator {
  constructor(deps = {}) {
    this.storage = deps.storage || (typeof StorageManager !== 'undefined' ? new StorageManager() : null);
    this.queueManager = deps.queueManager || (typeof JobQueueManager !== 'undefined' ? new JobQueueManager() : null);
  }

  // ------------------------------------------------------------------ state
  async getState() {
    const data = await chrome.storage.local.get(STATE_KEY);
    return data[STATE_KEY] || { isRunning: false, stage: STAGE.IDLE, queue: [] };
  }

  async saveState(patch) {
    const current = await this.getState();
    const state = { ...current, ...patch, updatedAt: Date.now() };
    await chrome.storage.local.set({ [STATE_KEY]: state });
    return state;
  }

  // ------------------------------------------------------------------ start
  async start(options = {}) {
    const existing = await this.getState();
    if (existing.isRunning) {
      return { success: false, message: existing.paused
        ? 'Auto-apply is paused. Resume the existing run instead of starting another.'
        : 'Auto-apply is already running' };
    }

    const profile = options.profile || (this.storage ? await this.storage.getProfile() : null);
    const storedSettings = this.storage ? await this.storage.getSettings() : {};
    const settings = { ...storedSettings, ...(options.settings || {}) };

    if (!profile || !profile.fullName || !profile.email) {
      return { success: false, message: 'Save your profile (name + email) in the popup or Settings page first.' };
    }

    // Build the work queue: explicit jobs win, otherwise use the stored queue
    if (this.queueManager) {
      await this.queueManager.initialize();
      if (options.jobs && options.jobs.length) {
        await this.queueManager.addMultipleJobs(options.jobs);
      }
    }

    const storedQueue = this.queueManager ? this.queueManager.queue : [];
    // Jobs requiring manual review are deliberately not auto-run again. The
    // user can inspect/submit them, while a new run handles only pending jobs.
    const queue = storedQueue.filter(j => j && (!j.status || j.status === 'pending'));

    if (queue.length === 0) {
      return { success: false, message: 'No pending jobs in the queue. Scrape or import jobs first.' };
    }

    // Skip jobs already applied in a previous run
    if (this.queueManager) {
      for (const job of queue) {
        if (this.queueManager.appliedJobs.has(job.id)) {
          job.status = 'completed';
          job.skippedDuplicate = true;
        }
      }
    }

    const platforms = [...new Set(queue.map(j => j.platform || 'unknown'))];

    await this.saveState({
      isRunning: true,
      paused: false,
      stopped: false,
      completed: false,
      stage: STAGE.IDLE,
      queue,
      currentIndex: 0,
      currentTabId: null,
      currentJob: null,
      reviewJob: null,
      results: { success: 0, failed: 0, skipped: 0 },
      totalApplied: 0,
      platforms: platforms.map(name => ({ name, applied: 0 })),
      currentPlatformIndex: 0,
      profile,
      settings,
      pauseReason: null,
      startedAt: Date.now()
    });

    // Fire and forget: alarms + tab events keep the worker alive from here
    this.processNext();

    return { success: true, message: `Auto-apply started: ${queue.length} job(s) queued`, jobs: queue.length };
  }

  async startFromStorage() {
    return this.start({});
  }

  // ------------------------------------------------------------------ stop
  async stop() {
    const state = await this.getState();
    await this.saveState({
      isRunning: false,
      stopped: true,
      paused: false,
      stage: STAGE.IDLE,
      currentTabId: null,
      pauseReason: null
    });
    await chrome.alarms.clear(AUTO_APPLY_ALARM);
    if (state.currentTabId) {
      try { await chrome.tabs.remove(state.currentTabId); } catch (e) { /* already gone */ }
    }
    await this.syncQueueBack(state);
  }

  async pause() {
    const state = await this.getState();
    if (!state.isRunning) return { success: false, message: 'Auto-apply is not running' };

    await this.saveState({ paused: true, pauseReason: 'Paused by user' });
    // Let a currently loading/applying job finish and keep its watchdog. If the
    // engine is idle or between jobs, clear its alarm; Resume restarts it.
    if (state.stage === STAGE.IDLE || state.stage === STAGE.WAITING) {
      await chrome.alarms.clear(AUTO_APPLY_ALARM);
    }
    return { success: true };
  }

  async resume() {
    const state = await this.getState();
    if (!state.isRunning) {
      return { success: false, message: 'Auto-apply is not running' };
    }
    if (!state.paused) {
      return { success: false, message: 'Auto-apply is not paused' };
    }

    const shouldStartNext = state.stage === STAGE.IDLE || state.stage === STAGE.WAITING;
    await this.saveState({
      paused: false,
      pauseReason: null,
      stage: shouldStartNext ? STAGE.IDLE : state.stage
    });
    if (shouldStartNext) this.processNext();
    return { success: true };
  }

  // ------------------------------------------------------------------ engine
  // Guard against concurrent entry: start(), alarms and tab events can all
  // trigger processNext in the same tick, which would open duplicate tabs.
  async processNext() {
    if (this._processingNext) return;
    this._processingNext = true;
    try {
      await this._processNext();
    } finally {
      this._processingNext = false;
    }
  }

  async _processNext() {
    try {
      const state = await this.getState();
      if (!state.isRunning || state.paused || state.stopped) return;
      if (state.stage !== STAGE.IDLE && state.stage !== STAGE.WAITING) return;

      // Skip completed/review entries and reject unsupported URLs before
      // opening a tab. Scraping supports several sites, but applying is
      // implemented only for LinkedIn Easy Apply.
      let queueChanged = false;
      const originalIndex = state.currentIndex;
      while (state.currentIndex < state.queue.length) {
        const candidate = state.queue[state.currentIndex];
        if (['completed', 'failed', 'review'].includes(candidate.status)) {
          state.currentIndex++;
          continue;
        }

        let parsedUrl;
        try {
          if (!candidate.url) throw new Error('Job has no URL');
          parsedUrl = new URL(candidate.url);
        } catch (error) {
          candidate.status = 'failed';
          candidate.lastError = error.message || 'Invalid job URL';
          state.currentIndex++;
          queueChanged = true;
          continue;
        }

        if (parsedUrl.protocol !== 'https:' ||
            !['www.linkedin.com', 'linkedin.com'].includes(parsedUrl.hostname) ||
            !parsedUrl.pathname.startsWith('/jobs/')) {
          candidate.status = 'failed';
          candidate.lastError = `Auto-apply currently supports LinkedIn Easy Apply only (unsupported URL: ${parsedUrl.hostname}).`;
          state.currentIndex++;
          queueChanged = true;
          continue;
        }

        // Content scripts are registered on www.linkedin.com only.
        if (parsedUrl.hostname === 'linkedin.com') {
          parsedUrl.hostname = 'www.linkedin.com';
          candidate.url = parsedUrl.href;
          queueChanged = true;
        }
        break;
      }

      if (queueChanged || state.currentIndex !== originalIndex) {
        await this.saveState({ queue: state.queue, currentIndex: state.currentIndex });
      }

      if (state.currentIndex >= state.queue.length) {
        await this.finish(state);
        return;
      }

      const job = state.queue[state.currentIndex];

      // Rate limit (hourly) — resumes automatically when the window resets
      const rateLimit = await this.checkRateLimit();
      if (!rateLimit.allowed) {
        const waitMs = Math.min(rateLimit.resetIn + 5000, 60 * 60 * 1000);
        await this.saveState({
          stage: STAGE.WAITING,
          nextRunAt: Date.now() + waitMs,
          pauseReason: `Hourly rate limit reached — resuming in ${Math.ceil(waitMs / 60000)} min`
        });
        await chrome.alarms.create(AUTO_APPLY_ALARM, { when: Date.now() + waitMs });
        return;
      }

      // Re-check right before opening a tab (stop/pause may have landed meanwhile)
      const fresh = await this.getState();
      if (!fresh.isRunning || fresh.paused || fresh.stopped) return;

      // Track which platform we are on (for the progress tracker UI)
      const platformIndex = (state.platforms || []).findIndex(p => p.name === (job.platform || 'unknown'));

      await this.saveState({
        stage: STAGE.LOADING,
        currentTabId: null,
        currentJob: { title: job.title, company: job.company, url: job.url },
        currentPlatformIndex: platformIndex === -1 ? 0 : platformIndex,
        pauseReason: null
      });

      let tab;
      try {
        tab = await chrome.tabs.create({ url: job.url, active: false });
      } catch (error) {
        job.status = 'failed';
        job.lastError = error.message;
        await this.saveState({ queue: state.queue, stage: STAGE.IDLE, currentJob: null });
        return this._processNext();
      }

      await this.saveState({ currentTabId: tab.id });

      // Watchdog in case the load event never fires or the worker is killed
      await chrome.alarms.create(AUTO_APPLY_ALARM, { when: Date.now() + STUCK_LIMITS[STAGE.LOADING] });
    } catch (error) {
      console.error('[JobPilot] processNext error:', error);
    }
  }

  // Called from the background's chrome.tabs.onUpdated listener
  async handleTabUpdated(tabId, changeInfo) {
    try {
      const state = await this.getState();
      if (!state.isRunning || state.currentTabId !== tabId) return;
      if (changeInfo.status !== 'complete' || state.stage !== STAGE.LOADING) return;

      // Guard against duplicate 'complete' events firing the apply twice
      if (this._applyInFlight === tabId) return;
      this._applyInFlight = tabId;
      try {
        await this.sendApplyCommand(state);
      } finally {
        this._applyInFlight = null;
      }
    } catch (error) {
      console.error('[JobPilot] handleTabUpdated error:', error);
    }
  }

  // Called from the background's chrome.tabs.onRemoved listener
  async handleTabRemoved(tabId) {
    try {
      const state = await this.getState();
      if (!state.isRunning || state.currentTabId !== tabId) return;
      if (state.stage === STAGE.IDLE || state.stage === STAGE.WAITING) return;

      // The tab was closed (by the user or by us after a result). If a job is
      // still in flight, count it as failed and move on.
      if (state.stage === STAGE.LOADING || state.stage === STAGE.APPLYING) {
        const expectedIndex = state.currentIndex;
        await this.saveState({ stage: STAGE.IDLE, currentTabId: null, currentJob: null });
        await this.handleJobResult(
          { success: false, reason: 'Job tab was closed before the application finished' },
          expectedIndex
        );
      }
    } catch (error) {
      console.error('[JobPilot] handleTabRemoved error:', error);
    }
  }

  // Called from the background's chrome.alarms.onAlarm listener
  async handleAlarm(alarm) {
    if (alarm.name !== AUTO_APPLY_ALARM) return;

    try {
      const state = await this.getState();
      if (!state.isRunning) return;
      // A paused job may finish its current page, but it must not start the
      // next job when the between-job alarm fires.
      if (state.paused && (state.stage === STAGE.IDLE || state.stage === STAGE.WAITING)) return;

      if (state.stage === STAGE.WAITING) {
        if (Date.now() >= (state.nextRunAt || 0)) {
          await this.saveState({ stage: STAGE.IDLE });
          this.processNext();
        } else {
          // Alarms may be delivered early in some environments; re-arm rather
          // than leaving the queue stuck in WAITING.
          await chrome.alarms.create(AUTO_APPLY_ALARM, { when: state.nextRunAt });
        }
        return;
      }

      if (state.stage === STAGE.IDLE) {
        this.processNext();
        return;
      }

      // Stuck in LOADING/APPLYING (worker was killed, page hung, event missed)
      const stuckFor = Date.now() - (state.updatedAt || 0);
      const limit = STUCK_LIMITS[state.stage] || STUCK_LIMITS[STAGE.APPLYING];

      if (stuckFor <= limit) {
        // Not stuck yet — re-arm the watchdog
        await chrome.alarms.create(AUTO_APPLY_ALARM, { when: Date.now() + (limit - stuckFor) });
        return;
      }

      console.warn('[JobPilot] Recovering stuck job:', state.currentJob);

      if (state.stage === STAGE.LOADING) {
        // The load event may have been missed — try starting the apply anyway
        await this.sendApplyCommand(state);
        return;
      }

      // APPLYING for too long — claim the result before removing the tab to
      // avoid racing the tabs.onRemoved handler and processing twice.
      const timedOutTabId = state.currentTabId;
      const expectedIndex = state.currentIndex;
      await this.saveState({ stage: STAGE.IDLE, currentTabId: null, currentJob: null });
      if (timedOutTabId) {
        try { await chrome.tabs.remove(timedOutTabId); } catch (e) { /* already gone */ }
      }
      await this.handleJobResult(
        { success: false, reason: 'Timed out waiting for the application to finish' },
        expectedIndex
      );
    } catch (error) {
      console.error('[JobPilot] handleAlarm error:', error);
    }
  }

  // ------------------------------------------------------------- apply step
  async sendApplyCommand(state) {
    const expectedIndex = state.currentIndex;
    const job = state.queue[expectedIndex];
    if (!job) return;

    await this.saveState({ stage: STAGE.APPLYING });

    // Watchdog for the apply step itself
    await chrome.alarms.create(AUTO_APPLY_ALARM, { when: Date.now() + STUCK_LIMITS[STAGE.APPLYING] });

    try {
      const response = await chrome.tabs.sendMessage(state.currentTabId, {
        action: 'applyToJob',
        job,
        profile: state.profile,
        settings: state.settings
      });
      await this.handleJobResult(response, expectedIndex);
    } catch (error) {
      // "Receiving end does not exist" = content script not injected (e.g. the
      // job URL is not a supported page, or the page failed to load)
      await this.handleJobResult({ success: false, reason: error.message }, expectedIndex);
    }
  }

  async handleJobResult(response, expectedIndex = null) {
    const state = await this.getState();
    if (!state.isRunning) return;
    // Tab-close and timeout handlers can race with tabs.sendMessage. Ignore any
    // late duplicate result once the current job index has advanced.
    if (expectedIndex !== null && state.currentIndex !== expectedIndex) return;

    const job = state.queue[state.currentIndex];
    if (!job) {
      await this.finish(state);
      return;
    }

    const tabId = state.currentTabId;
    const needsReview = response && response.state === 'DONE' && response.submitted === false;

    if (needsReview) {
      // Preserve the filled form for the user. Do not auto-submit or close the
      // tab when profile data is missing or Auto-submit is disabled.
      job.status = 'review';
      job.lastError = response.reason || 'Filled — review and submit manually';
      const results = {
        success: state.totalApplied || 0,
        failed: state.queue.filter(item => item.status === 'failed').length,
        skipped: state.queue.filter(item => item.status === 'pending' || item.status === 'review').length
      };
      const updatedState = await this.saveState({
        isRunning: false,
        paused: false,
        completed: true,
        stage: STAGE.DONE,
        queue: state.queue,
        results,
        reviewJob: { id: job.id, title: job.title, company: job.company, url: job.url },
        currentTabId: null,
        currentJob: null,
        currentIndex: state.currentIndex + 1,
        pauseReason: 'Review the open job tab before continuing.'
      });

      await this.syncQueueBack(updatedState);
      await chrome.alarms.clear(AUTO_APPLY_ALARM);
      if (tabId) {
        try { await chrome.tabs.update(tabId, { active: true }); } catch (e) { /* tab may have closed */ }
      }
      try {
        await chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icon128.png',
          title: 'JobPilot — review required',
          message: `Review and submit manually: ${job.title || 'job'}${job.company ? ` at ${job.company}` : ''}`
        });
      } catch (e) { /* notification permission may be unavailable */ }
      chrome.runtime.sendMessage({ action: 'autoApplyReviewRequired', job: updatedState.reviewJob }).catch(() => {});
      return;
    }

    if (response && response.success) {
      job.status = 'completed';
      job.completedAt = Date.now();
      state.totalApplied++;

      const platform = (state.platforms || []).find(p => p.name === (job.platform || 'unknown'));
      if (platform) platform.applied++;

      if (this.queueManager) {
        this.queueManager.appliedJobs.add(job.id);
        await this.queueManager.save();
      }
    } else {
      job.attempts = (job.attempts || 0) + 1;
      job.status = 'failed';
      job.lastError = (response && (response.reason || response.error)) || 'Unknown error';
    }

    // Persist advancement before closing the tab, so onRemoved cannot process
    // the same job a second time.
    await this.saveState({
      queue: state.queue,
      stage: STAGE.IDLE,
      currentTabId: null,
      currentJob: null,
      currentIndex: state.currentIndex + 1
    });

    if (tabId) {
      try { await chrome.tabs.remove(tabId); } catch (e) { /* already gone */ }
    }

    // Human-like pause between applications. If the user paused while this job
    // was running, leave the engine idle for Resume instead of scheduling work.
    const latest = await this.getState();
    if (latest.paused) return;

    const delay = this.getDelay(latest.settings);
    const nextRunAt = Date.now() + delay;
    await this.saveState({ stage: STAGE.WAITING, nextRunAt });
    await chrome.alarms.create(AUTO_APPLY_ALARM, { when: nextRunAt });
  }

  // ------------------------------------------------------------------ finish
  async finish(state) {
    state = state || await this.getState();

    const results = { success: 0, failed: 0, skipped: 0 };
    for (const job of state.queue) {
      if (job.status === 'completed' && !job.skippedDuplicate) results.success++;
      else if (job.status === 'failed') results.failed++;
      else results.skipped++; // pending, review, duplicates
    }

    await this.saveState({
      isRunning: false,
      stage: STAGE.DONE,
      completed: true,
      results,
      currentTabId: null,
      currentJob: null,
      reviewJob: null,
      pauseReason: null
    });

    await this.syncQueueBack(state);
    await chrome.alarms.clear(AUTO_APPLY_ALARM);

    const message = `Auto-apply finished: ${results.success} applied, ${results.failed} failed, ${results.skipped} skipped.`;
    console.log('[JobPilot]', message);

    chrome.runtime.sendMessage({ action: 'autoApplyFinished', results }).catch(() => {});

    try {
      await chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon128.png',
        title: 'JobPilot',
        message
      });
    } catch (e) { /* notifications permission optional at runtime */ }
  }

  // ------------------------------------------------------------- helpers
  async checkRateLimit() {
    const data = await chrome.storage.local.get('rateLimitData');
    const rateLimitData = data.rateLimitData || { applications: [], hourlyLimit: 10 };
    const now = Date.now();
    const applications = Array.isArray(rateLimitData.applications) ? rateLimitData.applications : [];
    const recent = applications
      .map(Number)
      .filter(timestamp => Number.isFinite(timestamp) && timestamp > now - 60 * 60 * 1000)
      .sort((a, b) => a - b);
    const hourlyLimit = Math.max(1, Number(rateLimitData.hourlyLimit) || 10);

    if (recent.length >= hourlyLimit) {
      return {
        allowed: false,
        resetIn: recent[0] + 60 * 60 * 1000 - now
      };
    }
    return { allowed: true };
  }

  getDelay(settings = {}) {
    const min = settings.minDelay ?? 30 * 1000;
    const max = settings.maxDelay ?? 120 * 1000;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  // Persist the queue (with final statuses) back to jobQueue storage so the
  // Queue Manager page reflects what happened
  async syncQueueBack(state) {
    if (!this.queueManager) return;
    try {
      await this.queueManager.initialize();
      const byId = new Map(this.queueManager.queue.map(j => [j.id, j]));
      for (const job of state.queue) {
        if (byId.has(job.id)) {
          byId.get(job.id).status = job.status;
          byId.get(job.id).attempts = job.attempts || 0;
          byId.get(job.id).lastError = job.lastError;
          byId.get(job.id).completedAt = job.completedAt;
        } else {
          this.queueManager.queue.push(job);
        }
      }
      await this.queueManager.save();
    } catch (error) {
      console.error('[JobPilot] Failed to sync queue back:', error);
    }
  }
}

// Make available globally (pages) and in the service worker (importScripts)
if (typeof window !== 'undefined') {
  window.AutoApplyOrchestrator = AutoApplyOrchestrator;
}
