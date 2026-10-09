// Settings page JavaScript

const storage = new StorageManager();

// Load saved settings on page load
document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  setupEventListeners();
});

async function loadSettings() {
  const profile = await storage.getProfile();
  const settings = await storage.getSettings();

  if (profile) {
    // Personal Info
    // Unified schema: fullName / linkedinUrl (same keys the popup and the
    // content script use). Legacy keys (name / linkedin) are read as fallback.
    document.getElementById('name').value = profile.fullName || profile.name || '';
    document.getElementById('email').value = profile.email || '';
    document.getElementById('phone').value = profile.phone || '';
    document.getElementById('city').value = profile.city || '';
    document.getElementById('linkedin').value = profile.linkedinUrl || profile.linkedin || '';
    document.getElementById('github').value = profile.github || '';
    document.getElementById('website').value = profile.website || '';

    // Professional
    document.getElementById('jobTitle').value = profile.jobTitle || '';
    document.getElementById('experience').value = profile.experience || '';
    document.getElementById('company').value = profile.company || '';
    document.getElementById('skills').value = (profile.skills || []).join(', ');
    document.getElementById('summary').value = profile.summary || '';

    // Preferences
    document.getElementById('minSalary').value = profile.minSalary || '';
    document.getElementById('maxSalary').value = profile.maxSalary || '';
    document.getElementById('preferredLocations').value = (profile.preferredLocations || []).join(', ');
    document.getElementById('workMode').value = profile.workMode || 'any';
    document.getElementById('willingToRelocate').checked = profile.willingToRelocate || false;
    document.getElementById('noticePeriod').value = profile.noticePeriod || '';
    document.getElementById('employmentType').value = profile.employmentType || 'full-time';
  }

  if (settings) {
    // Automation
    document.getElementById('autoApplyMode').value = settings.autoApplyMode || 'copilot';
    document.getElementById('autoSubmit').checked = settings.autoSubmit || false;
    document.getElementById('skipDuplicates').checked = settings.skipDuplicates !== false;
    document.getElementById('saveAnswers').checked = settings.saveAnswers !== false;
    document.getElementById('minMatchScore').value = settings.minMatchScore || 70;
    document.getElementById('matchScoreValue').textContent = settings.minMatchScore || 70;
    document.getElementById('dailyLimit').value = settings.dailyLimit || 50;

    // Cover Letter
    document.getElementById('coverLetterTone').value = settings.coverLetterTone || 'professional';
    document.getElementById('coverLetterLength').value = settings.coverLetterLength || 'medium';
    document.getElementById('generateCoverLetter').checked = settings.generateCoverLetter !== false;

    // Filters
    document.getElementById('excludeKeywords').value = (settings.excludeKeywords || []).join(', ');
    document.getElementById('excludeCompanies').value = (settings.excludeCompanies || []).join(', ');
    document.getElementById('onlyEasyApply').checked = settings.onlyEasyApply || false;
  }
}

function setupEventListeners() {
  // Range slider update
  document.getElementById('minMatchScore').addEventListener('input', (e) => {
    document.getElementById('matchScoreValue').textContent = e.target.value;
  });

  // Save settings
  document.getElementById('saveSettings').addEventListener('click', saveSettings);

  // Reset settings
  document.getElementById('resetSettings').addEventListener('click', resetSettings);

  // Export data
  document.getElementById('exportData').addEventListener('click', exportData);

  // Import data
  document.getElementById('importData').addEventListener('click', () => {
    document.getElementById('importFile').click();
  });

  document.getElementById('importFile').addEventListener('change', importData);
}

