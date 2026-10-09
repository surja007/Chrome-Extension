// LinkedIn Easy Apply Handler - Mimics FastApply behavior

class LinkedInHandler {
  constructor(profile) {
    this.profile = profile;
    this.currentPage = 0;
    this.maxPages = 10;
    this.phoneNumber = this.cleanPhoneNumber(profile.phone);
  }

  cleanPhoneNumber(phone) {
    if (!phone) return '';
    // Remove country code and formatting
    return phone.replace(/^\+\d{1,3}\s*/, '').replace(/[^\d]/g, '');
  }

  async fillCurrentPage() {
    // Wait for form to be ready
    await this.wait(500);
    
    let filled = 0;
    
    // Get all form fields in the modal
    const modal = document.querySelector('.jobs-easy-apply-modal') || document;
    const inputs = modal.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, select');
    
    for (const field of inputs) {
      if (field.disabled || field.readOnly) continue;
      if (!this.isVisible(field)) continue;
      
      const fieldInfo = this.analyzeField(field);
      const value = this.getValueForField(fieldInfo);
      
      if (value && await this.fillField(field, value, fieldInfo.type)) {
        filled++;
        console.log(`Filled ${fieldInfo.label}: ${value}`);
      }
    }
    
    // Handle "Save this application?" dialog if it appears
    await this.wait(500);
    await this.handleSaveDialog();
    
    return filled;
  }

  analyzeField(field) {
    const label = this.getFieldLabel(field);
    const name = field.name || field.id || '';
    const placeholder = field.placeholder || '';
    const ariaLabel = field.getAttribute('aria-label') || '';
    
    const combined = `${label} ${name} ${placeholder} ${ariaLabel}`.toLowerCase();
    
    // Determine field type
    let type = 'text';
    let key = 'unknown';
    
    if (/phone|mobile|contact.*number/i.test(combined)) {
      type = 'phone';
      key = 'phone';
    } else if (/email/i.test(combined)) {
      type = 'email';
      key = 'email';
    } else if (/first.*name/i.test(combined)) {
      type = 'text';
      key = 'firstName';
    } else if (/last.*name|surname/i.test(combined)) {
      type = 'text';
      key = 'lastName';
    } else if (/linkedin|profile.*url/i.test(combined)) {
      type = 'url';
      key = 'linkedin';
    } else if (/city|location/i.test(combined)) {
      type = 'text';
      key = 'city';
    } else if (/cover.*letter|additional.*info|why|message/i.test(combined)) {
      type = 'textarea';
      key = 'coverLetter';
    }
    
    return { type, key, label, field };
  }

  getFieldLabel(field) {
    // Try multiple methods to get label
    if (field.labels && field.labels[0]) {
      return field.labels[0].textContent.trim();
    }
    
    if (field.id) {
      const label = document.querySelector(`label[for="${field.id}"]`);
      if (label) return label.textContent.trim();
    }
    
    const parent = field.closest('.fb-dash-form-element, .artdeco-text-input, .jobs-easy-apply-form-element');
    if (parent) {
      const label = parent.querySelector('label');
      if (label) return label.textContent.trim();
    }
    
    return field.placeholder || field.name || '';
  }

  getValueForField(fieldInfo) {
    const [firstName, ...lastNameParts] = this.profile.name.split(' ');
    const lastName = lastNameParts.join(' ');
    
    const values = {
      firstName: firstName,
      lastName: lastName,
      email: this.profile.email,
      phone: this.phoneNumber,
      linkedin: this.profile.linkedin,
      city: this.profile.city,
      coverLetter: this.profile.coverLetter || `I am excited to apply for this position. With ${this.profile.experience} years of experience, I believe I would be a great fit for your team.`
    };
    
    return values[fieldInfo.key] || '';
  }

  async fillField(field, value, type) {
    try {
      // Focus the field
      field.focus();
      await this.wait(100);
      
      // Clear existing value
      field.value = '';
      
      // Set value using native setter (for React)
      const nativeSetter = Object.getOwnPropertyDescriptor(
        field.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
        'value'
      ).set;
      
      nativeSetter.call(field, value);
      
      // Trigger events
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.dispatchEvent(new Event('change', { bubbles: true }));
      
      // Type character by character for important fields (more human-like)
      if (type === 'phone' || type === 'email') {
        await this.wait(100);
        field.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
        field.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      }
      
      // Blur to trigger validation
      await this.wait(100);
      field.blur();
      
      return true;
    } catch (error) {
      console.error('Error filling field:', error);
      return false;
    }
  }

