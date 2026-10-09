// Dashboard JavaScript for JobPilot Extension

let currentTab = 'applications';

// Initialize dashboard
async function init() {
  await loadStats();
  await loadApplications();
  setupEventListeners();
}

// Load statistics
async function loadStats() {
  try {
    const result = await chrome.storage.local.get(['applications']);
    const applications = result.applications || [];
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const weekApps = applications.filter(a => new Date(a.appliedDate) >= weekAgo);
    const interviews = applications.filter(a => a.status === 'interview').length;
    const responses = applications.filter(a => 
      ['viewed', 'interview', 'offer', 'rejected'].includes(a.status)
    ).length;
    
    const responseRate = applications.length > 0 
      ? Math.round((responses / applications.length) * 100) 
      : 0;
    
    const conversionRate = applications.length > 0 
      ? Math.round((interviews / applications.length) * 100) 
      : 0;
    
    document.getElementById('total-apps').textContent = applications.length;
    document.getElementById('week-apps').textContent = weekApps.length;
    document.getElementById('response-rate').textContent = responseRate + '%';
    document.getElementById('responses-count').textContent = responses + ' responses';
    document.getElementById('interviews').textContent = interviews;
    document.getElementById('conversion').textContent = conversionRate + '% conversion';
  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

// Load applications list
async function loadApplications(statusFilter = '') {
  try {
    const result = await chrome.storage.local.get(['applications']);
    const applications = result.applications || [];
    
    let filtered = applications;
    if (statusFilter) {
      filtered = applications.filter(a => a.status === statusFilter);
    }
    
    const list = document.getElementById('app-list');
    
    if (filtered.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📭</div>
          <div class="empty-state-text">
            ${statusFilter ? 'No applications with this status' : 'No applications yet. Start applying to jobs!'}
          </div>
        </div>
      `;
      return;
    }
    
    list.innerHTML = filtered.map(app => `
      <li class="application-item">
        <div class="app-info">
          <div class="app-title">${escapeHtml(app.title || 'Job Title')}</div>
          <div class="app-company">${escapeHtml(app.company || 'Company')}</div>
          <div class="app-meta">
            <span>📅 ${formatDate(app.appliedDate)}</span>
            ${app.platform ? `<span>🌐 ${escapeHtml(app.platform)}</span>` : ''}
            ${app.salary ? `<span>💰 ${escapeHtml(app.salary)}</span>` : ''}
          </div>
        </div>
        <div>
          <span class="status-badge status-${app.status || 'pending'}">
            ${app.status || 'pending'}
          </span>
        </div>
      </li>
    `).join('');
  } catch (error) {
    console.error('Error loading applications:', error);
  }
}

// Load analytics charts
async function loadAnalytics() {
  try {
    const result = await chrome.storage.local.get(['applications']);
    const applications = result.applications || [];
    
    // Platform performance
    const platformStats = {};
    applications.forEach(app => {
      const platform = app.platform || 'Unknown';
      if (!platformStats[platform]) {
        platformStats[platform] = { total: 0, interviews: 0 };
      }
      platformStats[platform].total++;
      if (app.status === 'interview' || app.status === 'offer') {
        platformStats[platform].interviews++;
      }
    });
    
    const platformDiv = document.getElementById('platform-charts');
    if (Object.keys(platformStats).length === 0) {
      platformDiv.innerHTML = '<div class="empty-state"><div class="empty-state-text">No platform data yet</div></div>';
    } else {
      platformDiv.innerHTML = Object.entries(platformStats)
        .sort((a, b) => b[1].total - a[1].total)
        .map(([platform, data]) => {
          const successRate = data.total > 0 ? Math.round((data.interviews / data.total) * 100) : 0;
          const width = Math.min(100, (data.total / applications.length) * 100);
          
          return `
            <div class="chart-item">
              <div class="chart-label">
                <span class="chart-label-name">${escapeHtml(platform)}</span>
                <span class="chart-label-value">${data.total} apps · ${successRate}% success</span>
              </div>
              <div class="chart-bar-container">
                <div class="chart-bar" style="width: ${width}%">${data.total}</div>
              </div>
            </div>
          `;
        }).join('');
    }
    
    // Status breakdown
    const statusStats = {};
    applications.forEach(app => {
      const status = app.status || 'pending';
      statusStats[status] = (statusStats[status] || 0) + 1;
    });
    
    const statusDiv = document.getElementById('status-charts');
    const total = applications.length || 1;
    
    if (Object.keys(statusStats).length === 0) {
      statusDiv.innerHTML = '<div class="empty-state"><div class="empty-state-text">No status data yet</div></div>';
    } else {
      statusDiv.innerHTML = Object.entries(statusStats)
        .sort((a, b) => b[1] - a[1])
        .map(([status, count]) => {
          const percentage = Math.round((count / total) * 100);
          
          return `
            <div class="chart-item">
              <div class="chart-label">
                <span class="chart-label-name">${capitalizeFirst(status)}</span>
                <span class="chart-label-value">${count} (${percentage}%)</span>
              </div>
              <div class="chart-bar-container">
                <div class="chart-bar" style="width: ${percentage}%">${count}</div>
              </div>
            </div>
          `;
        }).join('');
    }
  } catch (error) {
    console.error('Error loading analytics:', error);
  }
}

// Load saved answers
async function loadSavedAnswers() {
  try {
    const result = await chrome.storage.local.get(['savedAnswers']);
    const savedAnswers = result.savedAnswers || {};
    const container = document.getElementById('saved-answers-list');
    
    if (Object.keys(savedAnswers).length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">💬</div>
          <div class="empty-state-text">No saved answers yet. They'll appear here as you fill forms!</div>
        </div>
      `;
      return;
    }
    
    container.innerHTML = Object.values(savedAnswers)
      .sort((a, b) => b.usedCount - a.usedCount)
      .map(data => `
        <div class="answer-card">
          <div class="answer-question">${escapeHtml(data.question)}</div>
          <div class="answer-text">${escapeHtml(data.answer)}</div>
          <div class="answer-meta">
            Used ${data.usedCount} times · Last used ${formatDate(data.lastUsed)}
          </div>
        </div>
      `).join('');
  } catch (error) {
    console.error('Error loading saved answers:', error);
  }
}

// Setup event listeners
function setupEventListeners() {
  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', async () => {
      // Update active tab
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Update active section
      const tabName = tab.dataset.tab;
      currentTab = tabName;
      
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      document.getElementById(tabName + '-tab').classList.add('active');
      
      // Load data for the selected tab
      if (tabName === 'analytics') {
        await loadAnalytics();
      } else if (tabName === 'answers') {
        await loadSavedAnswers();
      }
    });
  });
  
  // Status filter
  document.getElementById('status-filter').addEventListener('change', (e) => {
    loadApplications(e.target.value);
  });
}

// Helper functions
function formatDate(dateString) {
  if (!dateString) return '';
  
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    
    return date.toLocaleDateString();
  } catch {
    return '';
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', init);
