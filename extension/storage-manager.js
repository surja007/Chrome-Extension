// Storage Manager for JobPilot Extension
// Handles all data persistence using Chrome Storage API

class StorageManager {
  constructor() {
    // Lazy load AI engine to avoid circular dependencies
    this._ai = null;
  }

  get ai() {
    if (!this._ai && typeof AIEngine !== 'undefined') {
      this._ai = new AIEngine();
    }
    return this._ai;
  }

  // Profile Management
  async saveProfile(profile) {
    await chrome.storage.local.set({ profile });
    return true;
  }

  async getProfile() {
    const { profile } = await chrome.storage.local.get('profile');
    if (!profile) return null;

    if (!profile.fullName && profile.name) profile.fullName = profile.name;
    if (!profile.linkedinUrl && profile.linkedin) profile.linkedinUrl = profile.linkedin;
    return profile;
  }

  // Application Tracking
  async saveApplication(application) {
    const { applications = [] } = await chrome.storage.local.get('applications');
    
    application.id = Date.now();
    application.appliedDate = new Date().toISOString();
    application.status = application.status || 'applied';
    
    applications.unshift(application);
    
    // Keep last 1000 applications
    if (applications.length > 1000) {
      applications.splice(1000);
    }
    
    await chrome.storage.local.set({ applications });
    return application;
  }