async function saveSettings() {
  try {
    // Merge with the existing profile: the Settings page must not wipe fields
    // entered in the popup (cover letter, address, etc.).
    const existing = (await storage.getProfile()) || {};
    const fullName = document.getElementById('name').value.trim();
    const linkedinUrl = document.getElementById('linkedin').value.trim();

    // Keep the profile keys canonical for the popup/content script, and retain
    // legacy aliases for the older AI modules in this repository.
    const profile = {
      ...existing,
      fullName,
      name: fullName,
      email: document.getElementById('email').value.trim(),
      phone: document.getElementById('phone').value.trim(),
      city: document.getElementById('city').value.trim(),
      linkedinUrl,
      linkedin: linkedinUrl,
      github: document.getElementById('github').value.trim(),
      website: document.getElementById('website').value.trim(),
      jobTitle: document.getElementById('jobTitle').value.trim(),
      experience: parseInt(document.getElementById('experience').value, 10) || 0,
      company: document.getElementById('company').value.trim(),
      skills: document.getElementById('skills').value.split(',').map(s => s.trim()).filter(Boolean),
      summary: document.getElementById('summary').value.trim(),
      minSalary: parseInt(document.getElementById('minSalary').value, 10) || 0,
      maxSalary: parseInt(document.getElementById('maxSalary').value, 10) || 0,
      preferredLocations: document.getElementById('preferredLocations').value.split(',').map(s => s.trim()).filter(Boolean),
      workMode: document.getElementById('workMode').value,
      willingToRelocate: document.getElementById('willingToRelocate').checked,
      noticePeriod: parseInt(document.getElementById('noticePeriod').value, 10) || 0,
      employmentType: document.getElementById('employmentType').value
    };

    // Validate required fields
    if (!profile.fullName || !profile.email || !profile.phone || !profile.jobTitle) {
      showStatus('Please fill in all required fields (*)', 'error');
      return;
    }

    // Save profile
    await storage.saveProfile(profile);

    // Preserve settings used by other pages/background code that this form
    // does not expose (e.g. delay and rate-limit preferences).
    const existingSettings = await storage.getSettings();

    // Collect settings data
    const settings = {
      ...existingSettings,
      autoApplyMode: document.getElementById('autoApplyMode').value,
      autoSubmit: document.getElementById('autoSubmit').checked,
      skipDuplicates: document.getElementById('skipDuplicates').checked,
      saveAnswers: document.getElementById('saveAnswers').checked,
      minMatchScore: parseInt(document.getElementById('minMatchScore').value),
      dailyLimit: parseInt(document.getElementById('dailyLimit').value),
      coverLetterTone: document.getElementById('coverLetterTone').value,
      coverLetterLength: document.getElementById('coverLetterLength').value,
      generateCoverLetter: document.getElementById('generateCoverLetter').checked,
      excludeKeywords: document.getElementById('excludeKeywords').value.split(',').map(s => s.trim()).filter(s => s),
      excludeCompanies: document.getElementById('excludeCompanies').value.split(',').map(s => s.trim()).filter(s => s),
      onlyEasyApply: document.getElementById('onlyEasyApply').checked
    };

    // Save settings
    await storage.saveSettings(settings);

    showStatus('✓ Settings saved successfully!', 'success');
  } catch (error) {
    console.error('Error saving settings:', error);
    showStatus('Error saving settings. Please try again.', 'error');
  }
}

async function resetSettings() {
  if (!confirm('Are you sure you want to reset all settings to default?')) {
    return;
  }

  // Clear storage
  await storage.clearAllData();

  // Reload form
  await loadSettings();

  showStatus('Settings reset to default', 'success');
}

async function exportData() {
  try {
    const data = await storage.exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `jobpilot-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    showStatus('✓ Data exported successfully!', 'success');
  } catch (error) {
    console.error('Error exporting data:', error);
    showStatus('Error exporting data', 'error');
  }
}

async function importData(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);
    
    await storage.importData(data);
    await loadSettings();
    
    showStatus('✓ Data imported successfully!', 'success');
  } catch (error) {
    console.error('Error importing data:', error);
    showStatus('Error importing data. Please check file format.', 'error');
  }
}

function showStatus(message, type) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = `status ${type} show`;
  
  setTimeout(() => {
    status.classList.remove('show');
  }, 5000);
}
