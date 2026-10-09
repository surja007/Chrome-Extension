// Job Queue Manager - FastApply-style queue system

class JobQueueManager {
  constructor() {
    this.queue = [];
    this.appliedJobs = new Set();
    this.blacklistedCompanies = new Set();
    this.processing = false;
    this.stopRequested = false;
  }

  stop() {
    this.stopRequested = true;
  }

  async initialize() {
    const data = await chrome.storage.local.get(['jobQueue', 'appliedJobs', 'blacklistedCompanies']);
    this.queue = data.jobQueue || [];
    this.appliedJobs = new Set(data.appliedJobs || []);
    this.blacklistedCompanies = new Set(data.blacklistedCompanies || []);
  }

  async addJob(job) {
    const jobId = this.generateJobId(job);

    // Check if already applied
    if (this.appliedJobs.has(jobId)) {
      return { success: false, reason: 'Already applied' };
    }

    // Check if the same job is already sitting in the queue
    if (this.queue.some(j => j.id === jobId)) {
      return { success: false, reason: 'Already in queue' };
    }

    // Check if company is blacklisted
    if (this.isCompanyBlacklisted(job.company)) {
      return { success: false, reason: 'Company blacklisted' };
    }
    
    // Add to queue
    this.queue.push({
      ...job,
      id: jobId,
      addedAt: Date.now(),
      status: 'pending',
      attempts: 0
    });
    
    await this.save();
    return { success: true, jobId };
  }

  async addMultipleJobs(jobs) {
    if (!Array.isArray(jobs)) return { added: 0, total: 0 };

    let added = 0;
    const queuedIds = new Set(this.queue.map(job => job.id));
    for (const job of jobs) {
      if (!job || typeof job !== 'object') continue;
      const jobId = this.generateJobId(job);
      if (this.appliedJobs.has(jobId) || queuedIds.has(jobId) || this.isCompanyBlacklisted(job.company)) continue;

      this.queue.push({
        ...job,
        id: jobId,
        addedAt: Date.now(),
        status: 'pending',
        attempts: 0
      });
      queuedIds.add(jobId);
      added++;
    }

    // One write for the batch instead of one write per scraped job.
    if (added > 0) await this.save();
    return { added, total: jobs.length };
  }

  generateJobId(job) {
    const str = `${job.company}-${job.title}-${job.location}`;
    return str.toLowerCase().replace(/[^a-z0-9]/g, '-');
  }

  isCompanyBlacklisted(company) {
    if (!company) return false;
    const normalized = company.toLowerCase().trim();
    return Array.from(this.blacklistedCompanies).some(bc => {
      const blocked = String(bc || '').toLowerCase().trim();
      return blocked.length > 0 && normalized.includes(blocked);
    });
  }

  async processQueue(profile, settings = {}) {
    if (this.processing) return { success: false, reason: 'Already processing' };

    this.processing = true;
    this.stopRequested = false;
    const results = { success: 0, failed: 0, skipped: 0 };
    const queueAtStart = [...this.queue];

    try {
      for (let index = 0; index < queueAtStart.length; index++) {
        if (this.stopRequested) {
          results.skipped += queueAtStart.length - index;
          break;
        }

        const job = queueAtStart[index];
        if (['completed', 'failed', 'review'].includes(job.status)) {
          results.skipped++;
          continue;
        }

        // Apply the configured rate limit, if enabled
        if (settings.rateLimiting && !this.stopRequested) {
          await this.checkRateLimit(settings);
        }
        if (this.stopRequested) {
          results.skipped += queueAtStart.length - index;
          break;
        }

        const result = await this.processJob(job, profile, settings);
        if (result && result.success) {
          job.status = 'completed';
          job.completedAt = Date.now();
          this.appliedJobs.add(job.id);
          results.success++;
        } else {
          job.attempts = (job.attempts || 0) + 1;
          if (job.attempts >= 3) {
            job.status = 'failed';
            job.failedReason = (result && result.reason) || 'Unknown error';
          }
          results.failed++;
        }

        await this.save();

        // Do not add an artificial per-field delay here; the only pause is
        // between separate job applications and remains rate-limited.
        if (index < queueAtStart.length - 1 && !this.stopRequested) {
          await this.waitUntilStopped(this.getRandomDelay(settings));
        }
      }
    } finally {
      this.processing = false;
    }

    return results;
  }

