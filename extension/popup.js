// ============================================================================
// POPUP CONTROLLER - NO LONG-RUNNING LOGIC
// ============================================================================

let isRunning = false;
let currentApplyTabId = null;

// ============================================================================
// INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  await loadProfile();
  await loadSettings();
  await updateRateLimit();
  setupEventListeners();
  await restoreFlowState();
});

async function restoreFlowState() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url || !tab.url.includes('linkedin.com/jobs')) return;

    const state = await chrome.tabs.sendMessage(tab.id, { action: 'getApplyState' });
    if (!state || !state.running) return;

    isRunning = true;
    currentApplyTabId = tab.id;
    document.getElementById('startBtn').disabled = true;
    document.getElementById('stopBtn').disabled = false;
    showStatus('actionStatus', 'warning', `⏸ Application flow is still running (${state.state}).`, 0);
  } catch (error) {
    // Content scripts are not present on pages loaded before the extension was
    // installed; refreshing that tab will inject the current version.
  }
}

// ============================================================================
// EVENT LISTENERS
// ============================================================================
function setupEventListeners() {
  // Save profile
  document.getElementById('saveProfile').addEventListener('click', saveProfile);
  
  // Start/Stop
  document.getElementById('startBtn').addEventListener('click', startApply);
  document.getElementById('stopBtn').addEventListener('click', stopApply);
  
  // Auto-submit
  document.getElementById('autoSubmit').addEventListener('change', saveSettings);
  
  // Collapsible sections
  document.getElementById('profileToggle').addEventListener('click', () => {
    toggleCollapse('profileToggle', 'profileContent');
  });
  
  document.getElementById('logToggle').addEventListener('click', () => {
    toggleCollapse('logToggle', 'logContent');
  });
  
  // Clear log
  document.getElementById('clearLog').addEventListener('click', clearLog);

  // Navigation to the full extension pages
  document.getElementById('openQueue').addEventListener('click', () => openExtensionPage('queue-manager.html'));
  document.getElementById('openDashboard').addEventListener('click', () => openExtensionPage('dashboard.html'));
  document.getElementById('openTracker').addEventListener('click', () => openExtensionPage('progress-tracker.html'));
  document.getElementById('openSettings').addEventListener('click', () => openExtensionPage('settings.html'));
}

function openExtensionPage(page) {
  chrome.tabs.create({ url: chrome.runtime.getURL(page) });
}

// ============================================================================
// PROFILE MANAGEMENT
// ============================================================================
async function loadProfile() {
  const data = await chrome.storage.local.get(['profile']);
  const profile = data.profile || {};
  
  document.getElementById('fullName').value = profile.fullName || profile.name || '';
  document.getElementById('email').value = profile.email || '';
  document.getElementById('phone').value = profile.phone || '';
  document.getElementById('linkedinUrl').value = profile.linkedinUrl || profile.linkedin || '';
  document.getElementById('city').value = profile.city || '';
  document.getElementById('experience').value = profile.experience || '';
  document.getElementById('company').value = profile.company || '';
  document.getElementById('jobTitle').value = profile.jobTitle || '';
  document.getElementById('coverLetter').value = profile.coverLetter || '';
}

async function saveProfile() {
  const existingData = await chrome.storage.local.get(['profile']);
  const existing = existingData.profile || {};
  const fullName = document.getElementById('fullName').value.trim();
  const linkedinUrl = document.getElementById('linkedinUrl').value.trim();

  const profile = {
    ...existing,
    fullName,
    name: fullName, // legacy alias used by older AI modules
    email: document.getElementById('email').value.trim(),
    phone: document.getElementById('phone').value.trim(),
    linkedinUrl,
    linkedin: linkedinUrl, // legacy alias
    city: document.getElementById('city').value.trim(),
    experience: document.getElementById('experience').value.trim(),
    company: document.getElementById('company').value.trim(),
    jobTitle: document.getElementById('jobTitle').value.trim(),
    coverLetter: document.getElementById('coverLetter').value.trim()
  };

  // Validate required fields
  if (!profile.fullName || !profile.email || !profile.phone) {
    showStatus('saveStatus', 'error', 'Please fill all required fields (*)', 3000);
    return;
  }

  await chrome.storage.local.set({ profile });
  showStatus('saveStatus', 'success', '✓ Profile saved successfully!', 2000);
}

async function loadSettings() {
  const data = await chrome.storage.local.get(['settings']);
  const settings = data.settings || { autoSubmit: false };
  
  document.getElementById('autoSubmit').checked = settings.autoSubmit;
}

async function saveSettings() {
  const data = await chrome.storage.local.get(['settings']);
  const settings = {
    ...(data.settings || {}),
    autoSubmit: document.getElementById('autoSubmit').checked
  };

  await chrome.storage.local.set({ settings });
}

