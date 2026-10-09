// Advanced Form Filler for JobPilot
// Intelligently detects and fills job application forms

class FormFiller {
  constructor(aiEngine, storageManager) {
    this.ai = aiEngine;
    this.storage = storageManager;
  }

  // Main function to fill current page forms
  async fillCurrentPage(profile, autoSubmit = false) {
    const fields = this.detectAllFields();
    let filledCount = 0;
    const answers = [];
    
    for (const field of fields) {
      const questionType = this.ai.detectQuestionType({
        label: field.label,
        name: field.name,
        placeholder: field.placeholder
      });
      
      let answer = this.ai.getAnswerForQuestion(questionType, profile);
      
      // If no direct answer, check saved answers
      if (!answer && field.label) {
        const savedAnswer = await this.storage.findSimilarAnswer(field.label);
        if (savedAnswer) {
          answer = savedAnswer.answer;
        }
      }
      
      if (answer && this.fillField(field.element, answer)) {
        filledCount++;
        answers.push({ question: field.label, answer, questionType });
      }
    }
    
    // Save new answers for future use
    const settings = await this.storage.getSettings();
    if (settings.saveAnswers) {
      for (const { question, answer } of answers) {
        if (question) {
          await this.storage.saveAnswer(question, answer);
        }
      }
    }
    
    // Handle auto-submit
    if (autoSubmit) {
      await this.attemptSubmit();
    }
    
    return { filledCount, fields: fields.length };
  }

  // Detect all form fields on page
  detectAllFields() {
    const fields = [];
    const selectors = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select';
    
    document.querySelectorAll(selectors).forEach(element => {
      if (!element.offsetParent) return; // Skip hidden elements
      
      const field = {
        element,
        type: element.tagName.toLowerCase(),
        inputType: element.type,
        name: element.name || '',
        id: element.id || '',
        placeholder: element.placeholder || '',
        label: this.getFieldLabel(element),
        required: element.required,
        value: element.value
      };
      
      fields.push(field);
    });
    
    return fields;
  }

  // Get label for a field
  getFieldLabel(element) {
    // Try associated label
    if (element.id) {
      const label = document.querySelector(`label[for="${element.id}"]`);
      if (label) return label.textContent.trim();
    }
    
    // Try parent label
    const parentLabel = element.closest('label');
    if (parentLabel) {
      return parentLabel.textContent.replace(element.value, '').trim();
    }
    
    // Try aria-label
    if (element.getAttribute('aria-label')) {
      return element.getAttribute('aria-label');
    }
    
    // Try previous sibling
    let prev = element.previousElementSibling;
    while (prev) {
      if (prev.tagName === 'LABEL' || prev.textContent.trim()) {
        return prev.textContent.trim();
      }
      prev = prev.previousElementSibling;
    }
    
    return element.placeholder || element.name || '';
  }

