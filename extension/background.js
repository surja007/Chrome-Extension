// ============================================================================
// JOBPILOT SERVICE WORKER
// ----------------------------------------------------------------------------
// Owns the auto-apply engine. Manifest V3 terminates idle workers, so:
//  - all orchestrator state lives in chrome.storage.local
//  - every wait is backed by a chrome.alarms watchdog
//  - every listener is registered at the top level (required for MV3)
// The popup and queue pages are thin clients: they send commands here and
// poll `getAutoApplyState`, so closing them never stops a running queue.
// ============================================================================

importScripts('storage-manager.js', 'job-queue-manager.js', 'auto-apply-orchestrator.js');

const storage = new StorageManager();
const queueManager = new JobQueueManager();
const orchestrator = new AutoApplyOrchestrator({ storage, queueManager });

// ---------------------------------------------------------------------------
// Event listeners (top level — required so the worker wakes for these)
// ---------------------------------------------------------------------------

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  orchestrator.handleTabUpdated(tabId, changeInfo);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  orchestrator.handleTabRemoved(tabId);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  orchestrator.handleAlarm(alarm);
});

chrome.commands.onCommand.addListener(async (command) => {
  try {
    if (command === 'fill-current-form') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;
      const profile = await storage.getProfile();
      const settings = await storage.getSettings();
      try {
        await chrome.tabs.sendMessage(tab.id, {
          action: 'startApply',
          profile,
          autoSubmit: settings.autoSubmit
        });
      } catch (error) {
        showNotification('JobPilot', 'Could not reach this page. Refresh it and try again.');
      }
    } else if (command === 'start-auto-apply') {
      const result = await orchestrator.startFromStorage();
      if (!result.success) {
        showNotification('JobPilot', result.message || 'Could not start auto-apply');
      }
    }
  } catch (error) {
    console.error('[JobPilot] command error:', error);
  }
});

// ---------------------------------------------------------------------------
// Message routing
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.action) {
        // ---- auto-apply engine commands (from popup / queue page / content) --
        case 'startAutoApply': {
          const result = await orchestrator.start({
            jobs: message.jobs,
            profile: message.profile,
            settings: message.settings
          });
          sendResponse(result);
          break;
        }
        case 'stopAutoApply':
          await orchestrator.stop();
          sendResponse({ success: true });
          break;
        case 'pauseAutoApply':
          sendResponse(await orchestrator.pause());
          break;
        case 'resumeAutoApply':
          sendResponse(await orchestrator.resume());
          break;
        case 'getAutoApplyState':
          sendResponse(await orchestrator.getState());
          break;

        // ---- queue management --
        case 'enqueueJobs': {
          await queueManager.initialize();
          const result = await queueManager.addMultipleJobs(message.jobs || []);
          sendResponse({ success: true, ...result });
          break;
        }
        case 'scrapeJobs': {
          // Relay to a content script. The queue page passes an explicit tabId
          // (the active tab while using that page is the page itself).
          let targetTabId = message.tabId;
          if (!targetTabId) {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            targetTabId = tab && tab.id;
          }
          if (!targetTabId) {
            sendResponse({ success: false, error: 'No active tab' });
            break;
          }
          try {
            const response = await chrome.tabs.sendMessage(targetTabId, {
              action: 'scrapeJobs',
              easyApplyOnly: message.easyApplyOnly
            });
            sendResponse(response);
          } catch (error) {
            sendResponse({
              success: false,
              error: 'No JobPilot content script on this page. Open a LinkedIn, Naukri or Indeed job search page, refresh it, and try again.'
            });
          }
          break;
        }

        // ---- UI helpers --
        case 'showNotification':
          showNotification('JobPilot', message.message || '');
          sendResponse({ received: true });
          break;

        // Relay-only messages from content scripts / pages
        case 'log':
        case 'stateUpdate':
        case 'pauseRequired':
        case 'reviewReady':
        case 'autoApplyFinished':
          sendResponse({ received: true });
          break;

        default:
          sendResponse({ received: false });
      }
    } catch (error) {
      console.error('[JobPilot] message error:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();

  return true; // Response is sent asynchronously
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function showNotification(title, message) {
  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon128.png',
      title,
      message
    });
  } catch (error) {
    console.log('[JobPilot]', title, '-', message);
  }
}

// ---------------------------------------------------------------------------
// Install defaults
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(async () => {
  const [data, legacySync] = await Promise.all([
    chrome.storage.local.get(['profile', 'rateLimitData', 'settings', 'autoApplyState']),
    chrome.storage.sync.get(['settings'])
  ]);

  const defaults = {};

  if (data.profile && !data.profile.fullName && data.profile.name) {
    // Migrate profiles saved by the older Settings page.
    defaults.profile = {
      ...data.profile,
      fullName: data.profile.name,
      linkedinUrl: data.profile.linkedinUrl || data.profile.linkedin || ''
    };
  }

  if (!data.profile) {
    defaults.profile = {
      fullName: '',
      email: '',
      phone: '',
      linkedinUrl: '',
      city: '',
      address: '',
      experience: '',
      company: '',
      jobTitle: '',
      coverLetter: '',
      website: '',
      github: ''
    };
  }

  if (!data.rateLimitData) {
    defaults.rateLimitData = {
      applications: [],
      hourlyLimit: 10
    };
  }

  if (legacySync.settings) {
    // Merge Sync-era Settings-page preferences with local popup settings. Local
    // values win for keys edited in the newer popup; older extra preferences
    // (filters, match score, etc.) are retained.
    defaults.settings = { ...legacySync.settings, ...(data.settings || {}) };
  } else if (!data.settings) {
    defaults.settings = {
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

  if (!data.autoApplyState) {
    defaults.autoApplyState = { isRunning: false, stage: 'idle', queue: [] };
  }

  if (Object.keys(defaults).length > 0) {
    await chrome.storage.local.set(defaults);
  }

  console.log('JobPilot installed and initialized');
});
