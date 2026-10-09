let queueManager;
    let storage;
    let pollInterval = null;
    let latestState = null;
    let lastReloadedStateTime = null;

    // Initialize
    (async () => {
      // StorageManager is a class — it must be instantiated before use
      storage = new StorageManager();
      queueManager = new JobQueueManager();
      await queueManager.initialize();
      renderQueue(null);
      updateStats(null);
      // Pick up a queue that is already running (started from popup/shortcut)
      startPolling();
      pollState();
    })();

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text == null ? '' : String(text);
      return div.innerHTML;
    }

    // While the background engine runs it owns the queue statuses
    function getDisplayQueue(state = latestState) {
      if (state && state.isRunning && Array.isArray(state.queue) && state.queue.length) {
        return state.queue;
      }
      return queueManager.queue;
    }

    // Render queue
    function renderQueue(state = latestState) {
      const list = document.getElementById('jobList');
      const filterStatus = document.getElementById('filterStatus').value;
      const filterPlatform = document.getElementById('filterPlatform').value;
      const filterSearch = document.getElementById('filterSearch').value.toLowerCase();

      let jobs = getDisplayQueue(state).filter(job => {
        if (filterStatus !== 'all' && job.status !== filterStatus) return false;
        if (filterPlatform !== 'all' && job.platform !== filterPlatform) return false;
        if (filterSearch) {
          const text = `${job.title} ${job.company}`.toLowerCase();
          if (!text.includes(filterSearch)) return false;
        }
        return true;
      });

      if (jobs.length === 0) {
        list.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">📭</div>
            <h3>No jobs found</h3>
            <p>Try adjusting your filters</p>
          </div>
        `;
        return;
      }

      list.innerHTML = jobs.map(job => `
        <div class="job-item" data-id="${escapeHtml(job.id)}">
          <input type="checkbox" class="job-checkbox" ${job.status === 'completed' ? 'checked disabled' : ''}>
          <div class="job-icon">${getPlatformIcon(job.platform)}</div>
          <div class="job-info">
            <div class="job-title">${escapeHtml(job.title)}</div>
            <div class="job-company">${escapeHtml(job.company)}</div>
            <div class="job-meta">${escapeHtml(job.location)} • ${escapeHtml(job.platform)}</div>
            ${job.lastError ? `<div class="job-error">⚠️ ${escapeHtml(job.lastError)}</div>` : ''}
          </div>
          <span class="job-status status-${escapeHtml(job.status)}">${escapeHtml(job.status)}</span>
          <div class="job-actions">
            <button class="icon-btn" data-action="open" data-url="${escapeHtml(encodeURIComponent(job.url || ''))}" title="Open">🔗</button>
            <button class="icon-btn" data-action="blacklist" title="Blacklist">🚫</button>
            <button class="icon-btn" data-action="remove" title="Remove">🗑️</button>
          </div>
        </div>
      `).join('');
    }

    function getPlatformIcon(platform) {
      const icons = {
        linkedin: '💼',
        naukri: '📋',
        indeed: '🔍'
      };
      return icons[platform] || '📄';
    }

    function updateStats(state = latestState) {
      const jobs = getDisplayQueue(state);
      const pending = jobs.filter(j => j.status === 'pending' || j.status === 'review').length;
      const completed = jobs.filter(j => j.status === 'completed').length;
      const failed = jobs.filter(j => j.status === 'failed').length;

      document.getElementById('statPending').textContent = pending;
      document.getElementById('statCompleted').textContent = completed;
      document.getElementById('statFailed').textContent = failed;
      document.getElementById('statBlacklisted').textContent = queueManager.getStats().blacklisted;

      const progress = jobs.length > 0 ? (completed / jobs.length * 100) : 0;
      document.getElementById('progressFill').style.width = progress + '%';

      updateRunStatus(state);
    }

    function updateRunStatus(state) {
      const el = document.getElementById('runStatus');
      if (!state || !state.isRunning) {
        if (state && state.reviewJob) {
          el.className = 'run-status active';
          el.textContent = `⏸ Review required: ${state.reviewJob.title || 'application'}${state.reviewJob.company ? ' @ ' + state.reviewJob.company : ''}. The job tab was brought to the front; submit manually, then start the queue again.`;
        } else if (state && state.stage === 'done' && state.results) {
          el.className = 'run-status active';
          el.textContent = `✅ Last run finished: ${state.results.success} applied, ${state.results.failed} failed, ${state.results.skipped} skipped`;
        } else {
          el.className = 'run-status';
          el.textContent = '';
        }
        return;
      }

      const r = state.results || { success: 0, failed: 0, skipped: 0 };
      const job = state.currentJob;
      let text = `🤖 Auto-apply running (${state.stage})`;
      if (job && job.title) text += ` — ${job.title}${job.company ? ' @ ' + job.company : ''}`;
      text += ` | ✅ ${r.success} applied · ❌ ${r.failed} failed`;
      if (state.pauseReason) text += ` | ⏸ ${state.pauseReason}`;

      el.className = 'run-status active';
      el.textContent = text;
    }

    // Poll the background engine so the UI stays in sync even if it was
    // started from the popup or a keyboard shortcut
    async function pollState() {
      try {
        const state = await chrome.runtime.sendMessage({ action: 'getAutoApplyState' });
        latestState = state || null;
        renderQueue(latestState);
        updateStats(latestState);

        const startBtn = document.getElementById('startQueue');
        const pauseBtn = document.getElementById('pauseQueue');
        const stopBtn = document.getElementById('stopQueue');

        if (state && state.isRunning) {
          startBtn.disabled = true;
          pauseBtn.disabled = false;
          pauseBtn.textContent = state.paused ? '▶️ Resume' : '⏸️ Pause';
          stopBtn.disabled = false;
        } else {
          startBtn.disabled = false;
          pauseBtn.disabled = true;
          pauseBtn.textContent = '⏸️ Pause';
          stopBtn.disabled = true;
          // A run just finished — reload the persisted queue with final statuses
          if (state && state.stage === 'done' && state.updatedAt !== lastReloadedStateTime) {
            lastReloadedStateTime = state.updatedAt;
            await queueManager.initialize();
            renderQueue(state);
            updateStats(state);
          }
        }
      } catch (error) {
        // Background worker may be restarting; try again on the next tick
      }
    }

    function startPolling() {
      if (pollInterval) return;
      pollInterval = setInterval(pollState, 2000);
    }

    // Start queue processing (runs in the background worker, survives tab close)
    document.getElementById('startQueue').addEventListener('click', async () => {
      const btn = document.getElementById('startQueue');
      btn.disabled = true;

      try {
        const response = await chrome.runtime.sendMessage({ action: 'startAutoApply' });
        if (!response || !response.success) {
          alert('❌ Could not start auto-apply: ' + (response ? response.message : 'background worker unreachable'));
          btn.disabled = false;
          return;
        }
        startPolling();
        pollState();
      } catch (error) {
        alert('❌ Could not reach the background worker: ' + error.message);
        btn.disabled = false;
      }
    });

    // Pause/resume after the current application step
    document.getElementById('pauseQueue').addEventListener('click', async () => {
      const action = latestState && latestState.paused ? 'resumeAutoApply' : 'pauseAutoApply';
      const response = await chrome.runtime.sendMessage({ action });
      if (response && response.message && !response.success) alert(response.message);
      pollState();
    });

    // Stop queue
    document.getElementById('stopQueue').addEventListener('click', async () => {
      await chrome.runtime.sendMessage({ action: 'stopAutoApply' });
      pollState();
    });

    // Scrape jobs from a job-search tab (passed explicitly, because the active
    // tab while using this page is this page itself)
    document.getElementById('scrapeJobs').addEventListener('click', async () => {
      const btn = document.getElementById('scrapeJobs');
      btn.disabled = true;

      try {
        // Find the best tab to scrape: prefer the active non-extension tab,
        // otherwise any LinkedIn/Naukri/Indeed tab
        const tabs = await chrome.tabs.query({});
        const jobSites = tabs.filter(t =>
          t.url && /(linkedin\.com|naukri\.com|indeed\.(com|co\.in))/.test(t.url)
        );
        const target = jobSites.find(t => t.active) || jobSites[0] || null;

        if (!target) {
          alert('Open a LinkedIn, Naukri or Indeed job search page in another tab first.');
          return;
        }

        const response = await chrome.runtime.sendMessage({
          action: 'scrapeJobs',
          tabId: target.id,
          easyApplyOnly: true
        });

        if (response && response.success) {
          const result = await queueManager.addMultipleJobs(response.jobs || []);
          renderQueue(null);
          updateStats(null);
          alert(`Added ${result.added} of ${(response.jobs || []).length} jobs to the queue!`);
        } else {
          alert('❌ ' + ((response && response.error) || 'Scraping failed'));
        }
      } catch (error) {
        alert('❌ Scraping failed: ' + error.message);
      } finally {
        btn.disabled = false;
      }
    });
    // Clear completed
    document.getElementById('clearCompleted').addEventListener('click', async () => {
      queueManager.queue = queueManager.queue.filter(j => j.status !== 'completed');
      await queueManager.save();
      renderQueue();
      updateStats();
    });
    
    // Export queue
    document.getElementById('exportQueue').addEventListener('click', () => {
      const data = JSON.stringify({
        queue: queueManager.queue,
        blacklist: Array.from(queueManager.blacklistedCompanies),
        exportedAt: new Date().toISOString()
      }, null, 2);
      
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `jobpilot-queue-${Date.now()}.json`;
      a.click();
    });
    
    // Import queue
    document.getElementById('importQueue').addEventListener('click', () => {
      document.getElementById('importFile').click();
    });
    
    document.getElementById('importFile').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const text = await file.text();
      const data = JSON.parse(text);
      
      await queueManager.addMultipleJobs(data.queue || []);
      if (Array.isArray(data.blacklist)) {
        for (const company of data.blacklist) {
          await queueManager.blacklistCompany(company);
        }
      }
      
      renderQueue();
      updateStats();
      alert('Queue imported successfully!');
    });
    
    // Filters
    document.getElementById('filterStatus').addEventListener('change', () => renderQueue());
    document.getElementById('filterPlatform').addEventListener('change', () => renderQueue());
    document.getElementById('filterSearch').addEventListener('input', () => renderQueue());
    
    // Event delegation avoids inline handlers, which are unsafe for job data
    // scraped from external pages.
    document.getElementById('jobList').addEventListener('click', async (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const item = button.closest('.job-item');
      if (!item) return;
      const job = getDisplayQueue().find(candidate => String(candidate.id) === item.dataset.id);
      if (!job) return;

      try {
        if (button.dataset.action === 'open') {
          const url = new URL(decodeURIComponent(button.dataset.url || ''));
          if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only web URLs can be opened.');
          await chrome.tabs.create({ url: url.href });
        } else if (button.dataset.action === 'blacklist') {
          if (!job.company) throw new Error('This job has no company name to blacklist.');
          await queueManager.blacklistCompany(job.company);
          await queueManager.initialize();
          renderQueue();
          updateStats();
          alert(`${job.company} blacklisted!`);
        } else if (button.dataset.action === 'remove') {
          queueManager.queue = queueManager.queue.filter(candidate => String(candidate.id) !== String(job.id));
          await queueManager.save();
          renderQueue();
          updateStats();
        }
      } catch (error) {
        alert('Action failed: ' + error.message);
      }
    });
