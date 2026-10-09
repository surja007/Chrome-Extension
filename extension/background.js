// ============================================================================
// SERVICE WORKER - NO LONG-RUNNING LOGIC
// ============================================================================

// Handle messages (storage and relay only)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Just relay messages, no processing
  if (message.action === 'log' || message.action === 'stateUpdate' || 
      message.action === 'pauseRequired' || message.action === 'reviewReady') {
    // These are just for the popup, no action needed here
    sendResponse({ received: true });
  }
  
  return true;
});

// Initialize default storage on install
chrome.runtime.onInstalled.addListener(async () => {
  const data = await chrome.storage.local.get(['profile', 'rateLimitData']);
  
  if (!data.profile) {
    await chrome.storage.local.set({
      profile: {
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
      }
    });
  }
  
  if (!data.rateLimitData) {
    await chrome.storage.local.set({
      rateLimitData: {
        applications: [],
        hourlyLimit: 10
      }
    });
  }
  
  console.log('JobPilot installed and initialized');
});