// ============================================================================
// APPLY FLOW CONTROL
// ============================================================================
async function startApply() {
  if (isRunning) return;
  
  // Load profile
  const data = await chrome.storage.local.get(['profile', 'settings']);
  const rawProfile = data.profile;
  const profile = rawProfile ? {
    ...rawProfile,
    fullName: rawProfile.fullName || rawProfile.name || '',
    linkedinUrl: rawProfile.linkedinUrl || rawProfile.linkedin || ''
  } : null;
  const settings = data.settings || { autoSubmit: false };

  if (profile && (profile.fullName !== rawProfile.fullName || profile.linkedinUrl !== rawProfile.linkedinUrl)) {
    await chrome.storage.local.set({ profile });
  }
  
  // Validate profile
  if (!profile || !profile.fullName || !profile.email || !profile.phone) {
    showStatus('actionStatus', 'error', '⚠ Please save your profile first', 3000);
    return;
  }
  
  // Check if on LinkedIn
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.includes('linkedin.com/jobs')) {
    showStatus('actionStatus', 'error', '⚠ Please navigate to a LinkedIn job page first', 3000);
    return;
  }
  
  // Update UI
  isRunning = true;
  currentApplyTabId = tab.id;
  document.getElementById('startBtn').disabled = true;
  document.getElementById('stopBtn').disabled = false;
  showStatus('actionStatus', 'success', '🚀 Starting Easy Apply flow...', 0);
  
  // Send message to content script
  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'startApply',
      profile: profile,
      autoSubmit: settings.autoSubmit
    });
    
    // DONE without `submitted` means it safely filled the application and
    // stopped for the user to review it. That is not a failed run.
    if (!response || (!response.success && response.state !== 'DONE')) {
      throw new Error((response && (response.reason || response.error)) || 'The application flow did not complete.');
    }
    if (response.state === 'DONE' && !response.submitted) {
      showStatus('actionStatus', 'success', '✓ Application filled and ready for your review.', 0);
      resetUI();
    }

  } catch (error) {
    const hint = error.message && error.message.includes('Receiving end does not exist')
      ? 'Content script not loaded on this page. Refresh the LinkedIn job page and try again.'
      : error.message;
    showStatus('actionStatus', 'error', `❌ ${hint}`, 0);
    resetUI();
  }
}

async function stopApply() {
  if (!isRunning) return;

  try {
    if (currentApplyTabId !== null) {
      await chrome.tabs.sendMessage(currentApplyTabId, { action: 'stopApply' });
    }
    showStatus('actionStatus', 'warning', '⏸ Stopping...', 2000);
  } catch (error) {
    console.error('Stop error:', error);
  }

  resetUI();
}

function resetUI() {
  isRunning = false;
  currentApplyTabId = null;
  document.getElementById('startBtn').disabled = false;
  document.getElementById('stopBtn').disabled = true;
}

// ============================================================================
// RATE LIMIT DISPLAY
// ============================================================================
async function updateRateLimit() {
  try {
    const data = await chrome.storage.local.get(['rateLimitData']);
    const rateLimitData = data.rateLimitData || { applications: [], hourlyLimit: 10 };
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const applications = Array.isArray(rateLimitData.applications) ? rateLimitData.applications : [];
    const recentApps = applications.filter(timestamp => timestamp > oneHourAgo);

    document.getElementById('appCount').textContent = recentApps.length;
    const limitElement = document.getElementById('hourlyLimit');
    if (limitElement) limitElement.textContent = rateLimitData.hourlyLimit || 10;
  } catch (error) {
    console.warn('Could not update the rate-limit display:', error);
  }

  // Show background queue status (which continues even after this popup closes)
  try {
    const state = await chrome.runtime.sendMessage({ action: 'getAutoApplyState' });
    const info = document.getElementById('autoApplyInfo');
    if (!info) return;

    if (state && state.isRunning) {
      info.style.display = 'block';
      document.getElementById('autoApplyLabel').textContent = state.paused ? 'paused' : 'running';
      const result = state.results || {};
      document.getElementById('autoApplyCount').textContent = result.success || state.totalApplied || 0;
    } else {
      info.style.display = 'none';
    }
  } catch (error) {
    // Background worker may be restarting; ignore until next refresh.
  }
}

// Update rate limit every 5 seconds
setInterval(updateRateLimit, 5000);

// ============================================================================
// LOG DISPLAY
// ============================================================================
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'log') {
    addLogEntry(message.log);
  }
  
  if (message.action === 'stateUpdate') {
    showStatus('actionStatus', 'success', `State: ${message.state}`, 0);
    
    if (message.state === 'DONE' || message.state === 'ABORT') {
      resetUI();
      updateRateLimit();
      
      if (message.state === 'DONE') {
        showStatus('actionStatus', 'success', '✅ Application completed!', 0);
      } else {
        showStatus('actionStatus', 'error', '❌ Flow aborted', 0);
      }
    }
  }
  
  if (message.action === 'pauseRequired') {
    showStatus('actionStatus', 'warning', `⚠ ${message.message}`, 0);
  }
  
  if (message.action === 'reviewReady') {
    showStatus('actionStatus', 'success', `✓ ${message.message}`, 0);
    resetUI();
  }
});

function addLogEntry(log) {
  const logPanel = document.getElementById('logPanel');
  
  // Remove empty message
  const emptyMsg = logPanel.querySelector('.empty-log');
  if (emptyMsg) emptyMsg.remove();
  
  const entry = document.createElement('div');
  entry.className = `log-entry ${log.level}`;
  entry.textContent = `[${log.timestamp}] ${log.level}: ${log.message}`;
  
  logPanel.appendChild(entry);
  
  // Auto-scroll to bottom
  logPanel.scrollTop = logPanel.scrollHeight;
  
  // Keep max 100 entries
  while (logPanel.children.length > 100) {
    logPanel.removeChild(logPanel.firstChild);
  }
}

function clearLog() {
  const logPanel = document.getElementById('logPanel');
  logPanel.innerHTML = '<div class="empty-log">Log cleared</div>';
}

// ============================================================================
// UI HELPERS
// ============================================================================
function showStatus(elementId, type, message, hideAfter = 0) {
  const status = document.getElementById(elementId);
  status.className = `status ${type} show`;
  status.textContent = message;
  
  if (hideAfter > 0) {
    setTimeout(() => {
      status.classList.remove('show');
    }, hideAfter);
  }
}

function toggleCollapse(toggleId, contentId) {
  const toggle = document.getElementById(toggleId);
  const content = document.getElementById(contentId);
  
  toggle.classList.toggle('collapsed');
  content.classList.toggle('hidden');
}
