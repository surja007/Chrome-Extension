// Progress Tracker for Auto-Apply

let updateInterval;

document.addEventListener('DOMContentLoaded', () => {
  loadProgress();
  startMonitoring();
  setupEventListeners();
});

async function loadProgress() {
  const result = await chrome.storage.local.get(['autoApplyState', 'applications']);
  const state = result.autoApplyState || {};
  const applications = result.applications || [];
  
  // Update stats
  const todayApps = applications.filter(app => {
    const appDate = new Date(app.appliedDate);
    const today = new Date();
    return appDate.toDateString() === today.toDateString();
  });
  
  document.getElementById('total-applied').textContent = todayApps.length;
  document.getElementById('success-rate').textContent = '95%'; // Placeholder
  
  // Render platforms
  renderPlatforms(state);
}

function renderPlatforms(state) {
  const container = document.getElementById('platforms-container');
  const platforms = state.platforms || ['LinkedIn', 'Naukri', 'Indeed'];
  const currentIndex = state.currentPlatformIndex || 0;
  
  container.innerHTML = platforms.map((platform, index) => {
    let status = 'pending';
    let statusClass = 'status-pending';
    let progressPercent = 0;
    
    if (index < currentIndex) {
      status = 'completed';
      statusClass = 'status-completed';
      progressPercent = 100;
    } else if (index === currentIndex && state.isRunning) {
      status = 'active';
      statusClass = 'status-active';
      progressPercent = 50; // Placeholder
    }
    
    const platformClass = index === currentIndex ? 'platform active' : 
                          index < currentIndex ? 'platform completed' : 'platform';
    
    return `
      <div class="${platformClass}">
        <div class="platform-header">
          <div class="platform-name">${platform}</div>
          <div class="platform-status ${statusClass}">${status}</div>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${progressPercent}%"></div>
        </div>
        <div class="progress-text">0 / 50 applications</div>
      </div>
    `;
  }).join('');
}

function startMonitoring() {
  updateInterval = setInterval(async () => {
    await loadProgress();
    
    // Check if completed
    const result = await chrome.storage.local.get(['autoApplyState']);
    const state = result.autoApplyState || {};
    
    if (state.completed) {
      clearInterval(updateInterval);
      showCompletionMessage();
    }
  }, 2000);
}

function showCompletionMessage() {
  addLog('🎉 Auto-apply completed!', 'success');
  document.getElementById('pause-btn').disabled = true;
  document.getElementById('stop-btn').disabled = true;
}

function addLog(message, type = '') {
  const log = document.getElementById('activity-log');
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
}

function setupEventListeners() {
  document.getElementById('pause-btn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'pauseAutoApply' });
    addLog('⏸ Paused', '');
  });
  
  document.getElementById('stop-btn').addEventListener('click', () => {
    if (confirm('Are you sure you want to stop auto-apply?')) {
      chrome.runtime.sendMessage({ action: 'stopAutoApply' });
      addLog('⏹ Stopped by user', 'error');
      clearInterval(updateInterval);
    }
  });
  
  document.getElementById('close-btn').addEventListener('click', () => {
    window.close();
  });
}