  // Fill a single field
  fillField(element, value) {
    if (!element || !value) return false;
    
    try {
      // Handle different input types
      if (element.tagName === 'SELECT') {
        return this.fillSelect(element, value);
      } else if (element.type === 'checkbox') {
        return this.fillCheckbox(element, value);
      } else if (element.type === 'radio') {
        return this.fillRadio(element, value);
      } else if (element.type === 'file') {
        return false; // Can't programmatically fill file inputs for security
      } else {
        // Regular text input or textarea
        element.value = value;
        
        // Trigger events to ensure frameworks detect the change
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));
        
        // For React/Vue
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        ).set;
        nativeInputValueSetter.call(element, value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
        
        return true;
      }
    } catch (e) {
      console.error('Error filling field:', e);
      return false;
    }
  }

  // Fill select dropdown
  fillSelect(select, value) {
    const valueLower = value.toLowerCase();
    
    // Try exact match first
    for (const option of select.options) {
      if (option.value === value || option.text === value) {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }
    
    // Try partial match
    for (const option of select.options) {
      if (option.value.toLowerCase().includes(valueLower) || 
          option.text.toLowerCase().includes(valueLower)) {
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }
    
    return false;
  }

  // Fill checkbox
  fillCheckbox(checkbox, value) {
    const shouldCheck = value === true || value === 'true' || value === 'yes' || value === '1';
    if (checkbox.checked !== shouldCheck) {
      checkbox.checked = shouldCheck;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    return false;
  }

  // Fill radio button
  fillRadio(radio, value) {
    const name = radio.name;
    if (!name) return false;
    
    const radios = document.querySelectorAll(`input[type="radio"][name="${name}"]`);
    const valueLower = value.toLowerCase();
    
    for (const r of radios) {
      const label = this.getFieldLabel(r);
      if (r.value === value || label.toLowerCase().includes(valueLower)) {
        r.checked = true;
        r.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }
    
    return false;
  }

  // Attempt to find and click submit button
  async attemptSubmit() {
    const submitButtons = this.findSubmitButtons();
    
    if (submitButtons.length > 0) {
      // Wait a bit for any validation
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Click the first submit button
      submitButtons[0].click();
      return true;
    }
    
    return false;
  }

  // Find submit buttons
  findSubmitButtons() {
    const buttons = [];
    
    // Input submit buttons
    document.querySelectorAll('input[type="submit"], button[type="submit"]').forEach(btn => {
      if (btn.offsetParent) buttons.push(btn);
    });
    
    // Buttons with submit-like text
    document.querySelectorAll('button, a[role="button"]').forEach(btn => {
      if (!btn.offsetParent) return;
      
      const text = (btn.textContent || btn.value || '').toLowerCase();
      if (text.includes('submit') || text.includes('apply') || 
          text.includes('continue') || text.includes('next')) {
        buttons.push(btn);
      }
    });
    
    return buttons;
  }

  // Handle file upload (resume)
  async handleResumeUpload(fileInput, resumeData) {
    // Note: For security reasons, we can't programmatically set file input values
    // This function would need user interaction
    // We can only detect that a resume is needed and show a notification
    
    this.showNotification('⚠️ Please manually upload your resume', 'warning');
    fileInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    fileInput.style.border = '3px solid #e0561b';
    
    return false;
  }

  // Show notification to user
  showNotification(message, type = 'success') {
    const existing = document.getElementById('jobpilot-notification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.id = 'jobpilot-notification';
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${type === 'success' ? '#2f8f5b' : type === 'warning' ? '#e0561b' : '#0e5a6b'};
      color: white;
      padding: 14px 20px;
      border-radius: 8px;
      font: 600 14px system-ui, sans-serif;
      z-index: 999999;
      box-shadow: 0 4px 15px rgba(0,0,0,0.2);
      animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transition = 'opacity 0.3s';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  // Extract current job details from page
  extractJobDetails() {
    // Try to extract job information from the current page
    const job = {
      title: '',
      company: '',
      location: '',
      description: '',
      url: window.location.href
    };
    
    // LinkedIn specific
    if (window.location.host.includes('linkedin.com')) {
      job.title = document.querySelector('.job-details-jobs-unified-top-card__job-title, .t-24')?.textContent.trim() || '';
      job.company = document.querySelector('.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name')?.textContent.trim() || '';
      job.location = document.querySelector('.job-details-jobs-unified-top-card__bullet, .jobs-unified-top-card__bullet')?.textContent.trim() || '';
      job.description = document.querySelector('.jobs-description__content, .jobs-box__html-content')?.textContent.trim() || '';
    }
    
    // Naukri specific
    else if (window.location.host.includes('naukri.com')) {
      job.title = document.querySelector('.jd-header-title, h1')?.textContent.trim() || '';
      job.company = document.querySelector('.jd-header-comp-name, .comp-name')?.textContent.trim() || '';
      job.location = document.querySelector('.location, .loc')?.textContent.trim() || '';
      job.description = document.querySelector('.dang-inner-html, .job-desc')?.textContent.trim() || '';
    }
    
    // Generic
    else {
      job.title = document.querySelector('h1, .job-title, [class*="title"]')?.textContent.trim() || '';
      job.company = document.querySelector('.company, [class*="company"]')?.textContent.trim() || '';
      job.description = document.querySelector('.description, [class*="description"], main')?.textContent.trim() || '';
    }
    
    return job;
  }
}

// Make available globally
if (typeof window !== 'undefined') {
  window.FormFiller = FormFiller;
}