  async processJob(job, profile, settings = {}) {
    let tab;
    let timeoutId;
    try {
      // Open job in new tab
      tab = await chrome.tabs.create({ url: job.url, active: false });

      // Wait for page load
      await this.waitForTabLoad(tab.id);

      // Bound the response wait so a missing content script cannot stall the queue.
      const timeout = new Promise(resolve => {
        timeoutId = setTimeout(() => resolve({
          success: false,
          reason: 'Timed out waiting for the page to respond'
        }), 120000);
      });
      const response = await Promise.race([
        chrome.tabs.sendMessage(tab.id, { action: 'applyToJob', job, profile, settings }),
        timeout
      ]);

      return response || { success: false, reason: 'No response from page' };
    } catch (error) {
      return { success: false, reason: error.message };
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      // Always close the tab — but only AFTER the apply finished
      if (tab) {
        try { await chrome.tabs.remove(tab.id); } catch (e) { /* already closed */ }
      }
    }
  }

  async checkRateLimit(settings) {
    const limits = settings.rateLimits || { hourly: 10, daily: 50 };
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const oneDay = 24 * oneHour;

    const recentApps = Array.from(this.appliedJobs).filter(id => {
      const job = this.queue.find(j => j.id === id);
      return job && job.completedAt && (now - job.completedAt < oneDay);
    });

    const hourlyApps = recentApps.filter(id => {
      const job = this.queue.find(j => j.id === id);
      return now - job.completedAt < oneHour;
    });

    // Wait if limits exceeded
    if (hourlyApps.length >= limits.hourly) {
      const oldestApp = Math.min(...hourlyApps.map(id => {
        const job = this.queue.find(j => j.id === id);
        return job.completedAt;
      }));
      const waitTime = Math.max(0, oneHour - (now - oldestApp));
      await this.waitUntilStopped(waitTime);
    }
  }

  getRandomDelay(settings = {}) {
    const min = Math.max(0, Number(settings.minDelay) || 30000);
    const max = Math.max(min, Number(settings.maxDelay) || 120000);
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  async blacklistCompany(company) {
    const normalized = String(company || '').toLowerCase().trim();
    if (!normalized) return false;
    this.blacklistedCompanies.add(normalized);
    await this.save();
    return true;
  }

  async removeFromBlacklist(company) {
    const normalized = String(company || '').toLowerCase().trim();
    if (!normalized) return false;
    this.blacklistedCompanies.delete(normalized);
    await this.save();
    return true;
  }

  getStats() {
    const pending = this.queue.filter(j => j.status === 'pending').length;
    const completed = this.queue.filter(j => j.status === 'completed').length;
    const failed = this.queue.filter(j => j.status === 'failed').length;

    return {
      total: this.queue.length,
      pending,
      completed,
      failed,
      blacklisted: this.blacklistedCompanies.size
    };
  }

  async clearQueue() {
    this.queue = [];
    await this.save();
  }

  async save() {
    await chrome.storage.local.set({
      jobQueue: this.queue,
      appliedJobs: Array.from(this.appliedJobs),
      blacklistedCompanies: Array.from(this.blacklistedCompanies)
    });
  }

  waitForTabLoad(tabId, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let timer;

      const finish = (error = null) => {
        if (settled) return;
        settled = true;
        chrome.tabs.onUpdated.removeListener(listener);
        clearTimeout(timer);
        if (error) reject(error);
        else setTimeout(resolve, 500); // small page-settle allowance
      };

      const listener = (updatedTabId, changeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') finish();
      };

      timer = setTimeout(() => finish(new Error('Timed out waiting for the job page to load')), timeoutMs);
      chrome.tabs.onUpdated.addListener(listener);

      // Avoid missing the complete event if it fired before the listener was added
      chrome.tabs.get(tabId)
        .then(tab => { if (tab && tab.status === 'complete') finish(); })
        .catch(error => finish(error));
    });
  }

  async waitUntilStopped(ms) {
    const deadline = Date.now() + Math.max(0, ms);
    while (!this.stopRequested && Date.now() < deadline) {
      await this.wait(Math.min(500, deadline - Date.now()));
    }
  }

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

if (typeof window !== 'undefined') {
  window.JobQueueManager = JobQueueManager;
}
