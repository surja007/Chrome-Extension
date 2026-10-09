// Progress Tracker for the background auto-apply queue

let updateInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  loadProgress();
  startMonitoring();
  setupEventListeners();
});

async function loadProgress() {
  try {
    const result = await chrome.storage.local.get(['autoApplyState', 'applications']);
    const state = result.autoApplyState || {};
    const applications = Array.isArray(result.applications) ? result.applications : [];

    const today = new Date().toDateString();
    const todayApps = applications.filter(app => {
      const appDate = new Date(app.appliedDate);
      return !Number.isNaN(appDate.getTime()) && appDate.toDateString() === today;
    });
    document.getElementById('total-applied').textContent = todayApps.length;

    const platforms = Array.isArray(state.platforms) ? state.platforms.map(platform =>
      typeof platform === 'string' ? { name: platform, applied: 0 } : platform
    ) : [];
    const index = state.currentPlatformIndex || 0;
    const current = platforms[index];
    document.getElementById('current-platform-count').textContent = current ? (current.applied || 0) : 0;

    renderPlatforms(state);
    updateControls(state);
  } catch (error) {
    console.error('Could not load auto-apply progress:', error);
  }
}

function renderPlatforms(state) {
  const container = document.getElementById('platforms-container');
  const platforms = (state.platforms || []).map(platform =>
    typeof platform === 'string' ? { name: platform, applied: 0 } : platform
  );
  const currentIndex = state.currentPlatformIndex || 0;
  const totalApplied = state.totalApplied || 0;

  if (platforms.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-text">No auto-apply run yet</div></div>';
    document.getElementById('success-rate').textContent = '0 total';
    return;
  }

  container.innerHTML = platforms.map((platform, index) => {
    let status = 'pending';
    let statusClass = 'status-pending';
    let progressPercent = 0;

    if (index < currentIndex) {
      status = 'completed';
      statusClass = 'status-completed';
      progressPercent = 100;
    } else if (index === currentIndex && state.isRunning) {
      status = state.paused ? 'paused' : 'active';
      statusClass = 'status-active';
      progressPercent = 50;
    } else if (!state.isRunning && state.completed) {
      status = 'finished';
      statusClass = 'status-completed';
      progressPercent = 100;
    }

    const platformClass = index === currentIndex && state.isRunning ? 'platform active' :
                          index < currentIndex ? 'platform completed' : 'platform';

    return `
      <div class="${platformClass}">
        <div class="platform-header">
          <div class="platform-name">${escapeHtml(platform.name)}</div>
          <div class="platform-status ${statusClass}">${status}</div>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${progressPercent}%"></div>
        </div>
        <div class="progress-text">${Number(platform.applied) || 0} applications</div>
      </div>
    `;
  }).join('');

  document.getElementById('success-rate').textContent = `${totalApplied} total`;
}

function updateControls(state) {
  const pauseButton = document.getElementById('pause-btn');
  const resumeButton = document.getElementById('resume-btn');
  const stopButton = document.getElementById('stop-btn');
  const isRunning = !!state.isRunning;
  const isPaused = isRunning && !!state.paused;

  pauseButton.style.display = isRunning && !isPaused ? '' : 'none';
  resumeButton.style.display = isPaused ? '' : 'none';
  pauseButton.disabled = !isRunning || isPaused;
  resumeButton.disabled = !isPaused;
  stopButton.disabled = !isRunning;

  if (state.reviewJob) {
    addLogOnce(`Review required for ${state.reviewJob.title || 'a job'}. The job tab was opened for manual submission.`, 'error');
  }
}

function startMonitoring() {
  updateInterval = setInterval(async () => {
    await loadProgress();
    const { autoApplyState: state = {} } = await chrome.storage.local.get(['autoApplyState']);

    if (state.reviewJob) {
      clearInterval(updateInterval);
      addLogOnce(`Review required: ${state.reviewJob.title || 'application'}${state.reviewJob.company ? ` at ${state.reviewJob.company}` : ''}.`, 'error');
    } else if (state.completed) {
      clearInterval(updateInterval);
      showCompletionMessage(state);
    }
  }, 2000);
}

function showCompletionMessage(state = {}) {
  const results = state.results || {};
  addLogOnce(`Auto-apply finished: ${results.success || 0} applied, ${results.failed || 0} failed, ${results.skipped || 0} skipped.`, 'success');
  document.getElementById('pause-btn').disabled = true;
  document.getElementById('resume-btn').disabled = true;
  document.getElementById('stop-btn').disabled = true;
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}

function addLog(message, type = '') {
  const log = document.getElementById('activity-log');
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
}

function addLogOnce(message, type = '') {
  const log = document.getElementById('activity-log');
  if (log.dataset.lastMessage === message) return;
  log.dataset.lastMessage = message;
  addLog(message, type);
}

function setupEventListeners() {
  document.getElementById('pause-btn').addEventListener('click', async () => {
    const response = await chrome.runtime.sendMessage({ action: 'pauseAutoApply' });
    addLog(response && response.success ? '⏸ Paused after the current job' : (response.message || 'Could not pause'), '');
    await loadProgress();
  });

  document.getElementById('resume-btn').addEventListener('click', async () => {
    const response = await chrome.runtime.sendMessage({ action: 'resumeAutoApply' });
    addLog(response && response.success ? '▶ Resumed' : (response.message || 'Could not resume'), '');
    await loadProgress();
  });

  document.getElementById('stop-btn').addEventListener('click', async () => {
    if (confirm('Are you sure you want to stop auto-apply?')) {
      await chrome.runtime.sendMessage({ action: 'stopAutoApply' });
      addLog('⏹ Stopped by user', 'error');
      clearInterval(updateInterval);
      await loadProgress();
    }
  });

  document.getElementById('close-btn').addEventListener('click', () => {
    window.close();
  });
}
