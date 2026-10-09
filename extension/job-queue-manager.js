// Job Queue Manager - FastApply-style queue system

class JobQueueManager {
  constructor() {
    this.queue = [];
    this.appliedJobs = new Set();
    this.blacklistedCompanies = new Set();
    this.processing = false;
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
    let added = 0;
    for (const job of jobs) {
      const result = await this.addJob(job);
      if (result.success) added++;
    }
    return { added, total: jobs.length };
  }

  generateJobId(job) {
    const str = `${job.company}-${job.title}-${job.location}`;
    return str.toLowerCase().replace(/[^a-z0-9]/g, '-');
  }

  isCompanyBlacklisted(company) {
    if (!company) return false;
    const normalized = company.toLowerCase().trim();
    return Array.from(this.blacklistedCompanies).some(bc => 
      normalized.includes(bc.toLowerCase())
    );
  }

  async processQueue(profile, settings) {
    if (this.processing) return { success: false, reason: 'Already processing' };
    
    this.processing = true;
    const results = {
      success: 0,
      failed: 0,
      skipped: 0
    };

    for (const job of this.queue) {
      if (job.status === 'completed') {
        results.skipped++;
        continue;
      }

      // Apply rate limiting
      if (settings.rateLimiting) {
        await this.checkRateLimit(settings);
      }

      // Process job
      const result = await this.processJob(job, profile, settings);
      
      if (result.success) {
        job.status = 'completed';
        job.completedAt = Date.now();
        this.appliedJobs.add(job.id);
        results.success++;
      } else {
        job.attempts++;
        if (job.attempts >= 3) {
          job.status = 'failed';
          job.failedReason = result.reason;
        }
        results.failed++;
      }

      await this.save();
      
      // Random delay between jobs (stealth mode)
      await this.wait(this.getRandomDelay(settings));
    }

    this.processing = false;
    return results;
  }

  async processJob(job, profile, settings) {
    try {
      // Open job in new tab
      const tab = await chrome.tabs.create({ url: job.url, active: false });
      
      // Wait for page load
      await this.waitForTabLoad(tab.id);
      
      // Send apply command to content script
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'applyToJob',
        job: job,
        profile: profile,
        settings: settings
      });

      // Close tab after some time
      setTimeout(() => chrome.tabs.remove(tab.id), 5000);

      return response;
    } catch (error) {
      return { success: false, reason: error.message };
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
      const waitTime = oneHour - (now - oldestApp);
      await this.wait(waitTime);
    }
  }

  getRandomDelay(settings) {
    const min = settings.minDelay || 30000; // 30 sec
    const max = settings.maxDelay || 120000; // 2 min
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  async blacklistCompany(company) {
    this.blacklistedCompanies.add(company.toLowerCase().trim());
    await this.save();
  }

  async removeFromBlacklist(company) {
    this.blacklistedCompanies.delete(company.toLowerCase().trim());
    await this.save();
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

  waitForTabLoad(tabId) {
    return new Promise(resolve => {
      const listener = (updatedTabId, changeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          setTimeout(resolve, 2000);
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  }

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

if (typeof window !== 'undefined') {
  window.JobQueueManager = JobQueueManager;
}
