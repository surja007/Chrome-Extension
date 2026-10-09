// Auto-Apply Orchestrator - Manages multi-platform job applications

class AutoApplyOrchestrator {
  constructor() {
    this.platforms = [
      {
        name: 'LinkedIn',
        baseUrl: 'https://www.linkedin.com/jobs/search/',
        getUrl: (profile) => {
          const role = profile.jobRole || 'Software Engineer';
          const location = profile.city || 'India';
          return `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(role)}&location=${encodeURIComponent(location)}&f_AL=true&sortBy=DD`;
        },
        completed: false,
        appliedCount: 0
      },
      {
        name: 'Naukri',
        baseUrl: 'https://www.naukri.com/',
        getUrl: (profile) => {
          const role = profile.jobRole || 'Software Engineer';
          const location = profile.city || 'India';
          const cleanRole = role.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          const cleanCity = location.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          return `https://www.naukri.com/${cleanRole}-jobs-in-${cleanCity}`;
        },
        completed: false,
        appliedCount: 0
      },
      {
        name: 'Indeed',
        baseUrl: 'https://www.indeed.com/',
        getUrl: (profile) => {
          const role = profile.jobRole || 'Software Engineer';
          const location = profile.city || 'India';
          return `https://www.indeed.com/jobs?q=${encodeURIComponent(role)}&l=${encodeURIComponent(location)}`;
        },
        completed: false,
        appliedCount: 0
      }
    ];
    
    this.currentPlatformIndex = 0;
    this.totalApplied = 0;
    this.maxPerPlatform = 50;
    this.isRunning = false;
  }

  async start(profile, settings) {
    if (this.isRunning) {
      return { success: false, message: 'Auto-apply already running' };
    }

    this.isRunning = true;
    this.currentPlatformIndex = 0;
    this.totalApplied = 0;

    // Reset platform states
    this.platforms.forEach(p => {
      p.completed = false;
      p.appliedCount = 0;
    });

    // Start with first platform
    await this.processNextPlatform(profile, settings);

    return { success: true, message: 'Auto-apply started' };
  }

  async processNextPlatform(profile, settings) {
    if (this.currentPlatformIndex >= this.platforms.length) {
      this.complete();
      return;
    }

    const platform = this.platforms[this.currentPlatformIndex];
    
    // Store orchestrator state
    await chrome.storage.local.set({
      autoApplyState: {
        isRunning: true,
        currentPlatform: platform.name,
        currentPlatformIndex: this.currentPlatformIndex,
        totalApplied: this.totalApplied,
        profile: profile,
        settings: settings
      }
    });

    // Open platform URL
    const url = platform.getUrl(profile);
    chrome.tabs.create({ url, active: true }, (tab) => {
      // Monitor this tab
      this.monitorTab(tab.id, platform, profile, settings);
    });
  }

  monitorTab(tabId, platform, profile, settings) {
    // Listen for tab updates
    const updateListener = (updatedTabId, changeInfo, tab) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        // Page loaded, start applying
        setTimeout(() => {
          this.startApplyingOnPlatform(tabId, platform, profile, settings);
        }, 2000);
        
        // Remove listener after first load
        chrome.tabs.onUpdated.removeListener(updateListener);
      }
    };

    chrome.tabs.onUpdated.addListener(updateListener);
  }

  async startApplyingOnPlatform(tabId, platform, profile, settings) {
    // Send message to content script to start auto-apply
    chrome.tabs.sendMessage(tabId, {
      action: 'startPlatformAutoApply',
      profile: profile,
      settings: settings,
      platform: platform.name,
      maxApply: this.maxPerPlatform
    }, async (response) => {
      if (chrome.runtime.lastError) {
        console.error('Failed to start auto-apply:', chrome.runtime.lastError);
        // Try next platform
        await this.moveToNextPlatform(profile, settings);
      }
    });
  }

  async moveToNextPlatform(profile, settings) {
    this.currentPlatformIndex++;
    
    if (this.currentPlatformIndex < this.platforms.length) {
      // Move to next platform
      await this.processNextPlatform(profile, settings);
    } else {
      // All platforms completed
      this.complete();
    }
  }

  complete() {
    this.isRunning = false;
    
    chrome.storage.local.set({
      autoApplyState: {
        isRunning: false,
        completed: true,
        totalApplied: this.totalApplied,
        platforms: this.platforms.map(p => ({
          name: p.name,
          applied: p.appliedCount
        }))
      }
    });

    // Show completion notification
    chrome.runtime.sendMessage({
      action: 'showNotification',
      message: `🎉 Auto-apply completed! Applied to ${this.totalApplied} jobs across ${this.platforms.length} platforms.`
    });
  }

  stop() {
    this.isRunning = false;
    chrome.storage.local.set({
      autoApplyState: {
        isRunning: false,
        stopped: true
      }
    });
  }
}

// Make available globally
if (typeof window !== 'undefined') {
  window.AutoApplyOrchestrator = AutoApplyOrchestrator;
}
