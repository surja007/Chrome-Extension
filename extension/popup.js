// ============================================================================
// POPUP CONTROLLER - NO LONG-RUNNING LOGIC
// ============================================================================

let isRunning = false;

// ============================================================================
// INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  await loadProfile();
  await loadSettings();
  await updateRateLimit();
  setupEventListeners();
});

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
}

// ============================================================================
// PROFILE MANAGEMENT
// ============================================================================
async function loadProfile() {
  const data = await chrome.storage.local.get(['profile']);
  const profile = data.profile || {};
  
  document.getElementById('fullName').value = profile.fullName || '';
  document.getElementById('email').value = profile.email || '';
  document.getElementById('phone').value = profile.phone || '';
  document.getElementById('linkedinUrl').value = profile.linkedinUrl || '';
  document.getElementById('city').value = profile.city || '';
  document.getElementById('experience').value = profile.experience || '';
  document.getElementById('company').value = profile.company || '';
  document.getElementById('jobTitle').value = profile.jobTitle || '';
  document.getElementById('coverLetter').value = profile.coverLetter || '';
}

async function saveProfile() {
  const profile = {
    fullName: document.getElementById('fullName').value.trim(),
    email: document.getElementById('email').value.trim(),
    phone: document.getElementById('phone').value.trim(),
    linkedinUrl: document.getElementById('linkedinUrl').value.trim(),
    city: document.getElementById('city').value.trim(),
    address: '',
    experience: document.getElementById('experience').value.trim(),
    company: document.getElementById('company').value.trim(),
    jobTitle: document.getElementById('jobTitle').value.trim(),
    coverLetter: document.getElementById('coverLetter').value.trim(),
    website: '',
    github: ''
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
  const settings = {
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
  const profile = data.profile;
  const settings = data.settings || { autoSubmit: false };
  
  // Validate profile
  if (!profile || !profile.fullName || !profile.email || !profile.phone) {
    showStatus('actionStatus', 'error', '⚠ Please save your profile first', 3000);
    return;
  }
  
  // Check if on LinkedIn
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab.url.includes('linkedin.com/jobs')) {
    showStatus('actionStatus', 'error', '⚠ Please navigate to a LinkedIn job page first', 3000);
    return;
  }
  
  // Update UI
  isRunning = true;
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
    
    if (!response.success) {
      throw new Error(response.error);
    }
    
  } catch (error) {
    showStatus('actionStatus', 'error', `❌ Error: ${error.message}`, 0);
    resetUI();
  }
}

async function stopApply() {
  if (!isRunning) return;
  
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'stopApply' });
    showStatus('actionStatus', 'warning', '⏸ Stopping...', 2000);
  } catch (error) {
    console.error('Stop error:', error);
  }
  
  resetUI();
}

function resetUI() {
  isRunning = false;
  document.getElementById('startBtn').disabled = false;
  document.getElementById('stopBtn').disabled = true;
}

// ============================================================================
// RATE LIMIT DISPLAY
// ============================================================================
async function updateRateLimit() {
  const data = await chrome.storage.local.get(['rateLimitData']);
  const rateLimitData = data.rateLimitData || { applications: [], hourlyLimit: 10 };
  
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const recentApps = rateLimitData.applications.filter(t => t > oneHourAgo);
  
  document.getElementById('appCount').textContent = recentApps.length;
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