  async clickNext() {
    // Find Next/Continue/Review button (but NOT Submit or Discard buttons)
    const buttons = Array.from(document.querySelectorAll('.jobs-easy-apply-modal button, button'));
    const nextBtn = buttons.find(btn => {
      if (!this.isVisible(btn)) return false;
      const text = btn.textContent.toLowerCase().trim();
      const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
      
      // Explicitly exclude dismiss/close/discard buttons
      if (text.includes('dismiss') || text.includes('discard') || text.includes('cancel')) return false;
      if (ariaLabel.includes('dismiss') || ariaLabel.includes('discard')) return false;
      
      // Only match next/continue/review
      return text === 'next' || text === 'continue' || text === 'review' || 
             ariaLabel.includes('continue to next step') || ariaLabel.includes('review your application');
    });
    
    if (nextBtn && !nextBtn.disabled) {
      console.log('Clicking Next button:', nextBtn.textContent);
      await this.wait(500);
      nextBtn.click();
      return true;
    }
    
    return false;
  }

  async submit() {
    // Find Submit button (very specific to avoid closing modal)
    const buttons = Array.from(document.querySelectorAll('.jobs-easy-apply-modal button'));
    const submitBtn = buttons.find(btn => {
      if (!this.isVisible(btn)) return false;
      const text = btn.textContent.toLowerCase().trim();
      const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
      
      // Must contain submit but NOT dismiss/discard/cancel
      if (text.includes('dismiss') || text.includes('discard') || text.includes('cancel')) return false;
      
      return text === 'submit application' || 
             ariaLabel === 'submit application' ||
             (text === 'submit' && btn.type === 'submit');
    });
    
    if (submitBtn && !submitBtn.disabled) {
      console.log('Submitting application:', submitBtn.textContent);
      await this.wait(1000);
      submitBtn.click();
      return true;
    }
    
    return false;
  }

  async processApplication() {
    console.log('Starting LinkedIn Easy Apply automation...');
    
    for (let page = 0; page < this.maxPages; page++) {
      this.currentPage = page;
      console.log(`Processing page ${page + 1}...`);
      
      // Fill current page
      const filled = await this.fillCurrentPage();
      console.log(`Filled ${filled} fields`);
      
      await this.wait(1000);
      
      // Check if this is the last page (has Submit button)
      const hasSubmit = this.hasSubmitButton();
      
      if (hasSubmit) {
        console.log('Found submit button - this is the final page');
        const submitted = await this.submit();
        if (submitted) {
          console.log('Application submitted successfully!');
          return { success: true, pages: page + 1 };
        } else {
          console.log('Could not find submit button');
          return { success: false, reason: 'Submit button not found' };
        }
      } else {
        // Check for "Save this application?" dialog
        await this.handleSaveDialog();
        
        // Try to go to next page
        const hasNext = await this.clickNext();
        if (hasNext) {
          console.log('Moving to next page...');
          await this.wait(2000); // Wait for next page to load
        } else {
          console.log('No next button found - might be the end');
          // Try submit one more time
          await this.wait(1000);
          const submitted = await this.submit();
          if (submitted) {
            return { success: true, pages: page + 1 };
          }
          return { success: false, reason: 'Could not proceed' };
        }
      }
    }
    
    return { success: false, reason: 'Max pages reached' };
  }

  async handleSaveDialog() {
    // Check if "Save this application?" dialog is present
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return;
    
    const dialogText = dialog.textContent || '';
    if (dialogText.includes('Save this application')) {
      console.log('Save application dialog detected - clicking Save');
      
      // Find and click the "Save" button (not Discard)
      const buttons = Array.from(dialog.querySelectorAll('button'));
      const saveBtn = buttons.find(btn => {
        const text = btn.textContent.toLowerCase().trim();
        return text === 'save' && this.isVisible(btn);
      });
      
      if (saveBtn) {
        saveBtn.click();
        await this.wait(500);
        console.log('Clicked Save button');
      }
    }
  }

  hasSubmitButton() {
    const buttons = Array.from(document.querySelectorAll('.jobs-easy-apply-modal button'));
    return buttons.some(btn => {
      if (!this.isVisible(btn)) return false;
      const text = btn.textContent.toLowerCase().trim();
      const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
      
      // Exclude dismiss buttons
      if (text.includes('dismiss') || text.includes('discard')) return false;
      
      return text === 'submit application' || ariaLabel.includes('submit application');
    });
  }

  isVisible(element) {
    if (!element) return false;
    if (element.offsetParent === null) return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  }

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Make available globally
if (typeof window !== 'undefined') {
  window.LinkedInHandler = LinkedInHandler;
}