  async getApplications(filters = {}) {
    const { applications = [] } = await chrome.storage.local.get('applications');
    
    let filtered = applications;
    
    if (filters.status) {
      filtered = filtered.filter(a => a.status === filters.status);
    }
    
    if (filters.company) {
      filtered = filtered.filter(a => 
        a.company.toLowerCase().includes(filters.company.toLowerCase())
      );
    }
    
    if (filters.daysAgo) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - filters.daysAgo);
      filtered = filtered.filter(a => new Date(a.appliedDate) >= cutoff);
    }
    
    return filtered;
  }

  async updateApplication(appId, updates) {
    const { applications = [] } = await chrome.storage.local.get('applications');
    const index = applications.findIndex(a => a.id === appId);
    
    if (index !== -1) {
      applications[index] = { ...applications[index], ...updates };
      await chrome.storage.local.set({ applications });
      return applications[index];
    }
    return null;
  }

  // Saved Answers (Question Memory)
  async saveAnswer(question, answer) {
    const { savedAnswers = {} } = await chrome.storage.local.get('savedAnswers');
    
    savedAnswers[question.toLowerCase()] = {
      question,
      answer,
      usedCount: (savedAnswers[question.toLowerCase()]?.usedCount || 0) + 1,
      lastUsed: new Date().toISOString()
    };
    
    await chrome.storage.local.set({ savedAnswers });
    return true;
  }

  async findSimilarAnswer(question) {
    const { savedAnswers = {} } = await chrome.storage.local.get('savedAnswers');
    
    let bestMatch = null;
    let bestScore = 0;
    
    for (const [key, data] of Object.entries(savedAnswers)) {
      const similarity = this.ai.similarity(question.toLowerCase(), data.question.toLowerCase());
      if (similarity > bestScore && similarity > 0.6) {
        bestScore = similarity;
        bestMatch = data;
      }
    }
    
    return bestMatch;
  }

  // Skipped Jobs
  async skipJob(jobId, reason) {
    const { skippedJobs = [] } = await chrome.storage.local.get('skippedJobs');
    
    skippedJobs.push({
      jobId,
      reason,
      skippedDate: new Date().toISOString()
    });
    
    await chrome.storage.local.set({ skippedJobs });
    return true;
  }

  async isJobSkipped(jobId) {
    const { skippedJobs = [] } = await chrome.storage.local.get('skippedJobs');
    return skippedJobs.some(j => j.jobId === jobId);
  }

  // Check if already applied
  async hasAppliedToJob(jobId) {
    const { applications = [] } = await chrome.storage.local.get('applications');
    return applications.some(a => a.jobId === jobId);
  }

  // Company Intelligence
  async saveCompanyInfo(companyName, info) {
    const { companies = {} } = await chrome.storage.local.get('companies');
    
    companies[companyName.toLowerCase()] = {
      name: companyName,
      ...info,
      lastUpdated: new Date().toISOString()
    };
    
    await chrome.storage.local.set({ companies });
    return true;
  }

  async getCompanyInfo(companyName) {
    const { companies = {} } = await chrome.storage.local.get('companies');
    return companies[companyName.toLowerCase()] || null;
  }

  // Interview Tracking
  async saveInterview(interview) {
    const { interviews = [] } = await chrome.storage.local.get('interviews');
    
    interview.id = Date.now();
    interview.status = interview.status || 'scheduled';
    
    interviews.unshift(interview);
    await chrome.storage.local.set({ interviews });
    return interview;
  }

  async getInterviews() {
    const { interviews = [] } = await chrome.storage.local.get('interviews');
    return interviews.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  async updateInterview(interviewId, updates) {
    const { interviews = [] } = await chrome.storage.local.get('interviews');
    const index = interviews.findIndex(i => i.id === interviewId);
    
    if (index !== -1) {
      interviews[index] = { ...interviews[index], ...updates };
      await chrome.storage.local.set({ interviews });
      return interviews[index];
    }
    return null;
  }

  // Analytics
  async getAnalytics() {
    const { applications = [] } = await chrome.storage.local.get('applications');
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const todayApps = applications.filter(a => new Date(a.appliedDate) >= today);
    const weekApps = applications.filter(a => new Date(a.appliedDate) >= weekAgo);
    const monthApps = applications.filter(a => new Date(a.appliedDate) >= monthAgo);
    
    // Status breakdown
    const statuses = {};
    applications.forEach(a => {
      statuses[a.status] = (statuses[a.status] || 0) + 1;
    });
    
    // Platform performance
    const platforms = {};
    applications.forEach(a => {
      if (a.platform) {
        if (!platforms[a.platform]) {
          platforms[a.platform] = { total: 0, interviews: 0 };
        }
        platforms[a.platform].total++;
        if (a.status === 'interview') {
          platforms[a.platform].interviews++;
        }
      }
    });
    
    // Calculate conversion rates
    const totalApps = applications.length;
    const interviews = statuses.interview || 0;
    const offers = statuses.offer || 0;
    
    return {
      total: totalApps,
      today: todayApps.length,
      thisWeek: weekApps.length,
      thisMonth: monthApps.length,
      byStatus: statuses,
      platforms,
      conversionRates: {
        applicationToInterview: totalApps ? (interviews / totalApps * 100).toFixed(1) : 0,
        interviewToOffer: interviews ? (offers / interviews * 100).toFixed(1) : 0
      }
    };
  }

  // Settings
  // NOTE: uses chrome.storage.local (not sync) so the popup, settings page and
  // background worker all read/write the SAME settings object.
  async saveSettings(settings) {
    await chrome.storage.local.set({ settings });
    return true;
  }

  async getSettings() {
    const { settings: localSettings } = await chrome.storage.local.get('settings');
    let legacySettings = null;

    // Older versions wrote the Settings page to Sync, while the popup wrote
    // auto-submit to Local. Merge both, with Local values taking precedence.
    if (chrome.storage.sync) {
      const legacy = await chrome.storage.sync.get('settings');
      legacySettings = legacy.settings || null;
    }

    if (localSettings && legacySettings) {
      const merged = { ...legacySettings, ...localSettings };
      await chrome.storage.local.set({ settings: merged });
      return merged;
    }
    if (localSettings) return localSettings;
    if (legacySettings) {
      await chrome.storage.local.set({ settings: legacySettings });
      return legacySettings;
    }

    return {
      autoSubmit: false,
      autoApply: false,
      minMatchScore: 70,
      dailyLimit: 50,
      coverLetterTone: 'professional',
      skipDuplicates: true,
      saveAnswers: true,
      minDelay: 30000,
      maxDelay: 120000
    };
  }

  // Clear all data (for testing/reset)
  async clearAllData() {
    await chrome.storage.local.clear();
    await chrome.storage.sync.clear();
    return true;
  }

  // Export data (for backup)
  async exportData() {
    const local = await chrome.storage.local.get(null);
    const sync = await chrome.storage.sync.get(null);
    
    return {
      local,
      sync,
      exportDate: new Date().toISOString(),
      version: '1.0'
    };
  }

  // Import data (from backup)
  async importData(data) {
    if (data.local) {
      await chrome.storage.local.set(data.local);
    }
    if (data.sync) {
      await chrome.storage.sync.set(data.sync);
    }
    return true;
  }
}

// Make available globally
if (typeof window !== 'undefined') {
  window.StorageManager = StorageManager;
}
